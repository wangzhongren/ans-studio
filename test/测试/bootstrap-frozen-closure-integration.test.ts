// test/测试/bootstrap-frozen-closure-integration.test.ts
// T3 变更「bootstrap 快照/冻结闭包冲突修复」W5 跨角色集成批（测试 owner；P1.1 §4.1 B3 / §5.1 T1/T2/T3–T7/T17/T18/T19；B1 v1 AC-1/AC-3/AC-4/AC-6/AC-7/AC-9/AC-13）。
//
// 层级（BASE-8 L3 跨角色集成）：
//   · 真实临时项目根：真实 Git init（`createGitCapabilityService` prepare/execute）、真实 intent 确认
//     （`prepareIntentConfirmation`/`finalizeIntentConfirmation` → R9 `intent-confirmed` 冻结 + 真实账本）、
//     真实 `versions.jsonl`（历史冻结记录经**真实注册表写入器** `appendDocFreezeRecords`；草稿旧行按 RR19
//     既有历史以 fixture 字节落盘，代表「原位改写后的历史中间态」，不是本测试产生的冻结/快照/引用效果）、
//     真实 `trunk service`/`project trunk store`/Git 对象。
//   · 真实 `prepareDirectSubmission`（bootstrap 闭合装配）→ 真实 `vca.prepareDirect`（RR19 的
//     `vca-target-invalid / Target bytes absent` 拒绝点）→ 真实 `prepareDirectCommit`
//     （`materializeManifestFiles` + 真实候选 plan）→ 真实 `prepareDirectAuthority` → 真实
//     `checkGitPolicy` candidate/publication 两 verdict → 真实 `commitPreparedDirect`（真实 journal/
//     candidate ref/`refs/ans/trunk`/CAS；不伪造任何 ref/journal/snapshot/freeze）。
//   · 旧路径回归：t1 之后的非 bootstrap direct 快照仅含新 target；team-plan 快照仅 `directRefs(target)`。
//     initial-workflow 的 policy 分支不在本文件重驱（需要 stable-write 批准/写入链，属其它套件/RR；
//     本批以 `test/门禁引擎/git-shell-acl.test.ts` 全量回归覆盖其 policy 分支不变）。
//   · T19（未证明 snapshot-content 仍 `git-policy-raw-write-scope`）是**门禁层**用例：服务侧装配按构造
//     只纳入槽位/已确认意图/frozen 证明/账本文件，结构上不产生「未证明 snapshot-content」；本文件以
//     W2 同口径的**真实 Git 对象 + 真实 digest 算法**构造一致的门禁事实并钉住允许集边界（不宣称服务装配，
//     不冒充 snapshot/journal 的生产效果）。
//   · 核心注册表/H12 是进程级的；本文件**不绑定任何 Core 会话**（只用 service/store 层），因此多个
//     临时项目根互不干扰。测试辅助代码不得被产品代码引用。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  beginGitHostAction,
  endGitHostAction,
  createGitCandidateStore,
  createGitRefStore,
  createFsTrunkStore,
  createProjectTrunkStore,
  initializeGitRepository,
} from "../../src/provider/trunk/public/trunk-store.ts";
import {
  createGuardFreezeRegistry,
  type FreezeRecordInput,
  type FreezeRegistryStore,
} from "../../src/provider/version-change/public/version-change-store.ts";
import { createGitCapabilityService, createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createTrunkRuntime, recordTaskObservation } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { checkGitPolicy, type GitPolicyFacts } from "../../src/service/gate/shell-rules.ts";
import type { SubmitVersionChangeInput, TaskCreatedEvent, TaskStateEvent } from "../../src/model/runtime.ts";
import type { CompleteSnapshot, TrunkApplyJournal, TrunkManifest } from "../../src/model/trunk.ts";

const AT = "2026-11-10T00:00:00.000Z";
const FLOW = "demo";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sorted = (paths: readonly string[]) => [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
// 与 `classify-shell` 的 `gitCanonical`/`apply-journal` 的 `canonicalJson` 同口径：过滤 undefined、递归排序键。
const testCanonical = (value: unknown): unknown => Array.isArray(value) ? value.map(testCanonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => [key, testCanonical(item)]))
    : value;

interface Doc { path: string; doc: string; version: number; text: string }

// RR19 口径文档集：8 个 frozen 文档（intent v1、proposal v1/v2、architecture v1/v2、roster v1/v2、modules v1）。
const intentDoc: Doc = { path: "docs/product/demo-intent-v1.md", doc: "intent", version: 1,
  text: "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\n# W5 bootstrap closure intent\nDeliver the planning basis through the supported bootstrap path.\n" };
const proposalV1: Doc = { path: "docs/proposals/demo-proposal-v1.md", doc: "proposal", version: 1,
  text: "---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\n---\n# W5 proposal v1\n" };
const proposalV2: Doc = { path: "docs/proposals/demo-proposal-v2.md", doc: "proposal", version: 2,
  text: "---\nschema: project-proposal/v2\nflowId: demo\nversion: 2\nintent: docs/product/demo-intent-v1.md\n---\n# W5 proposal v2 (current)\n" };
const architectureV1: Doc = { path: "docs/contracts/demo-architecture-v1.md", doc: "architecture", version: 1,
  text: "---\nschema: project-architecture/v1\nflowId: demo\nversion: 1\n---\n# W5 architecture v1\n\nproposal: docs/proposals/demo-proposal-v1.md\n" };
const architectureV2: Doc = { path: "docs/contracts/demo-architecture-v2.md", doc: "architecture", version: 2,
  text: "---\nschema: project-architecture/v1\nflowId: demo\nversion: 2\n---\n# W5 architecture v2 (current)\n\nproposal: docs/proposals/demo-proposal-v2.md\n" };
const rosterV1: Doc = { path: "docs/proposals/demo-roster-v1.md", doc: "roster", version: 1,
  text: "---\nschema: project-roster/v3\nflowId: demo\nversion: 1\n---\n# W5 roster v1\n" };
const modulesV1: Doc = { path: "docs/proposals/demo-modules-v1.md", doc: "modules", version: 1,
  text: [
    "---", "schema: project-modules/v2", "flowId: demo", "version: 1", "modules:", "  - id: impl-core", "    name: Implementation",
    "    purpose: implementation module", "    path: src/", "    category: core", "    publicContract: src/index.ts",
    "    architectureSource: docs/contracts/demo-architecture-v2.md", "---", "# W5 modules v1",
  ].join("\n") };
