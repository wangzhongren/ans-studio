// 运行时核心 C2 测试：governance_matrix 只读工具（注册/参数/回执/无副作用/Service 透传）。
// 2026-11-05 governance-authority-matrix；依据方案 P1.1 §4.3.2/§5.2、团队计划 §4.3 C2、V1 AC-1/2/10/11/15/16/17。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GovernanceMatrixFn } from "../../src/model/governance-matrix.ts";
import type {
  RoleSession,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
} from "../../src/model/runtime.ts";
import {
  GOVERNANCE_MATRIX_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const successText =
  "# 治理权力矩阵（运行时派生只读摘要；schema governance-matrix/v1）\n" +
  "> 生成于 2026-11-05T10:12:00+08:00；治理模型 trio。\n" +
  "> 矩阵未列出≠无权限；宿主未注入≠角色无权。\n" +
  "## 内置治理角色（6）\n" +
  "### chief 幕僚（built-in）\n" +
  "- 职能定位：工作流管理、按序派发。\n" +
  "## 项目角色（worker；仅数据）\n" +
  "- combat-engineer（project）：可写 unknown（boundary 解析失败：bad yaml）。";

function receipt(ok: boolean, message: string): { ok: boolean; message: string } {
  return { ok, message };
}

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

function call(args: Record<string, unknown>, extra?: { signal?: AbortSignal }) {
  return { name: GOVERNANCE_MATRIX_TOOL_NAME, args, ...extra };
}

test("AC-2 注册：未注入 ⇒ governance_matrix 不存在；注入 ⇒ 只新增这一只且既有工具零变化；构造不调用函数", () => {
  const base = buildGovernedTools(allow);
  const baseNames = base.map((tool) => tool.name);
  assert.equal(baseNames.includes(GOVERNANCE_MATRIX_TOOL_NAME), false, "未注入时必须不存在");

  let called = 0;
  const fn: GovernanceMatrixFn = async () => {
    called += 1;
    return receipt(true, successText);
  };
  const withTool = buildGovernedTools(allow, { governanceMatrix: fn });
  assert.equal(called, 0, "构造/注册时不得调用矩阵函数（启动不计算）");
  const added = withTool.filter((tool) => !baseNames.includes(tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [GOVERNANCE_MATRIX_TOOL_NAME], "注入只新增 governance_matrix");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name)!;
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }
});

test("AC-2 schema/文案：参数仅 roleId+section、enum 三值、additionalProperties:false；只读/unknown/非批准", () => {
  const desc = describeTool(GOVERNANCE_MATRIX_TOOL_NAME);
  const parameters = desc.parameters as {
    properties: Record<string, { type?: string; enum?: string[] }>;
    required?: string[];
    additionalProperties?: boolean;
  };
  assert.deepEqual(Object.keys(parameters.properties).sort(), ["roleId", "section"]);
  assert.equal(parameters.properties.roleId.type, "string");
  assert.equal(parameters.properties.section.type, "string");
  assert.deepEqual(parameters.properties.section.enum, ["all", "roles", "routing"]);
  assert.deepEqual(parameters.required, []);
  assert.equal(parameters.additionalProperties, false);
  assert.match(desc.description, /只读/);
  assert.match(desc.description, /unknown/);
  assert.match(desc.description, /不等于允许/);
  assert.match(desc.description, /不新增、不改变任何权限/);
  assert.match(desc.description, /不是批准/);
  assert.match(desc.description, /ok:false.*不是没有权限/);
  assert.equal(/allowed|denied|approved/i.test(desc.description), false, "描述不得出现授权/判定字段");
  const guidelines = desc.promptGuidelines ?? [];
  assert.equal(guidelines.length >= 3, true, "必须有 promptGuidelines");
  assert.equal(guidelines.some((line) => /未知角色返回未找到/.test(line)), true);
});

test("AC-2 参数矩阵：合法值 trim 后透传；未知参数/非法类型/空 roleId/非法 section 在调用前拒绝", async () => {
  const calls: Array<{ roleId?: string; section?: string } | undefined> = [];
  const fn: GovernanceMatrixFn = async (input) => {
    calls.push(input);
    return receipt(true, successText);
  };
  const tool = toolMap({ governanceMatrix: fn }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;

  assert.deepEqual(await tool.handler(call({})), { ok: true, message: successText });
  assert.deepEqual(calls[0], {});

  await tool.handler(call({ roleId: " chief " }));
  assert.deepEqual(calls[1], { roleId: "chief" });

  await tool.handler(call({ section: " roles " }));
  assert.deepEqual(calls[2], { section: "roles" });

  await tool.handler(call({ roleId: "convener", section: "routing" }));
  assert.deepEqual(calls[3], { roleId: "convener", section: "routing" });

  const before = calls.length;
  const rejected: Array<Record<string, unknown>> = [
    { foo: 1 },
    { roleId: 123 },
    { roleId: "" },
    { roleId: "   " },
    { section: "all; roles" },
    { section: 1 },
    { section: null, roleId: "chief", extra: true },
  ];
  for (const args of rejected) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `应拒绝 ${JSON.stringify(args)}`);
  }
  assert.equal(calls.length, before, "非法参数必须在调用注入函数前拒绝");

  await tool.handler(call({ roleId: null, section: null }));
  assert.deepEqual(calls.at(-1), {}, "null 按未提供处理");
});

