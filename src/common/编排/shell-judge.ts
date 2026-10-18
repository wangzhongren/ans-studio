// src/common/编排/shell-judge.ts
// 「替我审」判断 agent 的**一次性会话驱动**（编排私有 common；公开入口经 `govern-session.ts` 薄再导出）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_shell-auto-approve-review.md`
// §5.1–§5.3、§6.3、§6.4、§8.3–§8.5（approved，revision 2；客户 D1/D2 已拍板）。
//
// 职责（**只有驱动**）：
//   · 三引擎支持矩阵（Claude / Pi / Codex 同期；demo 或不支持 → manual/unsupported-engine）；
//   · 用与请求会话同一份 runtimeOptions 建**判断专用**适配器：`persistSession:false`、注入只读
//     `shellJudge` 能力（运行时核心据此走 `buildShellJudgeTools`）、deny-all 写门禁；
//   · 合成判断角色（空边界、系统提示来自 `shell-judge-prompt.ts`）、提示一次、等 settled；
//   · 独立 120s 硬超时（`AbortSignal.any`；2026-10-18 客户要求与治理判断一致）、中止、迟到 bindRole 的 dispose；
//   · 防循环（同命令连续 deny 上限，allow 清零、manual 不递增）；
//   · 裁决规范化（`shell-judge-verdict.ts`）、`allow` 必须无损、`deny` 始终有效、客户说明合成；
//   · **客户 D1**：`tier:"deny"` 且模型 allow → 照常 `allow`，置 `hardDenyOverride:true` 与
//     `label:"deny 档 · judge 放行"`；不转换、不拦截、不弹卡。
//
// 本文件**不 import 适配器私有实现**；默认适配器工厂用动态 import 取 Pipeline 的
// `createRuntimeAdapterFactory`（与请求会话同一份 runtimeOptions），测试注入假 `createAdapter`。
// 判断会话**不写盘、不写聊天、不写角色状态**；所有失败一律归 `ShellJudgeOutcome{verdict:"manual"}`，
// 本函数**不抛错**。

