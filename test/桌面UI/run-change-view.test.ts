// test/桌面UI/run-change-view.test.ts
// 2026-10-31（run-change 触发缺陷）：显式入口「契约变更 · 重开 run」的纯视图逻辑——
// 无 pinned run/多 pinned/桥缺省 ⇒ 禁用并给原因；恰好一个 pinned ⇒ 可用；中英文案同 key。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pinnedRunsOf,
  runChangeButtonView,
  runChangeReplyMessage,
} from "../../app/renderer/src/chat/run-change-view.ts";
import type { ActiveRunSummary } from "../../app/renderer/src/chat/types.ts";

const pinned = (flowId: string, runId = `run-${flowId}`): ActiveRunSummary => ({
  runId,
  flowId,
  state: "pinned",
  pinnedAt: "2026-10-31T00:00:00.000Z",
});

test("无 pinned run ⇒ 禁用并给原因（中英）", () => {
  const zh = runChangeButtonView({ bridgeAvailable: true, runs: [{ ...pinned("a"), state: "draft" }, { ...pinned("b"), state: "draft" }] }, "zh-CN");
  assert.equal(zh.visible, true);
  assert.equal(zh.enabled, false);
  assert.equal(zh.label, "契约变更 · 重开 run");
  assert.match(zh.disabledReason ?? "", /没有已冻结/);
  const en = runChangeButtonView({ bridgeAvailable: true, runs: [] }, "en-US");
  assert.equal(en.enabled, false);
  assert.equal(en.label, "Contract change · restart run");
  assert.match(en.disabledReason ?? "", /no pinned run/i);
});

test("恰好一个 pinned run ⇒ 可用；多个 ⇒ 禁用并列出 flow", () => {
  const ok = runChangeButtonView({ bridgeAvailable: true, runs: [pinned("focus")] });
  assert.equal(ok.enabled, true);
  assert.equal(ok.disabledReason, undefined);
  assert.match(ok.title, /继续冻结|停止/);

  const many = runChangeButtonView({ bridgeAvailable: true, runs: [pinned("focus"), pinned("other")] }, "zh-CN");
  assert.equal(many.enabled, false);
  assert.match(many.disabledReason ?? "", /多个 pinned run/);
  assert.match(many.disabledReason ?? "", /focus/);
  assert.match(many.disabledReason ?? "", /other/);
});

test("桥缺省 / run 状态读取失败 ⇒ 禁用并如实说明", () => {
  const noBridge = runChangeButtonView({ bridgeAvailable: false, runs: [pinned("focus")] }, "zh-CN");
  assert.equal(noBridge.enabled, false);
  assert.match(noBridge.disabledReason ?? "", /桌面桥/);

  const unknown = runChangeButtonView({ bridgeAvailable: true, runs: [], runsError: "manifest.json JSON 非法" }, "zh-CN");
  assert.equal(unknown.enabled, false);
  assert.match(unknown.disabledReason ?? "", /manifest\.json/);
});

test("pinnedRunsOf 只取 pinned（保持顺序）", () => {
  const runs: ActiveRunSummary[] = [
    { runId: "run-a", flowId: "a", state: "draft" },
    pinned("b"),
    { runId: "run-c", flowId: "c", state: "cancelled" as unknown as "pinned" },
    pinned("d"),
  ];
  assert.deepEqual(pinnedRunsOf(runs).map((run) => run.flowId), ["b", "d"]);
});

test("显式入口回执 → 人话：presented/answered 三模式/declined/失败", () => {
  assert.match(runChangeReplyMessage({ ok: true, status: "presented" }, "zh-CN"), /已呈现/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "continue-frozen" }, "zh-CN"), /继续冻结/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "stop-and-restart" }, "zh-CN"), /新 run 草稿/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "stop" }, "zh-CN"), /已停止/);
  assert.match(runChangeReplyMessage({ ok: true, status: "declined" }, "zh-CN"), /未获选择/);
  assert.match(runChangeReplyMessage({ ok: false, error: "没有可呈现 run-change 卡的会话" }, "zh-CN"), /无法发起 run-change/);
  assert.match(runChangeReplyMessage({ ok: false, error: "no pinned run" }, "en-US"), /Cannot start run-change/);
});
