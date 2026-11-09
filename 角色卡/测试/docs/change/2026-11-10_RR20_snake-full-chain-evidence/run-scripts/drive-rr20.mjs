// RR20 drive (plan A retry): snake full-chain continuation on the same-root RE-CLEANED copy (round8\target
// after RR20 preparation: RR17 run sessions moved out, .ans/state/tasks.jsonl reset to empty again; RR8 init
// artifacts, repoId and the original init operation are preserved and never re-initialized). ONE customer
// message: 4-target standard bootstrap VCA direct (app auto-assembles the 9-file frozen closure:
// 4 current targets + 8 frozen records incl intent v1 + versions.jsonl) ->
// first effective trunk manifest / refs/ans/trunk -> initial workflow publication via request_stable_write ->
// stable-write customer card (**driver explicitly selects approve-stable-write, NOT recommended**) -> team plan
// (complete_team_plan, app-derived base/sha/runId) -> run pin -> D3 appointment / role cards / activation /
// implementation -> stop at the FIRST decisive result (game output / next hard gate / budget / 45min).
// RR20 budget change vs RR17: Git ability calls cap raised to <= 8; task text asks for status/log-first,
// routine read-only queries ideally <= 3, avoid unnecessary rev-parse/branch-list.
// Driver hardening (RR16 refinement): blocked/rejected receipts of MUTATION/GATE tools stop the run
// immediately (`submit_version_change`, `request_stable_write`, `complete_team_plan`, `git_candidate`,
// `git_publish`, `activate_role_documents`, `select_run_change`, `submit_report`); read-only `git_query`
// blocked/rejected is recorded but does NOT stop the run.
// No auto-retry, no additional customer messages, no state forgery, no writes outside round20 + the target.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const RR = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round20";
const EVID = path.join(RR, "evidence");
const USERDATA = path.join(RR, "userData");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round8\\target";
const PORT = 9223;
const DEADLINE_MS = 36 * 60 * 1000;   // message -> hard stop (total wall clock incl. launch/finalize < 45 min)
const STALL_MS = 10 * 60 * 1000;      // no progress at all after the message
const GAME_DRAIN_MS = 60 * 1000;      // after first game artifact appears, bounded drain then stop
const TEAMPLAN_GATE_WAIT_MS = 4 * 60 * 1000; // trunk-unavailable observed: allow bounded continuation
fs.mkdirSync(path.join(EVID, "live", "diagnostics"), { recursive: true });

const CUSTOMER_MESSAGE = `请继续完成「2D 贪吃蛇小游戏」项目（沿用本项目现有 target 与 flow snake-game）。本轮按以下顺序推进：

第一步（4-target 标准 bootstrap VCA）：由产品用 submit_version_change（kind=version-upgrade，baseTrunk:null）提交首个 trunk bootstrap；targets 仅含当前版本 4 项：docs/proposals/snake-game-proposal-v2.md、docs/proposals/snake-game-modules-v1.md、docs/proposals/snake-game-roster-v2.md（roster-v2 782d6bcd623f8c7e81aa5e6e8a89e540efe9b7278737307c41f0b335d21bea8a）、docs/contracts/snake-game-architecture-v2.md；**所有 targets 的 expectedFromSha256 必须为 null**（bootstrap 无既有有效基线，不得填 frozen 记录 hash）；action 按 doc_format("version-change/v1") 返回的 schema 选择。应用将自动装配 9 文件快照（8 条 frozen 记录含 intent v1 + .ans/state/versions.jsonl），candidate/publication 应 allowed、t1 提交应成功；**不要**将 v1 历史文件列为 targets。提交须带显式新 operationId（以 -02 结尾，禁止复用 RR19 的 op-snake-game-trunk-bootstrap-20261110-01/快照 s-9fbf9c81…）；若 schema 不允许或回执非成功，记录回执原文后停止。VCA 通过后确认首个 effective trunk manifest 与 refs/ans/trunk 已生成。

第二步（初始 workflow + 团队计划）：由 convener 走受支持的 request_stable_write（写 docs/workflow.md）；stable-write 客户卡出现时客户将选择「放行执行」（显式 approve），随后完成初始 workflow 发布。再由 convener 用 complete_team_plan 登记团队计划 docs/scheduling/snake-game-team-v2.md；调用时不要自带 baseDigest、plan.sha256 或 runId（由应用派生/绑定，勿猜）。随后完成 run pin。

第三步（任命与实现）：任命 D3（客户确认名单，roster v2）；nominator 完成角色卡/激活；convener 发布工作流并派发实现，直到产出可玩的贪吃蛇游戏或到达下一门并停止。

硬性要求：**禁止调用 run_shell；需要 Git/仓库信息一律使用 git_query（优先 status/log；例行只读查询尽量控制在 3 次以内，避免不必要的 rev-parse/branch-list）。** 不要改写任何已冻结文档或旧版本文件；如需新文档只能新建更高版本号；不要用新 operationId 重新初始化 trunk；不要手写 manifest/账本/冻结/run manifest；不要伪造或代填工具结果；不要自填应用派生值。所有客户卡经真实 UI 呈现并确认，总数不超过 4 张。遇到变更/门工具（submit_version_change/request_stable_write/complete_team_plan/git_candidate/git_publish/activate_role_documents/select_run_change/submit_report）的 blocked 或拒绝回执，如实记录回执原文后立即停止，不重试。

本条消息是唯一客户指令。`;
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
const runsDir = path.join(TARGET, ".ans/runs");
const snapshotsDir = path.join(TARGET, ".ans/trunk/snapshots");
const sessionsDir = path.join(TARGET, ".ans/sessions");
const schedulingDir = path.join(TARGET, "docs", "scheduling");
const preManifest = (() => { try { return JSON.parse(fs.readFileSync(path.join(EVID, "pre", "target-manifest-pre.json"), "utf8")); } catch { return { files: [] }; } })();
const preRelSet = new Set((preManifest.files ?? []).map((f) => f.rel));

// ---------- CDP ----------
let page = null;
for (let i = 0; i < 240; i++) {
  try { const targets = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json()); page = targets.find((x) => x.type === "page"); if (page) break; } catch {}
  await sleep(500);
}
if (!page) { log("run.error", { error: "no cdp page", port: PORT }); console.log("NO_CDP"); process.exit(1); }
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

