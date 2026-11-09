// RR6b pre-state capture (correction round; outside repo; writes only under the RR6b run root rr2/evidence2).
// Identity: worktree HEAD/tree/branch/status, candidate 15 files raw SHA-256 + aggregate + src-app-test manifest.
// Environment: entry hash, provider/model from .env (redacted), node/electron versions, ports/processes.
// Target: per-file SHA-256 manifest + ledger/runs/snapshots/init-sources/sessions snapshots; trunk manifest presence.
// Docs: proposals/contracts/scheduling/product listings with hashes (frozen v1 baseline; accepted v2; RR5 team-plan).
// Binding: B1 v1.2 / team plan / dispatch log / D1 / prior RR6 record hashes.
// Zero-touch snapshots: snake app root (excluding target) and snake run root (full).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RR = "C:\\Users\\51054\\Desktop\\work\\ans-team-plan-run-2026-11-09";
const EVID = path.join(RR, "evidence2");
const PRE = path.join(EVID, "pre");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
const APP_ROOT = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09";
const SNAKE_RUN = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-run-2026-11-09";
fs.mkdirSync(PRE, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

const out = { at: new Date().toISOString(), repo: REPO, target: TARGET, runRoot: RR, round: "RR6b-correction" };

// ---------- 1) worktree identity ----------
out.head = git(["rev-parse", "HEAD"]).trim();
out.tree = git(["rev-parse", "HEAD^{tree}"]).trim();
out.branch = git(["branch", "--show-current"]).trim();
const fullStatus = git(["-c", "core.quotepath=false", "status", "--porcelain"]);
fs.writeFileSync(path.join(PRE, "git-status-full.txt"), fullStatus);
const candStatus = git(["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"]);
fs.writeFileSync(path.join(PRE, "candidate-status.txt"), candStatus);
const candFiles = candStatus.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
out.candidateFileCount = candFiles.length;
out.candidateStatusLines = candStatus.split(/\r?\n/).filter(Boolean);

// ---------- 2) candidate per-file SHA-256 + aggregate ----------
const candSorted = [...candFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const candRows = candSorted.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
out.candidateAggregate = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join("")));
fs.writeFileSync(path.join(PRE, "candidate-sha256.txt"), candRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n");
fs.writeFileSync(path.join(PRE, "candidate-aggregate.txt"), out.candidateAggregate + "\n");

// ---------- 3) src app test manifest (method = D1: sha256<TAB>path, sorted; aggregate path+NUL+sha) ----------
const lsFiles = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "-z", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split("\0").filter(Boolean);
const manSorted = [...lsFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const manRows = manSorted.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const manText = manRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n";
fs.writeFileSync(path.join(PRE, "manifest-src-app-test.txt"), manText);
out.manifestFileCount = manRows.length;
out.manifestFileHash = sha256(Buffer.from(manText));
out.manifestAggregate = sha256(Buffer.from(manRows.map((r) => r.path + "\0" + r.sha256).join("")));
const untrackedSrcAppTest = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--untracked-files=all", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/).filter((l) => l.startsWith("??"));
out.untrackedSrcAppTest = untrackedSrcAppTest.length;

// ---------- 4) entry / provider / model / versions ----------
const entry = path.join(REPO, "app", "main.ts");
out.entryPath = entry;
out.entrySha256 = sha256(fs.readFileSync(entry));
out.entryBytes = fs.statSync(entry).size;
const rendererIndex = path.join(REPO, "app", "renderer", "dist", "index.html");
out.rendererIndex = { path: rendererIndex, exists: exists(rendererIndex), sha256: exists(rendererIndex) ? sha256(fs.readFileSync(rendererIndex)) : null };
const envPath = path.join(REPO, ".env");
out.env = { path: envPath, exists: exists(envPath), keys: [] };
if (exists(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    out.env.keys.push(key);
    if (/MODEL|EFFORT|PROVIDER/i.test(key)) out.env[key] = m[2];
  }
}
const electronPkg = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules", "electron", "package.json"), "utf8"));
out.electronVersion = electronPkg.version;
out.nodeVersion = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
out.platform = execFileSync("uname", ["-a"], { encoding: "utf8" }).trim();

// ---------- 5) ports / processes pre ----------
const netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
const portLines = netstat.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
fs.writeFileSync(path.join(PRE, "ports-and-processes-pre.txt"), portLines.join("\n") + "\n");
out.portsPre = { lines: portLines, listeners9222: portLines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length, listeners9223: portLines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length };
const tasklist = execFileSync("tasklist", [], { encoding: "utf8" });
out.processesPre = { electron: tasklist.split(/\r?\n/).filter((l) => /electron/i.test(l)) };

// ---------- 6) target pre manifest + state ----------
const files = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile()) files.push(p);
  }
})(TARGET);
const rows = files.map((p) => ({ rel: path.relative(TARGET, p).split(path.sep).join("/"), abs: p }));
rows.sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
const manifest = rows.map((r) => { const buf = fs.readFileSync(r.abs); return { rel: r.rel, sha256: sha256(buf), bytes: buf.length }; });
fs.writeFileSync(path.join(EVID, "snake-target-pre.sha256"), manifest.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "target-manifest-pre.json"), { target: TARGET, fileCount: manifest.length, files: manifest });
out.targetPreFileCount = manifest.length;

