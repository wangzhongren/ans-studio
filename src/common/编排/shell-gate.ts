// src/common/编排/shell-gate.ts
// `ShellGate` 装配（设计 §7.2、§7.3、§7.4、§7.5、§7.6）。
//
// 归属：编排。仿既有 `WriteGate` 的**注入**模式——判定源与工具**解耦**：本模块产出 `ShellGate`，
// 注入给 Pi 适配器的 `run_shell`；Pi 适配器**不含任何审核策略，只调用**它。
//
// —— 三层审核链 (c) → (b) → (a)（§7.3 判定顺序即交互顺序） ——
// 客户裁定审核主体为三层组合 **(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**（§7.3）。
// 本模块**串起三层**，映射（§7.5）：
//   1. **(c) 第一闸，硬地板，绝对否决**（`classifyShell`）：
//      - 命中**白名单** → 直接放行 `{ allow:true, by:"ruleset:<规则id>" }`（**不含 token**，§7.1 第 3 条），**不再经 (b)/(a)**；
//      - 命中**硬拒** → 直接拒绝 `{ allow:false, reason, by }`，**终结**，**不进入 (b)/(a)**；
//        **硬地板的否决不可被 (b)/(a) 翻案**——(b)/(a) 只作用于 (c) 判为「review（两者都不命中）」的区间；
//      - 两者都不命中（`review`）→ 交第二闸。
//   2. **(b) 第二闸，增量**（注入的 `pmAsk`，问 pm 角色模型）：
//      - 判**放行** → 放行；判**拒绝** → 拒绝、终结；
//      - **拿不准 / 无 pm 会话 / 超时 / 报错 / 判定 JSON 不合法** → 交第三闸 (a)（**绝不视为放行**）。
//   3. **(a) 第三闸，兜底**（注入的 `operatorChannel`，CLI 读 stdin / 桌面弹层）：
//      - **仅当 (b) 拿不准或不可用时**才挂起叫人看原文点放行/拒绝；
//      - **放行 → 放行；不可用 / 通道未接 / 超时 / 拒绝 → 拒绝**。
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
//   3. 审核**超时**（超时包装，仿 pi-adapter/timeout.ts）→ **拒绝**。
//
// —— 规则引擎 (c) 不在此实现 ——
// `classifyShell(argv, rules)` 由**门禁引擎**实现（纯函数，`src/service/gate/` 或 `src/common/门禁引擎/`，
// 并行开发中）。本模块经**注入**依赖它（形参 `classifyShell`），**不含任何规则集**——规则集内容不属编排。

import type {
  ShellGate,
  ShellReviewRequest,
  ShellReviewResult,
  OperatorPrompt,
  OperatorOutcome,
  OperatorChannelFn,
} from "../../provider/pi/session.ts";
import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ShellClass, ShellRules } from "../../model/decision.ts";
import {
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_REVIEW_TIMEOUT_ENV,
  withTimeout,
  isTimeoutError,
  readTimeoutMs,
} from "../../common/pi-adapter/timeout.ts";
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
// 类型定义归 Pi 适配器的 src/provider/pi/session.ts（工具层与扩展层按同一形状编译）；此处按其形状
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
// **接口形状为何是「返回原文（字符串）」而非「返回已解析的对象」**：§7.5 要求「判定 JSON 不合法 → 升级到 (a)」——
// 这条只有在**本层持有解析职责**时才成立、才可测。故注入点返回 pm 的**原文回复**，由本模块的 `parsePmVerdict`
// 解析成三态；解析失败即 `b-badjson` → 升级到 (a)。

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
// **三型的单一来源在 §4 冻结契约家 `src/provider/pi/session.ts`（T21 起）**：`OperatorPrompt` / `OperatorOutcome` /
// `OperatorChannelFn` 原先定义在本文件，导致桌面应用只能**逐字镜像**（工程法案 §6 禁止跨角色导入他人私有 `common/`）。
// 经 PM 裁定挪入 Provider 边界（与本模块早先放那里的 `ShellGate` / `ShellReviewRequest` / `ShellReviewResult` 同址）。
// 本文件**不再定义**任何 operator 形状——只**再导出**其名以保住既有消费方（含 `test/编排/`、`operator-channel.ts`）
// 零改动。**单一来源，非第二份**（形状逐字未变）。

