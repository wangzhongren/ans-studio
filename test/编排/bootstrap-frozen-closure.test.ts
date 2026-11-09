// test/编排/bootstrap-frozen-closure.test.ts
// T3 变更「bootstrap 快照/冻结闭包冲突修复」W1 服务侧测试（编排 owner；P1.1 §5.1 服务侧条目）。
//
// 覆盖：
//   T1  受支持 bootstrap（4 当前版本 targets + 8 frozen 记录）⇒ 9 文件快照、按 path 排序、
//       记录 sha = 磁盘字节，且 `vca.prepareDirect` 接受（RR19 的 Target bytes absent 拒绝点消失）；
//   T2  7-target 同 kind 多版本单请求 ⇒ prepareDirectSubmission 明确拒绝（trunk-item-invalid，
//       消息含 slot/「assembled from R9」），无快照/manifest 副作用（M1）；
//   T3/T4/T5 历史 frozen 文件缺失/漂移/不可读 ⇒ fail-closed；
//   T6  账本坏行/未知 event/非法 freeze 形状 ⇒ fail-closed（不跳过）；
//   T7  同 path 两种 sha（意图证据与 frozen 记录冲突）⇒ fail-closed，消息含 path；
//   T8  无历史 bootstrap ⇒ 快照内容与原实现一致（directRefs + intent + versions）；
//   T9  非 bootstrap 升级 ⇒ 不调用闭合收集（快照逐字不变）；
//   T13 规模：多 frozen 记录按线性装配、path 排序、digest 确定；
//   T14 旧调用：非 bootstrap executeDirect（无 preparedSnapshotRef）保持旧捕获集合；
//   T15 FS 媒体：bootstrap executeDirect 的 fallback 捕获装配闭合集合（不宣称 Git policy）；
//   T16 重放：同一 operationId 装配 digest 稳定；不同文件集合 ⇒ snapshot-immutable-conflict；
//   T17 多 flow 账本：异 flow 行逐行 fail-closed（消息含 flowId，不静默过滤）；
//   T18 `-vN.md` 后缀版本 ≠ record.version ⇒ 服务侧防御性 fail-closed。
// 说明：B2 门禁侧（classify-shell）不在本批；本文件只断言服务侧与 FS 行为。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import {
  createGuardFreezeRegistry,
  type FreezeRecordInput,
  type FreezeRegistryStore,
} from "../../src/provider/version-change/public/version-change-store.ts";
import { createTrunkService, type TrunkDirectApplyInput } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import type { SubmitVersionChangeInput } from "../../src/model/runtime.ts";

const AT = "2026-11-10T00:00:00.000Z";
const FLOW = "demo";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sorted = (paths: string[]) => [...paths].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

interface Doc { path: string; text: string; doc: string; version: number }

// RR19 场景文档：8 个 frozen 文档（intent v1、proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1）。
const intentDoc: Doc = { path: "docs/product/demo-intent-v1.md", doc: "intent", version: 1,
  text: "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\n# Confirmed intent\n" };
const proposalV1: Doc = { path: "docs/proposals/demo-proposal-v1.md", doc: "proposal", version: 1,
  text: `---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: ${"docs/product/demo-intent-v1.md"}\n---\n# Proposal v1\n` };
const proposalV2: Doc = { path: "docs/proposals/demo-proposal-v2.md", doc: "proposal", version: 2,
  text: `---\nschema: project-proposal/v2\nflowId: demo\nversion: 2\nintent: ${"docs/product/demo-intent-v1.md"}\n---\n# Proposal v2\n` };
const architectureV1: Doc = { path: "docs/contracts/demo-architecture-v1.md", doc: "architecture", version: 1,
  text: "---\nschema: project-architecture/v1\nflowId: demo\nversion: 1\n---\n# Architecture v1\n" };
const architectureV2: Doc = { path: "docs/contracts/demo-architecture-v2.md", doc: "architecture", version: 2,
  text: "---\nschema: project-architecture/v1\nflowId: demo\nversion: 2\n---\n# Architecture v2\n" };
