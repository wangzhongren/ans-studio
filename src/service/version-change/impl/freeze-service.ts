// src/service/version-change/impl/freeze-service.ts
// 冻结 Service（doc-freeze/v1）：isFrozen/freeze/迁移/bootstrap（2026-11-04 C2c 契约冻结）。
//
// 依据 P1.6 §4.5/§5.2、F29/F30/F34/F35、AC-10/AC-21/AC-25/AC-27：
// · 冻结权威 = R9 `.ans/state/versions.jsonl` baseline；`doc-freezes.json` 仅派生缓存（F34）；
//   本 Service 只经注入的 `FreezeRegistryPort` 追加（唯一写入者 = 门禁引擎 C2b，PM §4.2-4）；
// · 注册表 missing ⇒ 迁移（既有版本化文档一律默认冻结，`migrated-legacy`）；corrupt ⇒ fail-closed
//   （拒绝，不自动重建/不放开覆盖）；`migrated-draft` 仅是 baseline `draft-marker` 证据标记，
//   不是 freeze reason（PM Q2）；
// · 冻结按触发源归属（F35）：customer 类 reason（vca-approved/version-upgrade-approved/
//   detail-item-applied/proposal-confirmed/intent-confirmed）带 `decidedBy:"customer"`；
//   application 类 reason（amendment-submitted/handoff-pin-bootstrap/bootstrap-vca-approved/
//   migrated-legacy）不冒充客户；
// · 解冻只能通过新版本 + VCA 或客户确认的迁移/恢复例外；本 Service 不提供解冻写路径。
// 本文件不 import 门禁引擎实现、不读盘；同步冻结快照归 C2b（F7）。

import { isDirectActionSource, isSnapshotRef } from "../../../model/trunk.ts";
import {
  DOC_FREEZE_APPLICATION_REASONS,
  DOC_FREEZE_CUSTOMER_REASONS,
  DOC_FREEZE_REASONS,
  isValidDocFreezeRecord,
  type DocFreezeLookup,
  type DocFreezeReason,
  type DocFreezeRecord,
} from "../../../model/version-change.ts";
import type {
  BootstrapFreezeInput,
  DocFreezeInput,
  DocFreezeRecordInput,
  DraftMarkerEntry,
  FreezeMigrationInput,
  FreezeMigrationReport,
  FreezeRegistryPort,
  FreezeService,
  ServiceResult,
} from "../abstract/version-change-service.ts";
import { normalizeServiceRelPath } from "./targets-items.ts";

export type FreezeFailureCode =
  | "doc-freeze-invalid"
  | "doc-freeze-registry-unavailable"
  | "doc-freeze-registry-corrupt"
  | "doc-freeze-write-failed"
  | "doc-freeze-application-id-missing";

/** 迁移写入的合成 applicationId（非空；不得冒充客户，C1 `DocFreezeRecord` 约定）。 */
export const FREEZE_MIGRATION_APPLICATION_ID = "migration";
/** 首次 handoff pin bootstrap 的合成 applicationId。 */
export const FREEZE_HANDOFF_PIN_APPLICATION_ID = "bootstrap-handoff-pin";

function fail<C extends FreezeFailureCode>(code: C, message?: string): ServiceResult<never, FreezeFailureCode> {
  return { ok: false, code, message };
}

function isCustomerReason(reason: DocFreezeReason): boolean {
  return (DOC_FREEZE_CUSTOMER_REASONS as readonly string[]).includes(reason);
}

function isKnownReason(reason: string): reason is DocFreezeReason {
  return (DOC_FREEZE_REASONS as readonly string[]).includes(reason);
}

function isValidVersion(version: number): boolean {
  return Number.isInteger(version) && version >= 1;
}

function keyOf(path: string, version: number): string {
  return `${path}#${version}`;
}

/**
 * 构造并校验一条冻结记录（F35 归属纪律）。customer 类 reason 必须带 `decisionId`；
 * `proposal-confirmed`/`intent-confirmed` 无 VCA 时合成非空 applicationId（PM §4.10-7）。
 */
