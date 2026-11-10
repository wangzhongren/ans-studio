// test/测试/doc-format-all-roles.test.ts
// 2026-11-09（文档格式权威说明 T2，B5 跨角色集成批次；B1 `bec45edf…` TM-13 / AC-9 / EV4；
// 方案 P1.2 `886fef84…` §4.2 注入矩阵 / §4.3 发现机制 / §7.1 跨角色集成）：
//
// 覆盖（L5 跨角色集成层；全部走真实 `openRoleSession` / `SessionManager` 会话工厂与官方工具装配，
// 非手写桩；不使用真实模型/Electron，不占 9222/9223）：
//  1. 注册矩阵：6 个内置治理角色（chief/product/rapporteur/nominator/convener/verifier）+ 旧 su
//     （single 治理模型）+ 1 个**动态项目角色**会话均注册 `doc_format`；项目角色 id 不依赖技能登记
//     （夹具无 `docs/skills/`，id 非内置保留 id）；
//  2. 注入才注册（项目角色控制）：未注入 `docFormat` ⇒ 工具不存在（CLI/旧调用方 fail-closed）；
//     注入 ⇒ 恰多一只 `doc_format`，其余工具的名称/描述/schema/guidelines/顺序逐字不变；
//  3. judge 隔离：`buildGovernanceJudgeTools` / `buildShellJudgeTools` 恰三只、无 `doc_format`，
//     定义与 `describeTool` 单一来源逐字一致；有界 Chief 决策会话（`chiefDecisionContext`）经真实
//     `openRoleSession` 构造，**即便调用方提供 docFormat 能力**，工具集仍恰 `decide_pending_request`；
//  4. 数据源：全部角色数据源返回**同一静态索引**（`docFormatIndexText()`，无角色裁剪）；索引/详情路径
//     零 `getListing`/`refreshListingNow`/文件 IO，不含项目根/角色事实；不写盘、不入队、不改会话状态、
//     不外推事件（spy/events）；
//  5. 可调用：每个角色会话的 `doc_format` 经**真实轮次**（demo 适配器脚本，真实工具目录）可被调用并
//     返回 `{ok:true,message}`（索引 / `project-intent/v1` 详情）；未知 id `ok:false` 且消息为注册表
//     未知文本；同输入多次调用同文本；调用前后工具目录与其它工具定义不变；每调用恰 start+result
//     两条投影事件（无额外诊断/审计事件、无落盘）。
//
// 纪律：只写本文件；不改产品/其它测试/角色卡/边界/文档；不复制第二份格式文本（断言全部对照
// `src/common/编排/doc-format-specs.ts` 的可复算输出）；不新增 skip/force-exit。
// 披露：本文件证明的是「注册 + 数据源可调用 + 工具可调用」，**不等于真实模型读取**（真实读取见
// B1 AC-12/RR）；Pi/Codex 真实模型行为不作承诺（确定性覆盖）。本文件为确定性测试：registry 静态
// 文本 + 真实会话装配；不使用真实模型。

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import { buildShellJudgeTools } from "../../src/common/runtime-core/shell-judge/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type {
  ChiefDecisionExecutionContext,
  DecidePendingRequestFn,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  ShellJudgeReadStats,
  ToolCall,
  ToolDefinition,
} from "../../src/model/runtime.ts";

type OpenRoleSessionInput = Parameters<SessionManagerDeps["openRoleSession"]>[0];
type GovernanceFunction = NonNullable<ProjectListing["roles"][number]["governanceFunction"]>;

const GOVERNANCE_ROLES = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const;
const GOVERNANCE_FUNCTIONS: Readonly<Record<(typeof GOVERNANCE_ROLES)[number], GovernanceFunction>> = {
  chief: "chief",
  product: "product",
  rapporteur: "proposal",
  nominator: "nomination",
  convener: "schedule",
  verifier: "verification",
};
/**
 * 动态项目角色 id（B1 TM-13「项目角色动态 id 不依赖技能登记」）：非内置保留 id、非技能登记名；
 * 由目标项目 `角色卡/<id>/`（role-card.md + boundary.yaml）经真实 `resolveRole` 解析。
 */
