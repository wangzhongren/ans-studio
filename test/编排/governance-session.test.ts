// test/编排/governance-session.test.ts
// W2（2026-10-17）治理三权在编排层的接线（评审 §5.6/§5.7/§6.2/§十一 W2）。
//
// 覆盖：
//   ① `openGovernanceSession` 的 function 路由 / trio-single 校验 / 缺省角色；
//   ② 能力矩阵（注册表驱动）：dispatch/roleStatus/sessionTail/proposeRecovery/installSkill/installMcp/shell；
//   ③ 预授权目录与 forbiddenWritePaths 包装（三人越界写入被拒、拒绝文案指路）；
//   ④ `customerInput` 包装：cardKind 白名单、`customer.decision` 字段/证据、内存快照即时生效；
//   ⑤ 跨会话门禁：账本中的提案接受让 Convener 写 flow；派发五条在 run-role 中生效；
//   ⑥ `artifact.observed`（仅预授权目录、仅新增/变更）；
//   ⑦ 旧 single/su 行为逐字不变（能力、预授权、无治理账本写入）。
//
// 全部临时目录、假适配器；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openGovernanceSession, runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import {
  openRoleSession,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  governanceLedgerPath,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";
import { EXIT_OK, EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";
import { parseGovernArgs } from "../../src/common/编排/args.ts";
import { governCommand } from "../../src/interface/cli/govern.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  ToolCall,
  WriteGate,
} from "../../src/provider/pi/session.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-gov-session-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

const GOV_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
const GOV_BOUNDARY_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 项目治理产物：角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目文档",
  "  - kind: conditional-directory",
  "    path: .ans/",
  "    condition: project-init",
  "    root: project",
  "    purpose: 项目初始化产物",
  "",
].join("\n");

/** 旧 single 项目（su 路径）：项目治理边界 = 条件目录，行为与 W1 前逐字一致。 */
function singleProject(root: string): ProjectConfig {
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, "角色卡", "governance-boundary.yaml"), GOV_BOUNDARY_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: {
      path: GOV_BOUNDARY_REL,
      acceptance: { accepted: true, source: "test:single" },
    },
  };
}

/** trio 项目：`.ans` 显式 trio；注册表边界只需项目提供接受证据。 */
function trioProject(root: string): ProjectConfig {
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [],
    governanceBoundary: {
      path: GOV_BOUNDARY_REL,
      acceptance: { accepted: true, source: "test:trio" },
    },
  };
}

function withBuiltIn(project: ProjectConfig, roleId: string): ProjectConfig {
  return { ...project, builtInRoles: [roleId] };
}

/** 桩适配器：记录绑定的角色；立即 settled。 */
function okAdapter(bound?: { roleId?: string }): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(role): Promise<RoleSession> {
      if (bound !== undefined) bound.roleId = role.id;
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

const confirmAllow: CustomerInputFn = () => ({
  outcome: "answered",
  value: { confirmed: true },
  operatorId: "test-客户",
});

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured, bound: { roleId?: string } = {}) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    return okAdapter(bound);
  };
}

function entry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: new Date().toISOString(),
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    ...over,
  };
}

async function consume(handle: { events(): AsyncIterable<{ kind: string }> }): Promise<void> {
  for await (const _ev of handle.events()) {
    /* 消费到 settled */
  }
}

// —————————————————————— ① function 路由 / 校验 ——————————————————————

test("parseGovernArgs：--function 三权取值与非法值（CLI 不提供 liaison，AC21）", () => {
  for (const fn of ["proposal", "nomination", "schedule"] as const) {
    const parsed = parseGovernArgs(["govern", "--function", fn]);
    assert.equal(parsed.function, fn);
    assert.deepEqual(parsed.errors, []);
  }
  assert.equal(parseGovernArgs(["govern", "--function=nomination"]).function, "nomination");
  assert.equal(parseGovernArgs(["govern"]).function, undefined);
  const liaison = parseGovernArgs(["govern", "--function", "liaison"]);
  assert.equal(liaison.function, undefined);
  assert.ok(liaison.errors.some((e) => /仅桌面主入口提供/.test(e)), "liaison 显式拒绝并指路");
  assert.ok(parseGovernArgs(["govern", "--function", "bogus"]).errors.some((e) => /非法的 --function/.test(e)));
  assert.ok(parseGovernArgs(["govern", "--function"]).errors.some((e) => /缺少值/.test(e)));
});

test("governCommand：--role <内置治理角色> 选会话角色；与目标角色混用 → 用法错误", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root);
    const configSource = {
      kind: "ans" as const,
      path: join(root, ".ans", "project.json"),
      acceptance: project.governanceBoundary!.acceptance,
      pinPaths: [],
    };
    const bound = {} as { roleId?: string };
    const code = await governCommand(["govern", "--role", "convener"], {
      project,
      configSource,
      customerInput: confirmAllow,
      createAdapter: () => okAdapter(bound),
    });
    assert.equal(code, EXIT_OK);
    assert.equal(bound.roleId, "convener", "--role convener 应选择 Convener 会话");

    assert.equal(
      await governCommand(["govern", "--role", "A", "--role", "convener"], {
        project,
        configSource,
        createAdapter: () => okAdapter(),
      }),
      EXIT_USAGE,
    );
  });
});

