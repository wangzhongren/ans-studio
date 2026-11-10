// RR2 post-check (outside repo; writes only under round3/evidence/).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round3";
const EVID = path.join(RUN, "evidence");
const POST = path.join(EVID, "post");
const TARGET = path.join(RUN, "target");
fs.mkdirSync(POST, { recursive: true });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 });

const pre = JSON.parse(fs.readFileSync(path.join(EVID, "pre", "pre-summary.json"), "utf8"));
const out = { at: new Date().toISOString(), round: "RR3", repo: REPO, target: TARGET };

const ns = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
const portLines = ns.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
fs.writeFileSync(path.join(POST, "ports-and-processes-post.txt"), portLines.join("\n") + "\n");
out.portsPost = { lines: portLines, listeners9222: portLines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length, listeners9223: portLines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length };
out.processesPost = { electron: execFileSync("tasklist", [], { encoding: "utf8" }).split(/\r?\n/).filter((l) => /electron/i.test(l)) };

out.head = git(["rev-parse", "HEAD"]).trim();
out.tree = git(["rev-parse", "HEAD^{tree}"]).trim();
out.branch = git(["branch", "--show-current"]).trim();
const fullStatus = git(["-c", "core.quotepath=false", "status", "--porcelain"]);
fs.writeFileSync(path.join(POST, "git-status-full-post.txt"), fullStatus);
out.fullStatusSha256Post = sha256(Buffer.from(fullStatus));
out.fullStatusSha256Pre = pre.fullStatusSha256;
out.fullStatusIdentical = out.fullStatusSha256Post === pre.fullStatusSha256;
const candStatus = git(["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"]);
fs.writeFileSync(path.join(POST, "candidate-status-post.txt"), candStatus);
const candFiles = candStatus.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
const sorted = [...candFiles].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const candRows = sorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
out.candidateFileCount = candFiles.length;
out.candidateAggregate = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join("")));
out.candidateAggregatePre = pre.candidateAggregate;
out.candidateAggregateMatch = out.candidateAggregate === pre.candidateAggregate;
out.candidateFilesMatch = JSON.stringify(candRows.map((r) => [r.path, r.sha256])) === JSON.stringify(pre.candidateRows.map((r) => [r.path, r.sha256]));
fs.writeFileSync(path.join(POST, "candidate-sha256-post.txt"), candRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n");

const ls = git(["ls-files", "-co", "--exclude-standard", "-z", "--", "src", "app", "test"]).split("\0").filter(Boolean);
const manSorted = [...ls].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const manRows = manSorted.map((f) => ({ path: f, bytes: fs.statSync(path.join(REPO, f)).size, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }));
const manText = manRows.map((r) => `${r.sha256}\t${r.path}`).join("\n") + "\n";
fs.writeFileSync(path.join(POST, "manifest-src-app-test-post.txt"), manText);
out.manifestFileCount = manRows.length;
out.manifestTextSha256 = sha256(Buffer.from(manText));
out.manifestAggregate = sha256(Buffer.from(manRows.map((r) => r.path + "\0" + r.sha256).join("")));
out.manifestFileCountPre = pre.manifestFileCount;
out.manifestAggregatePre = pre.manifestAggregate;
out.manifestMatch = out.manifestFileCount === pre.manifestFileCount && out.manifestAggregate === pre.manifestAggregate;
out.manifestTotalBytes = manRows.reduce((a, r) => a + r.bytes, 0);

const files = [];
(function walk(dir) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, ent.name); if (ent.isDirectory()) walk(p); else if (ent.isFile()) files.push(p); } })(TARGET);
const rows = files.map((p) => ({ rel: path.relative(TARGET, p).split(path.sep).join("/"), abs: p })).sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
const manifest = rows.map((r) => { const buf = fs.readFileSync(r.abs); return { rel: r.rel, bytes: buf.length, sha256: sha256(buf) }; });
fs.writeFileSync(path.join(EVID, "target-post.sha256"), manifest.map((r) => `${r.sha256} *${r.rel}`).join("\n") + "\n");
writeJson(path.join(POST, "target-manifest-post.json"), { target: TARGET, fileCount: manifest.length, files: manifest });
const preMan = JSON.parse(fs.readFileSync(path.join(EVID, "pre", "target-manifest-pre.json"), "utf8"));
const preMap = new Map(preMan.files.map((r) => [r.rel, r.sha256]));
const postMap = new Map(manifest.map((r) => [r.rel, r.sha256]));
const added = manifest.filter((r) => !preMap.has(r.rel)).map((r) => r.rel);
const removed = preMan.files.filter((r) => !postMap.has(r.rel)).map((r) => r.rel);
const changed = manifest.filter((r) => preMap.has(r.rel) && preMap.get(r.rel) !== r.sha256).map((r) => r.rel);
writeJson(path.join(POST, "target-diff.json"), { added, removed, changed });
fs.writeFileSync(path.join(POST, "target-diff.txt"), [`added ${added.length}`, ...added.map((x) => `+ ${x}`), `changed ${changed.length}`, ...changed.map((x) => `~ ${x}`), `removed ${removed.length}`, ...removed.map((x) => `- ${x}`)].join("\n") + "\n");
out.targetPostFileCount = manifest.length;
out.targetDiff = { addedCount: added.length, changedCount: changed.length, removedCount: removed.length, added, changed, removed };

const diagDir = path.join(RUN, "userData", "ans", "diagnostics");
if (exists(diagDir)) { const d = path.join(EVID, "diagnostics-userData-post"); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(diagDir)) { try { fs.copyFileSync(path.join(diagDir, f), path.join(d, f)); } catch {} } out.diagFiles = fs.readdirSync(diagDir); }

writeJson(path.join(POST, "post-summary.json"), out);
console.log(JSON.stringify({ head: out.head, tree: out.tree, branch: out.branch, portsPost: { listeners9222: out.portsPost.listeners9222, listeners9223: out.portsPost.listeners9223 }, electronProcessesPost: out.processesPost.electron.length, gitStatusIdentical: out.fullStatusIdentical, candidate: { count: out.candidateFileCount, aggregate: out.candidateAggregate, match: out.candidateAggregateMatch, filesMatch: out.candidateFilesMatch }, manifest: { count: out.manifestFileCount, aggregate: out.manifestAggregate, match: out.manifestMatch }, targetPostFileCount: out.targetPostFileCount, targetDiff: { added: out.targetDiff.addedCount, changed: out.targetDiff.changedCount, removed: out.targetDiff.removedCount, addedList: out.targetDiff.added, changedList: out.targetDiff.changed, removedList: out.targetDiff.removed } }, null, 2));
