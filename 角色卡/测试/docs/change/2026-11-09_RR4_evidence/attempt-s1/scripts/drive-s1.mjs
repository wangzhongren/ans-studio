// RR4-S1 (proposal-card draft-run binding, corrected run): real UI import -> chief chat -> judge ON ->
// ONE corrected customer message -> A' prepare snapshot -> real UI delegation OFF -> customer accepts the
// presented proposal card -> request.resolved(customer) -> short flow-continuation capture -> halt/close.
// Strict budget: 1 customer message, <=1 proposal card; a second card/delivery stops and halts immediately.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rr = "C:/Users/51054/Desktop/work/ans-rr4-s1-2026-11-09";
const userData = process.env.ANS_RR_USERDATA || path.join(rr, "userData");
const EVID = process.env.RR_EVID || path.join(rr, "evidence");
const TARGET = path.win32.normalize(process.env.RR_TARGET || path.join(rr, "target"));
const PORT = Number(process.env.RR_CDP_PORT || 9223);
const DEADLINE_MS = Number(process.env.RR_DEADLINE_MIN || 12) * 60 * 1000;
fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(path.join(EVID, "snapshots"), { recursive: true });

const CUSTOMER_MESSAGE = `请按 ANS 流程执行一个很小的验证步骤；除本条消息要求的派发外不要做别的事：不要运行 shell、不要写任何文件、不要发其它卡。

步骤：用 dispatch_task 把下面【任务原文】逐字派发给策划（roleId=rapporteur，flowId=snake-game），完成后结束本轮。

【任务原文】
请先核查 docs/proposals/snake-game-proposal-v1.md，然后调用 request_choice 向客户发出提案确认卡，参数如下：
- title: 确认「2D 贪吃蛇小游戏」实施提案（v1）
- cardKind: proposal
- flowId: snake-game
- taskId: 取投递消息头部的任务编号，去掉开头 # 后逐字使用（例如 #t-abc123 → t-abc123），不得包含 # 字符
- question: 是否接受该提案？
- options: [{"id":"accept","label":"接受"},{"id":"revise","label":"退修"}]
不要写文件、不要运行 shell、不要调用其它工具；出卡后据实报告工具回执并结束回合。`;

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
const getJson = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
let page = null;
for (let i = 0; i < 240; i++) {
  try { const targets = await getJson(`http://127.0.0.1:${PORT}/json`); page = targets.find((x) => x.type === "page"); if (page) break; } catch {}
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
  const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  if (!r.result?.data) return null;
  const file = path.join(EVID, name);
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  log("screenshot", { file: name, bytes: fs.statSync(file).size });
  return name;
};
const bodyText = async () => value("document.body.innerText").catch(() => "");
const clickExpr = (id) => `(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) return 'missing'; b.click(); return 'clicked'; })()`;

const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const diagDir = path.join(userData, "ans", "diagnostics");
const runsDir = path.join(TARGET, ".ans/runs");
const snapshotsDir = path.join(TARGET, ".ans/trunk/snapshots");

const initialSnapshots = new Set();
try { for (const n of fs.readdirSync(snapshotsDir)) initialSnapshots.add(n); } catch {}
const newSnapshots = [];
const seenTaskRows = new Set();
const seenDiagLines = new Set();
const runState = new Map();
const startMark = new Date().toISOString();

const summary = {
  startedUtc: new Date().toISOString(), target: TARGET, userData, port: PORT,
  customerMessage: CUSTOMER_MESSAGE, steps: [], toggles: null, requestRows: [], diagnosticsOfInterest: [],
  dialogs: [], dialogActions: [], runManifestChanges: [], newSnapshots: [], stop: null,
};

let proposalRequestId = null;
let proposalCreatedAt = 0;
let delegationOff = false;
let resolvedRow = null;
let presentedRows = [];
let submitError = null;
let dialogShotDone = false;
let lastDialogKey = "";
let stopCause = "deadline";
let postResolvedUntil = 0;
let haltRequested = false;

