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

test('F-8-a handler-result: process finished with nonzero exit code reads as completed-with-exit-code while ok/status/kind/errorCode stay unchanged',()=>{
  const event=createToolDisplayContext().projectToolEvent(source({result:{ok:false,message:'run_shell 已执行：grep -rn "http" src/public（exit 1）',execution:{exitCode:1,stdout:'',stderr:''}},error:{code:'TOOL_FAILED'}}));
  assert.match(event.summary,/已执行完成（退出码 1）/);
  assert.ok(!event.summary.includes('run_shell 执行失败'));
  assert.equal(event.kind,'denied');assert.equal(detail(event).phase,'result');
  assert.equal(detail(event).ok,false);assert.equal(detail(event).status,'failed');assert.equal(detail(event).errorCode,'TOOL_FAILED');
  assert.equal(detail(event).display?.process?.exitCode,1);
  // 消息文本（tools.ts 的「run_shell 已执行：…（exit N）」）原样回填——桌面侧既有正则依赖它，不改。
  assert.match(detail(event).display?.resultText?.text ?? '',/^run_shell 已执行：[\s\S]*（exit 1）/);
});
test('F-8-a native-result shape: same nonzero-exit classification when outcome facts come from the native result',()=>{
  const event=createToolDisplayContext().projectToolEvent(source({result:{ok:false,message:'run_shell 已执行：node -v（exit 1）\nstdout:\nstderr:',execution:{exitCode:1}},native:{isError:true,content:[{type:'text',text:'run_shell 已执行：node -v（exit 1）'}]}}));
  assert.match(event.summary,/已执行完成（退出码 1）/);assert.equal(event.kind,'denied');assert.equal(detail(event).ok,false);
  assert.equal(detail(event).display?.process?.exitCode,1);
});
test('F-1 timeout projection: timedOut wording is distinct and display.process.timedOut is exposed for structured consumers',()=>{
  const event=createToolDisplayContext().projectToolEvent(source({result:{ok:false,message:'run_shell 超时已终止（600000 ms）：命令超过本次执行时限，已被终止。\nstdout:\npartial',execution:{timedOut:true,timeoutMs:600000,signal:'SIGTERM',stdout:'partial',stderr:''}}}));
  assert.match(event.summary,/超时终止/);assert.ok(!event.summary.includes('执行失败'));
  assert.equal(detail(event).display?.process?.timedOut,true);
  assert.equal(detail(event).display?.process?.signal,'SIGTERM');
  assert.equal(detail(event).display?.process?.exitCode,undefined);
});
test('F-8-a guard: spawn failure (execution.error) keeps the honest 执行失败 wording',()=>{
  const event=createToolDisplayContext().projectToolEvent(source({result:{ok:false,message:'run_shell 执行失败（未能启动或运行）：spawn ENOENT',execution:{error:'spawn ENOENT'}}}));
  assert.match(event.summary,/执行失败/);assert.ok(!event.summary.includes('已执行完成'));
  assert.equal(detail(event).display?.process?.exitCode,undefined);assert.equal(detail(event).display?.process?.timedOut,undefined);
});
test('F-8-a re-projection keeps exitCode and timedOut through the persisted-event path',()=>{
  const c=createToolDisplayContext();
  const first=c.projectToolEvent(source({result:{ok:false,message:'run_shell 已执行：x（exit 7）',execution:{exitCode:7}}}));
  const again=c.projectToolEvent({origin:'projected-event',event:first});
  assert.equal(detail(again).display?.process?.exitCode,7);
  const timed=c.projectToolEvent(source({result:{ok:false,message:'run_shell 超时已终止（300 ms）',execution:{timedOut:true,timeoutMs:300,signal:'SIGTERM'}}}));
  const timedAgain=c.projectToolEvent({origin:'projected-event',event:timed});
  assert.equal(detail(timedAgain).display?.process?.timedOut,true);
  assert.equal(detail(timedAgain).display?.process?.signal,'SIGTERM');
});
