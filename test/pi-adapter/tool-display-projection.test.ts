import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeProviderOptions, RuntimeToolEventSource, SessionEvent, ToolDefinition } from '../../src/model/runtime.ts';
import { createRuntimeAdapter } from '../../src/service/runtime/session.ts';
import { createRealPiRuntimeAdapter, buildGovernanceExtension } from '../../src/common/pi-adapter/real-adapter.ts';
import { resolvePiProviderConfig } from '../../src/common/pi-adapter/provider-config.ts';
import { createInteractionGate } from '../../src/common/pi-adapter/timeout.ts';
import { makeRole, makeGate } from './fixtures.ts';

const envKey = 'ANS_PI_DISPLAY_TEST_CREDENTIAL';
const secret = 'pi-display-known-sentinel-7186';
const config = resolvePiProviderConfig({ providerId:'display-faux', baseUrl:'https://display.invalid/', modelId:'display-model', apiKeyEnvVar:envKey, contextWindow:32768 }, { [envKey]:secret });
const logger = { stage() {}, trace() {}, traceEnabled:false };
async function fixture(run: (dir:string, sdk:Awaited<ReturnType<typeof engine>>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pi-display-')); const previous=process.env[envKey]; process.env[envKey]=secret;
  try { await run(dir, await engine()); } finally { if(previous===undefined) delete process.env[envKey]; else process.env[envKey]=previous; await rm(dir,{recursive:true,force:true}); }
}
async function engine() {
  const pi=await import('@earendil-works/pi-coding-agent'); const ai=await import('@earendil-works/pi-ai');
  const faux=ai.fauxProvider({tokensPerSecond:100000}); const runtime=await pi.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false}); runtime.registerNativeProvider(faux.provider);
  let native!:Awaited<ReturnType<typeof pi.createAgentSession>>['session'];
  const deps={buildRuntime:async()=>({runtime,model:runtime.getModel(faux.provider.id,faux.models[0].id)!}),loadPi:async()=>({...pi,async createAgentSession(input:Parameters<typeof pi.createAgentSession>[0]){const out=await pi.createAgentSession(input);native=out.session;return out;}})};
  return {ai,faux,deps,get native(){return native;}};
}
async function drain(session:{dispose():Promise<void>;events():AsyncIterable<SessionEvent>}) {await session.dispose();const events:SessionEvent[]=[];for await(const e of session.events())events.push(e);return events;}

test('required-v1 missing capabilities rejects before SDK; actual config override profile registers first',async()=>fixture(async(dir,sdk)=>{
  let loads=0; const base:RuntimeProviderOptions={runtime:'pi',projectRoot:dir,skillRoot:dir,tools:[],interactionGate:createInteractionGate(),currentTurnId:()=> 'turn',toolDisplayMode:'required-v1'};
  for(const missing of ['projectToolEvent','registerToolDisplayProfile']) {
    const opts={...base,projectToolEvent:()=>({kind:'message' as const,summary:'safe',detail:{version:1 as const,source:'tool-display-diagnostic' as const,code:'PROJECTION_FAILED' as const}}),registerToolDisplayProfile:()=>{},[missing]:undefined};
    await assert.rejects(createRealPiRuntimeAdapter({...opts,config,logger},{...sdk.deps,loadPi:async()=>{loads++;return sdk.deps.loadPi();}}).bindRole(makeRole()),/capabilities are missing/);
  }
  assert.equal(loads,0);
  let registered=false;
  const session=await createRealPiRuntimeAdapter({...base,config,logger,projectToolEvent:()=>({kind:'message',summary:'safe',detail:{version:1,source:'tool-display-diagnostic',code:'PROJECTION_FAILED'}}),registerToolDisplayProfile:profile=>{assert.equal(profile.apiKeyEnvVar,envKey);assert.deepEqual(profile.credentials,[{name:envKey,value:secret}]);registered=true;}},{...sdk.deps,loadPi:async()=>{assert.ok(registered);return sdk.deps.loadPi();}}).bindRole(makeRole());
  await session.dispose();
}));

