// app/desktop/session/shared/text.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1）：文本/指纹/事件归类共享纯函数（L0）。
// 9 个顶层函数自 app/desktop/session.ts **逐字搬移**（仅 import 与导出适配；函数体逐字不变）。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { OrchestrationEvent, HandbackEvent } from "../../../../src/common/编排/handback.ts";

/** 队列摘要用的一句短句（L-1 可见性；仅呈现，不参与任何判定）。 */
export function shortenText(s: string, n: number): string {
  const flat = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/**
 * **应用任务稳定身份前缀**（2026-10-25 真机重复投递修复：「role-readiness 派发任务」在重建前后
 * 出现两条 user 消息、账本却只有一条 `dispatch.accepted`）。
 *
 * 应用派发的任务（派发/验收/协调/意图交接等）没有调用方自带的稳定 id；`sendBackground` 每次入队都用
 * 随机键时，同一任务的两次应用侧调用（两条链路/一次重试）会被当成两条独立消息重复投递。本层为这类
 * 任务生成**内容稳定键**（项目+目标角色+引擎+正文 sha256，或派发的既有内容 `dedupKey` sha256）：
 *  · 同任务同键——重建后续投、应用侧重复调用、重启后恢复的队列项都能认出来，**至多投递一次**；
 *  · 真实客户消息不生成该键（渲染侧 UUID 或缺失）——「同文重复发送是两个意图」的语义逐字不变；
 *  · 显式**重新入队**（`enqueueDelivery`，如返工后同文再派）会清除「已投递」标记——返工回路仍可用。
 *
 * 前缀只用于本层身份判别（不构成权限/授权语义）；渲染侧传来的任意 `clientMessageId` 不会命中该前缀
 * （随机 UUID），因此不会被误当成应用任务。
 */
export const APP_TASK_CLIENT_MESSAGE_ID_PREFIX = "ans-app-task:";

export function isAppTaskClientMessageId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(APP_TASK_CLIENT_MESSAGE_ID_PREFIX) && value.length > APP_TASK_CLIENT_MESSAGE_ID_PREFIX.length;
}

/** 「替我审」`turnText` 上界（PM 评审 §8.1：≤4KB；超出截断，不据此 manual）。 */
const TURN_TEXT_MAX_BYTES = 4096;

/** 把投递文本收敛到 ≤4KB（UTF-8）；不切断多字节字符。 */
export function boundTurnText(text: string): string {
  const raw = typeof text === "string" ? text : "";
  const buf = Buffer.from(raw, "utf8");
  if (buf.length <= TURN_TEXT_MAX_BYTES) return raw;
  let end = TURN_TEXT_MAX_BYTES;
  // 退到 UTF-8 字符边界（continuation byte 为 10xxxxxx）。
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * **有界等待（意图交接投递用）**：超时返回 `{timedOut:true}`；底层 promise 继续（不取消、不伪造结果）。
 * 与既有应用侧时限模式同口径——只保证回执必然返回。
 */
export function withStageDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(1, timeoutMs));
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise.then((value) => ({ timedOut: false as const, value })), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** O-1：单个文件的**内容指纹**（sha256）。
 *  **Q-1（2026-10-12）**：热路径加 **mtime+size 缓存**——未变文件只 `stat`、不重读重哈希（防读盘风暴）；
 *  文件变了（mtime/size 任一不同）才重读重哈希。不存在/读失败记 `<missing>`（清缓存——下次出现要拿到真值）。 */
