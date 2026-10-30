// test/编排/run-manifest.test.ts
// 2026-10-30（方案 v3 §3.1 / F5）：manifest 纯模块——形状校验、pending draft 领养、
// 非法 manifest fail-closed、verify 七类文档齐备要求。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  RUN_PENDING_FLOW_ID,
  ensureDraftRun,
  findActiveRun,
  runManifestPath,
  validateRunManifest,
  verifyPinnedRun,
  writeRunManifest,
  type RunManifest,
} from "../../src/common/编排/run-manifest.ts";

function draft(flowId = "focus"): RunManifest {
  const at = "2026-10-30T00:00:00.000Z";
  return {
    schema: "ans-run/v1",
    runId: "run-20261030-focus-abcdef12",
    flowId,
    state: "draft",
    createdAt: at,
    updatedAt: at,
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
}

function pinned(flowId = "focus"): RunManifest {
  return {
    ...draft(flowId),
    state: "pinned",
    pinnedAt: "2026-10-30T00:01:00.000Z",
    pinnedBy: "app",
    schemas: {
      run: "ans-run/v1",
      intent: "project-intent/v1",
      proposal: "project-proposal/v2",
      modules: "project-modules/v2",
      roster: "project-roster/v3",
      topology: "project-topology/v2",
      architecture: "project-architecture/v1",
      teamPlan: "teamPlanSchema:3",
      assets: "project-assets/v1",
      evidence: "evidence-meta/v1",
    },
    documents: {
      intent: { path: "docs/product/focus-intent-v1.md", sha256: "a".repeat(64) },
      proposal: { path: "docs/proposals/focus-proposal-v1.md", sha256: "b".repeat(64) },
      modules: { path: "docs/proposals/focus-modules-v1.md", sha256: "c".repeat(64) },
      roster: { path: "docs/proposals/focus-roster-v1.md", sha256: "d".repeat(64) },
      topology: { path: "docs/proposals/focus-roster-v1.md#人员+模块拓扑图", source: "roster-block", sha256: "d".repeat(64) },
      architecture: { path: "docs/contracts/focus-architecture-v1.md", sha256: "e".repeat(64) },
      assets: null,
    },
    rosterVersion: 1,
    d3: { decisionId: "decision-x", targetRoleIds: ["dev"] },
    stage: { current: "stage-1", planVersion: 1 },
    roles: ["dev"],
  };
}

test("manifest 形状：draft/pinned 合法；schema/state/runId 非法拒绝", () => {
  assert.equal(validateRunManifest(draft()).ok, true);
  assert.equal(validateRunManifest(pinned()).ok, true);
  assert.equal(validateRunManifest({ ...draft(), state: "running" }).ok, false);
  assert.equal(validateRunManifest({ ...draft(), schema: "ans-run/v2" }).ok, false);
  assert.equal(validateRunManifest({ ...draft(), runId: "bad" }).ok, false);
});

test("pending draft：M1 无 flow 先建 pending；真实 flow 到达时领养同一 runId", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-pending-"));
  try {
    const pending = await ensureDraftRun(root, RUN_PENDING_FLOW_ID);
    assert.equal(pending.ok, true);
    if (!pending.ok) return;
    const adopted = await ensureDraftRun(root, "focus");
    assert.equal(adopted.ok, true);
    if (!adopted.ok) return;
    assert.equal(adopted.manifest.runId, pending.manifest.runId);
    assert.equal(adopted.manifest.flowId, "focus");
    const active = await findActiveRun(root, "focus");
    assert.equal(active.ok, true);
    if (active.ok) assert.equal(active.manifest?.runId, pending.manifest.runId);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("F5：非法 manifest 不静默跳过——findActiveRun fail-closed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-invalid-"));
  try {
    const good = draft();
    await writeRunManifest(root, good);
    const badId = "run-20261030-broken-abcdef12";
    await fs.mkdir(path.dirname(runManifestPath(root, badId)), { recursive: true });
    await fs.writeFile(runManifestPath(root, badId), "{not-json\n", "utf8");
    const active = await findActiveRun(root, "focus");
    assert.equal(active.ok, false);
    if (!active.ok) {
      assert.equal(active.code, "run-manifest-invalid");
      assert.match(active.reason, /broken/);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("F5：verifyPinnedRun 要求七类文档键齐备（assets 可为 null，但键必须存在）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-verify-"));
  try {
    const manifest = pinned();
    manifest.documents = { ...manifest.documents };
    delete manifest.documents.assets;
    const verified = await verifyPinnedRun(root, manifest);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.ok(verified.violations.some((line) => line.startsWith("assets: missing from manifest.documents")));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