test('Core -> actual Pi -> real read/ENOENT/shell: display projected, execution remains private, SDK content unchanged',async()=>fixture(async(dir,sdk)=>{
  const path=join(dir,'file-'+secret); await writeFile(path,'raw read '+secret);
  const command=`${process.execPath} -e 'process.stdout.write("${secret}");process.stderr.write("actual-stderr");process.exit(7)'`;
  const sources:RuntimeToolEventSource[]=[]; let shellCalls=0;
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall('read_file',{path}),sdk.ai.fauxToolCall('read_file',{path:join(dir,'missing')}),sdk.ai.fauxToolCall('run_shell',{command})]),sdk.ai.fauxAssistantMessage('用户指令：actual assistant stays')]);
  const adapter=createRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,gate:makeGate({project:[],skill:[]}),shellGate:async()=>{shellCalls++;return {allow:true,by:'offline-test'};},providerFactories:{pi:opts=>createRealPiRuntimeAdapter({...opts,config,logger,projectToolEvent:source=>{sources.push(source);return opts.projectToolEvent!(source);}},sdk.deps)}});
  const session=await adapter.bindRole(makeRole()); await session.prompt('exercise raw source');
  const nativeResults=sdk.native.messages.filter(m=>m.role==='toolResult');
  const events=await drain(session); assert.equal(shellCalls,1); assert.equal(nativeResults.length,3);
  for(const result of nativeResults) assert.equal('execution' in ((result as {details?:object}).details??{}),false);
  assert.ok(nativeResults.some(m=>JSON.stringify(m).includes('raw read '+secret)),'original message still reaches SDK/native');
  const tools=events.filter(e=>['tool_call','accepted','denied'].includes(e.kind)); assert.equal(tools.length,6);
  assert.equal(JSON.stringify(tools).includes(secret),false,'no raw target/result/summary/detail sidecar');
  const read=tools.find(e=>e.kind==='accepted')!; assert.equal((read.detail as any).display.resultText.redacted,true);
  const shell=tools.find(e=>(e.detail as any).toolName==='run_shell'&&(e.detail as any).phase==='result')!;
  assert.equal((shell.detail as any).display.process.exitCode,7); assert.equal((shell.detail as any).display.process.stderr.text,'actual-stderr');
  assert.equal((shell.detail as any).display.process.stdout.text,'[REDACTED]'); assert.equal((shell.detail as any).ok,false);
  assert.ok(sources.some(s=>'phase' in s&&s.phase==='result'&&s.result?.execution?.exitCode===7));
  assert.ok(events.some(e=>e.summary==='用户指令：actual assistant stays'));
}));

test('native bridge preserves handler result/throw and unsupported content, call identity and rule; metadata is not SDK options',async()=>fixture(async(dir,sdk)=>{
  const sources:RuntimeToolEventSource[]=[]; let savedOpts!:RuntimeProviderOptions;
  const tools:ToolDefinition[]=[{name:'run_shell',description:'custom same name no rule',inputSchema:{type:'object',properties:{command:{type:'string'}}},async handler(){return {ok:true,message:'original '+secret,execution:{exitCode:0,stdout:'exact stdout'}};}},{name:'throw_probe',description:'throws',inputSchema:{type:'object',properties:{}},async handler(){throw new Error('real error '+secret);}}];
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall('run_shell',{command:'ignored custom target'}),sdk.ai.fauxToolCall('throw_probe',{})]),sdk.ai.fauxAssistantMessage('done')]);
  const adapter=createRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,gate:makeGate({project:[],skill:[]}),providerFactories:{pi:opts=>{savedOpts=opts;return createRealPiRuntimeAdapter({...opts,tools,config,logger,projectToolEvent:source=>{sources.push(source);return opts.projectToolEvent!(source);}},sdk.deps);}}});
  const session=await adapter.bindRole(makeRole()); await session.prompt('original model text',{inputProvenance:undefined,inputPresentation:undefined} as never);
  const messages=sdk.native.messages; const events=await drain(session);
  const start=events.find(e=>e.kind==='tool_call')!; assert.equal((start.detail as any).display.target,undefined);
  const results=events.filter(e=>['accepted','denied'].includes(e.kind));assert.equal(results.length,2);assert.equal(JSON.stringify(results).includes(secret),false);
  assert.ok(messages.some(m=>m.role==='toolResult'&&JSON.stringify(m).includes('original '+secret)));
  assert.ok(sources.some(s=>'phase' in s&&s.phase==='result'&&s.error?.message==='real error '+secret));
  const hooks=new Map<string,(event:any)=>unknown>(); const hookEvents:SessionEvent[]=[];
  buildGovernanceExtension(()=>{throw new Error('no gate');},e=>hookEvents.push(e),true,{projectToolEvent:savedOpts.projectToolEvent,currentTurnId:()=> 'wrong-current-turn',allowedToolNames:new Set(),inputRules:new Map([['probe','core-path-v1']])}).factory({on:(name:string,fn:(e:any)=>unknown)=>{hooks.set(name,fn);}} as never);
  hooks.get('tool_call')!({toolName:'probe',toolCallId:'unknown-old',input:{path:secret}});
  assert.equal((hookEvents[0].detail as any).code,'CALL_CONTEXT_UNATTRIBUTED'); assert.equal(hookEvents[0].turnId,undefined);
  hooks.get('tool_execution_end')!({toolName:'probe',toolCallId:'old-'+secret,isError:true,result:{content:[{type:'text',text:'native '+secret},{type:'image',data:'not-text'}],details:{turnId:'actual-old'}},durationMs:3});
  const end=hookEvents[1];assert.equal(end.turnId,'actual-old');assert.equal((end.detail as any).toolCallId,'old-'+secret,'opaque identity is never scrubbed');
  assert.equal((end.detail as any).display.resultText.text,'native [REDACTED]');assert.ok((end.detail as any).display.omissions.includes('unsupported-content'));
}));

