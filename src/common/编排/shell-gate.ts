// src/common/编排/shell-gate.ts
// `ShellGate` 装配（设计 §7.2、§7.3、§7.4、§7.5、§7.6）。
//
// 归属：编排。仿既有 `WriteGate` 的**注入**模式——判定源与工具**解耦**：本模块产出 `ShellGate`，
// 注入给 Pi 适配器的 `run_shell`；Pi 适配器**不含任何审核策略，只调用**它。
//
// 2026-10-13 客户委托修正：下面三层链是未匹配委托政策时的原规则。
// 仅宿主 routineShellPolicy + 同项目精确常规检查 + b 明确allow 可免重复a；
// c硬拒、su只读、b其它结果与非匹配risky均不变，绝不由模型自授。
//
// —— 三层审核链 (c) → (b) → (a)（§7.3/§14.2 次序表——判定顺序即交互顺序） ——
// 客户裁定审核主体为三层组合 **(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**（§7.3）。
// 本模块**串起三层**，映射（§7.5、§14.2 次序表）：
//   1. **(c) 第一闸，硬地板，绝对否决**（`classifyShell`，四态 §14.1）：
//      - 命中**白名单**（`allow`）→ 直接放行 `{ allow:true, by:"ruleset:<规则id>" }`（**不含 token**，§7.1 第 3 条），**不进 (b)/(a)**；
//      - 命中**硬拒**（`deny`）→ 直接拒绝 `{ allow:false, reason, by }`，**终结**，**不进 (b)/(a)**；
//        **硬地板的否决不可被 (b)/(a) 翻案**——(b)/(a) 只作用于 (c) 判为 `review` 或 `risky` 的区间；
//      - `review`（中性未知）→ 交第二闸；
//      - `risky`（**危险但有正当用途**，§14.3-B）→ 也交第二闸，**但 (b) 判放行后仍须过 (a)**。
//   2. **(b) 第二闸，增量**（注入的 `pmAsk`，问 pm 角色模型）：
//      - 判**放行** → 放行、**终结**；判**拒绝** → 拒绝、**终结**（**不打扰人**）；
//      - **拿不准 / 无 pm 会话 / 超时 / 报错 / 判定 JSON 不合法** → 交第三闸 (a)（**绝不视为放行**）。
//   3. **(a) 第三闸，兜底**（注入的 `operatorChannel`，CLI 读 stdin / 桌面弹层）：
//      - **`review`**：**仅当 (b) 拿不准或不可用时**才挂起叫人看原文点放行/拒绝（b 明确即终结，不打扰人）；
//      - **`risky`**：**无论 (b) 怎么说都要过 (a)**（b 判放行亦升 (a)——**pm 不是终审，客户才是**，§14.2/§14.4）；
//      - **放行 → 放行；不可用 / 通道未接 / 超时 / 拒绝 → 拒绝**。
//
// **`risky` 与 `review` 的唯一差别**：(b) 判「放行」后——`review` 即**终结放行**（不打扰人）；`risky` 仍**必过 (a)**。
//   （(b) 判「拒绝」时二者同：**终结拒绝、不打扰人**。）`risky` 的设计前提是「**程序名在 argv 里可见、客户
//   看原文看得懂**」（§14.4）——「命令藏在字符串里」的 re-shell/内联求值（`sh -c`/`eval`/`node -e`/`awk`）
//   **根本不会到本层**，门禁引擎 (c) 已把它们硬拒。
//
// **fail-closed：只往更严的层退**（§7.5）——(c) 规则集加载失败 → **整条拒绝**；(b) 不可用 → **升级到 (a)**；
// (a) 不可用 → **拒绝**。任何一层都**绝不**因不可用而放行。仅在**既未接 (b) 也未接 (a)** 的 (c)-only 装配下，
// review 保留第一步行为——**默认拒绝**（`review-default-deny`）；接上任一层即走完整链。
//
// —— 为何本模块不再产出任何 token（§7.1 第 3 条、§7.4） ——
// 审核**整条留在唯一 spawn 点 `execute`**（Pi 适配器侧）：审核与 spawn **同址**，这本身就是结构性保证，
// **不需要跨层票据**。旧设计里的 `bindShellToken = sg1:<toolCallId>:<sha256(toolCallId\0command)>`
// **由公开输入确定性推导**，扩展层「token 一致」只证明「调用方会算这个哈希」，**证明不了审核发生过**
// （方案写在代码与文档里，模型照抄即可伪造）——第二层兜底退化成装饰。故 **`bindShellToken` 已删除**，
// 本模块只保留「审核链 + 审计」职责。「未走完审核链就绝不执行」改由**两条同址保证**成立（不靠票据、
// 也不靠「扩展默认 block」——后者会 block 掉正常调用，等于保证成立但功能不可用）：
//   ① **未 arm → `run_shell` 不注册**（能力缺席）；
//   ② **`execute` 是唯一 spawn 点，只在审核返回 `allow` 后 spawn**。
//
// —— fail-closed 三条退路（§7.5，第一步承担的） ——
//   1. 规则集加载失败 / 解析报错 → **整条命令拒绝**（绝不「规则没了就一律放行」）；
//   2. 分类函数缺失 / 抛错 → **拒绝**；
//   3. 审核**超时**（编排 shell-deadline）→ **拒绝**。
//
// —— su 只读档（`readonlyOnly`，客户裁定 2026-10-12：「su 也要有 shell，但是只读」） ——
// 同一装配面增可选 `readonlyOnly`——`true` 时只映射 **(c) 层确定性白名单**：allow → 照旧放行（`c-allow`、
// 直接执行）；deny → 照旧拒绝（`c-deny`）；**risky / review → 一律拒绝**（`readonly-deny`，reason 写明
// 命中的是哪一档）。**不接 (b)**（su 自己就是审读者，不自审）、**不接 (a)**（只读外的命令直接拒，
// 不打扰客户、不弹任何对话框）。fail-closed 退路语义不变；**缺省 false = 既有三层链逐字不变**。
// 装配入口见 `pipeline/orchestration/shell-arming.ts::assembleReadonlyShellGate`。
//
// —— 规则引擎 (c) 不在此实现 ——
// `classifyShell(argv, rules)` 由**门禁引擎**实现（纯函数，`src/service/gate/` 或 `src/common/门禁引擎/`，
// 并行开发中）。本模块经**注入**依赖它（形参 `classifyShell`），**不含任何规则集**——规则集内容不属编排。

import type {
  ShellVerdictFn,
  ShellVerdictPayload,
  ShellGate,
  ShellReviewRequest,
  ShellReviewResult,
  OperatorPrompt,
  OperatorOutcome,
  OperatorChannelFn,
  ShellJudgeAudit,
} from "../../model/runtime.ts";
import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ShellClass, ShellRules } from "../../model/decision.ts";
import {
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_REVIEW_TIMEOUT_ENV,
  withTimeout,
  isTimeoutError,
  readTimeoutMs,
} from "./shell-deadline.ts";
import {
  buildShellAuditGate,
  createFileAuditSink,
  SHELL_GATE_CONDITION,
  type ShellAuditRecord,
  type ShellAuditSink,
} from "./shell-audit.ts";
// 跨角色共享 argv 原语（**单一来源**，属主：项目管理）。此前本文件保有一份**逐字相同**的本地
// `normalizeArgv`；T23 起正文迁至 `src/common/shared/argv-primitives.ts`，本文件改为**只读导入**
// （工程法案 §一.5、`docs/architecture/shared-components.md`）——**不得留第二份实现**。行为逐字不变。
import { normalizeArgv } from "../shared/argv-primitives.ts";