const filePrintCache = new Map<string, { mtimeMs: number; size: number; print: string }>();
export async function filePrint(absPath: string): Promise<string> {
  try {
    const st = await fs.promises.stat(absPath);
    const hit = filePrintCache.get(absPath);
    if (hit !== undefined && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.print;
    const print = createHash("sha256").update(await fs.promises.readFile(absPath)).digest("hex");
    filePrintCache.set(absPath, { mtimeMs: st.mtimeMs, size: st.size, print });
    return print;
  } catch {
    filePrintCache.delete(absPath);
    // `<missing>` 哨兵：G-1 必读引用同用本函数探测——非 sha256 值（含本哨兵）在 `planDispatchDelivery`
    // 判据内天然按「文件不存在」处理（fail-closed；投递侧无需再映射）。
    return "<missing>";
  }
}

/** 非 assistant 正文的 `detail.source`（系统行/投递状态/推理/工具展示/长度提示——不记入反馈镜像）。 */
const NON_ASSISTANT_DETAIL_SOURCES: ReadonlySet<string> = new Set([
  "delivery-note",
  "prompt-input",
  "delivery-receipt",
  "delivery-boundary",
  "reasoning",
  "reasoning-diagnostic",
  "tool-display-diagnostic",
  "server-tools",
  "length-followup",
  "length-degrade",
  "system",
]);

/**
 * assistant 正文判定（2026-10-18 live 修正）：`message` 且 summary 非空；`detail` 缺省或**不是**
 * 系统行/工具事件（带 `display` 的普通 assistant 文本照记）。工具事件按 `toolCallId`/`toolName`/`call`
 * 键排除；detail 结构无法确认（非对象）时不记（fail-closed，避免把系统行当正文）。
 */
export function isAssistantTextEvent(ev: OrchestrationEvent): ev is Exclude<OrchestrationEvent, HandbackEvent> {
  if (ev.kind !== "message") return false;
  if (typeof ev.summary !== "string" || ev.summary.trim() === "") return false;
  const detail = ev.detail;
  if (detail === undefined) return true;
  if (typeof detail !== "object" || detail === null) return false;
  const record = detail as Record<string, unknown>;
  if (typeof record.source === "string" && NON_ASSISTANT_DETAIL_SOURCES.has(record.source)) return false;
  if ("toolCallId" in record || "toolName" in record || "call" in record) return false;
  return true;
}

/**
 * BUG-5 精化（2026-11-05，真机缺陷）：星形任务回交的报告抑制判据。
 * 仅两种情况抑制：①任务已**收口**（closed，终态）；②**同一回合**（turnId 相同）已报告（重复）。
 * `blocked` 报告不是终态——此后**新回合**的真实报告（如重试完成/更完整回执）必须投递；
 * 旧实现「已有任何报告即抑制」曾在演示缺陷中用假 blocked 报告吞掉真实 worker 报告。
 * 无 turnId 的旧载荷不做回合级抑制（跨回合重复由回交去重键与账本 reportKey 兜底）。
 */
export function shouldSuppressStarTaskReport(input: {
  closed: boolean;
  priorTurnIds: readonly (string | undefined)[];
  turnId?: string;
}): boolean {
  if (input.closed) return true;
  const turnId = typeof input.turnId === "string" && input.turnId !== "" ? input.turnId : undefined;
  if (turnId === undefined) return false;
  return input.priorTurnIds.some((prior) => prior === turnId);
}

/** 项目相对文件引用（报告证据路径白名单形状；拒绝绝对/盘符/`..`）。 */
export function isProjectRelativeFileRef(value: string): boolean {
  const text = value.trim();
  if (text === "" || text.startsWith("/") || text.includes("\\") || /^[a-zA-Z]:/.test(text)) return false;
  return text.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * 最新版本化文档发现（T3 B3 固定卡 `documentRefs`/A12 证据用）：
 * `<dir>/<flowId>-<suffix>-vN.md` 中 N 最大；缺失/不可读 ⇒ undefined（调用方 fail-closed）。
 */
export async function latestVersionedDoc(
  projectRoot: string,
  dir: string,
  flowId: string,
  suffix: string,
): Promise<{ name: string; version: number } | undefined> {
  let names: string[];
  try {
    names = await fs.promises.readdir(path.join(projectRoot, dir));
  } catch {
    return undefined;
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-${suffix}-v(\\d+)\\.md$`);
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (!Number.isSafeInteger(version) || version < 1) continue;
    if (best === undefined || version > best.version) best = { name, version };
  }
  return best;
}
