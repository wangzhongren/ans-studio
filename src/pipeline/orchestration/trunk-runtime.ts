// src/pipeline/orchestration/trunk-runtime.ts
// 主干 Pipeline 公共句柄（2026-11-04 trunk-amendment-model B-2 / S4）。
//
// 职责（P1 §2.5-25/§3.5）：trunk 状态/面板数据、主干升级（**收窄：仅紧急/恢复**）、受控恢复、
// bootstrap、apply（供 version-change-runtime 调用）、stable mini re-pin 事件；接 S2
// `TrunkService`、S3 `repinPinnedRun`（生产 `RunRepinPort`）、task-state 事件注入与 presenter。
//
// 纪律：
// · **不写项目文档、不派角色、不直接写账本/发卡**：状态/提交/冻结由注入 Service 完成；
//   事件经注入 `emitEvent`（生产 = `appendTaskEvent`；测试 = fake）落账。
// · 提交点 = S2 `executeApply` 的 trunk manifest 写成功；失败不改 trunk 指针（S2 保证）。
// · 主干升级只允许 `reason:"emergency"|"recovery"` + 客户 decisionId + 高危二次确认
//   （`highRisk.acknowledged===true`），**拒绝版本化文档/execution 内容变更**（走 VCA），
//   只允许 stable/紧急 re-pin；不用于常规 stable（stable 走确认即写 + mini re-pin）。
// · stable mini re-pin **不升 trunkVersion**；无 manifest ⇒ 只记待续接（S2 返回 applied:false，
//   不写 `stable-repinned` 事件）。

import { repinPinnedRun } from "../../common/编排/run-manifest.ts";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { isDispatchTaskResumeController, isRuntimeSessionDrained } from "../../model/runtime.ts";
import type { TaskStateEvent, SelectRunChangeFn, SelectRunChangeInput, CompleteTeamPlanFn, CompleteTeamPlanInput, CloseCreatedTaskFn, ActivateRoleDocumentsFn } from "../../model/runtime.ts";
import type { ProjectConfig, RolePolicyDecision } from "../../model/role.ts";
import { listProject, builtInRoleModuleOf } from "../../service/role/resolve-role.ts";
import { createTrunkService } from "../../service/trunk/public/trunk-service.ts";
import { createGitCapabilityService, type GitQueryContext, type RepositoryInitializationContext } from "../../service/trunk/public/trunk-service.ts";
import { inspectManagedRoleSessionEvidence, inspectManagedRoleSessionInventory, recheckRoleSessionOpenFailureInventory } from "./run-role.ts";
import { inspectRuntimeCoreRegistry } from "../../service/runtime/session.ts";
import { evaluateChiefDispatchParent, type DispatchParentHostFacts, type DispatchParentCoreFacts, type DispatchParentDecision } from "../../common/gates/index.ts";
import { appendGitActionAuthorization, beginGitHostAction, endGitHostAction, checkGitHostAction, inspectGitHostCoordinator, readGitProtectionFacts, readGitInitializationTaskBasis, type GitActionAuthorizationRecord } from "../../provider/trunk/public/trunk-store.ts";
import { checkGitPolicy } from "../../service/gate/shell-rules.ts";
import { validateRoleDocumentsSnapshot, validateBoundaryYamlText, verifyVersionedDocuments, isBuiltInGovernanceRoleId } from "../../service/boundary/resolve-boundary.ts";
import { isValidIntentId } from "../../common/shared/intent-entry-contract.ts";
import { parseProjectRoster, rosterContainsBuiltInRoleIds, rosterRoleIds, isConvenerBuiltInDispatchTarget } from "../../common/编排/workflow-preconditions.ts";
// X-R6（E2 S2）：chief hub 派发的角色策略纯数据（来源/目标/路由）；本文件只做路由选择，不授予权限。
import { CHIEF_HUB_DISPATCH } from "../../common/roles/chief/index.ts";
import { validateTaskStateEvent } from "../../common/编排/task-state.ts";
import type {
  TrunkApplySnapshot,
  TrunkDocKind,
  TrunkManifest,
  TrunkStableFileKind,
  DirectActionSource, DirectActionReceipt,
} from "../../model/trunk.ts";
import type {
  ReconcileResult,
  RunRepinPort,
  StableRepinAuditPayload,
  TrunkApplyInput,
  TrunkApplyResult,
  TrunkRecoveryInput,
  TrunkService,
  TrunkServiceResult,
  TrunkStatusView,
  CompletedTeamPlanReceipt,
  PreparedRoleActivation,
} from "../../service/trunk/public/trunk-service.ts";

export type { RunRepinPort };
export type { RepositoryInitializationContext };

export type { GitHostInventory, GitHostActionKind, GitHostOpenFailureRef } from "../../provider/trunk/public/trunk-store.ts";
export { recordGitHostInventory, beginGitHostAction, endGitHostAction, recordGitHostInterruption, inspectGitHostCoordinator } from "../../provider/trunk/public/trunk-store.ts";

/**
 * 动作时 Git 授权门（2026-11-08「删除全部预知式门控」P1.4 §3.3 / I0-4/I0-6；
 * **原 `inspectInitializationProtection`**——改名保留溯源，注册表级预知前提已删除）。
 *
 * 职责边界（F1）：只做**身份/根/注册表闭包**与运行时中立终止/可读性检查（H1–H14）；
 * **不接收** `GitPolicyFacts`、不做 `checkGitPolicy`、不持有 mutation lease、不返回 authorization；
 * 角色 ACL / `checkGitPolicy().inputDigest` / host mutation lease 仍由调用点按既有顺序执行，
 * authorization 由调用点在政策判定与 lease 之后组合（W3b）。
 *
 * 证据 ≠ 授权（F8/B10）：`toolSurface.status`、native 状态、`processCoverage`、closedTools 快照、
 * `configuredForeignMcpServers` 与未命中 closedTools 的工具名只记录在 `optionalEvidence`，
 * **不参与判定**；PR #72 契约保持：本函数**不读**应用中介证据字段（写/发布门零引用）。
 */

/** active-tool 模式下被要求处于活动状态的工具族（`ans_` 前缀别名同组）。 */
export type GitActionExpectedTool = "git_query" | "git_candidate" | "git_publish" | "select_run_change"
  | "complete_team_plan" | "activate_role_documents" | "submit_version_change" | "versioned-doc-write";
const GIT_ACTION_TOOL_NAMES: Record<GitActionExpectedTool, readonly string[]> = {
  "git_query": ["git_query", "ans_git_query"],
  "git_candidate": ["git_candidate", "ans_git_candidate"],
  "git_publish": ["git_publish", "ans_git_publish"],
  // run-change 不是 Git mutation：真实 active rapporteur 的 `select_run_change` 调用即动作来源（身份 fail-closed）。
  "select_run_change": ["select_run_change", "ans_select_run_change"],
  // 业务发布（团队计划/激活/文档提交）由对应真实工具回合发起。
  "complete_team_plan": ["complete_team_plan", "ans_complete_team_plan"],
  "activate_role_documents": ["activate_role_documents", "ans_activate_role_documents"],
  "submit_version_change": ["submit_version_change", "ans_submit_version_change"],
  // stable initial workflow 发布由 post-write 接缝触发，真实活动工具是刚完成写入的 write_file/edit_file。
  "versioned-doc-write": ["write_file", "edit_file"],
};

export interface GitActionAuthorizationInput {
  projectRoot: string;
  taskId: string;
  parentCoreSessionId: string;
  expectedActor: { roleId?: string; coreSessionId?: string };
  /** active-tool 模式必填；缺失即 fail-closed（S5）。host-continuation 模式不使用。 */
  expectedTool?: GitActionExpectedTool;
  authorizationMode: "active-tool" | "host-continuation";
  /** 仅 finalizeRunChange 的 deferred/resume 宿主继续（F2/R1）。 */
  hostContinuation?: { requesterTurnId: string; planId: string };
}

type GitActionRegistryEntry = ReturnType<typeof inspectRuntimeCoreRegistry>["entries"][number];
export interface GitActionActorSummary {
  entryId: string; coreSessionId: string; roleId: string; runtime: string;
  taskId?: string; runId?: string; turnId: string; projectRoot: string;
}
export interface GitActionOptionalEvidence {
  toolSurfaceStatus?: string;
  nativeStatus?: string;
  nativeReasons?: readonly string[];
  processCoverage?: string;
  configuredForeignMcpServers?: readonly string[];
  unknownTools?: readonly string[];
}
export type GitActionAuthorizationResult = { ok: false; code: string; message: string } | {
  ok: true; registryRevision: number; inventoryRevision: string | number; rootsDigest: string;
  actor: GitActionActorSummary;
  controls: {
    drain: { disposed: boolean };
    fileWriteProtection?: import("../../model/runtime.ts").RuntimeSessionToolSurfaceFacts["fileWriteProtection"];
    roleCapabilityGuards?: import("../../model/runtime.ts").RuntimeSessionToolSurfaceFacts["roleCapabilityGuards"];
  };
  optionalEvidence: GitActionOptionalEvidence;
};