test("openGovernanceSession：trio 缺省 rapporteur；--function 选 nominator/convener；显式 role 一致性校验", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root);
    assert.equal((await openGovernanceSession({ taskId: "T", project }, { createAdapter: () => okAdapter() })).governanceRoleId, "rapporteur");

    const nom = await openGovernanceSession(
      { taskId: "T", project, governanceFunction: "nomination" },
      { createAdapter: () => okAdapter() },
    );
    assert.equal(nom.governanceRoleId, "nominator");
    assert.equal(nom.governanceFunction, "nomination");
    await nom.dispose();

    const sch = await openGovernanceSession(
      { taskId: "T", project, governanceFunction: "schedule" },
      { createAdapter: () => okAdapter() },
    );
    assert.equal(sch.governanceRoleId, "convener");
    await sch.dispose();

    await assert.rejects(
      () =>
        openGovernanceSession(
          { taskId: "T", project, governanceRoleId: "convener", governanceFunction: "proposal" },
          { createAdapter: () => okAdapter() },
        ),
      /不一致/,
    );
  });
});

test("openGovernanceSession：single 传 --function / 三权角色 → 明确拒绝；缺省仍 su", async () => {
  await withRoot(async (root) => {
    const project = singleProject(root);
    const handle = await openGovernanceSession({ taskId: "T", project }, { createAdapter: () => okAdapter() });
    assert.equal(handle.governanceRoleId, "su");
    assert.equal(handle.governanceFunction, undefined);
    await handle.dispose();

    await assert.rejects(
      () => openGovernanceSession({ taskId: "T", project, governanceFunction: "proposal" }, { createAdapter: () => okAdapter() }),
      /旧治理模型/,
    );
    await assert.rejects(
      () => openGovernanceSession({ taskId: "T", project, governanceRoleId: "rapporteur" }, { createAdapter: () => okAdapter() }),
      /旧治理模型/,
    );
  });
});

