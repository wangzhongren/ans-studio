import { createProjectDocumentFileReader, type ProjectDocumentFileReader } from '../../../provider/project-document/public/file-reader.ts';
import { buildProjectDocumentReader } from '../impl/read-project-document.ts';
export type { ProjectDocumentReader } from '../abstract/document-reader.ts';
export function createProjectDocumentService(options: { fileReader?: ProjectDocumentFileReader } = {}) { return buildProjectDocumentReader(options.fileReader??createProjectDocumentFileReader()); }