// —— 契约（任务已定死，照做） ——
// 类型定义归运行时核心的 src/model/runtime.ts（工具层与扩展层按同一形状编译）；此处按其形状
// 引用并给出任务里的入参名别名，**不另立第二份定义**（避免形状漂移）。

export type { ShellGate, ShellReviewResult };
/** 入参别名：与 session.ts 的 `ShellReviewRequest` 同形。 */
export type ShellGateRequest = ShellReviewRequest;

// —— 门禁引擎 (c) 的依赖形状（注入；「按实际来」） ——
//
// 类型与门禁引擎**同源**：三态结果 `ShellClass` 与规则集 `ShellRules` 由 `src/model/decision.ts`
// 定义（门禁引擎的 `classifyShell(argv, rules)` 正按此签名实现）。本模块**只引用、不另立第二份定义**——
// 旧版在此自定义了同名不同形的宽松 `ShellRules`（`{id?; [k]: unknown}`），既对严格签名引发逆变告警，
// 也与项目「单一实现」取向不符，**已删除**。为便于消费方从本模块取型，此处 re-export（唯一来源仍是
// `model/decision.ts`）。
export type { ShellClass, ShellRules };

/** 若门禁引擎返回更丰富的结果（带命中规则 id / 理由），本模块可消费；否则接受裸串。 */
export interface ShellClassifyDetail {
  decision: ShellClass;
  ruleId?: string;
  reason?: string;
}

/** 门禁引擎的纯函数 `classifyShell(argv, rules)`；返回裸串或带明细的对象。 */
export type ClassifyShellFn = (
  argv: string[],
  rules: ShellRules,
) => ShellClass | ShellClassifyDetail;

// —————————————————————— (b) pm 角色模型审读 —— 注入点 ——————————————————————
//
// §7.3/§7.4：把**命令原文**交 pm 角色的**模型**判读，返回「放行 / 拒绝 / 拿不准」。
// **本机无法跑真实模型轮次**（凭据命令须客户本人运行），故这步做成**可注入的函数**（仿既有 adapter 注入模式），
// 使其**能在无真实模型的情况下被测试**。真实实现经 `openRoleSession(项目管理, …)` 问 pm 角色
// （见 `src/pipeline/orchestration/pm-reviewer.ts` 的 `createPmReviewer`）。
//
// **接口形状为何是「返回原文（字符串）」而非「返回已解析的对象」**：解析（含围栏剥离/取首个 JSON 对象）
// 与「判定 JSON 不合法怎么办」的职责都落在**本层**、才可测。**M-2（2026-10-12，客户裁定）**：解析失败
// **直接拒绝**（fail-closed）——**不升级 (a)、不重试、不打扰客户**（客户不要这类打扰）；如实 reason
// 回给角色（`REASON_B_UNPARSEABLE`，稳定短句）。提示侧收紧在 `pm-reviewer.ts`。

/** (b) 问 pm 的入参：命令原文 + 规范化 argv + 固定 cwd + 本次调用的 toolCallId（审计串联）。 */
export interface PmReviewInput {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
}

/** pm 判读的三态结果（`parsePmVerdict` 的产物）。 */
export interface PmVerdictResult {
  verdict: "allow" | "deny" | "unsure";
  reason?: string;
  /** pm 会话标识（审计 `by` 用）。 */
  sessionId?: string;
  /** pm 模型标识（审计 `by` 用）。 */
  model?: string;
}

/**
 * 「问 pm」注入点：给定命令原文，返回 pm 模型的**原文判读**（预期为 JSON 字符串）。
 * 抛错 / 返回 null·undefined / 超时 → 视为「(b) 不可用」，**升级到 (a)**（绝不视为放行，§7.5）。
 */
export type PmAskFn = (
  input: PmReviewInput,
) => Promise<string | null | undefined> | string | null | undefined;

// —————————————————————— (a) 操作者确认 —— 注入点 ——————————————————————
//
// §7.3/§7.4：仅当 (b) 拿不准或不可用时，挂起并叫人看**命令原文**点放行/拒绝。
// **通道由注入提供**：CLI 端（`src/interface/cli/`，本角色）读 stdin 打印确认；桌面端由**桌面应用**角色提供对话框。
// 本模块只**接收**这个注入点——不含任何界面代码。
//
// **三型的单一来源在 §4 冻结契约家 `src/model/runtime.ts`（T21 起）**：`OperatorPrompt` / `OperatorOutcome` /
// `OperatorChannelFn` 原先定义在本文件，导致桌面应用只能**逐字镜像**（工程法案 §6 禁止跨角色导入他人私有 `common/`）。
// 经 PM 裁定挪入 Provider 边界（与本模块早先放那里的 `ShellGate` / `ShellReviewRequest` / `ShellReviewResult` 同址）。
// 本文件**不再定义**任何 operator 形状——只**再导出**其名以保住既有消费方（含 `test/编排/`、`operator-channel.ts`）
// 零改动。**单一来源，非第二份**（形状逐字未变）。

export type { OperatorPrompt, OperatorOutcome, OperatorChannelFn };
import { matchesDelegatedRoutineCheck, type RoutineShellPolicy } from "./routine-shell-policy.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";


// —— 常量 ——
// 审核硬超时由本角色 shell-deadline 维护，保留既有操作设置名，
// 不另立第二套 env（`ANS_PI_SHELL_REVIEW_TIMEOUT_MS`，默认 120000ms）。超时 = 拒绝。

// 触发分支（§7.6「触发分支」字段取值）。分三类：c 层终结 / b 层终结 / a 层（含升级链）。
export const BRANCH_C_ALLOW = "c-allow"; // 命中 c 白名单
export const BRANCH_C_DENY = "c-deny"; // 命中 c 硬拒
export const BRANCH_REVIEW_NO_BA = "review-default-deny"; // (c)=review 且 (b)/(a) 均未接入 → 默认拒（保留第一步 fail-closed）
export const BRANCH_RISKY_NO_BA = "risky-default-deny"; // (c)=risky 且 (b)/(a) 均未接入 → 默认拒（risky 必过 (a)，a 缺席即拒，fail-closed §14.2）
/**
 * **su 只读档**（`readonlyOnly`，客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：
 * (c) 判 `risky` / `review`（未命中只读白名单）→ **一律拒绝**。本档**不接 (b) su 模型审读**
 * （su 自己就是审读者，不自审）、**不接 (a) 客户确认**（只读外的命令直接拒，不打扰客户）。
 * reason 里写明命中的是哪一档（risky / review）——让模型看懂「这是 su 只读档的策略拒绝，不是环境故障」。
 */
export const BRANCH_READONLY_DENY = "readonly-deny";
/**
 * **su 审批档**（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）：
 * `operatorOnly` 模式下 (c) 的非白名单档直接交 (a)，分支前缀标出命中的 (c) 档位（`c-risky→a-*` /
 * `c-review→a-*` / `c-deny→a-*`）。既有 `c-deny`（硬拒终结）仍是 `approveDeny=false` 的回归路径。
 */