test('injected projector throw emits safe diagnostic without failing actual handler or model',async()=>fixture(async(dir,sdk)=>{
  let calls=0;sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall('probe',{})]),sdk.ai.fauxAssistantMessage('done')]);
  const session=await createRealPiRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,tools:[{name:'probe',description:'probe',inputSchema:{type:'object',properties:{}},async handler(){calls++;return {ok:true,message:'real result'};}}],interactionGate:createInteractionGate(),currentTurnId:()=> 'actual',toolDisplayMode:'required-v1',registerToolDisplayProfile:()=>{},projectToolEvent:()=>{throw new Error(secret);},config,logger},sdk.deps).bindRole(makeRole());
  await session.prompt('probe');const events=await drain(session);assert.equal(calls,1);assert.equal(events.filter(e=>(e.detail as any)?.code==='PROJECTION_FAILED').length,2);assert.equal(JSON.stringify(events).includes(secret),false);assert.ok(sdk.native.messages.some(m=>JSON.stringify(m).includes('real result')));
}));

test('all nine injected names project start/result once; real declared rule wins over tool name; blocked and failed native end coexist',async()=>fixture(async(dir,sdk)=>{
  const names=['read_file','write_file','edit_file','run_shell','request_confirmation','request_choice','dispatch_task','submit_report','report_shell_verdict'];
  const effects:string[]=[];let opts!:RuntimeProviderOptions;
  const tools:ToolDefinition[]=names.map(name=>({name,description:'display probe',displayInputRule:name==='read_file'?'core-path-v1':name==='run_shell'?'core-command-v1':'none',inputSchema:{type:'object',properties:{path:{type:'string'},command:{type:'string'}}},async handler(){effects.push(name);return {ok:true,message:'same result '+secret};}}));
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage(names.map(name=>sdk.ai.fauxToolCall(name,{path:'target '+secret,command:'command '+secret}))),sdk.ai.fauxAssistantMessage('done')]);
  const adapter=createRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,gate:makeGate({project:[],skill:[]}),providerFactories:{pi:input=>{opts=input;return createRealPiRuntimeAdapter({...input,tools,config,logger},sdk.deps);}}});
  const session=await adapter.bindRole(makeRole());await session.prompt('nine');const events=await drain(session);
  assert.deepEqual(effects,names);const starts=events.filter(e=>e.kind==='tool_call');const results=events.filter(e=>e.kind==='accepted');assert.equal(starts.length,9);assert.equal(results.length,9);
  for(const e of starts){const d=e.detail as any;assert.equal(d.phase,'start');assert.ok(d.turnId);assert.ok(d.toolCallId);assert.equal(results.filter(r=>(r.detail as any).toolCallId===d.toolCallId).length,1);if(!['read_file','run_shell'].includes(d.toolName))assert.equal(d.display.target,undefined);}
  assert.equal(JSON.stringify([...starts,...results]).includes(secret),false);
  const hooks=new Map<string,(event:any)=>unknown>();const seen:SessionEvent[]=[];let current='original';
  buildGovernanceExtension(()=>{throw new Error('not policy');},e=>seen.push(e),false,{projectToolEvent:opts.projectToolEvent,currentTurnId:()=>current,allowedToolNames:new Set(),inputRules:new Map([['read_file','core-path-v1'],['run_shell','core-command-v1']])}).factory({on:(name:string,fn:(event:any)=>unknown)=>hooks.set(name,fn)} as never);
  const start=hooks.get('tool_execution_start')!,blocked=hooks.get('tool_call')!,end=hooks.get('tool_execution_end')!;
  start({toolName:'read_file',toolCallId:'call-path',args:{path:17,file_path:'must-not-fallback'}});
  assert.equal((seen[0].detail as any).display.target,undefined,'nonstring first path does not fall back');
  blocked({toolName:'read_file',toolCallId:'call-path',input:{path:secret}});current='next';
  end({toolName:'read_file',toolCallId:'call-path',result:{content:[{type:'text',text:'blocked native '+secret}],details:{}},isError:true});
  assert.deepEqual(seen.slice(0,3).map(e=>(e.detail as any).phase),['start','blocked','result']);assert.ok(seen.slice(0,3).every(e=>e.turnId==='original'));assert.equal((seen[2].detail as any).ok,false);
  start({toolName:'run_shell',toolCallId:'empty-command',args:{command:'',cmd:'must-not-fallback'}});assert.equal((seen[3].detail as any).display.target.value.text,'');
  start({toolName:'read_file',toolCallId:'null-path',args:{path:null,file_path:'actual-alias'}});assert.equal((seen[4].detail as any).display.target.value.text,'actual-alias');
  const call='budget-call';start({toolName:'read_file',toolCallId:call,args:{path:'中文😀'.repeat(10000)}});end({toolName:'read_file',toolCallId:call,result:{content:[{type:'text',text:'中文😀'.repeat(20000)}],details:{}},isError:false});
  for(const e of seen.slice(5)){assert.ok(Buffer.byteLength(JSON.stringify(e))<=65536);const d=e.detail as any;for(const text of [d.display?.target?.value,d.display?.resultText])if(text){assert.ok(text.truncated);assert.equal(text.text.includes('\ufffd'),false);}}
}));

