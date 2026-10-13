// 会话适配器（契约 §4 的 src/provider/pi/session.ts）。
//
// 归属：Pi适配器角色。
// 本文件导出契约 §4 冻结的全部类型与两个工厂：
//   1. createFakeRuntimeAdapter —— **仅单元测试用**，不调用任何真实 SDK，
//      按 script 模拟模型动作，动作经受治理工具（buildGovernedTools）执行。
//   2. createPiRuntimeAdapter —— 真实适配器，基于 @earendil-works/pi-coding-agent。
//
// ⚠️ 依赖隔离：本模块**静态不导入任何 Pi 包**——因此加载本模块（含假适配器与全部
//    单测）不需要安装 Pi。真实实现放在私有 src/common/pi-adapter/real-adapter.ts，
//    仅在 createPiRuntimeAdapter 的返回对象被**实际调用**时经动态 import 懒加载。

import type { ResolvedRole } from "../../model/role.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { PinEntry } from "../../model/boundary.ts";
import { buildGovernedTools } from "./tools.ts";
import { createEventQueue } from "../../common/pi-adapter/event-queue.ts";
import { resolvePiProviderConfig, type PiProviderConfigInput } from "../../common/pi-adapter/provider-config.ts";

// —————————————————————— 契约 §4 冻结类型 ——————————————————————

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SessionEvent {
  kind: "tool_call" | "denied" | "accepted" | "message" | "settled";
  summary: string;
  detail?: unknown;
}

/**
 * 会话入参可携带的**图片块**（设计 K-2）。形状**逐字**取自 pi-ai 的 `ImageContent`
 * （`node_modules/@earendil-works/pi-ai/dist/types.d.ts:277-281`：`{ type:"image"; data; mimeType }`，
 * `data` 为 base64 字符串）——**与 anthropic 原始形状不同**：SDK 在发送时自行转成 wire 形状
 * `{ type:"image", source:{ type:"base64", media_type: mimeType, data } }`
 * （`dist/api/anthropic-messages.js:88-104`；纯图无文时自动补 "(see attached image)"，:105-110）。
 * 本文件**静态不导入任何 Pi 包**，故此处**逐字声明**镜像（同 FinalizeResult 等既有先例）。
 */
export interface PromptImage {
  type: "image";
  /** base64 编码的图片数据（不含 data: 前缀）。 */
  data: string;
  /** MIME 类型，如 "image/png" / "image/jpeg"。 */
  mimeType: string;
}

/** `RoleSession.prompt` 的可选参数（设计 K-2）。 */
export interface PromptOptions {
  /** 可选图片附件（经 `session.prompt(text, { images })` 透传给 SDK）。 */
  images?: PromptImage[];
}

export interface RoleSession {
  /**
   * 发送一条用户输入。**无第二参时逐字保留旧行为**（纯文本）。
   * 带图（`opts.images`）时透传给 SDK 的 `prompt(text, options)`；模型是否多模态**不由本层猜测**
   * （不按 `Model.input` 门控）——网关若拒绝，错误以该轮 `stopReason:"error"` 消息进入事件流，
   * 或以异常上抛（两条路径 real-adapter 均已如实外推）。
   */
  prompt(text: string, opts?: PromptOptions): Promise<void>;
  events(): AsyncIterable<SessionEvent>;
  /**
   * 中止**当前进行中的 prompt 轮次**（产品提案 P0-2「停当前轮次」，2026-10-13 客户批准；
   * 本条是其第一环——运行时适配器契约与真适配器；编排句柄与桌面停止入口的接线为后续环节）。
   *
   * **可选方法**（契约演进，同 `PromptOptions` 先例）：既有实现/替身**不实现它也完全合法**；
   * 消费方必须以 `session.abort?.()` 调用——缺席表示**该运行时不支持停止**，上层须如实告知
   * （如「当前运行时不支持停止」），**不得静默装作已停**。落点说明：中止是**会话级**语义——
   * 「当前进行中的轮次」只存在于 `bindRole` 返回的会话对象上（`RuntimeAdapter` 是工厂，无轮次可言），
   * 故钉在本接口而非工厂接口；编排句柄包装的正是本对象。
   *
   * 语义（真适配器实现 = Pi SDK `session.abort()`，见 real-adapter 的 `makeRoleSession`）：
   * - 停**当前轮**（模型生成与工具执行一并停），**不销毁会话**——abort 后本会话仍可继续发下一条
   *   （历史与模型上下文保留）；与 `dispose`（收口整只会话）不同。
   * - **无进行中轮次时调用 = no-op**（不抛错、无副作用）。
   * - **中止后 settled 仍会发射**（既有行为）：SDK 的 `agent_settled` 无论中止与否都发（X-1 唯一
   *   发射点照常映射）——消费方按 `settled` 收尾本轮，**不会挂起**；进行中的 `prompt()` promise
   *   亦正常返回（SDK 把中止落成 `stopReason:"aborted"` 的收尾消息，不向上拒绝）。
   * - **等待中的客户确认/交互一并 fail-closed**：abort 中止该轮 run 级 AbortSignal，交互工具的
   *   `raceAbort`（设计 A-6）立即以「未获客户同意」返回（SDK 已天然带动，无需另接）。
   * - 错误如实上抛（不吞错）；实现方与消费方都不得把「已请求中止」谎报为「已完成」。
   */
  abort?(): Promise<void> | void;
  dispose(): Promise<void>;
}