export const BRANCH_C_RISKY = "c-risky";
export const BRANCH_C_REVIEW = "c-review";
/**
 * **su 审批档原因前缀**（单一来源；桌面窗口按 `/^su-审批档\[(risky|review|deny)\]/` 稳定解析）。
 * 与 `renderSuApprovalReason` 配套；项目角色三层链**永不**使用此前缀（其文案逐字不变）。
 */
export const SU_APPROVAL_REASON_PREFIX = "su-审批档";
export type SuApprovalTier = "risky" | "review" | "deny";

/**
 * 渲染 su 审批档的 `OperatorPrompt.reason`：**固定前缀 + 档位 token**，并如实披露「批准后命令以
 * 当前 OS 用户权限执行，可能绕过 ANS 文件写边界」。桌面窗口只读导入/按钉死正则解析，不得另写文案。
 */
export function renderSuApprovalReason(tier: SuApprovalTier, detail?: string): string {
  const why =
    typeof detail === "string" && detail.trim() !== ""
      ? detail.trim()
      : `(c) 判为 ${tier}，需客户逐条批准`;
  return (
    `${SU_APPROVAL_REASON_PREFIX}[${tier}]：${why}；` +
    "批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。"
  );
}
export const BRANCH_RULESET_LOAD_FAILED = "ruleset-load-failed"; // 规则集加载/解析失败
export const BRANCH_NO_CLASSIFIER = "no-classifier"; // 未注入分类函数
export const BRANCH_CLASSIFY_ERROR = "classify-error"; // 分类函数抛错
export const BRANCH_TIMEOUT = "review-timeout"; // 整体审核超时

// —— 第二闸 (b) —— 触发分支。
export const BRANCH_B_ALLOW = "b-allow"; // pm 判读为放行
export const BRANCH_B_DENY = "b-deny"; // pm 判读为拒绝
export const BRANCH_B_UNSURE = "b-unsure"; // pm 拿不准 → 升级到 (a)
export const BRANCH_B_UNAVAILABLE = "b-unavailable"; // 无 pm 会话 / pm 报错 → 升级到 (a)
export const BRANCH_B_TIMEOUT = "b-timeout"; // pm 审读超时 → 升级到 (a)
/**
 * **(b) 审读输出不可解析 → 直接拒绝**（M-2，2026-10-12 客户裁定：此类失败不再升 (a)、不重试、不打扰客户）。
 * **归因码稳定**（桌面 M-1 的「人话映射」据此对号，**别看文本猜**）；与 `REASON_B_UNPARSEABLE` 一一对应。
 */
export const BRANCH_B_UNPARSEABLE = "b-unparseable-deny";
/** 与 `BRANCH_B_UNPARSEABLE` 一一对应的**固定短句**（单一来源；如实回给角色，绝不说成放行）。 */
export const REASON_B_UNPARSEABLE =
  "审核未能给出明确结论，已按 fail-closed 拒绝；可换更简单的命令形式或稍后重试";

// —————————————— R-1：审读结论的**工具化**来源（客户裁定：不该按 json 解析自由文本） ——————————————
//
// **根因（真机实测）**：旧路径要求审读模型**在正文里写 JSON**，再由本层解析。真机 35/37 个审读轮次里
// 模型轮**根本没产出正文**（会话历史含网关不认的 `tool_removal` 块 → 每轮 500，助手消息 content 为空、
// `stopReason:"error"`）⇒ 取回复（`defaultExtractReply` 取最后一条 message 的文本）拿到空串 ⇒ 恒「不可解析」。
// **主路径改为工具调用**：审读会话注入 `shellVerdict` 能力（「注入才注册」先例；Pi适配器据此注册工具
// `report_shell_verdict`）——**结构化由构造保证**，不存在「解析模型文本」这一档。正文文本解析**仅作降级**
// （模型没调工具只写了 JSON 时兜底）。
//
// **契约注（跨角色）**：工具名与参数形状以本处常量为编排侧单一来源；Pi适配器注册工具时按此对齐
// （等价于既有各能力的「冻结点在契约家」做法——本形状的消费方全在编排）。

/** 审读结论工具名（Pi适配器在 `shellVerdict` 注入时注册；未注入 ⇒ 工具不存在）。 */
export const SHELL_VERDICT_TOOL_NAME = "report_shell_verdict";

// Compatibility aliases; the neutral Model owns these public shapes.
export type { ShellVerdictPayload, ShellVerdictFn };

/**
 * 校验工具参数（**结构化但防御**：工具参数由模型填写，仍须过一遍取值域）：
 * 形状不符（非对象 / verdict 缺失或不在域内 / reason 类型错）→ `undefined`（消费方按「未拿到明确 verdict」处理）。
 */
export function normalizeShellVerdict(input: unknown): ShellVerdictPayload | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const rec = input as Record<string, unknown>;
  const verdict = rec["verdict"];
  if (verdict !== "allow" && verdict !== "deny" && verdict !== "unsure") return undefined;
  const out: ShellVerdictPayload = { verdict };
  if (typeof rec["reason"] === "string") out.reason = rec["reason"];
  return out;
}

// —— 第三闸 (a) —— 触发分支（升级链：`<b 分支>→<a 分支>`，如 `b-unsure→a-allow`）。
export const BRANCH_A_ALLOW = "a-allow"; // 操作者放行
export const BRANCH_B_DELEGATED_ROUTINE = "b-allow→customer-delegated-routine-checks";
export const BRANCH_A_DENY = "a-deny"; // 操作者拒绝
export const BRANCH_A_UNAVAILABLE = "a-unavailable"; // 操作者通道不可用 / 未接入 / 报错 → 拒绝
export const BRANCH_A_TIMEOUT = "a-timeout"; // 操作者确认超时 → 拒绝

/** 升级链分支：`b-unsure→a-allow` 这类字符串，两层的触发分支都可辨识（§7.6 要求「每层可辨识」）。 */
export function escalateBranch(bBranch: string, aBranch: string): string {
  return `${bBranch}→${aBranch}`;
}

