// —————————————————————— 工具结果附图（2026-10-27 同轮看图设计 §5.3/§6.4） ——————————————————————
//
// 运行时核心在 `tool-result` 交付方式下把 `view_image` 读到的图片放进 `ToolResult.images`
// （`PromptImage[]`，仅 `ok:true` 时非空）；本适配器把每条图片映射为两层原生内容：
//  · 进程内 MCP handler 返回 `{type:"image",data,mimeType}` 内容块（MCP `CallToolResult.content` 规范）；
//  · 动态工具响应用 `contentItems` 回给 Codex：`{type:"inputImage",imageUrl:"data:<mime>;base64,<data>"}`。
//
// 本机 `@openai/codex 0.162.1` 的 `DynamicToolCallOutputContentItem` 已含 `inputImage{imageUrl}`
// （结构探针见 `test/codex-adapter/native-probe.mjs` 与本文件同批测试）；上游只接受 **data URL**，
// 远程 HTTP(S) 图片 URL 会被拒绝——因此这里**不写临时文件、不做远程 URL、不重编码图片**。
//
// fail-closed 纪律（设计 §9.2，与 Pi 适配器同口径）：
// · 工具失败（`ok:false`）⇒ **绝不**附图，即使 `images` 意外非空；
// · 图片载荷非法（`images` 非数组/缺 data/空 data/非 base64 形态/非白名单 MIME）⇒ **一张都不交付**
//   （不做部分交付），调用方必须以「图片未提供」的诚实文本 + `isError:true` fail-closed；
// · `data`/`data:` URL **绝不**经过 `redact`、日志、诊断、事件或 details——只有文本经过 `redact`；
// · 图片数据**原引用**透传（不重新 base64、不缩放；缩放/校验属引擎侧）。

/** Codex 工具结果附图的 MIME 白名单（与工具层 `view_image` 同一集合；白名单外按非法处理）。 */
export const CODEX_TOOL_RESULT_IMAGE_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** 进程内 MCP handler 可返回的图片内容块（MCP image block；`data` 为 base64，不含前缀）。 */
export interface CodexToolResultImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** 动态工具 `contentItems` 的两类合法条目（Codex 0.162.1 schema）。 */
export type CodexDynamicContentItem =
  | { type: "inputText"; text: string }
  | { type: "inputImage"; imageUrl: string };

export interface CodexToolResultImageMapping {
  /** 可交付给模型的 MCP 图片内容块（原引用；空数组＝不附图）。 */
  images: CodexToolResultImageContent[];
  /** 图片载荷非法 ⇒ 本次结果必须 fail-closed（无图 + isError + 诚实注记）。 */
  invalid: boolean;
}

export interface CodexDynamicContentMapping {
  /** 可直接回给 Codex app-server 的 `contentItems`（图片为 data URL；空数组＝仅失败注记场景）。 */
  items: CodexDynamicContentItem[];
  /** 内容面出现未知块或非法图片 ⇒ 整个动态响应必须 fail-closed。 */
  invalid: boolean;
}

/** 工具结果中图片映射失败时追加给模型的诚实注记（不含任何图片字节）。 */
export const CODEX_IMAGE_UNAVAILABLE_NOTE = "（Codex 适配器：工具结果中的图片数据非法，未向模型提供任何图片；本轮不要假装已看到。）";

/** 标准 base64 形态（允许省略 padding；Buffer.toString("base64") 正常带 padding）。 */
const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * 单条图片载荷 → MCP image block；形态非法/非白名单 MIME 返回 undefined（fail-closed 判据）。
 * `data` 必须是纯 base64 文本：不含空白/NUL/other dat URI 片段——图片字节由运行时核心从
 * 已校验（路径/类型/大小）的文件读出并 `Buffer.toString("base64")`，正常恒满足。
 */
function codexImageContentOf(value: unknown): CodexToolResultImageContent | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const data = record["data"];
  const mimeType = record["mimeType"];
  if (typeof data !== "string" || data === "" || data.length % 4 === 1 || !BASE64_SHAPE.test(data)) return undefined;
  if (typeof mimeType !== "string" || !CODEX_TOOL_RESULT_IMAGE_MIMES.has(mimeType)) return undefined;
  return { type: "image", data, mimeType };
}

/**
 * `ToolResult.images` → MCP image blocks（纯映射；policy/交付方式仍由运行时核心决定）。
 * 只信任 `ok:true` 的结果；`images` 缺省或空数组＝不附图；任一条非法 ⇒ 整批不交付。
 */
export function mapCodexToolResultImages(result: { ok: boolean; images?: unknown }): CodexToolResultImageMapping {
  if (!result.ok || result.images === undefined) return { images: [], invalid: false };
  if (!Array.isArray(result.images)) return { images: [], invalid: true };
  if (result.images.length === 0) return { images: [], invalid: false };
  const images: CodexToolResultImageContent[] = [];
  for (const entry of result.images) {
    const image = codexImageContentOf(entry);
    if (image === undefined) return { images: [], invalid: true };
    images.push(image);
  }
  return { images, invalid: false };
}

/**
 * MCP `CallToolResult.content` → Codex `contentItems`（动态工具响应的唯一映射点）：
 * · `text` → `{type:"inputText",text}`，文本**经过** `redact`（与旧行为逐字一致）；
 * · `image` → `{type:"inputImage",imageUrl:"data:<mime>;base64,<data>"}`，图片**绝不**经过 `redact`；
 * · `includeImages:false`（MCP 结果已 `isError`）⇒ 任何 image 块都不转发（失败结果绝不附图）；
 * · 未知块或非法图片 ⇒ `invalid:true`（调用方整批 fail-closed，不部分交付）。
 */
export function mapCodexDynamicContent(
  content: readonly { type: string; text?: string; data?: string; mimeType?: string }[],
  redact: (input: unknown) => string,
  options: { includeImages?: boolean } = {},
): CodexDynamicContentMapping {
  const includeImages = options.includeImages !== false;
  const items: CodexDynamicContentItem[] = [];
  for (const item of content) {
    if (item.type === "text") {
      items.push({ type: "inputText", text: redact(item.text ?? "") });
      continue;
    }
    if (item.type !== "image") return { items: [], invalid: true };
    if (!includeImages) continue;
    const image = codexImageContentOf(item);
    if (image === undefined) return { items: [], invalid: true };
    items.push({ type: "inputImage", imageUrl: `data:${image.mimeType};base64,${image.data}` });
  }
  return { items, invalid: false };
}