/** 由 Pipeline 注入，绑定 resolveWrite。取值即门禁引擎的判定结果。 */
export type WriteGate = (targetPath: string) => WriteDecision;

// —————————————— shell 命令级闸（设计 §7.2 冻结形状） ——————————————
//
// **判据不同**于 WriteGate：WriteGate 判「路径是否在边界内」，ShellGate 判「这条命令是否被允许执行」。
// 两者**不可互相替代**（设计 §7.1/§7.7）：shell 里 `echo x > 路径` 的写入不经过 resolveWrite。
// ShellGate 由**编排**装配、注入；Pi适配器**不含任何审核策略**，只调用它（与工具层「任何路径判定都不在这里」同纪律）。
//
// **不含 token**（设计 §7.1 第 3 条）：旧设计的「审核签 token、扩展层凭 token 放行」已废弃——token 可由公开
// 输入确定性推导，「token 一致」证明不了「审核发生过」。审核的每调用保证放在**唯一 spawn 点 execute**。

/** ShellGate 的入参：命令原文 + 规范化 argv + 固定 cwd + 本次调用的 toolCallId（供留痕）。 */
export interface ShellReviewRequest {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
}

/** 审核结论：恰好 `allow:true` 才放行；否则拒绝并给原因。**不含 token**（票据机制已废，§7.1 第 3 条）。 */
export type ShellReviewResult = { allow: true; by: string } | { allow: false; reason: string; by: string };

/** 由编排装配并注入的命令级闸（判定策略不在本角色）。 */
export type ShellGate = (req: ShellReviewRequest) => Promise<ShellReviewResult>;

// —————————————— (a) 操作者确认通道（设计 §7.4 冻结形状） ——————————————
//
// **来历（T20）**：三型原属**编排**私有 `src/common/编排/shell-gate.ts`，导致**桌面应用**只能**逐字镜像**
// （§6 禁止跨角色导入他人私有 `common/`）。经 PM 裁定**挪入本冻结契约家**——编排**自己已把**
// `ShellGate` / `ShellReviewRequest` / `ShellReviewResult` 放在此处。编排（T21）与桌面（T22）改为从本文件
// 导入，**形状逐字不变**（本次只加类型，不改既有导出）。

/** (a) 提示操作者的入参：命令原文 + 规范化 argv + 固定 cwd + 为何升级到人 + toolCallId。 */
export interface OperatorPrompt {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
  /** 为何升级到人（(b) 拿不准 / 不可用），供提示文案。 */
  reason?: string;
}

