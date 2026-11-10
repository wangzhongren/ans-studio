// src/common/编排/workflow-state.ts
// 编排主属（T3「两条固定工作流路径」B0，2026-11-10）：固定工作流账本的**纯投影**。
//
// 依据：实现级方案 v1.3 §4.1（WorkflowView/事件/投影）、§4.4（合法转移/返工/stop）、
// §4.5（阶段完成判定骨架）、§7.1（事件字段）；B1 验收 AC-08/AC-17/T-03。
//
// 纪律（B0）：
//  · **纯函数**：无 I/O、无时钟、无随机；输入 = 已解析的账本事件 + 任务事件，输出 = 只读视图。
//  · 枚举/守卫**只消费** `model/runtime.ts`（`WorkflowStage`/`WorkflowPath`/`StageStatus`/
//    `isWorkflowEvent`/`WORKFLOW_STAGES`），不复制第二份枚举。
//  · 事件只增：同 `idempotencyKey` 重复事件忽略（first wins，计 `duplicate`）；形状非法事件计数跳过
//    （计 `invalid`）。**关键事件缺失/顺序非法 ⇒ `workflow-corrupt`（blocked），不猜、不自动推进**。
// B1（2026-11-10）补齐：A1–A13/B1–B4 完整合法/非法转移、A10→A11 时序、A12a/A12b、stop/open
// 不变量（投影层）、关闭证据 fail-closed；**MF-IR-1 rework 语义**按冻结判据：
// `stage.reworked.stage` = 回落目标阶段，`reworkOf` = 被返工的来源阶段（A12b→A11 时
// `reworkOf:"A12b"`、`stage:"A11"`）；投影把 `reworkOf` 标记 failed、当前阶段置 `stage`。
// 阶段完成的 artifact/hash/角色激活齐全等**应用事实**由 `workflow-service` 在写事件前校验；
// 本模块仍是纯投影：缺事件/坏行/顺序非法 ⇒ `workflow-corrupt`，不猜、不自动推进。
//
// 与 v1.3 §4.1 的差异：`WorkflowView` 在冻结形状之上**仅追加可选字段**（stopping/closed/
// activatedRoleIds/skippedEvents）；必需字段与语义不变。

import type {
  StageStatus,
  TaskStateEvent,
  WorkflowClosedOutcome,
  WorkflowEvent,
  WorkflowPath,
  WorkflowStage,
} from "../../model/runtime.ts";
import { WORKFLOW_STAGES, isWorkflowEvent, isWorkflowStage } from "../../model/runtime.ts";

/** 投影 fail-closed 码（v1.3 附录 C）：关键事件缺失/顺序非法 ⇒ 不猜、不推进。 */
export const WORKFLOW_CORRUPT_CODE = "workflow-corrupt";

/** 单阶段投影状态（v1.3 §4.1）。 */
export interface WorkflowStageState {
  status: StageStatus;
  attempt: number;
  /** 最近一次作用于该阶段的账本事件幂等键（审计/测试用）。 */
  lastEventId?: string;
}

/** 工作流投影视图（v1.3 §4.1 冻结形状 + B0 可选追加字段）。 */
export interface WorkflowView {
  workflowId: string;
  flowId: string;
  path: WorkflowPath;
  stage: WorkflowStage;
  status: StageStatus;
  stages: Record<WorkflowStage, WorkflowStageState>;
  basisId?: string;
  releaseId?: string;
  /** 验收角色：默认 "verifier"；roster roles[].review=true 的项目角色（B1 从 basis/roster 派生）。 */
  reviewRoleId?: string;
  /** 当前阻塞/损坏原因；`workflow-corrupt` 时为投影 fail-closed。 */
  blocked?: { code: string; summary: string };
  /** B0：stop 请求已记账（stopping）；`workflow.closed` 后清除。 */
  stopping?: boolean;
  /** B0：`workflow.closed` 最终结论。 */
  closed?: { outcome: WorkflowClosedOutcome; reason: string };
  /** B0：A8 `role.activated` 已登记角色（去重、保序）。 */
  activatedRoleIds?: string[];
  /** 投影输入统计：形状非法事件数 / 幂等键重复事件数（坏事件不阻塞，关键缺失才 corrupt）。 */
  skippedEvents?: { invalid: number; duplicate: number };
}