// ---------- state ----------
const summary = {
  startedUtc: startMark, round: "RR20", target: TARGET, userData: USERDATA, port: PORT, flowId: "snake-game",
  customerMessage: CUSTOMER_MESSAGE, customerMessageBytes: Buffer.byteLength(CUSTOMER_MESSAGE),
  steps: [], roles: [], sessionOpens: {}, ledgerRows: [], dispatchRows: [], requestRows: [], dialogs: [], dialogActions: [],
  toolCalls: [], toolResults: [], promptSnapshots: [], completeTeamPlan: { calls: [], receipts: [] },
  gitCalls: { calls: [], receipts: [] }, reports: [], diagnosticsOfInterest: [], gameFiles: [], gameFileHistory: [],
  trunkArtifacts: [], schedulingHistory: [], initSourcesPost: [], snapshotsNew: [], runsNew: [], milestones: [],
  portsDuringRun: [], restoreDeliveries: [], models: {}, stop: null, error: null,
};
const budget = { customerMessages: 0, cardsTotal: 0, cardsByKind: {}, dispatches: 0, turnsByRole: {}, gitCalls: 0, runShellCalls: 0, writeEdits: 0 };
let msgMark = null;
let stopCause = null; let gate = null; let halted = false;
let lastProgressAt = Date.now();
let lastPortCheck = 0; let lastHeartbeat = 0; let lastGameScan = 0;
let dialogSeq = 0; const dialogsHandled = new Set();
const seenTaskLines = new Set(readJsonl(tasksPath));
const diagState = new Map();
const reqInfo = new Map(); // requestId -> request.created row
let teamPlanGateAt = 0; let teamPlanGateCode = null;
let initAttempted = false; let initPrepared = false; let initRejected = null;
let teamPlanOk = false; let gameFirstSeenAt = 0; let gameDrainStartedAt = 0; let trunkPublished = false;
let restoreSeen = 0;

function detectGate(g) { if (gate) return; gate = g; stopCause = "gate:" + g.kind + (g.errorCode ? ":" + g.errorCode : ""); log("gate.detected", g); shot("ui-09-gate-detected.jpeg").catch(() => null); }

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

