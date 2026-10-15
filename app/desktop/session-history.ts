// app/desktop/session-history.ts
// 桌面应用的**会话记录恢复**（D-1，2026-10-12 设计稿：存储＝**项目内** `<projectRoot>/.ans/sessions/<roleId>/`）。
//
// 职责（主进程侧；纯逻辑 + 只读 fs，**不依赖 electron**、**不依赖 Pi SDK**——按 JSONL 文件格式防御式解析）：
//   · `pickLatestSessionFile`：从候选文件里挑**最近**的一个（mtime 大者；并列取名字大者——确定性）；
//   · `parseSessionJsonl`：把 Pi 的会话 JSONL（首行 header `{type:"session",...}`，其余每行一 entry）解析并
//     **规范化**成界面行 `{kind: user|assistant|tool|denied, text, at}`——**认不出的 entry 跳过、坏行跳过、不抛**；
//   · `readRoleSessionHistory`：读某角色的会话目录 → 最近文件 → 解析；"没有历史" 与 "读坏了" 如实区分。
//
// 边界与纪律：
//   · **渲染进程不得依赖 Pi SDK / JSONL**——规范化的行经 IPC（`session:history`）推给渲染侧只做呈现；
//   · entry 字段以 Pi SDK 的持久化形状为准（`message` entry 的 `message` 为 `{role, content, timestamp}`；
//     assistant 的 content 块含 `text`/`thinking`/`toolCall`；toolResult 为 `{role:"toolResult", toolName,
//     content, isError, timestamp}`）；**只读消费、不导入 SDK 类型**（本层与 SDK 解耦，防漂移即防御式解析）；
//   · 一切解析失败都如实登记（`skipped`/`error`），**绝不抛给调用方**——恢复失败不阻断项目导入。

import fs from "node:fs";
import path from "node:path";
// 真机缺陷修复（2026-10-12）：交互请求的**锚点键**（单一来源 `request-anchor.ts`）——用于把
// request_confirmation / request_choice 的「调用行」与「结论行」标上同一个键，供渲染侧把交互卡
// 锚定回它发生的位置（详见该模块头注与 renderer.js 的锚点物化）。
import { anchorKeyForToolCall } from "./request-anchor.ts";

/** 会话目录相对项目根的位置（契约钉死：`<projectRoot>/.ans/sessions/<roleId>/`）。 */
export const SESSIONS_REL_DIR = ".ans/sessions";

/** 一行规范化后的界面回放行（渲染侧只认这四种 kind；文本一律由渲染侧 esc 后呈现）。 */
export interface ReplayRow {
  kind: "user" | "assistant" | "tool" | "denied";
  text: string;
  /** ISO 时间（entry 时间戳；缺失为空串——如实，不编造）。 */
  at: string;
  /** ANS 回放的权威轮次；旧 Pi JSONL 缺省，不从文本/时间推造。 */
  turnId?: string;
  /** ANS 原事件 kind；用户输入及旧 Pi JSONL 缺省。 */
  eventKind?: string;
  /** Explicit Core input identity; absent on unknown legacy echoes. */
  input?: import("../../src/model/runtime.ts").PromptInputEventDetail;
  inputProvenance?: import("../../src/model/runtime.ts").RuntimeInputProvenanceV1;
  inputPresentation?: import("../../src/model/runtime.ts").RuntimeLiveHandbackPresentationV1;
  inputTextProjection?: import("../../src/model/runtime.ts").RuntimeInputTextProjectionV1;
  deliveryReceipt?: import("../../src/model/runtime.ts").RuntimeDeliveryReceiptV1;
  deliveryBoundary?: { version: 1; deliveryId: string; attemptId: string; turnId: string; stage: 'provider-may-start' };
  textProjection?: import("../../src/model/runtime.ts").DisplayTextV1;
  /** Only parser facts, never text-template targets, qualify for the neutral projection. */
  legacyTargetSource?: 'argument' | 'tool-detail' | 'same-call' | 'template-only';
  legacyStatusSource?: import("../../src/model/runtime.ts").RuntimeLegacyToolFactsV1['statusSource'];
  metadataOmissions?: import("../../src/model/runtime.ts").RuntimeProtectedLegacyHistoryEntryV1['metadataOmissions'];
  /** 桌面内部展示事实；旧历史/旧推送可以缺省，渲染端诚实降级。 */
  activity?: { toolName: string; target: string; phase: "call" | "start" | "blocked" | "result"; status: "call" | "completed" | "returned" | "failed" | "unknown"; toolCallId?: string; turnId?: string; ok?: boolean; display?: import("../../src/model/runtime.ts").ToolDisplayV1 };
  /**
   * 关联 id（真机缺陷修复 2026-10-12）：交互工具（request_confirmation / request_choice）的
   * **pi toolCallId**——调用行与其结论行**带同一个值**（结论行经 `toolCallId` 字段对上调用行）。
   * 其它行缺省（`undefined`）。渲染侧据此把「请求—结论」两行彼此相认（锚点的精确性来源）。
   */
  requestId?: string;
  /** 交互请求的**锚点键**（`request-anchor.ts` 的单一算法拼出；两侧逐字可对上）——渲染侧据此把卡锚定到该请求。 */
  anchorKey?: string;
  /** 该行在「请求—结论」对中的位置：调用行 = "request"；结论行 = "conclusion"。非交互行缺省。 */
  anchor?: "request" | "conclusion";
}

