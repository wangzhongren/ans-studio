// app/desktop/watchdog.ts
// 桌面应用的**系统看护器**（G-2，2026-10-16 客户批准；设计 `2026-10-16_design_role-watchdog-and-closure.md`
// §三/§七/§九，PM 派发 W1+W3）。归属：Interface / 桌面窗口（本角色边界内）。纯逻辑 + **注入时钟/快照/投递端**，
// 不依赖 electron、不依赖 Pi SDK——可在 node 下单测（沿 `app/desktop/*.ts` 全部模块先例）。
//
// —— 看护是什么（与「永不改判定」纪律）——
// 本模块**只**做两件事：① 以 tick（默认 30s）同步读一遍**同源快照**（SessionManager 的 busy/队列/在途/
// 待确认——不造第二数据源）；② 命中异常信号（轮次到点检查 / 投递排队积压 / 命令超时 / 重复失败）时，
// 经**注入的投递端**把一条 `kind:"system"` 的系统消息交给**既有投递机**（忙排队/未开自动开/失败保留重试
// 全部复用）。
// **绝不**：写项目文件、放行任何命令/写入、改任何 gate/队列语义、替 su 决策。
// **2026-10-20 客户总原则授权的一处例外**（「我勾选了替我决策就不用我来管了」）：回合超过中止时限且该角色
// 对应自动开关开启时，看护**请求中止该回合**（经注入回调 `onTurnDeadline`，开关关闭时零变化——只告警、
// 1h 最后兜底）；自动中止 ≠ 客户批准，绝不构成任何授权/验收。
// 一切失败路径 fail-closed：看护自身故障 ⇒ 记录诊断（`watchdog.failed`）＋暂停本 tick 并等下个 tick 重试，
// 核心治理零依赖（最坏情形退化为「没有看护时的现状」）。
//
// —— 文案：**单一来源在编排**（G-2/O1）——
// 告警/恢复行/风暴护栏三类文案一律经 `src/common/编排/watchdog.ts` 的 renderer 生成（只读导入，
// 不复制第二份——与门禁引擎 su 卡文本、R1/R2 的 promptGuidelines 同口径）；本模块**只如实产出事实行**
// （时间/来源/摘要/计数——设计 §3.3「事实行由检测侧如实产出」）与队列行摘要（呈现面）。
//
// —— 去重 / 冷却 / 风暴护栏（沿 F-6 先例，`src/common/编排/shell-gate.ts` 审计失败去重形态）——
// 每个信号一个**活跃期（episode）**：同一信号活跃期内重复命中只累计计数（不重复打扰）；条件解除时投一条
// 「看护恢复」（若该活跃期确实投出过告警）；跨活跃期有冷却（#2 10min / #3 10min / #4 30min；#1 按轮次身份
// 天然每轮一次）。**风暴护栏**：全项目 15 min 窗口内告警/恢复投递 ≤ 5 条；超出投一条「看护告警已抑制 N 条」
// ＋ 诊断 `watchdog.suppressed`。去重键集合**看护自持**（本模块的 `states`），与 handback/dispatch 键隔离。
//
// —— 「正确等待」不报（§3.3）——
// 带挂起确认卡的角色（su 交互卡 / shell 卡 / 恢复卡——经注入的按角色 pending 视图）**不计入信号 #1**；
// su 自身忙（正在处理）时，**关于 su 的**任何信号都不触发（它本来就在做工）。
//
// —— 完成态收束（W3）：已移除（2026-10-18 客户新要求）——
// **验收通过即收束**：不再在项目静默 30s 后投 `[系统·收束]`，也不再维护滞回状态/静默阈值参数。

import { PROMPT_TIMEOUT_ENV, resolveRuntimeTimeouts } from "../../src/common/runtime-core/timeout.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
// G-2/O1（2026-10-16 客户批准）：看护文案的**编排单一来源**（只读导入、不复制第二份）——两类文案的文首
// 定格标记（`[系统·看护]`/`[系统·恢复]`，U1 的 tool-rows.js 归类判据）与纪律句全在彼处。
// 2026-10-18 客户新要求：**移除完成态「收束」提示**（验收通过即收束；看护不再静默 30s 后投 `[系统·收束]`）。
import {
  WATCHDOG_ALERT_PREFIX,
  renderWatchdogAlert,
  renderWatchdogRecovery,
  renderWatchdogStormGuard,
  type WatchdogSignalKind,
} from "../../src/common/编排/watchdog.ts";
import { mainT } from "./i18n.ts";

// —————————————————————— 阈值表（提案 §3.2；PM 已按默认采纳——全部常量集中于此，便于后续调参与评审） ——————————————————————

/** tick 周期（毫秒；默认 30s）。PM 裁定（2026-10-16）：tick **仅 env 可调**（不暴露设置项）。 */
export const WATCHDOG_TICK_MS = 30000;
/** tick 周期覆盖 env。 */
export const WATCHDOG_TICK_ENV = "ANS_DESKTOP_WATCHDOG_TICK_MS";
/** #1 轮次**到点检查**：有效已耗 ≥ 100% × 检查时限（默认 120s → 120s；放宽 900s → 900s）。
 *  客户裁定 2026-10-17：到点**只提示、不中止本轮**；整轮最后兜底固定 1 小时（`turnLastResortMs`）。 */
