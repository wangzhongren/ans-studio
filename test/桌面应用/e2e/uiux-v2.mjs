// 离线实际renderer/preload：受控IPC替身，不启用任何模型，不读取用户项目/凭据。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../../app/desktop/session-history.ts';
import { RUNTIME_SETTINGS } from '../../../src/common/shared/runtime-settings.ts';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const APP=path.resolve(HERE,'../../../app');
const OUT=process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(),'ans-uiux-v2-'));
fs.mkdirSync(OUT,{recursive:true}); app.setPath('userData',path.join(OUT,'user-data'));
const INTERACTIVE=process.env.ANS_UIUX_INTERACTIVE==='1';
const ROOT='/offline-uiux-fixture';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let win, pickResolve, sendResolve, withdrawResolve;
let pickDeferred=false, sendDeferred=false, withdrawMode='fail', interactiveReady=false, operatorMode='normal';
const reports=[]; const errors=[]; const sends=[]; const opens=[]; const histories=[]; const stops=[]; const aborts=[]; const responses=[]; const configSaves=[]; const shellResponses=[]; const configApplications={};
let saveMode="success", saveApplication="next-session";
const CONFIG_ONLY=process.env.ANS_CONFIG_UI_ONLY==='1';
const PROJECT_RESET_ONLY=process.env.ANS_PROJECT_RESET_UI_ONLY==='1';
const DUP_ONLY=process.env.ANS_DUP_UI_ONLY==='1';
const SELECTOR_ONLY=process.env.ANS_SELECTOR_UI_ONLY==='1';
const configReads=[];
let recoveryEnabled=!(CONFIG_ONLY||SELECTOR_ONLY), listFailure=false, pickResult=ROOT, configFailure=false, configMalformed=false, configDeferred=false, saveDeferred=false;
let configMissing={}, configPending=[], savePending=[];
let mergeReplayAfterList=false, sendQueued=false; const mergeHistories=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=code=>win.webContents.executeJavaScript(code.includes('await ')?'(async()=>{'+code+'})()':code);
async function check(name, code){const value=await js(code);reports.push({name,value});if(!value)reports.push({name:name+' observed',value:await js(`(()=>({chat:document.getElementById('chat').textContent,assistant:[...document.querySelectorAll('#chat .msg-assistant')].map(x=>x.textContent),denied:[...document.querySelectorAll('#chat .sys-denied')].map(x=>x.textContent),model:window.__ansRenderer.rowModelDebug(window.__ansRenderer.state.selectedRoleId)}))()`)});assert.equal(value,true,name);}
const roles=['A','B'].map(roleId=>({roleId,cardPath:ROOT+'/角色卡/'+roleId+'/role-card.md',cardText:'# '+roleId+'\n\n完整角色职责。\n\n'+('资料内容用于检查阅读态。\n\n'.repeat(80)),boundary:{entries:[]},boundaryPath:'',changelog:null,docs:[]}));
const listing={projectRoot:ROOT,primaryRoleId:'A',hasRoles:true,warnings:[],roles};
const longFull='全文 '+ '排队消息详细内容与来源。\n'.repeat(40)+'长连续文本 '+ 'ordinaryword'.repeat(120);
const queue=[{id:'msg\u0000long',kind:'message',summary:'客户长消息：'+ '超过80字的队列摘要用于核对换行、时间与操作归属。'.repeat(6),full:longFull,at:'2026-10-13T10:01:00Z'},{id:'dispatch',kind:'dispatch',sourceRoleId:'B',summary:'派发任务',full:'',at:'2026-10-13T10:02:00Z'},{id:'handback',kind:'handback',sourceRoleId:'B',summary:'回交报告',full:'',at:'2026-10-13T10:03:00Z'}];
let activeQueue=queue.slice();
const snapshot=(busy=true)=>({roleId:'A',busy,summaries:activeQueue.map(x=>x.summary),queue:activeQueue,running:busy?{id:'running',kind:'message',summary:'正在处理当前请求',full:'',at:'2026-10-13T10:00:00Z'}:null});
const handlers={
 'app:renderer-diagnostic':()=>({ok:true}), 'app:recovery-state':()=>recoveryEnabled?({projectRoot:ROOT,roleId:'A'}):({}),'app:recovery-ready':()=>({ok:true}),
 'window:is-maximized':()=>false,'app:list-project':(_e,projectRoot)=>{if(listFailure)throw new Error('fixture listing failed');if(mergeReplayAfterList)for(const h of mergeHistories.values())win.webContents.send('session:history',h);return {...listing,projectRoot:projectRoot?.projectRoot||ROOT};},'app:pick-project':()=>pickResult,
 'session:open':(_e,input)=>{opens.push(input);return {ok:true,resumed:true,contextSource:'resumed',runtime:input.runtime,projectRoot:input.projectRoot,profileRevision:0};},'session:live':()=>['A','B'],'session:stop':(_e,input)=>{stops.push(input);return {ok:true};},
 'session:history-get':(_e,input)=>{histories.push(input);return mergeHistories.get(input.runtime+'|'+input.roleId)||{...input,rows:[],error:null,skipped:0};},
 'session:live-views':()=>[{projectRoot:ROOT,roleId:'A',runtime:'pi'},{projectRoot:ROOT,roleId:'B',runtime:'pi'},...opens.map(x=>({projectRoot:x.projectRoot,roleId:x.roleId,runtime:x.runtime}))],
 'session:abort':(_e,input)=>{aborts.push(input);win.webContents.send('session:role-state',{...snapshot(false),...input}); return {ok:true,supported:true};},
 'session:operator-response':(_e,input)=>{responses.push(input);return operatorMode==='expired'?({ok:false,expired:true,error:'离线受控请求已失效'}):({ok:true});},
 'runtime-config:get':(_e,input)=>{configReads.push(input.runtime);return configDeferred?new Promise((resolve,reject)=>configPending.push({runtime:input.runtime,resolve,reject})):configFailure?Promise.reject(new Error('fixture config failed')):configMalformed?{...runtimeConfig(input.runtime),missingKeys:undefined}:runtimeConfig(input.runtime);},
 'shell:confirm-response':(_e,input)=>{shellResponses.push(input);return {ok:true};},
 'runtime-config:save':(_e,input)=>{if(saveDeferred)return new Promise(resolve=>savePending.push(resolve));if(saveMode!=='fail')configApplications[input.runtime]=saveApplication;configSaves.push({runtime:input.runtime,keys:Object.keys(input.updates)});return saveMode==='fail'?{ok:false,error:'离线原子写失败'}:{ok:true,runtime:input.runtime,appliedKeys:Object.keys(input.updates),revision:1,application:saveApplication};},
 'pi-config:get':()=>({path:ROOT+'/'+('a-very-long-path/'.repeat(12))+'.env',fields:['ANTHROPIC_AUTH_TOKEN','ANS_PI_BASE_URL','ANS_PI_MODEL','ANS_PI_CONTEXT_WINDOW'].map(key=>({key,secret:key==='ANTHROPIC_AUTH_TOKEN',value:key==='ANTHROPIC_AUTH_TOKEN'?'':'fixture',isSet:true}))}),
 'pi-config:save':()=>({ok:true,appliedKeys:[]}),
 'app:pick-image':()=>pickDeferred?new Promise(r=>pickResolve=r):({ok:true,image:{name:'fixture.png',mime:'image/png',size:68,dataBase64:PNG}}),
 'app:attach-image':(_e,input)=>({ok:true,image:{name:input.name,mime:'image/png',size:68}}),
 'session:send':(_e,input)=>{sends.push(input);return sendDeferred?new Promise(r=>sendResolve=r):sendQueued?{ok:true,queued:true,position:1}:{ok:true};},
 'session:withdraw':(_e,input)=>interactiveReady?({ok:false,error:'离线受控返回：当前无法撤回，请重试。'}):new Promise((resolve,reject)=>{withdrawResolve=()=>{if(withdrawMode==='throw'){reject(new Error('离线受控网络不可用'));return;}if(withdrawMode==='success'){activeQueue=activeQueue.filter(x=>x.id!==input.id);win.webContents.send('session:role-state',snapshot(false)); resolve({ok:true,summary:'客户长消息'});}else resolve({ok:false,error:'离线受控拒绝'});};}),
};
function runtimeConfig(runtime) {
  const definition=RUNTIME_SETTINGS[runtime];
  return {runtime,label:definition.label,path:runtime==='pi'?ROOT+'/'+('a-very-long-path/'.repeat(12))+'.env':ROOT+'/.env',revision:0,application:configApplications[runtime]||'next-session',missingKeys:configMissing[runtime]||[],fields:definition.fields.map(f=>({...f,value:f.secret?'':f.required?'fixture':'',isSet:f.required&&!(configMissing[runtime]||[]).includes(f.key),source:f.secret&&runtime==='codex'?'fallback':f.required?'environment':'default',fallbackKey:f.secret&&runtime==='codex'?'OPENAI_API_KEY':undefined}))};
}
Object.entries(handlers).forEach(([name,fn])=>ipcMain.handle(name,fn));
const key=async (name,modifiers=[])=>{const keyCode=({Enter:'Return',ArrowDown:'Down',ArrowUp:'Up'})[name]||name;win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(name==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await pause(50);};
const event=(kind,summary,detail)=>({roleId:'A',event:{kind,summary,detail}});
function activityEvents(prefix='') { return [event('tool_call','模型请求调用 read_file（目标：a.md）',{toolName:'read_file',path:'a.md'}),event('accepted','read_file 执行完成',{toolName:'read_file',path:'a.md',ok:true,status:'completed',turnId:prefix+'turn-1'}),event('accepted','request accepted',{toolName:'legacy',path:'legacy.md'}),event('denied','文件不存在',{toolName:'read_file',path:'missing.md',status:'failed',ok:false}),event('tool_call','开始执行 read_file',{toolName:'read_file',path:'b.md'}),event('message','真实助手答复保持原文。')]; }
async function push(channel,payload){win.webContents.send(channel,payload);await pause(80);}
function ownHistory(){return parseSessionJsonl([{type:'session'},{type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'rs',name:'run_shell',arguments:{command:'ls missing'}}]}},{type:'message',message:{role:'toolResult',toolCallId:'rs',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：ls missing（exit 1）\nstdout:\nSECRET'}]}},{type:'message',message:{role:'toolResult',toolName:'read_file',isError:false,content:[{type:'text',text:'read_file 失败：lost.md（ENOENT）'}]}},{type:'message',message:{role:'assistant',content:[{type:'text',text:'历史助手答复。'}]}}].map(x=>JSON.stringify(x)).join('\n')).rows;}
const viewportGeometry=`(() => { const root=document.documentElement,b=document.body,a=document.querySelector('.app'),c=document.querySelector('.composer').getBoundingClientRect(),d=document.getElementById('right-drawer').getBoundingClientRect(); const visible=id=>{let r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0;};return root.scrollWidth===root.clientWidth&&b.scrollWidth===b.clientWidth&&a.scrollWidth===a.clientWidth&&visible('btn-send')&&visible('btn-halt')&&visible('drawer-close')&&d.bottom<=c.top+1;})()`;
async function reading(){return js(`(() => {let c=document.getElementById('chat'),t=c.getBoundingClientRect().top;let nodes=[...c.querySelectorAll('.msg,.tool-records,.sys-denied')];let n=nodes.find(x=>x.getBoundingClientRect().bottom>t&&x.getBoundingClientRect().top<c.getBoundingClientRect().bottom);return n?{text:n.textContent.slice(0,60),offset:n.getBoundingClientRect().top-t}:null;})()`);}
async function projectResetChecks() {
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);
  await push('session:events',[{projectRoot:ROOT,roleId:'A',runtime:'pi',event:{kind:'settled',summary:'OLD_ROOT_FAILURE',detail:{outcome:'failed'}}}]);
  await push('session:role-state',{projectRoot:ROOT,roleId:'B',runtime:'pi',busy:true,summaries:['OLD_ROOT_QUEUE'],queue:[{id:'old-q',kind:'message',summary:'OLD_ROOT_QUEUE'}]});
  await push('session:history',{projectRoot:ROOT,roleId:'B',runtime:'codex',rows:[{kind:'assistant',text:'OLD_RUNTIME_HISTORY'}]});
  await check('old project status fixture is visible',`!!document.querySelector('#role-tree .st-error')&&!!document.querySelector('#role-tree .st-working')`);
  const next='/fresh-ui-project';await js(`await window.__ansRenderer.loadProject(${JSON.stringify(next)})`);
  await check('new project first DOM clears old badges before events',`[...document.querySelectorAll('#role-tree .ti-status')].every(x=>x.classList.contains('st-off'))&&!document.getElementById('role-tree').innerHTML.includes('OLD_ROOT')&&!document.getElementById('role-tree').textContent.includes('已恢复')&&!document.getElementById('role-tree').textContent.includes('已停止')&&window.__ansRenderer.state.sessionOpenRoleId===null&&!document.getElementById('runtime-select').disabled`);
  await push('session:role-state',{projectRoot:ROOT,roleId:'A',runtime:'pi',busy:true,summaries:['OLD_LATE'],queue:[]});
  await check('old project late status is ignored',`!document.querySelector('#role-tree .st-working')&&!document.getElementById('role-tree').innerHTML.includes('OLD_LATE')`);
  await push('session:role-state',{projectRoot:next,roleId:'A',runtime:'pi',busy:true,summaries:['NEW_ACTUAL_QUEUE'],queue:[{id:'new-q',kind:'message',summary:'NEW_ACTUAL_QUEUE'}]});
  await check('new actual status immediately displayed',`document.querySelector('#role-tree .st-working')&&window.__ansRenderer.state.roleBusy.A===true&&window.__ansRenderer.state.queueByRole.A[0]==='NEW_ACTUAL_QUEUE'`);
  await js(`await window.__ansRenderer.refreshProject()`);await pause(40);
  await check('ordinary fresh false refresh preserves actual state',`document.querySelector('#role-tree .st-working')&&window.__ansRenderer.state.roleBusy.A===true&&window.__ansRenderer.state.queueByRole.A[0]==='NEW_ACTUAL_QUEUE'`);
  await js(`await window.__ansRenderer.selectRuntime('codex')`);await pause(40);
  await check('old project cached foreign runtime does not appear',`!document.getElementById('chat').textContent.includes('OLD_RUNTIME_HISTORY')&&!document.getElementById('role-tree').textContent.includes('已恢复')`);
  const pending='/fresh-with-pending';
  await push('session:history',{projectRoot:pending,roleId:'B',runtime:'codex',rows:[{kind:'assistant',text:'NEW_PENDING_HISTORY'}]});
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(pending)})`);await pause(30);
  await check('new pending history applied before first tree render',`[...document.querySelectorAll('#role-tree .tree-item')].find(x=>x.querySelector('.ti-name').textContent==='B').querySelector('.st-restored')!==null`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(50);fs.writeFileSync(path.join(OUT,'project-reset-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
}
async function duplicateChecks() {
  const payload=(event,roleId='A',runtime='pi')=>({projectRoot:ROOT,roleId,runtime,event:{...event,runtime,roleId}});
  const tool=(name,call,phase,turn='dup-turn',extra={})=>({kind:phase==='start'?'tool_call':phase==='blocked'?'denied':'accepted',turnId:turn,summary:name+' '+phase,detail:{toolName:name,toolCallId:call,phase,...(phase==='start'?{}:{ok:phase==='result'}),...extra}});
  const historyRow=e=>({kind:e.kind==='denied'?'denied':'tool',text:e.summary,turnId:e.turnId,eventKind:e.kind,activity:e.detail});
  let baselineRows=0;
  const reset=async()=>{await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);await pause(40);baselineRows=await js(`window.__ansRenderer.rowModelDebug('A').count`);};
  await reset();
  const names=['read_file','write_file','edit_file','run_shell','request_confirmation','request_choice','dispatch_task','submit_report','report_shell_verdict'];
  for(const [i,name] of names.entries()){
    const start=tool(name,'all-'+i,'start'),result=tool(name,'all-'+i,'result');
    await push('session:events',[payload(start),payload({...start,summary:'第二来源同一调用'}),payload(result),payload(result)]);
    await check('one canonical lifecycle '+name,`(()=>{const text=document.getElementById('chat').textContent;return (text.match(/${name}/g)||[]).length===${i<4?2:1};})()`);
  }
  await reset();
  const handback='[回交] 来自 维护 的报告（任务关联未知）\n结论：completed\n摘要：原报告';
  const input=(turn,text)=>({kind:'message',turnId:turn,summary:'用户指令：'+text,detail:{source:'prompt-input',text}});
  await push('session:events',[payload(input('delivery-one',handback)),payload(input('delivery-one',handback))]);
  await check('typed input repeated live is single injected row',`document.querySelectorAll('#chat .msg-injected').length===1&&window.__ansRenderer.rowModelDebug('A').count===${baselineRows+1}`);
  const row={kind:'user',text:handback,turnId:'delivery-one',input:{source:'prompt-input',text:handback}};
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[row]});
  await check('live then history input remains one',`document.querySelectorAll('#chat .msg-injected').length===1&&window.__ansRenderer.rowModelDebug('A').count===1`);
  await push('session:events',[payload(input('delivery-two',handback)),payload({kind:'message',turnId:'assistant',summary:'用户指令：'+handback})]);
  await check('different actual turn retained and real assistant prefix not converted',`document.querySelectorAll('#chat .msg-injected').length===2&&document.querySelectorAll('#chat .msg-assistant').length===1`);
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[{kind:'assistant',text:'full prefix'},row]});
  await check('full rebuild preserves uncovered second input and assistant',`document.querySelectorAll('#chat .msg-injected').length===2&&document.querySelectorAll('#chat .msg-assistant').length===2`);
  await reset();await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[row]});await push('session:events',[payload(input('delivery-one',handback))]);
  await check('history first then typed live still one',`document.querySelectorAll('#chat .msg-injected').length===1`);
  await reset();
  const start=tool('dispatch_task','repeat','start'),result=tool('dispatch_task','repeat','result');
  await push('session:events',[payload(start),payload(result),payload(tool('dispatch_task','repeat','blocked')),payload(tool('dispatch_task','repeat','result','dup-turn',{ok:false})),payload(result)]);
  await check('blocked result and failure preserved without success downgrade',`document.getElementById('chat').textContent.includes('调用发起')&&document.getElementById('chat').textContent.includes('执行失败')&&window.__ansRenderer.rowModelDebug('A').count===${baselineRows+1}`);
  await push('session:events',[payload({...start,detail:{toolName:'dispatch_task'}}),payload({...start,detail:{toolName:'dispatch_task'}}),payload(tool('dispatch_task','other-call','start')),payload(tool('dispatch_task','repeat','start','other-turn'))]);
  await check('unknown legacy starts and true other call turn retained',`window.__ansRenderer.rowModelDebug('A').count===${baselineRows+5}`);
  for(const order of ['tool-first','card-first']){
    await reset();const id='answer-'+order,call='original-'+order,turn='request-'+order;
    const request={projectRoot:ROOT,roleId:'A',runtime:'pi',id,turnId:turn,toolCallId:call,request:{kind:'confirm',title:'原请求标题'}};
    if(order==='tool-first')await push('session:events',[payload(tool('request_confirmation',call,'start',turn))]);
    await push('session:operator-request',request);
    await push('session:events',[payload(tool('request_confirmation',call,'start',turn)),payload(tool('request_confirmation',call,'result',turn)),payload(tool('request_confirmation',call,'result',turn))]);
    await check('card and lifecycle single '+order,`document.querySelectorAll('#chat .op-request').length===1&&window.__ansRenderer.rowModelDebug('A').count===${baselineRows+1}&&document.querySelector('.op-tool-lifecycle').textContent.includes('执行完成')`);
    await js(`window.__originalDupCard=document.querySelector('[data-request-id="${id}"]');window.__originalDupCard.querySelector('.op-deny').click()`);await pause(50);
    await push('session:operator-request',request);
    const rows=[historyRow(tool('request_confirmation',call,'start',turn)),historyRow(tool('request_confirmation',call,'result',turn))];
    await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows});
    await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[{kind:'assistant',text:'full rebuild prefix'},...rows]});
    await check('full rebuild retains original decided card '+order,`document.querySelector('[data-request-id="${id}"]')===window.__originalDupCard&&window.__originalDupCard.querySelector('.op-confirm').hidden&&document.querySelectorAll('#chat .op-request').length===1&&window.__ansRenderer.rowModelDebug('A').count===2`);
    await push('session:operator-request',{...request,id:id+'-new',toolCallId:call+'-new'});
    await check('same title distinct call request retained '+order,`document.querySelectorAll('#chat .op-request').length===2`);
  }
  await reset();
  await js(`document.getElementById('inp-message').value='客户同文';document.getElementById('btn-send').click()`);await pause(40);
  const sent=sends.at(-1);
  await push('session:events',[{...payload(input('manual-actual','客户同文')),clientMessageId:sent.metadata.clientMessageId}]);
  await check('manual clientMessage ack consumes typed input without duplicate',`document.querySelectorAll('#chat .msg-user').length===1&&document.querySelectorAll('#chat .msg-assistant').length===0`);
  await reset();
  const sameTool=tool('read_file','history-call','start');await push('session:events',[payload(sameTool),payload(tool('read_file','history-call','result'))]);
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[historyRow(sameTool),historyRow(tool('read_file','history-call','result'))]});
  await check('normal tools live history share phase identities',`document.querySelectorAll('#chat .tool-activity').length===2`);
  await push('session:events',[payload(tool('read_file','path-call','start','path-turn',{path:'original/path.md'})),payload(tool('read_file','path-call','start','path-turn'))]);
  await check('duplicate sparse metadata retains original target',`[...document.querySelectorAll('#chat .tool-activity')].filter(x=>x.textContent.includes('original/path.md')).length===1`);
  await reset();
  const phases=[tool('report_shell_verdict','blocked-call','start'),tool('report_shell_verdict','blocked-call','blocked'),tool('report_shell_verdict','blocked-call','result','dup-turn',{ok:false})];
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:phases.map(historyRow)});
  await check('history same call start blocked result all retained',`(()=>{const t=document.getElementById('chat').textContent;return t.includes('调用发起')&&(t.match(/执行失败/g)||[]).length===2&&window.__ansRenderer.rowModelDebug('A').count===1;})()`);
  await push('session:events',phases.map(e=>payload(e)));
  await check('history then live phases still single lifecycle',`window.__ansRenderer.rowModelDebug('A').count===1`);

  await reset();
  await push('session:events',[payload(tool('read_file','failure-one','result','failure-turn',{ok:false})),payload(tool('read_file','failure-two','result','failure-turn',{ok:false}))]);
  await check('same failed body different actual calls remain two failures',`document.querySelectorAll('#chat .sys-denied').length===2`);
  await push('session:events',[payload(input('isolated','后台相同输入'),'B'),payload(input('isolated','后台相同输入'),'B'),payload(input('isolated','Codex同身份'),'A','codex')]);
  await check('foreign role runtime identity never covers foreground',`!document.getElementById('chat').textContent.includes('后台相同输入')&&!document.getElementById('chat').textContent.includes('Codex同身份')`);
  await js(`await window.__ansRenderer.selectRole('B')`);await pause(30);
  await check('background role retains one canonical input',`[...document.querySelectorAll('#chat .msg-user')].filter(x=>x.textContent.trim()==='后台相同输入').length===1`);
  await js(`await window.__ansRenderer.selectRuntime('codex')`);await pause(40);
  await js(`await window.__ansRenderer.selectRole('A')`);await pause(30);
  await check('background Codex input retained in own view',`document.getElementById('chat').textContent.includes('Codex同身份')`);
  await js(`await window.__ansRenderer.selectRuntime('pi')`);await reset();
  const longRows=Array.from({length:220},(_,i)=>({kind:'assistant',text:'reader-'+i+' 原阅读段落保持。'.repeat(10)}));
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:longRows});
  await js(`document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight*.5`);await pause(80);
  const readAnchor=await reading();
  await push('session:events',[payload(input('read-input','远端程序化客户输入')),payload(tool('dispatch_task','read-call','start')),payload(tool('dispatch_task','read-call','start')),payload(tool('dispatch_task','read-call','result'))]);
  const afterAnchor=await reading();
  assert.equal(afterAnchor.text,readAnchor.text);assert.ok(Math.abs(afterAnchor.offset-readAnchor.offset)<2);
  reports.push({name:'canonical input and tool updates preserve virtual reader anchor',value:true,before:readAnchor,after:afterAnchor});
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(50);fs.writeFileSync(path.join(OUT,'duplicate-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
}
async function selectorChecks() {
  const trigger=`document.getElementById('runtime-select')`, menu=`document.getElementById('runtime-options')`;
  await check('disabled combobox before import',`${trigger}.disabled&&${trigger}.getAttribute('aria-disabled')==='true'&&${trigger}.getAttribute('role')==='combobox'`);
  await js(`${trigger}.click();${trigger}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await check('disabled cannot open',`${menu}.hidden&&${trigger}.getAttribute('aria-expanded')==='false'`);
  listing.roles=[];listing.hasRoles=false;listing.primaryRoleId=null;configMissing.claude=['ANTHROPIC_API_KEY'];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await check('empty folder enables custom selector',`!${trigger}.disabled&&${trigger}.getAttribute('aria-disabled')==='false'`);
  await js(`${trigger}.focus()`);await key('Enter');await key('End');
  await check('End browses Claude without commit',`window.__ansRenderer.state.runtime==='pi'&&${trigger}.getAttribute('aria-activedescendant')==='runtime-option-claude'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='true'&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='false'`);
  const before=configReads.length;await key('Space');await pause(70);
  await check('Space commits Claude once with live missing entry',`window.__ansRenderer.state.runtime==='claude'&&${trigger}.value==='claude'&&${menu}.hidden&&${trigger}.getAttribute('aria-label')==='会话引擎，当前 Claude'&&document.getElementById('runtime-config-settings').textContent==='打开 Claude 设置'`);assert.equal(configReads.length,before+1);
  const same=configReads.length;await key('Enter');await key('Enter');await pause(40);
  await check('current Enter only closes',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'`);assert.equal(configReads.length,same);
  await key('Home');await key('ArrowUp');
  await check('Home opens first and stops at top',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-pi'`);
  await key('Escape');
  await check('Escape cancels and retains trigger focus',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'&&document.activeElement===${trigger}`);
  await key('ArrowDown');await key('ArrowDown');
  await check('closed arrow opens selected and stops at last',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-claude'`);
  await key('Home');await key('Tab');
  await check('Tab cancels naturally to missing settings',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'&&document.activeElement.id==='runtime-config-settings'`);
  await js(`${trigger}.focus()`);await key('Enter');await key('Home');
  await key('Tab',['shift']);
  await check('ShiftTab cancellation leaves natural previous target',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'&&document.activeElement.id==='btn-import'`);
  await js(`${trigger}.focus();${trigger}.click()`);await key('Home');
  await js(`document.getElementById('runtime-config-settings').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.getElementById('runtime-config-settings').focus()`);
  await check('outside pointer cancels without focus stealing',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'&&document.activeElement.id==='runtime-config-settings'`);
  await js(`${trigger}.focus();${trigger}.click();window.dispatchEvent(new Event('blur'))`);
  await check('window blur closes without commit',`${menu}.hidden&&window.__ansRenderer.state.runtime==='claude'`);
  await js(`${trigger}.click();document.getElementById('runtime-option-codex').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
  await check('hover moves temporary only and keeps selected check',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-codex'&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='true'`);
  const mouseBefore=configReads.length;await js(`document.getElementById('runtime-option-codex').click()`);await pause(60);
  await check('option click commits Codex once',`window.__ansRenderer.state.runtime==='codex'&&${trigger}.value==='codex'&&${menu}.hidden`);assert.equal(configReads.length,mouseBefore+1);
  const currentClick=configReads.length;await js(`${trigger}.click();document.getElementById('runtime-option-codex').click()`);await pause(30);assert.equal(configReads.length,currentClick);
  await check('current click no business reread',`${menu}.hidden`);
  await js(`await window.__ansRenderer.selectRuntime('claude')`);await pause(60);
  await check('programmatic runtime sync selected and label',`${trigger}.textContent.includes('Claude')&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='true'`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(60);await js(`${trigger}.focus();${trigger}.click()`);await key('ArrowUp');await check('selector dimensions and viewport '+width,`(()=>{const t=${trigger}.getBoundingClientRect(),m=${menu}.getBoundingClientRect();return t.width===104&&t.height===28&&m.width===160&&m.left>=8&&m.right<=innerWidth-8&&m.bottom<=innerHeight-8&&document.body.scrollWidth===innerWidth;})()`);fs.writeFileSync(path.join(OUT,'selector-'+width+'-open.png'),(await win.webContents.capturePage()).toPNG());await key('Escape');}
  await js(`document.querySelector('.engine-value').textContent='VERY LONG ENGINE LABEL THAT MUST NOT OVERFLOW';document.querySelector('#runtime-option-claude .engine-option-name').textContent='Claude VERY LONG LABEL';${trigger}.click()`);
  await check('long label ellipsis retains accessible full name',`${trigger}.title==='Claude VERY LONG LABEL'&&${trigger}.getAttribute('aria-label').includes('Claude VERY LONG LABEL')&&${trigger}.querySelector('.engine-value').scrollWidth>${trigger}.querySelector('.engine-value').clientWidth&&${menu}.scrollWidth===${menu}.clientWidth`);
  await key('Escape');await js(`document.querySelector('#runtime-option-claude .engine-option-name').textContent='Claude';await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await js(`${trigger}.style.position='fixed';${trigger}.style.top='170px';${trigger}.style.left='900px';${trigger}.focus()`);win.setContentSize(960,210);await pause(60);await key('Enter');
  await check('low viewport flips upward and clamps horizontally',`${menu}.dataset.direction==='up'&&${menu}.getBoundingClientRect().top>=8&&${menu}.getBoundingClientRect().right<=innerWidth-8`);
  await key('Escape');await js(`${trigger}.style.top='50px'`);win.setContentSize(960,100);await pause(60);await key('End');
  await check('tiny viewport internal scroll keeps active visible',`(()=>{const m=${menu},a=document.getElementById(${trigger}.getAttribute('aria-activedescendant')),mr=m.getBoundingClientRect(),ar=a.getBoundingClientRect();return m.scrollHeight>m.clientHeight&&mr.top>=8&&mr.bottom<=innerHeight-8&&ar.bottom<=mr.bottom+1&&ar.top>=mr.top-1;})()`);
  await key('Home');await check('tiny viewport Home active becomes visible',`document.getElementById('runtime-option-pi').getBoundingClientRect().top>=${menu}.getBoundingClientRect().top`);await key('Escape');
  win.setContentSize(960,620);await js(`${trigger}.style.position='';${trigger}.style.top='';${trigger}.style.left='';${trigger}.click();await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await check('project application closes pending menu',`${menu}.hidden`);
  await js(`document.getElementById('runtime-config-settings').click()`);await pause(60);
  await check('missing entry still opens existing Claude drawer',`window.__ansRenderer.state.rightTab==='pi'&&document.getElementById('drawer-title').textContent==='Claude 配置'`);
}
async function configChecks() {
  const notice=`document.getElementById('runtime-config-notice')`, msg=`document.getElementById('runtime-config-message')`, button=`document.getElementById('runtime-config-settings')`;
  await check('before import disabled and no notice',`document.getElementById('runtime-select').disabled&&${notice}.hidden`);
  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await check('programmatic no-project guard',`window.__ansRenderer.state.runtime==='pi'`);
  pickResult=null;await js(`document.getElementById('btn-import').click()`);await pause(60);
  await check('cancel initial import remains disabled',`document.getElementById('runtime-select').disabled`);
  pickResult=ROOT;listFailure=true;await js(`document.getElementById('btn-import').click()`);await pause(60);
  await check('failed initial import remains disabled',`document.getElementById('runtime-select').disabled`);
  listFailure=false;listing.roles=[];listing.hasRoles=false;listing.primaryRoleId=null;
  configMissing.pi=['ANTHROPIC_AUTH_TOKEN','ANS_PI_MODEL'];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await check('empty imported folder enables and checks Pi without role',`!document.getElementById('runtime-select').disabled&&!${notice}.hidden&&${msg}.textContent.includes('ANS_PI_MODEL')&&window.__ansRenderer.state.selectedRoleId===null`);
  configMissing.claude=['ANTHROPIC_API_KEY'];configMissing.codex=['CODEX_API_KEY','ANS_CODEX_MODEL'];
  await js(`await window.__ansRenderer.selectRuntime('claude')`);await pause(60);
  await check('closed drawer Claude missing key actionable outside chat',`!${notice}.hidden&&${msg}.textContent.includes('ANTHROPIC_API_KEY')&&${button}.textContent==='打开 Claude 设置'&&window.__ansRenderer.state.rightTab===null&&!document.getElementById('chat').textContent.includes('ANTHROPIC_API_KEY')`);
  await js(`${button}.focus()`);await key('Enter');await pause(60);
  await check('keyboard opens existing Claude settings',`window.__ansRenderer.state.rightTab==='pi'&&document.getElementById('drawer-title').textContent==='Claude 配置'&&document.getElementById('pi-inp-ANTHROPIC_API_KEY').value===''`);
  await js(`document.getElementById('drawer-close').click()`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(80);await check('notice fits '+width,`document.body.scrollWidth===innerWidth&&${button}.getBoundingClientRect().right<=innerWidth&&${notice}.getBoundingClientRect().bottom<=innerHeight`);fs.writeFileSync(path.join(OUT,'config-notice-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  configDeferred=true;await js(`await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRuntime('codex')`);
  configPending[1].resolve(runtimeConfig('codex'));await pause(60);configPending[0].resolve(runtimeConfig('pi'));await pause(60);
  await check('late engine response cannot replace Codex notice',`${msg}.textContent.includes('CODEX_API_KEY')&&!${msg}.textContent.includes('ANTHROPIC_AUTH_TOKEN')`);configPending=[];
  await js(`void window.__ansRenderer.loadPiConfig();await window.__ansRenderer.loadProject('/new-config-project')`);await pause(30);
  configPending[1].resolve(runtimeConfig('codex'));await pause(40);configPending[0].reject(new Error('old project failed'));await pause(40);
  await check('late old project error ignored',`${msg}.textContent.includes('CODEX_API_KEY')&&!${msg}.textContent.includes('读取')`);configPending=[];
  await js(`void window.__ansRenderer.loadPiConfig();void window.__ansRenderer.loadPiConfig()`);await pause(30);
  configPending[1].resolve({...runtimeConfig('codex'),missingKeys:[]});await pause(40);configPending[0].resolve(runtimeConfig('codex'));await pause(40);
  await check('older request on same engine cannot replace latest complete result',`${notice}.hidden`);configPending=[];configDeferred=false;
  configMalformed=true;await js(`await window.__ansRenderer.loadPiConfig()`);
  await check('missing summary treated as read failure',`${msg}.textContent.includes('读取 Codex 配置失败')&&!${button}.hidden`);configMalformed=false;
  pickResult=null;await js(`document.getElementById('btn-import').click()`);await pause(40);listFailure=true;pickResult=ROOT;await js(`document.getElementById('btn-import').click()`);await pause(40);listFailure=false;
  await check('existing project survives cancel and failed switch',`window.__ansRenderer.state.projectRoot==='/new-config-project'&&!document.getElementById('runtime-select').disabled&&window.__ansRenderer.state.runtime==='codex'`);
  configFailure=true;await js(`await window.__ansRenderer.loadPiConfig()`);
  await check('read failure offers settings and never complete',`${msg}.textContent.includes('读取 Codex 配置失败')&&!${button}.hidden&&!document.getElementById('pi-status').textContent.includes('齐备')`);configFailure=false;
  await js(`await window.__ansRenderer.selectRuntime('claude');window.__ansRenderer.openPiPanel()`);await pause(60);
  await js(`document.getElementById('pi-save').click()`);await pause(80);
  await check('successful save retains missing result',`document.getElementById('pi-status').textContent.includes('必填配置仍缺')&&${msg}.textContent.includes('ANTHROPIC_API_KEY')`);
  saveMode='fail';await js(`document.getElementById('pi-inp-ANTHROPIC_API_KEY').value='FAKE-DRAFT-ONLY';document.getElementById('pi-save').click()`);await pause(80);
  await check('save failure keeps draft and missing notice',`document.getElementById('pi-inp-ANTHROPIC_API_KEY').value==='FAKE-DRAFT-ONLY'&&document.getElementById('pi-status').textContent.includes('保存失败')&&!${notice}.hidden`);saveMode='success';configFailure=true;
  await js(`document.getElementById('pi-save').click()`);await pause(80);
  await check('save success read failure not overwritten',`document.getElementById('pi-status').textContent.includes('读取配置失败')&&!document.getElementById('pi-status').textContent.includes('已保存')&&${msg}.textContent.includes('读取 Claude 配置失败')`);configFailure=false;
  configMissing.claude=[];await js(`await window.__ansRenderer.loadPiConfig();document.getElementById('pi-save').click()`);await pause(80);
  await check('save complete hides missing and clears secret input',`${notice}.hidden&&document.getElementById('pi-status').textContent.includes('必填配置已齐备')&&document.getElementById('pi-inp-ANTHROPIC_API_KEY').value===''`);
  saveDeferred=true;await js(`document.getElementById('pi-save').click()`);await pause(30);
  await js(`await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRuntime('claude')`);await pause(50);
  savePending[0]({ok:true,appliedKeys:['OLD_SAVE'],application:'current'});await pause(50);saveDeferred=false;
  await check('save from prior visit cannot overwrite current status',`!document.getElementById('pi-status').textContent.includes('OLD_SAVE')&&document.getElementById('drawer-title').textContent==='Claude 配置'`);
}
async function runtimeChecks() {
  const runtimeRoles=[{roleId:'A'}, {roleId:'Pi适配器',group:'运行时接入组',groupDuty:'组员'}, {roleId:'Codex适配器',group:'运行时接入组',groupDuty:'组员'}, {roleId:'Claude适配器',group:'运行时接入组',groupDuty:'组员'}, {roleId:'运行时核心',group:'运行时接入组',groupDuty:'组长'}, {roleId:'项目管理',group:'项目协调组',groupDuty:'组长'}, {roleId:'未知职责',group:'测试 <script>window.INJECTED=1</script>',groupDuty:'<img src=x onerror=window.INJECTED=2>'}, {roleId:'B'}];
  listing.roles=runtimeRoles.map(r=>({...r,cardText:'# '+r.roleId,cardPath:'',boundary:{entries:[]},changelog:null,docs:[]}));
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('运行时核心')`);
  await check('runtime groups lead first and unknown metadata escaped',`(()=>{let e=document.getElementById('role-tree'),labels=[...e.querySelectorAll('.tree-group')].map(x=>x.textContent),lead=e.querySelector('.tree-group:nth-child(3)');return labels.includes('运行时接入组')&&labels.includes('项目协调组')&&labels.includes('其他角色（查看/调试）')&&[...e.querySelectorAll('.ti-name')].indexOf([...e.querySelectorAll('.ti-name')].find(x=>x.textContent==='运行时核心'))<[...e.querySelectorAll('.ti-name')].indexOf([...e.querySelectorAll('.ti-name')].find(x=>x.textContent==='Pi适配器'))&&!e.querySelector('script,img')&&!window.INJECTED;})()`);
  const roleId='运行时核心';
  const payload=(runtime,extra={})=>({projectRoot:ROOT,roleId,runtime,...extra});
  await push('session:history',payload('pi',{rows:[{kind:'assistant',text:'Pi专属历史'}]}));
  await push('session:role-state',payload('pi',{busy:true,summaries:['Pi队列'],queue:[{id:'pi-q',kind:'message',summary:'Pi队列',full:'Pi队列全文',runtime:'pi'}]}));
  await push('session:operator-request',payload('pi',{id:'pi-old-confirm',request:{kind:'confirm',title:'Pi旧轮确认'}}));
  await js(`document.getElementById('inp-message').value='Pi草稿';document.getElementById('inp-message').dispatchEvent(new Event('input'))`);
  await js(`window.__runtimeOldAction=document.querySelector('[data-request-id="pi-old-confirm"] .op-confirm')`);
  const stopCount=stops.length;
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  assert.equal(stops.length,stopCount,'dropdown preserves old backend work');
  const beforeOldYes=responses.length;await js(`window.__runtimeOldAction.click()`);await pause(30);assert.equal(responses.length,beforeOldYes,'hidden old engine action cannot answer new context');
  await check('new engine no Pi history queue confirmation or draft',`!document.getElementById('chat').textContent.includes('Pi专属历史')&&!document.getElementById('chat').textContent.includes('Pi队列')&&!document.querySelector('[data-request-id="pi-old-confirm"]')&&document.getElementById('inp-message').value===''&&window.__ansRenderer.state.runtime==='codex'`);
  await push('session:events',[payload('pi',{event:{kind:'message',summary:'后台Pi消息'}}),payload('codex',{event:{kind:'message',summary:'Codex当前消息'}}),{projectRoot:'/old-project',roleId,runtime:'codex',event:{kind:'message',summary:'旧项目不得出现'}}]);
  await push('session:role-state',payload('pi',{busy:true,summaries:['Pi后台队列'],queue:[]}));
  await check('old engine envelopes cache only and stale project ignored',`document.getElementById('chat').textContent.includes('Codex当前消息')&&!document.getElementById('chat').textContent.includes('后台Pi消息')&&!document.getElementById('chat').textContent.includes('旧项目不得出现')&&window.__ansRenderer.state.roleBusy['运行时核心']!==true`);
  await push('session:history',payload('codex',{rows:[{kind:'assistant',text:'Codex专属历史'}]}));
  await push('session:events',[payload('codex',{event:{runtime:'codex',turnId:'actual-turn',kind:'tool_call',summary:'read_file',detail:{toolName:'read_file',toolCallId:'actual-call',args:{path:'actual/codex.md'}}}}),payload('codex',{event:{runtime:'codex',turnId:'actual-turn',kind:'accepted',summary:'读取返回',detail:{toolName:'read_file',toolCallId:'actual-call',ok:true}}})]);
  await check('actual Codex call/result target correlation and completion',`(()=>{let rows=[...document.querySelectorAll('#chat .tool-activity')];return rows.some(r=>r.textContent.includes('actual/codex.md')&&r.textContent.includes('调用发起'))&&rows.some(r=>r.textContent.includes('actual/codex.md')&&r.textContent.includes('执行完成'));})()`);

  await js(`document.getElementById('inp-message').value='Codex请求';document.getElementById('btn-send').click()`);await pause(80);
  assert.deepEqual(sends.at(-1).target,{projectRoot:ROOT,roleId,runtime:'codex'},'send captured runtime target');
  await js(`document.getElementById('tab-pi').click()`);await pause(100);
  await check('Codex secret fallback and optional official Responses settings',`document.getElementById('drawer-title').textContent==='Codex 配置'&&document.getElementById('pi-inp-CODEX_API_KEY').value===''&&document.getElementById('pi-inp-CODEX_API_KEY').type==='password'&&document.getElementById('pi-panel').textContent.includes('回退（OPENAI_API_KEY）')&&document.getElementById('pi-panel').textContent.includes('Responses API')&&document.getElementById('pi-inp-ANS_CODEX_BASE_URL').value===''&&!document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN')`);
  saveMode='fail';await js(`document.getElementById('pi-inp-CODEX_API_KEY').value='FAKE-DRAFT-SECRET';document.getElementById('pi-inp-ANS_CODEX_MODEL').value='draft-model';document.getElementById('pi-save').click()`);await pause(100);
  await check('failed save keeps draft and honest error',`document.getElementById('pi-inp-CODEX_API_KEY').value==='FAKE-DRAFT-SECRET'&&document.getElementById('pi-inp-ANS_CODEX_MODEL').value==='draft-model'&&document.getElementById('pi-status').textContent.includes('离线原子写失败')&&!document.getElementById('pi-panel').textContent.includes('FAKE-DRAFT-SECRET')`);
  saveMode='success';saveApplication='after-active-turn';await js(`document.getElementById('pi-save').click()`);await pause(100);
  await check('saved secret cleared and busy apply timing truthful',`document.getElementById('pi-inp-CODEX_API_KEY').value===''&&document.getElementById('pi-status').textContent.includes('当前轮次继续使用原配置')`);
  for(const [width,height] of [[1360,860],[960,620]]) {
    win.setContentSize(width,height);await pause(150);
    await check('runtime settings geometry '+width,`(()=>{const body=document.getElementById('pi-panel'),select=document.getElementById('runtime-select').getBoundingClientRect(),chat=document.querySelector('.chat-head').getBoundingClientRect();return document.body.scrollWidth===innerWidth&&body.scrollWidth===body.clientWidth&&select.right<=innerWidth&&select.top>=chat.top&&select.bottom<=chat.bottom&&[...body.querySelectorAll('input')].every(x=>x.getBoundingClientRect().right<=innerWidth);})()`);
    fs.writeFileSync(path.join(OUT,'runtime-settings-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await js(`document.getElementById('drawer-close').click();await window.__ansRenderer.selectRuntime('claude')`);
  await js(`document.getElementById('tab-pi').click()`);await pause(100);
  await check('Claude required key and optional SDK model endpoint',`document.getElementById('drawer-title').textContent==='Claude 配置'&&document.getElementById('pi-inp-ANTHROPIC_API_KEY').type==='password'&&document.getElementById('pi-inp-ANS_CLAUDE_MODEL').value===''&&document.getElementById('pi-panel').textContent.includes('SDK 默认模型')&&!document.getElementById('pi-inp-CODEX_API_KEY')`);
  await js(`document.getElementById('drawer-close').click()`);
  await push('session:role-state',payload('claude',{busy:true,summaries:[],queue:[]}));
  await js(`document.getElementById('btn-halt').click()`);await pause(100);
  assert.deepEqual(aborts.at(-1),{projectRoot:ROOT,roleId,runtime:'claude'},'abort exact target');
  await push('session:events',[payload('claude',{event:{kind:'settled',summary:'本轮运行失败',detail:{outcome:'failed'}}})]);
  await check('failed outcome remains error',`window.__ansRenderer.state.roleMeta['运行时核心'].error===true`);
  await push('session:role-state',payload('claude',{busy:false,summaries:[],queue:[],contextSource:'fresh',contextWarning:'原生恢复失败，已重建上下文。'}));
  await check('failed native restore honest rebuilding notice',`document.getElementById('chat').textContent.includes('已重建上下文')&&!document.getElementById('chat').textContent.includes('模型上下文一并恢复')`);
  await push('shell:confirm-request',payload('pi',{id:'sc-runtime-old',command:'echo literal',summary:null,reasonPlain:'离线确认',cwd:ROOT,argvLines:[]}));
  await check('foreign runtime shell caches without showing in current engine',`document.getElementById('shell-confirm').hidden`);
  await push('session:operator-expired',payload('pi',{id:'sc-runtime-old',reason:'原shell轮次已中止'}));
  await push('session:operator-expired',payload('pi',{id:'pi-old-confirm',reason:'原轮次已中止'}));
  const responseCount=responses.length;
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await check('Pi own history background queue draft and expired card restored',`document.getElementById('chat').textContent.includes('Pi专属历史')&&document.getElementById('chat').textContent.includes('后台Pi消息')&&document.getElementById('chat').textContent.includes('Pi后台队列')&&document.getElementById('inp-message').value==='Pi草稿'&&document.querySelector('[data-request-id="pi-old-confirm"] .op-confirm').hidden&&document.querySelector('[data-request-id="pi-old-confirm"] .op-note').textContent.includes('原轮次已中止')`);
  await check('expired old shell shown disabled in its own runtime',`!document.getElementById('shell-confirm').hidden&&document.getElementById('sc-allow').disabled&&document.getElementById('sc-hint').textContent.includes('原shell轮次已中止')`);
  const shellCount=shellResponses.length;await js(`document.getElementById('sc-allow').click();document.getElementById('sc-close').click()`);await pause(30);assert.equal(shellResponses.length,shellCount,'expired shell cannot authorize and closing only dismisses');
  await js(`document.querySelector('[data-request-id="pi-old-confirm"] .op-confirm').click()`);await pause(40);
  assert.equal(responses.length,responseCount,'late yes cannot respond after expiry');
  for(const [width,height] of [[1360,860],[960,620]]) {win.setContentSize(width,height);await pause(120);fs.writeFileSync(path.join(OUT,'runtime-groups-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  assert.ok(opens.some(x=>x.runtime==='pi')&&opens.some(x=>x.runtime==='codex')&&opens.some(x=>x.runtime==='claude'),'three real choices reach bridge');
  for(const runtime of ['pi','codex','claude'])assert.ok(histories.some(x=>x.projectRoot===ROOT&&x.roleId===roleId&&x.runtime===runtime),'history exact '+runtime);
  reports.push({name:'runtime bridge targets',opens:opens.slice(-8),histories:histories.slice(-8),aborts:aborts.slice(-1),configSaves});
}
async function mergeChecks() {
  listing.roles=roles;
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);
  const payload=(runtime,roleId,extra={})=>({projectRoot:ROOT,roleId,runtime,...extra});
  const row=(turnId,kind,text,eventKind)=>({turnId,kind,text,eventKind,at:''});
  const live=(runtime,roleId,turnId,kind,summary,extra={})=>payload(runtime,roleId,{event:{turnId,runtime,kind,summary,...extra}});
  async function history(runtime,roleId,rows){const h=payload(runtime,roleId,{rows,error:null,skipped:0});mergeHistories.set(runtime+'|'+roleId,h);await push('session:history',h);}
  const older=[row('old','user','old input'),row('old','assistant','old history retained','message')];
  await history('pi','A',older);
  await push('session:events',[live('pi','A','current','tool_call','read_file',{detail:{toolName:'read_file',toolCallId:'current-call',args:{path:'current.md'}}}),live('pi','A','current','denied','current rejection',{detail:{toolName:'read_file',toolCallId:'current-call',ok:false}}),live('pi','A','current','message','current answer'),live('pi','A','current','settled','current settled'),payload('pi','A',{event:{kind:'handback',summary:'handback',handback:{roleId:'A',turnId:'current',status:'unreported',summary:'current report remains',evidence:[],at:''}}})]);
  await push('session:operator-request',payload('pi','A',{id:'merge-confirm',request:{kind:'confirm',title:'merge pending card'}}));
  await js(`window.__mergeCard=document.querySelector('[data-request-id="merge-confirm"]')`);
  const current=[row('current','user','current input'),{...row('current','tool','read_file','tool_call'),activity:{toolName:'read_file',toolCallId:'current-call',turnId:'current',target:'current.md',phase:'call',status:'call'}},{...row('current','denied','current rejection','denied'),activity:{toolName:'read_file',toolCallId:'current-call',turnId:'current',target:'current.md',phase:'blocked',status:'failed'}},row('current','assistant','current answer','message')];
  await history('pi','A',[...older,...current]);
  await check('same-turn live then history only one response rejection and old history',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='current answer').length===1&&[...document.querySelectorAll('#chat .sys-denied')].filter(x=>x.textContent.includes('current rejection')).length===1&&document.getElementById('chat').textContent.includes('old history retained')`);
  mergeReplayAfterList=true;await push('project:changed',{});
  await check('real project-changed refresh does not repeat current turn',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='current answer').length===1&&[...document.querySelectorAll('#chat .msg-handback')].filter(x=>x.textContent.includes('current report remains')).length===1`);
  await push('session:events',[live('pi','A','not-yet-stored','message','not stored yet')]);
  const rewritten=[row('prefix','assistant','inserted past history','message'),...older,...current];
  await history('pi','A',rewritten);
  await check('full rebuild retains unpersisted live report settled and original pending card',`document.getElementById('chat').textContent.includes('not stored yet')&&document.getElementById('chat').textContent.includes('inserted past history')&&document.querySelector('[data-request-id="merge-confirm"]')===window.__mergeCard&&!window.__mergeCard.querySelector('.op-confirm').hidden&&[...document.querySelectorAll('#chat .sys-settled')].filter(x=>x.textContent.trim()==='current settled').length===1&&document.querySelectorAll('#chat .msg-handback').length===1`);
  const firstBeforeLive=row('history-first','assistant','history before live','message');
  await history('pi','A',[...rewritten,firstBeforeLive]);
  await push('session:events',[live('pi','A','history-first','message','history before live')]);
  await check('history first then exact live event does not duplicate',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='history before live').length===1`);
  await push('session:events',[live('pi','A','history-first','message','history before live')]);
  const repeated=[...rewritten,firstBeforeLive,firstBeforeLive];await history('pi','A',repeated);
  await check('two legitimate same-turn identical events remain two occurrences',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='history before live').length===2`);
  await push('session:events',[live('pi','A','identical-1','message','two identical answers'),live('pi','A','identical-2','message','two identical answers')]);
  await history('pi','A',[...repeated,row('identical-1','user','two identical inputs'),row('identical-1','assistant','two identical answers','message'),row('identical-2','user','two identical inputs'),row('identical-2','assistant','two identical answers','message')]);
  await check('distinct turns with identical input and output remain two',`[...document.querySelectorAll('#chat .msg-user')].filter(x=>x.textContent.trim()==='two identical inputs').length===2&&[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='two identical answers').length===2`);
  await push('session:events',[live('codex','A','bg','message','background authoritative answer')]);
  await history('codex','A',[row('bg','user','background input'),row('bg','assistant','background authoritative answer','message')]);
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await check('background engine merges in own cache without old engine rows',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='background authoritative answer').length===1&&!document.getElementById('chat').textContent.includes('current answer')`);
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  sendQueued=true;
  await js(`document.getElementById('inp-message').value='manual identical';document.getElementById('btn-send').click()`);await pause(70);
  const first=sends.at(-1);await js(`document.getElementById('inp-message').value='manual identical';document.getElementById('btn-send').click()`);await pause(70);
  const second=sends.at(-1);assert.equal(typeof first.metadata.clientMessageId,'string','first exact client ID crossed real preload');assert.notEqual(first.metadata.clientMessageId,second.metadata.clientMessageId,'identical sends own different IDs');
  const previous=mergeHistories.get('pi|A').rows;
  await history('pi','A',[...previous,row('manual-1','user','manual identical'),row('manual-2','user','manual identical')]);
  await push('session:events',[{...live('pi','A','manual-1','message','manual answer one'),clientMessageId:first.metadata.clientMessageId},{...live('pi','A','manual-2','message','manual answer two'),clientMessageId:second.metadata.clientMessageId}]);
  await check('history-before-correlated-live binds two identical optimistic inputs exactly once',`[...document.querySelectorAll('#chat .msg-user')].filter(x=>x.textContent.trim()==='manual identical').length===2&&document.getElementById('chat').textContent.includes('manual answer one')&&document.getElementById('chat').textContent.includes('manual answer two')`);
  await check('repeated known-turn full rebuild keeps original unanchored pending card without borrowed token',`document.querySelector('[data-request-id="merge-confirm"]')===window.__mergeCard&&!window.__mergeCard.querySelector('.op-confirm').hidden`);
  sendQueued=false;mergeReplayAfterList=false;
  await js(`await window.__ansRenderer.selectRole('B')`);
  const anchored=parseSessionJsonl([{type:'session'},
    {type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'legacy-request',name:'request_confirmation',arguments:{title:'legacy decided anchor'}}]}},
    {type:'message',message:{role:'toolResult',toolName:'request_confirmation',toolCallId:'legacy-request',isError:true,content:[{type:'text',text:'未获同意：legacy conclusion'}]}},
    {type:'message',message:{role:'assistant',content:[{type:'text',text:'legacy after conclusion'}]}}
  ].map(x=>JSON.stringify(x)).join('\n')).rows;
  await history('pi','B',anchored);
  await push('session:operator-request',payload('pi','B',{id:'legacy-decided',anchorKey:anchored[0].anchorKey,request:{kind:'confirm',title:'legacy decided anchor'}}));
  await js(`window.__legacyDecidedCard=document.querySelector('[data-request-id="legacy-decided"]');window.__legacyDecidedCard.querySelector('.op-deny').click()`);await pause(60);
  await history('pi','B',[{kind:'assistant',text:'legacy prefix',at:''},...anchored]);
  await check('legacy decided full replay reuses original card between actual request and conclusion',`(()=>{let a=window.__ansRenderer.replayAnchorDebug('B').find(x=>x.anchorKey===${JSON.stringify('confirm\u0000legacy decided anchor')}),m=window.__ansRenderer.rowModelDebug('B'),card=document.querySelector('[data-request-id="legacy-decided"]'),op=m.operators.find(x=>x.requestId==='legacy-decided');return !!a&&card===window.__legacyDecidedCard&&op.index===a.requestIndex+1&&op.index<a.conclusionIndex&&card.querySelector('.op-confirm').hidden&&card.querySelector('.op-note').textContent.includes('不同意');})()`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await history('pi','B',[{kind:'assistant',text:'background legacy prefix',at:''},{kind:'assistant',text:'legacy prefix',at:''},...anchored]);
  await js(`await window.__ansRenderer.selectRole('B')`);
  await check('background legacy rebuild keeps exact decided DOM and shifted anchor indices',`(()=>{let a=window.__ansRenderer.replayAnchorDebug('B').find(x=>x.anchorKey===${JSON.stringify('confirm\u0000legacy decided anchor')}),m=window.__ansRenderer.rowModelDebug('B'),op=m.operators.find(x=>x.requestId==='legacy-decided');return document.querySelector('[data-request-id="legacy-decided"]')===window.__legacyDecidedCard&&op.index===a.requestIndex+1&&a.conclusionIndex===op.index+1&&m.operators.length===1;})()`);

  const legacy=[{kind:'assistant',text:'legacy identical',at:'1'},{kind:'assistant',text:'legacy identical',at:'2'}];
  await history('pi','B',legacy);await history('pi','B',legacy);
  await check('unknown legacy no false text-set dedup and old replay stays idempotent',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='legacy identical').length===2`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(80);fs.writeFileSync(path.join(OUT,'merge-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
}
app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},60000);
 try {
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:INTERACTIVE,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await win.loadFile(path.join(APP,'renderer/index.html'));win.setTitle('ANS UI/UX 离线验收');await pause(150);
  if(PROJECT_RESET_ONLY){await projectResetChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('PROJECT_RESET_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(DUP_ONLY){await duplicateChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('DUP_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(SELECTOR_ONLY){await selectorChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,configReads},null,2));console.log('SELECTOR_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(CONFIG_ONLY){await configChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('CONFIG_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(process.env.ANS_MERGE_UI_ONLY==='1'){await mergeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends:sends.map(x=>({text:x.text,target:x.target,clientMessageId:x.metadata&&x.metadata.clientMessageId}))},null,2));console.log('MERGE_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(process.env.ANS_RUNTIME_UI_ONLY==='1'){await runtimeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends},null,2));console.log('RUNTIME_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  await push('session:role-state',snapshot());
  await push('session:events',activityEvents());
  await check('routine collapsed; failure direct; assistant untouched',`document.querySelectorAll('#chat .tool-records').length===2&&!document.querySelector('#chat .tool-records').open&&document.querySelector('#chat .sys-denied').textContent.includes('missing.md')&&document.querySelector('#chat .msg-assistant').textContent==='真实助手答复保持原文。'`);
  await check('single brief real write fact',`document.getElementById('chat-role-sub').hidden&&document.getElementById('chat-role-sub').textContent===''&&document.getElementById('runtime-note').textContent==='实际写入导入项目，角色边界外的写入会被拒绝。'`);
  await check('default failure shows known path',`document.querySelector('#chat .sys-denied > summary').textContent.includes('missing.md')&&document.querySelector('#chat .sys-denied').open===false`);
  await push('session:events',[event('denied','read_file 执行失败',{toolName:'read_file',path:'known/'+('long-target/'.repeat(30))+'lost.md',status:'failed'}),event('denied','未执行：命令被拒绝',{toolName:'run_shell'})]);
  await push('session:events',[event('denied','run_shell 已执行：false; echo literal（exit 2）',{toolName:'run_shell',status:'failed'})]);
  await check('known shell exit survives literal semicolon',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('false; echo literal')&&x.textContent.includes('exit 2'))`);
  await check('full target plus unknown target honest',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('long-target/'.repeat(30))&&x.textContent.includes('lost.md'))&&[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('未执行：命令被拒绝')&&x.textContent.includes('目标未记录'))`);
  await check('live failed reason visible in summary',`document.querySelector('#chat .sys-denied > summary').textContent.includes('文件不存在')`);
  await push('session:events',[event('denied','拒绝写入：目标不在角色允许范围',{toolName:'write_file',path:'outside.md'})]);
  await check('before-execution rejection keeps visible reason',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('目标不在角色允许范围')&&!x.textContent.includes('执行失败'))`);
  await check('unknown is honest count',`document.querySelector('#chat .tool-records summary').textContent.includes('3 条活动')&&document.querySelector('#chat .tool-records summary').textContent.includes('状态未记录')`);
  await js(`document.getElementById('tab-card').click()`);await pause(160);
  await check('one work list precedes collapsed full documents',`document.querySelectorAll('#right-body #right-queue-body').length===1&&document.querySelectorAll('#right-body .q-item').length===4&&!document.querySelector('#right-body details').open&&!document.getElementById('right-queue-overview')&&document.getElementById('drawer-title').textContent.includes('A')`);
  await js(`document.querySelector('#right-body .q-toggle').click();document.querySelector('#right-body details').open=true;document.getElementById('inp-message').value='A draft';document.getElementById('inp-message').dispatchEvent(new Event('input'));`);
  await push('session:role-state',snapshot());
  await check('snapshot keeps full and document open',`!document.querySelector('#right-body .q-full').hidden&&document.querySelector('#right-body details').open`);
  await js(`document.getElementById('btn-attach-image').click()`);await pause(80);
  await js(`document.getElementById('drawer-close').focus()`);await key('Tab');await check('keyboard tabs to full',`document.activeElement.classList.contains('q-toggle')`);await key('Enter');await check('keyboard collapses full',`document.querySelector('#right-body .q-full').hidden===true`);await key('Enter');await check('keyboard expands full',`document.querySelector('#right-body .q-full').hidden===false`);await key('Tab');await check('keyboard tabs to withdraw',`document.activeElement.classList.contains('q-withdraw')`);
  for(const [width,height] of [[1360,860],[960,620]]) {
    win.setContentSize(width,height);await pause(100);
    await check(`role geometry ${width}`,viewportGeometry);
    await check(`queue full/grid/action rect ${width}`,`(()=>{let b=document.getElementById('right-body'),i=b.querySelector('.q-item:not(.is-running)'),f=b.querySelector('.q-full'),a=f.closest('.q-item').querySelector('.q-actions'),t=f.closest('.q-item').querySelector('.q-text'),buttons=[...b.querySelectorAll('.q-toggle,.q-withdraw')];return b.scrollWidth===b.clientWidth&&getComputedStyle(i).display==='grid'&&Math.abs(f.getBoundingClientRect().left-t.getBoundingClientRect().left)<1&&Math.abs(a.getBoundingClientRect().left-t.getBoundingClientRect().left)<1&&buttons.every(x=>{let r=x.getBoundingClientRect();return r.height>=28&&r.right<=b.getBoundingClientRect().right;});})()`);
    reports.push({name:'queue geometry '+width,value:await js(`(()=>{let b=document.getElementById('right-body'),f=b.querySelector('.q-full');return {clientWidth:b.clientWidth,scrollWidth:b.scrollWidth,full:f.getBoundingClientRect().toJSON(),actions:[...b.querySelectorAll('.q-toggle,.q-withdraw')].map(x=>({label:x.textContent,rect:x.getBoundingClientRect().toJSON()}))};})()`)});
    const chatWidth=await js(`document.getElementById('chat').getBoundingClientRect().width`);
    await js(`document.getElementById('tab-pi').click()`);await pause(160);
    await check(`pi geometry ${width}`,viewportGeometry);
    await check(`Pi only one title/close ${width}`,`!document.querySelector('.pi-panel-title')&&!document.getElementById('pi-close')&&document.getElementById('drawer-title').textContent==='Pi 配置'&&document.getElementById('pi-panel-path').scrollWidth<=document.getElementById('pi-panel-path').clientWidth`);
    assert.equal(await js(`document.getElementById('chat').getBoundingClientRect().width`),chatWidth,'no reflow');
    await js(`document.getElementById('inp-message').value='line\\n'.repeat(14);document.getElementById('inp-message').dispatchEvent(new Event('input'));`);await pause(80);
    await check(`growing composer avoids drawer ${width}`,viewportGeometry);
    await js(`document.getElementById('drawer-close').click()`);await pause(160);
    await check(`closed no horizontal overflow ${width}`,`document.body.scrollWidth===innerWidth&&document.querySelector('.app').scrollWidth===document.querySelector('.app').clientWidth`);
    await js(`document.getElementById('tab-card').click()`);await pause(160);
  }
  await js(`document.getElementById('inp-message').value='A draft';await window.__ansRenderer.selectRole('B');document.getElementById('inp-message').value='B draft'`);
  await check('B independent no A image',`document.querySelectorAll('#attach-row .attach-chip').length===0&&!document.getElementById('right-body').textContent.includes('客户长消息')`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await check('A draft image resources full restored',`document.getElementById('inp-message').value==='A draft'&&document.querySelectorAll('#attach-row .attach-chip').length===1&&!document.querySelector('#right-body .q-full').hidden&&document.querySelector('#right-body details').open`);
  pickDeferred=true;await js(`document.getElementById('btn-attach-image').click()`);await pause(50);await js(`await window.__ansRenderer.selectRole('B')`);
  pickResolve({ok:true,image:{name:'late.png',mime:'image/png',size:68,dataBase64:PNG}});await pause(70);
  await check('late pick does not touch B',`document.getElementById('inp-message').value==='B draft'&&document.querySelectorAll('#attach-row .attach-chip').length===0`);
  await js(`await window.__ansRenderer.selectRole('A')`);await check('late pick stored in A',`document.querySelectorAll('#attach-row .attach-chip').length===2`);
  sendDeferred=true;await js(`document.getElementById('btn-send').click()`);await pause(40);await js(`await window.__ansRenderer.selectRole('B');document.getElementById('inp-message').value='B new draft'`);
  sendResolve({ok:true});await pause(70);
  await check('late send leaves B untouched',`document.getElementById('inp-message').value==='B new draft'`);
  await js(`await window.__ansRenderer.selectRole('A')`);await check('success clears original A sent items',`document.getElementById('inp-message').value===''&&document.querySelectorAll('#attach-row .attach-chip').length===0`);
  assert.equal(sends[0].images.length,2,'actual preload sends both images');
  await js(`document.getElementById('btn-halt').click()`);await pause(80);
  await check('halt preserves queued 3/full',`document.querySelectorAll('#right-body .q-item').length===3&&!document.querySelector('#right-body .q-full').hidden&&document.getElementById('btn-halt').hidden`);
  pickDeferred=false;
  await js(`document.getElementById('inp-message').value='撤回时保留的草稿';document.getElementById('inp-message').dispatchEvent(new Event('input'));document.getElementById('btn-attach-image').click()`);await pause(80);
  await js(`document.querySelector('#right-body .q-withdraw').click()`);await pause(40);
  await check('withdraw pending retains item',`document.querySelectorAll('#right-body .q-item').length===3&&document.querySelector('#right-body .q-withdraw').disabled`);
  withdrawResolve();await pause(80);await check('failed withdraw full retained',`document.querySelectorAll('#right-body .q-item').length===3&&!document.querySelector('#right-body .q-full').hidden&&!document.querySelector('#right-body .q-withdraw').disabled`);
  await check('withdraw failure inline next to action',`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控拒绝')&&document.querySelector('#right-body .q-feedback').getBoundingClientRect().top-document.querySelector('#right-body .q-actions').getBoundingClientRect().bottom<=8`);
  await check('withdraw failure keeps draft image resources',`document.getElementById('inp-message').value==='撤回时保留的草稿'&&document.querySelectorAll('#attach-row .attach-chip').length===1&&document.querySelector('#right-body details').open`);
  withdrawMode='throw';await js(`document.querySelector('#right-body .q-withdraw').focus()`);await key('Enter');await pause(40);withdrawResolve();await pause(80);
  await check('thrown withdrawal error inline and retryable',`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控网络不可用')&&!document.querySelector('#right-body .q-withdraw').disabled`);
  await check('keyboard withdrawal response retains same action',`document.activeElement.classList.contains('q-withdraw')`);
  withdrawMode='fail';await js(`document.querySelector('#right-body .q-withdraw').click()`);await pause(40);withdrawResolve();await pause(70);
  await push('session:role-state',snapshot(false));
  await check('snapshot preserves failure inline',`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控拒绝')`);
  await js(`document.querySelector('#right-body .q-withdraw').click()`);await pause(40);
  await js(`await window.__ansRenderer.selectRole('B')`);withdrawResolve();await pause(70);
  await check('late withdraw not B feedback',`!document.querySelector('#right-body .q-feedback')`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await check('late withdraw belongs A item',`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控拒绝')&&!document.querySelector('#right-body .q-full').hidden`);
  withdrawMode='success';await js(`document.querySelector('#right-body .q-withdraw').click()`);await pause(40);withdrawResolve();await pause(80);
  await check('success uses real returned snapshot',`document.querySelectorAll('#right-body .q-item').length===2&&document.querySelectorAll('#right-body .q-withdraw').length===0`);
  await push('session:history',{roleId:'A',projectRoot:ROOT,rows:ownHistory()});
  await check('historical own-template failures direct',`document.querySelectorAll('#chat .sys-denied').length>=3&&document.getElementById('chat').textContent.includes('exit 1')&&!document.getElementById('chat').textContent.includes('SECRET')`);
  await check('historical failure reasons visible without expand',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('exit 1'))&&[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('lost.md')&&x.textContent.includes('ENOENT')&&!x.textContent.includes('目标未记录'))`);
  const longRows=[];for(let i=0;i<220;i++){longRows.push({kind:'assistant',text:'row-'+i+' 长聊天验证。'.repeat(12),at:''});if(i===120)for(let j=0;j<24;j++)longRows.push({kind:'tool',text:'调用工具 read_file',at:'',activity:{toolName:'read_file',target:'file-'+j+'.md',toolCallId:'long-'+j,phase:'call',status:'call'}});}
  await push('session:history',{roleId:'A',projectRoot:ROOT,rows:longRows});
  await js(`document.getElementById('drawer-close').click();document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight*.55`);await pause(100);
  await check('virtual visible nonempty',`[...document.querySelectorAll('#chat .msg')].some(e=>{let r=e.getBoundingClientRect(),c=document.getElementById('chat').getBoundingClientRect();return r.bottom>c.top&&r.top<c.bottom;})&&window.__ansRenderer.rowModelDebug('A').count>150`);
  const before=await reading();await push('session:history',{roleId:'A',projectRoot:ROOT,rows:longRows.concat([{kind:'assistant',text:'appended tail',at:''}])});const after=await reading();
  reports.push({name:'incremental reader anchor',before,after});assert.equal(after.text,before.text);assert.ok(Math.abs(after.offset-before.offset)<2,'reader offset preserved');
  await js(`let r=document.querySelector('#chat .tool-records');if(r)r.open=true`);await pause(80);
  await check('group materialized and open',`document.querySelector('#chat .tool-records')?.open===true`);
  await push('session:events',[event('tool_call','开始执行 read_file',{toolName:'read_file',path:'late.md'})]);
  await check('user-open group survives unrelated incremental',`document.querySelector('#chat .tool-records')?.open===true`);
  const readingBeforeFull=await reading();
  const rewritten=[{kind:'assistant',text:'inserted prefix',at:''},...longRows,{kind:'assistant',text:'appended tail',at:''}];
  await push('session:history',{roleId:'A',projectRoot:ROOT,rows:rewritten});
  await check('stable group restored after full prefix insertion',`document.querySelector('#chat .tool-records')?.open===true`);
  const readingAfterFull=await reading();reports.push({name:'full replay preserves content identity',before:readingBeforeFull,after:readingAfterFull});
  assert.equal(readingBeforeFull.text,readingAfterFull.text);assert.ok(Math.abs(readingBeforeFull.offset-readingAfterFull.offset)<2);
  // ——— 虚拟行锚点回归（2026-10-14 修复钉）：长会话里反复开合「执行记录组」，组前正文不得位移累积。
  // 断言写成与设计无关的不变量：以**同一段正文元素**（row-120，组前紧邻行）为锚，四轮开合全程其相对
  // 聊天顶的偏移全程波动 <2px（展开后复位、无逐轮累积、不跳位）。修前该值逐轮 +2px 累积、约 5 轮后
  // 越过一行高度导致首可见行切换（fix/2026-10-14 记录里有 A/B 数据）。
  const anchorInfo=()=>js(`(()=>{const c=document.getElementById('chat'),t=c.getBoundingClientRect().top;const n=[...c.querySelectorAll('.msg')].find(e=>e.textContent.startsWith('row-120 '));const r=n?n.getBoundingClientRect():null;const g=document.querySelector('#chat .tool-records');return {found:!!n,parented:!!(n&&n.parentNode&&n.parentNode.classList.contains('chat-pane')),offset:r?r.top-t:null,open:g?g.open:null,scrollTop:c.scrollTop};})()`);
  async function toggleDrift(label,width,height){
    win.setContentSize(width,height);await pause(150);
    await js(`(()=>{const c=document.getElementById('chat'),n=document.querySelector('#chat .tool-records');n.open=true;c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);await pause(150);
    assert.equal(await js(`document.querySelectorAll('#chat .tool-records').length`),1,`toggle fixture single group ${label}`);
    const base=await anchorInfo();assert.ok(base.found&&base.parented,`anchor paragraph materialized ${label}`);
    const offsets=[base.offset];
    for(let cycle=0;cycle<4;cycle++){
      await js(`document.querySelector('#chat .tool-records').open=false`);await pause(150);
      const a=await anchorInfo();assert.ok(a.found&&a.parented,`anchor materialized after collapse ${cycle} ${label}`);assert.equal(a.open,false);offsets.push(a.offset);
      await js(`document.querySelector('#chat .tool-records').open=true`);await pause(150);
      const b=await anchorInfo();assert.ok(b.found&&b.parented,`anchor materialized after expand ${cycle} ${label}`);assert.equal(b.open,true);offsets.push(b.offset);
    }
    const spread=Math.max(...offsets)-Math.min(...offsets);
    reports.push({name:`activity group toggle reader anchor ${label}`,offsets,spread});
    assert.ok(spread<2,`反复开合执行记录组不位移组前正文（${label} spread=${spread}）`);
  }
  await toggleDrift('960',960,620);
  await toggleDrift('1360',1360,860);
  win.setContentSize(960,620);await pause(120);
  // ——— 脱离文档送史（后台角色/恢复数据先于挂载推达）后首次挂载的锚点稳定性（2026-10-14 口径缓存回归钉）：
  // 行表可能在 pane **未挂载**时建成——此时 `getComputedStyle` 读不到样式表（返回空），若把读不到当 0
  // 落缓存，该角色挂载后整个 pane 都会退回「不含行距」的错口径、开合组重新漂移（本用例即该路径）。
  await js(`await window.__ansRenderer.selectRole('A')`);await pause(150);
  await push('session:history',{roleId:'C',projectRoot:ROOT,rows:longRows});
  await check('detached-pane role rowlist built before mount',`(()=>{const m=window.__ansRenderer.rowModelDebug('C');return !!m&&m.count>150&&!document.querySelector('#chat .chat-pane[data-role-id="C"]');})()`);
  await js(`await window.__ansRenderer.selectRole('C')`);await pause(250);
  await check('detached-history role mounted windowed',`(()=>{const p=document.querySelector('#chat .chat-pane[data-role-id="C"]');return !!p&&document.querySelectorAll('#chat .chat-pane > .virt-spacer').length===2;})()`);
  // 口径缓存不变量（设计无关）：C 行表建于未挂载期，挂载后其行距缓存必须与始终已挂载的 A 相同且已读到（>0）。
  // 反例（把脱离文档读到的空值当 0 落缓存）修前实测：C.rowGap=0 vs A.rowGap=16（见 2026-10-14 fix 记录）。
  await check('detached-history pane reads same row gap as attached pane',`(()=>{const c=window.__ansRenderer.rowModelDebug('C'),a=window.__ansRenderer.rowModelDebug('A');return !!c&&!!a&&c.rowGap>0&&c.rowGap===a.rowGap;})()`);
  await js(`(()=>{const c=document.getElementById('chat');c.scrollTop=Math.floor((c.scrollHeight-c.clientHeight)*0.5);})()`);await pause(200);
  await toggleDrift('detached-history',960,620);
  await js(`await window.__ansRenderer.selectRole('A')`);await pause(200);
  const requestRows=parseSessionJsonl([{type:'session'},
    {type:'message',message:{role:'assistant',content:[{type:'toolCall',name:'request_confirmation',id:'conf-1',arguments:{title:'拒绝后原位'}}]}},
    {type:'message',message:{role:'toolResult',toolName:'request_confirmation',toolCallId:'conf-1',isError:true,content:[{type:'text',text:'未获同意'}]}}
  ].map(x=>JSON.stringify(x)).join('\n')).rows;
  await push('session:history',{roleId:'B',projectRoot:ROOT,rows:requestRows});
  await push('session:operator-request',{id:'decided-fixture',roleId:'B',anchorKey:requestRows[0].anchorKey,request:{kind:'confirm',title:'拒绝后原位'}});
  await js(`await window.__ansRenderer.selectRole('B');document.querySelector('#chat .op-deny').click()`);await pause(70);
  await push('session:history',{roleId:'B',projectRoot:ROOT,rows:[{kind:'assistant',text:'前插说明',at:''},...requestRows]});
  await check('denied conclusion anchor and decided card retained',`(()=>{let a=window.__ansRenderer.replayAnchorDebug('B')[0],m=window.__ansRenderer.rowModelDebug('B');return a.requestIndex!==null&&a.conclusionIndex!==null&&m.operators.length===1&&m.operators[0].index===a.requestIndex+1&&document.querySelector('#chat .op-confirm').hidden;})()`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await push('session:operator-request',{id:'pending-fixture',roleId:'A',request:{kind:'confirm',title:'真实接口形状的离线未决',preview:'需确认'}});
  await js(`await window.__ansRenderer.selectRole('B');await window.__ansRenderer.selectRole('A')`);await pause(80);
  await check('pending locator visible after role click',`(()=>{let x=document.querySelector('#chat .op-request'),c=document.getElementById('chat').getBoundingClientRect(),r=x?.getBoundingClientRect();return !!r&&r.top>=c.top&&r.bottom<=c.bottom;})()`);
  await push('session:role-state',snapshot(true));
  await check('open pending supersedes true busy',`document.querySelector('#chat .tool-current').textContent==='等待你确认'&&window.__ansRenderer.state.roleBusy.A===true`);
  for(const mode of ['card','pi']) {
    await js(`document.getElementById('tab-${mode}').click()`);await pause(160);
    await check(`pending entry fully reachable with ${mode} 960`,`(()=>{let e=document.getElementById('op-chip'),r=e.getBoundingClientRect(),d=document.getElementById('right-drawer').getBoundingClientRect();return e.tagName==='BUTTON'&&!e.hidden&&r.left>=272&&r.right<=d.left&&r.top>=36&&r.bottom<=innerHeight;})()`);
    await check(`covered pending actions unavailable ${mode}`,`document.querySelector('#chat .op-request').inert===true&&getComputedStyle(document.querySelector('#chat .op-actions')).visibility==='hidden'`);
    await js(`document.getElementById('op-chip').focus()`);await key('Enter');await pause(140);
    reports.push({name:'pending geometry '+mode,value:await js(`(()=>{let c=document.getElementById('chat').getBoundingClientRect(),e=document.querySelector('#chat .op-request');return {chat:c.toJSON(),card:e.getBoundingClientRect().toJSON(),buttons:[...e.querySelectorAll('.op-actions button')].map(b=>({hidden:b.hidden,inert:e.inert,rect:b.getBoundingClientRect().toJSON()})),active:document.activeElement.className,drawer:document.getElementById('right-drawer').className};})()`)});
    await check(`keyboard locate closes ${mode} and exposes all actions`,`(()=>{let c=document.getElementById('chat').getBoundingClientRect(),e=document.querySelector('#chat .op-request'),r=e.getBoundingClientRect(),buttons=[...e.querySelectorAll('.op-actions button')];return !e.inert&&!document.getElementById('right-drawer').classList.contains('open')&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom&&buttons.every(b=>{let x=b.getBoundingClientRect();return x.left>=c.left&&x.right<=c.right&&x.top>=c.top&&x.bottom<=c.bottom;})&&document.activeElement===e;})()`);
  }
  await key('Tab');await check('keyboard reaches original preview',`document.activeElement.matches('.op-preview > summary')`);await key('Enter');await check('keyboard expands original preview',`document.querySelector('#chat .op-request .op-preview').open`);await key('Tab');await check('keyboard enters original confirm action',`document.activeElement.classList.contains('op-confirm')`);
  await key('Tab');await check('keyboard reaches deny action',`document.activeElement.classList.contains('op-deny')`);
  await key('Enter');await pause(80);
  await check('answered pending returns to true busy',`document.getElementById('op-chip').hidden&&document.querySelector('#chat .tool-current').textContent==='正在工作'`);
  await push('session:role-state',snapshot(false));
  await check('idle after answered removes work',`!document.querySelector('#chat .tool-current')`);
  await key('Tab');await check('keyboard reaches retained image removal',`document.activeElement.classList.contains('attach-rm')`);await key('Tab');await check('keyboard returns to composer image',`document.activeElement.id==='btn-attach-image'`);await key('Tab');await check('keyboard returns to input',`document.activeElement.id==='inp-message'`);
  operatorMode='expired';await push('session:role-state',snapshot(true));await js(`document.getElementById('tab-card').click()`);
  await push('session:operator-request',{id:'expired-fixture',roleId:'A',request:{kind:'confirm',title:'失效回执检查'}});
  await check('pending arrival preserves drawer',`document.getElementById('right-drawer').classList.contains('open')&&document.querySelector('#chat .tool-current').textContent==='等待你确认'`);
  await js(`document.getElementById('op-chip').click();document.querySelector('[data-request-id="expired-fixture"] .op-deny').click()`);await pause(80);
  await check('expired request restores actual true busy',`document.getElementById('op-chip').hidden&&document.querySelector('#chat .tool-current').textContent==='正在工作'&&document.querySelector('[data-request-id="expired-fixture"] .op-confirm').hidden`);
  operatorMode='normal';await push('session:role-state',snapshot(false));
  await push('session:events',[event('message','普通助手追问：请补充验收标准。')]);
  await check('ordinary question creates no pending',`document.getElementById('op-chip').hidden&&!document.querySelector('#chat .tool-current')`);
  await runtimeChecks();
  if(errors.length) reports.push({name:'renderer console errors',errors});assert.equal(errors.length,0);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends},null,2));
  console.log('UIUX_V2_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);
  if(INTERACTIVE){
    interactiveReady=true;activeQueue=queue.slice();
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await pause(200);
    win.setTitle('ANS UI/UX 离线验收');win.setContentSize(Number(process.env.ANS_UIUX_WIDTH)||1360,Number(process.env.ANS_UIUX_WIDTH)===960?620:860);
    await push('session:role-state',snapshot());await push('session:events',activityEvents());
    await push('session:operator-request',{id:'preview-pending',roleId:'A',request:{kind:'confirm',title:'离线验收：需要客户确认的请求',preview:'此为受控夹具，无真实任务。'}});
    await js(`document.getElementById('tab-card').click()`);console.log('INTERACTIVE_FIXTURE_READY');
  }else app.quit();
 }catch(error){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,errors,error:String(error),stack:error.stack},null,2));console.error(error);clearTimeout(watchdog);app.exit(1);}
});
