/**
 * 版本变更（VCA）/冻结/stable 续接/重构审计的**纯视图逻辑**（U1，2026-11-04 trunk-amendment-model）。
 *
 * 纪律（P1.6 §4.10；PM 复审 F10/F15/F17；D1 冻结 IPC）：
 * · 只把 D1 冻结载荷（`version-change:list`、`stable-write:list`、`refactor:list`、
 *   `doc-freeze:list`、`trunk:state`）转写为视图模型；无 DOM/IPC/文件系统/哈希重算/权限判定。
 * · **只读提交**：VCA/重构提交只经发起角色能力工具；本模块不产出任何表单字段/提交调用
 *   （F10）。`refactor:request` 通道 D1 不提供（F17），本模块不描述、不消费。
 * · **无 drift**：不输出 drift 字段/状态；旧载荷中的 drift 字段忽略。
 * · 未知枚举值不猜测（显示 `shared.common.unknown`）；坏行丢弃、不阻塞其它行。
 * · 文案全部走共享 i18n（zh-CN/en-US 同 key）；哈希/路径/时间等数据不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";
import type {
  DocFreezeReason,
  RefactorRequestStatus,
  VersionChangeKind,
  VersionChangeStatus,
} from "../../../../src/model/version-change.ts";

/** 冻结派生缓存健康三态（与 D1 `doc-freeze:list`/`trunk:state` 同词表）。 */
export type CacheHealth = "ok" | "missing-migrated" | "corrupt-failclosed";

// —————————————— D1 冻结载荷的渲染侧形状（只含 U1 消费字段） ——————————————

export interface VcaTargetView {
  kind: string;
  path: string;
  action: string;
  version: number | null;
  toSha256: string;
}

export interface VcaView {
  applicationId: string;
  kind: string;
  initiatorRoleId: string;
  flowId: string;
  status: string;
  summary: string;
  bootstrap: boolean;
  baseTrunkVersion: number | null;
  targets: VcaTargetView[];
  submittedAt?: string;
  decidedAt?: string;
  decisionId?: string;
  resultTrunkVersion?: number;
  at: string;
}

export interface StableWriteView {
  requestId: string;
  roleId: string;
  path: string;
  kind: string;
  baseSha256: string;
  targetSha256: string;
  status: string;
  decisionId?: string;
  confirmationId?: string;
  writtenAt?: string;
  at: string;
}

export interface RefactorScopeView {
  modules: string[];
  paths: string[];
  roles: string[];
}

export interface RefactorView {
  requestId: string;
  flowId: string;
  initiatedBy: string;
  title: string;
  reason: string;
  scope: RefactorScopeView;
  status: string;
  managedBy: string;
  at: string;
  updatedAt?: string;
}

export interface DocFreezeDocView {
  path: string;
  version: number;
  sha256: string;
  frozen: boolean;
  reason?: string;
  migrationMark?: "migrated-legacy" | "migrated-draft";
  at: string;
}

export interface DocFreezeListView {
  freezes: DocFreezeDocView[];
  cacheHealth: CacheHealth;
}

export type ListResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: string }
  | null;

// —————————————— 防御读取 ——————————————

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorTextOf(reply: Record<string, unknown>): string {
  const error = asString(reply.error);
  if (error !== "") return error;
  const code = asString(reply.code);
  return code !== "" ? code : translate(DEFAULT_LOCALE, "shared.common.unknownReason");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

function cacheHealthOf(value: unknown): CacheHealth {
  return value === "ok" || value === "missing-migrated" || value === "corrupt-failclosed"
    ? value
    : "corrupt-failclosed";
}

/** `VcaSummary` 防御读取；非法 ⇒ null（坏行不阻塞其它行）。 */
export function asVcaView(raw: unknown): VcaView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const applicationId = asString(record.applicationId);
  const kind = asString(record.kind);
  const initiatorRoleId = asString(record.initiatorRoleId);
  const flowId = asString(record.flowId);
  const status = asString(record.status);
  const at = asString(record.at);
  if (applicationId === "" || kind === "" || flowId === "" || status === "" || at === "") return null;
  const targets: VcaTargetView[] = [];
  if (Array.isArray(record.targets)) {
    for (const item of record.targets) {
      const target = asRecord(item);
      if (!target) continue;
      const path = asString(target.path);
      const toSha256 = asString(target.toSha256);
      if (path === "" || toSha256 === "") continue;
      targets.push({
        kind: asString(target.kind),
        path,
        action: asString(target.action),
        version: asFiniteNumber(target.version),
        toSha256,
      });
    }
  }
  const baseTrunk = asRecord(record.baseTrunk);
  const baseTrunkVersion =
    asFiniteNumber(record.baseTrunkVersion) ??
    (baseTrunk !== null ? asFiniteNumber(baseTrunk.trunkVersion) : null);
  const resultTrunkVersion = asFiniteNumber(record.resultTrunkVersion);
  return {
    applicationId,
    kind,
    initiatorRoleId,
    flowId,
    status,
    summary: asString(record.summary),
    bootstrap: record.bootstrap === true,
    baseTrunkVersion,
    targets,
    ...(asString(record.submittedAt) !== "" ? { submittedAt: asString(record.submittedAt) } : {}),
    ...(asString(record.decidedAt) !== "" ? { decidedAt: asString(record.decidedAt) } : {}),
    ...(asString(record.decisionId) !== "" ? { decisionId: asString(record.decisionId) } : {}),
    ...(resultTrunkVersion !== null ? { resultTrunkVersion } : {}),
    at,
  };
}

