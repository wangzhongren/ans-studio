// test/测试/git-write-chain-fixture.ts
// W7（2026-11-08「删除全部预知式门控」B2 补证）：确定性完整效果链夹具。
//
// 目的：在**真实 service/assemble/Git 能力路径**上（真实 trunk store/锁/lease/journal、
// 真实 init/文档发布/计划发布/激活/initial workflow/冻结 pin），为
//   AC-1/AC-2（Claude/Pi product 角色 git_candidate commit）、
//   AC-4（Claude convener git_publish delivery）、
//   AC-8 / P1.2-AC-25（deferred run-stop 宿主继续 finalize）、
//   P1.2-AC-31（activation 发布，runtime `executeGitActiveRolePublication`）
// 提供同一套真实链。桩件 provider 只替代模型回合（演示 adapter 执行真实工具回合），
// 不伪造 ref/journal/sidecar：所有断言读取临时项目根内真实产生的文件/引用。
//
// 归属：test/测试/（测试角色 Section 1）；测试辅助代码，不得被产品代码引用。
// 约束：Core 注册表/H12/H14 是进程级的 ⇒ 每个测试 *文件* 只能有一个项目根；会话保持 active
// 到测试收尾（custom provider 会话按 I0-3 无法以 drained 收口，dispose 后按真实 facts 收口）。
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CustomerInputOutcome, GovernanceJudgeAudit, RoleSession, RuntimeKind, RuntimeProviderOptions, TaskCreatedEvent, WriteGate } from "../../src/model/runtime.ts";
import type { CompleteTeamPlanInput, TaskStateEvent } from "../../src/model/runtime.ts";
import { inspectRuntimeFileGateContext, type RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createGitCapabilityService, createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createGuardFreezeRegistry } from "../../src/provider/version-change/public/version-change-store.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeStack } from "../../app/desktop/version-change.ts";
import { validateRoleDocumentsSnapshot, validateBoundaryYamlText } from "../../src/service/boundary/resolve-boundary.ts";
import { checkGitPolicy } from "../../src/service/gate/shell-rules.ts";
import { beginGitHostAction, endGitHostAction, createFsTrunkStore, createProjectTrunkStore, readGitPlanCompletionBasis } from "../../src/provider/trunk/public/trunk-store.ts";
import { readConfirmedIntentEvidence, readOperationEvents } from "../../src/provider/version-change/public/version-change-store.ts";
import { createDirectRoleRuntime, executeGitActiveRolePublication, freezeExecutionRun, recordGitHostInventory, recordTaskObservation } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { PATHS } from "../编排/fixtures/trunk-project.ts";
import { AT, sha256, bindSession, entryOf, until } from "./git-action-cross-runtime-fixture.ts";

export const FLOW_ID = "demo";
const placeholderSnapshot = { snapshotId: "s-w7-placeholder", path: "docs/scheduling/demo-team-v2.md", sha256: "a".repeat(64), version: 2 };
const placeholderRoster = { snapshotId: "s-w7-placeholder", path: "docs/proposals/demo-roster-v1.md", sha256: "b".repeat(64), version: 1 };
const placeholderDocs = { card: { path: "角色卡/impl/role-card.md", sha256: "c".repeat(64) },
  boundaryMd: { path: "角色卡/impl/boundary.md", sha256: "d".repeat(64) }, boundaryYaml: { path: "角色卡/impl/boundary.yaml", sha256: "e".repeat(64) } };
export const CHAIN_WORKFLOW_TEXT = "# W7 chain workflow\nUse src/impl/ for the assigned module; report before closure; delivery requires independent quality.\n";
// 交付 quality 的机械文本核对要求标准正文（`readTextQualityProof` 只覆盖这一种已批准文本产物）。
export const CHAIN_PROPOSAL_TEXT = `---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\n---\nProduce src/impl/result.txt, preserve evidence and use creator closure.\n`;

const CHAIN_ROLE_CARD = "# Implementation\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接", "执行原则", "质量职责", "标准工作流", "交付物清单"]
  .map(section => `## ${section}\nMaintain the assigned module.\n`).join("");
const CHAIN_BOUNDARY_MD = "# Boundary\n## Section 1: 可修改文件与目录\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录（私有） | `src/impl/` | implementation |\n";
const CHAIN_BOUNDARY_YAML = "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: implementation\n";

const CHAIN_INTENT_TEXT = "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\n# W7 chain intent\nDeliver one bounded nonempty text artifact with evidence and creator closure.\n";
const CHAIN_MODULES_TEXT = [
  "---", "schema: project-modules/v2", "flowId: demo", "version: 1", "modules:", "  - id: impl-core", "    name: Implementation",
  "    purpose: implementation module", "    path: src/", "    category: core", "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/demo-architecture-v1.md", "---", "# W7 modules",
].join("\n");
const CHAIN_ROSTER_TEXT = [
  "---", "schema: project-roster/v3", "flowId: demo", "version: 1", "intent: docs/product/demo-intent-v1.md",
  "proposal: docs/proposals/demo-proposal-v1.md", "architecture: docs/contracts/demo-architecture-v1.md",
  "envBootstrap:", "  omitted: true", "  omissionReason: W7 fixture", "roles:", "  - id: impl", "    displayName: Implementation",
  "    purpose: implementation", "    capability: TS", "    modules:", "      - impl-core", "modules:", "  - id: impl-core",
  "    name: Implementation", "    purpose: implementation module", "    path: src/", "    category: core",
  "    publicContract: src/index.ts", "    architectureSource: docs/contracts/demo-architecture-v1.md", "---", "# W7 roster",
  "## 人员+模块拓扑图", "```topology", "schema: project-topology/v2", "management: [convener, impl]", "modules:",
  "  - id: impl-core", "    path: src/", "    roleId: impl", "roles:", "  - id: impl", "    modules: [impl-core]", "```",
].join("\n");

/** 全新临时项目根：只写本链真实需要的版本化文档/角色文档（无迁移冻结历史，避免旧哈希污染基线）。 */
async function createChainProjectFiles(root: string) {
  const write = async (rel: string, content: string) => {
    await fsp.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fsp.writeFile(path.join(root, rel), content, "utf8");
  };
  await write("docs/product/demo-intent-v1.md", CHAIN_INTENT_TEXT);
  await write(PATHS.proposal, CHAIN_PROPOSAL_TEXT);
  await write(PATHS.modules, CHAIN_MODULES_TEXT);
  await write(PATHS.roster, CHAIN_ROSTER_TEXT);
  await write(PATHS.topology, "---\nschema: project-topology/v2\n---\n# W7 topology\n");
  await write(PATHS.architecture, "---\nschema: project-architecture/v1\n---\n# W7 architecture\n\nproposal: docs/proposals/demo-proposal-v1.md\n");
  await write(PATHS.assets, "---\nschema: project-assets/v1\n---\n# W7 assets\n");
  await write(PATHS.roleCard, CHAIN_ROLE_CARD);
  await write("角色卡/impl/boundary.md", CHAIN_BOUNDARY_MD);
  await write(PATHS.boundary, CHAIN_BOUNDARY_YAML);
}

