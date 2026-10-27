// 真实探针：Claude 适配器把 `ToolResult.images` 映射为 MCP image 内容块后，同一轮工具循环的
// 下一次 Anthropic /v1/messages 请求是否真的携带 tool_result 图片块（同轮看图设计 §10.5 Claude 行）。
//
// 凭据纪律（客户 2026-10-27：Claude 探针使用 Pi 的现有凭据，不另找 key）：
// - 配置只经现有加载路径：`loadEnvFileInto(env, resolve(".env"))` + `resolvePiProviderConfig({}, env)`；
// - 全程不打印/不落盘任何密钥、`.env` 内容、base64 或 data URL——输出只含键名/布尔/数量/MIME/字节数/
//   SHA-256 前 16 位/HTTP 状态/模型回答文本；
// - 只读配置，不写 `.env`；未改 policy/运行时核心；临时目录用后删除。
//
// 构造：本地 127.0.0.1 记录代理（转发到 ANS_PI_BASE_URL），Claude 适配器以 Pi 的 token 作为
// ANTHROPIC_API_KEY、Pi 的 base URL 的上游、Pi 的 model 启真实会话；工具结果附一张生成的
// 64×64 纯红 PNG。判定：第二次模型请求出现 `tool_result` 里的 base64 图片块，且字节/MIME/SHA
// 与生成图一致；模型回答文本与图像一致。
//
// 运行：node test/claude-adapter/tool-result-images-live.probe.ts

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { loadEnvFileInto } from "../../src/common/shared/env-file.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, SessionEvent, ToolDefinition } from "../../src/model/runtime.ts";

const sha16 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex").slice(0, 16);

