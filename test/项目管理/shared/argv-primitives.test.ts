// test/项目管理/shared/argv-primitives.test.ts
// 项目管理：对共享 argv 原语 `src/common/shared/argv-primitives.ts` 的 `normalizeArgv` 行为验证。
//
// 隶属：共享组件测试（pm 属主）。
//
// 说明：本条「跨角色镜像」的两处旧实现（编排 `src/common/编排/shell-gate.ts`、
// 桌面 `app/desktop/operator-channel.ts`）均为**私有非导出函数**，故无法像
// `path-primitives.test.ts` 那样**直接导入两处旧实现比对**。二者与共享实现**逐字相同**已由本任务
// 的字节级 `diff` 核对确认（见变更记录）；本文件据**共享实现的实际行为**逐条钉死语义，
// 消费方（编排 T21 / 桌面 T22）改为从本模块导入后，本组的断言即成为它们的口径基准。

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeArgv } from "../../../src/common/shared/argv-primitives.ts";

test("空数组 → []", () => {
  assert.deepEqual(normalizeArgv([]), []);
});

test("非数组入参一律 → []（null/undefined/标量/对象；绝不抛错）", () => {
  for (const v of [undefined, null, "echo hi", 42, 0, true, false, {}, { 0: "a", length: 1 }]) {
    assert.deepEqual(normalizeArgv(v), [], `入参 ${JSON.stringify(v)} 应归为空数组`);
  }
});

test("只保留字符串项，丢弃数字/布尔/null/undefined/对象/嵌套数组", () => {
  const input: unknown[] = ["a", 1, true, null, undefined, { x: 1 }, ["nested"], "b", false, 0];
  assert.deepEqual(normalizeArgv(input), ["a", "b"]);
});

test("保序：字符串项按出现顺序保留", () => {
  assert.deepEqual(normalizeArgv([1, "first", {}, "second", "third"]), ["first", "second", "third"]);
});

test("空串是合法字符串项，**保留**（不丢弃、不视为非字符串）", () => {
  assert.deepEqual(normalizeArgv(["", "x", ""]), ["", "x", ""]);
});

test("含空格/引号的项**逐字保留**（不裁剪空白、不加转义）", () => {
  assert.deepEqual(normalizeArgv(["  padded  ", 'a"b', "c'd", "e f"]), ["  padded  ", 'a"b', "c'd", "e f"]);
});

test("Windows 与 POSIX 路径**原样保留**（不规范化分隔符/大小写）", () => {
  const win = String.raw`C:\Users\MLoong\site`;
  const posix = "/usr/local/bin:/home/u";
  assert.deepEqual(normalizeArgv([win, posix]), [win, posix]);
  const out = normalizeArgv([win, posix]);
  assert.equal(out[0], win);
  assert.ok(out[0].includes("\\"));
  assert.equal(out[1], posix);
});

test("**不去重**：重复项全部保留（每次出现都留）", () => {
  assert.deepEqual(normalizeArgv(["ls", "-la", "ls", "-la", "ls"]), ["ls", "-la", "ls", "-la", "ls"]);
});

test("选项/旗标形态（含前导 - 与 --）逐字保留", () => {
  assert.deepEqual(normalizeArgv(["git", "commit", "-m", "msg", "--no-verify"]), [
    "git",
    "commit",
    "-m",
    "msg",
    "--no-verify",
  ]);
});

test("Unicode 与 emoji 逐字保留", () => {
  assert.deepEqual(normalizeArgv(["echo", "中文 参数", "\u{1f600}"]), ["echo", "中文 参数", "\u{1f600}"]);
});

test("不修改入参数组（纯函数；不改可变入参的长度或元素）", () => {
  const input = ["a", 1, "b"];
  const copy = input.slice();
  normalizeArgv(input);
  assert.deepEqual(input, copy);
});

test("返回值是新数组（与入参非同一引用）", () => {
  const input = ["a", "b"];
  assert.notEqual(normalizeArgv(input), input);
});
