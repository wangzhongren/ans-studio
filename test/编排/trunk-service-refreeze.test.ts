// test/编排/trunk-service-refreeze.test.ts
// S5/Batch 3.5：trunk service 客户动作 API 测试——
// `refreeze`（只 stable 快照/客户 decisionId + 高危确认/磁盘复核/不升 trunkVersion）、
// `abandonUpgrade`（关闭解冻窗口、不 re-pin、指针不变）、`history`（只读归档版本）。
//
// 使用 S1 真实存储 + S2 真实 trunk service（fixture）；不写账本（返回审计载荷）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { TrunkManifest } from "../../src/model/trunk.ts";
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

async function bootstrap(project: TrunkProject): Promise<TrunkManifest> {
  const boot = await project.service.executeApply({
    source: "bootstrap",
    flowId: FLOW_ID,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    runId: project.runId,
    baseTrunkVersion: null,
    target: project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
  if (!boot.ok) throw new Error("unreachable");
  return boot.value.manifest;
}

test("refreeze：只更新 stable 快照（workflow/roleCards/boundaries）、不升 trunkVersion、客户审计", async () => {
  const project = await createTrunkProject();
  try {
    const manifest = await bootstrap(project);
    const oldVersion = manifest.trunkVersion;

    const workflowContent = "# workflow refrozen\n";
    const workflowSha = await writeProjectFile(project.root, PATHS.workflow, workflowContent);
    const cardContent = "# role card impl refrozen\n";
    const cardSha = await writeProjectFile(project.root, PATHS.roleCard, cardContent);
    const boundaryContent = await fs.readFile(
      (await import("node:path")).join(project.root, PATHS.boundary),
      "utf8",
    ).then((text) => `${text}  # refrozen marker\n`);
    const boundarySha = await writeProjectFile(project.root, PATHS.boundary, boundaryContent);

    const refrozen = await project.service.refreeze({
      decisionId: "dec-refreeze",
      reason: "upgrade-complete",
      highRisk: { acknowledged: true, items: ["workflow/role-card/boundary 重新冻结"] },
      target: {
        workflow: { path: PATHS.workflow, sha256: workflowSha },
        roleCards: { impl: { path: PATHS.roleCard, sha256: cardSha } },
        boundaries: { impl: { path: PATHS.boundary, sha256: boundarySha } },
      },
      at: AT3,
    });
    assert.equal(refrozen.ok, true, refrozen.ok ? "" : `${refrozen.code}: ${refrozen.message ?? ""}`);
    if (!refrozen.ok) return;
    assert.equal(refrozen.value.manifest.trunkVersion, oldVersion, "重新冻结不升 trunkVersion");
    assert.equal(refrozen.value.manifest.artifacts.workflow.sha256, workflowSha);
    assert.equal(refrozen.value.manifest.artifacts.roleCards?.impl.sha256, cardSha);
    assert.equal(refrozen.value.manifest.artifacts.boundaries.impl.sha256, boundarySha);
    assert.deepEqual(
      [...refrozen.value.changed].sort(),
      ["boundaries.impl", "roleCards.impl", "workflow"],
    );
    assert.equal(refrozen.value.audit.op, "refrozen");
    assert.equal(refrozen.value.audit.origin, "customer");
    assert.equal(refrozen.value.audit.decidedBy, "customer");
    assert.equal(refrozen.value.audit.decisionId, "dec-refreeze");
    assert.equal(refrozen.value.audit.trunkVersion, oldVersion);

    // 落盘 manifest 已更新且 digest 复算（verify 仍一致）
    const read = await project.store.readManifest();
    assert.equal(read.ok, true);
    if (read.ok) assert.equal(read.value.artifacts.workflow.sha256, workflowSha);
    const verify = await project.service.verify();
    assert.deepEqual(verify, { ok: true, violations: [] });
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("refreeze：拒绝版本化文档/execution、哈希不符、缺客户确认（失败不改指针）", async () => {
  const project = await createTrunkProject();
  try {
    const manifest = await bootstrap(project);
    const before = await project.store.readManifest();
    assert.equal(before.ok, true);

    const missingDecision = await project.service.refreeze({
      decisionId: "",
      reason: "x",
      highRisk: { acknowledged: true },
      target: {},
      at: AT3,
    });
    assert.equal(missingDecision.ok, false);
    if (!missingDecision.ok) assert.equal(missingDecision.code, "trunk-high-risk-unacknowledged");

    const missingHighRisk = await project.service.refreeze({
      decisionId: "dec-rf",
      reason: "x",
      target: {},
      at: AT3,
    });
    assert.equal(missingHighRisk.ok, false);
    if (!missingHighRisk.ok) assert.equal(missingHighRisk.code, "trunk-high-risk-unacknowledged");

    // 版本化文档不在 refreeze 目标面（只接受 stable）⇒ 无 stable 变更 ⇒ 拒绝
    const versionedOnly = await project.service.refreeze({
      decisionId: "dec-rf",
      reason: "x",
      highRisk: { acknowledged: true },
      target: { documents: { proposal: { path: PATHS.proposal, sha256: manifest.artifacts.documents.proposal!.sha256 } } } as never,
      at: AT3,
    });
    assert.equal(versionedOnly.ok, false);
    if (!versionedOnly.ok) assert.equal(versionedOnly.code, "trunk-apply-failed");

    // 哈希不符（未落盘新内容）⇒ 拒绝
    const mismatch = await project.service.refreeze({
      decisionId: "dec-rf",
      reason: "x",
      highRisk: { acknowledged: true },
      target: { workflow: { path: PATHS.workflow, sha256: sha256("not-on-disk") } },
      at: AT3,
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, "trunk-apply-failed");
      assert.match(mismatch.message ?? "", /哈希不符/);
    }
    const after = await project.store.readManifest();
    assert.equal(after.ok, true);
    if (after.ok && before.ok) assert.deepEqual(after.value, before.value, "失败不改指针");
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("abandonUpgrade：不 re-pin、不改指针、旧主干继续有效；缺客户确认拒绝", async () => {
  const project = await createTrunkProject();
  try {
    const manifest = await bootstrap(project);
    assert.equal(
      (
        await project.service.abandonUpgrade({
          decisionId: "",
          reason: "cancel",
          at: AT3,
        })
      ).ok,
      false,
    );
    const abandoned = await project.service.abandonUpgrade({
      decisionId: "dec-abandon",
      reason: "客户取消主干升级",
      at: AT3,
    });
    assert.equal(abandoned.ok, true, abandoned.ok ? "" : `${abandoned.code}: ${abandoned.message ?? ""}`);
    if (!abandoned.ok) return;
    assert.equal(abandoned.value.audit.op, "refrozen-cancelled");
    assert.equal(abandoned.value.audit.origin, "customer");
    assert.equal(abandoned.value.audit.decidedBy, "customer");
    assert.equal(abandoned.value.audit.decisionId, "dec-abandon");
    const read = await project.store.readManifest();
    assert.equal(read.ok, true);
    if (read.ok) {
      assert.equal(read.value.trunkVersion, manifest.trunkVersion);
      assert.deepEqual(read.value, manifest, "放弃升级不改 manifest");
    }
    const verify = await project.service.verify();
    assert.deepEqual(verify, { ok: true, violations: [] });
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("history：只读归档版本（升级后旧版本入 history；当前版本单列）", async () => {
  const project = await createTrunkProject();
  try {
    await bootstrap(project);
    const empty = await project.service.history();
    assert.equal(empty.ok, true);
    if (empty.ok) {
      assert.deepEqual(empty.value.versions, []);
      assert.equal(empty.value.currentTrunkVersion, 1);
    }

    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(project.root, v2, "version: 2\n# proposal v2\n");
    const frozen = await project.registry.appendDocFreezeRecords([
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
    const status = await project.service.status();
    const target = project.snapshot();
    target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
    assert.ok(status.manifest !== undefined);
    const applied = await project.service.executeApply({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-up",
      decisionId: "dec-up",
      runId: project.runId,
      baseTrunkVersion: 1,
      target,
      journalId: "j-up",
      at: AT2,
    });
    assert.equal(applied.ok, true);
    const history = await project.service.history();
    assert.equal(history.ok, true);
    if (history.ok) {
      assert.deepEqual(history.value.versions, [1]);
      assert.equal(history.value.currentTrunkVersion, 2);
    }
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