// ---------- native transcript scanning (all roles) ----------
const nativeState = new Map();
const toolUseIndex = new Map(); // tool_use id -> {role, name, input, ts, file}
function flattenContent(content) { if (typeof content === "string") return content; if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c)))).join("\n"); if (content && typeof content === "object") return JSON.stringify(content); return ""; }
function nativeFilesForRole(role) { const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects"); const out = []; if (!exists(projectsDir)) return out; for (const proj of fs.readdirSync(projectsDir)) { const pdir = path.join(projectsDir, proj); let files = []; try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; } for (const f of files) out.push(path.join(pdir, f)); } return out; }
const WATCH_TOOLS = /^(mcp__ans__)?(complete_team_plan|submit_version_change|git_query|git_candidate|git_publish|request_choice|request_confirmation|request_stable_write|dispatch_task|submit_report|activate_role_documents|select_run_change|close_created_task|run_shell|write_file|edit_file|doc_format)$/;
const RECEIPT_TOOLS = /^(mcp__ans__)?(complete_team_plan|submit_version_change|git_candidate|git_publish|git_query|request_choice|request_confirmation|request_stable_write|dispatch_task|submit_report|activate_role_documents|select_run_change|close_created_task)$/;
function scanAllRoleNative() {
  for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
    if (!exists(path.join(sessionsDir, role)) || !fs.statSync(path.join(sessionsDir, role)).isDirectory()) continue;
    for (const fp of nativeFilesForRole(role)) {
      const lines = readJsonl(fp); const prev = nativeState.get(fp) ?? 0;
      if (lines.length <= prev) { nativeState.set(fp, Math.max(prev, lines.length)); continue; }
      for (let i = prev; i < lines.length; i++) {
        let j = null; try { j = JSON.parse(lines[i]); } catch { continue; }
        const ts = j.timestamp ?? j.at ?? null;
        if (msgMark && ts && ts < msgMark) continue;
        if (j.attachment?.type === "prompt_snapshot") {
          const sys = Array.isArray(j.attachment.systemPrompt) ? j.attachment.systemPrompt.join("\n\n") : String(j.attachment.systemPrompt ?? "");
          const h = sha256(Buffer.from(sys));
          if (!summary.promptSnapshots.some((x) => x.role === role && x.systemPromptSha256 === h)) {
            summary.promptSnapshots.push({ role, ts, systemPromptBytes: Buffer.byteLength(sys), systemPromptSha256: h });
            log("prompt.snapshot", { role, ts, bytes: Buffer.byteLength(sys), sha256: h });
          }
        }
        if (j.type === "assistant" && Array.isArray(j.message?.content)) {
          const model = j.message?.model ?? null;
          if (model) summary.models[model] = (summary.models[model] ?? 0) + 1;
          for (const c of j.message.content) {
            if (c?.type !== "tool_use" || typeof c.name !== "string") continue;
            const short = c.name.replace(/^mcp__ans__/, "");
            const entry = { role, ts, name: short, toolUseId: c.id ?? null, input: c.input ?? null, model, file: path.relative(TARGET, fp).split(path.sep).join("/") };
            if (c.id) toolUseIndex.set(c.id, entry);
            if (WATCH_TOOLS.test(c.name) || short === "run_shell") {
              summary.toolCalls.push(entry); log("tool.use", entry);
            }
            if (/^git_(query|candidate|publish)$/.test(short)) {
              budget.gitCalls++; summary.gitCalls.calls.push(entry);
              if (short === "git_candidate" && entry.input?.action === "init") { initAttempted = true; summary.milestones.push({ at: new Date().toISOString(), milestone: "git-candidate-init-attempt", operationId: entry.input?.operationId ?? null, input: entry.input }); log("git.init.attempt", entry); shot("ui-20-git-init-attempt.jpeg").catch(() => null); }
            }
            if (short === "run_shell") { budget.runShellCalls++; detectGate({ kind: "run-shell-called", role, input: String(entry.input?.command ?? "").slice(0, 300) }); }
            if (short === "complete_team_plan") summary.completeTeamPlan.calls.push(entry);
            if (short === "request_choice" || short === "request_confirmation") { /* cards counted from ledger */ }
            if (short === "dispatch_task") { /* dispatches counted from ledger */ }
            if (short === "write_file" || short === "edit_file") budget.writeEdits++;
          }
        }
        if (j.type === "user" && Array.isArray(j.message?.content)) for (const c of j.message.content) {
          if (c?.type !== "tool_result") continue;
          const use = toolUseIndex.get(c.tool_use_id); if (!use) continue;
          const text = flattenContent(c.content);
          if (RECEIPT_TOOLS.test("mcp__ans__" + use.name) && /^(complete_team_plan|submit_version_change|git_query|git_candidate|git_publish|request_choice|request_confirmation|request_stable_write|dispatch_task|submit_report|activate_role_documents|select_run_change|close_created_task)$/.test(use.name)) {
            const row = { role: use.role, ts, name: use.name, toolUseId: c.tool_use_id, isError: c.is_error ?? null, text: text.slice(0, 12000), textBytes: Buffer.byteLength(text) };
            summary.toolResults.push(row); log("tool.result", { role: use.role, name: use.name, ts, textHead: text.slice(0, 800) });
            // RR16 hardening (refined): blocked/rejected receipts stop the run ONLY for mutation/gate tools;
            // read-only git_query rejections are recorded (summary.toolResults above) but never gate.
            {
              const tm = (re) => { const x = text.match(re); return x ? x[1] : null; };
              const okv = tm(/"ok"\s*:\s*(true|false)/);
              const stv = tm(/"status"\s*:\s*"([A-Za-z0-9-]+)"/);
              const codev = tm(/"code"\s*:\s*"([A-Za-z0-9-]+)"/) ?? tm(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/);
              const tech = /\[技术 code：([A-Za-z0-9-]+)\]/.exec(text.slice(0, 1500));
              const strict = /^(submit_version_change|request_stable_write|complete_team_plan|git_candidate|git_publish|activate_role_documents|select_run_change|close_created_task)$/.test(use.name);
              const reportBlocked = use.name === "submit_report" && /status[：:]\s*(blocked|failed)/i.test(text.slice(0, 800));
              const hard = (strict && (okv === "false" || /^(blocked|rejected)$/.test(stv ?? "") || tech !== null)) || reportBlocked;
              if (hard) detectGate({ kind: "tool-rejected:" + use.name, errorCode: codev ?? (tech ? tech[1] : null), status: stv, message: String(tm(/"message"\s*:\s*"([^"]*)"/) ?? text.slice(0, 240)).slice(0, 300) });
            }
            if (use.name === "complete_team_plan") {
              const m = (re) => { const x = text.match(re); return x ? x[1] : null; };
              const rec = { role: use.role, ts, ok: m(/"ok"\s*:\s*(true|false)/), status: m(/"status"\s*:\s*"([A-Za-z0-9-]+)"/), errorCode: m(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/), message: m(/"message"\s*:\s*"([^"]*)"/), operationId: m(/"operationId"\s*:\s*"([^"]+)"/), baseDigest: m(/"baseDigest"\s*:\s*"(null|[0-9a-fA-F]{64})"/), targetDigest: m(/"targetDigest"\s*:\s*"(null|[0-9a-fA-F]{64})"/), planRefSha256: m(/"planRef"\s*:\s*\{[^}]*?"sha256"\s*:\s*"([0-9a-fA-F]{64})"/s), sourceRunId: m(/"source"\s*:\s*\{[^}]*?"runId"\s*:\s*"([^"]+)"/s), textHead: text.slice(0, 4000) };
              summary.completeTeamPlan.receipts.push(rec); log("teamplan.receipt", rec);
              summary.milestones.push({ at: new Date().toISOString(), milestone: "complete-team-plan-receipt", receipt: rec });
              if (rec.ok === "true") { teamPlanOk = true; }
              else if (rec.errorCode && /trunk-unavailable|plan-basis-incomplete|plan-/.test(rec.errorCode)) {
                if (!initPrepared) {
                  teamPlanGateAt = Date.now(); teamPlanGateCode = rec.errorCode;
                  summary.milestones.push({ at: new Date().toISOString(), milestone: "team-plan-gate", code: rec.errorCode, message: rec.message });
                  if (rec.errorCode !== "trunk-unavailable" && rec.errorCode !== "plan-basis-incomplete" && !/^plan-basis/.test(rec.errorCode)) detectGate({ kind: "team-plan-rejected", errorCode: rec.errorCode, message: rec.message });
                } else {
                  detectGate({ kind: "team-plan-rejected-after-init", errorCode: rec.errorCode, message: rec.message });
                }
              } else if (rec.ok === "false") detectGate({ kind: "team-plan-rejected", errorCode: rec.errorCode, message: rec.message });
            }
            if (use.name === "git_candidate" && use.input?.action === "init") {
              const m = (re) => { const x = text.match(re); return x ? x[1] : null; };
              const rec = { role: use.role, ts, status: m(/"status"\s*:\s*"([A-Za-z0-9-]+)"/), code: m(/"code"\s*:\s*"([A-Za-z0-9-]+)"/), message: m(/"message"\s*:\s*"([^"]*)"/), repoId: m(/"repoId"\s*:\s*"([^"]+)"/), textHead: text.slice(0, 4000) };
              summary.gitCalls.receipts.push(rec); log("git.init.receipt", rec);
              summary.milestones.push({ at: new Date().toISOString(), milestone: "git-init-receipt", receipt: rec });
              if (rec.status === "prepared") { initPrepared = true; shot("ui-21-git-init-prepared.jpeg").catch(() => null); }
              else { initRejected = rec; detectGate({ kind: "git-init-rejected", errorCode: rec.code ?? rec.status ?? "unknown", message: rec.message }); }
            }
            if (use.name === "request_stable_write") {
              const m = (re) => { const x = text.match(re); return x ? x[1] : null; };
              const rec = { role: use.role, ts, ok: m(/"ok"\s*:\s*(true|false)/), errorCode: m(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/), textHead: text.slice(0, 2500) };
              summary.milestones.push({ at: new Date().toISOString(), milestone: "stable-write-request-receipt", receipt: rec });
              log("stablewrite.request.receipt", rec);
              if (rec.ok === "false" || rec.errorCode || /unavailable|not supported|无法|不支持/.test(text.slice(0, 800))) detectGate({ kind: "stable-write-request-rejected", errorCode: rec.errorCode });
            }
            if (use.name === "git_candidate" && use.input?.action !== "init") {
              const st = (text.match(/"status"\s*:\s*"([A-Za-z0-9-]+)"/) ?? [])[1] ?? null;
              const code = (text.match(/"code"\s*:\s*"([A-Za-z0-9-]+)"/) ?? [])[1] ?? null;
              summary.milestones.push({ at: new Date().toISOString(), milestone: "git-candidate-" + String(use.input?.action ?? "?") + "-receipt", status: st, code });
              if (/^(blocked|rejected)$/.test(st ?? "")) detectGate({ kind: "git-candidate-rejected", errorCode: code, message: st });
            }
            if (/^(activate_role_documents|select_run_change|git_publish)$/.test(use.name)) {
              const m = (re) => { const x = text.match(re); return x ? x[1] : null; };
              const rec = { role: use.role, ts, name: use.name, ok: m(/"ok"\s*:\s*(true|false)/), status: m(/"status"\s*:\s*"([A-Za-z0-9-]+)"/), code: m(/"code"\s*:\s*"([A-Za-z0-9-]+)"/) ?? m(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/), message: m(/"message"\s*:\s*"([^"]*)"/) };
              summary.milestones.push({ at: new Date().toISOString(), milestone: "decisive-tool-receipt", receipt: rec });
              if (rec.ok === "false" || /^(blocked|rejected)$/.test(rec.status ?? "")) detectGate({ kind: "tool-rejected:" + use.name, errorCode: rec.code, message: rec.message });
            }
          }
          if (/^(write_file|edit_file)$/.test(use.name)) {
            const p = String(use.input?.path ?? use.input?.file_path ?? "");
            if (/^docs\//.test(p) || !/^\.ans\//.test(p)) summary.toolCalls.push({ ...use, path: p, resultHead: text.slice(0, 300) });
          }
        }
      }
      nativeState.set(fp, lines.length);
    }
  }
}

function schedulingList() {
  const list = [];
  for (const sub of ["docs/scheduling", "docs/proposals", "docs/contracts", "docs/product", "docs/intents"]) {
    const dir = path.join(TARGET, sub);
    if (!exists(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (!fs.statSync(p).isFile()) continue;
      list.push({ rel: sub + "/" + name, bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)), mtime: fs.statSync(p).mtime.toISOString() });
    }
  }
  return list;
}

function scanGameFiles() {
  const out = [];
  (function walk(dir, depth) {
    if (depth > 4) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      const rel = path.relative(TARGET, p).split(path.sep).join("/");
      if (rel === ".ans" || rel.startsWith(".ans/") || rel === ".git" || rel.startsWith(".git/") || rel === "docs" || rel.startsWith("docs/") || rel === "角色卡" || rel.startsWith("角色卡/")) continue;
      if (ent.isDirectory()) walk(p, depth + 1);
      else if (ent.isFile()) out.push({ rel, bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)) });
    }
  })(TARGET, 0);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

