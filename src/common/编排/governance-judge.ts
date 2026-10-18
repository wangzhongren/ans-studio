// src/common/编排/governance-judge.ts
// 治理卡判断 agent（「替我审批」/「替我决策」）的**一次性会话驱动**（编排私有 common；
// 公开入口经 `govern-session.ts` 薄再导出）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md`
// §7.1–§7.6（approved）。
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

import { readFile, stat } from "node:fs/promises";
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
import { readGovernanceLedger } from "./governance-ledger.ts";
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
 * 默认 **60s**（shell judge 仍为 15s，互不影响）。可用环境变量覆盖（正整数，非法回默认）。
 */
export const DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS = 60_000;
export const GOVERNANCE_JUDGE_TIMEOUT_ENV = "ANS_GOVERNANCE_JUDGE_TIMEOUT_MS";

/** 解析治理 judge 超时：显式选项 > 环境变量 > 默认 60s；非法（0/负/小数/非数字）回默认。 */
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

/** 超时文案的时长格式：整秒用 `Ns`，否则 `Nms`（如 `>60s` / `>30ms`）。 */
export function formatGovernanceJudgeTimeout(timeoutMs: number): string {
  return timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}
/** 默认读取预算的调用次数上限（与运行时核心 `SHELL_JUDGE_DEFAULT_BUDGET.maxCalls` 同值）。 */
const GOVERNANCE_JUDGE_MAX_REQUIRED_READS = 8;

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
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false, readPaths: [] };
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
  if (!isRecord(request)) return { reasonCode: "context-missing", reason: "判断请求形状非法，已转手动确认。" };
  if (!isGovernanceJudgeFlowId(request.flowId)) {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的 flowId，已转手动确认。" };
  }
  const derivedGroup = governanceCardGroup(request.cardKind);
  if (derivedGroup === undefined) {
    return { reasonCode: "group-mismatch", reason: "判断请求的卡种未知，已转手动确认。" };
  }
  if (request.group !== derivedGroup) {
    return { reasonCode: "group-mismatch", reason: "判断请求的分组与卡种不一致，已转手动确认。" };
  }
  if (!isRecord(request.card) || typeof request.card.title !== "string" || request.card.title.trim() === "") {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的卡片标题，已转手动确认。" };
  }
  if (request.card.kind !== "confirm" && request.card.kind !== "choice") {
    return { reasonCode: "context-missing", reason: "判断请求缺少合法的卡片种类，已转手动确认。" };
  }
  if (request.card.kind === "choice" && (!Array.isArray(request.card.options) || request.card.options.length === 0)) {
    return { reasonCode: "context-missing", reason: "判断请求的选择卡缺少 options，已转手动确认。" };
  }
  if (!isRecord(request.facts)) {
    return { reasonCode: "context-missing", reason: "判断请求缺少治理事实，已转手动确认。" };
  }
  return undefined;
}

function safeRelativePath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/");
  if (normalized === "" || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return undefined;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return normalized;
}

async function isRegularFile(projectRoot: string, rel: string): Promise<boolean> {
  try {
    const info = await stat(path.join(projectRoot, ...rel.split("/")));
    return info.isFile();
  } catch {
    return false;
  }
}

/**
 * 计算 approve 前必须实际读取的路径（评审 §5.4）：
 * 规范物证 + confirm 卡中**已存在**的目标文件（新文件不要求读，由 rubric 要求 preview 含正文）。
 * 物证缺失 ⇒ `artifact-missing`；必读超过读取预算 ⇒ `budget`（不降低门槛）。
 */
async function requiredReadPathsFor(request: GovernanceJudgeRequest): Promise<
  { ok: true; paths: string[] } | { ok: false; reasonCode: string; reason: string }
> {
  const required = requiredArtifactPaths(request);
  if (required.missing) {
    return { ok: false, reasonCode: "artifact-missing", reason: "规范物证缺失，无法核对判断，已转手动确认。" };
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    const rel = safeRelativePath(value);
    if (rel === undefined || seen.has(rel)) return;
    seen.add(rel);
    paths.push(rel);
  };
  if (request.card.kind === "confirm" && Array.isArray(request.paths) && request.paths.length > 50) {
    // 不截断后猜：候选超过逐路径复核上限 ⇒ 整卡回落（评审 §7.2 pathDecisions ≤50）。
    return { ok: false, reasonCode: "path-unverified", reason: "写盘卡候选路径超过逐路径复核上限，已转手动确认。" };
  }
  for (const artifact of required.paths) add(artifact);
  if (request.card.kind === "confirm") {
    const projectRoot = request.projectRoot;
    for (const candidate of Array.isArray(request.paths) ? request.paths : []) {
      const rel = safeRelativePath(candidate);
      if (rel !== undefined && await isRegularFile(projectRoot, rel)) add(rel);
    }
  }
  if (paths.length > GOVERNANCE_JUDGE_MAX_REQUIRED_READS) {
    return {
      ok: false,
      reasonCode: "budget",
      reason: `必读物证数量（${paths.length}）超出判断读取预算（${GOVERNANCE_JUDGE_MAX_REQUIRED_READS} 次），已转手动确认。`,
    };
  }
  return { ok: true, paths };
}

