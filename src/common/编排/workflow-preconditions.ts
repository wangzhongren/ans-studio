// src/common/编排/workflow-preconditions.ts
// 2026-10-29（方案 v2.1 §5；客户拓扑 v4.1）：五步工作流链的**机械前置**与**机器可读名单**——
// 编排私有纯逻辑 + 注入读盘（不写盘、不判定语义质量；语义由卡片/验收/客户判断）。
//
// 职责：
//   1. `project-roster/v1` 名单 frontmatter 的严格解析/校验（schema/flowId/version/角色 id/目录/重叠）；
//   2. 最新名单发现与版本/hash（`docs/proposals/<flowId>-roster-vN.md`；N 最大为当前版本）；
//   3. 派发矩阵 M1–M8 的确定性判定（调用方先把事实算好，本模块只做判定，便于单测）；
//   4. 任务绑定报告的创建者路由（M9）：按 `task.created.from` 回创建者（chief / convener）。
//
// 纪律：全部 fail-closed；拒绝只返回稳定 code + 人话原因（调用方**在 task.created 之前**执行，见 F10）。
// 本模块不新增写区、不读 `.ans`、不采信模型自报事实（名单/选择集/推荐集都来自应用读取与裁决记录）。

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { makeMechanicalRejection, type MechanicalRejection } from "./mechanical-rejection.ts";
import { collectDispatchAdvisories } from "./dispatch-advisories.ts";
import type { DispatchAdvisory } from "./dispatch-advisories.ts";
import type { ContractSchemaTopic } from "../../model/runtime.ts";

export type { DispatchAdvisory, DispatchAdvisoryCode } from "./dispatch-advisories.ts";

/** 名单 schema 标识（client 2026-10-29 方案 §5.2；v2.6 模块先行升级为 v2）。 */
export const PROJECT_ROSTER_SCHEMA = "project-roster/v3" as const;
/** 2026-10-29（v2.18）：模块清单文档是唯一权威源；roster modules[] 是派生快照。 */
export const PROJECT_MODULES_SCHEMA = "project-modules/v2" as const;
export const PROJECT_TOPOLOGY_SCHEMA = "project-topology/v2" as const;
export const PROJECT_PROPOSAL_SCHEMA = "project-proposal/v2" as const;
export const TEAM_PLAN_SCHEMA = "teamPlanSchema:3" as const;

export interface TeamPlanFacts {
  schema: typeof TEAM_PLAN_SCHEMA;
  flowId: string;
  version: number;
  modules: { path: string; sha256: string };
  roster: { path: string; sha256: string };
  roleRows: Array<{ roleId: string; modules: string[]; writesets: string[]; dependsOn: string[] }>;
}

/** Planning coordination precedes D3 and role activation; these are never inferred from this result. */
export function evaluatePlanningHandoff(input: { fromRoleId: string; targetRoleId: string; flowId: string;
  proposal: { path: string; sha256: string }; modules: { path: string; sha256: string }; roster: { path: string; sha256: string };
  rosterFacts: ProjectRoster; modulesFacts: ProjectModulesDoc }): { ok: true } | { ok: false; reason: string } {
  if (input.fromRoleId !== "chief" || input.targetRoleId !== "convener") return { ok: false, reason: "Planning coordination is the real chief-to-convener route" };
  if (input.rosterFacts.flowId !== input.flowId || input.modulesFacts.flowId !== input.flowId
    || input.rosterFacts.proposal !== input.proposal.path || (input.rosterFacts.modulesDoc !== undefined && input.rosterFacts.modulesDoc !== input.modules.path)
    || JSON.stringify(input.rosterFacts.modules) !== JSON.stringify(input.modulesFacts.modules)
    || [input.proposal, input.modules, input.roster].some(ref => !ref.path || !/^[a-f0-9]{64}$/i.test(ref.sha256)))
    return { ok: false, reason: "Planning needs the real consistent proposal, roster and authoritative modules references" };
  return { ok: true };
}

/** Plan formation only: ownership comes from the supplied parsed roster, never from this plan. */
export function parseTeamPlan(text: string, context: {
  flowId: string; version: number; modules: TeamPlanFacts["modules"]; roster: TeamPlanFacts["roster"]; rosterFacts: ProjectRoster;
}): { ok: true; plan: TeamPlanFacts } | { ok: false; reason: string } {
  const invalid = (reason: string) => ({ ok: false as const, reason });
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
  const strings = (value: unknown, empty = false): value is string[] => Array.isArray(value) && (empty || value.length > 0)
    && value.every(item => typeof item === "string" && item.trim() === item && item.length > 0) && new Set(value).size === value.length;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return invalid("Team plan requires its machine frontmatter; a schema-only historical plan is read-only");
  let parsed: unknown; try { parsed = parseYaml(match[1]!); } catch { return invalid("Team plan YAML is invalid or ambiguous"); }
  if (!object(parsed) || !exact(parsed, ["schema", "flowId", "version", "modules", "roster", "roleRows"])
    || parsed.schema !== TEAM_PLAN_SCHEMA || parsed.flowId !== context.flowId || parsed.version !== context.version
    || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) return invalid("Team plan schema, fields, flow or version differ from its real reference");
  for (const key of ["modules", "roster"] as const) {
    const ref = parsed[key], expected = context[key];
    if (!object(ref) || !exact(ref, ["path", "sha256"]) || ref.path !== expected.path || ref.sha256 !== expected.sha256
      || !/^[a-f0-9]{64}$/i.test(expected.sha256)) return invalid(`Team plan ${key} reference differs from the applicable immutable baseline`);
  }
  if (!Array.isArray(parsed.roleRows) || parsed.roleRows.length !== context.rosterFacts.roles.length || !parsed.roleRows.length)
    return invalid("Team plan role rows must cover the real roster exactly once");
  const rows: TeamPlanFacts["roleRows"] = [], seen = new Set<string>(), writes: Array<{ roleId: string; path: string }> = [];
  for (const row of parsed.roleRows) {
    if (!object(row) || !exact(row, ["roleId", "modules", "writesets", "dependsOn"]) || typeof row.roleId !== "string"
      || seen.has(row.roleId) || !strings(row.modules) || !strings(row.writesets) || !strings(row.dependsOn, true)) return invalid("Team plan role, modules, writesets and explicit dependency arrays are required and unique");
    const role = context.rosterFacts.roles.find(role => role.id === row.roleId);
    if (!role || [...role.modules].sort().join("\0") !== [...row.modules].sort().join("\0")) return invalid("Team plan cannot assign unknown roles/modules or change the roster's module owner");
    const roots = context.rosterFacts.modules.filter(module => role.modules.includes(module.id)).flatMap(module => module.paths);
    const writesets = row.writesets;
    for (const raw of writesets) {
      const normalized = normalizeModulePath(raw);
      if (!normalized || normalized.path !== raw || /[\\:\x00-\x1f]/.test(raw) || isGovernanceDirectory(raw)
        || !roots.some(root => root === raw || (root.endsWith("/") && raw.startsWith(root)))) return invalid(`Team plan writeset exceeds its roster owner: ${row.roleId}`);
      if (writes.some(write => modulePathsOverlap(write.path, raw))) return invalid("Team plan contains overlapping writers or duplicate writesets");
      writes.push({ roleId: row.roleId, path: raw });
    }
    if (role.modules.some(moduleId => !context.rosterFacts.modules.find(module => module.id === moduleId)?.paths.some(root => writesets.some(write => write === root || (root.endsWith("/") && write.startsWith(root))))))
      return invalid("Every assigned module needs a concrete writeset within its own root");
    seen.add(row.roleId); rows.push({ roleId: row.roleId, modules: [...row.modules], writesets: [...row.writesets], dependsOn: [...row.dependsOn] });
  }
  if (rows.some(row => row.dependsOn.some(roleId => roleId === row.roleId || !seen.has(roleId)))) return invalid("Team plan dependency is unknown or refers to itself");
  const visiting = new Set<string>(), complete = new Set<string>();
  const visit = (roleId: string): boolean => {
    if (visiting.has(roleId)) return false;
    if (complete.has(roleId)) return true;
    visiting.add(roleId);
    if (!rows.find(row => row.roleId === roleId)!.dependsOn.every(visit)) return false;
    visiting.delete(roleId); complete.add(roleId); return true;
  };
  if (!rows.every(row => visit(row.roleId))) return invalid("Team plan dependencies contain a cycle");
  return { ok: true, plan: { schema: TEAM_PLAN_SCHEMA, flowId: context.flowId, version: context.version,
    modules: { ...context.modules }, roster: { ...context.roster }, roleRows: rows } };
}

// 2026-11-03（contract_check topic）：本文件的 schema 文本/示例（`contractSchemaText` 与
// `PROJECT_*_SCHEMA_EXAMPLE`）必须与解析规则、错误文案同步修改；改校验/文案时同步更新上述常量与文本。

/** `topic=topology` 的最小合法示例（roster 示例直接引用，避免第二份副本）。 */
export const PROJECT_TOPOLOGY_SCHEMA_EXAMPLE = [
  `schema: ${PROJECT_TOPOLOGY_SCHEMA}`,
  "modules:",
  "  - id: core",
  "    path: src/",
  "    roleId: implementer",
  "roles:",
  "  - id: implementer",
  "    modules: [core]",
  "management: [convener, implementer]",
].join("\n");

/** `topic=modules` 的最小合法示例（只含 frontmatter）。 */
export const PROJECT_MODULES_SCHEMA_EXAMPLE = [
  "---",
  `schema: ${PROJECT_MODULES_SCHEMA}`,
  "flowId: demo",
  "version: 1",
  "modules:",
  "  - id: core",
  "    name: 核心",
  "    purpose: 核心逻辑与公开接口",
  "    category: core",
  "    path: src/",
  "    publicContract: internal（核心约定）",
  "    architectureSource: docs/contracts/demo-architecture-v1.md",
  "---",
].join("\n");

/** `topic=roster` 的最小合法示例（topology 块直接引用 topology 示例）。 */
export const PROJECT_ROSTER_SCHEMA_EXAMPLE = [
  "---",
  `schema: ${PROJECT_ROSTER_SCHEMA}`,
  "flowId: demo",
  "version: 1",
  "intent: docs/product/demo-intent-v1.md",
  "proposal: docs/proposals/demo-proposal-v1.md",
  "architecture: docs/contracts/demo-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: <小项目省略理由；默认项目不要照抄>",
  "modules:",
  "  - id: core",
  "    name: 核心",
  "    purpose: 核心逻辑与公开接口",
  "    category: core",
  "    path: src/",
  "    publicContract: internal（核心约定）",
  "    architectureSource: docs/contracts/demo-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 核心实现",
  "    capability: TS",
  "    modules: [core]",
  "---",
  "## 人员+模块拓扑图",
  "```topology",
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  "```",
].join("\n");

