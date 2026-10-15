import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,appendFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createRuntimeAdapter,readRuntimeSessionHistory,projectRuntimeLiveHandback} from '../../src/service/runtime/session.ts';
import {createRuntimeSessionStore} from '../../src/provider/runtime/session-store.ts';
import {createEventQueue} from '../../src/common/runtime-core/event-queue.ts';
import {RuntimeDeliveryError} from '../../src/model/runtime.ts';
import type {RuntimeProviderFactory,RuntimeProviderOptions,PromptOptions,SessionEvent,RuntimeReportSnapshotV1,RuntimeInputProvenanceV1,ReportSaveResultV1} from '../../src/model/runtime.ts';
import {allow,role,registerControlledDisplayProfile,until} from './fixtures.ts';
const temp=()=>mkdtemp(path.join(os.tmpdir(),'ans-core-c-'));
async function fixture(root:string,id:string,persist=true){
 let received!:RuntimeProviderOptions;let calls=0;const native:{text:string;options?:PromptOptions}[]=[];
 const factory:RuntimeProviderFactory=options=>{registerControlledDisplayProfile(options);received=options;return{async composeContext(){return{systemPrompt:'fixture'};},async bindRole(){const queue=createEventQueue<SessionEvent>();return{async prompt(text,opts){calls++;native.push({text,options:opts});queue.push({kind:'message',summary:'native response'});queue.push({kind:'settled',summary:'done'});},events:()=>queue.stream,async dispose(){queue.close();}};}};};
 const session=await createRuntimeAdapter({runtime:'codex',gate:allow,projectRoot:root,skillRoot:root,persistSession:persist,extraCredentialEnvVars:['CORE_TEST_FAKE_SECRET'],providerFactories:{codex:factory}}).bindRole(role(id));
 const events:SessionEvent[]=[];const done=(async()=>{for await(const event of session.events())events.push(event);})();
 return{session,received,native,events,get calls(){return calls;},async close(){await session.dispose();await done;}};
}
async function seed(root:string){
 const f=await fixture(root,'source');let turn='';await f.session.prompt('work',{onTurnStarted:m=>{turn=m.turnId;}});
 const draft={source:{roleId:'source',runtime:'codex' as const,turnId:turn},taskId:'task-actual',origin:'submitted-report' as const,status:'completed' as const,summary:'summary fake-c-secret',evidence:['test evidence'],at:new Date().toISOString()};
 const saved=await f.session.persistence!.recordFinalReport(draft);assert.equal(saved.ok,true);if(!saved.ok)throw Error('seed failed');return{...f,draft,report:saved.report};
}
const provenance=(report:RuntimeReportSnapshotV1,target='target'):RuntimeInputProvenanceV1=>({version:1,kind:'handback',deliveryId:randomUUID(),attemptId:randomUUID(),target:{roleId:target,runtime:'codex'},reports:[report]});

test('actual bound mode, final source identity, idempotent safe report save and conflict are independent of model execution',async()=>{
 const root=await temp();process.env.CORE_TEST_FAKE_SECRET='fake-c-secret';
 try{
  const f=await seed(root);assert.equal(f.session.persistence?.mode,'enabled');assert.equal(f.calls,1);assert.equal(f.report.summary.text,'summary [REDACTED]');
  const again=await f.session.persistence!.recordFinalReport(f.draft);assert.equal(again.ok,true);if(again.ok)assert.equal(again.state,'already-saved');
  const conflict=await f.session.persistence!.recordFinalReport({...f.draft,summary:'different final report'});assert.equal(conflict.ok,false);if(!conflict.ok)assert.equal(conflict.code,'CONFLICT');
  const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'source',runtime:'codex',credentialEnvNames:['CORE_TEST_FAKE_SECRET']});assert.equal(history.reports?.length,1);assert.ok(!JSON.stringify(history.reports).includes('fake-c-secret'));
  const unknown=await f.session.persistence!.recordFinalReport({...f.draft,source:{...f.draft.source,turnId:randomUUID()}});assert.equal(unknown.ok,false);assert.equal(f.calls,1);await f.close();
  assert.equal((await f.session.persistence!.getReportPersistence(f.report.reportId)).state,'expired');
 }finally{delete process.env.CORE_TEST_FAKE_SECRET;await rm(root,{recursive:true,force:true});}
});

