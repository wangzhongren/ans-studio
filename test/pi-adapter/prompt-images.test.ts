// K-2 图片发送（契约形状 + 适配器透传）单测。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 运行时**（仅本文件顶部一处 `import type`——编译期擦除，
// 运行不依赖 Pi 安装；SDK 级用例在用例内部动态 import + 未安装则跳过）。
//
// 覆盖：
//   1. 契约形状：`PromptImage` 与 pi-ai `ImageContent` **结构兼容**（编译期）+ 键恰为 {type,data,mimeType}；
//   2. `makeRolePrompt`（桩件）：**无图逐字旧行为**（不传 options、事件文案不变）；带图**原样透传**
//      （同一数组引用）+ 事件可见「附 N 张图片」；空数组=无图；失败 → 事件外推 + abort + 抛出；
//   3. fake 适配器签名同步：带图不破、文本路径事件逐字不变；
//   4. SDK 级（faux provider，离线）：`session.prompt(text,{images})` 被接受且**图片进入 LLM 转录**
//      （响应工厂捕获上下文断言含我们的 data/mimeType）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { makeRolePrompt, type PromptCapableSession } from "../../src/common/pi-adapter/real-adapter.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { PromptImage, PromptOptions } from "../../src/provider/pi/session.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type { StageLogger } from "../../src/common/pi-adapter/logger.ts";
import { makeGate, makeRole } from "./fixtures.ts";
// 仅类型导入（`verbatimModuleSyntax` 下编译期擦除）——用于**编译期**断言两形状结构兼容。
import type { ImageContent } from "@earendil-works/pi-ai";

const PNG: PromptImage = { type: "image", data: "aGVsbG8tYmFzZTY0", mimeType: "image/png" };

/** 一张**有效**的 1×1 PNG（走通 SDK 图像管线的对照件；上面的 PNG 是无意义 base64，用于省略路径）。 */
const VALID_PNG: PromptImage = {
  type: "image",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  mimeType: "image/png",
};

/** 静默日志器（桩件）。 */
function silentLogger(): StageLogger {
  return { stage: () => {}, trace: () => {}, traceEnabled: false };
}

/** 记录调用的桩件会话。 */
function stubSession(behavior?: (text: string, options?: { images: PromptImage[] }) => Promise<void>): {
  session: PromptCapableSession;
  calls: Array<{ text: string; options?: { images: PromptImage[] }; argCount: number }>;
  aborts: number;
} {
  const box = {
    calls: [] as Array<{ text: string; options?: { images: PromptImage[] }; argCount: number }>,
    aborts: 0,
    session: undefined as unknown as PromptCapableSession,
  };
  const stub: PromptCapableSession = {
    async prompt(text: string, options?: { images: PromptImage[] }): Promise<void> {
      box.calls.push({ text, options, argCount: arguments.length });
      if (behavior !== undefined) await behavior(text, options);
    },
    async abort(): Promise<void> {
      box.aborts += 1;
    },
  };
  box.session = stub;
  return box;
}

// —————————————————————— 1. 契约形状 ——————————————————————

test("契约：PromptImage 与 pi-ai ImageContent 结构兼容（编译期）且键恰为 {type,data,mimeType}", () => {
  // 编译期兼容：若形状漂移，本行 typecheck 即失败。
  const compat: ImageContent = PNG;
  assert.equal(compat.type, "image");
  assert.deepEqual(Object.keys(PNG).sort(), ["data", "mimeType", "type"]);
});

// —————————————————————— 2. makeRolePrompt（桩件） ——————————————————————

test("makeRolePrompt：无图 → 逐字旧行为（不传 options；事件文案不变）", async () => {
  const stub = stubSession();
  const events: string[] = [];
  const prompt = makeRolePrompt({
    session: stub.session,
    promptMs: 1000,
    gate: createInteractionGate(),
    emit: (e) => events.push(`${e.kind}:${e.summary}`),
    log: silentLogger(),
  });

  await prompt("你好");

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0]!.text, "你好");
  assert.equal(stub.calls[0]!.argCount, 1, "无图时**不得**传第二参（逐字旧行为）");
  assert.deepEqual(events, ["message:用户指令：你好"]);
});

test("makeRolePrompt：带图 → 原样透传（同一数组引用）+ 事件可见「附 N 张图片」", async () => {
  const stub = stubSession();
  const events: string[] = [];
  const prompt = makeRolePrompt({
    session: stub.session,
    promptMs: 1000,
    gate: createInteractionGate(),
    emit: (e) => events.push(`${e.kind}:${e.summary}`),
    log: silentLogger(),
  });

  const images: PromptImage[] = [PNG, { type: "image", data: "d29ybGQ=", mimeType: "image/jpeg" }];
  await prompt("看图", { images });

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0]!.text, "看图");
  assert.equal(stub.calls[0]!.options?.images, images, "透传必须是原数组（不复制、不丢字段）");
  assert.deepEqual(events, ["message:用户指令：看图（附 2 张图片）"]);
});

