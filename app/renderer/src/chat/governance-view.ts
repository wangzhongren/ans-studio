/**
 * 治理状态 / 动作 / 预览 / 空态的纯映射（Phase 4B）。
 *
 * 文案以旧 `ui-labels.js` 为基线（单一来源），只做「主进程事实 → 文案」的转写；
 * appointment 相关文案按 2026-10-22 治理拆分方案 §5.4 更新（「提名」→「任命」）。
 * 不判边界、不读文件、不猜模型；缺省/未知一律不显示、不编辑语义。
 * `phase === "write"` 是「是否零副作用」的唯一依据（非 write 才可声明未写入任何文件）。
 *
 * i18n B1：展示文案来自 shared `ui.governance.*`，纯函数接受可选 `locale`
 * （默认 zh-CN）。flowId/stepId/path/cardKind 等机器值不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export interface GovernanceActionInput {
  hasProject: boolean;
  hasRoles: boolean;
  recordState: string;
}

export type GovernanceAction = "establish" | "reaccept" | null;

/** 动作可见谓词唯一入口（旧 `governanceActionFor` 同口径）。 */
export function governanceActionFor(
  hasProject: boolean,
  hasRoles: boolean,
  recordState: string,
): GovernanceAction {
  if (hasProject !== true) return null;
  if (recordState === "pin-mismatch") return "reaccept";
  if (hasRoles === true && recordState === "missing") return "establish";
  return null;
}

export function projectRoleCount(roles: ReadonlyArray<unknown> | null): number {
  let count = 0;
  for (const role of roles || []) {
    if (!role || typeof role !== "object") continue;
    if ((role as { builtIn?: unknown }).builtIn !== true) count += 1;
  }
  return count;
}

const GOVERNANCE_MODEL_STATUS_KEYS: Record<string, MessageKey> = {
  single: "ui.governance.model.single",
  trio: "ui.governance.model.trio",
};

const GOVERNANCE_FLOW_STATUS_KEYS: Record<string, MessageKey> = {
  "awaiting-customer": "ui.governance.status.awaitingCustomer",
  "in-progress": "ui.governance.status.inProgress",
  blocked: "ui.governance.status.blocked",
  "escalated-to-customer": "ui.governance.status.escalated",
};

/** 治理模型展示名（未知 ⇒ 空串，不猜）。状态行专用「三权 · 五角色」。 */
export function governanceModelStatusText(
  model: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = typeof model === "string" ? GOVERNANCE_MODEL_STATUS_KEYS[model] : undefined;
  if (key === undefined) return "";
  return translate(locale, "ui.governance.modelLine", { model: translate(locale, key) });
}

/** 迁移预览里的通用模型名（旧 `governanceModelText`）。 */
export function governanceModelText(
  model: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (model === "single") return translate(locale, "ui.governance.model.single");
  if (model === "trio") return translate(locale, "ui.governance.modelShort.trio");
  return "";
}

export function governanceFlowStatusText(
  status: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key =
    typeof status === "string" ? GOVERNANCE_FLOW_STATUS_KEYS[status] : undefined;
  return key === undefined ? "" : translate(locale, key);
}

/** 状态行（旧 `governanceStatusText`）：模型 + 流程 + 流程状态；未知片段不显示。 */
export function governanceStatusText(
  model: unknown,
  flowId: unknown,
  flowStatus: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const parts: string[] = [];
  const modelText = governanceModelStatusText(
    typeof model === "string" ? model : null,
    locale,
  );
  if (modelText !== "") parts.push(modelText);
  if (typeof flowId === "string" && flowId !== "") {
    parts.push(translate(locale, "ui.governance.currentFlow", { flowId }));
  }
  const statusText = governanceFlowStatusText(flowStatus, locale);
  if (statusText !== "") parts.push(statusText);
  return parts.join(" · ");
}

