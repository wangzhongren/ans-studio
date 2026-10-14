// 固定测试角色的最小复现夹具（诊断用，非通过/失败套件）：
// 「虚拟行长列表里收起/展开末尾大组」的阅读锚点漂移。独立内存假IPC、hidden、隔离userData。
// 场景：180条正文 + 40条活动的单组（虚拟化阈值150行以上）+ 组后50条正文；
// 把组顶滚到聊天顶下方150px，组前段落为首可见行；随后反复折叠/展开该组，记录读数。
// v2（2026-10-14）：同时记两个读数——fixedAnchorOffset=初始首可见段落按**固定元素**（文本钉住）
// 的 rect 偏移；firstVisibleOffset=旧口径（首个可见行，会随漂移切换目标行，仅作对照）。
// 升级为交付断言时用固定元素读数（桌面UI复核建议）。
//
// A/B 对照（HEAD=上一已签候选）：
//   mkdir -p /private/tmp/ans-old-renderer/app/renderer/vendor
//   for f in $(git ls-tree -r HEAD app/renderer app/preload.cjs | awk '{print $4}'); do
//     git show HEAD:$f > /private/tmp/ans-old-renderer/$f; done
//   ANS_TEST_UIUX_OUTDIR=<out-old> ANS_PROBE_APP=/private/tmp/ans-old-renderer/app \
//     node_modules/.bin/electron test/测试/uiux-anchor-drift-probe.mjs
// 常规运行（当时候选）：ANS_TEST_UIUX_OUTDIR=<out> node_modules/.bin/electron test/测试/uiux-anchor-drift-probe.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../app/desktop/session-history.ts';
const APP=process.env.ANS_PROBE_APP||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../app');
const OUT=process.env.ANS_TEST_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(),'ans-anchor-drift-'));
fs.mkdirSync(OUT,{recursive:true});app.setPath('userData',path.join(OUT,'user-data'));
const ROOT='/nonexistent-independent-snapshot-key';
const listing={projectRoot:ROOT,primaryRoleId:'A',hasRoles:true,warnings:[],roles:['A','B'].map(roleId=>({roleId,cardText:'# '+roleId,cardPath:'',boundaryPath:'',boundary:{entries:[]},changelog:null,docs:[]}))};
let win;const report=[];
for(const [name,handler] of Object.entries({
 'app:recovery-state':()=>({projectRoot:ROOT,roleId:'A'}),'app:recovery-ready':()=>({ok:true}),
 'app:renderer-diagnostic':()=>({ok:true}),'window:is-maximized':()=>false,
 'app:list-project':()=>listing,'session:open':()=>({ok:true,resumed:true,contextSource:'resumed'}),
 'session:live':()=>['A','B'],'session:stop':()=>({ok:true}),'session:operator-response':()=>({ok:true}),
}))ipcMain.handle(name,handler);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const js=code=>win.webContents.executeJavaScript(code);
async function check(name,code){const value=await js(code);report.push({name,value});assert.equal(value,true,name);}
function parse(messages){const p=parseSessionJsonl([{type:'session'},...messages.map(message=>({type:'message',message}))].map(x=>JSON.stringify(x)).join('\n'));assert.equal(p.ok,true);assert.equal(p.skipped,0);return p.rows;}
const call=(id,target)=>({role:'assistant',content:[{type:'toolCall',id,name:'read_file',arguments:{path:target}}]});
const text=t=>({role:'assistant',content:[{type:'text',text:t}]});
const longMessages=Array.from({length:180},(_,i)=>text('independent-row-'+i+' 阅读正文。'.repeat(10))).concat(Array.from({length:40},(_,i)=>call('ind-call-'+i,'ind-target-'+i+'.md')));
async function history(roleId,rows){win.webContents.send('session:history',{roleId,projectRoot:ROOT,rows});await pause(100);}
async function reading(){return js(`(()=>{const c=document.getElementById('chat'),top=c.getBoundingClientRect().top,bottom=c.getBoundingClientRect().bottom;const all=[...c.querySelectorAll('.tool-activity,.msg')];const n=all.find(e=>e.getBoundingClientRect().bottom>top&&e.getBoundingClientRect().top<bottom);return n?{text:n.textContent,offset:n.getBoundingClientRect().top-top}:null;})()`);}
app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},30000);
 try{
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:false,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  await win.loadFile(path.join(APP,'renderer/index.html'));await pause(200);
  const original=parse(longMessages);await history('A',original);
  await check('setup: >150 rows in one collapsed group',`window.__ansRenderer.rowModelDebug('A').count>150&&document.querySelectorAll('#chat .tool-records').length===1`);
  await js(`document.querySelector('#chat .tool-records').open=true`);await pause(100);
  const appended=parse(longMessages.concat(Array.from({length:6},(_,i)=>call('added-'+i,'added-target-'+i+'.md'))));
  await history('A',appended);
  await check('setup: append grows group to 46 activities',`document.querySelector('#chat .tool-records').open&&document.querySelector('#chat .tool-records summary').textContent.includes('46 条活动')`);
  await history('A',appended.concat(Array.from({length:50},(_,i)=>({kind:'assistant',text:'following-row-'+i+' 后续正文。'.repeat(10),at:''}))));
  await js(`(()=>{const c=document.getElementById('chat'),n=c.querySelector('.tool-records');c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);await pause(120);
  const before=await reading();assert.match(before.text,/independent-row-/);
  const anchorText=before.text.trim();
  const drift=[];
  const snap=async label=>{
    const r=await reading();
    const fixed=await js(`(()=>{const t=${JSON.stringify(anchorText)};const n=[...document.querySelectorAll('.msg')].find(x=>x.textContent.trim()===t);if(!n)return null;const c=document.getElementById('chat');return {offset:n.getBoundingClientRect().top-c.getBoundingClientRect().top};})()`);
    drift.push({label,firstVisibleOffset:r.offset,firstVisibleText:r.text.slice(0,16),sameReadingText:r.text===before.text,fixedAnchorOffset:fixed?fixed.offset:null,fixedAnchorPrefix:anchorText.slice(0,22),scrollTop:await js(`document.getElementById('chat').scrollTop`),groupH:await js(`document.querySelector('#chat .tool-records').getBoundingClientRect().height`)});
  };
  await snap('initial');
  for(let cycle=0;cycle<4;cycle++){
    await js(`document.querySelector('#chat .tool-records').open=false`);await pause(150);await snap('collapse cycle '+cycle);
    await js(`document.querySelector('#chat .tool-records').open=true`);await pause(150);await snap('expand cycle '+cycle);
  }
  report.push({name:'toggle drift (4 collapse/expand cycles)',value:drift});
  report.push({name:'reading paragraph metrics',value:await js(`(()=>{const n=[...document.querySelectorAll('.msg')].find(x=>x.textContent.startsWith('independent-row-178'));const c=getComputedStyle(n);return {offsetHeight:n.offsetHeight,rectH:n.getBoundingClientRect().height,fontSize:c.fontSize,lineHeight:c.lineHeight};})()`)});
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,app:APP,report},null,2));
  console.log('ANCHOR_DRIFT_PROBE_DONE rows='+report.length+' out='+OUT);clearTimeout(watchdog);app.quit();
 }catch(error){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({app:APP,report,error:String(error),stack:error.stack},null,2));console.error(error);clearTimeout(watchdog);app.exit(1);}
});
