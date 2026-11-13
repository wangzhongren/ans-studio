import fs from "node:fs";

const REPO = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7";
const text = fs.readFileSync(`${REPO}/app/desktop/session.ts`, "utf8");
const lines = text.split("\n");
const importRanges = [];
{
  let i = 0;
  while (i < lines.length) {
    if (/^import\b/.test(lines[i])) {
      let j = i;
      let chunk = lines[i];
      while (!chunk.trimEnd().endsWith(";") && j + 1 < lines.length) { j += 1; chunk += "\n" + lines[j]; }
      const stmts = chunk.split(";").map((s) => s.trim()).filter(Boolean).map((s) => s + ";");
      importRanges.push({ start: i, end: j, stmts });
      i = j + 1;
    } else i += 1;
  }
}
const statements = importRanges.flatMap((r) => r.stmts);
function moduleOf(stmt) {
  const m = stmt.match(/^import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}
const keptSrc = fs.readFileSync("C:/Users/51054/AppData/Local/Temp/ans-b7b/index.candidate.ts", "utf8");
const keptModules = new Set();
for (const line of keptSrc.split("\n")) {
  if (!/^import\b/.test(line)) continue;
  const m = line.match(/^import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/);
  if (m) keptModules.add(m[1]);
}
const dropped = statements.filter((s) => { const mod = moduleOf(s); return mod !== null && !keptModules.has(mod) && !keptSrc.includes(`from "${mod}"`); });
console.log("dropped statements whose module is not imported at all in index:", dropped.length);
for (const d of dropped) console.log("  -", moduleOf(d), "|", d.replace(/\s+/g, " ").slice(0, 120));
