// src/provider/version-change/impl/fs-freeze-cache.ts
// `doc-freezes.json` 派生同步缓存的文件系统实现（B-6 / S1）。
//
// 依据 P1 §2.2-5/§3.2/§4.1、F34、AC-27 与 C2b 交接 §八-4：
// · baseline 读取/快照构建只经 C2b `refreshVersionedDocFreezeSnapshot`（读 `versions.jsonl`、
//   构建并安装同步快照、返回带 `baselineSha256` 的快照）；本文件不解析/不写 `versions.jsonl`；
// · `doc-freezes.json` 内容 = C2b 快照（`doc-freezes/v1`，单一形状），原子写；
// · 对账：缓存缺失/陈旧（`baselineSha256` 不同）⇒ 从 baseline 重建并告警；
//   缓存 JSON/结构损坏 ⇒ `unusable`（fail-closed，不自动重建）；
//   baseline corrupt/缺失（含迁移未完成）⇒ `unusable`（不重写缓存，F29/AC-21）。

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  refreshVersionedDocFreezeSnapshot,
  type VersionedDocFreezeSnapshot,
} from "../../../common/门禁引擎/versioned-doc-guard.ts";
import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { DOC_FREEZE_REASONS } from "../../../model/version-change.ts";
import { DOC_FREEZES_REL } from "../abstract/freeze-cache.ts";
import type {
  CacheRebuildResult,
  CacheReconcileResult,
  DocFreezeCache,
  FreezeCacheStore,
} from "../abstract/freeze-cache.ts";

const FREEZE_CACHE_SCHEMA = "doc-freezes/v1";

type CacheLoad =
  | { ok: true; value: DocFreezeCache }
  | { ok: false; reason: "missing" | "corrupt" | "io"; message?: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

/** 缓存结构校验（= C2b 快照形状；只判必需字段/枚举，未知字段放行）。 */
export function isDocFreezeCacheShape(value: unknown): value is DocFreezeCache {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== FREEZE_CACHE_SCHEMA) return false;
  if (
    value.state !== "ready" &&
    value.state !== "migration-required" &&
    value.state !== "corrupt" &&
    value.state !== "unknown"
  ) {
    return false;
  }
  if (typeof value.builtAt !== "string" || value.builtAt.trim() === "") return false;
  if (value.baselineSha256 !== undefined && !isSha256Hex(value.baselineSha256)) return false;
  if (!Array.isArray(value.entries)) return false;
  for (const entry of value.entries) {
    if (!isObject(entry)) return false;
    if (typeof entry.path !== "string" || entry.path.trim() === "") return false;
    if (typeof entry.version !== "number" || !Number.isInteger(entry.version) || entry.version < 1) return false;
    if (!isSha256Hex(entry.sha256)) return false;
    if (typeof entry.frozen !== "boolean") return false;
    if (entry.reason !== undefined && !(DOC_FREEZE_REASONS as readonly string[]).includes(entry.reason as string)) {
      return false;
    }
    if (entry.applicationId !== undefined && (typeof entry.applicationId !== "string" || entry.applicationId.trim() === "")) {
      return false;
    }
    if (entry.migratedDraft !== undefined && typeof entry.migratedDraft !== "boolean") return false;
  }
  return true;
}

export interface FreezeCacheStoreOptions {
  now?: () => Date;
  /** C2c 迁移完成判定；缺省 false（migration-required 安全向，F29）。 */
  migrationCompleted?: () => boolean | Promise<boolean>;
  /** 测试注入：替代 C2b `refreshVersionedDocFreezeSnapshot`（默认即 C2b）。 */
  refresh?: (
    projectRoot: string,
    options: { migrationCompleted?: boolean; now?: () => Date },
  ) => Promise<VersionedDocFreezeSnapshot>;
}