// trunk manifest presence (RR6-B precondition; read-only)
const trunkManifest = path.join(TARGET, ".ans", "trunk", "manifest.json");
out.trunkManifestExists = exists(trunkManifest);
out.trunkManifestSha256 = exists(trunkManifest) ? sha256(fs.readFileSync(trunkManifest)) : null;
out.trunkDirListing = exists(path.join(TARGET, ".ans", "trunk")) ? fs.readdirSync(path.join(TARGET, ".ans", "trunk")) : [];

// ledger + state copies
for (const [rel, outRel] of [
  [".ans/state/tasks.jsonl", "tasks-pre.jsonl"],
  [".ans/state/doc-freezes.json", "pre/doc-freezes.json"],
  [".ans/state/versions.jsonl", "pre/versions.jsonl"],
  [".ans/state/versions.initialized", "pre/versions.initialized"],
]) {
  const src = path.join(TARGET, rel);
  if (exists(src)) cp(src, path.join(EVID, outRel));
}
const ledgerPre = exists(path.join(TARGET, ".ans/state/tasks.jsonl")) ? fs.readFileSync(path.join(TARGET, ".ans/state/tasks.jsonl"), "utf8").split(/\r?\n/).filter(Boolean) : [];
out.ledgerPreRows = ledgerPre.length;
out.oldRequestIds = [...new Set(ledgerPre.map((l) => { try { const j = JSON.parse(l); return j.kind === "request.created" ? j.requestId : null; } catch { return null; } }).filter(Boolean))];
// undelivered/unclosed task pre-check (restore will replay these on import)
const taskRecs = new Map();
for (const l of ledgerPre) { let j = null; try { j = JSON.parse(l); } catch { continue; } if (!j.taskId) continue; if (!taskRecs.has(j.taskId)) taskRecs.set(j.taskId, { created: null, delivered: null, reports: 0, closed: null }); const x = taskRecs.get(j.taskId); if (j.kind === "task.created") x.created = j; if (j.kind === "task.delivered") x.delivered = j; if (j.kind === "task.reported") x.reports++; if (j.kind === "task.closed") x.closed = j; }
out.undeliveredTasksPre = [...taskRecs.entries()].filter(([, x]) => x.created && !x.closed && !x.delivered && x.reports === 0).map(([id, x]) => ({ taskId: id, to: x.created.to, at: x.created.at, from: x.created.from }));