export function governanceMissingText(
  roleCount: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const n =
    typeof roleCount === "number" && Number.isFinite(roleCount) && roleCount >= 0
      ? Math.floor(roleCount)
      : 0;
  return translate(locale, "ui.governance.noRecordBody", { roleCount: n });
}

export function governanceInvalidText(
  reason: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const r =
    typeof reason === "string" && reason !== ""
      ? reason
      : translate(locale, "ui.governance.reasonNotProvided");
  return translate(locale, "ui.governance.recordUnavailable", { reason: r });
}

export function governanceEmptyState(
  roleCount: unknown,
  primaryRoleId: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { kind: "governance"; title: string; sub: string } {
  const primary =
    typeof primaryRoleId === "string" && primaryRoleId !== ""
      ? primaryRoleId
      : translate(locale, "ui.governance.primaryRole");
  return {
    kind: "governance",
    title: translate(locale, "ui.governance.noRecordTitle"),
    sub:
      governanceMissingText(roleCount, locale) +
      translate(locale, "ui.governance.establishHint", { roleName: primary }),
  };
}

// —————— 治理角色说明（按 governanceFunction；appointment 相关文案按 2026-10-22 治理拆分更新）——————

const GOVERNANCE_ROLE_HINT_KEYS: Record<string, MessageKey> = {
  chief: "ui.governance.roleIntro.chief",
  product: "ui.governance.roleIntro.product",
  proposal: "ui.governance.roleIntro.proposal",
  nomination: "ui.governance.roleIntro.nomination",
  schedule: "ui.governance.roleIntro.schedule",
  verification: "ui.governance.roleIntro.verification",
};

export function governanceRoleEmptyHint(
  governanceFunction: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key =
    typeof governanceFunction === "string"
      ? GOVERNANCE_ROLE_HINT_KEYS[governanceFunction]
      : undefined;
  return key === undefined ? "" : translate(locale, key);
}

// —————— pin 不符（reaccept）——————

export function pinCountOf(pinCount: unknown): number {
  return typeof pinCount === "number" && Number.isFinite(pinCount) && pinCount > 0
    ? Math.floor(pinCount)
    : 0;
}

export function shortHash(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 8) : "";
}

export interface PinChangedEntry {
  status: string;
  path: string;
  pinned?: string;
  actual?: string;
}

/** 归一不一致条目：优先 `changed`，旧 listing 用 `pinFiles` 承载同一事实。 */
export function changedEntries(record: Record<string, unknown> | null | undefined): PinChangedEntry[] {
  const source = Array.isArray(record?.changed)
    ? (record?.changed as unknown[])
    : Array.isArray(record?.pinFiles)
      ? (record?.pinFiles as unknown[])
      : [];
  const list: PinChangedEntry[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    list.push({
      status: typeof entry.status === "string" ? entry.status : "",
      path: typeof entry.path === "string" ? entry.path : "",
      pinned: typeof entry.pinned === "string" ? entry.pinned : undefined,
      actual: typeof entry.actual === "string" ? entry.actual : undefined,
    });
  }
  return list;
}

export function changedCounts(changed: ReadonlyArray<PinChangedEntry>): {
  modified: number;
  missing: number;
  unreadable: number;
} {
  const counts = { modified: 0, missing: 0, unreadable: 0 };
  for (const entry of changed) {
    if (entry.status === "modified") counts.modified += 1;
    else if (entry.status === "missing") counts.missing += 1;
    else if (entry.status === "unreadable") counts.unreadable += 1;
  }
  return counts;
}

/** pin-mismatch 状态行（逐字；只列非零类别）。 */
export function governancePinMismatchText(
  pinCount: unknown,
  changed: ReadonlyArray<PinChangedEntry>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const n = pinCountOf(pinCount);
  const counts = changedCounts(changed);
  const parts: string[] = [];
  if (counts.modified > 0) {
    parts.push(translate(locale, "ui.governance.mismatch.modified", { count: counts.modified }));
  }
  if (counts.missing > 0) {
    parts.push(translate(locale, "ui.governance.mismatch.missing", { count: counts.missing }));
  }
  if (counts.unreadable > 0) {
    parts.push(
      translate(locale, "ui.governance.mismatch.unreadable", { count: counts.unreadable }),
    );
  }
  const detail = parts.length
    ? parts.join(locale === "zh-CN" ? "、" : ", ")
    : translate(locale, "ui.governance.mismatch.someInconsistent");
  return translate(locale, "ui.governance.mismatch.summary", {
    pinCount: n,
    diffCount: changed.length,
    detail,
  });
}

