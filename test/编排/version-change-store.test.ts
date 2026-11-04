// test/编排/version-change-store.test.ts
// S1 Provider 测试：VCA/重构/stable-write 记录与许可分表、原子写、坏件容错、并发串行、
// `doc-freezes` 派生缓存重建/对账、R9 冻结注册表 C2b 适配（P1 §2.2/§3.2/§4.1；F13/F34/AC-27）。
//
// 存储纯单元（临时项目根）+ 真实 C2b 集成（append → baseline → 快照 → frozen/draft）；
// 末尾以类型断言固定与 C2c 冻结 Port 的结构兼容。不改既有断言、不新增 skip。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  VERSION_INITIALIZED_REL,
  VERSION_BASELINE_REL,
  versionedDocFreezeState,
  type VersionedDocFreezeSnapshot,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import {
  REFACTOR_REQUEST_SCHEMA,
  STABLE_WRITE_SCHEMA,
  VERSION_CHANGE_SCHEMA,
  type DocFreezeRecord,
  type RefactorRequestRecord,
  type StableWritePermit,
  type StableWriteRecord,
  type VersionChangeRecord,
} from "../../src/model/version-change.ts";
import {
  DOC_FREEZES_REL,
  REFACTOR_REQUESTS_REL,
  STABLE_WRITE_PERMITS_REL,
  STABLE_WRITES_REL,
  VERSION_CHANGES_REL,
  createFreezeCacheStore,
  createGuardFreezeRegistry,
  createRefactorRequestStore,
  createStableWritePermitStore,
  createStableWriteStore,
  createVersionChangeStore,
} from "../../src/provider/version-change/public/version-change-store.ts";
import type {
  FreezeRegistryPort,
  StablePermitPort,
  StableWriteRepositoryPort,
  VersionChangeRepositoryPort,
} from "../../src/service/version-change/abstract/version-change-service.ts";

const AT = "2026-11-04T10:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-store-"));
}

