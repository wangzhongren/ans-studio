// test/编排/fixtures/version-change-service-fixture.ts
// C2c Service 契约测试的纯内存 Port 夹具（无文件系统、无账本、无门禁引擎依赖）。
// 只供 `test/编排/*.test.ts` 使用；不模拟 S1 持久化细节（原子写/坏件容错归 S1 测试）。

import { createHash } from "node:crypto";

import {
  createVersionChangeService,
  type DocFreezeRecordInput,
  type DraftMarkerEntry,
  type FreezeRegistryPort,
  type FreezeRegistryState,
  type ProjectHashPort,
  type StablePermitPort,
  type StableRepinOutcome,
  type StableWriteRepositoryPort,
  type TrunkBaselinePort,
  type TrunkStableSnapshotPort,
  type VersionChangeRepositoryPort,
  type VersionChangeCreateInput,
  type VersionChangeServiceDeps,
  type VersionChangeServices,
  type VersionChangeStatus,
} from "../../../src/service/version-change/public/version-change-service.ts";
import type {
  StableWritePermit,
  StableWriteRecord,
  VersionChangeRecord,
} from "../../../src/model/version-change.ts";
import type { TrunkVersionRef } from "../../../src/model/trunk.ts";

export interface MemoryVersionChanges extends VersionChangeRepositoryPort {
  records: VersionChangeRecord[];
}

export function createMemoryVersionChanges(initial: VersionChangeRecord[] = []): MemoryVersionChanges {
  const records: VersionChangeRecord[] = [...initial];
  return {
    records,
    async list() {
      return records.map((record) => ({ ...record }));
    },
    async findById(applicationId) {
      const found = records.find((record) => record.applicationId === applicationId);
      return found === undefined ? undefined : { ...found };
    },
    async findByFlow(flowId) {
      return records.filter((record) => record.flowId === flowId).map((record) => ({ ...record }));
    },
    async insert(record) {
      if (records.some((entry) => entry.applicationId === record.applicationId)) {
        return { ok: false, code: "conflict" as const };
      }
      records.push({ ...record });
      return { ok: true as const };
    },
    async updateWithExpectedStatus(record, expected: VersionChangeStatus) {
      const index = records.findIndex((entry) => entry.applicationId === record.applicationId);
      if (index < 0) return { ok: false, code: "conflict" as const };
      if (records[index].status !== expected) return { ok: false, code: "conflict" as const };
      records[index] = { ...record };
      return { ok: true as const };
    },
  };
}

export interface MemoryFreezeRegistry extends FreezeRegistryPort {
  freezes: DocFreezeRecordInput[];
  markers: DraftMarkerEntry[];
  refreshes: number;
  setState(state: FreezeRegistryState): void;
}

export function createMemoryFreezeRegistry(initial: FreezeRegistryState = "ready"): MemoryFreezeRegistry {
  let state: FreezeRegistryState = initial;
  const freezes: DocFreezeRecordInput[] = [];
  const markers: DraftMarkerEntry[] = [];
  const registry: MemoryFreezeRegistry = {
    freezes,
    markers,
    refreshes: 0,
    setState(next) {
      state = next;
    },
    async state() {
      return state;
    },
    async listFreezes() {
      if (state === "corrupt") throw new Error("baseline-corrupt");
      return freezes.map((entry) => ({ ...entry, freeze: { ...entry.freeze } }));
    },
    async listDraftMarkers() {
      if (state === "corrupt") throw new Error("baseline-corrupt");
      return markers.map((entry) => ({ ...entry }));
    },
    async appendDocFreezeRecords(records) {
      if (state === "corrupt") return { ok: false, code: "io" as const, message: "baseline-corrupt" };
      for (const record of records) {
        const index = freezes.findIndex(
          (entry) => entry.path === record.path && entry.version === record.version,
        );
        if (index >= 0) freezes[index] = { ...record, freeze: { ...record.freeze } };
        else freezes.push({ ...record, freeze: { ...record.freeze } });
      }
      state = "ready";
      return { ok: true as const };
    },
    async appendDraftMarkers(entries) {
      if (state === "corrupt") return { ok: false, code: "io" as const, message: "baseline-corrupt" };
      markers.push(...entries.map((entry) => ({ ...entry })));
      state = "ready";
      return { ok: true as const };
    },
    async refreshSnapshot() {
      registry.refreshes += 1;
    },
  };
  return registry;
}

export interface MemoryStableWrites extends StableWriteRepositoryPort {
  records: StableWriteRecord[];
}

