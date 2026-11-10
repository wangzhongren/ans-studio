// RR2 authorized correction round driver (outside repo; CDP 9223 only).
// Existing flow jinyong-rogue-2d -> chief dispatches product WITH a real roster moduleId (combat-entities,
// app derives moduleDirectory src/combat/) -> product really calls doc_format and writes intent v4 once ->
// prepareIntentConfirmation -> intent-confirm card (<=1) -> operator direct query to project role test-dev
// (<=1, non-customer) -> project role really calls doc_format -> halt at the decisive evidence set.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round2";
const EVID = path.join(RUN, "evidence");
const USERDATA = path.join(RUN, "userData");
const TARGET = path.join(RUN, "target");
const PORT = 9223;
const FLOW_ID = "jinyong-rogue-2d";
const INTENT_REL = "docs/product/jinyong-rogue-2d-intent-v4.md";
const PROJECT_ROLE = "test-dev";
const BUILTIN_ROLES = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"];
const DEADLINE_MS = 20 * 60 * 1000;
const STALL_MS = 8 * 60 * 1000;
const PROJECT_WAIT_MS = 4 * 60 * 1000;
const INTENT_DOC_WAIT_MS = 5 * 60 * 1000;
fs.mkdirSync(path.join(EVID, "live", "diagnostics"), { recursive: true });

const CUSTOMER_MESSAGE = `请为既有 flow \`jinyong-rogue-2d\` 做一个小需求：在现有「2D 金庸武侠 roguelike」（本项目）中增加战斗暂停/继续（按 Esc 暂停与继续，暂停时冻结战斗输入与计时）。本轮只做第一步「产品意图 v4」，请按以下步骤执行：

1. 由幕僚把任务派给产品（product），任务文本写明 flowId=jinyong-rogue-2d 与规范产出路径 docs/product/jinyong-rogue-2d-intent-v4.md（新版本；严禁修改 docs/product/jinyong-rogue-2d-intent-v1.md/-v2.md/-v3.md 或任何其它既有文档）。
2. 产品在写文档前必须先调用 doc_format（format="project-intent/v1"）读权威字段表与最小合法样例；再用一次写入把 docs/product/jinyong-rogue-2d-intent-v4.md 写对。frontmatter 必须含 schema: project-intent/v1、flowId: jinyong-rogue-2d、version: 4、intentId: jinyong-rogue-2d；正文含目标/范围/验收/客户原话。不试错重写。
3. 幕僚派发 product 时，必须携带最新名单 docs/proposals/jinyong-rogue-2d-roster-v11.md 中真实存在的模块（moduleId 用 combat-entities，对应模块目录 src/combat/；应用会从 roster 派生 moduleDirectory）。不要发明模块或目录，不要自报 moduleDirectory，不要猜测派生值。
4. 产品写完后，幕僚用 request_choice（cardKind=intent-confirm）发起意图确认卡；卡须正常呈现（应用会调用 prepareIntentConfirmation 绑定真实字节）。
5. 本轮不要出提案/任命/验收/其它卡，不要写实现代码，不使用 run_shell，不伪造或代填任何工具结果。遇到门禁拒绝、schema 拒绝或阻塞时，如实记录回执原文后停止，不要重试，不要自填应用派生值。

本消息是唯一客户指令。`;
fs.writeFileSync(path.join(EVID, "customer-message.txt"), CUSTOMER_MESSAGE);