test('source retry only saves the first frozen snapshot, duplicate clicks share one operation and disposal expires it',async()=>{
 const root=await temp();try{
  const f=await fixture(root,'source');let turn='';await f.session.prompt('work',{onTurnStarted:m=>{turn=m.turnId;}});
  const original=f.received.storage!.saveReport!;let saves=0;let unblock!:()=>void;
  f.received.storage!.saveReport=async report=>{saves++;if(saves===1)throw Error('disk failed');await new Promise<void>(resolve=>{unblock=resolve;});return original(report);};
  const result=await f.session.persistence!.recordFinalReport({source:{roleId:'source',runtime:'codex',turnId:turn},taskId:null,origin:'terminal-fallback',status:'unreported',summary:'no valid report',evidence:[],at:new Date().toISOString()});
  assert.equal(result.ok,false);if(result.ok)throw Error();assert.equal(result.retryAvailable,true);assert.ok(result.reportId);
  const one=f.session.persistence!.retryReportPersistence(result.reportId!);const two=f.session.persistence!.retryReportPersistence(result.reportId!);assert.equal(one,two);await until(()=>!!unblock);unblock();assert.equal((await one).ok,true);assert.equal(saves,2);assert.equal(f.calls,1);
  const again=await f.session.persistence!.retryReportPersistence(result.reportId!);assert.equal(again.ok,true);assert.equal(saves,2);
  await f.close();const expired=await f.session.persistence!.retryReportPersistence(result.reportId!);assert.equal(expired.ok,false);if(!expired.ok)assert.equal(expired.code,'SNAPSHOT_EXPIRED');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('target stores safe text but Provider receives original model text and images; final receipt survives a new handle',async()=>{
 const root=await temp();process.env.CORE_TEST_FAKE_SECRET='fake-c-secret';try{
  const source=await seed(root);const target=await fixture(root,'target');const p=provenance(source.report);const images=[{type:'image' as const,data:'image-sentinel',mimeType:'image/png'}];const raw='model raw fake-c-secret --password "hidden value" '+ '中'.repeat(9000);
  const progress:string[]=[];await target.session.prompt(raw,{images,inputProvenance:p,onDeliveryProgress:event=>{progress.push(event.stage);throw Error('observer only');}});
  assert.equal(target.calls,1);assert.equal(target.native[0].text,raw);assert.equal(target.native[0].options?.images,images);assert.deepEqual(Object.keys(target.native[0].options!),['images']);
  assert.deepEqual(progress,['turn-created','input-saved','provider-may-start','settled']);
  const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'target',runtime:'codex',credentialEnvNames:['CORE_TEST_FAKE_SECRET']});
  const user=history.entries.find(x=>x.kind==='user')!;assert.equal(user.inputTextProjection?.modelInputRecorded,false);assert.equal(user.inputTextProjection?.redacted,true);assert.equal(user.inputTextProjection?.truncated,true);assert.ok(Buffer.byteLength(user.text!)<=16384);
  assert.ok(!JSON.stringify(history).includes('fake-c-secret'));assert.ok(!JSON.stringify(history).includes('hidden value'));assert.ok(!JSON.stringify(history).includes('image-sentinel'));
  const receipt=await target.session.persistence!.getDeliveryReceipt(p.attemptId);assert.equal(receipt.state,'known');if(receipt.state==='known'){assert.equal(receipt.receipt.inputSaved,true);assert.equal(receipt.receipt.providerMayHaveStarted,true);assert.equal(receipt.receipt.history,'saved');assert.notEqual(receipt.receipt.turnId,source.draft.source.turnId);}
  await assert.rejects(target.session.prompt(raw,{inputProvenance:p}),e=>e instanceof RuntimeDeliveryError&&e.receipt.code==='ATTEMPT_ALREADY_STARTED');assert.equal(target.calls,1);
  await target.close();const reopened=await fixture(root,'target');const after=await reopened.session.persistence!.getDeliveryReceipt(p.attemptId);assert.equal(after.state,'known');if(after.state==='known'){assert.equal(after.receipt.history,'saved');assert.equal(after.receipt.retryHistoryAvailable,false);}assert.equal(reopened.calls,0);await reopened.close();await source.close();
 }finally{delete process.env.CORE_TEST_FAKE_SECRET;await rm(root,{recursive:true,force:true});}
});

for(const phase of ['user','boundary','index'] as const)test(`ACK is not delivery: ${phase} failure has exact Provider count and history retry never invokes it`,async()=>{
 const root=await temp();try{
  const source=await seed(root);const target=await fixture(root,'target');const p=provenance(source.report);let fail=true;let ack=0;
  if(phase==='index'){const original=target.received.storage!.saveSession;target.received.storage!.saveSession=async record=>{if(fail){fail=false;throw Error('index failure');}return original(record);};}
  else{const original=target.received.storage!.appendReplay;target.received.storage!.appendReplay=async entries=>{if(fail&&entries.some(e=>phase==='user'?e.kind==='user':(e.event?.detail as {source?:string}|undefined)?.source==='delivery-boundary')){fail=false;throw Error('append failure');}return original(entries);};}
  let failure:RuntimeDeliveryError|undefined;try{await target.session.prompt('model input',{inputProvenance:p,onTurnStarted(){ack++;}});}catch(e){assert.ok(e instanceof RuntimeDeliveryError);failure=e;}
  assert.ok(failure);assert.equal(ack,1);assert.equal(target.calls,phase==='index'?1:0);assert.equal(failure!.receipt.providerMayHaveStarted,phase==='index');assert.equal(failure!.receipt.history,'failed');assert.equal(failure!.receipt.retryHistoryAvailable,true);
  const before=target.calls;const result=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(result.ok,true);assert.equal(target.calls,before);
  const second=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(second.ok,true);if(second.ok)assert.equal(second.state,'already-saved');
  const entries=await target.received.storage!.readReplay();const ids=entries.map(e=>e.entryId).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  await target.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('partial replay is not silently repaired or replayed; later foreign records also block repair',async()=>{
 const root=await temp();try{
  const source=await seed(root);const target=await fixture(root,'target');const p=provenance(source.report);const original=target.received.storage!.appendReplay;let fail=true;
  target.received.storage!.appendReplay=async entries=>{if(fail&&entries.some(x=>x.kind==='user')){fail=false;await original(entries);await appendFile(path.join(target.received.storage!.directory,'ans/replay.jsonl'),'{partial');throw Error('partial write');}return original(entries);};
  await assert.rejects(target.session.prompt('text',{inputProvenance:p}),e=>e instanceof RuntimeDeliveryError&&e.receipt.code==='REPLAY_DAMAGED');assert.equal(target.calls,0);
  const file=path.join(target.received.storage!.directory,'ans/replay.jsonl');const before=await readFile(file);const result=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(result.ok,false);assert.deepEqual(await readFile(file),before);assert.equal(target.calls,0);await target.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('disabled bound mode does not create directories; live-only views do not become durable report snapshots',async()=>{
 const root=await temp();try{
  const f=await fixture(root,'memory',false);assert.equal(f.session.persistence?.mode,'disabled');await f.session.prompt('plain');
  const live=projectRuntimeLiveHandback({source:{roleId:'legacy'},taskId:'actual-task',status:'completed',summary:'safe result',evidence:[],at:new Date().toISOString()});assert.equal(live.taskId,'actual-task');assert.ok(!('reportId' in live));
  await f.session.prompt('live handback',{inputPresentation:{version:1,kind:'handback-live',durability:'unknown-live',reports:[live]}});assert.equal(f.calls,2);assert.deepEqual(await readdir(root),[]);
  const result=await f.session.persistence!.recordFinalReport({source:{roleId:'memory',runtime:'codex',turnId:'known'},taskId:null,origin:'submitted-report',status:'completed',summary:'report',evidence:[],at:new Date().toISOString()});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.state,'disabled');assert.deepEqual(await readdir(root),[]);await f.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('live optional delivery identity is all-or-none and target-bound; disabled mode has real in-memory receipts without directories',async()=>{
 const root=await temp();try{
  const target=await fixture(root,'memory',false);const view=projectRuntimeLiveHandback({source:{roleId:'legacy'},taskId:'real-task',status:'completed',summary:'live',evidence:[],at:new Date().toISOString()});
  const base={version:1 as const,kind:'handback-live' as const,durability:'memory-only' as const,reports:[view]};
  await target.session.prompt('legacy all absent',{inputPresentation:base});assert.equal(target.calls,1);
  const deliveryId=randomUUID(),attemptId=randomUUID();const linked={...base,deliveryId,attemptId,target:{roleId:'memory',runtime:'codex' as const}};
  await target.session.prompt('linked live',{inputPresentation:linked});assert.equal(target.calls,2);
  const receipt=await target.session.persistence!.getDeliveryReceipt(attemptId);assert.equal(receipt.state,'known');if(receipt.state==='known'){assert.equal(receipt.receipt.history,'disabled');assert.equal(receipt.receipt.providerMayHaveStarted,true);assert.equal(receipt.receipt.inputSaved,false);}
  await assert.rejects(target.session.prompt('partial',{inputPresentation:{...base,attemptId:randomUUID()}}),error=>error instanceof Error&&(error as Error&{code?:string}).code==='INVALID');
  await assert.rejects(target.session.prompt('partial known attempt',{inputPresentation:{...base,attemptId}}),error=>error instanceof RuntimeDeliveryError&&error.receipt.code==='INVALID'&&error.receipt.providerMayHaveStarted===true);
  await assert.rejects(target.session.prompt('wrong target',{inputPresentation:{...linked,attemptId:randomUUID(),target:{roleId:'elsewhere',runtime:'codex'}}}),e=>e instanceof RuntimeDeliveryError&&e.receipt.code==='INVALID');
  await assert.rejects(target.session.prompt('duplicate',{inputPresentation:linked}),e=>e instanceof RuntimeDeliveryError&&e.receipt.code==='ATTEMPT_ALREADY_STARTED');assert.equal(target.calls,2);assert.deepEqual(await readdir(root),[]);await target.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('foreign later replay records block history repair without altering the replay or invoking Provider again',async()=>{
 const root=await temp();try{
  const source=await seed(root),target=await fixture(root,'target');const p=provenance(source.report);const save=target.received.storage!.saveSession;let fail=true;
  target.received.storage!.saveSession=async record=>{if(fail){fail=false;throw Error('index');}return save(record);};
  await assert.rejects(target.session.prompt('target',{inputProvenance:p}),RuntimeDeliveryError);assert.equal(target.calls,1);
  await target.received.storage!.appendReplay([{kind:'user',at:'later',text:'independent later record',turnId:'later'}]);
  const file=path.join(target.received.storage!.directory,'ans/replay.jsonl');const before=await readFile(file);const r=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'REPLAY_CHANGED');assert.deepEqual(await readFile(file),before);assert.equal(target.calls,1);await target.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('no final receipt cannot be reconstructed from boundary or nearby settled after reopening',async()=>{
 const root=await temp();try{
  const source=await seed(root),target=await fixture(root,'target');const p=provenance(source.report);const append=target.received.storage!.appendReplay;
  target.received.storage!.appendReplay=async entries=>{if(entries.some(e=>(e.event?.detail as {source?:string}|undefined)?.source==='delivery-receipt'))throw Error('final receipt failed');return append(entries);};
  await assert.rejects(target.session.prompt('target',{inputProvenance:p}),RuntimeDeliveryError);assert.equal(target.calls,1);await target.close();
  const reopened=await fixture(root,'target');const result=await reopened.session.persistence!.getDeliveryReceipt(p.attemptId);assert.equal(result.state,'known');if(result.state==='known'){assert.equal(result.receipt.code,'RECEIPT_UNAVAILABLE');assert.equal(result.receipt.outcome,undefined);assert.equal(result.receipt.providerMayHaveStarted,true);assert.equal(result.receipt.retryDeliveryAllowed,false);}await reopened.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('128 detailed receipt bound does not forget seen disabled attempts or re-execute one after eviction',async()=>{
 const root=await temp();try{
  const target=await fixture(root,'memory',false);const view=projectRuntimeLiveHandback({source:{roleId:'legacy'},taskId:null,status:'completed',summary:'live',evidence:[],at:new Date().toISOString()});
  let first:PromptOptions['inputPresentation'];
  for(let i=0;i<129;i++){const inputPresentation={version:1 as const,kind:'handback-live' as const,durability:'memory-only' as const,reports:[view],deliveryId:randomUUID(),attemptId:randomUUID(),target:{roleId:'memory',runtime:'codex' as const}};first??=inputPresentation;await target.session.prompt('work',{inputPresentation});}
  assert.equal(target.calls,129);assert.equal((await target.session.persistence!.getDeliveryReceipt(first!.attemptId!)).state,'expired');
  await assert.rejects(target.session.prompt('again',{inputPresentation:first}),e=>e instanceof RuntimeDeliveryError&&e.receipt.code==='ATTEMPT_ALREADY_STARTED');assert.equal(target.calls,129);assert.deepEqual(await readdir(root),[]);await target.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('16MiB frozen recovery budget expires oldest failed source snapshots rather than keeping unbounded material',async()=>{
 const root=await temp();try{
  const source=await fixture(root,'source');source.received.storage!.saveReport=async()=>{throw Error('persistent disk failure');};let firstId='';let expired=0;
  source.session.persistence!.onPersistenceChange(event=>{if(event.kind==='report-save'&&event.state.state==='expired')expired++;});
  for(let i=0;i<215;i++){let turn='';await source.session.prompt('work',{onTurnStarted:metadata=>{turn=metadata.turnId;}});const report=await source.session.persistence!.recordFinalReport({source:{roleId:'source',runtime:'codex',turnId:turn},taskId:null,origin:'submitted-report',status:'completed',summary:'s'.repeat(16384),evidence:Array.from({length:32},()=> 'e'.repeat(2048)),at:new Date().toISOString()});assert.equal(report.ok,false);if(!report.ok){firstId ||= report.reportId!;}}
  assert.ok(expired>0);const retry=await source.session.persistence!.retryReportPersistence(firstId);assert.equal(retry.ok,false);if(!retry.ok)assert.equal(retry.code,'SNAPSHOT_EXPIRED');assert.equal(source.calls,215);await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an ambiguously successful final receipt write is idempotently confirmed, not appended twice',async()=>{
 const root=await temp();try{
  const source=await seed(root),target=await fixture(root,'target');const p=provenance(source.report);const append=target.received.storage!.appendReplay;let fail=true;
  target.received.storage!.appendReplay=async entries=>{await append(entries);if(fail&&entries.some(e=>(e.event?.detail as {source?:string}|undefined)?.source==='delivery-receipt')){fail=false;throw Error('error after completed append');}};
  await assert.rejects(target.session.prompt('target',{inputProvenance:p}),RuntimeDeliveryError);assert.equal(target.calls,1);
  const result=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(result.ok,true);assert.equal(target.calls,1);
  assert.equal((await target.received.storage!.readReplay()).filter(e=>(e.event?.detail as {source?:string}|undefined)?.source==='delivery-receipt').length,1);await target.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('unknown persisted C versions do not become a final receipt or permit a new automatic attempt',async()=>{
 const root=await temp();try{
  const target=await fixture(root,'target');const id=randomUUID();await target.received.storage!.appendReplay([{at:'now',kind:'event',turnId:'recorded-turn',event:{kind:'message',summary:'future receipt',runtime:'codex',roleId:'target',turnId:'recorded-turn',detail:{source:'delivery-receipt',version:2,receipt:{version:2,attemptId:id}}}}]);await target.close();
  const reopened=await fixture(root,'target');const q=await reopened.session.persistence!.getDeliveryReceipt(id);assert.equal(q.state,'unsupported');if(q.state==='unsupported')assert.equal(q.code,'UNSUPPORTED_VERSION');assert.equal(reopened.calls,0);await reopened.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('unknown report file versions are listed as read errors and not silently upgraded',async()=>{
 const root=await temp();try{
  const f=await seed(root);const file=path.join(f.received.storage!.directory,'ans/reports',f.report.reportId+'.json');const {writeFile}=await import('node:fs/promises');await writeFile(file,JSON.stringify({...f.report,version:2}));
  const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'source',runtime:'codex'});assert.equal(history.reports?.length??0,0);assert.equal(history.reportErrors?.length,1);assert.equal(JSON.parse(await readFile(file,'utf8')).version,2);await f.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('public live and report projections whitelist values rather than carrying arbitrary sidecars',()=>{
 const value=projectRuntimeLiveHandback({source:{roleId:'legacy',raw:'DO_NOT_COPY'},taskId:null,status:'completed',summary:'visible',evidence:[],at:new Date().toISOString(),raw:'DO_NOT_COPY'} as unknown as Parameters<typeof projectRuntimeLiveHandback>[0]);
 assert.ok(!JSON.stringify(value).includes('DO_NOT_COPY'));
});

test('same-attempt known execution is monotonic even if the replay becomes an unreadable directory',async()=>{
 const root=await temp();try{
  const source=await seed(root),target=await fixture(root,'target');const p=provenance(source.report);const index=target.received.storage!.saveSession;let replace=true;
  target.received.storage!.saveSession=async record=>{if(replace){replace=false;const {rename,mkdir}=await import('node:fs/promises');const file=path.join(target.received.storage!.directory,'ans/replay.jsonl');await rename(file,file+'.backup');await mkdir(file);throw Error('history unavailable after actual model call');}return index(record);};
  let first!:RuntimeDeliveryError;try{await target.session.prompt('model input',{inputProvenance:p});}catch(error){assert.ok(error instanceof RuntimeDeliveryError);first=error;}
  assert.equal(target.calls,1);assert.equal(first.receipt.providerMayHaveStarted,true);assert.equal(first.receipt.outcome,'completed');assert.equal(first.receipt.retryDeliveryAllowed,false);
  const retry=await target.session.persistence!.retryDeliveryHistoryPersistence(p.attemptId);assert.equal(retry.ok,false);assert.equal(target.calls,1);
  let repeated!:RuntimeDeliveryError;try{await target.session.prompt('same input',{inputProvenance:p});}catch(error){assert.ok(error instanceof RuntimeDeliveryError);repeated=error;}
  assert.equal(repeated.receipt.providerMayHaveStarted,true);assert.equal(repeated.receipt.outcome,'completed');assert.equal(repeated.receipt.turnId,first.receipt.turnId);assert.equal(repeated.receipt.retryDeliveryAllowed,false);assert.equal(target.calls,1);await target.close();await source.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('reopened live-only delivery uses its actual user/turn record for inputSaved without claiming durable source reports',async()=>{
 const root=await temp();try{
  const target=await fixture(root,'target');const view=projectRuntimeLiveHandback({source:{roleId:'legacy'},taskId:null,status:'completed',summary:'live only',evidence:[],at:new Date().toISOString()});const attemptId=randomUUID();
  const presentation={version:1 as const,kind:'handback-live' as const,durability:'unknown-live' as const,reports:[view],deliveryId:randomUUID(),attemptId,target:{roleId:'target',runtime:'codex' as const}};
  const append=target.received.storage!.appendReplay;target.received.storage!.appendReplay=async entries=>{if(entries.some(entry=>(entry.event?.detail as {source?:string}|undefined)?.source==='delivery-receipt'))throw Error('no final receipt');return append(entries);};
  await assert.rejects(target.session.prompt('actual model input',{inputPresentation:presentation}),RuntimeDeliveryError);assert.equal(target.calls,1);await target.close();
  const reopened=await fixture(root,'target');const receipt=await reopened.session.persistence!.getDeliveryReceipt(attemptId);assert.equal(receipt.state,'known');if(receipt.state==='known'){assert.equal(receipt.receipt.inputSaved,true);assert.equal(receipt.receipt.history,'pending');assert.equal(receipt.receipt.providerMayHaveStarted,true);assert.equal(receipt.receipt.outcome,undefined);}
  const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'target',runtime:'codex'});assert.ok(!JSON.stringify(history).includes('live only'));assert.ok(history.entries.some(entry=>entry.kind==='user'&&!entry.inputProvenance));await reopened.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
