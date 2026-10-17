// src/common/编排/watchdog.ts
// 编排主属（G-2 / O1）：看护与收束的**文案单一来源**（＋ 看护三能力契约的转发与口径）。
//
// 客户 2026-10-16 批准 G-2 按提案实施（`角色卡/项目管理/docs/change/2026-10-15_change-kanban-fixes-pm-review.md`
// §「G-2 客户批准与派发」；设计规格 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`，
// 下称「设计」）。分工（设计 §十）：
//   · 桌面窗口（W1 看护器 / W3 收束 / W5 恢复确认卡）做**检测与投递**——三类模型可见文案一律经本模块
//     渲染后入队（kind:"system"，投递机全复用）。本模块**纯渲染**：不触盘、不判定、不改任何判定链。
//   · 运行时核心（R1/R2）把 `role_status` / `session_tail` / `propose_recovery` 三工具按「注入才注册」
//     注册；载荷/回执形状的**单一来源＝契约家 `model/runtime.ts`**（本模块只作同一符号的转发）。
//   · 编排（O1）只做**承载与透传**：`run-role.ts` 的 `AdapterCapabilities` 三能力位（只 su 注入，判据
//     复用内置治理角色先例 `suppressHandback`）；不产生任何判定。
//
// 文案纪律（对齐 F-5-opt1 注记先例 `REBUILT_SESSION_WRITE_PERMITS_NOTICE`）：如实、**不夹带任何授权
// 语义**——看护不改判定链，一切失败路径 fail-closed（最坏情形退化为「今天的现状」）；告警 / 收束提示 /
// 恢复回执**均不构成授权或验收结论**。事实行（时间 / 来源 / 摘要）由检测侧（桌面）**如实产出**；本模块
// 只负责不变的在场的部分（信号名、角色、建议动作、纪律、回执口径）——不编造、不补全任何事实。

import type { RecoveryAction, RecoveryOutcome, RecoveryReceipt } from "../../model/runtime.ts";

// —————————————— 三类文案的文首与纪律句（单一来源） ——————————————
//
// **文首标记契约**（与桌面UI U1 的 `app/renderer/tool-rows.js::SYSTEM_HEAD` 归类判据对齐，2026-10-16
// 经 PM 转达）：`system` 类投递正文的文首定格标记统一为 `[系统·<子类>] `——ASCII `[`/`]`、中点 U+00B7、
// 子类闭合于 `]` 且其后为空白或文末（子类内无括号/换行、≤12 字）。归类**只依赖该形态、不逐子类登记**
// （子类词表可扩充）；**改掉该形态（全角括号/换前缀等）= system 类静默回落普通气泡**。三个前缀常量
// 即该形态的单一来源；渲染器恒以「前缀 + 一个 ASCII 空格」起始。

/** 看护告警统一文首（设计 §3.3）。 */
export const WATCHDOG_ALERT_PREFIX = "[系统·看护]";
/** 完成态收束提示统一文首（设计 §7.3）。 */
export const WATCHDOG_CLOSURE_PREFIX = "[系统·收束]";
/** 恢复执行回执统一文首（设计 §六；回执结果如实，见 `renderRecoveryReceipt`）。 */
export const WATCHDOG_RECOVERY_PREFIX = "[系统·恢复]";

/**
 * 告警的纪律句（设计 §3.3 草案逐字）——与门禁引擎 su 卡文本「看护职责段」、三工具 promptGuidelines
 * （`WATCHDOG_PROMPT_GUIDELINES`）**同口径**：看护仅如实告知，是否处理由 su 判断；绝不构成任何授权。
 */
export const WATCHDOG_DISCIPLINE_LINE = "看护仅如实告知——是否处理由你判断；不得据此假设任何写权。";

/**
 * 收束阈值的**批准默认值**（客户 2026-10-16 **复裁：静默 30 秒**——＝一个 tick 的最小防抖，
 * 取代原「5 min」默认；V1 仍仅 env 可调，阈值判定归桌面窗口）。
 * **保名改值**：名字沿用「分钟」口径（**0.5 分钟 ＝ 30 000 ms**）——`test/测试/g2-verify/` 等外部
 * 消费方**按名导入**本常量，改名即越界破坏其编译；客户裁定两法（改名毫秒常量 / 保名改值）皆可，
 * 本项选后者（导出名未变，语义值 5 → 0.5，影响面登记于实施记录）。
 * 渲染器接口以毫秒计（`renderClosurePrompt(silentMs)`）：非法输入回退 = 本值 × 60 000 ms。
 */
