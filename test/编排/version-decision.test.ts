// test/编排/version-decision.test.ts
// A1（2026-11-02）：版本决策纯逻辑（契约校验/卡/答案映射/执行计划/F5/requestId）。
// 覆盖 AC-3.2–3.6/3.8、AC-4.2/4.3/4.5、AC-5.2/5.6、AC-8.3/8.5、R2/R3/R4、AC-9.1。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { taskEvent } from "../../src/common/编排/task-state.ts";
import type { TaskStateEvent } from "../../src/model/runtime.ts";
import {
  buildVersionDecisionCard,
  collectResolvedWithoutExecution,
  computeTargetVersions,
  mapVersionDecisionAnswer,
  planVersionDecisionExecution,
  supersededCloseReason,
  validateVersionDecisionContext,
  validateVersionDecisionRequest,
  versionDecisionAttempt,
  versionDecisionCardToRequest,
  versionDecisionRequestId,
  type VersionDecisionCardLabels,
} from "../../src/common/编排/version-decision.ts";
import { deriveActiveRunFromManifests, scanRunManifestsForState } from "../../src/common/编排/project-state.ts";
import { validateDecisionCardRequest } from "../../src/common/编排/decision-card.ts";
import { closeRun, writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import type { VersionDecisionFacts } from "../../src/model/project-state.ts";

const T0 = "2026-11-02T00:00:00.000Z";

function manifest(flowId: string, runId: string, state: RunManifest["state"] = "draft", createdAt = T0): RunManifest {
  return {
    schema: "ans-run/v1",
    runId,
    flowId,
    state,
    createdAt,
    updatedAt: createdAt,
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
}

const facts: VersionDecisionFacts = {
  flowId: "focus",
  unclosedCount: 2,
  blockedCount: 1,
  failedCount: 0,
  pendingRequestCount: 1,
  acceptanceRejectedCount: 1,
  priorVersionDecisionCount: 0,
  latestDocs: [],
  newerThanPinned: [],
};

const labels: VersionDecisionCardLabels = {
  title: "版本决策：focus",
  question: "当前 flow focus 卡在版本/引用/验收证据循环。",
  disclaimer: "若选择新版本开发，应用将关闭旧 flow 的全部活动 run；这是路线选择，不是内容批准，也不是验收。",
  optionVersionModify: "版本修改",
  optionNewVersionDevelopment: "新版本开发",
};

test("validateVersionDecisionRequest：严格键集/slug/动作/reason/refs", () => {
  const ok = validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "修引用", refs: ["docs/a.md"] });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.request.flowId, "focus");
    assert.equal(ok.request.action, "version-modify");
  }
  assert.equal(validateVersionDecisionRequest({ flowId: "Bad_Flow", action: "version-modify", reason: "x" }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "bogus", reason: "x" }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "" }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "x".repeat(1001) }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "x", refs: ["a", "b", "c", "d", "e", "f"] }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "x", refs: ["../evil"] }).ok, false);
  assert.equal(validateVersionDecisionRequest({ flowId: "focus", action: "version-modify", reason: "x", extra: true }).ok, false);
});

test("buildVersionDecisionCard：两选项、恰一 recommended=幕僚 action；application-owned 卡通过校验", () => {
  const card = buildVersionDecisionCard({
    requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-1234abcd",
    flowId: "focus",
    action: "version-modify",
    reason: "修引用",
    facts,
    labels,
  });
  assert.equal(card.schema, "version-decision/v1");
  assert.deepEqual(card.options.map((option) => option.id), ["version-modify", "new-version-development"]);
  assert.equal(card.options.filter((option) => option.recommended === true).length, 1);
  assert.equal(card.options.find((option) => option.recommended === true)?.id, "version-modify");
  assert.match(card.question, /全部活动 run/);
  assert.match(card.question, /不是内容批准/);

  const request = versionDecisionCardToRequest(card);
  assert.equal(request.kind, "choice");
  assert.equal(request.cardKind, "decision");
  assert.equal(request.application, true);
  assert.equal(request.sourceRoleId, "application");
  assert.equal(request.flowId, "focus");
  const validated = validateDecisionCardRequest({ request, roleId: "verifier", governanceModel: "trio" });
  assert.equal(validated.ok, true);
  if (validated.ok) assert.equal(validated.recommendedOptionId, "version-modify");
});

test("computeTargetVersions：已有最新+1、缺失 kind→v1；topology 不单列", () => {
  const targets = computeTargetVersions({ intent: 1, proposal: 3, roster: 2 });
  assert.deepEqual(targets, {
    intent: 2,
    proposal: 4,
    modules: 1,
    roster: 3,
    architecture: 1,
    assets: 1,
  });
  assert.equal("topology" in targets, false);
});

