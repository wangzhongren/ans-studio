// test/编排/fixtures/git-action-authorization-wiring.ts
// W3b 测试夹具：真实 demo Core 会话 + 真实 host inventory 发布 + 真实文件系统（init/Git）。
// 供 `git-action-authorization-wiring*.test.ts` 复用。Core 注册表是进程级的；custom provider 会话
// 无法以 drained 收口（I0-3 冻结），因此每个测试 *文件* 使用自己的项目根并保持会话 active 到进程结束。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

import { createRuntimeAdapter, inspectRuntimeCoreRegistry, inspectRuntimeFileGateContext, type RuntimeSessionOptions } from "../../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../../src/provider/runtime/tools.ts";
import { recordGitHostInventory, recordTaskObservation, executeGitTeamPlanPublication } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitRoleRuntime } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitCapabilityService, createTrunkService } from "../../../src/service/trunk/public/trunk-service.ts";
import { beginGitHostAction, endGitHostAction, createFsTrunkStore, migrateLegacyTrunkToGit } from "../../../src/provider/trunk/public/trunk-store.ts";
import { createVersionChangeIntegration } from "../../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeStack } from "../../../app/desktop/version-change.ts";
import type { CompleteTeamPlanInput, GitCandidateFn, RoleSession, SubmitVersionChangeFn, TaskCreatedEvent, WriteGate } from "../../../src/model/runtime.ts";
import type { TrunkManifest } from "../../../src/model/trunk.ts";
import { TRUNK_MANIFEST_SCHEMA } from "../../../src/model/trunk.ts";
import { createTrunkProject, PATHS } from "./trunk-project.ts";
import { allow, role, until } from "../../runtime-core/fixtures.ts";

export const W3B_AT = "2026-11-08T00:00:00.000Z";
export const W3B_WORKFLOW_TEXT = "# W3b actual initial workflow\n";
export const w3bSha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const w3bSidecarPath = (root: string, operationId: string) =>
  path.join(root, ".ans/trunk/operations", w3bSha256(operationId), "authorization.jsonl");

export function w3bFileGateOptions(root: string): Partial<RuntimeSessionOptions> {
  const protectedGitRoots = [path.join(root, ".git")];
  return { writeRoot: root, protectedGitRoots, fileGateProtocol: "host-facts-v1",
    fileGateProtection: { projectRoot: root, protectedGitRoots, coverage: "unknown", basisDigest: "a".repeat(64), reasons: [] } };
}

export type W3bBoundSession = RoleSession & { sessionId: string };
export async function bindDemoSession(root: string, roleId: string, opened: RoleSession[], options: Partial<RuntimeSessionOptions> = {}): Promise<W3bBoundSession> {
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, ...w3bFileGateOptions(root), ...options });
  const bound = await adapter.bindRole(role(roleId));
  assert.ok(bound.sessionId, "bound session has an actual session id");
  const session = bound as W3bBoundSession;
  opened.push(session);
  return session;
}

/** host-facts-v1 分阶段门：真实校验 issued context 后放行（生产 gate 的测试替身，非授权放宽）。 */
export const allowStagedFileGate: WriteGate = (target, context) => {
  const facts = context?.operation !== undefined && context.stage !== undefined
    ? inspectRuntimeFileGateContext(context, target, context.operation, context.stage) : undefined;
  return facts
    ? { allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } }
    : { allowed: false, reason: "fixture staged gate context missing", allowedByRoot: { project: [], skill: [] } };
};

/** 可重复装填的 git_candidate 挂起：工具在测试释放前保持 active（真实 Core 回合事实）。 */
export function holdableGitCandidate() {
  let release!: () => void;
  let held = new Promise<void>(resolve => { release = resolve; });
  const gitCandidate: GitCandidateFn = async input => {
    await held;
    return { operationId: input.operationId, repoId: "fixture", status: "blocked", code: "fixture-held", message: "fixture only" };
  };
  return { gitCandidate, release: () => release(), rearm: () => { held = new Promise<void>(resolve => { release = resolve; }); } };
}

/** 挂起的业务发布工具（complete_team_plan）：保持真实 Core 回合的 active tool。 */
export function holdableCompleteTeamPlan() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  return {
    release: () => release(),
    completeTeamPlan: async (input: CompleteTeamPlanInput) => {
      await held;
      return { ok: false as const, status: "rejected" as const, operationId: input.operationId, baseDigest: input.baseDigest ?? null, targetDigest: null,
        errorCode: "fixture-held", message: "fixture only" };
    },
  };
}

