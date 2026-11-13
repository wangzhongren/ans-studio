// app/desktop/session/git-ports.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6 / Q7）：Git runtime/lease/信号端口装配（薄，L1，feature 白名单 []）。
// 片段提取（非方法搬运）自 app/desktop/session.ts：
//  · `createTurnGitRuntime`：`openInternalUnsafe` 内联 `currentGitRuntime` 闭包（turn 级 Git runtime 装配：
//    当前真实工具回合校验 → assigned-task 复核 → run-stop 栅栏 → `createGitRoleRuntime`；失败码/文案逐字）；
//  · `gitContextFailure`：同一方法内联的 Git 工具不可用回执（repoId:"unavailable"/status:"blocked"）；
//  · `buildFixedTaskGitSurface`：fixed 会话 `taskGit` 注入面（分类器 + 真实端口；键序/取值逐字）；
//  · `beginSessionDisposeLease`/`noteSessionDisposeInterruption`/`endSessionDisposeLease`：
//    `disposeObservedHandle` 的 session-dispose lease/中断信号装配（同参数/同顺序/同错误路由）。
// 依赖 `workflow-git.ts`（端口工厂）与 shared 之外的 trunk-runtime（lease/信号单一实现，不复制）；
// 结构测试 R-c：L1 只可导入 L0 与外部 src/app 依赖。
// 说明：dispatch 的 begin/endGitHostAction（kind:"dispatch"）随 B6 dispatch 方法逐字保留在模块内
// （dispatch 白名单 []，不可导入本模块；语义同一 trunk-runtime 实现，无第二份逻辑）。

import { classifyShellDetailed } from "../../../src/service/gate/shell-rules.ts";
import { beginGitHostAction, createGitRoleRuntime, endGitHostAction, recordGitHostInterruption, resolveDeliveryAssignment } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { LiveSession } from "./contracts/session-types.ts";
import { createDesktopBaselineGitPort, createDesktopReleaseGitPort, createDesktopTaskGitShellPort } from "../workflow-git.ts";

/** fixed 路径 Git 端口（`complete_team_plan` v4 / 路径 B 起步走 baseline；发布合并走 release；同一实现）。 */
export { createDesktopBaselineGitPort, createDesktopReleaseGitPort };

/** fixed 会话任务级 Git 写注入面（原 `openInternalUnsafe` 内联 `taskGit` 片段；同一分类器/同一端口工厂）。 */
export function buildFixedTaskGitSurface(projectRoot: string): {
  classifyShellDetailed: typeof classifyShellDetailed;
  port: ReturnType<typeof createDesktopTaskGitShellPort>;
} {
  return { classifyShellDetailed, port: createDesktopTaskGitShellPort(projectRoot) };
}

/** turn 级 Git runtime 装配的上下文（原 `currentGitRuntime` 闭包的自由变量；同一求值时机/次数）。 */
export interface TurnGitRuntimeContext {
  key: string;
  gitBinding: { handle?: RoleSessionHandle };
  projectRoot: string;
  roleId: string;
  sessions: ReadonlyMap<string, LiveSession>;
  deliveryIsStopped(key: string): boolean;
  runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean;
}

/** 原 `currentGitRuntime` 的成功/失败联合（`gitContextFailure` 消费失败分支）。 */
export type TurnGitRuntimeResult =
  | { ok: false; code: string; message: string }
  | { ok: true; runtime: ReturnType<typeof createGitRoleRuntime> };

/**
 * turn 级 Git runtime 装配（原 `openInternalUnsafe` 内联闭包，逐行搬移）：
 * 只认「本会话为本工具回合实际持有者 + 未 settled + 未被停止」；assignment 存在时经
 * `resolveDeliveryAssignment` 复核（核验期间回合变化 ⇒ `git-delivery-source-changed`），
 * run-stop 栅栏命中 ⇒ `run-stop-host-fenced`。判定顺序/失败码/文案不变。
 */
export function createTurnGitRuntime(ctx: TurnGitRuntimeContext): () => Promise<TurnGitRuntimeResult> {
  return async () => {
    const entry = ctx.sessions.get(ctx.key), origin = entry?.origins.running;
    const current = () => !!entry && ctx.sessions.get(ctx.key) === entry && entry.handle === ctx.gitBinding.handle && entry.origins.running === origin &&
      !!origin && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted && !ctx.deliveryIsStopped(ctx.key);
    if (!current()) return { ok: false as const, code: "git-delivery-source-changed", message: "没有当前真实工具回合" };
    let assignment = origin?.assignment;
    if (assignment) {
      const fresh = await resolveDeliveryAssignment({ projectRoot: ctx.projectRoot, recipientRoleId: ctx.roleId,
        source: { kind: "assigned-task", taskId: assignment.taskId }, expectedFlowId: assignment.flowId,
        ...(assignment.runId ? { expectedRunId: assignment.runId } : {}) });
      if (!current()) return { ok: false as const, code: "git-delivery-source-changed", message: "核验期间工具回合已变化" };
      if (!fresh.ok) return fresh;
      assignment = fresh.value;
      if (ctx.runTaskIsFenced(ctx.projectRoot, assignment.taskId, assignment.runId)) return { ok: false as const, code: "run-stop-host-fenced", message: "原运行的工具来源已暂停" };
    }
    return { ok: true as const, runtime: createGitRoleRuntime({ projectRoot: ctx.projectRoot, context: { actorRoleId: ctx.roleId, readPaths: ["."],
      ...(assignment ? { taskId: assignment.taskId, ...(assignment.runId ? { runId: assignment.runId } : {}) } : {}) } }) };
  };
}

/** Git 工具调用不可用回执（原 `openInternalUnsafe` 内联 `gitContextFailure`；逐字等价）。 */
export function gitContextFailure(operationId: string, failure: { code: string; message: string }) {
  return { operationId, repoId: "unavailable",
    status: "blocked" as const, code: failure.code, message: failure.message };
}

/** 会话处置 lease 获取（原 `disposeObservedHandle` 片段：`beginGitHostAction({kind:"session-dispose"})`）。 */
export function beginSessionDisposeLease(projectRoot: string) {
  return beginGitHostAction({ projectRoot, kind: "session-dispose" });
}

/** 会话处置期间命中宿主动作的中断信号（原内联 `recordGitHostInterruption`；reason/载荷逐字）。 */
export function noteSessionDisposeInterruption(projectRoot: string, coreSessionId: string | undefined): void {
  recordGitHostInterruption({ projectRoot, reason: "session-dispose-during-host-action", coreSessionId });
}

/** 会话处置 lease 结束（原内联 `endGitHostAction({projectRoot, leaseId})`；同参数/同返回）。 */
export function endSessionDisposeLease(projectRoot: string, leaseId: string) {
  return endGitHostAction({ projectRoot, leaseId });
}