function scanTrunkArtifacts() {
  const out = [];
  const manifest = path.join(TARGET, ".ans/trunk/manifest.json");
  if (exists(manifest)) out.push({ kind: "trunk-manifest", rel: ".ans/trunk/manifest.json", bytes: fs.statSync(manifest).size, sha256: sha256(fs.readFileSync(manifest)), mtime: fs.statSync(manifest).mtime.toISOString() });
  const gm = path.join(TARGET, ".ans/trunk/git-mode.json");
  if (exists(gm)) out.push({ kind: "trunk-git-mode", rel: ".ans/trunk/git-mode.json", bytes: fs.statSync(gm).size, sha256: sha256(fs.readFileSync(gm)), mtime: fs.statSync(gm).mtime.toISOString() });
  const opsDir = path.join(TARGET, ".ans/trunk/operations");
  if (exists(opsDir)) for (const op of fs.readdirSync(opsDir)) { const p = path.join(opsDir, op, "init.json"); if (exists(p)) out.push({ kind: "trunk-operation-init", rel: `.ans/trunk/operations/${op}/init.json`, bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)), mtime: fs.statSync(p).mtime.toISOString() }); }
  if (exists(path.join(TARGET, ".git"))) {
    const head = path.join(TARGET, ".git", "HEAD");
    out.push({ kind: "git-dir", rel: ".git/", exists: true, head: exists(head) ? fs.readFileSync(head, "utf8").trim() : null });
    const trunkRef = path.join(TARGET, ".git/refs/ans/trunk");
    if (exists(trunkRef)) out.push({ kind: "git-ref-trunk", rel: ".git/refs/ans/trunk", oid: fs.readFileSync(trunkRef, "utf8").trim() });
    const candDir = path.join(TARGET, ".git/refs/ans/candidates");
    if (exists(candDir)) out.push({ kind: "git-ref-candidates", rel: ".git/refs/ans/candidates/", count: fs.readdirSync(candDir).length });
  }
  const gip = path.join(TARGET, ".ans/git-init-process.json");
  if (exists(gip)) out.push({ kind: "git-init-process", rel: ".ans/git-init-process.json", bytes: fs.statSync(gip).size, sha256: sha256(fs.readFileSync(gip)) });
  return out;
}

