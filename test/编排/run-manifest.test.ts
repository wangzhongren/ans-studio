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
  closeRun,
  ensureDraftRun,
  findActiveRun,
  listRunManifestsResult,
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

test("P2.4：静态 quickref 由 manifest 生成，逐项与 manifest 文档/hash 一致", async () => {
  const { renderRunQuickref } = await import("../../src/common/编排/run-manifest.ts");
  const manifest = pinned();
  const text = renderRunQuickref(manifest);
  assert.match(text, new RegExp(manifest.runId));
  for (const [kind, ref] of Object.entries(manifest.documents)) {
    if (ref === null || ref === undefined) {
      assert.match(text, new RegExp(`- ${kind}: null`));
    } else {
      assert.equal(text.includes(ref.path), true, `quickref 缺文档路径：${ref.path}`);
      if (ref.sha256 !== undefined) assert.equal(text.includes(ref.sha256), true, `quickref 缺 hash：${kind}`);
    }
  }
});

// ————————————————— 2026-11-02（R4）：closeRun supersede / 多 draft —————————————————

test("R4：closeRun 记录 supersede closeReason/幂等；多 draft 逐个关闭；listRunManifestsResult 语义不变", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-close-"));
  try {
    const first: RunManifest = { ...draft("focus"), runId: "run-20261030-focus-11111111", createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z" };
    const second: RunManifest = { ...draft("focus"), runId: "run-20261030-focus-22222222", createdAt: "2026-10-30T00:01:00.000Z", updatedAt: "2026-10-30T00:01:00.000Z" };
    assert.equal((await writeRunManifest(root, first)).ok, true);
    assert.equal((await writeRunManifest(root, second)).ok, true);
    const reason = "superseded-by:focus-next/run-20261030-focus-next-33333333";
    const closedFirst = await closeRun(root, first.runId, "closed", reason);
    assert.equal(closedFirst.ok, true);
    if (closedFirst.ok) {
      assert.equal(closedFirst.manifest.state, "closed");
      assert.equal(closedFirst.manifest.closeReason, reason);
      assert.ok(closedFirst.manifest.closedAt !== undefined);
    }
    const idempotent = await closeRun(root, first.runId, "closed", reason);
    assert.equal(idempotent.ok, true);
    if (idempotent.ok) assert.equal(idempotent.manifest.closedAt, closedFirst.ok ? closedFirst.manifest.closedAt : undefined);
    const closedSecond = await closeRun(root, second.runId, "cancelled", reason);
    assert.equal(closedSecond.ok, true);
    const listed = await listRunManifestsResult(root);
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.manifests.length, 2);
      assert.deepEqual(listed.manifests.map((manifest) => manifest.state).sort(), ["cancelled", "closed"]);
    }
    const active = await findActiveRun(root, "focus");
    assert.equal(active.ok, true);
    if (active.ok) assert.equal(active.manifest, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R1：listRunManifestsResult 保持 all-or-nothing（坏 manifest 整体失败；run-manifest.ts 零改动）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-listed-"));
  try {
    assert.equal((await writeRunManifest(root, draft("focus"))).ok, true);
    const badId = "run-20261030-broken-abcdef12";
    await fs.mkdir(path.dirname(runManifestPath(root, badId)), { recursive: true });
    await fs.writeFile(runManifestPath(root, badId), "{not-json\n", "utf8");
    const listed = await listRunManifestsResult(root);
    assert.equal(listed.ok, false);
    if (!listed.ok) assert.equal(listed.code, "run-manifest-invalid");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
