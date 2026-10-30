// test/桌面应用/run-change.test.ts
// 2026-10-30（方案 v3 §3.1 / F8）：run-change 复用 decision 卡——
// 三模式、approve/reject/cancel 回退映射、issuedBy=app、决定记录与 session 接线。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  applyRunChange,
  buildRunChangeCard,
  mapRunChangeAnswer,
  mapRunChangeChoice,
  readRunManifest,
  writeRunManifest,
  type RunManifest,
} from "../../src/common/编排/run-manifest.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function pinnedManifest(flowId = "focus"): RunManifest {
  const now = "2026-10-30T00:00:00.000Z";
  return {
    schema: "ans-run/v1",
    runId: `run-20261030-${flowId}-abcdef12`,
    flowId,
    state: "pinned",
    createdAt: now,
    updatedAt: now,
    pinnedAt: now,
    pinnedBy: "app",
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
    d3: { decisionId: "decision-x", targetRoleIds: ["dev"] },
    stage: { current: "stage-1", planVersion: 1 },
    roles: ["dev"],
  };
}

test("run-change 卡：复用 decision、issuedBy=app、三选项与回退映射", () => {
  const card = buildRunChangeCard({
    runId: "run-20261030-focus-abcdef12",
    flowId: "focus",
    requestId: "run-change-1",
    requestedBy: "convener",
    current: { state: "pinned", documents: { roster: "docs/proposals/focus-roster-v1.md" }, schemas: { roster: "project-roster/v3" } },
  });
  assert.equal(card.request.kind, "choice");
  assert.equal(card.request.cardKind, "decision");
  assert.equal(card.request.application, true);
  assert.equal(card.request.sourceRoleId, "application");
  assert.deepEqual(card.request.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
  assert.equal(card.request.options.filter((option) => option.recommended === true).length, 1);
  assert.deepEqual(card.payload["fallbackMap"], { approve: "stop-and-restart", reject: "continue-frozen", cancel: "stop" });
  assert.equal(card.payload["issuedBy"], "app");
  assert.equal(mapRunChangeChoice("approve"), "stop-and-restart");
  assert.equal(mapRunChangeChoice("reject"), "continue-frozen");
  assert.equal(mapRunChangeChoice("cancel"), "stop");
  assert.equal(mapRunChangeAnswer({ selected: ["continue-frozen"] }), "continue-frozen");
  assert.equal(mapRunChangeAnswer({ selected: ["unknown"] }), undefined);
});

test("run-change 三模式：continue-frozen 不改 run；stop-and-restart 收口旧 run 并要求新 run；stop 取消", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-"));
  try {
    const base = pinnedManifest();
    await writeRunManifest(root, base);

    const frozen = await applyRunChange(root, base, { decisionId: "decision-a", mode: "continue-frozen", decidedBy: "customer" });
    assert.equal(frozen.ok, true);
    if (frozen.ok) {
      assert.equal(frozen.manifest.state, "pinned");
      assert.equal(frozen.newRunRequired, false);
      assert.equal(frozen.manifest.runChange?.mode, "continue-frozen");
      assert.equal(frozen.manifest.runChange?.decisionId, "decision-a");
    }
    const restart = await applyRunChange(root, base, { decisionId: "decision-b", mode: "stop-and-restart", decidedBy: "judge" });
    assert.equal(restart.ok, true);
    if (restart.ok) {
      assert.equal(restart.manifest.state, "closed");
      assert.equal(restart.newRunRequired, true);
      assert.equal(restart.manifest.runChange?.mode, "stop-and-restart");
      assert.equal(restart.manifest.runChange?.decidedBy, "judge");
      assert.match(restart.manifest.runChange?.newRunId ?? "", /^run-/);
      assert.notEqual(restart.manifest.runChange?.newRunId, base.runId);
    }
    const stopBase = { ...base, runId: base.runId.replace(/12$/, "34") };
    await writeRunManifest(root, stopBase);
    const stopped = await applyRunChange(root, stopBase, { decisionId: "decision-c", mode: "stop", decidedBy: "customer" });
    assert.equal(stopped.ok, true);
    if (stopped.ok) {
      assert.equal(stopped.manifest.state, "cancelled");
      assert.equal(stopped.newRunRequired, false);
    }
    const after = await readRunManifest(root, stopBase.runId);
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.manifest.state, "cancelled");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["chief", "convener", "verifier"].map((roleId) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: roleId === "convener" ? "schedule" : roleId === "verifier" ? "verification" : "chief",
  }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio" };
}

test("session run-change：convener 通道呈现 app 卡；客户选择 stop-and-restart 后落决定/关闭 run", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-session-"));
  const captured: CustomerInputRequest[] = [];
  const customerInput: CustomerInputFn = async (request) => {
    captured.push(request);
    return { outcome: "answered", value: { selected: ["stop-and-restart"] }, decisionId: "decision-session-run-change", operatorId: "customer" };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(20); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    customerInput,
  });
  try {
    const base = pinnedManifest();
    await writeRunManifest(root, base);
    await mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    const started = await mgr.requestRunChangeDecision({ projectRoot: root, flowId: "focus", requestedBy: "convener", reason: "客户要求变更" });
    assert.equal(started.ok, true, started.ok ? "" : started.error);
    if (!started.ok) return;
    const outcome = await started.outcome;
    assert.equal(outcome.outcome, "answered");
    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.cardKind, "decision");
    assert.equal((captured[0] as { application?: boolean }).application, true);
    const choiceRequest = captured[0] as Extract<CustomerInputRequest, { kind: "choice" }>;
    assert.deepEqual(choiceRequest.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
    const stored = await readRunManifest(root, base.runId);
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.manifest.state, "closed");
      assert.equal(stored.manifest.runChange?.decisionId, "decision-session-run-change");
      assert.equal(stored.manifest.runChange?.mode, "stop-and-restart");
      assert.equal(stored.manifest.runChange?.decidedBy, "customer");
    }
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