const CONTRACT_MODULES_SCHEMA_TEXT = [
  "contract_check topic=modules（只读 schema；查询不构成放行/授权）",
  "（仅 schema 与示例；不含 run/写区；其余参数被忽略）",
  `文档：docs/proposals/<flowId>-modules-vN.md（唯一权威源；schema 必须恰为 ${PROJECT_MODULES_SCHEMA}）`,
  "加载校验：文件名 -vN 的 N 必须 = frontmatter version；flowId 与派发一致；roster 加载要求存在最新本文件且 parseProjectModules(flowId) 通过。",
  "frontmatter 顶层（必填；值不可为 null）：",
  `- schema: 字面量 ${PROJECT_MODULES_SCHEMA}`,
  "- flowId: 非空 string（与派发一致）",
  "- version: 正整数（与文件名 -vN 的 N 一致）",
  "- modules: 数组 1–12 项",
  "modules[] 每项（必填键；值不可为 null）：",
  "- id: string；小写 slug ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$（2–64 字符；不含首/尾连字符）；唯一",
  "- name: string；非空（trim 后）",
  "- purpose: string；非空（兼容别名 responsibility）",
  "- category: string；小写 slug ^[a-z0-9][a-z0-9-]{0,31}$（1–32 字符；实现正则不区分大小写）；env/entry 为保留类别，名单中只能由 env-bootstrap 拥有（本条由名单解析强制）",
  "- path: string；普通模块只写本项；项目相对；尾 / = 目录，否则 = 文件；禁绝对/盘符/通配 *?[]{}! /空段/./..",
  "- paths: string[]；1–20 项（单值按 1 项）；仅 env-resources/entry-index 可多路径（名单解析强制）；与 path 同时给出时 paths[0] 必须等于 path（兼容写法，不建议同时写）",
  `- publicContract: string；非空（trim 后）；不能写 YAML 布尔 true/false；例 "internal（核心约定）" 或 docs/contracts/<flowId>-contract-v1.md`,
  `- architectureSource: string；非空（trim 后）；写作约定为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）；解析器只校验非空，不校验路径形状`,
  "约束：模块路径之间不得相同或包含（同父文件与目录合法）；不得落在治理写区（.ans/、角色卡/、docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit/ 等）。",
  "最小合法示例（flowId=demo；写入时把 demo 替换为实际 flowId）：",
  PROJECT_MODULES_SCHEMA_EXAMPLE,
].join("\n");

const CONTRACT_ROSTER_SCHEMA_TEXT = [
  "contract_check topic=roster（只读 schema；查询不构成放行/授权）",
  "（仅 schema 与示例；不含 run/写区；其余参数被忽略）",
  `文档：docs/proposals/<flowId>-roster-vN.md（schema 必须恰为 ${PROJECT_ROSTER_SCHEMA}；modules[] 是 modules 文档的派生快照，加载时逐项比对）`,
  "frontmatter 顶层（必填项的值不可为 null；可选项见下）：",
  `- schema: 字面量 ${PROJECT_ROSTER_SCHEMA}`,
  "- flowId: 非空 string（与派发一致）；version: 正整数（=文件名 -vN 的 N）",
  "- intent: docs/product/<flowId>-intent-vM.md；proposal: docs/proposals/<flowId>-proposal-vM.md；architecture: docs/contracts/<flowId>-architecture-vM.md（均完整路径，M≥1）",
  "- modulesDoc: 可选；docs/proposals/<flowId>-modules-vM.md",
  `- envBootstrap: 对象（omitted:boolean），可省略；未写/omitted:false 时须含 env-bootstrap + env-resources(env)/entry-index(entry)（角色存在性由招人前置校验）；{omitted:true, omissionReason:"<非空理由>"} 时不得含 env-bootstrap 或 env/entry 模块；勿写旧扁平字段。`,
  "- modules: 数组 1–12；每项同 topic=modules，另须每模块恰一属主",
  "- roles: 数组 1–12；每项：",
  "  - id: 小写 slug（同模块 id）；唯一；不得为内置 id（chief/product/rapporteur/nominator/convener/verifier/su/liaison）",
  "  - displayName/purpose/capability: 非空 string",
  "  - modules: 非空 string[]；引用已定义模块 id；角色内不重复",
  "绑定：roles[].modules[] 唯一来源；每模块恰一属主、每角色至少一模块；env/entry 只能归 env-bootstrap。",
  "正文：必须有「人员+模块拓扑图」章节含 ```topology 块（见 topic=topology），与 frontmatter modules/roles 一致。",
  "加载校验（硬拒绝；解析器之外）：",
  "- 最新 roster 必须存在/可读（roster-missing）；文件名 vN 必须 = frontmatter version（roster-version-invalid）。",
  "- 必须存在最新 modules 文档（roster-modules-doc-missing）；其 vN=version 且 parseProjectModules(flowId) 通过（roster-modules-doc-invalid）。",
  "- roster modules[] 必须与最新 modules 文档逐项一致（roster-modules-drift）；modulesDoc 若写必须指向最新（roster-reference-stale）。",
  "- intent/proposal/architecture 必须存在、非空（roster-reference-missing）且为各自最新版（roster-reference-stale）。",
  "- proposal 必须 schema: project-proposal/v2 且正文含名单的 intent 路径（roster-reference-invalid/inconsistent）；architecture 正文必须含名单的 proposal 路径（roster-reference-inconsistent）。",
  "最小示例（flowId=demo；省略 env-bootstrap 仅为最小形状）：",
  "警告：示例只保证解析器通过；加载还需满足上方引用/模块清单/版本链校验。",
  "警告：默认项目不要照抄省略块；须含 env-bootstrap（或写真实省略理由）。",
  "警告：占位 omissionReason 必须替换，不得原样提交。",
  PROJECT_ROSTER_SCHEMA_EXAMPLE,
].join("\n");

const CONTRACT_TOPOLOGY_SCHEMA_TEXT = [
  "contract_check topic=topology（只读 schema；查询不构成放行/授权）",
  "（仅 schema 与示例；不含 run/写区；其余参数被忽略）",
  `位置：roster 正文「人员+模块拓扑图」章节内的 \`\`\`topology YAML 块（唯一机器可读格式；schema 必须恰为 ${PROJECT_TOPOLOGY_SCHEMA}）。`,
  "块顶层（必填；值不可为 null）：",
  `- schema: 字面量 ${PROJECT_TOPOLOGY_SCHEMA}`,
  "- modules: 数组；每项：id（非空 string）、path 或 paths（string 或 string[]，至少 1 项；项目相对；尾 / = 目录）、roleId（非空 string）；拓扑节点不要求 category",
  "- roles: 数组；每项：id（非空 string）、modules（非空 string[]）",
  "- management: 扁平字符串数组；必须含 convener 与全部项目角色 id；不要写 management.roles 或 mapping",
  "一致性：modules 的 id/路径集合/属主必须与 roster frontmatter modules[] 及 roles[].modules[] 完全一致；roles 的 id/modules 集合也必须一致；modules 与 roles 的数量也必须一致。",
  "最小合法示例（与 topic=roster 示例的绑定一致）：",
  "```topology",
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  "```",
].join("\n");

const CONTRACT_SCHEMA_TEXTS: Record<ContractSchemaTopic, string> = {
  modules: CONTRACT_MODULES_SCHEMA_TEXT,
  roster: CONTRACT_ROSTER_SCHEMA_TEXT,
  topology: CONTRACT_TOPOLOGY_SCHEMA_TEXT,
};

/** `contract_check({topic})` 的只读 schema 文本：纯静态内容，不读盘、不混 run 摘要。 */
export function contractSchemaText(topic: ContractSchemaTopic): string {
  return CONTRACT_SCHEMA_TEXTS[topic];
}

/** 2026-10-29（客户采纳）：标准固定角色「环境装配」；默认必带（小项目省略须写明理由）。 */
export const ENV_BOOTSTRAP_ROLE_ID = "env-bootstrap" as const;
const ENV_MODULE_PATTERNS: readonly RegExp[] = [
  /^package\.json$/i,
  /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig\.json|Makefile|Dockerfile|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|CMakeLists\.txt)$/i,
  /^(?:vite|webpack|rollup|esbuild|babel|jest|vitest)\.config\.[a-z0-9]+$/i,
  /^scripts\//i,
  /^\.github\//i,
];
const ENTRY_MODULE_PATTERNS: readonly RegExp[] = [
  /^index\.html$/i,
  /^src\/main\.[a-z0-9]+$/i,
  /^server\.[a-z0-9]+$/i,
];
function isEnvBootstrapModulePath(path: string): boolean {
  return ENV_MODULE_PATTERNS.some((pattern) => pattern.test(path));
}
function isProjectEntryModulePath(path: string): boolean {
  return ENTRY_MODULE_PATTERNS.some((pattern) => pattern.test(path));
}
function isEnvOrEntryPath(path: string): boolean {
  return isEnvBootstrapModulePath(path) || isProjectEntryModulePath(path);
}

/** 名单角色 id 形状（小写 slug；与治理 slug 一致的收紧口径：不得首/尾连字符）。 */
const ROSTER_ROLE_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

/** 内置治理角色 id（含旧 su/liaison）——名单不得包含。 */
const BUILT_IN_ROLE_IDS = new Set([
  "chief",
  "product",
  "rapporteur",
  "nominator",
  "convener",
  "verifier",
  "su",
  "liaison",
]);

/** 名单目录不得落在治理/他人写区（项目相对路径前缀；大小写不敏感比较）。 */
const GOVERNANCE_DIR_PREFIXES = [
  ".ans/",
  "角色卡/",
  "docs/intents/",
  "docs/product/",
  "docs/proposals/",
  "docs/contracts/",
  "docs/scheduling/",
  "docs/quality/",
  "docs/verification/",
  "docs/skills/",
  "docs/mcp/",
  "docs/audit/",
  "docs/bootstrap-manifest.md",
];

