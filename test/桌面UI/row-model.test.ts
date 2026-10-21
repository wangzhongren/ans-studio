// test/桌面UI/row-model.test.ts
// Phase 3A 纯逻辑：虚拟窗口行模型（无 DOM；node --test 直接 import .ts）。

import test from "node:test";
import assert from "node:assert/strict";
import { RowModel, VIRT_MIN_ROWS } from "../../app/renderer/src/chat/row-model.ts";

function rows(count: number, height = 50) {
  return Array.from({ length: count }, (_, index) => ({
    height,
    kind: "assistant",
    id: String(index),
  }));
}

test("小于阈值全挂载；达到阈值只窗口化视口 ± 缓冲", () => {
  const small = new RowModel<{ height: number; kind: string; id: string }>(16);
  small.setRows(rows(VIRT_MIN_ROWS - 1));
  const all = small.getWindow(0, 200);
  assert.equal(all.allMounted, true);
  assert.equal(all.rows.length, VIRT_MIN_ROWS - 1);
  assert.equal(all.topSpacer, 0);
  assert.equal(all.bottomSpacer, 0);

  const model = new RowModel<{ height: number; kind: string; id: string }>(16);
  model.setRows(rows(200));
  const view = model.getWindow(0, 200);
  assert.equal(view.allMounted, false);
  assert.ok(view.rows.length > 0 && view.rows.length < 200);
  assert.equal(view.topSpacer, 0);
  assert.ok(view.bottomSpacer > 0);
  assert.equal(model.debug().count, 200);
  assert.equal(model.debug().lastIndex, 199);
  assert.equal(model.debug().rowGap, 16);
});

test("prefix 与 spacer 记账：上 + 窗口 + 下 = 总高", () => {
  const model = new RowModel<{ height: number; kind: string; id: string }>(0);
  model.setRows(rows(300, 40));
  const total = model.totalHeight();
  assert.equal(total, 12000);
  for (const top of [0, 1000, 5000, 11500]) {
    const view = model.getWindow(top, top + 600, { buffer: 30 });
    const windowHeight = view.rows.reduce((sum, row) => sum + row.height, 0);
    assert.equal(view.topSpacer + windowHeight + view.bottomSpacer, total);
  }
});

test("preferTail 钉尾部；preferIndex 定位到指定行附近", () => {
  const model = new RowModel<{ height: number; kind: string; id: string }>(0);
  model.setRows(rows(200, 50));
  const tail = model.getWindow(0, 600, { preferTail: true, buffer: 30 });
  assert.equal(tail.last, 199);
  assert.equal(tail.first, 139);
  assert.equal(tail.rows.length, 61);
  const indexed = model.getWindow(0, 600, { preferIndex: 100, buffer: 30 });
  assert.equal(indexed.first, 70);
  assert.equal(indexed.last, 130);
});

test("insertAt 保持行序；indexOfCallId 支持 activities 内嵌 callId；operator 调试索引", () => {
  const model = new RowModel<any>(16);
  model.append({ height: 50, kind: "activities", data: { items: [{ callId: "call-1" }] } });
  model.append({ height: 50, kind: "assistant" });
  model.insertAt(1, {
    height: 50,
    kind: "operator",
    requestId: "op-1",
    data: { request: {} },
  });
  assert.equal(model.rows[1].kind, "operator");
  assert.equal(model.indexOfCallId("call-1"), 0);
  assert.deepEqual(model.debug().operators, [{ index: 1, requestId: "op-1" }]);
});
