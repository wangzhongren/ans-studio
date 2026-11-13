// app/desktop/session/shared/tasks-store.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §3.6 / §5 B1 提交 2/2）：任务账本共享底座（L0）。
// 7 个类方法（rememberTaskCreator/readTasks/isFixedTask/appendTaskStateResult/appendTaskState/
// recordTaskFailure/appendRoleActivity）自 app/desktop/session.ts **逐字搬移**；方法体仅做 receiver/state
// 适配（`this.readTasks`/`this.appendTaskStateResult`/`this.appendTaskState` → 同模块函数；
// `this.now()` → 显式时钟回调；`this.lastRoleActivity` → 显式状态参数），条件、错误码、文案、返回值不变。
// `taskCreators` 状态随主迁入本模块（方案 §3.6 状态归属：shared/tasks-store）——任务 id 全局唯一
//（`newTaskId` = 时间戳+随机），且写入值与账本 `task.created.from` 同源，单例 Map 对多管理器实例语义一致。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { appendRoleLog } from "../../../../src/common/编排/role-log.ts";
import { readTaskState, shortenSummary, taskEvent, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import type { TaskStateEvent } from "../../../../src/model/runtime.ts";
import { recordTaskObservation } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";

/**
 * 任务创建者内存索引（原 `SessionManager.taskCreators`；读盘重放/新建/重派共用；缺字段的旧记录按 chief 兼容）。
 * 方案 §3.6 将本状态归属 shared/tasks-store。
 */
export const taskCreators = new Map<string, "chief" | "convener">();

/** 登记任务创建者（读盘重放/新建/重派共用；缺字段的旧记录按 chief 兼容）。 */
export function rememberTaskCreator(taskId: string, created: { from?: "chief" | "convener" } | undefined): void {
  taskCreators.set(taskId, created?.from === "convener" ? "convener" : "chief");
}

/** B 批：任务/汇报状态读取（坏行跳过；读失败按空状态 + 诊断，不阻塞）。 */
export async function readTasks(projectRoot: string): Promise<TaskReplay> {
  try {
    return await readTaskState(projectRoot);
  } catch (error) {
    createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("tasks.read.failed", error);
    return { records: new Map(), events: [], errors: [], unclosed: [] };
  }
}

/** T3 B1：该任务是否为 fixed 任务（`task.created.workflowId` 命名空间；固定路径无 legacy run 绑定）。 */
export async function isFixedTask(projectRoot: string, taskId: string | undefined): Promise<boolean> {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (id === "") return false;
  const record = (await readTasks(projectRoot)).records.get(id);
  return record?.created?.workflowId !== undefined;
}

/** B 批：追加任务事件；失败只记诊断并返回 false（调用方决定是否 fail-closed）。 */
export async function appendTaskStateResult(projectRoot: string, event: TaskStateEvent): ReturnType<typeof recordTaskObservation> {
  const result = await recordTaskObservation({ projectRoot, event });
  if (!result.ok) createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("tasks.append.failed", new Error(result.message),
    { taskId: "taskId" in event ? event.taskId : undefined, reasonCode: result.code });
  return result;
}

export async function appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> {
  return (await appendTaskStateResult(projectRoot, event)).ok;
}

export async function recordTaskFailure(projectRoot: string, taskId: string, summary: string, now: () => number): Promise<boolean> {
  const created = (await readTasks(projectRoot)).records.get(taskId)?.created;
  if (created === undefined) return false;
  return appendTaskState(projectRoot, taskEvent("task.reported", {
    taskId, from: created.to, status: "failed", summary: shortenSummary(`应用观察到失败：${summary}`),
  }, () => new Date(now())));
}

/** `appendRoleActivity` 的实例状态面（`lastRoleActivity` 仍属门面；B1 只搬方法，状态经显式参数传入）。 */
export interface RoleActivityState {
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
  now: () => number;
}

/** B 批：每角色运行日志观察器（应用侧写，不依赖角色上报；失败只诊断、绝不打断事件循环）。 */
export function appendRoleActivity(
  projectRoot: string,
  roleId: string,
  input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  state: RoleActivityState,
): Promise<void> {
  state.lastRoleActivity.set(`${projectRoot}\u0000${roleId}`, { at: state.now(), kind: input.kind, summary: input.summary });
  // 返回可等待的追加链：调用方若需要「返回即已落盘/可读」（如升级裁决）必须 await；
  // 其余观察器路径保持 fire-and-forget（不阻塞会话事件泵）。
  return appendRoleLog(projectRoot, roleId, input).then((result) => {
    if (!result.ok) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role-log.append.failed", new Error(result.message));
    }
  });
}
