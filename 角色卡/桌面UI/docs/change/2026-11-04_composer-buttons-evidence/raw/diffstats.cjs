const fs = require("node:fs");
const text = fs.readFileSync("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/composer-buttons-fix/角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/raw/diff.patch", "utf8");
let file = "";
const stats = new Map();
for (const line of text.split("\n")) {
  if (line.startsWith("+++ ")) { file = line.slice(4).trim(); stats.set(file, { add: 0, del: 0 }); continue; }
  if (file === "" || line.startsWith("--- ")) { continue; }
  if (line.startsWith("+")) { stats.get(file).add += 1; }
  else if (line.startsWith("-")) { stats.get(file).del += 1; }
}
for (const [f, s] of stats) { console.log(f + "\t+" + s.add + "\t-" + s.del); }
