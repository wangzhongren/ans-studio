// test/桌面UI/replay.test.ts
// Phase 3A 纯逻辑：历史回放幂等/增量/全量 + 实时回显去重。

import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLiveDuplicate,
  eventKey,
  isTerminalEvent,
  isToolEvent,
  planReplay,
  rowSignature,
} from "../../app/renderer/src/chat/replay.ts";

test("回放计划：完全相同 skip；严格前缀扩展 append；其余 full", () => {
  assert.deepEqual(planReplay(null, ["a"]), { mode: "full" });
  assert.deepEqual(planReplay(["a", "b"], ["a", "b"]), { mode: "skip" });
  assert.deepEqual(planReplay(["a", "b"], ["a", "b", "c"]), {
    mode: "append",
    from: 2,
  });
  assert.deepEqual(planReplay(["a", "b"], ["a", "x"]), { mode: "full" });
  assert.deepEqual(planReplay(["a", "b"], ["a"]), { mode: "full" });
});

test("历史行签名稳定且区分 kind/turnId/eventKind/text/at", () => {
  const a = rowSignature({ kind: "user", turnId: "t1", text: "x", at: "1" });
  const b = rowSignature({ kind: "user", turnId: "t1", text: "x", at: "1" });
  const c = rowSignature({ kind: "user", turnId: "t1", text: "y", at: "1" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("实时去重：历史已有同 key 的非终态事件只消费配额；终态/工具身份不被吞", () => {
  const event = { kind: "message", turnId: "t1", summary: "回复", detail: { text: "回复" } };
  const key = eventKey(event);
  assert.ok(key);
  const first = classifyLiveDuplicate({
    key,
    event,
    historyCount: 1,
    liveCount: 0,
  });
  assert.deepEqual(first, { skip: true, nextLiveCount: 1 });
  const second = classifyLiveDuplicate({
    key,
    event,
    historyCount: 1,
    liveCount: 1,
  });
  assert.deepEqual(second, { skip: true, nextLiveCount: 1 });

  const settled = { kind: "settled", turnId: "t1", summary: "完成" };
  assert.equal(isTerminalEvent(settled), true);
  assert.equal(
    classifyLiveDuplicate({ key: eventKey(settled), event: settled, historyCount: 1, liveCount: 0 }).skip,
    false,
  );

  const tool = {
    kind: "tool_call",
    turnId: "t1",
    summary: "read_file",
    detail: { toolName: "read_file" },
  };
  assert.equal(isToolEvent(tool), true);
  assert.equal(
    classifyLiveDuplicate({ key: eventKey(tool), event: tool, historyCount: 1, liveCount: 0 }).skip,
    false,
  );

  assert.equal(
    classifyLiveDuplicate({ key: null, event, historyCount: 1, liveCount: 0 }).skip,
    false,
  );
});

test("同一实时事件重复推送：第二次跳过且计数不膨胀", () => {
  const event = { kind: "message", turnId: "t1", summary: "x" };
  const key = eventKey(event);
  const first = classifyLiveDuplicate({ key, event, historyCount: 0, liveCount: 0 });
  assert.deepEqual(first, { skip: false, nextLiveCount: 1 });
  const second = classifyLiveDuplicate({ key, event, historyCount: 0, liveCount: 1 });
  assert.deepEqual(second, { skip: true, nextLiveCount: 1 });
});