function sha256Of(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function vca(overrides: Partial<VersionChangeRecord> = {}): VersionChangeRecord {
  return {
    v: 1,
    schema: VERSION_CHANGE_SCHEMA,
    applicationId: "vc-1",
    kind: "detail-amendment",
    initiatorRoleId: "rapporteur",
    flowId: "demo",
    baseTrunk: { trunkVersion: 1, runId: "run-1", digest: "digest-1" },
    bootstrap: false,
    targets: [
      { kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "modify", toSha256: SHA_A },
    ],
    amendmentId: "am-1",
    amendmentDocPath: "docs/proposals/demo-amendment-v1.md",
    summary: "small change",
    status: "draft",
    at: AT,
    ...overrides,
  };
}

function refactor(overrides: Partial<RefactorRequestRecord> = {}): RefactorRequestRecord {
  return {
    v: 1,
    schema: REFACTOR_REQUEST_SCHEMA,
    requestId: "rf-1",
    flowId: "demo",
    initiatedBy: "convener",
    title: "rename helper",
    reason: "reduce duplication",
    scope: { modules: ["src/common"], paths: ["src/common/foo.ts"], roles: ["编排"] },
    status: "requested",
    managedBy: "application-scheduler",
    enforcement: { writeSet: ["src/common"], forbiddenKinds: ["versioned-doc", "boundary", "stable", "team-plan", "flow"] },
    at: AT,
    ...overrides,
  };
}

function stableRecord(overrides: Partial<StableWriteRecord> = {}): StableWriteRecord {
  return {
    v: 1,
    schema: STABLE_WRITE_SCHEMA,
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    baseSha256: SHA_A,
    targetSha256: SHA_B,
    diffPreview: "@@ preview @@",
    status: "requested",
    at: AT,
    ...overrides,
  };
}

function permit(overrides: Partial<StableWritePermit> = {}): StableWritePermit {
  return {
    v: 1,
    schema: STABLE_WRITE_SCHEMA,
    permitId: "sw-1-p1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    authority: { decisionId: "dec-1" },
    baseSha256: SHA_A,
    targetSha256: SHA_B,
    status: "approved",
    approvedAt: AT,
    expiresAt: "2026-11-04T10:30:00.000Z",
    issuedAt: AT,
    ...overrides,
  };
}

function snapshotOf(
  state: VersionedDocFreezeSnapshot["state"],
  baselineSha256?: string,
  entries: VersionedDocFreezeSnapshot["entries"] = [],
): VersionedDocFreezeSnapshot {
  return {
    v: 1,
    schema: "doc-freezes/v1",
    state,
    ...(baselineSha256 !== undefined ? { baselineSha256 } : {}),
    entries,
    builtAt: AT,
  };
}

// —————————————— VCA / 重构 / stable-write 记录 ——————————————

test("VCA 记录：insert/list/findByFlow/乐观并发/未知字段保留/重复主键冲突", async () => {
  const root = await makeRoot();
  const store = createVersionChangeStore(root);

  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await store.insert(vca()), { ok: true });

  const duplicate = await store.insert(vca());
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "conflict");

  assert.deepEqual(await store.insert(vca({ applicationId: "vc-2", flowId: "other" })), { ok: true });
  assert.equal((await store.list()).length, 2);
  assert.equal((await store.findByFlow("demo")).length, 1);
  assert.equal((await store.findByFlow("other")).length, 1);
  assert.equal((await store.findById("vc-1"))?.applicationId, "vc-1");

  const loaded = await store.findById("vc-1");
  assert.ok(loaded !== undefined);
  assert.deepEqual(await store.updateWithExpectedStatus({ ...loaded, status: "submitted" }, "draft"), { ok: true });
  const approved = await store.updateWithExpectedStatus({ ...loaded, status: "approved" }, "draft");
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.equal(approved.code, "conflict");
  const missing = await store.updateWithExpectedStatus(vca({ applicationId: "vc-9" }), "draft");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "conflict");

  // 未知字段保留：更新记录未携带的扩展字段仍从现有记录保留
  const withExtra = { ...vca({ applicationId: "vc-3" }), extra: { note: "keep" } } as VersionChangeRecord & {
    extra: { note: string };
  };
  assert.deepEqual(await store.insert(withExtra), { ok: true });
  const fresh = vca({ applicationId: "vc-3", status: "submitted", at: AT });
  assert.deepEqual(await store.updateWithExpectedStatus(fresh, "draft"), { ok: true });
  const after = await store.findById("vc-3");
  assert.deepEqual((after as (VersionChangeRecord & { extra?: unknown }) | undefined)?.extra, { note: "keep" });
});

test("坏件容错：corrupt 读判别、list 抛错不静默清空、insert 不改文件", async () => {
  const root = await makeRoot();
  await fs.mkdir(path.join(root, ".ans/state"), { recursive: true });
  const abs = path.join(root, VERSION_CHANGES_REL);
  await fs.writeFile(abs, "{broken-json", "utf8");

  const store = createVersionChangeStore(root);
  const raw = await store.readRaw();
  assert.equal(raw.ok, false);
  if (!raw.ok) assert.equal(raw.reason, "corrupt");
  await assert.rejects(store.list(), /json-record-store-corrupt/);
  const inserted = await store.insert(vca());
  assert.equal(inserted.ok, false);
  if (!inserted.ok) assert.equal(inserted.code, "io");
  assert.equal(await fs.readFile(abs, "utf8"), "{broken-json");

  // 结构非法（非数组/记录缺字段）
  await fs.writeFile(abs, JSON.stringify({ v: 1 }), "utf8");
  const shape = await store.readRaw();
  assert.equal(shape.ok, false);
  if (!shape.ok) assert.equal(shape.reason, "corrupt");
});

test("重构记录：CRUD 与状态期望更新", async () => {
  const root = await makeRoot();
  const store = createRefactorRequestStore(root);

  assert.deepEqual(await store.insert(refactor()), { ok: true });
  assert.equal((await store.insert(refactor())).ok, false);
  assert.equal((await store.findByFlow("demo")).length, 1);
  const loaded = await store.findById("rf-1");
  assert.ok(loaded !== undefined);
  if (loaded !== undefined) {
    assert.deepEqual(await store.updateWithExpectedStatus({ ...loaded, status: "accepted" }, "requested"), { ok: true });
    assert.deepEqual(await store.updateWithExpectedStatus({ ...loaded, status: "closed" }, "accepted"), { ok: true });
    const wrong = await store.updateWithExpectedStatus({ ...loaded, status: "rejected" }, "requested");
    assert.equal(wrong.ok, false);
  }
  const file = await fs.readFile(path.join(root, REFACTOR_REQUESTS_REL), "utf8");
  assert.equal(JSON.parse(file).length, 1);
});

