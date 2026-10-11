import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInvocation } from "../../src/common/装配/cli-parse.ts";

test("空参数 -> help", () => {
  assert.deepEqual(parseInvocation([]), { kind: "help" });
});

test("--help / -h / help -> help", () => {
  for (const token of ["--help", "-h", "help"]) {
    assert.deepEqual(parseInvocation([token]), { kind: "help" });
  }
});

test("doctor -> doctor", () => {
  assert.deepEqual(parseInvocation(["doctor"]), { kind: "doctor" });
});

test("role run 编排 --task T-1 -> role-run（argv 为指令后的剩余参数）", () => {
  const inv = parseInvocation(["role", "run", "编排", "--task", "T-1"]);
  assert.equal(inv.kind, "role-run");
  if (inv.kind === "role-run") {
    assert.equal(inv.roleId, "编排");
    assert.equal(inv.taskId, "T-1");
    assert.deepEqual(inv.argv, ["编排", "--task", "T-1"]);
  }
});

test("--task= 等号写法同样可解析", () => {
  const inv = parseInvocation(["role", "run", "测试", "--task=T-9"]);
  assert.equal(inv.kind, "role-run");
  if (inv.kind === "role-run") {
    assert.equal(inv.roleId, "测试");
    assert.equal(inv.taskId, "T-9");
  }
});

test("role run 缺角色 / 缺 --task -> unknown", () => {
  assert.equal(parseInvocation(["role", "run"]).kind, "unknown");
  assert.equal(parseInvocation(["role", "run", "编排"]).kind, "unknown");
  assert.equal(parseInvocation(["role", "bogus"]).kind, "unknown");
});

test("govern 透传剩余参数", () => {
  assert.deepEqual(parseInvocation(["govern", "--x"]), { kind: "govern", argv: ["--x"] });
});

test("init 子命令已移除 -> unknown（客户废除 init，见编排 T16）", () => {
  assert.equal(parseInvocation(["init"]).kind, "unknown");
  assert.equal(parseInvocation(["init", "somewhere"]).kind, "unknown");
});

test("未知命令 -> unknown", () => {
  const inv = parseInvocation(["frobnicate"]);
  assert.equal(inv.kind, "unknown");
});
