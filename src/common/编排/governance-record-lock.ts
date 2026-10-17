// src/common/编排/governance-record-lock.ts
// 治理记录动作的**进程内同项目互斥**（I3 establish / reaccept / V1b migrate **共用同一份**）。
//
// 缘起：`establishGovernanceRecord`（I3）与 `reacceptGovernancePins`（B1）原先共用一个模块级
// `Set`。V1b 的 `migrateGovernanceModel` 也必须与二者互斥（评审 §5.5 的 `busy`），否则「建立 /
// 重新接受 / 迁移」可以交错改同一份 `.ans/project.json`。故把集合提成本模块——**不造第二份锁**，
// key 统一 `path.resolve(projectRoot)`。
//
// 语义（逐字沿用既有约定）：
//   · **在首次 await 之前**占位（`tryAcquire` 同步）——并发调用可确定性得到 `busy`；
//   · `finally` 释放；释放不存在/不属于自己的 key 是无害的（Set.delete）；
//   · **跨进程无全局锁**（两个桌面实例/CLI 并发）——如实登记：最坏双方写出同构产物，不产生额外权限。

import path from "node:path";

/** 在飞动作的项目根集合（已 `path.resolve`）。 */
const inFlight = new Set<string>();

function normalizeRoot(projectRoot: string): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  return path.resolve(projectRoot);
}

/** 同项目是否已有治理记录动作在飞（只读检查；不占位）。 */
export function isGovernanceRecordBusy(projectRoot: string): boolean {
  const root = normalizeRoot(projectRoot);
  return root !== undefined && inFlight.has(root);
}

/**
 * 尝试占位；成功 `true`，已有在飞动作 `false`。**同步**——调用方须在首次 await 前调用，
 * 失败分支才能确定性地回 `busy`。占位成功后必须 `release`（`finally`）。
 */
export function tryAcquireGovernanceRecordLock(projectRoot: string): boolean {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return false;
  if (inFlight.has(root)) return false;
  inFlight.add(root);
  return true;
}

/** 释放占位（幂等；`finally` 调用）。 */
export function releaseGovernanceRecordLock(projectRoot: string): void {
  const root = normalizeRoot(projectRoot);
  if (root !== undefined) inFlight.delete(root);
}
