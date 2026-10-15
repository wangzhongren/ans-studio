import test from 'node:test';import assert from 'node:assert/strict';
import { projectRuntimeLegacyHistory } from '../../src/service/runtime/session.ts';
import type { RuntimeLegacyHistoryEntryV1 } from '../../src/model/runtime.ts';
const anchor={token:'legacy-anchor-v1:'+ 'a'.repeat(64),position:'request' as const,nativeCallId:'real-call'};
test('native-only values are protected without a provider, retain real IDs/token and keep reader counts separate',()=>{
  const entries:RuntimeLegacyHistoryEntryV1[]=[{kind:'user-text',text:'password="secret words"',anchor},{kind:'assistant-text',text:'ordinary assistant'},{kind:'tool-record',text:'actual result',tool:{toolName:'read_file',phase:'result',toolCallId:'real-call',turnId:'real-turn',target:{kind:'path',value:'actual.txt',source:'tool-detail'}}}];
  const r=projectRuntimeLegacyHistory({scope:{roleId:'core',runtime:'pi'},readOk:true,entries,skipped:3,source:'password=FILE_SECRET',error:'Bearer ERROR_SECRET'});
  assert.equal(r.ok,true);if(!r.ok)return;
  assert.equal(r.reader.skipped,3);assert.equal(r.projection.omittedEntries,0);assert.equal(r.entries[0].anchor?.nativeCallId,'real-call');assert.equal(r.entries[0].anchor?.token,anchor.token);
  assert.equal(r.entries[2].kind,'tool-record');if(r.entries[2].kind==='tool-record'){assert.equal(r.entries[2].tool.turnId,'real-turn');assert.equal(r.entries[2].tool.display?.process,undefined);}
  for(const value of ['secret words','FILE_SECRET','ERROR_SECRET'])assert.ok(!JSON.stringify(r).includes(value));
});
test('raw title anchors and invalid dates are omitted; no turn/call or execution is inferred from body',()=>{
  const r=projectRuntimeLegacyHistory({scope:{roleId:'core',runtime:'pi'},readOk:true,entries:[{kind:'tool-record',at:'not-a-time',anchor:{token:'confirm\0RAW_TITLE',position:'request'},text:'run_shell 已执行：secret command（exit 7）',tool:{toolName:'run_shell',phase:'result',reportedStatus:'failed',statusSource:'legacy-classifier'}}],skipped:0});
  assert.equal(r.ok,true);if(!r.ok)return;const e=r.entries[0];assert.equal(e.anchor,undefined);assert.equal(e.at,undefined);assert.ok(!JSON.stringify(r).includes('RAW_TITLE'));if(e.kind==='tool-record'){assert.equal(e.tool.toolCallId,undefined);assert.equal(e.tool.display?.process,undefined);assert.equal(e.tool.target,undefined);}
});
test('return budget selects a continuous recent suffix, preserves order and reports omissions',()=>{
  const entries:RuntimeLegacyHistoryEntryV1[]=Array.from({length:300},(_,i)=>({kind:'user-text',text:`${i}:`+'中😀'.repeat(5000)}));
  const r=projectRuntimeLegacyHistory({scope:{roleId:'core',runtime:'pi'},readOk:true,entries,skipped:2});assert.equal(r.ok,true);if(!r.ok)return;
  assert.ok(Buffer.byteLength(JSON.stringify(r))<=1048576);assert.ok(r.projection.omittedEntries>0);assert.equal(r.projection.omittedEntries+r.entries.length,300);assert.ok(r.entries[0].text.text.startsWith(`${r.projection.omittedEntries}:`));assert.ok(r.entries.at(-1)?.text.text.startsWith('299:'));
});
test('reader failure and malformed bridge are distinct and cannot raw-fallback',()=>{
  const fail=projectRuntimeLegacyHistory({scope:{roleId:'core',runtime:'pi'},readOk:false,entries:[{kind:'user-text',text:'DO_NOT_SHOW'}],skipped:0,error:'read failed'});assert.equal(fail.ok,true);if(fail.ok){assert.equal(fail.reader.ok,false);assert.deepEqual(fail.entries,[]);}
  assert.equal(projectRuntimeLegacyHistory({scope:{roleId:'',runtime:'pi'},readOk:true,entries:[],skipped:0}).ok,false);
});
