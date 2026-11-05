// src/service/trunk/impl/trunk-common.ts
// 主干 Service 内部共享辅助（S2）：磁盘哈希、trunk digest、manifest↔snapshot 映射、
// 冻结状态查询。不属于公共契约（不 re-export）。

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TrunkApplySnapshot, TrunkDocKind, TrunkManifest } from "../../../model/trunk.ts";
import type { FreezeRegistryStore } from "../../../provider/version-change/abstract/freeze-cache.ts";

/** 规范化 JSON：对象键排序、数组保序、`undefined` 丢弃（digest 跨平台稳定）。 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function sha256TextOrBytes(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256File(projectRoot: string, relPath: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(path.join(projectRoot, relPath));
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * 引用路径的**文件部分**：去 `#fragment`（与 run-manifest 的 pin/re-pin 约定一致——
 * run documents 允许 `path#section` 形式引用文档内嵌区块，如 roster 内嵌拓扑图）。
 * manifest/账本保留完整引用串；凡读磁盘字节或查冻结记录一律用本函数。
 */
export function filePathOfRef(relPath: string): string {
  return relPath.split("#")[0]!;
}

/** 项目相对 POSIX 路径规范化（拒绝绝对路径/`..` 逃逸）。 */
export function normalizeRelPath(relPath: unknown): string | undefined {
  if (typeof relPath !== "string") return undefined;
  const value = relPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "" || value.startsWith("/") || value.startsWith("..") || value.includes("../")) return undefined;
  return value;
}

/** 路径版本号（`-vN.md`；非版本化返回 undefined）。 */
export function docVersionOfPath(relPath: string): number | undefined {
  const match = /-v(\d+)\.md$/i.exec(relPath);
  if (match === null) return undefined;
  const version = Number(match[1]);
  return Number.isInteger(version) && version >= 1 ? version : undefined;
}

/** 路径族（去 `-vN.md`）；无版本号返回 undefined。 */
export function pathFamilyOfPath(relPath: string): string | undefined {
  const family = relPath.replace(/-v\d+\.md$/i, "");
  return family === relPath ? undefined : family;
}

/** trunk 内容 digest（C1 字段；算法在此文档化：canonical JSON 的 sha256）。 */
export function computeTrunkDigest(input: {
  trunkVersion: number;
  flowId: string;
  runId: string | null;
  documents: TrunkManifest["artifacts"]["documents"];
  execution: TrunkManifest["artifacts"]["execution"];
  workflow: TrunkManifest["artifacts"]["workflow"];
  roleCards?: TrunkManifest["artifacts"]["roleCards"];
  boundaries: TrunkManifest["artifacts"]["boundaries"];
  rosterVersion?: number;
  d3?: TrunkManifest["d3"];
  roles?: string[];
}): string {
  return sha256TextOrBytes(canonicalJson(input));
}

/** manifest.artifacts → 对账快照（内容匹配用）。 */
export function snapshotOfManifest(manifest: TrunkManifest): TrunkApplySnapshot {
  const documents: TrunkApplySnapshot["documents"] = {};
  for (const [kind, ref] of Object.entries(manifest.artifacts.documents)) {
    if (ref === undefined) continue;
    documents[kind as TrunkDocKind] = { path: ref.path, sha256: ref.sha256 };
  }
  const roleCards: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
    roleCards[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  const boundaries: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
    boundaries[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  return {
    trunkVersion: manifest.trunkVersion,
    runId: manifest.runId,
    documents,
    execution: {
      teamPlan:
        manifest.artifacts.execution.teamPlan === null
          ? null
          : { path: manifest.artifacts.execution.teamPlan.path, sha256: manifest.artifacts.execution.teamPlan.sha256 },
      flow:
        manifest.artifacts.execution.flow === null
          ? null
          : {
              path: manifest.artifacts.execution.flow.path,
              sha256: manifest.artifacts.execution.flow.sha256,
              version: manifest.artifacts.execution.flow.version,
            },
    },
    workflow: { path: manifest.artifacts.workflow.path, sha256: manifest.artifacts.workflow.sha256 },
    ...(manifest.artifacts.roleCards !== undefined ? { roleCards } : {}),
    boundaries,
  };
}

function normalizedSnapshotParts(snapshot: TrunkApplySnapshot): unknown {
  return {
    trunkVersion: snapshot.trunkVersion,
    runId: snapshot.runId,
    documents: snapshot.documents,
    execution: snapshot.execution,
    workflow: snapshot.workflow ?? null,
    roleCards: snapshot.roleCards ?? {},
    boundaries: snapshot.boundaries ?? {},
  };
}

/** 内容匹配：journal.target 与当前 trunk manifest 是否一致（提交点判据）。 */
export function snapshotMatchesManifest(snapshot: TrunkApplySnapshot, manifest: TrunkManifest): boolean {
  return canonicalJson(normalizedSnapshotParts(snapshot)) ===
    canonicalJson(normalizedSnapshotParts(snapshotOfManifest(manifest)));
}

function pathKey(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

/** 文档冻结查询（apply/verify 用）：`frozen` / `missing` / `corrupt`（fail-closed）。 */
export async function docFreezeState(
  registry: FreezeRegistryStore,
  relPath: string,
  sha256: string,
): Promise<"frozen" | "missing" | "corrupt"> {
  let state: Awaited<ReturnType<FreezeRegistryStore["state"]>>;
  try {
    state = await registry.state();
  } catch {
    return "corrupt";
  }
  if (state === "corrupt") return "corrupt";
  let freezes: Awaited<ReturnType<FreezeRegistryStore["listFreezes"]>>;
  try {
    freezes = await registry.listFreezes();
  } catch {
    return "corrupt";
  }
  const found = freezes.find(
    (entry) => samePath(entry.path, relPath) && entry.sha256.toLowerCase() === sha256.toLowerCase(),
  );
  return found === undefined ? "missing" : "frozen";
}
