// src/service/version-change/impl/freeze-migration.ts
// 冻结迁移扫描/编排（S2；P1 §4.2；F29/AC-21/AC-25）。
//
// 纪律：
// · 既有版本化文档**一律默认冻结**（`migrated-legacy`，origin application）——扫描当前磁盘上的
//   受管版本化文档（门禁引擎 `protectedVersionedPaths` 只读清单 + 当刻字节哈希）；
// · `migrated-draft` 需要证据（无客户确认记录/最后写入晚于最后一次确认）；S2 扫描不自行
//   伪造证据 ⇒ 子候选为空（无证据默认冻结，安全向，F29）；证据由 S2/S3 后续按客户确认记录补充；
// · missing ⇒ 迁移（写冻结记录并刷新快照）；ready ⇒ no-op（刷新快照）；corrupt ⇒ fail-closed，
//   不迁移/不重建（AC-21）；
// · 冻结记录写入只经 C2c `FreezeService.migrate`（其内部为 C2b `appendDocFreezeRecords`）。

import { scanVersionedDocuments } from "../../../provider/version-change/public/version-change-store.ts";
import type { DocFreezeErrorCode } from "../../../model/version-change.ts";
import type {
  ExistingVersionedDoc,
  FreezeMigrationReport,
  FreezeRegistryState,
  FreezeService,
} from "../abstract/version-change-service.ts";

/** 扫描受管版本化文档（只读；版本号/字节哈希；缺失/不可读跳过）。 */
export async function scanExistingVersionedDocs(projectRoot: string): Promise<ExistingVersionedDoc[]> {
  return scanVersionedDocuments(projectRoot);
}

export type EnsureMigrationResult =
  | { ok: true; state: FreezeRegistryState; report?: FreezeMigrationReport }
  | { ok: false; code: DocFreezeErrorCode; message?: string };

/**
 * 启动/会话打开：确保冻结注册表可用并完成迁移。
 * missing ⇒ 扫描 + migrate（既有文档一律冻结）；ready ⇒ 刷新快照；corrupt ⇒ fail-closed。
 */
export async function ensureFreezeMigration(
  freeze: FreezeService,
  projectRoot: string,
  at: string,
): Promise<EnsureMigrationResult> {
  let state: FreezeRegistryState;
  try {
    state = await freeze.state();
  } catch {
    return { ok: false, code: "doc-freeze-registry-unavailable", message: "冻结注册表不可读" };
  }
  if (state === "corrupt") {
    return { ok: false, code: "doc-freeze-registry-corrupt", message: "冻结注册表损坏：不迁移/不重建（AC-21）" };
  }
  if (state === "ready") {
    const ready = await freeze.ensureReady();
    return ready.ok
      ? { ok: true, state }
      : { ok: false, code: ready.code, message: "冻结快照刷新失败" };
  }
  const existingDocs = await scanExistingVersionedDocs(projectRoot);
  // 无证据的草稿候选不提交（migrated-draft 必须带证据；F29 默认冻结）。
  const migrated = await freeze.migrate({ existingDocs, at });
  if (!migrated.ok) {
    return { ok: false, code: migrated.code, message: migrated.message };
  }
  return { ok: true, state, report: migrated.value };
}