const rosterV2: Doc = { path: "docs/proposals/demo-roster-v2.md", doc: "roster", version: 2,
  text: [
    "---", "schema: project-roster/v3", "flowId: demo", "version: 2", "intent: docs/product/demo-intent-v1.md",
    "proposal: docs/proposals/demo-proposal-v2.md", "architecture: docs/contracts/demo-architecture-v2.md",
    "envBootstrap:", "  omitted: true", "  omissionReason: W5 bootstrap closure fixture", "roles:", "  - id: impl", "    displayName: Implementation",
    "    purpose: implementation", "    capability: TS", "    modules:", "      - impl-core", "modules:", "  - id: impl-core",
    "    name: Implementation", "    purpose: implementation module", "    path: src/", "    category: core",
    "    publicContract: src/index.ts", "    architectureSource: docs/contracts/demo-architecture-v2.md", "---", "# W5 roster v2 (current)",
    "## 人员+模块拓扑图", "```topology", "schema: project-topology/v2", "management: [convener, impl]", "modules:",
    "  - id: impl-core", "    path: src/", "    roleId: impl", "roles:", "  - id: impl", "    modules: [impl-core]", "```",
  ].join("\n") };
const rr19Docs: readonly Doc[] = [intentDoc, proposalV1, proposalV2, architectureV1, architectureV2, rosterV1, rosterV2, modulesV1];

// 历史迁移冻结（RR19 `versions-final.jsonl` 同形：origin application / migrated-legacy）。
const migrationFreeze: FreezeRecordInput["freeze"] = { schema: "doc-freeze/v1", applicationId: "migration",
  reason: "migrated-legacy", origin: "application", frozenAt: AT };

const chainDocsRunId = "run-w5-bootstrap-docs";
const chainInitTaskId = "w5-init-task";
const chainInitOperationId = "w5-init-operation";
const chainProductTaskId = "w5-product-task";
const chainChiefSessionLiteral = "w5-chief-core-session";

function submissionTargets(): NonNullable<SubmitVersionChangeInput["targets"]> {
  return [
    { kind: "contract", path: proposalV2.path, action: "add", expectedFromSha256: null },
    { kind: "contract", path: architectureV2.path, action: "add", expectedFromSha256: null },
    { kind: "roster", path: rosterV2.path, action: "add", expectedFromSha256: null },
    { kind: "contract", path: modulesV1.path, action: "add", expectedFromSha256: null },
  ];
}

function submission(operationId: string, targets: SubmitVersionChangeInput["targets"] = submissionTargets(),
  overrides: Partial<SubmitVersionChangeInput> = {}): SubmitVersionChangeInput {
  return { operationId, kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW,
    summary: "W5 bootstrap closure integration", baseTrunk: null, targets, ...overrides };
}

async function writeDoc(root: string, doc: { path: string; text: string }): Promise<void> {
  const abs = path.join(root, doc.path);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, doc.text, "utf8");
}

function chainTask(input: { taskId: string; from: string; to: string; runId: string; runState: "draft" | "pinned";
  sideEffect: string; text: string; source: { path: string; sha256: string; sourceId?: string } }): TaskCreatedEvent {
  return { v: 1, at: AT, kind: "task.created", taskId: input.taskId, from: input.from as never, to: input.to as never,
    text: input.text, sideEffect: input.sideEffect as never, idempotencyKey: input.taskId, flowId: FLOW, runId: input.runId,
    runState: input.runState,
    ...(input.source.sourceId
      ? { workSourceRef: { kind: "chief-customer-turn" as const, sourceId: input.source.sourceId, path: input.source.path, sha256: input.source.sha256 } }
      : {}) };
}

interface LedgerRecord { v: number; flowId: string; doc: string; version: number; path: string; sha256: string;
  event: string; freeze?: { reason?: string; origin?: string } }

async function readLedger(root: string): Promise<LedgerRecord[]> {
  const text = await fsp.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8").catch(() => "");
  return text.split(/\r?\n/).filter(line => line.trim() !== "").map(line => JSON.parse(line) as LedgerRecord);
}

async function exists(abs: string): Promise<boolean> {
  return fsp.stat(abs).then(() => true, () => false);
}

