// RR judge-delegated effectiveness driver (outside repo): real Electron dev app (worktree app/main.ts) via CDP 9223.
// MODE=judge-on : toggle "替我决策" ON  -> chief issues intent-confirm -> judge auto-approves -> R9 baseline freeze must be judge-delegated.
// MODE=judge-off: toggle OFF           -> chief issues intent-confirm -> real decision dialog presented to customer ->
//                 driver acts as the customer (ack + confirm + submit) -> customer freeze must be written.
// Budget: ONE customer message per leg, <=1 intent-confirm card per leg; halt at the first decisive evidence.
// Writes ONLY under the run root (outside the repo).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const RR = "C:\\Users\\51054\\Desktop\\work\\ans-judge-delegated-run-2026-11-09";
const MODE = process.env.RR_MODE === "judge-off" ? "judge-off" : "judge-on";
const LEG = MODE === "judge-off" ? "judge-off" : "judge-on";
const EVID = path.join(RR, "evidence", LEG);
const TARGET = path.win32.normalize(process.env.RR_TARGET || path.join(RR, MODE === "judge-off" ? "target2" : "target"));
const USERDATA = path.win32.normalize(process.env.ANS_RR_USERDATA || path.join(RR, MODE === "judge-off" ? "userData2" : "userData"));
const PORT = 9223;
const FLOW_ID = MODE === "judge-off" ? "judge-demo2" : "judge-demo";
const DEADLINE_MS = 10 * 60 * 1000; // send -> hard stop (whole leg stays well under 20 min)
fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(path.join(EVID, "snapshots"), { recursive: true });
fs.mkdirSync(path.join(EVID, "live"), { recursive: true });

const CUSTOMER_MESSAGE = `请执行一个很小的验证步骤。本条消息是唯一指令：不要运行 shell；不要写入任何文件（意图文档已存在，不要改）；不要发其它卡；每一步如实回报。

请调用 request_choice 向客户发出需求确认卡，参数如下：
- title: 确认「${FLOW_ID}」需求意图（v1）
- cardKind: intent-confirm
- flowId: ${FLOW_ID}
- question: 是否确认该产品意图（目标/范围/验收标准/非目标与约束）？
- options: [{"id":"confirm","label":"确认意图，进入提案阶段"},{"id":"revise","label":"需要修改（请在卡片反馈中说明）"}]

不要调用其它工具；出卡后据实报告工具回执并结束回合。`;
fs.writeFileSync(path.join(EVID, "customer-message.txt"), CUSTOMER_MESSAGE);

