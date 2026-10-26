// test/编排/request-gate-review.test.ts
// 2026-10-26 gate 复核请求（`request_gate_review`）编排接线（客户授权；设计
// `2026-10-26_design_proof-gate-reviews.md` §5.2/§12）：
//   · `openRoleSession` 提供能力 ⇒ 仅**统筹/Steward（trio convener）**并入 capabilities ⇒ 透传到
//     `createRuntimeAdapterFactory` ⇒ provider options ⇒ `request_gate_review` 工具注册；
//   · 未提供 ⇒ provider options 不带该能力，工具结构性不注册；
//   · 其他内置治理角色（liaison / 旧 su）与项目角色即便调用方误给也不注入（fail-closed）；
//   · 工具原样路由载荷并如实转达回执（`dispatched` 只表示已派 Proof；gate 复核 ≠ 验收通过 ≠ 客户批准）。
// 全程假 provider：不触网、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestGateReviewFn,
  RequestGateReviewInput,
  RoleSession,
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";

function rootDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-gate-review-"));
}

/** trio 项目：内置角色列表按需给出；`.ans/project.json` 标记 governanceModel=trio。 */
function trioProject(root: string, builtInRoles: string[]): ProjectConfig {
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles,
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:request-gate-review" },
    },
  };
}

/** single 项目（旧 su 夹具，同 request-acceptance 先例）。 */
function singleSuProject(root: string): ProjectConfig {
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: request_gate_review 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:request-gate-review" } },
  };
}

/** 项目角色项目（single 模型，只有 X）。 */
function projectRoleProject(root: string): ProjectConfig {
  const project = singleSuProject(root);
  return { ...project, builtInRoles: [] };
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
        } satisfies RoleSession;
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

function adapterDeps(project: ProjectConfig, provider: RuntimeProviderFactory, capture: (caps: AdapterCapabilities | undefined) => void) {
  return {
    createAdapter: captureFactory(
      createRuntimeAdapterFactory(project, "demo", { providerFactories: { demo: provider }, persistSession: false }),
      capture,
    ),
  };
}

test("request_gate_review：convener 注入 ⇒ provider options 带同名能力并注册工具；载荷原样路由、回执如实", async () => {
  const root = rootDir();
  const project = trioProject(root, ["convener"]);
  const seen: RequestGateReviewInput[] = [];
  let capturedCaps: AdapterCapabilities | undefined;
  let toolResult: { ok: boolean; message: string } | undefined;
  const requestGateReview: RequestGateReviewFn = async (input) => {
    seen.push(input);
    return { ok: true, code: "dispatched", message: "已派 Proof 做 gate 复核", flowId: input.flowId, gateId: input.gateId };
  };
  const provider = fakeProvider(async (options) => {
    const tool = options.tools.find((item) => item.name === "request_gate_review");
    assert.ok(tool, "convener 注入能力 ⇒ request_gate_review 注册（透传到 provider options.tools）");
    toolResult = await tool.handler({
      name: "request_gate_review",
      args: { flowId: "flow-a", gateId: "gate-vertical-slice", note: "依赖与证据已齐" },
      toolCallId: "call-gate-1",
      signal: new AbortController().signal,
    });
  });
  const handle = await openRoleSession(
    { roleId: "convener", project, runtime: "demo", persistSession: false, requestGateReview },
    adapterDeps(project, provider.factory, (caps) => capturedCaps = caps),
  );
  try {
    assert.equal(capturedCaps?.requestGateReview, requestGateReview, "convener 把能力并入 capabilities");
    assert.equal(provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
    await handle.send("请提交 gate 复核");
    assert.deepEqual(seen, [{ gateId: "gate-vertical-slice", flowId: "flow-a", note: "依赖与证据已齐" }], "载荷原样路由");
    assert.equal(toolResult?.ok, true);
    assert.match(toolResult?.message ?? "", /code=dispatched/);
    assert.match(toolResult?.message ?? "", /gate 复核 ≠ 验收通过 ≠ 客户批准/);
    assert.match(toolResult?.message ?? "", /只有 minor\/nit 不构成返工依据/);
  } finally {
    await handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("request_gate_review：未提供/其他内置治理角色/项目角色 ⇒ 不注入、工具不注册（fail-closed）", async () => {
  // 1) convener 未提供 ⇒ 能力缺席、工具不注册。
  {
    const root = rootDir();
    const project = trioProject(root, ["convener"]);
    const provider = fakeProvider();
    let caps: AdapterCapabilities | undefined;
    const handle = await openRoleSession(
      { roleId: "convener", project, runtime: "demo", persistSession: false },
      adapterDeps(project, provider.factory, (value) => caps = value),
    );
    try {
      assert.equal(caps?.requestGateReview, undefined, "未提供 ⇒ 能力缺席");
      assert.ok(
        !provider.calls[0]!.tools.some((item) => item.name === "request_gate_review"),
        "能力缺席 ⇒ request_gate_review 结构性不注册",
      );
    } finally {
      await handle.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // 2) 其他内置治理角色（liaison）即便误给也不注入。
  {
    const root = rootDir();
    const project = trioProject(root, ["liaison"]);
    const provider = fakeProvider();
    let caps: AdapterCapabilities | undefined;
    const capability: RequestGateReviewFn = async () => ({ ok: true, code: "dispatched", message: "不应被调用" });
    const handle = await openRoleSession(
      { roleId: "liaison", project, runtime: "demo", persistSession: false, requestGateReview: capability },
      adapterDeps(project, provider.factory, (value) => caps = value),
    );
    try {
      assert.equal(caps?.requestGateReview, undefined, "liaison 不注入（只给 convener）");
      assert.ok(!provider.calls[0]!.tools.some((item) => item.name === "request_gate_review"));
    } finally {
      await handle.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // 3) 旧 su（single 模型）即便误给也不注入（trioSpec 缺席）。
  {
    const root = rootDir();
    const project = singleSuProject(root);
    const provider = fakeProvider();
    let caps: AdapterCapabilities | undefined;
    const capability: RequestGateReviewFn = async () => ({ ok: true, code: "dispatched", message: "不应被调用" });
    const handle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", persistSession: false, requestGateReview: capability },
      adapterDeps(project, provider.factory, (value) => caps = value),
    );
    try {
      assert.equal(caps?.requestGateReview, undefined, "旧 su 不注入");
      assert.ok(!provider.calls[0]!.tools.some((item) => item.name === "request_gate_review"));
    } finally {
      await handle.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // 4) 项目角色即便误给也不注入。
  {
    const root = rootDir();
    const project = projectRoleProject(root);
    const provider = fakeProvider();
    let caps: AdapterCapabilities | undefined;
    const capability: RequestGateReviewFn = async () => ({ ok: true, code: "dispatched", message: "不应被调用" });
    const handle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", persistSession: false, requestGateReview: capability },
      adapterDeps(project, provider.factory, (value) => caps = value),
    );
    try {
      assert.equal(caps?.requestGateReview, undefined, "项目角色不注入");
      assert.ok(!provider.calls[0]!.tools.some((item) => item.name === "request_gate_review"));
    } finally {
      await handle.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
