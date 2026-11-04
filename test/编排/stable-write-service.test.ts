// test/编排/stable-write-service.test.ts
// C2c 契约冻结测试：stable 写入确认 / 一次性许可 / post-write 复核消费 / mini re-pin /
// 异常恢复 / 无 drift；F13 permit 单一形状与 F16 执行点契约。
//
// 依据 P1.6 §4.5.1/§5.2.1、PM 复审 F5/F13/F16、AC-33/AC-34/AC-35（Service 层证据）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  STABLE_WRITE_PERMIT_STATUSES,
  STABLE_WRITE_PERMIT_TTL_MS,
  type StableWriteDecisionInput,
  type StableWritePermit,
} from "../../src/model/version-change.ts";
import {
  installStableWritePermitSnapshot,
  invalidateStableWritePermitSnapshot,
  stableWriteDecision,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import {
  stableWritePathOf,
  type PermitFact,
} from "../../src/service/version-change/public/version-change-service.ts";
import { createTestRig } from "./fixtures/version-change-service-fixture.ts";

const AT = "2026-11-04T10:00:00.000Z";
const TARGET = "workflow v2 内容（预览最终字节）";

test("stable 文件路径映射 + F13 permit 唯一形状/四状态/TTL", () => {
  const workflow = stableWritePathOf("workflow", "convener");
  assert.equal(workflow.ok, true);
  if (workflow.ok) assert.equal(workflow.value.path, "docs/workflow.md");

  const card = stableWritePathOf("role-card", "编排");
  assert.equal(card.ok, true);
  if (card.ok) assert.equal(card.value.path, "角色卡/编排/role-card.md");

  const boundary = stableWritePathOf("boundary", "编排");
  assert.equal(boundary.ok, true);
  if (boundary.ok) assert.equal(boundary.value.path, "角色卡/编排/boundary.yaml");

  const badKind = stableWritePathOf("contract", "编排");
  assert.equal(badKind.ok, false);
  const badRole = stableWritePathOf("role-card", "../escape");
  assert.equal(badRole.ok, false);

  assert.deepEqual([...STABLE_WRITE_PERMIT_STATUSES], ["approved", "consumed", "expired", "failed"]);
  assert.equal(STABLE_WRITE_PERMIT_TTL_MS, 30 * 60 * 1000);
});

test("request：应用计算 base/target sha（不信任自报哈希）、路径由 kind/roleId 唯一映射、幂等", async () => {
  const rig = createTestRig({ hashes: { "docs/workflow.md": "a".repeat(64) } });
  const targetSha = rig.hashes.sha256Content(TARGET);
  const first = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    diffPreview: "- 旧行\n+ 新行",
    at: AT,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value.requestId, "sw-1");
  assert.equal(first.value.path, "docs/workflow.md");
  assert.equal(first.value.kind, "workflow");
  assert.equal(first.value.baseSha256, "a".repeat(64));
  assert.equal(first.value.targetSha256, targetSha);
  assert.equal(first.value.status, "requested");
  assert.equal(first.value.diffPreview, "- 旧行\n+ 新行");

  const duplicate = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.requestId, first.value.requestId, "同内容重复请求幂等");

  const missingFile = await rig.services.stableWrite.request({
    roleId: "编排",
    kind: "role-card",
    content: "role card v2",
    at: AT,
  });
  assert.equal(missingFile.ok, true);
  if (missingFile.ok) assert.equal(missingFile.value.baseSha256, "", "写入前不存在 = 空串（F5）");

  const invalid = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "contract" as never,
    content: TARGET,
    at: AT,
  });
  assert.equal(invalid.ok, false, "未知 stable kind 拒绝");
  if (!invalid.ok) assert.equal(invalid.code, "stable-write-invalid");
});

