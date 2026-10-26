// src/common/编排/team-plan.ts
// **团队计划 v2/v3 的单一解析/校验实现**（v2：2026-10-22 角色粒度/MapReduce；v3：2026-10-23
// 目录级授权 + 目录规范，策划方案 `2026-10-23_design_directory-ownership.md` §4–§5）。
//
// 纪律：
//   · 单一实现：`run-role.ts` 的卡前守卫与桌面写卡后校验（经 pipeline 公共出口）都消费本模块，
//     不保留第二份 v2/v3 解析；推荐集解析复用 `governance-judge-facts.ts::parseRecommendedRoleIds`。
//   · 确定性：只做结构/覆盖/写集/目录规范/环/并行组/粒度启发式（V1–V11 + V-D1–V-D9），**不调用模型**、
//     不做语义判断；语义复核仍归 Convener readiness。V11（flow-plan 一致性）在 flow 已写时做确定性核对。
//   · 兼容：缺省或 `teamPlanSchema: 1` 的旧计划走 v1 分支（只保留既有表格结构检查），不强制新字段；
//     `teamPlanSchema: 2` 逐字保留 2026-10-22 行为；`teamPlanSchema: 3` = v2 字段 + 授权目录/目录规范。
//   · 旧计划/旧 flow/旧角色卡不重写；本模块只读文本、不写盘（仅在给出 projectRoot 时做只读 realpath 核对）。
//
// 行号与字段以实际代码/策划方案正文为准；本模块不新增 cardKind / FlowStepKind / artifact kind。

import { join as joinPath } from "node:path";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import { isBuiltInGovernanceRoleId } from "../../service/boundary/resolve-boundary.ts";
import { compareKey, isUnderOrEqual, isWithinReal, realResolve, toPosix } from "../../common/shared/path-primitives.ts";
import { parseRecommendedRoleIds } from "./governance-judge-facts.ts";
import type { FlowState, FlowStateStep } from "./flow-state.ts";

// —————————————————————— 公共类型 ——————————————————————

export const TEAM_PLAN_SCHEMA_LEGACY = 1;
export const TEAM_PLAN_SCHEMA_V2 = 2;
export const TEAM_PLAN_SCHEMA_V3 = 3;

/** 团队计划模块清单行（frontmatter `modules` 的人类可读说明）。 */
export interface TeamPlanModule {
  module: string;
  responsibility: string;
  contract: string;
  architectureSource: string;
  /** v3：模块实现目录（项目相对、以 `/` 结尾）；v3 每个 module 必填非空（Q9 A）。 */
  implementationDir?: string;
}

/** 目录规范类型（设计 §4.3）。 */
export type DirectoryKind = "implementation" | "tests" | "docs" | "evidence" | "shared";
/** 目录共享策略（设计 §4.4）。 */
export type DirectoryShared = "none" | "read-only" | "split";
/** `允许子目录`：`—` 不许新建 / 显式列表 / `*` 一层 / `**` 任意层。 */
export type DirectorySubdirs = string[] | "*" | "**" | "—";

/**
 * 目录规范行（v3 团队计划「目录规范」表；设计 §4.3/§8.2）。
 * 解析产物的字段为清洗后的原始值；结构化校验结果见 `TeamPlanIssue`。
 */
export interface DirectorySpec {
  /** 项目相对目录（以 `/` 结尾；大小写按原样显示）。 */
  dir: string;
  /** 唯一写角色（roleId）。 */
  owner: string;
  kind: DirectoryKind;
  purpose: string;
  /** `any` / `kebab-case` / `camelCase` / `snake_case` / `PascalCase` / `*.test.ts` / `/regex/`。 */
  naming: string;
  subdirs: DirectorySubdirs;
  /** 允许文件扩展名（含前导点）；`*` 仅 docs/evidence。 */
  extensions: string[];
  /** 公开契约路径或 `internal` + 非空理由。 */
  contract: string;
  testSurface: string[];
  /** 本计划目录（以 `/` 结尾）或外部契约路径；无依赖为空数组。 */
  dependencies: string[];
  /** 目录内禁写区（相对前缀/文件名/`*.ext`）。 */
  forbidden: string[];
  shared: DirectoryShared;
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
  /** 唯一写集原始单元格（v2；v3 = `精确写集` 原始单元格）。 */
  writeset: string;
  writesets: WritesetEntry[];
  /** v3：`授权目录` 原始单元格（分号分隔目录条目）。 */
  authorizedDirsRaw: string;
  /** v3：解析后的授权目录条目（必须是目录；非法项在 issues 报告）。 */
  authorizedDirs: WritesetEntry[];
  /** v3：`精确写集` 原始单元格（`无` 合法）。 */
  preciseWritesetRaw: string;
  /** v3：解析后的精确写集条目（文件；目录应放 `授权目录`）。 */
  preciseWritesets: WritesetEntry[];
  /** v3：`授权目录` 单元格解析问题（不含治理/归属判定）。 */
  authorizedDirIssues: string[];
  /** v3：`精确写集` 单元格解析问题（不含治理/归属判定）。 */
  preciseWritesetIssues: string[];
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
  teamPlanSchema: 1 | 2 | 3;
  flowId?: string;
  version?: number;
  riskTier?: string;
  recommended: string[];
  modules: string[];
  moduleList: TeamPlanModule[];
  roleRows: TeamPlanRoleRow[];
  /** v3：frontmatter `directories`（规范化、以 `/` 结尾；v1/v2 为空）。 */
  directories: string[];
  /** v3：目录规范表（v1/v2 为空）。 */
  directorySpecs: DirectorySpec[];
  /** 全部问题（error 阻断；warning/exception-review 记录但不阻断发卡）。 */
  issues: TeamPlanIssue[];
}

