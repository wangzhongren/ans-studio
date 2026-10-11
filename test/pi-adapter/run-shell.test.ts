// run_shell（V3 第一步）单测：命令级闸 ShellGate + 结构性不注册 + 扩展层能力级 kill-switch + env 凭据剥离。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 依据设计 §7.1/§7.2/§7.5/§7.7/§7.9。全部 spawn 用例使用**系统临时目录**中的“痕迹文件”
// （命令会写它，若被拦则文件不存在）来证明「拒绝时子进程从未启动」；绝不写仓库、用完即清理。
//
// 注意（如实标注）：**token 兜底机制已删除**（§7.1 第 3 条）——扩展层对 run_shell **不再是独立的第二道审**，
// 只剩**能力级 kill-switch**；本文件不再测任何 token（不去测一个不存在的东西）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, shellKillSwitch, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import type { ShellGate, ShellReviewResult } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

// —————————————————————— 夹具 ——————————————————————

/** 一律拒绝的写门禁（本文件不测写路径；写类工具不应被这些用例触发）。 */
function denyGate(): (p: string) => WriteDecision {
  return (p: string) => ({ allowed: false, reason: `写门禁不应被触发：${p}`, allowedByRoot: { skill: [], project: [] } });
}

/** 在系统临时目录内建隔离工作区，跑完（含异步）即清理——不触碰仓库。 */
async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-shell-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** node 可执行文件带引号（路径可能含空格，交给 splitCommand 的引号处理）。 */
function nodeCmd(script: string): string {
  return `"${process.execPath}" -e "${script}"`;
}

/** 一条“会写痕迹文件”的命令：若被真正执行，ANS_TRACE_FILE 处会出现 'LEAK'。 */
function traceCommand(): string {
  return nodeCmd("require('node:fs').writeFileSync(process.env.ANS_TRACE_FILE,'LEAK')");
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

/** 在受控 env 下运行一段用例（设置 ANS_TRACE_FILE，跑完恢复）。 */
async function withTraceEnv<T>(traceFile: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ANS_TRACE_FILE;
  process.env.ANS_TRACE_FILE = traceFile;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ANS_TRACE_FILE;
    else process.env.ANS_TRACE_FILE = prev;
  }
}

// —————————————————————— 1. 结构性：未注入 ShellGate → 不注册 ——————————————————————

test("未注入 ShellGate：run_shell 不在工具集里（能力缺席 = 最强 fail-closed，§7.5.1）", () => {
  const names = buildGovernedTools(denyGate()).map((t) => t.name);
  assert.equal(names.includes("run_shell"), false, "未注入 ShellGate 时绝不应有 run_shell");
  // 其余工具照常存在。
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("read_file"));
});

test("未注入 ShellGate（仅配置 readRoot/writeRoot）：仍不注册 run_shell", () => {
  const names = buildGovernedTools(denyGate(), { readRoot: process.cwd(), writeRoot: process.cwd() }).map((t) => t.name);
  assert.equal(names.includes("run_shell"), false);
});

test("注入 ShellGate：run_shell 出现在工具集里", () => {
  const gate: ShellGate = async () => ({ allow: false, reason: "x", by: "test" });
  const names = buildGovernedTools(denyGate(), { shellGate: gate }).map((t) => t.name);
  assert.ok(names.includes("run_shell"));
});

// —————————————————————— 2. allow:true → 真的 spawn ——————————————————————

test("allow:true → 真的执行命令，拿到 stdout 与 exit code", async () => {
  await inTempDir(async (dir) => {
    const trace = join(dir, "trace.txt");
    const calls: Array<{ command: string; argv: string[]; cwd: string; toolCallId: string }> = [];
    const gate: ShellGate = async (req) => {
      calls.push(req);
      return { allow: true, by: "pm" };
    };
    const shell = tool(
      buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }),
      "run_shell",
    );

    await withTraceEnv(trace, async () => {
      const command = nodeCmd("require('node:fs').writeFileSync(process.env.ANS_TRACE_FILE,'LEAK');process.stdout.write('ANS_SHELL_OK')");
      const result = await shell.handler({ name: "run_shell", args: { command }, toolCallId: "tc-allow" });

      assert.equal(result.ok, true, result.message);
      assert.match(result.message, /已执行/);
      assert.match(result.message, /exit 0/);
      assert.match(result.message, /ANS_SHELL_OK/);
      assert.equal(existsSync(trace), true, "允许时命令应真的执行（痕迹文件应存在）");
      assert.equal(readFileSync(trace, "utf8"), "LEAK");
    });

    // gate 收到 command/argv/cwd/toolCallId；cwd 钉在 shellCwd，toolCallId 透传。
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cwd, dir);
    assert.equal(calls[0].toolCallId, "tc-allow");
    assert.ok(calls[0].argv.length >= 2 && calls[0].argv[1] === "-e", "argv 应被拆分");
  });
});

