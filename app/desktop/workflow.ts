// app/desktop/workflow.ts
// T3「两条固定工作流路径」B1（2026-11-10，桌面窗口）：桌面侧 workflow 模式/路由**薄层 + 常量**。
//
// 依据：实现级方案 v1.3 §3.2（会话层路由改法）/§4.1（per-flow 模式、不缓存项目级单值）/
// §9.4（模式切换）、§3.6（run-role 注入 `workflowModeForFlow`）；B1 验收 AC-12/AC-23、T-05。
//
// 纪律：
//  · **单一实现 = 编排**：模式判定只读委托 `src/common/编排/workflow-service.ts::workflowMode`
//    （本层不复制 per-flow 规则/账本读取/状态机业务）；每次调用现场解析，**不缓存项目级单值**
//    （混合项目 legacy 在飞 flow 与新 fixed flow 并存）。
//  · 失败方向 = fail-closed **legacy**（配置不可解析/回调异常 ⇒ 不猜 fixed；与 run-role 同口径）。
//  · 本模块不授予任何写权/派发权：fixed 路由的硬授权仍在 `workflow-dispatch.ts` 谓词与
//    `app/desktop/session.ts::routeFixedPathDispatch`；本层只提供模式选择与注入形态。
//  · legacy 注入集合/顺序由 `session.ts` 原样保留；本模块的常量只供 fixed 过滤消费。

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { WORKFLOW_LEDGER_SCHEMA } from "../../src/model/runtime.ts";
import type { DispatchTaskPayload, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { FIXED_DISPATCH_MATRIX, stageRequestIdempotencyKey } from "../../src/common/编排/workflow-dispatch.ts";
import { canDispatchStage, canRequestStage, deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendWorkflowEvent, readWorkflowLedger, recordChangeScopeDecision, recordStageDispatch } from "../../src/common/编排/workflow-service.ts";
import type { PathBWriteSet, WorkflowServiceFailure } from "../../src/common/编排/workflow-service.ts";
import {
  prepareFixedPathStart,
  workflowMode as orchestrationWorkflowMode,
  type WorkflowMode,
} from "../../src/common/编排/workflow-service.ts";

export type { WorkflowMode };

/** fixed 矩阵模式 token（单一来源 = 编排 `workflow-dispatch.ts`；本层只再导出，不复制字面量语义）。 */
export const DESKTOP_FIXED_DISPATCH_MATRIX = FIXED_DISPATCH_MATRIX;

/**
 * fixed 会话**不注入**的 legacy 治理型 direct 能力（v1.3 §3.6/§6.5；AC-23 冻结清单）：
 * Git 治理三段式、run 择时、stable 写入许可、refactor/版本变更/VCA 决策。
 * 保留注入（按角色允许）：`close_created_task`/`complete_team_plan`/`activate_role_documents`/
 * `request_choice`/`request_confirmation`/`submit_report`/`doc_format`/`governance_matrix` 等。
 * 本常量只表达「legacy-only」；fixed 侧不新增 `request_release_merge`（G-IR 拒绝新增）。
 */
export const LEGACY_ONLY_DIRECT_CAPABILITIES: readonly string[] = Object.freeze([
  "git_query",
  "git_candidate",
  "git_publish",
  "select_run_change",
  "request_stable_write",
  "submit_refactor",
  "submit_version_change",
  "request_version_decision",
]);

export function isLegacyOnlyDirectCapability(toolName: string): boolean {
  return LEGACY_ONLY_DIRECT_CAPABILITIES.includes(toolName);
}

/**
 * 按 flow 解析工作流模式（桌面入口；**不缓存**）。
 * - 空 flowId ⇒ `legacy`（与编排 `workflowMode` 的旧行为入口一致：无 flow 的旧调用不走 fixed）；
 * - 委托编排 `workflowMode`（project.json 默认/强制 + 在飞 legacy run/trunk 判定）；
 * - 任意异常 ⇒ `legacy`（fail-closed；绝不把不确定当 fixed）。
 */
export async function resolveWorkflowMode(projectRoot: string, flowId: string): Promise<WorkflowMode> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return "legacy";
  try {
    return await orchestrationWorkflowMode(projectRoot, flow);
  } catch {
    return "legacy";
  }
}