export function governancePinMismatchEmptyState(
  pinCount: unknown,
  changed: ReadonlyArray<PinChangedEntry>,
  locale: Locale = DEFAULT_LOCALE,
): { kind: "governance"; title: string; sub: string; hint: string } {
  return {
    kind: "governance",
    title: translate(locale, "ui.governance.mismatch.title"),
    sub:
      governancePinMismatchText(pinCount, changed, locale) +
      translate(locale, "ui.governance.mismatch.note"),
    hint: translate(locale, "ui.governance.mismatch.hint"),
  };
}

export interface ReacceptPreviewView {
  title: string;
  fileLines: Array<{ status: string; path: string; text: string }>;
  writeLine: string;
  pinLine: string;
  warning: string;
  canConfirm: boolean;
  blockerLines: string[];
  previewDigest: string;
  pinCount: number;
  changed: PinChangedEntry[];
}

/** 重新接受预览视图（逐字沿用旧 `governanceReacceptPreviewView`）。 */
export function governanceReacceptPreviewView(
  preview: unknown,
  locale: Locale = DEFAULT_LOCALE,
): ReacceptPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const changed = changedEntries(record);
  const fileLines: ReacceptPreviewView["fileLines"] = [];
  for (const file of changed) {
    let text = "";
    if (file.status === "modified") {
      text = translate(locale, "ui.governance.pin.changed", {
        path: file.path,
        pinned: shortHash(file.pinned),
        actual: shortHash(file.actual),
      });
    } else if (file.status === "missing") {
      text = translate(locale, "ui.governance.pin.missing", { path: file.path });
    } else if (file.status === "unreadable") {
      text = translate(locale, "ui.governance.pin.unreadable", { path: file.path });
    }
    if (text !== "") fileLines.push({ status: file.status, path: file.path, text });
  }
  const blockerLines: string[] = [];
  for (const item of Array.isArray(record.blockers) ? record.blockers : []) {
    if (item && typeof item === "object") {
      const message = (item as Record<string, unknown>).message;
      if (typeof message === "string" && message !== "") blockerLines.push(message);
    }
  }
  return {
    title: translate(locale, "ui.governance.reacceptPreview"),
    fileLines,
    writeLine: translate(locale, "ui.governance.reacceptWriteLine"),
    pinLine: translate(locale, "ui.governance.reacceptPinned", {
      count: pinCountOf(record.pinCount),
    }),
    warning: translate(locale, "ui.governance.reacceptWarning"),
    canConfirm: record.canConfirm === true,
    blockerLines,
    previewDigest: typeof record.previewDigest === "string" ? record.previewDigest : "",
    pinCount: pinCountOf(record.pinCount),
    changed,
  };
}

export function governanceReacceptSuccessText(
  pinCount: unknown,
  changedCount: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const n = pinCountOf(pinCount);
  const c =
    typeof changedCount === "number" && Number.isFinite(changedCount) && changedCount > 0
      ? Math.floor(changedCount)
      : 0;
  return translate(locale, "ui.governance.reacceptSuccess", { updated: c, total: n });
}

/** 零写入短语的唯一来源（文本判定改为按目录文案匹配，不再内嵌中文字面量）。 */
function noFilesWrittenText(locale: Locale): string {
  return translate(locale, "ui.governance.noFilesWritten").replace(/[.。]\s*$/, "");
}

