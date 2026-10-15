import type { ProjectDocumentRoleCandidates, ProjectDocumentListing, ReadProjectDocumentResult } from '../../../model/project-document.ts';
export interface ProjectDocumentReader {
 grantNativeSelection(root: string): Promise<void>;
 cancelNativeSelection(): void;
 beginListing(root: string): number;
 updateListing(sequence: number, root: string, roles: readonly ProjectDocumentRoleCandidates[]): ProjectDocumentListing;
 read(request: unknown): Promise<ReadProjectDocumentResult>;
 dispose(): void;
}
