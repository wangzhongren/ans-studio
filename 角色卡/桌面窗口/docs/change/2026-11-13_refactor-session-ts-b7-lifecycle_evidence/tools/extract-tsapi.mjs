// B7 取证工具：用 TypeScript 编译器 API 枚举 SessionManager 方法/访问器（精确边界）。
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const file = process.argv[2] ?? "app/desktop/session.ts";
const src = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const out = [];
for (const stmt of sf.statements) {
  if (!ts.isClassDeclaration(stmt) || !stmt.name || stmt.name.text !== "SessionManager") continue;
  for (const m of stmt.members) {
    let name = null, kind = null;
    if (ts.isMethodDeclaration(m) && m.name) { name = m.name.getText(sf); kind = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) ? "private" : m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword) ? "static" : "public"; }
    else if (ts.isGetAccessor(m) && m.name) { name = "get " + m.name.getText(sf); kind = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) ? "private-get" : "get"; }
    else if (ts.isSetAccessor(m) && m.name) { name = "set " + m.name.getText(sf); kind = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) ? "private-set" : "set"; }
    else if (ts.isConstructorDeclaration(m)) { name = "constructor"; kind = "ctor"; }
    else if (ts.isPropertyDeclaration(m) && m.name) { name = m.name.getText(sf); kind = "field"; }
    if (!name) continue;
    const bodyText = m.body ? m.body.getText(sf) : "";
    out.push({ name, kind, startLine: lineOf(m.getStart(sf)), endLine: lineOf(m.getEnd()), bodyLines: m.body ? lineOf(m.getEnd()) - lineOf(m.body.getStart(sf)) + 1 : 0, bodyStatements: m.body && ts.isBlock(m.body) ? m.body.statements.length : 0, delegate: m.body && ts.isBlock(m.body) && m.body.statements.length === 1 ? m.body.statements[0].getText(sf).slice(0, 160).replace(/\s+/g, " ") : undefined });
  }
}
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "methods-tsapi.json"), JSON.stringify({ totalLines: src.split("\n").length, members: out }, null, 2), "utf8");
for (const m of out) if (m.kind !== "field") console.log(`${m.kind.padEnd(11)} ${String(m.startLine).padStart(5)}-${String(m.endLine).padEnd(5)} body=${String(m.bodyLines).padStart(4)} stmts=${String(m.bodyStatements).padStart(3)} ${m.name}`);
console.log("members:", out.length, "methods+accessors:", out.filter((m) => m.kind !== "field").length);
