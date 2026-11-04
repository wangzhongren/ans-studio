// test/编排/trunk-runtime.test.ts
// S4 trunk-runtime 测试：status/reconcile、bootstrap、applyApproved（S3 re-pin）、
// 主干升级收窄（仅紧急/恢复 + 高危确认 + 拒绝版本化文档）、恢复 tN+1、stable mini re-pin 事件。
//
// 使用 S2 真实 Service + S1 真实存储 + S3 真实 `repinPinnedRun`（经 createRunRepinPort）；
// 事件为 fake 收集器（生产 = appendTaskEvent）。不写项目文档/账本。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { TaskStateEvent } from "../../src/model/runtime.ts";
import type { TrunkApplySnapshot, TrunkManifest } from "../../src/model/trunk.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  createTrunkProject,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

const AT3 = "2026-11-04T13:00:00.000Z";

interface Rig {
  project: TrunkProject;
  integration: ReturnType<typeof createVersionChangeIntegration>;
  trunkService: ReturnType<typeof createVersionChangeIntegration>["trunk"];
  runtime: TrunkRuntime;
  events: TaskStateEvent[];
}

async function setup(): Promise<Rig> {
  const project = await createTrunkProject();
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
    runRepin: createRunRepinPort(project.root),
  });
  const events: TaskStateEvent[] = [];
  const runtime = createTrunkRuntime({
    projectRoot: project.root,
    service: integration.trunk,
    emitEvent: async (event) => {
      events.push(event);
    },
    now: () => new Date(AT),
  });
  return { project, integration, trunkService: integration.trunk, runtime, events };
}

