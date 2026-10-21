#!/usr/bin/env node
/**
 * 真机真实模型链路：开发版 + Pi（仓库 .env，测试角色不读取/打印值）+ 空项目。
 * 只发送一条不写文件的说明请求；不点击任何确认/放行。
 * usage: node model-send-cdp.mjs <port> <project> <outDir> <timeoutMs>
 */
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 9334);
const PROJECT = process.argv[3];
const OUT = process.argv[4];
const TIMEOUT = Number(process.argv[5] || 360000);
if (!PROJECT || !OUT) throw new Error("usage: node model-send-cdp.mjs <port> <project> <outdir> [timeoutMs]");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MESSAGE = "先用一段话说明你在这次空项目 bootstrap 中的计划与需要我确认的事项，不要写任何文件。";

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  } else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");
const evalJs = async (expression, awaitPromise = true) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const shot = async (file) => {
  const r = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  return file;
};
const errors = [];
function drainErrors() {
  for (const e of events) {
    if (e.method === "Runtime.exceptionThrown") errors.push({ type: "exception", text: e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text });
    else if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) errors.push({ type: "log", level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text });
    else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") errors.push({ type: "console", text: (e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ") });
  }
  events.length = 0;
}

await evalJs(`(() => {
  window.__realTest = window.__realTest || { errors: [], rejections: [], csp: [] };
  addEventListener('error', (e) => window.__realTest.errors.push(String(e.message || e.error || e)));
  addEventListener('unhandledrejection', (e) => window.__realTest.rejections.push(String(e.reason)));
  document.addEventListener('securitypolicyviolation', (e) => window.__realTest.csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
  return true;
})()`);

const result = { startedAt: new Date().toISOString(), message: MESSAGE, steps: {}, screenshots: {}, statuses: [], samples: [], errors: [] };

// 确保 Pi
result.steps.runtimeBefore = await evalJs(`(() => ({ runtime: window.__ansRenderer.state.runtime, trigger: (document.getElementById('runtime-select')?.innerText||'').trim() }))()`);
if (result.steps.runtimeBefore.runtime !== "pi") {
  result.steps.switch = await evalJs(`window.__ansRenderer.selectRuntime("pi")`);
  await sleep(800);
}
result.steps.runtimeAfter = await evalJs(`(() => ({ runtime: window.__ansRenderer.state.runtime, trigger: (document.getElementById('runtime-select')?.innerText||'').trim() }))()`);

// 点击 Lead
result.steps.clickLead = await evalJs(`(() => {
  const item = [...document.querySelectorAll('#role-tree .tree-item')].find((el) => ((el.querySelector('.ti-name')?.textContent || '').trim()) === '主理 / Lead');
  if (!item) return { ok: false };
  item.click();
  return { ok: true };
})()`);
await sleep(1200);
result.steps.leadState = await evalJs(`(() => { const s=window.__ansRenderer.state; return { selectedRoleId:s.selectedRoleId, sessionOpenRoleId:s.sessionOpenRoleId, roleBusy:s.roleBusy, runtime:s.runtime, notice:(document.getElementById('runtime-config-notice')?.innerText||'').trim() }; })()`);

// 输入并发送
result.steps.compose = await evalJs(`(() => {
  const ta = document.getElementById('inp-message');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(MESSAGE)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, value: ta.value, sendDisabled: document.getElementById('btn-send')?.disabled ?? null };
})()`);
await sleep(250);
const sendClick = await evalJs(`(() => { const b=document.getElementById('btn-send'); if (!b) return { ok:false, reason:'no send' }; if (b.disabled) return { ok:false, reason:'send disabled' }; b.click(); return { ok:true }; })()`);
const t0 = Date.now();
result.steps.send = { click: sendClick, t0: new Date(t0).toISOString(), wallMs: 0 };

