// 门禁引擎测试：T-1「未通过产物」暂存区（治理文案与边界约定，客户 2026-10-12 裁定）
//
// 客户原话：「应该增加一个 temp 文件夹，里面存储没有通过的文件，这样审核也方便点」。
// 裁定：每角色一个 `<项目>/temp/<角色>/`；**被门禁拒绝的写入内容不存**（保住「拒绝=零副作用」）。
//
// 本文件钉住（治理文案，非产品代码；判定逻辑一行未改）：
//  1. su 内置卡文本含约定：每角色边界 Section 1 应含 `temp/<角色 id>/`（kind: directory，
//     purpose「未通过/返工产物暂存，供审核对照」）；退回/返工先存档（带日期与版本）+ 写 REVIEW.md
//     （谁退的/为什么/要求什么）再改主交付物；temp 是草稿区、不参与 pin；建 .gitignore 时忽略 temp/；
//  2. **反向断言**：涉及「被门禁拒绝」与 temp 的表述必须是**禁止**式——不得出现「把被拒内容存 temp」式指令；
//  3. 治理种子 purpose 同步点明 temp 用途；且**种子仍恰为三条**（本派工是文案，不动创世写集——
//     `test/测试/cli-genesis-boundary.test.ts` 钉「即便此角落，创世种子仍恰为三处治理产物」）；
//     格式单一来源：完整退回流程只在 su 卡文本，种子 purpose 不复制（无 REVIEW.md 字样）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";
import { governanceBoundaryEntries } from "../../src/common/门禁引擎/governance-seed.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;

test("T-1：su 卡文本写死——每角色边界应含 temp/<角色 id>/（directory，purpose 供审核对照）", () => {
  assert.match(T, /temp\/<角色 id>\//, "须点名暂存路径 temp/<角色 id>/");
  assert.match(T, /kind: directory/, "须写明该条目的 kind: directory");
  assert.match(T, /未通过\/返工产物暂存，供审核对照/, "须写明 purpose 原文（供照抄）");
  assert.match(T, /Section 1 应包含/, "须指明这是边界 Section 1 的约定");
});

test("T-1：su 卡文本写死退回/返工流程——先存档（日期+版本）→ REVIEW.md 记三问 → 再改主交付物", () => {
  assert.match(T, /被验收退回或要求返工的产物/, "须定义暂存对象（被验收退回/要求返工的产物）");
  assert.match(T, /先存档/, "须写明先存档、再改主交付物");
  assert.match(T, /2026-10-12_草案-v2\.md/, "须给出带日期与版本的命名示例");
  assert.match(T, /REVIEW\.md/, "须点名 REVIEW.md");
  for (const q of ["谁退的", "为什么", "要求什么"]) {
    assert.ok(T.includes(q), `REVIEW.md 须记「${q}」`);
  }
  assert.match(T, /role-card\.md/, "退回流程须随角色卡（role-card.md）写进新角色");
  assert.match(T, /\.gitignore/, "须含「建 .gitignore 时忽略 temp/」一句（项目角色的建项目约定）");
  assert.match(T, /忽略 `temp\/`/, "`.gitignore` 的忽略对象须是 temp/");
});

test("T-1：红线与定位——不得存被拒内容（拒绝=零副作用）；temp 是草稿区、不参与 pin", () => {
  assert.match(T, /不得把「被门禁拒绝的写入内容」存进 temp/, "红线原文须在（模型可照抄）");
  assert.match(T, /拒绝即零副作用/, "须给出红线的理由（拒绝即零副作用）");
  assert.match(T, /草稿区/, "temp 须定位为草稿区");
  assert.match(T, /不参与 pin/, "temp 须明确不参与 pin（非交付物）");
});

test("T-1 反向断言：任何涉及「拒绝」与 temp 的表述都必须是**禁止**式，不得出现「把被拒内容存 temp」式指令", () => {
  // 逐小句（。；换行切开）检查：同一小句同时出现「拒绝」与 temp 时，必须带禁止词。
  const clauses = T.split(/[。；\n]/).filter((c) => c.includes("temp") && c.includes("拒绝"));
  assert.ok(clauses.length >= 1, "红线小句须存在（拒绝 × temp 至少同现一次）");
  for (const c of clauses) {
    assert.match(c, /不得|不要|勿|严禁|禁止/, `涉及「拒绝」与 temp 的小句必须是否定/禁止表述，实得：${c}`);
  }
  // 定向反面模式：任何「应/须/要/请/可…拒…存…temp」的肯定式指令都不得存在
  // （红线句以「不得把…」开头、带禁止词，不会命中本模式——故本检查不会把红线自身误判）。
  const affirmative = /(?:应|须|要|请|可以|可将|需)[^。\n]{0,24}?拒[^。\n]{0,24}?存(入|进|到)?[^。\n]{0,10}?temp/;
  assert.equal(affirmative.test(T), false, "不得出现「把被拒内容存 temp」式肯定指令");
});

test("T-1：治理种子 purpose 同步点明 temp 用途；种子仍恰为三条（文案派工，不动创世写集）", () => {
  const entries = governanceBoundaryEntries();
  assert.equal(entries.length, 3, "创世种子仍恰为三处治理产物（写集不变）");
  const card = entries.find((e) => e.path === "角色卡/");
  assert.ok(card, "种子须含 角色卡/ 条目");
  assert.match(card!.purpose, /temp\/<角色 id>\//, "种子 purpose 须交叉点明 temp/<角色 id>/");
  assert.match(card!.purpose, /未通过\/返工产物/, "种子 purpose 须点明暂存对象");
  assert.match(card!.purpose, /不参与 pin/, "种子 purpose 须点明 temp 非交付物（不参与 pin）");
  // 格式单一来源：完整退回流程（REVIEW.md 等）只在 su 卡文本，种子 purpose 不复制。
  assert.equal(card!.purpose.includes("REVIEW.md"), false, "种子 purpose 不得复制完整流程（单一来源在 su 卡文本）");
});