test("allow:true → 非 0 退出码被如实报告（ok:false 但确已执行）", async () => {
  await inTempDir(async (dir) => {
    const gate: ShellGate = async () => ({ allow: true, by: "pm" });
    const shell = tool(buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }), "run_shell");
    const result = await shell.handler({ name: "run_shell", args: { command: nodeCmd("process.exit(7)") }, toolCallId: "tc-exit" });

    assert.equal(result.ok, false);
    assert.match(result.message, /已执行/);
    assert.match(result.message, /exit 7/);
  });
});

// —————————————————————— 3. deny / 抛错 / 超时 / 缺 token → 绝不 spawn ——————————————————————

test("allow:false → 绝不 spawn（痕迹文件不存在）", async () => {
  await inTempDir(async (dir) => {
    const trace = join(dir, "trace.txt");
    const gate: ShellGate = async () => ({ allow: false, reason: "硬拒：rm", by: "规则引擎(c)" });
    const shell = tool(buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }), "run_shell");

    await withTraceEnv(trace, async () => {
      const result = await shell.handler({ name: "run_shell", args: { command: traceCommand() }, toolCallId: "tc-deny" });
      assert.equal(result.ok, false);
      assert.match(result.message, /未执行/);
      assert.match(result.message, /硬拒：rm/);
      assert.equal(existsSync(trace), false, "拒绝时子进程绝不能启动");
    });
  });
});

test("审核抛错 → 绝不 spawn（痕迹文件不存在）", async () => {
  await inTempDir(async (dir) => {
    const trace = join(dir, "trace.txt");
    const gate: ShellGate = async () => {
      throw new Error("审核器内部异常");
    };
    const shell = tool(buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }), "run_shell");

    await withTraceEnv(trace, async () => {
      const result = await shell.handler({ name: "run_shell", args: { command: traceCommand() }, toolCallId: "tc-throw" });
      assert.equal(result.ok, false);
      assert.match(result.message, /审核未通过/);
      assert.match(result.message, /审核器内部异常/);
      assert.equal(existsSync(trace), false, "审核抛错时子进程绝不能启动");
    });
  });
});

test("审核超时 → 绝不 spawn（超时 = 拒绝，§7.5.2）", async () => {
  await inTempDir(async (dir) => {
    const trace = join(dir, "trace.txt");
    const gate: ShellGate = () => new Promise<ShellReviewResult>(() => {}); // 永不返回
    const shell = tool(
      buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir, shellReviewTimeoutMs: 50 }),
      "run_shell",
    );

    await withTraceEnv(trace, async () => {
      const result = await shell.handler({ name: "run_shell", args: { command: traceCommand() }, toolCallId: "tc-timeout" });
      assert.equal(result.ok, false);
      assert.match(result.message, /审核未通过/);
      assert.match(result.message, /超时/);
      assert.equal(existsSync(trace), false, "审核超时时子进程绝不能启动");
    });
  });
});

test("审核返回 undefined / 非明确 allow → 一律不执行（无 token 可依，§7.5.2）", async () => {
  await inTempDir(async (dir) => {
    const trace = join(dir, "trace.txt");

    const undefGate = (async () => undefined) as unknown as ShellGate;
    const shapelessGate = (async () => ({ by: "pm" })) as unknown as ShellGate; // 既无 allow:true 也无 allow:false

    await withTraceEnv(trace, async () => {
      const shellA = tool(buildGovernedTools(denyGate(), { shellGate: undefGate, shellCwd: dir }), "run_shell");
      const a = await shellA.handler({ name: "run_shell", args: { command: traceCommand() }, toolCallId: "a" });
      assert.equal(a.ok, false);

      const shellB = tool(buildGovernedTools(denyGate(), { shellGate: shapelessGate, shellCwd: dir }), "run_shell");
      const b = await shellB.handler({ name: "run_shell", args: { command: traceCommand() }, toolCallId: "b" });
      assert.equal(b.ok, false);
      assert.match(b.message, /未返回明确的允许/);

      assert.equal(existsSync(trace), false, "非明确 allow:true 时子进程绝不能启动");
    });
  });
});

