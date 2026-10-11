// Service：双来源边界解析（含项目覆盖）
// 冻结契约 §3：resolveBoundary(roleId, project): Promise<BoundarySection1>
// 项目覆盖（若已接受）优先，否则内置；返回 boundarySource 与 acceptance。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { resolveBoundarySection } from "../../common/门禁引擎/boundary-core.ts";

export function resolveBoundary(roleId: string, project: ProjectConfig): Promise<BoundarySection1> {
  return resolveBoundarySection(roleId, project);
}
