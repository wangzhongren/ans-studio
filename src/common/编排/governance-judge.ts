// src/common/编排/governance-judge.ts
// 治理卡判断 agent（「替我审批」/「替我决策」）的**一次性会话驱动**（编排私有 common；
// 公开入口经 `govern-session.ts` 薄再导出）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md`
// §7.1–§7.6（approved）；2026-10-19 客户定位修正：**decision 组（proposal/appointment/acceptance）
// 只判断决策是否偏离客户已确认的意图**，工程质量/架构章节/测试覆盖/证据充分性由 Draft/Proof 的工作流
// 与验收负责（见 `governance-judge-intent.ts` 与证据包 `intent` 段）。
//
// 职责（**只有驱动**）：
//   · 三引擎支持矩阵（Claude / Pi / Codex 同期；demo 或未配置 → manual/unsupported-engine）；
//   · 用与请求会话同一份 runtimeOptions 建**判断专用**适配器：`persistSession:false`、注入只读
//     `governanceJudge` 能力（运行时核心据此走 `buildGovernanceJudgeTools`）、deny-all 写门禁；
//   · 合成判断角色（空边界、系统提示来自 `governance-judge-prompt.ts`）、提示一次、等 settled；
//   · 独立 15s 硬超时（`AbortSignal.any`）、中止、迟到 bindRole 的 dispose；
//   · 每会话闭包一个 `busy` 标记（已有判断在跑时第二张直接 manual/unavailable，不排队、不并发）；
//   · **不做防循环计数**（治理卡每张只判断一次；manual 后角色阻塞等客户，不存在同卡重试环）；
//   · 裁决规范化 + required-read + 逐路径机械复核（`governance-judge-verdict.ts`）；
//   · 所有失败一律归 `GovernanceJudgeOutcome{verdict:"manual"}`，本函数**不抛错**。
//
// 本文件**不 import 适配器私有实现**；默认适配器工厂用动态 import 取 Pipeline 的
// `createRuntimeAdapterFactory`（与请求会话同一份 runtimeOptions），测试注入假 `createAdapter`。
// 判断会话**不写盘、不写聊天、不写角色状态**。

import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  DiagnosticLog,
  GovernanceJudgeAudit,
  GovernanceJudgeFn,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
  GovernanceJudgeToolOptions,
  RoleSession,
  RuntimeAdapter,
  RuntimeKind,
  ShellJudgeReadStats,
  WriteGate,
} from "../../model/runtime.ts";
import type { ProjectConfig, ResolvedRole } from "../../model/role.ts";
import { governanceCardGroup } from "../../model/runtime.ts";
import type { RuntimeAdapterFactory, RuntimeAdapterFactoryOptions } from "../../pipeline/orchestration/run-role.ts";
import { RUNTIME_KINDS } from "../shared/runtime-shared.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import { buildGovernanceJudgePrompt, buildGovernanceJudgeSystemPrompt } from "./governance-judge-prompt.ts";
import { evaluateAcceptanceCompletion, requiredArtifactPaths, isGovernanceJudgeFlowId } from "./governance-judge-facts.ts";
import { buildDecisionEvidencePacket, safeProjectRelativePath, verifyEvidenceHashes } from "./governance-judge-evidence.ts";
import { readGovernanceLedger } from "./governance-ledger.ts";
import { evaluateFlowCompletion, parseFlowStateYaml } from "./flow-state.ts";
import {
  boundedGovernanceJudgeAudit,
  evaluateGovernanceJudgeVerdict,
  governanceJudgeAuditFromOutcome,
  normalizeGovernanceJudgeVerdict,
  type NormalizedGovernanceJudgeVerdict,
} from "./governance-judge-verdict.ts";
import { redactJudgeText } from "./shell-judge-verdict.ts";

/** 判断 agent 的合成角色 id（不落项目、不出现在角色列表、不写聊天）。 */
export const GOVERNANCE_JUDGE_ROLE_ID = "governance-judge";
/**
 * 判断硬超时（2026-10-18 真机修复）：治理判断要读提案/契约/账本/流程，15s 过短；
 * 复杂项目 60s 仍不足 ⇒ 默认 **120s**（shell judge 仍为 15s，互不影响）。
 * 可用环境变量覆盖（正整数，非法回默认）。
 */