// —————————————————————— 4. 参数校验 ——————————————————————

test("缺少 command → 拒绝，且不调审核、不 spawn", async () => {
  await inTempDir(async (dir) => {
    let called = 0;
    const gate: ShellGate = async () => {
      called += 1;
      return { allow: true, by: "pm" };
    };
    const shell = tool(buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }), "run_shell");
    const result = await shell.handler({ name: "run_shell", args: {}, toolCallId: "tc-noarg" });
    assert.equal(result.ok, false);
    assert.match(result.message, /缺少 command/);
    assert.equal(called, 0);
  });
});

// —————————————— 5. 扩展层能力级 kill-switch（不再是每调用 token 兜底） ——————————————
// 依据 §7.1 第 3 条 / §7.5 第 4 条：票据机制已删，扩展层对 run_shell 只做**同步粗判**——
// 未 arm 整只 block；arm 了即放行（交 execute 细审）。**不存在「第二道每调用审」。**

test("kill-switch：非 run_shell 不由本判据处理（undefined）", () => {
  assert.equal(shellKillSwitch({ toolName: "write_file", shellArmed: false }), undefined);
  assert.equal(shellKillSwitch({ toolName: "read_file", shellArmed: false }), undefined);
});

test("kill-switch：run_shell 未 arm（未注入 ShellGate）→ block", () => {
  const decision = shellKillSwitch({ toolName: "run_shell", shellArmed: false });
  assert.ok(decision, "未 arm 时 run_shell 必须被拦");
  assert.equal(decision!.block, true);
  assert.match(decision!.reason, /未 arm/);
});

test("kill-switch：run_shell 已 arm → 放行（undefined，交 execute 细审）", () => {
  assert.equal(shellKillSwitch({ toolName: "run_shell", shellArmed: true }), undefined);
});

// —————————————— 6. env 凭据剥离（§7.9 验收） ——————————————

// 造一个**假凭据**（临时环境变量），跑一条会**回显该 env** 的命令，断言命令输出里**没有**它。
// 目标变量取 PI_CREDENTIAL_ENV_VARS 之一；此处用 ANTHROPIC_AUTH_TOKEN。绝不打印真凭据（送测值是假造的哨兵）。
test("env 凭据剥离：spawn 的子进程看不到凭据变量（§7.9）", async () => {
  await inTempDir(async (dir) => {
    // 哨兵值故意唯一、含特征串，便于断言「未泄漏」；不会出现在任何断言输出里。
    const sentinel = "ANS-LEAK-SENTINEL-DO-NOT-PRINT-7f3a";
    const credVar = "ANTHROPIC_AUTH_TOKEN";
    const prevCred = process.env[credVar];
    // 另设一个**非凭据**变量：应**原样透传**（证明黑名单只剥凭据、不破坏正常命令的环境）。
    const passKey = "ANS_SHELL_ENV_PASSTHROUGH";
    const prevPass = process.env[passKey];
    process.env[credVar] = sentinel;
    process.env[passKey] = "PASSTHRU-OK";

    try {
      const gate: ShellGate = async () => ({ allow: true, by: "pm" });
      const shell = tool(buildGovernedTools(denyGate(), { shellGate: gate, shellCwd: dir }), "run_shell");

      // 命令回显两个 env：凭据（应为 undefined）与普通变量（应为原值）。
      const command = nodeCmd(
        "process.stdout.write('CRED=' + String(process.env.ANTHROPIC_AUTH_TOKEN) + ';PASS=' + String(process.env.ANS_SHELL_ENV_PASSTHROUGH))",
      );
      const result = await shell.handler({ name: "run_shell", args: { command }, toolCallId: "tc-cred" });

      assert.equal(result.ok, true, result.message);
      assert.equal(result.message.includes(sentinel), false, "命令输出绝不能含凭据值");
      assert.match(result.message, /CRED=undefined/, "被剥离的凭据变量在子进程中应为 undefined");
      assert.match(result.message, /PASS=PASSTHRU-OK/, "非凭据变量应原样透传（黑名单不误伤）");
    } finally {
      if (prevCred === undefined) delete process.env[credVar];
      else process.env[credVar] = prevCred;
      if (prevPass === undefined) delete process.env[passKey];
      else process.env[passKey] = prevPass;
    }
  });
});
