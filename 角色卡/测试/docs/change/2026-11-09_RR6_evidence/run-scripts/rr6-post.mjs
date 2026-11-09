// RR6 post-state capture (outside repo; writes only under the RR6 run root).
// Target post manifest + diff; zero-touch snapshots (snake app root w/o target, snake run root) + diff;
// worktree/candidate stability recheck; ports/processes post + 9223 release; deep extraction of
// complete_team_plan calls/receipts and gate records; budget recount; evidence SHA-256 index.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RR = "C:\\Users\\51054\\Desktop\\work\\ans-team-plan-run-2026-11-09";
const EVID = path.join(RR, "evidence");
const PRE = path.join(EVID, "pre");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
const APP_ROOT = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09";
const SNAKE_RUN = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-run-2026-11-09";
const POST = path.join(EVID, "post");
fs.mkdirSync(POST, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });
const out = { at: new Date().toISOString() };

const pre = JSON.parse(fs.readFileSync(path.join(PRE, "pre-summary.json"), "utf8"));
const driverSummary = JSON.parse(fs.readFileSync(path.join(EVID, "summary.json"), "utf8"));
const stopAt = driverSummary.stop?.at ?? null;
const START = driverSummary.startedUtc;
const msgMark = driverSummary.steps?.find((s) => s.step === "message-sent")?.at ?? START;

