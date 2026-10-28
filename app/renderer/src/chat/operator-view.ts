/**
 * operator 请求 / 镜像面 / 排队聚合的纯逻辑（Phase 4B）。
 *
 * 只按主进程载荷事实转写：`mirrorRoleId` 缺省/相同 ⇒ 单面；`queued === true` ⇒
 * 排队态（不可作答）；计数只按当前项目×引擎的唯一 id。不合并、不代答、不重排。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import { governanceCardMetaView, type GovernanceCardMeta } from "./card-meta.ts";

export interface OperatorPayloadLike {
  id?: unknown;
  roleId?: unknown;
  mirrorRoleId?: unknown;
  projectRoot?: unknown;
  runtime?: unknown;
  queued?: unknown;
  waitingFor?: unknown;
  anchorKey?: unknown;
  turnId?: unknown;
  toolCallId?: unknown;
  request?: unknown;
}

export function asOperatorRecord(value: unknown): OperatorPayloadLike {
  return value && typeof value === "object" ? (value as OperatorPayloadLike) : {};
}

export function operatorRequestId(payload: unknown): string {
  const record = asOperatorRecord(payload);
  return typeof record.id === "string" ? record.id : "";
}

/** 源面角色（只信 payload；缺省返回空串——不回落「当前查看角色」）。 */
export function operatorSourceRoleId(payload: unknown): string {
  const record = asOperatorRecord(payload);
  return typeof record.roleId === "string" ? record.roleId : "";
}

/** 镜像面角色：显式给出且不同于源面才成立；缺省/相同 ⇒ null（不猜）。 */
export function operatorMirrorRoleId(payload: unknown): string | null {
  const record = asOperatorRecord(payload);
  const roleId = operatorSourceRoleId(payload);
  const mirror = typeof record.mirrorRoleId === "string" ? record.mirrorRoleId : "";
  return mirror !== "" && mirror !== roleId ? mirror : null;
}

/** 全部呈现面（源面在前；镜像面去重追加）。 */
export function operatorSurfaces(payload: unknown): string[] {
  const roleId = operatorSourceRoleId(payload);
  const surfaces = roleId ? [roleId] : [];
  const mirror = operatorMirrorRoleId(payload);
  if (mirror && surfaces.indexOf(mirror) < 0) surfaces.push(mirror);
  return surfaces;
}

/** 请求是否处于排队态（payload 或 request 自带 queued；缺省 false = 可作答）。 */
export function operatorQueued(payload: unknown): boolean {
  const record = asOperatorRecord(payload);
  const request =
    record.request && typeof record.request === "object"
      ? (record.request as Record<string, unknown>)
      : {};
  return record.queued === true || request.queued === true;
}

/** 可见性指针：请求的所有呈现面都不是当前查看角色。 */
export function operatorOutsideView(payload: unknown, selectedRoleId: string | null): boolean {
  const surfaces = operatorSurfaces(payload);
  if (surfaces.length === 0) return false;
  return !selectedRoleId || surfaces.indexOf(selectedRoleId) < 0;
}

export interface OperatorCardMeta extends GovernanceCardMeta {}

export function operatorCardMeta(
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE,
): OperatorCardMeta {
  const record = asOperatorRecord(payload);
  return governanceCardMetaView(record.request, locale);
}

/**
 * 排队计数范围：当前项目×当前引擎；显式 projectRoot/runtime 必须精确相等，
 * 缺省视为当前视图（与信封路由同口径）。同一 id 只计一次（对象键天然去重）。
 */
export function queuedCountForView(
  queued: Record<string, Record<string, unknown>>,
  projectRoot: string | null,
  runtime: string,
): number {
  let count = 0;
  for (const payload of Object.values(queued)) {
    const record = payload || {};
    const payloadRoot = typeof record.projectRoot === "string" ? record.projectRoot : "";
    if (payloadRoot !== "" && payloadRoot !== projectRoot) continue;
    const payloadRuntime = typeof record.runtime === "string" ? record.runtime : "";
    if (payloadRuntime !== "" && payloadRuntime !== runtime) continue;
    count += 1;
  }
  return count;
}

/** 排队 id 列表（插入序；只读，供 `queuedDebug` 与断言）。 */
export function queuedIds(
  queued: Record<string, Record<string, unknown>>,
): string[] {
  return Object.keys(queued);
}

/**
 * 未决请求的种类（PM §十七 / P7）：只按呈现面聚合，源面与镜像面看到同一事实。
 * 任一未决 `choice` ⇒「待选择」；否则（confirm 等）⇒「等待你确认」；无未决 ⇒ null。
 * 这里不返回数量：状态标签只表达种类；数量仍只由 `.ti-count` 承担。
 */
export function pendingKindFor(
  pending: Record<string, Record<string, unknown>>,
  roleId: string,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (!roleId) return null;
  let found = false;
  let hasChoice = false;
  for (const payload of Object.values(pending || {})) {
    if (operatorSurfaces(payload).indexOf(roleId) < 0) continue;
    found = true;
    const record = asOperatorRecord(payload);
    const request =
      record.request && typeof record.request === "object"
        ? (record.request as Record<string, unknown>)
        : {};
    if (request.kind === "choice") hasChoice = true;
  }
  if (!found) return null;
  return translate(
    locale,
    hasChoice ? "ui.work.kind.choice" : "ui.status.label.waitingConfirm",
  );
}

const FINAL_NOTE_KEYS = {
  confirm: "ui.operator.result.confirm",
  deny: "ui.operator.result.deny",
  cancel: "ui.operator.result.cancel",
  submit: "ui.operator.result.submit",
} as const;

/** 终态说明（作答成功；过期/失败另有文案）。 */
export function operatorFinalNote(
  decision: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const record =
    decision && typeof decision === "object"
      ? (decision as Record<string, unknown>)
      : {};
  if (record.kind === "confirm") {
    return translate(
      locale,
      record.confirmed === true ? FINAL_NOTE_KEYS.confirm : FINAL_NOTE_KEYS.deny,
    );
  }
  if (record.kind === "choice") {
    if (record.cancelled === true) return translate(locale, FINAL_NOTE_KEYS.cancel);
    return translate(locale, FINAL_NOTE_KEYS.submit);
  }
  return translate(locale, FINAL_NOTE_KEYS.submit);
}

export function operatorSubmittingNote(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.operator.submitting");
}

export function operatorExpiredNote(
  reason: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const text = typeof reason === "string" && reason !== "" ? reason : "";
  return text
    ? translate(locale, "ui.operator.expiredWithReason", { reason: text })
    : translate(locale, "ui.operator.expiredRetry");
}

/** 作答失败的可见原因（可重试；请求仍 open）。 */
export function operatorRetryNote(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.operator.retryFailed", {
    detail:
      typeof error === "string" && error !== ""
        ? error
        : String(error ?? translate(locale, "ui.chatStore.operatorChannelNotAccepted")),
  });
}

/** 旧导出名（zh-CN 值），供未迁移调用方逐字使用。 */
export const OPERATOR_SUBMITTING_NOTE = operatorSubmittingNote(DEFAULT_LOCALE);
export const OPERATOR_EXPIRED_NOTE = translate(DEFAULT_LOCALE, "ui.operator.expired");

/** 同一 id 是否已由可操作卡/镜像面呈现（排队聚合不重复计数）。 */
export function queuedWithoutPresented(
  queued: Record<string, Record<string, unknown>>,
  pending: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [id, payload] of Object.entries(queued)) {
    if (!pending[id]) result[id] = payload;
  }
  return result;
}