test("stable-write：record 与 permit 分表（F13）、upsert、installSnapshot 注入", async () => {
  const root = await makeRoot();
  const records = createStableWriteStore(root);
  const snapshots: StableWritePermit[][] = [];
  const permits = createStableWritePermitStore(root, {
    installSnapshot: (entries) => {
      snapshots.push(entries.map((entry) => ({ ...entry })));
    },
  });

  assert.deepEqual(await records.insert(stableRecord({ permitId: "sw-1-p1" })), { ok: true });
  assert.deepEqual(await permits.upsert(permit()), { ok: true });
  assert.deepEqual(await permits.upsert(permit({ status: "consumed", consumedAt: AT })), { ok: true });
  assert.equal((await permits.list()).length, 1);
  if ((await permits.list())[0]?.status !== "consumed") assert.fail("permit upsert 未替换同 permitId 记录");

  const recordText = await fs.readFile(path.join(root, STABLE_WRITES_REL), "utf8");
  const permitText = await fs.readFile(path.join(root, STABLE_WRITE_PERMITS_REL), "utf8");
  assert.ok(recordText.includes('"permitId": "sw-1-p1"'));
  assert.ok(!recordText.includes('"authority"'), "record 不得内嵌 permit（F13 分表）");
  assert.ok(permitText.includes('"authority"'));
  assert.ok(permitText.includes('"targetSha256"'));

  const installed = await permits.list();
  await permits.installSnapshot(installed);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.length, 1);

  const invalid = await permits.upsert({ ...permit(), status: "requested" as StableWritePermit["status"] });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, "io");
});

test("并发串行：30 路唯一插入全落盘；同主键并发仅一个成功", async () => {
  const root = await makeRoot();
  const store = createVersionChangeStore(root);

  const unique = await Promise.all(
    Array.from({ length: 30 }, (_, index) => store.insert(vca({ applicationId: `vc-${index + 1}` }))),
  );
  assert.ok(unique.every((result) => result.ok));
  assert.equal((await store.list()).length, 30);

  const sameId = await Promise.all(Array.from({ length: 10 }, () => store.insert(vca({ applicationId: "vc-dup" }))));
  assert.equal(sameId.filter((result) => result.ok).length, 1);
  assert.equal(sameId.filter((result) => !result.ok && result.code === "conflict").length, 9);
  assert.equal((await store.list()).filter((record) => record.applicationId === "vc-dup").length, 1);
});

// —————————————— doc-freezes 派生缓存 ——————————————