export interface CreateShellGateOptions {
  /** 仅诊断上下文，不参与分类授权。 */
  projectRoot?: string;
  /** 门禁引擎的纯函数 `classifyShell`（注入）。缺失 → 一律拒绝（能力缺席即 fail-closed）。 */
  classifyShell?: ClassifyShellFn;
  /** 规则集本体，或加载器（可为异步、可抛错）。加载器抛错 → 整条命令拒绝。 */
  rules: ShellRules | (() => ShellRules | Promise<ShellRules>);
  /** 审计落盘（注入）。 */
  audit: ShellAuditSink;
  /**
   * (b) 问 pm 角色模型的注入点（§7.3）。缺失 → (b) 不可用，**升级到 (a)**（绝不视为放行，§7.5）。
   * 真实实现经 `openRoleSession(项目管理, …)`（见 `createPmReviewer`）；测试注桩即可在无真实模型下验证。
   */
  pmAsk?: PmAskFn;
  /** (a) 操作者确认通道（注入）。缺失 / 返回 unavailable / 抛错 / 超时 → **拒绝**（§7.5）。 */
  operatorChannel?: OperatorChannelFn;
  /** 宿主客户委托：仅匹配本项目常规检查，且 b 明确 allow 后免重复 a。 */
  routineShellPolicy?: RoutineShellPolicy;
  /** (b) pm 审读的超时（毫秒）；缺省 = `timeoutMs`。**超时 → 升级到 (a)**，绝不视为放行。 */
  pmTimeoutMs?: number;
  /** (a) 操作者确认的超时（毫秒）；缺省 = `timeoutMs`。**超时 → 拒绝**。 */
  operatorTimeoutMs?: number;
  /** 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。超时 = 拒绝。 */
  timeoutMs?: number;
  /** 规则集 id（审计归属）。严格 `ShellRules` 无 id 字段，故审计的 ruleset 归属**只此一处**。 */
  rulesId?: string;
  /** 可注入时钟（测试）；缺省 `new Date()`。 */
  now?: () => Date;
  /** 可注入环境（读取超时 env）；缺省 `process.env`。 */
  env?: Record<string, string | undefined>;
  /**
   * **su 只读档**（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：`true` ⇒ 本闸只映射 **(c) 层
   * 确定性白名单**——`allow` 照旧放行（`c-allow`）、`deny` 照旧拒绝（`c-deny`）、**`risky`/`review` 一律拒绝**
   * （`readonly-deny`，reason 写明命中档）。**(b)/(a) 即使注入了也永不调用**（su 自己就是审读者，不自审；
   * 只读外的命令直接拒，不打扰客户、不弹任何对话框）。既有 fail-closed 退路（`ruleset-load-failed` /
   * `no-classifier` / `classify-error`）语义不变。
   * **缺省 `false` = 既有三层链行为逐字不变。**
   */
  readonlyOnly?: boolean;
  /**
   * **su 审批档（operator-only，客户裁定 2026-10-17）**：`true` ⇒ **不接 (b)**——
   * `(c)=allow` 直接放行（`c-allow`，**0 卡**）；`risky`/`review` 一律交 (a)（`c-risky→a-*` /
   * `c-review→a-*`）；`deny` 仅在 `approveDeny === true` 时交 (a)（`c-deny→a-*`），否则沿用既有硬拒。
   * **构造期守卫（fail-closed，抛错 ⇒ 调用方不 arm）**：与 `readonlyOnly` 互斥；必须有
   * `operatorChannel`；**不得**带 `pmAsk`/`routineShellPolicy`（su 不自审，客户审批不得被绕过）。
   * 缺省 `false` = 既有三层链行为逐字不变。
   */
  operatorOnly?: boolean;
  /**
   * **允许客户批准 (c)=deny**（客户裁定「deny 也走客户审批」）。**仅在 `operatorOnly === true` 时有效**；
   * 单独给出（`operatorOnly !== true`）→ 构造期抛错，防止项目角色三层链的硬地板被误关。
   * 缺省 `false` = `deny` 沿用既有硬拒终结。
   */
  approveDeny?: boolean;
  /**
   * **advisory 规则集（客户 2026-10-18 新裁定）**：第一层 (c) 规则**不拒绝任何请求**，只快速放行；
   * 所有拒绝必须由 AI（判断 agent）/操作者经 (a) 做出。
   * - `(c)=allow` → 直接放行（`c-allow`，0 卡）；
   * - `(c)=risky/review/deny` → **跳过 (b)**，直接交 (a)（`c-risky→a-*` / `c-review→a-*` / `c-deny→a-*`）；
   *   规则判定与命中原因写入 `OperatorPrompt.reason`，供判断 agent 参考；
   * - 不再有 `c-deny` 终结分支（仅 `advisoryRuleset=false` 的旧路径保留硬拒用于回归）。
   * **构造期守卫**：与 `readonlyOnly`/`operatorOnly` 互斥；必须有 `operatorChannel`。
   */
  advisoryRuleset?: boolean;
}

/** 内部：一次审核的结论 + 审计所需的分支/结论分类。 */
interface ReviewOutcome {
  result: ShellReviewResult;
  conclusion: ShellAuditRecord["conclusion"];
  branch: string;
  /**
   * 判断 agent（「替我审」）自己做出的 allow/deny 归因；只在 `(a)` 通道返回
   * `OperatorOutcome.allow/deny.judge` 时出现（`manual` 后客户手批**不带**本字段）。
   */
  judge?: ShellJudgeAudit;
}

/** 内部：(b) 的输出——终结（放行/拒绝）或升级到 (a)。 */
type BOutcome =
  | { kind: "allow"; by: string }
  | { kind: "deny"; reason: string; by: string; /** 覆盖归因码（缺省 `BRANCH_B_DENY`；M-2 的不可解析拒绝用 `BRANCH_B_UNPARSEABLE`）。 */ branch?: string }
  | { kind: "escalate"; bBranch: string; bAttr: string; why: string };

/**
 * 装配 `ShellGate`。产出的门禁函数**无任何策略知识**，只按注入的 `classifyShell` 与规则集判定，
 * 并把「拒绝」作为一切不确定情形的落点（fail-closed）。
 */
