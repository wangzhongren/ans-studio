// Copy round-1 evidence from the external run root into the repo role-card evidence directory.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10";
const SRC = path.join(RUN, "evidence");
const DST = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment\\角色卡\\测试\\docs\\change\\2026-11-10_RR_document-format-specifications-evidence";

const copyTree = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
};
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const name of fs.readdirSync(SRC)) {
  const s = path.join(SRC, name);
  if (name === "sessions" || name === "diagnostics" || name === "diagnostics-userData-post" || name === "live" || name === "extracts" || name === "pre" || name === "post") { copyTree(s, path.join(DST, name)); continue; }
  fs.copyFileSync(s, path.join(DST, name));
}
// run scripts as evidence
copyTree(path.join(RUN, "rr"), path.join(DST, "run-scripts"));

// manifest (self excluded)
const files = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p); else if (ent.isFile()) files.push(p);
  }
})(DST);
files.sort((a, b) => Buffer.compare(Buffer.from(path.relative(DST, a).split(path.sep).join("/")), Buffer.from(path.relative(DST, b).split(path.sep).join("/"))));
const rows = files.filter((f) => path.basename(f) !== "evidence-manifest.txt").map((f) => {
  const rel = path.relative(DST, f).split(path.sep).join("/");
  const buf = fs.readFileSync(f);
  return `${createHash("sha256").update(buf).digest("hex")} *${rel}`;
});
fs.writeFileSync(path.join(DST, "evidence-manifest.txt"), rows.join("\n") + "\n");
console.log(JSON.stringify({ files: rows.length, manifestBytes: fs.statSync(path.join(DST, "evidence-manifest.txt")).size, manifestSha256: createHash("sha256").update(fs.readFileSync(path.join(DST, "evidence-manifest.txt"))).digest("hex") }, null, 2));
