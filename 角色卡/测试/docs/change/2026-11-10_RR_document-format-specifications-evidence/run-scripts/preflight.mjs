// RR document-format-specifications preflight (outside repo; writes only under the run root evidence/).
// Identity: worktree HEAD/tree/branch/status; candidate 11 files raw SHA-256 + aggregate; src/app/test
// manifest (tracked + untracked candidate; 1,113 files) + aggregate. Environment: entry hash, provider/model
// from .env (secrets redacted), node/electron versions. Ports/processes: netstat/tasklist only (no snake
// file reads). Target: full per-file SHA-256 manifest + docs/roles listing. Bindings: B1/plan/dispatch/D1/W5.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10";
const EVID = path.join(RUN, "evidence");
const PRE = path.join(EVID, "pre");
const TARGET = path.join(RUN, "target");
fs.mkdirSync(PRE, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 });

const out = { at: new Date().toISOString(), repo: REPO, target: TARGET, runRoot: RUN };

// 1) worktree identity
out.head = git(["rev-parse", "HEAD"]).trim();
out.tree = git(["rev-parse", "HEAD^{tree}"]).trim();
out.branch = git(["branch", "--show-current"]).trim();
const fullStatus = git(["-c", "core.quotepath=false", "status", "--porcelain"]);
fs.writeFileSync(path.join(PRE, "git-status-full.txt"), fullStatus);
out.fullStatusLines = fullStatus.split(/\r?\n/).filter(Boolean).length;
out.fullStatusSha256 = sha256(Buffer.from(fullStatus));
const candStatus = git(["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"]);
fs.writeFileSync(path.join(PRE, "candidate-status.txt"), candStatus);
const candFiles = candStatus.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
out.candidateFileCount = candFiles.length;
out.candidateStatusLines = candStatus.split(/\r?\n/).filter(Boolean);