export const DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS = 120_000;
export const GOVERNANCE_JUDGE_TIMEOUT_ENV = "ANS_GOVERNANCE_JUDGE_TIMEOUT_MS";

/** 解析治理 judge 超时：显式选项 > 环境变量 > 默认 120s；非法（0/负/小数/非数字）回默认。 */
export function resolveGovernanceJudgeTimeoutMs(
  option: unknown,
  env: Record<string, string | undefined> = process.env,
): number {
  if (typeof option === "number" && Number.isFinite(option) && option > 0) return Math.floor(option);
  const raw = env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS;
}

/** 超时文案的时长格式：整秒用 `Ns`，否则 `Nms`（如 `>120s` / `>30ms`）。 */
export function formatGovernanceJudgeTimeout(timeoutMs: number): string {
  return timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}
/** 支持判断的引擎（三引擎同期；demo 不在内）。 */
export const GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>([
  "claude",
  "pi",
  "codex",
]);

export interface CreateGovernanceJudgeOptions {
  /** 装配注入的 project（项目根/技能根）。 */
  project: ProjectConfig;
  /** 请求会话的引擎（判断跟随请求会话，不跨引擎）。 */
  runtime: RuntimeKind;
  /** 与请求会话**同一份**运行时选项（模型/配置跟随）。 */
  runtimeOptions?: RuntimeAdapterFactoryOptions;
  /** 测试注入：缺省用 `createRuntimeAdapterFactory(project, runtime, runtimeOptions)`。 */
  createAdapter?: RuntimeAdapterFactory;
  /** 测试/宿主注入时钟（毫秒）。 */
  now?: () => number;
  /** 判断硬超时；缺省 15000ms。 */
  timeoutMs?: number;
  logger?: DiagnosticLog;
}

type JudgeRunResult = { kind: "settled" } | { kind: "error"; error: unknown };

const DENY_ALL_GATE: WriteGate = () => ({
  allowed: false,
  reason: "判断 agent 只读：写门禁 deny-all",
  allowedByRoot: { skill: [], project: [] },
});

function judgeRole(): ResolvedRole {
  return {
    id: GOVERNANCE_JUDGE_ROLE_ID,
    kind: "project",
    cardText: buildGovernanceJudgeSystemPrompt(),
    boundary: {
      entries: [],
      boundarySource: GOVERNANCE_JUDGE_ROLE_ID,
      acceptance: { accepted: true, source: GOVERNANCE_JUDGE_ROLE_ID },
    },
    boundarySource: GOVERNANCE_JUDGE_ROLE_ID,
    location: { card: "", boundary: "" },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false, readPaths: [], deniedPaths: [] };
}

