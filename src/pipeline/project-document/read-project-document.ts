import { createProjectDocumentService, type ProjectDocumentReader } from '../../service/project-document/public/read-project-document.ts';
/** Only public Service capabilities cross this boundary; no IO or permission registry here. */
export function createProjectDocumentReader(): ProjectDocumentReader {
 const service=createProjectDocumentService();
 return {
  grantNativeSelection: root=>service.grantNativeSelection(root),
  cancelNativeSelection: ()=>service.cancelNativeSelection(),
  beginListing: root=>service.beginListing(root),
  updateListing: (sequence,root,roles)=>service.updateListing(sequence,root,roles),
  read: request=>service.read(request),
  dispose: ()=>service.dispose(),
 };
}