export function createShellGate(opts: CreateShellGateOptions): ShellGate {
  // —— 构造期守卫（su 审批档，2026-10-17；全部 fail-closed，抛错 ⇒ 调用方不 arm）——
  // 1) 模式互斥：只读档只放行 (c)=allow；审批档要把 risky/review/deny 交 (a) —— 两者语义冲突。
  if (opts.readonlyOnly === true && opts.operatorOnly === true) {
    throw new Error("shell 闸配置错误：readonlyOnly 与 operatorOnly 互斥，拒绝装配");
  }
  // 2) approveDeny 必须伴随 operatorOnly —— 防止项目角色三层链的硬地板被单独误关。
  if (opts.approveDeny === true && opts.operatorOnly !== true) {
    throw new Error("shell 闸配置错误：approveDeny 仅在 operatorOnly === true 时有效，拒绝装配");
  }
  // 3) 审批档必须有客户通道 —— 不得退化成「全拒但已注册」。
  if (opts.operatorOnly === true && typeof opts.operatorChannel !== "function") {
    throw new Error("shell 闸配置错误：operatorOnly 必须提供 operatorChannel，拒绝装配");
  }
  // 4) su 不自审；客户审批不得被 pm 审读 / 委托常规检查绕过。
  if (opts.operatorOnly === true && (typeof opts.pmAsk === "function" || opts.routineShellPolicy !== undefined)) {
    throw new Error("shell 闸配置错误：operatorOnly 不得带 pmAsk/routineShellPolicy，拒绝装配");
  }
  // 5) advisory 规则集（项目角色）：与只读/审批档互斥；必须有 (a) 通道（所有拒绝由 AI/操作者做出）。
  if (opts.advisoryRuleset === true && (opts.readonlyOnly === true || opts.operatorOnly === true)) {
    throw new Error("shell 闸配置错误：advisoryRuleset 与 readonlyOnly/operatorOnly 互斥，拒绝装配");
  }
  if (opts.advisoryRuleset === true && typeof opts.operatorChannel !== "function") {
    throw new Error("shell 闸配置错误：advisoryRuleset 必须提供 operatorChannel，拒绝装配");
  }

  const log = createDiagnosticLogger({ component: "orchestration.shell-gate", projectRoot: opts.projectRoot ?? opts.routineShellPolicy?.projectRoot });
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? readTimeoutMs(env, SHELL_REVIEW_TIMEOUT_ENV, DEFAULT_SHELL_REVIEW_TIMEOUT_MS);
  const pmTimeoutMs = opts.pmTimeoutMs ?? timeoutMs;
  const operatorTimeoutMs = opts.operatorTimeoutMs ?? timeoutMs;
  const now = opts.now ?? (() => new Date());

  // **F-6-2（2026-10-16 客户批准）：审计失败提示去重 + 如实话术**。同一 gate 实例内按 reason 去重——
  // 首个完整打印一次；相同 reason 的重复只累计、不再逐条打印；reason 变化后再报一次；恢复落盘后
  // 打印一行「已恢复落盘」（含本轮累计未落盘条数）。判定不受影响（「审计失败不翻转判定」语义不变）。
  // （声明须在 `return` 之前——闭包在 createShellGate 返回后才执行，声明后置会落 TDZ。）
  let auditFailure: { reason: string; total: number; suppressed: number } | undefined;

  // 规则集来源：包装为可 await 的加载器（加载失败由 decide 捕获 → 拒绝）。
  const loadRules = async (): Promise<ShellRules> =>
    typeof opts.rules === "function" ? await (opts.rules as () => ShellRules | Promise<ShellRules>)() : opts.rules;

  async function decide(req: ShellGateRequest): Promise<ReviewOutcome> {
    // 退路 2：分类函数缺失 → 能力缺席即拒绝（不注册 run_shell 的等价物在此层也兜住）。
    if (typeof opts.classifyShell !== "function") {
      return {
        result: { allow: false, reason: "未注入 c 分类函数（classifyShell），拒绝执行", by: "ruleset:unavailable" },
        conclusion: "error",
        branch: BRANCH_NO_CLASSIFIER,
      };
    }

    // 退路 1：规则集加载 / 解析失败 → 整条命令拒绝（绝不「规则没了就一律放行」）。
    let rules: ShellRules;
    try {
      rules = await loadRules();
    } catch (err) {
      return {
        result: {
          allow: false,
          reason: `规则集加载/解析失败，整条命令拒绝：${reasonOf(err)}`,
          by: "ruleset:unavailable",
        },
        conclusion: "error",
        branch: BRANCH_RULESET_LOAD_FAILED,
      };
    }
    if (rules === undefined || rules === null) {
      return {
        result: { allow: false, reason: "规则集为空（缺失），整条命令拒绝", by: "ruleset:unavailable" },
        conclusion: "error",
        branch: BRANCH_RULESET_LOAD_FAILED,
      };
    }

    const argv = normalizeArgv(req.argv);
    const rulesId = opts.rulesId ?? "default";

    // 分类：门禁引擎的纯函数。抛错 → 拒绝（保守）。
    let detail: ShellClassifyDetail;
    try {
      detail = normalizeClassification(opts.classifyShell(argv, rules));
    } catch (err) {
      return {
        result: { allow: false, reason: `c 分类异常，拒绝执行：${reasonOf(err)}`, by: `ruleset:${rulesId}` },
        conclusion: "error",
        branch: BRANCH_CLASSIFY_ERROR,
      };
    }

    const by = `ruleset:${detail.ruleId ?? rulesId}`;
    // 档位后缀（审计 `by` 可辨识；两者互斥，构造期已守）：
    //   · 只读档 ⇒ `（su 只读档）`（既有，逐字不变）；
    //   · 审批档 ⇒ `（su 审批档）`（2026-10-17；**不得**复用只读档后缀）。
    const byTagged =
      opts.readonlyOnly === true
        ? `${by}（su 只读档）`
        : opts.operatorOnly === true
          ? `${by}（su 审批档）`
          : opts.advisoryRuleset === true
            ? `${by}（advisory 规则）`
            : by;

    // 映射（§7.5）。
    if (detail.decision === "allow") {
      // 命中 c 白名单 → 直接放行（**不产出 token**；审核与 spawn 同址于 execute，票据已废，§7.1 第 3 条）。
      return {
        result: { allow: true, by: byTagged },
        conclusion: "allow",
        branch: BRANCH_C_ALLOW,
      };
    }
    // —— advisory 规则集（客户 2026-10-18）：(c) 只快速放行，**不拒绝任何请求** ——
    // risky/review/deny 一律跳过 (b)、直接交 (a)；规则判定与命中原因作为 reason 交判断 agent 参考。
    // （构造期已守卫与 readonlyOnly/operatorOnly 互斥、必须有 operatorChannel。）
    if (opts.advisoryRuleset === true) {
      const tier = detail.decision; // 已排除 "allow"
      const branch = tier === "deny" ? BRANCH_C_DENY : tier === "risky" ? BRANCH_C_RISKY : BRANCH_C_REVIEW;
      const detailText =
        detail.reason ??
        (tier === "deny" ? `命中 c 规则判为 deny（${by}）` : `(c) 判为 ${tier}（${by}）`);
      return await runA(req, {
        bBranch: branch,
        bAttr: byTagged,
        why: `(c) 规则判为 ${tier}（${by}）：${detailText}。规则只作参考；请判断是否放行。`,
      });
    }
    // —— su 审批档（operatorOnly，客户裁定 2026-10-17）：allow 已在上方直放（**0 次 operator 调用**）——
    // 其余档一律交 (a) 客户逐条批准；`deny` 仅在 `approveDeny === true` 时如此，否则落到下方既有硬拒。
    // 不接 (b)（构造期已禁止 pmAsk/routineShellPolicy）——su 不自审。
    if (opts.operatorOnly === true) {
      const tier = detail.decision; // 此时已排除 "allow"
      if (tier !== "deny" || opts.approveDeny === true) {
        const branch =
          tier === "deny" ? BRANCH_C_DENY : tier === "risky" ? BRANCH_C_RISKY : BRANCH_C_REVIEW;
        const detailText =
          detail.reason ??
          (tier === "deny" ? `命中 c 硬拒规则（${by}）` : `(c) 判为 ${tier}（${by}）`);
        return await runA(req, {
          bBranch: branch,
          bAttr: byTagged,
          why: renderSuApprovalReason(tier, detailText),
        });
      }
    }
    if (detail.decision === "deny") {
      // 命中 c 硬拒 → 直接拒绝，终结（(b)/(a) 不可翻案）。
      return {
        result: { allow: false, reason: detail.reason ?? `命中 c 硬拒规则（${by}）`, by: byTagged },
        conclusion: "deny",
        branch: BRANCH_C_DENY,
      };
    }
    // decision === "review" 或 "risky"：既未命中白名单、也未被硬拒。
    // **su 只读档**（readonlyOnly，客户裁定 2026-10-12）：risky/review **一律拒绝**——本档只放行 (c) 白名单，
    // **不接 (b)**（su 自己就是审读者，不自审）、**不接 (a)**（只读外的命令直接拒，不打扰客户、不弹框）。
    // reason 写明命中的是哪一档（risky/review），让模型看懂「这是 su 只读档的策略拒绝，不是环境故障」。
    if (opts.readonlyOnly === true) {
      const tier = detail.decision === "risky" ? "risky" : "review";
      return {
        result: {
          allow: false,
          reason:
            `su 只读档：本会话仅允许只读白名单命令；该命令未命中白名单（(c) 判为 ${tier}），` +
            `按 su 只读策略拒绝执行——这是策略拒绝，不是环境故障。`,
          by: byTagged,
        },
        conclusion: "deny",
        branch: BRANCH_READONLY_DENY,
      };
    }
    // 三层链（既有行为，逐字不变）：(c) 的硬拒**永不至此**（上面已终结）——故 (b)/(a) 只在 (c)
    // **未明令禁止**的区间里判断，硬地板不被翻案（§7.3 要害）。cBy 仅作 (a) 都未接入时的审计归属。
    // §14.2：`risky` 与 `review` 走**同一条**入口，唯一差别是 `mustPassA`——risky 时 (b) 判放行**仍必过 (a)**。
    return await runBA(req, by, detail.decision === "risky");
  }

  // —————————————————————— 第二闸 (b) + 第三闸 (a)（§7.3 判定顺序即交互顺序） ——————————————————————

  /**
   * (c)=`review`/`risky` 之后：先问 (b)，再按 §7.5「只往更严的层退」决定是否升级到 (a)。
   *
   * `mustPassA`（= (c) 判 `risky`，§14.2）：**b 判放行也仍升 (a)**——pm 不是终审，客户才是；
   *   `review` 时恒 false——b 判放行即**终结**（不打扰人）。这就是两档**唯一**的差别。
   */
  async function runBA(req: ShellGateRequest, cBy: string, mustPassA: boolean): Promise<ReviewOutcome> {
    // (c)-only 装配：**既未接 (b) 也未接 (a)**——保留第一步的 fail-closed（默认拒绝）。
    // 这不是「没有下一闸就放行」，而是「两侧都缺席 ⇒ 一律拒」。接上任一层即走下方完整链。
    // 对 `risky` 尤其成立：它**必过 (a)**，两侧都缺席 ⇒ 无从确认 ⇒ 拒（fail-closed，§14.2）。
    if (typeof opts.pmAsk !== "function" && typeof opts.operatorChannel !== "function") {
      return {
        result: {
          allow: false,
          reason: mustPassA
            ? "未接入 (b)/(a)，risky 命令默认拒绝（fail-closed：risky 必过 (a)，a 缺席即拒）"
            : "未接入 (b)/(a)，review 默认拒绝（fail-closed：不因缺下一闸而放行）",
          by: `${cBy}（未接入 (b)/(a)）`,
        },
        conclusion: "deny",
        branch: mustPassA ? BRANCH_RISKY_NO_BA : BRANCH_REVIEW_NO_BA,
      };
    }

    const b = await runB(req);
    if (b.kind === "allow") {
      // `risky`（mustPassA）：**b 判放行亦须过 (a)**（§14.2 要害——pm 非终审）；升 (a) 的分支成 `b-allow→a-…`。
      // `review`：b 明确放行即**终结**（不打扰人）——与 risky 的分水岭就在这里。
      if (mustPassA) {
        if (matchesDelegatedRoutineCheck(req.argv, req.cwd, opts.routineShellPolicy)) {
          log.record("shell.routine.delegated", { toolCallId: req.toolCallId, authorizationSource: opts.routineShellPolicy?.authorizationSource });
          return {
            result: { allow: true, by: `${b.by} → customer-delegated-routine-checks` },
            conclusion: "allow", branch: BRANCH_B_DELEGATED_ROUTINE,
          };
        }
        return await runA(req, {
          bBranch: BRANCH_B_ALLOW,
          bAttr: b.by,
          why: "risky 命令：pm 判放行，仍须操作者确认（pm 不是终审，客户才是）",
        });
      }
      return { result: { allow: true, by: b.by }, conclusion: "allow", branch: BRANCH_B_ALLOW };
    }
    if (b.kind === "deny") {
      // 两档同：b 判拒绝即**终结拒绝**（**不打扰人**）——risky 也**不**因此叫人（§14.2「唯独 b 判拒时不打扰」）。
      // 归因码缺省 `b-deny`；M-2 的「不可解析拒绝」自带 `BRANCH_B_UNPARSEABLE`（同样不升 (a)）。
      return { result: { allow: false, reason: b.reason, by: b.by }, conclusion: "deny", branch: b.branch ?? BRANCH_B_DENY };
    }
    // b.kind === "escalate"：拿不准 / 无会话 / 超时 / 报错 / JSON 非法 → 升级到 (a)（两档同）。
    return await runA(req, b);
  }

  /** 第二闸 (b)：把命令原文交注入的 pm 审读；拿不准或不可用即升级（绝不视为放行，§7.5）。 */
  async function runB(req: ShellGateRequest): Promise<BOutcome> {
    log.record("shell.review.start", { toolCallId: req.toolCallId });
    if (typeof opts.pmAsk !== "function") {
      // 无 pm 会话 → 升级到 (a)（"绝不视为放行"，§7.5）。
      return { kind: "escalate", bBranch: BRANCH_B_UNAVAILABLE, bAttr: "pm:无会话", why: "未接入 pm 审读会话" };
    }
    const input: PmReviewInput = {
      command: req.command,
      argv: normalizeArgv(req.argv),
      cwd: req.cwd,
      toolCallId: req.toolCallId,
    };

    let raw: string | null | undefined;
    try {
      raw = await withTimeout(Promise.resolve(opts.pmAsk(input)), pmTimeoutMs, "pm 审读");
    } catch (err) {
      // pm 超时 → 升级到 (a)；pm 报错 → 升级到 (a)（都不是放行）。
      if (isTimeoutError(err)) {
        return { kind: "escalate", bBranch: BRANCH_B_TIMEOUT, bAttr: "pm:超时", why: "pm 审读超时" };
      }
      return {
        kind: "escalate",
        bBranch: BRANCH_B_UNAVAILABLE,
        bAttr: "pm:报错",
        why: `pm 审读报错：${reasonOf(err)}`,
      };
    }

    // **M-2**：判定输出不可解析（含 null/undefined、围栏剥离与取首个 JSON 对象后仍非法）→ **直接拒绝**
    // （fail-closed）——**不升级 (a)、不重试、不打扰客户**；如实短句回给角色（归因码稳定，供 M-1 映射人话）。
    const parsed = parsePmVerdict(raw);
    if (parsed === undefined) {
      return { kind: "deny", reason: REASON_B_UNPARSEABLE, by: "pm:输出不可解析", branch: BRANCH_B_UNPARSEABLE };
    }

    const by = pmBy(parsed);
    if (parsed.verdict === "allow") return { kind: "allow", by };
    if (parsed.verdict === "deny") return { kind: "deny", reason: parsed.reason ?? "pm 判读为拒绝", by };
    // 拿不准 → 升级到 (a)（§7.3 第 2 条）。
    return { kind: "escalate", bBranch: BRANCH_B_UNSURE, bAttr: by, why: parsed.reason ?? "pm 拿不准，交操作者" };
  }

  /** 第三闸 (a)：仅当 (b) 升级时才到时，挂起问操作者；不可用 / 超时 / 拒绝 → 拒绝（§7.5）。 */
  async function runA(
    req: ShellGateRequest,
    b: { bBranch: string; bAttr: string; why: string },
  ): Promise<ReviewOutcome> {
    log.record("shell.operator.requested", { toolCallId: req.toolCallId, reasonCode: b.bBranch });
    // 通道未接入 → 拒绝（不是放行）。
    if (typeof opts.operatorChannel !== "function") {
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_UNAVAILABLE),
        `${b.bAttr} → operator:通道未接入`,
        "操作者通道未接入，拒绝",
      );
    }
    const prompt: OperatorPrompt = {
      command: req.command,
      argv: normalizeArgv(req.argv),
      cwd: req.cwd,
      toolCallId: req.toolCallId,
      reason: b.why,
    };

    let out: OperatorOutcome | null | undefined;
    try {
      out = await withTimeout(Promise.resolve(opts.operatorChannel(prompt)), operatorTimeoutMs, "操作者确认");
    } catch (err) {
      if (isTimeoutError(err)) {
        return denyOutcome(
          escalateBranch(b.bBranch, BRANCH_A_TIMEOUT),
          `${b.bAttr} → operator:超时`,
          "操作者确认超时，拒绝",
        );
      }
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_UNAVAILABLE),
        `${b.bAttr} → operator:通道报错`,
        `操作者通道报错，拒绝：${reasonOf(err)}`,
      );
    }

    if (out === undefined || out === null || out.outcome === "unavailable") {
      // **F-4-X1（2026-10-16 客户批准）**：不再固定「操作者通道不可用（无人值守？）」——**转达操作者通道
      // 上报的真实 reason**（如「操作者确认超时（>Nms），拒绝执行（fail-closed）」与「本轮已结束、停止或
      // 会话已重建，旧 shell 确认失效」可辨；桌面通道 M2 起在 reason 里分流「确认超时 / 轮次中止」）。
      // 归因码保持稳定（仍落 `a-unavailable`；M-1 人话映射按码对号、不看文本猜）——fail-closed 结论
      // 逐字不变（拒绝）。通道未回结果/未给原因时给如实的保守兜底句，不猜测「无人值守」。
      const channelReason =
        out !== undefined && out !== null && typeof out.reason === "string" && out.reason.trim() !== ""
          ? out.reason
          : "操作者通道不可用（未给出原因），拒绝（fail-closed）";
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_UNAVAILABLE),
        `${b.bAttr} → operator:不可用`,
        channelReason,
      );
    }
    if (out.outcome === "allow") {
      return {
        result: { allow: true, by: `${b.bAttr} → ${operatorBy(out)}` },
        conclusion: "allow",
        branch: escalateBranch(b.bBranch, BRANCH_A_ALLOW),
        ...(out.judge !== undefined ? { judge: out.judge } : {}),
      };
    }
    if (out.outcome === "deny") {
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_DENY),
        `${b.bAttr} → ${operatorBy(out)}`,
        out.reason ?? "操作者拒绝",
        out.judge,
      );
    }
    // 非法 outcome → 保守拒绝（fail-closed）。
    return denyOutcome(
      escalateBranch(b.bBranch, BRANCH_A_UNAVAILABLE),
      `${b.bAttr} → operator:非法结果`,
      "操作者通道返回非法结果，拒绝",
    );
  }

  return async (req: ShellGateRequest): Promise<ShellReviewResult> => {
    // 超时包装整个审核；超时 = 拒绝（§7.5 退路 3）。
    let outcome: ReviewOutcome;
    try {
      outcome = await withTimeout(decide(req), timeoutMs, "shell 审核");
    } catch (err) {
      const timedOut = isTimeoutError(err);
      outcome = {
        result: {
          allow: false,
          reason: timedOut ? `审核超时（>${timeoutMs}ms），拒绝执行` : `审核异常，拒绝执行：${reasonOf(err)}`,
          by: timedOut ? "ruleset:timeout" : "ruleset:error",
        },
        conclusion: timedOut ? "timeout" : "error",
        branch: timedOut ? BRANCH_TIMEOUT : BRANCH_CLASSIFY_ERROR,
      };
    }

    // 审计留痕（§7.6）：放行/拒绝都记；含所需字段与声明的条件。审计失败**不翻转**判定
    //（判定已完成且确定），但如实上报到 stderr，绝不静默。
    log.record("shell.review.end", { toolCallId: req.toolCallId, decision: outcome.conclusion, reasonCode: outcome.branch });
    await audit(req, outcome, now());
    return outcome.result;
  };

  // **F-6-2（2026-10-16 客户批准）：审计失败提示去重 + 如实话术**（状态 `auditFailure` 声明在函数体前部，
  // 见上——闭包在 `return` 之后才执行，状态必须提前声明）。判定不受影响（「审计失败不翻转判定」不变）。
  async function audit(req: ShellGateRequest, outcome: ReviewOutcome, at: Date): Promise<void> {
    const record: ShellAuditRecord = {
      timestamp: at.toISOString(),
      toolCallId: req.toolCallId,
      command: req.command,
      argv: normalizeArgv(req.argv),
      cwd: req.cwd,
      conclusion: outcome.conclusion,
      branch: outcome.branch,
      by: outcome.result.by,
      conditions: [SHELL_GATE_CONDITION], // 声明 shell-gate（门禁按此放行 docs/audit/）
      execution: "未执行", // 审核发生在执行之前；exit code 由 Pi 适配器执行后另记
      // 判断 agent（「替我审」）自己做出的 allow/deny 才写；manual 后客户手批不带本字段。
      ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
    };
    try {
      const res = await opts.audit.append(record);
      if (!res.ok) {
        const reason = res.reason ?? "未知原因";
        if (auditFailure !== undefined && auditFailure.reason === reason) {
          auditFailure.total += 1;
          auditFailure.suppressed += 1;
        } else {
          auditFailure = { reason, total: (auditFailure?.total ?? 0) + 1, suppressed: 0 };
          process.stderr.write(`shell 闸审计未落盘：${reason}\n`);
        }
      } else if (auditFailure !== undefined) {
        const total = auditFailure.total;
        auditFailure = undefined;
        process.stderr.write(`shell 闸审计已恢复落盘（此前未落盘 ${total} 条）\n`);
      }
    } catch (err) {
      process.stderr.write(`shell 闸审计异常：${reasonOf(err)}\n`);
    }
  }
}

