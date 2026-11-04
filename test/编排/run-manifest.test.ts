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
  applyRunChange,
  closeRun,
  ensureDraftRun,
  findActiveRun,
  listRunManifestsResult,
  pinRun,
  prepareRunPin,
  readRunManifest,
  repinPinnedRun,
  runManifestPath,
  validateRunManifest,
  verifyPinnedRun,
  writeRunManifest,
  type RunManifest,
} from "../../src/common/编排/run-manifest.ts";
import {
  appendDocFreezeRecords,
  recordVersionedDocBaselines,
  refreshVersionedDocFreezeSnapshot,
  versionedDocFreezeState,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import {
  AT2,
  PATHS,
  createTrunkProject,
  sha256,
  writeProjectFile,
} from "./fixtures/trunk-project.ts";

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

// ————————————————— 2026-11-03（客户授权平面 Q9 A）：decidedBy:"directive" + directiveId —————————————————

test("Q9 A：applyRunChange 接受 directive + directiveId 并写入 manifest；缺/非法 id 拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-manifest-directive-"));
  try {
    const base = pinned();
    assert.equal((await writeRunManifest(root, base)).ok, true);
    const applied = await applyRunChange(root, base, {
      decisionId: "decision-directive-1",
      mode: "continue-frozen",
      decidedBy: "directive",
      directiveId: "d-7",
      decidedAt: "2026-11-03T00:00:00.000Z",
    });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    const read = await readRunManifest(root, base.runId);
    assert.equal(read.ok, true);
    if (read.ok) {
      assert.equal(read.manifest.runChange?.decidedBy, "directive");
      assert.equal(read.manifest.runChange?.directiveId, "d-7");
    }

    const missing = await applyRunChange(root, base, {
      decisionId: "decision-directive-2",
      mode: "continue-frozen",
      decidedBy: "directive",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, "run-change-invalid");
      assert.match(missing.reason, /directiveId/);
    }
    const bad = await applyRunChange(root, base, {
      decisionId: "decision-directive-3",
      mode: "continue-frozen",
      decidedBy: "directive",
      directiveId: "d-01",
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "run-change-invalid");

    const legacy = await applyRunChange(root, base, {
      decisionId: "decision-customer-1",
      mode: "continue-frozen",
      decidedBy: "customer",
    });
    assert.equal(legacy.ok, true, "旧二值调用不变");
    if (legacy.ok) assert.equal(legacy.manifest.runChange?.directiveId, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// —————————————— 2026-11-04（trunk-amendment S3）：pin/re-pin 冻结校验 ——————————————

test("S3：首次 handoff pin 先写 handoff-pin-bootstrap 冻结再 pin；repin 追加 repins/幂等/未冻结拒绝", async () => {
  const project = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const draft = await ensureDraftRun(project.root, "demo");
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    const facts = { d3: { decisionId: "dec-pin", targetRoleIds: ["impl"] } };
    const pinned = await pinRun(project.root, draft.manifest.runId, facts);
    assert.equal(pinned.ok, true, pinned.ok ? "" : pinned.reason);
    if (!pinned.ok) return;
    assert.equal(pinned.manifest.state, "pinned");
    const baseline = await fs.readFile(path.join(project.root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"reason":"handoff-pin-bootstrap"/);
    assert.match(baseline, /"applicationId":"bootstrap-handoff-pin"/);
    assert.equal(versionedDocFreezeState(project.root, PATHS.proposal, true), "frozen");

    const again = await pinRun(project.root, draft.manifest.runId, facts);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.alreadyPinned, true);

    // re-pin：v2 先冻结 → 同 runId 更新 refs + repins（保留 createdAt/runId/flowId；幂等）
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const at = "2026-11-04T12:30:00.000Z";
    const frozen = await appendDocFreezeRecords([
      {
        projectRoot: project.root,
        relPath: v2,
        sha256: v2sha,
        freeze: {
          schema: "doc-freeze/v1",
          applicationId: "vc-1",
          reason: "detail-item-applied",
          origin: "customer",
          decidedBy: "customer",
          decisionId: "dec-vca",
          frozenAt: at,
        },
      },
    ]);
    assert.equal(frozen.ok, true);
    const repinned = await repinPinnedRun(project.root, draft.manifest.runId, {
      targets: [{ kind: "proposal", path: v2, sha256: v2sha }],
      applicationId: "vc-1",
      decisionId: "dec-vca",
      at,
    });
    assert.equal(repinned.ok, true, repinned.ok ? "" : repinned.reason);
    if (!repinned.ok) return;
    assert.equal(repinned.alreadyApplied, false);
    assert.equal(repinned.manifest.runId, draft.manifest.runId);
    assert.equal(repinned.manifest.flowId, "demo");
    assert.equal(repinned.manifest.createdAt, pinned.manifest.createdAt);
    assert.equal(repinned.manifest.documents.proposal?.path, v2);
    assert.equal(repinned.manifest.repins?.length, 1);
    assert.equal(repinned.manifest.repins?.[0]?.schema, "run-repin/v1");
    assert.equal(repinned.manifest.repins?.[0]?.applicationId, "vc-1");
    assert.equal(repinned.manifest.repins?.[0]?.decisionId, "dec-vca");
    const repeat = await repinPinnedRun(project.root, draft.manifest.runId, {
      targets: [{ kind: "proposal", path: v2, sha256: v2sha }],
      applicationId: "vc-1",
      at,
    });
    assert.equal(repeat.ok, true);
    if (repeat.ok) {
      assert.equal(repeat.alreadyApplied, true);
      assert.equal(repeat.manifest.repins?.length, 1);
    }

    // 未冻结的新版本 ⇒ versioned-doc-not-frozen（ready 语义，fail-closed）
    const v3 = "docs/proposals/demo-proposal-v3.md";
    const v3sha = await writeProjectFile(project.root, v3, "---\nschema: project-proposal/v2\n---\n# proposal v3\n");
    const denied = await repinPinnedRun(project.root, draft.manifest.runId, {
      targets: [{ kind: "proposal", path: v3, sha256: v3sha }],
      applicationId: "vc-2",
      at,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "versioned-doc-not-frozen");

    // 哈希不符（磁盘字节重算，不信任自报）
    const badHash = await repinPinnedRun(project.root, draft.manifest.runId, {
      targets: [{ kind: "proposal", path: v2, sha256: "f".repeat(64) }],
      applicationId: "vc-1",
      at,
    });
    assert.equal(badHash.ok, false);
    if (!badHash.ok) assert.equal(badHash.code, "run-pin-hash-mismatch");

  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("S3：prepareRunPin 在 ready 语义（已有冻结记录）下拒绝未冻结的最新版本化文档", async () => {
  const project = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    // 仅冻结 intent ⇒ baseline 出现冻结记录（ready 语义）；proposal 等仍为草稿
    const intentSha = sha256(await fs.readFile(path.join(project.root, PATHS.intent), "utf8"));
    const frozen = await appendDocFreezeRecords([
      {
        projectRoot: project.root,
        relPath: PATHS.intent,
        sha256: intentSha,
        freeze: {
          schema: "doc-freeze/v1",
          applicationId: "migration",
          reason: "migrated-legacy",
          origin: "application",
          frozenAt: "2026-11-04T12:30:00.000Z",
        },
      },
    ]);
    assert.equal(frozen.ok, true);
    await refreshVersionedDocFreezeSnapshot(project.root, { migrationCompleted: true });
    const prepared = await prepareRunPin(project.root, "demo", {
      d3: { decisionId: "dec-x", targetRoleIds: ["impl"] },
    });
    assert.equal(prepared.ok, false);
    if (!prepared.ok) assert.equal(prepared.code, "versioned-doc-not-frozen");
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("S3：legacy baseline（无冻结记录）按 F29 默认冻结允许 pin、不写 bootstrap；baseline corrupt ⇒ pin fail-closed 指针不变", async () => {
  const legacy = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const recorded = await recordVersionedDocBaselines({ projectRoot: legacy.root, recordedBy: "app:test" });
    assert.ok(recorded > 0);
    const draft = await ensureDraftRun(legacy.root, "demo");
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    const pinned = await pinRun(legacy.root, draft.manifest.runId, {
      d3: { decisionId: "dec-legacy", targetRoleIds: ["impl"] },
    });
    assert.equal(pinned.ok, true, pinned.ok ? "" : pinned.reason);
    const text = await fs.readFile(path.join(legacy.root, ".ans/state/versions.jsonl"), "utf8");
    assert.ok(!text.includes("handoff-pin-bootstrap"), "legacy 已初始化 baseline：不写 bootstrap 冻结");
  } finally {
    await fs.rm(legacy.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  const corrupt = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    await fs.mkdir(path.join(corrupt.root, ".ans/state"), { recursive: true });
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.initialized"), "{}\n", "utf8");
    const draft = await ensureDraftRun(corrupt.root, "demo");
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    const pinned = await pinRun(corrupt.root, draft.manifest.runId, {
      d3: { decisionId: "dec-corrupt", targetRoleIds: ["impl"] },
    });
    assert.equal(pinned.ok, false);
    if (!pinned.ok) assert.equal(pinned.code, "versioned-doc-not-frozen");
    const after = await readRunManifest(corrupt.root, draft.manifest.runId);
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.manifest.state, "draft", "pin 失败不改 run 指针");
  } finally {
    await fs.rm(corrupt.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
