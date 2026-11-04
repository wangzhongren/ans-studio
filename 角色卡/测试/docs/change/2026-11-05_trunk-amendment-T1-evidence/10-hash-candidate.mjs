// T1（Batch 5）候选哈希：对 `git status --porcelain -uall` 中 src/app/test 下的改动文件
// 逐个记录 `git hash-object`（工作区字节）与 sha256（NTFS 工作区字节）。不暂存。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const root = path.resolve(dir, "../../../../..");
const status = execFileSync("git", ["-c", "core.quotePath=false", "status", "--porcelain", "-uall", "-z"], { cwd: root, encoding: "utf8" });
const rows = status
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3))
  .filter((rel) => rel.startsWith("src/") || rel.startsWith("app/") || rel.startsWith("test/"))
  .sort();

const lines = [];
for (const rel of rows) {
  const abs = path.join(root, ...rel.split("/"));
  const data = fs.readFileSync(abs);
  const sha256 = createHash("sha256").update(data).digest("hex");
  let objectId = "-";
  try {
    objectId = execFileSync("git", ["hash-object", "--", rel], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* 未跟踪文件也可 hash-object；异常如实记 - */
  }
  lines.push(`${objectId}  sha256=${sha256}  ${rel}`);
}
fs.writeFileSync(path.join(dir, "10-candidate-hashes.txt"), lines.join("\n") + "\n", "utf8");
console.log(`files=${rows.length}`);
