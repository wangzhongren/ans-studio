// 离线实际renderer/preload：受控IPC替身，不启用任何模型，不读取用户项目/凭据。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../../app/desktop/session-history.ts';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const APP=path.resolve(HERE,'../../../app');
const OUT=process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(),'ans-uiux-v2-'));
fs.mkdirSync(OUT,{recursive:true}); app.setPath('userData',path.join(OUT,'user-data'));
const INTERACTIVE=process.env.ANS_UIUX_INTERACTIVE==='1';
const ROOT='/offline-uiux-fixture';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let win, pickResolve, sendResolve, withdrawResolve;
let pickDeferred=false, sendDeferred=false, withdrawMode='fail', interactiveReady=false, operatorMode='normal';
const reports=[]; const errors=[]; const sends=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=code=>win.webContents.executeJavaScript(code.includes('await ')?'(async()=>{'+code+'})()':code);
async function check(name, code){const value=await js(code);reports.push({name,value});assert.equal(value,true,name);}
const roles=['A','B'].map(roleId=>({roleId,cardPath:ROOT+'/角色卡/'+roleId+'/role-card.md',cardText:'# '+roleId+'\n\n完整角色职责。\n\n'+('资料内容用于检查阅读态。\n\n'.repeat(80)),boundary:{entries:[]},boundaryPath:'',changelog:null,docs:[]}));
const listing={projectRoot:ROOT,primaryRoleId:'A',hasRoles:true,warnings:[],roles};
const longFull='全文 '+ '排队消息详细内容与来源。\n'.repeat(40)+'长连续文本 '+ 'ordinaryword'.repeat(120);
const queue=[{id:'msg\u0000long',kind:'message',summary:'客户长消息：'+ '超过80字的队列摘要用于核对换行、时间与操作归属。'.repeat(6),full:longFull,at:'2026-10-13T10:01:00Z'},{id:'dispatch',kind:'dispatch',sourceRoleId:'B',summary:'派发任务',full:'',at:'2026-10-13T10:02:00Z'},{id:'handback',kind:'handback',sourceRoleId:'B',summary:'回交报告',full:'',at:'2026-10-13T10:03:00Z'}];
let activeQueue=queue.slice();
const snapshot=(busy=true)=>({roleId:'A',busy,summaries:activeQueue.map(x=>x.summary),queue:activeQueue,running:busy?{id:'running',kind:'message',summary:'正在处理当前请求',full:'',at:'2026-10-13T10:00:00Z'}:null});
const handlers={
 'app:renderer-diagnostic':()=>({ok:true}), 'app:recovery-state':()=>({projectRoot:ROOT,roleId:'A'}),'app:recovery-ready':()=>({ok:true}),
 'window:is-maximized':()=>false,'app:list-project':()=>listing,'app:pick-project':()=>ROOT,
 'session:open':()=>({ok:true,resumed:true,contextSource:'resumed'}),'session:live':()=>['A','B'],'session:stop':()=>({ok:true}),
 'session:abort':()=>{win.webContents.send('session:role-state',snapshot(false)); return {ok:true,supported:true};},
 'session:operator-response':()=>operatorMode==='expired'?({ok:false,expired:true,error:'离线受控请求已失效'}):({ok:true}),
 'pi-config:get':()=>({path:ROOT+'/'+('a-very-long-path/'.repeat(12))+'.env',fields:['ANTHROPIC_AUTH_TOKEN','ANS_PI_BASE_URL','ANS_PI_MODEL','ANS_PI_CONTEXT_WINDOW'].map(key=>({key,secret:key==='ANTHROPIC_AUTH_TOKEN',value:key==='ANTHROPIC_AUTH_TOKEN'?'':'fixture',isSet:true}))}),
 'pi-config:save':()=>({ok:true,appliedKeys:[]}),
 'app:pick-image':()=>pickDeferred?new Promise(r=>pickResolve=r):({ok:true,image:{name:'fixture.png',mime:'image/png',size:68,dataBase64:PNG}}),
 'app:attach-image':(_e,input)=>({ok:true,image:{name:input.name,mime:'image/png',size:68}}),
 'session:send':(_e,input)=>{sends.push(input);return sendDeferred?new Promise(r=>sendResolve=r):{ok:true};},
 'session:withdraw':(_e,input)=>interactiveReady?({ok:false,error:'离线受控返回：当前无法撤回，请重试。'}):new Promise((resolve,reject)=>{withdrawResolve=()=>{if(withdrawMode==='throw'){reject(new Error('离线受控网络不可用'));return;}if(withdrawMode==='success'){activeQueue=activeQueue.filter(x=>x.id!==input.id);win.webContents.send('session:role-state',snapshot(false)); resolve({ok:true,summary:'客户长消息'});}else resolve({ok:false,error:'离线受控拒绝'});};}),
};
Object.entries(handlers).forEach(([name,fn])=>ipcMain.handle(name,fn));
const key=async name=>{const keyCode=name==='Enter'?'Return':name;win.webContents.sendInputEvent({type:'keyDown',keyCode});if(name==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode});await pause(50);};
const event=(kind,summary,detail)=>({roleId:'A',event:{kind,summary,detail}});
function activityEvents(prefix='') { return [event('tool_call','模型请求调用 read_file（目标：a.md）',{toolName:'read_file',path:'a.md'}),event('accepted','read_file 执行完成',{toolName:'read_file',path:'a.md',ok:true,status:'completed',turnId:prefix+'turn-1'}),event('accepted','request accepted',{toolName:'legacy',path:'legacy.md'}),event('denied','文件不存在',{toolName:'read_file',path:'missing.md',status:'failed',ok:false}),event('tool_call','开始执行 read_file',{toolName:'read_file',path:'b.md'}),event('message','真实助手答复保持原文。')]; }
async function push(channel,payload){win.webContents.send(channel,payload);await pause(80);}
function ownHistory(){return parseSessionJsonl([{type:'session'},{type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'rs',name:'run_shell',arguments:{command:'ls missing'}}]}},{type:'message',message:{role:'toolResult',toolCallId:'rs',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：ls missing（exit 1）\nstdout:\nSECRET'}]}},{type:'message',message:{role:'toolResult',toolName:'read_file',isError:false,content:[{type:'text',text:'read_file 失败：lost.md（ENOENT）'}]}},{type:'message',message:{role:'assistant',content:[{type:'text',text:'历史助手答复。'}]}}].map(x=>JSON.stringify(x)).join('\n')).rows;}
const viewportGeometry=`(() => { const root=document.documentElement,b=document.body,a=document.querySelector('.app'),c=document.querySelector('.composer').getBoundingClientRect(),d=document.getElementById('right-drawer').getBoundingClientRect(); const visible=id=>{let r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0;};return root.scrollWidth===root.clientWidth&&b.scrollWidth===b.clientWidth&&a.scrollWidth===a.clientWidth&&visible('btn-send')&&visible('btn-halt')&&visible('drawer-close')&&d.bottom<=c.top+1;})()`;
async function reading(){return js(`(() => {let c=document.getElementById('chat'),t=c.getBoundingClientRect().top;let nodes=[...c.querySelectorAll('.msg,.tool-records,.sys-denied')];let n=nodes.find(x=>x.getBoundingClientRect().bottom>t&&x.getBoundingClientRect().top<c.getBoundingClientRect().bottom);return n?{text:n.textContent.slice(0,60),offset:n.getBoundingClientRect().top-t}:null;})()`);}
app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},45000);
 try {
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:INTERACTIVE,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await win.loadFile(path.join(APP,'renderer/index.html'));win.setTitle('ANS UI/UX 离线验收');await pause(150);
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