let firstBusy = null;
let firstText = null;
let settled = null;
let last = null;
let confirmShot = null;
let lastSampleAt = 0;
const start = Date.now();
let shotWorking = false;
while (Date.now() - start < TIMEOUT) {
  const snap = await evalJs(`(() => {
    const s = window.__ansRenderer.state;
    const chat = document.getElementById('chat');
    const assistants = [...document.querySelectorAll('#chat .msg-assistant')];
    const lastA = assistants[assistants.length - 1];
    const item = [...document.querySelectorAll('#role-tree .tree-item')].find((el) => ((el.querySelector('.ti-name')?.textContent || '').trim()) === '主理 / Lead');
    const status = item?.querySelector('.ti-status');
    const cards = [...document.querySelectorAll('#chat [data-request-id]')].filter((el) => el.offsetParent !== null);
    return {
      busy: s.roleBusy?.liaison === true,
      sessionOpenRoleId: s.sessionOpenRoleId,
      hint: s.hint,
      statusText: (status?.textContent || '').trim(),
      statusClass: status?.className || '',
      assistantCount: assistants.length,
      assistantText: (lastA?.innerText || '').slice(0, 4000),
      assistantHtml: (lastA?.innerHTML || '').slice(0, 2000),
      chatText: (chat?.innerText || '').slice(0, 5000),
      userCount: document.querySelectorAll('#chat .msg-user').length,
      sysSettled: [...document.querySelectorAll('#chat .sys-settled')].map((e) => (e.innerText || '').trim()).slice(-3),
      confirmCards: cards.map((el) => ({ requestId: el.getAttribute('data-request-id'), text: (el.innerText || '').slice(0, 800) })),
    };
  })()`);
  last = snap;
  const now = Date.now();
  if (snap.busy && !firstBusy) {
    firstBusy = { wallMs: now - t0, statusText: snap.statusText, statusClass: snap.statusClass };
    result.statuses.push({ atMs: now - t0, event: "working", statusText: snap.statusText, statusClass: snap.statusClass });
    if (!shotWorking) {
      shotWorking = true;
      result.screenshots.working1360 = await shot(path.join(OUT, "model-working-1360.png"));
    }
  }
  if (!snap.busy && firstBusy && !settled && snap.assistantCount > 0) {
    settled = { wallMs: now - t0, statusText: snap.statusText, statusClass: snap.statusClass, assistantCount: snap.assistantCount };
    result.statuses.push({ atMs: now - t0, event: "settled/idle", statusText: snap.statusText, statusClass: snap.statusClass, assistantCount: snap.assistantCount });
  }
  if (!firstText && snap.assistantCount > 0 && snap.assistantText && snap.assistantText.trim() !== "") {
    firstText = { wallMs: now - t0, length: snap.assistantText.length, text: snap.assistantText.slice(0, 500) };
    result.statuses.push({ atMs: now - t0, event: "first-assistant-text", length: snap.assistantText.length });
  }
  if (snap.confirmCards.length > 0 && !confirmShot) {
    confirmShot = await shot(path.join(OUT, "model-confirm-card.png"));
    result.screenshots.confirm = confirmShot;
    result.statuses.push({ atMs: now - t0, event: "confirmation-card-visible", count: snap.confirmCards.length });
  }
  if (now - lastSampleAt >= 10000) {
    lastSampleAt = now;
    result.samples.push({ atMs: now - t0, busy: snap.busy, statusText: snap.statusText, assistantCount: snap.assistantCount, textLen: snap.assistantText.length, confirmCards: snap.confirmCards.length });
  }
  if (settled) break;
  await sleep(400);
}
result.steps.result = {
  elapsedMs: Date.now() - t0,
  firstBusy,
  firstText,
  settled,
  timedOut: !settled,
};
result.steps.final = last;
result.screenshots.final1360 = await shot(path.join(OUT, "model-final-1360.png"));
// 960 真实窗口 resize
await evalJs(`window.resizeTo(960, 800)`);
await sleep(700);
result.steps.final960Size = await evalJs(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);
result.screenshots.final960 = await shot(path.join(OUT, "model-final-960.png"));
await evalJs(`window.resizeTo(1360, 860)`);
await sleep(500);
drainErrors();
result.errors = errors;
result.pageErrors = await evalJs(`window.__realTest || null`);
result.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "model-run.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  ok: !!settled && !result.steps.result.timedOut,
  out: path.join(OUT, "model-run.json"),
  elapsedMs: result.steps.result.elapsedMs,
  firstBusyMs: firstBusy?.wallMs ?? null,
  firstTextMs: firstText?.wallMs ?? null,
  settledMs: settled?.wallMs ?? null,
  assistantCount: last?.assistantCount ?? 0,
  assistantTextLen: last?.assistantText?.length ?? 0,
  confirmCards: last?.confirmCards?.length ?? 0,
  errors: errors.length,
}, null, 2));
ws.close();
