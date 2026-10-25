// test/桌面UI/client-projection.test.ts
// A3/A4 纯逻辑：事件层客户投影（GovernanceClientProjectionV1）校验、连续同指纹合并、
// assistant 时间透传。无 DOM。

import test from "node:test";
import assert from "node:assert/strict";
import {
  clientProjectionFrom,
  describeEvent,
  mergeClientProjectionData,
} from "../../app/renderer/src/chat/events.ts";
import {
  projectionStatusKey,
  projectionStatusText,
} from "../../app/renderer/src/chat/projection-view.ts";

const projection = {
  version: 1,
  kind: "governance-feedback",
  fingerprint: "f".repeat(64),
  sourceRole: { roleId: "verifier", displayName: "验收" },
  statusCode: "completed",
  statusText: "本轮已完成",
  flowIds: ["bookmark-manager-v1"],
  reportPath: "docs/acceptance/report-v1.md",
  governancePath: "docs/governance/verifier/v1.md",
  action: "report-ready",
};

test("客户投影：合法 V1 逐字段读取；可选字段缺省不伪造", () => {
  const view = clientProjectionFrom(projection);
  assert.ok(view);
  assert.equal(view!.fingerprint, projection.fingerprint);
  assert.deepEqual(view!.sourceRole, { roleId: "verifier", displayName: "验收" });
  assert.equal(view!.statusCode, "completed");
  assert.equal(view!.statusText, "本轮已完成");
  assert.deepEqual(view!.flowIds, ["bookmark-manager-v1"]);
  assert.equal(view!.reportPath, "docs/acceptance/report-v1.md");
  assert.equal(view!.governancePath, "docs/governance/verifier/v1.md");
  assert.equal(view!.action, "report-ready");

  const minimal = clientProjectionFrom({
    version: 1,
    kind: "governance-feedback",
    fingerprint: "abc",
    sourceRole: { roleId: "verifier" },
    statusCode: "internal-feedback",
    statusText: "",
    action: "await-lead-summary",
  });
  assert.ok(minimal);
  assert.deepEqual(minimal!.sourceRole, { roleId: "verifier", displayName: "" });
  assert.equal(minimal!.flowIds, undefined);
  assert.equal(minimal!.reportPath, undefined);
  assert.equal(minimal!.governancePath, undefined);
});

test("客户投影：版本/类型/指纹/来源/枚举越界一律拒绝（回退旧文本）", () => {
  assert.equal(clientProjectionFrom(null), null);
  assert.equal(clientProjectionFrom({}), null);
  assert.equal(clientProjectionFrom({ ...projection, version: 2 }), null);
  assert.equal(clientProjectionFrom({ ...projection, kind: "dispatch" }), null);
  assert.equal(clientProjectionFrom({ ...projection, fingerprint: "  " }), null);
  assert.equal(clientProjectionFrom({ ...projection, sourceRole: null }), null);
  assert.equal(clientProjectionFrom({ ...projection, sourceRole: { roleId: "" } }), null);
  assert.equal(clientProjectionFrom({ ...projection, statusCode: "done" }), null);
  assert.equal(clientProjectionFrom({ ...projection, action: "notify" }), null);
  // 非字符串 flowIds 逐项过滤；空数组按缺省处理。
  const filtered = clientProjectionFrom({
    ...projection,
    flowIds: ["flow-a", "", 3, "flow-b"],
  });
  assert.deepEqual(filtered!.flowIds, ["flow-a", "flow-b"]);
  assert.equal(clientProjectionFrom({ ...projection, flowIds: [] })!.flowIds, undefined);
});