/** 重新接受失败视图：phase 是零副作用的唯一依据。 */
export function governanceReacceptFailureView(
  phase: unknown,
  status: unknown,
  message: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  const msg = typeof message === "string" ? message : "";
  if (msg !== "") lines.push(msg);
  if (phase !== "write") {
    const noWrite = noFilesWrittenText(locale);
    if (msg.indexOf(noWrite) < 0) {
      lines.push(translate(locale, "ui.governance.reacceptNotWritten"));
    }
    if (status === "no-record") lines.push(translate(locale, "ui.governance.reacceptNoRecord"));
    else if (status === "invalid-record") {
      lines.push(translate(locale, "ui.governance.reacceptInvalidRecord"));
    } else if (status === "not-needed") {
      lines.push(translate(locale, "ui.governance.reacceptNotNeeded"));
    } else if (status === "preview-stale") {
      lines.push(translate(locale, "ui.governance.reacceptPreviewStale"));
    } else if (
      status === "missing-file" ||
      status === "unreadable-file" ||
      status === "unparseable-boundary"
    ) {
      lines.push(translate(locale, "ui.governance.reacceptFixFiles"));
    } else if (status === "busy") {
      lines.push(translate(locale, "ui.governance.reacceptBusy"));
    }
  }
  return { lines, noRetry: phase === "write" };
}

// —————— 建立治理记录 ——————

function asPreviewList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

export interface EstablishPreviewView {
  title: string;
  writeLines: string[];
  pinPaths: string[];
  pinCount: number;
  roleCount: number;
  adoptLine: string;
  model: string;
  suggestion: string;
  legacyRoleLines: string[];
  declaration: string;
  canConfirm: boolean;
  blockers: string[];
}

/** 建立预览视图：只转写预览回包字段，缺省如实「未报告」。 */
export function governanceEstablishPreviewView(
  preview: unknown,
  locale: Locale = DEFAULT_LOCALE,
): EstablishPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const writePaths = asPreviewList(record.writePaths);
  const pinPaths = asPreviewList(record.pinPaths);
  const adoptExisting = record.adoptExistingBoundary === true;
  const boundaryPath = typeof record.boundaryPath === "string" ? record.boundaryPath : "";
  const legacyRolePaths = asPreviewList(record.legacyBoundaryRoles);
  const blockers: string[] = [];
  for (const item of Array.isArray(record.blockers) ? record.blockers : []) {
    if (item && typeof item === "object") {
      const message = (item as Record<string, unknown>).message;
      if (typeof message === "string" && message !== "") blockers.push(message);
    }
  }
  return {
    title: translate(locale, "ui.governance.establishPreview"),
    writeLines: writePaths.length
      ? writePaths.map((path) =>
          translate(locale, "ui.governance.establishWritePath", { path }),
        )
      : [
          translate(locale, "ui.governance.establishWritePath", {
            path: translate(locale, "shared.common.notProvided"),
          }),
        ],
    pinPaths,
    pinCount:
      typeof record.pinCount === "number" && Number.isFinite(record.pinCount)
        ? Math.floor(record.pinCount)
        : pinPaths.length,
    roleCount:
      typeof record.roleCount === "number" && Number.isFinite(record.roleCount)
        ? Math.floor(record.roleCount)
        : 0,
    adoptLine: adoptExisting
      ? translate(locale, "ui.governance.establishAdoptExisting")
      : boundaryPath
        ? translate(locale, "ui.governance.establishWriteBoundary", { path: boundaryPath })
        : translate(locale, "ui.governance.establishBoundaryNotReported"),
    model: typeof record.governanceModel === "string" ? record.governanceModel : "",
    suggestion: record.suggestedGovernanceModel === "trio" ? "trio" : "",
    legacyRoleLines: legacyRolePaths.map((path) =>
      translate(locale, "ui.governance.establishLegacyBoundary", { path }),
    ),
    declaration: translate(locale, "ui.governance.establishDeclaration"),
    canConfirm: record.canConfirm !== false,
    blockers,
  };
}