test("approve/reject：客户确认 id 必备；一次性许可含 approvedAt/expiresAt；拒绝不写", async () => {
  const rig = createTestRig();
  const requested = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(requested.ok, true);
  if (!requested.ok) return;

  const noDecision = await rig.services.stableWrite.approve(requested.value.requestId, { at: AT });
  assert.equal(noDecision.ok, false);
  if (!noDecision.ok) assert.equal(noDecision.code, "stable-write-confirmation-missing");

  const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
    decisionId: "dec-sw-1",
    at: AT,
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const permit: PermitFact = approved.value.permit; // F13：PermitFact 是同一形状别名
  assert.equal(permit.status, "approved");
  assert.equal(permit.approvedAt, AT);
  assert.equal(permit.expiresAt, "2026-11-04T10:30:00.000Z");
  assert.deepEqual(permit.authority, { decisionId: "dec-sw-1" });
  assert.equal(permit.targetSha256, rig.hashes.sha256Content(TARGET));
  assert.equal(approved.value.record.status, "approved");
  assert.equal(approved.value.record.permitId, permit.permitId);
  assert.ok(rig.permits.snapshots.length > 0, "批准后安装 C2b 同步许可快照");

  const again = await rig.services.stableWrite.approve(requested.value.requestId, {
    decisionId: "dec-sw-1",
    at: AT,
  });
  assert.equal(again.ok, true, "重复批准幂等返回同一许可");
  if (again.ok) assert.equal(again.value.permit.permitId, permit.permitId);

  const rejectedRequest = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: "another content",
    at: AT,
  });
  assert.equal(rejectedRequest.ok, true);
  if (!rejectedRequest.ok) return;
  const rejected = await rig.services.stableWrite.reject(rejectedRequest.value.requestId, {
    confirmationId: "appointment-1",
    at: AT,
  });
  assert.equal(rejected.ok, true);
  if (rejected.ok) assert.equal(rejected.value.status, "rejected");
  const approveRejected = await rig.services.stableWrite.approve(rejectedRequest.value.requestId, {
    decisionId: "dec-x",
    at: AT,
  });
  assert.equal(approveRejected.ok, false, "拒绝后不可再批准（需新确认）");
});

