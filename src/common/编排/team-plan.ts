// src/common/编排/team-plan.ts
// **团队计划 v2 的单一解析/校验实现**（2026-10-22 角色粒度/MapReduce；策划方案 §5，Q9 推荐 A）。
//
// 纪律：
//   · 单一实现：`run-role.ts` 的卡前守卫与桌面写卡后校验（经 pipeline 公共出口）都消费本模块，
//     不保留第二份 v2 解析；推荐集解析复用 `governance-judge-facts.ts::parseRecommendedRoleIds`。
//   · 确定性：只做结构/覆盖/写集/环/并行组/粒度启发式（V1–V10），**不调用模型**、不做语义判断；
//     语义复核仍归 Convener readiness。V11（flow-plan 一致性）在 flow 已写时做确定性核对。
//   · 兼容：缺省或 `teamPlanSchema: 1` 的旧计划走 v1 分支（只保留既有表格结构检查），不强制新字段。
//   · 旧计划/旧 flow/旧角色卡不重写；本模块只读文本、不写盘。
//
// 行号与字段以实际代码/策划方案正文为准；本模块不新增 cardKind / FlowStepKind / artifact kind。

import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import { isBuiltInGovernanceRoleId } from "../../service/boundary/resolve-boundary.ts";
import { parseRecommendedRoleIds } from "./governance-judge-facts.ts";
import type { FlowState, FlowStateStep } from "./flow-state.ts";

// —————————————————————— 公共类型 ——————————————————————

export const TEAM_PLAN_SCHEMA_LEGACY = 1;
export const TEAM_PLAN_SCHEMA_V2 = 2;

/** 团队计划模块清单行（frontmatter `modules` 的人类可读说明）。 */
export interface TeamPlanModule {
  module: string;
  responsibility: string;
  contract: string;
  architectureSource: string;
}

/** 写集条目（精确路径；目录以 `/` 结尾）。 */
export interface WritesetEntry {
  /** 原始单元格（已去反引号/首尾空白）。 */
  raw: string;
  /** 规范化项目相对路径（反斜杠→`/`、去掉 `./`；目录保留结尾 `/`）。 */
  path: string;
  /** 是否目录（以 `/` 结尾）。 */
  directory: boolean;
}

/** v2 角色表行（顶层字段是清洗后的原始单元格；结构化字段是解析结果）。 */
export interface TeamPlanRoleRow {
  roleId: string;
  /** `new` / `changed` / `existing`（非法值保留原文并由 issues 报告）。 */
  roleType: string;
  /** module 原始单元格（可能是 `a+b` 或 `reduce`）。 */
  module: string;
  /** 拆分后的模块 id（`a+b` → `["a","b"]`；`reduce` → `["reduce"]`）。 */
  modules: string[];
  /** 多模块例外时的第一个模块（主模块）；Reduce 角色为 undefined。 */
  primaryModule?: string;
  duty: string;
  ability: string;
  /** 唯一写集原始单元格。 */
  writeset: string;
  writesets: WritesetEntry[];
  contracts: string[];
  testSurface: string[];
  /** 人类可读依赖说明（`无` 合法）。 */
  deps: string;
  /** dependsOn 原始单元格（`无` 合法；保留原文以便必填检查）。 */
  dependsOnRaw: string;
  dependsOn: string[];
  parallelGroup: string;
  group: string;
  apiSpec: string;
  apiSpecStatus?: "required" | "not-applicable";
  apiSpecReason?: string;
  granularityRationale?: string;
  isReduce: boolean;
  isMap: boolean;
}

export type TeamPlanIssueSeverity = "error" | "warning" | "exception-review";

/** 结构化问题（V1–V10 规则 ID 在 `code`；`severity:"warning"/"exception-review"` 不阻断发卡）。 */
export interface TeamPlanIssue {
  code: string;
  severity: TeamPlanIssueSeverity;
  message: string;
  path?: string;
  roleId?: string;
  module?: string;
}

export interface TeamPlanParseResult {
  ok: boolean;
  /** 缺省/`teamPlanSchema: 1` ⇒ true（只跑既有 v1 表格检查）。 */
  legacy: boolean;
  teamPlanSchema: 1 | 2;
  flowId?: string;
  version?: number;
  riskTier?: string;
  recommended: string[];
  modules: string[];
  moduleList: TeamPlanModule[];
  roleRows: TeamPlanRoleRow[];
  /** 全部问题（error 阻断；warning/exception-review 记录但不阻断发卡）。 */
  issues: TeamPlanIssue[];
}

export interface ParseTeamPlanOptions {
  /** 期望的 flowId（卡片/文件名）；给出时 frontmatter 必须一致。 */
  flowId?: string;
}

// —————————————————————— 基础工具 ——————————————————————

const MODULE_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAP_GROUP_RE = /^map-[a-z][a-z0-9-]*$/;
const RISK_TIER_RE = /^T[0-3]$/;

/** 通用层名黑名单（tripwire，不做语义判断；有 `粒度理由` ⇒ exception-review）。 */
const LAYER_NAME_BLACKLIST: ReadonlySet<string> = new Set([
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "web",
  "webapp",
  "web-app",
  "server",
  "client",
  "ui",
  "fullstack",
  "full-stack",
  "all",
  "common",
  "shared",
  "utils",
  "util",
  "misc",
  "frontend-ui",
  "backend-api",
]);

/** 写集禁止出现的治理/他人角色路径（项目相对路径，规范化后比较）。 */
const GOVERNANCE_WRITESET_ROOTS: readonly string[] = [
  ".ans",
  "docs/scheduling",
  "docs/acceptance",
  "docs/communication",
  "docs/flows",
  "docs/nominations",
  "角色卡",
];

const ROLE_TABLE_COLUMNS = [
  "roleId",
  "type",
  "module",
  "duty",
  "ability",
  "writes",
  "contract",
  "testSurface",
  "deps",
  "dependsOn",
  "parallelGroup",
  "group",
  "apiSpec",
  "granularityRationale",
] as const;
type RoleTableColumn = (typeof ROLE_TABLE_COLUMNS)[number];

const ROLE_TABLE_PATTERNS: Record<RoleTableColumn, RegExp> = {
  roleId: /^(roleid|角色id)$/,
  type: /^(类型|type|roletype)$/,
  module: /^(module|boundedcontext|模块|模块id)$/,
  duty: /^(职责目标|职责|duty|responsibility)$/,
  ability: /^(能力要求|能力|ability|capability)$/,
  writes: /^(唯一写集|写集|边界|writeset|writes|write)$/,
  contract: /^(公开契约|契约|contract|publiccontract)$/,
  testSurface: /^(测试面|testsurface|测试范围|testscope)$/,
  deps: /^(依赖|依赖说明|deps|dependencies)$/,
  dependsOn: /^(dependson|机器依赖)$/,
  parallelGroup: /^(并行组|parallelgroup|parallel)$/,
  group: /^(组别|group|category)$/,
  apiSpec: /^(apispec|接口声明)$/,
  granularityRationale: /^(粒度理由|granularityrationale|granularityreason|granularity)$/,
};

