#!/usr/bin/env node
/** 测试角色独立 200% 收口补充冒烟（自写，不复用桌面UI 断言）。 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs"); const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "ans-p4b-200-smoke-preload.cjs");
const OUT = path.join(__dirname, "out-200");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));
const report = { checks: [], console: [], didFail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, value, detail) { report.checks.push({ name, value: value === true, detail: detail ?? null }); console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`); }
const R3 = { version: 1, reportId: "r200", status: "completed", origin: "submitted-report", summary: { text: "200% REPORT BODY" }, source: { roleId: "A", runtime: "claude", turnId: "t200" }, evidence: [] };
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1360, height: 860, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD } });
  const wc = win.webContents;
  wc.on("console-message", (...a) => { const e = a[0]; const level = e && typeof e === "object" && "level" in e ? e.level : a[1]; const message = e && typeof e === "object" && "message" in e ? e.message : a[2]; report.console.push({ level, message }); });
  wc.on("did-fail-load", (_e, code, desc, url) => report.didFail.push({ code, desc, url }));
  await win.loadFile(ENTRY); await sleep(500);
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`(async()=>{window.__smoke4b.setFiveRoles(true);await window.__ansRenderer.loadProject('/fixture4b');await window.__ansRenderer.selectRole('liaison');await new Promise(r=>setTimeout(r,400));})()`);
  wc.setZoomFactor(2); await sleep(600);
  const metrics = await js(`(()=>{
    const left=document.querySelector('.col-left'),tree=document.getElementById('role-tree');
    const items=[...tree.querySelectorAll('.tree-item')];
    const inWin=e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;};
    left.scrollTop=Math.max(0,tree.offsetTop-30);
    const rects=items.map(e=>e.getBoundingClientRect()).filter(r=>r.height>0).sort((a,b)=>a.top-b.top);
    let overlap=0; for(let i=1;i<rects.length;i++) if(rects[i].top<rects[i-1].bottom-0.5) overlap++;
    const first=items[0],last=items[items.length-1];
    left.scrollTop=0; const firstVisible=inWin(first);
    left.scrollTop=left.scrollHeight; const lastVisible=inWin(last);
    left.scrollTop=Math.max(0,tree.offsetTop-30);
    const selectors=['#chat','.chat-head','.head-inner','#right-body','.runtime-config-notice','.governance-status','#role-tree','.col-mid','.session-notice','.composer'];
    const rows=selectors.map(sel=>{const e=document.querySelector(sel);return {sel,exists:!!e,overflow:e?e.scrollWidth-e.clientWidth:null,hidden:e?e.hidden:null};});
    const visibleRows=items.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>Math.max(tree.getBoundingClientRect().top,0)+1&&r.top<Math.min(tree.getBoundingClientRect().bottom,innerHeight)-1;}).length;
    return { treeCH:tree.clientHeight, treeSH:tree.scrollHeight, leftSH:left.scrollHeight, leftCH:left.clientHeight, count:items.length, overlap, firstVisible, lastVisible, visibleRows, rows, docOverflow:document.documentElement.scrollWidth-innerWidth, wrap:getComputedStyle(document.querySelector('.head-inner')).flexWrap };
  })()`);
  check("200PCT_TREE_VISIBLE_SCROLLABLE_NO_OVERLAP", metrics.count>=6 && metrics.treeCH>0 && metrics.treeSH>=metrics.treeCH && metrics.firstVisible && metrics.lastVisible && metrics.visibleRows>=2 && metrics.overlap===0, metrics);
  check("200PCT_CONTAINERS_NO_H_OVERFLOW", metrics.rows.every(r=>r.exists && r.overflow!==null && r.overflow<=1) && metrics.docOverflow<=1 && metrics.wrap==="wrap", metrics);
  // 缺配提示全文与按钮首屏内
  await js(`(async()=>{await window.__ansRenderer.selectRuntime('pi');await new Promise(r=>setTimeout(r,700));document.querySelector('.col-left').scrollTop=0;})()`);
  const notice = await js(`(()=>{const n=document.querySelector('.runtime-config-notice');const m=document.getElementById('runtime-config-message');const b=document.getElementById('runtime-config-settings');if(!n||n.hidden)return {visible:false};const nr=n.getBoundingClientRect(),br=b.getBoundingClientRect();return {visible:true,msgSW:m.scrollWidth,msgCW:m.clientWidth,msgSH:m.scrollHeight,msgCH:m.clientHeight,wrap:getComputedStyle(n).flexWrap,buttonBottom:br.bottom,innerHeight,buttonRight:br.right,noticeOverflow:n.scrollWidth-n.clientWidth,text:m.textContent};})()`);
  check("200PCT_CONFIG_NOTICE_FULL_TEXT_AND_BUTTON", notice.visible===true && notice.msgSW<=notice.msgCW+1 && notice.msgSH<=notice.msgCH+1 && notice.wrap==="wrap" && notice.buttonBottom<=notice.innerHeight+1 && notice.buttonRight<=1360+1 && notice.noticeOverflow<=1, notice);
  // 治理预览内部节点
  const govOpen = await js(`(async()=>{document.querySelector('#governance-status [data-governance-establish]').click();await new Promise(r=>setTimeout(r,400));const p=document.getElementById('governance-preview');p.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,150));const sels=['.gp-title','.gp-body','.gp-actions','.gp-file','.gp-declare'].map(sel=>{const e=p.querySelector(sel);return {sel,exists:!!e,overflow:e?e.scrollWidth-e.clientWidth:null,rect:e?e.getBoundingClientRect().toJSON():null};});const pr=p.getBoundingClientRect();return {open:!p.hidden,sels,panelRight:pr.right,panelLeft:pr.left,innerWidth,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,active:document.activeElement.className};})()`);
  check("200PCT_GOVERNANCE_PREVIEW_INTERNAL_NO_OVERFLOW", govOpen.open===true && govOpen.scrollWidth<=govOpen.clientWidth+1 && govOpen.sels.every(s=>s.exists && s.overflow!==null && s.overflow<=1), govOpen);
  const govCancel = await js(`(async()=>{const trigger=document.querySelector('#governance-status [data-governance-establish]');const cancel=document.querySelector('#governance-preview [data-governance-cancel]');if(cancel)cancel.click();await new Promise(r=>setTimeout(r,250));return {open:window.__ansRenderer.governance.state().open,focusBack:document.activeElement===trigger};})()`);
  check("200PCT_GOVERNANCE_CANCEL_FOCUS_BACK", govCancel.open===false && govCancel.focusBack===true, govCancel);
  // 报告展开内部节点
  await js(`(async()=>{await window.__ansRenderer.selectRuntime('claude');await new Promise(r=>setTimeout(r,500));await window.__ansRenderer.selectRole('A');await new Promise(r=>setTimeout(r,250));window.__smoke4b.emitEvent({roleId:'A',projectRoot:'/fixture4b',runtime:'claude',event:{kind:'handback',turnId:'t200',report:${JSON.stringify(R3)},reportPersistence:{state:'saved',retryAvailable:false}}});await new Promise(r=>setTimeout(r,500));})()`);
  const rep = await js(`(async()=>{const card=document.querySelector('#chat .msg-handback');if(!card)return {card:false};const btn=card.querySelector('.report-complete');if(btn&&!card.querySelector('.report-complete-body'))btn.click();await new Promise(r=>setTimeout(r,250));card.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,150));const sels=['.report-complete-body','.hb-complete-summary','.hb-evidence'].map(sel=>{const e=card.querySelector(sel);return {sel,exists:!!e,overflow:e?e.scrollWidth-e.clientWidth:null};});sels.unshift({sel:'.msg-handback',exists:true,overflow:card.scrollWidth-card.clientWidth});const r=card.getBoundingClientRect();return {card:true,sels,visible:r.height>0&&r.bottom>0&&r.top<innerHeight,innerWidth};})()`);
  check("200PCT_REPORT_DETAILS_INTERNAL_NO_OVERFLOW_VISIBLE", rep.card===true && rep.visible===true && rep.sels.every(s=>s.exists && s.overflow!==null && s.overflow<=1), rep);
  const errs = report.console.filter(e=>String(e.level)==="error");
  check("200PCT_ZERO_CONSOLE_ERRORS", errs.length===0 && report.didFail.length===0, { errs, didFail: report.didFail });
  wc.setZoomFactor(1); await sleep(200);
  fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2));
  const fails=report.checks.filter(c=>!c.value).length;
  console.log(`PHASE4B_200PCT_SUPPLEMENT ${fails===0?"PASS":"FAIL"} ${report.checks.length} checks / ${fails} failures`);
  app.exit(fails===0?0:1);
}).catch(e=>{console.error(e);report.checks.push({name:"CRASH",value:false,detail:String(e)});fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,2));app.exit(2);});
