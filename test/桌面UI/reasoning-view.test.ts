// test/桌面UI/reasoning-view.test.ts
// R5.1 渲染器纯逻辑单测：投影映射（R1）、文案（R2）、回合归组/插入/幂等（R3）、
// 省略/坏件降级（R4）与实时去重豁免。无 DOM。

import test from "node:test";
import assert from "node:assert/strict";
import {
  describeEvent,
  historyRowToDescriptor,
} from "../../app/renderer/src/chat/events.ts";
import {
  classifyLiveDuplicate,
  eventKey,
  isReasoningEvent,
} from "../../app/renderer/src/chat/replay.ts";
import {
  mergeReasoningRowData,
  reasoningInsertIndex,
  reasoningLabel,
  reasoningPieceFromCarrier,
  reasoningPieceFromDetail,
  reasoningPiecesFromData,
  reasoningRowDataFromPiece,
} from "../../app/renderer/src/chat/reasoning.ts";
import type { ReasoningPiece } from "../../app/renderer/src/chat/reasoning.ts";

const displayText = (text: string) => ({ text, truncated: false, redacted: false });

const projectedReasoning = (input: {
  text?: string;
  status?: string;
  durationMs?: unknown;
}) => ({
  text: displayText(input.text ?? ""),
  status: input.status ?? "complete",
  ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
});

const reasoningEvent = (input: {
  turnId?: string;
  detailTurnId?: string;
  summary?: string;
  reasoning?: unknown;
  rawText?: string;
}) => ({
  kind: "message",
  ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
  summary: input.summary ?? "已思考",
  detail: {
    version: 1,
    source: "reasoning",
    ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
    ...(input.detailTurnId !== undefined ? { turnId: input.detailTurnId } : {}),
    ...(input.rawText !== undefined ? { text: input.rawText } : {}),
  },
});

function dataOf(descriptor: ReturnType<typeof describeEvent>): Record<string, unknown> {
  assert.ok(descriptor);
  return descriptor.data as Record<string, unknown>;
}

test("R1 实时映射：正文取自 detail.reasoning.text.text，summary 不作正文", () => {
  const descriptor = describeEvent(
    reasoningEvent({
      turnId: "t1",
      summary: "已思考",
      reasoning: projectedReasoning({ text: "真实思考正文", durationMs: 4200 }),
    }),
  );
  assert.equal(descriptor?.kind, "reasoning");
  assert.equal(descriptor?.turnId, "t1");
  const data = dataOf(descriptor);
  assert.equal(data.text, "真实思考正文");
  assert.notEqual(data.text, "已思考");
  assert.equal(data.status, "complete");
  assert.equal(data.durationMs, 4200);
  assert.equal(data.label, "已思考 4 秒");
  assert.deepEqual(reasoningPiecesFromData(data), [
    { status: "complete", text: "真实思考正文", durationMs: 4200 },
  ] satisfies ReasoningPiece[]);
});

test("R1 event.turnId 缺省时取 detail.turnId", () => {
  const descriptor = describeEvent(
    reasoningEvent({
      detailTurnId: "turn-from-detail",
      reasoning: projectedReasoning({ text: "正文" }),
    }),
  );
  assert.equal(descriptor?.kind, "reasoning");
  assert.equal(descriptor?.turnId, "turn-from-detail");
});

test("R1 坏件 fail-closed：原始字符串/缺失/非法 status/非字符串 text 一律落诊断系统行", () => {
  const raw = describeEvent(
    reasoningEvent({ turnId: "t1", rawText: "未经投影的原始正文", reasoning: "原始正文" }),
  );
  assert.equal(raw?.kind, "system");
  assert.equal(dataOf(raw).text, "推理内容无法安全显示");
  assert.equal(dataOf(raw).cls, "sys-call");
  assert.equal(JSON.stringify(raw).includes("未经投影的原始正文"), false);

  const missing = describeEvent(reasoningEvent({ turnId: "t1" }));
  assert.equal(missing?.kind, "system");
  assert.equal(dataOf(missing).text, "推理内容无法安全显示");

  const badStatus = describeEvent(
    reasoningEvent({ turnId: "t1", reasoning: projectedReasoning({ text: "x", status: "weird" }) }),
  );
  assert.equal(badStatus?.kind, "system");

  const badText = describeEvent(
    reasoningEvent({
      turnId: "t1",
      reasoning: { text: { text: 42 }, status: "complete" },
    }),
  );
  assert.equal(badText?.kind, "system");
  assert.equal(dataOf(badText).text, "推理内容无法安全显示");
});

