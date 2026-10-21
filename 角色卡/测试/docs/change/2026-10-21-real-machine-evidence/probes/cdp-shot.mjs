#!/usr/bin/env node
// usage: node cdp-shot.mjs <port> <outfile> [width] [height]
import fs from "node:fs";
const [port, outfile, w, h] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
if (w && h) {
  await send("Runtime.evaluate", { expression: `window.resizeTo(${Number(w)}, ${Number(h)})`, returnByValue: true });
  await new Promise((r) => setTimeout(r, 700));
}
const r = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
fs.writeFileSync(outfile, Buffer.from(r.data, "base64"));
console.log(JSON.stringify({ out: outfile, bytes: fs.statSync(outfile).size }));
ws.close();