// runs pre
const runsDir = path.join(TARGET, ".ans/runs");
const runs = [];
if (exists(runsDir)) {
  for (const name of fs.readdirSync(runsDir)) {
    const mp = path.join(runsDir, name, "manifest.json");
    if (!exists(mp)) continue;
    cp(mp, path.join(EVID, "runs-pre", name, "manifest.json"));
    try { const m = JSON.parse(fs.readFileSync(mp, "utf8")); runs.push({ dir: name, runId: m.runId, state: m.state, flowId: m.flowId, documentsKeys: Object.keys(m.documents ?? {}), execution: m.execution ?? null }); } catch (e) { runs.push({ dir: name, error: String(e) }); }
  }
}
writeJson(path.join(PRE, "runs-pre.json"), runs);
out.runsPre = runs.map((r) => ({ dir: r.dir, state: r.state }));

// trunk snapshots pre
const snapsDir = path.join(TARGET, ".ans/trunk/snapshots");
const snaps = [];
if (exists(snapsDir)) {
  for (const name of fs.readdirSync(snapsDir).sort()) {
    const p = path.join(snapsDir, name);
    if (!fs.statSync(p).isFile()) continue;
    snaps.push({ name, bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)) });
  }
}
fs.writeFileSync(path.join(PRE, "trunk-snapshots-pre.sha256"), snaps.map((s) => `${s.sha256} *${s.name}`).join("\n") + "\n");
writeJson(path.join(PRE, "trunk-snapshots-pre.json"), snaps);
out.trunkSnapshotsPre = snaps.length;

// init sources
const initDir = path.join(TARGET, ".ans/trunk/initialization-sources");
const initSummary = [];
if (exists(initDir)) {
  for (const name of fs.readdirSync(initDir).sort()) {
    const p = path.join(initDir, name);
    if (!fs.statSync(p).isFile()) continue;
    cp(p, path.join(EVID, "pre/initialization-sources", name));
    let j = null; try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    initSummary.push({ name, sha256: sha256(fs.readFileSync(p)), projectRoot: j?.projectRoot ?? null, registrationProjectRoot: j?.registration?.projectRoot ?? null });
  }
}
writeJson(path.join(PRE, "init-sources-summary.json"), initSummary);
out.initSources = initSummary;

// sessions pre summary
const sessionsDir = path.join(TARGET, ".ans/sessions");
const sessionSummary = [];
if (exists(sessionsDir)) {
  for (const role of fs.readdirSync(sessionsDir).sort()) {
    const roleDir = path.join(sessionsDir, role);
    if (!fs.statSync(roleDir).isDirectory()) continue;
    const entryRow = { role, runtimes: [] };
    for (const runtime of fs.readdirSync(roleDir)) {
      const rtDir = path.join(roleDir, runtime);
      if (!fs.statSync(rtDir).isDirectory()) continue;
      const r = { runtime };
      const ansDir = path.join(rtDir, "ans");
      if (exists(path.join(ansDir, "replay.jsonl"))) {
        const lines = fs.readFileSync(path.join(ansDir, "replay.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
        r.replayLines = lines.length;
        let settled = 0;
        for (const l of lines) { try { const j = JSON.parse(l); if (j.kind === "event" && j.event?.kind === "settled") settled++; } catch {} }
        r.settledTurns = settled;
      }
      entryRow.runtimes.push(r);
    }
    sessionSummary.push(entryRow);
  }
}
writeJson(path.join(PRE, "sessions-pre.json"), sessionSummary);
out.sessionsPre = sessionSummary.map((s) => ({ role: s.role, runtimes: s.runtimes.map((r) => ({ runtime: r.runtime, settledTurns: r.settledTurns ?? 0 })) }));

fs.writeFileSync(path.join(PRE, "target-listing.txt"), fs.readdirSync(TARGET).sort().join("\n") + "\n");

// ---------- 6b) target docs listing (proposals/contracts/scheduling/product) ----------
const docsEntry = {};
for (const sub of ["docs/proposals", "docs/contracts", "docs/scheduling", "docs/product", "docs/intents"]) {
  const dir = path.join(TARGET, sub);
  const list = [];
  if (exists(dir)) for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (!fs.statSync(p).isFile()) continue;
    list.push({ name, bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)), mtime: fs.statSync(p).mtime.toISOString() });
  }
  docsEntry[sub] = list;
}
writeJson(path.join(PRE, "target-docs-pre.json"), docsEntry);
out.targetDocsPre = Object.fromEntries(Object.entries(docsEntry).map(([k, v]) => [k, v.map((x) => x.name)]));