/**
 * 验收机械门槛（P6 验收观察，安全项）：只读流程单 + 账本，**不采信模型自报**。
 * 所有步骤 `done`、每个步骤都有 `dispatch.accepted`、无未结算决定/未闭环澄清、账本可读；
 * 任一不满足 ⇒ `manual`（原卡 + 说明），绝不自动验收未完成的 flow。
 */
async function verifyAcceptanceMechanics(
  request: GovernanceJudgeRequest,
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reasonCode: string; reason: string }> {
  const flowPath = request.artifacts?.flowPath;
  const rel = typeof flowPath === "string" ? safeRelativePath(flowPath) : undefined;
  if (rel === undefined) {
    return { ok: false, reasonCode: "artifact-missing", reason: "验收卡缺少流程单物证路径，已转手动确认。" };
  }
  let flowMarkdown: string;
  try {
    flowMarkdown = await readFile(path.join(projectRoot, ...rel.split("/")), "utf8");
  } catch {
    return { ok: false, reasonCode: "artifact-missing", reason: "流程单不可读，无法核对验收完成度，已转手动确认。" };
  }
  let ledger;
  try {
    ledger = await readGovernanceLedger(projectRoot);
  } catch {
    return { ok: false, reasonCode: "ledger-unavailable", reason: "治理账本不可读，无法核对验收完成度，已转手动确认。" };
  }
  return evaluateAcceptanceCompletion({
    flowMarkdown,
    facts: request.facts,
    ledgerEntries: ledger.entries,
    ledgerErrors: ledger.errors.length,
  });
}

/**
 * 新建目标文件的 preview 门槛（评审 §5.4）：confirm 卡中**尚不存在**的目标文件不进入
 * required-read（读它必然失败），改由 preview 正文核对内容；preview 为空 ⇒ manual。
 * 「内容是否足够」由 rubric 判断，本层只机械拦截空 preview。
 */
async function verifyConfirmPreview(
  request: GovernanceJudgeRequest,
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reasonCode: string; reason: string }> {
  if (request.card.kind !== "confirm") return { ok: true };
  const paths = Array.isArray(request.paths) ? request.paths : [];
  let createsNewFile = false;
  for (const candidate of paths) {
    const rel = safeRelativePath(candidate);
    if (rel === undefined) continue; // 非法路径由逐路径复核处理
    if (!(await isRegularFile(projectRoot, rel))) {
      createsNewFile = true;
      break;
    }
  }
  if (!createsNewFile) return { ok: true };
  const preview = typeof request.card.preview === "string" ? request.card.preview.trim() : "";
  if (preview === "") {
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: "新建文件的写盘确认缺少 preview 正文，无法核对将写入的内容，已转手动确认。",
    };
  }
  return { ok: true };
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

    // 必读物证在**提示之前**算好：模型必须先读它们才可能 approve（评审 §5.4）。
    const requiredRead = await requiredReadPathsFor({ ...request, projectRoot });
    if (!requiredRead.ok) {
      log.record("governance-judge.manual", {
        toolCallId: request.toolCallId,
        reasonCode: requiredRead.reasonCode,
        reason: requiredRead.reason,
        group: request.group,
        cardKind: request.cardKind,
      });
      return {
        ...manualOutcome(requiredRead.reasonCode, requiredRead.reason),
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
      };
    }

    // 写盘卡：新建目标文件必须带 preview 正文（读不存在的目标没有意义，评审 §5.4）。
    if (request.card.kind === "confirm") {
      const preview = await verifyConfirmPreview(request, projectRoot);
      if (!preview.ok) {
        log.record("governance-judge.manual", {
          toolCallId: request.toolCallId,
          reasonCode: preview.reasonCode,
          reason: preview.reason,
          group: request.group,
          cardKind: request.cardKind,
        });
        return {
          ...manualOutcome(preview.reasonCode, preview.reason),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
    }

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
          const prompt = buildGovernanceJudgePrompt(request, requiredRead.paths);
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
          ...manualOutcome("timeout", `判断超时（>${formatGovernanceJudgeTimeout(timeoutMs)}），已转手动确认。`),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
      if (verdict === undefined) {
        log.record("governance-judge.parse.failed", { requestId: request.toolCallId, toolCallId: request.toolCallId, cardKind: request.cardKind });
        return {
          ...manualOutcome("parse-failed", "判断输出无法解析（缺少合法的 report_governance_judgement 结论），已转手动确认。"),
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
        };
      }
      const requiredArtifacts = requiredArtifactPaths(request);
      const outcome = evaluateGovernanceJudgeVerdict({
        request,
        verdict,
        stats,
        requiredReadPaths: requiredRead.paths,
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
      const reason = `判断会话不可用：${errText(result.error)}。已转手动确认。`;
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
        ...manualOutcome("unavailable", "判断 agent 正忙（已有一次判断在进行），本次已转手动确认。"),
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
        ...manualOutcome("unavailable", `判断异常：${errText(error)}。已转手动确认。`),
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