test("freeze 缓存：缺失重建/一致 no-op/陈旧以 baseline 为准/损坏 fail-closed/不可用", async () => {
  const root = await makeRoot();
  let baselineSha = SHA_A;
  let snapshotState: VersionedDocFreezeSnapshot["state"] = "ready";
  const store = createFreezeCacheStore(root, {
    migrationCompleted: () => true,
    refresh: async () => snapshotOf(snapshotState, baselineSha),
  });

  assert.equal((await store.load()).ok, false);
  const first = await store.reconcile();
  assert.equal(first.state, "rebuilt");
  const written = await store.load();
  assert.equal(written.ok, true);
  if (written.ok) assert.equal(written.value.baselineSha256, SHA_A);

  const second = await store.reconcile();
  assert.equal(second.state, "consistent");

  baselineSha = SHA_B;
  const stale = await store.reconcile();
  assert.equal(stale.state, "rebuilt");
  if (stale.state === "rebuilt") assert.match(stale.warning, /baseline/);
  const refreshed = await store.load();
  if (refreshed.ok) assert.equal(refreshed.value.baselineSha256, SHA_B);

  // baseline corrupt ⇒ unusable，缓存不重写
  const beforeCorrupt = await fs.readFile(path.join(root, DOC_FREEZES_REL), "utf8");
  snapshotState = "corrupt";
  const corruptBaseline = await store.reconcile();
  assert.equal(corruptBaseline.state, "unusable");
  if (corruptBaseline.state === "unusable") assert.equal(corruptBaseline.reason, "baseline-corrupt");
  assert.equal(await fs.readFile(path.join(root, DOC_FREEZES_REL), "utf8"), beforeCorrupt);
  const rebuild = await store.rebuildFromBaseline();
  assert.equal(rebuild.ok, false);
  if (!rebuild.ok) assert.equal(rebuild.reason, "baseline-corrupt");

  // migration-required（baseline 缺失/迁移未完成）⇒ unusable
  snapshotState = "migration-required";
  const missingBaseline = await store.reconcile();
  assert.equal(missingBaseline.state, "unusable");
  if (missingBaseline.state === "unusable") assert.equal(missingBaseline.reason, "baseline-missing");

  // 缓存损坏 ⇒ fail-closed，不自动重建
  const root2 = await makeRoot();
  await fs.mkdir(path.join(root2, ".ans/state"), { recursive: true });
  const cacheAbs = path.join(root2, DOC_FREEZES_REL);
  await fs.writeFile(cacheAbs, "{broken-cache", "utf8");
  const store2 = createFreezeCacheStore(root2, {
    migrationCompleted: () => true,
    refresh: async () => snapshotOf("ready", SHA_C),
  });
  const corruptCache = await store2.reconcile();
  assert.equal(corruptCache.state, "unusable");
  if (corruptCache.state === "unusable") assert.equal(corruptCache.reason, "cache-corrupt");
  assert.equal(await fs.readFile(cacheAbs, "utf8"), "{broken-cache");
});

// —————————————— R9 冻结注册表适配（真实 C2b 集成） ——————————————

interface DocProject {
  root: string;
  docA: { path: string; sha256: string };
  docB: { path: string; sha256: string };
}

async function makeDocProject(): Promise<DocProject> {
  const root = await makeRoot();
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const docAPath = "docs/proposals/demo-proposal-v1.md";
  const docBPath = "docs/proposals/demo-proposal-v2.md";
  const docAContent = "# demo proposal v1\n";
  const docBContent = "# demo proposal v2\n";
  await fs.writeFile(path.join(root, docAPath), docAContent, "utf8");
  await fs.writeFile(path.join(root, docBPath), docBContent, "utf8");
  return {
    root,
    docA: { path: docAPath, sha256: sha256Of(docAContent) },
    docB: { path: docBPath, sha256: sha256Of(docBContent) },
  };
}

function freezeRecord(overrides: Partial<DocFreezeRecord> = {}): DocFreezeRecord {
  return {
    schema: "doc-freeze/v1",
    applicationId: "vc-1",
    reason: "vca-approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "dec-1",
    frozenAt: AT,
    ...overrides,
  };
}

test("guard 冻结注册表：append 经 C2b 落 R9、frozen 状态、幂等/冲突、draft-marker", async () => {
  const project = await makeDocProject();
  const registry = createGuardFreezeRegistry(project.root, { migrationCompleted: () => true });

  const appended = await registry.appendDocFreezeRecords([
    { path: project.docA.path, version: 1, sha256: project.docA.sha256, freeze: freezeRecord() },
  ]);
  assert.deepEqual(appended, { ok: true });
  assert.equal(await registry.state(), "ready");

  const freezes = await registry.listFreezes();
  assert.equal(freezes.length, 1);
  assert.equal(freezes[0]?.path, project.docA.path);
  assert.equal(freezes[0]?.sha256, project.docA.sha256);
  assert.equal(freezes[0]?.freeze.reason, "vca-approved");
  assert.equal(versionedDocFreezeState(project.root, project.docA.path, true), "frozen");

  // 同 sha/同 reason/同 applicationId ⇒ 幂等跳过
  assert.deepEqual(
    await registry.appendDocFreezeRecords([
      { path: project.docA.path, version: 1, sha256: project.docA.sha256, freeze: freezeRecord() },
    ]),
    { ok: true },
  );
  // 已冻结同 sha 但不同 reason ⇒ frozen-conflict（冻结终态）
  const conflict = await registry.appendDocFreezeRecords([
    { path: project.docA.path, version: 1, sha256: project.docA.sha256, freeze: freezeRecord({ reason: "detail-item-applied" }) },
  ]);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "conflict");

  // draft-marker（migrated-draft 证据；不写 doc.freeze）
  const draftProject = await makeDocProject();
  const draftRegistry = createGuardFreezeRegistry(draftProject.root, { migrationCompleted: () => true });
  assert.deepEqual(
    await draftRegistry.appendDraftMarkers([
      { path: draftProject.docA.path, version: 1, sha256: draftProject.docA.sha256, evidence: "no customer confirmation", markedAt: AT },
    ]),
    { ok: true },
  );
  assert.equal(await draftRegistry.state(), "ready");
  const markers = await draftRegistry.listDraftMarkers();
  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.path, draftProject.docA.path);
  assert.equal(versionedDocFreezeState(draftProject.root, draftProject.docA.path, true), "draft");
});