const ROLE_TABLE_LABEL: Record<RoleTableColumn, string> = {
  roleId: "roleId",
  type: "类型",
  module: "module",
  duty: "职责目标",
  ability: "能力要求",
  writes: "唯一写集",
  contract: "公开契约",
  testSurface: "测试面",
  deps: "依赖",
  dependsOn: "dependsOn",
  parallelGroup: "并行组",
  group: "组别",
  apiSpec: "apiSpec",
  granularityRationale: "粒度理由",
};

const MODULE_TABLE_PATTERNS = {
  module: /^(module|模块)$/,
  responsibility: /^(职责|responsibility|purpose)$/,
  contract: /^(公开契约|契约|contract|publiccontract)$/,
  architectureSource: /^(架构来源|架构依据|架构引用|source|architecturesource)$/,
} as const;

function cleanCell(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^[`*_]+/, "")
    .replace(/[`*_]+$/, "")
    .replace(/^[`*_]+/, "")
    .replace(/[`*_]+$/, "")
    .trim();
}

function isEmptyCell(value: string): boolean {
  return value === "" || value === "-" || value === "—" || value === "–";
}

function unquote(value: string): string {
  return value.trim().replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
}

function normalizeHeaderCell(value: string): string {
  return cleanCell(value).replace(/[\s_-]/g, "").toLowerCase();
}

function splitRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function splitListCell(raw: string): string[] {
  return raw
    .split(/[;；]/)
    .map((item) => cleanCell(item))
    .filter((item) => item !== "");
}

function splitIdListCell(raw: string): string[] {
  return raw
    .split(/[,，、;；]/)
    .map((item) => cleanCell(item).replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim())
    .filter((item) => item !== "");
}

function isNoDependencyCell(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "" || value === "无" || value === "无依赖" || value === "none" || value === "[]" || value === "/" || value === "-" || value === "—" || value === "–";
}

// —————————————————————— 写集解析/重叠（V5，可被 V12 复用） ——————————————————————

/** 是否为治理/他人角色路径（写集禁止）。 */
export function isGovernanceWritesetPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  for (const root of GOVERNANCE_WRITESET_ROOTS) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return true;
  }
  return false;
}

/**
 * 解析「唯一写集」单元格：分号分隔的精确路径/目录。
 * 目录以 `/` 结尾；拒绝绝对路径/URL/通配符/省略号/散文/`..`/空段/治理路径。
 * 返回结构化条目与问题文本（问题文本用于 V5 汇总；不抛错）。
 */
export function parseWritesetCell(raw: string): { entries: WritesetEntry[]; issues: string[] } {
  const entries: WritesetEntry[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const partRaw of raw.split(/[;；]/)) {
    const part = cleanCell(partRaw);
    if (part === "") {
      if (raw.trim() !== "") issues.push("写集存在空项（分号之间不得为空）");
      continue;
    }
    if (/\s/.test(part)) {
      issues.push(`写集项「${part}」含空白/散文；写集只接受精确路径或目录`);
      continue;
    }
    if (/[*?[\]{}]/.test(part) || part.includes("...") || part.includes("…")) {
      issues.push(`写集项「${part}」含通配符/省略号；写集只接受精确路径或目录`);
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(part)) {
      issues.push(`写集项「${part}」是 URL；写集只接受项目相对路径`);
      continue;
    }
    let path = part.replace(/\\/g, "/");
    if (path.startsWith("./")) path = path.slice(2);
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
      issues.push(`写集项「${part}」是绝对路径；写集只接受项目相对路径`);
      continue;
    }
    const directory = path.endsWith("/");
    const trimmed = directory ? path.slice(0, -1) : path;
    const segments = trimmed.split("/");
    if (trimmed === "" || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      issues.push(`写集项「${part}」含空段/"./.."；写集只接受精确路径或目录`);
      continue;
    }
    const normalized = directory ? `${trimmed}/` : trimmed;
    if (isGovernanceWritesetPath(normalized)) {
      issues.push(`写集项「${part}」指向治理/他人角色路径（不得写 .ans/docs/scheduling/docs/acceptance/docs/communication/docs/flows/docs/nominations/角色卡）`);
      continue;
    }
    const key = normalized;
    if (seen.has(key)) {
      issues.push(`写集项「${part}」重复出现`);
      continue;
    }
    seen.add(key);
    entries.push({ raw: part, path: normalized, directory });
  }
  return { entries, issues };
}

/** 两个写集条目是否重叠（文件相等、目录前缀、目录包含文件均算重叠）。 */
export function writesetsOverlap(a: WritesetEntry, b: WritesetEntry): boolean {
  const aPath = a.path.replace(/\/+$/, "");
  const bPath = b.path.replace(/\/+$/, "");
  if (a.directory && b.directory) {
    return aPath === bPath || aPath.startsWith(`${bPath}/`) || bPath.startsWith(`${aPath}/`);
  }
  if (a.directory) return bPath === aPath || bPath.startsWith(`${aPath}/`);
  if (b.directory) return aPath === bPath || aPath.startsWith(`${bPath}/`);
  return aPath === bPath;
}

// —————————————————————— frontmatter ——————————————————————

interface Frontmatter {
  raw: string;
  body: string;
}

function splitFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (match === null) return { raw: "", body: normalized };
  return { raw: match[1]!, body: normalized.slice(match[0].length) };
}

function frontmatterValues(frontmatter: string, key: string): string[] {
  const values: string[] = [];
  for (const line of frontmatter.split("\n")) {
    const match = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, "i").exec(line);
    if (match !== null) values.push(match[1]!.trim());
  }
  return values;
}

function frontmatterFirst(frontmatter: string, key: string): string | undefined {
  const values = frontmatterValues(frontmatter, key);
  if (values.length === 0) return undefined;
  return values[0];
}

// —————————————————————— 模块 id 解析 ——————————————————————

export interface ModuleIdParse {
  modules?: string[];
  issues: TeamPlanIssue[];
}

