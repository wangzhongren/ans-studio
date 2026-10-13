// app/desktop/operator-channel.ts
// 桌面应用的「操作者确认通道 (a)」——shell 审核三层链的**第三闸、兜底**（设计 §7.3/§7.4/§7.5/§7.6）。
//
// 归属：Interface / 桌面应用（本角色边界内）。纯逻辑，**不依赖 electron**，可在 node 下单测；
// 真正的弹窗表现由**注入的 presenter** 提供（主进程用 electron dialog 实现，见 app/main.ts）。
//
// —— 这与什么（判据） ——
// 客户裁定的 shell 审核是三层组合：**(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**（§7.3）。
// (c)/(b) 由**编排**实现；(a) 是「**人看一眼命令原文，点放行/拒绝**」——CLI 上由编排实现、**桌面端由本模块实现**。
// **(a) 是第三闸、兜底**：只有当 **(b) 拿不准或不可用**时才会叫人（§7.3）——不是每条命令都弹窗。
//
// —— 契约（**单一来源 = §4 冻结契约家** `src/provider/pi/session.ts`） ——
// 注入点三型（入参 `OperatorPrompt`、出参 `OperatorOutcome`、通道 `OperatorChannelFn`）现由 **Pi适配器（T20）**
// 置于 §4 冻结契约家 `src/provider/pi/session.ts`（经 PM 裁定从编排私有 `common/编排/` 挪入）。**§6 通路已开**，
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
} from "../../src/provider/pi/session.ts";
export type { OperatorPrompt, OperatorOutcome, OperatorChannelFn };

// (c) 规则集实件（**I-1 补丁**，2026-10-12 客户重发授权）：**只读导入**门禁引擎经 Service 公开出口的
// 再导出（`src/service/gate/shell-rules.ts`——**同一函数引用**，绝不复制实现、绝不另立第二份规则集）。
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
// 装配选项形状的**单一来源**在编排（`shell-arming.ts`）：只读导入其类型（运行期擦除），据它取
// 「前端该注入哪几件」——`Omit` 掉 project/operatorChannel/sessionDeps（那三件由编排按本次会话装配）。
import type { AssembleShellGateOptions } from "../../src/pipeline/orchestration/shell-arming.ts";

// argv 规范化原语的**单一来源**（pm，T23，`src/common/shared/argv-primitives.ts`）：**只读导入**——
// 与编排侧（写审计）同源，故「操作者所见」与「审计所记」不可能漂移。此前本模块的**本地副本（逐字镜像）
// 已删除**（T23 收尾）：**不得有第二份实现**。
import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";

/** 默认确认超时（毫秒）。**超时 = 拒绝**（fail-closed，§7.5）。可用环境变量覆盖。 */
export const DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS = 120000;
/** 覆盖确认超时的环境变量名。 */
export const OPERATOR_CONFIRM_TIMEOUT_ENV = "ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS";

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
 *  · **项目角色**注入 (c)+(a) 走三层链；**内置治理角色（su）不接 (b)/(a)**（审读者不给自己开闸：不自审、
 *    不弹框）——su 的 shell 由 session.ts 用**同一份 (c) 实件**经 `shellReadonly` 直连**只读档**
 *    （客户裁定 2026-10-12：「su 也要有 shell，但是只读」；单一来源、两边永不漂移）；缺件时**两边都不 arm**；
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
// **§4 冻结契约家** `src/provider/pi/session.ts`（§6 通路已开）。此处**删去逐字镜像**、改为**只读导入并原样转出**
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
  /** 人类可读的完整提示文本（presenter 可直接展示）。 */
  text: string;
}

/** 人对一次 shell 确认的选择。 */
export interface OperatorDecision {
  /** 是否放行。**只有 true 才算放行**；其余一律拒绝。 */
  allow: boolean;
  /** 可选说明（V1 不收集；留作扩展/将来允许附言，拒绝时如实带出为 `reason`）。 */
  note?: string;
}

/** 操作者确认的**表现层**（主进程用 electron dialog 实现；测试可注入替身）。 */
export interface OperatorPresenter {
  /** 把一次确认请求摆给人看，解析为人的选择；通道不可用/抛错 → 由 channel 归为 fail-closed。 */
  present(prompt: OperatorPrompt, display: ShellCommandDisplay): Promise<OperatorDecision>;
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
  /** 确认超时（毫秒）；缺省读 `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`，再缺省 120000。超时 = 拒绝。 */
  timeoutMs?: number;
  /** 可注入环境（读取超时 env）；缺省 `process.env`。 */
  env?: Record<string, string | undefined>;
}

/**
 * 装配桌面操作者通道。产出的通道**无任何命令判定**，只：呈现原文 → 取人选择 → 归 `OperatorOutcome`。
 * 一切不确定情形（未配置 / 抛错 / 超时）都落到**非放行**结论（fail-closed）——编排据此拒绝。
 * **只有操作者明确放行（恰为 `allow:true`）才返回 `{outcome:"allow"}`。**
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

  return async (prompt: OperatorPrompt): Promise<OperatorOutcome> => {
    // 退路：通道未配置 → 不可用（能力缺席即 fail-closed；绝不当「没人问、那就放行」）。
    if (opts.presenter === undefined) {
      return { outcome: "unavailable", reason: "操作者确认通道未配置（无 presenter），拒绝执行（fail-closed）" };
    }

    const display = describeShellCommand(prompt);
    let decision: OperatorDecision;
    try {
      // 超时包装整个确认；超时 = 拒绝（§7.5 退路 3）。
      decision = await withConfirmTimeout(opts.presenter.present(prompt, display), timeoutMs);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === OPERATOR_CONFIRM_TIMEOUT_NAME;
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

/** 升级原因 → **人话**（(b) 判读的内部用语**不得**原样示人；未识别一律给 fail-closed 通用句——
 *  既不泄行话、也**不替审核编造结论**；原始措辞只进渲染侧折叠详情供核查）。 */