export function createMemoryStableWrites(initial: StableWriteRecord[] = []): MemoryStableWrites {
  const records: StableWriteRecord[] = [...initial];
  return {
    records,
    async list() {
      return records.map((record) => ({ ...record }));
    },
    async findById(requestId) {
      const found = records.find((record) => record.requestId === requestId);
      return found === undefined ? undefined : { ...found };
    },
    async insert(record) {
      if (records.some((entry) => entry.requestId === record.requestId)) {
        return { ok: false, code: "conflict" as const };
      }
      records.push({ ...record });
      return { ok: true as const };
    },
    async updateWithExpectedStatus(record, expected) {
      const index = records.findIndex((entry) => entry.requestId === record.requestId);
      if (index < 0) return { ok: false, code: "conflict" as const };
      if (records[index].status !== expected) return { ok: false, code: "conflict" as const };
      records[index] = { ...record };
      return { ok: true as const };
    },
  };
}

export interface MemoryPermits extends StablePermitPort {
  permits: StableWritePermit[];
  snapshots: StableWritePermit[][];
}

export function createMemoryPermits(initial: StableWritePermit[] = []): MemoryPermits {
  const permits: StableWritePermit[] = [...initial];
  const snapshots: StableWritePermit[][] = [];
  const port: MemoryPermits = {
    permits,
    snapshots,
    async list() {
      return permits.map((permit) => ({ ...permit }));
    },
    async upsert(permit) {
      const index = permits.findIndex((entry) => entry.permitId === permit.permitId);
      if (index >= 0) permits[index] = { ...permit };
      else permits.push({ ...permit });
      return { ok: true as const };
    },
    async installSnapshot(entries) {
      snapshots.push(entries.map((permit) => ({ ...permit })));
    },
  };
  return port;
}

export interface FakeHashes extends ProjectHashPort {
  files: Map<string, string>;
  setFile(path: string, sha256: string | undefined): void;
}

export function createFakeHashes(initial: Record<string, string> = {}): FakeHashes {
  const files = new Map<string, string>(Object.entries(initial));
  const hashes: FakeHashes = {
    files,
    setFile(path, sha256) {
      if (sha256 === undefined) files.delete(path);
      else files.set(path, sha256);
    },
    async sha256File(relPath) {
      return files.get(relPath);
    },
    sha256Content(content) {
      return createHash("sha256")
        .update(typeof content === "string" ? content : Buffer.from(content))
        .digest("hex");
    },
    sha256Record(record) {
      const canonical = JSON.stringify({ ...record, applicationSha256: undefined });
      return createHash("sha256").update(canonical).digest("hex");
    },
  };
  return hashes;
}

export interface FakeTrunk extends TrunkBaselinePort, TrunkStableSnapshotPort {
  currentRef: TrunkVersionRef | null;
  frozenVersions: Map<string, number>;
  manifestPresent: boolean;
  trunkVersion: number;
  snapshots: Array<Parameters<TrunkStableSnapshotPort["applyStableSnapshot"]>[0]>;
}

export function createFakeTrunk(options?: {
  current?: TrunkVersionRef | null;
  manifestPresent?: boolean;
  trunkVersion?: number;
}): FakeTrunk {
  const trunk: FakeTrunk = {
    currentRef: options?.current ?? null,
    frozenVersions: new Map<string, number>(),
    manifestPresent: options?.manifestPresent ?? true,
    trunkVersion: options?.trunkVersion ?? 1,
    snapshots: [],
    async current() {
      return trunk.currentRef;
    },
    async latestFrozenVersion(path) {
      return trunk.frozenVersions.get(path);
    },
    async applyStableSnapshot(input): Promise<StableRepinOutcome> {
      trunk.snapshots.push(input);
      if (!trunk.manifestPresent) return { applied: false, pendingReattach: true };
      return {
        applied: true,
        audit: {
          op: "stable-repinned",
          trunkVersion: trunk.trunkVersion,
          kind: input.kind,
          roleId: input.roleId,
          path: input.path,
          oldSha: input.oldSha,
          newSha: input.newSha,
          ...(input.confirmationId !== undefined ? { confirmationId: input.confirmationId } : {}),
          ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
          origin: "customer",
          decidedBy: "customer",
          at: input.at,
        },
      };
    },
  };
  return trunk;
}

export interface TestRig {
  services: VersionChangeServices;
  deps: VersionChangeServiceDeps;
  versionChanges: MemoryVersionChanges;
  freezeRegistry: MemoryFreezeRegistry;
  stableWrites: MemoryStableWrites;
  permits: MemoryPermits;
  hashes: FakeHashes;
  trunk: FakeTrunk;
}

