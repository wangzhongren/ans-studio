/**
 * 角色显示名/副标题/左树分组（Phase 3A 纯展示映射）。
 *
 * 治理职能名称按 `governanceFunction` 派生（不硬编码角色 id）；普通角色名称取 roleId，
 * 副标题取角色卡首句或边界条目数。分组：主入口 / 治理职能（内置）/ 工作角色（按 group）。
 */

import type { RoleView } from "./types.ts";

export interface GovernanceView {
  name: string;
  power: string;
  builtinNote: string;
}

const GOVERNANCE: Record<string, GovernanceView> = {
  liaison: {
    name: "主理 / Lead",
    power: "客户沟通 · 不拥有最终批准权",
    builtinNote: "内置角色：随应用发布，无角色目录",
  },
  proposal: {
    name: "报告员 / Rapporteur",
    power: "提案权 · 不拥有最终批准权",
    builtinNote: "内置角色：随应用发布，无角色目录",
  },
  nomination: {
    name: "提名官 / Nominator",
    power: "提名权 · 不拥有最终批准权",
    builtinNote: "内置角色：随应用发布，无角色目录",
  },
  schedule: {
    name: "召集人 / Convener",
    power: "排期权 · 不拥有最终批准权",
    builtinNote: "内置角色：随应用发布，无角色目录",
  },
  verification: {
    name: "验收 / Proof",
    power: "验收权 · 不拥有最终批准权",
    builtinNote: "内置角色：随应用发布，无角色目录",
  },
};

export function governanceView(
  governanceFunction: string | undefined,
): GovernanceView | null {
  return governanceFunction && GOVERNANCE[governanceFunction]
    ? GOVERNANCE[governanceFunction]
    : null;
}

export function findRole(roles: RoleView[], roleId: string | null): RoleView | null {
  if (!roleId) return null;
  return roles.find((role) => role.roleId === roleId) || null;
}

export function roleDisplayName(role: RoleView | null | undefined): string {
  if (!role) return "未选择角色";
  const gov = governanceView(role.governanceFunction);
  return gov ? gov.name : role.roleId;
}

export function roleSubtitle(role: RoleView | null | undefined): string {
  if (!role) return "";
  const gov = governanceView(role.governanceFunction);
  if (gov) return gov.power;
  if (role.builtIn) return "内置治理角色（定义见 SKILL.md）";
  const text = String(role.cardText || "").trim();
  const first = text.replace(/^#+\s*/m, "").split(/[\n。；;]/)[0].trim();
  if (first && first.length > 1) {
    return first.length > 42 ? first.slice(0, 42) + "…" : first;
  }
  const count = role.boundary && Array.isArray(role.boundary.entries)
    ? role.boundary.entries.length
    : 0;
  return count + " 条边界条目";
}

export interface RoleGroup {
  label: string;
  roles: RoleView[];
}

export function groupRoles(
  roles: RoleView[],
  primaryRoleId: string | null,
): RoleGroup[] {
  const primary =
    roles.find((role) => role.roleId === primaryRoleId) || null;
  const governance: RoleView[] = [];
  const others: RoleView[] = [];
  for (const role of roles) {
    if (primary && role.roleId === primary.roleId) continue;
    if (governanceView(role.governanceFunction)) governance.push(role);
    else others.push(role);
  }
  const groups: RoleGroup[] = [];
  if (primary) groups.push({ label: "主入口", roles: [primary] });
  if (governance.length) {
    groups.push({ label: "治理职能（内置）", roles: governance });
  }
  const byGroup = new Map<string, RoleView[]>();
  for (const role of others) {
    const label = role.group && role.group.trim() ? role.group.trim() : "工作角色";
    const list = byGroup.get(label) || [];
    list.push(role);
    byGroup.set(label, list);
  }
  for (const [label, list] of byGroup) {
    groups.push({ label, roles: list });
  }
  return groups;
}

export function flattenRoles(groups: RoleGroup[]): RoleView[] {
  return groups.flatMap((group) => group.roles);
}
