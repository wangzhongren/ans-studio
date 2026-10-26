// test/编排/decision-card.test.ts
// 2026-10-26 客户新增 decision 卡：编排分类（`material-choice`）与账本接入。
//
// 覆盖：
//   ① 统筹（convener）可发 decision 卡：恰好选中一个**卡上选项** → `customer.decision{
//      decisionKind:"material-choice", customerDecision:"accepted", selectedOptions:[选中项]}`，
//      `power=schedule`、`decisionEvidence.kind:"customer-input"`；不写 `targetRoleIds`（不伪装成任命）；
//   ② Lead（liaison）与其余内置角色（rapporteur/nominator/verifier）不可发：越权在触达客户前
//      `declined`，客户通道零调用、账本零写入；
//   ③ 多选 / 空选 / 未知选项 → `unclassified/none`（fail-closed）；
//   ④ 不影响 proposal/appointment/acceptance/gate：`material-choice` 不满足写流程门/任命写入门、
//      不进入 `latestAcceptanceDecision`、不能充当 flow 的 `customer-decision` 证据；既有接受决定
//      不被它覆盖（旧卡种零回归）；
//   ⑤ 账本字段向后兼容：`selectedOptions` 可选、读取/写入校验接受（坏字段不被误判）。
//
// 全部临时目录、假适配器；不读 `.env`、不跑真实模型/凭据/网络。
//
// 2026-10-26 运行时核心已交付 `cardKind:"decision"` 与选项 `recommended` 字段；本文件同时覆盖
// 判断 agent（「替我决策」）侧的合法 decision 分支：按唯一推荐项代批、留审计，不回落 unknown/manual。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openRoleSession,
  validateDecisionCardRequest,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";
import { evaluateGovernanceGate } from "../../src/common/编排/governance-gate.ts";
import {
  evaluateFlowCompletion,
  latestAcceptanceDecision,
  latestCustomerDecision,
  parseFlowStateYaml,
} from "../../src/common/编排/flow-state.ts";
import {
  evaluateGovernanceJudgeVerdict,
  governanceJudgeAuditFromOutcome,
} from "../../src/common/编排/governance-judge-verdict.ts";
import { requiredArtifactPaths } from "../../src/common/编排/governance-judge-facts.ts";
import { buildDecisionEvidencePacket } from "../../src/common/编排/governance-judge-evidence.ts";
import {
  buildGovernanceJudgePrompt,
  buildGovernanceJudgeSystemPrompt,
} from "../../src/common/编排/governance-judge-prompt.ts";
import {
  configureDiagnostics,
  disposeDiagnostics,
  flushDiagnostics,
} from "../../src/common/shared/diagnostics.ts";
import type {
  CustomerInputFn,
  CustomerInputRequest,
  GovernanceJudgeRequest,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-decision-card-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
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
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:trio" },
    },
  };
}

function withBuiltIn(project: ProjectConfig, roleId: string): ProjectConfig {
  return { ...project, builtInRoles: [roleId] };
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

/** 旧 single 项目（su 路径）：decision 卡不得由 single/su 发出。 */
function singleProject(root: string): ProjectConfig {
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, "角色卡", "governance-boundary.yaml"), GOV_BOUNDARY_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: { path: GOV_BOUNDARY_REL, acceptance: { accepted: true, source: "test:single" } },
  };
}

/** 项目角色项目（decision 卡不得由项目角色发出）。 */
function projectRoleProject(root: string, roleId: string, file: string): ProjectConfig {
  const dir = join(root, "角色卡", roleId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), `# 角色 ${roleId}\n`);
  writeFileSync(
    join(dir, "boundary.yaml"),
    `role: ${roleId}\nentries:\n  - kind: file\n    path: ${file}\n    purpose: 测试条目\n`,
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { [roleId]: { card: `角色卡/${roleId}/role-card.md`, boundary: `角色卡/${roleId}/boundary.yaml` } },
    builtInRoles: [],
    governanceBoundary: { path: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: true, source: "test:project-role" } },
  };
}

/** 团队计划（Convener 任命卡守卫用）：frontmatter 推荐集 + 角色行。 */
function seedTeamPlan(root: string, recommended: readonly string[], flowId = "flow-a"): void {
  const abs = join(root, "docs", "scheduling", `${flowId}-team-v1.md`);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(
    abs,
    [
      "---",
      `flowId: ${flowId}`,
      "version: 1",
      "status: draft",
      "riskTier: T3",
      `recommended: [${recommended.join(", ")}]`,
      "---",
      "",
      `# 团队计划：${flowId}`,
      "",
      "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...recommended.map((id) => `| ${id} | existing | 实现 ${id} | 具备 ${id} 能力 | src/${id}/ | 无 | 组 A | not-applicable |`),
      "",
    ].join("\n"),
    "utf8",
  );
}

