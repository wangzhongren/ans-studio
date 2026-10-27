// test/编排/report-artifact.test.ts
// 2026-10-27 验收标准产物汇报（`report_artifact_ready`；客户新设计：质检只向应用汇报、应用校验后
// 决定是否收口，质检不得自批 flow 状态）的**编排接线**测试：
//   · `openRoleSession` 提供能力 ⇒ 仅**质检/Proof（trio verifier）**并入 capabilities ⇒ 透传到
//     `createRuntimeAdapterFactory` ⇒ provider options ⇒ `report_artifact_ready` 工具注册；
//   · 能力以**同一引用**透传（编排不包装、不预调用、不伪造接受或决定），载荷原样路由、回执原样转达；
//   · 未提供 ⇒ 能力缺席、工具结构性不注册；其他内置治理角色（liaison / convener / 旧 su）与项目角色
//     即便调用方误给也不注入（fail-closed）；
//   · 编排侧不写 flow、不写治理账本、不替质检做收口决定（打开/开轮/settle 全程零写入）。
// 全程假 provider：不触网、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  ReportArtifactFn,
  ReportArtifactInput,
  RoleSession,
  RuntimeAdapter,
  RuntimeContextSource,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { REPORT_ARTIFACT_READY_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { openRoleSession, createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";

function rootDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ans-report-artifact-"));
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
      acceptance: { accepted: true, source: "test:report-artifact" },
    },
  };
}