/** `version-change:list` 回执防御读取；无法识别 schema ⇒ null。 */
export function asVersionChangeListReply(raw: unknown): ListResult<VcaView> {
  const reply = asRecord(raw);
  if (!reply) return null;
  if (reply.ok !== true) {
    if (reply.ok === false) return { ok: false, error: errorTextOf(reply) };
    return null;
  }
  const items = Array.isArray(reply.items)
    ? reply.items.map(asVcaView).filter((item): item is VcaView => item !== null)
    : [];
  return { ok: true, items };
}

/** `StableWriteSummary` 防御读取。 */
export function asStableWriteView(raw: unknown): StableWriteView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const requestId = asString(record.requestId);
  const path = asString(record.path);
  const kind = asString(record.kind);
  const baseSha256 = asString(record.baseSha256);
  const targetSha256 = asString(record.targetSha256);
  const status = asString(record.status);
  const at = asString(record.at);
  if (requestId === "" || path === "" || kind === "" || status === "" || at === "") return null;
  return {
    requestId,
    roleId: asString(record.roleId),
    path,
    kind,
    baseSha256,
    targetSha256,
    status,
    ...(asString(record.decisionId) !== "" ? { decisionId: asString(record.decisionId) } : {}),
    ...(asString(record.confirmationId) !== "" ? { confirmationId: asString(record.confirmationId) } : {}),
    ...(asString(record.writtenAt) !== "" ? { writtenAt: asString(record.writtenAt) } : {}),
    at,
  };
}

export function asStableWriteListReply(raw: unknown): ListResult<StableWriteView> {
  const reply = asRecord(raw);
  if (!reply) return null;
  if (reply.ok !== true) {
    if (reply.ok === false) return { ok: false, error: errorTextOf(reply) };
    return null;
  }
  const items = Array.isArray(reply.items)
    ? reply.items.map(asStableWriteView).filter((item): item is StableWriteView => item !== null)
    : [];
  return { ok: true, items };
}

/** `RefactorSummary` 防御读取（scope 三数组；缺失按空数组，不猜）。 */
export function asRefactorView(raw: unknown): RefactorView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const requestId = asString(record.requestId);
  const status = asString(record.status);
  const at = asString(record.at);
  if (requestId === "" || status === "" || at === "") return null;
  const scope = asRecord(record.scope) ?? {};
  return {
    requestId,
    flowId: asString(record.flowId),
    initiatedBy: asString(record.initiatedBy),
    title: asString(record.title),
    reason: asString(record.reason),
    scope: {
      modules: stringArray(scope.modules),
      paths: stringArray(scope.paths),
      roles: stringArray(scope.roles),
    },
    status,
    managedBy: asString(record.managedBy),
    at,
    ...(asString(record.updatedAt) !== "" ? { updatedAt: asString(record.updatedAt) } : {}),
  };
}

export function asRefactorListReply(raw: unknown): ListResult<RefactorView> {
  const reply = asRecord(raw);
  if (!reply) return null;
  if (reply.ok !== true) {
    if (reply.ok === false) return { ok: false, error: errorTextOf(reply) };
    return null;
  }
  const items = Array.isArray(reply.items)
    ? reply.items.map(asRefactorView).filter((item): item is RefactorView => item !== null)
    : [];
  return { ok: true, items };
}

