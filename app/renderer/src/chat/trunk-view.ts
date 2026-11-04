/**
 * 主干面板/收窄「主干升级」的**纯视图逻辑**（U1，2026-11-04 trunk-amendment-model）。
 *
 * 纪律（P1.6 §4.9/§4.10；PM 复审 F15；D1 冻结载荷 `app/desktop/trunk.ts`）：
 * · 只消费 D1 单一状态源 `trunk:state`（v1）与 `trunk:upgrade-request`/`trunk:upgrade-confirm`
 *   回执；不读盘、不判冻结/哈希/permit、不本地统计、不轮询。
 * · **F15**：stable 快照按 workflow / role-card（`roleCards`）/ boundary（`boundaries`）三类展示。
 * · **无 drift**：不输出 drift 字段/状态；stable 只展示确认/续接记录与版本不变事实。
 * · 升级仅紧急/恢复：入口禁用原因只取 D1 `disables.trunkUpgrade`（null = 可用），不自行推导；
 *   回执只显示「已提交、待二次确认」或主干版本事实，绝不显示为「已升级」。
 * · 文案全部走共享 i18n；未知枚举值不猜测。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";
import {
  asRefactorView,
  asVcaView,
  stableKindLabel,
  stableRecordViews,
  type CacheHealth,
  type RefactorView,
  type StableRecordView,
  type StableWriteView,
  type VcaView,
} from "./version-change-view.ts";

// —————————————— D1 `trunk:state` 载荷的渲染侧形状（只含 U1 消费字段） ——————————————

export interface TrunkStableSnapshotView {
  kind: string;
  roleId?: string;
  path: string;
  sha256: string;
}

export interface TrunkStateView {
  version: 1;
  availability: string;
  trunkVersion: number | null;
  source: string | null;
  runId: string | null;
  flowId: string | null;
  digest: string | null;
  derived: boolean;
  /** **F15**：workflow / roleCards / boundaries 三类 stable 快照（缺省为空/ null）。 */
  stable: {
    workflow: TrunkStableSnapshotView | null;
    roleCards: TrunkStableSnapshotView[];
    boundaries: TrunkStableSnapshotView[];
  };
  amendment: {
    amendmentId: string;
    status: string;
    applyState: string;
    applicationId?: string;
  } | null;
  journal: { journalId: string; phase: string; result?: string } | null;
  pendingReattach: string[];
  issues: string[];
  freezes: { count: number; cacheHealth: CacheHealth };
  pendingVersionChanges: { count: number; items: VcaView[] };
  refactors: { count: number; items: RefactorView[] };
  disables: {
    versionChange: string | null;
    stableWrite: string | null;
    trunkUpgrade: string | null;
    refactor: string | null;
  };
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

function disableText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function cacheHealthOf(value: unknown): CacheHealth {
  return value === "ok" || value === "missing-migrated" || value === "corrupt-failclosed"
    ? value
    : "corrupt-failclosed";
}

function stableSnapshotOf(
  raw: unknown,
  kind: string,
  roleId?: string,
): TrunkStableSnapshotView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const path = asString(record.path);
  const sha256 = asString(record.sha256);
  if (path === "" || sha256 === "") return null;
  return { kind, ...(roleId !== undefined ? { roleId } : {}), path, sha256 };
}

function stableRoleSnapshotsOf(
  raw: unknown,
  kind: string,
): TrunkStableSnapshotView[] {
  const record = asRecord(raw);
  if (!record) return [];
  const rows: TrunkStableSnapshotView[] = [];
  for (const [roleId, entry] of Object.entries(record)) {
    const view = stableSnapshotOf(entry, kind, roleId);
    if (view !== null) rows.push(view);
  }
  rows.sort((left, right) => (left.roleId ?? "") < (right.roleId ?? "") ? -1 : 1);
  return rows;
}

/**
 * `trunk:state` v1 防御解析：`version===1`、`ok===true`、stable/disables 形状成立才接受；
 * 否则 null（面板显示 `schemaUnsupported`，不猜测）。坏条目丢弃、不阻塞其它条目。
 */
