// 独立复验（测试角色，2026-10-16）：F-7 执行层 shell 语法守卫的对抗性行为核对。
// 本文件**独立构造**用例与断言（不复用实施方 test/runtime-core/shell-guard.test.ts 的断言语料）：
//  - 阻断集：独立操作符 token / 紧贴重定向 token 在审核之前被拒 + 零 spawn 探针；
//  - 放行集：引号内 `\|` 与未加引号反斜杠前导 `\|` 的 grep **真实执行**（不只是到达审核）；
//  - opt1 内嵌 `x|sort` 拒绝；opt2 `$HOME`/`$(...)` 拒绝而 `'$HOME'` 放行并真实执行。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import type { GovernedToolsOptions, WriteGate } from "../../../src/model/runtime.ts";

/** 本文件自持的最小放行写门（不导入任何角色的既有夹具——独立性）。 */
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

test("F-7 阻断：独立操作符与紧贴重定向 token 一律「未执行」拒绝、不调 gate、不 spawn", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f7-"));
  try {
    // 本组命令各含一个**独立 token** 操作符（与实施方用例集合不同的构造：空格分隔的 `;`、
    // `2>/dev/null`、前置 `<`、`||`、独立 `>`）。
    const cases: Array<{ command: string; expectToken: string }> = [
      { command: "ls ; pwd", expectToken: ";" },
      { command: "printf a 2>/dev/null", expectToken: "2>/dev/null" },
      { command: "< in.txt cat", expectToken: "<" },
      { command: "cat a.txt >> b.txt", expectToken: ">>" },
      { command: "true && false", expectToken: "&&" },
      { command: "x || y", expectToken: "||" },
    ];
    for (const { command, expectToken } of cases) {
      let gateCalls = 0;
      const diag = spyDiag();
      const result = await shellTool({
        shellGate: async () => { gateCalls += 1; return { allow: true, by: "verify" }; },
        shellCwd: root,
        diagnostics: diag.log,
      }).handler({ name: "run_shell", args: { command } });
      assert.equal(result.ok, false, command);
      assert.ok(result.message.startsWith("run_shell 未执行："), `拒否开头「未执行」而非「已执行」：${command}`);
      assert.ok(result.message.includes(`"${expectToken}"`), `文案须回显命中 token：${command}`);
      assert.match(result.message, /不支持管道\/重定向\/变量展开/);
      assert.equal(gateCalls, 0, `守卫必须先于审核：${command}`);
      assert.ok(diag.events.some((e) => e.event === "shell.guard.blocked"), command);
      assert.ok(!diag.events.some((e) => e.event === "shell.exec.start"), `不得触达执行：${command}`);
    }
    // 零副作用探针（独立构造）：管道命令若被执行会创建文件——被守卫拒绝则目录保持为空。
    const probe = await shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
      shellCwd: root,
    }).handler({ name: "run_shell", args: { command: "touch f7-probe-marker | sort" } });
    assert.equal(probe.ok, false);
    assert.equal(existsSync(path.join(root, "f7-probe-marker")), false, "被拒命令零副作用（无文件痕迹）");
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-7 放行并真实执行：引号内 `\\|` 与未加引号反斜杠前导 `\\|` 的 grep（真机证据命令口径）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f7-"));
  try {
    await writeFile(path.join(root, "f7data.txt"), "aa|bb literal pipe\nalpha\nbeta\n");
    const options: GovernedToolsOptions = { shellGate: async () => ({ allow: true, by: "verify" }), shellCwd: root };
    const quoted = await shellTool(options).handler({ name: "run_shell", args: { command: `grep -n "a\\|b" f7data.txt` } });
    assert.equal(quoted.ok, true, `引号内 \\| 必须照常执行：${quoted.message}`);
    assert.match(quoted.message, /literal pipe/, "引号形态应真实产出匹配行");
    const escaped = await shellTool(options).handler({ name: "run_shell", args: { command: `grep a\\|b f7data.txt` } });
    assert.equal(escaped.ok, true, `未加引号反斜杠前导 \\| 必须照常执行：${escaped.message}`);
    assert.match(escaped.message, /literal pipe/, "反斜杠形态应真实产出匹配行");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("F-7-opt1：内嵌未加引号 `x|sort` 拒绝（附加引号指引）；词中 &（URL）不判", async () => {
  let gateCalls = 0;
  const blocked = await shellTool({
    shellGate: async () => { gateCalls += 1; return { allow: true, by: "verify" }; },
  }).handler({ name: "run_shell", args: { command: "find . -name x|sort" } });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.message.includes('"x|sort"'), `命中 token 应如实回显：${blocked.message}`);
  assert.match(blocked.message, /加引号或改用等价写法/, "内嵌类须给「加引号或拆分」指引");
  assert.equal(gateCalls, 0);
  // 词中 &（URL 查询串）不得判中：到达审核即证明未拦截（审核用 deny 收口，不发真实网络请求）。
  let reviewed = false;
  const url = await shellTool({
    shellGate: async () => { reviewed = true; return { allow: false, reason: "verify-stop", by: "verify" }; },
  }).handler({ name: "run_shell", args: { command: "curl http://127.0.0.1:9/api?a=1&b=2" } });
  assert.equal(reviewed, true, "URL 词中 & 不得被守卫拦截");
  assert.ok(!/未经 shell 解释/.test(url.message));
});

test("F-7-opt2：未加引号 $HOME / $(...) 拒绝；'$HOME' 引号态放行并真实执行出字面量", async () => {
  for (const command of ["echo $HOME", "echo $(pwd)"]) {
    const result = await shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
    }).handler({ name: "run_shell", args: { command } });
    assert.equal(result.ok, false, command);
    assert.match(result.message, /不支持管道\/重定向\/变量展开/, command);
    assert.match(result.message, /加引号或改用等价写法/, command);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-verify-f7-"));
  try {
    const literal = await shellTool({
      shellGate: async () => ({ allow: true, by: "verify" }),
      shellCwd: root,
    }).handler({ name: "run_shell", args: { command: "echo '$HOME'" } });
    assert.equal(literal.ok, true, `引号内 $HOME 必须照常执行：${literal.message}`);
    assert.match(literal.message, /\$HOME/, "引号态应打印字面量 $HOME（未经 shell 展开）");
  } finally { await rm(root, { recursive: true, force: true }); }
});