export interface RoleSessionHistory {
  /** 是否成功读到并解析（**无历史目录不是失败**——那是 ok:true、rows:[]）。 */
  ok: boolean;
  rows: ReplayRow[];
  /** 命中的会话文件名（相对目录名；无则 undefined）——如实登记来源。 */
  source?: string;
  /** 失败/降级原因（读失败、header 不合法）；与 skipped 一起如实呈现。 */
  error?: string;
  /** 解析时跳过的行数（坏行/认不出的 entry）——如实，不静默。 */
  skipped: number;
}

/** 该角色的会话目录（绝对路径）。 */
export function sessionsDirFor(projectRoot: string, roleId: string): string {
  return path.join(projectRoot, ".ans", "sessions", roleId);
}

/** 从候选文件（`{name, mtimeMs}`）里挑**最近**者：mtime 大者优先；并列取名字大者（确定性）。 */
export function pickLatestSessionFile(files: { name: string; mtimeMs: number }[]): string | null {
  let best: { name: string; mtimeMs: number } | null = null;
  for (const f of files) {
    if (!best) {
      best = f;
      continue;
    }
    if (f.mtimeMs > best.mtimeMs || (f.mtimeMs === best.mtimeMs && f.name > best.name)) {
      best = f;
    }
  }
  return best ? best.name : null;
}

function isoFrom(value: unknown): string {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return new Date(value).toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

/** content（string | 块数组）→ 纯文本（只取 text 块；图片/thinking 等忽略——界面回放不涉密不炫技）。 */
function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const t = (block as { text?: unknown }).text;
      if (typeof t === "string" && t !== "") parts.push(t);
    }
  }
  return parts.join("\n\n");
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** 单条 entry → 0..n 个界面行（**认不出一律返回空数组**，由调用方计入 skipped 之外——不算坏行）。
 *
 * `interactionCalls`（真机缺陷修复 2026-10-12）：**跨 entry 的调用表**（pi toolCallId → 锚点键）——
 * 交互工具调用行登记于此，其**结论行**（后面的 toolResult entry）凭 `toolCallId` 取回同一个键，
 * 「请求—结论」两行因此彼此相认（供渲染侧插卡定界；见 ReplayRow 的 requestId/anchor/anchorKey）。
 * 会话文件里调用必先于结论（同一条 assistant 消息的内容块 → 下一条 toolResult 消息），单遍即够。 */
