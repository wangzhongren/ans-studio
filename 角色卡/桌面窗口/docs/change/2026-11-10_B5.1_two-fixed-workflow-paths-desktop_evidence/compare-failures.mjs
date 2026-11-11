import fs from "node:fs/promises";
const [beforeFile, afterFile] = process.argv.slice(2);
const before = JSON.parse(await fs.readFile(beforeFile, "utf8"));
const after = JSON.parse(await fs.readFile(afterFile, "utf8"));
const skip = new Set(["chief-workflow.test.ts"]);
const collect = (map) => {
  const out = new Map();
  for (const [file, names] of Object.entries(map)) {
    const base = file.split(/[\/]/).pop();
    if (base === "chief-workflow.test.ts") continue; // 非确定套件：单独复跑对照
    for (const name of names) out.set(`${base}\u0000${name}`, true);
  }
  return out;
};
const b = collect(before), a = collect(after);
const added = [...a.keys()].filter((k) => !b.has(k)).map((k) => k.replace("\u0000", " :: "));
const removed = [...b.keys()].filter((k) => !a.has(k)).map((k) => k.replace("\u0000", " :: "));
console.log(JSON.stringify({ beforeNames: b.size, afterNames: a.size, added, removed }, null, 2));
