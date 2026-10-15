// 以「人点界面」等价动作驱动 ANS Studio 发布包（CDP over WebSocket）。
// 命令：status | dom | shot <name> | import <path> | eval <file> | click <selector> | clicktext <text>
//      send <roleNeedle> <msgFile> | wait [label] [timeoutMs] | dump
import fs from "node:fs";
import path from "node:path";

const CDP = "http://127.0.0.1:9444";
const ROUND = "/private/tmp/ans-kanban-live-7ae6156b";
const SHOTS = path.join(ROUND, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(CDP + "/json")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("没找到页面目标（应用没起来？）");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("页面内异常: " + JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(SHOTS, name);
  fs.writeFileSync(p, Buffer.from(r.data, "base64"));
  console.log("[shot]", p);
}
const q = (s) => JSON.stringify(s);

const PROBE = `(() => {
  const chat = document.querySelector('#chat') || document.querySelector('.chat-pane');
  const roles = [...document.querySelectorAll('#role-tree .tree-item, .role-list .role-item, [class*=role]')].slice(0,30).map(e => e.textContent.replace(/\\s+/g,' ').trim().slice(0,80));
  const msgs = [...document.querySelectorAll('#chat .msg-assistant, .chat-pane .msg-assistant')].map(e => e.textContent.trim());
  const users = [...document.querySelectorAll('#chat .msg-user, .chat-pane .msg-user')].map(e => e.textContent.trim());
  const sys = [...document.querySelectorAll('#chat .sys, .chat-pane .sys')].slice(-12).map(e => e.className + ' :: ' + e.textContent.replace(/\\s+/g,' ').trim().slice(0, 300));
  const btns = [...document.querySelectorAll('button')].map(b => ({id:b.id||'', t:(b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40), dis:b.disabled===true})).filter(b=>b.t||b.id);
  const inputs = [...document.querySelectorAll('input,textarea')].map(i => ({id:i.id||'', cls:(i.className||'').slice(0,60), ph:i.placeholder||'', dis:i.disabled===true, type:i.type||''}));
  const cards = [...document.querySelectorAll('[class*=op-request],[class*=op-card],.fp-confirm,[class*=confirm]')].slice(-6).map(e => ({cls:e.className.slice(0,80), txt:e.textContent.replace(/\\s+/g,' ').trim().slice(0,200)}));
  return {
    title: document.title,
    bodyTextHead: document.body.innerText.replace(/\\s+/g,' ').slice(0, 600),
    state: (chat||{dataset:{}}).dataset.state || '',
    chartRole: (document.querySelector('#chat-role')||{}).textContent || '',
    roles, nUser: users.length, nAssistant: msgs.length,
    lastUser: users.length ? users[users.length-1].slice(0,300) : '',
    lastAssistant: msgs.length ? msgs[msgs.length-1].slice(0,1200) : '',
    chatLen: chat ? chat.textContent.length : 0,
    btns, inputs, sys, cards,
  };
})()`;

async function probe() { return await ev(PROBE); }

async function waitSettled(label, timeoutMs = 870000, quietMs = 9000) {
  const t0 = Date.now();
  let lastLen = -1, lastChange = Date.now();
  for (;;) {
    let p; try { p = await probe(); } catch (e) { console.log("[wait] probe 失败，重试:", String(e).slice(0,200)); await sleep(3000); continue; }
    if (p.chatLen !== lastLen) { lastLen = p.chatLen; lastChange = Date.now(); }
    const quiet = Date.now() - lastChange > quietMs;
    if (p.state !== "run" && quiet) {
      console.log(`[wait] ${label}: 结束（用时 ${Math.round((Date.now()-t0)/1000)}s, state=${p.state}）`);
      return p;
    }
    if (Date.now() - t0 > timeoutMs) { console.log(`[wait] ${label}: 超时（${Math.round(timeoutMs/1000)}s）, state=${p.state}`); return p; }
    await sleep(1500);
  }
}

const [cmd, a1, a2] = process.argv.slice(2);
const readMsg = (f) => fs.readFileSync(f, "utf8");

if (cmd === "status") {
  const p = await probe();
  console.log(JSON.stringify(p, null, 2));
} else if (cmd === "dom") {
  const r = await ev(`(() => {
    const walk = (el, depth, out) => { if (depth > 4) return out; for (const c of el.children) { out.push('  '.repeat(depth) + c.tagName + (c.id?'#'+c.id:'') + (c.className && typeof c.className === 'string' ? '.'+c.className.split(' ').filter(Boolean).slice(0,4).join('.') : '')); walk(c, depth+1, out); } return out; };
    return walk(document.body, 0, []).slice(0, 200).join('\\n');
  })()`);
  console.log(r);
} else if (cmd === "shot") {
  await shot(a1 || "shot.png");
} else if (cmd === "import") {
  const r = await ev(`window.__ansRenderer.loadProject(${q(a1)}).then(() => 'ok')`);
  console.log("[import]", r);
  await sleep(2500);
  const p = await probe();
  console.log("[import] roles:", JSON.stringify(p.roles));
  console.log("[import] bodyTextHeAd:", p.bodyTextHead.slice(0, 300));
  await shot("import-" + Date.now() + ".png");
} else if (cmd === "eval") {
  const js = fs.readFileSync(a1, "utf8");
  const r = await ev(js);
  console.log(typeof r === "string" ? r : JSON.stringify(r, null, 1));
} else if (cmd === "click") {
  const r = await ev(`(() => { const el = document.querySelector(${q(a1)}); if (!el) return {ok:false, reason:'not found'}; el.click(); return {ok:true}; })()`);
  console.log(JSON.stringify(r));
} else if (cmd === "clicktext") {
  const r = await ev(`(() => {
    const all = [...document.querySelectorAll('button, [role=button], .tree-item, .role-item, .card button')];
    const el = all.find(e => e.textContent.includes(${q(a1)}));
    if (!el) return {ok:false, reason:'no element contains text', candidates: all.slice(0,20).map(e=>e.textContent.replace(/\\s+/g,' ').trim().slice(0,40))};
    el.click(); return {ok:true, tag: el.tagName, cls: (el.className||'').toString().slice(0,80)};
  })()`);
  console.log(JSON.stringify(r));
} else if (cmd === "send") {
  const needle = a1, file = a2;
  const c = await ev(`(() => {
    const all = [...document.querySelectorAll('[class*=role] .tree-item, [class*=role-item], .tree-item, li, button')];
    const el = all.find(e => e.textContent.replace(/\\s+/g,' ').trim().startsWith(${q(needle)}) || e.textContent.includes(${q(needle + " ")}) || e.textContent.trim().startsWith(${q(needle)}));
    if (!el) return {ok:false, cand: all.slice(0,30).map(e=>e.textContent.replace(/\\s+/g,' ').trim().slice(0,30))};
    el.click(); return {ok:true, cls:(el.className||'').toString().slice(0,80)};
  })()`);
  console.log("[send] 点角色:", JSON.stringify(c));
  for (let i = 0; i < 45; i += 1) {
    const ready = await ev(`(() => { const i=document.getElementById('inp-message')||document.querySelector('.composer textarea, textarea'); const b=document.getElementById('btn-send')||document.querySelector('button[class*=send]'); return !!(i && b && !b.disabled); })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(500);
  const r = await ev(`(() => {
    const i = document.getElementById('inp-message')||document.querySelector('.composer textarea, textarea');
    if (!i) return {ok:false, reason:'no input'};
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(i, ${q(readMsg(file))});
    i.dispatchEvent(new Event('input', {bubbles:true}));
    const b = document.getElementById('btn-send')||document.querySelector('button[class*=send]');
    if (!b) return {ok:false, reason:'no send button'};
    b.click();
    return {ok:true, len:i.value.length, btn:b.id||b.className};
  })()`);
  console.log("[send] 发送:", JSON.stringify(r));
  await shot("sent-" + needle + "-" + Date.now() + ".png");
} else if (cmd === "wait") {
  const p = await waitSettled(a1 || "watch", Number(a2) || 870000);
  console.log(JSON.stringify({state: p.state, chartRole: p.chartRole, nUser: p.nUser, nAssistant: p.nAssistant, lastAssistant: p.lastAssistant, sys: p.sys, cards: p.cards}, null, 1).slice(0, 6000));
  await shot("settled-" + Date.now() + ".png");
} else if (cmd === "dump") {
  const p = await probe();
  console.log(JSON.stringify({state: p.state, chartRole: p.chartRole, nUser: p.nUser, nAssistant: p.nAssistant, lastUser: p.lastUser, lastAssistant: p.lastAssistant, sys: p.sys, cards: p.cards, chatLen: p.chatLen}, null, 1).slice(0, 8000));
} else if (cmd === "approvals") {
  const r = await ev(`(() => {
    const out = [];
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent||'').replace(/\\s+/g,' ').trim();
      if (/放行执行|拒绝执行|^拒绝$|允许/.test(t)) {
        const card = b.closest('[class*=op-request],[class*=op-card],[class*=shell],[class*=confirm]') || b.parentElement;
        out.push({btn: t, btnCls: (b.className||'').toString().slice(0,60), dis: b.disabled===true, card: card ? card.textContent.replace(/\\s+/g,' ').trim().slice(0,400) : ''});
      }
    }
    return out;
  })()`);
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
} else if (cmd === "approve") {
  const r = await ev(`(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /放行执行|允许/.test((b.textContent||'').replace(/\\s+/g,' ')) && b.disabled !== true);
    if (!btns.length) return {ok:false, reason:'没有可放行的按钮'};
    const b = btns[btns.length-1];
    const card = b.closest('[class*=op-request],[class*=op-card]') || b.parentElement;
    const txt = card ? card.textContent.replace(/\\s+/g,' ').trim().slice(0,300) : '';
    b.click();
    return {ok:true, card: txt};
  })()`);
  console.log(JSON.stringify(r, null, 1));
} else {
  console.log("用法: status | dom | shot <name> | import <path> | eval <file> | click <sel> | clicktext <t> | send <role> <file> | wait | dump");
}
ws.close();
process.exit(0);