// 2) candidate hashes + aggregate (path + "\0" + sha256, sorted by path)
const sorted = [...candFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const candRows = sorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
out.candidateRows = candRows;
out.candidateAggregate = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join("")));
fs.writeFileSync(path.join(PRE, "candidate-sha256.txt"), candRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n");

// 3) manifest: tracked + untracked (non-ignored) under src app test
const ls = git(["ls-files", "-co", "--exclude-standard", "-z", "--", "src", "app", "test"]).split("\0").filter(Boolean);
const manSorted = [...ls].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const manRows = manSorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const manText = manRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n";
fs.writeFileSync(path.join(PRE, "manifest-src-app-test.txt"), manText);
out.manifestFileCount = manRows.length;
out.manifestTextSha256 = sha256(Buffer.from(manText));
out.manifestAggregate = sha256(Buffer.from(manRows.map((r) => r.path + "\0" + r.sha256).join("")));
out.manifestTotalBytes = manRows.reduce((a, r) => a + r.bytes, 0);

// 4) entry / provider / model / versions (no secret values)
const entry = path.join(REPO, "app", "main.ts");
out.entry = { path: entry, bytes: fs.statSync(entry).size, sha256: sha256(fs.readFileSync(entry)) };
const renderer = path.join(REPO, "app", "renderer", "dist", "index.html");
out.rendererIndex = { path: renderer, exists: exists(renderer), sha256: exists(renderer) ? sha256(fs.readFileSync(renderer)) : null };
out.env = { path: path.join(REPO, ".env"), exists: exists(path.join(REPO, ".env")), keys: [], model: null, effort: null, providerHint: null };
if (out.env.exists) {
  for (const line of fs.readFileSync(path.join(REPO, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    out.env.keys.push(m[1]);
    if (m[1] === "ANS_CLAUDE_MODEL") out.env.model = m[2];
    if (m[1] === "ANS_CLAUDE_REASONING_EFFORT") out.env.effort = m[2];
    if (m[1] === "ANTHROPIC_BASE_URL") out.env.providerHint = m[2];
  }
}
out.electronVersion = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules", "electron", "package.json"), "utf8")).version;
out.nodeVersion = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
out.gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();

// 5) ports/processes (netstat/tasklist only; no snake file reads)
function portRows() {
  const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
  return ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
}
const prePorts = portRows();
fs.writeFileSync(path.join(PRE, "ports-and-processes-pre.txt"), prePorts.join("\n") + "\n");
out.portsPre = {
  lines: prePorts,
  listeners9222: prePorts.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length,
  listeners9223: prePorts.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length,
};
const tasklist = execFileSync("tasklist", [], { encoding: "utf8" });
out.processesPre = { electron: tasklist.split(/\r?\n/).filter((l) => /electron/i.test(l)) };
out.zeroTouch = {
  policy: "9222/贪吃蛇运行根与 target 全程零触碰：仅 netstat/tasklist 端口与进程检查；不读取 C:/Users/51054/Desktop/work/ans-game2d-snake-run-2026-11-09 与 C:/Users/51054/Desktop/work/ans-game2d-snake-2026-11-09 下任何文件；不启动/占用/关闭 9222。",
  snakeFileReads: 0,
};

// 6) target pre manifest
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
const manifest = rows.map((r) => { const buf = fs.readFileSync(r.abs); return { rel: r.rel, bytes: buf.length, sha256: sha256(buf) }; });
fs.writeFileSync(path.join(EVID, "target-pre.sha256"), manifest.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "target-manifest-pre.json"), { target: TARGET, fileCount: manifest.length, files: manifest });
out.targetPreFileCount = manifest.length;
out.targetPreKeyFiles = manifest.filter((r) => /^(角色卡\/[^/]+\/(role-card\.md|boundary\.yaml)|角色卡\/governance-boundary\.yaml|\.ans\/project\.json|\.ans\/state\/tasks\.jsonl|\.ans\/state\/versions\.jsonl)$/.test(r.rel));
const docsListing = {};
for (const sub of ["docs/product", "docs/proposals", "docs/contracts", "docs/intents", "docs/scheduling"]) {
  const dir = path.join(TARGET, sub);
  docsListing[sub] = exists(dir) ? fs.readdirSync(dir).sort().flatMap((name) => {
    const p = path.join(dir, name);
    if (!fs.statSync(p).isFile()) return [];
    const buf = fs.readFileSync(p);
    return [{ name, bytes: buf.length, sha256: sha256(buf) }];
  }) : [];
}
writeJson(path.join(PRE, "target-docs-pre.json"), docsListing);
out.targetDocsPre = Object.fromEntries(Object.entries(docsListing).map(([k, v]) => [k, v.map((x) => x.name)]));

// 7) binding inputs
const bindings = {};
for (const [rel, key] of [
  ["docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md", "b1v1"],
  ["docs/scheduling/2026-11-09_team-plan_document-format-specifications.md", "teamPlan"],
  ["docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md", "dispatchLog"],
  ["docs/planning/2026-11-09_design_document-format-specifications.md", "designP12"],
  ["docs/planning/2026-11-09_review_document-format-specifications.md", "reviewR11"],
  ["角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md", "d1Record"],
  ["角色卡/测试/docs/change/2026-11-09_W5_document-format-specifications.md", "w5Record"],
]) {
  const p = path.join(REPO, rel);
  if (!exists(p)) { bindings[key] = { rel, exists: false }; continue; }
  const buf = fs.readFileSync(p);
  bindings[key] = { rel, exists: true, bytes: buf.length, lines: buf.toString("utf8").split(/\r?\n/).length, sha256: sha256(buf) };
}
writeJson(path.join(PRE, "binding-inputs.json"), bindings);
out.bindings = bindings;

writeJson(path.join(PRE, "pre-summary.json"), out);
console.log(JSON.stringify({
  head: out.head, tree: out.tree, branch: out.branch,
  candidateFileCount: out.candidateFileCount, candidateAggregate: out.candidateAggregate,
  manifestFileCount: out.manifestFileCount, manifestAggregate: out.manifestAggregate, manifestTotalBytes: out.manifestTotalBytes,
  entrySha256: out.entry.sha256, model: out.env.model, providerHint: out.env.providerHint,
  portsPre: { listeners9222: out.portsPre.listeners9222, listeners9223: out.portsPre.listeners9223 },
  electronProcessesPre: out.processesPre.electron.length,
  targetPreFileCount: out.targetPreFileCount,
  targetDocsPre: out.targetDocsPre,
}, null, 2));
