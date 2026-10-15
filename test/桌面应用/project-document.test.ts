import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_DOCUMENT_MAX_BYTES } from '../../src/model/project-document.ts';
import { createProjectDocumentFileReader, DocumentFileError } from '../../src/provider/project-document/public/file-reader.ts';
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-')); return {root,cleanup:()=>fs.rm(root,{recursive:true,force:true})}; }
test('B Model budget is raw bytes; Provider reads a checked local descriptor without changing bytes',async()=>{
 const f=await fixture();try { const p=createProjectDocumentFileReader();const root=await p.resolveRoot(f.root);const file=path.join(root,'a.md');const content=Buffer.alloc(PROJECT_DOCUMENT_MAX_BYTES,65);await fs.writeFile(file,content);const before=await fs.stat(file);assert.deepEqual(Buffer.from(await p.read(root,'a.md',PROJECT_DOCUMENT_MAX_BYTES)),content);const after=await fs.stat(file);assert.equal(after.mtimeMs,before.mtimeMs);await fs.appendFile(file,'x');await assert.rejects(p.read(root,'a.md',PROJECT_DOCUMENT_MAX_BYTES),(e:unknown)=>e instanceof DocumentFileError&&e.code==='TOO_LARGE');}finally{await f.cleanup();}
});
test('B Provider refuses unsupported platforms, lexical escapes, directories and symlinks',async()=>{
 const f=await fixture();try{await assert.rejects(createProjectDocumentFileReader({platform:'win32'}).resolveRoot(f.root),(e:unknown)=>e instanceof DocumentFileError&&e.code==='UNSUPPORTED_ENVIRONMENT');const p=createProjectDocumentFileReader();const root=await p.resolveRoot(f.root);await fs.writeFile(path.join(root,'a.md'),'a');await fs.symlink('a.md',path.join(root,'link.md'));await fs.mkdir(path.join(root,'dir.md'));for(const [rel,code] of [['../a.md','OUTSIDE_PROJECT'],['link.md','SYMLINK_NOT_ALLOWED'],['dir.md','NOT_FILE'],['missing.md','NOT_FOUND']] as const) await assert.rejects(p.read(root,rel,10),(e:unknown)=>e instanceof DocumentFileError&&e.code===code);}finally{await f.cleanup();}
});
test('B Provider detects check/open and opened/read file replacement and closes the original handle',async()=>{
 for(const phase of ['checked','opened','read'] as const){const f=await fixture();try{await fs.writeFile(path.join(f.root,'a.md'),'first');const p=createProjectDocumentFileReader({checkpoint:async(at,file)=>{if(at===phase){await fs.rename(file,file+'.old');await fs.writeFile(file,'other');}}});const root=await p.resolveRoot(f.root);await assert.rejects(p.read(root,'a.md',100),(e:unknown)=>e instanceof DocumentFileError&&e.code==='CHANGED_DURING_READ');}finally{await f.cleanup();}}
});

