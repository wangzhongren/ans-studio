/**
 * 文档只读纯逻辑（Phase 4A）：错误码→人话、相对/外部链接解析、
 * 读取请求/回包形状与 scope/version 校验、可重试判定。无 DOM/无 IPC。
 *
 * 渲染侧只拿 `documentScope` 与 opaque `documentId/projectViewId`；
 * 不接收 root/路径/URL，不构造文件系统路径。
 *
 * i18n B2：展示文案来自 shared `ui.document.*`/`ui.documentView.*`，纯函数接受
 * 可选 `locale`（默认 zh-CN）。错误码、路径、文档 id 是机器值，不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export interface DocumentScope {
  version: number;
  projectViewId: string;
  projectRoot?: string;
}

export interface DocumentRef {
  version?: number;
  projectViewId: string;
  documentId: string;
  roleId: string;
  relativePath: string;
  label: string;
  format: "markdown" | "text" | string;
}

export interface DocumentReadRequest {
  version: 1;
  projectViewId: string;
  documentId: string;
}

export interface DocumentReadResult {
  ok: true;
  version: number;
  projectViewId: string;
  documentId: string;
  roleId: string;
  relativePath: string;
  format: "markdown" | "text" | string;
  byteLength: number;
  text: string;
}

export type DocumentReadValidation =
  | { ok: true; result: DocumentReadResult }
  | { ok: false; code: string };

/** 错误码 → 既有文案（与旧 `Rt.documentError` 逐字一致；纯展示映射）。 */
const DOCUMENT_ERROR_KEYS: Record<string, MessageKey> = {
  INVALID_REQUEST: "ui.document.error.invalidRequest",
  PROJECT_NOT_GRANTED: "ui.document.error.projectNotGranted",
  PROJECT_NOT_ACTIVE: "ui.document.error.projectNotActive",
  STALE_SCOPE: "ui.document.error.staleScope",
  UNKNOWN_DOCUMENT: "ui.document.error.unknownDocument",
  NOT_LISTED: "ui.document.error.notListed",
  OUTSIDE_PROJECT: "ui.document.error.outsideProject",
  SYMLINK_NOT_ALLOWED: "ui.document.error.symlinkNotAllowed",
  NOT_FOUND: "ui.document.error.notFound",
  NOT_FILE: "ui.document.error.notFile",
  UNSUPPORTED_FORMAT: "ui.document.error.unsupportedFormat",
  INVALID_UTF8: "ui.document.error.invalidUtf8",
  BINARY_CONTENT: "ui.document.error.binaryContent",
  TOO_LARGE: "ui.document.error.tooLarge",
  PERMISSION_DENIED: "ui.document.error.permissionDenied",
  CHANGED_DURING_READ: "ui.document.error.changedDuringRead",
  UNSUPPORTED_ENVIRONMENT: "ui.document.error.unsupportedEnvironment",
  IO_ERROR: "ui.document.error.ioError",
};

export function documentErrorText(
  code: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = typeof code === "string" ? DOCUMENT_ERROR_KEYS[code] : undefined;
  return translate(locale, key ?? "ui.document.error.fallback");
}

/** 角色 listing 里已列出的可读文档（opaque 引用；畸形条目丢弃，不猜路径）。 */
export function roleDocumentRefs(role: unknown): DocumentRef[] {
  const record = asRecord(role);
  const list = Array.isArray(record.documents) ? record.documents : [];
  const refs: DocumentRef[] = [];
  for (const item of list) {
    const ref = asRecord(item);
    const documentId = asString(ref.documentId);
    const projectViewId = asString(ref.projectViewId);
    const relativePath = asString(ref.relativePath);
    const roleId = asString(ref.roleId);
    if (!documentId || !projectViewId || !relativePath || !roleId) continue;
    refs.push({
      version: typeof ref.version === "number" ? ref.version : 1,
      projectViewId,
      documentId,
      roleId,
      relativePath,
      label: asString(ref.label) || relativePath,
      format: asString(ref.format) || "markdown",
    });
  }
  return refs;
}

export function documentReadableRef(
  ref: DocumentRef | null | undefined,
  scope: DocumentScope | null,
): boolean {
  if (!ref || !scope) return false;
  if (typeof scope.projectViewId !== "string" || scope.projectViewId === "") return false;
  return ref.projectViewId === scope.projectViewId && ref.documentId !== "";
}