/** 桩适配器：立即 settled（本文件不驱动轮次，只经 caps.customerInput 调用包装器）。 */
function okAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
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

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    return okAdapter();
  };
}

const DECISION_OPTIONS = [
  { id: "option-a", label: "方案 A（推荐）", recommended: true },
  { id: "option-b", label: "方案 B" },
];

/** 仅一个 pending acceptance 步骤的最小 flow：用于断言收尾门不被未结算决定挡住。 */
const ACCEPTANCE_ONLY_FLOW_YAML = [
  "flowId: flow-a",
  "version: 1",
  "qualityTier: production",
  "status: in-progress",
  "steps:",
  "  - id: verification",
  "    title: 独立复核",
  "    owner: verifier",
  "    kind: acceptance",
  "    status: pending",
  "",
].join("\n");

function assertFlowCompletionNotBlocked(root: string, ledgerInput: { entries: GovernanceLedgerEntry[]; errors: string[] }): void {
  const parsed = parseFlowStateYaml(ACCEPTANCE_ONLY_FLOW_YAML, "flow-a");
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.deepEqual(
    evaluateFlowCompletion(parsed.flow, ledgerInput),
    { ready: true },
    "flow 不得因 decision 卡尝试留下未结算决定而无法收尾",
  );
}

/** 构造 decision 卡请求（运行时核心已在 Model 契约登记 `cardKind:"decision"` 与 `recommended`）。 */
function decisionCard(over: {
  title?: string;
  flowId?: string;
  options?: Array<{ id: string; label: string; recommended?: boolean }>;
} = {}): CustomerInputRequest {
  return {
    kind: "choice",
    title: over.title ?? "事务性选择",
    flowId: over.flowId ?? "flow-a",
    cardKind: "decision",
    options: over.options ?? DECISION_OPTIONS,
  };
}

/** 判断 agent 的直接请求夹具（与 run-role 计算的 judgeContext 同形；不驱动模型）。 */
function judgeRequest(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "decision",
    roleId: "convener",
    projectRoot: "",
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    card: decisionCard(),
    facts: {
      governanceModel: "trio",
      flowId: "flow-a",
      ledgerErrors: 0,
      unresolvedClarificationCount: 0,
      latestDecisionKinds: [],
    },
    at: new Date().toISOString(),
    ...over,
  };
}

async function openCapturingWithProject(
  roleId: string,
  project: ProjectConfig,
  raw: CustomerInputFn,
): Promise<{ handle: Awaited<ReturnType<typeof openRoleSession>>; captured: Captured }> {
  const captured: Captured = {};
  const handle = await openRoleSession(
    { roleId, project, customerInput: raw, autoRepin: false },
    { createAdapter: capturingFactory(captured) },
  );
  return { handle, captured };
}

async function openCapturing(
  root: string,
  roleId: string,
  raw: CustomerInputFn,
): Promise<{ handle: Awaited<ReturnType<typeof openRoleSession>>; captured: Captured }> {
  return openCapturingWithProject(roleId, withBuiltIn(trioProject(root), roleId), raw);
}

function ledgerEntry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: new Date().toISOString(),
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    ...over,
  };
}

/**
 * 等账本出现满足条件的条目：除 intent-confirm 外的卡 `recordCustomerDecision` 是**非阻塞**落盘
 * （`void recorded`），直接调用 `caps.customerInput` 后立刻读盘会与 append 的异步前置（物证扫描）竞态。
 * 循环 flush + 短等，确定性等到条目出现或超时。
 */