/** (a) 操作者的裁决结果。`unavailable` 表示通道不可用（无人值守 / 界面未接）。 */
export type OperatorOutcome =
  | { outcome: "allow"; operatorId?: string }
  | { outcome: "deny"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

/**
 * 「问操作者」注入点（CLI 读 stdin / 桌面弹层）。
 * 抛错 → 视为通道不可用；超时（由编排的超时包装）→ 拒绝。二者都落「拒绝」（§7.5：a 不可用 → 拒）。
 */
export type OperatorChannelFn = (
  prompt: OperatorPrompt,
) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined;

// —————————————— finalize 结果型（设计 §13.1；T36 遗留，供编排消费） ——————————————
//
// **来历（T36）**：`finalize_bootstrap` 工具与 `FinalizeBootstrapFn` 曾随「提议收口、挂起等客户确认」而落于此；
// 依设计 §3.11 与 T20 先例（operator 三型逐字入本文件），当时的两个结果型也**逐字**声明于本冻结契约家。
//
// **现状（2026-10-12，A-4 最后一步）**：`finalize_bootstrap` 工具与 `FinalizeBootstrapFn` 注入型**已删除**
// （「同意才落盘」改由交互工具族 + 编排 writeSet/F4 承担，见上/下文）。`FinalizeStatus` / `FinalizeResult`
// **保留**——编排（`src/pipeline/orchestration/govern-session.ts` 等）仍从本文件消费它们；
// 待编排收口后另行裁决是否一并收敛。

/** finalize 的结果状态（逐字取自编排 `src/common/编排/finalize.ts`；设计 §13.1）。 */
export type FinalizeStatus =
  | "completed" // 客户确认通过且写出成功
  | "declined" // 客户拒绝
  | "unavailable" // 确认通道不可用 / 未接 / 超时 → fail-closed
  | "not-genesis" // 非创世态 → 拒绝（不是静默）
  | "nothing-to-pin" // 无可 pin 之物 → 拒绝
  | "blocked"; // 未 settle / 门禁拒 / 其他失败

/** finalize 的结果（逐字取自编排 `src/common/编排/finalize.ts`；形状由编排公开面唯一决定）。 */
export interface FinalizeResult {
  ok: boolean; // === (status === "completed")
  status?: FinalizeStatus;
  message?: string;
  reason?: string;
  wrote: string[];
  pins: PinEntry[];
  roles: string[];
  projectJsonRel: string;
  manifestRel: string;
}

// （已删除：`FinalizeBootstrapFn`——原「注入给 Pi适配器 `finalize_bootstrap` 工具的确切形状」。
//  随该工具与注入槽一并移除，2026-10-12 A-4 最后一步；其结果型 FinalizeStatus/FinalizeResult 保留如上。）

// —————————————— 客户确认制交互（request_confirmation / request_choice，设计 A-1） ——————————————
//
// **来历**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §三 A-1（客户确认制交互）
// 规定：给治理角色 su 新增**交互工具族**（请求确认 / 请求选项-单选多选，前端渲染成交互卡）。
// 与 T20（operator 三型）同一落点纪律——**冻结形状的单一来源是 §4 冻结契约家**
// （本文件）；编排/CLI/桌面各自实现自己那半（通道、交互卡），只共用这里的**形状**。
//
// **为何另立三型而不复用 OperatorPrompt/OperatorOutcome**：勾选结果（`selected: string[]`）装不进
// `OperatorOutcome`（只有 allow/deny/unavailable）；请求也带 preview/options 这类结构化载荷。
// 「不造第二套确认机制」的约束落在**注入点形状**上（同为 `(req) => Promise<outcome>` 的注入 fn、
// 同样 fail-closed 语义），而非逐字复用类型。

/** 交互请求的单个选项（request_choice 用）。 */
export interface CustomerInputOption {
  /** 选项标识（回传 selected 用它；须在本次请求内唯一）。 */
  id: string;
  /** 面向客户的选项文案。 */
  label: string;
  /** 可选的补充说明。 */
  description?: string;
}

/**
 * 交互工具族交给客户通道的请求（设计 A-1）：
 * - `confirm`：请求客户确认（可带预览——如「角色卡 + 边界摘要」全文）；
 * - `choice`：请求客户从给定选项中单选/多选（`multiple` 缺省 false）。
 */
export type CustomerInputRequest =
  | {
      kind: "confirm";
      /** 一句话概括请客户确认什么。 */
      title: string;
      /** 可选的预览内容（角色卡全文 + 边界摘要等，纯文本/markdown）。 */
      preview?: string;
      /** 可选的补充细节。 */
      detail?: string;
    }
  | {
      kind: "choice";
      title: string;
      question?: string;
      options: CustomerInputOption[];
      /** 单选缺省 false；true = 多选（勾选）。 */
      multiple?: boolean;
      preview?: string;
    };

/**
 * 客户对交互请求的裁决（设计 A-1 **逐字**三态）：
 * - `answered`：客户作答——confirm → `value.confirmed`；choice → `value.selected`（所选项 id）；
 * - `declined`：客户拒绝（关闭/取消，未作答）——**未获同意**；
 * - `unavailable`：通道不可用 / 超时 / 出错——**未获同意**（fail-closed）。
 *
 * `operatorId`（可选，同 `OperatorOutcome` 先例）供审计（谁答的）；`reason` 载拒绝/不可用的原因文案。
 */
export type CustomerInputOutcome =
  | { outcome: "answered"; value: { confirmed?: boolean; selected?: string[] }; operatorId?: string }
  | { outcome: "declined"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

/**
 * 「问客户」注入点（CLI 终端映射 / 桌面交互卡）。**未注入时两交互工具根本不注册**
 * （「有无客户通道」由调用方以是否注入表达，同 `ShellGate` 先例）。
 *
 * 语义（与 §7.5 的四条通路同构）：抛错 → 视为通道不可用；返回 `null`/`undefined` → 不可用；
 * **等待缺省不设限**（设计 G-1：卡在这等客户同意）；仅显式配置 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`
 * 才计时（超时 = 未获同意）。三者都落「未获同意」。**诚实边界**：未决请求只在**进程内存**，
 * 进程结束即失效——失效时（中止/通道不可用）本层如实返回「未获客户同意」，**绝不假装同意**。
 */
export type CustomerInputFn = (
  req: CustomerInputRequest,
) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined;

// —————————————— 交报告能力（submit_report，设计 C-1） ——————————————
//
// **来历**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §C-1（客户裁定「新增交报告工具」）：
// 角色完成任务时交回一份**模型自己写的**报告（做了什么 / 结论 / 证据），交回 su 汇总。
// 与 T20/A-1 同一落点纪律——**冻结形状的单一来源是 §4 冻结契约家**（本文件）。
// 字段（status/summary/evidence）与编排 `TaskHandback` **同名同型**，便于编排按其取值；roleId/at 由编排补。

/** 交给编排的回交报告载荷（设计 C-1；即 `submit_report` 的入参）。 */
export interface ReportHandbackPayload {
  /** 本轮结果：completed（完成）/ blocked（确认无法完成）。 */
  status: "completed" | "blocked";
  /** **模型自己写的**「改了什么 / 产出了什么」——一句话结论（如实）。 */
  summary: string;
  /** 关键证据：产物路径 / 变更 / 测试结论。 */
  evidence?: string[];
}

/** 交报告能力的结果（编排在收到报告后如实给的回执）。 */
export interface ReportHandbackReceipt {
  ok: boolean;
  message?: string;
}

/**
 * 「交报告」注入点（设计 C-1）：**只给项目角色**（治理角色 su 不自我回交，故不给它——由编排以是否注入表达）。
 * **未注入时 `submit_report` 根本不注册**（同 `ShellGate` / `CustomerInputFn` 先例）。
 *
 * 语义：调用即把**模型写好的报告**交给编排（回交 su 汇总）；抛错 → 视为交回失败（handler **如实**返回，
 * 绝不谎报已交回）；返回 `null`/`undefined`/**void**（无回执）→ 视为**已接收**（编排的注入能力多为
 * fire-and-forget——`(report) => void | Promise<void>`，**必须可注入**，故返回联合含 void）；
 * 返回 `{ok:false}` → 交回被拒（如实转达）。载荷字段与编排 `TaskHandback` 同名同型（roleId/at 由编排补）。
 */
export type ReportHandbackFn = (
  report: ReportHandbackPayload,
) =>
  | ReportHandbackReceipt
  | null
  | undefined
  | void
  | Promise<ReportHandbackReceipt | null | undefined | void>;

// —————————————— 派发任务能力（dispatch_task，设计 H-1） ——————————————
//
// **来历**：设计稿 §H-1（客户原话「给 su 加一个工具，可以派发任务」）。**只给治理角色 su**——由编排以
// 是否注入表达（同 customerInput/reportHandback 先例）。**语义硬约束（逐字取自设计）**：**派发 ≠ 授权**——
// 目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的 `confirmed:true`；派发只是把
// 「任务与上下文」送过去（沿用 SKILL 的交接语义：转移任务与证据，**不转移身份或写权**）。

/** 派发任务的载荷（设计 H-1；即 `dispatch_task` 的入参）。 */
export interface DispatchTaskPayload {
  /** 目标角色 id（**由注入能力做语义校验**：非本项目角色 / 指向 su 自身 → 以回执回错，本层如实转达）。 */
  roleId: string;
  /** 任务文本（**须自足**：目标角色看不到 su 的上下文——做什么 / 依据哪份文档 / 完成标准）。 */
  task: string;
  /** 可选：为什么派发（给目标角色与留痕看）。 */
  reason?: string;
}

/** 派发能力的结果（编排在受理/拒绝后如实给的回执）。 */
export interface DispatchReceipt {
  ok: boolean;
  message?: string;
}

/**
 * 「派发任务」注入点（设计 H-1）。**未注入时 `dispatch_task` 根本不注册**（同 `ShellGate`/`CustomerInputFn`
 * 先例；**只给 su**——编排对项目角色不注入 ⇒ 工具不存在）。语义：调用即把**任务与上下文**交给编排路由
 * （前端把派发转成目标角色会话的一条输入）；抛错 → 交回失败（handler **如实**返回，**绝不谎称已派发**）；
 * 返回 `null`/`undefined`/**void**（无回执）→ 视为**已受理**（编排能力多为 fire-and-forget，返回位须含 void，
 * 同 `ReportHandbackFn` 的接缝教训）。**派发 ≠ 授权**：本能力不得被实现方用于授予任何写权。
 */
export type DispatchTaskFn = (
  dispatch: DispatchTaskPayload,
) => DispatchReceipt | null | undefined | void | Promise<DispatchReceipt | null | undefined | void>;

// —————————————— shell 审读结论能力（report_shell_verdict，R-1） ——————————————
//
// **来历**：编排 R-1——shell 闸 (b) 的审读结论**放弃解析自由正文**（真机根因：网关 500 使助手正文恒为空 ⇒
// 恒不可解析），改由**工具调用**取结构化结论。**形状逐字取自编排 `src/common/编排/shell-gate.ts:205-217`**
// （**读之确认、不导入**——§6 禁导入他人私有 `common/`；与 T20/T36/A-1 同一先例）。
// **只给审读会话**：由编排（pm-reviewer 路径）以**是否注入**表达；未注入 ⇒ 工具不存在。
// **收敛建议（供编排）**：可改为从本文件导入三型（同 T20→T21 先例）。

/** 审读结论载荷（逐字取自编排 `shell-gate.ts`；设计 R-1）。 */
export interface ShellVerdictPayload {
  /** 结论：allow = 放行；deny = 拒绝；unsure = 拿不准（按既有链升级到 (a)）。 */
  verdict: "allow" | "deny" | "unsure";
  /** 可选：简述理由（审计/呈现用）。 */
  reason?: string;
}

/**
 * 「审读结论」注入点（审读会话专用）：调用即把**结构化结论**交给编排（其内部完成捕获/使用）。
 * 返回位含 `void`（编排形状即 `void | Promise<void>`）；抛错 → 交回失败（handler **如实**返回，
 * 绝不谎称）。**结论只以本工具调用为准——正文里写结论不算。**
 */
export type ShellVerdictFn = (verdict: ShellVerdictPayload) => void | Promise<void>;

export interface RuntimeAdapter {
  composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }>;
  bindRole(role: ResolvedRole): Promise<RoleSession>;
  // 「停当前轮次」（提案 P0-2）的能力在 **RoleSession.abort?**（会话级语义，见其文档注释）——
  // 本工厂接口无轮次可言，不在此重复。
}

// —————————————————————— 公共辅助 ——————————————————————

/** 由角色卡文本与边界来源拼出系统提示（不做任何判定，只做呈现）。 */
function renderSystemPrompt(role: ResolvedRole): string {
  const lines = [
    `# 角色：${role.id}`,
    "",
    role.cardText.trim(),
    "",
    `## 边界来源`,
    role.boundarySource,
  ];
  return lines.join("\n");
}

// —————————————————————— 假适配器（仅单元测试） ——————————————————————

/** 缺省脚本：一次越界写（write_file 到 src/evil.ts），用于演示"写之前被拒"。 */
const DEFAULT_FAKE_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } },
];