/** Fresh observations from actual producer registries. Ordinary caller-supplied inventory never establishes a safe surface. */
export async function inspectGitActionAuthorization(input: GitActionAuthorizationInput): Promise<GitActionAuthorizationResult> {
  const key = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
  const reject = (code: string, message: string) => ({ ok: false as const, code, message });
  // H1：host 可对账（真实 host 事实，非预知）。
  const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory;
  if (!inventory) return reject("git-host-inventory-unavailable", "The actual desktop inventory has not been published");
  if (inventory.pendingOpens.length || inventory.sessions.some(s => ["creating", "disposing", "dispose-failed"].includes(s.phase)))
    return reject("git-host-admission-in-flight", "An actual creation/disposal or failed controller remains unaccounted for");
  const registry = inspectRuntimeCoreRegistry(), entries = registry.entries, pipeline = inspectManagedRoleSessionInventory();
  // H2：失败准入可对账（终止条件经运行时中立 drain，A10/C7）。
  const failedAdmissions = recheckRoleSessionOpenFailureInventory({ projectRoot: input.projectRoot, sessions: inventory.sessions });
  if (!failedAdmissions || failedAdmissions.processInstanceId !== registry.processInstanceId || failedAdmissions.registryRevision !== registry.revision)
    return reject("git-host-admission-in-flight", "The failed host admission has no unique fresh same-attempt revoked preparation or instance-bound terminal receipt");
  const verifiedOpenFailures = new Set(failedAdmissions.entries.map(entry => entry.hostHandleId));
  // H3：无未登记 controller/factory（身份/历史，非预知）。
  if (pipeline.unknownFactoryAttempts.length || pipeline.sessions.some(session => !session.sessionId || session.construction !== "default-core"
    || !entries.some(entry => entry.sessionId === session.sessionId)))
    return reject("git-app-controller-history-unproven", "An actual app-owned controller/factory, including another root, has no verified history or owned-process termination proof");
  // H6：source parent 在本进程 Core 历史（身份）。
  if (!entries.some(entry => entry.sessionId === input.parentCoreSessionId && entry.roleId === "chief" && key(entry.projectRoot) === key(input.projectRoot)))
    return reject("git-source-process-history-unproven", "The true source parent is not in this process's actual Core history; old process programs cannot be inferred stopped");
  // H4/H5：actor 身份与动作来源（两种授权模式；F1/F2/R1）。
  const actorRoleId = input.expectedActor.roleId ?? "convener";
  let actorRow: (typeof inventory.sessions)[number] | undefined;
  let actorEntry: GitActionRegistryEntry | undefined;
  if (input.authorizationMode === "active-tool") {
    if (!input.expectedTool) return reject("git-actor-core-binding-unproven", "An actual active tool invocation is required for this action");
    const toolNames = GIT_ACTION_TOOL_NAMES[input.expectedTool];
    const actors = inventory.sessions.filter(session => session.phase === "live" && session.taskId === input.taskId && session.roleId === actorRoleId
      && session.coreSessionId !== undefined
      && (input.expectedActor.coreSessionId === undefined || session.coreSessionId === input.expectedActor.coreSessionId));
    if (actors.length !== 1) return reject("git-actor-core-binding-unproven", "The actual action source has no unique current Core instance");
    actorRow = actors[0]!;
    actorEntry = entries.find(entry => entry.sessionId === actorRow!.coreSessionId);
    if (!actorEntry || actorEntry.state !== "active" || actorEntry.roleId !== actorRoleId || key(actorEntry.projectRoot) !== key(input.projectRoot)
      || !actorEntry.lifecycle?.turnId || actorEntry.lifecycle.stopRequested
      || !actorEntry.lifecycle.activeTools.some(tool => toolNames.includes(tool.name)))
      return reject("git-actor-core-binding-unproven", "The action source Core instance is not this role/project's actual active tool invocation");
  } else {
    // host-continuation：deferred/resume finalize（F2/R1）——active 或真正 settled（disposed+drain）的 rapporteur；
    // 不要求 live member / activeTools；taskId 由 inventory 记录与调用点 `held.plan.requesterTaskId` 双绑定。
    if (!input.hostContinuation) return reject("git-actor-core-binding-unproven", "The host continuation facts are required");
    if (!input.expectedActor.coreSessionId) return reject("git-actor-core-binding-unproven", "The continuation actor Core session is required");
    const records = inventory.sessions.filter(session => session.coreSessionId === input.expectedActor.coreSessionId && session.taskId === input.taskId
      && session.roleId === actorRoleId && (session.phase === "live" || session.phase === "disposed"));
    if (records.length !== 1) return reject("git-actor-core-binding-unproven", "The continuation actor has no unique task-bound live/disposed host record");
    actorRow = records[0]!;
    actorEntry = entries.find(entry => entry.sessionId === input.expectedActor.coreSessionId);
    if (!actorEntry || actorEntry.roleId !== actorRoleId || key(actorEntry.projectRoot) !== key(input.projectRoot)
      || !(actorEntry.state === "active" || (actorEntry.state === "disposed" && actorEntry.lifecycle !== undefined && isRuntimeSessionDrained(actorEntry.lifecycle)))
      || actorEntry.lifecycle?.turnId !== input.hostContinuation.requesterTurnId)
      return reject("git-actor-core-binding-unproven", "The continuation actor is not the genuinely settled requesting instance");
  }
  // H4 续：每个真实 desktop controller 必须在 Core 注册表（身份一致性；不要求能力）。
  for (const session of inventory.sessions) {
    if (verifiedOpenFailures.has(session.hostHandleId)) continue;
    if (!session.coreSessionId || !entries.some(entry => entry.sessionId === session.coreSessionId && entry.roleId === session.roleId && entry.runtime === session.runtime))
      return reject("git-controller-history-unproven", "A real desktop controller is absent from the authoritative Core registry");
  }
  // H7：根身份（恰为 projectRoot/.git）。
  const roots = await readGitProtectionFacts(input.projectRoot), expected = [path.join(input.projectRoot, ".git")];
  if (roots.protectedGitRoots.length !== expected.length || !expected.every(root => roots.protectedGitRoots.some(actual => key(actual) === key(root))))
    return reject("git-root-discovery-unproven", "The actual metadata/other-worktree roots exceed this new independent repository surface");
  // H13/H14/H11：逐 entry 运行时中立闭包（F4/R10；不要求 native/processCoverage）。
  const closedTools = new Set(["write_file", "edit_file", "read_file", "list_dir", "view_image", "request_confirmation", "request_choice",
    "submit_report", "dispatch_task", "role_status", "contract_check", "evidence_check", "session_tail", "role_activity_log",
    "terminate_role_run", "redispatch_task", "project_state", "governance_matrix", "project_note", "request_version_decision",
    "close_created_task", "git_query", "git_candidate", "git_publish", "complete_team_plan", "activate_role_documents", "request_requirement_change",
    "submit_refactor", "request_stable_write", "submit_version_change", "select_run_change", "decide_pending_request", "judge_read_file", "judge_list_dir", "report_shell_judgement", "report_governance_judgement"]);
  const capabilityTools = ["install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp"] as const;
  const foreignServers = new Set<string>(), unknownTools = new Set<string>();
  for (const entry of entries) {
    const lifecycle = entry.lifecycle;
    const construction = entry.construction;
    // H13：非 active 条目的 in-flight/pending 闭包（handle 未产生前的 pending 准备不得被忽略）。
    if (entry.state === "preparing" || entry.state === "creating" || entry.state === "disposing")
      return reject("git-core-in-flight-unproven", "An actual Core session is still preparing/creating/disposing");
    if (entry.state === "prepared" || entry.state === "failed") {
      if (construction?.status === "never-started" && entry.sessionId === undefined
        && !construction.factoryEntered && !construction.nativeBindEntered && construction.preparedTokensRevoked && construction.pendingContinuations === 0) continue;
      if (entry.state === "failed" && construction?.status === "instance-bound" && entry.sessionId && lifecycle?.sessionId === entry.sessionId
        && isRuntimeSessionDrained(lifecycle)) continue;
      return reject("git-core-in-flight-unproven", "A prepared/failed Core entry retains factory/native-bind entries, pending continuations or unrevoked preparation");
    }
    if (entry.state === "disposed") {
      // H11：disposed 只用运行时中立 drain（不要求 processCoverage/native；unknown 的 native 覆盖如实接受并披露）。
      if (!lifecycle || !isRuntimeSessionDrained(lifecycle))
        return reject("git-old-core-programs-unproven", "Disposed tracked processes are not proven stopped (native coverage may be unknown)");
      continue;
    }
    if (entry.state !== "active")
      return reject("git-core-in-flight-unproven", "An actual Core entry is in an unknown lifecycle state");
    // H14：active 条目必须可读 lifecycle/toolSurface 且身份一致（不允许 fail-open）。
    const surface = entry.toolSurface;
    if (!lifecycle || entry.reasons.includes("core-instance-inspection-failed") || !surface
      || surface.sessionId !== entry.sessionId || surface.roleId !== entry.roleId || surface.runtime !== entry.runtime)
      return reject("git-core-inspection-unavailable", "An active Core entry's lifecycle/tool surface is unreadable or identity-drifted");
    // H12/B12：控制面守卫（按条目工具面条件；非预知）。
    if (surface.appTools.some(tool => tool === "write_file" || tool === "edit_file")) {
      const guard = surface.fileWriteProtection;
      if (!guard || guard.mechanism !== "canonical-roots-and-nlink-v1" || guard.rootDiscovery !== "host-provided"
        || !guard.coveredTools.includes("write_file") || !guard.coveredTools.includes("edit_file")
        || !expected.every(root => guard.protectedGitRoots.some(actual => key(actual) === key(root))))
        return reject("git-file-final-guard-unproven", "Actual file/edit handlers do not carry the current canonical metadata roots and link guard");
    }
    // H12/B11：能力回调绑定（core plan/session/role/runtime/registryDigest/guardedTools 仍核；native 绑定有则核、无则略）。
    const actualCapabilities = capabilityTools.filter(tool => surface.appTools.includes(tool));
    if (actualCapabilities.length) {
      const guard = surface.roleCapabilityGuards;
      const digest = createHash("sha256").update(JSON.stringify({ roleId: entry.roleId, runtime: entry.runtime, initialAppTools: surface.appTools,
        guardedTools: actualCapabilities, unguardedTools: [] })).digest("hex");
      const nativePlan = surface.native?.factoryPlan;
      if (!guard || guard.source !== "core-blocked-role-capability-callbacks" || guard.mechanism !== "no-effect-rejection-v1" || guard.status !== "bound"
        || guard.roleId !== entry.roleId || guard.runtime !== entry.runtime || guard.sessionId !== entry.sessionId
        || typeof guard.corePlanId !== "string" || !guard.corePlanId || guard.corePlanId !== entry.planId
        || (nativePlan !== undefined && guard.nativePlanId !== undefined && guard.nativePlanId !== nativePlan.planId)
        || (nativePlan !== undefined && guard.nativeConfigDigest !== undefined && guard.nativeConfigDigest !== nativePlan.configDigest)
        || guard.registryDigest !== digest || guard.reasons.length || guard.unguardedTools.length
        || JSON.stringify(guard.guardedTools) !== JSON.stringify(actualCapabilities))
        return reject("git-role-capability-guard-unproven", "The actual four role-capability callbacks are not bound to this Core plan and no-effect registry");
    }
    // 可选证据（不判定）：跨会话 foreign MCP / 未命中 closedTools 的工具名只记录（F8；不宣称已阻断）。
    for (const server of surface.configuredForeignMcpServers) foreignServers.add(server);
    for (const tool of surface.appTools) if (!closedTools.has(tool) && !(capabilityTools as readonly string[]).includes(tool)) unknownTools.add(tool);
  }
  // 输出（I0-4）：actor/controls/optionalEvidence；不返回 authorization/policyInputDigests/leaseId。
  const actorSurface = actorEntry.toolSurface;
  const optionalEvidence: GitActionOptionalEvidence = {
    ...(actorSurface ? { toolSurfaceStatus: actorSurface.status, configuredForeignMcpServers: actorSurface.configuredForeignMcpServers } : {}),
    ...(actorEntry.lifecycle?.native ? { nativeStatus: actorEntry.lifecycle.native.status, nativeReasons: actorEntry.lifecycle.native.reasons } : {}),
    ...(actorEntry.lifecycle ? { processCoverage: actorEntry.lifecycle.processCoverage } : {}),
  };
  if (foreignServers.size) optionalEvidence.configuredForeignMcpServers = [...foreignServers].sort();
  if (unknownTools.size) optionalEvidence.unknownTools = [...unknownTools].sort();
  return {
    ok: true as const, registryRevision: registry.revision, inventoryRevision: inventory.revision, rootsDigest: roots.basisDigest,
    actor: { entryId: actorEntry.id, coreSessionId: actorRow!.coreSessionId!, roleId: actorRoleId, runtime: actorEntry.runtime,
      ...(actorRow!.taskId !== undefined ? { taskId: actorRow!.taskId } : {}), ...(actorRow!.runId !== undefined ? { runId: actorRow!.runId } : {}),
      turnId: actorEntry.lifecycle!.turnId!, projectRoot: actorEntry.projectRoot },
    controls: { drain: { disposed: actorEntry.state === "disposed" },
      ...(actorSurface?.fileWriteProtection !== undefined ? { fileWriteProtection: actorSurface.fileWriteProtection } : {}),
      ...(actorSurface?.roleCapabilityGuards !== undefined ? { roleCapabilityGuards: actorSurface.roleCapabilityGuards } : {}) },
    optionalEvidence,
  };
}

/**
 * W3b（2026-11-08「删除全部预知式门控」P1.4 §3.3.1/§3.4.3 + I0-1/I0-2）：
 * 调用点在第二次 gate `current` 通过、policy verdict 与 `git-mutation` lease 均成立之后、
 * **真实效果之前**逐动作组合 authorization 并 write-ahead 写入 sidecar。
 *
 * 字段来源（R2）：`actor`/`optionalEvidence`/`rootsDigest`/revisions 取第一次 gate 的 `closure`
 * （第二次 `current` 已复检一致）；`policyInputDigests` 为调用点按动作映射的
 * `checkGitPolicy().inputDigest`；`leaseId` 是当前持有、直到效果结束的 mutation lease。
 * append 失败 ⇒ 调用点返回 `git-action-audit-unavailable` 且**不执行效果**（不产生 ref/对象/
 * 工作树/journal 效果）；run-change/finalize/controller-stop 不是结构化 Git mutation，不写 sidecar。
 */