test("makeRolePrompt：空数组 = 无图（不传 options、文案不变）", async () => {
  const stub = stubSession();
  const events: string[] = [];
  const prompt = makeRolePrompt({
    session: stub.session,
    promptMs: 1000,
    gate: createInteractionGate(),
    emit: (e) => events.push(e.summary),
    log: silentLogger(),
  });

  await prompt("x", { images: [] });

  assert.equal(stub.calls[0]!.argCount, 1);
  assert.deepEqual(events, ["用户指令：x"]);
});

test("makeRolePrompt：失败 → 事件「pi 适配器中止」+ abort 底层 + 原错误上抛（既有语义不变）", async () => {
  const boom = new Error("网关 400: image unsupported");
  const stub = stubSession(async () => {
    throw boom;
  });
  const events: string[] = [];
  const prompt = makeRolePrompt({
    session: stub.session,
    promptMs: 1000,
    gate: createInteractionGate(),
    emit: (e) => events.push(e.summary),
    log: silentLogger(),
  });

  await assert.rejects(() => prompt("看图", { images: [PNG] }), (err: unknown) => err === boom);
  assert.equal(stub.aborts, 1, "失败后应 abort 底层");
  assert.ok(
    events.some((s) => s.startsWith("pi 适配器中止：") && s.includes("image unsupported")),
    `事件流应如实外推错误：${events.join(" | ")}`,
  );
});

// —————————————————————— 3. fake 适配器签名同步 ——————————————————————

test("fake 适配器：带图不破（事件可见张数）；文本路径事件逐字不变", async () => {
  // script: [] —— 假适配器默认脚本会发 write_file 工具调用事件；本条只断言 prompt 事件，故清空脚本。
  const adapter = createFakeRuntimeAdapter({ gate: makeGate({ skill: [], project: [] }), script: [] });
  const session = await adapter.bindRole(makeRole());
  const seen: string[] = [];
  const consuming = (async () => {
    for await (const event of session.events()) {
      if (event.kind === "message") seen.push(event.summary);
      if (seen.includes("用户指令：带图（附 1 张图片）")) break;
    }
  })();

  await session.prompt("纯文本");
  await session.prompt("带图", { images: [PNG] } as PromptOptions);
  await consuming;

  assert.equal(seen[0], "用户指令：纯文本", "无图时事件逐字不变");
  assert.ok(seen.includes("用户指令：带图（附 1 张图片）"), `带图应可见张数：${seen.join(" | ")}`);
  await session.dispose();
});

// —————————————————————— 4. SDK 级（faux，离线）：图片进入 LLM 转录 ——————————————————————

test("SDK 级（faux provider，离线）：有效图进入 LLM 转录；无效图被**显式省略**（注记可见，非静默）", async (t) => {
  let pi: typeof import("@earendil-works/pi-coding-agent");
  try {
    pi = await import("@earendil-works/pi-coding-agent");
  } catch {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { fauxProvider, fauxAssistantMessage, InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { ANS_SETTINGS_OVERRIDES } = await import("../../src/common/pi-adapter/settings.ts");

  const dir = mkdtempSync(join(tmpdir(), "ans-pi-img-"));
  try {
    const transcripts: string[] = [];
    const faux = fauxProvider();
    faux.setResponses([
      (context) => {
        transcripts.push(JSON.stringify(context));
        return fauxAssistantMessage("看到了");
      },
      (context) => {
        transcripts.push(JSON.stringify(context));
        return fauxAssistantMessage("收到（省略注记）");
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
      cwd: dir,
      agentDir: dir,
      extensionFactories: [],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      settingsManager,
    });
    await resourceLoader.reload();
    const { session } = await pi.createAgentSession({
      cwd: dir,
      noTools: "builtin",
      customTools: [],
      resourceLoader,
      model: model as never,
      modelRuntime: runtime,
      sessionManager: pi.SessionManager.inMemory(dir),
      settingsManager,
    });
    try {
      // 有效图（1×1 PNG）：图片块应**逐字**进入转录（我们的 data/mimeType 原样出现）。
      await session.prompt("看这张图", { images: [VALID_PNG] });
      // 无效数据：SDK 的图像管线处理不了 → **显式省略注记**写进模型可见的文本（非静默丢）。
      await session.prompt("再看这张", { images: [PNG] });
    } finally {
      session.dispose();
    }

    assert.equal(transcripts.length, 2, "两轮都应到达响应工厂");
    const first = transcripts[0]!;
    assert.ok(first.includes('"type":"image"'), "有效图应进入转录为图片块");
    assert.ok(first.includes(VALID_PNG.data), "转录应含我们的 base64 数据（原样）");
    assert.ok(first.includes(VALID_PNG.mimeType), "转录应含 mimeType（原样）");

    const second = transcripts[1]!;
    assert.equal(second.includes(PNG.data), false, "无效图的原始数据不应进转录");
    assert.match(second, /Image omitted/, "无效图应带**显式省略注记**（image-process.js:47/:55 的文案）");
    t.diagnostic("有效图逐字进转录；无效图显式省略（注记可见）");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