/**
 * 假运行时适配器：不调用任何真实 Pi SDK。
 * 按 script 逐个"模拟模型动作"，每个动作都经受治理工具集执行——因此治理判定
 * 与真实适配器走**同一条** buildGovernedTools(gate) 路径。
 *
 * writeRoot（可选）：显式给出写根后，被允许的写入会**真正落盘**（设计 §3.1）。
 * 未给出时写类工具仅判定、不落盘（fail-closed：写根不明 ⇒ 不写）——测试若需验证
 * 真实落盘，请把 writeRoot 指向临时目录，切勿指向仓库。
 */
export function createFakeRuntimeAdapter(opts: {
  gate: WriteGate;
  script?: ToolCall[];
  /** 读根（read_file 相对路径基准）；缺省 process.cwd()。 */
  readRoot?: string;
  /** 写根（write_file/edit_file 落盘安全基准）；缺省不落盘。 */
  writeRoot?: string;
  /** shell 命令级闸（设计 §7.2）；**未注入时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /** shell 固定工作目录（须钉在 projectRoot）；缺省 process.cwd()。 */
  shellCwd?: string;
  /** shell 审核硬超时（毫秒）；缺省读环境变量，再缺省 120000。 */
  shellReviewTimeoutMs?: number;
  /**
   * 客户确认制交互能力（设计 A-1）：由编排/前端构造、注入。**仅当注入时** `request_confirmation` /
   * `request_choice` 两工具才注册（**同 `shellGate` 的「未注入即不注册」先例**——
   * 判据是「有无客户通道」）。
   */
  customerInput?: CustomerInputFn;
  /** 交互等待硬超时（毫秒）；**缺省不设限**（G-1：一直等客户作答）——仅显式给出本项或环境变量 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 才计时。**超时 = 未获同意**。 */
  customerInputTimeoutMs?: number;
  /**
   * 交报告能力（设计 C-1）：由编排构造、注入。**仅当注入时** `submit_report` 工具才注册
   * （**同 `shellGate` 的「未注入即不注册」先例**；只给项目角色——su 不注入即不注册）。
   */
  reportHandback?: ReportHandbackFn;
  /**
   * 派发任务能力（设计 H-1）：由编排构造、注入。**仅当注入时** `dispatch_task` 工具才注册
   * （**只给 su**——编排对项目角色不注入 ⇒ 不存在；同 `shellGate` 先例）。
   */
  dispatchTask?: DispatchTaskFn;
  /**
   * shell 审读结论能力（R-1）：由编排构造、注入。**仅当注入时** `report_shell_verdict` 工具才注册
   * （**只给审读会话**——由调用方以是否注入表达；同 `shellGate` 先例）。
   */
  shellVerdict?: ShellVerdictFn;
}): RuntimeAdapter {
  const script = opts.script ?? DEFAULT_FAKE_SCRIPT;

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return { systemPrompt: renderSystemPrompt(role) };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      void role;
      const tools = buildGovernedTools(opts.gate, {
        readRoot: opts.readRoot,
        writeRoot: opts.writeRoot,
        shellGate: opts.shellGate,
        shellCwd: opts.shellCwd,
        shellReviewTimeoutMs: opts.shellReviewTimeoutMs,
        customerInput: opts.customerInput,
        customerInputTimeoutMs: opts.customerInputTimeoutMs,
        reportHandback: opts.reportHandback,
        dispatchTask: opts.dispatchTask,
        shellVerdict: opts.shellVerdict,
      });
      const byName = new Map(tools.map((t) => [t.name, t]));
      const queue = createEventQueue<SessionEvent>();

      return {
        async prompt(text: string, opts?: PromptOptions): Promise<void> {
          // 假适配器没有模型，**不消费图片**——但签名保持与契约一致（K-2）；无图时事件逐字不变。
          const imageCount = opts?.images?.length ?? 0;
          queue.push({
            kind: "message",
            summary: imageCount > 0 ? `用户指令：${text}（附 ${imageCount} 张图片）` : `用户指令：${text}`,
          });

          for (const call of script) {
            queue.push({
              kind: "tool_call",
              summary: `模型请求调用 ${call.name}`,
              detail: call,
            });

            const tool = byName.get(call.name);
            if (tool === undefined) {
              queue.push({
                kind: "denied",
                summary: `未知工具，拒绝执行：${call.name}`,
                detail: call,
              });
              continue;
            }

            // 经受治理工具执行——判定发生在工具内部"写入之前"。
            const result = await tool.handler(call);
            queue.push({
              kind: result.ok ? "accepted" : "denied",
              summary: result.message,
              detail: { call, result },
            });
          }

          queue.push({ kind: "settled", summary: "会话结束" });
          queue.close();
        },

        events(): AsyncIterable<SessionEvent> {
          return queue.stream;
        },

        async dispose(): Promise<void> {
          queue.close();
        },
      };
    },
  };
}