// —————————————————————— Pipeline 装配入口（构造 + 注入） ——————————————————————

/**
 * Pipeline 层构造 `ShellGate` 的**唯一入口**（仿 `buildGate` 构造 `WriteGate` 的注入模式）：
 * 把注入的 (c) 分类函数、规则集、pm 边界、两根装配成 `ShellGate`，并就地建好**审计落盘**
 * （`docs/audit/shell-gate.jsonl`，以 pm 授权、声明 `shell-gate` 条件）。
 *
 * 依赖由装配/调用方注入——本函数**不持有**任何规则集或边界（那分别是门禁引擎/装配的数据）。
 * 当 (c) 的 `classifyShell` 尚不可用时，调用方**不调用**本函数：`ShellGate` 缺席 ⇒ Pi 适配器
 * **不注册 `run_shell`**（§7.5.1 能力缺席即最强 fail-closed）。一旦门禁引擎落盘 `classifyShell`，
 * 只需在此注入它即可接线，编排代码无须再改。
 */
export interface ShellGateBuildDeps {
  /** 门禁引擎的纯函数 `classifyShell`（注入）；缺失 → 产出的 gate 一律拒绝。 */
  classifyShell?: ClassifyShellFn;
  /** 规则集本体或加载器（门禁引擎的数据）。 */
  rules: ShellRules | (() => ShellRules | Promise<ShellRules>);
  /** (b) 问 pm 角色模型的注入点（§7.3）。缺省 → (b) 不可用，升级到 (a)。 */
  pmAsk?: PmAskFn;
  /** (a) 操作者确认通道（注入）。缺省 → (a) 不可用 → 拒绝。桌面端由桌面应用角色提供。 */
  operatorChannel?: OperatorChannelFn;
  routineShellPolicy?: RoutineShellPolicy;
  /** (b) 审读超时（毫秒）；缺省 = `timeoutMs`。 */
  pmTimeoutMs?: number;
  /** (a) 确认超时（毫秒）；缺省 = `timeoutMs`。 */
  operatorTimeoutMs?: number;
  projectRoot: string;
  skillRoot: string;
  /** pm 边界（含 `conditional-directory: docs/audit/`，condition `shell-gate`），用于审计写门禁。 */
  pmBoundary: BoundarySection1;
  timeoutMs?: number;
  /** 规则集 id（审计归属）；缺省 `default`。 */
  rulesId?: string;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  /** 覆盖审计 sink（测试用）；缺省写 `docs/audit/shell-gate.jsonl`。 */
  auditSink?: ShellAuditSink;
  /**
   * **F-6-1 审计边界刷新闭包**（2026-10-16 客户批准）：缺省文件审计 sink 在首查被拒时调用它——
   * **重读盘上最新接受证据**重新解析治理边界（装配方注入；`shell-arming.ts` 用共享载入器
   * `loadEffectiveConfig` + 同一 `resolveGovernanceBoundary` 构造），并以新门禁**重试一次**
   * （见 `shell-audit.ts::createFileAuditSink.refreshGate`）。**缺省不传 = 旧行为（无刷新，逐字不变）**。
   */
  auditBoundaryRefresh?: () => Promise<BoundarySection1>;
  /**
   * **su 只读档**（见 `CreateShellGateOptions.readonlyOnly`）：`true` ⇒ 只映射 (c) 白名单，
   * `risky`/`review` 一律拒绝（`readonly-deny`），**(b)/(a) 即使注入了也永不调用**。
   * 缺省 `false` = 既有三层链行为逐字不变。
   */
  readonlyOnly?: boolean;
  /** **su 审批档**（见 `CreateShellGateOptions.operatorOnly`；构造期守卫同上）。 */
  operatorOnly?: boolean;
  /** **允许客户批准 (c)=deny**（仅 `operatorOnly === true` 有效；见 `CreateShellGateOptions.approveDeny`）。 */
  approveDeny?: boolean;
  /** **advisory 规则集**（见 `CreateShellGateOptions.advisoryRuleset`）。 */
  advisoryRuleset?: boolean;
}

