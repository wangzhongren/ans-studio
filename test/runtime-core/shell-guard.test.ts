// F-7 执行层 shell 语法 UX 守卫：经批准的修复提案 §⑤ 测试计划。
// 口径与 splitCommand 同源：只判「未加引号片段」的独立操作符 token（含 opt1 内嵌/结尾 &、opt2 变量展开）；
// 引号内内容永不明中；反斜杠前导的操作符按字面量放行（保 `grep a\|b`）。命中 → 不调 gate、不 spawn。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools, type ToolResult } from "../../src/provider/runtime/tools.ts";
import type { GovernedToolsOptions, ShellGate, WriteGate } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const tools = (gate: WriteGate, options?: GovernedToolsOptions) => new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-runtime-core-"));

type DiagnosticLog = NonNullable<GovernedToolsOptions["diagnostics"]>;
function spyDiagnostics(): { log: DiagnosticLog; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log: DiagnosticLog = {
    record(event, fields) { events.push({ event, fields }); },
    error(event, _error, fields) { events.push({ event, fields }); },
  };
  return { log, events };
}

/** 运行一次 run_shell，返回结果 + gate 是否被调用（在任意 gate 之上包一层记录）+ diagnostics 事件名。 */
async function runShell(command: string, options?: { gate?: ShellGate }): Promise<{ result: ToolResult; reviewed: boolean; events: string[] }> {
  let reviewed = false;
  const innerGate = options?.gate ?? (async () => ({ allow: true as const, by: "fixture" }));
  const diag = spyDiagnostics();
  const shell = tools(allow, {
    shellGate: async (req) => { reviewed = true; return innerGate(req); },
    shellCwd: process.cwd(),
    diagnostics: diag.log,
  }).get("run_shell")!;
  const result = await shell.handler({ name: "run_shell", args: { command } });
  return { result, reviewed, events: diag.events.map((entry) => entry.event) };
}

