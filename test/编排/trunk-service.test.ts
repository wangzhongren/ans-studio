// test/编排/trunk-service.test.ts
// S2 trunk service 测试（真实 S1 存储/真实 run manifest/R9 baseline；无内存 fake）：
// 派生 v1（零写入）/fail-closed、verifyTrunk、apply-journal 两阶段 + history + 审计、
// 冻结/哈希/版本校验失败不改指针、reconcile 内容匹配/相位滞后、恢复 tN+1、
// stable mini re-pin、修正案解析/哈希定格/目标版本/边界扩大/生命周期映射。
//
// 依据 P1.6 §4.5/§4.6/§5.4 与 S2 派发要求；不改既有断言、不新增 skip。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { TRUNK_APPLY_JOURNAL_SCHEMA, TRUNK_MANIFEST_SCHEMA } from "../../src/model/trunk.ts";
import type { TrunkApplyJournal, TrunkApplySnapshot, TrunkManifest } from "../../src/model/trunk.ts";
import { readRunManifest, writeRunManifest } from "../../src/common/编排/run-manifest.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import type { TrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  boundaryText,
  createRunRepinPort,
  createTrunkProject,
  makeRoot,
  sha256,
  writePinnedRun,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

async function bootstrap(
  project: TrunkProject,
  service: TrunkService = project.service,
  overrides: Partial<Parameters<TrunkService["executeApply"]>[0]> = {},
) {
  return service.executeApply({
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
    ...overrides,
  });
}

function manifestOf(result: Awaited<ReturnType<TrunkService["executeApply"]>>): TrunkManifest {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result.value.manifest;
}

test("派生 v1：唯一 pinned run、零写入、stable 哈希取磁盘、状态 derived", async () => {
  const project = await createTrunkProject();
  const derived = await project.service.derive();
  assert.equal(derived.ok, true);
  if (!derived.ok) return;
  const manifest = derived.value.manifest;
  assert.equal(manifest.trunkVersion, 1);
  assert.equal(manifest.source, "adopted");
  assert.equal(manifest.flowId, FLOW_ID);
  assert.equal(manifest.runId, project.runId);
  assert.equal(manifest.artifacts.documents.proposal?.path, PATHS.proposal);
  assert.equal(manifest.artifacts.workflow.sha256, project.hashes[PATHS.workflow]);
  assert.equal(manifest.rosterVersion, 1);
  assert.deepEqual(manifest.roles, ["impl"]);
  assert.deepEqual(derived.value.issues, []);

  // 零写入：派生不落盘
  await assert.rejects(fs.access(path.join(project.root, ".ans/trunk/manifest.json")));

  const status = await project.service.status();
  assert.equal(status.availability, "derived");
  assert.equal(status.derived, true);
  assert.equal(status.manifest?.runId, project.runId);
  assert.equal(status.frozenDocuments.length, 6);
  assert.equal(status.stable.workflow?.sha256, project.hashes[PATHS.workflow]);
  assert.equal(await project.service.current(), null);
});

test("派生 fail-closed：无 pinned/多 pinned/坏 manifest", async () => {
  const none = await createTrunkProject({ withRun: false });
  const noRun = await none.service.derive();
  assert.equal(noRun.ok, false);
  if (!noRun.ok) assert.equal(noRun.code, "trunk-unavailable");

  const multi = await createTrunkProject();
  await writePinnedRun(multi.root, "run-20261104-demo-b2c3d4e5", multi.hashes);
  const multiple = await multi.service.derive();
  assert.equal(multiple.ok, false);
  if (!multiple.ok) assert.match(multiple.message ?? "", /多个 pinned/);

  const brokenRoot = await makeRoot();
  const brokenId = "run-20261104-demo-deadbeef";
  await fs.mkdir(path.join(brokenRoot, ".ans/runs", brokenId), { recursive: true });
  await fs.writeFile(path.join(brokenRoot, ".ans/runs", brokenId, "manifest.json"), "{broken", "utf8");
  const broken = createTrunkService({
    projectRoot: brokenRoot,
    store: (await import("../../src/provider/trunk/public/trunk-store.ts")).createFsTrunkStore(brokenRoot),
    freezeRegistry: (await import("../../src/provider/version-change/public/version-change-store.ts")).createGuardFreezeRegistry(brokenRoot),
    now: () => new Date(AT),
  });
  const bad = await broken.derive();
  assert.equal(bad.ok, false);

  const status = await none.service.status();
  assert.equal(status.availability, "unavailable");
});

