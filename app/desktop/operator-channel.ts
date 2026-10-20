// app/desktop/operator-channel.ts
// 桌面应用的「操作者确认通道 (a)」——shell 审核三层链的**第三闸、兜底**（设计 §7.3/§7.4/§7.5/§7.6）。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，**不依赖 electron**，可在 node 下单测；
// 真正的弹窗表现由**注入的 presenter** 提供（主进程用 electron dialog 实现，见 app/main.ts）。
//
// —— 这与什么（判据） ——
// 客户裁定的 shell 审核是三层组合：**(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**（§7.3）。
// (c)/(b) 由**编排**实现；(a) 是「**人看一眼命令原文，点放行/拒绝**」——CLI 上由编排实现、**桌面端由本模块实现**。
// **(a) 是第三闸、兜底**：只有当 **(b) 拿不准或不可用**时才会叫人（§7.3）——不是每条命令都弹窗。
//
// —— 契约（**单一来源 = §4 冻结契约家** `src/model/runtime.ts`） ——
// 注入点三型（入参 `OperatorPrompt`、出参 `OperatorOutcome`、通道 `OperatorChannelFn`）现由 **Pi适配器（T20）**
// 置于 §4 冻结契约家 `src/model/runtime.ts`（经 PM 裁定从编排私有 `common/编排/` 挪入）。**§6 通路已开**，
// 故本模块（T22）**删去此前的逐字镜像**，改为**只读导入**（见下方 import）——**同一契约只许一个形状**。
//   · 入参 `OperatorPrompt = { command; argv; cwd; toolCallId; reason? }`
//     （`reason?` = **为何升级到人**——(b) pm 拿不准/不可用——**应展示给操作者**，让他知道为什么被问到）；
//   · 返回 `OperatorOutcome = {outcome:"allow";operatorId?} | {outcome:"deny";operatorId?;reason?}
//                            | {outcome:"unavailable";reason?}`。
// 本模块产出与 `OperatorChannelFn` **结构兼容**的通道，经 `deps.operatorChannel` 注入编排的 `createShellGate`。
// 「恰好 `allow` 才 spawn」的**唯一**保证在 Pi 适配器的 `execute`（审核与 spawn 同址，§7.5.2），不在本角色。
//
// ⚠ **形状对不上（**回报**，未自调和）**：冻结家的 `OperatorChannelFn` 返回 `OperatorOutcome | null | undefined`
//   （允许空），而本模块产出的通道**恒返回确定的 `OperatorOutcome`**——**窄于** `OperatorChannelFn`（是其结构子类型）。
//   改宽本模块**产出**形状会削弱本角色 API 且非「行为逐字不变」，故**不调和**：`createDesktopOperatorChannel`
//   返回**推断的确定型**；契约的**唯一命名形状**仍是冻结家的 `OperatorChannelFn`（本模块只读导入、原样转出，
//   **不自造第二形状**）。消费方（编排注入点）接受 `OperatorChannelFn`，本产出可直接赋入。如实回报（见 changelog/memo）。
//
// —— 本模块**不做任何判定**（硬约束：不得出现第二份判定实现） ——
// 「命令是否危险」由 (c) 判、「语义是否放行」由 (b) 判。本模块**只**：把命令**原文**如实呈现给人、取回人的
// 放行/拒绝、并在**通道不可用/超时**时给出**非放行**结论（fail-closed）。**不含任何命令分类/白名单/规则**逻辑。
//
// **「替我审批」（2026-10-17 PM 评审 §5.2/§6.5；2026-10-19 客户裁定收紧为「判断 agent 是唯一审查者」）**：
// 开关开启时，本模块在 present **之前**调用**注入的** `ShellJudgeFn`（判断语义全部在编排 `createShellJudge`/
// 只读工具），只做裁决映射与结果行推送；它**不解析命令风险、不做 (c) 判定**。开关开启后**不再请客户手批**
// （客户原话：「审查只有同意和拒绝，不需要我来同意，拒绝要给理由」）：`allow` ⇒ 放行、`deny` ⇒ 拒绝并带理由；
// `manual`（命令/上下文过大、读取预算耗尽、超时、不可用、解析失败等）与 `row-failed`（判断结果行投达失败）
// **一律按拒绝处理**（fail-closed，**不调用 presenter**），理由复用 `judgeManualHumanReason` 的具体人话，
// 审计/诊断保留原 reasonCode 与「非模型主动 deny」事实。deny 档放行只按 `tier` 打标记（客户 D1），
// **没有 hard-floor 转换**。开关关/无 judge/已中止时，原 present 路径**逐字不变**。
//
// —— fail-closed 三条（§7.5） ——
//   · 人点拒绝              → `{outcome:"deny", operatorId, reason}`（编排据此**拒**）；
//   · 确认超时              → `{outcome:"unavailable", reason:"…超时…"}`（编排据此**拒**）；
//   · 通道不可用/未配置/抛错 → `{outcome:"unavailable", reason:"…"}`（编排据此**拒**）。
//   **绝不默认放行**：仅当操作者**明确放行**（恰为 `allow:true`）才返回 `{outcome:"allow"}`。
//
// —— 审计的 by/branch（§7.6） ——
// 放行/拒绝都留痕，含 `by`（操作者标识）与 `branch`（触发分支 = a）。**二者由编排落盘**（`docs/audit/shell-gate.jsonl`，
// 归 pm、以 pm 授权、声明 `shell-gate` 条件）：编排的 `createShellGate` 由 `OperatorOutcome.operatorId` 得
// `by = operator:<id>`（缺标识则 `operator:未知操作者`），并由其自身的 `BRANCH_A_*` 分支常量与升级链得 `branch`。
// **本模块不写审计、不另立 `by`/`branch` 映射**（编排已明定「通道无需自造 `by`/`branch`」——避免出现第二份映射）。

// 契约三型的**唯一来源**（§4 冻结契约家，T20/T22）：只读导入、原样转出——**不再逐字镜像**。
// `import type` 纯类型、被类型擦除，故本模块仍**不静态依赖 electron / Pi 包**（可在 node 下单测）。
import type {
  OperatorPrompt,
  OperatorOutcome,
  OperatorChannelFn,
  RuntimeKind,
  ShellJudgeAlternative,
  ShellJudgeAudit,
  ShellJudgeFn,
  ShellJudgeOutcome,
  ShellJudgeRequest,
} from "../../src/model/runtime.ts";
export type { OperatorPrompt, OperatorOutcome, OperatorChannelFn };
// 桌面自有类型（§6.5）：判断结果行载荷与桌面侧的审计扩展。只在判断 agent 自己做出 allow/deny 时使用。
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";

// (c) 规则集实件（**I-1 补丁**，2026-10-12 客户重发授权）：**只读导入**门禁引擎经 Service 公开出口的
// 再导出（`src/service/gate/shell-rules.ts`——**同一函数引用**，绝不复制实现、绝不另立第二份规则集）。
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
// 装配选项形状的**单一来源**在编排（`shell-arming.ts`）：只读导入其类型（运行期擦除），据它取
// 「前端该注入哪几件」——`Omit` 掉 project/operatorChannel/sessionDeps（那三件由编排按本次会话装配）。
import { SU_APPROVAL_REASON_PREFIX } from "../../src/pipeline/orchestration/shell-arming.ts";
import type { AssembleShellGateOptions, SuApprovalTier } from "../../src/pipeline/orchestration/shell-arming.ts";
// 内置治理角色的统一显示名（2026-10-19 客户反馈：审批档卡片按实际角色显示，不再一律写「SU」）。
// 单一来源仍是门禁引擎注册表；本层经 Service 公共出口只读消费（同 `shell-rules.ts` 先例，不复制数据）。
import { governanceRoleOf } from "../../src/service/boundary/resolve-boundary.ts";

