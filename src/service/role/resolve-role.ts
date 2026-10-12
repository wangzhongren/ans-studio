// Service：双来源角色解析 + 项目角色枚举（供桌面应用）
// 冻结契约 §3：resolveRole(roleId, project): Promise<ResolvedRole>
// 路径取自 project.roles[roleId]（F8）；未在配置中的角色视为内置治理角色。
// listProject 为桌面应用枚举一个项目根下的全部角色，复用本文件与 boundary-core 的解析。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { ProjectConfig, ResolvedRole, RoleKind, RoleLocation } from "../../model/role.ts";
import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  BUILT_IN_ROLE_CARD_TEXT,
  builtInBoundarySection,
  loadBoundaryFile,
  resolveBoundarySection,
} from "../../common/门禁引擎/boundary-core.ts";
import { joinRoot, readTextFile } from "../../common/门禁引擎/io.ts";
import { readdir, stat } from "node:fs/promises";

export async function resolveRole(roleId: string, project: ProjectConfig): Promise<ResolvedRole> {
  const loc = project.roles ? project.roles[roleId] : undefined;
  const kind: RoleKind = loc ? "project" : "built-in-governance";

  let cardText = "";
  let location: RoleLocation;
  if (loc) {
    location = loc;
    cardText = await readTextFile(joinRoot(project.projectRoot, loc.card));
  } else {
    location = {
      card: "",
      boundary: project.governanceBoundary ? project.governanceBoundary.path : "",
    };
    // 内置治理角色无角色卡文件——说明取自边界核心的唯一常量，不另写一份。
    if (roleId === BUILT_IN_GOVERNANCE_ROLE_ID) cardText = BUILT_IN_ROLE_CARD_TEXT;
  }

  const boundary = await resolveBoundarySection(roleId, project);
  return {
    id: roleId,
    kind,
    cardText,
    boundary,
    boundarySource: boundary.boundarySource,
    location,
  };
}

// ---- 项目角色枚举（桌面应用）----

export interface ProjectRoleSummary {
  roleId: string;
  cardPath: string; // 项目相对路径（内置角色为空串：没有角色卡文件）
  boundaryPath: string; // 项目相对路径（内置角色为空串：用内置边界）
  cardText: string; // role-card.md 正文
  boundary: BoundarySection1;
  /** 内置治理角色（无角色目录，由引擎合成；不参与 roles 映射，故解析时下沉为 built-in-governance）。 */
  builtIn?: boolean;
}

export interface ProjectListing {
  projectRoot: string;
  roles: ProjectRoleSummary[];
  warnings: string[]; // 仅记真异常：某角色目录缺文件、边界解析失败、角色重复等（空项目是正常态，不报警）
  /** 是否枚举到**项目角色**（`角色卡/`、`role-cards/` 下至少一个可用角色）。
   *  空项目（尚无 bootstrap）为 false——此时 `roles` 只含内置治理角色（su）；
   *  界面据此显示「项目尚未 bootstrap」并引导与 su 对话（§10.3）。 */
  hasRoles: boolean;
  /** **主入口角色 id** = 内置治理角色（`BUILT_IN_GOVERNANCE_ROLE_ID`）。
   *  由门禁引擎给、**单一来源**；桌面渲染侧据此设主位/默认选中，**不得硬编码 "su"**
   *  （本项目既有纪律：不硬编码角色 id，权限/入口以数据表达，§10.7）。 */
  primaryRoleId: string;
}

const ROLE_DIR_NAMES = ["角色卡", "role-cards"]; // 中文 / 英文项目角色目录名
const CARD_NAMES = ["role-card.md"];
const BOUNDARY_NAMES = ["boundary.yaml", "boundary.yml", "boundary.md"];

async function statKind(p: string): Promise<"dir" | "file" | "other" | "none"> {
  try {
    const s = await stat(p);
    if (s.isDirectory()) return "dir";
    if (s.isFile()) return "file";
    return "other";
  } catch {
    return "none";
  }
}

async function firstExistingFile(dirAbs: string, names: string[]): Promise<string | null> {
  for (const n of names) {
    if ((await statKind(joinRoot(dirAbs, n))) === "file") return n;
  }
  return null;
}

/**
 * 枚举一个项目根下的全部角色。
 * - 复用 resolveRole/boundary-core 的解析，界面侧不得另写一份判定；
 * - 单个角色目录的问题（缺 role-card.md / boundary.yaml、边界解析失败）→ 记入 warnings，不抛出；
 *   边界**文件存在但 Section 1 解析出 0 条**（如散文式 Markdown `boundary.md`）经 `loadBoundaryFile`
 *   记为 parseError 并落到下方 warning（客户 2026-10-12 裁定 A：响亮失败，不再静默空集）；
 * - **无角色目录**（尚无 `角色卡/`、`role-cards/`）→ **不抛错、不报警**（§10.2）：这是「项目尚未
 *   bootstrap」的**正常初始态**，返回 `[内置 su] + hasRoles:false`（warnings 为空）——界面据此显示
 *   su 并引导发起创世（§10.1/§10.3）；warnings 只留给真异常（缺文件 / 解析失败 / 角色重复）；
 * - **项目级真错误**（项目根不存在/不是目录、角色目录路径是文件、无读权限）→ 抛出明确错误。
 * - listProject 无接受证据入参，故所列 boundary 的 acceptance 一律为未接受（仅用于展示）。
 * - 结果含 `primaryRoleId`（内置治理角色 id）：桌面据此设主入口，**渲染侧不硬编码 "su"**（§10.7）。
 */
