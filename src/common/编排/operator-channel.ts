// src/common/编排/operator-channel.ts
// 操作者/客户确认通道 —— **CLI 端参考实现**（设计 §7.3 第 3 条、§7.4「操作者通道」；A-5「CLI 映射」）。
//
// 归属：编排（本角色私有辅助目录 `src/common/编排/`）。
//
// 本文件承载**两个**同族通道的 CLI 实现（只共用注入点形状与终端读写辅助，不互相代理）：
//   ① `createCliOperatorChannel`——**shell 闸 (a) 操作者确认**（`OperatorChannelFn`）。经 `deps` 注入
//      `createShellGate`；CLI 把「命令原文 + 为何升级」打印到终端并读一行 y/n；**桌面端由桌面应用角色
//      提供自己的对话框通道**——两方只共用注入点形状。
//   ② `createCliCustomerInput`——**客户确认制交互**（`CustomerInputFn`，设计 A-1/A-5）：`request_confirmation`
//      / `request_choice` 两工具的终端面。确认 = y/n；选择 = 数字序号（单选 `1`；多选 `1,3`）。
//      **桌面端渲染成交互卡**（桌面应用角色的实现）。两方只共用 §4 冻结契约家的形状。
//
// 边界（§7.4）：本文件只是**通道实现**，不含任何审核/治理策略；「何时叫人」在 shell-gate.ts（仅当 (b)
// 升级时）与工具层（A-1 工具族）。
//
// fail-closed（§7.5 / A-1）：通道**不可用 / EOF / 空输入 / 认不出的输入**都不是放行——除明确的
// 「放行/确认/合法选择」外一律拒绝；EOF → `unavailable`（未获同意）。
// **超时（G-1，2026-10-12）**：**客户确认制的终端问答不设超时**——`createCliCustomerInput` 一直等客户
// 作答（客户裁定「交互工具的等待不超时」；**EOF/无人值守仍按 fail-closed 处理**，绝不改成「等待」）。
// shell 闸 (a) 的 `createCliOperatorChannel` 不同：其超时由 `createShellGate` 的 `operatorTimeoutMs`
// 包装（超时 = 拒绝）——两通道各自语义，本文件均不自持计时器。
//
// 无人值守：stdin 为 EOF（piped、无 TTY）→ `unavailable` → 判「未获同意」。
// **进程挂起教训（实测）**：默认 stdin 读取器挂着 readline 不关，会让进程不退出——见
// `makeStdinLineReader` 注释；调用方（编排前端/测试）应在不需要时避免 attach，或给读器注入桩。

import readline from "node:readline";
import type {
  CustomerInputOption,
  CustomerInputOutcome,
  CustomerInputRequest,
  OperatorOutcome,
  OperatorPrompt,
} from "../../model/runtime.ts";

/** 认作「放行」的输入（小写比较）。 */
const DEFAULT_ALLOW_INPUTS = ["y", "yes", "是", "放行", "allow"];
/** 认作「拒绝」的输入（小写比较）。其余一切（含空）→ 拒绝。 */
const DEFAULT_DENY_INPUTS = ["n", "no", "否", "拒绝", "deny"];

export interface CliOperatorChannelOptions {
  /** 写提示（缺省 `process.stdout.write`）。 */
  write?: (text: string) => void;
  /**
   * 读一行输入（缺省：从 `process.stdin` 读一行；EOF → 返回 `null`）。
   * **注入以便无 TTY/单测**：桩可返回固定行或 `null`（模拟无人值守）。
   */
  readLine?: () => Promise<string | null>;
  /** 操作者标识（审计 `by` 用）；缺省 `"cli"`。 */
  operatorId?: string;
  /** 认作放行的输入（小写比较）；缺省 y/yes/是/放行/allow。 */
  allowInputs?: string[];
  /** 认作拒绝的输入（小写比较）；缺省 n/no/否/拒绝/deny。其余（含空）亦拒绝。 */
  denyInputs?: string[];
}

/**
 * 构造 CLI 端操作者通道。产出的函数每次调用**读一行**并据输入判定。
 * 只有**明确的放行输入**才返回 `{outcome:"allow"}`；其余一律 `deny`（空/未识别）或 `unavailable`（EOF）。
 *
 * 返回类型取**具体形状** `(prompt) => Promise<OperatorOutcome>`（本实现是 async，恒回 `OperatorOutcome`，绝不回
 * `null`/`undefined`——EOF/失败归 `unavailable`）。它仍是注入点 `OperatorChannelFn` 的**子类型**（可赋值给
 * `CreateShellGateOptions.operatorChannel`），只是比那个「允许同步返回 + 允许 null/undefined」的宽形状更精确。
 */
