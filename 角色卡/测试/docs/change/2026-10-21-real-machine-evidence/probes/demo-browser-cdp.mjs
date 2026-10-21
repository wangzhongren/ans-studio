#!/usr/bin/env node
/**
 * 独立真机浏览器核对 Todo demo：零依赖静态服务器 + 系统 Chrome headless CDP。
 * usage: node demo-browser-cdp.mjs <demoRoot> <outDir>
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
if (!fs.existsSync(path.join(ROOT, "index.html"))) throw new Error("demo root missing index.html");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".md": "text/plain; charset=utf-8" };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const abs = path.resolve(ROOT, "." + rel);
    if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) { res.writeHead(403); res.end("forbidden"); return; }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(abs).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const URL0 = `http://127.0.0.1:${PORT}/`;

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = fs.mkdtempSync("/tmp/ans-demo-chrome-");
const CDP_PORT = 9444;
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--hide-scrollbars", "--window-size=1360,860", `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${CDP_PORT}`, URL0,
], { stdio: ["ignore", "pipe", "pipe"] });
let chromeLog = "";
chrome.stdout.on("data", (d) => { chromeLog += d.toString(); });
chrome.stderr.on("data", (d) => { chromeLog += d.toString(); });

async function targets() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const j = await r.json();
      if (Array.isArray(j) && j.length) return j;
    } catch {}
    await sleep(200);
  }
  throw new Error("chrome CDP not ready\n" + chromeLog);
}
const list = await targets();
const page = list.find((t) => t.type === "page") || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable"); await send("Network.enable");
const evalJs = async (expression, awaitPromise = true) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const waitFor = async (expr, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evalJs(expr)) return true; } catch {}
    await sleep(150);
  }
  return false;
};
const shot = async (file) => { const r = await send("Page.captureScreenshot", { format: "png", fromSurface: true }); fs.writeFileSync(file, Buffer.from(r.data, "base64")); return file; };
const errors = [];
function drain() {
  for (const e of events) {
    if (e.method === "Runtime.exceptionThrown") errors.push({ type: "exception", text: e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text });
    else if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) errors.push({ type: "log", level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text });
    else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") errors.push({ type: "console", text: (e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ") });
  }
  events.length = 0;
}

const report = { startedAt: new Date().toISOString(), url: URL0, demoRoot: ROOT, screenshots: {}, steps: {}, errors: [] };
await waitFor(`document.readyState === 'complete' && document.querySelector('#todo-panel')?.dataset.state === 'empty'`, 15000);
report.steps.initial = await evalJs(`(() => ({ title: document.title, state: document.querySelector('#todo-panel')?.dataset.state, emptyHidden: document.querySelector('#empty-state')?.hidden, listCount: document.querySelectorAll('.todo-item').length, summary: document.querySelector('#list-summary')?.textContent, inputDisabled: document.querySelector('#new-todo')?.disabled }))()`);
report.screenshots.empty1360 = await shot(path.join(OUT, "empty-1360.png"));

async function add(title) {
  return evalJs(`(() => { const i=document.querySelector('#new-todo'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(title)}); i.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#new-todo-form').requestSubmit(); return i.value; })()`);
}
await add("买牛奶");
await waitFor(`document.querySelectorAll('.todo-item').length === 1`);
await add("写测试");
await waitFor(`document.querySelectorAll('.todo-item').length === 2`);
report.steps.afterAdd = await evalJs(`(() => ({ count: document.querySelectorAll('.todo-item').length, titles: [...document.querySelectorAll('.todo-title')].map(e=>e.textContent), summary: document.querySelector('#list-summary')?.textContent, state: document.querySelector('#todo-panel')?.dataset.state }))()`);
// toggle first
await evalJs(`document.querySelector('.todo-item .todo-checkbox').click()`);
await waitFor(`document.querySelector('.todo-item')?.dataset.done === 'true'`);
report.steps.afterToggle = await evalJs(`(() => ({ count: document.querySelectorAll('.todo-item').length, done: [...document.querySelectorAll('.todo-item')].map(e=>e.dataset.done === 'true'), notice: document.querySelector('#notice')?.textContent, summary: document.querySelector('#list-summary')?.textContent }))()`);
report.screenshots.ready1360 = await shot(path.join(OUT, "ready-1360.png"));
// reload persistence
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelectorAll('.todo-item').length === 2`, 15000);
report.steps.afterReload = await evalJs(`(() => ({ count: document.querySelectorAll('.todo-item').length, titles: [...document.querySelectorAll('.todo-title')].map(e=>e.textContent), done: [...document.querySelectorAll('.todo-item')].map(e=>e.dataset.done === 'true'), stored: localStorage.getItem('todo.spa.state') }))()`);
report.screenshots.reload1360 = await shot(path.join(OUT, "reload-1360.png"));
// delete second
await evalJs(`[...document.querySelectorAll('.todo-item')].find(e=>e.querySelector('.todo-title')?.textContent==='写测试')?.querySelector('.todo-remove')?.click()`);
await waitFor(`document.querySelectorAll('.todo-item').length === 1`);
report.steps.afterDelete = await evalJs(`(() => ({ count: document.querySelectorAll('.todo-item').length, titles: [...document.querySelectorAll('.todo-title')].map(e=>e.textContent), notice: document.querySelector('#notice')?.textContent }))()`);
// invalid empty
await evalJs(`(() => { const i=document.querySelector('#new-todo'); i.value='   '; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#new-todo-form').requestSubmit(); return true; })()`);
await sleep(300);
report.steps.invalidEmpty = await evalJs(`(() => ({ notice: document.querySelector('#notice')?.textContent, tone: document.querySelector('#notice')?.dataset.tone, ariaInvalid: document.querySelector('#new-todo')?.getAttribute('aria-invalid'), count: document.querySelectorAll('.todo-item').length }))()`);
report.screenshots.invalid = await shot(path.join(OUT, "invalid-empty.png"));
// corrupt
await evalJs(`localStorage.setItem('todo.spa.state', '{broken'); true`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector('#error-banner') && !document.querySelector('#error-banner').hidden`, 15000);
report.steps.corrupt = await evalJs(`(() => ({ error: document.querySelector('#error-banner')?.textContent, state: document.querySelector('#todo-panel')?.dataset.state, count: document.querySelectorAll('.todo-item').length, keys: [...Array(localStorage.length)].map((_,i)=>localStorage.key(i)) }))()`);
report.screenshots.corrupt = await shot(path.join(OUT, "corrupt-1360.png"));
// schema too new
await evalJs(`localStorage.setItem('todo.spa.state', JSON.stringify({schemaVersion:999,todos:[]})); true`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector('#new-todo')?.disabled === true`, 15000);
report.steps.readOnly = await evalJs(`(() => ({ error: document.querySelector('#error-banner')?.textContent, inputDisabled: document.querySelector('#new-todo')?.disabled, submitDisabled: document.querySelector('#new-todo-submit')?.disabled, state: document.querySelector('#todo-panel')?.dataset.state, stored: localStorage.getItem('todo.spa.state') }))()`);
report.screenshots.readOnly = await shot(path.join(OUT, "readonly-1360.png"));
// 320px fresh ready
await evalJs(`localStorage.removeItem('todo.spa.state'); true`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector('#todo-panel')?.dataset.state === 'empty'`, 15000);
await add("窄屏条目");
await waitFor(`document.querySelectorAll('.todo-item').length === 1`);
await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(500);
report.steps.narrow = await evalJs(`(() => ({ innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, listCount: document.querySelectorAll('.todo-item').length }))()`);
report.screenshots.narrow320 = await shot(path.join(OUT, "ready-320.png"));
await send("Emulation.clearDeviceMetricsOverride");
drain();
report.errors = errors;
report.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "browser-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: errors.length === 0, out: path.join(OUT, "browser-report.json"), steps: report.steps, errors: errors.length }, null, 2));
ws.close();
chrome.kill("SIGTERM");
server.close();
setTimeout(() => process.exit(0), 500);