test("completeWrite → post-write 复核消费 + mini re-pin（不升 trunkVersion，绑定 decisionId；F16/AC-34）", async () => {
  const rig = createTestRig({
    hashes: { "docs/workflow.md": "a".repeat(64) },
    trunkVersion: 3,
  });
  const requested = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(requested.ok, true);
  if (!requested.ok) return;
  const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
    decisionId: "dec-sw-1",
    at: AT,
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const targetSha = approved.value.permit.targetSha256;

  const completed = await rig.services.stableWrite.completeWrite({
    requestId: requested.value.requestId,
    actualSha256: targetSha,
    at: "2026-11-04T10:10:00.000Z",
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.record.status, "written");
  assert.equal(completed.value.record.writtenAt, "2026-11-04T10:10:00.000Z");
  assert.equal(completed.value.record.consumedAt, "2026-11-04T10:10:00.000Z");
  assert.equal(completed.value.permit.status, "consumed");
  assert.equal(completed.value.permit.consumedAt, "2026-11-04T10:10:00.000Z");
  assert.equal(completed.value.repin.applied, true);
  const audit = completed.value.repin.audit;
  assert.ok(audit !== undefined);
  if (audit !== undefined) {
    assert.equal(audit.op, "stable-repinned");
    assert.equal(audit.trunkVersion, 3, "mini re-pin 不升 trunkVersion（与事件前一致）");
    assert.equal(audit.path, "docs/workflow.md");
    assert.equal(audit.oldSha, "a".repeat(64));
    assert.equal(audit.newSha, targetSha);
    assert.equal(audit.decisionId, "dec-sw-1");
    assert.equal(audit.origin, "customer");
    assert.equal(audit.decidedBy, "customer");
  }
  assert.equal(rig.trunk.snapshots.length, 1);
  assert.equal(rig.trunk.snapshots[0].oldSha, "a".repeat(64));
  assert.equal(rig.trunk.snapshots[0].newSha, targetSha);

  const repeat = await rig.services.stableWrite.completeWrite({
    requestId: requested.value.requestId,
    actualSha256: targetSha,
    at: "2026-11-04T10:11:00.000Z",
  });
  assert.equal(repeat.ok, false);
  if (!repeat.ok) assert.equal(repeat.code, "stable-write-permit-consumed", "许可一次性");

  const noManifest = createTestRig({ manifestPresent: false });
  const req2 = await noManifest.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(req2.ok, true);
  if (!req2.ok) return;
  const app2 = await noManifest.services.stableWrite.approve(req2.value.requestId, {
    confirmationId: "appointment-2",
    at: AT,
  });
  assert.equal(app2.ok, true);
  if (!app2.ok) return;
  const done2 = await noManifest.services.stableWrite.completeWrite({
    requestId: req2.value.requestId,
    actualSha256: app2.value.permit.targetSha256,
    at: "2026-11-04T10:05:00.000Z",
  });
  assert.equal(done2.ok, true);
  if (done2.ok) {
    assert.equal(done2.value.repin.applied, false, "无 trunk manifest：只记待续接");
    assert.equal(done2.value.repin.pendingReattach, true);
    assert.equal(done2.value.repin.audit, undefined, "无 manifest 不虚构 stable-repinned 事件");
    assert.equal(done2.value.record.confirmationId, "appointment-2");
  }
});

test("异常 fail-closed：哈希不符/过期 ⇒ failed + 许可作废（不可复用），不更新快照、无 drift（AC-35）", async () => {
  {
    const rig = createTestRig({ hashes: { "docs/workflow.md": "a".repeat(64) } });
    const requested = await rig.services.stableWrite.request({
      roleId: "convener",
      kind: "workflow",
      content: TARGET,
      at: AT,
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) return;
    const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
      decisionId: "dec-1",
      at: AT,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const mismatch = await rig.services.stableWrite.completeWrite({
      requestId: requested.value.requestId,
      actualSha256: "f".repeat(64),
      at: "2026-11-04T10:05:00.000Z",
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.code, "stable-write-hash-mismatch");
    assert.equal(rig.stableWrites.records[0].status, "failed");
    assert.equal(rig.permits.permits[0].status, "failed", "失败许可作废");
    assert.equal(rig.trunk.snapshots.length, 0, "不更新 trunk 快照");
    assert.equal(await rig.services.stableWrite.findPermit("docs/workflow.md"), undefined);
    const reuse = await rig.services.stableWrite.completeWrite({
      requestId: requested.value.requestId,
      actualSha256: approved.value.permit.targetSha256,
      at: "2026-11-04T10:06:00.000Z",
    });
    assert.equal(reuse.ok, false, "失败许可不可复用");
  }
  {
    const rig = createTestRig({
      now: () => new Date("2026-11-04T10:40:00.000Z"),
      hashes: { "docs/workflow.md": "a".repeat(64) },
    });
    const requested = await rig.services.stableWrite.request({
      roleId: "convener",
      kind: "workflow",
      content: TARGET,
      at: AT,
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) return;
    const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
      decisionId: "dec-1",
      at: AT,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(
      await rig.services.stableWrite.findPermit("docs/workflow.md"),
      undefined,
      "过期许可不进入同步快照判定",
    );
    const expired = await rig.services.stableWrite.completeWrite({
      requestId: requested.value.requestId,
      actualSha256: approved.value.permit.targetSha256,
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.code, "stable-write-permit-expired");
    assert.equal(rig.permits.permits[0].status, "expired");
    assert.equal(rig.stableWrites.records[0].status, "failed");
    assert.equal(rig.trunk.snapshots.length, 0);
  }
});

test("fail() 异常恢复：记录/许可 failed 不可复用；已写入记录不能标失败（无 drift）", async () => {
  const rig = createTestRig();
  const requested = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(requested.ok, true);
  if (!requested.ok) return;
  const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
    decisionId: "dec-1",
    at: AT,
  });
  assert.equal(approved.ok, true);
  const failed = await rig.services.stableWrite.fail(requested.value.requestId, "写入异常，进入恢复");
  assert.equal(failed.ok, true);
  if (failed.ok) assert.equal(failed.value.status, "failed");
  assert.equal(rig.permits.permits[0].status, "failed");
  const again = await rig.services.stableWrite.fail(requested.value.requestId, "再次");
  assert.equal(again.ok, true, "失败标记幂等");
  assert.equal(await rig.services.stableWrite.findPermit("docs/workflow.md"), undefined);

  const approvedForWrite = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: "another",
    at: AT,
  });
  assert.equal(approvedForWrite.ok, true);
  if (!approvedForWrite.ok) return;
  const app2 = await rig.services.stableWrite.approve(approvedForWrite.value.requestId, {
    decisionId: "dec-2",
    at: AT,
  });
  assert.equal(app2.ok, true);
  if (!app2.ok) return;
  const written = await rig.services.stableWrite.completeWrite({
    requestId: approvedForWrite.value.requestId,
    actualSha256: app2.value.permit.targetSha256,
    at: "2026-11-04T10:05:00.000Z",
  });
  assert.equal(written.ok, true);
  const failAfterWrite = await rig.services.stableWrite.fail(approvedForWrite.value.requestId, "late");
  assert.equal(failAfterWrite.ok, false, "已写入记录不走 failed（异常写入走恢复）");
});

test("F13/F16 联合契约：PermitFact 可作 StableWriteDecisionInput.permit；record 与 permit 分表；Service 无写盘入口", async () => {
  const rig = createTestRig();
  const requested = await rig.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content: TARGET,
    at: AT,
  });
  assert.equal(requested.ok, true);
  if (!requested.ok) return;
  const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
    decisionId: "dec-1",
    at: AT,
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const permit: StableWritePermit = approved.value.permit;
  const decisionInput: StableWriteDecisionInput = {
    projectRoot: "C:/project",
    relPath: "docs/workflow.md",
    sha256: permit.targetSha256,
    permit,
    now: () => new Date(AT),
  };
  assert.equal(decisionInput.permit?.permitId, permit.permitId, "C2b stableWriteDecision 消费同一形状");
  assert.equal("permit" in approved.value.record, false, "record 与 permit 分表，record 不内嵌 permit");
  assert.deepEqual(
    Object.keys(permit).sort(),
    [
      "approvedAt",
      "authority",
      "baseSha256",
      "expiresAt",
      "issuedAt",
      "kind",
      "path",
      "permitId",
      "requestId",
      "roleId",
      "schema",
      "status",
      "targetSha256",
      "v",
    ],
    "permit 无第三形状（F13）",
  );
  assert.deepEqual(
    Object.keys(rig.services.stableWrite).sort(),
    ["approve", "completeWrite", "fail", "findPermit", "list", "reject", "request"],
    "F16：Service 只提供契约，无 writeFile/写盘方法；真实执行在 run-role gate + completeWrite",
  );
});