const logPath = path.join(EVID, "drive.jsonl");
const redact = (text) => String(text)
  .replace(/(ANTHROPIC_[A-Z_]*\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
  .replace(/(api[_-]?key\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
const log = (type, data) => {
  const row = { ts: new Date().toISOString(), type, ...(data && typeof data === "object" ? data : { data }) };
  try { fs.appendFileSync(logPath, redact(JSON.stringify(row)) + "\n"); } catch (e) { console.error("log error", e); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJsonl = (file) => { try { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

const startMark = new Date().toISOString();
const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const versionsPath = path.join(TARGET, ".ans/state/versions.jsonl");
const diagDir = path.join(USERDATA, "ans", "diagnostics");
const snapshotsDir = path.join(TARGET, ".ans/trunk/snapshots");
const sessionsDir = path.join(TARGET, ".ans/sessions");
const runsDir = path.join(TARGET, ".ans/runs");

// ---------- CDP connection ----------
let page = null;
for (let i = 0; i < 240; i++) {
  try { const targets = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json()); page = targets.find((x) => x.type === "page"); if (page) break; } catch {}
  await sleep(500);
}
if (!page) { log("run.error", { error: "no cdp page", port: PORT }); console.log("NO_CDP"); process.exit(1); }
log("cdp.page", { url: page.url, title: page.title, id: page.id, port: PORT });
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pendingCalls = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pendingCalls.has(m.id)) { pendingCalls.get(m.id)(m); pendingCalls.delete(m.id); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const call = (method, params) => new Promise((r) => { const id = ++seq; pendingCalls.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const rawValue = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  return r.result?.result?.value;
};
const value = async (expr, timeoutMs = 15000) => Promise.race([
  rawValue(expr),
  new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate-timeout")), timeoutMs)),
]);
const shot = async (name) => {
  try {
    const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
    if (!r.result?.data) return null;
    const file = path.join(EVID, name);
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    log("screenshot", { file: name, bytes: fs.statSync(file).size });
    return name;
  } catch (e) { log("screenshot.error", { file: name, error: String(e) }); return null; }
};
const bodyText = async () => value("document.body.innerText").catch(() => "");
const clickExpr = (id) => `(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) return 'missing'; b.click(); return 'clicked'; })()`;

// ---------- state ----------
const initialSnapshots = new Set(exists(snapshotsDir) ? fs.readdirSync(snapshotsDir) : []);
const initialVersions = new Set(readJsonl(versionsPath));
const initialTasks = new Set(readJsonl(tasksPath));
const seenDiagLines = new Set();
const summary = {
  leg: LEG, startedUtc: startMark, target: TARGET, userData: USERDATA, port: PORT, flowId: FLOW_ID,
  customerMessage: CUSTOMER_MESSAGE, steps: [], toggle: null, requestRows: [], diagnostics: [],
  dialogs: [], dialogActions: [], newSnapshots: [], freezeRow: null, resolvedRow: null,
  judgeEvents: [], freezeCommittedDiag: null, freezePendingDiag: null, stop: null, error: null,
};
const budget = { customerMessages: 0, intentConfirmCards: 0, modelTurnsByRole: {}, wallClock: null };
let msgMark = null;
let cardRequestId = null;
let resolvedRaw = null;
let freezeRaw = null;
let stopCause = "deadline";
let halted = false;
let dialogHandled = false;
let judgeStartedAt = null;
let freezeSeenAt = 0;
let lastProgressAt = Date.now();

const toggleStateExpr = `(() => { const d=document.getElementById('judge-decision-toggle'); return d ? { checked:d.checked, disabled:d.disabled } : { missing:true }; })()`;

function countTurns() {
  const out = {};
  if (!msgMark || !exists(sessionsDir)) return out;
  for (const role of fs.readdirSync(sessionsDir)) {
    const replay = path.join(sessionsDir, role, "claude", "ans", "replay.jsonl");
    if (!exists(replay)) continue;
    for (const line of readJsonl(replay)) {
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || j.kind !== "event" || j.event?.kind !== "settled") continue;
      if (!j.at || j.at < msgMark) continue;
      out[role] = (out[role] ?? 0) + 1;
    }
  }
  return out;
}

async function captureSnapshot(name) {
  const p = path.join(snapshotsDir, name);
  let st; try { st = fs.statSync(p); } catch { return null; }
  const bytes = fs.readFileSync(p);
  let parsed = null; try { parsed = JSON.parse(bytes.toString("utf8")); } catch {}
  const meta = { name, bytes: st.size, sha256: sha256(bytes), schema: parsed?.schema, digest: parsed?.digest, snapshotId: parsed?.snapshotId, files: Array.isArray(parsed?.files) ? parsed.files.length : null };
  try { fs.copyFileSync(p, path.join(EVID, "snapshots", name)); fs.writeFileSync(path.join(EVID, "snapshots", name + ".meta.json"), JSON.stringify(meta, null, 2)); } catch {}
  const verification = { name, schema: meta.schema, snapshotId: meta.snapshotId, digest: meta.digest, files: [] };
  for (const f of Array.isArray(parsed?.files) ? parsed.files : []) {
    const rel = typeof f?.path === "string" ? f.path : null;
    const emb = typeof f?.bytesBase64 === "string" ? Buffer.from(f.bytesBase64, "base64") : null;
    const row = { path: rel, embeddedBytes: emb ? emb.length : null, embeddedSha256: emb ? sha256(emb) : null, targetExists: false, targetSha256: null, byteIdentical: null };
    if (rel) {
      const p2 = path.join(TARGET, rel);
      if (exists(p2)) { const tb = fs.readFileSync(p2); row.targetExists = true; row.targetSha256 = sha256(tb); row.byteIdentical = emb ? (Buffer.compare(emb, tb) === 0) : null; }
    }
    verification.files.push(row);
  }
  fs.writeFileSync(path.join(EVID, "snapshots", name + ".verification.json"), JSON.stringify(verification, null, 2));
  summary.newSnapshots.push(meta);
  log("snapshot.new", meta);
  return meta;
}

async function handleOffDialog(dlg) {
  dialogHandled = true;
  const pre = { at: new Date().toISOString(), requestId: dlg.requestId, title: dlg.title, question: dlg.question, options: dlg.opts, labels: dlg.labels, acks: dlg.acks, submitDisabled: dlg.submitDisabled, confirmDisabled: dlg.confirmDisabled, error: dlg.error, judgeNotice: dlg.judgeNotice };
  fs.writeFileSync(path.join(EVID, "dialog-pre.json"), JSON.stringify({ ...pre, bodyTail: dlg.bodyTail }, null, 2));
  summary.dialogs.push(pre);
  log("dialog.seen", pre);
  await shot("ui-05-dialog-pre.jpeg");
  const result = await value(`(() => {
    const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
    for (const a of d.querySelectorAll('.dd-ack input')) { if (!a.checked) a.click(); }
    const opts = Array.from(d.querySelectorAll('.dd-options input'));
    const target = opts.find((i) => i.value === 'confirm') || opts[0];
    if (target && !target.checked) target.click();
    const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm');
    if (sub && !sub.disabled) { sub.click(); return { result: 'submitted', selected: target ? target.value : null, kind: 'choice' }; }
    if (conf && !conf.disabled) { conf.click(); return { result: 'confirmed', kind: 'confirm' }; }
    return { result: 'no-action', submitDisabled: sub ? sub.disabled : null, confirmDisabled: conf ? conf.disabled : null };
  })()`).catch((e) => ({ result: "error", error: String(e) }));
  summary.dialogActions.push({ step: "customer-submit", result, at: new Date().toISOString() });
  log("dialog.submit", result);
  await sleep(1500);
  const post = await value(`(() => { const d=document.getElementById('decision-dialog'); if(!d) return { open:false }; const e=d.querySelector('.dd-error'); return { open:true, error: e?e.textContent:null }; })()`).catch(() => null);
  summary.dialogActions.push({ step: "after-submit", post, at: new Date().toISOString() });
  log("dialog.after-submit", post);
  await shot("ui-06-dialog-after-submit.jpeg");
}

async function finalize() {
  summary.stop = {
    stopCause, at: new Date().toISOString(), cardRequestId, msgMark,
    resolved: resolvedRaw ? JSON.parse(resolvedRaw) : null,
    freeze: freezeRaw ? JSON.parse(freezeRaw) : null,
    toggle: summary.toggle, judgeEvents: summary.judgeEvents,
    freezeCommittedDiag: summary.freezeCommittedDiag, freezePendingDiag: summary.freezePendingDiag,
  };
  summary.budget = { ...budget, modelTurnsByRole: countTurns(), wallClockSec: Math.round((Date.now() - Date.parse(startMark)) / 1000) };
  log("monitor.stop", summary.stop);
  fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), await bodyText().catch(() => ""));
  await shot("ui-99-final.jpeg");
  try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch (e) { log("capture.tasks.error", { error: String(e) }); }
  try { fs.copyFileSync(versionsPath, path.join(EVID, "versions-final.jsonl")); } catch (e) { log("capture.versions.error", { error: String(e) }); }
  if (exists(diagDir)) {
    const diagOut = path.join(EVID, "diagnostics");
    fs.mkdirSync(diagOut, { recursive: true });
    for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(diagOut, f)); } catch {} }
  }
  if (exists(runsDir)) {
    const runsOut = path.join(EVID, "runs");
    for (const name of fs.readdirSync(runsDir)) {
      const mp = path.join(runsDir, name, "manifest.json");
      if (!exists(mp)) continue;
      fs.mkdirSync(path.join(runsOut, name), { recursive: true });
      try { fs.copyFileSync(mp, path.join(runsOut, name, "manifest.json")); } catch {}
    }
  }
  if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch (e) { log("capture.sessions.error", { error: String(e) }); } }
  fs.writeFileSync(path.join(EVID, "request-rows.jsonl"), summary.requestRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(EVID, "budget.json"), JSON.stringify(summary.budget, null, 2));
  // halt the app through its own controls, then close the browser target
  try { await value(clickExpr("btn-halt")).catch(() => null); } catch {}
  await sleep(1000);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1500);
  try { await call("Browser.close", {}); } catch (e) { log("browser.close.error", { error: String(e) }); }
  halted = true;
  console.log(JSON.stringify({ leg: LEG, stopCause, cardRequestId, resolvedBy: summary.stop.resolved?.by ?? null, freezeOrigin: summary.stop.freeze?.freeze?.origin ?? null, budget: summary.budget }));
  try { ws.close(); } catch {}
  process.exit(0);
}