test("guard 冻结注册表：baseline corrupt ⇒ corrupt/fail-closed；默认迁移未完成 ⇒ missing", async () => {
  const corruptRoot = await makeRoot();
  await fs.mkdir(path.join(corruptRoot, ".ans/state"), { recursive: true });
  await fs.writeFile(path.join(corruptRoot, VERSION_BASELINE_REL), "not-json\n", "utf8");
  await fs.writeFile(path.join(corruptRoot, VERSION_INITIALIZED_REL), "{}\n", "utf8");
  const corrupt = createGuardFreezeRegistry(corruptRoot, { migrationCompleted: () => true });
  assert.equal(await corrupt.state(), "corrupt");
  await assert.rejects(corrupt.listFreezes(), /baseline-corrupt/);

  const freshRoot = await makeDocProject();
  const fresh = createGuardFreezeRegistry(freshRoot.root); // 缺省 migrationCompleted=false（安全向）
  assert.equal(await fresh.state(), "missing");
});

test("doc-freezes 缓存与真实 baseline 对账：重建→一致→baseline 变化重建", async () => {
  const project = await makeDocProject();
  const registry = createGuardFreezeRegistry(project.root, { migrationCompleted: () => true });
  assert.deepEqual(
    await registry.appendDocFreezeRecords([
      { path: project.docA.path, version: 1, sha256: project.docA.sha256, freeze: freezeRecord() },
    ]),
    { ok: true },
  );

  const cache = createFreezeCacheStore(project.root, { migrationCompleted: () => true });
  const first = await cache.reconcile();
  assert.equal(first.state, "rebuilt");
  if (first.state === "rebuilt") {
    assert.equal(first.cache.entries.length, 1);
    assert.equal(first.cache.entries[0]?.path, project.docA.path);
    assert.equal(first.cache.entries[0]?.frozen, true);
  }
  assert.equal((await cache.reconcile()).state, "consistent");

  // 追加 draft-marker 改变 baseline 字节 ⇒ 缓存以 baseline 为准重建并告警
  assert.deepEqual(
    await registry.appendDraftMarkers([
      { path: project.docB.path, version: 2, sha256: project.docB.sha256, evidence: "draft evidence", markedAt: AT },
    ]),
    { ok: true },
  );
  const stale = await cache.reconcile();
  assert.equal(stale.state, "rebuilt");
  if (stale.state === "rebuilt") {
    assert.match(stale.warning, /baseline/);
    assert.equal(stale.cache.entries.length, 2);
  }
});

// —————————————— C2c Port 对齐（编译期固定 + 运行期烟测） ——————————————

test("Port 对齐：Provider 结构兼容 C2c 冻结 Port", async () => {
  const root = await makeRoot();
  const vcaPort: VersionChangeRepositoryPort = createVersionChangeStore(root);
  const stablePort: StableWriteRepositoryPort = createStableWriteStore(root);
  const permitPort: StablePermitPort = createStableWritePermitStore(root, { installSnapshot: () => {} });
  const registryPort: FreezeRegistryPort = createGuardFreezeRegistry(root, {
    refresh: async () => snapshotOf("ready", undefined),
  });

  assert.deepEqual(await vcaPort.list(), []);
  assert.deepEqual(await stablePort.list(), []);
  assert.deepEqual(await permitPort.list(), []);
  assert.equal(await registryPort.state(), "ready");
});
