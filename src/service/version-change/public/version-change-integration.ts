// src/service/version-change/public/version-change-integration.ts
// S2 集成工厂：把 C2c 冻结的 VCA/冻结/stable-write/refactor Service 接到 S1 Provider 存储
// 与 S2 trunk service（P1 §2.4/§3.4/§7.2；C2c 交接 §八-1/S2）。
//
// 纪律：
// · 本文件只做**组合与依赖注入**：不新增业务判定、不另造形状、不写账本/发卡；
// · S1 存储（`createVersionChangeStore`/`createStableWriteStore`/`createStableWritePermitStore`/
//   `createGuardFreezeRegistry`/`createFreezeCacheStore`）为唯一持久化；
// · `hashes` = S2 `ProjectHashPort` 生产实现；`trunk` = S2 `createTrunkService`
//   （结构满足 C2c `TrunkBaselinePort & TrunkStableSnapshotPort`）；
// · `migrationCompleted` 由注入（C2c 迁移完成后置 true；缺省 false = 安全向 migration-required）；
// · 迁移扫描/编排在此导出（`ensureMigration`），供 S4 启动/会话打开调用。

import path from "node:path";

import { createFsTrunkStore } from "../../../provider/trunk/public/trunk-store.ts";
import {
  createFreezeCacheStore,
  createGuardFreezeRegistry,
  createRefactorRequestStore,
  createStableWritePermitStore,
  createStableWriteStore,
  createVersionChangeStore,
} from "../../../provider/version-change/public/version-change-store.ts";
import type { DocFreezeCache, FreezeCacheStore, RefactorRequestStore } from "../../../provider/version-change/public/version-change-store.ts";
import { createTrunkService } from "../../trunk/public/trunk-service.ts";
import type { RunRepinPort, TrunkService } from "../../trunk/public/trunk-service.ts";
import type {
  VersionChangeServiceAllocation,
  VersionChangeServices,
} from "../abstract/version-change-service.ts";
import { ensureFreezeMigration, scanExistingVersionedDocs, type EnsureMigrationResult } from "../impl/freeze-migration.ts";
import { createProjectHashPort } from "../impl/project-hash-port.ts";
import { createVersionChangeService } from "./version-change-service.ts";

export interface VersionChangeIntegrationOptions {
  projectRoot: string;
  now?: () => Date;
  /** C2c 迁移完成判定（缺省 false：migration-required 安全向，F29）。 */
  migrationCompleted?: () => boolean | Promise<boolean>;
  allocate?: VersionChangeServiceAllocation;
  /** S3 run manifest re-pin Port（upgrade/detail apply 需要时注入）。 */
  runRepin?: RunRepinPort;
}

export interface VersionChangeIntegration {
  services: VersionChangeServices;
  trunk: TrunkService;
  freezeCache: FreezeCacheStore;
  refactorRequests: RefactorRequestStore;
  /** 启动/会话打开：确保冻结注册表可用并完成迁移（missing ⇒ 一律冻结；corrupt ⇒ fail-closed）。 */
  ensureMigration(at: string): Promise<EnsureMigrationResult>;
  /** 迁移扫描（只读；测试/诊断）。 */
  scanExistingDocs(): Promise<Array<{ path: string; version: number; sha256: string }>>;
  /** 读 `doc-freezes.json` 派生缓存（对账/面板；权威仍为 R9 baseline）。 */
  loadFreezeCache(): Promise<{ ok: true; value: DocFreezeCache } | { ok: false; reason: "missing" | "corrupt" | "io"; message?: string }>;
}

/**
 * 构建完整 version-change 栈：S1 存储 + C2b 冻结注册表适配 + S2 trunk service + C2c Service。
 * 不启动后台任务、不写账本、不自动迁移（`ensureMigration` 由调用方在启动/会话打开时调用）。
 */
export function createVersionChangeIntegration(options: VersionChangeIntegrationOptions): VersionChangeIntegration {
  const root = path.resolve(options.projectRoot);
  const now = options.now ?? (() => new Date());
  const migrationOptions = {
    now,
    ...(options.migrationCompleted !== undefined ? { migrationCompleted: options.migrationCompleted } : {}),
  };

  const freezeRegistry = createGuardFreezeRegistry(root, migrationOptions);
  const freezeCache = createFreezeCacheStore(root, migrationOptions);
  const trunk = createTrunkService({
    projectRoot: root,
    store: createFsTrunkStore(root),
    freezeRegistry,
    ...(options.runRepin !== undefined ? { runRepin: options.runRepin } : {}),
    now,
  });

  const services = createVersionChangeService({
    versionChanges: createVersionChangeStore(root),
    freezeRegistry,
    stableWrites: createStableWriteStore(root),
    permits: createStableWritePermitStore(root),
    hashes: createProjectHashPort(root),
    trunk,
    now,
    ...(options.allocate !== undefined ? { allocate: options.allocate } : {}),
  });

  return {
    services,
    trunk,
    freezeCache,
    refactorRequests: createRefactorRequestStore(root),
    ensureMigration(at: string) {
      return ensureFreezeMigration(services.freeze, root, at);
    },
    scanExistingDocs() {
      return scanExistingVersionedDocs(root);
    },
    loadFreezeCache() {
      return freezeCache.load();
    },
  };
}

export { ensureFreezeMigration, scanExistingVersionedDocs };
export type { EnsureMigrationResult };