const logPath = path.join(EVID, "drive.jsonl");
const redact = (text) => String(text).replace(/(ANTHROPIC_[A-Z_]*\s*[=:]\s*)\S+/gi, "$1[REDACTED]").replace(/(api[_-]?key\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
const log = (type, data) => { const row = { ts: new Date().toISOString(), type, ...(data && typeof data === "object" ? data : { data }) }; try { fs.appendFileSync(logPath, redact(JSON.stringify(row)) + "\n"); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJsonl = (file) => { try { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const mkdirp = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch {} };

const startMark = new Date().toISOString();
const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const versionsPath = path.join(TARGET, ".ans/state/versions.jsonl");
const diagDir = path.join(USERDATA, "ans", "diagnostics");
const sessionsDir = path.join(TARGET, ".ans/sessions");
const intentAbs = path.join(TARGET, INTENT_REL);

let page = null;
for (let i = 0; i < 240; i++) {
  try { const targets = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json()); page = targets.find((x) => x.type === "page"); if (page) break; } catch {}
  await sleep(500);
}
if (!page) { log("run.error", { error: "no cdp page" }); console.log("NO_CDP"); process.exit(1); }
log("cdp.page", { url: page.url, title: page.title, id: page.id, port: PORT });
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0; const pendingCalls = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pendingCalls.has(m.id)) { pendingCalls.get(m.id)(m); pendingCalls.delete(m.id); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const call = (method, params) => new Promise((r) => { const id = ++seq; pendingCalls.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const rawValue = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
const value = async (expr, timeoutMs = 30000) => Promise.race([rawValue(expr), new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate-timeout")), timeoutMs))]);
const shot = async (name) => { try { const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 }); if (!r.result?.data) return null; const file = path.join(EVID, name); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); log("screenshot", { file: name, bytes: fs.statSync(file).size }); return name; } catch (e) { log("screenshot.error", { name, error: String(e) }); return null; } };
const bodyText = async () => value("document.body.innerText").catch(() => "");

const summary = { startedUtc: startMark, round: "RR2", target: TARGET, userData: USERDATA, port: PORT, flowId: FLOW_ID, intentRel: INTENT_REL, projectRole: PROJECT_ROLE,
  customerMessage: CUSTOMER_MESSAGE, customerMessageBytes: Buffer.byteLength(CUSTOMER_MESSAGE), steps: [], roles: [], sessionOpens: {}, productToolCalls: [], productToolResults: [],
  projectToolCalls: [], projectToolResults: [], promptSnapshots: [], dialogs: [], ledgerRows: [], milestones: [], intentDocHistory: [], portsDuringRun: [], stop: null, error: null };
const budget = { customerMessages: 0, cards: 0, cardsByTitle: {}, operatorProjectMessages: 0, productDocFormatCalls: 0, projectRoleDocFormatCalls: 0, modelTurns: {}, wallClockStartUtc: startMark };
let stopCause = null; let gate = null; let halted = false;
let msgMark = null; let lastProgressAt = Date.now();
let intentCardSeen = false; let productReadDone = false; let projectQueryStarted = false; let projectReadDone = false;
let projectQueryAt = 0; let intentDocSeenAt = 0;
let dialogSeq = 0; const dialogsHandled = new Set();
const seenTaskLines = new Set(readJsonl(tasksPath));
const diagState = new Map();

function scanDiagnostics() {
  const rows = [];
  for (const name of exists(diagDir) ? fs.readdirSync(diagDir) : []) {
    const fp = path.join(diagDir, name); const lines = readJsonl(fp); const prev = diagState.get(fp) ?? 0;
    if (lines.length <= prev) { diagState.set(fp, Math.max(prev, lines.length)); continue; }
    for (let i = prev; i < lines.length; i++) { let j = null; try { j = JSON.parse(lines[i]); } catch { continue; } if ((j.at ?? "") < startMark) continue; rows.push({ file: name, ...j }); }
    diagState.set(fp, lines.length);
  }
  return rows;
}

const nativeState = new Map();
const docFormatUseIds = new Map();
function flattenContent(content) { if (typeof content === "string") return content; if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c)))).join("\n"); if (content && typeof content === "object") return JSON.stringify(content); return ""; }
function nativeFilesForRole(role) { const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects"); const out = []; if (!exists(projectsDir)) return out; for (const proj of fs.readdirSync(projectsDir)) { const pdir = path.join(projectsDir, proj); let files = []; try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; } for (const f of files) out.push(path.join(pdir, f)); } return out; }
function scanRoleNative(role) {
  for (const fp of nativeFilesForRole(role)) {
    const lines = readJsonl(fp); const prev = nativeState.get(fp) ?? 0;
    if (lines.length <= prev) { nativeState.set(fp, Math.max(prev, lines.length)); continue; }
    for (let i = prev; i < lines.length; i++) {
      let j = null; try { j = JSON.parse(lines[i]); } catch { continue; }
      const ts = j.timestamp ?? j.at ?? null;
      if (msgMark && ts && ts < msgMark) continue;
      if (j.attachment?.type === "prompt_snapshot") {
        const sys = Array.isArray(j.attachment.systemPrompt) ? j.attachment.systemPrompt.join("\n\n") : String(j.attachment.systemPrompt ?? "");
        const hasGuideline = /先用 doc_format|doc_format 查该格式|doc_format 取索引/.test(sys);
        const idx = sys.indexOf("doc_format"); const excerpt = idx >= 0 ? sys.slice(Math.max(0, idx - 240), idx + 700) : "";
        const h = sha256(Buffer.from(sys));
        if (!summary.promptSnapshots.some((x) => x.role === role && x.systemPromptSha256 === h)) {
          const row = { role, ts, file: path.relative(TARGET, fp).split(path.sep).join("/"), systemPromptBytes: Buffer.byteLength(sys), systemPromptSha256: h, hasDocFormatGuideline: hasGuideline, docFormatExcerpt: excerpt };
          summary.promptSnapshots.push(row); log("prompt.snapshot", { role, ts, systemPromptBytes: row.systemPromptBytes, hasDocFormatGuideline: hasGuideline, systemPromptSha256: h, excerpt: excerpt.slice(0, 400) });
        }
      }
      if (j.type === "assistant" && Array.isArray(j.message?.content)) for (const c of j.message.content) {
        if (c?.type === "tool_use" && typeof c.name === "string" && /doc_format$/.test(c.name)) {
          const row = { role, ts, file: path.relative(TARGET, fp).split(path.sep).join("/"), toolUseId: c.id ?? null, toolName: c.name, input: c.input ?? null, model: j.message?.model ?? null };
          if (role === "product") { summary.productToolCalls.push(row); budget.productDocFormatCalls++; }
          else if (role === PROJECT_ROLE) { summary.projectToolCalls.push(row); budget.projectRoleDocFormatCalls++; }
          else summary.productToolCalls.push({ ...row, extraRole: true });
          log("doc_format.tool_use", row);
          if (!docFormatUseIds.has(role)) docFormatUseIds.set(role, new Set()); docFormatUseIds.get(role).add(c.id);
        }
      }
      if (j.type === "user" && Array.isArray(j.message?.content)) for (const c of j.message.content) {
        if (c?.type !== "tool_result") continue;
        const ids = docFormatUseIds.get(role); const text = flattenContent(c.content);
        const isDoc = (ids && ids.has(c.tool_use_id)) || /doc_format|未知格式|doc-format-specs\/v1/.test(text);
        if (!isDoc) continue;
        const row = { role, ts, file: path.relative(TARGET, fp).split(path.sep).join("/"), toolUseId: c.tool_use_id ?? null, isError: c.is_error ?? null, text: text.slice(0, 12000), textBytes: Buffer.byteLength(text) };
        if (role === "product") summary.productToolResults.push(row);
        else if (role === PROJECT_ROLE) summary.projectToolResults.push(row);
        else summary.productToolResults.push({ ...row, extraRole: true });
        log("doc_format.tool_result", { role, ts, toolUseId: row.toolUseId, textBytes: row.textBytes, head: row.text.slice(0, 500) });
        if (role === "product") productReadDone = true;
        if (role === PROJECT_ROLE) projectReadDone = true;
      }
    }
    nativeState.set(fp, lines.length);
  }
}

function intentFrontmatter() {
  try {
    const text = fs.readFileSync(intentAbs, "utf8"); const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); const fm = {};
    if (m) for (const line of m[1].split(/\r?\n/)) { const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/); if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, ""); }
    return { exists: true, bytes: Buffer.byteLength(text), sha256: sha256(Buffer.from(text)), frontmatter: fm };
  } catch { return { exists: false }; }
}