export function documentReadRequest(
  ref: DocumentRef | null | undefined,
  scope: DocumentScope | null,
): DocumentReadRequest | null {
  if (!documentReadableRef(ref, scope) || !ref || !scope) return null;
  return {
    version: 1,
    projectViewId: scope.projectViewId,
    documentId: ref.documentId,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * 回包校验（旧 `readDocument` 同口径）：version=1、projectViewId/documentId 精确回显、
 * roleId 与请求 ref 一致、format ∈ markdown|text、text 为字符串；否则 INVALID_REQUEST。
 */
export function validateDocumentReadResult(
  raw: unknown,
  request: DocumentReadRequest | null,
  ref: DocumentRef | null | undefined,
  scope: DocumentScope | null,
): DocumentReadValidation {
  if (!request || !ref || !scope) return { ok: false, code: "INVALID_REQUEST" };
  const record = asRecord(raw);
  if (record.version !== 1) return { ok: false, code: "INVALID_REQUEST" };
  const projectViewId = asString(record.projectViewId);
  const documentId = asString(record.documentId);
  if (projectViewId && projectViewId !== request.projectViewId) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (documentId && documentId !== request.documentId) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (record.ok === true) {
    const format = asString(record.format);
    if (
      record.projectViewId !== request.projectViewId ||
      record.documentId !== request.documentId ||
      asString(record.roleId) !== ref.roleId ||
      (format !== "markdown" && format !== "text") ||
      typeof record.text !== "string"
    ) {
      return { ok: false, code: "INVALID_REQUEST" };
    }
    return {
      ok: true,
      result: {
        ok: true,
        version: 1,
        projectViewId: request.projectViewId,
        documentId: request.documentId,
        roleId: ref.roleId,
        relativePath: asString(record.relativePath) || ref.relativePath,
        format,
        byteLength: typeof record.byteLength === "number" ? record.byteLength : 0,
        text: record.text,
      },
    };
  }
  return { ok: false, code: asString(record.code) || "IO_ERROR" };
}

export type DocumentLinkResolution =
  | { kind: "external"; url: string }
  | { kind: "internal"; ref: DocumentRef }
  | { kind: "unavailable" }
  | { kind: "none" };

const DOCUMENT_BASE = "https://document.invalid/";

/**
 * 文档内链接解析（旧 `onDocumentAction` 同口径）：
 * http(s) ⇒ 外部打开；相对链接按当前文档相对路径解析，命中已列文档 ⇒ 内部打开；
 * 其余（含 javascript:/data: 与未命中的相对路径）⇒ unavailable（如实提示无阅读入口）。
 */
export function resolveDocumentLink(
  href: unknown,
  baseRelativePath: string,
  refs: readonly DocumentRef[],
): DocumentLinkResolution {
  const value = asString(href).trim();
  if (value === "") return { kind: "none" };
  if (/^https?:\/\//i.test(value)) return { kind: "external", url: value };
  let resolvedPath = "";
  try {
    const resolved = new URL(value, DOCUMENT_BASE + (baseRelativePath || ""));
    if (resolved.origin === DOCUMENT_BASE.replace(/\/$/, "")) {
      resolvedPath = decodeURIComponent(resolved.pathname.slice(1));
    }
  } catch {
    resolvedPath = "";
  }
  if (resolvedPath) {
    const target = refs.find((ref) => ref.relativePath === resolvedPath);
    if (target) return { kind: "internal", ref: target };
  }
  return { kind: "unavailable" };
}

export function canRetryDocument(code: unknown): boolean {
  return (
    code === "IO_ERROR" ||
    code === "CHANGED_DURING_READ" ||
    code === "NOT_FOUND" ||
    code === "PERMISSION_DENIED"
  );
}

export function documentStatusText(
  result: DocumentReadResult | null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return result
    ? translate(locale, "ui.document.readonlyMeta", { bytes: result.byteLength })
    : "";
}

export function documentReadingText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.reading");
}

export function documentUnlistedText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.unlisted");
}

export function documentEmptyText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.empty");
}

export function documentListNote(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.pickHint");
}

export function documentBackRoleText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.queueSubview.backRole");
}

export function documentBackListText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.backList");
}

export function documentRefreshText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.refresh");
}

export function documentReadText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.document.read");
}

export function documentRetryText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "shared.common.retryRead");
}

export function documentSourceTitle(
  roleName: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.document.sourceTitle", {
    roleName: roleName || translate(locale, "shared.common.role"),
  });
}
