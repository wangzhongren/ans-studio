// app/desktop/session/contracts/tasks.ts
// B1（2026-11-13，session.ts 重构；方案 §5 B1）：后台任务 / 任务账本 / 终止 / 重派 / 收口共享契约（L0）。
// 声明体自 app/desktop/session.ts **逐字搬移**（仅 import/导出适配）。

import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { BackgroundTaskSnapshot, BackgroundTaskReadResult, BackgroundTaskStopResult } from "../../../../src/model/runtime.ts";
import type { TaskCardView } from "../../../../src/common/编排/task-state.ts";
import type { RedispatchSafetyDecision } from "../../../../src/common/编排/watchdog.ts";

// —————————————— 会话级后台任务聚合（2026-10-25，桌面任务面板 B） ——————————————
//
// 运行时 `RoleSession` 已提供三个**可选**方法（`listBackgroundTasks?/readBackgroundTask?/stopBackgroundTask?`，
// `src/model/runtime.ts`），编排 `RoleSessionHandle` 原样透传。本层只做**按项目×引擎的聚合与精确寻址**：
//  · 任务表/日志/pid 只在各会话内存，**不缓存、不持久化、不伪造**；跨会话聚合只是一次读取的快照拼接；
//  · 会话句柄没有 `listBackgroundTasks` ⇒ 跳过该角色；该项目×引擎没有任何会话具备能力 ⇒ 空列表 +
//    `unavailable:true`（UI 据此区分「当前没有任务」与「该运行时/会话不支持」）；
//  · read/stop 一律以 `projectRoot+roleId+runtime` 精确寻址；找不到会话或能力缺席如实失败；
//  · 底层 stop 的 `{ok:false, reason:"unknown-task"|"closed"|"timeout"}` 与异常**不吞、不改写为成功**。

/** 聚合列表中的单条任务：运行时快照 + 所属角色/引擎（同一项目×引擎可聚合多个角色）。 */
export interface BackgroundTaskView extends BackgroundTaskSnapshot {
  roleId: string;
  runtime: RuntimeKind;
}

/** 列表回执：`unavailable` 区分「没有任务」与「没有具备能力的活会话」。参数非法时 `ok:false`。 */
export type BackgroundTasksListReply =
  | { ok: true; projectRoot: string; runtime: RuntimeKind; tasks: BackgroundTaskView[]; unavailable: boolean }
  | { ok: false; error: string };

/** 读取日志入参（寻址三元组与 taskId 必填；`stream`/`tailLines` 与运行时契约同名同义）。 */
export interface BackgroundTaskReadInput {
  projectRoot: string;
  runtime: RuntimeKind;
  roleId: string;
  taskId: string;
  stream?: "stdout" | "stderr" | "both";
  tailLines?: number;
}

/** 读取回执：成功包底层结果（同一引用）；未知任务（底层 `undefined`）/无会话/无能力如实失败，不伪造内容。 */
export type BackgroundTaskReadReply = { ok: true; result: BackgroundTaskReadResult } | { ok: false; error: string };

/** 停止入参（寻址同上；`force` 同 `stop_background_task`）。 */
export interface BackgroundTaskStopInput {
  projectRoot: string;
  runtime: RuntimeKind;
  roleId: string;
  taskId: string;
  force?: boolean;
}

/**
 * 停止回执：底层结果**原样**返回（成功 / `unknown-task` / `closed` / `timeout`，不改写成成功）。
 * 桌面层额外两种如实失败：找不到会话 ⇒ `reason:"closed"`（会话不可用）；句柄无能力 ⇒ `reason:"unavailable"`。
 */
export type BackgroundTaskStopReply =
  | BackgroundTaskStopResult
  | { ok: false; reason: "unavailable"; message: string };

// （A-5：finalize 面已删——提议/确认/手动收口不复存在；产物收尾由编排在 settle 后自动完成，见文件头。）

// —————————————— B 批（2026-10-28）：任务/汇报/日志的桌面数据面 ——————————————

/** 任务列表回执（只读；坏行数如实给出，不隐藏）。 */
export interface TaskListView {
  projectRoot: string;
  tasks: TaskCardView[];
  errors: number;
  unclosed: number;
}

/** 重启恢复回执（未关闭任务展示；未投递任务重新入队；失败保留/如实计数）。 */
export interface TaskRestoreReport {
  restored: number;
  skipped: number;
  taskIds: string[];
  /** C 批：重启时标记 orphaned 的未决申请数。 */
  orphanedRequests?: number;
  /** C 批：重启时标记 expired 的未决审批数。 */
  expiredApprovals?: number;
  /** 2026-11-02：重启对账的版本决策数（executing→executed）。 */
  versionDecisionsReconciled?: number;
  /** 2026-11-02：重启后标记 uncertain 的版本决策数（含 resolved-without-execution-record）。 */
  versionDecisionsUncertain?: number;
}

export interface TerminateRoleRunInput {
  projectRoot: string;
  roleId: string;
  runtime: RuntimeKind;
  taskId?: string;
  force?: boolean;
}

/** 终止回执（B-08）：子进程树/退出信号/部分写入如实；`terminationConfirmed=false` ⇒ 不自动重派。 */
export interface TerminateRoleRunResult {
  ok: boolean;
  roleId: string;
  terminationConfirmed: boolean;
  childProcesses: number;
  childProcessesStopped: number;
  /** 后台任务终止的底层结果（如实；`kill-timeout` 不得当已停止）。 */
  childResults: { taskId: string; ok: boolean; reason?: string; exitCode?: number; signal?: string }[];
  partialArtifacts: string[];
  /** B-08：已从 `temp/<role>/` 物理移入 `temp/<role>/staging/<隔离批次>/` 的产物（项目相对路径）。 */
  isolatedArtifacts: string[];
  /** B-08：隔离根（项目相对路径；无部分产物时不创建）。 */
  stagingDir?: string;
  /** B-07：是否已确保目标角色使用 fresh 会话（重建/新会话）；重派前置。 */
  sessionFresh: boolean;
  /** 轮次中止回执（运行时不支持/失败如实）。 */
  abort: { ok: boolean; supported: boolean; error?: string };
  message?: string;
}

export interface RedispatchTaskInput {
  projectRoot: string;
  taskId: string;
  /** 目标角色（缺省沿用原任务目标）。 */
  to?: string;
}

/** 重派回执（B-07/B-08）：仅 safety=safe 才产生新任务；否则如实升级、零自动重派。 */
export interface RedispatchTaskResult {
  ok: boolean;
  taskId?: string;
  retryOf?: string;
  safety: RedispatchSafetyDecision["safety"];
  autoAllowed: boolean;
  reasons: string[];
  message: string;
  /** B-07：目标是否已 fresh 会话（重建或首次自动新开）。 */
  sessionFresh?: boolean;
  /** 连续 2 次仍卡死：是否已提交应用申请/决策卡（唯一推荐）。 */
  escalated?: boolean;
  requestId?: string;
  selected?: string;
}

/** 幕僚收口任务（accepted/rework/rejected；B-03 `task.closed`）。 */
export interface CloseTaskInput {
  projectRoot: string;
  taskId: string;
  outcome: "accepted" | "rework" | "rejected";
  note?: string;
}

export interface CloseTaskResult {
  ok: boolean;
  taskId: string;
  outcome?: "accepted" | "rework" | "rejected";
  message: string;
}

export interface NativeProjectRegistration {
  selectionId: string;
  selectedRoot: string;
  projectRoot: string;
  source: "native-directory-selection";
  selectedAt: string;
  listingGeneration: number;
}
