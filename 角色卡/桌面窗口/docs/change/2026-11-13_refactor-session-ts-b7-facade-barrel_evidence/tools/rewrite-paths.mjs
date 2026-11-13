import fs from "node:fs";
const file = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7/app/desktop/session/index.ts";
const lines = fs.readFileSync(file, "utf8").split("\n");
let changed = 0;
const out = lines.map((line) => {
  if (!/^import\b/.test(line)) return line;
  return line.replace(/from "([^"]+)"/, (_m, spec) => {
    let next = spec;
    if (spec.startsWith("./session/")) next = "./" + spec.slice("./session/".length);
    else if (spec.startsWith("../../src/")) next = "../../../src/" + spec.slice("../../src/".length);
    else if (spec.startsWith("./")) next = "../" + spec.slice(2);
    if (next !== spec) changed += 1;
    return `from "${next}"`;
  });
});
fs.writeFileSync(file, out.join("\n"), "utf8");
console.log("changed import specifiers:", changed);
