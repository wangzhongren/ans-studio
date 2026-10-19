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
//   · 会话内**有界并发池**（默认 3、env 可调、夹 1..8；FIFO 等待队列 + 排队总时限；2026-10-19 真机：
//     同一轮并行 4 条 shell，单飞使 2 条立即回落手动）；
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
  JudgePathClass,
  JudgeReadCode,
  RoleSession,
  RuntimeAdapter,
  RuntimeKind,
  ShellJudgeAudit,
  ShellJudgeDeniedPath,
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

/**
 * 每个会话（每个 `createShellJudge` 闭包）内的判断并发上限。
 * 2026-10-19 真机：前端同一轮并行发出 4 条 shell，单飞使后 3 条中 2 条立即回落手动；
 * 客户倾向并发/多线程处理。环境变量 `ANS_SHELL_JUDGE_CONCURRENCY` 可覆盖；缺省 3，最终夹在 1..8。
 */
export const DEFAULT_SHELL_JUDGE_CONCURRENCY = 3;
export const SHELL_JUDGE_CONCURRENCY_ENV = "ANS_SHELL_JUDGE_CONCURRENCY";
export const SHELL_JUDGE_CONCURRENCY_MIN = 1;
export const SHELL_JUDGE_CONCURRENCY_MAX = 8;

/** 解析判断并发上限：显式选项 > 环境变量 > 默认 3；合法值夹在 1..8，非法回落默认。 */
export function resolveShellJudgeConcurrency(
  option: unknown,
  env: Record<string, string | undefined> = process.env,
): number {
  const clamp = (value: number): number =>
    Math.min(SHELL_JUDGE_CONCURRENCY_MAX, Math.max(SHELL_JUDGE_CONCURRENCY_MIN, Math.floor(value)));
  if (typeof option === "number" && Number.isFinite(option) && option >= SHELL_JUDGE_CONCURRENCY_MIN) {
    return clamp(option);
  }
  const raw = env[SHELL_JUDGE_CONCURRENCY_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed)) return clamp(parsed);
  }
  return DEFAULT_SHELL_JUDGE_CONCURRENCY;
}

/**
 * 排队总时限：达到并发上限的请求在 FIFO 队列里最多等待这么久，超时按 manual 返回具体原因。
 * 环境变量 `ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS`（正整数，非法回默认）可覆盖；默认 60s。
 */
export const DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS = 60_000;
export const SHELL_JUDGE_QUEUE_TIMEOUT_ENV = "ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS";

/** 解析排队总时限：显式选项 > 环境变量 > 默认 60s；非法回默认。 */
export function resolveShellJudgeQueueTimeoutMs(
  option: unknown,
  env: Record<string, string | undefined> = process.env,
): number {
  if (typeof option === "number" && Number.isFinite(option) && option > 0) return Math.floor(option);
  const raw = env[SHELL_JUDGE_QUEUE_TIMEOUT_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS;
}

/** 有界等待队列上限（防无界堆积）；超出即按 manual/queue-full 回落，不静默滞后。 */
export const DEFAULT_SHELL_JUDGE_MAX_QUEUE = 32;

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
  /** 本会话内判断并发上限；缺省 3（env `ANS_SHELL_JUDGE_CONCURRENCY`，夹 1..8）。 */
  concurrency?: number;
  /** 排队总时限；缺省 60000ms（env `ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS` 可覆盖）。 */
  queueTimeoutMs?: number;
  /** 有界等待队列上限；缺省 32。 */
  maxQueue?: number;
  /** 同一命令连续 deny 上限；缺省 2。 */
  maxDenyPerCommand?: number;
  logger?: DiagnosticLog;
}

type JudgeRunResult =
  | { kind: "settled" }
  | { kind: "error"; error: unknown };

/** 会话内并发池的排队结果（granted 之外的三种都必须按 manual 回落，且带具体原因）。 */
type SlotWaitResult =
  | { kind: "granted" }
  | { kind: "aborted" }
  | { kind: "queue-timeout"; activeCount: number; queueDepth: number }
  | { kind: "queue-full"; activeCount: number; queueDepth: number };

/** FIFO 等待队列项；一旦 settle 即从队列移除，保证队列长度只计真正在等的人。 */
interface QueueWaiter {
  settled: boolean;
  queuedAt: number;
  toolCallId?: string;
  resolve: (result: SlotWaitResult) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

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
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false, deniedPaths: [] };
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

