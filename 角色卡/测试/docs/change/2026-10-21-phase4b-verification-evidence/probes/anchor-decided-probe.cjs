const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "..", "smoke", "ans-p4b-smoke-preload.cjs");
const OUT = path.join(__dirname, "anchor-decided-out");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));
const rows = [
  { kind: "tool", text: "调用工具 request_confirmation", at: "", legacyTargetSource: "argument",
    activity: { toolName: "request_confirmation", target: "", phase: "call", status: "call", toolCallId: "conf-1" },
    requestId: "conf-1", anchorKey: "legacy-anchor-v1:x", anchor: "request" },
  { kind: "denied", text: "request_confirmation：未获同意", at: "", legacyStatusSource: "native-result",
    activity: { toolName: "request_confirmation", target: "", phase: "result", status: "failed", toolCallId: "conf-1" },
    requestId: "conf-1", anchorKey: "legacy-anchor-v1:x", anchor: "conclusion" },
];
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD } });
  await win.loadFile(ENTRY); await new Promise(r=>setTimeout(r,500));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await js(`(async()=>{await window.__ansRenderer.loadProject('/fixture4b');await window.__ansRenderer.selectRole('B');await new Promise(r=>setTimeout(r,250));})()`);
  await js(`(async()=>{window.__smoke4b.emitHistory({roleId:'B',projectRoot:'/fixture4b',runtime:'claude',rows:${JSON.stringify(rows)},reports:[]});await new Promise(r=>setTimeout(r,400));})()`);
  const before = await js(`({anchors:window.__ansRenderer.replayAnchorDebug('B'),model:window.__ansRenderer.rowModelDebug('B')})`);
  await js(`(async()=>{window.__smoke4b.emitOperatorRequest({id:'decided-fixture',roleId:'B',projectRoot:'/fixture4b',runtime:'claude',anchorKey:'legacy-anchor-v1:x',request:{kind:'confirm',title:'拒绝后原位'}});await new Promise(r=>setTimeout(r,350));})()`);
  const inserted = await js(`(()=>{const c=document.querySelector('#chat .op-request[data-request-id="decided-fixture"]');const a=window.__ansRenderer.replayAnchorDebug('B');const m=window.__ansRenderer.rowModelDebug('B');return {card:!!c,confirmHidden:c?c.querySelector('.op-confirm').hidden:null,anchors:a,model:m,text:document.getElementById('chat').textContent};})()`);
  await js(`(async()=>{const b=document.querySelector('#chat .op-request[data-request-id="decided-fixture"] .op-deny');if(b)b.click();await new Promise(r=>setTimeout(r,300));})()`);
  const denied = await js(`(()=>{const c=document.querySelector('#chat .op-request[data-request-id="decided-fixture"]');return {state:c?c.getAttribute('data-state'):null,confirmHidden:c?c.querySelector('.op-confirm').hidden:null,actionsHidden:c?c.querySelector('.op-actions').hidden:null,text:document.getElementById('chat').textContent};})()`);
  await js(`(async()=>{window.__smoke4b.emitHistory({roleId:'B',projectRoot:'/fixture4b',runtime:'claude',rows:[{kind:'assistant',text:'前插说明',at:''},...${JSON.stringify(rows)}],reports:[]});await new Promise(r=>setTimeout(r,450));})()`);
  const after = await js(`(()=>{const c=document.querySelector('#chat .op-request[data-request-id="decided-fixture"]');const a=window.__ansRenderer.replayAnchorDebug('B');const m=window.__ansRenderer.rowModelDebug('B');return {card:!!c,state:c?c.getAttribute('data-state'):null,confirmHidden:c?c.querySelector('.op-confirm').hidden:null,actionsHidden:c?c.querySelector('.op-actions').hidden:null,anchors:a,model:m,text:document.getElementById('chat').textContent};})()`);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({before,inserted,denied,after},null,2));
  console.log(JSON.stringify({before,inserted,denied,after},null,2));
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(2)});