async function toggleDelegationOff(reason) {
  const info = await value(`(() => { const d=document.getElementById('judge-decision-toggle'); if(!d) return null; const r=d.getBoundingClientRect(); return { checked:d.checked, disabled:d.disabled, x:r.x+r.width/2, y:r.y+r.height/2 }; })()`).catch(() => null);
  log("delegation.before-off", { reason, info });
  if (info && !info.disabled && info.checked) {
    await call("Input.dispatchMouseEvent", { type: "mousePressed", x: info.x, y: info.y, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: info.x, y: info.y, button: "left", clickCount: 1 });
    await sleep(1200);
  }
  const after = await value(`(() => { const d=document.getElementById('judge-decision-toggle'); return d ? { checked:d.checked, disabled:d.disabled } : null; })()`).catch(() => null);
  delegationOff = !!(after && after.checked === false);
  summary.dialogActions.push({ step: "delegation-off", reason, before: info, after, at: new Date().toISOString() });
  log("delegation.after-off", { reason, after, delegationOff });
  return delegationOff;
}

async function handleDialog(action) {
  const r = await value(`(() => {
    const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
    for (const a of d.querySelectorAll('.dd-ack input')) { if (!a.checked) a.click(); }
    const opts = Array.from(d.querySelectorAll('.dd-options input'));
    const target = opts.find((i) => i.value === 'accept') || opts[0];
    if (target && !target.checked) target.click();
    const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm');
    if (${action === "submit" ? "true" : "false"}) {
      if (sub && !sub.disabled) { sub.click(); return { result: 'submitted', selected: target ? target.value : null }; }
      if (conf && !conf.disabled) { conf.click(); return { result: 'confirmed' }; }
    }
    return { result: 'no-action', submitDisabled: sub ? sub.disabled : null, confirmDisabled: conf ? conf.disabled : null };
  })()`).catch((e) => ({ result: "error", error: String(e) }));
  summary.dialogActions.push({ step: "accept-" + action, action: r, at: new Date().toISOString() });
  log("dialog.action", r);
  return r;
}

async function finalize() {
  summary.stop = { stopCause, at: new Date().toISOString(), proposalRequestId, resolved: resolvedRow, delegationOff, submitError, haltRequested };
  log("monitor.stop", summary.stop);
  fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), await bodyText().catch(() => ""));
  await shot("ui-99-final.jpeg").catch(() => null);
  try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch (e) { log("capture.tasks.error", { error: String(e) }); }
  const diagOut = path.join(EVID, "diagnostics");
  if (exists(diagDir)) { fs.mkdirSync(diagOut, { recursive: true }); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(diagOut, f)); } catch {} } }
  const runsOut = path.join(EVID, "runs");
  if (exists(runsDir)) {
    fs.mkdirSync(runsOut, { recursive: true });
    for (const name of fs.readdirSync(runsDir)) {
      const mp = path.join(runsDir, name, "manifest.json");
      if (!exists(mp)) continue;
      fs.mkdirSync(path.join(runsOut, name), { recursive: true });
      try { fs.copyFileSync(mp, path.join(runsOut, name, "manifest.json")); } catch {}
    }
  }
  const sessionsDir = path.join(TARGET, ".ans/sessions");
  if (exists(sessionsDir)) { fs.mkdirSync(path.join(EVID, "sessions"), { recursive: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); }
  fs.writeFileSync(path.join(EVID, "summary.json"), JSON.stringify(summary, null, 2));

  try { await value(clickExpr("btn-halt")).catch(() => null); } catch {}
  await sleep(1000);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1500);
  try { await call("Browser.close", {}); } catch (e) { log("browser.close.error", { error: String(e) }); }
  console.log(JSON.stringify({ stopCause, proposalRequestId, resolved: resolvedRow, delegationOff, submitError, newSnapshots: summary.newSnapshots.map(s => s.name) }));
  try { ws.close(); } catch {}
  process.exit(0);
}