/** 建立失败视图（旧 `governanceFailureView`）。 */
export function governanceFailureView(
  phase: unknown,
  code: unknown,
  message: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  if (typeof message === "string" && message !== "") lines.push(message);
  if (phase !== "write") {
    if (code === "already-established") {
      lines.push(translate(locale, "ui.governance.establishAlreadyExists"));
    } else if (code === "busy") {
      lines.push(translate(locale, "ui.governance.establishBusy"));
    } else if (code === "invalid-record") {
      lines.push(translate(locale, "ui.governance.establishInvalidRecord"));
    } else {
      if (typeof code === "string" && code !== "") {
        lines.push(translate(locale, "ui.governance.errorCode", { code }));
      }
      lines.push(translate(locale, "ui.governance.noFilesWritten"));
    }
  } else if (typeof code === "string" && code !== "") {
    lines.push(translate(locale, "ui.governance.errorCode", { code }));
  }
  return {
    lines,
    noRetry: code === "already-established" || code === "invalid-record",
  };
}

export function governanceModelOptionText(
  model: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (model === "single") return translate(locale, "ui.governance.modelOption.single");
  if (model === "trio") return translate(locale, "ui.governance.modelOption.trio");
  return "";
}

export function governanceModelUnwiredText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.modelChoiceUnwired");
}

export function governanceModelSuggestText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.trioArtifactsHint");
}

/** 旧导出名保留为 zh-CN 常量，供未迁移调用方/测试逐字使用。 */
export const GOVERNANCE_MODEL_UNWIRED = governanceModelUnwiredText(DEFAULT_LOCALE);
export const GOVERNANCE_MODEL_SUGGEST = governanceModelSuggestText(DEFAULT_LOCALE);

// —————— 迁移预览（single → trio）——————

export function governanceMigrationText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.legacyModelHint");
}

export function governanceMigrationLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.migrationLabel");
}

export function governanceMigrationLabelPending(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.migrationPending");
}

export const GOVERNANCE_MIGRATION_TEXT = governanceMigrationText(DEFAULT_LOCALE);
export const GOVERNANCE_MIGRATION_LABEL = governanceMigrationLabel(DEFAULT_LOCALE);
export const GOVERNANCE_MIGRATION_LABEL_PENDING = governanceMigrationLabelPending(DEFAULT_LOCALE);

export function governanceMigrationButtonView(
  wired: boolean,
  locale: Locale = DEFAULT_LOCALE,
): {
  label: string;
  disabled: boolean;
  title: string;
} {
  return wired
    ? {
        label: governanceMigrationLabel(locale),
        disabled: false,
        title: translate(locale, "ui.governance.migrationOpenTitle"),
      }
    : {
        label: governanceMigrationLabelPending(locale),
        disabled: true,
        title: translate(locale, "ui.governance.migrationUnwired"),
      };
}

function migrationItemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : "";
    const oldHash = typeof record.oldSha256 === "string" ? record.oldSha256 : "";
    const newHash = typeof record.newSha256 === "string" ? record.newSha256 : "";
    if (path !== "" && (oldHash !== "" || newHash !== "")) {
      return path + "（" + shortHash(oldHash) + "… → " + shortHash(newHash) + "…）";
    }
    if (path !== "") return path;
    if (typeof record.message === "string" && record.message !== "") return record.message;
    try {
      return JSON.stringify(item);
    } catch {
      return "";
    }
  }
  return item == null ? "" : String(item);
}

export interface MigrationPreviewView {
  title: string;
  modelLine: string;
  writeLines: string[];
  modelFieldLine: string;
  manifestLine: string;
  pinLines: string[];
  retainedLines: string[];
  digestLine: string;
  warning: string;
  canConfirm: boolean;
  digest: string;
}

