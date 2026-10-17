// Service：双来源边界解析（含项目覆盖）
// 冻结契约 §3：resolveBoundary(roleId, project): Promise<BoundarySection1>
// 项目覆盖（若已接受）优先，否则内置；返回 boundarySource 与 acceptance。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { resolveBoundarySection } from "../../common/门禁引擎/boundary-core.ts";

export function resolveBoundary(roleId: string, project: ProjectConfig): Promise<BoundarySection1> {
  return resolveBoundarySection(roleId, project);
}

// Service 公共出口：治理种子边界（已有角色但无治理记录的项目「建立治理记录」，设计
// `2026-10-17_design_existing-project-compat` / PM 评审 §五 A1）。
//
// 单一来源：实现恒在门禁引擎私有 `src/common/门禁引擎/governance-seed.ts`——本文件**同一函数引用**
// 再导出（不复制实现）；跨角色只可经此处（Service 公开出口）消费本角色私有 `common/`（§6）。
// 该边界**一次性**：调用方只在单次 finalize 调用内构造/使用，**不得**写入 ProjectConfig、`.ans`
// 或任何缓存（否则退化为常设治理写权，客户已否决）。
export { buildGovernanceSeedBoundaryForGate as buildGovernanceSeedBoundary } from "../../common/门禁引擎/governance-seed.ts";
