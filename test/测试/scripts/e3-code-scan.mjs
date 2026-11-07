#!/usr/bin/env node
// test/测试/scripts/e3-code-scan.mjs
//
// E3 终验静态扫描工具（B1 v1 §3.5 E3.5/E3.6/E3.9；B1 v1.1；E0.3 §10.2 D9/D10；团队计划 §7.6/§8.4；O12）。
//
// 性质：**test-only 证据工具**。只读扫描仓内源码，不修改 `src/**`、`app/**`、其他测试或角色卡；
// 不新增依赖（使用仓内 devDependency `typescript@7.0.2` 的 Compiler API：`typescript/unstable/sync`
// + `typescript/unstable/ast` + `typescript/unstable/ast/is`；TS 7 为原生编译器，传统
// `ts.createSourceFile` 不再存在）。不跑真实模型、不做网络访问、不提交/推送。
//
// 用法（cwd = 仓库根）：
//   node test/测试/scripts/e3-code-scan.mjs
//   node test/测试/scripts/e3-code-scan.mjs --out="角色卡/测试/docs/change/2026-11-07_E3_scan-tooling"
//       [--window-lines=20] [--min-body-chars=80] [--min-body-lines=3]
//       [--max-spans=200] [--same-file] [--fail-on-violations]
//
// 输出（写盘到 --out 目录）：
//   e3-code-scan.json        机器可读全量结果
//   e3-code-scan.log         人类可读摘要（含每节结论）
//   e3-code-scan.meta.json   运行元数据（argv/cwd/Node/OS/起止 UTC/退出码/脚本与输出 sha256）
//
// 默认退出码 0（扫描完成即 0，发现项写入报告）；`--fail-on-violations` 时，存在硬违例
// （依赖方向违例/value 环/重复逻辑块/范围内零引用导出/结构残留）退出 1；致命错误退出 2。
// 说明：本工具只产出扫描证据，不判验收（B2 由独立验收判定）。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as tsApi from "typescript/unstable/sync";
import * as tsAst from "typescript/unstable/ast";
import * as tsIs from "typescript/unstable/ast/is";

// —————————————————————————————— 基础工具 ——————————————————————————————

const TOOL_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(TOOL_PATH), "../../..").replace(/\\/g, "/");
const STARTED_AT = new Date().toISOString();
const STARTED_MS = Date.now();

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (absPath) => sha256(fs.readFileSync(absPath));
const relOf = (absPath) => absPath.replace(/\\/g, "/").replace(REPO_ROOT + "/", "");
const absOf = (relPath) => REPO_ROOT + "/" + relPath.replace(/^\/+/, "");
const sortStrings = (values) => [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const uniq = (values) => [...new Set(values)];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseArgs(argv) {
  const args = {
    out: "角色卡/测试/docs/change/2026-11-07_E3_scan-tooling",
    windowLines: 20,
    minBodyChars: 80,
    minBodyLines: 3,
    maxSpans: 200,
    maxPerHash: 200,
    sameFile: false,
    failOnViolations: false,
  };
  for (const raw of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    switch (key) {
      case "out": args.out = value; break;
      case "window-lines": args.windowLines = Number(value); break;
      case "min-body-chars": args.minBodyChars = Number(value); break;
      case "min-body-lines": args.minBodyLines = Number(value); break;
      case "max-spans": args.maxSpans = Number(value); break;
      case "max-per-hash": args.maxPerHash = Number(value); break;
      case "same-file": args.sameFile = true; break;
      case "fail-on-violations": args.failOnViolations = true; break;
      case "help":
        console.log("node test/测试/scripts/e3-code-scan.mjs [--out=DIR] [--window-lines=20] [--min-body-chars=80] [--min-body-lines=3] [--max-spans=200] [--same-file] [--fail-on-violations]");
        process.exit(0);
        break;
      default: break;
    }
  }
  return args;
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...opts,
  });
}

/** 读取源码（以 TS program 的文本为准；位置与 AST 完全一致）。 */
function textOf(relPath, sourceFile) {
  return sourceFile?.text ?? fs.readFileSync(absOf(relPath), "utf8");
}

/**
 * 去掉注释（保留换行与字符串/模板字面量内容）。逐字符状态机：
 * - 处理模板字面量 `${...}` 嵌套（含其中的注释/字符串/嵌套模板），避免把模板内文本误当代码；
 * - 处理常见正则字面量（避免其中的 `//` 被误判为注释）；
 * - 注释删除但保留换行，保证行号与原文对齐。
 */
function stripComments(text) {
  let out = "";
  let i = 0;
  let mode = "code"; // code | line | block | single | double | template
  const stack = []; // { kind: "templateExpr", depth }

  const lastSignificant = () => out.trimEnd();
  const regexCanStart = () => {
    const tail = lastSignificant();
    if (tail.length === 0) return true;
    if (/[([{,;:=!&|?+\-*%^~<>]$/.test(tail)) return true;
    return /\b(return|case|typeof|instanceof|in|of|new|delete|void|yield|await)$/.test(tail);
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (mode === "line") {
      if (ch === "\n") { mode = "code"; out += ch; }
      i += 1; continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") { mode = "code"; i += 2; continue; }
      if (ch === "\n") out += ch;
      i += 1; continue;
    }
    if (mode === "single" || mode === "double") {
      if (ch === "\\" && i + 1 < text.length) { out += ch + text[i + 1]; i += 2; continue; }
      if ((mode === "single" && ch === "'") || (mode === "double" && ch === '"')) mode = "code";
      out += ch; i += 1; continue;
    }
    if (mode === "template") {
      if (ch === "\\" && i + 1 < text.length) { out += ch + text[i + 1]; i += 2; continue; }
      if (ch === "`") { mode = "code"; out += ch; i += 1; continue; }
      if (ch === "$" && next === "{") {
        out += "${";
        i += 2;
        stack.push({ kind: "templateExpr", depth: 0 });
        mode = "code";
        continue;
      }
      out += ch; i += 1; continue;
    }

    // mode === "code"
    if (ch === "/" && next === "/") { mode = "line"; i += 2; continue; }
    if (ch === "/" && next === "*") { mode = "block"; i += 2; continue; }
    if (ch === "'") { mode = "single"; out += ch; i += 1; continue; }
    if (ch === '"') { mode = "double"; out += ch; i += 1; continue; }
    if (ch === "`") { mode = "template"; out += ch; i += 1; continue; }
    if (ch === "/" && next !== "/" && next !== "*" && regexCanStart()) {
      let j = i + 1;
      let inClass = false;
      while (j < text.length) {
        const current = text[j];
        if (current === "\\") { j += 2; continue; }
        if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) { j += 1; break; }
        else if (current === "\n") break;
        j += 1;
      }
      out += text.slice(i, j);
      i = j; continue;
    }
    if (ch === "{") {
      const frame = stack[stack.length - 1];
      if (frame?.kind === "templateExpr") frame.depth += 1;
      out += ch; i += 1; continue;
    }
    if (ch === "}") {
      const frame = stack[stack.length - 1];
      if (frame?.kind === "templateExpr") {
        if (frame.depth === 0) { stack.pop(); mode = "template"; out += ch; i += 1; continue; }
        frame.depth -= 1;
      }
      out += ch; i += 1; continue;
    }
    out += ch; i += 1;
  }
  return out;
}

const KEYWORDS = new Set([
  "abstract", "as", "asserts", "async", "await", "break", "case", "catch", "class", "const",
  "constructor", "continue", "debugger", "declare", "default", "delete", "do", "else", "enum",
  "export", "extends", "false", "finally", "for", "from", "function", "get", "if", "implements",
  "import", "in", "infer", "instanceof", "interface", "is", "keyof", "let", "namespace", "new",
  "null", "of", "private", "protected", "public", "readonly", "return", "satisfies", "set",
  "static", "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined",
  "unique", "unknown", "var", "void", "while", "with", "yield", "never", "any", "string",
  "number", "boolean", "object", "symbol", "bigint", "override",
]);

/** 极简 token 化（注释已剥离）。字符串/模板整体保留；数字/标识符/其它符号逐个输出。 */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j += 1;
      tokens.push({ type: "id", text: text.slice(i, j) });
      i = j; continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) j += 1;
      tokens.push({ type: "num", text: text.slice(i, j) });
      i = j; continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === quote) { j += 1; break; }
        j += 1;
      }
      tokens.push({ type: "str", text: text.slice(i, j) });
      i = j; continue;
    }
    if (ch === "?" && text[i + 1] === ".") { tokens.push({ type: "punct", text: "?." }); i += 2; continue; }
    tokens.push({ type: "punct", text: ch });
    i += 1;
  }
  return tokens;
}

function collectBindingNames(nameNode, out) {
  if (!nameNode) return;
  if (tsIs.isIdentifier(nameNode)) { out.push(nameNode); return; }
  if (tsIs.isObjectBindingPattern(nameNode) || tsIs.isArrayBindingPattern(nameNode)) {
    for (const element of nameNode.elements) {
      if (tsIs.isBindingElement(element)) collectBindingNames(element.name, out);
      else collectBindingNames(element, out); // OmittedExpression 等无 name，忽略即可
    }
  }
}

/** 收集函数体内的本地名（参数/变量/嵌套函数名/catch 变量；不追求完整作用域分析）。 */
function collectLocalNames(functionNode, bodyNode) {
  const names = [];
  for (const param of functionNode.parameters ?? []) collectBindingNames(param.name, names);
  const visit = (node) => {
    if (tsIs.isVariableDeclaration(node)) collectBindingNames(node.name, names);
    else if (tsIs.isFunctionDeclaration(node) && node.name) names.push(node.name);
    else if (tsIs.isClassDeclaration(node) && node.name) names.push(node.name);
    else if (tsIs.isCatchClause(node) && node.variableDeclaration) collectBindingNames(node.variableDeclaration.name, names);
    if ((tsIs.isFunctionDeclaration(node) || tsIs.isFunctionExpression(node) || tsIs.isArrowFunction(node)) && node !== functionNode) {
      for (const param of node.parameters ?? []) collectBindingNames(param.name, names);
    }
    node.forEachChild(visit);
  };
  if (bodyNode) visit(bodyNode);
  return names.map((n) => n.text).filter((name) => name && !KEYWORDS.has(name));
}