/**
 * `openRoleSession` 的 `workflowModeForFlow` 注入形态：run-role 在**每次卡/任务/写门禁**按实际
 * flowId 调用本回调解析（不缓存项目级单值；v1.3 §3.6）。经 B1 启用闸（见 `resolveFixedPathMode`）。
 */
export function workflowModeForFlowResolver(
  projectRoot: string,
): (flowId: string) => Promise<WorkflowMode> {
  return (flowId: string) => resolveFixedPathMode(projectRoot, flowId);
}

/**
 * **B1 启用闸（legacy 兼容）**：fixed 路由/注入只在该项目**显式** `workflowSchema:"two-fixed-paths/v1"`，
 * 或该 flow 已有 fixed workflow（`workflow.started`）时启用；其余（缺省/`legacy/v1`/配置不可解析）
 * ⇒ 不启用（走 legacy）。依据：v1.3 §4.1 第 4 条——首次 fixed workflow 启动时由应用原子写
 * `workflowSchema`（B3）；在此之前旧项目/旧夹具一律 legacy（AC-03「legacy 断言不改」；fixed 角色卡/
 * 工具面属 B2，提前按 fixed 解析会把既有 `decision` 等卡 fail-closed）。纯读、不授权任何写权。
 */
export async function isFixedPathEnabledForFlow(projectRoot: string, flowId: string): Promise<boolean> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return false;
  const schema = await readProjectWorkflowSchemaValue(projectRoot);
  if (schema === "two-fixed-paths/v1") return true;
  if (schema === "legacy/v1") return false;
  if (schema === "invalid") return false;
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    return ledger.events.some((event) => event.flowId === flow && event.kind === "workflow.started");
  } catch {
    return false;
  }
}

type ProjectWorkflowSchemaValue = "two-fixed-paths/v1" | "legacy/v1" | "invalid" | undefined;