const rosterV1: Doc = { path: "docs/proposals/demo-roster-v1.md", doc: "roster", version: 1,
  text: "---\nschema: project-roster/v3\nflowId: demo\nversion: 1\n---\n# Roster v1\n" };
const rosterV2: Doc = { path: "docs/proposals/demo-roster-v2.md", doc: "roster", version: 2,
  text: "---\nschema: project-roster/v3\nflowId: demo\nversion: 2\n---\n# Roster v2\n" };
const modulesV1: Doc = { path: "docs/proposals/demo-modules-v1.md", doc: "modules", version: 1,
  text: "---\nschema: project-modules/v2\nflowId: demo\nversion: 1\n---\n# Modules v1\n" };
const rr19Docs = [intentDoc, proposalV1, proposalV2, architectureV1, architectureV2, rosterV1, rosterV2, modulesV1];

// 冻结子形状：历史迁移行（origin:"application"，无客户字段）与已确认意图行（真实客户决定形状）。
const migrationFreeze: FreezeRecordInput["freeze"] = { schema: "doc-freeze/v1", applicationId: "migration",
  reason: "migrated-legacy", origin: "application", frozenAt: AT };
const intentFreeze: FreezeRecordInput["freeze"] = { schema: "doc-freeze/v1", applicationId: "intent-demo-intent-decision",
  reason: "intent-confirmed", origin: "customer", decidedBy: "customer", decisionId: "demo-intent-decision", frozenAt: AT,
  source: { kind: "customer-decision", decisionId: "demo-intent-decision", requestId: "demo-intent-request", at: AT } };

function recordOf(doc: Doc, event: string, sha256: string, flowId = FLOW, freeze?: FreezeRecordInput["freeze"]) {
  // 真实 R9 账本写 canonical 路径（不带 `-vN.md`；RR19 `versions-final.jsonl` 同形），
  // 由冻结闭包解析为实际文件 `${path}-v${version}.md`。
  const base = `${flowId}-${doc.doc}`;
  const canonical = doc.doc === "intent" ? `docs/product/${base}`
    : doc.doc === "architecture" || doc.doc === "assets" ? `docs/contracts/${base}` : `docs/proposals/${base}`;
  return { v: 1, flowId, doc: doc.doc, version: doc.version, path: canonical, sha256, recordedAt: AT, recordedBy: "app:session", event,
    ...(freeze ? { freeze } : {}) };
}

// RR19 口径账本：8 条 frozen + 5 条不可恢复的草稿历史行（baseline/version-added/draft-updated 旧 sha）。
function rr19Ledger(): Array<Record<string, unknown>> {
  return [
    recordOf(intentDoc, "baseline", "1".repeat(64)),
    recordOf(intentDoc, "draft-updated", "2".repeat(64)),
    recordOf(architectureV1, "version-added", "3".repeat(64)),
    recordOf(architectureV1, "frozen", sha(architectureV1.text), FLOW, migrationFreeze),
    recordOf(modulesV1, "frozen", sha(modulesV1.text), FLOW, migrationFreeze),
    recordOf(proposalV1, "frozen", sha(proposalV1.text), FLOW, migrationFreeze),
    recordOf(rosterV1, "frozen", sha(rosterV1.text), FLOW, migrationFreeze),
    recordOf(rosterV2, "version-added", "4".repeat(64)),
    recordOf(rosterV2, "draft-updated", "5".repeat(64)),
    recordOf(architectureV2, "frozen", sha(architectureV2.text), FLOW, migrationFreeze),
    recordOf(proposalV2, "frozen", sha(proposalV2.text), FLOW, migrationFreeze),
    recordOf(rosterV2, "frozen", sha(rosterV2.text), FLOW, migrationFreeze),
    recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
  ];
}

