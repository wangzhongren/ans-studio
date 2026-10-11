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

// argv 规范化原语的**单一来源**（pm，T23，`src/common/shared/argv-primitives.ts`）：**只读导入**——
// 与编排侧（写审计）同源，故「操作者所见」与「审计所记」不可能漂移。此前本模块的**本地副本（逐字镜像）
// 已删除**（T23 收尾）：**不得有第二份实现**。
import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";

/** 默认确认超时（毫秒）。**超时 = 拒绝**（fail-closed，§7.5）。可用环境变量覆盖。 */
export const DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS = 120000;
/** 覆盖确认超时的环境变量名。 */
export const OPERATOR_CONFIRM_TIMEOUT_ENV = "ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS";

/**
 * V1 桌面**是否 arm** shell 闸（即：会话构造路径是否注入 `ShellGate`，从而 `run_shell` 被注册）。
 *
 * **客户已确认（2026-10-11）：`false` —— V1 桌面不 arm。** 这是**客户确认的 V1 范围**、不是欠账；
 * 桌面本份实现**本即按「不 arm」落**，故**无需实现改动**（详见 changelog 与回报）：
 *  · 操作者通道 (a) 只是三层链的**一层**；arm 与否的开关在**谁装配 `ShellGate`**（编排）——桌面**单方无法 arm**
 *    （它没有 (c) 规则集/分类函数、(b) pm 会话、pm 边界与审计门）。
 *  · 桌面当前最强 fail-closed 是「**能力缺席**」——不注入 `ShellGate` ⇒ `run_shell` 根本不注册（§7.5.1）。
 *  · V1 含义：桌面**不提供 shell 能力**（角色在被导入的项目里不能跑命令）；本通道代码**保留但未被消费**
 *    （如实标注，别让它看起来像在用）。
 * 若将来要 arm：由**编排**用本通道 + (c)/(b) 装配 `ShellGate`，经桌面会话构造路径注入
 * （`app/desktop/session.ts` 的 `shellGate` 接缝），再把此常量改 `true`。
 */
export const DESKTOP_SHELL_GATE_ARMED = false;

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
