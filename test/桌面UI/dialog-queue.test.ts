// test/桌面UI/dialog-queue.test.ts
// E 批：一次一卡、优先级、稍后处理不代答、待办计数（纯队列语义）。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextDecisionId,
  orderedDecisionIds,
  pendingMoreCount,
} from "../../app/renderer/src/chat/decision-dialog.ts";

const payload = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  roleId: "rapporteur",
  request: { kind: "confirm", title: id, ...extra },
});

test("一次一卡 + 优先级：高风险 > 审批 > decision > 低风险确认；同级 FIFO", () => {
  const pending = {
    low1: payload("low1"),
    high: payload("high", { risk: "high" }),
    approval: payload("approval", { cardKind: "appointment-write" }),
    decision: payload("decision", { kind: "choice", cardKind: "proposal", options: [{ id: "a", label: "A" }] }),
    low2: payload("low2"),
  };
  const order = ["low1", "high", "approval", "decision", "low2"];
  assert.deepEqual(orderedDecisionIds(pending, order), ["high", "approval", "decision", "low1", "low2"]);
  assert.equal(nextDecisionId(pending, [], order), "high");
});

test("稍后处理：deferred 不自动弹出，但仍在待办计数；处理完不复活", () => {
  const pending = { a: payload("a"), b: payload("b"), c: payload("c") };
  const order = ["a", "b", "c"];
  assert.equal(nextDecisionId(pending, ["a"], order), "b");
  assert.equal(nextDecisionId(pending, ["a", "b"], order, "c"), null);
  assert.equal(pendingMoreCount(pending, "a"), 2);
  assert.equal(pendingMoreCount(pending, null), 3);
  assert.equal(nextDecisionId({ ...pending, b: undefined } as never, ["a"], order, "c"), null);
});

test("关闭/稍后不产生回答：队列层没有 decision/result 字段或默认选择", () => {
  const pending = { a: payload("a") };
  const order = ["a"];
  assert.equal(nextDecisionId(pending, ["a"], order), null);
  assert.equal(pendingMoreCount(pending, "a"), 0);
});