/** `.ans/project.json` 的 `workflowSchema`（只读；缺省/坏配置不猜 fixed）。 */
async function readProjectWorkflowSchemaValue(projectRoot: string): Promise<ProjectWorkflowSchemaValue> {
  let text: string;
  try {
    text = await fs.readFile(path.join(projectRoot, ".ans", "project.json"), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : "invalid";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
  const value = (parsed as Record<string, unknown>)["workflowSchema"];
  if (value === undefined) return undefined;
  return value === "two-fixed-paths/v1" || value === "legacy/v1" ? value : "invalid";
}

/**
 * 桌面路由/注入实际使用的模式：**B1 启用闸 + 编排 `workflowMode`**（不缓存；空 flow/闸未启用/异常
 * ⇒ `legacy`，不猜 fixed）。启用后仍以编排 `workflowMode` 为准（legacy 在飞 flow 继续 legacy）。
 */
export async function resolveFixedPathMode(projectRoot: string, flowId: string): Promise<WorkflowMode> {
  if (!(await isFixedPathEnabledForFlow(projectRoot, flowId))) return "legacy";
  return resolveWorkflowMode(projectRoot, flowId);
}

/**
 * 会话级模式（工具注入面用）：与 run-role 的会话级判定同口径——
 * 输入任务（`taskId`）的 `created.flowId` ⇒ 该 flow 的模式；无任务/无 flow ⇒ `legacy`。
 * run-role 仍会独立解析同一模式（本函数不替代其判定；桌面侧按同一事实做注入过滤的纵深防御）。
 */
export async function sessionWorkflowModeForTask(
  projectRoot: string,
  taskId: string | undefined,
): Promise<WorkflowMode> {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (id === "") return "legacy";
  try {
    const state = await readTaskState(projectRoot);
    const flowId = state.records.get(id)?.created?.flowId;
    return flowId === undefined ? "legacy" : await resolveFixedPathMode(projectRoot, flowId);
  } catch {
    return "legacy";
  }
}

/** 被派任务的 flowId（trim；缺省空串——空 flow 的旧调用逐字走 legacy，不经 fixed 路由）。 */
export function dispatchFlowIdOf(payload: DispatchTaskPayload | undefined): string {
  const raw = payload !== undefined && typeof payload.flowId === "string" ? payload.flowId : "";
  return raw.trim();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3（2026-11-10，桌面窗口）：首次 fixed 启动顺序 / fixed 面板模式 / merge-main 应用通道薄层
//
// 依据：v1.3 §4.1 第 4 条（首次 fixed workflow 启动时应用原子写 `workflowSchema`）、§6.4/§8.4
// （merge-main 应用自有非判断卡、客户本人）、§6.5/§7.4（fixed 模式 VCA/trunk/stable 面板隐藏/只读）；
// B3 验收 AC-12/AC-14/AC-22/AC-23、T-05/T-10。
// 纪律：本层只排序/投影/构造请求文本；模式判定与写回仍委托编排（单一实现），不复制业务。
// ══════════════════════════════════════════════════════════════════════════════════════════════

export type FixedPathStartOutcome =
  | { ok: true; mode: WorkflowMode; configChanged: boolean; explicitLegacy: boolean }
  | { ok: false; code: "project-config-write-failed"; message: string };

/**
 * **首次 fixed 派发前的启动顺序**（B1 启用闸的鸡生蛋解法；v1.3 §4.1 第 4 条）：
 * 1. 委托编排 `prepareFixedPathStart` 原子写 `.ans/project.json workflowSchema:"two-fixed-paths/v1"`
 *    （保留既有键；已显式 `"legacy/v1"` **不覆盖**；坏文件 ⇒ `project-config-write-failed` fail-closed）；
 * 2. 以启用闸 + 编排 `workflowMode` 复核该 flow 的实际模式（legacy 在飞 flow 仍 legacy）。
 *
 * 仅在 chief 首次发起 fixed 工作流（首个 stage-request 携带 `workflowPath`）时调用；其余派发路径不写配置。
 * 不授予任何写权/派发权。
 */
export async function ensureFixedPathStarted(projectRoot: string, flowId: string): Promise<FixedPathStartOutcome> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return { ok: true, mode: "legacy", configChanged: false, explicitLegacy: false };
  let started: { ok: boolean; code?: string; message?: string; config?: { changed: boolean; skipped?: "explicit-legacy" }; workflowMode?: WorkflowMode };
  try {
    started = await prepareFixedPathStart({ projectRoot, flowId: flow });
  } catch (error) {
    return { ok: false, code: "project-config-write-failed", message: error instanceof Error ? error.message : String(error) };
  }
  if (!started.ok) {
    return { ok: false, code: "project-config-write-failed", message: started.message ?? "首次 fixed 启动写回 `.ans/project.json` 失败。" };
  }
  const configChanged = started.config?.changed === true;
  const explicitLegacy = started.config?.skipped === "explicit-legacy";
  const mode = (await isFixedPathEnabledForFlow(projectRoot, flow)) ? await resolveFixedPathMode(projectRoot, flow) : "legacy";
  return { ok: true, mode, configChanged, explicitLegacy };
}

/**
 * 该 flow 的活动 fixed workflowId（最新 `workflow.started` 且未 `workflow.closed`）。
 * 供固定卡 `request.created/resolved` 的 `workflowId/stage` 戳（应用写入，不采信模型自报）。
 */
export async function activeFixedWorkflowIdFor(projectRoot: string, flowId: string): Promise<string | undefined> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return undefined;
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    const byWorkflow = new Map<string, { startedAt: string; closed: boolean; matchesFlow: boolean }>();
    for (const event of ledger.events) {
      const current = byWorkflow.get(event.workflowId);
      if (event.kind === "workflow.started") {
        byWorkflow.set(event.workflowId, {
          startedAt: event.at,
          closed: current?.closed === true,
          matchesFlow: event.flowId === flow,
        });
      } else if (event.kind === "workflow.closed" && current !== undefined && current.matchesFlow) {
        current.closed = true;
      }
    }
    const active = [...byWorkflow.entries()]
      .filter(([, value]) => value.matchesFlow && !value.closed)
      .sort((a, b) => (a[1].startedAt < b[1].startedAt ? 1 : -1));
    return active[0]?.[0];
  } catch {
    return undefined;
  }
}

/**
 * 项目级面板模式（VCA/trunk/stable 面板的显示面）：
 * - 显式 `two-fixed-paths/v1` ⇒ `fixed`（面板**隐藏/只读**：mutation IPC 拒绝、只读列表保留）；
 * - 显式 `legacy/v1` 或配置不可解析 ⇒ `legacy`（legacy 面板逐字不变）；
 * - 缺省 ⇒ 有任一固定 workflow 账本事件 ⇒ `fixed`，否则 `legacy`（旧项目/旧夹具零变化）。
 */
