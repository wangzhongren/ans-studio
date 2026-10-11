// 拒绝信息的可读格式化。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
// 本文件不做任何路径判定——判定由门禁引擎的 resolveWrite 完成，这里只把
// WriteDecision 的拒绝分支渲染成人类可读的多行文本，并按根（skill/project）分组（F10）。

import type { WriteDecision } from "../../model/decision.ts";

/** 从 WriteDecision 中取出拒绝分支的类型（供函数签名使用）。 */
export type DeniedDecision = Extract<WriteDecision, { allowed: false }>;

/** 把某根下的允许路径列表渲染成一行；空列表给出显式"（无）"。 */
function renderRoot(label: string, paths: string[]): string {
  const body = paths.length > 0 ? paths.join(", ") : "（无）";
  return `  ${label}: ${body}`;
}

/**
 * 渲染拒绝信息。始终包含：
 * 1. 拒绝原因（来自门禁引擎）；
 * 2. 按根分组的允许路径（skill / project），避免"哪个根"的歧义。
 */
export function formatDenialMessage(decision: DeniedDecision): string {
  const { skill, project } = decision.allowedByRoot;
  return [
    `写入被拒绝：${decision.reason}`,
    "允许写入的路径（按根分组）：",
    renderRoot("skill", skill),
    renderRoot("project", project),
  ].join("\n");
}