/**
 * 阶段 → 合法下一阶段（v1.3 §4.4）。
 * 返工边（A3→A2、A6→A5、A12b→A11、B2→B1）由 `stage.reworked` 表达（`stage`=回落目标、
 * `reworkOf`=被返工来源，MF-IR-1），不在此静态表。
 * A10→A12a 允许（criteria 可先派）；A12a→A11（criteria 在办时即可推进实现，G-1）；
 * A12b→A12/A13（A12 聚合完成或直接发布）；A13/B4 无后继（由 `workflow.closed` 结束）。
 */
export const WORKFLOW_STAGE_TRANSITIONS: Readonly<Record<WorkflowStage, readonly WorkflowStage[]>> = Object.freeze({
  A1: ["A2"],
  A2: ["A3"],
  A3: ["A4"],
  A4: ["A5"],
  A5: ["A6"],
  A6: ["A7"],
  A7: ["A8"],
  A8: ["A9"],
  A9: ["A10"],
  A10: ["A11", "A12a"],
  A11: ["A12b"],
  A12a: ["A11"],
  A12b: ["A12", "A13"],
  A12: ["A13"],
  A13: [],
  B1: ["B2"],
  B2: ["B3"],
  B3: ["B4"],
  B4: [],
});

/** v1.3 §4.5：这些阶段在任务创建（stage.dispatched）时即视为完成（A1/A4/A7 完成于目标任务创建）。 */
const DISPATCH_COMPLETES: ReadonlySet<WorkflowStage> = new Set<WorkflowStage>(["A1", "A4", "A7"]);

/**
 * MF-IR-1 / G-17：返工映射——`reworkOf`（被返工来源）→ `stage`（回落目标）。
 * A3(revise)→A2、A6(revise)→A5、A12b(rework)→A11、B2(rework)→B1。
 */
export const WORKFLOW_REWORK_FALLBACKS: Readonly<Partial<Record<WorkflowStage, WorkflowStage>>> = Object.freeze({
  A3: "A2",
  A6: "A5",
  A12b: "A11",
  B2: "B1",
});

const STAGE_SET: ReadonlySet<string> = new Set<string>(WORKFLOW_STAGES);

function firstStageOf(path: WorkflowPath): WorkflowStage {
  return path === "B" ? "B1" : "A1";
}

function emptyStages(): Record<WorkflowStage, WorkflowStageState> {
  const stages = {} as Record<WorkflowStage, WorkflowStageState>;
  for (const stage of WORKFLOW_STAGES) stages[stage] = { status: "pending", attempt: 0 };
  return stages;
}

function baseView(workflowId: string, flowId: string, path: WorkflowPath, stage: WorkflowStage): WorkflowView {
  return {
    workflowId,
    flowId,
    path,
    stage,
    status: "pending",
    stages: emptyStages(),
  };
}

function corrupt(view: WorkflowView, summary: string): WorkflowView {
  view.status = "blocked";
  view.blocked = { code: WORKFLOW_CORRUPT_CODE, summary };
  return view;
}

/** 合法推进请求：当前阶段 completed 时允许其静态后继；A12a 在办时允许先推进 A11；同阶段可首发/重试。 */
function canRequest(view: WorkflowView, target: WorkflowStage): boolean {
  if (view.closed !== undefined || view.stopping === true) return false;
  const current = view.stages[view.stage];
  if (target === view.stage) {
    return current.status === "pending" || current.status === "requested"
      || current.status === "dispatched" || current.status === "blocked" || current.status === "failed";
  }
  if (current.status === "completed" && WORKFLOW_STAGE_TRANSITIONS[view.stage].includes(target)) return true;
  // G-1：A12a（criteria）可在实现期间完成；A11 的 stage-request 不等待 A12a 收口。
  if (view.stage === "A12a" && (current.status === "requested" || current.status === "dispatched")
    && target === "A11") return true;
  return false;
}

/** 合法派发：同阶段 requested→dispatched；或当前阶段 completed 后的静态后继（A12a/A12b 直派路径）。 */
function canDispatch(view: WorkflowView, target: WorkflowStage): boolean {
  if (view.closed !== undefined || view.stopping === true) return false;
  if (target === view.stage) {
    const status = view.stages[target].status;
    return status === "requested" || status === "dispatched";
  }
  // 已先 stage.requested（A11 在 A12a 在办时已请求）的阶段，其 task.created 派发同样合法；
  // 返工后的重试（target 曾在上一 attempt 失败）也允许重新派发。
  return view.stages[view.stage].status === "completed"
    && WORKFLOW_STAGE_TRANSITIONS[view.stage].includes(target)
    && (view.stages[target].status === "pending" || view.stages[target].status === "requested"
      || view.stages[target].status === "failed");
}

