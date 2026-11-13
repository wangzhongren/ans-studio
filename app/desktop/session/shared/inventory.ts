// app/desktop/session/shared/inventory.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1）：顶层库存订阅与聚合（L0）。
// `desktopProjectExecutionInventory` / `subscribeDesktopExecutionInventory` 自 session.ts **逐字搬移**；
// 内部状态（管理器注册表 / revision 计数器 / listener 集合）**单例**由本模块持有——
// B1 提交 2/2 把类方法 `inventoryChanged` / `publishDeliveryInventory` 一并迁入，并收口第一段的临时适配：
//  · `bumpDesktopExecutionRevision()`（ESM 绑定不可赋值的过桥函数）删除：计数递增回到本模块内直接执行；
//  · `desktopExecutionRevision` / `inventoryListeners` 收回为模块私有（外部只经 `inventoryChanged` 变更）；
//  · 管理器注册表经 `registerDesktopSessionManager` 登记（门面不再直接 `Set.add` 宽类型视图）。
// revision / listener / 发布顺序语义逐字不变：先 `observedInventoryRoots.add` → revision+1 →
// `recordGitHostInventory(desktopProjectExecutionInventory(root))` → 成功清/失败记诊断 → 逐 listener 派发（异常吞掉）。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { recordGitHostInventory } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { DesktopProjectExecutionInventory } from "../contracts/session-types.ts";

/** 管理器注册表元素的最小面：聚合只依赖公开事实方法；会话类以同一 Set 的强类型视图使用（同实例）。 */
export interface DesktopSessionManagersSource {
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory, "sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops">;
}

export const desktopSessionManagers = new Set<DesktopSessionManagersSource>();
/** 登记一个会话管理器（聚合与跨实例协调共用同一单例 Set）。 */
export function registerDesktopSessionManager(manager: DesktopSessionManagersSource): void {
  desktopSessionManagers.add(manager);
}
let desktopExecutionRevision = 0;
const inventoryListeners = new Set<(event: { projectRoot: string; revision: number; reason: string }) => void>();
/** Host coordination only. Listeners receive ordinary change facts, never a permission or effect handle. */
export function subscribeDesktopExecutionInventory(listener: (event: { projectRoot: string; revision: number; reason: string }) => void): () => void {
  inventoryListeners.add(listener); return () => { inventoryListeners.delete(listener); };
}
export function desktopProjectExecutionInventory(projectRoot: string): DesktopProjectExecutionInventory {
  const result: DesktopProjectExecutionInventory = { source: "desktop-session-manager", projectRoot, observedAt: new Date().toISOString(),
    revision: desktopExecutionRevision, coverage: "unknown", reasons: ["Historical processes and sessions outside the registered desktop handles are unproven", "Tool registry observations do not prove filesystem confinement"],
    sessions: [], pendingOpens: [], queuedDispatches: [], activeDeliveries: [], deliveryQueuePersistence: [], runStops: [], controllerStops: [] };
  for (const manager of desktopSessionManagers) {
    const part = manager.executionInventoryFacts(projectRoot);
    result.sessions.push(...part.sessions); result.pendingOpens.push(...part.pendingOpens);
    result.queuedDispatches.push(...part.queuedDispatches); result.activeDeliveries.push(...part.activeDeliveries);
    result.deliveryQueuePersistence.push(...part.deliveryQueuePersistence); result.runStops.push(...part.runStops); result.controllerStops.push(...part.controllerStops);
  }
  return result;
}

/**
 * `inventoryChanged` 的实例状态面（原 `this.observedInventoryRoots` / `this.inventoryPublicationErrors`；
 * 方案 §3.6 归属 run-change，B1 只搬方法，状态仍由门面持有）。
 */
export interface SessionInventoryState {
  observedInventoryRoots: Set<string>;
  inventoryPublicationErrors: Map<string, string>;
}

export function inventoryChanged(projectRoot: string, reason: string, state: SessionInventoryState): void {
  state.observedInventoryRoots.add(projectRoot);
  desktopExecutionRevision++;
  const published = recordGitHostInventory(desktopProjectExecutionInventory(projectRoot));
  if (published.ok) state.inventoryPublicationErrors.delete(projectRoot);
  else {
    state.inventoryPublicationErrors.set(projectRoot, published.code);
    createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("host-inventory.publish.failed", { reasonCode: published.code });
  }
  for (const listener of inventoryListeners) { try { listener({ projectRoot, revision: desktopExecutionRevision, reason }); } catch { /* observer failure never creates authority */ } }
}
export function publishDeliveryInventory(reason: string, state: SessionInventoryState): void {
  for (const projectRoot of state.observedInventoryRoots) inventoryChanged(projectRoot, reason, state);
}