/** 证据落盘（仅当设置 ANS_W5_EVIDENCE_DIR；正常测试运行不写盘）。只导出实际观察值，不伪造。 */
async function exportW5Evidence(name: string, value: unknown): Promise<void> {
  const dir = process.env.ANS_W5_EVIDENCE_DIR;
  if (!dir) return;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

interface BootstrapChain {
  root: string;
  service: ReturnType<typeof createTrunkService>;
  fsStore: ReturnType<typeof createFsTrunkStore>;
  registry: FreezeRegistryStore;
}

/**
 * 构造 RR19 同形的真实 bootstrap 前态（真实 init/intent/ledger/task/run/source）：
 *  - 真实 Git 初始化（`createGitCapabilityService` prepare/execute，真实 lease/journal）；
 *  - 真实 intent 确认（`finalizeIntentConfirmation` → 真实 `intent-confirmed` 冻结行）；
 *  - RR19 历史草稿旧行（2 条 intent 草稿 + 3 条 proposal/roster 草稿）以 fixture 字节落盘，代表
 *    「原位改写后的历史中间态」（其旧 sha 在磁盘/任何快照都不存在）；冻结行经真实注册表写入器追加；
 *  - 真实 product document-preparation 任务 + chief work source + draft run（`prepareDirectAuthority` 所需）。
 */
async function buildBootstrapChain(): Promise<BootstrapChain> {
  const root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "ans-w5-bootstrap-")));
  try {
    for (const doc of rr19Docs) await writeDoc(root, doc);
    const fsStore = createFsTrunkStore(root);
    const run = { schema: "ans-run/v1", runId: chainDocsRunId, flowId: FLOW, state: "draft" as const,
      documents: {}, execution: { teamPlan: null, flow: null }, createdAt: AT };
    const savedRun = await fsStore.compareAndSwapRunRecord!(chainDocsRunId, null, run as never);
    assert.ok(savedRun.ok, JSON.stringify(savedRun));

    // 1) 真实 Git init（真实 init 任务 + immutable work source + host mutation lease）。
    const initSourceId = "init-source-" + sha(root + ":init");
    const initSource = await fsStore.writeInitializationSource!(initSourceId, Buffer.from(JSON.stringify({
      schema: "repository-work-source/v1", kind: "customer-turn", sourceId: initSourceId, projectRoot: root, flowId: FLOW,
      parent: { roleId: "chief", sessionId: chainChiefSessionLiteral, inputAccepted: true, settled: false },
    })).toString("base64"));
    assert.ok(initSource.ok, JSON.stringify(initSource));
    const initRecorded = await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: chainInitTaskId, from: "chief",
      to: "convener", runId: chainDocsRunId, runState: "draft", sideEffect: "unknown",
      text: "Initialize the actual repository (W5 bootstrap closure)",
      source: { sourceId: initSourceId, path: initSource.value.path, sha256: initSource.value.sha256 } }) });
    assert.ok(initRecorded.ok, JSON.stringify(initRecorded));
    const initService = createGitCapabilityService({ projectRoot: root,
      context: { actorRoleId: "convener", taskId: chainInitTaskId, runId: chainDocsRunId, readPaths: ["."] } });
    const preparedInit = await initService.prepareInitialization({ action: "init", operationId: chainInitOperationId,
      base: { ref: "refs/ans/trunk", oid: null }, message: "W5 bootstrap closure initialization" });
    if (!preparedInit.ok) assert.fail(JSON.stringify(preparedInit));
    const initLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
    if (!initLease.ok) assert.fail(JSON.stringify(initLease));
    try {
      const initialized = await initService.executeInitialization(preparedInit.value, initLease.leaseId);
      assert.equal(initialized.status, "prepared", JSON.stringify(initialized));
    } finally { endGitHostAction({ projectRoot: root, leaseId: initLease.leaseId }); }

    // 2) 真实 intent 确认（retained-card marker + request.created/resolved + R9 intent-confirmed 冻结）。
    const seedRegistry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
    const seedService = createTrunkService({ projectRoot: root, store: createProjectTrunkStore(root), freezeRegistry: seedRegistry });
    const intentPrepared = await seedService.prepareIntentConfirmation(FLOW);
    if (!intentPrepared.ok) assert.fail(JSON.stringify(intentPrepared));
    const intentRequestId = "w5-intent-request";
    const intentCreated = await recordTaskObservation({ projectRoot: root, event: { v: 1, at: AT, kind: "request.created",
      requestId: intentRequestId, flowId: FLOW, sourceRoleId: "chief", cardKind: "intent-confirm",
      title: "Confirm the exact W5 bootstrap intent", context: intentPrepared.value.marker,
      options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] } as never });
    assert.ok(intentCreated.ok, JSON.stringify(intentCreated));
    const intentResolved = await recordTaskObservation({ projectRoot: root, event: { v: 1, at: AT, kind: "request.resolved",
      requestId: intentRequestId, cardKind: "intent-confirm", by: "customer", decisionId: "w5-intent-decision",
      selectedOptionIds: ["confirm"], choice: "confirm" } as never });
    assert.ok(intentResolved.ok, JSON.stringify(intentResolved));
    // RR19 前两条草稿旧行（intent baseline / draft-updated）：历史中间态，仅 fixture 字节。
    await fsp.mkdir(path.join(root, ".ans/state"), { recursive: true });
    await fsp.writeFile(path.join(root, ".ans/state/versions.jsonl"), [
      { v: 1, flowId: FLOW, doc: "intent", version: 1, path: "docs/product/demo-intent", sha256: "1".repeat(64),
        recordedAt: AT, recordedBy: "app:session", event: "baseline" },
      { v: 1, flowId: FLOW, doc: "intent", version: 1, path: "docs/product/demo-intent", sha256: "2".repeat(64),
        recordedAt: AT, recordedBy: "app:session", event: "draft-updated" },
    ].map(row => `${JSON.stringify(row)}\n`).join(""), "utf8");
    await fsp.writeFile(path.join(root, ".ans/state/versions.initialized"), `${JSON.stringify({ v: 1, initializedAt: AT })}\n`, "utf8");
    const finalized = await seedService.finalizeIntentConfirmation(intentPrepared.value,
      { outcome: "answered", value: { selected: ["confirm"] }, decisionId: "w5-intent-decision" } as never);
    assert.ok(finalized.ok, JSON.stringify(finalized));
    // 3 条不可恢复的草稿旧行（proposal v2 / roster v2），位于其 frozen 行之前（RR19 历史顺序）。
    await fsp.appendFile(path.join(root, ".ans/state/versions.jsonl"), [
      { v: 1, flowId: FLOW, doc: "proposal", version: 2, path: "docs/proposals/demo-proposal", sha256: "3".repeat(64),
        recordedAt: AT, recordedBy: "app:session", event: "version-added" },
      { v: 1, flowId: FLOW, doc: "roster", version: 2, path: "docs/proposals/demo-roster", sha256: "4".repeat(64),
        recordedAt: AT, recordedBy: "app:session", event: "version-added" },
      { v: 1, flowId: FLOW, doc: "roster", version: 2, path: "docs/proposals/demo-roster", sha256: "5".repeat(64),
        recordedAt: AT, recordedBy: "app:session", event: "draft-updated" },
    ].map(row => `${JSON.stringify(row)}\n`).join(""), "utf8");

    // 3) RR19 历史冻结记录：经**真实注册表写入器**追加（读真实磁盘字节复核 sha）。
    const appended = await seedRegistry.appendDocFreezeRecords(
      rr19Docs.filter(doc => doc.doc !== "intent").map(doc => ({ path: doc.path, version: doc.version, sha256: sha(doc.text), freeze: migrationFreeze })));
    assert.ok(appended.ok, JSON.stringify(appended));

    // 4) 真实 product document-preparation 任务（chief 原始来源 + draft run），供 prepareDirectAuthority 使用。
    const docSourceId = "init-source-" + sha(root + ":docs");
    const docSource = await fsStore.writeInitializationSource!(docSourceId, Buffer.from(JSON.stringify({
      schema: "repository-work-source/v1", kind: "customer-turn", sourceId: docSourceId, projectRoot: root, flowId: FLOW,
      parent: { roleId: "chief", sessionId: chainChiefSessionLiteral, inputAccepted: true, settled: false },
      purpose: "document-preparation", targetRoleId: "product", planningRunId: chainDocsRunId, documentBasis: null,
      initializationOperationId: chainInitOperationId,
    })).toString("base64"));
    assert.ok(docSource.ok, JSON.stringify(docSource));
    const productRecorded = await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: chainProductTaskId,
      from: "chief", to: "product", runId: chainDocsRunId, runState: "draft", sideEffect: "docs",
      text: "Publish the actual bootstrap planning basis (W5 bootstrap closure)",
      source: { sourceId: docSourceId, path: docSource.value.path, sha256: docSource.value.sha256 } }) });
    assert.ok(productRecorded.ok, JSON.stringify(productRecorded));

    const registry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
    const service = createTrunkService({ projectRoot: root, store: createProjectTrunkStore(root), freezeRegistry: registry });
    return { root, service, fsStore, registry };
  } catch (error) {
    await fsp.rm(root, { recursive: true, force: true });
    throw error;
  }
}

