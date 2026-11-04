// T1（Batch 5）T3 文件清单生成：test/**/*.test.ts（含未跟踪候选文件），
// 排除既有已知挂起 test/pi-adapter/write-sequencing.test.ts（与 B0 口径一致）。
// 另生成 pi-adapter 显式文件清单（worktree 沙箱不接受超长命令行/命令替换）。
import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const root = path.resolve(dir, "../../../../..");
const norm = (p) => p.replace(/\\/g, "/");

const all = fs
  .globSync(path.join(root, "test/**/*.test.ts").replace(/\\/g, "/"))
  .map((abs) => norm(path.relative(root, abs)))
  .sort();
const excluded = ["test/pi-adapter/write-sequencing.test.ts"];
const list = all.filter((rel) => !excluded.includes(rel));
fs.writeFileSync(path.join(dir, "19-t3-file-list.txt"), list.join("\n") + "\n", "utf8");

const pi = all
  .filter((rel) => rel.startsWith("test/pi-adapter/") && !excluded.includes(rel))
  .map((rel) => rel.slice("test/pi-adapter/".length))
  .sort();
fs.writeFileSync(path.join(dir, "pi-adapter-explicit-files.txt"), pi.join("\n") + "\n", "utf8");
console.log(`all=${all.length} excluded=${excluded.length} expected=${list.length} piExplicit=${pi.length}`);
