// B7 取证工具 v4：从成员声明起点做栈式词法扫描，定位真实方法体（区分类型字面量/字段初始化）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const file = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "app/desktop/session.ts");
const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const lineStarts = []; { let o = 0; for (const l of lines) { lineStarts.push(o); o += l.length + 1; } }
const lineOfOffset = (off) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };

// 栈式词法器：从 start 开始扫，跳过字符串/模板/注释；回到调用方关心的事件。
function matchBrace(src, openOffset) {
  const stack = [{ kind: "code", expr: false, depth: 0 }];
  for (let i = openOffset; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true, depth: 0 }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); continue; }
    if (ch === "{") { top.depth += 1; continue; }
    if (ch === "}") {
      if (top.expr && top.depth === 0) { stack.pop(); continue; }
      if (top.expr) { top.depth -= 1; continue; }
      top.depth -= 1;
      if (top.depth === 0) return i;
      continue;
    }
  }
  throw new Error("unterminated brace");
}

// 类体范围与类内行深度。
function classInfo(src) {
  const declLine = lines.findIndex((l) => l.startsWith("export class SessionManager {"));
  const open = lineStarts[declLine] + lines[declLine].lastIndexOf("{");
  const close = matchBrace(src, open);
  return { declLine, open, close, startLine: declLine + 1, endLine: lineOfOffset(close) + 1 };
}
const cls = classInfo(text);

// 从成员声明行起点扫描：返回 { endLine, isField, isOneLiner, bodyStart }
function scanMember(src, li) {
  let paren = 0;
  const stack = [{ kind: "code", expr: false, depth: 0 }];
  for (let i = lineStarts[li]; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true, depth: 0 }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); continue; }
    if (top.expr) { if (ch === "{") top.depth += 1; else if (ch === "}") { if (top.depth === 0) stack.pop(); else top.depth -= 1; } continue; }
    if (ch === "(") { paren += 1; continue; }
    if (ch === ")") { paren -= 1; continue; }
    if (ch === "{" && paren === 0) {
      const close = matchBrace(src, i);
      const after = src.slice(close + 1, src.indexOf("\n", close) === -1 ? src.length : src.indexOf("\n", close));
      if (/^\s*;?\s*$/.test(after)) {
        return { endLine: lineOfOffset(close) + 1, isField: false, isOneLiner: lineOfOffset(close) === li, bodyStart: i };
      }
      i = close; // 类型字面量/初始化器的括号，继续往后
      continue;
    }
    if (ch === ";" && paren === 0) return { endLine: lineOfOffset(i) + 1, isField: true, isOneLiner: false, bodyStart: -1 };
  }
  throw new Error("member scan overrun at line " + (li + 1));
}

const declRe = /^  (?:(private|public|protected) )?(?:(static) )?(?:(readonly) )?(?:(async) )?(?:(get|set) )?([A-Za-z_$][\w$]*)\s*(?:<[^(){}]*>)?\s*[(:]/;
const members = [];
// 先粗筛候选行（2 空格缩进的声明形态），再用词法扫描验证并确定边界。
for (let li = cls.declLine + 1; li < cls.endLine - 1; li += 1) {
  const line = lines[li];
  const m = declRe.exec(line);
  if (!m) continue;
  if (!/^  \S/.test(line)) continue;
  // 排除方法体内的续行：方法体内缩进 ≥4；但对象字面量里可能有 2 空格的行? 本文件方法体缩进为 4。
  const scan = scanMember(text, li);
  const name = m[6];
  const kind = m[5] === "get" ? "get" : m[5] === "set" ? "set" : name === "constructor" ? "ctor" : m[1] ?? "public";
  members.push({ name, kind, startLine: li + 1, endLine: scan.endLine, bodyLines: scan.endLine - (li + 1) + 1, isField: scan.isField, isOneLiner: scan.isOneLiner });
  li = scan.endLine - 1;
}
const methods = members.filter((m) => !m.isField);
const out = { file, totalLines: lines.length, classStartLine: cls.startLine, classEndLine: cls.endLine, methodCount: methods.length, fieldCount: members.length - methods.length, totalMethodLines: methods.reduce((a, m) => a + m.bodyLines, 0), members };
fs.writeFileSync(path.join(HERE, "methods-current.json"), JSON.stringify(out, null, 2), "utf8");
for (const m of members) if (!m.isField) console.log(`${m.kind.padEnd(8)} ${String(m.startLine).padStart(5)}-${String(m.endLine).padEnd(5)} lines=${String(m.bodyLines).padStart(4)}${m.isOneLiner ? " one" : ""}  ${m.name}`);
console.log(`TOTAL methods=${out.methodCount} fields=${out.fieldCount} methodLines=${out.totalMethodLines} class=${out.classStartLine}-${out.classEndLine} fileLines=${lines.length}`);