function modelFromOptions(options?: RuntimeAdapterFactoryOptions): string | undefined {
  const value = (options as { modelId?: unknown } | undefined)?.modelId;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manualOutcome(reasonCode: string, reason: string): GovernanceJudgeOutcome {
  return {
    verdict: "manual",
    group: "decision",
    cardKind: "proposal",
    reasonCode,
    reason: redactJudgeText(reason),
    engine: "demo",
  };
}

/** 上下文校验：缺 flowId/卡片形状 → manual（评审 §5.1：flowId 必须合法，否则 manual）。 */
function contextProblem(request: GovernanceJudgeRequest): { reasonCode: string; reason: string } | undefined {
  if (!isRecord(request)) return { reasonCode: "context-missing", reason: "判断请求形状非法；请修正后重新提交。" };
  if (!isGovernanceJudgeFlowId(request.flowId)) {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的 flowId；请修正后重新提交。" };
  }
  const derivedGroup = governanceCardGroup(request.cardKind);
  if (derivedGroup === undefined) {
    return { reasonCode: "group-mismatch", reason: "判断请求的卡种未知；请修正后重新提交。" };
  }
  if (request.group !== derivedGroup) {
    return { reasonCode: "group-mismatch", reason: "判断请求的分组与卡种不一致；请修正后重新提交。" };
  }
  if (!isRecord(request.card) || typeof request.card.title !== "string" || request.card.title.trim() === "") {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的卡片标题；请修正后重新提交。" };
  }
  if (request.card.kind !== "confirm" && request.card.kind !== "choice") {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的卡片种类；请修正后重新提交。" };
  }
  if (request.card.kind === "choice" && (!Array.isArray(request.card.options) || request.card.options.length === 0)) {
    return { reasonCode: "context-missing", reason: "判断请求的选择卡缺少 options；请修正后重新提交。" };
  }
  if (!isRecord(request.facts)) {
    return { reasonCode: "context-missing", reason: "判断请求缺少治理事实；请修正后重新提交。" };
  }
  return undefined;
}

type RiskTier = "T0" | "T1" | "T2" | "T3";
const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = { T0: 0, T1: 1, T2: 2, T3: 3 };
/** 验收报告首行五项标签（方案 §7.4；缺一即 insufficient-evidence，不 auto-approve）。 */
const REPORT_FIRST_LINE_LABELS = ["风险档位", "判定依据", "选定检查", "复用证据", "全量回归"] as const;

function firstNonEmptyLine(text: string): string {
  return text.replace(/\r\n/g, "\n").split("\n").find((line) => line.trim() !== "") ?? "";
}

function parseRiskTierToken(text: string | undefined): RiskTier | undefined {
  if (typeof text !== "string") return undefined;
  const match = /(?:^|[^A-Za-z0-9])(T[0-3])(?:[^A-Za-z0-9]|$)/.exec(text);
  return match === null ? undefined : (match[1] as RiskTier);
}

function frontmatterOf(text: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return match === null ? undefined : match[1];
}

function frontmatterFlowIdOf(text: string): string | undefined {
  const frontmatter = frontmatterOf(text);
  if (frontmatter === undefined) return undefined;
  const match = /^\s*flowId\s*:\s*(.+?)\s*$/m.exec(frontmatter);
  return match === null ? undefined : match[1]!.trim().replace(/^["'`]|["'`]$/g, "");
}

function frontmatterRiskTierOf(text: string): RiskTier | undefined {
  const frontmatter = frontmatterOf(text);
  if (frontmatter === undefined) return undefined;
  const match = /^\s*riskTier\s*:\s*(T[0-3])\s*$/m.exec(frontmatter);
  return match === null ? undefined : (match[1] as RiskTier);
}

/** 文件名是否 `<flowId>-<kind>-vN.md`（kind: criteria/report/change）。 */
function artifactFileNameMatches(rel: string, flowId: string, kind: "criteria" | "report" | "change"): boolean {
  const base = rel.split("/").pop() ?? "";
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}-${kind}-v\\d+\\.md$`).test(base);
}

/**
 * 验收卡第 3 项机械门槛（2026-10-22，方案 §7.6）：不靠模型自报，只读盘面——
 *   · 实施前标准存在、可读、flowId 一致（文件名或 frontmatter）；
 *   · 验收报告存在、可读，**首行含五项标签**（风险档位/判定依据/选定检查/复用证据/全量回归）；
 *   · 变更包存在、可读且 frontmatter 有 `riskTier`；
 *   · 报告档位**不低于**变更包档位（Verifier 可升档，不可降档）。
 * 缺失/不一致 ⇒ `insufficient-evidence`（driver 落 manual，不 auto-approve）。
 */
async function verifyAcceptanceArtifacts(
  request: GovernanceJudgeRequest,
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reasonCode: string; reason: string }> {
  const readArtifact = async (
    raw: string | undefined,
    label: string,
    kind: "criteria" | "report" | "change",
  ): Promise<{ ok: true; rel: string; text: string } | { ok: false; reasonCode: string; reason: string }> => {
    const rel = typeof raw === "string" ? safeProjectRelativePath(raw) : undefined;
    if (rel === undefined) {
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `验收卡缺少${label}物证路径；请补齐后重新提交验收（不把「待补」当通过）。`,
      };
    }
    let text: string;
    try {
      text = await readFile(path.join(projectRoot, ...rel.split("/")), "utf8");
    } catch {
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `${label}不可读（${rel}）；请补齐后重新提交验收。`,
      };
    }
    const frontmatterFlowId = frontmatterFlowIdOf(text);
    const flowIdOk = frontmatterFlowId !== undefined
      ? frontmatterFlowId === request.flowId
      : artifactFileNameMatches(rel, request.flowId, kind);
    if (!flowIdOk) {
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `${label}的 flowId 与卡片不一致（文件 ${rel}，卡片 ${request.flowId}）；请修正后重新提交验收。`,
      };
    }
    return { ok: true, rel, text };
  };

  const criteria = await readArtifact(request.artifacts?.acceptanceCriteriaPath, "实施前验收标准", "criteria");
  if (!criteria.ok) return criteria;

  const report = await readArtifact(request.artifacts?.acceptanceReportPath, "验收报告", "report");
  if (!report.ok) return report;
  const firstLine = firstNonEmptyLine(report.text);
  const missingLabels = REPORT_FIRST_LINE_LABELS.filter((label) => !firstLine.includes(label));
  if (missingLabels.length > 0) {
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: `验收报告首行缺少五项中的：${missingLabels.join("、")}（应为「风险档位｜判定依据｜选定检查｜复用证据｜全量回归」）；请按模板重写报告后重新提交验收。`,
    };
  }
  const reportTier = parseRiskTierToken(/风险档位\s*[:：]\s*([^｜|]+)/.exec(firstLine)?.[1]);
  if (reportTier === undefined) {
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: "验收报告首行未给出可识别的风险档位（T0–T3）；请修正报告后重新提交验收。",
    };
  }

  const changePackage = await readArtifact(request.artifacts?.changePackagePath, "变更包", "change");
  if (!changePackage.ok) return changePackage;
  const changeTier = frontmatterRiskTierOf(changePackage.text);
  if (changeTier === undefined) {
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: `变更包 ${changePackage.rel} frontmatter 缺少 riskTier（T0–T3）；请补齐后重新提交验收。`,
    };
  }
  if (RISK_TIER_RANK[reportTier] < RISK_TIER_RANK[changeTier]) {
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason:
        `验收报告档位 ${reportTier} 低于变更包档位 ${changeTier}；` +
        "Verifier 可以升档、不能降档；请按不低于变更包的档位补充证据后重新提交验收。",
    };
  }
  return { ok: true };
}

/**
 * 验收机械门槛（P6 验收观察，安全项）：只读流程状态 + 账本 + 标准/报告/变更包，**不采信模型自报**。
 *
 * 2026-10-19 Flow YAML 契约（客户「这些全部改成yaml」）：流程物证是 `docs/flows/<flowId>.yaml` 时，
 * 用 **YAML 契约**判定——`parseFlowStateYaml` 校验文档，`evaluateFlowCompletion` 按显式 `kind`
 * 对账账本证据（不再按 stepId 前缀猜）。YAML 不合法 / 未通过收尾门 ⇒ `manual`。
 * 旧版 `.md` 流程单保留原 Markdown 判定（迁移兼容）。
 * 2026-10-22：在流程收尾门之外追加 `verifyAcceptanceArtifacts`（标准/报告/档位）。
 */
async function verifyAcceptanceMechanics(
  request: GovernanceJudgeRequest,
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reasonCode: string; reason: string }> {
  const flowPath = request.artifacts?.flowPath;
  const rel = typeof flowPath === "string" ? safeProjectRelativePath(flowPath) : undefined;
  if (rel === undefined) {
    return { ok: false, reasonCode: "artifact-missing", reason: "验收卡缺少流程状态物证路径；请补齐流程状态路径后重新提交验收。" };
  }
  let flowText: string;
  try {
    flowText = await readFile(path.join(projectRoot, ...rel.split("/")), "utf8");
  } catch {
    return { ok: false, reasonCode: "artifact-missing", reason: "流程状态不可读，无法核对验收完成度；请补齐可读流程状态后重新提交验收。" };
  }
  let ledger;
  try {
    ledger = await readGovernanceLedger(projectRoot);
  } catch {
    return { ok: false, reasonCode: "ledger-unavailable", reason: "治理账本不可读，无法核对验收完成度；请修复账本后重新提交验收。" };
  }

  // 2026-10-22（第 3 项）：标准/报告/变更包与档位门槛（与流程格式无关）。
  const artifacts = await verifyAcceptanceArtifacts(request, projectRoot);
  if (!artifacts.ok) return artifacts;

  if (/\.ya?ml$/i.test(rel)) {
    // flowId 以**文件名**为准（契约规则 1）；并核对卡片 flowId，防止用别的流程状态验收本流程。
    const fileName = rel.split("/").pop() ?? "";
    const fileFlowId = fileName.replace(/\.ya?ml$/i, "");
    if (!isGovernanceJudgeFlowId(fileFlowId) || fileFlowId !== request.flowId) {
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `流程 YAML 路径与卡片 flowId 不一致（文件 ${rel}，卡片 ${request.flowId}）；请修正流程状态路径后重新提交验收。`,
      };
    }
    const parsed = parseFlowStateYaml(flowText, fileFlowId);
    if (!parsed.ok) {
      const detail = parsed.errors.slice(0, 8).map((error) => `${error.path}: ${error.message}`).join("；");
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `流程 YAML 校验失败（${rel}）：${detail}；请修正流程状态 YAML 后重新提交验收。`,
      };
    }
    if (ledger.errors.length > 0) {
      return { ok: false, reasonCode: "ledger-unavailable", reason: "治理账本不可读或存在坏行，无法核对验收完成度；请修复账本后重新提交验收。" };
    }
    const completion = evaluateFlowCompletion(parsed.flow, ledger.entries);
    if (!completion.ready) {
      return {
        ok: false,
        reasonCode: "insufficient-evidence",
        reason: `流程未通过收尾门（${rel}）：${completion.issues.slice(0, 8).join("；")}；请补齐流程步骤/证据后重新提交验收。`,
      };
    }
    return { ok: true };
  }

  return evaluateAcceptanceCompletion({
    flowMarkdown: flowText,
    facts: request.facts,
    ledgerEntries: ledger.entries,
    ledgerErrors: ledger.errors.length,
  });
}

/** 解析降级路径：最后一条 message 必须是**纯 JSON 对象**（可去代码围栏）；夹带解释/多个 JSON → undefined。 */
function parseMessageVerdict(summary: string): NormalizedGovernanceJudgeVerdict | undefined {
  let text = summary.trim();
  if (text === "" || text.startsWith("用户指令：")) return undefined;
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced !== null) text = fenced[1]!.trim();
  if (!text.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return normalizeGovernanceJudgeVerdict(parsed);
}

/**
 * 构造 `GovernanceJudgeFn`。返回的函数**不抛错**；所有失败归 `manual`（reasonCode 见评审 §7.2）。
 */
export function createGovernanceJudge(opts: CreateGovernanceJudgeOptions): GovernanceJudgeFn {
  const log = opts.logger ?? createDiagnosticLogger({ component: "orchestration.governance-judge", projectRoot: opts.project.projectRoot });
  const now = opts.now ?? (() => Date.now());
  const timeoutMs = resolveGovernanceJudgeTimeoutMs(opts.timeoutMs);
  const model = modelFromOptions(opts.runtimeOptions);
  let busy = false;

  async function defaultFactory(runtime: RuntimeKind): Promise<RuntimeAdapterFactory> {
    const module = await import("../../pipeline/orchestration/run-role.ts");
    return module.createRuntimeAdapterFactory(opts.project, runtime, opts.runtimeOptions);
  }

  async function runJudgement(request: GovernanceJudgeRequest, signal: AbortSignal | undefined): Promise<GovernanceJudgeOutcome> {
    const startedAt = now();
    const stats = emptyStats();
    const reports: unknown[] = [];
    const projectRoot = typeof request.projectRoot === "string" && request.projectRoot.trim() !== ""
      ? request.projectRoot.trim()
      : opts.project.projectRoot;
    const toolOptions: GovernanceJudgeToolOptions = {
      projectRoot,
      report: (raw: unknown) => { reports.push(raw); },
      stats,
    };
    const role = judgeRole();
    let lastMessage = "";
    let session: RoleSession | undefined;
    let disposed = false;
    let stopped = false;

    const disposeSession = async (): Promise<void> => {
      const active = session;
      if (active === undefined || disposed) return;
      disposed = true;
      try {
        await active.dispose();
      } catch {
        // dispose 失败不改变判定（会话已不可用）；不外抛。
      }
    };
    const abortActiveSession = (): void => {
      const active = session;
      if (active === undefined) return;
      try {
        const result = active.abort?.();
        if (result !== undefined && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<unknown>).catch(() => {});
        }
      } catch {
        // abort 失败不改变判定。
      }
      void disposeSession();
    };

    log.record("governance-judge.started", {
      requestId: request.toolCallId ?? "governance-judge",
      toolCallId: request.toolCallId,
      roleId: request.roleId,
      projectRoot,
      runtime: request.runtime ?? opts.runtime,
      group: request.group,
      cardKind: request.cardKind,
      flowId: request.flowId,
    });

    // 2026-10-19 证据包（客户：「决策agent 应该是别人给摘要，他再去判断，不是所有文件给他」）：
    // 调用模型前由**确定性函数**从实际物证生成结构化、有界的 DecisionEvidencePacket。
    // 证据包缺失/关键物证不可读/路径探测失败/请求方陈述与系统事实冲突/待写正文不完整 ⇒ 直接 manual，
    // **不调用模型**（fail-closed）。模型的 required-read 收窄为证据包完整性/哈希核对所需的
    // 最小定点抽查集（0–2 条）。
    const evidence = await buildDecisionEvidencePacket({ request, projectRoot });
    if (!evidence.ok) {
      log.record("governance-judge.manual", {
        toolCallId: request.toolCallId,
        reasonCode: evidence.reasonCode,
        reason: evidence.reason,
        group: request.group,
        cardKind: request.cardKind,
      });
      return {
        ...manualOutcome(evidence.reasonCode, evidence.reason),
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
      };
    }
    const requiredReadPaths = evidence.requiredReadPaths;
    // 诊断只写白名单字段（`common/shared/diagnostics.ts`）：工具调用/证据条数/完整性。
    log.record("governance-judge.evidence", {
      toolCallId: request.toolCallId,
      count: evidence.packet.evidence.length,
      ok: evidence.packet.integrity.complete,
      ...(evidence.packet.intent !== undefined
        ? { intentId: evidence.packet.intent.intentId, intentConfirmed: evidence.packet.intent.confirmed }
        : {}),
    });

    // 验收卡：先机械核对流程完成度（不靠模型自报），未完成/阻塞/待派发/未结算 ⇒ 直接 manual。
    if (request.cardKind === "acceptance") {
      const acceptance = await verifyAcceptanceMechanics(request, projectRoot);
      if (!acceptance.ok) {
        log.record("governance-judge.manual", {
          toolCallId: request.toolCallId,
          reasonCode: acceptance.reasonCode,
          reason: acceptance.reason,
          group: request.group,
          cardKind: request.cardKind,
        });
        return {
          ...manualOutcome(acceptance.reasonCode, acceptance.reason),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
    }

    // 超时/中止：AbortController + AbortSignal.any。**计时只从模型判断开始**——此前的
    // 上下文校验/物证预检/排队与等卡均不计入（busy 在此前已直接回落）。
    const timed = new AbortController();
    const signals = signal !== undefined ? [timed.signal, signal] : [timed.signal];
    const combined = AbortSignal.any(signals);
    let abortResolve: (() => void) | undefined;
    const abortWait = new Promise<void>((resolve) => { abortResolve = resolve; });
    const onAbort = (): void => {
      stopped = true;
      abortActiveSession();
      abortResolve?.();
    };
    combined.addEventListener("abort", onAbort, { once: true });
    if (combined.aborted) onAbort();
    const timer = setTimeout(() => { timed.abort(new Error("governance-judge timeout")); }, timeoutMs);

    const run = (async (): Promise<JudgeRunResult> => {
      try {
        const factory = opts.createAdapter ?? await defaultFactory(request.runtime);
        // 判断专用适配器：**不持久化**、只读治理能力注入、deny-all 写门禁。
        const adapter: RuntimeAdapter = factory(DENY_ALL_GATE, { persistSession: false, governanceJudge: toolOptions });
        const bound = await adapter.bindRole(role);
        session = bound;
        if (stopped) {
          await disposeSession();
          return { kind: "settled" };
        }
        try {
          const prompt = buildGovernanceJudgePrompt(request, requiredReadPaths, evidence.packet);
          await bound.prompt(prompt);
          if (stopped) return { kind: "settled" };
          for await (const event of bound.events()) {
            if (event.kind === "message" && !event.summary.startsWith("用户指令：")) lastMessage = event.summary;
            if (event.kind === "settled") break;
            if (stopped) break;
          }
          return { kind: "settled" };
        } finally {
          await disposeSession();
        }
      } catch (error) {
        return { kind: "error", error };
      }
    })();

    let result: JudgeRunResult | "aborted";
    try {
      result = await Promise.race([run, abortWait.then(() => "aborted" as const)]);
    } finally {
      clearTimeout(timer);
      combined.removeEventListener("abort", onAbort);
    }

    const pickVerdict = (): NormalizedGovernanceJudgeVerdict | undefined => {
      if (reports.length > 1) log.record("governance-judge.multiple", { toolCallId: request.toolCallId, reportCount: reports.length });
      // 多次工具调用：**最后一次合法调用生效**（不因第一次非法而丢后续修正）。
      for (let index = reports.length - 1; index >= 0; index -= 1) {
        const normalized = normalizeGovernanceJudgeVerdict(reports[index]);
        if (normalized !== undefined) return normalized;
      }
      if (reports.length > 0) return undefined;
      // 工具调用缺失：降级解析最后一条 message，只接受纯 JSON 对象。
      return parseMessageVerdict(lastMessage);
    };

    const finish = async (verdict: NormalizedGovernanceJudgeVerdict | undefined, aborted: boolean): Promise<GovernanceJudgeOutcome> => {
      if (aborted && verdict === undefined) {
        log.record("governance-judge.manual", { toolCallId: request.toolCallId, reasonCode: "timeout", group: request.group, cardKind: request.cardKind });
        return {
          ...manualOutcome("timeout", `判断超时（>${formatGovernanceJudgeTimeout(timeoutMs)}）；请稍后重试或缩小提卡范围。`),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
      if (verdict === undefined) {
        log.record("governance-judge.parse.failed", { requestId: request.toolCallId, toolCallId: request.toolCallId, cardKind: request.cardKind });
        return {
          ...manualOutcome("parse-failed", "判断输出无法解析（缺少合法的 report_governance_judgement 结论）；请重试。"),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
      // 仅 approve 前复核证据哈希：判断期间任一物证/已存在目标发生变化或消失 ⇒ manual。
      // （证据包描述的是「判断时刻」的盘面；判断后再核对一次，避免拿过期证据放行。deny/manual 不需要。）
      if (verdict.verdict === "approve") {
        const hashCheck = await verifyEvidenceHashes(evidence.hashBaseline, projectRoot);
        if (!hashCheck.ok) {
          const reason = `证据哈希核对失败：${hashCheck.reason}；请重新提交确认。`;
          log.record("governance-judge.manual", {
            toolCallId: request.toolCallId,
            reasonCode: "evidence-hash-mismatch",
            reason: redactJudgeText(reason),
            group: request.group,
            cardKind: request.cardKind,
          });
          return {
            ...manualOutcome("evidence-hash-mismatch", reason),
            group: request.group,
            cardKind: request.cardKind,
            engine: request.runtime,
          };
        }
      }
      const requiredArtifacts = requiredArtifactPaths(request);
      const outcome = evaluateGovernanceJudgeVerdict({
        request,
        verdict,
        stats,
        requiredReadPaths,
        engine: request.runtime,
        model,
        durationMs: now() - startedAt,
      });
      if (outcome.verdict === "approve") {
        log.record("governance-judge.approve", {
          toolCallId: request.toolCallId,
          engine: request.runtime,
          model,
          reasonCode: outcome.reasonCode,
          group: outcome.group,
          cardKind: outcome.cardKind,
          selectedCount: outcome.value?.selected?.length ?? 0,
          pathCount: outcome.paths?.length ?? requiredArtifacts.paths.length,
          durationMs: outcome.durationMs,
          readCalls: stats.readCalls,
          readBytes: stats.readBytes,
        });
      } else if (outcome.verdict === "deny") {
        // 2026-10-19：approval 组写卡不合规且可修正 ⇒ deny 退回发起角色重做；**不记成 manual**。
        log.record("governance-judge.deny", {
          toolCallId: request.toolCallId,
          engine: request.runtime,
          model,
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          group: outcome.group,
          cardKind: outcome.cardKind,
          evidenceCount: outcome.evidence?.length ?? 0,
          durationMs: outcome.durationMs,
          readCalls: stats.readCalls,
          readBytes: stats.readBytes,
        });
      } else {
        if (outcome.reasonCode === "group-mismatch") {
          log.record("governance-judge.group.mismatch", {
            requestId: request.toolCallId,
            cardKind: request.cardKind,
            group: request.group,
          });
        }
        log.record("governance-judge.manual", {
          toolCallId: request.toolCallId,
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          group: outcome.group,
          cardKind: outcome.cardKind,
        });
      }
      return outcome;
    };

    const externalAborted = signal?.aborted === true;
    if (externalAborted) {
      log.record("governance-judge.manual", { toolCallId: request.toolCallId, reasonCode: "aborted", group: request.group, cardKind: request.cardKind });
      return {
        ...manualOutcome("aborted", "本轮已中止，判断结果不生效（交回既有中止路径）。"),
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
      };
    }
    if (result === "aborted" || stopped) {
      // 超时：只中止等待；超时前已捕获的**合法**结论仍然生效。
      return finish(pickVerdict(), true);
    }
    if (result.kind === "error") {
      const reason = `判断会话不可用：${errText(result.error)}；请稍后重试。`;
      log.record("governance-judge.manual", { toolCallId: request.toolCallId, reasonCode: "unavailable", reason: redactJudgeText(reason), group: request.group, cardKind: request.cardKind });
      return {
        ...manualOutcome("unavailable", reason),
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
      };
    }
    return finish(pickVerdict(), false);
  }

  return async (request: GovernanceJudgeRequest, signal?: AbortSignal): Promise<GovernanceJudgeOutcome> => {
    // 引擎支持矩阵（在这里，不在桌面通道；demo 诚实回落）。
    const requestRuntime = typeof request?.runtime === "string" && (RUNTIME_KINDS as readonly string[]).includes(request.runtime)
      ? request.runtime
      : opts.runtime;
    if (!GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES.has(requestRuntime)) {
      return {
        ...manualOutcome("unsupported-engine", `当前引擎（${requestRuntime}）不支持自动判断，保持手动确认。`),
        group: request?.group ?? "decision",
        cardKind: request?.cardKind ?? "proposal",
        engine: requestRuntime,
      };
    }
    const problem = contextProblem(request);
    if (problem !== undefined) {
      return {
        ...manualOutcome(problem.reasonCode, problem.reason),
        group: request?.group ?? "decision",
        cardKind: request?.cardKind ?? "proposal",
        engine: requestRuntime,
      };
    }
    if (signal?.aborted === true) {
      return {
        ...manualOutcome("aborted", "本轮已中止，判断未发生。"),
        group: request.group,
        cardKind: request.cardKind,
        engine: requestRuntime,
      };
    }
    if (busy) {
      return {
        ...manualOutcome("unavailable", "判断 agent 正忙（已有一次判断在进行）；请稍后重试。"),
        group: request.group,
        cardKind: request.cardKind,
        engine: requestRuntime,
      };
    }
    busy = true;
    try {
      return await runJudgement(
        { ...request, runtime: requestRuntime, projectRoot: request.projectRoot?.trim() || opts.project.projectRoot },
        signal,
      );
    } catch (error) {
      // 驱动层兜底：任何意外都不外抛。
      return {
        ...manualOutcome("unavailable", `判断异常：${errText(error)}；请稍后重试。`),
        group: request.group,
        cardKind: request.cardKind,
        engine: requestRuntime,
      };
    } finally {
      busy = false;
    }
  };
}

/** 由判断结果构造账本可选 `judge` 字段（只在 approve 时调用；有界）。 */
export function governanceJudgeAuditOf(outcome: GovernanceJudgeOutcome): GovernanceJudgeAudit | undefined {
  if (outcome.verdict !== "approve") return undefined;
  return boundedGovernanceJudgeAudit(governanceJudgeAuditFromOutcome(outcome));
}
