// RR20 preparation (re-clean plan A): same-root clean copy again (sessions moved out + ledger reset to empty).
// Preserve docs/trunk git-init artifacts/operations/git-init-process/versions/doc-freezes/init-sources/.git.
// Bounded manifests; no unbounded recursive full-tree hashing of the original target.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment";
const R20 = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round20";
const EVID = path.join(R20, "evidence");
const PRE = path.join(EVID, "pre");
const TARGET = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round8\\target";
const ORIG = "C:\\Users\\51054\\Desktop\\work\\ans-game2d-snake-2026-11-09\\target";
fs.mkdirSync(PRE, { recursive: true });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const rel = (root, p) => path.relative(root, p).split(path.sep).join("/");
const out = { at: new Date().toISOString(), round: "RR20",
  target: TARGET, construction: "re-clean same-root copy: .ans/sessions moved out, .ans/state/tasks.jsonl reset to empty (RR19 run state removed); repoId/init provenance preserved; original target untouched" };

function walkFiles(root, opts = {}) {
  const maxFiles = opts.maxFiles ?? 5000;
  const acc = [];
  (function walk(dir, depth) {
    if (acc.length > maxFiles) throw new Error("file cap exceeded: " + maxFiles);
    if (depth > 12) return;
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

// ---------- PRE facts ----------
out.head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
out.tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO, encoding: "utf8" }).trim();
out.branch = execFileSync("git", ["branch", "--show-current"], { cwd: REPO, encoding: "utf8" }).trim();
out.candidateStatus = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
fs.writeFileSync(path.join(PRE, "candidate-status.txt"), out.candidateStatus.join("\n") + (out.candidateStatus.length ? "\n" : ""));
out.candidateModified = out.candidateStatus.length;
const envPath = path.join(REPO, ".env");
out.env = {};
if (exists(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m && /MODEL|EFFORT|BASE_URL/i.test(m[1])) out.env[m[1]] = m[2]; }
out.entry = { path: path.join(REPO, "app/main.ts"), bytes: fs.statSync(path.join(REPO, "app/main.ts")).size, sha256: sha256(fs.readFileSync(path.join(REPO, "app/main.ts"))) };
out.electronVersion = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules/electron/package.json"), "utf8")).version;
out.nodeVersion = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();

const rr19 = path.join(REPO, "角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md");
const rr19buf = fs.readFileSync(rr19);
out.bindingRR19 = { rel: "角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md", bytes: rr19buf.length, sha256: sha256(rr19buf) };
if (!out.bindingRR19.sha256.startsWith("a4a90ebe")) throw new Error("RR19 binding mismatch: " + out.bindingRR19.sha256);

// Candidate attestation (RR20): 5-file candidate (2 M + 3 new) + B1/B2/D1/W1/W2/W5 bindings.
const candFiles = ["src/common/门禁引擎/classify-shell.ts", "src/service/trunk/impl/apply-journal.ts",
  "test/测试/bootstrap-frozen-closure-integration.test.ts", "test/编排/bootstrap-frozen-closure.test.ts", "test/门禁引擎/freeze-closure.test.ts"];
const candRows = candFiles.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(path.join(REPO, f))) }))
  .sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));
const candAgg = sha256(Buffer.from(candRows.map((r) => r.path + "\0" + r.sha256).join(""), "utf8"));
out.candidate = { files: candRows, fileCount: candRows.length, aggregate: candAgg,
  aggregateFormula: 'SHA-256 over UTF-8-path-sorted concatenation of path + "\\0" + sha256(hex)', branch: out.branch, head: out.head, tree: out.tree };
