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

/** 名单 schema 标识（client 2026-10-29 方案 §5.2）。 */
export const PROJECT_ROSTER_SCHEMA = "project-roster/v1" as const;

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
  directories: string[];
}

export interface ProjectRoster {
  schema: typeof PROJECT_ROSTER_SCHEMA;
  flowId: string;
  version: number;
  roles: ProjectRosterRole[];
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
    | "roster-directory-invalid"
    | "roster-directory-governance"
    | "roster-directory-overlap";
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
  const lower = directory.toLowerCase();
  return GOVERNANCE_DIR_PREFIXES.some((prefix) => lower === prefix.toLowerCase() || lower.startsWith(prefix.toLowerCase()));
}

function directoriesOverlap(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  return aLower.startsWith(bLower) || bLower.startsWith(aLower);
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
    if (!Array.isArray(role.directories) || role.directories.length === 0) {
      return rosterError("roster-directory-invalid", `名单角色 ${id} 缺 directories（至少一项）。`);
    }
    const directories: string[] = [];
    for (const rawDir of role.directories) {
      const directory = normalizeRosterDirectory(rawDir);
      if (directory === undefined) {
        return rosterError("roster-directory-invalid", `名单角色 ${id} 的目录非法（项目相对、以 / 结尾、无通配/..）：${String(rawDir)}`);
      }
      if (isGovernanceDirectory(directory)) {
        return rosterError("roster-directory-governance", `名单角色 ${id} 的目录落在治理/他人写区：${directory}`);
      }
      if (directories.includes(directory)) {
        return rosterError("roster-directory-invalid", `名单角色 ${id} 的目录重复：${directory}`);
      }
      directories.push(directory);
    }
    roles.push({ id, displayName, purpose, capability, directories });
  }
  // 跨角色目录不得重叠/互为祖先（避免两个 worker 共写同一棵树）。
  for (let i = 0; i < roles.length; i += 1) {
    for (let j = i + 1; j < roles.length; j += 1) {
      for (const a of roles[i]!.directories) {
        for (const b of roles[j]!.directories) {
          if (directoriesOverlap(a, b)) {
            return rosterError(
              "roster-directory-overlap",
              `名单目录重叠：${roles[i]!.id} 的 ${a} 与 ${roles[j]!.id} 的 ${b}。`,
            );
          }
        }
      }
    }
  }
  return { ok: true, roster: { schema: PROJECT_ROSTER_SCHEMA, flowId, version, roles } };
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
  code: "roster-missing" | RosterParseError["code"];
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

/** 名单给某角色的授权目录；角色不在名单 ⇒ undefined。 */
export function rosterDirectoriesFor(roster: ProjectRoster, roleId: string): string[] | undefined {
  return roster.roles.find((role) => role.id === roleId)?.directories;
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
  /** 幕僚→运营的交付任务存在（stepId=project-handoff；M6/M7）。 */
  handoffFound: boolean;
  /** 目标项目角色卡/边界存在（M5/M6）。 */
  targetCardFound: boolean;
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
          "派发未受理：缺少策划方案（docs/proposals/<flowId>-v1.md）或项目架构（docs/contracts/<flowId>-architecture-v1.md）。" +
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
        return reject("target-card-missing", "派发未受理：运营的目标角色卡不存在（角色未枚举到）。请先完成人事写卡。");
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
    if (targetRoleId === "verifier") return { ok: true };
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