const PROJECT_ROLE = "worker-doc-format-b5";
/** 索引/详情首行固定头部（与注册表同源；此处只做一次「头部可见」断言）。 */
const HEADER_PREFIX = `doc_format（只读；不构成放行/授权；${DOC_FORMAT_SPEC_VERSION}）`;

// ———————————————— 夹具：真实三文件项目角色 + 真实 ProjectListing（trio / single） ————————————————

function builtInRole(roleId: string, governanceFunction?: GovernanceFunction): ProjectListing["roles"][number] {
  return {
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(governanceFunction !== undefined ? { governanceFunction } : {}),
  };
}

function projectRoleEntry(roleId: string): ProjectListing["roles"][number] {
  return {
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "测试" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  };
}

function trioListing(root: string): ProjectListing {
  return {
    projectRoot: root,
    roles: [
      ...GOVERNANCE_ROLES.map((roleId) => builtInRole(roleId, GOVERNANCE_FUNCTIONS[roleId])),
      projectRoleEntry(PROJECT_ROLE),
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function singleListing(root: string): ProjectListing {
  return {
    projectRoot: root,
    roles: [builtInRole("su")],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
    governanceModel: "single",
  };
}

/** 最小临时项目角色（真实 `openRoleSession` 会读盘解析项目角色）。 */
function writeProjectRole(root: string, roleId: string): void {
  const roleDir = path.join(root, "角色卡", roleId);
  fs.mkdirSync(roleDir, { recursive: true });
  fs.writeFileSync(path.join(roleDir, "role-card.md"), `# ${roleId}\n组别：运行时接入组\n组内职责：实现\n`);
  fs.writeFileSync(
    path.join(roleDir, "boundary.yaml"),
    `role: ${roleId}\nentries:\n  - kind: file\n    path: src/${roleId}.ts\n    purpose: 测试\n`,
  );
}

interface Fixture {
  trioRoot: string;
  singleRoot: string;
  cleanup: () => void;
}

function fixture(): Fixture {
  const trioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-b5-trio-"));
  const singleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-b5-single-"));
  writeProjectRole(trioRoot, PROJECT_ROLE);
  return {
    trioRoot,
    singleRoot,
    cleanup: () => {
      fs.rmSync(trioRoot, { recursive: true, force: true });
      fs.rmSync(singleRoot, { recursive: true, force: true });
    },
  };
}

function openTargets(fx: Fixture): Array<{ projectRoot: string; roleId: string }> {
  return [
    ...GOVERNANCE_ROLES.map((roleId) => ({ projectRoot: fx.trioRoot, roleId })),
    // 旧 su：single 治理模型（trio 下 su 归档不可开启；旧模型逐字保留）。
    { projectRoot: fx.singleRoot, roleId: "su" },
    { projectRoot: fx.trioRoot, roleId: PROJECT_ROLE },
  ];
}

// ———————————————— 真实 SessionManager 装配（捕获真实工具目录与真实数据源） ————————————————

interface ManagerHarness {
  manager: SessionManager;
  captured: OpenRoleSessionInput[];
  runs: Array<readonly ToolDefinition[]>;
  envelopes: SessionEventEnvelope[];
  getListingCalls: () => number;
  refreshCalls: () => number;
}

function createHarness(fx: Fixture, script: ToolCall[] = []): ManagerHarness {
  const captured: OpenRoleSessionInput[] = [];
  const runs: Array<readonly ToolDefinition[]> = [];
  const envelopes: SessionEventEnvelope[] = [];
  const listings = new Map<string, ProjectListing>([
    [fx.trioRoot, trioListing(fx.trioRoot)],
    [fx.singleRoot, singleListing(fx.singleRoot)],
  ]);
  let getListingCalls = 0;
  let refreshCalls = 0;
  const manager = new SessionManager({
    openRoleSession: (input, deps) => {
      captured.push(input);
      return openRoleSession({ ...input, autoRepin: false }, deps);
    },
    createRuntimeAdapterFactory,
    buildProjectConfig,
    getListing: (root) => {
      getListingCalls += 1;
      return listings.get(root);
    },
    refreshListing: async () => {
      refreshCalls += 1;
    },
    emitEvent: (envelope) => {
      envelopes.push(envelope);
    },
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
          return createDemoRuntimeAdapter(options, script);
        }) satisfies RuntimeProviderFactory,
      },
    },
  });
  return { manager, captured, runs, envelopes, getListingCalls: () => getListingCalls, refreshCalls: () => refreshCalls };
}

