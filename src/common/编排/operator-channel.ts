// src/common/编排/operator-channel.ts
// 操作者确认通道 (a) —— **CLI 端参考实现**（设计 §7.3 第 3 条、§7.4「操作者通道」）。
//
// 归属：编排（本角色私有辅助目录 `src/common/编排/`）。
//
// 用途：产出 `OperatorChannelFn`（形状的单一来源在契约 §4 冻结契约家 `src/provider/pi/session.ts`，T21 起），
// 经 `deps` **注入** `createShellGate`。
// CLI 端（装配入口）用它把「命令原文 + 为何升级」打印到终端并读一行 y/n；**桌面端（`app/`）由桌面应用角色
// 提供自己的对话框通道**——两方只**共用这个注入点的形状**（`OperatorChannelFn`），实现各自独立。
//
// 边界（§7.4）：本文件只是**通道实现**，不含任何审核策略；「何时叫人」的判定在 shell-gate.ts（仅当 (b) 升级时）。
//
// fail-closed（§7.5）：通道**不可用 / EOF / 空输入 / 认不出的输入**都不是放行——除明确的「放行」输入外一律拒绝。
// 超时由 `createShellGate` 的 `operatorTimeoutMs` 包装（超时 = 拒绝），本文件不自持计时器。
//
// 无人值守：stdin 为 EOF（piped、无 TTY）→ 返回 `unavailable` → shell-gate 判「拒绝」。

import readline from "node:readline";
import type { OperatorOutcome, OperatorPrompt } from "../../provider/pi/session.ts";

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

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
