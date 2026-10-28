// test/编排/request-requirement-change.test.ts
// 2026-10-26 需求变更申请（request_requirement_change）编排接线：
//   · 注入矩阵：**只给内置治理角色中的报告员 Rapporteur（governanceFunction === "proposal"）与
//     统筹 Convener**（2026-10-26 客户纠正/补充：需求变更审批卡这两个角色都可以发起，发起方不得自批；
//     审批人只有独立判断 agent/客户，主理只执行）；项目角色、其它内置治理角色（liaison/nominator/
//     verifier、single 模型的旧 su）即便调用方误给也不注入（工具结构性不注册，fail-closed）；
//   · 提供能力 ⇒ 透传到 `createRuntimeAdapterFactory` ⇒ Service/provider options ⇒
//     `request_requirement_change` 工具注册，且**同一引用**原样透传（编排纯透传，不做意图校验/去重/
//     派发/账本）；
//   · 未提供 ⇒ provider options 不带该能力，工具不注册；
//   · 工具调用原样路由载荷并如实转达应用回执（含「申请 ≠ 客户批准，也不代表意图已变更」纪律）。
// 全程假 provider：不触网、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestRequirementChangeFn,
  RequestRequirementChangeInput,
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import {
  createRuntimeAdapterFactory,
  openRoleSession,
  type AdapterCapabilities,
  type RuntimeAdapterFactory,
} from "../../src/pipeline/orchestration/run-role.ts";

const TOOL_NAME = "request_requirement_change";

// —— 夹具：trio 项目（内置治理角色经 builtInRoles 声明）——
function trioProject(roleIds: string[]): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-requirement-change-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: roleIds,
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:request-requirement-change" },
    },
  };
}