test("R1/R4 omitted 强制空正文与省略文案（违规正文不呈现）", () => {
  const plain = describeEvent(
    reasoningEvent({
      turnId: "t1",
      reasoning: projectedReasoning({ text: "违规携带的正文", status: "omitted" }),
    }),
  );
  assert.equal(plain?.kind, "reasoning");
  assert.equal(dataOf(plain).text, "");
  assert.equal(dataOf(plain).label, "已思考（内容由平台省略）");

  const timed = describeEvent(
    reasoningEvent({
      turnId: "t1",
      reasoning: projectedReasoning({ text: "", status: "omitted", durationMs: 8000 }),
    }),
  );
  assert.equal(dataOf(timed).label, "已思考 8 秒（内容由平台省略）");
  assert.equal(dataOf(timed).durationMs, 8000);
});

test("R2 文案格式：四舍五入/下限 1/省略与部分省略/非法时长忽略", () => {
  assert.equal(reasoningLabel({ status: "complete" }), "已思考");
  assert.equal(reasoningLabel({ status: "complete", durationMs: 4200 }), "已思考 4 秒");
  assert.equal(reasoningLabel({ status: "complete", durationMs: 400 }), "已思考 1 秒");
  assert.equal(reasoningLabel({ status: "complete", durationMs: 0 }), "已思考 1 秒");
  assert.equal(reasoningLabel({ status: "omitted" }), "已思考（内容由平台省略）");
  assert.equal(
    reasoningLabel({ status: "omitted", durationMs: 8000 }),
    "已思考 8 秒（内容由平台省略）",
  );
  assert.equal(
    reasoningLabel({ status: "complete", durationMs: 4200, partialOmitted: true }),
    "已思考 4 秒（部分内容由平台省略）",
  );
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "8", null]) {
    assert.equal(
      reasoningLabel({ status: "complete", durationMs: bad as number }),
      "已思考",
      "非法时长 " + String(bad) + " 必须按无信号处理",
    );
  }
});

test("R2 映射层丢弃非法时长（负数/NaN/Infinity/字符串/null）", () => {
  for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, "8000", null]) {
    const descriptor = describeEvent(
      reasoningEvent({
        turnId: "t1",
        reasoning: projectedReasoning({ text: "正文", durationMs: bad }),
      }),
    );
    const data = dataOf(descriptor);
    assert.equal(data.durationMs, undefined, "非法时长 " + String(bad) + " 不得透传");
    assert.equal(data.label, "已思考");
  }
});

test("R3 合并：到达序拼接、全有真实时长才求和、detailsOpen 保留、重复 piece 幂等", () => {
  const first = reasoningRowDataFromPiece({
    status: "complete",
    text: "第一段",
    durationMs: 2100,
  });
  const existing: Record<string, unknown> = { ...first, detailsOpen: { details: true } };
  const second = mergeReasoningRowData(existing, {
    status: "complete",
    text: "第二段",
    durationMs: 1900,
  });
  assert.equal(second.changed, true);
  assert.equal(second.data.text, "第一段\n\n第二段");
  assert.equal(second.data.durationMs, 4000);
  assert.equal(second.data.label, "已思考 4 秒");
  assert.equal((second.data.pieces as unknown[]).length, 2);
  assert.deepEqual(second.data.detailsOpen, { details: true });

  const replay = mergeReasoningRowData(second.data, {
    status: "complete",
    text: "第一段",
    durationMs: 2100,
  });
  assert.equal(replay.changed, false);
  assert.equal(replay.data, second.data);
});