export const WATCHDOG_DEFAULT_SILENT_MINUTES = 0.5;

// —————————————— 支柱一 a)：异常告警（设计 §3.2/§3.3） ——————————————

/** 看护信号（阈值表 §3.2 的四信号；检测/去重/冷却在桌面看护器，本层只渲染）。 */
export type WatchdogSignalKind = "turn-deadline" | "queue-stuck" | "cmd-timeout" | "repeat-fail";

const SIGNAL_LABELS: Record<WatchdogSignalKind, string> = {
  // PM 评审 `2026-10-17_design_turn-watch-and-recover-review.md`（approved）：到点检查**不是超时**，
  // 不中止本轮；信号 kind 仍为 `turn-deadline`（契约不变）。不得再出现「逼近超时」。
  "turn-deadline": "轮次到点检查",
  "queue-stuck": "投递排队积压",
  "cmd-timeout": "命令超时",
  "repeat-fail": "重复失败",
};

/** 每信号的建议动作（单一来源；与设计 §3.2 告警口径一致——#3 明确「通常无需动作」）。 */
const SIGNAL_SUGGESTIONS: Record<WatchdogSignalKind, string> = {
  // 到点检查：只告知、不中止；仍在推进不动作；只有确认卡死才提议恢复（客户确认后应用执行）；1 小时为最后兜底。
  "turn-deadline": "到点检查不中止本轮；请用 role_status 核对是否卡死；仍在推进则不动作；只有卡死才 propose_recovery（客户确认后应用执行）；1 小时为最后兜底。",
  "queue-stuck": "先用 role_status（必要时 session_tail）核对；若确认卡死，可 propose_recovery（需客户一键确认后由应用执行）。",
  "cmd-timeout": "F-1 已自动终止该命令、轮次继续——通常无需动作，本告警仅告知。",
  "repeat-fail": "先用 role_status（必要时 session_tail）排查失败原因；确认卡死可 propose_recovery（需客户一键确认后由应用执行）。",
};

export interface WatchdogAlertInput {
  /** 命中的信号（阈值表 §3.2 的 #1-#4）。 */
  signal: WatchdogSignalKind;
  /** 受信号影响的角色 id（护栏：su 自身忙不触发任何告警——在检测侧排除，本层照实渲染）。 */
  roleId: string;
  /**
   * 事实行（**必含时间与来源**，设计 §3.3）——由检测器从同源快照/事件流**如实产出**，本层逐条拼接、
   * 不编造、不补全。多条以「；」相连（条目自带的 `- ` 前缀原样保留）。
   */
  facts: readonly string[];
}

/**
 * **看护告警文案——单一来源**（设计 §3.3 结构：文首 `[系统·看护]`；必含信号/角色/事实/建议/纪律）。
 * 桌面看护器（W1）命中并过完去重/冷却/护栏后，用本函数生成 `kind:"system"` 投递文本（投递机全复用）。
 */
export function renderWatchdogAlert(input: WatchdogAlertInput): string {
  const facts = input.facts.map((f) => f.trim()).filter((f) => f !== "");
  return [
    `${WATCHDOG_ALERT_PREFIX} ${SIGNAL_LABELS[input.signal]}：角色「${input.roleId}」。`,
    `事实：${facts.length > 0 ? facts.join("；") : "（检测侧未附事实）"}`,
    `建议：${SIGNAL_SUGGESTIONS[input.signal]}`,
    `纪律：${WATCHDOG_DISCIPLINE_LINE}`,
  ].join("\n");
}

export interface WatchdogRecoveryInput {
  /** 已解除的信号。 */
  signal: WatchdogSignalKind;
  /** 该信号针对的角色 id（去重键按角色，恢复行须能指认对象）。 */
  roleId: string;
  /** 活跃期内共命中次数（N）。 */
  hits: number;
  /** 期间被抑制（未重复投递）的条数（M）。 */
  suppressed: number;
}

/**
 * **「看护恢复」行——单一来源**（设计 §3.2：条件解除时投一条，形态沿用 F-6 先例）。
 * 计数由检测器持有；本层只渲染（非整数向下取整、负数归零——不编造）。
 */
