// test/编排/view-image.test.ts
// 2026-10-26 图片查看（view_image，两轮附件设计）编排接线：
//   · `openRoleSession` 提供 `viewImage` ⇒ 透传到 `createRuntimeAdapterFactory` ⇒ Service/provider
//     options ⇒ `buildGovernedTools` 注册 `view_image`；未提供 ⇒ 能力缺席、工具不注册；
//   · **通用只读能力**：项目角色与内置治理角色（su）都可用（不按角色收窄）；
//   · `viewImage` 不改变其他能力的注入矩阵（与 `requestAcceptance` 互不隐含/互不影响）。
// 全程假 provider：不触网、不跑真实模型；工具读取的是一张真实写入临时项目的 1×1 PNG。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
  ToolResult,
  ViewImageFn,
  ViewImageInput,
} from "../../src/model/runtime.ts";
import {
  createRuntimeAdapterFactory,
  openRoleSession,
  type AdapterCapabilities,
  type RuntimeAdapterFactory,
} from "../../src/pipeline/orchestration/run-role.ts";

/** 1×1 PNG（透明）；只用于让工具层通过扩展名/真实文件校验。 */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixture(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-view-image-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: view_image 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:view-image" } },
  };
}

function queue() {
  const pending: SessionEvent[] = [];
  let waiter: (() => void) | undefined;
  let closed = false;
  return {
    push(event: SessionEvent) { pending.push(event); waiter?.(); waiter = undefined; },
    close() { closed = true; waiter?.(); waiter = undefined; },
    async *events() {
      while (true) {
        if (pending.length) { yield pending.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    },
  };
}

function fakeProvider(
  work?: (options: RuntimeProviderOptions, signal: AbortSignal) => Promise<void>,
): { factory: RuntimeProviderFactory; calls: RuntimeProviderOptions[] } {
  const calls: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = (options) => {
    calls.push(options);
    assert.equal(options.toolDisplayMode, "required-v1");
    assert.equal(typeof options.registerToolDisplayProfile, "function");
    options.registerToolDisplayProfile!({ credentials: [] });
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        const events = queue();
        let controller = new AbortController();
        const source: RuntimeContextSource = options.storage ? "fresh" : "in-memory";
        return {
          runtime: options.runtime,
          get contextSource() { return source; },
          get nativeSessionId() { return undefined; },
          async prompt() {
            controller = new AbortController();
            if (work !== undefined) await work(options, controller.signal);
            events.push({ kind: "settled", summary: "engine settled", turnId: options.currentTurnId() });
          },
          events: () => events.events(),
          async abort() { controller.abort(); },
          async dispose() { controller.abort(); events.close(); },
        };
      },
    } satisfies RuntimeAdapter;
  };
  return { factory, calls };
}

function captureFactory(
  inner: RuntimeAdapterFactory,
  capture: (capabilities: AdapterCapabilities | undefined) => void,
): RuntimeAdapterFactory {
  return (gate, capabilities) => {
    capture(capabilities);
    return inner(gate, capabilities);
  };
}

const toolNames = (options: RuntimeProviderOptions): string[] => options.tools.map((tool) => tool.name);

