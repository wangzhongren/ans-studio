// T1（Batch 5）：T3 文件集与 B0（420 文件）差异，便于失败归因与披露。
import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const cur = fs.readFileSync(path.join(dir, "19-t3-file-list.txt"), "utf8").split(/\r?\n/).filter(Boolean);
const b0Path = path.resolve(dir, "../2026-11-04_trunk-amendment-B0-evidence/19-t3-file-list.txt");
const b0 = fs.readFileSync(b0Path, "utf8").split(/\r?\n/).filter(Boolean);
const curSet = new Set(cur);
const b0Set = new Set(b0);
const added = cur.filter((file) => !b0Set.has(file));
const removed = b0.filter((file) => !curSet.has(file));
const lines = [`cur=${cur.length} b0=${b0.length} added=${added.length} removed=${removed.length}`, "", "added:", ...added, "", "removed:", ...removed];
fs.writeFileSync(path.join(dir, "19-t3-diff-vs-b0.txt"), lines.join("\n") + "\n", "utf8");
console.log(lines[0]);