function rowsFromEntry(entry: unknown, interactionCalls: Map<string, string>, toolTargets: Map<string, string>): ReplayRow[] {
  const e = asRecord(entry);
  if (!e || e.type !== "message") return []; // 非消息 entry（usage/model_change/compaction/…）不进界面回放
  const m = asRecord(e.message);
  if (!m) return [];
  const at = isoFrom(typeof e.timestamp === "string" ? e.timestamp : m.timestamp);
  const role = m.role;
  const content = m.content;
  if (role === "user") {
    const text = textOfContent(content);
    return text !== "" ? [{ kind: "user", text, at }] : [];
  }
  if (role === "assistant") {
    const rows: ReplayRow[] = [];
    const text = textOfContent(content);
    if (text !== "") rows.push({ kind: "assistant", text, at });
    if (Array.isArray(content)) {
      for (const block of content) {
        const b = asRecord(block);
        if (b && b.type === "toolCall") {
          const name = typeof b.name === "string" && b.name !== "" ? b.name : "tool";
          const row: ReplayRow = { kind: "tool", text: `调用工具 ${name}`, at };
          // 交互工具调用：带上 pi toolCallId（两行相认）与锚点键（渲染侧插卡定界）。
          const callId = typeof b.id === "string" && b.id !== "" ? b.id : "";
          const args = asRecord(b.arguments);
          const target = typeof args?.path === "string" ? args.path : typeof args?.command === "string" ? args.command : "";
          if (callId) toolTargets.set(callId, target);
          row.legacyTargetSource = "argument";
          row.activity = { toolName: name, target, phase: "call", status: "call", ...(callId ? { toolCallId: callId } : {}) };
          const anchorKey = anchorKeyForToolCall(name, b.arguments);
          if (callId !== "" && anchorKey !== null) {
            row.requestId = callId;
            row.anchorKey = anchorKey;
            row.anchor = "request";
            interactionCalls.set(callId, anchorKey);
          }
          rows.push(row);
        }
      }
    }
    return rows;
  }
  if (role === "toolResult") {
    const name = typeof m.toolName === "string" && m.toolName !== "" ? m.toolName : "工具";
    const text = textOfContent(content);
    const kind: ReplayRow["kind"] = m.isError === true ? "denied" : "tool";
    const row: ReplayRow = { kind, text: text !== "" ? `${name}：${text}` : name, at };
    // 结论行：凭 toolCallId 对上调用行登记的锚点（对上 ⇒ 带上同一 requestId/anchorKey——**不解析正文**）。
    const callId = typeof m.toolCallId === "string" && m.toolCallId !== "" ? m.toolCallId : "";
    const details = asRecord(m.details);
    let target = typeof details?.path === "string" ? details.path : toolTargets.get(callId) || "";
    // 仅消费本仓工具的确定首行模板；文件正文/stdout中的词不参与失败判断。
    const head = text.split(/\r?\n/)[0];
    const shell = name === "run_shell" ? /^run_shell 已执行：(.+)（exit (-?\d+|\?)(?:，signal [^）]+)?）$/.exec(head) : null;
    row.legacyTargetSource = typeof details?.path === 'string' ? 'tool-detail' : toolTargets.get(callId) ? 'same-call' : undefined;
    if (!target && shell) { target = shell[1]; row.legacyTargetSource = 'template-only'; }
    const knownFailure = name === "read_file" && /^read_file 失败：.+（.+）$/.test(head) || !!(shell && shell[2] !== "?" && Number(shell[2]) !== 0);
    const failed = m.isError === true || details?.ok === false || details?.status === "failed" || knownFailure;
    row.legacyStatusSource = knownFailure && m.isError !== true && details?.ok !== false && details?.status !== 'failed' ? 'legacy-classifier' : typeof m.isError === 'boolean' ? 'native-result' : typeof details?.ok === 'boolean' || typeof details?.status === 'string' ? 'tool-details' : 'legacy-classifier';
    if (failed) row.kind = "denied";
    row.activity = { toolName: name, target, phase: "result", status: failed ? "failed" : details?.status === "completed" && details?.ok !== false ? "completed" : m.isError === false ? "returned" : "unknown",
      ...(callId ? { toolCallId: callId } : {}), ...(typeof details?.turnId === "string" ? { turnId: details.turnId } : {}), ...(typeof details?.ok === "boolean" ? { ok: details.ok } : {}) };
    const anchorKey = callId !== "" ? interactionCalls.get(callId) : undefined;
    if (callId !== "" && anchorKey !== undefined) {
      row.requestId = callId;
      row.anchorKey = anchorKey;
      row.anchor = "conclusion";
    }
    return [row];
  }
  return []; // system 等其它 role：不进界面回放
}

/**
 * 解析一份会话 JSONL 文本 → 界面行。**防御式**：坏行跳过（计入 skipped）、认不出的 entry 跳过（同样计入）；
 * 首行必须是合法 header（`{type:"session"}`），否则整体判失败（error）——不拿半份垃圾当历史。
 */
export function parseSessionJsonl(text: string): { ok: boolean; rows: ReplayRow[]; skipped: number; error?: string } {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  let headerParsed = false;
  const rows: ReplayRow[] = [];
  let skipped = 0;
  // 交互工具调用表（pi toolCallId → 锚点键）：调用行登记、结论行取回——见 rowsFromEntry 的头注。
  const interactionCalls = new Map<string, string>();
  const toolTargets = new Map<string, string>();
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (raw === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skipped += 1;
      continue;
    }
    if (!headerParsed) {
      const h = asRecord(parsed);
      if (!h || h.type !== "session") {
        return { ok: false, rows: [], skipped, error: "首行不是有效的会话头（type!=session）" };
      }
      headerParsed = true;
      continue;
    }
    const entryRows = rowsFromEntry(parsed, interactionCalls, toolTargets);
    if (entryRows.length === 0) {
      skipped += 1; // 认不出的 entry / 无文本的消息——如实计入，不静默吞
      continue;
    }
    for (const r of entryRows) rows.push(r);
  }
  if (!headerParsed) {
    return { ok: false, rows: [], skipped, error: "会话文件为空或无有效会话头" };
  }
  return { ok: true, rows, skipped };
}

/**
 * 读某角色的会话历史（主进程侧；**只读**）：
 *  - 目录不存在 → `{ok:true, rows:[]}`（**没有历史不是失败**——从未开过会话的角色即如此）；
 *  - 目录在、挑**最近**文件（mtime）+ 解析；读失败/header 不合法 → `{ok:false, error}`（不抛）；
 *  - **跨角色不串**：只读 `.../sessions/<roleId>/` 自己的目录。
 */
