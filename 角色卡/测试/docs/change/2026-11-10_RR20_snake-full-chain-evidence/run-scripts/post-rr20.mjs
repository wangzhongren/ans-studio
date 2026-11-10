// RR20 post-run verification: ports/processes, zero-touch checks, target diff vs clean-pre manifest,
// frozen docs / init / repoId preservation, trunk originals, worktree identity. Read-only.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const R20 = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round20";
const EVID = path.join(R20, "evidence");
const PRE = path.join(EVID, "pre");
const POST = path.join(EVID, "post");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round8\\target";
const ORIG = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
fs.mkdirSync(POST, { recursive: true });
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const rel = (root, p) => path.relative(root, p).split(path.sep).join("/");
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

function walkFiles(root, opts = {}) {
  const acc = [];
  (function walk(dir, depth) {
    if (depth > 14 || acc.length > (opts.maxFiles ?? 20000)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, depth + 1);
      else if (ent.isFile()) acc.push(p);
    }
  })(root, 0);
  return acc;
}
function manifestOf(root) {
  return walkFiles(root).map((p) => ({ rel: rel(root, p), bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
}

const out = { at: new Date().toISOString(), round: "RR20" };
// ports / electron post
try {
  const netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8", timeout: 20000 });
  const lines = netstat.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
  fs.writeFileSync(path.join(POST, "ports-post.txt"), lines.join("\n") + (lines.length ? "\n" : ""));
  out.portsPost = { listeners9222: lines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length,
    listeners9223: lines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length,
    established9223: lines.filter((l) => /ESTABLISHED/.test(l) && /:9223\b/.test(l)).length,
    timeWait9223: lines.filter((l) => /TIME_WAIT/.test(l) && /:9223\b/.test(l)).length, rawLines: lines.length };
} catch (e) { out.portsPost = { error: String(e).slice(0, 300) }; }
try { out.electronPost = execFileSync("tasklist", [], { encoding: "utf8", timeout: 20000 }).split(/\r?\n/).filter((l) => /electron/i.test(l)); }
catch (e) { out.electronPost = ["tasklist-error: " + String(e).slice(0, 200)]; }

// target diff vs clean-pre
const preManifest = JSON.parse(fs.readFileSync(path.join(PRE, "target-clean-manifest.json"), "utf8"));
const postFiles = manifestOf(TARGET);
writeJson(path.join(POST, "target-post-manifest.json"), { root: TARGET, fileCount: postFiles.length, totalBytes: postFiles.reduce((a, f) => a + f.bytes, 0), files: postFiles });
fs.writeFileSync(path.join(POST, "target-post.sha256"), postFiles.map((f) => `${f.sha256} *${f.rel}`).join("\n") + "\n");
const preMap = new Map(preManifest.files.map((f) => [f.rel, f]));
const postMap = new Map(postFiles.map((f) => [f.rel, f]));
const added = postFiles.filter((f) => !preMap.has(f.rel));
const removed = preManifest.files.filter((f) => !postMap.has(f.rel));
const changed = postFiles.filter((f) => preMap.has(f.rel) && preMap.get(f.rel).sha256 !== f.sha256);
out.targetDiff = { fileCountPre: preManifest.fileCount, bytesPre: preManifest.totalBytes, fileCountPost: postFiles.length, bytesPost: postFiles.reduce((a, f) => a + f.bytes, 0),
  added: added.map((f) => ({ rel: f.rel, bytes: f.bytes })), removed: removed.map((f) => ({ rel: f.rel })), changed: changed.map((f) => ({ rel: f.rel, bytes: f.bytes })) };
fs.writeFileSync(path.join(POST, "target-diff.txt"), [
  `pre files=${preManifest.fileCount} bytes=${preManifest.totalBytes}`, `post files=${postFiles.length} bytes=${out.targetDiff.bytesPost}`,
  `added ${added.length}:`, ...added.map((f) => `  + ${f.rel} (${f.bytes})`),
  `removed ${removed.length}:`, ...removed.map((f) => `  - ${f.rel}`),
  `changed ${changed.length}:`, ...changed.map((f) => `  ~ ${f.rel}`)].join("\n") + "\n");

// frozen docs / init / state preservation
const freezes = JSON.parse(fs.readFileSync(path.join(TARGET, ".ans/state/doc-freezes.json"), "utf8"));
out.frozenDocsPost = freezes.entries.map((entry) => { const b = fs.readFileSync(path.join(TARGET, entry.path)); return { path: entry.path, sha256: sha256(b), match: sha256(b) === entry.sha256 }; });
out.frozenDocsAllMatch = out.frozenDocsPost.every((f) => f.match);
const gip = path.join(TARGET, ".ans/git-init-process.json");
out.gitInitProcessPost = { bytes: fs.statSync(gip).size, sha256: sha256(fs.readFileSync(gip)) };
const opDir = path.join(TARGET, ".ans/trunk/operations/83ca5888f7d9e4b1e97c2aa8044be183b2fc20cd4951d09de6d6d78ed233cf90");
out.initOperationPost = exists(path.join(opDir, "init.json")) ? { initSha256: sha256(fs.readFileSync(path.join(opDir, "init.json"))), operationId: JSON.parse(fs.readFileSync(path.join(opDir, "init.json"), "utf8")).operationId, repoId: JSON.parse(fs.readFileSync(path.join(opDir, "init.json"), "utf8")).repoId } : null;
out.statePost = {};
for (const f of [".ans/state/versions.jsonl", ".ans/state/doc-freezes.json", ".ans/state/version-changes.json", ".ans/state/stable-writes.json", ".ans/state/stable-write-permits.json"]) {
  const p = path.join(TARGET, f); if (exists(p)) { const b = fs.readFileSync(p); out.statePost[f] = { bytes: b.length, sha256: sha256(b) }; fs.copyFileSync(p, path.join(POST, path.basename(f) + ".post")); }
}
// trunk originals
out.trunkPost = {
  manifestExists: exists(path.join(TARGET, ".ans/trunk/manifest.json")),
  gitModeExists: exists(path.join(TARGET, ".ans/trunk/git-mode.json")),
  operations: exists(path.join(TARGET, ".ans/trunk/operations")) ? fs.readdirSync(path.join(TARGET, ".ans/trunk/operations")).sort() : [],
  snapshots: exists(path.join(TARGET, ".ans/trunk/snapshots")) ? fs.readdirSync(path.join(TARGET, ".ans/trunk/snapshots")).sort() : [],
};
if (out.trunkPost.manifestExists) {
  fs.copyFileSync(path.join(TARGET, ".ans/trunk/manifest.json"), path.join(POST, "trunk-manifest.json"));
  out.trunkManifest = { bytes: fs.statSync(path.join(TARGET, ".ans/trunk/manifest.json")).size, sha256: sha256(fs.readFileSync(path.join(TARGET, ".ans/trunk/manifest.json"))) };
}
if (out.trunkPost.gitModeExists) { fs.copyFileSync(path.join(TARGET, ".ans/trunk/git-mode.json"), path.join(POST, "trunk-git-mode.json")); }
out.gitPost = { head: fs.readFileSync(path.join(TARGET, ".git/HEAD"), "utf8").trim(),
  candidateRefs: exists(path.join(TARGET, ".git/refs/ans/candidates")) ? fs.readdirSync(path.join(TARGET, ".git/refs/ans/candidates")).sort() : [],
  trunkRef: exists(path.join(TARGET, ".git/refs/ans/trunk")) ? fs.readFileSync(path.join(TARGET, ".git/refs/ans/trunk"), "utf8").trim() : null };
if (out.gitPost.trunkRef) fs.copyFileSync(path.join(TARGET, ".git/refs/ans/trunk"), path.join(POST, "git-ref-trunk.txt"));
try { out.gitLogPost = execFileSync("git", ["-C", TARGET, "--no-optional-locks", "log", "--format=%H %s"], { encoding: "utf8", timeout: 15000 }).trim().split(/\r?\n/).filter(Boolean); } catch (e) { out.gitLogPostError = String(e).slice(0, 300); }
try { out.gitRefsPost = execFileSync("git", ["-C", TARGET, "--no-optional-locks", "for-each-ref", "--format=%(refname) %(objectname)"], { encoding: "utf8", timeout: 15000 }).trim().split(/\r?\n/).filter(Boolean); } catch (e) { out.gitRefsPostError = String(e).slice(0, 300); }

// original target zero-touch: count + key file hashes only
try {
  const origFiles = walkFiles(ORIG, { maxFiles: 5000 });
  out.origTargetPost = { files: origFiles.length, bytes: origFiles.reduce((a, p) => a + fs.statSync(p).size, 0) };
  const rr16Pre = path.join("C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round16\\evidence\\orig-target-pre.sha256");
  if (exists(rr16Pre)) {
    const rows = fs.readFileSync(rr16Pre, "utf8").split(/\r?\n/).filter(Boolean);
    let match = 0, mismatch = 0;
    for (const row of rows) {
      const m = /^([0-9a-f]{64}) \*(.+)$/.exec(row); if (!m) continue;
      const p = path.join(ORIG, m[2]); if (!exists(p)) { mismatch++; continue; }
      if (sha256(fs.readFileSync(p)) === m[1]) match++; else mismatch++;
    }
    out.origTargetHashCheck = { rows: rows.length, match, mismatch };
  }
} catch (e) { out.origTargetPost = { error: String(e).slice(0, 300) }; }

// worktree identity post
out.head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
out.tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO, encoding: "utf8" }).trim();
out.branch = execFileSync("git", ["branch", "--show-current"], { cwd: REPO, encoding: "utf8" }).trim();
out.candidateStatus = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
out.statusPorcelain = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain"], { cwd: REPO, encoding: "utf8" });
fs.writeFileSync(path.join(POST, "git-status-full-post.txt"), out.statusPorcelain);

// sessions present after run
out.sessionsPost = exists(path.join(TARGET, ".ans/sessions")) ? { dirs: fs.readdirSync(path.join(TARGET, ".ans/sessions")), fileCount: walkFiles(path.join(TARGET, ".ans/sessions")).length } : { dirs: [], fileCount: 0 };
writeJson(path.join(POST, "post-summary.json"), out);
console.log(JSON.stringify({ portsPost: out.portsPost, electronPost: out.electronPost, targetDiff: { pre: [out.targetDiff.fileCountPre, out.targetDiff.bytesPre], post: [out.targetDiff.fileCountPost, out.targetDiff.bytesPost], added: out.targetDiff.added.length, removed: out.targetDiff.removed.length, changed: out.targetDiff.changed.length }, frozenDocsAllMatch: out.frozenDocsAllMatch, gitInitProcessPost: out.gitInitProcessPost, initOperationPost: out.initOperationPost, trunkPost: out.trunkPost, trunkManifest: out.trunkManifest ?? null, gitPost: out.gitPost, gitRefsPost: out.gitRefsPost ?? null, origTargetPost: out.origTargetPost, origTargetHashCheck: out.origTargetHashCheck ?? null, head: out.head, branch: out.branch, candidateModified: out.candidateStatus.length, sessionsPost: out.sessionsPost }, null, 2));