/** 归一化函数体：去注释/空白/本地重命名；返回 token 串。 */
function normalizeBody(bodyText, functionNode, bodyNode) {
  const stripped = stripComments(bodyText);
  const tokens = tokenize(stripped);
  const localNames = collectLocalNames(functionNode, bodyNode);
  const localMap = new Map();
  for (const name of localNames) if (!localMap.has(name)) localMap.set(name, `l${localMap.size + 1}`);
  const out = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "id" || KEYWORDS.has(token.text) || !localMap.has(token.text)) {
      out.push(token.text);
      continue;
    }
    const prev = tokens[index - 1]?.text;
    const next = tokens[index + 1]?.text;
    // 属性访问名/对象键保持原样（保守；避免把 `obj.foo`、`{ foo: ... }` 当本地变量）。
    if (prev === "." || prev === "?." || next === ":") { out.push(token.text); continue; }
    out.push(localMap.get(token.text));
  }
  return out.join(" ");
}

// —————————————————————————————— 载入项目 ——————————————————————————————

function loadProject() {
  const api = new tsApi.API();
  const snapshot = api.updateSnapshot({ openProjects: [REPO_ROOT + "/tsconfig.json"] });
  const project = snapshot.getProjects()[0];
  if (!project) {
    api.close();
    throw new Error("TypeScript Compiler API 未能加载仓内 tsconfig.json 项目");
  }
  const fileNames = project.program.getSourceFileNames()
    .map((fileName) => fileName.replace(/\\/g, "/"))
    .filter((fileName) => !fileName.includes("/node_modules/"))
    .filter((fileName) => fileName.startsWith(REPO_ROOT + "/src/")
      || fileName.startsWith(REPO_ROOT + "/app/")
      || fileName.startsWith(REPO_ROOT + "/test/")
      || fileName.startsWith(REPO_ROOT + "/bin/"))
    .map(relOf)
    .sort();
  const sourceFiles = new Map();
  for (const relPath of fileNames) {
    const sf = project.program.getSourceFile(REPO_ROOT + "/" + relPath);
    if (sf) sourceFiles.set(relPath, sf);
  }
  return { api, project, fileNames, sourceFiles };
}

// —————————————————————————————— 1. 模块图 ——————————————————————————————

const ENGINE_PREFIXES = [
  "src/pipeline/",
  "src/service/",
  "src/provider/",
  "src/common/门禁引擎/",
  "src/common/编排/",
  "src/common/runtime-core/",
  "src/common/装配/",
  "src/common/claude-adapter/",
  "src/common/codex-adapter/",
  "src/common/pi-adapter/",
  "app/",
  "bin/",
];

function layerOf(file) {
  if (file.startsWith("src/model/")) return { kind: "model" };
  if (file.startsWith("src/common/shared/")) return { kind: "shared" };
  if (file.startsWith("src/common/gates/")) return { kind: "gates" };
  if (file.startsWith("src/common/roles/")) {
    const segments = file.split("/");
    return { kind: "role", id: segments[3] ?? "?" };
  }
  if (ENGINE_PREFIXES.some((prefix) => file.startsWith(prefix))) return { kind: "engine" };
  if (file.startsWith("src/common/")) return { kind: "engine", privateCommon: true };
  if (file.startsWith("src/")) return { kind: "engine" };
  return { kind: "other" };
}

const layerKey = (layer) => (layer.kind === "role" ? `role:${layer.id}` : layer.kind);
const isModuleLayer = (layer) => layer.kind === "model" || layer.kind === "shared" || layer.kind === "gates" || layer.kind === "role";

function importIsTypeOnly(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.phaseModifier === tsAst.SyntaxKind.TypeKeyword) return true;
  const bindings = clause.namedBindings;
  return bindings !== undefined && tsIs.isNamedImports(bindings) && bindings.elements.length > 0
    && bindings.elements.every((element) => element.isTypeOnly);
}

function exportIsTypeOnly(node) {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return clause !== undefined && tsIs.isNamedExports(clause) && clause.elements.length > 0
    && clause.elements.every((element) => element.isTypeOnly);
}

function resolveRelative(from, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const parts = from.split("/").slice(0, -1).concat(specifier.split("/"));
  const out = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function makeCanonicalizer(programFiles) {
  const cache = new Map();
  return (base) => {
    if (cache.has(base)) return cache.get(base);
    const candidates = [base];
    const withoutExt = base.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/i, "");
    for (const ext of [".ts", ".tsx", ".mts", ".cts"]) candidates.push(withoutExt + ext);
    for (const ext of [".ts", ".tsx", ".mts", ".cts"]) candidates.push(base + "/index" + ext);
    for (const ext of [".ts", ".tsx", ".mts", ".cts"]) candidates.push(withoutExt + "/index" + ext);
    const found = candidates.find((candidate) => programFiles.has(candidate));
    const result = found ?? base;
    cache.set(base, result);
    return result;
  };
}

function readEdges(sourceFile, from, canonicalize) {
  const edges = [];
  const add = (specifier, typeOnly, syntax) => {
    const base = resolveRelative(from, specifier);
    if (base === undefined) return;
    if (!(base.startsWith("src/") || base.startsWith("app/") || base.startsWith("bin/"))) return;
    edges.push({ from, to: canonicalize(base), typeOnly, syntax });
  };
  const visit = (node) => {
    if (tsIs.isImportDeclaration(node) && tsIs.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, importIsTypeOnly(node), "import");
    } else if (tsIs.isExportDeclaration(node) && node.moduleSpecifier && tsIs.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, exportIsTypeOnly(node), "export-from");
    } else if (tsIs.isImportTypeNode(node) && tsIs.isLiteralTypeNode(node.argument) && tsIs.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, true, "import-type");
    } else if (tsIs.isCallExpression(node) && node.expression.kind === tsAst.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && tsIs.isStringLiteral(node.arguments[0])) {
      add(node.arguments[0].text, false, "dynamic-import");
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return edges;
}

function findCycles(nodes, edges) {
  const graph = new Map();
  for (const node of nodes) graph.set(node, []);
  for (const edge of edges) {
    if (!graph.has(edge.from) || !graph.has(edge.to)) continue;
    graph.get(edge.from).push(edge.to);
  }
  const state = new Map();
  const stack = [];
  const cycles = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const nextState = state.get(next);
      if (nextState === undefined) visit(next);
      else if (nextState === 1) {
        const start = stack.indexOf(next);
        cycles.push(stack.slice(start).concat(next));
      }
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const node of nodes) if (!state.has(node)) visit(node);
  return cycles;
}

