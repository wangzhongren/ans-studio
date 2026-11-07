// test/gates/module-graph.test.ts
// 模块图静态扫描（B1 E1.4/E1.5/E3.5；E0.3 §2/§10.2 D9；团队计划 §7.4-§7.5）。
//
// 工具：仓内 `typescript`（devDependencies，不新增依赖）的 Compiler API——TS 7 原生 API
// `typescript/unstable/sync`（project/program + AST）+ `typescript/unstable/ast/is`。
// 不 spawn 额外工具、不读网络、不跑真实模型；扫描结果只用于本测试断言与证据报告。
//
// 扫描范围（E1 gates-code 口径）：
// - 模块层：`src/common/roles/**`（若存在）、`src/common/gates/**`、`src/common/shared/**`；
// - Model：`src/model/**`（用于 D9 type-only 豁免口径）；
// - 引擎层：`src/pipeline/**`、`src/service/**`、`src/provider/**`、`src/common/门禁引擎/**`、
//   `src/common/编排/**`、`src/common/runtime-core/**`、三个适配器、`src/common/装配/**`、`app/**`、`bin/**`。
//
// 规则（违反即失败）：
// 1. 唯一 public entry：`src/common/gates/` 与每个 `src/common/roles/<id>/` 模块根只允许 `index.ts`；
// 2. 角色模块之间零 import；
// 3. 角色模块不 import 门控/引擎/私有 common（Model、shared 与自身内部允许）；
// 4. 门控不 import 角色/引擎/私有 common（Model、shared 与自身内部允许）；
// 5. 共享不 import 门控/角色/引擎（Model 与自身内部允许）；
// 6. Model 不 import 门控/角色/引擎；Model→shared 只允许「既有 type-only 共享原语单列」，
//    禁止 value import 反向（D9）；
// 7. 外部（引擎）只经 `index.ts` 消费角色/门控模块；
// 8. 无环：模块层（Model/shared/gates/roles）value import 无环；type-only 环仅豁免
//    Model 内部（`role.ts↔runtime.ts`、`download.ts` 例外，D9 口径）。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import * as tsApi from "typescript/unstable/sync";
import type { Project } from "typescript/unstable/sync";
import * as tsAst from "typescript/unstable/ast";
import * as tsIs from "typescript/unstable/ast/is";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");

type ProjectHandle = Project;

type Layer =
  | { readonly kind: "model" | "shared" | "gates" | "engine" | "other" }
  | { readonly kind: "role"; readonly id: string };

interface ScanEdge {
  readonly from: string;
  readonly to: string;
  readonly typeOnly: boolean;
}

interface ModuleGraphReport {
  readonly scannedFiles: number;
  readonly layerCounts: Readonly<Record<string, number>>;
  readonly edges: readonly ScanEdge[];
  readonly violations: readonly string[];
  readonly modelToSharedTypeOnly: readonly string[];
  readonly modelInternalTypeOnly: readonly string[];
  readonly valueCycles: readonly (readonly string[])[];
  readonly typeOnlyCycles: readonly (readonly string[])[];
  readonly gatesRootFiles: readonly string[];
  readonly roleModules: readonly string[];
  readonly rolesPresent: boolean;
}

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

function layerOf(file: string): Layer {
  if (file.startsWith("src/model/")) return { kind: "model" };
  if (file.startsWith("src/common/shared/")) return { kind: "shared" };
  if (file.startsWith("src/common/gates/")) return { kind: "gates" };
  if (file.startsWith("src/common/roles/")) {
    const segments = file.split("/");
    return { kind: "role", id: segments[3] ?? "?" };
  }
  if (ENGINE_PREFIXES.some(prefix => file.startsWith(prefix))) return { kind: "engine" };
  return { kind: "other" };
}

const layerKey = (layer: Layer): string => layer.kind === "role" ? `role:${layer.id}` : layer.kind;
const isModuleLayer = (layer: Layer): boolean => layer.kind === "model" || layer.kind === "shared" || layer.kind === "gates" || layer.kind === "role";

function importIsTypeOnly(node: tsAst.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  // TS 7 AST：`import type { ... }` 记录为 ImportClause.phaseModifier === SyntaxKind.TypeKeyword。
  if (clause.phaseModifier === tsAst.SyntaxKind.TypeKeyword) return true;
  const bindings = clause.namedBindings;
  return bindings !== undefined && tsIs.isNamedImports(bindings) && bindings.elements.length > 0
    && bindings.elements.every(element => element.isTypeOnly);
}

function exportIsTypeOnly(node: tsAst.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return clause !== undefined && tsIs.isNamedExports(clause) && clause.elements.length > 0
    && clause.elements.every(element => element.isTypeOnly);
}

