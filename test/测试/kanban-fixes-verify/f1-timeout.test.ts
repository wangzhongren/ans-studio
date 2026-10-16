// 独立复验（测试角色，2026-10-16）：F-1 命令级执行时限的对抗性行为核对。
// 独立构造（不复用实施方 test/runtime-core/shell-exec-timeout.test.ts 的断言）：
//  - env 短时限（microMs=2000）到期终止：结果「超时已终止（2000 ms）」+ execution.timedOut；
//  - **轮次语义**：超时不触发轮次信号（共享 AbortSignal 保持未中止）、后续命令照常执行；
//  - **孙进程（进程树）终止**：父脚本派生孙进程并挂起，超时后孙进程 pid 必须消失；
//  - SIGTERM 免疫子进程被 SIGKILL 升级收口（late 文件不出现）；
//  - 快命令不受显式大时限（600000ms）影响（不误杀）；显式选项优先于 env（诊断解析值）。
//
// 慢 runner 时序健壮化（2026-10-16，CI v1.2.0 run 38881759770 macos-15-intel 实证）：
// 微小时限 250/350/400ms → microMs=2000（快命令与脚本「启动＋派生＋写盘」远在其内，挂起场景仍触发）；
// 等待/收口上界 boundMs=8000（= 2000 + SIGTERM→250→SIGKILL→1000 清理预算 + 慢 runner 抖动余量）；
// 孙进程 pid 消失改为有界轮询 ≤10s。**断言意图逐条不变，仅时限数值同步**（清单见 fix 记录）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import type { GovernedToolsOptions, WriteGate } from "../../../src/model/runtime.ts";

const allowWrites: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "verify" } });

function shellTool(options: GovernedToolsOptions) {
  const tool = buildGovernedTools(allowWrites, options).find((t) => t.name === "run_shell");
  if (tool === undefined) throw new Error("run_shell 未注册");
  return tool;
}

