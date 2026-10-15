import { PROJECT_DOCUMENT_MAX_BYTES, type DocumentReadErrorCode, type ProjectDocumentRef, type ProjectDocumentRoleCandidates, type ProjectDocumentScope, type ProjectDocumentListing, type ReadProjectDocumentResult } from '../../../model/project-document.ts';
import type { ProjectDocumentReader } from '../abstract/document-reader.ts';
import { DocumentFileError, type ProjectDocumentFileReader } from '../../../provider/project-document/public/file-reader.ts';
import { isAbsoluteAny, normalizeLexical } from '../../../common/shared/path-primitives.ts';

const messages: Record<DocumentReadErrorCode,string> = {
 INVALID_REQUEST:'文档读取请求无效。',PROJECT_NOT_GRANTED:'请先通过选择目录导入此项目。',PROJECT_NOT_ACTIVE:'当前没有可阅读的导入项目。',STALE_SCOPE:'项目已切换，请从当前资料重新打开。',UNKNOWN_DOCUMENT:'无法识别此文档引用。',NOT_LISTED:'此文档已不在当前资料清单中。',OUTSIDE_PROJECT:'文档路径不在允许的项目范围内。',SYMLINK_NOT_ALLOWED:'不支持通过符号链接阅读文档。',NOT_FOUND:'文档不存在。',NOT_FILE:'此项不是普通文档文件。',UNSUPPORTED_FORMAT:'只支持 UTF-8 Markdown 或纯文本文件。',INVALID_UTF8:'文档不是有效的 UTF-8 文本。',BINARY_CONTENT:'不支持读取二进制内容。',TOO_LARGE:'文档超过 256 KiB 阅读上限。',PERMISSION_DENIED:'没有权限读取此文档。',CHANGED_DURING_READ:'文档在读取过程中发生变化，请重新打开。',UNSUPPORTED_ENVIRONMENT:'当前平台或文件系统不支持此受限阅读方式。',IO_ERROR:'文档读取失败。',
};
function eligible(rel: string): boolean {
 return !!rel && !isAbsoluteAny(rel) && !rel.includes('\\') && !rel.includes(':') && !rel.includes('\0') && normalizeLexical(rel) === rel && rel.split('/').every(p=>!!p&&!p.startsWith('.'));
}
function format(rel: string) { return /\.md$/i.test(rel)?'markdown' as const:/\.txt$/i.test(rel)?'text' as const:undefined; }
export function buildProjectDocumentReader(provider: ProjectDocumentFileReader): ProjectDocumentReader {
 let generation=0, sequence=0, listingRoot='', activeRoot='', disposed=false;
 type Grant = {selectedRoot:string;realRoot?:string;error?:DocumentReadErrorCode};
 let grant: Grant|undefined;
 let pendingGrant: Grant|undefined;
 const matches = (candidate: Grant|undefined, root: string) => !!candidate && (root===candidate.selectedRoot || root===candidate.realRoot);
 let scope: ProjectDocumentScope|undefined;
 let refs=new Map<string,ProjectDocumentRef>(), ids=new Map<string,string>();
 const revoked=new Set<string>();
 const reset=()=>{scope=undefined;refs.clear();ids.clear();revoked.clear();};
 function failure(code:DocumentReadErrorCode, fields:{projectViewId?:string;documentId?:string}={}):ReadProjectDocumentResult { return {ok:false,version:1,...fields,code,message:messages[code]}; }
 return {
  async grantNativeSelection(root){
   if(disposed)return;
   const token=++generation;sequence++;pendingGrant={selectedRoot:root};
   try{const realRoot=await provider.resolveRoot(root);if(!disposed&&generation===token)pendingGrant={selectedRoot:root,realRoot};}
   catch(e){if(!disposed&&generation===token)pendingGrant={selectedRoot:root,error:e instanceof DocumentFileError?e.code:'IO_ERROR'};}
  },
  cancelNativeSelection(){generation++;if(matches(pendingGrant,listingRoot))sequence++;pendingGrant=undefined;},
  beginListing(root){listingRoot=root;return ++sequence;},
  updateListing(token,root,roles):ProjectDocumentListing {
   const documents:Record<string,ProjectDocumentRef[]> = Object.create(null);
   if(disposed||token!==sequence||root!==listingRoot)return {documents,documentReadUnavailable:'STALE_SCOPE'};
   // A successful listing is the commit point. Failed/cancelled imports never revoke the visible project.
   const selected = matches(pendingGrant,root) ? pendingGrant : undefined;
   const nextGrant = selected ?? (matches(grant,root) ? grant : undefined);
   if(activeRoot!==root || nextGrant!==grant){reset();activeRoot=root;grant=nextGrant;}
   if(selected)pendingGrant=undefined;
   if(!grant||(root!==grant.selectedRoot&&root!==grant.realRoot))return {documents,documentReadUnavailable:'PROJECT_NOT_GRANTED'};
   if(!grant.realRoot)return {documents,documentReadUnavailable:grant.error??'PROJECT_NOT_GRANTED'};
   if(!scope)scope={version:1,projectViewId:provider.newId(),projectRoot:root};
   const next=new Map<string,ProjectDocumentRef>();
   for(const role of roles){
    documents[role.roleId]=[];if(role.builtIn||!eligible(role.cardPath))continue;
    const dir=role.cardPath.slice(0,Math.max(0,role.cardPath.lastIndexOf('/')));
    if(!dir)continue;
    const paths=[role.cardPath,...(role.changelogPath===dir+'/changelog.md'?[role.changelogPath]:[]),...role.docs.filter(d=>d.kind==='file'&&d.path.startsWith('docs/')).map(d=>dir+'/'+d.path)];
    for(const rel of new Set(paths)){
     const fmt=format(rel);if(!eligible(rel)||!fmt)continue;
     const key=role.roleId+'\0'+rel;const documentId=ids.get(key)??provider.newId();ids.set(key,documentId);
     const ref:ProjectDocumentRef={version:1,projectViewId:scope.projectViewId,documentId,roleId:role.roleId,relativePath:rel,label:rel.slice(rel.lastIndexOf('/')+1),format:fmt};
     next.set(documentId,ref);documents[role.roleId].push(ref);revoked.delete(documentId);
    }
   }
   for(const id of refs.keys())if(!next.has(id))revoked.add(id);
   refs=next;
   return {documentScope:{...scope},documents};
  },
  async read(request){
   if(!request||typeof request!=='object'||Array.isArray(request))return failure('INVALID_REQUEST');
   const r=request as Record<string,unknown>;
   if(Object.keys(r).some(k=>!['version','projectViewId','documentId'].includes(k))||r.version!==1||typeof r.projectViewId!=='string'||!r.projectViewId||typeof r.documentId!=='string'||!r.documentId)return failure('INVALID_REQUEST');
   const fields={projectViewId:r.projectViewId,documentId:r.documentId};
   if(disposed||!activeRoot)return failure('PROJECT_NOT_ACTIVE',fields);
   if(!grant||(activeRoot!==grant.selectedRoot&&activeRoot!==grant.realRoot))return failure('PROJECT_NOT_GRANTED',fields);
   if(!scope)return failure(grant.error??'PROJECT_NOT_ACTIVE',fields);
   if(r.projectViewId!==scope.projectViewId)return failure('STALE_SCOPE',fields);
   const ref=refs.get(r.documentId);if(!ref)return failure(revoked.has(r.documentId)?'NOT_LISTED':'UNKNOWN_DOCUMENT',fields);
   const epoch=scope;const capturedGrant=grant;
   try{
    const bytes=await provider.read(grant.realRoot!,ref.relativePath,PROJECT_DOCUMENT_MAX_BYTES);
    if(disposed||scope!==epoch||grant!==capturedGrant||!refs.has(ref.documentId))return failure('STALE_SCOPE',fields);
    if(bytes.includes(0))return failure('BINARY_CONTENT',fields);
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return failure('INVALID_UTF8',fields);}
    return {ok:true,version:1,...fields,roleId:ref.roleId,relativePath:ref.relativePath,format:ref.format,text,byteLength:bytes.byteLength};
   }catch(e){if(disposed||scope!==epoch||grant!==capturedGrant)return failure('STALE_SCOPE',fields);return failure(e instanceof DocumentFileError?e.code:'IO_ERROR',fields);}
  },
  dispose(){disposed=true;generation++;sequence++;activeRoot='';grant=undefined;pendingGrant=undefined;reset();},
 };
}
