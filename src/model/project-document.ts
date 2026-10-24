/** Restricted document contract B/2. No IO or authority derived from display paths. */
export const PROJECT_DOCUMENT_MAX_BYTES = 262144;
/** Role root documents exposed read-only; the array order is the fixed display order. */
export const ROLE_ROOT_DOC_FILENAMES = ['feature-map.md', 'functional-description.md', 'api-spec.md'] as const;
export type RoleRootDocName = (typeof ROLE_ROOT_DOC_FILENAMES)[number];
export type DocumentFormat = 'markdown' | 'text';
export type DocumentReadErrorCode = 'INVALID_REQUEST' | 'PROJECT_NOT_GRANTED' | 'PROJECT_NOT_ACTIVE' | 'STALE_SCOPE' | 'UNKNOWN_DOCUMENT' | 'NOT_LISTED' | 'OUTSIDE_PROJECT' | 'SYMLINK_NOT_ALLOWED' | 'NOT_FOUND' | 'NOT_FILE' | 'UNSUPPORTED_FORMAT' | 'INVALID_UTF8' | 'BINARY_CONTENT' | 'TOO_LARGE' | 'PERMISSION_DENIED' | 'CHANGED_DURING_READ' | 'UNSUPPORTED_ENVIRONMENT' | 'IO_ERROR';
export interface ProjectDocumentScope { version: 1; projectViewId: string; projectRoot: string }
export interface ProjectDocumentRef { version: 1; projectViewId: string; documentId: string; roleId: string; relativePath: string; label: string; format: DocumentFormat }
export interface ReadProjectDocumentRequest { version: 1; projectViewId: string; documentId: string }
export type ReadProjectDocumentResult =
 | { ok: true; version: 1; projectViewId: string; documentId: string; roleId: string; relativePath: string; format: DocumentFormat; text: string; byteLength: number }
 | { ok: false; version: 1; projectViewId?: string; documentId?: string; code: DocumentReadErrorCode; message: string };
/** Trusted Interface listing, never accepted from document-read IPC. */
export interface ProjectDocumentRoleCandidates {
 /** cardPath/changelogPath are project-relative; docs.path is relative to the role-card directory (docs/x.md). */
 roleId: string; builtIn: boolean; cardPath: string; changelogPath?: string; docs: readonly { path: string; kind: 'file' | 'directory' }[];
 /** Project-relative paths; only roleDir + "/" + ROLE_ROOT_DOC_FILENAMES entry is accepted. */
 rootDocs?: readonly { path: string; kind: 'file' }[] }
export interface ProjectDocumentListing { documentScope?: ProjectDocumentScope; documents: Record<string, ProjectDocumentRef[]>; documentReadUnavailable?: DocumentReadErrorCode }
