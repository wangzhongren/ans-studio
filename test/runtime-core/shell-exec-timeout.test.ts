// F-1 命令级执行时限：经批准的修复提案 §⑤ 测试计划（全部用毫秒级短时限/桩子进程，不真等分钟级）。
// 契约：到期经共享幂等 terminate() 终止（SIGTERM→250ms→SIGKILL→1000ms 清理上限不变），
// 结果如实返回「超时已终止（N ms）」+ 部分输出 + execution.timedOut/timeoutMs；轮次继续；
// 与「停止本轮」先到先收口、互斥幂等。诊断：shell.exec.start（含生效 timeoutMs）/ shell.exec.timeout。
//
// 计时口径（CI 实证修订，2026-10-16）：v1.2.0 发布 CI（run 38881759770）macos-15-intel 慢 runner 上，
// 250/300ms 级「微小时限」会与进程启动开销赛跑——同 run 观测到裸 node 启动开销可 >250ms，快命令/子进程
// 首写会先被时限收口（runner 速度变异性，非产品缺陷）。故微小时限统一取 microMs=2000（远高于最坏启动
// 开销）：挂起场景仍由 sleep 类长挂起照触发（到期必终止）；「先写盘/写 stdout 再挂起」的场景在预算内
// 稳稳完成首写。断言意图（到期必终止、如实文案、timedOut 事实、轮次继续、短收口）逐条不变。
// 等待/收口上界统一取 boundMs=8000 = 微小时限 2000 + 终止预算上限（SIGTERM→250ms→SIGKILL→1000ms
// 清理）+ 慢 runner 抖动余量；上限到期仍如实红（不 skip、不放松断言语义）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { GovernedToolsOptions, WriteGate } from "../../src/model/runtime.ts";
import { allow, until } from "./fixtures.ts";

const tools = (gate: WriteGate, options?: GovernedToolsOptions) => new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-runtime-core-"));
const allowGate = async () => ({ allow: true as const, by: "fixture" });
const hang = `${process.execPath} -e 'setInterval(()=>{},1000)'`;
const quick = `${process.execPath} -e 'process.stdout.write("quick")'`;
const microMs = 2000; // 命令级微小时限：远高于最坏进程启动开销（CI 慢 runner 实证，见文件头计时口径）
const boundMs = 8000; // 等待/收口上界：microMs + 终止预算上限（250+1000）+ 慢 runner 抖动余量（见文件头）

// F-1 信号断言的**平台分支**（CI Windows 实证，2026-10-16）。Windows 语义：taskkill /T /F 与 child.kill() 均走
// TerminateProcess，进程一旦被终止，Node close 事件的 signal 恒为 null（结果里 execution.signal 缺省），也不存在
// SIGTERM 处理器「免疫」——无 POSIX 信号名可断言。Windows 分支因此只断言「signal 为空」；**进程确已终止**由各用例
// 既有的等价证据承担（F-1-a「超时已终止（N ms）」文案仅 close 事件路径产出 + 短收口耗时；F-1-opt1 late 写入不出现；
// F-1-b 中止文案）。用例不 skip，实质断言全平台照跑，只把「信号名」这一点分支化。
const onWindows = process.platform === "win32";
function assertKillSignal(actual: string | undefined, posixExpected: "SIGTERM" | "SIGKILL", why: string): void {
  if (onWindows) assert.equal(actual, undefined, `${why}（Windows 语义：TerminateProcess 无信号名，signal 应为空）`);
  else assert.equal(actual, posixExpected, why);
}

type DiagnosticLog = NonNullable<GovernedToolsOptions["diagnostics"]>;
/** 捕获 diagnostics 事件与**原始字段**的替换件（生产 logger 另有字段白名单；本替身原样记录，供断言解析值）。 */
function spyDiagnostics(): { log: DiagnosticLog; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log: DiagnosticLog = {
    record(event, fields) { events.push({ event, fields }); },
    error(event, _error, fields) { events.push({ event, fields }); },
  };
  return { log, events };
}