export function asTrunkStatePayload(raw: unknown): TrunkStateView | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (record.version !== 1 || record.ok !== true) return null;
  const stable = asRecord(record.stable);
  const disables = asRecord(record.disables);
  if (!stable || !disables) return null;
  const freezes = asRecord(record.freezes);
  const pending = asRecord(record.pendingVersionChanges);
  const refactors = asRecord(record.refactors);
  const amendment = asRecord(record.amendment);
  const journal = asRecord(record.journal);
  const workflow = stableSnapshotOf(stable.workflow, "workflow");
  return {
    version: 1,
    availability: asString(record.availability),
    trunkVersion: asNumberOrNull(record.trunkVersion),
    source: asString(record.source) !== "" ? asString(record.source) : null,
    runId: asString(record.runId) !== "" ? asString(record.runId) : null,
    flowId: asString(record.flowId) !== "" ? asString(record.flowId) : null,
    digest: asString(record.digest) !== "" ? asString(record.digest) : null,
    derived: record.derived === true,
    stable: {
      workflow,
      roleCards: stableRoleSnapshotsOf(stable.roleCards, "role-card"),
      boundaries: stableRoleSnapshotsOf(stable.boundaries, "boundary"),
    },
    amendment:
      amendment === null
        ? null
        : {
            amendmentId: asString(amendment.amendmentId),
            status: asString(amendment.status),
            applyState: asString(amendment.applyState),
            ...(asString(amendment.applicationId) !== ""
              ? { applicationId: asString(amendment.applicationId) }
              : {}),
          },
    journal:
      journal === null
        ? null
        : {
            journalId: asString(journal.journalId),
            phase: asString(journal.phase),
            ...(asString(journal.result) !== "" ? { result: asString(journal.result) } : {}),
          },
    pendingReattach: asStringArray(record.pendingReattach),
    issues: asStringArray(record.issues),
    freezes: {
      count: asNumberOrNull(freezes?.count) ?? 0,
      cacheHealth: cacheHealthOf(freezes?.cacheHealth),
    },
    pendingVersionChanges: {
      count: asNumberOrNull(pending?.count) ?? 0,
      items: Array.isArray(pending?.items)
        ? pending.items.map(asVcaView).filter((item): item is VcaView => item !== null)
        : [],
    },
    refactors: {
      count: asNumberOrNull(refactors?.count) ?? 0,
      items: Array.isArray(refactors?.items)
        ? refactors.items.map(asRefactorView).filter((item): item is RefactorView => item !== null)
        : [],
    },
    disables: {
      versionChange: disableText(disables.versionChange),
      stableWrite: disableText(disables.stableWrite),
      trunkUpgrade: disableText(disables.trunkUpgrade),
      refactor: disableText(disables.refactor),
    },
    ...(asString(record.error) !== "" ? { error: asString(record.error) } : {}),
  };
}

// —————————————— 面板 ——————————————

export type TrunkPanelSegment = "version-change" | "trunk" | "refactor";

export const TRUNK_SEGMENT_KEYS: Readonly<Record<TrunkPanelSegment, MessageKey>> = Object.freeze({
  "version-change": "ui.trunk.segment.versionChange",
  trunk: "ui.trunk.segment.trunk",
  refactor: "ui.trunk.segment.refactor",
});

export interface TrunkPanelView {
  versionLine: string;
  availability: string;
  source: string | null;
  derived: boolean;
  issues: string[];
  pendingReattach: string[];
}

export function trunkPanelView(
  state: TrunkStateView | null,
  locale: Locale = DEFAULT_LOCALE,
): TrunkPanelView {
  if (state === null) {
    return {
      versionLine: translate(locale, "ui.trunk.versionNone"),
      availability: "",
      source: null,
      derived: false,
      issues: [],
      pendingReattach: [],
    };
  }
  return {
    versionLine:
      state.trunkVersion !== null
        ? translate(locale, "ui.trunk.version", { version: state.trunkVersion })
        : translate(locale, "ui.trunk.versionNone"),
    availability: state.availability,
    source: state.source,
    derived: state.derived,
    issues: state.issues,
    pendingReattach: state.pendingReattach,
  };
}

// —————————————— 收窄的主干升级入口 ——————————————

export interface TrunkUpgradeEntryView {
  visible: boolean;
  enabled: boolean;
  label: string;
  title: string;
  disabledReason?: string;
}

export interface TrunkUpgradeEntryInput {
  /** preload 是否暴露 `trunk:upgrade-request`。 */
  bridgeAvailable: boolean;
  /** D1 `trunk:state`；null = 尚未收到推送（无法判断主干可用性 ⇒ 禁用并说明）。 */
  snapshot: { disables: { trunkUpgrade: string | null } } | null;
  snapshotError?: string;
}

/**
 * 「主干升级」入口（仅紧急/恢复）：桥缺失/快照错误/未收到快照 ⇒ 禁用；D1 禁用原因原样使用
 * （无主干、派生态、不可用、冻结缓存 fail-closed 均由 D1 给出，U1 不自行推导）。
 */
