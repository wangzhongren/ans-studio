// app/desktop/session/shared/keys.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1 提交 2/2）：会话/目标/队列键（L0）。
// 3 个类方法（sessionKey/targetKey/queueKey）自 app/desktop/session.ts **逐字搬移**；
// 方法体仅做 receiver/state 适配（`this.sessionKey` → 同模块函数；`this.activeEntry()/activeRoleId/
// sessions/rebuildChains` → 显式只读状态回调，**求值时机与次数与原方法逐一对应**），条件、顺序、返回值不变。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import type { SessionTarget } from "../contracts/session-types.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";

export function sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
  return `${projectRoot}\u0000${roleId}\u0000${runtime}`;
}

/**
 * `targetKey` 的只读状态面：原方法读取的实例状态（`this.activeEntry()`、`this.activeRoleId`、
 * `this.sessions` / `this.rebuildChains` 的键集合）。全部只读回调，按原方法的求值时机调用。
 */
export interface TargetKeyState {
  activeEntry: () => { roleId: string } | undefined;
  activeRoleId: () => string | null;
  sessionKeys: () => Iterable<string>;
  rebuildChainKeys: () => Iterable<string>;
}

export function targetKey(target: string | SessionTarget, state: TargetKeyState): string | undefined {
  if (typeof target !== "string" && target.projectRoot && target.runtime) return sessionKey(target.projectRoot, target.roleId, target.runtime);
  let roleId = target;
  if (typeof target !== "string") roleId = target.roleId;
  const active = state.activeEntry();
  if (active?.roleId === roleId && state.activeRoleId() !== null) return state.activeRoleId()!;
  const matches = [...new Set([...state.sessionKeys(), ...state.rebuildChainKeys()])].filter((key) => key.split("\u0000")[1] === roleId);
  if (matches.length === 1) return matches[0];
  return undefined;
}

/** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
export function queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
  return `${projectRoot}\u0000${targetRoleId}\u0000${runtime}`;
}
