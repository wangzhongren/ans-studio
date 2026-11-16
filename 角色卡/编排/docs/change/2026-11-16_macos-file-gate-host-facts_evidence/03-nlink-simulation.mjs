// Local simulation of POSIX directory-nlink semantics against the real provider functions.
// No product file is modified; only the in-process fs.lstatSync result for one directory is
// presented with nlink+1, exactly what POSIX does when a first-level subdirectory is created.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
const realLstatSync = fs.lstatSync;
let bumpFor;
fs.lstatSync = function (p, opts) {
  const st = realLstatSync.call(fs, p, opts);
  if (bumpFor !== undefined && String(p) === bumpFor) {
    return new Proxy(st, { get(t, k) { return k === "nlink" ? t.nlink + 1 : Reflect.get(t, k); } });
  }
  return st;
};
fs.promises.lstat = fs.promises.lstat; // unchanged; provider async discovery is real
const { mkdtempSync, mkdirSync, rmSync } = fs;
const os = require("node:os"), path = require("node:path");
const provider = await import("file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/macgate/src/provider/trunk/public/trunk-store.ts");
const { readGitProtectionFacts, checkGitProtectionFactsCurrent, initializeGitRepository } = provider;
const scratch = mkdtempSync(path.join(os.tmpdir(), "ans-nlink-sim-"));
const root = path.join(scratch, "project"); mkdirSync(root);
try {
  const absent = await readGitProtectionFacts(root);
  console.log("absent coverage:", absent.coverage, "check:", checkGitProtectionFactsCurrent(absent));
  bumpFor = root;
  console.log("absent after root nlink+1 (POSIX mkdir docs/):", checkGitProtectionFactsCurrent(absent));
  bumpFor = undefined;
  await initializeGitRepository(root);
  const present = await readGitProtectionFacts(root);
  console.log("present coverage:", present.coverage, "reasons:", JSON.stringify(present.reasons), "check:", checkGitProtectionFactsCurrent(present));
  mkdirSync(path.join(root, "docs"));
  console.log("present after real mkdir docs/ on", process.platform, ":", checkGitProtectionFactsCurrent(present));
  bumpFor = root;
  console.log("present after simulated POSIX root nlink+1:", checkGitProtectionFactsCurrent(present));
  bumpFor = undefined;
  console.log("present after nlink restored:", checkGitProtectionFactsCurrent(present));
} finally { rmSync(scratch, { recursive: true, force: true }); }