try {
  for (let i = 0; i < 240; i++) {
    const ready = await value("typeof window.desktop === 'object' && document.readyState !== 'loading'").catch(() => false);
    if (ready) break;
    await sleep(500);
  }
  log("window.ready", { title: await value("document.title").catch(() => null) });
  await shot("ui-00-launch.jpeg");

  // 1) import the fresh copy through the real UI + native folder dialog
  const importClick = await value(clickExpr("btn-import")).catch(() => "error");
  log("import.click", { importClick });
  if (importClick === "clicked") {
    let psOut = "";
    try {
      psOut = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rr, "rr", "select-folder-auto.ps1"), "-Path", TARGET], { encoding: "utf8", timeout: 30000 });
    } catch (e) { psOut = "PS_ERROR " + String(e.stdout || e.message); }
    log("import.dialog", { psOut: psOut.trim() });
  }
  await sleep(5000);
  await shot("ui-01-imported.jpeg");
  fs.writeFileSync(path.join(EVID, "ui-01-imported-body.txt"), await bodyText());

  // 2) start the chief conversation
  let startClick = "missing";
  for (let i = 0; i < 90; i++) {
    startClick = await value(clickExpr("btn-start-primary")).catch(() => "error");
    if (startClick === "clicked") break;
    await sleep(1000);
  }
  log("start.click", { startClick });

  // 3) wait for the real session-open-ready diagnostic
  let sessionReady = false;
  const sessionStartAt = new Date().toISOString();
  let sessionFailText = null;
  for (let i = 0; i < 180; i++) {
    try {
      outer: for (const name of fs.readdirSync(diagDir)) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          let j = null; try { j = JSON.parse(line); } catch {}
          if (j && j.event === "session.open.ready" && j.at && j.at >= sessionStartAt) { sessionReady = true; break outer; }
        }
      }
    } catch {}
    if (sessionReady) break;
    sessionFailText = await value(`(() => { const t = document.body.innerText; const m = t.match(/开启会话失败[^\\n]*/); return m ? m[0] : null; })()`).catch(() => null);
    if (sessionFailText) break;
    await sleep(1000);
  }
  log("session.ready", { sessionReady, sessionFailText });
  summary.steps.push({ step: "session-ready", sessionReady, sessionFailText, at: new Date().toISOString() });
  if (!sessionReady) { stopCause = "session-open-failed"; await finalize(); }

  // 4) judge-decision toggle ON (delegation), retry until unchecked->checked
  let toggleOn = false;
  let toggleState = null;
  for (let i = 0; i < 30; i++) {
    toggleState = await value(`(() => { const d=document.getElementById('judge-decision-toggle'); return d ? { decision: d.checked, disabled: d.disabled } : { missing: true }; })()`).catch(() => null);
    if (toggleState && toggleState.decision === true) { toggleOn = true; break; }
    if (toggleState && toggleState.disabled === false) await value(clickExpr("judge-decision-toggle")).catch(() => null);
    await sleep(1000);
  }
  log("judge.toggle.on", { toggleState, toggleOn });
  summary.toggles = { toggleState, toggleOn };
  if (!toggleOn) { stopCause = "toggle-on-failed"; await finalize(); }
  await shot("ui-02-toggles.jpeg");

  // 5) send the single corrected customer message
  await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return 'missing'; ta.focus(); return document.activeElement === ta; })()`);
  try { await call("Input.insertText", { text: CUSTOMER_MESSAGE }); } catch (e) { log("compose.insertText.error", { error: String(e) }); }
  let current = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  if (current !== CUSTOMER_MESSAGE) {
    await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false;
      const proto = Object.getPrototypeOf(ta); const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(CUSTOMER_MESSAGE)}); else ta.value = ${JSON.stringify(CUSTOMER_MESSAGE)};
      ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  }
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
  const monitorStart = Date.now();

  // 6) monitor
  while (Date.now() - monitorStart < DEADLINE_MS) {
    let done = false;
    // 6a) ledger
    for (const line of readJsonl(tasksPath)) {
      if (seenTaskRows.has(line)) continue;
      seenTaskRows.add(line);
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || (j.at && j.at < startMark)) continue;
      if (["request.created", "request.presented", "request.resolved", "request.orphaned", "task.created", "task.delivered", "task.reported"].includes(j.kind)) {
        const row = { kind: j.kind, at: j.at, requestId: j.requestId, taskId: j.taskId, from: j.from, to: j.to, cardKind: j.cardKind, flowId: j.flowId, choice: j.choice, by: j.by, reason: j.reason, hasOperatorId: j.operatorId !== undefined, runId: j.runId, runState: j.runState };
        summary.requestRows.push(row);
        log("task.row", row);
      }
      if (j.kind === "request.created" && j.cardKind === "proposal" && proposalRequestId === null) {
        proposalRequestId = j.requestId; proposalCreatedAt = Date.now();
        const taskId = (j.taskId !== undefined ? String(j.taskId) : "");
        log("proposal.request.created", { requestId: j.requestId, flowId: j.flowId, taskId, badge: taskId.startsWith("#") ? "HAS-HASH-PREFIX" : "exact" });
        await shot("ui-03-proposal-created.jpeg").catch(() => null);
        // Real UI: customer turns delegation OFF while the chief decision is being prepared/executed.
        // The pending card is then presented to the customer (modeChanged); A' prepare keeps running and
        // writes the decision snapshot, which the monitor captures below.
        if (!delegationOff && !resolvedRow) await toggleDelegationOff("request-created");
      } else if (j.kind === "request.created" && proposalRequestId !== null && j.requestId !== proposalRequestId) {
        log("budget.second-card", { requestId: j.requestId, cardKind: j.cardKind });
        stopCause = j.cardKind === "proposal" ? "budget-second-card" : "unexpected-card";
        done = true;
      }
      if (j.kind === "request.presented" && j.requestId === proposalRequestId) {
        const presented = { kind: j.kind, at: j.at, requestId: j.requestId, to: j.to };
        presentedRows.push(presented); log("request.presented", presented);
      }
      if (j.kind === "request.resolved" && j.requestId === proposalRequestId) {
        resolvedRow = { kind: j.kind, at: j.at, requestId: j.requestId, by: j.by, choice: j.choice, reason: j.reason, taskId: j.taskId };
        if (!postResolvedUntil) {
          stopCause = "resolved"; postResolvedUntil = Date.now() + 12000;
          log("proposal.resolved", resolvedRow);
          await shot("ui-06-resolved.jpeg").catch(() => null);
        }
      }
    }
    if (done) break;
    // 6b) diagnostics
    try {
      for (const name of fs.readdirSync(diagDir)) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          if (seenDiagLines.has(line)) continue;
          seenDiagLines.add(line);
          let j = null; try { j = JSON.parse(line); } catch {}
          if (!j || (j.at && j.at < startMark)) continue;
          if (["chief-decision.failed", "interaction.presented", "interaction.response", "interaction.response.end", "session.open.ready", "delivery.start", "delivery.blocked"].includes(j.event)) {
            const row = { event: j.event, at: j.at, requestId: j.requestId, ok: j.ok, pendingCount: j.pendingCount, errorMessage: j.errorMessage, phase: j.phase, roleId: j.roleId };
            summary.diagnosticsOfInterest.push(row); log("diag", row);
          }
        }
      }
    } catch {}
    if (done) break;
    // 6c) run manifests
    try {
      for (const name of fs.readdirSync(runsDir)) {
        const mp = path.join(runsDir, name, "manifest.json");
        if (!exists(mp)) continue;
        let st; try { st = fs.statSync(mp); } catch { continue; }
        const key = `${st.size}:${st.mtimeMs}`;
        if (runState.get(name) === key) continue;
        runState.set(name, key);
        try {
          const m = JSON.parse(fs.readFileSync(mp, "utf8"));
          const row = { runId: m.runId, state: m.state, flowId: m.flowId, documentsKeys: Object.keys(m.documents ?? {}), execution: m.execution ?? null, pinnedBy: m.pinnedBy };
          summary.runManifestChanges.push({ at: new Date().toISOString(), ...row }); log("run.manifest", row);
        } catch {}
      }
    } catch {}
    // 6d) decision snapshots (A' prepare evidence)
    try {
      for (const name of fs.readdirSync(snapshotsDir)) {
        if (initialSnapshots.has(name) || newSnapshots.some((s) => s.name === name)) continue;
        const p = path.join(snapshotsDir, name);
        let st; try { st = fs.statSync(p); } catch { continue; }
        const bytes = fs.readFileSync(p);
        const { createHash } = await import("node:crypto");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        let parsed = null; try { parsed = JSON.parse(bytes.toString("utf8")); } catch {}
        const meta = { name, bytes: st.size, sha256, schema: parsed?.schema, digest: parsed?.digest, snapshotId: parsed?.snapshotId, files: Array.isArray(parsed?.files) ? parsed.files.length : null, mtime: st.mtime.toISOString() };
        newSnapshots.push(meta);
        summary.newSnapshots = newSnapshots;
        fs.copyFileSync(p, path.join(EVID, "snapshots", name));
        fs.writeFileSync(path.join(EVID, "snapshots", name + ".meta.json"), JSON.stringify(meta, null, 2));
        log("snapshot.new", meta);
        await shot("ui-04-snapshot.jpeg").catch(() => null);
        // A' prepare completed: now hand the pending card to the customer through the real UI.
        if (proposalRequestId !== null && !delegationOff && !resolvedRow) {
          await toggleDelegationOff("snapshot-prepared");
        }
      }
    } catch {}
    // 6e) decision dialog
    const dialog = await value(`(() => {
      const d = document.getElementById('decision-dialog');
      if (!d) return null;
      const title = (document.getElementById('dd-title') || {}).textContent || '';
      const opts = Array.from(d.querySelectorAll('.dd-options input'));
      const labels = opts.map((i) => ({ id: i.value, checked: i.checked }));
      const acks = Array.from(d.querySelectorAll('.dd-ack input'));
      const submit = d.querySelector('.dd-submit'); const confirm = d.querySelector('.dd-confirm');
      const err = d.querySelector('.dd-error'); const judge = d.querySelector('.dd-judge');
      return { title, opts: labels, acks: acks.map((a) => a.checked), submit: submit ? { disabled: submit.disabled } : null,
        confirm: confirm ? { disabled: confirm.disabled } : null, error: err ? err.textContent : null, judgeNotice: judge ? judge.textContent : null };
    })()`).catch(() => null);
    if (dialog) {
      const key = (dialog.title || "") + "|" + dialog.opts.map((o) => o.id).join(",") + "|" + (dialog.error || "");
      if (!dialogShotDone) { dialogShotDone = true; await shot("ui-05-dialog.jpeg").catch(() => null); fs.writeFileSync(path.join(EVID, "ui-dialog-body.txt"), JSON.stringify(dialog, null, 2)); }
      if (key !== lastDialogKey) { lastDialogKey = key; summary.dialogs.push({ ...dialog, at: new Date().toISOString() }); log("dialog.seen", dialog); }
      if (/贪吃蛇|提案/.test(dialog.title || "") && dialog.opts.some((o) => o.id === "accept")) {
        if (!delegationOff) await toggleDelegationOff("dialog-presented");
        if (!resolvedRow) {
          await handleDialog("submit");
          await sleep(1500);
          await shot("ui-05b-after-submit.jpeg").catch(() => null);
          submitError = await value(`(() => { const e=document.querySelector('#decision-dialog .dd-error'); return e ? e.textContent : null; })()`).catch(() => null);
          log("dialog.error.after-submit", { error: submitError });
          if (submitError) summary.dialogActions.push({ step: "error-after-submit", error: submitError, at: new Date().toISOString() });
        }
      }
    }
    // 6f) end conditions
    if (resolvedRow && Date.now() >= postResolvedUntil) break;
    if (stopCause !== "deadline" && stopCause !== "resolved") break;
    await sleep(proposalRequestId === null ? 600 : 500);
  }
  if (stopCause === "deadline" && Date.now() - monitorStart >= DEADLINE_MS) stopCause = "timeout";
  await finalize();
} catch (e) {
  log("run.error", { error: String((e && e.stack) || e) });
  fs.writeFileSync(path.join(EVID, "summary.json"), JSON.stringify({ ...summary, error: String((e && e.stack) || e) }, null, 2));
  console.error("DRIVER_ERROR", e);
  process.exit(1);
}
