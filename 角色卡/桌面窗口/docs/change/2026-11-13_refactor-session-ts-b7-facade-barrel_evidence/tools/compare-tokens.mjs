import fs from "node:fs";

const orig = fs.readFileSync("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7/app/desktop/session.ts", "utf8");
const cand = fs.readFileSync("C:/Users/51054/AppData/Local/Temp/ans-b7b/index.candidate.ts", "utf8");

function classBody(text) {
  const lines = text.split("\n");
  const s = lines.findIndex((l) => l.startsWith("export class SessionManager {"));
  let e = lines.length - 1;
  while (e > s && lines[e].trim() === "") e -= 1;
  if (lines[e].trim() !== "}") throw new Error("bad end " + JSON.stringify(lines[e]));
  return lines.slice(s + 1, e).join("\n");
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  const BACKSLASH = String.fromCharCode(92);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let tok = c;
      i += 1;
      while (i < src.length) {
        const d = src[i];
        tok += d;
        i += 1;
        if (d === BACKSLASH) { tok += src[i] ?? ""; i += 1; continue; }
        if (d === q) break;
      }
      toks.push(tok);
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let tok = c;
      i += 1;
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) { tok += src[i]; i += 1; }
      toks.push(tok);
      continue;
    }
    toks.push(c);
    i += 1;
  }
  return toks;
}

const a = tokenize(classBody(orig));
const b = tokenize(classBody(cand));
console.log("orig tokens", a.length, "cand tokens", b.length);
let diffs = 0;
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i] !== b[i]) {
    diffs += 1;
    if (diffs <= 12) {
      console.log("DIFF at", i, "orig=", JSON.stringify(a.slice(Math.max(0, i - 8), i + 8)), "cand=", JSON.stringify(b.slice(Math.max(0, i - 8), i + 8)));
    }
  }
}
console.log("token diffs", diffs);