export async function listProject(projectRoot: string): Promise<ProjectListing> {
  const projAbs = projectRoot;

  // 项目根：存在性、类型、可读性
  const rootKind = await statKind(projAbs);
  if (rootKind === "none") {
    throw new Error(`项目根不存在或不可访问：${projectRoot}`);
  }
  if (rootKind !== "dir") {
    throw new Error(`项目根不是目录：${projectRoot}`);
  }

  // 角色目录（中文 角色卡/ 与英文 role-cards/ 都认）
  const foundRoots: { name: string; abs: string }[] = [];
  for (const name of ROLE_DIR_NAMES) {
    const abs = joinRoot(projAbs, name);
    const kind = await statKind(abs);
    if (kind === "dir") foundRoots.push({ name, abs });
    else if (kind !== "none") throw new Error(`角色目录路径存在但不是目录：${name}`);
  }

  const warnings: string[] = [];
  // 无角色目录**是正常状态**（§10.2）：这是「项目尚未 bootstrap」的初始态，客户为「空文件夹 →
  // 与 su 对话 → su 建角色」专门设计了整套流程，故**既不抛错、也不报警**——hasRoles:false 与界面
  // 「项目尚未 bootstrap」提示已把它说清楚，再画一条红字反而是噪声。warnings 只留给真异常
  // （缺 role-card.md / boundary.yaml、边界解析失败、角色重复）；仅「项目根不存在 / 不是目录」（上面已判）才是真错误。

  const roles: ProjectRoleSummary[] = [];
  const seen = new Set<string>();

  // 内置治理角色（su）：永远排在第一位，且没有角色目录——由引擎合成一条，界面据此显示。
  // 不参与下方目录枚举（seen 先占位，若项目里恰好有同名目录则记 warning 跳过）。
  const builtInRole: ProjectRoleSummary = {
    roleId: BUILT_IN_GOVERNANCE_ROLE_ID,
    cardPath: "",
    boundaryPath: "",
    cardText: BUILT_IN_ROLE_CARD_TEXT,
    boundary: builtInBoundarySection(),
    builtIn: true,
  };
  seen.add(BUILT_IN_GOVERNANCE_ROLE_ID);

  for (const root of foundRoots) {
    let dirents;
    try {
      dirents = await readdir(root.abs, { withFileTypes: true });
    } catch (err) {
      throw new Error(`无法读取角色目录：${root.name}（${(err as Error).message}）`);
    }
    const roleIds = dirents
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

    for (const roleId of roleIds) {
      if (seen.has(roleId)) {
        warnings.push(`${root.name}/${roleId}：角色重复，已在其它角色目录优先采用，跳过`);
        continue;
      }
      const relDir = `${root.name}/${roleId}`;

      const cardName = await firstExistingFile(joinRoot(projAbs, relDir), CARD_NAMES);
      if (!cardName) {
        warnings.push(`${relDir}：缺少 role-card.md，已跳过`);
        continue;
      }
      const boundaryName = await firstExistingFile(joinRoot(projAbs, relDir), BOUNDARY_NAMES);
      if (!boundaryName) {
        warnings.push(`${relDir}：缺少 boundary.yaml，已跳过`);
        continue;
      }

      const cardPath = `${relDir}/${cardName}`;
      const boundaryPath = `${relDir}/${boundaryName}`;

      let cardText: string;
      try {
        cardText = await readTextFile(joinRoot(projAbs, cardPath));
      } catch (err) {
        warnings.push(`${relDir}：读取 role-card.md 失败（${(err as Error).message}），已跳过`);
        continue;
      }

      // 复用现有边界解析（与 resolveRole 同源）
      const boundary = await loadBoundaryFile(
        boundaryPath,
        joinRoot(projAbs, boundaryPath),
        projAbs,
        projAbs,
        { accepted: false, source: "" },
      );
      if (boundary.parseError) {
        warnings.push(`${relDir}：边界解析失败：${boundary.parseError}，已跳过`);
        continue;
      }

      seen.add(roleId);
      roles.push({ roleId, cardPath, boundaryPath, cardText, boundary });
    }
  }

  roles.sort((a, b) => a.roleId.localeCompare(b.roleId, "zh-Hans-CN"));
  roles.unshift(builtInRole);

  // hasRoles：是否枚举到**项目角色**（非内置）。内置 su 恒在 roles 里，故不能只看 roles.length。
  const hasRoles = roles.some((r) => r.builtIn !== true);
  // 有角色目录但一个有效角色都没枚举到（全都缺文件/解析失败）→ 仍补一条汇总提示：**有目录却无
  // 有效角色**是真异常（每个失败角色的具体原因已在上面逐条记入 warnings）。注意这与「无角色目录」
  // 不同——后者是「尚未 bootstrap」的正常初始态、不再报警（见函数首部注释）。
  if (!hasRoles && foundRoots.length > 0) {
    warnings.push(
      `项目根下未枚举到有效角色；仅内置治理角色 ${BUILT_IN_GOVERNANCE_ROLE_ID} 可用（可发起 bootstrap）`,
    );
  }

  return { projectRoot, roles, warnings, hasRoles, primaryRoleId: BUILT_IN_GOVERNANCE_ROLE_ID };
}