export function buildDocFreezeRecord(input: DocFreezeInput): ServiceResult<DocFreezeRecordInput, FreezeFailureCode> {
  const path = normalizeServiceRelPath(input.path);
  if (path === undefined) return fail("doc-freeze-invalid", `冻结路径非法：${input.path}`);
  if (!isValidVersion(input.version)) return fail("doc-freeze-invalid", `冻结版本非法：${input.version}`);
  if (typeof input.sha256 !== "string" || input.sha256 === "") {
    return fail("doc-freeze-invalid", "冻结 sha256 不得为空");
  }
  if (!isKnownReason(input.reason)) return fail("doc-freeze-invalid", `未知冻结 reason：${String(input.reason)}`);

  const direct = input.reason === "role-direct-applied";
  if (direct && (!isDirectActionSource(input.source) || input.source.kind !== "role-direct"
    || input.source.applicationId !== input.applicationId || input.actorRoleId !== input.source.actorRoleId
    || !isSnapshotRef(input.snapshotRef) || input.decisionId !== undefined || input.decidedBy !== undefined))
    return fail("doc-freeze-invalid", "Direct freezes require the real role source and complete snapshot, without customer fields");
  if (!direct && input.source?.kind === "role-direct") return fail("doc-freeze-invalid", "Role source requires role-direct-applied reason");
  const customerReason = isCustomerReason(input.reason);
  const delegated = customerReason && input.source?.kind === "chief-delegated";
  const origin = direct ? "role-direct" : delegated ? "chief-delegated" : customerReason ? "customer" : "application";
  if (delegated && (input.decisionId !== undefined || input.decidedBy !== undefined || input.actorRoleId !== "chief"))
    return fail("doc-freeze-invalid", "Delegated freeze must retain the true chief source without customer fields");
  if (input.origin !== undefined && input.origin !== origin) {
    return fail("doc-freeze-invalid", `reason=${input.reason} 的 origin 必须为 ${origin}（F35）`);
  }
  if (customerReason && !delegated && (input.decisionId === undefined || input.decisionId.trim() === "")) {
    return fail("doc-freeze-invalid", `reason=${input.reason} 为客户确认类，必须带 decisionId`);
  }
  if (!customerReason && input.decidedBy !== undefined) {
    return fail("doc-freeze-invalid", `reason=${input.reason} 为 application 类，不得记 decidedBy:"customer"（F35）`);
  }

  let applicationId = input.applicationId?.trim() ?? "";
  if (applicationId === "") {
    if (input.reason === "proposal-confirmed" && input.decisionId !== undefined) {
      applicationId = `proposal-${input.decisionId}`;
    } else if (input.reason === "intent-confirmed" && input.decisionId !== undefined) {
      applicationId = `intent-${input.decisionId}`;
    } else {
      return fail("doc-freeze-application-id-missing", `reason=${input.reason} 的 applicationId 不得为空`);
    }
  }

  const freeze: DocFreezeRecord = {
    schema: "doc-freeze/v1",
    applicationId,
    reason: input.reason,
    origin,
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.snapshotRef !== undefined ? { snapshotRef: input.snapshotRef } : {}),
    ...(customerReason && !delegated ? { decidedBy: "customer" as const } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    frozenAt: input.at,
    ...(input.actorRoleId !== undefined ? { actorRoleId: input.actorRoleId } : {}),
  };
  if (!isValidDocFreezeRecord(freeze)) return fail("doc-freeze-invalid", "Freeze source does not satisfy the shared Model invariant");
  return { ok: true, value: { path, version: input.version, sha256: input.sha256, freeze } };
}

export interface FreezeServiceDeps {
  registry: FreezeRegistryPort;
}

