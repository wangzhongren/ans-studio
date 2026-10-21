/**
 * 文档只读纯逻辑（Phase 4A）：错误码→人话、相对/外部链接解析、
 * 读取请求/回包形状与 scope/version 校验、可重试判定。无 DOM/无 IPC。
 *
 * 渲染侧只拿 `documentScope` 与 opaque `documentId/projectViewId`；
 * 不接收 root/路径/URL，不构造文件系统路径。
 */

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
const DOCUMENT_ERRORS: Record<string, string> = {
  INVALID_REQUEST: "文档请求无效。",
  PROJECT_NOT_GRANTED: "尚未获得当前项目的文档读取许可，请重新选择项目文件夹。",
  PROJECT_NOT_ACTIVE: "该项目不是当前项目。",
  STALE_SCOPE: "项目文档列表已失效，请返回当前项目重新选择。",
  UNKNOWN_DOCUMENT: "文档引用未知。",
  NOT_LISTED: "该文档已不在可读清单中。",
  OUTSIDE_PROJECT: "该文件不在当前项目允许的阅读范围。",
  SYMLINK_NOT_ALLOWED: "符号链接文档不可读取。",
  NOT_FOUND: "文档不存在。",
  NOT_FILE: "该引用不是普通文件。",
  UNSUPPORTED_FORMAT: "此文档格式暂不支持。",
  INVALID_UTF8: "文档不是有效UTF-8文本。",
  BINARY_CONTENT: "文档包含二进制内容，不能预览。",
  TOO_LARGE: "文档超过256KiB，无法在此预览。",
  PERMISSION_DENIED: "没有读取此文档的权限。",
  CHANGED_DURING_READ: "读取期间文档发生变化，请重新选择。",
  UNSUPPORTED_ENVIRONMENT: "当前环境暂不支持安全读取项目文档。",
  IO_ERROR: "文档读取失败。",
};

export function documentErrorText(code: unknown): string {
  const key = typeof code === "string" ? code : "";
  return DOCUMENT_ERRORS[key] || "无法读取此文档。";
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

export function documentStatusText(result: DocumentReadResult | null): string {
  return result ? "只读文档 · " + result.byteLength + " 字节" : "";
}

export const DOCUMENT_READING_TEXT = "正在读取文档…";
export const DOCUMENT_UNLISTED_TEXT = "此链接尚未提供阅读入口。";
export const DOCUMENT_EMPTY_TEXT = "该角色当前没有已列出的可读文档。";
export const DOCUMENT_LIST_NOTE =
  "以下是当前项目中该角色已列出的可读文档，请选择要阅读的文件。";
export const DOCUMENT_SOURCE_TITLE_SUFFIX = " · 来源文档";
export const DOCUMENT_BACK_ROLE_TEXT = "返回角色资料";
export const DOCUMENT_BACK_LIST_TEXT = "返回来源文档";
export const DOCUMENT_REFRESH_TEXT = "刷新已列文档";
export const DOCUMENT_READ_TEXT = "阅读";
export const DOCUMENT_RETRY_TEXT = "重试读取";

export function documentSourceTitle(roleName: string): string {
  return (roleName || "角色") + DOCUMENT_SOURCE_TITLE_SUFFIX;
}
