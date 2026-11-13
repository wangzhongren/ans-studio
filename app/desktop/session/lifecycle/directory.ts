// app/desktop/session/lifecycle/directory.ts
// B7（2026-11-13，session.ts 重构；方案 §3.3/§5 B7）：会话目录只读视图（`SessionDirectory` 端口实现侧）。
// 纯投影：所有数据来自 lifecycle 状态/门面同实例引用与门面只读方法（`governanceOwnerRoleId` /
// `governanceRuntimeFor` / `lastTurnOf` 经 LifecycleRefs.directory 回调，运行期求值）；本文件不持有状态、
// 不做判定、不写任何东西。
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { RuntimeTurnOutcome } from "../../../../src/model/runtime.ts";
import type { LiveSession } from "../contracts/session-types.ts";
import type { SessionDirectory, SessionDirectoryView } from "../contracts/ports.ts";

/** 目录实现的只读输入面（由 `Lifecycle` 以同实例状态/只读方法构造）。 */
export interface LifecycleDirectoryInput {
  key(projectRoot: string, roleId: string, runtime: RuntimeKind): string;
  find(projectRoot: string, roleId: string, runtime: RuntimeKind): LiveSession | undefined;
  activeRoleId(): string | null;
  isBusy(runtime: RuntimeKind): boolean;
  views(): SessionDirectoryView[];
}

/** 目录实现的只读上游（门面 diagnostics 投影；运行期调用）。 */
export interface LifecycleDirectoryPorts {
  governanceOwner(projectRoot: string): string | null;
  governanceRuntime(projectRoot: string): RuntimeKind | undefined;
  lastTurn(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: RuntimeTurnOutcome; at: string; errorCode?: string } | undefined;
}

/** 组装只读会话目录（`SessionDirectory`，方案 §3.3）。 */
export function createLifecycleDirectory(input: LifecycleDirectoryInput, ports: LifecycleDirectoryPorts): SessionDirectory {
  return {
    key: (projectRoot, roleId, runtime) => input.key(projectRoot, roleId, runtime),
    find: (projectRoot, roleId, runtime) => input.find(projectRoot, roleId, runtime),
    activeRoleId: () => input.activeRoleId(),
    governanceOwner: (projectRoot) => ports.governanceOwner(projectRoot),
    governanceRuntime: (projectRoot) => ports.governanceRuntime(projectRoot),
    isBusy: (runtime) => input.isBusy(runtime),
    views: () => input.views(),
    lastTurn: (projectRoot, roleId, runtime) => ports.lastTurn(projectRoot, roleId, runtime),
  };
}
