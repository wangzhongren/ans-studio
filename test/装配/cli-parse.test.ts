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

test("P1-4 配套：role run 见 -h/--help 整段放行 -> role-run（--task 缺失/存在均可）", () => {
  // 裸 --help（无角色、无 --task）：此前在此被判「缺少 --task」而到不了命令层
  const bare = parseInvocation(["role", "run", "--help"]);
  assert.equal(bare.kind, "role-run");
  if (bare.kind === "role-run") {
    assert.deepEqual(bare.argv, ["--help"]); // 整段 argv 原样透传；help 判定与退码归命令层
    assert.equal(bare.taskId, "");
  }

  const short = parseInvocation(["role", "run", "-h"]);
  assert.equal(short.kind, "role-run");
  if (short.kind === "role-run") {
    assert.deepEqual(short.argv, ["-h"]);
  }

  // 有角色、缺 --task
  const withRole = parseInvocation(["role", "run", "装配", "--help"]);
  assert.equal(withRole.kind, "role-run");
  if (withRole.kind === "role-run") {
    assert.equal(withRole.roleId, "装配");
    assert.deepEqual(withRole.argv, ["装配", "--help"]);
    assert.equal(withRole.taskId, "");
  }

  // 既有可达位形（带 --task）：记录逐字不变
  const withTask = parseInvocation(["role", "run", "编排", "--task", "T-1", "--help"]);
  assert.equal(withTask.kind, "role-run");
  if (withTask.kind === "role-run") {
    assert.equal(withTask.roleId, "编排");
    assert.equal(withTask.taskId, "T-1");
    assert.deepEqual(withTask.argv, ["编排", "--task", "T-1", "--help"]);
  }
});

test("防放宽过度：无 help 时缺 --task 仍是 unknown「缺少 --task」；裸 help 令牌不放行", () => {
  const missing = parseInvocation(["role", "run", "编排"]);
  assert.equal(missing.kind, "unknown");
  if (missing.kind === "unknown") {
    assert.match(missing.message, /缺少 --task/);
  }
  // 命令层的 help 令牌集仅 "-h"/"--help"（不含裸 "help"）——位形内裸 help 不放行
  assert.equal(parseInvocation(["role", "run", "编排", "help"]).kind, "unknown");
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