try {
  // 0) window ready
  for (let i = 0; i < 240; i++) {
    const ready = await value("typeof window.desktop === 'object' && document.readyState !== 'loading'").catch(() => false);
    if (ready) break;
    await sleep(500);
  }
  log("window.ready", { title: await value("document.title").catch(() => null) });
  await shot("ui-00-launch.jpeg");

  // 1) import the target through the real UI + native folder dialog
  const importClick = await value(clickExpr("btn-import")).catch(() => "error");
  log("import.click", { importClick });
  summary.steps.push({ step: "import-click", importClick, at: new Date().toISOString() });
  if (importClick !== "clicked") { stopCause = "import-click-failed"; await finalize(); }
  let psOut = "";
  try {
    psOut = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(RR, "rr", "select-folder-auto.ps1"), "-Path", TARGET], { encoding: "utf8", timeout: 30000 });
  } catch (e) { psOut = "PS_ERROR " + String(e.stdout || e.message); }
  log("import.dialog", { psOut: psOut.trim() });
  await sleep(4000);
  await shot("ui-01-imported.jpeg");
  fs.writeFileSync(path.join(EVID, "ui-01-imported-body.txt"), await bodyText());

  // 2) start the chief conversation
  let startClick = "missing";
  for (let i = 0; i < 120; i++) {
    startClick = await value(clickExpr("btn-start-primary")).catch(() => "error");
    if (startClick === "clicked") break;
    await sleep(1000);
  }
  log("start.click", { startClick });
  summary.steps.push({ step: "start-click", startClick, at: new Date().toISOString() });

  // 3) wait for the real session-open-ready diagnostic (chief, claude)
  let sessionReady = false;
  let sessionFailText = null;
  const sessionStartAt = new Date().toISOString();
  for (let i = 0; i < 240; i++) {
    try {
      outer: for (const name of exists(diagDir) ? fs.readdirSync(diagDir) : []) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          let j = null; try { j = JSON.parse(line); } catch {}
          if (j && j.event === "session.open.ready" && j.roleId === "chief" && j.at && j.at >= sessionStartAt) { sessionReady = true; log("session.ready.diag", { roleId: j.roleId, runtime: j.runtime ?? null, at: j.at }); break outer; }
        }
      }
    } catch {}
    if (sessionReady) break;
    sessionFailText = await value(`(() => { const t = document.body.innerText; const m = t.match(/开启会话失败[^\\n]*/); return m ? m[0] : null; })()`).catch(() => null);
    if (sessionFailText) break;
    await sleep(1000);
  }
  log("session.ready", { sessionReady, sessionFailText, startClick });
  summary.steps.push({ step: "session-ready", sessionReady, sessionFailText, at: new Date().toISOString() });
  if (!sessionReady) { stopCause = "session-open-failed"; await finalize(); }
  await shot("ui-02-session-ready.jpeg");

  // 4) toggle state: ON for judge-on; keep/verify OFF for judge-off
  let toggleState = null;
  for (let i = 0; i < 30; i++) {
    toggleState = await value(toggleStateExpr).catch(() => null);
    if (toggleState?.missing) { await sleep(1000); continue; }
    const want = MODE === "judge-on";
    if (toggleState.checked === want) break;
    if (toggleState.disabled === false) { await value(clickExpr("judge-decision-toggle")).catch(() => null); await sleep(900); }
    else break;
  }
  toggleState = await value(toggleStateExpr).catch(() => null);
  const toggleOk = MODE === "judge-on" ? toggleState?.checked === true : toggleState?.checked === false;
  summary.toggle = { mode: MODE, state: toggleState, ok: toggleOk };
  log("judge.toggle", summary.toggle);
  summary.steps.push({ step: "judge-toggle", toggleOk, at: new Date().toISOString() });
  if (!toggleOk) { stopCause = "toggle-state-failed"; await finalize(); }
  await shot("ui-03-toggle.jpeg");

  // 5) send the single customer message
  await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return 'missing'; ta.focus(); return document.activeElement === ta; })()`);
  try { await call("Input.insertText", { text: CUSTOMER_MESSAGE }); } catch (e) { log("compose.insertText.error", { error: String(e) }); }
  let current = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  if (current !== CUSTOMER_MESSAGE) {
    await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false;
      const proto = Object.getPrototypeOf(ta); const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(CUSTOMER_MESSAGE)}); else ta.value = ${JSON.stringify(CUSTOMER_MESSAGE)};
      ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  }
  msgMark = new Date().toISOString();
  budget.customerMessages = 1;
  await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false;
    ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); return true; })()`);
  await sleep(1500);
  let afterSend = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  if (afterSend !== "") {
    await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false;
      ta.focus(); const o = { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true };
      ta.dispatchEvent(new KeyboardEvent('keydown', o)); ta.dispatchEvent(new KeyboardEvent('keyup', o)); return true; })()`);
    await sleep(1500);
    afterSend = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  }
  const sendOk = afterSend === "";
  log("compose.sent", { cleared: sendOk });
  summary.steps.push({ step: "message-sent", cleared: sendOk, at: new Date().toISOString() });
  if (!sendOk) { stopCause = "send-failed"; await finalize(); }
  lastProgressAt = Date.now();
  const monitorStart = Date.now();

  // 6) monitor: ledger + diagnostics + snapshots + dialog + freeze row
  while (true) {
    const now = Date.now();
    if (now - monitorStart > DEADLINE_MS) { stopCause = "deadline-10min"; break; }
    if (stopCause !== "deadline") break;

    // 6a) tasks ledger
    for (const line of readJsonl(tasksPath)) {
      if (initialTasks.has(line)) continue;
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || !j.at || j.at < startMark) continue;
      lastProgressAt = Date.now();
      const isNew = !summary.requestRows.some((r) => r.raw === line);
      if (!isNew) continue;
      const row = { kind: j.kind, at: j.at, raw: line, requestId: j.requestId, taskId: j.taskId, from: j.from, to: j.to, cardKind: j.cardKind, flowId: j.flowId, choice: j.choice, by: j.by, operatorId: j.operatorId, selectedOptionIds: j.selectedOptionIds, decisionId: j.decisionId, judge: j.judge };
      summary.requestRows.push(row);
      log("task.row", { kind: j.kind, at: j.at, requestId: j.requestId, cardKind: j.cardKind, by: j.by, to: j.to, choice: j.choice });
      if (j.kind === "request.created") {
        if (j.cardKind === "intent-confirm" && cardRequestId === null) {
          cardRequestId = j.requestId;
          budget.intentConfirmCards += 1;
          await shot("ui-04-card-created.jpeg");
        } else if (cardRequestId !== null && j.requestId !== cardRequestId) {
          summary.steps.push({ step: "unexpected-extra-card", requestId: j.requestId, cardKind: j.cardKind, at: j.at });
          stopCause = "unexpected-extra-card";
        }
      }
      if (j.kind === "request.presented" && j.requestId === cardRequestId) {
        log("card.presented", { to: j.to, at: j.at });
      }
      if (j.kind === "request.resolved" && j.requestId === cardRequestId) {
        resolvedRaw = line;
        summary.resolvedRow = { at: j.at, by: j.by, operatorId: j.operatorId, choice: j.choice, selectedOptionIds: j.selectedOptionIds, decisionId: j.decisionId, judgeEngine: j.judge?.engine ?? null, judgeReasonCode: j.judge?.reasonCode ?? null, judgeModel: j.judge?.model ?? null };
        log("card.resolved", summary.resolvedRow);
        await shot("ui-07-card-resolved.jpeg");
      }
    }

    // 6b) diagnostics
    try {
      for (const name of exists(diagDir) ? fs.readdirSync(diagDir) : []) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          if (seenDiagLines.has(line)) continue;
          seenDiagLines.add(line);
          let j = null; try { j = JSON.parse(line); } catch {}
          if (!j || !j.at || j.at < startMark) continue;
          const ev = j.event || j.kind || "?";
          if (/governance-judge|chief-decision|interaction\.|intent\.confirmation|delivery\.|session\.open/.test(String(ev))) {
            lastProgressAt = Date.now();
            const row = { event: ev, at: j.at, requestId: j.requestId, roleId: j.roleId, phase: j.phase, ok: j.ok, reasonCode: j.reasonCode, engine: j.engine, durationMs: j.durationMs, errorMessage: j.errorMessage, readCalls: j.readCalls, readBytes: j.readBytes, intentId: j.intentId };
            summary.diagnostics.push(row);
            log("diag", row);
            if (String(ev).startsWith("governance-judge")) summary.judgeEvents.push(row);
            if (ev === "governance-judge.started" && judgeStartedAt === null) judgeStartedAt = j.at;
            if (ev === "intent.confirmation.freeze-committed") summary.freezeCommittedDiag = row;
            if (ev === "intent.confirmation.freeze-pending") summary.freezePendingDiag = row;
            if (ev === "interaction.response.end" && j.ok === false && j.requestId === cardRequestId) { stopCause = "interaction-response-failed"; }
            if (ev === "chief-decision.failed" && j.stage !== "notice") { stopCause = "chief-decision-failed"; }
          }
        }
      }
    } catch {}

    // 6c) versions.jsonl freeze rows
    for (const line of readJsonl(versionsPath)) {
      if (initialVersions.has(line)) continue;
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || j.event !== "frozen") continue;
      lastProgressAt = Date.now();
      log("freeze.row", { path: j.path, version: j.version, reason: j.freeze?.reason, origin: j.freeze?.origin, applicationId: j.freeze?.applicationId, recordedAt: j.recordedAt });
      if (freezeRaw === null && /"origin"\s*:\s*"judge-delegated"|"origin"\s*:\s*"customer"/.test(line)) {
        // capture the first intent-confirmed freeze row for our flow
        if (j.freeze?.reason === "intent-confirmed" && String(j.path || "").includes(FLOW_ID)) {
          freezeRaw = line;
          summary.freezeRow = j;
          freezeSeenAt = Date.now();
          await shot("ui-08-freeze-row.jpeg");
        }
      }
    }

    // 6d) new snapshots
    try {
      for (const name of exists(snapshotsDir) ? fs.readdirSync(snapshotsDir) : []) {
        if (initialSnapshots.has(name) || summary.newSnapshots.some((s) => s.name === name)) continue;
        await captureSnapshot(name);
      }
    } catch (e) { log("snapshot.scan.error", { error: String(e) }); }

    // 6e) decide whether the leg has its decisive evidence
    if (MODE === "judge-on" && summary.freezePendingDiag) {
      stopCause = "freeze-pending-recovery";
      await shot("ui-09-freeze-pending.jpeg");
      break;
    }
    if (MODE === "judge-on" && freezeRaw && summary.freezeRow?.freeze?.origin === "judge-delegated"
      && (summary.freezeCommittedDiag || Date.now() - freezeSeenAt > 15000)) {
      stopCause = "freeze-committed-judge-delegated";
      await shot("ui-09-decisive.jpeg");
      // short settle window for snapshot/diagnostics flush
      await sleep(4000);
      break;
    }
    if (MODE === "judge-off" && freezeRaw && summary.freezeRow?.freeze?.origin === "customer" && summary.resolvedRow?.by === "customer"
      && (summary.freezeCommittedDiag || Date.now() - freezeSeenAt > 15000)) {
      stopCause = "freeze-committed-customer";
      await shot("ui-09-decisive.jpeg");
      await sleep(4000);
      break;
    }

    // 6f) judge-on fallback / denial: card presented to customer or resolved without judge
    if (MODE === "judge-on" && summary.resolvedRow && summary.resolvedRow.by !== "judge") {
      stopCause = "resolved-without-judge";
      await shot("ui-09-resolved-without-judge.jpeg");
      break;
    }

    // 6g) decision dialog (expected only in judge-off; in judge-on it means judge did not settle)
    const dlg = await value(`(() => {
      const d = document.getElementById('decision-dialog');
      if (!d) return null;
      const title = (document.getElementById('dd-title') || {}).textContent || '';
      const q = (document.getElementById('dd-question') || {}).textContent || '';
      const opts = Array.from(d.querySelectorAll('.dd-options input')).map((i) => ({ id: i.value, checked: i.checked }));
      const labels = Array.from(d.querySelectorAll('.dd-option-label')).map((s) => s.textContent || '');
      const acks = Array.from(d.querySelectorAll('.dd-ack input')).map((a) => ({ id: a.value, checked: a.checked }));
      const submit = d.querySelector('.dd-submit'); const confirm = d.querySelector('.dd-confirm');
      const err = d.querySelector('.dd-error'); const judge = d.querySelector('.dd-judge');
      return { requestId: d.dataset.requestId || '', title, question: q, opts, labels, acks,
        submitDisabled: submit ? submit.disabled : null, confirmDisabled: confirm ? confirm.disabled : null,
        error: err ? err.textContent : null, judgeNotice: judge ? judge.textContent : null, bodyTail: document.body.innerText.slice(-2500) };
    })()`).catch(() => null);
    if (dlg) {
      lastProgressAt = Date.now();
      if (MODE === "judge-off" && !dialogHandled && (!cardRequestId || dlg.requestId === cardRequestId)) {
        await handleOffDialog(dlg);
      } else if (MODE === "judge-on" && !dialogHandled) {
        dialogHandled = true;
        fs.writeFileSync(path.join(EVID, "dialog-unexpected-judge-on.json"), JSON.stringify(dlg, null, 2));
        log("dialog.unexpected-judge-on", { requestId: dlg.requestId, title: dlg.title });
        await shot("ui-gate-dialog-judge-on.jpeg");
        stopCause = "dialog-presented-judge-on";
      }
    }

    // 6h) stall detection
    if (now - lastProgressAt > 8 * 60 * 1000) { stopCause = "stalled-no-progress-8min"; break; }

    // heartbeat
    if (now % 30000 < 700) {
      try { fs.copyFileSync(tasksPath, path.join(EVID, "live", "tasks-live.jsonl")); } catch {}
      fs.writeFileSync(path.join(EVID, "live", "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), elapsedSec: Math.round((now - monitorStart) / 1000), cardRequestId, resolvedBy: summary.resolvedRow?.by ?? null, freezeOrigin: summary.freezeRow?.freeze?.origin ?? null, judgeStartedAt }, null, 2));
    }
    await sleep(500);
  }

  await finalize();
} catch (e) {
  log("run.error", { error: String((e && e.stack) || e) });
  summary.error = String((e && e.stack) || e);
  try {
    fs.writeFileSync(path.join(EVID, "ui-error-body.txt"), await bodyText().catch(() => ""));
    await shot("ui-98-error.jpeg");
    try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch {}
    try { fs.copyFileSync(versionsPath, path.join(EVID, "versions-final.jsonl")); } catch {}
    if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } }
    fs.writeFileSync(path.join(EVID, "summary.json"), JSON.stringify(summary, null, 2));
  } catch {}
  try { await value(clickExpr("btn-halt")).catch(() => null); } catch {}
  await sleep(800);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1200);
  try { await call("Browser.close", {}); } catch {}
  console.error("DRIVER_ERROR", e);
  process.exit(1);
}
