// Service：双来源边界解析（含项目覆盖）
// 冻结契约 §3：resolveBoundary(roleId, project): Promise<BoundarySection1>
// 项目覆盖（若已接受）优先，否则内置；返回 boundarySource 与 acceptance。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { resolveBoundarySection } from "../../common/门禁引擎/boundary-core.ts";

export function resolveBoundary(roleId: string, project: ProjectConfig): Promise<BoundarySection1> {
  return resolveBoundarySection(roleId, project);
}

// Service 公共出口：边界 YAML 文本校验（写前校验，2026-10-18 真机修复）。
// 编排在提名官写 `角色卡/<角色 id>/boundary.yaml` 前复用；只读解析、不写盘、不读盘。
// 单一来源恒在门禁引擎私有 `boundary-yaml.ts`——本文件**同一函数引用**再导出（不复制实现）；
// 与运行时加载器共用同一个解析器，避免写前校验与加载口径漂移。
export { validateBoundaryYamlText } from "../../common/门禁引擎/boundary-yaml.ts";
export type { BoundaryYamlValidation } from "../../common/门禁引擎/boundary-yaml.ts";

// Service 公共出口：治理种子边界（已有角色但无治理记录的项目「建立治理记录」，设计
// `2026-10-17_design_existing-project-compat` / PM 评审 §五 A1）。
//
// 单一来源：实现恒在门禁引擎私有 `src/common/门禁引擎/governance-seed.ts`——本文件**同一函数引用**
// 再导出（不复制实现）；跨角色只可经此处（Service 公开出口）消费本角色私有 `common/`（§6）。
// 该边界**一次性**：调用方只在单次 finalize 调用内构造/使用，**不得**写入 ProjectConfig、`.ans`
// 或任何缓存（否则退化为常设治理写权，客户已否决）。
export { buildGovernanceSeedBoundaryForGate as buildGovernanceSeedBoundary } from "../../common/门禁引擎/governance-seed.ts";

// Service 公共出口：只读 pin 证据检查（治理记录 pin 不符的重新接受恢复；设计
// `2026-10-17_design_governance-pin-recovery-review` §5.1）。
//
// 单一来源：实现恒在门禁引擎私有 `src/common/门禁引擎/pin-evidence.ts`——本文件**同一函数引用**
// 再导出（不复制实现）；跨角色（编排/桌面窗口）只可经此处消费。该检查**只读**：不写盘、不建目录、
// 不缓存；返回的 `files` 仅含非一致项、`digest` 覆盖全部 pin（写入前重算比对，G4）。
export { inspectPinnedBoundaries } from "../../common/门禁引擎/pin-evidence.ts";
export type {
  PinEvidenceFile,
  PinEvidenceFileStatus,
  PinEvidenceResult,
  PinEvidenceState,
} from "../../model/boundary.ts";

// Service 公共出口：内置治理角色注册表（治理三权分立 V1；评审
// `2026-10-17_design_governance-trio-review.md` §5.2/§5.6；四角色增补
// `2026-10-18_design_governance-liaison-review.md` §4.2–§4.4）。
//
// 单一来源恒在门禁引擎私有 `src/common/门禁引擎/governance-roles.ts`——本文件**同一绑定**再导出
// （不复制实现/数据）；跨角色（编排/桌面窗口）只可经此公共出口消费，不得导入本角色私有 `common/`。
// 注册表是**纯数据 + 纯查询**：trio 四人（liaison/rapporteur/nominator/convener）的 Section 1、
// 预授权目录、禁写路径、能力矩阵与应用专用治理边界（`appGovernanceBoundary`）。
// 应用边界只给应用写库用，**不注入任何角色会话**。
export {
  APP_GOVERNANCE_SOURCE,
  BUILT_IN_GOVERNANCE_ROLES,
  LEGACY_GOVERNANCE_ROLE_ID,
  LEGACY_SU_CAPABILITIES,
  LEGACY_SU_CARD_TEXT,
  LEGACY_SU_PREAUTHORIZED_DIRS,
  appGovernanceBoundary,
  appGovernanceEntries,
  governanceCapabilitiesOf,
  governanceFunctionOf,
  governanceRoleOf,
  isBuiltInGovernanceRoleId,
  isTrioGovernanceRoleId,
  trioGovernanceSource,
} from "../../common/门禁引擎/governance-roles.ts";
export type {
  BuiltInGovernanceRoleSpec,
  DeprecatedLiaisonRoleSpec,
  GovernanceCapabilities,
  GovernanceRoleSpec,
  TrioGovernanceRoleId,
} from "../../common/门禁引擎/governance-roles.ts";