test("R3 合并：全省略 ⇒ omitted；混合 ⇒ complete＋部分省略；omitted 不贡献正文", () => {
  let data: Record<string, unknown> = reasoningRowDataFromPiece({
    status: "omitted",
    text: "",
  });
  data = mergeReasoningRowData(data, { status: "omitted", text: "" }).data;
  assert.equal(data.status, "omitted");
  assert.equal(data.text, "");
  assert.equal(data.label, "已思考（内容由平台省略）");

  const mixed = mergeReasoningRowData(
    reasoningRowDataFromPiece({ status: "complete", text: "可见", durationMs: 2000 }),
    { status: "omitted", text: "", durationMs: 3000 },
  );
  assert.equal(mixed.changed, true);
  assert.equal(mixed.data.status, "complete");
  assert.equal(mixed.data.text, "可见");
  assert.equal(mixed.data.partialOmitted, true);
  assert.equal(mixed.data.label, "已思考 5 秒（部分内容由平台省略）");
});

test("R3 合并：任一段缺真实时长则不显示总时长（不显示部分和）", () => {
  const merged = mergeReasoningRowData(
    reasoningRowDataFromPiece({ status: "complete", text: "A", durationMs: 2100 }),
    { status: "complete", text: "B" },
  );
  assert.equal(merged.data.durationMs, undefined);
  assert.equal(merged.data.label, "已思考");
});

test("R1/R3 历史映射：row.reasoning ⇒ reasoning；缺失 ⇒ assistant 回落；坏载体 ⇒ 诊断", () => {
  const replayed = historyRowToDescriptor({
    kind: "assistant",
    turnId: "t1",
    text: "已思考",
    at: "2026-10-22T00:00:00Z",
    reasoning: projectedReasoning({ text: "回放正文", durationMs: 2500 }),
  });
  assert.equal(replayed.kind, "reasoning");
  assert.equal(replayed.replay, true);
  assert.equal(replayed.turnId, "t1");
  const data = replayed.data as Record<string, unknown>;
  assert.equal(data.text, "回放正文");
  assert.notEqual(data.text, "已思考");
  assert.equal(data.label, "已思考 3 秒");

  const fallback = historyRowToDescriptor({
    kind: "assistant",
    turnId: "t1",
    text: "已思考",
  });
  assert.equal(fallback.kind, "assistant");
  assert.equal((fallback.data as Record<string, unknown>).text, "已思考");

  const bad = historyRowToDescriptor({
    kind: "assistant",
    turnId: "t1",
    text: "已思考",
    reasoning: "未投影的原始字符串",
  });
  assert.equal(bad.kind, "system");
  assert.equal((bad.data as Record<string, unknown>).text, "推理内容无法安全显示");
});

test("R3 实时与历史同一 piece 指纹幂等：不重复拼接、不重复计时", () => {
  const historyPiece = reasoningPieceFromCarrier(
    projectedReasoning({ text: "同一段", durationMs: 1500 }),
  );
  assert.ok(historyPiece);
  const livePiece = reasoningPieceFromDetail({
    reasoning: projectedReasoning({ text: "同一段", durationMs: 1500 }),
  });
  assert.deepEqual(livePiece, historyPiece);
  const row = reasoningRowDataFromPiece(historyPiece);
  const merged = mergeReasoningRowData(row, livePiece!);
  assert.equal(merged.changed, false);
  assert.equal(merged.data.text, "同一段");
  assert.equal(merged.data.durationMs, 1500);
});

test("R3 插入位置：assistant/tool/终态之前；仅普通行时在其后；其他回合不影响", () => {
  const rows = [
    { kind: "assistant", turnId: "t1" },
    { kind: "user", turnId: "t2" },
  ];
  // t1 的 assistant 在 0：插到它之前。
  assert.equal(reasoningInsertIndex(rows, "t1"), 0);
  // t2 只有 user（非锚点）：插到该回合最后一条之后（表尾）。
  assert.equal(reasoningInsertIndex(rows, "t2"), 2);
  // 未知回合：表尾。
  assert.equal(reasoningInsertIndex(rows, "t3"), 2);

  const withTool = [
    { kind: "user", turnId: "t1" },
    { kind: "activities", turnId: "t1" },
    { kind: "assistant", turnId: "t1" },
  ];
  assert.equal(reasoningInsertIndex(withTool, "t1"), 1);

  const withTerminal = [
    { kind: "user", turnId: "t1" },
    { kind: "system", turnId: "t1" },
    { kind: "turn-terminal", turnId: "t1" },
  ];
  assert.equal(reasoningInsertIndex(withTerminal, "t1"), 2);

  const onlyUser = [
    { kind: "user", turnId: "t1" },
    { kind: "delivery", turnId: "t1" },
    { kind: "queue-aggregate" },
  ];
  assert.equal(reasoningInsertIndex(onlyUser, "t1"), 2);
});

