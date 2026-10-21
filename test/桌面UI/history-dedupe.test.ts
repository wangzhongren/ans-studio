// test/桌面UI/history-dedupe.test.ts
// 5B 真机回归：同一条 [派发] 同时以 user 行与 prompt-input message 事件存在时，
// 历史内部只保留一条 injected/user 投影；不同 stepId 的派发与合法 assistant/tool 行不被误删。

import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeHistoryDescriptors,
  dedupeHistoryRows,
  historyRowToDescriptor,
} from "../../app/renderer/src/chat/events.ts";

const row = (extra: Record<string, unknown>) => ({
  kind: "user",
  turnId: "turn-dispatch",
  at: "2026-10-21T00:00:00Z",
  ...extra,
});

test("同一 turn 的 user 行 + prompt-input 事件同文：历史内部只保留一条 injected", () => {
  const text = "[派发] 来自 convener 的任务\n目标：实现 todo-app 的列表";
  const rows = [
    row({ text }),
    // 真实 replay 中同文 message(prompt-input) 归一化后也是 user 行；带 anchor 的一条优先。
    row({ text, anchorKey: "dispatch:turn-dispatch" }),
  ];
  const descriptors = rows.map(historyRowToDescriptor);
  assert.equal(descriptors[0].kind, "injected");
  assert.equal(descriptors[1].kind, "injected");
  const deduped = dedupeHistoryDescriptors(descriptors);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].kind, "injected");
  assert.equal(deduped[0].anchorKey, "dispatch:turn-dispatch");
  assert.equal(dedupeHistoryRows(rows).length, 1);
});

test("两条不同 stepId 的派发（首行文本不同）都保留", () => {
  const rows = [
    row({ text: "[派发] 步骤 step-1：写列表组件\n目标：src/list.tsx" }),
    row({ text: "[派发] 步骤 step-2：跑冒烟\n目标：test/list.test.ts" }),
  ];
  assert.equal(dedupeHistoryDescriptors(rows.map(historyRowToDescriptor)).length, 2);
  assert.equal(dedupeHistoryRows(rows).length, 2);
});

test("同轮合法 assistant 多行与不同 callId 工具行不被历史去重误删", () => {
  const rows = [
    { kind: "assistant", turnId: "t1", text: "同一句回复" },
    { kind: "assistant", turnId: "t1", text: "同一句回复" },
    { kind: "tool", turnId: "t1", text: "read_file: a.md", activity: { toolCallId: "call-1", toolName: "read_file" } },
    { kind: "tool", turnId: "t1", text: "read_file: a.md", activity: { toolCallId: "call-2", toolName: "read_file" } },
  ];
  assert.equal(dedupeHistoryRows(rows).length, 4);
});

test("无 turnId / 无文本的投影行不被误合并", () => {
  const same = "[派发] 无轮次同一文本";
  const rows = [
    row({ turnId: undefined, text: same }),
    row({ turnId: undefined, text: same }),
    row({ text: "" }),
    row({ text: "" }),
  ];
  assert.equal(dedupeHistoryRows(rows).length, 4);
});
