import type { DocumentReadErrorCode } from '../../../model/project-document.ts';
export class DocumentFileError extends Error {
  readonly code: DocumentReadErrorCode;
  constructor(code: DocumentReadErrorCode) { super(code); this.code = code; }
}
export interface ProjectDocumentFileReader {
  newId(): string;
  resolveRoot(root: string): Promise<string>;
  read(root: string, relativePath: string, limit: number): Promise<Uint8Array>;
}
export interface ProjectDocumentFileReaderOptions {
  /** Controlled race/IO probes for owner tests; never supplied by IPC. */
  checkpoint?: (phase: 'checked' | 'opened' | 'read', absolutePath: string) => void | Promise<void>;
  platform?: string;
}