/** 挂起的 doc-write 后置钩子（versionedDocAfterWrite）：让真实 write_file 工具保持 active。 */
export function holdableVersionedDocWrite() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const afterWrite = async () => { await held; };
  return { afterWrite, release: () => release() };
}

/** 挂起的文档提交工具（submit_version_change）：保持真实 Core 回合的 active tool。 */
export function holdableSubmitVersionChange() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const submitVersionChange: SubmitVersionChangeFn = async input => {
    await held;
    return { ok: false as const, status: "rejected" as const, operationId: input.operationId, errorCode: "vca-channel-unavailable", message: "fixture only" };
  };
  return { submitVersionChange, release: () => release() };
}

export const gitCandidateScript = (operationId: string) => [{
  name: "git_candidate",
  args: { operationId, action: "commit", base: { ref: "refs/ans/trunk", oid: null }, message: "w3b wiring fixture", paths: ["docs/a.md"] },
}];

export function w3bEntryOf(sessionId: string) {
  return inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === sessionId);
}

export function publishW3bInventory(root: string, revision: number, rows: Array<{ hostHandleId: string; roleId: string; coreSessionId: string; taskId?: string; runId?: string }>) {
  return recordGitHostInventory({ source: "desktop-session-manager", projectRoot: root, observedAt: W3B_AT, revision,
    sessions: rows.map(row => ({ hostHandleId: row.hostHandleId, roleId: row.roleId, runtime: "demo", phase: "live" as const,
      coreSessionId: row.coreSessionId, ...(row.taskId !== undefined ? { taskId: row.taskId } : {}), ...(row.runId !== undefined ? { runId: row.runId } : {}), errors: [] })),
    pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] });
}

/**
 * init 真实夹具：真实 draft run + 真实 work source（parent = 真实 chief Core 会话）+ 真实 host inventory +
 * 真实 convener Core 会话（active git_candidate）。存储层准备与 `git-capabilities.test.ts` 的 init 夹具同源。
 */
