// D1 manifest: canonical manifest = sorted "path\0sha256" concatenation digest.
// Usage: node 11-manifest.mjs <out-listing.txt> [mode]
//   mode "tracked+candidate" (default): git ls-files -co --exclude-standard -- src app test
//        = tracked HEAD files + non-ignored untracked (i.e., the 6 new candidate files), 1113 files.
//   mode "disk-all": walk src/, app/, test/ on disk (includes ignored app/renderer/dist), 1117 files.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const mode = process.argv[3] ?? "tracked+candidate";
const files = [];
if (mode === "disk-all") {
  const roots = ["src", "app", "test"];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name).replaceAll("\\", "/");
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) files.push(p);
      else if (ent.isSymbolicLink()) files.push(p); // record symlink path; hash target content if file
    }
  };
  for (const r of roots) walk(r);
} else {
  const out = execFileSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard", "--", "src", "app", "test"], { maxBuffer: 64 * 1024 * 1024 });
  files.push(...out.toString("utf8").split("\0").filter(Boolean));
}

const rows = [];
for (const p of files) {
  let st;
  try { st = statSync(p); } catch { rows.push({ p, size: -1, hash: "STAT_ERROR" }); continue; }
  const hash = st.isFile() ? sha256(readFileSync(p)) : "NON_FILE";
  rows.push({ p, size: st.size, hash });
}
rows.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
const concat = Buffer.concat(rows.map((r) => Buffer.from(`${r.p}\0${r.hash}`, "utf8")));
const digest = sha256(concat);
const totalBytes = rows.reduce((s, r) => s + Math.max(r.size, 0), 0);
const out = process.argv[2];
if (out) writeFileSync(out, rows.map((r) => `${r.hash}\t${r.size}\t${r.p}`).join("\n") + "\n");
console.log(`files: ${rows.length}`);
console.log(`total bytes: ${totalBytes}`);
console.log(`manifest digest (sorted "path\\0sha256" concat, SHA-256): ${digest}`);
