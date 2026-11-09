// Regenerate evidence2/evidence-manifest.txt (excluding itself).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const E = "C:\\Users\\51054\\Desktop\\work\\ans-team-plan-run-2026-11-09\\evidence2";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function walk(d) { const a = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) a.push(...walk(p)); else if (e.isFile()) a.push(p); } return a; }
const files = walk(E).filter((p) => path.basename(p) !== "evidence-manifest.txt").sort((a, b) => Buffer.compare(Buffer.from(path.relative(E, a)), Buffer.from(path.relative(E, b))));
fs.writeFileSync(path.join(E, "evidence-manifest.txt"), files.map((p) => `${sha(fs.readFileSync(p))} *${path.relative(E, p).split(path.sep).join("/")}`).join("\n") + "\n");
console.log("manifest files:", files.length);