/** 解析 frontmatter `modules:` 内联数组 / 固定行「模块：a、b」（与 recommended 同口径）。 */
export function parseTeamPlanModuleIds(text: string): ModuleIdParse {
  const issues: TeamPlanIssue[] = [];
  const { raw, body } = splitFrontmatter(text);
  const sources: string[][] = [];

  for (const value of frontmatterValues(raw, "modules")) {
    if (value === "") {
      issues.push({
        code: "V1",
        severity: "error",
        path: "modules",
        message: "modules 必须写成同一行内联数组 `modules: [module-a, module-b]`（不接受 YAML 块数组）",
      });
      continue;
    }
    const parsed = parseModuleListValue(value, issues, "modules");
    if (parsed !== undefined) sources.push(parsed);
  }
  for (const line of `${raw}\n${body}`.split("\n")) {
    const match = /^\s*模块\s*[:：]\s*(.*)$/.exec(line);
    if (match !== null) {
      const parsed = parseModuleListValue(match[1]!.trim(), issues, "模块");
      if (parsed !== undefined) sources.push(parsed);
    }
  }

  if (sources.length === 0) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "modules",
      message:
        "缺少唯一的机器可读模块清单（须为 frontmatter 内联数组 `modules: [module-a, module-b]` 或固定行「模块：module-a、module-b」）",
    });
    return { issues };
  }
  const first = sources[0]!;
  for (const other of sources.slice(1)) {
    if (other.length !== first.length || other.some((module, index) => module !== first[index])) {
      issues.push({
        code: "V1",
        severity: "error",
        path: "modules",
        message: "modules 的多个来源不一致（frontmatter 与固定行必须相同）",
      });
      break;
    }
  }
  return { modules: first, issues };
}

function parseModuleListValue(value: string, issues: TeamPlanIssue[], path: string): string[] | undefined {
  const cleaned = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (cleaned === "") return undefined;
  const modules: string[] = [];
  const seen = new Set<string>();
  for (const part of cleaned.split(/[,，、]/)) {
    const module = cleanCell(part).replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
    if (module === "") {
      issues.push({ code: "V1", severity: "error", path, message: "modules 存在空项/歧义" });
      return undefined;
    }
    if (!MODULE_ID_RE.test(module)) {
      issues.push({
        code: "V1",
        severity: "error",
        path,
        module,
        message: `模块 id「${module}」非法；要求 ASCII slug ${MODULE_ID_RE}`,
      });
      return undefined;
    }
    if (module === "reduce") {
      issues.push({
        code: "V1",
        severity: "error",
        path,
        module,
        message: "`reduce` 是保留模块值（仅用于 Reduce 角色），不得出现在 modules 清单",
      });
      return undefined;
    }
    if (seen.has(module)) {
      issues.push({ code: "V1", severity: "error", path, module, message: `modules 重复列出模块「${module}」` });
      return undefined;
    }
    seen.add(module);
    modules.push(module);
  }
  return modules.length > 0 ? modules : undefined;
}

// —————————————————————— Markdown 表格 ——————————————————————

interface ParsedTable {
  header: string[];
  rows: string[][];
  headerIndex: number;
}

function findTableAfterHeading(
  lines: readonly string[],
  headingPattern: RegExp,
): ParsedTable | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    if (!headingPattern.test(lines[index]!)) continue;
    // 找到标题后的第一张表（遇到下一个标题则放弃：该章节没有表）。
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]!;
      if (/^\s{0,3}#{1,6}\s+/.test(line)) break;
      const cells = splitRow(line);
      if (cells === undefined) continue;
      const table = collectTable(lines, cursor);
      if (table !== undefined) return table;
    }
  }
  return undefined;
}

function collectTable(lines: readonly string[], headerIndex: number): ParsedTable | undefined {
  const header = splitRow(lines[headerIndex]!);
  if (header === undefined) return undefined;
  const rows: string[][] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitRow(lines[index]!);
    if (cells === undefined) break;
    if (isSeparatorRow(cells)) continue;
    rows.push(cells);
  }
  if (rows.length === 0) {
    // 允许只有表头的表（后续按集合缺失报错）；但要确认下一行是分隔行，避免把散文当表。
    const next = splitRow(lines[headerIndex + 1] ?? "");
    if (next === undefined || !isSeparatorRow(next)) return undefined;
  }
  return { header, rows, headerIndex };
}

function findRoleTable(lines: readonly string[]): ParsedTable | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitRow(lines[index]!);
    if (cells === undefined) continue;
    if (cells.some((cell) => ROLE_TABLE_PATTERNS.roleId.test(normalizeHeaderCell(cell)))) {
      return collectTable(lines, index);
    }
  }
  return undefined;
}

// —————————————————————— 角色行解析 ——————————————————————

function splitModuleCell(raw: string): string[] {
  return raw
    .split(/[+＋]/)
    .map((part) => cleanCell(part))
    .filter((part) => part !== "");
}

function apiSpecOf(raw: string): { status?: "required" | "not-applicable"; reason?: string; issue?: string } {
  const match = /^(required|not-applicable)\b\s*([\s\S]*)$/i.exec(raw.trim());
  if (match === null) return { issue: `apiSpec 必须是 required 或 not-applicable（+ 理由）；当前「${raw}」` };
  const status = match[1]!.toLowerCase() as "required" | "not-applicable";
  const reason = match[2]!
    .trim()
    .replace(/^[\s（(：:—–\-,，;；]+/, "")
    .replace(/[\s）)]+$/, "")
    .trim();
  if (status === "not-applicable" && reason === "") {
    return { status, issue: "apiSpec=not-applicable 必须附非空理由" };
  }
  return reason === "" ? { status } : { status, reason };
}

function parseRoleRow(cells: readonly string[], columnOf: Map<RoleTableColumn, number>): TeamPlanRoleRow {
  const cell = (column: RoleTableColumn): string => cleanCell(cells[columnOf.get(column) ?? -1] ?? "");
  const module = cell("module");
  const modules = splitModuleCell(module);
  const isReduce = modules.length === 1 && modules[0] === "reduce";
  const granularity = cell("granularityRationale");
  const apiSpec = cell("apiSpec");
  const parsedApiSpec = apiSpecOf(apiSpec);
  const rawDependsOn = cell("dependsOn");
  const writeset = cell("writes");
  return {
    roleId: cell("roleId"),
    roleType: cell("type"),
    module,
    modules,
    ...(modules.length > 0 && !isReduce ? { primaryModule: modules[0] } : {}),
    duty: cell("duty"),
    ability: cell("ability"),
    writeset,
    writesets: parseWritesetCell(writeset).entries,
    contracts: splitListCell(cell("contract")),
    testSurface: splitListCell(cell("testSurface")),
    deps: cell("deps"),
    dependsOnRaw: rawDependsOn,
    dependsOn: isNoDependencyCell(rawDependsOn) ? [] : splitIdListCell(rawDependsOn),
    parallelGroup: cell("parallelGroup"),
    group: cell("group"),
    apiSpec,
    ...(parsedApiSpec.status !== undefined ? { apiSpecStatus: parsedApiSpec.status } : {}),
    ...(parsedApiSpec.reason !== undefined ? { apiSpecReason: parsedApiSpec.reason } : {}),
    ...(isEmptyCell(granularity) ? {} : { granularityRationale: granularity }),
    isReduce,
    isMap: modules.length > 0 && !isReduce,
  };
}

