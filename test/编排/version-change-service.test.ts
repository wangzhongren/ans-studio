// test/编排/version-change-service.test.ts
// C2c 契约冻结测试：VCA 状态机/发起角色/目标/作者写区/baseTrunk/bootstrap/幂等/并发/
// targets↔items/批准前哈希重验/冻结迁移与 bootstrap/轻量重构校验。
//
// 依据 P1.6 §4.4/§4.5/§4.8/§5.1/§5.2、AC-1/2/3/4/5/6/7/8/10/14/19/21/25/26/28/29/30/32。
// 夹具为纯内存 Port（无文件系统/账本）；本测试不改任何既有断言、不跳过用例。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  appendDocDraftMarkerRecords,
  appendDocFreezeRecords,
  buildVersionedDocFreezeSnapshot,
  installVersionedDocFreezeSnapshot,
  refreshVersionedDocFreezeSnapshot,
  versionedDocFreezeState,
  type VersionBaselineRecord,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";

import {
  VERSION_CHANGE_SERVICE_CONTRACT_VERSION,
  authorRoleForTargetKind,
  canTransitionVersionChange,
  docVersionOf,
  matchTargetsToItems,
  targetPathInAuthorArea,
} from "../../src/service/version-change/public/version-change-service.ts";
import {
  AMENDMENT_PATH,
  CONTRACT_PATH,
  EXECUTION_PATH,
  H1,
  H2,
  H3,
  ROSTER_PATH,
  TRUNK_V1,
  createTestRig,
  detailCreateInput,
  fileMapForVca,
  upgradeCreateInput,
} from "./fixtures/version-change-service-fixture.ts";

test("C2c 契约版本与状态转移表（create/submit/approve/reject/apply）", () => {
  assert.equal(VERSION_CHANGE_SERVICE_CONTRACT_VERSION, "version-change-service/v1");
  assert.equal(canTransitionVersionChange("draft", "submitted"), true);
  assert.equal(canTransitionVersionChange("draft", "approved"), false);
  assert.equal(canTransitionVersionChange("submitted", "approved"), true);
  assert.equal(canTransitionVersionChange("submitted", "rejected"), true);
  assert.equal(canTransitionVersionChange("approved", "applied"), true);
  assert.equal(canTransitionVersionChange("approved", "rejected"), false);
  assert.equal(canTransitionVersionChange("rejected", "submitted"), false);
  assert.equal(canTransitionVersionChange("applied", "superseded"), false);
  assert.equal(canTransitionVersionChange("superseded", "submitted"), false);
});

test("VCA 发起角色唯一：version-upgrade 仅 product，detail-amendment 仅 rapporteur", async () => {
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(upgradeCreateInput({ initiatorRoleId: "rapporteur" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "vca-role-not-allowed");
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(detailCreateInput({ initiatorRoleId: "product" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "vca-role-not-allowed");
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(upgradeCreateInput());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.status, "draft");
      assert.equal(result.value.applicationId, "vc-1");
      assert.equal(result.value.initiatorRoleId, "product");
    }
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(detailCreateInput());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.initiatorRoleId, "rapporteur");
  }
});

