// 治理权力矩阵 Service：唯一公开入口（Pipeline 只从这里导入）。
//
// 依赖方向：Pipeline → Service（本入口）→ Model / 同角色私有 common；本 Service 不调用其他 Service、
// 不读盘/写盘、不写账本/事件。`abstract/` 不设：操作契约（BuildGovernanceMatrixFn/
// RenderGovernanceMatrixFn/GovernanceMatrixInput）已由 Model 单一声明。
//
// 冻结面（C1b）：buildGovernanceMatrix / renderGovernanceMatrix / 四个上限常量。
// 测试 seam `buildGovernanceMatrixWith` **不**从本文件导出（G-5c）；生产 `buildGovernanceMatrix`
// 内部固定使用真实 BUILT_IN_GOVERNANCE_ROLES，不向调用方暴露注册表参数。

export {
  GOVERNANCE_MATRIX_FIELD_MAX_CHARS,
  GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
  GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
  GOVERNANCE_MATRIX_TOOL_MAX_CHARS,
} from "./impl/limits.ts";

export { buildGovernanceMatrix } from "./impl/builder.ts";
export { renderGovernanceMatrix } from "./impl/renderer.ts";
