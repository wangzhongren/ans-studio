// app/desktop/block-router.ts
// 2026-11-20（block resolver 第二批「桌面 router/执行器」，桌面窗口）：
// **block 生命周期运行时**——事实 → 分类/路由（R1 `block-resolution.ts`）→ 产物（修复任务/自动修复/
// 决策卡）→ 终态（fixed/decided）→ 重入场。账本 I/O 在 R1 `block-ledger.ts`（本模块只调用）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §三–§七、§九 Q1–Q10 默认；
// 协调方 Q4 澄清：**终止只能由客户在决策卡中显式选择，judge 永不选择；终止是 decided 的结果，不是停止态**。
// R1 记录：`角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（API 面/P1–P51/待桌面点）。
//
// 纪律（与设计一致）：
//  · **无 stop 终态**：`resolveBlock` 只写 fixed/decided；escalated 不是终态（升级后必然再 routed）。
//  · **不采信模型自报**：分类只用稳定码/账本事实；修复收口由应用重算字节 sha256（文件不可读/不符 ⇒ 不 fixed）。
//  · **不自动无限重试/不自动代选**：引擎自动修复默认上限 2（可注入）；judge 代选只走既有「替我决策」
//    开关 + 唯一推荐 + `metadata.blockJudgePermitted`（客户主权选项永不进入），由通道确定性结算。
//  · **等待客户卡是可见等待**：卡经既有 app-owned decision 通道发行（一项目一卡排队）；无答复不执行、
//    不重弹（requestId=`block-card-<blockId>`）；30min 只提醒一次（同卡）。
//  · **不改阶段状态机**：重入场只调用既有服务（driveAppDispatchStage / 既有投递 / 修复简报），
//    fixed-v2.1 在飞零迁移（resolver 只观察事实；不伪造阶段推进）。
//
// 依赖：只读/调用 `src/common/编排/**`（外部 src）与各模块注入的端口；不直接依赖 electron。

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import {
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  isWorkflowStage,
  type CustomerInputMetadata,
  type CustomerInputOption,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type TaskStateEvent,
  type WorkflowEvent,
  type WorkflowProtocol,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import {
  appendTaskEvent,
  findTaskByIdempotencyKey,
  newTaskId,
  readTaskState,
  taskEvent,
  type TaskRecord,
  type TaskReplay,
} from "../../src/common/编排/task-state.ts";
import {
  confirmStop,
  driveAppDispatchStage,
  readWorkflowLedger,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import {
  BLOCK_CLASS_DEFINITIONS,
  BLOCK_SHELL_DENIAL_REASONS,
  DEFAULT_MAX_AUTO_FIX_ATTEMPTS,
  blockCardRequestId,
  blockFactFromShellDenial,
  blockFactFromStallTick,
  blockFactFromStageBlocked,
  blockFactFromTaskReport,
  computeBlockFingerprint,
  computeBlockId,
  decideBlockRoute,
  isStopFreeRoute,
  resolveBlockTimings,
  type BlockCardOption,
  type BlockClass,
  type BlockEscalationTarget,
  type BlockFact,
  type BlockProtocol,
  type BlockResolverPolicy,
  type BlockRouteDecision,
  type BlockRouteKind,
  type BlockShellDenialReason,
  type BlockTimings,
} from "../../src/common/编排/block-resolution.ts";
import {
  escalateBlock,
  listOpenBlocks,
  raiseBlock,
  readBlockLedger,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
  type BlockLifecycle,
} from "../../src/common/编排/block-ledger.ts";
import type { DesktopCustomerInputFn } from "./customer-input.ts";
import { closeApplicationTaskDirect } from "./session/fixed-workflow/stage-dispatch.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { DeliveryItem } from "./session/contracts/session-types.ts";

// —————————————— 宿主端口（SessionManager 门面注入；运行期调用） ——————————————

/** 一次窗口/项目级宿主能力面（门面以内联箭头注入；本模块不持有会话状态）。 */
export interface DesktopBlockRouterHost {
  /** 时钟（与 SessionManager 同源；缺省 Date.now）。 */
  now?: () => number;
  /** 客户交互通道（缺省 ⇒ 决策卡不可发行；如实升级，不伪造卡）。 */
  customerInput?: DesktopCustomerInputFn;
  getListing(projectRoot: string): ProjectListing | undefined;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  /** 回交/治理主人（convener / single su）；用于系统行与卡上下文。 */
  governanceOwner(projectRoot: string): string | null;
  /** 「替我决策」主进程权威（与通道 `isGroupEnabled("decision")` 同源；缺省关闭）。 */
  decisionDelegationEnabled(): boolean;
  /** 既有卡片生命周期（cards.withRequestLifecycle；同一实现）。 */
  withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: { notify?: "default" | "resolved-only" | "none"; signal?: AbortSignal; judgeNotice?: string; onPresented?: () => void },
  ): Promise<CustomerInputOutcome | null | undefined>;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  /** 系统行（既有 delivery-note 事件流；不进入模型队列）。 */
  emitSystemRow(projectRoot: string, roleId: string | null, summary: string): void;
  appendRoleActivity(projectRoot: string, roleId: string, input: { kind: string; summary: string; status?: string; taskId?: string; ref?: string }): Promise<void>;
  /** 本项目是否有任何在飞轮次（stall 排除；保守）。 */
  isBusy?(projectRoot: string): boolean;
  /**
   * app-dispatch/v1 应用侧对账（既有 `FixedWorkflowStageDispatch.reconcile`；含投递/补驱）。
   * 只用于 B6 引擎确定性修复；缺省 ⇒ 引擎修复不可得（如实升级）。
   */
  reconcileAppDispatch?(projectRoot: string): Promise<{ corrupt: string[]; errors: string[]; delivered: string[]; activeWorkflows: number }>;
  /** app-dispatch/v1 重驱动（既有 `advance`；成功/未成功如实）。 */
  advanceAppDispatch?(projectRoot: string, workflowId: string): Promise<boolean>;
  /** 既有安全重派（B7 换执行者；失败如实）。 */
  redispatchTask?(projectRoot: string, taskId: string, to?: string): Promise<{ ok: boolean; safety: string; taskId?: string; message: string }>;
  /** 既有替代执行者选择（与 B-07 同源）。 */
  selectRedispatchTarget?(projectRoot: string, currentRoleId: string, attempts: number): string;
  /**
   * 2026-11-20：把应用创建的修复任务登记为星形任务（`starTaskIds`/`taskCreators`），
   * 使回交的 `task.reported` 按任务绑定落账并回到 block router（与既有应用任务同口径）。
   */
  registerAppTask?(taskId: string, creator: "application"): void;
}

/** block 卡等待的提醒去重/卡 promise 等进程内状态（不持久化；账本才是事实源）。 */
export interface BlockRouterOptions {
  /** 分类/重复阈值/上限（默认全部采用设计 Q10）。 */
  policy?: BlockResolverPolicy;
  /** 计时覆盖（T_stall/T_repair/T_remind；缺省 12/10/30min）。 */
  timings?: Partial<BlockTimings>;
}

const DIAGNOSTIC_COMPONENT = "desktop.block-router";
const BLOCK_REPAIR_TASK_KIND = "repair";
const BLOCK_REPAIR_KEY_PREFIX = "block-repair:";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blockClassTitle(cls: BlockClass): string {
  return BLOCK_CLASS_DEFINITIONS.find((entry) => entry.id === cls)?.title ?? cls;
}

function protocolLabel(protocol: BlockProtocol): string {
  return protocol;
}

function projectRelativePathOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\\/g, "/").trim();
  if (normalized === "" || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return undefined;
  if (normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return normalized;
}

/**
 * 回执/卡面用的稳定「下一步」短语（P10–P23 拒绝码；不臆造动作——只给既有合法下一步）。
 * 未知码返回通用句（如实：交 block resolver 路由）。
 */
export function nextActionsForBlockCode(code: string): string[] {
  switch (code) {
    case "stage-request-invalid":
    case "workflow-path-not-stage-request":
    case "review-target-invalid":
      return ["按回执修正 taskKind/字段后重新调用；同一错误重复出现将升级（不原样循环）。"];
    case "workflow-binding-unavailable":
    case "worker-dispatch-required":
      return ["确认当前受派任务/工作流绑定真实存在且 open；应用会按事实路由属主修复。"];
    case "stage-request-required":
      return ["固定路径的幕僚派发必须走 stage-request（taskKind/workflowPath/stage/flowId）。"];
    case "b-change-scope-invalid":
      return ["范围/写集歧义会路由为决策卡（修订范围/返工）；不要原样重发同一请求。"];
    case "basis-drift":
    case "basis-missing":
      return ["依据文档已漂移或缺失：等待属主补证/重记 basis 后重试。"];
    case "b-repository-required":
      return ["路径 B 需要既有仓库：由属主准备环境/仓库（应用不自动 init）。"];
    case "workflow-corrupt":
      return ["账本损坏：交 block resolver 引擎对账（只追加修复，不猜）。"];
    case "workflow-closed":
      return ["工作流已关闭：需要复跑请发起新的流程/版本决策。"];
    case "missing-contract":
    case "dispatch-contract-missing":
      return ["必读契约缺失：属主补证任务会创建；契约就绪后可重新派发同文任务。"];
    case "document-planning-source-unavailable":
    case "worker-dispatch-source-unavailable":
    case "chief-hub-flow-unavailable":
      return ["来源证据缺失：在当前真实客户轮次/受派任务下重新发起，不要伪造来源。"];
    default:
      return ["已登记 block 并由应用路由（修复任务/自动修复/决策卡）；请勿原样循环重试。"];
  }
}

/** 把 shell 拒绝 outcome 映射为稳定 reason（operator-channel 消费点用；未知 ⇒ undefined 不登记）。 */
export function shellDenialReasonFromOperatorOutcome(
  outcome: { outcome?: unknown; judge?: { reasonCode?: unknown; manualAsDeny?: unknown } } | null | undefined,
): BlockShellDenialReason | undefined {
  if (outcome === null || outcome === undefined) return undefined;
  const judge = outcome.judge;
  if (outcome.outcome === "unavailable") return "a-unavailable";
  if (outcome.outcome !== "deny" || judge === undefined) return undefined;
  const reasonCode = typeof judge.reasonCode === "string" ? judge.reasonCode : "";
  if (reasonCode === "retry-capped") return "retry-capped";
  if (judge.manualAsDeny === true) return "judge-manual";
  return "judge-deny";
}

/** block router 的对外面（门面 thin-delegate + 各模块端口共用）。 */
export interface BlockRouter {
  /** 事实入账（幂等）：分类 → raised/routed → 执行产物（异步；失败如实系统行）。 */
  observeFact(projectRoot: string, fact: BlockFact): Promise<void>;
  observeFactLater(projectRoot: string, fact: BlockFact): void;
  observeFactListLater(projectRoot: string, facts: readonly BlockFact[]): void;
  /** `task.reported`（blocked/failed 或 repair 任务报告）→ 路由；`done` 普通任务零行为。 */
  observeTaskReport(projectRoot: string, taskId: string): Promise<void>;
  observeTaskReportLater(projectRoot: string, taskId: string): void;
  /** shell 三层链拒绝/升级（a 层 judge deny/manual/retry-capped；c 层由调用方给稳定 reason）。 */
  observeShellDenialLater(projectRoot: string, input: { reason: string; command?: string; roleId?: string }): void;
  /** 看护 tick（stall 检测 + T_repair/T_remind + 漏账 stage.blocked 扫描）。 */
  tick(projectRoot: string): Promise<void>;
  tickLater(projectRoot: string): void;
  /** 启动/打开项目恢复（open blocks 重投/升级/重呈现；不伪造完成）。 */
  recover(projectRoot: string): Promise<void>;
  recoverLater(projectRoot: string): void;
  /** 供回执同步展示：确定性 blockId（不落账）。 */
  blockIdOf(fact: BlockFact): string;
  /**
   * 2026-11-20（P26–P29）：重派耗尽时把「升级卡」接入 block 卡体系（`block-card-<blockId>`，
   * 推荐项修复向、terminate 不再默认）。返回 `handled:false` ⇒ 调用方回退既有 `escalateStuckTask`
   * （无 block 通道/卡未呈现）；`handled:true` 时给出裁决映射（继续/重派/换人/终止）。
   */
  escalateRedispatchBlock(projectRoot: string, input: {
    taskId: string;
    rootTaskId: string;
    attempts: number;
    taskFlowId?: string;
    targetRoleId?: string;
    targetRuntime?: RuntimeKind;
  }): Promise<{ handled: boolean; requestId?: string; selected?: "continue" | "redispatch" | "replace" | "terminate"; message: string }>;
}

export function createDesktopBlockRouter(host: DesktopBlockRouterHost, options: BlockRouterOptions = {}): BlockRouter {
  // 2026-11-20（收尾修补 R4b）：`options.timings` 必须并入**策略本身**——否则 `blockFactFromStallTick`
  // 仍读默认 stallMs（12min），options 只影响 repair/remind 的局部变量。
  const basePolicy: BlockResolverPolicy = options.policy ?? {};
  const timings = resolveBlockTimings({ ...(basePolicy.timings ?? {}), ...(options.timings ?? {}) });
  const policy: BlockResolverPolicy = { ...basePolicy, timings };
  const maxAutoFix = typeof policy.maxAutoFixAttempts === "number" && Number.isFinite(policy.maxAutoFixAttempts)
    ? Math.max(0, Math.floor(policy.maxAutoFixAttempts))
    : DEFAULT_MAX_AUTO_FIX_ATTEMPTS;
  /** 同项目事实处理串行链（幂等/账本 read-then-append 在进程内串行；跨进程并发不在本批）。 */
  const chains = new Map<string, Promise<void>>();
  /** 卡呈现 promise（防止同 requestId 双呈现/双结算处理）。 */
  const cardPromises = new Map<string, Promise<void>>();
  /** T_remind 一次性提醒（同 block 只提醒一次；重启后按账本时间重新计）。 */
  const reminded = new Set<string>();
  /** 同 block 重复升级只做一次（防事实风暴；再出现只记诊断）。 */
  const repeatEscalated = new Set<string>();
  /** 本 router 自身触发引擎动作时收到的回传事实（跳过自身回路的重复升级）。 */
  const selfFacts = new Set<string>();
  /** 修复任务收口中的 taskId（防同报告并发处理）。 */
  const repairInFlight = new Set<string>();

  const now = (): Date => new Date(host.now !== undefined ? host.now() : Date.now());
  const diagnosticFor = (projectRoot: string) => createDiagnosticLogger({ component: DIAGNOSTIC_COMPONENT, projectRoot });

  const serialize = (projectRoot: string, task: () => Promise<void>): Promise<void> => {
    const previous = chains.get(projectRoot) ?? Promise.resolve();
    const next = previous.then(task, task).catch((error) => {
      diagnosticFor(projectRoot).error("block.observe.failed", error);
      systemRow(projectRoot, `[Block·系统] 路由处理异常（已隔离，不阻断会话）：${error instanceof Error ? error.message : String(error)}`);
    });
    const settled = next.then(() => undefined, () => undefined);
    chains.set(projectRoot, settled);
    void settled.finally(() => {
      if (chains.get(projectRoot) === settled) chains.delete(projectRoot);
    });
    return next;
  };

  const systemRow = (projectRoot: string, summary: string, roleId?: string | null): void => {
    try {
      host.emitSystemRow(projectRoot, roleId ?? host.governanceOwner(projectRoot), summary);
    } catch (error) {
      diagnosticFor(projectRoot).error("block.system-row.failed", error);
    }
  };

  const runtimeFor = (projectRoot: string, roleId: string | null): RuntimeKind => {
    const preferred = roleId ?? host.governanceOwner(projectRoot);
    if (preferred !== null) {
      const live = host.findLiveRuntime(projectRoot, preferred);
      if (live !== undefined) return live;
    }
    return host.activeRuntimeFor(projectRoot) ?? host.lastGovernanceRuntime.get(projectRoot) ?? "pi";
  };

  const roleExists = (projectRoot: string, roleId: string | undefined): boolean => {
    if (roleId === undefined || roleId.trim() === "") return false;
    const listing = host.getListing(projectRoot);
    if (listing === undefined) return false;
    return listing.roles.some((role) => role.roleId === roleId) || roleId === "chief" || roleId === "convener";
  };

  const resolveOwnerRole = (projectRoot: string, decision: BlockRouteDecision, fact: BlockFact): string => {
    const candidates = [
      decision.repair?.ownerRoleId,
      decision.owner.kind === "role" ? decision.owner.roleId : undefined,
      fact.ownerRoleId,
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && roleExists(projectRoot, candidate)) return candidate;
    }
    return host.governanceOwner(projectRoot) ?? "chief";
  };

  const readLifecycle = async (projectRoot: string, blockId: string): Promise<BlockLifecycle | undefined> => {
    const ledger = await readBlockLedger(projectRoot);
    return replayBlockLifecycles(ledger.events).records.get(blockId);
  };

  // 2026-11-20（收尾修补）：R1 `replayBlockLifecycles` 已补 `routeTaskId/cardRequestId/routings`，
  // 桌面恢复/T_repair 直接使用生命周期字段（不再直读 routed 事件）。

  const readProtocolForWorkflow = async (projectRoot: string, workflowId: string | undefined): Promise<WorkflowProtocol> => {
    if (workflowId === undefined) return WORKFLOW_PROTOCOL_FIXED_V2_1;
    const ledger = await readWorkflowLedger(projectRoot);
    const started = ledger.events.find((event) => event.kind === "workflow.started" && event.workflowId === workflowId);
    if (started === undefined || started.kind !== "workflow.started") return WORKFLOW_PROTOCOL_FIXED_V2_1;
    return started.protocol ?? WORKFLOW_PROTOCOL_FIXED_V2_1;
  };

  const enrichFact = (fact: BlockFact): BlockFact => ({
    ...fact,
    judgeAvailable: fact.judgeAvailable ?? host.decisionDelegationEnabled(),
  });

  // —————————————— 生命周期写入 ——————————————

  interface RoutedTargets {
    targetRoleId?: string;
    taskId?: string;
    cardRequestId?: string;
  }

  const ensureRouted = async (
    projectRoot: string,
    blockId: string,
    route: Exclude<BlockRouteKind, "escalated">,
    decision: BlockRouteDecision,
    targets: RoutedTargets,
  ): Promise<BlockLifecycle | undefined> => {
    const ledger = await readBlockLedger(projectRoot);
    if (ledger.badLines > 0) {
      systemRow(projectRoot, `[Block·系统] blocks.jsonl 存在 ${ledger.badLines} 条坏行；fail-closed：不追加、不猜。`);
      return undefined;
    }
    const lifecycle = replayBlockLifecycles(ledger.events).records.get(blockId);
    if (lifecycle === undefined || lifecycle.status === "resolved") return lifecycle;
    if (lifecycle.status === "routed" && lifecycle.routeKind === route) return lifecycle;
    const routed = await routeBlock({
      projectRoot,
      blockId,
      route,
      reason: decision.reason,
      ...(targets.targetRoleId !== undefined ? { targetRoleId: targets.targetRoleId } : {}),
      ...(targets.taskId !== undefined ? { taskId: targets.taskId } : {}),
      ...(targets.cardRequestId !== undefined ? { cardRequestId: targets.cardRequestId } : {}),
      attempt: lifecycle.routeCount + 1,
      policy,
      now,
    });
    if (!routed.ok) {
      diagnosticFor(projectRoot).record("block.route.rejected", { blockId, route, reasonCode: routed.code });
      systemRow(projectRoot, `[Block·系统] ${blockId} 路由 ${route} 未写入：${routed.code}：${routed.message}`);
      return undefined;
    }
    diagnosticFor(projectRoot).record("block.routed", { blockId, route, attempt: lifecycle.routeCount + 1 });
    return lifecycle;
  };

  const escalateThenRoute = async (
    projectRoot: string,
    blockId: string,
    lifecycle: BlockLifecycle,
    target: BlockEscalationTarget,
    reason: "repeat" | "budget" | "judge-manual" | "repair-timeout" | "unclassified",
    note: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
  ): Promise<void> => {
    const escalated = await escalateBlock({
      projectRoot,
      blockId,
      from: lifecycle.status,
      to: target,
      reason,
      note,
      attempt: lifecycle.escalationCount + 1,
      now,
    });
    if (!escalated.ok) {
      diagnosticFor(projectRoot).record("block.escalate.rejected", { blockId, target, reason, reasonCode: escalated.code });
      systemRow(projectRoot, `[Block·系统] ${blockId} 升级未写入：${escalated.code}：${escalated.message}`);
      return;
    }
    diagnosticFor(projectRoot).record("block.escalated", { blockId, target, reason });
    await routeEscalationTarget(projectRoot, blockId, target, decision, fact, reason);
  };

  const routeEscalationTarget = async (
    projectRoot: string,
    blockId: string,
    target: BlockEscalationTarget,
    decision: BlockRouteDecision,
    fact: BlockFact,
    reasonTag: string,
  ): Promise<void> => {
    if (target === "customer-decision") {
      // 强制客户面（judgeAvailable=false）；主权项在客户面才可出现。
      const customerDecision = decideBlockRoute({ ...fact, judgeAvailable: false }, policy);
      await routeCard(projectRoot, blockId, customerDecision, fact, "customer", reasonTag);
      return;
    }
    if (target === "engine-repair") {
      // 升级后的引擎修复：只做一次确定性动作；失败即再升级到客户（不再循环）。
      const routed = await ensureRouted(projectRoot, blockId, "engine-auto-fix", decision, {});
      if (routed === undefined) return;
      const action = await runEngineAction(projectRoot, blockId, fact);
      const lifecycle = await readLifecycle(projectRoot, blockId);
      if (action.ok) {
        await resolveBlock({
          projectRoot, blockId, resolution: "fixed", by: "engine", reEntry: action.reEntry, note: action.note, now,
        });
        diagnosticFor(projectRoot).record("block.resolved", { blockId, resolution: "fixed", by: "engine" });
        await reEnterAfterFixed(projectRoot, blockId);
        return;
      }
      if (lifecycle !== undefined && lifecycle.status !== "resolved") {
        await escalateThenRoute(
          projectRoot, blockId, lifecycle, fact.highRisk ? "customer-decision" : "owner-reassign",
          "unclassified", `引擎修复未成功：${action.note}`, decision, fact,
        );
      }
      return;
    }
    // executor-replace / owner-reassign：属主修复（可换人）。
    let ownerHint = decision.repair?.ownerRoleId ?? (decision.owner.kind === "role" ? decision.owner.roleId : undefined);
    if (target === "executor-replace" && host.selectRedispatchTarget !== undefined) {
      const current = ownerHint ?? host.governanceOwner(projectRoot) ?? "chief";
      ownerHint = host.selectRedispatchTarget(projectRoot, current, 1);
    }
    await routeOwnerRepair(projectRoot, blockId, decision, fact, ownerHint, reasonTag);
  };

  // —————————————— 路由执行器 ——————————————

  const executeRoute = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    reasonTag: string,
  ): Promise<void> => {
    if (!isStopFreeRoute(decision)) {
      // 结构防御：R1 不含 stop 分支；出现即记缺陷行（不写入任何 stop 态）。
      systemRow(projectRoot, `[Block·系统] ${blockId} 路由含非法 stop 分支（应用缺陷，已拒绝执行）。`);
      return;
    }
    switch (decision.kind) {
      case "engine-auto-fix":
        await routeEngine(projectRoot, blockId, decision, fact, reasonTag);
        return;
      case "owner-repair":
        await routeOwnerRepair(projectRoot, blockId, decision, fact, undefined, reasonTag);
        return;
      case "judge-decision":
        await routeCard(projectRoot, blockId, decision, fact, "judge", reasonTag);
        return;
      case "customer-decision":
        await routeCard(projectRoot, blockId, decision, fact, "customer", reasonTag);
        return;
      case "escalated": {
        const target = decision.escalation?.kind ?? (fact.highRisk ? "customer-decision" : "executor-replace");
        const lifecycle = await readLifecycle(projectRoot, blockId);
        if (lifecycle === undefined) return;
        await escalateThenRoute(projectRoot, blockId, lifecycle, target, decision.escalation?.reason ?? "repeat", decision.escalation?.note ?? decision.reason, decision, fact);
        return;
      }
    }
  };

  const routeEngine = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    reasonTag: string,
  ): Promise<void> => {
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined) return;
    if (lifecycle.status === "resolved") return;
    const attempts = lifecycle.routeCount;
    if (attempts >= maxAutoFix) {
      const target: BlockEscalationTarget = fact.highRisk ? "customer-decision" : "owner-reassign";
      await escalateThenRoute(projectRoot, blockId, lifecycle, target, "budget", `自动修复已达上限 ${maxAutoFix}（${reasonTag}）；转属主/客户。`, decision, fact);
      return;
    }
    await ensureRouted(projectRoot, blockId, "engine-auto-fix", decision, {});
    const selfKey = `${projectRoot}\u0000${blockId}`;
    selfFacts.add(selfKey);
    let action: { ok: true; reEntry: string; note: string } | { ok: false; note: string };
    try {
      action = await runEngineAction(projectRoot, blockId, fact);
    } finally {
      selfFacts.delete(selfKey);
    }
    const after = await readLifecycle(projectRoot, blockId);
    if (after === undefined || after.status === "resolved") return;
    if (action.ok) {
      const resolved = await resolveBlock({
        projectRoot, blockId, resolution: "fixed", by: "engine", reEntry: action.reEntry, note: action.note, now,
      });
      if (resolved.ok) {
        diagnosticFor(projectRoot).record("block.resolved", { blockId, resolution: "fixed", by: "engine" });
        await reEnterAfterFixed(projectRoot, blockId);
      } else {
        systemRow(projectRoot, `[Block·系统] ${blockId} 引擎修复完成但结算写入失败：${resolved.code}：${resolved.message}`);
      }
      return;
    }
    await escalateThenRoute(projectRoot, blockId, after, fact.highRisk ? "customer-decision" : "owner-reassign", "unclassified", action.note, decision, fact);
  };

  const runEngineAction = async (
    projectRoot: string,
    blockId: string,
    fact: BlockFact,
  ): Promise<{ ok: true; reEntry: string; note: string } | { ok: false; note: string }> => {
    // 只做**确定性**动作：应用对账 / app-dispatch 重驱动；fixed-v2.1 在飞零迁移（不伪造阶段推进）。
    if (fact.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH) {
      if ((fact.kind === "reconcile" || fact.code === "workflow-corrupt"
        || fact.code === "reconcile-corrupt" || fact.code === "reconcile-error"
        || fact.code === "workflow-protocol-mismatch") && host.reconcileAppDispatch !== undefined) {
        const receipt = await host.reconcileAppDispatch(projectRoot);
        const bad = [...receipt.corrupt, ...receipt.errors]
          .filter((entry) => fact.workflowId === undefined || entry.startsWith(fact.workflowId));
        if (bad.length === 0) {
          return { ok: true, reEntry: `reconcile:${fact.workflowId ?? "*"}`, note: `应用对账完成（activeWorkflows=${receipt.activeWorkflows}，delivered=${receipt.delivered.length}）。` };
        }
        return { ok: false, note: `应用对账仍有问题：${bad.slice(0, 3).join("；")}` };
      }
      if (fact.workflowId !== undefined && host.advanceAppDispatch !== undefined) {
        const advanced = await host.advanceAppDispatch(projectRoot, fact.workflowId);
        if (advanced) return { ok: true, reEntry: `drive:${fact.workflowId}`, note: "应用已按流程定义重驱动（阶段事实仍以账本为准）。" };
        return { ok: false, note: "app-dispatch 重驱动未成功（可能仍受预算/证据/高风险约束）。" };
      }
    }
    void blockId;
    return { ok: false, note: `block ${blockId}：${protocolLabel(fact.protocol)} 无应用可自动执行的确定性修复动作（不伪造阶段推进）。` };
  };

  const routeOwnerRepair = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    ownerHint: string | undefined,
    reasonTag: string,
  ): Promise<void> => {
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined || lifecycle.status === "resolved") return;
    const ownerRoleId = ownerHint !== undefined && roleExists(projectRoot, ownerHint)
      ? ownerHint
      : resolveOwnerRole(projectRoot, decision, fact);
    const evidenceRequired = decision.repair?.evidenceRequired === true || lifecycle.class === "missing-resource";
    const attempt = lifecycle.routeCount + 1;
    if (fact.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH) {
      const taskId = await createRepairTask(projectRoot, blockId, decision, fact, ownerRoleId, attempt, evidenceRequired);
      if (taskId !== undefined) {
        await ensureRouted(projectRoot, blockId, "owner-repair", decision, { targetRoleId: ownerRoleId, taskId });
        await deliverRepairTask(projectRoot, taskId, ownerRoleId);
        return;
      }
      systemRow(projectRoot, `[Block·系统] ${blockId} 修复任务创建失败；转升级（不伪造修复）。`);
    }
    // fixed-v2.1/legacy：确定性修复简报给创建者/属主（不新增任务、不改阶段语义）。
    const deadline = new Date(now().getTime() + timings.repairMs).toISOString();
    const brief = [
      `[Block·修复简报] blockId=${blockId} class=${lifecycle.class}(${lifecycle.classCode}) code=${lifecycle.code ?? fact.code ?? "-"}`,
      `问题：${fact.summary ?? lifecycle.summary}`,
      `责任属主：${ownerRoleId}`,
      `要求：按缺失项/约束修复；完成后在回交报告 evidence 中列出项目相对路径（应用将重算字节 sha256，不采信自报）。`,
      ...(fact.evidencePaths !== undefined && fact.evidencePaths.length > 0 ? [`证据路径：${fact.evidencePaths.join("、")}`] : []),
      `截止：${deadline}（超时应用将升级）。`,
      `说明：应用未伪造阶段推进；请用既有工具（stage-request/派发/收口）继续。`,
    ].join("\n");
    const dedupKey = `block-repair-brief:${blockId}:${attempt}`;
    if (fact.kind === "dispatch-rejection" || fact.kind === "service-rejection") {
      // 同步拒绝已把 nextActions 随工具回执交给调用方（P10–P23）：修复简报以**系统行**可见即可，
      // 不再向该角色投递一条会占用其模型队列的消息（拒绝回执本身就是下一步输入）。
      systemRow(projectRoot,
        `[Block·修复简报] ${blockId}（${lifecycle.classCode} ${lifecycle.code ?? fact.code ?? "-"}）→ ${ownerRoleId}：` +
        `${fact.summary ?? lifecycle.summary}；回执已含下一步，重复同指纹将升级。`,
        ownerRoleId);
      await ensureRouted(projectRoot, blockId, "owner-repair", decision, { targetRoleId: ownerRoleId });
      diagnosticFor(projectRoot).record("block.repair-brief.system-row", { blockId, ownerRoleId, reasonTag });
      return;
    }
    enqueueSystemText(projectRoot, ownerRoleId, brief, dedupKey, `block-repair-brief:${blockId}:${attempt}`);
    await host.appendRoleActivity(projectRoot, ownerRoleId, {
      kind: "block.repair-brief",
      summary: `收到 block 修复简报 #${blockId}（${lifecycle.classCode} ${lifecycle.code ?? fact.code ?? ""}）`,
      status: "delivered",
    });
    await ensureRouted(projectRoot, blockId, "owner-repair", decision, { targetRoleId: ownerRoleId });
    diagnosticFor(projectRoot).record("block.repair-brief.delivered", { blockId, ownerRoleId, reasonTag });
  };

  // —————————————— 应用修复任务（app-dispatch） ——————————————

  /** 2026-11-20（收尾修补 R4b）：repair 任务的工作流绑定（从账本确定性派生；不得伪造阶段）。 */
  interface RepairBinding {
    workflowId?: string;
    flowId?: string;
    stage?: WorkflowStage;
  }

  /**
   * 派生 repair 任务绑定：workflowId 来自事实；flowId 取事实或 `workflow.started.flowId`；
   * stage 取事实或账本视图当前阶段。冲突/缺失 ⇒ **不绑定**（blockId-only 形状；任务文本披露「不伪造阶段」），
   * 由 task-state 的 repair 校验保证仍 fail-closed。
   */
  const deriveRepairBinding = async (projectRoot: string, fact: BlockFact): Promise<RepairBinding> => {
    if (fact.workflowId === undefined) return {};
    const ledger = await readWorkflowLedger(projectRoot);
    const wfEvents = ledger.events.filter((event) => event.workflowId === fact.workflowId);
    const started = wfEvents.find((event) => event.kind === "workflow.started");
    const ledgerFlowId = started !== undefined && started.kind === "workflow.started"
      && typeof started.flowId === "string" && started.flowId.trim() !== ""
      ? started.flowId.trim()
      : undefined;
    const factFlowId = typeof fact.flowId === "string" && fact.flowId.trim() !== "" ? fact.flowId.trim() : undefined;
    if (factFlowId !== undefined && ledgerFlowId !== undefined && factFlowId !== ledgerFlowId) {
      diagnosticFor(projectRoot).record("block.repair-task.binding-mismatch", {
        workflowId: fact.workflowId, factFlowId, ledgerFlowId,
      });
      return {};
    }
    const flowId = factFlowId ?? ledgerFlowId;
    let stage = fact.stage;
    if (stage === undefined) {
      const taskState = await readTaskState(projectRoot);
      const view = deriveWorkflowView(wfEvents, taskState.events);
      if (isWorkflowStage(view.stage)) stage = view.stage;
    }
    if (flowId === undefined || stage === undefined) {
      diagnosticFor(projectRoot).record("block.repair-task.binding-partial", {
        workflowId: fact.workflowId, hasFlowId: flowId !== undefined, hasStage: stage !== undefined,
      });
      return {};
    }
    return { workflowId: fact.workflowId, flowId, stage };
  };

  const repairTaskText = (
    blockId: string,
    lifecycle: BlockLifecycle,
    fact: BlockFact,
    evidenceRequired: boolean,
    deadline: string,
    binding: RepairBinding,
  ): string => [
    `[应用·Block 修复任务] blockId=${blockId}`,
    `类：${blockLifecycleClassLabel(lifecycle)}；code=${fact.code ?? lifecycle.code ?? "-"}；协议=${fact.protocol}`,
    ...(binding.workflowId !== undefined
      ? [`workflowId=${binding.workflowId}；flowId=${binding.flowId ?? "-"}；stage=${binding.stage ?? "-"}（应用从账本派生）`]
      : fact.workflowId !== undefined
        ? [`workflowId=${fact.workflowId}（账本未给出可绑定 flowId/stage ⇒ 本任务仅以 blockId 关联；不伪造阶段）`]
        : []),
    `问题摘要：${fact.summary ?? lifecycle.summary}`,
    ...(fact.evidencePaths !== undefined && fact.evidencePaths.length > 0
      ? [`缺失/待补路径：${fact.evidencePaths.join("、")}`]
      : []),
    "完成口径：",
    " · 在提交报告中如实写明已修复内容；",
    ` · ${evidenceRequired ? "必须在 evidence 中给出项目相对证据路径（应用将重算字节 sha256；不可读/不符不判 accepted）" : "如产生项目文件，请在 evidence 中给出路径（应用重算 hash）"}；`,
    " · 本任务由应用创建/收口，**不触发阶段完成**；阶段完成只按流程定义。",
    `截止：${deadline}（超时应用会升级；不无限重试）。`,
  ].join("\n");

  const blockLifecycleClassLabel = (lifecycle: BlockLifecycle): string =>
    `${lifecycle.class}(${lifecycle.classCode})`;

  const createRepairTask = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    ownerRoleId: string,
    attempt: number,
    evidenceRequired: boolean,
  ): Promise<string | undefined> => {
    const idempotencyKey = `${BLOCK_REPAIR_KEY_PREFIX}${blockId}:${attempt}`;
    const state = await readTaskState(projectRoot);
    const existing = findTaskByIdempotencyKey(state, idempotencyKey);
    if (existing !== undefined && existing.closed === undefined) return existing.taskId;
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined) return undefined;
    const deadline = new Date(now().getTime() + timings.repairMs).toISOString();
    const taskId = newTaskId(now());
    const binding = await deriveRepairBinding(projectRoot, fact);
    const event = taskEvent("task.created", {
      taskId,
      from: "application",
      to: ownerRoleId,
      text: repairTaskText(blockId, lifecycle, fact, evidenceRequired, deadline, binding),
      sideEffect: "unknown",
      idempotencyKey,
      taskKind: BLOCK_REPAIR_TASK_KIND,
      blockId,
      ...(binding.workflowId !== undefined && binding.flowId !== undefined && binding.stage !== undefined
        ? { workflowId: binding.workflowId, flowId: binding.flowId, stage: binding.stage }
        : {}),
      ...(fact.evidencePaths !== undefined && fact.evidencePaths.length > 0 ? { requestedEvidence: [...fact.evidencePaths].slice(0, 5) } : {}),
    }, now);
    const appended = await appendTaskEvent(projectRoot, event);
    if (!appended.ok) {
      diagnosticFor(projectRoot).record("block.repair-task.create.failed", { blockId, reasonCode: appended.code ?? "task-create-failed" });
      return undefined;
    }
    host.registerAppTask?.(taskId, "application");
    diagnosticFor(projectRoot).record("block.repair-task.created", { blockId, taskId, ownerRoleId });
    return taskId;
  };

  const deliverRepairTask = async (projectRoot: string, taskId: string, ownerRoleId: string): Promise<void> => {
    const state = await readTaskState(projectRoot);
    const record = state.records.get(taskId);
    const created = record?.created;
    if (record === undefined || created === undefined || record.closed !== undefined) return;
    if (record.delivered !== undefined || record.reports.length > 0) return; // 幂等：已送达/已报告
    const runtime = runtimeFor(projectRoot, ownerRoleId);
    const dedupKey = `${projectRoot}\u0000${runtime}\u0000task\u0000${taskId}`;
    host.enqueueDelivery(projectRoot, ownerRoleId, {
      kind: "dispatch",
      runtime,
      targetRoleId: ownerRoleId,
      sourceRoleId: "application",
      taskId,
      text: created.text,
      summary: `[任务·修复] #${taskId} → ${ownerRoleId}：${created.blockId ?? ""}`,
      dedupKey,
    });
    await host.appendRoleActivity(projectRoot, ownerRoleId, {
      kind: "task.delivered",
      summary: `收到应用修复任务 #${taskId}（block=${created.blockId ?? "-"}）`,
      status: "delivered",
      taskId,
    });
    await host.drainQueue(projectRoot, ownerRoleId, runtime);
  };

  const enqueueSystemText = (projectRoot: string, roleId: string, text: string, dedupKey: string, summaryTag: string): void => {
    const runtime = runtimeFor(projectRoot, roleId);
    host.enqueueDelivery(projectRoot, roleId, {
      kind: "system",
      runtime,
      targetRoleId: roleId,
      sourceRoleId: "application",
      text,
      summary: `[系统·block] ${summaryTag}`,
      dedupKey,
    });
    void host.drainQueue(projectRoot, roleId, runtime);
  };

  // —————————————— 决策卡（app-owned decision；一项目一卡；requestId 幂等） ——————————————

  interface RequestResolution {
    selected?: readonly string[];
    by?: string;
    decisionId?: string;
    operatorId?: string;
    event: Extract<TaskStateEvent, { kind: "request.resolved" }>;
  }

  const findRequestState = (state: TaskReplay, requestId: string): {
    created: boolean;
    orphaned: boolean;
    resolution?: RequestResolution;
  } => {
    // 按事件顺序取**最后一次**生命周期状态（orphaned 不是粘性：同 requestId 重呈后的新 created 表示等待中）。
    let created = false;
    let orphaned = false;
    let resolution: RequestResolution | undefined;
    for (const event of state.events) {
      if (event.kind === "request.created" && event.requestId === requestId) {
        created = true;
        orphaned = false;
        resolution = undefined;
      } else if (event.kind === "request.orphaned" && event.requestId === requestId) {
        orphaned = true;
      } else if (event.kind === "request.resolved" && event.requestId === requestId) {
        orphaned = false;
        resolution = {
          ...(event.selectedOptionIds !== undefined ? { selected: event.selectedOptionIds } : {}),
          by: event.by,
          ...(event.decisionId !== undefined ? { decisionId: event.decisionId } : {}),
          ...(event.operatorId !== undefined ? { operatorId: event.operatorId } : {}),
          event,
        };
      }
    }
    return { created, orphaned, ...(resolution !== undefined ? { resolution } : {}) };
  };

  /**
   * 2026-11-20（收尾修补 R4a）：卡 flowId 的确定性回退（decision 卡校验要求合法 flowId）。
   * 顺序：事实 flowId → 关联任务 `task.created.flowId` → 任务/事实 workflowId 的 `workflow.started.flowId`
   * → 项目稳定 block slug（`block-<blockId 前 12>`，只作卡审计/排队作用域，不写入 workflow/block 账本）。
   * 任何一步都只读账本事实；找不到即回退并**如实诊断**，不伪造 workflow/stage。
   */
  const resolveCardFlowId = async (
    projectRoot: string,
    blockId: string,
    fact: BlockFact,
  ): Promise<{ flowId: string; fallback: boolean }> => {
    if (fact.flowId !== undefined && fact.flowId.trim() !== "") return { flowId: fact.flowId.trim(), fallback: false };
    let workflowId = fact.workflowId;
    if (fact.taskId !== undefined) {
      const state = await readTaskState(projectRoot);
      const created = state.records.get(fact.taskId)?.created;
      if (created?.flowId !== undefined && created.flowId.trim() !== "") return { flowId: created.flowId.trim(), fallback: false };
      if (workflowId === undefined && created?.workflowId !== undefined) workflowId = created.workflowId;
    }
    if (workflowId !== undefined) {
      const ledger = await readWorkflowLedger(projectRoot);
      const started = ledger.events.find((event) => event.kind === "workflow.started" && event.workflowId === workflowId);
      if (started !== undefined && started.kind === "workflow.started"
        && typeof started.flowId === "string" && started.flowId.trim() !== "") {
        return { flowId: started.flowId.trim(), fallback: false };
      }
    }
    const fallbackFlowId = `block-${blockId.slice(0, 12)}`;
    diagnosticFor(projectRoot).record("block.card.flow-fallback", {
      blockId,
      ...(fact.taskId !== undefined ? { taskId: fact.taskId } : {}),
      ...(workflowId !== undefined ? { workflowId } : {}),
      fallbackFlowId,
    });
    return { flowId: fallbackFlowId, fallback: true };
  };

  const routeCard = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    variant: "judge" | "customer",
    reasonTag: string,
  ): Promise<void> => {
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined || lifecycle.status === "resolved") return;
    const requestId = blockCardRequestId(blockId);
    const state = await readTaskState(projectRoot);
    const requestState = findRequestState(state, requestId);
    if (requestState.resolution !== undefined) {
      await handleCardResolution(projectRoot, blockId, decision, fact, requestState.resolution, requestId);
      return;
    }
    if (requestState.created && !requestState.orphaned) {
      await ensureRouted(projectRoot, blockId, decision.kind === "judge-decision" ? "judge-decision" : "customer-decision", decision, { cardRequestId: requestId });
      return; // 已呈现/排队中：可见等待（不重弹）
    }
    if (host.customerInput === undefined) {
      await handleCardUnavailable(projectRoot, blockId, lifecycle, decision, fact, "客户交互通道未接线（不伪造卡）");
      return;
    }
    const key = `${projectRoot}\u0000${requestId}`;
    const pending = cardPromises.get(key);
    if (pending !== undefined) {
      await ensureRouted(projectRoot, blockId, decision.kind === "judge-decision" ? "judge-decision" : "customer-decision", decision, { cardRequestId: requestId });
      return;
    }
    const runtime = runtimeFor(projectRoot, null);
    const cardFlow = await resolveCardFlowId(projectRoot, blockId, fact);
    const cardFact: BlockFact = fact.flowId === cardFlow.flowId ? fact : { ...fact, flowId: cardFlow.flowId };
    const request: CustomerInputRequest = {
      kind: "choice",
      cardKind: "decision",
      application: true,
      sourceRoleId: "application",
      flowId: cardFlow.flowId,
      title: blockCardTitle(cardFact, lifecycle),
      question: blockCardQuestion(cardFact, lifecycle, decision),
      preview: `${blockCardPreview(cardFact, lifecycle, decision)}${cardFlow.fallback
        ? `\nflowId：${cardFlow.flowId}（应用回退；账本无可用 flowId，仅作卡审计/排队作用域，不伪造 workflow）`
        : ""}`,
      options: blockCardOptionsForRequest(decision, variant),
    };
    const metadata: CustomerInputMetadata = {
      cardKind: "decision",
      blockId,
      blockJudgePermitted: variant === "judge" && decision.kind === "judge-decision",
      flowId: cardFlow.flowId,
      ...(fact.taskId !== undefined ? { taskId: fact.taskId } : {}),
    };
    await ensureRouted(projectRoot, blockId, variant === "judge" ? "judge-decision" : "customer-decision", decision, { cardRequestId: requestId });
    const routedNow = await readLifecycle(projectRoot, blockId);
    if (routedNow === undefined || routedNow.status === "resolved") return;
    const promise = (async (): Promise<void> => {
      let outcome: CustomerInputOutcome | null | undefined;
      try {
        outcome = await host.withRequestLifecycle(
          projectRoot,
          "application",
          request,
          metadata,
          (req, ctx, meta) => host.customerInput!(req, ctx, meta),
          (req, extras) => ({
            roleId: "application",
            runtime,
            projectRoot,
            governanceModel: "trio",
            ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
            ...(extras?.judgeNotice !== undefined ? { judgeNotice: extras.judgeNotice } : {}),
          }),
          requestId,
          { notify: "none" },
        );
      } catch (error) {
        diagnosticFor(projectRoot).error("block.card.failed", error, { blockId, requestId });
        systemRow(projectRoot, `[Block·系统] ${blockId} 决策卡通道异常（不代选、不放行）：${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (outcome === null || outcome === undefined) {
        systemRow(projectRoot, `[Block·系统] ${blockId} 决策卡未获呈现/答复（fail-closed；block 保持等待）。`);
        return;
      }
      if (outcome.outcome !== "answered") {
        // 卡未答/被取消/不可用 ≠ 决策：block 保持 routed（可见等待；不执行）。
        diagnosticFor(projectRoot).record("block.card.not-answered", { blockId, outcome: outcome.outcome });
        return;
      }
      const fresh = await readTaskState(projectRoot);
      const resolved = findRequestState(fresh, requestId).resolution;
      if (resolved === undefined) {
        systemRow(projectRoot, `[Block·系统] ${blockId} 决策已答但账本无 request.resolved（不猜；等待恢复核验）。`);
        return;
      }
      await handleCardResolution(projectRoot, blockId, decision, fact, resolved, requestId);
    })().finally(() => {
      cardPromises.delete(key);
    });
    cardPromises.set(key, promise);
    void promise.catch((error) => diagnosticFor(projectRoot).error("block.card.unhandled", error));
    diagnosticFor(projectRoot).record("block.card.presented", { blockId, requestId, variant, reasonTag });
  };

  const blockCardTitle = (fact: BlockFact, lifecycle: BlockLifecycle): string =>
    `[Block] ${blockClassTitle(lifecycle.class)} · ${fact.flowId ?? lifecycle.flowId ?? "-"}/${fact.stage ?? lifecycle.stage ?? "-"}`;

  const blockCardQuestion = (fact: BlockFact, lifecycle: BlockLifecycle, decision: BlockRouteDecision): string =>
    `block ${lifecycle.classCode} ${lifecycle.class}（${fact.code ?? lifecycle.code ?? "-"}）：${fact.summary ?? lifecycle.summary}。` +
    `已自动尝试：${lifecycle.routeCount > 0 ? `${lifecycle.routeCount} 次路由/修复动作` : "无"}（${decision.reason}）。请选择处置；无答复不执行。`;

  const blockCardPreview = (fact: BlockFact, lifecycle: BlockLifecycle, decision: BlockRouteDecision): string => {
    const fp = computeBlockFingerprint(fact);
    const lines = [
      `blockId：${lifecycle.blockId}`,
      `class：${lifecycle.class}（${lifecycle.classCode}）；code：${fact.code ?? lifecycle.code ?? "-"}`,
      `protocol：${fact.protocol}；来源：${fact.source ?? "-"}`,
      `workflowId：${fact.workflowId ?? lifecycle.workflowId ?? "-"}；stage：${fact.stage ?? lifecycle.stage ?? "-"}`,
      `taskId：${fact.taskId ?? lifecycle.taskId ?? "-"}；requestId：${fact.requestId ?? lifecycle.requestId ?? "-"}`,
      `attempts：${fact.attempts ?? "-"}；已路由：${lifecycle.routeCount}；已升级：${lifecycle.escalationCount}`,
      `fingerprint：${fp}`,
      ...(lifecycle.evidenceRefs.length > 0 ? [`证据引用：${lifecycle.evidenceRefs.slice(0, 8).join("；")}`] : []),
      `judge：${decision.needsJudge ? "路由为 judge 代选（开关开启且唯一推荐时由通道确定性结算；否则客户卡）" : "客户本人"}`,
      `推荐：${decision.recommendedOptionId ?? "-"}`,
    ];
    return lines.join("\n");
  };

  const blockCardOptionsForRequest = (decision: BlockRouteDecision, _variant: "judge" | "customer"): CustomerInputOption[] => {
    const options = decision.options;
    return options.map((option: BlockCardOption) => ({
      id: option.id,
      label: option.label,
      description: option.consequence,
      ...(option.recommended ? { recommended: true } : {}),
    }));
  };

  const handleCardUnavailable = async (
    projectRoot: string,
    blockId: string,
    lifecycle: BlockLifecycle,
    decision: BlockRouteDecision,
    fact: BlockFact,
    note: string,
  ): Promise<void> => {
    diagnosticFor(projectRoot).record("block.card.unavailable", { blockId });
    systemRow(projectRoot, `[Block·系统] ${blockId} 决策卡不可用：${note}。block 保持 routed（不伪造决定）。`);
    if (!fact.highRisk) {
      // 无卡通道（P28）：升级为属主修复（系统行/修复任务），不是继续等；高风险仍只能客户本人。
      await escalateThenRoute(projectRoot, blockId, lifecycle, "owner-reassign", "unclassified",
        `客户卡通道不可用：${note}；转属主修复（可见系统行）。`, decision, fact);
    }
  };

  const handleCardResolution = async (
    projectRoot: string,
    blockId: string,
    decision: BlockRouteDecision,
    fact: BlockFact,
    resolution: RequestResolution,
    requestId: string,
  ): Promise<void> => {
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined || lifecycle.status === "resolved") return;
    const selected = [...(resolution.selected ?? [])];
    const choiceId = selected[0] ?? (typeof resolution.event.choice === "string" ? resolution.event.choice.split(",")[0] : undefined);
    if (choiceId === undefined || choiceId === "" || !decision.options.some((option) => option.id === choiceId)) {
      systemRow(projectRoot, `[Block·系统] ${blockId} 卡片裁决选项不在本次合法选项内（fail-closed；保持等待）。`);
      return;
    }
    const operatorId = resolution.operatorId ?? "";
    const byJudge = resolution.by === "judge" || operatorId.startsWith("judge:");
    const byDirective = resolution.by === "directive" || operatorId.startsWith("directive:");
    if (resolution.by === "chief-delegated") {
      systemRow(projectRoot, `[Block·系统] ${blockId} 收到幕僚委托结算（block 决策只允许 judge/customer；保持等待）。`);
      return;
    }
    const option = decision.options.find((entry) => entry.id === choiceId)!;
    if (byJudge && option.sovereign) {
      systemRow(projectRoot, `[Block·系统] ${blockId} 拒绝对客户主权选项的 judge 结算（危险防御；保持等待）。`);
      return;
    }
    if (resolution.decisionId === undefined || resolution.decisionId.trim() === "") {
      systemRow(projectRoot, `[Block·系统] ${blockId} 裁决缺 decisionId（provenance 不诚实；不写 decided）。`);
      return;
    }
    const by = byJudge ? "judge" : "customer";
    if (!byJudge && !byDirective && resolution.by !== "customer") {
      systemRow(projectRoot, `[Block·系统] ${blockId} 裁决来源不可识别（by=${String(resolution.by)}；保持等待）。`);
      return;
    }
    const resolved = await resolveBlock({
      projectRoot,
      blockId,
      resolution: "decided",
      by,
      decisionId: resolution.decisionId,
      reEntry: option.id,
      note: `决策卡 ${requestId}：${option.id}${byDirective ? `（客户指令 ${operatorId}）` : ""}`,
      now,
    });
    if (!resolved.ok) {
      systemRow(projectRoot, `[Block·系统] ${blockId} decided 结算写入失败：${resolved.code}：${resolved.message}`);
      return;
    }
    diagnosticFor(projectRoot).record("block.resolved", { blockId, resolution: "decided", by, optionId: option.id });
    await executeChosenOption(projectRoot, blockId, fact, decision, option);
  };

  // —————————————— 裁决后的选项执行 + 重入场 ——————————————

  const executeChosenOption = async (
    projectRoot: string,
    blockId: string,
    fact: BlockFact,
    decision: BlockRouteDecision,
    option: BlockCardOption,
  ): Promise<void> => {
    // P27：重派耗尽升级卡的动作由调用方（tasks.redispatchTask/escalateStuckTask 兼容面）执行；
    // 本层只记录决定（避免第二套重派/终止路径）。
    if (fact.kind === "redispatch") {
      systemRow(projectRoot, `[Block] ${blockId} 重派升级裁决：${option.id}（${option.label}）；动作按既有重派/终止路径执行。`);
      return;
    }
    switch (option.id) {
      case "block-terminate-flow":
        await executeTerminateFlow(projectRoot, blockId, fact);
        return;
      case "block-accept-current-state":
      case "block-accept-with-limits": {
        const disclosure = `[Block·披露] ${blockId} 客户选择「${option.label}」：按现状继续并在下游交付披露限制（${option.id}）。`;
        systemRow(projectRoot, disclosure, host.governanceOwner(projectRoot));
        await host.appendRoleActivity(projectRoot, host.governanceOwner(projectRoot) ?? "chief", {
          kind: "block.accepted-with-limits",
          summary: disclosure,
          status: "decided",
        });
        return;
      }
      case "block-grant-exception":
        systemRow(projectRoot, `[Block·授权] ${blockId} 客户授予一次性例外（${option.id}）；精确动作仍由既有审批卡执行（应用不代批）。`);
        return;
      case "block-merge-main":
      case "block-stable-write":
        systemRow(projectRoot, `[Block] ${blockId} 客户选择「${option.label}」；精确合并/写入动作走既有客户主权卡（不在此代执行）。`);
        return;
      case "block-replace-executor": {
        if (fact.taskId !== undefined && host.redispatchTask !== undefined) {
          const replacement = host.selectRedispatchTarget !== undefined && fact.ownerRoleId !== undefined
            ? host.selectRedispatchTarget(projectRoot, fact.ownerRoleId, 1)
            : undefined;
          const redispatched = await host.redispatchTask(projectRoot, fact.taskId, replacement);
          systemRow(projectRoot, `[Block] ${blockId} 换执行者（${option.id}）：${redispatched.ok ? `已重派 #${redispatched.taskId ?? "-"}` : `重派未执行（${redispatched.safety}）：${redispatched.message}`}`);
          return;
        }
        const ownerRoleId = resolveOwnerRole(projectRoot, decision, fact);
        enqueueSystemText(projectRoot, ownerRoleId,
          `[Block·换人] ${blockId} 客户选择「${option.label}」。请用既有 dispatch/重派能力换执行者或调整任务文本；应用不代建第二任务。`,
          `block-replace:${blockId}`, `replace:${blockId}`);
        return;
      }
      case "block-retry-with-cap": {
        if (fact.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH && fact.workflowId !== undefined && host.advanceAppDispatch !== undefined) {
          const advanced = await host.advanceAppDispatch(projectRoot, fact.workflowId);
          systemRow(projectRoot, `[Block] ${blockId} 限次重试：${advanced ? "应用已重驱动一次（同指纹再出现即升级）" : "重驱动未成功（不循环）"}`);
          return;
        }
        await runEngineAction(projectRoot, blockId, fact);
        return;
      }
      default: {
        // block-revise-scope / block-rework：转属主修复动作（新 block 由后续失败事实产生）。
        const ownerRoleId = resolveOwnerRole(projectRoot, decision, fact);
        const reviewDecision = decideBlockRoute({ ...fact, judgeAvailable: false }, policy);
        await routeOwnerRepair(projectRoot, blockId, reviewDecision, fact, ownerRoleId, `decision:${option.id}`);
        return;
      }
    }
  };

  const executeTerminateFlow = async (projectRoot: string, blockId: string, fact: BlockFact): Promise<void> => {
    const workflowId = fact.workflowId;
    const disclosure = `[Block·终止] ${blockId} 客户在决策卡显式选择终止本次流程；block 终态=decided（不是 stopped 态）。`;
    systemRow(projectRoot, disclosure, host.governanceOwner(projectRoot));
    if (workflowId === undefined) {
      enqueueSystemText(projectRoot, host.governanceOwner(projectRoot) ?? "chief",
        `[Block·终止] 客户已显式选择终止（block ${blockId}）。请按既有流程停止相关任务并如实披露未完成项；应用未伪造停稳。`,
        `block-terminate:${blockId}`, `terminate:${blockId}`);
      return;
    }
    // 停稳只能沿既有 confirmStop 语义：需要既有 stop 请求任务已收口/已报告。
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
      const stopEvent = [...wfEvents].reverse().find((event): event is Extract<WorkflowEvent, { kind: "workflow.stop-requested" }> =>
        event.kind === "workflow.stop-requested");
      const state = await readTaskState(projectRoot);
      const requestRecord = stopEvent !== undefined ? state.records.get(stopEvent.requestTaskId) : undefined;
      const ready = requestRecord?.closed !== undefined && requestRecord.reports.length > 0;
      if (stopEvent !== undefined && ready) {
        const confirmed = await confirmStop({
          projectRoot,
          workflowId,
          requestTaskId: stopEvent.requestTaskId,
          outcome: "stopped",
          reason: `block ${blockId}：客户显式选择终止本次流程`,
          now,
        });
        if (confirmed.ok) {
          systemRow(projectRoot, `[Block·终止] ${workflowId} 已按既有 confirmStop 停稳（workflow.closed stopped）；未完成项按披露口径处理。`);
          return;
        }
        systemRow(projectRoot, `[Block·终止] ${workflowId} 停稳未确认：${confirmed.code}：${confirmed.message}（不伪造 stopped）。`);
      }
      enqueueSystemText(projectRoot, host.governanceOwner(projectRoot) ?? "chief",
        `[Block·终止] 客户已显式选择终止 ${workflowId}（block ${blockId}）。请按既有 stop 流程发起/收口（requestStage stop）并确认停稳；应用未伪造停稳。`,
        `block-terminate-flow-brief:${blockId}`, `terminate-flow:${blockId}`);
    } catch (error) {
      diagnosticFor(projectRoot).error("block.terminate.failed", error, { blockId, workflowId });
      systemRow(projectRoot, `[Block·终止] ${workflowId} 停稳处理异常（如实披露，不伪造）：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const reEnterAfterFixed = async (projectRoot: string, blockId: string): Promise<void> => {
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined) return;
    const workflowId = lifecycle.workflowId;
    if (lifecycle.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH && workflowId !== undefined && host.advanceAppDispatch !== undefined) {
      const advanced = await host.advanceAppDispatch(projectRoot, workflowId);
      if (!advanced) {
        systemRow(projectRoot, `[Block·系统] ${blockId} 修复已核验，但 app-dispatch 重驱动未成功（新事实将另行成块，不伪造完成）。`);
      }
      return;
    }
    const ownerRoleId = host.governanceOwner(projectRoot) ?? "chief";
    enqueueSystemText(projectRoot, ownerRoleId,
      `[Block·修复完成] block ${blockId} 已由应用核验（fixed）。请按既有工具继续（${lifecycle.stage !== undefined ? `stage ${lifecycle.stage} ` : ""}${workflowId ?? "flow"}）；应用未伪造阶段推进。`,
      `block-fixed:${blockId}`, `fixed:${blockId}`);
  };

  // —————————————— 修复任务报告 ——————————————

  const handleTaskReport = async (projectRoot: string, taskId: string): Promise<void> => {
    const state = await readTaskState(projectRoot);
    const record = state.records.get(taskId);
    const created = record?.created;
    if (record === undefined || created === undefined) return;
    if (created.taskKind === BLOCK_REPAIR_TASK_KIND) {
      await handleRepairReport(projectRoot, record);
      return;
    }
    const last = record.reports[record.reports.length - 1];
    if (last === undefined || last.status === "done") return;
    // app-dispatch 应用阶段任务：报告由编排 `observeAppDispatchTaskReport` 收口/重试；耗尽时该路径
    // 另发 `blockFact`（B9/B4）——这里不重复造块。
    if (created.from === "application" && created.taskKind === "stage-execution" && created.workflowId !== undefined) return;
    const protocol = await readProtocolForWorkflow(projectRoot, created.workflowId);
    const fact = blockFactFromTaskReport({
      protocol,
      report: last,
      ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
      ...(created.flowId !== undefined ? { flowId: created.flowId } : {}),
      ...(created.stage !== undefined ? { stage: created.stage } : {}),
      options: {
        ...(created.from !== "application" ? { ownerRoleId: created.from } : {}),
        fingerprintMaterial: ["task-report", created.taskId, last.status],
      },
    });
    if (fact === undefined) return;
    await handleFact(projectRoot, fact);
  };

  const handleRepairReport = async (projectRoot: string, record: TaskRecord): Promise<void> => {
    const created = record.created!;
    const blockId = created.blockId;
    if (blockId === undefined) return;
    if (repairInFlight.has(`${projectRoot}\u0000${record.taskId}`)) return;
    repairInFlight.add(`${projectRoot}\u0000${record.taskId}`);
    try {
      const lifecycle = await readLifecycle(projectRoot, blockId);
      const last = record.reports[record.reports.length - 1];
      if (lifecycle === undefined || lifecycle.status === "resolved") {
        // block 已结算：如实收口修复任务（不悬空），但不再改 block。
        if (last !== undefined && record.closed === undefined) {
          await closeApplicationTaskDirect({
            projectRoot, taskId: record.taskId, outcome: "accepted",
            operationId: `app-block-repair:${record.taskId}:${last.at}`, note: "block 已结算；修复任务幂等收口。", now,
          });
        }
        return;
      }
      if (last === undefined) return;
      if (last.status !== "done") {
        if (record.closed === undefined) {
          await closeApplicationTaskDirect({
            projectRoot, taskId: record.taskId, outcome: "rejected",
            operationId: `app-block-repair:${record.taskId}:${last.at}`, note: `修复报告 ${last.status}：${last.summary}`, now,
          });
        }
        const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: host.decisionDelegationEnabled() }, policy);
        await escalateThenRoute(projectRoot, blockId, lifecycle, lifecycle.class === "budget-quota" || factHighRisk(lifecycle) ? "customer-decision" : "owner-reassign", "unclassified", `修复报告为 ${last.status}（非 done）；不判 fixed。`, decision, blockFactFromLifecycle(lifecycle));
        return;
      }
      const verification = await verifyRepairEvidence(projectRoot, lifecycle, last.evidence ?? []);
      if (!verification.ok) {
        if (record.closed === undefined) {
          await closeApplicationTaskDirect({
            projectRoot, taskId: record.taskId, outcome: "rejected",
            operationId: `app-block-repair:${record.taskId}:${last.at}`, note: `证据核验失败：${verification.reason}`, now,
          });
        }
        const baseFact = blockFactFromLifecycle(lifecycle);
        const decision = decideBlockRoute({ ...baseFact, judgeAvailable: host.decisionDelegationEnabled() }, policy);
        await escalateThenRoute(projectRoot, blockId, lifecycle, "owner-reassign", "unclassified", `修复证据核验失败：${verification.reason}`, decision, baseFact);
        return;
      }
      if (record.closed === undefined) {
        const closed = await closeApplicationTaskDirect({
          projectRoot, taskId: record.taskId, outcome: "accepted",
          operationId: `app-block-repair:${record.taskId}:${last.at}`,
          note: `应用核验通过（${verification.checked} 项证据；字节 sha256 重算）`, now,
        });
        if (closed.ok !== true) {
          systemRow(projectRoot, `[Block·系统] ${blockId} 修复任务收口失败：${closed.code}：${closed.message}（不判 fixed）。`);
          return;
        }
      }
      const resolved = await resolveBlock({
        projectRoot, blockId, resolution: "fixed", by: created.to || "engine",
        reEntry: `repair-task:${record.taskId}`,
        note: `应用核验通过（${verification.checked} 项证据；字节 sha256 重算）`,
        now,
      });
      if (!resolved.ok) {
        systemRow(projectRoot, `[Block·系统] ${blockId} fixed 结算写入失败：${resolved.code}：${resolved.message}`);
        return;
      }
      diagnosticFor(projectRoot).record("block.resolved", { blockId, resolution: "fixed", by: created.to, taskId: record.taskId });
      await reEnterAfterFixed(projectRoot, blockId);
    } finally {
      repairInFlight.delete(`${projectRoot}\u0000${record.taskId}`);
    }
  };

  const factHighRisk = (lifecycle: BlockLifecycle): boolean => lifecycle.class === "high-risk";

  /** 用账本事实重建最小 BlockFact（审计/恢复路径；不采信模型自报）。 */
  const blockFactFromLifecycle = (lifecycle: BlockLifecycle): BlockFact => ({
    protocol: lifecycle.protocol,
    kind: "task.reported",
    ...(lifecycle.code !== undefined ? { code: lifecycle.code } : {}),
    ...(lifecycle.workflowId !== undefined ? { workflowId: lifecycle.workflowId } : {}),
    ...(lifecycle.flowId !== undefined ? { flowId: lifecycle.flowId } : {}),
    ...(lifecycle.stage !== undefined ? { stage: lifecycle.stage } : {}),
    ...(lifecycle.taskId !== undefined ? { taskId: lifecycle.taskId } : {}),
    ...(lifecycle.requestId !== undefined ? { requestId: lifecycle.requestId } : {}),
    summary: lifecycle.summary,
    fingerprintMaterial: [lifecycle.protocol, lifecycle.workflowId ?? "", lifecycle.stage ?? "", lifecycle.taskId ?? "", lifecycle.code ?? "", lifecycle.summary],
    highRisk: lifecycle.class === "high-risk",
    judgeAvailable: host.decisionDelegationEnabled(),
  });

  /** 证据重算（不采信自报）：路径必须项目相对、可读；raise 时的 `path#sha256=` 期望必须一致。 */
  const verifyRepairEvidence = async (
    projectRoot: string,
    lifecycle: BlockLifecycle,
    evidence: readonly string[],
  ): Promise<{ ok: true; checked: number } | { ok: false; reason: string }> => {
    const expected = new Map<string, string>();
    for (const ref of lifecycle.evidenceRefs) {
      const hashIndex = ref.indexOf("#sha256=");
      if (hashIndex > 0) expected.set(ref.slice(0, hashIndex), ref.slice(hashIndex + "#sha256=".length));
    }
    const readable: { path: string; sha256: string }[] = [];
    for (const raw of evidence) {
      const rel = projectRelativePathOf(raw);
      if (rel === undefined) continue;
      try {
        const bytes = await fs.promises.readFile(path.join(projectRoot, ...rel.split("/")));
        readable.push({ path: rel, sha256: sha256Hex(bytes) });
      } catch {
        /* 不可读 ⇒ 不计入（下方按缺失处理） */
      }
    }
    if (lifecycle.class === "missing-resource" && readable.length === 0) {
      return { ok: false, reason: "missing-resource 修复必须给出至少一个可读的项目内证据文件（应用重算 hash）" };
    }
    for (const [expectedPath, expectedHash] of expected) {
      const found = readable.find((entry) => entry.path === expectedPath);
      if (found === undefined) return { ok: false, reason: `证据路径不可读/缺失：${expectedPath}` };
      if (found.sha256 !== expectedHash) return { ok: false, reason: `证据 hash 不符：${expectedPath}（应用重算 ${found.sha256} ≠ 期望 ${expectedHash}）` };
    }
    return { ok: true, checked: readable.length };
  };

  // —————————————— 事实入口 ——————————————

  const handleFact = async (projectRoot: string, rawFact: BlockFact): Promise<void> => {
    const fact = enrichFact(rawFact);
    const blockId = computeBlockId(fact);
    const selfKey = `${projectRoot}\u0000${blockId}`;
    if (selfFacts.has(selfKey)) return;
    const ledger = await readBlockLedger(projectRoot);
    if (ledger.badLines > 0) {
      systemRow(projectRoot, `[Block·系统] blocks.jsonl 存在 ${ledger.badLines} 条坏行；fail-closed：不新增/不猜。`);
      return;
    }
    const replay = replayBlockLifecycles(ledger.events);
    const existing = replay.records.get(blockId);
    if (existing !== undefined) {
      if (existing.status === "resolved") {
        diagnosticFor(projectRoot).record("block.repeat.after-resolved", { blockId });
        return;
      }
      if (existing.status === "raised") {
        // 上次 raise 后未路由（崩溃/异常）：按当前事实补路由。
        const decision = decideBlockRoute(fact, policy);
        await executeRoute(projectRoot, blockId, decision, fact, "recover-route");
        return;
      }
      const repeatKey = `${projectRoot}\u0000${blockId}`;
      if (repeatEscalated.has(repeatKey)) {
        diagnosticFor(projectRoot).record("block.repeat.suppressed", { blockId });
        return;
      }
      repeatEscalated.add(repeatKey);
      const decision = decideBlockRoute({ ...fact, priorOccurrences: Math.max(existing.routeCount, 1) }, policy);
      const target: BlockEscalationTarget = decision.highRisk
        ? "customer-decision"
        : decision.class === "budget-quota" && decision.sovereign
          ? "customer-decision"
          : "executor-replace";
      await escalateThenRoute(
        projectRoot, blockId, existing, target, "repeat",
        `同一 block 的同一指纹再次出现（已路由 ${existing.routeCount} 次）；禁止原样循环。`,
        decision, fact,
      );
      return;
    }
    const raised = await raiseBlock({ projectRoot, fact, policy, now });
    if (!raised.ok) {
      systemRow(projectRoot, `[Block·系统] block 未登记（${raised.code}）：${raised.message}`);
      return;
    }
    diagnosticFor(projectRoot).record("block.raised", {
      blockId: raised.blockId, class: raised.class, code: fact.code ?? fact.kind, protocol: fact.protocol, replay: raised.replay,
    });
    const decision = decideBlockRoute({ ...fact, priorOccurrences: raised.priorOccurrences }, policy);
    if (raised.repeatedFingerprint) {
      // 新块已被分类为 repeat-rejection：先 escalated 再 routed（账本强制）。
      const target: BlockEscalationTarget = decision.highRisk ? "customer-decision" : "executor-replace";
      const lifecycle = await readLifecycle(projectRoot, raised.blockId);
      if (lifecycle !== undefined) {
        await escalateThenRoute(projectRoot, raised.blockId, lifecycle, target, "repeat", decision.escalation?.note ?? "同指纹重复达到阈值。", decision, fact);
      }
      return;
    }
    await executeRoute(projectRoot, raised.blockId, decision, fact, "initial");
  };

  // —————————————— tick：漏账扫描 / stall / 修复超时 / 提醒 ——————————————

  const scanStageBlockedFacts = async (projectRoot: string): Promise<void> => {
    const ledger = await readWorkflowLedger(projectRoot);
    const blocks = await readBlockLedger(projectRoot);
    const raised = new Set(blocks.events.filter((event) => event.kind === "block.raised").map((event) => event.blockId));
    const protocols = new Map<string, WorkflowProtocol>();
    const eventsByWorkflow = new Map<string, typeof ledger.events>();
    for (const event of ledger.events) {
      if (event.kind === "workflow.started") protocols.set(event.workflowId, event.protocol ?? WORKFLOW_PROTOCOL_FIXED_V2_1);
      const list = eventsByWorkflow.get(event.workflowId) ?? [];
      list.push(event);
      eventsByWorkflow.set(event.workflowId, list);
    }
    for (const event of ledger.events) {
      if (event.kind !== "stage.blocked") continue;
      // 2026-11-20：历史 blocked 已被后续进度取代 ⇒ 不补块（恢复后不制造陈旧 block/修复简报）。
      // 只对「该 workflow 最新且未被后续事件超越」的 blocked 事实入账。
      const later = (eventsByWorkflow.get(event.workflowId) ?? [])
        .some((candidate) => candidate !== event && Date.parse(candidate.at) > Date.parse(event.at)
          && candidate.kind !== "stage.blocked");
      if (later) continue;
      const protocol = protocols.get(event.workflowId) ?? WORKFLOW_PROTOCOL_FIXED_V2_1;
      const fact = blockFactFromStageBlocked(event, {
        protocol,
        judgeAvailable: host.decisionDelegationEnabled(),
        source: "block-router.stage-blocked-scan",
      });
      const blockId = computeBlockId(enrichFact(fact));
      if (raised.has(blockId)) continue;
      await handleFact(projectRoot, fact);
    }
  };

  const hasOpenCardForWorkflow = (state: TaskReplay, workflowId: string): boolean => {
    const latest = new Map<string, "open" | "closed">();
    for (const event of state.events) {
      if (event.kind === "request.created" && event.workflowId === workflowId) latest.set(event.requestId, "open");
      else if ((event.kind === "request.resolved" || event.kind === "request.orphaned") && latest.has(event.requestId)) {
        latest.set(event.requestId, "closed");
      }
    }
    for (const status of latest.values()) if (status === "open") return true;
    return false;
  };

  const hasOpenRepairTaskForWorkflow = (state: TaskReplay, workflowId: string): boolean =>
    [...state.records.values()].some((record) => record.created?.workflowId === workflowId
      && record.created.taskKind === BLOCK_REPAIR_TASK_KIND && record.closed === undefined);

  const lastProgressAtOf = (workflowId: string, wfEvents: readonly { at: string; kind: string }[], taskState: TaskReplay): string | undefined => {
    let last: string | undefined;
    const consider = (at: string | undefined): void => {
      if (at === undefined || Number.isNaN(Date.parse(at))) return;
      if (last === undefined || Date.parse(at) > Date.parse(last)) last = at;
    };
    for (const event of wfEvents) consider(event.at);
    for (const event of taskState.events) {
      if ("taskId" in event && typeof event.taskId === "string") {
        const record = taskState.records.get(event.taskId);
        if (record?.created?.workflowId === workflowId || event.kind === "task.reported" || event.kind === "task.closed") {
          if (record?.created?.workflowId === workflowId) consider(event.at);
        }
      }
      if (event.kind === "request.created" && event.workflowId === workflowId) consider(event.at);
      if (event.kind === "request.resolved" && event.workflowId === workflowId) consider(event.at);
    }
    return last;
  };

  const checkStall = async (projectRoot: string): Promise<void> => {
    if (host.isBusy?.(projectRoot) === true) return; // 合法长回合（保守排除）
    const wfLedger = await readWorkflowLedger(projectRoot);
    const taskState = await readTaskState(projectRoot);
    const blockLedger = await readBlockLedger(projectRoot);
    const openBlocks = listOpenBlocks(blockLedger.events);
    const openWorkflows = new Set(openBlocks.map((block) => block.workflowId).filter((id): id is string => id !== undefined));
    const startedByWorkflow = new Map<string, Extract<WorkflowEvent, { kind: "workflow.started" }>>();
    for (const event of wfLedger.events) {
      if (event.kind === "workflow.started") startedByWorkflow.set(event.workflowId, event);
    }
    for (const [workflowId, started] of startedByWorkflow) {
      const wfEvents = wfLedger.events.filter((event) => event.workflowId === workflowId);
      const view = deriveWorkflowView(wfEvents, taskState.events);
      if (view.closed !== undefined || view.stopping === true) continue;
      if (openWorkflows.has(workflowId)) continue; // 已有 open block（T_repair/T_remind 负责推进）
      if (hasOpenCardForWorkflow(taskState, workflowId)) continue;
      if (hasOpenRepairTaskForWorkflow(taskState, workflowId)) continue;
      const lastProgressAt = lastProgressAtOf(workflowId, wfEvents, taskState);
      if (lastProgressAt === undefined) continue;
      const protocol = started.protocol ?? WORKFLOW_PROTOCOL_FIXED_V2_1;
      const fact = blockFactFromStallTick({
        protocol,
        workflowId,
        flowId: view.flowId,
        ...(view.stage !== undefined ? { stage: view.stage } : {}),
        lastProgressAt,
        now: now().toISOString(),
        inFlightTurn: false,
        openCard: false,
        openRepairTask: false,
        judgeAvailable: host.decisionDelegationEnabled(),
      }, policy);
      if (fact === undefined) continue;
      diagnosticFor(projectRoot).record("block.stall.detected", { workflowId, lastProgressAt });
      await handleFact(projectRoot, fact);
    }
  };

  const checkRepairTimeoutsAndReminders = async (projectRoot: string): Promise<void> => {
    const ledger = await readBlockLedger(projectRoot);
    if (ledger.badLines > 0) return;
    const open = listOpenBlocks(ledger.events);
    const currentMs = now().getTime();
    for (const lifecycle of open) {
      if (lifecycle.status !== "routed" && lifecycle.status !== "escalated") continue;
      const updatedMs = Date.parse(lifecycle.updatedAt);
      const ageMs = Number.isFinite(updatedMs) && currentMs >= updatedMs ? currentMs - updatedMs : 0;
      if ((lifecycle.routeKind === "owner-repair" || lifecycle.routeKind === "engine-auto-fix") && ageMs >= timings.repairMs) {
        const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: false }, policy);
        // 第一次超时换属主/引擎；第二次仍超时（或高危/重复/预算类）⇒ 客户决策（不得无限换属主）。
        const toCustomer = lifecycle.escalationCount >= 1
          || lifecycle.class === "high-risk"
          || lifecycle.class === "repeat-rejection"
          || lifecycle.class === "budget-quota";
        const target: BlockEscalationTarget = toCustomer ? "customer-decision" : "owner-reassign";
        const key = `repair-timeout:${projectRoot}\u0000${lifecycle.blockId}:${lifecycle.escalationCount}`;
        if (!reminded.has(key)) {
          reminded.add(key);
          await escalateThenRoute(projectRoot, lifecycle.blockId, lifecycle, target, "repair-timeout",
            `修复/自动修复等待超过 T_repair=${Math.floor(timings.repairMs / 60000)}min（${lifecycle.routeKind}）；升级（不是继续等）。`,
            decision, blockFactFromLifecycle(lifecycle));
        }
        continue;
      }
      if ((lifecycle.routeKind === "customer-decision" || lifecycle.routeKind === "judge-decision") && ageMs >= timings.remindMs) {
        const key = `remind:${projectRoot}\u0000${lifecycle.blockId}`;
        if (!reminded.has(key)) {
          reminded.add(key);
          systemRow(projectRoot,
            `[Block·提醒] #${lifecycle.blockId}（${lifecycle.classCode} ${lifecycle.class}）等待客户决策已 ${Math.floor(ageMs / 60000)} 分钟；同一张卡（不重弹），无答复不执行。`,
            host.governanceOwner(projectRoot));
          diagnosticFor(projectRoot).record("block.card.reminded", { blockId: lifecycle.blockId });
        }
      }
      if (lifecycle.routeKind === "owner-repair" && lifecycle.routeTaskId === undefined) {
        // fixed-v2.1 修复简报：以账本进度作为「修复已发生」的应用事实（不采信自报）。
        const progress = await hasWorkflowProgressSince(projectRoot, lifecycle);
        if (progress) {
          const resolved = await resolveBlock({
            projectRoot, blockId: lifecycle.blockId, resolution: "fixed", by: lifecycle.owner ?? "engine",
            reEntry: "ledger-progress", note: "属主修复后账本出现新进度（应用核验）。", now,
          });
          if (resolved.ok) {
            diagnosticFor(projectRoot).record("block.resolved", { blockId: lifecycle.blockId, resolution: "fixed", by: lifecycle.owner ?? "engine" });
            await reEnterAfterFixed(projectRoot, lifecycle.blockId);
          }
        }
      }
    }
  };

  const hasWorkflowProgressSince = async (projectRoot: string, lifecycle: BlockLifecycle): Promise<boolean> => {
    const raisedMs = Date.parse(lifecycle.raisedAt);
    if (!Number.isFinite(raisedMs)) return false;
    if (lifecycle.workflowId !== undefined) {
      const ledger = await readWorkflowLedger(projectRoot);
      const progressed = ledger.events.some((event) => event.workflowId === lifecycle.workflowId
        && Date.parse(event.at) > raisedMs && event.kind !== "stage.blocked" && event.kind !== "workflow.stop-requested");
      if (progressed) return true;
    }
    if (lifecycle.taskId !== undefined) {
      const state = await readTaskState(projectRoot);
      return state.events.some((event) => "taskId" in event && event.taskId === lifecycle.taskId
        && Date.parse(event.at) > raisedMs
        && (event.kind === "task.reported" || event.kind === "task.closed")
        && (event.kind !== "task.reported" || event.status === "done"));
    }
    return false;
  };

  // —————————————— 恢复（启动/打开项目） ——————————————

  const recoverBlock = async (projectRoot: string, lifecycle: BlockLifecycle): Promise<void> => {
    // 卡裁决已落账 ⇒ 执行选项/结算（进程重启后仍能收口）。
    if (lifecycle.status === "routed" && (lifecycle.routeKind === "customer-decision" || lifecycle.routeKind === "judge-decision")) {
      const requestId = blockCardRequestId(lifecycle.blockId);
      const state = await readTaskState(projectRoot);
      const requestState = findRequestState(state, requestId);
      if (requestState.resolution !== undefined) {
        const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: lifecycle.routeKind === "judge-decision" }, policy);
        await handleCardResolution(projectRoot, lifecycle.blockId, decision, blockFactFromLifecycle(lifecycle), requestState.resolution, requestId);
        return;
      }
      if (requestState.created && !requestState.orphaned) return; // 已在等客户
      // orphaned/缺席 ⇒ 同 requestId 重呈（不重弹新卡；幂等）。
      const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: lifecycle.routeKind === "judge-decision" }, policy);
      await routeCard(projectRoot, lifecycle.blockId, decision, blockFactFromLifecycle(lifecycle), lifecycle.routeKind === "judge-decision" ? "judge" : "customer", "recover");
      return;
    }
    if (lifecycle.status === "routed" && lifecycle.routeKind === "owner-repair" && lifecycle.routeTaskId !== undefined) {
      const state = await readTaskState(projectRoot);
      const record = state.records.get(lifecycle.routeTaskId);
      if (record !== undefined && record.reports.length > 0 && record.closed === undefined) {
        await handleRepairReport(projectRoot, record);
        return;
      }
      return; // T_repair 在 tick 中处理
    }
    if (lifecycle.status === "routed" && lifecycle.routeKind === "engine-auto-fix") {
      // 引擎动作可能停在进行中（崩溃）：重放一次（受上限约束）。
      const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: host.decisionDelegationEnabled() }, policy);
      await executeRoute(projectRoot, lifecycle.blockId, decision, blockFactFromLifecycle(lifecycle), "recover-engine");
      return;
    }
    if (lifecycle.status === "raised" || lifecycle.status === "escalated") {
      const decision = decideBlockRoute({ ...blockFactFromLifecycle(lifecycle), judgeAvailable: host.decisionDelegationEnabled() }, policy);
      await executeRoute(projectRoot, lifecycle.blockId, decision, blockFactFromLifecycle(lifecycle), `recover-${lifecycle.status}`);
    }
  };

  const recover = async (projectRoot: string): Promise<void> => {
    await serialize(projectRoot, async () => {
      await scanStageBlockedFacts(projectRoot);
      const ledger = await readBlockLedger(projectRoot);
      if (ledger.badLines > 0) {
        systemRow(projectRoot, `[Block·系统] blocks.jsonl 存在 ${ledger.badLines} 条坏行；恢复只读（不猜、不追加）。`);
        return;
      }
      const open = listOpenBlocks(ledger.events);
      for (const lifecycle of open) {
        await recoverBlock(projectRoot, lifecycle);
      }
      await checkRepairTimeoutsAndReminders(projectRoot);
    });
  };

  const tick = async (projectRoot: string): Promise<void> => {
    await serialize(projectRoot, async () => {
      await scanStageBlockedFacts(projectRoot);
      await checkStall(projectRoot);
      await checkRepairTimeoutsAndReminders(projectRoot);
    });
  };

  /** P27 选项 → 既有重派动作的映射（terminate 只能客户选；judge 不可代选主权项）。 */
  const REDISPATCH_OPTION_TO_SELECTION: Readonly<Record<string, "continue" | "redispatch" | "replace" | "terminate">> = Object.freeze({
    "block-accept-current-state": "continue",
    "block-accept-with-limits": "continue",
    "block-rework": "redispatch",
    "block-retry-with-cap": "redispatch",
    "block-revise-scope": "redispatch",
    "block-replace-executor": "replace",
    "block-terminate-flow": "terminate",
  });

  const escalateRedispatchBlock: BlockRouter["escalateRedispatchBlock"] = async (projectRoot, input) => {
    const fact: BlockFact = {
      protocol: WORKFLOW_PROTOCOL_FIXED_V2_1,
      kind: "redispatch",
      code: "redispatch-exhausted",
      summary: `任务 ${input.taskId} 同链已重派 ${input.attempts} 次（上限）；升级为 block 决策（推荐修复向；终止只能客户显式选择）。`,
      taskId: input.taskId,
      ...(input.taskFlowId !== undefined ? { flowId: input.taskFlowId } : {}),
      ...(input.targetRoleId !== undefined ? { ownerRoleId: input.targetRoleId } : {}),
      attempts: input.attempts,
      judgeAvailable: host.decisionDelegationEnabled(),
      fingerprintMaterial: ["redispatch-exhausted", input.rootTaskId, String(input.attempts)],
    };
    await observeFact(projectRoot, fact);
    const blockId = computeBlockId(enrichFact(fact));
    const requestId = blockCardRequestId(blockId);
    // 2026-11-20（收尾修补 R4b）：同链再次 redispatch 时，已 resolved 的 block 结果**复用**，
    // 绝不回退旧 `task-escalation-*` 卡（除非 block 从未呈现且未结算——那时才回退旧通道）。
    const settledNow = await readLifecycle(projectRoot, blockId);
    if (settledNow?.status === "resolved") {
      if (settledNow.resolution === "decided") {
        const settledOption = settledNow.reEntry ?? "";
        const settledSelected = REDISPATCH_OPTION_TO_SELECTION[settledOption];
        return {
          handled: true,
          requestId,
          ...(settledSelected !== undefined ? { selected: settledSelected } : {}),
          message: `block 升级卡此前已裁决（${settledOption || "未知选项"}）；复用结果，不回退旧卡。`,
        };
      }
      return { handled: true, requestId, message: "block 已 fixed；不回退旧升级卡。" };
    }
    const pending = cardPromises.get(`${projectRoot}\u0000${requestId}`);
    if (pending === undefined) {
      return { handled: false, requestId, message: "block 升级卡未呈现（无通道/未结算）；回退既有升级通道。" };
    }
    await pending.catch(() => undefined);
    const lifecycle = await readLifecycle(projectRoot, blockId);
    if (lifecycle === undefined || lifecycle.status !== "resolved" || lifecycle.resolution !== "decided") {
      return { handled: true, requestId, message: "block 升级卡已呈现/等待裁决（不代选、不重弹；不新增旧式升级卡）。" };
    }
    const optionId = lifecycle.reEntry ?? "";
    const selected = REDISPATCH_OPTION_TO_SELECTION[optionId];
    if (selected === undefined) {
      return { handled: false, requestId, message: `裁决选项 ${optionId || "（缺）"} 无法映射到重派动作。` };
    }
    return { handled: true, requestId, selected, message: `block 升级卡已裁决：${optionId} → ${selected}。` };
  };

  const observeFact: BlockRouter["observeFact"] = (projectRoot, fact) =>
    serialize(projectRoot, () => handleFact(projectRoot, fact));
  const observeFactLater: BlockRouter["observeFactLater"] = (projectRoot, fact) => {
    void observeFact(projectRoot, fact).catch(() => undefined);
  };
  const observeTaskReport: BlockRouter["observeTaskReport"] = (projectRoot, taskId) =>
    serialize(projectRoot, () => handleTaskReport(projectRoot, taskId));

  return {
    observeFact,
    observeFactLater,
    observeFactListLater(projectRoot, facts) {
      for (const fact of facts) observeFactLater(projectRoot, fact);
    },
    observeTaskReport,
    observeTaskReportLater(projectRoot, taskId) {
      void observeTaskReport(projectRoot, taskId).catch(() => undefined);
    },
    observeShellDenialLater(projectRoot, input) {
      if (projectRoot === undefined || projectRoot === "") return;
      const reason = (BLOCK_SHELL_DENIAL_REASONS as readonly string[]).includes(input.reason)
        ? input.reason as BlockShellDenialReason
        : undefined;
      if (reason === undefined) return;
      const fact = blockFactFromShellDenial({
        reason,
        ...(input.command !== undefined ? { command: input.command } : {}),
        summary: `shell ${reason}${input.roleId !== undefined ? `（${input.roleId}）` : ""}`,
      });
      observeFactLater(projectRoot, fact);
    },
    tick,
    tickLater(projectRoot) {
      void tick(projectRoot).catch(() => undefined);
    },
    recover,
    recoverLater(projectRoot) {
      void recover(projectRoot).catch(() => undefined);
    },
    blockIdOf(fact) {
      return computeBlockId(enrichFact(fact));
    },
    escalateRedispatchBlock,
  };
}