// argv 规范化原语的**单一来源**（pm，T23，`src/common/shared/argv-primitives.ts`）：**只读导入**——
// 与编排侧（写审计）同源，故「操作者所见」与「审计所记」不可能漂移。此前本模块的**本地副本（逐字镜像）
// 已删除**（T23 收尾）：**不得有第二份实现**。
import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";
// G-2/W5（2026-10-16 客户批准）：确认卡的 pending/replay/expire 机制抽入**共享通用件**
// （`confirm-card.ts`，与恢复确认卡同件——设计 §6.2「实现建议」）；本文件的行为逐字保留（见下方注释）。
import { createConfirmCardCore } from "./confirm-card.ts";
// 判断回落 reason 的人话映射（2026-10-18 客户反馈：read-denied 丢具体路径/原因）：与治理通道**同解**的小件。
import { readDeniedHumanReason, stripTrailingSentencePunct } from "./judge-reason.ts";
// F-4-M1（2026-10-16 客户批准）：shell 审核预算的 env 名**单一来源**在编排（shell-deadline.ts——
// shell-gate.ts 的同一引用）；本层**只读导入**，绝不在此另写 "ANS_PI_SHELL_REVIEW_TIMEOUT_MS" 字面量。
import { SHELL_REVIEW_TIMEOUT_ENV } from "../../src/common/编排/shell-deadline.ts";

/** 默认确认超时（毫秒）。**超时 = 拒绝**（fail-closed，§7.5）。可用环境变量覆盖；未设时**跟随 shell 审核预算**
 *  （F-4-M1：`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` → `ANS_PI_SHELL_REVIEW_TIMEOUT_MS` → 本默认）。 */
export const DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS = 120000;
/** 覆盖确认超时的环境变量名（显式专用覆盖，优先于 shell 审核预算）。 */
export const OPERATOR_CONFIRM_TIMEOUT_ENV = "ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS";
/**
 * shell judge 通道层**独立**超时（2026-10-18 真机修正：driver 默认 120s 后同步）：
 * driver 超时由编排 `ANS_SHELL_JUDGE_TIMEOUT_MS` 解析（默认 120s），本通道 = 同名 env + 15s 余量
 * ⇒ 缺省 **135s**；非法/缺失回 135s；显式 `judge.timeoutMs` 原样。**确认卡等待超时与 shell 执行时限不变**。
 */
export const SHELL_JUDGE_TIMEOUT_ENV = "ANS_SHELL_JUDGE_TIMEOUT_MS";
export const SHELL_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS = 15_000;
export const DEFAULT_SHELL_JUDGE_DRIVER_TIMEOUT_MS = 120_000;
export const DEFAULT_SHELL_JUDGE_CHANNEL_TIMEOUT_MS =
  DEFAULT_SHELL_JUDGE_DRIVER_TIMEOUT_MS + SHELL_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS;

/**
 * 解析 shell judge 通道超时（导出供测试钉住）：显式 `timeoutMs` 优先；否则
 * `ANS_SHELL_JUDGE_TIMEOUT_MS`（正整数）+ 15s 余量；非法/缺失 ⇒ 135_000。driver 自己解析同名 env。
 */
export function resolveShellJudgeChannelTimeoutMs(
  option: unknown,
  env?: Record<string, string | undefined>,
): number {
  if (typeof option === "number" && Number.isFinite(option) && option > 0) return Math.floor(option);
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  const raw = source[SHELL_JUDGE_TIMEOUT_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed + SHELL_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS;
    }
  }
  return DEFAULT_SHELL_JUDGE_CHANNEL_TIMEOUT_MS;
}

/**
 * 桌面**是否 arm** shell 闸（即：会话构造路径是否把本通道作为 (a) 层交给编排装配、从而 `run_shell` 被注册）。
 *
 * **客户已裁定（2026-10-12，I-1）：「现在开放 shell，然后 shell 需要 su 审核一下。如果 su 觉得危险可以让
 * 客户决定」——`true`（**已 arm**）**。** 本常量由「V1 不 arm」改为 arm 即本轮开关；与 2026-10-11 的
 * 「V1 不 arm」旧裁定冲突之处以本条新裁定为准（旧记录保留为历史）。
 *
 * 接线口径（本轮）：
 *  · 桌面把 **(a) 操作者确认通道**（`createDesktopOperatorChannel`：既有「看命令原文 + 放行/拒绝」对话框，
 *    拒绝为默认与取消项）经会话构造路径交给**编排**装配 (c)/(b)/(a) 三层 `ShellGate`
 *    （`session.ts` 的 `shellOperatorChannel` 接缝 → `openRoleSession`；编排装配落地前该字段被静默忽略——登记）；
 *  · **(c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权）**：arm 时**同时**注入 `classifyShell` +
 *    `rules`（`buildDesktopShellArming`，只读导入门禁引擎经 Service 公开出口的实件）——否则闸因「规则集
 *    未注入」一律拒绝（真机曾据此如实报「环境无 shell」）；**(c) 与 (a) 两件同备才 arm**，任一构造/加载
 *    失败 ⇒ 两件都不注入（`run_shell` 不注册——能力缺席即 fail-closed）；
 *  · **项目角色**注入 (c)+(a) 走三层链；**全部内置治理角色**（`role.builtIn === true`，single 的 su 与 trio
 *    五人）经 session.ts 用**同一份 (c) 实件 + (a) 通道**装配**审批档**（`shellOperatorOnly`）——只读白名单
 *    直接执行（0 卡），其余（risky/review/deny）逐条提交客户/判断 agent 审批（客户 2026-10-17 裁定；
 *    2026-10-19 新规则：「所有的角色，都应该有运行 shell 的权限，包括读写，以及任何的需要命令的权限，
 *    只不过都要提交审批，按照原有的流程审批。」）。旧只读档（`shellReadonly`）**桌面不再注入**；
 *    缺件时**两边都不 arm**；
 *  · fail-closed 语义**不变**：关窗/取消/拒绝/超时/通道抛错 → **不放行**（`createDesktopOperatorChannel` 的三条退路）。
 *
 * **已知风险（I-1，如实登记）**：**本轮无沙箱**——客户放行的 shell 命令在项目目录里**真实执行**；命令里的
 * **写入不经过 `resolveWrite` 写门禁**（`run_shell` 无 path、不进 `GOVERNED_WRITE_TOOLS`）——即：**放行的
 * 命令可以绕过写边界**。缓解即本条链本身：危险命令交客户决定（(c)/(b) 之后仍由人把关）+ 每命令审计留痕。
 */
export const DESKTOP_SHELL_GATE_ARMED = true;

// —————————————————————— (c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权） ——————————————————————

/**
 * 桌面 arm 时随 (a) 通道一并注入的 **(c) 实件**形状——= 编排 `assembleProjectShellGate` 选项里前端负责的
 * 两个注入位（`classifyShell` + `rules`）；其余（`project`/`operatorChannel`/`sessionDeps` 及 (b) 参数）
 * 由编排按本次会话装配。形状**只读转自编排**（`Omit<AssembleShellGateOptions, …>`）——不另立第二份。
 */
export type DesktopShellArming = Omit<AssembleShellGateOptions, "project" | "operatorChannel" | "sessionDeps">;

/**
 * 构造 (c) 实件（**只读导入、不复制实现**）：`classifyShell`（门禁引擎纯函数——**同一函数引用**）+
 * `rules = defaultShellRules()`（规则集本体——门禁引擎的数据）；二者均经 Service 公开出口
 * `src/service/gate/shell-rules.ts` 再导出（客户确认边界后落地，见其头注）。
 *
 * 失败语义：**任何一步失败（含规则集加载抛错）⇒ 返回 `undefined` = 不 arm**——main.ts 据它连 (a) 通道
 * 也不注入（`run_shell` 不注册——能力缺席即 fail-closed）。**绝不因缺件而放宽**（编排侧对「规则集未注入」
 * 的既有处置是闸一律拒绝）。
 *
 * `loadRules` 仅为单测注入**失败路径**用（桩件抛错 → undefined）；生产恒用 `defaultShellRules`（单一来源）。
 */
