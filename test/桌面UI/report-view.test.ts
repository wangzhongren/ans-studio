// test/桌面UI/report-view.test.ts
// Phase 4B 纯逻辑：报告身份/去重、声明/来源文案、摘要预览、flags、持久化状态矩阵、
// 交付批次事实、安全显示副本、历史投影摘要。

import test from "node:test";
import assert from "node:assert/strict";
import {
  deliveryBatchFacts,
  deliveryBatchTitle,
  historyProjectionText,
  metadataLabel,
  persistenceView,
  reportDeclaration,
  reportFlags,
  reportIdentity,
  reportOriginLabel,
  reportPreview,
  reportVersionSupported,
  safeCopyFlags,
  safeCopyText,
  sortHistoryReports,
  textFlags,
} from "../../app/renderer/src/chat/report-view.ts";

const report = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  reportId: "r1",
  source: { roleId: "A", runtime: "pi", turnId: "t1" },
  origin: "submitted-report",
  status: "completed",
  summary: { text: "摘要", redacted: false, truncated: false },
  evidence: [],
  ...extra,
});

test("报告身份：reportId+来源角色/引擎；live 无 id 按来源轮次+序号", () => {
  assert.equal(
    reportIdentity(report()),
    JSON.stringify(["A", "pi", "r1"]),
  );
  assert.equal(
    reportIdentity({ source: { roleId: "B", turnId: "t9" } }, 3),
    JSON.stringify(["live", "B", "t9", 3]),
  );
});

test("声明/来源：submitted/terminal/unknown 逐字；版本不支持", () => {
  assert.equal(reportDeclaration(report()), "报告声明：已完成");
  assert.equal(
    reportDeclaration(report({ origin: "terminal-fallback", status: "aborted" })),
    "系统按终态记录：已中止",
  );
  assert.equal(reportDeclaration(report({ origin: undefined, status: "mystery" })), "来源未确认：未知状态");
  assert.equal(reportOriginLabel("submitted-report"), "正式回交");
  assert.equal(reportOriginLabel("terminal-fallback"), "终态记录");
  assert.equal(reportOriginLabel(undefined), "来源未确认");
  assert.equal(reportVersionSupported(report()), true);
  assert.equal(reportVersionSupported(report({ version: 2 })), false);
  assert.equal(reportVersionSupported({ reportId: "", version: 9 }), true);
});

test("预览 180 字/4 行；flags 含净化/截断/证据省略", () => {
  const full = "🙂".repeat(200) + "\n尾行1\n尾行2\n尾行3\n尾行4";
  const preview = reportPreview(full);
  assert.equal(Array.from(preview).length <= 181, true);
  assert.equal(preview.split("\n").length <= 4, true);
  assert.equal(full.startsWith(preview.split("\n")[0]), true);
  assert.equal(textFlags({ redacted: true, truncated: true }), "已净化 · 已截断");
  assert.equal(textFlags(null), "");
  const flags = reportFlags({
    summary: { redacted: true, truncated: true },
    evidence: [{ redacted: true }, { truncated: true }],
    evidenceOmitted: 2,
  });
  assert.ok(flags.includes("已净化"));
  assert.ok(flags.includes("已截断"));
  assert.ok(flags.includes("部分证据显示已截断"));
  assert.ok(flags.includes("部分证据已净化"));
  assert.ok(flags.includes("另有 2 条证据因预算省略"));
});

test("持久化状态矩阵：saved/failed/disabled/expired/unknown/conflict；重试仅 failed+能力", () => {
  assert.deepEqual(persistenceView({ state: "saved" }, false), {
    text: "报告已保存",
    kind: "ok",
    retry: false,
  });
  assert.equal(persistenceView({ state: "already-saved" }, true).text, "接收历史已保存");
  assert.equal(persistenceView({ state: "pending" }, false).text, "正在保存报告…");
  const failed = persistenceView({ state: "failed", retryAvailable: true }, false);
  assert.ok(failed.text.includes("报告尚未保存"));
  assert.equal(failed.kind, "err");
  assert.equal(failed.retry, true);
  assert.equal(persistenceView({ state: "failed", retryAvailable: false }, false).retry, false);
  assert.equal(persistenceView({ state: "disabled" }, false).text, "仅本次会话可见，未启用历史保存。");
  assert.equal(persistenceView({ state: "unknown-live" }, false).kind, "muted");
  assert.ok(persistenceView({ state: "expired" }, false).text.includes("已失效"));
  assert.equal(persistenceView({ state: "expired" }, false).retry, false);
  assert.ok(
    persistenceView({ state: "failed", code: "CONFLICT" }, false).text.includes("冲突"),
  );
  assert.ok(
    persistenceView({ history: "failed", retryHistoryAvailable: true, code: "SNAPSHOT_EXPIRED" }, true)
      .text.includes("已失效"),
  );
  assert.equal(persistenceView(null, false).text, "报告保存状态未确认。");
});

