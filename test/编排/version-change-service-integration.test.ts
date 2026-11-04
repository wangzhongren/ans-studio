// test/编排/version-change-service-integration.test.ts
// S2 集成测试：C2c Service + S1 Provider 存储 + C2b R9/快照 + S2 trunk service 全链路
// （真实文件系统；无内存 fake）：VCA bootstrap/upgrade/detail、批准前哈希重验、迁移、
// stable-write completeWrite + mini re-pin、refactor 机械写集、C8 草稿删除安全收窄。
//
// 依据 P1.6 §4.4/§4.5/§4.5.1/§4.8、F29/F30/F36/F38、AC-21/AC-25/AC-26/AC-33–35/AC-27。
// run manifest re-pin 用测试夹具的 S3 替身（写真实 run manifest）；其余全部真实实现。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  registerVersionedDocAfterWrite,
  verifyVersionedDocBaselines,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import type { VersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  createRunRepinPort,
  createTrunkProject,
  makeRoot,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

async function setup(): Promise<{ project: TrunkProject; integration: VersionChangeIntegration }> {
  const project = await createTrunkProject();
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
    runRepin: createRunRepinPort(project.root),
  });
  return { project, integration };
}

async function bootstrapTrunk(project: TrunkProject, integration: VersionChangeIntegration, applicationId = "vc-boot") {
  const boot = await integration.trunk.executeApply({
    source: "bootstrap",
    flowId: FLOW_ID,
    applicationId,
    decisionId: "dec-boot",
    runId: project.runId,
    baseTrunkVersion: null,
    target: project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: `j-${applicationId}`,
    at: AT2,
  });
  assert.equal(boot.ok, true);
  return boot;
}

test("VCA（version-upgrade bootstrap）：create/submit/approve 冻结 → trunk t1 → apply；幂等与并发", async () => {
  const { project, integration } = await setup();
  const v2 = "docs/proposals/demo-proposal-v2.md";
  const v2sha = await writeProjectFile(project.root, v2, "# proposal v2\n");

  const created = await integration.services.vca.create({
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: FLOW_ID,
    baseTrunk: null,
    bootstrap: true,
    targets: [{ kind: "contract", path: v2, action: "add" }],
    summary: "bootstrap v2",
    applicationId: "vc-1",
    at: AT,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.status, "draft");
  assert.equal(created.value.targets[0]?.toSha256, v2sha);

  const submitted = await integration.services.vca.submit({ applicationId: "vc-1", at: AT2 });
  assert.equal(submitted.ok, true);
  if (submitted.ok) assert.equal(submitted.value.record.status, "submitted");
  // 幂等：重复提交返回现有申请
  const resubmitted = await integration.services.vca.submit({ applicationId: "vc-1", at: AT2 });
  assert.equal(resubmitted.ok, true);

  const approved = await integration.services.vca.approve({ applicationId: "vc-1", decisionId: "dec-b1", at: AT2 });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.value.record.status, "approved");
  assert.equal(approved.value.freezes.length, 1);
  assert.equal(approved.value.freezes[0]?.freeze.reason, "bootstrap-vca-approved");
  assert.equal(approved.value.freezes[0]?.freeze.origin, "application"); // bootstrap 不冒充客户

  const target = project.snapshot();
  target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
  const applied = await integration.trunk.executeApply({
    source: "bootstrap",
    flowId: FLOW_ID,
    applicationId: "vc-1",
    decisionId: "dec-b1",
    runId: project.runId,
    baseTrunkVersion: null,
    target,
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-vc1",
    at: AT2,
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.value.manifest.trunkVersion, 1);
  assert.equal(applied.value.manifest.source, "bootstrap");

  // 并发：同一 flow 已有 approved VCA ⇒ 第二个 VCA 提交被 vca-pending 拒绝
  const v3 = "docs/proposals/demo-proposal-v3.md";
  await writeProjectFile(project.root, v3, "# proposal v3\n");
  const second = await integration.services.vca.create({
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: FLOW_ID,
    baseTrunk: await integration.trunk.current(),
    targets: [{ kind: "contract", path: v3, action: "add" }],
    summary: "second",
    applicationId: "vc-2",
    at: AT2,
  });
  assert.equal(second.ok, true);
  const blocked = await integration.services.vca.submit({ applicationId: "vc-2", at: AT2 });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "vca-pending");

  const marked = await integration.services.vca.apply({
    applicationId: "vc-1",
    resultTrunkVersion: 1,
    journalId: "j-vc1",
    at: AT2,
  });
  assert.equal(marked.ok, true);
  if (marked.ok) {
    assert.equal(marked.value.record.status, "applied");
    assert.equal(marked.value.record.resultTrunkVersion, 1);
    assert.equal(marked.value.record.journalId, "j-vc1");
  }

  const current = await integration.trunk.current();
  assert.equal(current?.trunkVersion, 1);
  assert.equal(current?.runId, project.runId);
});

