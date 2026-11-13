// app/desktop/session/shared/roles.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1 提交 2/2）：角色路由/名单查询（L0）。
// 7 个类方法（handbackOwnerRoleId/chiefTaskRoleIdOf/dispatcherRoleIdOf/resolveProofFlowIds/
// findListingForFeedback/roleDisplayName/refreshListingNow）自 app/desktop/session.ts **逐字搬移**；
// 方法体仅做 receiver/port 适配（`this.deps.getListing` / `this.deps.refreshListing` → 注入的 deps 参数，
// **仍以 deps 方法调用形式执行**；`this.handbackOwnerRoleId` / `this.findListingForFeedback` → 同模块函数），
// 判定、顺序与文案不变。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import type { ProjectListing } from "../../../../src/service/role/resolve-role.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";

/** 名单/刷新端口面（原 `this.deps` 的两项只读查询；仍以方法调用形式执行，保持 receiver 语义）。 */
type RolesDeps = Pick<SessionManagerDeps, "getListing" | "refreshListing">;

/**
 * **回交主人**角色 id（评审 §5.6，数据驱动、不硬编码）：
 *  · trio → `governanceFunction === "schedule"` 的角色（Convener）；
 *  · single → 门禁枚举给的 `primaryRoleId`（旧 su）。
 * 回交、看护系统消息、恢复回执、投递失败系统行全部用它；`primaryRoleId` 只用于主入口/客户镜像。
 * 枚举不到 → null（投递机按既有「目标未枚举」路径保留待重试，绝不静默丢）。
 */
export function handbackOwnerRoleId(projectRoot: string, deps: RolesDeps): string | null {
  const listing = deps.getListing(projectRoot);
  if (!listing) return null;
  if ((listing.governanceModel ?? "single") === "trio") {
    const convener = listing.roles.find((r) => r.governanceFunction === "schedule");
    return convener !== undefined ? convener.roleId : null;
  }
  const id = typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
  return id !== "" ? id : null;
}

/** B 批：任务/汇报主链的幕僚角色 id（**只认真实 chief**，不把旧 liaison 别名算作星形主链）。 */
export function chiefTaskRoleIdOf(projectRoot: string, deps: RolesDeps): string | null {
  const listing = deps.getListing(projectRoot);
  if (!listing || (listing.governanceModel ?? "single") !== "trio") return null;
  return listing.roles.find((r) => r.governanceFunction === "chief")?.roleId ?? null;
}

/**
 * **派发主人**角色 id（routeDispatch 的来源防御性校验）：trio → Convener；single → 主入口（su）。
 * 正常路径由 `open()` 的能力注入保证；此处只做防御性再校验（绝不静默换人）。
 */
export function dispatcherRoleIdOf(projectRoot: string, deps: RolesDeps): string | null {
  return handbackOwnerRoleId(projectRoot, deps);
}

/**
 * Proof settle 的报告指针：优先用本轮投递 origin 的 flowId；缺失时按账本 verifier 派发记录取最近的
 * flow（有界；读不到 ⇒ 空集，只给通用目录指针）。**只读**，不猜验收结论、不伪造报告版本。
 */
export function resolveProofFlowIds(_projectRoot: string, hinted?: readonly string[]): string[] {
  return [...new Set((hinted ?? []).filter((id): id is string => typeof id === "string" && id !== ""))].slice(0, 3);
}

/** `mirrorGovernanceFeedback` 的 listing 查找：精确命中优先；miss 时按斜杠变体再查（仅查找，不改 key）。 */
export function findListingForFeedback(projectRoot: string, deps: RolesDeps): ProjectListing | undefined {
  const direct = deps.getListing(projectRoot);
  if (direct !== undefined) return direct;
  for (const variant of [projectRoot.replace(/\\/g, "/"), projectRoot.replace(/\//g, "\\")]) {
    if (variant === projectRoot) continue;
    const found = deps.getListing(variant);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** 角色显示名（listing 的 `displayName`；无则 roleId）——用于派发正文来源与治理反馈文案。 */
export function roleDisplayName(projectRoot: string, roleId: string, deps: RolesDeps): string {
  const listing = findListingForFeedback(projectRoot, deps);
  const role = listing?.roles.find((r) => r.roleId === roleId);
  const name = (role as { displayName?: unknown } | undefined)?.displayName;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : roleId;
}

export async function refreshListingNow(projectRoot: string, deps: RolesDeps): Promise<boolean> {
  if (deps.refreshListing === undefined) return false;
  try {
    await deps.refreshListing(projectRoot);
    return true;
  } catch (error) {
    createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("project.listing.refresh.failed", error);
    return false;
  }
}
