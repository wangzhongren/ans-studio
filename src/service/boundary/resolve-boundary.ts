// Service：双来源边界解析（含项目覆盖）
// 冻结契约 §3：resolveBoundary(roleId, project): Promise<BoundarySection1>
// 项目覆盖（若已接受）优先，否则内置；返回 boundarySource 与 acceptance。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { resolveBoundarySection, frozenSnapshotBoundary, selectRoleDocumentEvidence } from "../../common/门禁引擎/boundary-core.ts";
import { createProjectTrunkStore } from "../../provider/trunk/public/trunk-store.ts";
import { governanceRoleOf as builtInSpec } from "../../common/门禁引擎/governance-roles.ts";
import { refreshVersionedDocFreezeSnapshot as readFreezeSnapshot, type VersionedDocFreezeSnapshot,
  acquireVersionLock, ownsVersionLock, readVersionBaselineState, writeVersionBaselineState, scanVersionedDocuments } from "../../provider/version-change/public/version-change-store.ts";
import { installVersionedDocFreezeSnapshot, invalidateVersionedDocFreezeSnapshot, normalizeVersionedDocPath, isVersionedDocPath,
  parseVersionBaselineState, planVersionBaselineRegistration, verifyVersionBaselineData, readVersionBaselineShaData, hasReadyVersionedDocFreezeSnapshot,
  VERSION_BASELINE_REL, type VersionBaselineFile, type VersionBaselineViolation, type BaselineShaResult } from "../../common/门禁引擎/versioned-doc-guard.ts";
import { createHash } from "node:crypto";

const BASELINE_FILE_LIMIT = 4096, BASELINE_BYTE_LIMIT = 1024 * 1024, BASELINE_TOTAL_LIMIT = 64 * 1024 * 1024;
const baselineFailure = (): VersionBaselineViolation[] => [{ path: VERSION_BASELINE_REL, reason: "baseline-corrupt" }];

/** Strict enumeration and byte reads are Provider work; no Provider capability escapes this Service. */
async function readVersionBaselineFiles(projectRoot: string): Promise<VersionBaselineFile[]> {
  const rows = await scanVersionedDocuments(projectRoot, { strict: true, maxFiles: BASELINE_FILE_LIMIT, maxBytesPerFile: BASELINE_BYTE_LIMIT });
  const store = createProjectTrunkStore(projectRoot);
  if (!store.readProjectFile) throw new Error("version-baseline-file-reader-unavailable");
  const files: VersionBaselineFile[] = []; let total = 0;
  for (const row of rows) {
    const read = await store.readProjectFile(row.path, { maxBytes: BASELINE_BYTE_LIMIT });
    if (!read.ok) throw new Error(`version-baseline-file-${read.reason}:${row.path}`);
    const bytes = Buffer.from(read.value.bytesBase64, "base64"); total += bytes.length;
    if (total > BASELINE_TOTAL_LIMIT || bytes.toString("base64") !== read.value.bytesBase64
      || read.value.sha256 !== row.sha256 || createHash("sha256").update(bytes).digest("hex") !== row.sha256)
      throw new Error(`version-baseline-file-drift:${row.path}`);
    files.push({ path: row.path, ...read.value });
  }
  return files;
}

/** Register one successful owner write. Old common effect entry points remain pending caller migration. */
export async function registerVersionedDocument(input: { projectRoot: string; relPath: string; recordedBy?: string }): Promise<boolean | undefined> {
  const relPath = normalizeVersionedDocPath(input.relPath);
  if (relPath === undefined) return false;
  if (!isVersionedDocPath(relPath)) return;
  const root = input.projectRoot;
  try {
    const release = await acquireVersionLock(root);
    try {
      const raw = await readVersionBaselineState(root), state = parseVersionBaselineState({ baselineText: raw.text, initialized: raw.initialized });
      if (!state.ok) { invalidateVersionedDocFreezeSnapshot(root); return false; }
      const files = await readVersionBaselineFiles(root);
      const planned = planVersionBaselineRegistration({ baselineText: raw.text, initialized: raw.initialized, files, scanComplete: true,
        relPath, recordedBy: input.recordedBy, at: new Date().toISOString() });
      if (planned.registered !== true) return planned.registered;
      if (!(await ownsVersionLock(root, release.token))) { invalidateVersionedDocFreezeSnapshot(root); return false; }
      if (planned.nextText !== undefined) {
        const written = await writeVersionBaselineState(root, { text: planned.nextText,
          expectedSha256: raw.text === null ? null : createHash("sha256").update(raw.text).digest("hex"),
          ...(planned.initialize ? { initialize: true } : {}), lockToken: release.token });
        if (!written.ok) { invalidateVersionedDocFreezeSnapshot(root); return false; }
        const confirmed = await readVersionBaselineState(root);
        if (!confirmed.initialized || confirmed.text !== planned.nextText || !(await ownsVersionLock(root, release.token))) {
          invalidateVersionedDocFreezeSnapshot(root); return false;
        }
      }
      // Preserve an already proven migration state; a first TOFU baseline is not proof that migration finished.
      const migrationCompleted = hasReadyVersionedDocFreezeSnapshot(root);
      await refreshAndInstallVersionedDocFreezeSnapshot(root, { migrationCompleted });
      return true;
    } finally { await release(); }
  } catch { invalidateVersionedDocFreezeSnapshot(root); return false; }
}

