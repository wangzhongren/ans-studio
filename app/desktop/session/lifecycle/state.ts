// app/desktop/session/lifecycle/state.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.6 / §5 B7）：lifecycle 的 11 个实例状态字段（messageSeq、lruClock、activeRoleId、selectionVersion、
// selectionTargetRoleId、openChains、observedHandles、observedHandleIds、lastGovernanceRuntime、
// inventoryRegistration、managerId）由 Lifecycle 模块**单 owner 持有并创建**；门面仅保留同一实例的
// 同名访问器（方案 §4.3 兼容面：测试结构化 cast 与尚未迁出的门面方法按原名访问），不造第二份状态。
// `inventoryRegistration` 的初始化回调注册的是**门面实例**（管理器注册表消费 `executionInventoryFacts`、
// `runChangeOperations`、`observedHandles` 等门面公开面），注册时机仍在构造期（与字段初始化器等价：
// 先注册、后生成 managerId，顺序逐字保留）。
import { randomUUID } from "node:crypto";
import type { RoleSessionHandle } from "../../../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { DesktopSessionInventoryFact, LiveSession } from "../contracts/session-types.ts";

/** 句柄库存行（原 `observedHandles` 元素形状）。 */
export interface ObservedHandleRecord {
  fact: DesktopSessionInventoryFact;
  handle?: RoleSessionHandle;
}

/** lifecycle 单 owner 状态（方案 §3.6 的 11 个字段；同一对象供门面访问器与宿主方法使用）。 */
export interface LifecycleState {
  messageSeq: number;
  lruClock: number;
  activeRoleId: string | null;
  selectionVersion: number;
  selectionTargetRoleId: string | null;
  readonly openChains: Map<string, Promise<void>>;
  readonly observedHandles: Map<string, ObservedHandleRecord>;
  readonly observedHandleIds: WeakMap<RoleSessionHandle, string>;
  readonly lastGovernanceRuntime: Map<string, RuntimeKind>;
  readonly inventoryRegistration: boolean;
  readonly managerId: string;
}

/** 创建 lifecycle 状态（原门面字段初始化器逐字同序：先库存登记、后 managerId）。 */
export function createLifecycleState(registerManager: () => void): LifecycleState {
  const inventoryRegistration = (() => { registerManager(); return true; })();
  return {
    messageSeq: 0,
    lruClock: 0,
    activeRoleId: null,
    selectionVersion: 0,
    selectionTargetRoleId: null,
    openChains: new Map<string, Promise<void>>(),
    observedHandles: new Map<string, ObservedHandleRecord>(),
    observedHandleIds: new WeakMap<RoleSessionHandle, string>(),
    lastGovernanceRuntime: new Map<string, RuntimeKind>(),
    inventoryRegistration,
    managerId: randomUUID(),
  };
}

/** 生命周期状态面（门面访问器与宿主实现共用；无行为、仅类型）。 */
export type { LiveSession };