test(`F-1-a：挂起命令在命令级时限内被终止，如实返回「超时已终止（${microMs} ms）」+ timedOut/timeoutMs，耗时短收口`, async () => {
  const root = await temp();
  try {
    const diag = spyDiagnostics();
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: microMs, diagnostics: diag.log }).get("run_shell")!;
    const began = Date.now();
    const result = await shell.handler({ name: "run_shell", args: { command: hang }, toolCallId: "tc-timeout" });
    const elapsed = Date.now() - began;
    assert.equal(result.ok, false);
    assert.match(result.message, new RegExp(`超时已终止（${microMs} ms）`));
    assert.match(result.message, /本轮可继续/);
    assert.equal(result.execution?.timedOut, true);
    assert.equal(result.execution?.timeoutMs, microMs);
    assertKillSignal(result.execution?.signal, "SIGTERM", "signal 如实（SIGTERM 生效）");
    assert.ok(elapsed < boundMs, `应在微小时限与终止预算内收口（实际 ${elapsed}ms，上界 ${boundMs}ms）`);
    assert.ok(diag.events.some((entry) => entry.event === "shell.exec.timeout" && entry.fields?.timeoutMs === microMs), "应有 shell.exec.timeout 且带生效时限");
    assert.ok(diag.events.some((entry) => entry.event === "shell.exec.start" && entry.fields?.timeoutMs === microMs), "应有 shell.exec.start 且带生效时限");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1-a 部分输出保留：先写 stdout 再挂起 → 结果不吞已收集的证据", async () => {
  const root = await temp();
  try {
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: microMs }).get("run_shell")!;
    const result = await shell.handler({ name: "run_shell", args: { command: `${process.execPath} -e 'process.stdout.write("started");setInterval(()=>{},1000)'` } });
    assert.equal(result.ok, false);
    assert.equal(result.execution?.timedOut, true);
    assert.equal(result.execution?.stdout, "started");
    assert.match(result.message, /started/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1-opt1：SIGTERM 免疫子进程被 SIGKILL 升级收口；late 写入不出现，signal 如实", async () => {
  const root = await temp();
  try {
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: microMs }).get("run_shell")!;
    const running = shell.handler({
      name: "run_shell",
      // 免疫子进程「先写 started 再挂起」，并在脚本时刻 3200ms 计划写 late——该时刻晚于时限 + SIGKILL 升级
      // 的收口（microMs + 250ms 预算以内），但（含最坏启动开销后仍）早于下方检查时刻（收口 + 2800ms）。
      args: { command: `${process.execPath} -e 'process.on("SIGTERM",()=>{});require("fs").writeFileSync("started","x");setTimeout(()=>require("fs").writeFileSync("late","x"),3200)'` },
    });
    await until(() => existsSync(path.join(root, "started")), boundMs);
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.execution?.timedOut, true);
    assertKillSignal(result.execution?.signal, "SIGKILL", "SIGTERM 免疫 → 升级 SIGKILL，signal 如实");
    // 等到超过子进程原定写入时刻（脚本时刻 3200ms + 最坏启动开销）再断言 late 未出现（SIGKILL 生效）：
    // 若进程未被收口，late 必在检查时刻前落盘（检查点晚于写入点，断言非空转）；到点仍未收口则如实红。
    await new Promise((resolve) => setTimeout(resolve, 2800));
    assert.ok(!(await readdir(root)).includes("late"), "被终止的进程不得留下迟到写入");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1：快命令 + 大时限不误杀（ok:true、无 timedOut）", async () => {
  const root = await temp();
  try {
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: 600000 }).get("run_shell")!;
    const result = await shell.handler({ name: "run_shell", args: { command: quick } });
    assert.equal(result.ok, true);
    assert.equal(result.execution?.timedOut, undefined);
    assert.equal(result.execution?.exitCode, 0);
    assert.match(result.message, /quick/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1-c 解析链：env 生效且按该值收口；env 非法/0/负回退默认 600000（不可禁用）；显式选项优先于 env", async () => {
  const root = await temp();
  const key = "ANS_PI_SHELL_EXEC_TIMEOUT_MS";
  const previous = process.env[key];
  try {
    // (a) env=microMs：解析值进 shell.exec.start，且超时按该值收口
    process.env[key] = String(microMs);
    const diagA = spyDiagnostics();
    const shellA = tools(allow, { shellGate: allowGate, shellCwd: root, diagnostics: diagA.log }).get("run_shell")!;
    const resultA = await shellA.handler({ name: "run_shell", args: { command: hang } });
    assert.equal(diagA.events.find((entry) => entry.event === "shell.exec.start")?.fields?.timeoutMs, microMs);
    assert.match(resultA.message, new RegExp(`超时已终止（${microMs} ms）`));
    assert.equal(resultA.execution?.timeoutMs, microMs);

    // (b) env 非法与 0/负 → 回退默认 600000（只断言解析值，不等待分钟级）
    for (const invalid of ["not-a-number", "0", "-10", ""]) {
      process.env[key] = invalid;
      const diagB = spyDiagnostics();
      const shellB = tools(allow, { shellGate: allowGate, shellCwd: root, diagnostics: diagB.log }).get("run_shell")!;
      const resultB = await shellB.handler({ name: "run_shell", args: { command: quick } });
      assert.equal(diagB.events.find((entry) => entry.event === "shell.exec.start")?.fields?.timeoutMs, 600000, `env="${invalid}" 应回退默认`);
      assert.equal(resultB.ok, true);
    }

    // (c) 显式选项优先于 env
    process.env[key] = String(microMs);
    const diagC = spyDiagnostics();
    const shellC = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: 5000, diagnostics: diagC.log }).get("run_shell")!;
    const resultC = await shellC.handler({ name: "run_shell", args: { command: quick } });
    assert.equal(diagC.events.find((entry) => entry.event === "shell.exec.start")?.fields?.timeoutMs, 5000);
    assert.equal(resultC.ok, true);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("F-1-b 竞争收口：中止优先（无 timedOut、中止文案）；超时先收口后再中止 → 幂等无二次结果", async () => {
  const root = await temp();
  try {
    // (a) 大时限 + 100ms 后 abort → 中止语义，不得出现 timedOut
    const controller = new AbortController();
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: 600000 }).get("run_shell")!;
    const running = shell.handler({ name: "run_shell", args: { command: hang }, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    const aborted = await running;
    assert.equal(aborted.ok, false);
    assert.match(aborted.message, /会话已中止，命令已请求终止/);
    assert.equal(aborted.execution?.timedOut, undefined);

    // (b) 超时先收口 → 结果恰一条；随后 abort() 不产生二次结果/异常（terminate 幂等，settled 后直接返回）
    const controller2 = new AbortController();
    const shell2 = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: microMs }).get("run_shell")!;
    const timed = await shell2.handler({ name: "run_shell", args: { command: hang }, signal: controller2.signal });
    assert.equal(timed.execution?.timedOut, true);
    assert.match(timed.message, new RegExp(`超时已终止（${microMs} ms）`));
    controller2.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(timed.execution?.timedOut, true, "结果对象不因迟到中止而改变");
    assert.match(timed.message, new RegExp(`超时已终止（${microMs} ms）`));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-1-b 与「停止本轮」既有语义回归：中止文案与清理预算不变（对照 tools.test.ts 的 abort 用例）", async () => {
  const root = await temp();
  try {
    const controller = new AbortController();
    const shell = tools(allow, { shellGate: allowGate, shellCwd: root, shellExecTimeoutMs: 600000 }).get("run_shell")!;
    const running = shell.handler({ name: "run_shell", args: { command: `${process.execPath} -e 'require("fs").writeFileSync("started","x");setInterval(()=>{},1000)'` }, signal: controller.signal });
    await until(() => existsSync(path.join(root, "started")), boundMs);
    controller.abort();
    const result = await running;
    assert.equal(result.ok, false);
    assert.match(result.message, /会话已中止，命令已请求终止/);
    assertKillSignal(result.execution?.signal, "SIGTERM", "signal 如实（SIGTERM 生效）");
    assert.equal(result.execution?.timedOut, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