async function finalize() {
  summary.stop = { stopCause, gate, at: new Date().toISOString(), msgMark, intentCardSeen, productReadDone, projectReadDone, intentDoc: intentFrontmatter(), budget };
  summary.budget = budget; log("monitor.stop", summary.stop);
  fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), await bodyText().catch(() => ""));
  await shot("ui-99-final.jpeg").catch(() => null);
  try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch {}
  try { fs.copyFileSync(versionsPath, path.join(EVID, "versions-final.jsonl")); } catch {}
  if (exists(intentAbs)) { mkdirp(path.join(EVID, "product")); try { fs.copyFileSync(intentAbs, path.join(EVID, "product", path.basename(intentAbs))); } catch {} }
  if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); mkdirp(d); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } }
  if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch {} }
  fs.writeFileSync(path.join(EVID, "drive-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(EVID, "budget.json"), JSON.stringify(budget, null, 2));
  halted = true;
  try { await value(`(() => { const b = document.getElementById('btn-halt'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => null); } catch {}
  await sleep(1000);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1500);
  try { await call("Browser.close", {}); } catch (e) { log("browser.close.error", { error: String(e) }); }
  console.log(JSON.stringify({ stopCause, gate, intentCardSeen, productReadDone, projectReadDone, productToolCalls: summary.productToolCalls.map((r) => ({ role: r.role, input: r.input, model: r.model })), projectToolCalls: summary.projectToolCalls.map((r) => ({ role: r.role, input: r.input, model: r.model })), budget }, null, 2));
  try { ws.close(); } catch {}
  process.exit(0);
}

function detectGate(g) { if (gate) return; gate = g; stopCause = "gate:" + g.kind + (g.errorCode ? ":" + g.errorCode : ""); log("gate.detected", g); shot("ui-09-gate-detected.jpeg").catch(() => null); }

async function openRoleSession(roleId) {
  const t0 = Date.now();
  try { await value(`(() => window.__ansRenderer && window.__ansRenderer.selectRole(${JSON.stringify(roleId)}))()`); } catch (e) { log("role.select.error", { roleId, error: String(e) }); }
  for (let i = 0; i < 120; i++) {
    const st = await value(`(() => { const s = window.__ansRenderer && window.__ansRenderer.state; if (!s) return null; return { openRole: s.sessionOpenRoleId, error: !!(s.roleMeta && s.roleMeta[${JSON.stringify(roleId)}] && s.roleMeta[${JSON.stringify(roleId)}].error) }; })()`).catch(() => null);
    for (const d of scanDiagnostics()) if (d.event === "session.open.ready" && d.roleId === roleId) summary.sessionOpens[roleId] = { at: d.at, via: "diagnostic" };
    if (st && st.openRole === roleId && !st.error) { summary.sessionOpens[roleId] = summary.sessionOpens[roleId] ?? { at: new Date().toISOString(), via: "renderer" }; break; }
    if (st && st.error) { summary.sessionOpens[roleId] = { at: new Date().toISOString(), error: true }; break; }
    await sleep(500);
  }
  log("role.open", { roleId, elapsedMs: Date.now() - t0, result: summary.sessionOpens[roleId] ?? null });
}

function classifyCard(dlg) {
  const title = dlg.title || ""; const optionIds = (dlg.opts ?? []).map((o) => o.id);
  const intentish = /意图|intent/i.test(title) || (optionIds.includes("confirm") && optionIds.includes("revise"));
  return { intentish, optionIds };
}

async function handleDialogOnce(dlg) {
  const rid = dlg.requestId || `no-rid-${dialogSeq}`;
  if (dialogsHandled.has(rid)) return;
  dialogsHandled.add(rid); dialogSeq++;
  const cls = classifyCard(dlg);
  const pre = { seq: dialogSeq, at: new Date().toISOString(), requestId: rid, title: dlg.title, options: dlg.opts, labels: dlg.labels, acks: dlg.acks, submitDisabled: dlg.submitDisabled, confirmDisabled: dlg.confirmDisabled, error: dlg.error, more: dlg.more, intentish: cls.intentish };
  summary.dialogs.push(pre); log("dialog.seen", pre);
  await shot(`ui-dialog-${String(dialogSeq).padStart(2, "0")}-pre.jpeg`).catch(() => null);
  budget.cards++; budget.cardsByTitle[dlg.title || "?"] = (budget.cardsByTitle[dlg.title || "?"] ?? 0) + 1;
  const text = `${dlg.title ?? ""}\n${dlg.bodyTail ?? ""}`;
  const marker = /\[ans-intent-evidence snapshot=([^\s\]]+) path=([^\s\]]+) sha256=([0-9a-f]{64}) version=(\d+)\]/.exec(text);
  if (marker) {
    intentCardSeen = true;
    summary.milestones.push({ at: new Date().toISOString(), milestone: "intent-confirm-card-presented", requestId: rid, title: dlg.title, marker: { snapshot: marker[1], path: marker[2], sha256: marker[3], version: Number(marker[4]) } });
    log("intent.card.presented", { requestId: rid, title: dlg.title, marker: { snapshot: marker[1], path: marker[2], sha256: marker[3], version: Number(marker[4]) } });
    await shot("ui-10-intent-card.jpeg").catch(() => null);
    return;
  }
  if (!cls.intentish) detectGate({ kind: "unexpected-card", requestId: rid, title: dlg.title, options: dlg.opts, at: new Date().toISOString() });
  else { summary.milestones.push({ at: new Date().toISOString(), milestone: "intent-like-card-without-marker", requestId: rid, title: dlg.title }); await shot("ui-10-card-without-marker.jpeg").catch(() => null); }
}

async function sendMessage(text, label) {
  await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return 'missing'; ta.focus(); return document.activeElement === ta; })()`);
  try { await call("Input.insertText", { text }); } catch {}
  let current = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  if (current !== text) await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false; const proto = Object.getPrototypeOf(ta); const desc = Object.getOwnPropertyDescriptor(proto, 'value'); if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(text)}); else ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const mark = new Date().toISOString();
  await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false; ta.focus(); const o = { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }; ta.dispatchEvent(new KeyboardEvent('keydown', o)); ta.dispatchEvent(new KeyboardEvent('keyup', o)); return true; })()`);
  await sleep(1500);
  let after = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`);
  if (after !== "") { await value(`(() => { const ta = document.getElementById('inp-message'); if (!ta) return false; ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); return true; })()`); await sleep(1500); after = await value(`(() => { const ta = document.getElementById('inp-message'); return ta ? ta.value : null; })()`); }
  const ok = after === ""; log("compose.sent", { label, cleared: ok, mark }); return { ok, mark };
}

