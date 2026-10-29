// test/门禁引擎/shell-write-guard.test.ts
// 2026-10-29（方案 v2.1 §6.3/§6.4，Q1 A）：shell 写目标守卫单元测试——
// 显式写目标越界/禁写路径 ⇒ deny；边界内 ⇒ pass（继续既有审批链）；不透明执行 ⇒ opaque；
// 只读/测试命令不受影响；逐目标调用注入的 checkWrite（同一个 resolveWrite 口径）。

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateShellWriteTargets, type ShellWriteGuardInput } from "../../src/common/门禁引擎/shell-write-guard.ts";

const ROOT = "/proj";

function guard(
  argv: string[],
  allowed: (rel: string) => boolean = (rel) => rel.startsWith("src/") || rel === "note.md",
  extras: Partial<ShellWriteGuardInput> = {},
) {
  const calls: string[] = [];
  const decision = evaluateShellWriteTargets({
    argv,
    cwd: ROOT,
    projectRoot: ROOT,
    skillRoot: ROOT,
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    forbiddenPrefixes: [".ans/", "角色卡/"],
    checkWrite: (rel) => {
      calls.push(rel);
      return allowed(rel) ? { allowed: true } : { allowed: false, reason: "未匹配条目" };
    },
    ...extras,
  });
  return { decision, calls };
}

test("显式写目标：cp 目标越界 ⇒ deny（列出目标），边界内 ⇒ pass 且逐目标过 checkWrite", () => {
  const bad = guard(["cp", "src/a.ts", "other/b.ts"]);
  assert.equal(bad.decision.kind, "deny");
  if (bad.decision.kind === "deny") {
    assert.deepEqual(bad.decision.targets, ["other/b.ts"]);
    assert.match(bad.decision.reason, /写边界|写目标/);
  }
  const ok = guard(["cp", "src/a.ts", "src/b.ts"]);
  assert.equal(ok.decision.kind, "pass");
  assert.deepEqual(ok.calls, ["src/b.ts"], "只判定写入目标（源不写）");
});

test("mv/rename 源也被删除 ⇒ 源+目标都判定；rm/touch/mkdir/tee 全部目标判定", () => {
  const mv = guard(["mv", "other/a.ts", "src/a.ts"]);
  assert.equal(mv.decision.kind, "deny", "mv 的源目录越界（删除）也必须拒绝");
  assert.deepEqual(mv.calls, ["other/a.ts"]);
  const rm = guard(["rm", "-rf", "src/tmp", "other/tmp"]);
  assert.equal(rm.decision.kind, "deny");
  const touch = guard(["touch", "note.md"]);
  assert.equal(touch.decision.kind, "pass");
  const mkdir = guard(["mkdir", "-p", "src/new"]);
  assert.equal(mkdir.decision.kind, "pass");
  const tee = guard(["tee", "other/log.txt"]);
  assert.equal(tee.decision.kind, "deny");
});

test("sed -i / chmod / ln 目标解析；禁写前缀优先于 checkWrite（.ans/、角色卡/）", () => {
  const sed = guard(["sed", "-i", "s/a/b/", "src/a.ts"]);
  assert.equal(sed.decision.kind, "pass");
  assert.deepEqual(sed.calls, ["src/a.ts"]);
  const chmod = guard(["chmod", "755", "other/x"]);
  assert.equal(chmod.decision.kind, "deny");
  const ln = guard(["ln", "-s", "src/a.ts", "other/link"]);
  assert.equal(ln.decision.kind, "deny");
  const forbidden = guard(["cp", "src/a.ts", ".ans/state/x.json"], () => true);
  assert.equal(forbidden.decision.kind, "deny");
  if (forbidden.decision.kind === "deny") assert.match(forbidden.decision.reason, /禁写/);
  assert.deepEqual(forbidden.calls, [], "禁写前缀命中时不调用 checkWrite（硬拒优先）");
});

test("逃逸防御：绝对路径越界 / `..` 逃出项目根 ⇒ deny；项目内绝对路径可判定", () => {
  const absolute = guard(["cp", "src/a.ts", "/outside/b.ts"]);
  assert.equal(absolute.decision.kind, "deny");
  const dotdot = guard(["rm", "../../outside.txt"]);
  assert.equal(dotdot.decision.kind, "deny");
  const insideAbs = guard(["cp", "src/a.ts", "/proj/src/c.ts"]);
  assert.equal(insideAbs.decision.kind, "pass");
});

test("不透明执行（Q1 A/Q2 A）：node 脚本/解释器脚本/npm run/构建工具 ⇒ opaque；node --test、npm test/install ⇒ pass", () => {
  for (const argv of [
    ["node", "docs/scheduling/copy-to-root.mjs"],
    ["python3", "tool.py"],
    ["node", "-m", "pkg"],
    ["npm", "run", "build"],
    ["npx", "some-cli"],
    ["make"],
    ["cargo", "build"],
    ["go", "build"],
  ]) {
    const result = guard(argv);
    assert.equal(result.decision.kind, "opaque", `${argv.join(" ")} 应判 opaque`);
  }
  for (const argv of [
    ["node", "--test"],
    ["node", "--test", "test/a.test.ts"],
    ["npm", "test"],
    ["npm", "install"],
    ["cat", "README.md"],
    ["git", "status"],
  ]) {
    const result = guard(argv);
    assert.equal(result.decision.kind, "pass", `${argv.join(" ")} 应 pass（无显式写目标/测试安装类）`);
  }
});

test("cwd 不在项目根（旧桩/异常）⇒ 以项目根为基准，不按外部目录解释后放行", () => {
  const result = guard(["touch", "note.md"], undefined, { cwd: "/elsewhere" });
  assert.equal(result.decision.kind, "pass");
  assert.deepEqual(result.calls, ["note.md"]);
});

test("TaskScope 收窄经由注入的 checkWrite 生效（守卫不另写路径判定）", () => {
  const result = evaluateShellWriteTargets({
    argv: ["touch", "src/b.ts"],
    cwd: ROOT,
    projectRoot: ROOT,
    skillRoot: ROOT,
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    scope: { writeSet: ["src/a.ts"], conditions: [] },
    forbiddenPrefixes: [],
    checkWrite: (rel) => ({ allowed: rel === "src/a.ts" }),
  });
  assert.equal(result.kind, "deny", "任务 scope 外的目标被同一 checkWrite 拒绝");
});