export interface ParseTeamPlanOptions {
  /** 期望的 flowId（卡片/文件名）；给出时 frontmatter 必须一致。 */
  flowId?: string;
  /**
   * 项目根（可选；只读）：给出时对 v3 目录/写集路径的已存在祖先做 realpath 逃逸核对（V-D9）。
   * 未给出时只做词法路径安全核对；不写盘、不读 git。
   */
  projectRoot?: string;
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
  implementationDir: /^(实现目录|implementationdir|implementationdirectory|impldir)$/,
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

/**
 * 目录规范/路径单元格清洗：只去首尾反引号与空白，**不**剥离开头的 `*`/`_`
 * （`*.test.ts`、`*.log`、`*` 是有效语法；`cleanCell` 会把开头的 `*` 当 Markdown 粗体剥掉）。
 */
function cleanSpecCell(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^`+/, "").replace(/`+$/, "").trim();
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

// —————————————————————— v3：治理关键路径 / 目录规范 ——————————————————————

/**
 * 治理关键路径（目录级）：**不得**作为普通 `授权目录`（设计 §5.5，V-D1/V-D7）。
 * 覆盖检查按「相等或互为祖先/子目录」判定——例如 `docs/` 会因包含 `docs/scheduling/` 而被拒绝。
 */
const GOVERNANCE_DIRECTORY_PATHS: readonly string[] = [
  ".ans",
  "角色卡",
  "docs/scheduling",
  "docs/acceptance",
  "docs/communication",
  "docs/flows",
  "docs/nominations",
  "docs/verification",
  "src/common/shared",
  "src/model",
  ".github/workflows",
  "src/common/装配",
];

/** 密钥/环境路径的目录段（V-D7；`.env`、`.env.*` 与常见密钥目录）。 */
const SECRET_DIRECTORY_SEGMENTS: ReadonlySet<string> = new Set([
  ".env",
  "secrets",
  ".secrets",
  "credentials",
  ".ssh",
  "keys",
]);

/** 整层/整应用目录名黑名单（V-D6 tripwire；只匹配单段目录，如 `src/`、`app/`、`test/`）。 */
const WHOLE_LAYER_DIR_NAMES: ReadonlySet<string> = new Set([
  "src",
  "app",
  "test",
  "tests",
  "common",
  "shared",
  "utils",
  "util",
  "lib",
  "libs",
  "components",
  "services",
  "models",
  "views",
  "controllers",
  "helpers",
  "hooks",
  "pages",
  "packages",
  "modules",
  "misc",
  "all",
]);

const DIRECTORY_KINDS: readonly DirectoryKind[] = ["implementation", "tests", "docs", "evidence", "shared"];
const DIRECTORY_SHARED_VALUES: readonly DirectoryShared[] = ["none", "read-only", "split"];
const NAMING_ENUMS: ReadonlySet<string> = new Set(["any", "kebab-case", "camelCase", "snake_case", "PascalCase"]);

/** v3 角色表列（v2 列 + `授权目录`；`唯一写集` 为 `精确写集` 的别名）。 */
const ROLE_TABLE_COLUMNS_V3 = [
  "roleId",
  "type",
  "module",
  "duty",
  "ability",
  "authorizedDirs",
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

const ROLE_TABLE_PATTERNS_V3: Record<string, RegExp> = {
  roleId: /^(roleid|角色id)$/,
  type: /^(类型|type|roletype)$/,
  module: /^(module|boundedcontext|模块|模块id)$/,
  duty: /^(职责目标|职责|duty|responsibility)$/,
  ability: /^(能力要求|能力|ability|capability)$/,
  authorizedDirs: /^(授权目录|目录授权|authorizeddirs|authorizeddirectories|alloweddirs|alloweddirectories|directories)$/,
  // v3 不再接受 v2 的「边界」别名（避免与目录列歧义）；`唯一写集` 仅作兼容别名（warning）。
  writes: /^(精确写集|精确写入|precisewriteset|precisewrites|writeset|writes|write|唯一写集)$/,
  contract: /^(公开契约|契约|contract|publiccontract)$/,
  testSurface: /^(测试面|testsurface|测试范围|testscope)$/,
  deps: /^(依赖|依赖说明|deps|dependencies)$/,
  dependsOn: /^(dependson|机器依赖)$/,
  parallelGroup: /^(并行组|parallelgroup|parallel)$/,
  group: /^(组别|group|category)$/,
  apiSpec: /^(apispec|接口声明)$/,
  granularityRationale: /^(粒度理由|granularityrationale|granularityreason|granularity)$/,
};

const ROLE_TABLE_LABEL_V3: Record<string, string> = {
  ...ROLE_TABLE_LABEL,
  authorizedDirs: "授权目录",
  writes: "精确写集",
};

const DIRECTORY_TABLE_PATTERNS: Record<keyof DirectorySpec, RegExp> = {
  dir: /^(目录|目录路径|dir|directory)$/,
  owner: /^(owner|属主|所有者)$/,
  kind: /^(类型|kind|type)$/,
  purpose: /^(用途|purpose|responsibility)$/,
  naming: /^(命名|命名规则|naming)$/,
  subdirs: /^(允许子目录|子目录|subdirs|subdirectories|allowedsubdirs)$/,
  extensions: /^(允许文件类型|文件类型|extensions|filetypes|allowedfiletypes)$/,
  contract: /^(公开契约|契约|contract|publiccontract)$/,
  testSurface: /^(测试面|testsurface|testscope)$/,
  dependencies: /^(依赖|dependencies|deps)$/,
  forbidden: /^(禁写区|forbidden|forbiddenzones)$/,
  shared: /^(共享|shared|sharing)$/,
};

const DIRECTORY_TABLE_LABELS: Record<keyof DirectorySpec, string> = {
  dir: "目录",
  owner: "owner",
  kind: "类型",
  purpose: "用途",
  naming: "命名",
  subdirs: "允许子目录",
  extensions: "允许文件类型",
  contract: "公开契约",
  testSurface: "测试面",
  dependencies: "依赖",
  forbidden: "禁写区",
  shared: "共享",
};

interface ParsedPlanPath {
  /** 规范化路径（目录保留结尾 `/`；非法时可能为 undefined）。 */
  path?: string;
  directory: boolean;
  issues: string[];
}

/** 词法路径安全核对（V-D1/V-D9；不触碰文件系统）。 */
function parsePlanPath(raw: string, wantDirectory: boolean): ParsedPlanPath {
  const text = cleanSpecCell(raw);
  const issues: string[] = [];
  if (text === "" || text === "-" || text === "—" || text === "–") {
    return { directory: wantDirectory, issues: ["为空"] };
  }
  if (/\s/.test(text)) issues.push("含空白/散文");
  if (/[*?[\]{}]/.test(text) || text.includes("...") || text.includes("…")) issues.push("含通配符/省略号");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) issues.push("是 URL");
  let posix = toPosix(text);
  if (posix.startsWith("./")) posix = posix.slice(2);
  if (posix.startsWith("//")) {
    issues.push("是 UNC 路径");
  } else if (posix.startsWith("/") || /^[A-Za-z]:\//.test(posix) || /^[A-Za-z]:$/.test(posix)) {
    issues.push("是绝对路径/盘符");
  }
  const directory = posix.endsWith("/");
  if (wantDirectory && !directory) issues.push("目录必须以 / 结尾");
  if (!wantDirectory && directory) issues.push("必须是精确文件（目录请放「授权目录」）");
  const trimmed = posix.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  if (trimmed === "" || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    issues.push("含空段/./..");
  }
  for (const segment of segments) {
    if (/[ .]$/.test(segment)) issues.push(`路径段「${segment}」以空格或点结尾`);
  }
  const normalized = trimmed === "" ? undefined : `${trimmed}/`;
  return {
    ...(normalized !== undefined ? { path: wantDirectory || directory ? normalized : trimmed } : {}),
    directory,
    issues,
  };
}

/** 治理关键路径命中（V-D1/V-D7；相等或互为祖先/子目录）。返回命中的治理根。 */
export function governanceDirectoryHit(value: string): string | undefined {
  const dir = compareKey(toPosix(value).replace(/\/+$/, ""));
  if (dir === "") return undefined;
  for (const rootRaw of GOVERNANCE_DIRECTORY_PATHS) {
    const root = compareKey(rootRaw);
    if (dir === root || dir.startsWith(`${root}/`) || root.startsWith(`${dir}/`)) return rootRaw;
  }
  return undefined;
}

/** 密钥/环境目录段命中（V-D7）。 */
function secretDirectoryHit(value: string): string | undefined {
  const segments = toPosix(value).replace(/\/+$/, "").split("/");
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (SECRET_DIRECTORY_SEGMENTS.has(lower) || lower.startsWith(".env.")) return segment;
  }
  return undefined;
}

/** 单段整层名（V-D6 tripwire）。 */
function wholeLayerDirectoryHit(value: string): string | undefined {
  const trimmed = toPosix(value).replace(/\/+$/, "");
  if (trimmed === "" || trimmed.includes("/")) return undefined;
  return WHOLE_LAYER_DIR_NAMES.has(trimmed.toLowerCase()) ? trimmed : undefined;
}

/** 大小写不敏感比较下的两条 v3 路径是否重叠（V-D4）。 */
function planPathsOverlap(a: WritesetEntry, b: WritesetEntry): boolean {
  const left: WritesetEntry = { ...a, path: compareKey(a.path) };
  const right: WritesetEntry = { ...b, path: compareKey(b.path) };
  return writesetsOverlap(left, right);
}

/** 精确写集单元格（v3）：`无`/空 ⇒ 空集；目录项允许但会提示应放 `授权目录`。 */
function parsePreciseWritesetCell(raw: string): { entries: WritesetEntry[]; issues: string[] } {
  if (isNoDependencyCell(raw)) return { entries: [], issues: [] };
  const entries: WritesetEntry[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const partRaw of raw.split(/[;；]/)) {
    const part = cleanSpecCell(partRaw);
    if (part === "") {
      issues.push("精确写集存在空项（分号之间不得为空）");
      continue;
    }
    const directory = toPosix(part).endsWith("/");
    const parsed = parsePlanPath(part, directory);
    for (const issue of parsed.issues) issues.push(`精确写集项「${part}」${issue}`);
    if (parsed.path === undefined || parsed.issues.length > 0) continue;
    const key = compareKey(parsed.path);
    if (seen.has(key)) {
      issues.push(`精确写集项「${part}」重复出现`);
      continue;
    }
    seen.add(key);
    entries.push({ raw: part, path: parsed.path, directory });
  }
  return { entries, issues };
}

