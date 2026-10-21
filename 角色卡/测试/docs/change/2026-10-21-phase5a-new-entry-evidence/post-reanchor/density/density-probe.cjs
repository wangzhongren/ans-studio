const { app, BrowserWindow } = require("electron");
const fs = require("fs"); const path = require("path");
const REPO="/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const OUT=path.join(__dirname,"out"); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
app.setPath("userData",path.join(OUT,"user-data"));
const report={checks:[],console:[],didFail:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(n,v,d){report.checks.push({name:n,value:v===true,detail:d??null});console.log(`CHECK ${n}=${JSON.stringify(v)}${d!==undefined?" "+JSON.stringify(d):""}`)}
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1360,height:860,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:path.join(__dirname,"..","..","..","2026-10-21-phase4b-fix-verification-evidence","smoke","ans-p4b-fix-smoke-preload.cjs")}});
 const wc=win.webContents; wc.on("console-message",(...a)=>{const e=a[0];const level=e&&typeof e==="object"&&"level"in e?e.level:a[1];const message=e&&typeof e==="object"&&"message"in e?e.message:a[2];report.console.push({level,message})});
 wc.on("did-fail-load",(_e,code,desc,url)=>report.didFail.push({code,desc,url}));
 await win.loadFile(path.join(REPO,"app/renderer/dist/src/index.html")); await sleep(500);
 const js=c=>wc.executeJavaScript(c,true);
 const rows=Array.from({length:12},(_,i)=>({kind:"assistant",text:"density row "+(i+1),at:"",turnId:"density-"+i}));
 async function seed(){await js(`(async()=>{window.__smoke4b.setFiveRoles(false);await window.__ansRenderer.loadProject('/fixture4b');await window.__ansRenderer.selectRole('A');await new Promise(r=>setTimeout(r,250));window.__smoke4b.emitHistory({roleId:'A',projectRoot:'/fixture4b',runtime:'claude',rows:${JSON.stringify(rows)},reports:[]});await new Promise(r=>setTimeout(r,400));const c=document.getElementById('chat');c.scrollTop=c.scrollHeight;document.getElementById('drawer-close').click();})()`);await sleep(250);}
 async function metrics(){return js(`(()=>{const c=document.getElementById('chat'),cr=c.getBoundingClientRect();const rows=[...c.querySelectorAll('.msg-assistant')];const full=rows.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=cr.top-1&&r.bottom<=cr.bottom+1});const first=rows[0],body=getComputedStyle(first);const chip=document.getElementById('op-chip');const cb=chip?chip.getBoundingClientRect():null;return {total:rows.length,fullyVisible:full.length,fontSize:body.fontSize,lineHeight:body.lineHeight,chatH:cr.height,chipHidden:chip?chip.hidden:null,chipH:cb&&!chip.hidden?cb.height:null,chipBottom:cb&&!chip.hidden?cb.bottom:null};})()`)}
 await seed(); win.setContentSize(1360,860); await sleep(250); const m1360=await metrics();
 check("DENSITY_1360_NO_HINT_GE9", m1360.fullyVisible>=9 && m1360.chipHidden===true, m1360);
 check("DENSITY_BODY_15_27", m1360.fontSize==="15px" && m1360.lineHeight==="27px", m1360);
 win.setContentSize(960,620); await sleep(250); const m960=await metrics();
 check("DENSITY_960_GE4", m960.fullyVisible>=4 && m960.chipHidden===true, m960);
 win.setContentSize(1360,860); await sleep(200);
 await js(`(async()=>{await window.__ansRenderer.selectRuntime('pi');await new Promise(r=>setTimeout(r,700));window.__smoke4b.emitHistory({roleId:'A',projectRoot:'/fixture4b',runtime:'pi',rows:${JSON.stringify(rows)},reports:[]});await new Promise(r=>setTimeout(r,450));const c=document.getElementById('chat');c.scrollTop=c.scrollHeight;})()`); await sleep(250);
 const mHint=await metrics();
 const notice=await js(`(()=>{const n=document.getElementById('runtime-config-notice');if(!n||n.hidden)return null;const r=n.getBoundingClientRect();return {h:r.height,text:n.textContent};})()`);
 check("DENSITY_1360_WITH_HINT_GE8", mHint.fullyVisible>=8 && notice!==null && notice.h>0, {mHint,notice});
 const errs=report.console.filter(e=>String(e.level)==="error");
 check("DENSITY_ZERO_CONSOLE",errs.length===0&&report.didFail.length===0,{errs,didFail:report.didFail});
 fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2));
 const fails=report.checks.filter(c=>!c.value).length; console.log(`DENSITY ${fails===0?"PASS":"FAIL"} ${report.checks.length}/${fails}`); app.exit(fails===0?0:1);
}).catch(e=>{console.error(e);report.checks.push({name:"CRASH",value:false,detail:String(e)});fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2));app.exit(2)});
