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
// Phase 3A/5B：默认构建产物入口；ANS_RENDERER_ENTRY 显式覆盖。
// 5A：显式入口必须在启动前存在，避免静默回退/加载错误页造成假绿。
const EXPLICIT_RENDERER_ENTRY = process.env.ANS_RENDERER_ENTRY || '';
const RENDERER_ENTRY=EXPLICIT_RENDERER_ENTRY||path.join(APP,'renderer/dist/index.html');
if (EXPLICIT_RENDERER_ENTRY && !fs.existsSync(EXPLICIT_RENDERER_ENTRY)) {
  console.error('ANS_RENDERER_ENTRY does not exist: ' + EXPLICIT_RENDERER_ENTRY);
  process.exit(2);
}
const OUT=process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(),'ans-uiux-v2-'));
fs.mkdirSync(OUT,{recursive:true}); app.setPath('userData',path.join(OUT,'user-data'));
const INTERACTIVE=process.env.ANS_UIUX_INTERACTIVE==='1';
const ROOT='/offline-uiux-fixture';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let win, pickResolve, sendResolve, withdrawResolve;
let pickDeferred=false, sendDeferred=false, withdrawMode='fail', interactiveReady=false, operatorMode='normal';
const windowCalls=[]; const reports=[]; const errors=[]; const sends=[]; const opens=[]; const histories=[]; const stops=[]; const aborts=[]; const responses=[]; const configSaves=[]; const shellResponses=[]; const configApplications={};
const previewCalls=[], reacceptCalls=[];
const GOV_PINNED='a1b2c3d4'+'0'.repeat(56), GOV_ACTUAL='9f8e7d6c'+'1'.repeat(56), GOV_DIGEST='b'.repeat(64);
const governanceRecordFixture={state:'pin-mismatch',pinCount:9,pinFiles:[{path:'角色卡/assembly/boundary.yaml',pinned:GOV_PINNED,actual:GOV_ACTUAL,status:'modified'}]};
const governancePreviewFixture={projectRoot:ROOT,writePaths:['.ans/project.json','docs/bootstrap-manifest.md'],pinPaths:['角色卡/governance-boundary.yaml','角色卡/assembly/boundary.yaml'],pinCount:9,changed:[{path:'角色卡/assembly/boundary.yaml',pinned:GOV_PINNED,actual:GOV_ACTUAL,status:'modified'}],canConfirm:true,blockers:[],previewDigest:GOV_DIGEST};
let saveMode="success", saveApplication="next-session";
const CONFIG_ONLY=process.env.ANS_CONFIG_UI_ONLY==='1';
const FRESH_CONTEXT_ONLY=process.env.ANS_FRESH_CONTEXT_UI_ONLY==='1';
const ROLE_FOCUS_ONLY=process.env.ANS_ROLE_RETURN_FOCUS_UI_ONLY==='1';
const TERMINAL_ONLY=process.env.ANS_TERMINAL_UI_ONLY==='1';
const SEND_FACTS_ONLY=process.env.ANS_SEND_FACTS_UI_ONLY==='1';
const TERMINAL_MERGE_ONLY=process.env.ANS_TERMINAL_MERGE_UI_ONLY==='1';
const VISUAL_ONLY=process.env.ANS_VISUAL_V2_UI_ONLY==='1';
const GHOST_ONLY=process.env.ANS_DELIVERY_NOTE_UI_ONLY==='1';
const FLOW_ONLY=process.env.ANS_COMPLETE_FLOW_UI_ONLY==='1'||FRESH_CONTEXT_ONLY||ROLE_FOCUS_ONLY||TERMINAL_ONLY||SEND_FACTS_ONLY||TERMINAL_MERGE_ONLY||VISUAL_ONLY||GHOST_ONLY;
const PROJECT_RESET_ONLY=process.env.ANS_PROJECT_RESET_UI_ONLY==='1';
const DUP_ONLY=process.env.ANS_DUP_UI_ONLY==='1';
const SELECTOR_ONLY=process.env.ANS_SELECTOR_UI_ONLY==='1';
const G2_ONLY=process.env.ANS_G2_RECOVERY_UI_ONLY==='1';
const TOOLFOLD_ONLY=process.env.ANS_TOOLFOLD_UI_ONLY==='1';
// 2026-10-19 客户要求：左树取消角色分组折叠 + 系统通知独立成行——独立离线模式（真实 renderer/Electron）。
const NOTICE_ONLY=process.env.ANS_NOTICE_UI_ONLY==='1';
// 2026-10-20 真机空白修复：后台在跑角色（有队列/状态行、无 transcript）切过去不得空白。
const BLANK_ONLY=process.env.ANS_BLANK_PANE_UI_ONLY==='1';
// 2026-10-20 真机：排队聚合不得随 runtime view 恢复复活旧 queuedRequests。
const QUEUE_VIEW_ONLY=process.env.ANS_QUEUE_VIEW_UI_ONLY==='1';
const GOVREACCEPT_ONLY=process.env.ANS_GOVERNANCE_REACCEPT_UI_ONLY==='1';
const JUDGE_ONLY=process.env.ANS_JUDGE_UI_ONLY==='1';
const MIRROR_ONLY=process.env.ANS_MIRROR_UI_ONLY==='1';
const configReads=[];
let recoveryEnabled=!(CONFIG_ONLY||SELECTOR_ONLY||FLOW_ONLY||GOVREACCEPT_ONLY||JUDGE_ONLY||MIRROR_ONLY), listFailure=false, pickResult=ROOT, configFailure=false, configMalformed=false, configDeferred=false, saveDeferred=false;
let judgeEnabled=false, judgeSetFailure=false; // P5：「替我审批」离线开关（主进程权威的替身）
let decisionJudgeEnabled=false, decisionSetFailure=false; // P5：第二个开关「替我决策」的离线替身
let judgeGovernanceModel='trio'; // JUDGE_ONLY：listing 的治理模型（trio 启用 decision；single 演示禁用）
let configMissing={}, configPending=[], savePending=[];
let mergeReplayAfterList=false, sendQueued=false; const mergeHistories=new Map();
let blankDefer=false, blankResolve=null; // BLANK_ONLY：把 B 的 getSessionHistory 挂起，观察 loading 窗口
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=code=>win.webContents.executeJavaScript(code.includes('await ')?'(async()=>{'+code+'})()':code);
async function check(name, code){const value=await js(code);reports.push({name,value});if(!value)reports.push({name:name+' observed',value:await js(`(()=>({chat:document.getElementById('chat').textContent,assistant:[...document.querySelectorAll('#chat .msg-assistant')].map(x=>x.textContent),denied:[...document.querySelectorAll('#chat .sys-denied')].map(x=>x.textContent),model:window.__ansRenderer.rowModelDebug(window.__ansRenderer.state.selectedRoleId)}))()`)});assert.equal(value,true,name);}
const roles=['A','B'].map(roleId=>({roleId,cardPath:ROOT+'/角色卡/'+roleId+'/role-card.md',cardText:'# '+roleId+'\n\n完整角色职责。\n\n'+('资料内容用于检查阅读态。\n\n'.repeat(80)),boundary:{entries:[]},boundaryPath:'',changelog:null,docs:[]}));
const listing={projectRoot:ROOT,primaryRoleId:'A',hasRoles:true,warnings:[],roles};
// NOTICE_ONLY 夹具：主入口 liaison + 四个治理职能 + 两个项目分组角色 + 一个无分组角色——
// 用于真实渲染「左树全平铺可见（无 details/折叠）」与「系统通知独立系统行」。
const noticeRole=(roleId,extra={})=>({roleId,cardPath:ROOT+'/角色卡/'+roleId+'/role-card.md',cardText:'# '+roleId+'\n\n角色职责。',boundary:{entries:[]},boundaryPath:'',changelog:null,docs:[],...extra});
const noticeListing={projectRoot:ROOT,primaryRoleId:'liaison',hasRoles:true,warnings:[],governanceModel:'trio',roles:[
  noticeRole('liaison',{governanceFunction:'liaison',builtIn:true}),
  noticeRole('rapporteur',{governanceFunction:'proposal',builtIn:true}),
  noticeRole('nominator',{governanceFunction:'nomination',builtIn:true}),
  noticeRole('convener',{governanceFunction:'schedule',builtIn:true}),
  noticeRole('verifier',{governanceFunction:'verification',builtIn:true}),
  noticeRole('A',{group:'平台组',groupDuty:'组长'}),
  noticeRole('B',{group:'平台组'}),
  noticeRole('C')
]};
const longFull='全文 '+ '排队消息详细内容与来源。\n'.repeat(40)+'长连续文本 '+ 'ordinaryword'.repeat(120);
const queue=[{id:'msg\u0000long',kind:'message',summary:'客户长消息：'+ '超过80字的队列摘要用于核对换行、时间与操作归属。'.repeat(6),full:longFull,at:'2026-10-13T10:01:00Z'},{id:'dispatch',kind:'dispatch',sourceRoleId:'B',summary:'派发任务',full:'',at:'2026-10-13T10:02:00Z'},{id:'handback',kind:'handback',sourceRoleId:'B',summary:'交付报告',full:'',at:'2026-10-13T10:03:00Z'}];
let activeQueue=queue.slice();
const snapshot=(busy=true)=>({roleId:'A',busy,summaries:activeQueue.map(x=>x.summary),queue:activeQueue,running:busy?{id:'running',kind:'message',summary:'正在处理当前请求',full:'',at:'2026-10-13T10:00:00Z'}:null});
let flowOpenResult=null, flowLongRoleDocs=false;
let docMode='success',docCalls=[],docPending=[],flowSavePending=[],saveModeDeferred=false,flowSaveFailure=null,persistenceCalls=[];
const flowReports={},flowReceipts={};
const outer=(input,value)=>({ok:true,version:1,scope:{projectRoot:input.projectRoot,roleId:input.roleId,runtime:input.runtime},value});
const documentRefs=['one','two'].map((id,index)=>({version:1,projectViewId:'epoch-one',documentId:'doc-'+id,roleId:'A',relativePath:'角色卡/A/docs/'+id+'.md',label:'报告 '+(index+1),format:'markdown'}));
const handlers={
 'app:renderer-diagnostic':()=>({ok:true}), 'app:recovery-state':()=>recoveryEnabled?({projectRoot:ROOT,roleId:'A',runtime:'pi'}):({}),'app:recovery-ready':()=>({ok:true}),
 'project:document-read':(_e,input)=>{docCalls.push(input);if(docMode==='deferred')return new Promise(resolve=>docPending.push(resolve));if(docMode!=='success')return {ok:false,version:1,projectViewId:input.projectViewId,documentId:input.documentId,code:docMode,message:'fixed safe error'};return {ok:true,version:1,projectViewId:input.projectViewId,documentId:input.documentId,roleId:input.documentId.endsWith('-b')?'B':'A',relativePath:'角色卡/'+(input.documentId.endsWith('-b')?'B':'A')+'/docs/one.md',format:'markdown',byteLength:100,text:'# 已列文档\n\n<script>window.BAD_DOC=1</script>\n\n![image](https://invalid.example/never.png)\n\n[javascript](javascript:alert(1))\n\n文档正文'};},
 'session:get-persistence':(_e,input)=>{persistenceCalls.push({operation:'capabilities',input});return outer(input,{mode:'enabled',reportSaveSupported:true,deliveryHistorySaveSupported:true,querySupported:true});},
 'report:get-save-state':(_e,input)=>{persistenceCalls.push({operation:'report-query',input});return outer(input,flowReports[input.reportId]||{state:'saved',reportId:input.reportId,retryAvailable:false});},
 'delivery:get-receipt':(_e,input)=>{persistenceCalls.push({operation:'receipt-query',input});return outer(input,flowReceipts[input.attemptId]?{state:'known',receipt:flowReceipts[input.attemptId]}:{state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false});},
 'report:retry-save':(_e,input)=>{persistenceCalls.push({operation:'report-save',input});if(saveModeDeferred)return new Promise(resolve=>flowSavePending.push({resolve,input}));if(flowSaveFailure)return outer(input,{ok:false,state:flowSaveFailure==='SNAPSHOT_EXPIRED'?'expired':'failed',reportId:input.reportId,code:flowSaveFailure,retryAvailable:false,message:'固定安全失败'});const value={ok:true,state:'saved',report:flowReports[input.reportId].report,retryAvailable:false};flowReports[input.reportId]={...value,reportId:input.reportId};return outer(input,value);},
 'delivery:retry-history-save':(_e,input)=>{persistenceCalls.push({operation:'history-save',input});const receipt={...flowReceipts[input.attemptId],history:'saved',retryHistoryAvailable:false};flowReceipts[input.attemptId]=receipt;return outer(input,{ok:true,state:'saved',receipt});},
 'window:minimize':()=>{windowCalls.push('minimize');return {ok:true};},'window:toggle-maximize':()=>{windowCalls.push('maximize');return {ok:true};},'window:close':()=>{windowCalls.push('close');return {ok:true};},
 'window:is-maximized':()=>false,'app:list-project':(_e,projectRoot)=>{if(listFailure)throw new Error('fixture listing failed');if(NOTICE_ONLY)return {...noticeListing,projectRoot:projectRoot?.projectRoot||ROOT};if(mergeReplayAfterList)for(const h of mergeHistories.values())win.webContents.send('session:history',h);return {...listing,projectRoot:projectRoot?.projectRoot||ROOT,...(GOVREACCEPT_ONLY?{governanceRecord:governanceRecordFixture}:{}),...(JUDGE_ONLY?{governanceModel:judgeGovernanceModel}:{}),...(FLOW_ONLY?{documentScope:{version:1,projectViewId:'epoch-one',projectRoot:projectRoot?.projectRoot||ROOT},roles:listing.roles.map(role=>({...role,documents:role.roleId==='A'?documentRefs:role.roleId==='B'?documentRefs.map(ref=>({...ref,roleId:'B',documentId:ref.documentId+'-b',relativePath:ref.relativePath.replace('/A/','/B/')})):[],...(flowLongRoleDocs?{changelog:{path:'changelog.md',text:'# 真实长变更\n\n'+('保留变更阅读位置。\n\n'.repeat(100))}}:{}),docs:flowLongRoleDocs?Array.from({length:100},(_,n)=>({kind:'file',path:'docs/record-'+n+'.md'})):[{kind:'directory',path:'docs/change'},{kind:'file',path:'docs/one.md'}]}))}:{})};},'app:pick-project':()=>pickResult,
 'session:open':(_e,input)=>{opens.push(input);return {ok:true,resumed:true,contextSource:'resumed',runtime:input.runtime,projectRoot:input.projectRoot,profileRevision:0,...(flowOpenResult||{})};},'session:live':()=>['A','B'],'session:stop':(_e,input)=>{stops.push(input);return {ok:true};},
 'session:history-get':(_e,input)=>{histories.push(input);const h=mergeHistories.get(input.runtime+'|'+input.roleId)||{...input,rows:[],error:null,skipped:0};if(BLANK_ONLY&&input.roleId==='B'&&blankDefer){blankDefer=false;return new Promise(resolve=>{blankResolve=()=>resolve(h);});}return h;},
 'session:live-views':()=>[{projectRoot:ROOT,roleId:'A',runtime:'pi'},{projectRoot:ROOT,roleId:'B',runtime:'pi'},...opens.map(x=>({projectRoot:x.projectRoot,roleId:x.roleId,runtime:x.runtime}))],
 'session:abort':(_e,input)=>{aborts.push(input);win.webContents.send('session:role-state',{...snapshot(false),...input}); return {ok:true,supported:true};},
 'session:operator-response':(_e,input)=>{responses.push(input);return operatorMode==='expired'?({ok:false,expired:true,error:'离线受控请求已失效'}):({ok:true});},
 'runtime-config:get':(_e,input)=>{configReads.push(input.runtime);return configDeferred?new Promise((resolve,reject)=>configPending.push({runtime:input.runtime,resolve,reject})):configFailure?Promise.reject(new Error('fixture config failed')):configMalformed?{...runtimeConfig(input.runtime),missingKeys:undefined}:runtimeConfig(input.runtime);},
 'shell:confirm-response':(_e,input)=>{shellResponses.push(input);return {ok:true};},
 'shell:judge-get':()=>({version:1,ok:true,enabled:judgeEnabled}),
 'shell:judge-set':(_e,input)=>{if(judgeSetFailure)return {version:1,ok:false,error:'离线受控拒绝：开关未改变'};judgeEnabled=!!input&&input.enabled===true;return {version:1,ok:true,enabled:judgeEnabled};},
 'decision:judge-get':()=>({version:1,ok:true,enabled:decisionJudgeEnabled}),
 'decision:judge-set':(_e,input)=>{if(decisionSetFailure)return {version:1,ok:false,error:'离线受控拒绝：决策开关未改变'};decisionJudgeEnabled=!!input&&input.enabled===true;return {version:1,ok:true,enabled:decisionJudgeEnabled};},
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
if(GOVREACCEPT_ONLY){
  ipcMain.handle('project:governance-reaccept-preview',(_e,input)=>{previewCalls.push(input);return {ok:true,preview:governancePreviewFixture};});
  ipcMain.handle('project:governance-reaccept',(_e,input)=>{reacceptCalls.push(input);return {ok:true,status:'completed',phase:'write',message:'已重新接受：更新 1 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。',wrote:['.ans/project.json','docs/bootstrap-manifest.md'],pins:[],changed:governancePreviewFixture.changed};});
}
const key=async (name,modifiers=[])=>{const keyCode=({Enter:'Return',ArrowDown:'Down',ArrowUp:'Up'})[name]||name;win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(name==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await pause(50);};
function safeReport(hb) { const text=s=>({text:s||'',redacted:false,truncated:false});return {source:{roleId:hb.roleId,runtime:'pi',turnId:hb.turnId},taskId:hb.taskId||null,origin:hb.status==='unreported'?'terminal-fallback':'submitted-report',status:hb.status,summary:text(hb.summary),evidence:(hb.evidence||[]).map(text),evidenceOmitted:0,at:hb.at||''}; }
const event=(kind,summary,detail)=>({roleId:'A',event:{kind,summary,detail}});
function activityEvents(prefix='') { return [event('tool_call','模型请求调用 read_file（目标：a.md）',{toolName:'read_file',path:'a.md'}),event('accepted','read_file 执行完成',{toolName:'read_file',path:'a.md',ok:true,status:'completed',turnId:prefix+'turn-1'}),event('accepted','request accepted',{toolName:'legacy',path:'legacy.md'}),event('denied','文件不存在',{toolName:'read_file',path:'missing.md',status:'failed',ok:false}),event('tool_call','开始执行 read_file',{toolName:'read_file',path:'b.md'}),event('message','真实助手答复保持原文。')]; }
async function push(channel,payload){win.webContents.send(channel,payload);await pause(80);}
function ownHistory(){return parseSessionJsonl([{type:'session'},{type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'rs',name:'run_shell',arguments:{command:'ls missing'}}]}},{type:'message',message:{role:'toolResult',toolCallId:'rs',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：ls missing（exit 1）\nstdout:\nSECRET'}]}},{type:'message',message:{role:'toolResult',toolName:'read_file',isError:false,content:[{type:'text',text:'read_file 失败：lost.md（ENOENT）'}]}},{type:'message',message:{role:'assistant',content:[{type:'text',text:'历史助手答复。'}]}}].map(x=>JSON.stringify(x)).join('\n')).rows;}
const viewportGeometry=`(() => { const root=document.documentElement,b=document.body,a=document.querySelector('.app'),c=document.querySelector('.composer').getBoundingClientRect(),d=document.getElementById('right-drawer').getBoundingClientRect(); const visible=id=>{let r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0;};return root.scrollWidth===root.clientWidth&&b.scrollWidth===b.clientWidth&&a.scrollWidth===a.clientWidth&&visible('btn-send')&&visible('btn-halt')&&visible('drawer-close')&&d.bottom<=innerHeight&&Math.abs(d.width-424)<1&&document.querySelector(".col-mid").inert;})()`;
async function reading(){return js(`(() => {let c=document.getElementById('chat'),t=c.getBoundingClientRect().top;let nodes=[...c.querySelectorAll('.msg,.tool-records,.sys-denied')];let n=nodes.find(x=>x.getBoundingClientRect().bottom>t&&x.getBoundingClientRect().top<c.getBoundingClientRect().bottom);return n?{text:n.textContent.slice(0,60),offset:n.getBoundingClientRect().top-t}:null;})()`);}
async function freshContextChecks(){
  const project=ROOT+'-new-context';flowOpenResult={resumed:false,contextSource:'fresh'};
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(project)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
  await check('P5 truly fresh open says new context without old history',`document.getElementById('context-state').textContent==='新会话'`);
  await js(`document.getElementById('inp-message').value='首条普通选择';document.getElementById('btn-send').click()`);await pause(30);
  const sent=sends.at(-1),turn='fresh-first-turn';
  await push('session:events',[{projectRoot:project,roleId:'A',runtime:'pi',clientMessageId:sent.metadata.clientMessageId,event:{kind:'message',runtime:'pi',roleId:'A',turnId:turn,summary:'用户指令：首条普通选择',detail:{source:'prompt-input',text:'首条普通选择'}}},{projectRoot:project,roleId:'A',runtime:'pi',event:{kind:'tool_call',runtime:'pi',roleId:'A',turnId:turn,summary:'请求选择',detail:{toolName:'request_choice',toolCallId:'fresh-choice-call',phase:'start'}}}]);
  await push('session:role-state',{projectRoot:project,roleId:'A',runtime:'pi',busy:true,summaries:[],queue:[],contextSource:'fresh'});
  await check('P5 fresh first prompt tool and snapshot do not invent old lost context',`document.getElementById('context-state').textContent==='新会话'&&!document.getElementById('context-state').textContent.includes('模型未恢复')`);
  await push('session:history',{projectRoot:project,roleId:'A',runtime:'pi',rows:[{kind:'user',text:'首条普通选择',turnId:turn},{kind:'tool',text:'请求选择',turnId:turn,eventKind:'tool_call',activity:{toolName:'request_choice',toolCallId:'fresh-choice-call',phase:'start',status:'call'}}]});
  await push('session:role-state',{projectRoot:project,roleId:'A',runtime:'pi',busy:false,summaries:[],queue:[],contextSource:'fresh'});
  await check('P5 current-handle replay update remains fresh without false old-history warning',`document.getElementById('context-state').textContent==='新会话'`);
  const oldProject=ROOT+'-old-readable';mergeHistories.set('pi|A',{projectRoot:oldProject,roleId:'A',runtime:'pi',rows:[{kind:'assistant',text:'真实旧可读历史',turnId:'older'}],error:null});flowOpenResult={resumed:false,contextSource:'fresh',contextWarning:'原生恢复失败，已重建上下文。'};
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(oldProject)});await window.__ansRenderer.selectRole('A')`);
  await check('P5 actual at-open old history retains truthful failed-restore notice',`document.getElementById('context-state').textContent.includes('可读历史保留，模型未恢复')&&document.getElementById('context-state').title.includes('原生恢复失败')`);
  mergeHistories.delete('pi|A');flowOpenResult=null;
}
async function roleDocumentFocusChecks(){
 flowLongRoleDocs=true;
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A');if(window.__ansRenderer.state.rightTab!=='card')document.getElementById('tab-card').click();['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true);document.getElementById('right-body').scrollTop=document.getElementById('right-body').scrollHeight`);await pause(30);
 await js(`['card','docs','changes'].forEach(id=>{let el=document.querySelector('details[data-section="'+id+'"] .card-text');el.scrollTop=el.scrollHeight});document.getElementById('right-body').scrollTop=document.getElementById('right-body').scrollHeight`);await pause(30);
 const nested=await js(`Object.fromEntries(['card','docs','changes'].map(id=>[id,document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop]))`);assert.ok(Object.values(nested).every(x=>x>100));
 await check('nested reading fixture has visible real opener and positive inner and outer scroll',`(()=>{let b=document.querySelector('.role-document-entry').getBoundingClientRect(),d=document.getElementById('right-body').getBoundingClientRect();return b.top>=d.top&&b.bottom<=d.bottom&&document.getElementById('right-body').scrollTop>100})()`);
 const before=await js(`document.getElementById('right-body').scrollTop`);assert.ok(before>100);reports.push({name:'nested role reading actual before',value:{nested,outer:before}});
 await js(`[...document.querySelectorAll('#right-body button')].find(x=>x.textContent==='查看已列文档').click();document.querySelector('[data-doc-id="doc-one"]').click()`);await pause(30);
 await js(`document.querySelector('[data-doc-action="back-list"]').click();document.querySelector('[data-doc-action="back-role"]').click()`);await pause(30);
 await check('P3 return preserves actual role scroll and expansion',`document.querySelector('details[data-section="card"]').open&&Math.abs(document.getElementById('right-body').scrollTop-${before})<2`);
 await check('P6 return role restores equivalent visible document entry focus',`document.activeElement.textContent==='查看已列文档'&&!!document.activeElement.closest('#right-body')&&document.activeElement.getClientRects().length>0`);
 reports.push({name:'nested role reading actual after',value:await js(`({outer:document.getElementById('right-body').scrollTop,inner:Object.fromEntries(['card','docs','changes'].map(id=>[id,document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop]))})`)});
 await check('P3 independent card docs changes inner scroll survives alongside outer expansion focus',`['card','docs','changes'].every(id=>document.querySelector('details[data-section="'+id+'"]').open&&Math.abs(document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop-(${JSON.stringify(nested)})[id])<2)&&Math.abs(document.getElementById('right-body').scrollTop-${before})<2&&document.activeElement.classList.contains('role-document-entry')`);
 await js(`await window.__ansRenderer.selectRole('B');['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true)`);await pause(30);
 await check('nested role reading does not leak into another role',`['card','docs','changes'].every(id=>document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop===0)`);
 await js(`await window.__ansRenderer.selectRole('A')`);await pause(30);
 await check('returning original role restores only its own nested reading',`['card','docs','changes'].every(id=>Math.abs(document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop-(${JSON.stringify(nested)})[id])<2)`);
 await js(`await window.__ansRenderer.selectRuntime('claude');['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true)`);await pause(30);
 await check('nested role reading does not leak into another runtime',`['card','docs','changes'].every(id=>document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop===0)`);
 await js(`await window.__ansRenderer.selectRuntime('pi')`);await pause(30);
 await check('returning original runtime restores only its own nested reading',`['card','docs','changes'].every(id=>Math.abs(document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop-(${JSON.stringify(nested)})[id])<2)`);
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT+'-nested-new')});await window.__ansRenderer.selectRole('A');if(window.__ansRenderer.state.rightTab!=='card')document.getElementById('tab-card').click();['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true)`);await pause(30);
 await check('nested role reading is reset for a genuinely different project',`['card','docs','changes'].every(id=>document.querySelector('details[data-section="'+id+'"] .card-text').scrollTop===0)`);
 flowLongRoleDocs=false;
}
async function judgeChecks(){
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
 const scoped={projectRoot:ROOT,roleId:'A',runtime:'pi'};
 const toggleState=`(()=>{const t=document.getElementById('auto-approve-toggle'),l=document.getElementById('auto-approve-label'),w=document.getElementById('shell-judge-warning'),s=document.getElementById('auto-approve-status'),wrap=t.closest('.composer-auto-approve'),c=document.getElementById('shell-judge-warning-close'),x=document.getElementById('shell-judge-warning-text');return {checked:t.checked,disabled:t.disabled,label:l.textContent,warningHidden:w.hidden,errorShown:!s.hidden,error:s.textContent,onClass:wrap.classList.contains('is-on'),closeLabel:c?c.textContent:'',warningText:x?x.textContent:''};})()`;
 // 启动：主进程权威默认 false（桥已接线 ⇒ 可点、标签「替我审批」、无警告）。
 await check('P5 judge starts authoritative off',`(()=>{const v=${toggleState};return v.checked===false&&v.disabled===false&&v.label==='替我审批'&&v.warningHidden===true&&v.onClass===false;})()`);
 // 首次勾选：琥珀标记 + 完整警告**只显示一次**（客户 2026-10-18；带「知道了」）。
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 first enable shows amber marker and one-time warning',`(()=>{const v=${toggleState};return v.checked&&!v.disabled&&v.label==='替我审批中 · 自动代理'&&!v.warningHidden&&v.onClass&&v.closeLabel==='知道了'&&v.warningText.includes('替我审批中：shell 命令与写盘/写卡确认')&&v.warningText.includes('按所属开关回落逐张卡')&&v.warningText.includes('judge 代批 · 代审批/代决策');})()`);
 // 「知道了」收起：开关仍开启、紧凑琥珀标记仍在；重复推送 / 重绘 / 切角色都不再重现。
 await js(`document.getElementById('shell-judge-warning-close').click()`);await pause(40);
 await check('P5 acknowledged warning hides but compact amber marker stays',`(()=>{const v=${toggleState};return v.checked&&v.onClass&&v.label==='替我审批中 · 自动代理'&&v.warningHidden;})()`);
 await push('shell:judge-state',{version:1,enabled:true});
 await check('P5 repeated enabled push does not re-show acknowledged warning',`(()=>{const v=${toggleState};return v.checked&&v.onClass&&v.warningHidden;})()`);
 await js(`await window.__ansRenderer.selectRole('A')`);await pause(80);
 await check('P5 role switch/redraw does not re-show acknowledged warning',`(()=>{const v=${toggleState};return v.checked&&v.onClass&&v.warningHidden;})()`);
 // 取消：回到手动，警告消失（并复位「已提示」）。
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 disable hides warning and returns to manual label',`(()=>{const v=${toggleState};return !v.checked&&v.label==='替我审批'&&v.warningHidden&&!v.onClass;})()`);
 // 再次开启：重新显示一次。
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 re-enable after toggle off shows the warning once again',`(()=>{const v=${toggleState};return v.checked&&v.onClass&&!v.warningHidden&&v.closeLabel==='知道了';})()`);
 // 自动消失：约 9 秒后收起（轮询至 12s；与开关/紧凑标记无关——它们保持）。
 let autoDismissed=false;const autoStart=Date.now();
 for(let i=0;i<24;i++){await pause(500);if(await js(`document.getElementById('shell-judge-warning').hidden`)){autoDismissed=true;break;}}
 const autoElapsed=Date.now()-autoStart;
 await check('P5 warning auto-dismisses after about 9 seconds without touching the switch',`(()=>{const v=${toggleState};return ${autoDismissed&&autoElapsed>=7500}&&v.checked&&v.onClass&&v.warningHidden;})()`);
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 disable after auto-dismiss clears prompt state',`(()=>{const v=${toggleState};return !v.checked&&v.warningHidden&&!v.onClass;})()`);
 // 失败：主进程拒绝 ⇒ 保持实际状态（关闭）并显示错误；无假开启态。
 judgeSetFailure=true;await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 failed toggle keeps actual state and shows error',`(()=>{const v=${toggleState};return !v.checked&&v.label==='替我审批'&&v.warningHidden&&v.errorShown&&v.error.includes('离线受控拒绝');})()`);
 judgeSetFailure=false;
 // 主进程推送 shell:judge-state ⇒ 同步复选框（不靠本地点击意图）；每次都按一次性规则处理。
 await push('shell:judge-state',{version:1,enabled:true});
 await check('P5 pushed judge state turns toggle on with one-time warning',`(()=>{const v=${toggleState};return v.checked&&!v.warningHidden&&v.onClass;})()`);
 await js(`document.getElementById('shell-judge-warning-close').click()`);await pause(40);
 await push('shell:judge-state',{version:1,enabled:true});
 await check('P5 repeated pushed state does not re-show warning',`(()=>{const v=${toggleState};return v.checked&&v.warningHidden&&v.onClass;})()`);
 await push('shell:judge-state',{version:1,enabled:false});
 await check('P5 pushed judge state turns toggle off',`(()=>{const v=${toggleState};return !v.checked&&v.warningHidden&&!v.onClass;})()`);
 // 结果行：先有工具调用行，再推 allow + deny 档放行；行按 toolCallId 锚在该调用之后。
 await push('session:events',[{...scoped,event:{kind:'tool_call',turnId:'judge-turn',summary:'模型请求调用 run_shell',detail:{toolName:'run_shell',toolCallId:'judge-call',phase:'start'}}}]);
 const judgeBase={version:1,id:'sj-judge-call',toolCallId:'judge-call',roleId:'A',projectRoot:ROOT,runtime:'pi',at:'2026-10-17T10:00:00Z',command:'npm run build',summary:'构建项目',policy:'su-approval',tier:'deny',reason:'构建产物需要刷新',engine:'claude',operator:'judge:claude',reasonCode:'necessary',hardDenyOverride:true,label:'deny 档 · judge 放行'};
 await push('shell:judge-result',{...judgeBase,id:'sj-judge-allow',verdict:'allow'});
 await check('P5 deny-tier allow row is prominent and anchored after its tool call',`(()=>{const rows=[...document.querySelectorAll('#chat .shell-judge-row')];const row=rows.find(x=>x.dataset.toolCallId==='judge-call');if(!row)return false;const pane=row.closest('.chat-pane'),kids=[...pane.children];const toolIdx=kids.findIndex(x=>x.classList.contains('tool-records')||x.classList.contains('tool-call-record')||x.textContent.includes('run_shell'));return rows.length===1&&row.classList.contains('is-deny-override')&&row.textContent.includes('已替你放行（自动代理 · 代审批 · deny 档）')&&row.textContent.includes('deny 档 · judge 放行')&&row.textContent.includes('该命令属于硬拒类，自动代理判定必要后放行；请复核')&&row.textContent.includes('判断引擎：Claude')&&row.textContent.includes('档位：deny')&&toolIdx>=0&&kids.indexOf(row)>toolIdx;})()`);
 // 普通 deny：理由/替代方案/客户说明/关闭开关重试的出路。
 await push('shell:judge-result',{...judgeBase,id:'sj-judge-deny',verdict:'deny',tier:'risky',hardDenyOverride:undefined,label:undefined,reasonCode:'safer-alternative',summary:'删除源码目录',command:'rm -rf src',reason:'会删除未提交源码',customerMessage:'该命令会删除项目源码，风险过高。',alternative:{kind:'command',value:'rm -rf dist',rationale:'只清理构建产物'}});
 await check('P5 deny row shows reason/alternative/customer message and retry exit',`(()=>{const row=[...document.querySelectorAll('#chat .shell-judge-row')].find(x=>x.textContent.includes('未放行（自动代理 · 代审批）'));return !!row&&row.textContent.includes('判断理由：会删除未提交源码')&&row.textContent.includes('替代方案：rm -rf dist（只清理构建产物）')&&row.textContent.includes('该命令会删除项目源码，风险过高。')&&row.textContent.includes('关闭「替我审批」后重试')&&!row.classList.contains('is-deny-override');})()`);
 // manual：不产生结果行（原卡替代）。
 const before=await js(`document.querySelectorAll('#chat .shell-judge-row').length`);
 await push('shell:judge-result',{...judgeBase,id:'sj-judge-manual',verdict:'manual',reasonCode:'timeout'});
 await check('P5 manual result produces no result row',`document.querySelectorAll('#chat .shell-judge-row').length===${before}`);
 // 手动回落卡 judgeNotice：原样呈现（row-failed 文案）。
 await push('shell:confirm-request',{...scoped,id:'judge-manual-card',policy:'project',command:'rm -rf src',summary:'删除源码目录',reasonPlain:'命令危险',cwd:ROOT,argvLines:[],judgeNotice:'自动代理已完成判断，但结果无法在聊天中显示；已转你手动确认。'});
 await check('P5 manual fallback card shows judgeNotice verbatim',`(()=>{const n=document.getElementById('sc-judge-notice');return !n.hidden&&n.textContent==='自动代理已完成判断，但结果无法在聊天中显示；已转你手动确认。'&&document.getElementById('sc-reason').textContent==='命令危险';})()`);
 // 已挂起卡不受开关切换影响（§10.3）：切到开启/关闭都不动卡与按钮，judgeNotice 原样。
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 pending card survives judge toggle',`(()=>{const c=document.getElementById('shell-confirm'),n=document.getElementById('sc-judge-notice');return !c.hidden&&n.textContent==='自动代理已完成判断，但结果无法在聊天中显示；已转你手动确认。'&&!document.getElementById('sc-deny').disabled&&document.getElementById('auto-approve-toggle').checked&&!document.getElementById('shell-judge-warning').hidden;})()`);
 await js(`document.getElementById('auto-approve-toggle').click()`);await pause(80);
 await check('P5 pending card still present after turning judge off',`!document.getElementById('shell-confirm').hidden&&!document.getElementById('sc-deny').disabled`);
 await js(`document.getElementById('sc-deny').click()`);await pause(40);
 // 结果落角色自己的 pane：B 的结果不切走当前角色 A；切到 B 可见。
 await push('shell:judge-result',{...judgeBase,id:'sj-judge-b',toolCallId:'judge-b',roleId:'B',verdict:'allow',summary:'B 的命令'});
 await check('P5 result for another role does not switch the current view',`window.__ansRenderer.state.selectedRoleId==='A'&&document.querySelectorAll('#chat .chat-pane').length===1&&document.querySelector('#chat .chat-pane').dataset.roleId==='A'`);
 await js(`await window.__ansRenderer.selectRole('B')`);await pause(80);
 await check('P5 background role result is visible when that role is selected',`[...document.querySelectorAll('#chat .shell-judge-row')].some(x=>x.dataset.toolCallId==='judge-b')`);
 // ———— P5 第二个开关「替我决策」（P4 IPC 接线后驱动；桥缺失只验证禁用+说明，不假开启） ————
 const decisionWired=await js(`typeof window.desktop.getDecisionJudgeState==='function'&&typeof window.desktop.setDecisionJudgeEnabled==='function'&&typeof window.desktop.onDecisionJudgeState==='function'&&typeof window.desktop.onOperatorJudgeResult==='function'`);
 if(!decisionWired){
  await check('P5 decision switch bridge missing → disabled with explicit note',`(()=>{const t=document.getElementById('judge-decision-toggle'),l=document.getElementById('judge-decision-label'),s=document.getElementById('judge-decision-status');return !!t&&!!l&&!t.checked&&t.disabled&&l.textContent==='当前版本不支持自动判断，保持手动'&&!s.hidden&&s.textContent.includes('当前版本不支持自动判断');})()`);
 }else{
  const dState=`(()=>{const t=document.getElementById('judge-decision-toggle'),l=document.getElementById('judge-decision-label'),w=document.getElementById('shell-judge-warning'),s=document.getElementById('judge-decision-status'),wrap=t.closest('.composer-auto-approve'),x=document.getElementById('shell-judge-warning-text');return {checked:t.checked,disabled:t.disabled,label:l.textContent,warningHidden:w.hidden,noteShown:!s.hidden,note:s.textContent,onClass:wrap.classList.contains('is-on'),warningText:x?x.textContent:''};})()`;
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);await pause(60);
  await check('P5 decision starts authoritative off in trio',`(()=>{const v=${dState};return v.checked===false&&v.disabled===false&&v.label==='替我决策'&&v.warningHidden===true&&v.onClass===false;})()`);
  await js(`document.getElementById('judge-decision-toggle').click()`);await pause(80);
  await check('P5 decision first enable shows amber marker and the same one warning block',`(()=>{const v=${dState};return v.checked&&!v.disabled&&v.label==='替我决策中 · 自动代理'&&!v.warningHidden&&v.onClass&&v.warningText.includes('替我决策中：提案接受、任命、验收将由自动代理代批。')&&!v.warningText.includes('替我审批中：');})()`);
  await js(`document.getElementById('shell-judge-warning-close').click()`);await pause(40);
  await js(`document.getElementById('judge-decision-toggle').click()`);await pause(80);
  await check('P5 decision disable hides warning and returns to manual label',`(()=>{const v=${dState};return !v.checked&&v.label==='替我决策'&&v.warningHidden&&!v.onClass;})()`);
  decisionSetFailure=true;await js(`document.getElementById('judge-decision-toggle').click()`);await pause(80);
  await check('P5 failed decision toggle keeps actual state and shows error',`(()=>{const v=${dState};return !v.checked&&v.label==='替我决策'&&v.warningHidden&&v.noteShown&&v.note.includes('离线受控拒绝');})()`);
  decisionSetFailure=false;
  await push('decision:judge-state',{version:1,enabled:true});
  await check('P5 pushed decision state turns switch on with one-time warning',`(()=>{const v=${dState};return v.checked&&!v.warningHidden&&v.onClass;})()`);
  await js(`document.getElementById('shell-judge-warning-close').click()`);await pause(40);
  await push('decision:judge-state',{version:1,enabled:true});
  await check('P5 repeated decision state does not re-show warning',`(()=>{const v=${dState};return v.checked&&v.warningHidden&&v.onClass;})()`);
  // 治理代批结果行：按 toolCallId 锚定、标题含「judge 代批 · 代决策」、结论/理由/引擎可见。
  await push('session:events',[{projectRoot:ROOT,roleId:'A',runtime:'pi',event:{kind:'tool_call',turnId:'gov-turn',summary:'模型请求确认',detail:{toolName:'request_confirmation',toolCallId:'gov-call',phase:'start'}}}]);
  await push('session:operator-judge',{version:1,id:'gov-result-1',requestId:'gov-req-1',anchorKey:'gov-anchor',toolCallId:'gov-call',roleId:'A',projectRoot:ROOT,runtime:'pi',at:'2026-10-18T10:00:00Z',group:'decision',cardKind:'proposal',flowId:'flow-a',engine:'claude',model:'fixture',reasonCode:'sufficient',reason:'提案范围清晰',selected:['accept'],paths:[],evidence:['docs/proposals/flow-a-v1.md'],durationMs:1200,readCalls:2,readBytes:4096});
  await check('P5 decision result row says judge 代批 · 代决策 and anchors after its tool call',`(()=>{const row=[...document.querySelectorAll('#chat .governance-judge-row')].find(x=>x.dataset.toolCallId==='gov-call');if(!row)return false;const pane=row.closest('.chat-pane'),kids=[...pane.children];const toolIdx=kids.findIndex(x=>x.textContent.includes('request_confirmation')||x.textContent.includes('模型请求确认'));return row.textContent.includes('judge 代批 · 代决策')&&row.textContent.includes('接受提案（accept） · 流程 flow-a')&&row.textContent.includes('判断引擎：Claude')&&row.textContent.includes('operator:judge:claude')&&row.textContent.includes('判断理由：提案范围清晰')&&row.textContent.includes('docs/proposals/flow-a-v1.md')&&toolIdx>=0&&kids.indexOf(row)>toolIdx;})()`);
  await push('session:operator-judge',{version:1,id:'gov-result-2',requestId:'gov-req-2',toolCallId:'gov-write-call',roleId:'A',projectRoot:ROOT,runtime:'pi',at:'2026-10-18T10:01:00Z',group:'approval',cardKind:'write',flowId:'flow-b',engine:'pi',reasonCode:'sufficient',reason:'路径均在边界内',selected:[],confirmed:true,paths:['docs/proposals/a.md','docs/proposals/b.md'],pathDecisions:[{path:'docs/proposals/a.md',ok:true},{path:'docs/proposals/b.md',ok:true}]});
  await check('P5 approval write result row says judge 代批 · 代审批 with path count',`(()=>{const row=[...document.querySelectorAll('#chat .governance-judge-row')].find(x=>x.dataset.toolCallId==='gov-write-call');return !!row&&row.textContent.includes('judge 代批 · 代审批')&&row.textContent.includes('确认写入 2 个路径')&&row.textContent.includes('docs/proposals/a.md');})()`);
  // 手动回落卡：原卡 + `judgeNotice`（主进程原文逐字；卡仍可作答，UI 不自动批准）。
  await push('session:operator-request',{projectRoot:ROOT,roleId:'A',runtime:'pi',id:'gov-fallback-card',judgeNotice:'自动代理未代批（代决策）：证据不足；已转你手动确认。',request:{kind:'choice',title:'接受提案',cardKind:'proposal',flowId:'flow-a',options:[{id:'accept',label:'接受'},{id:'revise',label:'要求修改'}]}});
  await check('P5 manual fallback card shows judgeNotice verbatim and stays actionable',`(()=>{const card=document.querySelector('[data-request-id="gov-fallback-card"]'),n=card?card.querySelector('.op-judge-notice'):null;return !!n&&n.textContent==='自动代理未代批（代决策）：证据不足；已转你手动确认。'&&card.querySelectorAll('.op-options input').length===2&&[...card.querySelectorAll('.op-options input')].every(x=>!x.disabled);})()`);
  // single 项目：decision 禁用并说明；切回 trio 恢复可用（UI 禁用不是安全边界）。
  judgeGovernanceModel='single';await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);await pause(60);
  await check('P5 single project disables decision with explicit note',`(()=>{const v=${dState};return v.disabled&&!v.checked&&v.label==='替我决策'&&v.noteShown&&v.note==='旧治理模型（single）不支持代决策';})()`);
  judgeGovernanceModel='trio';await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);await pause(60);
  await check('P5 trio project restores decision availability',`(()=>{const v=${dState};return !v.disabled&&v.label==='替我决策'||v.label==='替我决策中 · 自动代理';})()`);
  await push('decision:judge-state',{version:1,enabled:false});
  await check('P5 decision off after checks',`(()=>{const v=${dState};return !v.checked&&v.label==='替我决策'&&!v.onClass;})()`);
 }
}
async function terminalChecks(){
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
 // P5（评审 §10.3）：自动判断开关启动只呈现权威关闭态——桥缺失 ⇒ 禁用+固定文案；桥已接线 ⇒ 默认「替我审」；
 // 两种情况都不得出现「替我审批中」假开启态或开启警告（真实开启/结果行需受控桥替身，见 changelog 未验边界）。
 await check('P5 judge toggle starts authoritative off without fake enable',`(()=>{const t=document.getElementById('auto-approve-toggle'),l=document.getElementById('auto-approve-label'),w=document.getElementById('shell-judge-warning');if(!t||!l||!w)return false;const bridge=typeof window.desktop.getShellJudgeState==='function'&&typeof window.desktop.setShellJudgeEnabled==='function'&&typeof window.desktop.onShellJudgeState==='function'&&typeof window.desktop.onShellJudgeResult==='function';const dt=document.getElementById('judge-decision-toggle'),dl=document.getElementById('judge-decision-label');if(!dt||!dl)return false;const decisionBridge=typeof window.desktop.getDecisionJudgeState==='function'&&typeof window.desktop.setDecisionJudgeEnabled==='function'&&typeof window.desktop.onDecisionJudgeState==='function'&&typeof window.desktop.onOperatorJudgeResult==='function';return !t.checked&&w.hidden&&!l.textContent.includes('替我审批中')&&(bridge?l.textContent==='替我审批':(t.disabled&&l.textContent==='当前版本不支持自动判断，保持手动'))&&!dt.checked&&!dl.textContent.includes('替我决策中')&&(decisionBridge?dl.textContent==='替我决策':(dt.disabled&&dl.textContent==='当前版本不支持自动判断，保持手动'));})()`);
 const scoped={projectRoot:ROOT,roleId:'A',runtime:'pi'};
 sendQueued=true;await js(`document.getElementById('inp-message').value='排队首条';document.getElementById('btn-send').click()`);await pause(40);
 await check('P7 actual queued response sets current hint',`document.getElementById('composer-hint').textContent.includes('已入队')`);
 await push('session:role-state',{...scoped,roleId:'B',busy:false,queue:[],summaries:[]});
 await check('P7 other role empty queue cannot clear current queued hint',`document.getElementById('composer-hint').textContent.includes('已入队')`);
 await push('session:role-state',{...scoped,busy:false,queue:[],summaries:[]});
 await check('P7 authoritative empty queue clears current hint but keeps queue history',`document.getElementById('composer-hint').textContent===''&&document.querySelector('.sys-queue').textContent.includes('已入队')`);
 await js(`document.getElementById('inp-message').value='排队第二条';document.getElementById('btn-send').click()`);await pause(40);const sent=sends.at(-1);
 await js(`document.getElementById('btn-send').click()`);await pause(20);
 await push('session:role-state',{...scoped,busy:false,queue:[],summaries:[]});
 await check('P7 newer validation hint survives late queue empty snapshot',`document.getElementById('composer-hint').textContent.includes('请输入消息内容')`);
 await js(`document.getElementById('inp-message').value='排队实际绑定';document.getElementById('btn-send').click()`);await pause(30);const bound=sends.at(-1);
 await push('session:events',[{...scoped,clientMessageId:bound.metadata.clientMessageId,event:{kind:'message',turnId:'queued-actual',summary:'用户输入',detail:{source:'prompt-input',text:'排队第二条'}}}]);
 await check('P7 matching actual turn ACK clears only its queued hint',`document.getElementById('composer-hint').textContent===''`);sendQueued=false;
 sendDeferred=true;await js(`document.getElementById('inp-message').value='ACK先于入队响应';document.getElementById('btn-send').click()`);await pause(20);const early=sends.at(-1);
 await push('session:events',[{...scoped,clientMessageId:early.metadata.clientMessageId,event:{kind:'message',turnId:'early-ack',summary:'用户输入',detail:{source:'prompt-input',text:'ACK先于入队响应'}}}]);sendResolve({ok:true,queued:true,position:1});sendDeferred=false;await pause(30);
 await check('P7 late queued reply cannot revive hint after matching actual ACK',`document.getElementById('composer-hint').textContent===''`);
 const request={...scoped,id:'terminal-choice',request:{kind:'choice',title:'终态选项',options:[{id:'one',label:'继续'},{id:'two',label:'停止'}]}};
 await push('session:operator-request',request);await push('session:operator-expired',{...scoped,id:request.id,reason:'轮次已停止'});
 await check('P7 expired decision inputs frozen without choosing',`[...document.querySelectorAll('[data-request-id="terminal-choice"] input')].every(x=>x.disabled&&!x.checked)&&[...document.querySelectorAll('[data-request-id="terminal-choice"] .op-actions button')].every(x=>x.disabled)`);
 await push('session:operator-request',{...request,id:'decided-choice'});await js(`document.querySelector('[data-request-id="decided-choice"] input').click();document.querySelector('[data-request-id="decided-choice"] .op-submit').click()`);await pause(40);
 await check('P7 decided answer remains checked and all inputs frozen',`[...document.querySelectorAll('[data-request-id="decided-choice"] input')].every(x=>x.disabled)&&document.querySelector('[data-request-id="decided-choice"] input').checked`);
 await push('session:events',[{...scoped,event:{kind:'denied',turnId:'ordinary-abort',summary:'本轮已中止',detail:{outcome:'aborted'}}}]);
 await check('A non-tool terminal stays actual system fact without invented tool target',`[...document.querySelectorAll('.sys-call')].some(x=>x.textContent==='本轮已中止')&&![...document.querySelectorAll('.tool-row,.activity-row,details')].some(x=>x.textContent.includes('本轮已中止')&&x.textContent.includes('目标未记录'))`);
 await push('session:history',{...scoped,rows:[{kind:'denied',eventKind:'denied',turnId:'ordinary-abort',text:'本轮已中止'},{kind:'denied',eventKind:'denied',turnId:'other-abort',text:'本轮已中止'}]});
 await check('A replay non-tool terminal preserves two actual turns without fabricated tool details',`[...document.querySelectorAll('.sys-call')].filter(x=>x.textContent==='本轮已中止').length===2&&![...document.querySelectorAll('details')].some(x=>x.textContent.includes('本轮已中止')&&x.textContent.includes('目标未记录'))`);
 // su 命令审批卡（2026-10-17 PM 评审 §3.6）：标题/档位/可见原因/绕过写边界警告/拒绝默认焦点。
 const suCard=(tier,id)=>({...scoped,id,policy:'su-approval',tier,command:'sh -c "echo approved"',summary:'执行 shell 命令',reasonPlain:'逐条客户批准；拒绝/超时/通道不可用 = 拒绝。',reasonRaw:'命中硬拒程序规则：reshell',cwd:ROOT,argvLines:['sh','-c','echo approved']});
 await push('shell:confirm-request',suCard('deny','su-deny'));await pause(40);
 await check('SU approval deny card shows title tier reason warning and deny focus',`(()=>{const t=document.getElementById('sc-title').textContent,s=document.getElementById('sc-summary').textContent,r=document.getElementById('sc-reason').textContent,h=document.getElementById('sc-hint').textContent;return t==='SU 命令审批'&&s.includes('硬拒类（deny）')&&r.includes('逐条客户批准')&&r.includes('命中原因：命中硬拒程序规则：reshell')&&h.includes('批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界')&&document.activeElement===document.getElementById('sc-deny')&&!document.getElementById('sc-allow').disabled&&!document.body.textContent.includes('不再询问')})()`);
 await push('shell:confirm-request',suCard('risky','su-risky'));await pause(30);
 await check('SU approval risky tier label',`document.getElementById('sc-summary').textContent.includes('风险命令（risky）')&&document.getElementById('sc-title').textContent==='SU 命令审批'`);
 await push('shell:confirm-request',suCard('review','su-review'));await pause(30);
 await check('SU approval review tier label',`document.getElementById('sc-summary').textContent.includes('未自动判定（review）')`);
 await push('shell:confirm-request',{...scoped,id:'project-shell',policy:'project',command:'echo literal',summary:'项目卡摘要',reasonPlain:'项目角色原因原文',reasonRaw:'项目审核原文',cwd:ROOT,argvLines:[]});await pause(30);
 await check('project shell card stays verbatim without su warning',`(()=>{const t=document.getElementById('sc-title').textContent,s=document.getElementById('sc-summary').textContent,r=document.getElementById('sc-reason').textContent,h=document.getElementById('sc-hint').textContent;return t==='shell 命令请求'&&s==='项目卡摘要'&&r==='项目角色原因原文'&&!h.includes('可能绕过 ANS 文件写边界')&&document.activeElement===document.getElementById('sc-deny')})()`);
 const denyCount=shellResponses.length;await js(`document.getElementById('sc-deny').click()`);await pause(40);
 assert.equal(shellResponses.length,denyCount+1,'su/project deny responds once');assert.equal(shellResponses.at(-1).allow,false,'deny never authorizes');
 // 2026-10-18 真机（桌面UI）：settled / 失效回执后不保留按钮全禁用的 shell 确认卡；仍在等待的卡不受影响。
 const staleShell={...scoped,id:'stale-shell',policy:'project',command:'echo stale',summary:'旧卡',reasonPlain:'旧卡原因',cwd:ROOT,argvLines:[]};
 await push('shell:confirm-request',staleShell);await pause(30);
 await check('shell card stays actionable while its turn is waiting',`!document.getElementById('shell-confirm').hidden&&!document.getElementById('sc-deny').disabled&&window.__ansRenderer.state.shellConfirm.id==='stale-shell'`);
 await push('session:events',[{...scoped,roleId:'B',event:{kind:'settled',turnId:'other-turn',summary:'B 轮次结束',detail:{outcome:'completed'}}}]);
 await check('other role settled leaves the waiting shell card untouched',`!document.getElementById('shell-confirm').hidden&&!document.getElementById('sc-deny').disabled&&window.__ansRenderer.state.shellConfirm.id==='stale-shell'`);
 await push('session:events',[{...scoped,event:{kind:'settled',turnId:'stale-turn',summary:'本轮结束',detail:{outcome:'completed'}}}]);
 await check('settled removes its stale shell card instead of leaving a disabled card',`document.getElementById('shell-confirm').hidden&&window.__ansRenderer.state.shellConfirm===null`);
 await push('shell:confirm-request',{...staleShell,id:'fresh-shell'});await pause(30);
 await check('a new shell card after settled is actionable again',`!document.getElementById('shell-confirm').hidden&&!document.getElementById('sc-allow').disabled&&window.__ansRenderer.state.shellConfirm.id==='fresh-shell'`);
 await push('session:operator-expired',{...scoped,id:'stale-shell',reason:'旧请求已失效'});
 await check('late expiry for a removed id cannot touch the current card',`!document.getElementById('shell-confirm').hidden&&window.__ansRenderer.state.shellConfirm.id==='fresh-shell'`);
 await push('session:operator-expired',{...scoped,id:'fresh-shell',reason:'本轮已结束、停止或会话已重建，旧 shell 确认失效。'});
 await check('expiry receipt closes the shell card and reports the reason',`document.getElementById('shell-confirm').hidden&&window.__ansRenderer.state.shellConfirm===null&&document.getElementById('composer-hint').textContent.includes('旧 shell 确认失效')`);
 await push('session:operator-expired',{...scoped,id:'fresh-shell',reason:'重复失效'});
 await check('repeated expiry cannot rebuild a closed shell card',`document.getElementById('shell-confirm').hidden&&window.__ansRenderer.state.shellConfirm===null`);
}
async function sendFactsChecks(){
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
 const scope={projectRoot:ROOT,roleId:'A',runtime:'pi'};
 async function begin(text){sendDeferred=true;await js(`document.getElementById('inp-message').value=${JSON.stringify(text)};document.getElementById('btn-send').click()`);await pause(20);return sends.at(-1).metadata.clientMessageId;}
 async function event(client,turn,kind,outcome){await push('session:events',[{...scope,clientMessageId:client,event:{kind,turnId:turn,summary:kind==='settled'?'实际收尾 '+outcome:'用户输入',detail:kind==='settled'?{outcome}:{source:'prompt-input',text:'实际普通消息'}}}]);}
 let id=await begin('已接收停止消息');sendResolve({ok:false,error:'engine stop',clientMessageId:id,turnId:'stop-one',inputAccepted:true,outcome:'aborted',sessionCurrent:true});await pause(30);
 await check('P7 structured aborted reply keeps current handle and cleared accepted draft',`window.__ansRenderer.state.sessionOpenRoleId==='A'&&!document.getElementById('btn-send').disabled&&document.getElementById('inp-message').value===''&&!window.__ansRenderer.state.roleMeta.A.error&&!document.getElementById('chat').textContent.includes('发送失败：engine stop')`);
 await event(id,'stop-one','message');await event(id,'stop-one','settled','aborted');
 id=await begin('返回先于收尾');sendResolve({ok:false,error:'no terminal yet',clientMessageId:id,turnId:'stop-two',inputAccepted:true,sessionCurrent:true});await pause(30);
 await check('P7 accepted unknown result does not restore prompt or clear current handle',`document.getElementById('inp-message').value===''&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&document.getElementById('composer-hint').textContent.includes('尚未报告')`);
 await js(`document.getElementById('inp-message').value='下一条客户草稿'`);await event(id,'wrong-turn','settled','failed');
 await check('P7 wrong actual turn cannot overwrite original send outcome',`document.getElementById('composer-hint').textContent.includes('尚未报告')&&document.getElementById('inp-message').value==='下一条客户草稿'`);
 await event(id,'stop-two','message');await event(id,'stop-two','settled','aborted');
 await check('P7 delayed actual aborted terminal resolves unknown without changing new draft',`document.getElementById('composer-hint').textContent===''&&document.getElementById('inp-message').value==='下一条客户草稿'&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&!window.__ansRenderer.state.roleMeta.A.error`);
 id=await begin('收尾先于返回');await event(id,'stop-three','message');await event(id,'stop-three','settled','aborted');sendResolve({ok:false,error:'late stop',clientMessageId:id,turnId:'stop-three',inputAccepted:true,sessionCurrent:true});await pause(30);
 await check('P7 actual aborted stream before failed promise remains usable',`!window.__ansRenderer.state.roleMeta.A.error&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&document.getElementById('inp-message').value===''`);
 id=await begin('真实失败不能伪中止');await event(id,'real-failure','message');await event(id,'real-failure','settled','failed');sendResolve({ok:false,error:'actual failure',clientMessageId:id,turnId:'real-failure',inputAccepted:true,outcome:'failed',sessionCurrent:true});await pause(30);
 await check('P7 true accepted failed outcome remains error without requeueing accepted prompt',`window.__ansRenderer.state.roleMeta.A.error&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&!document.getElementById('btn-send').disabled&&document.getElementById('inp-message').value===''`);
 id=await begin('未接受拒发保留');sendResolve({ok:false,error:'rejected before input',clientMessageId:id,sessionCurrent:true});await pause(30);
 await check('P7 genuine unaccepted rejection restores draft and retains known current handle',`document.getElementById('inp-message').value==='未接受拒发保留'&&window.__ansRenderer.state.roleMeta.A.error&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&document.getElementById('chat').textContent.includes('发送失败：rejected before input')`);
 id=await begin('后台Pi拒发');await js(`await window.__ansRenderer.selectRuntime('claude');document.getElementById('inp-message').value='Claude新草稿'`);sendResolve({ok:false,error:'old runtime rejected',clientMessageId:id});await pause(30);
 await check('P7 old runtime rejected result cannot disable current runtime or overwrite draft',`window.__ansRenderer.state.runtime==='claude'&&window.__ansRenderer.state.sessionOpenRoleId==='A'&&!document.getElementById('btn-send').disabled&&document.getElementById('inp-message').value==='Claude新草稿'`);
 sendDeferred=false;
}
async function terminalMergeChecks(){
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
 const scope={projectRoot:ROOT,roleId:'A',runtime:'pi'};
 const event=(kind,turnId,outcome,summary,detail={})=>({...scope,event:{kind,turnId,summary,detail:{outcome,...detail}}});
 await push('session:events',[event('denied','merged-stop','aborted','本轮已中止'),event('settled','merged-stop','aborted','本轮已中止')]);
 await check('same actual turn and outcome denied plus settled has one readable terminal',`[...document.querySelectorAll('.sys-text')].filter(x=>x.textContent==='本轮已中止').length===1`);
 await push('session:events',[event('settled','reverse-failure','failed','实际失败收尾'),event('denied','reverse-failure','failed','真实错误：服务拒绝，保留完整诊断')]);
 await check('reverse arrival keeps actual failure and full diagnostic in same terminal row',`[...document.querySelectorAll('.turn-terminal')].some(x=>x.textContent.includes('实际失败收尾')&&x.textContent.includes('真实错误：服务拒绝，保留完整诊断'))&&window.__ansRenderer.state.roleMeta.A.error`);
 await push('session:events',[event('denied','other-stop','aborted','本轮已中止'),event('settled','other-stop','aborted','本轮已中止')]);
 await check('different actual turns retain two independent terminal records',`[...document.querySelectorAll('.turn-terminal')].filter(x=>x.textContent==='本轮已中止').length===2`);
 await push('session:events',[event('denied',undefined,'aborted','匿名真实终态'),event('settled',undefined,'aborted','匿名真实终态')]);
 await check('legacy without actual turn never merged by equal text',`[...document.querySelectorAll('.sys-text')].filter(x=>x.textContent==='匿名真实终态').length===2`);
 await push('session:events',[event('denied','distinct-outcome','failed','真实失败事实'),event('settled','distinct-outcome','timed_out','真实超时事实')]);
 await check('different structured outcomes in same turn remain separate facts',`[...document.querySelectorAll('.turn-terminal')].filter(x=>x.textContent.includes('真实失败事实')||x.textContent.includes('真实超时事实')).length===2`);
 await push('session:events',[event('denied','tool-turn','aborted','真实工具拒绝',{toolName:'run_shell',toolCallId:'tool-denied',phase:'blocked'}),event('settled','tool-turn','aborted','工具轮次已中止')]);
 await check('tool denial keeps independent tool lifecycle and terminal',`document.getElementById('chat').textContent.includes('真实工具拒绝')&&[...document.querySelectorAll('.turn-terminal')].some(x=>x.textContent.includes('工具轮次已中止')&&!x.textContent.includes('真实工具拒绝'))`);
 await push('session:history',{...scope,rows:[{kind:'assistant',text:'真正较早历史',turnId:'earlier'},{kind:'denied',eventKind:'denied',turnId:'merged-stop',text:'本轮已中止'},{kind:'denied',eventKind:'denied',turnId:'reverse-failure',text:'真实错误：服务拒绝，保留完整诊断'},{kind:'denied',eventKind:'denied',turnId:'other-stop',text:'本轮已中止'}]});
 await check('actual matching denied replay reuses terminal fact and retains distinct diagnostics',`[...document.querySelectorAll('.sys-text')].filter(x=>x.textContent==='本轮已中止').length===2&&[...document.querySelectorAll('.turn-terminal')].some(x=>x.textContent.includes('真实错误：服务拒绝，保留完整诊断')&&x.textContent.includes('实际失败收尾'))`);
 await push('session:events',[event('settled','merged-stop','aborted','本轮已中止')]);
 await check('late settled after matching history does not append another terminal',`[...document.querySelectorAll('.sys-text')].filter(x=>x.textContent==='本轮已中止').length===2`);
 await push('session:events',[event('denied','reverse-failure','failed','另一项真实失败诊断')]);
 await check('additional same-turn diagnosis remains reachable in the existing terminal',`[...document.querySelectorAll('.turn-terminal')].filter(x=>x.dataset.turnId==='reverse-failure').length===1&&[...document.querySelectorAll('.turn-terminal')].some(x=>x.textContent.includes('另一项真实失败诊断')&&x.textContent.includes('真实错误：服务拒绝'))`);
 await js(`await window.__ansRenderer.selectRuntime('claude')`);await push('session:events',[{...event('denied','merged-stop','aborted','Claude独立终态'),runtime:'claude'},{...event('settled','merged-stop','aborted','Claude独立终态'),runtime:'claude'}]);
 await check('same turn ID in other runtime remains independent',`document.querySelectorAll('.turn-terminal').length===1&&document.querySelector('.turn-terminal').textContent==='Claude独立终态'`);
 await js(`await window.__ansRenderer.selectRuntime('pi')`);
 const lateHistory=[{kind:'denied',eventKind:'denied',turnId:'history-first',text:'已有真实历史中止'}];await push('session:history',{...scope,rows:lateHistory});
 await push('session:events',[event('denied','history-first','aborted','已有真实历史中止'),event('settled','history-first','aborted','已有真实历史中止')]);
 await check('history-first exact replay identity is promoted only by trusted matching live outcome',`[...document.querySelectorAll('.sys-text')].filter(x=>x.textContent==='已有真实历史中止').length===1&&[...document.querySelectorAll('.turn-terminal')].some(x=>x.dataset.turnId==='history-first')`);
 const many=Array.from({length:220},(_,n)=>({...scope,event:{kind:'message',turnId:'virtual-'+n,summary:'真实长列表记录 '+n+' '+('内容'.repeat(20))}}));await push('session:events',many);await push('session:events',[event('denied','virtual-stop','aborted','虚拟列表中止')]);
 await js(`document.getElementById('chat').scrollTop=160;document.getElementById('chat').dispatchEvent(new Event('scroll'))`);await pause(40);const scroll=await js(`document.getElementById('chat').scrollTop`);
 await push('session:events',[event('settled','virtual-stop','aborted','虚拟列表中止')]);await pause(40);
 await check('offscreen terminal update keeps virtual reading position',`Math.abs(document.getElementById('chat').scrollTop-${scroll})<2`);

}
async function visualChecks(){
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
 const scope={projectRoot:ROOT,roleId:'A',runtime:'pi'},request='明确任务请求原文。'+('内容原样保留。'.repeat(80));
 await js(`document.getElementById('inp-message').value=${JSON.stringify(request)};document.getElementById('btn-send').click()`);await pause(30);const sent=sends.at(-1);
 await push('session:events',[{...scope,clientMessageId:sent.metadata.clientMessageId,event:{kind:'message',turnId:'visual-task',summary:'用户输入',detail:{source:'prompt-input',text:request}}},{...scope,event:{kind:'message',turnId:'ordinary-chat',summary:'用户输入',detail:{source:'prompt-input',text:'普通聊天不折叠也不制造报告'}}}]);
 await push('session:role-state',{...scope,busy:true,queue:[],summaries:[]});
 await push('session:events',[{...scope,event:{kind:'message',turnId:'visual-task',summary:'本轮角色回复原文。不得删除改写，模型原文保留。'}}]);
 await check('V2 ordinary chat stays ordinary before any structured report',`document.querySelectorAll('.msg-handback').length===0&&document.querySelectorAll('.task-request').length===0`);
 await check('V2 accepted structural positions and real window controls',`document.querySelector('.sidebar-foot #btn-import')&&document.querySelector('.sidebar-foot #tab-pi')&&document.querySelector('.chat-head #tab-work')&&document.querySelector('.chat-head #tab-card')&&document.querySelector('.session-actions #runtime-select')&&document.querySelector('.capsule > textarea')&&document.querySelector('.composer-bottom #composer-scope')&&document.querySelector('.composer-bottom #btn-send')&&['win-min','win-max','win-close'].every(id=>{let e=document.getElementById(id),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right<=innerWidth&&!e.closest('[inert]')})?true:false`);
 await js(`document.getElementById('tab-work').click()`);await pause(150);await check('V2 ordinary chat work overview has no invented report',`document.getElementById('drawer-title').textContent.includes('工作概览')&&document.querySelector('.recent-reports').textContent.includes('暂无交付报告')&&!document.querySelector('.recent-report')&&!document.querySelector('#right-body details[data-section]')`);await key('Escape');
 const full='真实报告原文🙂。'.repeat(100)+'\nsummary-tail-safe',preview=Array.from(full).slice(0,180).join('').split(/\r?\n/).slice(0,4).join('\n');
 const report={version:1,reportId:'visual-report',source:{roleId:'A',runtime:'pi',turnId:'visual-task'},taskId:null,origin:'submitted-report',status:'completed',summary:{text:full,redacted:true,truncated:true},evidence:[{text:'真实证据原文，不根据stdout构造结论',redacted:false,truncated:true}],evidenceOmitted:2,at:'2026-10-15T00:00:00Z'};flowReports[report.reportId]={state:'saved',reportId:report.reportId,report,retryAvailable:false};
 await push('session:events',[{...scope,event:{kind:'handback',report,reportPersistence:flowReports[report.reportId],summary:'可信报告已到达'}}]);await pause(60);
 await check('V2 source report uses separate layered top and facts before primary source and full copy',`(()=>{let c=document.querySelector('.msg-handback'),t=c.querySelector('.report-top'),b=c.querySelector('.report-body');return t&&b&&t.querySelector('.report-eyebrow')&&t.querySelector('.report-title')&&t.querySelector('.hb-head')&&b.querySelector('.report-facts').compareDocumentPosition(b.querySelector('.report-actions'))&Node.DOCUMENT_POSITION_FOLLOWING&&b.querySelector('.report-actions').firstElementChild.classList.contains('report-source-button')&&getComputedStyle(t).backgroundColor==='rgb(34, 48, 43)'?true:false})()`);
 await check('V2 preview is deterministic real summary while complete safe copy is independently reachable',`document.querySelector('.hb-summary').textContent.trim()===${JSON.stringify(preview)}&&!document.querySelector('.report-complete').open&&document.querySelector('.hb-complete-summary').textContent.includes('summary-tail-safe')&&document.querySelector('.report-complete > summary').textContent==='查看完整报告摘要与证据'`);
 await check('V2 report status unknown association redaction truncation omission and save facts remain visible',`(()=>{let c=document.querySelector('.msg-handback'),d=c.querySelector('.report-complete');return c.textContent.includes('报告声明：已完成')&&c.querySelector('.hb-meta').textContent.includes('任务关联未知')&&c.querySelector('.projection-flags').textContent.includes('已截断')&&c.querySelector('.projection-flags').textContent.includes('净化')&&c.querySelector('.projection-flags').textContent.includes('预算省略')&&c.querySelector('.report-facts').textContent.includes('尚未确认')&&c.querySelector('.report-disclaimer').textContent.includes('不等于独立验收通过')&&c.querySelector('.persistence-message').textContent==='报告已保存'&&!d.open})()`);
 await check('V2 report declaration alone cannot fold an active assistant message',`document.querySelectorAll('.reply-original').length===0&&document.querySelector('.msg-assistant').textContent.trim()==='本轮角色回复原文。不得删除改写，模型原文保留。'&&!document.querySelector('.msg-assistant.is-streaming')`);
 await push('session:events',[{...scope,event:{kind:'settled',turnId:'visual-task',summary:'会话结束',detail:{outcome:'completed'}}}]);
 await check('V2 true settled folds only the exact report turn assistant original in place',`document.querySelectorAll('.reply-original').length===1&&!document.querySelector('.reply-original').open&&document.querySelector('.reply-original > summary').textContent==='本轮角色回复原文（展开）'&&document.querySelector('.reply-original .msg-assistant').textContent.includes('不得删除改写')&&!document.querySelector('.reply-original .sys,.reply-original .tool-records,.reply-original .op-request')`);
 await push('session:events',[{...scope,event:{kind:'message',turnId:'visual-task',summary:'同实际turn后到原回复'}},{...scope,event:{kind:'message',turnId:'unrelated-chat',summary:'未关联报告的聊天回复'}}]);
 await check('V2 late exact turn reply follows settled rule and other turns remain ordinary',`document.querySelectorAll('.reply-original').length===2&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.includes('未关联报告的聊天回复')&&!x.closest('.reply-original'))`);
 await check('V2 task request folds only by exact structured report actual turn without reordering ordinary chat',`document.querySelectorAll('.task-request').length===1&&!document.querySelector('.task-request').open&&document.querySelector('.task-request').textContent.includes(${JSON.stringify(request)})&&[...document.querySelectorAll('.msg-user')].some(x=>x.textContent.trim()==='普通聊天不折叠也不制造报告'&&!x.closest('.task-request'))`);
 await js(`document.querySelector('.report-complete').open=true;document.querySelector('.task-request').open=true;window.__visualComplete=document.querySelector('.report-complete');document.getElementById('inp-message').value='V2保留客户草稿'`);
 await push('report-persistence-updated',{version:1,scope,change:{kind:'report-save',reportId:report.reportId,state:{state:'saved',reportId:report.reportId,retryAvailable:false}}});
 await check('V2 local state refresh preserves full report and original task expansion',`document.querySelector('.report-complete')===window.__visualComplete&&document.querySelector('.report-complete').open&&document.querySelector('.task-request').open`);
 await js(`document.querySelector('.report-complete').open=false;document.querySelector('.task-request').open=false;document.querySelector('.report-source-button').scrollIntoView({block:'center'});document.querySelector('.report-source-button').focus();document.querySelector('.report-source-button').click()`);await pause(180);
 await check('V2 modal declares dialog and makes whole background inert',`document.getElementById('right-drawer').getAttribute('role')==='dialog'&&document.getElementById('right-drawer').getAttribute('aria-modal')==='true'&&!document.getElementById('drawer-backdrop').hidden&&document.querySelector('.col-left').inert&&document.querySelector('.col-mid').inert&&!document.getElementById('win-min').closest('[inert]')&&document.activeElement.id==='drawer-close'`);
 await check('V2 document drawer matches 18px heading source block and outlined right reading action',`(()=>{let h=document.getElementById('drawer-title'),li=document.querySelector('.document-list li'),m=li.querySelector('.document-list-meta'),b=li.querySelector('button');return getComputedStyle(h).fontSize==='18px'&&document.querySelector('.document-source-note')&&b.getBoundingClientRect().left>=m.getBoundingClientRect().right&&b.getBoundingClientRect().height>=32&&getComputedStyle(b).borderTopWidth==='1px'?true:false})()`);
 await js(`document.getElementById('win-min').click();document.getElementById('win-max').click();document.getElementById('win-close').click()`);await pause(30);assert.deepEqual(windowCalls,['minimize','maximize','close']);
 await check('V2 native window controls retain visible icons and real IPC while business background is inert',`['win-min','win-max','win-close'].every(id=>{let e=document.getElementById(id),svg=e.querySelector('svg'),r=svg.getBoundingClientRect();return !e.closest('[inert]')&&r.width>0&&r.height>0})&&document.querySelector('.col-mid').inert`);
 await js(`document.getElementById('drawer-close').focus()`);
 await key('Tab',['shift']);
 await check('V2 Shift Tab wraps from first to last actual drawer control',`document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement.dataset.docAction==='refresh'`);await key('Tab');
 await check('V2 Tab wraps last to first without escaping modal',`document.activeElement.id==='drawer-close'`);
 await js(`document.getElementById('inp-message').focus()`);
 await check('V2 background focus cannot escape into composer',`document.getElementById('right-drawer').contains(document.activeElement)`);
 const chatTop=await js(`document.getElementById('chat').scrollTop`),sendBefore=sends.length,openBefore=opens.length;
 await key('Escape');await pause(150);
 await check('V2 Escape restores actual visible report invoker draft and same chat reading',`document.activeElement.classList.contains('report-source-button')&&!document.querySelector('.col-mid').inert&&document.getElementById('drawer-backdrop').hidden&&document.getElementById('inp-message').value==='V2保留客户草稿'&&Math.abs(document.getElementById('chat').scrollTop-${chatTop})<2&&window.__ansRenderer.state.selectedRoleId==='A'&&window.__ansRenderer.state.runtime==='pi'`);assert.equal(sends.length,sendBefore);assert.equal(opens.length,openBefore);
 // 深色石墨主题（2026-10-19 客户决定）：真实渲染树里不得再有任何"亮底"可见元素——
 // 不只查 :root 令牌，直接按计算样式扫描（防"只改根令牌、局部仍是浅色"）。返回 true 或违规清单。
 const darkSurfaceScan=`(()=>{const lum=(r,g,b)=>{const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};const bad=[];for(const el of document.querySelectorAll('body *')){const st=getComputedStyle(el);if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')continue;const m=st.backgroundColor.match(/^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)$/);if(!m)continue;const a=m[4]===undefined?1:parseFloat(m[4]);if(a>0.5&&lum(+m[1],+m[2],+m[3])>.5)bad.push((el.id?'#'+el.id:el.className||el.tagName)+'='+st.backgroundColor)}return bad.length===0?true:bad.join(' | ')})()`;
 for(const width of [1360,960]){win.setContentSize(width,860);await pause(100);await js(`document.querySelector('.msg-handback').scrollIntoView({block:'start'})`);await pause(40);
 reports.push({name:'V2 measured geometry '+width,value:await js(`({nav:document.querySelector('.col-left').getBoundingClientRect().width,pane:document.querySelector('.chat-pane').getBoundingClientRect().width,capsule:document.getElementById('composer-capsule').getBoundingClientRect().width,button:document.querySelector('.report-source-button').getBoundingClientRect().toJSON(),composer:document.querySelector('.composer').getBoundingClientRect().toJSON(),root:document.documentElement.scrollWidth,innerWidth})`)});fs.writeFileSync(path.join(OUT,'visual-v2-precheck-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
 await check('V2 real geometry '+width,`(()=>{let nav=document.querySelector('.col-left').getBoundingClientRect(),p=document.querySelector('.chat-pane').getBoundingClientRect(),c=document.getElementById('composer-capsule').getBoundingClientRect(),head=document.querySelector('.chat-head'),note=document.querySelector('.compose-note').getBoundingClientRect(),button=document.querySelector('.report-source-button'),b=button.getBoundingClientRect();return Math.abs(nav.width-248)<1&&${width===1360?"Math.abs(p.width-900)<2":"Math.abs(p.width-664)<2"}&&Math.abs(p.width-c.width)<2&&Math.abs(p.left-c.left)<2&&Math.abs(note.left-p.left)<2&&Math.abs(head.getBoundingClientRect().left+parseFloat(getComputedStyle(head).paddingLeft)-p.left)<2&&getComputedStyle(document.querySelector('.col-left')).borderRightWidth==='1px'&&getComputedStyle(head).borderBottomWidth==='1px'&&getComputedStyle(document.querySelector('.composer')).borderTopWidth==='1px'&&getComputedStyle(document.querySelector('.composer')).backgroundColor!=='rgb(255, 255, 255)'&&document.documentElement.scrollWidth<=innerWidth&&b.height>=32&&b.bottom<=document.querySelector('.composer').getBoundingClientRect().top})()`);
 await check('V2 dark theme: no visible light surfaces '+width,darkSurfaceScan);
 fs.writeFileSync(path.join(OUT,'visual-v2-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
 await js(`document.querySelector('.report-source-button').click()`);await pause(150);
 await check('V2 modal width is 424 at '+width,`Math.abs(document.getElementById('right-drawer').getBoundingClientRect().width-424)<1`);await check('V2 dark theme: no visible light surfaces in drawer '+width,darkSurfaceScan);fs.writeFileSync(path.join(OUT,'visual-v2-drawer-'+width+'.png'),(await win.webContents.capturePage()).toPNG());await key('Escape');}
 // 左栏宽度（2026-10-17 客户选择「248px + 可拖拽」）：拖动 248→328、持久化、双击复位、键盘 Shift±24、折叠保留。
 win.setContentSize(1362,860);await pause(120);await js(`document.querySelector('.app').style.transition='none'`);
 await check('V2 sidebar default width 248 and resizer aria',`Math.abs(document.querySelector('.col-left').getBoundingClientRect().width-248)<1&&document.getElementById('sidebar-resizer').getAttribute('aria-valuenow')==='248'&&document.getElementById('sidebar-resizer').getAttribute('role')==='separator'&&document.getElementById('sidebar-resizer').getAttribute('aria-orientation')==='vertical'&&Math.abs(document.querySelector('.chat-pane').getBoundingClientRect().width-900)<2`);
 const drag=await js(`(()=>{const r=document.getElementById('sidebar-resizer'),ev=(t,x)=>r.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,pointerId:1,button:0}));ev('pointerdown',500);ev('pointermove',580);ev('pointerup',580);return {nav:document.querySelector('.col-left').getBoundingClientRect().width,aria:r.getAttribute('aria-valuenow'),stored:localStorage.getItem('ans.sidebar.width'),pane:document.querySelector('.chat-pane').getBoundingClientRect().width,root:document.documentElement.scrollWidth<=innerWidth};})()`);
 assert.ok(Math.abs(drag.nav-328)<1,'drag width 328');assert.equal(drag.aria,'328','drag aria');assert.equal(drag.stored,'328','drag persisted');assert.ok(Math.abs(drag.pane-900)<2,'content column stays 900');assert.ok(drag.root,'no horizontal overflow');
 fs.writeFileSync(path.join(OUT,'visual-resized-1362.png'),(await win.webContents.capturePage()).toPNG());
 await js(`document.getElementById('sidebar-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
 await check('V2 sidebar double click resets 248',`Math.abs(document.querySelector('.col-left').getBoundingClientRect().width-248)<1&&document.getElementById('sidebar-resizer').getAttribute('aria-valuenow')==='248'&&localStorage.getItem('ans.sidebar.width')==='248'`);
 fs.writeFileSync(path.join(OUT,'visual-width-reset-1362.png'),(await win.webContents.capturePage()).toPNG());
 await js(`(()=>{const r=document.getElementById('sidebar-resizer');r.focus();r.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true}));})()`);
 await check('V2 sidebar keyboard shift right +24',`Math.abs(document.querySelector('.col-left').getBoundingClientRect().width-272)<1&&document.getElementById('sidebar-resizer').getAttribute('aria-valuenow')==='272'`);
 await js(`document.getElementById('sidebar-collapse').click()`);await pause(60);
 await js(`document.getElementById('sidebar-expand').click()`);await pause(60);
 await check('V2 sidebar collapse preserves custom width',`!document.querySelector('.app').classList.contains('is-sidebar-collapsed')&&Math.abs(document.querySelector('.col-left').getBoundingClientRect().width-272)<1&&document.getElementById('sidebar-resizer').getAttribute('aria-valuenow')==='272'`);
 await js(`document.getElementById('sidebar-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await js(`document.querySelector('.app').style.transition=''`);
 // 可收起左栏（2026-10-17 客户反馈）：1362/1280/960 收起后 900 列保持、头/输入 y 不变、无横向溢出、滚动不跳。
 for(const width of [1362,1280,960]){win.setContentSize(width,860);await pause(120);
  const before=await js(`({head:document.querySelector('.chat-head').getBoundingClientRect().top,composer:document.querySelector('.composer').getBoundingClientRect().top})`);
  await js(`document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight*.4`);const scrollBefore=await js(`document.getElementById('chat').scrollTop`);
  // 离线窗口/离屏时 CSS 过渡帧可能被节流；几何验收先禁用过渡（过渡存在性由静态测试守卫）。
  await js(`document.querySelector('.app').style.transition='none';document.querySelector('.col-left').style.transition='none';document.querySelectorAll('.sidebar-toggle').forEach(x=>x.style.transition='none')`);
  await js(`document.getElementById('sidebar-collapse').click()`);await pause(80);
  await check('V2 sidebar collapsed geometry '+width,`(()=>{const app=document.querySelector('.app'),left=document.querySelector('.col-left'),chat=document.getElementById('chat'),p=document.querySelector('.chat-pane').getBoundingClientRect(),h=document.querySelector('.chat-head').getBoundingClientRect(),c=document.querySelector('.composer').getBoundingClientRect(),e=document.getElementById('sidebar-expand');return app.classList.contains('is-sidebar-collapsed')&&getComputedStyle(left).visibility==='hidden'&&left.getBoundingClientRect().width===0&&!e.hidden&&Math.abs(p.width-900)<2&&Math.abs(h.top-${before.head})<1&&Math.abs(c.top-${before.composer})<1&&(Math.abs(chat.scrollTop-${scrollBefore})<2||chat.scrollTop===chat.scrollHeight-chat.clientHeight)&&document.documentElement.scrollWidth<=innerWidth})()`);
  fs.writeFileSync(path.join(OUT,'visual-collapsed-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('sidebar-expand').click()`);await pause(80);
  await check('V2 sidebar expanded restored '+width,`!document.querySelector('.app').classList.contains('is-sidebar-collapsed')&&document.getElementById('sidebar-expand').hidden&&!document.getElementById('sidebar-collapse').hidden&&Math.abs(document.querySelector('.chat-pane').getBoundingClientRect().width-${width===960?664:900})<2&&Math.abs(document.querySelector('.chat-head').getBoundingClientRect().top-${before.head})<1&&Math.abs(document.querySelector('.composer').getBoundingClientRect().top-${before.composer})<1&&document.documentElement.scrollWidth<=innerWidth`);
  await js(`document.querySelector('.app').style.transition='';document.querySelector('.col-left').style.transition='';document.querySelectorAll('.sidebar-toggle').forEach(x=>x.style.transition='')`);}
 await js(`document.querySelector('.reply-original').open=true`);
 await push('session:history',{...scope,rows:[{kind:'user',turnId:'visual-task',text:request},{kind:'assistant',eventKind:'message',turnId:'visual-task',text:'本轮角色回复原文。不得删除改写，模型原文保留。'},{kind:'assistant',eventKind:'message',turnId:'visual-task',text:'可靠cold报告关联原文 [REDACTED]',textProjection:{text:'可靠cold报告关联原文 [REDACTED]',redacted:true,truncated:true}},{kind:'assistant',eventKind:'message',text:'legacy无turn原文保留展开'},{kind:'assistant',eventKind:'message',turnId:'ordinary-other',text:'其它turn无报告原文保留展开'}],reports:[report]});await pause(50);
 await check('V2 cold exact report turn folds neutral original only and preserves explicit expansion',`[...document.querySelectorAll('.reply-original')].some(x=>x.textContent.includes('可靠cold报告关联原文')&&!x.open&&x.querySelector('summary .projection-flags').textContent.includes('已截断'))&&[...document.querySelectorAll('.reply-original')].some(x=>x.textContent.includes('不得删除改写')&&x.open)&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.includes('legacy无turn')&&!x.closest('.reply-original'))&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.includes('其它turn无报告')&&!x.closest('.reply-original'))`);
 const received={...report,reportId:'visual-received',source:{roleId:'B',runtime:'pi',turnId:'received-source'},summary:{text:'收到的真实安全摘要。'+('原文不生成新结论。'.repeat(40))+'received-tail',redacted:false,truncated:false}};
 const receipt={version:1,deliveryId:'visual-delivery',attemptId:'visual-attempt',turnId:'visual-target',inputSaved:true,providerMayHaveStarted:true,history:'saved',outcome:'completed',retryHistoryAvailable:false,retryDeliveryAllowed:false};flowReceipts[receipt.attemptId]=receipt;
 const delivery={source:'prompt-input',text:'安全交接显示副本',inputProvenance:{version:1,kind:'handback',deliveryId:receipt.deliveryId,attemptId:receipt.attemptId,target:{roleId:'A',runtime:'pi'},reports:[received]},inputTextProjection:{version:1,source:'trusted-handback-display',modelInputRecorded:false,redacted:false,truncated:false,summaryTruncated:false}};
 const promptBefore=sends.length;
 await push('session:events',[{...scope,event:{kind:'message',turnId:'visual-target',summary:'真实交付投递',detail:delivery}}]);await pause(60);
 await check('V2 received report shares layered safe report ordering with one separate batch receipt',`(()=>{let c=document.querySelector('.msg-delivery'),r=c.querySelector('.delivery-report'),p=c.querySelector(':scope > .persistence-state');return c.querySelectorAll(':scope > .persistence-state').length===1&&p.querySelectorAll(':scope > .delivery-batch-facts').length===1&&Array.from(p.querySelectorAll('dt')).map(x=>x.textContent).join('|')==='接收历史|目标输入记录|目标轮次结果'&&Array.from(p.querySelectorAll('dd')).map(x=>x.textContent).join('|')==='已保存|已保存|已完成'&&p.compareDocumentPosition(r)&Node.DOCUMENT_POSITION_FOLLOWING&&r.querySelector('.report-top .report-eyebrow').textContent.includes('B')&&!r.querySelector('.persistence-state')&&r.querySelector('.report-actions').firstElementChild.classList.contains('report-source-button')&&r.querySelector('.hb-complete-summary').textContent.includes('received-tail')&&!c.querySelector('.safe-input-copy').open?true:false})()`);
 await check('V2 target batch facts use actual compact component typography spacing and boundaries',`(()=>{let p=document.querySelector('.msg-delivery > .persistence-state'),d=p.querySelector('.delivery-batch-facts'),c=getComputedStyle(d);return getComputedStyle(d.querySelector('dt')).fontSize==='11px'&&getComputedStyle(d.querySelector('dd')).fontSize==='13px'&&c.rowGap==='12px'&&c.columnGap==='24px'&&c.paddingTop==='14px'&&c.paddingBottom==='14px'&&c.borderTopWidth==='1px'&&c.borderBottomWidth==='1px'&&getComputedStyle(p).borderLeftWidth==='0px'&&!p.querySelector('.delivery-execution')})()`);
 await js(`document.getElementById('tab-work').click()`);await pause(150);
 await check('V2 independent work overview includes own and actual received structured reports',`document.getElementById('drawer-title').textContent.includes('工作概览')&&document.querySelectorAll('.recent-report').length===2&&!document.getElementById('right-body').textContent.includes('暂无交付报告')&&!document.querySelector('#right-body details[data-section]')`);
 await key('Escape');
 const receipt2={...receipt,attemptId:'visual-attempt-two',turnId:'visual-target-two'};flowReceipts[receipt2.attemptId]=receipt2;
 await push('session:events',[{...scope,event:{kind:'message',turnId:receipt2.turnId,summary:'另一次真实投递同份报告',detail:{...delivery,inputProvenance:{...delivery.inputProvenance,attemptId:receipt2.attemptId}}}}]);await pause(40);await js(`document.getElementById('tab-work').click()`);await pause(80);
 await check('V2 work de-duplicates only real report identity while separate delivery attempts stay visible',`document.querySelectorAll('.recent-report').length===2&&document.querySelectorAll('.msg-delivery').length===2`);await key('Escape');assert.equal(sends.length,promptBefore);
 await pause(300);
 for (const width of [1360,960]) {
  win.setContentSize(width,860);await pause(180);
  await js(`document.querySelector('.msg-delivery').scrollIntoView({block:'start'})`);await pause(220);
  await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(OUT,'visual-v2-received-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
 }


 await push('session:events',[{...scope,event:{kind:'message',turnId:'visual-target',summary:'接收轮流式解说原文'}},{...scope,event:{kind:'message',turnId:'other-chat',summary:'无关普通聊天'}}]);await pause(40);
 await check('SV13 distinct receiver turn streaming stays expanded',`[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.trim()==='接收轮流式解说原文'&&!x.closest('.reply-original'))`);
 await push('session:events',[{...scope,event:{kind:'settled',turnId:'visual-target',summary:'接收轮结束',detail:{outcome:'completed'}}}]);await pause(60);
 await check('SV13 true settled receiver folds only exact assistant original',`[...document.querySelectorAll('.reply-original')].some(x=>x.querySelector('summary').textContent==='本轮交付处理回复原文（展开）'&&x.textContent.includes('接收轮流式解说原文')&&!x.open)&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.trim()==='无关普通聊天'&&!x.closest('.reply-original'))&&!document.querySelector('.msg-delivery').closest('.reply-original')`);
 await js(`let x=[...document.querySelectorAll('.reply-original')].find(x=>x.textContent.includes('接收轮流式解说原文'));x.open=true`);
 await push('session:events',[{...scope,event:{kind:'message',turnId:'visual-target',summary:'接收轮后到原文'}}]);await pause(40);
 await check('SV13 later receiver text folds preserving explicit expansion',`[...document.querySelectorAll('.reply-original')].some(x=>x.textContent.includes('接收轮后到原文')&&!x.open)&&[...document.querySelectorAll('.reply-original')].some(x=>x.textContent.includes('接收轮流式解说原文')&&x.open)`);
 await push('session:history',{...scope,rows:[{kind:'user',turnId:'visual-target',text:'安全交接显示副本',inputProvenance:delivery.inputProvenance,inputTextProjection:delivery.inputTextProjection},{kind:'assistant',turnId:'visual-target',text:'接收轮流式解说原文'},{kind:'assistant',turnId:'visual-target',text:'冷记录安全副本',textProjection:{redacted:true,truncated:true}},{kind:'assistant',turnId:'other-chat',text:'无关普通聊天'},{kind:'assistant',text:'legacy无turn'}],reports:[]});await pause(80);
 await check('SV13 cold receiver keeps neutral label flags expansion and unrelated legacy text',`[...document.querySelectorAll('.reply-original')].some(x=>x.querySelector('summary').textContent.includes('本轮交付处理回复原文（展开）')&&x.textContent.includes('冷记录安全副本')&&!x.open&&x.querySelector('summary .projection-flags').textContent.includes('已截断'))&&[...document.querySelectorAll('.reply-original')].some(x=>x.textContent.includes('接收轮流式解说原文')&&x.open)&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.trim()==='无关普通聊天'&&!x.closest('.reply-original'))&&[...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.trim()==='legacy无turn'&&!x.closest('.reply-original'))`);

 const orderRoot=ROOT+'/cold-report-order';await js(`await window.__ansRenderer.loadProject(${JSON.stringify(orderRoot)});await window.__ansRenderer.selectRole('A')`);
 const orderScope={projectRoot:orderRoot,roleId:'A',runtime:'pi'};
 const newer={...report,reportId:'446dd-order-new',at:'2026-10-15T08:46:00Z',summary:{text:'order-newer-report',redacted:false,truncated:false}},older={...report,reportId:'8b6c-order-old',at:'2026-10-15T08:05:00Z',summary:{text:'order-older-report',redacted:false,truncated:false}};
 flowReports[newer.reportId]=newer;flowReports[older.reportId]=older;
 const orderRows=[{kind:'assistant',text:'row-first'},{kind:'tool',text:'real read',activity:{toolName:'read_file',callId:'order-read',turnId:'order-row-turn',phase:'start'}},{kind:'tool',text:'real shell',activity:{toolName:'run_shell',callId:'order-shell',turnId:'order-row-turn',phase:'start'}},{kind:'assistant',text:'row-last'}];
 await push('session:history',{...orderScope,rows:orderRows,reports:[newer,older]});await pause(80);
 await check('cold reports reverse hash wire becomes actual time old to new while tool row order remains',`(()=>{let cards=[...document.querySelectorAll('.msg-handback')];return cards.length===2&&cards[0].textContent.includes('order-older-report')&&cards[1].textContent.includes('order-newer-report')&&document.querySelectorAll('.tool-activity').length===2&&document.querySelectorAll('.tool-activity')[0].textContent.includes('read_file')&&document.querySelectorAll('.tool-activity')[1].textContent.includes('run_shell')})()`);
 await push('session:history',{...orderScope,rows:orderRows,reports:[newer,older]});await pause(40);
 await check('cold sorted report identities still deduplicate on repeated history snapshot',`document.querySelectorAll('.msg-handback').length===2`);
 const unknownRoot=ROOT+'/cold-report-unknown';await js(`await window.__ansRenderer.loadProject(${JSON.stringify(unknownRoot)});await window.__ansRenderer.selectRole('A')`);
 await push('session:history',{...orderScope,projectRoot:unknownRoot,rows:[],reports:[{...newer,at:'invalid'},older]});await pause(80);
 await check('cold unknown report time preserves wire ordering without guessing',`(()=>{let c=[...document.querySelectorAll('.msg-handback')];return c.length===2&&c[0].textContent.includes('order-newer-report')&&c[1].textContent.includes('order-older-report')})()`);

 // 左树滚动（2026-10-17 实机：248px + 9 角色时主入口 su 被滚出视口）：导入/选中后可见；已可见时手动滚动不被重置。
 const oldRoles=listing.roles,oldPrimary=listing.primaryRoleId;
 const manyIds=['su','r1','r2','r3','r4','r5','r6','r7','r8'];
 listing.roles=manyIds.map((roleId,index)=>({...roles[0],roleId,builtIn:index===0,cardPath:ROOT+'/角色卡/'+roleId+'/role-card.md',cardText:'# '+roleId+'\n\n职责。',boundary:{entries:[]},boundaryPath:'',changelog:null,docs:[],documents:[]}));
 listing.primaryRoleId='su';
 win.setContentSize(1362,860);await pause(100);
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(120);
 await check('V2 import selects primary su and keeps it inside tree viewport',`(()=>{const t=document.getElementById('role-tree'),r=t.getBoundingClientRect(),s=t.querySelector('[data-role-id="su"]');if(!s)return false;const i=s.getBoundingClientRect();return window.__ansRenderer.state.selectedRoleId==='su'&&t.scrollHeight>t.clientHeight&&i.top>=r.top-1&&i.bottom<=r.bottom+1})()`);
 fs.writeFileSync(path.join(OUT,'visual-tree-su-visible-1362.png'),(await win.webContents.capturePage()).toPNG());
 await js(`document.querySelector('[data-role-id="r4"]').click()`);await pause(120);
 await check('V2 selecting middle role keeps it inside tree viewport',`(()=>{const t=document.getElementById('role-tree'),r=t.getBoundingClientRect(),s=t.querySelector('[data-role-id="r4"]');if(!s)return false;const i=s.getBoundingClientRect();return i.top>=r.top-1&&i.bottom<=r.bottom+1})()`);
 const keepScroll=await js(`(()=>{const t=document.getElementById('role-tree'),s=t.querySelector('[data-role-id="r4"]'),tr=t.getBoundingClientRect(),sr=s.getBoundingClientRect();t.scrollTop=Math.max(20,t.scrollTop+(sr.top-tr.top)-Math.floor(t.clientHeight/3));return t.scrollTop;})()`);
 await js(`await window.__ansRenderer.refreshProject()`);await pause(120);
 await check('V2 refresh keeps visible selection and manual tree scroll',`(()=>{const t=document.getElementById('role-tree'),s=t.querySelector('[data-role-id="r4"]'),r=t.getBoundingClientRect(),i=s.getBoundingClientRect();return Math.abs(t.scrollTop-${keepScroll})<1&&t.scrollTop!==0&&i.top>=r.top-1&&i.bottom<=r.bottom+1})()`);
 await js(`document.querySelector('[data-role-id="su"]').click()`);await pause(120);
 await check('V2 clicking primary su reveals it in tree viewport',`(()=>{const t=document.getElementById('role-tree'),r=t.getBoundingClientRect(),s=t.querySelector('[data-role-id="su"]'),i=s.getBoundingClientRect();return i.top>=r.top-1&&i.bottom<=r.bottom+1})()`);
 listing.roles=oldRoles;listing.primaryRoleId=oldPrimary;
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);
}
async function deliveryNoteChecks(){
 listing.roles[0].builtIn=true;
 const project=ROOT+'/very-long-project-folder-name-'.repeat(18);
 await js(`await window.__ansRenderer.loadProject(${JSON.stringify(project)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('B')`);
 const scope={projectRoot:project,roleId:'B',runtime:'pi'};
 const oldNote='已接收来自 su 的派发任务——请按任务文本执行，完成后交回报告。';
 await push('session:events',[{...scope,event:{kind:'tool_call',summary:oldNote}}]);
 const original=JSON.parse(fs.readFileSync(path.resolve(APP,'../角色卡/桌面UI/docs/fix/2026-10-15-delivery-note-ui-evidence/real-protected-history.json'),'utf8'));
 const history={...original,...scope,reports:original.reports.map(report=>({...report,source:{...report.source,roleId:'B'}}))};
 for(const report of history.reports)flowReports[report.reportId]={state:'saved',reportId:report.reportId,report,retryAvailable:false};
 await push('session:history',history);
 await check('real ten-call history plus old delivery note never creates an eleventh anonymous tool',`document.querySelectorAll('.tool-call-record').length===10&&document.querySelectorAll('.tool-activity').length===0&&document.querySelectorAll('.tool-records').length===0`);
 await check('old anonymous delivery event stays fully reachable as explicit unknown system record',`[...document.querySelectorAll('.sys-unknown-tool-event')].some(x=>x.textContent.includes('旧/未知系统记录')&&x.textContent.includes(${JSON.stringify(oldNote)}))`);
 const typedNote='已将 测试 的交付自动投递给 su（等待验收与汇总）。全文进展不裁剪。';
 await push('session:events',[{...scope,event:{kind:'message',summary:typedNote,detail:{source:'delivery-note'}}}]);
 await check('new actual wire delivery note is full system fact never assistant or tool',`[...document.querySelectorAll('.sys-delivery-note')].some(x=>x.textContent===${JSON.stringify(typedNote)})&&![...document.querySelectorAll('.msg-assistant')].some(x=>x.textContent.includes(${JSON.stringify(typedNote)}))&&document.querySelectorAll('.tool-call-record').length===10&&document.querySelectorAll('.tool-activity').length===0`);
 await check('all real tool names phases and genuine failed result remain',`(()=>{let records=[...document.querySelectorAll('.tool-call-record')],names=records.map(x=>x.querySelector('summary strong').textContent);return names.filter(x=>x==='read_file').length===4&&names.filter(x=>x==='run_shell').length===4&&names.includes('write_file')&&names.includes('submit_report')&&records.every(x=>x.querySelector('.tool-call-status').textContent.includes('调用发起'))&&records.some(x=>x.textContent.includes('v2-does-not-exist.md')&&x.querySelector('.tool-call-status').textContent.includes('执行失败'))})()`);
 await push('session:history',{...history,rows:[{kind:'assistant',text:'更早的真实历史记录'},...history.rows]});
 await check('history rebuild preserves system notes without promoting them into activities',`document.querySelectorAll('.tool-call-record').length===10&&document.querySelectorAll('.tool-activity').length===0&&[...document.querySelectorAll('.sys-delivery-note')].some(x=>x.textContent===${JSON.stringify(typedNote)})&&document.querySelector('.sys-unknown-tool-event').textContent.includes(${JSON.stringify(oldNote)})`);
 await push('session:events',[{...scope,event:{kind:'tool_call',summary:oldNote}}]);
 await check('unidentified identical progress events are not text-deduplicated or promoted to tools',`document.querySelectorAll('.sys-unknown-tool-event').length===2&&document.querySelectorAll('.tool-call-record').length===10&&document.querySelectorAll('.tool-activity').length===0`);
 for(const width of [1360,960]){win.setContentSize(width,860);await pause(100);fs.writeFileSync(path.join(OUT,'delivery-note-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
 await push('session:events',[{...scope,event:{kind:'tool_call',summary:'旧工具调用',detail:{name:'write_file',args:{path:'legacy.md'}}}}]);
 await check('known legacy live metadata remains an actual named tool',`document.querySelectorAll('.tool-activity').length===1&&document.querySelector('.tool-activity').textContent.includes('write_file')&&document.querySelector('.tool-activity').textContent.includes('legacy.md')`);
 await check('builtin identity stays data and accessible without duplicate third visible line',`(()=>{let e=document.querySelector('.tree-item.primary');return e.classList.contains('builtin')&&e.getAttribute('aria-description').includes('内置')&&e.getAttribute('aria-description').includes('主入口')&&!e.querySelector('.ti-badge')})()`);
 await check('long project path is single line ellipsis with full actual title',`(()=>{let e=document.getElementById('project-path'),c=getComputedStyle(e);return c.whiteSpace==='nowrap'&&c.textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth&&e.title===window.__ansRenderer.state.projectRoot&&e.getBoundingClientRect().height<=parseFloat(c.lineHeight)+1})()`);
 assert.equal(sends.length,0,'history and progress rendering must not prompt');
}
async function completeFlowChecks(){
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
  const payload=(event,roleId='A',runtime='pi')=>({projectRoot:ROOT,roleId,runtime,event:{...event,roleId,runtime}});
  const text=(value,flags={})=>({text:value,redacted:false,truncated:false,...flags});
  await check('fresh empty context never mistakes loader for history',`document.getElementById('context-state').textContent==='会话继续使用现有上下文'&&!document.getElementById('context-state').textContent.includes('历史')`);
  await push('session:role-state',{projectRoot:ROOT,roleId:'A',runtime:'pi',busy:false,summaries:[],queue:[],contextSource:'fresh'});
  await check('empty fresh session has no above-history warning',`document.getElementById('context-state').textContent==='新会话'&&!document.getElementById('chat').textContent.includes('以上为历史')`);
  const start={kind:'tool_call',turnId:'display-turn',summary:'安全开始',detail:{toolName:'run_shell',toolCallId:'display-call',phase:'start',display:{version:1,target:{kind:'command',value:text('node -v')},omissions:[]}}};
  const result={kind:'accepted',turnId:'display-turn',summary:'安全结果',detail:{toolName:'run_shell',toolCallId:'display-call',phase:'result',ok:false,display:{version:1,target:{kind:'command',value:text('node -v')},error:text('ENOENT 原始安全错误'),process:{exitCode:2,stdout:text('安全输出 [REDACTED]',{redacted:true}),stderr:text('安全stderr',{truncated:true})},resultText:text('结果预览'),durationMs:32,omissions:['budget']}}};
  await push('session:events',[payload(start),payload(result),payload(result)]);
  await check('A same call one accessible lifecycle with true target and nonzero exit completion',`document.querySelectorAll('#chat .tool-call-record').length===1&&document.querySelector('.tool-call-target').textContent==='node -v'&&document.querySelector('.tool-call-status').textContent.includes('已执行完成（退出码 2）')`);
  await js(`document.querySelector('.tool-call-record').open=true`);
  await check('A safe detail streams exit error and flags readable',`(()=>{const t=document.querySelector('.tool-call-details').textContent;return t.includes('ENOENT')&&t.includes('退出码：2')&&t.includes('安全输出')&&t.includes('已净化')&&t.includes('已截断')&&t.includes('32 ms');})()`);
  await push('session:events',[payload({...result,detail:{...result.detail,toolCallId:'display-other'}})]);
  await check('A different same-text actual call remains separate',`document.querySelectorAll('#chat .tool-call-record').length===2&&document.querySelector('.tool-call-record').open`);
  await push('session:events',[payload({...result,detail:{...result.detail,toolCallId:'unknown-display',display:{version:99},args:{command:'RAW_MUST_NOT_SHOW'}}})]);
  await js(`[...document.querySelectorAll('.tool-call-record')].at(-1).open=true`);
  await check('A unknown display never falls to raw args',`document.getElementById('chat').textContent.includes('不支持此详情版本')&&!document.getElementById('chat').textContent.includes('RAW_MUST_NOT_SHOW')`);
  fs.writeFileSync(path.join(OUT,'01-tool-detail.png'),(await win.webContents.capturePage()).toPNG());
  const snapshot={version:1,reportId:'report-one',source:{roleId:'A',runtime:'pi',turnId:'source-one'},taskId:null,origin:'submitted-report',status:'completed',summary:text('已完成的安全摘要'),evidence:[text('并非授权路径 /hidden.env')],evidenceOmitted:1,at:'2026-10-15T00:00:00Z'};
  flowReports['report-one']={state:'failed',reportId:'report-one',report:snapshot,code:'PERSIST_FAILED',retryAvailable:true};
  await push('session:events',[payload({kind:'handback',summary:'安全报告',report:snapshot,reportPersistence:flowReports['report-one']})]);await pause(60);
  await check('C source declared result not independent acceptance and failed save button',`document.querySelector('.msg-handback').textContent.includes('报告声明：已完成')&&document.querySelector('.msg-handback').textContent.includes('不等于独立验收')&&[...document.querySelectorAll('.msg-handback button')].some(x=>x.textContent==='重试保存报告')`);
  await js(`document.querySelector('.msg-handback').scrollIntoView({block:'center'})`);fs.writeFileSync(path.join(OUT,'02-source-report.png'),(await win.webContents.capturePage()).toPNG());
  const beforeDoc=docCalls.length,openCount=opens.length;await js(`document.querySelector('.msg-handback .report-source-button').scrollIntoView({block:'center'});document.querySelector('.msg-handback .report-source-button').click()`);await pause(30);
  await check('B source list requires explicit file pick without chat switch or opening model',`document.getElementById('drawer-title').textContent==='A · 来源文档'&&document.querySelectorAll('[data-doc-id]').length===2&&window.__ansRenderer.state.selectedRoleId==='A'&&window.__ansRenderer.state.runtime==='pi'`);assert.equal(docCalls.length,beforeDoc);assert.equal(opens.length,openCount);
  await js(`document.querySelector('[data-doc-id="doc-one"]').click()`);await pause(50);
  assert.deepEqual(docCalls.at(-1),{version:1,projectViewId:'epoch-one',documentId:'doc-one'});
  await check('B static markdown no scripts automatic image or unsafe link',`document.getElementById('document-read-text').textContent.includes('文档正文')&&!document.querySelector('#document-read-text script,#document-read-text img,#document-read-text iframe')&&!window.BAD_DOC&&![...document.querySelectorAll('#document-read-text a')].some(x=>x.getAttribute('href').startsWith('javascript:'))`);
  fs.writeFileSync(path.join(OUT,'03-document-read.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await check('B back list restores explicit file focus',`document.activeElement.dataset.docId==='doc-one'`);
  docMode='TOO_LARGE';await js(`document.querySelector('[data-doc-id="doc-two"]').click()`);await pause(40);
  await check('B actual too-large result remains explicit error not partial success',`document.getElementById('document-read-status').textContent.includes('256KiB')&&!document.getElementById('document-read-text').textContent`);
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);docMode='deferred';await js(`document.querySelector('[data-doc-id="doc-one"]').click();document.getElementById('drawer-close').click()`);
  docPending[0]({ok:true,version:1,projectViewId:'epoch-one',documentId:'doc-one',roleId:'A',relativePath:'one.md',format:'text',text:'LATE_DOCUMENT',byteLength:13});await pause(30);docMode='success';
  await check('B close invalidates late document and returns actual report invoker',`window.__ansRenderer.state.rightTab===null&&!document.getElementById('right-body').textContent.includes('LATE_DOCUMENT')&&document.activeElement.textContent==='查看来源角色文档'`);
  saveModeDeferred=true;const savesBefore=persistenceCalls.filter(x=>x.operation==='report-save').length,sendsBefore=sends.length;
  await js(`[...document.querySelectorAll('.msg-handback button')].find(x=>x.textContent==='重试保存报告').click()`);await pause(30);
  await js(`document.querySelector('.msg-handback .persistence-state button').click()`);await pause(30);
  assert.equal(persistenceCalls.filter(x=>x.operation==='report-save').length,savesBefore+1);
  const originalCard=await js(`(()=>{window.__flowReportCard=document.querySelector('.msg-handback');return !!window.__flowReportCard;})()`);assert.equal(originalCard,true);
  await push('report-persistence-updated',{version:1,scope:{projectRoot:ROOT,roleId:'A',runtime:'pi'},change:{kind:'report-save',scope:{roleId:'A',runtime:'pi'},reportId:'report-one',state:{state:'saved',reportId:'report-one',retryAvailable:false}}});
  flowSavePending[0].resolve(outer(flowSavePending[0].input,{ok:true,state:'saved',report:snapshot,retryAvailable:false}));await pause(40);saveModeDeferred=false;
  await check('C source same card once save success with promise event race',`document.querySelector('.msg-handback')===window.__flowReportCard&&document.querySelector('.msg-handback .persistence-message').textContent==='报告已保存'&&![...document.querySelectorAll('.msg-handback button')].some(x=>x.textContent==='重试保存报告')`);assert.equal(sends.length,sendsBefore);
  const receipt={version:1,deliveryId:'delivery-one',attemptId:'attempt-one',turnId:'target-one',inputSaved:true,providerMayHaveStarted:true,history:'failed',outcome:'completed',retryHistoryAvailable:true,retryDeliveryAllowed:false};flowReceipts['attempt-one']=receipt;
  const input={source:'prompt-input',text:'安全交接 [REDACTED]',inputProvenance:{version:1,kind:'handback',deliveryId:'delivery-one',attemptId:'attempt-one',target:{roleId:'A',runtime:'pi'},reports:[snapshot]},inputTextProjection:{version:1,source:'trusted-handback-display',modelInputRecorded:false,redacted:true,truncated:true,summaryTruncated:true}};
  await push('session:events',[payload({kind:'message',turnId:'target-one',summary:'安全摘要',detail:input})]);await pause(60);
  await check('C target safe display copy flags not complete model input',`document.querySelector('.safe-input-copy summary').textContent==='交接内容（安全显示副本）'&&document.querySelector('.safe-input-copy').textContent.includes('此处未记录完整模型输入')&&document.querySelector('.safe-input-copy').textContent.includes('已净化')&&document.querySelector('.safe-input-copy').textContent.includes('显示副本已截断')`);
  const targetSends=sends.length,targetOpens=opens.length;await js(`[...document.querySelectorAll('.msg-delivery button')].find(x=>x.textContent==='重试保存历史').click()`);await pause(40);
  await check('C target only save updates same original card no re-prompt',`document.querySelectorAll('.msg-delivery').length===1&&document.querySelector('.msg-delivery .delivery-batch-facts .persistence-message').textContent==='已保存'`);assert.equal(sends.length,targetSends);assert.equal(opens.length,targetOpens);
  const snap2={...snapshot,reportId:'report-expired',source:{...snapshot.source,turnId:'source-expired'}};flowReports['report-expired']={state:'failed',reportId:'report-expired',report:snap2,retryAvailable:true};await push('session:events',[payload({kind:'handback',report:snap2,reportPersistence:flowReports['report-expired'],summary:'安全待保存'})]);await pause(40);
  await push('report-persistence-updated',{version:1,scope:{projectRoot:ROOT,roleId:'A',runtime:'pi'},change:{kind:'report-save',scope:{roleId:'A',runtime:'pi'},reportId:'report-expired',state:{state:'expired',reportId:'report-expired',retryAvailable:false,code:'SNAPSHOT_EXPIRED'}}});
  await check('C expired original report removes unsafe retry',`[...document.querySelectorAll('.msg-handback')].at(-1).textContent.includes('已失效')&&![...document.querySelectorAll('.msg-handback')].at(-1).textContent.includes('重试保存报告')`);
  await js(`document.getElementById('inp-message').value='保留非空草稿';document.getElementById('tab-pi').click()`);await pause(30);await js(`document.getElementById('pi-save').click()`);await pause(60);await key('Escape');
  await check('P6 config save retains existing conversation draft',`document.getElementById('inp-message').value==='保留非空草稿'&&window.__ansRenderer.state.sessionOpenRoleId==='A'`);
  configMissing.claude=['ANTHROPIC_API_KEY'];await js(`await window.__ansRenderer.selectRuntime('claude')`);await pause(50);await js(`document.getElementById('runtime-config-settings').focus()`);await key('Enter');await key('Escape');
  await check('P6 missing setting closes back to actual notice invoker',`document.activeElement.id==='runtime-config-settings'`);
  await js(`await window.__ansRenderer.selectRuntime('pi')`);await push('session:operator-request',{projectRoot:ROOT,roleId:'A',runtime:'pi',id:'flow-choice',request:{kind:'choice',title:'选择查看方式',options:[{id:'one',label:'摘要'},{id:'two',label:'完整'}]}});
  await js(`document.getElementById('tab-work').click()`);
  await check('P7 choice pending separated from empty queue',`document.getElementById('right-body').textContent.includes('待选择')&&document.getElementById('right-body').textContent.includes('无进行中或排队消息')&&document.getElementById('role-tree').textContent.includes('待选择')`);
  await js(`document.querySelector('.pending-locate').click()`);
    await check('P7 locate uses original request no default decision',`window.__ansRenderer.state.rightTab===null&&document.activeElement.dataset.requestId==='flow-choice'&&![...document.querySelectorAll('[data-request-id="flow-choice"] input[type=radio]')].some(x=>x.checked)&&document.querySelector('[data-request-id="flow-choice"] .op-submit').disabled`);
  const sourceBefore=await js(`document.querySelectorAll('.msg-handback').length`);
  await push('session:events',[payload({kind:'handback',report:{...snapshot,reportId:'wrong-scope',source:{roleId:'B',runtime:'pi',turnId:'wrong'}},reportPersistence:{state:'saved',retryAvailable:false}})]);
  await check('C source report mismatched role is not promoted',`document.querySelectorAll('.msg-handback').length===${sourceBefore}`);
  const fallback={...snapshot,reportId:'fallback-report',origin:'terminal-fallback',status:'aborted',source:{...snapshot.source,turnId:'fallback-turn'}};flowReports[fallback.reportId]={state:'saved',reportId:fallback.reportId,report:fallback,retryAvailable:false};
  await push('session:events',[payload({kind:'handback',report:fallback,reportPersistence:flowReports[fallback.reportId],summary:'安全兜底'})]);await pause(40);
  await check('C fallback abort is system outcome not submitted success',`[...document.querySelectorAll('.msg-handback')].at(-1).textContent.includes('系统按终态记录：已中止')`);
  const live=safeReport({roleId:'A',turnId:'live-only',status:'completed',summary:'仅本次安全报告'});const beforeLiveQueries=persistenceCalls.length;
  await push('session:events',[payload({kind:'handback',liveReport:live,reportPersistence:{state:'disabled',retryAvailable:false},summary:'安全live'})]);await pause(30);
  await check('C disabled live report remains visible without fake persisted ID',`[...document.querySelectorAll('.msg-handback')].at(-1).textContent.includes('仅本次会话可见')&&![...document.querySelectorAll('.msg-handback')].at(-1).textContent.includes('重试保存')`);assert.equal(persistenceCalls.length,beforeLiveQueries);
  const failed={...snapshot,reportId:'outer-success-inner-fail',source:{...snapshot.source,turnId:'failure-inner'}};flowReports[failed.reportId]={state:'failed',reportId:failed.reportId,report:failed,retryAvailable:true};await push('session:events',[payload({kind:'handback',report:failed,reportPersistence:flowReports[failed.reportId],summary:'安全待存'})]);await pause(40);
  flowSaveFailure='CONFLICT';await js(`[...document.querySelectorAll('.msg-handback')].at(-1).querySelector('.persistence-state button').click()`);await pause(40);flowSaveFailure=null;
  await check('C outer ok inner failed never announced saved',`[...document.querySelectorAll('.msg-handback')].at(-1).querySelector('.persistence-message').textContent.includes('冲突')&&![...document.querySelectorAll('.msg-handback')].at(-1).querySelector('.persistence-state button')`);
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[],reportErrors:[{reportId:'unreadable-report',code:'INVALID'}]});
  await check('C unreadable report record is explicit without new outcome card',`document.getElementById('history-projection-note').textContent.includes('报告记录')&&document.getElementById('history-projection-note').textContent.includes('不可读')&&!document.getElementById('chat').textContent.includes('unreadable-report')`);
  const openBeforeQueries=opens.length,sendBeforeQueries=sends.length,saveCount=persistenceCalls.filter(x=>x.operation==='report-save'||x.operation==='history-save').length;
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[],reports:[snapshot,fallback],projection:{omittedEntries:12,invalidEntries:2,truncated:true},skipped:3});await pause(40);
  await check('A4 history omission invalid and parser counts are separate',`document.getElementById('history-projection-note').textContent.includes('省略前 12')&&document.getElementById('history-projection-note').textContent.includes('无效投影条目 2')&&document.getElementById('history-projection-note').textContent.includes('原解析跳过 3')`);assert.equal(opens.length,openBeforeQueries);assert.equal(sends.length,sendBeforeQueries);assert.equal(persistenceCalls.filter(x=>x.operation==='report-save'||x.operation==='history-save').length,saveCount);
  const targetReport={...snapshot,reportId:'source-b-report',source:{roleId:'B',runtime:'pi',turnId:'b-source'}};
  const otherInput={...input,inputProvenance:{...input.inputProvenance,attemptId:'attempt-two',deliveryId:'delivery-two',reports:[targetReport]}};flowReceipts['attempt-two']={...receipt,attemptId:'attempt-two',deliveryId:'delivery-two'};
  await push('session:events',[payload({kind:'message',turnId:'target-two',summary:'安全目标',detail:otherInput})]);await pause(40);const beforeB=opens.length;
  await js(`[...document.querySelectorAll('.msg-delivery')].at(-1).querySelector('.delivery-report button').click()`);await pause(30);
  await check('P3 source B documents browsing never changes chatting A or engine',`document.getElementById('drawer-title').textContent==='B · 来源文档'&&window.__ansRenderer.state.selectedRoleId==='A'&&window.__ansRenderer.state.runtime==='pi'&&document.querySelectorAll('[data-doc-id]').length===2`);assert.equal(opens.length,beforeB);
  for(const code of ['PROJECT_NOT_GRANTED','STALE_SCOPE','NOT_LISTED','SYMLINK_NOT_ALLOWED','INVALID_UTF8','BINARY_CONTENT','PERMISSION_DENIED','UNSUPPORTED_ENVIRONMENT']){
    docMode=code;await js(`document.querySelector('[data-doc-id]').click()`);await pause(20);await check('B structured '+code+' error not hidden',`document.getElementById('document-read-status').textContent.length>0&&!document.getElementById('document-read-text').textContent`);await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  }docMode='success';await js(`document.getElementById('drawer-close').click()`);
  await push('delivery-history-updated',{version:1,scope:{projectRoot:ROOT,roleId:'A',runtime:'pi'},change:{kind:'delivery-history-save',scope:{roleId:'A',runtime:'pi'},attemptId:'attempt-two',state:'expired',receipt:flowReceipts['attempt-two'],retryAvailable:false,code:'SNAPSHOT_EXPIRED'}});
  await check('C expired material cannot keep old receipt retry enabled',`[...document.querySelectorAll('.msg-delivery')].at(-1).querySelector('.persistence-message').textContent.includes('已失效')&&![...document.querySelectorAll('.msg-delivery')].at(-1).querySelector('.persistence-state button')`);
  const legacyRow={kind:'denied',text:'旧文本分类：shell exit 7',at:'',activity:{toolName:'run_shell',phase:'result',status:'failed',toolCallId:'native-only-call',target:''},textProjection:text('旧文本分类：shell exit 7'),legacyStatusSource:'legacy-classifier',metadataOmissions:['timestamp','anchor-token','oversize-identity']};
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[legacyRow]});
  await js(`[...document.querySelectorAll('#chat .sys-denied')].at(-1).open=true`);await pause(30);
  await check('A4 actual legacy status and omissions shown without invented exit or identity',`(()=>{const t=[...document.querySelectorAll('#chat .sys-denied')].at(-1).textContent;return t.includes('旧文本分类')&&t.includes('不是新机器执行事实')&&t.includes('原时间未保存')&&t.includes('原定位标记未提供')&&t.includes('原调用身份超出展示预算')&&!t.includes('退出码：7');})()`);
  flowLongRoleDocs=true;await js(`await window.__ansRenderer.refreshProject();document.getElementById('tab-card').click();['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true);document.getElementById('right-body').scrollTop=document.getElementById('right-body').scrollHeight`);await pause(30);
  const roleReadScroll=await js(`document.getElementById('right-body').scrollTop`);assert.ok(roleReadScroll>100,'role reading fixture must really scroll');
  await js(`[...document.querySelectorAll('#right-body button')].find(x=>x.textContent==='查看已列文档').click()`);await pause(20);await js(`document.querySelector('[data-doc-action="back-role"]').click()`);await pause(20);
  await check('P3 role documents back restores role reading and expanded section',`document.querySelector('details[data-section="card"]').open&&Math.abs(document.getElementById('right-body').scrollTop-${roleReadScroll})<2`);
  await js(`document.getElementById('drawer-close').click()`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(50);await check('complete flow layout fits '+width,`document.body.scrollWidth===innerWidth`);fs.writeFileSync(path.join(OUT,'complete-flow-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  reports.push({name:'read/save/query actual controlled operations',docCalls,persistenceCalls,modelSends:sends.length});
}
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
    // v3/S1（2026-10-16 客户批准）：同一 toolCallId 的「调用发起+结果」合并为**一行**——工具名在聊天流恰出现
    // 一次（原断言：活动组工具=两行 2 次、屏障/生命周期工具=一行 1 次；现状统一为合并行 1 次，两相位标签保留在内）。
    // 折叠口径（2026-10-16 客户批准）修订：并入工具组者的**折叠行文案带工具分解**——名称文本出现
    // 1（合并行）+1（组摘要分解）=2，「恰一行」的意图改为**按行断言**（.tool-activity 恰 1 行含该名 +
    // 摘要含该名——比纯文本计数更强）；生命周期/屏障类工具（不并入工具组）照旧恰 1 次（无组摘要分解）。
    const foldTool=['read_file','write_file','edit_file','run_shell'].includes(name);
    await check('one canonical lifecycle '+name, foldTool
      ? `(()=>{const text=document.getElementById('chat').textContent;return (text.match(/${name}/g)||[]).length===2&&[...document.querySelectorAll('#chat .tool-activity')].filter(x=>x.textContent.includes('${name}')).length===1&&document.querySelector('#chat .tool-records summary').textContent.includes('${name}');})()`
      : `(()=>{const text=document.getElementById('chat').textContent;return (text.match(/${name}/g)||[]).length===1;})()`);
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
  // v3/S1（2026-10-16 客户批准「按推荐批准，开始实施」）：同一调用两相位合并为**一行**（原断言 = 两行
  // 「共享相位身份」；现状=合并行同时含「调用发起」「执行完成」——相位身份仍逐条保留在合并行内）。
  await check('normal tools live history share phase identities',`(()=>{const rows=[...document.querySelectorAll('#chat .tool-activity')];return rows.length===1&&rows[0].textContent.includes('调用发起')&&rows[0].textContent.includes('执行完成');})()`);
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
  listing.roles=[];listing.hasRoles=false;listing.primaryRoleId=null;configMissing.claude=['ANTHROPIC_API_KEY'];configMissing.pi=['ANTHROPIC_AUTH_TOKEN','ANS_PI_MODEL'];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await check('empty folder enables custom selector with Claude default',`!${trigger}.disabled&&${trigger}.getAttribute('aria-disabled')==='false'&&window.__ansRenderer.state.runtime==='claude'&&${trigger}.value==='claude'&&${trigger}.querySelector('.engine-value').textContent==='Claude'&&${trigger}.getAttribute('aria-label')==='会话引擎，当前 Claude'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='false'&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='true'`);
  fs.writeFileSync(path.join(OUT,'initial-engine-claude.png'),(await win.webContents.capturePage()).toPNG());
  await js(`${trigger}.focus()`);await key('Enter');await key('Home');
  await check('Home browses first Pi without commit',`window.__ansRenderer.state.runtime==='claude'&&${trigger}.getAttribute('aria-activedescendant')==='runtime-option-pi'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='false'&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='true'&&${trigger}.value==='claude'`);
  const before=configReads.length;await key('Space');await pause(70);
  await check('Space commits Pi once with live missing entry',`window.__ansRenderer.state.runtime==='pi'&&${trigger}.value==='pi'&&${menu}.hidden&&${trigger}.getAttribute('aria-label')==='会话引擎，当前 Pi'&&document.getElementById('runtime-config-settings').textContent==='打开 Pi 设置'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='true'`);assert.equal(configReads.length,before+1);
  const same=configReads.length;await key('Enter');await key('Enter');await pause(40);
  await check('current Enter only closes',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'`);assert.equal(configReads.length,same);
  await key('Home');await key('ArrowUp');
  await check('Home opens first and stops at top',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-pi'`);
  await key('Escape');
  await check('Escape cancels and retains trigger focus',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'&&document.activeElement===${trigger}`);
  await key('ArrowDown');
  await check('closed arrow opens current selected',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-pi'&&window.__ansRenderer.state.runtime==='pi'`);
  await key('End');
  await check('End browses last Claude and stops at bottom without commit',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-claude'&&window.__ansRenderer.state.runtime==='pi'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='true'`);
  await key('Home');await key('Tab');
  await check('Tab cancels naturally to accepted work overview without committing',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'&&document.activeElement.id==='tab-work'`);
  await key('Tab');await key('Tab');await check('missing settings remains naturally keyboard reachable after work and role actions',`document.activeElement.id==='runtime-config-settings'`);
  await js(`${trigger}.focus()`);await key('Enter');await key('Home');
  await key('Tab',['shift']);
  await check('ShiftTab cancellation leaves natural previous target',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'&&document.activeElement.id==='tab-pi'`);
  await js(`${trigger}.focus();${trigger}.click()`);await key('Home');
  await js(`document.getElementById('runtime-config-settings').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.getElementById('runtime-config-settings').focus()`);
  await check('outside pointer cancels without focus stealing',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'&&document.activeElement.id==='runtime-config-settings'`);
  await js(`${trigger}.focus();${trigger}.click();window.dispatchEvent(new Event('blur'))`);
  await check('window blur closes without commit',`${menu}.hidden&&window.__ansRenderer.state.runtime==='pi'`);
  await js(`${trigger}.click();document.getElementById('runtime-option-codex').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
  await check('hover moves temporary only and keeps selected check',`${trigger}.getAttribute('aria-activedescendant')==='runtime-option-codex'&&document.getElementById('runtime-option-pi').getAttribute('aria-selected')==='true'`);
  const mouseBefore=configReads.length;await js(`document.getElementById('runtime-option-codex').click()`);await pause(60);
  await check('option click commits Codex once',`window.__ansRenderer.state.runtime==='codex'&&${trigger}.value==='codex'&&${menu}.hidden`);assert.equal(configReads.length,mouseBefore+1);
  const currentClick=configReads.length;await js(`${trigger}.click();document.getElementById('runtime-option-codex').click()`);await pause(30);assert.equal(configReads.length,currentClick);
  await check('current click no business reread',`${menu}.hidden`);
  await js(`await window.__ansRenderer.selectRuntime('claude')`);await pause(60);
  await check('programmatic runtime sync selected and label',`${trigger}.textContent.includes('Claude')&&document.getElementById('runtime-option-claude').getAttribute('aria-selected')==='true'`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(60);await js(`${trigger}.focus();${trigger}.click()`);await key('ArrowUp');await check('selector dimensions and viewport '+width,`(()=>{const t=${trigger}.getBoundingClientRect(),m=${menu}.getBoundingClientRect();return t.width===104&&t.height===32&&m.width===208&&Math.abs(m.right-t.right)<1&&m.left>=8&&m.right<=innerWidth-8&&m.bottom<=innerHeight-8&&document.body.scrollWidth===innerWidth;})()`);fs.writeFileSync(path.join(OUT,'selector-'+width+'-open.png'),(await win.webContents.capturePage()).toPNG());await key('Escape');}
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
  await check('programmatic no-project guard',`window.__ansRenderer.state.runtime==='claude'`);
  pickResult=null;await js(`document.getElementById('btn-import').click()`);await pause(60);
  await check('cancel initial import remains disabled',`document.getElementById('runtime-select').disabled`);
  pickResult=ROOT;listFailure=true;await js(`document.getElementById('btn-import').click()`);await pause(60);
  await check('failed initial import remains disabled',`document.getElementById('runtime-select').disabled`);
  listFailure=false;listing.roles=[];listing.hasRoles=false;listing.primaryRoleId=null;
  configMissing.pi=['ANTHROPIC_AUTH_TOKEN','ANS_PI_MODEL'];configMissing.claude=['ANTHROPIC_API_KEY'];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(60);
  await check('empty imported folder enables and checks Claude without role',`!document.getElementById('runtime-select').disabled&&!${notice}.hidden&&${msg}.textContent.includes('ANTHROPIC_API_KEY')&&window.__ansRenderer.state.selectedRoleId===null`);
  configMissing.codex=['CODEX_API_KEY','ANS_CODEX_MODEL'];
  await js(`await window.__ansRenderer.selectRuntime('pi')`);await pause(40);
  await check('empty imported folder switch checks Pi live',`${msg}.textContent.includes('ANS_PI_MODEL')&&${button}.textContent==='打开 Pi 设置'`);
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
  await check('runtime groups lead first and unknown metadata escaped',`(()=>{let e=document.getElementById('role-tree'),labels=[...e.querySelectorAll('.tree-group')].map(x=>x.textContent),lead=e.querySelector('.tree-group:nth-child(3)');return labels.includes('运行时接入组')&&labels.includes('项目协调组')&&labels.includes('工作角色')&&[...e.querySelectorAll('.ti-name')].indexOf([...e.querySelectorAll('.ti-name')].find(x=>x.textContent==='运行时核心'))<[...e.querySelectorAll('.ti-name')].indexOf([...e.querySelectorAll('.ti-name')].find(x=>x.textContent==='Pi适配器'))&&!e.querySelector('script,img')&&!window.INJECTED;})()`);
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
  await check('failed native restore honest rebuilding notice',`document.getElementById('context-state').title.includes('已重建上下文')&&document.getElementById('context-state').textContent.includes('恢复失败')&&!document.getElementById('context-state').textContent.includes('已从本地恢复')`);
  await push('shell:confirm-request',payload('pi',{id:'sc-runtime-old',command:'echo literal',summary:null,reasonPlain:'离线确认',cwd:ROOT,argvLines:[]}));
  await check('foreign runtime shell caches without showing in current engine',`document.getElementById('shell-confirm').hidden`);
  await push('session:operator-expired',payload('pi',{id:'sc-runtime-old',reason:'原shell轮次已中止'}));
  await push('session:operator-expired',payload('pi',{id:'pi-old-confirm',reason:'原轮次已中止'}));
  const responseCount=responses.length;
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await check('Pi own history background queue draft and expired card restored',`document.getElementById('chat').textContent.includes('Pi专属历史')&&document.getElementById('chat').textContent.includes('后台Pi消息')&&document.getElementById('chat').textContent.includes('Pi后台队列')&&document.getElementById('inp-message').value==='Pi草稿'&&document.querySelector('[data-request-id="pi-old-confirm"] .op-confirm').hidden&&document.querySelector('[data-request-id="pi-old-confirm"] .op-note').textContent.includes('原轮次已中止')`);
  // C2 重锚（PM §15.6：测试提出口径、PM 批准；文件桌面UI 落）：失效 shell 卡按 2026-10-18
  // 批准的「收起 + 原因可见/可追溯」语义——卡收起，原因留在 composer-hint（不保留旧的
  // 「shown disabled」冲突期望）。
  await check('expired old shell collapses with reason visible in its own runtime',`document.getElementById('shell-confirm').hidden&&document.getElementById('composer-hint').textContent.includes('原shell轮次已中止')`);
  // C2 重锚的配套断言：卡已收起 ⇒ 不暴露任何可点的放行/关闭动作；Esc 也不产生回包。
  const shellCount=shellResponses.length;await check('expired shell exposes no authorize action after collapse',`document.getElementById('shell-confirm').hidden&&!document.getElementById('sc-allow')&&!document.getElementById('sc-close')`);await key('Escape');await pause(30);assert.equal(shellResponses.length,shellCount,'expired shell cannot authorize and dismissal sends no response');
  await js(`document.querySelector('[data-request-id="pi-old-confirm"] .op-confirm').click()`);await pause(40);
  assert.equal(responses.length,responseCount,'late yes cannot respond after expiry');
  for(const [width,height] of [[1360,860],[960,620]]) {win.setContentSize(width,height);await pause(120);fs.writeFileSync(path.join(OUT,'runtime-groups-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  assert.ok(opens.some(x=>x.runtime==='pi')&&opens.some(x=>x.runtime==='codex')&&opens.some(x=>x.runtime==='claude'),'three real choices reach bridge');
  for(const runtime of ['pi','codex','claude'])assert.ok(histories.some(x=>x.projectRoot===ROOT&&x.roleId===roleId&&x.runtime===runtime),'history exact '+runtime);
  reports.push({name:'runtime bridge targets',opens:opens.slice(-8),histories:histories.slice(-8),aborts:aborts.slice(-1),configSaves});
}
async function mirrorChecks() {
  // W6-C（PM §15.2 五角色重锚）：五角色左树、Liaison 空态、决定卡镜像（同一请求 id 两侧呈现、
  // 只答一次）、排队聚合。离线受控夹具；不启用模型/网络/凭据。
  const saved={roles:listing.roles,primary:listing.primaryRoleId,model:listing.governanceModel,record:listing.governanceRecord,warnings:listing.warnings};
  const govRole=(roleId,fn)=>({roleId,cardText:'# '+roleId,cardPath:'',boundary:{entries:[]},boundaryPath:'',builtIn:true,governanceFunction:fn,changelog:null,docs:[]});
  listing.roles=[govRole('liaison','liaison'),govRole('rapporteur','proposal'),govRole('nominator','nomination'),govRole('convener','schedule'),govRole('verifier','verification'),{roleId:'A',cardText:'# A',cardPath:'',boundary:{entries:[]},changelog:null,docs:[]}];
  listing.primaryRoleId='liaison';listing.governanceModel='trio';listing.governanceRecord={state:'present'};listing.warnings=[];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi')`);
  await check('W6-C five-role tree: Liaison primary; governance display names 提案/组队/统筹/验收', `(()=>{const t=document.getElementById('role-tree');const groups=[...t.querySelectorAll('.tree-group')].map(x=>x.textContent);const names=[...t.querySelectorAll('.ti-name')].map(x=>x.textContent);const primary=t.querySelector('.tree-item.primary[data-role-id="liaison"]');const gov=[...t.querySelectorAll('.tree-item.builtin:not(.primary)[data-role-id]')].map(x=>x.dataset.roleId);return groups.includes('主入口')&&groups.includes('治理职能（内置）')&&!!primary&&primary.querySelector('.ti-name').textContent==='主理'&&primary.querySelector('.ti-power').textContent==='客户沟通 · 不拥有最终批准权'&&primary.querySelector('.ti-builtin').textContent==='内置角色：随应用发布，无角色目录'&&gov.join(',')==='rapporteur,nominator,convener,verifier'&&names.includes('提案')&&names.includes('组队')&&names.includes('统筹')&&names.includes('验收')&&!t.textContent.includes('角色卡/liaison/');})()`);
  await check('W6-C status line shows 三权 · 五角色', `document.getElementById('governance-status').textContent.includes('治理模型：三权 · 五角色')`);
  await check('W6-C Liaison empty state explains customer entrance without self CTA', `(()=>{const e=document.querySelector('#chat .chat-empty');return !!e&&e.textContent.includes('客户默认入口')&&e.textContent.includes('提案角色形成提案')&&e.textContent.includes('我不写提案、不批准')&&!e.querySelector('#btn-start-primary');})()`);
  await js(`await window.__ansRenderer.selectRole('liaison')`);await pause(80);
  const request={id:'mirror-1',roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',mirrorRoleId:'liaison',anchorKey:'mirror-anchor',request:{kind:'confirm',title:'镜像提案决定',cardKind:'proposal',flowId:'flow-mirror',summary:'提案 v1'}};
  const before=responses.length;
  await push('session:operator-request',request);
  await check('W6-C mirror card rendered in Liaison with badge/source label and same request id', `(()=>{const c=document.querySelector('#chat .chat-pane[data-role-id="liaison"] [data-request-id="mirror-1"]');return !!c&&c.classList.contains('is-mirror')&&c.dataset.surfaceRoleId==='liaison'&&c.querySelector('.op-mirror-badge').textContent==='镜像 · 主入口'&&c.querySelector('.op-mirror-source').textContent==='来自 提案 的治理决定 · 客户最终批准'&&c.querySelector('.op-title').textContent==='镜像提案决定'&&c.querySelectorAll('.op-actions button').length===2;})()`);
  await js(`document.querySelector('#chat .chat-pane[data-role-id="liaison"] [data-request-id="mirror-1"] .op-confirm').click()`);await pause(110);
  assert.equal(responses.length,before+1,'mirror answer responds once');
  await check('W6-C answering mirror freezes the mirror face', `(()=>{const m=document.querySelector('#chat .chat-pane[data-role-id="liaison"] [data-request-id="mirror-1"]');return [...m.querySelectorAll('.op-actions button')].every(b=>b.disabled&&b.hidden)&&m.querySelector('.op-note').textContent==='已确认。';})()`);
  await js(`await window.__ansRenderer.selectRole('rapporteur')`);await pause(80);
  await check('W6-C source face kept and also frozen; no mirror label there', `(()=>{const s=document.querySelector('#chat .chat-pane[data-role-id="rapporteur"] [data-request-id="mirror-1"]');return !!s&&!s.classList.contains('is-mirror')&&s.dataset.surfaceRoleId==='rapporteur'&&[...s.querySelectorAll('.op-actions button')].every(b=>b.disabled&&b.hidden)&&s.querySelector('.op-note').textContent==='已确认。'&&!s.querySelector('.op-mirror-source');})()`);
  const afterFirst=responses.length;await js(`document.querySelector('#chat .chat-pane[data-role-id="rapporteur"] [data-request-id="mirror-1"] .op-confirm').click()`);await pause(50);assert.equal(responses.length,afterFirst,'second face cannot answer again');
  await js(`await window.__ansRenderer.selectRole('liaison')`);await pause(60);
  await push('session:operator-queued',{id:'mirror-q1',roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',mirrorRoleId:'liaison',waitingFor:'mirror-1',request:{kind:'confirm',title:'排队提案一',cardKind:'proposal'}});
  await push('session:operator-queued',{id:'mirror-q2',roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',mirrorRoleId:'liaison',waitingFor:'mirror-1',request:{kind:'confirm',title:'排队提案二',cardKind:'proposal'}});
  await check('W6-C queued aggregate on primary; no operable queued card on either side', `(()=>{const pane=document.querySelector('#chat .chat-pane[data-role-id="liaison"]');const a=pane.querySelector('.op-queue-aggregate');return !!a&&a.textContent.includes('还有 2 个决定等待前一个决定')&&!document.querySelector('[data-request-id="mirror-q1"]')&&!document.querySelector('[data-request-id="mirror-q2"]');})()`);
  await push('session:operator-request',{...request,id:'mirror-q1',anchorKey:'mirror-anchor-q1',request:{kind:'confirm',title:'排队提案一',cardKind:'proposal',flowId:'flow-q1'}});
  await check('W6-C presented queue removes one aggregate and mirrors on both faces', `(()=>{const pane=document.querySelector('#chat .chat-pane[data-role-id="liaison"]');const a=pane.querySelector('.op-queue-aggregate');const m=pane.querySelector('[data-request-id="mirror-q1"]');return (!a||a.textContent.includes('还有 1 个决定等待前一个决定'))&&!!m&&m.classList.contains('is-mirror');})()`);
  await push('session:operator-expired',{id:'mirror-q2',roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',reason:'离线清理'});
  listing.roles=saved.roles;listing.primaryRoleId=saved.primary;listing.governanceModel=saved.model;listing.governanceRecord=saved.record;listing.warnings=saved.warnings;
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi')`);
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
  await push('session:events',[live('pi','A','current','tool_call','read_file',{detail:{toolName:'read_file',toolCallId:'current-call',args:{path:'current.md'}}}),live('pi','A','current','denied','current rejection',{detail:{toolName:'read_file',toolCallId:'current-call',ok:false}}),live('pi','A','current','message','current answer'),live('pi','A','current','settled','current settled'),payload('pi','A',{event:{kind:'handback',summary:'handback',liveReport:safeReport({roleId:'A',turnId:'current',status:'unreported',summary:'current report remains',evidence:[],at:''})}})]);
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
  await check('full rebuild retains unpersisted live report settled and original pending card',`document.getElementById('chat').textContent.includes('not stored yet')&&document.getElementById('chat').textContent.includes('inserted past history')&&(()=>{const c=document.querySelector('[data-request-id="merge-confirm"]');return !!c&&c.dataset.state==='open'&&!c.querySelector('.op-confirm').hidden;})()&&[...document.querySelectorAll('#chat .sys-settled')].filter(x=>x.textContent.trim()==='current settled').length===1&&document.querySelectorAll('#chat .msg-handback').length===1`);
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
  await check('repeated known-turn full rebuild keeps original unanchored pending card without borrowed token',`(()=>{const c=document.querySelector('[data-request-id="merge-confirm"]');return !!c&&c.dataset.state==='open'&&!c.querySelector('.op-confirm').hidden;})()`);
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
  await check('legacy decided full replay reuses original card between actual request and conclusion',`(()=>{let a=window.__ansRenderer.replayAnchorDebug('B').find(x=>x.anchorKey===${JSON.stringify('legacy-anchor-v1:511466706a245bf7206fd2e8526b54b52d58bd1454ffcb6969b3b3716afb5440')}),m=window.__ansRenderer.rowModelDebug('B'),card=document.querySelector('[data-request-id="legacy-decided"]'),op=m.operators.find(x=>x.requestId==='legacy-decided');return !!a&&!!card&&card.dataset.state==='decided'&&op.index===a.requestIndex+1&&op.index<a.conclusionIndex&&card.querySelector('.op-confirm').hidden&&card.querySelector('.op-note').textContent.includes('不同意');})()`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await history('pi','B',[{kind:'assistant',text:'background legacy prefix',at:''},{kind:'assistant',text:'legacy prefix',at:''},...anchored]);
  await js(`await window.__ansRenderer.selectRole('B')`);
  await check('background legacy rebuild keeps exact decided DOM and shifted anchor indices',`(()=>{let a=window.__ansRenderer.replayAnchorDebug('B').find(x=>x.anchorKey===${JSON.stringify('legacy-anchor-v1:511466706a245bf7206fd2e8526b54b52d58bd1454ffcb6969b3b3716afb5440')}),m=window.__ansRenderer.rowModelDebug('B'),op=m.operators.find(x=>x.requestId==='legacy-decided');return (()=>{const c=document.querySelector('[data-request-id="legacy-decided"]');return !!c&&c.dataset.state==='decided'&&op.index===a.requestIndex+1&&a.conclusionIndex===op.index+1&&m.operators.length===1;})();})()`);

  const legacy=[{kind:'assistant',text:'legacy identical',at:'1'},{kind:'assistant',text:'legacy identical',at:'2'}];
  await history('pi','B',legacy);await history('pi','B',legacy);
  await check('unknown legacy no false text-set dedup and old replay stays idempotent',`[...document.querySelectorAll('#chat .msg-assistant')].filter(x=>x.textContent.trim()==='legacy identical').length===2`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  for(const width of [1360,960]){win.setContentSize(width,width===960?620:860);await pause(80);fs.writeFileSync(path.join(OUT,'merge-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
}
// ————— G-2/U1（2026-10-16 客户批准；设计 2026-10-16_design_role-watchdog-and-closure）：恢复确认卡 + `[系统]` 消息行 —————
// ① `[系统·<子类>]` 投递输入（看护告警/收束提示）在聊天流呈**单独样式**（来源=系统——绝不与客户气泡同款），
//    实时与回放同解（同一分类器单一来源）。② 恢复确认卡：动作/目标角色/证据**逐字**、取消为默认焦点、
//    Esc=不执行；回包通道按 W5 落树前缺席 ⇒ 如实终态「未能回传……不执行」（绝不呈现为已执行）。
async function g2RecoveryChecks(){
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);
  const payload=(runtime,roleId,extra={})=>({projectRoot:ROOT,roleId,runtime,...extra});
  // ① 实时：看护告警真投递回显（适配器 `用户指令：` 前缀）→ 注入样式 + 系统来源标签 + 正文原样。
  const alertText='用户指令：[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。';
  await push('session:events',[payload('pi','A',{event:{turnId:'g2-alert',kind:'message',summary:'[系统·看护] 投递排队积压',detail:{source:'prompt-input',text:alertText}}})]);
  await check('G2 system alert renders as own injected style with system source chip',`(()=>{const el=document.querySelector('#chat .msg-injected.is-system');return !!el&&el.querySelector('.mi-chip').textContent==='系统消息 · 看护'&&!el.classList.contains('msg-user')&&el.querySelector('.mi-body').textContent.includes('投递排队积压');})()`);
  // 回放：历史 kind user 行原文同样归类（同一前缀表；收束提示子类）。
  await push('session:history',{projectRoot:ROOT,roleId:'A',runtime:'pi',rows:[{kind:'user',text:'[系统·收束] 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 5 分钟。',at:''}],error:null,skipped:0});
  await check('G2 closure notice replay classified by the same single source',`[...document.querySelectorAll('#chat .msg-injected.is-system .mi-chip')].some(x=>x.textContent==='系统消息 · 收束')`);
  // ② 恢复确认卡（探针注入数据面，按 IPC 契约形状；回包通道 W5 落树前缺席）：逐字证据 + 取消默认焦点。
  const evidence='role_status：角色「实现者」busy=true 已 583s；队列 0；最近一轮 timed_out 无 settled。';
  await js(`window.__ansRenderer.onRecoveryConfirm(${JSON.stringify({id:'rp-1',projectRoot:ROOT,runtime:'pi',roleId:'实现者',action:'abort-turn',evidence,reason:'疑似卡死',requestedBy:'su',requestedAt:'2026-10-16T02:10:03.000Z'})})`);
  await check('G2 recovery card shows action role and verbatim evidence with cancel default focus',`(()=>{const o=document.getElementById('recovery-confirm');return !o.hidden&&document.getElementById('rc-action').textContent==='动作：停止本轮（abort-turn）'&&document.getElementById('rc-role').textContent==='目标角色：实现者'&&document.getElementById('rc-evidence').textContent===${JSON.stringify(evidence)}&&document.getElementById('rc-reason').textContent.includes('疑似卡死')&&document.activeElement===document.getElementById('rc-deny')&&document.getElementById('rc-details').open===false;})()`);
  for(const width of [1360,960]){win.setContentSize(width,860);await pause(100);fs.writeFileSync(path.join(OUT,'g2-recovery-card-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  // Esc = 不执行（fail-closed）。通道缺席 ⇒ 不假装裁决：如实终态「未获执行」。
  await key('Escape');await pause(60);
  await check('G2 recovery Esc is deny and channel-absent terminal never claims execution',`(()=>{const o=document.getElementById('recovery-confirm');return !o.hidden&&o.classList.contains('is-expired')&&document.getElementById('rc-allow').disabled&&!document.getElementById('rc-close').disabled&&document.getElementById('rc-hint').textContent.includes('按 fail-closed 不执行');})()`);
  await js(`document.getElementById('rc-close').click()`);
  await check('G2 expired recovery card dismisses without execution illusion',`document.getElementById('recovery-confirm').hidden&&window.__ansRenderer.state.recoveryConfirm===null`);
}

// ——— 工具行折叠（2026-10-16 客户批准口径）离线验收段：分组依据=turnId；运行中逐条实时（组展开）；
// settled 折叠成一行「本轮 N 个调用：a / b ×k / c（· 含 X 条未放行 / 含 Y 条失败 / 含状态未记录）」；
// 展开逐条零丢失；未放行行照旧直显（治理信号）；手动开合优先且会话内保持；窗口化（挂载中折叠保锚点 /
// 视窗外折叠后挂回来仍折叠）。 ———
async function toolFoldChecks(){
  const scoped={projectRoot:ROOT,roleId:'A',runtime:'pi'};
  const payload=(event,roleId='A',runtime='pi')=>({projectRoot:ROOT,roleId,runtime,event:{...event,roleId,runtime}});
  const start=(turn,id,tool,args={})=>({kind:'tool_call',turnId:turn,summary:'调用工具 '+tool,detail:{toolName:tool,toolCallId:id,phase:'start',...args}});
  const result=(turn,id,tool,extra={})=>({kind:'accepted',turnId:turn,summary:tool+' 执行完成',detail:{toolName:tool,toolCallId:id,phase:'result',ok:true,status:'completed',...extra}});
  const settled=(turn)=>({kind:'settled',turnId:turn,summary:'本轮已完成',detail:{outcome:'completed'}});
  const rowsMap=()=>js(`[...document.querySelectorAll('#chat .tool-activity')].map(x=>({idx:x.dataset.activityIndex,ph:x.dataset.activityPhases,text:x.textContent}))`);
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);await pause(60);
  await push('session:role-state',{...scoped,busy:true,summaries:[],queue:[]});
  // —— t1：运行中逐条实时（组展开、失败/未放行相位并入同轮组行不切断组）——
  await push('session:events',[
    payload(start('fold-t1','fc1','role_status')),
    payload(result('fold-t1','fc1','role_status')),
    payload(start('fold-t1','fc2','run_shell',{args:{command:'ans status'}})),
    payload({kind:'denied',turnId:'fold-t1',summary:'未执行：命令被拒绝（原因：runs outside sandbox）',detail:{toolName:'run_shell',toolCallId:'fc2',phase:'blocked'}}),
  ]);
  await check('fold running stays expanded with live rows',`(()=>{const g=document.querySelector('#chat .tool-records');return document.querySelectorAll('#chat .tool-records').length===1&&g.open===true&&[...document.querySelectorAll('#chat .tool-activity')].every(x=>x.getBoundingClientRect().height>0);})()`);
  await check('fold running summary carries calls breakdown and not-released mark',`(()=>{const s=document.querySelector('#chat .tool-records summary').textContent;return s.includes('本轮 2 个调用：role_status / run_shell')&&s.includes('含 1 条未放行');})()`);
  await check('denied phase merges into its own call row and group is not cut',`(()=>{const t=[...document.querySelectorAll('#chat .tool-activity')].map(x=>x.textContent);return t.length===2&&t[0].includes('调用发起')&&t[0].includes('执行完成')&&t[1].includes('调用发起')&&t[1].includes('已拒绝')&&document.querySelector('#chat .sys-denied').textContent.includes('runs outside sandbox');})()`);
  const runningRows=await rowsMap();
  fs.writeFileSync(path.join(OUT,'toolfold-1-running-1360.png'),(await win.webContents.capturePage()).toPNG());
  // —— settled：折叠成一行（摘要不变、未放行行直显、展开零丢失）——
  await push('session:events',[payload(settled('fold-t1'))]);
  await check('settled folds the turn group with summary intact and denied row still direct',`(()=>{const g=document.querySelector('#chat .tool-records');const s=g.querySelector('summary').textContent;return g.open===false&&s.includes('本轮 2 个调用：role_status / run_shell')&&s.includes('含 1 条未放行')&&document.querySelector('#chat .sys-denied').textContent.includes('runs outside sandbox');})()`);
  fs.writeFileSync(path.join(OUT,'toolfold-2-folded-1360.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.querySelector('#chat .tool-records').open=true`);await pause(80);
  const expandedRows=await rowsMap();
  const sameRows=JSON.stringify(runningRows.map(x=>[x.idx,x.ph,x.text]))===JSON.stringify(expandedRows.map(x=>[x.idx,x.ph,x.text]));
  await check('manual expand after fold restores every row identity zero loss',`document.querySelector('#chat .tool-records').open===true&&document.querySelectorAll('#chat .tool-activity').length===2&&${sameRows}`);
  fs.writeFileSync(path.join(OUT,'toolfold-3-expanded-1360.png'),(await win.webContents.capturePage()).toPNG());
  // —— t2：手动开合优先——运行中用户收起后，追加与 settled 都不再自动展开；摘要照常更新 ——
  await push('session:events',[
    payload(start('fold-t2','fc3','role_status')),payload(result('fold-t2','fc3','role_status')),
    payload(start('fold-t2','fc4','read_file',{args:{path:'README.md'}})),payload(result('fold-t2','fc4','read_file')),
  ]);
  await check('second turn opens its own group while running',`document.querySelectorAll('#chat .tool-records').length===2&&document.querySelectorAll('#chat .tool-records')[1].open===true`);
  await js(`document.querySelectorAll('#chat .tool-records')[1].open=false`);await pause(60);
  await push('session:events',[payload(start('fold-t2','fc5','session_tail'))]);
  await check('manual collapse during running survives later appends',`document.querySelectorAll('#chat .tool-records').length===2&&document.querySelectorAll('#chat .tool-records')[1].open===false&&document.querySelectorAll('#chat .tool-records')[1].querySelector('summary').textContent.includes('本轮 3 个调用：role_status / read_file / session_tail')`);
  await push('session:events',[payload(settled('fold-t2'))]);
  await check('manual collapse survives settle auto fold',`document.querySelectorAll('#chat .tool-records').length===2&&document.querySelectorAll('#chat .tool-records')[1].open===false`);
  // —— t3：失败相位并入组行并在折叠摘要标出（含 N 条失败）——
  await push('session:events',[
    payload(start('fold-t3','fc6','write_file',{args:{path:'README.md'}})),
    payload({kind:'accepted',turnId:'fold-t3',summary:'write_file 执行失败：README.md（EACCES）',detail:{toolName:'write_file',toolCallId:'fc6',phase:'result',ok:false,status:'failed'}}),
  ]);
  await check('failed phase marks the fold summary with failure count',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);const s=g.querySelector('summary').textContent;return s.includes('本轮 1 个调用：write_file')&&s.includes('含 1 条失败')&&g.open===true&&[...document.querySelectorAll('#chat .sys-denied')].some(x=>x.textContent.includes('EACCES'));})()`);
  await push('session:events',[payload(settled('fold-t3'))]);
  await check('failed turn folds with failure mark retained',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);return g.open===false&&g.querySelector('summary').textContent.includes('含 1 条失败');})()`);
  // —— 窗口化：长转录中挂载态折叠保阅读锚点；视窗外（已脱挂）折叠后挂回仍折叠 ——
  const bPayload=(event)=>payload(event,'B');
  const longRowsB=[];
  for(let i=0;i<200;i++){
    longRowsB.push({kind:'assistant',text:'brow-'+i+' 长聊天折叠验证。'.repeat(10),at:'',turnId:'fold-b-hist'});
    if(i===98)for(let j=0;j<8;j++)longRowsB.push({kind:'tool',text:'调用工具 read_file',at:'',turnId:'fold-b-hist',activity:{toolName:'read_file',target:'hist-'+j+'.md',toolCallId:'lb-'+j,phase:'start',status:'call'}});
  }
  longRowsB.push({kind:'assistant',text:'fold-anchor 折前正文',at:'',turnId:'fold-b-hist'});
  await js(`await window.__ansRenderer.selectRole('B')`);await pause(80);
  await push('session:role-state',{projectRoot:ROOT,roleId:'B',runtime:'pi',busy:true,summaries:[],queue:[]});
  await push('session:history',{projectRoot:ROOT,roleId:'B',runtime:'pi',rows:longRowsB,error:null,skipped:0});await pause(60);
  const anchorOffset=()=>js(`(()=>{const c=document.getElementById('chat'),n=[...document.querySelectorAll('#chat .msg')].find(e=>e.textContent.startsWith('fold-anchor'));if(!n)return null;return +(n.getBoundingClientRect().top-c.getBoundingClientRect().top).toFixed(2);})()`);
  // t4（尾部阅读态）：一组 12 个调用 + 组后助手正文（真实流形态）。阅读锚点摆到距顶 150px——折叠把
  // 文档尾缩短到锚点下方不足一屏 ⇒ 边界处按上限夹取（断言之「有界」半边），严格「零位移」半边由 t7 校。
  const t4Events=[];
  for(let k=1;k<=12;k++){t4Events.push(bPayload(start('fold-t4','lb-live-'+k,'role_status')),bPayload(result('fold-t4','lb-live-'+k,'role_status')));}
  t4Events.push(bPayload({kind:'message',turnId:'fold-t4',summary:'已核对完成。'+'继续整理结果。'.repeat(60)}));
  await push('session:events',t4Events);
  await js(`document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight`);await pause(120);
  await check('windowed tail group open while its turn runs',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);return !!g&&g.open===true&&g.querySelector('summary').textContent.includes('本轮 12 个调用：role_status ×12');})()`);
  // 阅读态（非贴底）：锚点行摆到距顶 150px 再 settled（贴底场景由浏览器夹取自然保持贴底，不属"阅读位移"）。
  await js(`(()=>{const c=document.getElementById('chat'),n=[...document.querySelectorAll('#chat .msg')].find(e=>e.textContent.startsWith('fold-anchor'));c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);await pause(140);
  const anchorBefore=await anchorOffset();
  await check('reader anchor row is real and visible before fold',`${JSON.stringify(anchorBefore)}!==null`);
  const firstReading=()=>js(`(()=>{const c=document.getElementById('chat'),t=c.getBoundingClientRect().top;const n=[...c.querySelectorAll('.msg,.tool-records,.sys-denied')].find(x=>x.getBoundingClientRect().bottom>t);return n?{text:n.textContent.slice(0,24),offset:+(n.getBoundingClientRect().top-t).toFixed(2),scrollTop:c.scrollTop}:null;})()`);
  const readingBeforeProbe=await firstReading();
  await push('session:events',[bPayload(settled('fold-t4'))]);await pause(80);
  const anchorAfter=await anchorOffset();
  await pause(400);
  const anchorLater=await anchorOffset();
  const readingAfter=await firstReading();
  reports.push({name:'fold anchor offsets',anchorBefore,anchorAfter,anchorLater,readingBefore:readingBeforeProbe,readingAfter});
  const autoDelta=Math.abs(anchorLater-anchorBefore);
  // 尾部阅读态（阅读锚点距文档尾不足一个视口）：折叠缩短文档尾，浏览器按上限夹取——断言=位移有界
  //（≤20px，半行内）且不逐次累积（after===later）且正在读的行仍在视口内（文本未换页）。这是**物理边界**
  //（任何文档尾收缩同此），非折叠语义误差；「阅读不被打断」的严格不变量在下一段（文档中部态）校验。
  await check('tail fold movement bounded and non accumulating with the reading row still in view',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);const c=document.getElementById('chat'),r=c.getBoundingClientRect();const n=[...document.querySelectorAll('#chat .msg')].find(e=>e.textContent.startsWith('brow-198 '));const visible=!!n&&n.getBoundingClientRect().bottom>r.top&&n.getBoundingClientRect().top<r.bottom;return g.open===false&&g.querySelector('summary').textContent.includes('本轮 12 个调用：role_status ×12')&&${JSON.stringify(autoDelta)}<=20&&${JSON.stringify(anchorAfter)}===${JSON.stringify(anchorLater)}&&visible;})()`);
  // 文档中部阅读态（阅读锚点下方仍有远超一屏的内容）：折叠**不得**让正在读的正文位移（与 toggleDrift
  // 同一标准 <2px）——t7 在尾部再起一轮（12 个调用 + 组后正文），随后再推多行正文垫长尾段，再 settled。
  const t7Events=[];
  for(let k=1;k<=12;k++){t7Events.push(bPayload(start('fold-t7','lb-seven-'+k,'role_status')),bPayload(result('fold-t7','lb-seven-'+k,'role_status')));}
  t7Events.push(bPayload({kind:'message',turnId:'fold-t7',summary:'已完成核对。'}));
  for(let k=0;k<6;k++)t7Events.push(bPayload({kind:'message',turnId:'fold-t7',summary:'尾段正文 '+k+' '+'行内填充内容用于垫长折叠锚点下方。'.repeat(14)}));
  await push('session:events',t7Events);await pause(60);
  await js(`document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight`);await pause(120);
  await js(`(()=>{const c=document.getElementById('chat'),n=[...document.querySelectorAll('#chat .msg')].find(e=>e.textContent.startsWith('fold-anchor'));c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);await pause(140);
  const midBefore=await anchorOffset();
  await push('session:events',[bPayload(settled('fold-t7'))]);await pause(120);
  const midAfter=await anchorOffset();
  await pause(300);
  const midLater=await anchorOffset();
  reports.push({name:'mid document fold anchor',midBefore,midAfter,midLater});
  await check('mid document fold keeps the reading anchor within two pixels and stable',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);return g.open===false&&g.querySelector('summary').textContent.includes('本轮 12 个调用：role_status ×12')&&Math.abs(${JSON.stringify(midAfter)}-${JSON.stringify(midBefore)})<2&&${JSON.stringify(midLater)}===${JSON.stringify(midAfter)};})()`);
  fs.writeFileSync(path.join(OUT,'toolfold-4-windowed-fold-1360.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('chat').scrollTop=0`);await pause(150);
  await check('scrolled away the group is windowed out (no attached group rows)',`document.querySelectorAll('#chat .tool-records').length===0`);
  await push('session:events',[
    bPayload(start('fold-t5','lb-live2','session_tail')),
    bPayload(result('fold-t5','lb-live2','session_tail')),
  ]);
  await check('live group created off screen stays unmounted until scrolled back',`document.querySelectorAll('#chat .tool-records').length===0`);
  await push('session:events',[bPayload(settled('fold-t5'))]);await pause(60);
  await js(`document.getElementById('chat').scrollTop=document.getElementById('chat').scrollHeight`);await pause(150);
  await check('off screen settled group attaches already folded with summary',`(()=>{const g=[...document.querySelectorAll('#chat .tool-records')].at(-1);return !!g&&g.open===false&&g.querySelector('summary').textContent.includes('本轮 1 个调用：session_tail');})()`);
  fs.writeFileSync(path.join(OUT,'toolfold-5-offscreen-settled-1360.png'),(await win.webContents.capturePage()).toPNG());
}

async function governanceReacceptChecks(){
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);await pause(200);
  await check('GOV pin-mismatch status row',`(()=>{const s=document.getElementById('governance-status');const b=s&&s.querySelector('[data-governance-reaccept]');return !!s&&!s.hidden&&s.textContent.includes('治理记录与盘上边界不一致')&&s.textContent.includes('共 9 条 pin')&&!!b&&b.textContent==='检查并重新接受';})()`);
  await check('GOV pin-mismatch empty state reuses su empty host',`(()=>{const e=document.querySelector('.chat-empty');return !!e&&e.textContent.includes('治理记录与盘上边界不一致')&&e.textContent.includes('检查并重新接受')&&e.textContent.includes('也可在终端核对 git 历史后再处理。');})()`);
  fs.writeFileSync(path.join(OUT,'governance-reaccept-mismatch-1360.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.querySelector('#governance-status [data-governance-reaccept]').click()`);await pause(150);
  await check('GOV preview reuses non-modal #governance-preview',`(()=>{const p=document.getElementById('governance-preview');return !!p&&!p.hidden&&document.querySelectorAll('#governance-preview').length===1&&p.className==='governance-preview'&&p.textContent.includes('重新接受治理边界（预览）');})()`);
  await check('GOV preview file/write/pin/warning lines',`(()=>{const p=document.getElementById('governance-preview');const t=p.textContent;return t.includes('角色卡/assembly/boundary.yaml — 内容已变更（pin a1b2c3d4… → 现 9f8e7d6c…）')&&t.includes('将写入：.ans/project.json、docs/bootstrap-manifest.md')&&t.includes('将重算这 9 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。')&&t.includes('如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。')&&!!p.querySelector('[data-governance-reaccept]:not([disabled])');})()`);
  await check('GOV preview adds no modal or fourth entry',`!document.querySelector('[role="dialog"][id*="governance"]')&&document.querySelectorAll('#governance-preview').length===1&&document.getElementById('governance-preview').className==='governance-preview'`);
  fs.writeFileSync(path.join(OUT,'governance-reaccept-preview-1360.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(previewCalls.length,1,'preview IPC called once');
  assert.deepEqual(previewCalls[0],{projectRoot:ROOT},'preview IPC only carries projectRoot');
  // 取消：不调用 reaccept IPC，状态仍为 mismatch。
  await js(`document.querySelector('#governance-preview [data-governance-cancel]').click()`);await pause(100);
  assert.equal(reacceptCalls.length,0,'cancel must not call project:governance-reaccept');
  await check('GOV cancel keeps mismatch state and hides preview',`!document.getElementById('governance-status').hidden&&!!document.querySelector('#governance-status [data-governance-reaccept]')&&document.getElementById('governance-preview').hidden`);
  // 重新打开并确认接受。
  await js(`document.querySelector('#governance-status [data-governance-reaccept]').click()`);await pause(150);
  assert.equal(previewCalls.length,2,'each open performs a fresh preview');
  await js(`document.querySelector('#governance-preview [data-governance-reaccept]').click()`);await pause(150);
  assert.equal(reacceptCalls.length,1,'confirm calls reaccept exactly once');
  assert.deepEqual(reacceptCalls[0],{projectRoot:ROOT,confirm:true,previewDigest:GOV_DIGEST},'confirm only sends root/confirm/digest');
  await check('GOV success text after completed',`document.getElementById('governance-preview').textContent.includes('已重新接受：更新 1 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。')&&document.getElementById('composer-hint').textContent===''`);
  await js(`await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await pause(250);
  fs.writeFileSync(path.join(OUT,'governance-reaccept-success-1360.png'),(await win.webContents.capturePage()).toPNG());
}

// 2026-10-19 客户要求：①左树取消角色分组折叠（所有治理/项目角色始终展开可见）；
// ②系统通知（会话重建等）独立系统行 + 「系统通知」徽标，用户正文仍按普通消息渲染。
async function noticeChecks(){
  const notice='此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。';
  const liveText='【系统通知·会话重建】'+notice+'\n\n请继续处理任务。';
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('liaison')`);
  await pause(140);
  // A. 左树全平铺：无 details/折叠卡；主入口/治理职能/项目分组/无分组角色全部直接可见。
  await check('role tree flat: all roles visible without details/fold',`(()=>{const tree=document.getElementById('role-tree');const ids=[...tree.querySelectorAll('.tree-item[data-role-id]')].map(x=>x.getAttribute('data-role-id'));const groups=[...tree.querySelectorAll('.tree-group')].map(x=>x.textContent);return !tree.querySelector('details')&&!tree.querySelector('.tree-group-fold')&&['liaison','rapporteur','nominator','convener','verifier','A','B','C'].every(id=>ids.includes(id))&&groups.includes('主入口')&&groups.some(g=>g.includes('治理职能'))&&groups.includes('平台组')&&groups.includes('工作角色')&&!groups.includes('其他角色（查看/调试）');})()`);
  await check('role status badges remain visible for every role',`document.querySelectorAll('#role-tree .tree-item .ti-sub').length>=8`);
  // 左树底部：项目分组与无分组默认标签「工作角色」（客户 2026-10-19 补充文案）。
  await js(`document.getElementById('role-tree').scrollTop=document.getElementById('role-tree').scrollHeight`);
  await pause(80);
  fs.writeFileSync(path.join(OUT,'role-tree-work-roles-1360.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('role-tree').scrollTop=0`);
  // B. 实时：系统通知独立系统行 + 「系统通知」徽标；用户正文按普通用户消息。
  await push('session:events',[{projectRoot:ROOT,roleId:'liaison',runtime:'pi',event:{kind:'message',runtime:'pi',roleId:'liaison',turnId:'notice-turn',summary:'用户指令：'+liveText,detail:{source:'prompt-input',text:liveText}}}]);
  await check('live system notice is its own sys row with 系统 badge, not a user bubble',`(()=>{const pane=document.querySelector('.chat-pane[data-role-id="liaison"]');if(!pane)return false;const notice=pane.querySelector('.sys-notice:not(.is-replay)');const badge=notice&&notice.querySelector('.sys-notice-badge');const users=[...pane.querySelectorAll('.msg-user')];return !!notice&&!!badge&&badge.textContent.includes('系统通知')&&badge.textContent.includes('会话重建')&&notice.textContent.includes('写权不会自动保留')&&users.some(u=>u.textContent.trim()==='请继续处理任务。')&&users.every(u=>!u.textContent.includes('系统通知'))&&users.every(u=>!u.textContent.includes('写权不会自动保留'));})()`);
  fs.writeFileSync(path.join(OUT,'system-notice-live-and-flat-role-tree-1360.png'),(await win.webContents.capturePage()).toPNG());
  // D. 无文件目标的工具行（客户 2026-10-19：交互/派发类工具不应像「未保存/失败」）。
  await push('session:events',[{projectRoot:ROOT,roleId:'liaison',runtime:'pi',event:{kind:'tool_call',runtime:'pi',roleId:'liaison',turnId:'notice-turn',summary:'调用工具 request_confirmation',detail:{toolName:'request_confirmation',toolCallId:'notice-confirm-call',phase:'start',display:{version:1,resultText:{text:'等待客户确认。'}}}}}]);
  await js(`(()=>{const pane=document.querySelector('.chat-pane[data-role-id="liaison"]');const row=pane&&pane.querySelector('details.tool-call-record');if(row)row.open=true;})()`);
  await pause(140);
  await check('tool row without file target is neutral in summary and details',`(()=>{const pane=document.querySelector('.chat-pane[data-role-id="liaison"]');const row=pane&&pane.querySelector('details.tool-call-record');if(!row)return false;const sum=row.querySelector('summary').textContent;const body=row.querySelector('.tool-call-details').textContent;return sum.includes('request_confirmation')&&sum.includes('无文件目标')&&!sum.includes('目标未保存')&&body.includes('本次调用无文件目标（交互/派发类工具）')&&!body.includes('未保存')&&!body.includes('失败');})()`);
  fs.writeFileSync(path.join(OUT,'tool-row-no-file-target-1360.png'),(await win.webContents.capturePage()).toPNG());
  // C. 回放同规则：历史行里的通知同样独立成行，正文仍是普通用户消息。
  await push('session:history',{projectRoot:ROOT,roleId:'liaison',runtime:'pi',rows:[{kind:'user',text:'【系统通知·会话重建】'+notice+'\n\n历史里的用户正文。',turnId:'hist-notice'},{kind:'assistant',text:'收到。',turnId:'hist-notice'}]});
  await pause(140);
  await check('replay system notice same rule: sys row + user body',`(()=>{const pane=document.querySelector('.chat-pane[data-role-id="liaison"]');if(!pane)return false;const notice=pane.querySelector('.sys-notice.is-replay');const badge=notice&&notice.querySelector('.sys-notice-badge');const body=[...pane.querySelectorAll('.msg-user.is-replay')].some(u=>u.textContent.trim()==='历史里的用户正文。');return !!notice&&!!badge&&badge.textContent.includes('系统通知')&&notice.textContent.includes('写权不会自动保留')&&body;})()`);
  fs.writeFileSync(path.join(OUT,'system-notice-replay-and-flat-role-tree-1360.png'),(await win.webContents.capturePage()).toPNG());
  win.setContentSize(960,620);await pause(140);
  fs.writeFileSync(path.join(OUT,'system-notice-and-flat-role-tree-960.png'),(await win.webContents.capturePage()).toPNG());
  await check('notice view no horizontal overflow at 960',`document.body.scrollWidth===innerWidth`);
}

async function blankPaneChecks(){
  // 真机场景（2026-10-20）：B 正在后台跑（有队列/「正在工作」状态行，但 pane 里没有任何 transcript）。
  // 旧实现用 `.chat-empty` 判历史 ⇒ 误判已有历史、不建 loading ⇒ getSessionHistory 未返回时整片空白。
  const bugRoot=ROOT+'-blank-bug';
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(bugRoot)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
  await push('session:role-state',{projectRoot:bugRoot,roleId:'B',runtime:'pi',busy:true,summaries:['后台排队任务'],queue:[{id:'blank-q',kind:'message',summary:'后台排队任务',full:'',at:'2026-10-20T00:00:00Z'}],running:{id:'blank-r',kind:'message',summary:'正在进行',full:'',at:'2026-10-20T00:00:00Z'},contextSource:'fresh'});
  await check('fixture: background pane has queue/status rows but no transcript',`(()=>{const m=window.__ansRenderer.paneDebug('B');return !!m&&m.queue&&m.currentWork&&m.assistant===0&&!m.empty&&!m.inChat;})()`);
  blankDefer=true;
  await js(`window.__blankSelect=window.__ansRenderer.selectRole('B');true`);
  await pause(40);
  await check('selecting background role shows history loading instead of blank',`(()=>{const m=window.__ansRenderer.paneDebug('B');return m.inChat&&m.loading&&m.loadingText.includes('正在载入会话历史…');})()`);
  blankResolve();
  await js(`await window.__blankSelect`);
  await pause(40);
  await check('empty history removes loading and shows neutral busy placeholder',`(()=>{const m=window.__ansRenderer.paneDebug('B');return m.inChat&&!m.loading&&m.note&&m.noteText.includes('后台正在工作，暂无可见消息')&&m.text.includes('后台排队任务');})()`);
  // 历史（有 transcript）到达：loading/占位移除，真实内容出现。
  const rows=[{kind:'user',turnId:'blank-t',text:'后台输入'},{kind:'assistant',turnId:'blank-t',text:'后台历史答复',eventKind:'message'}];
  mergeHistories.set('pi|B',{projectRoot:bugRoot,roleId:'B',runtime:'pi',rows,error:null,skipped:0});
  await push('session:history',{projectRoot:bugRoot,roleId:'B',runtime:'pi',rows});
  await check('history replay removes placeholder and renders content',`(()=>{const m=window.__ansRenderer.paneDebug('B');return !m.loading&&!m.note&&m.text.includes('后台历史答复');})()`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await js(`await window.__ansRenderer.selectRole('B')`);
  await pause(40);
  await check('role with transcript shows neither loading nor placeholder',`(()=>{const m=window.__ansRenderer.paneDebug('B');return m.inChat&&!m.loading&&!m.note&&m.text.includes('后台历史答复');})()`);
  // 无历史、无错误、空闲：显示可输入的中性占位，而不是空白或错误。
  mergeHistories.delete('pi|B');
  const idleRoot=ROOT+'-blank-idle';
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(idleRoot)});await window.__ansRenderer.selectRuntime('pi')`);
  await push('session:role-state',{projectRoot:idleRoot,roleId:'B',runtime:'pi',busy:false,summaries:[],queue:[],contextSource:'fresh'});
  await js(`await window.__ansRenderer.selectRole('B')`);
  await pause(40);
  await check('idle no-history role shows neutral placeholder instead of blank',`(()=>{const m=window.__ansRenderer.paneDebug('B');const p=document.querySelector('#chat .chat-pane[data-role-id="B"]');return m.inChat&&m.note&&m.noteText.includes('可直接输入消息')&&!p.querySelector('.sys-replay-divider')&&!p.querySelector('.sys-config');})()`);
}

async function queueViewChecks(){
  // 2026-10-20 真机：主进程队列已 0，但切引擎/恢复后旧 queuedRequests 从 runtime view 快照复活，
  // 界面残留「还有 N 个决定等待前一个决定」。口径：排队事实不跨视图保留，只由主进程重推重建。
  const saved={roles:listing.roles,primary:listing.primaryRoleId,model:listing.governanceModel,record:listing.governanceRecord,warnings:listing.warnings};
  const govRole=(roleId,fn)=>({roleId,cardText:'# '+roleId,cardPath:'',boundary:{entries:[]},boundaryPath:'',builtIn:true,governanceFunction:fn,changelog:null,docs:[]});
  listing.roles=[govRole('liaison','liaison'),govRole('rapporteur','proposal'),{roleId:'A',cardText:'# A',cardPath:'',boundary:{entries:[]},changelog:null,docs:[]}];
  listing.primaryRoleId='liaison';listing.governanceModel='trio';listing.governanceRecord={state:'present'};listing.warnings=[];
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi')`);
  await js(`await window.__ansRenderer.selectRole('liaison')`);await pause(80);
  const queued=(id,title)=>({id,roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',mirrorRoleId:'liaison',waitingFor:'mirror-1',request:{kind:'confirm',title,cardKind:'proposal'}});
  await push('session:operator-queued',queued('stale-q1','旧排队一'));
  await push('session:operator-queued',queued('stale-q2','旧排队二'));
  await check('queued baseline shows two', `(()=>{const a=document.querySelector('#chat .chat-pane[data-role-id="liaison"] .op-queue-aggregate');return !!a&&a.textContent.includes('还有 2 个决定等待前一个决定')&&window.__ansRenderer.queuedDebug().join(',')==='stale-q1,stale-q2';})()`);
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await pause(80);
  await check('runtime view restore does not revive old queued requests or aggregate', `(()=>{const a=document.querySelector('#chat .chat-pane[data-role-id="liaison"] .op-queue-aggregate');return !a&&window.__ansRenderer.queuedDebug().length===0;})()`);
  await push('session:operator-queued',queued('fresh-q1','新排队'));
  await check('main-process repush rebuilds aggregate with new count only', `(()=>{const a=document.querySelector('#chat .chat-pane[data-role-id="liaison"] .op-queue-aggregate');return !!a&&a.textContent.includes('还有 1 个决定等待前一个决定')&&!a.textContent.includes('2 个')&&window.__ansRenderer.queuedDebug().join(',')==='fresh-q1';})()`);
  await push('session:operator-expired',{id:'fresh-q1',roleId:'rapporteur',projectRoot:ROOT,runtime:'pi',reason:'离线清理'});
  await check('clearing queue removes aggregate', `(()=>{const a=document.querySelector('#chat .chat-pane[data-role-id="liaison"] .op-queue-aggregate');return !a&&window.__ansRenderer.queuedDebug().length===0;})()`);
  listing.roles=saved.roles;listing.primaryRoleId=saved.primary;listing.governanceModel=saved.model;listing.governanceRecord=saved.record;listing.warnings=saved.warnings;
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi')`);
}

app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},60000);
 try {
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:INTERACTIVE,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await win.loadFile(RENDERER_ENTRY);win.setTitle('ANS UI/UX 离线验收');await pause(150);
  if(GOVREACCEPT_ONLY){await governanceReacceptChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,previewCalls,reacceptCalls},null,2));console.log('GOVERNANCE_REACCEPT_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(GHOST_ONLY){await deliveryNoteChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,errors},null,2));console.log('DELIVERY_NOTE_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(VISUAL_ONLY){await visualChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,errors},null,2));console.log('VISUAL_V2_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(JUDGE_ONLY){await judgeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,judgeEnabled,judgeSetFailure},null,2));console.log('JUDGE_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(MIRROR_ONLY){await mirrorChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,responses},null,2));console.log('MIRROR_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(FRESH_CONTEXT_ONLY||ROLE_FOCUS_ONLY||TERMINAL_ONLY||SEND_FACTS_ONLY||TERMINAL_MERGE_ONLY){if(FRESH_CONTEXT_ONLY)await freshContextChecks();else if(ROLE_FOCUS_ONLY)await roleDocumentFocusChecks();else if(TERMINAL_ONLY)await terminalChecks();else if(SEND_FACTS_ONLY)await sendFactsChecks();else await terminalMergeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,errors},null,2));console.log((FRESH_CONTEXT_ONLY?'FRESH_CONTEXT':ROLE_FOCUS_ONLY?'ROLE_FOCUS':TERMINAL_ONLY?'TERMINAL':SEND_FACTS_ONLY?'SEND_FACTS':'TERMINAL_MERGE')+'_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(FLOW_ONLY){await completeFlowChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('COMPLETE_FLOW_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(PROJECT_RESET_ONLY){await projectResetChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('PROJECT_RESET_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(DUP_ONLY){await duplicateChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('DUP_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(SELECTOR_ONLY){await selectorChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,configReads},null,2));console.log('SELECTOR_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(G2_ONLY){await g2RecoveryChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('G2_RECOVERY_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(TOOLFOLD_ONLY){await toolFoldChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('TOOLFOLD_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(NOTICE_ONLY){await noticeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,errors},null,2));console.log('SYSTEM_NOTICE_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(BLANK_ONLY){await blankPaneChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,errors},null,2));console.log('BLANK_PANE_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(QUEUE_VIEW_ONLY){await queueViewChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,errors},null,2));console.log('QUEUE_VIEW_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(CONFIG_ONLY){await configChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports},null,2));console.log('CONFIG_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(process.env.ANS_MERGE_UI_ONLY==='1'){await mergeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends:sends.map(x=>({text:x.text,target:x.target,clientMessageId:x.metadata&&x.metadata.clientMessageId}))},null,2));console.log('MERGE_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  if(process.env.ANS_RUNTIME_UI_ONLY==='1'){await runtimeChecks();assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends},null,2));console.log('RUNTIME_UI_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);app.quit();return;}
  await push('session:role-state',snapshot());
  await push('session:events',activityEvents());
  await check('routine collapsed; failure direct; assistant untouched',`document.querySelectorAll('#chat .tool-records').length===2&&!document.querySelector('#chat .tool-records').open&&document.querySelector('#chat .sys-denied').textContent.includes('missing.md')&&document.querySelector('#chat .msg-assistant').textContent.trim()==='真实助手答复保持原文。'`);
  await check('single brief real write fact',`document.getElementById('chat-role-sub').hidden&&document.getElementById('chat-role-sub').textContent===''&&document.getElementById('runtime-note').textContent==='实际写入导入项目，角色边界外的写入会被拒绝。'`);
  await check('default failure shows known path',`document.querySelector('#chat .sys-denied > summary').textContent.includes('missing.md')&&document.querySelector('#chat .sys-denied').open===false`);
  await push('session:events',[event('denied','read_file 执行失败',{toolName:'read_file',path:'known/'+('long-target/'.repeat(30))+'lost.md',status:'failed'}),event('denied','未执行：命令被拒绝',{toolName:'run_shell'})]);
  await push('session:events',[event('denied','run_shell 已执行：false; echo literal（exit 2）',{toolName:'run_shell',status:'failed'})]);
  await check('known shell exit survives literal semicolon',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('false; echo literal')&&x.textContent.includes('exit 2'))`);
  await check('full target plus unknown target honest',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('long-target/'.repeat(30))&&x.textContent.includes('lost.md'))&&[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('未执行：命令被拒绝')&&x.textContent.includes('目标未记录'))`);
  await check('live failed reason visible in summary',`document.querySelector('#chat .sys-denied > summary').textContent.includes('文件不存在')`);
  await push('session:events',[event('denied','拒绝写入：目标不在角色允许范围',{toolName:'write_file',path:'outside.md'})]);
  await check('before-execution rejection keeps visible reason',`[...document.querySelectorAll('#chat .sys-denied > summary')].some(x=>x.textContent.includes('目标不在角色允许范围')&&!x.textContent.includes('执行失败'))`);
  // v3/S4（2026-10-16 客户批准）：摘要口径「N 条活动」→「N 个调用」（无 callId 的三条事件各成一行 ⇒ 计数不变=3；
  // 未知如实标注「· 含状态未记录」保留）。
  await check('unknown is honest count',`document.querySelector('#chat .tool-records summary').textContent.includes('3 个调用')&&document.querySelector('#chat .tool-records summary').textContent.includes('状态未记录')`);
  await js(`document.getElementById('tab-work').click()`);await pause(160);
  await check('one independent work list without duplicated role documents',`document.querySelectorAll('#right-body #right-queue-body').length===1&&document.querySelectorAll('#right-body .q-item').length===4&&!document.querySelector('#right-body details[data-section]')&&!document.getElementById('right-queue-overview')&&document.getElementById('drawer-title').textContent.includes('工作概览')`);
  await js(`document.querySelector('#right-body .q-toggle').click();document.getElementById('inp-message').value='A draft';document.getElementById('inp-message').dispatchEvent(new Event('input'));`);
  await key('Escape');await js(`document.getElementById('tab-card').click();document.querySelector('#right-body details').open=true`);await push('session:role-state',snapshot());
  await check('snapshot keeps independent role document open',`document.querySelector('#right-body details').open`);
  await key('Escape');await js(`document.getElementById('btn-attach-image').click()`);await pause(80);await js(`document.getElementById('tab-work').click()`);await push('session:role-state',snapshot());
  await check('snapshot keeps full after independent role document and back',`!document.querySelector('#right-body .q-full').hidden`);
  await js(`document.getElementById('drawer-close').focus()`);await key('Tab');await check('keyboard tabs to full',`document.activeElement.classList.contains('q-toggle')`);await key('Enter');await check('keyboard collapses full',`document.querySelector('#right-body .q-full').hidden===true`);await key('Enter');await check('keyboard expands full',`document.querySelector('#right-body .q-full').hidden===false`);await key('Tab');await check('keyboard tabs to withdraw',`document.activeElement.classList.contains('q-withdraw')`);
  for(const [width,height] of [[1360,860],[960,620]]) {
    win.setContentSize(width,height);await pause(100);
    await check(`role geometry ${width}`,viewportGeometry);
    await check(`queue full/grid/action rect ${width}`,`(()=>{let b=document.getElementById('right-body'),i=b.querySelector('.q-item:not(.is-running)'),f=b.querySelector('.q-full'),a=f.closest('.q-item').querySelector('.q-actions'),t=f.closest('.q-item').querySelector('.q-text'),buttons=[...b.querySelectorAll('.q-toggle,.q-withdraw')];return b.scrollWidth===b.clientWidth&&getComputedStyle(i).display==='grid'&&Math.abs(f.getBoundingClientRect().left-t.getBoundingClientRect().left)<1&&Math.abs(a.getBoundingClientRect().left-t.getBoundingClientRect().left)<1&&buttons.every(x=>{let r=x.getBoundingClientRect();return r.height>=28&&r.right<=b.getBoundingClientRect().right;});})()`);
    reports.push({name:'queue geometry '+width,value:await js(`(()=>{let b=document.getElementById('right-body'),f=b.querySelector('.q-full');return {clientWidth:b.clientWidth,scrollWidth:b.scrollWidth,full:f.getBoundingClientRect().toJSON(),actions:[...b.querySelectorAll('.q-toggle,.q-withdraw')].map(x=>({label:x.textContent,rect:x.getBoundingClientRect().toJSON()}))};})()`)});
    const chatWidth=await js(`document.getElementById('chat').getBoundingClientRect().width`);
    await key('Escape');await js(`document.getElementById('tab-pi').click()`);await pause(160);
    await check(`pi geometry ${width}`,viewportGeometry);
    await check(`Pi only one title/close ${width}`,`!document.querySelector('.pi-panel-title')&&!document.getElementById('pi-close')&&document.getElementById('drawer-title').textContent==='Pi 配置'&&document.getElementById('pi-panel-path').scrollWidth<=document.getElementById('pi-panel-path').clientWidth`);
    assert.equal(await js(`document.getElementById('chat').getBoundingClientRect().width`),chatWidth,'no reflow');
    await js(`document.getElementById('inp-message').value='line\\n'.repeat(14);document.getElementById('inp-message').dispatchEvent(new Event('input'));`);await pause(80);
    await check(`growing composer avoids drawer ${width}`,viewportGeometry);
    await js(`document.getElementById('drawer-close').click()`);await pause(160);
    await check(`closed no horizontal overflow ${width}`,`document.body.scrollWidth===innerWidth&&document.querySelector('.app').scrollWidth===document.querySelector('.app').clientWidth`);
    await js(`document.getElementById('tab-work').click()`);await pause(160);
  }
  await js(`document.getElementById('inp-message').value='A draft';await window.__ansRenderer.selectRole('B');document.getElementById('inp-message').value='B draft'`);
  await check('B independent no A image',`document.querySelectorAll('#attach-row .attach-chip').length===0&&!document.getElementById('right-body').textContent.includes('客户长消息')`);
  await js(`await window.__ansRenderer.selectRole('A')`);
  await check('A draft image resources full restored',`document.getElementById('inp-message').value==='A draft'&&document.querySelectorAll('#attach-row .attach-chip').length===1&&!document.querySelector('#right-body .q-full').hidden&&window.__ansRenderer.state.rightTab==='work'`);
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
  await key('Escape');await js(`document.getElementById('tab-card').click()`);
  await check('withdraw failure keeps draft image resources',`document.getElementById('inp-message').value==='撤回时保留的草稿'&&document.querySelectorAll('#attach-row .attach-chip').length===1&&document.querySelector('#right-body details').open`);
  await key('Escape');await js(`document.getElementById('tab-work').click()`);
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
  const anchorInfo=()=>js(`(()=>{const c=document.getElementById('chat'),t=c.getBoundingClientRect().top;const n=[...c.querySelectorAll('.msg')].find(e=>e.textContent.startsWith('row-120 '));const r=n?n.getBoundingClientRect():null;const g=document.querySelector('#chat .tool-records');return {found:!!n,parented:!!(n&&n.closest&&n.closest('.chat-pane')),offset:r?r.top-t:null,open:g?g.open:null,scrollTop:c.scrollTop};})()`);
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
  await push('session:operator-request',{id:'pending-fixture',roleId:'A',request:{kind:'confirm',title:'真实接口形状的离线未决',preview:'## 需确认\n\n- 第一条\n- 第二条\n\n| 字段 | 值 |\n| --- | --- |\n| 范围 | 预览 |\n\n**重点**\n\n<script>window.BAD_PREVIEW=1</script>'}});
  await js(`await window.__ansRenderer.selectRole('B');await window.__ansRenderer.selectRole('A')`);await pause(80);
  await check('pending locator visible after role click',`(()=>{let x=document.querySelector('#chat .op-request'),c=document.getElementById('chat').getBoundingClientRect(),r=x?.getBoundingClientRect();return !!r&&r.top>=c.top&&r.bottom<=c.bottom;})()`);
  await push('session:role-state',snapshot(true));
  // v3/S3（2026-10-16 客户批准）：chip 可见时尾行不再重复「等待你确认」——原断言=尾行文本为「等待你确认」；
  // 现状=chip（唯一状态指示）可见、尾行让位；busy 真实信号仍如实记录（不做界面推测的断言不变）。
  await check('open pending supersedes true busy',`(()=>{const chip=document.getElementById('op-chip');return !!chip&&!chip.hidden&&!document.querySelector('#chat .tool-current')&&window.__ansRenderer.state.roleBusy.A===true;})()`);
  for(const mode of ['card','pi']) {
    await js(`document.getElementById('tab-${mode}').click()`);await pause(160);
    await check(`pending entry fully reachable with ${mode} 960`,`(()=>{let e=document.getElementById('op-chip'),r=e.getBoundingClientRect(),d=document.getElementById('right-drawer').getBoundingClientRect();return e.tagName==='BUTTON'&&!e.hidden&&document.querySelector('.col-mid').inert&&!document.getElementById('drawer-backdrop').hidden&&r.left>=document.getElementById('chat').getBoundingClientRect().left&&r.top>=36&&r.bottom<=innerHeight;})()`);
    await check(`covered pending actions unavailable ${mode}`,`document.querySelector('#chat .op-request').inert===true&&getComputedStyle(document.querySelector('#chat .op-actions')).visibility==='hidden'`);
    await key('Escape');await js(`document.getElementById('op-chip').focus()`);await key('Enter');await pause(140);
    reports.push({name:'pending geometry '+mode,value:await js(`(()=>{let c=document.getElementById('chat').getBoundingClientRect(),e=document.querySelector('#chat .op-request');return {chat:c.toJSON(),card:e.getBoundingClientRect().toJSON(),buttons:[...e.querySelectorAll('.op-actions button')].map(b=>({hidden:b.hidden,inert:e.inert,rect:b.getBoundingClientRect().toJSON()})),active:document.activeElement.className,drawer:document.getElementById('right-drawer').className};})()`)});
    await check(`keyboard locate closes ${mode} and exposes all actions`,`(()=>{let c=document.getElementById('chat').getBoundingClientRect(),e=document.querySelector('#chat .op-request'),r=e.getBoundingClientRect(),buttons=[...e.querySelectorAll('.op-actions button')];return !e.inert&&!document.getElementById('right-drawer').classList.contains('open')&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom&&buttons.every(b=>{let x=b.getBoundingClientRect();return x.left>=c.left&&x.right<=c.right&&x.top>=c.top&&x.bottom<=c.bottom;})&&document.activeElement===e;})()`);
  }
  await key('Tab');await check('keyboard reaches original preview',`document.activeElement.matches('.op-preview > summary')`);await key('Enter');await check('keyboard expands original preview',`document.querySelector('#chat .op-request .op-preview').open`);
  // 客户 2026-10-17：预览应渲染 Markdown（标题/列表/表格/加粗），不是纯文本 pre；原文 HTML 仍转义。
  await check('expanded preview renders controlled markdown',`(()=>{const b=document.querySelector('#chat .op-request .op-preview-body');return !!b&&b.classList.contains('card-md')&&!!b.querySelector('h2')&&b.querySelectorAll('li').length===2&&!!b.querySelector('table')&&!!b.querySelector('strong')&&!b.querySelector('script')&&b.textContent.includes('<script>')&&window.BAD_PREVIEW===undefined;})()`);
  await check('expanded preview stays inside card width',`(()=>{const b=document.querySelector('#chat .op-request .op-preview-body'),c=document.querySelector('#chat .op-request');return b.scrollWidth<=b.clientWidth+1&&b.getBoundingClientRect().right<=c.getBoundingClientRect().right+0.5;})()`);
  await key('Tab');await check('keyboard enters original confirm action',`document.activeElement.classList.contains('op-confirm')`);
  await key('Tab');await check('keyboard reaches deny action',`document.activeElement.classList.contains('op-deny')`);
  await key('Enter');await pause(80);
  await check('answered pending returns to true busy',`document.getElementById('op-chip').hidden&&document.querySelector('#chat .tool-current').textContent==='正在工作'`);
  await push('session:role-state',snapshot(false));
  await check('idle after answered removes work',`!document.querySelector('#chat .tool-current')`);
  await key('Tab');await check('keyboard reaches retained image removal',`document.activeElement.classList.contains('attach-rm')`);await key('Tab');await check('keyboard returns to input above toolbar',`document.activeElement.id==='inp-message'`);await key('Tab');await check('keyboard returns to composer image toolbar',`document.activeElement.id==='btn-attach-image'`);
  operatorMode='expired';await push('session:role-state',snapshot(true));await js(`document.getElementById('tab-card').click()`);
  await push('session:operator-request',{id:'expired-fixture',roleId:'A',request:{kind:'confirm',title:'失效回执检查'}});
  // v3/S3（同上）：到达的未决指示=chip（同状态源）；尾行让位（原断言=尾行「等待你确认」）。
  await check('pending arrival preserves drawer',`document.getElementById('right-drawer').classList.contains('open')&&!document.getElementById('op-chip').hidden&&!document.querySelector('#chat .tool-current')`);
  await js(`document.getElementById('op-chip').click();document.querySelector('[data-request-id="expired-fixture"] .op-deny').click()`);await pause(80);
  await check('expired request restores actual true busy',`document.getElementById('op-chip').hidden&&document.querySelector('#chat .tool-current').textContent==='正在工作'&&document.querySelector('[data-request-id="expired-fixture"] .op-confirm').hidden`);
  operatorMode='normal';await push('session:role-state',snapshot(false));
  await push('session:events',[event('message','普通助手追问：请补充验收标准。')]);
  await check('ordinary question creates no pending',`document.getElementById('op-chip').hidden&&!document.querySelector('#chat .tool-current')`);
  await runtimeChecks();
  await mirrorChecks();
  if(errors.length) reports.push({name:'renderer console errors',errors});assert.equal(errors.length,0);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,reports,sends},null,2));
  console.log('UIUX_V2_PASS '+reports.length+' '+OUT);clearTimeout(watchdog);
  if(INTERACTIVE){
    interactiveReady=true;activeQueue=queue.slice();
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await pause(200);
    win.setTitle('ANS UI/UX 离线验收');win.setContentSize(Number(process.env.ANS_UIUX_WIDTH)||1360,Number(process.env.ANS_UIUX_WIDTH)===960?620:860);
    await push('session:role-state',snapshot());await push('session:events',activityEvents());
    await push('session:operator-request',{id:'preview-pending',roleId:'A',request:{kind:'confirm',title:'离线验收：需要客户确认的请求',preview:'## 预览夹具\n\n此为受控夹具，无真实任务。\n\n- 标题、列表与表格同角色卡管线\n- 原文 HTML 仍转义\n\n| 项 | 来源 |\n| --- | --- |\n| 预览 | markdown-it |'}});
    await js(`document.getElementById('tab-card').click()`);console.log('INTERACTIVE_FIXTURE_READY');
  }else app.quit();
 }catch(error){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,errors,error:String(error),stack:error.stack},null,2));console.error(error);clearTimeout(watchdog);app.exit(1);}
});