async function waitForLedgerEntry(
  root: string,
  predicate: (entry: GovernanceLedgerEntry) => boolean,
  timeoutMs = 2000,
): Promise<GovernanceLedgerEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    const found = entries.find(predicate);
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error("等待账本条目超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// —————————————————————— ① 统筹可发；选中一个 → material-choice ——————————————————————

test("decision 卡：统筹恰好选中一个卡上选项 → customer.decision{material-choice, accepted, selectedOptions}", async () => {
  await withRoot(async (root) => {
    const raw: CustomerInputFn = () => ({
      outcome: "answered",
      value: { selected: ["option-b"] },
      operatorId: "客户",
    });
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const out = await captured.caps!.customerInput!(decisionCard(), {
        toolCallId: "call-decision-1",
        turnId: "turn-1",
      });
      assert.equal(out?.outcome, "answered", "卡片已呈现给客户并作答（不是越权拒绝）");
      if (out?.outcome !== "answered") return;
      assert.deepEqual(out.value.selected, ["option-b"], "选中项原样回传（tool 回执/会话可见）");
      // 非 intent-confirm 卡不阻塞返回；确定性等账本追加落盘（append 前置含物证扫描）。
      const entry = await waitForLedgerEntry(root, (candidate) => candidate.kind === "customer.decision");
      const snapshot = await readGovernanceLedger(root);
      assert.deepEqual(snapshot.errors, []);
      assert.equal(snapshot.entries.length, 1);

      assert.equal(entry.kind, "customer.decision");
      assert.equal(entry.actorRoleId, "convener");
      assert.equal(entry.power, "schedule", "power = 发起角色职能（Convener=schedule），不是客户/验收");
      assert.equal(entry.flowId, "flow-a");
      assert.equal(entry.decisionKind, "material-choice");
      assert.equal(entry.customerDecision, "accepted");
      assert.deepEqual(entry.selectedOptions, ["option-b"], "只记选中选项 id（审计）");
      assert.equal(entry.targetRoleIds, undefined, "不写 targetRoleIds（不伪装成任命）");
      assert.equal(entry.decisionEvidence?.kind, "customer-input");
      assert.equal(entry.decisionEvidence?.toolCallId, "call-decision-1");
      assert.equal(entry.decisionEvidence?.turnId, "turn-1");
      assert.equal(entry.messageSummary, "事务性选择");
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————————————— ② 仅统筹可发（Lead/其余内置角色拒绝） ——————————————————————

test("decision 卡：Lead 与其余内置角色不可发 —— 不弹卡、不写账本", async () => {
  await withRoot(async (root) => {
    for (const roleId of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
      let rawCalls = 0;
      const raw: CustomerInputFn = () => {
        rawCalls += 1;
        return { outcome: "answered", value: { selected: ["option-a"] } };
      };
      const { handle, captured } = await openCapturing(root, roleId, raw);
      try {
        const out = await captured.caps!.customerInput!(decisionCard());
        assert.equal(out?.outcome, "declined", `${roleId} 发 decision 卡必须被拒`);
        assert.equal((out as { notPresented?: unknown }).notPresented, true, `${roleId} 卡片从未呈现`);
        assert.match(
          (out as { reason?: string }).reason ?? "",
          /decision 卡只能由统筹\/Steward/,
          `${roleId} 的拒绝文案应指出仅统筹可发`,
        );
        assert.equal(rawCalls, 0, `${roleId} 的越权卡不得触达客户通道`);
      } finally {
        await handle.dispose();
      }
    }
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0, "越权 decision 卡不产生任何客户决定");
  });
});

test("decision 卡：Liaison 仍只允许 intent-confirm（Lead 白名单未被放宽）", async () => {
  await withRoot(async (root) => {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["confirm"] } };
    };
    const { handle, captured } = await openCapturing(root, "liaison", raw);
    try {
      const out = await captured.caps!.customerInput!(decisionCard());
      assert.equal(out?.outcome, "declined");
      assert.equal(rawCalls, 0);
    } finally {
      await handle.dispose();
    }
  });
});

test("decision 卡安全缺口：convener 缺 cardKind + 含 recommended ⇒ 不默认 appointment、不写任命账本", async () => {
  await withRoot(async (root) => {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["option-a"] } };
    };
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "漏传卡种的材料性选择",
        flowId: "flow-a",
        // 无 cardKind；decision 形状（任一 recommended）**不得**被默认成 appointment。
        options: [
          { id: "option-a", label: "方案 A（推荐）", recommended: true },
          { id: "option-b", label: "方案 B" },
        ],
      });
      assert.equal(out?.outcome, "declined", "卡种不明 ⇒ fail-closed，不是 answered");
      assert.equal((out as { notPresented?: unknown }).notPresented, true, "卡片从未呈现给客户");
      assert.match((out as { reason?: string }).reason ?? "", /缺少 cardKind/);
      assert.match((out as { reason?: string }).reason ?? "", /不会默认成 appointment/);
      assert.equal(rawCalls, 0, "越界路径不得触达客户通道");
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 0, "不得写 appointment/material-choice 任何账本");
  });
});

test("零回归：convener 缺 cardKind 且无 recommended ⇒ 仍默认 appointment 并写任命账本", async () => {
  await withRoot(async (root) => {
    seedTeamPlan(root, ["alpha"]);
    const raw: CustomerInputFn = () => ({
      outcome: "answered",
      value: { selected: ["alpha"] },
      operatorId: "客户",
    });
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "任命决定",
        flowId: "flow-a",
        options: [{ id: "alpha", label: "Alpha" }],
      });
      assert.equal(out?.outcome, "answered", "无 recommended 的任命形状仍走既有默认");
    } finally {
      await handle.dispose();
    }
    const appointment = await waitForLedgerEntry(
      root,
      (candidate) => candidate.kind === "customer.decision" && candidate.decisionKind === "appointment",
    );
    assert.equal(appointment.customerDecision, "appointed");
    assert.deepEqual(appointment.targetRoleIds, ["alpha"]);
    assert.equal(appointment.selectedOptions, undefined, "任命账本不携带 decision 卡的 selectedOptions");
  });
});