/** host-facts-v1 分阶段门：真实校验 issued context 后放行（与 W3b 夹具同源的测试替身，非授权放宽）。 */
export const allowStagedFileGate: WriteGate = (target, context) => {
  const facts = context?.operation !== undefined && context.stage !== undefined
    ? inspectRuntimeFileGateContext(context, target, context.operation, context.stage) : undefined;
  return facts
    ? { allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } }
    : { allowed: false, reason: "fixture staged gate context missing", allowedByRoot: { project: [], skill: [] } };
};

/** 可重复装填的写后置钩子（versionedDocAfterWrite）：让真实 write_file 工具保持 active。 */
/** 可重复装填的 activate_role_documents 挂起（nominator 真实回合）。 */
export function holdableActivateRoleDocuments() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const activateRoleDocuments = async (input: { operationId: string }) => {
    await held;
    return { ok: false as const, status: "rejected" as const, operationId: input.operationId, baseDigest: null, targetDigest: null,
      errorCode: "fixture-held", message: "fixture only" };
  };
  return { activateRoleDocuments, release: () => release() };
}

export function holdableVersionedDocWrite() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const afterWrite = async () => { await held; };
  return { afterWrite, release: () => release() };
}

/** 可重复装填的 git_publish 挂起（convener delivery）。 */
export function holdableGitPublish() {
  let release!: () => void;
  let held = new Promise<void>(resolve => { release = resolve; });
  const gitPublish = async (input: { operationId: string }) => {
    await held;
    return { operationId: input.operationId, repoId: "fixture", status: "blocked", code: "fixture-held", message: "fixture only" };
  };
  return { gitPublish, release: () => release(), rearm: () => { held = new Promise<void>(resolve => { release = resolve; }); } };
}

/** 可重复装填的 select_run_change 挂起（rapporteur run-change 请求回合）。 */
export function holdableSelectRunChange() {
  let release!: () => void;
  let held = new Promise<void>(resolve => { release = resolve; });
  const selectRunChange = async (input: { operationId: string; runId: string; expectedPinDigest: string; targetTrunk: { version: number; digest: string }; mode: string; reason: string }) => {
    await held;
    return { ok: false as const, status: "rejected" as const, operationId: input.operationId, runId: input.runId, baseDigest: input.expectedPinDigest, targetDigest: null, errorCode: "fixture-held", message: "fixture only" };
  };
  return { selectRunChange, release: () => release(), rearm: () => { held = new Promise<void>(resolve => { release = resolve; }); } };
}

export type BoundSession = RoleSession & { sessionId: string };
const chainDisposers: Array<{ dispose(): Promise<void> }> = [];
/** 收口所有经真实 `openRoleSession` 打开的 managed 会话（测试 after 钩子调用）。 */
export async function disposeChainSessions(): Promise<void> {
  for (const session of chainDisposers) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
}
/** openRoleSession 句柄的真实子集（send/inspectLifecycle/dispose + sessionId）。 */
export type ManagedSession = { sessionId: string; roleId?: string; runtime?: RuntimeKind;
  send(text: string, opts?: Record<string, unknown>): Promise<void>;
  inspectLifecycle?: RoleSession["inspectLifecycle"]; stopAndInspect?: RoleSession["stopAndInspect"]; dispose(): Promise<void> };
export type ChainSession = BoundSession | ManagedSession;
export interface ChainSessionSpec {
  key: string; runtime: RuntimeKind; roleId: string; options?: Partial<RuntimeSessionOptions>;
  /** true ⇒ 经真实 `openRoleSession`（managed Core 句柄；集成/交付/run-change 的 built-in 证据要求）。 */
  managed?: boolean;
  /** managed 会话的能力注入（gitCandidate/gitPublish/selectRunChange/…）。 */
  capabilities?: Record<string, unknown>;
}
export type ChainSessions = Record<string, ChainSession>;
/** 启动一轮真实输入（managed 句柄用 `send`，adapter 句柄用 `prompt`）；返回未 await 的回合 promise。 */
export function startTurn(session: ChainSession, text: string): Promise<void> {
  if ("send" in session && typeof (session as ManagedSession).send === "function") return (session as ManagedSession).send(text);
  return (session as BoundSession).prompt(text);
}

export interface WriteChain {
  root: string; canonical: string;
  sessions: ChainSessions;
  service: ReturnType<typeof createTrunkService>;
  integration: ReturnType<typeof createVersionChangeIntegration>;
  fsStore: ReturnType<typeof createFsTrunkStore>;
  docsRunId: string; execRunId: string;
  initTaskId: string; docTaskId: string; planTaskId: string; nominationTaskId: string; workflowTaskId: string;
  initOperationId: string;
  planPath: string; planText: string;
  manifestV1Digest: string;
  planReceipt: Record<string, unknown>;
  activationInput: Record<string, unknown>;
  activationReceipt: Record<string, unknown>;
  activationSessionId?: string;
  /** W-J2b：activationMode:"wrapper" 时 Runtime 包装层经真实 recordDirectDelivery 记账的收件人。 */
  activationNotifications?: Array<{ key: string; recipientRoleId: string }>;
  workflowOperationId: string;
  workflowHeld: ReturnType<typeof holdableVersionedDocWrite>;
  pin: { runId: string; pinDigest: string; run: Record<string, unknown> };
  manifest: Record<string, unknown>;
  workflowAt: string;
  /** W-J5：真实 intent-confirm 请求/裁决标识与（judge 模式下的）账本 judge 审计。 */
  intentRequestId: string; intentDecisionId: string; d3RequestId: string; d3DecisionId: string;
  intentJudgeAudit?: GovernanceJudgeAudit; d3JudgeAudit?: GovernanceJudgeAudit;
}

/** 以固定来源写一条真实 `repository-work-source/v1`（parent = 真实 chief Core 会话）。 */
async function writeWorkSource(input: {
  root: string; store: ReturnType<typeof createFsTrunkStore>; sourceId: string; chiefSessionId: string;
  extra?: Record<string, unknown>;
}) {
  const payload = { schema: "repository-work-source/v1", kind: "customer-turn", sourceId: input.sourceId, projectRoot: input.root, flowId: FLOW_ID,
    parent: { roleId: "chief", sessionId: input.chiefSessionId, inputAccepted: true, settled: false }, ...(input.extra ?? {}) };
  const written = await input.store.writeInitializationSource!(input.sourceId, Buffer.from(JSON.stringify(payload)).toString("base64"));
  assert.ok(written.ok, JSON.stringify(written));
  return written.value;
}

function chainTask(input: {
  taskId: string; from: string; to: string; runId: string; runState: "draft" | "pinned"; sideEffect: string; text: string;
  source: { path: string; sha256: string; sourceId?: string }; moduleId?: string; moduleDirectory?: string; modulePaths?: readonly string[];
  parentTaskRef?: Record<string, unknown>; hubRouting?: "chief-hub-v1";
}): TaskCreatedEvent {
  return { v: 1, at: AT, kind: "task.created", taskId: input.taskId, from: input.from as never, to: input.to as never,
    text: input.text, sideEffect: input.sideEffect as never, idempotencyKey: input.taskId, flowId: FLOW_ID, runId: input.runId, runState: input.runState,
    ...(input.hubRouting !== undefined ? { hubRouting: input.hubRouting } : {}),
    ...(input.moduleId !== undefined ? { moduleId: input.moduleId } : {}),
    ...(input.moduleDirectory !== undefined ? { moduleDirectory: input.moduleDirectory } : {}),
    ...(input.modulePaths !== undefined ? { modulePaths: [...input.modulePaths] } : {}),
    ...(input.parentTaskRef !== undefined ? { parentTaskRef: input.parentTaskRef as never } : {}),
    ...(input.source.sourceId ? { workSourceRef: { kind: "chief-customer-turn" as const, sourceId: input.source.sourceId, path: input.source.path, sha256: input.source.sha256 } } : {}) };
}