/** Verify the full actual versioned-file set under the same R9 Provider lock. */
export async function verifyVersionedDocuments(input: { projectRoot: string }): Promise<VersionBaselineViolation[]> {
  try {
    const release = await acquireVersionLock(input.projectRoot);
    try {
      const raw = await readVersionBaselineState(input.projectRoot), state = parseVersionBaselineState({ baselineText: raw.text, initialized: raw.initialized });
      if (!state.ok) return [{ path: VERSION_BASELINE_REL, reason: state.reason }];
      const files = await readVersionBaselineFiles(input.projectRoot);
      if (!(await ownsVersionLock(input.projectRoot, release.token))) return baselineFailure();
      return verifyVersionBaselineData({ baselineText: raw.text, initialized: raw.initialized, files, scanComplete: true });
    } finally { await release(); }
  } catch { invalidateVersionedDocFreezeSnapshot(input.projectRoot); return baselineFailure(); }
}

/** Latest canonical/actual baseline SHA, read through the Provider and parsed without I/O in common. */
export async function readVersionBaselineSha(input: { projectRoot: string; relPath: string }): Promise<BaselineShaResult> {
  try {
    const release = await acquireVersionLock(input.projectRoot);
    try {
      const raw = await readVersionBaselineState(input.projectRoot);
      if (!(await ownsVersionLock(input.projectRoot, release.token))) return { ok: false, reason: "baseline-corrupt" };
      return readVersionBaselineShaData({ baselineText: raw.text, initialized: raw.initialized, relPath: input.relPath });
    } finally { await release(); }
  } catch { return { ok: false, reason: "baseline-corrupt" }; }
}
export type { VersionBaselineViolation, BaselineShaResult } from "../../common/门禁引擎/versioned-doc-guard.ts";

/** Await the Provider read before installing G's pure synchronous guard cache. */
export async function refreshAndInstallVersionedDocFreezeSnapshot(
  projectRoot: string,
  options: { migrationCompleted?: boolean; now?: () => Date } = {},
): Promise<VersionedDocFreezeSnapshot> {
  try {
    const snapshot = await readFreezeSnapshot(projectRoot, options);
    installVersionedDocFreezeSnapshot(projectRoot, snapshot);
    return snapshot;
  } catch (error) {
    invalidateVersionedDocFreezeSnapshot(projectRoot);
    throw error;
  }
}

/** No Provider capability escapes this Service; common only selects/parses ordinary data. */
async function resolveRoleDocumentContext(roleId: string, project: ProjectConfig): Promise<ReturnType<typeof frozenSnapshotBoundary> | null> {
  const context = project.documentContext;
  if (context === undefined && (roleId === "su" || builtInSpec(roleId))) return null;
  const store = createProjectTrunkStore(project.projectRoot);
  const manifest = context === undefined ? await store.readManifest() : undefined;
  if (manifest && !manifest.ok) {
    if (manifest.reason === "missing") return null;
    throw new Error(`effective-trunk-${manifest.reason}`);
  }
  const selected = selectRoleDocumentEvidence(roleId, project, manifest?.ok ? manifest.value : undefined);
  const read = selected.kind === "frozen" ? await store.readFrozenRoleEvidence!(selected.evidence)
    : await store.readActiveRoleEvidence!(selected.evidence);
  if (!read.ok) throw new Error(`frozen-role-${read.reason}:${read.message ?? ""}`);
  return frozenSnapshotBoundary(read.value, selected.evidence, selected.authority);
}

export async function resolveBoundary(roleId: string, project: ProjectConfig): Promise<BoundarySection1> {
  try {
    const frozen = await resolveRoleDocumentContext(roleId, project);
    return frozen ? frozen.boundary : resolveBoundarySection(roleId, project);
  } catch (error) {
    return { entries: [], boundarySource: "<frozen-evidence-unavailable>", acceptance: { accepted: false, source: "" },
      parseError: error instanceof Error ? error.message : String(error) };
  }
}

export { validateRoleDocumentsSnapshot } from "../../common/门禁引擎/boundary-core.ts";
export type { SnapshotRoleDocuments, RoleDocumentsValidation } from "../../common/门禁引擎/boundary-core.ts";
export type { RoleDocumentCheck } from "../../model/boundary.ts";

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
  LEGACY_SU_CAPABILITIES,
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
  GovernanceCapabilities,
  GovernanceRoleSpec,
  TrioGovernanceRoleId,
} from "../../common/门禁引擎/governance-roles.ts";
