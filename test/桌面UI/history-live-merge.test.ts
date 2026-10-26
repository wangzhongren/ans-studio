// test/桌面UI/history-live-merge.test.ts
// 真机回归 row-355/row-358：会话重建的用户输入以「【系统通知·会话重建】…\n\n正文」
// 回放；历史行在界面拆成「通知行 + 用户正文行」。合并必须按呈现分片比较，
// 同一 turn 同一输入只保留一份，同时不得吞掉不同 turn 的同文输入或 replay 恢复。

import test from "node:test";
import assert from "node:assert/strict";
import {
  historyRenderParts,
  historyRowToDescriptor,
} from "../../app/renderer/src/chat/events.ts";
import {
  historyPartCoveredByLive,
  liveRowIdentity,
  planHistoryMerge,
  type LiveRowIdentity,
} from "../../app/renderer/src/chat/history-merge.ts";

const TURN = "8c0aadef-2c3a-4602-8ea0-8fb7d08dd539";
const NOTICE = "此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。";
const BODY = "流程 todo-cli-v1：组队写卡已通过结构校验（文件/章节齐全）。";
const RAW = `【系统通知·会话重建】${NOTICE}\n\n${BODY}`;

const noticeHistoryRow = () => ({
  kind: "user",
  turnId: TURN,
  at: "2026-10-25T14:53:28.222Z",
  text: RAW,
});

const liveIdentity = (
  kind: string,
  turnId: string,
  body: Record<string, unknown>,
): LiveRowIdentity => {
  const identity = liveRowIdentity({ kind, turnId, data: body });
  assert.ok(identity);
  return identity;
};

test("system-notice 历史行按呈现分片拆为通知行 + 用户正文行", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const parts = historyRenderParts(descriptor);
  assert.deepEqual(parts, [
    { kind: "injected", text: NOTICE },
    { kind: "user", text: BODY },
  ]);
});

test("history+live 合并：同 turn 的通知行与用户正文行都已被实时呈现 ⇒ 不再追加", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const live = [
    liveIdentity("injected", TURN, { kind: "system-notice", body: NOTICE }),
    liveIdentity("user", TURN, { text: BODY }),
  ];
  const decision = planHistoryMerge(descriptor, live);
  assert.equal(decision.appendRow, false);
  assert.equal(decision.appendNoticeOnly, false);
  assert.deepEqual(decision.appendUserTexts, []);
  const parts = historyRenderParts(descriptor);
  assert.equal(historyPartCoveredByLive(parts[0], TURN, live), true);
  assert.equal(historyPartCoveredByLive(parts[1], TURN, live), true);
});

test("history+live 合并：只缺用户正文时只补正文，不重复通知行", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const decision = planHistoryMerge(descriptor, [
    liveIdentity("injected", TURN, { kind: "system-notice", body: NOTICE }),
  ]);
  assert.equal(decision.appendRow, false);
  assert.equal(decision.appendNoticeOnly, false);
  assert.deepEqual(decision.appendUserTexts, [BODY]);
});

test("history+live 合并：只缺通知时只补通知（去掉 remainder），不重复用户正文", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const decision = planHistoryMerge(descriptor, [
    liveIdentity("user", TURN, { text: BODY }),
  ]);
  assert.equal(decision.appendRow, false);
  assert.equal(decision.appendNoticeOnly, true);
  assert.deepEqual(decision.appendUserTexts, []);
});

test("不同 turn 的同文用户输入仍两条（客户真实两次发送）", () => {
  const historyRow = { kind: "user", turnId: "turn-second", text: BODY };
  const descriptor = historyRowToDescriptor(historyRow);
  const liveOtherTurn = [liveIdentity("user", "turn-first", { text: BODY })];
  assert.equal(planHistoryMerge(descriptor, liveOtherTurn).appendRow, true);
  // 同文但不同 turn 的 system-notice 历史行也不被另一轮实时行覆盖。
  const noticeOtherTurn = historyRowToDescriptor(noticeHistoryRow());
  const livePreviousTurn = [
    liveIdentity("injected", "turn-first", { kind: "system-notice", body: NOTICE }),
    liveIdentity("user", "turn-first", { text: BODY }),
  ];
  assert.equal(planHistoryMerge(noticeOtherTurn, livePreviousTurn).appendRow, true);
});

test("replay 恢复：无实时行时追加原历史行一次，呈现为一通知 + 一用户行", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const decision = planHistoryMerge(descriptor, []);
  assert.equal(decision.appendRow, true);
  assert.equal(decision.appendNoticeOnly, false);
  assert.deepEqual(decision.appendUserTexts, []);
  assert.equal(historyRenderParts(descriptor).length, 2);
});

test("本地乐观行已认领正文时视为已覆盖，不追加第二条用户行", () => {
  const descriptor = historyRowToDescriptor(noticeHistoryRow());
  const decision = planHistoryMerge(
    descriptor,
    [liveIdentity("injected", TURN, { kind: "system-notice", body: NOTICE })],
    new Set([BODY]),
  );
  assert.equal(decision.appendRow, false);
  assert.equal(decision.appendNoticeOnly, false);
  assert.deepEqual(decision.appendUserTexts, []);
});

test("非 replay/无 turnId 的实时行不参与合并身份（不猜）", () => {
  assert.equal(
    liveRowIdentity({ kind: "user", turnId: TURN, data: { text: BODY }, replay: true }),
    null,
  );
  assert.equal(liveRowIdentity({ kind: "user", data: { text: BODY } }), null);
});