test("AC-2/AC-16 回执：ok/message 原样转达；抛错与畸形回执 fail-closed、不编造权限", async () => {
  const text = "# 治理权力矩阵\n- 角色A：unknown（boundary 解析失败：bad yaml）";
  const okTool = toolMap({ governanceMatrix: async () => receipt(true, text) }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
  assert.deepEqual(await okTool.handler(call({})), { ok: true, message: text });

  const degraded = "status: degraded\n- worker 段 unavailable（项目根不可读）";
  const failTool = toolMap({ governanceMatrix: async () => receipt(false, degraded) }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
  assert.deepEqual(await failTool.handler(call({})), { ok: false, message: degraded });
  assert.equal(/没有权限/.test((await failTool.handler(call({}))).message), false, "不得把不可用写成无权限");

  const throwing = toolMap({
    governanceMatrix: async () => {
      throw new Error("registry boom");
    },
  }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
  const thrown = await throwing.handler(call({}));
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /未完成/);
  assert.match(thrown.message, /registry boom/);
  assert.match(thrown.message, /不要推断任何权限/);

  const malformed = [
    async () => undefined,
    async () => ({ ok: true }),
    async () => ({ ok: "yes", message: "x" }),
    async () => ({ ok: true, message: "" }),
  ] as unknown as GovernanceMatrixFn[];
  for (const fn of malformed) {
    const tool = toolMap({ governanceMatrix: fn }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
    const result = await tool.handler(call({}));
    assert.equal(result.ok, false, "畸形回执必须 fail-closed");
    assert.match(result.message, /不要据此判断权限/);
  }
});

test("AC-16 工具结果只有 ok/message，不含 allowed/denied/批准/验收字段", async () => {
  const fn: GovernanceMatrixFn = async () => receipt(true, successText);
  const tool = toolMap({ governanceMatrix: fn }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
  const result = await tool.handler(call({}));
  assert.deepEqual(Object.keys(result).sort(), ["message", "ok"]);
  const parameters = describeTool(GOVERNANCE_MATRIX_TOOL_NAME).parameters as {
    properties: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(parameters.properties).sort(), ["roleId", "section"]);
});

test("AC-2 中止：已中止的调用不触达函数并如实返回未完成", async () => {
  let called = 0;
  const fn: GovernanceMatrixFn = async () => {
    called += 1;
    return receipt(true, successText);
  };
  const tool = toolMap({ governanceMatrix: fn }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler(call({}, { signal: controller.signal }));
  assert.equal(result.ok, false);
  assert.equal(called, 0, "中止调用不得触达矩阵函数");
  // 入口即中止：buildGovernedTools 统一包装返回「会话已中止，未执行」；调用中中止则本工具返回「未完成」。
  assert.match(result.message, /未执行|未完成/);
});

test("AC-2/AC-11 无副作用：工具调用前后临时目录文件树不变（不写盘/不写账本）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-governance-matrix-"));
  try {
    const before = await readdir(root);
    const fn: GovernanceMatrixFn = async () => receipt(true, successText);
    const tool = toolMap({ governanceMatrix: fn }).get(GOVERNANCE_MATRIX_TOOL_NAME)!;
    await tool.handler(call({}));
    await tool.handler(call({ roleId: "chief", section: "routing" }));
    const after = await readdir(root);
    assert.deepEqual(after, before);
    assert.deepEqual(before, [], "临时目录应保持为空（无 .ans/日志/账本）");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function adapterFactory(capture: (options: RuntimeProviderOptions) => void): RuntimeProviderFactory {
  return (options) => {
    registerControlledDisplayProfile(options);
    capture(options);
    return {
      async composeContext() {
        return { systemPrompt: "fixture" };
      },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        const session: RoleSession = {
          async prompt() {},
          events: () => queue.stream,
          async dispose() {
            queue.close();
          },
        };
        return session;
      },
    };
  };
}

const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });

test("AC-1/AC-2/AC-15 Service 透传：注入⇒工具存在；未注入⇒不存在；判断会话结构性无该工具；contextSections 透传/缺省不下发", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-governance-matrix-session-"));
  const captured: RuntimeProviderOptions[] = [];
  const factory = adapterFactory((options) => captured.push(options));
  const fn: GovernanceMatrixFn = async () => receipt(true, successText);
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      governanceMatrix: fn,
      contextSections: ["# 治理权力矩阵\nfixture section"],
      providerFactories: { claude: factory },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(GOVERNANCE_MATRIX_TOOL_NAME),
      true,
      "Service 必须透传 governance_matrix",
    );
    assert.deepEqual(captured[0]!.contextSections, ["# 治理权力矩阵\nfixture section"]);

    const plain = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      providerFactories: { claude: factory },
    }).bindRole(role());
    await plain.dispose();
    assert.equal(
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(GOVERNANCE_MATRIX_TOOL_NAME),
      false,
      "未注入时不得出现 governance_matrix",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(captured[1]!, "contextSections"),
      false,
      "未定义 contextSections 时不得下发该字段",
    );

    const governance = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      governanceMatrix: fn,
      governanceJudge: { projectRoot: root, report() {}, stats: stats() },
      providerFactories: { claude: factory },
    }).bindRole(role());
    await governance.dispose();
    assert.deepEqual(
      captured[2]!.tools.map((tool) => tool.name),
      ["judge_read_file", "judge_list_dir", "report_governance_judgement"],
      "治理判断会话结构性无 governance_matrix",
    );

    const shell = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      governanceMatrix: fn,
      shellJudge: { projectRoot: root, report() {}, stats: stats() },
      providerFactories: { claude: factory },
    }).bindRole(role());
    await shell.dispose();
    assert.deepEqual(
      captured[3]!.tools.map((tool) => tool.name),
      ["judge_read_file", "judge_list_dir", "report_shell_judgement"],
      "shell 判断会话结构性无 governance_matrix",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