/** 授权目录单元格（v3）：`无`/空 ⇒ 空集；每项必须是目录。 */
function parseAuthorizedDirsCell(raw: string): { entries: WritesetEntry[]; issues: string[] } {
  if (isNoDependencyCell(raw)) return { entries: [], issues: [] };
  const entries: WritesetEntry[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const partRaw of raw.split(/[;；]/)) {
    const part = cleanSpecCell(partRaw);
    if (part === "") {
      issues.push("授权目录存在空项（分号之间不得为空）");
      continue;
    }
    const parsed = parsePlanPath(part, true);
    for (const issue of parsed.issues) issues.push(`授权目录项「${part}」${issue}`);
    if (parsed.path === undefined || parsed.issues.length > 0) continue;
    const key = compareKey(parsed.path);
    if (seen.has(key)) {
      issues.push(`授权目录项「${part}」重复出现`);
      continue;
    }
    seen.add(key);
    entries.push({ raw: part, path: parsed.path, directory: true });
  }
  return { entries, issues };
}

/** 命名规范是否合法（固定枚举 / `*.test.ts` 通配 / `/regex/`）。 */
function isValidNamingSpec(raw: string): boolean {
  const value = cleanSpecCell(raw);
  if (NAMING_ENUMS.has(value)) return true;
  if (/^\*\.[A-Za-z0-9._-]+$/.test(value)) return true;
  if (/^\/.+\/[a-z]*$/.test(value)) {
    const match = /^\/(.+)\/([a-z]*)$/.exec(value);
    if (match === null) return false;
    try {
      new RegExp(match[1]!, match[2]!);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function parseSubdirsCell(raw: string): { value: DirectorySubdirs; issues: string[] } {
  const text = cleanSpecCell(raw);
  const issues: string[] = [];
  if (text === "" || text === "—" || text === "–" || text === "-" || text.toLowerCase() === "none") {
    return { value: "—", issues };
  }
  if (text === "*") return { value: "*", issues };
  if (text === "**") return { value: "**", issues };
  const list: string[] = [];
  for (const partRaw of text.split(/[;；]/)) {
    const part = cleanSpecCell(partRaw).replace(/\/+$/, "");
    if (part === "") {
      issues.push("允许子目录存在空项");
      continue;
    }
    if (/[\\/]/.test(part) || /\s/.test(part) || part === "." || part === ".." || /[*?[\]{}]/.test(part)) {
      issues.push(`允许子目录项「${partRaw}」非法（只接受相对目录名，不含 /、空白、通配符或 ..）`);
      continue;
    }
    list.push(part);
  }
  if (list.length === 0 && issues.length === 0) return { value: "—", issues };
  return { value: list, issues };
}

function parseExtensionsCell(raw: string): { values: string[]; issues: string[] } {
  const text = cleanSpecCell(raw);
  const values: string[] = [];
  const issues: string[] = [];
  if (text === "" || text === "—" || text === "–" || text === "-" || text.toLowerCase() === "none") {
    issues.push("允许文件类型不能为空（docs/evidence 可用 `*`）");
    return { values, issues };
  }
  for (const partRaw of text.split(/[;；,，]/)) {
    const part = cleanSpecCell(partRaw);
    if (part === "") {
      issues.push("允许文件类型存在空项");
      continue;
    }
    if (part === "*") {
      values.push(part);
      continue;
    }
    if (!/^\.[A-Za-z0-9.+-]+$/.test(part)) {
      issues.push(`允许文件类型「${part}」非法（须为 .ext 或 *）`);
      continue;
    }
    if (values.includes(part)) {
      issues.push(`允许文件类型「${part}」重复`);
      continue;
    }
    values.push(part);
  }
  return { values, issues };
}

function parseDependenciesCell(raw: string): { values: string[]; issues: string[] } {
  const text = cleanSpecCell(raw);
  const values: string[] = [];
  const issues: string[] = [];
  if (isNoDependencyCell(text)) return { values, issues };
  for (const partRaw of text.split(/[;；,，]/)) {
    const part = cleanSpecCell(partRaw);
    if (part === "") {
      issues.push("依赖存在空项");
      continue;
    }
    if (/\s/.test(part) || /[*?[\]{}]/.test(part)) {
      issues.push(`依赖项「${part}」非法（不接受空白/通配符）`);
      continue;
    }
    let normalized = toPosix(part);
    if (normalized.startsWith("./")) normalized = normalized.slice(2);
    const body = normalized.replace(/\/+$/, "");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || body.split("/").some((s) => s === "" || s === "." || s === "..")) {
      issues.push(`依赖项「${part}」非法（须为本计划目录或外部契约路径）`);
      continue;
    }
    const key = compareKey(normalized);
    if (values.some((value) => compareKey(value) === key)) {
      issues.push(`依赖项「${part}」重复`);
      continue;
    }
    values.push(normalized);
  }
  return { values, issues };
}

function parseForbiddenCell(raw: string): { values: string[]; issues: string[] } {
  const text = cleanSpecCell(raw);
  const values: string[] = [];
  const issues: string[] = [];
  if (isNoDependencyCell(text)) return { values, issues };
  for (const partRaw of text.split(/[;；]/)) {
    const part = cleanSpecCell(partRaw);
    if (part === "") {
      issues.push("禁写区存在空项");
      continue;
    }
    if (/\s/.test(part)) {
      issues.push(`禁写区项「${part}」含空白`);
      continue;
    }
    if (/^\*\.[A-Za-z0-9._-]+$/.test(part)) {
      values.push(part);
      continue;
    }
    let normalized = toPosix(part);
    if (normalized.startsWith("./")) normalized = normalized.slice(2);
    const body = normalized.replace(/\/+$/, "");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || body.split("/").some((s) => s === "" || s === "." || s === "..")) {
      issues.push(`禁写区项「${part}」非法（必须是目录内相对路径/文件名/` + "`*.ext`" + `）`);
      continue;
    }
    values.push(normalized);
  }
  return { values, issues };
}

function parseSharedCell(raw: string): { value: DirectoryShared; issues: string[] } {
  const text = cleanSpecCell(raw).toLowerCase();
  if (text === "none" || text === "无" || text === "—" || text === "-") return { value: "none", issues: [] };
  if (text === "read-only" || text === "readonly" || text === "只读") return { value: "read-only", issues: [] };
  if (text === "split" || text === "拆分") return { value: "split", issues: [] };
  return { value: "none", issues: [`共享值「${cleanSpecCell(raw)}」非法；只能是 none / read-only / split`] };
}

function parseDirectoryKind(raw: string): DirectoryKind | undefined {
  const text = cleanSpecCell(raw).toLowerCase();
  return (DIRECTORY_KINDS as readonly string[]).includes(text) ? (text as DirectoryKind) : undefined;
}

function contractReason(raw: string): string {
  return cleanSpecCell(raw)
    .replace(/^internal\b/i, "")
    .replace(/^[\s（(：:—–\-,，;；]+/, "")
    .replace(/[\s）)]+$/, "")
    .trim();
}

// —————————————————————— v3：目录规范表解析 ——————————————————————

interface DirectorySpecRowParse {
  specs: DirectorySpec[];
  /** key（compareKey 后的 dir）→ 行数（检测重复行）。 */
  duplicateDirs: string[];
}

function parseDirectorySpecTable(
  lines: readonly string[],
  issues: TeamPlanIssue[],
): DirectorySpecRowParse {
  const specs: DirectorySpec[] = [];
  const duplicateDirs: string[] = [];
  const table = findTableAfterHeading(
    lines,
    /^\s{0,3}#{1,6}\s*(?:[0-9]+[.、]?\s*)?(?:目录规范|目录规范表|directory\s*spec)/i,
  );
  if (table === undefined) {
    issues.push({
      code: "V-D2",
      severity: "error",
      message:
        "v3 团队计划缺少「目录规范」表（表头 目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享）",
    });
    return { specs, duplicateDirs };
  }
  const header = table.header.map(normalizeHeaderCell);
  const columnOf = new Map<keyof DirectorySpec, number>();
  for (const key of Object.keys(DIRECTORY_TABLE_PATTERNS) as Array<keyof DirectorySpec>) {
    const matches = header
      .map((cell, index) => (DIRECTORY_TABLE_PATTERNS[key].test(cell) ? index : -1))
      .filter((index) => index !== -1);
    if (matches.length > 1) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: `directories.header.${key}`,
        message: `目录规范表列「${DIRECTORY_TABLE_LABELS[key]}」重复/歧义（第 ${matches.map((index) => index + 1).join("、")} 列）`,
      });
    } else if (matches.length === 1) {
      columnOf.set(key, matches[0]!);
    }
  }
  const missing = (Object.keys(DIRECTORY_TABLE_PATTERNS) as Array<keyof DirectorySpec>).filter(
    (key) => !columnOf.has(key) && !issues.some((issue) => issue.path === `directories.header.${key}`),
  );
  if (missing.length > 0) {
    issues.push({
      code: "V-D2",
      severity: "error",
      message: `目录规范表缺少必需列（${missing.map((key) => DIRECTORY_TABLE_LABELS[key]).join("/")}）`,
    });
  }
  const seen = new Set<string>();
  for (const cells of table.rows) {
    const cell = (key: keyof DirectorySpec): string => cleanSpecCell(cells[columnOf.get(key) ?? -1] ?? "");
    if (cells.every((value) => value.trim() === "")) continue;
    const rawDir = cell("dir");
    const parsedDir = parsePlanPath(rawDir, true);
    for (const issue of parsedDir.issues) {
      issues.push({ code: "V-D5", severity: "error", path: rawDir, message: `目录规范「${rawDir}」${issue}` });
    }
    if (parsedDir.path === undefined || parsedDir.issues.length > 0) continue;
    const dir = parsedDir.path;
    const key = compareKey(dir);
    if (seen.has(key)) {
      duplicateDirs.push(dir);
      issues.push({ code: "V-D2", severity: "error", path: dir, message: `目录规范重复列出目录「${dir}」（每个目录恰好一行）` });
      continue;
    }
    seen.add(key);

    const owner = cell("owner");
    if (owner === "") {
      issues.push({ code: "V-D2", severity: "error", path: dir, message: `目录规范「${dir}」的 owner 为空` });
    }
    const kindRaw = cell("kind");
    const kind = parseDirectoryKind(kindRaw);
    if (kind === undefined) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的类型「${kindRaw}」非法；只能是 ${DIRECTORY_KINDS.join("/")}`,
      });
    }
    const purpose = cell("purpose");
    if (purpose === "" || isEmptyCell(purpose)) {
      issues.push({ code: "V-D2", severity: "error", path: dir, message: `目录规范「${dir}」的用途为空` });
    }
    const naming = cell("naming");
    if (naming === "" || !isValidNamingSpec(naming)) {
      issues.push({
        code: "V-D5",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的命名「${naming}」非法；须为 any/kebab-case/camelCase/snake_case/PascalCase、*.ext 通配或 /regex/`,
      });
    }
    const subdirs = parseSubdirsCell(cell("subdirs"));
    for (const issue of subdirs.issues) {
      issues.push({ code: "V-D5", severity: "error", path: dir, message: `目录规范「${dir}」${issue}` });
    }
    const extensions = parseExtensionsCell(cell("extensions"));
    for (const issue of extensions.issues) {
      issues.push({ code: "V-D5", severity: "error", path: dir, message: `目录规范「${dir}」${issue}` });
    }
    if (kind !== undefined && kind !== "docs" && kind !== "evidence" && extensions.values.includes("*")) {
      issues.push({
        code: "V-D5",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的允许文件类型不能使用 \`*\`（仅 docs/evidence 可用）`,
      });
    }
    const contract = cell("contract");
    if (contract === "" || isEmptyCell(contract)) {
      issues.push({ code: "V-D2", severity: "error", path: dir, message: `目录规范「${dir}」的公开契约为空` });
    } else if (/^internal\b/i.test(contract) && contractReason(contract) === "") {
      issues.push({
        code: "V-D5",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的公开契约 internal 必须附非空理由`,
      });
    } else if (!/^internal\b/i.test(contract) && !/[\\/]/.test(contract) && !/\.md$/i.test(contract)) {
      issues.push({
        code: "V-D5",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的公开契约「${contract}」须为路径或 internal + 理由`,
      });
    }
    const testSurfaceRaw = cell("testSurface");
    const testSurface = isEmptyCell(testSurfaceRaw) || testSurfaceRaw === "—" ? [] : splitListCell(testSurfaceRaw);
    const testSurfaceOptional = kind === "docs" || kind === "evidence";
    if (testSurface.length === 0 && !testSurfaceOptional) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: dir,
        message: `目录规范「${dir}」的测试面为空（${String(kind)} 类型必填；docs/evidence 可写 \`—\`）`,
      });
    }
    const dependencies = parseDependenciesCell(cell("dependencies"));
    for (const issue of dependencies.issues) {
      issues.push({ code: "V-D5", severity: "error", path: dir, message: `目录规范「${dir}」${issue}` });
    }
    const forbidden = parseForbiddenCell(cell("forbidden"));
    for (const issue of forbidden.issues) {
      issues.push({ code: "V-D5", severity: "error", path: dir, message: `目录规范「${dir}」${issue}` });
    }
    const shared = parseSharedCell(cell("shared"));
    for (const issue of shared.issues) {
      issues.push({ code: "V-D2", severity: "error", path: dir, message: `目录规范「${dir}」${issue}` });
    }
    const requiredRawFields: Array<[keyof DirectorySpec, string]> = [
      ["subdirs", "允许子目录"],
      ["dependencies", "依赖"],
      ["forbidden", "禁写区"],
      ["shared", "共享"],
    ];
    for (const [field, label] of requiredRawFields) {
      if (cell(field) === "") {
        issues.push({
          code: "V-D2",
          severity: "error",
          path: dir,
          message: `目录规范「${dir}」的${label}为空（必填；无请写 —/无/none）`,
        });
      }
    }

    specs.push({
      dir,
      owner,
      kind: kind ?? "implementation",
      purpose,
      naming,
      subdirs: subdirs.value,
      extensions: extensions.values,
      contract,
      testSurface,
      dependencies: dependencies.values,
      forbidden: forbidden.values,
      shared: shared.value,
    });
  }
  return { specs, duplicateDirs };
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