// ——— PNG 生成（无外部依赖；纯红 64×64） ———
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buffer: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
};
const makePng = (width: number, height: number, rgb: readonly [number, number, number]): Buffer => {
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

// ——— 配置可用性（只经现有加载路径；不打印值） ———
const env: Record<string, string | undefined> = { ...process.env };
const loaded = await loadEnvFileInto(env, resolve(".env"));
console.log(`[probe] .env 载入键（仅键名）：${[...loaded.applied].sort().join(", ") || "(无)"}`);
const pi = resolvePiProviderConfig({}, env);
const token = env[pi.apiKeyEnvVar];
assert.ok(typeof token === "string" && token.length > 0, "Pi 凭据缺失");
const upstream = new URL(pi.baseUrl);
const upstreamIsAnthropicDefault = upstream.hostname === "api.anthropic.com";
console.log(`[probe] Pi 配置: tokenPresent=true keyEnv=${pi.apiKeyEnvVar} baseHost=${upstream.hostname} basePath=${upstream.pathname || "/"} anthropicDefault=${upstreamIsAnthropicDefault} model=${pi.modelId}`);

// ——— 本地记录代理（只记录结构化摘要，不记录请求/响应正文或头部值） ———
type CapturedImage = { mimeType: string; bytes: number; sha16: string };
type CapturedRequest = { index: number; path: string; roles: string[]; toolResultImages: CapturedImage[]; toolResultTexts: string[]; toolNames: string[]; model: string | undefined; upstreamStatus?: number };
const captures: CapturedRequest[] = [];
const proxyErrors: string[] = [];

const summarize = (body: unknown): Omit<CapturedRequest, "index" | "path"> => {
  const record = body !== null && typeof body === "object" ? body as Record<string, unknown> : {};
  const messages = Array.isArray(record["messages"]) ? record["messages"] as Array<Record<string, unknown>> : [];
  const roles: string[] = [];
  const toolResultImages: CapturedImage[] = [];
  const toolResultTexts: string[] = [];
  for (const message of messages) {
    if (typeof message["role"] === "string") roles.push(message["role"] as string);
    if (message["role"] !== "user" || !Array.isArray(message["content"])) continue;
    for (const block of message["content"] as Array<Record<string, unknown>>) {
      if (block["type"] !== "tool_result") continue;
      const content = block["content"];
      const items = typeof content === "string"
        ? [{ type: "text", text: content }]
        : Array.isArray(content) ? content as Array<Record<string, unknown>> : [];
      for (const item of items) {
        if (item["type"] === "text" && typeof item["text"] === "string") toolResultTexts.push(item["text"].slice(0, 120));
        if (item["type"] !== "image") continue;
        const source = item["source"] !== null && typeof item["source"] === "object" ? item["source"] as Record<string, unknown> : undefined;
        if (source && source["type"] === "base64" && typeof source["data"] === "string") {
          const bytes = Buffer.from(source["data"], "base64");
          toolResultImages.push({ mimeType: String(source["media_type"] ?? ""), bytes: bytes.length, sha16: sha16(bytes) });
        } else {
          toolResultImages.push({ mimeType: `unsupported:${String(source?.["type"])}`, bytes: -1, sha16: "" });
        }
      }
    }
  }
  const tools = Array.isArray(record["tools"]) ? record["tools"] as Array<Record<string, unknown>> : [];
  return { model: typeof record["model"] === "string" ? record["model"] as string : undefined, roles, toolResultImages, toolResultTexts, toolNames: tools.map((tool) => String(tool["name"] ?? "?")).slice(0, 32) };
};

const proxy = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")); } catch { parsed = undefined; }
    const isMessages = req.url?.includes("/v1/messages") === true && !req.url.includes("count_tokens");
    const captured: CapturedRequest | undefined = isMessages && parsed !== undefined
      ? { index: captures.length, path: req.url ?? "", ...summarize(parsed) }
      : undefined;
    if (captured) captures.push(captured);
    // 目标路径：上游 base 可能带 /v1 或路径前缀；与请求路径去重后再拼接。
    const basePath = upstream.pathname.replace(/\/+$/, "");
    const requestPath = req.url ?? "/";
    const forwardPath = basePath !== "" && basePath !== "/" && requestPath.startsWith(`${basePath}/`)
      ? requestPath
      : `${basePath}${requestPath}`;
    const headers: Record<string, string | string[] | undefined> = { ...req.headers };
    delete headers["host"];
    delete headers["connection"];
    headers["host"] = upstream.host;
    // Pi 的网关以 ANTHROPIC_AUTH_TOKEN 认证；CLI 以 x-api-key 携带同一 token。两种头都带上，
    // 由网关决定接受哪一个（不记录头值）。
    if (!headers["authorization"]) headers["authorization"] = `Bearer ${token}`;
    const send = upstream.protocol === "https:" ? httpsRequest : httpRequest;
    const upstreamReq = send({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: forwardPath,
      headers,
    }, (upstreamRes) => {
      if (captured) captured.upstreamStatus = upstreamRes.statusCode;
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstreamReq.on("error", (error) => {
      proxyErrors.push(error instanceof Error ? error.message : String(error));
      if (captured) captured.upstreamStatus = -1;
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy upstream error");
    });
    upstreamReq.end(raw);
  })().catch((error) => {
    proxyErrors.push(error instanceof Error ? error.message : String(error));
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("proxy error");
  });
});
await new Promise<void>((ready) => proxy.listen(0, "127.0.0.1", ready));
const address = proxy.address();
assert.ok(address !== null && typeof address === "object");
const proxyBase = `http://127.0.0.1:${address.port}`;
console.log(`[probe] 记录代理: ${proxyBase}`);