function verifiedActiveToolName(entryId: string, expected: GitActionExpectedTool): string {
  const names = GIT_ACTION_TOOL_NAMES[expected];
  const entry = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.id === entryId);
  return entry?.lifecycle?.activeTools.find(tool => names.includes(tool.name))?.name ?? names[0]!;
}
async function appendGitActionAuthorizationBeforeEffects(input: {
  projectRoot: string; operationId: string; template: string; expectedTool: GitActionExpectedTool;
  closure: Extract<GitActionAuthorizationResult, { ok: true }>; leaseId: string;
  policyInputDigests: GitActionAuthorizationRecord["policyInputDigests"];
}): Promise<{ ok: true } | { ok: false; code: "git-action-audit-unavailable"; message: string }> {
  const evidence = input.closure.optionalEvidence;
  const record: GitActionAuthorizationRecord = {
    source: "git-action-authorization", version: 1, operationId: input.operationId, template: input.template,
    actorRoleId: input.closure.actor.roleId, coreSessionId: input.closure.actor.coreSessionId,
    ...(input.closure.actor.taskId !== undefined ? { taskId: input.closure.actor.taskId } : {}),
    ...(input.closure.actor.runId !== undefined ? { runId: input.closure.actor.runId } : {}),
    turnId: input.closure.actor.turnId, activeTool: verifiedActiveToolName(input.closure.actor.entryId, input.expectedTool),
    projectRoot: input.projectRoot, rootsDigest: input.closure.rootsDigest, registryRevision: input.closure.registryRevision,
    inventoryRevision: input.closure.inventoryRevision, leaseId: input.leaseId, policyInputDigests: input.policyInputDigests,
    optionalEvidence: {
      ...(evidence.toolSurfaceStatus !== undefined ? { toolSurfaceStatus: evidence.toolSurfaceStatus } : {}),
      ...(evidence.nativeStatus !== undefined ? { nativeStatus: evidence.nativeStatus } : {}),
      ...(evidence.nativeReasons !== undefined ? { nativeReasonsCount: evidence.nativeReasons.length } : {}),
      ...(evidence.processCoverage !== undefined ? { processCoverage: evidence.processCoverage } : {}),
      ...(evidence.configuredForeignMcpServers !== undefined ? { configuredForeignMcpServers: evidence.configuredForeignMcpServers } : {}),
      ...(evidence.unknownTools !== undefined ? { unknownTools: evidence.unknownTools } : {}),
    },
  };
  try {
    await appendGitActionAuthorization(input.projectRoot, record);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, code: "git-action-audit-unavailable",
      message: `The actual authorization sidecar could not be appended before effects (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** Trusted host read scope comes from role resolution; request schemas never accept this context. */
export function createGitRoleRuntime(input: { projectRoot: string; context: GitQueryContext }): {
  gitQuery: import("../../model/runtime.ts").GitQueryFn;
  gitCandidate: import("../../model/runtime.ts").GitCandidateFn;
  gitPublish: import("../../model/runtime.ts").GitPublishFn;
} {
  const context = structuredClone(input.context), service = createGitCapabilityService({ projectRoot: input.projectRoot, context });
  return { async gitQuery(request, signal) {
    const prepared = await service.prepareQuery(request, context); if (!prepared.ok) return prepared.result;
    if (context.actorRoleId === "verifier" && context.taskId) {
      const sessions = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory?.sessions.filter(session => session.phase === "live" && session.roleId === "verifier"
        && session.taskId === context.taskId && session.coreSessionId) ?? [];
      const actual = sessions.length === 1 ? inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: sessions[0]!.coreSessionId! }) : undefined;
      if (!actual || actual.roleKind !== "built-in-governance" || actual.disposed || actual.lifecycle?.stopRequested
        || !actual.lifecycle?.activeTools.some(tool => ["git_query", "ans_git_query"].includes(tool.name)))
        return { operationId: request.operationId, repoId: "unavailable", status: "blocked", code: "git-review-actor-unproven", message: "The actual assigned built-in verifier read invocation is required" };
    }
    return service.executeQuery(prepared.value, checkGitPolicy(prepared.value.policyInput), signal);
  }, async gitCandidate(request, signal) {
    if (request.action === "commit" || request.action === "integrate" || request.action === "revert") {
      if (request.action === "revert") {
        const fail = (code: string, message: string): import("../../model/trunk.ts").GitCapabilityResult => ({ operationId: request.operationId, repoId: "unavailable", status: "blocked", code, message });
        if (context.actorRoleId !== "convener" || !context.taskId || !context.runId) return fail("git-revert-controller-unproven", "A real assigned controller is required before execution preparation");
        const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory;
        const actors = inventory?.sessions.filter(session => session.phase === "live" && session.taskId === context.taskId && session.roleId === "convener" && session.coreSessionId).map(session =>
          inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: session.coreSessionId! })).filter(actual => actual?.roleKind === "built-in-governance" && actual.roleId === "convener" && !actual.disposed
            && !actual.lifecycle?.stopRequested && actual.lifecycle?.activeTools.some(tool => ["git_candidate", "ans_git_candidate"].includes(tool.name))) ?? [];
        if (actors.length !== 1) return fail("git-revert-controller-unproven", "One actual built-in controller candidate invocation is required before preparing its execution pin");
        const assigned = await createTrunkService({ projectRoot: input.projectRoot }).inspectAssignedTask({ taskId: context.taskId, actorRoleId: "convener" });
        if (!assigned.ok || assigned.value.runId !== context.runId) return fail("git-revert-assignment-unproven", assigned.ok ? "Controller run differs" : assigned.message ?? assigned.code);
        const runService = createTrunkService({ projectRoot: input.projectRoot }), prepared = await runService.prepareExecutionRun({ runId: context.runId, flowId: assigned.value.flowId, operationId: request.operationId });
        if (!prepared.ok) return fail(prepared.code, prepared.message ?? prepared.code);
        if (JSON.stringify(prepared.value.nextRun.codeBasis) !== JSON.stringify(request.base)) return fail("git-revert-code-basis-conflict", "Expected base differs from the real current delivery/document execution basis; no pin is changed");
        const documents = validateRoleDocumentsSnapshot({ snapshot: prepared.value.snapshot, roles: prepared.value.roles });
        if (!documents.ok) return fail("run-role-documents-invalid", documents.message);
        if (signal?.aborted) return fail("git-revert-cancelled", "Candidate was cancelled before execution pin");
        const pinned = await runService.pinExecutionRun(prepared.value, documents.roleDocumentChecks);
        if (!pinned.ok) return fail(pinned.code, pinned.message ?? pinned.code);
      }
      const prepared = request.action === "integrate" ? await service.prepareIntegration(request) : request.action === "revert" ? await service.prepareRevert(request) : await service.prepareWorkerCommit(request); if (!prepared.ok) return prepared.result;
      const value = prepared.value, fail = (code: string, message: string): import("../../model/trunk.ts").GitCapabilityResult => ({ operationId: request.operationId, repoId: value.repoId, status: "blocked", code, message });
      const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory, registry = inspectRuntimeCoreRegistry();
      const key = (root: string) => process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
      const actors = inventory?.sessions.filter(session => session.phase === "live" && session.taskId === value.taskId && session.roleId === value.actorRoleId && session.coreSessionId
        && registry.entries.some(entry => entry.state === "active" && entry.sessionId === session.coreSessionId && entry.roleId === value.actorRoleId
          && key(entry.projectRoot) === key(input.projectRoot) && entry.lifecycle?.activeTools.some(tool => ["git_candidate", "ans_git_candidate"].includes(tool.name)))) ?? [];
      if (actors.length !== 1) return fail("git-worker-actor-unproven", "One actual assigned worker Core git_candidate invocation is required");
      if (request.action === "integrate" || request.action === "revert") {
        const actualRole = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: actors[0]!.coreSessionId! });
        if (actualRole?.roleKind !== "built-in-governance" || actualRole.roleId !== "convener" || actualRole.disposed) return fail("git-integration-controller-unproven", "Integration requires the actual registered built-in convener, not a model role name");
      }
      const source = await readGitInitializationTaskBasis(input.projectRoot, { flowId: value.flowId });
      if (!source.ok) return fail("git-worker-root-source-unproven", source.message ?? source.reason);
      const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation" });
      if (!lease.ok) return fail(lease.code, "A real admission/authorization action owns the mutation lease");
      try {
        const actual: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: value.taskId, parentCoreSessionId: value.processSource.parentCoreSessionId,
          expectedActor: { roleId: value.actorRoleId, coreSessionId: actors[0]!.coreSessionId! }, expectedTool: "git_candidate", authorizationMode: "active-tool" };
        const closure = await inspectGitActionAuthorization(actual); if (!closure.ok) return fail(closure.code, closure.message);
        const verdict = checkGitPolicy(value.policyInput); if (!verdict.allowed) return fail(verdict.code ?? "git-worker-policy-denied", "The actual full-tree no-index candidate plan was refused");
        const current = await inspectGitActionAuthorization(actual); if (!current.ok) return fail(current.code, current.message);
        if (current.registryRevision !== closure.registryRevision || current.inventoryRevision !== closure.inventoryRevision || current.rootsDigest !== closure.rootsDigest)
          return fail("git-worker-protection-stale", "Actual all-controller/root/authorization closure changed before effects");
        // R2：commit/integrate/revert ⇒ { candidate: verdict.inputDigest }；模板取候选策略输入的真实来源。
        const audit = await appendGitActionAuthorizationBeforeEffects({ projectRoot: input.projectRoot, operationId: request.operationId,
          template: value.policyInput.template, expectedTool: "git_candidate", closure, leaseId: lease.leaseId,
          policyInputDigests: { candidate: verdict.inputDigest } });
        if (!audit.ok) return fail(audit.code, audit.message);
        return await service.executeWorkerCommit(value, lease.leaseId, verdict, signal);
      } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
    }
    if (request.action !== "init") return service.candidate(request, signal);
    const prepared = await service.prepareInitialization(request); if (!prepared.ok) return prepared.result;
    const fail = (code: string, message: string): import("../../model/trunk.ts").GitCapabilityResult => ({ operationId: request.operationId, repoId: "uninitialized", status: "blocked", code, message });
    const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation" });
    if (!lease.ok) return fail(lease.code, "A real host admission/authorization action is in progress");
    try {
      // init 不是 Git mutation 之前的「预知」：真实 convener 的 git_candidate(init) 活动工具调用即动作来源。
      const actual: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: prepared.value.taskId, parentCoreSessionId: prepared.value.parentCoreSessionId,
        expectedActor: { roleId: "convener" }, expectedTool: "git_candidate", authorizationMode: "active-tool" };
      const closure = await inspectGitActionAuthorization(actual);
      if (!closure.ok) return fail(closure.code, closure.message);
      const init = prepared.value.initializationPlan, candidate = prepared.value.candidatePlan;
      if (!init) return fail("git-initialization-recovery-policy-required", "Existing initialization is recovered from its actual operation, never reinitialized");
      const common = { repoId: "uninitialized", operationId: request.operationId, actorRoleId: context.actorRoleId, taskId: prepared.value.taskId, runId: prepared.value.runId,
        authorizationRevision: prepared.value.inputDigest, currentAuthorizationRevision: prepared.value.inputDigest, objectFormat: init.objectFormat,
        paths: [], readPaths: [...context.readPaths], writePaths: [], ref: candidate.ref, ownedCandidateRef: candidate.ref, worksite: init.worksite,
        // A real new root has no repository id. This is its explicitly distinct, content-bound qualification, not a fabricated repo identity.
        initializationBasis: { kind: "uninitialized-root" as const, projectRoot: init.projectRoot, qualificationDigest: init.qualificationDigest,
          operationId: request.operationId, requestDigest: prepared.value.requestDigest, sourceId: prepared.value.sourceId, sourceSha256: prepared.value.sourceSha256 } };
      const initPolicy = checkGitPolicy({ ...common, template: "init", base: null, candidate: null, approvedInitRoot: init.projectRoot, ownedTemplateDir: init.templateDir,
        allDiff: { complete: true, base: null, candidate: null, entries: [] }, argv: init.argv, commands: [init.argv] });
      if (!initPolicy.allowed) return fail(initPolicy.code ?? "git-initialization-policy-denied", "The actual no-index initialization plan has not passed pure policy");
      const candidatePolicy = checkGitPolicy({ ...common, template: "commit", base: null, candidate: candidate.commit.candidate,
        allDiff: { complete: true, base: null, candidate: candidate.commit.candidate, entries: [] }, argv: candidate.commands[0]!, commands: candidate.commands });
      if (!candidatePolicy.allowed) return fail(candidatePolicy.code ?? "git-initial-candidate-policy-denied", "The actual complete empty candidate byte/command plan has not passed pure policy");
      if (signal?.aborted || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok)
        return fail("git-host-mutation-interrupted", "The actual mutation lease was cancelled before effects");
      const current = await inspectGitActionAuthorization(actual);
      if (!current.ok) return fail(current.code, current.message);
      if (current.registryRevision !== closure.registryRevision || current.inventoryRevision !== closure.inventoryRevision || current.rootsDigest !== closure.rootsDigest)
        return fail("git-protection-basis-stale", "Actual actors/authorization or root identity changed before effects");
      // R2：init ⇒ { init: initPolicy.inputDigest, candidate: candidatePolicy.inputDigest }；模板为真实 `init`。
      const audit = await appendGitActionAuthorizationBeforeEffects({ projectRoot: input.projectRoot, operationId: request.operationId,
        template: "init", expectedTool: "git_candidate", closure, leaseId: lease.leaseId,
        policyInputDigests: { init: initPolicy.inputDigest, candidate: candidatePolicy.inputDigest } });
      if (!audit.ok) return fail(audit.code, audit.message);
      return await service.executeInitialization(prepared.value, lease.leaseId, signal);
    } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
  }, async gitPublish(request, signal) {
    if (request.target !== "delivery") return service.publish(request, signal);
    const prepared = await service.prepareDelivery(request); if (!prepared.ok) return prepared.result;
    const value = prepared.value, fail = (code: string, message: string): import("../../model/trunk.ts").GitCapabilityResult => ({ operationId: request.operationId, repoId: value.repoId, status: "blocked", code, message });
    const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory, registry = inspectRuntimeCoreRegistry();
    const key = (root: string) => process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
    const actors = inventory?.sessions.filter(session => session.phase === "live" && session.taskId === value.taskId && session.roleId === "convener" && session.coreSessionId
      && registry.entries.some(entry => entry.state === "active" && entry.sessionId === session.coreSessionId && entry.roleId === "convener"
        && key(entry.projectRoot) === key(input.projectRoot) && entry.lifecycle?.activeTools.some(tool => ["git_publish", "ans_git_publish"].includes(tool.name)))) ?? [];
    const actor = actors.length === 1 ? inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: actors[0]!.coreSessionId! }) : undefined;
    if (!actor || actor.roleKind !== "built-in-governance" || actor.roleId !== "convener" || actor.disposed || actor.lifecycle?.stopRequested)
      return fail("git-delivery-controller-unproven", "One actual live assigned built-in convener git_publish invocation is required");
    const source = await readGitInitializationTaskBasis(input.projectRoot, { flowId: value.flowId });
    if (!source.ok) return fail("git-delivery-root-source-unproven", source.message ?? source.reason);
    const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation" });
    if (!lease.ok) return fail(lease.code, "Actual admission or authority change owns the mutation boundary");
    try {
      const actual: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: value.taskId, parentCoreSessionId: value.processSource.parentCoreSessionId,
        expectedActor: { roleId: "convener", coreSessionId: actors[0]!.coreSessionId! }, expectedTool: "git_publish", authorizationMode: "active-tool" };
      const closure = await inspectGitActionAuthorization(actual); if (!closure.ok) return fail(closure.code, closure.message);
      const verdict = checkGitPolicy(value.policyInput); if (!verdict.allowed) return fail(verdict.code ?? "git-delivery-policy-denied", "The complete actual ref-only delivery plan was refused");
      const current = await inspectGitActionAuthorization(actual); if (!current.ok) return fail(current.code, current.message);
      if (signal?.aborted || current.registryRevision !== closure.registryRevision || current.inventoryRevision !== closure.inventoryRevision || current.rootsDigest !== closure.rootsDigest)
        return fail("git-delivery-protection-stale", "Actual actors/root/authority changed before publication");
      // R2：delivery ⇒ { publication: verdict.inputDigest }；模板取发布策略输入的真实来源。
      const audit = await appendGitActionAuthorizationBeforeEffects({ projectRoot: input.projectRoot, operationId: request.operationId,
        template: value.policyInput.template, expectedTool: "git_publish", closure, leaseId: lease.leaseId,
        policyInputDigests: { publication: verdict.inputDigest } });
      if (!audit.ok) return fail(audit.code, audit.message);
      return await service.executeDelivery(value, lease.leaseId, verdict, signal);
    } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
  } };
}

/** Formal submit path: current real Core/task -> full-tree pure policy -> one scoped storage commit. */
export async function executeGitDocumentPublication(input: { projectRoot: string; applyInput: import("../../service/trunk/public/trunk-service.ts").TrunkDirectApplyInput }): Promise<DirectActionReceipt> {
  return executeGitBusinessPublication({ projectRoot: input.projectRoot, kind: "direct", request: input.applyInput });
}
export async function executeGitTeamPlanPublication(input: { projectRoot: string; request: import("../../model/runtime.ts").CompleteTeamPlanInput; actorRoleId: string }): Promise<CompletedTeamPlanReceipt> {
  if (input.actorRoleId !== "convener") return { ok: false, status: "rejected", operationId: input.request.operationId, baseDigest: input.request.baseDigest,
    targetDigest: null, errorCode: "plan-identity-invalid", message: "Only the actual convener can publish the plan" };
  return executeGitBusinessPublication({ projectRoot: input.projectRoot, kind: "plan", request: input.request });
}
export async function executeGitActiveRolePublication(input: { projectRoot: string; activation: import("../../service/trunk/public/trunk-service.ts").PreparedRoleActivation;
  checks: readonly import("../../model/boundary.ts").RoleDocumentCheck[]; boundaryEntries: readonly import("../../model/boundary.ts").BoundaryEntry[]; actorRoleId: string
}): Promise<import("../../model/runtime.ts").ActivateRoleDocumentsResult> {
  if (input.actorRoleId !== "nominator") return { ok: false, status: "rejected", operationId: input.activation.input.operationId, baseDigest: null,
    targetDigest: null, errorCode: "activation-identity-invalid", message: "Only the actual nominator can activate roles" };
  const result = await executeGitBusinessPublication({ ...input, kind: "active", request: input.activation.input });
  if (!result.ok) return result;
  if ("activationDigest" in result && typeof result.activationDigest === "string") return { ...result, activationDigest: result.activationDigest };
  return { ok: false, status: "blocked", operationId: input.activation.input.operationId, baseDigest: input.activation.expectedActive.digest,
    targetDigest: null, errorCode: "activation-receipt-incomplete", message: "No valid activation receipt was returned" };
}
async function executeGitBusinessPublication(input: { projectRoot: string } & (
  { kind: "direct"; request: import("../../service/trunk/public/trunk-service.ts").TrunkDirectApplyInput } |
  { kind: "plan"; request: import("../../model/runtime.ts").CompleteTeamPlanInput } |
  { kind: "active"; request: import("../../model/runtime.ts").ActivateRoleDocumentsInput; activation: import("../../service/trunk/public/trunk-service.ts").PreparedRoleActivation;
    checks: readonly import("../../model/boundary.ts").RoleDocumentCheck[]; boundaryEntries: readonly import("../../model/boundary.ts").BoundaryEntry[] }
)): Promise<CompletedTeamPlanReceipt | import("../../model/runtime.ts").ActivateRoleDocumentsResult> {
  const request = input.request, actorRoleId = input.kind === "plan" ? "convener" : input.kind === "active" ? "nominator" : input.request.actorRoleId;
  const fail = (code: string, message: string): DirectActionReceipt => ({ ok: false, status: "blocked", operationId: request.operationId,
    baseDigest: input.kind === "plan" ? input.request.baseDigest : input.kind === "active" ? input.activation.expectedActive.digest : input.request.baseTrunk?.digest ?? null, targetDigest: null, errorCode: code, message });
  const service = createTrunkService({ projectRoot: input.projectRoot });
  if (!service.prepareDirectCommit || !service.prepareDirectAuthority || !service.commitPreparedDirect || !service.prepareTeamPlanCommit || !service.commitPreparedTeamPlan || !service.prepareActivationCommit || !service.commitPreparedActivation)
    return fail("git-document-service-unavailable", "Bound business commit capabilities are unavailable");
  const preparation = input.kind === "plan" ? await service.prepareTeamPlanCommit(input.request, actorRoleId) : input.kind === "active" ? await service.prepareActivationCommit(input.activation, input.checks, input.boundaryEntries, actorRoleId) : await service.prepareDirectCommit(input.request);
  if (!preparation.ok) return fail(preparation.code, preparation.message ?? preparation.code);
  if (!("preparationKind" in preparation.value)) return preparation.value;
  const value = preparation.value;
  const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory, registry = inspectRuntimeCoreRegistry();
  const key = (root: string) => process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
  const activeTools = input.kind === "plan" ? ["complete_team_plan", "ans_complete_team_plan"] : input.kind === "active" ? ["activate_role_documents", "ans_activate_role_documents"] : ["submit_version_change", "ans_submit_version_change"];
  const actors = inventory?.sessions.filter(session => session.phase === "live" && session.roleId === actorRoleId && session.taskId && session.coreSessionId
    && registry.entries.some(entry => entry.state === "active" && entry.sessionId === session.coreSessionId && entry.roleId === actorRoleId
      && key(entry.projectRoot) === key(input.projectRoot) && entry.lifecycle?.activeTools.some(tool => activeTools.includes(tool.name)))) ?? [];
  if (actors.length !== 1) return fail("git-document-actor-unproven", "A unique actual publishing Core tool invocation and its assigned task are required");
  const source = await readGitInitializationTaskBasis(input.projectRoot, { flowId: request.flowId });
  if (!source.ok) return fail("git-document-root-source-unproven", source.message ?? source.reason);
  // Repository initialization is settled historical data; mutation process provenance is this actual task's Chief source.
  const authority = await service.prepareDirectAuthority(value, actors[0]!.taskId!);
  if (!authority.ok) return fail(authority.code, authority.message ?? authority.code);
  const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation" });
  if (!lease.ok) return fail(lease.code, "A real admission/authorization action owns this project");
  try {
    // 业务发布：真实业务工具回合（complete_team_plan / activate_role_documents / submit_version_change）即动作来源。
    const expectedTool: GitActionExpectedTool = input.kind === "plan" ? "complete_team_plan" : input.kind === "active" ? "activate_role_documents" : "submit_version_change";
    const context: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: actors[0]!.taskId!,
      parentCoreSessionId: authority.value.processSource.parentCoreSessionId, expectedActor: { roleId: actorRoleId, coreSessionId: actors[0]!.coreSessionId! },
      expectedTool, authorizationMode: "active-tool" };
    const closure = await inspectGitActionAuthorization(context); if (!closure.ok) return fail(closure.code, closure.message);
    const candidateVerdict = checkGitPolicy(authority.value.candidatePolicyInput), publicationVerdict = checkGitPolicy(authority.value.publicationPolicyInput);
    if (!candidateVerdict.allowed) return fail(candidateVerdict.code ?? "git-document-candidate-policy-denied", "The actual complete candidate tree/command plan was refused");
    if (!publicationVerdict.allowed) return fail(publicationVerdict.code ?? "git-document-publication-policy-denied", "The actual complete business publication was refused");
    const current = await inspectGitActionAuthorization(context); if (!current.ok) return fail(current.code, current.message);
    if (current.registryRevision !== closure.registryRevision || current.inventoryRevision !== closure.inventoryRevision || current.rootsDigest !== closure.rootsDigest
      || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok) return fail("git-document-protection-stale", "Actual actors/root/admission changed before publication");
    // R2：文档/计划/激活发布 ⇒ { candidate, publication } 两键；模板取发布策略输入的真实来源。
    const audit = await appendGitActionAuthorizationBeforeEffects({ projectRoot: input.projectRoot, operationId: request.operationId,
      template: authority.value.publicationPolicyInput.template, expectedTool, closure, leaseId: lease.leaseId,
      policyInputDigests: { candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest } });
    if (!audit.ok) return fail(audit.code, audit.message);
    const commitAuthority = { hostLeaseId: lease.leaseId, taskId: context.taskId, candidateVerdict, publicationVerdict };
    return value.preparationKind === "team-plan-commit" ? await service.commitPreparedTeamPlan(value, commitAuthority) : value.preparationKind === "active-role-commit" ? await service.commitPreparedActivation(value, commitAuthority) : await service.commitPreparedDirect(value, commitAuthority);
  } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
}

/** Post-write attachment uses the persisted actual request source, never a latest-role guess. */
export async function executeGitInitialWorkflowPublication(input: { projectRoot: string; request: import("../../service/trunk/public/trunk-service.ts").TrunkStableSnapshotInput }): Promise<import("../../service/trunk/public/trunk-service.ts").TrunkStableSnapshotResult> {
  const fail = (errorCode: string, message: string) => ({ applied: false, pendingReattach: true, errorCode, message });
  const service = createTrunkService({ projectRoot: input.projectRoot });
  if (!service.prepareInitialWorkflowCommit || !service.prepareDirectAuthority || !service.commitPreparedInitialWorkflow) return fail("initial-workflow-service-unavailable", "Bound initial workflow service is unavailable");
  const prepared = await service.prepareInitialWorkflowCommit(input.request); if (!prepared.ok) return fail(prepared.code, prepared.message ?? prepared.code);
  if (!("preparationKind" in prepared.value)) return prepared.value;
  const value = prepared.value, initialized = await readGitInitializationTaskBasis(input.projectRoot, { flowId: value.source.flowId });
  if (!initialized.ok) return fail("initial-workflow-root-source-unproven", initialized.message ?? initialized.reason);
  const authority = await service.prepareDirectAuthority(value, value.source.taskId); if (!authority.ok) return fail(authority.code, authority.message ?? authority.code);
  const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation" }); if (!lease.ok) return fail(lease.code, "Another actual host action owns this root");
  try {
    // stable initial workflow 发布由 post-write 接缝触发：真实活动工具是刚完成写入的 write_file/edit_file。
    const context: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: value.source.taskId,
      parentCoreSessionId: authority.value.processSource.parentCoreSessionId,
      expectedActor: { roleId: "convener", coreSessionId: value.source.coreSessionId }, expectedTool: "versioned-doc-write", authorizationMode: "active-tool" };
    const closure = await inspectGitActionAuthorization(context); if (!closure.ok) return fail(closure.code, closure.message);
    const candidateVerdict = checkGitPolicy(authority.value.candidatePolicyInput), publicationVerdict = checkGitPolicy(authority.value.publicationPolicyInput);
    if (!candidateVerdict.allowed || !publicationVerdict.allowed) return fail(candidateVerdict.code ?? publicationVerdict.code ?? "initial-workflow-policy-denied", "The complete actual stable workflow publication was refused");
    const current = await inspectGitActionAuthorization(context); if (!current.ok) return fail(current.code, current.message);
    if (current.registryRevision !== closure.registryRevision || current.inventoryRevision !== closure.inventoryRevision || current.rootsDigest !== closure.rootsDigest
      || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok) return fail("initial-workflow-protection-stale", "Actual source/controllers/authorization/root changed before publication");
    // R2：initial workflow 发布 ⇒ { candidate, publication } 两键；operationId 取准备阶段解析出的真实操作。
    const audit = await appendGitActionAuthorizationBeforeEffects({ projectRoot: input.projectRoot, operationId: value.input.operationId,
      template: authority.value.publicationPolicyInput.template, expectedTool: "versioned-doc-write", closure, leaseId: lease.leaseId,
      policyInputDigests: { candidate: candidateVerdict.inputDigest, publication: publicationVerdict.inputDigest } });
    if (!audit.ok) return fail(audit.code, audit.message);
    return await service.commitPreparedInitialWorkflow(value, { hostLeaseId: lease.leaseId, taskId: value.source.taskId, candidateVerdict, publicationVerdict });
  } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
}

/** Acknowledges idempotent enqueue, including when the recipient is currently busy. */
export type DirectNotificationSink = (input: { key: string; recipientRoleId: string; message: string;
  source: Extract<DirectActionSource, { kind: "role-direct" }> }) => Promise<void>;

/**
 * X-R2（E2 S4）：rapporteur 模块 `preflight.checkAction("run-change", …)` 的事实包投影。
 * 事实按 rapporteur `api-spec.md` §5.4 登记键供给（真实 actor + `SelectRunChangeInput` 全部字段）；
 * 模块只做角色侧纯策略（三模式闭集、绑定事实齐备），**不采集/不判定停稳证据**——实际 pin/目标
 * 一致性、停稳、两阶段提交与 CAS 仍由 Service/宿主最终校验（`allow` 不是提交成功）。
 */
function rapporteurRunChangeFacts(actorRoleId: string, request: SelectRunChangeInput): Record<string, unknown> {
  return {
    initiatorRoleId: actorRoleId,
    mode: request.mode,
    operationId: request.operationId,
    runId: request.runId,
    expectedPinDigest: request.expectedPinDigest,
    targetTrunkVersion: request.targetTrunk.version,
    targetTrunkDigest: request.targetTrunk.digest,
    reason: request.reason,
  };
}

/** 模块事实键 → 迁移前 Service 首次拒绝码/文案（deny 映射既有回执；见 E2-XR2 证据 §切换点）。 */
function rapporteurRunChangeRejection(
  decision: Extract<RolePolicyDecision, { readonly allow: false }>,
  surface: "direct" | "host",
): { errorCode: string; message: string } {
  const details: unknown = decision.details;
  const factKey = typeof details === "object" && details !== null && typeof (details as { factKey?: unknown }).factKey === "string"
    ? (details as { factKey: string }).factKey
    : undefined;
  if (surface === "host") {
    // `prepareRunChange` 迁移前由 Service `createRunChangePort.prepareRunChange` 拒绝，统一码
    // `trunk-item-invalid`；文案按字段与其首检顺序逐字对应。
    if (factKey === "expectedPinDigest") return { errorCode: "trunk-item-invalid", message: "Old pin changed" };
    if (factKey === "targetTrunkVersion" || factKey === "targetTrunkDigest")
      return { errorCode: "trunk-item-invalid", message: "Requested target is not an actual same-flow complete baseline" };
    if (factKey === "runId") return { errorCode: "trunk-item-invalid", message: "run-corrupt" };
    return { errorCode: "trunk-item-invalid", message: "An actual assigned rapporteur stop/restart request is required" };
  }
  // direct（continue-frozen 等）迁移前由 Service `selectRunChange` 拒绝：按字段取同一既有码/文案。
  if (factKey === "runId") return { errorCode: "run-evidence-unavailable", message: "run-corrupt" };
  if (factKey === "expectedPinDigest") return { errorCode: "run-pin-conflict", message: "Expected pin differs from the actual immutable run" };
  if (factKey === "targetTrunkVersion" || factKey === "targetTrunkDigest")
    return { errorCode: "run-target-unavailable", message: "Target trunk is not a real complete baseline for this flow" };
  return { errorCode: "run-change-invalid", message: "Only the real rapporteur may explicitly select a valid run mode" };
}

/**
 * X-R4（E2 S4）：convener 模块 `preflight.checkAction("team-plan", …)` 的事实包（api-spec §5.1：
 * `actorRoleId` + `CompleteTeamPlanInput` 全部字段；`runId` 可选，未给不造键）。工具 schema 已保证
 * operationId/flowId/baseDigest/plan 形状；`plan.path` 的 flow/version 规则由模块与 Service 双检。
 */
export function convenerTeamPlanFacts(request: CompleteTeamPlanInput): Readonly<Record<string, unknown>> {
  return {
    actorRoleId: "convener",
    operationId: request.operationId,
    flowId: request.flowId,
    ...(request.runId !== undefined ? { runId: request.runId } : {}),
    baseDigest: request.baseDigest,
    plan: { path: request.plan.path, sha256: request.plan.sha256, version: request.plan.version },
  };
}

/** 模块 deny → 迁移前 Service 首检码/文案（路径规则对应 `plan-path-invalid`，其余 `plan-identity-invalid`）。 */
function convenerTeamPlanRejection(
  decision: Extract<RolePolicyDecision, { readonly allow: false }>,
): { errorCode: string; message: string } {
  if (decision.code === "team-plan-path-invalid") {
    return { errorCode: "plan-path-invalid", message: "Plan path and declared version must identify the real flow team plan" };
  }
  return { errorCode: "plan-identity-invalid", message: "Only the real convener can complete a plan against an actual document basis" };
}

/**
 * 计划 frontmatter 的 roleRows[].roleId（事实投影；计划字节已由 `prepareRoleActivation` 校验）。
 */
function planRoleIdsOf(text: string): string[] | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return undefined;
  try {
    const parsed: unknown = parseYaml(match[1]!);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const rows = (parsed as { roleRows?: unknown }).roleRows;
    if (!Array.isArray(rows)) return undefined;
    const ids: string[] = [];
    for (const row of rows) {
      if (row === null || typeof row !== "object" || typeof (row as { roleId?: unknown }).roleId !== "string")
        return undefined;
      ids.push((row as { roleId: string }).roleId);
    }
    return ids;
  } catch {
    return undefined;
  }
}

/**
 * X-R3（E2 S4）：nominator 模块 `preflight.checkAction("appointment")` 的 `role-documents` 事实包。
 *
 * 事实只取自已由 `prepareRoleActivation` 校验并绑定到不可变 snapshot 的字节（名单/计划/D3 证据）：
 *  - 名单：`evidence.rosterRef` 指向的快照字节，用 `parseProjectRoster(flowId)` 复解析（版本/roles/envBootstrap）；
 *  - D3：`evidence.d3Ref` 内的 `resolvedBytesBase64`（真实账本行，`validateTaskStateEvent` 复验）；
 *  - 计划：`evidence.planRef` 的 frontmatter `roleRows[].roleId`（计划完成证据已由 Service 校验）；
 *  - 三个文档结构事实 `boundaryWithinRoleModules` / `boundaryMdYamlSynchronized` /
 *    `roleCardRequiredSections`：由紧邻调用点的 `validateRoleDocumentsSnapshot` 通过保证（此处只在
 *    该函数成功之后调用），不是自报值。
 *
 * 返回 `undefined` = 事实包无法按 api-spec 完整构造（flowId 非治理 slug、快照字节缺失或解析失败）
 * ⇒ 调用方跳过模块调用，保留迁移前路径。`intentEntryConsistent` 为可选诊断事实，不传（E2 D-1）。
 */
export function nominatorRoleDocumentsFacts(value: PreparedRoleActivation): Record<string, unknown> | undefined {
  const input = value.input, evidence = value.evidence;
  if (!isValidIntentId(input.flowId)) return undefined;
  // 事实包要求（api-spec）：targetRoleId 治理 slug；d3DecisionId/operationId 非空且不含控制字符。
  // 不满足时返回 undefined（调用方跳过），避免把无法登记的事实包交给模块造成新增拒绝。
  if (!isValidIntentId(input.targetRoleId)
      || input.d3DecisionId.length === 0 || /[\u0000-\u001f\u007f]/.test(input.d3DecisionId)
      || input.operationId.length === 0 || /[\u0000-\u001f\u007f]/.test(input.operationId)) return undefined;
  const textOf = (ref: { path: string; sha256: string }): string | undefined => {
    const found = value.snapshot.files.find((file) => file.path === ref.path && file.sha256 === ref.sha256);
    return found === undefined ? undefined : Buffer.from(found.bytesBase64, "base64").toString("utf8");
  };
  const rosterText = textOf(evidence.rosterRef);
  if (rosterText === undefined) return undefined;
  const roster = parseProjectRoster(rosterText, input.flowId);
  if (!roster.ok) return undefined;
  const planText = textOf(evidence.planRef);
  if (planText === undefined) return undefined;
  const planRoleIds = planRoleIdsOf(planText);
  if (planRoleIds === undefined) return undefined;
  const d3Text = textOf(evidence.d3Ref);
  if (d3Text === undefined) return undefined;
  let d3Record: unknown;
  try {
    d3Record = JSON.parse(d3Text);
  } catch {
    return undefined;
  }
  if (d3Record === null || typeof d3Record !== "object" || Array.isArray(d3Record)) return undefined;
  const resolvedBase64 = (d3Record as { resolvedBytesBase64?: unknown }).resolvedBytesBase64;
  if (typeof resolvedBase64 !== "string") return undefined;
  let resolvedValue: unknown;
  try {
    resolvedValue = JSON.parse(Buffer.from(resolvedBase64, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
  const resolved = validateTaskStateEvent(resolvedValue);
  if (!resolved.ok || resolved.event.kind !== "request.resolved") return undefined;
  const d3 = resolved.event;
  if (d3.by !== "customer" && d3.by !== "chief-delegated") return undefined;
  const d3TargetRoleIds = d3.targetRoleIds, d3RosterVersion = d3.rosterVersion, d3RosterSha256 = d3.rosterSha256;
  if (!Array.isArray(d3TargetRoleIds) || d3TargetRoleIds.length === 0
      || typeof d3RosterVersion !== "number" || !Number.isSafeInteger(d3RosterVersion) || d3RosterVersion < 1
      || typeof d3RosterSha256 !== "string") return undefined;
  if ((d3.by === "customer" ? d3.decisionId : d3.requestId) !== input.d3DecisionId) return undefined;
  return {
    stage: "role-documents",
    flowId: input.flowId,
    rosterFound: true,
    rosterVersion: roster.roster.version,
    rosterSha256: evidence.rosterRef.sha256,
    rosterRoleIds: rosterRoleIds(roster.roster),
    rosterEnvBootstrapOmitted: roster.roster.envBootstrap?.omitted === true,
    rosterContainsBuiltInRoleIds: rosterContainsBuiltInRoleIds(roster.roster),
    targetRoleId: input.targetRoleId,
    targetIsBuiltIn: isBuiltInGovernanceRoleId(input.targetRoleId),
    d3Present: true,
    d3By: d3.by,
    d3TargetRoleIds: [...d3TargetRoleIds],
    d3RosterVersion,
    d3RosterSha256,
    d3DecisionId: input.d3DecisionId,
    operationId: input.operationId,
    planCompleted: true,
    planRoleIds,
    cardPath: value.role.cardPath,
    cardSha256: evidence.cardRef.sha256,
    boundaryMdPath: value.role.boundaryMdPath,
    boundaryMdSha256: evidence.boundaryMdRef.sha256,
    boundaryYamlPath: value.role.boundaryYamlPath,
    boundaryYamlSha256: evidence.boundaryYamlRef.sha256,
    boundaryWithinRoleModules: true,
    boundaryMdYamlSynchronized: true,
    roleCardRequiredSections: true,
  };
}

/** Direct capabilities bind identity once from the host session, never from tool arguments. */
export function createDirectRoleRuntime(input: { projectRoot: string; actorRoleId: string; notifyDirect?: DirectNotificationSink }): { selectRunChange: SelectRunChangeFn; completeTeamPlan: (...args: Parameters<CompleteTeamPlanFn>) => Promise<CompletedTeamPlanReceipt>; closeCreatedTask: CloseCreatedTaskFn; activateRoleDocuments: ActivateRoleDocumentsFn } {
  const service = createTrunkService({ projectRoot: input.projectRoot });
  async function notify(receipt: DirectActionReceipt): Promise<Extract<DirectActionReceipt, { status: "committed-pending-recovery" }> | undefined> {
    if (receipt.status === "no-op" || !(receipt.ok || receipt.status === "committed-pending-recovery") || receipt.source?.kind !== "role-direct") return;
    const source = receipt.source;
    // A stored run-change receipt is a real recovery record, just as an operation journal or closed event is.
    const { applicationId, journalId, targetDigest } = receipt;
    if (!applicationId || !journalId || !targetDigest) return;
    try {
      for (const recipientRoleId of new Set(["chief", "convener", input.actorRoleId])) {
        const key = `${receipt.operationId}:${targetDigest}:${source.action}:${recipientRoleId}`;
        if (await service.directDeliveryRecorded(key)) continue;
        if (!input.notifyDirect) throw new Error("Idempotent direct notification sink is unavailable");
        await input.notifyDirect({ key, recipientRoleId, source, message: `${source.action} ${receipt.operationId} ${receipt.status}; ${targetDigest}` });
        const recorded = await service.recordDirectDelivery(key);
        if (!recorded.ok) throw new Error(recorded.reason);
      }
    } catch (error) {
      return { ...receipt, ok: false, status: "committed-pending-recovery", applicationId, journalId, targetDigest,
        errorCode: "direct-notifications-pending", message: String(error) };
    }
  }
  return { async activateRoleDocuments(request, signal) {
    const rejected = (message: string) => ({ ok: false as const, status: "rejected" as const, operationId: request.operationId, baseDigest: null, targetDigest: null, errorCode: "activation-not-ready", message });
    if (signal?.aborted) return rejected("The turn was cancelled before invocation");
    const prepared = await service.prepareRoleActivation(request, input.actorRoleId);
    if (!prepared.ok) return rejected(prepared.message ?? prepared.code);
    const value = prepared.value, validated = validateRoleDocumentsSnapshot({ snapshot: value.snapshot, roles: [value.role] });
    if (!validated.ok) return rejected(validated.message);
    const yaml = value.snapshot.files.find(file => file.path === value.evidence.boundaryYamlRef.path);
    if (!yaml) return rejected("Actual boundary bytes are missing");
    const boundary = validateBoundaryYamlText(Buffer.from(yaml.bytesBase64, "base64").toString("utf8"));
    if (!boundary.ok) return rejected(boundary.message);
    // X-R3（E2 S4）：三文档激活的角色侧前置——在既有 G 校验（validateRoleDocumentsSnapshot /
    // validateBoundaryYamlText）之后调用 nominator 模块 preflight。事实取自已校验的不可变 snapshot；
    // allow 不替代 Service 最终校验（D3 账本/计划完成证据/三文档字节 hash/CAS 均保留在 prepare 与
    // activateRoleDocumentsInternal 中）。deny 映射既有 `activation-not-ready` 回执。
    const preflight = builtInRoleModuleOf("nominator")?.preflight;
    if (preflight !== undefined) {
      const facts = nominatorRoleDocumentsFacts(value);
      if (facts !== undefined) {
        const decision = preflight.checkAction({ action: "appointment", facts });
        if (!decision.allow) return rejected(`Activation premise was refused by the nominator role policy (${decision.code})`);
      }
    }
    const protection = await readGitProtectionFacts(input.projectRoot);
    const receipt = protection.identity ? await executeGitActiveRolePublication({ projectRoot: input.projectRoot, activation: value, checks: validated.roleDocumentChecks, boundaryEntries: boundary.entries, actorRoleId: input.actorRoleId }) : await service.activateRoleDocuments(value, validated.roleDocumentChecks, boundary.entries);
    const pending = await notify(receipt); return pending ? { ...receipt, ...pending } : receipt;
  }, closeCreatedTask: async (request, signal) => {
    if (signal?.aborted) return { ok: false, status: "rejected", operationId: request.operationId, taskId: request.taskId, baseDigest: request.basisDigest,
      targetDigest: null, errorCode: "task-close-cancelled", message: "The turn was cancelled before invocation" };
    // A task lifecycle receipt belongs to its actual creator/caller and persisted UI task state.
    // It is not a document/permission effect and must not start unrelated model turns.
    return service.closeCreatedTask(request, input.actorRoleId);
  }, completeTeamPlan: async (request, signal) => {
    if (signal?.aborted) return { ok: false, status: "rejected", operationId: request.operationId, baseDigest: request.baseDigest,
      targetDigest: null, errorCode: "plan-cancelled", message: "The turn was cancelled before invocation" };
    // X-R4（E2 S4）：team-plan 角色侧前置——在 abort 之后、Git/Service 最终校验之前调用 convener 模块
    // （事实 = 本层将提交的 input 逐字段投影；api-spec §5.1 登记键）。deny 映射迁移前 Service 首检码
    // （`plan-path-invalid` / `plan-identity-invalid`），不触达 Service/Git；allow 不替代 Service 的
    // flow/baseDigest/字节哈希/roster/modules/结构/DAG 校验与 CAS 提交点。
    if (input.actorRoleId === "convener") {
      const preflight = builtInRoleModuleOf("convener")?.preflight;
      if (preflight !== undefined) {
        const decision = preflight.checkAction({ action: "team-plan", facts: convenerTeamPlanFacts(request) });
        if (!decision.allow) {
          const rejection = convenerTeamPlanRejection(decision);
          return { ok: false, status: "rejected", operationId: request.operationId, baseDigest: request.baseDigest,
            targetDigest: null, errorCode: rejection.errorCode, message: rejection.message };
        }
      }
    }
    const protection = await readGitProtectionFacts(input.projectRoot);
    const receipt = protection.identity ? await executeGitTeamPlanPublication({ projectRoot: input.projectRoot, request, actorRoleId: input.actorRoleId }) : await service.completeTeamPlan(request, input.actorRoleId);
    const pending = await notify(receipt); return pending ? { ...receipt, ...pending } : receipt;
  }, selectRunChange: async (request, signal) => {
    if (signal?.aborted) return { ok: false, status: "rejected", operationId: request.operationId, baseDigest: request.expectedPinDigest,
      targetDigest: null, errorCode: "run-change-cancelled", message: "The turn was cancelled before invocation" };
    // X-R2（E2 S4/R-4）：角色侧前置——在既有 abort 检查之后、Service 最终校验之前调用；位置与
    // `service.selectRunChange` 之前的事实齐备点一致。allow 只表示角色侧策略不反对，**不是停稳证明**：
    // stop/stop-and-restart 仍由 Service 返回既有 `blocked(run-stop-unverified)`，continue-frozen 的
    // pin/目标一致性与 CAS 仍由 Service 校验。deny 映射既有回执码/文案（迁移前首检语义）。
    const preflight = builtInRoleModuleOf("rapporteur")?.preflight;
    if (preflight !== undefined) {
      const decision = preflight.checkAction({ action: "run-change", facts: rapporteurRunChangeFacts(input.actorRoleId, request) });
      if (!decision.allow) {
        const rejection = rapporteurRunChangeRejection(decision, "direct");
        return { ok: false, status: "rejected", operationId: request.operationId, runId: request.runId,
          baseDigest: request.expectedPinDigest, targetDigest: null, errorCode: rejection.errorCode, message: rejection.message };
      }
    }
    const receipt = await service.selectRunChange(request, input.actorRoleId);
    const pending = await notify(receipt); return pending ? { ...receipt, ...pending } : receipt;
  } };
}

export interface RunChangeHostPlan {
  planId: string; operationId: string; projectRoot: string; runId: string; flowId: string; requestDigest: string;
  requesterTaskId: string; requesterCoreSessionId: string; requesterTurnId: string; deferred: boolean;
  taskIds: readonly string[]; replacementRunId?: string;
  // Q8/I0-5：native instance 为可选证据（Claude/Pi 运行成员也可停止）；present-but-changed 在 finalize 拒绝。
  handles: readonly { hostHandleId: string; coreSessionId: string; nativeInstanceId?: string; roleId: string; taskId: string }[];
}
const runChangePreparations = new Map<string, { plan: RunChangeHostPlan; service: ReturnType<typeof createTrunkService>;
  prepared: import("../../service/trunk/public/trunk-service.ts").PreparedRunChange; rootsDigest: string; parentCoreSessionId: string }>();

/** Only a real assigned rapporteur invocation prepares the exact stop set. W performs its own host effects after this returns. */
export async function prepareRunChange(input: { projectRoot: string; request: import("../../model/runtime.ts").SelectRunChangeInput; requesterTaskId: string; replacementRunId?: string }) {
  const reject = (code: string, message: string) => ({ ok: false as const, code, message });
  const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory;
  const actors = inventory?.sessions.filter(row => row.phase === "live" && row.taskId === input.requesterTaskId && row.roleId === "rapporteur" && row.coreSessionId) ?? [];
  if (actors.length !== 1) return reject("run-change-actor-unproven", "One actual assigned rapporteur controller is required");
  const actorId = actors[0]!.coreSessionId!, actual = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: actorId });
  if (!actual || actual.roleKind !== "built-in-governance" || actual.roleId !== "rapporteur" || actual.construction !== "default-core" || actual.disposed
    || actual.lifecycle?.stopRequested || !actual.lifecycle?.turnId || !actual.lifecycle.activeTools.some(tool => ["select_run_change", "ans_select_run_change"].includes(tool.name)))
    return reject("run-change-actor-unproven", "The real current built-in rapporteur select_run_change invocation is required");
  // X-R2（E2 S4）：host stop/restart 请求的角色侧前置——在真实 actor 已证明（身份即 rapporteur）、
  // 请求事实齐备处调用；仍未提交任何效果。allow 不等于停稳：prepare/finalize 的 host 两阶段与
  // Service 停稳/队列/边界校验、`run-stop-unverified` 语义逐字保留。deny 映射迁移前 Service 首检回执。
  const preflight = builtInRoleModuleOf("rapporteur")?.preflight;
  if (preflight !== undefined) {
    const decision = preflight.checkAction({ action: "run-change", facts: rapporteurRunChangeFacts("rapporteur", input.request) });
    if (!decision.allow) {
      const rejection = rapporteurRunChangeRejection(decision, "host");
      return reject(rejection.errorCode, rejection.message);
    }
  }
  const service = createTrunkService({ projectRoot: input.projectRoot });
  const prepared = await service.prepareRunChange({ request: input.request, actorRoleId: "rapporteur", taskId: input.requesterTaskId, ...(input.replacementRunId ? { replacementRunId: input.replacementRunId } : {}) });
  if (!prepared.ok) return reject(prepared.code, prepared.message ?? prepared.code);
  if (prepared.value.replacement) {
    const checked = validateRoleDocumentsSnapshot({ snapshot: prepared.value.replacement.snapshot, roles: prepared.value.replacement.roles });
    if (!checked.ok) return reject("run-change-target-invalid", checked.message);
  }
  const initialized = await readGitInitializationTaskBasis(input.projectRoot, { flowId: prepared.value.old.flowId });
  if (!initialized.ok) return reject("run-change-root-source-unproven", initialized.message ?? initialized.reason);
  if (!prepared.value.processSource) return reject("run-change-current-source-unproven", "The actual requester has no immutable current-action Chief process source");
  // prepareRunChange 不是 Git mutation：真实 active rapporteur 的 `select_run_change` 调用即动作来源（身份 fail-closed；不要求 Git 工具）。
  const closure = await inspectGitActionAuthorization({ projectRoot: input.projectRoot, taskId: input.requesterTaskId,
    parentCoreSessionId: prepared.value.processSource.parentCoreSessionId, expectedActor: { roleId: "rapporteur", coreSessionId: actorId },
    expectedTool: "select_run_change", authorizationMode: "active-tool" });
  if (!closure.ok) return reject(closure.code, closure.message);
  const current = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory;
  const ids = new Set(prepared.value.taskIds), members = current?.sessions.filter(row => row.taskId && ids.has(row.taskId)) ?? [];
  if (!members.length || current?.sessions.some(row => row.runId === input.request.runId && !row.taskId)) return reject("run-stop-members-unproven", "The actual stopped run needs its complete task-bound instance set");
  const handles: RunChangeHostPlan["handles"][number][] = [];
  for (const member of members) {
    if (!member.coreSessionId || !member.taskId || !["live", "disposed"].includes(member.phase)) return reject("run-stop-members-unproven", "An actual run member is still constructing or has unknown effects");
    const fact = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: member.coreSessionId });
    const native = fact?.lifecycle?.native;
    // C1：成员身份 = 真实 default Core session + 可选 native instance（不再要求 codex/native；Claude/Pi 运行成员可停止）。
    if (!fact || fact.construction !== "default-core" || fact.roleId !== member.roleId || fact.runtime !== member.runtime
      || (native !== undefined && native.roleId !== member.roleId))
      return reject("run-stop-member-lifecycle-unproven", "This run member lacks an actual default Core instance");
    handles.push({ hostHandleId: member.hostHandleId, coreSessionId: member.coreSessionId, ...(native ? { nativeInstanceId: native.instanceId } : {}), roleId: member.roleId, taskId: member.taskId });
  }
  const freshActor = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: actorId });
  if (freshActor?.lifecycle?.turnId !== actual.lifecycle.turnId || freshActor.disposed || freshActor.lifecycle.stopRequested
    || !freshActor.lifecycle.activeTools.some(tool => ["select_run_change", "ans_select_run_change"].includes(tool.name))) return reject("run-change-actor-changed", "The actual requesting invocation changed during preparation");
  const plan: RunChangeHostPlan = { planId: randomUUID(), operationId: input.request.operationId, projectRoot: input.projectRoot, runId: input.request.runId,
    flowId: prepared.value.old.flowId, requestDigest: prepared.value.requestDigest, requesterTaskId: input.requesterTaskId, requesterCoreSessionId: actorId,
    requesterTurnId: actual.lifecycle.turnId, deferred: handles.some(row => row.coreSessionId === actorId), taskIds: [...prepared.value.taskIds], handles,
    ...(input.replacementRunId ? { replacementRunId: input.replacementRunId } : {}) };
  runChangePreparations.set(plan.planId, { plan: structuredClone(plan), service, prepared: prepared.value, rootsDigest: closure.rootsDigest, parentCoreSessionId: prepared.value.processSource.parentCoreSessionId });
  return { ok: true as const, value: structuredClone(plan) };
}

/** No supplied lifecycle boolean is accepted: re-read actual W publication and our private constructed instances. */
export async function finalizeRunChange(input: { projectRoot: string; planId: string; requestDigest: string }, signal?: AbortSignal): Promise<import("../../model/runtime.ts").SelectRunChangeResult> {
  const held = runChangePreparations.get(input.planId), request = held?.prepared.request;
  const blocked = (code: string, message: string): import("../../model/runtime.ts").SelectRunChangeResult => ({ ok: false, status: "blocked", operationId: request?.operationId ?? "unbound-run-change",
    runId: request?.runId, baseDigest: request?.expectedPinDigest ?? null, targetDigest: null, errorCode: code, message });
  if (!held || path.resolve(input.projectRoot) !== path.resolve(held.plan.projectRoot) || input.requestDigest !== held.plan.requestDigest) return blocked("run-preparation-invalid", "The actual unchanged host preparation is required");
  if (signal?.aborted) return blocked("run-change-cancelled", "The host continuation was cancelled");
  const snapshot = inspectGitHostCoordinator({ projectRoot: input.projectRoot }), inventory = snapshot.inventory;
  if (!inventory || inventory.pendingOpens.length) return blocked("run-stop-host-unknown", "Actual pending opens remain unproven");
  const stops = inventory.runStops?.filter(row => row.operationId === held.plan.operationId && row.runId === held.plan.runId && row.requestDigest === held.plan.requestDigest) ?? [];
  const covered = stops.flatMap(row => [...row.hostHandleIds]);
  if (!stops.length || new Set(covered).size !== covered.length || covered.length !== held.plan.handles.length
    || held.plan.handles.some(row => !covered.includes(row.hostHandleId))) return blocked("run-stop-host-fence-unproven", "The actual host producer fence does not cover this exact stopped instance set");
  for (const stop of stops) {
    const persistence = inventory.deliveryQueuePersistence?.filter(row => row.managerId === stop.managerId) ?? [];
    if (stop.state !== "fenced" || !Number.isSafeInteger(stop.generation) || stop.generation < 1 || persistence.length !== 1) return blocked("run-stop-host-fence-unproven", "A fresh exact manager fence is required");
    const fact = persistence[0]!;
    if (!fact.armed || fact.enqueuedSeq !== stop.targetSeq || fact.completedSeq !== stop.targetSeq || fact.committedSeq !== stop.targetSeq || fact.pending !== 0
      || Object.values(fact.knownProducers).some(count => count !== 0)) return blocked("run-stop-persistence-unproven", "Only an actually fenced producer set plus its completed committed current cutoff can finish a run stop");
  }
  const instances: import("../../model/runtime.ts").RuntimeSessionLifecycleFacts[] = [];
  for (const member of held.plan.handles) {
    const fact = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: member.coreSessionId });
    const live = inventory.sessions.find(row => row.hostHandleId === member.hostHandleId), native = fact?.lifecycle?.native;
    // C2/F12：终止证据=运行时中立 drain（native/processCoverage 仅证据）；native absent 允许、present-but-changed 拒绝。
    if (!fact || !live || live.coreSessionId !== member.coreSessionId || live.taskId !== member.taskId || live.roleId !== member.roleId
      || fact.construction !== "default-core" || (!fact.disposed && !fact.lifecycle?.stopRequested) || !fact.lifecycle || !isRuntimeSessionDrained(fact.lifecycle)
      || (native !== undefined && member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId || native.roleId !== member.roleId)))
      return blocked("run-stop-instance-unproven", "The same actual run instance has not reached a sealed drained terminal state (native coverage may be unknown)");
    instances.push(fact.lifecycle);
  }
  // I0-5/R6：gate 保持先于 host lease 的既有顺序；host-continuation 只做闭包（无 policy/sidecar/lease 判定）。
  const source: GitActionAuthorizationInput = { projectRoot: input.projectRoot, taskId: held.plan.requesterTaskId, parentCoreSessionId: held.parentCoreSessionId,
    expectedActor: { roleId: "rapporteur", coreSessionId: held.plan.requesterCoreSessionId }, authorizationMode: "host-continuation",
    hostContinuation: { requesterTurnId: held.plan.requesterTurnId, planId: held.plan.planId } };
  const closure = await inspectGitActionAuthorization(source); if (!closure.ok) return blocked(closure.code, closure.message);
  if (closure.rootsDigest !== held.rootsDigest || inspectGitHostCoordinator({ projectRoot: input.projectRoot }).coordinatorRevision !== snapshot.coordinatorRevision) return blocked("run-stop-source-stale", "Actual root/host evidence changed during final inspection");
  const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation", expectedCoordinatorRevision: snapshot.coordinatorRevision });
  if (!lease.ok) return blocked(lease.code, "A current host action prevents run transition commit");
  try {
    if (signal?.aborted) return blocked("run-change-cancelled", "The host continuation was cancelled before commit");
    const receipt = await held.service.commitPreparedRunChange(held.prepared, { hostLeaseId: lease.leaseId, coordinatorRevision: lease.coordinatorRevision, instances, hostStops: stops });
    if (receipt.ok) runChangePreparations.delete(input.planId);
    return receipt;
  } finally { endGitHostAction({ projectRoot: input.projectRoot, leaseId: lease.leaseId }); }
}

/** Ordinary bounded target identity, not a stop permit or a whole-run operation. No private authority map. */
export interface ControllerStopHostPlan {
  operationId: string; projectRoot: string; requestDigest: string;
  requesterCoreSessionId: string; requesterTurnId: string; inventoryRevision: string | number;
  scope: import("../../service/trunk/public/trunk-service.ts").ControllerStopScope;
  // Q8/I0-5：native instance 可选证据；present-but-changed 在 finalize 拒绝。
  handles: readonly { hostHandleId: string; coreSessionId: string; nativeInstanceId?: string; roleId: "convener"; taskId: string }[];
}
function isCurrentChiefStopCaller(input: { projectRoot: string; chiefCoreSessionId: string; chiefTurnId: string }): boolean {
  const actual = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: input.chiefCoreSessionId });
  return !!actual && actual.roleKind === "built-in-governance" && actual.roleId === "chief" && actual.construction === "default-core" && !actual.disposed
    && !actual.lifecycle?.stopRequested && actual.lifecycle?.turnId === input.chiefTurnId && actual.turnInput?.turnId === input.chiefTurnId
    && actual.lifecycle.activeTools.some(tool => ["terminate_role_run", "ans_terminate_role_run"].includes(tool.name));
}
const controllerStopDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function controllerStopRequestDigest(plan: Omit<ControllerStopHostPlan, "requestDigest" | "inventoryRevision">): string {
  return controllerStopDigest([plan.operationId, path.resolve(plan.projectRoot), plan.requesterCoreSessionId, plan.requesterTurnId, plan.scope, plan.handles]);
}

/** Current Chief invocation -> exact actual controller instances. W alone owns the handles and performs effects. */
export async function prepareControllerStop(input: { projectRoot: string; taskId: string; chiefCoreSessionId: string; chiefTurnId: string }) {
  const invalid = (code: string, message: string) => ({ ok: false as const, code, message });
  try {
    if (!input.taskId?.trim() || !input.chiefCoreSessionId?.trim() || !input.chiefTurnId?.trim() || !isCurrentChiefStopCaller(input))
      return invalid("controller-stop-caller-unproven", "The real current Chief terminate invocation and explicit task are required");
    const service = createTrunkService({ projectRoot: input.projectRoot }), prepared = await service.prepareControllerStop({ taskId: input.taskId, actorRoleId: "chief" });
    if (!prepared.ok) return invalid("controller-stop-source-unproven", prepared.message ?? prepared.code);
    const coordinator = inspectGitHostCoordinator({ projectRoot: input.projectRoot }), inventory = coordinator.inventory;
    if (!inventory || inventory.pendingOpens.length) return invalid("controller-stop-host-unknown", "Actual instance inventory/pending opens are not fully known");
    const members = inventory.sessions.filter(row => row.taskId === prepared.value.taskId);
    if (!members.length || members.some(row => row.roleId !== "convener" || row.runId !== prepared.value.runId || !row.coreSessionId || !["live", "disposed"].includes(row.phase))
      || new Set(members.map(row => row.hostHandleId)).size !== members.length || new Set(members.map(row => row.coreSessionId)).size !== members.length)
      return invalid("controller-stop-target-instance-unproven", "The exact controller has no complete unambiguous task-bound instance set");
    const handles: ControllerStopHostPlan["handles"][number][] = [];
    for (const member of members) {
      const actual = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: member.coreSessionId! }), native = actual?.lifecycle?.native;
      // C3：Core/role/task 身份保留；native 可选（不再要求 codex/native；present-but-changed 在 finalize 拒绝）。
      if (!actual || actual.roleId !== "convener" || actual.roleKind !== "built-in-governance" || actual.construction !== "default-core" || actual.runtime !== member.runtime
        || (native !== undefined && native.roleId !== "convener"))
        return invalid("controller-stop-target-instance-unproven", "Actual default Core identity is required");
      handles.push({ hostHandleId: member.hostHandleId, coreSessionId: member.coreSessionId!, ...(native ? { nativeInstanceId: native.instanceId } : {}), roleId: "convener", taskId: input.taskId });
    }
    handles.sort((a,b) => a.hostHandleId < b.hostHandleId ? -1 : a.hostHandleId > b.hostHandleId ? 1 : 0);
    if (!isCurrentChiefStopCaller(input) || inspectGitHostCoordinator({ projectRoot: input.projectRoot }).coordinatorRevision !== coordinator.coordinatorRevision)
      return invalid("controller-stop-source-stale", "Current Chief invocation or host instance inventory changed during preparation");
    const plan = { projectRoot: input.projectRoot, operationId: `controller-stop-${controllerStopDigest([path.resolve(input.projectRoot), input.taskId, input.chiefCoreSessionId, input.chiefTurnId])}`,
      requesterCoreSessionId: input.chiefCoreSessionId, requesterTurnId: input.chiefTurnId, inventoryRevision: inventory.revision, scope: prepared.value, handles };
    return { ok: true as const, value: { ...plan, requestDigest: controllerStopRequestDigest(plan) } };
  } catch(error) { return invalid("controller-stop-source-unavailable", String(error)); }
}

/** Actual W fenced cutoff and sealed same-instance terminal facts, then R9 target/source expectations. No report or run mutation. */
export async function finalizeControllerStop(input: { projectRoot: string; plan: ControllerStopHostPlan; hostLeaseId: string }, signal?: AbortSignal): Promise<
  ({ ok: true; taskId: string; flowId: string; runId: string; operationId: string } & import("../../model/runtime.ts").TerminateRoleRunReceipt) | { ok: false; code: string; message: string }> {
  const invalid = (code: string, message: string) => ({ ok: false as const, code, message });
  try {
    const plan = input.plan, caller = { projectRoot: input.projectRoot, chiefCoreSessionId: plan.requesterCoreSessionId, chiefTurnId: plan.requesterTurnId };
    if (signal?.aborted) return invalid("controller-stop-cancelled", "The actual invocation was cancelled");
    if (path.resolve(plan.projectRoot) !== path.resolve(input.projectRoot) || controllerStopRequestDigest(plan) !== plan.requestDigest || !plan.handles.length
      || plan.scope.actorRoleId !== "convener" || plan.scope.creatorRoleId !== "chief" || !isCurrentChiefStopCaller(caller))
      return invalid("controller-stop-source-unproven", "The unchanged target scope and actual current Chief invocation are required");
    if (!checkGitHostAction({ projectRoot: input.projectRoot, leaseId: input.hostLeaseId, kind: "session-dispose" }).ok)
      return invalid("controller-stop-host-lease-unproven", "The actual host disposal fence must remain owned through final inspection");
    const coordinator = inspectGitHostCoordinator({ projectRoot: input.projectRoot }), inventory = coordinator.inventory;
    if (!inventory || inventory.pendingOpens.length || inventory.revision === plan.inventoryRevision) return invalid("controller-stop-host-unknown", "A fresh post-stop inventory with no unknown opens is required");
    const members = inventory.sessions.filter(row => row.taskId === plan.scope.taskId);
    if (members.length !== plan.handles.length || members.some(row => !plan.handles.some(handle => handle.hostHandleId === row.hostHandleId && handle.coreSessionId === row.coreSessionId
      && handle.roleId === row.roleId && row.runId === plan.scope.runId))) return invalid("controller-stop-instance-set-changed", "The exact target instance set changed during stop");
    const stops = inventory.controllerStops?.filter(row => row.operationId === plan.operationId && row.taskId === plan.scope.taskId && row.runId === plan.scope.runId && row.requestDigest === plan.requestDigest) ?? [];
    const covered = stops.flatMap(row => [...row.hostHandleIds]);
    if (!stops.length || new Set(covered).size !== covered.length || covered.length !== plan.handles.length || plan.handles.some(row => !covered.includes(row.hostHandleId)))
      return invalid("controller-stop-host-fence-unproven", "The real host fence must cover exactly these target handles");
    for (const stop of stops) {
      const facts = inventory.deliveryQueuePersistence?.filter(row => row.managerId === stop.managerId) ?? [], fact = facts[0];
      if (stop.state !== "fenced" || !Number.isSafeInteger(stop.generation) || stop.generation < 1 || facts.length !== 1 || !fact?.armed
        || !Number.isSafeInteger(stop.targetSeq) || stop.targetSeq < 0 || fact.enqueuedSeq !== stop.targetSeq || fact.completedSeq !== stop.targetSeq || fact.committedSeq !== stop.targetSeq || fact.pending !== 0
        || !stop.knownProducers || Object.keys(stop.knownProducers).length !== 3 || Object.values(stop.knownProducers).some(count => count !== 0))
        return invalid("controller-stop-cutoff-unproven", "The exact target producers and the current committed bounded queue cutoff are not drained");
    }
    const processes = new Map<string, import("../../model/runtime.ts").RuntimeOwnedProcessFact>();
    for (const member of plan.handles) {
      const actual = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: member.coreSessionId }), fact = actual?.lifecycle, native = fact?.native;
      // C4：terminal 用运行时中立 drain（native/processCoverage 仅证据）；native absent 允许、present-but-changed 拒绝。
      if (!actual || actual.roleKind !== "built-in-governance" || actual.roleId !== "convener" || actual.construction !== "default-core"
        || (!actual.disposed && !fact?.stopRequested) || !fact || fact.sessionId !== member.coreSessionId || !isRuntimeSessionDrained(fact)
        || (native !== undefined && member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId || native.roleId !== "convener")))
        return invalid("controller-stop-terminal-unproven", "The original Core instance has not reached drained terminal facts (native coverage may be unknown)");
      for (const process of [...fact.processes, ...(native?.processes ?? [])]) processes.set(`${member.coreSessionId}:${process.id}`, process);
    }
    const source = await createTrunkService({ projectRoot: input.projectRoot }).confirmControllerStop(plan.scope);
    if (!source.ok) return invalid("controller-stop-source-stale", source.message ?? source.code);
    if (signal?.aborted || !isCurrentChiefStopCaller(caller) || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: input.hostLeaseId, kind: "session-dispose" }).ok
      || inspectGitHostCoordinator({ projectRoot: input.projectRoot }).coordinatorRevision !== coordinator.coordinatorRevision)
      return invalid("controller-stop-source-stale", "Current caller/host fence changed during the R9 source observation");
    return { ok: true, terminationConfirmed: true, taskId: plan.scope.taskId, flowId: plan.scope.flowId, runId: plan.scope.runId, operationId: plan.operationId,
      childProcesses: processes.size, childProcessesStopped: processes.size, message: "The exact controller instances stopped; this does not close tasks, cancel the run, approve quality or authorize publication." };
  } catch(error) { return invalid("controller-stop-inspection-unavailable", String(error)); }
}

/** Prepare the existing G/openRoleSession context from the actual run's byte-verified pin. */
export async function readRunRoleContext(input: { projectRoot: string; runId: string; roleId: string }): Promise<
  { ok: true; documentContext: NonNullable<ProjectConfig["documentContext"]> } | { ok: false; code: string; message: string }> {
  const basis = await createTrunkService({ projectRoot: input.projectRoot }).readRunEvidence(input.runId);
  if (!basis.ok) return { ok: false, code: basis.code, message: basis.message ?? basis.code };
  const evidence = basis.value.frozenRoles[input.roleId];
  if (!evidence) return { ok: false, code: "run-role-unavailable", message: "Role is not in this actual run's frozen roster" };
  return { ok: true, documentContext: { runId: input.runId, pinDigest: basis.value.pinDigest, frozenRoleEvidence: evidence } };
}

/** The creator obtains this real report/run/basis reference in the normal handback path. */
export async function prepareCreatedTaskClose(input: { projectRoot: string; actorRoleId: string; taskId: string }) {
  const result = await createTrunkService({ projectRoot: input.projectRoot }).prepareCreatedTaskClose(input.taskId, input.actorRoleId);
  return result.ok ? { ok: true as const, ...result.value } : { ok: false as const, message: result.message ?? result.code };
}
export async function prepareAssignedTaskWriteScope(input: { projectRoot: string; actorRoleId: string; taskId: string }) {
  return createTrunkService({ projectRoot: input.projectRoot }).prepareAssignedTaskWriteScope(input);
}
/** Fresh observation before admission; it is not a Git mutation permit or a replacement for the actual child task. */
export async function inspectAssignedTask(input: { projectRoot: string; actorRoleId: string; taskId: string }) {
  return createTrunkService({ projectRoot: input.projectRoot }).inspectAssignedTask(input);
}
/** Resolve only this actual dispatch or persisted child report; never the latest task for a role. */
export async function resolveDeliveryAssignment(input: { projectRoot: string } & import("../../service/trunk/public/trunk-service.ts").DeliveryAssignmentInput) {
  return createTrunkService({ projectRoot: input.projectRoot }).resolveDeliveryAssignment(input);
}
/** Exact host receipt lookup only: information-only means no assigned task may be reopened from this notice. */
export async function classifyClosedTaskNotice(input: { projectRoot: string; recipientRoleId: string; boundTaskId: string; operationId: string; source: DirectActionSource }) {
  return createTrunkService({ projectRoot: input.projectRoot }).classifyClosedTaskNotice(input);
}
/** Actual baseline facts for dispatch/advisory composition, not a task admission or write permit. */
export async function collectDispatchBaselineFacts(input: { projectRoot: string }) {
  const baselineViolations = await verifyVersionedDocuments({ projectRoot: input.projectRoot });
  return { status: baselineViolations.length ? "violations" as const : "clean" as const, baselineViolations };
}
/** The actual running convener delivery supplies its task/flow/run; never a model-projected parent. */
export async function prepareParentTaskRef(input: { projectRoot: string; actorRoleId: "convener"; taskId: string; flowId: string; runId: string }) {
  return createTrunkService({ projectRoot: input.projectRoot }).prepareParentTaskRef(input);
}

/** Trusted host observation only; never register as a model tool. task.closed uses the creator command. */
export async function recordTaskObservation(input: { projectRoot: string; event: TaskStateEvent }): Promise<import("../../service/trunk/public/trunk-service.ts").TaskObservationResult> {
  return createTrunkService({ projectRoot: input.projectRoot }).recordTaskObservation(input.event);
}

/** Trusted dispatch/handoff preparation. New runs never obtain missing bytes from live role files. */
export async function freezeExecutionRun(input: { projectRoot: string; runId: string; flowId: string; operationId: string }) {
  const service = createTrunkService({ projectRoot: input.projectRoot });
  const prepared = await service.prepareExecutionRun(input);
  if (!prepared.ok) return { ok: false as const, stage: "prepare" as const, code: prepared.code, message: prepared.message ?? prepared.code };
  const validated = validateRoleDocumentsSnapshot({ snapshot: prepared.value.snapshot, roles: prepared.value.roles });
  if (!validated.ok) return { ok: false as const, stage: "role-documents" as const, code: "run-role-documents-invalid", message: validated.message };
  const pinned = await service.pinExecutionRun(prepared.value, validated.roleDocumentChecks);
  if (!pinned.ok) return { ok: false as const, stage: "pin" as const, code: pinned.code, message: pinned.message ?? pinned.code };
  return { ok: true as const, runId: pinned.value.runId, pinDigest: pinned.value.pinDigest, run: pinned.value.run,
    snapshotRef: { snapshotId: pinned.value.snapshot.snapshotId, digest: pinned.value.snapshot.digest }, frozenRoles: pinned.value.frozenRoles };
}

/**
 * 唯一生产调用为 chief→convener controller resume（`hub: true` 保持其 creatorReports 分支旧行为）。
 * 每次调用都重新读取当刻证据（三次复检），判定本身只走 `evaluateChiefDispatchParent`。
 */
function currentChiefResumeSource(projectRoot: string, context: RepositoryInitializationContext): boolean {
  if (!context) return false;
  const core = inspectManagedRoleSessionEvidence({ projectRoot: projectRoot, sessionId: context.parent.sessionId });
  return evaluateChiefDispatchParent({ host: context, core, hub: true }).ok;
}

// Only an actual Chief dispatch accepted by this Pipeline can enter its delayed host queue path.
const acceptedControllerResumes = new Map<string, { tuple: string; basisDigest: string }>();
function controllerResumeTuple(value: import("../../model/runtime.ts").DispatchTaskResumeController): string | undefined {
  return isDispatchTaskResumeController(value) ? JSON.stringify([value.taskId, value.flowId, value.runId, value.reviewTaskId, value.reviewCloseOperationId]) : undefined;
}
function controllerResumeQueueKey(projectRoot: string, resumeKey: string): string { return JSON.stringify([path.resolve(projectRoot), resumeKey]); }
export async function inspectQueuedControllerResume(input: { projectRoot: string; resumeController: import("../../model/runtime.ts").DispatchTaskResumeController; resumeKey: string; basisDigest: string }) {
  const invalid = () => ({ ok: false as const, code: "controller-resume-queue-source-unproven", message: "No matching actual Chief-accepted resume source, or its current controller/review basis changed" });
  const key = controllerResumeQueueKey(input.projectRoot, input.resumeKey), accepted = acceptedControllerResumes.get(key);
  if (!accepted || accepted.tuple !== controllerResumeTuple(input.resumeController) || accepted.basisDigest !== input.basisDigest) return invalid();
  const result = await createTrunkService({ projectRoot: input.projectRoot }).inspectQueuedControllerResume(input);
  if (acceptedControllerResumes.get(key) !== accepted) return invalid();
  return result.ok && result.value.resumeKey === input.resumeKey && result.value.basisDigest === accepted.basisDigest ? result : result.ok ? invalid() : result;
}

/** Explicit Chief continuation of an existing controller after actual accepted final review. */
export async function prepareControllerResume(input: { projectRoot: string; resumeController: import("../../model/runtime.ts").DispatchTaskResumeController;
  hostInitialization: RepositoryInitializationContext }) {
  const invalid = () => ({ ok: false as const, code: "trunk-verify-failed" as const, message: "Resume is not bound to the actual current Chief dispatch input" });
  if (!currentChiefResumeSource(input.projectRoot, input.hostInitialization)) return invalid();
  const listing = await listProject(input.projectRoot);
  if (!listing.roles.some(role => role.roleId === "convener" && role.builtIn === true) || !currentChiefResumeSource(input.projectRoot, input.hostInitialization)) return invalid();
  const prepared = await createTrunkService({ projectRoot: input.projectRoot }).prepareControllerResume(input);
  if (!currentChiefResumeSource(input.projectRoot, input.hostInitialization)) return invalid();
  if (prepared.ok) {
    const tuple = controllerResumeTuple(input.resumeController); if (!tuple) return invalid();
    acceptedControllerResumes.set(controllerResumeQueueKey(input.projectRoot, prepared.value.resumeKey), { tuple, basisDigest: prepared.value.basisDigest });
  }
  return prepared;
}

/** Formal route preflight: planning needs real documents; execution uses only its immutable run authorization. */
export async function prepareRoleDispatch(input: { projectRoot: string; fromRoleId: string; targetRoleId: string; flowId: string; runId?: string; moduleId?: string;
  parentTaskId?: string; reviewTarget?: import("../../model/runtime.ts").DispatchTaskReviewTarget; hostInitialization?: RepositoryInitializationContext }) {
  // X-R4（E2 S3/数据消费）：convener 来源的内置目标集合改读角色模块纯数据
  // （`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds`；迁移前字面量 `"verifier"`，等价）。
  // 其余 hub/文档/协调/role-preparation 路由与 run/module/D3 校验逐字保留。
  // X-R5（verifier）核对：本文件**无**可替换的 verifier 角色策略条件——convener review 路由已是
  // 来源模块数据（X-R4）；`hub` 目标列表属 chief 来源路由（X-R6 已切换为模块数据）；`:162` 的 verifier
  // 条件是 Git review 证据的 actor 证明（Service 证据核验，保留）。verifier 模块 `dispatch()` 为
  // diff-only（E2 评审 X-2/X-4），不进入本生产路由。
  // X-R6（E2 S2）：chief 来源与 hub 目标集合改读 `CHIEF_HUB_DISPATCH`（纯数据；迁移前同值字面量）。
  // documents/coordination/rolePreparation 的具体目标映射属引擎路由（R-2：模块只提供五目标集合，
  // 不提供 purpose→target 映射），保留字面量并逐字不变。
  const review = input.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget(input.targetRoleId);
  const documents = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && ["product", "rapporteur"].includes(input.targetRoleId);
  const coordination = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && input.targetRoleId === "convener";
  const rolePreparation = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && input.targetRoleId === "nominator";
  const hub = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId
    && CHIEF_HUB_DISPATCH.targetRoleIds.some((roleId) => roleId === input.targetRoleId);
  if (hub) {
    if (!input.hostInitialization) return { ok: false as const, code: "trunk-verify-failed" as const, message: "Document preparation needs the actual registered project and current chief work source" };
    const listing = await listProject(input.projectRoot);
    if (!listing.roles.some(role => role.roleId === input.targetRoleId && role.builtIn === true)) return { ok: false as const, code: "trunk-verify-failed" as const, message: "The actual registered professional document role is required" };
  }
  const reviewActorCurrent = () => {
    if (!input.parentTaskId) return false;
    const inventory = inspectGitHostCoordinator({ projectRoot: input.projectRoot }).inventory;
    const actors = inventory?.sessions.filter(session => session.phase === "live" && session.taskId === input.parentTaskId && session.roleId === "convener" && session.coreSessionId) ?? [];
    if (actors.length !== 1) return false;
    const actual = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: actors[0]!.coreSessionId! });
    return actual?.construction === "default-core" && actual.roleKind === "built-in-governance" && actual.roleId === "convener" && !actual.disposed
      && !actual.lifecycle?.stopRequested && actual.lifecycle?.activeTools.some(tool => ["dispatch_task", "ans_dispatch_task"].includes(tool.name)) === true;
  };
  if (review) {
    if (!reviewActorCurrent()) return { ok: false as const, code: "review-controller-unproven", message: "The real current assigned built-in convener dispatch invocation is required" };
    const listing = await listProject(input.projectRoot);
    if (!listing.roles.some(role => role.roleId === input.targetRoleId && role.builtIn === true) || !reviewActorCurrent())
      return { ok: false as const, code: "review-target-unproven", message: "The actual registered built-in verifier and current controller source are required" };
  }
  const validParent = () => {
    const context = input.hostInitialization; if (!context) return true;
    const core = inspectManagedRoleSessionEvidence({ projectRoot: input.projectRoot, sessionId: context.parent.sessionId });
    return evaluateChiefDispatchParent({ host: context, core, hub }).ok;
  };
  const staleParent = () => ({ ok: false as const, code: "trunk-verify-failed" as const, message: "Repository initialization parent is not the actual active accepted chief dispatch turn" });
  if (!validParent()) return staleParent();
  const result = await createTrunkService({ projectRoot: input.projectRoot }).prepareRoleDispatch({ ...input, ...(hub ? { hubRouting: CHIEF_HUB_DISPATCH.routing } : {}) });
  if (review && !reviewActorCurrent()) return { ok: false as const, code: "review-controller-changed", message: "The actual controller changed while preparing review material" };
  return validParent() ? result : staleParent();
}

/** S3 `repinPinnedRun` 的 `RunRepinPort` 生产适配（同 runId；`repins` 追加；内容 hash 磁盘重算）。 */
export function createRunRepinPort(projectRoot: string): RunRepinPort {
  return {
    async repin(input) {
      const result = await repinPinnedRun(projectRoot, input.runId, {
        targets: input.targets,
        applicationId: input.applicationId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        at: input.at,
      });
      return result.ok
        ? { ok: true, alreadyApplied: result.alreadyApplied }
        : { ok: false, code: result.code, message: result.reason };
    },
  };
}

export interface TrunkRuntimeDeps {
  projectRoot: string;
  service: TrunkService;
  /** task-state 事件写入（生产 `appendTaskEvent(projectRoot, event)`；测试 fake）。 */
  emitEvent: (event: TaskStateEvent) => Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Pipeline 结果（失败码 = C1 `TRUNK_ERROR_CODES` / VCA 错误码；不新造同义码）。 */
export type TrunkRuntimeResult<T> = TrunkServiceResult<T>;

export interface TrunkMainUpgradeInput {
  /** 仅紧急/恢复；常规 stable 走 stable-write 确认即写。 */
  reason: "emergency" | "recovery";
  /** 客户 decisionId（客户本人；不进入判断器/委托/指令）。 */
  decisionId: string;
  /** 高危二次确认（必须显式 acknowledged:true）。 */
  highRisk: { acknowledged: true; items?: string[] };
  flowId: string;
  runId: string | null;
  target: TrunkApplySnapshot;
  journalId?: string;
  at: string;
}

export interface TrunkBootstrapInput {
  flowId: string;
  runId: string | null;
  applicationId: string;
  decisionId?: string;
  target: TrunkApplySnapshot;
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  /** 有 pinned run 时把基线回绑到 t1 内容（VCA bootstrap apply；无 run 不提供）。 */
  repin?: NonNullable<TrunkApplyInput["repin"]>;
  journalId?: string;
  at: string;
}

export interface TrunkStableRepinInput {
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  /** 写入前 hash（"" = 写入前文件不存在）。 */
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  at: string;
}

export interface TrunkStableRepinResult {
  applied: boolean;
  pendingReattach?: boolean;
  audit?: StableRepinAuditPayload;
  errorCode?: string;
  message?: string;
}

export interface TrunkRuntime {
  status(): Promise<TrunkStatusView>;
  /** 打开面板/启动对账：内容已过提交点且事件缺失时补写 `trunk.state`（幂等载荷）。 */
  reconcile(): Promise<TrunkServiceResult<ReconcileResult>>;
  bootstrap(input: TrunkBootstrapInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  /** VCA upgrade/detail apply（调用方已冻结/逐项确认；提交点由 S2 保证）。 */
  applyApproved(input: TrunkApplyInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  mainUpgrade(input: TrunkMainUpgradeInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  recover(input: TrunkRecoveryInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  completeStableWrite(input: TrunkStableRepinInput): Promise<TrunkStableRepinResult>;
}

function auditToEvent(payload: {
  kind: "trunk.state";
  at: string;
}): TaskStateEvent {
  return { v: 1, ...payload } as TaskStateEvent;
}

function documentsSnapshot(manifest: TrunkManifest): Record<string, { path: string; sha256: string }> {
  const out: Record<string, { path: string; sha256: string }> = {};
  for (const kind of Object.keys(manifest.artifacts.documents)) {
    const ref = manifest.artifacts.documents[kind as keyof typeof manifest.artifacts.documents];
    if (ref === undefined) continue;
    out[kind] = { path: ref.path, sha256: ref.sha256 };
  }
  return out;
}

function sameStableRef(
  target: { path: string; sha256: string } | undefined,
  current: { path: string; sha256: string } | undefined,
): boolean {
  if (target === undefined) return true; // 未提供 = 沿用当前
  if (current === undefined) return false;
  return target.path === current.path && target.sha256.toLowerCase() === current.sha256.toLowerCase();
}

/**
 * 主干升级收窄校验：拒绝版本化文档/execution 变更；stable 快照可从磁盘重新 re-pin。
 * 返回错误消息（undefined = 通过）。
 */
function mainUpgradeScopeProblem(current: TrunkManifest, target: TrunkApplySnapshot): string | undefined {
  const currentDocs = documentsSnapshot(current);
  for (const [kind, ref] of Object.entries(target.documents)) {
    const existing = currentDocs[kind];
    if (existing === undefined) return `主干升级不得新增版本化文档：${kind}`;
    if (existing.path !== ref.path || existing.sha256.toLowerCase() !== ref.sha256.toLowerCase()) {
      return `主干升级不得修改版本化文档（走版本变更申请）：${ref.path}`;
    }
  }
  for (const kind of Object.keys(currentDocs)) {
    if (target.documents[kind as TrunkDocKind] === undefined) return `主干升级不得删除版本化文档：${kind}`;
  }
  const execution = current.artifacts.execution;
  const targetPlan = target.execution.teamPlan;
  const targetFlow = target.execution.flow;
  const planSame =
    (targetPlan === null && execution.teamPlan === null) ||
    (targetPlan !== null && execution.teamPlan !== null &&
      targetPlan.path === execution.teamPlan.path &&
      targetPlan.sha256.toLowerCase() === execution.teamPlan.sha256.toLowerCase());
  if (!planSame) return "主干升级不得修改 execution.teamPlan（走版本变更申请/轻量重构）";
  const flowSame =
    (targetFlow === null && execution.flow === null) ||
    (targetFlow !== null && execution.flow !== null &&
      targetFlow.path === execution.flow.path &&
      targetFlow.sha256.toLowerCase() === execution.flow.sha256.toLowerCase());
  if (!flowSame) return "主干升级不得修改 execution.flow（走版本变更申请）";
  // stable 快照允许 re-pin；若提供则只允许 workflow/roleCards/boundaries 变化（不校验 here，S2 复核磁盘）。
  return undefined;
}

export function createTrunkRuntime(deps: TrunkRuntimeDeps): TrunkRuntime {
  const now = deps.now ?? (() => new Date());

  async function emit(payload: { kind: "trunk.state"; at: string }): Promise<void> {
    await deps.emitEvent(auditToEvent(payload));
  }

  return {
    async status() {
      return deps.service.status();
    },

    async reconcile() {
      const result = await deps.service.reconcileJournal();
      if (!result.ok) return result;
      // 已过提交点但事件缺失（phase 滞后）⇒ 仅在**能解析客户绑定**时补写 `trunk.state`；
      // C2a 契约：`switched` 等客户 op 必须 `origin/decidedBy:"customer"` + decisionId（F35）。
      // reconcile 载荷来自 journal（C1 无 decisionId 字段）⇒ 无法解析时**不伪造客户事件**，
      // 只返回 split 诊断（应用侧可见/系统行），账本保持零错误（T1/AC-12/AC-31）。
      if (result.value.state === "committed" && result.value.split && result.value.audit !== undefined) {
        const audit = result.value.audit;
        const customerBound =
          audit.origin === "customer" &&
          audit.decidedBy === "customer" &&
          (audit.decisionId !== undefined || audit.confirmationId !== undefined);
        if (customerBound) {
          await emit(audit);
        } else {
          deps.log?.(
            "trunk.reconcile: split 已识别（内容已过提交点、phase 滞后）；缺少可解析客户 decisionId/confirmationId，未补写客户 op（不伪造账本）",
          );
        }
      }
      return result;
    },

    async bootstrap(input) {
      const result = await deps.service.executeApply({
        source: "bootstrap",
        flowId: input.flowId,
        applicationId: input.applicationId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        runId: input.runId,
        baseTrunkVersion: null,
        target: input.target,
        ...(input.rosterVersion !== undefined ? { rosterVersion: input.rosterVersion } : {}),
        ...(input.d3 !== undefined ? { d3: input.d3 } : {}),
        ...(input.roles !== undefined ? { roles: input.roles } : {}),
        ...(input.repin !== undefined ? { repin: input.repin } : {}),
        ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
        at: input.at,
      });
      if (!result.ok) return result;
      await emit(result.value.audit);
      return result;
    },

    async applyApproved(input) {
      const result = await deps.service.executeApply(input);
      if (!result.ok) return result;
      await emit(result.value.audit);
      return result;
    },

    async mainUpgrade(input) {
      if (input.reason !== "emergency" && input.reason !== "recovery") {
        return { ok: false, code: "trunk-apply-failed", message: `主干升级只允许 emergency/recovery：${String(input.reason)}` };
      }
      if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
        return { ok: false, code: "trunk-high-risk-unacknowledged", message: "主干升级必须带客户 decisionId（客户本人）" };
      }
      if (input.highRisk?.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", message: "主干升级必须高危二次确认（highRisk.acknowledged:true）" };
      }
      const status = await deps.service.status();
      const current = status.manifest;
      if (current === undefined || status.availability !== "frozen") {
        return { ok: false, code: "trunk-unavailable", message: "主干升级需要已落盘的 frozen trunk manifest" };
      }
      const scopeProblem = mainUpgradeScopeProblem(current, input.target);
      if (scopeProblem !== undefined) {
        return { ok: false, code: "trunk-apply-failed", message: scopeProblem };
      }
      const result = await deps.service.executeApply({
        source: "upgrade",
        flowId: input.flowId,
        applicationId: `main-upgrade:${input.decisionId}`,
        decisionId: input.decisionId,
        runId: input.runId,
        baseTrunkVersion: current.trunkVersion,
        target: input.target,
        highRisk: { acknowledged: true, ...(input.highRisk.items !== undefined ? { items: input.highRisk.items } : {}) },
        ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
        at: input.at,
      });
      if (!result.ok) return result;
      await emit(result.value.audit);
      deps.log?.(`trunk.main-upgrade: v${result.value.manifest.trunkVersion} (${input.reason})`);
      return result;
    },

    async recover(input) {
      const result = await deps.service.recover(input);
      if (!result.ok) return result;
      await emit(result.value.audit);
      deps.log?.(`trunk.recover: v${result.value.manifest.trunkVersion}`);
      return result;
    },

    async completeStableWrite(input) {
      const protection = await readGitProtectionFacts(deps.projectRoot);
      const result = protection.identity ? await executeGitInitialWorkflowPublication({ projectRoot: deps.projectRoot, request: input }) : await deps.service.applyStableSnapshot({
        kind: input.kind,
        roleId: input.roleId,
        path: input.path,
        oldSha: input.oldSha,
        newSha: input.newSha,
        ...(input.confirmationId !== undefined ? { confirmationId: input.confirmationId } : {}),
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        at: input.at,
      });
      if (result.applied && result.audit !== undefined) {
        await deps.emitEvent({
          v: 1,
          kind: "trunk.state",
          op: result.audit.op,
          trunkVersion: result.audit.trunkVersion,
          path: result.audit.path,
          oldSha: result.audit.oldSha,
          newSha: result.audit.newSha,
          origin: result.audit.origin,
          decidedBy: result.audit.decidedBy,
          ...(result.audit.confirmationId !== undefined ? { confirmationId: result.audit.confirmationId } : {}),
          ...(result.audit.decisionId !== undefined ? { decisionId: result.audit.decisionId } : {}),
          at: result.audit.at,
        });
      }
      return result;
    },
  };
}
