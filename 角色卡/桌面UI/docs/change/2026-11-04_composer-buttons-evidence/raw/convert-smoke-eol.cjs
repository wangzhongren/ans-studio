const fs = require("node:fs");
const files = [
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/composer-buttons-fix/test/桌面UI/phase3b-electron-smoke.mjs",
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/composer-buttons-fix/test/桌面UI/phase4a-electron-smoke.mjs"
];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  if (text.includes("\r\n")) { console.log("already crlf " + f); continue; }
  fs.writeFileSync(f, text.split("\n").join("\r\n"));
  console.log("converted " + f);
}