test("validateVersionDecisionContext：pinned/多 run/pending 与 legacy", () => {
  const pinned = deriveActiveRunFromManifests([manifest("focus", "run-20261102-focus-aaaaaaaa", "pinned")], "focus");
  const pinnedResult = validateVersionDecisionContext({ derivation: pinned, hasPending: false });
  assert.equal(pinnedResult.ok, false);
  if (!pinnedResult.ok) assert.equal(pinnedResult.code, "run-change-required");

  const twoDrafts = deriveActiveRunFromManifests([
    manifest("focus", "run-20261102-focus-aaaaaaaa"),
    manifest("focus", "run-20261102-focus-bbbbbbbb", "draft", "2026-11-02T00:01:00.000Z"),
  ], "focus");
  const ambiguous = validateVersionDecisionContext({ derivation: twoDrafts, hasPending: false });
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.equal(ambiguous.code, "run-ambiguous");
  const chosen = validateVersionDecisionContext({ derivation: twoDrafts, requestedRunId: "run-20261102-focus-bbbbbbbb", hasPending: false });
  assert.equal(chosen.ok, true);
  if (chosen.ok) assert.equal(chosen.runId, "run-20261102-focus-bbbbbbbb");

  const pending = validateVersionDecisionContext({ derivation: pinned, hasPending: true });
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.code, "run-change-required", "pinned 优先于 pending");

  const oneDraft = deriveActiveRunFromManifests([manifest("focus", "run-20261102-focus-aaaaaaaa")], "focus");
  const onePending = validateVersionDecisionContext({ derivation: oneDraft, hasPending: true });
  assert.equal(onePending.ok, false);
  if (!onePending.ok) assert.equal(onePending.code, "decision-pending");

  const legacy = validateVersionDecisionContext({ derivation: { active: null, activeRuns: [] }, hasPending: false });
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.runId, undefined);
});

test("planVersionDecisionExecution：版本修改同 flow/run；legacy 锚点；pinned 双 action 统一 failed 零执行", () => {
  const oneDraft = deriveActiveRunFromManifests([manifest("focus", "run-20261102-focus-aaaaaaaa")], "focus");
  const modify = planVersionDecisionExecution({
    action: "version-modify",
    flowId: "focus",
    derivation: oneDraft,
    hasPending: false,
    latestVersions: { proposal: 1 },
  });
  assert.equal(modify.kind, "version-modify");
  if (modify.kind === "version-modify") {
    assert.equal(modify.flowId, "focus");
    assert.equal(modify.runId, "run-20261102-focus-aaaaaaaa");
    assert.equal(modify.targetVersions.proposal, 2);
    assert.equal(modify.needsRunAnchor, false);
  }

  const legacy = planVersionDecisionExecution({
    action: "version-modify",
    flowId: "focus",
    derivation: { active: null, activeRuns: [] },
    hasPending: false,
  });
  assert.equal(legacy.kind, "version-modify");
  if (legacy.kind === "version-modify") assert.equal(legacy.needsRunAnchor, true);

  const pinned = deriveActiveRunFromManifests([manifest("focus", "run-20261102-focus-aaaaaaaa", "pinned")], "focus");
  for (const action of ["version-modify", "new-version-development"] as const) {
    const plan = planVersionDecisionExecution({ action, flowId: "focus", derivation: pinned, hasPending: false });
    assert.equal(plan.kind, "fail");
    if (plan.kind === "fail") {
      assert.equal(plan.code, "run-change-required");
      assert.deepEqual(plan.audit, { status: "failed", message: "run-change-required" });
      assert.equal("targetVersions" in plan, false, "pinned 零执行：无 targetVersions");
      assert.equal("oldActiveRunIds" in plan, false, "pinned 零执行：无关闭列表");
    }
  }
});

test("planVersionDecisionExecution：new-version-development 关闭全部活动 run；runId 仅上下文", () => {
  const twoDrafts = deriveActiveRunFromManifests([
    manifest("focus", "run-20261102-focus-aaaaaaaa"),
    manifest("focus", "run-20261102-focus-bbbbbbbb", "draft", "2026-11-02T00:01:00.000Z"),
  ], "focus");
  const plan = planVersionDecisionExecution({
    action: "new-version-development",
    flowId: "focus",
    derivation: twoDrafts,
    requestedRunId: "run-20261102-focus-aaaaaaaa",
    hasPending: false,
    pendingRequestIds: ["req-1", "req-2"],
  });
  assert.equal(plan.kind, "new-version-development");
  if (plan.kind === "new-version-development") {
    assert.deepEqual(plan.closedRunIds, ["run-20261102-focus-aaaaaaaa", "run-20261102-focus-bbbbbbbb"]);
    assert.deepEqual(plan.oldActiveRunIds, plan.closedRunIds);
    assert.equal(plan.requestedRunId, "run-20261102-focus-aaaaaaaa");
    assert.deepEqual(plan.orphanRequestIds, ["req-1", "req-2"]);
    assert.equal(plan.closeReasonPrefix, "superseded-by:");
  }
  assert.equal(supersededCloseReason("focus-next", "run-20261102-focus-next-cccccccc"), "superseded-by:focus-next/run-20261102-focus-next-cccccccc");
});