async function openAll(
  harness: ManagerHarness,
  targets: Array<{ projectRoot: string; roleId: string }>,
): Promise<Map<string, readonly ToolDefinition[]>> {
  const toolsByRole = new Map<string, readonly ToolDefinition[]>();
  for (const target of targets) {
    const before = harness.runs.length;
    const opened = await harness.manager.open({ projectRoot: target.projectRoot, roleId: target.roleId, runtime: "demo" });
    assert.equal(opened.ok, true, `${target.roleId} 会话应开启成功：${opened.ok ? "" : (opened.error ?? "")}`);
    assert.equal(harness.runs.length, before + 1, `${target.roleId}：真实编排路径恰构造一次工具集`);
    toolsByRole.set(`${target.roleId}\u0000${target.projectRoot}`, harness.runs[harness.runs.length - 1]!);
  }
  return toolsByRole;
}

// ———————————————— 事件/工具形状投影（只读；不复制产品逻辑） ————————————————

interface ToolDetailRow {
  toolName?: unknown;
  phase?: unknown;
  ok?: unknown;
  display?: { resultText?: { text?: unknown } };
}

function toolDetailOf(event: unknown): ToolDetailRow | undefined {
  const detail = (event as { detail?: unknown }).detail;
  return detail !== null && typeof detail === "object" ? (detail as ToolDetailRow) : undefined;
}

function toolResults(
  envelopes: readonly SessionEventEnvelope[],
  roleId: string,
): Array<{ name: string; ok: boolean; message: string }> {
  const results: Array<{ name: string; ok: boolean; message: string }> = [];
  for (const envelope of envelopes) {
    if (envelope.roleId !== roleId) continue;
    const event = envelope.event as { kind?: unknown };
    if (event.kind !== "accepted" && event.kind !== "denied") continue;
    const detail = toolDetailOf(event);
    if (detail === undefined || detail.phase !== "result" || typeof detail.toolName !== "string") continue;
    const text = detail.display?.resultText?.text;
    results.push({ name: detail.toolName, ok: detail.ok === true, message: typeof text === "string" ? text : "" });
  }
  return results;
}

function toolEventPhases(envelopes: readonly SessionEventEnvelope[], roleId: string, toolName: string): string[] {
  const phases: string[] = [];
  for (const envelope of envelopes) {
    if (envelope.roleId !== roleId) continue;
    const detail = toolDetailOf(envelope.event);
    if (detail !== undefined && detail.toolName === toolName) phases.push(String(detail.phase));
  }
  return phases;
}

function toolShape(tools: readonly ToolDefinition[]): unknown[] {
  return tools.map(({ name, description, inputSchema, promptGuidelines, executionMode }) => ({
    name,
    description,
    inputSchema,
    promptGuidelines,
    executionMode,
  }));
}

/** 临时项目根的文件树快照（相对路径 + 大小 + SHA-256）——证明调用期间零额外落盘（含诊断/审计）。 */
function snapshotTree(root: string): string[] {
  const rows: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const rel = path.relative(root, abs).replaceAll("\\", "/");
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        rows.push(`D ${rel}`);
        walk(abs);
      } else {
        rows.push(`F ${rel} ${stat.size} ${createHash("sha256").update(fs.readFileSync(abs)).digest("hex")}`);
      }
    }
  };
  walk(root);
  return rows;
}

/** 既有会话基础设施路径（真实轮次必然写；与 doc_format 无关；不属「额外落盘」）。 */
function isSessionInfraRow(row: string): boolean {
  return (
    row === "D .ans" ||
    /^D \.ans\/sessions(?:\/|$)/.test(row) ||
    row === "D .ans/state" ||
    /^D \.ans\/state\/logs(?:\/|$)/.test(row) ||
    /^F \.ans\/sessions\//.test(row) ||
    /^F \.ans\/state\/logs\//.test(row)
  );
}

function stats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

/** 数据源返回值必须是纯文本（`DocFormatFn` 契约；不猜、不兜底）。 */
function textOf(value: string | null | undefined | void): string {
  assert.equal(typeof value, "string", "doc_format 数据源必须返回纯文本（S1 同型）");
  return value as string;
}