test("默认提示词：trio 按 function 追加各自纪律（不写「已批准」）；single 保留旧文案；两套均含工程质量基线", async () => {
  await withRoot(async (root) => {
    const promptCapturing = () => {
      const captured: { prompt?: string } = {};
      const factory = (): RuntimeAdapter => ({
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(text: string): Promise<void> {
              captured.prompt = text;
            },
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "完成" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      });
      return { captured, factory };
    };

    const trio = trioProject(root);
    const expectations: Array<["liaison" | "proposal" | "nomination" | "schedule" | "verification", RegExp[]]> = [
      ["liaison", [/沟通权纪律（Lead \/ 主理/, /docs\/intents\//, /hand_off_intent/, /交接 ≠ 客户批准/, /intent-confirm/, /质量档位/, /原型档/]],
      ["proposal", [/提案权纪律（Draft \/ 提案/, /docs\/proposals\//, /cardKind=proposal/, /不拥有最终批准权/, /证据计划/, /工程质量基线/, /架构方案/, /架构影响分析/, /扩展点/, /模块分解与职责/]],
      ["nomination", [/提名权纪律（Crew \/ 组队/, /docs\/nominations\//, /appointment/, /提名 ≠ 任命/]],
      ["schedule", [/编排权纪律（Steward \/ 统筹/, /docs\/flows\//, /dispatch_task/, /flowId.*stepId/, /真实启动/, /演示/, /架构与边界/, /契约冻结/, /扩展点必须有覆盖步骤/]],
      ["verification", [/验收权纪律（Proof \/ 验收/, /docs\/verification\//, /cardKind=acceptance/, /验收 ≠ 批准/, /未被真实启动.*不得建议 accept/, /架构核对/, /模块边界与依赖方向未被破坏/, /schema\/API 版本与/]],
    ];
    for (const [fn, patterns] of expectations) {
      const { captured, factory } = promptCapturing();
      const result = await runGovernSession(
        { taskId: "T-PROMPT", project: trio, governanceFunction: fn, customerInput: confirmAllow },
        { createAdapter: factory },
      );
      assert.equal(result.code, EXIT_OK, fn);
      assert.ok(captured.prompt !== undefined);
      for (const pattern of patterns) assert.match(captured.prompt!, pattern, `${fn} 提示词`);
      assert.match(
        captured.prompt!,
        /工程质量基线（默认生产级；客户明确选原型档才可放宽）/,
        `${fn} 提示词必须含质量基线关键字`,
      );
      assert.match(
        captured.prompt!,
        /未真实运行不得建议验收通过/,
        `${fn} 提示词必须含「未真实运行不得建议验收通过」`,
      );
      assert.match(captured.prompt!, /架构与可扩展性：/, `${fn} 提示词基线必须含架构与可扩展性条`);
      assert.match(
        captured.prompt!,
        /架构与可扩展性要求（提案 \/ 流程 \/ 验收三阶段）/,
        `${fn} 提示词必须含架构与扩展性要求段`,
      );
      assert.match(captured.prompt!, /Draft（提案）[^\n]*「架构方案」/, `${fn} 提示词必须含 Draft 架构职责`);
      assert.match(captured.prompt!, /Steward（流程 \/ 派发）/, `${fn} 提示词必须含 Steward 架构职责`);
      assert.match(captured.prompt!, /Proof（验收）/, `${fn} 提示词必须含 Proof 架构职责`);
      assert.doesNotMatch(captured.prompt!, /已批准|已授权/, `${fn} 提示词不得写「已批准/已授权」`);
    }

    const { captured, factory } = promptCapturing();
    const single = await runGovernSession(
      { taskId: "T-PROMPT", project: singleProject(root), customerInput: confirmAllow },
      { createAdapter: factory },
    );
    assert.equal(single.code, EXIT_OK);
    assert.match(captured.prompt!, /以治理身份在\*\*项目治理边界\*\*内工作/, "single/su 旧文案逐字保留");
    assert.match(captured.prompt!, /docs\/su\/.*为预授权目录/, "su 预授权文案不变");
    assert.match(
      captured.prompt!,
      /工程质量基线（默认生产级；客户明确选原型档才可放宽）/,
      "single/su 提示词必须含质量基线关键字",
    );
    assert.match(
      captured.prompt!,
      /未真实运行不得建议验收通过/,
      "single/su 提示词必须含「未真实运行不得建议验收通过」",
    );
    assert.match(captured.prompt!, /意图阶段先与客户确认质量档位/, "single/su 阶段要求覆盖意图档位");
    assert.match(captured.prompt!, /架构与可扩展性：/, "single/su 基线必须含架构与可扩展性条");
    assert.match(
      captured.prompt!,
      /架构与可扩展性要求（提案 \/ 流程 \/ 验收三阶段）/,
      "single/su 提示词必须含架构与扩展性要求段",
    );
    assert.match(captured.prompt!, /Draft（提案）[^\n]*「架构方案」/, "single/su 必须含 Draft 架构职责");
    assert.match(captured.prompt!, /Steward（流程 \/ 派发）/, "single/su 必须含 Steward 架构职责");
    assert.match(captured.prompt!, /Proof（验收）/, "single/su 必须含 Proof 架构职责");
  });
});

test("标准工作流（2026-10-19 客户反馈）：trio 与 single/su 提示均含阶段流转/自动派发/Proof 标准复核流程", async () => {
  await withRoot(async (root) => {
    const promptCapturing = () => {
      const captured: { prompt?: string } = {};
      const factory = (): RuntimeAdapter => ({
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(text: string): Promise<void> {
              captured.prompt = text;
            },
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "完成" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      });
      return { captured, factory };
    };

    // 客户原话：「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」
    const required: Array<[RegExp, string]> = [
      [/标准工作流（阶段流转由应用负责）/, "标准工作流标题"],
      [/内置角色按标准工作流执行/, "内置角色按标准工作流执行"],
      [/流程状态唯一机器状态/, "流程状态唯一机器状态（YAML）"],
      [/docs\/flows\/<flowId>\.yaml`（同名 `\.md` 仅人读视图/, "YAML 唯一机器状态 + .md 仅人读视图"],
      [/显式写 `kind` \/ `evidence` \/ `supersedes`/, "显式 kind/evidence/supersedes"],
      [/保留 id `verification` \/ `acceptance`/, "保留验收 id"],
      [/客户不做内部调度/, "客户不做内部调度"],
      [/应用会在流程齐备[^\n]*后自动派发 Proof \/ 验收/, "流程齐备后自动派发 Proof"],
      [/不需要客户手动触发/, "不需要客户手动触发"],
      [/自动派发不是验收决定/, "自动派发不是验收决定"],
      [/Proof 的标准复核流程（独立核准是标准流程，不是客户手动转交）/, "Proof 标准复核流程标题"],
      [/用审批档 shell 跑测试/, "用审批档 shell 跑测试"],
      [
        /读证据[\s\S]*跑测试[\s\S]*真实启动演示[\s\S]*质量\/架构核对[\s\S]*验收卡/,
        "Proof 复核顺序（读证据 → 跑测试 → 真实启动演示 → 质量/架构核对 → 验收卡）",
      ],
    ];

    const trio = trioProject(root);
    for (const fn of ["liaison", "proposal", "nomination", "schedule", "verification"] as const) {
      const { captured, factory } = promptCapturing();
      const result = await runGovernSession(
        { taskId: "T-WORKFLOW", project: trio, governanceFunction: fn, customerInput: confirmAllow },
        { createAdapter: factory },
      );
      assert.equal(result.code, EXIT_OK, fn);
      assert.ok(captured.prompt !== undefined);
      for (const [pattern, label] of required) {
        assert.match(captured.prompt!, pattern, `${fn} 提示词：${label}`);
      }
      assert.doesNotMatch(
        captured.prompt!,
        /流程单写入 `docs\/flows\/<flowId>\.md`/,
        `${fn} 提示词不得再指示把流程单写入 .md（YAML 才是唯一机器状态）`,
      );
    }

    const { captured, factory } = promptCapturing();
    const single = await runGovernSession(
      { taskId: "T-WORKFLOW", project: singleProject(root), customerInput: confirmAllow },
      { createAdapter: factory },
    );
    assert.equal(single.code, EXIT_OK);
    assert.ok(captured.prompt !== undefined);
    for (const [pattern, label] of required) {
      assert.match(captured.prompt!, pattern, `single/su 提示词：${label}`);
    }
    assert.doesNotMatch(
      captured.prompt!,
      /流程单写入 `docs\/flows\/<flowId>\.md`/,
      "single/su 提示词不得再指示把流程单写入 .md（YAML 才是唯一机器状态）",
    );
  });
});

// —————————————————————— ② 能力矩阵 ——————————————————————

test("能力矩阵（注册表）：Rapporteur/Nominator/Convener/su 的工具能力与 shell 审批档", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root);
    const provide = {
      dispatchTask: () => ({ ok: true }),
      roleStatus: () => ({ ok: true, text: "su 状态" }),
      sessionTail: () => ({ ok: true, text: "尾部" }),
      proposeRecovery: () => ({ outcome: "declined" as const }),
      installSkill: async (payload: { roleId: string; name: string }) => ({
        ok: true as const,
        action: "installed" as const,
        roleId: payload.roleId,
        name: payload.name,
        path: `docs/skills/${payload.name}/SKILL.md`,
        digest: "0".repeat(64),
        effective: "next-session" as const,
      }),
      uninstallSkill: async (payload: { roleId: string; name: string }) => ({
        ok: true as const,
        action: "uninstalled" as const,
        roleId: payload.roleId,
        name: payload.name,
        path: `docs/skills/${payload.name}/SKILL.md`,
        digest: "0".repeat(64),
        effective: "next-session" as const,
      }),
      installMcp: async (payload: { roleId: string; name: string }) => ({
        ok: true as const,
        action: "installed" as const,
        roleId: payload.roleId,
        name: payload.name,
        path: `docs/mcp/${payload.name}.md`,
        digest: "0".repeat(64),
        effective: "next-session" as const,
      }),
      uninstallMcp: async (payload: { roleId: string; name: string }) => ({
        ok: true as const,
        action: "uninstalled" as const,
        roleId: payload.roleId,
        name: payload.name,
        path: `docs/mcp/${payload.name}.md`,
        digest: "0".repeat(64),
        effective: "next-session" as const,
      }),
      customerInput: (() => ({ outcome: "declined" as const })) as CustomerInputFn,
      shellOperatorOnly: { classifyShell, rules: defaultShellRules(), operatorChannel: () => ({ outcome: "deny" as const }) },
    };

    const r = {} as Captured;
    const rh = await openRoleSession(
      { roleId: "rapporteur", project: withBuiltIn(project, "rapporteur"), ...provide },
      { createAdapter: capturingFactory(r) },
    );
    await rh.dispose();
    assert.ok(r.caps?.customerInput, "三人都有客户确认通道");
    assert.equal(typeof r.caps?.shellGate, "function", "rapporteur（operator-approve）应 arm 审批档 shellGate");
    for (const key of ["dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "installSkill", "installMcp", "reportHandback"] as const) {
      assert.equal(r.caps?.[key], undefined, `rapporteur 不应注入 ${key}`);
    }

    const n = {} as Captured;
    const nh = await openRoleSession(
      { roleId: "nominator", project: withBuiltIn(project, "nominator"), ...provide },
      { createAdapter: capturingFactory(n) },
    );
    await nh.dispose();
    for (const key of ["installSkill", "uninstallSkill", "installMcp", "uninstallMcp"] as const) {
      assert.ok(n.caps?.[key], `nominator 应注入 ${key}`);
    }
    assert.equal(typeof n.caps?.shellGate, "function", "nominator（operator-approve）应 arm 审批档 shellGate");
    for (const key of ["dispatchTask", "roleStatus", "sessionTail", "proposeRecovery"] as const) {
      assert.equal(n.caps?.[key], undefined, `nominator 不应注入 ${key}`);
    }

    const c = {} as Captured;
    const ch = await openRoleSession(
      { roleId: "convener", project: withBuiltIn(project, "convener"), ...provide },
      { createAdapter: capturingFactory(c) },
    );
    await ch.dispose();
    for (const key of ["dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "shellGate"] as const) {
      assert.ok(c.caps?.[key], `convener 应注入 ${key}`);
    }
    for (const key of ["installSkill", "uninstallSkill", "installMcp", "uninstallMcp"] as const) {
      assert.equal(c.caps?.[key], undefined, `convener 不应注入 ${key}`);
    }

    const s = {} as Captured;
    const sh = await openRoleSession(
      {
        roleId: "su",
        project: singleProject(root),
        dispatchTask: provide.dispatchTask,
        roleStatus: provide.roleStatus,
        sessionTail: provide.sessionTail,
        proposeRecovery: provide.proposeRecovery,
        installSkill: provide.installSkill,
        installMcp: provide.installMcp,
        shellOperatorOnly: { classifyShell, rules: defaultShellRules(), operatorChannel: () => ({ outcome: "deny" }) },
      },
      { createAdapter: capturingFactory(s) },
    );
    await sh.dispose();
    for (const key of ["dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "installSkill", "installMcp", "shellGate"] as const) {
      assert.ok(s.caps?.[key], `su（single）应注入 ${key}（旧行为）`);
    }
  });
});

// 客户 2026-10-19 新规则：「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的
// 权限，只不过都要提交审批，按照原有的流程审批。」——注册表把五个内置治理角色与 su 统一为
// `shell: "operator-approve"`。本用例钉住执行层：审批档按**能力位**（而非角色 id）装配；能力位缺席
// （项目角色）时误传仍不 arm（既有守卫不放宽）。
test("shell 审批档（2026-10-19）：五个内置治理角色 operator-approve ⇒ 均 arm；项目角色误传 ⇒ 不 arm", async () => {
  await withRoot(async (root) => {
    const trio = trioProject(root);
    const shellOperatorOnly = {
      classifyShell,
      rules: defaultShellRules(),
      operatorChannel: () => ({ outcome: "deny" as const }),
    };

    for (const roleId of ["liaison", "rapporteur", "nominator", "convener", "verifier"] as const) {
      const captured = {} as Captured;
      const handle = await openRoleSession(
        { roleId, project: withBuiltIn(trio, roleId), shellOperatorOnly },
        { createAdapter: capturingFactory(captured) },
      );
      await handle.dispose();
      assert.equal(
        typeof captured.caps?.shellGate,
        "function",
        `${roleId}（operator-approve）应 arm 审批档 shellGate`,
      );
    }

    const suCaptured = {} as Captured;
    const suHandle = await openRoleSession(
      { roleId: "su", project: singleProject(root), shellOperatorOnly },
      { createAdapter: capturingFactory(suCaptured) },
    );
    await suHandle.dispose();
    assert.equal(typeof suCaptured.caps?.shellGate, "function", "su（operator-approve）应 arm 审批档 shellGate");

    // 项目角色（capabilities 缺席）误传审批档 ⇒ capability-denied，不 arm（防三层链被绕过，既有守卫）。
    mkdirSync(join(root, "角色卡", "X"), { recursive: true });
    writeFileSync(join(root, "角色卡", "X", "role-card.md"), "# 角色 X\n");
    writeFileSync(
      join(root, "角色卡", "X", "boundary.yaml"),
      "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试条目\n",
    );
    const projectRoleProject: ProjectConfig = {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      builtInRoles: [],
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:project-role" } },
    };
    const projectCaptured = {} as Captured;
    const projectHandle = await openRoleSession(
      { roleId: "X", project: projectRoleProject, shellOperatorOnly },
      { createAdapter: capturingFactory(projectCaptured) },
    );
    await projectHandle.dispose();
    assert.equal(projectCaptured.caps?.shellGate, undefined, "项目角色（能力位缺席）不得 arm 审批档");
  });
});

// —————————————————————— ③ 预授权 / 禁写 ——————————————————————

test("预授权：Rapporteur 可写 proposals/contracts/自身记录；提名/流程仍拒", async () => {
  await withRoot(async (root) => {
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: withBuiltIn(trioProject(root), "rapporteur"),
        customerInput: confirmAllow,
        autoRepin: false,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.gate!("docs/proposals/flow-a-v1.md").allowed, true);
      assert.equal(captured.gate!("docs/contracts/c-v1.md").allowed, true);
      assert.equal(captured.gate!("docs/governance/rapporteur/notes.md").allowed, true);
      assert.equal(captured.gate!("docs/nominations/flow-a-v1.md").allowed, false);
      assert.equal(captured.gate!("docs/flows/flow-a.md").allowed, false);
    } finally {
      await handle.dispose();
    }
  });
});

test("禁写：三人写 .ans/**、其他治理角色资料 → 拒绝且文案指路（先于 resolveWrite）", async () => {
  await withRoot(async (root) => {
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "nominator",
        project: withBuiltIn(trioProject(root), "nominator"),
        customerInput: confirmAllow,
        autoRepin: false,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const forbidden = captured.gate!("角色卡/rapporteur/role-card.md");
      assert.equal(forbidden.allowed, false);
      assert.match((forbidden as { reason: string }).reason, /提名官 Nominator/);

      const noAppointment = captured.gate!("角色卡/A/role-card.md");
      assert.equal(noAppointment.allowed, false);
      assert.match((noAppointment as { reason: string }).reason, /任命/);
    } finally {
      await handle.dispose();
    }

    const convener = {} as Captured;
    const ch = await openRoleSession(
      { roleId: "convener", project: withBuiltIn(trioProject(root), "convener"), customerInput: confirmAllow, autoRepin: false },
      { createAdapter: capturingFactory(convener) },
    );
    try {
      const ans = convener.gate!(".ans/project.json");
      assert.equal(ans.allowed, false);
      assert.match((ans as { reason: string }).reason, /只能由应用写/);
    } finally {
      await ch.dispose();
    }
  });
});

// —————————————————————— ④ customer.decision ——————————————————————

test("customer.decision：提案卡 accept → 账本字段/证据齐全（Rapporteur）", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "rapporteur");
    const script: ToolCall[] = [
      {
        name: "request_choice",
        args: {
          title: "提案决定",
          flowId: "flow-a",
          cardKind: "proposal",
          options: [
            { id: "accept", label: "接受" },
            { id: "revise", label: "要求修改" },
            { id: "reject", label: "拒绝" },
          ],
        },
      },
    ];
    const customerInput: CustomerInputFn = (req) =>
      req.kind === "choice"
        ? { outcome: "answered", value: { selected: ["accept"] }, operatorId: "客户" }
        : { outcome: "declined" };
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        customerInput,
        autoRepin: false,
      },
      {
        createAdapter: (gate, caps) =>
          createFakeRuntimeAdapter({ gate, script, projectRoot: root, customerInput: caps?.customerInput }),
      },
    );
    try {
      await handle.send("开始");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);

    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 1);

    const proposal = entries[0];
    assert.equal(proposal.kind, "customer.decision");
    assert.equal(proposal.actorRoleId, "rapporteur");
    assert.equal(proposal.power, "proposal");
    assert.equal(proposal.flowId, "flow-a");
    assert.equal(proposal.decisionKind, "proposal-accept");
    assert.equal(proposal.customerDecision, "accepted");
    assert.equal(proposal.decisionEvidence?.kind, "customer-input");
    assert.equal(proposal.messageSummary, "提案决定");
  });
});

test("customer.decision：任命卡多选 → targetRoleIds（Nominator）", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "nominator");
    const script: ToolCall[] = [
      {
        name: "request_choice",
        args: {
          title: "任命决定",
          flowId: "flow-a",
          cardKind: "appointment",
          multiple: true,
          options: [
            { id: "A", label: "角色 A" },
            { id: "B", label: "角色 B" },
          ],
        },
      },
    ];
    const customerInput: CustomerInputFn = () => ({
      outcome: "answered",
      value: { selected: ["A", "B"] },
      operatorId: "客户",
    });
    const handle = await openRoleSession(
      { roleId: "nominator", project, customerInput, autoRepin: false },
      {
        createAdapter: (gate, caps) =>
          createFakeRuntimeAdapter({ gate, script, projectRoot: root, customerInput: caps?.customerInput }),
      },
    );
    try {
      await handle.send("开始");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);

    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].decisionKind, "appointment");
    assert.equal(entries[0].customerDecision, "appointed");
    assert.deepEqual(entries[0].targetRoleIds, ["A", "B"]);
    assert.equal(entries[0].power, "nomination");
  });
});

test("customerInput 白名单：Rapporteur 发 appointment 卡 → 不弹卡、不调用客户通道、不写账本", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "rapporteur");
    let called = 0;
    const customerInput: CustomerInputFn = () => {
      called += 1;
      return { outcome: "answered", value: { selected: ["A"] } };
    };
    const script: ToolCall[] = [
      {
        name: "request_choice",
        args: {
          title: "越权卡",
          flowId: "flow-a",
          cardKind: "appointment",
          options: [{ id: "A", label: "角色 A" }],
        },
      },
    ];
    const handle = await openRoleSession(
      { roleId: "rapporteur", project, customerInput, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, customerInput: caps?.customerInput }) },
    );
    try {
      await handle.send("发卡");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(called, 0, "越权 cardKind 不得弹卡");
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0, "未向客户发卡 → 无客户决定");
  });
});

test("customerInput 白名单（五人）：Liaison 拒 proposal；Draft 拒 acceptance", async () => {
  await withRoot(async (root) => {
    // Liaison（Lead / 主理）只能发 intent-confirm；发 proposal 越权。
    let liaisonCalled = 0;
    const liaisonInput: CustomerInputFn = () => {
      liaisonCalled += 1;
      return { outcome: "answered", value: { selected: ["accept"] } };
    };
    const liaisonScript: ToolCall[] = [{
      name: "request_choice",
      args: {
        title: "越权提案卡",
        flowId: "flow-a",
        cardKind: "proposal",
        options: [{ id: "accept", label: "接受" }, { id: "revise", label: "要求修改" }],
      },
    }];
    const liaison = await openRoleSession(
      { roleId: "liaison", project: withBuiltIn(trioProject(root), "liaison"), customerInput: liaisonInput, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script: liaisonScript, projectRoot: root, customerInput: caps?.customerInput }) },
    );
    try {
      await liaison.send("发卡");
      await consume(liaison);
    } finally {
      await liaison.dispose();
    }
    assert.equal(liaisonCalled, 0, "Liaison 越权 cardKind 不得弹卡");

    // Rapporteur（Draft / 提案）不再发 acceptance（已移交 verifier）。
    let draftCalled = 0;
    const draftInput: CustomerInputFn = () => {
      draftCalled += 1;
      return { outcome: "answered", value: { selected: ["accept"] } };
    };
    const draftScript: ToolCall[] = [{
      name: "request_choice",
      args: {
        title: "越权验收卡",
        flowId: "flow-a",
        cardKind: "acceptance",
        options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
      },
    }];
    const draft = await openRoleSession(
      { roleId: "rapporteur", project: withBuiltIn(trioProject(root), "rapporteur"), customerInput: draftInput, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script: draftScript, projectRoot: root, customerInput: caps?.customerInput }) },
    );
    try {
      await draft.send("发卡");
      await consume(draft);
    } finally {
      await draft.dispose();
    }
    assert.equal(draftCalled, 0, "Draft 发 acceptance 不得弹卡");

    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0, "越权卡不产生客户决定");
  });
});

test("customer.decision：intent-confirm 四分类（confirm/revise/未知/多选）", async () => {
  await withRoot(async (root) => {
    const cases: Array<{ selected: string[]; decisionKind: string; customerDecision: string }> = [
      { selected: ["confirm"], decisionKind: "intent-confirm", customerDecision: "accepted" },
      { selected: ["revise"], decisionKind: "intent-confirm", customerDecision: "changes-requested" },
      { selected: ["other"], decisionKind: "unclassified", customerDecision: "none" },
      { selected: ["confirm", "revise"], decisionKind: "unclassified", customerDecision: "none" },
    ];
    for (const [index, item] of cases.entries()) {
      const flowId = `flow-${index}`;
      const customerInput: CustomerInputFn = () => ({
        outcome: "answered",
        value: { selected: item.selected },
        operatorId: "客户",
      });
      const script: ToolCall[] = [{
        name: "request_choice",
        args: {
          title: `需求确认-${index}`,
          flowId,
          cardKind: "intent-confirm",
          options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "需修改" }],
        },
      }];
      const handle = await openRoleSession(
        { roleId: "liaison", project: withBuiltIn(trioProject(root), "liaison"), customerInput, autoRepin: false },
        { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, projectRoot: root, customerInput: caps?.customerInput }) },
      );
      try {
        await handle.send("确认需求");
        await consume(handle);
      } finally {
        await handle.dispose();
      }
      await flushGovernanceLedger(root);
      const { entries } = await readGovernanceLedger(root);
      const entry = entries[entries.length - 1]!;
      assert.equal(entry.flowId, flowId, `case ${index}`);
      assert.equal(entry.decisionKind, item.decisionKind, `case ${index}`);
      assert.equal(entry.customerDecision, item.customerDecision, `case ${index}`);
      assert.equal(entry.power, "liaison", `case ${index}`);
      assert.equal(entry.actorRoleId, "liaison", `case ${index}`);
    }
  });
});

test("intent-confirm 结算：customerInput 返回时账本已落盘（hand_off_intent 紧随其后的竞态）", async () => {
  await withRoot(async (root) => {
    const captured = {} as Captured;
    const customerInput: CustomerInputFn = () => ({
      outcome: "answered",
      value: { selected: ["confirm"] },
      operatorId: "客户",
    });
    const handle = await openRoleSession(
      { roleId: "liaison", project: withBuiltIn(trioProject(root), "liaison"), customerInput, autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "需求确认",
        options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "需修改" }],
        flowId: "flow-a",
        cardKind: "intent-confirm",
      });
      assert.equal(out?.outcome, "answered");
      // **不调用 flush**：返回时追加已完成，校验器紧接着读磁盘即可看到该决定。
      const { entries, errors } = await readGovernanceLedger(root);
      assert.deepEqual(errors, []);
      const confirm = entries.find((entry) => entry.kind === "customer.decision");
      assert.ok(confirm, "customerInput 返回时账本已有 intent-confirm 决定");
      assert.equal(confirm.decisionKind, "intent-confirm");
      assert.equal(confirm.customerDecision, "accepted");
    } finally {
      await handle.dispose();
    }
  });
});

test("无 cardKind 的普通客户选择/确认不写治理账本（真机账本污染回归）", async () => {
  await withRoot(async (root) => {
    const captured = {} as Captured;
    const customerInput: CustomerInputFn = (req) =>
      req.kind === "confirm"
        ? { outcome: "answered", value: { confirmed: true }, operatorId: "客户" }
        : { outcome: "answered", value: { selected: ["A"] }, operatorId: "客户" };
    const handle = await openRoleSession(
      { roleId: "liaison", project: withBuiltIn(trioProject(root), "liaison"), customerInput, autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      // 普通选择卡（无 cardKind）：Lead 问「怎么调整」。
      await captured.caps!.customerInput!({
        kind: "choice",
        title: "怎么调整",
        options: [{ id: "A", label: "方案 A" }],
        flowId: "flow-a",
      });
      // 普通确认卡（无 cardKind）：写意图文件前的确认。
      await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写意图文件",
        preview: "docs/intents/intent-a.md",
        flowId: "flow-a",
      });
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0, "无 cardKind ⇒ 不写 customer.decision（避免 unclassified 污染）");
  });
});

test("customer.decision：Proof / 验收（verifier）可发 acceptance，power=acceptance", async () => {
  await withRoot(async (root) => {
    const script: ToolCall[] = [{
      name: "request_choice",
      args: {
        title: "验收决定",
        flowId: "flow-a",
        cardKind: "acceptance",
        options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
      },
    }];
    let called = 0;
    const customerInput: CustomerInputFn = () => {
      called += 1;
      return { outcome: "answered", value: { selected: ["accept"] }, operatorId: "客户" };
    };
    const handle = await openRoleSession(
      { roleId: "verifier", project: withBuiltIn(trioProject(root), "verifier"), customerInput, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, projectRoot: root, customerInput: caps?.customerInput }) },
    );
    try {
      await handle.send("验收");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(called, 1, "verifier 的 acceptance 卡允许弹给客户");
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.actorRoleId, "verifier");
    assert.equal(entries[0]!.power, "acceptance");
    assert.equal(entries[0]!.decisionKind, "acceptance");
    assert.equal(entries[0]!.customerDecision, "accepted");
  });
});

// —————————————————————— ⑤ 跨会话门禁 / 派发 ——————————————————————

test("跨会话：账本中提案已接受 → Convener 写 docs/flows/<flowId>.md 放行", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "convener");
    await appendGovernanceLedger(root, entry({ decisionKind: "proposal-accept", customerDecision: "accepted" }));
    await flushGovernanceLedger(root);

    const script: ToolCall[] = [
      {
        name: "request_confirmation",
        args: {
          title: "写流程单",
          flowId: "flow-a",
          cardKind: "schedule-write",
          preview: "将写出：`docs/flows/flow-a.md`\n\n## docs/flows/flow-a.md\n# 流程 flow-a\n\n| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n",
        },
      },
      {
        name: "write_file",
        args: {
          path: "docs/flows/flow-a.md",
          content: "# 流程 flow-a\n\n| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n",
        },
      },
    ];
    const handle = await openRoleSession(
      { roleId: "convener", project, customerInput: confirmAllow, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, writeRoot: root, customerInput: caps?.customerInput }) },
    );
    try {
      await handle.send("写流程");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(existsSync(join(root, "docs", "flows", "flow-a.md")), true);
  });
});

test("账本快照在 send 开始时刷新：open 后新落账的提案接受在下一次 send 生效", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "convener");
    const script: ToolCall[] = [
      {
        name: "request_confirmation",
        args: {
          title: "写流程单",
          flowId: "flow-a",
          cardKind: "schedule-write",
          preview: "将写出：`docs/flows/flow-a.md`\n\n## docs/flows/flow-a.md\n# 流程 flow-a\n\n| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n",
        },
      },
      {
        name: "write_file",
        args: { path: "docs/flows/flow-a.md", content: "# flow-a\n\n| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n" },
      },
    ];
    const handle = await openRoleSession(
      { roleId: "convener", project, customerInput: confirmAllow, autoRepin: false },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, writeRoot: root, customerInput: caps?.customerInput }) },
    );
    try {
      // open 之后、send 之前落账（模拟另一会话刚作出的客户决定）。
      await appendGovernanceLedger(root, entry({ decisionKind: "proposal-accept", customerDecision: "accepted" }));
      await flushGovernanceLedger(root);
      await handle.send("写流程");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(existsSync(join(root, "docs", "flows", "flow-a.md")), true, "send 刷新快照后应放行");
  });
});

test("派发门禁：Convener 未获提案接受 → dispatch_task 拒投、前端路由不被调用", async () => {
  await withRoot(async (root) => {
    mkdirSync(join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      join(root, "docs", "flows", "flow-a.md"),
      "| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n",
    );
    let dispatched = 0;
    const script: ToolCall[] = [
      { name: "dispatch_task", args: { roleId: "A", task: "实现", flowId: "flow-a", stepId: "impl" } },
    ];
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: withBuiltIn(trioProject(root), "convener"),
        dispatchTask: () => {
          dispatched += 1;
          return { ok: true };
        },
        autoRepin: false,
      },
      { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, dispatchTask: caps?.dispatchTask }) },
    );
    try {
      await handle.send("派发");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(dispatched, 0, "未获客户接受的提案 → 门禁拒投，不进入前端路由");
  });
});

test("派发门禁：提案接受 + 任命 + 步骤 + 未派发 → 放行到前端路由；重复派发拒", async () => {
  await withRoot(async (root) => {
    mkdirSync(join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      join(root, "docs", "flows", "flow-a.md"),
      "| 步骤 | 主人 | 状态 |\n| --- | --- | --- |\n| impl | 实现者 | pending |\n",
    );
    mkdirSync(join(root, "角色卡", "A"), { recursive: true });
    writeFileSync(join(root, "角色卡", "A", "role-card.md"), "# A\n");
    await appendGovernanceLedger(root, entry({ decisionKind: "proposal-accept", customerDecision: "accepted" }));
    await appendGovernanceLedger(
      root,
      entry({
        actorRoleId: "nominator",
        power: "nomination",
        decisionKind: "appointment",
        customerDecision: "appointed",
        targetRoleIds: ["A"],
      }),
    );
    await flushGovernanceLedger(root);

    let dispatched = 0;
    const script: ToolCall[] = [
      { name: "dispatch_task", args: { roleId: "A", task: "实现", flowId: "flow-a", stepId: "impl" } },
    ];
    const make = () =>
      openRoleSession(
        {
          roleId: "convener",
          project: withBuiltIn(trioProject(root), "convener"),
          dispatchTask: () => {
            dispatched += 1;
            return { ok: true };
          },
          autoRepin: false,
        },
        { createAdapter: (gate, caps) => createFakeRuntimeAdapter({ gate, script, dispatchTask: caps?.dispatchTask }) },
      );

    const first = await make();
    try {
      await first.send("派发");
      await consume(first);
    } finally {
      await first.dispose();
    }
    assert.equal(dispatched, 1, "满足五条的派发应进入前端路由");

    // 模拟前端在入队成功后写 `dispatch.accepted`（W3 桌面职责；此处只钉编排侧去重）。
    await appendGovernanceLedger(
      root,
      entry({
        kind: "dispatch.accepted",
        actorRoleId: "convener",
        power: "schedule",
        stepId: "impl",
        targetRoleId: "A",
      }),
    );
    await flushGovernanceLedger(root);

    const second = await make();
    try {
      await second.send("再次派发");
      await consume(second);
    } finally {
      await second.dispose();
    }
    assert.equal(dispatched, 1, "同一 flowId+stepId 重复派发应被门禁去重");
  });
});

// —————————————————————— ⑥ artifact.observed ——————————————————————

test("artifact.observed：内置角色 settle 后只记预授权目录内新增/变更的 .md（应用算 sha256）", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "rapporteur");
    const script: ToolCall[] = [
      { name: "write_file", args: { path: "docs/proposals/flow-a-v1.md", content: "# 提案 v1\n" } },
    ];
    const handle = await openRoleSession(
      { roleId: "rapporteur", project, autoRepin: false },
      { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: root }) },
    );
    try {
      await handle.send("写提案");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);

    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    const observed = entries.filter((e) => e.kind === "artifact.observed");
    assert.equal(observed.length, 1);
    assert.equal(observed[0].actorRoleId, "rapporteur");
    assert.equal(observed[0].power, "proposal");
    assert.equal(observed[0].artifactPath, "docs/proposals/flow-a-v1.md");
    assert.equal(observed[0].flowId, "flow-a");
    assert.equal(observed[0].artifactVersion, 1);
    assert.match(observed[0].artifactSha256 ?? "", /^[0-9a-f]{64}$/);
  });
});

// —————————————————————— ⑦ 旧 single 行为 ——————————————————————

test("旧 single：su 预授权四棵、确认后写角色卡、能力不变；不写治理账本", async () => {
  await withRoot(async (root) => {
    const project = singleProject(root);
    const captured = {} as Captured;
    const script: ToolCall[] = [
      {
        name: "request_confirmation",
        args: { title: "建角色 X", preview: "将写出：`角色卡/X/role-card.md`\n\n## 角色卡/X/role-card.md\n# 角色：X\n" },
      },
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
    ];
    const handle = await openRoleSession(
      {
        roleId: "su",
        project,
        customerInput: confirmAllow,
        dispatchTask: () => undefined,
        autoRepin: false,
      },
      {
        createAdapter: (gate, caps) => {
          captured.gate = gate;
          captured.caps = caps;
          return createFakeRuntimeAdapter({ gate, script, writeRoot: root, customerInput: caps?.customerInput });
        },
      },
    );
    try {
      assert.equal(captured.gate!("docs/su/notes.md").allowed, true, "su 预授权 docs/su 可写");
      assert.equal(captured.gate!("docs/contracts/c.md").allowed, true);
      assert.equal(captured.gate!("docs/skills/s/SKILL.md").allowed, true);
      assert.equal(captured.gate!("docs/mcp/m.md").allowed, true);
      await handle.send("建角色");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    assert.equal(existsSync(join(root, "角色卡", "X", "role-card.md")), true);
    assert.equal(existsSync(governanceLedgerPath(root)), false, "single/su 不参与治理账本（旧项目零新副作用）");
    assert.ok(captured.caps?.dispatchTask, "su 旧能力保持");
  });
});

test("旧 single：runRole 一次性路径的失败码不受影响（非项目角色仍用法错误）", async () => {
  // 仅确认开放域未因 W2 改变：runRole 不允许内置治理角色（既有行为）。
  const { runRole } = await import("../../src/pipeline/orchestration/run-role.ts");
  const result = await runRole(
    { roleId: "su", taskId: "T", project: { projectRoot: process.cwd(), skillRoot: process.cwd(), roles: {}, builtInRoles: ["su"] } },
    { createAdapter: () => okAdapter() },
  );
  assert.notEqual(result.code, EXIT_OK);
});