// —————————————————————— ③ 多选/空选/未知选项 → unclassified/none ——————————————————————

test("decision 卡：多选 / 空选 / 未知选项 → unclassified/none（fail-closed）", async () => {
  await withRoot(async (root) => {
    const cases: Array<{ selected: string[]; label: string }> = [
      { selected: ["option-a", "option-b"], label: "多选" },
      { selected: [], label: "空选" },
      { selected: ["option-x"], label: "未知选项" },
    ];
    let currentSelected: string[] = [];
    const raw: CustomerInputFn = () => ({
      outcome: "answered",
      value: { selected: currentSelected },
      operatorId: "客户",
    });
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      for (const [index, item] of cases.entries()) {
        currentSelected = item.selected;
        const flowId = `flow-${index}`;
        const out = await captured.caps!.customerInput!(decisionCard({ flowId, title: item.label }));
        assert.equal(out?.outcome, "answered", item.label);
        const entry = await waitForLedgerEntry(root, (candidate) => candidate.flowId === flowId);
        assert.equal(entry.decisionKind, "unclassified", item.label);
        assert.equal(entry.customerDecision, "none", item.label);
        assert.equal(entry.selectedOptions, undefined, `${item.label} 不记录选中项`);
      }
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————————————— ④ 不影响提案/任命/验收/gate 判定 ——————————————————————

test("material-choice 不满足写流程门/任命写入门，也不覆盖既有提案接受", () => {
  const material = ledgerEntry({
    actorRoleId: "convener",
    power: "schedule",
    decisionKind: "material-choice",
    customerDecision: "accepted",
    selectedOptions: ["option-a"],
  });
  const snapshot = (entries: GovernanceLedgerEntry[]) => ({ entries, errors: [] });

  // 写流程门：只认 proposal-accept/accept-quick；material-choice 不放行。
  const writeFlow = {
    projectRoot: "",
    model: "trio" as const,
    roleId: "convener",
    action: "write-flow" as const,
    flowId: "flow-a",
  };
  const denied = evaluateGovernanceGate(writeFlow, snapshot([material]));
  assert.equal(denied.allowed, false);
  assert.equal((denied as { code: string }).code, "proposal-not-accepted");

  // 任命写入门：只认 decisionKind="appointment"；material-choice 不放行。
  const writeRoleCard = {
    projectRoot: "",
    model: "trio" as const,
    roleId: "nominator",
    action: "write-role-card" as const,
    flowId: "flow-a",
    targetRoleId: "A",
  };
  const noAppointment = evaluateGovernanceGate(writeRoleCard, snapshot([material]));
  assert.equal(noAppointment.allowed, false);
  assert.equal((noAppointment as { code: string }).code, "appointment-required");

  // 既有提案接受不被 material-choice 覆盖（门禁只看 proposal-* 四类）。
  const accept = ledgerEntry({ decisionKind: "proposal-accept", customerDecision: "accepted" });
  assert.deepEqual(evaluateGovernanceGate(writeFlow, snapshot([accept, material])), { allowed: true });
});

test("material-choice 不进入 latestAcceptanceDecision，也不能充当 flow 的 customer-decision 证据", () => {
  const material = ledgerEntry({
    actorRoleId: "convener",
    power: "schedule",
    decisionKind: "material-choice",
    customerDecision: "accepted",
    selectedOptions: ["option-a"],
  });
  // 验收判定：只认 decisionKind="acceptance"；material-choice ⇒ none（不触发收口/验收）。
  assert.deepEqual(latestAcceptanceDecision("flow-a", [material]), { kind: "none" });

  // 需要该 kind 的读取方（如桌面审计/latestCustomerDecision）仍能按 material-choice 读回。
  const latest = latestCustomerDecision("flow-a", "material-choice", [material]);
  assert.equal(latest.kind, "resolved");
  if (latest.kind === "resolved") assert.deepEqual(latest.entry.selectedOptions, ["option-a"]);

  // Flow 证据对账：customer-decision 的 ref 必须是既有账本决定类型；material-choice 不被接受。
  const flowYaml = [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "status: in-progress",
    "steps:",
    "  - id: choice-step",
    "    title: 事务选择",
    "    owner: convener",
    "    kind: customer-decision",
    "    status: done",
    "    evidence: { kind: customer-decision, ref: material-choice }",
    "",
  ].join("\n");
  const parsed = parseFlowStateYaml(flowYaml, "flow-a");
  assert.equal(parsed.ok, false, "material-choice 不能作为 flow 证据 ref");
  if (!parsed.ok) {
    assert.match(parsed.error, /customer-decision 证据的 ref 必须是账本 decisionKind/);
    assert.match(parsed.error, /material-choice/);
  }
});

test("decision 卡分类不改变旧卡种：提案 accept / 任命 仍按原 decisionKind 记账（多决定并存对照）", async () => {
  await withRoot(async (root) => {
    // 直接对照：同一份账本里 material-choice 与 proposal-accept/appointment 并存时，读取方仍按 kind 分流。
    const material = ledgerEntry({
      decisionKind: "material-choice",
      customerDecision: "accepted",
      selectedOptions: ["option-a"],
    });
    const accept = ledgerEntry({ decisionKind: "proposal-accept", customerDecision: "accepted" });
    const appointment = ledgerEntry({
      actorRoleId: "convener",
      power: "schedule",
      decisionKind: "appointment",
      customerDecision: "appointed",
      targetRoleIds: ["A"],
    });
    const latestProposal = latestCustomerDecision("flow-a", "proposal-accept", [material, accept, appointment]);
    assert.equal(latestProposal.kind, "resolved");
    if (latestProposal.kind === "resolved") assert.equal(latestProposal.entry.decisionKind, "proposal-accept");
    const latestAppointment = latestCustomerDecision("flow-a", "appointment", [material, accept, appointment]);
    assert.equal(latestAppointment.kind, "resolved");
    if (latestAppointment.kind === "resolved") {
      assert.deepEqual(latestAppointment.entry.targetRoleIds, ["A"]);
    }
  });
});

// —————————————————————— ⑤ 账本字段向后兼容 ——————————————————————

test("账本向后兼容：selectedOptions 可选；旧条目（无本字段）读取零变化", async () => {
  await withRoot(async (root) => {
    const legacy = ledgerEntry({ decisionKind: "proposal-accept", customerDecision: "accepted" });
    mkdirSync(join(root, ".ans", "governance"), { recursive: true });
    writeFileSync(
      join(root, ".ans", "governance", "ledger.jsonl"),
      `${JSON.stringify(legacy)}\n`,
      "utf8",
    );
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.selectedOptions, undefined);
  });
});

// —————————————————————— ⑥ 判断 agent（「替我决策」）：合法 decision 分支 ——————————————————————

test("governance judge：decision 卡有合法分支——按唯一推荐项代批并留审计，不回落 unknown/manual", () => {
  const request = judgeRequest();

  // 正常代批：selected = 唯一推荐项。
  const approve = evaluateGovernanceJudgeVerdict({
    request,
    verdict: {
      verdict: "approve",
      reason: "按卡内唯一推荐项 option-a（方案 A）代批。",
      evidence: ["card:事务性选择#option-a"],
      selected: ["option-a"],
    },
    engine: "claude",
  });
  assert.equal(approve.verdict, "approve", "不得回落「未知治理卡种」");
  assert.equal(approve.reasonCode, "sufficient");
  assert.equal(approve.group, "decision");
  assert.equal(approve.cardKind, "decision");
  assert.deepEqual(approve.value?.selected, ["option-a"]);

  // 审计：group/cardKind/selected/reason 完整，不写成客户本人。
  const audit = governanceJudgeAuditFromOutcome(approve);
  assert.equal(audit.group, "decision");
  assert.equal(audit.cardKind, "decision");
  assert.deepEqual(audit.selected, ["option-a"]);
  assert.match(audit.reason ?? "", /推荐项 option-a/);

  // 选非推荐项 ⇒ manual/not-recommended（不得自行改选）。
  const wrong = evaluateGovernanceJudgeVerdict({
    request,
    verdict: { verdict: "approve", reason: "改选 option-b。", evidence: ["card:事务性选择"], selected: ["option-b"] },
    engine: "claude",
  });
  assert.equal(wrong.verdict, "manual");
  assert.equal(wrong.reasonCode, "not-recommended");
  assert.match(wrong.reason ?? "", /唯一推荐项「option-a」/);

  // 多选 ⇒ manual。
  const multi = evaluateGovernanceJudgeVerdict({
    request,
    verdict: {
      verdict: "approve",
      reason: "两个都选。",
      evidence: ["card:事务性选择"],
      selected: ["option-a", "option-b"],
    },
    engine: "claude",
  });
  assert.equal(multi.verdict, "manual");
  assert.equal(multi.reasonCode, "not-recommended");

  // decision 组不得 deny（不替客户拒绝）。
  const deny = evaluateGovernanceJudgeVerdict({
    request,
    verdict: { verdict: "deny", reason: "不建议。", evidence: ["card:事务性选择"] },
    engine: "claude",
  });
  assert.equal(deny.verdict, "manual");
  assert.match(deny.reason ?? "", /决策卡不能由自动代理拒绝/);
});

test("governance judge：decision 卡推荐项缺失/多个 ⇒ manual/insufficient-evidence（结构 fail-closed）", () => {
  const noRecommended = evaluateGovernanceJudgeVerdict({
    request: judgeRequest({
      card: decisionCard({
        options: [
          { id: "option-a", label: "方案 A" },
          { id: "option-b", label: "方案 B" },
        ],
      }),
    }),
    verdict: { verdict: "approve", reason: "无可按推荐项。", evidence: ["card:事务性选择"], selected: ["option-a"] },
    engine: "claude",
  });
  assert.equal(noRecommended.verdict, "manual");
  assert.equal(noRecommended.reasonCode, "insufficient-evidence");
  assert.match(noRecommended.reason ?? "", /恰有一个推荐项（当前 0 个/);

  const twoRecommended = evaluateGovernanceJudgeVerdict({
    request: judgeRequest({
      card: decisionCard({
        options: [
          { id: "option-a", label: "方案 A", recommended: true },
          { id: "option-b", label: "方案 B", recommended: true },
        ],
      }),
    }),
    verdict: { verdict: "approve", reason: "两个推荐。", evidence: ["card:事务性选择"], selected: ["option-a"] },
    engine: "claude",
  });
  assert.equal(twoRecommended.verdict, "manual");
  assert.equal(twoRecommended.reasonCode, "insufficient-evidence");
  assert.match(twoRecommended.reason ?? "", /当前 2 个/);
});

test("decision 卡证据包：不要求意图/规范物证，且推荐项标记进入证据包与判断提示", async () => {
  await withRoot(async (root) => {
    const request = judgeRequest({ projectRoot: root });
    // 规范物证：decision 卡不要求任何文件（不能落 default 的 missing:true）。
    assert.deepEqual(requiredArtifactPaths(request), { paths: [], missing: false });

    const built = await buildDecisionEvidencePacket({ request, projectRoot: root });
    assert.equal(built.ok, true, built.ok ? "" : built.reason);
    if (!built.ok) return;
    assert.deepEqual(built.requiredReadPaths, [], "decision 卡没有可/必读的规范物证");
    assert.equal(built.packet.intent, undefined, "decision 卡不读意图文件（与提案/任命/验收独立）");
    const options = built.packet.requesterStatement.options ?? [];
    assert.equal(options.find((option) => option.id === "option-a")?.recommended, true);
    assert.equal(options.find((option) => option.id === "option-b")?.recommended, undefined);

    const prompt = buildGovernanceJudgePrompt(request, built.requiredReadPaths, built.packet);
    assert.match(prompt, /"recommended": true/, "推荐项标记必须让判断可见");

    const system = buildGovernanceJudgeSystemPrompt();
    assert.match(system, /decision（decision，2026-10-26 客户新增：材料性选择卡/);
    assert.match(system, /不得自行发明选项、不得改动推荐/);
  });
});

// —————————————————————— ⑦ 独立验收 F1/F2：共享结构校验与「未呈现」不落账 ——————————————————————

test("F2：validateDecisionCardRequest 是单一共享校验——角色/卡形/flowId/选项/唯一推荐项", () => {
  const ok = validateDecisionCardRequest({
    request: decisionCard(),
    roleId: "convener",
    governanceModel: "trio",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.applicable, true);
    assert.equal(ok.flowId, "flow-a");
    assert.equal(ok.recommendedOptionId, "option-a");
  }

  // 非 decision 卡：不适用（调用方按原卡种逻辑处理，旧卡零变化）。
  const notApplicable = validateDecisionCardRequest({
    request: { kind: "choice", title: "普通选择", options: [{ id: "a", label: "A" }], flowId: "flow-a" },
    roleId: "convener",
    governanceModel: "trio",
  });
  assert.equal(notApplicable.ok, true);
  if (notApplicable.ok) assert.equal(notApplicable.applicable, false);

  const cases: Array<{
    label: string;
    input: Parameters<typeof validateDecisionCardRequest>[0];
    reasonCode: string;
    detail?: RegExp;
  }> = [
    {
      label: "非统筹内置角色",
      input: { request: decisionCard(), roleId: "liaison", governanceModel: "trio" },
      reasonCode: "role-not-allowed",
      detail: /role=liaison/,
    },
    {
      label: "single/su",
      input: { request: decisionCard(), roleId: "su", governanceModel: "single" },
      reasonCode: "role-not-allowed",
    },
    {
      label: "项目角色（即便 id 叫 convener）",
      input: { request: decisionCard(), roleId: "convener", governanceModel: "single" },
      reasonCode: "role-not-allowed",
    },
    {
      label: "confirm 卡",
      input: {
        request: { kind: "confirm", title: "确认", cardKind: "decision", flowId: "flow-a" },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "not-choice",
    },
    {
      label: "缺 flowId",
      input: {
        request: { kind: "choice", title: "选择", cardKind: "decision", options: DECISION_OPTIONS },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "missing-flow-id",
    },
    {
      label: "flowId 非法",
      input: {
        request: { kind: "choice", title: "选择", cardKind: "decision", flowId: "Flow-A", options: DECISION_OPTIONS },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "missing-flow-id",
    },
    {
      label: "选项不足 2 个",
      input: {
        request: {
          kind: "choice",
          title: "选择",
          cardKind: "decision",
          flowId: "flow-a",
          options: [{ id: "only", label: "唯一", recommended: true }],
        },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "not-enough-options",
    },
    {
      label: "选项 id 为空",
      input: {
        request: {
          kind: "choice",
          title: "选择",
          cardKind: "decision",
          flowId: "flow-a",
          options: [{ id: "", label: "空" }, { id: "b", label: "B", recommended: true }],
        },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "invalid-option-id",
    },
    {
      label: "选项 id 重复",
      input: {
        request: {
          kind: "choice",
          title: "选择",
          cardKind: "decision",
          flowId: "flow-a",
          options: [{ id: "a", label: "A", recommended: true }, { id: "a", label: "A2" }],
        },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "duplicate-option-id",
      detail: /duplicate option id: a/,
    },
    {
      label: "缺推荐项",
      input: {
        request: {
          kind: "choice",
          title: "选择",
          cardKind: "decision",
          flowId: "flow-a",
          options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "recommended-count",
      detail: /recommended=0/,
    },
    {
      label: "多推荐项",
      input: {
        request: {
          kind: "choice",
          title: "选择",
          cardKind: "decision",
          flowId: "flow-a",
          options: [{ id: "a", label: "A", recommended: true }, { id: "b", label: "B", recommended: true }],
        },
        roleId: "convener",
        governanceModel: "trio",
      },
      reasonCode: "recommended-count",
      detail: /recommended=2/,
    },
  ];
  for (const item of cases) {
    const result = validateDecisionCardRequest(item.input);
    assert.equal(result.ok, false, item.label);
    if (result.ok) continue;
    assert.equal(result.reasonCode, item.reasonCode, item.label);
    if (item.detail !== undefined) assert.match(result.detail, item.detail, item.label);
  }
});

test("F1：桌面 fail-closed 的 declined+notPresented 不写账本，收尾门不被 unclassified/none 挡住", async () => {
  await withRoot(async (root) => {
    const raw: CustomerInputFn = () => ({
      outcome: "declined",
      notPresented: true,
      reason: "桌面 decision 卡校验拒绝（模拟）",
    });
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const out = await captured.caps!.customerInput!(decisionCard());
      assert.equal(out?.outcome, "declined");
      assert.equal((out as { notPresented?: unknown }).notPresented, true);
      assert.equal((out as { operatorId?: unknown }).operatorId, undefined, "不得带 operatorId");
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 0, "未呈现 = 无客户决定，不得写 unclassified/none");
    assertFlowCompletionNotBlocked(root, { entries, errors });
  });
});

test("F1/F2：非法 decision 卡（缺/多推荐）在触达客户前被拒——零账本、不挡收尾门", async () => {
  await withRoot(async (root) => {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["option-a"] } };
    };
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const illegalCards: CustomerInputRequest[] = [
        decisionCard({
          title: "缺推荐项",
          options: [
            { id: "option-a", label: "方案 A" },
            { id: "option-b", label: "方案 B" },
          ],
        }),
        decisionCard({
          title: "多推荐项",
          options: [
            { id: "option-a", label: "方案 A", recommended: true },
            { id: "option-b", label: "方案 B", recommended: true },
          ],
        }),
      ];
      for (const card of illegalCards) {
        const out = await captured.caps!.customerInput!(card);
        assert.equal(out?.outcome, "declined", card.title);
        assert.equal((out as { notPresented?: unknown }).notPresented, true, card.title);
        assert.equal((out as { operatorId?: unknown }).operatorId, undefined, card.title);
      }
      assert.equal(rawCalls, 0, "非法 decision 卡不得触达客户通道");
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 0);
    assertFlowCompletionNotBlocked(root, { entries, errors });
  });
});

test("F2：convener 缺 flowId 的 decision 卡在编排层被拒（CLI/raw 通道同样 fail-closed）", async () => {
  await withRoot(async (root) => {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["option-a"] } };
    };
    const { handle, captured } = await openCapturing(root, "convener", raw);
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "缺 flowId",
        cardKind: "decision",
        options: DECISION_OPTIONS,
      });
      assert.equal(out?.outcome, "declined");
      assert.equal((out as { notPresented?: unknown }).notPresented, true);
      assert.match((out as { reason?: string }).reason ?? "", /缺少合法的 flowId/);
      assert.equal(rawCalls, 0);
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0);
  });
});