export async function resolveProjectFixedPanelMode(projectRoot: string): Promise<WorkflowMode> {
  const schema = await readProjectWorkflowSchemaValue(projectRoot);
  if (schema === "two-fixed-paths/v1") return "fixed";
  if (schema === "legacy/v1" || schema === "invalid") return "legacy";
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    return ledger.events.some((event) => event.kind === "workflow.started") ? "fixed" : "legacy";
  } catch {
    return "legacy";
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3.1（2026-11-10，桌面窗口）：fixed 发布自动呈卡触发窗口（merge-main）
//
// 依据：v1.3 §4.2 A12/A13、§4.3 B4、§6.4/§8.4；B1 AC-11/AC-14/AC-22；G-IR MF-IR-8。
// 纪律：触发只认**两个收口阶段**（A12b accepted / 路径 B B3 accepted）；是否真正可发布仍由编排
// `prepareReleaseMerge` 判定（前置缺失 ⇒ `release-workflow-not-ready`，不弹注定失败卡）。本层只表达
// 触发窗口，不复制发布前置/状态机业务、不授予任何确认/执行权。
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** fixed 路径「阶段 accepted ⇒ 应用自动呈 merge-main 卡」的触发阶段（A12b → A13 前；B3 → B4 前）。 */
export const FIXED_RELEASE_TRIGGER_STAGES = Object.freeze(["A12b", "B3"] as const);
export type FixedReleaseTriggerStage = (typeof FIXED_RELEASE_TRIGGER_STAGES)[number];

/** 该阶段收口（accepted 且阶段完成）是否触发发布自动呈卡；其他阶段一律不触发。 */
export function isFixedReleaseTriggerStage(stage: string | undefined): stage is FixedReleaseTriggerStage {
  return stage === "A12b" || stage === "B3";
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B5.1（2026-11-10，桌面窗口）：fixed 生产接线修复（B5 全链发现的 G-B5-1/G-B5-2/G-B5-3）
//
// 依据：B1 验收 AC-08/AC-09/AC-10/AC-13/AC-18；v1.3 §4.2/§4.3/§4.5/§7.1；B5 记录 §4 修复清单。
// 纪律：本层只做**应用接线**（按真实 task.created/卡事实调用已导出的编排服务/合法事件）；
// 状态机/幂等/属主派生/写集派生仍在编排（单一实现），本层不复制、不伪造事件、不授予写权；
// legacy 路径零变化（本段只被 fixed 路由/固定卡/路径 B 调用）。
// ══════════════════════════════════════════════════════════════════════════════════════════════

// —————————————— G-B5-1：stage.dispatched 生产落账 ——————————————

/**
 * 直派/阶段任务的 `stage.dispatched` 记账集合（v1.3 §4.5；B5 §4 修复清单 1）：
 * - A1/A4/A7：完成于目标任务创建（AC-08）——首条派发即 `stage.completed`（服务既有 `DISPATCH_COMPLETES`）；
 * - A8：激活任务派发 ⇒ A8 在办（完成由 `role.activated`/收口判定）；
 * - A12a/A12b：直派验收任务（AC-09 要求 A11 前 A12a 在办；A12b 在 A11 完成后派发）。
 * **不含** A11（`requestStage` 创建请求任务时已写 `stage.dispatched A11`，不得重复）、
 * A2/A5/A6/A9/A10（收口/卡/账本事件完成）与 B1/B3（B3 无 stage.dispatched 语义；B1 完成于收口）。
 */
export const FIXED_STAGE_DISPATCH_RECORD_STAGES = Object.freeze(["A1", "A4", "A7", "A8", "A12a", "A12b"] as const);
export type FixedStageDispatchRecordStage = (typeof FIXED_STAGE_DISPATCH_RECORD_STAGES)[number];
const FIXED_STAGE_DISPATCH_RECORD_SET: ReadonlySet<string> = new Set<string>(FIXED_STAGE_DISPATCH_RECORD_STAGES);

export function shouldRecordFixedStageDispatch(stage: WorkflowStage | undefined): stage is FixedStageDispatchRecordStage {
  return stage !== undefined && FIXED_STAGE_DISPATCH_RECORD_SET.has(stage);
}

export type FixedStageDispatchRecordOutcome =
  | { ok: true; recorded: boolean; replay: boolean }
  | WorkflowServiceFailure;

/**
 * fixed 任务创建后按真实 `task.created` 事实记 `stage.dispatched`（G-B5-1；服务 = `recordStageDispatch`）：
 * - 同 `(workflow, stage, taskId)` 已有派发事件 ⇒ 幂等 replay（A1/A4/A7 已完成态不因重复调用报错）；
 * - **状态机窗口外**（`canDispatchStage=false`，如 B1 既有夹具里 workflow 尚在 A1 的 A12a review 直派）
 *   ⇒ 不写、不阻断本次投递：投影本就不能接受该事件，照旧行为（不伪造 stage.dispatched）；
 * - 账本缺失/已关闭/损坏或服务写入失败 ⇒ fail-closed（如实返回稳定失败码，由调用方回报）。
 */
export async function recordFixedStageDispatchForTask(input: {
  projectRoot: string;
  workflowId: string;
  stage: WorkflowStage;
  taskId: string;
  targetRoleId: string;
  moduleId?: string;
  now?: () => Date;
}): Promise<FixedStageDispatchRecordOutcome> {
  if (!shouldRecordFixedStageDispatch(input.stage)) return { ok: true, recorded: false, replay: false };
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = ledger.events.filter((event) => event.workflowId === input.workflowId);
  if (wfEvents.length === 0) {
    return { ok: false, code: "workflow-not-found", message: `workflow ${input.workflowId} 不存在（stage.dispatched ${input.stage} 未记录）。` };
  }
  const dispatchKey = `stage-dispatch:${input.workflowId}:${input.stage}:${input.taskId}`;
  if (wfEvents.some((event) => event.kind === "stage.dispatched" && event.idempotencyKey === dispatchKey)) {
    return { ok: true, recorded: true, replay: true };
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  if (view.closed !== undefined) {
    return { ok: false, code: "workflow-closed", message: `workflow ${input.workflowId} 已关闭（${view.closed.outcome}），stage.dispatched ${input.stage} 未记录。` };
  }
  if (view.blocked?.code === "workflow-corrupt") {
    return { ok: false, code: "workflow-corrupt", message: `工作流账本损坏：${view.blocked.summary}（stage.dispatched ${input.stage} 未记录）。` };
  }
  if (!canDispatchStage(view, input.stage)) return { ok: true, recorded: false, replay: false };
  const recorded = await recordStageDispatch({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    stage: input.stage,
    taskId: input.taskId,
    targetRoleId: input.targetRoleId,
    ...(input.moduleId !== undefined ? { moduleId: input.moduleId } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  if (!recorded.ok) return recorded;
  return { ok: true, recorded: true, replay: recorded.replay };
}

// —————————————— G-B5-3：方案卡（A6）在办标记 ——————————————

/**
 * fixed proposal 卡（A6）**呈卡前**的在办标记（G-B5-3；与 run-role A10 `markFixedAppointmentCardRequested`
 * 同构）：写 `stage.requested A6`（幂等 `stage-request:<wf>:A6:1`，requestDigest = 方案依据（proposal）
 * 文档字节 sha256，requestTaskId = `proposal-card:<flowId>:<sha12>`），使客户 accept 后桌面
 * `stage.completed A6`（要求 `view.stage === "A6"`）可按状态机落账。
 *
 * **不新增客户门**：无活动 workflow（调用方已解析）、账本缺该 workflow、view 已关闭/blocked、
 * 当前不在「A5 已完成 → A6」窗口、或 A6 已在办/已完成（view.stage==="A6"）⇒ 不写、照常呈现卡；
 * 只有真正尝试写入且失败才返回稳定失败码（fail-closed，调用方不发卡）。
 * 同一幂等键重复调用由 `appendWorkflowEvent` replay 去重（不重复 marker）。
 */
export async function markFixedProposalCardRequested(input: {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  proposalSha256: string;
  now?: () => Date;
}): Promise<WorkflowServiceFailure | undefined> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = ledger.events.filter((event) => event.workflowId === input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  if (started === undefined || started.kind !== "workflow.started" || started.flowId !== input.flowId) return undefined;
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  if (view.closed !== undefined || view.blocked !== undefined) return undefined;
  if (view.path !== "A") return undefined;
  if (view.stage === "A6") return undefined;
  if (!(view.stage === "A5" && view.stages.A5.status === "completed") || !canRequestStage(view, "A6")) return undefined;
  const at = (input.now ?? (() => new Date()))().toISOString();
  const event: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.requested",
    workflowId: input.workflowId,
    flowId: input.flowId,
    path: view.path,
    idempotencyKey: stageRequestIdempotencyKey(input.workflowId, "A6", 1),
    stage: "A6",
    fromStage: "A5",
    requestTaskId: `proposal-card:${input.flowId}:${input.proposalSha256.slice(0, 12)}`,
    requestDigest: input.proposalSha256,
    attempt: 1,
  };
  const appended = await appendWorkflowEvent(input.projectRoot, event);
  if (!appended.ok) {
    return { ok: false, code: "workflow-ledger-write-failed", message: `stage.requested A6 写入失败：${appended.message}` };
  }
  return undefined;
}

// —————————————— G-B5-2：B2 范围决定（change.scope-decided）生产写入 ——————————————

/** 项目内文件字节 sha256（缺失/目录/非法路径 ⇒ undefined；不猜）。 */
async function sha256OfProjectFile(projectRoot: string, relPath: string): Promise<string | undefined> {
  const normalized = relPath.replace(/\\/g, "/").trim();
  if (normalized === "" || normalized.startsWith("/") || normalized.includes("://")) return undefined;
  if (normalized.split("/").some((segment) => segment === "..")) return undefined;
  try {
    const bytes = await fs.readFile(path.join(projectRoot, ...normalized.split("/")));
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}

/** scope 候选须为**文件**级项目相对路径（编排 `normalizeScopePath` 同口径：目录/空段/`.`/`..` 非法）。 */
function isScopeFileCandidate(value: string): boolean {
  const text = value.trim().replace(/\\/g, "/");
  if (text === "" || text.startsWith("/") || /^[a-zA-Z]:/.test(text)) return false;
  return text.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export type FixedPathBScopeDecisionOutcome =
  | { ok: true; writesets: PathBWriteSet[]; replay: boolean; recorded: boolean }
  | WorkflowServiceFailure;

/**
 * 路径 B **B2 范围决定** 的应用生产入口（G-B5-2；设计 §4.3 B2「幕僚发送 B3 stage-request 时应用校验
 * impactReport hash 并记录事件」）：`routeFixedPathDispatch` 受理 B3 advance stage-request **之前**调用。
 *
 * 应用事实（不采信模型自报写集/属主）：
 * - **影响面报告** = 最近一条 B1 生产任务（非 stage-request）done 报告的 evidence（倒序取第一个可读的
 *   项目内文件）优先、其 `requestedEvidence` 次之；字节 sha256 由本层重算（服务再独立复核）。
 * - **候选路径** = B3 stage-request 声明的 `requestedEvidence`（chief 依据 B1 建议给出的候选；≤5）优先，
 *   其次 B1 生产任务的 `modulePaths`（应用记录的分析范围）；为空 ⇒ fail-closed。
 * - **属主/有效写集** = 编排 `recordChangeScopeDecision` 按最新名单/角色边界派生（decidedBy:"chief"、
 *   requestTaskId = 最近 B1 stage-request 任务）。
 *
 * 窗口：B1 已完成且 B2 未完成（B2 completed ⇒ 幂等 replay 不重复写）；非 B 路径 ⇒ 不写、不阻断。
 * 失败（窗口不符/报告缺失/候选缺失/写集派生拒绝/账本写失败）⇒ 稳定失败码，调用方 fail-closed 拒绝 B3 请求。
 */
export async function recordFixedPathBScopeDecisionForDispatch(input: {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  candidateFiles?: readonly string[];
  now?: () => Date;
}): Promise<FixedPathBScopeDecisionOutcome> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = ledger.events.filter((event) => event.workflowId === input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  if (started === undefined || started.kind !== "workflow.started") {
    return { ok: false, code: "workflow-not-found", message: `workflow ${input.workflowId} 不存在（B2 范围决定未记录）。` };
  }
  if (started.path !== "B") return { ok: true, writesets: [], replay: true, recorded: false };
  if (started.flowId !== input.flowId) {
    return { ok: false, code: "b-change-scope-invalid", message: `flowId 与 workflow 账本不一致（${started.flowId}）。` };
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  if (view.closed !== undefined) {
    return { ok: false, code: "workflow-closed", message: `workflow ${input.workflowId} 已关闭（${view.closed.outcome}），B2 范围决定未记录。` };
  }
  if (view.blocked !== undefined) {
    return { ok: false, code: "workflow-corrupt", message: `工作流账本损坏：${view.blocked.summary}（B2 范围决定未记录）。` };
  }
  if (view.stages.B2.status === "completed") {
    const existing = [...wfEvents].reverse().find(
      (event): event is Extract<WorkflowEvent, { kind: "change.scope-decided" }> => event.kind === "change.scope-decided",
    );
    return {
      ok: true,
      writesets: existing === undefined ? [] : existing.effectiveWritesets.map((set) => ({ roleId: set.roleId, paths: [...set.paths] })),
      replay: true,
      recorded: false,
    };
  }
  if (!(view.stage === "B1" && view.stages.B1.status === "completed"
    && (view.stages.B2.status === "pending" || view.stages.B2.status === "failed"))) {
    return {
      ok: false,
      code: "stage-transition-invalid",
      message: `B2 范围决定非法：当前 ${view.stage}(${view.stages[view.stage].status})（要求 B1 已完成且 B2 未完成）。`,
    };
  }
  const b1Production = [...tasks.records.values()].filter((record) =>
    record.created?.workflowId === input.workflowId
    && record.created.stage === "B1"
    && record.created.taskKind !== "stage-request");
  if (b1Production.length === 0) {
    return { ok: false, code: "b-change-scope-invalid", message: "B2 范围决定缺少 B1 生产任务（不猜影响面报告）。" };
  }
  const withDoneReport = b1Production.filter((record) => record.reports.some((report) => report.status === "done"));
  const ordered = withDoneReport.length > 0 ? withDoneReport : b1Production;
  const latest = ordered[ordered.length - 1]!;
  const latestReport = [...latest.reports].reverse().find((report) => report.status === "done");
  const evidenceCandidates = [
    ...[...(latestReport?.evidence ?? [])].reverse(),
    ...(latest.created?.requestedEvidence ?? []),
  ];
  let impactReport: { path: string; sha256: string } | undefined;
  for (const candidate of evidenceCandidates) {
    const hash = await sha256OfProjectFile(input.projectRoot, candidate);
    if (hash !== undefined) {
      impactReport = { path: candidate.replace(/\\/g, "/").trim(), sha256: hash };
      break;
    }
  }
  if (impactReport === undefined) {
    return {
      ok: false,
      code: "b-change-scope-invalid",
      message: `B1 影响面报告不可用：任务 ${latest.taskId} 的 done 报告 evidence/requestedEvidence 未给出可读的项目内文件（不猜）。`,
    };
  }
  const declared = (input.candidateFiles ?? []).map((item) => item.trim()).filter(isScopeFileCandidate);
  const moduleFiles = b1Production
    .flatMap((record) => record.created?.modulePaths ?? [])
    .map((item) => item.trim())
    .filter(isScopeFileCandidate);
  const candidates = declared.length > 0 ? declared : moduleFiles;
  if (candidates.length === 0) {
    return {
      ok: false,
      code: "b-change-scope-invalid",
      message: "B2 范围来源缺失：B3 stage-request 未声明候选路径且 B1 生产任务未记录 modulePaths（应用不采信模型自报写集）。",
    };
  }
  const b1Requests = [...tasks.records.values()].filter((record) =>
    record.created?.workflowId === input.workflowId
    && record.created.taskKind === "stage-request"
    && record.created.stage === "B1");
  const requestTaskId = b1Requests[b1Requests.length - 1]?.taskId;
  if (requestTaskId === undefined) {
    return { ok: false, code: "b-change-scope-invalid", message: "B2 范围决定缺少 B1 stage-request 任务（审计绑定缺失）。" };
  }
  const decision = await recordChangeScopeDecision({
    projectRoot: input.projectRoot,
    flowId: input.flowId,
    workflowId: input.workflowId,
    operationId: `b2-scope:${input.workflowId}`,
    impactReport,
    scope: {
      summary: `B2 范围决定（B1 影响面：${impactReport.path}）`,
      files: candidates,
      rationale: `依据 B1 任务 ${latest.taskId} 的 done 报告；候选路径由应用记录，属主/有效写集由应用按名单/边界派生`,
    },
    requestTaskId,
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  if (!decision.ok) return decision;
  return { ok: true, writesets: decision.writesets, replay: decision.replay, recorded: true };
}