/** 合法完成：任意“在办”阶段可被完成（A12a 可在 A11 期间完成）；A12 聚合完成要求 A12b 已完成。 */
function canComplete(view: WorkflowView, target: WorkflowStage): boolean {
  if (view.closed !== undefined) return false;
  const status = view.stages[target].status;
  if (status === "requested" || status === "dispatched" || status === "blocked" || status === "in-progress") return true;
  // v1.3 §4.5：A12b accepted 后记录 `stage.completed A12`（聚合）；只认 A12b 已完成后的 A12。
  if (target === "A12" && view.stages.A12b.status === "completed" && status !== "completed") return true;
  return false;
}

/** 应用单个事件到视图；返回 undefined = 成功，string = 顺序/身份非法（⇒ workflow-corrupt）。 */
function applyWorkflowEvent(view: WorkflowView, event: WorkflowEvent): string | undefined {
  if (view.closed !== undefined) return `workflow 已关闭（${view.closed.outcome}）后仍出现 ${event.kind}`;
  switch (event.kind) {
    case "workflow.started":
      // 首个 workflow.started 已在 deriveWorkflowView 中消费；同 workflowId 的第二条即身份冲突。
      return "重复 workflow.started（同一 workflowId 只允许一次启动）";
    case "stage.requested": {
      if (!canRequest(view, event.stage)) {
        return `stage.requested 非法转移：${view.stage}(${view.stages[view.stage].status}) → ${event.stage}`;
      }
      const state = view.stages[event.stage];
      state.status = "requested";
      state.attempt = Math.max(state.attempt, event.attempt);
      state.lastEventId = event.idempotencyKey;
      view.stage = event.stage;
      view.status = "requested";
      return undefined;
    }
    case "stage.dispatched": {
      if (!canDispatch(view, event.stage)) return `stage.dispatched 非法：目标 ${event.stage}`;
      const state = view.stages[event.stage];
      state.status = DISPATCH_COMPLETES.has(event.stage) ? "completed" : "dispatched";
      state.lastEventId = event.idempotencyKey;
      view.stage = event.stage;
      view.status = state.status;
      return undefined;
    }
    case "stage.completed": {
      if (!canComplete(view, event.stage)) {
        return `stage.completed 非法：${event.stage}（当前 ${view.stage}(${view.stages[view.stage].status})）`;
      }
      const state = view.stages[event.stage];
      state.status = "completed";
      state.lastEventId = event.idempotencyKey;
      view.stage = event.stage;
      view.status = "completed";
      // A9 完成事件可携带 basis 引用（cause.kind = "basis-recorded"），投影只读记录。
      if (event.stage === "A9" && event.cause.kind === "basis-recorded") view.basisId = event.cause.ref;
      return undefined;
    }
    case "stage.blocked": {
      if (event.stage !== view.stage) {
        return `stage.blocked 阶段不匹配：${event.stage} != ${view.stage}`;
      }
      const state = view.stages[event.stage];
      state.status = "blocked";
      state.attempt = Math.max(state.attempt, event.attempt);
      state.lastEventId = event.idempotencyKey;
      view.status = "blocked";
      view.blocked = { code: event.code, summary: event.summary };
      return undefined;
    }
    case "stage.reworked": {
      // MF-IR-1（冻结判据）：`stage` = 回落目标（A11），`reworkOf` = 被返工来源（A12b）。
      // 合法性：`reworkOf` 必须是当前阶段（被返工者）且处于在办/已完成/阻塞；`stage` 必须等于
      // 冻结的回落映射（A3→A2 / A6→A5 / A12b→A11 / B2→B1）。
      if (event.reworkOf !== view.stage) {
        return `stage.reworked 来源阶段不匹配：reworkOf=${event.reworkOf} != 当前 ${view.stage}`;
      }
      const fallback = WORKFLOW_REWORK_FALLBACKS[event.reworkOf];
      if (fallback === undefined || event.stage !== fallback) {
        return `stage.reworked 回落目标非法：${event.reworkOf} → ${event.stage}（应为 ${fallback ?? "无" }）`;
      }
      const trigger = view.stages[event.reworkOf];
      if (trigger.status !== "requested" && trigger.status !== "dispatched" && trigger.status !== "in-progress"
        && trigger.status !== "blocked" && trigger.status !== "completed") {
        return `stage.reworked 来源阶段状态非法：${event.reworkOf}(${trigger.status})`;
      }
      trigger.status = "failed";
      trigger.lastEventId = event.idempotencyKey;
      const target = view.stages[event.stage];
      target.status = "pending";
      target.attempt = Math.max(target.attempt, event.attempt);
      view.stage = event.stage;
      view.status = "pending";
      view.blocked = undefined;
      return undefined;
    }
    case "change.scope-decided": {
      // B2 完成于 scope 决议事件（v1.3 §4.5）；允许 B2 在办时完成，或 B1 completed 后直接决议
      // （无 stage.requested），或 B2 rework 回 B1 并再次完成后重试决议（B2 failed）。
      const allowed = canComplete(view, "B2")
        || (view.stage === "B1" && view.stages.B1.status === "completed"
          && (view.stages.B2.status === "pending" || view.stages.B2.status === "failed"));
      if (!allowed) return "change.scope-decided 发生在 B2 非法阶段";
      const state = view.stages.B2;
      state.status = "completed";
      state.lastEventId = event.idempotencyKey;
      view.stage = "B2";
      view.status = "completed";
      return undefined;
    }
    case "role.activated": {
      // A8 执行角色激活（v1.3 §4.5/G-8）：只允许发生在 A8 在办（requested/dispatched/in-progress）。
      if (view.stage !== "A8") {
        return `role.activated 发生在 A8 之外（当前 ${view.stage}）`;
      }
      const roles = view.activatedRoleIds ?? [];
      if (!roles.includes(event.roleId)) roles.push(event.roleId);
      view.activatedRoleIds = roles;
      return undefined;
    }
    case "workflow.stop-requested": {
      if (view.stopping === true) return "重复 workflow.stop-requested（stop 已在办）";
      if (event.stage !== view.stage) {
        return `workflow.stop-requested 阶段不匹配：${event.stage} != ${view.stage}`;
      }
      // stop 请求本身不是失败：只置 stopping（nextStages 为空），不设置 blocked。
      view.stopping = true;
      return undefined;
    }
    case "workflow.stop-unconfirmed": {
      if (view.stopping !== true) return "workflow.stop-unconfirmed 发生在未 stop 请求的 workflow";
      if (event.stage !== view.stage) {
        return `workflow.stop-unconfirmed 阶段不匹配：${event.stage} != ${view.stage}`;
      }
      view.stopping = true;
      view.status = "blocked";
      view.blocked = {
        code: "workflow-stop-unconfirmed",
        summary: `停稳证据不足：${event.missing.length > 0 ? event.missing.join("、") : "未提供"}`,
      };
      return undefined;
    }
    case "workflow.closed": {
      // AC-07：停稳不明（请求已 closed + 运营报告 + 无 open 生产任务）⇒ 不写 stopped；
      // 投影对缺失证据的 stopped 关闭 fail-closed（corrupt），不按成功处理。
      if (event.outcome === "stopped") {
        const evidence = event.stopEvidence;
        const confirmed = evidence !== undefined && evidence.requestClosed === true && evidence.operatorReported === true
          && (evidence.openProductionTaskIds === undefined || evidence.openProductionTaskIds.length === 0);
        if (!confirmed) {
          return "workflow.closed stopped 缺少停稳证据（请求已 closed + 运营报告 + 无 open 生产任务）";
        }
      }
      view.closed = { outcome: event.outcome, reason: event.reason };
      view.stopping = false;
      view.status = event.outcome === "failed" ? "failed" : "completed";
      view.blocked = undefined;
      return undefined;
    }
  }
}