export interface ProjectRosterRole {
  id: string;
  displayName: string;
  purpose: string;
  capability: string;
  /** 该角色名下的模块 id（一模块一属主；角色可多模块；授权目录由模块派生）。 */
  modules: string[];
}

/**
 * 2026-10-29（客户追加口径 v2.6/R1）：名单模块清单——先写模块，再把模块安排给人。
 * 一个模块**恰好一个文件夹**（单目录、非文件、非多个目录），一模块一属主；
 * 模块目录互不重叠且不得互相嵌套（同父目录的兄弟目录合法）；角色可拥有多个模块。
 * 模块字段与设计 v2.6 一致：id/name/purpose/directory/publicContract/architectureSource。
 */
export interface ProjectRosterModule {
  id: string;
  name: string;
  purpose: string;
  /** 规范化路径数组：普通模块 1 项；固定 env/entry 模块可多路径（paths[] 例外）。 */
  paths: string[];
  /** 兼容字段：paths[0]。 */
  path: string;
  /** 必填类别：env=环境/资源装配，entry=入口/索引，其他为领域类别（如 core/docs）。 */
  category: string;
  publicContract: string;
  architectureSource: string;
}

export interface ProjectRoster {
  schema: typeof PROJECT_ROSTER_SCHEMA;
  flowId: string;
  version: number;
  /** 版本化引用（必须指向最新版本文件；旧版只读）。 */
  intent: string;
  proposal: string;
  architecture: string;
  /** v2.21：模块清单版本化引用（可选；缺省时按最新 modules 文档自动发现）。 */
  modulesDoc?: string;
  /** 模块清单（1–12 项；派生快照，权威源为 `<flowId>-modules-vN.md`）。 */
  modules: ProjectRosterModule[];
  roles: ProjectRosterRole[];
  /** v2.20：env-bootstrap 状态对象（{omitted, omissionReason}）；旧扁平字段读时归一化。 */
  envBootstrap?: { omitted: boolean; omissionReason?: string };
}

/** 模块清单文档（唯一权威源）。 */
export interface ProjectModulesDoc {
  schema: typeof PROJECT_MODULES_SCHEMA;
  flowId: string;
  version: number;
  modules: ProjectRosterModule[];
}

export interface RosterParseOk {
  ok: true;
  roster: ProjectRoster;
}

export interface RosterParseError {
  ok: false;
  code:
    | "roster-frontmatter-missing"
    | "roster-yaml-invalid"
    | "roster-schema-invalid"
    | "roster-flow-mismatch"
    | "roster-version-invalid"
    | "roster-roles-invalid"
    | "roster-role-id-invalid"
    | "roster-role-builtin"
    | "roster-role-duplicate"
    | "roster-role-fields-missing"
    | "roster-role-modules-invalid"
    | "roster-directory-invalid"
    | "roster-directory-governance"
    | "roster-directory-overlap"
    | "roster-modules-invalid"
    | "roster-module-fields-missing"
    | "roster-module-id-invalid"
    | "roster-module-directory-invalid"
    | "roster-module-directory-governance"
    | "roster-module-directory-overlap"
    | "roster-module-role-invalid"
    | "roster-module-owner-invalid"
    | "roster-env-bootstrap-invalid"
    | "roster-module-unbound"
    | "roster-role-without-module"
    | "roster-module-multi-owner"
    | "roster-topology-missing"
    | "roster-topology-invalid"
    | "roster-topology-mismatch"
    | "roster-reference-invalid"
    | "roster-reference-missing"
    | "roster-reference-stale"
    | "roster-reference-inconsistent";
  reason: string;
}

export type RosterParseResult = RosterParseOk | RosterParseError;

function rosterError(code: RosterParseError["code"], reason: string): RosterParseError {
  return { ok: false, code, reason };
}

/** 错误文案的「收到」类型描述（不回显字符串内容；boolean 按 `boolean: true|false` 回显）。 */
function describeContractValue(value: unknown): string {
  if (value === undefined) return "未提供";
  if (value === null) return "null";
  if (typeof value === "string") return value.trim() === "" ? "string（空）" : "string";
  if (typeof value === "boolean") return `boolean: ${value}`;
  if (typeof value === "number") return `number: ${value}`;
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object（mapping）";
  return typeof value;
}

/** 目录归一化：项目相对、posix、以 `/` 结尾；拒绝绝对路径/`..`/通配/空段。 */
function normalizeRosterDirectory(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().replace(/\\/g, "/");
  if (value === "") return undefined;
  if (/[*?[\]{}!]/.test(value)) return undefined; // 通配
  if (value.startsWith("/") || /^[a-zA-Z]:\//.test(value)) return undefined; // 绝对
  const withSlash = value.endsWith("/") ? value : `${value}/`;
  const segments = withSlash.slice(0, -1).split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return `${segments.join("/")}/`;
}

function isGovernanceDirectory(directory: string): boolean {
  const lower = directory.toLowerCase().replace(/\/+$/, "");
  return GOVERNANCE_DIR_PREFIXES.some((prefix) => {
    const p = prefix.toLowerCase().replace(/\/+$/, "");
    return lower === p || lower.startsWith(`${p}/`) || lower.includes(`/${p}/`) || lower.endsWith(`/${p}`);
  });
}

function directoriesOverlap(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  return aLower.startsWith(bLower) || bLower.startsWith(aLower);
}

/** 模块路径：以 `/` 结尾=目录（保留尾斜杠）；否则=单个文件（保留无尾斜杠）。 */
function normalizeModulePath(raw: unknown): { path: string; kind: "file" | "directory" } | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().replace(/\\/g, "/");
  if (value === "" || /[*?[\]{}!]/.test(value)) return undefined;
  if (value.startsWith("/") || /^[a-zA-Z]:\//.test(value)) return undefined;
  const segments = value.replace(/\/$/, "").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  const normalized = segments.join("/");
  if (value.endsWith("/")) return { path: `${normalized}/`, kind: "directory" };
  return { path: normalized, kind: "file" };
}

function modulePathKind(path: string): "file" | "directory" {
  return path.endsWith("/") ? "directory" : "file";
}

/** 冲突：路径相同或一方包含另一方；目录包含其下文件/子目录；同父文件与目录合法。 */
function modulePathsOverlap(a: string, b: string): boolean {
  const aKind = modulePathKind(a);
  const bKind = modulePathKind(b);
  const aLower = a.toLowerCase().replace(/\/+$/, "");
  const bLower = b.toLowerCase().replace(/\/+$/, "");
  if (aLower === bLower) return true;
  if (aKind === "directory" && bKind === "directory") {
    return aLower.startsWith(`${bLower}/`) || bLower.startsWith(`${aLower}/`);
  }
  if (aKind === "directory" && bKind === "file") return bLower.startsWith(`${aLower}/`);
  if (aKind === "file" && bKind === "directory") return aLower.startsWith(`${bLower}/`);
  return false;
}

/** 版本化文档引用：`docs/<dir>/<flowId>-<doc>-vN.md`（不原地改，引用最新版本）。 */
function parseVersionedRef(
  raw: unknown,
  flowId: string,
  kind: "intent" | "proposal" | "modules" | "architecture",
): { ok: true; path: string; version: number } | { ok: false; reason: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: `缺 ${kind} 版本化引用（docs/.../<flowId>-${kind}-vN.md）。` };
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern =
    kind === "intent"
      ? new RegExp(`^docs/product/${escaped}-intent-v(\\d+)\\.md$`)
      : kind === "proposal"
        ? new RegExp(`^docs/proposals/${escaped}-proposal-v(\\d+)\\.md$`)
        : kind === "modules"
          ? new RegExp(`^docs/proposals/${escaped}-modules-v(\\d+)\\.md$`)
          : new RegExp(`^docs/contracts/${escaped}-architecture-v(\\d+)\\.md$`);
  const match = pattern.exec(raw.trim().replace(/\\/g, "/"));
  if (match === null) {
    return { ok: false, reason: `${kind} 引用必须为版本化路径 docs/.../<flowId>-${kind}-vN.md：${raw}` };
  }
  const version = Number(match[1]);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, reason: `${kind} 引用版本号非法：${raw}` };
  }
  return { ok: true, path: raw.trim().replace(/\\/g, "/"), version };
}


type TopologyValidation =
  | { ok: true }
  | { ok: false; code: "roster-topology-missing" | "roster-topology-invalid" | "roster-topology-mismatch"; reason: string };

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return set.size === right.length && right.every((item) => set.has(item));
}

/**
 * 2026-10-29（客户追加口径）：名单必须附「人员+模块拓扑图」——模块（文件夹地址）→ 属主角色、
 * 角色 → 名下模块、运营（convener）对项目角色的管理关系。要求名单正文含 `## ...拓扑图...` 章节，
 * 章节内有 ```topology YAML 块，且与 frontmatter modules/roles 绑定**完全一致**（单一来源）。
 */
