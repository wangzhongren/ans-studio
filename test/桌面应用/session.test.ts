// test/桌面应用/session.test.ts
// 2026-11-09（文档格式权威说明 T2，B4b 桌面注入批次；B1 `bec45edf…` TM-12 / AC-9 / AC-10）：
// **新建（恢复已删除路径）**——本文件在本变更前不存在（删除提交 `4c24149`），但一直列于本角色
// 边界 §1（`角色卡/桌面窗口/boundary.yaml`、`boundary.md`）；本次按方案 P1.2 §6.2 恢复该路径
// （H1 delta = 0，边界漂移记录见本角色变更记录），用于钉住桌面 `doc_format` 注入与数据源静态早退。
// **不改写任何既有文件/断言**；不使用真实模型/Electron（确定性测试）。
//
// 覆盖：
//  1. 注入矩阵：6 个内置治理角色 + 1 个项目角色经**真实 `openRoleSession` 全链**（SessionManager →
//     编排 capabilities 透传 → 运行时核心 `buildGovernedTools`）均注册 `doc_format`；
//  2. 注入才注册：未注入 `docFormat` ⇒ 工具不存在；注入 ⇒ 恰多一只 `doc_format`、其余工具定义逐字不变；
//  3. 静态早退：索引/详情不调用 `getListing`/`refreshListing`/`readFile`/`writeFile`，不读 run/项目事实
//     （输出恒等于注册表静态文本）、同一输入多次返回同一文本、不外推事件、不改会话状态；
//  4. 工具层：未知 format ⇒ 注册表未知文本且 `ok:false`；非字符串 format 拒绝；`part=fields|example|
//     errors` 透传；未知 id 数据源不抛；
//  5. legacy `contract_check` 输出/行为不变（topic 静态路径 + 无 topic 事实路径）；
//  6. judge（「替我审」/「替我决策」）与有界 Chief 决策会话**不注册** `doc_format`、工具集逐字不变
//     （含真实桌面有界构造路径：`chiefDecision.execute` 打开的 chief 会话 + 桌面 judge 工厂入参）；
//  7. 预算：索引 5,223 B、最大详情 4,089 B（B1 实测；均 ≤8192 B）。
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionManager, type SessionManagerDeps, type SessionEventEnvelope } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { openRoleSession, createRuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import {
  DOC_FORMAT_SPEC_VERSION,
  docFormatIndexText,
  docFormatKnownIds,
  docFormatSpecText,
} from "../../src/common/编排/doc-format-specs.ts";
import { contractSchemaText } from "../../src/common/编排/workflow-preconditions.ts";
import { buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import { buildShellJudgeTools } from "../../src/common/runtime-core/shell-judge/tools.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { DesktopCustomerInputFn } from "../../app/desktop/customer-input.ts";
import type {
  ChiefDecisionExecutionContext,
  DecidePendingRequestFn,
  GovernanceJudgeFn,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  ShellJudgeFn,
  ShellJudgeReadStats,
  ToolDefinition,
} from "../../src/model/runtime.ts";

type OpenRoleSessionInput = Parameters<SessionManagerDeps["openRoleSession"]>[0];

const GOVERNANCE_ROLES = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const;
const PROJECT_ROLE = "implementer";

function listing(root: string): ProjectListing {
  const builtIn = (
    roleId: string,
    governanceFunction: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>,
  ): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "测试" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      worker(PROJECT_ROLE),
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

/** 最小临时项目：项目角色卡 + 边界（真实 `openRoleSession` 会读盘解析项目角色）。 */
function fixture(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-desktop-"));
  const roleDir = path.join(root, "角色卡", PROJECT_ROLE);
  fs.mkdirSync(roleDir, { recursive: true });
  fs.writeFileSync(path.join(roleDir, "role-card.md"), `# ${PROJECT_ROLE}\n组别：运行时接入组\n组内职责：实现\n`);
  fs.writeFileSync(
    path.join(roleDir, "boundary.yaml"),
    `role: ${PROJECT_ROLE}\nentries:\n  - kind: file\n    path: src/${PROJECT_ROLE}.ts\n    purpose: 测试\n`,
  );
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function stats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

/** 从会话事件中外推工具结果事实（`detail.phase === "result"` 的投影行）。 */
function toolResults(envelopes: readonly SessionEventEnvelope[]): Array<{ name: string; ok: boolean; message: string }> {
  const results: Array<{ name: string; ok: boolean; message: string }> = [];
  for (const envelope of envelopes) {
    const event = envelope.event as OrchestrationEvent;
    if (event.kind !== "accepted" && event.kind !== "denied") continue;
    const detail = (event as { detail?: unknown }).detail as
      | { phase?: unknown; toolName?: unknown; ok?: unknown; display?: { resultText?: { text?: unknown } } }
      | undefined;
    if (detail === undefined || detail.phase !== "result" || typeof detail.toolName !== "string") continue;
    const text = detail.display?.resultText?.text;
    results.push({ name: detail.toolName, ok: detail.ok === true, message: typeof text === "string" ? text : "" });
  }
  return results;
}

/** 工具定义的可深比较投影（不含 handler 函数）。 */
function toolShape(tools: readonly ToolDefinition[]): unknown[] {
  return tools.map(({ name, description, inputSchema, promptGuidelines }) => ({
    name,
    description,
    inputSchema,
    promptGuidelines,
  }));
}

test("TM-12/AC-9 注入矩阵：6 内置治理角色 + 1 项目角色经真实 openRoleSession 均注册 doc_format", async () => {
  const temp = fixture();
  const runs: Array<readonly ToolDefinition[]> = [];
  const manager = new SessionManager({
    openRoleSession: (input, deps) => openRoleSession({ ...input, autoRepin: false }, deps),
    createRuntimeAdapterFactory,
    buildProjectConfig,
    getListing: (root) => (root === temp.root ? listing(root) : undefined),
    emitEvent() {},
    createPiAdapterFactory() {
      throw new Error("no pi");
    },
    createDemoAdapter() {
      throw new Error("no demo");
    },
    runtimeOptions: {
      providerFactories: {
        demo: (async (options: RuntimeProviderOptions) => {
          runs.push(options.tools);
          return createDemoRuntimeAdapter(options, []);
        }) satisfies RuntimeProviderFactory,
      },
    },
  });
  try {
    for (const roleId of [...GOVERNANCE_ROLES, PROJECT_ROLE]) {
      const before = runs.length;
      const opened = await manager.open({ projectRoot: temp.root, roleId, runtime: "demo" });
      assert.equal(opened.ok, true, `${roleId} 会话应开启成功：${opened.ok ? "" : opened.error}`);
      assert.equal(runs.length, before + 1, `${roleId}：适配器构造恰一次（真实编排路径）`);
      const names = runs[runs.length - 1]!.map((tool) => tool.name);
      assert.ok(names.includes("doc_format"), `${roleId} 会话必须注册 doc_format`);
      assert.ok(names.includes("contract_check"), `${roleId} 既有 contract_check 保持`);
    }
  } finally {
    await manager.stop();
    temp.cleanup();
  }
});

test("AC-9 注入才注册：未注入 docFormat ⇒ 无 doc_format；注入 ⇒ 恰多一只、其余工具定义逐字不变", async () => {
  const temp = fixture();
  const project = {
    projectRoot: temp.root,
    skillRoot: temp.root,
    roles: {},
    builtInRoles: ["chief"],
    governanceModel: "trio" as const,
  };
  const captured: Array<readonly ToolDefinition[]> = [];
  const provider: RuntimeProviderFactory = async (options) => {
    captured.push(options.tools);
    return createDemoRuntimeAdapter(options, []);
  };
  const plain = await openRoleSession(
    { roleId: "chief", runtime: "demo", autoRepin: false, project },
    { runtimeOptions: { providerFactories: { demo: provider } } },
  );
  const withCapability = await openRoleSession(
    { roleId: "chief", runtime: "demo", autoRepin: false, project, docFormat: () => "（测试桩文本）" },
    { runtimeOptions: { providerFactories: { demo: provider } } },
  );
  try {
    assert.equal(captured.length, 2, "两次真实会话各构造一次工具集");
    const [without, withDoc] = captured as [readonly ToolDefinition[], readonly ToolDefinition[]];
    assert.equal(without.some((tool) => tool.name === "doc_format"), false, "未注入 ⇒ doc_format 不存在");
    const added = withDoc.map((tool) => tool.name).filter((name) => !without.some((tool) => tool.name === name));
    assert.deepEqual(added, ["doc_format"], "注入只新增 doc_format 一只");
    assert.deepEqual(
      toolShape(withDoc.filter((tool) => tool.name !== "doc_format")),
      toolShape(without),
      "其余工具（名称/描述/schema/guidelines）逐字不变",
    );
  } finally {
    await plain.dispose();
    await withCapability.dispose();
    temp.cleanup();
  }
});

test("AC-10 静态早退：索引/详情不触 getListing/refreshListing/文件 IO、不读事实、输出确定", async () => {
  const temp = fixture();
  const captured: OpenRoleSessionInput[] = [];
  const envelopes: SessionEventEnvelope[] = [];
  let getListingCalls = 0;
  let refreshListingCalls = 0;
  const manager = new SessionManager({
    openRoleSession: async (input) => {
      captured.push(input);
      return {
        runtime: input.runtime,
        contextSource: "fresh",
        async send() {},
        async *events() {},
        async dispose() {},
        async abort() {
          return { ok: true, supported: true };
        },
      };
    },
    buildProjectConfig,
    getListing: (root) => {
      getListingCalls += 1;
      return root === temp.root ? listing(root) : undefined;
    },
    refreshListing: async () => {
      refreshListingCalls += 1;
    },
    emitEvent: (envelope) => envelopes.push(envelope),
    createPiAdapterFactory() {
      throw new Error("no pi");
    },
    createDemoAdapter() {
      throw new Error("no demo");
    },
  });
  try {
    const opened = await manager.open({ projectRoot: temp.root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? ""));
    const input = captured.find((item) => item.roleId === "chief")!;
    assert.equal(typeof input.docFormat, "function", "桌面必须无条件注入 docFormat（所有角色会话同路径）");

    const readSpy = mock.method(fs.promises, "readFile");
    const writeSpy = mock.method(fs.promises, "writeFile");
    try {
      const listingBefore = getListingCalls;
      const refreshBefore = refreshListingCalls;
      const eventsBefore = envelopes.length;
      const sessionsBefore = manager.executionInventoryFacts(temp.root).sessions.length;

      const indexA = await input.docFormat!({});
      const indexB = await input.docFormat!({ format: "" });
      const indexC = await input.docFormat!({ format: "   " });
      assert.equal(indexA, docFormatIndexText(), "缺省 ⇒ 索引静态文本");
      assert.equal(indexB, docFormatIndexText(), "空串 ⇒ 索引静态文本");
      assert.equal(indexC, docFormatIndexText(), "仅空白 ⇒ 索引静态文本");

      const detailA = await input.docFormat!({ format: "project-intent/v1" });
      const detailB = await input.docFormat!({ format: "project-intent/v1" });
      assert.equal(detailA, docFormatSpecText("project-intent/v1"), "详情静态文本");
      assert.equal(detailB, detailA, "同一输入多次调用返回同一静态文本");
      for (const part of ["fields", "example", "errors"] as const) {
        assert.equal(
          await input.docFormat!({ format: "project-intent/v1", part }),
          docFormatSpecText("project-intent/v1", part),
          `part=${part} 透传`,
        );
      }
      assert.equal(
        await input.docFormat!({ format: "project-roster/v3", part: "fields" }),
        docFormatSpecText("project-roster/v3", "fields"),
        "render 型 part 由注册表整段返回（数据源不做二次裁剪）",
      );
      const unknown = await input.docFormat!({ format: "no-such/v1" });
      assert.equal(unknown, docFormatSpecText("no-such/v1"), "未知 id 返回注册表未知文本（数据源不抛）");
      assert.ok(unknown.includes("未知格式"), "未知 id 文本可读");

      assert.equal(getListingCalls, listingBefore, "索引/详情不调用 getListing");
      assert.equal(refreshListingCalls, refreshBefore, "索引/详情不调用 refreshListingNow");
      assert.equal(readSpy.mock.calls.length, 0, "索引/详情不调用 readFile");
      assert.equal(writeSpy.mock.calls.length, 0, "索引/详情不调用 writeFile");
      assert.equal(envelopes.length, eventsBefore, "索引/详情不外推事件");
      assert.equal(
        manager.executionInventoryFacts(temp.root).sessions.length,
        sessionsBefore,
        "索引/详情不改会话状态",
      );
      assert.equal(indexA.includes(temp.root), false, "输出为静态公开文本，不含项目根等事实");
    } finally {
      readSpy.mock.restore();
      writeSpy.mock.restore();
    }
  } finally {
    await manager.stop();
    temp.cleanup();
  }
});

test("AC-8/AC-10 工具层（真实会话内）：未知 ok:false、非字符串拒绝、part 透传、legacy contract_check 不变", async () => {
  const temp = fixture();
  const envelopes: SessionEventEnvelope[] = [];
  const script = [
    { name: "doc_format", args: {} },
    { name: "doc_format", args: { format: "project-intent/v1", part: "fields" } },
    { name: "doc_format", args: { format: "project-intent/v1", part: "example" } },
    { name: "doc_format", args: { format: "project-intent/v1", part: "errors" } },
    { name: "doc_format", args: { format: "no-such/v1" } },
    { name: "doc_format", args: { format: 123 } },
    { name: "contract_check", args: { topic: "modules" } },
  ];
  const manager = new SessionManager({
    openRoleSession: (input, deps) => openRoleSession({ ...input, autoRepin: false }, deps),
    createRuntimeAdapterFactory,
    buildProjectConfig,
    getListing: (root) => (root === temp.root ? listing(root) : undefined),
    emitEvent: (envelope) => envelopes.push(envelope),
    createPiAdapterFactory() {
      throw new Error("no pi");
    },
    createDemoAdapter() {
      throw new Error("no demo");
    },
    runtimeOptions: {
      providerFactories: {
        demo: (async (options: RuntimeProviderOptions) => createDemoRuntimeAdapter(options, script)) satisfies RuntimeProviderFactory,
      },
    },
  });
  try {
    const opened = await manager.open({ projectRoot: temp.root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? ""));
    const sent = await manager.send("doc_format 工具层探针", undefined, undefined, { clientMessageId: "doc-format-probe" });
    assert.equal(sent.ok, true);
    const facts = toolResults(envelopes);
    assert.equal(facts.length, script.length, "脚本内每个工具调用都应产生一条结果事实");

    assert.equal(facts[0]!.name, "doc_format");
    assert.equal(facts[0]!.ok, true);
    assert.equal(facts[0]!.message, docFormatIndexText(), "索引与注册表同源");
    assert.ok(facts[0]!.message.startsWith(`doc_format（只读；不构成放行/授权；${DOC_FORMAT_SPEC_VERSION}）`));

    assert.deepEqual(
      [facts[1]!.message, facts[2]!.message, facts[3]!.message],
      [
        docFormatSpecText("project-intent/v1", "fields"),
        docFormatSpecText("project-intent/v1", "example"),
        docFormatSpecText("project-intent/v1", "errors"),
      ],
      "part=fields|example|errors 原样透传",
    );

    assert.equal(facts[4]!.ok, false, "未知 format 经工具层为 ok:false");
    assert.equal(facts[4]!.message, docFormatSpecText("no-such/v1"), "未知提示与注册表未知文本逐字一致");

    assert.equal(facts[5]!.ok, false, "非字符串 format 由工具层拒绝");
    assert.ok(facts[5]!.message.includes("format 参数非法"), "非字符串拒绝文案");

    assert.equal(facts[6]!.name, "contract_check");
    assert.equal(facts[6]!.ok, true);
    assert.equal(facts[6]!.message, contractSchemaText("modules"), "legacy contract_check topic 输出逐字不变");
  } finally {
    await manager.stop();
    temp.cleanup();
  }
});

test("AC-10/回归：legacy contract_check 无 topic 事实路径输出不变（注入 docFormat 后仍可用）", async () => {
  const temp = fixture();
  const captured: OpenRoleSessionInput[] = [];
  const manager = new SessionManager({
    openRoleSession: async (input) => {
      captured.push(input);
      return {
        runtime: input.runtime,
        contextSource: "fresh",
        async send() {},
        async *events() {},
        async dispose() {},
        async abort() {
          return { ok: true, supported: true };
        },
      };
    },
    buildProjectConfig,
    getListing: (root) => (root === temp.root ? listing(root) : undefined),
    emitEvent() {},
    createPiAdapterFactory() {
      throw new Error("no pi");
    },
    createDemoAdapter() {
      throw new Error("no demo");
    },
  });
  try {
    const opened = await manager.open({ projectRoot: temp.root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? ""));
    const contractCheck = captured.find((item) => item.roleId === "chief")!.contractCheck!;
    assert.equal(typeof contractCheck, "function");
    assert.equal(await contractCheck({ topic: "modules" }), contractSchemaText("modules"), "topic 静态路径不变");
    const legacy = await contractCheck({});
    assert.equal(typeof legacy, "string");
    assert.match(legacy as string, /^contract_check（只读速查；查询不构成放行\/授权）/);
    assert.ok((legacy as string).includes("run：legacy（未冻结）"), "无 run 事实照旧如实标注 legacy");
    assert.ok((legacy as string).includes("角色：chief｜builtIn=true"), "角色事实行不变");
  } finally {
    await manager.stop();
    temp.cleanup();
  }
});

test("AC-9 judge/有界不变：judge 工具集恰三只且无 doc_format；有界 Chief 真实桌面构造不注入、工具集逐字不变", async () => {
  // (a) judge 工具集（结构性与 buildGovernedTools 隔离；不接收 docFormat/GovernedToolsOptions）。
  const governanceJudgeTools = buildGovernanceJudgeTools({ projectRoot: os.tmpdir(), report() {}, stats: stats() });
  const shellJudgeTools = buildShellJudgeTools({ projectRoot: os.tmpdir(), report() {}, stats: stats() });
  assert.deepEqual(
    governanceJudgeTools.map((tool) => tool.name),
    ["judge_read_file", "judge_list_dir", "report_governance_judgement"],
    "「替我审/替我决策」judge 恰三只只读工具",
  );
  assert.deepEqual(
    shellJudgeTools.map((tool) => tool.name),
    ["judge_read_file", "judge_list_dir", "report_shell_judgement"],
    "「替我审」judge 恰三只只读工具",
  );
  assert.equal(
    [...governanceJudgeTools, ...shellJudgeTools].some((tool) => tool.name === "doc_format"),
    false,
    "judge 工具集不得出现 doc_format",
  );

  // (b) 真实桌面有界 Chief 构造路径：open convener（trio + customerInput 通道）→ 捕获 ctx.chiefDecision →
  //     真实 execute 打开的 bounded chief 会话（`openObservedRoleSession` 的独立构造点）不得携带 docFormat。
  const temp = fixture();
  const captured: OpenRoleSessionInput[] = [];
  const providerTools: Array<readonly string[]> = [];
  const shellJudgeOptions: Array<Record<string, unknown>> = [];
  const governanceJudgeOptions: Array<Record<string, unknown>> = [];
  let boundedCustomerContext: Parameters<DesktopCustomerInputFn>[1] | undefined;
  const manager = new SessionManager({
    openRoleSession: (input, deps) => {
      captured.push(input);
      return openRoleSession({ ...input, autoRepin: false }, deps);
    },
    createRuntimeAdapterFactory,
    buildProjectConfig,
    getListing: (root) => (root === temp.root ? listing(root) : undefined),
    emitEvent() {},
    createPiAdapterFactory() {
      throw new Error("no pi");
    },
    createDemoAdapter() {
      throw new Error("no demo");
    },
    customerInput: async (_request, context) => {
      boundedCustomerContext = context;
      return { outcome: "declined", notPresented: true, reason: "测试：不呈现客户卡" };
    },
    createShellJudge: ((options) => {
      shellJudgeOptions.push(options as unknown as Record<string, unknown>);
      return (async () => ({ verdict: "manual", reasonCode: "test", reason: "测试桩" })) as ShellJudgeFn;
    }) satisfies NonNullable<SessionManagerDeps["createShellJudge"]>,
    createGovernanceJudge: ((options) => {
      governanceJudgeOptions.push(options as unknown as Record<string, unknown>);
      return (async () => ({
        verdict: "manual",
        group: "decision",
        cardKind: "decision",
        reasonCode: "test",
        engine: "demo",
      })) as GovernanceJudgeFn;
    }) satisfies NonNullable<SessionManagerDeps["createGovernanceJudge"]>,
    runtimeOptions: {
      providerFactories: {
        demo: (async (options: RuntimeProviderOptions) => {
          providerTools.push(options.tools.map((tool) => tool.name));
          return createDemoRuntimeAdapter(options, []);
        }) satisfies RuntimeProviderFactory,
      },
    },
  });
  try {
    const opened = await manager.open({ projectRoot: temp.root, roleId: "convener", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? ""));
    const convenerInput = captured.find((item) => item.roleId === "convener")!;
    assert.equal(typeof convenerInput.docFormat, "function", "普通角色会话仍注入 docFormat（对照组）");

    // 桌面 judge 工厂只收到固定四键（project/runtime/runtimeOptions/createAdapter），不夹带 docFormat。
    assert.equal(shellJudgeOptions.length, 1, "「替我审」闭包经真实会话构造");
    assert.equal(governanceJudgeOptions.length, 1, "「替我决策」闭包经真实会话构造（trio + 客户通道）");
    for (const options of [...shellJudgeOptions, ...governanceJudgeOptions]) {
      assert.equal(Object.hasOwn(options, "docFormat"), false, "judge 工厂入参不得出现 docFormat");
    }

    const customerInput = convenerInput.customerInput!;
    const outcome = await customerInput(
      { kind: "confirm", title: "确认方案？", cardKind: "decision", flowId: "focus", sourceRoleId: "product" },
      {},
    );
    assert.equal(outcome?.outcome, "declined");
    assert.ok(boundedCustomerContext?.chiefDecision !== undefined, "trio 客户通道上下文带 chiefDecision 宿主");

    const context: ChiefDecisionExecutionContext = {
      roleId: "chief",
      executionId: "bounded-doc-format-test",
      mode: "bounded-decision",
      request: {
        requestId: "req-bounded-1",
        baseDigest: "a".repeat(64),
        delegationRevision: 1,
        originRoleId: "product",
        cardKind: "decision",
        question: "测试：有界决策",
        options: [
          { id: "confirm", label: "同意" },
          { id: "reject", label: "拒绝" },
        ],
        evidenceRefs: [{ snapshotId: "snap", path: "evidence.md", sha256: "b".repeat(64) }],
      },
      productionWriteAuthority: false,
      tools: ["decide_pending_request"],
      limits: { maxTurns: 1, maxAttempts: 1, timeoutMs: 5_000 },
    };
    const decide: DecidePendingRequestFn = async () => ({
      ok: false,
      requestId: "req-bounded-1",
      status: "stale",
      errorCode: "test",
      message: "测试桩：不裁决",
    });
    await boundedCustomerContext!.chiefDecision!.execute(
      context,
      "证据正文",
      decide,
      new AbortController().signal,
    );

    const boundedInput = captured.find((item) => item.chiefDecisionContext !== undefined);
    assert.ok(boundedInput !== undefined, "有界 Chief 会话经真实 openObservedRoleSession 构造");
    assert.equal(Object.hasOwn(boundedInput!, "docFormat"), false, "有界 Chief 构造点不注入 docFormat");
    assert.equal(providerTools.length, 2, "convener 与会话 + 有界 chief 各构造一次工具集");
    assert.deepEqual(providerTools[1], ["decide_pending_request"], "有界 Chief 工具集逐字不变（恰一只）");
  } finally {
    await manager.stop();
    temp.cleanup();
  }
});

test("AC-8 预算：索引 5,223 B、最大详情 4,089 B（均 ≤8192 B，B1 实测 pin）", () => {
  const index = docFormatIndexText();
  assert.equal(Buffer.byteLength(index, "utf8"), 5223, "索引字节（B1 实测 pin）");
  assert.ok(Buffer.byteLength(index, "utf8") <= 8192);
  assert.equal(docFormatKnownIds().length, 54, "54 个格式 id 全量可发现");

  let maxBytes = 0;
  let maxId = "";
  for (const id of docFormatKnownIds()) {
    const bytes = Buffer.byteLength(docFormatSpecText(id), "utf8");
    assert.ok(bytes <= 8192, `详情 ${id} ≤8192 B`);
    if (bytes > maxBytes) {
      maxBytes = bytes;
      maxId = id;
    }
  }
  assert.equal(maxBytes, 4089, "最大详情字节（B1 实测 pin）");
  assert.equal(maxId, "project-roster/v3", "最大详情为 roster（render 型整段返回）");
});
