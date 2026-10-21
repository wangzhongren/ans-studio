const { app, BrowserWindow } = require("electron");
const fs=require("fs"),path=require("path");
const REPO="/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const OUT=path.join(__dirname,"out"); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
app.setPath("userData",path.join(OUT,"user-data"));
const report={checks:[],console:[],didFail:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(n,v,d){report.checks.push({name:n,value:v===true,detail:d??null});console.log(`CHECK ${n}=${JSON.stringify(v)}${d!==undefined?" "+JSON.stringify(d):""}`)}
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1360,height:860,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:path.join(__dirname,"s0-preload.cjs")}});
 const wc=win.webContents; wc.on("console-message",(...a)=>{const e=a[0];const level=e&&typeof e==="object"&&"level"in e?e.level:a[1];const message=e&&typeof e==="object"&&"message"in e?e.message:a[2];report.console.push({level,message})}); wc.on("did-fail-load",(_e,c,d,u)=>report.didFail.push({c,d,u}));
 win.show(); win.focus(); await win.loadFile(path.join(REPO,"app/renderer/dist/src/index.html")); await sleep(500); wc.focus();
 const js=c=>wc.executeJavaScript(c,true);
 async function loadS0(){await js(`(async()=>{window.__smoke4b.setFiveRoles(true);window.__smoke4b.setHasRoles(false);await window.__ansRenderer.loadProject('/fixture4b');await new Promise(r=>setTimeout(r,400));})()`);await sleep(200);}
 await loadS0();
 const base=await js(`(()=>{const empty=document.querySelector('#chat .chat-empty');const title=empty&&empty.querySelector('.empty-title');const sub=empty&&empty.querySelector('.empty-sub');const cta=document.getElementById('btn-start-primary');const gov=document.getElementById('btn-governance-empty-action');const notice=document.getElementById('bootstrap-notice');return {hasTitle:!!title,title:title?title.textContent.trim():'',sub:sub?sub.textContent.trim():'',cta:!!cta,ctaText:cta?cta.textContent.trim():'',ctaTag:cta?cta.tagName:'',disabled:cta?cta.disabled:null,gov:!!gov,notice:!!notice,hint:document.getElementById('composer-hint').textContent,role:window.__ansRenderer.state.primaryRoleId,selected:window.__ansRenderer.state.selectedRoleId,session:window.__ansRenderer.state.sessionOpenRoleId,mentions:(document.body.textContent.match(/项目尚未 bootstrap/g)||[]).length,opens:window.__smoke4b.calls().openSession.length};})()`);
 check("BOOTSTRAP_S0_TITLE", base.title==="项目尚未 bootstrap" && base.hasTitle, base);
 check("BOOTSTRAP_S0_SUB", base.sub.includes("对话，让它把角色建出来；左树会随之长出。") && base.sub.includes(base.role), base.sub);
 check("BOOTSTRAP_S0_CTA_TEXT", base.cta===true && base.ctaTag==="BUTTON" && base.disabled===false && base.ctaText.startsWith("开始与 ") && base.ctaText.endsWith(" 对话"), base);
 check("BOOTSTRAP_S0_NO_GOVERNANCE_CTA", base.gov===false, base);
 check("BOOTSTRAP_S0_SINGLE_MENTION_NO_LEFT_NOTICE", base.mentions===1 && base.notice===false && base.hint.trim()==="", base);
 await js(`document.getElementById('btn-start-primary').click()`); await sleep(400);
 const clicked=await js(`({session:window.__ansRenderer.state.sessionOpenRoleId,opens:window.__smoke4b.calls().openSession.length,title:(document.querySelector('#chat .chat-empty .empty-title')||{}).textContent||''})`);
 check("BOOTSTRAP_S0_CTA_STARTS_SESSION", clicked.session===base.role && clicked.opens===base.opens+1, clicked);
 await loadS0();
 await js(`document.getElementById('btn-start-primary').focus()`); await sleep(200); wc.focus();
 const focus=await js(`(()=>{const c=document.getElementById('btn-start-primary');const s=getComputedStyle(c);return {active:document.activeElement===c,outlineW:s.outlineWidth,outlineColor:s.outlineColor};})()`);
 wc.sendInputEvent({type:"keyDown",keyCode:"Return"}); wc.sendInputEvent({type:"char",keyCode:"\r"}); wc.sendInputEvent({type:"keyUp",keyCode:"Return"}); await sleep(400);
 const keyed=await js(`({session:window.__ansRenderer.state.sessionOpenRoleId,opens:window.__smoke4b.calls().openSession.length})`);
 check("BOOTSTRAP_S0_CTA_KEYBOARD", focus.active===true && keyed.session===base.role, {focus,keyed,baseOpens:base.opens});
 // sizes and 200%
 const sizes=[]; for(const [w,h] of [[1360,860],[960,620]]){win.setContentSize(w,h);await sleep(250);sizes.push(await js(`(()=>{const e=document.querySelector('#chat .chat-empty'),c=document.getElementById('btn-start-primary');const r=e.getBoundingClientRect(),cr=c.getBoundingClientRect();return {w:innerWidth,h:innerHeight,empty:!!e,title:(e.querySelector('.empty-title')||{}).textContent||'',ctaVisible:cr.height>0&&cr.bottom<=innerHeight,bodyOverflow:document.body.scrollWidth-innerWidth,emptyRight:r.right<=innerWidth+1};})()`));}
 win.setContentSize(1360,860); await sleep(200); wc.setZoomFactor(2); await sleep(500); const z=await js(`(()=>{const e=document.querySelector('#chat .chat-empty'),c=document.getElementById('btn-start-primary');const r=e.getBoundingClientRect(),cr=c.getBoundingClientRect();return {w:innerWidth,h:innerHeight,empty:!!e,ctaVisible:cr.height>0&&cr.bottom<=innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,emptyRight:r.right<=innerWidth+1};})()`); wc.setZoomFactor(1);
 check("BOOTSTRAP_S0_SIZES_1360_960_200", sizes.every(s=>s.empty&&s.ctaVisible&&s.bodyOverflow<=1&&s.emptyRight) && z.empty&&z.ctaVisible&&z.overflow<=1&&z.emptyRight, {sizes,z});
 const errs=report.console.filter(e=>String(e.level)==="error"); check("BOOTSTRAP_S0_ZERO_CONSOLE",errs.length===0&&report.didFail.length===0,{errs,didFail:report.didFail});
 fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2)); const fails=report.checks.filter(c=>!c.value).length; console.log(`S0 ${fails===0?"PASS":"FAIL"} ${report.checks.length}/${fails}`); app.exit(fails===0?0:1);
}).catch(e=>{console.error(e);report.checks.push({name:"CRASH",value:false,detail:String(e)});fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2));app.exit(2)});
