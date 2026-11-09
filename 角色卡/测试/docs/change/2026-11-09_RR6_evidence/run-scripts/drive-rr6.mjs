// RR6 drive: team-plan run binding / baseDigest legitimate source (T2) — real-run evidence.
// Existing snake target (no copy) -> real UI import -> chief session -> ONE customer message asking for a
// small requirement on the snake flow with the CANONICAL team plan path docs/scheduling/snake-game-team-v1.md;
// proposal -> legit customer decision (real dialog) -> team plan registration -> stop at the FIRST decisive
// result (expected: complete_team_plan rejected trunk-unavailable; registration success = RR6-A is recorded
// and the run continues to the next gate). Strict budget; no auto-retry; stop on first decisive result.
// Writes ONLY under the RR6 run root (outside the repo).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const RR = "C:\\Users\\51054\\Desktop\\work\\ans-team-plan-run-2026-11-09";
const EVID = path.join(RR, "evidence");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
const PORT = 9223;
const DEADLINE_MS = 30 * 60 * 1000;   // drive start -> hard stop (total wall clock incl. launch stays < 45 min)
const STALL_MS = 10 * 60 * 1000;      // no activity at all after the message
const GATE_GRACE_MS = 90 * 1000;      // after the decisive receipt, let the in-flight convener turn land (bounded drain)
fs.mkdirSync(path.join(EVID, "live"), { recursive: true });
fs.mkdirSync(path.join(EVID, "live", "diagnostics"), { recursive: true });

const preSummary = JSON.parse(fs.readFileSync(path.join(EVID, "pre", "pre-summary.json"), "utf8"));

const CUSTOMER_MESSAGE = `请按 ANS 既有真实流程推进「2D 贪吃蛇小游戏」项目的一个小需求：为基础玩法增加暂停/继续功能（运行时按空格键或点击界面按钮可暂停与继续），并在既有验收范围内交付。本条消息是唯一客户指令：不要使用 run_shell；不要伪造或代填任何工具结果；每一步都如实回报；遇到门禁或阻塞时如实记录门码/回执原文后停止，不要重试被拒的调用，不要猜测或自填应用派生值。

流程备忘（请转达给相应角色）：
1. 先完成提案确认卡（cardKind=proposal，flowId=snake-game，必须是全新 requestId，历史卡片均已结算不得复用），由客户在真实对话框中决定；客户接受后继续团队计划与任命流程。
2. 团队计划必须写入规范路径 docs/scheduling/snake-game-team-v1.md（即 docs/scheduling/<flowId>-team-v<N>.md，flowId=snake-game，N=1；其他路径会被应用拒绝）。
3. 调用 complete_team_plan 时 plan 只需提供 {path, version}；baseDigest 与 plan.sha256 由应用从 effective trunk 与实际文件字节派生，不需要提供，严禁伪造或猜测；runId 由应用从真实受派任务绑定，不要自报。
4. 任命卡按既有分工由人事（nominator）发起；不要越权代发。
5. 若团队计划登记被应用拒绝，如实记录完整回执（含 errorCode/message）后停止并交回报告，不要重试。

如派发给其它角色，请在投递任务中写明：taskId 使用投递消息头部的任务编号去掉开头 # 的部分（例如 #t-abc → t-abc），不得包含 # 字符。`;
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
const mkdirp = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch {} };

const startMark = new Date().toISOString();
const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const diagDir = path.join(RR, "userData", "ans", "diagnostics");
const runsDir = path.join(TARGET, ".ans/runs");
const snapshotsDir = path.join(TARGET, ".ans/trunk/snapshots");
const sessionsDir = path.join(TARGET, ".ans/sessions");
const teamPlanDoc = path.join(TARGET, "docs", "scheduling", "snake-game-team-v1.md");

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
  const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  if (!r.result?.data) return null;
  const file = path.join(EVID, name);
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  log("screenshot", { file: name, bytes: fs.statSync(file).size });
  return name;
};
const bodyText = async () => value("document.body.innerText").catch(() => "");
const clickExpr = (id) => `(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) return 'missing'; b.click(); return 'clicked'; })()`;

// ---------- state ----------
const summary = {
  startedUtc: startMark, target: TARGET, userData: path.join(RR, "userData"), port: PORT,
  customerMessage: CUSTOMER_MESSAGE, steps: [], toggleState: null,
  taskRows: [], requestRows: [], dispatchRows: [], diagnosticsOfInterest: [],
  dialogs: [], dialogActions: [], oldCardsHandled: [], runManifestChanges: [], newSnapshots: [],
  newSessionDirs: [], milestones: [], stop: null, error: null,
  planToolCalls: [], planReceipts: [], convenerReports: [], teamPlanDocHistory: [], portsDuringRun: [],
};
const budget = { customerMessages: 1, cardsTotal: 0, cardsByKind: {}, dispatches: 0, turnsByRole: {}, gitCalls: 0 };
let msgMark = null;
let proposalRequestId = null;
let resolvedRow = null;
let presentedRows = [];
let sessionReadyChief = false;
let sessionFailText = null;
let stopCause = null; let gate = null;
let gateDetectedAt = 0;
let lastProgressAt = Date.now();
let lastNativeTotal = 0;
let lastHeartbeat = 0;
let lastPortCheck = 0;
let halted = false;

