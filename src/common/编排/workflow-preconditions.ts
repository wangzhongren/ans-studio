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

/** 名单 schema 标识（client 2026-10-29 方案 §5.2；v2.6 模块先行升级为 v2）。 */
export const PROJECT_ROSTER_SCHEMA = "project-roster/v2" as const;
/** 2026-10-29（v2.8 R7）：模块清单文档是唯一权威源；roster modules[] 是派生快照。 */
export const PROJECT_MODULES_SCHEMA = "project-modules/v1" as const;

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
  /** 项目相对 POSIX 目录（以 `/` 结尾）。 */
  directory: string;
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
  /** 模块清单（1–12 项；派生快照，权威源为 `<flowId>-modules-vN.md`）。 */
  modules: ProjectRosterModule[];
  roles: ProjectRosterRole[];
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

/** 版本化文档引用：`docs/<dir>/<flowId>-<doc>-vN.md`（不原地改，引用最新版本）。 */
function parseVersionedRef(
  raw: unknown,
  flowId: string,
  kind: "intent" | "proposal" | "architecture",
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

/** 模块 folder 地址不能是文件：未显式以 `/` 结尾且末段像文件名（有扩展名）⇒ 拒绝。 */
function looksLikeFilePath(raw: string): boolean {
  const value = raw.trim().replace(/\\/g, "/");
  if (value.endsWith("/")) return false;
  const last = value.split("/").pop() ?? "";
  return /\.[A-Za-z0-9]{1,8}$/.test(last);
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
    return { ok: false, code: "roster-topology-mismatch", reason: "拓扑图 management 必须含 convener（运营管理项目角色）。" };
  }
  for (const role of roles) {
    if (!management.includes(role.id)) {
      return {
        ok: false,
        code: "roster-topology-mismatch",
        reason: `拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）。`,
      };
    }
  }
  const expectedOwner = new Map<string, string>();
  for (const role of roles) for (const moduleId of role.modules) expectedOwner.set(moduleId, role.id);
  const topologyModules = new Map<string, { directory: string; roleId: string }>();
  for (const [index, raw] of doc.modules.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图第 ${index + 1} 个模块不是对象。` };
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const directory = typeof entry.directory === "string" ? normalizeRosterDirectory(entry.directory) : undefined;
    const roleId = typeof entry.roleId === "string" ? entry.roleId.trim() : "";
    if (id === "" || directory === undefined || roleId === "") {
      return { ok: false, code: "roster-topology-invalid", reason: `拓扑图模块第 ${index + 1} 项缺 id/directory/roleId。` };
    }
    topologyModules.set(id, { directory, roleId });
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
    if (entry.directory !== module.directory || entry.roleId !== owner) {
      return {
        ok: false,
        code: "roster-topology-mismatch",
        reason: `拓扑图模块 ${module.id} 的目录/属主与 frontmatter 不一致（拓扑 ${entry.directory} → ${entry.roleId}；名单 ${module.directory} → ${owner}）。`,
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
    lines.push(`- ${module.id}（${module.name}；${module.directory}）→ ${ownerOf.get(module.id) ?? "未绑定"}`);
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
  const normalized = text.replace(/^﻿/, "");
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
    return rosterError("roster-schema-invalid", `名单 schema 必须恰为 ${PROJECT_ROSTER_SCHEMA}。`);
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
    const publicContract = typeof module.publicContract === "string" ? module.publicContract.trim() : "";
    const architectureSource = typeof module.architectureSource === "string" ? module.architectureSource.trim() : "";
    if (id === "" || !ROSTER_ROLE_ID_RE.test(id) || id.endsWith("-")) {
      return rosterError("roster-module-id-invalid", `模块 id 非法（须小写 slug、至少 2 字符）：${String(module.id)}`);
    }
    if (moduleIds.has(id)) return rosterError("roster-module-id-invalid", `模块 id 重复：${id}`);
    moduleIds.add(id);
    if (name === "" || purpose === "" || publicContract === "" || architectureSource === "") {
      return rosterError(
        "roster-module-fields-missing",
        `模块 ${id} 缺 name/purpose/publicContract/architectureSource（均须非空）。`,
      );
    }
    if (Array.isArray(module.directory)) {
      return rosterError("roster-module-directory-invalid", `模块「${name}」必须恰好一个文件夹地址（不得数组）。`);
    }
    if (typeof module.directory !== "string" || looksLikeFilePath(module.directory)) {
      return rosterError("roster-module-directory-invalid", `模块「${name}」的 folder 地址必须是单个目录（不能是文件/数组）：${String(module.directory)}`);
    }
    const directory = normalizeRosterDirectory(module.directory);
    if (directory === undefined) {
      return rosterError("roster-module-directory-invalid", `模块「${name}」的目录非法（项目相对、无通配/..）：${String(module.directory)}`);
    }
    if (isGovernanceDirectory(directory)) {
      return rosterError("roster-module-directory-governance", `模块「${name}」的目录落在治理/他人写区（含治理子路径）：${directory}`);
    }
    modules.push({ id, name, purpose, directory, publicContract, architectureSource });
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
      if (directoriesOverlap(modules[i]!.directory, modules[j]!.directory)) {
        return rosterError(
          "roster-module-directory-overlap",
          `模块目录重叠/嵌套：${modules[i]!.id} 的 ${modules[i]!.directory} 与 ${modules[j]!.id} 的 ${modules[j]!.directory}。`,
        );
      }
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
      modules,
      roles,
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
    return { ok: false, code: "modules-doc-schema", reason: `模块清单 schema 必须恰为 ${PROJECT_MODULES_SCHEMA}。` };
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
    const publicContract = typeof module.publicContract === "string" ? module.publicContract.trim() : "";
    const architectureSource = typeof module.architectureSource === "string" ? module.architectureSource.trim() : "";
    if (id === "" || !ROSTER_ROLE_ID_RE.test(id) || id.endsWith("-")) {
      return { ok: false, code: "modules-doc-id", reason: `模块清单 id 非法：${String(module.id)}` };
    }
    if (ids.has(id)) return { ok: false, code: "modules-doc-id", reason: `模块清单 id 重复：${id}` };
    ids.add(id);
    if (name === "" || purpose === "" || publicContract === "" || architectureSource === "") {
      return { ok: false, code: "modules-doc-fields", reason: `模块清单 ${id} 缺 name/purpose/publicContract/architectureSource。` };
    }
    if (Array.isArray(module.directory) || typeof module.directory !== "string" || looksLikeFilePath(module.directory)) {
      return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} 必须恰好一个文件夹地址（不能是文件/数组）。` };
    }
    const directory = normalizeRosterDirectory(module.directory);
    if (directory === undefined) {
      return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} 目录非法：${String(module.directory)}` };
    }
    if (isGovernanceDirectory(directory)) {
      return { ok: false, code: "modules-doc-directory", reason: `模块 ${id} 目录落在治理/他人写区：${directory}` };
    }
    modules.push({ id, name, purpose, directory, publicContract, architectureSource });
  }
  for (let i = 0; i < modules.length; i += 1) {
    for (let j = i + 1; j < modules.length; j += 1) {
      if (directoriesOverlap(modules[i]!.directory, modules[j]!.directory)) {
        return { ok: false, code: "modules-doc-overlap", reason: `模块目录重叠/嵌套：${modules[i]!.id} 与 ${modules[j]!.id}。` };
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
  if (!refTexts.get("proposal")!.includes(parsed.roster.intent)) {
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
  return role.modules.map((moduleId) => byId.get(moduleId)?.directory).filter((dir): dir is string => dir !== undefined);
}

/** D3 卡形状校验：多选、选项恰为名单角色集合（不含内置 id、无重复）。 */
export function validateAppointmentCardAgainstRoster(input: {
  roster: ProjectRoster;
  optionIds: readonly string[];
  multiple: boolean;
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
  return { ok: true, recommendedRoleIds: rosterIds };
}

// —————————————————————— 派发矩阵（M1–M8） ——————————————————————

export type DispatchPreflightInput = {
  fromRoleId: string;
  targetRoleId: string;
  targetBuiltIn: boolean;
  chiefRoleId: string;
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
  /** 幕僚→运营的交付任务存在（stepId=project-handoff；M6/M7）。 */
  handoffFound: boolean;
  /** 目标项目角色卡/边界存在（M5/M6）。 */
  targetCardFound: boolean;
  /** 幕僚→运营时 D3 选中但尚未枚举到角色卡的项目角色（用于明确拒绝文案）。 */
  missingSelectedCardIds?: string[];
};

export type DispatchPreflightResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function reject(code: string, message: string): DispatchPreflightResult {
  return { ok: false, code, message };
}

/**
 * 五步链派发前置（M1–M8；**必须在创建 task.created 之前调用**，F10）。
 * 只判定应用已计算的事实；不读盘、不写盘。拒绝文案含「下一步」。
 */
export function evaluateDispatchPreflight(input: DispatchPreflightInput): DispatchPreflightResult {
  const { fromRoleId, targetRoleId, targetBuiltIn } = input;
  if (fromRoleId === targetRoleId) return reject("self-dispatch", "派发未受理：不能派发给自己。");

  if (fromRoleId === input.chiefRoleId) {
    if (!targetBuiltIn) {
      return reject(
        "chief-to-project-forbidden",
        "派发未受理：实现任务请交运营（convener）派发给项目 worker；幕僚不直接给项目 worker 派实现任务。",
      );
    }
    if (targetRoleId === "rapporteur") {
      // 先判 flowId：缺省只允许「唯一候选意图文档」由调用方解析后传入；0/多份 ⇒ flow-required。
      if (input.flowId === undefined) {
        return reject(
          "flow-required",
          "派发未受理：派策划必须携带 flowId（或仅有一份 docs/product/*-intent-v*.md 时可唯一推断；0/多份拒绝）。",
        );
      }
      if (input.intent.found !== true) {
        return reject(
          "intent-missing",
          `派发未受理：缺少产品意图文档（docs/product/<flowId>-intent-v1.md，flowId=${input.flowId}）。` +
            "请先派产品出意图文档，再派策划。",
        );
      }
      return { ok: true };
    }
    if (targetRoleId === "nominator") {
      if (input.flowId === undefined) {
        return reject("flow-required", "派发未受理：派人事必须携带 flowId（用于定位最新名单）。");
      }
      if (input.proposalFound !== true || input.architectureFound !== true) {
        return reject(
          "proposal-missing",
          "派发未受理：缺少策划方案（docs/proposals/<flowId>-proposal-v1.md）或项目架构（docs/contracts/<flowId>-architecture-v1.md）。" +
            "请先派策划产出方案、名单与架构。",
        );
      }
      if (input.roster === undefined || input.roster.ok !== true) {
        return reject(
          "roster-missing",
          `派发未受理：最新人员名单缺失或非法（${input.roster !== undefined && input.roster.ok === false ? input.roster.reason : "未读取"}）。` +
            "请先让策划出合法名单（docs/proposals/<flowId>-roster-vN.md）。",
        );
      }
      // 2026-10-29（客户追加口径）：先写模块，再把模块安排给人；没有模块/绑定不完整不得招人。
      if (input.roster.roster.modules.length === 0) {
        return reject(
          "roster-modules-missing",
          "派发未受理：最新名单缺模块清单（每模块 name/purpose/directory/roleId，一模块一个文件夹、一模块一属主、目录不重叠/不嵌套，角色可多模块）。" +
            "请让策划出 v2 名单补齐模块→角色绑定后再招人。",
        );
      }
      return { ok: true };
    }
    if (targetRoleId === "convener") {
      if (input.flowId === undefined) {
        return reject("flow-required", "派发未受理：交付运营必须携带 flowId（用于定位最新 D3 与名单）。");
      }
      if (input.d3Selected.length === 0) {
        return reject(
          "d3-missing",
          "派发未受理：尚无 D3（招人决定）选中的角色。请先让策划出名单、人事发 D3 并写卡，再把项目交付运营。",
        );
      }
      if (input.targetCardFound !== true) {
        const missing = (input.missingSelectedCardIds ?? []).filter((id) => id !== "");
        return reject(
          "target-card-missing",
          `派发未受理：D3 选中的项目角色卡未齐备${missing.length > 0 ? `（缺：${missing.join("、")}）` : ""}；` +
            "请先完成人事写卡，再交付运营（运营/convener 是内置角色，不需要也不允许写运营角色卡）。",
        );
      }
      return { ok: true };
    }
    // 产品、质检（验收调度）等其余内置目标：无链式前置。
    return { ok: true };
  }

  if (input.convenerRoleId !== null && fromRoleId === input.convenerRoleId) {
    if (targetBuiltIn && targetRoleId !== "verifier") {
      return reject(
        "convener-target-forbidden",
        "派发未受理：运营只能给项目 worker（实现）或质检（验收核对）派发；不得派产品/策划/人事/幕僚。",
      );
    }
    if (input.handoffFound !== true) {
      return reject(
        "handoff-missing",
        "派发未受理：尚未收到幕僚的交付任务（stepId=project-handoff）。请让幕僚先把项目交付运营。",
      );
    }
    if (input.flowId === undefined) {
      return reject("flow-required", "派发未受理：实现/验收任务必须携带 flowId（用于定位 D3 名单与交付记录）。");
    }
    // 2026-10-29（v2.6/R2）：模块归属机械校验——实现任务必须带 moduleId，且目标角色拥有该模块；
    // 目录以名单模块为准（模型自报目录不一致 ⇒ 拒）。验收任务（verifier）可引用任一已绑定模块。
    const roster = input.roster !== undefined && input.roster.ok === true ? input.roster.roster : undefined;
    const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
    if (targetRoleId === "verifier") {
      if (moduleId !== "") {
        if (roster === undefined) return reject("roster-missing", "派发未受理：缺少最新名单，无法核对验收模块。");
        const module = roster.modules.find((entry) => entry.id === moduleId);
        if (module === undefined) return reject("module-missing", `派发未受理：模块 ${moduleId} 不在最新名单内。`);
      }
      return { ok: true };
    }
    if (moduleId === "") {
      return reject("module-required", "派发未受理：实现任务必须携带 moduleId（目标必须拥有该模块；一模块一属主）。");
    }
    if (roster === undefined) {
      return reject("roster-missing", "派发未受理：缺少最新名单，无法核对模块归属。");
    }
    const module = roster.modules.find((entry) => entry.id === moduleId);
    if (module === undefined) {
      return reject("module-missing", `派发未受理：模块 ${moduleId} 不在最新名单内。`);
    }
    const moduleOwner = roster.roles.find((role) => role.modules.includes(module.id));
    if (moduleOwner?.id !== targetRoleId) {
      return reject(
        "module-not-owned",
        `派发未受理：目标 ${targetRoleId} 不拥有模块 ${moduleId}（属主=${moduleOwner?.id ?? "未绑定"}）；目标必须拥有该模块。`,
      );
    }
    if (!input.d3Selected.includes(targetRoleId)) {
      return reject(
        "target-not-nominated",
        `派发未受理：目标 ${targetRoleId} 不在最新 D3 选中的角色名单内（名单外角色不可派实现）。`,
      );
    }
    if (input.targetCardFound !== true) {
      return reject("target-card-missing", `派发未受理：目标 ${targetRoleId} 的角色卡不存在（未上线）。`);
    }
    return { ok: true };
  }

  return reject("unknown-source", "派发未受理：只有幕僚或运营可以在 trio 模型下派发任务。");
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
