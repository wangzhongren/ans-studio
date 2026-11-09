// RR4-S1 finish: the proposal card is already presented to the customer (execution fallback after A' prepare
// succeeded). Turn delegation OFF via the real UI, click accept+submit in the real dialog, capture the
// resolution, a short flow-continuation window, then halt/close. A second card stops and halts immediately.
import fs from "node:fs";
import path from "node:path";

const rr = "C:/Users/51054/Desktop/work/ans-rr4-s1-2026-11-09";
const EVID = process.env.RR_EVID || path.join(rr, "evidence");
const TARGET = path.win32.normalize(process.env.RR_TARGET || path.join(rr, "target"));
const USERDATA = process.env.ANS_RR_USERDATA || path.join(rr, "userData");
const PORT = Number(process.env.RR_CDP_PORT || 9223);
fs.mkdirSync(EVID, { recursive: true });

const logPath = path.join(EVID, "finish.jsonl");
const log = (type, data) => {
  try { fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), type, ...(data ?? {}) }) + "\n"); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJsonl = (file) => { try { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const getJson = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());

const targets = await getJson(`http://127.0.0.1:${PORT}/json`);
const page = targets.find((x) => x.type === "page");
if (!page) { console.log("NO_PAGE"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const call = (method, params) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const value = async (expr) => (await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => {
  const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  if (r.result?.data) { fs.writeFileSync(path.join(EVID, name), Buffer.from(r.result.data, "base64")); log("screenshot", { file: name }); }
};

const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const diagDir = path.join(USERDATA, "ans", "diagnostics");
const startMark = new Date().toISOString();
const seenRows = new Set();
const seenDiag = new Set();
let proposalRequestId = null;
let resolvedRow = null;
let toggleOff = false;
let submitResult = null;
let stopCause = "resolved-window-done";

function newRows() {
  const out = [];
  for (const line of readJsonl(tasksPath)) {
    if (seenRows.has(line)) continue;
    seenRows.add(line);
    let j = null; try { j = JSON.parse(line); } catch {}
    if (!j || (j.at && j.at < "2026-11-09T05:04:40Z")) continue;
    out.push(j);
  }
  return out;
}

// 1) pre-state
const pre = await value(`(() => {
  const d = document.getElementById('decision-dialog');
  const t = document.getElementById('judge-decision-toggle');
  const title = (document.getElementById('dd-title') || {}).textContent || '';
  const opts = d ? Array.from(d.querySelectorAll('.dd-options input')).map(i => ({ id: i.value, checked: i.checked })) : [];
  const err = d ? d.querySelector('.dd-error') : null;
  const judge = d ? d.querySelector('.dd-judge') : null;
  const submit = d ? d.querySelector('.dd-submit') : null;
  return { dialogOpen: !!d, title, opts, delegationChecked: t ? t.checked : null, delegationDisabled: t ? t.disabled : null,
    error: err ? err.textContent : null, judgeNotice: judge ? judge.textContent : null, submitDisabled: submit ? submit.disabled : null,
    bodyTail: document.body.innerText.slice(-2000) };
})()`).catch((e) => ({ error: String(e) }));
fs.writeFileSync(path.join(EVID, "s1-pre-state.json"), JSON.stringify(pre, null, 2));
await shot("ui-s1-pre.jpeg");
log("pre", { dialogOpen: pre.dialogOpen, title: pre.title, opts: pre.opts, delegationChecked: pre.delegationChecked, error: pre.error, judgeNotice: pre.judgeNotice, submitDisabled: pre.submitDisabled });

// identify the proposal request from the ledger
for (const j of newRows()) {
  if (j.kind === "request.created" && j.cardKind === "proposal" && proposalRequestId === null) proposalRequestId = j.requestId;
  if (j.kind === "request.resolved" && j.requestId === proposalRequestId) resolvedRow = j;
}
log("proposal", { proposalRequestId, resolved: resolvedRow ? { by: resolvedRow.by, choice: resolvedRow.choice } : null });

// 2) turn delegation OFF through the real checkbox (programmatic click works; mouse coordinates were unreliable)
if (pre.delegationChecked === true) {
  await value(`(() => { const t=document.getElementById('judge-decision-toggle'); if(t) t.click(); return true; })()`);
  await sleep(1200);
}
const afterToggle = await value(`(() => { const t=document.getElementById('judge-decision-toggle'); return t ? { checked: t.checked, disabled: t.disabled } : null; })()`).catch(() => null);
toggleOff = !!(afterToggle && afterToggle.checked === false);
log("delegation.off", { afterToggle, toggleOff });

// 3) accept through the real dialog (select accept + submit)
if (pre.dialogOpen) {
  submitResult = await value(`(() => {
    const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
    for (const a of d.querySelectorAll('.dd-ack input')) { if (!a.checked) a.click(); }
    const opts = Array.from(d.querySelectorAll('.dd-options input'));
    const target = opts.find((i) => i.value === 'accept') || opts[0];
    if (target && !target.checked) target.click();
    const sub = d.querySelector('.dd-submit');
    if (sub && !sub.disabled) { sub.click(); return { result: 'submitted', selected: target ? target.value : null }; }
    return { result: 'submit-disabled', submitDisabled: sub ? sub.disabled : null };
  })()`).catch((e) => ({ result: "error", error: String(e) }));
  log("dialog.submit", submitResult);
  await sleep(1600);
  await shot("ui-s1-after-submit.jpeg");
  const errAfter = await value(`(() => { const e=document.querySelector('#decision-dialog .dd-error'); return e ? e.textContent : null; })()`).catch(() => null);
  log("dialog.error.after-submit", { error: errAfter });
  if (errAfter) submitResult = { ...submitResult, error: errAfter };
}

// 4) wait for request.resolved (up to 60s), watching for a second card (immediate halt)
const t0 = Date.now();
let secondCard = false;
while (Date.now() - t0 < 60000) {
  for (const j of newRows()) {
    if (j.kind === "request.created" && proposalRequestId !== null && j.requestId !== proposalRequestId) {
      secondCard = true; log("budget.second-card", { requestId: j.requestId, cardKind: j.cardKind }); stopCause = "budget-second-card";
    }
    if (j.kind === "request.resolved" && j.requestId === proposalRequestId) {
      resolvedRow = j; log("proposal.resolved", { by: j.by, choice: j.choice, reason: j.reason });
    }
  }
  try {
    for (const name of fs.readdirSync(diagDir)) {
      for (const line of readJsonl(path.join(diagDir, name))) {
        if (seenDiag.has(line)) continue;
        seenDiag.add(line);
        let j = null; try { j = JSON.parse(line); } catch {}
        if (j && j.at >= startMark && ["interaction.response", "interaction.response.end", "chief-decision.failed"].includes(j.event)) {
          log("diag", { event: j.event, at: j.at, requestId: j.requestId, ok: j.ok, pendingCount: j.pendingCount, errorMessage: j.errorMessage, phase: j.phase });
        }
      }
    }
  } catch {}
  if (secondCard || resolvedRow) break;
  await sleep(400);
}
await shot("ui-s1-resolved.jpeg").catch(() => null);

// 5) short flow-continuation window (10s), halt immediately on any new request.created
if (resolvedRow && !secondCard) {
  const w0 = Date.now();
  while (Date.now() - w0 < 10000) {
    for (const j of newRows()) {
      if (j.kind === "request.created") { secondCard = true; stopCause = j.cardKind === "proposal" ? "budget-second-card" : "unexpected-card"; log("budget.new-card", { requestId: j.requestId, cardKind: j.cardKind }); break; }
      log("continuation.row", { kind: j.kind, at: j.at, taskId: j.taskId, requestId: j.requestId, status: j.status, from: j.from, to: j.to });
    }
    if (secondCard) break;
    await sleep(500);
  }
}

// 6) final capture + halt/close
const finalBody = await value("document.body.innerText").catch(() => "");
fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), finalBody ?? "");
await shot("ui-99-final.jpeg").catch(() => null);
try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch {}
const diagOut = path.join(EVID, "diagnostics");
try { fs.mkdirSync(diagOut, { recursive: true }); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(diagOut, f)); } catch {} } } catch {}
const runsDir = path.join(TARGET, ".ans/runs");
try {
  const runsOut = path.join(EVID, "runs"); fs.mkdirSync(runsOut, { recursive: true });
  for (const name of fs.readdirSync(runsDir)) { const mp = path.join(runsDir, name, "manifest.json"); if (fs.existsSync(mp)) { fs.mkdirSync(path.join(runsOut, name), { recursive: true }); fs.copyFileSync(mp, path.join(runsOut, name, "manifest.json")); } }
} catch {}
const snapsDir = path.join(TARGET, ".ans/trunk/snapshots");
try {
  const snapsOut = path.join(EVID, "snapshots"); fs.mkdirSync(snapsOut, { recursive: true });
  for (const name of fs.readdirSync(snapsDir)) { if (/^decision-/.test(name)) { fs.copyFileSync(path.join(snapsDir, name), path.join(snapsOut, name)); } }
} catch {}
try { const s = path.join(TARGET, ".ans/sessions"); if (fs.existsSync(s)) { fs.cpSync(s, path.join(EVID, "sessions"), { recursive: true }); } } catch {}
const summary = { startedUtc: startMark, endedUtc: new Date().toISOString(), proposalRequestId, resolvedRow: resolvedRow ? { at: resolvedRow.at, by: resolvedRow.by, choice: resolvedRow.choice, reason: resolvedRow.reason } : null, toggleOff, submitResult, secondCard, stopCause, pre };
fs.writeFileSync(path.join(EVID, "finish-summary.json"), JSON.stringify(summary, null, 2));
log("finish", summary);

try { await value(`(() => { const b=document.getElementById('btn-halt'); if(b && !b.disabled){ b.click(); return 'halt'; } return 'no-halt'; })()`); } catch {}
await sleep(1000);
try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`); } catch {}
await sleep(1500);
try { await call("Browser.close", {}); } catch {}
console.log(JSON.stringify({ stopCause, proposalRequestId, resolved: summary.resolvedRow, toggleOff, secondCard }));
try { ws.close(); } catch {}
process.exit(0);