function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const parts = from.split("/").slice(0, -1).concat(specifier.split("/"));
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function readEdges(project: ProjectHandle, fileName: string): ScanEdge[] {
  const sourceFile = project.program.getSourceFile(fileName);
  if (!sourceFile) return [];
  const from = sourceFile.fileName.replace(/\\/g, "/").replace(REPO_ROOT + "/", "");
  const edges: ScanEdge[] = [];
  const add = (specifier: string, typeOnly: boolean) => {
    const to = resolveRelative(from, specifier);
    if (to === undefined || !to.startsWith("src/") && !to.startsWith("app/") && !to.startsWith("bin/")) return;
    edges.push({ from, to, typeOnly });
  };
  const visit = (node: tsAst.Node): void => {
    if (tsIs.isImportDeclaration(node) && tsIs.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, importIsTypeOnly(node));
    } else if (tsIs.isExportDeclaration(node) && node.moduleSpecifier && tsIs.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, exportIsTypeOnly(node));
    } else if (tsIs.isImportTypeNode(node) && tsIs.isLiteralTypeNode(node.argument) && tsIs.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, true);
    } else if (tsIs.isCallExpression(node) && node.expression.kind === tsAst.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && tsIs.isStringLiteral(node.arguments[0]!)) {
      add(node.arguments[0]!.text, false);
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return edges;
}

function findCycles(nodes: readonly string[], edges: readonly ScanEdge[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const node of nodes) graph.set(node, []);
  for (const edge of edges) graph.get(edge.from)?.push(edge.to);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string): void => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
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

let handle: { readonly api: tsApi.API; readonly project: ProjectHandle } | undefined;
let cachedReport: ModuleGraphReport | undefined;

function projectHandle(): { readonly api: tsApi.API; readonly project: ProjectHandle } {
  if (handle) return handle;
  const api = new tsApi.API();
  const snapshot = api.updateSnapshot({ openProjects: [REPO_ROOT + "/tsconfig.json"] });
  const project = snapshot.getProjects()[0];
  if (!project) {
    api.close();
    throw new Error("TypeScript Compiler API 未能加载仓内 tsconfig 项目");
  }
  handle = { api, project };
  return handle;
}

after(() => { handle?.api.close(); });