// —————————————————————— 解析入口 ——————————————————————

/**
 * 解析并校验团队计划文本。
 *
 * - `teamPlanSchema` 缺省/`1` ⇒ legacy：只跑既有 v1 表格结构检查（推荐角色四列非空）；
 * - `teamPlanSchema: 2` ⇒ V1–V10（确定性；不调用模型）；
 * - 返回值 `ok=false` 时 `issues` 的 `severity:"error"` 条目是阻断原因；
 *   `warning`（单文件/极小写集）与 `exception-review`（整层名/多模块有理由）不阻断发卡。
 */
export function parseTeamPlan(text: string, options: ParseTeamPlanOptions = {}): TeamPlanParseResult {
  const source = typeof text === "string" ? text : "";
  const { raw: frontmatter, body } = splitFrontmatter(source);
  const lines = body.split("\n");
  const issues: TeamPlanIssue[] = [];

  const flowIdRaw = frontmatterFirst(frontmatter, "flowId");
  const flowId = flowIdRaw !== undefined ? unquote(flowIdRaw) : undefined;
  const versionRaw = frontmatterFirst(frontmatter, "version");
  const version = versionRaw !== undefined && /^\d+$/.test(unquote(versionRaw)) ? Number(unquote(versionRaw)) : undefined;
  const riskTier = frontmatterFirst(frontmatter, "riskTier") !== undefined
    ? unquote(frontmatterFirst(frontmatter, "riskTier")!)
    : undefined;
  const schemaRaw = frontmatterFirst(frontmatter, "teamPlanSchema");
  const schemaValue = schemaRaw !== undefined ? unquote(schemaRaw) : undefined;
  const teamPlanSchema: 1 | 2 = schemaValue === "2" ? 2 : 1;
  const legacy = teamPlanSchema === 1;

  if (schemaValue !== undefined && schemaValue !== "1" && schemaValue !== "2") {
    issues.push({
      code: "V1",
      severity: "error",
      path: "teamPlanSchema",
      message: `teamPlanSchema 只能是 1（legacy）或 2；当前「${schemaValue}」`,
    });
  }

  const recommended = parseRecommendedRoleIds(source) ?? [];

  if (legacy) {
    // v1：保留既有行为——只检查角色表结构 + 推荐角色四列非空（缺模块/契约/测试面等不强制）。
    const legacyIssues = legacyTeamPlanRoleRowIssues(source, recommended);
    for (const message of legacyIssues) {
      issues.push({ code: "V2", severity: "error", message });
    }
    return {
      ok: !issues.some((issue) => issue.severity === "error"),
      legacy: true,
      teamPlanSchema: 1,
      ...(flowId !== undefined ? { flowId } : {}),
      ...(version !== undefined ? { version } : {}),
      ...(riskTier !== undefined ? { riskTier } : {}),
      recommended,
      modules: [],
      moduleList: [],
      roleRows: [],
      issues,
    };
  }

  // ——————— V1：frontmatter ———————
  if (flowId === undefined || flowId === "") {
    issues.push({ code: "V1", severity: "error", path: "flowId", message: "团队计划缺少 frontmatter flowId" });
  } else if (options.flowId !== undefined && flowId !== options.flowId) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "flowId",
      message: `团队计划 flowId="${flowId}" 与卡片 flowId="${options.flowId}" 不一致`,
    });
  }
  if (version === undefined || !Number.isInteger(version) || version < 1) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "version",
      message: `version 必须是正整数（当前 ${JSON.stringify(versionRaw ?? null)}）`,
    });
  }
  if (riskTier === undefined || !RISK_TIER_RE.test(riskTier)) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "riskTier",
      message: `riskTier 必须是 T0–T3（当前 ${JSON.stringify(riskTier ?? null)}）`,
    });
  }
  if (recommended.length === 0) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "recommended",
      message:
        "缺少唯一的机器可读推荐集（须为 frontmatter 内联数组 `recommended: [role-a, role-b]` 或固定行「推荐：role-a、role-b」；空集/重复/歧义不接受）",
    });
  }
  const builtInRecommended = recommended.filter((id) => isBuiltInGovernanceRoleId(id));
  if (builtInRecommended.length > 0) {
    issues.push({
      code: "V1",
      severity: "error",
      path: "recommended",
      message: `推荐集含内置治理角色（${builtInRecommended.join("、")}）；任命卡只能任命项目角色`,
    });
  }
  const moduleIds = parseTeamPlanModuleIds(source);
  issues.push(...moduleIds.issues);
  const modules = moduleIds.modules ?? [];

  // ——————— V2：角色表列 ———————
  const roleTable = findRoleTable(lines);
  const columnOf = new Map<RoleTableColumn, number>();
  const roleRows: TeamPlanRoleRow[] = [];
  if (roleTable === undefined) {
    issues.push({
      code: "V2",
      severity: "error",
      message:
        "团队计划缺少角色表（v2 表头须含 roleId/类型/module/职责目标/能力要求/唯一写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由）",
    });
  } else {
    const header = roleTable.header.map(normalizeHeaderCell);
    for (const column of ROLE_TABLE_COLUMNS) {
      const indexes = header
        .map((cell, index) => (ROLE_TABLE_PATTERNS[column].test(cell) ? index : -1))
        .filter((index) => index !== -1);
      if (indexes.length > 1) {
        issues.push({
          code: "V2",
          severity: "error",
          path: `roles.header.${column}`,
          message: `团队计划角色表列「${ROLE_TABLE_LABEL[column]}」重复/歧义（第 ${indexes.map((index) => index + 1).join("、")} 列）`,
        });
      } else if (indexes.length === 1) {
        columnOf.set(column, indexes[0]!);
      }
    }
    const missing = ROLE_TABLE_COLUMNS.filter((column) => !columnOf.has(column) && !issues.some(
      (issue) => issue.path === `roles.header.${column}`,
    ));
    if (missing.length > 0) {
      issues.push({
        code: "V2",
        severity: "error",
        message: `团队计划角色表缺少必需列（${missing.map((column) => ROLE_TABLE_LABEL[column]).join("/")}）`,
      });
    }
    for (const cells of roleTable.rows) {
      if (cells.every((cell) => isSeparatorRow([cell]))) continue;
      const roleId = cleanCell(cells[columnOf.get("roleId") ?? -1] ?? "");
      if (roleId === "") continue;
      roleRows.push(parseRoleRow(cells, columnOf));
    }
  }

  // ——————— V3：类型/推荐角色行/必填单元格/apiSpec ———————
  const rowsById = new Map<string, TeamPlanRoleRow[]>();
  const seenRoleIds = new Set<string>();
  for (const row of roleRows) {
    const list = rowsById.get(row.roleId) ?? [];
    list.push(row);
    rowsById.set(row.roleId, list);
    if (!seenRoleIds.has(row.roleId)) seenRoleIds.add(row.roleId);
  }
  for (const [roleId, rows] of rowsById) {
    if (rows.length > 1) {
      issues.push({
        code: "V3",
        severity: "error",
        roleId,
        message: `团队计划角色 ${roleId} 出现 ${rows.length} 行（角色行不得重复）`,
      });
    }
  }
  for (const id of recommended) {
    const rows = rowsById.get(id) ?? [];
    if (rows.length === 0) {
      issues.push({
        code: "V3",
        severity: "error",
        roleId: id,
        message: `团队计划缺少推荐角色 ${id} 的角色行`,
      });
    }
  }
  const requiredCells: Array<[string, keyof TeamPlanRoleRow]> = [
    ["module", "module"],
    ["职责目标", "duty"],
    ["能力要求", "ability"],
    ["唯一写集", "writeset"],
    ["公开契约", "contracts"],
    ["测试面", "testSurface"],
    ["依赖", "deps"],
    ["并行组", "parallelGroup"],
    ["组别", "group"],
    ["apiSpec", "apiSpec"],
  ];
  for (const row of roleRows) {
    if (!["new", "changed", "existing"].includes(row.roleType)) {
      issues.push({
        code: "V3",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的类型必须是 new/changed/existing（当前「${row.roleType}」）`,
      });
    }
    for (const [label, field] of requiredCells) {
      const value = row[field];
      const empty = Array.isArray(value) ? value.length === 0 : isEmptyCell(String(value ?? ""));
      if (empty) {
        issues.push({
          code: "V3",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的「${label}」为空`,
        });
      }
    }
    if (isEmptyCell(row.dependsOnRaw)) {
      issues.push({
        code: "V3",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的「dependsOn」为空（无依赖请写「无」）`,
      });
    }
    const apiSpec = apiSpecOf(row.apiSpec);
    if (apiSpec.issue !== undefined) {
      issues.push({ code: "V3", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId} ${apiSpec.issue}` });
    }
    if (row.writeset !== "" && row.writesets.length === 0) {
      issues.push({
        code: "V5",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的写集没有任何合法条目`,
      });
    }
    for (const issue of parseWritesetCell(row.writeset).issues) {
      issues.push({ code: "V5", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId}：${issue}` });
    }
    for (const contract of row.contracts) {
      if (/^internal\b/i.test(contract)) {
        const reason = contract.replace(/^internal\b/i, "").replace(/^[\s（(：:—–\-,，;；]+/, "").replace(/[\s）)]+$/, "").trim();
        if (reason === "") {
          issues.push({
            code: "V6",
            severity: "error",
            roleId: row.roleId,
            message: `团队计划角色 ${row.roleId} 的公开契约 internal 必须附非空理由`,
          });
        }
      }
    }
    if (row.testSurface.length === 0) {
      issues.push({ code: "V6", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId} 的测试面为空` });
    } else if (row.isMap && !row.testSurface.some(looksLikeTestPath)) {
      issues.push({
        code: "V6",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划 Map 角色 ${row.roleId} 的测试面至少需要一个测试路径（如 test/<module>/）`,
      });
    } else if (row.isReduce && !row.testSurface.some(looksLikeReduceTestSurface)) {
      issues.push({
        code: "V6",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划 Reduce 角色 ${row.roleId} 的测试面至少需要集成/e2e/装配检查之一`,
      });
    }
  }

  // ——————— V4：模块清单与模块覆盖 ———————
  const moduleList = parseModuleList(lines, issues);
  const listedModules = new Set(moduleList.map((row) => row.module));
  const declaredModules = new Set(modules);
  for (const module of modules) {
    if (!listedModules.has(module)) {
      issues.push({ code: "V4", severity: "error", module, message: `模块清单缺少模块「${module}」` });
    }
  }
  for (const row of moduleList) {
    if (!declaredModules.has(row.module)) {
      issues.push({ code: "V4", severity: "error", module: row.module, message: `模块清单含未声明模块「${row.module}」（不在 frontmatter modules）` });
    }
  }
  const coverage = new Map<string, string[]>();
  for (const row of roleRows) {
    if (row.modules.length === 0) continue;
    if (row.modules.includes("reduce") && row.modules.length > 1) {
      issues.push({
        code: "V4",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的 module 不得把保留值 reduce 与其他模块混写`,
      });
    }
    if (row.isReduce) continue;
    for (const module of row.modules) {
      if (module === "reduce") continue;
      if (!declaredModules.has(module)) {
        issues.push({
          code: "V4",
          severity: "error",
          roleId: row.roleId,
          module,
          message: `团队计划角色 ${row.roleId} 声明了未声明的模块「${module}」`,
        });
        continue;
      }
      const owners = coverage.get(module) ?? [];
      owners.push(row.roleId);
      coverage.set(module, owners);
    }
  }
  for (const module of modules) {
    const owners = coverage.get(module) ?? [];
    if (owners.length === 0) {
      issues.push({ code: "V4", severity: "error", module, message: `模块「${module}」没有 Map 角色覆盖（孤儿模块）` });
    } else if (owners.length > 1) {
      issues.push({
        code: "V4",
        severity: "error",
        module,
        message: `模块「${module}」被多个 Map 角色覆盖（${owners.join("、")}）`,
      });
    }
  }
  if (!roleRows.some((row) => row.isReduce)) {
    issues.push({
      code: "V8",
      severity: "error",
      message: "团队计划至少需要一个 Reduce 角色（module: reduce、并行组: reduce；不新增固定角色）",
    });
  }

  // ——————— V7：dependsOn 目标/自依赖/重复/环 ———————
  for (const row of roleRows) {
    const seen = new Set<string>();
    for (const target of row.dependsOn) {
      if (target === row.roleId) {
        issues.push({ code: "V7", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId} 不能依赖自己` });
      }
      if (seen.has(target)) {
        issues.push({
          code: "V7",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的 dependsOn 重复列出角色「${target}」`,
        });
      }
      seen.add(target);
      if (!rowsById.has(target)) {
        issues.push({
          code: "V7",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的 dependsOn 指向不存在的角色「${target}」`,
        });
      }
    }
  }
  const cycles = detectRoleCycles(roleRows);
  for (const cycle of cycles) {
    issues.push({
      code: "V7",
      severity: "error",
      message: `团队计划 dependsOn 形成环：${cycle.join(" → ")}`,
    });
  }

  // ——————— V8：并行组规则 ———————
  const reachableFrom = buildReachability(roleRows);
  const mapRows = roleRows.filter((row) => row.isMap);
  const reduceRows = roleRows.filter((row) => row.isReduce);
  for (const row of roleRows) {
    if (row.parallelGroup === "") continue;
    if (!MAP_GROUP_RE.test(row.parallelGroup) && row.parallelGroup !== "reduce") {
      issues.push({
        code: "V8",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的并行组「${row.parallelGroup}」非法；只能是 map-<slug> 或 reduce`,
      });
      continue;
    }
    if (row.isMap && row.parallelGroup === "reduce") {
      issues.push({
        code: "V8",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 拥有产品模块，必须使用 map-* 并行组（不得为 reduce）`,
      });
    }
    if (row.isReduce && row.parallelGroup !== "reduce") {
      issues.push({
        code: "V8",
        severity: "error",
        roleId: row.roleId,
        message: `团队计划 Reduce 角色 ${row.roleId} 的并行组必须是 reduce`,
      });
    }
  }
  const mapGroups = new Map<string, TeamPlanRoleRow[]>();
  for (const row of roleRows) {
    if (!row.isMap || !MAP_GROUP_RE.test(row.parallelGroup)) continue;
    const list = mapGroups.get(row.parallelGroup) ?? [];
    list.push(row);
    mapGroups.set(row.parallelGroup, list);
  }
  for (const [group, rows] of mapGroups) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (reachableFrom(a.roleId).has(b.roleId) || reachableFrom(b.roleId).has(a.roleId)) {
          issues.push({
            code: "V8",
            severity: "error",
            roleId: a.roleId,
            message: `同一 ${group} 组内的角色 ${a.roleId} 与 ${b.roleId} 之间存在依赖路径（同组必须互相独立）`,
          });
        }
      }
    }
  }
  for (const row of mapRows) {
    const reachable = reachableFrom(row.roleId);
    for (const reduceRow of reduceRows) {
      if (reachable.has(reduceRow.roleId)) {
        issues.push({
          code: "V8",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划 Map 角色 ${row.roleId} 不得依赖 Reduce 角色 ${reduceRow.roleId}`,
        });
      }
    }
  }
  for (const reduceRow of reduceRows) {
    const reachable = reachableFrom(reduceRow.roleId);
    const missing = mapRows.filter((row) => !reachable.has(row.roleId));
    if (missing.length > 0) {
      issues.push({
        code: "V8",
        severity: "error",
        roleId: reduceRow.roleId,
        message:
          `团队计划 Reduce 角色 ${reduceRow.roleId} 的 dependsOn 未直接或传递覆盖全部 Map 角色` +
          `（缺：${missing.map((row) => row.roleId).join("、")}）`,
      });
    }
  }

  // ——————— V5：跨角色写集两两不相交 ———————
  for (let i = 0; i < roleRows.length; i += 1) {
    for (let j = i + 1; j < roleRows.length; j += 1) {
      const a = roleRows[i]!;
      const b = roleRows[j]!;
      let reported = false;
      for (const left of a.writesets) {
        for (const right of b.writesets) {
          if (!writesetsOverlap(left, right)) continue;
          issues.push({
            code: "V5",
            severity: "error",
            roleId: a.roleId,
            message:
              `团队计划角色 ${a.roleId} 与 ${b.roleId} 的写集重叠：` +
              `「${left.path}」与「${right.path}」（跨角色写集必须两两不相交）`,
          });
          reported = true;
        }
        if (reported) break;
      }
    }
  }

  // ——————— V9：粒度启发式 + V10 五维章节 ———————
  for (const row of roleRows) {
    if (row.isReduce) continue;
    const rationale = row.granularityRationale;
    for (const module of row.modules) {
      if (!LAYER_NAME_BLACKLIST.has(module.toLowerCase())) continue;
      if (rationale === undefined) {
        issues.push({
          code: "V9",
          severity: "error",
          roleId: row.roleId,
          module,
          message: `团队计划角色 ${row.roleId} 的模块「${module}」是通用层名且未写「粒度理由」（硬拒；有理由才交 readiness 例外复核）`,
        });
      } else {
        issues.push({
          code: "V9",
          severity: "exception-review",
          roleId: row.roleId,
          module,
          message: `团队计划角色 ${row.roleId} 的模块「${module}」命中通用层名黑名单，已写粒度理由；交 Convener readiness 例外复核`,
        });
      }
    }
    if (row.modules.length > 1) {
      if (rationale === undefined) {
        issues.push({
          code: "V9",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 覆盖多个模块（${row.modules.join("+")}）但未写「粒度理由」（硬拒）`,
        });
      } else {
        issues.push({
          code: "V9",
          severity: "exception-review",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 覆盖多个模块（${row.modules.join("+")}），已写粒度理由；交 Convener readiness 例外复核（主模块 ${row.primaryModule ?? "?"}）`,
        });
      }
    }
    if (row.writesets.length === 1 && !row.writesets[0]!.directory) {
      issues.push({
        code: "V9",
        severity: "warning",
        roleId: row.roleId,
        message: `团队计划角色 ${row.roleId} 的写集只有单个文件「${row.writesets[0]!.path}」；交 readiness 判断是否纳米角色（warning，不硬拒）`,
      });
    }
  }
  checkCoordinationSection(body, issues);

  const ok = !issues.some((issue) => issue.severity === "error");
  return {
    ok,
    legacy: false,
    teamPlanSchema: 2,
    ...(flowId !== undefined && flowId !== "" ? { flowId } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(riskTier !== undefined ? { riskTier } : {}),
    recommended,
    modules,
    moduleList,
    roleRows,
    issues,
  };
}