import type {
  DiagnosticLog,
  RoleSession,
  RuntimeAdapter,
  RuntimeKind,
  ShellJudgeAudit,
  ShellJudgeOutcome as CoreShellJudgeOutcome,
  ShellJudgeReadStats,
  ShellJudgeRequest,
  ShellJudgeToolOptions,
  ShellJudgeVerdict,
  WriteGate,
} from "../../model/runtime.ts";
import type { ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { RuntimeAdapterFactory, RuntimeAdapterFactoryOptions } from "../../pipeline/orchestration/run-role.ts";
import { RUNTIME_KINDS } from "../shared/runtime-shared.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import { buildShellJudgePrompt, buildShellJudgeSystemPrompt, SHELL_JUDGE_ARGV_LIMIT, SHELL_JUDGE_COMMAND_LIMIT_BYTES } from "./shell-judge-prompt.ts";
import {
  normalizeShellJudgeVerdict,
  redactJudgeText,
  redactJudgeVerdict,
  synthesizeCustomerMessage,
} from "./shell-judge-verdict.ts";

/** 判断 agent 的合成角色 id（不落项目、不出现在角色列表、不写聊天）。 */
export const SHELL_JUDGE_ROLE_ID = "shell-judge";
/** 客户 D1：deny 档被 judge 放行时的审计/聊天行标记（逐字）。 */
export const SHELL_JUDGE_DENY_TIER_LABEL = "deny 档 · judge 放行" as const;
/**
 * 默认判断硬超时（2026-10-18 客户要求：与治理判断一致 ⇒ **120s**）。
 * 环境变量 `ANS_SHELL_JUDGE_TIMEOUT_MS`（正整数，非法回默认）可覆盖；shell 执行时限不变。
 */
export const DEFAULT_SHELL_JUDGE_TIMEOUT_MS = 120_000;
export const SHELL_JUDGE_TIMEOUT_ENV = "ANS_SHELL_JUDGE_TIMEOUT_MS";

/** 解析 shell judge 超时：显式选项 > 环境变量 > 默认 120s；非法回默认。 */
export function resolveShellJudgeTimeoutMs(
  option: unknown,
  env: Record<string, string | undefined> = process.env,
): number {
  if (typeof option === "number" && Number.isFinite(option) && option > 0) return Math.floor(option);
  const raw = env[SHELL_JUDGE_TIMEOUT_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SHELL_JUDGE_TIMEOUT_MS;
}

/** 超时文案的时长格式：整秒用 `Ns`，否则 `Nms`（如 `>120s` / `>25ms`）。 */
export function formatShellJudgeTimeout(timeoutMs: number): string {
  return timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}
/** 默认同一命令连续 deny 上限（PM 评审 §8.5）。 */
export const DEFAULT_SHELL_JUDGE_MAX_DENY_PER_COMMAND = 2;

/** 支持判断的引擎（客户 D2：三引擎同期；demo 不在内）。 */
export const SHELL_JUDGE_SUPPORTED_RUNTIMES: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>(["claude", "pi", "codex"]);

/**
 * 判断结果（对中立契约的最小扩展，客户 D1）：
 * `hardDenyOverride`/`label` 只在 judge 放行 su `deny` 档时出现；运行时核心的
 * `ShellJudgeOutcome` 尚未携带这两字段（本角色边界内不改契约家），故在此扩展并导出给桌面消费。
 */
export interface ShellJudgeOutcome extends CoreShellJudgeOutcome {
  /** 客户 D1：模型推翻了硬拒类（`tier:"deny"` 且放行）。 */
  hardDenyOverride?: true;
  /** 客户 D1：人工可读标记；仅 `hardDenyOverride` 时出现。 */
  label?: typeof SHELL_JUDGE_DENY_TIER_LABEL;
}

/** 判断函数（返回扩展后的 outcome；对中立 `ShellJudgeFn` 结构兼容）。 */
export type ShellJudgeFn = (input: ShellJudgeRequest, signal?: AbortSignal) => Promise<ShellJudgeOutcome>;

export interface CreateShellJudgeOptions {
  /** 装配注入的 project（项目根/技能根）。 */
  project: ProjectConfig;
  /** 请求会话的引擎（判断跟随请求会话，不跨引擎）。 */
  runtime: RuntimeKind;
  /** 与请求会话**同一份**运行时选项（模型/配置跟随，D4）。 */
  runtimeOptions?: RuntimeAdapterFactoryOptions;
  /** 测试注入：缺省用 `createRuntimeAdapterFactory(project, runtime, runtimeOptions)`。 */
  createAdapter?: RuntimeAdapterFactory;
  /** 测试/宿主注入时钟（毫秒）。 */
  now?: () => number;
  /** 判断硬超时；缺省 120000ms（env `ANS_SHELL_JUDGE_TIMEOUT_MS` 可覆盖）。 */
  timeoutMs?: number;
  /** 同一命令连续 deny 上限；缺省 2。 */
  maxDenyPerCommand?: number;
  logger?: DiagnosticLog;
}

type JudgeRunResult =
  | { kind: "settled" }
  | { kind: "error"; error: unknown };

const DENY_ALL_GATE: WriteGate = () => ({
  allowed: false,
  reason: "判断 agent 只读：写门禁 deny-all",
  allowedByRoot: { skill: [], project: [] },
});

function judgeRole(): ResolvedRole {
  return {
    id: SHELL_JUDGE_ROLE_ID,
    kind: "project",
    cardText: buildShellJudgeSystemPrompt(),
    boundary: {
      entries: [],
      boundarySource: SHELL_JUDGE_ROLE_ID,
      acceptance: { accepted: true, source: SHELL_JUDGE_ROLE_ID },
    },
    boundarySource: SHELL_JUDGE_ROLE_ID,
    location: { card: "", boundary: "" },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeCommandKey(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function emptyStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

/**
 * 读取损伤 → reasonCode（`allow` 必须无损；`deny` 不受影响）。
 *
 * 判定顺序钉死（测试角色独立验收第 9 次读取缺陷）：**预算优先**。运行时核心在预算耗尽时
 * 会把本次读取同时计入 `deniedReads` 并置 `budgetExceeded`——若先看 `deniedReads` 会把
 * 「判断预算耗尽」误报成「文件不可读（read-denied）」。故以 `budgetExceeded` 为准，
 * **不依赖单次读取的错误码**；其次截断，最后才是真正的拒绝（敏感/越界/二进制）。
 */
function damageCode(stats: ShellJudgeReadStats): string | undefined {
  if (stats.budgetExceeded) return "budget";
  if (stats.truncatedReads > 0) return "read-truncated";
  if (stats.deniedReads > 0) return "read-denied";
  return undefined;
}

function manualOutcome(reasonCode: string, reason: string): ShellJudgeOutcome {
  return { verdict: "manual", reasonCode, reason: redactJudgeText(reason) };
}

/** 解析降级路径：最后一条 message 必须是**纯 JSON 对象**（可去代码围栏）；夹带解释/多个 JSON → undefined。 */
function parseMessageVerdict(summary: string): ShellJudgeVerdict | undefined {
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
  return normalizeShellJudgeVerdict(parsed);
}

function modelFromOptions(options?: RuntimeAdapterFactoryOptions): string | undefined {
  const value = (options as { modelId?: unknown } | undefined)?.modelId;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * 构造 `ShellJudgeFn`。返回的函数**不抛错**；所有失败归 `manual`（reasonCode 见 PM 评审 §6.4）。
 */
export function createShellJudge(opts: CreateShellJudgeOptions): ShellJudgeFn {
  const log = opts.logger ?? createDiagnosticLogger({ component: "orchestration.shell-judge", projectRoot: opts.project.projectRoot });
  const now = opts.now ?? (() => Date.now());
  const timeoutMs = resolveShellJudgeTimeoutMs(opts.timeoutMs);
  const maxDenyPerCommand = typeof opts.maxDenyPerCommand === "number" && Number.isFinite(opts.maxDenyPerCommand) && opts.maxDenyPerCommand >= 1
    ? Math.floor(opts.maxDenyPerCommand)
    : DEFAULT_SHELL_JUDGE_MAX_DENY_PER_COMMAND;
  const model = modelFromOptions(opts.runtimeOptions);
  // 防循环计数：会话级 Map；deny +1、allow 删除、manual 不增不减（PM 评审 §8.5）。
  const denyCounts = new Map<string, number>();
  let busy = false;

  async function defaultFactory(runtime: RuntimeKind): Promise<RuntimeAdapterFactory> {
    const module = await import("../../pipeline/orchestration/run-role.ts");
    return module.createRuntimeAdapterFactory(opts.project, runtime, opts.runtimeOptions);
  }

  async function runJudgement(request: ShellJudgeRequest, signal: AbortSignal | undefined): Promise<ShellJudgeOutcome> {
    const startedAt = now();
    const stats = emptyStats();
    const reports: unknown[] = [];
    const projectRoot = (typeof request.projectRoot === "string" && request.projectRoot.trim() !== ""
      ? request.projectRoot
      : opts.project.projectRoot).trim();
    const toolOptions: ShellJudgeToolOptions = {
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

    log.record("shell-judge.started", {
      toolCallId: request.toolCallId,
      roleId: request.roleId,
      projectRoot,
      runtime: request.runtime ?? opts.runtime,
    });

    // 超时/中止：AbortController + AbortSignal.any（PM 评审 §6.3）。
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
    const timer = setTimeout(() => { timed.abort(new Error("shell-judge timeout")); }, timeoutMs);

    const run = (async (): Promise<JudgeRunResult> => {
      try {
        const factory = opts.createAdapter ?? await defaultFactory(request.runtime);
        // 判断专用适配器：**不持久化**、只读能力注入、deny-all 写门禁（PM 评审 §5.2/§6.3）。
        const adapter: RuntimeAdapter = factory(DENY_ALL_GATE, { persistSession: false, shellJudge: toolOptions });
        const bound = await adapter.bindRole(role);
        session = bound;
        if (stopped) {
          await disposeSession();
          return { kind: "settled" };
        }
        try {
          await bound.prompt(buildShellJudgePrompt(request));
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

    const pickVerdict = (): ShellJudgeVerdict | undefined => {
      if (reports.length > 1) log.record("shell-judge.multiple", { toolCallId: request.toolCallId, reportCount: reports.length });
      // 多次工具调用：**最后一次合法调用生效**（不因第一次非法而丢后续修正）。
      for (let index = reports.length - 1; index >= 0; index -= 1) {
        const normalized = normalizeShellJudgeVerdict(reports[index]);
        if (normalized !== undefined) return normalized;
      }
      if (reports.length > 0) return undefined;
      // 工具调用缺失：降级解析最后一条 message，只接受纯 JSON 对象。
      return parseMessageVerdict(lastMessage);
    };

    const complete = (verdict: ShellJudgeVerdict): ShellJudgeOutcome => {
      const safe = redactJudgeVerdict(verdict);
      if (safe.verdict === "manual") {
        return {
          verdict: "manual",
          reasonCode: "model-manual",
          reason: safe.reason ?? "判断 agent 自报无法完成判断，已转手动确认。",
        };
      }
      if (safe.verdict === "allow") {
        const damage = damageCode(stats);
        if (damage !== undefined) {
          // 人话按 reasonCode 分派：预算耗尽 ≠ 文件不可读（独立验收缺陷回归）。
          const damageReason =
            damage === "budget"
              ? "判断预算耗尽（读取次数/总读取字节达上限），无法保证无损判断，已转手动确认。"
              : damage === "read-truncated"
                ? "判断所需文件被截断，无法保证无损判断，已转手动确认。"
                : "判断读取被拒（敏感文件/越界/二进制），无法保证无损判断，已转手动确认。";
          log.record("shell-judge.manual", {
            toolCallId: request.toolCallId,
            reasonCode: damage,
            reason: damageReason,
            readCalls: stats.readCalls,
            readBytes: stats.readBytes,
          });
          return {
            verdict: "manual",
            reasonCode: damage,
            reason: damageReason,
          };
        }
        denyCounts.delete(normalizeCommandKey(request.command));
        const outcome: ShellJudgeOutcome = {
          verdict: "allow",
          reason: safe.reason,
          reasonCode: "necessary",
          ...(safe.evidence !== undefined ? { evidence: safe.evidence } : {}),
          ...(model !== undefined ? { model } : {}),
        };
        // 客户 D1：deny 档 judge allow → 照常放行，只打标记（不转换、不拦截、不弹卡）。
        if (request.tier === "deny") {
          outcome.hardDenyOverride = true;
          outcome.label = SHELL_JUDGE_DENY_TIER_LABEL;
        }
        log.record("shell-judge.allow", {
          toolCallId: request.toolCallId,
          engine: request.runtime,
          model,
          tier: request.tier,
          hardDenyOverride: outcome.hardDenyOverride === true,
          ...(outcome.label !== undefined ? { label: outcome.label } : {}),
          durationMs: now() - startedAt,
          readCalls: stats.readCalls,
          readBytes: stats.readBytes,
          reasonCode: "necessary",
        });
        return outcome;
      }

      // deny：始终有效（拒绝是安全方向），不受读取损伤影响。
      const key = normalizeCommandKey(request.command);
      denyCounts.set(key, (denyCounts.get(key) ?? 0) + 1);
      const reason = safe.reason ?? "判断为不必要或未确认必要性。";
      const original = safe.customerMessage;
      const customerMessage = synthesizeCustomerMessage({ ...safe, reason });
      const synthesized = original === undefined || synthesizeCustomerMessage({ verdict: "deny", customerMessage: original }) !== original;
      log.record("shell-judge.deny", {
        toolCallId: request.toolCallId,
        engine: request.runtime,
        model,
        tier: request.tier,
        reasonCode: safe.alternative !== undefined ? "safer-alternative" : "no-alternative",
        hasAlternative: safe.alternative !== undefined,
        customerMessageSynthesized: synthesized,
        durationMs: now() - startedAt,
      });
      return {
        verdict: "deny",
        reason,
        customerMessage,
        customerMessageSynthesized: synthesized,
        reasonCode: safe.alternative !== undefined ? "safer-alternative" : "no-alternative",
        ...(safe.alternative !== undefined ? { alternative: safe.alternative } : {}),
        ...(safe.evidence !== undefined ? { evidence: safe.evidence } : {}),
        ...(model !== undefined ? { model } : {}),
      };
    };

    const externalAborted = signal?.aborted === true;
    if (externalAborted) {
      log.record("shell-judge.manual", { toolCallId: request.toolCallId, reasonCode: "aborted" });
      return manualOutcome("aborted", "本轮已中止，判断结果不生效（交回既有中止路径）。");
    }
    if (result === "aborted" || stopped) {
      // 超时：只中止等待；超时前已捕获的**合法**结论仍然生效（PM 评审 §6.3）。
      const captured = pickVerdict();
      if (captured !== undefined) return complete(captured);
      log.record("shell-judge.timeout", { toolCallId: request.toolCallId, durationMs: now() - startedAt });
      return manualOutcome("timeout", `判断超时（>${formatShellJudgeTimeout(timeoutMs)}），已转手动确认。`);
    }
    if (result.kind === "error") {
      const reason = `判断会话不可用：${errText(result.error)}。已转手动确认。`;
      log.record("shell-judge.manual", { toolCallId: request.toolCallId, reasonCode: "unavailable", reason: redactJudgeText(reason) });
      return manualOutcome("unavailable", reason);
    }

    const verdict = pickVerdict();
    if (verdict === undefined) {
      log.record("shell-judge.parse.failed", { toolCallId: request.toolCallId, reportCount: reports.length });
      return manualOutcome("parse-failed", "判断输出无法解析（缺少合法的 report_shell_judgement 结论），已转手动确认。");
    }
    return complete(verdict);
  }

  return async (request: ShellJudgeRequest, signal?: AbortSignal): Promise<ShellJudgeOutcome> => {
    // 引擎支持矩阵（在这里，不在桌面通道；demo 诚实回落）。
    const requestRuntime = typeof request?.runtime === "string" && (RUNTIME_KINDS as readonly string[]).includes(request.runtime)
      ? request.runtime
      : opts.runtime;
    if (!SHELL_JUDGE_SUPPORTED_RUNTIMES.has(requestRuntime)) {
      return manualOutcome("unsupported-engine", `当前引擎（${requestRuntime}）不支持自动判断，保持手动确认。`);
    }
    // 上下文最小集：命令/argv/项目根缺失 → context-missing。
    const command = typeof request?.command === "string" ? request.command : "";
    const projectRoot = typeof request?.projectRoot === "string" && request.projectRoot.trim() !== ""
      ? request.projectRoot
      : opts.project.projectRoot;
    if (command.trim() === "" || typeof projectRoot !== "string" || projectRoot.trim() === "" || !Array.isArray(request?.argv)) {
      return manualOutcome("context-missing", "判断所需上下文缺失（命令/argv/项目根），已转手动确认。");
    }
    // 命令/参数超上限：不截断后猜（PM 评审 §8.1）。
    if (byteLength(command) > SHELL_JUDGE_COMMAND_LIMIT_BYTES || request.argv.length > SHELL_JUDGE_ARGV_LIMIT) {
      return manualOutcome("context-too-large", "命令或参数超出判断上限（命令 >16KB 或 argv >256 项），已转手动确认。");
    }
    if (signal?.aborted === true) {
      return manualOutcome("aborted", "本轮已中止，判断未发生。");
    }
    // 防循环上限命中 → 不调用模型（PM 评审 §8.5）。
    const key = normalizeCommandKey(command);
    const denied = denyCounts.get(key) ?? 0;
    if (denied >= maxDenyPerCommand) {
      log.record("shell-judge.retry.capped", { toolCallId: request.toolCallId, count: denied });
      return manualOutcome("retry-capped", "同一命令连续被判断为不必要，已达重试上限；已转手动确认。");
    }
    if (busy) {
      return manualOutcome("unavailable", "判断 agent 正忙（已有一次判断在进行），本次已转手动确认。");
    }
    busy = true;
    try {
      return await runJudgement({ ...request, runtime: requestRuntime, projectRoot }, signal);
    } catch (error) {
      // 驱动层兜底：任何意外都不外抛。
      return manualOutcome("unavailable", `判断异常：${errText(error)}。已转手动确认。`);
    } finally {
      busy = false;
    }
  };
}

/** 审计侧扩展：契约家 `ShellJudgeAudit` 当前未含 `label`（本角色边界内不改）。 */
export interface ShellJudgeAuditWithLabel extends ShellJudgeAudit {
  label?: typeof SHELL_JUDGE_DENY_TIER_LABEL;
}

/** 由判断结果构造审计可选 `judge` 字段（只在判断 agent 自己做出 allow/deny 时调用）。 */
export function shellJudgeAuditOf(request: ShellJudgeRequest, outcome: ShellJudgeOutcome): ShellJudgeAuditWithLabel | undefined {
  if (outcome.verdict !== "allow" && outcome.verdict !== "deny") return undefined;
  const audit: ShellJudgeAuditWithLabel = {
    engine: request.runtime,
    verdict: outcome.verdict,
    reasonCode: outcome.reasonCode,
    ...(outcome.model !== undefined ? { model: outcome.model } : {}),
    tier: request.tier,
    ...(outcome.hardDenyOverride === true ? { hardDenyOverride: true as const } : {}),
    ...(outcome.label !== undefined ? { label: outcome.label } : {}),
    ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    ...(outcome.customerMessage !== undefined ? { customerMessage: outcome.customerMessage } : {}),
    ...(outcome.alternative !== undefined ? { alternative: outcome.alternative } : {}),
    ...(outcome.customerMessageSynthesized !== undefined
      ? { customerMessageSynthesized: outcome.customerMessageSynthesized }
      : {}),
  };
  return audit;
}