out.bindings = {};
for (const [id, rel] of [["B1", "docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md"],
  ["B2", "docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-report-v1.md"],
  ["D1", "角色卡/测试/docs/change/2026-11-10_D1_bootstrap-snapshot-freeze-closure.md"],
  ["W1", "角色卡/编排/docs/change/2026-11-10_W1_bootstrap-snapshot-freeze-closure.md"],
  ["W2", "角色卡/门禁引擎/docs/change/2026-11-10_W2_bootstrap-snapshot-freeze-closure.md"],
  ["W5", "角色卡/测试/docs/change/2026-11-10_W5_bootstrap-snapshot-freeze-closure.md"]]) {
  const b = fs.readFileSync(path.join(REPO, rel)); out.bindings[id] = { rel, bytes: b.length, sha256: sha256(b) };
}
if (out.bindings.B1.sha256 !== "9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b") throw new Error("B1 binding mismatch");
if (out.bindings.B2.sha256 !== "6a91eb14f3c3c9be173e8909c44ed193585729a77b3f29f0680e70d6562c1c98") throw new Error("B2 binding mismatch");
if (out.bindings.D1.sha256 !== "2d88b40d3848d80e9dc5a7cff3d8f695e7fcd4c96219bd2c472a18280595fa64") throw new Error("D1 binding mismatch");
if (candAgg !== "e99f7cb47355f2f7d61a85fee6cbd9d8ab1ba977f3cbfbcacd5461575ba44490") throw new Error("candidate aggregate mismatch: " + candAgg);

try {
  const netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8", timeout: 20000 });
  const lines = netstat.split(/\r?\n/).filter((l) => /:922[23]\b/.test(l));
  fs.writeFileSync(path.join(PRE, "ports-and-processes-pre.txt"), lines.join("\n") + (lines.length ? "\n" : ""));
  out.portsPre = { listeners9222: lines.filter((l) => /LISTENING/.test(l) && /:9222\b/.test(l)).length,
    listeners9223: lines.filter((l) => /LISTENING/.test(l) && /:9223\b/.test(l)).length, rawLines: lines.length };
} catch (e) { out.portsPre = { error: String(e).slice(0, 300) }; }
try { out.electronPre = execFileSync("tasklist", [], { encoding: "utf8", timeout: 20000 }).split(/\r?\n/).filter((l) => /electron/i.test(l)); }
catch (e) { out.electronPre = ["tasklist-error: " + String(e).slice(0, 200)]; }