test("派生/应用支持 `path#fragment` 引用：哈希/冻结按文件部分，引用串原样保留", async () => {
  const project = await createTrunkProject();
  // run documents 允许 `path#section`（真实项目：roster 文档内嵌拓扑图）。
  const read = await readRunManifest(project.root, project.runId);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const fragmentRef = `${PATHS.topology}#人员+模块拓扑图`;
  const rewritten = await writeRunManifest(project.root, {
    ...read.manifest,
    documents: {
      ...read.manifest.documents,
      topology: { path: fragmentRef, sha256: project.hashes[PATHS.topology]! },
    },
  });
  assert.equal(rewritten.ok, true);
  if (!rewritten.ok) return;

  // 派生：成功且保留 fragment 引用串；哈希取文件部分。
  const derived = await project.service.derive();
  assert.equal(derived.ok, true, derived.ok ? "" : `${derived.code}: ${derived.message ?? ""}`);
  if (!derived.ok) return;
  assert.equal(derived.value.manifest.artifacts.documents.topology?.path, fragmentRef);
  assert.equal(derived.value.manifest.artifacts.documents.topology?.sha256, project.hashes[PATHS.topology]);

  // bootstrap apply：内容哈希/冻结校验按文件部分通过；manifest 保留 fragment 引用串。
  const snapshot = project.snapshot();
  const boot = await bootstrap(project, project.service, {
    target: {
      ...snapshot,
      documents: {
        ...snapshot.documents,
        topology: { path: fragmentRef, sha256: project.hashes[PATHS.topology]! },
      },
    },
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
  if (!boot.ok) return;
  assert.equal(boot.value.manifest.artifacts.documents.topology?.path, fragmentRef);

  // verifyTrunk 不再误报「文件缺失 / 未冻结」。
  const verified = await project.service.verify();
  assert.equal(verified.ok, true, JSON.stringify(verified.violations));
});

test("verifyTrunk：ok、stable 哈希漂移、R9 未冻结违规", async () => {
  const project = await createTrunkProject();
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
  assert.equal(boot.ok, true);

  const okVerify = await project.service.verify();
  assert.deepEqual(okVerify, { ok: true, violations: [] });

  await writeProjectFile(project.root, PATHS.workflow, "# workflow changed\n");
  const drifted = await project.service.verify();
  assert.equal(drifted.ok, false);
  assert.ok(drifted.violations.some((violation) => violation.startsWith("workflow: hash changed")));

  // R9：manifest 指向一个已存在但未冻结的新版本 ⇒ not-frozen violation
  const read = await project.store.readManifest();
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const v2 = "docs/proposals/demo-proposal-v2.md";
  const v2sha = await writeProjectFile(project.root, v2, "# proposal v2 unfrozen\n");
  const tampered: TrunkManifest = {
    ...read.value,
    artifacts: {
      ...read.value.artifacts,
      documents: { ...read.value.artifacts.documents, proposal: { path: v2, sha256: v2sha, version: 2 } },
    },
  };
  assert.deepEqual(await project.store.writeManifest(tampered), { ok: true });
  const frozenViolation = await project.service.verify();
  assert.equal(frozenViolation.ok, false);
  assert.ok(frozenViolation.violations.some((violation) => violation.includes("not frozen")));
});

test("executeApply：bootstrap t1、升级 t2（journal 两阶段/history/审计）、失败不改指针", async () => {
  const project = await createTrunkProject();
  const service = createTrunkService({
    projectRoot: project.root,
    store: project.store,
    freezeRegistry: project.registry,
    runRepin: createRunRepinPort(project.root),
    now: () => new Date(AT),
  });

  const boot = await service.executeApply({
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
  assert.equal(boot.ok, true);
  if (!boot.ok) return;
  assert.equal(boot.value.manifest.trunkVersion, 1);
  assert.equal(boot.value.manifest.source, "bootstrap");
  assert.equal(boot.value.audit.op, "switched");
  assert.equal(boot.value.audit.decidedBy, "customer");
  assert.equal(boot.value.audit.trunkVersion, 1);
  assert.deepEqual(await project.store.listHistory(), []);

  // bootstrap 只成功一次
  const again = await service.executeApply({
    source: "bootstrap",
    flowId: FLOW_ID,
    applicationId: "vc-boot-2",
    decisionId: "dec-boot-2",
    runId: project.runId,
    baseTrunkVersion: null,
    target: project.snapshot(),
    journalId: "j-boot-2",
    at: AT2,
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, "trunk-version-invalid");

  // 升级：新版本化文档 + 冻结 + re-pin（S3 Port 替身写真实 run manifest）
  const v2 = "docs/proposals/demo-proposal-v2.md";
  const v2sha = await writeProjectFile(project.root, v2, "# proposal v2\n");
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

  const target2 = project.snapshot();
  target2.trunkVersion = 0;
  target2.documents = { ...target2.documents, proposal: { path: v2, sha256: v2sha } };
  const upgraded = await service.executeApply({
    source: "upgrade",
    flowId: FLOW_ID,
    applicationId: "vc-up",
    decisionId: "dec-up",
    runId: project.runId,
    baseTrunkVersion: 1,
    target: target2,
    repin: { runId: project.runId, targets: [{ kind: "proposal", path: v2, sha256: v2sha }] },
    journalId: "j-up",
    at: AT2,
  });
  assert.equal(upgraded.ok, true);
  if (!upgraded.ok) return;
  assert.equal(upgraded.value.manifest.trunkVersion, 2);
  assert.equal(upgraded.value.manifest.source, "upgrade");
  assert.equal(upgraded.value.manifest.previous?.trunkVersion, 1);
  assert.equal(upgraded.value.historyArchivedVersion, 1);
  assert.equal(upgraded.value.audit.previousTrunkVersion, 1);
  assert.deepEqual(await project.store.listHistory(), [1]);
  const journal = await project.store.readJournal();
  assert.equal(journal.ok, true);
  if (journal.ok) {
    assert.equal(journal.value.phase, "committed");
    assert.equal(journal.value.result, "committed");
    assert.equal(journal.value.applicationId, "vc-up");
  }
  const verify = await service.verify();
  assert.deepEqual(verify, { ok: true, violations: [] });

  // 失败不改指针：哈希不符
  const badTarget = project.snapshot();
  badTarget.documents = { ...badTarget.documents, proposal: { path: v2, sha256: sha256("tampered") } };
  const mismatch = await service.executeApply({
    source: "upgrade",
    flowId: FLOW_ID,
    applicationId: "vc-bad",
    runId: project.runId,
    baseTrunkVersion: 2,
    target: badTarget,
    journalId: "j-bad",
    at: AT2,
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "trunk-apply-failed");
  const afterMismatch = await project.store.readManifest();
  assert.equal(afterMismatch.ok && afterMismatch.value.trunkVersion, 2);

  // 失败不改指针：base 版本不一致
  const baseMismatch = await service.executeApply({
    source: "upgrade",
    flowId: FLOW_ID,
    applicationId: "vc-bad2",
    runId: project.runId,
    baseTrunkVersion: 1,
    target: target2,
    journalId: "j-bad2",
    at: AT2,
  });
  assert.equal(baseMismatch.ok, false);
  if (!baseMismatch.ok) assert.equal(baseMismatch.code, "trunk-version-invalid");

  // 失败不改指针：目标未冻结
  const v3 = "docs/proposals/demo-proposal-v3.md";
  const v3sha = await writeProjectFile(project.root, v3, "# proposal v3 unfrozen\n");
  const unfrozenTarget = project.snapshot();
  unfrozenTarget.documents = { ...unfrozenTarget.documents, proposal: { path: v3, sha256: v3sha } };
  const unfrozen = await service.executeApply({
    source: "upgrade",
    flowId: FLOW_ID,
    applicationId: "vc-bad3",
    runId: project.runId,
    baseTrunkVersion: 2,
    target: unfrozenTarget,
    journalId: "j-bad3",
    at: AT2,
  });
  assert.equal(unfrozen.ok, false);
  if (!unfrozen.ok) {
    assert.equal(unfrozen.code, "trunk-apply-failed");
    assert.match(unfrozen.message ?? "", /未冻结/);
  }
  const afterAll = await project.store.readManifest();
  assert.equal(afterAll.ok && afterAll.value.trunkVersion, 2);
});

test("reconcileJournal：none/committed/prepared/相位滞后 split/corrupt", async () => {
  const project = await createTrunkProject();
  assert.deepEqual(await project.service.reconcileJournal(), {
    ok: true,
    value: { state: "none", split: false },
  });

  const boot = await bootstrap(project);
  manifestOf(boot);
  const committed = await project.service.reconcileJournal();
  assert.equal(committed.ok, true);
  if (committed.ok) {
    assert.equal(committed.value.state, "committed");
    assert.equal(committed.value.split, false);
    assert.equal(committed.value.audit?.trunkVersion, 1);
  }

  const journalRead = await project.store.readJournal();
  assert.equal(journalRead.ok, true);
  if (!journalRead.ok) return;
  const baseJournal = journalRead.value;

  // 内容已到提交点但 phase 滞后 ⇒ committed + split（S4 可补写事件）
  const lagging: TrunkApplyJournal = { ...baseJournal, phase: "prepared", result: undefined };
  assert.deepEqual(await project.store.writeJournal(lagging), { ok: true });
  const lag = await project.service.reconcileJournal();
  assert.equal(lag.ok, true);
  if (lag.ok) {
    assert.equal(lag.value.state, "committed");
    assert.equal(lag.value.split, true);
    assert.ok(lag.value.audit !== undefined);
  }

  // phase 领先于内容 ⇒ split（不自动修指针）；target 同时不匹配 run manifest
  const futureTarget: TrunkApplySnapshot = {
    ...baseJournal.target,
    trunkVersion: 99,
    documents: { ...baseJournal.target.documents, proposal: { path: PATHS.proposal, sha256: "f".repeat(64) } },
  };
  const ahead: TrunkApplyJournal = { ...baseJournal, phase: "committed", target: futureTarget, result: "committed" };
  assert.deepEqual(await project.store.writeJournal(ahead), { ok: true });
  const split = await project.service.reconcileJournal();
  assert.equal(split.ok, true);
  if (split.ok) {
    assert.equal(split.value.state, "split");
    assert.equal(split.value.split, true);
  }

  // 内容未到提交点、phase prepared ⇒ prepared（可重试）
  const prepared: TrunkApplyJournal = { ...baseJournal, phase: "prepared", target: futureTarget, result: undefined };
  assert.deepEqual(await project.store.writeJournal(prepared), { ok: true });
  const retry = await project.service.reconcileJournal();
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.value.state, "prepared");

  // journal 损坏 ⇒ fail-closed
  await fs.writeFile(path.join(project.root, ".ans/trunk/apply-journal.json"), "{broken", "utf8");
  const corrupt = await project.service.reconcileJournal();
  assert.equal(corrupt.ok, false);
  if (!corrupt.ok) assert.equal(corrupt.code, "trunk-journal-corrupt");
});

test("recover：客户确认恢复 tN+1（source recovery）；缺 decisionId/注册表损坏拒绝", async () => {
  const project = await createTrunkProject();
  manifestOf(await bootstrap(project));

  const missingDecision = await project.service.recover({ decisionId: "", reason: "manual", at: AT2 });
  assert.equal(missingDecision.ok, false);
  if (!missingDecision.ok) assert.equal(missingDecision.code, "trunk-recovery-invalid");

  // 模拟 manifest 损坏：恢复从唯一 pinned run 重新派生，并以 journal 最后版本为 tN 提示
  await fs.writeFile(path.join(project.root, ".ans/trunk/manifest.json"), "{broken", "utf8");
  const recovered = await project.service.recover({
    decisionId: "dec-recovery",
    reason: "manifest-corrupt",
    journalId: "j-rec",
    at: AT2,
  });
  assert.equal(recovered.ok, true);
  if (!recovered.ok) return;
  assert.equal(recovered.value.manifest.source, "recovery");
  assert.equal(recovered.value.manifest.trunkVersion, 2);
  assert.equal(recovered.value.audit.op, "recovered");
  assert.equal(recovered.value.audit.decidedBy, "customer");
  assert.equal(recovered.value.audit.reason, "manifest-corrupt");
  const status = await project.service.status();
  assert.equal(status.availability, "frozen");

  // 冻结注册表损坏 ⇒ 恢复拒绝（不自动重建；强制刷新以模拟会话重启后的观察）
  await fs.writeFile(path.join(project.root, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
  await project.registry.refreshSnapshot();
  const corruptRegistry = await project.service.recover({
    decisionId: "dec-recovery-2",
    reason: "registry",
    at: AT2,
  });
  assert.equal(corruptRegistry.ok, false);
  if (!corruptRegistry.ok) assert.equal(corruptRegistry.code, "trunk-recovery-invalid");
});

test("recover 显式 target（修复入口）：按目标重建 tN+1（字节复核），失败不改指针", async () => {
  const project = await createTrunkProject();
  manifestOf(await bootstrap(project));

  // 磁盘内容变化（workflow v2）+ 显式目标快照 ⇒ 恢复按目标落 t2（内容以磁盘字节复核）。
  const newSha = await writeProjectFile(project.root, PATHS.workflow, "# workflow repaired\n");
  const base = project.snapshot();
  const repaired = await project.service.recover({
    decisionId: "dec-repair",
    reason: "baseline-repair",
    target: { ...base, workflow: { path: PATHS.workflow, sha256: newSha } },
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    at: AT2,
  });
  assert.equal(repaired.ok, true, repaired.ok ? "" : `${repaired.code}: ${repaired.message ?? ""}`);
  if (!repaired.ok) return;
  assert.equal(repaired.value.manifest.source, "recovery");
  assert.equal(repaired.value.manifest.trunkVersion, 2);
  assert.equal(repaired.value.manifest.artifacts.workflow.sha256, newSha);
  assert.equal(repaired.value.manifest.d3?.decisionId, "dec-0");
  assert.deepEqual(repaired.value.manifest.roles, ["impl"]);
  const repairedVerify = await project.service.verify();
  assert.deepEqual(repairedVerify.violations, []);

  // 目标与磁盘字节不符 ⇒ 拒绝且不改指针（仍 t2）。
  const rejected = await project.service.recover({
    decisionId: "dec-repair-2",
    reason: "mismatch",
    target: { ...base, workflow: { path: PATHS.workflow, sha256: "0".repeat(64) } },
    at: AT2,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "trunk-apply-failed");
  const status = await project.service.status();
  assert.equal(status.manifest?.trunkVersion, 2);
});

test("applyStableSnapshot：mini re-pin 不升 trunkVersion、旧哈希不符/无 manifest 待续接", async () => {
  const project = await createTrunkProject();
  const boot = await bootstrap(project);
  assert.equal(boot.ok, true);

  const oldSha = project.hashes[PATHS.workflow]!;
  const newContent = "# workflow v2\n";
  const newSha = await writeProjectFile(project.root, PATHS.workflow, newContent);
  const repinned = await project.service.applyStableSnapshot({
    kind: "workflow",
    roleId: "convener",
    path: PATHS.workflow,
    oldSha,
    newSha,
    decisionId: "dec-workflow",
    at: AT2,
  });
  assert.equal(repinned.applied, true);
  assert.equal(repinned.audit?.op, "stable-repinned");
  assert.equal(repinned.audit?.trunkVersion, 1);
  assert.equal(repinned.audit?.oldSha, oldSha);
  assert.equal(repinned.audit?.newSha, newSha);
  assert.equal(repinned.audit?.origin, "customer");
  assert.equal(repinned.audit?.decidedBy, "customer");
  const read = await project.store.readManifest();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.value.trunkVersion, 1); // 不升版本
    assert.equal(read.value.artifacts.workflow.sha256, newSha);
  }

  // 旧哈希不符 ⇒ fail-closed（不更新快照）
  const stale = await project.service.applyStableSnapshot({
    kind: "workflow",
    roleId: "convener",
    path: PATHS.workflow,
    oldSha: "f".repeat(64),
    newSha: sha256("other"),
    decisionId: "dec-stale",
    at: AT2,
  });
  assert.equal(stale.applied, false);
  assert.equal(stale.pendingReattach, true);

  // role-card 快照更新
  const cardOld = project.hashes[PATHS.roleCard]!;
  const cardNew = await writeProjectFile(project.root, PATHS.roleCard, "# role card impl v2\n");
  const cardRepin = await project.service.applyStableSnapshot({
    kind: "role-card",
    roleId: "impl",
    path: PATHS.roleCard,
    oldSha: cardOld,
    newSha: cardNew,
    decisionId: "dec-card",
    at: AT2,
  });
  assert.equal(cardRepin.applied, true);
  const readCard = await project.store.readManifest();
  if (readCard.ok) assert.equal(readCard.value.artifacts.roleCards?.impl.sha256, cardNew);

  // 无 manifest ⇒ 只记待续接，不虚构快照
  const freshRoot = await makeRoot();
  const fresh = createTrunkService({
    projectRoot: freshRoot,
    store: (await import("../../src/provider/trunk/public/trunk-store.ts")).createFsTrunkStore(freshRoot),
    freezeRegistry: (await import("../../src/provider/version-change/public/version-change-store.ts")).createGuardFreezeRegistry(freshRoot),
    now: () => new Date(AT),
  });
  const pending = await fresh.applyStableSnapshot({
    kind: "workflow",
    roleId: "convener",
    path: PATHS.workflow,
    oldSha: "",
    newSha: sha256("x"),
    at: AT2,
  });
  assert.deepEqual(pending, { applied: false, pendingReattach: true });
});

const AMENDMENT_TEXT = (items: string, baseTrunk = 'baseTrunk:\n  trunkVersion: 1\n  runId: run-20261104-demo-a1b2c3d4\n  digest: DIGEST') =>
  [
    "---",
    "schema: trunk-amendment/v1",
    "amendmentId: am-1",
    `flowId: ${FLOW_ID}`,
    "docVersion: 1",
    baseTrunk,
    "summary: test amendment",
    "items:",
    items,
    "---",
    "# amendment",
  ].join("\n");

test("修正案：解析/哈希定格/目标版本/边界扩大/生命周期映射与校验", async () => {
  const project = await createTrunkProject();
  const boot = await bootstrap(project);
  const manifest = manifestOf(boot);

  const v2 = "docs/proposals/demo-proposal-v2.md";
  const v2sha = await writeProjectFile(project.root, v2, "# proposal v2\n");
  const team2 = "docs/scheduling/demo-team-v2.md";
  const team2sha = await writeProjectFile(project.root, team2, "# team plan v2\n");
  const amendmentRel = "docs/proposals/demo-amendment-v1.md";
  const items = [
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
    "  - itemId: it-3",
    "    kind: contract",
    "    change: none",
    `    to: ${PATHS.topology}`,
  ].join("\n");
  await writeProjectFile(
    project.root,
    amendmentRel,
    AMENDMENT_TEXT(items, `baseTrunk:\n  trunkVersion: 1\n  runId: ${project.runId}\n  digest: ${manifest.digest}`),
  );

  const validated = await project.service.validateAmendment({ amendmentDocPath: amendmentRel, flowId: FLOW_ID });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.value.doc.amendmentId, "am-1");
  assert.equal(validated.value.docSha256, sha256(await fs.readFile(path.join(project.root, amendmentRel), "utf8")));
  assert.equal(validated.value.items.length, 3);
  const proposalItem = validated.value.items.find((item) => item.itemId === "it-1");
  assert.equal(proposalItem?.fromSha256, project.hashes[PATHS.proposal]);
  assert.equal(proposalItem?.toSha256, v2sha);
  const executionItem = validated.value.items.find((item) => item.itemId === "it-2");
  assert.equal(executionItem?.fromSha256, project.hashes[PATHS.teamPlan]);
  assert.equal(executionItem?.toSha256, team2sha);
  assert.equal(validated.value.items.find((item) => item.itemId === "it-3")?.fromSha256, null);

  const target = await project.service.selectTargetVersion({ kind: "contract", path: v2 });
  assert.equal(target.selected, undefined);
  assert.deepEqual(target.candidates.map((candidate) => candidate.version), [1, 2]);

  // 边界扩大（旧/遗留 boundary item）：to 增加 test/ ⇒ expanded
  const boundaryTo = "角色卡/impl/boundary-v2.yaml";
  await writeProjectFile(project.root, boundaryTo, boundaryText(true));
  const expansion = await project.service.detectBoundaryExpansion([
    { itemId: "b-1", kind: "boundary", change: "modify", from: PATHS.boundary, to: boundaryTo },
  ]);
  assert.equal(expansion.expanded, true);
  assert.ok(expansion.expansions.some((entry) => entry.includes("test")));

  // 生命周期：draft → submitted；回退非法；旧状态不可写；读写回
  const state = {
    v: 1 as const,
    schema: "trunk-amendment/v1" as const,
    amendmentId: "am-1",
    flowId: FLOW_ID,
    docPath: amendmentRel,
    docSha256: validated.value.docSha256,
    docVersion: 1,
    baseTrunk: { trunkVersion: 1, runId: project.runId, digest: manifest.digest },
    status: "draft" as const,
    applyState: "idle" as const,
    items: validated.value.items,
    createdAt: AT,
    updatedAt: AT,
  };
  assert.equal((await project.service.recordAmendment(state)).ok, true);
  const submitted = await project.service.recordAmendment({ ...state, status: "submitted", updatedAt: AT2 });
  assert.equal(submitted.ok, true);
  const backwards = await project.service.recordAmendment({ ...state, status: "draft" });
  assert.equal(backwards.ok, false);
  if (!backwards.ok) assert.equal(backwards.code, "trunk-amendment-status-invalid");
  const legacy = await project.service.recordAmendment({ ...state, status: "proposed" as never });
  assert.equal(legacy.ok, false);
  const read = await project.service.readAmendment();
  assert.equal(read.ok, true);
  if (read.ok) assert.equal(read.value?.status, "submitted");

  // 非法修正案：workflow item 拒绝；全 change:none 拒绝
  const badRel = "docs/proposals/demo-amendment-v2.md";
  await writeProjectFile(
    project.root,
    badRel,
    [
      "---",
      "schema: trunk-amendment/v1",
      "amendmentId: am-2",
      `flowId: ${FLOW_ID}`,
      "docVersion: 2",
      "baseTrunk: null",
      "bootstrap: true",
      "items:",
      "  - itemId: it-1",
      "    kind: workflow",
      "    change: modify",
      `    from: ${PATHS.workflow}`,
      `    to: ${PATHS.workflow}`,
      "---",
    ].join("\n"),
  );
  const workflowItem = await project.service.validateAmendment({ amendmentDocPath: badRel, flowId: FLOW_ID });
  assert.equal(workflowItem.ok, false);
  if (!workflowItem.ok) assert.equal(workflowItem.code, "trunk-amendment-invalid");
});

test("status：存在未提交 journal ⇒ apply-uncertain", async () => {
  const project = await createTrunkProject();
  manifestOf(await bootstrap(project));
  const journal: TrunkApplyJournal = {
    v: 1,
    schema: TRUNK_APPLY_JOURNAL_SCHEMA,
    journalId: "j-pending",
    applicationId: "vc-pending",
    flowId: FLOW_ID,
    phase: "prepared",
    target: {
      trunkVersion: 99,
      runId: project.runId,
      documents: {},
      execution: { teamPlan: null, flow: null },
      boundaries: {},
    },
    before: {
      trunkVersion: 1,
      runId: project.runId,
      documents: {},
      execution: { teamPlan: null, flow: null },
      boundaries: {},
    },
    startedAt: AT2,
    updatedAt: AT2,
  };
  assert.deepEqual(await project.store.writeJournal(journal), { ok: true });
  const status = await project.service.status();
  assert.equal(status.availability, "apply-uncertain");
  assert.equal(status.journal?.journalId, "j-pending");
  assert.equal(status.manifest?.schema, TRUNK_MANIFEST_SCHEMA);
});
