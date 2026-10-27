// 工具结果附图映射单测（2026-10-27 同轮看图设计 §6.4 / §10.2 Pi 部分）。
// 归属：Pi适配器角色测试目录。不静态 import Pi 运行时；SDK 级回环用例在用例内部动态 import，
// 未安装 Pi 包时跳过（不做真实模型调用——faux provider 离线完成）。
//
// 覆盖：
//   1. `ToolResult.images` → Pi `content` 追加 `ImageContent`（text + image；data/mimeType 原引用，不重编码）；
//   2. details 只记 `{count,bytes,mimeTypes}` 与交付方式，**不含 base64**；
//   3. `ok:false` / 无 images / 空 images ⇒ 只有 text；失败时即使携带 images 也绝不附图；
//   4. 非法图片载荷（缺 data/非白名单 MIME/非数组）⇒ 一张都不交付、isError + 诚实注记（fail-closed）；
//   5. 诊断流水同样不含 base64（sentinel 断言）；
//   6. SDK 级（faux provider，离线）：工具结果消息连同图片块进入**同一次 prompt 的下一次模型请求**。

import { test } from "node:test";
import assert from "node:assert/strict";

import { toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import type { PromptImage } from "../../src/model/runtime.ts";
import type { DiagnosticLog } from "../../src/common/pi-adapter/lifecycle.ts";

/** 一张**有效**的 1×1 PNG（SDK 图像管线可接受的对照件）。 */
const VALID_PNG: PromptImage = {
  type: "image",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  mimeType: "image/png",
};

/** 可识别的 base64 sentinel：一旦进入 details/诊断即为泄露（断言不得出现）。 */
const SENTINEL_BASE64 = Buffer.from("ANS-IMAGE-SENTINEL-DO-NOT-LEAK").toString("base64");

type PiContent = Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;

async function executeWith(
  result: Record<string, unknown>,
  context?: Parameters<typeof toPiTool>[1],
): Promise<{ content: PiContent; details: unknown; isError: boolean }> {
  const tool = toPiTool({ name: "view_image", handler: async () => result as never });
  return await tool.execute("call-1", { path: "assets/pic.png" }, undefined, () => {}, {} as never) as {
    content: PiContent; details: unknown; isError: boolean;
  };
}

// —————————————————————— 1. 成功附图：text + image，原引用透传 ——————————————————————

test("ok:true + images ⇒ content 含 text + image；data/mimeType 原引用、不重编码", async () => {
  const message = "view_image: assets/pic.png 已读取并随本工具结果附上（同一轮可见）；若你的上下文未包含图片，请明确说明未看到，不要假装已看到。";
  const result = await executeWith({ ok: true, message, images: [VALID_PNG], imageDelivery: "tool-result" });

  assert.equal(result.isError, false);
  assert.equal(result.content.length, 2);
  assert.deepEqual(result.content[0], { type: "text", text: message });
  const image = result.content[1] as { type: string; data: string; mimeType: string };
  assert.equal(image.type, "image");
  assert.equal(image.data, VALID_PNG.data, "图片数据必须原样进入 Pi ImageContent（不重编码）");
  assert.equal(image.mimeType, "image/png");

  const details = result.details as Record<string, unknown>;
  assert.equal(details.imageDelivery, "tool-result");
  const facts = details.images as { count: number; bytes: number; mimeTypes: string[] };
  assert.equal(facts.count, 1);
  assert.equal(facts.bytes, Buffer.from(VALID_PNG.data, "base64").length, "bytes 应为原始图片字节数");
  assert.deepEqual(facts.mimeTypes, ["image/png"]);
  assert.equal(JSON.stringify(details).includes(VALID_PNG.data), false, "details 不得包含 base64");
});

test("多张图片：content 顺序保持，details 汇总 count/bytes/mimeTypes（去重）", async () => {
  const jpeg: PromptImage = { type: "image", data: SENTINEL_BASE64, mimeType: "image/jpeg" };
  const result = await executeWith({ ok: true, message: "两张图已附上", images: [VALID_PNG, jpeg], imageDelivery: "tool-result" });

  assert.equal(result.content.length, 3);
  assert.equal(result.content[1]!.type, "image");
  assert.equal((result.content[1] as { data: string }).data, VALID_PNG.data);
  assert.equal((result.content[2] as { data: string }).data, jpeg.data);
  const facts = (result.details as Record<string, unknown>).images as { count: number; bytes: number; mimeTypes: string[] };
  assert.equal(facts.count, 2);
  assert.equal(facts.bytes, Buffer.from(VALID_PNG.data, "base64").length + Buffer.from(jpeg.data, "base64").length);
  assert.deepEqual(facts.mimeTypes, ["image/png", "image/jpeg"]);
  assert.equal(JSON.stringify(result.details).includes(SENTINEL_BASE64), false);
});

// —————————————————————— 2. 无图成功 / 失败：只有 text ——————————————————————

test("ok:true 且无 images（next-turn 回退）⇒ 只有 text，details 记交付方式", async () => {
  const result = await executeWith({ ok: true, message: "已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。", imageDelivery: "next-turn" });

  assert.equal(result.isError, false);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]!.type, "text");
  const details = result.details as Record<string, unknown>;
  assert.equal(details.imageDelivery, "next-turn");
  assert.equal(details.images, undefined);
});