const seenTaskLines = new Set(readJsonl(tasksPath));
const seenDiagLines = new Set();
const requests = new Map();
const dialogsHandled = new Set();
let dialogSeq = 0;
const initialSnapshots = new Set(exists(snapshotsDir) ? fs.readdirSync(snapshotsDir) : []);
const initialRuns = new Set(exists(runsDir) ? fs.readdirSync(runsDir) : []);
const initialSessionDirs = new Set(exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []);
const initialReportFiles = new Map();
{
  const repDir = path.join(sessionsDir, "convener", "claude", "ans", "reports");
  if (exists(repDir)) for (const f of fs.readdirSync(repDir)) { try { initialReportFiles.set(f, fs.statSync(path.join(repDir, f)).mtimeMs); } catch {} }
}
const runState = new Map();
const OLD_REQUEST_IDS = new Set(preSummary.oldRequestIds ?? []);
log("old.request.ids", { ids: [...OLD_REQUEST_IDS] });

const posOptionIds = ["accept", "approve", "confirm", "agree", "yes", "ok", "proceed", "allow", "accept-version-change"];
const posLabel = /接受|同意|确认|通过|批准|继续|allow|approve/i;
const negLabel = /退修|拒绝|decline|reject|revise/i;
const allowedKinds = new Set(["proposal", "appointment", "acceptance", "intent-confirm"]);

function budgetCheck() {
  const limits = { chief: 8, convener: 3, product: 4, "game-dev": 4 };
  for (const [role, count] of Object.entries(budget.turnsByRole)) {
    const lim = limits[role] ?? 2;
    if (count > lim) return `budget-turns-${role}:${count}>${lim}`;
  }
  if (budget.cardsTotal > 4) return `budget-cards:${budget.cardsTotal}>4`;
  if (budget.dispatches > 8) return `budget-dispatches:${budget.dispatches}>8`;
  if (budget.gitCalls > 4) return `budget-git:${budget.gitCalls}>4`;
  return null;
}

function countTurns() {
  const outTurns = {};
  for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
    const replay = path.join(sessionsDir, role, "claude", "ans", "replay.jsonl");
    if (!exists(replay)) continue;
    for (const line of readJsonl(replay)) {
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || j.kind !== "event" || j.event?.kind !== "settled") continue;
      if (!msgMark || !j.at || j.at < msgMark) continue;
      outTurns[role] = (outTurns[role] ?? 0) + 1;
    }
  }
  return outTurns;
}