export function renderWatchdogRecovery(input: WatchdogRecoveryInput): string {
  const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return (
    `${WATCHDOG_ALERT_PREFIX} 看护恢复：${SIGNAL_LABELS[input.signal]}（角色「${input.roleId}」）` +
    `已解除（期间共命中 ${count(input.hits)} 次，抑制 ${count(input.suppressed)} 条）。`
  );
}

/**
 * **风暴护栏行——单一来源**（设计 §3.3：全项目 15 min 窗口告警投递超限时，超出部分不逐条投递，
 * 投一条抑制数）。诊断事件名 `watchdog.suppressed` 由检测侧落盘（归桌面 W1）。
 */
export function renderWatchdogStormGuard(suppressedCount: number): string {
  const n = Number.isFinite(suppressedCount) && suppressedCount > 0 ? Math.floor(suppressedCount) : 0;
  return `${WATCHDOG_ALERT_PREFIX} 看护告警已抑制 ${n} 条（风暴护栏）。`;
}

// —————————————— 支柱二：完成态收束提示（设计 §7.3） ——————————————

/**
 * **收束提示文案——单一来源**（设计 §7.3 草案；客户 2026-10-16 复裁：冻结接口
 * `renderClosurePrompt(silentMs)`，参数单位**毫秒**——原分钟参数作废）。
 * 时长自适应两档：≥ 60 000 ms 用「N 分钟」、< 60 000 ms 用「N 秒」；两档**一律向下取整（floor）**
 * ——显示值为已静默时长的**下界**（只说「至少这么久」，读数恒不超出实际，杜绝夸大；亚秒输入渲染
 * 「0 秒」，不编造、不上抛）。**不强迫 su 断言「完成」**——提示明确「仅为系统侧静默判定，不代表
 * 任何验收结论」；非法输入（非有限或 ≤ 0）回退批准默认值 30 秒（＝`WATCHDOG_DEFAULT_SILENT_MINUTES`
 * 0.5 分钟 × 60 000 ＝ 30 000 ms）。
 */
export function renderClosurePrompt(silentMs: number): string {
  const ms = Number.isFinite(silentMs) && silentMs > 0 ? silentMs : WATCHDOG_DEFAULT_SILENT_MINUTES * 60_000;
  const duration = ms >= 60_000 ? `${Math.floor(ms / 60_000)} 分钟` : `${Math.floor(ms / 1000)} 秒`;
  return [
    `${WATCHDOG_CLOSURE_PREFIX} 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 ${duration}。`,
    "请核对是否达到收尾条件：",
    "· 若确认完成——请给客户最终总结（交付物／验证结论／遗留项）；",
    "· 若还有未了事项（含你正在等待的客户答复之外的口头承诺）——继续处理或派发。",
    "本提示仅为系统侧静默判定，不代表任何验收结论；是否收尾由你判断。",
  ].join("\n");
}

// —————————————— 支柱一 d)：恢复回执（设计 §六） ——————————————

/** 恢复动作集（客户 2026-10-16 裁定 V1 ＝ 恰此三项；增/减属变更）。与契约 `RecoveryAction` 同值集。 */
export const RECOVERY_ACTIONS: readonly RecoveryAction[] = ["abort-turn", "rebuild-session", "redeliver"];

/**
 * 回执结果标签（设计 §6.3/§九）——`outcome` 取自契约 `RecoveryOutcome`，四值中**恰 `executed` 为已执行**：
 * · `executed`＝客户已确认且已执行（成功）；
 * · `declined`＝未执行——客户取消/关窗/未确认（fail-closed，**绝不当「没人问就执行」**）；
 * · `unsupported`＝未执行——运行时不支持该动作（绝不假装已执行）；
 * · `error`＝未执行——执行失败/前提不满足（如 rebuild 遇在跑轮次拒绝），原因进 `message`。
 */
const OUTCOME_LABELS: Record<RecoveryOutcome, string> = {
  executed: "已执行",
  declined: "未执行（未获客户确认/已取消）",
  unsupported: "未执行（当前运行时不支持）",
  error: "未执行（执行失败）",
};