test("ok:true 且 images 为空数组 ⇒ 只有 text", async () => {
  const result = await executeWith({ ok: true, message: "无图", images: [] });
  assert.equal(result.content.length, 1);
  assert.equal(result.isError, false);
  assert.equal((result.details as Record<string, unknown>).images, undefined);
});

test("ok:false 即使携带 images 也绝不附图；只有 text，isError=true", async () => {
  const result = await executeWith({ ok: false, message: "view_image：图片未能排队——本轮不要假装已看到。", images: [VALID_PNG], imageDelivery: "tool-result" });

  assert.equal(result.isError, true);
  assert.equal(result.content.length, 1);
  assert.deepEqual(result.content[0], { type: "text", text: "view_image：图片未能排队——本轮不要假装已看到。" });
  const details = result.details as Record<string, unknown>;
  assert.equal(details.images, undefined, "失败结果不得记录图片元数据");
  assert.equal(details.imageDelivery, undefined, "失败结果不得声称交付方式");
  assert.equal(details.errorCode, "TOOL_FAILED");
});

// —————————————————————— 3. 非法载荷：整批不交付 + fail-closed ——————————————————————

for (const [label, images] of [
  ["缺 data", [{ type: "image", mimeType: "image/png" }]],
  ["空 data", [{ type: "image", data: "", mimeType: "image/png" }]],
  ["非白名单 MIME", [{ type: "image", data: SENTINEL_BASE64, mimeType: "image/svg+xml" }]],
  ["非对象条目", ["not-an-image"]],
  ["images 非数组", { data: SENTINEL_BASE64 }],
] as const) {
  test(`非法图片载荷（${label}）⇒ 无图、isError、诚实注记，base64 不进 details`, async () => {
    const result = await executeWith({ ok: true, message: "图片已随本工具结果附上（同一轮可见）。", images, imageDelivery: "tool-result" });

    assert.equal(result.isError, true, "非法载荷必须 fail-closed");
    assert.equal(result.content.length, 1, "绝不做部分交付");
    const text = (result.content[0] as { text: string }).text;
    assert.ok(text.startsWith("图片已随本工具结果附上"), "原 result.message 保留在文本块");
    assert.match(text, /未向模型提供任何图片/, "必须给出「图片未提供」的诚实注记");
    assert.match(text, /不要假装已看到/);

    const details = result.details as Record<string, unknown>;
    assert.equal(details.images, undefined);
    assert.equal(details.imageDelivery, undefined);
    assert.equal(details.errorCode, "IMAGE_MAPPING_FAILED");
    assert.equal(JSON.stringify(details).includes(SENTINEL_BASE64), false, "base64 不得进入 details");
  });
}