/** `DocFreezeSummary` 防御读取。 */
export function asDocFreezeDocView(raw: unknown): DocFreezeDocView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const path = asString(record.path);
  const sha256 = asString(record.sha256);
  const version = asFiniteNumber(record.version);
  const at = asString(record.at);
  if (path === "" || sha256 === "" || version === null || at === "") return null;
  const migration = asString(record.migrationMark);
  return {
    path,
    version,
    sha256,
    frozen: record.frozen === true,
    ...(asString(record.reason) !== "" ? { reason: asString(record.reason) } : {}),
    ...(migration === "migrated-legacy" || migration === "migrated-draft"
      ? { migrationMark: migration }
      : {}),
    at,
  };
}

/** `doc-freeze:list` 回执防御读取（失败分支也带 `freezes:[]` + `cacheHealth`）。 */
export function asDocFreezeListReply(raw: unknown): ListResult<DocFreezeDocView> {
  const reply = asRecord(raw);
  if (!reply) return null;
  if (reply.ok !== true) {
    if (reply.ok === false) {
      return { ok: false, error: errorTextOf(reply) };
    }
    return null;
  }
  const items = Array.isArray(reply.freezes)
    ? reply.freezes.map(asDocFreezeDocView).filter((item): item is DocFreezeDocView => item !== null)
    : [];
  return { ok: true, items };
}

/** 冻结回执的缓存健康（失败时也要显示 fail-closed/unavailable）。 */
export function freezeReplyHealth(raw: unknown): CacheHealth {
  const reply = asRecord(raw);
  return reply ? cacheHealthOf(reply.cacheHealth) : "corrupt-failclosed";
}

// —————————————— 枚举 → i18n key（编译期穷尽；未知值不猜） ——————————————

export const VCA_KIND_KEYS: Readonly<Record<VersionChangeKind, MessageKey>> = Object.freeze({
  "detail-amendment": "ui.versionChange.kind.detailAmendment",
  "version-upgrade": "ui.versionChange.kind.versionUpgrade",
});

export const VCA_STATUS_KEYS: Readonly<Record<VersionChangeStatus, MessageKey>> = Object.freeze({
  draft: "ui.versionChange.status.draft",
  submitted: "ui.versionChange.status.submitted",
  approved: "ui.versionChange.status.approved",
  rejected: "ui.versionChange.status.rejected",
  applied: "ui.versionChange.status.applied",
  superseded: "ui.versionChange.status.superseded",
});

export const REFACTOR_STATUS_KEYS: Readonly<Record<RefactorRequestStatus, MessageKey>> = Object.freeze({
  requested: "ui.refactor.status.requested",
  accepted: "ui.refactor.status.accepted",
  closed: "ui.refactor.status.closed",
  rejected: "ui.refactor.status.rejected",
  superseded: "ui.refactor.status.superseded",
});

export const FREEZE_REASON_KEYS: Readonly<Record<DocFreezeReason, MessageKey>> = Object.freeze({
  "vca-approved": "ui.freeze.reason.vcaApproved",
  "version-upgrade-approved": "ui.freeze.reason.versionUpgradeApproved",
  "detail-item-applied": "ui.freeze.reason.detailItemApplied",
  "amendment-submitted": "ui.freeze.reason.amendmentSubmitted",
  "handoff-pin-bootstrap": "ui.freeze.reason.handoffPinBootstrap",
  "bootstrap-vca-approved": "ui.freeze.reason.bootstrapVcaApproved",
  "migrated-legacy": "ui.freeze.reason.migratedLegacy",
  "proposal-confirmed": "ui.freeze.reason.proposalConfirmed",
  "intent-confirmed": "ui.freeze.reason.intentConfirmed",
});

export const STABLE_KIND_KEYS: Readonly<Record<string, MessageKey>> = Object.freeze({
  workflow: "ui.stableWrite.kind.workflow",
  "role-card": "ui.stableWrite.kind.roleCard",
  boundary: "ui.stableWrite.kind.boundary",
});

function labelOf<K extends string>(
  map: Readonly<Record<K, MessageKey>>,
  value: string,
  locale: Locale,
): string {
  const key = (map as Readonly<Record<string, MessageKey | undefined>>)[value];
  return translate(locale, key ?? "shared.common.unknown");
}

export function vcaKindLabel(kind: string, locale: Locale = DEFAULT_LOCALE): string {
  return labelOf(VCA_KIND_KEYS, kind, locale);
}