export function createCliOperatorChannel(
  opts: CliOperatorChannelOptions = {},
): (prompt: OperatorPrompt) => Promise<OperatorOutcome> {
  const write = opts.write ?? ((text: string) => void process.stdout.write(text));
  const operatorId = opts.operatorId ?? "cli";
  const allow = new Set((opts.allowInputs ?? DEFAULT_ALLOW_INPUTS).map((s) => s.toLowerCase()));
  const deny = new Set((opts.denyInputs ?? DEFAULT_DENY_INPUTS).map((s) => s.toLowerCase()));

  // 惰性创建 stdin 读取器：仅在未注入 readLine 且**确实要读**时才 attach stdin（测试注桩时永不 attach）。
  let reader: (() => Promise<string | null>) | undefined;
  const nextLine = async (): Promise<string | null> => {
    if (opts.readLine !== undefined) return await opts.readLine();
    reader ??= makeStdinLineReader();
    return await reader();
  };

  return async (prompt: OperatorPrompt): Promise<OperatorOutcome> => {
    write(formatOperatorPrompt(prompt));
    let line: string | null;
    try {
      line = await nextLine();
    } catch (err) {
      return { outcome: "unavailable", reason: `读取操作者输入失败：${errText(err)}` };
    }
    if (line === null) {
      // EOF / 通道关闭 → 无人值守 → 不可用（shell-gate 据此拒绝）。
      return { outcome: "unavailable", reason: "输入通道已关闭（无人值守？）" };
    }
    const ans = line.trim().toLowerCase();
    if (allow.has(ans)) return { outcome: "allow", operatorId };
    if (deny.has(ans)) return { outcome: "deny", operatorId, reason: `操作者选择拒绝（输入：${line.trim()}）` };
    // 空 / 未识别 → 拒绝（fail-closed：不把「看不懂」当放行）。
    return { outcome: "deny", operatorId, reason: ans === "" ? "空输入视为拒绝" : `未识别的输入视为拒绝：${line.trim()}` };
  };
}

/** 操作者提示文案（命令**逐字原文**——§7.3 要求人看到原文）。 */
export function formatOperatorPrompt(prompt: OperatorPrompt): string {
  const reason = prompt.reason !== undefined && prompt.reason !== "" ? `\n升级原因：${prompt.reason}` : "";
  return (
    `\n—— shell 命令审核（(b) 未定，(a) 请操作者确认）——\n` +
    `命令原文：\n${prompt.command}\n` +
    `（argv：${JSON.stringify(prompt.argv)}；cwd：${prompt.cwd}）${reason}\n` +
    `放行该命令？[y/放行 = 放行；其它 = 拒绝]\n`
  );
}

/** 从 `process.stdin` 逐行读取（只读一行即返回；EOF → null）。惰性、单例，跨调用复用同一接口。 */
function makeStdinLineReader(): () => Promise<string | null> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const it = rl[Symbol.asyncIterator]();
  return async () => {
    const { value, done } = await it.next();
    if (done === true) {
      rl.close();
      return null;
    }
    return String(value);
  };
}

// —————————————— 客户确认制交互（CustomerInputFn）——CLI 终端面（A-1/A-5） ——————————————

export interface CliCustomerInputOptions {
  /** 写提示（缺省 `process.stdout.write`）。 */
  write?: (text: string) => void;
  /** 读一行输入（缺省：从 `process.stdin` 读一行；EOF → 返回 `null`）。**注入以便无 TTY/单测**。 */
  readLine?: () => Promise<string | null>;
  /** 操作者（客户）标识（审计 `operatorId` 用）；缺省 `"cli"`。 */
  operatorId?: string;
  /** 认作「同意」的输入（小写比较）；缺省 y/yes/是/确认/放行/allow。 */
  allowInputs?: string[];
}

/** 认作「否认」的输入（小写比较）；其余（含空/未识别）→ `declined`（未获同意，fail-closed）。 */
const DEFAULT_CONFIRM_DENY_INPUTS = ["n", "no", "否", "不", "拒绝", "deny"];

/**
 * 构造 CLI 端**客户确认制交互通道**（设计 A-5「CLI 映射」）：
 *   · `confirm` —— 打印 title/preview/detail，读一行：明确同意输入 → `answered{confirmed:true}`；
 *     明确否认输入 → `answered{confirmed:false}`；空/未识别 → `declined`（不把「看不懂」当同意）；
 *     EOF → `unavailable`（无人值守 / 未获同意）。
 *   · `choice` —— 选项编号列出（1..n）：单选读一个序号（`1`）；多选读逗号分隔序号（`1,3`）。
 *     序号非法/越界/重复用途不符 → `declined`；EOF → `unavailable`。
 * 与 `createCliOperatorChannel` 同纪律：**只有明确输入才放行**，其余一律拒绝；本函数不写盘、不做判定。
 * **不设超时（G-1）**：终端问答**一直等**客户作答（客户裁定「交互工具的等待不超时」）；`EOF`（无人值守）
 * → `unavailable` → 未获同意（fail-closed **不变**——绝不把 EOF 改成「无限等待」）。
 * 返回类型取**具体形状** `(req) => Promise<CustomerInputOutcome>`（本实现恒回 `CustomerInputOutcome`，
 * 绝不回 `null`/`undefined`——EOF/失败归 `unavailable`）；它仍是注入点 `CustomerInputFn` 的子类型。
 */
