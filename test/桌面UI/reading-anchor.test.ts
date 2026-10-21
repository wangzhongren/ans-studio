// test/桌面UI/reading-anchor.test.ts
// Phase 5A 纯逻辑：首个可见阅读行锚点、贴底不介入、同文本还原 delta、一次性登记。

import test from "node:test";
import assert from "node:assert/strict";
import {
  clearReadingAnchors,
  clipReadingText,
  isStuckToBottom,
  readingAnchorDelta,
  readingAnchorFromRows,
  readingAnchorMatches,
  rememberReadingAnchor,
  restoredScrollTop,
  takeReadingAnchor,
  READING_TEXT_LIMIT,
} from "../../app/renderer/src/chat/reading-anchor.ts";

const anchor = (text = "row-42 长聊天验证", offset = 12) => ({
  text,
  offset,
  stickToBottom: false,
});

test("文本前缀与 e2e reading() 同口径：textContent 前 60 字", () => {
  assert.equal(READING_TEXT_LIMIT, 60);
  assert.equal(clipReadingText("x".repeat(80)).length, 60);
  assert.equal(clipReadingText("短文本"), "短文本");
  assert.equal(clipReadingText(null), "");
  assert.equal(clipReadingText(42), "");
});

test("贴底判定与 VirtualPane 24px 容差一致", () => {
  assert.equal(isStuckToBottom(1000, 1400, 400), true);
  assert.equal(isStuckToBottom(976, 1400, 400), true);
  assert.equal(isStuckToBottom(975, 1400, 400), false);
  assert.equal(isStuckToBottom(0, 100, 400), true);
  assert.equal(isStuckToBottom(Number.NaN, 1400, 400), false);
});

test("锚点取第一条有文本的可见行，offset 相对聊天顶", () => {
  const rows = [
    { text: "", top: 10 },
    { text: "row-7 首行", top: 42 },
    { text: "row-8 第二行", top: 84 },
  ];
  assert.deepEqual(readingAnchorFromRows(rows, 30, false), {
    text: "row-7 首行",
    offset: 12,
    stickToBottom: false,
  });
  assert.equal(readingAnchorFromRows(rows, 30, true), null);
  assert.equal(readingAnchorFromRows([{ text: "", top: 0 }], 0, false), null);
  assert.equal(readingAnchorFromRows([], 0, false), null);
});

test("同一行识别只用稳定文本前缀；不同行不猜", () => {
  const before = anchor();
  assert.equal(readingAnchorMatches(before, "row-42 长聊天验证。".repeat(8)), true);
  assert.equal(readingAnchorMatches(before, "row-43 长聊天验证"), false);
  assert.equal(readingAnchorMatches(before, ""), false);
  assert.equal(readingAnchorMatches(null, "row-42 长聊天验证"), false);
});

test("delta 还原：前缀插入导致下移 88px ⇒ scrollTop 增加 88px", () => {
  const before = anchor("row-42 长聊天验证", 12);
  assert.equal(readingAnchorDelta(before, 100, 0), 88);
  assert.equal(restoredScrollTop(before, 2400, 100, 0), 2488);
  // 记录时并非贴底；还原只做一次性偏移，不做平滑动画。
  assert.equal(restoredScrollTop(before, 0, 12, 0), 0);
  assert.equal(restoredScrollTop({ ...before, stickToBottom: true }, 2400, 100, 0), null);
  assert.equal(restoredScrollTop(null, 2400, 100, 0), null);
});

test("登记按角色隔离且一次性取走；贴底锚点不登记", () => {
  clearReadingAnchors();
  rememberReadingAnchor("A", anchor("A 行", 4));
  rememberReadingAnchor("B", anchor("B 行", 8));
  rememberReadingAnchor("A", { ...anchor("贴底行", 0), stickToBottom: true });
  assert.equal(takeReadingAnchor("A")?.text, "A 行");
  assert.equal(takeReadingAnchor("A"), null);
  assert.equal(takeReadingAnchor("B")?.text, "B 行");
  assert.equal(takeReadingAnchor("C"), null);
  clearReadingAnchors();
});