/** single 项目（旧 su 夹具，同 request-gate-review 先例）。 */
function singleSuProject(root: string): ProjectConfig {
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: report_artifact_ready 测试\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:report-artifact" } },
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

/** 消费到本轮 settle（触发编排的 settle 后处理路径——用于证明其不写 flow/账本）。 */
async function consumeSettled(handle: Awaited<ReturnType<typeof openRoleSession>>): Promise<void> {
  for await (const event of handle.events()) {
    if (event.kind === "settled") return;
  }
}

test("report_artifact_ready：verifier 注入 ⇒ 原引用透传并注册工具；载荷原样路由、回执如实，编排不预调用/不写 flow/账本", async () => {
  const root = rootDir();
  const project = trioProject(root, ["verifier"]);
  // 真实设计里质检先用 write_file 写好验收标准，再汇报；这里预置产物以模拟「汇报时文件已存在」。
  // 预置发生在开会话之前 ⇒ 物证基线只记哈希，settle 不产生 artifact.observed 账本写入。
  const criteriaRel = "docs/acceptance/flow-a-criteria-v1.md";
  fs.mkdirSync(path.dirname(path.join(root, criteriaRel)), { recursive: true });
  fs.writeFileSync(path.join(root, criteriaRel), "# 验收标准 v1\n");

  const seen: ReportArtifactInput[] = [];
  let capturedCaps: AdapterCapabilities | undefined;
  let toolResult: { ok: boolean; message: string } | undefined;
  let callsAtProviderStart: number | undefined;
  const reportArtifact: ReportArtifactFn = async (input) => {
    seen.push(input);
    return { ok: true, accepted: true, message: "应用已校验 flowId/stepId/path 与文件哈希" };
  };
  const provider = fakeProvider(async (options) => {
    assert.equal(seen.length, 0, "编排在工具调用前不得预调用能力（只透传）");
    callsAtProviderStart = seen.length;
    const tool = options.tools.find((item) => item.name === REPORT_ARTIFACT_READY_TOOL_NAME);
    assert.ok(tool, "verifier 注入能力 ⇒ report_artifact_ready 注册（能力经编排透传到 provider options.tools）");
    toolResult = await tool.handler({
      name: REPORT_ARTIFACT_READY_TOOL_NAME,
      args: { flowId: "flow-a", stepId: "acceptance-criteria", path: criteriaRel, summary: "验收标准 v1 已就绪" },
      toolCallId: "call-report-artifact-1",
      signal: new AbortController().signal,
    });
  });
  const handle = await openRoleSession(
    { roleId: "verifier", project, runtime: "demo", persistSession: false, autoRepin: false, reportArtifact },
    adapterDeps(project, provider.factory, (caps) => capturedCaps = caps),
  );
  try {
    assert.equal(capturedCaps?.reportArtifact, reportArtifact, "verifier 把能力以同一引用并入 capabilities");
    assert.equal(provider.calls.length, 1, "openRoleSession 建会话即构造 provider");
    await handle.send("请汇报验收标准就绪");
    await consumeSettled(handle);
    assert.equal(callsAtProviderStart, 0);
    assert.deepEqual(
      seen,
      [{ flowId: "flow-a", stepId: "acceptance-criteria", path: criteriaRel, summary: "验收标准 v1 已就绪" }],
      "载荷原样路由（编排不补键、不改写）",
    );
    assert.equal(toolResult?.ok, true);
    assert.match(toolResult?.message ?? "", /accepted=true/);
    assert.match(toolResult?.message ?? "", new RegExp(`flowId=flow-a`));
    assert.match(toolResult?.message ?? "", /应用已校验 flowId\/stepId\/path 与文件哈希/, "应用 message 原样转达");
    assert.match(toolResult?.message ?? "", /不等于自动完成/, "不得把 accepted 说成已收口");
    assert.match(toolResult?.message ?? "", /不要自行修改 flow 状态/);
    // 编排侧零写入：不写 flow、不写治理账本（即不伪造客户决定/收口），产物保持原样。
    assert.equal(fs.existsSync(path.join(root, "docs", "flows")), false, "编排不得写 docs/flows");
    assert.equal(fs.existsSync(path.join(root, ".ans", "governance", "ledger.jsonl")), false, "编排不得写治理账本/伪造决定");
    assert.equal(fs.readFileSync(path.join(root, criteriaRel), "utf8"), "# 验收标准 v1\n", "产物保持不变");
  } finally {
    await handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("report_artifact_ready：deps.runtimeOptions 残留同名能力也不能旁路给非 verifier（注入端是唯一角色门）", async () => {
  const root = rootDir();
  const project = trioProject(root, ["liaison"]);
  const provider = fakeProvider();
  const capability: ReportArtifactFn = async () => ({ ok: true, accepted: true, message: "不应被调用" });
  const handle = await openRoleSession(
    { roleId: "liaison", project, runtime: "demo", persistSession: false, autoRepin: false },
    {
      // 模拟装配层残留：deps.runtimeOptions 夹带同名能力（工厂必须以 capabilities 的 verifier 判据为准）。
      createAdapter: createRuntimeAdapterFactory(project, "demo", {
        providerFactories: { demo: provider.factory },
        persistSession: false,
        reportArtifact: capability,
      }),
    },
  );
  try {
    assert.ok(
      !provider.calls[0]!.tools.some((tool) => tool.name === REPORT_ARTIFACT_READY_TOOL_NAME),
      "非 verifier 不得经 deps.runtimeOptions 旁路拿到 report_artifact_ready",
    );
  } finally {
    await handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("report_artifact_ready：未提供/其他内置治理角色/旧 su/项目角色 ⇒ 不注入、工具不注册（fail-closed）", async () => {
  const cases: Array<{
    name: string;
    roleId: string;
    project: (root: string) => ProjectConfig;
    provide: boolean;
  }> = [
    { name: "verifier 未提供", roleId: "verifier", project: (root) => trioProject(root, ["verifier"]), provide: false },
    { name: "liaison 误给", roleId: "liaison", project: (root) => trioProject(root, ["liaison"]), provide: true },
    { name: "convener 误给（本能力只给 verifier）", roleId: "convener", project: (root) => trioProject(root, ["convener"]), provide: true },
    { name: "旧 su 误给（single）", roleId: "su", project: singleSuProject, provide: true },
    { name: "项目角色误给", roleId: "X", project: projectRoleProject, provide: true },
  ];
  for (const item of cases) {
    const root = rootDir();
    const project = item.project(root);
    const provider = fakeProvider();
    let caps: AdapterCapabilities | undefined;
    const capability: ReportArtifactFn = async () => ({ ok: true, accepted: true, message: "不应被调用" });
    const handle = await openRoleSession(
      {
        roleId: item.roleId,
        project,
        runtime: "demo",
        persistSession: false,
        autoRepin: false,
        ...(item.provide ? { reportArtifact: capability } : {}),
      },
      adapterDeps(project, provider.factory, (value) => caps = value),
    );
    try {
      assert.equal(caps?.reportArtifact, undefined, `${item.name}：能力不得注入`);
      assert.ok(
        !provider.calls[0]!.tools.some((tool) => tool.name === REPORT_ARTIFACT_READY_TOOL_NAME),
        `${item.name}：能力缺席 ⇒ report_artifact_ready 结构性不注册`,
      );
    } finally {
      await handle.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