// —————————————————————— 真实 Pi 适配器（懒加载） ——————————————————————

/**
 * 真实 Pi 运行时适配器（契约 §4 / 附录 A）。
 *
 * 依赖隔离：本函数**同步**返回一个 RuntimeAdapter 外壳；只有其方法被调用时才经动态
 * import 加载私有实现 src/common/pi-adapter/real-adapter.ts（那里才 import Pi 包）。
 * 这样即便未安装 Pi，本模块与假适配器、全部单测仍可正常加载。
 *
 * 显式 provider（方案 b）：契约 §4 的三个必需字段不变；额外**可选**字段
 * （providerId / baseUrl / modelId / apiKeyEnvVar）用于显式指定 provider。
 * **构造时即校验**：baseUrl / modelId 缺失即抛错，绝不回落到默认端点（见 provider-config.ts）。
 */
export interface PiRuntimeAdapterOptions extends PiProviderConfigInput {
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** shell 命令级闸（设计 §7.2）；由编排装配后注入。**缺省时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /**
   * 客户确认制交互能力（设计 A-1）：由编排/前端构造、注入。**仅当注入时** `request_confirmation` /
   * `request_choice` 两工具才注册（判据是「有无客户通道」）。
   */
  customerInput?: CustomerInputFn;
  /**
   * 交互等待硬超时（毫秒）；**缺省不设限**（G-1）——仅显式给出或环境变量 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`
   * 才计时。等待期间 real-adapter 会经活动闸**暂停每轮硬超时**（作答后按剩余时间恢复），
   * 「等客户」的轮次不再被整轮时限掐断。
   */
  customerInputTimeoutMs?: number;
  /**
   * 交报告能力（设计 C-1）：由编排构造、注入。**仅当注入时** `submit_report` 工具才注册
   * （判据是「本会话有回交目标」；只给项目角色——su 不注入即不注册）。
   */
  reportHandback?: ReportHandbackFn;
  /**
   * 派发任务能力（设计 H-1）：由编排构造、注入。**仅当注入时** `dispatch_task` 工具才注册
   * （**只给 su**——由编排以是否注入表达）。
   */
  dispatchTask?: DispatchTaskFn;
  /**
   * shell 审读结论能力（R-1）：由编排构造、注入（**审读会话专用**——pm-reviewer 路径）。
   * **仅当注入时** `report_shell_verdict` 工具才注册。
   */
  shellVerdict?: ShellVerdictFn;
  /**
   * 会话持久化目录（设计 D-1，重启恢复）：**给了** ⇒ 该项目角色的会话以 JSONL 落盘于该目录
   * （有最近会话即恢复，否则新建；**应逐角色隔离**，如 `<项目>/.ans/sessions/<角色>/`）；
   * **缺省** ⇒ 逐字保留旧行为（`SessionManager.inMemory`，不落盘）。适配器只读写该目录，不碰 `~/.pi`。
   */
  sessionDir?: string;
  /** prompt 硬超时（毫秒）；缺省读 ANS_PI_PROMPT_TIMEOUT_MS，再缺省 120000。 */
  promptTimeoutMs?: number;
  /** 构造期单步硬超时（毫秒）；缺省读 ANS_PI_CONSTRUCT_TIMEOUT_MS，再缺省 120000。 */
  constructTimeoutMs?: number;
  /** shell 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。超时 = 拒绝。 */
  shellReviewTimeoutMs?: number;
}

export function createPiRuntimeAdapter(opts: PiRuntimeAdapterOptions): RuntimeAdapter {
  // 构造时预校验显式 provider 配置：缺失即**明确失败**（fail-closed，不发往默认端点）。
  // 这一步不 import Pi 包，保持懒加载性质。
  const config = resolvePiProviderConfig(opts, process.env);

  let real: RuntimeAdapter | undefined;
  const load = async (): Promise<RuntimeAdapter> => {
    if (real === undefined) {
      const mod = await import("../../common/pi-adapter/real-adapter.ts");
      real = mod.createRealPiRuntimeAdapter({ ...opts, config });
    }
    return real;
  };

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return (await load()).composeContext(role);
    },
    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      return (await load()).bindRole(role);
    },
  };
}