function snapshotOfManifest(manifest: TrunkManifest): TrunkApplySnapshot {
  const documents: TrunkApplySnapshot["documents"] = {};
  for (const kind of Object.keys(manifest.artifacts.documents)) {
    const ref = manifest.artifacts.documents[kind as keyof typeof manifest.artifacts.documents];
    if (ref !== undefined) documents[kind as keyof TrunkApplySnapshot["documents"]] = { path: ref.path, sha256: ref.sha256 };
  }
  const roleCards: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
    roleCards[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  const boundaries: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
    boundaries[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  return {
    trunkVersion: manifest.trunkVersion,
    runId: manifest.runId,
    documents,
    execution: {
      teamPlan:
        manifest.artifacts.execution.teamPlan === null
          ? null
          : { path: manifest.artifacts.execution.teamPlan.path, sha256: manifest.artifacts.execution.teamPlan.sha256 },
      flow:
        manifest.artifacts.execution.flow === null
          ? null
          : {
              path: manifest.artifacts.execution.flow.path,
              sha256: manifest.artifacts.execution.flow.sha256,
              version: manifest.artifacts.execution.flow.version,
            },
    },
    workflow: { path: manifest.artifacts.workflow.path, sha256: manifest.artifacts.workflow.sha256 },
    roleCards,
    boundaries,
  };
}

async function bootstrap(rig: Rig) {
  const result = await rig.runtime.bootstrap({
    flowId: FLOW_ID,
    runId: rig.project.runId,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    target: rig.project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message ?? ""}`);
  return result;
}

test("trunk-runtime：status/reconcile（无 journal）+ bootstrap t1 + 客户归属事件", async () => {
  const rig = await setup();
  try {
    const status = await rig.runtime.status();
    assert.equal(status.availability, "derived");
    const reconcile = await rig.runtime.reconcile();
    assert.deepEqual(reconcile, { ok: true, value: { state: "none", split: false } });
    assert.equal(rig.events.length, 0);

    const boot = await bootstrap(rig);
    if (!boot.ok) return;
    assert.equal(boot.value.manifest.trunkVersion, 1);
    assert.equal(boot.value.manifest.source, "bootstrap");
    assert.equal(rig.events.length, 1);
    const event = rig.events[0]!;
    assert.equal(event.kind, "trunk.state");
    if (event.kind === "trunk.state") {
      assert.equal(event.op, "switched");
      assert.equal(event.trunkVersion, 1);
      assert.equal(event.origin, "customer");
      assert.equal(event.decidedBy, "customer");
      assert.equal(event.decisionId, "dec-boot");
    }
    assert.equal((await rig.runtime.status()).availability, "frozen");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk-runtime：applyApproved（upgrade）经 S3 re-pin；事件与 verify 一致", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const frozen = await rig.project.registry.appendDocFreezeRecords([
      {
        path: v2,
        version: 2,
        sha256: v2sha,
        freeze: {
          schema: "doc-freeze/v1",
          applicationId: "vc-up",
          reason: "version-upgrade-approved",
          origin: "customer",
          decidedBy: "customer",
          decisionId: "dec-up",
          frozenAt: AT2,
        },
      },
    ]);
    assert.deepEqual(frozen, { ok: true });
    // 外部（夹具/其他会话）写入 baseline 后，刷新 S2/C2b 快照（生产 = 会话启动/refresh 钩子）
    await rig.integration.services.freeze.ensureReady();

    const status = await rig.trunkService.status();
    assert.ok(status.manifest !== undefined);
    const target = snapshotOfManifest(status.manifest!);
    target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
    const applied = await rig.runtime.applyApproved({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-up",
      decisionId: "dec-up",
      runId: rig.project.runId,
      baseTrunkVersion: 1,
      target,
      repin: { runId: rig.project.runId, targets: [{ kind: "proposal", path: v2, sha256: v2sha }] },
      journalId: "j-up",
      at: AT2,
    });
    assert.equal(applied.ok, true, applied.ok ? "" : `${applied.code}: ${applied.message ?? ""}`);
    if (!applied.ok) return;
    assert.equal(applied.value.manifest.trunkVersion, 2);
    const switched = rig.events.filter((event) => event.kind === "trunk.state").at(-1);
    assert.equal(switched?.kind === "trunk.state" ? switched.op : undefined, "switched");
    assert.equal(switched?.kind === "trunk.state" ? switched.previousTrunkVersion : undefined, 1);
    const verify = await rig.trunkService.verify();
    assert.deepEqual(verify, { ok: true, violations: [] });
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk-runtime：主干升级收窄（仅 emergency/recovery、高危确认、拒绝版本化文档变更）", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const status = await rig.trunkService.status();
    const current = status.manifest!;
    const base = snapshotOfManifest(current);

    const noHighRisk = await rig.runtime.mainUpgrade({
      reason: "emergency",
      decisionId: "dec-mu",
      highRisk: { acknowledged: false as never },
      flowId: FLOW_ID,
      runId: rig.project.runId,
      target: base,
      at: AT2,
    });
    assert.equal(noHighRisk.ok, false);
    if (!noHighRisk.ok) assert.equal(noHighRisk.code, "trunk-high-risk-unacknowledged");

    const badScope = await rig.runtime.mainUpgrade({
      reason: "emergency",
      decisionId: "dec-mu",
      highRisk: { acknowledged: true },
      flowId: FLOW_ID,
      runId: rig.project.runId,
      target: { ...base, documents: { ...base.documents, proposal: { path: PATHS.proposal, sha256: sha256("changed") } } },
      at: AT2,
    });
    assert.equal(badScope.ok, false);
    if (!badScope.ok) {
      assert.equal(badScope.code, "trunk-apply-failed");
      assert.match(badScope.message ?? "", /版本化文档/);
    }

    // stable 快照 re-pin（workflow 内容变化是 emergency 允许的稳定文件场景）
    const newWorkflow = "# workflow emergency\n";
    const newSha = await writeProjectFile(rig.project.root, PATHS.workflow, newWorkflow);
    const stableTarget = { ...base, workflow: { path: PATHS.workflow, sha256: newSha } };
    const upgraded = await rig.runtime.mainUpgrade({
      reason: "emergency",
      decisionId: "dec-mu",
      highRisk: { acknowledged: true, items: ["workflow 紧急修复"] },
      flowId: FLOW_ID,
      runId: rig.project.runId,
      target: stableTarget,
      journalId: "j-mu",
      at: AT2,
    });
    assert.equal(upgraded.ok, true, upgraded.ok ? "" : `${upgraded.code}: ${upgraded.message ?? ""}`);
    if (!upgraded.ok) return;
    assert.equal(upgraded.value.manifest.trunkVersion, 2);
    assert.equal(upgraded.value.manifest.source, "upgrade");
    assert.equal(upgraded.value.manifest.artifacts.workflow.sha256, newSha);
    const last = rig.events.filter((event) => event.kind === "trunk.state").at(-1);
    assert.equal(last?.kind === "trunk.state" ? last.decidedBy : undefined, "customer");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk-runtime：stable mini re-pin 不升 trunkVersion + 事件；无 manifest 待续接", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const before = await rig.trunkService.status();
    const oldSha = before.manifest!.artifacts.workflow.sha256;
    const newSha = await writeProjectFile(rig.project.root, PATHS.workflow, "# workflow v2\n");
    const repinned = await rig.runtime.completeStableWrite({
      kind: "workflow",
      roleId: "convener",
      path: PATHS.workflow,
      oldSha,
      newSha,
      decisionId: "dec-sw",
      at: AT2,
    });
    assert.equal(repinned.applied, true);
    const after = await rig.trunkService.status();
    assert.equal(after.manifest!.trunkVersion, before.manifest!.trunkVersion);
    assert.equal(after.manifest!.artifacts.workflow.sha256, newSha);
    const event = rig.events.filter((item) => item.kind === "trunk.state").at(-1);
    assert.equal(event?.kind === "trunk.state" ? event.op : undefined, "stable-repinned");
    if (event?.kind === "trunk.state") {
      assert.equal(event.trunkVersion, before.manifest!.trunkVersion);
      assert.equal(event.oldSha, oldSha);
      assert.equal(event.newSha, newSha);
      assert.equal(event.decidedBy, "customer");
    }
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  const fresh = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const integration = createVersionChangeIntegration({
      projectRoot: fresh.root,
      now: () => new Date(AT),
      migrationCompleted: () => true,
    });
    const events: TaskStateEvent[] = [];
    const runtime = createTrunkRuntime({
      projectRoot: fresh.root,
      service: integration.trunk,
      emitEvent: async (event) => {
        events.push(event);
      },
      now: () => new Date(AT),
    });
    const pending = await runtime.completeStableWrite({
      kind: "workflow",
      roleId: "convener",
      path: PATHS.workflow,
      oldSha: "",
      newSha: sha256("x"),
      at: AT2,
    });
    assert.deepEqual(pending, { applied: false, pendingReattach: true });
    assert.equal(events.length, 0, "无 manifest 不写 stable-repinned 事件（只记待续接）");
  } finally {
    await fs.rm(fresh.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk-runtime：恢复（客户确认 tN+1）+ reconcile 补写事件", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    await fs.writeFile(path.join(rig.project.root, ".ans/trunk/manifest.json"), "{broken", "utf8");
    const recovered = await rig.runtime.recover({
      decisionId: "dec-rec",
      reason: "manifest-corrupt",
      journalId: "j-rec",
      at: AT2,
    });
    assert.equal(recovered.ok, true, recovered.ok ? "" : `${recovered.code}: ${recovered.message ?? ""}`);
    if (!recovered.ok) return;
    assert.equal(recovered.value.manifest.source, "recovery");
    assert.equal(recovered.value.manifest.trunkVersion, 2);
    const event = rig.events.filter((item) => item.kind === "trunk.state").at(-1);
    assert.equal(event?.kind === "trunk.state" ? event.op : undefined, "recovered");
    assert.equal(event?.kind === "trunk.state" ? event.reason : undefined, "manifest-corrupt");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk-runtime：reconcile 在提交点后 phase 滞后时识别 split，且不伪造客户事件（C2a 归属）", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const journalRead = await rig.project.store.readJournal();
    assert.equal(journalRead.ok, true);
    if (!journalRead.ok) return;
    const lagging = { ...journalRead.value, phase: "prepared" as const, result: undefined };
    assert.deepEqual(await rig.project.store.writeJournal(lagging), { ok: true });
    const before = rig.events.length;
    const reconciled = await rig.runtime.reconcile();
    assert.equal(reconciled.ok, true);
    if (!reconciled.ok) return;
    assert.equal(reconciled.value.state, "committed");
    assert.equal(reconciled.value.split, true);
    // S6：journal/audit 无法解析客户 decisionId/confirmationId ⇒ **不补写客户 op**（C2a 会拒
    // switched=application）；只返回 split 诊断，账本零错误。
    assert.equal(rig.events.length, before, "不得伪造 switched 客户事件");
    assert.ok(
      !rig.events.slice(before).some((event) => event.kind === "trunk.state"),
      "reconcile 不追加任何 trunk.state（无客户绑定）",
    );
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