test('real Pi SDK receives original prompt and image reference only; Core-only metadata never enters SDK/transcript',async()=>fixture(async(dir,sdk)=>{
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage('done')]);
  const images=[{type:'image' as const,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',mimeType:'image/png'}];
  let seenOptions:unknown;let seenText='';
  const dependencies={...sdk.deps,loadPi:async()=>{const pi=await sdk.deps.loadPi();return {...pi,async createAgentSession(input:Parameters<typeof pi.createAgentSession>[0]){const out=await pi.createAgentSession(input);const original=out.session.prompt.bind(out.session);out.session.prompt=async(text,opts)=>{seenText=text;seenOptions=opts;return original(text,opts);};return out;}};}};
  const session=await createRealPiRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,tools:[],interactionGate:createInteractionGate(),currentTurnId:()=> 'actual',config,logger},dependencies).bindRole(makeRole());
  await session.prompt('original modelPromptText',{images,inputProvenance:{sentinel:'never-SDK-provenance'},inputPresentation:{sentinel:'never-SDK-presentation'},onDeliveryProgress:()=>{throw new Error('never-SDK-progress');}} as never);
  assert.equal(seenText,'original modelPromptText');assert.deepEqual(Object.keys(seenOptions as object),['images']);assert.equal((seenOptions as {images:unknown}).images,images);
  assert.equal(JSON.stringify(sdk.native.messages).includes('never-SDK'),false);await session.dispose();
}));

test('real Pi shell exit0, spawn failure, signal and review denial retain actual process facts without invented exit',async()=>fixture(async(dir,sdk)=>{
  const commands=[`${process.execPath} -e 'process.stdout.write("exit-zero")'`,'ans_missing_binary_for_display_6ce07',`${process.execPath} -e 'process.kill(process.pid,"SIGTERM")'`,'deny_probe'];
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage(commands.map(command=>sdk.ai.fauxToolCall('run_shell',{command}))),sdk.ai.fauxAssistantMessage('done')]);
  const adapter=createRuntimeAdapter({runtime:'pi',projectRoot:dir,skillRoot:dir,gate:makeGate({project:[],skill:[]}),shellGate:async req=>req.command==='deny_probe'?{allow:false,reason:'review denied '+secret,by:'offline-test'}:{allow:true,by:'offline-test'},providerFactories:{pi:opts=>createRealPiRuntimeAdapter({...opts,config,logger},sdk.deps)}});
  const session=await adapter.bindRole(makeRole());await session.prompt('shell states');const events=await drain(session);
  const ends=events.filter(e=>(e.detail as any)?.phase==='result').map(e=>e.detail as any);assert.equal(ends.length,4);
  const find=(command:string)=>ends.find(d=>d.display.target.value.text===command)!;
  assert.equal(find(commands[0]).display.process.exitCode,0);assert.equal(find(commands[0]).ok,true);assert.equal(find(commands[0]).display.process.stdout.text,'exit-zero');
  assert.equal(find(commands[1]).ok,false);assert.equal(find(commands[1]).display.process,undefined);assert.match(find(commands[1]).display.error.text,/ENOENT/);
  assert.equal(find(commands[2]).ok,false);assert.equal(find(commands[2]).display.process.signal,'SIGTERM');assert.equal(find(commands[2]).display.process.exitCode,undefined);
  assert.equal(find(commands[3]).ok,false);assert.equal(find(commands[3]).display.process,undefined);assert.equal(JSON.stringify(ends).includes(secret),false);
}));