// —————————————————————— 4. 诊断流水无 base64（sentinel） ——————————————————————

test("诊断记录只含元数据；图片 base64 不进入 diagnostics", async () => {
  const records: unknown[] = [];
  const diagnostics: DiagnosticLog = {
    record: (event, fields) => records.push({ event, fields }),
    error: (event, _error, fields) => records.push({ event, fields }),
  };
  const tool = toPiTool(
    { name: "view_image", handler: async () => ({ ok: true, message: "已附上", images: [VALID_PNG], imageDelivery: "tool-result" }) },
    { currentTurnId: () => "turn-img", diagnostics },
  );
  const result = await tool.execute("call-img", { path: "assets/pic.png" }, undefined, () => {}, {} as never);

  assert.equal(result.isError, false);
  const text = JSON.stringify(records);
  assert.match(text, /tool\.result/, "工具结果诊断事件应存在");
  assert.equal(text.includes(VALID_PNG.data), false, "诊断不得包含图片 base64");
  assert.equal(text.includes("data:image"), false, "诊断不得包含 data URL");
});

// —————————————————————— 5. SDK 级（faux，离线）：工具结果图进入下一次模型请求 ——————————————————————

test("SDK 级（faux provider，离线）：工具结果消息连同图片块进入同一次 prompt 的下一次模型请求", async (t) => {
  let pi: typeof import("@earendil-works/pi-coding-agent");
  try {
    pi = await import("@earendil-works/pi-coding-agent");
  } catch {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { ANS_SETTINGS_OVERRIDES } = await import("../../src/common/pi-adapter/settings.ts");

  const dir = mkdtempSync(join(tmpdir(), "ans-pi-tool-img-"));
  try {
    let secondRequest: { messages: Array<{ role: string; toolName?: string; content: Array<{ type: string; data?: string; mimeType?: string; text?: string }> }> } | undefined;
    const faux = fauxProvider();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("view_image", { path: "assets/pic.png" })]),
      (context) => {
        secondRequest = JSON.parse(JSON.stringify(context)) as typeof secondRequest;
        return fauxAssistantMessage("已看图");
      },
    ]);
    const runtime = await pi.ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id);
    assert.ok(model != null);

    const settingsManager = pi.SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
    const resourceLoader = new pi.DefaultResourceLoader({
      cwd: dir, agentDir: dir, extensionFactories: [], noSkills: true, noPromptTemplates: true,
      noThemes: true, noContextFiles: true, settingsManager,
    });
    await resourceLoader.reload();
    const tool = toPiTool({
      name: "view_image",
      handler: async () => ({
        ok: true,
        message: "view_image: assets/pic.png 已读取并随本工具结果附上（同一轮可见）。",
        images: [VALID_PNG],
        imageDelivery: "tool-result",
      }),
    });
    const { session } = await pi.createAgentSession({
      cwd: dir, noTools: "builtin", customTools: [tool], resourceLoader,
      model: model as never, modelRuntime: runtime, sessionManager: pi.SessionManager.inMemory(dir), settingsManager,
    });
    try {
      await session.prompt("看一下这张图");
    } finally {
      session.dispose();
    }

    assert.ok(secondRequest, "第二次模型请求应到达 faux 响应工厂");
    const toolResult = secondRequest!.messages.find((message) => message.role === "toolResult" && message.toolName === "view_image");
    assert.ok(toolResult, "工具结果消息必须进入下一次模型请求（同轮可见）");
    const image = toolResult!.content.find((block) => block.type === "image");
    assert.ok(image, "工具结果消息必须包含图片块");
    assert.equal(image!.data, VALID_PNG.data, "图片数据原样进入 Pi messages");
    assert.equal(image!.mimeType, "image/png");
    assert.ok(toolResult!.content.some((block) => block.type === "text" && (block.text ?? "").includes("同一轮可见")), "文本块与图片块并存");
    t.diagnostic("工具结果附图进入同一次 prompt 的下一次模型请求（Pi messages）");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