test("R3 迟到 piece 合并后不移动位置；无 turnId 不合并、按到达序追加", () => {
  const assistant = { kind: "assistant", turnId: "t1" };
  const rows: Array<{ kind: string; turnId?: string; data?: unknown }> = [
    { kind: "user", turnId: "t1" },
    assistant,
  ];
  const at = reasoningInsertIndex(rows, "t1");
  assert.equal(at, 1);
  const reasoningRow: { kind: string; turnId: string; data: Record<string, unknown> } = {
    kind: "reasoning",
    turnId: "t1",
    data: reasoningRowDataFromPiece({ status: "complete", text: "A" }),
  };
  rows.splice(at, 0, reasoningRow);
  const before = rows.indexOf(reasoningRow);
  const existingData = reasoningRow.data;
  const merged = mergeReasoningRowData(existingData, { status: "complete", text: "B" });
  reasoningRow.data = merged.data;
  assert.equal(rows.indexOf(reasoningRow), before, "合并后位置不变");
  assert.equal(reasoningRow.data.text, "A\n\nB");

  assert.equal(reasoningInsertIndex(rows, ""), rows.length);
  const noTurnRows: Array<Record<string, unknown>> = [];
  for (const text of ["无轮次一", "无轮次二"]) {
    const descriptor = describeEvent(
      reasoningEvent({ reasoning: projectedReasoning({ text }) }),
    );
    assert.equal(descriptor?.kind, "reasoning");
    assert.equal(descriptor?.turnId, undefined);
    noTurnRows.push(descriptor!.data as Record<string, unknown>);
  }
  assert.equal(noTurnRows.length, 2);
  assert.notEqual(noTurnRows[0], noTurnRows[1]);
  assert.equal(noTurnRows[0].text, "无轮次一");
  assert.equal(noTurnRows[1].text, "无轮次二");
});

test("R3 去重：reasoning 不被 summary 吞掉；assistant/终态判定不变", () => {
  const event = reasoningEvent({
    turnId: "t1",
    reasoning: projectedReasoning({ text: "第一段", durationMs: 1000 }),
  });
  assert.equal(isReasoningEvent(event), true);
  const key = eventKey(event);
  assert.ok(key);
  assert.deepEqual(
    classifyLiveDuplicate({ key, event, historyCount: 1, liveCount: 0 }),
    { skip: false, nextLiveCount: 1 },
  );
  assert.deepEqual(
    classifyLiveDuplicate({ key, event, historyCount: 0, liveCount: 1 }),
    { skip: false, nextLiveCount: 2 },
  );

  const assistant = { kind: "message", turnId: "t1", summary: "回复" };
  assert.equal(isReasoningEvent(assistant), false);
  assert.equal(
    classifyLiveDuplicate({
      key: eventKey(assistant),
      event: assistant,
      historyCount: 1,
      liveCount: 0,
    }).skip,
    true,
  );

  const settled = { kind: "settled", turnId: "t1", summary: "完成" };
  assert.equal(
    classifyLiveDuplicate({
      key: eventKey(settled),
      event: settled,
      historyCount: 1,
      liveCount: 0,
    }).skip,
    false,
  );
});

test("R4 诊断分支文案保持不变（summary 优先，缺省用固定安全文案）", () => {
  const projected = describeEvent({
    kind: "message",
    turnId: "t1",
    summary: "投影失败：形状不合法",
    detail: { source: "reasoning-diagnostic" },
  });
  assert.equal(projected?.kind, "system");
  assert.equal((projected?.data as Record<string, unknown>).text, "投影失败：形状不合法");

  const empty = describeEvent({
    kind: "message",
    turnId: "t1",
    summary: "",
    detail: { source: "reasoning-diagnostic" },
  });
  assert.equal((empty?.data as Record<string, unknown>).text, "推理内容无法安全显示");
});