function scanModuleGraph({ fileNames, sourceFiles }) {
  const programFiles = new Set(fileNames);
  const canonicalize = makeCanonicalizer(programFiles);
  const graphFiles = fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("bin/"));
  const edges = [];
  const layerCounts = {};
  for (const relPath of graphFiles) {
    const layer = layerOf(relPath);
    layerCounts[layerKey(layer)] = (layerCounts[layerKey(layer)] ?? 0) + 1;
    const sf = sourceFiles.get(relPath);
    if (!sf) continue;
    edges.push(...readEdges(sf, relPath, canonicalize));
  }

  const violations = [];
  const categories = {
    roleCrossImport: [],
    roleImportsGates: [],
    roleImportsEngine: [],
    roleImportsPrivateCommon: [],
    roleImportsOther: [],
    gatesImportsRole: [],
    gatesImportsEngine: [],
    sharedImportsGates: [],
    sharedImportsRoles: [],
    sharedImportsEngine: [],
    modelImportsGatesRolesEngine: [],
    modelValueImportsShared: [],
    engineImportsPrivateRoleFile: [],
    engineImportsPrivateGatesFile: [],
  };
  const modelToSharedTypeOnly = new Set();
  const modelInternalTypeOnly = new Set();

  for (const edge of edges) {
    const fromLayer = layerOf(edge.from);
    const toLayer = layerOf(edge.to);
    const location = `${edge.from} -> ${edge.to}${edge.typeOnly ? " (type-only)" : ""} [${edge.syntax}]`;
    const push = (category, message) => { categories[category].push(location); violations.push(`${message}: ${location}`); };
    if (fromLayer.kind === "role") {
      if (toLayer.kind === "role" && toLayer.id !== fromLayer.id) push("roleCrossImport", "role-cross-import");
      if (toLayer.kind === "gates") push("roleImportsGates", "role-imports-gates");
      if (toLayer.kind === "engine") {
        if (toLayer.privateCommon) push("roleImportsPrivateCommon", "role-imports-private-common");
        else push("roleImportsEngine", "role-imports-engine");
      }
      if (toLayer.kind === "other") push("roleImportsOther", "role-imports-other");
    } else if (fromLayer.kind === "gates") {
      if (toLayer.kind === "role") push("gatesImportsRole", "gates-imports-role");
      if (toLayer.kind === "engine") push("gatesImportsEngine", "gates-imports-engine");
    } else if (fromLayer.kind === "shared") {
      if (toLayer.kind === "gates") push("sharedImportsGates", "shared-imports-gates");
      if (toLayer.kind === "role") push("sharedImportsRoles", "shared-imports-roles");
      if (toLayer.kind === "engine") push("sharedImportsEngine", "shared-imports-engine");
    } else if (fromLayer.kind === "model") {
      if (toLayer.kind === "gates" || toLayer.kind === "role" || toLayer.kind === "engine") {
        push("modelImportsGatesRolesEngine", "model-imports-forbidden");
      }
      if (toLayer.kind === "shared") {
        if (edge.typeOnly) modelToSharedTypeOnly.add(`${edge.from} -> ${edge.to}`);
        else push("modelValueImportsShared", "model-value-imports-shared");
      }
      if (toLayer.kind === "model" && edge.typeOnly) modelInternalTypeOnly.add(`${edge.from} -> ${edge.to}`);
    } else if (fromLayer.kind === "engine") {
      if (toLayer.kind === "role" && edge.to !== `src/common/roles/${toLayer.id}/index.ts`) {
        push("engineImportsPrivateRoleFile", "engine-imports-private-role-file");
      }
      if (toLayer.kind === "gates" && edge.to !== "src/common/gates/index.ts") {
        push("engineImportsPrivateGatesFile", "engine-imports-private-gates-file");
      }
    }
  }

  const moduleNodes = graphFiles.filter((file) => isModuleLayer(layerOf(file)));
  const valueEdges = edges.filter((edge) => isModuleLayer(layerOf(edge.from)) && isModuleLayer(layerOf(edge.to)) && !edge.typeOnly);
  const typeEdges = edges.filter((edge) => isModuleLayer(layerOf(edge.from)) && isModuleLayer(layerOf(edge.to)) && edge.typeOnly);
  const valueCycles = findCycles(moduleNodes, valueEdges);
  const typeOnlyCycles = findCycles(moduleNodes, typeEdges);
  const typeOnlyCycleExemptions = typeOnlyCycles.filter((cycle) => cycle.every((file) => layerOf(file).kind === "model"));
  const nonModelTypeOnlyCycles = typeOnlyCycles.filter((cycle) => !cycle.every((file) => layerOf(file).kind === "model"));

  const KNOWN_MODEL_TO_SHARED_TYPE_ONLY = [
    "src/model/download.ts -> src/common/shared/runtime-shared.ts",
    "src/model/runtime.ts -> src/common/shared/diagnostics.ts",
    "src/model/runtime.ts -> src/common/shared/runtime-shared.ts",
  ];
  const modelToSharedTypeOnlyList = sortStrings(modelToSharedTypeOnly);
  const unexpectedModelToSharedTypeOnly = modelToSharedTypeOnlyList.filter((edge) => !KNOWN_MODEL_TO_SHARED_TYPE_ONLY.includes(edge));
  const missingKnownModelToSharedTypeOnly = KNOWN_MODEL_TO_SHARED_TYPE_ONLY.filter((edge) => !modelToSharedTypeOnlyList.includes(edge));

  const gatesRootFiles = fs.readdirSync(path.join(REPO_ROOT, "src/common/gates"), { withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const rolesRoot = path.join(REPO_ROOT, "src/common/roles");
  const roleModuleIds = fs.existsSync(rolesRoot)
    ? fs.readdirSync(rolesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const roleRootFiles = {};
  for (const roleId of roleModuleIds) {
    roleRootFiles[roleId] = fs.readdirSync(path.join(rolesRoot, roleId), { withFileTypes: true })
      .filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  }
  const publicEntryViolations = [];
  if (gatesRootFiles.length !== 1 || gatesRootFiles[0] !== "index.ts") {
    publicEntryViolations.push(`gates-root-not-single-entry: ${JSON.stringify(gatesRootFiles)}`);
  }
  for (const [roleId, files] of Object.entries(roleRootFiles)) {
    if (files.length !== 1 || files[0] !== "index.ts") {
      publicEntryViolations.push(`role-root-not-single-entry: ${roleId}: ${JSON.stringify(files)}`);
    }
  }

  const typeOnlyEdgeList = edges.filter((edge) => edge.typeOnly).length;
  const valueEdgeList = edges.filter((edge) => !edge.typeOnly).length;
  const summary = {
    scannedFiles: graphFiles.length,
    scannedScopeFiles: fileNames.filter((file) => file.startsWith("src/common/roles/") || file.startsWith("src/common/gates/")
      || file.startsWith("src/common/shared/") || file.startsWith("src/common/门禁引擎/")
      || file.startsWith("src/pipeline/") || file.startsWith("src/service/") || file.startsWith("src/provider/")
      || file.startsWith("src/model/")).length,
    layerCounts,
    edgeCount: edges.length,
    valueEdgeCount: valueEdgeList,
    typeOnlyEdgeCount: typeOnlyEdgeList,
    violations,
    violationCategories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value.length])),
    violationDetails: categories,
    valueCycles,
    typeOnlyCycles,
    typeOnlyCycleExemptions,
    nonModelTypeOnlyCycles,
    modelToSharedTypeOnly: modelToSharedTypeOnlyList,
    modelToSharedValue: categories.modelValueImportsShared,
    modelInternalTypeOnly: sortStrings(modelInternalTypeOnly),
    knownModelToSharedTypeOnly: KNOWN_MODEL_TO_SHARED_TYPE_ONLY,
    unexpectedModelToSharedTypeOnly,
    missingKnownModelToSharedTypeOnly,
    d9ModelInternalExemptionPresent: modelInternalTypeOnly.has("src/model/role.ts -> src/model/runtime.ts")
      && modelInternalTypeOnly.has("src/model/runtime.ts -> src/model/role.ts"),
    gatesRootFiles,
    roleModuleIds,
    roleRootFiles,
    publicEntryViolations,
  };
  summary.pass = {
    roleCrossImportZero: categories.roleCrossImport.length === 0,
    roleNoEngineOrGatesOrPrivateCommon: categories.roleImportsEngine.length === 0
      && categories.roleImportsGates.length === 0 && categories.roleImportsPrivateCommon.length === 0,
    gatesNoRoleImport: categories.gatesImportsRole.length === 0,
    sharedNoGatesOrRoles: categories.sharedImportsGates.length === 0 && categories.sharedImportsRoles.length === 0,
    noValueCycles: valueCycles.length === 0,
    typeOnlyCyclesOnlyModel: nonModelTypeOnlyCycles.length === 0,
    modelToSharedValueZero: categories.modelValueImportsShared.length === 0,
    noUnexpectedModelToSharedTypeOnly: unexpectedModelToSharedTypeOnly.length === 0,
    publicEntriesSingle: publicEntryViolations.length === 0,
  };
  return summary;
}

// —————————————————————————————— 2. 未使用导出扫描 ——————————————————————————————

const UNUSED_SCOPE_PREFIXES = [
  "src/common/roles/",
  "src/common/gates/",
  "src/common/shared/",
  "src/common/门禁引擎/",
];
const UNUSED_SCOPE_FILES = [
  "src/pipeline/orchestration/trunk-runtime.ts",
  "src/service/role/resolve-role.ts",
  "src/common/编排/workflow-preconditions.ts",
  "src/model/role.ts",
];

function inUnusedScope(relPath) {
  return UNUSED_SCOPE_PREFIXES.some((prefix) => relPath.startsWith(prefix))
    || UNUSED_SCOPE_FILES.includes(relPath);
}

function collectExports(relPath, sourceFiles) {
  const sf = sourceFiles.get(relPath);
  if (!sf) return [];
  const out = [];
  const push = (nameNode, kind, typeOnly, extra = {}) => {
    if (!nameNode) return;
    out.push({
      name: nameNode.text,
      kind,
      typeOnly,
      declarationLine: sf.getLineAndCharacterOfPosition(nameNode.getStart(sf)).line + 1,
      declarationStart: nameNode.getStart(sf),
      ...extra,
    });
  };
  for (const statement of sf.statements) {
    const modifiers = statement.modifiers ?? [];
    const exported = modifiers.some((modifier) => modifier.kind === tsAst.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((modifier) => modifier.kind === tsAst.SyntaxKind.DefaultKeyword);
    if (tsIs.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        const names = [];
        collectBindingNames(declaration.name, names);
        for (const nameNode of names) push(nameNode, "variable", false);
      }
    } else if ((tsIs.isFunctionDeclaration(statement) || tsIs.isClassDeclaration(statement)
      || tsIs.isInterfaceDeclaration(statement) || tsIs.isTypeAliasDeclaration(statement)
      || tsIs.isEnumDeclaration(statement)) && exported) {
      const typeOnly = tsIs.isInterfaceDeclaration(statement) || tsIs.isTypeAliasDeclaration(statement);
      const kind = tsIs.isFunctionDeclaration(statement) ? "function"
        : tsIs.isClassDeclaration(statement) ? "class"
          : tsIs.isInterfaceDeclaration(statement) ? "interface"
            : tsIs.isTypeAliasDeclaration(statement) ? "type" : "enum";
      if (statement.name) push(statement.name, kind, typeOnly);
      else if (isDefault) out.push({ name: "default", kind: "default", typeOnly: false, declarationLine: undefined, declarationStart: undefined, defaultImportNotTracked: true });
    } else if (tsIs.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      const statementTypeOnly = statement.isTypeOnly;
      if (clause && tsIs.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const nameNode = element.name;
          const typeOnly = statementTypeOnly || element.isTypeOnly;
          push(nameNode, "re-export", typeOnly, { reExportTarget: element.propertyName?.text ?? nameNode.text });
        }
      } else if (clause && tsIs.isNamespaceExport?.(clause)) {
        push(clause.name, "re-export-namespace", statementTypeOnly);
      }
    } else if (tsIs.isExportAssignment(statement)) {
      out.push({ name: "default", kind: "default", typeOnly: false, declarationLine: undefined, declarationStart: undefined, defaultImportNotTracked: true });
    }
  }
  return out;
}

function buildIdentifierOccurrences({ fileNames, sourceFiles }) {
  const occurrences = new Map(); // name -> Map<file, count>
  for (const relPath of fileNames) {
    const sf = sourceFiles.get(relPath);
    if (!sf) continue;
    const visit = (node) => {
      if (tsIs.isIdentifier(node)) {
        const name = node.text;
        let byFile = occurrences.get(name);
        if (!byFile) { byFile = new Map(); occurrences.set(name, byFile); }
        byFile.set(relPath, (byFile.get(relPath) ?? 0) + 1);
      }
      node.forEachChild(visit);
    };
    sf.forEachChild(visit);
  }
  return occurrences;
}