export function buildShellGate(deps: ShellGateBuildDeps): ShellGate {
  const audit =
    deps.auditSink ??
    createFileAuditSink({
      projectRoot: deps.projectRoot,
      gate: buildShellAuditGate(deps.pmBoundary, {
        skillRoot: deps.skillRoot,
        projectRoot: deps.projectRoot,
      }),
      // F-6-1：注入刷新闭包时，被拒路径重解析一次并以新门禁重试（缺省不传 = 旧行为逐字不变）。
      ...(deps.auditBoundaryRefresh !== undefined
        ? {
            refreshGate: async () => {
              const fresh = await deps.auditBoundaryRefresh!();
              return buildShellAuditGate(fresh, { skillRoot: deps.skillRoot, projectRoot: deps.projectRoot });
            },
          }
        : {}),
    });
  return createShellGate({
    projectRoot: deps.projectRoot,
    classifyShell: deps.classifyShell,
    rules: deps.rules,
    audit,
    pmAsk: deps.pmAsk,
    operatorChannel: deps.operatorChannel,
    routineShellPolicy: deps.routineShellPolicy,
    pmTimeoutMs: deps.pmTimeoutMs,
    operatorTimeoutMs: deps.operatorTimeoutMs,
    timeoutMs: deps.timeoutMs,
    rulesId: deps.rulesId,
    now: deps.now,
    env: deps.env,
    readonlyOnly: deps.readonlyOnly,
    operatorOnly: deps.operatorOnly,
    approveDeny: deps.approveDeny,
    advisoryRuleset: deps.advisoryRuleset,
  });
}

