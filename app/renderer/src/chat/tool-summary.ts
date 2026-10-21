/**
 * 工具组相位合并与折叠摘要（Phase 3A 补齐）。
 *
 * 口径对齐旧 `app/renderer/tool-rows.js`：
 *  - 同一 turnId + callId 的「发起 / 结果 / 未放行」是**一次调用**的多个相位，折叠行只计一次；
 *  - 没有 callId 的事件各成一行（计数不合并）；
 *  - 摘要文案：「本轮 N 个调用：a / b ×k」+「· 含 X 条未放行」+「· 含 Y 条失败」+「· 含状态未记录」。
 * 纯函数，无 DOM/存储依赖，供渲染与 node 单测共用。
 */

import type { ActivityItem } from "./types.ts";

export interface ActivityPhaseRow {
  /** 该调用在 `items` 中的首个下标（旧 data-activity-index 契约）。 */
  index: number;
  /** 该调用全部相位在 `items` 中的下标。 */
  phases: number[];
  callId: string;
  turnId: string;
  toolName: string;
  target: string;
  status: string;
  statusText: string;
  at: string;
  items: ActivityItem[];
}

/** 事件时间短格式（旧 `ANSRuntimeUI.shortTime` 同口径；无法解析不发明时间）。 */
export function shortTime(at: string): string {
  if (typeof at !== "string" || at === "") return "";
  const value = new Date(at);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 同一次调用的相位合并（旧 `mergePhases` 同口径：turnId + callId 去重）。 */
export function mergePhases(items: ActivityItem[]): ActivityPhaseRow[] {
  const list = Array.isArray(items) ? items : [];
  const byCall = new Map<string, ActivityPhaseRow>();
  const rows: ActivityPhaseRow[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index] || ({} as ActivityItem);
    const callId = typeof item.callId === "string" ? item.callId : "";
    const turnId = typeof item.turnId === "string" ? item.turnId : "";
    const key = callId ? turnId + "\u0000" + callId : "";
    if (key && byCall.has(key)) {
      const existing = byCall.get(key)!;
      existing.phases.push(index);
      existing.items.push(item);
      continue;
    }
    const row: ActivityPhaseRow = {
      index,
      phases: [index],
      callId,
      turnId,
      toolName: item.toolName || "工具",
      target: item.target || "",
      status: item.status || "recorded",
      statusText: item.statusText || "已记录",
      at: typeof item.at === "string" ? item.at : "",
      items: [item],
    };
    if (key) byCall.set(key, row);
    rows.push(row);
  }
  return rows;
}

/** 行内相位文案（旧 `status` 事实单点；与折叠摘要同源，不另判）。 */
export function activityPhaseLabel(item: ActivityItem): string {
  switch (item.status) {
    case "running":
    case "call":
    case "start":
      return "调用发起";
    case "denied":
      return "已拒绝";
    case "failed":
      return "执行失败";
    case "timed-out":
      return "超时终止";
    case "exited-nonzero":
      return item.statusText || "已执行完成";
    case "completed":
      return "执行完成";
    case "returned":
      return "工具返回";
    case "unknown":
      return "状态未记录";
    case "recorded":
      return item.statusText || "已记录";
    default:
      return item.statusText || "状态未记录";
  }
}

/** 合并行的终态（末相位优先，空目标回退首相位）。 */
export function phaseRowView(row: ActivityPhaseRow): ActivityPhaseRow {
  const first = row.items[0] || ({} as ActivityItem);
  const terminal = row.items[row.items.length - 1] || first;
  const status = terminal.status || row.status;
  return {
    ...row,
    toolName: terminal.toolName || first.toolName || row.toolName,
    target: terminal.target || first.target || row.target,
    status,
    statusText: activityPhaseLabel({ ...terminal, status }),
    at: (terminal.at || first.at || row.at || "") as string,
  };
}

export interface CallSummary {
  calls: number;
  denied: number;
  failed: number;
  unknown: boolean;
  tools: Array<{ name: string; count: number }>;
}

/** 折叠摘要计数（纯计数，不改条目事实）。 */
export function callSummary(items: ActivityItem[]): CallSummary {
  const list = Array.isArray(items) ? items : [];
  const rows = mergePhases(list);
  let denied = 0;
  let failed = 0;
  let unknown = false;
  const tools: Array<{ name: string; count: number }> = [];
  const toolIndex = new Map<string, number>();
  for (const row of rows) {
    let rowDenied = false;
    let rowFailed = false;
    let first: ActivityItem | null = null;
    let terminal: ActivityItem | null = null;
    for (const index of row.phases) {
      const item = list[index] || ({} as ActivityItem);
      if (item.status === "denied") rowDenied = true;
      if (item.status === "failed" || item.status === "timed-out") rowFailed = true;
      if (item.status === "unknown") unknown = true;
      if (!first) first = item;
      terminal = item;
    }
    if (rowDenied) denied += 1;
    else if (rowFailed) failed += 1;
    const name =
      (terminal && terminal.toolName) ||
      (first && first.toolName) ||
      "工具";
    if (!toolIndex.has(name)) {
      toolIndex.set(name, tools.length);
      tools.push({ name, count: 0 });
    }
    tools[toolIndex.get(name)!].count += 1;
  }
  return { calls: rows.length, denied, failed, unknown, tools };
}

/** 折叠行文案（旧 `foldSummaryText` 同文案）。 */
export function foldSummaryText(summary: CallSummary): string {
  const tools = summary.tools
    .map((tool) => tool.name + (tool.count > 1 ? " ×" + tool.count : ""))
    .join(" / ");
  let text = "本轮 " + summary.calls + " 个调用" + (tools ? "：" + tools : "");
  if (summary.denied > 0) text += " · 含 " + summary.denied + " 条未放行";
  if (summary.failed > 0) text += " · 含 " + summary.failed + " 条失败";
  if (summary.unknown) text += " · 含状态未记录";
  return text;
}