const CODE_FILE_RE = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/i;
const isRelevantCodePath = (relPath) => (relPath.startsWith("src/") || relPath.startsWith("app/")
  || relPath.startsWith("test/") || relPath.startsWith("bin/")) && CODE_FILE_RE.test(relPath);

function readGitChangeSet() {
  const changed = new Map(); // path -> status
  const rawStatus = git(["status", "--porcelain=v1", "-z"]);
  const tokens = rawStatus.split("\0");
  let index = 0;
  while (index < tokens.length) {
    const entry = tokens[index];
    index += 1;
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (!filePath) continue;
    if (status[0] === "R" || status[0] === "C") index += 1; // 跳过旧路径 token
    if (status.includes("D")) continue;
    if (!isRelevantCodePath(filePath)) continue;
    changed.set(filePath, status.trim());
  }
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  for (const filePath of untracked) {
    if (isRelevantCodePath(filePath) && !changed.has(filePath)) changed.set(filePath, "??");
  }
  return changed;
}

function scanUnusedExports({ fileNames, sourceFiles }) {
  const occurrences = buildIdentifierOccurrences({ fileNames, sourceFiles });
  const changeSet = readGitChangeSet();
  const headCache = new Map();
  const headContent = (relPath) => {
    if (headCache.has(relPath)) return headCache.get(relPath);
    let content = null;
    try {
      content = execFileSync("git", ["show", `HEAD:${relPath}`], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      content = null;
    }
    headCache.set(relPath, content);
    return content;
  };
  const changedHeadContents = new Map();
  for (const relPath of changeSet.keys()) {
    const content = headContent(relPath);
    if (content !== null) changedHeadContents.set(relPath, content);
  }

  const scopeFiles = fileNames.filter(inUnusedScope);
  const results = [];
  for (const relPath of scopeFiles) {
    const exports = collectExports(relPath, sourceFiles);
    const fileChanged = changeSet.has(relPath);
    const fileStatus = changeSet.get(relPath) ?? null;
    const head = headContent(relPath);
    const fileNewAtHead = head === null;
    for (const entry of exports) {
      if (entry.defaultImportNotTracked) continue;
      const byFile = occurrences.get(entry.name) ?? new Map();
      let externalReferences = 0;
      const externalFiles = [];
      let internalOccurrences = 0;
      for (const [file, count] of byFile) {
        if (file === relPath) internalOccurrences += count;
        else { externalReferences += count; externalFiles.push(file); }
      }
      // 减去本文件的导出声明标识符本身（每次导出声明一个 occurrence）。
      const declarationOccurrencesInFile = exports.filter((other) => other.name === entry.name).length;
      const internalReferences = Math.max(0, internalOccurrences - declarationOccurrencesInFile);
      const totalReferences = externalReferences + internalReferences;
      const nameInHead = head !== null && new RegExp(`\\b${escapeRegExp(entry.name)}\\b`).test(head);
      const symbolNewInThisChange = fileChanged && !nameInHead;
      const headReferencedFiles = [];
      if (totalReferences === 0 && !symbolNewInThisChange) {
        for (const [changedPath, content] of changedHeadContents) {
          if (changedPath === relPath) continue;
          if (new RegExp(`\\b${escapeRegExp(entry.name)}\\b`).test(content)) headReferencedFiles.push(changedPath);
        }
      }
      const externalOnlyTests = externalFiles.length > 0 && externalFiles.every((file) => file.startsWith("test/"));
      results.push({
        file: relPath,
        name: entry.name,
        kind: entry.kind,
        typeOnly: entry.typeOnly,
        declarationLine: entry.declarationLine,
        fileChanged,
        fileStatus,
        fileNewAtHead,
        symbolExistedInHead: nameInHead,
        symbolNewInThisChange,
        externalReferences,
        internalReferences,
        totalReferences,
        externalReferenceFiles: sortStrings(uniq(externalFiles)),
        externalOnlyTests,
        headReferencedByChangedFiles: sortStrings(headReferencedFiles),
      });
    }
  }

  const zeroReference = results.filter((entry) => entry.totalReferences === 0);
  const internalOnly = results.filter((entry) => entry.totalReferences > 0 && entry.externalReferences === 0);
  const classify = (entry) => entry.symbolNewInThisChange ? "inScope" : "pendingConfirmation";
  const partition = (entries) => ({
    inScope: entries.filter((entry) => classify(entry) === "inScope"),
    pendingConfirmation: entries.filter((entry) => classify(entry) === "pendingConfirmation"),
  });
  const zeroPartition = partition(zeroReference);
  const internalPartition = partition(internalOnly);
  return {
    scopePrefixes: UNUSED_SCOPE_PREFIXES,
    scopeFiles: UNUSED_SCOPE_FILES,
    scannedFiles: scopeFiles.length,
    exportCount: results.length,
    zeroReferenceCount: zeroReference.length,
    inScopeZeroReferenceCount: zeroPartition.inScope.length,
    pendingZeroReferenceCount: zeroPartition.pendingConfirmation.length,
    internalOnlyExportCount: internalOnly.length,
    zeroReferenceExports: zeroPartition,
    internalOnlyExports: internalPartition,
    allZeroReference: zeroReference,
    methodology: [
      "导出符号由 TS Compiler API 从声明语句/导出声明枚举（default 导出因导入名可任意，不纳入名字扫描）。",
      "引用面 = 全仓 src/app/test/bin 的 AST Identifier 同文出现（注释/字符串不计）；精确位置排除声明本身。",
      "外部引用=声明文件之外的引用；内部引用=声明文件内除声明外的引用。",
      "范围分类：文件在 git 工作树中变更且符号在 HEAD 中不存在（启发式词边界）→ inScope（本变更新增导出）；否则 → pendingConfirmation（历史/待确认）。",
      "headReferencedByChangedFiles：对零引用历史符号，检查其在 HEAD 版变更文件中是否曾被提到（启发式，供「本变更导致不再使用」判断）。",
    ],
  };
}

// —————————————————————————————— 3. 重复实现扫描 ——————————————————————————————

const DUPLICATE_SCOPE_PREFIXES = [
  "src/common/roles/",
  "src/common/gates/",
  "src/common/shared/",
  "src/common/门禁引擎/",
];

function collectExportedFunctions({ fileNames, sourceFiles }) {
  const functions = [];
  for (const relPath of fileNames) {
    if (!DUPLICATE_SCOPE_PREFIXES.some((prefix) => relPath.startsWith(prefix))) continue;
    const sf = sourceFiles.get(relPath);
    if (!sf) continue;
    for (const statement of sf.statements) {
      const modifiers = statement.modifiers ?? [];
      const exported = modifiers.some((modifier) => modifier.kind === tsAst.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if (tsIs.isFunctionDeclaration(statement) && statement.body) {
        functions.push({ relPath, sf, node: statement, name: statement.name?.text ?? "<anonymous>", bodyNode: statement.body });
      } else if (tsIs.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!tsIs.isIdentifier(declaration.name) || !declaration.initializer) continue;
          const init = declaration.initializer;
          const unwrapped = tsIs.isParenthesizedExpression?.(init) ? init.expression : init;
          if (tsIs.isArrowFunction(unwrapped) || tsIs.isFunctionExpression(unwrapped)) {
            functions.push({ relPath, sf, node: unwrapped, name: declaration.name.text, bodyNode: unwrapped.body });
          }
        }
      }
    }
  }
  return functions;
}

