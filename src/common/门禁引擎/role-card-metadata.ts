// 角色卡的组别展示信息：只读取明确的 Markdown 字段行，不读取边界或推导默认组。
import type { RoleGroupMetadata } from "../../model/role.ts";

const FIELD_NAMES = new Map<string, keyof RoleGroupMetadata>([
  ["group", "group"],
  ["组别", "group"],
  ["组别（group）", "group"],
  ["group (`group` / 组别)", "group"],
  ["groupduty", "groupDuty"],
  ["组内职责", "groupDuty"],
  ["组内职责（groupduty）", "groupDuty"],
  ["group duty (`groupduty` / 组内职责)", "groupDuty"],
]);

/** 当前中文双语粗体字段、英文技能模板，以及独立的中英文字段行。 */
export function parseRoleGroupMetadata(cardText: string): RoleGroupMetadata {
  const metadata: { -readonly [K in keyof RoleGroupMetadata]: RoleGroupMetadata[K] } = {};
  for (const line of cardText.split(/\r?\n/)) {
    // 粗体包含冒号（当前角色卡/技能模板）；普通字段行也须完整匹配，正文提及字段不算声明。
    const match = /^[ \t]*(?:\*\*([^*:\r\n]+?)[:：]\*\*|([^*:\r\n]+?)[:：])[ \t]*(.*)$/.exec(line);
    if (!match) continue;
    const field = FIELD_NAMES.get((match[1] ?? match[2]).trim().toLowerCase());
    if (field === undefined || metadata[field] !== undefined) continue;
    const value = match[3].trim();
    if (value !== "") metadata[field] = value;
  }
  return metadata;
}