async function finalize() {
  try { scanAllRoleNative(); } catch {}
  summary.stop = { stopCause, gate, at: new Date().toISOString(), msgMark, teamPlanGateAt: teamPlanGateAt ? new Date(teamPlanGateAt).toISOString() : null, initAttempted, initPrepared, initRejected, teamPlanOk, budget };
  summary.budget = budget;
  summary.trunkArtifacts = scanTrunkArtifacts();
  try { summary.gameFiles = scanGameFiles(); } catch {}
  try { summary.schedulingHistory = schedulingList(); } catch {}
  for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
    const repDir = path.join(sessionsDir, role, "claude", "ans", "reports");
    if (!exists(repDir)) continue;
    for (const f of fs.readdirSync(repDir)) {
      const p = path.join(repDir, f); let st; try { st = fs.statSync(p); } catch { continue; }
      if (!st.isFile()) continue;
      if (st.mtime.toISOString() >= startMark) {
        mkdirp(path.join(EVID, "reports", role));
        try { fs.copyFileSync(p, path.join(EVID, "reports", role, f)); } catch {}
        let parsed = null; let text = "";
        try { text = fs.readFileSync(p, "utf8"); parsed = JSON.parse(text); } catch {}
        summary.reports.push({ role, file: f, mtime: st.mtime.toISOString(), taskId: parsed?.taskId ?? null, status: parsed?.status ?? null, codes: [...new Set((text.match(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/g) ?? []).map((s) => s.match(/"([A-Za-z0-9-]+)"$/)?.[1]).filter(Boolean))], textHead: text.slice(0, 3000) });
      }
    }
  }
  log("monitor.stop", summary.stop);
  fs.writeFileSync(path.join(EVID, "ui-final-body.txt"), await bodyText().catch(() => ""));
  await shot("ui-99-final.jpeg").catch(() => null);
  try { fs.copyFileSync(tasksPath, path.join(EVID, "tasks-final.jsonl")); } catch {}
  try { fs.copyFileSync(versionsPath, path.join(EVID, "versions-final.jsonl")); } catch {}
  if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); mkdirp(d); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } }
  if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch {} }
  if (exists(runsDir)) { try { fs.rmSync(path.join(EVID, "runs"), { recursive: true, force: true }); fs.cpSync(runsDir, path.join(EVID, "runs"), { recursive: true }); } catch {} }
  if (exists(snapshotsDir)) { const d = path.join(EVID, "snapshots"); mkdirp(d); for (const f of fs.readdirSync(snapshotsDir)) { try { fs.copyFileSync(path.join(snapshotsDir, f), path.join(d, f)); } catch {} } }
  for (const sub of ["docs/scheduling", "docs/proposals", "docs/contracts", "docs/product", "docs/intents"]) { const src = path.join(TARGET, sub); if (!exists(src)) continue; const d = path.join(EVID, "target-docs", sub); mkdirp(d); for (const f of fs.readdirSync(src)) { try { if (fs.statSync(path.join(src, f)).isFile()) fs.copyFileSync(path.join(src, f), path.join(d, f)); } catch {} } }
  const gd = path.join(EVID, "game"); mkdirp(gd);
  for (const f of summary.gameFiles) { try { mkdirp(path.join(gd, path.dirname(f.rel))); fs.copyFileSync(path.join(TARGET, f.rel), path.join(gd, f.rel)); } catch {} }
  fs.writeFileSync(path.join(EVID, "drive-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(EVID, "budget.json"), JSON.stringify(budget, null, 2));
  halted = true;
  try { await value(`(() => { const b = document.getElementById('btn-halt'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => null); } catch {}
  await sleep(1000);
  try { await value(`(async () => { if (window.desktop && typeof window.desktop.stopSession === 'function') { try { return await window.desktop.stopSession(); } catch (e) { return 'stopSession-error:' + String(e); } } return 'no-stopSession'; })()`).catch(() => null); } catch {}
  await sleep(1500);
  try { await call("Browser.close", {}); } catch (e) { log("browser.close.error", { error: String(e) }); }
  console.log(JSON.stringify({ stopCause, gate, teamPlanOk, initAttempted, initPrepared, initRejected, gameFiles: summary.gameFiles.map((f) => f.rel), budget, completeTeamPlanReceipts: summary.completeTeamPlan.receipts.map((r) => ({ ok: r.ok, status: r.status, errorCode: r.errorCode, message: r.message })), gitReceipts: summary.gitCalls.receipts.map((r) => ({ status: r.status, code: r.code, message: r.message })) }, null, 2));
  try { ws.close(); } catch {}
  process.exit(0);
}

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

async function readDialog() {
  return value(`(() => { const d = document.getElementById('decision-dialog'); const shell = document.querySelector('.sc-overlay'); const shellVisible = !!(shell && !shell.hidden); let shellInfo = null; if (shellVisible) { const t = document.getElementById('sc-title'); const cmd = document.getElementById('sc-command'); shellInfo = { title: t ? t.textContent : null, command: cmd ? cmd.textContent : null }; } if (!d) return { dialog: null, shellVisible, shellInfo }; const title = (document.getElementById('dd-title') || {}).textContent || ''; const opts = Array.from(d.querySelectorAll('.dd-options input')).map((i) => ({ id: i.value, checked: i.checked, type: i.type })); const labels = Array.from(d.querySelectorAll('.dd-option-label')).map((s) => s.textContent || ''); const acks = Array.from(d.querySelectorAll('.dd-acks input, .dd-ack input')).map((a) => ({ id: a.value, checked: a.checked })); const submit = d.querySelector('.dd-submit'); const confirm = d.querySelector('.dd-confirm'); const err = d.querySelector('.dd-error'); const more = d.querySelector('.dd-more'); return { dialog: { requestId: d.dataset.requestId || '', title, opts, labels, acks, submitDisabled: submit ? submit.disabled : null, confirmDisabled: confirm ? confirm.disabled : null, hasSubmit: !!submit, hasConfirm: !!confirm, error: err ? err.textContent : null, more: more ? more.textContent : null, bodyTail: document.body.innerText.slice(-4000) }, shellVisible, shellInfo }; })()`).catch(() => ({ dialog: null, shellVisible: false, shellInfo: null }));
}

function pendingRequestRow(requestId) { return reqInfo.get(requestId) ?? null; }

async function handleDialogOnce(dlg) {
  const rid = dlg.requestId || `no-rid-${dialogSeq + 1}`;
  if (dialogsHandled.has(rid)) return;
  dialogsHandled.add(rid); dialogSeq++;
  const pre = { seq: dialogSeq, at: new Date().toISOString(), requestId: rid, title: dlg.title, options: dlg.opts, labels: dlg.labels, acks: dlg.acks, submitDisabled: dlg.submitDisabled, confirmDisabled: dlg.confirmDisabled, error: dlg.error, more: dlg.more };
  summary.dialogs.push(pre); log("dialog.seen", pre);
  await shot(`ui-dialog-${String(dialogSeq).padStart(2, "0")}-pre.jpeg`).catch(() => null);
  // wait briefly for the ledger request row to identify cardKind/recommended options
  let req = pendingRequestRow(rid);
  for (let i = 0; i < 10 && !req; i++) { await sleep(500); req = pendingRequestRow(rid); }
  const cardKind = req?.cardKind ?? null;
  const reqOptions = Array.isArray(req?.options) ? req.options : [];
  budget.cardsTotal++; budget.cardsByKind[cardKind ?? dlg.title ?? "?"] = (budget.cardsByKind[cardKind ?? dlg.title ?? "?"] ?? 0) + 1;
  summary.milestones.push({ at: new Date().toISOString(), milestone: "card-presented", requestId: rid, cardKind, title: dlg.title });
  // RR10 card-selection policy: app-owned stable-write cards are explicitly approved by customer intent
  // (`approve-stable-write`); the app's `recommended: reject-stable-write` is only the destructive safe
  // default and must NOT be auto-selected. Other card kinds keep recommended-first semantics.
  let selectIds = [];
  if (cardKind === "stable-write" || dlg.opts.some((o) => o.id === "approve-stable-write")) {
    const approve = dlg.opts.find((o) => o.id === "approve-stable-write") ?? dlg.opts.find((o) => /approve|accept/i.test(o.id));
    if (approve) selectIds = [approve.id];
  }
  if (selectIds.length === 0) selectIds = reqOptions.filter((o) => o.recommended === true).map((o) => o.id);
  if (selectIds.length === 0) {
    const acceptLike = dlg.opts.filter((o) => /^(accept|approve|approve-stable-write|confirm|agree|yes|ok)$/i.test(o.id));
    if (acceptLike.length) selectIds = [acceptLike[0].id];
    else {
      const lblIdx = dlg.labels.findIndex((s) => /接受|批准|同意|确认/.test(s));
      if (lblIdx >= 0 && dlg.opts[lblIdx]) selectIds = [dlg.opts[lblIdx].id];
      else if (dlg.opts.length) selectIds = [dlg.opts[0].id];
    }
  }
  const action = await value(`(() => {
    const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
    for (const a of d.querySelectorAll('.dd-acks input, .dd-ack input')) { if (!a.checked) a.click(); }
    const ids = ${JSON.stringify(selectIds)};
    for (const o of d.querySelectorAll('.dd-options input')) { if (ids.includes(o.value) && !o.checked) o.click(); }
    const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm');
    if (sub) { if (!sub.disabled) { sub.click(); return { result: 'submitted', selected: ids }; } return { result: 'submit-disabled', selected: ids }; }
    if (conf) { if (!conf.disabled) { conf.click(); return { result: 'confirmed', selected: ids }; } return { result: 'confirm-disabled', selected: ids }; }
    return { result: 'no-actions' };
  })()`).catch((e) => ({ result: "error", error: String(e) }));
  log("dialog.action", { requestId: rid, cardKind, selectIds, action });
  summary.dialogActions.push({ at: new Date().toISOString(), requestId: rid, cardKind, selectIds, action });
  await sleep(800);
  const d2 = await readDialog();
  if (d2?.dialog && d2.dialog.requestId === rid && (d2.dialog.error || d2.dialog.submitDisabled)) {
    // second attempt only for destructive two-step confirm (armed) or transient disabled states after acks
    const act2 = await value(`(() => {
      const d = document.getElementById('decision-dialog'); if (!d) return { result: 'gone' };
      for (const a of d.querySelectorAll('.dd-acks input, .dd-ack input')) { if (!a.checked) a.click(); }
      const ids = ${JSON.stringify(selectIds)};
      for (const o of d.querySelectorAll('.dd-options input')) { if (ids.includes(o.value) && !o.checked) o.click(); }
      const sub = d.querySelector('.dd-submit'); const conf = d.querySelector('.dd-confirm');
      if (sub && !sub.disabled) { sub.click(); return { result: 'submitted-2', selected: ids }; }
      if (conf && !conf.disabled) { conf.click(); return { result: 'confirmed-2', selected: ids }; }
      return { result: 'still-disabled', error: (d.querySelector('.dd-error')||{}).textContent ?? null };
    })()`).catch((e) => ({ result: "error", error: String(e) }));
    log("dialog.action2", { requestId: rid, act2 });
    summary.dialogActions.push({ at: new Date().toISOString(), requestId: rid, cardKind, attempt: 2, selectIds, action: act2 });
    await sleep(600);
    const d3 = await readDialog();
    if (d3?.dialog && d3.dialog.requestId === rid && (d3.dialog.error || d3.dialog.submitDisabled || d3.dialog.confirmDisabled)) {
      detectGate({ kind: "card-submit-stuck", requestId: rid, error: d3.dialog.error ?? null, submitDisabled: d3.dialog.submitDisabled, confirmDisabled: d3.dialog.confirmDisabled });
    }
  }
  await shot(`ui-dialog-${String(dialogSeq).padStart(2, "0")}-after.jpeg`).catch(() => null);
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

try {
  for (let i = 0; i < 240; i++) { const ready = await value("typeof window.desktop === 'object' && document.readyState !== 'loading'").catch(() => false); if (ready) break; await sleep(500); }
  log("window.ready", { title: await value("document.title").catch(() => null) }); await shot("ui-00-launch.jpeg");

  const importClick = await value(`(() => { const b = document.getElementById('btn-import'); if (!b) return 'missing'; b.click(); return 'clicked'; })()`).catch(() => "error");
  log("import.click", { importClick }); if (importClick !== "clicked") { detectGate({ kind: "import-click-failed" }); await finalize(); }
  let psOut = "";
  try { psOut = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(RR, "rr", "select-folder-auto.ps1"), "-Path", TARGET], { encoding: "utf8", timeout: 30000 }); } catch (e) { psOut = "PS_ERROR " + String(e.stdout || e.message); }
  log("import.dialog", { psOut: psOut.trim() }); await sleep(4000); await shot("ui-01-imported.jpeg");
  fs.writeFileSync(path.join(EVID, "ui-01-imported-body.txt"), await bodyText());

  let listing = null;
  for (let i = 0; i < 60; i++) { listing = await value(`(() => { const s = window.__ansRenderer && window.__ansRenderer.state; if (!s) return null; return { projectRoot: s.projectRoot, roles: s.roles, primaryRoleId: s.primaryRoleId, hasRoles: s.hasRoles }; })()`).catch(() => null); if (listing && listing.projectRoot && Array.isArray(listing.roles) && listing.roles.length >= 6) break; await sleep(500); }
  summary.roles = (listing?.roles ?? []).map((r) => ({ roleId: r.roleId, builtIn: r.builtIn, governanceFunction: r.governanceFunction }));
  log("roles.listing", { projectRoot: listing?.projectRoot, count: summary.roles.length, roles: summary.roles });
  if (!listing || !listing.projectRoot) { detectGate({ kind: "roles-listing-incomplete" }); await finalize(); }
  await shot("ui-02-roles.jpeg");

  await openRoleSession("chief");
  await shot("ui-03-chief-session.jpeg");
  const sent = await sendMessage(CUSTOMER_MESSAGE, "customer");
  if (!sent.ok) { detectGate({ kind: "customer-send-failed" }); await finalize(); }
  msgMark = sent.mark; budget.customerMessages = 1; summary.steps.push({ step: "customer-message-sent", at: sent.mark });
  await shot("ui-04-customer-message.jpeg"); lastProgressAt = Date.now();
  const monitorStart = Date.now();

  while (true) {
    const now = Date.now();
    if (now - monitorStart > DEADLINE_MS) { stopCause = "deadline-34min"; break; }
    if (msgMark && now - lastProgressAt > STALL_MS) { stopCause = "stalled-no-progress-10min"; break; }

    for (const line of readJsonl(tasksPath)) {
      if (seenTaskLines.has(line)) continue; seenTaskLines.add(line);
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || !j.at || j.at < startMark) continue;
      lastProgressAt = Date.now();
      const row = { at: j.at, kind: j.kind, requestId: j.requestId, taskId: j.taskId, from: j.from, to: j.to, cardKind: j.cardKind, flowId: j.flowId, title: j.title, choice: j.choice, by: j.by, status: j.status, summary: typeof j.summary === "string" ? j.summary.slice(0, 400) : undefined };
      summary.ledgerRows.push(row); log("task.row", row);
      if (j.kind === "request.created") {
        reqInfo.set(j.requestId, j); summary.requestRows.push(j);
        summary.milestones.push({ at: j.at, milestone: "card-created", requestId: j.requestId, cardKind: j.cardKind ?? null, title: j.title ?? null, options: Array.isArray(j.options) ? j.options.map((o) => ({ id: o.id, recommended: o.recommended ?? null })) : [] });
      }
      if (typeof j.kind === "string" && (j.kind.startsWith("stable.write.") || j.kind === "trunk.state")) summary.milestones.push({ at: j.at, milestone: j.kind, requestId: j.requestId ?? null, roleId: j.roleId ?? null, status: j.status ?? null, op: j.op ?? null, trunkVersion: j.trunkVersion ?? null });
      if (j.kind === "task.created") {
        budget.dispatches++; summary.dispatchRows.push(j);
        summary.milestones.push({ at: j.at, milestone: "dispatch", taskId: j.taskId, from: j.from, to: j.to, flowId: j.flowId, runId: j.runId ?? null, workSourceRef: j.workSourceRef ?? null, textHead: typeof j.text === "string" ? j.text.slice(0, 500) : null });
      }
      if (j.kind === "request.resolved") summary.milestones.push({ at: j.at, milestone: "card-resolved", requestId: j.requestId, by: j.by, choice: j.choice, decisionId: j.decisionId ?? null });
      if (j.kind === "task.reported" && (j.status === "failed" || j.status === "blocked")) {
        const isNewTask = summary.dispatchRows.some((d) => d.taskId === j.taskId);
        summary.milestones.push({ at: j.at, milestone: "task-reported-" + j.status, taskId: j.taskId, taskFrom: j.from, isNewTask, summary: String(j.summary ?? "").slice(0, 400) });
        if (isNewTask) {
          const convenerRelated = /git|trunk|complete_team_plan|团队计划|初始化/.test(String(j.summary ?? ""));
          if (convenerRelated && (initAttempted || teamPlanGateAt || initRejected)) detectGate({ kind: "task-reported-" + j.status, taskId: j.taskId, role: j.from, summary: String(j.summary ?? "").slice(0, 600) });
        }
      }
    }

    for (const d of scanDiagnostics()) {
      const ev = d.event || d.kind || "?"; if (/decision|interaction|delivery|session\.open|blocked|failed|prepare|intent|governance\.card|tasks\.restored|git\./i.test(String(ev))) {
        lastProgressAt = Date.now();
        if (/tasks\.restored|delivery\.(start|skip)/.test(String(ev))) { restoreSeen++; summary.restoreDeliveries.push({ at: d.at, event: ev, roleId: d.roleId, taskId: d.taskId ?? null, reason: d.reasonCode ?? d.reason ?? null }); }
        summary.diagnosticsOfInterest.push({ event: ev, at: d.at, roleId: d.roleId, ok: d.ok, requestId: d.requestId, errorMessage: d.errorMessage, phase: d.phase, reasonCode: d.reasonCode }); log("diag", { event: ev, at: d.at, roleId: d.roleId, ok: d.ok, requestId: d.requestId, errorMessage: d.errorMessage, phase: d.phase });
        if (ev === "interaction.response.end" && d.ok === false) detectGate({ kind: "interaction-response-failed", at: d.at, requestId: d.requestId, errorMessage: d.errorMessage });
      }
    }

    if (msgMark) scanAllRoleNative();

    if (now - lastGameScan > 5000) {
      lastGameScan = now;
      const g = scanGameFiles();
      const sig = g.map((f) => f.rel + ":" + f.bytes).join("|");
      if (g.length && !gameFirstSeenAt) {
        gameFirstSeenAt = now; summary.milestones.push({ at: new Date().toISOString(), milestone: "game-output-first-seen", files: g.map((f) => ({ rel: f.rel, bytes: f.bytes })) }); log("game.first", { files: g }); await shot("ui-30-game-output.jpeg").catch(() => null);
      }
      if (g.length && summary.gameFileHistory.length && summary.gameFileHistory[summary.gameFileHistory.length - 1].sig !== sig) summary.milestones.push({ at: new Date().toISOString(), milestone: "game-output-changed", files: g.map((f) => ({ rel: f.rel, bytes: f.bytes })) });
      if (g.length) summary.gameFileHistory.push({ at: new Date().toISOString(), sig, count: g.length, files: g.map((f) => f.rel) });
      if (gameFirstSeenAt && now - gameFirstSeenAt > GAME_DRAIN_MS) { stopCause = "game-output"; break; }
      const trunkNow = scanTrunkArtifacts();
      for (const t of trunkNow) if (!summary.trunkArtifacts.some((x) => x.kind === t.kind && x.rel === t.rel && x.sha256 === (t.sha256 ?? null))) { summary.trunkArtifacts.push(t); summary.milestones.push({ at: new Date().toISOString(), milestone: "trunk-artifact", artifact: { kind: t.kind, rel: t.rel, bytes: t.bytes ?? null, sha256: t.sha256 ?? null, head: t.head ?? null } }); log("trunk.artifact", t); if (t.kind === "trunk-manifest" || t.kind === "git-ref-trunk") trunkPublished = true; }
      if (exists(path.join(TARGET, ".git")) && !summary.milestones.some((m) => m.milestone === "git-dir-created")) { summary.milestones.push({ at: new Date().toISOString(), milestone: "git-dir-created" }); await shot("ui-22-git-dir-created.jpeg").catch(() => null); }
    }

    const dlg = await readDialog();
    if (dlg?.shellVisible && !gate) detectGate({ kind: "shell-confirm-card", title: dlg.shellInfo?.title ?? null, command: dlg.shellInfo?.command ?? null });
    if (dlg?.dialog && !dialogsHandled.has(dlg.dialog.requestId || `no-rid-${dialogSeq + 1}`)) await handleDialogOnce(dlg.dialog);

    // team plan gate observed but no init attempt yet: allow bounded wait for convener to proceed
    if (teamPlanGateAt && !initAttempted && !initPrepared && !teamPlanOk && now - teamPlanGateAt > TEAMPLAN_GATE_WAIT_MS) { stopCause = "team-plan-rejected-no-init-continuation:" + teamPlanGateCode; break; }
    // post-init: team plan must succeed or be rejected; if no further activity after init prepared for 5 min, stop
    if (initPrepared && !teamPlanOk && now - lastProgressAt > 5 * 60 * 1000) { stopCause = "post-init-no-teamplan-outcome"; break; }
    if (trunkPublished && !teamPlanOk && now - lastProgressAt > 5 * 60 * 1000) { stopCause = "post-publication-no-teamplan-outcome"; break; }
    if (gameFirstSeenAt) lastProgressAt = Math.max(lastProgressAt, now - GAME_DRAIN_MS + 1); // don't stall-stop while draining

    if (budget.cardsTotal > 4) { stopCause = `budget-cards:${budget.cardsTotal}>4`; break; }
    if (budget.dispatches > 8) { stopCause = `budget-dispatches:${budget.dispatches}>8`; break; }
    if (budget.gitCalls > 8) { stopCause = `budget-git:${budget.gitCalls}>8`; break; }
    if (budget.runShellCalls > 0) { stopCause = "run-shell-non-task-call"; break; }
    // turn budgets from replay settled events
    const turns = {};
    for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
      const replay = path.join(sessionsDir, role, "claude", "ans", "replay.jsonl");
      if (!exists(replay)) continue;
      for (const line of readJsonl(replay)) { try { const j = JSON.parse(line); if (j.kind === "event" && j.event?.kind === "settled" && j.at && msgMark && j.at >= msgMark) turns[role] = (turns[role] ?? 0) + 1; } catch {} }
    }
    budget.turnsByRole = turns;
    const cap = (role) => role === "chief" ? 8 : role === "convener" ? 3 : (role === "product" || /dev$|game-dev|impl/.test(role)) ? 4 : 3;
    for (const [role, n] of Object.entries(turns)) {
      if (role === "chief" ? n > 8 : role === "convener" ? n > 3 : (role === "product" || /dev$/.test(role)) ? n > 4 : n > 3) { stopCause = `budget-turns:${role}:${n}`; break; }
    }
    if (stopCause) break;

    if (now - lastPortCheck > 15000) {
      lastPortCheck = now;
      try { const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" }); const lines = ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l)); const l9222 = lines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)); summary.portsDuringRun.push({ at: new Date().toISOString(), listeners9222: l9222.length, listeners9223: lines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length }); if (l9222.length > 0) detectGate({ kind: "port-9222-observed-listening", lines: l9222 }); } catch {}
    }
    if (now - lastHeartbeat > 30000) { lastHeartbeat = now; try { fs.copyFileSync(tasksPath, path.join(EVID, "live", "tasks-live.jsonl")); } catch {} try { for (const f of exists(diagDir) ? fs.readdirSync(diagDir) : []) fs.copyFileSync(path.join(diagDir, f), path.join(EVID, "live", "diagnostics", f)); } catch {} fs.writeFileSync(path.join(EVID, "live", "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), elapsedSec: Math.round((now - monitorStart) / 1000), budget, teamPlanGateAt: teamPlanGateAt ? new Date(teamPlanGateAt).toISOString() : null, teamPlanGateCode, initAttempted, initPrepared, initRejected, teamPlanOk, gameFirstSeenAt: gameFirstSeenAt ? new Date(gameFirstSeenAt).toISOString() : null, gate, stopCause }, null, 2)); }
    if (gate) { stopCause = stopCause ?? ("gate:" + gate.kind); break; }
    await sleep(400);
  }
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