// ---------- 1) worktree identity + candidate stability ----------
out.head = git(["rev-parse", "HEAD"]).trim();
out.tree = git(["rev-parse", "HEAD^{tree}"]).trim();
out.branch = git(["branch", "--show-current"]).trim();
const fullStatus = git(["-c", "core.quotepath=false", "status", "--porcelain"]);
fs.writeFileSync(path.join(POST, "git-status-full-post.txt"), fullStatus);
const candStatus = git(["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"]);
fs.writeFileSync(path.join(POST, "candidate-status-post.txt"), candStatus);
const candFiles = candStatus.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
const candSorted = [...candFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const candRows = candSorted.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const candAgg = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join("")));
fs.writeFileSync(path.join(POST, "candidate-sha256-post.txt"), candRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n");
const lsFiles = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "-z", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split("\0").filter(Boolean);
const manSorted = [...lsFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const manRows = manSorted.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const manText = manRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n";
fs.writeFileSync(path.join(POST, "manifest-src-app-test-post.txt"), manText);
const manHash = sha256(Buffer.from(manText));
const manAgg = sha256(Buffer.from(manRows.map((r) => r.path + "\0" + r.sha256).join("")));
const untracked = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--untracked-files=all", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/).filter((l) => l.startsWith("??"));
out.candidate = {
  fileCount: { pre: pre.candidateFileCount, post: candFiles.length },
  aggregate: { pre: pre.candidateAggregate, post: candAgg, equal: pre.candidateAggregate === candAgg },
  filesEqual: (() => { const preRows = fs.readFileSync(path.join(PRE, "candidate-sha256.txt"), "utf8"); return preRows === fs.readFileSync(path.join(POST, "candidate-sha256-post.txt"), "utf8"); })(),
  manifest: { fileCount: manRows.length, fileHash: manHash, aggregate: manAgg, fileHashEqual: manHash === pre.manifestFileHash, aggregateEqual: manAgg === pre.manifestAggregate },
  untrackedSrcAppTest: untracked.length,
  headEqual: out.head === pre.head, treeEqual: out.tree === pre.tree, branchEqual: out.branch === pre.branch,
  stagedEmpty: git(["diff", "--cached", "--stat"]).trim() === "",
};
writeJson(path.join(POST, "candidate-stability.json"), out.candidate);
fs.writeFileSync(path.join(POST, "candidate-stability.txt"), [
  `head pre=${pre.head} post=${out.head} equal=${out.head === pre.head}`,
  `tree pre=${pre.tree} post=${out.tree} equal=${out.tree === pre.tree}`,
  `branch pre=${pre.branch} post=${out.branch} equal=${out.branch === pre.branch}`,
  `candidate files pre=${pre.candidateFileCount} post=${candFiles.length} equalRows=${out.candidate.filesEqual}`,
  `candidate aggregate pre=${pre.candidateAggregate} post=${candAgg} equal=${pre.candidateAggregate === candAgg}`,
  `manifest files=${manRows.length} fileHash pre=${pre.manifestFileHash} post=${manHash} equal=${manHash === pre.manifestFileHash}`,
  `manifest aggregate pre=${pre.manifestAggregate} post=${manAgg} equal=${manAgg === pre.manifestAggregate}`,
  `untracked src/app/test post=${untracked.length}; staged empty=${out.candidate.stagedEmpty}`,
].join("\n") + "\n");

// ---------- 2) target post manifest + diff ----------
function walkFiles(rootDir, excludeRelPrefixes = []) {
  const acc = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      const rel = path.relative(rootDir, p).split(path.sep).join("/");
      if (excludeRelPrefixes.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) acc.push({ rel, abs: p });
    }
  })(rootDir);
  acc.sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
  return acc.map((r) => { const buf = fs.readFileSync(r.abs); return { rel: r.rel, sha256: sha256(buf), bytes: buf.length }; });
}
const targetPost = walkFiles(TARGET);
fs.writeFileSync(path.join(EVID, "snake-target-post.sha256"), targetPost.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(POST, "target-manifest-post.json"), { target: TARGET, fileCount: targetPost.length, files: targetPost });
const preTarget = JSON.parse(fs.readFileSync(path.join(PRE, "target-manifest-pre.json"), "utf8"));
const preMap = new Map(preTarget.files.map((f) => [f.rel, { sha256: f.sha256, bytes: f.bytes }]));
const postMap = new Map(targetPost.map((f) => [f.rel, { sha256: f.sha256, bytes: f.bytes }]));
const added = [], removed = [], changed = [];
for (const [rel, v] of postMap) { if (!preMap.has(rel)) added.push({ rel, ...v }); else if (preMap.get(rel).sha256 !== v.sha256) changed.push({ rel, pre: preMap.get(rel), post: v }); }
for (const [rel, v] of preMap) if (!postMap.has(rel)) removed.push({ rel, ...v });
const targetDiff = { preCount: preMap.size, postCount: postMap.size, added, removed, changed };
writeJson(path.join(EVID, "snake-target-diff.json"), targetDiff);
const dtxt = [];
dtxt.push(`# target file diff (pre ${preMap.size} -> post ${postMap.size})`);
dtxt.push(`added: ${added.length}`);
for (const a of added) dtxt.push(`+ ${a.rel}  ${a.sha256}  ${a.bytes}B`);
dtxt.push(`removed: ${removed.length}`);
for (const r of removed) dtxt.push(`- ${r.rel}  ${r.sha256}  ${r.bytes}B`);
dtxt.push(`changed: ${changed.length}`);
for (const c of changed) dtxt.push(`~ ${c.rel}  pre=${c.pre.sha256} (${c.pre.bytes}B)  post=${c.post.sha256} (${c.post.bytes}B)`);
fs.writeFileSync(path.join(EVID, "snake-target-diff.txt"), dtxt.join("\n") + "\n");
out.targetDiff = { preCount: preMap.size, postCount: postMap.size, added: added.length, removed: removed.length, changed: changed.length };

// trunk manifest state post (read-only)
const trunkManifest = path.join(TARGET, ".ans/trunk", "manifest.json");
out.trunkManifestPost = { exists: exists(trunkManifest), sha256: exists(trunkManifest) ? sha256(fs.readFileSync(trunkManifest)) : null, trunkDirListing: exists(path.join(TARGET, ".ans/trunk")) ? fs.readdirSync(path.join(TARGET, ".ans/trunk")) : [] };