function looksLikeTestPath(value: string): boolean {
  const cleaned = cleanCell(value);
  if (cleaned === "" || /\s/.test(cleaned)) return false;
  return cleaned.includes("/") || cleaned.includes("\\") || /\.(?:ts|tsx|js|mjs|cjs|py)$/i.test(cleaned);
}

function looksLikeReduceTestSurface(value: string): boolean {
  const cleaned = cleanCell(value);
  if (/(集成|integration|e2e|端到端|装配|assembly|manifest|证据|test\/测试|test\/e2e|test\/integration)/i.test(cleaned)) {
    return true;
  }
  return false;
}

function parseModuleList(lines: readonly string[], issues: TeamPlanIssue[]): TeamPlanModule[] {
  const table = findTableAfterHeading(
    lines,
    /^\s{0,3}#{1,6}\s*(?:[0-9]+[.、]?\s*)?(?:模块清单|模块列表|module\s*list)/i,
  );
  if (table === undefined) {
    issues.push({
      code: "V4",
      severity: "error",
      message: "团队计划缺少「模块清单」表（表头 module/职责/公开契约/架构来源）",
    });
    return [];
  }
  const header = table.header.map(normalizeHeaderCell);
  const columnOf: Partial<Record<keyof typeof MODULE_TABLE_PATTERNS, number>> = {};
  for (const key of Object.keys(MODULE_TABLE_PATTERNS) as Array<keyof typeof MODULE_TABLE_PATTERNS>) {
    const index = header.findIndex((cell) => MODULE_TABLE_PATTERNS[key].test(cell));
    if (index !== -1) columnOf[key] = index;
  }
  const missing = (Object.keys(MODULE_TABLE_PATTERNS) as Array<keyof typeof MODULE_TABLE_PATTERNS>).filter(
    (key) => columnOf[key] === undefined,
  );
  if (missing.length > 0) {
    issues.push({
      code: "V4",
      severity: "error",
      message: `模块清单表缺少必需列（${missing.join("/")}）`,
    });
  }
  const rows: TeamPlanModule[] = [];
  const seen = new Set<string>();
  for (const cells of table.rows) {
    const module = cleanCell(cells[columnOf.module ?? -1] ?? "");
    if (module === "") continue;
    if (seen.has(module)) {
      issues.push({ code: "V4", severity: "error", module, message: `模块清单重复列出模块「${module}」` });
      continue;
    }
    seen.add(module);
    const responsibility = cleanCell(cells[columnOf.responsibility ?? -1] ?? "");
    const contract = cleanCell(cells[columnOf.contract ?? -1] ?? "");
    const architectureSource = cleanCell(cells[columnOf.architectureSource ?? -1] ?? "");
    if (isEmptyCell(responsibility)) {
      issues.push({ code: "V4", severity: "error", module, message: `模块清单「${module}」的职责为空` });
    }
    if (isEmptyCell(contract)) {
      issues.push({ code: "V4", severity: "error", module, message: `模块清单「${module}」的公开契约为空` });
    }
    if (isEmptyCell(architectureSource)) {
      issues.push({ code: "V4", severity: "error", module, message: `模块清单「${module}」的架构来源为空` });
    } else if (!isTraceableArchitectureSource(architectureSource)) {
      issues.push({
        code: "V4",
        severity: "error",
        module,
        message: `模块清单「${module}」的架构来源「${architectureSource}」不是可追溯引用（须引用方案/架构文档路径或章节）`,
      });
    }
    rows.push({ module, responsibility, contract, architectureSource });
  }
  return rows;
}

