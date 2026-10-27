// test/编排/request-boundary-change.test.ts
// 2026-10-26 边界变更请求（request_boundary_change）编排接线：
//   · 注入矩阵：**只给内置治理角色中的统筹/Steward（trio convener）**——项目角色、其他内置治理角色
//     （liaison / su）与项目角色即便调用方误给也不注入（工具结构性不注册，fail-closed）；
//   · 提供能力 ⇒ 透传到 `createRuntimeAdapterFactory` ⇒ provider options ⇒ `request_boundary_change`
//     工具注册，且**同一引用**原样透传（编排纯透传，不做校验/门禁/派发）；
//   · 未提供 ⇒ provider options 不带该能力，工具不注册；
//   · 工具调用原样路由载荷并如实转达应用回执（含「请求变更 ≠ 客户批准」纪律）。
// 全程假 provider：不触网、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestBoundaryChangeFn,
  RequestBoundaryChangeInput,
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";

// —— 夹具：trio 项目（内置治理角色经 builtInRoles 声明）——
function trioProject(roleId: string): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-boundary-change-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [roleId],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:request-boundary-change" } },
  };
}

// —— 夹具：single 项目（项目角色 X + 旧 su）——
function singleProjectWithRole(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-boundary-change-single-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: request_boundary_change 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:request-boundary-change" } },
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

const hasBoundaryChangeTool = (options: RuntimeProviderOptions): boolean =>
  options.tools.some((item) => item.name === "request_boundary_change");

test("request_boundary_change：convener 提供能力 ⇒ 同一引用透传、工具注册；载荷原样路由并如实转达回执", async () => {
  const project = trioProject("convener");
  const seen: RequestBoundaryChangeInput[] = [];
  let capturedCaps: AdapterCapabilities | undefined;
  let toolResult: { ok: boolean; message: string } | undefined;
  const requestBoundaryChange: RequestBoundaryChangeFn = async (input) => {
    seen.push(input);
    return { ok: true, code: "dispatched", message: "已派人事修改边界", roleId: input.roleId, ticketId: "ticket-1" };
  };
  const provider = fakeProvider(async (options) => {
    const tool = options.tools.find((item) => item.name === "request_boundary_change");
    assert.ok(tool, "注入能力 ⇒ request_boundary_change 注册（透传到 provider options.tools）");
    toolResult = await tool.handler({
      name: "request_boundary_change",
      args: { roleId: "X", addPaths: ["src/new.ts"], rationale: "写集不足以完成任务", flowId: "flow-a" },
      toolCallId: "call-1",
      signal: new AbortController().signal,
    });
  });
  const handle = await openRoleSession(
    { roleId: "convener", project, runtime: "demo", persistSession: false, autoRepin: false, requestBoundaryChange },
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
    assert.equal(capturedCaps?.requestBoundaryChange, requestBoundaryChange, "openRoleSession 把同一引用并入 capabilities");
    assert.equal(provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
    await handle.send("请为 X 提交边界变更请求");
    assert.deepEqual(
      seen,
      [{ roleId: "X", addPaths: ["src/new.ts"], rationale: "写集不足以完成任务", flowId: "flow-a" }],
      "载荷原样路由（编排不做任何校验/改写）",
    );
    assert.equal(toolResult?.ok, true);
    assert.match(toolResult?.message ?? "", /code=dispatched/);
    assert.match(toolResult?.message ?? "", /ticketId=ticket-1/);
    assert.match(toolResult?.message ?? "", /请求变更 ≠ 客户批准/);
  } finally {
    await handle.dispose();
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_boundary_change：convener 未提供 ⇒ provider options 缺席、工具不注册", async () => {
  const project = trioProject("convener");
  try {
    const absent = fakeProvider();
    let absentCaps: AdapterCapabilities | undefined;
    const handle = await openRoleSession(
      { roleId: "convener", project, runtime: "demo", persistSession: false, autoRepin: false },
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
      assert.equal(absentCaps?.requestBoundaryChange, undefined, "未提供 ⇒ 能力缺席");
      assert.ok(
        !hasBoundaryChangeTool(absent.calls[0]!),
        "能力缺席 ⇒ request_boundary_change 结构性不注册",
      );
    } finally {
      await handle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_boundary_change：项目角色与其他内置治理角色即便误给也不注入（只给 convener）", async () => {
  const capability: RequestBoundaryChangeFn = async () => ({ ok: true, code: "dispatched", message: "不应被调用" });

  // 项目角色 X（single 模型）
  const single = singleProjectWithRole();
  try {
    const projectRole = fakeProvider();
    let projectCaps: AdapterCapabilities | undefined;
    const xHandle = await openRoleSession(
      { roleId: "X", project: single, runtime: "demo", persistSession: false, autoRepin: false, requestBoundaryChange: capability },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(single, "demo", {
            providerFactories: { demo: projectRole.factory },
            persistSession: false,
          }),
          (caps) => projectCaps = caps,
        ),
      },
    );
    try {
      assert.equal(projectCaps?.requestBoundaryChange, undefined, "项目角色不注入");
      assert.ok(!hasBoundaryChangeTool(projectRole.calls[0]!), "项目角色 ⇒ 工具不注册");
    } finally {
      await xHandle.dispose();
    }

    // 旧 su（single 内置治理角色，但不是 convener）
    const suProvider = fakeProvider();
    let suCaps: AdapterCapabilities | undefined;
    const suHandle = await openRoleSession(
      { roleId: "su", project: single, runtime: "demo", persistSession: false, autoRepin: false, requestBoundaryChange: capability },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(single, "demo", {
            providerFactories: { demo: suProvider.factory },
            persistSession: false,
          }),
          (caps) => suCaps = caps,
        ),
      },
    );
    try {
      assert.equal(suCaps?.requestBoundaryChange, undefined, "su 不是 convener，不注入（默认只有 convener）");
      assert.ok(!hasBoundaryChangeTool(suProvider.calls[0]!), "su ⇒ 工具不注册");
    } finally {
      await suHandle.dispose();
    }
  } finally {
    fs.rmSync(single.projectRoot, { recursive: true, force: true });
  }

  // 其他 trio 内置治理角色（liaison）
  const liaisonProject = trioProject("liaison");
  try {
    const liaisonProvider = fakeProvider();
    let liaisonCaps: AdapterCapabilities | undefined;
    const liaisonHandle = await openRoleSession(
      { roleId: "liaison", project: liaisonProject, runtime: "demo", persistSession: false, autoRepin: false, requestBoundaryChange: capability },
      {
        createAdapter: captureFactory(
          createRuntimeAdapterFactory(liaisonProject, "demo", {
            providerFactories: { demo: liaisonProvider.factory },
            persistSession: false,
          }),
          (caps) => liaisonCaps = caps,
        ),
      },
    );
    try {
      assert.equal(liaisonCaps?.requestBoundaryChange, undefined, "liaison（产品）不注入（默认只有 convener）");
      assert.ok(!hasBoundaryChangeTool(liaisonProvider.calls[0]!), "liaison ⇒ 工具不注册");
    } finally {
      await liaisonHandle.dispose();
    }
  } finally {
    fs.rmSync(liaisonProject.projectRoot, { recursive: true, force: true });
  }
});