export function buildDesktopShellArming(
  loadRules: () => ReturnType<typeof defaultShellRules> = defaultShellRules,
): DesktopShellArming | undefined {
  try {
    return { classifyShell, rules: loadRules() };
  } catch {
    return undefined;
  }
}

// —————————————————————— 契约形状（**只读导入**；§4 冻结契约家） ——————————————————————
//
// T22：契约三型（`OperatorPrompt` / `OperatorOutcome` / `OperatorChannelFn`）已由 Pi适配器（T20）置入
// **§4 冻结契约家** `src/model/runtime.ts`（§6 通路已开）。此处**删去逐字镜像**、改为**只读导入并原样转出**
// （见文件顶部 import）——**同一契约只许一个形状**。公开面保留原名（既有消费方/测试从本模块取这两型仍可用）。
// **注**：本模块**产出**的通道恒返回确定的 `OperatorOutcome`，窄于 `OperatorChannelFn`（允许空）——不调和，
// 见顶部「形状对不上」。原本地 `OperatorChannel` 别名（同一契约的第二形状）随镜像一并移除。

// —————————————————————— 呈现（命令原文如实展示，避免「糊里糊涂点确定」） ——————————————————————

/** 一次确认请求的**可读呈现**（命令原文 + 规范化 argv + cwd + 升级原因）。 */
export interface ShellCommandDisplay {
  /** 命令**逐字原文**（不加工、不截断——这是人核对的安全依据）。 */
  command: string;
  /** 规范化后的参数数组（逐项）。 */
  argv: string[];
  /** 逐项呈现的参数行（JSON 转义显示，便于人对齐核对）。 */
  argvLines: string[];
  /** 执行工作目录（钉在 projectRoot）。 */
  cwd: string;
  /** 为何升级到人（(b) 拿不准 / 不可用）；无则不展示。 */
  reason?: string;
  /** **手动回落提示**（历史字段）。**2026-10-19 客户裁定后**：开关开启时 manual/row-failed 按拒绝处理、
   *  不再弹卡，本字段不再由 shell 通道设置；渲染侧 `#sc-judge-notice` 仍支持（兼容旧调用方/回放），
   *  无值时隐藏。**不进入 `reasonRaw`**、不改变 `plainReasonFor` 的映射（PM 评审 §10.4）。 */
  judgeNotice?: string;
  /** 人类可读的完整提示文本（presenter 可直接展示）。 */
  text: string;
}

/**
 * 「替我审」判断结果行载荷（桌面自有类型；PM 评审 §6.5，字段名钉死）。
 * 由 `createDesktopOperatorChannel` 在判断 agent 自己做出 allow/deny 后经 `emitJudgeResult` 推送；
 * `manual` / `row-failed` **不产生结果行**（2026-10-19 客户裁定：按拒绝处理，理由经既有 deny 工具结果送达
 * 角色）。`operator` 恒为 `judge:<引擎>`。
 */
export interface ShellJudgeResultPayload {
  version: 1;
  id: string;
  toolCallId: string;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  at: string;
  verdict: "allow" | "deny";
  engine: RuntimeKind;
  model?: string;
  reasonCode: string;
  operator: `judge:${string}`;
  command: string;
  summary: string | null;
  policy: "su-approval" | "project";
  tier: "risky" | "review" | "deny" | null;
  /** 客户 D1：deny 档被 judge 放行；聊天行据此标「deny 档 · judge 放行」。 */
  hardDenyOverride?: true;
  label?: "deny 档 · judge 放行";
  reason?: string;
  customerMessage?: string;
  alternative?: ShellJudgeAlternative;
  evidence?: string[];
  customerMessageSynthesized?: boolean;
}

/**
 * 桌面通道的审计扩展（契约家 `ShellJudgeAudit` 未含本字段；同编排 `ShellJudgeAuditWithLabel` 先例，
 * **不改 `src/model/runtime.ts`**）。
 *
 * 2026-10-19 客户裁定：判断 agent 是唯一审查者——`manual` / `row-failed` 一律按拒绝处理。此时 `judge`
 * 审计字段的 `verdict` 记**通道最终处置** `deny`，`modelVerdict` 保留模型原始事实（`manual` / `allow`），
 * 本标记明确「这不是模型主动 deny」；审计/诊断据此可辨，原 `reasonCode` 也原样保留。
 */
export interface ShellJudgeAuditWithManual extends ShellJudgeAudit {
  manualAsDeny?: true;
}

/** 人对一次 shell 确认的选择。 */
export interface OperatorDecision {
  /** 是否放行。**只有 true 才算放行**；其余一律拒绝。 */
  allow: boolean;
  /** 可选说明（V1 不收集；留作扩展/将来允许附言，拒绝时如实带出为 `reason`）。 */
  note?: string;
}

/** 操作者确认的**表现层**（主进程用 electron dialog 实现；测试可注入替身）。 */
export interface DesktopOperatorMetadata {
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  signal: AbortSignal;
  /** 当前轮投递给该角色的文本（≤4KB，内存内）；仅用于判断，不展示、不入审计。 */
  turnText?: string;
  /** 每会话闭包注入的判断能力（编排 `createShellJudge`）；缺省 ⇒ 不启用判断。 */
  judge?: ShellJudgeFn;
}
export type DesktopOperatorChannelFn = (prompt: OperatorPrompt, metadata?: DesktopOperatorMetadata) => ReturnType<OperatorChannelFn>;

export interface OperatorPresenter {
  /** 把一次确认请求摆给人看，解析为人的选择；通道不可用/抛错 → 由 channel 归为 fail-closed。 */
  present(prompt: OperatorPrompt, display: ShellCommandDisplay, metadata?: DesktopOperatorMetadata): Promise<OperatorDecision>;
}

/** 逐项呈现一行参数：JSON 转义（引号仅为界定符，便于无歧义核对空格/引号）。 */
function argvLine(index: number, arg: string): string {
  return `[${index}] ${JSON.stringify(arg)}`;
}

/**
 * 由请求构造**如实**的可读呈现：命令原文**逐字**、argv**逐项**、cwd 原样、升级原因（有则展示）。
 * 命令原文**不截断**——它正是人要核对的依据（截断会让人漏看尾部的高危操作）。
 */
export function describeShellCommand(prompt: OperatorPrompt): ShellCommandDisplay {
  const command = typeof prompt.command === "string" ? prompt.command : "";
  const argv = normalizeArgv(prompt.argv);
  const cwd = typeof prompt.cwd === "string" ? prompt.cwd : "";
  const reason = typeof prompt.reason === "string" && prompt.reason !== "" ? prompt.reason : undefined;
  const argvLines = argv.map((a, i) => argvLine(i, a));
  const text = renderConfirmText(command, argvLines, cwd, reason);
  return reason === undefined
    ? { command, argv, argvLines, cwd, text }
    : { command, argv, argvLines, cwd, reason, text };
}

/** 组装给操作者看的提示正文（强调「逐字核对」与「放行=真的执行」，并说明为何被问到）。 */
function renderConfirmText(command: string, argvLines: string[], cwd: string, reason?: string): string {
  const argvBlock = argvLines.length > 0 ? argvLines.join("\n") : "（argv 为空）";
  const lines = [
    "受治理 shell 审核 · 操作者确认（第三闸 a）",
    "",
    "这是一条需要在执行前由你**亲自确认**的 shell 命令（pm 模型审读拿不准/不可用，故升级到你）。",
    "请**逐字核对**下面的命令原文后再决定；点「放行」将真的在项目里启动子进程执行它。",
  ];
  if (reason !== undefined) {
    // 为何升级到人（(b) 拿不准 / 不可用的原话）——让操作者知道为什么被问到。
    lines.push("", "── 升级原因（为何交你确认） ──", reason);
  }
  lines.push(
    "",
    "── 命令原文（逐字，未加工） ──",
    command,
    "",
    "── 规范化参数 argv（JSON 转义显示；引号仅为界定符） ──",
    argvBlock,
    "",
    "── 工作目录 cwd ──",
    cwd,
    "",
    "点「拒绝」或关闭对话框 = 不放行（不会执行）。",
  );
  return lines.join("\n");
}