// ——— 真实模型会话 ———
const png = makePng(64, 64, [220, 40, 40]);
const pngBase64 = png.toString("base64");
console.log(`[probe] 探针图片: image/png ${png.length} bytes sha16=${sha16(png)}（提示词不含颜色）`);
const root = await mkdtemp(join(tmpdir(), "ans-claude-image-probe-"));
const role: ResolvedRole = {
  id: "claude-image-probe", kind: "project", cardText: "# Claude image probe",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
};
let called = 0;
const tool: ToolDefinition = {
  name: "view_image_probe",
  description: "查看探针图片。需要查看图片时先调用本工具；图片随工具结果返回。",
  inputSchema: { type: "object", properties: {} },
  displayInputRule: "none",
  handler: async () => {
    called++;
    return { ok: true, message: "图片已随本工具结果附上（同一轮可见）。若你的上下文未包含图片，请明确说明未看到，不要假装已看到。", images: [{ type: "image", data: pngBase64, mimeType: "image/png" }], imageDelivery: "tool-result" };
  },
};
const options: RuntimeProviderOptions = {
  runtime: "claude", projectRoot: root, skillRoot: root, tools: [tool],
  interactionGate: { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} },
  currentTurnId: () => undefined,
  apiKeyEnvVar: pi.apiKeyEnvVar, baseUrl: proxyBase, modelId: pi.modelId,
  constructTimeoutMs: 90_000, turnLastResortMs: 180_000,
};
const session = await createClaudeRuntimeAdapter(options, { env }).bindRole(role);
const events: SessionEvent[] = [];
const drain = (async () => {
  for await (const event of session.events()) {
    events.push(event);
    if (event.kind === "settled") break;
  }
})();
const promptText = "请先调用 mcp__ans__view_image_probe 工具查看图片，然后用一句中文回答：图片的主色调是什么？不要猜测；看不到就直说看不到。";
let promptError: unknown;
const startedAt = Date.now();
try { await session.prompt(promptText); } catch (error) { promptError = error; }
await drain;
const elapsedMs = Date.now() - startedAt;
await session.dispose();
proxy.close();
// CLI 子进程释放配置目录可能滞后：清理失败不掩盖探针结论（目录在系统 TEMP 下）。
await new Promise((wait) => setTimeout(wait, 1500));
try {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch (error) {
  console.log(`[probe] 临时目录清理延迟: ${error instanceof Error ? error.message : String(error)}`);
}

// ——— 报告（无密钥/base64） ———
console.log(`[probe] 会话耗时 ${elapsedMs}ms；工具调用次数=${called}；promptError=${promptError === undefined ? "none" : promptError instanceof Error ? promptError.message : String(promptError)}`);
for (const capture of captures) {
  console.log(`[probe] 请求#${capture.index} path=${capture.path} model=${capture.model ?? "(未捕获)"} roles=[${capture.roles.join(",")}] upstream=${capture.upstreamStatus ?? "?"} tools=${capture.toolNames.join("|")}`);
  if (capture.toolResultTexts.length) console.log(`[probe]   工具结果文本头: ${JSON.stringify(capture.toolResultTexts)}`);
  if (capture.toolResultImages.length) console.log(`[probe]   工具结果图片: ${JSON.stringify(capture.toolResultImages)}`);
}
const assistantText = events.filter((event) => event.kind === "message" && event.detail === undefined).map((event) => event.summary).filter((text) => text !== "").join("\n");
console.log(`[probe] 模型回答: ${JSON.stringify(assistantText.slice(0, 400))}`);
if (proxyErrors.length) console.log(`[probe] 代理错误: ${JSON.stringify(proxyErrors.slice(0, 5))}`);

const expectedSha = sha16(png);
const imageTurn = captures.find((capture) => capture.toolResultImages.length > 0);
const imageMatches = imageTurn?.toolResultImages.some((image) => image.mimeType === "image/png" && image.bytes === png.length && image.sha16 === expectedSha) === true;
const visualMatch = assistantText.includes("红");
console.log(`[probe] 判定: 第二次请求含 tool_result 图片=${imageTurn !== undefined}；字节/MIME/SHA 匹配=${imageMatches}；模型回答与图像一致(红)=${visualMatch}`);
assert.equal(promptError, undefined, "会话必须正常完成");
assert.ok(imageTurn !== undefined, "同轮工具结果的下一次模型请求必须包含 tool_result 图片块");
assert.ok(imageMatches, "tool_result 图片块的 MIME/字节/SHA 必须与生成图一致");
if (!visualMatch) console.log("[probe] 注意：模型回答未包含「红」——协议层已证实图片到达，视觉理解按模型能力解释（设计 R4）。");
console.log("[probe] PASS：Claude 适配器同轮工具结果附图在真实网关/模型上进入 Anthropic tool_result");
