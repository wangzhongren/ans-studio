const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const ROOT = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/composer-buttons-fix";
const files = [
  "app/renderer/src/shell/Composer.tsx",
  "app/renderer/src/test-driver.ts",
  "test/桌面UI/phase3b-electron-smoke.mjs",
  "test/桌面UI/phase4a-electron-smoke.mjs",
  "test/桌面UI/composer-buttons.test.ts",
  "角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/probe-composer-buttons.mjs",
  "角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/raw/apply-composer-buttons-patch.cjs"
];
for (const rel of files) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const blob = crypto.createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");
  console.log(rel + "\t" + sha + "\t" + blob);
}