test("VCA（detail-amendment）：提交冻结修正案 → 批准 → 逐项 applied 冻结 + trunk t2 + apply", async () => {
  const { project, integration } = await setup();
  await bootstrapTrunk(project, integration);

  const v2 = "docs/proposals/demo-proposal-v2.md";
  const v2sha = await writeProjectFile(project.root, v2, "version: 2\n# proposal v2\n");
  const team2 = "docs/scheduling/demo-team-v2.md";
  const team2sha = await writeProjectFile(project.root, team2, "version: 2\n# team plan v2\n");
  const amendmentRel = "docs/proposals/demo-amendment-v1.md";
  const current = await integration.trunk.current();
  assert.ok(current !== null);
  const manifestRead = await integration.trunk.derive();
  assert.equal(manifestRead.ok, true);

  await writeProjectFile(
    project.root,
    amendmentRel,
    [
      "---",
      "schema: trunk-amendment/v1",
      "amendmentId: am-1",
      `flowId: ${FLOW_ID}`,
      "docVersion: 1",
      "baseTrunk:",
      `  trunkVersion: ${current!.trunkVersion}`,
      `  runId: ${project.runId}`,
      `  digest: ${current!.digest}`,
      "items:",
      "  - itemId: it-1",
      "    kind: contract",
      "    change: modify",
      `    from: ${PATHS.proposal}`,
      `    to: ${v2}`,
      "  - itemId: it-2",
      "    kind: execution",
      "    change: modify",
      `    from: ${PATHS.teamPlan}`,
      `    to: ${team2}`,
      "---",
      "# amendment",
    ].join("\n"),
  );
  const validated = await integration.trunk.validateAmendment({ amendmentDocPath: amendmentRel, flowId: FLOW_ID });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const created = await integration.services.vca.create({
    kind: "detail-amendment",
    initiatorRoleId: "rapporteur",
    flowId: FLOW_ID,
    baseTrunk: current,
    targets: [
      { kind: "contract", path: v2, action: "modify" },
      { kind: "execution", path: team2, action: "modify" },
    ],
    amendmentId: "am-1",
    amendmentDocPath: amendmentRel,
    amendmentItems: validated.value.items,
    summary: "detail",
    applicationId: "vc-1",
    at: AT,
  });
  assert.equal(created.ok, true);

  const submitted = await integration.services.vca.submit({ applicationId: "vc-1", at: AT2 });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal(submitted.value.freezes.length, 1);
  assert.equal(submitted.value.freezes[0]?.freeze.reason, "amendment-submitted");
  assert.equal(submitted.value.freezes[0]?.freeze.actorRoleId, "rapporteur");

  const approved = await integration.services.vca.approve({ applicationId: "vc-1", decisionId: "dec-d1", at: AT2 });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.value.freezes.length, 0); // detail 批准不冻结 target

  // 逐项 applied：先冻结 applied 目标（S4 编排序），再 trunk apply，最后标记 applied
  // C15：execution 不纳入 guard 冻结；只为 contract 目标预冻结
  const preFreeze = await integration.services.freeze.freezeMany([
    { path: v2, version: 2, sha256: v2sha, applicationId: "vc-1", reason: "detail-item-applied", decisionId: "dec-d1", at: AT2 },
  ]);
  assert.equal(preFreeze.ok, true, JSON.stringify(preFreeze));

  const target = project.snapshot();
  target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
  target.execution = { ...target.execution, teamPlan: { path: team2, sha256: team2sha } };
  const appliedTrunk = await integration.trunk.executeApply({
    source: "amendment",
    flowId: FLOW_ID,
    applicationId: "vc-1",
    decisionId: "dec-d1",
    amendmentId: "am-1",
    runId: project.runId,
    baseTrunkVersion: 1,
    target,
    journalId: "j-vc1",
    at: AT2,
  });
  assert.equal(appliedTrunk.ok, true);
  if (!appliedTrunk.ok) return;
  assert.equal(appliedTrunk.value.manifest.trunkVersion, 2);
  assert.equal(appliedTrunk.value.manifest.source, "amendment");
  assert.equal(appliedTrunk.value.audit.amendmentId, "am-1");

  const marked = await integration.services.vca.apply({
    applicationId: "vc-1",
    resultTrunkVersion: 2,
    journalId: "j-vc1",
    appliedTargetPaths: [v2, team2],
    at: AT2,
  });
  assert.equal(marked.ok, true);
  if (marked.ok) {
    assert.equal(marked.value.record.status, "applied");
    assert.equal(marked.value.freezes.length, 1); // execution 不冻结（C15）
    assert.equal(marked.value.freezes[0]?.freeze.reason, "detail-item-applied");
  }

  // applied 幂等：同 journalId 重放返回现有记录（不重复冻结）
  const empty = await integration.services.vca.apply({
    applicationId: "vc-1",
    resultTrunkVersion: 2,
    journalId: "j-vc1",
    appliedTargetPaths: [],
    at: AT2,
  });
  assert.equal(empty.ok, true);
});