export function vcaStatusLabel(status: string, locale: Locale = DEFAULT_LOCALE): string {
  return labelOf(VCA_STATUS_KEYS, status, locale);
}

export function refactorStatusLabel(status: string, locale: Locale = DEFAULT_LOCALE): string {
  return labelOf(REFACTOR_STATUS_KEYS, status, locale);
}

export function freezeReasonLabel(reason: string, locale: Locale = DEFAULT_LOCALE): string {
  return labelOf(FREEZE_REASON_KEYS, reason, locale);
}

export function stableKindLabel(kind: string, locale: Locale = DEFAULT_LOCALE): string {
  return labelOf(STABLE_KIND_KEYS, kind, locale);
}

// —————————————— 会话头入口（版本变更） ——————————————

export interface VersionChangeEntryView {
  visible: boolean;
  enabled: boolean;
  label: string;
  /** 悬停说明（可用=用法；禁用=原因）。 */
  title: string;
  disabledReason?: string;
}

export interface VersionChangeEntryInput {
  /** preload 是否暴露 `version-change:list` + `trunk:state` 订阅。 */
  bridgeAvailable: boolean;
  /** D1 `trunk:state` 快照（只读 `disables.versionChange`；null = 尚未收到推送）。 */
  snapshot: { disables: { versionChange: string | null } } | null;
  /** 快照读取/解析失败原因（有值 ⇒ 禁用并如实显示）。 */
  snapshotError?: string;
}

/**
 * 版本变更入口：桥缺失 ⇒ 禁用；快照错误 ⇒ 禁用；D1 报禁用原因 ⇒ 原样使用；
 * 快照未到 ⇒ 可打开（面板显示加载态）；其余可用并给用法说明。
 */