test("C2b/C2c 联合契约（F13/F16）：C2c 一次性许可经 C2b stableWriteDecision 判定（allowed/denied 映射）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "c2c-joint-stable-"));
  try {
    const rig = createTestRig();
    const requested = await rig.services.stableWrite.request({
      roleId: "编排",
      kind: "role-card",
      content: TARGET,
      at: AT,
    });
    assert.equal(requested.ok, true);
    if (!requested.ok) return;
    const approved = await rig.services.stableWrite.approve(requested.value.requestId, {
      decisionId: "dec-joint",
      at: AT,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const permit = approved.value.permit;
    assert.equal(permit.baseSha256, "", "临时项目无既有文件 ⇒ baseSha256 空串");
    installStableWritePermitSnapshot(root, [permit]);

    const allowed = stableWriteDecision({
      projectRoot: root,
      relPath: permit.path,
      sha256: permit.targetSha256,
      permit,
      now: () => new Date("2026-11-04T10:10:00.000Z"),
    });
    assert.equal(allowed.allowed, true, "同一 permit 形状 + 同一 target sha ⇒ allowed");
    if (allowed.allowed) {
      assert.equal(allowed.permitId, permit.permitId);
      assert.equal(allowed.decisionId, "dec-joint");
    }

    const hashMismatch = stableWriteDecision({
      projectRoot: root,
      relPath: permit.path,
      sha256: "f".repeat(64),
      permit,
      now: () => new Date("2026-11-04T10:10:00.000Z"),
    });
    assert.equal(hashMismatch.allowed, false);
    if (!hashMismatch.allowed) assert.equal(hashMismatch.code, "stable-write-hash-mismatch");

    const expired = stableWriteDecision({
      projectRoot: root,
      relPath: permit.path,
      sha256: permit.targetSha256,
      permit,
      now: () => new Date("2026-11-04T10:31:00.000Z"),
    });
    assert.equal(expired.allowed, false);
    if (!expired.allowed) assert.equal(expired.code, "stable-write-permit-expired");

    const pathMismatch = stableWriteDecision({
      projectRoot: root,
      relPath: "角色卡/其他角色/role-card.md",
      sha256: permit.targetSha256,
      permit,
      now: () => new Date("2026-11-04T10:10:00.000Z"),
    });
    assert.equal(pathMismatch.allowed, false);
    if (!pathMismatch.allowed) assert.equal(pathMismatch.code, "stable-write-path-mismatch");

    const consumedPermit: StableWritePermit = {
      ...permit,
      status: "consumed",
      consumedAt: "2026-11-04T10:10:00.000Z",
    };
    installStableWritePermitSnapshot(root, [consumedPermit]);
    const consumed = stableWriteDecision({
      projectRoot: root,
      relPath: consumedPermit.path,
      sha256: consumedPermit.targetSha256,
      permit: consumedPermit,
      now: () => new Date("2026-11-04T10:11:00.000Z"),
    });
    assert.equal(consumed.allowed, false);
    if (!consumed.allowed) assert.equal(consumed.code, "stable-write-permit-consumed");

    invalidateStableWritePermitSnapshot(root);
    const noSnapshot = stableWriteDecision({
      projectRoot: root,
      relPath: permit.path,
      sha256: permit.targetSha256,
      permit,
      now: () => new Date("2026-11-04T10:10:00.000Z"),
    });
    assert.equal(noSnapshot.allowed, false, "未安装快照 ⇒ fail-closed");
    if (!noSnapshot.allowed) {
      assert.equal(noSnapshot.code, "stable-write-invalid");
      assert.match(noSnapshot.reason, /快照/);
    }
  } finally {
    invalidateStableWritePermitSnapshot(root);
    await fs.rm(root, { recursive: true, force: true });
  }
});
