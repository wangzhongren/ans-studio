// 诊断副本（非通过证据）：交付的 uiux-v2-renderer-regression.mjs 仅两处改动——(1) APP 可由 ANS_PROBE_APP 指向旧候选副本做A/B；(2) 两处 toggle 锚点断言改为**记录不判定**（另有 /private/tmp 中2026-10-14当次两份报告），用于把「切换漂移」回归的其余场景与它分开：其余检查保持原断言全文执行。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../app/desktop/session-history.ts';
const APP=process.env.ANS_PROBE_APP||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../app');
const OUT=process.env.ANS_TEST_UIUX_OUTDIR || '/private/tmp/ans-uiux-independent-renderer';
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
async function stable(name,before){const after=await reading();report.push({name,before,after});assert.ok(before&&after,name+' content');assert.equal(after.text,before.text,name+' identity');assert.ok(Math.abs(after.offset-before.offset)<2,name+' offset');}
app.whenReady().then(async()=>{
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(OUT,'watchdog.txt'),'timeout');app.exit(1);},30000);
 try{
  win=new BrowserWindow({width:1360,height:860,useContentSize:true,frame:false,show:false,webPreferences:{preload:path.join(APP,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  await win.loadFile(path.join(APP,'renderer/index.html'));await pause(200);
  const original=parse(longMessages);await history('A',original);
  report.push({name:'initial row observation',value:await js(`({model:window.__ansRenderer.rowModelDebug('A'),selected:window.__ansRenderer.state.selectedRoleId,project:window.__ansRenderer.state.projectRoot,groups:[...document.querySelectorAll('#chat .tool-records')].map(x=>({open:x.open,text:x.querySelector('summary').textContent}))})`)});
  await check('real JSONL creates >150 renderer rows with one collapsed group',`window.__ansRenderer.rowModelDebug('A').count>150&&document.querySelectorAll('#chat .tool-records').length===1&&document.querySelector('#chat .tool-records')?.open===false&&document.querySelector('#chat .tool-records summary').textContent.includes('40 条活动')`);
  await js(`document.querySelector('#chat .tool-records').open=true`);await pause(100);
  await js(`(()=>{const c=document.getElementById('chat'),n=c.querySelector('[data-activity-index="12"]');c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top+8;})()`);await pause(100);
  let before=await reading();assert.match(before.text,/ind-target-12/);
  const appended=parse(longMessages.concat(Array.from({length:6},(_,i)=>call('added-'+i,'added-target-'+i+'.md'))));
  await history('A',appended);await stable('append to expanded same group keeps child reader',before);
  await check('append updates actual group activity count and open state',`document.querySelector('#chat .tool-records').open&&document.querySelector('#chat .tool-records summary').textContent.includes('46 条活动')`);
  // 收起末尾大组会使合法scrollTop上界变小；提供后续原文才能严格验证可实现的锚点不变。
  await history('A',appended.concat(Array.from({length:50},(_,i)=>({kind:'assistant',text:'following-row-'+i+' 后续正文。'.repeat(10),at:''}))));
  await js(`(()=>{const c=document.getElementById('chat'),n=c.querySelector('.tool-records');c.scrollTop+=n.getBoundingClientRect().top-c.getBoundingClientRect().top-150;})()`);await pause(100);
  before=await reading();assert.match(before.text,/independent-row-/);
  const driftRecord=[];
  const driftSnap=async label=>{const r=await reading();driftRecord.push({label,offset:r.offset,deltaFromBefore:r.offset-before.offset,sameReadingText:!!r&&r.text===before.text,text:r.text.slice(0,16)});};
  await js(`document.querySelector('#chat .tool-records').open=false`);await pause(100);await driftSnap('collapse preserves preceding visible paragraph');
  await js(`document.querySelector('#chat .tool-records').open=true`);await pause(100);await driftSnap('expand preserves preceding visible paragraph');
  report.push({name:'toggle drift recorded instead of asserted (original tolerance |Δ|<2px)',value:driftRecord});
  // 同序位的新调用ID表示另一组，不能继承旧组展开态。
  const replaced=parse(longMessages.slice(0,180).concat(Array.from({length:40},(_,i)=>call('replacement-'+i,'replacement-target-'+i+'.md'))));
  await history('A',replaced);
  await check('different call identity does not inherit open state',`document.querySelector('#chat .tool-records')?.open===false&&document.querySelector('#chat .tool-records').textContent.includes('replacement-target-0')`);
  // 回到可靠同一身份，再打开；前插活动不改变原组身份。
  await history('A',original);await js(`document.querySelector('#chat .tool-records').open=true`);await pause(100);
  before=await reading();await history('A',parse([text('新增前缀段落'),...longMessages]));await stable('full replay prefix insertion preserves paragraph',before);
  await check('stable call identity retains user-open group after rewrite',`document.querySelector('#chat .tool-records')?.open===true`);
  // B独立输入：失败把确认调用和结论分开，已决卡重建后仍在两者之间。
  const requests=parse([{role:'assistant',content:[{type:'toolCall',id:'ind-confirm',name:'request_confirmation',arguments:{title:'独立拒绝确认'}}]},
   {role:'toolResult',toolName:'request_confirmation',toolCallId:'ind-confirm',isError:true,content:[{type:'text',text:'未获同意：独立失败结论'}]},text('结论之后的助手原文')]);
  await history('B',requests);win.webContents.send('session:operator-request',{id:'ind-decided',roleId:'B',anchorKey:requests[0].anchorKey,request:{kind:'confirm',title:'独立拒绝确认'}});await pause(100);
  await js(`window.__ansRenderer.selectRole('B')`);await pause(100);await js(`document.querySelector('#chat .op-deny').click()`);await pause(100);
  await history('B',[{kind:'assistant',text:'独立前插',at:''},...requests]);
  await check('decided rejected card has distinct request/conclusion anchors after full replay',`(()=>{const a=window.__ansRenderer.replayAnchorDebug('B')[0],m=window.__ansRenderer.rowModelDebug('B');return a.requestIndex!==a.conclusionIndex&&m.operators.length===1&&m.operators[0].index===a.requestIndex+1&&document.querySelector('#chat .op-note').textContent.includes('不同意')&&document.querySelector('#chat .op-confirm').hidden;})()`);
  win.webContents.send('session:operator-request',{id:'ind-pending',roleId:'A',request:{kind:'confirm',title:'独立未决'}});await pause(100);
  await js(`window.__ansRenderer.selectRole('A')`);await pause(100);
  await check('explicit cross-role click prioritizes pending card',`(()=>{const n=[...document.querySelectorAll('#chat .op-request')].find(x=>x.textContent.includes('独立未决')),c=document.getElementById('chat').getBoundingClientRect(),r=n?.getBoundingClientRect();return !!r&&r.top>=c.top&&r.bottom<=c.bottom;})()`);
  // 只能从折叠summary证明异常默认可见，整个details.textContent会错误计入隐藏细节。
  const visibleFailures=parse([
   call('ind-missing','docs/not-there.md'),
   {role:'toolResult',toolName:'read_file',toolCallId:'ind-missing',isError:true,details:{status:'failed',ok:false},content:[{type:'text',text:'read_file 执行失败：文件不存在（ENOENT）'}]},
   {role:'assistant',content:[{type:'toolCall',id:'ind-shell',name:'run_shell',arguments:{command:'node --check missing.js'}}]},
   {role:'toolResult',toolName:'run_shell',toolCallId:'ind-shell',isError:true,details:{status:'failed',ok:false},content:[{type:'text',text:'run_shell 已执行：node --check missing.js（exit 2）\nstdout:\nPRIVATE_STDOUT'}]},
  ]);
  await history('B',visibleFailures);await js(`window.__ansRenderer.selectRole('B')`);await pause(100);
  await check('collapsed failure summary contains reliable missing-file reason',`[...document.querySelectorAll('#chat .sys-denied summary')].some(n=>/文件不存在|ENOENT/.test(n.textContent))`);
  await check('collapsed shell failure summary contains reliable exit 2',`[...document.querySelectorAll('#chat .sys-denied summary')].some(n=>n.textContent.includes('exit 2'))`);
  win.webContents.send('session:event',{roleId:'B',event:{kind:'denied',summary:'门禁拒绝：没有写入权限，未执行',detail:{toolName:'write_file',path:'outside/no-permission.md'}}});await pause(100);
  await check('pre-execution policy denial summary keeps reason without execution-failed claim',`(()=>{const all=[...document.querySelectorAll('#chat .sys-denied summary')],n=all.find(x=>x.textContent.includes('没有写入权限'));return !!n&&n.textContent.includes('未执行')&&!n.textContent.includes('执行失败');})()`);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({electron:process.versions.electron,node:process.versions.node,report},null,2));console.log('INDEPENDENT_RENDERER_PASS '+report.length+' '+OUT);clearTimeout(watchdog);app.quit();
 }catch(error){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({report,error:String(error),stack:error.stack},null,2));console.error(error);clearTimeout(watchdog);app.exit(1);}
});