test("VCA：批准前 toSha256 重验（漂移 ⇒ vca-hash-drift，不冻结）", async () => {
  const { project, integration } = await setup();
  const v2 = "docs/proposals/demo-proposal-v2.md";
  await writeProjectFile(project.root, v2, "# proposal v2\n");
  const created = await integration.services.vca.create({
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: FLOW_ID,
    baseTrunk: null,
    bootstrap: true,
    targets: [{ kind: "contract", path: v2, action: "add" }],
    summary: "drift",
    applicationId: "vc-1",
    at: AT,
  });
  assert.equal(created.ok, true);
  assert.equal((await integration.services.vca.submit({ applicationId: "vc-1", at: AT2 })).ok, true);

  await writeProjectFile(project.root, v2, "# proposal v2 CHANGED\n");
  const approved = await integration.services.vca.approve({ applicationId: "vc-1", decisionId: "dec-drift", at: AT2 });
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.equal(approved.code, "vca-hash-drift");

  const entry = await integration.services.freeze.entryOf(v2);
  assert.equal(entry, undefined); // 未冻结
  const record = await integration.services.vca.list({ flowId: FLOW_ID });
  assert.equal(record.find((item) => item.applicationId === "vc-1")?.status, "submitted");
});

test("stable-write：request/approve/completeWrite(actualSha) + mini re-pin；失败作废许可", async () => {
  const { project, integration } = await setup();
  await bootstrapTrunk(project, integration);

  const oldSha = project.hashes[PATHS.workflow]!;
  const content = "# workflow v2 (confirmed)\n";
  const targetSha = sha256(content);
  const requested = await integration.services.stableWrite.request({
    roleId: "convener",
    kind: "workflow",
    content,
    diffPreview: "@@ preview @@",
    requestId: "sw-1",
    at: AT,
  });
  assert.equal(requested.ok, true);
  if (!requested.ok) return;
  assert.equal(requested.value.baseSha256, oldSha);
  assert.equal(requested.value.targetSha256, targetSha);
  assert.equal(requested.value.status, "requested");

  const approved = await integration.services.stableWrite.approve("sw-1", { decisionId: "dec-sw", at: AT2 });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.value.permit.status, "approved");
  assert.equal(approved.value.permit.path, PATHS.workflow);
  assert.equal(approved.value.record.permitId, approved.value.permit.permitId);

  // 应用执行写入（run-role gate 的真实执行点；测试直接落盘）后 post-write 复核
  await writeProjectFile(project.root, PATHS.workflow, content);
  const completed = await integration.services.stableWrite.completeWrite({
    requestId: "sw-1",
    actualSha256: targetSha,
    at: "2026-11-04T12:35:00.000Z",
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.record.status, "written");
  assert.equal(completed.value.permit.status, "consumed");
  assert.equal(completed.value.repin.applied, true);
  assert.equal(completed.value.repin.audit?.op, "stable-repinned");
  assert.equal(completed.value.repin.audit?.trunkVersion, 1); // 不升版本
  assert.equal(completed.value.repin.audit?.oldSha, oldSha);
  assert.equal(completed.value.repin.audit?.newSha, targetSha);

  const read = await integration.trunk.derive();
  assert.equal(read.ok, true);
  const status = await integration.trunk.status();
  assert.equal(status.manifest?.artifacts.workflow.sha256, targetSha);

  // 失败：哈希不符 ⇒ record/permit failed（不可复用）、mini re-pin 不更新
  const badContent = "# workflow v3\n";
  const badTarget = sha256(badContent);
  assert.equal(
    (
      await integration.services.stableWrite.request({
        roleId: "convener",
        kind: "workflow",
        content: badContent,
        requestId: "sw-2",
        at: AT,
      })
    ).ok,
    true,
  );
  assert.equal((await integration.services.stableWrite.approve("sw-2", { confirmationId: "conf-2", at: AT2 })).ok, true);
  const failed = await integration.services.stableWrite.completeWrite({
    requestId: "sw-2",
    actualSha256: sha256("tampered"),
    at: "2026-11-04T12:36:00.000Z",
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.code, "stable-write-hash-mismatch");
  const failedRecord = await integration.services.stableWrite.list();
  assert.equal(failedRecord.find((record) => record.requestId === "sw-2")?.status, "failed");
  assert.equal(await integration.services.stableWrite.findPermit(PATHS.workflow), undefined);
  const after = await integration.trunk.status();
  assert.equal(after.manifest?.artifacts.workflow.sha256, targetSha); // 未被失败写入污染
  assert.notEqual(badTarget, targetSha);
});

test("冻结迁移：missing ⇒ 既有文档一律冻结（migrated-legacy）；corrupt ⇒ fail-closed；draft-marker", async () => {
  const root = await makeRoot();
  const proposal = "docs/proposals/demo-proposal-v1.md";
  const roster = "docs/proposals/demo-roster-v1.md";
  await writeProjectFile(root, proposal, "# proposal v1\n");
  await writeProjectFile(root, roster, "# roster v1\n");

  let migrationDone = false;
  const integration = createVersionChangeIntegration({
    projectRoot: root,
    now: () => new Date(AT),
    migrationCompleted: () => migrationDone,
  });
  assert.equal(await integration.services.freeze.state(), "missing");
  const migrated = await integration.ensureMigration(AT2);
  assert.equal(migrated.ok, true);
  if (migrated.ok) {
    assert.equal(migrated.report?.migrated.length, 2);
    assert.ok(migrated.report?.migrated.every((entry) => entry.freeze.reason === "migrated-legacy"));
  }
  // 迁移完成标记置 true 后模拟会话重启（新适配器读取 baseline）⇒ ready
  migrationDone = true;
  const reopened = createVersionChangeIntegration({
    projectRoot: root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
  });
  assert.equal(await reopened.services.freeze.state(), "ready");
  const frozen = await reopened.services.freeze.isFrozen(proposal);
  assert.equal(frozen.state, "frozen");
  assert.equal(frozen.record?.reason, "migrated-legacy");

  // draft-marker：证据标记（不写 doc.freeze；不是 freeze reason；已冻结文档不可降级）
  const draftPath = "docs/proposals/demo-proposal-v2.md";
  await writeProjectFile(root, draftPath, "# proposal v2 draft\n");
  const draft = await reopened.services.freeze.recordDraftMarker({
    path: draftPath,
    version: 2,
    evidence: "no customer confirmation",
    at: AT2,
  });
  assert.equal(draft.ok, true);
  const draftLookup = await reopened.services.freeze.isFrozen(draftPath);
  assert.equal(draftLookup.state, "draft");
  assert.equal(await reopened.services.freeze.migrationMarkOf(draftPath, 2), "migrated-draft");
  const frozenLookup = await reopened.services.freeze.isFrozen(proposal);
  assert.equal(frozenLookup.state, "frozen"); // 已冻结不可逆

  // corrupt ⇒ fail-closed（不迁移/不重建）
  const corruptRoot = await makeRoot();
  await fs.mkdir(path.join(corruptRoot, ".ans/state"), { recursive: true });
  await writeProjectFile(corruptRoot, proposal, "# proposal v1\n");
  await fs.writeFile(path.join(corruptRoot, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
  await fs.writeFile(path.join(corruptRoot, ".ans/state/versions.initialized"), "{}\n", "utf8");
  const corruptIntegration = createVersionChangeIntegration({
    projectRoot: corruptRoot,
    now: () => new Date(AT),
    migrationCompleted: () => true,
  });
  const corruptMigrate = await corruptIntegration.ensureMigration(AT2);
  assert.equal(corruptMigrate.ok, false);
  if (!corruptMigrate.ok) assert.equal(corruptMigrate.code, "doc-freeze-registry-corrupt");
});

test("refactor 机械写集；C8 裁决：不新增 removed/moved 记录，草稿删除由 R9 verify fail-closed", async () => {
  const { project } = await setup();

  const ok = await integrationRefactor(project);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.ok(ok.enforcement.writeSet.includes("src/"));
    assert.ok(ok.enforcement.writeSet.includes("impl-core"));
    assert.ok(ok.enforcement.forbiddenKinds.includes("versioned-doc"));
  }
  const forbidden = await integrationRefactor(project, ["docs/proposals/demo-proposal-v1.md"], ["docs/proposals"]);
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.code, "refactor-scope-forbidden");

  // C8：登记草稿后删除 → R9 verify 如实报 missing（安全收窄；不伪造 removed/moved 记录）
  const v2 = "docs/proposals/demo-proposal-v2.md";
  await writeProjectFile(project.root, v2, "version: 2\n# proposal v2 draft\n");
  const registered = await registerVersionedDocAfterWrite({
    projectRoot: project.root,
    absPath: path.join(project.root, v2),
  });
  assert.equal(registered, true);
  await fs.rm(path.join(project.root, v2));
  const violations = await verifyVersionedDocBaselines({ projectRoot: project.root });
  assert.ok(violations.some((violation) => violation.path === v2 && violation.reason === "missing"));
  const baselineText = await fs.readFile(path.join(project.root, ".ans/state/versions.jsonl"), "utf8");
  assert.ok(!baselineText.includes('"removed"'));
  assert.ok(!baselineText.includes('"moved"'));
});

async function integrationRefactor(
  project: TrunkProject,
  paths: string[] = ["src/"],
  modules: string[] = ["impl-core"],
) {
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
  });
  return integration.services.refactor.validate(
    {
      requestId: "rf-1",
      flowId: FLOW_ID,
      roleId: "convener",
      title: "refactor",
      reason: "cleanup",
      scope: { modules, paths, roles: ["impl"] },
      at: AT,
    },
    { flowExists: true, allowedModuleRoots: ["src/"] },
  );
}