/** 创建 `doc-freezes.json` 派生缓存存储（`projectRoot` 绑定）。 */
export function createFreezeCacheStore(
  projectRoot: string,
  options: FreezeCacheStoreOptions = {},
): FreezeCacheStore {
  const root = path.resolve(projectRoot);
  const abs = path.join(root, DOC_FREEZES_REL);
  const refresh = options.refresh ?? refreshVersionedDocFreezeSnapshot;

  async function load(): Promise<CacheLoad> {
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") return { ok: false, reason: "missing" };
      return { ok: false, reason: "io", message: code ?? String(err) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "corrupt", message: "invalid-json" };
    }
    if (!isDocFreezeCacheShape(parsed)) return { ok: false, reason: "corrupt", message: "invalid-shape" };
    return { ok: true, value: parsed };
  }

  async function write(cache: DocFreezeCache): Promise<{ ok: true } | { ok: false; code: "io"; message?: string }> {
    if (!isDocFreezeCacheShape(cache)) return { ok: false, code: "io", message: "invalid-cache" };
    try {
      await mkdir(path.dirname(abs), { recursive: true });
      await atomicWrite(abs, `${JSON.stringify(cache, null, 2)}\n`);
      return { ok: true };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      return { ok: false, code: "io", message: code ?? String(err) };
    }
  }

  async function buildSnapshot(): Promise<VersionedDocFreezeSnapshot> {
    const migrationCompleted =
      options.migrationCompleted === undefined ? false : await options.migrationCompleted();
    return refresh(root, {
      migrationCompleted,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  }

  function unusableFromSnapshot(
    snapshot: VersionedDocFreezeSnapshot,
  ): { state: "unusable"; reason: "baseline-corrupt" | "baseline-missing"; message: string } | undefined {
    if (snapshot.state === "corrupt" || snapshot.state === "unknown") {
      return {
        state: "unusable",
        reason: "baseline-corrupt",
        message: "冻结注册表损坏：fail-closed，不自动重建/不重写缓存（F29/AC-21）",
      };
    }
    if (snapshot.state === "migration-required") {
      return {
        state: "unusable",
        reason: "baseline-missing",
        message: "baseline 缺失或迁移未完成：先执行迁移（F29），缓存不重建",
      };
    }
    return undefined;
  }

  async function writeRebuilt(
    snapshot: VersionedDocFreezeSnapshot,
    warning: string,
  ): Promise<CacheReconcileResult> {
    const written = await write(snapshot);
    if (!written.ok) {
      return { state: "unusable", reason: "io", message: written.message ?? "cache-write-failed" };
    }
    return { state: "rebuilt", cache: snapshot, warning };
  }

  return {
    load,

    write,

    async rebuildFromBaseline(): Promise<CacheRebuildResult> {
      const snapshot = await buildSnapshot();
      const unusable = unusableFromSnapshot(snapshot);
      if (unusable !== undefined) {
        return { ok: false, reason: unusable.reason, message: unusable.message };
      }
      const written = await write(snapshot);
      if (!written.ok) {
        return { ok: false, reason: "io", message: written.message ?? "cache-write-failed" };
      }
      return { ok: true, cache: snapshot };
    },

    async reconcile(): Promise<CacheReconcileResult> {
      const snapshot = await buildSnapshot();
      const unusable = unusableFromSnapshot(snapshot);
      if (unusable !== undefined) return unusable;

      const cached = await load();
      if (!cached.ok) {
        if (cached.reason === "missing") {
          return writeRebuilt(snapshot, "doc-freezes 缓存缺失：已从 R9 baseline 重建（AC-27）");
        }
        // 缓存损坏 ⇒ fail-closed，不自动重建（P1 §4.1）。
        return {
          state: "unusable",
          reason: cached.reason === "io" ? "io" : "cache-corrupt",
          message: `doc-freezes 缓存不可用（${cached.reason}${cached.message !== undefined ? `:${cached.message}` : ""}）：fail-closed`,
        };
      }

      const cache = cached.value;
      if (cache.state !== "ready") {
        return writeRebuilt(snapshot, "doc-freezes 缓存状态陈旧：已以 R9 baseline 为准重建（AC-27）");
      }
      if ((cache.baselineSha256 ?? "") !== (snapshot.baselineSha256 ?? "")) {
        return writeRebuilt(snapshot, "doc-freezes 缓存与 baseline 不一致：已以 baseline 为准重建并告警（AC-27）");
      }
      return { state: "consistent", cache };
    },
  };
}
