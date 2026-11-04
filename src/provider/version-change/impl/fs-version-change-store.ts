// src/provider/version-change/impl/fs-version-change-store.ts
// VCA / 重构申请 / stable-write 记录与一次性许可的文件系统存储实现（2026-11-04 B-6 / S1）。
//
// 纪律（P1 §2.2/§3.2；F13）：
// · JSON 文件 = 记录数组（P1 §3.2 冻结布局）；原子写（同目录临时文件 + fsync + rename，
//   复用 `src/common/shared/atomic-write.ts` 的 Windows EPERM 有界重试）+ 每文件进程内串行链；
// · 结构校验失败：写返回 `{ok:false, code:"io", message:"invalid-record"}`（不落盘）；
//   读返回 `corrupt`（`list()` 抛错，不静默清空）；未知字段保留；
// · `stable-writes.json`（record）与 `stable-write-permits.json`（permit）**分表**（F13）：
//   record 只以 `permitId` 关联；permit 形状 = C1 `StableWritePermit`（唯一，无第三形状）；
// · `installSnapshot` 只调用 C2b `installStableWritePermitSnapshot`（同步许可快照单一实现）。
//
// 本文件不做状态机/业务校验（C2c Service 职责），不发事件，不写项目文档。

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { installStableWritePermitSnapshot } from "../../../common/门禁引擎/versioned-doc-guard.ts";
import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { TRUNK_STABLE_FILE_KINDS } from "../../../model/trunk.ts";
import {
  REFACTOR_MANAGED_BY,
  REFACTOR_REQUEST_SCHEMA,
  REFACTOR_REQUEST_STATUSES,
  STABLE_WRITE_PERMIT_STATUSES,
  STABLE_WRITE_REQUEST_ID_PATTERN,
  STABLE_WRITE_SCHEMA,
  STABLE_WRITE_STATUSES,
  VERSION_CHANGE_KINDS,
  VERSION_CHANGE_SCHEMA,
  VERSION_CHANGE_STATUSES,
} from "../../../model/version-change.ts";
import type {
  RefactorRequestRecord,
  RefactorRequestStatus,
  StableWritePermit,
  StableWriteRecord,
  StableWriteStatus,
  VersionChangeRecord,
  VersionChangeStatus,
} from "../../../model/version-change.ts";
import {
  REFACTOR_REQUESTS_REL,
  STABLE_WRITE_PERMITS_REL,
  STABLE_WRITES_REL,
  VERSION_CHANGES_REL,
} from "../abstract/version-change-store.ts";
import type {
  JsonRecordRead,
  RefactorRequestStore,
  RepositoryWriteResult,
  StableWritePermitStore,
  StableWriteStore,
  VersionChangeStore,
} from "../abstract/version-change-store.ts";

// —————————————— 结构校验（只判必需字段/枚举；未知字段放行） ——————————————

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function includesString(list: readonly string[], value: unknown): value is string {
  return typeof value === "string" && list.includes(value);
}

function isVersionChangeRecord(value: unknown): value is VersionChangeRecord {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== VERSION_CHANGE_SCHEMA) return false;
  if (!isNonEmptyString(value.applicationId) || !isNonEmptyString(value.flowId)) return false;
  if (!includesString(VERSION_CHANGE_KINDS, value.kind)) return false;
  if (value.initiatorRoleId !== "rapporteur" && value.initiatorRoleId !== "product") return false;
  if (!(value.baseTrunk === null || isObject(value.baseTrunk))) return false;
  if (typeof value.bootstrap !== "boolean") return false;
  if (!Array.isArray(value.targets)) return false;
  for (const target of value.targets) {
    if (!isObject(target)) return false;
    if (!isNonEmptyString(target.kind) || !isNonEmptyString(target.path)) return false;
    if (target.action !== "add" && target.action !== "modify") return false;
    if (!isSha256Hex(target.toSha256)) return false;
  }
  if (typeof value.summary !== "string") return false;
  if (!includesString(VERSION_CHANGE_STATUSES, value.status)) return false;
  if (!isNonEmptyString(value.at)) return false;
  return true;
}