import { createProjectDocumentService } from '../../src/service/project-document/public/read-project-document.ts';
const roles = [{roleId:'A',builtIn:false,cardPath:'roles/A/role-card.md',changelogPath:'roles/A/changelog.md',docs:[{path:'docs/report.md',kind:'file' as const},{path:'docs/plain.txt',kind:'file' as const},{path:'docs/dir',kind:'directory' as const},{path:'docs/.env',kind:'file' as const},{path:'docs/bad.bin',kind:'file' as const}]}];
async function prepare(){const f=await fixture();await fs.mkdir(path.join(f.root,'roles/A/docs'),{recursive:true});await fs.writeFile(path.join(f.root,'roles/A/role-card.md'),'card');await fs.writeFile(path.join(f.root,'roles/A/docs/report.md'),'报告😀');return f;}
test('B Service issues opaque refs only after native grant, refresh revokes refs and scope switch rejects old requests',async()=>{
 const f=await prepare();const s=createProjectDocumentService();try{
  let view=s.updateListing(s.beginListing(f.root),f.root,roles);assert.equal(view.documentReadUnavailable,'PROJECT_NOT_GRANTED');
  await s.grantNativeSelection(f.root);view=s.updateListing(s.beginListing(f.root),f.root,roles);assert.ok(view.documentScope);assert.equal(view.documents.A.length,4);
  const ref=view.documents.A.find(d=>d.relativePath.endsWith('/report.md'))!;const req={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  const content=await s.read(req);assert.equal(content.ok,true);if(content.ok){assert.equal(content.text,'报告😀');assert.equal(content.byteLength,Buffer.byteLength('报告😀'));}
  assert.equal((await s.read({...req,path:'/etc/passwd'})).ok,false);
  const refresh=s.updateListing(s.beginListing(f.root),f.root,roles);assert.equal(refresh.documentScope?.projectViewId,ref.projectViewId);
  s.updateListing(s.beginListing(f.root),f.root,[{...roles[0],docs:[]}]);const removed=await s.read(req);assert.ok(!removed.ok);if(!removed.ok)assert.equal(removed.code,'NOT_LISTED');
  const switchToken=s.beginListing('/other');s.updateListing(switchToken,'/other',roles);const other=await s.read(req);assert.ok(!other.ok);if(!other.ok)assert.equal(other.code,'PROJECT_NOT_GRANTED');
  await s.grantNativeSelection(f.root);s.updateListing(s.beginListing(f.root),f.root,roles);const stale=await s.read(req);assert.ok(!stale.ok);if(!stale.ok)assert.equal(stale.code,'STALE_SCOPE');
 }finally{s.dispose();await f.cleanup();}
});
test('B Service fatal UTF8, binary, BOM, absent file and bounded failure classification',async()=>{
 const f=await prepare();const s=createProjectDocumentService();try{await s.grantNativeSelection(f.root);const view=s.updateListing(s.beginListing(f.root),f.root,roles);const ref=view.documents.A.find(d=>d.relativePath.endsWith('report.md'))!;const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  for(const [bytes,expected] of [[Buffer.from([0xc3]),'INVALID_UTF8'],[Buffer.from([65,0,66]),'BINARY_CONTENT'],[Buffer.alloc(PROJECT_DOCUMENT_MAX_BYTES+1,65),'TOO_LARGE']] as const){await fs.writeFile(path.join(f.root,ref.relativePath),bytes);const result=await s.read(request);assert.ok(!result.ok);if(!result.ok){assert.equal(result.code,expected);assert.equal(Object.hasOwn(result,'text'),false);}}
  await fs.writeFile(path.join(f.root,ref.relativePath),Buffer.from([0xef,0xbb,0xbf,65]));const bom=await s.read(request);assert.ok(bom.ok);if(bom.ok){assert.equal(bom.text,'A');assert.equal(bom.byteLength,4);}
  await fs.writeFile(path.join(f.root,ref.relativePath),'');const empty=await s.read(request);assert.ok(empty.ok);if(empty.ok)assert.equal(empty.text,'');
  await fs.unlink(path.join(f.root,ref.relativePath));const missing=await s.read(request);assert.ok(!missing.ok);if(!missing.ok)assert.equal(missing.code,'NOT_FOUND');
 }finally{s.dispose();await f.cleanup();}
});
test('B Service late read never returns content after scope revoke; provider failures are fixed safe messages',async()=>{
 let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(r=>{started=r});let reads=0;
 const s=createProjectDocumentService({fileReader:{newId:()=>String(++reads),resolveRoot:async r=>r,read:async()=>{started();await new Promise<void>(r=>{release=r});return new Uint8Array([65]);}}});
 await s.grantNativeSelection('/one');const view=s.updateListing(s.beginListing('/one'),'/one',roles);const ref=view.documents.A[0];const pending=s.read({version:1,projectViewId:ref.projectViewId,documentId:ref.documentId});await ready;const switchToken=s.beginListing('/two');s.updateListing(switchToken,'/two',roles);release();const late=await pending;assert.ok(!late.ok);if(!late.ok)assert.equal(late.code,'STALE_SCOPE');s.dispose();
 for(const code of ['PERMISSION_DENIED','IO_ERROR','UNSUPPORTED_ENVIRONMENT'] as const){const service=createProjectDocumentService({fileReader:{newId:()=>String(++reads),resolveRoot:async r=>r,read:async()=>{throw new DocumentFileError(code);}}});await service.grantNativeSelection('/one');const v=service.updateListing(service.beginListing('/one'),'/one',roles);const d=v.documents.A[0];const result=await service.read({version:1,projectViewId:d.projectViewId,documentId:d.documentId});assert.ok(!result.ok);if(!result.ok){assert.equal(result.code,code);assert.equal(result.message.includes('/one'),false);}service.dispose();}
});

import { createProjectDocumentReader } from '../../src/pipeline/project-document/read-project-document.ts';
test('B Pipeline preserves trusted native grant and close sequencing over the real Service',async()=>{const f=await prepare();const reader=createProjectDocumentReader();try{await reader.grantNativeSelection(f.root);const listing=reader.updateListing(reader.beginListing(f.root),f.root,roles);const d=listing.documents.A[0];reader.dispose();const result=await reader.read({version:1,projectViewId:d.projectViewId,documentId:d.documentId});assert.ok(!result.ok);if(!result.ok)assert.equal(result.code,'PROJECT_NOT_ACTIVE');}finally{await f.cleanup();}});

test('B Provider rejects symlink parents, escaped links and root replacement after grant',async()=>{
 const f=await prepare();const outside=await fixture();try{const p=createProjectDocumentFileReader();const root=await p.resolveRoot(f.root);await fs.writeFile(path.join(outside.root,'x.md'),'outside');await fs.symlink(outside.root,path.join(root,'escape'));await assert.rejects(p.read(root,'escape/x.md',100),(e:unknown)=>e instanceof DocumentFileError&&e.code==='SYMLINK_NOT_ALLOWED');
 await fs.rename(root,root+'.old');await fs.mkdir(root);await fs.writeFile(path.join(root,'x.md'),'replacement');await assert.rejects(p.read(root,'x.md',100),(e:unknown)=>e instanceof DocumentFileError&&e.code==='CHANGED_DURING_READ');await fs.rm(root+'.old',{recursive:true,force:true});}finally{await f.cleanup();await outside.cleanup();}
});
test('B Provider detects in-place growth and parent directory replacement around a descriptor read',async()=>{
 for(const mode of ['grow','parent'] as const){const f=await prepare();try{const p=createProjectDocumentFileReader({checkpoint:async(phase,file)=>{if(phase!=='read')return;if(mode==='grow')await fs.appendFile(file,'growth');else{const parent=path.dirname(file);await fs.rename(parent,parent+'.old');await fs.mkdir(parent);await fs.writeFile(file,'new');}}});const root=await p.resolveRoot(f.root);await assert.rejects(p.read(root,'roles/A/docs/report.md',100),(e:unknown)=>e instanceof DocumentFileError&&e.code==='CHANGED_DURING_READ');}finally{await f.cleanup();}}
});
test('B refs cannot be minted for hidden, unknown formats or lexical escape listing entries',async()=>{
 const f=await prepare();const service=createProjectDocumentService();try{await service.grantNativeSelection(f.root);const view=service.updateListing(service.beginListing(f.root),f.root,[{...roles[0],docs:[...roles[0].docs,...['docs/../../secret.md','docs/sub/../bad.md','docs/sub\\secret.md','docs/C:secret.md'].map(p=>({path:p,kind:'file' as const}))]}]);assert.deepEqual(view.documents.A.map(d=>d.label).sort(),['changelog.md','plain.txt','report.md','role-card.md']);for(const request of [null,{version:2,projectViewId:'x',documentId:'x'},{version:1,projectViewId:'x',documentId:''}]){const result=await service.read(request);assert.ok(!result.ok);if(!result.ok)assert.equal(result.code,'INVALID_REQUEST');}}finally{service.dispose();await f.cleanup();}
});
test('B actual preload exports only the restricted document invoke shape',async()=>{
 const vm=await import('node:vm');let api:any;const calls:unknown[]=[];const text=await fs.readFile(new URL('../../app/preload.cjs',import.meta.url),'utf8');
 vm.runInNewContext(text,{require:(name:string)=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(_name:string,value:unknown)=>{api=value;}},ipcRenderer:{invoke:(...args:unknown[])=>{calls.push(args);return Promise.resolve({ok:false});}}};}});
 const request={version:1,projectViewId:'scope',documentId:'doc'};await api.readProjectDocument(request);assert.deepEqual(calls,[['project:document-read',request]]);assert.equal(api.fs,undefined);assert.equal(api.require,undefined);
});