function parseRoleRow(
  cells: readonly string[],
  columnOf: Map<string, number>,
  v3 = false,
): TeamPlanRoleRow {
  const cell = (column: string): string => cleanCell(cells[columnOf.get(column) ?? -1] ?? "");
  const module = cell("module");
  const modules = splitModuleCell(module);
  const isReduce = modules.length === 1 && modules[0] === "reduce";
  const granularity = cell("granularityRationale");
  const apiSpec = cell("apiSpec");
  const parsedApiSpec = apiSpecOf(apiSpec);
  const rawDependsOn = cell("dependsOn");
  const writeset = cell("writes");
  const rawAuthorizedDirs = v3 ? cell("authorizedDirs") : "";
  const authorized = v3 ? parseAuthorizedDirsCell(rawAuthorizedDirs) : { entries: [], issues: [] };
  const precise = v3 ? parsePreciseWritesetCell(writeset) : { entries: parseWritesetCell(writeset).entries, issues: [] };
  const writesets = v3 ? precise.entries : parseWritesetCell(writeset).entries;
  return {
    roleId: cell("roleId"),
    roleType: cell("type"),
    module,
    modules,
    ...(modules.length > 0 && !isReduce ? { primaryModule: modules[0] } : {}),
    duty: cell("duty"),
    ability: cell("ability"),
    writeset,
    writesets,
    authorizedDirsRaw: rawAuthorizedDirs,
    authorizedDirs: authorized.entries,
    preciseWritesetRaw: writeset,
    preciseWritesets: writesets,
    authorizedDirIssues: authorized.issues,
    preciseWritesetIssues: precise.issues,
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
  const teamPlanSchema: 1 | 2 | 3 = schemaValue === "2" ? 2 : schemaValue === "3" ? 3 : 1;
  const legacy = teamPlanSchema === 1;
  const v3 = teamPlanSchema === 3;

  if (schemaValue !== undefined && schemaValue !== "1" && schemaValue !== "2" && schemaValue !== "3") {
    issues.push({
      code: "V1",
      severity: "error",
      path: "teamPlanSchema",
      message: `teamPlanSchema 只能是 1（legacy）、2 或 3；当前「${schemaValue}」`,
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
      directories: [],
      directorySpecs: [],
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
  const columnOf = new Map<string, number>();
  const roleRows: TeamPlanRoleRow[] = [];
  if (roleTable === undefined) {
    issues.push({
      code: "V2",
      severity: "error",
      message: v3
        ? "团队计划缺少角色表（v3 表头须含 roleId/类型/module/职责目标/能力要求/授权目录/精确写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由）"
        : "团队计划缺少角色表（v2 表头须含 roleId/类型/module/职责目标/能力要求/唯一写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由）",
    });
  } else {
    const header = roleTable.header.map(normalizeHeaderCell);
    const columns: readonly string[] = v3 ? ROLE_TABLE_COLUMNS_V3 : ROLE_TABLE_COLUMNS;
    const patterns: Record<string, RegExp> = v3
      ? ROLE_TABLE_PATTERNS_V3
      : (ROLE_TABLE_PATTERNS as unknown as Record<string, RegExp>);
    const labels: Record<string, string> = v3
      ? ROLE_TABLE_LABEL_V3
      : (ROLE_TABLE_LABEL as unknown as Record<string, string>);
    if (v3) {
      for (const cell of header) {
        if (cell === "边界") {
          issues.push({
            code: "V2",
            severity: "error",
            path: "roles.header.boundary",
            message:
              "v3 团队计划角色表不再接受「边界」列名（v2 别名）；精确文件请用「精确写集」，目录请用「授权目录」",
          });
        }
      }
    }
    for (const column of columns) {
      const pattern = patterns[column];
      if (pattern === undefined) continue;
      const indexes = header
        .map((cell, index) => (pattern.test(cell) ? index : -1))
        .filter((index) => index !== -1);
      if (indexes.length > 1) {
        issues.push({
          code: "V2",
          severity: "error",
          path: `roles.header.${column}`,
          message: `团队计划角色表列「${labels[column] ?? column}」重复/歧义（第 ${indexes.map((index) => index + 1).join("、")} 列）`,
        });
      } else if (indexes.length === 1) {
        columnOf.set(column, indexes[0]!);
      }
    }
    const missing = columns.filter((column) => !columnOf.has(column) && !issues.some(
      (issue) => issue.path === `roles.header.${column}`,
    ));
    if (missing.length > 0) {
      issues.push({
        code: "V2",
        severity: "error",
        message: `团队计划角色表缺少必需列（${missing.map((column) => labels[column] ?? column).join("/")}）`,
      });
    }
    if (v3) {
      const writesIndex = columnOf.get("writes");
      if (writesIndex !== undefined && header[writesIndex] === "唯一写集") {
        issues.push({
          code: "V-D3",
          severity: "warning",
          path: "roles.header.writes",
          message:
            "v3 团队计划角色表使用「唯一写集」别名；已按「精确写集」处理（建议把列名改为「精确写集」）",
        });
      }
    }
    for (const cells of roleTable.rows) {
      if (cells.every((cell) => isSeparatorRow([cell]))) continue;
      const roleId = cleanCell(cells[columnOf.get("roleId") ?? -1] ?? "");
      if (roleId === "") continue;
      roleRows.push(parseRoleRow(cells, columnOf, v3));
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
  const requiredCells: Array<[string, keyof TeamPlanRoleRow]> = v3
    ? [
        ["module", "module"],
        ["职责目标", "duty"],
        ["能力要求", "ability"],
        ["授权目录", "authorizedDirsRaw"],
        ["精确写集", "writeset"],
        ["公开契约", "contracts"],
        ["测试面", "testSurface"],
        ["依赖", "deps"],
        ["并行组", "parallelGroup"],
        ["组别", "group"],
        ["apiSpec", "apiSpec"],
      ]
    : [
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
    if (v3) {
      if (row.authorizedDirsRaw !== "" && row.authorizedDirs.length === 0 && !isNoDependencyCell(row.authorizedDirsRaw)) {
        issues.push({
          code: "V-D3",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的授权目录没有任何合法条目`,
        });
      }
      for (const issue of row.authorizedDirIssues) {
        issues.push({ code: "V-D3", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId}：${issue}` });
      }
      if (!isNoDependencyCell(row.preciseWritesetRaw) && row.preciseWritesets.length === 0) {
        issues.push({
          code: "V-D3",
          severity: "error",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的精确写集没有任何合法条目`,
        });
      }
      for (const issue of row.preciseWritesetIssues) {
        issues.push({ code: "V-D3", severity: "error", roleId: row.roleId, message: `团队计划角色 ${row.roleId}：${issue}` });
      }
      for (const entry of row.preciseWritesets) {
        if (!entry.directory) continue;
        issues.push({
          code: "V-D3",
          severity: "warning",
          roleId: row.roleId,
          message: `团队计划角色 ${row.roleId} 的精确写集含目录「${entry.path}」；目录应优先放「授权目录」（warning，不硬拒）`,
        });
      }
    } else {
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
  const moduleList = parseModuleList(lines, issues, v3);
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

  // ——————— V-D1–V-D9：目录级授权（仅 v3；v1/v2 不进入） ———————
  let directories: string[] = [];
  let directorySpecs: DirectorySpec[] = [];
  if (v3) {
    const v3Result = validateV3DirectoryOwnership({
      frontmatter,
      lines,
      moduleList,
      roleRows,
      recommended,
      reachableFrom,
      issues,
      ...(options.projectRoot !== undefined ? { projectRoot: options.projectRoot } : {}),
    });
    directories = v3Result.directories;
    directorySpecs = v3Result.directorySpecs;
  }

  const ok = !issues.some((issue) => issue.severity === "error");
  return {
    ok,
    legacy: false,
    teamPlanSchema,
    ...(flowId !== undefined && flowId !== "" ? { flowId } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(riskTier !== undefined ? { riskTier } : {}),
    recommended,
    modules,
    moduleList,
    roleRows,
    directories,
    directorySpecs,
    issues,
  };
}

// —————————————————————— v3：V-D1–V-D9 目录级授权校验 ——————————————————————

/** 解析 frontmatter `directories`（v3 必填；Q1 A 强制）。 */
function parseTeamPlanDirectories(frontmatter: string, issues: TeamPlanIssue[]): string[] {
  const values = frontmatterValues(frontmatter, "directories");
  if (values.length === 0) {
    issues.push({
      code: "V-D1",
      severity: "error",
      path: "directories",
      message:
        "v3 团队计划缺少 frontmatter `directories`（须为同一行非空内联数组 `directories: [dir-a/, dir-b/]`；Q1 A 强制）",
    });
    return [];
  }
  const distinct = [...new Set(values.map((value) => value.trim()))];
  if (distinct.length > 1) {
    issues.push({
      code: "V-D1",
      severity: "error",
      path: "directories",
      message: "frontmatter 出现多个不一致的 directories（只能有一个机器可读来源）",
    });
  }
  const value = values[0]!;
  if (value === "") {
    issues.push({
      code: "V-D1",
      severity: "error",
      path: "directories",
      message: "directories 必须写成同一行内联数组 `directories: [dir-a/, dir-b/]`（不接受 YAML 块数组）",
    });
    return [];
  }
  const cleaned = value.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (cleaned === "") {
    issues.push({ code: "V-D1", severity: "error", path: "directories", message: "directories 不得为空（至少一个目录）" });
    return [];
  }
  const dirs: string[] = [];
  const seen = new Set<string>();
  for (const partRaw of cleaned.split(/[,，、]/)) {
    const part = cleanSpecCell(partRaw).replace(/^["']+/, "").replace(/["']+$/, "").trim();
    if (part === "") {
      issues.push({ code: "V-D1", severity: "error", path: "directories", message: "directories 存在空项/歧义" });
      continue;
    }
    const parsed = parsePlanPath(part, true);
    for (const issue of parsed.issues) {
      issues.push({
        code: "V-D1",
        severity: "error",
        path: "directories",
        message: `directories 项「${part}」${issue}`,
      });
    }
    if (parsed.path === undefined || parsed.issues.length > 0) continue;
    // V-D1 重复判定（2026-10-24 跨平台修正）：directories 去重键在**所有平台**都不区分大小写。
    // `compareKey` 只在 Windows 折叠大小写（其余平台反映真实文件系统语义），会让 macOS/Linux 漏报
    // `src/api/` 与 `SRC/API/` 的重复；此处只用于比较键，不改变 `parsed.path` 本身（展示/落盘值保留原大小写）。
    const key = parsed.path.toLowerCase();
    if (seen.has(key)) {
      issues.push({
        code: "V-D1",
        severity: "error",
        path: parsed.path,
        message: `directories 重复列出目录「${parsed.path}」`,
      });
      continue;
    }
    seen.add(key);
    const governance = governanceDirectoryHit(parsed.path);
    if (governance !== undefined) {
      issues.push({
        code: "V-D1",
        severity: "error",
        path: parsed.path,
        message: `目录「${parsed.path}」与治理关键路径「${governance}/」重叠；治理关键路径不得作为普通授权目录（V-D7）`,
      });
      continue;
    }
    const secret = secretDirectoryHit(parsed.path);
    if (secret !== undefined) {
      issues.push({
        code: "V-D1",
        severity: "error",
        path: parsed.path,
        message: `目录「${parsed.path}」命中密钥/环境路径段「${secret}」；不得作为普通授权目录`,
      });
      continue;
    }
    dirs.push(parsed.path);
  }
  return dirs;
}

interface V3DirectoryOwnershipArgs {
  frontmatter: string;
  lines: readonly string[];
  moduleList: TeamPlanModule[];
  roleRows: TeamPlanRoleRow[];
  recommended: string[];
  reachableFrom: (id: string) => Set<string>;
  issues: TeamPlanIssue[];
  projectRoot?: string;
}

/**
 * V-D1–V-D9 的 v3 目录级授权校验（确定性；不调用模型、不做语义判断）。
 * 语义复核（目录是否内聚、规范是否合理、共享是否必要、契约/测试面是否真实）仍归 Convener readiness。
 */
function validateV3DirectoryOwnership(args: V3DirectoryOwnershipArgs): {
  directories: string[];
  directorySpecs: DirectorySpec[];
} {
  const { issues, roleRows, recommended } = args;
  const directories = parseTeamPlanDirectories(args.frontmatter, issues);
  const specParse = parseDirectorySpecTable(args.lines, issues);
  const directorySpecs = specParse.specs;
  const declaredKeys = new Set(directories.map((dir) => compareKey(dir)));
  const specByKey = new Map<string, DirectorySpec>();
  for (const spec of directorySpecs) {
    const key = compareKey(spec.dir);
    if (specByKey.has(key)) continue; // 重复行已在解析时报告
    specByKey.set(key, spec);
  }

  // ——————— V-D2：规范表恰好覆盖 directories；owner / 必填 / 枚举 ———————
  for (const [key, spec] of specByKey) {
    if (!declaredKeys.has(key)) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: spec.dir,
        message: `目录规范含 frontmatter \`directories\` 未声明的目录「${spec.dir}」`,
      });
    }
    if (spec.owner !== "" && !recommended.includes(spec.owner)) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: spec.dir,
        message: `目录规范「${spec.dir}」的 owner「${spec.owner}」不是推荐角色（owner 必须是推荐集成员）`,
      });
    }
  }
  for (const dir of directories) {
    if (!specByKey.has(compareKey(dir))) {
      issues.push({
        code: "V-D2",
        severity: "error",
        path: dir,
        message: `目录规范缺少目录「${dir}」的规范行（frontmatter/规范表/角色表必须三处一致）`,
      });
    }
  }

  // ——————— V-D3：角色引用 / owner 一致 / 孤儿 / 文件例外 ———————
  const references = new Map<string, string[]>();
  for (const row of roleRows) {
    for (const entry of row.authorizedDirs) {
      const key = compareKey(entry.path);
      if (!declaredKeys.has(key)) {
        issues.push({
          code: "V-D3",
          severity: "error",
          roleId: row.roleId,
          path: entry.path,
          message: `团队计划角色 ${row.roleId} 的授权目录「${entry.path}」不在 frontmatter \`directories\` 中`,
        });
        continue;
      }
      const spec = specByKey.get(key);
      if (spec !== undefined && spec.owner !== row.roleId) {
        issues.push({
          code: "V-D3",
          severity: "error",
          roleId: row.roleId,
          path: entry.path,
          message: `团队计划角色 ${row.roleId} 引用了目录「${entry.path}」，但目录规范 owner 是「${spec.owner}」（owner 不一致）`,
        });
        continue;
      }
      const refs = references.get(key) ?? [];
      if (!refs.includes(row.roleId)) refs.push(row.roleId);
      references.set(key, refs);
    }
  }
  for (const dir of directories) {
    const key = compareKey(dir);
    const spec = specByKey.get(key);
    if (spec?.shared === "split") continue; // split 父目录是容器，本身不得直接分配（V-D5/V-D8）
    const refs = references.get(key) ?? [];
    if (refs.length === 0) {
      issues.push({
        code: "V-D3",
        severity: "error",
        path: dir,
        message: `目录「${dir}」没有被任何角色行的「授权目录」引用（孤儿目录）`,
      });
    }
  }
  for (const id of recommended) {
    const row = roleRows.find((candidate) => candidate.roleId === id);
    if (row === undefined) continue; // 缺行已由 V3 报告
    if (row.authorizedDirs.length === 0 && row.preciseWritesets.length === 0) {
      issues.push({
        code: "V-D3",
        severity: "error",
        roleId: row.roleId,
        message: `推荐角色 ${row.roleId} 至少需要一个「授权目录」或「精确写集」（不能没有任何写权限）`,
      });
    } else if (row.authorizedDirs.length === 0 && row.granularityRationale === undefined) {
      issues.push({
        code: "V-D3",
        severity: "error",
        roleId: row.roleId,
        message: `推荐角色 ${row.roleId} 只有「精确写集」文件例外，必须写「粒度理由」`,
      });
    }
  }

  // ——————— V-D4：目录/写集不重叠（大小写不敏感；V-D9 口径） ———————
  for (let i = 0; i < roleRows.length; i += 1) {
    for (let j = i + 1; j < roleRows.length; j += 1) {
      const a = roleRows[i]!;
      const b = roleRows[j]!;
      let reported = false;
      const report = (left: WritesetEntry, right: WritesetEntry): void => {
        if (reported) return;
        issues.push({
          code: "V-D4",
          severity: "error",
          roleId: a.roleId,
          message:
            `团队计划角色 ${a.roleId} 与 ${b.roleId} 的目录/写集重叠：` +
            `「${left.path}」与「${right.path}」（跨角色必须两两不相交；shared: split 父目录除外）`,
        });
        reported = true;
      };
      for (const left of a.authorizedDirs) {
        for (const right of b.authorizedDirs) {
          if (planPathsOverlap(left, right)) report(left, right);
        }
      }
      for (const left of a.preciseWritesets) {
        for (const right of b.authorizedDirs) {
          if (planPathsOverlap(left, right)) report(left, right);
        }
        for (const right of b.preciseWritesets) {
          if (planPathsOverlap(left, right)) report(left, right);
        }
      }
      for (const left of b.preciseWritesets) {
        for (const right of a.authorizedDirs) {
          if (planPathsOverlap(left, right)) report(right, left);
        }
      }
    }
  }

  // ——————— V-D5：规范语法 / 依赖 DAG / split 容器 ———————
  const edges = new Map<string, string[]>();
  const displayOf = new Map<string, string>();
  for (const dir of directories) displayOf.set(compareKey(dir), dir);
  for (const spec of directorySpecs) {
    const key = compareKey(spec.dir);
    const deps: string[] = [];
    for (const dependency of spec.dependencies) {
      if (dependency.endsWith("/")) {
        const depKey = compareKey(dependency);
        if (!declaredKeys.has(depKey)) {
          issues.push({
            code: "V-D5",
            severity: "error",
            path: spec.dir,
            message: `目录规范「${spec.dir}」的依赖目标「${dependency}」不存在（须是本计划目录或外部契约路径）`,
          });
          continue;
        }
        if (depKey === key) {
          issues.push({
            code: "V-D5",
            severity: "error",
            path: spec.dir,
            message: `目录规范「${spec.dir}」不能依赖自己`,
          });
          continue;
        }
        deps.push(depKey);
        const dependencySpec = specByKey.get(depKey);
        if (dependencySpec !== undefined && dependencySpec.owner !== spec.owner && spec.owner !== "") {
          if (!args.reachableFrom(spec.owner).has(dependencySpec.owner)) {
            issues.push({
              code: "V-D5",
              severity: "error",
              path: spec.dir,
              message:
                `目录规范「${spec.dir}」（owner ${spec.owner}）依赖「${dependency}」（owner ${dependencySpec.owner}），` +
                `但角色 dependsOn 方向不一致（${spec.owner} 未直接或传递依赖 ${dependencySpec.owner}）`,
            });
          }
        }
        continue;
      }
      if (!dependency.includes("/") && !/\.md$/i.test(dependency)) {
        issues.push({
          code: "V-D5",
          severity: "error",
          path: spec.dir,
          message: `目录规范「${spec.dir}」的依赖目标「${dependency}」不是本计划目录或外部契约路径`,
        });
      }
    }
    edges.set(key, deps);
    for (const forbidden of spec.forbidden) {
      if (/^\*\.[A-Za-z0-9._-]+$/.test(forbidden)) {
        const extension = `.${forbidden.slice(2)}`;
        if (spec.extensions.includes(extension)) {
          issues.push({
            code: "V-D5",
            severity: "error",
            path: spec.dir,
            message: `目录规范「${spec.dir}」的禁写区「${forbidden}」与允许文件类型「${extension}」冲突`,
          });
        }
        continue;
      }
      const normalized = forbidden.replace(/\/+$/, "");
      if (forbidden.endsWith("/")) {
        const name = normalized.split("/").pop() ?? "";
        const allowsSubdir = spec.subdirs === "*" || spec.subdirs === "**" || (Array.isArray(spec.subdirs) && spec.subdirs.includes(name));
        if (allowsSubdir) {
          issues.push({
            code: "V-D5",
            severity: "error",
            path: spec.dir,
            message: `目录规范「${spec.dir}」的禁写区「${forbidden}」与允许子目录「${name}」冲突`,
          });
        }
        continue;
      }
      const base = normalized.split("/").pop() ?? "";
      const extension = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
      if (extension !== "" && spec.extensions.includes(extension)) {
        issues.push({
          code: "V-D5",
          severity: "error",
          path: spec.dir,
          message: `目录规范「${spec.dir}」的禁写区「${forbidden}」与允许文件类型「${extension}」冲突`,
        });
      }
    }
  }
  for (const cycle of detectDirectoryCycles(edges, displayOf)) {
    issues.push({
      code: "V-D5",
      severity: "error",
      message: `目录依赖形成环：${cycle.join(" → ")}`,
    });
  }

  // ——————— V-D6：模块实现目录 / 目录归属 / 整层黑名单 / 单文件 warning ———————
  const moduleImpl = new Map<string, string>();
  for (const moduleRow of args.moduleList) {
    if (moduleRow.implementationDir === undefined) continue; // 缺列/空值已报告
    const impl = moduleRow.implementationDir;
    const governance = governanceDirectoryHit(impl);
    if (governance !== undefined) {
      issues.push({
        code: "V-D6",
        severity: "error",
        module: moduleRow.module,
        message: `模块「${moduleRow.module}」的实现目录「${impl}」与治理关键路径「${governance}/」重叠`,
      });
      continue;
    }
    const secret = secretDirectoryHit(impl);
    if (secret !== undefined) {
      issues.push({
        code: "V-D6",
        severity: "error",
        module: moduleRow.module,
        message: `模块「${moduleRow.module}」的实现目录「${impl}」命中密钥/环境路径段「${secret}」`,
      });
      continue;
    }
    const layer = wholeLayerDirectoryHit(impl);
    if (layer !== undefined) {
      const ownerRow = roleRows.find((row) => row.isMap && row.modules.includes(moduleRow.module));
      if (ownerRow?.granularityRationale === undefined) {
        issues.push({
          code: "V-D6",
          severity: "error",
          module: moduleRow.module,
          message: `模块「${moduleRow.module}」的实现目录「${impl}」是整层/整应用目录且未写「粒度理由」（硬拒）`,
        });
      } else {
        issues.push({
          code: "V-D6",
          severity: "exception-review",
          module: moduleRow.module,
          message: `模块「${moduleRow.module}」的实现目录「${impl}」命中整层名黑名单，已写粒度理由；交 Convener readiness 例外复核`,
        });
      }
    }
    moduleImpl.set(moduleRow.module, impl);
  }
  for (const row of roleRows) {
    const effectiveModules = row.modules.filter((module) => module !== "reduce");
    for (const entry of row.authorizedDirs) {
      const spec = specByKey.get(compareKey(entry.path));
      if (spec !== undefined && (spec.kind === "implementation" || spec.kind === "tests" || spec.kind === "docs")) {
        if (row.isReduce) continue; // Reduce 是跨模块测试角色，不归属单一 module 实现目录（仍受黑名单/治理路径约束）
        const candidates = effectiveModules
          .map((module) => moduleImpl.get(module))
          .filter((value): value is string => value !== undefined);
        if (candidates.length === 0) {
          issues.push({
            code: "V-D6",
            severity: "error",
            roleId: row.roleId,
            path: entry.path,
            message: `团队计划角色 ${row.roleId} 的目录「${entry.path}」无法核对模块实现目录（对应 module 缺少非空实现目录）`,
          });
        } else if (!candidates.some((impl) => isUnderOrEqual(entry.path, impl))) {
          issues.push({
            code: "V-D6",
            severity: "error",
            roleId: row.roleId,
            path: entry.path,
            message:
              `团队计划角色 ${row.roleId} 的 ${spec.kind} 目录「${entry.path}」不在模块实现目录内` +
              `（${effectiveModules.map((module) => `${module}: ${moduleImpl.get(module) ?? "?"}`).join("；")}）`,
          });
        }
      }
    }
  }
  for (const spec of directorySpecs) {
    const layer = wholeLayerDirectoryHit(spec.dir);
    if (layer === undefined) continue;
    const ownerRow = roleRows.find((row) => row.roleId === spec.owner);
    if (ownerRow?.granularityRationale === undefined) {
      issues.push({
        code: "V-D6",
        severity: "error",
        path: spec.dir,
        message: `目录规范「${spec.dir}」是整层/整应用目录且未写「粒度理由」（硬拒）`,
      });
    } else {
      issues.push({
        code: "V-D6",
        severity: "exception-review",
        path: spec.dir,
        message: `目录规范「${spec.dir}」命中整层名黑名单，已写粒度理由；交 Convener readiness 例外复核`,
      });
    }
  }
  for (const row of roleRows) {
    if (row.authorizedDirs.length !== 1 || row.preciseWritesets.length > 0) continue;
    const spec = specByKey.get(compareKey(row.authorizedDirs[0]!.path));
    if (spec === undefined) continue;
    if (
      spec.subdirs === "—" &&
      spec.extensions.length === 1 &&
      spec.kind !== "docs" &&
      spec.kind !== "evidence"
    ) {
      issues.push({
        code: "V-D6",
        severity: "warning",
        roleId: row.roleId,
        path: spec.dir,
        message: `团队计划角色 ${row.roleId} 只有一个单层单类型目录「${spec.dir}」（疑似单文件目录）；交 readiness 判断是否应合并（warning，不硬拒）`,
      });
    }
  }

  // ——————— V-D7：治理关键路径只能精确文件 ———————
  for (const row of roleRows) {
    for (const entry of row.authorizedDirs) {
      const governance = governanceDirectoryHit(entry.path);
      if (governance !== undefined) {
        issues.push({
          code: "V-D7",
          severity: "error",
          roleId: row.roleId,
          path: entry.path,
          message: `团队计划角色 ${row.roleId} 把治理关键路径「${governance}/」作为普通授权目录；只能按既有治理授权精确文件`,
        });
      }
      const secret = secretDirectoryHit(entry.path);
      if (secret !== undefined) {
        issues.push({
          code: "V-D7",
          severity: "error",
          roleId: row.roleId,
          path: entry.path,
          message: `团队计划角色 ${row.roleId} 把密钥/环境路径段「${secret}」作为普通授权目录`,
        });
      }
    }
    for (const entry of row.preciseWritesets) {
      if (!entry.directory) continue;
      const governance = governanceDirectoryHit(entry.path);
      const secret = secretDirectoryHit(entry.path);
      if (governance !== undefined || secret !== undefined) {
        issues.push({
          code: "V-D7",
          severity: "error",
          roleId: row.roleId,
          path: entry.path,
          message:
            `团队计划角色 ${row.roleId} 的精确写集把治理关键路径/密钥路径「${entry.path}」写成了目录；` +
            "治理关键路径只能精确文件",
        });
      }
    }
  }

  // ——————— V-D8：共享策略 ———————
  for (const spec of directorySpecs) {
    const key = compareKey(spec.dir);
    const refs = references.get(key) ?? [];
    if (spec.shared === "split") {
      if (refs.length > 0) {
        issues.push({
          code: "V-D8",
          severity: "error",
          path: spec.dir,
          message: `目录规范「${spec.dir}」标记 shared: split，但父目录本身被角色 ${refs.join("、")} 直接分配（只能分配子目录）`,
        });
      }
      if (spec.subdirs === "—") {
        issues.push({
          code: "V-D8",
          severity: "error",
          path: spec.dir,
          message: `目录规范「${spec.dir}」标记 shared: split，但「允许子目录」为 —（split 容器必须允许子目录）`,
        });
      }
      const children = directories.filter((dir) => {
        const parent = dir.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
        return compareKey(`${parent}/`) === key;
      });
      if (children.length === 0) {
        issues.push({
          code: "V-D8",
          severity: "error",
          path: spec.dir,
          message: `目录规范「${spec.dir}」标记 shared: split，但没有子目录规范行（子目录必须各有 owner）`,
        });
      }
      for (const child of children) {
        const childSpec = specByKey.get(compareKey(child));
        if (childSpec === undefined || childSpec.owner === "") {
          issues.push({
            code: "V-D8",
            severity: "error",
            path: child,
            message: `shared: split 的子目录「${child}」缺少 owner`,
          });
        }
      }
      continue;
    }
    if (refs.length > 1) {
      issues.push({
        code: "V-D8",
        severity: "error",
        path: spec.dir,
        message:
          `目录规范「${spec.dir}」被多个角色引用（${refs.join("、")}）；shared: ${spec.shared} 只允许唯一 owner` +
          "（共享请用 read-only 或拆子目录 owner / split）",
      });
    }
  }

  // ——————— V-D9：realpath 逃逸（仅在给出 projectRoot 时；只读） ———————
  if (args.projectRoot !== undefined && args.projectRoot !== "") {
    const projectRoot = args.projectRoot;
    const rootReal = realResolve(projectRoot);
    const checkReal = (rel: string, label: string): void => {
      const target = realResolve(joinPath(projectRoot, ...rel.replace(/\/+$/, "").split("/")));
      if (!isWithinReal(rootReal, target)) {
        args.issues.push({
          code: "V-D9",
          severity: "error",
          path: rel,
          message: `${label}「${rel}」经 realpath 解析后逃出项目根「${target}」`,
        });
      }
    };
    for (const dir of directories) checkReal(dir, "目录");
    for (const row of roleRows) {
      for (const entry of row.authorizedDirs) checkReal(entry.path, "授权目录");
      for (const entry of row.preciseWritesets) checkReal(entry.path, "精确写集");
    }
    for (const moduleRow of args.moduleList) {
      if (moduleRow.implementationDir !== undefined) checkReal(moduleRow.implementationDir, "模块实现目录");
    }
  }

  return { directories, directorySpecs };
}

function detectDirectoryCycles(
  edges: Map<string, string[]>,
  displayOf: Map<string, string>,
): string[][] {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const reported = new Set<string>();
  const visit = (key: string): void => {
    const current = state.get(key);
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(key);
      const cycle = [...stack.slice(start), key];
      const cycleKey = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        cycles.push(cycle.map((item) => displayOf.get(item) ?? item));
      }
      return;
    }
    state.set(key, 1);
    stack.push(key);
    for (const target of edges.get(key) ?? []) visit(target);
    stack.pop();
    state.set(key, 2);
  };
  for (const key of edges.keys()) visit(key);
  return cycles;
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

function parseModuleList(lines: readonly string[], issues: TeamPlanIssue[], v3 = false): TeamPlanModule[] {
  const table = findTableAfterHeading(
    lines,
    /^\s{0,3}#{1,6}\s*(?:[0-9]+[.、]?\s*)?(?:模块清单|模块列表|module\s*list)/i,
  );
  if (table === undefined) {
    issues.push({
      code: "V4",
      severity: "error",
      message: v3
        ? "团队计划缺少「模块清单」表（表头 module/职责/公开契约/架构来源/实现目录）"
        : "团队计划缺少「模块清单」表（表头 module/职责/公开契约/架构来源）",
    });
    return [];
  }
  const header = table.header.map(normalizeHeaderCell);
  const columnOf: Partial<Record<keyof typeof MODULE_TABLE_PATTERNS, number>> = {};
  for (const key of Object.keys(MODULE_TABLE_PATTERNS) as Array<keyof typeof MODULE_TABLE_PATTERNS>) {
    const index = header.findIndex((cell) => MODULE_TABLE_PATTERNS[key].test(cell));
    if (index !== -1) columnOf[key] = index;
  }
  const coreKeys = (Object.keys(MODULE_TABLE_PATTERNS) as Array<keyof typeof MODULE_TABLE_PATTERNS>).filter(
    (key) => key !== "implementationDir",
  );
  const missing = coreKeys.filter((key) => columnOf[key] === undefined);
  if (missing.length > 0) {
    issues.push({
      code: "V4",
      severity: "error",
      message: `模块清单表缺少必需列（${missing.join("/")}）`,
    });
  }
  if (v3 && columnOf.implementationDir === undefined) {
    issues.push({
      code: "V-D6",
      severity: "error",
      message: "v3 模块清单表缺少必需列「实现目录」（Q9 A：每个 module 必须写非空实现目录）",
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
    let implementationDir: string | undefined;
    if (v3) {
      const rawImplementation = cleanSpecCell(cells[columnOf.implementationDir ?? -1] ?? "");
      if (rawImplementation === "" || isEmptyCell(rawImplementation)) {
        issues.push({
          code: "V-D6",
          severity: "error",
          module,
          message: `模块清单「${module}」缺少非空的「实现目录」（v3 每个 module 必填；Q9 A）`,
        });
      } else {
        const parsed = parsePlanPath(rawImplementation, true);
        for (const issue of parsed.issues) {
          issues.push({
            code: "V-D6",
            severity: "error",
            module,
            message: `模块清单「${module}」的实现目录「${rawImplementation}」${issue}`,
          });
        }
        if (parsed.path !== undefined && parsed.issues.length === 0) implementationDir = parsed.path;
      }
    }
    rows.push({
      module,
      responsibility,
      contract,
      architectureSource,
      ...(implementationDir !== undefined ? { implementationDir } : {}),
    });
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
 *     dependsOn 必须包含 `{contract-freeze} ∪ 依赖角色的 delivery-*`，并仅可额外包含
 *     flow 中存在的 `build-scaffold` 前置步骤（可选，不强制；先脚手架后实现）；
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
    // 必需集合：contract-freeze ∪ 依赖角色的 delivery-*。
    const required = new Set<string>(["contract-freeze"]);
    for (const dependency of row.dependsOn) {
      const dependencyRow = plan.roleRows.find((candidate) => candidate.roleId === dependency);
      if (dependencyRow?.isMap && dependencyRow.primaryModule !== undefined) {
        required.add(`delivery-${dependencyRow.primaryModule}`);
      }
    }
    // 允许集合：必需集合 + flow 中存在的独立 build-scaffold 前置步骤（可选，不强制）。
    // 2026-10-26 真机教训：先脚手架后实现需要 delivery-* 能显式依赖 build-scaffold。
    const scaffoldPresent = steps.has("build-scaffold");
    const allowed = new Set(required);
    if (scaffoldPresent) allowed.add("build-scaffold");
    const actual = new Set(step.dependsOn ?? []);
    const missing = [...required].filter((id) => !actual.has(id));
    const extra = [...actual].filter((id) => !allowed.has(id));
    if (missing.length > 0 || extra.length > 0) {
      issues.push({
        code: "V11",
        severity: "error",
        roleId: row.roleId,
        path: `steps.${deliveryId}.dependsOn`,
        message:
          `V11：步骤 ${deliveryId} 的 dependsOn 必须精确等于 {contract-freeze} ∪ 依赖角色的 delivery-*；` +
          `缺：${missing.length > 0 ? missing.join("、") : "无"}；多：${extra.length > 0 ? extra.join("、") : "无"}` +
          (scaffoldPresent ? "（flow 已含 build-scaffold 步骤，允许额外依赖 build-scaffold）" : ""),
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