/** 回执渲染输入 ＝ 契约 `RecoveryReceipt`（outcome/message/operatorId/at）＋ 动作与目标角色定位。 */
export interface RecoveryReceiptInput extends RecoveryReceipt {
  action: RecoveryAction;
  targetRoleId: string;
  /** 可注入时钟（测试）；`at` 缺省时取它（再缺省 `new Date()`）。 */
  now?: () => Date;
}

/**
 * **恢复执行回执文案——单一来源**（设计 §6.3：action、目标角色、结果＋原因、确认者标识、时间；
 * 回执经投递机投 su，kind:"system"）。结果四值**如实**——未执行就说未执行，绝不假装已执行。
 */
export function renderRecoveryReceipt(input: RecoveryReceiptInput): string {
  const at =
    input.at !== undefined && input.at !== ""
      ? input.at
      : (input.now ?? (() => new Date()))().toISOString();
  const operator =
    typeof input.operatorId === "string" && input.operatorId.trim() !== ""
      ? input.operatorId.trim()
      : "未知操作者";
  const lines = [
    `${WATCHDOG_RECOVERY_PREFIX} 恢复回执：动作「${input.action}」｜目标角色「${input.targetRoleId}」｜结果：${OUTCOME_LABELS[input.outcome]}。`,
  ];
  if (input.message !== undefined && input.message.trim() !== "") lines.push(`说明：${input.message.trim()}`);
  lines.push(`确认者：operator:${operator}；时间：${at}`);
  return lines.join("\n");
}

// —————————————— 看护三能力的承载（R1/R2 契约对齐；设计 §4.1/§4.2/§6.1） ——————————————
//
// 形状**单一来源 ＝ 契约家 `src/model/runtime.ts`**（运行时核心 R1/R2 属主落位；同 `CustomerInputFn`/
// `DispatchTaskFn` 先例；该侧注释注明「与编排承载契约同名同形」）：`RoleStatusFn` / `SessionTailFn`
// （返回 `WatchdogToolResult` 回执：ok + text / message——纯读）、`ProposeRecoveryFn`（载荷 →
// `RecoveryReceipt`：executed / declined / unsupported / error——四值中恰 `executed` 为已执行）。
// 端到端链路（字段名是跨角色对齐点，任一侧改名 ＝ 工具静默零注册，fail-closed）：
//   桌面（注入实现）→ `openRoleSession({ roleStatus | sessionTail | proposeRecovery })`
//   →（编排 O1：**只 su** 注入，判据沿内置治理角色先例 `suppressHandback`）→ `AdapterCapabilities`
//   同名三能力位 → `createRuntimeAdapterFactory` 并入适配器选项 →（运行时核心）`GovernedToolsOptions`
//   同名能力位 → 注册 `role_status`/`session_tail`/`propose_recovery`。
// 下十条 re-export 供看护消费方便利（**同一符号的转发，绝非第二份形状**；消费方也可直接从
// `model/runtime.ts` 或其 provider 转发处导入）。

export type {
  ProposeRecoveryFn,
  ProposeRecoveryPayload,
  RecoveryAction,
  RecoveryOutcome,
  RecoveryReceipt,
  RoleStatusFn,
  RoleStatusPayload,
  SessionTailFn,
  SessionTailPayload,
  WatchdogToolResult,
} from "../../model/runtime.ts";

// —————————————— su 看护纪律的 promptGuidelines（单一来源） ——————————————
//
// 设计 §五/§十（O1 行）：su 的看护纪律提示——**可自查、只提议不执行、不得据此假设写权**；与门禁引擎
// G 的 su 卡文本同口径。R1/R2 的 `schema.ts` 三工具指南已按此口径落位（跨角色不得导入他人私有
// common——§6；同口径由批次对齐＋独立验证核对，逐字以本数组为编排侧基准）。
export const WATCHDOG_PROMPT_GUIDELINES: readonly string[] = [
  "收到 [系统·看护] 告警或 [系统·收束] 提示先自查再判断：用 role_status（必要时 session_tail）核对事实；核对后回复「状态正常，忽略」是合法结局，不强迫动作。",
  "恢复动作只能以 propose_recovery 提议（带证据）：提议 ≠ 执行——执行由客户一键确认后由应用完成，未获确认一律零执行。",
  "看护告警与收束提示不构成任何授权或验收结论——不得据此假设任何写权；是否处理、是否收尾由你判断。",
];