test("交付批次事实：saved/failed/未回执；标题逐字不表示全部收齐", () => {
  assert.equal(deliveryBatchTitle(2), "回交投递 · 本批 2 份（不表示全部收齐）");
  const saved = deliveryBatchFacts(
    { version: 1, attemptId: "a1", inputSaved: true, history: "saved", outcome: "completed" },
    null,
  );
  assert.deepEqual(
    [saved.history, saved.input, saved.outcome],
    ["已保存", "已保存", "已完成"],
  );
  const failed = deliveryBatchFacts(
    { version: 1, attemptId: "a1", inputSaved: false, history: "failed", outcome: "failed", retryHistoryAvailable: true },
    { history: "failed", retryHistoryAvailable: true },
  );
  assert.ok(failed.history.includes("未保存"));
  assert.equal(failed.input, "尚未保存");
  assert.equal(failed.outcome, "失败");
  const none = deliveryBatchFacts(null, null);
  assert.deepEqual([none.history, none.input, none.outcome], ["未确认", "未确认", "未确认"]);
  const started = deliveryBatchFacts(
    { version: 1, attemptId: "a2", inputSaved: false, providerMayHaveStarted: true },
    null,
  );
  assert.equal(started.outcome, "可能已开始，结果未确认");
});

test("安全显示副本：只认 trusted-handback-display；flags 逐字", () => {
  const flags = safeCopyFlags({ redacted: true, truncated: true, summaryTruncated: true });
  assert.ok(flags.includes("此处未记录完整模型输入"));
  assert.ok(flags.includes("已净化"));
  assert.ok(flags.includes("显示副本已截断"));
  assert.ok(flags.includes("摘要已截断"));
  assert.equal(
    safeCopyText(
      { version: 1, source: "trusted-handback-display", modelInputRecorded: false },
      "安全副本",
    ),
    "安全副本",
  );
  assert.ok(
    safeCopyText({ version: 1, source: "other" }, "原文").includes("不能显示完整模型输入"),
  );
});

test("历史报告排序：全部时间可解析⇒旧→新；含非法时间⇒保持线上序", () => {
  const newer = report({ reportId: "n", at: "2026-10-15T08:46:00Z" });
  const older = report({ reportId: "o", at: "2026-10-15T08:05:00Z" });
  const sorted = sortHistoryReports([newer, older]) as Array<{ reportId: string }>;
  assert.deepEqual(sorted.map((item) => item.reportId), ["o", "n"]);
  const unknown = sortHistoryReports([{ ...newer, at: "invalid" }, older]) as Array<{ reportId: string }>;
  assert.deepEqual(unknown.map((item) => item.reportId), ["n", "o"]);
  const same = sortHistoryReports([{ ...newer, at: "2026-10-15T08:00:00Z" }, { ...older, at: "2026-10-15T08:00:00Z" }]) as Array<{ reportId: string }>;
  assert.deepEqual(same.map((item) => item.reportId), ["n", "o"]);
});

test("历史投影摘要：报告记录/省略/无效/跳过分开，不泄露 reportId", () => {
  assert.equal(metadataLabel(["timestamp", "anchor-token", "oversize-identity"]), "原时间未保存或不可展示；原定位标记未提供；原调用身份超出展示预算");
  assert.equal(metadataLabel("x"), "");
  const text = historyProjectionText({
    reportErrors: [{ reportId: "secret-report", code: "INVALID" }],
    projection: { omittedEntries: 12, invalidEntries: 2, truncated: true },
    skipped: 3,
  });
  assert.ok(text.includes("报告记录不可读（1 条）"));
  assert.ok(text.includes("省略前 12"));
  assert.ok(text.includes("无效投影条目 2"));
  assert.ok(text.includes("原解析跳过 3"));
  assert.ok(!text.includes("secret-report"));
  assert.equal(historyProjectionText({}), "");
});