// ---------- 3) zero-touch: app root (excluding target) + snake run root ----------
function fullManifestReport(name, rootDir, exclude, preJsonPath, preShaPath) {
  const man = walkFiles(rootDir, exclude);
  fs.writeFileSync(path.join(EVID, `${name}-post.sha256`), man.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
  writeJson(path.join(POST, `${name}-post.json`), { root: rootDir, excluded: exclude, fileCount: man.length, files: man });
  const preJson = JSON.parse(fs.readFileSync(preJsonPath, "utf8"));
  const preM = new Map(preJson.files.map((f) => [f.rel, f.sha256]));
  const postM = new Map(man.map((f) => [f.rel, f.sha256]));
  const a = [], r = [], c = [];
  for (const [rel, h] of postM) { if (!preM.has(rel)) a.push(rel); else if (preM.get(rel) !== h) c.push(rel); }
  for (const rel of preM.keys()) if (!postM.has(rel)) r.push(rel);
  const diff = { name, root: rootDir, preCount: preM.size, postCount: postM.size, added: a, removed: r, changed: c, identical: a.length === 0 && r.length === 0 && c.length === 0 };
  writeJson(path.join(POST, `${name}-diff.json`), diff);
  return diff;
}
out.appRootZeroTouch = fullManifestReport("snake-app-root", APP_ROOT, ["target"], path.join(PRE, "snake-app-root-pre.json"), path.join(EVID, "snake-app-root-pre.sha256"));
out.snakeRunRootZeroTouch = fullManifestReport("snake-run-root", SNAKE_RUN, [], path.join(PRE, "snake-run-root-pre.json"), path.join(EVID, "snake-run-root-pre.sha256"));

// ---------- 4) ports/processes post + release ----------
const netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
const portLines = netstat.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
fs.writeFileSync(path.join(EVID, "isolation-post.txt"), portLines.join("\n") + "\n");
const tasklist = execFileSync("tasklist", [], { encoding: "utf8" });
const electronProcs = tasklist.split(/\r?\n/).filter((l) => /electron/i.test(l));
fs.writeFileSync(path.join(EVID, "processes-post.txt"), electronProcs.join("\n") + "\n");
out.portsPost = {
  listeners9222: portLines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length,
  listeners9223: portLines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length,
  timeWait9223: portLines.filter((l) => /:9223\b/.test(l) && /TIME_WAIT/.test(l)).length,
  electronProcesses: electronProcs.length,
};

// ---------- 5) deep extraction: complete_team_plan calls/receipts + gate vocabulary ----------
const sessionsDir = path.join(TARGET, ".ans/sessions");
function flattenContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c?.type === "text" ? c.text ?? "" : JSON.stringify(c)))).join("\n");
  if (content && typeof content === "object") return JSON.stringify(content);
  return "";
}
const planRows = [];
const gateRows = [];
const GATE_RE = /trunk-unavailable|plan-basis-incomplete|plan-path-invalid|plan-run-conflict|plan-base-conflict|plan-hash-drift|plan-operation-conflict|plan-task-unavailable|plan-task-changed|plan-flow-conflict|plan-structure-invalid|plan-owner-invalid/;
const planIds = new Set();
(function scan(dir) {
  if (!exists(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { scan(p); continue; }
    if (!ent.isFile() || !ent.name.endsWith(".jsonl")) continue;
    const rel = path.relative(TARGET, p).split(path.sep).join("/");
    for (const line of readJsonl(p)) {
      let j = null; try { j = JSON.parse(line); } catch {}
      const ts = j?.timestamp ?? (() => { try { return JSON.parse(line).at; } catch { return null; } })();
      const inRunWindow = ts === null || ts >= START; // only this run's records (old RR5-era rows excluded)
      if (line.includes("complete_team_plan") && inRunWindow) {
        if (j && Array.isArray(j.message?.content)) {
          for (const c of j.message.content) {
            if (j.type === "assistant" && c?.type === "tool_use" && /complete_team_plan/.test(String(c.name ?? ""))) {
              if (c.id) planIds.add(c.id);
              planRows.push({ ts, role: rel.split("/")[2] ?? null, kind: "tool_use", toolUseId: c.id ?? null, input: c.input ?? null, file: rel });
            }
            if (j.type === "user" && c?.type === "tool_result") {
              const tText = flattenContent(c.content);
              // a real complete_team_plan receipt has an operationId + ok/errorCode JSON; project_state text merely mentions the tool name
              const looksReceipt = /"operationId"\s*:\s*"|complete_team_plan:\s*\{/.test(tText);
              if (looksReceipt && (planIds.has(c.tool_use_id) || /complete_team_plan/.test(tText))) {
                planRows.push({ ts, role: rel.split("/")[2] ?? null, kind: "tool_result", toolUseId: c.tool_use_id ?? null, text: tText, file: rel });
              }
            }
          }
        } else if (!j) {
          planRows.push({ ts: null, kind: "raw", text: line.slice(0, 8000), file: rel });
        }
      }
      if (GATE_RE.test(line) && inRunWindow) {
        const codes = [...new Set((line.match(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/g) ?? []).map((s) => s.match(/"([A-Za-z0-9-]+)"$/)?.[1]).filter(Boolean))];
        gateRows.push({ file: rel, ts, codes, snippet: line.length > 6000 ? line.slice(0, 6000) + "…[truncated]" : line });
      }
    }
  }
})(sessionsDir);
fs.writeFileSync(path.join(EVID, "complete-team-plan-calls.jsonl"), planRows.filter((r) => r.kind !== "tool_result").map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(path.join(EVID, "complete-team-plan-receipts.jsonl"), planRows.filter((r) => r.kind === "tool_result" || r.kind === "raw").map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(path.join(EVID, "gate-records.jsonl"), gateRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
out.plan = { toolCalls: planRows.filter((r) => r.kind === "tool_use").length, receipts: planRows.filter((r) => r.kind === "tool_result").length, gateRows: gateRows.length };

// convener reports: index all files with mtime; copy ONLY new-in-run originals (old RR5-era files stay referenced by index)
const repDir = path.join(sessionsDir, "convener", "claude", "ans", "reports");
const reports = [];
if (exists(repDir)) {
  fs.mkdirSync(path.join(EVID, "convener-reports"), { recursive: true });
  for (const f of fs.readdirSync(repDir)) {
    const p = path.join(repDir, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    const newInRun = st.mtime.toISOString() >= START;
    if (newInRun) fs.copyFileSync(p, path.join(EVID, "convener-reports", f));
    let parsed = null; let text = "";
    try { text = fs.readFileSync(p, "utf8"); parsed = JSON.parse(text); } catch {}
    reports.push({ file: f, mtime: st.mtime.toISOString(), newInRun, taskId: parsed?.taskId ?? null, status: parsed?.status ?? null, mentionsPlan: /complete_team_plan/.test(text), codes: [...new Set((text.match(/"errorCode"\s*:\s*"([A-Za-z0-9-]+)"/g) ?? []).map((s) => s.match(/"([A-Za-z0-9-]+)"$/)?.[1]).filter(Boolean))] });
  }
}
writeJson(path.join(EVID, "convener-reports", "index-post.json"), reports);
out.convenerReports = reports;
out.convenerReportsNewInRun = reports.filter((r) => r.newInRun).length;

// ---------- 6) ledger / versions / runs / snapshots post ----------
const ledger = readJsonl(path.join(TARGET, ".ans/state/tasks.jsonl")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const after = ledger.filter((j) => j.at && j.at >= msgMark);
fs.writeFileSync(path.join(EVID, "ledger-after-start.jsonl"), after.map((j) => JSON.stringify(j)).join("\n") + "\n");
fs.writeFileSync(path.join(EVID, "request-rows.jsonl"), after.filter((j) => String(j.kind || "").startsWith("request.")).map((j) => JSON.stringify(j)).join("\n") + "\n");
fs.writeFileSync(path.join(EVID, "dispatch-rows.jsonl"), after.filter((j) => j.kind === "task.created").map((j) => JSON.stringify(j)).join("\n") + "\n");
fs.writeFileSync(path.join(EVID, "project-notes.jsonl"), after.filter((j) => j.kind === "project.note").map((j) => JSON.stringify(j)).join("\n") + "\n");
try { fs.copyFileSync(path.join(TARGET, ".ans/state/versions.jsonl"), path.join(EVID, "versions-final.jsonl")); } catch {}
const runsDir = path.join(TARGET, ".ans/runs");
const runsPost = [];
if (exists(runsDir)) for (const name of fs.readdirSync(runsDir)) {
  const mp = path.join(runsDir, name, "manifest.json");
  if (!exists(mp)) continue;
  fs.mkdirSync(path.join(EVID, "runs", name), { recursive: true });
  fs.copyFileSync(mp, path.join(EVID, "runs", name, "manifest.json"));
  try { const m = JSON.parse(fs.readFileSync(mp, "utf8")); runsPost.push({ dir: name, runId: m.runId, state: m.state, flowId: m.flowId, documentsKeys: Object.keys(m.documents ?? {}), teamPlan: m.execution?.teamPlan ?? null, flow: m.execution?.flow ?? null, mtime: fs.statSync(mp).mtime.toISOString() }); } catch (e) { runsPost.push({ dir: name, error: String(e) }); }
}
writeJson(path.join(POST, "runs-post.json"), runsPost);
const snapsDir = path.join(TARGET, ".ans/trunk/snapshots");
const snaps = [];
if (exists(snapsDir)) for (const name of fs.readdirSync(snapsDir).sort()) {
  const p = path.join(snapsDir, name);
  if (!fs.statSync(p).isFile()) continue;
  const st = fs.statSync(p);
  const newInRun = st.mtime.toISOString() >= START;
  snaps.push({ name, bytes: st.size, sha256: sha256(fs.readFileSync(p)), mtime: st.mtime.toISOString(), newInRun });
  if (newInRun && !exists(path.join(EVID, "snapshots", name))) { fs.mkdirSync(path.join(EVID, "snapshots"), { recursive: true }); try { fs.copyFileSync(p, path.join(EVID, "snapshots", name)); } catch {} }
}
fs.writeFileSync(path.join(EVID, "snake-trunk-snapshots-post.sha256"), snaps.map((s) => `${s.sha256} *${s.name}`).join("\n") + "\n");
writeJson(path.join(POST, "trunk-snapshots-post.json"), snaps);
out.snapshotsNewInRun = snaps.filter((s) => s.newInRun).length;
out.runsPost = runsPost.map((r) => ({ dir: r.dir, state: r.state }));

// ---------- 7) budget recount ----------
const created = after.filter((j) => j.kind === "request.created");
const cardsByKind = {}; for (const j of created) if (["proposal", "appointment", "acceptance", "intent-confirm"].includes(j.cardKind)) cardsByKind[j.cardKind] = (cardsByKind[j.cardKind] ?? 0) + 1;
const dispatches = after.filter((j) => j.kind === "task.created");
const turnsByRole = {};
const abortedTurnsByRole = {};
const settledDetail = [];
for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
  const replay = path.join(sessionsDir, role, "claude", "ans", "replay.jsonl");
  if (!exists(replay)) continue;
  for (const line of readJsonl(replay)) { try { const j = JSON.parse(line); if (j.kind === "event" && j.event?.kind === "settled" && j.at && j.at >= msgMark) { turnsByRole[role] = (turnsByRole[role] ?? 0) + 1; const summary = String(j.event.summary ?? ""); const aborted = /中止/.test(summary); if (aborted) abortedTurnsByRole[role] = (abortedTurnsByRole[role] ?? 0) + 1; settledDetail.push({ role, at: j.at, summary: summary.slice(0, 200), aborted }); } } catch {} }
}
let gitCalls = 0;
for (const role of exists(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
  const projectsDir = path.join(sessionsDir, role, "claude", "native", "projects");
  if (!exists(projectsDir)) continue;
  for (const proj of fs.readdirSync(projectsDir)) {
    const pdir = path.join(projectsDir, proj);
    let files = []; try { files = fs.readdirSync(pdir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) for (const line of readJsonl(path.join(pdir, f))) {
      if (!line.includes("mcp__ans__git_")) continue;
      let j = null; try { j = JSON.parse(line); } catch {}
      if (!j || j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
      if (j.timestamp && j.timestamp < msgMark) continue;
      for (const c of j.message.content) if (c?.type === "tool_use" && /^mcp__ans__git_(query|candidate|publish)$/.test(String(c.name))) gitCalls++;
    }
  }
}
out.budgetPost = { cardsTotal: Object.values(cardsByKind).reduce((a, b) => a + b, 0), cardsByKind, dispatches: dispatches.length, turnsByRole, abortedTurnsByRole, settledDetail, gitCalls };
writeJson(path.join(POST, "budget-post.json"), out.budgetPost);

// ---------- 8) evidence SHA-256 index ----------
function walkEvidence(dir) {
  const acc = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) acc.push(...walkEvidence(p));
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}
const evFiles = walkEvidence(EVID).filter((p) => path.basename(p) !== "sha256sums.txt").sort((a, b) => Buffer.compare(Buffer.from(path.relative(EVID, a)), Buffer.from(path.relative(EVID, b))));
fs.writeFileSync(path.join(EVID, "sha256sums.txt"), evFiles.map((p) => `${sha256(fs.readFileSync(p))} *${path.relative(EVID, p).split(path.sep).join("/")}`).join("\n") + "\n");
out.evidenceFiles = evFiles.length;

writeJson(path.join(POST, "post-summary.json"), out);
console.log(JSON.stringify(out, null, 2).slice(0, 6000));