// —— 内部辅助 ——

function normalizeClassification(v: ShellClass | ShellClassifyDetail): ShellClassifyDetail {
  if (typeof v === "string") return { decision: v };
  if (v && typeof v === "object" && typeof (v as ShellClassifyDetail).decision === "string") {
    return v as ShellClassifyDetail;
  }
  // 非法返回值 → 保守当作 review（第一步 review 即拒绝）。
  return { decision: "review" };
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 构造一个「拒绝」结论（(a) 各失败路径共用；by 记录谁（未）审的、branch 记录升级链）。 */
function denyOutcome(branch: string, by: string, reason: string, judge?: ShellJudgeAudit): ReviewOutcome {
  return {
    result: { allow: false, reason, by },
    conclusion: "deny",
    branch,
    ...(judge !== undefined ? { judge } : {}),
  };
}

/** pm 身份（审计 `by`）：`pm:<会话>(<模型>)`，缺项则退化。 */
function pmBy(v: PmVerdictResult): string {
  const who = v.sessionId ? `pm:${v.sessionId}` : "pm";
  return v.model ? `${who}(${v.model})` : who;
}

/** 操作者身份（审计 `by`）：`operator:<标识>`，缺标识则标「未知操作者」。 */
function operatorBy(out: { operatorId?: string }): string {
  return out.operatorId ? `operator:${out.operatorId}` : "operator:未知操作者";
}

/**
 * 解析 (b) 注入点返回的**原文**为三态结果。**任何不确定 → 返回 undefined**（调用方据此升级到 (a)，§7.5）。
 * 容忍模型常见的包装：```json 代码围栏、JSON 前后的解释性文字（取第一个 `{...}` 块）。
 * 判定字段必须是 `verdict ∈ {allow, deny, unsure}`——否则视为非法（不把「看不懂」当放行）。
 */
export function parsePmVerdict(raw: unknown): PmVerdictResult | undefined {
  if (typeof raw !== "string") return undefined;
  let text = raw.trim();
  if (text === "") return undefined;

  // 去掉 ```json ... ``` 围栏（若存在）。
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced !== null) text = fenced[1].trim();

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    // 退一步：抓第一个 {...} 块（模型可能在 JSON 前后加了话）。
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace === null) return undefined;
    try {
      obj = JSON.parse(brace[0]);
    } catch {
      return undefined;
    }
  }
  if (obj === null || typeof obj !== "object") return undefined;

  const rec = obj as Record<string, unknown>;
  const verdict = rec.verdict;
  if (verdict !== "allow" && verdict !== "deny" && verdict !== "unsure") return undefined;

  const out: PmVerdictResult = { verdict };
  if (typeof rec.reason === "string") out.reason = rec.reason;
  if (typeof rec.sessionId === "string") out.sessionId = rec.sessionId;
  if (typeof rec.model === "string") out.model = rec.model;
  return out;
}
