// test/桌面UI/flow-status.test.ts
// 流程状态面板纯逻辑（2026-10-25）：七态/四 kind、进度、current、过滤、错误隔离、轮询与徽标。

import test from "node:test";
import assert from "node:assert/strict";
import {
  countFlowSteps,
  flowBadgeView,
  flowCurrentSteps,
  flowStepKindLabel,
  flowStepStatusView,
  flowStatusView,
  flowVisibleSteps,
  loadFlowStatus,
  normalizeFlowStepStatus,
  startFlowStatusPolling,
} from "../../app/renderer/src/chat/flow-status.ts";
import { useFlowStatusStore } from "../../app/renderer/src/stores/flow-status-store.ts";
import type { FlowStatusStep } from "../../app/renderer/src/chat/flow-status.ts";

const STEPS: FlowStatusStep[] = [
  { id: "a", title: "准备", kind: "artifact", owner: "convener", status: "done" },
  { id: "b", title: "客户决定", kind: "customer-decision", owner: "convener", status: "pending" },
  { id: "c", title: "派发一", kind: "dispatch", owner: "crew", status: "dispatched" },
  { id: "d", title: "派发二", kind: "dispatch", owner: "dev", status: "delivered" },
  { id: "e", title: "失败步骤", kind: "dispatch", owner: "dev", status: "failed" },
  { id: "f", title: "阻塞步骤", kind: "dispatch", owner: "dev", status: "blocked" },
  { id: "g", title: "被替代", kind: "dispatch", owner: "dev", status: "superseded" },
  { id: "h", title: "验收", kind: "acceptance", owner: "app", status: "pending" },
];
const COUNTS = countFlowSteps(STEPS);
const FLOW = {
  flowId: "wukong-2d",
  revision: "abc",
  steps: STEPS,
  counts: COUNTS,
  current: ["d", "c"],
  updatedAt: "2026-10-25T06:30:00.000Z",
};

test("七态映射：label/className；未知状态保守 unknown", () => {
  assert.equal(flowStepStatusView("pending").label, "待处理");
  assert.equal(flowStepStatusView("dispatched").className, "is-dispatched");
  assert.equal(flowStepStatusView("delivered").className, "is-delivered");
  assert.equal(flowStepStatusView("done").className, "is-done");
  assert.equal(flowStepStatusView("failed").className, "is-failed");
  assert.equal(flowStepStatusView("blocked").className, "is-blocked");
  assert.equal(flowStepStatusView("superseded").className, "is-superseded");
  assert.equal(flowStepStatusView("unknown").label, "未知状态");
  assert.equal(normalizeFlowStepStatus("bogus"), "unknown");
});

test("kind 映射：YAML/下划线/camelCase 的 customer-decision 都到同一 key", () => {
  assert.equal(flowStepKindLabel("artifact"), "产物");
  assert.equal(flowStepKindLabel("dispatch"), "派工");
  assert.equal(flowStepKindLabel("customer-decision"), "客户决定");
  assert.equal(flowStepKindLabel("customer_decision"), "客户决定");
  assert.equal(flowStepKindLabel("customerDecision"), "客户决定");
  assert.equal(flowStepKindLabel("acceptance"), "验收");
  assert.equal(flowStepKindLabel("custom-kind"), "custom-kind");
});

test("计数与进度：total=steps.length，done/total 文本与百分比", () => {
  assert.equal(COUNTS.total, 8);
  assert.equal(COUNTS.done, 1);
  assert.equal(COUNTS.dispatched, 1);
  assert.equal(COUNTS.delivered, 1);
  assert.equal(COUNTS.pending, 2);
  assert.equal(COUNTS.failed, 1);
  assert.equal(COUNTS.blocked, 1);
  assert.equal(COUNTS.superseded, 1);
  const view = flowStatusView(FLOW);
  assert.ok(view);
  if (!view) return;
  assert.equal(view.progressText, "1/8 步");
  assert.equal(view.progressPercent, 12.5);
  assert.equal(view.updatedAtText.length > 0, true);
});

test("current 多步按 YAML 顺序；空 current 返回空数组", () => {
  assert.deepEqual(
    flowCurrentSteps(STEPS, ["d", "c"]).map((step) => step.id),
    ["c", "d"],
  );
  assert.deepEqual(flowCurrentSteps(STEPS, []), []);
  assert.deepEqual(flowCurrentSteps(STEPS, ["missing"]), []);
  const view = flowStatusView({ ...FLOW, current: [] });
  assert.ok(view);
  if (view) assert.equal(view.currentSteps.length, 0);
});