test("R4/AC-5：closedRunIds 与 partial scan 一致；逐个 closeRun 后全部 closed + superseded-by 格式", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-version-decision-close-"));
  try {
    const first = manifest("focus", "run-20261102-focus-aaaaaaaa", "draft", "2026-11-02T00:00:00.000Z");
    const second = manifest("focus", "run-20261102-focus-bbbbbbbb", "draft", "2026-11-02T00:01:00.000Z");
    assert.equal((await writeRunManifest(root, first)).ok, true);
    assert.equal((await writeRunManifest(root, second)).ok, true);
    const scan = await scanRunManifestsForState(root);
    assert.equal(scan.errors.length, 0);
    const derivation = deriveActiveRunFromManifests(scan.manifests, "focus");
    const plan = planVersionDecisionExecution({
      action: "new-version-development",
      flowId: "focus",
      derivation,
      requestedRunId: first.runId,
      hasPending: false,
    });
    assert.equal(plan.kind, "new-version-development");
    if (plan.kind !== "new-version-development") return;
    const scannedActiveIds = derivation.activeRuns.map((run) => run.runId).sort();
    assert.deepEqual([...plan.closedRunIds].sort(), scannedActiveIds, "关闭范围与 partial scan active runs 一致");
    assert.deepEqual(plan.oldActiveRunIds, plan.closedRunIds);
    assert.deepEqual(plan.closedRunIds.sort(), [first.runId, second.runId].sort());
    const reason = supersededCloseReason("focus-next", "run-20261102-focus-next-cccccccc");
    for (const runId of plan.oldActiveRunIds) {
      const closed = await closeRun(root, runId, "closed", reason);
      assert.equal(closed.ok, true);
      if (closed.ok) {
        assert.equal(closed.manifest.state, "closed");
        assert.equal(closed.manifest.closeReason, reason);
      }
    }
    const after = await scanRunManifestsForState(root);
    assert.equal(after.manifests.filter((item) => item.state === "closed").length, 2);
    const afterDerivation = deriveActiveRunFromManifests(after.manifests, "focus");
    assert.equal(afterDerivation.active, null);
    assert.equal(afterDerivation.activeRuns.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("mapVersionDecisionAnswer（R2）：timeout/unavailable/resolved、aborted/orphaned、late/诊断、invalid/declined", () => {
  assert.deepEqual(mapVersionDecisionAnswer({ outcome: "timeout", by: "customer" }), { kind: "resolve-unavailable", choice: "unavailable", by: "customer" });
  assert.deepEqual(mapVersionDecisionAnswer({ outcome: "unavailable", by: "judge" }), { kind: "resolve-unavailable", choice: "unavailable", by: "judge" });
  assert.deepEqual(mapVersionDecisionAnswer({ outcome: "declined", by: "customer", reason: "customer closed" }), { kind: "resolve-declined", choice: "declined", reason: "customer closed", by: "customer" });
  assert.deepEqual(mapVersionDecisionAnswer({ outcome: "aborted" }), { kind: "orphan", reason: "initiator-aborted" });
  assert.deepEqual(mapVersionDecisionAnswer({ outcome: "late", selected: ["version-modify"], by: "customer" }), { kind: "late", reason: "late-answer" });
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "answered", selected: ["bogus"], by: "customer" }),
    { kind: "resolve-declined", choice: "declined", reason: "invalid-selection", by: "customer" },
  );
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "answered", selected: ["version-modify", "new-version-development"], by: "customer" }),
    { kind: "resolve-declined", choice: "declined", reason: "invalid-selection", by: "customer" },
  );
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "answered", selected: ["version-modify"] }),
    { kind: "resolve-declined", choice: "declined", reason: "invalid-selection" },
    "缺 by 按非法答案 fail-closed",
  );
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "answered", selected: ["new-version-development"], by: "judge" }),
    { kind: "execute", action: "new-version-development", decidedBy: "judge", selectedOptionIds: ["new-version-development"] },
  );
});