function buildRuntime(chain: BootstrapChain) {
  const integration = createVersionChangeIntegration({ projectRoot: chain.root, migrationCompleted: () => true, now: () => new Date(AT) });
  const events: TaskStateEvent[] = [];
  const emitEvent = async (event: TaskStateEvent): Promise<void> => { events.push(event); };
  const trunkRuntime = createTrunkRuntime({ projectRoot: chain.root, service: integration.trunk, emitEvent, now: () => new Date(AT) });
  const runtime = createVersionChangeRuntime({ projectRoot: chain.root, services: integration.services, trunkService: integration.trunk,
    trunkRuntime, emitEvent, notify: () => undefined, now: () => new Date(AT) });
  return { integration, runtime, events };
}

async function assertNoBootstrapEffects(root: string, operationId: string): Promise<void> {
  assert.equal(await exists(path.join(root, ".ans/trunk/manifest.json")), false, "no trunk manifest");
  assert.equal(await createGitCandidateStore(root).readRef("refs/ans/trunk"), null, "no refs/ans/trunk");
  const snapshotId = `s-${sha(JSON.stringify([FLOW, operationId]))}`;
  assert.equal(await exists(path.join(root, ".ans/trunk/snapshots", `${snapshotId}.json`)), false, "no operation snapshot");
}

async function assertFullChainRejects(chain: BootstrapChain, opId: string, targets: SubmitVersionChangeInput["targets"],
  expected: { serviceMessage: RegExp; chainMessage?: RegExp }): Promise<void> {
  const serviceLevel = await chain.service.prepareDirectSubmission(submission(opId, targets), "product");
  assert.equal(serviceLevel.ok, false, "service layer must fail closed");
  let serviceCode: string | undefined, serviceMessage: string | undefined;
  if (!serviceLevel.ok) {
    serviceCode = serviceLevel.code;
    serviceMessage = serviceLevel.message;
    assert.equal(serviceLevel.code, "trunk-item-invalid");
    assert.match(serviceLevel.message ?? "", expected.serviceMessage);
  }
  const { runtime } = buildRuntime(chain);
  const full = await runtime.submitDirect(submission(opId, targets), "product");
  assert.equal(full.ok, false, "full chain must fail closed");
  assert.equal(full.errorCode, "vca-target-invalid", "prepare failures map to vca-target-invalid (N1)");
  assert.match(full.message ?? "", expected.chainMessage ?? expected.serviceMessage);
  await assertNoBootstrapEffects(chain.root, opId);
  await exportW5Evidence(`negative-${opId}.json`, { operationId: opId,
    service: { code: serviceCode, message: serviceMessage },
    fullChain: { errorCode: full.errorCode, message: full.message } });
}

async function prepareBootstrapSubmission(chain: BootstrapChain, operationId: string) {
  const prepared = await chain.service.prepareDirectSubmission(submission(operationId), "product");
  if (!prepared.ok) assert.fail(JSON.stringify(prepared));
  return prepared.value;
}

/** 真实 prepareDirectCommit → prepareDirectAuthority → candidate/publication verdicts → commitPreparedDirect。 */
async function commitPreparedBootstrap(chain: BootstrapChain, prepared: Awaited<ReturnType<typeof prepareBootstrapSubmission>>) {
  const preparedCommit = await chain.service.prepareDirectCommit!(prepared.applyInput);
  if (!preparedCommit.ok || !("preparationKind" in preparedCommit.value)) assert.fail(JSON.stringify(preparedCommit));
  assert.equal(preparedCommit.value.preparationKind, "direct-document-commit");
  const authority = await chain.service.prepareDirectAuthority!(preparedCommit.value, chainProductTaskId);
  if (!authority.ok) assert.fail(JSON.stringify(authority));
  const candidateVerdict = checkGitPolicy(authority.value.candidatePolicyInput);
  const publicationVerdict = checkGitPolicy(authority.value.publicationPolicyInput);
  assert.equal(candidateVerdict.allowed, true, JSON.stringify(candidateVerdict));
  assert.equal(publicationVerdict.allowed, true, JSON.stringify(publicationVerdict));
  const lease = beginGitHostAction({ projectRoot: chain.root, kind: "git-mutation" });
  if (!lease.ok) assert.fail(JSON.stringify(lease));
  let receipt;
  try {
    receipt = await chain.service.commitPreparedDirect!(preparedCommit.value, { hostLeaseId: lease.leaseId,
      taskId: chainProductTaskId, candidateVerdict, publicationVerdict });
  } finally { endGitHostAction({ projectRoot: chain.root, leaseId: lease.leaseId }); }
  assert.equal(receipt.status, "applied", JSON.stringify(receipt));
  const manifest = await createProjectTrunkStore(chain.root).readManifest();
  if (!manifest.ok) assert.fail(JSON.stringify(manifest));
  return { preparedCommit: preparedCommit.value, authority: authority.value, candidateVerdict, publicationVerdict, receipt, manifest: manifest.value };
}

// ——————————————————————————————— T1：受支持 bootstrap 全链 ———————————————————————————————