export function buildFreezeService(deps: FreezeServiceDeps): FreezeService {
  const { registry } = deps;

  async function readState(): Promise<"missing" | "ready" | "corrupt"> {
    try {
      return await registry.state();
    } catch {
      return "corrupt";
    }
  }

  async function listFreezes(): Promise<DocFreezeRecordInput[] | undefined> {
    try {
      return await registry.listFreezes();
    } catch {
      return undefined;
    }
  }

  async function listMarkers(): Promise<DraftMarkerEntry[] | undefined> {
    try {
      return await registry.listDraftMarkers();
    } catch {
      return undefined;
    }
  }

  async function refreshSnapshot(): Promise<void> {
    // 刷新失败 ⇒ C2b 安装快照 unknown ⇒ 生产守卫 fail-closed；冻结记录已写入，不回滚。
    try {
      await registry.refreshSnapshot();
    } catch {
      /* 记录成功即返回；快照不可用由 C2b 判定层 fail-closed（P1 §4.5） */
    }
  }

  async function writeRecords(
    records: DocFreezeRecordInput[],
  ): Promise<ServiceResult<DocFreezeRecordInput[], FreezeFailureCode>> {
    if (records.length === 0) return { ok: true, value: [] };
    let written;
    try {
      written = await registry.appendDocFreezeRecords(records);
    } catch {
      return fail("doc-freeze-write-failed", "冻结注册表追加失败（异常）");
    }
    if (!written.ok) {
      if (written.code === "conflict") return fail("doc-freeze-write-failed", written.message);
      return fail("doc-freeze-write-failed", written.message ?? "冻结注册表追加失败");
    }
    await refreshSnapshot();
    return { ok: true, value: records };
  }

  async function freeze(input: DocFreezeInput): Promise<ServiceResult<DocFreezeRecordInput, FreezeFailureCode>> {
    const built = buildDocFreezeRecord(input);
    if (!built.ok) return built;
    const state = await readState();
    if (state === "corrupt") {
      return fail("doc-freeze-registry-corrupt", "冻结注册表损坏：fail-closed，不自动重建/不放开覆盖（AC-21）");
    }
    const written = await writeRecords([built.value]);
    if (!written.ok) return written;
    return { ok: true, value: built.value };
  }

  return {
    async state() {
      return readState();
    },

    async isFrozen(path: string, version?: number): Promise<DocFreezeLookup> {
      const rel = normalizeServiceRelPath(path);
      const state = await readState();
      if (rel === undefined) return { path, version, state: "unknown" };
      if (state !== "ready") return { path: rel, ...(version !== undefined ? { version } : {}), state: "unknown" };
      const freezes = await listFreezes();
      const markers = await listMarkers();
      if (freezes === undefined || markers === undefined) {
        return { path: rel, ...(version !== undefined ? { version } : {}), state: "unknown" };
      }
      const matching = freezes
        .filter((entry) => normalizeServiceRelPath(entry.path) === rel)
        .filter((entry) => version === undefined || entry.version === version);
      if (matching.length > 0) {
        const latest = version !== undefined ? matching[0] : matching.reduce((a, b) => (b.version >= a.version ? b : a));
        return { path: rel, ...(version !== undefined ? { version } : {}), state: "frozen", record: latest.freeze };
      }
      const marker = markers.find(
        (entry) => normalizeServiceRelPath(entry.path) === rel && (version === undefined || entry.version === version),
      );
      if (marker !== undefined) {
        return {
          path: rel,
          ...(version !== undefined ? { version } : {}),
          state: "draft",
          migrationMark: "migrated-draft",
        };
      }
      return { path: rel, ...(version !== undefined ? { version } : {}), state: "draft" };
    },

    async entryOf(path: string, version?: number): Promise<DocFreezeRecordInput | undefined> {
      const rel = normalizeServiceRelPath(path);
      if (rel === undefined) return undefined;
      const state = await readState();
      if (state !== "ready") return undefined;
      const freezes = await listFreezes();
      if (freezes === undefined) return undefined;
      const matching = freezes
        .filter((entry) => normalizeServiceRelPath(entry.path) === rel)
        .filter((entry) => version === undefined || entry.version === version);
      if (matching.length === 0) return undefined;
      return version !== undefined ? matching[0] : matching.reduce((a, b) => (b.version >= a.version ? b : a));
    },

    freeze,

    async freezeMany(inputs: DocFreezeInput[]) {
      if (inputs.length === 0) return { ok: true, value: [] };
      const built: DocFreezeRecordInput[] = [];
      for (const input of inputs) {
        const one = buildDocFreezeRecord(input);
        if (!one.ok) return one;
        built.push(one.value);
      }
      const state = await readState();
      if (state === "corrupt") {
        return fail("doc-freeze-registry-corrupt", "冻结注册表损坏：fail-closed，不自动重建/不放开覆盖（AC-21）");
      }
      return writeRecords(built);
    },

    async recordDraftMarker(input) {
      const rel = normalizeServiceRelPath(input.path);
      if (rel === undefined || !isValidVersion(input.version)) {
        return fail("doc-freeze-invalid", "draft-marker 路径/版本非法");
      }
      if (typeof input.evidence !== "string" || input.evidence.trim() === "") {
        return fail("doc-freeze-invalid", "migrated-draft 标记必须有证据（无证据默认冻结）");
      }
      const state = await readState();
      if (state === "corrupt") return fail("doc-freeze-registry-corrupt", "冻结注册表损坏：fail-closed");
      const marker: DraftMarkerEntry = {
        path: rel,
        version: input.version,
        ...(input.sha256 !== undefined ? { sha256: input.sha256 } : {}),
        evidence: input.evidence,
        markedAt: input.at,
      };
      let written;
      try {
        written = await registry.appendDraftMarkers([marker]);
      } catch {
        return fail("doc-freeze-write-failed", "draft-marker 追加失败（异常）");
      }
      if (!written.ok) return fail("doc-freeze-write-failed", written.message ?? "draft-marker 追加失败");
      await refreshSnapshot();
      return { ok: true, value: marker };
    },

    async migrate(input: FreezeMigrationInput) {
      const state = await readState();
      if (state === "corrupt") {
        return fail("doc-freeze-registry-corrupt", "冻结注册表损坏：不迁移、不重建、fail-closed（F29/AC-21）");
      }
      const existingFreezes = await listFreezes();
      if (existingFreezes === undefined) return fail("doc-freeze-registry-unavailable", "冻结注册表不可读");
      const frozenKeys = new Set(
        existingFreezes
          .map((entry) => {
            const rel = normalizeServiceRelPath(entry.path);
            return rel === undefined ? undefined : keyOf(rel, entry.version);
          })
          .filter((key): key is string => key !== undefined),
      );

      const draftMarkers: DraftMarkerEntry[] = [];
      let skippedDraftWithoutEvidence = 0;
      const draftKeys = new Set<string>();
      for (const candidate of input.draftCandidates ?? []) {
        const rel = normalizeServiceRelPath(candidate.path);
        if (rel === undefined || !isValidVersion(candidate.version)) {
          skippedDraftWithoutEvidence += 1;
          continue;
        }
        if (frozenKeys.has(keyOf(rel, candidate.version))) continue; // 冻结不可逆；不降级为草稿
        if (typeof candidate.evidence !== "string" || candidate.evidence.trim() === "") {
          skippedDraftWithoutEvidence += 1;
          continue;
        }
        draftMarkers.push({
          path: rel,
          version: candidate.version,
          ...(candidate.sha256 !== "" ? { sha256: candidate.sha256 } : {}),
          evidence: candidate.evidence,
          markedAt: input.at,
        });
        draftKeys.add(keyOf(rel, candidate.version));
      }

      const applicationId = input.applicationId?.trim() || FREEZE_MIGRATION_APPLICATION_ID;
      const migrated: DocFreezeRecordInput[] = [];
      let skippedExisting = 0;
      const seen = new Set<string>();
      for (const doc of input.existingDocs) {
        const rel = normalizeServiceRelPath(doc.path);
        if (rel === undefined || !isValidVersion(doc.version)) {
          skippedExisting += 1;
          continue;
        }
        const key = keyOf(rel, doc.version);
        if (frozenKeys.has(key) || draftKeys.has(key) || seen.has(key)) {
          skippedExisting += 1;
          continue;
        }
        seen.add(key);
        const built = buildDocFreezeRecord({
          path: rel,
          version: doc.version,
          sha256: doc.sha256,
          applicationId,
          reason: "migrated-legacy",
          at: input.at,
        });
        if (!built.ok) return built;
        migrated.push(built.value);
      }

      if (draftMarkers.length > 0) {
        let markersWritten;
        try {
          markersWritten = await registry.appendDraftMarkers(draftMarkers);
        } catch {
          return fail("doc-freeze-write-failed", "draft-marker 追加失败（异常）");
        }
        if (!markersWritten.ok) return fail("doc-freeze-write-failed", markersWritten.message ?? "draft-marker 追加失败");
      }
      const written = await writeRecords(migrated);
      if (!written.ok) return written;

      const report: FreezeMigrationReport = {
        registry: state,
        migrated,
        draftMarkers,
        skippedExisting,
        skippedDraftWithoutEvidence,
      };
      return { ok: true, value: report };
    },

    async bootstrap(input: BootstrapFreezeInput) {
      if (input.reason !== "handoff-pin-bootstrap" && input.reason !== "bootstrap-vca-approved") {
        return fail("doc-freeze-invalid", `bootstrap reason 非法：${String(input.reason)}`);
      }
      let applicationId = input.applicationId?.trim() ?? "";
      if (applicationId === "") {
        if (input.reason === "handoff-pin-bootstrap") applicationId = FREEZE_HANDOFF_PIN_APPLICATION_ID;
        else return fail("doc-freeze-application-id-missing", "bootstrap-vca-approved 必须带 VCA applicationId");
      }
      const state = await readState();
      if (state === "corrupt") return fail("doc-freeze-registry-corrupt", "冻结注册表损坏：fail-closed");
      const existingFreezes = await listFreezes();
      if (existingFreezes === undefined) return fail("doc-freeze-registry-unavailable", "冻结注册表不可读");
      const frozenKeys = new Set(
        existingFreezes.map((entry) => keyOf(normalizeServiceRelPath(entry.path) ?? entry.path, entry.version)),
      );
      const records = input.docs
        .filter((doc) => !frozenKeys.has(keyOf(normalizeServiceRelPath(doc.path) ?? doc.path, doc.version)))
        .map((doc) =>
          buildDocFreezeRecord({
            path: doc.path,
            version: doc.version,
            sha256: doc.sha256,
            applicationId,
            reason: input.reason,
            ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
            at: input.at,
          }),
        );
      const failed = records.find((record) => !record.ok);
      if (failed !== undefined && !failed.ok) return failed;
      const built = records.flatMap((record) => (record.ok ? [record.value] : []));
      const written = await writeRecords(built);
      if (!written.ok) return written;
      return { ok: true, value: built };
    },

    async ensureReady() {
      let state: "missing" | "ready" | "corrupt";
      try {
        state = await registry.state();
      } catch {
        return { ok: false, code: "doc-freeze-registry-unavailable" };
      }
      if (state === "corrupt") return { ok: false, code: "doc-freeze-registry-corrupt" };
      if (state === "ready") await refreshSnapshot();
      return { ok: true, state };
    },

    async migrationMarkOf(path: string, version: number) {
      const rel = normalizeServiceRelPath(path);
      if (rel === undefined) return undefined;
      const freezes = await listFreezes();
      const markers = await listMarkers();
      if (freezes !== undefined) {
        const frozen = freezes.find(
          (entry) => normalizeServiceRelPath(entry.path) === rel && entry.version === version,
        );
        if (frozen?.freeze.reason === "migrated-legacy") return "migrated-legacy";
        if (frozen !== undefined) return undefined;
      }
      if (markers?.some((entry) => normalizeServiceRelPath(entry.path) === rel && entry.version === version)) {
        return "migrated-draft";
      }
      return undefined;
    },
  };
}
