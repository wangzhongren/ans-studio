// Codex 适配器同轮工具结果附图（2026-10-27 设计 §5.3/§6.4/§10.2）契约测试。
// 覆盖：text+image 映射形状、MIME 白名单、失败/无图/非法载荷 fail-closed、
// 文本 redact 而图片字节/ data URL 不过 redact、事件/投影事实无 base64 审计。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import type { PromptImage, RuntimeToolEventFactsV1, SessionEvent, ToolDefinition, ToolResult } from "../../src/model/runtime.ts";
import { role, harness, options, collect, start } from "./fixtures.ts";

// 图片只做字节形状/映射，不做解码；用合法的 1×1 PNG 与 base64 形态的短哨兵。
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function toolWith(result: ToolResult): ToolDefinition[] {
  return [{ name: "view_image", description: "fixture", inputSchema: { type: "object" }, async handler() { return result; } }];
}

async function callOnce(tools: ToolDefinition[], extra: Parameters<typeof options>[2] = {}) {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools, ...extra })).bindRole(role);
  const turn = await start(session, engines.engine);
  const receipt = await engines.engine.call("view_image", { path: "shot.png" });
  return { engines, session, turn, receipt };
}

async function finish(context: Awaited<ReturnType<typeof callOnce>>) {
  context.engines.engine.finish();
  await context.turn.completion;
  await context.session.dispose();
}

test("successful tool results map text and images to inputText/inputImage data URLs", async () => {
  const context = await callOnce(toolWith({
    ok: true,
    message: "图片已随本工具结果附上（同一轮可见）",
    images: [
      { type: "image", mimeType: "image/png", data: PNG },
      { type: "image", mimeType: "image/jpeg", data: "AAAAAQ==" },
    ],
  }));
  assert.deepEqual(context.receipt, { success: true, contentItems: [
    { type: "inputText", text: "图片已随本工具结果附上（同一轮可见）" },
    { type: "inputImage", imageUrl: `data:image/png;base64,${PNG}` },
    { type: "inputImage", imageUrl: "data:image/jpeg;base64,AAAAAQ==" },
  ] });
  await finish(context);
});

test("MIME whitelist maps png/jpeg/gif/webp and rejects nothing else", async () => {
  for (const mimeType of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    const context = await callOnce(toolWith({ ok: true, message: "attached", images: [{ type: "image", mimeType, data: "AAAA" }] }));
    assert.deepEqual(context.receipt, { success: true, contentItems: [
      { type: "inputText", text: "attached" },
      { type: "inputImage", imageUrl: `data:${mimeType};base64,AAAA` },
    ] }, mimeType);
    await finish(context);
  }
});

test("text passes through redact while image bytes and data URLs never do", async () => {
  // 凭据值是合法 base64 字符，故意作为图片数据片段出现：文本出现必须被替换，图片数据必须逐字保留。
  const secret = "QUJDREVG";
  const data = `${secret}QUJD`;
  const context = await callOnce(toolWith({
    ok: true,
    message: `已附上 ${secret}`,
    images: [{ type: "image", mimeType: "image/png", data }],
  }), { env: { CODEX_API_KEY: secret, PATH: process.env.PATH } });
  assert.deepEqual(context.receipt, { success: true, contentItems: [
    { type: "inputText", text: "已附上 [REDACTED]" },
    { type: "inputImage", imageUrl: `data:image/png;base64,${data}` },
  ] });
  await finish(context);
});

test("failed results never attach images even when images are present", async () => {
  const context = await callOnce(toolWith({
    ok: false,
    message: "capability refused",
    images: [{ type: "image", mimeType: "image/png", data: PNG }],
  }));
  assert.deepEqual(context.receipt, { success: false, contentItems: [{ type: "inputText", text: "capability refused" }] });
  await finish(context);
});

test("no images or empty images keep the exact text-only shape", async () => {
  for (const images of [undefined, []]) {
    const context = await callOnce(toolWith({ ok: true, message: "no image attached", ...(images !== undefined ? { images } : {}) }));
    assert.deepEqual(context.receipt, { success: true, contentItems: [{ type: "inputText", text: "no image attached" }] });
    await finish(context);
  }
});

test("invalid image payloads fail closed without any image content item", async () => {
  const cases: Array<{ name: string; images: unknown }> = [
    { name: "non-array", images: "not-an-array" },
    { name: "null-entry", images: [null] },
    { name: "missing-mime", images: [{ type: "image", data: PNG }] },
    { name: "non-whitelisted-mime", images: [{ type: "image", mimeType: "image/svg+xml", data: PNG }] },
    { name: "empty-data", images: [{ type: "image", mimeType: "image/png", data: "" }] },
    { name: "non-string-data", images: [{ type: "image", mimeType: "image/png", data: 42 }] },
    { name: "non-base64-data", images: [{ type: "image", mimeType: "image/png", data: "%%% not base64 %%%" }] },
  ];
  for (const entry of cases) {
    const context = await callOnce(toolWith({ ok: true, message: "claimed attached", images: entry.images as unknown as PromptImage[] }));
    const receipt = context.receipt as { success: boolean; contentItems: Array<{ type: string; text?: string; imageUrl?: string }> };
    assert.equal(receipt.success, false, entry.name);
    assert.equal(receipt.contentItems.length, 1, entry.name);
    assert.equal(receipt.contentItems[0]?.type, "inputText", entry.name);
    assert.match(receipt.contentItems[0]?.text ?? "", /未向模型提供任何图片/, entry.name);
    assert.equal(receipt.contentItems.some(item => item.type === "inputImage"), false, entry.name);
    await finish(context);
  }
});

test("image bytes and data URLs never enter session events or display projection facts", async () => {
  const sentinel = "iVBORw0KGgoAAAANSUhEUg"; // 合法 base64 形态的字节哨兵
  const sources: RuntimeToolEventFactsV1[] = [];
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    toolDisplayMode: "required-v1",
    registerToolDisplayProfile() {},
    projectToolEvent(source) {
      assert.ok("phase" in source);
      sources.push(source);
      return {
        runtime: source.runtime, roleId: source.roleId, turnId: source.turnId,
        kind: source.phase === "start" ? "tool_call" : "accepted",
        summary: "projected",
        detail: { toolName: source.toolName, toolCallId: source.toolCallId, turnId: source.turnId, phase: source.phase },
      };
    },
    tools: toolWith({ ok: true, message: "attached", images: [{ type: "image", mimeType: "image/png", data: sentinel }] }),
  })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  const receipt = await engines.engine.call("view_image", { path: "shot.png" });
  // 模型面确实拿到了图片字节（证明哨兵在链路上真实存在，审计断言不是空转）。
  assert.ok(JSON.stringify(receipt).includes(sentinel));
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const eventJson = JSON.stringify(events.entries satisfies SessionEvent[]);
  const sourceJson = JSON.stringify(sources);
  for (const text of [eventJson, sourceJson]) {
    assert.equal(text.includes(sentinel), false);
    assert.equal(text.includes("data:image"), false);
    assert.equal(text.includes("base64"), false);
  }
});