export const TURN_DEADLINE_RATIO = 1.0;
/** #2 投递排队积压：队首 age ≥ 10 min（age 优先）**或**单角色深度 ≥ 5（辅判，见设计 §八 F-2 注）。 */
export const QUEUE_HEAD_AGE_MS = 10 * 60 * 1000;
export const QUEUE_DEPTH = 5;
/** #2 冷却：10 min。 */
export const QUEUE_STUCK_COOLDOWN_MS = 10 * 60 * 1000;
/** #3 命令超时：单次即报（低频高信号）；冷却 10 min。 */
export const CMD_TIMEOUT_COOLDOWN_MS = 10 * 60 * 1000;
/** #4 重复失败：15 min 窗口内 failed/timed_out ≥ 3 次；冷却 30 min。 */
export const REPEAT_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const REPEAT_FAIL_COUNT = 3;
export const REPEAT_FAIL_COOLDOWN_MS = 30 * 60 * 1000;
/** 风暴护栏：全项目 15 min 窗口内告警/恢复投递 ≤ 5 条。 */
export const STORM_WINDOW_MS = 15 * 60 * 1000;
export const STORM_LIMIT = 5;
/**
 * **回合自动中止时限**（2026-10-21 客户要求：去掉默认 15 分钟自动关闭）。
 * 默认 **0 = 禁用**（看护只到点提示，不自动中止）；仅显式覆盖（测试）或
 * `ANS_PI_PROMPT_TIMEOUT_MS` 正整数时开启，再与运行时 `turnLastResortMs` 取较小值
 * （不得晚于最后兜底）。决策开关开启且配置了正时限时才自动中止；否则只告警。
 * 1 小时最后兜底属运行时适配器硬上限，不由此值控制。
 */
export const DEFAULT_TURN_ABORT_MS = 0;
export const TURN_ABORT_ENV = PROMPT_TIMEOUT_ENV;

// —————————————————————— 同源快照的形状（由 SessionManager 提供；看护只读，不造第二数据源） ——————————————————————

/** 一条排队投递的看护视图（同源：`deliveryQueues` 的条目）。 */
export interface WatchdogQueueItemView {
  kind: string;
  dedupKey: string;
  sourceRoleId: string;
  summary: string;
  enqueuedAtMs: number;
}

/** 一个（活会话）角色的看护视图。 */
export interface WatchdogRoleView {
  roleId: string;
  runtime: RuntimeKind;
  busy: boolean;
  /** 本轮起始时刻（ms；busy 期间才给出）——#1 的 elapsed 基准。 */
  turnStartedAt?: number;
  /** 本轮 turnId（若已 ACK）——#1 去重键的每轮身份。 */
  turnId?: string;
}

/** 一个项目的看护快照（**同源**：全部取自 SessionManager 的内存结构，读时同步、不引锁）。 */
export interface WatchdogProjectSnapshot {
  projectRoot: string;
  /**
   * 治理/回交主人角色 id（评审 §5.6：`suRoleId` → `governanceRoleId`，值=回交主人）：
   * trio = Convener（`governanceFunction === "schedule"`）；single = `primaryRoleId`（旧 su）。
   * 看护的「主人自身忙不报」「系统消息投向谁」都以它为准；未枚举到 → null。
   */
  governanceRoleId: string | null;
  /** 活会话（busy 事实的唯一来源）。 */
  roles: WatchdogRoleView[];
  /** 全部非空队列（含目标无活会话者）。 */
  queues: { targetRoleId: string; runtime: RuntimeKind; items: WatchdogQueueItemView[] }[];
  /** 在途投递数（`activeDeliveries` 本项目条目）。 */
  activeDeliveries: number;
  /** 本项目的 open/rebuild 链是否有在跑（「无在途」判据之一）。 */
  chainsActive: boolean;
  /** 三确认通道的本项目挂起确认总数（快照事实；本模块只读）。 */
  pendingConfirmationsTotal: number;
  /** 按角色的挂起确认数（#1「正确等待不报」排除用）。 */
  pendingConfirmationsByRole: Map<string, number>;
}

// —————————————————————— 事件观察（SessionManager 在事件消费循环里同步转发） ——————————————————————

/** 看护观察（由 SessionManager 在事件消费循环里捕获并转发——不另建第二套事件源）。 */
export type WatchdogObservation =
  | {
      kind: "settled";
      roleId: string;
      /** 轮次终局（四值之一；旧来源缺事实时 undefined——**不猜**，仅不计入 #4）。 */
      outcome?: string;
      at: number;
      /** 该轮由 `kind:"system"` 投递持有（看护自身的告警/回执）——**不算真实活动**（防骚扰回路）。 */
      fromSystemDelivery: boolean;
    }
  | { kind: "command-timed-out"; roleId: string; at: number }
  | {
      /** 真实活动（重新武装信号；SessionManager 判定后转发——system 投递不产生本项）。 */
      kind: "activity";
      reason: string;
    };

// —————————————————————— 事实行与呈现辅助（文案主体在编排单一来源；这边只出事实与摘要） ——————————————————————