function isRefactorRequestRecord(value: unknown): value is RefactorRequestRecord {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== REFACTOR_REQUEST_SCHEMA) return false;
  if (!isNonEmptyString(value.requestId) || !isNonEmptyString(value.flowId)) return false;
  if (value.initiatedBy !== "convener" || value.managedBy !== REFACTOR_MANAGED_BY) return false;
  if (typeof value.title !== "string" || typeof value.reason !== "string") return false;
  if (!isObject(value.scope)) return false;
  if (!isStringArray(value.scope.modules) || !isStringArray(value.scope.paths) || !isStringArray(value.scope.roles)) {
    return false;
  }
  if (!includesString(REFACTOR_REQUEST_STATUSES, value.status)) return false;
  if (!isObject(value.enforcement)) return false;
  if (!isStringArray(value.enforcement.writeSet) || !isStringArray(value.enforcement.forbiddenKinds)) return false;
  if (!isNonEmptyString(value.at)) return false;
  return true;
}

function isStableWriteRecord(value: unknown): value is StableWriteRecord {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== STABLE_WRITE_SCHEMA) return false;
  if (!isNonEmptyString(value.requestId) || !isNonEmptyString(value.roleId)) return false;
  if (!isNonEmptyString(value.path)) return false;
  if (!includesString(TRUNK_STABLE_FILE_KINDS, value.kind)) return false;
  if (typeof value.baseSha256 !== "string" || (value.baseSha256 !== "" && !isSha256Hex(value.baseSha256))) return false;
  if (!isSha256Hex(value.targetSha256)) return false;
  if (typeof value.diffPreview !== "string") return false;
  if (!includesString(STABLE_WRITE_STATUSES, value.status)) return false;
  if (!isNonEmptyString(value.at)) return false;
  return true;
}

function isStableWritePermit(value: unknown): value is StableWritePermit {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== STABLE_WRITE_SCHEMA) return false;
  for (const field of ["permitId", "requestId", "roleId", "path", "approvedAt", "expiresAt", "issuedAt"] as const) {
    const fieldValue = value[field];
    if (!isNonEmptyString(fieldValue)) return false;
    if (field === "requestId" && !new RegExp(STABLE_WRITE_REQUEST_ID_PATTERN).test(fieldValue)) return false;
  }
  if (!includesString(TRUNK_STABLE_FILE_KINDS, value.kind)) return false;
  if (!isObject(value.authority)) return false;
  const decisionId = value.authority.decisionId;
  const confirmationId = value.authority.confirmationId;
  if (!isNonEmptyString(decisionId) && !isNonEmptyString(confirmationId)) return false;
  if (decisionId !== undefined && !isNonEmptyString(decisionId)) return false;
  if (confirmationId !== undefined && !isNonEmptyString(confirmationId)) return false;
  if (typeof value.baseSha256 !== "string" || (value.baseSha256 !== "" && !isSha256Hex(value.baseSha256))) return false;
  if (!isSha256Hex(value.targetSha256)) return false;
  if (!includesString(STABLE_WRITE_PERMIT_STATUSES, value.status)) return false;
  return true;
}

// —————————————— 串行链 + 原子 JSON 数组文件 ——————————————

const chains = new Map<string, Promise<unknown>>();