test("Q9 A（2026-11-03）：mapVersionDecisionAnswer 接受 directive；collectResolvedWithoutExecution 保留 directive", () => {
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "answered", selected: ["version-modify"], by: "directive" }),
    { kind: "execute", action: "version-modify", decidedBy: "directive", selectedOptionIds: ["version-modify"] },
    "C1 三值后走宽重载，decidedBy 保留 directive",
  );
  assert.deepEqual(
    mapVersionDecisionAnswer({ outcome: "declined", by: "directive", reason: "客户指令拒绝" }),
    { kind: "resolve-declined", choice: "declined", reason: "客户指令拒绝", by: "directive" },
  );
  const events: TaskStateEvent[] = [
    taskEvent("request.created", {
      requestId: "version-decision-run-20261103-focus-aaaaaaaa-m1abc-33333333",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }),
    taskEvent("request.resolved", {
      requestId: "version-decision-run-20261103-focus-aaaaaaaa-m1abc-33333333",
      decisionId: "decision-directive-1",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "directive",
      directiveId: "d-3",
      choice: "version-modify",
    }),
  ];
  const found = collectResolvedWithoutExecution(events);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.decidedBy, "directive");
  assert.equal(found[0]!.action, "version-modify");
});

test("collectResolvedWithoutExecution（R3/F5）：排除 orphaned/已有 decision/invalid-selection；failed 不误判", () => {
  const events: TaskStateEvent[] = [
    taskEvent("request.created", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-11111111",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }),
    taskEvent("request.resolved", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-11111111",
      decisionId: "decision-1",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "version-modify",
    }),
    taskEvent("request.created", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-22222222",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }),
    taskEvent("request.resolved", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-22222222",
      decisionId: "decision-2",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "version-modify",
    }),
    taskEvent("request.orphaned", { requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-22222222", reason: "initiator-aborted" }),
    taskEvent("request.created", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-33333333",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }),
    taskEvent("request.resolved", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-33333333",
      decisionId: "decision-3",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "version-modify",
    }),
    taskEvent("version.decision", {
      schema: "version-decision/v1",
      decisionId: "decision-3",
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-33333333",
      attempt: 1,
      flowId: "focus",
      action: "version-modify",
      recommendedBy: "chief",
      recommendedAction: "version-modify",
      decidedBy: "customer",
      reason: "x",
      status: "failed",
      message: "run-change-required",
    }),
    taskEvent("request.created", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-44444444",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }),
    taskEvent("request.resolved", {
      requestId: "version-decision-run-20261102-focus-aaaaaaaa-m1abc-44444444",
      decisionId: "decision-4",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "declined",
      reason: "invalid-selection",
    }),
  ];
  const found = collectResolvedWithoutExecution(events);
  assert.deepEqual(found.map((item) => item.decisionId), ["decision-1"], "只留 answered、无 orphaned、无 version.decision、非 invalid-selection");
  assert.equal(found[0]!.action, "version-modify");
  assert.equal(found[0]!.flowId, "focus");
});

test("requestId/attempt（F1）：有 run/无 run 两式；attempt 含拒绝/中止；前缀碰撞不误计", () => {
  assert.equal(
    versionDecisionRequestId({ flowId: "focus" }, new Date(0), "deadbeef"),
    "version-decision-flow-focus-0-deadbeef",
  );
  assert.equal(
    versionDecisionRequestId({ flowId: "focus", runId: "run-20261102-focus-aaaaaaaa" }, new Date(0), "deadbeef"),
    "version-decision-run-20261102-focus-aaaaaaaa-0-deadbeef",
  );

  const subject = { flowId: "focus", runId: "run-20261102-focus-a" };
  const events: TaskStateEvent[] = [
    taskEvent("request.created", {
      requestId: versionDecisionRequestId(subject, new Date(1000), "11111111"),
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "x",
      options: [{ id: "version-modify", label: "A" }, { id: "new-version-development", label: "B" }],
    }),
    taskEvent("request.resolved", {
      requestId: versionDecisionRequestId(subject, new Date(1000), "11111111"),
      decisionId: "decision-a",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "declined",
    }),
    taskEvent("request.created", {
      requestId: versionDecisionRequestId(subject, new Date(2000), "22222222"),
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "x",
      options: [{ id: "version-modify", label: "A" }, { id: "new-version-development", label: "B" }],
    }),
    taskEvent("request.created", {
      requestId: versionDecisionRequestId({ flowId: "focus", runId: "run-20261102-focus-a-b" }, new Date(3000), "33333333"),
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "x",
      options: [{ id: "version-modify", label: "A" }, { id: "new-version-development", label: "B" }],
    }),
  ];
  assert.equal(versionDecisionAttempt(events, subject), 3, "两次 request.created（含 declined）+1；更长 runId 不误计");
});