function isTraceableArchitectureSource(value: string): boolean {
  return /(?:docs\/|角色卡\/|§|第[一二三四五六七八九十0-9]+[章节]|\.md\b|https?:\/\/)/.test(value);
}

function checkCoordinationSection(body: string, issues: TeamPlanIssue[]): void {
  const lines = body.split("\n");
  let headingIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!/^\s{0,3}#{1,6}\s+/.test(line)) continue;
    if (/(五维|协调成本)/.test(line)) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex === -1) {
    issues.push({
      code: "V10",
      severity: "error",
      message: "团队计划缺少「五维判断/协调成本」章节（确定性存在性检查）",
    });
    return;
  }
  let substantive = "";
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s{0,3}#{1,6}\s+/.test(line)) break;
    substantive += line.trim();
  }
  if (substantive.replace(/[|\-\s]/g, "").length < 10) {
    issues.push({
      code: "V10",
      severity: "error",
      message: "团队计划「五维判断/协调成本」章节为空（须写出责任独立性/范围归属/契约影响/证据独立性/协调成本）",
    });
  }
}

// —————————————————————— 依赖图 ——————————————————————

function detectRoleCycles(rows: readonly TeamPlanRoleRow[]): string[][] {
  const byId = new Map(rows.map((row) => [row.roleId, row]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        cycles.push(cycle);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const target of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(target)) visit(target);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const row of rows) visit(row.roleId);
  return cycles;
}

