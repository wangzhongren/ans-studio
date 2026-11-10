// Send ONE operator-direct query to the project role session via the real desktop IPC path
// (window.desktop.sendSession), because the composer textarea is disabled after the shell operator
// confirmation timeout. Read-only query; no file writes by the role.
import fs from "node:fs";

const OUT = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3\\evidence\\operator-project-role-send.json";
const TEXT = '请调用 doc_format 工具了解文档格式：先无参数获取格式索引，再用 format="project-intent/v1"（可加 part="fields"）读取该格式说明。请原样回复你收到的回执关键内容（首行、格式 id、字段/样例要点）与调用状态。只读查询，不要写任何文件、不要修改任何状态。';
const t = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const p = t.find((x) => x.type === "page");
if (!p) { console.log("NO_PAGE"); process.exit(1); }
const ws = new WebSocket(p.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const call = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const v = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
const expr = `(async () => { const s = window.__ansRenderer.state; const target = { projectRoot: s.projectRoot, roleId: 'test-dev', runtime: 'claude' }; return await window.desktop.sendSession(${JSON.stringify(TEXT)}, [], target, { clientMessageId: 'rr3-operator-' + Date.now() }); })()`;
const res = await v(expr);
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), text: TEXT, res }, null, 2));
console.log(JSON.stringify(res).slice(0, 1200));
ws.close();
