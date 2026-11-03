// A1（2026-11-03 客户授权平面）：`src/model/directive-marker.ts` 识别规则真值表。
// 覆盖方案 §3.1 全部示例、近失配、多行、全角、空正文、非字符串入参，以及「零依赖」静态事实。
// 带图拒绝不是本解析器职责（解析器只接收文本）；本文件只证明带图场景的文本仍可被命中，
// 由 C1 在命中且图片非空时拒绝（不投递、不落账）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDirectiveMarker } from "../../src/model/directive-marker.ts";

const sourceUrl = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

test("A1/§3.1 示例表：命中 target 与 body 逐条符合", () => {
  const cases: Array<{ input: string; target: "approval" | "decision" | undefined; body?: string }> = [
    {
      input: '@审批 允许 shell "npm install" once',
      target: "approval",
      body: '允许 shell "npm install" once',
    },
    { input: "  \n\t@决策 选推荐项 until=session", target: "decision", body: "选推荐项 until=session" },
    { input: '@审批\n允许 shell "npm install"', target: "approval", body: '允许 shell "npm install"' },
    { input: "@审批员 你好", target: undefined },
    { input: "你好 @审批", target: undefined },
    { input: "@边界 只改 docs", target: undefined },
    { input: "＠审批 允许 …", target: undefined },
    { input: "@审批", target: "approval", body: "" },
    // §3.1 第 7 条：带图拒绝由调用方判定；文本本身仍按规则命中。
    { input: '@审批 允许 shell "x"', target: "approval", body: '允许 shell "x"' },
  ];

  for (const item of cases) {
    const hit = parseDirectiveMarker(item.input);
    if (item.target === undefined) {
      assert.equal(hit, undefined, `不得命中：${JSON.stringify(item.input)}`);
    } else {
      assert.ok(hit, `必须命中：${JSON.stringify(item.input)}`);
      assert.equal(hit.target, item.target, `target 不符：${JSON.stringify(item.input)}`);
      assert.equal(hit.body, item.body, `body 不符：${JSON.stringify(item.input)}`);
    }
  }
});

test("A1/§3.1 边界：标记后必须是空白或文本结束，近失配一律不命中", () => {
  const nearMisses = [
    "@审批员 你好",
    "@决策员 你好",
    "@审批-允许",
    "@审批，允许",
    "@审批、允许",
    "@审批。允许",
    "@决策X",
    "@决策，拒绝",
    "@审批@决策",
    "@approval allow",
    "@decision reject",
    "@审批.xlsx",
    "@ 审批 允许",
    "＠决策 选推荐项",
  ];
  for (const input of nearMisses) {
    assert.equal(parseDirectiveMarker(input), undefined, `近失配不得命中：${JSON.stringify(input)}`);
  }
});

test("A1/§3.1 前导空白：空格/制表符/换行/全角空格/BOM 均被跳过", () => {
  const positives: Array<[string, "approval" | "decision", string]> = [
    [" @审批 允许", "approval", "允许"],
    ["\t\t@决策 拒绝", "decision", "拒绝"],
    ["\n\r\n@审批 允许\n", "approval", "允许"],
    ["　　@审批　允许 shell \"x\"", "approval", '允许 shell "x"'],
    ["﻿@决策 选推荐项", "decision", "选推荐项"],
  ];
  for (const [input, target, body] of positives) {
    const hit = parseDirectiveMarker(input);
    assert.deepEqual(hit, { target, body }, `前导空白处理不符：${JSON.stringify(input)}`);
  }
});

test("A1/§3.1 多行与正文：只检查开头，其余全部为正文且不二次识别", () => {
  assert.deepEqual(parseDirectiveMarker("@审批\n允许 shell \"npm install\""), {
    target: "approval",
    body: '允许 shell "npm install"',
  });
  assert.deepEqual(parseDirectiveMarker("@决策 只接受\n方案 A"), {
    target: "decision",
    body: "只接受\n方案 A",
  });
  // 正文中的标记不触发第二次识别；target 保持首个标记。
  assert.deepEqual(parseDirectiveMarker("@审批 允许 @决策 选推荐项"), {
    target: "approval",
    body: "允许 @决策 选推荐项",
  });
  // 只 trim 两端，内部空白原样保留。
  assert.deepEqual(parseDirectiveMarker('@审批   允许  shell   "x"   '), {
    target: "approval",
    body: '允许  shell   "x"',
  });
});

test("A1/§3.1 空正文：命中且 body 为空（面板留空、确认禁用）", () => {
  for (const input of ["@审批", "@审批   ", "@审批\t\n", "@决策", "@决策　　", "@决策\r\n\r\n"]) {
    const hit = parseDirectiveMarker(input);
    assert.ok(hit, `空正文仍须命中：${JSON.stringify(input)}`);
    assert.equal(hit.body, "", `空正文 body 必须为空：${JSON.stringify(input)}`);
  }
});

test("A1/§3.1 空文本/仅空白不命中", () => {
  for (const input of ["", " ", "\n\t\r\n", "　　", "﻿"]) {
    assert.equal(parseDirectiveMarker(input), undefined, `不得命中：${JSON.stringify(input)}`);
  }
});

test("A1/§3.1 非字符串入参返回 undefined 且不抛错", () => {
  for (const value of [undefined, null, 42, true, {}, [], ["@审批 允许"]]) {
    let hit: unknown = "unset";
    assert.doesNotThrow(() => {
      hit = parseDirectiveMarker(value as unknown as string);
    }, `非字符串不得抛错：${String(value)}`);
    assert.equal(hit, undefined, `非字符串必须返回 undefined：${String(value)}`);
  }
});

test("A1/§3.1 零依赖：marker 源文件无 import/require、无 Node 全局", async () => {
  const source = await readFile(sourceUrl("../../src/model/directive-marker.ts"), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false, "marker 不得有 import 声明");
  assert.equal(/\brequire\s*\(/.test(source), false, "marker 不得使用 require");
  assert.equal(/\bfrom\s+["']/.test(source), false, "marker 不得从模块导入");
  assert.equal(/\b(process|Buffer|__dirname|__filename)\b/.test(source), false, "marker 不得依赖 Node 全局");
  assert.equal(/\bnode:/.test(source), false, "marker 不得引用 node: 内置模块");
  assert.match(source, /export function parseDirectiveMarker/);
});