// —————————————————————— 通道（fail-closed 三条） ——————————————————————

export interface CreateOperatorChannelOptions {
  /** 表现层（主进程的 electron dialog）；**未配置 → 一律拒绝**（能力缺席即 fail-closed）。 */
  presenter?: OperatorPresenter;
  /** 操作者标识（随 `OperatorOutcome.operatorId` 交给编排，由其据以得审计 `by`）。空/缺失归为 `unknown`。 */
  operatorId: string;
  /** 确认超时（毫秒）；缺省走 `readConfirmTimeoutMs` 取值链（专用 env → shell 审核预算 env → 120000，
   *  见其注释）。超时 = 拒绝。 */
  timeoutMs?: number;
  /** 可注入环境（读取超时 env）；缺省 `process.env`。 */
  env?: Record<string, string | undefined>;
  /**
   * **「替我审」开关与判断超时**（PM 评审 §6.5）。`isEnabled()` 在主进程是权威状态（默认 false、重载复位）；
   * 关 / 缺省 ⇒ 原 `present` 路径**逐字不变**（客户手批确认卡；客户显式关闭了自动审查）。`timeoutMs`
   * 缺省 135000（driver 120s + 15s 余量；独立于确认卡超时）。
   */
  judge?: { isEnabled: () => boolean; timeoutMs?: number };
  /**
   * **判断结果行推送**（PM 评审 §6.5）：判断 agent 自己做出 allow/deny 时先推一行到请求角色的聊天流。
   * **推达失败（抛错）⇒ 按拒绝处理（`row-failed`，不再弹确认卡）**；deny 推送失败仍 deny，只记诊断。
   * 缺省 ⇒ 视为无法投达（allow ⇒ `row-failed` 拒绝）。
   */
  emitJudgeResult?: (payload: ShellJudgeResultPayload) => void;
}

/**
 * 装配桌面操作者通道。产出的通道**无任何命令判定**，只：呈现原文 → 取人选择 → 归 `OperatorOutcome`。
 * 一切不确定情形（未配置 / 抛错 / 超时）都落到**非放行**结论（fail-closed）——编排据此拒绝。
 * **只有操作者明确放行（恰为 `allow:true`）才返回 `{outcome:"allow"}`。**
 *
 * **「替我审批」（2026-10-17 PM 评审 §5.2/§6.5；2026-10-19 客户裁定）**：开关开且有 `metadata.judge` 时，
 * 在 `present` **之前**调判断闭包（独立超时）。判断 agent 是**唯一审查者**：allow ⇒ 先发结果行再放行；
 * deny ⇒ 格式化原因、发结果行、**不调用 presenter**；manual（命令/上下文过大、预算耗尽、超时、不可用、
 * 解析失败等）⇒ **不调用 presenter，直接按拒绝处理**（理由含具体人话）；结果行投达失败（row-failed）同样
 * **按拒绝处理**、不再弹卡。开关关 / 无 judge / 已中止 ⇒ 原 `present` 路径逐字不变。**本函数依旧不做命令分类**；
 * deny 档放行**不转换**，只按 `tier` 打 `hardDenyOverride` 标记。
 *
 * 返回类型**经推断**为 `(prompt: OperatorPrompt) => Promise<OperatorOutcome>`——**恒返回确定的 `OperatorOutcome`**
 * （所有分支皆返回，绝不返回 `null`/`undefined`），是 §4 冻结契约家 `OperatorChannelFn` 的**结构子类型**。
 * 不显式标注为 `OperatorChannelFn`：那会把本产出**改宽**（声称可能返回空）——非「行为逐字不变」，见文件顶部说明。
 */