export function createCliCustomerInput(
  opts: CliCustomerInputOptions = {},
): (req: CustomerInputRequest) => Promise<CustomerInputOutcome> {
  const write = opts.write ?? ((text: string) => void process.stdout.write(text));
  const operatorId = opts.operatorId ?? "cli";
  const allow = new Set((opts.allowInputs ?? DEFAULT_ALLOW_INPUTS).map((s) => s.toLowerCase()));
  const deny = new Set(DEFAULT_CONFIRM_DENY_INPUTS.map((s) => s.toLowerCase()));

  // 惰性创建 stdin 读取器（同 operator 通道：仅在未注入 readLine 且确实要读时才 attach；测试注桩永不 attach）。
  let reader: (() => Promise<string | null>) | undefined;
  const nextLine = async (): Promise<string | null> => {
    if (opts.readLine !== undefined) return await opts.readLine();
    reader ??= makeStdinLineReader();
    return await reader();
  };

  return async (req: CustomerInputRequest): Promise<CustomerInputOutcome> => {
    write(formatCustomerInputPrompt(req));
    let line: string | null;
    try {
      line = await nextLine();
    } catch (err) {
      return { outcome: "unavailable", reason: `读取客户输入失败：${errText(err)}` };
    }
    if (line === null) {
      return { outcome: "unavailable", reason: "输入通道已关闭（无人值守？）" };
    }
    const ans = line.trim().toLowerCase();
    if (req.kind === "confirm") {
      if (allow.has(ans)) return { outcome: "answered", value: { confirmed: true }, operatorId };
      if (deny.has(ans)) return { outcome: "answered", value: { confirmed: false }, operatorId };
      return {
        outcome: "declined",
        operatorId,
        reason: ans === "" ? "空输入视为拒绝" : `未识别的输入视为拒绝：${line.trim()}`,
      };
    }
    // choice：数字序号 → 选项 id（子集校验的第二道在工具层/桌面侧；此处只做序号解析，非法即拒）。
    const selected = parseChoiceInput(line, req.options, req.multiple === true);
    if (selected === undefined) {
      return {
        outcome: "declined",
        operatorId,
        reason: ans === "" ? "空输入视为拒绝" : `未识别的选择输入视为拒绝：${line.trim()}`,
      };
    }
    return { outcome: "answered", value: { selected }, operatorId };
  };
}

/**
 * 解析选择输入：逗号（半角/全角）、顿号、空白分隔的**序号**（1 起）→ 选项 id 数组。
 * 单选须恰好一个；多选须 ≥1 且去重后合法；任何非法/越界 → `undefined`（= 拒绝，fail-closed）。
 */
export function parseChoiceInput(
  line: string,
  options: CustomerInputOption[],
  multiple: boolean,
): string[] | undefined {
  const parts = line
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (parts.length === 0) return undefined;
  if (!multiple && parts.length !== 1) return undefined;
  const chosen: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return undefined;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > options.length) return undefined;
    if (chosen.includes(n)) return undefined; // 重复序号 → 拒绝（不猜意图）
    chosen.push(n);
  }
  return chosen.map((n) => options[n - 1].id);
}

/** 客户交互请求的终端文案（title/preview/detail 原文呈现；选择列编号）。 */
export function formatCustomerInputPrompt(req: CustomerInputRequest): string {
  const lines: string[] = [];
  lines.push(req.kind === "confirm" ? "\n—— 客户确认请求 ——" : "\n—— 客户选择请求 ——");
  lines.push(req.title);
  if (req.kind === "choice" && req.question !== undefined && req.question !== "") {
    lines.push(req.question);
  }
  const preview = req.kind === "confirm"
    ? [req.preview, req.detail].filter((s): s is string => s !== undefined && s !== "").join("\n")
    : (req.preview ?? "");
  if (preview !== "") {
    lines.push("");
    lines.push(preview);
  }
  if (req.kind === "choice") {
    lines.push("");
    req.options.forEach((o, i) => {
      lines.push(`${i + 1}) ${o.label}${o.description !== undefined && o.description !== "" ? `——${o.description}` : ""}`);
    });
    lines.push(
      req.multiple === true
        ? "请选择（可多选，逗号分隔序号，如 1,3；其它输入 = 拒绝）："
        : "请选择（单选，输入序号；其它输入 = 拒绝）：",
    );
  } else {
    lines.push("");
    lines.push("同意？[y/确认/是 = 同意；n/否 = 不同意；其它 = 拒绝]");
  }
  return lines.join("\n") + "\n";
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