/** 信号短标签（**仅队列行摘要**用——正文标签在编排单一来源，本表不得用于正文）。 */
/** 信号短标签（**仅队列行摘要**用——正文标签在编排单一来源，本表不得用于正文）。按当前 locale 取词。 */
function signalShortLabel(signal: WatchdogSignalKind): string {
  switch (signal) {
    case "turn-deadline": return mainT("main.watchdog.signal.turnDeadline");
    case "queue-stuck": return mainT("main.watchdog.signal.queueStuck");
    case "cmd-timeout": return mainT("main.watchdog.signal.cmdTimeout");
    case "repeat-fail": return mainT("main.watchdog.signal.repeatFail");
  }
}

/** 毫秒时长 → 人话（<60s 用「N 秒」，否则「M 分 S 秒」；事实行用）。 */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return mainT("main.watchdog.durationSeconds", { seconds: totalSeconds });
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return mainT("main.watchdog.durationMinutesSeconds", { minutes, seconds });
}

/** 时刻（ms）→ 本地 `HH:mm:ss`（事实行用；如实展示当时的钟点）。 */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 队列条目 kind → 事实行标签（#2）。 */
function queueKindLabel(kind: string): string {
  if (kind === "handback") return mainT("main.watchdog.kind.handback");
  if (kind === "dispatch") return mainT("main.watchdog.kind.dispatch");
  if (kind === "message") return mainT("shared.common.customerMessage");
  if (kind === "system") return mainT("main.watchdog.kind.system");
  return kind;
}

