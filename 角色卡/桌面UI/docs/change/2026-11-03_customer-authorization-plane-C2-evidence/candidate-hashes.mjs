// C2 evidence helper: print line count, SHA-256 and git hash-object for C2 candidates.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const files = [
  "app/renderer/src/chat/ipc.ts",
  "app/renderer/src/shell/Composer.tsx",
  "app/renderer/src/shell/ConfirmCard.tsx",
  "app/renderer/src/shell/shell.css",
  "app/renderer/src/chat/directive-dialog.tsx",
  "app/renderer/src/chat/directive-panel.tsx",
  "app/renderer/src/stores/directive-store.ts",
  "test/桌面UI/directive-dialog.test.ts",
  "test/桌面UI/directive-panel.test.ts",
];
console.log("# C2 candidates (dist/ is ignored and not a candidate)");
for (const file of files) {
  const abs = path.join(REPO, file);
  const bytes = readFileSync(abs);
  const lines = bytes.toString("utf8").split(/\r?\n/).length;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const gitHash = execFileSync("git", ["hash-object", file], { cwd: REPO, encoding: "utf8" }).trim();
  console.log(`${lines}\t${sha256}\t${gitHash}\t${file}`);
}