test("F2：single/su 与项目角色发 decision 卡 ⇒ 不触达客户、零账本", async () => {
  await withRoot(async (root) => {
    const singleRoot = join(root, "single");
    const projectRootDir = join(root, "project");
    mkdirSync(singleRoot, { recursive: true });
    mkdirSync(projectRootDir, { recursive: true });

    let suRawCalls = 0;
    const suRaw: CustomerInputFn = () => {
      suRawCalls += 1;
      return { outcome: "answered", value: { selected: ["option-a"] } };
    };
    const su = await openCapturingWithProject("su", singleProject(singleRoot), suRaw);
    try {
      const out = await su.captured.caps!.customerInput!(decisionCard());
      assert.equal(out?.outcome, "declined");
      assert.equal((out as { notPresented?: unknown }).notPresented, true);
      assert.match((out as { reason?: string }).reason ?? "", /只能由统筹\/Steward/);
    } finally {
      await su.handle.dispose();
    }
    assert.equal(suRawCalls, 0, "single/su 不得触达客户通道或代发 decision 卡");

    let workerRawCalls = 0;
    const workerRaw: CustomerInputFn = () => {
      workerRawCalls += 1;
      return { outcome: "answered", value: { selected: ["option-a"] } };
    };
    const worker = await openCapturingWithProject(
      "worker",
      projectRoleProject(projectRootDir, "worker", "docs/notes.md"),
      workerRaw,
    );
    try {
      const out = await worker.captured.caps!.customerInput!(decisionCard());
      assert.equal(out?.outcome, "declined");
      assert.equal((out as { notPresented?: unknown }).notPresented, true);
      assert.match((out as { reason?: string }).reason ?? "", /只能由统筹\/Steward/);
    } finally {
      await worker.handle.dispose();
    }
    assert.equal(workerRawCalls, 0, "项目角色不得触达客户通道或代发 decision 卡");

    await flushGovernanceLedger(singleRoot);
    await flushGovernanceLedger(projectRootDir);
    assert.equal((await readGovernanceLedger(singleRoot)).entries.length, 0);
    assert.equal((await readGovernanceLedger(projectRootDir)).entries.length, 0);
  });
});

