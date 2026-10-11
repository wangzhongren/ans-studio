// src/common/编排/output.ts
// 会话事件的可读格式化。以结构类型接收事件（不导入任何运行层），便于单元测试与复用。

export interface PrintableEvent {
  kind: string;
  summary: string;
  detail?: unknown;
}

// 把一条会话事件格式化为可打印文本。
// 若 summary 未包含按根分组的允许路径，而 detail 携带 allowedByRoot（F10），则按根分组补列，
// 避免与已自行格式化的适配器（如假 runtime）重复打印同一段分组。
export function formatEvent(ev: PrintableEvent): string {
  const head = `[${ev.kind}] ${ev.summary}`;
  if (summaryHasGrouping(ev.summary)) return head;
  const grouped = formatAllowedByRoot(ev.detail);
  return grouped ? `${head}\n${grouped}` : head;
}

function summaryHasGrouping(summary: string): boolean {
  return summary.includes("按根分组") || summary.includes("允许路径");
}

// 从 detail.allowedByRoot 提取 {skill, project} 两组允许路径，返回多行文本；无则返回 undefined。
function formatAllowedByRoot(detail: unknown): string | undefined {
  if (typeof detail !== "object" || detail === null) return undefined;
  const abr = (detail as { allowedByRoot?: unknown }).allowedByRoot;
  if (typeof abr !== "object" || abr === null) return undefined;
  const skill = asStrings((abr as { skill?: unknown }).skill);
  const project = asStrings((abr as { project?: unknown }).project);
  if (skill.length === 0 && project.length === 0) return undefined;
  const lines = ["  允许路径（按根分组）："];
  lines.push("    skill:");
  for (const p of skill) lines.push(`      - ${p}`);
  lines.push("    project:");
  for (const p of project) lines.push(`      - ${p}`);
  return lines.join("\n");
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