export function governanceMigrationPreviewView(
  preview: unknown,
  locale: Locale = DEFAULT_LOCALE,
): MigrationPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(migrationItemText).filter((item) => item !== "") : [];
  const model =
    governanceModelText(record.model, locale) ||
    (typeof record.model === "string" && record.model !== ""
      ? record.model
      : translate(locale, "ui.governance.migration.legacyModel"));
  const target =
    governanceModelText(record.targetModel, locale) ||
    (typeof record.targetModel === "string" && record.targetModel !== ""
      ? record.targetModel
      : translate(locale, "ui.governance.modelShort.trio"));
  const writePaths = listOf(record.writePaths);
  const pinChanges = listOf(record.pinChanges);
  const retainedFiles = listOf(record.retainedFiles);
  const digest = typeof record.snapshotDigest === "string" ? record.snapshotDigest : "";
  const notProvided = translate(locale, "shared.common.notProvided");
  const modelFieldText =
    record.modelField === null
      ? translate(locale, "ui.governance.migration.fieldMissing")
      : record.modelField === "single" || record.modelField === "trio"
        ? record.modelField
        : notProvided;
  return {
    title: translate(locale, "ui.governance.upgradePreview"),
    modelLine: translate(locale, "ui.governance.migration.modelLine", {
      from: model,
      to: target,
    }),
    writeLines: writePaths.length
      ? writePaths.map((path) =>
          translate(locale, "ui.governance.establishWritePath", { path }),
        )
      : [translate(locale, "ui.governance.establishWritePath", { path: notProvided })],
    modelFieldLine: translate(locale, "ui.governance.migration.modelField", {
      field: modelFieldText,
    }),
    manifestLine: translate(locale, "ui.governance.migration.manifestAppend", {
      id:
        typeof record.manifestLine === "string" && record.manifestLine !== ""
          ? record.manifestLine
          : notProvided,
    }),
    pinLines: pinChanges.length
      ? pinChanges.map((item) =>
          translate(locale, "ui.governance.migration.pinChange", { item }),
        )
      : [translate(locale, "ui.governance.migration.pinNoChange")],
    retainedLines: [
      translate(locale, "ui.governance.migration.retained", {
        files: retainedFiles.length
          ? retainedFiles.join(locale === "zh-CN" ? "、" : ", ")
          : translate(locale, "shared.common.none"),
      }),
    ],
    digestLine: translate(locale, "ui.governance.migration.digest", {
      digest: digest !== "" ? shortHash(digest) : notProvided,
    }),
    warning: translate(locale, "ui.governance.migration.zeroWrite"),
    canConfirm: digest !== "",
    digest,
  };
}

export function governanceMigrationSuccessText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.migration.success");
}

export function governanceMigrationFailureView(
  phase: unknown,
  status: unknown,
  message: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  const msg = typeof message === "string" ? message : "";
  if (msg !== "") lines.push(msg);
  const st = typeof status === "string" ? status : "";
  if (phase !== "write") {
    if (st === "already-trio") {
      lines.push(translate(locale, "ui.governance.migration.alreadyTrio"));
    } else if (st === "no-record") {
      lines.push(translate(locale, "ui.governance.migration.noRecord"));
    } else if (st === "blocked") {
      lines.push(translate(locale, "ui.governance.migration.blocked"));
    } else if (st === "preview-stale") {
      lines.push(translate(locale, "ui.governance.migration.previewStale"));
    } else if (st === "busy") {
      lines.push(translate(locale, "ui.governance.migration.busy"));
    } else if (st === "invalid-request") {
      lines.push(translate(locale, "ui.governance.migration.invalidRequest"));
    } else {
      if (st !== "") {
        lines.push(translate(locale, "ui.governance.migration.status", { status: st }));
      }
      // 同一句「本次未写入任何文件。」目录中只存在一个 key（reaccept 命名），复用为短句。
      lines.push(translate(locale, "ui.governance.reacceptNotWritten"));
    }
  } else if (st === "write-failed") {
    lines.push(translate(locale, "ui.governance.migration.writeFailed"));
  } else if (st !== "") {
    lines.push(translate(locale, "ui.governance.migration.status", { status: st }));
  }
  return {
    lines,
    noRetry: phase === "write" || st === "already-trio" || st === "no-record",
  };
}