function buildReachability(rows: readonly TeamPlanRoleRow[]): (id: string) => Set<string> {
  const byId = new Map(rows.map((row) => [row.roleId, row]));
  const cache = new Map<string, Set<string>>();
  const collect = (id: string): Set<string> => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const result = new Set<string>();
    cache.set(id, result); // 防御环：先占位再填充
    for (const target of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(target)) continue;
      result.add(target);
      for (const deep of collect(target)) result.add(deep);
    }
    return result;
  };
  return (id: string) => {
    if (!cache.has(id)) collect(id);
    return cache.get(id) ?? new Set<string>();
  };
}

// —————————————————————— V11：flow-plan 一致性 ——————————————————————

function flowStepMap(flow: FlowState): Map<string, FlowStateStep> {
  return new Map(flow.steps.map((step) => [step.id, step]));
}

function flowReachable(steps: Map<string, FlowStateStep>, fromId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === targetId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    for (const dep of steps.get(id)?.dependsOn ?? []) {
      if (visit(dep)) return true;
    }
    return false;
  };
  return visit(fromId);
}

/**
 * V11：flow 已写时的计划-流程一致性（确定性）：
 *   · 每个 Map 角色的交付步骤 id = `delivery-<主模块>`，owner=roleId、parallelGroup=计划组，
 *     dependsOn 精确等于 `{contract-freeze} ∪ 依赖角色的 delivery-*`；
 *   · `contract-freeze` 存在且被每个 Map 交付直接/传递依赖；
 *   · 每个 Reduce 步骤（dispatch/artifact，验收除外）直接/传递依赖全部 Map 交付。
 * 不改变任何派发权；只返回问题列表（空 = 一致）。
 */