/** 判断读取被拒文案前缀（桌面按此解析并显示「读取被拒：<摘要>」）。 */
export const JUDGE_READ_DENIED_PREFIX = "判断读取被拒：" as const;
/** 被拒摘要最多展示的路径条数（超出追加「等 N 个路径」）。 */
export const DENIED_READ_SUMMARY_MAX_ITEMS = 3;
/** 被拒摘要字符上限（客户反馈：卡片文案要短、要看得懂）。 */
export const DENIED_READ_SUMMARY_MAX_CHARS = 200;

/** 路径类别 → 客户可读文案（未知类别回退「受限路径」，不泄露原路径）。 */
const DENIED_PATH_CLASS_LABELS: Readonly<Record<JudgePathClass, string>> = {
  env: "环境变量文件",
  "key-material": "私钥/证书",
  credential: "凭据文件",
  "credential-dir": "凭据目录",
  vcs: "版本库元数据",
  audit: "审计目录",
  session: "会话数据",
  "app-private": "应用私有数据",
  "outside-root": "项目外路径",
  binary: "二进制文件",
  "non-regular": "非普通文件",
  budget: "读取预算",
  unknown: "受限路径",
};

/** 读取原因码 → 客户可读文案（优先于 pathClass：`not-found` 不等于「受限路径」）。 */
const DENIED_READ_CODE_LABELS: Readonly<Partial<Record<JudgeReadCode, string>>> = {
  "not-found": "路径不存在",
  "not-a-file": "路径类型不符",
  "not-a-directory": "路径类型不符",
  "read-failed": "读取失败",
  "invalid-path": "非法路径",
  empty: "空路径",
};

function deniedPathLabel(entry: ShellJudgeDeniedPath): string {
  const label = DENIED_READ_CODE_LABELS[entry.code]
    ?? DENIED_PATH_CLASS_LABELS[entry.pathClass]
    ?? DENIED_PATH_CLASS_LABELS.unknown;
  // 根外/无法安全表示时 `path` 为 ""：只显示类别，绝不回显绝对路径。
  return entry.path === "" ? label : `${entry.path}（${label}）`;
}

/**
 * 被拒读取的客户可读摘要（纯函数；编排内复用，**不跨层导出到运行时核心**）：
 * 项目相对路径 + 类别，按现有顺序最多 3 条；更多追加「等 N 个路径」；整体 ≤200 字符。
 * `deniedPaths` 为空 ⇒ `undefined`（调用方保留泛化文案，向后兼容）。
 */
export function summarizeDeniedReads(stats: ShellJudgeReadStats | undefined): string | undefined {
  const entries = stats?.deniedPaths;
  if (entries === undefined || entries.length === 0) return undefined;
  const shown = entries.slice(0, DENIED_READ_SUMMARY_MAX_ITEMS).map(deniedPathLabel);
  let summary = shown.join("、");
  if (entries.length > DENIED_READ_SUMMARY_MAX_ITEMS) {
    summary += ` 等 ${entries.length} 个路径`;
  }
  const chars = [...summary];
  if (chars.length > DENIED_READ_SUMMARY_MAX_CHARS) {
    summary = `${chars.slice(0, DENIED_READ_SUMMARY_MAX_CHARS - 1).join("")}…`;
  }
  return summary;
}

/**
 * `read-denied` 的 reason 文案：有逐路径摘要 ⇒ 列出「路径（类别）」；无摘要 ⇒ 原泛化文案。
 * shell judge 与治理 judge 共用同一口径（2026-10-18 客户反馈：手动卡要说明读不了什么）。
 */
