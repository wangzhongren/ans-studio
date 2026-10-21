#!/usr/bin/env node
// usage: node cdp-eval.mjs <port> <expression-file-or-string>
import fs from "node:fs";
const port = process.argv[2] || "9333";
const expr = process.argv[3]?.startsWith("@") ? fs.readFileSync(process.argv[3].slice(1), "utf8") : process.argv[3];
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
if (r.exceptionDetails) { console.error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); process.exit(1); }
console.log(JSON.stringify(r.result?.value, null, 2));
ws.close();
