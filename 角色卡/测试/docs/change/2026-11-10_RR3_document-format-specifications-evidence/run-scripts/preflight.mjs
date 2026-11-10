// RR2 preflight (outside repo; writes only under round3/evidence/).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3";
const EVID = path.join(RUN, "evidence");
const PRE = path.join(EVID, "pre");
const TARGET = path.join(RUN, "target");
fs.mkdirSync(PRE, { recursive: true });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 });

const out = { at: new Date().toISOString(), round: "RR3", repo: REPO, target: TARGET, runRoot: RUN };
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
const sorted = [...candFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const candRows = sorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
out.candidateRows = candRows;
out.candidateAggregate = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join("")));
fs.writeFileSync(path.join(PRE, "candidate-sha256.txt"), candRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n");

const ls = git(["ls-files", "-co", "--exclude-standard", "-z", "--", "src", "app", "test"]).split("\0").filter(Boolean);
const manSorted = [...ls].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const manRows = manSorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const manText = manRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n";
fs.writeFileSync(path.join(PRE, "manifest-src-app-test.txt"), manText);
out.manifestFileCount = manRows.length;
out.manifestTextSha256 = sha256(Buffer.from(manText));
out.manifestAggregate = sha256(Buffer.from(manRows.map((r) => r.path + "\0" + r.sha256).join("")));
out.manifestTotalBytes = manRows.reduce((a, r) => a + r.bytes, 0);

const entry = path.join(REPO, "app", "main.ts");
out.entry = { path: entry, bytes: fs.statSync(entry).size, sha256: sha256(fs.readFileSync(entry)) };
const renderer = path.join(REPO, "app", "renderer", "dist", "index.html");
out.rendererIndex = { exists: exists(renderer), sha256: exists(renderer) ? sha256(fs.readFileSync(renderer)) : null };
out.env = { keys: [], model: null, effort: null, providerHint: null };
for (const line of fs.readFileSync(path.join(REPO, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/); if (!m) continue; out.env.keys.push(m[1]);
  if (m[1] === "ANS_CLAUDE_MODEL") out.env.model = m[2];
  if (m[1] === "ANS_CLAUDE_REASONING_EFFORT") out.env.effort = m[2];
  if (m[1] === "ANTHROPIC_BASE_URL") out.env.providerHint = m[2];
}
out.electronVersion = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules", "electron", "package.json"), "utf8")).version;
out.nodeVersion = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
out.gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();

const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
const portLines = ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
fs.writeFileSync(path.join(PRE, "ports-and-processes-pre.txt"), portLines.join("\n") + "\n");
out.portsPre = { lines: portLines, listeners9222: portLines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length, listeners9223: portLines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length };
out.processesPre = { electron: execFileSync("tasklist", [], { encoding: "utf8" }).split(/\r?\n/).filter((l) => /electron/i.test(l)) };
out.zeroTouch = { policy: "9222/贪吃蛇运行根与 snake target 全程零触碰：仅 netstat/tasklist；不读取其任何文件；不启动/占用/关闭 9222。", snakeFileReads: 0 };

// target pre manifest
const files = [];
(function walk(dir) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, ent.name); if (ent.isDirectory()) walk(p); else if (ent.isFile()) files.push(p); } })(TARGET);
const rows = files.map((p) => ({ rel: path.relative(TARGET, p).split(path.sep).join("/"), abs: p })).sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
const manifest = rows.map((r) => { const buf = fs.readFileSync(r.abs); return { rel: r.rel, bytes: buf.length, sha256: sha256(buf) }; });
fs.writeFileSync(path.join(EVID, "target-pre.sha256"), manifest.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "target-manifest-pre.json"), { target: TARGET, fileCount: manifest.length, files: manifest });
out.targetPreFileCount = manifest.length;
out.targetPreKeyFiles = manifest.filter((r) => /^(角色卡\/[^/]+\/(role-card\.md|boundary\.yaml)|角色卡\/governance-boundary\.yaml|\.ans\/project\.json|\.ans\/state\/tasks\.jsonl|\.ans\/state\/versions\.jsonl|docs\/proposals\/jinyong-rogue-2d-roster-v11\.md)$/.test(r.rel));
out.targetDocsPre = {};
for (const sub of ["docs/product", "docs/proposals", "docs/contracts", "docs/intents"]) {
  const dir = path.join(TARGET, sub);
  out.targetDocsPre[sub] = exists(dir) ? fs.readdirSync(dir).sort().filter((n) => fs.statSync(path.join(dir, n)).isFile()).map((n) => {
    const buf = fs.readFileSync(path.join(dir, n)); return { name: n, bytes: buf.length, sha256: sha256(buf) };
  }) : [];
}
writeJson(path.join(PRE, "target-docs-pre.json"), out.targetDocsPre);

const bindings = {};
for (const [rel, key] of [
  ["docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md", "b1v1"],
  ["docs/scheduling/2026-11-09_team-plan_document-format-specifications.md", "teamPlan"],
  ["docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md", "dispatchLog"],
  ["docs/planning/2026-11-09_design_document-format-specifications.md", "designP12"],
  ["docs/planning/2026-11-09_review_document-format-specifications.md", "reviewR11"],
  ["角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md", "d1Record"],
  ["角色卡/测试/docs/change/2026-11-10_RR_document-format-specifications.md", "rr1Record"],
  ["角色卡/测试/docs/change/2026-11-10_RR2_document-format-specifications.md", "rr2Record"],
]) {
  const p = path.join(REPO, rel);
  if (!exists(p)) { bindings[key] = { rel, exists: false }; continue; }
  const buf = fs.readFileSync(p);
  bindings[key] = { rel, exists: true, bytes: buf.length, lines: buf.toString("utf8").split(/\r?\n/).length, sha256: sha256(buf) };
}
writeJson(path.join(PRE, "binding-inputs.json"), bindings);
out.bindings = bindings;

writeJson(path.join(PRE, "pre-summary.json"), out);
const prepare = JSON.parse(fs.readFileSync(path.join(PRE, "prepare-target.json"), "utf8"));
console.log(JSON.stringify({
  head: out.head, tree: out.tree, branch: out.branch,
  candidate: { count: out.candidateFileCount, aggregate: out.candidateAggregate },
  manifest: { count: out.manifestFileCount, aggregate: out.manifestAggregate, bytes: out.manifestTotalBytes },
  entrySha256: out.entry.sha256, model: out.env.model, provider: out.env.providerHint,
  portsPre: { listeners9222: out.portsPre.listeners9222, listeners9223: out.portsPre.listeners9223 },
  electronProcessesPre: out.processesPre.electron.length,
  targetPreFileCount: out.targetPreFileCount,
  roster: prepare.roster,
  docsProduct: out.targetDocsPre["docs/product"].map((x) => x.name),
  bindings,
}, null, 2));