test("F-7 阻断集：未加引号的独立操作符/紧贴重定向在审核之前被拒，正文含命中 token，零副作用", async () => {
  const root = await temp();
  try {
    const blocked: Array<[string, string]> = [
      [`find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | head -50`, "|"],
      ["find . -type f | sort", "|"],
      ["echo hi > out.txt", ">"],
      ["echo hi >out.txt", ">out.txt"],
      ["echo hi 2>err.log", "2>err.log"],
      ["echo hi &>out.txt", "&>out.txt"],
      ["cat <in.txt", "<in.txt"],
      ["a && b", "&&"],
      ["a; b", "a;"],
      ["a || b", "||"],
      ["cmd 2>&1", "2>&1"],
      ["cmd &", "&"],
    ];
    for (const [command, token] of blocked) {
      let gateCalls = 0;
      const diag = spyDiagnostics();
      const shell = tools(allow, { shellGate: async () => { gateCalls++; return { allow: true, by: "fixture" }; }, shellCwd: root, diagnostics: diag.log }).get("run_shell")!;
      const result = await shell.handler({ name: "run_shell", args: { command } });
      assert.equal(result.ok, false, command);
      assert.match(result.message, /未经 shell 解释/, command);
      assert.match(result.message, /不支持管道\/重定向\/变量展开/, command);
      assert.ok(result.message.includes(`"${token}"`), `文案应含命中 token：${command}`);
      assert.match(result.message, /请拆分为多条命令，或把逻辑写成脚本文件后执行/, command);
      assert.equal(gateCalls, 0, `守卫应在审核之前：${command}`);
      assert.ok(diag.events.some((entry) => entry.event === "shell.guard.blocked"), command);
      assert.ok(!diag.events.some((entry) => entry.event === "shell.review.start"), `不得进入审核：${command}`);
    }
    // 零副作用：被守卫拒绝的管道命令不得产生任何文件/进程痕迹。
    const diag = spyDiagnostics();
    const probe = tools(allow, { shellGate: async () => ({ allow: true, by: "fixture" }), shellCwd: root, diagnostics: diag.log }).get("run_shell")!;
    const pwn = await probe.handler({ name: "run_shell", args: { command: "touch pwned | sort" } });
    assert.equal(pwn.ok, false);
    assert.ok(diag.events.some((entry) => entry.event === "shell.guard.blocked" && entry.fields?.reasonCode === "|"));
    assert.equal(existsSync(path.join(root, "pwned")), false, "被拒命令不得创建文件");
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-7 放行集：引号内与反斜杠前导的操作符照旧可用（含证据命令），普通 argv 不受影响", async () => {
  const root = await temp();
  try {
    const allowed: string[] = [
      `grep -n "sort=createdAt\\|sort=priority\\|listTasks(ctx.url))" test.json`, // 引号内 `\|`（真机证据命令）
      "grep -F '|' test.json", // 完全引号包裹的 `|`
      "grep a\\|b test.json", // 未加引号、反斜杠前导 → 字面量放行
      `${process.execPath} -e 'process.stdout.write("a|b")'`, // 引号内 `|`
      "find . -type f", // 普通 argv
    ];
    for (const command of allowed) {
      let gateCalls = 0;
      const shell = tools(allow, { shellGate: async () => { gateCalls++; return { allow: false as const, reason: "fixture stops after review", by: "fixture" }; }, shellCwd: root }).get("run_shell")!;
      const result = await shell.handler({ name: "run_shell", args: { command } });
      assert.equal(gateCalls, 1, `守卫不得拦截，应到达审核：${command}`);
      assert.ok(!/未经 shell 解释/.test(result.message), command);
    }
    // 引号内 `|` 的命令必须照旧**真正执行**（对照阻断集：符号在引号内属字面量）。
    const ran = await tools(allow, { shellGate: async () => ({ allow: true, by: "fixture" }), shellCwd: root }).get("run_shell")!.handler({
      name: "run_shell",
      args: { command: `${process.execPath} -e 'process.stdout.write("a|b")'` },
    });
    assert.equal(ran.ok, true, ran.message);
    assert.match(ran.message, /a\|b/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-7-opt1：内嵌未加引号操作符与结尾 & 阻断；词中 &（URL 查询串）不判", async () => {
  for (const command of ["find . -name x|sort", "a;b", "cmd&", "find . -name x|sort | head -1"]) {
    let gateCalls = 0;
    const shell = tools(allow, { shellGate: async () => { gateCalls++; return { allow: true, by: "fixture" }; } }).get("run_shell")!;
    const result = await shell.handler({ name: "run_shell", args: { command } });
    assert.equal(result.ok, false, command);
    assert.match(result.message, /未经 shell 解释/, command);
    assert.equal(gateCalls, 0, command);
  }
  // 词中 `&`（URL 查询串）是模型意图的常见形态 → 不判；审核后续照常（用 deny 收口，不真发网络请求）。
  const url = "curl http://127.0.0.1:4173/api?a=1&b=2";
  const { reviewed } = await runShell(url, { gate: async () => ({ allow: false as const, reason: "fixture stops after review", by: "fixture" }) });
  assert.equal(reviewed, true, "词中 & 不得被守卫拦截");
  // 对照：反斜杠前导的结尾 & 同样按字面量放行。
  const escaped = await runShell("echo a\\&", { gate: async () => ({ allow: false as const, reason: "fixture stops after review", by: "fixture" }) });
  assert.equal(escaped.reviewed, true, "反斜杠前导的 & 不得被拦截");
});

test("F-7-opt2：未加引号的变量展开/命令替换阻断；引号内与常规 argv 放行", async () => {
  const blocked = ["echo $HOME", "echo ${HOME}", "echo $(pwd)", "echo `pwd`", "echo $NAME"];
  for (const command of blocked) {
    let gateCalls = 0;
    const shell = tools(allow, { shellGate: async () => { gateCalls++; return { allow: true, by: "fixture" }; } }).get("run_shell")!;
    const result = await shell.handler({ name: "run_shell", args: { command } });
    assert.equal(result.ok, false, command);
    assert.match(result.message, /不支持管道\/重定向\/变量展开/, command);
    assert.match(result.message, /加引号或改用等价写法/, command);
    assert.equal(gateCalls, 0, command);
  }
  for (const command of ["echo \"$HOME\"", "awk '{print $1}' test.json", "echo \\$HOME"]) {
    const { reviewed } = await runShell(command, { gate: async () => ({ allow: false as const, reason: "fixture stops after review", by: "fixture" }) });
    assert.equal(reviewed, true, `不得拦截：${command}`);
  }
});

test("F-7-c 守卫先于审核且不 spawn：diagnostics 记 shell.guard.blocked，normalize 不产生 shell.exec.start", async () => {
  const diag = spyDiagnostics();
  const shell = tools(allow, { shellGate: async () => ({ allow: true, by: "fixture" }), shellCwd: process.cwd(), diagnostics: diag.log }).get("run_shell")!;
  const result = await shell.handler({ name: "run_shell", args: { command: "ls | wc -l" }, toolCallId: "guard-1" });
  assert.equal(result.ok, false);
  const blocked = diag.events.find((entry) => entry.event === "shell.guard.blocked");
  assert.ok(blocked, "应记录 shell.guard.blocked");
  assert.equal(blocked?.fields?.toolCallId, "guard-1");
  assert.equal(blocked?.fields?.reasonCode, "|", "诊断携带命中 token");
  assert.ok(!diag.events.some((entry) => entry.event === "shell.review.start"), "不得进入审核");
  assert.ok(!diag.events.some((entry) => entry.event === "shell.exec.start"), "不得启动执行");
});