test("VCA 目标矩阵：upgrade 只 contract/roster；detail 可 execution；workflow/boundary/product-intent 拒绝", async () => {
  const cases: Array<{ name: string; input: ReturnType<typeof upgradeCreateInput> | ReturnType<typeof detailCreateInput>; code: string }> = [
    {
      name: "upgrade + execution",
      input: upgradeCreateInput({ targets: [{ kind: "execution", path: EXECUTION_PATH, action: "modify" }] }),
      code: "vca-target-invalid",
    },
    {
      name: "detail + workflow",
      input: detailCreateInput({ targets: [{ kind: "workflow", path: "docs/workflow.md", action: "modify" }] }),
      code: "vca-boundary-forbidden",
    },
    {
      name: "detail + boundary",
      input: detailCreateInput({ targets: [{ kind: "boundary", path: "角色卡/编排/boundary.yaml", action: "modify" }] }),
      code: "vca-boundary-forbidden",
    },
    {
      name: "upgrade + product-intent",
      input: upgradeCreateInput({ targets: [{ kind: "product-intent", path: "docs/product/demo-intent-v2.md", action: "modify" }] }),
      code: "vca-target-invalid",
    },
    {
      name: "contract 不在作者写区",
      input: upgradeCreateInput({ targets: [{ kind: "contract", path: "src/service/foo.ts", action: "modify" }] }),
      code: "vca-target-invalid",
    },
    {
      name: "目标文件不存在",
      input: upgradeCreateInput({ targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v9.md", action: "modify" }] }),
      code: "vca-target-invalid",
    },
  ];
  for (const item of cases) {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(item.input);
    assert.equal(result.ok, false, item.name);
    if (!result.ok) assert.equal(result.code, item.code, item.name);
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(
      detailCreateInput({
        targets: [{ kind: "execution", path: EXECUTION_PATH, action: "modify" }],
        amendmentItems: [{ itemId: "item-1", kind: "execution", change: "modify", to: EXECUTION_PATH }],
      }),
    );
    assert.equal(result.ok, true, "detail 允许 execution target");
  }
});

test("作者写区/kind 映射纯函数（AC-19/AC-29）", () => {
  assert.equal(authorRoleForTargetKind("contract"), "rapporteur");
  assert.equal(authorRoleForTargetKind("roster"), "rapporteur");
  assert.equal(authorRoleForTargetKind("execution"), "convener");
  assert.equal(authorRoleForTargetKind("workflow"), undefined);
  assert.equal(targetPathInAuthorArea("contract", CONTRACT_PATH), true);
  assert.equal(targetPathInAuthorArea("roster", ROSTER_PATH), true);
  assert.equal(targetPathInAuthorArea("execution", EXECUTION_PATH), true);
  assert.equal(targetPathInAuthorArea("execution", "docs/flows/demo.yaml"), true);
  assert.equal(targetPathInAuthorArea("contract", EXECUTION_PATH), false);
  assert.equal(targetPathInAuthorArea("workflow", "docs/workflow.md"), false);
  assert.equal(docVersionOf(CONTRACT_PATH), 2);
  assert.equal(docVersionOf(AMENDMENT_PATH), 1);
  assert.equal(docVersionOf("docs/flows/demo.yaml"), undefined);
});

test("targets↔items 一致性（F36/F42/AC-28）：none 不是 target、无实际变更/额外项拒绝", async () => {
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(
      detailCreateInput({
        amendmentItems: [{ itemId: "item-1", kind: "contract", change: "none", to: CONTRACT_PATH }],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "vca-invalid");
      assert.match(result.message ?? "", /no-applicable-changes/);
    }
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(detailCreateInput({ amendmentItems: [] }));
    assert.equal(result.ok, false);
  }
  {
    const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
    const result = await rig.services.vca.create(
      detailCreateInput({
        amendmentItems: [{ itemId: "item-1", kind: "workflow", change: "modify", to: "docs/workflow.md" }],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "vca-invalid");
  }
  const checked = matchTargetsToItems({
    targets: [{ kind: "contract", path: CONTRACT_PATH, toSha256: H1 }],
    items: [
      { itemId: "a", kind: "contract", change: "modify", to: CONTRACT_PATH, toSha256: H1 },
      { itemId: "b", kind: "roster", change: "modify", to: ROSTER_PATH },
    ],
  });
  assert.equal(checked.ok, false, "额外 item 无对应 target 必须拒绝");
  const duplicated = matchTargetsToItems({
    targets: [
      { kind: "contract", path: CONTRACT_PATH, toSha256: H1 },
      { kind: "contract", path: CONTRACT_PATH, toSha256: H1 },
    ],
    items: [{ itemId: "a", kind: "contract", change: "modify", to: CONTRACT_PATH, toSha256: H1 }],
  });
  assert.equal(duplicated.ok, false, "重复 target 必须拒绝");
  const roleMismatch = matchTargetsToItems({
    targets: [{ kind: "contract", path: CONTRACT_PATH, roleId: "x", toSha256: H1 }],
    items: [{ itemId: "a", kind: "contract", change: "modify", to: CONTRACT_PATH, toSha256: H1 }],
  });
  assert.equal(roleMismatch.ok, false, "roleId 不一致必须拒绝");
});

test("baseTrunk 匹配与 bootstrap（F30/AC-25）：null+bootstrap 仅无 trunk 时可用", async () => {
  const digestMismatch = createTestRig({
    hashes: fileMapForVca(),
    currentTrunk: { ...TRUNK_V1, digest: "other-digest" },
  });
  const mismatch = await digestMismatch.services.vca.create(upgradeCreateInput());
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "vca-base-mismatch");

  const noTrunk = createTestRig({ hashes: fileMapForVca(), currentTrunk: null });
  const nullWithoutBootstrap = await noTrunk.services.vca.create(upgradeCreateInput({ baseTrunk: null, bootstrap: false }));
  assert.equal(nullWithoutBootstrap.ok, false);
  if (!nullWithoutBootstrap.ok) assert.equal(nullWithoutBootstrap.code, "vca-base-mismatch");

  const hasTrunk = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
  const bootstrapWithTrunk = await hasTrunk.services.vca.create(upgradeCreateInput({ baseTrunk: null, bootstrap: true }));
  assert.equal(bootstrapWithTrunk.ok, false);
  if (!bootstrapWithTrunk.ok) assert.equal(bootstrapWithTrunk.code, "vca-base-mismatch");

  const bootstrapRig = createTestRig({ hashes: fileMapForVca(), currentTrunk: null });
  const bootstrap = await bootstrapRig.services.vca.create(
    upgradeCreateInput({ baseTrunk: null, bootstrap: true }),
  );
  assert.equal(bootstrap.ok, true);
  if (!bootstrap.ok) return;
  assert.equal(bootstrap.value.bootstrap, true);
  const submitted = await bootstrapRig.services.vca.submit({
    applicationId: bootstrap.value.applicationId,
    submittedBy: "product",
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(submitted.ok, true);
  const approved = await bootstrapRig.services.vca.approve({
    applicationId: bootstrap.value.applicationId,
    decisionId: "dec-bootstrap",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.value.freezes.length, 1);
    assert.equal(approved.value.freezes[0].freeze.reason, "bootstrap-vca-approved");
    assert.equal(approved.value.freezes[0].freeze.origin, "application");
    assert.equal(approved.value.freezes[0].freeze.decidedBy, undefined);
  }
  const badVersion = await bootstrapRig.services.vca.apply({
    applicationId: bootstrap.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-bootstrap",
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(badVersion.ok, false);
  if (!badVersion.ok) assert.equal(badVersion.code, "vca-apply-failed");
  const applied = await bootstrapRig.services.vca.apply({
    applicationId: bootstrap.value.applicationId,
    resultTrunkVersion: 1,
    journalId: "j-bootstrap",
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(applied.ok, true);
  if (applied.ok) assert.equal(applied.value.record.status, "applied");
});

test("version-upgrade 全流程：提交定格/批准冻结/apply 记录；幂等（AC-4/AC-5/AC-14）", async () => {
  const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
  const created = await rig.services.vca.create(upgradeCreateInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const submitted = await rig.services.vca.submit({
    applicationId: created.value.applicationId,
    submittedBy: "product",
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal(submitted.value.record.status, "submitted");
  assert.equal(submitted.value.record.submittedAt, "2026-11-04T10:01:00.000Z");
  assert.equal(submitted.value.record.targets[0].toSha256, H1);
  assert.equal(typeof submitted.value.record.applicationSha256, "string");
  assert.equal(submitted.value.freezes.length, 0, "upgrade 提交不冻结目标（批准时才冻结）");

  const resubmit = await rig.services.vca.submit({
    applicationId: created.value.applicationId,
    at: "2026-11-04T10:01:30.000Z",
  });
  assert.equal(resubmit.ok, true, "重复提交幂等");
  if (resubmit.ok) assert.equal(resubmit.value.record.applicationSha256, submitted.value.record.applicationSha256);

  const approved = await rig.services.vca.approve({
    applicationId: created.value.applicationId,
    decisionId: "dec-1",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.value.record.status, "approved");
  assert.equal(approved.value.record.decidedBy, "customer");
  assert.equal(approved.value.freezes.length, 1);
  assert.equal(approved.value.freezes[0].freeze.reason, "version-upgrade-approved");
  assert.equal(approved.value.freezes[0].freeze.origin, "customer");
  assert.equal(approved.value.freezes[0].freeze.decidedBy, "customer");
  assert.equal(approved.value.freezes[0].freeze.decisionId, "dec-1");
  assert.equal(rig.freezeRegistry.freezes.length, 1);
  assert.ok(rig.freezeRegistry.refreshes > 0, "冻结后刷新 C2b 快照");

  const applied = await rig.services.vca.apply({
    applicationId: created.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-1",
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.value.record.status, "applied");
  assert.equal(applied.value.record.resultTrunkVersion, 2);
  assert.equal(applied.value.record.journalId, "j-1");
  assert.equal(applied.value.record.decidedBy, "customer", "applied 保留客户批准审计，不新增 customer 决定");

  const reapply = await rig.services.vca.apply({
    applicationId: created.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-1",
    at: "2026-11-04T10:04:00.000Z",
  });
  assert.equal(reapply.ok, true, "同 journal 重复 apply 幂等");
});

test("并发与状态保护：同 flow 仅一个 submitted/approved；批准前不能 apply；拒绝后不可复用", async () => {
  const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
  const first = await rig.services.vca.create(upgradeCreateInput());
  const duplicate = await rig.services.vca.create(upgradeCreateInput());
  assert.equal(first.ok && duplicate.ok, true);
  if (first.ok && duplicate.ok) {
    assert.equal(duplicate.value.applicationId, first.value.applicationId, "重复创建同一目标幂等");
  }
  const second = await rig.services.vca.create(
    upgradeCreateInput({
      targets: [{ kind: "roster", path: ROSTER_PATH, action: "modify" }],
    }),
  );
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.notEqual(second.value.applicationId, first.value.applicationId);

  const earlyApply = await rig.services.vca.apply({
    applicationId: first.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-x",
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(earlyApply.ok, false);
  if (!earlyApply.ok) assert.equal(earlyApply.code, "vca-conflict");

  const submitFirst = await rig.services.vca.submit({
    applicationId: first.value.applicationId,
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(submitFirst.ok, true);
  const submitSecond = await rig.services.vca.submit({
    applicationId: second.value.applicationId,
    at: "2026-11-04T10:01:30.000Z",
  });
  assert.equal(submitSecond.ok, false);
  if (!submitSecond.ok) assert.equal(submitSecond.code, "vca-pending");

  const rejected = await rig.services.vca.reject({
    applicationId: first.value.applicationId,
    decisionId: "dec-reject",
    message: "客户拒绝",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.value.status, "rejected");
    assert.equal(rejected.value.decidedBy, "customer");
  }
  const approveRejected = await rig.services.vca.approve({
    applicationId: first.value.applicationId,
    decisionId: "dec-2",
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(approveRejected.ok, false);
  if (!approveRejected.ok) assert.equal(approveRejected.code, "vca-rejected");
  const resubmit = await rig.services.vca.submit({
    applicationId: first.value.applicationId,
    at: "2026-11-04T10:04:00.000Z",
  });
  assert.equal(resubmit.ok, false);
  if (!resubmit.ok) assert.equal(resubmit.code, "vca-rejected");
});

test("批准前哈希重验（F38/AC-26）：目标漂移拒绝批准且保持 submitted", async () => {
  const rig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
  const created = await rig.services.vca.create(upgradeCreateInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await rig.services.vca.submit({
    applicationId: created.value.applicationId,
    at: "2026-11-04T10:01:00.000Z",
  });
  rig.hashes.setFile(CONTRACT_PATH, H2);
  const approved = await rig.services.vca.approve({
    applicationId: created.value.applicationId,
    decisionId: "dec-1",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.equal(approved.code, "vca-hash-drift");
  const record = rig.versionChanges.records.find((entry) => entry.applicationId === created.value.applicationId);
  assert.equal(record?.status, "submitted", "漂移时保持 submitted，可重发卡");
  assert.equal(rig.freezeRegistry.freezes.length, 0, "不冻结");

  const detailRig = createTestRig({ hashes: fileMapForVca(), currentTrunk: TRUNK_V1 });
  const detail = await detailRig.services.vca.create(detailCreateInput());
  assert.equal(detail.ok, true);
  if (!detail.ok) return;
  await detailRig.services.vca.submit({
    applicationId: detail.value.applicationId,
    at: "2026-11-04T10:01:00.000Z",
  });
  detailRig.hashes.setFile(AMENDMENT_PATH, H3);
  const detailApprove = await detailRig.services.vca.approve({
    applicationId: detail.value.applicationId,
    decisionId: "dec-detail",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(detailApprove.ok, false);
  if (!detailApprove.ok) assert.equal(detailApprove.code, "vca-hash-drift");
});

test("detail-amendment：提交即冻结修正案；批准后逐项 apply 才冻结 applied 项（AC-2/AC-6）", async () => {
  const rig = createTestRig({
    hashes: fileMapForVca(),
    currentTrunk: TRUNK_V1,
    freezeState: "ready",
  });
  const created = await rig.services.vca.create(detailCreateInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const submitted = await rig.services.vca.submit({
    applicationId: created.value.applicationId,
    submittedBy: "rapporteur",
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal(submitted.value.freezes.length, 1);
  assert.equal(submitted.value.freezes[0].freeze.reason, "amendment-submitted");
  assert.equal(submitted.value.freezes[0].freeze.origin, "application");
  assert.equal(submitted.value.freezes[0].freeze.decidedBy, undefined);
  assert.equal(submitted.value.freezes[0].freeze.applicationId, created.value.applicationId);
  assert.equal(submitted.value.freezes[0].freeze.actorRoleId, "rapporteur");
  assert.equal(rig.freezeRegistry.freezes.length, 1, "提交只冻结修正案文档，不冻结目标");

  const approved = await rig.services.vca.approve({
    applicationId: created.value.applicationId,
    decisionId: "dec-detail",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.value.record.status, "approved");
  assert.equal(approved.value.freezes.length, 0, "detail 批准不冻结目标（目标在 item applied 时冻结）");
  assert.equal(rig.freezeRegistry.freezes.length, 1);

  const emptyApply = await rig.services.vca.apply({
    applicationId: created.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-detail",
    appliedTargetPaths: [],
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(emptyApply.ok, false);
  if (!emptyApply.ok) assert.match(emptyApply.message ?? "", /no-applicable-changes/);

  const unknownApply = await rig.services.vca.apply({
    applicationId: created.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-detail",
    appliedTargetPaths: ["docs/proposals/other-proposal-v2.md"],
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(unknownApply.ok, false);
  if (!unknownApply.ok) assert.equal(unknownApply.code, "vca-invalid");

  const applied = await rig.services.vca.apply({
    applicationId: created.value.applicationId,
    resultTrunkVersion: 2,
    journalId: "j-detail",
    appliedTargetPaths: [CONTRACT_PATH],
    at: "2026-11-04T10:03:00.000Z",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.value.freezes.length, 1);
  assert.equal(applied.value.freezes[0].freeze.reason, "detail-item-applied");
  assert.equal(applied.value.freezes[0].freeze.origin, "customer");
  assert.equal(applied.value.freezes[0].freeze.decidedBy, "customer");
  assert.equal(applied.value.freezes[0].freeze.decisionId, "dec-detail");
  assert.equal(rig.freezeRegistry.freezes.length, 2, "只冻结 applied 项");
});

test("冻结服务迁移（F29/AC-10/AC-21）：missing=一律冻结；migrated-draft 需证据；corrupt=fail-closed", async () => {
  const rig = createTestRig({ freezeState: "missing" });
  const before = await rig.services.freeze.isFrozen(CONTRACT_PATH, 2);
  assert.equal(before.state, "unknown", "注册表 missing ⇒ unknown（fail-closed，先迁移）");

  const migrated = await rig.services.freeze.migrate({
    existingDocs: [
      { path: CONTRACT_PATH, version: 2, sha256: H1 },
      { path: ROSTER_PATH, version: 2, sha256: H2 },
    ],
    draftCandidates: [
      { path: CONTRACT_PATH, version: 2, sha256: H1, evidence: "无客户确认记录且最后写入晚于最后一次确认" },
      { path: ROSTER_PATH, version: 2, sha256: H2, evidence: "  " },
    ],
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(migrated.ok, true);
  if (!migrated.ok) return;
  assert.equal(migrated.value.registry, "missing");
  assert.equal(migrated.value.migrated.length, 1, "仅无证据草稿之外的既有文档冻结");
  assert.equal(migrated.value.migrated[0].path, ROSTER_PATH);
  assert.equal(migrated.value.migrated[0].freeze.reason, "migrated-legacy");
  assert.equal(migrated.value.migrated[0].freeze.origin, "application");
  assert.equal(migrated.value.migrated[0].freeze.decidedBy, undefined);
  assert.equal(migrated.value.draftMarkers.length, 1);
  assert.equal(migrated.value.draftMarkers[0].path, CONTRACT_PATH);
  assert.equal(migrated.value.skippedDraftWithoutEvidence, 1);

  const draft = await rig.services.freeze.isFrozen(CONTRACT_PATH, 2);
  assert.equal(draft.state, "draft");
  assert.equal(draft.migrationMark, "migrated-draft");
  const frozen = await rig.services.freeze.isFrozen(ROSTER_PATH, 2);
  assert.equal(frozen.state, "frozen");
  assert.equal(frozen.record?.reason, "migrated-legacy");
  assert.equal(await rig.services.freeze.migrationMarkOf(ROSTER_PATH, 2), "migrated-legacy");
  assert.equal(await rig.services.freeze.migrationMarkOf(CONTRACT_PATH, 2), "migrated-draft");
  assert.equal((await rig.services.freeze.isFrozen(CONTRACT_PATH, 3)).state, "draft", "新版本是 draft");

  rig.freezeRegistry.setState("corrupt");
  const corruptMigrate = await rig.services.freeze.migrate({ existingDocs: [], at: "2026-11-04T10:01:00.000Z" });
  assert.equal(corruptMigrate.ok, false);
  if (!corruptMigrate.ok) assert.equal(corruptMigrate.code, "doc-freeze-registry-corrupt");
  const corruptLookup = await rig.services.freeze.isFrozen(CONTRACT_PATH, 2);
  assert.equal(corruptLookup.state, "unknown");
  const corruptFreeze = await rig.services.freeze.freeze({
    path: CONTRACT_PATH,
    version: 2,
    sha256: H1,
    applicationId: "vc-1",
    reason: "vca-approved",
    decisionId: "dec-1",
    at: "2026-11-04T10:02:00.000Z",
  });
  assert.equal(corruptFreeze.ok, false);
  if (!corruptFreeze.ok) assert.equal(corruptFreeze.code, "doc-freeze-registry-corrupt");
});

test("冻结归属（F35/AC-31）：customer 类需 decisionId；application 类不得带 decidedBy；合成 applicationId", async () => {
  const rig = createTestRig();
  const customerMissing = await rig.services.freeze.freeze({
    path: CONTRACT_PATH,
    version: 2,
    sha256: H1,
    applicationId: "vc-1",
    reason: "vca-approved",
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(customerMissing.ok, false);
  if (!customerMissing.ok) assert.equal(customerMissing.code, "doc-freeze-invalid");

  const applicationWithDecider = await rig.services.freeze.freeze({
    path: CONTRACT_PATH,
    version: 2,
    sha256: H1,
    applicationId: "vc-1",
    reason: "migrated-legacy",
    decidedBy: "customer",
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(applicationWithDecider.ok, false);

  const synthesized = await rig.services.freeze.freeze({
    path: CONTRACT_PATH,
    version: 2,
    sha256: H1,
    applicationId: "",
    reason: "proposal-confirmed",
    decisionId: "dec-9",
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(synthesized.ok, true);
  if (synthesized.ok) {
    assert.equal(synthesized.value.freeze.applicationId, "proposal-dec-9");
    assert.equal(synthesized.value.freeze.origin, "customer");
    assert.equal(synthesized.value.freeze.decidedBy, "customer");
  }

  const emptyAppId = await rig.services.freeze.freeze({
    path: ROSTER_PATH,
    version: 2,
    sha256: H2,
    applicationId: "",
    reason: "vca-approved",
    decisionId: "dec-10",
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(emptyAppId.ok, false);
  if (!emptyAppId.ok) assert.equal(emptyAppId.code, "doc-freeze-application-id-missing");
});

test("冻结 bootstrap（F30/AC-25）：handoff-pin 合成 applicationId；bootstrap-vca 需 VCA id；已冻结跳过", async () => {
  const rig = createTestRig();
  const pin = await rig.services.freeze.bootstrap({
    reason: "handoff-pin-bootstrap",
    docs: [{ path: CONTRACT_PATH, version: 2, sha256: H1 }],
    at: "2026-11-04T10:00:00.000Z",
  });
  assert.equal(pin.ok, true);
  if (pin.ok) {
    assert.equal(pin.value.length, 1);
    assert.equal(pin.value[0].freeze.reason, "handoff-pin-bootstrap");
    assert.equal(pin.value[0].freeze.origin, "application");
    assert.equal(pin.value[0].freeze.applicationId, "bootstrap-handoff-pin");
  }
  const again = await rig.services.freeze.bootstrap({
    reason: "handoff-pin-bootstrap",
    docs: [{ path: CONTRACT_PATH, version: 2, sha256: H1 }],
    at: "2026-11-04T10:00:30.000Z",
  });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.value.length, 0, "已冻结文档 bootstrap 幂等跳过");

  const vcaMissing = await rig.services.freeze.bootstrap({
    reason: "bootstrap-vca-approved",
    docs: [{ path: ROSTER_PATH, version: 2, sha256: H2 }],
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(vcaMissing.ok, false);
  if (!vcaMissing.ok) assert.equal(vcaMissing.code, "doc-freeze-application-id-missing");
  const vcaOk = await rig.services.freeze.bootstrap({
    reason: "bootstrap-vca-approved",
    applicationId: "vc-1",
    docs: [{ path: ROSTER_PATH, version: 2, sha256: H2 }],
    at: "2026-11-04T10:01:00.000Z",
  });
  assert.equal(vcaOk.ok, true);
});

test("轻量重构校验（F31/F40/AC-7/AC-8）：convener/flow/越界转 VCA/机械写集/managedBy", async () => {
  const rig = createTestRig();
  const base = {
    requestId: "rf-1",
    flowId: "demo",
    roleId: "convener",
    title: "模块内部重构",
    reason: "拆分内部实现，不改契约/边界",
    scope: { modules: ["src/service/demo"], paths: ["src/service/demo"], roles: [] as string[] },
    at: "2026-11-04T10:00:00.000Z",
  };
  const ok = await rig.services.refactor.validate(base, { flowExists: true });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.record.managedBy, "application-scheduler");
    assert.equal(ok.record.initiatedBy, "convener");
    assert.equal(ok.record.status, "requested");
    assert.deepEqual(ok.enforcement.forbiddenKinds, [
      "versioned-doc",
      "boundary",
      "stable",
      "team-plan",
      "flow",
    ]);
    assert.deepEqual(ok.enforcement.writeSet, ["src/service/demo"]);
  }

  const wrongRole = await rig.services.refactor.validate({ ...base, roleId: "rapporteur" }, { flowExists: true });
  assert.equal(wrongRole.ok, false);
  if (!wrongRole.ok) assert.equal(wrongRole.code, "refactor-role-not-allowed");

  const missingFlow = await rig.services.refactor.validate(base, { flowExists: false });
  assert.equal(missingFlow.ok, false);
  if (!missingFlow.ok) assert.equal(missingFlow.code, "refactor-flow-missing");

  const forbiddenScopes: Array<[string, string]> = [
    ["docs/proposals/demo-proposal-v2.md", "versioned-doc"],
    ["角色卡/编排/boundary.yaml", "boundary"],
    ["docs/workflow.md", "stable"],
    ["docs/scheduling/demo-team-v1.md", "team-plan"],
    ["docs/flows/demo.yaml", "flow"],
  ];
  for (const [path, kind] of forbiddenScopes) {
    const result = await rig.services.refactor.validate(
      { ...base, scope: { modules: [], paths: [path], roles: [] } },
      { flowExists: true },
    );
    assert.equal(result.ok, false, path);
    if (result.ok) continue;
    assert.equal(result.code, "refactor-scope-forbidden", path);
    assert.match(result.message ?? "", new RegExp(kind), `${path} 提示越界类别`);
  }

  const outsideRoots = await rig.services.refactor.validate(base, {
    flowExists: true,
    allowedModuleRoots: ["src/common"],
  });
  assert.equal(outsideRoots.ok, false);
  if (!outsideRoots.ok) assert.equal(outsideRoots.code, "refactor-write-set-forbidden");
});

test("C2b/C2c 联合契约（F34/F35）：C2c 冻结记录经 C2b R9 追加 → 同步快照 frozen/draft 一致", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "c2c-joint-freeze-"));
  try {
    const proposalText = "proposal v2\n";
    const rosterText = "roster v2\n";
    await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
    await fs.writeFile(path.join(root, CONTRACT_PATH), proposalText, "utf8");
    await fs.writeFile(path.join(root, ROSTER_PATH), rosterText, "utf8");
    const proposalSha = createHash("sha256").update(proposalText).digest("hex");
    const rosterSha = createHash("sha256").update(rosterText).digest("hex");

    // 1) C2c 冻结记录形状直接作为 C2b `DocFreezeRecord` 被接受并写入 R9 baseline。
    const rig = createTestRig();
    const frozen = await rig.services.freeze.freeze({
      path: CONTRACT_PATH,
      version: 2,
      sha256: proposalSha,
      applicationId: "vc-joint",
      reason: "vca-approved",
      decisionId: "dec-joint",
      at: "2026-11-04T10:00:00.000Z",
    });
    assert.equal(frozen.ok, true);
    if (!frozen.ok) return;
    const appended = await appendDocFreezeRecords([
      { projectRoot: root, relPath: CONTRACT_PATH, freeze: frozen.value.freeze, sha256: proposalSha },
    ]);
    assert.deepEqual(appended, { ok: true, appended: 1, skipped: 0 });

    const baseline = await refreshVersionedDocFreezeSnapshot(root, {
      migrationCompleted: true,
      now: () => new Date("2026-11-04T10:00:00.000Z"),
    });
    assert.equal(baseline.state, "ready");
    assert.equal(versionedDocFreezeState(root, CONTRACT_PATH, true), "frozen");
    assert.equal(versionedDocFreezeState(root, ROSTER_PATH, true), "draft");

    // 2) `draft-marker`（migrated-draft）不是 doc.freeze：C2b 快照为 draft。
    const marked = await appendDocDraftMarkerRecords([
      { projectRoot: root, relPath: ROSTER_PATH, sha256: rosterSha },
    ]);
    assert.equal(marked.ok, true);
    await refreshVersionedDocFreezeSnapshot(root, { migrationCompleted: true });
    assert.equal(versionedDocFreezeState(root, ROSTER_PATH, true), "draft");
    assert.equal(versionedDocFreezeState(root, CONTRACT_PATH, true), "frozen");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  // 3) 纯快照构建：migration 未完成 ⇒ 既有文档视为 frozen（F29）；corrupt ⇒ unknown（fail-closed）。
  const snapshot = buildVersionedDocFreezeSnapshot({
    records: [
      {
        v: 1,
        flowId: "demo",
        doc: "proposal",
        version: 2,
        path: CONTRACT_PATH,
        sha256: H1,
        recordedAt: "2026-11-04T10:00:00.000Z",
        event: "frozen",
        recordedBy: "app:session",
        freeze: {
          schema: "doc-freeze/v1",
          applicationId: "vc-1",
          reason: "vca-approved",
          origin: "customer",
          decidedBy: "customer",
          decisionId: "dec-1",
          frozenAt: "2026-11-04T10:00:00.000Z",
        },
      } satisfies VersionBaselineRecord,
    ],
    migration: { completed: true },
  });
  installVersionedDocFreezeSnapshot("C:/c2c-joint-ready", snapshot);
  assert.equal(versionedDocFreezeState("C:/c2c-joint-ready", CONTRACT_PATH, true), "frozen");
  installVersionedDocFreezeSnapshot("C:/c2c-joint-migration", {
    ...snapshot,
    state: "migration-required",
  });
  assert.equal(versionedDocFreezeState("C:/c2c-joint-migration", ROSTER_PATH, true), "frozen");
  assert.equal(
    versionedDocFreezeState("C:/c2c-joint-migration", "docs/proposals/new-proposal-v3.md", false),
    "draft",
  );
  installVersionedDocFreezeSnapshot("C:/c2c-joint-corrupt", { ...snapshot, state: "corrupt" });
  assert.equal(versionedDocFreezeState("C:/c2c-joint-corrupt", CONTRACT_PATH, true), "unknown");
});