/**
 * 构建从零到「已冻结执行 run」的真实链：
 * 真实 init → 真实 intent 确认 → 真实首发布（trunk v1）→ 真实计划发布（v2）→ 激活（service 或
 * runtime `executeGitActiveRolePublication`）→ 真实 initial workflow 发布 → `freezeExecutionRun`（pin）。
 * `extras` 中的会话必须在受保护证据（init/.git）建立前绑定（H12/H14 文件守卫与真实 Core 回合）。
 */
export async function buildWriteChain(input: {
  prefix: string;
  extras?: ChainSessionSpec[];
  /** "wrapper"：W-J2b amendment——经 `createDirectRoleRuntime.activateRoleDocuments` 完成激活（judge D3 跨层正例）。 */
  activationMode?: "service" | "runtime" | "wrapper";
  /** W-J5：intent-confirm 结算来源（缺省 customer，既有行为逐字不变）。 */
  intentBy?: "customer" | "judge";
  /** W-J5：D3 appointment 结算来源（缺省 customer，既有行为逐字不变）。 */
  d3By?: "customer" | "judge";
  /** W-J5：judge 审计字段覆盖（G1 超长原值/引擎变体）。 */
  judgeAudit?: { engine?: RuntimeKind; model?: string; reason?: string; reasonCode?: string; selected?: string[] };
}): Promise<WriteChain> {
  const rawRoot = await fsp.mkdtemp(path.join(os.tmpdir(), input.prefix));
  const root = await fsp.realpath(rawRoot);
  // 提案正文为可机械核对的批准标准；角色三文档为激活/运行证据；workflow 目标必须不存在（stable-write baseSha=""）。
  await createChainProjectFiles(root);

  // 1) 会话先于受保护范围证据（.git / initialization-sources）建立（真实 Core 回合；桩件 provider）。
  const sessions: ChainSessions = {};
  const project: ProjectConfig = { projectRoot: root, skillRoot: path.join(root, "skill-root"), governanceModel: "trio",
    roles: { impl: { card: PATHS.roleCard, boundary: PATHS.boundary } },
    builtInRoles: ["chief", "product", "rapporteur", "convener", "nominator", "verifier"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:w7-fixture" } } };
  const chainHandles: Array<{ dispose(): Promise<void> }> = [];
  const openManaged = async (spec: ChainSessionSpec, runtimeOptions: Partial<RuntimeSessionOptions> = {}) => {
    const handle = await openRoleSession({ roleId: spec.roleId, runtime: spec.runtime, project, autoRepin: false, ...(spec.capabilities ?? {}) } as never,
      { runtimeOptions: { ...runtimeOptions } } as never) as unknown as ManagedSession;
    chainHandles.push(handle);
    return handle;
  };
  const chief = await bindSession(root, "demo", "chief");
  sessions.chief = chief as BoundSession;
  const workflowHeld = holdableVersionedDocWrite();
  const workflowConvener = await bindSession(root, "demo", "convener", {
    versionedDocAfterWrite: workflowHeld.afterWrite, gate: allowStagedFileGate,
    fileGateProtection: { projectRoot: root, protectedGitRoots: [path.join(root, ".git")], coverage: "complete", basisDigest: sha256("w7-file-gate:" + root), reasons: [] },
    providerFactories: { demo: (options: RuntimeProviderOptions) => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: PATHS.workflow, content: CHAIN_WORKFLOW_TEXT } }]) },
  });
  sessions.workflowConvener = workflowConvener as BoundSession;
  const runtimeActivation = input.activationMode === "runtime" || input.activationMode === "wrapper";
  const activationNotifications: Array<{ key: string; recipientRoleId: string }> = [];
  const activationHold = runtimeActivation ? holdableActivateRoleDocuments() : undefined;
  const runtimeNominator = runtimeActivation ? await bindSession(root, "claude", "nominator", {
    activateRoleDocuments: activationHold!.activateRoleDocuments,
    providerFactories: { claude: (options: RuntimeProviderOptions) => createDemoRuntimeAdapter(options, [{ name: "activate_role_documents",
      args: { operationId: "w7-activation", flowId: FLOW_ID, planRef: placeholderSnapshot, d3DecisionId: "w7-d3-decision", rosterRef: placeholderRoster,
        targetRoleId: "impl", documents: placeholderDocs } }]) },
  }) as BoundSession : undefined;
  if (runtimeNominator) sessions.nominator = runtimeNominator;
  for (const spec of input.extras ?? []) sessions[spec.key] = spec.managed
    ? await openManaged(spec, spec.options ?? {})
    : await bindSession(root, spec.runtime, spec.roleId, spec.options ?? {}) as BoundSession;
  chainDisposers.push(...chainHandles);

  const fsStore = createFsTrunkStore(root);
  const docsRunId = "run-w7-docs", planRunId = "run-w7-plan", roleRunId = "run-w7-roles", workflowRunId = "run-w7-workflow", execRunId = "run-w7-exec";
  const initSourceId = "init-source-" + sha256(root + ":init");
  const docSourceId = "init-source-" + sha256(root + ":docs");
  const planSourceId = "init-source-" + sha256(root + ":plan");
  const nominationSourceId = "init-source-" + sha256(root + ":nomination");
  const workflowSourceId = "init-source-" + sha256(root + ":workflow-task");
  const freshRun = (runId: string, extra: Record<string, unknown> = {}) => ({ schema: "ans-run/v1" as const, runId, flowId: FLOW_ID, state: "draft" as const,
    documents: {}, execution: { teamPlan: null, flow: null }, createdAt: AT, ...extra });
  // planning 源的生产绑定（`prepareRoleDispatch` 建立的 `run.documentPreparationSource`）按同一语义置位；
  // 所有 planning 任务各有真实 draft run（与生产派发一致，互不共享执行 run）。
  assert.ok((await fsStore.compareAndSwapRunRecord!(docsRunId, null, freshRun(docsRunId, { documentPreparationSource: docSourceId }) as never)).ok);
  assert.ok((await fsStore.compareAndSwapRunRecord!(planRunId, null, freshRun(planRunId, { documentPreparationSource: planSourceId }) as never)).ok);
  assert.ok((await fsStore.compareAndSwapRunRecord!(roleRunId, null, freshRun(roleRunId, { documentPreparationSource: nominationSourceId }) as never)).ok);
  assert.ok((await fsStore.compareAndSwapRunRecord!(workflowRunId, null, freshRun(workflowRunId) as never)).ok);
  assert.ok((await fsStore.compareAndSwapRunRecord!(execRunId, null, freshRun(execRunId) as never)).ok);

  // 2) 真实 init（真实 init.json candidate-created + .git；write-ahead 之后才有仓库效果）。
  const initTaskId = "w7-init-task", initOperationId = "w7-init-operation";
  const initSource = await writeWorkSource({ root, store: fsStore, sourceId: initSourceId, chiefSessionId: chief.sessionId });
  assert.ok((await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: initTaskId, from: "chief", to: "convener", runId: docsRunId,
    runState: "draft", sideEffect: "unknown", text: "Initialize the actual repository (W7 chain)",
    source: { sourceId: initSourceId, path: initSource.path, sha256: initSource.sha256 } }) })).ok);
  const initService = createGitCapabilityService({ projectRoot: root, context: { actorRoleId: "convener", taskId: initTaskId, runId: docsRunId, readPaths: ["."] } });
  const initPrepared = await initService.prepareInitialization({ action: "init", operationId: initOperationId, base: { ref: "refs/ans/trunk", oid: null }, message: "W7 chain initialization" });
  if (!initPrepared.ok) assert.fail(JSON.stringify(initPrepared));
  const initLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!initLease.ok) assert.fail(JSON.stringify(initLease));
  try {
    const initialized = await initService.executeInitialization(initPrepared.value, initLease.leaseId);
    assert.equal(initialized.status, "prepared", JSON.stringify(initialized));
  } finally { endGitHostAction({ projectRoot: root, leaseId: initLease.leaseId }); }

  // 3) 真实 intent 确认（retained-card marker + request.created/resolved + R9 基线冻结）。
  const service = createTrunkService({ projectRoot: root, freezeRegistry: createGuardFreezeRegistry(root, { migrationCompleted: () => true }) });
  const intentPrepared = await service.prepareIntentConfirmation(FLOW_ID);
  if (!intentPrepared.ok) assert.fail(JSON.stringify(intentPrepared));
  const intentRequestId = "w7-intent-request";
  // W-J5：judge 模式按应用真实回执形状（by/operatorId/judge/decisionId=decision-<requestId>）落账，
  // 并以与账本 judge 审计逐字段一致的 outcome 结算；缺省 customer 分支逐字不变。
  const intentJudged = input.intentBy === "judge";
  const intentDecisionId = intentJudged ? `decision-${intentRequestId}` : "w7-intent-decision";
  const judgeEngine = input.judgeAudit?.engine ?? "claude" as RuntimeKind;
  const intentJudgeAudit: GovernanceJudgeAudit | undefined = intentJudged ? {
    group: "decision", cardKind: "intent-confirm", engine: judgeEngine,
    ...(input.judgeAudit?.model !== undefined ? { model: input.judgeAudit.model } : {}),
    reasonCode: input.judgeAudit?.reasonCode ?? "sufficient",
    ...(input.judgeAudit?.reason !== undefined ? { reason: input.judgeAudit.reason } : {}),
    selected: [...(input.judgeAudit?.selected ?? ["confirm"])],
  } : undefined;
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at: AT, kind: "request.created", requestId: intentRequestId, flowId: FLOW_ID,
    sourceRoleId: "chief", cardKind: "intent-confirm", title: "Confirm the exact W7 chain intent", context: intentPrepared.value.marker,
    options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] } })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: intentJudgeAudit ? { v: 1, at: AT, kind: "request.resolved", requestId: intentRequestId,
    cardKind: "intent-confirm", by: "judge", decisionId: intentDecisionId, selectedOptionIds: [...intentJudgeAudit.selected!], choice: "confirm",
    operatorId: `judge:${judgeEngine}`, judge: intentJudgeAudit } : { v: 1, at: AT, kind: "request.resolved", requestId: intentRequestId, cardKind: "intent-confirm",
    by: "customer", decisionId: intentDecisionId, selectedOptionIds: ["confirm"], choice: "confirm" } })).ok);
  const intentOutcome: CustomerInputOutcome = intentJudgeAudit
    ? { outcome: "answered", value: { selected: [...intentJudgeAudit.selected!] }, decisionId: intentDecisionId, operatorId: `judge:${judgeEngine}`, judge: intentJudgeAudit }
    : { outcome: "answered", value: { selected: ["confirm"] }, decisionId: intentDecisionId };
  const intentFinalized = await service.finalizeIntentConfirmation(intentPrepared.value, intentOutcome);
  assert.ok(intentFinalized.ok, JSON.stringify(intentFinalized));
  const confirmedIntent = await readConfirmedIntentEvidence(root, "docs/product/demo-intent-v1.md");
  if (!confirmedIntent.ok) assert.fail(JSON.stringify(confirmedIntent));
  const intentConfirmation = { path: confirmedIntent.value.path, version: confirmedIntent.value.version, sha256: confirmedIntent.value.sha256,
    confirmationDigest: confirmedIntent.value.confirmationDigest };

  // 4) 真实首发布 trunk v1（product direct submission；intent-confirmed 为必需要素）。
  const docTaskId = "w7-doc-task";
  const docSource = await writeWorkSource({ root, store: fsStore, sourceId: docSourceId, chiefSessionId: chief.sessionId,
    extra: { purpose: "document-preparation", targetRoleId: "product", planningRunId: docsRunId, documentBasis: null, initializationOperationId: initOperationId } });
  assert.ok((await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: docTaskId, from: "chief", to: "product", runId: docsRunId,
    runState: "draft", sideEffect: "docs", text: "Publish the actual first planning basis (W7 chain)",
    source: { sourceId: docSourceId, path: docSource.path, sha256: docSource.sha256 } }) })).ok);
  const submission = await service.prepareDirectSubmission({ operationId: "w7-first-publication", kind: "version-upgrade", initiatorRoleId: "product",
    flowId: FLOW_ID, baseTrunk: null, summary: "W7 chain first planning basis", targets: [
      { kind: "contract", path: PATHS.proposal, action: "add", expectedFromSha256: null },
      { kind: "contract", path: PATHS.modules, action: "add", expectedFromSha256: null },
      { kind: "roster", path: PATHS.roster, action: "add", expectedFromSha256: null },
      { kind: "contract", path: PATHS.topology, action: "add", expectedFromSha256: null },
      { kind: "contract", path: PATHS.architecture, action: "add", expectedFromSha256: null },
      { kind: "contract", path: PATHS.assets, action: "add", expectedFromSha256: null },
    ] }, "product");
  if (!submission.ok) assert.fail(JSON.stringify(submission));
  const directPrepared = await service.prepareDirectCommit!(submission.value.applyInput);
  if (!directPrepared.ok) assert.fail(JSON.stringify(directPrepared));
  if (!("preparationKind" in directPrepared.value)) assert.fail("w7 fixture direct preparation missing preparationKind");
  const directAuthority = await service.prepareDirectAuthority!(directPrepared.value, docTaskId);
  if (!directAuthority.ok) assert.fail(JSON.stringify(directAuthority));
  const directCandidate = checkGitPolicy(directAuthority.value.candidatePolicyInput), directPublication = checkGitPolicy(directAuthority.value.publicationPolicyInput);
  assert.equal(directCandidate.allowed, true, JSON.stringify(directCandidate));
  assert.equal(directPublication.allowed, true, JSON.stringify(directPublication));
  const directLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!directLease.ok) assert.fail(JSON.stringify(directLease));
  try {
    const applied = await service.commitPreparedDirect!(directPrepared.value, { hostLeaseId: directLease.leaseId, taskId: docTaskId,
      candidateVerdict: directCandidate, publicationVerdict: directPublication });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
  } finally { endGitHostAction({ projectRoot: root, leaseId: directLease.leaseId }); }
  const manifestV1 = await createProjectTrunkStore(root).readManifest();
  if (!manifestV1.ok) assert.fail("w7 fixture trunk v1 missing: " + JSON.stringify(manifestV1));
  assert.equal(manifestV1.value.trunkVersion, 1);

  // 5) 真实计划发布 trunk v2（convener；真实 plan-completion marker）。
  const planTaskId = "w7-plan-task", planOperationId = "w7-plan-publication";
  const planSource = await writeWorkSource({ root, store: fsStore, sourceId: planSourceId, chiefSessionId: chief.sessionId,
    extra: { purpose: "team-planning", targetRoleId: "convener", planningRunId: planRunId,
      documentBasis: { version: manifestV1.value.trunkVersion, digest: manifestV1.value.digest, snapshotRef: manifestV1.value.snapshotRef }, intentConfirmation } });
  const planTaskRecorded = await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: planTaskId, from: "chief", to: "convener", runId: planRunId,
    runState: "draft", sideEffect: "docs", text: "Prepare the actual plan (W7 chain)",
    source: { sourceId: planSourceId, path: planSource.path, sha256: planSource.sha256 } }) });
  assert.ok(planTaskRecorded.ok, JSON.stringify(planTaskRecorded));
  const planPath = "docs/scheduling/demo-team-v2.md";
  const refOf = (ref: { path: string; sha256: string }) => ({ path: ref.path, sha256: ref.sha256 });
  const planText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: FLOW_ID, version: 2,
    modules: refOf(manifestV1.value.artifacts.documents.modules!), roster: refOf(manifestV1.value.artifacts.documents.roster!),
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# W7 chain team plan v2\n`;
  await fsp.mkdir(path.join(root, "docs/scheduling"), { recursive: true });
  await fsp.writeFile(path.join(root, planPath), planText);
  const planPrepared = await service.prepareTeamPlanCommit!({ operationId: planOperationId, flowId: FLOW_ID, runId: planRunId,
    baseDigest: manifestV1.value.digest, plan: { path: planPath, sha256: sha256(planText), version: 2 } }, "convener");
  if (!planPrepared.ok) assert.fail("w7 fixture plan preparation failed: " + JSON.stringify(planPrepared));
  if (!("preparationKind" in planPrepared.value)) assert.fail("w7 fixture plan preparation missing preparationKind: " + JSON.stringify({ result: planPrepared, documents: manifestV1.value.artifacts.documents, planPath, planText }));
  const planAuthority = await service.prepareDirectAuthority!(planPrepared.value, planTaskId);
  if (!planAuthority.ok) assert.fail(JSON.stringify(planAuthority));
  const planCandidate = checkGitPolicy(planAuthority.value.candidatePolicyInput), planPublication = checkGitPolicy(planAuthority.value.publicationPolicyInput);
  assert.equal(planCandidate.allowed, true, JSON.stringify(planCandidate));
  assert.equal(planPublication.allowed, true, JSON.stringify(planPublication));
  const planLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!planLease.ok) assert.fail(JSON.stringify(planLease));
  let planReceipt: Record<string, unknown>;
  try {
    const applied = await service.commitPreparedTeamPlan!(planPrepared.value, { hostLeaseId: planLease.leaseId, taskId: planTaskId,
      candidateVerdict: planCandidate, publicationVerdict: planPublication });
    assert.equal((applied as { status?: string }).status, "applied", JSON.stringify(applied));
    planReceipt = applied as unknown as Record<string, unknown>;
  } finally { endGitHostAction({ projectRoot: root, leaseId: planLease.leaseId }); }
  const manifestV2 = await createProjectTrunkStore(root).readManifest();
  if (!manifestV2.ok) assert.fail("w7 fixture trunk v2 missing: " + JSON.stringify(manifestV2));
  assert.equal(manifestV2.value.trunkVersion, 2);
  assert.ok(planReceipt.planRef && planReceipt.rosterRef);

  // 5b) 真实计划验收收口（真实 chief creator acceptance；role-preparation 与质量链的前置）。
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at: AT, kind: "task.reported", taskId: planTaskId, from: "convener",
    status: "done", summary: "The actual plan is published", evidence: [planPath] } })).ok);
  const planCloseBasis = await service.prepareCreatedTaskClose(planTaskId, "chief");
  if (!planCloseBasis.ok) assert.fail(JSON.stringify(planCloseBasis));
  const planClosed = await service.closeCreatedTask({ operationId: "w7-plan-close", taskId: planTaskId, runId: planRunId,
    reportRef: planCloseBasis.value.reportRef, basisDigest: planCloseBasis.value.basisDigest, outcome: "accepted" }, "chief");
  assert.equal((planClosed as { status?: string }).status, "applied", JSON.stringify(planClosed));
  const planCompletionProof = await readGitPlanCompletionBasis(root, { flowId: FLOW_ID, taskId: planTaskId, runId: planRunId, sourceId: planSourceId });
  if (!planCompletionProof.ok) assert.fail(JSON.stringify(planCompletionProof));
  const ledgerAfterPlanClose = await readOperationEvents(root);
  if (!ledgerAfterPlanClose.ok) assert.fail(JSON.stringify(ledgerAfterPlanClose));
  const planCloseRow = ledgerAfterPlanClose.records.find(row => row.value.kind === "task.closed" && row.value.taskId === planTaskId);
  assert.ok(planCloseRow, "真实 plan task.closed 行必须存在");
  if (!planCloseRow) throw new Error("missing plan close row");
  const planCloseEvent = planCloseRow.value as { operationId?: string };
  assert.ok(planCloseEvent.operationId);
  const planCompletion = { basis: planCompletionProof.value.basis, closeOperationId: planCloseEvent.operationId,
    closeSha256: sha256(planCloseRow.raw) };

  // 6) 真实激活（D3 appointment + 三文档 + authorization；service 路径或 runtime 路径）。
  const nominationTaskId = "w7-nomination-task";
  const nominationSource = await writeWorkSource({ root, store: fsStore, sourceId: nominationSourceId, chiefSessionId: chief.sessionId,
    extra: { purpose: "role-preparation", targetRoleId: "nominator", planningRunId: roleRunId,
      documentBasis: { version: manifestV2.value.trunkVersion, digest: manifestV2.value.digest, snapshotRef: manifestV2.value.snapshotRef }, intentConfirmation, planCompletion } });
  const nominationRecorded = await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: nominationTaskId, from: "chief", to: "nominator", runId: roleRunId,
    runState: "draft", sideEffect: "docs", text: "Activate the selected role (W7 chain)",
    source: { sourceId: nominationSourceId, path: nominationSource.path, sha256: nominationSource.sha256 } }) });
  assert.ok(nominationRecorded.ok, JSON.stringify(nominationRecorded));
  const d3RequestId = "w7-d3-request";
  // W-J5：judge 模式下 D3 按应用真实回执形状落账（judge 审计、decisionId=decision-<requestId>）。
  const d3Judged = input.d3By === "judge";
  const d3DecisionId = d3Judged ? `decision-${d3RequestId}` : "w7-d3-decision";
  const d3JudgeAudit: GovernanceJudgeAudit | undefined = d3Judged ? {
    group: "decision", cardKind: "appointment", engine: judgeEngine,
    reasonCode: input.judgeAudit?.reasonCode ?? "sufficient", selected: ["impl"],
  } : undefined;
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at: AT, kind: "request.created", requestId: d3RequestId, flowId: FLOW_ID,
    sourceRoleId: "nominator", cardKind: "appointment", title: "Select the implementation role", options: [{ id: "impl", label: "Implementation" }] } })).ok);
  const rosterRef = planReceipt.rosterRef as { path: string; sha256: string };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: d3JudgeAudit ? { v: 1, at: AT, kind: "request.resolved", requestId: d3RequestId, cardKind: "appointment",
    by: "judge", decisionId: d3DecisionId, selectedOptionIds: ["impl"], choice: "impl", targetRoleIds: ["impl"], rosterVersion: 1, rosterSha256: rosterRef.sha256,
    operatorId: `judge:${judgeEngine}`, judge: d3JudgeAudit } : { v: 1, at: AT, kind: "request.resolved", requestId: d3RequestId, cardKind: "appointment",
    by: "customer", decisionId: d3DecisionId, choice: "impl", targetRoleIds: ["impl"], rosterVersion: 1, rosterSha256: rosterRef.sha256 } })).ok);
  const cardBytes = await fsp.readFile(path.join(root, PATHS.roleCard));
  const boundaryMdBytes = await fsp.readFile(path.join(root, "角色卡/impl/boundary.md"));
  const boundaryYamlBytes = await fsp.readFile(path.join(root, PATHS.boundary));
  const activationInput = { operationId: "w7-activation", flowId: FLOW_ID, targetRoleId: "impl", d3DecisionId,
    planRef: planReceipt.planRef as Record<string, unknown>, rosterRef: planReceipt.rosterRef as Record<string, unknown>,
    documents: { card: { path: PATHS.roleCard, sha256: sha256(cardBytes) }, boundaryMd: { path: "角色卡/impl/boundary.md", sha256: sha256(boundaryMdBytes) },
      boundaryYaml: { path: PATHS.boundary, sha256: sha256(boundaryYamlBytes) } } };
  const activation = await service.prepareRoleActivation!(activationInput as never, "nominator");
  if (!activation.ok) assert.fail(JSON.stringify(activation));
  const quality = validateRoleDocumentsSnapshot({ snapshot: activation.value.snapshot, roles: [activation.value.role] });
  const boundary = validateBoundaryYamlText(CHAIN_BOUNDARY_YAML);
  if (!quality.ok) assert.fail(JSON.stringify(quality));
  if (!boundary.ok) assert.fail(JSON.stringify(boundary));
  let activationReceipt: Record<string, unknown>, activationSessionId: string | undefined;
  if (input.activationMode === "runtime" || input.activationMode === "wrapper") {
    // runtime/wrapper 激活：真实 nominator Core 回合（active activate_role_documents）+ 真实 host
    // inventory。runtime 直接调 `executeGitActiveRolePublication`（调用点组合 authorization 并
    // write-ahead 写 sidecar）；wrapper（W-J2b）经 `createDirectRoleRuntime.activateRoleDocuments`
    // 的完整包装层（含 nominator 模块 preflight 与真实直投记账）完成同一激活。
    const nominator = runtimeNominator;
    assert.ok(nominator && activationHold, "runtime activation requires its pre-bound nominator session");
    if (!nominator || !activationHold) throw new Error("missing runtime nominator session");
    const pumping = nominator.prompt("Invoke activate_role_documents for the W7 chain");
    pumping.catch(() => undefined);
    try {
      await until(() => entryOf(nominator.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "activate_role_documents") === true, 10000);
      assert.ok(recordGitHostInventoryForFixture(root, [
        { hostHandleId: "host-chief", session: sessions.chief!, roleId: "chief", runtime: "demo" },
        { hostHandleId: "host-nominator", session: nominator, roleId: "nominator", runtime: "claude", taskId: nominationTaskId, runId: roleRunId },
      ], 1).ok);
      const receipt = input.activationMode === "wrapper"
        ? await createDirectRoleRuntime({ projectRoot: root, actorRoleId: "nominator",
            notifyDirect: async (item) => { activationNotifications.push({ key: item.key, recipientRoleId: item.recipientRoleId }); } })
          .activateRoleDocuments(activationInput as never)
        : await executeGitActiveRolePublication({ projectRoot: root, activation: activation.value,
            checks: quality.roleDocumentChecks, boundaryEntries: boundary.entries, actorRoleId: "nominator" });
      assert.equal(receipt.ok, true, JSON.stringify(receipt));
      assert.equal(receipt.status, "applied", JSON.stringify(receipt));
      activationReceipt = receipt as unknown as Record<string, unknown>;
      activationSessionId = nominator.sessionId;
    } finally { activationHold.release(); await pumping.catch(() => undefined); }
  } else {
    const preparedActivation = await service.prepareActivationCommit!(activation.value, quality.roleDocumentChecks, boundary.entries, "nominator");
    if (!preparedActivation.ok) assert.fail(JSON.stringify(preparedActivation));
    if (!("preparationKind" in preparedActivation.value)) assert.fail("w7 fixture activation preparation missing preparationKind");
    const activeAuthority = await service.prepareDirectAuthority!(preparedActivation.value, nominationTaskId);
    if (!activeAuthority.ok) assert.fail(JSON.stringify(activeAuthority));
    const activeCandidate = checkGitPolicy(activeAuthority.value.candidatePolicyInput), activePublication = checkGitPolicy(activeAuthority.value.publicationPolicyInput);
    assert.equal(activeCandidate.allowed, true, JSON.stringify(activeCandidate));
    assert.equal(activePublication.allowed, true, JSON.stringify(activePublication));
    const activeLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
    if (!activeLease.ok) assert.fail(JSON.stringify(activeLease));
    try {
      const applied = await service.commitPreparedActivation!(preparedActivation.value, { hostLeaseId: activeLease.leaseId, taskId: nominationTaskId,
        candidateVerdict: activeCandidate, publicationVerdict: activePublication });
      assert.equal((applied as { status?: string }).status, "applied", JSON.stringify(applied));
      activationReceipt = applied as unknown as Record<string, unknown>;
    } finally { endGitHostAction({ projectRoot: root, leaseId: activeLease.leaseId }); }
  }
  const manifestV3 = await createProjectTrunkStore(root).readManifest();
  if (!manifestV3.ok) assert.fail("w7 fixture trunk v3 missing: " + JSON.stringify(manifestV3));
  assert.ok(manifestV3.value.activeRoles?.impl, "activation must publish the real active role");

  // 7) 真实 initial workflow 发布（stable-write request/approve/真实 write_file/completeWrite + Git 发布）。
  const workflowTaskId = "w7-workflow-task";
  const workflowTaskSource = await writeWorkSource({ root, store: fsStore, sourceId: workflowSourceId, chiefSessionId: chief.sessionId,
    extra: { documentBasis: { version: manifestV2.value.trunkVersion, digest: manifestV2.value.digest, snapshotRef: manifestV2.value.snapshotRef } } });
  assert.ok((await recordTaskObservation({ projectRoot: root, event: chainTask({ taskId: workflowTaskId, from: "chief", to: "convener", runId: workflowRunId,
    runState: "draft", sideEffect: "docs", text: "Publish the approved initial workflow (W7 chain)",
    source: { sourceId: workflowSourceId, path: workflowTaskSource.path, sha256: workflowTaskSource.sha256 } }) })).ok);
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const workflowAt = new Date().toISOString();
  const requested = await integration.services.stableWrite.request({ roleId: "convener", kind: "workflow", content: CHAIN_WORKFLOW_TEXT, at: workflowAt });
  if (!requested.ok) assert.fail(JSON.stringify(requested));
  const approved = await integration.services.stableWrite.approve(requested.value.requestId, { decisionId: "w7-workflow-decision", at: workflowAt });
  assert.ok(approved.ok, JSON.stringify(approved));
  const pumping = workflowConvener.prompt("Write the approved initial workflow (W7 chain)");
  pumping.catch(() => undefined);
  let written = "";
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    written = await fsp.readFile(path.join(root, PATHS.workflow), "utf8").catch(() => "");
    const entry = entryOf(workflowConvener.sessionId);
    if (written === CHAIN_WORKFLOW_TEXT && entry?.lifecycle?.activeTools.some(tool => tool.name === "write_file") === true) break;
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  assert.equal(written, CHAIN_WORKFLOW_TEXT, "真实 write_file 必须落盘后才继续绑定 stable source");
  const workflowTurnId = entryOf(workflowConvener.sessionId)?.lifecycle?.turnId;
  assert.ok(workflowTurnId, "真实回合 turnId 必须可读");
  const sourceLease = beginGitHostAction({ projectRoot: root, kind: "arm" });
  if (!sourceLease.ok) assert.fail(JSON.stringify(sourceLease));
  let bound;
  try {
    bound = await service.bindInitialWorkflowSource!({ requestId: requested.value.requestId, taskId: workflowTaskId,
      coreSessionId: workflowConvener.sessionId, coreTurnId: workflowTurnId, hostLeaseId: sourceLease.leaseId });
  } finally { endGitHostAction({ projectRoot: root, leaseId: sourceLease.leaseId }); }
  if (!bound.ok) assert.fail(JSON.stringify(bound));
  const completed = await integration.services.stableWrite.completeWrite({ requestId: requested.value.requestId, actualSha256: sha256(CHAIN_WORKFLOW_TEXT), at: workflowAt });
  assert.ok(completed.ok, JSON.stringify(completed));
  const workflowOperationId = bound.value.operationId;
  const workflowRequest = { kind: "workflow" as const, roleId: "convener", path: PATHS.workflow, oldSha: "", newSha: sha256(CHAIN_WORKFLOW_TEXT),
    decisionId: "w7-workflow-decision", at: workflowAt };
  const workflowPrepared = await service.prepareInitialWorkflowCommit!(workflowRequest);
  if (!workflowPrepared.ok) assert.fail(JSON.stringify(workflowPrepared));
  if (!("preparationKind" in workflowPrepared.value)) assert.fail("w7 fixture workflow preparation missing preparationKind");
  const workflowAuthority = await service.prepareDirectAuthority!(workflowPrepared.value, workflowTaskId);
  if (!workflowAuthority.ok) assert.fail(JSON.stringify(workflowAuthority));
  const workflowCandidate = checkGitPolicy(workflowAuthority.value.candidatePolicyInput), workflowPublication = checkGitPolicy(workflowAuthority.value.publicationPolicyInput);
  assert.equal(workflowCandidate.allowed, true, JSON.stringify(workflowCandidate));
  assert.equal(workflowPublication.allowed, true, JSON.stringify(workflowPublication));
  const workflowLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!workflowLease.ok) assert.fail(JSON.stringify(workflowLease));
  try {
    const attached = await service.commitPreparedInitialWorkflow!(workflowPrepared.value, { hostLeaseId: workflowLease.leaseId, taskId: workflowTaskId,
      candidateVerdict: workflowCandidate, publicationVerdict: workflowPublication });
    assert.equal(attached.applied, true, JSON.stringify(attached));
  } finally { endGitHostAction({ projectRoot: root, leaseId: workflowLease.leaseId }); }

  // 8) 真实冻结 pin（readExecutionBases → codeBasis/documentGitBasis）。
  const pin = await freezeExecutionRun({ projectRoot: root, runId: execRunId, flowId: FLOW_ID, operationId: "w7-freeze" });
  if (!pin.ok) assert.fail(JSON.stringify(pin));
  const manifestFinal = await createProjectTrunkStore(root).readManifest();
  if (!manifestFinal.ok) assert.fail("w7 fixture final manifest missing: " + JSON.stringify(manifestFinal));

  return { root, canonical: root, sessions, service, integration, fsStore, docsRunId, execRunId, initTaskId, docTaskId, planTaskId, nominationTaskId, workflowTaskId,
    initOperationId, planPath, planText, manifestV1Digest: manifestV1.value.digest, planReceipt, activationInput, activationReceipt, activationSessionId, activationNotifications,
    workflowOperationId, workflowHeld, pin: { runId: pin.runId, pinDigest: pin.pinDigest, run: pin.run as unknown as Record<string, unknown> },
    manifest: manifestFinal.value as unknown as Record<string, unknown>, workflowAt,
    intentRequestId, intentDecisionId, d3RequestId, d3DecisionId,
    ...(intentJudgeAudit !== undefined ? { intentJudgeAudit } : {}), ...(d3JudgeAudit !== undefined ? { d3JudgeAudit } : {}) };
}

