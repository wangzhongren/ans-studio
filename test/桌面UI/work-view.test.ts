// test/桌面UI/work-view.test.ts
// Phase 4A 纯逻辑：待处理计数/定位项、队列分组（进行中/第 N 位）、
// 最近回交去重/排序、tab 角标（工作=待处理；角色=当前工作+排队）、空态。

import test from "node:test";
import assert from "node:assert/strict";
import {
  badgeText,
  pendingCountFor,
  pendingViews,
  queueGroups,
  queueTimeText,
  recentHandbacks,
  reportDeclaration,
  roleBadgeAria,
  roleBadgeCount,
  workBadgeAria,
  workBadgeCount,
} from "../../app/renderer/src/chat/work-view.ts";
import type { ChatRow } from "../../app/renderer/src/chat/types.ts";

const pendingOperator: Record<string, Record<string, unknown>> = {
  "flow-choice": {
    id: "flow-choice",
    roleId: "A",
    request: { kind: "choice", title: "选择查看方式" },
  },
  "flow-confirm": {
    id: "flow-confirm",
    roleId: "A",
    request: { kind: "confirm", title: "写盘确认" },
  },
  "other-role": {
    id: "other-role",
    roleId: "B",
    request: { kind: "confirm", title: "B 的请求" },
  },
};

test("待处理：按角色过滤、类型文案、定位项就是请求 id", () => {
  const views = pendingViews(pendingOperator, "A");
  assert.deepEqual(
    views.map((item) => [item.id, item.kindLabel, item.title, item.requestId]),
    [
      ["flow-choice", "待选择", "选择查看方式", "flow-choice"],
      ["flow-confirm", "待确认", "写盘确认", "flow-confirm"],
    ],
  );
  assert.equal(pendingCountFor(pendingOperator, "A"), 2);
  assert.equal(pendingCountFor(pendingOperator, "B"), 1);
  assert.equal(pendingCountFor(pendingOperator, null), 0);
  assert.deepEqual(pendingViews(pendingOperator, "C"), []);
  const noTitle = pendingViews({ x: { roleId: "A", request: {} } }, "A");
  assert.equal(noTitle[0].title, "交互请求");
  assert.equal(noTitle[0].kindLabel, "待确认");
});

test("队列分组：进行中在前 + 排队 1..N；来源标签与撤回资格沿用 3B 口径", () => {
  const groups = queueGroups(
    [
      { id: "msg-1", kind: "message", summary: "客户消息", full: "客户消息全文", at: "2026-10-13T10:01:00Z" },
      { id: "dispatch", kind: "dispatch", sourceRoleId: "B", summary: "派发任务", full: "", at: "" },
      { id: "handback", kind: "handback", sourceRoleId: "C", summary: "回交报告", full: "", at: "" },
    ],
    { id: "running", kind: "message", summary: "正在处理", full: "", at: "" },
  );
  assert.equal(groups.total, 4);
  assert.equal(groups.running.length, 1);
  assert.equal(groups.running[0].position, "进行中");
  assert.equal(groups.running[0].canWithdraw, false);
  assert.deepEqual(groups.queued.map((item) => item.position), ["1", "2", "3"]);
  assert.deepEqual(groups.queued.map((item) => item.sourceLabel), [
    "客户消息",
    "派发 · 来自 B",
    "回交 · 来自 C",
  ]);
  assert.deepEqual(groups.queued.map((item) => item.canWithdraw), [true, false, false]);
  assert.equal(queueGroups([], null).total, 0);
  assert.equal(queueGroups(null, null).total, 0);
});

test("队列摘要截断与时间显示：长文≤160+省略号；坏时间不假装有时间", () => {
  const long = "客".repeat(200);
  const groups = queueGroups([{ id: "x", kind: "message", summary: long }], null);
  assert.equal(Array.from(groups.queued[0].text).length, 161);
  assert.ok(groups.queued[0].text.endsWith("…"));
  assert.equal(queueTimeText(""), "");
  assert.equal(queueTimeText("not-a-date"), "");
  assert.notEqual(queueTimeText("2026-10-13T10:01:00Z"), "");
});

test("角标：工作=待处理数；角色=当前工作(busy=1)+排队；99+ 封顶", () => {
  assert.equal(workBadgeCount(3), 3);
  assert.equal(workBadgeCount(-1), 0);
  assert.equal(roleBadgeCount(true, 2), 3);
  assert.equal(roleBadgeCount(false, 3), 3);
  assert.equal(roleBadgeCount(true, 0), 1);
  assert.equal(roleBadgeCount(false, 0), 0);
  assert.equal(badgeText(0), "0");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
  assert.equal(workBadgeAria(2), "工作概览，2 项待处理");
  assert.equal(roleBadgeAria(4), "角色资料，4 项进行中或排队");
});

test("回交声明逐字：报告声明/系统终态/来源未确认 × 状态", () => {
  assert.equal(
    reportDeclaration({ origin: "submitted-report", status: "completed" }),
    "报告声明：已完成",
  );
  assert.equal(
    reportDeclaration({ origin: "terminal-fallback", status: "aborted" }),
    "系统按终态记录：已中止",
  );
  assert.equal(reportDeclaration({ status: "weird" }), "来源未确认：未知状态");
});

function handbackRow(report: Record<string, unknown>, id = "row"): ChatRow {
  return {
    id,
    kind: "handback",
    data: { report },
    height: 100,
    replay: false,
  };
}

test("最近回交：只列 handback 行；同 reportId 去重；保持行序", () => {
  const reportOne = {
    version: 1,
    reportId: "report-one",
    origin: "submitted-report",
    status: "completed",
    source: { roleId: "A", runtime: "pi", turnId: "t1" },
    summary: { text: "第一份报告摘要", redacted: true, truncated: false },
  };
  const reportTwo = {
    version: 1,
    reportId: "report-two",
    origin: "terminal-fallback",
    status: "aborted",
    source: { roleId: "A", runtime: "pi", turnId: "t2" },
    summary: { text: "第二份报告摘要", redacted: false, truncated: true },
  };
  const rows: ChatRow[] = [
    handbackRow(reportOne, "r1"),
    { id: "r2", kind: "assistant", data: { text: "普通聊天" }, height: 40 },
    handbackRow(reportOne, "r3"),
    handbackRow(reportTwo, "r4"),
  ];
  const views = recentHandbacks(rows);
  assert.equal(views.length, 2);
  assert.equal(views[0].declaration, "报告声明：已完成");
  assert.equal(views[0].summary, "第一份报告摘要");
  assert.equal(views[0].flags, "已净化");
  assert.equal(views[1].declaration, "系统按终态记录：已中止");
  assert.equal(views[1].flags, "已截断");
  assert.deepEqual(recentHandbacks([]), []);
  assert.deepEqual(recentHandbacks(null), []);
});

test("最近回交：摘要最多 120 字符；无 report 的 handback 不造报告", () => {
  const report = {
    reportId: "long",
    origin: "submitted-report",
    status: "completed",
    summary: { text: "字".repeat(200) },
  };
  const views = recentHandbacks([handbackRow(report)]);
  assert.equal(Array.from(views[0].summary).length, 120);
  const noReport: ChatRow = { id: "x", kind: "handback", data: {}, height: 40 };
  assert.deepEqual(recentHandbacks([noReport]), []);
});
