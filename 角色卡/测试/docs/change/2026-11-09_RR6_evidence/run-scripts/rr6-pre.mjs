// RR6 pre-state capture (outside repo; writes only under the RR6 run root).
// Identity: worktree HEAD/tree/branch/status, candidate 15 files raw SHA-256 + aggregate + src-app-test manifest.
// Environment: entry hash, provider/model from .env (redacted), node/electron versions, ports/processes.
// Target: per-file SHA-256 manifest + ledger/runs/snapshots/init-sources/sessions snapshots; trunk manifest presence.
// Zero-touch snapshots: snake app root (excluding target) and snake run root (full).
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
fs.mkdirSync(PRE, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

const out = { at: new Date().toISOString(), repo: REPO, target: TARGET, runRoot: RR };

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

// ---------- 3) src app test manifest (1107 tracked files; method = D1: sha256<TAB>path, sorted; aggregate path+NUL+sha) ----------
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
console.log(JSON.stringify({ head: out.head, tree: out.tree, branch: out.branch, candidateFileCount: out.candidateFileCount, candidateAggregate: out.candidateAggregate, manifestFileCount: out.manifestFileCount, manifestFileHash: out.manifestFileHash, manifestAggregate: out.manifestAggregate, entrySha256: out.entrySha256, trunkManifestExists: out.trunkManifestExists, targetPreFileCount: out.targetPreFileCount, listeners9222: out.portsPre.listeners9222, listeners9223: out.portsPre.listeners9223, appRootNonTargetFileCount: out.appRootNonTargetFileCount, snakeRunRootFileCount: out.snakeRunRootFileCount, oldRequestIds: out.oldRequestIds.length, model: out.env.ANS_CLAUDE_MODEL ?? null }, null, 2));
