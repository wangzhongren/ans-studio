// test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts
// W-J5：`doc.freeze` judge-delegated 账本行与 `freezeEvents` 镜像的跨层回归（J16/J17 测试层复核）。
//
// 目的：
//  - J17：既有 VCA/detail 路径的冻结 entry **不带 source** ⇒ `freezeEvents` 事件字节逐字不变
//    （无 actionSource 键）；仅 source-bearing（judge-delegated）entry 追加镜像。
//  - J16：judge-delegated `doc.freeze` 行经真实 shared validator（validateTaskStateEvent）与
//    真实账本追加/读取（appendTaskEvent → readTaskState）正例通过、负例 fail-closed。
// 真实文件系统（临时根），无模型/Electron/网络。
import assert from "node:assert/strict";
import { test } from "node:test";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendTaskEvent, readTaskState, validateTaskStateEvent } from "../../src/common/编排/task-state.ts";
import type { DocFreezeRecord } from "../../src/model/version-change.ts";
import { freezeEvents } from "../../src/pipeline/orchestration/version-change-runtime.ts";

const AT = "2026-11-09T03:00:00.000Z";
const SHA = "c".repeat(64);
const INTENT_PATH = "docs/product/demo-intent-v1.md";

/** 既有 VCA 路径形状：customer 类 reason、无 `source`（vca-service freeze() 入参不带 source）。 */
const vcaCustomerFreeze: DocFreezeRecord = {
  schema: "doc-freeze/v1", applicationId: "vca-demo-1", reason: "vca-approved", origin: "customer",
  decidedBy: "customer", decisionId: "decision-vca-1", frozenAt: AT,
};

/** judge 代批冻结形状：judge-delegated source、无客户字段。 */
const judgeIntentFreeze: DocFreezeRecord = {
  schema: "doc-freeze/v1", applicationId: "intent-rq-judge-1", reason: "intent-confirmed", origin: "judge-delegated",
  source: { kind: "judge-delegated", requestId: "rq-judge-1", engine: "claude", model: "claude-judge-model",
    operatorId: "judge:claude", reasonCode: "sufficient", reason: "sufficient evidence", selected: ["confirm"],
    cardKind: "intent-confirm", at: AT },
  snapshotRef: { snapshotId: "s-wj5-judge", digest: "d".repeat(64) }, frozenAt: AT,
};

const judgeProposalFreeze: DocFreezeRecord = {
  schema: "doc-freeze/v1", applicationId: "proposal-rq-judge-2", reason: "proposal-confirmed", origin: "judge-delegated",
  source: { kind: "judge-delegated", requestId: "rq-judge-2", engine: "claude", operatorId: "judge:claude",
    reasonCode: "sufficient", cardKind: "proposal", at: AT },
  frozenAt: AT,
};

test("J17：无 source 的既有冻结 entry 事件字节逐字不变；judge-delegated source 如实镜像 actionSource", () => {
  const [existing] = freezeEvents([{ path: "docs/scheduling/demo-team-v1.md", version: 1, sha256: SHA, freeze: vcaCustomerFreeze }]);
  const expected = { v: 1, at: AT, kind: "doc.freeze", schema: "doc-freeze/v1", path: "docs/scheduling/demo-team-v1.md", version: 1,
    sha256: SHA, applicationId: "vca-demo-1", reason: "vca-approved", origin: "customer", decidedBy: "customer", decisionId: "decision-vca-1" };
  assert.deepEqual(existing, expected, "既有 VCA 冻结事件必须逐字不变（无 actionSource 键）");
  assert.equal(JSON.stringify(existing), JSON.stringify(expected), "字节级 JSON 不变");
  assert.equal("actionSource" in existing, false);

  const [mirrored] = freezeEvents([{ path: INTENT_PATH, version: 1, sha256: SHA, freeze: judgeIntentFreeze }]);
  assert.deepEqual(mirrored, { v: 1, at: AT, kind: "doc.freeze", schema: "doc-freeze/v1", path: INTENT_PATH, version: 1, sha256: SHA,
    applicationId: "intent-rq-judge-1", reason: "intent-confirmed", origin: "judge-delegated", actionSource: judgeIntentFreeze.source });
  const checked = validateTaskStateEvent(mirrored);
  assert.equal(checked.ok, true, JSON.stringify(checked));
});

test("J16：judge-delegated doc.freeze 经真实账本追加/读取正例通过；缺失/伪造/客户字段负例 fail-closed", async () => {
  const [intentEvent] = freezeEvents([{ path: INTENT_PATH, version: 1, sha256: SHA, freeze: judgeIntentFreeze }]);
  const [proposalEvent] = freezeEvents([{ path: "docs/proposals/demo-proposal-v1.md", version: 1, sha256: SHA, freeze: judgeProposalFreeze }]);
  assert.equal(validateTaskStateEvent(intentEvent).ok, true, "intent-confirmed + judge-delegated 正例必须通过");
  assert.equal(validateTaskStateEvent(proposalEvent).ok, true, "proposal-confirmed + judge-delegated 正例必须通过");

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-wj5-doc-freeze-"));
  try {
    const appendedIntent = await appendTaskEvent(root, intentEvent);
    assert.equal(appendedIntent.ok, true, JSON.stringify(appendedIntent));
    const appendedProposal = await appendTaskEvent(root, proposalEvent);
    assert.equal(appendedProposal.ok, true, JSON.stringify(appendedProposal));
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.events.length, 2);
    assert.deepEqual(state.events.map(event => event.kind), ["doc.freeze", "doc.freeze"]);

    // 负例（全部 fail-closed、不抛错）：source 缺失/source kind 不符/客户字段混入/applicationId 不匹配/at 不一致。
    const base = intentEvent as unknown as Record<string, unknown>;
    const withoutSource = { ...base };
    delete withoutSource.actionSource;
    const cases: Array<[string, Record<string, unknown>]> = [
      ["source 缺失", withoutSource],
      ["source kind 非 judge-delegated", { ...base, actionSource: { ...(judgeIntentFreeze.source as object), kind: "customer-decision" } }],
      ["customer 字段混入 decidedBy", { ...base, decidedBy: "customer" }],
      ["customer 字段混入 decisionId", { ...base, decisionId: "decision-rq-judge-1" }],
      ["applicationId 与 requestId 不匹配", { ...base, applicationId: "intent-rq-other" }],
      ["at 与 source.at 不一致", { ...base, at: "2026-11-09T04:00:00.000Z" }],
      ["cardKind 与 reason 不匹配", { ...base, actionSource: { ...(judgeIntentFreeze.source as object), cardKind: "proposal" } }],
      ["reason 非 judge 子集", { ...base, reason: "version-upgrade" }],
    ];
    for (const [label, event] of cases) {
      const checked = validateTaskStateEvent(event);
      assert.equal(checked.ok, false, `${label} 必须被拒绝`);
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});
