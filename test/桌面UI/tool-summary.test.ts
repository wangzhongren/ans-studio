// test/桌面UI/tool-summary.test.ts
// Phase 5A 迁移：旧 tool-rows.test.ts 的工具相位合并/摘要/状态文案纯逻辑。
// 新实现 = app/renderer/src/chat/tool-summary.ts；不依赖旧 tool-rows.js / DOM。

import test from "node:test";
import assert from "node:assert/strict";
import {
  activityPhaseLabel,
  callSummary,
  foldSummaryText,
  mergePhases,
  phaseRowView,
  shortTime,
} from "../../app/renderer/src/chat/tool-summary.ts";
import type { ActivityItem } from "../../app/renderer/src/chat/types.ts";

const item = (extra: Partial<ActivityItem> = {}): ActivityItem =>
  ({
    toolName: "read_file",
    target: "a.md",
    status: "call",
    statusText: "",
    summary: "",
    ...extra,
  }) as ActivityItem;

test("S1：mergePhases——同一 turn+callId 两相位并一行（首相位定位，相位按到达序）", () => {
  const rows = mergePhases([
    item({ turnId: "t1", callId: "c1", status: "call", target: "a.md" }),
    item({ turnId: "t1", callId: "c1", status: "completed", target: "a.md" }),
    item({ turnId: "t1", callId: "c2", status: "call", target: "b.md" }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].phases, [0, 1]);
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].items.length, 2);
  assert.equal(rows[1].callId, "c2");
});

test("S1：不同 turn 的同 callId、无 callId 的事件都不合并（计数不猜）", () => {
  const rows = mergePhases([
    item({ turnId: "t1", callId: "same" }),
    item({ turnId: "t2", callId: "same" }),
    item({ turnId: "", callId: "" }),
    item({ turnId: "", callId: "" }),
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.phases), [[0], [1], [2], [3]]);
});

test("phaseRowView：终态优先、空目标回退首相位、状态文案同源", () => {
  const [row] = mergePhases([
    item({ turnId: "t", callId: "c", toolName: "run_shell", target: "npm test", status: "call" }),
    item({ turnId: "t", callId: "c", toolName: "run_shell", target: "", status: "exited-nonzero", statusText: "已执行完成（退出码 7）" }),
  ]);
  const view = phaseRowView(row);
  assert.equal(view.status, "exited-nonzero");
  assert.equal(view.target, "npm test");
  assert.equal(view.statusText, "已执行完成（退出码 7）");
});

test("activityPhaseLabel：发起/拒绝/失败/超时/非零/完成/返回/未知/已记录逐字", () => {
  assert.equal(activityPhaseLabel(item({ status: "running" })), "调用发起");
  assert.equal(activityPhaseLabel(item({ status: "call" })), "调用发起");
  assert.equal(activityPhaseLabel(item({ status: "start" })), "调用发起");
  assert.equal(activityPhaseLabel(item({ status: "denied" })), "已拒绝");
  assert.equal(activityPhaseLabel(item({ status: "failed" })), "执行失败");
  assert.equal(activityPhaseLabel(item({ status: "timed-out" })), "超时终止");
  assert.equal(
    activityPhaseLabel(item({ status: "exited-nonzero", statusText: "已执行完成（退出码 1）" })),
    "已执行完成（退出码 1）",
  );
  assert.equal(activityPhaseLabel(item({ status: "exited-nonzero", statusText: "" })), "已执行完成");
  assert.equal(activityPhaseLabel(item({ status: "completed" })), "执行完成");
  assert.equal(activityPhaseLabel(item({ status: "returned" })), "工具返回");
  assert.equal(activityPhaseLabel(item({ status: "unknown" })), "状态未记录");
  assert.equal(activityPhaseLabel(item({ status: "recorded", statusText: "" })), "已记录");
  assert.equal(activityPhaseLabel(item({ status: "other", statusText: "" })), "状态未记录");
  assert.equal(activityPhaseLabel(item({ status: "other", statusText: "自定义" })), "自定义");
});

test("S4/折叠口径：callSummary——N 个调用、工具首现序 ×k、未放行/失败拆分、未知如实", () => {
  const summary = callSummary([
    item({ turnId: "t", callId: "c1", toolName: "read_file", status: "call" }),
    item({ turnId: "t", callId: "c1", toolName: "read_file", status: "completed" }),
    item({ turnId: "t", callId: "c2", toolName: "run_shell", status: "call" }),
    item({ turnId: "t", callId: "c2", toolName: "run_shell", status: "denied" }),
    item({ turnId: "t", callId: "c3", toolName: "read_file", status: "failed" }),
    item({ turnId: "t", callId: "c4", toolName: "search", status: "unknown" }),
  ]);
  assert.equal(summary.calls, 4);
  assert.equal(summary.denied, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.unknown, true);
  assert.deepEqual(summary.tools, [
    { name: "read_file", count: 2 },
    { name: "run_shell", count: 1 },
    { name: "search", count: 1 },
  ]);
});

test("折叠文案：未放行优先于失败（同一次调用不双计），未知追加在末尾", () => {
  const summary = callSummary([
    item({ turnId: "t", callId: "c1", toolName: "run_shell", status: "failed" }),
    item({ turnId: "t", callId: "c1", toolName: "run_shell", status: "denied" }),
    item({ turnId: "t", callId: "c2", toolName: "read_file", status: "completed" }),
    item({ turnId: "t", callId: "c3", toolName: "read_file", status: "unknown" }),
  ]);
  assert.equal(summary.denied, 1);
  assert.equal(summary.failed, 0);
  assert.equal(
    foldSummaryText(summary),
    "本轮 3 个调用：run_shell / read_file ×2 · 含 1 条未放行 · 含状态未记录",
  );
  assert.equal(foldSummaryText({ calls: 0, denied: 0, failed: 0, unknown: false, tools: [] }), "本轮 0 个调用");
});

test("G-4/V2-MCP：新工具名与 mcp__server__tool 零白名单/零特判，按名计数", () => {
  const summary = callSummary([
    item({ turnId: "t", callId: "a", toolName: "install_skill", status: "completed" }),
    item({ turnId: "t", callId: "b", toolName: "mcp__github__create_issue", status: "completed" }),
    item({ turnId: "t", callId: "c", toolName: "mcp__github__create_issue", status: "failed" }),
  ]);
  assert.deepEqual(summary.tools, [
    { name: "install_skill", count: 1 },
    { name: "mcp__github__create_issue", count: 2 },
  ]);
  assert.equal(summary.failed, 1);
  assert.equal(foldSummaryText(summary).includes("mcp__github__create_issue ×2"), true);
});

test("无工具名回退「工具」；空数组安全；坏项不抛", () => {
  const rows = mergePhases([
    { status: "call" } as ActivityItem,
    null as unknown as ActivityItem,
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].toolName, "工具");
  assert.equal(mergePhases([]).length, 0);
  assert.equal(callSummary([]).calls, 0);
});

test("shortTime：可解析输出 HH:mm；空/坏时间不发明时间", () => {
  assert.match(shortTime("2026-10-21T09:05:00Z"), /^\d{2}:\d{2}$/);
  assert.equal(shortTime(""), "");
  assert.equal(shortTime("not-a-time"), "");
  assert.equal(shortTime(undefined as unknown as string), "");
});