export type { OperatorPrompt, OperatorOutcome, OperatorChannelFn };


// —— 常量 ——
// 审核硬超时默认值与环境变量：复用 pi-adapter/timeout.ts 的**规范常量**（与工具层同一名称、同一口径），
// 不另立第二套 env（`ANS_PI_SHELL_REVIEW_TIMEOUT_MS`，默认 120000ms）。超时 = 拒绝。

// 触发分支（§7.6「触发分支」字段取值）。分三类：c 层终结 / b 层终结 / a 层（含升级链）。
export const BRANCH_C_ALLOW = "c-allow"; // 命中 c 白名单
export const BRANCH_C_DENY = "c-deny"; // 命中 c 硬拒
export const BRANCH_REVIEW_NO_BA = "review-default-deny"; // (c)=review 且 (b)/(a) 均未接入 → 默认拒（保留第一步 fail-closed）
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
export const BRANCH_B_BADJSON = "b-badjson"; // pm 判定 JSON 不合法 → 升级到 (a)

// —— 第三闸 (a) —— 触发分支（升级链：`<b 分支>→<a 分支>`，如 `b-unsure→a-allow`）。
export const BRANCH_A_ALLOW = "a-allow"; // 操作者放行
export const BRANCH_A_DENY = "a-deny"; // 操作者拒绝
export const BRANCH_A_UNAVAILABLE = "a-unavailable"; // 操作者通道不可用 / 未接入 / 报错 → 拒绝
export const BRANCH_A_TIMEOUT = "a-timeout"; // 操作者确认超时 → 拒绝

/** 升级链分支：`b-unsure→a-allow` 这类字符串，两层的触发分支都可辨识（§7.6 要求「每层可辨识」）。 */
export function escalateBranch(bBranch: string, aBranch: string): string {
  return `${bBranch}→${aBranch}`;
}

export interface CreateShellGateOptions {
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
}

/** 内部：一次审核的结论 + 审计所需的分支/结论分类。 */
interface ReviewOutcome {
  result: ShellReviewResult;
  conclusion: ShellAuditRecord["conclusion"];
  branch: string;
}

/** 内部：(b) 的输出——终结（放行/拒绝）或升级到 (a)。 */
type BOutcome =
  | { kind: "allow"; by: string }
  | { kind: "deny"; reason: string; by: string }
  | { kind: "escalate"; bBranch: string; bAttr: string; why: string };

/**
 * 装配 `ShellGate`。产出的门禁函数**无任何策略知识**，只按注入的 `classifyShell` 与规则集判定，
 * 并把「拒绝」作为一切不确定情形的落点（fail-closed）。
 */