test('B out-of-order listings and root-grant failure cannot publish stale or unsupported refs',async()=>{
 const service=createProjectDocumentService({fileReader:{newId:()=> 'opaque',resolveRoot:async r=>r,read:async()=>new Uint8Array()}});
 await service.grantNativeSelection('/one');const old=service.beginListing('/one');const current=service.beginListing('/two');assert.equal(service.updateListing(old,'/one',roles).documentReadUnavailable,'STALE_SCOPE');assert.equal(service.updateListing(current,'/two',roles).documentReadUnavailable,'PROJECT_NOT_GRANTED');service.dispose();
 const unsupported=createProjectDocumentService({fileReader:{newId:()=> 'unused',resolveRoot:async()=>{throw new DocumentFileError('UNSUPPORTED_ENVIRONMENT');},read:async()=>{throw new Error('must not read');}}});await unsupported.grantNativeSelection('/one');const view=unsupported.updateListing(unsupported.beginListing('/one'),'/one',roles);assert.equal(view.documentReadUnavailable,'UNSUPPORTED_ENVIRONMENT');assert.equal(view.documentScope,undefined);unsupported.dispose();
});


test('B failed/cancelled native imports retain active refs until a successful listing commits',async()=>{
 const a=await prepare();const b=await prepare();const service=createProjectDocumentService();
 try{
  await service.grantNativeSelection(a.root);const av=service.updateListing(service.beginListing(a.root),a.root,roles);const ref=av.documents.A.find(d=>d.label==='report.md')!;const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  await service.grantNativeSelection(b.root);
  assert.equal((await service.read(request)).ok,true,'native selection is pending, not an active-scope commit');
  const pending=service.beginListing(b.root);
  assert.equal((await service.read(request)).ok,true,'beginning a listing that fails preserves the visible project');
  service.cancelNativeSelection();
  assert.equal((await service.read(request)).ok,true,'cancel preserves A and clears the pending grant');
  assert.equal(service.updateListing(pending,b.root,roles).documentReadUnavailable,'STALE_SCOPE','late result from cancelled import cannot commit');
  const refresh=service.updateListing(service.beginListing(a.root),a.root,roles);assert.equal(refresh.documentScope?.projectViewId,av.documentScope?.projectViewId);
  const ungranted=service.updateListing(service.beginListing(b.root),b.root,roles);assert.equal(ungranted.documentReadUnavailable,'PROJECT_NOT_GRANTED','cancelled B grant cannot authorize a later renderer-only import');
  const old=await service.read(request);assert.ok(!old.ok,'a successful import to an ungranted project still revokes A');
  await service.grantNativeSelection(b.root);const bv=service.updateListing(service.beginListing(b.root),b.root,roles);assert.ok(bv.documentScope);const stale=await service.read(request);assert.ok(!stale.ok);if(!stale.ok)assert.equal(stale.code,'STALE_SCOPE');
 }finally{service.dispose();await a.cleanup();await b.cleanup();}
});

test('B a newer native selection invalidates an older listing without revoking the active project',async()=>{
 let id=0;const service=createProjectDocumentService({fileReader:{newId:()=>String(++id),resolveRoot:async root=>root,read:async()=>new Uint8Array([65])}});
 try{await service.grantNativeSelection('/a');const view=service.updateListing(service.beginListing('/a'),'/a',roles);const ref=view.documents.A[0];const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
 await service.grantNativeSelection('/b');const older=service.beginListing('/b');await service.grantNativeSelection('/c');assert.equal(service.updateListing(older,'/b',roles).documentReadUnavailable,'STALE_SCOPE');assert.equal((await service.read(request)).ok,true);
 const current=service.updateListing(service.beginListing('/c'),'/c',roles);assert.ok(current.documentScope);const stale=await service.read(request);assert.ok(!stale.ok);if(!stale.ok)assert.equal(stale.code,'STALE_SCOPE');
 }finally{service.dispose();}
});