test("W5-T1 bootstrap 4-target 全链：9 文件快照 → vca.prepareDirect 接受 → candidate/publication allowed → 真实 t1 提交", async () => {
  const chain = await buildBootstrapChain();
  try {
    const prepared = await prepareBootstrapSubmission(chain, "w5-t1-bootstrap");
    const snapshot = prepared.snapshot;
    const paths = snapshot.files.map(file => file.path);
    assert.equal(paths.length, 9, "8 frozen 文档（含 intent v1）+ versions.jsonl = 9 文件");
    assert.deepEqual(paths, sorted(paths), "files are sorted by path (deterministic replay)");
    assert.deepEqual(paths, sorted(rr19Docs.map(doc => doc.path).concat(".ans/state/versions.jsonl")));
    for (const file of snapshot.files)
      assert.equal(file.sha256, sha(await fsp.readFile(path.join(chain.root, file.path))), `snapshot sha equals disk bytes: ${file.path}`);
    for (const target of submissionTargets()) assert.ok(paths.includes(target.path), `target present: ${target.path}`);
    // 账本冻结记录 sha = 磁盘原始字节（服务侧捕获复核之外的独立断言）。
    const ledger = await readLedger(chain.root);
    const frozenRows = ledger.filter(row => row.event === "frozen");
    assert.equal(frozenRows.length, 8, "8 frozen records (intent v1 + 7 historical/current documents)");
    for (const row of frozenRows) {
      const file = /-v\d+\.md$/.test(row.path) ? row.path : `${row.path}-v${row.version}.md`;
      assert.equal(row.sha256, sha(await fsp.readFile(path.join(chain.root, file))), `record sha equals disk bytes: ${file}`);
    }
    // 5 条不可恢复的草稿旧行仍在账本内（旧 sha 不在快照；旧谓词必然失败）。
    const draftRows = ledger.filter(row => row.event !== "frozen");
    assert.equal(draftRows.length, 5, "5 historical draft rows (RR19 shape)");
    for (const row of draftRows) assert.ok(!snapshot.files.some(file => file.sha256 === row.sha256), "draft old sha is never in the snapshot");

    // VCA prepareDirect：RR19 的 `vca-target-invalid / Target bytes absent from complete snapshot` 拒绝点消除。
    const integration = createVersionChangeIntegration({ projectRoot: chain.root, migrationCompleted: () => true, now: () => new Date(AT) });
    if (!integration.services.vca.prepareDirect) assert.fail("vca.prepareDirect capability unavailable");
    const vca = await integration.services.vca.prepareDirect({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW,
      baseTrunk: null, currentTrunk: null, targets: submissionTargets(), summary: "W5 bootstrap closure integration",
      applicationId: prepared.applicationId, operationId: "w5-t1-bootstrap", snapshot, at: AT });
    assert.equal(vca.ok, true, JSON.stringify(vca));

    const committed = await commitPreparedBootstrap(chain, prepared);
    // 真实 materializeManifestFiles：历史 frozen 文件全部进入候选树（snapshot-content）。
    const planFiles = new Set(committed.authority.candidatePolicyInput.rawObjectPlan!.input.files.map(file => file.path));
    for (const doc of rr19Docs) assert.ok(planFiles.has(doc.path), `candidate tree carries ${doc.path}`);
    assert.ok(planFiles.has(".ans/state/versions.jsonl"), "candidate tree carries the R9 ledger");
    const generated = new Map(committed.authority.candidatePolicyInput.appGeneratedFiles.map(row => [row.path, row.kind]));
    for (const doc of [proposalV1, architectureV1, rosterV1])
      assert.equal(generated.get(doc.path), "snapshot-content", `historical frozen document materialized as snapshot-content: ${doc.path}`);
    assert.equal(generated.get(".ans/state/versions.jsonl"), "frozen-application-evidence");
    // candidate 与 publication 两 verdict 均 allowed（无 freeze-closure / raw-write-scope）。
    assert.notEqual(committed.candidateVerdict.code, "git-policy-app-freeze-closure");
    assert.notEqual(committed.candidateVerdict.code, "git-policy-raw-write-scope");
    // 真实 t1：manifest/ref/journal/snapshot 全部为真实产物（无伪造）。
    assert.equal(committed.manifest.trunkVersion, 1);
    assert.equal(committed.manifest.snapshotRef?.snapshotId, snapshot.snapshotId);
    assert.equal(committed.manifest.snapshotRef?.digest, snapshot.digest);
    const candidates = createGitCandidateStore(chain.root);
    const trunkRef = await candidates.readRef("refs/ans/trunk");
    assert.ok(trunkRef, "refs/ans/trunk exists after commit");
    const candidateRef = await candidates.readRef(`refs/ans/candidates/${sha("w5-t1-bootstrap")}`);
    assert.ok(candidateRef, "real candidate ref exists after commit");
    const journal = await createGitRefStore(chain.root).readJournal("w5-t1-bootstrap");
    assert.ok(journal && journal.phase === "published", "real operation journal is published");
    const storedSnapshot: unknown = JSON.parse(await fsp.readFile(
      path.join(chain.root, ".ans/trunk/snapshots", `${snapshot.snapshotId}.json`), "utf8"));
    assert.equal((storedSnapshot as CompleteSnapshot).digest, snapshot.digest, "snapshot file is the real captured bytes");
    // VCA finalizeDirect：真实 receipt 产生 applied 记录。
    if (!integration.services.vca.finalizeDirect) assert.fail("vca.finalizeDirect capability unavailable");
    const finalized = await integration.services.vca.finalizeDirect({ applicationId: prepared.applicationId, receipt: committed.receipt,
      snapshotRef: { snapshotId: snapshot.snapshotId, digest: snapshot.digest }, resultTrunkVersion: committed.manifest.trunkVersion, at: AT });
    assert.equal(finalized.ok, true, JSON.stringify(finalized));
    assert.equal(finalized.value.status, "applied");
    // 提交时的真实冻结追加：4 个 target 由 migrated-legacy 迁移确认追加 role-direct-applied（保护不弱化）。
    const after = await readLedger(chain.root);
    for (const target of submissionTargets()) {
      const actual = (row: LedgerRecord) => (/-v\d+\.md$/.test(row.path) ? row.path : `${row.path}-v${row.version}.md`) === target.path;
      assert.ok(after.some(row => row.event === "frozen" && row.freeze?.reason === "role-direct-applied" && actual(row)),
        `role-direct-applied freeze appended for ${target.path}`);
    }
    // 证据导出（仅 ANS_W5_EVIDENCE_DIR 设置时；只含实际观察值）。
    await exportW5Evidence("t1-snapshot-9-files.json", { snapshotId: snapshot.snapshotId, digest: snapshot.digest,
      files: snapshot.files.map(file => ({ path: file.path, sha256: file.sha256, bytes: Buffer.from(file.bytesBase64, "base64").length })) });
    await exportW5Evidence("t1-policy-verdicts.json", {
      candidate: { allowed: committed.candidateVerdict.allowed, code: committed.candidateVerdict.code ?? null, inputDigest: committed.candidateVerdict.inputDigest },
      publication: { allowed: committed.publicationVerdict.allowed, code: committed.publicationVerdict.code ?? null, inputDigest: committed.publicationVerdict.inputDigest },
      businessPublication: committed.authority.candidatePolicyInput.businessPublication,
      manifest: { trunkVersion: committed.manifest.trunkVersion, digest: committed.manifest.digest, snapshotRef: committed.manifest.snapshotRef } });
    await exportW5Evidence("t1-ledger-frozen-after-commit.json", after.filter(row => row.event === "frozen")
      .map(row => ({ path: row.path, version: row.version, sha256: row.sha256, reason: row.freeze?.reason, origin: row.freeze?.origin })));
  } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T2：7-target 同 kind 多版本拒绝 ———————————————————————————————

test("W5-T2 7-target 同 kind 多版本单请求：service trunk-item-invalid / 全链 vca-target-invalid，无副作用（M1）", async () => {
  const chain = await buildBootstrapChain();
  try {
    const targets7: SubmitVersionChangeInput["targets"] = [proposalV1, proposalV2, architectureV1, architectureV2, rosterV1, rosterV2, modulesV1]
      .map(doc => ({ kind: doc.doc === "roster" ? "roster" : "contract", path: doc.path, action: "add", expectedFromSha256: null }));
    await assertFullChainRejects(chain, "w5-t2-seven-targets", targets7,
      { serviceMessage: /Bootstrap accepts at most one target per document slot/, chainMessage: /assembled from R9/ });
    const serviceLevel = await chain.service.prepareDirectSubmission(submission("w5-t2-seven-targets", targets7), "product");
    if (serviceLevel.ok) assert.fail("7-target request must be rejected");
    assert.match(serviceLevel.message ?? "", /historical versions are assembled from R9/);
    assert.match(serviceLevel.message ?? "", /doc:proposal/);
  } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T3/T4/T5：缺失 / 漂移 / 不可读 ———————————————————————————————

test("W5-T3 bootstrap 闭合 fail-closed：历史 frozen 文件缺失、漂移、不可读均拒绝且无 manifest/ref/snapshot", async () => {
  const missing = await buildBootstrapChain();
  try {
    await fsp.rm(path.join(missing.root, proposalV1.path));
    await assertFullChainRejects(missing, "w5-t3-missing", submissionTargets(),
      { serviceMessage: /Frozen closure file is missing\/unreadable: docs\/proposals\/demo-proposal-v1\.md/ });
  } finally { await fsp.rm(missing.root, { recursive: true, force: true }); }

  const drift = await buildBootstrapChain();
  try {
    await fsp.appendFile(path.join(drift.root, proposalV1.path), "drifted after freeze\n");
    await assertFullChainRejects(drift, "w5-t4-drift", submissionTargets(),
      { serviceMessage: /Frozen closure hash drift: docs\/proposals\/demo-proposal-v1\.md/ });
  } finally { await fsp.rm(drift.root, { recursive: true, force: true }); }

  const unreadable = await buildBootstrapChain();
  try {
    const baseStore = createProjectTrunkStore(unreadable.root);
    const store = { ...baseStore, readProjectFile: async (rel: string, options?: { maxBytes?: number }) =>
      rel === proposalV1.path ? { ok: false as const, reason: "io" as const, message: "injected read failure" }
        : baseStore.readProjectFile!(rel, options) };
    const service = createTrunkService({ projectRoot: unreadable.root, store, freezeRegistry: unreadable.registry });
    const prepared = await service.prepareDirectSubmission(submission("w5-t5-unreadable"), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) assert.match(prepared.message ?? "", /Frozen closure file is missing\/unreadable: docs\/proposals\/demo-proposal-v1\.md/);
    await assertNoBootstrapEffects(unreadable.root, "w5-t5-unreadable");
  } finally { await fsp.rm(unreadable.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T6：账本坏行 / 未知 event / 非法 freeze ———————————————————————————————

test("W5-T6 账本坏行、未知 event、非法 freeze 形状：真实注册表整体 fail-closed（不跳过、无副作用）", async () => {
  const hostile = [
    ["bad line", "not-json\n"],
    ["unknown event", `${JSON.stringify({ v: 1, flowId: FLOW, doc: "proposal", version: 1, path: "docs/proposals/demo-proposal",
      sha256: sha(proposalV1.text), recordedAt: AT, recordedBy: "app:session", event: "future-event" })}\n`],
    ["invalid freeze", `${JSON.stringify({ v: 1, flowId: FLOW, doc: "proposal", version: 1, path: "docs/proposals/demo-proposal",
      sha256: sha(proposalV1.text), recordedAt: AT, recordedBy: "app:session", event: "frozen",
      freeze: { schema: "doc-freeze/v1", applicationId: "bad", reason: "not-a-reason", origin: "application", frozenAt: AT } })}\n`],
  ] as const;
  for (const [label, line] of hostile) {
    const chain = await buildBootstrapChain();
    try {
      await fsp.appendFile(path.join(chain.root, ".ans/state/versions.jsonl"), line, "utf8");
      await assertFullChainRejects(chain, `w5-t6-${label.replace(/ /g, "-")}`, submissionTargets(),
        { serviceMessage: /baseline-corrupt/ });
    } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
  }
});

// ——————————————————————————————— T7：同 path 多来源 sha 冲突 ———————————————————————————————

test("W5-T7 同 path 两种 sha（意图证据 vs frozen 记录）：fail-closed，消息含冲突路径", async () => {
  const chain = await buildBootstrapChain();
  try {
    const staleIntent = { path: intentDoc.path, version: 1, sha256: "f".repeat(64),
      freeze: { reason: "intent-confirmed", origin: "customer" } };
    const service = createTrunkService({ projectRoot: chain.root, store: createProjectTrunkStore(chain.root),
      freezeRegistry: { ...chain.registry, refreshSnapshot: async () => undefined, listFreezes: async () => [staleIntent] as never } });
    const prepared = await service.prepareDirectSubmission(submission("w5-t7-conflict"), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure path conflict: docs\/product\/demo-intent-v1\.md/);
    }
    await assertNoBootstrapEffects(chain.root, "w5-t7-conflict");
  } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T17：多 flow 账本逐行 fail-closed ———————————————————————————————

test("W5-T17 异 flow 冻结行逐行 fail-closed（不静默过滤，消息含 flowId）", async () => {
  const chain = await buildBootstrapChain();
  try {
    const foreignDoc = { path: "docs/proposals/other-proposal-v1.md", text: "Other flow proposal bytes\n" };
    await writeDoc(chain.root, foreignDoc);
    const appended = await chain.registry.appendDocFreezeRecords([{ path: foreignDoc.path, version: 1,
      sha256: sha(foreignDoc.text), freeze: migrationFreeze }]);
    assert.ok(appended.ok, JSON.stringify(appended));
    await assertFullChainRejects(chain, "w5-t17-foreign-flow", submissionTargets(),
      { serviceMessage: /Frozen closure record belongs to another flow: other/ });
  } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T18：-vN 后缀版本 ≠ record.version ———————————————————————————————

test("W5-T18 record.path 已是 -vN.md 且后缀 ≠ record.version：真实注册表拒绝；注入注册表下服务侧防御性拒绝", async () => {
  const mismatched = { v: 1, flowId: FLOW, doc: "proposal", version: 1, path: proposalV2.path, sha256: sha(proposalV2.text),
    recordedAt: AT, recordedBy: "app:session", event: "frozen", freeze: migrationFreeze };
  const real = await buildBootstrapChain();
  try {
    await fsp.appendFile(path.join(real.root, ".ans/state/versions.jsonl"), `${JSON.stringify(mismatched)}\n`, "utf8");
    await assertFullChainRejects(real, "w5-t18-suffix-real", submissionTargets(), { serviceMessage: /baseline-corrupt/ });
  } finally { await fsp.rm(real.root, { recursive: true, force: true }); }

  const injected = await buildBootstrapChain();
  try {
    await fsp.appendFile(path.join(injected.root, ".ans/state/versions.jsonl"), `${JSON.stringify(mismatched)}\n`, "utf8");
    const realIntent = { path: intentDoc.path, version: 1, sha256: sha(intentDoc.text),
      freeze: { reason: "intent-confirmed", origin: "customer" } };
    const service = createTrunkService({ projectRoot: injected.root, store: createProjectTrunkStore(injected.root),
      freezeRegistry: { ...injected.registry, refreshSnapshot: async () => undefined, listFreezes: async () => [realIntent] as never } });
    const prepared = await service.prepareDirectSubmission(submission("w5-t18-suffix-injected"), "product");
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "trunk-item-invalid");
      assert.match(prepared.message ?? "", /Frozen closure record version differs from its path: docs\/proposals\/demo-proposal-v2\.md/);
    }
    await assertNoBootstrapEffects(injected.root, "w5-t18-suffix-injected");
  } finally { await fsp.rm(injected.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— T19：未证明 snapshot-content 仍 raw-write-scope ———————————————————————————————

/**
 * 门禁层一致事实构造（W2 同口径；真实 Git 对象 + 真实 complete-snapshot digest 算法）。
 * 不宣称服务装配产物：服务侧闭合装配按构造只纳入槽位/意图/frozen/账本文件，不产生未证明 snapshot-content。
 */
async function gateCoherenceFixture(options: { frozenExtra: boolean }): Promise<{ root: string; facts: () => GitPolicyFacts;
  publish: (facts: GitPolicyFacts) => GitPolicyFacts }> {
  const root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "ans-w5-t19-")));
  const identity = await initializeGitRepository(root, "sha1");
  const objects = createGitCandidateStore(root);
  const operationId = "w5-t19-operation", applicationId = "w5-t19-application";
  const target = { path: "docs/proposals/demo-proposal-v2.md", text: "W5 T19 target proposal v2 bytes\n" };
  const extra = { path: "docs/proposals/demo-proposal-v9.md", text: "W5 T19 unproven extra proposal v9 bytes\n" };
  const rows = options.frozenExtra
    ? [{ v: 1, flowId: FLOW, doc: "proposal", version: 9, path: "docs/proposals/demo-proposal", sha256: sha(extra.text),
        recordedAt: AT, recordedBy: "app:session", event: "frozen", freeze: migrationFreeze }]
    : [];
  const contents = new Map<string, Buffer>([
    [target.path, Buffer.from(target.text)], [extra.path, Buffer.from(extra.text)],
    [".ans/state/versions.jsonl", Buffer.from(rows.map(row => `${JSON.stringify(row)}\n`).join(""))],
  ]);
  const documents = { proposal: { path: target.path, sha256: sha(target.text), version: 2 } };
  const execution = { teamPlan: null, flow: null };
  const snapshotFiles = [...contents].map(([file, bytes]) => ({ path: file, sha256: sha(bytes), bytesBase64: bytes.toString("base64") }));
  const snapshot: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId: "s-w5-t19", createdAt: AT, files: snapshotFiles,
    digest: sha(JSON.stringify([...snapshotFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map(file => [file.path, file.sha256, file.bytesBase64]))) };
  const snapshotRef = { snapshotId: snapshot.snapshotId, digest: snapshot.digest };
  const digest = sha("W5 T19 service-checked target digest");
  const source = { kind: "role-direct" as const, action: "version-upgrade" as const, actorRoleId: "product", operationId,
    applicationId, baseDigest: null, targetDigest: digest, at: AT, journalId: "w5-t19-journal" };
  const manifest: TrunkManifest = { schema: "trunk/v1", trunkVersion: 1, source: "upgrade", previous: null, flowId: FLOW, runId: null,
    artifacts: { documents, execution, boundaries: {} }, digest, createdAt: AT, updatedAt: AT, snapshotRef, actionSource: source };
  const journal: TrunkApplyJournal = { v: 1, schema: "trunk-apply-journal/v1", journalId: "w5-t19-journal", operationId,
    applicationId, flowId: FLOW, phase: "prepared", actionSource: source, targetSnapshot: snapshotRef, startedAt: AT, updatedAt: AT,
    target: { trunkVersion: 1, runId: null, documents: { proposal: { path: target.path, sha256: sha(target.text) } }, execution },
    before: { trunkVersion: 0, runId: null, documents: {}, execution } };
  const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const content = new Map<string, Buffer>(contents);
  content.set(".ans/trunk/manifest.json", manifestBytes);
  content.set(`.ans/trunk/snapshots/${snapshot.snapshotId}.json`, Buffer.from(JSON.stringify(snapshot)));
  const plan = await objects.plan({ operationId, base: null, timestamp: AT, message: `ANS trunk 1 ${digest}`,
    files: [...content].map(([file, bytes]) => ({ path: file, bytesBase64: bytes.toString("base64") })) });
  const facts = (): GitPolicyFacts => ({ repoId: identity.repoId, operationId, actorRoleId: "product", taskId: "w5-t19-task",
    authorizationRevision: 7, currentAuthorizationRevision: 7, objectFormat: "sha1", template: "commit", paths: [...content.keys()],
    readPaths: ["."], writePaths: ["docs/product/"], base: null, candidate: plan.commit.candidate, ref: plan.ref,
    ownedCandidateRef: plan.ref, worksite: plan.worksite, rawObjectPlan: plan, argv: plan.commands[0]!, commands: plan.commands,
    allDiff: { complete: true, base: null, candidate: plan.commit.candidate, entries: plan.diff },
    businessPublication: { kind: "direct-document-publication", flowId: FLOW, operationId, actorRoleId: "product", applicationId,
      action: "version-upgrade", snapshot: snapshotRef, documents, execution },
    appGeneratedFiles: [...content].map(([file, bytes]) => ({ path: file, sha256: sha(bytes),
      oid: plan.diff.find(row => row.newPath === file)!.newOid!,
      kind: file === ".ans/trunk/manifest.json" ? "manifest" as const
        : file.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" as const
          : file.startsWith(".ans/") ? "frozen-application-evidence" as const : "snapshot-content" as const })),
    manifestSha256: sha(manifestBytes), journalDigest: sha(JSON.stringify(testCanonical(binding))), businessJournal: journal });
  const publish = (input: GitPolicyFacts): GitPolicyFacts => ({ ...input, template: "publish-documents", ref: "refs/ans/trunk",
    publicationRef: "refs/ans/trunk", commands: [...input.commands!,
      ["--no-pager", "--no-optional-locks", "--literal-pathspecs", ...input.commands![0]!.slice(3, 27), "update-ref", "--no-deref",
        "refs/ans/trunk", input.candidate!.hex, "0".repeat(40)]] });
  return { root, facts, publish };
}

test("W5-T19 未证明 snapshot-content（docs/proposals 非槽位非 frozen）：candidate/publication 仍 git-policy-raw-write-scope；证明后放行", async () => {
  const unproven = await gateCoherenceFixture({ frozenExtra: false });
  try {
    const facts = unproven.facts();
    const candidate = checkGitPolicy(facts);
    assert.equal(candidate.allowed, false, JSON.stringify(candidate));
    assert.equal(candidate.code, "git-policy-raw-write-scope", "允许集不得放宽到未被 frozen 记录证明的路径（N2）");
    const publication = checkGitPolicy(unproven.publish(facts));
    assert.equal(publication.allowed, false, JSON.stringify(publication));
    assert.equal(publication.code, "git-policy-raw-write-scope", "candidate/publication 同一函数同一判定");
  } finally { await fsp.rm(unproven.root, { recursive: true, force: true }); }

  const proven = await gateCoherenceFixture({ frozenExtra: true });
  try {
    const facts = proven.facts();
    const provenCandidate = checkGitPolicy(facts), provenPublication = checkGitPolicy(proven.publish(facts));
    assert.equal(provenCandidate.allowed, true, JSON.stringify(provenCandidate));
    assert.equal(provenPublication.allowed, true, "frozen 证明后 candidate/publication 均 allowed");
    await exportW5Evidence("t19-verdicts.json", { unproven: { allowed: false, candidateCode: "git-policy-raw-write-scope", publicationCode: "git-policy-raw-write-scope" },
      proven: { candidateAllowed: provenCandidate.allowed, publicationAllowed: provenPublication.allowed,
        candidateInputDigest: provenCandidate.inputDigest, publicationInputDigest: provenPublication.inputDigest } });
  } finally { await fsp.rm(proven.root, { recursive: true, force: true }); }
});

// ——————————————————————————————— 旧路径回归：非 bootstrap direct / team-plan ———————————————————————————————

test("W5-回归 t1 之后：非 bootstrap direct 快照仅含新 target；team-plan 快照仅 directRefs（不含 versions/历史）", async () => {
  const chain = await buildBootstrapChain();
  try {
    const prepared = await prepareBootstrapSubmission(chain, "w5-regression-t1");
    const committed = await commitPreparedBootstrap(chain, prepared);
    assert.equal(committed.manifest.trunkVersion, 1);

    // team-plan：真实 prepareTeamPlanCommit；快照 = directRefs(target)（当前 4 槽位 + 新计划），不含 versions/历史冻结文件。
    const planPath = "docs/scheduling/demo-team-v2.md";
    const planText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: FLOW, version: 2,
      modules: { path: modulesV1.path, sha256: sha(modulesV1.text) },
      roster: { path: rosterV2.path, sha256: sha(rosterV2.text) },
      roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# W5 regression team plan v2\n`;
    await writeDoc(chain.root, { path: planPath, text: planText });
    const preparedPlan = await chain.service.prepareTeamPlanCommit!({ operationId: "w5-regression-plan", flowId: FLOW,
      plan: { path: planPath, sha256: sha(planText), version: 2 } }, "convener");
    if (!preparedPlan.ok || !("preparationKind" in preparedPlan.value)) assert.fail(JSON.stringify(preparedPlan));
    assert.equal(preparedPlan.value.preparationKind, "team-plan-commit");
    const planPaths = preparedPlan.value.snapshot.files.map(file => file.path);
    const planMarkers = planPaths.filter(file => file.startsWith(".ans/trunk/plan-completions/"));
    assert.equal(planMarkers.length, 1, "team-plan snapshot carries exactly its own completion marker");
    assert.deepEqual(sorted(planPaths), sorted([proposalV2.path, architectureV2.path, rosterV2.path, modulesV1.path, planPath, planMarkers[0]!]),
      "team-plan snapshot keeps only directRefs(target) + its completion marker; never versions.jsonl/historical frozen files");
    assert.ok(!planPaths.includes(".ans/state/versions.jsonl") && !planPaths.includes(proposalV1.path));

    // 非 bootstrap direct（t1 → proposal v3 modify）：快照逐字保持旧行为（仅新 target）。
    const proposalV3 = { path: "docs/proposals/demo-proposal-v3.md", text:
      "---\nschema: project-proposal/v2\nflowId: demo\nversion: 3\nintent: docs/product/demo-intent-v1.md\n---\n# W5 proposal v3\n" };
    await writeDoc(chain.root, proposalV3);
    const upgradeTargets: NonNullable<SubmitVersionChangeInput["targets"]> = [
      { kind: "contract", path: proposalV3.path, action: "modify", expectedFromSha256: sha(proposalV2.text) }];
    const upgrade = await chain.service.prepareDirectSubmission({ operationId: "w5-regression-upgrade", kind: "version-upgrade",
      initiatorRoleId: "product", flowId: FLOW, summary: "W5 regression upgrade", baseTrunk: { version: 1, digest: committed.manifest.digest },
      targets: upgradeTargets }, "product");
    if (!upgrade.ok) assert.fail(JSON.stringify(upgrade));
    const upgradePaths = upgrade.value.snapshot.files.map(file => file.path);
    assert.deepEqual(sorted(upgradePaths), sorted([proposalV3.path, architectureV2.path, rosterV2.path, modulesV1.path]),
      "non-bootstrap prepare captures only directRefs(target) slots (old behavior)");
    assert.ok(!upgradePaths.includes(".ans/state/versions.jsonl") && !upgradePaths.includes(proposalV1.path)
      && !upgradePaths.includes(intentDoc.path), "non-bootstrap prepare never collects the freeze ledger/closure extras");
    // VCA 非 bootstrap 路径同样接受（baseTrunk/currentTrunk 与 effective 一致）。
    const integration = createVersionChangeIntegration({ projectRoot: chain.root, migrationCompleted: () => true, now: () => new Date(AT) });
    if (!integration.services.vca.prepareDirect) assert.fail("vca.prepareDirect capability unavailable");
    const vca = await integration.services.vca.prepareDirect({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW,
      baseTrunk: { trunkVersion: 1, runId: null, digest: committed.manifest.digest },
      currentTrunk: { trunkVersion: 1, runId: null, digest: committed.manifest.digest },
      targets: upgradeTargets,
      summary: "W5 regression upgrade", applicationId: upgrade.value.applicationId, operationId: "w5-regression-upgrade",
      snapshot: upgrade.value.snapshot, at: AT });
    assert.equal(vca.ok, true, JSON.stringify(vca));
  } finally { await fsp.rm(chain.root, { recursive: true, force: true }); }
});