export function versionChangeEntryView(
  input: VersionChangeEntryInput,
  locale: Locale = DEFAULT_LOCALE,
): VersionChangeEntryView {
  const label = translate(locale, "ui.versionChange.entry");
  if (!input.bridgeAvailable) {
    const disabledReason = translate(locale, "ui.versionChange.disabledUnavailable");
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  if (typeof input.snapshotError === "string" && input.snapshotError !== "") {
    const disabledReason = translate(locale, "ui.versionChange.disabledUnknown", {
      detail: input.snapshotError,
    });
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  const d1Reason = input.snapshot?.disables.versionChange;
  if (typeof d1Reason === "string" && d1Reason !== "") {
    return { visible: true, enabled: false, label, title: d1Reason, disabledReason: d1Reason };
  }
  if (input.snapshot === null) {
    return { visible: true, enabled: true, label, title: translate(locale, "ui.versionChange.loading") };
  }
  return { visible: true, enabled: true, label, title: translate(locale, "ui.versionChange.entryHint") };
}

// —————————————— VCA 行视图 ——————————————

export interface VcaRowView {
  id: string;
  kindLabel: string;
  statusLabel: string;
  initiatorLine: string;
  flowLine: string;
  targetLines: string[];
  moreLine: string | null;
  summaryLine: string;
  semantics: string;
  decisionLine: string | null;
  resultTrunkLine: string | null;
  bootstrap: boolean;
  canOpenCard: boolean;
  /** 仅 `submitted` 可重发卡（D1 `version-change:present` 幂等）。 */
  canPresent: boolean;
}

const TARGET_DISPLAY_LIMIT = 3;

export function vcaRowView(
  vca: VcaView,
  locale: Locale = DEFAULT_LOCALE,
  initiatorName?: string,
): VcaRowView {
  const targetLines = vca.targets.slice(0, TARGET_DISPLAY_LIMIT).map((target) =>
    translate(locale, "ui.versionChange.targetLine", {
      path: target.path,
      version: target.version ?? "?",
      hash: target.toSha256,
    }),
  );
  const moreLine =
    vca.targets.length > TARGET_DISPLAY_LIMIT
      ? translate(locale, "ui.versionChange.targetMore", {
          count: vca.targets.length - TARGET_DISPLAY_LIMIT,
        })
      : null;
  const semantics =
    vca.kind === "version-upgrade"
      ? translate(locale, "ui.versionChange.semantics.versionUpgrade")
      : vca.kind === "detail-amendment"
        ? translate(locale, "ui.versionChange.semantics.detailAmendment")
        : "";
  return {
    id: vca.applicationId,
    kindLabel: vcaKindLabel(vca.kind, locale),
    statusLabel: vcaStatusLabel(vca.status, locale),
    initiatorLine: translate(locale, "ui.versionChange.initiator", {
      role: initiatorName !== undefined && initiatorName !== "" ? initiatorName : vca.initiatorRoleId,
    }),
    flowLine: translate(locale, "ui.versionChange.flow", { flowId: vca.flowId }),
    targetLines,
    moreLine,
    summaryLine:
      vca.summary !== ""
        ? translate(locale, "ui.versionChange.summary", { summary: vca.summary })
        : "",
    semantics,
    decisionLine:
      vca.decisionId !== undefined
        ? translate(locale, "ui.versionChange.decision", {
            decisionId: vca.decisionId,
            time: vca.decidedAt ?? vca.at,
          })
        : null,
    resultTrunkLine:
      vca.resultTrunkVersion !== undefined
        ? translate(locale, "ui.versionChange.resultTrunk", { version: vca.resultTrunkVersion })
        : null,
    bootstrap: vca.bootstrap,
    canOpenCard: vca.status === "submitted" || vca.status === "approved",
    canPresent: vca.status === "submitted",
  };
}

export interface VcaSectionViews {
  pending: VcaRowView[];
  history: VcaRowView[];
}

/** 待批 = submitted/approved（D1 同口径）；其余（含 draft）进历史，不丢弃、不猜测。 */
export function vcaSectionViews(
  items: readonly VcaView[],
  locale: Locale = DEFAULT_LOCALE,
  resolveRoleName?: (roleId: string) => string,
): VcaSectionViews {
  const pending: VcaRowView[] = [];
  const history: VcaRowView[] = [];
  for (const item of items) {
    const row = vcaRowView(item, locale, resolveRoleName?.(item.initiatorRoleId));
    if (item.status === "submitted" || item.status === "approved") pending.push(row);
    else history.push(row);
  }
  return { pending, history };
}

// —————————————— 只读提交指引（F10；产品/策划；无表单） ——————————————

export interface SubmitGuidanceView {
  visible: boolean;
  text: string;
}

/**
 * 产品（version-upgrade）/策划（detail-amendment）的只读提交指引：
 * 显示「提交在发起角色会话中经能力工具完成」，**不渲染表单字段、提交按钮、kind/target 编辑**。
 */
export function vcaSubmitGuidanceView(
  input: { governanceFunction: string | undefined },
  locale: Locale = DEFAULT_LOCALE,
): SubmitGuidanceView {
  const visible =
    input.governanceFunction === "product" || input.governanceFunction === "proposal";
  return {
    visible,
    text: visible ? translate(locale, "ui.versionChange.submitGuidance") : "",
  };
}

// —————————————— 重构审计（客户只读；运营只读指引） ——————————————

export interface RefactorRowView {
  id: string;
  title: string;
  statusLabel: string;
  flowId: string;
  scopeLine: string;
  summaryLine: string;
  at: string;
}

export function refactorRowView(
  item: RefactorView,
  locale: Locale = DEFAULT_LOCALE,
): RefactorRowView {
  const scopeSource =
    item.scope.paths.length > 0
      ? item.scope.paths
      : item.scope.modules.length > 0
        ? item.scope.modules
        : item.scope.roles;
  const scopeLine = translate(locale, "ui.refactor.scope", {
    paths: scopeSource.length > 0 ? scopeSource.join(", ") : translate(locale, "shared.common.none"),
  });
  return {
    id: item.requestId,
    title: item.title !== "" ? item.title : item.requestId,
    statusLabel: refactorStatusLabel(item.status, locale),
    flowId: item.flowId,
    scopeLine,
    summaryLine:
      item.reason !== ""
        ? translate(locale, "ui.refactor.summary", { reason: item.reason })
        : "",
    at: item.updatedAt ?? item.at,
  };
}

/** 运营（schedule）的只读提交指引；其他角色不显示。**无渲→主申请表单/身份自报**（F10/F17）。 */
export function refactorGuidanceView(
  input: { governanceFunction: string | undefined },
  locale: Locale = DEFAULT_LOCALE,
): SubmitGuidanceView {
  const visible = input.governanceFunction === "schedule";
  return {
    visible,
    text: visible ? translate(locale, "ui.refactor.submitGuidance") : "",
  };
}

// —————————————— stable 确认/续接记录（无 drift） ——————————————

export interface StableRecordView {
  id: string;
  kindLabel: string;
  line: string;
  status: string;
}

/** 只有 `written` 是「确认已落、快照已续接」的记录；其余状态不算续接（不虚构）。 */
export function stableRecordViews(
  records: readonly StableWriteView[],
  locale: Locale = DEFAULT_LOCALE,
): StableRecordView[] {
  return records
    .filter((record) => record.status === "written")
    .map((record) => ({
      id: record.requestId,
      kindLabel: stableKindLabel(record.kind, locale),
      line: translate(locale, "ui.stableWrite.record.line", {
        path: record.path,
        decisionId:
          record.decisionId ?? record.confirmationId ?? record.requestId,
        oldSha: record.baseSha256 !== "" ? record.baseSha256 : translate(locale, "shared.common.none"),
        newSha: record.targetSha256,
        time: record.writtenAt ?? record.at,
      }),
      status: record.status,
    }));
}

// —————————————— 冻结清单 ——————————————

export interface FreezeDocRowView {
  id: string;
  statusLabel: string;
  line: string;
  migrationLabel: string;
}

export function freezeDocRowView(
  doc: DocFreezeDocView,
  locale: Locale = DEFAULT_LOCALE,
): FreezeDocRowView {
  const reason =
    doc.reason !== undefined
      ? freezeReasonLabel(doc.reason, locale)
      : translate(locale, "ui.freeze.status.draft");
  const migrationLabel =
    doc.migrationMark === "migrated-legacy"
      ? translate(locale, "ui.freeze.migratedLegacy")
      : doc.migrationMark === "migrated-draft"
        ? translate(locale, "ui.freeze.migratedDraft")
        : "";
  return {
    id: `${doc.path}:${doc.version}`,
    statusLabel: doc.frozen
      ? translate(locale, "ui.freeze.status.frozen")
      : translate(locale, "ui.freeze.status.draft"),
    line: translate(locale, "ui.freeze.listLine", {
      path: doc.path,
      version: doc.version,
      hash: doc.sha256,
      reason,
    }),
    migrationLabel,
  };
}

/** 冻结缓存健康提示：corrupt ⇒ fail-closed；migration-required ⇒ 暂不可用；ok ⇒ 空串。 */
export function freezeHealthNotice(
  health: CacheHealth | null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (health === "corrupt-failclosed") return translate(locale, "ui.freeze.failClosed");
  if (health === "missing-migrated") return translate(locale, "ui.freeze.unavailable");
  return "";
}

/** 列表加载错误提示；不可识别 schema ⇒ `schemaUnsupported`。 */
export function versionChangeListNotice(
  result: ListResult<unknown>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (result === null) return translate(locale, "ui.versionChange.schemaUnsupported");
  if (result.ok === false) {
    return translate(locale, "ui.versionChange.loadError", { detail: result.error });
  }
  return "";
}

// —————————————— 重发卡回执（只显示 D1 事实，不伪造批准） ——————————————

export interface PresentReceiptView {
  kind: "none" | "pending" | "presented" | "answered" | "rejected" | "error";
  text: string;
}

/**
 * `version-change:present` 回执 → 一行事实：
 * · `pending`（无客户卡通道）⇒ 固定 `noChannel`，申请保持 submitted 可重试；
 * · `presented` ⇒ 卡已呈现、仍待确认（不显示为已批准）；
 * · `answered` ⇒ 客户已作答（状态按 D1 `recordStatus` 映射，未知不猜）；
 * · 失败 ⇒ D1 返回原文。
 */
export function presentVersionChangeReceiptView(
  reply: unknown,
  locale: Locale = DEFAULT_LOCALE,
): PresentReceiptView {
  const record = asRecord(reply);
  if (!record) return { kind: "error", text: translate(locale, "shared.common.unknownReason") };
  if (record.ok !== true) {
    return { kind: "error", text: errorTextOf(record) };
  }
  const status = asString(record.status);
  if (status === "pending") {
    return { kind: "pending", text: translate(locale, "ui.versionChange.noChannel") };
  }
  if (status === "presented") {
    return { kind: "presented", text: translate(locale, "ui.versionChange.status.submitted") };
  }
  if (status === "answered") {
    const recordStatus = asString(record.recordStatus);
    return {
      kind: "answered",
      text:
        recordStatus !== ""
          ? vcaStatusLabel(recordStatus, locale)
          : translate(locale, "shared.common.unknown"),
    };
  }
  if (status === "declined") {
    return { kind: "rejected", text: translate(locale, "ui.versionChange.status.rejected") };
  }
  return { kind: "none", text: "" };
}
