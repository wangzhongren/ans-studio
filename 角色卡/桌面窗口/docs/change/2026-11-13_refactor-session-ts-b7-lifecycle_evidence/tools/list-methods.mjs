// B7 取证工具：枚举 session.ts（HEAD 或工作树）中 SessionManager 的全部方法（声明起始/体结束/行数）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const srcPath = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "app/desktop/session.ts");
const text = fs.readFileSync(srcPath, "utf8");
const lines = text.split(/\r?\n/);

function findBlockEnd(src, offset) {
  let depth = 0, state = "code", started = false;
  for (let i = offset; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    if (state === "line") { if (ch === "\n") state = "code"; continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "code"; i += 1; } continue; }
    if (state === "single") { if (ch === "\\") i += 1; else if (ch === "'") state = "code"; continue; }
    if (state === "double") { if (ch === "\\") i += 1; else if (ch === '"') state = "code"; continue; }
    if (state === "template") { if (ch === "\\") i += 1; else if (ch === "`") state = "code"; continue; }
    if (ch === "/" && next === "/") { state = "line"; i += 1; continue; }
    if (ch === "/" && next === "*") { state = "block"; i += 1; continue; }
    if (ch === "'") { state = "single"; continue; }
    if (ch === '"') { state = "double"; continue; }
    if (ch === "`") { state = "template"; continue; }
    if (ch === "{") { depth += 1; started = true; continue; }
    if (ch === "}" && --depth === 0 && started) return i;
  }
  throw new Error("unbalanced block");
}
const lineOffsets = []; { let offset = 0; for (const line of lines) { lineOffsets.push(offset); offset += line.length + 1; } }
const lineOf = (offset) => text.slice(0, offset).split("\n").length;

// class body range
const classStart = lines.findIndex((l) => l.startsWith("export class SessionManager {"));
if (classStart < 0) throw new Error("class not found");
const classEndLine = lineOf(findBlockEnd(text, lineOffsets[classStart] + lines[classStart].lastIndexOf("{")));

const declRe = /^  (?:private |public |protected )?(?:static )?(?:readonly )?(?:async )?(?:get |set )?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(:]/;
const methods = [];
for (let i = classStart; i < classEndLine; i += 1) {
  const line = lines[i];
  if (!/^  (?:private |public |protected )?(?:async )?(?:get |set )?[A-Za-z_$][\w$]*\s*[<(]/.test(line)) continue;
  if (/^  (?:private |public |protected )?(?:readonly )?[A-Za-z_$][\w$]*\s*[:=]/.test(line) && !line.includes("(")) continue;
  const m = declRe.exec(line);
  if (!m) continue;
  // find body open line then matching close
  let bodyOpenLine = -1, endLine = -1;
  for (let j = i; j < Math.min(lines.length, i + 30); j += 1) {
    const trimmed = lines[j].trimEnd();
    if (!trimmed.endsWith("{")) continue;
    const braceIndex = lineOffsets[j] + trimmed.lastIndexOf("{");
    const candidateEnd = lineOf(findBlockEnd(text, braceIndex));
    if (lines[candidateEnd - 1] === "  }") { bodyOpenLine = j + 1; endLine = candidateEnd; break; }
  }
  if (bodyOpenLine < 0) continue;
  let startLine = i + 1;
  let k = i - 1;
  while (k >= 0 && lines[k].trim() === "") k -= 1;
  if (k >= 0 && lines[k].trimEnd().endsWith("*/")) {
    let j = k; while (j >= 0 && !lines[j].trimStart().startsWith("/**")) j -= 1;
    if (j >= 0 && j < k) startLine = j + 1;
  }
  const name = m[1];
  const kind = /^  private /.test(line) ? "private" : /^  public /.test(line) ? "public" : /^  protected /.test(line) ? "protected" : "implicit";
  methods.push({ name, kind, startLine, declLine: i + 1, bodyOpenLine, endLine, lines: endLine - startLine + 1, bodyLines: endLine - bodyOpenLine + 1 });
  i = endLine - 1; // skip body
}
const out = { srcPath, totalLines: lines.length, classStart: classStart + 1, classEndLine, methodCount: methods.length, totalBodyLines: methods.reduce((a, m) => a + m.bodyLines, 0), methods };
fs.writeFileSync(path.join(HERE, "methods-current.json"), JSON.stringify(out, null, 2), "utf8");
for (const m of methods) console.log(`${m.kind.padEnd(8)} ${String(m.startLine).padStart(5)}-${String(m.endLine).padEnd(5)} body=${String(m.bodyLines).padStart(4)}  ${m.name}`);
console.log(`TOTAL methods=${methods.length} bodyLines=${out.totalBodyLines} fileLines=${lines.length}`);
