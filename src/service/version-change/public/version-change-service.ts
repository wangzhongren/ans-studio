// src/service/version-change/public/version-change-service.ts
// 冻结 / VCA / stable-write / 轻量重构 Service 公共出口（编排 B-7；2026-11-04 C2c 契约冻结）。
// 只 re-export 抽象契约与冻结纯函数 + 组合工厂；不定义第二份形状、不导出 Provider 实现细节。
//
// 消费方：Pipeline S4（`version-change-runtime`/`stable-write-runtime`/`refactor-runtime`/
// `trunk-runtime`）、门禁引擎 C2b（PermitFact/StableWriteDecisionInput 联合契约）、测试。
// 接线纪律：本模块不写盘、不写账本、不直接发卡；冻结注册表/同步快照/`stableWriteDecision`
// 均由门禁引擎 C2b 经 Port 注入（F7/F13/F16）。

import { buildFreezeService } from "../impl/freeze-service.ts";
import { buildRefactorValidator } from "../impl/refactor-validate.ts";
import { buildStableWriteService } from "../impl/stable-write-service.ts";
import { buildVcaService } from "../impl/vca-service.ts";
import type {
  VersionChangeServiceDeps,
  VersionChangeServices,
} from "../abstract/version-change-service.ts";

/** 本 Service 公共契约版本（形状/状态机/错误码变更重开闸门 1；P1.6 §5.8）。 */
export const VERSION_CHANGE_SERVICE_CONTRACT_VERSION = "version-change-service/v1";

/**
 * 组合工厂：构建 VCA / 冻结 / stable-write / 重构校验四个 Service。
 * deps 由 S1 Provider（记录存储）+ 门禁引擎 C2b（R9 扩展/快照/许可快照）+ S2 trunk service 注入；
 * 本工厂不读盘、不启动后台任务、不写账本。
 */
export function createVersionChangeService(deps: VersionChangeServiceDeps): VersionChangeServices {
  const freeze = buildFreezeService({ registry: deps.freezeRegistry });
  const vca = buildVcaService({
    repository: deps.versionChanges,
    freeze,
    hashes: deps.hashes,
    trunk: deps.trunk,
    ...(deps.allocate?.applicationId !== undefined
      ? { allocateApplicationId: deps.allocate.applicationId }
      : {}),
  });
  const stableWrite = buildStableWriteService({
    records: deps.stableWrites,
    permits: deps.permits,
    hashes: deps.hashes,
    trunk: deps.trunk,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    ...(deps.allocate?.requestId !== undefined ? { allocateRequestId: deps.allocate.requestId } : {}),
    ...(deps.allocate?.permitId !== undefined ? { allocatePermitId: deps.allocate.permitId } : {}),
  });
  const refactor = buildRefactorValidator();
  return { vca, freeze, stableWrite, refactor };
}

// —————————————— 抽象契约（re-export，不复制） ——————————————

export type {
  BootstrapFreezeInput,
  DocFreezeInput,
  DocFreezeRecordInput,
  DraftCandidate,
  DraftMarkerEntry,
  ExistingVersionedDoc,
  FreezeMigrationInput,
  FreezeMigrationReport,
  FreezeRegistryPort,
  FreezeRegistryState,
  FreezeService,
  PermitFact,
  PortWriteResult,
  ProjectHashPort,
  RefactorEnforcement,
  RefactorSubmitInput,
  RefactorValidationContext,
  RefactorValidationResult,
  RefactorValidator,
  ServiceResult,
  StablePermitPort,
  StableRepinAudit,
  StableRepinOutcome,
  StableWriteApproveResult,
  StableWriteCompleteInput,
  StableWriteCompleteResult,
  StableWriteDecision,
  StableWriteRepositoryPort,
  StableWriteRequestInput,
  StableWriteService,
  TrunkBaselinePort,
  TrunkStableSnapshotPort,
  VersionChangeApplyInput,
  VersionChangeApproveInput,
  VersionChangeCreateInput,
  VersionChangeMutation,
  VersionChangeRejectInput,
  VersionChangeRepositoryPort,
  VersionChangeService,
  VersionChangeServiceAllocation,
  VersionChangeServiceDeps,
  VersionChangeServices,
  VersionChangeSubmitInput,
  VersionChangeTargetDraft,
  VersionChangeTargetRecord,
} from "../abstract/version-change-service.ts";
export { VERSION_CHANGE_TRANSITIONS, canTransitionVersionChange } from "../abstract/version-change-service.ts";
export type { VersionChangeStatus } from "../../../model/version-change.ts";

// —————————————— 冻结纯函数（契约面） ——————————————

export {
  buildDocFreezeRecord,
  FREEZE_HANDOFF_PIN_APPLICATION_ID,
  FREEZE_MIGRATION_APPLICATION_ID,
  type FreezeFailureCode,
} from "../impl/freeze-service.ts";
export {
  AUTHOR_ROLE_BY_TARGET_KIND,
  authorRoleForTargetKind,
  docVersionOf,
  findHashDrift,
  isStableDocPath,
  matchTargetsToItems,
  normalizeServiceRelPath,
  pathFamilyOf,
  targetPathInAuthorArea,
  type TargetsItemsCheck,
} from "../impl/targets-items.ts";
export { stableWritePathOf } from "../impl/stable-write-service.ts";
export {
  buildRefactorEnforcement,
  classifyRefactorPath,
  validateRefactorSubmit,
  type RefactorPathClassification,
} from "../impl/refactor-validate.ts";