function validateRosterTopology(
  body: string,
  roles: readonly ProjectRosterRole[],
  modules: readonly ProjectRosterModule[],
): TopologyValidation {
  const heading = /^#{1,6}\s+[^\n]*拓扑图[^\n]*$/m.exec(body);
  if (heading === null) {
    return { ok: false, code: "roster-topology-missing", reason: "名单正文缺「人员+模块拓扑图」章节（含 ```topology YAML 块）。" };
  }
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextHeading = /^#{1,6}\s+/m.exec(afterHeading);
  const section = nextHeading !== null ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  const fenced = /```topology\s*\r?\n([\s\S]*?)```/i.exec(section);
  if (fenced === null) {
    return { ok: false, code: "roster-topology-invalid", reason: "拓扑图章节必须含 ```topology 围栏 YAML 块。" };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(fenced[1]!);
  } catch (error) {
    return {
      ok: false,
      code: "roster-topology-invalid",
      reason: `拓扑图 YAML 非法：${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "roster-topology-invalid", reason: "拓扑图必须是对象（modules/roles/management）。" };
  }
  const doc = parsed as Record<string, unknown>;
  if (doc.schema !== PROJECT_TOPOLOGY_SCHEMA) {
    return {
      ok: false,
      code: "roster-topology-mismatch",
      reason: `拓扑图 schema 必须恰为 ${PROJECT_TOPOLOGY_SCHEMA}；旧 v1 请按 v2 重出拓扑图（modules[] 每项 id/path 或 paths[]/roleId；roles[] 每项 id/modules[]；management 为扁平数组，含 convener 与全部项目角色 id），不做静默归一化。`,
    };
  }
  if (!Array.isArray(doc.modules) || !Array.isArray(doc.roles)) {
    return { ok: false, code: "roster-topology-invalid", reason: "拓扑图必须含 modules[] 与 roles[]。" };
  }
  const managementRaw = doc.management;
  const management = Array.isArray(managementRaw)
    ? managementRaw.filter((item): item is string => typeof item === "string")
    : typeof managementRaw === "string"
      ? [managementRaw]
      : [];
  if (!management.includes("convener")) {
    return { ok: false, code: "roster-topology-mismatch", reason: `拓扑图 management 的写作格式是扁平字符串数组（如 management: [convener, <全部项目角色 id>]），且必须含 convener；收到 ${describeContractValue(managementRaw)}（mapping → object（mapping），数组 → array(N)）；解析器兼容单个字符串（不推荐），不接受 management.roles 这种 mapping。` };
  }
  for (const role of roles) {
    if (!management.includes(role.id)) {
      return {
        ok: false,
        code: "roster-topology-mismatch",
        reason: `拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）；management 是扁平字符串数组，须含 convener 与全部项目角色 id。`,
      };
    }
  }
  const expectedOwner = new Map<string, string>();
  for (const role of roles) for (const moduleId of role.modules) expectedOwner.set(moduleId, role.id);
  const topologyModules = new Map<string, { paths: string[]; roleId: string }>();
  for (const [index, raw] of doc.modules.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图第 ${index + 1} 个模块不是对象。` };
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const rawPaths: unknown[] = entry.paths !== undefined
      ? (Array.isArray(entry.paths) ? entry.paths : [entry.paths])
      : entry.path !== undefined
        ? [entry.path]
        : [];
    const paths: string[] = [];
    for (const rawPath of rawPaths) {
      const normalized = typeof rawPath === "string" ? normalizeModulePath(rawPath)?.path : undefined;
      if (normalized === undefined) {
        return { ok: false, code: "roster-topology-invalid", reason: `拓扑图模块第 ${index + 1} 项 path/paths 非法。` };
      }
      paths.push(normalized);
    }
    const roleId = typeof entry.roleId === "string" ? entry.roleId.trim() : "";
    if (id === "" || paths.length === 0 || roleId === "") {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图模块第 ${index + 1} 项缺 id/path/roleId。` };
    }
    topologyModules.set(id, { paths: paths.sort(), roleId });
  }
  if (topologyModules.size !== modules.length) {
    return { ok: false, code: "roster-topology-mismatch", reason: "拓扑图模块数与 frontmatter modules 不一致。" };
  }
  for (const module of modules) {
    const entry = topologyModules.get(module.id);
    const owner = expectedOwner.get(module.id);
    if (entry === undefined || owner === undefined) {
      return { ok: false, code: "roster-topology-mismatch", reason: `拓扑图缺模块 ${module.id} 或绑定。` };
    }
    const expectedPaths = [...module.paths].sort();
    if (JSON.stringify(entry.paths) !== JSON.stringify(expectedPaths) || entry.roleId !== owner) {
      return {
        ok: false,
        code: "roster-topology-mismatch",
        reason: `拓扑图模块 ${module.id} 的路径/属主与 frontmatter 不一致（拓扑 ${entry.paths.join("、")} → ${entry.roleId}；名单 ${module.paths.join("、")} → ${owner}）。`,
      };
    }
  }
  const topologyRoles = new Map<string, string[]>();
  for (const [index, raw] of doc.roles.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图第 ${index + 1} 个角色不是对象。` };
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (id === "" || !Array.isArray(entry.modules) || !entry.modules.every((item) => typeof item === "string")) {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图角色第 ${index + 1} 项缺 id/modules[]。` };
    }
    topologyRoles.set(id, entry.modules.map((item) => (item as string).trim()));
  }
  if (topologyRoles.size !== roles.length) {
    return { ok: false, code: "roster-topology-mismatch", reason: "拓扑图角色数与 frontmatter roles 不一致。" };
  }
  for (const role of roles) {
    const topologyRoleModules = topologyRoles.get(role.id);
    if (topologyRoleModules === undefined || !sameStringSet(topologyRoleModules, role.modules)) {
      return { ok: false, code: "roster-topology-mismatch", reason: `拓扑图角色 ${role.id} 的模块绑定与 frontmatter 不一致。` };
    }
  }
  return { ok: true };
}

/** 应用生成的人员+模块拓扑图摘要（D3 卡 preview 使用；单一来源=已校验名单）。 */
export function rosterTopologyText(roster: ProjectRoster): string {
  const ownerOf = new Map<string, string>();
  for (const role of roster.roles) for (const moduleId of role.modules) ownerOf.set(moduleId, role.id);
  const lines: string[] = ["人员+模块拓扑图（应用依据名单生成）：", "模块 → 属主角色："];
  for (const module of roster.modules) {
    lines.push(`- ${module.id}（${module.name}；${module.paths.join("、")}）→ ${ownerOf.get(module.id) ?? "未绑定"}`);
  }
  lines.push("角色 → 名下模块：");
  for (const role of roster.roles) {
    const dirs = rosterDirectoriesFor(roster, role.id) ?? [];
    lines.push(`- ${role.id}（${role.displayName}）→ ${role.modules.join("、")}［${dirs.join("、")}］`);
  }
  lines.push("管理关系：运营（convener）管理所有项目角色；实现任务只来自运营，验收由质检执行并回报发起方。");
  return lines.join("\n");
}

/**
 * 解析名单 Markdown：严格 YAML frontmatter（文件首行 `---`，闭合 `---`）。
 * `expectedFlowId` 给出时要求 frontmatter `flowId` 完全一致（M2/M3 的「名单与派发一致」）。
 */
export function parseProjectRoster(text: string, expectedFlowId?: string): RosterParseResult {
  if (typeof text !== "string") return rosterError("roster-frontmatter-missing", "名单内容不是文本。");
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return rosterError("roster-frontmatter-missing", "名单缺少 YAML frontmatter（文件必须以 `---` 开始）。");
  }
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) {
    return rosterError("roster-frontmatter-missing", "名单 frontmatter 未闭合（缺少第二行 `---`）。");
  }
  const frontmatter = normalized.slice(4, end);
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter);
  } catch (error) {
    return rosterError("roster-yaml-invalid", `名单 frontmatter 不是合法 YAML：${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rosterError("roster-schema-invalid", "名单 frontmatter 必须是对象。");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema !== PROJECT_ROSTER_SCHEMA) {
    return rosterError("roster-schema-invalid", `名单 schema 必须恰为 ${PROJECT_ROSTER_SCHEMA}；旧 v1/v2 请按 v3 重出名单（modules[].path/paths + 必填 category + envBootstrap 对象），不做静默归一化。`);
  }
  const flowId = typeof record.flowId === "string" ? record.flowId.trim() : "";
  if (flowId === "") return rosterError("roster-schema-invalid", "名单缺少 flowId。");
  if (expectedFlowId !== undefined && flowId !== expectedFlowId) {
    return rosterError("roster-flow-mismatch", `名单 flowId=${flowId} 与本次派发 flowId=${expectedFlowId} 不一致。`);
  }
  const version = record.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return rosterError("roster-version-invalid", "名单 version 必须是正整数。");
  }
  // 2026-10-29（客户追加口径）：文档统一版本化；名单必须引用最新 intent/proposal/architecture。
  const intentRef = parseVersionedRef(record.intent, flowId, "intent");
  if (!intentRef.ok) return rosterError("roster-reference-invalid", intentRef.reason);
  const proposalRef = parseVersionedRef(record.proposal, flowId, "proposal");
  if (!proposalRef.ok) return rosterError("roster-reference-invalid", proposalRef.reason);
  const architectureRef = parseVersionedRef(record.architecture, flowId, "architecture");
  if (!architectureRef.ok) return rosterError("roster-reference-invalid", architectureRef.reason);
  const modulesRef = record.modulesDoc === undefined ? undefined : parseVersionedRef(record.modulesDoc, flowId, "modules");
  if (modulesRef !== undefined && !modulesRef.ok) return rosterError("roster-reference-invalid", modulesRef.reason);
  if (!Array.isArray(record.roles) || record.roles.length < 1 || record.roles.length > 12) {
    return rosterError("roster-roles-invalid", "名单 roles 必须是 1–12 项的数组。");
  }
  const roles: ProjectRosterRole[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of record.roles.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return rosterError("roster-role-fields-missing", `名单第 ${index + 1} 个角色不是对象。`);
    }
    const role = raw as Record<string, unknown>;
    const id = typeof role.id === "string" ? role.id.trim() : "";
    if (id === "" || !ROSTER_ROLE_ID_RE.test(id) || id.endsWith("-")) {
      return rosterError("roster-role-id-invalid", `名单第 ${index + 1} 个角色 id 非法（须小写 slug，不含首/尾连字符）：${String(role.id)}`);
    }
    if (BUILT_IN_ROLE_IDS.has(id)) {
      return rosterError("roster-role-builtin", `名单角色 id=${id} 是内置治理角色（禁止）。`);
    }
    if (seen.has(id)) return rosterError("roster-role-duplicate", `名单角色 id 重复：${id}`);
    seen.add(id);
    const displayName = typeof role.displayName === "string" ? role.displayName.trim() : "";
    const purpose = typeof role.purpose === "string" ? role.purpose.trim() : "";
    const capability = typeof role.capability === "string" ? role.capability.trim() : "";
    if (displayName === "" || purpose === "" || capability === "") {
      return rosterError("roster-role-fields-missing", `名单角色 ${id} 缺 displayName/purpose/capability（均须非空）。`);
    }
    if (!Array.isArray(role.modules) || role.modules.length === 0) {
      return rosterError("roster-role-modules-invalid", `名单角色 ${id} 缺 modules（至少绑定一个模块；角色可多模块）。`);
    }
    const roleModules: string[] = [];
    for (const rawModuleId of role.modules) {
      if (typeof rawModuleId !== "string") {
        return rosterError("roster-role-modules-invalid", `名单角色 ${id} 的 modules 含非字符串模块 id。`);
      }
      const moduleId = rawModuleId.trim();
      if (!ROSTER_ROLE_ID_RE.test(moduleId) || moduleId.endsWith("-")) {
        return rosterError("roster-module-id-invalid", `模块 id 非法（须小写 slug、至少 2 字符）：${moduleId}`);
      }
      if (roleModules.includes(moduleId)) {
        return rosterError("roster-role-modules-invalid", `名单角色 ${id} 重复绑定模块 ${moduleId}。`);
      }
      roleModules.push(moduleId);
    }
    roles.push({ id, displayName, purpose, capability, modules: roleModules });
  }

  // 2026-10-29（客户追加口径 v2.6/R1/R4/R5）：模块清单——先写模块，再把模块安排给人。
  //   · modules[] 每项 id/name/purpose/directory/publicContract/architectureSource（1–12 项）；
  //   · 一个模块恰好一个文件夹（不得数组/文件路径）；一模块一属主；模块目录不重叠不嵌套（同父兄弟合法）；
  //   · roles[].modules[] 是唯一绑定来源；每个模块恰好一个属主、每个角色至少绑定一个模块。
  const rawModules = record.modules;
  if (!Array.isArray(rawModules) || rawModules.length < 1 || rawModules.length > 12) {
    return rosterError("roster-modules-invalid", "名单 modules 必须是 1–12 项的数组（每模块一个文件夹）。");
  }
  const modules: ProjectRosterModule[] = [];
  const moduleIds = new Set<string>();
  for (const [index, raw] of rawModules.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return rosterError("roster-module-fields-missing", `名单第 ${index + 1} 个模块不是对象。`);
    }
    const module = raw as Record<string, unknown>;
    const id = typeof module.id === "string" ? module.id.trim() : "";
    const name = typeof module.name === "string" ? module.name.trim() : "";
    const purpose =
      typeof module.purpose === "string"
        ? module.purpose.trim()
        : typeof module.responsibility === "string"
          ? module.responsibility.trim()
          : "";
    const categoryRaw = typeof module.category === "string" ? module.category.trim() : "";
    if (categoryRaw === "") {
      return rosterError("roster-module-fields-missing", `模块 ${id} 缺 category（v3 必填：env/entry 或领域类别）。`);
    }
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/i.test(categoryRaw)) {
      return rosterError("roster-module-fields-missing", `模块 ${id} 的 category 非法：${categoryRaw}`);
    }
    const category = categoryRaw;
    const publicContract = typeof module.publicContract === "string" ? module.publicContract.trim() : "";
    const architectureSource = typeof module.architectureSource === "string" ? module.architectureSource.trim() : "";
    if (id === "" || !ROSTER_ROLE_ID_RE.test(id) || id.endsWith("-")) {
      return rosterError("roster-module-id-invalid", `模块 id 非法（须小写 slug、至少 2 字符）：${String(module.id)}`);
    }
    if (moduleIds.has(id)) return rosterError("roster-module-id-invalid", `模块 id 重复：${id}`);
    moduleIds.add(id);
    const prefix = `名单模块第 ${index + 1} 项（id=${id}）的`;
    const purposeReceived = module.purpose !== undefined && module.purpose !== null ? module.purpose : module.responsibility;
    if (name === "") {
      return rosterError("roster-module-fields-missing", `${prefix} name 必须是非空字符串（收到 ${describeContractValue(module.name)}）。`);
    }
    if (purpose === "") {
      return rosterError("roster-module-fields-missing", `${prefix} purpose 必须是非空字符串（收到 ${describeContractValue(purposeReceived)}）。`);
    }
    if (publicContract === "") {
      return rosterError(
        "roster-module-fields-missing",
        `${prefix} publicContract 必须是非空字符串（收到 ${describeContractValue(module.publicContract)}）；不能写 YAML 布尔 true/false。`,
      );
    }
    if (architectureSource === "") {
      return rosterError(
        "roster-module-fields-missing",
        `${prefix} architectureSource 必须是非空字符串（收到 ${describeContractValue(module.architectureSource)}）；应为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）。`,
      );
    }
    if (module.path !== undefined && module.paths !== undefined) {
      const single = normalizeModulePath(module.path)?.path;
      const first = Array.isArray(module.paths) && module.paths.length > 0 ? normalizeModulePath(module.paths[0])?.path : undefined;
      if (single === undefined || first === undefined || single !== first) {
        return rosterError("roster-module-directory-invalid", `模块「${name}」的 path 与 paths[0] 不一致。`);
      }
    }
    const rawPaths: unknown[] = module.paths !== undefined
      ? (Array.isArray(module.paths) ? module.paths : [module.paths])
      : module.path !== undefined
        ? [module.path]
        : [];
    if (rawPaths.length < 1 || rawPaths.length > 20) {
      return rosterError("roster-module-directory-invalid", `模块「${name}」paths 必须是 1–20 项。`);
    }
    const paths: string[] = [];
    for (const rawPath of rawPaths) {
      if (Array.isArray(rawPath)) {
        return rosterError("roster-module-directory-invalid", `模块「${name}」的 path 不能是数组。`);
      }
      const modulePath = normalizeModulePath(rawPath);
      if (modulePath === undefined) {
        return rosterError("roster-module-directory-invalid", `模块「${name}」的 path 非法（项目相对、无通配/..；以 / 结尾=目录，否则=文件）：${String(rawPath)}`);
      }
      if (isGovernanceDirectory(modulePath.path)) {
        return rosterError("roster-module-directory-governance", `模块「${name}」的 path 落在治理/他人写区（含治理子路径）：${modulePath.path}`);
      }
      if (paths.includes(modulePath.path)) {
        return rosterError("roster-module-directory-invalid", `模块「${name}」的 path 重复：${modulePath.path}`);
      }
      paths.push(modulePath.path);
    }
    modules.push({ id, name, purpose, paths, path: paths[0]!, category, publicContract, architectureSource });
  }
  const ownerOf = new Map<string, string[]>();
  for (const role of roles) {
    for (const moduleId of role.modules) {
      if (!moduleIds.has(moduleId)) {
        return rosterError("roster-module-role-invalid", `角色 ${role.id} 绑定了不存在的模块 id=${moduleId}。`);
      }
      const owners = ownerOf.get(moduleId) ?? [];
      owners.push(role.id);
      ownerOf.set(moduleId, owners);
    }
  }
  for (const module of modules) {
    const owners = ownerOf.get(module.id) ?? [];
    if (owners.length === 0) {
      return rosterError("roster-module-unbound", `模块 ${module.id}（${module.name}）未绑定任何角色（退回策划补绑定）。`);
    }
    if (owners.length > 1) {
      return rosterError("roster-module-multi-owner", `模块 ${module.id} 有多个属主（${owners.join("、")}）；一模块一属主。`);
    }
  }
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      for (const a of modules[i]!.paths) {
        for (const b of modules[j]!.paths) {
          if (modulePathsOverlap(a, b)) {
            return rosterError(
              "roster-module-directory-overlap",
              `模块路径重叠/嵌套：${modules[i]!.id} 的 ${a} 与 ${modules[j]!.id} 的 ${b}。`,
            );
          }
        }
      }
    }
  }
  // 2026-10-29（v2.20）：多路径 paths[] 仅限固定 env/entry 模块；普通模块必须单路径。
  for (const module of modules) {
    const owner = ownerOf.get(module.id)?.[0];
    if (owner !== ENV_BOOTSTRAP_ROLE_ID && module.paths.length > 1) {
      return rosterError("roster-module-directory-invalid", `模块 ${module.id} 为普通模块，paths 只能 1 项（多路径仅限 env-bootstrap 固定模块）。`);
    }
  }
  // 2026-10-29（客户采纳）：标准固定角色 env-bootstrap——默认必带，固定两个模块（环境装配/项目入口）；
  // 环境/入口类路径只能归它，误归属拒绝；小项目省略须有书面理由（预检检查）。
  let envBootstrap: { omitted: boolean; omissionReason?: string } | undefined;
  if (record.envBootstrap !== undefined) {
    const raw = record.envBootstrap;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as { omitted?: unknown }).omitted !== "boolean") {
      return rosterError("roster-schema-invalid", "envBootstrap 必须是对象且含 boolean omitted。");
    }
    const reason = typeof (raw as { omissionReason?: unknown }).omissionReason === "string"
      ? (raw as { omissionReason: string }).omissionReason.trim()
      : undefined;
    envBootstrap = { omitted: (raw as { omitted: boolean }).omitted, ...(reason !== undefined && reason !== "" ? { omissionReason: reason } : {}) };
  } else if (typeof record.envBootstrapOmittedReason === "string" && record.envBootstrapOmittedReason.trim() !== "") {
    // 读时归一化旧扁平字段。
    envBootstrap = { omitted: true, omissionReason: record.envBootstrapOmittedReason.trim() };
  }
  const envBootstrapOmitted = envBootstrap?.omitted === true;
  const envBootstrapRole = roles.find((role) => role.id === ENV_BOOTSTRAP_ROLE_ID);
  if (envBootstrapOmitted) {
    if (envBootstrap?.omissionReason === undefined || envBootstrap.omissionReason === "") {
      return rosterError("roster-env-bootstrap-invalid", "envBootstrap.omitted=true 时必须提供非空 omissionReason（书面省略理由）。");
    }
    if (envBootstrapRole !== undefined) {
      return rosterError("roster-env-bootstrap-invalid", `envBootstrap.omitted=true 时名单不得包含 ${ENV_BOOTSTRAP_ROLE_ID} 角色。`);
    }
    if (modules.some((module) => module.category === "env" || module.category === "entry")) {
      return rosterError("roster-env-bootstrap-invalid", "envBootstrap.omitted=true 时名单不得包含 category=env/entry 模块。");
    }
  }
  if (envBootstrapRole !== undefined) {
    const owned = modules.filter((module) => envBootstrapRole.modules.includes(module.id));
    const ownedIds = owned.map((module) => module.id).sort();
    if (JSON.stringify(ownedIds) !== JSON.stringify(["entry-index", "env-resources"])) {
      return rosterError("roster-env-bootstrap-invalid", `角色 ${ENV_BOOTSTRAP_ROLE_ID} 名下模块必须恰为 env-resources / entry-index，实际 ${ownedIds.join("、") || "无"}。`);
    }
    const envResources = owned.find((module) => module.id === "env-resources");
    const entryIndex = owned.find((module) => module.id === "entry-index");
    if (envResources?.category !== "env" || entryIndex?.category !== "entry") {
      return rosterError("roster-env-bootstrap-invalid", `角色 ${ENV_BOOTSTRAP_ROLE_ID} 的固定模块必须为 env-resources（category=env）与 entry-index（category=entry）。`);
    }
    const hasCategory = owned.some((module) => module.category !== undefined);
    const hasEnv = owned.some((module) => module.category === "env") || (!hasCategory && owned.some((module) => isEnvBootstrapModulePath(module.path)));
    const hasEntry = owned.some((module) => module.category === "entry") || (!hasCategory && owned.some((module) => isProjectEntryModulePath(module.path)));
    if (!hasEnv || !hasEntry) {
      return rosterError("roster-env-bootstrap-invalid", `角色 ${ENV_BOOTSTRAP_ROLE_ID} 必须同时拥有 category=env（装配/资源）与 category=entry（入口/索引）模块。`);
    }
  }
  // 领域中立：按模块 category 机械校验归属（代码文件名仅作可选启发式，不据此硬编码拒绝）。
  for (const module of modules) {
    if (module.category !== "env" && module.category !== "entry") continue;
    if (envBootstrapRole?.modules.includes(module.id) !== true) {
      return rosterError(
        "roster-module-owner-invalid",
        `category=${module.category} 的模块 ${module.id}（${module.paths.join("、")}）只能归属 ${ENV_BOOTSTRAP_ROLE_ID}。`,
      );
    }
  }
  // 2026-10-29（客户追加口径）：名单必须附「人员+模块拓扑图」，且与 modules/roles 绑定一致。
  const topology = validateRosterTopology(normalized.slice(end + 4), roles, modules);
  if (!topology.ok) return rosterError(topology.code, topology.reason);
  return {
    ok: true,
    roster: {
      schema: PROJECT_ROSTER_SCHEMA,
      flowId,
      version,
      intent: intentRef.path,
      proposal: proposalRef.path,
      architecture: architectureRef.path,
      ...(modulesRef !== undefined && modulesRef.ok ? { modulesDoc: modulesRef.path } : {}),
      modules,
      roles,
      ...(envBootstrap !== undefined ? { envBootstrap } : {}),
    },
  };
}