/** 任务账本补充：仅把尚未记账的 fixed 任务创建视为阶段派发（A1/A4/A7 视为完成）；不猜完成条件。 */
function applyTaskHints(view: WorkflowView, tasks: readonly TaskStateEvent[]): void {
  if (view.blocked?.code === WORKFLOW_CORRUPT_CODE || view.closed !== undefined) return;
  for (const task of tasks) {
    if (task.kind !== "task.created") continue;
    if (task.workflowId !== view.workflowId) continue;
    const stage = task.stage;
    if (stage === undefined || !STAGE_SET.has(stage)) continue;
    // A12a/A12b 的派发只认账本事件（避免与 G-1/A11 后 A12b 的顺序规则冲突）。
    if (stage === "A12a" || stage === "A12b") continue;
    const state = view.stages[stage];
    if (state.status !== "pending") continue;
    const isCurrentOrNext = stage === view.stage
      || (view.stages[view.stage].status === "completed" && WORKFLOW_STAGE_TRANSITIONS[view.stage].includes(stage));
    if (!isCurrentOrNext) continue;
    state.status = DISPATCH_COMPLETES.has(stage) ? "completed" : "dispatched";
    state.lastEventId = state.lastEventId ?? task.idempotencyKey;
    view.stage = stage;
    view.status = state.status;
  }
}

