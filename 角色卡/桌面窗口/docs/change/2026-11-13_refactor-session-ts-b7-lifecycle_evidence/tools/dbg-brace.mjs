import fs from "node:fs";
const text = fs.readFileSync("app/desktop/session.ts", "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const lineStarts = []; { let o = 0; for (const l of lines) { lineStarts.push(o); o += l.length + 1; } }
const lineOfOffset = (off) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };
function findBraceEnd2(src, openBraceOffset, trace) {
  const stack = [{ kind: "code", expr: false }];
  let depth = 0;
  for (let i = openBraceOffset; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); if (trace) console.log("template pop", lineOfOffset(i)+1); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true, depth: 0 }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); if (trace) console.log("template push", lineOfOffset(i)+1); continue; }
    if (ch === "{") { top.depth = (top.depth ?? 0) + 1; if (trace && !top.expr) console.log("depth++", lineOfOffset(i)+1, top.depth); continue; }
    if (ch === "}") {
      if (top.expr && (top.depth ?? 0) === 0) { stack.pop(); if (trace) console.log("expr pop", lineOfOffset(i)+1); continue; }
      if (top.expr) { top.depth -= 1; continue; }
      if ((top.depth ?? 0) === 0) { if (trace) console.log("RETURN", lineOfOffset(i)+1); return i; }
      top.depth -= 1;
      if (top.depth === 0) { if (trace) console.log("RETURN0", lineOfOffset(i)+1); return i; }
      if (trace) console.log("depth--", lineOfOffset(i)+1, top.depth);
      continue;
    }
  }
  throw new Error("unterminated");
}
const bodyOpen = lineStarts[1273] + lines[1273].lastIndexOf("{");
console.log("decl", lines[1272].slice(0, 80), "| body line", lines[1273].slice(0,80));
const end = findBraceEnd2(text, bodyOpen, true);
console.log("end", lineOfOffset(end) + 1);