function scanModules(): ModuleGraphReport {
  if (cachedReport) return cachedReport;
  const { project } = projectHandle();
  const files = project.program.getSourceFileNames()
    .map(file => file.replace(/\\/g, "/").replace(REPO_ROOT + "/", ""))
    .filter(file => !file.includes("/node_modules/"))
    .filter(file => file.startsWith("src/") || file.startsWith("app/") || file.startsWith("bin/"))
    .sort();

  const edges: ScanEdge[] = [];
  const layerCounts: Record<string, number> = {};
  for (const file of files) {
    const layer = layerOf(file);
    layerCounts[layerKey(layer)] = (layerCounts[layerKey(layer)] ?? 0) + 1;
    edges.push(...readEdges(project, file));
  }

  const violations: string[] = [];
  const modelToSharedTypeOnly = new Set<string>();
  const modelInternalTypeOnly = new Set<string>();
  for (const edge of edges) {
    const fromLayer = layerOf(edge.from), toLayer = layerOf(edge.to);
    const location = `${edge.from} -> ${edge.to}${edge.typeOnly ? " (type-only)" : ""}`;
    if (fromLayer.kind === "role") {
      if (toLayer.kind === "role" && toLayer.id !== fromLayer.id) violations.push(`role-cross-import: ${location}`);
      if (toLayer.kind === "gates") violations.push(`role-imports-gates: ${location}`);
      if (toLayer.kind === "engine") violations.push(`role-imports-engine: ${location}`);
      if (toLayer.kind === "other") violations.push(`role-imports-other: ${location}`);
    } else if (fromLayer.kind === "gates") {
      if (toLayer.kind === "role") violations.push(`gates-imports-role: ${location}`);
      if (toLayer.kind === "engine") violations.push(`gates-imports-engine: ${location}`);
      if (toLayer.kind === "other") violations.push(`gates-imports-other: ${location}`);
    } else if (fromLayer.kind === "shared") {
      if (toLayer.kind === "gates" || toLayer.kind === "role" || toLayer.kind === "engine") violations.push(`shared-imports-forbidden: ${location}`);
      if (toLayer.kind === "other") violations.push(`shared-imports-other: ${location}`);
    } else if (fromLayer.kind === "model") {
      if (toLayer.kind === "gates" || toLayer.kind === "role" || toLayer.kind === "engine") violations.push(`model-imports-forbidden: ${location}`);
      if (toLayer.kind === "shared") {
        if (!edge.typeOnly) violations.push(`model-value-imports-shared: ${location}`);
        else modelToSharedTypeOnly.add(`${edge.from} -> ${edge.to}`);
      }
      if (toLayer.kind === "model" && edge.typeOnly) modelInternalTypeOnly.add(`${edge.from} -> ${edge.to}`);
    } else if (fromLayer.kind === "engine") {
      if (toLayer.kind === "gates" && edge.to !== "src/common/gates/index.ts") violations.push(`engine-imports-private-gates-file: ${location}`);
      if (toLayer.kind === "role" && edge.to !== `src/common/roles/${toLayer.id}/index.ts`) violations.push(`engine-imports-private-role-file: ${location}`);
    }
  }

  const moduleNodes = files.filter(file => isModuleLayer(layerOf(file)));
  const valueEdges = edges.filter(edge => isModuleLayer(layerOf(edge.from)) && isModuleLayer(layerOf(edge.to)) && !edge.typeOnly);
  const typeEdges = edges.filter(edge => isModuleLayer(layerOf(edge.from)) && isModuleLayer(layerOf(edge.to)) && edge.typeOnly);
  const valueCycles = findCycles(moduleNodes, valueEdges);
  const typeOnlyCycles = findCycles(moduleNodes, typeEdges);

  const gatesRootFiles = fs.readdirSync(path.join(REPO_ROOT, "src/common/gates"), { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => entry.name).sort();
  const rolesRoot = path.join(REPO_ROOT, "src/common/roles");
  const rolesPresent = fs.existsSync(rolesRoot);
  const roleModules = rolesPresent
    ? fs.readdirSync(rolesRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    : [];

  cachedReport = {
    scannedFiles: files.length,
    layerCounts,
    edges,
    violations,
    modelToSharedTypeOnly: [...modelToSharedTypeOnly].sort(),
    modelInternalTypeOnly: [...modelInternalTypeOnly].sort(),
    valueCycles,
    typeOnlyCycles,
    gatesRootFiles,
    roleModules,
    rolesPresent,
  };
  return cachedReport;
}

function summarise(report: ModuleGraphReport): string {
  return JSON.stringify({
    scannedFiles: report.scannedFiles,
    layerCounts: report.layerCounts,
    edges: report.edges.length,
    violations: report.violations,
    valueCycles: report.valueCycles,
    typeOnlyCycles: report.typeOnlyCycles,
    modelToSharedTypeOnly: report.modelToSharedTypeOnly,
    modelInternalTypeOnly: report.modelInternalTypeOnly,
    gatesRootFiles: report.gatesRootFiles,
    roleModules: report.roleModules,
    rolesPresent: report.rolesPresent,
  }, null, 2);
}

test("E1.4：唯一 public entry——gates 与每个角色模块根只允许 index.ts", () => {
  const report = scanModules();
  assert.deepEqual(report.gatesRootFiles, ["index.ts"], "src/common/gates/ 模块根只允许 index.ts");
  for (const roleId of report.roleModules) {
    const rootFiles = fs.readdirSync(path.join(REPO_ROOT, "src/common/roles", roleId), { withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry => entry.name).sort();
    assert.deepEqual(rootFiles, ["index.ts"], `角色模块 src/common/roles/${roleId}/ 根只允许 index.ts`);
  }
  console.log(`module-graph: ${summarise(report)}`);
});

test("E1.5：依赖方向零违例（角色零互引/角色不 import 引擎·门控；门控不 import 角色；共享不 import 门·角色；Model 不反向）", () => {
  const report = scanModules();
  assert.deepEqual(report.violations, [], `依赖方向违例（${report.violations.length} 条）见上`);
});

test("E1.5/E3.5：无环——模块层 value import 无环；type-only 环仅限 Model 内部（D9 口径）", () => {
  const report = scanModules();
  assert.deepEqual(report.valueCycles, [], `模块层 value import 环：${JSON.stringify(report.valueCycles)}`);
  for (const cycle of report.typeOnlyCycles) {
    const kinds = cycle.map(file => layerOf(file).kind);
    assert.ok(kinds.every(kind => kind === "model"),
      `type-only 环只能豁免 Model 内部（D9）；实际：${cycle.join(" -> ")}`);
  }
});

test("D9：Model→shared 仅允许既有 type-only 共享原语单列；禁止 value import 反向；Model 内 type-only 豁免单列", () => {
  const report = scanModules();
  assert.deepEqual(report.modelToSharedTypeOnly, [
    "src/model/download.ts -> src/common/shared/runtime-shared.ts",
    "src/model/runtime.ts -> src/common/shared/diagnostics.ts",
    "src/model/runtime.ts -> src/common/shared/runtime-shared.ts",
  ], "Model→shared 的 type-only 原语清单（新增须接口评审并更新本清单）");
  assert.ok(!report.violations.some(violation => violation.startsWith("model-value-imports-shared")), "无 Model→shared value import");
  assert.ok(report.modelInternalTypeOnly.includes("src/model/role.ts -> src/model/runtime.ts"), "role.ts→runtime.ts type-only 豁免在列");
  assert.ok(report.modelInternalTypeOnly.includes("src/model/runtime.ts -> src/model/role.ts"), "runtime.ts→role.ts type-only 豁免在列");
});

test("E1.4：引擎只经 index.ts 消费角色/门控（无私有文件直引）；扫描输出可复算", () => {
  const report = scanModules();
  const enginePrivate = report.violations.filter(violation => violation.startsWith("engine-imports-private-"));
  assert.deepEqual(enginePrivate, [], "引擎不得直接 import 模块内部文件");
  assert.ok(report.scannedFiles > 0, "扫描文件数非零");
  assert.ok(report.edges.length > 0, "扫描边数非零");
  assert.ok((report.layerCounts.gates ?? 0) >= 1, "gates 模块文件被扫描（当前仅 index.ts）");
});