test("投影状态本地化：六个 statusCode 逐字映射；未知/缺值回退原文", () => {
  assert.equal(projectionStatusText("completed", "原文"), "已完成");
  assert.equal(projectionStatusText("failed", "原文"), "失败");
  assert.equal(projectionStatusText("aborted", "原文"), "已中止");
  assert.equal(projectionStatusText("timed_out", "原文"), "已超时");
  assert.equal(projectionStatusText("unknown", "原文"), "未知");
  assert.equal(projectionStatusText("internal-feedback", "原文"), "内部反馈");
  assert.equal(projectionStatusText("mystery", "原文"), "原文");
  assert.equal(projectionStatusText(undefined, "原文"), "原文");
  assert.equal(projectionStatusText(null, ""), "");
  assert.equal(projectionStatusKey("timed_out"), "ui.projection.status.timedOut");
  assert.equal(projectionStatusKey("mystery"), null);
});

test("连续同指纹合并：计数、occurrences 有界；不同指纹/非投影行不合并", () => {
  const previous = {
    kind: "system",
    label: "系统消息 · 治理反馈",
    body: "内部原文",
    clientProjection: { ...projection, fingerprint: "same" },
    turnId: "t1",
    at: "2026-10-25T10:00:00Z",
  };
  const next = {
    kind: "system",
    label: "系统消息 · 治理反馈",
    body: "内部原文",
    clientProjection: { ...projection, fingerprint: "same" },
    turnId: "t2",
    at: "2026-10-25T10:05:00Z",
  };
  const merged = mergeClientProjectionData(previous, next);
  assert.ok(merged);
  assert.equal(merged!.projectionCount, 2);
  assert.deepEqual(merged!.projectionOccurrences, [
    { at: "2026-10-25T10:05:00Z", turnId: "t2" },
  ]);
  assert.equal(merged!.at, previous.at, "保留首条 at");

  const third = mergeClientProjectionData(merged, { ...next, turnId: "t3", at: "2026-10-25T10:10:00Z" });
  assert.equal(third!.projectionCount, 3);

  const different = mergeClientProjectionData(previous, {
    ...next,
    clientProjection: { ...projection, fingerprint: "other" },
  });
  assert.equal(different, null);
  assert.equal(mergeClientProjectionData(previous, { kind: "system", body: "x" }), null);
  assert.equal(mergeClientProjectionData(null, next), null);

  let chain: Record<string, unknown> = previous;
  for (let index = 0; index < 12; index += 1) {
    chain = mergeClientProjectionData(chain, {
      ...next,
      turnId: "t" + index,
      at: "2026-10-25T11:0" + (index % 10) + ":00Z",
    })!;
  }
  assert.equal(chain.projectionCount, 13);
  assert.equal((chain.projectionOccurrences as unknown[]).length, 8);
});

test("事件→行：prompt-input 附带合法投影与时间；非法投影不附带；assistant 透传 at", () => {
  const injected = describeEvent({
    kind: "message",
    turnId: "t1",
    at: "2026-10-25T10:00:00Z",
    detail: {
      source: "prompt-input",
      text: "[系统·治理反馈] 来自 验收 的状态",
      clientProjection: projection,
    },
  });
  assert.equal(injected?.kind, "injected");
  const data = injected!.data as Record<string, unknown>;
  assert.equal((data.clientProjection as { fingerprint: string }).fingerprint, projection.fingerprint);
  assert.equal(data.at, "2026-10-25T10:00:00Z");
  assert.equal(data.turnId, "t1");

  const invalid = describeEvent({
    kind: "message",
    turnId: "t1",
    detail: {
      source: "prompt-input",
      text: "[系统·治理反馈] 来自 验收 的状态",
      clientProjection: { ...projection, fingerprint: "" },
    },
  });
  assert.equal((invalid!.data as Record<string, unknown>).clientProjection, undefined);

  const assistant = describeEvent({
    kind: "message",
    turnId: "t1",
    at: "2026-10-25T10:01:00Z",
    summary: "回复",
  });
  assert.equal(assistant?.kind, "assistant");
  assert.equal((assistant!.data as Record<string, unknown>).at, "2026-10-25T10:01:00Z");
});