function chainKey(abs: string): string {
  const resolved = path.resolve(abs);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function serialize<T>(abs: string, op: () => Promise<T>): Promise<T> {
  const key = chainKey(abs);
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(op, op);
  chains.set(key, run.catch(() => undefined));
  return run;
}

async function readArrayFile<T>(
  abs: string,
  validate: (value: unknown) => value is T,
): Promise<JsonRecordRead<T[]>> {
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
  if (!Array.isArray(parsed)) return { ok: false, reason: "corrupt", message: "invalid-shape" };
  for (const item of parsed) {
    if (!validate(item)) return { ok: false, reason: "corrupt", message: "invalid-record" };
  }
  return { ok: true, value: parsed as T[] };
}

async function writeArrayFile(abs: string, records: unknown[]): Promise<RepositoryWriteResult> {
  try {
    await mkdir(path.dirname(abs), { recursive: true });
    await atomicWrite(abs, `${JSON.stringify(records, null, 2)}\n`);
    return { ok: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    return { ok: false, code: "io", message: code ?? String(err) };
  }
}

function corruptError(relPath: string, detail: string): Error {
  return new Error(`json-record-store-corrupt:${relPath}:${detail}`);
}

interface ArrayStoreSpec<T> {
  abs: string;
  relPath: string;
  validate: (value: unknown) => value is T;
  idOf: (record: T) => string;
  statusOf: (record: T) => string;
}

interface ArrayStore<T> {
  readRaw(): Promise<JsonRecordRead<T[]>>;
  list(): Promise<T[]>;
  findById(id: string): Promise<T | undefined>;
  findByFlow(flowId: string): Promise<T[]>;
  insert(record: T): Promise<RepositoryWriteResult>;
  updateWithExpectedStatus(record: T, expected: string): Promise<RepositoryWriteResult>;
}

function createArrayStore<T extends object>(spec: ArrayStoreSpec<T>): ArrayStore<T> {
  const { abs, relPath, validate, idOf, statusOf } = spec;

  function readRaw(): Promise<JsonRecordRead<T[]>> {
    return serialize(abs, () => readArrayFile(abs, validate));
  }

  async function list(): Promise<T[]> {
    const read = await readRaw();
    if (read.ok) return read.value;
    if (read.reason === "missing") return [];
    throw corruptError(relPath, read.message ?? read.reason);
  }

  async function loadForWrite(): Promise<{ ok: true; records: T[] } | { ok: false; message: string }> {
    const read = await readArrayFile(abs, validate);
    if (read.ok) return { ok: true, records: read.value };
    if (read.reason === "missing") return { ok: true, records: [] };
    return { ok: false, message: `${read.reason}:${read.message ?? ""}` };
  }

  function findById(id: string): Promise<T | undefined> {
    return list().then((records) => records.find((record) => idOf(record) === id));
  }

  function findByFlow(flowId: string): Promise<T[]> {
    return list().then((records) =>
      records.filter((record) => (record as { flowId?: unknown }).flowId === flowId),
    );
  }

  function insert(record: T): Promise<RepositoryWriteResult> {
    return serialize(abs, async (): Promise<RepositoryWriteResult> => {
      if (!validate(record) || idOf(record).trim() === "") {
        return { ok: false, code: "io", message: "invalid-record" };
      }
      const loaded = await loadForWrite();
      if (!loaded.ok) return { ok: false, code: "io", message: loaded.message };
      const id = idOf(record);
      if (loaded.records.some((entry) => idOf(entry) === id)) {
        return { ok: false, code: "conflict", message: `duplicate-id:${id}` };
      }
      return writeArrayFile(abs, [...loaded.records, record]);
    });
  }

  function updateWithExpectedStatus(record: T, expected: string): Promise<RepositoryWriteResult> {
    return serialize(abs, async (): Promise<RepositoryWriteResult> => {
      const id = idOf(record);
      if (id.trim() === "") return { ok: false, code: "io", message: "invalid-record" };
      const loaded = await loadForWrite();
      if (!loaded.ok) return { ok: false, code: "io", message: loaded.message };
      const index = loaded.records.findIndex((entry) => idOf(entry) === id);
      if (index < 0) return { ok: false, code: "conflict", message: `not-found:${id}` };
      const existing = loaded.records[index]!;
      if (statusOf(existing) !== expected) {
        return { ok: false, code: "conflict", message: `status-mismatch:${id}` };
      }
      // 未知字段保留：以现有记录为基底合并（新记录覆盖同名已知字段）。
      const merged = { ...existing, ...record };
      if (!validate(merged)) return { ok: false, code: "io", message: "invalid-record" };
      const records = [...loaded.records];
      records[index] = merged;
      return writeArrayFile(abs, records);
    });
  }

  return { readRaw, list, findById, findByFlow, insert, updateWithExpectedStatus };
}

// —————————————— 工厂 ——————————————

/** VCA 记录存储（`version-changes.json`）。 */
export function createVersionChangeStore(projectRoot: string): VersionChangeStore {
  const abs = path.join(path.resolve(projectRoot), VERSION_CHANGES_REL);
  const store = createArrayStore<VersionChangeRecord>({
    abs,
    relPath: VERSION_CHANGES_REL,
    validate: isVersionChangeRecord,
    idOf: (record) => record.applicationId,
    statusOf: (record) => record.status,
  });
  return {
    readRaw: store.readRaw,
    list: store.list,
    findById: store.findById,
    findByFlow: store.findByFlow,
    insert: store.insert,
    updateWithExpectedStatus: (record: VersionChangeRecord, expected: VersionChangeStatus) =>
      store.updateWithExpectedStatus(record, expected),
  };
}

/** 重构申请记录存储（`refactor-requests.json`）。 */
export function createRefactorRequestStore(projectRoot: string): RefactorRequestStore {
  const abs = path.join(path.resolve(projectRoot), REFACTOR_REQUESTS_REL);
  const store = createArrayStore<RefactorRequestRecord>({
    abs,
    relPath: REFACTOR_REQUESTS_REL,
    validate: isRefactorRequestRecord,
    idOf: (record) => record.requestId,
    statusOf: (record) => record.status,
  });
  return {
    readRaw: store.readRaw,
    list: store.list,
    findById: store.findById,
    findByFlow: store.findByFlow,
    insert: store.insert,
    updateWithExpectedStatus: (record: RefactorRequestRecord, expected: RefactorRequestStatus) =>
      store.updateWithExpectedStatus(record, expected),
  };
}

/** stable-write 记录存储（`stable-writes.json`；不含 permit）。 */
export function createStableWriteStore(projectRoot: string): StableWriteStore {
  const abs = path.join(path.resolve(projectRoot), STABLE_WRITES_REL);
  const store = createArrayStore<StableWriteRecord>({
    abs,
    relPath: STABLE_WRITES_REL,
    validate: isStableWriteRecord,
    idOf: (record) => record.requestId,
    statusOf: (record) => record.status,
  });
  return {
    readRaw: store.readRaw,
    list: store.list,
    findById: store.findById,
    insert: store.insert,
    updateWithExpectedStatus: (record: StableWriteRecord, expected: StableWriteStatus) =>
      store.updateWithExpectedStatus(record, expected),
  };
}

export interface StableWritePermitStoreOptions {
  /** 测试/替身注入；缺省调用 C2b `installStableWritePermitSnapshot`（唯一同步快照实现）。 */
  installSnapshot?: (permits: readonly StableWritePermit[]) => void | Promise<void>;
}

/** 一次性许可存储（`stable-write-permits.json`；F13 与 record 分表）。 */
export function createStableWritePermitStore(
  projectRoot: string,
  options: StableWritePermitStoreOptions = {},
): StableWritePermitStore {
  const root = path.resolve(projectRoot);
  const abs = path.join(root, STABLE_WRITE_PERMITS_REL);
  const installSnapshot = options.installSnapshot ?? ((permits: readonly StableWritePermit[]) => {
    installStableWritePermitSnapshot(root, permits);
  });

  async function listPermits(): Promise<StableWritePermit[]> {
    const read = await serialize(abs, () => readArrayFile(abs, isStableWritePermit));
    if (read.ok) return read.value;
    if (read.reason === "missing") return [];
    throw corruptError(STABLE_WRITE_PERMITS_REL, read.message ?? read.reason);
  }

  return {
    list: listPermits,

    upsert(permit: StableWritePermit) {
      return serialize(abs, async (): Promise<RepositoryWriteResult> => {
        if (!isStableWritePermit(permit)) return { ok: false, code: "io", message: "invalid-permit" };
        const read = await readArrayFile(abs, isStableWritePermit);
        let permits: StableWritePermit[];
        if (read.ok) permits = read.value;
        else if (read.reason === "missing") permits = [];
        else return { ok: false, code: "io", message: `${read.reason}:${read.message ?? ""}` };
        const index = permits.findIndex((entry) => entry.permitId === permit.permitId);
        if (index >= 0) permits[index] = permit;
        else permits.push(permit);
        return writeArrayFile(abs, permits);
      });
    },

    async installSnapshot(permits: readonly StableWritePermit[]) {
      await installSnapshot(permits);
    },

    readRaw() {
      return serialize(abs, () => readArrayFile(abs, isStableWritePermit));
    },
  };
}
