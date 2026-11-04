// test/桌面UI/run-change-view.test.ts
// 2026-11-04 U1（trunk-amendment-model，Q6 裁决）：低层 run-change 模块保留为内部/回执用途；
// 客户侧 UI 入口已由「版本变更」/「主干升级」取代，按钮级用例删除（不弱化回执/内部判据用例）。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pinnedRunsOf,
  runChangeReplyMessage,
} from "../../app/renderer/src/chat/run-change-view.ts";
import type { ActiveRunSummary } from "../../app/renderer/src/chat/types.ts";

const pinned = (flowId: string, runId = `run-${flowId}`): ActiveRunSummary => ({
  runId,
  flowId,
  state: "pinned",
  pinnedAt: "2026-10-31T00:00:00.000Z",
});

test("pinnedRunsOf 只取 pinned（保持顺序）", () => {
  const runs: ActiveRunSummary[] = [
    { runId: "run-a", flowId: "a", state: "draft" },
    pinned("b"),
    { runId: "run-c", flowId: "c", state: "cancelled" as unknown as "pinned" },
    pinned("d"),
  ];
  assert.deepEqual(pinnedRunsOf(runs).map((run) => run.flowId), ["b", "d"]);
  assert.deepEqual(pinnedRunsOf(undefined), []);
});

test("低层显式调用回执 → 人话：presented/answered 三模式/declined/失败", () => {
  assert.match(runChangeReplyMessage({ ok: true, status: "presented" }, "zh-CN"), /已呈现/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "continue-frozen" }, "zh-CN"), /继续冻结/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "stop-and-restart" }, "zh-CN"), /新 run 草稿/);
  assert.match(runChangeReplyMessage({ ok: true, status: "answered", mode: "stop" }, "zh-CN"), /已停止/);
  assert.match(runChangeReplyMessage({ ok: true, status: "declined" }, "zh-CN"), /未获选择/);
  assert.match(runChangeReplyMessage({ ok: false, error: "没有可呈现 run-change 卡的会话" }, "zh-CN"), /无法发起 run-change/);
  assert.match(runChangeReplyMessage({ ok: false, error: "no pinned run" }, "en-US"), /Cannot start run-change/);
});