export function readDeniedReason(stats: ShellJudgeReadStats | undefined): string {
  const summary = summarizeDeniedReads(stats);
  return summary === undefined
    ? "判断读取被拒（敏感文件/越界/二进制），无法保证无损判断，已转手动确认。"
    : `${JUDGE_READ_DENIED_PREFIX}${summary}，无法保证无损判断，已转手动确认。`;
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
  // 会话内并发池（**每个 createShellJudge 闭包各一份**，不跨角色共享）：
  // `active` 为正在判断的请求数；`waiters` 为有界 FIFO 等待队列。
  const concurrency = resolveShellJudgeConcurrency(opts.concurrency);
  const queueTimeoutMs = resolveShellJudgeQueueTimeoutMs(opts.queueTimeoutMs);
  const maxQueue = typeof opts.maxQueue === "number" && Number.isFinite(opts.maxQueue) && opts.maxQueue >= 1
    ? Math.floor(opts.maxQueue)
    : DEFAULT_SHELL_JUDGE_MAX_QUEUE;
  let active = 0;
  const waiters: QueueWaiter[] = [];

  function removeWaiter(waiter: QueueWaiter): void {
    const index = waiters.indexOf(waiter);
    if (index >= 0) waiters.splice(index, 1);
  }

  function settleWaiter(waiter: QueueWaiter, result: SlotWaitResult): void {
    if (waiter.settled) return;
    waiter.settled = true;
    clearTimeout(waiter.timer);
    if (waiter.signal !== undefined && waiter.onAbort !== undefined) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    removeWaiter(waiter);
    waiter.resolve(result);
  }

  /** 判断结束：空出的槽直接移交给队首（FIFO，`active` 不变），否则归还。 */
  function releaseSlot(): void {
    while (waiters.length > 0) {
      const waiter = waiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      clearTimeout(waiter.timer);
      if (waiter.signal !== undefined && waiter.onAbort !== undefined) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      }
      log.record("shell-judge.queue.granted", {
        toolCallId: waiter.toolCallId,
        queueDepth: waiters.length,
        durationMs: now() - waiter.queuedAt,
      });
      waiter.resolve({ kind: "granted" });
      return;
    }
    active = Math.max(0, active - 1);
  }

  /** 取槽：未达上限立即放行；达到上限进入有界 FIFO 队列；排队超时/中止返回具体原因。 */
  function acquireSlot(toolCallId: string | undefined, signal: AbortSignal | undefined): Promise<SlotWaitResult> {
    if (signal?.aborted === true) return Promise.resolve({ kind: "aborted" });
    if (active < concurrency) {
      active += 1;
      return Promise.resolve({ kind: "granted" });
    }
    if (waiters.length >= maxQueue) {
      log.record("shell-judge.queue.full", { toolCallId, queueDepth: waiters.length, count: active });
      return Promise.resolve({ kind: "queue-full", activeCount: active, queueDepth: waiters.length });
    }
    return new Promise((resolve) => {
      const queuedAt = now();
      const waiter: QueueWaiter = {
        settled: false,
        queuedAt,
        toolCallId,
        resolve,
        timer: setTimeout(() => {
          const queueDepth = Math.max(0, waiters.indexOf(waiter));
          log.record("shell-judge.queue.timeout", {
            toolCallId,
            queueDepth,
            count: active,
            timeoutMs: queueTimeoutMs,
            durationMs: now() - queuedAt,
          });
          settleWaiter(waiter, { kind: "queue-timeout", activeCount: active, queueDepth });
        }, queueTimeoutMs),
      };
      waiters.push(waiter);
      log.record("shell-judge.queued", { toolCallId, queueDepth: waiters.length, count: active });
      if (signal !== undefined) {
        waiter.signal = signal;
        waiter.onAbort = (): void => {
          settleWaiter(waiter, { kind: "aborted" });
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
        if (signal.aborted) waiter.onAbort();
      }
    });
  }

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
                : readDeniedReason(stats);
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
    // 并发池：未达上限立即判断；达到上限排队（有界 FIFO + 排队总时限），不再直接回落。
    const slot = await acquireSlot(request.toolCallId, signal);
    if (slot.kind === "aborted") {
      log.record("shell-judge.manual", { toolCallId: request.toolCallId, reasonCode: "aborted" });
      return manualOutcome("aborted", "本轮已中止，判断未开始（排队中）。");
    }
    if (slot.kind === "queue-timeout") {
      const reason = `判断排队超时（已等待 >${formatShellJudgeTimeout(queueTimeoutMs)}，仍有 ${slot.activeCount} 条判断在跑），本次已转手动确认。`;
      log.record("shell-judge.manual", { toolCallId: request.toolCallId, reasonCode: "queue-timeout", reason: redactJudgeText(reason) });
      return manualOutcome("queue-timeout", reason);
    }
    if (slot.kind === "queue-full") {
      const reason = `判断排队已满（${slot.activeCount} 条在跑、${slot.queueDepth} 条等待），本次已转手动确认。`;
      log.record("shell-judge.manual", { toolCallId: request.toolCallId, reasonCode: "queue-full", reason: redactJudgeText(reason) });
      return manualOutcome("queue-full", reason);
    }
    try {
      return await runJudgement({ ...request, runtime: requestRuntime, projectRoot }, signal);
    } catch (error) {
      // 驱动层兜底：任何意外都不外抛。
      return manualOutcome("unavailable", `判断异常：${errText(error)}。已转手动确认。`);
    } finally {
      releaseSlot();
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