export function validateTeamPlanFlowConsistency(
  plan: TeamPlanParseResult,
  flow: FlowState,
): TeamPlanIssue[] {
  if (plan.legacy || !plan.ok) return [];
  const issues: TeamPlanIssue[] = [];
  const steps = flowStepMap(flow);
  const mapRows = plan.roleRows.filter((row) => row.isMap && row.primaryModule !== undefined);
  const mapDeliveryIds: string[] = [];

  if (mapRows.length > 0 && !steps.has("contract-freeze")) {
    issues.push({
      code: "V11",
      severity: "error",
      path: "steps.contract-freeze",
      message: "V11：新契约 flow 缺少 contract-freeze 步骤（Map 交付必须先冻结契约）",
    });
  }

  for (const row of mapRows) {
    const deliveryId = `delivery-${row.primaryModule}`;
    mapDeliveryIds.push(deliveryId);
    const step = steps.get(deliveryId);
    if (step === undefined || step.status === "superseded") {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        module: row.primaryModule,
        message: `V11：flow 缺少 Map 角色 ${row.roleId} 的交付步骤 ${deliveryId}`,
      });
      continue;
    }
    if (step.owner !== row.roleId) {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        path: `steps.${deliveryId}.owner`,
        message: `V11：步骤 ${deliveryId} 的 owner=${step.owner}，应为角色 ${row.roleId}`,
      });
    }
    if (step.parallelGroup !== row.parallelGroup) {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        path: `steps.${deliveryId}.parallelGroup`,
        message: `V11：步骤 ${deliveryId} 的 parallelGroup=${String(step.parallelGroup)}，应为 ${row.parallelGroup}`,
      });
    }
    const expected = new Set<string>(["contract-freeze"]);
    for (const dependency of row.dependsOn) {
      const dependencyRow = plan.roleRows.find((candidate) => candidate.roleId === dependency);
      if (dependencyRow?.isMap && dependencyRow.primaryModule !== undefined) {
        expected.add(`delivery-${dependencyRow.primaryModule}`);
      }
    }
    const actual = new Set(step.dependsOn ?? []);
    const missing = [...expected].filter((id) => !actual.has(id));
    const extra = [...actual].filter((id) => !expected.has(id));
    if (missing.length > 0 || extra.length > 0) {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        path: `steps.${deliveryId}.dependsOn`,
        message:
          `V11：步骤 ${deliveryId} 的 dependsOn 必须精确等于 {contract-freeze} ∪ 依赖角色的 delivery-*；` +
          `缺：${missing.length > 0 ? missing.join("、") : "无"}；多：${extra.length > 0 ? extra.join("、") : "无"}`,
      });
    }
    if (!flowReachable(steps, deliveryId, "contract-freeze")) {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        path: `steps.${deliveryId}.dependsOn`,
        message: `V11：Map 交付 ${deliveryId} 必须（直接或传递）依赖 contract-freeze`,
      });
    }
  }

  if (mapRows.length > 0) {
    const reduceSteps = flow.steps.filter(
      (step) =>
        step.status !== "superseded" &&
        step.parallelGroup === "reduce" &&
        (step.kind === "dispatch" || step.kind === "artifact"),
    );
    if (reduceSteps.length === 0) {
      issues.push({
        code: "V11",
        severity: "error",
        path: "steps",
        message: "V11：flow 缺少 Reduce 步骤（parallelGroup: reduce，kind dispatch/artifact；验收步骤除外）",
      });
    }
    for (const step of reduceSteps) {
      const missing = mapDeliveryIds.filter((id) => !flowReachable(steps, step.id, id));
      if (missing.length > 0) {
        issues.push({
          code: "V11",
          severity: "error",
          path: `steps.${step.id}.dependsOn`,
          message: `V11：Reduce 步骤 ${step.id} 必须直接或传递依赖全部 Map 交付（缺：${missing.join("、")}）`,
        });
      }
    }
  }

  return issues;
}

// —————————————————————— v1 legacy 分支 ——————————————————————

/**
 * v1 角色表检查（**逐字保留** 2026-10-22 第 1 项既有行为）：
 * 表头含 roleId 与 职责目标/能力要求/写集/依赖 列；每个推荐角色有一行且四列非空。
 * 不做模块/契约/测试面/并行组/写集重叠/环检查；不强制新字段。
 */
export function legacyTeamPlanRoleRowIssues(
  text: string,
  recommended: readonly string[],
): string[] {
  const issues: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const clean = (cell: string): string => cell.replace(/^[`*_]+/, "").replace(/[`*_]+$/, "").trim();

  let headerIndex = -1;
  let header: string[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitRow(lines[index]!);
    if (cells === undefined) continue;
    if (cells.some((cell) => /^(roleId|role-id|角色id|角色 id)$/i.test(clean(cell)))) {
      headerIndex = index;
      header = cells.map(clean);
      break;
    }
  }
  if (headerIndex === -1 || header === undefined) {
    return ["团队计划缺少角色表（表头须含 roleId 与 职责目标/能力要求/写集/依赖 列）"];
  }
  const columnOf = (pattern: RegExp): number => header!.findIndex((cell) => pattern.test(cell));
  const roleColumn = columnOf(/^(roleId|role-id|角色id|角色 id)$/i);
  const dutyColumn = columnOf(/职责/);
  const abilityColumn = columnOf(/能力/);
  const writesColumn = columnOf(/写集|边界/);
  const depsColumn = columnOf(/依赖/);
  if (dutyColumn === -1 || abilityColumn === -1 || writesColumn === -1 || depsColumn === -1) {
    return ["团队计划角色表缺少必需列（职责目标/能力要求/写集/依赖）"];
  }

  const rows = new Map<string, string[]>();
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitRow(lines[index]!);
    if (cells === undefined) break;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))) continue;
    const roleId = clean(cells[roleColumn] ?? "");
    if (roleId === "") continue;
    if (!rows.has(roleId)) rows.set(roleId, cells);
  }

  const columns: Array<[string, number]> = [
    ["职责目标", dutyColumn],
    ["能力要求", abilityColumn],
    ["写集", writesColumn],
    ["依赖", depsColumn],
  ];
  for (const roleId of recommended) {
    const row = rows.get(roleId);
    if (row === undefined) {
      issues.push(`团队计划缺少推荐角色 ${roleId} 的角色行`);
      continue;
    }
    for (const [label, column] of columns) {
      const value = clean(row[column] ?? "");
      if (value === "" || value === "-" || value === "—") issues.push(`团队计划角色 ${roleId} 的「${label}」为空`);
    }
  }
  return issues;
}

/** 过滤问题为可读消息（默认只取 error；`severity` 可指定 warning/exception-review）。 */
export function teamPlanIssueMessages(
  result: TeamPlanParseResult,
  severity: TeamPlanIssueSeverity = "error",
): string[] {
  return result.issues.filter((issue) => issue.severity === severity).map((issue) => issue.message);
}
