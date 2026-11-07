// test/roles/rapporteur/spec.test.ts
// rapporteur 模块规格数据单测：逐字段对照旧注册表 fixture（E1.7；契约 §3.2/§3.3/D8/D10）。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import { intentEntryContractText } from "../../../src/common/shared/intent-entry-contract.ts";
import { ORACLE_RAPPORTEUR_SPEC } from "./oracle-fixture.ts";

test("规格：id / displayName / function 与旧注册表一致", () => {
  assert.equal(rapporteurRoleModule.id, ORACLE_RAPPORTEUR_SPEC.id);
  assert.equal(rapporteurRoleModule.displayName, ORACLE_RAPPORTEUR_SPEC.displayName);
  assert.equal(rapporteurRoleModule.function, ORACLE_RAPPORTEUR_SPEC.function);
});

test("规格：Section 1 条目逐字段一致（root 恒为 project）", () => {
  assert.deepEqual(rapporteurRoleModule.card.entries, ORACLE_RAPPORTEUR_SPEC.entries);
  for (const entry of rapporteurRoleModule.card.entries) {
    assert.equal(entry.root, "project");
    assert.equal(typeof entry.path, "string");
    assert.ok(entry.path.length > 0);
  }
});

test("规格：预授权目录与禁写前缀逐项一致", () => {
  assert.deepEqual(rapporteurRoleModule.card.preauthorizedDirs, ORACLE_RAPPORTEUR_SPEC.preauthorizedDirs);
  assert.deepEqual(rapporteurRoleModule.card.forbiddenWritePaths, ORACLE_RAPPORTEUR_SPEC.forbiddenWritePaths);
  assert.equal(rapporteurRoleModule.card.forbiddenWritePaths.length, 11);
  assert.ok(rapporteurRoleModule.card.forbiddenWritePaths.includes("角色卡/rapporteur/"));
  assert.ok(rapporteurRoleModule.card.forbiddenWritePaths.includes(".ans/"));
});

test("规格：capabilities 七字段与旧矩阵一致（D10 唯一真源）", () => {
  assert.deepEqual(rapporteurRoleModule.capabilities, ORACLE_RAPPORTEUR_SPEC.capabilities);
  assert.equal(rapporteurRoleModule.capabilities.dispatchTask, false);
  assert.equal(rapporteurRoleModule.capabilities.customerInput, true);
  assert.equal(rapporteurRoleModule.capabilities.shell, "operator-approve");
});

test("规格：cards 只列当前有效卡种（proposal + decision；无 legacy write）", () => {
  assert.deepEqual(rapporteurRoleModule.cards, ORACLE_RAPPORTEUR_SPEC.cards);
  assert.deepEqual([...rapporteurRoleModule.cards], ["proposal", "decision"]);
  assert.equal((rapporteurRoleModule.cards as readonly string[]).includes("write"), false);
});

test("规格：卡文本逐字节一致（sha256/长度/行数）", () => {
  const text = rapporteurRoleModule.card.text;
  const digest = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  assert.equal(digest, ORACLE_RAPPORTEUR_SPEC.cardText.sha256, "卡文本字节必须与旧注册表一致");
  assert.equal(text.length, ORACLE_RAPPORTEUR_SPEC.cardText.length);
  assert.equal(text.split("\n").length, ORACLE_RAPPORTEUR_SPEC.cardText.lineCount);
  assert.ok(text.startsWith("# 角色：策划（内置角色）"));
  assert.ok(text.includes("整单提交"));
  assert.ok(text.includes("continue-frozen"));
  assert.ok(text.includes("submit_version_change"), "卡文本使用运行时工具名");
  assert.equal(text.includes("submitVersionChange"), false, "卡文本不得泄漏模块内部 camelCase id");
});

test("规格：卡文本不含运行时秘密/账本占位或模型原始输出", () => {
  const text = rapporteurRoleModule.card.text;
  for (const marker of ["sk-", "apiKey", ".ans/ledger", "BEGIN PRIVATE KEY", "<model-output>"]) {
    assert.equal(text.includes(marker), false, `卡文本不得含 ${marker}`);
  }
});

test("规格：意图入口共享文本与 fixture 一致（共享单一来源，不复制 12 行契约）", () => {
  const sharedText = intentEntryContractText("rapporteur");
  const digest = createHash("sha256").update(Buffer.from(sharedText, "utf8")).digest("hex");
  assert.equal(digest, ORACLE_RAPPORTEUR_SPEC.cardText.intentEntryTextSha256);
  assert.ok(rapporteurRoleModule.card.text.includes(sharedText));
});

test("规格：模块数据冻结（模块 / card / entries / 各数组不可变）", () => {
  assert.ok(Object.isFrozen(rapporteurRoleModule));
  assert.ok(Object.isFrozen(rapporteurRoleModule.card));
  assert.ok(Object.isFrozen(rapporteurRoleModule.card.entries));
  assert.ok(Object.isFrozen(rapporteurRoleModule.card.preauthorizedDirs));
  assert.ok(Object.isFrozen(rapporteurRoleModule.card.forbiddenWritePaths));
  assert.ok(Object.isFrozen(rapporteurRoleModule.capabilities));
  assert.ok(Object.isFrozen(rapporteurRoleModule.cards));
  assert.ok(Object.isFrozen(rapporteurRoleModule.preflight));
  for (const entry of rapporteurRoleModule.card.entries) assert.ok(Object.isFrozen(entry));
});

test("规格：模块只暴露约定字段（无私有 cardText/matrix 泄漏）", () => {
  const keys = Object.keys(rapporteurRoleModule).sort();
  assert.deepEqual(keys, ["capabilities", "card", "cards", "context", "dispatch", "displayName", "function", "id", "preflight", "tools"]);
  assert.equal("cardText" in rapporteurRoleModule, false);
  assert.equal("matrix" in rapporteurRoleModule, false);
});