export function createTestRig(options?: {
  versionChanges?: VersionChangeRecord[];
  stableWrites?: StableWriteRecord[];
  freezeState?: FreezeRegistryState;
  hashes?: Record<string, string>;
  currentTrunk?: TrunkVersionRef | null;
  manifestPresent?: boolean;
  trunkVersion?: number;
  now?: () => Date;
}): TestRig {
  const versionChanges = createMemoryVersionChanges(options?.versionChanges ?? []);
  const freezeRegistry = createMemoryFreezeRegistry(options?.freezeState ?? "ready");
  const stableWrites = createMemoryStableWrites(options?.stableWrites ?? []);
  const permits = createMemoryPermits();
  const hashes = createFakeHashes(options?.hashes ?? {});
  const trunk = createFakeTrunk({
    current: options?.currentTrunk ?? null,
    manifestPresent: options?.manifestPresent,
    trunkVersion: options?.trunkVersion,
  });
  const deps: VersionChangeServiceDeps = {
    versionChanges,
    freezeRegistry,
    stableWrites,
    permits,
    hashes,
    trunk,
    now: options?.now ?? (() => new Date("2026-11-04T10:00:00.000Z")),
  };
  return {
    services: createVersionChangeService(deps),
    deps,
    versionChanges,
    freezeRegistry,
    stableWrites,
    permits,
    hashes,
    trunk,
  };
}

export const H1 = "a".repeat(64);
export const H2 = "b".repeat(64);
export const H3 = "c".repeat(64);

export const CONTRACT_PATH = "docs/proposals/demo-proposal-v2.md";
export const ROSTER_PATH = "docs/proposals/demo-roster-v2.md";
export const EXECUTION_PATH = "docs/scheduling/demo-team-v1.md";
export const AMENDMENT_PATH = "docs/proposals/demo-amendment-v1.md";

export const TRUNK_V1: TrunkVersionRef = {
  trunkVersion: 1,
  runId: "run-demo",
  digest: "digest-v1",
};

export interface CreateInputOverrides {
  kind?: "detail-amendment" | "version-upgrade";
  initiatorRoleId?: string;
  flowId?: string;
  baseTrunk?: TrunkVersionRef | null;
  bootstrap?: boolean;
  targets?: Array<{ kind: string; path: string; action: "add" | "modify"; from?: string; roleId?: string }>;
  amendmentId?: string;
  amendmentDocPath?: string;
  amendmentItems?: Array<{
    itemId: string;
    kind: "contract" | "roster" | "execution" | "workflow" | "boundary";
    change: "add" | "modify" | "none";
    to: string;
    roleId?: string;
    toSha256?: string;
  }>;
  summary?: string;
  at?: string;
  applicationId?: string;
}

/** 一个通过校验的 version-upgrade 创建输入（测试可覆写字段）。 */
export function upgradeCreateInput(overrides: CreateInputOverrides = {}): VersionChangeCreateInput {
  return {
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "demo",
    baseTrunk: TRUNK_V1,
    bootstrap: false,
    targets: [{ kind: "contract", path: CONTRACT_PATH, action: "modify" }],
    summary: "产品版本升级：proposal v2",
    at: "2026-11-04T10:00:00.000Z",
    ...overrides,
  };
}

/** 一个通过校验的 detail-amendment 创建输入（测试可覆写字段）。 */
export function detailCreateInput(overrides: CreateInputOverrides = {}): VersionChangeCreateInput {
  return {
    kind: "detail-amendment",
    initiatorRoleId: "rapporteur",
    flowId: "demo",
    baseTrunk: TRUNK_V1,
    bootstrap: false,
    targets: [{ kind: "contract", path: CONTRACT_PATH, action: "modify" }],
    amendmentId: "am-1",
    amendmentDocPath: AMENDMENT_PATH,
    amendmentItems: [
      {
        itemId: "item-1",
        kind: "contract",
        change: "modify",
        to: CONTRACT_PATH,
      },
    ],
    summary: "策划修正案：细节补充",
    at: "2026-11-04T10:00:00.000Z",
    ...overrides,
  };
}

export function fileMapForVca(): Record<string, string> {
  return {
    [CONTRACT_PATH]: H1,
    [ROSTER_PATH]: H2,
    [EXECUTION_PATH]: H3,
    [AMENDMENT_PATH]: H2,
  };
}
