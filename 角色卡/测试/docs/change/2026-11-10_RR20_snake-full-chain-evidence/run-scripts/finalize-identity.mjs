// Finalize: record identity + evidence manifests (external + repo), path-sorted SHA-256 lists.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const REC = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment\\角色卡\\测试\\docs\\change\\2026-11-10_RR20_snake-full-chain.md";
const EVEXT = "C:\\Users\\51054\\Desktop\\work\\ans-snake-fullchain-run-2026-11-10\\round20\\evidence";
const EVREPO = "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\trunk-amendment\\角色卡\\测试\\docs\\change\\2026-11-10_RR20_snake-full-chain-evidence";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const buf = fs.readFileSync(REC);
const lines = buf.toString("utf8").split(/\r?\n/).length;
const identity = `record: 角色卡/测试/docs/change/2026-11-10_RR20_snake-full-chain.md\nlines: ${lines}\nbytes: ${buf.length}\nsha256: ${sha256(buf)}\n`;
fs.writeFileSync(path.join(EVEXT, "record-identity.txt"), identity);
fs.writeFileSync(path.join(EVREPO, "record-identity.txt"), identity);
console.log(identity.trim());

function manifest(dir) {
  const files = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && path.basename(p) !== "evidence-manifest.txt") files.push(p);
    }
  })(dir);
  files.sort((a, b) => Buffer.compare(Buffer.from(path.relative(dir, a).split(path.sep).join("/")), Buffer.from(path.relative(dir, b).split(path.sep).join("/"))));
  const rows = files.map((f) => `${sha256(fs.readFileSync(f))} *${path.relative(dir, f).split(path.sep).join("/")}`);
  fs.writeFileSync(path.join(dir, "evidence-manifest.txt"), rows.join("\n") + "\n");
  const m = fs.readFileSync(path.join(dir, "evidence-manifest.txt"));
  return { files: rows.length, manifestBytes: m.length, manifestSha256: sha256(m) };
}
console.log("external", JSON.stringify(manifest(EVEXT)));
console.log("repo", JSON.stringify(manifest(EVREPO)));
