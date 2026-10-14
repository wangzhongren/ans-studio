// 固定测试角色独立夹具（诊断+抽验，属 2026-10-14 第二版候选复测）：
// 覆盖两件本轮重点——
//  ① 行距缓存修复路径（detached-history）：行表在**未挂载**期建成（后台角色 B 的 session:history
//     先于选择到达），挂载后行距缓存必须正确且 >0（与挂载 pane 的实读 row-gap 相等），且开合执行
//     记录组零漂移（旧缺陷：脱离文档首读空串被当 0 缓存 → 该 pane 退回「不含行距」口径 → 漂移）。
//  ② U1 抽跑（点角色到底）：两角色均有深内容、无未决卡时，逐次点角色树 N 轮，记录每次距底距离。
//     U1 既有偶发由属主定性（其 A/B 0/16 vs 0/16）；本探针如实记录出现次数与形态，exit 0 不因偶发失败。
// 独立内存假IPC、hidden、隔离 userData；不导入 SessionManager/Pi，不访问业务项目或网络。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../app/desktop/session-history.ts';
const APP=process.env.ANS_PROBE_APP||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../app');
const OUT=process.env.ANS_TEST_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(),'ans-rowgap-detached-'));
fs.mkdirSync(OUT,{recursive:true});app.setPath('userData',path.join(OUT,'user-data'));
const ROOT='/nonexistent-independent-rowgap-fixture';
const listing={projectRoot:ROOT,primaryRoleId:'A',hasRoles:true,warnings:[],roles:['A','B'].map(roleId=>({roleId,cardText:'# '+roleId,cardPath:'',boundaryPath:'',boundary:{entries:[]},changelog:null,docs:[]}))};
let win;const report=[];
for(const [name,handler] of Object.entries({
 'app:recovery-state':()=>({projectRoot:ROOT,roleId:'A'}),'app:recovery-ready':()=>({ok:true}),
 'app:renderer-diagnostic':()=>({ok:true}),'window:is-maximized':()=>false,
 'app:list-project':()=>listing,'session:open':()=>({ok:true,resumed:true,contextSource:'resumed'}),
 'session:live':()=>['A','B'],'session:stop':()=>({ok:true}),'session:operator-response':()=>({ok:true}),
}))ipcMain.handle(name,handler);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const js=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(e){report.push({name:'JS-ERROR',value:{code:String(code).slice(0,200),message:String(e&&e.message),stack:String(e&&e.stack).slice(0,700)}});throw e;}};
function parse(messages){const p=parseSessionJsonl([{type:'session'},...messages.map(message=>({type:'message',message}))].map(x=>JSON.stringify(x)).join('\n'));assert.equal(p.ok,true);assert.equal(p.skipped,0);return p.rows;}
const call=(id,target)=>({role:'assistant',content:[{type:'toolCall',id,name:'read_file',arguments:{path:target}}]});
const text=t=>({role:'assistant',content:[{type:'text',text:t}]});
const longMessages=Array.from({length:180},(_,i)=>text('detached-row-'+i+' 阅读正文。'.repeat(10))).concat(Array.from({length:40},(_,i)=>call('det-call-'+i,'det-target-'+i+'.md')));
async function history(roleId,rows){win.webContents.send('session:history',{roleId,projectRoot:ROOT,rows});await pause(120);}
const fn = (id) => { const n = [...document.querySelectorAll('#role-tree .tree-item')].find(n => n.querySelector('.ti-name').textContent === id); if (!n) throw new Error('no tree item ' + id); n.click(); return window.__ansRenderer.state.selectedRoleId; };
async function roleClick(roleId){
  let r=null;
  try{ r=await js('('+fn.toString()+')('+JSON.stringify(roleId)+')'); }
  catch(e){ r={outer:String(e&&e.message)}; }
  await pause(150);
  if(r!==roleId)console.log('ROLE_CLICK_DIAG '+roleId+' '+JSON.stringify({r}));
  return r;
}
async function reading(){return js(`(()=>{const c=document.getElementById('chat'),top=c.getBoundingClientRect().top,bottom=c.getBoundingClientRect().bottom;const all=[...c.querySelectorAll('.tool-activity,.msg')];const n=all.find(e=>e.getBoundingClientRect().bottom>top&&e.getBoundingClientRect().top<bottom);return n?{text:n.textContent,offset:n.getBoundingClientRect().top-top}:null;})()`);}
app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},60000);
 try{
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:false,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  await win.loadFile(path.join(APP,'renderer/index.html'));await pause(250);

  // ———— ① detached-history：B 在未选择时先建行表（A 处于选中态） ————
  await history('B',parse(longMessages));
  const preMount=await js(`window.__ansRenderer.rowModelDebug('B')`);
  report.push({name:'detached: row table built before mount with unread gap cache',value:preMount});
  assert.ok(preMount&&preMount.count>=150,'detached row table should be built and virtualized (>=150 rows; got '+JSON.stringify(preMount)+')');
  assert.ok(preMount.rowGap===null||preMount.rowGap===undefined,'detached read must not cache a gap value (expect null/absent)');
  await roleClick('B');
  await pause(200);
  const postMount=await js(`(()=>{const d=window.__ansRenderer.rowModelDebug('B');const pane=document.querySelector('#chat .chat-pane[data-role-id="B"]');return {rowGap:d&&d.rowGap,paneGap:pane?parseFloat(getComputedStyle(pane).rowGap):null};})()`);
  report.push({name:'mounted: gap cache equals real pane row-gap and >0',value:postMount});
  assert.ok(postMount.paneGap>0,'mounted pane row-gap should be >0 (got '+JSON.stringify(postMount)+')');
  assert.equal(postMount.rowGap,postMount.paneGap,'cached rowGap must equal real computed row-gap after mount');
  // 开合执行记录组（B 的 pane，已挂载）：固定元素 + 首可见行双读数
  const opened=await js(`(()=>{const g=document.querySelector('#chat .chat-pane[data-role-id="B"] .tool-records');if(!g)return null;g.open=true;return true;})()`);
  assert.equal(opened,true,'B group should exist after mount');
  await pause(120);
  const appended=parse(longMessages.concat(Array.from({length:6},(_,i)=>call('det-added-'+i,'det-added-'+i+'.md'))));
  await history('B',appended);
  // 组后必须留正文（ReplayRow 形状——消息对象须先经 parse；否则为空致收起夹紧，见上轮口径）。
  await history('B',appended.concat(Array.from({length:50},(_,i)=>({kind:'assistant',text:'det-follow-'+i+' 后续正文。'.repeat(10),at:''}))));
  await js(`(()=>{const c=document.getElementById('chat'),n=c.querySelector('.chat-pane[data-role-id="B"] .tool-records');c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);
  await pause(150);
  const before=await reading();assert.match(before.text,/detached-row-/);
  const anchorText=before.text.trim();
  const drift=[];
  const snap=async label=>{
    const r=await reading();
    const fixed=await js(`(()=>{const t=${JSON.stringify(anchorText)};const n=[...document.querySelectorAll('.chat-pane[data-role-id=B] .msg')].find(x=>x.textContent.trim()===t);if(!n)return null;const c=document.getElementById('chat');return {offset:n.getBoundingClientRect().top-c.getBoundingClientRect().top};})()`);
    const g=await js(`(()=>{const all=[...document.querySelectorAll('.chat-pane[data-role-id=B] .tool-records')];const g=all[0];const c=document.getElementById('chat');return {groups:all.length,open:g?g.open:null,h:g?Math.round(g.getBoundingClientRect().height):null,docH:c.scrollHeight};})()`);
    drift.push({label,firstVisibleOffset:r.offset,fixedAnchorOffset:fixed?fixed.offset:null,sameReadingText:r.text===before.text,scrollTop:await js(`document.getElementById('chat').scrollTop`),group:g});
  };
  await snap('initial');
  for(let cycle=0;cycle<4;cycle++){
    await js(`document.querySelector('#chat .chat-pane[data-role-id="B"] .tool-records').open=false`);await pause(150);await snap('collapse cycle '+cycle);
    await js(`document.querySelector('#chat .chat-pane[data-role-id="B"] .tool-records').open=true`);await pause(150);await snap('expand cycle '+cycle);
  }
  report.push({name:'detached-then-mounted: toggle drift (4 cycles, dual reading)',value:drift});
  const base=drift[0].fixedAnchorOffset;
  for(const row of drift){
    assert.ok(row.fixedAnchorOffset!==null,'fixed anchor must stay readable at '+row.label);
    assert.ok(Math.abs(row.fixedAnchorOffset-base)<2,'fixed anchor drift must stay <2px at '+row.label+' (got '+(row.fixedAnchorOffset-base)+'px)');
  }

  // ———— ② U1 抽跑（点角色到底）：两角色深内容、无未决 ————
  await history('A',parse(Array.from({length:160},(_,i)=>text('u1-row-'+i+' 抽验正文。'.repeat(10)))));
  const u1=[];
  for(let i=0;i<20;i++){
    const id=i%2===0?'A':'B';
    await roleClick(id);
    const d=await js(`(()=>{const c=document.getElementById('chat');return {distance:Math.round((c.scrollHeight-c.scrollTop-c.clientHeight)*10000)/10000,scrollTop:c.scrollTop,scrollHeight:c.scrollHeight,clientHeight:c.clientHeight};})()`);
    u1.push({click:i+1,role:id,...d});
  }
  const misses=u1.filter(x=>x.distance>1);
  report.push({name:'U1 sampling: 20 alternating role clicks, distance-to-bottom each',value:u1});
  report.push({name:'U1 sampling summary',value:{clicks:u1.length,misses:misses.length,missDetails:misses}});
  console.log('U1_MISS_COUNT='+misses.length+'/'+u1.length);

  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,app:APP,report},null,2));
  console.log('ROWGAP_DETACHED_PROBE_DONE rows='+report.length+' out='+OUT);clearTimeout(watchdog);app.quit();
 }catch(error){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({app:APP,report,error:String(error),stack:error.stack},null,2));console.error(error);clearTimeout(watchdog);app.exit(1);}
});
