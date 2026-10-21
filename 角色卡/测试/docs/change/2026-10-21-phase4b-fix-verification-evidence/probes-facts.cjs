const { app, BrowserWindow } = require("electron"); const path=require("path"); const fs=require("fs");
const REPO="/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const OUT=path.join(__dirname,"facts-out"); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
app.setPath("userData",path.join(OUT,"user-data"));
const R2={version:1,reportId:"r2",status:"completed",origin:"submitted-report",summary:{text:"SECOND-REPORT"},source:{roleId:"B",runtime:"claude",turnId:"t2"},evidence:[]};
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1360,height:860,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:path.join(__dirname,"smoke","ans-p4b-fix-smoke-preload.cjs")}});
 await win.loadFile(path.join(REPO,"app/renderer/dist/src/index.html")); await new Promise(r=>setTimeout(r,500));
 const js=c=>win.webContents.executeJavaScript(c,true);
 await js(`(async()=>{await window.__ansRenderer.loadProject('/fixture4b');await window.__ansRenderer.selectRole('A');await new Promise(r=>setTimeout(r,300));})()`);
 const r=await js(`(async()=>{window.__smoke4b.emitEvent({roleId:'A',projectRoot:'/fixture4b',runtime:'claude',event:{kind:'handback',turnId:'t2',report:${JSON.stringify(R2)},reportPersistence:{state:'saved',retryAvailable:false}}});await new Promise(r=>setTimeout(r,500));return {cards:document.querySelectorAll('#chat .msg-handback').length, text:document.getElementById('chat').textContent.slice(-300), facts:document.querySelectorAll('#chat .report-facts').length, role:window.__ansRenderer.state.selectedRoleId};})()`);
 console.log(JSON.stringify(r,null,2)); fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(r,null,2)); app.exit(0);
}).catch(e=>{console.error(e);app.exit(2)});