export function trunkUpgradeEntryView(
  input: TrunkUpgradeEntryInput,
  locale: Locale = DEFAULT_LOCALE,
): TrunkUpgradeEntryView {
  const label = translate(locale, "ui.trunk.entry");
  if (!input.bridgeAvailable) {
    const disabledReason = translate(locale, "ui.trunk.upgrade.disabledUnavailable");
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  if (typeof input.snapshotError === "string" && input.snapshotError !== "") {
    const disabledReason = translate(locale, "ui.trunk.upgrade.disabledUnknown", {
      detail: input.snapshotError,
    });
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  if (input.snapshot === null) {
    const disabledReason = translate(locale, "ui.trunk.upgrade.disabledUnknown", {
      detail: translate(locale, "shared.common.unknown"),
    });
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  const d1Reason = input.snapshot.disables.trunkUpgrade;
  if (typeof d1Reason === "string" && d1Reason !== "") {
    return { visible: true, enabled: false, label, title: d1Reason, disabledReason: d1Reason };
  }
  return { visible: true, enabled: true, label, title: translate(locale, "ui.trunk.entryHint") };
}

// —————————————— F15：stable 三类快照 ——————————————

export interface StableSnapshotRowView {
  id: string;
  kindLabel: string;
  roleId: string;
  path: string;
  sha256: string;
}

/** workflow → role-card → boundary 顺序展开三类快照（F15；缺項不虚构）。 */
export function stableSnapshotRowsView(
  state: TrunkStateView | null,
  locale: Locale = DEFAULT_LOCALE,
): StableSnapshotRowView[] {
  if (state === null) return [];
  const rows: StableSnapshotRowView[] = [];
  const push = (snapshot: TrunkStableSnapshotView) => {
    rows.push({
      id: `${snapshot.kind}:${snapshot.roleId ?? ""}:${snapshot.path}`,
      kindLabel: stableKindLabel(snapshot.kind, locale),
      roleId: snapshot.roleId ?? "",
      path: snapshot.path,
      sha256: snapshot.sha256,
    });
  };
  if (state.stable.workflow !== null) push(state.stable.workflow);
  for (const snapshot of state.stable.roleCards) push(snapshot);
  for (const snapshot of state.stable.boundaries) push(snapshot);
  return rows;
}

// —————————————— stable 确认/续接记录（按 kind 分组；无 drift） ——————————————

export interface StableRecordGroupView {
  kind: string;
  label: string;
  rows: StableRecordView[];
}

export interface StableRecordGroupResult {
  groups: StableRecordGroupView[];
  empty: boolean;
  /** 固定说明 key（「不升主干版本」+「不再显示漂移」）。 */
  notes: string[];
}

export function stableRecordGroupView(
  records: readonly StableWriteView[],
  locale: Locale = DEFAULT_LOCALE,
): StableRecordGroupResult {
  const written = records.filter((record) => record.status === "written");
  const kinds = ["workflow", "role-card", "boundary"];
  const groups: StableRecordGroupView[] = [];
  for (const kind of kinds) {
    const rows = stableRecordViews(
      written.filter((record) => record.kind === kind),
      locale,
    );
    if (rows.length === 0) continue;
    groups.push({ kind, label: stableKindLabel(kind, locale), rows });
  }
  return {
    groups,
    empty: written.length === 0,
    notes: [
      translate(locale, "ui.stableWrite.record.unchangedVersion"),
      translate(locale, "ui.stableWrite.confirm.noDrift"),
    ],
  };
}

// —————————————— 升级回执（只显示事实；绝不显示「已升级」） ——————————————

export interface TrunkUpgradeReceiptView {
  kind: "preview" | "error" | "applied";
  text: string;
  previewId?: string;
}

/** `trunk:upgrade-request` 回执：成功 ⇒ 已提交、待二次确认（含 previewId）；失败 ⇒ D1 原文。 */
export function trunkUpgradeRequestReceiptView(
  reply: unknown,
  locale: Locale = DEFAULT_LOCALE,
): TrunkUpgradeReceiptView {
  const record = asRecord(reply);
  if (!record || record.ok !== true) {
    const text =
      record && asString(record.error) !== ""
        ? asString(record.error)
        : record && asString(record.code) !== ""
          ? asString(record.code)
          : translate(locale, "shared.common.unknownReason");
    return { kind: "error", text };
  }
  const previewId = asString(record.previewId);
  if (previewId === "") {
    return { kind: "error", text: translate(locale, "shared.common.unknownReason") };
  }
  return {
    kind: "preview",
    previewId,
    text: translate(locale, "ui.trunk.upgrade.success"),
  };
}

/** `trunk:upgrade-confirm` 回执：成功只显示主干版本事实（不写「升级成功」）。 */
export function trunkUpgradeConfirmReceiptView(
  reply: unknown,
  locale: Locale = DEFAULT_LOCALE,
): TrunkUpgradeReceiptView {
  const record = asRecord(reply);
  if (!record || record.ok !== true) {
    const text =
      record && asString(record.error) !== ""
        ? asString(record.error)
        : record && asString(record.code) !== ""
          ? asString(record.code)
          : translate(locale, "shared.common.unknownReason");
    return { kind: "error", text };
  }
  const version = asNumberOrNull(record.trunkVersion);
  return {
    kind: "applied",
    text:
      version !== null
        ? translate(locale, "ui.trunk.version", { version })
        : translate(locale, "shared.common.unknown"),
  };
}
