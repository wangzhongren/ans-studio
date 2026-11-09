// Build the baseline (HEAD) test tree in an extracted `git archive` copy, aligned to worktree EOLs
// (mirrors the methodology of the prior D1 record 2026-11-09_D1_team-plan-run-binding §2.1).
// - Non-candidate tracked files under src/app/test: copy worktree bytes verbatim (they are clean vs HEAD modulo EOL).
// - Candidate (modified/untracked-new) files: baseline content comes from HEAD blob; EOL converted per worktree file class.
// Usage: node 50-build-baseline.mjs <archiveCopyRoot> <worktreeRoot>
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [copyRoot, worktreeRoot] = process.argv.slice(2);
if (!copyRoot || !worktreeRoot) {
  console.error("usage: node 50-build-baseline.mjs <archiveCopyRoot> <worktreeRoot>");
  process.exit(2);
}

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: worktreeRoot, maxBuffer: 64 * 1024 * 1024, ...opts });

const candidates = new Set([
  "app/desktop/session.ts",
  "src/model/runtime.ts",
  "src/pipeline/orchestration/run-role.ts",
  "src/provider/runtime/schema.ts",
  "src/provider/runtime/tools.ts",
  "src/common/编排/doc-format-specs.ts",
  "test/runtime-core/doc-format-specs-pin.test.ts",
  "test/桌面应用/session.test.ts",
  "test/测试/doc-format-all-roles.test.ts",
  "test/编排/doc-format-specs.test.ts",
  "test/门禁引擎/doc-format-specs-pin.test.ts",
]);

const tracked = git(["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", "src", "app", "test"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const eolClass = (buf) => {
  const crlf = (buf.toString("binary").match(/\r\n/g) ?? []).length;
  const lf = (buf.toString("binary").match(/\n/g) ?? []).length - crlf;
  if (crlf > 0 && lf === 0) return "crlf";
  if (crlf === 0 && lf > 0) return "lf";
  if (crlf === 0 && lf === 0) return "no-eol";
  return `mixed(crlf=${crlf},lf=${lf})`;
};

const stats = { copiedFromWorktree: 0, materializedFromBlob: 0, eol: {}, candidates: [] };
for (const rel of tracked) {
  const dst = join(copyRoot, rel);
  mkdirSync(dirname(dst), { recursive: true });
  const wtPath = join(worktreeRoot, rel);
  if (!candidates.has(rel)) {
    copyFileSync(wtPath, dst);
    stats.copiedFromWorktree++;
    const cls = eolClass(readFileSync(dst));
    stats.eol[cls] = (stats.eol[cls] ?? 0) + 1;
  } else {
    let blob = git(["cat-file", "blob", `HEAD:${rel}`]);
    const wt = readFileSync(wtPath);
    const cls = eolClass(wt);
    if (cls === "crlf") blob = Buffer.from(blob.toString("binary").replace(/\n/g, "\r\n"), "binary");
    else if (cls !== "lf" && cls !== "no-eol") throw new Error(`unexpected EOL class for candidate ${rel}: ${cls}`);
    writeFileSync(dst, blob);
    stats.materializedFromBlob++;
    stats.candidates.push({ rel, eolClass: cls, baselineBytes: blob.length });
  }
}

// Fake worktree-shaped .git file (points to a non-existent gitdir) — mirrors prior D1 methodology.
const gitFile = join(copyRoot, ".git");
if (!existsSync(gitFile)) {
  writeFileSync(gitFile, `gitdir: ${join(copyRoot, "__nonexistent_gitdir__").replaceAll("\\", "/")}\n`);
}

// Copy .env if the worktree has one (untracked, read by some tests).
const envSrc = join(worktreeRoot, ".env");
if (existsSync(envSrc)) copyFileSync(envSrc, join(copyRoot, ".env"));

console.log(`tracked files under src/app/test at HEAD: ${tracked.length}`);
console.log(`copied verbatim from worktree: ${stats.copiedFromWorktree}`);
console.log(`materialized from HEAD blob (candidates): ${stats.materializedFromBlob}`);
console.log(`EOL class distribution (non-candidates): ${JSON.stringify(stats.eol)}`);
for (const c of stats.candidates) console.log(`candidate baseline: ${c.rel} eol=${c.eolClass} bytes=${c.baselineBytes}`);