function countGitCalls() {
  let n = 0;
  if (!exists(sessionsDir)) return 0;
  for (const role of fs.readdirSync(sessionsDir)) {
    const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects");
    if (!exists(projectsDir)) continue;
    for (const proj of fs.readdirSync(projectsDir)) {
      const pdir = path.join(projectsDir, proj);
      let files = [];
      try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
      for (const f of files) {
        for (const line of readJsonl(path.join(pdir, f))) {
          if (!line.includes("mcp__ans__git_")) continue;
          let j = null; try { j = JSON.parse(line); } catch {}
          if (!j || j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
          if (msgMark && j.timestamp && j.timestamp < msgMark) continue;
          for (const c of j.message.content) {
            if (c?.type === "tool_use" && typeof c.name === "string" && /^mcp__ans__git_(query|candidate|publish)$/.test(c.name)) n++;
          }
        }
      }
    }
  }
  return n;
}

function nativeBytesTotal() {
  let total = 0;
  try {
    for (const role of fs.readdirSync(sessionsDir)) {
      const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects");
      if (!exists(projectsDir)) continue;
      for (const proj of fs.readdirSync(projectsDir)) {
        const pdir = path.join(projectsDir, proj);
        let files = [];
        try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
        for (const f of files) { try { total += fs.statSync(path.join(pdir, f)).size; } catch {} }
      }
    }
  } catch {}
  return total;
}

// ---------- native transcript live scanning (complete_team_plan calls/results) ----------
const nativeScanState = new Map(); // filePath -> processed line count
const planToolUseIds = new Set();  // tool_use ids of complete_team_plan calls (assistant side)
function flattenContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c)))).join("\n");
  if (content && typeof content === "object") return JSON.stringify(content);
  return "";
}
function tryExtractReceipt(text) {
  if (!text || !/complete_team_plan/.test(text)) return null;
  const codeM = text.match(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/);
  const okM = text.match(/"ok"\s*:\s*(true|false)/);
  const baseM = text.match(/"baseDigest"\s*:\s*(null|"[0-9a-fA-F]{64}")/);
  const tgtM = text.match(/"targetDigest"\s*:\s*(null|"[0-9a-fA-F]{64}")/);
  const opM = text.match(/"operationId"\s*:\s*"([^"]+)"/);
  const shaM = text.match(/"sha256"\s*:\s*"([0-9a-fA-F]{64})"/);
  const runM = text.match(/"runId"\s*:\s*"([^"]+)"/);
  if (!codeM && !okM) return null;
  return { ok: okM ? okM[1] === "true" : null, errorCode: codeM ? codeM[1] : null, baseDigest: baseM ? baseM[1] : undefined, targetDigest: tgtM ? tgtM[1] : undefined, operationId: opM ? opM[1] : undefined, sha256Seen: shaM ? shaM[1] : undefined, runIdSeen: runM ? runM[1] : undefined };
}
function scanNativeForPlan() {
  if (!exists(sessionsDir)) return;
  for (const role of fs.readdirSync(sessionsDir)) {
    const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects");
    if (!exists(projectsDir)) continue;
    let projs = [];
    try { projs = fs.readdirSync(projectsDir); } catch { continue; }
    for (const proj of projs) {
      const pdir = path.join(projectsDir, proj);
      let files = [];
      try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
      for (const f of files) {
        const fp = path.join(pdir, f);
        let lines = [];
        try { lines = readJsonl(fp); } catch { continue; }
        const prev = nativeScanState.get(fp) ?? Math.max(0, lines.length - 2000); // first sight: skip deep history
        if (lines.length <= prev) { nativeScanState.set(fp, Math.max(prev, lines.length)); continue; }
        for (let i = prev; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes("complete_team_plan")) continue;
          let j = null; try { j = JSON.parse(line); } catch { continue; }
          const ts = j.timestamp ?? null;
          if (!ts) continue;
          if (msgMark && ts < msgMark) continue;
          const content = Array.isArray(j.message?.content) ? j.message.content : [];
          for (const c of content) {
            if (j.type === "assistant" && c?.type === "tool_use" && typeof c.name === "string" && /complete_team_plan/.test(c.name)) {
              if (c.id) planToolUseIds.add(c.id);
              const input = c.input ?? null;
              const row = { ts, role, file: path.relative(TARGET, fp).split(path.sep).join("/"), kind: "tool_use", toolName: c.name, toolUseId: c.id ?? null, input };
              summary.planToolCalls.push(row);
              log("plan.tool_use", { ts, role, toolName: c.name, toolUseId: c.id ?? null, input });
            }
            if (j.type === "user" && c?.type === "tool_result") {
              const text = flattenContent(c.content);
              const isPlanResult = planToolUseIds.has(c.tool_use_id) || /complete_team_plan/.test(text);
              if (!isPlanResult) continue;
              const receipt = tryExtractReceipt(/complete_team_plan/.test(text) ? text : "complete_team_plan " + text);
              if (receipt) handlePlanResult({ role, file: path.relative(TARGET, fp).split(path.sep).join("/"), kind: "tool_result", ts, toolUseId: c.tool_use_id ?? null, text: text.slice(0, 6000), receipt });
            }
          }
          if (j.type === "assistant") {
            const txt = flattenContent(content);
            if (/"errorCode"\s*:/.test(txt) && /complete_team_plan/.test(txt)) {
              const receipt = tryExtractReceipt(txt);
              if (receipt) handlePlanResult({ role, file: path.relative(TARGET, fp).split(path.sep).join("/"), kind: "assistant_quote", ts, text: txt.slice(0, 6000), receipt });
            }
          }
        }
        nativeScanState.set(fp, lines.length);
      }
    }
  }
}
function handlePlanResult(row) {
  const r = row.receipt;
  const dedupKey = `${r.operationId ?? "?"}|${r.ok}|${r.errorCode ?? "?"}`;
  if (summary.planReceipts.some((x) => `${x.receipt.operationId ?? "?"}|${x.receipt.ok}|${x.receipt.errorCode ?? "?"}` === dedupKey && x.kind !== "assistant_quote")) {
    if (row.kind === "assistant_quote") summary.planReceipts.push(row);
    return;
  }
  summary.planReceipts.push(row);
  log("plan.receipt", { role: row.role, kind: row.kind, ts: row.ts, receipt: r, text: row.text?.slice(0, 1200) });
  if (r.ok === false && row.kind === "tool_result") {
    detectGate({ kind: "complete-team-plan-rejected", errorCode: r.errorCode, operationId: r.operationId ?? null, baseDigest: r.baseDigest ?? null, targetDigest: r.targetDigest ?? null, role: row.role, file: row.file, at: row.ts ?? new Date().toISOString() });
  } else if (r.ok === true && row.kind === "tool_result") {
    summary.milestones.push({ at: new Date().toISOString(), milestone: "complete-team-plan-applied", operationId: r.operationId ?? null, planRefSha256: r.sha256Seen ?? null, sourceRunId: r.runIdSeen ?? null });
    log("plan.applied.rr6a", { receipt: r });
    shot("ui-08-teamplan-applied.jpeg").catch(() => null);
  }
}