export async function readRoleSessionHistory(projectRoot: string, roleId: string): Promise<RoleSessionHistory> {
  const dir = sessionsDirFor(projectRoot, roleId);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return { ok: true, rows: [], skipped: 0 }; // 无目录 = 无历史（含权限外/不存在——一律当"没有"）
  }
  const files: { name: string; mtimeMs: number }[] = [];
  for (const name of names) {
    try {
      const st = await fs.promises.stat(path.join(dir, name));
      if (st.isFile()) files.push({ name, mtimeMs: st.mtimeMs });
    } catch {
      // 单个文件 stat 失败：跳过（不阻断其它候选）
    }
  }
  const latest = pickLatestSessionFile(files);
  if (latest === null) {
    return { ok: true, rows: [], skipped: 0 };
  }
  let text: string;
  try {
    text = await fs.promises.readFile(path.join(dir, latest), "utf8");
  } catch (err) {
    return { ok: false, rows: [], source: latest, skipped: 0, error: `会话文件读取失败：${reasonOf(err)}` };
  }
  const parsed = parseSessionJsonl(text);
  return parsed.ok
    ? { ok: true, rows: parsed.rows, source: latest, skipped: parsed.skipped }
    : { ok: false, rows: [], source: latest, skipped: parsed.skipped, error: parsed.error };
}

/**
 * **会话文件粗探**（D-1 契约用语「文件在/不在/坏」；打开会话时分类 `contextSource` 用）：
 * 只看**最近文件的首行 header**（不全量解析）——`"missing"`（无文件）/ `"ok"`（header 合法）/
 *  `"corrupt"`（读失败或首行非合法会话头）。
 */
export async function probeSessionFile(projectRoot: string, roleId: string): Promise<"missing" | "ok" | "corrupt"> {
  const dir = sessionsDirFor(projectRoot, roleId);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return "missing";
  }
  const files: { name: string; mtimeMs: number }[] = [];
  for (const name of names) {
    try {
      const st = await fs.promises.stat(path.join(dir, name));
      if (st.isFile()) files.push({ name, mtimeMs: st.mtimeMs });
    } catch {
      // 单个文件 stat 失败：跳过
    }
  }
  const latest = pickLatestSessionFile(files);
  if (latest === null) return "missing";
  let head = "";
  try {
    const fh = await fs.promises.open(path.join(dir, latest), "r");
    try {
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(buf, 0, 4096, 0);
      head = buf.subarray(0, bytesRead).toString("utf8");
    } finally {
      await fh.close();
    }
  } catch {
    return "corrupt";
  }
  const firstLine = head.split(/\r?\n/, 1)[0].trim();
  try {
    const h = JSON.parse(firstLine) as unknown;
    if (h !== null && typeof h === "object" && (h as { type?: unknown }).type === "session") return "ok";
  } catch {
    // 落到 corrupt
  }
  return "corrupt";
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}


/** Pure conversion of existing parser facts; it neither expands IO nor trusts template-derived commands. */
export function toRuntimeLegacyEntries(rows: readonly ReplayRow[]): import("../../src/model/runtime.ts").RuntimeLegacyHistoryEntryV1[] {
  return rows.map(row => {
    const anchor = row.anchorKey && row.anchor ? { token: row.anchorKey, position: row.anchor, ...(row.requestId ? { nativeCallId: row.requestId } : {}) } : undefined;
    const base = { ...(row.at ? { at: row.at } : {}), ...(anchor ? { anchor } : {}) };
    if (row.kind === 'user' || row.kind === 'assistant') return { ...base, kind: row.kind === 'user' ? 'user-text' as const : 'assistant-text' as const, text: row.text };
    const a = row.activity;
    const source = row.legacyTargetSource;
    return { ...base, kind: 'tool-record' as const, text: row.text, tool: {
      toolName: a?.toolName ?? '工具', phase: a?.phase === 'call' || a?.phase === 'start' ? 'start' as const : 'result' as const,
      ...(a?.toolCallId ? { toolCallId: a.toolCallId } : {}), ...(a?.turnId ? { turnId: a.turnId } : {}),
      ...(typeof a?.ok === 'boolean' ? { ok: a.ok } : {}),
      ...(a && a.status !== 'call' ? { reportedStatus: a.status, statusSource: row.legacyStatusSource ?? 'legacy-classifier' as const } : {}),
      ...(a?.target && source && source !== 'template-only' ? { target: { kind: a.toolName === 'run_shell' ? 'command' as const : 'path' as const, value: a.target, source } } : {}),
    } };
  });
}