// ———————————————— 1. 注册矩阵：6 内置 + 旧 su + 动态项目角色 ————————————————

test("B5/TM-13/AC-9 注册矩阵：6 内置治理角色 + 旧 su + 动态项目角色经真实 openRoleSession 均注册 doc_format", async (t) => {
  const fx = fixture();
  const harness = createHarness(fx);
  const targets = openTargets(fx);
  try {
    const toolsByRole = await openAll(harness, targets);
    assert.equal(harness.captured.length, 8, "共 8 个角色会话（6 内置 + 旧 su + 1 项目角色）");
    assert.equal(toolsByRole.size, 8);

    for (const target of targets) {
      const key = `${target.roleId}\u0000${target.projectRoot}`;
      const tools = toolsByRole.get(key)!;
      const names = tools.map((tool) => tool.name);
      assert.equal(
        names.filter((name) => name === "doc_format").length,
        1,
        `${target.roleId}（${target.projectRoot === fx.singleRoot ? "single/su" : "trio"}）必须恰注册一只 doc_format`,
      );
      assert.ok(names.includes("contract_check"), `${target.roleId}：既有 contract_check 保持（对照组）`);
      assert.equal(
        names.indexOf("doc_format"),
        names.indexOf("contract_check") + 1,
        `${target.roleId}：doc_format 紧随 contract_check（注入位置确定、目录顺序稳定）`,
      );
    }

    // 桌面注入点：所有角色会话（同一 openRoleSession 路径）均收到 docFormat 能力（函数、非桩文本）。
    const inputsByKey = new Map(harness.captured.map((input) => [`${input.roleId}\u0000${input.project.projectRoot}`, input]));
    for (const target of targets) {
      const input = inputsByKey.get(`${target.roleId}\u0000${target.projectRoot}`);
      assert.ok(input !== undefined, `${target.roleId} 经真实 openRoleSession 构造`);
      assert.equal(typeof input.docFormat, "function", `${target.roleId} 会话收到 docFormat 数据源能力（无条件注入）`);
    }

    // 旧 su 覆盖真实性：single 治理模型 + 内置能力（非 trio 六角色之一）。
    const suInput = inputsByKey.get(`su\u0000${fx.singleRoot}`)!;
    assert.equal(suInput.project.governanceModel, "single", "su 会话来自 single 治理模型（旧 su，逐字保留）");
    assert.equal((GOVERNANCE_ROLES as readonly string[]).includes("su"), false);

    // 动态项目角色：非内置保留 id；夹具无技能登记（注册不依赖技能安装/预登记）。
    assert.equal((GOVERNANCE_ROLES as readonly string[]).includes(PROJECT_ROLE), false, "项目角色 id 为动态 id，非内置保留 id");
    assert.notEqual(PROJECT_ROLE, "su");
    assert.equal(fs.existsSync(path.join(fx.trioRoot, "docs", "skills")), false, "项目角色注册不依赖技能登记（夹具无 docs/skills/）");

    t.diagnostic(`注册矩阵 8/8：${[...GOVERNANCE_ROLES, "su", PROJECT_ROLE].join(",")}`);
  } finally {
    await harness.manager.stop();
    fx.cleanup();
  }
});

// ———————————————— 2. 注入才注册（项目角色控制）：未注入 ⇒ 无工具；注入 ⇒ 恰多一只、其余逐字不变 ————————————————