function scanConvenerReports() {
  const repDir = path.join(sessionsDir, "convener", "claude", "ans", "reports");
  if (!exists(repDir)) return;
  for (const f of fs.readdirSync(repDir)) {
    const fp = path.join(repDir, f);
    let st; try { st = fs.statSync(fp); } catch { continue; }
    const prevM = initialReportFiles.get(f);
    if (prevM !== undefined && prevM === st.mtimeMs) continue;
    if (summary.convenerReports.some((x) => x.file === f)) continue;
    let parsed = null; let text = "";
    try { text = fs.readFileSync(fp, "utf8"); parsed = JSON.parse(text); } catch { text = text || ""; }
    const row = { file: f, mtime: st.mtime.toISOString(), status: parsed?.status ?? null, taskId: parsed?.taskId ?? null, hasPlanReceipt: /complete_team_plan/.test(text), codes: [...new Set((text.match(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/g) ?? []).map((s) => s.match(/"([A-Za-z0-9-]+)"$/)?.[1]).filter(Boolean))] };
    summary.convenerReports.push(row);
    log("convener.report", row);
    fs.mkdirSync(path.join(EVID, "convener-reports"), { recursive: true });
    try { fs.copyFileSync(fp, path.join(EVID, "convener-reports", f)); } catch {}
    if (row.status === "blocked" && !gate) {
      detectGate({ kind: "convener-report-blocked", reportFile: f, taskId: row.taskId, codes: row.codes, at: st.mtime.toISOString() });
    }
  }
}

function detectGate(g) {
  if (gate) return;
  gate = g;
  stopCause = "gate:" + g.kind;
  gateDetectedAt = Date.now();
  log("gate.detected", g);
  shot("ui-09-gate-detected.jpeg").catch(() => null);
}

// ---------- dialog handling ----------
async function handleDialog(dlg, cardKind) {
  const rid = dlg.requestId || "";
  dialogSeq++;
  const pre = { seq: dialogSeq, at: new Date().toISOString(), requestId: rid, cardKind, title: dlg.title, options: dlg.opts, labels: dlg.labels, acknowledgments: dlg.acks, submitDisabled: dlg.submitDisabled, confirmDisabled: dlg.confirmDisabled, error: dlg.error, judgeNotice: dlg.judgeNotice, more: dlg.more };
  fs.writeFileSync(path.join(EVID, `dialog-${dialogSeq}-pre.json`), JSON.stringify({ ...pre, bodyTail: dlg.bodyTail }, null, 2));
  summary.dialogs.push(pre);
  log("dialog.seen", pre);
  await shot(`ui-dialog-${String(dialogSeq).padStart(2, "0")}-pre.jpeg`).catch(() => null);

  // Pre-existing (pre-message) card: customer defers ("稍后处理"), recorded separately.
  if (!msgMark || OLD_REQUEST_IDS.has(rid)) {
    const r = await value(`(() => { const d=document.getElementById('decision-dialog'); if(!d) return 'gone'; const b=d.querySelector('.dd-later'); if(!b) return 'no-later'; b.click(); return 'later-clicked'; })()`).catch((e) => "error:" + String(e));
    summary.oldCardsHandled.push({ at: new Date().toISOString(), requestId: rid, title: dlg.title, action: r });
    log("old-card.later", { requestId: rid, title: dlg.title, result: r });
    dialogsHandled.add(rid);
    await sleep(1200);
    return;
  }

  const titleLooksFlow = /提案|任命|验收|团队|意图|确认/.test(dlg.title || "");
  if (!allowedKinds.has(cardKind) && !(cardKind === undefined && titleLooksFlow)) {
    detectGate({ kind: "unexpected-card-kind", requestId: rid, cardKind: cardKind ?? null, title: dlg.title, at: new Date().toISOString() });
    dialogsHandled.add(rid);
    await shot("ui-gate-unexpected-card.jpeg").catch(() => null);
    return;
  }

  const result = await value(`(() => {
    const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
    for (const a of d.querySelectorAll('.dd-ack input')) { if (!a.checked) a.click(); }
    const opts = Array.from(d.querySelectorAll('.dd-options input'));
    const posIds = ${JSON.stringify(posOptionIds)};
    let target = opts.find((i) => posIds.includes(i.value));
    if (!target) {
      const labelEls = Array.from(d.querySelectorAll('.dd-option'));
      const pos = ${posLabel.toString()};
      for (let i = 0; i < labelEls.length; i++) { if (pos.test(labelEls[i].textContent || '')) { target = opts[i]; break; } }
    }
    if (target && !target.checked) target.click();
    const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm');
    if (sub) { if (!sub.disabled) { sub.click(); return { result: 'submitted', selected: target ? target.value : null, kind: 'choice' }; } return { result: 'submit-disabled', submitDisabled: sub.disabled, selected: target ? target.value : null }; }
    if (conf) { if (!conf.disabled) { conf.click(); return { result: 'confirmed', kind: 'confirm' }; } return { result: 'confirm-disabled', confirmDisabled: conf.disabled }; }
    return { result: 'no-actions' };
  })()`).catch((e) => ({ result: "error", error: String(e) }));
  summary.dialogActions.push({ step: "submit", requestId: rid, cardKind, result, at: new Date().toISOString() });
  log("dialog.submit", { requestId: rid, cardKind, result });
  dialogsHandled.add(rid);
  await sleep(1400);
  const post = await value(`(() => { const d=document.getElementById('decision-dialog'); if(!d) return { open:false }; const e=d.querySelector('.dd-error'); const sub=d.querySelector('.dd-submit'); const conf=d.querySelector('.dd-confirm'); return { open:true, error: e?e.textContent:null, submitDisabled: sub?sub.disabled:null, confirmDisabled: conf?conf.disabled:null }; })()`).catch(() => null);
  summary.dialogActions.push({ step: "after-submit", requestId: rid, post, at: new Date().toISOString() });
  log("dialog.after-submit", { requestId: rid, post });
  await shot(`ui-dialog-${String(dialogSeq).padStart(2, "0")}-after-submit.jpeg`).catch(() => null);
  if (post && post.open && post.error) {
    await sleep(2500);
    const again = await value(`(() => { const d=document.getElementById('decision-dialog'); if(!d) return null; const e=d.querySelector('.dd-error'); return e?e.textContent:null; })()`).catch(() => null);
    if (again) detectGate({ kind: "dialog-submit-error", requestId: rid, cardKind, error: again, at: new Date().toISOString() });
  }
}

