// 工具结果附图（2026-10-27 同轮看图设计 §6.4 Claude 行）。
//
// 运行时核心在 `tool-result` 交付方式下把 `view_image` 读到的图片放进 `ToolResult.images`
// （`PromptImage[]`，仅 `ok:true` 时非空）；本适配器把每条图片映射为进程内 MCP 工具结果的
// `image` 内容块（`{type:"image", data, mimeType}`）。MCP `CallToolResult.content` 规范支持
// image 块，Claude 的 MCP 客户端按规范把它带入同一轮的下一次模型请求（真实端到端探针见
// `角色卡/Claude适配器/docs/change/2026-10-27_change_tool-result-images-claude.md`）。
//
// fail-closed 纪律（设计 §9.2）：
// - 工具失败（`ok:false`）⇒ **绝不**附图，即使 `images` 意外非空；
// - 图片载荷非法（非数组/条目非对象/type 非 "image"/data 空或非标准 base64/MIME 非白名单）
//   ⇒ **一张都不交付**（不做部分交付），本次结果标 `isError:true` 并追加「图片未提供」注记，
//   绝不自称「已附上」；
// - 图片数据**原引用**透传（不重编码、不重新 base64、不缩放——缩放/校验属引擎侧）；
// - `data`/base64 **绝不**进入 `redact`、日志、诊断、工具展示事件或 `details`（适配器只允许
//   计数/字节/MIME/交付方式等元数据；事件 facts 在 session.ts 中剔除 `images` 后才投影）。

/** Claude 图片 MIME 白名单：用户提示图片与工具结果图片**同一集合**（session.ts 单一引用）。 */
export const CLAUDE_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ClaudeImageMimeType = (typeof CLAUDE_IMAGE_MIME_TYPES)[number];
const CLAUDE_IMAGE_MIME_TYPE_SET: ReadonlySet<string> = new Set(CLAUDE_IMAGE_MIME_TYPES);

/** 是否为 Claude 支持的图片 MIME（白名单外一律按非法载荷处理）。 */
export function isClaudeImageMimeType(value: unknown): value is ClaudeImageMimeType {
  return typeof value === "string" && CLAUDE_IMAGE_MIME_TYPE_SET.has(value);
}

/** 标准（带填充、无空白）base64：`Buffer#toString("base64")` 的输出恒满足。 */
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const isCanonicalBase64 = (value: string): boolean =>
  value.length > 0 && value.length % 4 === 0 && CANONICAL_BASE64.test(value);

/** 交给 MCP 的图片内容块（与 `PromptImage` 同形；`data` 原引用）。 */
export interface ClaudeToolResultImageContent {
  type: "image";
  data: string;
  mimeType: ClaudeImageMimeType;
}

export interface ClaudeToolResultImageMapping {
  /** 可交付给模型的 MCP 图片内容块（原引用；空数组 = 不附图）。 */
  images: ClaudeToolResultImageContent[];
  /** 载荷非法 ⇒ 本次结果必须 fail-closed（无图 + isError + 诚实注记）。 */
  invalid: boolean;
}

/**
 * `ToolResult.images` → MCP image content（纯映射；policy/交付方式仍由运行时核心决定）。
 * 只信任 `ok:true` 的结果；`images` 缺省或空数组 = 不附图；任一条非法 ⇒ 整批不交付。
 */
export function mapClaudeToolResultImages(result: { ok: boolean; images?: unknown }): ClaudeToolResultImageMapping {
  if (!result.ok || result.images === undefined) return { images: [], invalid: false };
  if (!Array.isArray(result.images)) return { images: [], invalid: true };
  if (result.images.length === 0) return { images: [], invalid: false };
  const images: ClaudeToolResultImageContent[] = [];
  for (const entry of result.images) {
    if (entry === null || typeof entry !== "object") return { images: [], invalid: true };
    const record = entry as Record<string, unknown>;
    const data = record["data"];
    const mimeType = record["mimeType"];
    if (record["type"] !== "image") return { images: [], invalid: true };
    if (typeof data !== "string" || !isCanonicalBase64(data)) return { images: [], invalid: true };
    if (!isClaudeImageMimeType(mimeType)) return { images: [], invalid: true };
    images.push({ type: "image", data, mimeType });
  }
  return { images, invalid: false };
}