function scanDuplicateImplementations({ fileNames, sourceFiles }, args) {
  const functions = collectExportedFunctions({ fileNames, sourceFiles });
  const bodyGroups = new Map();
  for (const entry of functions) {
    const bodyText = entry.bodyNode.getText?.(entry.sf) ?? entry.sf.text.slice(entry.bodyNode.getStart(entry.sf), entry.bodyNode.getEnd());
    const normalized = normalizeBody(bodyText, entry.node, entry.bodyNode);
    const originalLines = bodyText.split(/\r?\n/).length;
    if (normalized.length < args.minBodyChars || originalLines < args.minBodyLines) continue;
    const hash = sha256(normalized);
    let group = bodyGroups.get(hash);
    if (!group) { group = []; bodyGroups.set(hash, group); }
    group.push({
      file: entry.relPath,
      name: entry.name,
      line: entry.sf.getLineAndCharacterOfPosition(entry.node.getStart(entry.sf)).line + 1,
      normalizedLength: normalized.length,
      bodyLines: originalLines,
      normalizedSample: normalized.slice(0, 240),
    });
  }
  const bodyDuplicates = [];
  for (const [hash, group] of bodyGroups) {
    if (group.length < 2) continue;
    bodyDuplicates.push({ hash, count: group.length, entries: group });
  }
  bodyDuplicates.sort((a, b) => (a.entries[0].file < b.entries[0].file ? -1 : 1));

  // 同形文案/数据：顶层字符串常量（单字符串/字符串数组 join）按值 hash 分组；跨文件相同值列出说明。
  const textConstants = [];
  const textValueOf = (initializer) => {
    if (!initializer) return undefined;
    if (tsIs.isStringLiteral(initializer) || tsIs.isNoSubstitutionTemplateLiteral(initializer)) return initializer.text;
    if (tsIs.isCallExpression(initializer) && tsIs.isPropertyAccessExpression(initializer.expression)
      && initializer.expression.name?.text === "join" && tsIs.isArrayLiteralExpression(initializer.expression.expression)) {
      const parts = [];
      for (const element of initializer.expression.expression.elements) {
        if (tsIs.isStringLiteral(element) || tsIs.isNoSubstitutionTemplateLiteral(element)) parts.push(element.text);
        else return undefined;
      }
      return parts.join("\n");
    }
    return undefined;
  };
  for (const relPath of fileNames) {
    if (!DUPLICATE_SCOPE_PREFIXES.some((prefix) => relPath.startsWith(prefix))) continue;
    const sf = sourceFiles.get(relPath);
    if (!sf) continue;
    for (const statement of sf.statements) {
      if (!tsIs.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!tsIs.isIdentifier(declaration.name)) continue;
        const value = textValueOf(declaration.initializer);
        if (value === undefined || value.length < 120) continue;
        textConstants.push({
          file: relPath,
          name: declaration.name.text,
          line: sf.getLineAndCharacterOfPosition(declaration.name.getStart(sf)).line + 1,
          length: value.length,
          hash: sha256(value),
          sample: value.slice(0, 120),
        });
      }
    }
  }
  const textGroups = new Map();
  for (const entry of textConstants) {
    let group = textGroups.get(entry.hash);
    if (!group) { group = []; textGroups.set(entry.hash, group); }
    group.push(entry);
  }
  const sharedTextConstantGroups = [];
  for (const [hash, group] of textGroups) {
    if (uniq(group.map((entry) => entry.file)).length < 2) continue;
    sharedTextConstantGroups.push({ hash, count: group.length, entries: group });
  }
  sharedTextConstantGroups.sort((a, b) => b.count - a.count);

  // ———— 连续 ≥N 行窗口扫描 ————
  const fileLines = new Map();
  for (const relPath of fileNames) {
    if (!DUPLICATE_SCOPE_PREFIXES.some((prefix) => relPath.startsWith(prefix))) continue;
    const sf = sourceFiles.get(relPath);
    if (!sf) continue;
    const stripped = stripComments(sf.text);
    const rawLines = stripped.split(/\r?\n/);
    const lines = [];
    for (let index = 0; index < rawLines.length; index += 1) {
      const normalized = rawLines[index].trim().replace(/\s+/g, " ").replace(/[;,]$/, "").trim();
      if (normalized.length === 0) continue;
      lines.push({ norm: normalized, raw: rawLines[index].trim(), line: index + 1 });
    }
    fileLines.set(relPath, lines);
  }

  const N = args.windowLines;
  const windowOccurrences = new Map();
  const perFileCap = 3;
  for (const [relPath, lines] of fileLines) {
    for (let start = 0; start + N <= lines.length; start += 1) {
      const key = sha256(lines.slice(start, start + N).map((line) => line.norm).join("\n"));
      let occurrences = windowOccurrences.get(key);
      if (!occurrences) { occurrences = []; windowOccurrences.set(key, occurrences); }
      const sameFileCount = occurrences.reduce((count, entry) => count + (entry.file === relPath ? 1 : 0), 0);
      if (sameFileCount >= perFileCap) continue;
      if (occurrences.length < args.maxPerHash) occurrences.push({ file: relPath, start });
    }
  }

  const spans = new Map();
  const linesEqual = (fileA, indexA, fileB, indexB) => {
    const linesA = fileLines.get(fileA);
    const linesB = fileLines.get(fileB);
    return linesA[indexA]?.norm === linesB[indexB]?.norm;
  };
  const maxPairsPerHash = 2000;
  const maxExtensionLines = 4000;
  for (const occurrences of windowOccurrences.values()) {
    if (occurrences.length < 2) continue;
    if (uniq(occurrences.map((entry) => entry.file)).length < 2 && !args.sameFile) continue;
    let pairs = 0;
    for (let i = 0; i < occurrences.length && pairs < maxPairsPerHash; i += 1) {
      for (let j = i + 1; j < occurrences.length && pairs < maxPairsPerHash; j += 1) {
        const a = occurrences[i];
        const b = occurrences[j];
        if (a.file === b.file && (!args.sameFile || a.start === b.start)) continue;
        if (a.file === b.file && a.start === b.start) continue;
        pairs += 1;
        let startA = a.start;
        let startB = b.start;
        let leftExtension = 0;
        while (startA > 0 && startB > 0 && leftExtension < maxExtensionLines && linesEqual(a.file, startA - 1, b.file, startB - 1)) {
          startA -= 1;
          startB -= 1;
          leftExtension += 1;
        }
        let length = N;
        while (startA + length < fileLines.get(a.file).length && startB + length < fileLines.get(b.file).length
          && length < maxExtensionLines && linesEqual(a.file, startA + length, b.file, startB + length)) { length += 1; }
        const key = `${a.file}|${startA}|${b.file}|${startB}|${length}`;
        if (spans.has(key)) continue;
        const linesA = fileLines.get(a.file).slice(startA, startA + length);
        const linesB = fileLines.get(b.file).slice(startB, startB + length);
        const dataLines = linesA.filter((line) => /^["'`]/.test(line.norm) || /^[A-Za-z_$][\w$]*:\s*["'`]/.test(line.norm)).length;
        const dataRatio = length === 0 ? 0 : dataLines / length;
        spans.set(key, {
          fileA: a.file,
          startLineA: linesA[0]?.line,
          endLineA: linesA[linesA.length - 1]?.line,
          fileB: b.file,
          startLineB: linesB[0]?.line,
          endLineB: linesB[linesB.length - 1]?.line,
          lines: length,
          dataRatio: Number(dataRatio.toFixed(3)),
          classification: dataRatio >= 0.6 ? "data/text" : "logic",
          sample: linesA.slice(0, 3).map((line) => line.raw),
        });
      }
    }
  }

  // 去掉被更大 span 完全包含的同文件对区间（降噪；按文件对分组，避免 O(k²) 全比）。
  const sortedSpans = [...spans.values()].sort((a, b) => b.lines - a.lines);
  const kept = [];
  const keptByPair = new Map();
  for (const span of sortedSpans) {
    const pairKey = `${span.fileA}|${span.fileB}`;
    const previous = keptByPair.get(pairKey) ?? [];
    const contained = previous.some((other) => other.startLineA <= span.startLineA && other.endLineA >= span.endLineA
      && other.startLineB <= span.startLineB && other.endLineB >= span.endLineB);
    if (contained) continue;
    kept.push(span);
    previous.push(span);
    keptByPair.set(pairKey, previous);
  }

  const logicSpans = kept.filter((span) => span.classification === "logic");
  const dataSpans = kept.filter((span) => span.classification === "data/text");
  return {
    scopePrefixes: DUPLICATE_SCOPE_PREFIXES,
    windowLines: N,
    thresholds: { minBodyChars: args.minBodyChars, minBodyLines: args.minBodyLines, sameFile: args.sameFile },
    exportedFunctionCount: functions.length,
    bodyHashDuplicateCount: bodyDuplicates.length,
    bodyHashDuplicates: bodyDuplicates,
    sharedTextConstantCount: textConstants.length,
    sharedTextConstantGroupCount: sharedTextConstantGroups.length,
    sharedTextConstantGroups: sharedTextConstantGroups.slice(0, 100),
    windowDuplicateSpanCount: kept.length,
    logicDuplicateSpanCount: logicSpans.length,
    dataDuplicateSpanCount: dataSpans.length,
    duplicateSpans: kept.slice(0, args.maxSpans).map((span) => ({
      ...span,
      truncated: kept.length > args.maxSpans,
    })),
    methodology: [
      "导出函数（function 声明 / export const 箭头函数或函数表达式）提取 body；剥离注释、token 化、按本地声明序重命名参数/变量（属性访问名与对象键不重命名），sha256 归一化 body。",
      `连续窗口：剥离注释/空白后按非空行取 ${N} 行窗口（阈值 --window-lines），跨文件比对；span 向两端扩展为最大连续块并去重/去包含。`,
      "分类启发式：匹配行 ≥60% 为字符串数据行 → data/text（同形文案/数据，需说明）；否则 logic（共享逻辑复制=失败项）。",
      "同形文案/数据补充：顶层字符串常量（单字符串/纯字符串数组 join，≥120 字符）按值 hash 跨文件分组；相同值列出供说明（角色卡私有文本按 E0 契约分角色持有，不是共享逻辑复制）。",
    ],
  };
}

// —————————————————————————————— 4. 结构残留/待确认核对 ——————————————————————————————

function readLines(sourceFile) {
  return sourceFile.text.split(/\r?\n/);
}

function strippedLines(sourceFile) {
  return stripComments(sourceFile.text).split(/\r?\n/);
}

function scanText(relPaths, pattern, options = {}) {
  const hits = [];
  const identifierName = options.identifier ?? null;
  for (const relPath of relPaths) {
    const sf = options.sourceFiles?.get(relPath) ?? null;
    const raw = sf ? readLines(sf) : fs.readFileSync(absOf(relPath), "utf8").split(/\r?\n/);
    const code = sf ? strippedLines(sf) : stripComments(fs.readFileSync(absOf(relPath), "utf8")).split(/\r?\n/);
    for (let index = 0; index < raw.length; index += 1) {
      pattern.lastIndex = 0;
      if (!pattern.test(raw[index])) continue;
      pattern.lastIndex = 0;
      const inCode = code[index] !== undefined && pattern.test(code[index]);
      pattern.lastIndex = 0;
      let identifierInCode;
      let stringOnly;
      if (identifierName !== null) {
        const codeLine = code[index] ?? "";
        identifierInCode = tokenize(codeLine).some((token) => token.type === "id" && token.text === identifierName);
        stringOnly = inCode && !identifierInCode;
      }
      hits.push({
        file: relPath,
        line: index + 1,
        code: inCode,
        commentOnly: !inCode,
        identifierInCode,
        stringOnly,
        text: raw[index].trim().slice(0, 200),
      });
    }
    pattern.lastIndex = 0;
  }
  return hits;
}

function filesUnder(prefixes, fileNames, extensions = [".ts", ".tsx", ".mjs", ".js", ".cjs"]) {
  return fileNames.filter((file) => prefixes.some((prefix) => file.startsWith(prefix))
    && extensions.some((ext) => file.endsWith(ext)));
}

function walkFiles(rootRel, extensions) {
  const results = [];
  const walk = (relDir) => {
    const absDir = absOf(relDir);
    if (!fs.existsSync(absDir)) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") walk(rel);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(rel);
      }
    }
  };
  walk(rootRel.replace(/\/$/, ""));
  return results;
}