function spyDiag() {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log: NonNullable<GovernedToolsOptions["diagnostics"]> = {
    record(event, fields) { events.push({ event, fields }); },
    error(event, _err, fields) { events.push({ event, fields }); },
  };
  return { log, events };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 慢 runner 口径常量（见文件头注释；仅时序数值，语义判据不变）
const microMs = 2000; // 命令级微小时限
const boundMs = 8000; // 等待/收口上界
const pidPollStepMs = 100; // 孙进程 pid 消失轮询步长
const pidPollBoundMs = 10_000; // 孙进程 pid 消失有界轮询上界

async function pidAlive(pid: number): Promise<boolean> {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("F-1 env 2000ms：到期终止、如实文案、execution.timedOut；轮次信号不受影响、后续命令照常", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f1-"));
  const prev = process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS;
  process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS = String(microMs);
  try {
    const diag = spyDiag();
    const controller = new AbortController();
    const shell = shellTool({ shellGate: async () => ({ allow: true, by: "verify" }), shellCwd: root, diagnostics: diag.log });
    const began = Date.now();
    const result = await shell.handler({
      name: "run_shell",
      args: { command: `${process.execPath} -e "setInterval(()=>{},1000)"` },
      signal: controller.signal,
    });
    const wall = Date.now() - began;
    assert.equal(result.ok, false);
    assert.ok(wall < boundMs, `应快速收口（实际 ${wall}ms）`);
    assert.match(result.message, new RegExp(`超时已终止（${microMs} ms）`), `文案须含「超时已终止（${microMs} ms）」：${result.message.slice(0, 200)}`);
    assert.equal(result.execution?.timedOut, true);
    assert.equal(result.execution?.timeoutMs, microMs);
    // 轮次语义：命令级超时**不是**「停止本轮」——共享信号保持未中止。
    assert.equal(controller.signal.aborted, false, "命令超时不得中止轮次信号");
    // 后续命令照常（同一 tools 实例、同一信号）。
    const after = await shell.handler({ name: "run_shell", args: { command: `${process.execPath} -e "process.stdout.write('still-alive')"`, }, signal: controller.signal });
    assert.equal(after.ok, true, `超时后后续命令须可继续：${after.message}`);
    assert.match(after.message, /still-alive/);
    // 诊断两记：start（生效 2000）与 timeout。
    const start = diag.events.find((e) => e.event === "shell.exec.start");
    assert.equal(start?.fields?.timeoutMs, microMs, `shell.exec.start 应携带生效 ${microMs}ms`);
    assert.ok(diag.events.some((e) => e.event === "shell.exec.timeout" && e.fields?.timeoutMs === microMs));
  } finally {
    if (prev === undefined) delete process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS; else process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS = prev;
    await rm(root, { recursive: true, force: true });
  }
});

test("F-1 孙进程终止：超时后进程组一并收口（孙进程 pid 消失）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f1-"));
  try {
    const script = path.join(root, "spawn-grandchild.mjs");
    const pidFile = path.join(root, "grandchild.pid");
    await writeFile(script, [
      `import { spawn } from "node:child_process";`,
      `import { writeFileSync } from "node:fs";`,
      `const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });`,
      `writeFileSync(process.argv[2], String(c.pid));`,
      `setInterval(()=>{},1000);`,
    ].join("\n"));
    const shell = shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
      shellCwd: root,
      shellExecTimeoutMs: microMs,
    });
    const result = await shell.handler({ name: "run_shell", args: { command: `${process.execPath} spawn-grandchild.mjs grandchild.pid` } });
    assert.equal(result.ok, false);
    assert.equal(result.execution?.timedOut, true);
    const { readFile } = await import("node:fs/promises");
    const pid = Number((await readFile(pidFile, "utf8")).trim());
    assert.ok(Number.isInteger(pid) && pid > 0, "孙进程 pid 应已写盘");
    // 终止已触发且经 SIGTERM→250ms→SIGKILL 升级：有界轮询等待孙进程消失（上界 10s，含余留清理）。
    let gone = false;
    for (let i = 0; i < pidPollBoundMs / pidPollStepMs; i += 1) {
      if (!(await pidAlive(pid))) { gone = true; break; }
      await sleep(pidPollStepMs);
    }
    assert.equal(gone, true, `孙进程（pid ${pid}）应随进程组一同终止，不得成为孤儿`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1 SIGKILL 升级：SIGTERM 免疫子进程不再有机会写入 late 文件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f1-"));
  try {
    const late = path.join(root, "late.txt");
    const script = path.join(root, "immune.mjs");
    await writeFile(script, [
      `process.on("SIGTERM", () => {});`, // 免疫 SIGTERM：只有 SIGKILL 能收口
      `setTimeout(() => { try { process.stdout.write("never"); } catch {} }, 50);`,
      // 写入点 3200ms：晚于时限 2000ms + SIGTERM→250ms→SIGKILL 的收口时刻，早于检查点（检查非空转）。
      `setTimeout(() => { import("node:fs").then(fs => fs.writeFileSync(process.argv[2], "late")); }, 3200);`,
      `setInterval(()=>{},1000);`,
    ].join("\n"));
    const shell = shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
      shellCwd: root,
      shellExecTimeoutMs: microMs,
    });
    const result = await shell.handler({ name: "run_shell", args: { command: `${process.execPath} immune.mjs ${late}` } });
    assert.equal(result.ok, false);
    assert.equal(result.execution?.timedOut, true);
    // 检查前等待 2800ms 使检查点（≈收口 2250ms + 2800ms ≈ 5050ms）晚于写入点 3200ms：
    // 若进程未被 SIGKILL 收口，late 必已在检查时刻前落盘。
    await sleep(2800);
    assert.equal(existsSync(late), false, "SIGTERM 免疫子进程须被 SIGKILL 升级收口，late 不得出现");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1 解析链与不误杀：显式选项优先于 env；快命令在大时限下照常完成", async () => {
  const prev = process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS;
  process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS = String(microMs);
  try {
    const diag = spyDiag();
    const shell = shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
      shellCwd: os.tmpdir(),
      shellExecTimeoutMs: 600000,
      diagnostics: diag.log,
    });
    const fast = await shell.handler({ name: "run_shell", args: { command: `${process.execPath} -e "process.stdout.write('quick')"` } });
    assert.equal(fast.ok, true, `快命令不得被误杀：${fast.message}`);
    assert.equal(fast.execution?.timedOut, undefined);
    const start = diag.events.find((e) => e.event === "shell.exec.start");
    assert.equal(start?.fields?.timeoutMs, 600000, "显式选项必须优先于 env（解析值断言，不等待）");
  } finally {
    if (prev === undefined) delete process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS; else process.env.ANS_PI_SHELL_EXEC_TIMEOUT_MS = prev;
  }
});