async function confirmIntentCardViaDom() {
  const result = await value(`(() => { const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' }; for (const a of d.querySelectorAll('.dd-ack input')) { if (!a.checked) a.click(); } const opts = Array.from(d.querySelectorAll('.dd-options input')); let target = opts.find((i) => /accept|approve|confirm|agree|yes|ok/i.test(i.value)); if (!target) target = opts[0]; if (target && !target.checked) target.click(); const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm'); if (sub) { if (!sub.disabled) { sub.click(); return { result: 'submitted', selected: target ? target.value : null }; } return { result: 'submit-disabled' }; } if (conf) { if (!conf.disabled) { conf.click(); return { result: 'confirmed' }; } return { result: 'confirm-disabled' }; } return { result: 'no-actions' }; })()`).catch((e) => ({ result: "error", error: String(e) }));
  log("dialog.confirm-fallback", { result }); await sleep(2000); return result;
}

try {
  for (let i = 0; i < 240; i++) { const ready = await value("typeof window.desktop === 'object' && document.readyState !== 'loading'").catch(() => false); if (ready) break; await sleep(500); }
  log("window.ready", { title: await value("document.title").catch(() => null) }); await shot("ui-00-launch.jpeg");

  const importClick = await value(`(() => { const b = document.getElementById('btn-import'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => "error");
  log("import.click", { importClick }); if (importClick !== "clicked") { detectGate({ kind: "import-click-failed" }); await finalize(); }
  let psOut = "";
  try { psOut = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(RUN, "scripts", "select-folder-auto.ps1"), "-Path", TARGET], { encoding: "utf8", timeout: 30000 }); } catch (e) { psOut = "PS_ERROR " + String(e.stdout || e.message); }
  log("import.dialog", { psOut: psOut.trim() }); await sleep(4000); await shot("ui-01-imported.jpeg");
  fs.writeFileSync(path.join(EVID, "ui-01-imported-body.txt"), await bodyText());

  let listing = null;
  for (let i = 0; i < 60; i++) { listing = await value(`(() => { const s = window.__ansRenderer && window.__ansRenderer.state; if (!s) return null; return { projectRoot: s.projectRoot, roles: s.roles, primaryRoleId: s.primaryRoleId, hasRoles: s.hasRoles }; })()`).catch(() => null); if (listing && listing.projectRoot && Array.isArray(listing.roles) && listing.roles.length >= 7) break; await sleep(500); }
  summary.roles = listing?.roles ?? [];
  log("roles.listing", { projectRoot: listing?.projectRoot, count: summary.roles.length, roles: summary.roles.map((r) => ({ roleId: r.roleId, builtIn: r.builtIn, governanceFunction: r.governanceFunction })) });
  const roleIds = summary.roles.map((r) => r.roleId); const missingBuiltin = BUILTIN_ROLES.filter((r) => !roleIds.includes(r));
  if (!listing || !listing.projectRoot || missingBuiltin.length) { detectGate({ kind: "roles-listing-incomplete", missingBuiltin }); await finalize(); }
  await shot("ui-02-roles.jpeg");

  for (const roleId of BUILTIN_ROLES) await openRoleSession(roleId);
  await shot("ui-03-builtin-sessions-open.jpeg");

  await openRoleSession("chief");
  const sent = await sendMessage(CUSTOMER_MESSAGE, "customer");
  if (!sent.ok) { detectGate({ kind: "customer-send-failed" }); await finalize(); }
  msgMark = sent.mark; budget.customerMessages = 1; summary.steps.push({ step: "customer-message-sent", at: sent.mark });
  await shot("ui-04-customer-message.jpeg"); lastProgressAt = Date.now();
  const monitorStart = Date.now(); let lastHeartbeat = 0; let lastPortCheck = 0; let lastIntentCheck = 0;

  while (true) {
    const now = Date.now();
    if (now - monitorStart > DEADLINE_MS) { stopCause = "deadline-20min"; break; }
    if (msgMark && now - lastProgressAt > STALL_MS) { stopCause = "stalled-no-progress-8min"; break; }

    for (const line of readJsonl(tasksPath)) {
      if (seenTaskLines.has(line)) continue; seenTaskLines.add(line);
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || !j.at || j.at < startMark) continue;
      lastProgressAt = Date.now();
      const row = { at: j.at, kind: j.kind, requestId: j.requestId, taskId: j.taskId, from: j.from, to: j.to, cardKind: j.cardKind, flowId: j.flowId, moduleId: j.moduleId, moduleDirectory: j.moduleDirectory, modulePaths: j.modulePaths, title: j.title, choice: j.choice, by: j.by, status: j.status, summary: typeof j.summary === "string" ? j.summary.slice(0, 400) : undefined };
      summary.ledgerRows.push(row); log("task.row", row);
      if (j.kind === "task.created") summary.milestones.push({ at: j.at, milestone: "dispatch", taskId: j.taskId, from: j.from, to: j.to, flowId: j.flowId, moduleId: j.moduleId ?? null, moduleDirectory: j.moduleDirectory ?? null, modulePaths: j.modulePaths ?? null });
      if (j.kind === "task.reported" && (j.status === "failed" || j.status === "blocked") && !gate) detectGate({ kind: "task-reported-" + j.status, taskId: j.taskId, role: j.from, summary: String(j.summary ?? "").slice(0, 600), at: j.at });
      if (j.kind === "request.created") {
        const opts = Array.isArray(j.options) ? j.options.map((o) => o.id) : [];
        const intentish = j.cardKind === "intent-confirm" || /意图|intent/i.test(j.title ?? "") || (opts.includes("confirm") && opts.includes("revise"));
        if (!intentish) detectGate({ kind: "unexpected-card-ledger", requestId: j.requestId, cardKind: j.cardKind ?? null, title: j.title ?? null, at: j.at });
      }
    }

    for (const d of scanDiagnostics()) {
      const ev = d.event || d.kind || "?"; if (/decision|interaction|delivery|session\.open|blocked|failed|prepare|intent|governance\.card/i.test(String(ev))) {
        lastProgressAt = Date.now(); log("diag", { event: ev, at: d.at, roleId: d.roleId, ok: d.ok, requestId: d.requestId, errorMessage: d.errorMessage, phase: d.phase, reasonCode: d.reasonCode });
        if (ev === "interaction.response.end" && d.ok === false) detectGate({ kind: "interaction-response-failed", at: d.at, requestId: d.requestId, errorMessage: d.errorMessage });
      }
    }

    if (msgMark) for (const role of ["chief", "product", PROJECT_ROLE]) scanRoleNative(role);

    if (now - lastIntentCheck > 1500) {
      lastIntentCheck = now; const st = intentFrontmatter();
      if (st.exists) {
        const sig = `${st.bytes}:${st.sha256}`;
        if (!summary.intentDocHistory.some((x) => x.sig === sig)) { const row = { at: new Date().toISOString(), sig, bytes: st.bytes, sha256: st.sha256, frontmatter: st.frontmatter }; summary.intentDocHistory.push(row); log("intent.doc", row); summary.milestones.push({ at: row.at, milestone: "intent-doc-written", bytes: row.bytes, sha256: row.sha256, frontmatter: row.frontmatter }); await shot("ui-08-intent-doc.jpeg").catch(() => null); }
        if (!intentDocSeenAt) intentDocSeenAt = now; lastProgressAt = Date.now();
      }
    }

    const dlg = await value(`(() => { const d = document.getElementById('decision-dialog'); const shell = document.querySelector('.sc-overlay'); const shellVisible = !!(shell && !shell.hidden); let shellInfo = null; if (shellVisible) { const t = document.getElementById('sc-title'); shellInfo = { title: t ? t.textContent : null }; } if (!d) return { dialog: null, shellVisible, shellInfo }; const title = (document.getElementById('dd-title') || {}).textContent || ''; const opts = Array.from(d.querySelectorAll('.dd-options input')).map((i) => ({ id: i.value, checked: i.checked })); const labels = Array.from(d.querySelectorAll('.dd-option-label')).map((s) => s.textContent || ''); const acks = Array.from(d.querySelectorAll('.dd-ack input')).map((a) => ({ id: a.value, checked: a.checked })); const submit = d.querySelector('.dd-submit'); const confirm = d.querySelector('.dd-confirm'); const err = d.querySelector('.dd-error'); const more = d.querySelector('.dd-more'); return { dialog: { requestId: d.dataset.requestId || '', title, opts, labels, acks, submitDisabled: submit ? submit.disabled : null, confirmDisabled: confirm ? confirm.disabled : null, hasSubmit: !!submit, hasConfirm: !!confirm, error: err ? err.textContent : null, more: more ? more.textContent : null, bodyTail: document.body.innerText.slice(-4000) }, shellVisible, shellInfo }; })()`).catch(() => ({ dialog: null, shellVisible: false, shellInfo: null }));
    if (dlg?.shellVisible && !gate) detectGate({ kind: "shell-confirm-card", title: dlg.shellInfo?.title ?? null, at: new Date().toISOString() });
    if (dlg?.dialog && !dialogsHandled.has(dlg.dialog.requestId || `no-rid-${dialogSeq + 1}`)) await handleDialogOnce(dlg.dialog);

    const intentReady = productReadDone && intentDocSeenAt && (intentCardSeen || now - intentDocSeenAt > INTENT_DOC_WAIT_MS);
    if (!projectQueryStarted && intentReady) {
      projectQueryStarted = true; projectQueryAt = now;
      summary.milestones.push({ at: new Date().toISOString(), milestone: "project-role-query-start", role: PROJECT_ROLE, intentCardSeen });
      await openRoleSession(PROJECT_ROLE);
      const q = await sendMessage(`请调用 doc_format 工具了解文档格式：先无参数获取格式索引，再用 format="project-intent/v1"（可加 part="fields"）读取该格式说明。请原样回复你收到的回执关键内容（首行、格式 id、字段/样例要点）与调用状态。只读查询，不要写任何文件、不要修改任何状态。`, "operator-project-role");
      if (q.ok) { budget.operatorProjectMessages = 1; log("operator.message.sent", { role: PROJECT_ROLE, at: q.mark }); }
      else { log("operator.message.blocked", { role: PROJECT_ROLE }); await confirmIntentCardViaDom(); const q2 = await sendMessage(`请调用 doc_format 工具了解文档格式：先无参数获取格式索引，再用 format="project-intent/v1" 读取该字段说明。请原样回复回执关键内容与调用状态。只读查询，不要写文件。`, "operator-project-role-retry"); if (q2.ok) { budget.operatorProjectMessages = 1; log("operator.message.sent.after-card", { role: PROJECT_ROLE, at: q2.mark }); } else detectGate({ kind: "operator-send-failed", role: PROJECT_ROLE }); }
      await shot("ui-11-project-role-query.jpeg").catch(() => null);
    }

    if (productReadDone && projectQueryStarted && (projectReadDone || (projectQueryAt && now - projectQueryAt > PROJECT_WAIT_MS))) { stopCause = projectReadDone ? "decisive-evidence-complete" : "project-role-read-timeout"; break; }

    if (budget.productDocFormatCalls > 3) { stopCause = `budget-product-doc-format:${budget.productDocFormatCalls}>3`; break; }
    if (budget.projectRoleDocFormatCalls > 1) { stopCause = `budget-project-doc-format:${budget.projectRoleDocFormatCalls}>1`; break; }
    if (budget.cards > 1) { stopCause = `budget-cards:${budget.cards}>1`; break; }
    if (budget.operatorProjectMessages > 1) { stopCause = `budget-operator:${budget.operatorProjectMessages}>1`; break; }

    if (now - lastPortCheck > 15000) {
      lastPortCheck = now;
      try { const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" }); const lines = ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l)); const l9222 = lines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)); summary.portsDuringRun.push({ at: new Date().toISOString(), listeners9222: l9222.length, listeners9223: lines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length }); if (l9222.length > 0) detectGate({ kind: "port-9222-observed-listening", lines: l9222 }); } catch {}
    }
    if (now - lastHeartbeat > 30000) { lastHeartbeat = now; try { fs.copyFileSync(tasksPath, path.join(EVID, "live", "tasks-live.jsonl")); } catch {} try { for (const f of exists(diagDir) ? fs.readdirSync(diagDir) : []) fs.copyFileSync(path.join(diagDir, f), path.join(EVID, "live", "diagnostics", f)); } catch {} fs.writeFileSync(path.join(EVID, "live", "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), elapsedSec: Math.round((now - monitorStart) / 1000), budget, intentCardSeen, productReadDone, projectQueryStarted, projectReadDone, gate }, null, 2)); }
    await sleep(400);
  }
  for (const role of ["chief", "product", PROJECT_ROLE]) scanRoleNative(role);
  await finalize();
} catch (e) {
  log("run.error", { error: String((e && e.stack) || e) }); summary.error = String((e && e.stack) || e);
  try { fs.writeFileSync(path.join(EVID, "ui-error-body.txt"), await bodyText().catch(() => "")); await shot("ui-98-error.jpeg").catch(() => null); fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); mkdirp(d); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } } if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch {} } fs.writeFileSync(path.join(EVID, "drive-summary.json"), JSON.stringify(summary, null, 2)); fs.writeFileSync(path.join(EVID, "budget.json"), JSON.stringify(budget, null, 2)); } catch {}
  try { await value(`(() => { const b = document.getElementById('btn-halt'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => null); } catch {}
  await sleep(800);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1200);
  try { await call("Browser.close", {}); } catch {}
  console.error("DRIVER_ERROR", e); process.exit(1);
}