async function captureSnapshot(name) {
  const p = path.join(snapshotsDir, name);
  let st; try { st = fs.statSync(p); } catch { return null; }
  const bytes = fs.readFileSync(p);
  let parsed = null; try { parsed = JSON.parse(bytes.toString("utf8")); } catch {}
  const meta = { name, bytes: st.size, sha256: sha256(bytes), schema: parsed?.schema, digest: parsed?.digest, snapshotId: parsed?.snapshotId, files: Array.isArray(parsed?.files) ? parsed.files.length : null, mtime: st.mtime.toISOString() };
  try { fs.copyFileSync(p, path.join(EVID, "snapshots", name)); fs.writeFileSync(path.join(EVID, "snapshots", name + ".meta.json"), JSON.stringify(meta, null, 2)); } catch {}
  summary.newSnapshots.push(meta);
  log("snapshot.new", meta);
  return meta;
}

async function finalize() {
  summary.stop = { stopCause, gate, at: new Date().toISOString(), proposalRequestId, resolved: resolvedRow ? { at: resolvedRow.at, by: resolvedRow.by, choice: resolvedRow.choice, reason: resolvedRow.reason } : null, sessionReadyChief };
  summary.budget = budget;
  log("monitor.stop", summary.stop);
  fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), await bodyText().catch(() => ""));
  await shot("ui-99-final.jpeg").catch(() => null);
  try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch (e) { log("capture.tasks.error", { error: String(e) }); }
  try { fs.copyFileSync(path.join(TARGET, ".ans/state/versions.jsonl"), path.join(EVID, "versions-final.jsonl")); } catch {}
  const diagOut = path.join(EVID, "diagnostics");
  if (exists(diagDir)) { mkdirp(diagOut); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(diagOut, f)); } catch {} } }
  if (exists(runsDir)) {
    const runsOut = path.join(EVID, "runs");
    for (const name of fs.readdirSync(runsDir)) {
      const mp = path.join(runsDir, name, "manifest.json");
      if (!exists(mp)) continue;
      mkdirp(path.join(runsOut, name));
      try { fs.copyFileSync(mp, path.join(runsOut, name, "manifest.json")); } catch {}
    }
  }
  if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch (e) { log("capture.sessions.error", { error: String(e) }); } }
  fs.writeFileSync(path.join(EVID, "request-rows.jsonl"), summary.taskRows.filter((r) => r.afterMsg && String(r.kind || "").startsWith("request.")).map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "old-cards.jsonl"), summary.oldCardsHandled.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "plan-tool-calls.jsonl"), summary.planToolCalls.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "plan-receipts-live.jsonl"), summary.planReceipts.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "team-plan-doc-history.jsonl"), summary.teamPlanDocHistory.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "ports-during-run.jsonl"), summary.portsDuringRun.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(EVID, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(EVID, "budget.json"), JSON.stringify(budget, null, 2));
  halted = true;
  try { await value(clickExpr("btn-halt")).catch(() => null); } catch {}
  await sleep(1000);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1500);
  try { await call("Browser.close", {}); } catch (e) { log("browser.close.error", { error: String(e) }); }
  console.log(JSON.stringify({ stopCause, gate, proposalRequestId, resolved: summary.stop.resolved, budget, planToolCalls: summary.planToolCalls.length, planReceipts: summary.planReceipts.map((r) => r.receipt) }));
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

  // 1) import the existing snake target through the real UI + native folder dialog
  const importClick = await value(clickExpr("btn-import")).catch(() => "error");
  log("import.click", { importClick });
  summary.steps.push({ step: "import-click", importClick, at: new Date().toISOString() });
  if (importClick !== "clicked") { detectGate({ kind: "import-click-failed", at: new Date().toISOString() }); await finalize(); }
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

  // 3) wait for the real session-open-ready diagnostic (chief)
  for (let i = 0; i < 240; i++) {
    try {
      outer: for (const name of exists(diagDir) ? fs.readdirSync(diagDir) : []) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          let j = null; try { j = JSON.parse(line); } catch {}
          if (j && j.event === "session.open.ready" && j.roleId === "chief" && j.at && j.at >= startMark) { sessionReadyChief = true; break outer; }
        }
      }
    } catch {}
    if (sessionReadyChief) break;
    sessionFailText = await value(`(() => { const t = document.body.innerText; const m = t.match(/开启会话失败[^\\n]*/); return m ? m[0] : null; })()`).catch(() => null);
    if (sessionFailText) break;
    await sleep(1000);
  }
  log("session.ready", { sessionReadyChief, sessionFailText, startClick });
  summary.steps.push({ step: "session-ready", sessionReadyChief, sessionFailText, at: new Date().toISOString() });
  if (!sessionReadyChief) { detectGate({ kind: "session-open-failed", sessionFailText }); await finalize(); }
  await shot("ui-02-session-ready.jpeg");

  // 4) record toggle state (do NOT enable judge delegation; customer decisions stay legitimate via real dialogs)
  const toggleState = await value(`(() => { const d=document.getElementById('judge-decision-toggle'); return d ? { decision: d.checked, disabled: d.disabled } : { missing: true }; })()`).catch(() => null);
  summary.toggleState = toggleState;
  log("judge.toggle.state", { toggleState });
  await shot("ui-03-toggles.jpeg");

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
  if (!sendOk) { detectGate({ kind: "send-failed" }); await finalize(); }
  await shot("ui-04-message-sent.jpeg");
  lastProgressAt = Date.now();
  const monitorStart = Date.now();
  let lastBudgetCheck = 0; let lastGitCheck = 0;
  let graceStartedAt = 0;

  while (true) {
    const now = Date.now();
    if (now - monitorStart > DEADLINE_MS) { stopCause = "deadline-30min"; break; }
    if (msgMark && now - lastProgressAt > STALL_MS) { stopCause = "stalled-no-progress-10min"; break; }

    // gate grace: drain the in-flight convener turn (bounded), then stop
    if (gate) {
      if (!graceStartedAt) graceStartedAt = now;
      const blockedReport = summary.convenerReports.some((r) => r.status === "blocked");
      const convenerSettled = (budget.turnsByRole.convener ?? 0) > 0;
      if (blockedReport || now - graceStartedAt > GATE_GRACE_MS) break;
      // during grace keep ledger/diagnostics/session scans running below, but skip new gates
    }

    // 6a) ledger rows
    for (const line of readJsonl(tasksPath)) {
      if (seenTaskLines.has(line)) continue;
      seenTaskLines.add(line);
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || !j.at || j.at < startMark) continue;
      const afterMsg = !!(msgMark && j.at >= msgMark);
      lastProgressAt = Date.now();
      const row = { afterMsg, kind: j.kind, at: j.at, requestId: j.requestId, taskId: j.taskId, from: j.from, to: j.to, cardKind: j.cardKind, flowId: j.flowId, choice: j.choice, by: j.by, reason: j.reason, status: j.status, sourceRoleId: j.sourceRoleId, runId: j.runId, runState: j.runState, title: j.title, summary: typeof j.summary === "string" ? j.summary.slice(0, 500) : undefined };
      summary.taskRows.push(row);
      if (!afterMsg) continue;
      log("task.row", row);
      if (j.kind === "task.created") {
        budget.dispatches++;
        summary.dispatchRows.push(row);
        summary.milestones.push({ at: j.at, milestone: "dispatch", taskId: j.taskId, from: j.from, to: j.to, runId: j.runId });
      }
      if (j.kind === "task.reported" && j.status === "blocked" && !gate) {
        detectGate({ kind: "task-reported-blocked", taskId: j.taskId, role: j.from, summary: String(j.summary ?? "").slice(0, 800), at: j.at });
      }
      if (j.requestId) {
        if (!requests.has(j.requestId)) requests.set(j.requestId, { requestId: j.requestId });
        const req = requests.get(j.requestId);
        if (j.kind === "request.created") {
          Object.assign(req, { created: row, cardKind: j.cardKind, flowId: j.flowId, sourceRoleId: j.sourceRoleId, title: j.title });
          if (["proposal", "appointment", "acceptance", "intent-confirm"].includes(j.cardKind)) { budget.cardsTotal++; budget.cardsByKind[j.cardKind] = (budget.cardsByKind[j.cardKind] ?? 0) + 1; }
          if (j.cardKind === "proposal" && j.flowId === "snake-game" && proposalRequestId === null) {
            proposalRequestId = j.requestId;
            summary.milestones.push({ at: j.at, milestone: "proposal-created", requestId: j.requestId, taskId: j.taskId });
            await shot("ui-05-proposal-created.jpeg").catch(() => null);
          }
        }
        if (j.kind === "request.presented") {
          req.presented = row;
          if (j.requestId === proposalRequestId) { presentedRows.push(row); await shot("ui-06-proposal-presented.jpeg").catch(() => null); }
        }
        if (j.kind === "request.resolved") {
          req.resolved = row;
          if (j.requestId === proposalRequestId) {
            resolvedRow = row;
            summary.milestones.push({ at: j.at, milestone: "proposal-resolved", by: j.by, choice: j.choice, reason: j.reason });
            await shot("ui-07-proposal-resolved.jpeg").catch(() => null);
            if (!j.choice || !/accept/i.test(String(j.choice))) { detectGate({ kind: "proposal-not-accepted", requestId: j.requestId, choice: j.choice, reason: j.reason, at: j.at }); }
          } else if (j.cardKind === "appointment" && j.choice && !/accept/i.test(String(j.choice))) {
            detectGate({ kind: "appointment-not-accepted", requestId: j.requestId, choice: j.choice, reason: j.reason, at: j.at });
          }
        }
      }
    }

    // 6b) diagnostics
    try {
      for (const name of exists(diagDir) ? fs.readdirSync(diagDir) : []) {
        for (const line of readJsonl(path.join(diagDir, name))) {
          if (seenDiagLines.has(line)) continue;
          seenDiagLines.add(line);
          let j = null; try { j = JSON.parse(line); } catch {}
          if (!j || (j.at && j.at < startMark)) continue;
          lastProgressAt = Date.now();
          const ev = j.event || j.kind || "?";
          if (/decision|interaction|delivery|session\.open|blocked|failed|escalat|prepare|execute/i.test(String(ev))) {
            const row = { event: ev, at: j.at, requestId: j.requestId, roleId: j.roleId, phase: j.phase, ok: j.ok, pendingCount: j.pendingCount, errorMessage: j.errorMessage, taskId: j.taskId };
            summary.diagnosticsOfInterest.push(row);
            log("diag", row);
            if (ev === "interaction.response.end" && j.ok === false) { detectGate({ kind: "interaction-response-failed", at: j.at, requestId: j.requestId, errorMessage: j.errorMessage }); }
          }
        }
      }
    } catch {}

    // 6c) snapshots
    try {
      for (const name of exists(snapshotsDir) ? fs.readdirSync(snapshotsDir) : []) {
        if (initialSnapshots.has(name) || summary.newSnapshots.some((s) => s.name === name)) continue;
        lastProgressAt = Date.now();
        await captureSnapshot(name);
      }
    } catch (e) { log("snapshot.scan.error", { error: String(e) }); }

    // 6d) run manifests
    try {
      for (const name of exists(runsDir) ? fs.readdirSync(runsDir) : []) {
        const mp = path.join(runsDir, name, "manifest.json");
        if (!exists(mp)) continue;
        let st; try { st = fs.statSync(mp); } catch { continue; }
        const key = `${st.size}:${st.mtimeMs}`;
        if (runState.get(name) === key) continue;
        runState.set(name, key);
        lastProgressAt = Date.now();
        try {
          const m = JSON.parse(fs.readFileSync(mp, "utf8"));
          const row = { runId: m.runId, state: m.state, flowId: m.flowId, documentsKeys: Object.keys(m.documents ?? {}), teamPlan: m.execution?.teamPlan ?? null, flow: m.execution?.flow ?? null, isNewRun: !initialRuns.has(name) };
          summary.runManifestChanges.push({ at: new Date().toISOString(), dir: name, ...row });
          log("run.manifest", { dir: name, ...row });
        } catch {}
      }
    } catch {}

    // 6e) new session dirs (team roles appearing)
    try {
      for (const name of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
        if (!initialSessionDirs.has(name) && !summary.newSessionDirs.includes(name)) { summary.newSessionDirs.push(name); summary.milestones.push({ at: new Date().toISOString(), milestone: "session-dir-created", role: name }); log("session.dir.new", { role: name }); lastProgressAt = Date.now(); }
      }
    } catch {}

    // 6f) decision dialog
    const dlg = await value(`(() => {
      const d = document.getElementById('decision-dialog');
      const shell = document.querySelector('.sc-overlay');
      const shellVisible = !!(shell && !shell.hidden);
      let shellInfo = null;
      if (shellVisible) { const t = document.getElementById('sc-title'); shellInfo = { title: t ? t.textContent : null }; }
      if (!d) return { dialog: null, shellVisible, shellInfo };
      const title = (document.getElementById('dd-title') || {}).textContent || '';
      const opts = Array.from(d.querySelectorAll('.dd-options input')).map((i) => ({ id: i.value, checked: i.checked }));
      const labels = Array.from(d.querySelectorAll('.dd-option-label')).map((s) => s.textContent || '');
      const acks = Array.from(d.querySelectorAll('.dd-ack input')).map((a) => ({ id: a.value, checked: a.checked }));
      const submit = d.querySelector('.dd-submit'); const confirm = d.querySelector('.dd-confirm');
      const err = d.querySelector('.dd-error'); const judge = d.querySelector('.dd-judge');
      const more = d.querySelector('.dd-more');
      return { dialog: { requestId: d.dataset.requestId || '', title, opts, labels, acks, submitDisabled: submit ? submit.disabled : null, confirmDisabled: confirm ? confirm.disabled : null, hasSubmit: !!submit, hasConfirm: !!confirm, error: err ? err.textContent : null, judgeNotice: judge ? judge.textContent : null, more: more ? more.textContent : null, bodyTail: document.body.innerText.slice(-3000) }, shellVisible, shellInfo };
    })()`).catch(() => ({ dialog: null, shellVisible: false, shellInfo: null }));
    if (dlg?.shellVisible && !gate) detectGate({ kind: "shell-confirm-card", title: dlg.shellInfo?.title ?? null, at: new Date().toISOString() });
    if (dlg?.dialog && !dialogsHandled.has(dlg.dialog.requestId)) {
      const req = requests.get(dlg.dialog.requestId);
      const cardKind = req?.cardKind;
      await handleDialog(dlg.dialog, cardKind);
    }

    // 6g) native transcripts: complete_team_plan calls/receipts (decisive RR6 evidence)
    scanNativeForPlan();
    scanConvenerReports();

    // 6h) team plan doc at canonical path
    try {
      if (exists(teamPlanDoc)) {
        const h = sha256(fs.readFileSync(teamPlanDoc));
        if (!summary.teamPlanDocHistory.some((x) => x.sha256 === h)) {
          const row = { at: new Date().toISOString(), rel: "docs/scheduling/snake-game-team-v1.md", bytes: fs.statSync(teamPlanDoc).size, sha256: h };
          summary.teamPlanDocHistory.push(row);
          log("teamplan.doc", row);
          summary.milestones.push({ at: row.at, milestone: "canonical-team-plan-doc", sha256: h, bytes: row.bytes });
          await shot("ui-08-teamplan-doc.jpeg").catch(() => null);
        }
      }
    } catch {}

    // 6i) game artifacts (decisive success)
    const gameFiles = ["game/index.html", "game/styles.css", "game/game.js"].filter((f) => exists(path.join(TARGET, f)));
    if (gameFiles.length > 0) {
      summary.milestones.push({ at: new Date().toISOString(), milestone: "game-artifact", files: gameFiles });
      log("game.artifact", { files: gameFiles });
      await shot("ui-10-game-artifact.jpeg").catch(() => null);
      stopCause = "game-artifact";
      break;
    }

    // 6j) budget + turns + git counts
    if (now - lastBudgetCheck > 2000) {
      lastBudgetCheck = now;
      budget.turnsByRole = countTurns();
      const b = budgetCheck();
      if (b) { stopCause = b; log("budget.exceeded", { check: b, budget }); break; }
    }
    if (now - lastGitCheck > 5000) {
      lastGitCheck = now;
      budget.gitCalls = countGitCalls();
      if (budget.gitCalls > 4) { stopCause = `budget-git:${budget.gitCalls}>4`; break; }
    }

    // 6k) 9222 isolation watch (must stay unoccupied)
    if (now - lastPortCheck > 15000) {
      lastPortCheck = now;
      try {
        const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
        const lines = ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
        const l9222 = lines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l));
        summary.portsDuringRun.push({ at: new Date().toISOString(), listeners9222: l9222.length, listeners9223: lines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length });
        if (l9222.length > 0) { detectGate({ kind: "port-9222-occupied", lines: l9222 }); }
      } catch (e) { log("ports.check.error", { error: String(e) }); }
    }

    // 6l) stall detection
    const nativeTotal = nativeBytesTotal();
    if (nativeTotal !== lastNativeTotal) { lastNativeTotal = nativeTotal; lastProgressAt = Date.now(); }
    if (msgMark && now - lastProgressAt > STALL_MS) { stopCause = "stalled-no-progress-10min"; break; }

    // 6m) periodic live capture + heartbeat
    if (now - lastHeartbeat > 30000) {
      lastHeartbeat = now;
      try { fs.copyFileSync(tasksPath, path.join(EVID, "live", "tasks-live.jsonl")); } catch {}
      try { for (const f of exists(diagDir) ? fs.readdirSync(diagDir) : []) fs.copyFileSync(path.join(diagDir, f), path.join(EVID, "live", "diagnostics", f)); } catch {}
      fs.writeFileSync(path.join(EVID, "live", "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), elapsedSec: Math.round((now - monitorStart) / 1000), budget, proposalRequestId, resolved: resolvedRow ? { by: resolvedRow.by, choice: resolvedRow.choice } : null, dialogs: summary.dialogs.length, newSessionDirs: summary.newSessionDirs, planToolCalls: summary.planToolCalls.length, planReceipts: summary.planReceipts.length, gate }, null, 2));
    }

    await sleep(400);
  }

  await finalize();
} catch (e) {
  log("run.error", { error: String((e && e.stack) || e) });
  summary.error = String((e && e.stack) || e);
  try {
    fs.writeFileSync(path.join(EVID, "ui-error-body.txt"), await bodyText().catch(() => ""));
    await shot("ui-98-error.jpeg").catch(() => null);
    fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl"));
    if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); mkdirp(d); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } }
    if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch {} }
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