export function createDesktopOperatorChannel(opts: CreateOperatorChannelOptions) {
  const operatorId =
    typeof opts.operatorId === "string" && opts.operatorId.trim() !== "" ? opts.operatorId : "unknown";
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? readConfirmTimeoutMs(env);
  const judgeTimeoutMs = resolveShellJudgeChannelTimeoutMs(opts.judge?.timeoutMs, env);
  const judgeLog = createDiagnosticLogger({ component: "desktop.shell-judge" });
  // 结果行幂等键：本通道（每窗口）自增，避免跨角色/跨项目 toolCallId 碰撞时渲染侧误去重。
  let judgeResultSeq = 0;

  return async (prompt: OperatorPrompt, metadata?: DesktopOperatorMetadata): Promise<OperatorOutcome> => {
    const timeoutController = new AbortController();
    let displayMetadata = metadata;
    if (metadata) displayMetadata = { ...metadata, signal: AbortSignal.any([metadata.signal, timeoutController.signal]) };

    /** 原 `present` 路径（逐字保留）——开关关/无 judge/已中止时走它（judge 开启后的 manual/row-failed 不再走这里）。 */
    const presentConfirmed = async (display: ShellCommandDisplay): Promise<OperatorOutcome> => {
      // 退路：通道未配置 → 不可用（能力缺席即 fail-closed；绝不当「没人问、那就放行」）。
      if (opts.presenter === undefined) {
        return { outcome: "unavailable", reason: "操作者确认通道未配置（无 presenter），拒绝执行（fail-closed）" };
      }
      let decision: OperatorDecision;
      try {
        // 超时包装整个确认；超时 = 拒绝（§7.5 退路 3）。
        decision = await withConfirmTimeout(opts.presenter.present(prompt, display, displayMetadata), timeoutMs);
      } catch (err) {
        const timedOut = err instanceof Error && err.name === OPERATOR_CONFIRM_TIMEOUT_NAME;
        // F-4-M2（2026-10-16 客户批准）：超时以**带标记的原因**中止组合信号——呈现侧（cancel）据
        // `AbortSignal.any` 传播的 `signal.reason` 分流失效原因：超时 ⇒ 如实「操作者确认超时（>Nms）…」
        // （此前被误报成「本轮已结束、停止或会话已重建」）；轮次中止/重建 ⇒ 原中止（reason 为默认 AbortError）。
        // 判定不变：两者都落 unavailable（fail-closed），绝不默认放行。
        if (timedOut) timeoutController.abort(confirmTimeoutError(timeoutMs));
        else timeoutController.abort();
        return {
          outcome: "unavailable",
          reason: timedOut
            ? `操作者确认超时（>${timeoutMs}ms），拒绝执行（fail-closed）`
            : `操作者确认通道不可用，拒绝执行（fail-closed）：${reasonOf(err)}`,
        };
      }

      // 人明确放行（恰为 true）才放行；拒绝/缺字段/非布尔 → 一律拒绝。
      if (decision.allow !== true) {
        return { outcome: "deny", operatorId, reason: decision.note ?? "操作者拒绝执行" };
      }
      return { outcome: "allow", operatorId };
    };

    // —— 前置条件（PM 评审 §5.2）：开关关 / 无 judge / 已中止 ⇒ 原 present（逐字不变）。 ——
    let judgeEnabled = false;
    try {
      judgeEnabled = opts.judge?.isEnabled() === true;
    } catch {
      judgeEnabled = false; // 开关读取异常 ⇒ 视作关闭（绝不擅自开启判断）。
    }
    const judgeFn = metadata?.judge;
    if (!judgeEnabled || judgeFn === undefined || metadata === undefined || metadata.signal.aborted === true) {
      return presentConfirmed(describeShellCommand(prompt));
    }

    // —— 判断请求：来源/策略/档位来自**会话闭包**（metadata），不信任渲染侧。 ——
    const tier = parseSuApprovalTier(prompt.reason);
    const policy: "su-approval" | "project" = tier !== null ? "su-approval" : "project";
    const judgeRequest: ShellJudgeRequest = {
      command: typeof prompt.command === "string" ? prompt.command : "",
      argv: normalizeArgv(prompt.argv),
      cwd: typeof prompt.cwd === "string" ? prompt.cwd : "",
      toolCallId: typeof prompt.toolCallId === "string" ? prompt.toolCallId : "",
      roleId: metadata.roleId,
      projectRoot: metadata.projectRoot,
      runtime: metadata.runtime,
      policy,
      tier,
      ...(typeof prompt.reason === "string" && prompt.reason !== "" ? { reason: prompt.reason } : {}),
      ...(metadata.turnText !== undefined ? { turnText: metadata.turnText } : {}),
    };

    // 独立超时（15s 缺省）：以组合信号中止判断；超时只影响「是否弹卡」，不改变 fail-closed。
    const judgeController = new AbortController();
    const judgeSignal = AbortSignal.any([metadata.signal, judgeController.signal]);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: ShellJudgeOutcome;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          judgeController.abort();
          reject(judgeTimeoutError(judgeTimeoutMs));
        }, judgeTimeoutMs);
      });
      outcome = await Promise.race([judgeFn(judgeRequest, judgeSignal), timeout]);
    } catch (err) {
      // 编排 `createShellJudge` 契约上不抛错；这里是**防御**映射（仍不默认放行）。
      const aborted: boolean = metadata.signal.aborted;
      outcome = {
        verdict: "manual",
        reasonCode: timedOut ? "timeout" : aborted ? "aborted" : "unavailable",
        reason: timedOut
          ? `判断超时（>${judgeTimeoutMs}ms），已转手动确认。`
          : aborted
            ? "本轮已中止，判断结果不生效（交回既有中止路径）。"
            : `判断异常：${reasonOf(err)}。已转手动确认。`,
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    const engine = metadata.runtime;
    const operator = `judge:${engine}` as `judge:${string}`;

    if (outcome.verdict === "manual") {
      // **2026-10-19 客户裁定：判断 agent 是唯一审查者——manual 不再弹客户确认卡，直接按拒绝处理。**
      // 真机：test-engineer 的巨大内联 `node -e` ⇒ manual/context-too-large 仍弹「放行执行/拒绝」卡。
      // 拒绝理由复用 `judgeManualHumanReason` 的具体人话；审计/诊断保留原 reasonCode 与
      // `modelVerdict:"manual"`/`manualAsDeny` 事实，**不伪装成模型主动 deny**。
      // 角色侧经既有 deny 工具结果（`run_shell 未执行：审核拒绝（<reason>…）`）看到理由；不产生结果行。
      const reason = manualJudgeDenyReason(outcome.reasonCode, outcome.reason);
      judgeLog.record("shell-judge.manual.denied", {
        toolCallId: judgeRequest.toolCallId,
        roleId: metadata.roleId,
        runtime: metadata.runtime,
        decision: `${policy}:${tier ?? "null"}:manual`,
        outcome: "manual",
        reasonCode: outcome.reasonCode,
      });
      const denyAudit: ShellJudgeAuditWithManual = {
        engine,
        verdict: "deny",
        modelVerdict: outcome.modelVerdict ?? "manual",
        reasonCode: outcome.reasonCode,
        tier,
        manualAsDeny: true,
        reason,
        ...(outcome.model !== undefined ? { model: outcome.model } : {}),
      };
      return { outcome: "deny", operatorId: operator, reason, judge: denyAudit };
    }

    // 客户 D1：deny 档放行**只按 tier 置标记**，不转换、不拦截、不弹卡。
    const hardDenyOverride = outcome.verdict === "allow" && (tier === "deny" || outcome.hardDenyOverride === true);
    const label = hardDenyOverride ? ("deny 档 · judge 放行" as const) : undefined;
    const audit: ShellJudgeAudit & { label?: typeof label } = {
      engine,
      verdict: outcome.verdict,
      reasonCode: outcome.reasonCode,
      tier,
      ...(outcome.model !== undefined ? { model: outcome.model } : {}),
      ...(hardDenyOverride ? { hardDenyOverride: true as const } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
      ...(outcome.customerMessage !== undefined ? { customerMessage: outcome.customerMessage } : {}),
      ...(outcome.alternative !== undefined ? { alternative: outcome.alternative } : {}),
      ...(outcome.customerMessageSynthesized !== undefined
        ? { customerMessageSynthesized: outcome.customerMessageSynthesized }
        : {}),
    };
    const payload: ShellJudgeResultPayload = {
      version: 1,
      id: `sj-${++judgeResultSeq}`,
      toolCallId: judgeRequest.toolCallId,
      roleId: metadata.roleId,
      projectRoot: metadata.projectRoot,
      runtime: metadata.runtime,
      at: new Date().toISOString(),
      verdict: outcome.verdict,
      engine,
      ...(outcome.model !== undefined ? { model: outcome.model } : {}),
      reasonCode: outcome.reasonCode,
      operator,
      command: judgeRequest.command,
      summary: shellIntentSummary(judgeRequest.command),
      policy,
      tier,
      ...(hardDenyOverride ? { hardDenyOverride: true as const } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
      ...(outcome.customerMessage !== undefined ? { customerMessage: outcome.customerMessage } : {}),
      ...(outcome.alternative !== undefined ? { alternative: outcome.alternative } : {}),
      ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
      ...(outcome.customerMessageSynthesized !== undefined
        ? { customerMessageSynthesized: outcome.customerMessageSynthesized }
        : {}),
    };
    // 审计/诊断同时保留 **c 规则判定**（policy/tier）与 **judge 结论**（verdict/reasonCode）。
    // 2026-10-18 客户裁定：第一层规则只快速放行/作参考，**不拒绝任何请求**——deny 档同样进入本判断。
    // 诊断字段走共享白名单：`decision` 承载「policy:tier:verdict」三元（tier/policy/verdict 无独立白名单名）。
    judgeLog.record("shell-judge.decision", {
      requestId: payload.id,
      toolCallId: payload.toolCallId,
      roleId: metadata.roleId,
      runtime: metadata.runtime,
      decision: `${policy}:${tier ?? "null"}:${outcome.verdict}`,
      outcome: outcome.verdict,
      reasonCode: outcome.reasonCode,
    });

    if (outcome.verdict === "allow") {
      // **结果行是放行条件**：投达失败 ⇒ 按拒绝处理（row-failed），**不再弹客户确认卡**（2026-10-19 裁定）。
      try {
        if (opts.emitJudgeResult === undefined) throw new Error("判断结果行通道未配置");
        opts.emitJudgeResult(payload);
      } catch (err) {
        const detail = reasonOf(err);
        judgeLog.record("shell-judge.row.failed", {
          requestId: payload.id,
          toolCallId: payload.toolCallId,
          decision: `${policy}:${tier ?? "null"}:row-failed`,
          outcome: "deny",
          reasonCode: "row-failed",
          errorMessage: detail,
        });
        const reason = rowFailedJudgeDenyReason(detail);
        const denyAudit: ShellJudgeAuditWithManual = {
          engine,
          verdict: "deny",
          modelVerdict: outcome.modelVerdict ?? "allow",
          reasonCode: "row-failed",
          tier,
          manualAsDeny: true,
          reason,
          ...(outcome.model !== undefined ? { model: outcome.model } : {}),
        };
        return { outcome: "deny", operatorId: operator, reason, judge: denyAudit };
      }
      return { outcome: "allow", operatorId: operator, judge: audit };
    }

    // deny：发结果行（失败**只记诊断**，仍 deny——拒绝是安全方向）；**不调用 presenter**。
    try {
      if (opts.emitJudgeResult === undefined) throw new Error("判断结果行通道未配置");
      opts.emitJudgeResult(payload);
    } catch (err) {
      judgeLog.record("shell-judge.row.failed", { requestId: payload.id, toolCallId: payload.toolCallId, verdict: payload.verdict, reason: reasonOf(err) });
    }
    return { outcome: "deny", operatorId: operator, reason: formatJudgeDenyReason(outcome), judge: audit };
  };
}

/**
 * `manual` → **拒绝**的返回理由（2026-10-19 客户裁定：「审查只有同意和拒绝，不需要我来同意，拒绝要给理由」）。
 *
 * 复用 `judgeManualHumanReason` 的**具体人话**（命令/上下文过大、读取预算耗尽、超时、不可用、解析失败、
 * 读取被拒的具体路径……），明确「未完成自动审查 = 已拒绝」，并按 reasonCode 给出可行出路。
 * **不含「已转你手动确认」**——开关开启时不再弹客户确认卡。该文本随 `OperatorOutcome.deny.reason` 进入
 * 编排与既有 deny 工具结果（`run_shell 未执行：审核拒绝（<reason>…）`），角色因此能看到拒绝理由。
 */
export function manualJudgeDenyReason(reasonCode: string, reason?: string): string {
  const human = stripTrailingSentencePunct(judgeManualHumanReason(reasonCode, reason));
  return `${human}，无法完成自动审查，已拒绝；${manualDenyAdvice(reasonCode)}`;
}

/** `manual` → deny 的出路建议（按 reasonCode；未知码给通用句）。 */
function manualDenyAdvice(reasonCode: string): string {
  switch (reasonCode) {
    case "context-too-large":
      return "请改用落盘脚本或拆分命令后重试。";
    case "budget":
    case "read-truncated":
      return "请缩小判断范围（改用落盘脚本或拆分命令）后重试。";
    case "read-denied":
      return "请缩小读取范围或改用落盘脚本后重试。";
    case "aborted":
      return "本轮已中止，命令未执行；如仍需执行请重新发起。";
    case "unsupported-engine":
    case "context-missing":
      return "请关闭「替我审批」后手动确认。";
    default:
      return "请重试，如持续失败请关闭「替我审批」后手动确认。";
  }
}

/** `row-failed`（判断结果行投达失败）→ 拒绝的返回理由：结果行是放行条件，投达失败即 fail-closed。 */
export function rowFailedJudgeDenyReason(detail: string): string {
  return `审查结果投达失败，无法在聊天中显示判断结论，已拒绝；${stripTrailingSentencePunct(detail)}。`;
}

/**
 * `manual` 的**旧卡片提示**（PM 评审 §10.4）。**2026-10-19 客户裁定后**：开关开启的 shell 通道不再弹
 * 确认卡，本函数**不再用于该路径**；保留导出仅为兼容既有调用方与渲染侧同名文案口径（`ui-labels.js`）。
 * manual 现按拒绝处理，见 `manualJudgeDenyReason`。
 */
export function manualJudgeNotice(reasonCode: string, reason?: string): string {
  if (reasonCode === "row-failed") {
    return "判断 agent 已完成判断，但结果无法在聊天中显示；规则判定仅作参考，本卡已转你手动确认。";
  }
  return `判断 agent 未能完成判断：${stripTrailingSentencePunct(judgeManualHumanReason(reasonCode, reason))}。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。`;
}

/** reasonCode → 人话（未知码回落到判断给出的有界理由；绝不复述内部行话以外的细节）。 */
function judgeManualHumanReason(reasonCode: string, reason?: string): string {
  switch (reasonCode) {
    case "unsupported-engine": return "当前引擎不支持自动判断";
    case "unavailable": return "判断服务不可用";
    case "timeout": return "判断超时";
    case "aborted": return "本轮已中止";
    case "parse-failed": return "判断结果无法解析";
    case "read-denied": return readDeniedHumanReason(reason);
    case "budget": return "读取预算已用尽";
    case "read-truncated": return "读取内容被截断";
    case "retry-capped": return "同类命令连续被拒，已达重试上限";
    case "context-missing": return "缺少当前轮任务上下文";
    case "context-too-large": return "命令或上下文过大";
    case "model-manual": return "判断 agent 自报无法判断";
    default: {
      const text = typeof reason === "string" ? reason.trim() : "";
      return text !== "" ? text.slice(0, 200) : "判断未完成";
    }
  }
}

/** `deny` 返回请求角色的文本（PM 评审 §8.4 逐行口径）；应用不自动重试、不自动执行替代方案。 */
export function formatJudgeDenyReason(outcome: Pick<ShellJudgeOutcome, "reason" | "customerMessage" | "alternative">): string {
  const lines = ["判断 agent 未放行该命令。"];
  const customerMessage = typeof outcome.customerMessage === "string" ? outcome.customerMessage.trim() : "";
  if (customerMessage !== "") lines.push(`请向客户说明：${customerMessage}`);
  const reason = typeof outcome.reason === "string" ? outcome.reason.trim() : "";
  if (reason !== "") lines.push(`原因：${reason}`);
  if (outcome.alternative !== undefined) {
    lines.push(`替代方案（${outcome.alternative.kind}）：${outcome.alternative.value}`);
  }
  lines.push("出路：如需执行，请关闭「替我审批」后重试。");
  return lines.join("\n");
}

// —————————————————————— M-1（2026-10-12 客户裁定「这个太丑了」）：应用内确认卡 ——————————————————————
//
// 客户看截图裁定：原生 `dialog.showMessageBox` 的确认框「太丑了」——一堵技术文本墙（argv JSON 列表 + 行话式
// 升级原因）。(a) 层改为**应用内卡片**：标题 + **等宽命令原文块**（逐字、不美化）+ 一句白话摘要 +
// 「为什么问你」的人话映射 + 折叠的技术详情（argv/cwd）。**fail-closed 逐字不变**：关闭 / 取消 / Esc /
// 超时 / 通道不可用 → **不放行**（本文件只产**数据面**与裁决；卡片形态在渲染侧；「恰好 allow 才 spawn」的
// 唯一保证仍在 Pi 适配器 execute）。

/** 白话摘要：把命令**首词**（可执行名）如实摘出；无从概括（空命令/空白）⇒ `null`（**绝不编意图**）。 */
export function shellIntentSummary(command: string): string | null {
  const firstLine = String(command == null ? "" : command)
    .split(/\r?\n/)
    .find((l) => l.trim() !== "");
  if (firstLine === undefined) return null;
  const word = firstLine.trim().split(/\s+/)[0];
  if (word === undefined || word === "") return null;
  return `它会在项目里执行：${word}`;
}

/** **su 审批档原因解析（2026-10-17）**：只认**行首固定前缀** `su-审批档[tier]`（前缀单一来源＝编排
 *  `shell-arming.ts` 公共再导出）。**先匹配前缀**，避免与既有 `/risky/i` 等泛匹配串线；项目角色三层链
 *  的原因**永不带此前缀** ⇒ 恒 `null`（`policy: "project"`）。 */
const SU_APPROVAL_REASON_RE = new RegExp(
  `^${SU_APPROVAL_REASON_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\[(risky|review|deny)\\]`,
);

export function parseSuApprovalTier(reason: unknown): SuApprovalTier | null {
  if (typeof reason !== "string") return null;
  const match = SU_APPROVAL_REASON_RE.exec(reason.trim());
  return match === null ? null : (match[1] as SuApprovalTier);
}

/**
 * **审批档展示用的角色名**（2026-10-19 客户反馈：五个内置治理角色都走同一审批档，卡片不应再一律写「SU」）。
 * 纯展示映射；**内部解析前缀 `su-审批档[tier]` 保持原样**（兼容旧驱动/编排，解析见 `parseSuApprovalTier`）。
 *  · single/su、缺省（无角色上下文）或非内置治理 id（项目角色）⇒ `"SU"`——旧文案逐字保留；
 *    项目角色的 reason 本就不带审批档前缀，正常不会走到本分支；
 *  · trio 内置治理角色（liaison/rapporteur/nominator/convener/verifier）⇒ 注册表统一显示名
 *    （`Lead / 主理`、`Proof / 验收` 等）；调用方显式给出的 displayName 优先。
 */
export function approvalRoleDisplayName(roleId?: string, displayName?: string): string {
  const id = typeof roleId === "string" ? roleId.trim() : "";
  const spec = id === "" || id === "su" ? undefined : governanceRoleOf(id);
  if (spec === undefined) return "SU";
  const explicit = typeof displayName === "string" ? displayName.trim() : "";
  return explicit !== "" ? explicit : spec.displayName;
}

/** su 审批档的人话（单一来源在本模块；含三条必备披露：逐条客户批准 / 拒绝超时通道不可用＝拒绝 /
 *  批准后可能绕过 ANS 文件写边界）。档位名：deny＝硬拒类、risky/review 各用其档位名。
 *  `roleDisplayName` 为展示用角色名（内置治理角色⇒其显示名；single/su/缺省⇒`SU`，旧文案逐字保留）。 */
function suApprovalPlainReason(tier: SuApprovalTier, roleDisplayName?: string): string {
  const role = typeof roleDisplayName === "string" && roleDisplayName.trim() !== "" ? roleDisplayName.trim() : "SU";
  const tierText =
    tier === "deny" ? "硬拒类（deny）" : tier === "risky" ? "风险命令（risky）" : "未自动判定（review）";
  return (
    `${role} 审批档：${tierText}——须逐条客户批准才执行；` +
    "批准后可能绕过 ANS 文件写边界（命令以当前 OS 用户权限运行）。" +
    "拒绝/超时/通道不可用 = 拒绝；默认拒绝、无「记住」，不自动通过。"
  );
}

/** 升级原因 → **人话**（(b) 判读的内部用语**不得**原样示人；未识别一律给 fail-closed 通用句——
 *  既不泄行话、也**不替审核编造结论**；原始措辞只进渲染侧折叠详情供核查）。
 *  **su 审批档前缀优先**（2026-10-17）——先按行首前缀解析，再走既有项目角色映射（逐字不变）。
 *  `roleDisplayName` 仅影响审批档文案的角色名（2026-10-19：内置治理角色按实际角色显示；缺省仍为 `SU`）。 */
export function plainReasonFor(reason: unknown, roleDisplayName?: string): string {
  const raw = typeof reason === "string" ? reason : "";
  const suTier = parseSuApprovalTier(raw);
  if (suTier !== null) return suApprovalPlainReason(suTier, roleDisplayName);
  if (/risky/i.test(raw)) return "自动审核判定这条命令有风险——按治理规则，有风险的命令必须由你亲自确认才能执行。";
  if (/超时|timeout/i.test(raw)) return "自动审核超时，未给出结论——按 fail-closed 交你确认。";
  if (/json|解析|parse/i.test(raw)) return "自动审核给出的结论无法解析，未能形成明确意见——按 fail-closed 交你确认。";
  if (/报错|异常|error/i.test(raw)) return "自动审核出错了，未给出结论——按 fail-closed 交你确认。";
  if (/未接入|无会话|不可用|unavailable/i.test(raw)) return "自动审核当前不可用（审读会话未接上）——按 fail-closed 交你确认。";
  if (/拿不准|不确定/.test(raw)) return "自动审核拿不准——按 fail-closed 交你确认。";
  return "审核未能给出明确结论，按 fail-closed 交你确认。";
}

/** 确认卡的**数据面**（主进程 → 渲染侧；只呈现，不含任何判定）。 */
export interface ShellConfirmRequest {
  id: string;
  roleId?: string;
  projectRoot?: string;
  runtime?: import("../../src/model/runtime.ts").RuntimeKind;
  /** 命令**逐字原文**（决不改写/截断——它是人核对的唯一依据）。 */
  command: string;
  /** 白话摘要（`shellIntentSummary`；无从概括为 null——渲染侧隐藏该行）。 */
  summary: string | null;
  /** 「为什么问你」——人话（`plainReasonFor`；内部行话不外露）。审批档文案按实际内置治理角色显示
   *  （如「Proof / 验收 审批档：…」；single/su/缺省仍为「SU 审批档」——2026-10-19 客户反馈）。 */
  reasonPlain: string;
  /** 升级原因的**原文**（仅供折叠详情里的核查；可为 null）。 */
  reasonRaw: string | null;
  /** 规范化 argv 逐项行（JSON 转义显示；引号仅为界定符——**折叠详情**里才见）。 */
  argvLines: string[];
  /** 执行工作目录（钉在项目根）。 */
  cwd: string;
  /** **su 审批档位**（2026-10-17；桌面自有类型，不改契约家 `OperatorPrompt`）：仅在 reason 行首命中
   *  `su-审批档[tier]` 时给出；项目角色三层链恒 `null`。 */
  tier: SuApprovalTier | null;
  /** **审批策略**：`su-approval`（内置治理角色审批档）或 `project`（项目角色三层链）。桌面自有类型。 */
  policy: "su-approval" | "project";
  /** 「替我审」手动回落提示（原样来自 `display.judgeNotice`；无值 ⇒ 隐藏，PM 评审 §10.4）。 */
  judgeNotice?: string;
}

/** 由既有呈现（`describeShellCommand` 的产物）构建确认卡数据面（纯函数；命令原文逐字转抄）。
 *  `roleDisplayName` 为展示用角色名（`approvalRoleDisplayName` 的产物）——只影响审批档的
 *  `reasonPlain` 文案；`reasonRaw`/`tier`/`policy` 与内部前缀解析**逐字不变**（解析兼容）。 */
export function buildShellConfirmRequest(
  id: string,
  display: ShellCommandDisplay,
  roleDisplayName?: string,
): ShellConfirmRequest {
  const reasonRaw = typeof display.reason === "string" && display.reason !== "" ? display.reason : null;
  const tier = parseSuApprovalTier(reasonRaw);
  return {
    id,
    command: display.command,
    summary: shellIntentSummary(display.command),
    reasonPlain: plainReasonFor(reasonRaw, roleDisplayName),
    reasonRaw,
    argvLines: display.argvLines,
    cwd: display.cwd,
    tier,
    policy: tier !== null ? "su-approval" : "project",
    // PM 评审 §10.4：`buildShellConfirmRequest` **原样拷贝**；presenter 不得改写或丢弃。
    ...(display.judgeNotice !== undefined ? { judgeNotice: display.judgeNotice } : {}),
  };
}

export interface CreateShellConfirmPresenterOptions {
  onExpired?: (payload: import("./customer-input.ts").OperatorExpiredPayload) => void;
  /** 把确认请求推给渲染侧（主进程用 `webContents.send("shell:confirm-request", …)`；测试注入收集器）。
   *  **推达失败（窗口已关/通道异常）⇒ 抛错**——`createDesktopOperatorChannel` 归为 unavailable，fail-closed。 */
  present: (request: ShellConfirmRequest) => void;
  /** 清理兜底（毫秒；**只做内存清理与兜底不放行**——判定语义仍由**通道**的超时决定：谁先到谁生效）。
   *  缺省 = 通道确认超时（同 env）+ 5000（给通道先判「超时 = unavailable」留出先手）。 */
  cleanupAfterMs?: number;
  /** 可注入环境（读取超时 env；缺省 `process.env`）。 */
  env?: Record<string, string | undefined>;
}

/** 应用内确认卡的**呈现端**（挂在主进程；渲染侧只渲染，不判定）。 */
export interface ShellConfirmPresenter {
  presenter: OperatorPresenter;
  /** 受理渲染侧的决定回包：**恰 `allow:true` 才放行**；其余（含缺字段/非布尔）= 拒绝；
   *  未知/已失效 id → `{ok:false, expired:true}`（**不放行**——超时/重启后的旧回包绝无放行语义）。 */
  respond(input: unknown): { ok: boolean; error?: string; expired?: boolean };
  /** 全部挂起 → **不放行**（窗口关闭等；fail-closed）。 */
  rejectAllPending(_reason: string): void;
  /** 当前挂起数（测试/诊断）。 */
  pendingCount(): number;
  /** **按角色挂起数**（G-2/W1 依赖项：看护信号 #1「正确等待不报」的按角色 pending 视图——
   *  带挂起 shell 确认卡的角色不计入「轮次逼近超时」预警）。 */
  pendingRoles(): Map<string, number>;
  replayPending(): number;
}

/**
 * 构造 shell 确认卡呈现端。**G-2/W5（2026-10-16）**：pending/replay/expire 机制抽入共享通用件
 * `confirm-card.ts`（与恢复确认卡同件）；本函数的**对外行为逐字保留**——恰 allow:true 才放行、未知 id
 * expired、兜底清理计时（`cleanupAfterMs`）、超时/中止两个来源的失效分流（带标记 reason）与诊断事件名
 * （`shell-confirm.presented/responded/expired/timeout/cancelled/replayed/replay.failed/expiration.failed`）全部不变。
 */
export function createShellConfirmPresenter(opts: CreateShellConfirmPresenterOptions): ShellConfirmPresenter {
  const env = opts.env ?? process.env;
  const cleanupAfterMs = opts.cleanupAfterMs ?? readConfirmTimeoutMs(env) + 5000;
  const core = createConfirmCardCore<ShellConfirmRequest>({
    idPrefix: "sc-",
    eventPrefix: "shell-confirm",
    component: "desktop.shell-confirm",
    present: opts.present,
    expiredResponse: "此确认已失效（超时或应用重启），未获放行——请让角色重新发起。",
    onExpired: (payload) => {
      opts.onExpired?.({
        id: payload.id,
        roleId: payload.metadata?.roleId ?? "",
        projectRoot: payload.metadata?.projectRoot,
        runtime: payload.metadata?.runtime,
        reason: payload.reason,
      });
    },
  });
  return {
    presenter: {
      async present(_prompt: OperatorPrompt, display: ShellCommandDisplay, metadata?: DesktopOperatorMetadata): Promise<OperatorDecision> {
        // 2026-10-19 客户反馈：审批档文案按**实际内置治理角色**显示（verifier ⇒「Proof / 验收 审批档」）；
        // 只映射展示名，内部 `su-审批档[tier]` 前缀与 tier/policy 解析不变。缺省/su ⇒「SU」旧文案。
        const roleDisplayName = approvalRoleDisplayName(metadata?.roleId);
        const allowed = await core.mount(
          (id) => {
            const request = buildShellConfirmRequest(id, display, roleDisplayName);
            if (metadata) {
              request.roleId = metadata.roleId;
              request.projectRoot = metadata.projectRoot;
              request.runtime = metadata.runtime;
            }
            return request;
          },
          metadata,
          {
            cleanupAfterMs,
            // F-4-M2 + F-4-opt2（2026-10-16 客户批准）：按组合信号传播的中止原因**分流**——超时 ⇒ 如实超时文案
            // （「未获放行——可让角色重新发起」，不再误报「本轮已结束」）；轮次中止/重建 ⇒ 原文案。两路各补一条
            // 诊断（`shell-confirm.timeout/cancelled`）——上一轮真机「是否渲染/为何消失」不可判定的直接原因即此处
            // 无记录；此后卡片的每一种去向（responded/expired/timeout/cancelled）都可判定。
            abortDisposition: (reason) => {
              if (reason instanceof Error && reason.name === OPERATOR_CONFIRM_TIMEOUT_NAME) {
                const timeoutMs = (reason as Error & { timeoutMs?: unknown }).timeoutMs;
                const n = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? timeoutMs : undefined;
                return {
                  reason: n !== undefined ? `操作者确认超时（>${n}ms），未获放行——可让角色重新发起。` : "操作者确认超时，未获放行——可让角色重新发起。",
                  diagnosticEvent: "shell-confirm.timeout",
                  ...(n !== undefined ? { fields: { durationMs: n } } : {}),
                };
              }
              return { reason: "本轮已结束、停止或会话已重建，旧 shell 确认失效。", diagnosticEvent: "shell-confirm.cancelled" };
            },
          },
        );
        // 恰 allow:true 才放行；其余（含缺字段/非布尔/失效）= 拒绝。
        return { allow: allowed };
      },
    },
    respond: core.respond,
    rejectAllPending: core.rejectAllPending,
    pendingCount: core.pendingCount,
    pendingRoles: core.pendingRoles,
    replayPending: core.replayPending,
  };
}

// —————————————————————— 内部辅助 ——————————————————————

const OPERATOR_CONFIRM_TIMEOUT_NAME = "OperatorConfirmTimeoutError";
const SHELL_JUDGE_CHANNEL_TIMEOUT_NAME = "ShellJudgeChannelTimeoutError";

/** 判断通道独立超时（与确认卡超时互不占用；超时 ⇒ manual/timeout）。 */
function judgeTimeoutError(timeoutMs: number): Error {
  const err = new Error(`判断超时（${timeoutMs}ms）：未在时限内得到判断结论。`) as Error & { timeoutMs?: number };
  err.name = SHELL_JUDGE_CHANNEL_TIMEOUT_NAME;
  err.timeoutMs = timeoutMs;
  return err;
}

/** 构造带标记的超时错误（与 pi-adapter/timeout.ts 同风格，但**本角色自持**——不跨角色导入他人私有 common/）。
 *  **F-4-M2**：`timeoutMs` 随错误对象携带——中止组合信号后，呈现侧凭 `signal.reason` 写出含实际时限的如实文案。 */
function confirmTimeoutError(timeoutMs: number): Error {
  const err = new Error(`操作者确认超时（${timeoutMs}ms）：未在时限内得到操作者选择。`) as Error & { timeoutMs?: number };
  err.name = OPERATOR_CONFIRM_TIMEOUT_NAME;
  err.timeoutMs = timeoutMs;
  return err;
}

/** 给确认 Promise 施加硬超时；超时 → reject 一个带标记的超时错误。非正/非有限时限不加超时。 */
async function withConfirmTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(confirmTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 从环境变量读取确认超时，**取值链（F-4-M1，2026-10-16 客户批准）**：
 *   ① 专用覆盖 `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`（显式优先）；
 *   ② 未设（或非法）时**跟随 shell 审核预算** `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`（env 名常量从既有单一来源
 *      `src/common/编排/shell-deadline.ts` 只读导入——与 shell-gate 的同一引用，本层不另写字面量）；
 *   ③ 都未设（或非法）⇒ 默认 `DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS`（120000）。
 * 理由（真机 F-4）：审核预算放宽到 300s 时，桌面侧 120s 独立默认把「人工确认窗口」**静默钳制**在 120s——
 * present→deny 恰好 120.000s。本项把「(a) 窗口跟随审核预算」从桌面侧恢复一致；**判定不变**：超时仍是
 * unavailable（编排据此拒），fail-closed 逐字不动。
 */
function readConfirmTimeoutMs(env: Record<string, string | undefined>): number {
  return (
    readPositiveMs(env[OPERATOR_CONFIRM_TIMEOUT_ENV]) ??
    readPositiveMs(env[SHELL_REVIEW_TIMEOUT_ENV]) ??
    DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS
  );
}

/** 解析一个正整数毫秒值；缺失/空白/非数字/非正值 ⇒ undefined（沿链回退）。 */
function readPositiveMs(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
