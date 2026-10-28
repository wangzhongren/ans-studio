// test/桌面UI/decision-dialog.test.ts
// E 批：决策对话框卡视图/优先级/推荐项/待办语义（纯逻辑）。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decisionPriority,
  decisionView,
  isDestructiveDecision,
  nextDecisionId,
  orderedDecisionIds,
  pendingMoreCount,
} from "../../app/renderer/src/chat/decision-dialog.ts";

function payload(over: Record<string, unknown> = {}, request: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    roleId: "rapporteur",
    request: { kind: "confirm", title: "提案", ...request },
    ...over,
  };
}

test("优先级：高风险 > 审批（appointment-write）> decision > 低风险确认；同级 FIFO", () => {
  const pending = {
    low1: payload({ id: "low1" }),
    high: payload({ id: "high", risk: "high" }),
    decision: payload({ id: "decision" }, { kind: "choice", cardKind: "proposal", options: [{ id: "a", label: "A" }] }),
    approval: payload({ id: "approval" }, { kind: "confirm", cardKind: "appointment-write" }),
    low2: payload({ id: "low2" }),
  };
  assert.deepEqual(orderedDecisionIds(pending, ["low1", "high", "decision", "approval", "low2"]), [
    "high",
    "approval",
    "decision",
    "low1",
    "low2",
  ]);
  assert.equal(decisionPriority(pending.high), 0);
  assert.equal(decisionPriority(pending.approval), 1);
  assert.equal(decisionPriority(pending.decision), 2);
  assert.equal(decisionPriority(pending.low1), 3);
});

test("上下文：来源/标题/预览/选项/唯一推荐/可作答；缺选项不可作答", () => {
  const view = decisionView(
    payload(
      { judgeNotice: "代批失败，回落客户" },
      {
        kind: "choice",
        title: "材料性选择",
        preview: "preview",
        detail: "detail",
        cardKind: "decision",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B", recommended: true },
        ],
      },
    ),
  );
  assert.equal(view.sourceRoleId, "rapporteur");
  assert.equal(view.title, "材料性选择");
  assert.equal(view.preview, "preview");
  assert.equal(view.detail, "detail");
  assert.equal(view.recommendedId, "b");
  assert.equal(view.answerable, true);
  assert.equal(view.judgeNotice, "代批失败，回落客户");
  assert.deepEqual(view.options.map((option) => option.id), ["a", "b"]);
  const empty = decisionView(payload({}, { kind: "choice", title: "空", cardKind: "decision", options: [] }));
  assert.equal(empty.answerable, false);
});

test("破坏性/审批卡需要二次确认；普通确认不需要", () => {
  assert.equal(isDestructiveDecision(payload({}, { kind: "confirm", cardKind: "appointment-write" })), true);
  assert.equal(isDestructiveDecision(payload({ risk: "high" })), true);
  assert.equal(isDestructiveDecision(payload()), false);
});

test("待办/队列：稍后处理不参与自动弹出，但仍在 pending 计数", () => {
  const pending = {
    a: payload({ id: "a" }),
    b: payload({ id: "b" }),
    c: payload({ id: "c" }),
  };
  assert.equal(nextDecisionId(pending, [], ["a", "b", "c"]), "a");
  assert.equal(nextDecisionId(pending, ["a"], ["a", "b", "c"]), "b");
  assert.equal(nextDecisionId(pending, ["a", "b"], ["a", "b", "c"], "c"), null);
  assert.equal(pendingMoreCount(pending, "a"), 2);
  assert.equal(pendingMoreCount(pending, null), 3);
});