test("F1 复验收口：system 写盘预授权拒绝仍记 governance.preauthorization.declined 诊断（早退不吞）", async () => {
  await withRoot(async (root) => {
    const diagnosticsDir = join(root, "diagnostics");
    configureDiagnostics({ directory: diagnosticsDir });
    try {
      const raw: CustomerInputFn = () => ({
        outcome: "declined",
        operatorId: "system:write-preauthorization",
      });
      const { handle, captured } = await openCapturing(root, "convener", raw);
      try {
        const out = await captured.caps!.customerInput!({
          kind: "confirm",
          title: "写盘确认",
          cardKind: "write",
          flowId: "flow-a",
          preview: "## docs/scheduling/note.md\n正文内容。\n",
          paths: ["docs/scheduling/note.md"],
        });
        assert.equal(out?.outcome, "declined");
      } finally {
        await handle.dispose();
      }
      await flushDiagnostics();
      const files = readdirSync(diagnosticsDir).filter((name) => name.endsWith(".jsonl"));
      const events = files.flatMap((name) =>
        readFileSync(join(diagnosticsDir, name), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => (JSON.parse(line) as { event?: string }).event ?? ""),
      );
      assert.ok(
        events.includes("governance.preauthorization.declined"),
        "system 预授权拒绝必须仍记诊断（F1 早退不得吞掉）",
      );
      await flushGovernanceLedger(root);
      const { entries } = await readGovernanceLedger(root);
      assert.equal(entries.length, 0, "system 预授权拒绝不写客户决定（既有行为不变）");
    } finally {
      await disposeDiagnostics();
    }
  });
});



