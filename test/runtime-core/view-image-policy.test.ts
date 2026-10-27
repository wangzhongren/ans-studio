// test/runtime-core/view-image-policy.test.ts —— 2026-10-27 同轮看图（Service 接线）：
// ① 四个运行时的 view_image 注册门不变（注入 viewImage 才注册；未注入 ⇒ 工具不存在）；
// ② Gate 3（2026-10-27）：Pi/Claude/Codex 已翻 `tool-result`——Service 注入内联受理回执、不触达桌面能力，
//    工具结果带 images/imageDelivery，message 走共享 i18n key；Claude 有效单图上限收紧为 5 MB；
// ③ demo 仍 `next-turn`：Service 原引用透传桌面能力、工具实际调用它并透传 turnId，
//    ToolResult 不带 images（与 2026-10-26 行为零变化）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter, VIEW_IMAGE_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import type {
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  ToolResult,
  ViewImageFn,
  ViewImageInput,
} from "../../src/model/runtime.ts";
import { DEFAULT_LOCALE, translate } from "../../src/common/shared/i18n/index.ts";
import type { MessageKey } from "../../src/common/shared/i18n/keys.ts";
import { allow, role } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-view-image-policy-"));
const RUNTIMES = ["demo", "pi", "claude", "codex"] as const;

function captureFactory(sink: RuntimeProviderOptions[]): RuntimeProviderFactory {
  return (options) => {
    sink.push(options);
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole(): Promise<never> { throw new Error("fixture：本文件只取证 providerFor 的注入面"); },
    };
  };
}