/** 发布真实 host inventory（真实 desktop 边界；不用调用方自报的普通事实替代）。 */
export function recordGitHostInventoryForFixture(root: string, rows: Array<{
  hostHandleId: string; session: { sessionId?: string }; roleId: string; runtime: string; taskId?: string; runId?: string; phase?: "live" | "disposed";
}>, revision: number, extra?: { runStops?: readonly unknown[]; deliveryQueuePersistence?: readonly unknown[] }) {
  return recordGitHostInventory({ source: "desktop-session-manager", projectRoot: root, observedAt: AT, revision,
    sessions: rows.map(row => ({ hostHandleId: row.hostHandleId, roleId: row.roleId, runtime: row.runtime, phase: row.phase ?? "live" as const,
      coreSessionId: row.session.sessionId, ...(row.taskId !== undefined ? { taskId: row.taskId } : {}), ...(row.runId !== undefined ? { runId: row.runId } : {}), errors: [] })),
    pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [],
    ...(extra?.runStops !== undefined ? { runStops: extra.runStops } : {}),
    ...(extra?.deliveryQueuePersistence !== undefined ? { deliveryQueuePersistence: extra.deliveryQueuePersistence } : {}) } as never);
}

/** 证据落盘：仅当设置 ANS_W7_EVIDENCE_DIR 时把真实产物快照写入 W7 证据目录（正常测试运行不写盘）。 */
export async function exportEvidence(name: string, value: unknown): Promise<void> {
  const dir = process.env.ANS_W7_EVIDENCE_DIR;
  if (!dir) return;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * 真实 run-change 请求派发夹具（P1.2-AC-25/AC-29）：
 *  - 真实 chief hub 来源（purpose builtin-preparation + builtinPreparationSource 绑定的 draft run）与
 *    真实 open rapporteur 请求任务（runId = hub draft run，与生产 hub 派发同形）；
 *  - 真实 chief→convener 控制任务（stopped run 内）+ 真实 `prepareParentTaskRef` + convener→成员子任务
 *    （stopped run 内的真实 member 集合）。
 */
export async function createRunChangeAssignment(chain: WriteChain, input: {
  requesterTaskId: string; hubRunId: string; controllerTaskId: string;
  members: Array<{ taskId: string; roleId: string }>;
}) {
  const { prepareParentTaskRef } = await import("../../src/pipeline/orchestration/trunk-runtime.ts");
  // 1) 真实 chief hub 来源 + hub draft run + 真实 open rapporteur 请求任务（runId = hub draft run）。
  const hubSourceId = "init-source-" + sha256(chain.root + ":" + input.requesterTaskId);
  const registration = { source: "native-directory-selection" as const, selectionId: "w7-runchange-selection", selectedRoot: chain.root,
    projectRoot: chain.root, selectedAt: AT, listingGeneration: 1 };
  const hubSource = await writeWorkSource({ root: chain.root, store: chain.fsStore, sourceId: hubSourceId, chiefSessionId: chain.sessions.chief!.sessionId,
    extra: { purpose: "builtin-preparation", hubRouting: "chief-hub-v1", targetRoleId: "rapporteur", planningRunId: input.hubRunId, registration } });
  assert.ok((await chain.fsStore.compareAndSwapRunRecord!(input.hubRunId, null, { schema: "ans-run/v1", runId: input.hubRunId, flowId: FLOW_ID,
    state: "draft", documents: {}, execution: { teamPlan: null, flow: null }, createdAt: AT, updatedAt: AT, schemas: { run: "ans-run/v1" },
    builtinPreparationSource: hubSourceId } as never)).ok);
  const requester = await recordTaskObservation({ projectRoot: chain.root, event: chainTask({ taskId: input.requesterTaskId, from: "chief", to: "rapporteur",
    runId: input.hubRunId, runState: "draft", sideEffect: "read-only", text: "Select the actual frozen run stop timing (W7 run-change)",
    hubRouting: "chief-hub-v1", source: { sourceId: hubSourceId, path: hubSource.path, sha256: hubSource.sha256 } }) });
  assert.ok(requester.ok, JSON.stringify(requester));
  // 2) stopped run 内真实控制任务 + 真实 parentTaskRef + convener→成员子任务（stopped-run member 集合）。
  const controllerSourceId = "init-source-" + sha256(chain.root + ":" + input.controllerTaskId);
  const controllerSource = await writeWorkSource({ root: chain.root, store: chain.fsStore, sourceId: controllerSourceId, chiefSessionId: chain.sessions.chief!.sessionId });
  const controller = await recordTaskObservation({ projectRoot: chain.root, event: chainTask({ taskId: input.controllerTaskId, from: "chief", to: "convener",
    runId: chain.execRunId, runState: "pinned", sideEffect: "code", text: "Organize the actual frozen execution (W7 run-change controller)",
    source: { sourceId: controllerSourceId, path: controllerSource.path, sha256: controllerSource.sha256 } }) });
  assert.ok(controller.ok, JSON.stringify(controller));
  const parent = await prepareParentTaskRef({ projectRoot: chain.root, actorRoleId: "convener", taskId: input.controllerTaskId, flowId: FLOW_ID, runId: chain.execRunId });
  if (!parent.ok) assert.fail(JSON.stringify(parent));
  for (const member of input.members) {
    const recorded = await recordTaskObservation({ projectRoot: chain.root, event: chainTask({ taskId: member.taskId, from: "convener", to: member.roleId,
      runId: chain.execRunId, runState: "pinned", sideEffect: "read-only", text: "Actual stopped-run member (W7 run-change)",
      parentTaskRef: parent.parentTaskRef as unknown as Record<string, unknown>, source: { path: "", sha256: "" } }) });
    assert.ok(recorded.ok, JSON.stringify(recorded));
  }
  return { hubSourceId, hubSource, registration, parentTaskRef: parent.parentTaskRef, controllerSourceId };
}

/**
 * 真实执行派发：chief→convener 控制任务（真实 chief work source）+ 真实 `prepareParentTaskRef` +
 * 真实 `prepareRoleDispatch`（execution）+ convener→impl 模块任务（真实 parentTaskRef）。
 * 对应 o10/o14 存储层夹具的真实 Pipeline 版本；不生成任何模型/权限自报事实。
 */
export async function createExecutionAssignment(chain: WriteChain, input: {
  controllerTaskId: string; workerTaskId: string; moduleId?: string;
}) {
  const { prepareParentTaskRef, prepareRoleDispatch } = await import("../../src/pipeline/orchestration/trunk-runtime.ts");
  const moduleId = input.moduleId ?? "impl-core";
  const sourceId = "init-source-" + sha256(chain.root + ":" + input.controllerTaskId);
  const source = await writeWorkSource({ root: chain.root, store: chain.fsStore, sourceId, chiefSessionId: chain.sessions.chief!.sessionId });
  assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: chainTask({ taskId: input.controllerTaskId, from: "chief", to: "convener",
    runId: chain.execRunId, runState: "pinned", sideEffect: "code", text: "Organize the actual frozen execution (W7 chain)",
    source: { sourceId, path: source.path, sha256: source.sha256 } }) })).ok);
  const parent = await prepareParentTaskRef({ projectRoot: chain.root, actorRoleId: "convener", taskId: input.controllerTaskId, flowId: FLOW_ID, runId: chain.execRunId });
  if (!parent.ok) assert.fail(JSON.stringify(parent));
  const dispatch = await prepareRoleDispatch({ projectRoot: chain.root, fromRoleId: "convener", targetRoleId: "impl", flowId: FLOW_ID,
    runId: chain.execRunId, moduleId });
  if (!dispatch.ok || dispatch.value.kind !== "execution") assert.fail(JSON.stringify(dispatch));
  assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: chainTask({ taskId: input.workerTaskId, from: "convener", to: "impl",
    runId: chain.execRunId, runState: "pinned", sideEffect: "code", text: "Implement the actual assigned module file (W7 chain)",
    moduleId, moduleDirectory: "src/impl/", modulePaths: ["src/impl/"], parentTaskRef: parent.parentTaskRef as unknown as Record<string, unknown>,
    source: { sourceId: "", path: "", sha256: "" } }) })).ok);
  return { source, parentTaskRef: parent.parentTaskRef, dispatch };
}