/**
 * 从账本事件 + 任务事件派生工作流视图（纯函数）。
 *
 * - 输入须是**同一 workflowId** 的事件集；空集/首事件非 `workflow.started`/身份不一致/顺序非法
 *   ⇒ `blocked.code = "workflow-corrupt"`（不猜、不自动推进）。
 * - 同幂等键重复事件忽略（`skippedEvents.duplicate`）；形状非法事件计数跳过（`skippedEvents.invalid`）。
 * - `tasks` 仅作补充（fixed 任务创建 → 阶段 dispatched），阶段完成仍判定在 B1。
 */
export function deriveWorkflowView(
  events: readonly WorkflowEvent[],
  tasks: readonly TaskStateEvent[] = [],
): WorkflowView {
  const skipped = { invalid: 0, duplicate: 0 };
  const valid: WorkflowEvent[] = [];
  const seen = new Set<string>();
  for (const raw of events as readonly unknown[]) {
    if (!isWorkflowEvent(raw)) {
      skipped.invalid += 1;
      continue;
    }
    if (seen.has(raw.idempotencyKey)) {
      skipped.duplicate += 1;
      continue;
    }
    seen.add(raw.idempotencyKey);
    valid.push(raw);
  }
  const first = valid[0];
  if (first === undefined || first.kind !== "workflow.started") {
    // 关键事件缺失：没有 workflow.started 无法确定身份/路径 ⇒ fail-closed，不猜。
    const view = baseView("", "", "A", "A1");
    view.skippedEvents = skipped;
    return corrupt(view, "工作流账本缺少 workflow.started（关键事件缺失，不猜）");
  }
  const view = baseView(first.workflowId, first.flowId, first.path, firstStageOf(first.path));
  view.skippedEvents = skipped;
  view.stages[view.stage].lastEventId = first.idempotencyKey;
  for (const event of valid.slice(1)) {
    if (event.workflowId !== view.workflowId || event.flowId !== view.flowId || event.path !== view.path) {
      return corrupt(view, `账本事件身份不一致：${event.kind}（${event.workflowId}/${event.flowId}/${event.path}）`);
    }
    const failure = applyWorkflowEvent(view, event);
    if (failure !== undefined) return corrupt(view, failure);
  }
  applyTaskHints(view, tasks);
  return view;
}

/**
 * 当前视图下合法的下一阶段（B0 骨架；完整判定在 B1）：
 * - 已关闭/stopping/corrupt ⇒ 空；
 * - 当前阶段 completed ⇒ 静态后继（过滤已完成）；
 * - A12a 在办 ⇒ 可推进 A11（G-1）；
 * - 其余（pending/requested/dispatched/blocked）⇒ 同阶段（首发/重试）。
 */
export function nextStages(view: WorkflowView): readonly WorkflowStage[] {
  if (view.closed !== undefined || view.stopping === true) return [];
  if (view.blocked?.code === WORKFLOW_CORRUPT_CODE) return [];
  const current = view.stages[view.stage];
  if (current.status === "completed") {
    return WORKFLOW_STAGE_TRANSITIONS[view.stage].filter((stage) => view.stages[stage].status !== "completed");
  }
  if (view.stage === "A12a" && (current.status === "requested" || current.status === "dispatched")) {
    return ["A11", "A12a"];
  }
  return [view.stage];
}

/** 便捷断言：事件阶段值域（消费方传入可疑值时用；不改变投影状态）。 */
export function isKnownWorkflowStage(value: unknown): value is WorkflowStage {
  return isWorkflowStage(value);
}

/**
 * 写事件前的纯校验（`workflow-service` 复用同一谓词；不读取/不写账本）：
 * 与 `deriveWorkflowView` 内部判定同源，避免服务层另写第二份顺序规则。
 */
export function canRequestStage(view: WorkflowView, stage: WorkflowStage): boolean {
  return canRequest(view, stage);
}

/** 写 `stage.dispatched` 前校验（同源）。 */
export function canDispatchStage(view: WorkflowView, stage: WorkflowStage): boolean {
  return canDispatch(view, stage);
}

/** 写 `stage.completed` 前校验（同源）。 */
export function canCompleteStage(view: WorkflowView, stage: WorkflowStage): boolean {
  return canComplete(view, stage);
}