// —————— 治理卡元信息 / 镜像 / 聚合 ——————

export function governanceDecisionBadge(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.decisionBadge");
}

export function governanceIntentBadge(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.intentBadge");
}

export function governanceQueueNote(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.queueNote");
}

export function governanceMirrorBadge(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.mirrorBadge");
}

export const GOVERNANCE_DECISION_BADGE = governanceDecisionBadge(DEFAULT_LOCALE);
export const GOVERNANCE_INTENT_BADGE = governanceIntentBadge(DEFAULT_LOCALE);
export const GOVERNANCE_QUEUE_NOTE = governanceQueueNote(DEFAULT_LOCALE);
export const GOVERNANCE_MIRROR_BADGE = governanceMirrorBadge(DEFAULT_LOCALE);

const GOVERNANCE_CARD_POWER_KEYS: Record<string, MessageKey> = {
  proposal: "ui.governance.power.proposal",
  appointment: "ui.governance.power.appointment",
  "appointment-write": "ui.governance.power.appointmentWrite",
  "schedule-write": "ui.governance.power.scheduleWrite",
  acceptance: "ui.governance.power.acceptance",
  "intent-confirm": "ui.governance.power.intentConfirm",
};

export interface GovernanceCardMeta {
  governance: boolean;
  badge: string;
  power: string;
  flowId: string;
  stepId: string;
  lines: string[];
}

/** 治理卡元信息（缺省不显示、不猜；appointment 权力标签按 2026-10-22 治理拆分更新为「任命」）。 */
export function governanceCardMetaView(
  request: unknown,
  locale: Locale = DEFAULT_LOCALE,
): GovernanceCardMeta {
  const req = request && typeof request === "object" ? (request as Record<string, unknown>) : {};
  const cardKind = typeof req.cardKind === "string" ? req.cardKind : "";
  const powerKey = GOVERNANCE_CARD_POWER_KEYS[cardKind];
  const power = powerKey === undefined ? "" : translate(locale, powerKey);
  const flowId = typeof req.flowId === "string" ? req.flowId : "";
  const stepId = typeof req.stepId === "string" ? req.stepId : "";
  const lines: string[] = [];
  if (flowId !== "") {
    lines.push(translate(locale, "ui.judge.flowText", { flowId }));
  }
  if (stepId !== "") {
    lines.push(translate(locale, "ui.governance.decisionLine.step", { stepId }));
  }
  if (power !== "") {
    lines.push(translate(locale, "ui.governance.decisionLine.power", { power }));
  }
  const paths = Array.isArray(req.paths)
    ? req.paths.filter((path): path is string => typeof path === "string" && path !== "")
    : [];
  for (const path of paths) {
    lines.push(translate(locale, "ui.governance.decisionLine.writePath", { path }));
  }
  if (typeof req.summary === "string" && req.summary !== "") {
    lines.push(translate(locale, "ui.governance.decisionLine.summary", { summary: req.summary }));
  }
  if (typeof req.artifactSha256 === "string" && req.artifactSha256 !== "") {
    lines.push(translate(locale, "ui.governance.decisionLine.hash", { sha256: req.artifactSha256 }));
  }
  return {
    governance: power !== "",
    badge:
      power === ""
        ? ""
        : cardKind === "intent-confirm"
          ? governanceIntentBadge(locale)
          : governanceDecisionBadge(locale),
    power,
    flowId,
    stepId,
    lines,
  };
}

export function governanceMirrorSourceLabel(
  sourceName: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const name =
    typeof sourceName === "string" && sourceName !== ""
      ? sourceName
      : translate(locale, "ui.governance.decisionSourceFallback");
  return translate(locale, "ui.governance.decisionTitle", { name });
}

export function governanceQueueAggregateText(
  count: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const n =
    typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return n > 0 ? translate(locale, "ui.governance.moreDecisions", { count: n }) : "";
}