async function setupProject(input: { rows?: Array<Record<string, unknown>>; docs?: Doc[]; omitDocs?: string[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-bootstrap-closure-"));
  for (const doc of input.docs ?? rr19Docs) {
    if (input.omitDocs?.includes(doc.path)) continue;
    await fs.mkdir(path.dirname(path.join(root, doc.path)), { recursive: true });
    await fs.writeFile(path.join(root, doc.path), doc.text);
  }
  const rows = input.rows ?? rr19Ledger();
  await fs.mkdir(path.join(root, ".ans/state"), { recursive: true });
  await fs.writeFile(path.join(root, ".ans/state/versions.jsonl"), rows.map(row => `${JSON.stringify(row)}\n`).join(""));
  await fs.writeFile(path.join(root, ".ans/state/versions.initialized"), `${JSON.stringify({ v: 1, initializedAt: AT })}\n`);
  const store = createFsTrunkStore(root);
  const registry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
  const service = createTrunkService({ projectRoot: root, store, freezeRegistry: registry });
  return { root, store, registry, service };
}

// 绕过 C2b 解析的注入注册表（只供服务侧闭合解析的负例到达本批代码；真实端到端 fail-closed 另行断言）。
function bypassRegistry(base: FreezeRegistryStore, freezes: FreezeRecordInput[]): FreezeRegistryStore {
  return { ...base, refreshSnapshot: async () => undefined, listFreezes: async () => freezes };
}
const intentEntry: FreezeRecordInput = { path: intentDoc.path, version: 1, sha256: sha(intentDoc.text), freeze: intentFreeze };

const currentTargets: SubmitVersionChangeInput["targets"] = [
  { kind: "contract", path: proposalV2.path, action: "add", expectedFromSha256: null },
  { kind: "contract", path: architectureV2.path, action: "add", expectedFromSha256: null },
  { kind: "roster", path: rosterV2.path, action: "add", expectedFromSha256: null },
  { kind: "contract", path: modulesV1.path, action: "add", expectedFromSha256: null },
];
function submission(overrides: Partial<SubmitVersionChangeInput> = {}): SubmitVersionChangeInput {
  return { operationId: "op-bootstrap-closure-01", kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW,
    summary: "Bootstrap closure", baseTrunk: null, targets: currentTargets, ...overrides };
}

async function assertNoTrunkEffects(root: string) {
  assert.equal(await fs.stat(path.join(root, ".ans/trunk/manifest.json")).then(() => true, () => false), false, "no manifest");
  assert.deepEqual(await fs.readdir(path.join(root, ".ans/trunk/snapshots")).catch(() => []), [], "no snapshot writes");
}

test("T1 bootstrap closure: 4 current-version targets + 8 frozen records assemble the exact 9-file sorted snapshot and pass vca.prepareDirect", async () => {
  const f = await setupProject();
  try {
    const prepared = await f.service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;
    const paths = prepared.value.snapshot.files.map(file => file.path);
    assert.deepEqual(paths, sorted(paths), "files are sorted by path (deterministic replay)");
    assert.equal(paths.length, 9, paths.join(","));
    assert.deepEqual(paths, sorted(rr19Docs.map(doc => doc.path).concat(".ans/state/versions.jsonl")));
    for (const file of prepared.value.snapshot.files)
      assert.equal(file.sha256, sha(await fs.readFile(path.join(f.root, file.path))), `snapshot sha equals disk bytes: ${file.path}`);
    for (const target of currentTargets) assert.ok(paths.includes(target.path), `target present: ${target.path}`);
    // RR19 的拒绝点（Target bytes absent from complete snapshot）在闭合装配后通过。
    const integration = createVersionChangeIntegration({ projectRoot: f.root, migrationCompleted: () => true });
    const vca = await integration.services.vca.prepareDirect!({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW,
      baseTrunk: null, currentTrunk: null, targets: currentTargets, summary: "Bootstrap closure",
      applicationId: prepared.value.applicationId, operationId: "op-bootstrap-closure-01", snapshot: prepared.value.snapshot, at: AT });
    assert.equal(vca.ok, true, JSON.stringify(vca));
    assert.equal((await f.store.readManifest()).ok, false, "preparation never commits a manifest");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T2 bootstrap same-kind multi-version targets are rejected explicitly (M1), never last-wins, with no side effects", async () => {
  const f = await setupProject();
  try {
    const targets7: SubmitVersionChangeInput["targets"] = [proposalV1, proposalV2, architectureV1, architectureV2, rosterV1, rosterV2, modulesV1]
      .map(doc => ({ kind: doc.doc === "roster" ? "roster" : "contract", path: doc.path, action: "add", expectedFromSha256: null }));
    const prepared = await f.service.prepareDirectSubmission(submission({ targets: targets7 }), "product");
    assert.equal(prepared.ok, false, "7-target same-kind multi-version request must be rejected");
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid", "service layer code (full chain maps to vca-target-invalid)");
      assert.match(prepared.message ?? "", /Bootstrap accepts at most one target per document slot/);
      assert.match(prepared.message ?? "", /historical versions are assembled from R9/);
      assert.match(prepared.message ?? "", /doc:proposal/);
      assert.match(prepared.message ?? "", /demo-proposal-v2\.md/);
    }
    await assertNoTrunkEffects(f.root);
    // 原实现会以「Target bytes absent from complete snapshot」/expectedFrom 计数错误呈现；M1 在准备阶段明确拒绝。
    assert.equal((await f.store.readManifest()).ok, false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T3 bootstrap closure fails closed when a frozen record file is missing, drifted or unreadable", async () => {
  const missing = await setupProject({ omitDocs: [proposalV1.path] });
  try {
    const prepared = await missing.service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure file is missing\/unreadable: docs\/proposals\/demo-proposal-v1\.md/);
    }
    await assertNoTrunkEffects(missing.root);
  } finally { await fs.rm(missing.root, { recursive: true, force: true }); }

  const drift = await setupProject();
  try {
    await fs.writeFile(path.join(drift.root, proposalV1.path), `${proposalV1.text}drifted after freeze\n`);
    const prepared = await drift.service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure hash drift: docs\/proposals\/demo-proposal-v1\.md/);
    }
    await assertNoTrunkEffects(drift.root);
  } finally { await fs.rm(drift.root, { recursive: true, force: true }); }

  const unreadable = await setupProject();
  try {
    const store = { ...unreadable.store, readProjectFile: async (rel: string, options?: { maxBytes?: number }) =>
      rel === proposalV1.path ? { ok: false as const, reason: "io" as const, message: "injected read failure" }
        : unreadable.store.readProjectFile!(rel, options) };
    const service = createTrunkService({ projectRoot: unreadable.root, store, freezeRegistry: unreadable.registry });
    const prepared = await service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) assert.match(prepared.message ?? "", /Frozen closure file is missing\/unreadable: docs\/proposals\/demo-proposal-v1\.md/);
    await assertNoTrunkEffects(unreadable.root);
  } finally { await fs.rm(unreadable.root, { recursive: true, force: true }); }
});