export async function createInitFixture(input: { operationId: string; blockSidecarStore?: boolean; opened: RoleSession[] }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3b-wiring-")), canonical = await fs.realpath(root);
  const chief = await bindDemoSession(root, "chief", input.opened);
  const held = holdableGitCandidate();
  const convener = await bindDemoSession(root, "convener", input.opened, { gitCandidate: held.gitCandidate,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, gitCandidateScript(input.operationId)) } });
  const pumping = convener.prompt("Invoke git_candidate for the W3b wiring fixture"); pumping.catch(() => undefined);
  await until(() => w3bEntryOf(convener.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
  const store = createFsTrunkStore(root), runId = "run-w3b-init", taskId = "w3b-init-task";
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: W3B_AT })).ok);
  const sourceId = "init-source-" + w3bSha256(canonical);
  const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn",
    sourceId, projectRoot: canonical, flowId: "demo",
    parent: { roleId: "chief", sessionId: chief.sessionId, inputAccepted: true, settled: false } })).toString("base64"));
  if (!source.ok) throw new Error(`fixture init source: ${source.reason}`);
  const task: TaskCreatedEvent = { v: 1, at: W3B_AT, kind: "task.created", taskId, from: "chief", to: "convener",
    text: "Initialize the actual repository", sideEffect: "unknown", idempotencyKey: taskId, flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  const recordedTask = await recordTaskObservation({ projectRoot: root, event: task });
  assert.ok(recordedTask.ok, JSON.stringify(recordedTask));
  assert.ok(publishW3bInventory(root, 1, [
    { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
    { hostHandleId: "host-convener", roleId: "convener", coreSessionId: convener.sessionId, taskId, runId },
  ]).ok);
  if (input.blockSidecarStore) {
    // AC-16 失败注入：authorization.jsonl 位置被目录占位 ⇒ 写入 store 阻断（真实路径、真实 lease）。
    await fs.mkdir(w3bSidecarPath(root, input.operationId), { recursive: true });
  }
  const runtime = createGitRoleRuntime({ projectRoot: root, context: { actorRoleId: "convener", taskId, runId, readPaths: ["."] } });
  const request = { action: "init" as const, operationId: input.operationId, base: { ref: "refs/ans/trunk" as const, oid: null }, message: "Create the actual empty repository candidate" };
  return { root, canonical, store, runId, taskId, task, chief, convener, held, pumping, runtime, request };
}

/**
 * 业务发布真实夹具：真实 init（init.json candidate-created + 空候选 + `.ans/git-init-process.json`）→
 * 迁移后的 Git trunk v1 → 真实 chief/convener Core 会话 + 真实 work source/task + 真实 host inventory。
 */
export async function createPublicationFixture(input: { operationId: string; blockSidecarStore?: boolean; opened: RoleSession[]; withWriteFileSession?: boolean }) {
  const project = await createTrunkProject({ withRun: false }), root = project.root, canonical = await fs.realpath(root);
  // 会话先于受保护范围证据（.git / initialization-sources）建立。
  const chief = await bindDemoSession(root, "chief", input.opened);
  const held = holdableCompleteTeamPlan();
  const convener = await bindDemoSession(root, "convener", input.opened, { completeTeamPlan: held.completeTeamPlan,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "complete_team_plan",
      args: { operationId: input.operationId, flowId: "demo", baseDigest: "a".repeat(64), plan: { path: "docs/scheduling/demo-team-v2.md", sha256: "b".repeat(64), version: 2 } } }]) } });
  // initial workflow 复用：写入会话也必须在受保护范围证据建立前绑定（active write_file 由 versionedDocAfterWrite 挂起）。
  const workflowHeld = input.withWriteFileSession ? holdableVersionedDocWrite() : undefined;
  const workflowConvener = workflowHeld ? await bindDemoSession(root, "convener", input.opened, { versionedDocAfterWrite: workflowHeld.afterWrite, gate: allowStagedFileGate,
    // host-facts-v1 写路径要求 host 提供 complete coverage（真实 host 在受保护根上实测后发布）；这里用真实根/64-hex basis 的夹具事实。
    fileGateProtection: { projectRoot: root, protectedGitRoots: [path.join(root, ".git")], coverage: "complete", basisDigest: w3bSha256("w3b-file-gate:" + root), reasons: [] },
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: "docs/workflow.md", content: W3B_WORKFLOW_TEXT } }]) } }) : undefined;
  const pumping = convener.prompt("Invoke complete_team_plan for the W3b publication fixture"); pumping.catch(() => undefined);
  await until(() => w3bEntryOf(convener.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "complete_team_plan") === true);
  const fsStore = createFsTrunkStore(root), documents = project.snapshot().documents, runId = "run-w3b-publication";
  assert.ok((await fsStore.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: W3B_AT })).ok);
  const sourceId = "init-source-" + w3bSha256(canonical + ":publication");
  const source = await fsStore.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn",
    sourceId, projectRoot: canonical, flowId: "demo",
    parent: { roleId: "chief", sessionId: chief.sessionId, inputAccepted: true, settled: false } })).toString("base64"));
  if (!source.ok) throw new Error(`fixture publication source: ${source.reason}`);
  const initTaskId = "w3b-init-task";
  const initTask: TaskCreatedEvent = { v: 1, at: W3B_AT, kind: "task.created", taskId: initTaskId, from: "chief", to: "convener",
    text: "Initialize the actual repository", sideEffect: "unknown", idempotencyKey: initTaskId, flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: initTask })).ok);
  // 真实 init 服务效果：唯一 candidate-created init 记录 + 空候选 + `.ans/git-init-process.json`（floor 证据）。
  const initService = createGitCapabilityService({ projectRoot: root, context: { actorRoleId: "convener", taskId: initTaskId, runId, readPaths: ["."] } });
  const initPrepared = await initService.prepareInitialization({ action: "init", operationId: "w3b-fixture-init-operation",
    base: { ref: "refs/ans/trunk", oid: null }, message: "Create the actual empty repository candidate" });
  if (!initPrepared.ok) throw new Error(`fixture init preparation: ${initPrepared.result.message}`);
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!lease.ok) throw new Error(`fixture init lease: ${lease.code}`);
  try {
    const initialized = await initService.executeInitialization(initPrepared.value, lease.leaseId);
    assert.equal(initialized.status, "prepared", JSON.stringify(initialized));
  } finally { endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
  // 迁移既有 trunk 文档为 Git trunk v1（真实 manifest CAS + 迁移记录）。
  const snapshot = await fsStore.captureSnapshot!({ snapshotId: "w3b-publication-basis", createdAt: W3B_AT, files: Object.values(documents) });
  if (!snapshot.ok) throw new Error(`fixture publication snapshot: ${snapshot.reason}`);
  const initial: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", trunkVersion: 1, previous: null, runId: null, flowId: "demo",
    digest: w3bSha256("w3b-publication-basis"), snapshotRef: snapshot.value, createdAt: W3B_AT, updatedAt: W3B_AT,
    artifacts: { documents, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await fsStore.compareAndSwapManifest!(null, initial, snapshot.value)).ok);
  const migrated = await migrateLegacyTrunkToGit(root, { operationId: "w3b-fixture-migration", expected: { version: 1, digest: initial.digest } });
  assert.ok(migrated.ok, JSON.stringify(migrated));
  await fs.unlink(path.join(root, PATHS.roleCard)); await fs.unlink(path.join(root, PATHS.boundary)); await fs.unlink(path.join(root, PATHS.workflow));
  // 计划任务（真实 chief 输入源引用；保持 open）。
  const taskId = "w3b-plan-task";
  const planTask: TaskCreatedEvent = { v: 1, at: W3B_AT, kind: "task.created", taskId, from: "chief", to: "convener", text: "Prepare the real plan",
    sideEffect: "docs", idempotencyKey: taskId, flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: planTask })).ok);
  assert.ok(publishW3bInventory(root, 1, [
    { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
    { hostHandleId: "host-convener", roleId: "convener", coreSessionId: convener.sessionId, taskId, runId },
  ]).ok);
  const planPath = "docs/scheduling/demo-team-v2.md";
  const text = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: "demo", version: 2, modules: documents.modules, roster: documents.roster,
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# Real future plan\n`;
  await fs.writeFile(path.join(root, planPath), text);
  if (input.blockSidecarStore) {
    // AC-16 失败注入（业务发布）：既有 sidecar 行内容损坏 ⇒ append 在读取既有内容时 fail-closed
    // （`authorization-json-invalid`），动作不执行；文件本身仍是 I0-11 允许的安全普通文件，
    // 因此 journal/manifest 扫描不受影响（失败注入不依赖把操作目录变成损坏布局）。
    const file = w3bSidecarPath(root, input.operationId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not-json\n");
  }
  const request: CompleteTeamPlanInput = { operationId: input.operationId, flowId: "demo", runId, baseDigest: initial.digest, plan: { path: planPath, sha256: w3bSha256(text), version: 2 } };
  return { root, canonical, project, fsStore, initial, runId, initTaskId, taskId, chief, convener, held, pumping, request, workflowHeld, workflowConvener };
}
/**
 * 文档发布（直接提交）真实夹具：真实 init（首发布前无 trunk ref）+ intent 冻结 + 真实 product Core 会话
 * （active submit_version_change）+ 真实 work source/task + 真实 host inventory；宿主侧先准备
 * `prepareDirectSubmission`/`prepareDirectCommit`，运行时入口用同一 applyInput 重新准备并提交。
 */
export async function createDocumentFixture(input: { operationId: string; blockSidecarStore?: boolean; opened: RoleSession[] }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3b-document-")), canonical = await fs.realpath(root);
  const chief = await bindDemoSession(root, "chief", input.opened);
  const held = holdableSubmitVersionChange();
  const intentPath = "docs/product/demo-intent-v1.md", proposalPath = "docs/proposals/demo-proposal-v1.md";
  const intent = "# W3b document fixture intent\n", proposal = `---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: ${intentPath}\n---\nW3b document fixture\n`;
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  await fs.writeFile(path.join(root, intentPath), intent);
  await fs.writeFile(path.join(root, proposalPath), proposal);
  const product = await bindDemoSession(root, "product", input.opened, { submitVersionChange: held.submitVersionChange,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "submit_version_change",
      args: { operationId: input.operationId, kind: "version-upgrade", flowId: "demo", baseTrunk: null, summary: "fixture",
        targets: [{ kind: "contract", path: proposalPath, action: "add", expectedFromSha256: null }] } }]) } });
  const pumping = product.prompt("Invoke submit_version_change for the W3b document fixture"); pumping.catch(() => undefined);
  await until(() => w3bEntryOf(product.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "submit_version_change") === true);
  const store = createFsTrunkStore(root), runId = "run-w3b-document", initTaskId = "w3b-doc-init-task";
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: W3B_AT })).ok);
  const sourceId = "init-source-" + w3bSha256(canonical + ":document");
  const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn",
    sourceId, projectRoot: canonical, flowId: "demo",
    parent: { roleId: "chief", sessionId: chief.sessionId, inputAccepted: true, settled: false } })).toString("base64"));
  if (!source.ok) throw new Error(`fixture document source: ${source.reason}`);
  const initTask: TaskCreatedEvent = { v: 1, at: W3B_AT, kind: "task.created", taskId: initTaskId, from: "chief", to: "convener",
    text: "Initialize the actual repository", sideEffect: "unknown", idempotencyKey: initTaskId, flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: initTask })).ok);
  const initService = createGitCapabilityService({ projectRoot: root, context: { actorRoleId: "convener", taskId: initTaskId, runId, readPaths: ["."] } });
  const initPrepared = await initService.prepareInitialization({ action: "init", operationId: "w3b-doc-fixture-init",
    base: { ref: "refs/ans/trunk", oid: null }, message: "Create the actual empty repository candidate" });
  if (!initPrepared.ok) throw new Error(`fixture document init preparation: ${initPrepared.result.message}`);
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!lease.ok) throw new Error(`fixture document init lease: ${lease.code}`);
  try {
    const initialized = await initService.executeInitialization(initPrepared.value, lease.leaseId);
    assert.equal(initialized.status, "prepared", JSON.stringify(initialized));
  } finally { endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
  // 首发布前冻结 intent（真实 customer 证据）并迁移既有版本记录基线。
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const frozen = await integration.services.freeze.freeze({ path: intentPath, version: 1, sha256: w3bSha256(intent), reason: "intent-confirmed",
    applicationId: "w3b-doc-intent", decisionId: "w3b-doc-customer-decision", at: W3B_AT });
  assert.ok(frozen.ok, JSON.stringify(frozen));
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok);
  const taskId = "w3b-doc-task";
  // 文档发布任务的独立 work source（purpose=document-preparation 绑定真实 product/run；首发布 documentBasis=null）。
  const publicationSourceId = "init-source-" + w3bSha256(canonical + ":document-publication");
  const publicationSource = await store.writeInitializationSource!(publicationSourceId, Buffer.from(JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn",
    sourceId: publicationSourceId, projectRoot: canonical, flowId: "demo",
    parent: { roleId: "chief", sessionId: chief.sessionId, inputAccepted: true, settled: false },
    purpose: "document-preparation", targetRoleId: "product", planningRunId: runId, documentBasis: null,
    initializationOperationId: "w3b-doc-fixture-init" })).toString("base64"));
  if (!publicationSource.ok) throw new Error(`fixture document publication source: ${publicationSource.reason}`);
  const publicationTask: TaskCreatedEvent = { v: 1, at: W3B_AT, kind: "task.created", taskId, from: "chief", to: "product",
    text: "Publish the actual first planning document", sideEffect: "docs", idempotencyKey: taskId, flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId: publicationSourceId, path: publicationSource.value.path, sha256: publicationSource.value.sha256 } };
  const recordedPublicationTask = await recordTaskObservation({ projectRoot: root, event: publicationTask });
  assert.ok(recordedPublicationTask.ok, JSON.stringify(recordedPublicationTask));
  assert.ok(publishW3bInventory(root, 1, [
    { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
    { hostHandleId: "host-product", roleId: "product", coreSessionId: product.sessionId, taskId, runId },
  ]).ok);
  const documents = createTrunkService({ projectRoot: root });
  const draft = await documents.prepareDirectSubmission({ operationId: input.operationId, kind: "version-upgrade", initiatorRoleId: "product",
    flowId: "demo", baseTrunk: null, summary: "W3b first document publication",
    targets: [{ kind: "contract", path: proposalPath, action: "add", expectedFromSha256: null }] }, "product");
  if (!draft.ok) throw new Error(`fixture document submission: ${draft.code}`);
  const prepared = await documents.prepareDirectCommit!(draft.value.applyInput);
  if (!prepared.ok) throw new Error(`fixture document preparation: ${prepared.code}`);
  if (input.blockSidecarStore) {
    const file = w3bSidecarPath(root, input.operationId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not-json\n");
  }
  return { root, canonical, store, runId, initTaskId, taskId, chief, product, held, pumping, documents, applyInput: draft.value.applyInput };
}

/**
 * initial workflow 发布真实夹具：在计划发布（trunk v2）之后走真实 stable-write 流
 * （request → approve → bind source（真实 arm lease）→ 真实 write_file 落盘（versionedDocAfterWrite 挂起保持
 * active tool）→ completeWrite），再交给运行时入口 `executeGitInitialWorkflowPublication` 重新准备并提交。
 */
export async function createInitialWorkflowFixture(input: { planOperationId: string; blockSidecarStore?: boolean; opened: RoleSession[] }) {
  const plan = await createPublicationFixture({ operationId: input.planOperationId, opened: input.opened, withWriteFileSession: true });
  const planReceipt = await executeGitTeamPlanPublication({ projectRoot: plan.root, request: plan.request, actorRoleId: "convener" });
  if (!planReceipt.ok || planReceipt.status !== "applied") throw new Error(`fixture initial workflow plan publication: ${JSON.stringify(planReceipt)}`);
  plan.held.release();
  await plan.pumping;
  const root = plan.root, canonical = plan.canonical, taskId = plan.taskId, runId = plan.runId;
  const service = createTrunkService({ projectRoot: root });
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const workflowText = W3B_WORKFLOW_TEXT, decisionId = "w3b-iw-customer-decision", workflowAt = new Date().toISOString();
  const requested = await integration.services.stableWrite.request({ roleId: "convener", kind: "workflow", content: workflowText, at: workflowAt });
  if (!requested.ok) throw new Error(`fixture workflow request: ${JSON.stringify(requested)}`);
  const approved = await integration.services.stableWrite.approve(requested.value.requestId, { decisionId, at: workflowAt });
  if (!approved.ok) throw new Error(`fixture workflow approval: ${JSON.stringify(approved)}`);
  const held = plan.workflowHeld, convener = plan.workflowConvener;
  if (!held || !convener) throw new Error("fixture workflow write session is unavailable");
  const pumping = convener.prompt("Write the approved initial workflow document");
  pumping.catch(() => undefined);
  try {
    let written = "";
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      written = await fs.readFile(path.join(root, "docs/workflow.md"), "utf8").catch(() => "");
      if (written === workflowText && w3bEntryOf(convener.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "write_file") === true) break;
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    }
    if (written !== workflowText) throw new Error("fixture workflow write did not reach disk");
    const sourceLease = beginGitHostAction({ projectRoot: root, kind: "arm" });
    if (!sourceLease.ok) throw new Error(`fixture workflow source lease: ${sourceLease.code}`);
    let bound;
    try {
      bound = await service.bindInitialWorkflowSource!({ requestId: requested.value.requestId, taskId, coreSessionId: convener.sessionId,
        coreTurnId: w3bEntryOf(convener.sessionId)?.lifecycle?.turnId, hostLeaseId: sourceLease.leaseId });
    } finally { endGitHostAction({ projectRoot: root, leaseId: sourceLease.leaseId }); }
    if (!bound.ok) throw new Error(`fixture workflow source binding: ${JSON.stringify(bound)}`);
    const completed = await integration.services.stableWrite.completeWrite({ requestId: requested.value.requestId, actualSha256: w3bSha256(workflowText), at: workflowAt });
    if (!completed.ok) throw new Error(`fixture workflow complete write: ${JSON.stringify(completed)}`);
    assert.ok(publishW3bInventory(root, 2, [
      { hostHandleId: "host-chief", roleId: "chief", coreSessionId: plan.chief.sessionId },
      { hostHandleId: "host-convener-workflow", roleId: "convener", coreSessionId: convener.sessionId, taskId, runId },
    ]).ok);
    const workflowOperationId = bound.value.operationId;
    if (input.blockSidecarStore) {
      const file = w3bSidecarPath(root, workflowOperationId);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "not-json\n");
    }
    const request = { kind: "workflow" as const, roleId: "convener", path: "docs/workflow.md", oldSha: "", newSha: w3bSha256(workflowText), decisionId, at: workflowAt };
    return { root, canonical, taskId, runId, chief: plan.chief, convener, held, pumping, request, workflowOperationId, workflowText };
  } catch (error) {
    held.release();
    await pumping.catch(() => undefined);
    throw error;
  }
}