function shorten(text: string, n: number): string {
  const flat = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/** 恢复动作的短标签（**仅队列行摘要**用——回执正文由编排 `renderRecoveryReceipt` 渲染原始 token）。 */
export function recoveryActionLabel(action: string): string {
  if (action === "abort-turn") return mainT("shared.common.stopTurn");
  if (action === "rebuild-session") return mainT("shared.common.rebuildSession");
  if (action === "redeliver") return mainT("main.watchdog.action.redeliver");
  return action;
}

/** 恢复回执的队列行摘要（右栏「待办 / 队列」用；呈现面）。 */
export function recoveryReceiptSummary(targetRoleId: string, action: string, executed: boolean): string {
  return mainT("main.watchdog.recoveryNote", {
    action: recoveryActionLabel(action),
    roleId: targetRoleId,
    executed: executed ? mainT("main.session.executed") : mainT("main.session.notExecuted"),
  });
}

// —————————————————————— 服务本体 ——————————————————————

/** 服务向外投递的一条系统消息（投递端补上 kind:"system" 与目标 su——看护不直接触达投递机内部）。 */
export interface WatchdogOutboundMessage {
  text: string;
  summary: string;
}

export interface WatchdogConfig {
  tickMs: number;
  turnDeadlineRatio: number;
  queueHeadAgeMs: number;
  queueDepth: number;
  queueStuckCooldownMs: number;
  cmdTimeoutCooldownMs: number;
  repeatFailWindowMs: number;
  repeatFailCount: number;
  repeatFailCooldownMs: number;
  stormWindowMs: number;
  stormLimit: number;
  /** 与会话运行时**同源**的到点检查时限显式覆盖（`RuntimeAdapterFactoryOptions.promptTimeoutMs`；未设 ⇒ env/默认）。 */
  promptTimeoutOverrideMs?: number;
  /** 整轮最后兜底时限显式覆盖（生产固定 1 小时、无 env；测试注入小值用）。 */
  turnLastResortOverrideMs?: number;
  /** 时限求值用的 env（缺省 `process.env`——桌面启动时 `.env` 已载入，与会话同一份）。 */
  env?: Record<string, string | undefined>;
}

/** 从 env 解析看护配置（tick 仅 env 可调；阈值表取 §3.2 默认常量）。 */
export function resolveWatchdogConfig(env: Record<string, string | undefined> = process.env, overrides?: Partial<WatchdogConfig>): WatchdogConfig {
  const readPositive = (raw: string | undefined): number | undefined => {
    if (raw === undefined || raw.trim() === "") return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  };
  return {
    tickMs: readPositive(env[WATCHDOG_TICK_ENV]) ?? WATCHDOG_TICK_MS,
    turnDeadlineRatio: TURN_DEADLINE_RATIO,
    queueHeadAgeMs: QUEUE_HEAD_AGE_MS,
    queueDepth: QUEUE_DEPTH,
    queueStuckCooldownMs: QUEUE_STUCK_COOLDOWN_MS,
    cmdTimeoutCooldownMs: CMD_TIMEOUT_COOLDOWN_MS,
    repeatFailWindowMs: REPEAT_FAIL_WINDOW_MS,
    repeatFailCount: REPEAT_FAIL_COUNT,
    repeatFailCooldownMs: REPEAT_FAIL_COOLDOWN_MS,
    stormWindowMs: STORM_WINDOW_MS,
    stormLimit: STORM_LIMIT,
    ...overrides,
  };
}

export interface WatchdogServiceDeps {
  /** 当前需要看护的项目根集合（导入过的项目 ∪ 有过会话/队列的项目；由 Interface 组装）。 */
  projects: () => string[];
  /** 同源快照；项目未知/无内容 ⇒ undefined（本项目本 tick 跳过）。 */
  snapshot: (projectRoot: string) => WatchdogProjectSnapshot | undefined;
  /** 投递端：把系统消息交给**既有投递机**（SessionManager.watchdogDeliver——kind:"system" → su）。 */
  deliver: (projectRoot: string, message: WatchdogOutboundMessage & { dedupKey: string }) => void;
  /**
   * **自动中止回调**（2026-10-20 真机：Convener 卡 1h、队列 24）：回合超过中止时限且该角色自动开关开启时，
   * 恰对**同一 role+turnId** 调用一次（去重由看护自持）。缺省 ⇒ 不中止（旧行为零变化）。
   */
  onTurnDeadline?: (projectRoot: string, roleId: string, runtime: RuntimeKind, turnId: string) => void;
  /**
   * **按角色的自动开关**（2026-10-20）：内置治理角色 ↑「替我决策」、项目角色 ↑「替我审批」；
   * 缺省 ⇒ 恒关闭（只告警、1h 最后兜底——既有语义）。看护**不**按 builtIn/governanceFunction 排除角色。
   */
  autoRecoveryEnabled?: (projectRoot: string, roleId: string) => boolean;
  /** 时钟（注入以便单测）。 */
  now?: () => number;
  /** 配置覆盖（测试注入；生产走 env＋默认常量）。 */
  config?: Partial<WatchdogConfig>;
}

/** 看护的只读统计（`role_status` 用；全部来自看护内存态——不触盘、不改任何东西）。 */
export interface WatchdogStats {
  /** 当前活跃且**已投出告警**的信号数。 */
  activeAlerts: number;
  /** 最近一次告警实际投出时刻（ms；从未投过 ⇒ null）。 */
  lastAlertAt: number | null;
  /** 风暴护栏累计抑制数（本次运行内；诊断日志另有逐条记录）。 */
  suppressedTotal: number;
  /** 各角色**当前窗口内**（repeatFailWindowMs）的 failed/timed_out 计数。 */
  failuresByRole: Map<string, number>;
}

export interface WatchdogService {
  /** 观察一条事件（SessionManager 事件消费循环同步转发）。 */
  observe: (projectRoot: string, observation: WatchdogObservation) => void;
  /** 一次评估（同步读快照→判定→必要时投递）；start() 后由定时器驱动，测试直接调用。 */
  tick: () => void;
  /** 启动周期 tick（幂等）。 */
  start: () => void;
  /** 停止（幂等；不清理状态——重启后按新 tick 继续评估）。 */
  stop: () => void;
  /** 是否在跑（诊断/测试用）。 */
  running: () => boolean;
  /** 只读统计（role_status 的「看护」行数据面；纯读、无副作用）。 */
  stats: (projectRoot: string) => WatchdogStats;
}

/** 活跃期状态（每个去重键一条；「同一信号活跃期内重复命中只累计计数」）。 */
interface SignalState {
  active: boolean;
  alerted: boolean;
  hits: number;
  suppressed: number;
  identity?: string;
  /** 最近一次实际投出告警的时刻（跨活跃期冷却用）。 */
  lastDeliveredAt?: number;
}

interface StormState {
  times: number[];
  suppressed: number;
  noticeSent: boolean;
}

/** 即时事件型信号（#3）的轻状态：冷却 + 抑制计数（无「活跃期」/恢复行——事件无「解除」可言）。 */
interface InstantState {
  lastDeliveredAt?: number;
  suppressedSinceDelivered: number;
}

export function createWatchdogService(deps: WatchdogServiceDeps): WatchdogService {
  const config = resolveWatchdogConfig(deps.config?.env ?? process.env, deps.config);
  const now = deps.now ?? (() => Date.now());
  const states = new Map<string, SignalState>();
  const stormStates = new Map<string, StormState>();
  const failures = new Map<string, { at: number; outcome: string }[]>();
  const instantStates = new Map<string, InstantState>();
  /** 自动中止去重（2026-10-20）：`projectRoot\0roleId` → 已触发过的轮次身份（同一 role+turnId 恰一次）。 */
  const autoAbortFired = new Map<string, string>();
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const loggerFor = (projectRoot?: string) => createDiagnosticLogger({ component: "desktop.watchdog", projectRoot });

  /** 系统投递去重键（看护自持命名空间——与 handback/dispatch 键集合隔离）。 */
  const nextSystemKey = (projectRoot: string, label: string): string => `watchdog\u0000${projectRoot}\u0000${label}\u0000${++seq}`;

  // —————— #1 的时限：求值与运行时核心**单一来源同源**（resolveRuntimeTimeouts——本层不另写时长解析；
  // 只读导入先例：operator-channel.ts 的 SHELL_REVIEW_TIMEOUT_ENV）。会话运行时亦经同一函数取时限。——————
  const turnTimeouts = (runtime: RuntimeKind) =>
    resolveRuntimeTimeouts(runtime, {
      promptTimeoutMs: config.promptTimeoutOverrideMs,
      turnLastResortMs: config.turnLastResortOverrideMs,
    }, config.env ?? process.env);
  /** 到点检查时限（历史字段名 `promptTimeoutMs`；**不中止本轮**）。 */
  const turnTimeoutMs = (runtime: RuntimeKind): number => turnTimeouts(runtime).promptTimeoutMs;
  /**
   * **自动中止时限**（2026-10-21 客户要求）：显式覆盖（测试）或 env `ANS_PI_PROMPT_TIMEOUT_MS`
   * 正整数才开启；**默认 0 = 禁用**（只到点提示，不自动中止）。正时限再与运行时
   * `turnLastResortMs` 取较小值（不得晚于最后兜底）。开关关闭时不消费本值。
   */
  const turnAbortMs = (runtime: RuntimeKind): number => {
    const envRaw = (config.env ?? process.env)[TURN_ABORT_ENV];
    const envValue = envRaw !== undefined && envRaw.trim() !== "" ? Number(envRaw) : Number.NaN;
    const explicit = config.promptTimeoutOverrideMs
      ?? (Number.isFinite(envValue) && envValue > 0 ? Math.floor(envValue) : 0);
    if (!(explicit > 0)) return 0;
    return Math.min(explicit, turnTimeouts(runtime).turnLastResortMs);
  };
  /** 整轮最后兜底（固定 1 小时、无 env）：整小时用「N 小时」，否则按既有毫秒格式化。 */
  const lastResortText = (runtime: RuntimeKind): string => {
    const ms = turnTimeouts(runtime).turnLastResortMs;
    return ms >= 3_600_000 && ms % 3_600_000 === 0 ? mainT("main.watchdog.durationHours", { hours: ms / 3_600_000 }) : formatDurationMs(ms);
  };

  /** 投递一条系统消息（统一入口；失败（本层回调抛错）如实记诊断并视为未投出——绝不向上抛）。 */
  const outbound = (projectRoot: string, message: WatchdogOutboundMessage, label: string): boolean => {
    try {
      deps.deliver(projectRoot, { ...message, dedupKey: nextSystemKey(projectRoot, label) });
      return true;
    } catch (err) {
      loggerFor(projectRoot).error("watchdog.deliver.failed", err);
      return false;
    }
  };

  // —————— 风暴护栏：15 min 窗口 ≤ 5 条（告警与恢复行同计）；超限投一条通告（通告不占额度、每风暴期恰一条） ——————
  const stormOf = (projectRoot: string): StormState => {
    let s = stormStates.get(projectRoot);
    if (!s) {
      s = { times: [], suppressed: 0, noticeSent: false };
      stormStates.set(projectRoot, s);
    }
    return s;
  };
  const tryStormDelivery = (projectRoot: string, message: WatchdogOutboundMessage, label: string): boolean => {
    const storm = stormOf(projectRoot);
    const at = now();
    storm.times = storm.times.filter((t) => at - t < config.stormWindowMs);
    if (storm.times.length < config.stormLimit) {
      if (outbound(projectRoot, message, label)) {
        storm.times.push(at);
        storm.noticeSent = false; // 额度恢复：下一次风暴期可再通告一次
        return true;
      }
      return false;
    }
    storm.suppressed += 1;
    loggerFor(projectRoot).record("watchdog.suppressed", { reasonCode: "storm", count: storm.suppressed });
    if (!storm.noticeSent) {
      storm.noticeSent = true;
      outbound(projectRoot, { text: renderWatchdogStormGuard(storm.suppressed), summary: mainT("main.watchdog.stormGuard", { count: storm.suppressed }) }, "storm-notice");
    }
    return false;
  };

  // —————— 活跃期评估（信号 #1/#2/#4 共用；#3 走即时事件路径） ——————
  const evaluateEpisode = (
    projectRoot: string,
    input: {
      key: string;
      signal: WatchdogSignalKind;
      roleId: string;
      positive: boolean;
      identity?: string;
      cooldownMs: number;
      buildAlert: () => WatchdogOutboundMessage;
    }
  ): void => {
    const full = `${projectRoot}\u0000${input.key}`;
    let st = states.get(full);
    if (!st) {
      st = { active: false, alerted: false, hits: 0, suppressed: 0 };
      states.set(full, st);
    }
    // 身份更替（#1：新一轮）⇒ 旧活跃期先按解除处理（新一轮是独立的去重身份）。
    if (st.active && input.identity !== undefined && st.identity !== undefined && st.identity !== input.identity) {
      resolveEpisode(projectRoot, input.signal, input.roleId, input.key, st);
    }
    if (input.positive) {
      if (!st.active) {
        st.active = true;
        st.alerted = false;
        st.hits = 0;
        st.suppressed = 0;
        st.identity = input.identity;
      }
      st.hits += 1;
      if (st.alerted) {
        st.suppressed += 1; // 活跃期内重复命中：只累计计数（不重复打扰）
        return;
      }
      const cooled = st.lastDeliveredAt !== undefined && input.cooldownMs > 0 && now() - st.lastDeliveredAt < input.cooldownMs;
      if (cooled) {
        st.suppressed += 1;
        return;
      }
      if (tryStormDelivery(projectRoot, input.buildAlert(), `alert-${input.key}`)) {
        st.alerted = true;
        st.lastDeliveredAt = now();
        loggerFor(projectRoot).record("watchdog.alert", { state: input.key, count: st.hits });
      } else {
        st.suppressed += 1;
      }
    } else if (st.active) {
      resolveEpisode(projectRoot, input.signal, input.roleId, input.key, st);
    }
  };

  const resolveEpisode = (projectRoot: string, signal: WatchdogSignalKind, roleId: string, key: string, st: SignalState): void => {
    if (st.alerted) {
      if (signal === "turn-deadline") {
        // 到点检查**不是故障**：解除（轮次结束）时**不投「看护恢复」行**——否则 su 会误以为发生过
        // 一次超时/中止。只留诊断（观察面），不向会话投任何消息。
        loggerFor(projectRoot).record("watchdog.recovery", { state: key, count: st.hits });
      } else if (tryStormDelivery(projectRoot, {
        // 恢复行只在**告警确实投出过**时投（su 看过告警才需要「已解除」的对账）；仍受风暴护栏约束。
        text: renderWatchdogRecovery({ signal, roleId, hits: st.hits, suppressed: st.suppressed }),
        summary: mainT("main.watchdog.recoverySignal", { signal: signalShortLabel(signal), roleId }),
      }, `recovery-${key}`)) {
        loggerFor(projectRoot).record("watchdog.recovery", { state: key, count: st.hits });
      }
    }
    st.active = false;
    st.alerted = false;
    st.hits = 0;
    st.suppressed = 0;
    st.identity = undefined;
  };

  /** 清扫：本项目里「本轮未被评估到」的活跃期按键解析（队列清空/角色消失等 ⇒ 条件已解除）。 */
  const sweepStates = (projectRoot: string, evaluated: Set<string>): void => {
    const prefix = `${projectRoot}\u0000`;
    for (const [full, st] of states) {
      if (!full.startsWith(prefix) || !st.active) continue;
      const key = full.slice(prefix.length);
      if (evaluated.has(key)) continue;
      const colon = key.indexOf(":");
      const kind = key.slice(0, colon);
      const roleId = key.slice(colon + 1);
      const signal: WatchdogSignalKind = kind === "turn-deadline" ? "turn-deadline" : kind === "queue-stuck" ? "queue-stuck" : "repeat-fail";
      resolveEpisode(projectRoot, signal, roleId, key, st);
    }
  };

  const tickProject = (projectRoot: string): void => {
    const at = now();
    const snapshot = deps.snapshot(projectRoot);
    if (!snapshot) return;
    const govBusy = snapshot.governanceRoleId !== null && snapshot.roles.some((r) => r.roleId === snapshot.governanceRoleId && r.busy);
    const govSuppressed = (roleId: string): boolean => roleId !== "" && roleId === snapshot.governanceRoleId && govBusy; // 「治理主人自身忙不报」
    const pendingFor = (roleId: string): number => snapshot.pendingConfirmationsByRole.get(roleId) ?? 0;
    const evaluated = new Set<string>();

    // —— 信号 #1：轮次**到点检查**（100% 检查时限；挂起确认卡排除；su 忙排除）——
    // 客户裁定 2026-10-17：到点**只提示、不中止本轮**；整轮最后兜底固定 1 小时（`turnLastResortMs`）。
    for (const role of snapshot.roles) {
      const key = `turn-deadline:${role.roleId}`;
      evaluated.add(key);
      let positive = false;
      let identity: string | undefined;
      let startedAt = 0;
      // 自动中止时限在 busy 分支外求值：buildAlert 闭包在 evaluateEpisode 内也要读（0=禁用）。
      const abortLimit = turnAbortMs(role.runtime);
      if (role.busy && typeof role.turnStartedAt === "number") {
        const limit = turnTimeoutMs(role.runtime);
        const elapsed = at - role.turnStartedAt;
        identity = role.turnId ?? `t${role.turnStartedAt}`;
        if (elapsed >= limit * config.turnDeadlineRatio && pendingFor(role.roleId) === 0 && !govSuppressed(role.roleId)) {
          positive = true;
          startedAt = role.turnStartedAt;
        }
        // —— 自动中止（2026-10-21 客户要求：默认禁用）：看护覆盖**所有角色**（含内置治理角色，
        // 尤其 Convener）——不按 builtIn/governanceFunction 排除。仅显式配置正时限（测试覆盖或
        // `ANS_PI_PROMPT_TIMEOUT_MS`）且开关开启、回合超限 ⇒ 恰一次调用注入回调；默认 0 ⇒ 只到点提示，
        // 不自动中止（1h 为运行时最后兜底）。正确等待（有挂起确认卡）不中止。同一 role+turnId 只触发
        // 一次：abort 生效前的后续 tick 与「abort→立即重开→再 abort」的循环由 `autoAbortFired` 去重挡住。
        if (
          abortLimit > 0 &&
          elapsed >= abortLimit &&
          pendingFor(role.roleId) === 0 &&
          deps.onTurnDeadline !== undefined &&
          deps.autoRecoveryEnabled?.(projectRoot, role.roleId) === true
        ) {
          const fireKey = `${projectRoot}\u0000${role.roleId}`;
          if (autoAbortFired.get(fireKey) !== identity) {
            autoAbortFired.set(fireKey, identity);
            try {
              deps.onTurnDeadline(projectRoot, role.roleId, role.runtime, identity);
            } catch (err) {
              loggerFor(projectRoot).error("watchdog.auto-abort.failed", err);
            }
            loggerFor(projectRoot).record("watchdog.auto-abort", { roleId: role.roleId, turnId: identity, elapsedMs: elapsed, limitMs: abortLimit });
            // Lead 系统行：自动中止 ≠ 客户批准（经既有投递机；一条/轮）。
            outbound(projectRoot, {
              text: mainT("main.watchdog.turnAbortedText", { prefix: WATCHDOG_ALERT_PREFIX, roleId: role.roleId, elapsed: formatDurationMs(elapsed), limit: formatDurationMs(abortLimit) }),
              summary: mainT("main.watchdog.turnAbortedSummary", { roleId: role.roleId }),
            }, `auto-abort-${role.roleId}`);
          }
        }
      }
      evaluateEpisode(projectRoot, {
        key, signal: "turn-deadline", roleId: role.roleId, positive, identity,
        cooldownMs: 0, // 「每轮一次」：由每轮独立身份（turnId/起始时刻）天然去重
        buildAlert: () => ({
          text: renderWatchdogAlert({
            signal: "turn-deadline",
            roleId: role.roleId,
            facts: [
              abortLimit > 0
                ? mainT("main.watchdog.turnDeadlineElapsedAbort", { elapsed: formatDurationMs(at - startedAt), timeoutMs: turnTimeoutMs(role.runtime), limit: formatDurationMs(abortLimit) })
                : mainT("main.watchdog.turnDeadlineElapsedNoAbort", { elapsed: formatDurationMs(at - startedAt), timeoutMs: turnTimeoutMs(role.runtime) }),
              mainT("main.watchdog.turnDeadlineAdvice"),
              mainT("main.watchdog.turnDeadlineLastResort", { text: lastResortText(role.runtime) }),
              mainT("main.watchdog.turnDeadlineStarted", { time: formatClock(startedAt) }),
              mainT("main.watchdog.turnDeadlinePendingCard"),
            ],
          }),
          summary: mainT("main.watchdog.signalSummary", { signal: signalShortLabel("turn-deadline"), roleId: role.roleId }),
        }),
      });
    }

    // —— 信号 #2：投递排队积压（队首 age ≥ 10 min 或深度 ≥ 5；su 忙排除；空目标队列跳过）——
    for (const q of snapshot.queues) {
      if (q.targetRoleId === "") continue; // 主入口未枚举到的滞留队列：由投递机自身的一次性提示承担（不在此重复）
      const key = `queue-stuck:${q.targetRoleId}`;
      evaluated.add(key);
      const head = q.items[0];
      const depth = q.items.length;
      const headAge = head !== undefined ? at - head.enqueuedAtMs : 0;
      const positive = head !== undefined && !govSuppressed(q.targetRoleId) && (headAge >= config.queueHeadAgeMs || depth >= config.queueDepth);
      evaluateEpisode(projectRoot, {
        key, signal: "queue-stuck", roleId: q.targetRoleId, positive,
        cooldownMs: config.queueStuckCooldownMs,
        buildAlert: () => ({
          text: renderWatchdogAlert({
            signal: "queue-stuck",
            roleId: q.targetRoleId,
            facts: [
              mainT("main.watchdog.queueStuckHead", { age: formatDurationMs(headAge), depth }),
              mainT("main.watchdog.queueStuckItem", { kind: queueKindLabel(head!.kind), source: head!.sourceRoleId === "" ? mainT("main.watchdog.systemSource") : head!.sourceRoleId, summary: shorten(head!.summary, 60), time: formatClock(head!.enqueuedAtMs) }),
            ],
          }),
          summary: mainT("main.watchdog.queueStuckSummary", { signal: signalShortLabel("queue-stuck"), roleId: q.targetRoleId, depth }),
        }),
      });
    }

    // —— 信号 #4：重复失败（15 min 窗口 failed/timed_out ≥ 3；su 忙排除）——
    for (const [full, records] of failures) {
      if (!full.startsWith(`${projectRoot}\u0000`)) continue;
      const roleId = full.slice(projectRoot.length + 1);
      const pruned = records.filter((r) => at - r.at < config.repeatFailWindowMs);
      if (pruned.length !== records.length) failures.set(full, pruned);
      if (pruned.length === 0) {
        failures.delete(full);
        // 注意：不在此 continue——活跃期若曾在（告警后记录已过期），下面的评估会以 positive=false 正常解除。
      }
      const key = `repeat-fail:${roleId}`;
      evaluated.add(key);
      const last = pruned.length > 0 ? pruned[pruned.length - 1] : undefined;
      const positive = pruned.length >= config.repeatFailCount && !govSuppressed(roleId);
      evaluateEpisode(projectRoot, {
        key, signal: "repeat-fail", roleId, positive,
        cooldownMs: config.repeatFailCooldownMs,
        buildAlert: () => ({
          text: renderWatchdogAlert({
            signal: "repeat-fail",
            roleId,
            facts: [
              mainT("main.watchdog.repeatFailWindow", { minutes: Math.round(config.repeatFailWindowMs / 60000), count: pruned.length }),
              mainT("main.watchdog.repeatFailLast", { detail: last !== undefined ? `${formatClock(last.at)}（${last.outcome}）` : mainT("main.watchdog.repeatFailUnknown") }),
            ],
          }),
          summary: mainT("main.watchdog.repeatFailSummary", { signal: signalShortLabel("repeat-fail"), roleId, count: pruned.length }),
        }),
      });
    }

    // 清扫：本轮没评估到的活跃期（队列清空/会话消失/记录过期等）按「条件已不再成立」解除。
    sweepStates(projectRoot, evaluated);

    // —— 信号 #3 的冷却态清理（不参与活跃期清扫）——
    for (const [full, st] of instantStates) {
      if (!full.startsWith(`${projectRoot}\u0000`)) continue;
      if (st.lastDeliveredAt !== undefined && at - st.lastDeliveredAt > config.cmdTimeoutCooldownMs * 4 && st.suppressedSinceDelivered === 0) instantStates.delete(full);
    }

    // 2026-10-18 客户新要求：**验收通过即收束**——看护不再在静默 30s 后投 `[系统·收束]`；
    // 本 tick 只负责告警/恢复行（完成态收束状态机已整体移除）。
  };

  const tick = (): void => {
    for (const projectRoot of deps.projects()) {
      try {
        tickProject(projectRoot);
      } catch (err) {
        // 看护器自身异常（读快照/判定抛错）：如实记诊断 + stderr；看护**暂停本 tick**、会话与投递不受影响；
        // 下个 tick 重试（fail-safe toward 现状——不共用任何判定链）。
        loggerFor(projectRoot).error("watchdog.failed", err);
        try {
          process.stderr.write(`[watchdog] tick 失败（已暂停本 tick，下个 tick 重试）：${err instanceof Error ? err.message : String(err)}\n`);
        } catch { /* stderr 不可用不阻断 */ }
      }
    }
  };

  return {
    observe(projectRoot, observation) {
      try {
        if (observation.kind === "settled") {
          // #4 计数：只认四值终局里的 failed / timed_out（aborted 是人工停止、completed 是成功——都不算）。
          if (observation.outcome === "failed" || observation.outcome === "timed_out") {
            const full = `${projectRoot}\u0000${observation.roleId}`;
            const list = failures.get(full) ?? [];
            list.push({ at: observation.at, outcome: observation.outcome });
            failures.set(full, list);
          }
          return;
        }
        if (observation.kind === "activity") {
          return;
        }
        // 命令超时（#3）：单次即报（低频高信号）；冷却期内只累计抑制；**无恢复行**（瞬时事件，无所谓「解除」）。
        if (observation.kind === "command-timed-out") {
          const snapshot = deps.snapshot(projectRoot);
          const govBusy = snapshot !== undefined && snapshot.governanceRoleId !== null && snapshot.roles.some((r) => r.roleId === snapshot.governanceRoleId && r.busy);
          if (observation.roleId !== "" && snapshot !== undefined && observation.roleId === snapshot.governanceRoleId && govBusy) return; // 治理主人自身忙不报
          const full = `${projectRoot}\u0000${observation.roleId}`;
          let st = instantStates.get(full);
          if (!st) {
            st = { suppressedSinceDelivered: 0 };
            instantStates.set(full, st);
          }
          const at = now();
          const cooled = st.lastDeliveredAt !== undefined && at - st.lastDeliveredAt < config.cmdTimeoutCooldownMs;
          if (cooled) {
            st.suppressedSinceDelivered += 1;
            return;
          }
          if (tryStormDelivery(projectRoot, {
            text: renderWatchdogAlert({
              signal: "cmd-timeout",
              roleId: observation.roleId,
              facts: [
                mainT("main.watchdog.cmdTimeoutTimedOut", { time: formatClock(observation.at) }),
                mainT("main.watchdog.cmdTimeoutNote"),
              ],
            }),
            summary: mainT("main.watchdog.signalSummary", { signal: signalShortLabel("cmd-timeout"), roleId: observation.roleId }),
          }, `alert-cmd-timeout:${observation.roleId}`)) {
            st.lastDeliveredAt = at;
            st.suppressedSinceDelivered = 0;
            loggerFor(projectRoot).record("watchdog.alert", { state: `cmd-timeout:${observation.roleId}`, count: 1 });
          } else {
            st.suppressedSinceDelivered += 1;
          }
        }
      } catch (err) {
        // observe 侧异常同样隔离（绝不把异常抛回事件消费循环——看护永不阻断会话/投递）。
        loggerFor(projectRoot).error("watchdog.failed", err);
      }
    },
    tick,
    start() {
      if (timer !== undefined) return;
      timer = setInterval(tick, config.tickMs);
      timer.unref?.();
    },
    stop() {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },
    running: () => timer !== undefined,
    stats(projectRoot) {
      const prefix = `${projectRoot}\u0000`;
      const at = now();
      let activeAlerts = 0;
      let lastAlertAt: number | null = null;
      for (const [full, st] of states) {
        if (!full.startsWith(prefix)) continue;
        if (st.active && st.alerted) activeAlerts += 1;
        if (st.lastDeliveredAt !== undefined && (lastAlertAt === null || st.lastDeliveredAt > lastAlertAt)) lastAlertAt = st.lastDeliveredAt;
      }
      for (const [full, st] of instantStates) {
        if (!full.startsWith(prefix)) continue;
        if (st.lastDeliveredAt !== undefined && (lastAlertAt === null || st.lastDeliveredAt > lastAlertAt)) lastAlertAt = st.lastDeliveredAt;
      }
      const failuresByRole = new Map<string, number>();
      for (const [full, list] of failures) {
        if (!full.startsWith(prefix)) continue;
        const within = list.filter((r) => at - r.at < config.repeatFailWindowMs).length;
        if (within > 0) failuresByRole.set(full.slice(prefix.length), within);
      }
      return { activeAlerts, lastAlertAt, suppressedTotal: stormStates.get(projectRoot)?.suppressed ?? 0, failuresByRole };
    },
  };
}