// ---------- 6c) binding inputs (repo docs, read-only) ----------
const bindings = {};
for (const [rel, key] of [
  ["docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md", "b1v12"],
  ["docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md", "teamPlan"],
  ["docs/scheduling/2026-11-09_dispatch-log_team-plan-run-binding.md", "dispatchLog"],
  ["角色卡/测试/docs/change/2026-11-09_D1_team-plan-run-binding.md", "d1Record"],
  ["角色卡/测试/docs/change/2026-11-09_RR6_team-plan-run-binding.md", "rr6Record"],
]) {
  const p = path.join(REPO, rel);
  if (!exists(p)) { bindings[key] = { rel, exists: false }; continue; }
  const buf = fs.readFileSync(p);
  bindings[key] = { rel, exists: true, bytes: buf.length, lines: buf.toString("utf8").split(/\r?\n/).length, sha256: sha256(buf) };
}
writeJson(path.join(PRE, "binding-inputs.json"), bindings);
out.bindingInputs = bindings;

// ---------- 7) zero-touch snapshots: app root (excluding target) + snake run root ----------
function fullManifest(rootDir, excludeRelPrefixes) {
  const acc = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      const rel = path.relative(rootDir, p).split(path.sep).join("/");
      if (excludeRelPrefixes.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) acc.push({ rel, sha256: sha256(fs.readFileSync(p)), bytes: fs.statSync(p).size });
    }
  })(rootDir);
  acc.sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
  return acc;
}
const appRootMan = fullManifest(APP_ROOT, ["target"]);
fs.writeFileSync(path.join(EVID, "snake-app-root-pre.sha256"), appRootMan.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "snake-app-root-pre.json"), { root: APP_ROOT, excluded: ["target"], fileCount: appRootMan.length, files: appRootMan });
out.appRootNonTargetFileCount = appRootMan.length;

const snakeRunMan = fullManifest(SNAKE_RUN, []);
fs.writeFileSync(path.join(EVID, "snake-run-root-pre.sha256"), snakeRunMan.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "snake-run-root-pre.json"), { root: SNAKE_RUN, fileCount: snakeRunMan.length, files: snakeRunMan });
out.snakeRunRootFileCount = snakeRunMan.length;

writeJson(path.join(PRE, "pre-summary.json"), out);
console.log(JSON.stringify({ head: out.head, tree: out.tree, branch: out.branch, candidateFileCount: out.candidateFileCount, candidateAggregate: out.candidateAggregate, manifestFileCount: out.manifestFileCount, manifestFileHash: out.manifestFileHash, manifestAggregate: out.manifestAggregate, entrySha256: out.entrySha256, trunkManifestExists: out.trunkManifestExists, targetPreFileCount: out.targetPreFileCount, listeners9222: out.portsPre.listeners9222, listeners9223: out.portsPre.listeners9223, appRootNonTargetFileCount: out.appRootNonTargetFileCount, snakeRunRootFileCount: out.snakeRunRootFileCount, oldRequestIds: out.oldRequestIds.length, undeliveredTasksPre: out.undeliveredTasksPre, model: out.env.ANS_CLAUDE_MODEL ?? null, docs: out.targetDocsPre }, null, 2));
