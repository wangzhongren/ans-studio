// test/编排/request-acceptance.test.ts
// 2026-10-25 独立复核请求（request_acceptance）编排接线：
//   · `openRoleSession` 提供能力 ⇒ 透传到 `createRuntimeAdapterFactory` ⇒ provider options ⇒ 工具注册；
//   · 未提供 ⇒ provider options 不带该能力，`request_acceptance` 结构性不注册；
//   · 项目角色会话即便调用方误给也不注入（只给内置治理角色，fail-closed）。
// 全程假 provider：不触网、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestAcceptanceFn,
  RequestAcceptanceInput,
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";

function fixture(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-acceptance-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: request_acceptance 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:request-acceptance" } },
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
  work?: (options: RuntimeProviderOptions) => Promise<void>,
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
            if (work !== undefined) await work(options);
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

test("request_acceptance：提供能力 ⇒ provider options 带同名能力并注册工具；调用原样路由载荷并如实转达回执", async () => {
  const project = fixture();
  const seen: RequestAcceptanceInput[] = [];
  let capturedCaps: AdapterCapabilities | undefined;
  let toolResult: { ok: boolean; message: string } | undefined;
  const requestAcceptance: RequestAcceptanceFn = async (input) => {
    seen.push(input);
    return { ok: true, code: "dispatched", message: "已派独立复核", flowId: input.flowId };
  };
  const provider = fakeProvider(async (options) => {
    const tool = options.tools.find((item) => item.name === "request_acceptance");
    assert.ok(tool, "注入能力 ⇒ request_acceptance 注册（透传到 provider options.tools）");
    toolResult = await tool.handler({
      name: "request_acceptance",
      args: { flowId: "flow-a", note: "交付与证据已就绪" },
      toolCallId: "call-1",
      signal: new AbortController().signal,
    });
  });
  const handle = await openRoleSession(
    { roleId: "su", project, runtime: "demo", persistSession: false, requestAcceptance },
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
    assert.equal(capturedCaps?.requestAcceptance, requestAcceptance, "openRoleSession 把能力并入 capabilities");
    assert.equal(provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
    await handle.send("请提交独立复核");
    assert.deepEqual(seen, [{ flowId: "flow-a", note: "交付与证据已就绪" }], "载荷原样路由");
    assert.equal(toolResult?.ok, true);
    assert.match(toolResult?.message ?? "", /code=dispatched/);
    assert.match(toolResult?.message ?? "", /请求复核 ≠ 客户批准/);
  } finally {
    await handle.dispose();
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_acceptance：未提供 ⇒ provider options 缺席、工具不注册；项目角色即便误给也不注入", async () => {
  const project = fixture();
  try {
    const absent = fakeProvider();
    let absentCaps: AdapterCapabilities | undefined;
    const bareHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", persistSession: false },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: absent.factory },
            persistSession: false,
          }),
          (caps) => absentCaps = caps,
        ),
      },
    );
    try {
      assert.equal(absentCaps?.requestAcceptance, undefined, "未提供 ⇒ 能力缺席");
      assert.ok(
        !absent.calls[0]!.tools.some((item) => item.name === "request_acceptance"),
        "能力缺席 ⇒ request_acceptance 结构性不注册",
      );
    } finally {
      await bareHandle.dispose();
    }

    const projectRole = fakeProvider();
    let projectCaps: AdapterCapabilities | undefined;
    const capability: RequestAcceptanceFn = async () => ({ ok: true, code: "dispatched", message: "不应被调用" });
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", persistSession: false, requestAcceptance: capability },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(project, "demo", {
            providerFactories: { demo: projectRole.factory },
            persistSession: false,
          }),
          (caps) => projectCaps = caps,
        ),
      },
    );
    try {
      assert.equal(projectCaps?.requestAcceptance, undefined, "项目角色不注入（只给内置治理角色）");
      assert.ok(
        !projectRole.calls[0]!.tools.some((item) => item.name === "request_acceptance"),
        "项目角色 ⇒ 工具不注册",
      );
    } finally {
      await xHandle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