function checkBoundaryPrinciple({ fileNames, sourceFiles }) {
  const pattern = /\bBOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE\b/g;
  const scope = fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("test/"));
  const hits = scanText(scope, pattern, { sourceFiles, identifier: "BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE" });
  const declarationHits = hits.filter((hit) => hit.file === "src/common/门禁引擎/governance-roles.ts"
    && /export const BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE/.test(hit.text));
  const codeReferences = hits.filter((hit) => hit.identifierInCode && !declarationHits.includes(hit));
  const stringOnlyReferences = hits.filter((hit) => hit.stringOnly);
  const commentReferences = hits.filter((hit) => hit.commentOnly);
  return {
    declarationCount: declarationHits.length,
    declaration: declarationHits,
    codeReferenceCount: codeReferences.length,
    codeReferences,
    stringOnlyReferenceCount: stringOnlyReferences.length,
    stringOnlyReferences,
    commentReferenceCount: commentReferences.length,
    commentReferences,
    status: declarationHits.length === 1 && codeReferences.length === 0
      ? "exported-kept-pending-confirmation (E2 评审 §4.4/P7；仅注释/文档引用，无代码消费者)"
      : "needs-review",
  };
}

function objectLiteralKeys(objectLiteral) {
  const keys = [];
  for (const property of objectLiteral.properties ?? []) {
    if (tsIs.isPropertyAssignment(property) && tsIs.isIdentifier(property.name)) keys.push(property.name.text);
    else if (tsIs.isPropertyAssignment(property) && tsIs.isStringLiteral(property.name)) keys.push(property.name.text);
    else if (tsIs.isShorthandPropertyAssignment(property)) keys.push(property.name.text);
  }
  return keys;
}

function checkTrioCardKinds({ fileNames, sourceFiles }) {
  const relPath = "src/pipeline/orchestration/run-role.ts";
  const sf = sourceFiles.get(relPath);
  const result = { declaration: null, remainingEntries: [], remainingLines: null, references: [], codeReferenceCount: 0, commentReferenceCount: 0 };
  if (!sf) return result;
  for (const statement of sf.statements) {
    if (!tsIs.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!tsIs.isIdentifier(declaration.name) || declaration.name.text !== "TRIO_CARD_KINDS") continue;
      const startLine = sf.getLineAndCharacterOfPosition(statement.getStart(sf)).line + 1;
      const endLine = sf.getLineAndCharacterOfPosition(statement.getEnd()).line + 1;
      const initializer = declaration.initializer;
      let objectLiteral = initializer;
      if (initializer && tsIs.isCallExpression(initializer) && initializer.arguments.length === 1) {
        objectLiteral = initializer.arguments[0];
      }
      result.declaration = { file: relPath, startLine, endLine, typeAnnotation: declaration.type?.getText?.(sf) ?? null };
      result.remainingLines = { start: startLine, end: endLine };
      if (objectLiteral && tsIs.isObjectLiteralExpression(objectLiteral)) result.remainingEntries = objectLiteralKeys(objectLiteral);
    }
  }
  const pattern = /\bTRIO_CARD_KINDS\b/g;
  const scope = fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("test/"));
  const hits = scanText(scope, pattern, { sourceFiles, identifier: "TRIO_CARD_KINDS" });
  result.references = hits.filter((hit) => !(hit.file === relPath
    && result.remainingLines && hit.line >= result.remainingLines.start && hit.line <= result.remainingLines.end));
  result.codeReferenceCount = result.references.filter((hit) => hit.identifierInCode).length;
  result.stringOnlyReferenceCount = result.references.filter((hit) => hit.stringOnly).length;
  result.commentReferenceCount = result.references.filter((hit) => hit.commentOnly).length;
  result.status = result.remainingEntries.length === 1 && result.remainingEntries[0] === "product"
    ? "only-product-remains (product-code fixture fallback; E3 待确认)"
    : "needs-review";
  return result;
}

function checkDeletedDataProjection({ fileNames, sourceFiles }) {
  const identifiers = ["builtInRoleModuleDataOf", "BUILT_IN_ROLE_MODULE_DATA"];
  const scope = fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("bin/") || file.startsWith("test/"));
  const report = {};
  for (const identifier of identifiers) {
    const pattern = new RegExp(`\\b${identifier}\\b`, "g");
    const hits = scanText(scope, pattern, { sourceFiles, identifier });
    report[identifier] = {
      srcAppCodeHits: hits.filter((hit) => hit.identifierInCode && !hit.file.startsWith("test/")),
      testMentions: hits.filter((hit) => hit.file.startsWith("test/")),
    };
  }
  return {
    ...report,
    status: report.builtInRoleModuleDataOf.srcAppCodeHits.length === 0 && report.BUILT_IN_ROLE_MODULE_DATA.srcAppCodeHits.length === 0
      ? "zero-in-src/app (test assertions only)"
      : "needs-review",
  };
}

const DELETED_CONSTANT_NAMES = [
  "CHIEF_CARD_TEXT",
  "PRODUCT_CARD_TEXT",
  "RAPPORTEUR_CARD_TEXT",
  "NOMINATOR_CARD_TEXT",
  "CONVENER_CARD_TEXT",
  "VERIFIER_CARD_TEXT",
  "SHELL_APPROVAL_CARD_LINE",
  "CUSTOMER_CARDIFICATION_PRINCIPLE",
  "APP_ONLY_WRITE_PREFIXES",
  "BUILT_IN_ROLE_DIR_PREFIXES",
  "STRUCTURED_GIT_DISCIPLINE",
  "DIRECT_CAPABILITY_AVAILABILITY",
  "DIRECT_ACTION_EVIDENCE",
];

