import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolDisplayContext, coreToolTarget } from '../../src/common/runtime-core/tool-display.ts';
import type { ToolEventDetailV1, RuntimeToolEventFactsV1 } from '../../src/model/runtime.ts';
const detail=(event:ReturnType<ReturnType<typeof createToolDisplayContext>['projectToolEvent']>)=>event.detail as ToolEventDetailV1;
const source=(extra:Partial<RuntimeToolEventFactsV1> = {})=>({phase:'result' as const,origin:'handler-result' as const,toolName:'run_shell',toolCallId:'call-1',turnId:'turn-1',result:{ok:false,message:'exit failed',execution:{exitCode:7,stdout:'中文😀',stderr:'error'}},...extra}) as RuntimeToolEventFactsV1;

test('real fields survive projection; nonzero exit is not parsed from message, block is a separate fact',()=>{
  const context=createToolDisplayContext();
  const event=context.projectToolEvent(source({input:{rule:'core-command-v1',args:{command:'node -v',body:'DO_NOT_COPY',preview:'DO_NOT_COPY'}}}));
  assert.equal(event.kind,'denied');assert.equal(detail(event).phase,'result');
  assert.equal(detail(event).display?.target?.value.text,'node -v');
  assert.equal(detail(event).display?.process?.exitCode,7);assert.equal(detail(event).display?.process?.stdout?.text,'中文😀');
  assert.ok(!JSON.stringify(event).includes('DO_NOT_COPY'));
  const noStructure=context.projectToolEvent(source({result:{ok:false,message:'exit 98 stdout: fabricated structure'}}));
  assert.equal(detail(noStructure).display?.process,undefined);
  const blocked=context.projectToolEvent({toolName:'run_shell',phase:'blocked',origin:'governance-hook',error:{message:'review denied'}});
  assert.equal(detail(blocked).phase,'blocked');assert.equal(detail(blocked).display?.process,undefined);
});
test('target selection is exactly the actual Core alias contract; custom names do not imply rules',()=>{
  assert.equal(coreToolTarget('core-path-v1',{path:4,file_path:'ignored'}),undefined);
  assert.equal(coreToolTarget('core-path-v1',{path:null,file_path:'actual',filePath:'later'}),'actual');
  assert.equal(coreToolTarget('core-command-v1',{command:'',cmd:'ignored'}),'');
  const event=createToolDisplayContext().projectToolEvent(source({input:{args:{path:'custom'},rule:undefined}}));
  assert.equal(detail(event).display?.target,undefined);
});
test('native fallback only takes explicit text; native outcome wins and unsupported objects never serialize',()=>{
  const event=createToolDisplayContext().projectToolEvent(source({result:undefined,native:{isError:true,content:[{type:'text',text:'first'},{type:'unsupported'},{type:'text',text:'second'}]}}));
  assert.equal(detail(event).display?.resultText?.text,'first\nsecond');assert.equal(detail(event).ok,false);
  assert.ok(detail(event).display?.omissions.includes('unsupported-content'));
  const missing=createToolDisplayContext().projectToolEvent(source({result:undefined}));
  assert.equal(missing.kind,'message');assert.equal((missing.detail as {code:string}).code,'RESULT_OUTCOME_UNAVAILABLE');
});
test('profile capture is required, custom actual credentials are registered in memory and cannot rebind',()=>{
  const c=createToolDisplayContext({env:{CORE_EXTRA:'extra-value'},credentialEnvNames:['CORE_EXTRA'],requireProfile:true});
  assert.throws(()=>c.assertReady(),/registered/);
  assert.equal((c.projectToolEvent(source()).detail as {code:string}).code,'DISPLAY_PROFILE_NOT_READY');
  c.registerToolDisplayProfile({apiKeyEnvVar:'ACTUAL_CUSTOM',credentials:[{name:'ACTUAL_CUSTOM',value:'actual-value'}]});
  c.assertReady();
  const event=c.projectToolEvent(source({result:{ok:true,message:'actual-value extra-value'}}));
  assert.equal(detail(event).display?.resultText?.text,'[REDACTED] [REDACTED]');
  assert.throws(()=>c.registerToolDisplayProfile({apiKeyEnvVar:'ACTUAL_CUSTOM',credentials:[{name:'ACTUAL_CUSTOM',value:'changed'}]}),/cannot change/);
});
test('known values and patterns are protected before truncation; IDs never pass through a redactor',()=>{
  const c=createToolDisplayContext({env:{MY_SECRET:'fake-secret'},credentialEnvNames:['MY_SECRET']});
  const event=c.projectToolEvent(source({toolCallId:'call-fake-secret',turnId:'turn-fake-secret',input:{rule:'core-command-v1',args:{command:'node x --password "two words" https://u:p@host/path?q=secret#frag'}},result:{ok:false,message:'Bearer abcdef api_key="quoted value" fake-secret\n'+'中'.repeat(20000)}}),value=>value.replace('extra-profile','[REDACTED]'));
  assert.equal(detail(event).toolCallId,'call-fake-secret');assert.equal(event.turnId,'turn-fake-secret');
  const display=JSON.stringify(detail(event).display);
  for(const secret of ['two words','quoted value','fake-secret','abcdef','q=secret','#frag','u:p'])assert.ok(!display.includes(secret),secret);
  assert.equal(detail(event).display?.resultText?.redacted,true);assert.equal(detail(event).display?.resultText?.truncated,true);
});
test('UTF-8 and encoded JSON budgets use independent byte counts and survive a second projection',()=>{
  const c=createToolDisplayContext();
  const e=c.projectToolEvent(source({input:{rule:'core-command-v1',args:{command:'😀'.repeat(10000)}},result:{ok:false,message:'\"中😀'.repeat(20000),execution:{stdout:'😀'.repeat(30000),stderr:'文'.repeat(30000),exitCode:9}}}));
  const d=detail(e).display!;
  for(const value of [d.resultText,d.error,d.process?.stdout,d.process?.stderr,d.target?.value])if(value){assert.ok(!value.text.includes('\ufffd'));assert.ok(Buffer.byteLength(value.text)<= (value===d.error||value===d.target?.value?4096:16384));}
  assert.ok(Buffer.byteLength(JSON.stringify(d))<=57344);assert.ok(Buffer.byteLength(JSON.stringify(e))<=65536);
  const again=c.projectToolEvent({origin:'projected-event',event:e});
  assert.equal(detail(again).display?.resultText?.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(again))<=65536);
});
test('projection faults and oversize identity produce messages without fabricated business conclusions',()=>{
  const c=createToolDisplayContext();
  for(const e of [c.projectToolEvent(source({toolCallId:'x'.repeat(100000)})),c.projectToolEvent(source(),()=>{throw Error('DO_NOT_LEAK');})]){
    assert.equal(e.kind,'message');assert.ok(!('ok' in e.detail));assert.ok(!JSON.stringify(e).includes('DO_NOT_LEAK'));assert.ok(!('phase' in e.detail));
  }
});

test('control characters use a visible replacement independently of Unicode clipping',()=>{const value=createToolDisplayContext().protectText('one\u0001two',100);assert.equal(value.text,'one\ufffdtwo');assert.equal(value.truncated,false);});

test('a source truncation flag alone is preserved without falsely attributing it to the display budget',()=>{
 const event=createToolDisplayContext().projectToolEvent(source({result:{ok:true,message:'short',execution:{stdout:'captured prefix',stdoutTruncated:true}}}));
 assert.equal(detail(event).display?.process?.stdout?.truncated,true);assert.equal(detail(event).display?.omissions.includes('budget'),false);
});
