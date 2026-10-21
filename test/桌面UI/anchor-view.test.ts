// test/桌面UI/anchor-view.test.ts
// Phase 4B 纯逻辑：回放锚点登记/插入位/插入后索引右移/兜底。

import test from "node:test";
import assert from "node:assert/strict";
import { AnchorTable } from "../../app/renderer/src/chat/anchor-view.ts";

test("登记请求/结论行：请求重置旧结论；结论只配第一次", () => {
  const table = new AnchorTable();
  table.note(1, "k1", "request");
  table.note(2, "k1", "conclusion");
  assert.deepEqual(table.get("k1"), {
    anchorKey: "k1",
    requestIndex: 1,
    conclusionIndex: 2,
    rowsAtReplay: 3,
  });
  // 同题再次出现（新的一问）：旧结论作废，等待新结论。
  table.note(5, "k1", "request");
  assert.equal(table.get("k1")!.conclusionIndex, null);
  table.note(6, "k1", "conclusion");
  table.note(7, "k1", "conclusion");
  assert.equal(table.get("k1")!.conclusionIndex, 6);
  assert.equal(table.get("k1")!.requestIndex, 5);
  assert.equal(table.get("k1")!.rowsAtReplay, 8);
});

test("无锚/缺省 anchorKey 不登记；entries 返回副本", () => {
  const table = new AnchorTable();
  table.note(0, "", "request");
  table.note(0, null, "conclusion");
  assert.deepEqual(table.entries(), []);
  table.note(0, "k", "request");
  const entries = table.entries();
  entries[0].requestIndex = 99;
  assert.equal(table.get("k")!.requestIndex, 0);
});

test("插入位：请求行之后优先；只有结论行 ⇒ 结论之前；行表过短 ⇒ null（兜底落尾）", () => {
  const table = new AnchorTable();
  table.note(1, "with-both", "request");
  table.note(3, "with-both", "conclusion");
  assert.equal(table.insertionIndex("with-both", 4), 2);
  assert.equal(table.insertionIndex("with-both", 3), null);
  const conclusionOnly = new AnchorTable();
  conclusionOnly.note(4, "c", "conclusion");
  assert.equal(conclusionOnly.insertionIndex("c", 5), 4);
  assert.equal(conclusionOnly.insertionIndex("missing", 5), null);
});

test("插入后右移其后的锚点索引（卡保持在请求与结论之间）", () => {
  const table = new AnchorTable();
  table.note(1, "k", "request");
  table.note(2, "k", "conclusion");
  // 行表 [req=1, concl=2] 在 2 处插入卡：请求不变，结论右移到 3。
  table.shiftAfterInsert(2);
  assert.equal(table.get("k")!.requestIndex, 1);
  assert.equal(table.get("k")!.conclusionIndex, 3);
  // 在前方插入一行：两者同时右移。
  table.shiftAfterInsert(0);
  assert.equal(table.get("k")!.requestIndex, 2);
  assert.equal(table.get("k")!.conclusionIndex, 4);
  assert.equal(table.get("k")!.rowsAtReplay, 3);
});

test("clear 后为空；重复登记同一行幂等", () => {
  const table = new AnchorTable();
  table.note(2, "k", "request");
  table.note(2, "k", "request");
  assert.equal(table.get("k")!.requestIndex, 2);
  table.clear();
  assert.deepEqual(table.entries(), []);
});