export function createShellGate(opts: CreateShellGateOptions): ShellGate {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? readTimeoutMs(env, SHELL_REVIEW_TIMEOUT_ENV, DEFAULT_SHELL_REVIEW_TIMEOUT_MS);
  const pmTimeoutMs = opts.pmTimeoutMs ?? timeoutMs;
  const operatorTimeoutMs = opts.operatorTimeoutMs ?? timeoutMs;
  const now = opts.now ?? (() => new Date());

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

    // 映射（§7.5）。
    if (detail.decision === "allow") {
      // 命中 c 白名单 → 直接放行（**不产出 token**；审核与 spawn 同址于 execute，票据已废，§7.1 第 3 条）。
      return {
        result: { allow: true, by },
        conclusion: "allow",
        branch: BRANCH_C_ALLOW,
      };
    }
    if (detail.decision === "deny") {
      // 命中 c 硬拒 → 直接拒绝，终结（(b)/(a) 不可翻案）。
      return {
        result: { allow: false, reason: detail.reason ?? `命中 c 硬拒规则（${by}）`, by },
        conclusion: "deny",
        branch: BRANCH_C_DENY,
      };
    }
    // decision === "review"：既未命中白名单、也未被硬拒 → 交第二闸 (b)，再视情形交第三闸 (a)。
    // (c) 的硬拒**永不至此**（上面已终结）——故 (b)/(a) 只在 (c) **未明令禁止**的区间里判断，
    // 硬地板不被翻案（§7.3 要害）。cBy 仅作 (a) 都未接入时的审计归属。
    return await runBA(req, by);
  }

  // —————————————————————— 第二闸 (b) + 第三闸 (a)（§7.3 判定顺序即交互顺序） ——————————————————————

  /** (c)=review 之后：先问 (b)，再按 §7.5「只往更严的层退」决定是否升级到 (a)。 */
  async function runBA(req: ShellGateRequest, cBy: string): Promise<ReviewOutcome> {
    // (c)-only 装配：**既未接 (b) 也未接 (a)**——保留第一步的 fail-closed（review 默认拒绝）。
    // 这不是「没有下一闸就放行」，而是「两侧都缺席 ⇒ 一律拒」。接上任一层即走下方完整链。
    if (typeof opts.pmAsk !== "function" && typeof opts.operatorChannel !== "function") {
      return {
        result: {
          allow: false,
          reason: "未接入 (b)/(a)，review 默认拒绝（fail-closed：不因缺下一闸而放行）",
          by: `${cBy}（未接入 (b)/(a)）`,
        },
        conclusion: "deny",
        branch: BRANCH_REVIEW_NO_BA,
      };
    }

    const b = await runB(req);
    if (b.kind === "allow") {
      return { result: { allow: true, by: b.by }, conclusion: "allow", branch: BRANCH_B_ALLOW };
    }
    if (b.kind === "deny") {
      return { result: { allow: false, reason: b.reason, by: b.by }, conclusion: "deny", branch: BRANCH_B_DENY };
    }
    // b.kind === "escalate"：拿不准 / 无会话 / 超时 / 报错 / JSON 非法 → 升级到 (a)。
    return await runA(req, b);
  }

  /** 第二闸 (b)：把命令原文交注入的 pm 审读；拿不准或不可用即升级（绝不视为放行，§7.5）。 */
  async function runB(req: ShellGateRequest): Promise<BOutcome> {
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

    // 判定 JSON 不合法（含 null/undefined）→ 升级到 (a)（§7.5）。
    const parsed = parsePmVerdict(raw);
    if (parsed === undefined) {
      return { kind: "escalate", bBranch: BRANCH_B_BADJSON, bAttr: "pm:判定 JSON 不合法", why: "pm 判定 JSON 不合法" };
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
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_UNAVAILABLE),
        `${b.bAttr} → operator:不可用`,
        "操作者通道不可用（无人值守？），拒绝",
      );
    }
    if (out.outcome === "allow") {
      return {
        result: { allow: true, by: `${b.bAttr} → ${operatorBy(out)}` },
        conclusion: "allow",
        branch: escalateBranch(b.bBranch, BRANCH_A_ALLOW),
      };
    }
    if (out.outcome === "deny") {
      return denyOutcome(
        escalateBranch(b.bBranch, BRANCH_A_DENY),
        `${b.bAttr} → ${operatorBy(out)}`,
        out.reason ?? "操作者拒绝",
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
    await audit(req, outcome, now());
    return outcome.result;
  };

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
    };
    try {
      const res = await opts.audit.append(record);
      if (!res.ok) process.stderr.write(`shell 闸审计未落盘：${res.reason ?? "未知原因"}\n`);
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
    });
  return createShellGate({
    classifyShell: deps.classifyShell,
    rules: deps.rules,
    audit,
    pmAsk: deps.pmAsk,
    operatorChannel: deps.operatorChannel,
    pmTimeoutMs: deps.pmTimeoutMs,
    operatorTimeoutMs: deps.operatorTimeoutMs,
    timeoutMs: deps.timeoutMs,
    rulesId: deps.rulesId,
    now: deps.now,
    env: deps.env,
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
function denyOutcome(branch: string, by: string, reason: string): ReviewOutcome {
  return { result: { allow: false, reason, by }, conclusion: "deny", branch };
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