test("T6 ledger negative cases fail closed without skipping: bad line, unknown event, invalid freeze shape", async () => {
  for (const [label, rows] of [
    ["bad line", rr19Ledger().concat("not-json" as unknown as Record<string, unknown>)],
    ["unknown event", rr19Ledger().concat({ ...recordOf(proposalV1, "mystery-event", sha(proposalV1.text)), freeze: undefined } as unknown as Record<string, unknown>)],
    ["invalid freeze", rr19Ledger().concat({ ...recordOf(proposalV1, "frozen", sha(proposalV1.text)),
      freeze: { schema: "doc-freeze/v1", applicationId: "bad", reason: "not-a-reason", origin: "application", frozenAt: AT } } as unknown as Record<string, unknown>)],
  ] as Array<[string, Array<Record<string, unknown>>]>) {
    const f = await setupProject({ rows });
    try {
      const service = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: bypassRegistry(f.registry, [intentEntry]) });
      const prepared = await service.prepareDirectSubmission(submission(), "product");
      assert.equal(prepared.ok, false, `${label} must fail closed`);
      if (!prepared.ok) assert.match(prepared.message ?? "", /Frozen closure record is unreadable\/invalid/, label);
      await assertNoTrunkEffects(f.root);
    } finally { await fs.rm(f.root, { recursive: true, force: true }); }
  }
  // 真实注册表（不绕过）：坏账本同样整体 fail-closed，不产生快照/manifest。
  const f = await setupProject({ rows: rr19Ledger().concat("not-json" as unknown as Record<string, unknown>) });
  try {
    const prepared = await f.service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) assert.equal(prepared.code, "trunk-item-invalid");
    await assertNoTrunkEffects(f.root);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T7 same-path sources with different sha fail closed with the conflicting path", async () => {
  const f = await setupProject();
  try {
    const staleIntent = { ...intentEntry, sha256: "f".repeat(64) };
    const service = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: bypassRegistry(f.registry, [staleIntent]) });
    const prepared = await service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure path conflict: docs\/product\/demo-intent-v1\.md/);
    }
    await assertNoTrunkEffects(f.root);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T8 no-history bootstrap keeps the original snapshot content (targets + confirmed intent + versions only)", async () => {
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze)];
  const f = await setupProject({ docs: [intentDoc, proposalV1], rows });
  try {
    const prepared = await f.service.prepareDirectSubmission(submission({ targets: [{ kind: "contract", path: proposalV1.path, action: "add", expectedFromSha256: null }] }), "product");
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;
    assert.deepEqual(prepared.value.snapshot.files.map(file => file.path), [".ans/state/versions.jsonl", intentDoc.path, proposalV1.path]);
    assert.equal((await f.store.readManifest()).ok, false, "preparation never commits a manifest");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T9 non-bootstrap upgrade does not collect the freeze ledger (snapshot bytes unchanged)", async () => {
  const docs = [intentDoc, proposalV1, proposalV2, architectureV1];
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
    recordOf(architectureV1, "frozen", sha(architectureV1.text), FLOW, migrationFreeze)];
  const f = await setupProject({ docs, rows });
  try {
    const bootstrapInput: TrunkDirectApplyInput = { operationId: "op-t1", applicationId: "vc-1", actorRoleId: "product", kind: "version-upgrade",
      flowId: FLOW, baseTrunk: null, at: AT, target: { trunkVersion: 1, runId: null,
        documents: { proposal: { path: proposalV1.path, sha256: sha(proposalV1.text) } }, execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} },
      expectedFrom: [{ path: proposalV1.path, sha256: null }] };
    assert.equal((await f.service.executeDirect(bootstrapInput)).status, "applied");
    const effective = await f.service.readEffectiveSnapshot(); assert.ok(effective.ok); if (!effective.ok) return;
    const prepared = await f.service.prepareDirectSubmission(submission({ operationId: "op-t2",
      baseTrunk: { version: 1, digest: effective.value.manifest.digest },
      targets: [{ kind: "contract", path: proposalV2.path, action: "modify", expectedFromSha256: sha(proposalV1.text) }] }), "product");
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;
    assert.deepEqual(prepared.value.snapshot.files.map(file => file.path), [proposalV2.path], "no ledger/intent/frozen history files");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T13 scale: many frozen records assemble linearly in path order with a deterministic digest", async () => {
  const assets: Doc[] = Array.from({ length: 40 }, (_, index) => ({ path: `docs/contracts/demo-assets-v${index + 1}.md`, doc: "assets",
    version: index + 1, text: `---\nschema: project-assets/v1\nflowId: demo\nversion: ${index + 1}\n---\n# Assets v${index + 1}\n` }));
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
    ...assets.map(doc => recordOf(doc, "frozen", sha(doc.text), FLOW, migrationFreeze))];
  const f = await setupProject({ docs: [intentDoc, proposalV1, ...assets], rows });
  try {
    const first = await f.service.prepareDirectSubmission(submission({ operationId: "op-scale-a",
      targets: [{ kind: "contract", path: proposalV1.path, action: "add", expectedFromSha256: null }] }), "product");
    const second = await f.service.prepareDirectSubmission(submission({ operationId: "op-scale-b",
      targets: [{ kind: "contract", path: proposalV1.path, action: "add", expectedFromSha256: null }] }), "product");
    assert.equal(first.ok && second.ok, true, JSON.stringify([first, second]));
    if (!first.ok || !second.ok) return;
    assert.equal(first.value.snapshot.files.length, 43, "40 frozen assets + intent + target proposal + versions");
    assert.deepEqual(first.value.snapshot.files.map(file => file.path), sorted(first.value.snapshot.files.map(file => file.path)));
    assert.deepEqual(second.value.snapshot.files, first.value.snapshot.files);
    assert.equal(second.value.snapshot.digest, first.value.snapshot.digest, "same evidence set ⇒ same complete snapshot digest");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T14 legacy call: non-bootstrap executeDirect without preparedSnapshotRef keeps the old capture set", async () => {
  const docs = [intentDoc, proposalV1, proposalV2, architectureV1];
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
    recordOf(architectureV1, "frozen", sha(architectureV1.text), FLOW, migrationFreeze)];
  const f = await setupProject({ docs, rows });
  try {
    const bootstrapInput: TrunkDirectApplyInput = { operationId: "op-legacy-t1", applicationId: "vc-1", actorRoleId: "product", kind: "version-upgrade",
      flowId: FLOW, baseTrunk: null, at: AT, target: { trunkVersion: 1, runId: null,
        documents: { proposal: { path: proposalV1.path, sha256: sha(proposalV1.text) } }, execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} },
      expectedFrom: [{ path: proposalV1.path, sha256: null }] };
    assert.equal((await f.service.executeDirect(bootstrapInput)).status, "applied");
    const t1 = await f.service.readEffectiveSnapshot(); assert.ok(t1.ok); if (!t1.ok) return;
    const upgrade: TrunkDirectApplyInput = { ...bootstrapInput, operationId: "op-legacy-t2", applicationId: "vc-2",
      baseTrunk: { version: 1, digest: t1.value.manifest.digest },
      target: { trunkVersion: 2, runId: null, documents: { proposal: { path: proposalV2.path, sha256: sha(proposalV2.text) } },
        execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} },
      expectedFrom: [{ path: proposalV2.path, sha256: sha(proposalV1.text) }] };
    const receipt = await f.service.executeDirect(upgrade);
    assert.equal(receipt.status, "applied", JSON.stringify(receipt));
    const t2 = await f.service.readEffectiveSnapshot(); assert.ok(t2.ok); if (!t2.ok) return;
    assert.deepEqual(t2.value.snapshot.files.map(file => file.path), [proposalV2.path], "non-bootstrap fallback never adds ledger closure files");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T15 FS media: direct bootstrap executeDirect (no preparedSnapshotRef) assembles the frozen closure and applies", async () => {
  const docs = [intentDoc, proposalV1, architectureV1, rosterV1, modulesV1];
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
    recordOf(architectureV1, "frozen", sha(architectureV1.text), FLOW, migrationFreeze),
    recordOf(rosterV1, "frozen", sha(rosterV1.text), FLOW, migrationFreeze),
    recordOf(modulesV1, "frozen", sha(modulesV1.text), FLOW, migrationFreeze)];
  const f = await setupProject({ docs, rows });
  try {
    const input: TrunkDirectApplyInput = { operationId: "op-fs-bootstrap", applicationId: "vc-1", actorRoleId: "product", kind: "version-upgrade",
      flowId: FLOW, baseTrunk: null, at: AT, target: { trunkVersion: 1, runId: null,
        documents: { proposal: { path: proposalV1.path, sha256: sha(proposalV1.text) } }, execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} },
      expectedFrom: [{ path: proposalV1.path, sha256: null }] };
    const receipt = await f.service.executeDirect(input);
    assert.equal(receipt.status, "applied", JSON.stringify(receipt));
    const published = await f.service.readEffectiveSnapshot(); assert.ok(published.ok); if (!published.ok) return;
    assert.equal(published.value.manifest.trunkVersion, 1);
    assert.deepEqual(published.value.snapshot.files.map(file => file.path),
      sorted([proposalV1.path, intentDoc.path, architectureV1.path, rosterV1.path, modulesV1.path, ".ans/state/versions.jsonl"]),
      "fallback capture carries every frozen record file (FS media; no Git policy is claimed)");
    assert.equal((await f.registry.listFreezes()).some(entry => entry.path === proposalV1.path && entry.freeze.reason === "role-direct-applied"), true);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T15 negative: bootstrap executeDirect fallback fails closed on closure drift with no manifest/journal/freeze effects", async () => {
  const docs = [intentDoc, proposalV1, architectureV1];
  const rows = [recordOf(intentDoc, "frozen", sha(intentDoc.text), FLOW, intentFreeze),
    recordOf(architectureV1, "frozen", sha(architectureV1.text), FLOW, migrationFreeze)];
  const f = await setupProject({ docs, rows });
  try {
    await fs.writeFile(path.join(f.root, architectureV1.path), `${architectureV1.text}drifted after freeze\n`);
    const input: TrunkDirectApplyInput = { operationId: "op-fs-bootstrap-drift", applicationId: "vc-1", actorRoleId: "product", kind: "version-upgrade",
      flowId: FLOW, baseTrunk: null, at: AT, target: { trunkVersion: 1, runId: null,
        documents: { proposal: { path: proposalV1.path, sha256: sha(proposalV1.text) } }, execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} },
      expectedFrom: [{ path: proposalV1.path, sha256: null }] };
    const receipt = await f.service.executeDirect(input);
    assert.equal(receipt.status, "rejected", JSON.stringify(receipt));
    assert.equal(receipt.errorCode, "vca-target-invalid");
    assert.match(receipt.message ?? "", /Frozen closure hash drift: docs\/contracts\/demo-architecture-v1\.md/);
    assert.equal((await f.store.readManifest()).ok, false, "no manifest");
    assert.deepEqual(await fs.readdir(path.join(f.root, ".ans/trunk/operations")).catch(() => []), [], "no journal");
    assert.equal((await f.registry.listFreezes()).length, 2, "no freeze record appended");
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T16 replay: same operationId produces a stable digest; a different file set fails snapshot-immutable-conflict", async () => {
  const topology = { path: "docs/proposals/demo-topology-v1.md", doc: "topology", version: 1,
    text: "---\nschema: project-topology/v1\nflowId: demo\nversion: 1\n---\n# Topology v1\n" };
  const f = await setupProject({ docs: rr19Docs.concat(topology) });
  try {
    const first = await f.service.prepareDirectSubmission(submission(), "product");
    const replay = await f.service.prepareDirectSubmission(submission(), "product");
    assert.equal(first.ok && replay.ok, true, JSON.stringify([first, replay]));
    if (!first.ok || !replay.ok) return;
    assert.equal(replay.value.snapshot.snapshotId, first.value.snapshot.snapshotId);
    assert.equal(replay.value.snapshot.digest, first.value.snapshot.digest);
    assert.deepEqual(replay.value.snapshot.files, first.value.snapshot.files);
    const different = await f.service.prepareDirectSubmission(submission({
      targets: currentTargets.concat({ kind: "contract", path: topology.path, action: "add", expectedFromSha256: null }) }), "product");
    assert.equal(different.ok, false, "same operationId with a different file set must fail closed");
    if (!different.ok) {
      assert.equal(different.code, "trunk-item-invalid");
      assert.match(different.message ?? "", /snapshot-immutable-conflict/);
    }
    assert.equal((await f.store.readManifest()).ok, false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T17 another-flow ledger row fails closed without silent filtering", async () => {
  const foreign = { v: 1, flowId: "other", doc: "proposal", version: 1, path: "docs/proposals/other-proposal",
    sha256: "9".repeat(64), recordedAt: AT, recordedBy: "app:session", event: "frozen", freeze: migrationFreeze };
  const f = await setupProject({ rows: rr19Ledger().concat(foreign as unknown as Record<string, unknown>) });
  try {
    const prepared = await f.service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false, "foreign-flow rows must never be silently filtered");
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure record belongs to another flow: other/);
    }
    await assertNoTrunkEffects(f.root);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("T18 frozen record whose -vN suffix differs from record.version fails closed service-side", async () => {
  const mismatched = { ...recordOf(proposalV2, "frozen", sha(proposalV2.text), FLOW, migrationFreeze), path: proposalV2.path, version: 1 };
  const f = await setupProject({ rows: rr19Ledger().concat(mismatched as unknown as Record<string, unknown>) });
  try {
    const service = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: bypassRegistry(f.registry, [intentEntry]) });
    const prepared = await service.prepareDirectSubmission(submission(), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure record version differs from its path: docs\/proposals\/demo-proposal-v2\.md/);
    }
    await assertNoTrunkEffects(f.root);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