// —— 夹具：single 项目（项目角色 X + 旧 su）——
function singleProjectWithRole(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-request-requirement-change-single-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "governance-boundary.yaml"), "role: project\nentries: []\n");
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: request_requirement_change 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:request-requirement-change" },
    },
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
        const controller = new AbortController();
        const source: RuntimeContextSource = options.storage ? "fresh" : "in-memory";
        return {
          runtime: options.runtime,
          get contextSource() { return source; },
          get nativeSessionId() { return undefined; },
          async prompt() {
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

const hasRequirementChangeTool = (options: RuntimeProviderOptions): boolean =>
  options.tools.some((item) => item.name === TOOL_NAME);

/** 建一个会话并用假 provider 捕获 capabilities 与 provider options。 */
async function openWith(
  project: ProjectConfig,
  roleId: string,
  requestRequirementChange: RequestRequirementChangeFn | undefined,
  work?: (options: RuntimeProviderOptions) => Promise<void>,
) {
  const provider = fakeProvider(work);
  let caps: AdapterCapabilities | undefined;
  const handle = await openRoleSession(
    {
      roleId,
      project,
      runtime: "demo",
      persistSession: false,
      autoRepin: false,
      ...(requestRequirementChange !== undefined ? { requestRequirementChange } : {}),
    },
    {
      createAdapter: captureFactory(
        createRuntimeAdapterFactory(project, "demo", {
          providerFactories: { demo: provider.factory },
          persistSession: false,
        }),
        (value) => (caps = value),
      ),
    },
  );
  return { caps, provider, handle };
}

test("request_requirement_change：rapporteur 提供能力 ⇒ 同一引用透传、工具注册；载荷原样路由并如实转达回执", async () => {
  const project = trioProject(["rapporteur"]);
  const seen: RequestRequirementChangeInput[] = [];
  let toolResult: { ok: boolean; message: string } | undefined;
  const requestRequirementChange: RequestRequirementChangeFn = async (input) => {
    seen.push(input);
    return {
      ok: true,
      code: "dispatched",
      message: "已提交需求变更审批（策划角色 decision 卡；待意图变更）",
      flowId: "flow-a",
      intentId: "intent-a",
      requestId: "req-1",
    };
  };
  const opened = await openWith(project, "rapporteur", requestRequirementChange, async (options) => {
    const tool = options.tools.find((item) => item.name === TOOL_NAME);
    assert.ok(tool, "注入能力 ⇒ request_requirement_change 注册（透传到 provider options.tools）");
    toolResult = await tool.handler({
      name: TOOL_NAME,
      args: {
        intentId: "intent-a",
        changeKind: "authorization",
        summary: "需要新的联网授权访问外部证据源",
        rationale: "客户新要求需要外部目录证据；提案卡不能承载未确认的新授权。",
      },
      toolCallId: "call-1",
      signal: new AbortController().signal,
    });
  });
  try {
    assert.equal(
      opened.caps?.requestRequirementChange,
      requestRequirementChange,
      "openRoleSession 把同一引用并入 capabilities",
    );
    assert.equal(opened.provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
    await opened.handle.send("请提交需求变更申请");
    assert.deepEqual(
      seen,
      [{
        intentId: "intent-a",
        changeKind: "authorization",
        summary: "需要新的联网授权访问外部证据源",
        rationale: "客户新要求需要外部目录证据；提案卡不能承载未确认的新授权。",
      }],
      "载荷原样路由（编排不做任何校验/改写；可选项缺席不造键）",
    );
    assert.equal(toolResult?.ok, true);
    assert.match(toolResult?.message ?? "", /code=dispatched/);
    assert.match(toolResult?.message ?? "", /requestId=req-1/);
    assert.match(toolResult?.message ?? "", /申请\s*≠\s*批准/);
    assert.match(toolResult?.message ?? "", /产品只在批准后执行意图变更，不审批/);
    assert.match(toolResult?.message ?? "", /发起方不得自批/);
    assert.match(toolResult?.message ?? "", /意图已变更|意图变更/);
  } finally {
    await opened.handle.dispose();
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_requirement_change：convener（运营）同样注入同一引用并注册工具（2026-10-26 客户补充）", async () => {
  const project = trioProject(["convener"]);
  const seen: RequestRequirementChangeInput[] = [];
  const requestRequirementChange: RequestRequirementChangeFn = async (input) => {
    seen.push(input);
    return { ok: true, code: "dispatched", message: "已提交（运营发起）", flowId: "flow-a", intentId: "intent-a", requestId: "req-2" };
  };
  const opened = await openWith(project, "convener", requestRequirementChange, async (options) => {
    const tool = options.tools.find((item) => item.name === TOOL_NAME);
    assert.ok(tool, "运营提供能力 ⇒ request_requirement_change 注册");
    const result = await tool.handler({
      name: TOOL_NAME,
      args: {
        intentId: "intent-a",
        changeKind: "scope",
        summary: "客户要求扩展范围（运营转达）",
        rationale: "策划角色与运营都可发起需求变更审批卡。",
      },
      toolCallId: "call-convener-1",
      signal: new AbortController().signal,
    });
    assert.equal((result as { ok?: boolean }).ok, true, "回执原样转达");
  });
  try {
    assert.equal(
      opened.caps?.requestRequirementChange,
      requestRequirementChange,
      "openRoleSession 对运营把同一引用并入 capabilities",
    );
    await opened.handle.send("请提交需求变更申请");
    assert.deepEqual(
      seen,
      [{
        intentId: "intent-a",
        changeKind: "scope",
        summary: "客户要求扩展范围（运营转达）",
        rationale: "策划角色与运营都可发起需求变更审批卡。",
      }],
      "运营路径同样纯透传（不做校验/改写）",
    );
  } finally {
    await opened.handle.dispose();
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_requirement_change：rapporteur 未提供 ⇒ provider options 缺席、工具不注册", async () => {
  const project = trioProject(["rapporteur"]);
  try {
    const opened = await openWith(project, "rapporteur", undefined);
    try {
      assert.equal(opened.caps?.requestRequirementChange, undefined, "未提供 ⇒ 能力缺席");
      assert.ok(
        !hasRequirementChangeTool(opened.provider.calls[0]!),
        "能力缺席 ⇒ request_requirement_change 结构性不注册",
      );
    } finally {
      await opened.handle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("request_requirement_change：项目角色与其它内置治理角色即便误给也不注入（只给报告员/运营）", async () => {
  const capability: RequestRequirementChangeFn = async () => ({
    ok: true,
    code: "dispatched",
    message: "不应被调用",
  });

  // 项目角色 X（single 模型）
  const single = singleProjectWithRole();
  try {
    const projectRole = await openWith(single, "X", capability);
    try {
      assert.equal(projectRole.caps?.requestRequirementChange, undefined, "项目角色不注入");
      assert.ok(!hasRequirementChangeTool(projectRole.provider.calls[0]!), "项目角色 ⇒ 工具不注册");
    } finally {
      await projectRole.handle.dispose();
    }

    // 旧 su（single 内置治理角色，但不是报告员/统筹）
    const su = await openWith(single, "su", capability);
    try {
      assert.equal(su.caps?.requestRequirementChange, undefined, "su 不是报告员/运营，不注入");
      assert.ok(!hasRequirementChangeTool(su.provider.calls[0]!), "su ⇒ 工具不注册");
    } finally {
      await su.handle.dispose();
    }
  } finally {
    fs.rmSync(single.projectRoot, { recursive: true, force: true });
  }

  // 其它 trio 内置治理角色：chief/product/nominator/verifier。
  // D 批：只有报告员与运营可发起，其余内置角色不注入。
  for (const roleId of ["chief", "product", "nominator", "verifier"] as const) {
    const project = trioProject([roleId]);
    try {
      const opened = await openWith(project, roleId, capability);
      try {
        assert.equal(
          opened.caps?.requestRequirementChange,
          undefined,
          `${roleId}（非报告员/运营）不注入`,
        );
        assert.ok(
          !hasRequirementChangeTool(opened.provider.calls[0]!),
          `${roleId} ⇒ 工具不注册`,
        );
      } finally {
        await opened.handle.dispose();
      }
    } finally {
      fs.rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
});

test("request_requirement_change：不改变既有能力矩阵；已撤除能力不入镜", async () => {
  const project = trioProject(["rapporteur"]);
  try {
    const capability: RequestRequirementChangeFn = async () => ({ ok: true, code: "dispatched", message: "ok" });
    const opened = await openWith(project, "rapporteur", capability);
    try {
      assert.equal(opened.caps?.requestRequirementChange, capability, "需求变更申请能力原引用注入");
      const caps = (opened.caps ?? {}) as Record<string, unknown>;
      for (const removed of ["requestClarification", "handOffIntent", "requestAcceptance", "reportArtifact", "requestGateReview", "requestBoundaryChange", "proposeRecovery"]) {
        assert.equal(caps[removed], undefined, `D 批已撤除 ${removed}，不得注入`);
      }
      assert.equal(caps.dispatchTask, undefined, "rapporteur 仍没有 dispatchTask");
    } finally {
      await opened.handle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