test("B5 注入才注册（动态项目角色）：未注入 docFormat ⇒ 无 doc_format；注入 ⇒ 恰多一只且其它工具定义/顺序逐字不变", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-b5-direct-"));
  writeProjectRole(root, PROJECT_ROLE);
  const project = {
    projectRoot: root,
    skillRoot: root,
    roles: {
      [PROJECT_ROLE]: {
        card: `角色卡/${PROJECT_ROLE}/role-card.md`,
        boundary: `角色卡/${PROJECT_ROLE}/boundary.yaml`,
      },
    },
    builtInRoles: [] as string[],
    governanceModel: "single" as const,
  };
  const captured: Array<readonly ToolDefinition[]> = [];
  const provider: RuntimeProviderFactory = async (options) => {
    captured.push(options.tools);
    return createDemoRuntimeAdapter(options, []);
  };
  const deps = { runtimeOptions: { providerFactories: { demo: provider } } };
  const plain = await openRoleSession({ roleId: PROJECT_ROLE, runtime: "demo", autoRepin: false, project }, deps);
  const withCapability = await openRoleSession(
    {
      roleId: PROJECT_ROLE,
      runtime: "demo",
      autoRepin: false,
      project,
      docFormat: (input) => (input.format === undefined ? docFormatIndexText() : docFormatSpecText(input.format, input.part)),
    },
    deps,
  );
  try {
    assert.equal(captured.length, 2, "两次真实 openRoleSession 各构造一次工具集");
    const [without, withDoc] = captured as [readonly ToolDefinition[], readonly ToolDefinition[]];
    assert.equal(without.some((tool) => tool.name === "doc_format"), false, "未注入 ⇒ doc_format 不存在（CLI/旧调用方 fail-closed）");
    const added = withDoc.map((tool) => tool.name).filter((name) => !without.some((tool) => tool.name === name));
    assert.deepEqual(added, ["doc_format"], "注入只新增 doc_format 一只");
    assert.equal(withDoc.length, without.length + 1);
    assert.deepEqual(
      toolShape(withDoc.filter((tool) => tool.name !== "doc_format")),
      toolShape(without),
      "其余工具（名称/描述/schema/guidelines/顺序）逐字不变",
    );
  } finally {
    await plain.dispose();
    await withCapability.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ———————————————— 3. judge / 有界 Chief 隔离：工具集逐字不变、无 doc_format ————————————————

test("B5/AC-9 judge 与有界 Chief 隔离：judge 恰三只无 doc_format；有界 Chief 恰 decide_pending_request（提供 docFormat 也不注册）", async () => {
  // (a) 「替我审」/「替我决策」judge：装配函数不接收 GovernedToolsOptions，工具集恰三只、定义与
  //     `describeTool` 单一来源逐字一致（本变更未改动 judge 工具）。
  const governanceJudgeTools = buildGovernanceJudgeTools({ projectRoot: os.tmpdir(), report() {}, stats: stats() });
  const shellJudgeTools = buildShellJudgeTools({ projectRoot: os.tmpdir(), report() {}, stats: stats() });
  assert.deepEqual(
    governanceJudgeTools.map((tool) => tool.name),
    ["judge_read_file", "judge_list_dir", "report_governance_judgement"],
    "「替我审批/替我决策」judge 恰三只只读工具",
  );
  assert.deepEqual(
    shellJudgeTools.map((tool) => tool.name),
    ["judge_read_file", "judge_list_dir", "report_shell_judgement"],
    "「替我审」judge 恰三只只读工具",
  );
  for (const tool of [...governanceJudgeTools, ...shellJudgeTools]) {
    assert.notEqual(tool.name, "doc_format", "judge 工具集不得出现 doc_format");
    const described = describeTool(tool.name);
    assert.deepEqual(
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        promptGuidelines: tool.promptGuidelines,
        executionMode: tool.executionMode,
      },
      {
        description: described.description,
        inputSchema: described.parameters,
        promptGuidelines: described.promptGuidelines,
        executionMode: described.executionMode,
      },
      `${tool.name} 定义与 schema 单一来源逐字一致（未被本变更改动）`,
    );
  }
  // 确定性：二次构造的工具名/形状完全相同（无隐藏可变状态）。
  const again = buildGovernanceJudgeTools({ projectRoot: os.tmpdir(), report() {}, stats: stats() });
  assert.deepEqual(toolShape(again), toolShape(governanceJudgeTools), "judge 工具集构造确定");

  // (b) 有界 Chief 决策会话：真实 openRoleSession + chiefDecisionContext；**即使调用方提供 docFormat
  //     能力**，适配器能力对象不夹带（结构性隔离），工具集逐字不变（恰 decide_pending_request）。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-b5-bounded-"));
  const project = {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: ["chief"],
    governanceModel: "trio" as const,
  };
  const boundedRuns: string[][] = [];
  const provider: RuntimeProviderFactory = async (options) => {
    boundedRuns.push(options.tools.map((tool) => tool.name));
    return createDemoRuntimeAdapter(options, []);
  };
  const context: ChiefDecisionExecutionContext = {
    roleId: "chief",
    executionId: "bounded-doc-format-b5",
    mode: "bounded-decision",
    request: {
      requestId: "req-b5-bounded-1",
      baseDigest: "a".repeat(64),
      delegationRevision: 1,
      originRoleId: "product",
      cardKind: "decision",
      question: "测试：有界决策（B5 隔离）",
      options: [
        { id: "confirm", label: "同意" },
        { id: "reject", label: "拒绝" },
      ],
      evidenceRefs: [{ snapshotId: "snap-b5", path: "evidence.md", sha256: "b".repeat(64) }],
    },
    productionWriteAuthority: false,
    tools: ["decide_pending_request"],
    limits: { maxTurns: 1, maxAttempts: 1, timeoutMs: 5_000 },
  };
  const decide: DecidePendingRequestFn = async () => ({
    ok: false,
    requestId: "req-b5-bounded-1",
    status: "stale",
    errorCode: "test",
    message: "测试桩：不裁决",
  });
  const bounded = await openRoleSession(
    {
      roleId: "chief",
      runtime: "demo",
      autoRepin: false,
      project,
      docFormat: () => docFormatIndexText(),
      chiefDecisionContext: context,
      decidePendingRequest: decide,
    },
    { runtimeOptions: { providerFactories: { demo: provider } } },
  );
  try {
    assert.equal(boundedRuns.length, 1, "有界 Chief 真实构造一次工具集");
    assert.deepEqual(boundedRuns[0], ["decide_pending_request"], "有界 Chief 工具集逐字不变（恰一只）");
    assert.equal(boundedRuns[0]!.includes("doc_format"), false, "有界 Chief 不注册 doc_format");
    // 对照（普通 chief 会话注册 doc_format）见测试 1：同一桌面注入路径下 chief 正常注册；
    // 这里的差异来自有界构造分支（capabilities 不含 docFormat 且不走 buildGovernedTools）——结构性隔离。
  } finally {
    await bounded.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ———————————————— 4. 数据源：同一静态索引、无角色裁剪、零 IO/零副作用 ————————————————

test("B5/TM-13 数据源：全部角色返回同一静态索引（无角色裁剪）；索引/详情零 getListing/refresh/文件 IO、不含项目/角色事实", async (t) => {
  const fx = fixture();
  const harness = createHarness(fx);
  const targets = openTargets(fx);
  try {
    await openAll(harness, targets);
    const inputs = new Map(harness.captured.map((input) => [`${input.roleId}\u0000${input.project.projectRoot}`, input]));

    const readSpy = mock.method(fs.promises, "readFile");
    const writeSpy = mock.method(fs.promises, "writeFile");
    const appendSpy = mock.method(fs.promises, "appendFile");
    try {
      const listingBefore = harness.getListingCalls();
      const refreshBefore = harness.refreshCalls();
      const eventsBefore = harness.envelopes.length;
      const inventoryBeforeTrio = harness.manager.executionInventoryFacts(fx.trioRoot);
      const inventoryBeforeSingle = harness.manager.executionInventoryFacts(fx.singleRoot);
      const indexes = new Set<string>();

      for (const target of targets) {
        const docFormat = inputs.get(`${target.roleId}\u0000${target.projectRoot}`)!.docFormat!;
        const index = textOf(await docFormat({}));
        indexes.add(index);
        assert.equal(index, docFormatIndexText(), `${target.roleId}：缺省 ⇒ 注册表静态索引`);
        assert.equal(textOf(await docFormat({ format: "" })), docFormatIndexText(), `${target.roleId}：空串 ⇒ 索引`);
        assert.equal(textOf(await docFormat({ format: "   " })), docFormatIndexText(), `${target.roleId}：仅空白 ⇒ 索引`);
        assert.equal(index.split("\n")[0], HEADER_PREFIX, "索引首行固定头部（含规范版本）");

        const detail = textOf(await docFormat({ format: "project-intent/v1" }));
        assert.equal(detail, docFormatSpecText("project-intent/v1"), `${target.roleId}：详情与注册表同源`);
        assert.equal(
          textOf(await docFormat({ format: "project-intent/v1", part: "example" })),
          docFormatSpecText("project-intent/v1", "example"),
          `${target.roleId}：part 原样透传（数据源不做二次裁剪）`,
        );
        const unknown = textOf(await docFormat({ format: "no-such/v1" }));
        assert.equal(unknown, docFormatSpecText("no-such/v1"), `${target.roleId}：未知 id 返回注册表未知文本（数据源不抛）`);
        assert.ok(unknown.includes("未知格式"), "未知提示可读");

        for (const text of [index, detail, unknown]) {
          assert.equal(text.includes(fx.trioRoot), false, "静态公开文本不含项目根事实");
          assert.equal(text.includes(fx.singleRoot), false, "静态公开文本不含其它项目根事实");
          assert.equal(text.includes(PROJECT_ROLE), false, "静态公开文本不含角色事实");
        }
      }

      assert.equal(indexes.size, 1, "所有角色数据源返回同一静态索引（无角色裁剪）");
      const shared = [...indexes][0]!;
      assert.equal(shared, docFormatIndexText(), "共享索引与注册表同源");
      for (const id of docFormatKnownIds()) assert.ok(shared.includes(id), `索引可发现 ${id}`);

      assert.equal(harness.getListingCalls(), listingBefore, "索引/详情路径不调用 getListing");
      assert.equal(harness.refreshCalls(), refreshBefore, "索引/详情路径不调用 refreshListingNow");
      assert.equal(readSpy.mock.calls.length, 0, "索引/详情路径不调用 readFile");
      assert.equal(writeSpy.mock.calls.length, 0, "索引/详情路径不调用 writeFile");
      assert.equal(appendSpy.mock.calls.length, 0, "索引/详情路径不调用 appendFile（无诊断/审计落盘）");
      assert.equal(harness.envelopes.length, eventsBefore, "数据源调用不外推会话/诊断事件");
      const inventoryAfterTrio = harness.manager.executionInventoryFacts(fx.trioRoot);
      const inventoryAfterSingle = harness.manager.executionInventoryFacts(fx.singleRoot);
      assert.equal(inventoryAfterTrio.sessions.length, inventoryBeforeTrio.sessions.length, "数据源调用不改变会话状态（trio）");
      assert.deepEqual(inventoryAfterTrio.queuedDispatches, inventoryBeforeTrio.queuedDispatches, "数据源调用不入队（排队派发不变）");
      assert.deepEqual(inventoryAfterTrio.activeDeliveries, inventoryBeforeTrio.activeDeliveries, "数据源调用不入队（在途投递不变）");
      assert.equal(inventoryAfterSingle.sessions.length, inventoryBeforeSingle.sessions.length, "数据源调用不改变会话状态（single/su）");
      assert.deepEqual(inventoryAfterSingle.queuedDispatches, inventoryBeforeSingle.queuedDispatches, "single/su 排队派发不变");
      assert.deepEqual(inventoryAfterSingle.activeDeliveries, inventoryBeforeSingle.activeDeliveries, "single/su 在途投递不变");

      t.diagnostic(`数据源 8/8 同源：索引 ${Buffer.byteLength(shared, "utf8")} B；已知 id ${docFormatKnownIds().length} 个`);
    } finally {
      readSpy.mock.restore();
      writeSpy.mock.restore();
      appendSpy.mock.restore();
    }
  } finally {
    await harness.manager.stop();
    fx.cleanup();
  }
});

// ———————————————— 5. 可调用：真实轮次中的 doc_format（每角色）+ 确定性/目录不变/无额外事件 ————————————————

test("B5/TM-13 可调用：8 个角色会话的 doc_format 经真实轮次可调用（索引/详情 ok:true、未知 ok:false）；同输入同文本、目录不变、无额外事件/落盘", async (t) => {
  const fx = fixture();
  const script: ToolCall[] = [
    { name: "doc_format", args: {} },
    { name: "doc_format", args: {} },
    { name: "doc_format", args: { format: "project-intent/v1" } },
    { name: "doc_format", args: { format: "project-intent/v1" } },
    { name: "doc_format", args: { format: "no-such/v1" } },
  ];
  const targets = openTargets(fx);
  const expectedMessages = [
    docFormatIndexText(),
    docFormatIndexText(),
    docFormatSpecText("project-intent/v1"),
    docFormatSpecText("project-intent/v1"),
    docFormatSpecText("no-such/v1"),
  ];
  const expectedOk = [true, true, true, true, false];
  let calls = 0;
  try {
    for (const target of targets) {
      // 每个角色独立一个 SessionManager：生产同时保活上限 `MAX_LIVE_SESSIONS = 3`（LRU 回收旧会话），
      // 同一 manager 开 8 个会话会回收目标会话；独立装配保证「该角色真实会话轮次」本身被验证。
      const harness = createHarness(fx, script);
      const treeBefore = snapshotTree(target.projectRoot);
      const nonInfraBefore = treeBefore.filter((row) => !isSessionInfraRow(row));
      try {
        const toolsByRole = await openAll(harness, [target]);
        const tools = toolsByRole.get(`${target.roleId}\u0000${target.projectRoot}`)!;
        const shapeBefore = toolShape(tools);

        const sent = await harness.manager.sendBackground({
          projectRoot: target.projectRoot,
          roleId: target.roleId,
          runtime: "demo",
          text: `B5 doc_format 跨角色探针：${target.roleId}`,
          clientMessageId: `doc-format-b5-${target.roleId}`,
        });
        assert.equal(sent.ok, true, `${target.roleId} 真实轮次应受理：${sent.ok ? "" : (sent.error ?? "")}`);
        await harness.manager.waitForRoleSettle(target.projectRoot, target.roleId, "demo", 10_000);

        const facts = toolResults(harness.envelopes, target.roleId).filter((fact) => fact.name === "doc_format");
        assert.equal(facts.length, script.length, `${target.roleId}：脚本内每个 doc_format 调用恰一条结果事实`);
        assert.deepEqual(facts.map((fact) => fact.ok), expectedOk, `${target.roleId}：索引/详情 ok:true；未知 ok:false`);
        assert.deepEqual(facts.map((fact) => fact.message), expectedMessages, `${target.roleId}：回执与注册表可复算文本逐字一致`);
        assert.equal(facts[0]!.message.split("\n")[0], HEADER_PREFIX, `${target.roleId}：工具回执含固定头部`);

        // 同输入多次调用同文本（确定性；脚本第 1/2 条与第 3/4 条内容相同，已在 expectedMessages 中体现）。
        assert.equal(facts[0]!.message, facts[1]!.message, `${target.roleId}：同输入（索引）两次调用同文本`);
        assert.equal(facts[2]!.message, facts[3]!.message, `${target.roleId}：同输入（详情）两次调用同文本`);

        const phases = toolEventPhases(harness.envelopes, target.roleId, "doc_format");
        assert.equal(
          phases.filter((phase) => phase === "start").length,
          script.length,
          `${target.roleId}：每调用恰一条 start 投影事件`,
        );
        assert.equal(
          phases.filter((phase) => phase === "result").length,
          script.length,
          `${target.roleId}：每调用恰一条 result 投影事件`,
        );
        assert.equal(
          phases.every((phase) => phase === "start" || phase === "result"),
          true,
          `${target.roleId}：doc_format 事件仅 start/result（无额外诊断/审计事件）`,
        );

        // 工具目录/其它工具定义不因调用而改变（数组与定义逐字不变）。
        assert.deepEqual(toolShape(tools), shapeBefore, `${target.roleId}：工具目录与其它工具定义逐字不变`);

        // 零额外落盘：真实轮次本身会写既有会话基础设施（`.ans/sessions/**` 会话历史与
        // `.ans/state/logs/**` 角色运行日志——轮次事件泵既有行为，与本工具无关）；除此以外项目根
        // 不得出现任何新增/修改文件（尤其无诊断/审计产物、无格式说明副本落盘）。
        const treeAfter = snapshotTree(target.projectRoot);
        const nonInfraAfter = treeAfter.filter((row) => !isSessionInfraRow(row));
        assert.deepEqual(
          nonInfraAfter,
          nonInfraBefore,
          `${target.roleId}：除会话基础设施（.ans/sessions、.ans/state/logs）外项目根零落盘（无诊断/审计产物）`,
        );

        calls += script.length;
      } finally {
        await harness.manager.stop();
      }
    }

    t.diagnostic(`可调用 ${targets.length}/8 角色 × ${script.length} 次 = ${calls} 次工具调用；未知 ok:false 与注册表未知文本一致`);
  } finally {
    fx.cleanup();
  }
});