/** 解析模块清单文档 `<flowId>-modules-vN.md`（frontmatter：schema/flowId/version/modules[]）。 */
export function parseProjectModules(
  text: string,
  expectedFlowId?: string,
): { ok: true; doc: ProjectModulesDoc } | { ok: false; code: string; reason: string } {
  if (typeof text !== "string") return { ok: false, code: "modules-doc-frontmatter", reason: "模块清单内容不是文本。" };
  const normalized = text.replace(/^﻿/, "");
  if (!normalized.startsWith("---\n")) {
    return { ok: false, code: "modules-doc-frontmatter", reason: "模块清单缺少 YAML frontmatter。" };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) return { ok: false, code: "modules-doc-frontmatter", reason: "模块清单 frontmatter 未闭合。" };
  let parsed: unknown;
  try {
    parsed = parseYaml(normalized.slice(4, end));
  } catch (error) {
    return { ok: false, code: "modules-doc-yaml", reason: `模块清单 YAML 非法：${error instanceof Error ? error.message : String(error)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "modules-doc-schema", reason: "模块清单 frontmatter 必须是对象。" };
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema !== PROJECT_MODULES_SCHEMA) {
    return { ok: false, code: "modules-doc-schema", reason: `模块清单 schema 必须恰为 ${PROJECT_MODULES_SCHEMA}；旧 v1 请按 v2 重出模块清单（category/path 或 paths[]），不做静默归一化。` };
  }
  const flowId = typeof record.flowId === "string" ? record.flowId.trim() : "";
  if (flowId === "") return { ok: false, code: "modules-doc-schema", reason: "模块清单缺 flowId。" };
  if (expectedFlowId !== undefined && flowId !== expectedFlowId) {
    return { ok: false, code: "modules-doc-flow", reason: `模块清单 flowId=${flowId} 与期望 ${expectedFlowId} 不一致。` };
  }
  const version = record.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, code: "modules-doc-version", reason: "模块清单 version 必须是正整数。" };
  }
  const rawModules = record.modules;
  if (!Array.isArray(rawModules) || rawModules.length < 1 || rawModules.length > 12) {
    return { ok: false, code: "modules-doc-modules", reason: "模块清单 modules 必须是 1–12 项数组。" };
  }
  const modules: ProjectRosterModule[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of rawModules.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, code: "modules-doc-modules", reason: `模块清单第 ${index + 1} 项不是对象。` };
    }
    const module = raw as Record<string, unknown>;
    const id = typeof module.id === "string" ? module.id.trim() : "";
    const name = typeof module.name === "string" ? module.name.trim() : "";
    const purpose =
      typeof module.purpose === "string"
        ? module.purpose.trim()
        : typeof module.responsibility === "string"
          ? module.responsibility.trim()
          : "";
    const categoryRaw = typeof module.category === "string" ? module.category.trim() : "";
    if (categoryRaw === "" || !/^[a-z0-9][a-z0-9-]{0,31}$/i.test(categoryRaw)) {
      return { ok: false, code: "modules-doc-fields", reason: `模块 ${id} 缺合法 category（v3 必填）。` };
    }
    const category = categoryRaw;
    const publicContract = typeof module.publicContract === "string" ? module.publicContract.trim() : "";
    const architectureSource = typeof module.architectureSource === "string" ? module.architectureSource.trim() : "";
    if (id === "" || !ROSTER_ROLE_ID_RE.test(id) || id.endsWith("-")) {
      return { ok: false, code: "modules-doc-id", reason: `模块清单 id 非法：${String(module.id)}` };
    }
    if (ids.has(id)) return { ok: false, code: "modules-doc-id", reason: `模块清单 id 重复：${id}` };
    ids.add(id);
    const prefix = `模块清单第 ${index + 1} 项（id=${id}）的`;
    const purposeReceived = module.purpose !== undefined && module.purpose !== null ? module.purpose : module.responsibility;
    if (name === "") {
      return { ok: false, code: "modules-doc-fields", reason: `${prefix} name 必须是非空字符串（收到 ${describeContractValue(module.name)}）。` };
    }
    if (purpose === "") {
      return { ok: false, code: "modules-doc-fields", reason: `${prefix} purpose 必须是非空字符串（收到 ${describeContractValue(purposeReceived)}）。` };
    }
    if (publicContract === "") {
      return {
        ok: false,
        code: "modules-doc-fields",
        reason: `${prefix} publicContract 必须是非空字符串（收到 ${describeContractValue(module.publicContract)}）；不能写 YAML 布尔 true/false。`,
      };
    }
    if (architectureSource === "") {
      return {
        ok: false,
        code: "modules-doc-fields",
        reason: `${prefix} architectureSource 必须是非空字符串（收到 ${describeContractValue(module.architectureSource)}）；应为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）。`,
      };
    }
    if (module.path !== undefined && module.paths !== undefined) {
      const single = normalizeModulePath(module.path)?.path;
      const first = Array.isArray(module.paths) && module.paths.length > 0 ? normalizeModulePath(module.paths[0])?.path : undefined;
      if (single === undefined || first === undefined || single !== first) {
        return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} 的 path 与 paths[0] 不一致。` };
      }
    }
    const rawPaths: unknown[] = module.paths !== undefined
      ? (Array.isArray(module.paths) ? module.paths : [module.paths])
      : module.path !== undefined
        ? [module.path]
        : [];
    if (rawPaths.length < 1 || rawPaths.length > 20) {
      return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} paths 必须是 1–20 项。` };
    }
    const paths: string[] = [];
    for (const rawPath of rawPaths) {
      if (Array.isArray(rawPath)) {
        return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} path 不能是数组。` };
      }
      const modulePath = normalizeModulePath(rawPath);
      if (modulePath === undefined) {
        return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} path 非法：${String(rawPath)}` };
      }
      if (isGovernanceDirectory(modulePath.path)) {
        return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} path 落在治理/他人写区：${modulePath.path}` };
      }
      if (paths.includes(modulePath.path)) {
        return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} path 重复：${modulePath.path}` };
      }
      paths.push(modulePath.path);
    }
    modules.push({ id, name, purpose, paths, path: paths[0]!, category, publicContract, architectureSource });
  }
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      for (const a of modules[i]!.paths) {
        for (const b of modules[j]!.paths) {
          if (modulePathsOverlap(a, b)) {
            return { ok: false, code: "modules-doc-overlap", reason: `模块路径重叠/嵌套：${modules[i]!.id} 与 ${modules[j]!.id}。` };
          }
        }
      }
    }
  }
  return { ok: true, doc: { schema: PROJECT_MODULES_SCHEMA, flowId, version, modules } };
}

/** 名单版本文件形状：`<flowId>-roster-v<N>.md`。 */
export function rosterFileName(flowId: string, version: number): string {
  return `${flowId}-roster-v${version}.md`;
}

/** 从目录文件名里挑出指定 flowId 的最新名单版本（N 最大）；无匹配返回 {version:0, files:[]}。 */
export function selectLatestRosterFile(
  flowId: string,
  names: readonly string[],
): { version: number; file?: string; candidates: string[] } {
  const pattern = new RegExp(`^${flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-roster-v(\\d+)\\.md$`);
  let best = 0;
  let file: string | undefined;
  const candidates: string[] = [];
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    candidates.push(name);
    const version = Number(match[1]);
    if (Number.isInteger(version) && version > best) {
      best = version;
      file = name;
    }
  }
  return { version: best, ...(file !== undefined ? { file } : {}), candidates: candidates.sort() };
}

export interface LoadedRoster {
  roster: ProjectRoster;
  /** 项目相对路径（posix）。 */
  path: string;
  version: number;
  /** 名单文件字节 sha256（hex）。 */
  sha256: string;
}

export interface RosterLoadError {
  ok: false;
  code:
    | "roster-missing"
    | "roster-modules-doc-missing"
    | "roster-modules-doc-invalid"
    | "roster-modules-drift"
    | RosterParseError["code"];
  reason: string;
}

export type RosterLoadResult = ({ ok: true } & LoadedRoster) | RosterLoadError;

/**
 * 读取**最新**名单：`docs/proposals/<flowId>-roster-vN.md`（N 最大）→ 解析 → 校验文件版本号与
 * frontmatter version 一致 → 计算字节 sha256。读盘失败/缺失/非法都如实返回稳定 code（fail-closed）。
 */
export async function loadLatestRoster(
  input: {
    projectRoot: string;
    flowId: string;
    /** 测试注入（缺省 node:fs/promises）。 */
    readdirFn?: typeof readdir;
    readFileFn?: typeof readFile;
  },
): Promise<RosterLoadResult> {
  const readdirFn = input.readdirFn ?? readdir;
  const readFileFn = input.readFileFn ?? readFile;
  const relDir = path.posix.join("docs", "proposals");
  let names: string[];
  try {
    names = await readdirFn(path.join(input.projectRoot, relDir));
  } catch {
    return { ok: false, code: "roster-missing", reason: `未找到名单目录 docs/proposals/（flowId=${input.flowId}）。` };
  }
  const selected = selectLatestRosterFile(input.flowId, names);
  if (selected.file === undefined) {
    return {
      ok: false,
      code: "roster-missing",
      reason: `未找到 docs/proposals/${input.flowId}-roster-vN.md（最新名单缺失）。`,
    };
  }
  const relPath = `${relDir}/${selected.file}`;
  let bytes: Buffer;
  try {
    bytes = await readFileFn(path.join(input.projectRoot, relPath));
  } catch {
    return { ok: false, code: "roster-missing", reason: `名单文件不可读：${relPath}。` };
  }
  const parsed = parseProjectRoster(bytes.toString("utf8"), input.flowId);
  if (!parsed.ok) return parsed;
  if (parsed.roster.version !== selected.version) {
    return {
      ok: false,
      code: "roster-version-invalid",
      reason: `名单文件名版本 v${selected.version} 与 frontmatter version=${parsed.roster.version} 不一致。`,
    };
  }
  // 2026-10-29（v2.8 R7）：模块清单文档是唯一权威源；roster modules[] 必须与最新模块文档一致。
  const modulesPattern = new RegExp(`^${input.flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-modules-v(\\d+)\\.md$`);
  const moduleFiles: Array<{ version: number; file: string }> = [];
  try {
    for (const name of await readdirFn(path.join(input.projectRoot, "docs", "proposals"))) {
      const match = modulesPattern.exec(name);
      if (match !== null) moduleFiles.push({ version: Number(match[1]), file: name });
    }
  } catch {
    /* proposals 目录缺失 ⇒ 下面按 missing 报 */
  }
  moduleFiles.sort((a, b) => b.version - a.version);
  const latestModules = moduleFiles[0];
  if (latestModules === undefined) {
    return {
      ok: false,
      code: "roster-modules-doc-missing",
      reason: `未找到权威模块清单 docs/proposals/${input.flowId}-modules-vN.md；请先让策划出模块清单，再重出 roster。`,
    };
  }
  if (parsed.roster.modulesDoc !== undefined) {
    const latestModulesPath = `docs/proposals/${latestModules.file}`;
    if (parsed.roster.modulesDoc !== latestModulesPath) {
      return {
        ok: false,
        code: "roster-reference-stale",
        reason: `名单 modulesDoc=${parsed.roster.modulesDoc} 未指向最新模块清单 ${latestModulesPath}；请按最新版本重出 roster。`,
      };
    }
  }
  let modulesText: string;
  try {
    modulesText = await readFileFn(path.join(input.projectRoot, "docs", "proposals", latestModules.file), "utf8");
  } catch {
    return { ok: false, code: "roster-modules-doc-missing", reason: `模块清单不可读：docs/proposals/${latestModules.file}。` };
  }
  const modulesParsed = parseProjectModules(modulesText, input.flowId);
  if (!modulesParsed.ok) {
    return { ok: false, code: "roster-modules-doc-invalid", reason: modulesParsed.reason };
  }
  if (modulesParsed.doc.version !== latestModules.version) {
    return {
      ok: false,
      code: "roster-modules-doc-invalid",
      reason: `模块清单文件名 v${latestModules.version} 与 frontmatter version=${modulesParsed.doc.version} 不一致。`,
    };
  }
  if (JSON.stringify(modulesParsed.doc.modules) !== JSON.stringify(parsed.roster.modules)) {
    return {
      ok: false,
      code: "roster-modules-drift",
      reason:
        `roster modules[] 与权威模块清单 v${modulesParsed.doc.version} 不一致；` +
        "请以 docs/proposals/<flowId>-modules-vN.md 为准重出 roster（不得手改快照）。",
    };
  }
  // 2026-10-29（客户追加口径）：版本化引用必须存在、指向该 flow 的最新版本，且 proposal→intent /
  // architecture→proposal 的引用链一致；旧版本只读（文件名带版本，加载只取最新）。
  const escapedFlow = input.flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const latestVersionIn = async (dir: string, pattern: RegExp): Promise<number> => {
    try {
      const names = await readdirFn(path.join(input.projectRoot, dir));
      let best = 0;
      for (const name of names) {
        const match = pattern.exec(name);
        if (match !== null) best = Math.max(best, Number(match[1]));
      }
      return best;
    } catch {
      return 0;
    }
  };
  const intentPattern = new RegExp(`^${escapedFlow}-intent-v(\\d+)\\.md$`);
  const proposalPattern = new RegExp(`^${escapedFlow}-proposal-v(\\d+)\\.md$`);
  const architecturePattern = new RegExp(`^${escapedFlow}-architecture-v(\\d+)\\.md$`);
  const refs: Array<{ kind: "intent" | "proposal" | "architecture"; path: string; dir: string; pattern: RegExp }> = [
    { kind: "intent", path: parsed.roster.intent, dir: "docs/product", pattern: intentPattern },
    { kind: "proposal", path: parsed.roster.proposal, dir: "docs/proposals", pattern: proposalPattern },
    { kind: "architecture", path: parsed.roster.architecture, dir: "docs/contracts", pattern: architecturePattern },
  ];
  const refTexts = new Map<string, string>();
  for (const ref of refs) {
    let text: string;
    try {
      text = await readFileFn(path.join(input.projectRoot, ref.path), "utf8");
    } catch {
      return { ok: false, code: "roster-reference-missing", reason: `名单引用的 ${ref.kind} 文件不存在/不可读：${ref.path}。` };
    }
    if (text.trim() === "") {
      return { ok: false, code: "roster-reference-missing", reason: `名单引用的 ${ref.kind} 文件为空：${ref.path}。` };
    }
    refTexts.set(ref.kind, text);
    const refVersion = Number(ref.pattern.exec(ref.path.split("/").pop() ?? "")?.[1] ?? 0);
    const latest = await latestVersionIn(ref.dir, ref.pattern);
    if (latest > 0 && refVersion !== latest) {
      return {
        ok: false,
        code: "roster-reference-stale",
        reason: `名单引用的 ${ref.kind} 版本 v${refVersion} 不是最新（v${latest}）；旧版只读，请引用最新版本。`,
      };
    }
  }
  const proposalText = refTexts.get("proposal")!;
  const proposalSchema = proposalText.includes("schema: project-proposal/v2") ? "project-proposal/v2" : undefined;
  if (proposalSchema !== PROJECT_PROPOSAL_SCHEMA) {
    return {
      ok: false,
      code: "roster-reference-invalid",
      reason: `提案文档 schema 必须恰为 ${PROJECT_PROPOSAL_SCHEMA}；旧 v1 请按 v2 重出提案（schema: project-proposal/v2；模块表带 category/path 或 paths[]），不做静默归一化。`,
    };
  }
  if (!proposalText.includes(parsed.roster.intent)) {
    return {
      ok: false,
      code: "roster-reference-inconsistent",
      reason: `提案未引用名单声明的意图版本 ${parsed.roster.intent}（proposal→intent 版本链断裂）。`,
    };
  }
  if (!refTexts.get("architecture")!.includes(parsed.roster.proposal)) {
    return {
      ok: false,
      code: "roster-reference-inconsistent",
      reason: `架构未引用名单声明的提案版本 ${parsed.roster.proposal}（architecture→proposal 版本链断裂）。`,
    };
  }
  return {
    ok: true,
    roster: parsed.roster,
    path: relPath,
    version: selected.version,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** 名单角色 id 列表（D3 推荐集的唯一来源）。 */
export function rosterRoleIds(roster: ProjectRoster): string[] {
  return roster.roles.map((role) => role.id);
}

/** 名单给某角色的授权目录；角色不在名单 ⇒ undefined。
 * 2026-10-29（客户追加口径 v2.6）：唯一来源是 `roles[].modules[]` 绑定的模块文件夹地址并集
 * （角色可多模块；同父兄弟目录合法）。 */
export function rosterDirectoriesFor(roster: ProjectRoster, roleId: string): string[] | undefined {
  const role = roster.roles.find((entry) => entry.id === roleId);
  if (role === undefined) return undefined;
  const byId = new Map(roster.modules.map((module) => [module.id, module]));
  return role.modules.flatMap((moduleId) => byId.get(moduleId)?.paths ?? []);
}

/** D3 卡形状校验：多选、选项恰为名单角色集合（不含内置 id、无重复）。 */
export function validateAppointmentCardAgainstRoster(input: {
  roster: ProjectRoster;
  optionIds: readonly string[];
  multiple: boolean;
  /** 可选：D3 实际选中项（judge/客户勾选）；未省略 env-bootstrap 时必须包含它。 */
  selectedRoleIds?: readonly string[];
}): { ok: true; recommendedRoleIds: string[] } | { ok: false; reason: string } {
  if (input.multiple !== true) return { ok: false, reason: "招人决定卡必须是多选（multiple=true）。" };
  const rosterIds = rosterRoleIds(input.roster);
  const optionIds = [...input.optionIds];
  if (new Set(optionIds).size !== optionIds.length) return { ok: false, reason: "招人决定卡选项 id 重复。" };
  for (const id of optionIds) {
    if (BUILT_IN_ROLE_IDS.has(id)) return { ok: false, reason: `招人决定卡选项含内置治理角色：${id}。` };
  }
  const rosterSet = new Set(rosterIds);
  const optionSet = new Set(optionIds);
  const missing = rosterIds.filter((id) => !optionSet.has(id));
  const extra = optionIds.filter((id) => !rosterSet.has(id));
  if (missing.length > 0 || extra.length > 0) {
    return {
      ok: false,
      reason:
        `招人决定卡选项必须与最新名单角色完全一致（缺：${missing.join("、") || "无"}；` +
        `多：${extra.join("、") || "无"}）。`,
    };
  }
  const envBootstrapOmitted = input.roster.envBootstrap?.omitted === true;
  const hasEnvBootstrap = rosterIds.includes(ENV_BOOTSTRAP_ROLE_ID);
  if (!envBootstrapOmitted && !hasEnvBootstrap) {
    return {
      ok: false,
      reason: `名单未省略 ${ENV_BOOTSTRAP_ROLE_ID}（envBootstrap.omitted=false 或缺省）但缺少该标准角色；请先出含 env-bootstrap 的新名单版本，或按 omitted:true + 非空 omissionReason 省略并移除 env/entry 模块。`,
    };
  }
  if (hasEnvBootstrap && !envBootstrapOmitted) {
    if (input.selectedRoleIds !== undefined && !input.selectedRoleIds.includes(ENV_BOOTSTRAP_ROLE_ID)) {
      return {
        ok: false,
        reason: `D3 必须选中标准角色 ${ENV_BOOTSTRAP_ROLE_ID}；取消须先出带 envBootstrap.omitted/omissionReason 的新名单版本并移除 env/entry 模块。`,
      };
    }
    if (!optionSet.has(ENV_BOOTSTRAP_ROLE_ID)) {
      return { ok: false, reason: `D3 选项必须包含标准角色 ${ENV_BOOTSTRAP_ROLE_ID}。` };
    }
  }
  return { ok: true, recommendedRoleIds: rosterIds };
}

// —————————————————————— 派发矩阵（M1–M8） ——————————————————————

export type DispatchPreflightInput = {
  fromRoleId: string;
  targetRoleId: string;
  targetBuiltIn: boolean;
  /**
   * 目标真实存在（硬授权事实）。
   * 会话层计算：内置 id 由注册表判定；项目 worker 以 listing 枚举为准。
   * 仅旧调用方可省略；省略时由 `evaluateDispatchPreflight` 用私有 `resolveTargetExists`
   * 按 `targetCardFound` 兼容解析（fail-closed）。桌面 B1 必须显式传入。
   */
  targetExists?: boolean;
  chiefRoleId: string | null;
  convenerRoleId: string | null;
  /** 派发载荷显式 flowId（Q9：链式步骤必须带；缺省仅当唯一候选时可容忍，由调用方解析后传入）。 */
  flowId?: string;
  /** 产品意图文档事实（M1）。 */
  intent: { found: boolean; candidates: number };
  /** 提案与架构文件存在（M2）。 */
  proposalFound: boolean;
  architectureFound: boolean;
  /** 最新名单读取结果（M2/M3）。 */
  roster?: RosterLoadResult;
  /** 最新 D3 的选中角色（request.resolved.targetRoleIds；M5/M6）。 */
  d3Selected: string[];
  /** 2026-10-29（v2.8/R8）：实现/验收任务的模块归属（目标必须拥有该模块；目录由名单派生）。 */
  moduleId?: string;
  modulePaths?: string[];
  /** 幕僚→运营的交付任务存在（stepId=project-handoff；M6/M7）。 */
  handoffFound: boolean;
  /** 目标项目角色卡/边界存在（M5/M6；硬授权不再使用，保留为兼容字段）。 */
  targetCardFound: boolean;
  /** 幕僚→运营时 D3 选中但尚未枚举到角色卡的项目角色（用于明确 advisory 文案）。 */
  missingSelectedCardIds?: string[];
  /**
   * run 事实。
   * - `state`：draft/pinned 来自 runManifest；`legacy` 是**仅 advisory 事实**——会话层在
   *   `hasLegacyFlowTask === true` 时传 `{state:"legacy"}`，即使本次 `ensureDraftRun` 成功；
   *   任务锚点仍用本地 draft，绝不把 `legacy` 当锚点。
   * - `roles`：pinned manifest 的角色集；未定义时**不**产出 `run-role-missing`（不伪造）。
   * - `modules`：pinned manifest 的模块 id（仅会话层传，用于 run 专属 `module-missing`；
   *   不得用 latest roster 冒充）。
   */
  run?: {
    state: "draft" | "pinned" | "legacy";
    runId?: string;
    roles?: readonly string[];
    modules?: readonly string[];
  };
  /**
   * 会话层观察到的 run 事实（R2；纯逻辑不读盘、不推断）。
   * 仅会话层传入；旧调用方省略。全部可选；缺省视为「无该事实」。
   */
  runFacts?: {
    /** run 读取/草案创建失败，或 handoff 无 runManifest/flowId。 */
    ledgerUnavailable?: boolean;
    /** handoff pin 尝试失败（run 保持 draft/缺失）；run 仍 draft 时与 run-pin-required 同时产出。 */
    pinFailed?: boolean;
    /** verifyPinnedRun 发现文档哈希不一致。 */
    documentHashMismatch?: boolean;
    /** loadPinnedRoster 读取/校验失败。 */
    pinnedRosterInvalid?: boolean;
  };
  /** 会话层事实：verifyVersionedDocBaselines 的违规路径；非空即 advisory。 */
  versionedDocBaselineViolations?: string[];
};

export type DispatchAuthorizationInput = Pick<
  DispatchPreflightInput,
  "fromRoleId" | "targetRoleId" | "targetBuiltIn" | "chiefRoleId" | "convenerRoleId"
> & { targetExists: boolean };

export type DispatchAuthorizationFailure = {
  ok: false;
  code: string;
  message: string;
  rejection: MechanicalRejection;
};

export type DispatchAuthorizationResult = { ok: true } | DispatchAuthorizationFailure;

export type DispatchPreflightResult =
  | { ok: true; advisories: DispatchAdvisory[] }
  | DispatchAuthorizationFailure;

function reject(
  code: string,
  message: string,
  extra: { missing?: string[]; docs?: string[]; owner?: MechanicalRejection["owner"] } = {},
): DispatchAuthorizationFailure {
  return {
    ok: false,
    code,
    message,
    rejection: makeMechanicalRejection(code, extra.missing ?? [message], {
      ...(extra.docs !== undefined ? { docs: extra.docs } : {}),
      ...(extra.owner !== undefined ? { owner: extra.owner } : {}),
    }),
  };
}

/** 幕僚可派发的内置目标 allowlist（显式；不依赖门禁引擎注册表）。 */
const CHIEF_DISPATCHABLE_BUILT_INS: ReadonlySet<string> = new Set([
  "product",
  "rapporteur",
  "nominator",
  "convener",
  "verifier",
]);

/**
 * `targetExists` 的唯一解析点（兼容窗口）：显式值优先，否则回退旧 `targetCardFound`；fail-closed。
 * 只供复合入口使用；窄步骤 `evaluateDispatchAuthorization` 不解析、只接收显式 boolean。
 */
function resolveTargetExists(input: Pick<DispatchPreflightInput, "targetExists" | "targetCardFound">): boolean {
  return input.targetExists ?? input.targetCardFound ?? false;
}

/**
 * 硬授权唯一谓词：只判定「谁能给谁派发、目标是否真实存在」。
 * 不读盘、不写盘、不接收任何状态/run/名单/模块事实。
 */
export function evaluateDispatchAuthorization(input: DispatchAuthorizationInput): DispatchAuthorizationResult {
  const { fromRoleId, targetRoleId, targetBuiltIn, targetExists, chiefRoleId, convenerRoleId } = input;
  if (fromRoleId === targetRoleId) return reject("self-dispatch", "派发未受理：不能派发给自己。");

  if (fromRoleId !== chiefRoleId && fromRoleId !== convenerRoleId) {
    return reject("unknown-source", "派发未受理：只有幕僚或运营可以在 trio 模型下派发任务。");
  }

  if (fromRoleId === chiefRoleId) {
    if (!targetBuiltIn) {
      return reject(
        "chief-to-project-forbidden",
        "派发未受理：实现任务请交运营（convener）派发给项目 worker；幕僚不直接给项目 worker 派实现任务。",
      );
    }
    if (!CHIEF_DISPATCHABLE_BUILT_INS.has(targetRoleId)) {
      return reject(
        "target-card-missing",
        `派发未受理：目标角色 ${targetRoleId} 不是可派发的内置角色（幕僚可派产品/策划/人事/运营/质检）；请确认目标 id 是否拼写正确。`,
      );
    }
    return { ok: true };
  }

  // 来源=运营（`chiefRoleId === null` 时也能到达这里）
  if (targetBuiltIn && targetRoleId !== "verifier") {
    return reject(
      "convener-target-forbidden",
      "派发未受理：运营只能给项目 worker（实现）或质检（验收核对）派发；不得派产品/策划/人事/幕僚。",
    );
  }
  if (targetBuiltIn) return { ok: true };
  if (!targetExists) {
    return reject(
      "target-card-missing",
      `派发未受理：目标角色不存在/未枚举到（${targetRoleId}）；可能是角色卡或边界未就绪、id 拼写错误，或本次角色枚举不可用。` +
        "请先确认目标 id 是否正确、是否为真实存在的项目角色；若目标是项目 worker 且尚未写卡，请人事按 D3 完成写卡后重试。",
    );
  }
  return { ok: true };
}

/**
 * 复合入口：硬授权 + advisory。保留为单一复合公开入口；内部复用 `evaluateDispatchAuthorization`，
 * 通过后调用 `collectDispatchAdvisories`。不读盘、不写盘。
 */
export function evaluateDispatchPreflight(input: DispatchPreflightInput): DispatchPreflightResult {
  const authorization = evaluateDispatchAuthorization({
    fromRoleId: input.fromRoleId,
    targetRoleId: input.targetRoleId,
    targetBuiltIn: input.targetBuiltIn,
    targetExists: resolveTargetExists(input),
    chiefRoleId: input.chiefRoleId,
    convenerRoleId: input.convenerRoleId,
  });
  if (!authorization.ok) return authorization;
  return { ok: true, advisories: collectDispatchAdvisories(input) };
}

// —————————————————————— 报告路由（M9） ——————————————————————

/**
 * 任务绑定报告的接收者：**按 `task.created.from` 回创建者**（项目 worker/质检 → 运营或幕僚；
 * 产品/策划/人事/运营由幕僚派发 → 幕僚）。
 * 返回 null = 找不到创建者（调用方保持既有防御路由，不猜）。
 */
export function reportTargetForTaskCreator(input: {
  creator: "chief" | "convener" | undefined;
  chiefRoleId: string | null;
  convenerRoleId: string | null;
}): string | null {
  if (input.creator === "chief") return input.chiefRoleId;
  if (input.creator === "convener") return input.convenerRoleId;
  return null;
}

/** 报告者是否与接收者相同（防御：不自我投递）。 */
export function isSelfReport(reporterRoleId: string, targetRoleId: string | null): boolean {
  return targetRoleId !== null && reporterRoleId === targetRoleId;
}
