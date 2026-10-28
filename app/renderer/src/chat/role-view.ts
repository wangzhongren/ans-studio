/**
 * 角色显示名/副标题/左树分组（Phase 3A 纯展示映射）。
 *
 * 治理职能名称按 `governanceFunction` 派生（不硬编码角色 id）；普通角色名称取 roleId，
 * 副标题取角色卡首句或边界条目数。分组：主入口 / 治理职能（内置）/ 工作角色（按 group）。
 *
 * i18n B1：内置治理标签与兜底文案来自 shared `ui.role.*`；`roleId` 与自定义分组名
 * 是机器/用户数据，不翻译。纯函数接受可选 `locale`（默认 zh-CN，旧调用逐字不变）。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";
import type { RoleView } from "./types.ts";

export interface GovernanceView {
  name: string;
  power: string;
  builtinNote: string;
}

type GovernanceFunction =
  | "chief"
  | "product"
  | "proposal"
  | "nomination"
  | "schedule"
  | "verification";

const GOVERNANCE_KEYS: Record<
  GovernanceFunction,
  { name: MessageKey; power: MessageKey }
> = {
  chief: {
    name: "ui.role.governance.chief.name",
    power: "ui.role.governance.chief.power",
  },
  product: {
    name: "ui.role.governance.product.name",
    power: "ui.role.governance.product.power",
  },
  proposal: {
    name: "ui.role.governance.draft.name",
    power: "ui.role.governance.draft.power",
  },
  nomination: {
    name: "ui.role.governance.crew.name",
    power: "ui.role.governance.crew.power",
  },
  schedule: {
    name: "ui.role.governance.steward.name",
    power: "ui.role.governance.steward.power",
  },
  verification: {
    name: "ui.role.governance.verifier.name",
    power: "ui.role.governance.verifier.power",
  },
};

function isGovernanceFunction(value: string): value is GovernanceFunction {
  return Object.prototype.hasOwnProperty.call(GOVERNANCE_KEYS, value);
}

export function governanceView(
  governanceFunction: string | undefined,
  locale: Locale = DEFAULT_LOCALE,
): GovernanceView | null {
  if (!governanceFunction || !isGovernanceFunction(governanceFunction)) return null;
  const keys = GOVERNANCE_KEYS[governanceFunction];
  return {
    name: translate(locale, keys.name),
    power: translate(locale, keys.power),
    builtinNote: translate(locale, "ui.role.governance.builtinNote"),
  };
}

export function findRole(roles: RoleView[], roleId: string | null): RoleView | null {
  if (!roleId) return null;
  return roles.find((role) => role.roleId === roleId) || null;
}

export function roleDisplayName(
  role: RoleView | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!role) return translate(locale, "ui.role.noneSelected");
  const gov = governanceView(role.governanceFunction, locale);
  return gov ? gov.name : role.roleId;
}

export function roleSubtitle(
  role: RoleView | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!role) return "";
  const gov = governanceView(role.governanceFunction, locale);
  if (gov) return gov.power;
  if (role.builtIn) return translate(locale, "ui.role.builtinGovernance");
  const text = String(role.cardText || "").trim();
  const first = text.replace(/^#+\s*/m, "").split(/[\n。；;]/)[0].trim();
  if (first && first.length > 1) {
    return first.length > 42 ? first.slice(0, 42) + "…" : first;
  }
  const count = role.boundary && Array.isArray(role.boundary.entries)
    ? role.boundary.entries.length
    : 0;
  return translate(locale, "ui.role.boundaryCount", { count });
}

export interface RoleGroup {
  label: string;
  roles: RoleView[];
}

export function groupRoles(
  roles: RoleView[],
  primaryRoleId: string | null,
  locale: Locale = DEFAULT_LOCALE,
): RoleGroup[] {
  const primary =
    roles.find((role) => role.roleId === primaryRoleId) || null;
  const governance: RoleView[] = [];
  const others: RoleView[] = [];
  for (const role of roles) {
    if (primary && role.roleId === primary.roleId) continue;
    if (governanceView(role.governanceFunction, locale)) governance.push(role);
    else others.push(role);
  }
  const groups: RoleGroup[] = [];
  if (primary) groups.push({ label: translate(locale, "ui.role.group.primary"), roles: [primary] });
  if (governance.length) {
    groups.push({
      label: translate(locale, "ui.role.group.governance"),
      roles: governance,
    });
  }
  const defaultLabel = translate(locale, "ui.role.group.default");
  const byGroup = new Map<string, RoleView[]>();
  for (const role of others) {
    const label = role.group && role.group.trim() ? role.group.trim() : defaultLabel;
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