export function plainReasonFor(reason: unknown): string {
  const raw = typeof reason === "string" ? reason : "";
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
  /** 命令**逐字原文**（决不改写/截断——它是人核对的唯一依据）。 */
  command: string;
  /** 白话摘要（`shellIntentSummary`；无从概括为 null——渲染侧隐藏该行）。 */
  summary: string | null;
  /** 「为什么问你」——人话（`plainReasonFor`；内部行话不外露）。 */
  reasonPlain: string;
  /** 升级原因的**原文**（仅供折叠详情里的核查；可为 null）。 */
  reasonRaw: string | null;
  /** 规范化 argv 逐项行（JSON 转义显示；引号仅为界定符——**折叠详情**里才见）。 */
  argvLines: string[];
  /** 执行工作目录（钉在项目根）。 */
  cwd: string;
}

/** 由既有呈现（`describeShellCommand` 的产物）构建确认卡数据面（纯函数；命令原文逐字转抄）。 */
export function buildShellConfirmRequest(id: string, display: ShellCommandDisplay): ShellConfirmRequest {
  const reasonRaw = typeof display.reason === "string" && display.reason !== "" ? display.reason : null;
  return {
    id,
    command: display.command,
    summary: shellIntentSummary(display.command),
    reasonPlain: plainReasonFor(reasonRaw),
    reasonRaw,
    argvLines: display.argvLines,
    cwd: display.cwd,
  };
}

export interface CreateShellConfirmPresenterOptions {
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
  replayPending(): number;
}

export function createShellConfirmPresenter(opts: CreateShellConfirmPresenterOptions): ShellConfirmPresenter {
  const env = opts.env ?? process.env;
  const cleanupAfterMs = opts.cleanupAfterMs ?? readConfirmTimeoutMs(env) + 5000;
  let seq = 0;
  const pending = new Map<string, { resolve: (d: OperatorDecision) => void; timer: ReturnType<typeof setTimeout>; request: ShellConfirmRequest }>();
  const diagnostic = createDiagnosticLogger({ component: "desktop.shell-confirm" });

  const finish = (id: string, decision: OperatorDecision): boolean => {
    const entry = pending.get(id);
    if (entry === undefined) return false;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(decision);
    return true;
  };

  return {
    presenter: {
      async present(_prompt: OperatorPrompt, display: ShellCommandDisplay): Promise<OperatorDecision> {
        const id = `sc-${++seq}`;
        const request = buildShellConfirmRequest(id, display);
        return await new Promise<OperatorDecision>((resolve) => {
          const timer = setTimeout(() => {
            diagnostic.record("shell-confirm.expired", { requestId: id });
            pending.delete(id);
            resolve({ allow: false }); // 兜底：清理 + 不放行（判定语义以通道先到者为准）
          }, cleanupAfterMs);
          pending.set(id, { resolve, timer, request });
          try {
            opts.present(request);
            diagnostic.record("shell-confirm.presented", { requestId: id, pendingCount: pending.size });
          } catch (err) {
            clearTimeout(timer);
            pending.delete(id);
            throw err; // → 通道 unavailable（fail-closed，绝不当「没人问就放行」）
          }
        });
      },
    },
    respond(input) {
      const req = input && typeof input === "object" ? (input as { id?: unknown; allow?: unknown }) : {};
      const id = typeof req.id === "string" ? req.id : "";
      if (id === "" || !pending.has(id)) {
        return { ok: false, expired: true, error: "此确认已失效（超时或应用重启），未获放行——请让角色重新发起。" };
      }
      finish(id, { allow: req.allow === true }); // 恰 allow:true 才放行；其余一律拒绝
      diagnostic.record("shell-confirm.responded", { requestId: id, decision: req.allow === true });
      return { ok: true };
    },
    rejectAllPending(_reason) {
      for (const id of [...pending.keys()]) finish(id, { allow: false });
    },
    pendingCount: () => pending.size,
    replayPending() {
      let count = 0;
      for (const entry of pending.values()) {
        try {
          opts.present(entry.request);
          count += 1;
        } catch (error) {
          diagnostic.error("shell-confirm.replay.failed", error, { requestId: entry.request.id });
        }
      }
      diagnostic.record("shell-confirm.replayed", { count });
      return count;
    },
  };
}

// —————————————————————— 内部辅助 ——————————————————————

const OPERATOR_CONFIRM_TIMEOUT_NAME = "OperatorConfirmTimeoutError";

/** 构造带标记的超时错误（与 pi-adapter/timeout.ts 同风格，但**本角色自持**——不跨角色导入他人私有 common/）。 */
function confirmTimeoutError(timeoutMs: number): Error {
  const err = new Error(`操作者确认超时（${timeoutMs}ms）：未在时限内得到操作者选择。`);
  err.name = OPERATOR_CONFIRM_TIMEOUT_NAME;
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

/** 从环境变量读取确认超时；缺失或非法则回退默认。 */
function readConfirmTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = env[OPERATOR_CONFIRM_TIMEOUT_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS;
  return Math.floor(parsed);
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