test("view_image：项目角色提供能力 ⇒ 同引用透传并注册工具；handler 读取项目内图片，path/PromptImage 原样交给注入能力", async () => {
  const project = fixture();
  try {
    const png = Buffer.from(PNG_1X1_BASE64, "base64");
    fs.mkdirSync(path.join(project.projectRoot, "docs", "images"), { recursive: true });
    fs.writeFileSync(path.join(project.projectRoot, "docs", "images", "shot.png"), png);

    const seen: ViewImageInput[] = [];
    const viewImage: ViewImageFn = async (input) => {
      seen.push(input);
      return { ok: true, message: "附件编号 1" };
    };
    let capturedCaps: AdapterCapabilities | undefined;
    let toolResult: ToolResult | undefined;
    const provider = fakeProvider(async (options, signal) => {
      const tool = options.tools.find((item) => item.name === "view_image");
      assert.ok(tool, "注入能力 ⇒ view_image 注册（透传到 provider options.tools）");
      toolResult = await tool.handler({
        name: "view_image",
        args: { path: "docs/images/shot.png" },
        toolCallId: "call-view-image-1",
        signal,
      });
    });
    const handle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", persistSession: false, viewImage },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: provider.factory },
            persistSession: false,
          }),
          (caps) => capturedCaps = caps,
        ),
      },
    );
    try {
      assert.equal(capturedCaps?.viewImage, viewImage, "openRoleSession 把能力并入 capabilities（同引用）");
      assert.equal(provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
      assert.ok(toolNames(provider.calls[0]!).includes("view_image"), "view_image 已注册");

      await handle.send("看截图");
      assert.equal(seen.length, 1, "工具 handler 调用注入能力恰一次");
      assert.equal(seen[0]?.path, "docs/images/shot.png", "项目相对路径原样回显");
      assert.deepEqual(
        seen[0]?.image,
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
        "已转好的 PromptImage（base64 + MIME）原样交给能力",
      );
      assert.equal(toolResult?.ok, true, "能力受理 ⇒ 工具回执 ok");
      assert.match(toolResult?.message ?? "", /已读取并排队/, "回执如实说明「已读取并排队」");
      assert.match(toolResult?.message ?? "", /下一轮/, "回执写明图片在下一轮以附件提供");
      assert.match(toolResult?.message ?? "", /附件编号 1/, "能力 message 原样转达");
    } finally {
      await handle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("view_image：内置治理角色（su）提供能力 ⇒ 同样注册（通用只读能力）；未提供 ⇒ 能力缺席、工具不注册", async () => {
  const project = fixture();
  try {
    const viewImage: ViewImageFn = async () => ({ ok: true });

    // su + 能力 ⇒ 注册。
    const suProvider = fakeProvider();
    let suCaps: AdapterCapabilities | undefined;
    const suHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", persistSession: false, autoRepin: false, viewImage },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: suProvider.factory },
            persistSession: false,
          }),
          (caps) => suCaps = caps,
        ),
      },
    );
    try {
      assert.equal(suCaps?.viewImage, viewImage, "su 会话同样拿到 viewImage（通用只读能力，不按角色收窄）");
      assert.ok(toolNames(suProvider.calls[0]!).includes("view_image"), "su 会话注册 view_image");
    } finally {
      await suHandle.dispose();
    }

    // su 未给能力 ⇒ 不注册。
    const bareProvider = fakeProvider();
    let bareCaps: AdapterCapabilities | undefined;
    const bareHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", persistSession: false, autoRepin: false },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: bareProvider.factory },
            persistSession: false,
          }),
          (caps) => bareCaps = caps,
        ),
      },
    );
    try {
      assert.equal(bareCaps?.viewImage, undefined, "未提供 ⇒ 能力缺席");
      assert.ok(
        !toolNames(bareProvider.calls[0]!).includes("view_image"),
        "能力缺席 ⇒ view_image 结构性不注册（fail-closed）",
      );
    } finally {
      await bareHandle.dispose();
    }

    // 项目角色未给能力 ⇒ 同样不注册。
    const xProvider = fakeProvider();
    let xCaps: AdapterCapabilities | undefined;
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", persistSession: false },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: xProvider.factory },
            persistSession: false,
          }),
          (caps) => xCaps = caps,
        ),
      },
    );
    try {
      assert.equal(xCaps?.viewImage, undefined, "项目角色未提供 ⇒ 能力缺席");
      assert.ok(!toolNames(xProvider.calls[0]!).includes("view_image"), "项目角色未提供 ⇒ 工具不注册");
    } finally {
      await xHandle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("view_image 不改变其他能力注入矩阵：不隐含已撤除工具；项目角色同样可用", async () => {
  const project = fixture();
  try {
    const viewImage: ViewImageFn = async () => ({ ok: true });

    // su：只给 viewImage ⇒ 只注册 view_image，不隐含任何已撤除的 flow/gate/验收工具。
    const viewOnlyProvider = fakeProvider();
    let viewOnlyCaps: AdapterCapabilities | undefined;
    const viewOnlyHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", persistSession: false, autoRepin: false, viewImage },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: viewOnlyProvider.factory },
            persistSession: false,
          }),
          (caps) => viewOnlyCaps = caps,
        ),
      },
    );
    try {
      const names = toolNames(viewOnlyProvider.calls[0]!);
      assert.ok(names.includes("view_image"), "viewImage ⇒ view_image 注册");
      for (const removed of ["request_acceptance", "request_gate_review", "report_artifact_ready", "flow_get"]) {
        assert.ok(!names.includes(removed), `viewImage 不隐含已撤除工具 ${removed}`);
      }
      assert.equal(viewOnlyCaps?.viewImage, viewImage, "viewImage 同引用");
    } finally {
      await viewOnlyHandle.dispose();
    }

    // 项目角色：viewImage 可用（通用只读能力），且不获得任何已撤除工具。
    const xProvider = fakeProvider();
    let xCaps: AdapterCapabilities | undefined;
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", persistSession: false, viewImage },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: xProvider.factory },
            persistSession: false,
          }),
          (caps) => xCaps = caps,
        ),
      },
    );
    try {
      const names = toolNames(xProvider.calls[0]!);
      assert.ok(names.includes("view_image"), "项目角色可用 view_image");
      assert.ok(!names.includes("request_acceptance"), "项目角色不获得已撤除工具");
      assert.equal(xCaps?.viewImage, viewImage, "项目角色 viewImage 同引用");
    } finally {
      await xHandle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