test("默认过滤：只显示未完成 + current；展开显示全部；done current 保留", () => {
  const visible = flowVisibleSteps(STEPS, ["d", "c"], false).map((step) => step.id);
  assert.deepEqual(visible, ["b", "c", "d", "e", "f", "g", "h"]);
  const expanded = flowVisibleSteps(STEPS, ["d", "c"], true).map((step) => step.id);
  assert.deepEqual(expanded, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  const withDoneCurrent = flowVisibleSteps(STEPS, ["a"], false).map((step) => step.id);
  assert.deepEqual(withDoneCurrent, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  const view = flowStatusView(FLOW);
  assert.ok(view);
  if (view) {
    assert.equal(view.visibleSteps.length, 7);
    assert.equal(view.hasDoneSteps, true);
    assert.equal(view.steps.length, 8);
  }
});

test("loadFlowStatus：flows + errors 同时返回；空列表 vs unavailable vs error", async () => {
  const bridge = {
    getFlowStatus: async () => ({
      ok: true,
      flows: [FLOW],
      errors: [{ file: "docs/flows/bad.yaml", error: "bad yaml" }],
    }),
  };
  const model = await loadFlowStatus(bridge, "p", "zh-CN");
  assert.equal(model.kind, "ready");
  if (model.kind === "ready") {
    assert.equal(model.flows.length, 1);
    assert.equal(model.done, 1);
    assert.equal(model.total, 8);
    assert.deepEqual(model.errors, [
      { file: "docs/flows/bad.yaml", detail: "bad yaml" },
    ]);
  }

  const empty = await loadFlowStatus(
    { getFlowStatus: async () => ({ ok: true, flows: [], errors: [] }) },
    "p",
    "zh-CN",
  );
  assert.equal(empty.kind, "ready");
  if (empty.kind === "ready") assert.equal(empty.flows.length, 0);

  const unavailable = await loadFlowStatus(null, "p");
  assert.equal(unavailable.kind, "unavailable");

  const failed = await loadFlowStatus(
    { getFlowStatus: async () => ({ ok: false, error: "boom" }) },
    "p",
    "zh-CN",
  );
  assert.equal(failed.kind, "error");
  if (failed.kind === "error") assert.equal(failed.detail, "boom");

  const thrown = await loadFlowStatus(
    {
      getFlowStatus: async () => {
        throw new Error("offline");
      },
    },
    "p",
    "zh-CN",
  );
  assert.equal(thrown.kind, "error");
  if (thrown.kind === "error") assert.equal(thrown.detail, "offline");
});

test("头部徽标：聚合 done/total；title 含当前步骤与更新时间；空/不可用隐藏", async () => {
  const model = await loadFlowStatus(
    { getFlowStatus: async () => ({ ok: true, flows: [FLOW], errors: [] }) },
    "p",
    "zh-CN",
  );
  const badge = flowBadgeView(model);
  assert.equal(badge.visible, true);
  assert.equal(badge.text, "1/8");
  assert.match(badge.title, /wukong-2d 当前步骤/);
  assert.match(badge.title, /派发一/);
  assert.match(badge.title, /更新时间/);

  const empty = await loadFlowStatus(
    { getFlowStatus: async () => ({ ok: true, flows: [], errors: [] }) },
    "p",
    "zh-CN",
  );
  assert.equal(flowBadgeView(empty).visible, false);
  assert.equal(flowBadgeView({ kind: "unavailable" }).visible, false);
  assert.equal(flowBadgeView({ kind: "error", detail: "x" }).visible, false);
  assert.equal(flowBadgeView({ kind: "loading" }).visible, false);
});

test("轮询：5s/30s 立即拉一次、隐藏时跳过、恢复后拉取、卸载清理", () => {
  let loads = 0;
  let hidden = false;
  const scheduled: { handler: (() => void) | null; interval: number } = {
    handler: null,
    interval: 0,
  };
  let cleared: unknown = null;
  const stop = startFlowStatusPolling(
    () => {
      loads += 1;
    },
    5000,
    {
      isHidden: () => hidden,
      schedule: (handler, interval) => {
        scheduled.handler = handler;
        scheduled.interval = interval;
        return "flow-timer";
      },
      cancel: (id) => {
        cleared = id;
      },
    },
  );
  assert.equal(loads, 1);
  assert.equal(scheduled.interval, 5000);
  hidden = true;
  scheduled.handler?.();
  assert.equal(loads, 1);
  hidden = false;
  scheduled.handler?.();
  assert.equal(loads, 2);
  stop();
  assert.equal(cleared, "flow-timer");
});

test("轻量 store：徽标写入与隐藏", () => {
  useFlowStatusStore.getState().setBadge({
    visible: true,
    text: "12/19",
    title: "当前步骤：x",
  });
  assert.deepEqual(
    {
      visible: useFlowStatusStore.getState().visible,
      text: useFlowStatusStore.getState().text,
      title: useFlowStatusStore.getState().title,
    },
    { visible: true, text: "12/19", title: "当前步骤：x" },
  );
  useFlowStatusStore.getState().setBadge({ visible: false });
  assert.equal(useFlowStatusStore.getState().visible, false);
  assert.equal(useFlowStatusStore.getState().text, "");
});