test("Service：四个运行时的 view_image 注册门不变——注入 viewImage 才注册；未注入 ⇒ 工具不存在（fail-closed）", async () => {
  const root = await temp();
  try {
    for (const runtime of RUNTIMES) {
      const withCapability: RuntimeProviderOptions[] = [];
      await createRuntimeAdapter({
        runtime, gate: allow, projectRoot: root, skillRoot: root,
        viewImage: async () => ({ ok: true }),
        providerFactories: { [runtime]: captureFactory(withCapability) },
      }).composeContext(role());
      assert.ok(
        withCapability[0]?.tools.some((tool) => tool.name === VIEW_IMAGE_TOOL_NAME),
        `${runtime}：注入 viewImage ⇒ 注册 view_image`,
      );

      const withoutCapability: RuntimeProviderOptions[] = [];
      await createRuntimeAdapter({
        runtime, gate: allow, projectRoot: root, skillRoot: root,
        providerFactories: { [runtime]: captureFactory(withoutCapability) },
      }).composeContext(role());
      assert.equal(
        withoutCapability[0]?.tools.some((tool) => tool.name === VIEW_IMAGE_TOOL_NAME),
        false,
        `${runtime}：未注入 viewImage ⇒ 不注册 view_image（能力缺席 = 最强 fail-closed）`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service + demo（仍 next-turn）：工具调用注入能力并透传 turnId；ToolResult 无 images、交付为 next-turn（零行为变化）", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "img"));
    await writeFile(path.join(root, "img", "a.png"), Buffer.from([1, 2, 3]));
    const calls: ViewImageInput[] = [];
    const results: ToolResult[] = [];
    const viewImage: ViewImageFn = async (input) => { calls.push(input); return { ok: true }; };
    const factory: RuntimeProviderFactory = (options) => {
      const tools = options.tools.map((tool) => tool.name === VIEW_IMAGE_TOOL_NAME
        ? {
            ...tool,
            async handler(call: Parameters<typeof tool.handler>[0]) {
              const result = await tool.handler(call);
              results.push(result);
              return result;
            },
          }
        : tool);
      return createDemoRuntimeAdapter({ ...options, tools }, [{ name: VIEW_IMAGE_TOOL_NAME, args: { path: "img/a.png" } }]);
    };
    const session = await createRuntimeAdapter({
      runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, persistSession: false, viewImage,
      providerFactories: { demo: factory },
    }).bindRole(role());
    await session.prompt("查看图片");
    try {
      assert.equal(calls.length, 1, "next-turn：工具必须调用注入的桌面能力");
      assert.equal(typeof calls[0]?.turnId, "string", "Service 的 currentTurnId 必须透传到 ViewImageInput.turnId");
      assert.equal(calls[0]?.path, "img/a.png");
      assert.equal(calls[0]?.image?.mimeType, "image/png");
      assert.equal(results.length, 1);
      assert.equal(results[0]?.ok, true);
      assert.equal(results[0]?.images, undefined, "demo 仍 next-turn，不得带模型可见图片");
      assert.equal(results[0]?.imageDelivery, "next-turn");
      assert.match(results[0]?.message ?? "", /已读取并排队；下一轮以图片附件提供/);
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service + pi（Gate 3 已翻 tool-result）：工具结果同轮附图、不触达桌面能力；message 走共享 i18n key", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "img"));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await writeFile(path.join(root, "img", "shot.png"), bytes);
    let desktopCalls = 0;
    const desktopViewImage: ViewImageFn = async () => { desktopCalls += 1; return { ok: true } };
    const results: ToolResult[] = [];
    const factory: RuntimeProviderFactory = (options) => {
      const tools = options.tools.map((tool) => tool.name === VIEW_IMAGE_TOOL_NAME
        ? {
            ...tool,
            async handler(call: Parameters<typeof tool.handler>[0]) {
              const result = await tool.handler(call);
              results.push(result);
              return result;
            },
          }
        : tool);
      return createDemoRuntimeAdapter({ ...options, tools }, [{ name: VIEW_IMAGE_TOOL_NAME, args: { path: "img/shot.png" } }]);
    };
    const session = await createRuntimeAdapter({
      runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, persistSession: false, viewImage: desktopViewImage,
      providerFactories: { pi: factory },
    }).bindRole(role());
    await session.prompt("查看图片");
    try {
      assert.equal(desktopCalls, 0, "tool-result 使用内联受理回执，不触达桌面能力");
      assert.equal(results.length, 1);
      const result = results[0]!;
      assert.equal(result.ok, true);
      assert.deepEqual(result.images, [{ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }], "同轮结果必须携带模型可见图片");
      assert.equal(result.imageDelivery, "tool-result");
      assert.equal(
        result.message,
        translate(DEFAULT_LOCALE, "main.viewImage.sameTurn" as MessageKey, { path: "img/shot.png" }),
        "同轮成功文案必须来自共享 i18n key main.viewImage.sameTurn",
      );
      assert.doesNotMatch(result.message, /已读取并排队/, "同轮模式不得复用下一轮排队文案");
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service + claude（Gate 3 已翻 tool-result；5 MB 上限）：同轮附图、不触达桌面能力、超限失败无图", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "img"));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(path.join(root, "img", "shot.png"), bytes);
    await writeFile(path.join(root, "img", "big.png"), Buffer.alloc(5 * 1024 * 1024 + 1));
    let desktopCalls = 0;
    const desktopViewImage: ViewImageFn = async () => { desktopCalls += 1; return { ok: true } };
    const results: ToolResult[] = [];
    const factory: RuntimeProviderFactory = (options) => {
      const tools = options.tools.map((tool) => tool.name === VIEW_IMAGE_TOOL_NAME
        ? {
            ...tool,
            async handler(call: Parameters<typeof tool.handler>[0]) {
              const result = await tool.handler(call);
              results.push(result);
              return result;
            },
          }
        : tool);
      return createDemoRuntimeAdapter({ ...options, tools }, [
        { name: VIEW_IMAGE_TOOL_NAME, args: { path: "img/shot.png" } },
        { name: VIEW_IMAGE_TOOL_NAME, args: { path: "img/big.png" } },
      ]);
    };
    const session = await createRuntimeAdapter({
      runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, persistSession: false, viewImage: desktopViewImage,
      providerFactories: { claude: factory },
    }).bindRole(role());
    await session.prompt("查看图片");
    try {
      assert.equal(desktopCalls, 0, "tool-result 使用内联受理回执，不触达桌面能力");
      assert.equal(results.length, 2);
      const [okResult, bigResult] = results;
      assert.equal(okResult?.ok, true);
      assert.deepEqual(okResult?.images, [{ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }], "同轮结果必须携带模型可见图片");
      assert.equal(okResult?.imageDelivery, "tool-result");
      assert.equal(
        okResult?.message,
        translate(DEFAULT_LOCALE, "main.viewImage.sameTurn" as MessageKey, { path: "img/shot.png" }),
        "同轮成功文案必须来自共享 i18n key main.viewImage.sameTurn",
      );
      assert.equal(bigResult?.ok, false, "超过 Claude 5 MB 有效上限必须失败");
      assert.match(bigResult?.message ?? "", /超过上限 5242880 字节/, "失败文案须给出 Claude 有效上限（5 MB）");
      assert.equal(bigResult?.images, undefined, "超限失败不得携带图片");
      assert.doesNotMatch(bigResult?.message ?? "", /已读取并排队/, "超限失败不得谎报已提供");
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service + codex（Gate 3 已翻 tool-result，Chat/Pi 证据）：工具结果同轮附图、不触达桌面能力；message 走共享 i18n key", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "img"));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await writeFile(path.join(root, "img", "shot.png"), bytes);
    let desktopCalls = 0;
    const desktopViewImage: ViewImageFn = async () => { desktopCalls += 1; return { ok: true } };
    const results: ToolResult[] = [];
    const factory: RuntimeProviderFactory = (options) => {
      const tools = options.tools.map((tool) => tool.name === VIEW_IMAGE_TOOL_NAME
        ? {
            ...tool,
            async handler(call: Parameters<typeof tool.handler>[0]) {
              const result = await tool.handler(call);
              results.push(result);
              return result;
            },
          }
        : tool);
      return createDemoRuntimeAdapter({ ...options, tools }, [{ name: VIEW_IMAGE_TOOL_NAME, args: { path: "img/shot.png" } }]);
    };
    const session = await createRuntimeAdapter({
      runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, persistSession: false, viewImage: desktopViewImage,
      providerFactories: { codex: factory },
    }).bindRole(role());
    await session.prompt("查看图片");
    try {
      assert.equal(desktopCalls, 0, "tool-result 使用内联受理回执，不触达桌面能力");
      assert.equal(results.length, 1);
      const result = results[0]!;
      assert.equal(result.ok, true);
      assert.deepEqual(result.images, [{ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }], "同轮结果必须携带模型可见图片");
      assert.equal(result.imageDelivery, "tool-result");
      assert.equal(
        result.message,
        translate(DEFAULT_LOCALE, "main.viewImage.sameTurn" as MessageKey, { path: "img/shot.png" }),
        "同轮成功文案必须来自共享 i18n key main.viewImage.sameTurn",
      );
      assert.doesNotMatch(result.message, /已读取并排队/, "同轮模式不得复用下一轮排队文案");
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
