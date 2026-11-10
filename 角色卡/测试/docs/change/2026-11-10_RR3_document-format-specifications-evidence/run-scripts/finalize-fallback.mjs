// RR3 fallback evidence copy + (if app still up) orderly shutdown.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3";
const EVID = path.join(RUN, "evidence");
const TARGET = path.join(RUN, "target");
const USERDATA = path.join(RUN, "userData");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cp = (src, dst) => { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch {} };

cp(path.join(TARGET, ".ans/state/tasks.jsonl"), path.join(EVID, "tasks-final.jsonl"));
cp(path.join(TARGET, ".ans/state/versions.jsonl"), path.join(EVID, "versions-final.jsonl"));
const intent = path.join(TARGET, "docs/product/jinyong-rogue-2d-intent-v4.md");
if (exists(intent)) { fs.mkdirSync(path.join(EVID, "product"), { recursive: true }); cp(intent, path.join(EVID, "product", path.basename(intent))); }
const diagDir = path.join(USERDATA, "ans", "diagnostics");
if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(diagDir)) cp(path.join(diagDir, f), path.join(d, f)); }
const sessionsDir = path.join(TARGET, ".ans/sessions");
if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch {} }
const drive = readJsonl(path.join(EVID, "drive.jsonl")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const summary = {
  round: "RR3", generatedAt: new Date().toISOString(),
  stop: drive.find((r) => r.type === "monitor.stop") ?? null,
  sessionsOpened: drive.filter((r) => r.type === "role.open").map((r) => ({ roleId: r.roleId, result: r.result })),
  docFormat: drive.filter((r) => String(r.type).startsWith("doc_format.")),
  intentDocs: drive.filter((r) => r.type === "intent.doc"),
  dialogs: drive.filter((r) => r.type === "dialog.seen"),
  dispatches: drive.filter((r) => r.type === "task.row" && ["task.created", "task.reported", "project.note"].includes(r.kind)),
  promptSnapshots: drive.filter((r) => r.type === "prompt.snapshot").map((r) => ({ role: r.role, systemPromptBytes: r.systemPromptBytes, hasDocFormatGuideline: r.hasDocFormatGuideline, systemPromptSha256: r.systemPromptSha256 })),
  operator: drive.filter((r) => String(r.type).startsWith("operator.")),
  customerMessageSentAt: drive.find((r) => r.type === "compose.sent" && r.label === "customer")?.mark ?? null,
};
fs.writeFileSync(path.join(EVID, "round3-summary.json"), JSON.stringify(summary, null, 2));

let page = null;
for (let i = 0; i < 12; i++) { try { const t = await fetch("http://127.0.0.1:9223/json", { signal: AbortSignal.timeout(1200) }).then((r) => r.json()); page = t.find((x) => x.type === "page"); if (page) break; } catch {} await sleep(400); }
if (page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl); let seq = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const call = (method, params) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const value = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  try {
    const shot = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
    if (shot.result?.data) fs.writeFileSync(path.join(EVID, "ui-99-final.jpeg"), Buffer.from(shot.result.data, "base64"));
    fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), (await value("document.body.innerText")) ?? "");
    const halt = await value(`(() => { const b = document.getElementById('btn-halt'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => "error");
    await sleep(800);
    const stop = await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null);
    console.log(JSON.stringify({ halt, stop }));
    call("Browser.close", {}).catch(() => {});
    await sleep(1500);
  } catch (e) { console.error("CLOSE_ERROR", e); }
  try { ws.close(); } catch {}
}
console.log(JSON.stringify(summary, null, 2).slice(0, 3000));