const tasksPath = path.join(TARGET, ".ans/state/tasks.jsonl");
const sessionsPath = path.join(TARGET, ".ans/sessions");
const ledgerBuf = fs.readFileSync(tasksPath);
out.ledgerPre = { bytes: ledgerBuf.length, lines: ledgerBuf.toString("utf8").split(/\r?\n/).filter(Boolean).length, sha256: sha256(ledgerBuf) };
const sessFiles = walkFiles(sessionsPath).map((p) => ({ rel: rel(sessionsPath, p), bytes: fs.statSync(p).size, sha256: sha256(fs.readFileSync(p)) }));
sessFiles.sort((a, b) => Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)));
fs.writeFileSync(path.join(PRE, "sessions-source-manifest-before.sha256"), sessFiles.map((f) => `${f.sha256} *${f.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "sessions-source-manifest-before.json"), { files: sessFiles.length, bytes: sessFiles.reduce((a, f) => a + f.bytes, 0), entries: sessFiles });
out.sessionsPre = { files: sessFiles.length, bytes: sessFiles.reduce((a, f) => a + f.bytes, 0) };
out.targetPre = { files: walkFiles(TARGET).length, bytes: walkFiles(TARGET).reduce((a, p) => a + fs.statSync(p).size, 0) };

const stateFiles = [".ans/state/versions.jsonl", ".ans/state/doc-freezes.json", ".ans/state/version-changes.json",
  ".ans/state/stable-writes.json", ".ans/state/stable-write-permits.json", ".ans/state/versions.initialized"];
out.statePre = {};
for (const f of stateFiles) { const p = path.join(TARGET, f); if (exists(p)) { const b = fs.readFileSync(p); out.statePre[f] = { bytes: b.length, sha256: sha256(b) }; } }
for (const f of stateFiles) if (out.statePre[f]) fs.copyFileSync(path.join(TARGET, f), path.join(PRE, path.basename(f) + ".pre"));
const gipPath = path.join(TARGET, ".ans/git-init-process.json");
const gipBuf = fs.readFileSync(gipPath);
out.gitInitProcessPre = { bytes: gipBuf.length, sha256: sha256(gipBuf), operationId: JSON.parse(gipBuf.toString("utf8")).operationId };
const opDir = path.join(TARGET, ".ans/trunk/operations/83ca5888f7d9e4b1e97c2aa8044be183b2fc20cd4951d09de6d6d78ed233cf90");
const initBuf = fs.readFileSync(path.join(opDir, "init.json"));
const initJson = JSON.parse(initBuf.toString("utf8"));
out.initOperationPre = { dir: rel(TARGET, opDir), initBytes: initBuf.length, initSha256: sha256(initBuf),
  stage: initJson.stage, operationId: initJson.operationId, repoId: initJson.repoId, candidate: initJson.candidate,
  projectRoot: initJson.projectRoot };
fs.copyFileSync(path.join(opDir, "init.json"), path.join(PRE, "init-operation.json.pre"));
out.trunkPre = {
  manifestExists: exists(path.join(TARGET, ".ans/trunk/manifest.json")),
  gitModeExists: exists(path.join(TARGET, ".ans/trunk/git-mode.json")),
  gitDirExists: exists(path.join(TARGET, ".git")),
  operations: fs.readdirSync(path.join(TARGET, ".ans/trunk/operations")).sort(),
  snapshots: fs.readdirSync(path.join(TARGET, ".ans/trunk/snapshots")).sort(),
  initSources: fs.readdirSync(path.join(TARGET, ".ans/trunk/initialization-sources")).sort(),
};
out.gitPre = {
  head: fs.readFileSync(path.join(TARGET, ".git/HEAD"), "utf8").trim(),
  candidateRefs: fs.readdirSync(path.join(TARGET, ".git/refs/ans/candidates")).sort(),
  trunkRefExists: exists(path.join(TARGET, ".git/refs/ans/trunk")),
};
try { out.gitRefsPre = execFileSync("git", ["-C", TARGET, "--no-optional-locks", "for-each-ref", "--format=%(refname) %(objectname)"], { encoding: "utf8", timeout: 15000 }).trim().split(/\r?\n/).filter(Boolean); }
catch (e) { out.gitRefsPreError = String(e).slice(0, 300); }

const freezes = JSON.parse(fs.readFileSync(path.join(TARGET, ".ans/state/doc-freezes.json"), "utf8"));
out.frozenDocs = [];
for (const entry of freezes.entries) { const b = fs.readFileSync(path.join(TARGET, entry.path)); out.frozenDocs.push({ path: entry.path, expected: entry.sha256, actual: sha256(b), bytes: b.length, match: sha256(b) === entry.sha256 }); }
writeJson(path.join(PRE, "frozen-docs-pre.json"), out.frozenDocs);
out.frozenDocsAllMatch = out.frozenDocs.every((f) => f.match);

try {
  const origFiles = walkFiles(ORIG, { maxFiles: 5000 });
  out.origTargetPre = { files: origFiles.length, bytes: origFiles.reduce((a, p) => a + fs.statSync(p).size, 0) };
  const rr16Pre = path.join("C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round16\\evidence\\orig-target-pre.sha256");
  if (exists(rr16Pre)) {
    const rows = fs.readFileSync(rr16Pre, "utf8").split(/\r?\n/).filter(Boolean);
    let match = 0, mismatch = 0;
    for (const row of rows) { const m = /^([0-9a-f]{64}) \*(.+)$/.exec(row); if (!m) continue; const p = path.join(ORIG, m[2]); if (!exists(p)) { mismatch++; continue; } if (sha256(fs.readFileSync(p)) === m[1]) match++; else mismatch++; }
    out.origTargetHashCheck = { rows: rows.length, match, mismatch };
  }
} catch (e) { out.origTargetPre = { error: String(e).slice(0, 300) }; }

writeJson(path.join(PRE, "pre-facts.json"), out);
console.log(JSON.stringify({ phase: "pre-facts", head: out.head, bindingRR19: out.bindingRR19.sha256, ledgerPre: out.ledgerPre,
  sessionsPre: out.sessionsPre, targetPre: out.targetPre, statePre: out.statePre, gitInitProcessPre: out.gitInitProcessPre,
  initOperationPre: out.initOperationPre, trunkPre: out.trunkPre, gitPre: out.gitPre, frozenDocsAllMatch: out.frozenDocsAllMatch,
  portsPre: out.portsPre, origTargetPre: out.origTargetPre, origTargetHashCheck: out.origTargetHashCheck, env: out.env }, null, 2));

// ---------- ACTIONS ----------
const report = { at: new Date().toISOString(), ledgerCopy: null, sessionsMove: null, ledgerReset: null };
const ledgerCopyPath = path.join(PRE, "source-ledger-tasks.jsonl");
fs.copyFileSync(tasksPath, ledgerCopyPath);
const copyBuf = fs.readFileSync(ledgerCopyPath);
report.ledgerCopy = { path: rel(R20, ledgerCopyPath), bytes: copyBuf.length, lines: copyBuf.toString("utf8").split(/\r?\n/).filter(Boolean).length,
  sha256: sha256(copyBuf), equalsSource: sha256(copyBuf) === out.ledgerPre.sha256 };
if (!report.ledgerCopy.equalsSource) throw new Error("ledger copy hash mismatch");
const destSessions = path.join(PRE, "sessions-source");
if (exists(destSessions)) throw new Error("destination sessions-source already exists; refusing to overwrite/merge blindly");
fs.renameSync(sessionsPath, destSessions);
const movedFiles = manifestOf(destSessions);
fs.writeFileSync(path.join(PRE, "sessions-source.sha256"), movedFiles.map((f) => `${f.sha256} *${f.rel}`).join("\n") + "\n");
writeJson(path.join(PRE, "sessions-source-manifest-after.json"), { files: movedFiles.length, bytes: movedFiles.reduce((a, f) => a + f.bytes, 0), entries: movedFiles });
const beforeMap = new Map(sessFiles.map((f) => [f.rel, f.sha256]));
const movedMatch = movedFiles.length === sessFiles.length && movedFiles.every((f) => beforeMap.get(f.rel) === f.sha256);
report.sessionsMove = { from: rel(R20, path.join(TARGET, ".ans/sessions")), to: rel(R20, destSessions),
  filesBefore: sessFiles.length, bytesBefore: out.sessionsPre.bytes, filesAfter: movedFiles.length,
  bytesAfter: movedFiles.reduce((a, f) => a + f.bytes, 0), allHashesMatch: movedMatch, sourceDirStillExists: exists(sessionsPath) };
if (!movedMatch) throw new Error("moved sessions manifest mismatch");
fs.writeFileSync(tasksPath, Buffer.alloc(0));
const newBuf = fs.readFileSync(tasksPath);
report.ledgerReset = { sourceBytes: out.ledgerPre.bytes, sourceLines: out.ledgerPre.lines, sourceSha256: out.ledgerPre.sha256,
  newBytes: newBuf.length, newSha256: sha256(newBuf), disclosure: "re-done ledger reset to empty pre-run fixture for RR20 clean-copy construction" };
if (newBuf.length !== 0 || sha256(newBuf) !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") throw new Error("empty ledger hash mismatch");

// ---------- POST verification ----------
const post = { at: new Date().toISOString() };
post.sessionsDirGone = !exists(sessionsPath);
post.ledger = { bytes: fs.statSync(tasksPath).size, sha256: sha256(fs.readFileSync(tasksPath)), lines: 0, legacyIllegalModuleDirectory: 0 };
post.frozenDocsUnchanged = freezes.entries.map((entry) => { const b = fs.readFileSync(path.join(TARGET, entry.path)); return { path: entry.path, sha256: sha256(b), match: sha256(b) === entry.sha256 }; });
post.frozenDocsAllMatch = post.frozenDocsUnchanged.every((f) => f.match);
post.statePost = {};
for (const f of stateFiles) { const p = path.join(TARGET, f); if (exists(p)) { const b = fs.readFileSync(p); post.statePost[f] = { bytes: b.length, sha256: sha256(b), matchPre: out.statePre[f]?.sha256 === sha256(b) }; } }
post.gitInitProcessPost = { sha256: sha256(fs.readFileSync(gipPath)), matchPre: sha256(fs.readFileSync(gipPath)) === out.gitInitProcessPre.sha256 };
post.initOperationPost = { initSha256: sha256(fs.readFileSync(path.join(opDir, "init.json"))), matchPre: sha256(fs.readFileSync(path.join(opDir, "init.json"))) === out.initOperationPre.initSha256 };
post.repoIdStillPresent = initJson.repoId;
post.trunkPost = { manifestExists: exists(path.join(TARGET, ".ans/trunk/manifest.json")), gitModeExists: exists(path.join(TARGET, ".ans/trunk/git-mode.json")),
  trunkRefExists: exists(path.join(TARGET, ".git/refs/ans/trunk")), operations: fs.readdirSync(path.join(TARGET, ".ans/trunk/operations")).sort(),
  initSourcesCount: fs.readdirSync(path.join(TARGET, ".ans/trunk/initialization-sources")).length, snapshotsCount: fs.readdirSync(path.join(TARGET, ".ans/trunk/snapshots")).length };
post.gitPost = { head: fs.readFileSync(path.join(TARGET, ".git/HEAD"), "utf8").trim(),
  candidateRefs: fs.readdirSync(path.join(TARGET, ".git/refs/ans/candidates")).sort(),
  candidateRefMatch: JSON.stringify(fs.readdirSync(path.join(TARGET, ".git/refs/ans/candidates")).sort()) === JSON.stringify(out.gitPre.candidateRefs),
  trunkRefExists: exists(path.join(TARGET, ".git/refs/ans/trunk")) };
post.targetPostFiles = manifestOf(TARGET);
post.targetPost = { files: post.targetPostFiles.length, bytes: post.targetPostFiles.reduce((a, f) => a + f.bytes, 0) };
post.under16MiB = post.targetPost.bytes < 16 * 1024 * 1024;
writeJson(path.join(PRE, "target-clean-manifest.json"), { root: TARGET, fileCount: post.targetPost.files, totalBytes: post.targetPost.bytes, files: post.targetPostFiles });
fs.writeFileSync(path.join(PRE, "target-clean.sha256"), post.targetPostFiles.map((f) => `${f.sha256} *${f.rel}`).join("\n") + "\n");
try { post.origTargetPost = { files: walkFiles(ORIG, { maxFiles: 5000 }).length }; } catch (e) { post.origTargetPost = { error: String(e).slice(0, 300) }; }
writeJson(path.join(PRE, "post-verify.json"), post);
writeJson(path.join(PRE, "prepare-report.json"), report);
fs.writeFileSync(path.join(EVID, "prepare-report.json"), JSON.stringify({ at: report.at, ledgerCopy: report.ledgerCopy, sessionsMove: report.sessionsMove, ledgerReset: report.ledgerReset, frozenDocsAllMatch: post.frozenDocsAllMatch, under16MiB: post.under16MiB }, null, 2));
console.log(JSON.stringify({ phase: "post", sessionsMove: report.sessionsMove, ledgerReset: report.ledgerReset, ledgerCopy: report.ledgerCopy,
  frozenDocsAllMatch: post.frozenDocsAllMatch, statePost: post.statePost, gitInitProcessPost: post.gitInitProcessPost, initOperationPost: post.initOperationPost,
  repoIdStillPresent: post.repoIdStillPresent, trunkPost: post.trunkPost, gitPost: post.gitPost, targetPost: post.targetPost, under16MiB: post.under16MiB, origTargetPost: post.origTargetPost }, null, 2));