function checkDeletedConstants({ fileNames, sourceFiles }) {
  const appRoots = ["app/", "src/app/"];
  const engineRoots = ["src/common/门禁引擎/"];
  const roleRoots = ["src/common/roles/"];
  const codeExtensions = [".ts", ".tsx", ".mjs", ".js", ".cjs", ".jsx"];
  const appFiles = uniq([
    ...filesUnder(appRoots, fileNames, codeExtensions),
    ...appRoots.flatMap((root) => walkFiles(root, codeExtensions)),
  ]).sort();
  const engineFiles = filesUnder(engineRoots, fileNames);
  const roleFiles = filesUnder(roleRoots, fileNames);
  const otherSrcFiles = filesUnder(["src/"], fileNames).filter((file) => !roleFiles.includes(file) && !engineFiles.includes(file));
  const entries = [];
  for (const name of DELETED_CONSTANT_NAMES) {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    const appHits = scanText(appFiles, pattern, { sourceFiles, identifier: name });
    const engineHits = scanText(engineFiles, pattern, { sourceFiles, identifier: name });
    const roleHits = scanText(roleFiles, pattern, { sourceFiles, identifier: name });
    const otherHits = scanText(otherSrcFiles, pattern, { sourceFiles, identifier: name });
    entries.push({
      name,
      appHits,
      appResidualCount: appHits.length,
      engineHits,
      engineCodeHits: engineHits.filter((hit) => hit.identifierInCode),
      roleModuleHits: roleHits,
      otherSrcHits: otherHits,
    });
  }
  // `*_CARD_TEXT` 通配（识别剩余所有形态）；`DIRECT_*` 通配。
  const cardTextPattern = /\b[A-Z][A-Z0-9_]*_CARD_TEXT\b/g;
  const cardTextHits = scanText(fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/")), cardTextPattern, { sourceFiles });
  const directPattern = /\bDIRECT_[A-Z0-9_]+\b/g;
  const directHits = scanText(fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/")), directPattern, { sourceFiles });
  const appResidualTotal = entries.reduce((sum, entry) => sum + entry.appResidualCount, 0);
  return {
    appRoots,
    entries,
    appResidualTotal,
    cardTextIdentifiersInScope: sortStrings(uniq(cardTextHits.map((hit) => {
      const match = /\b([A-Z][A-Z0-9_]*_CARD_TEXT)\b/.exec(hit.text);
      return match ? match[1] : hit.text;
    }))),
    cardTextHits,
    directIdentifiersInScope: sortStrings(uniq(directHits.map((hit) => {
      const match = /\b(DIRECT_[A-Z0-9_]+)\b/.exec(hit.text);
      return match ? match[1] : hit.text;
    }))),
    directHits,
    status: appResidualTotal === 0 ? "zero-app-residuals" : "needs-review",
  };
}

function checkTemporarySwitches({ fileNames, sourceFiles }) {
  const patterns = [
    /\bDISPATCH_GATE_IMPL\b/g,
    /\b[A-Z][A-Z0-9_]*(?:GATE|MODULE|ROLE)_IMPL(?:_SWITCH)?\b/g,
    /\bTEMP(?:ORARY)?_(?:SWITCH|FLAG)\b/g,
    /\b(?:LEGACY|X_G|X_R\d+)_?(?:BRIDGE|SWITCH)\b/g,
    /\bUSE_(?:GATES?_MODULE|ROLE_MODULE|NEW_IMPL)\b/g,
  ];
  const scope = fileNames.filter((file) => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("bin/"));
  const all = [];
  for (const pattern of patterns) {
    all.push(...scanText(scope, pattern, { sourceFiles }).map((hit) => ({ ...hit, pattern: String(pattern) })));
  }
  const codeHits = all.filter((hit) => hit.code);
  return {
    scannedFiles: scope.length,
    totalHits: all.length,
    codeHits,
    commentOnlyHits: all.filter((hit) => hit.commentOnly),
    status: codeHits.length === 0 ? "zero-live-switches" : "needs-review",
  };
}

function parseRoleToolRegistry({ sourceFiles }) {
  const registryPath = "src/common/门禁引擎/role-tool-registry.ts";
  const modelPath = "src/model/role.ts";
  const registrySource = sourceFiles.get(registryPath)?.text ?? fs.readFileSync(absOf(registryPath), "utf8");
  const modelSource = sourceFiles.get(modelPath)?.text ?? fs.readFileSync(absOf(modelPath), "utf8");
  const catalog = [];
  const entryPattern = /catalogEntry\(\s*"([A-Za-z]+)"\s*,\s*"([a-z_]+)"\s*,\s*\[([^\]]*)\]/g;
  let match;
  while ((match = entryPattern.exec(registrySource)) !== null) {
    const allowed = [...match[3].matchAll(/"([a-z]+)"/g)].map((item) => item[1]);
    catalog.push({ id: match[1], name: match[2], allowedRoleIds: allowed });
  }
  const unionMembers = (source, typeName) => {
    const pattern = new RegExp(`export type ${typeName}\\s*=\\s*([\\s\\S]*?);`);
    const found = pattern.exec(source);
    if (!found) return [];
    return [...found[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  };
  const modelIds = unionMembers(modelSource, "RoleToolId");
  const modelNames = unionMembers(modelSource, "RoleToolName");
  const catalogIds = catalog.map((entry) => entry.id);
  const catalogNames = catalog.map((entry) => entry.name);
  const duplicateIds = catalogIds.filter((id, index) => catalogIds.indexOf(id) !== index);
  const duplicateNames = catalogNames.filter((name, index) => catalogNames.indexOf(name) !== index);
  const missingIds = modelIds.filter((id) => !catalogIds.includes(id));
  const extraIds = catalogIds.filter((id) => !modelIds.includes(id));
  const missingNames = modelNames.filter((name) => !catalogNames.includes(name));
  const extraNames = catalogNames.filter((name) => !modelNames.includes(name));

  // 第二份 id→name 映射检测（同一行/相邻出现 id 与 name 字面量）。
  const pairPattern = /"(roleActivityLog|terminateRoleRun|redispatchTask|projectNote|requestVersionDecision|requestRequirementChange|submitVersionChange|selectRunChange|completeTeamPlan|activateRoleDocuments|closeCreatedTask|submitRefactor|requestStableWrite|decidePendingRequest)"\s*,\s*"([a-z_]+)"/g;
  const pairHits = [];
  for (const file of [...sourceFiles.keys()].filter((relPath) => relPath.startsWith("src/") && relPath.endsWith(".ts"))) {
    const source = sourceFiles.get(file).text;
    let pair;
    while ((pair = pairPattern.exec(source)) !== null) pairHits.push({ file, id: pair[1], name: pair[2] });
    pairPattern.lastIndex = 0;
  }
  const uniquePairFiles = sortStrings(uniq(pairHits.map((hit) => hit.file)));
  return {
    registryPath,
    modelPath,
    catalogEntryCount: catalog.length,
    catalog,
    duplicateIds,
    duplicateNames,
    modelRoleToolIdCount: modelIds.length,
    modelRoleToolNameCount: modelNames.length,
    missingIds,
    extraIds,
    missingNames,
    extraNames,
    pairMappingFiles: uniquePairFiles,
    pairMappingHits: pairHits,
    uniqueMapping: catalog.length === 14 && duplicateIds.length === 0 && duplicateNames.length === 0
      && missingIds.length === 0 && extraIds.length === 0 && missingNames.length === 0 && extraNames.length === 0
      && uniquePairFiles.length === 1 && uniquePairFiles[0] === registryPath,
    status: catalog.length === 14 && duplicateIds.length === 0 && duplicateNames.length === 0
      && missingIds.length === 0 && extraIds.length === 0
      ? "14-unique-mapping (only ROLE_TOOL_CATALOG)"
      : "needs-review",
  };
}

function checkBuiltInRoleModules({ sourceFiles }) {
  const relPath = "src/common/门禁引擎/governance-roles.ts";
  const sf = sourceFiles.get(relPath);
  const expected = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"];
  const result = { file: relPath, keys: [], expectedKeys: expected, values: [], valueMatch: false, keysMatch: false };
  if (!sf) return result;
  for (const statement of sf.statements) {
    if (!tsIs.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!tsIs.isIdentifier(declaration.name) || declaration.name.text !== "builtInRoleModules") continue;
      let initializer = declaration.initializer;
      if (initializer && tsIs.isCallExpression(initializer) && initializer.arguments.length === 1) initializer = initializer.arguments[0];
      if (!initializer || !tsIs.isObjectLiteralExpression(initializer)) continue;
      for (const property of initializer.properties ?? []) {
        if (!tsIs.isPropertyAssignment(property)) continue;
        result.keys.push(property.name?.text ?? "<computed>");
        result.values.push(property.initializer?.getText?.(sf) ?? publicationText(property.initializer, sf));
      }
    }
  }
  function publicationText(node, sourceFile) {
    try { return node.getText?.() ?? sourceFile.text.slice(node.getStart(sourceFile), node.getEnd()); } catch { return "<unreadable>"; }
  }
  result.keysMatch = JSON.stringify(sortStrings(result.keys)) === JSON.stringify(sortStrings(expected));
  result.valueMatch = result.values.length === 6 && result.values.every((value) => /RoleModule$/.test(value));
  return { ...result, status: result.keysMatch && result.valueMatch ? "six-keys-complete" : "needs-review" };
}

function checkGateSingleImplementation({ sourceFiles }) {
  const trunkPath = "src/pipeline/orchestration/trunk-runtime.ts";
  const gatesPath = "src/common/gates/index.ts";
  const trunk = sourceFiles.get(trunkPath);
  const gates = sourceFiles.get(gatesPath);
  if (!trunk || !gates) return { status: "missing-files", pass: false };
  const trunkStripped = stripComments(trunk.text);
  const gatesStripped = stripComments(gates.text);
  const count = (text, pattern) => (text.match(pattern) ?? []).length;
  const result = {
    trunkPath,
    gatesPath,
    trunkImportsGates: /from\s+["']\.\.\/\.\.\/common\/gates\/index\.ts["']/.test(trunkStripped),
    trunkEvaluateReferenceCount: count(trunkStripped, /\bevaluateChiefDispatchParent\b/g),
    trunkLocalDefinitionCount: count(trunkStripped, /function\s+evaluateChiefDispatchParent\b/g),
    trunkApplicationMediationCount: count(trunkStripped, /\bapplicationMediation\b/g),
    gatesDefinitionCount: count(gatesStripped, /export function evaluateChiefDispatchParent\b/g),
  };
  result.pass = result.trunkImportsGates
    && result.trunkEvaluateReferenceCount === 3   // 1 import + 2 调用（validParent / currentChiefResumeSource）
    && result.trunkLocalDefinitionCount === 0
    && result.trunkApplicationMediationCount === 0
    && result.gatesDefinitionCount === 1;
  result.status = result.pass ? "single-implementation (trunk-runtime -> gates/index.ts, 2 calls, 0 local)" : "needs-review";
  return result;
}

function scanStructuralChecks({ fileNames, sourceFiles }) {
  return {
    boundaryWritePreauthorizationPrinciple: checkBoundaryPrinciple({ fileNames, sourceFiles }),
    trioCardKinds: checkTrioCardKinds({ fileNames, sourceFiles }),
    deletedDataProjection: checkDeletedDataProjection({ fileNames, sourceFiles }),
    deletedConstants: checkDeletedConstants({ fileNames, sourceFiles }),
    temporarySwitches: checkTemporarySwitches({ fileNames, sourceFiles }),
    roleToolRegistry: parseRoleToolRegistry({ sourceFiles }),
    builtInRoleModules: checkBuiltInRoleModules({ sourceFiles }),
    gateSingleImplementation: checkGateSingleImplementation({ sourceFiles }),
  };
}

// —————————————————————————————— 汇总与写盘 ——————————————————————————————

function buildMarkdownLog(report, jsonHash) {
  const lines = [];
  const push = (line = "") => lines.push(line);
  push("# E3 代码扫描摘要（e3-code-scan.mjs）");
  push();
  push(`- 生成时间（UTC）：${report.meta.startedAt} → ${report.meta.endedAt}`);
  push(`- 工具：${report.meta.tool.path} / sha256 \`${report.meta.tool.sha256}\``);
  push(`- 命令：\`${report.meta.argv.join(" ")}\``);
  push(`- cwd：\`${report.meta.cwd}\`；Node ${report.meta.environment.node}；${report.meta.environment.platform}/${report.meta.environment.arch}`);
  push();
  const graph = report.moduleGraph;
  push("## 1. 模块图");
  push();
  push(`- 扫描文件：${graph.scannedFiles}（模块/引擎范围内 ${graph.scannedScopeFiles}）；边 ${graph.edgeCount}（value ${graph.valueEdgeCount} / type-only ${graph.typeOnlyEdgeCount}）`);
  push(`- 依赖方向违例：**${graph.violations.length}**；value 环：**${graph.valueCycles.length}**；type-only 环：**${graph.typeOnlyCycles.length}**（非 Model 内部：${graph.nonModelTypeOnlyCycles.length}）`);
  push(`- 角色模块间 import：${graph.violationCategories.roleCrossImport}；角色→门控/引擎/私有 common：${graph.violationCategories.roleImportsGates}/${graph.violationCategories.roleImportsEngine}/${graph.violationCategories.roleImportsPrivateCommon}`);
  push(`- 门控→角色：${graph.violationCategories.gatesImportsRole}；共享→门/角色：${graph.violationCategories.sharedImportsGates}/${graph.violationCategories.sharedImportsRoles}`);
  push(`- Model→shared type-only：${graph.modelToSharedTypeOnly.length}（意外 ${graph.unexpectedModelToSharedTypeOnly.length}）；Model→shared value：${graph.modelToSharedValue.length}；D9 role.ts↔runtime.ts 豁免：${graph.d9ModelInternalExemptionPresent ? "在列" : "缺失"}`);
  push(`- 唯一入口：gates=${JSON.stringify(graph.gatesRootFiles)}；roles=${graph.roleModuleIds.length} 模块、根文件违例 ${graph.publicEntryViolations.length}`);
  push();
  const unused = report.unusedExports;
  push("## 2. 未使用导出");
  push();
  push(`- 扫描范围文件 ${unused.scannedFiles}，导出符号 ${unused.exportCount}`);
  push(`- 零引用导出 **${unused.zeroReferenceCount}**：范围内（本变更新增）**${unused.inScopeZeroReferenceCount}**；待确认（历史）**${unused.pendingZeroReferenceCount}**`);
  push(`- 仅文件内引用（导出面未被外部使用）${unused.internalOnlyExportCount}`);
  if (unused.zeroReferenceExports.inScope.length > 0) {
    push("- 范围内零引用（发现项）：");
    for (const entry of unused.zeroReferenceExports.inScope) push(`  - \`${entry.file}:${entry.declarationLine}\` ${entry.name} (${entry.kind}${entry.typeOnly ? ", type-only" : ""})`);
  }
  push();
  const dup = report.duplicates;
  push("## 3. 重复实现");
  push();
  push(`- 导出函数 ${dup.exportedFunctionCount}；归一化 body hash 重复组 **${dup.bodyHashDuplicateCount}**`);
  push(`- 同形文本常量组（跨文件、≥120 字符）**${dup.sharedTextConstantGroupCount}**（data/text，需说明；不作为共享逻辑失败项）`);
  push(`- 连续 ≥${dup.windowLines} 行窗口 span **${dup.windowDuplicateSpanCount}**：logic **${dup.logicDuplicateSpanCount}** / data-text **${dup.dataDuplicateSpanCount}**`);
  if (dup.logicDuplicateSpanCount > 0) {
    push("- logic 重复（发现项）：");
    for (const span of dup.duplicateSpans.filter((item) => item.classification === "logic")) {
      push(`  - ${span.fileA}:${span.startLineA}-${span.endLineA} ↔ ${span.fileB}:${span.startLineB}-${span.endLineB}（${span.lines} 行）`);
    }
  }
  push();
  const structural = report.structuralChecks;
  push("## 4. 结构残留/待确认");
  push();
  push(`- BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE：声明 ${structural.boundaryWritePreauthorizationPrinciple.declarationCount}；代码引用（非声明）${structural.boundaryWritePreauthorizationPrinciple.codeReferenceCount}；注释引用 ${structural.boundaryWritePreauthorizationPrinciple.commentReferenceCount}`);
  push(`- TRIO_CARD_KINDS：剩余键 ${JSON.stringify(structural.trioCardKinds.remainingEntries)}；行 ${structural.trioCardKinds.remainingLines?.start}-${structural.trioCardKinds.remainingLines?.end}；代码引用 ${structural.trioCardKinds.codeReferenceCount} / 字符串引用 ${structural.trioCardKinds.stringOnlyReferenceCount} / 注释 ${structural.trioCardKinds.commentReferenceCount}`);
  push(`- builtInRoleModuleDataOf / BUILT_IN_ROLE_MODULE_DATA：src/app 代码命中 ${structural.deletedDataProjection.builtInRoleModuleDataOf.srcAppCodeHits.length} / ${structural.deletedDataProjection.BUILT_IN_ROLE_MODULE_DATA.srcAppCodeHits.length}`);
  push(`- 已删常量 app 残留：**${structural.deletedConstants.appResidualTotal}**（${structural.deletedConstants.status}）`);
  push(`- 临时开关：代码命中 **${structural.temporarySwitches.codeHits.length}**（${structural.temporarySwitches.status}）`);
  push(`- role-tool-registry：${structural.roleToolRegistry.catalogEntryCount} 项、id 唯一 ${structural.roleToolRegistry.duplicateIds.length === 0}、name 唯一 ${structural.roleToolRegistry.duplicateNames.length === 0}、映射文件 ${JSON.stringify(structural.roleToolRegistry.pairMappingFiles)} → ${structural.roleToolRegistry.status}`);
  push(`- builtInRoleModules：键 ${JSON.stringify(structural.builtInRoleModules.keys)} → ${structural.builtInRoleModules.status}`);
  push(`- D5 门判定单实现：${structural.gateSingleImplementation.status}（trunk 引用 ${structural.gateSingleImplementation.trunkEvaluateReferenceCount}、本地定义 ${structural.gateSingleImplementation.trunkLocalDefinitionCount}、applicationMediation ${structural.gateSingleImplementation.trunkApplicationMediationCount}、gates 定义 ${structural.gateSingleImplementation.gatesDefinitionCount}）`);
  push();
  push("## 5. 运行元数据");
  push();
  push(`- 退出码：${report.meta.exitCode}；硬违例：${report.meta.hardViolationCount}`);
  push(`- 输出：e3-code-scan.json sha256 \`${jsonHash}\`；本日志 sha256 见 meta。`);
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(REPO_ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const progress = (label) => console.log(`[e3-code-scan] ${label} (${((Date.now() - STARTED_MS) / 1000).toFixed(1)}s)`);

  const { api, fileNames, sourceFiles } = loadProject();
  progress(`project loaded: ${fileNames.length} files`);
  let report;
  try {
    const moduleGraph = scanModuleGraph({ fileNames, sourceFiles });
    progress(`module graph done: violations=${moduleGraph.violations.length}`);
    const unusedExports = scanUnusedExports({ fileNames, sourceFiles });
    progress(`unused exports done: zeroRef=${unusedExports.zeroReferenceCount}`);
    const duplicates = scanDuplicateImplementations({ fileNames, sourceFiles }, args);
    progress(`duplicates done: spans=${duplicates.windowDuplicateSpanCount}`);
    const structuralChecks = scanStructuralChecks({ fileNames, sourceFiles });
    progress("structural checks done");
    const hardViolations = [
      moduleGraph.violations.length,
      moduleGraph.valueCycles.length,
      moduleGraph.nonModelTypeOnlyCycles.length,
      duplicates.logicDuplicateSpanCount,
      unusedExports.zeroReferenceExports.inScope.length,
      structuralChecks.deletedDataProjection.builtInRoleModuleDataOf.srcAppCodeHits.length,
      structuralChecks.deletedDataProjection.BUILT_IN_ROLE_MODULE_DATA.srcAppCodeHits.length,
      structuralChecks.deletedConstants.appResidualTotal,
      structuralChecks.temporarySwitches.codeHits.length,
      structuralChecks.roleToolRegistry.uniqueMapping ? 0 : 1,
      structuralChecks.builtInRoleModules.keysMatch && structuralChecks.builtInRoleModules.valueMatch ? 0 : 1,
      structuralChecks.gateSingleImplementation.pass ? 0 : 1,
    ].reduce((sum, value) => sum + value, 0);
    const plannedExitCode = args.failOnViolations && hardViolations > 0 ? 1 : 0;
    report = {
      tool: "e3-code-scan",
      task: "2026-11-07-runtime-gate-role-modularization / E3",
      moduleGraph,
      unusedExports,
      duplicates,
      structuralChecks,
      meta: {
        tool: { path: "test/测试/scripts/e3-code-scan.mjs", sha256: sha256File(TOOL_PATH) },
        argv: process.argv,
        cwd: process.cwd(),
        environment: { node: process.version, platform: process.platform, arch: process.arch, os: `${process.platform} ${process.arch}` },
        startedAt: STARTED_AT,
        endedAt: new Date().toISOString(),
        args,
        hardViolationCount: hardViolations,
        exitCode: plannedExitCode,
        outputs: {},
      },
    };
    const jsonPath = path.join(outDir, "e3-code-scan.json");
    const logPath = path.join(outDir, "e3-code-scan.log");
    const metaPath = path.join(outDir, "e3-code-scan.meta.json");
    const jsonText = JSON.stringify(report, null, 2) + "\n";
    fs.writeFileSync(jsonPath, jsonText, "utf8");
    const jsonHash = sha256(jsonText);
    const logText = buildMarkdownLog(report, jsonHash);
    fs.writeFileSync(logPath, logText, "utf8");
    const meta = {
      ...report.meta,
      outputs: {
        json: { file: "e3-code-scan.json", sha256: sha256(jsonText), bytes: Buffer.byteLength(jsonText) },
        log: { file: "e3-code-scan.log", sha256: sha256(logText), bytes: Buffer.byteLength(logText) },
      },
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
    console.log(`[e3-code-scan] tool sha256=${report.meta.tool.sha256}`);
    console.log(`[e3-code-scan] module-graph: files=${moduleGraph.scannedFiles} edges=${moduleGraph.edgeCount} violations=${moduleGraph.violations.length} valueCycles=${moduleGraph.valueCycles.length} typeOnlyCycles=${moduleGraph.typeOnlyCycles.length}`);
    console.log(`[e3-code-scan] unused-exports: exports=${unusedExports.exportCount} zeroRef=${unusedExports.zeroReferenceCount} inScope=${unusedExports.inScopeZeroReferenceCount} pending=${unusedExports.pendingZeroReferenceCount} internalOnly=${unusedExports.internalOnlyExportCount}`);
    console.log(`[e3-code-scan] duplicates: bodyHashGroups=${duplicates.bodyHashDuplicateCount} windowSpans=${duplicates.windowDuplicateSpanCount} logic=${duplicates.logicDuplicateSpanCount} data=${duplicates.dataDuplicateSpanCount} textConstantGroups=${duplicates.sharedTextConstantGroupCount}`);
    console.log(`[e3-code-scan] structural: appResiduals=${structuralChecks.deletedConstants.appResidualTotal} switches=${structuralChecks.temporarySwitches.codeHits.length} registry=${structuralChecks.roleToolRegistry.status} modules=${structuralChecks.builtInRoleModules.status}`);
    console.log(`[e3-code-scan] outputs: ${jsonPath}`);
    console.log(`[e3-code-scan] outputs: ${logPath}`);
    console.log(`[e3-code-scan] outputs: ${metaPath}`);
    console.log(`[e3-code-scan] hardViolationCount=${hardViolations}`);
    if (args.failOnViolations && hardViolations > 0) process.exitCode = 1;
  } finally {
    api.close();
  }
  return report;
}

try {
  main();
} catch (error) {
  console.error("[e3-code-scan] FATAL:", error?.stack ?? error);
  process.exitCode = 2;
}
