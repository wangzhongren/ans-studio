// test/编排/flow-state.test.ts
// 2026-10-19 Flow YAML 契约（客户「这些全部改成yaml」）：
//   · `parseFlowStateYaml` 的确定性校验（保留 id / 枚举 / 证据 / supersede / 未知字段）；
//   · `evaluateFlowCompletion` + `validateFlowEvidence` 的账本对账与收尾门；
//   · 真实 todo/meeting 流程 YAML 形状；
//   · 治理派发门禁的 YAML 优先（YAML 存在即唯一机器状态，坏 YAML fail-closed）。
// 纯离线：临时目录 + 内存账本；不读 .env、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateFlowCompletion,
  flowCompletionIssue,
  flowStatePath,
  parseFlowStateYaml,
  validateFlowEvidence,
  FLOW_STEP_KINDS,
  type FlowState,
} from "../../src/common/编排/flow-state.ts";
import { evaluateGovernanceGate } from "../../src/common/编排/governance-gate.ts";
import type { GovernanceLedgerEntry } from "../../src/common/编排/governance-ledger.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, RuntimeAdapter } from "../../src/model/runtime.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

// —————————————————————— 夹具 ——————————————————————

const TODO_FLOW_YAML = `flowId: todo-list-v1
version: 1
qualityTier: production
status: in-progress
steps:
  - id: nomination
    title: 提名
    owner: Crew
    kind: customer-decision
    status: done
    evidence: { kind: customer-decision, ref: appointment }
  - id: contract-freeze
    title: 冻结契约
    owner: Steward
    kind: artifact
    status: done
    evidence: { kind: artifact, ref: docs/contracts/todo-list-api-v1.md }
  - id: delivery-backend
    title: 后端交付
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: delivery-backend }
  - id: delivery-frontend
    title: 前端交付
    owner: frontend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: delivery-frontend }
  - id: verification-evidence
    title: 证据整理
    owner: tester
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: verification-evidence }
  - id: verification
    title: 独立复核
    owner: verifier
    kind: acceptance
    status: pending
`;

const MEETING_FLOW_YAML = `flowId: meeting-scheduler-v1
version: 2
qualityTier: production
status: active
steps:
  - id: nomination
    title: 提名
    owner: Crew
    kind: customer-decision
    status: done
    evidence: { kind: customer-decision, ref: appointment }
  - id: contract-freeze
    title: 冻结会议 API 契约
    owner: Steward
    kind: artifact
    status: done
    evidence: { kind: artifact, ref: docs/contracts/meeting-api-v1.md }
  - id: delivery-scheduler
    title: 调度器交付
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: delivery-scheduler }
  - id: integration-demo
    title: 集成与演示
    owner: frontend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: integration-demo }
  - id: acceptance
    title: 客户验收
    owner: verifier
    kind: acceptance
    status: pending
`;

function entry(partial: Partial<GovernanceLedgerEntry> & Pick<GovernanceLedgerEntry, "kind">): GovernanceLedgerEntry {
  return {
    at: "2026-10-19T00:00:00.000Z",
    actorRoleId: "convener",
    power: "schedule",
    ...partial,
  };
}

function todoLedger(flowId = "todo-list-v1"): GovernanceLedgerEntry[] {
  return [
    entry({
      kind: "customer.decision",
      flowId,
      actorRoleId: "nominator",
      power: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      targetRoleIds: ["backend", "frontend", "tester"],
    }),
    entry({
      kind: "artifact.observed",
      flowId,
      actorRoleId: "convener",
      power: "schedule",
      artifactPath: "docs/contracts/todo-list-api-v1.md",
    }),
    entry({ kind: "dispatch.accepted", flowId, stepId: "delivery-backend", targetRoleId: "backend" }),
    entry({ kind: "dispatch.accepted", flowId, stepId: "delivery-frontend", targetRoleId: "frontend" }),
    entry({ kind: "dispatch.accepted", flowId, stepId: "verification-evidence", targetRoleId: "tester" }),
  ];
}

function parseOk(text: string, flowId: string): FlowState {
  const parsed = parseFlowStateYaml(text, flowId);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors, null, 2));
  return (parsed as { ok: true; flow: FlowState }).flow;
}

function errorPaths(text: string, flowId: string): string[] {
  const parsed = parseFlowStateYaml(text, flowId);
  assert.equal(parsed.ok, false, "期望校验失败但通过了");
  return (parsed as { ok: false; errors: Array<{ path: string; message: string }> }).errors.map((error) => error.path);
}

// —————————————————————— 合法形状 ——————————————————————

test("2026-10-22 新流程步骤模板：team-plan/appointment/role-cards/role-readiness/acceptance-criteria/change-package 用现有 kind", () => {
  // 枚举不变（Q4 A：不新增 FlowStepKind）。
  assert.deepEqual([...FLOW_STEP_KINDS], ["dispatch", "customer-decision", "artifact", "acceptance"]);

  const yaml = [
    "flowId: governance-split-demo",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: team-plan",
    "    title: 团队计划",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "  - id: appointment",
    "    title: 客户任命（闸门 2）",
    "    owner: convener",
    "    kind: customer-decision",
    "    status: pending",
    "  - id: role-cards",
    "    title: Crew 写角色卡与边界",
    "    owner: nominator",
    "    kind: dispatch",
    "    status: pending",
    "  - id: role-readiness",
    "    title: 角色就绪复核",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "  - id: acceptance-criteria",
    "    title: 实施前完成标准",
    "    owner: verifier",
    "    kind: artifact",
    "    status: pending",
    "  - id: delivery-backend",
    "    title: 服务端交付",
    "    owner: backend",
    "    kind: dispatch",
    "    status: pending",
    "  - id: verification-evidence",
    "    title: 真实启动应用并演示",
    "    owner: backend",
    "    kind: artifact",
    "    status: pending",
    "  - id: change-package",
    "    title: 变更包",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
  const parsed = parseFlowStateYaml(yaml, "governance-split-demo");
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.flow.steps.map((step) => [step.id, step.kind]),
    [
      ["team-plan", "artifact"],
      ["appointment", "customer-decision"],
      ["role-cards", "dispatch"],
      ["role-readiness", "artifact"],
      ["acceptance-criteria", "artifact"],
      ["delivery-backend", "dispatch"],
      ["verification-evidence", "artifact"],
      ["change-package", "artifact"],
      ["verification", "acceptance"],
    ],
  );
  // 旧 nomination 步骤 id 仍可解析（legacy 流程不被破坏）。
  const legacyYaml = [
    "flowId: governance-split-demo",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: nomination",
    "    title: 提名（legacy）",
    "    owner: nominator",
    "    kind: customer-decision",
    "    status: pending",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
  const legacy = parseFlowStateYaml(legacyYaml, "governance-split-demo");
  assert.equal(legacy.ok, true, "旧 nomination 步骤 id 不应被新约定破坏");
});

test("合法 YAML：真实 todo-list-v1 流程形状解析通过", () => {
  const flow = parseOk(TODO_FLOW_YAML, "todo-list-v1");
  assert.equal(flow.flowId, "todo-list-v1");
  assert.equal(flow.version, 1);
  assert.equal(flow.qualityTier, "production");
  assert.equal(flow.steps.length, 6);
  const acceptance = flow.steps.find((step) => step.id === "verification");
  assert.equal(acceptance?.kind, "acceptance");
  assert.equal(acceptance?.status, "pending");
  assert.equal(flow.steps.find((step) => step.id === "nomination")?.evidence?.kind, "customer-decision");
  assert.equal(flowStatePath("todo-list-v1"), "docs/flows/todo-list-v1.yaml");
});

test("合法 YAML：真实 meeting 流程（保留 id acceptance）解析通过", () => {
  const flow = parseOk(MEETING_FLOW_YAML, "meeting-scheduler-v1");
  assert.equal(flow.version, 2);
  assert.equal(flow.steps.filter((step) => step.kind === "acceptance").length, 1);
  assert.equal(flow.steps.at(-1)?.id, "acceptance");
});

// —————————————————————— 规则 1：flowId / version / qualityTier / steps ——————————————————————

test("flowId 与文件名不一致 ⇒ 校验失败且路径为 flowId", () => {
  const text = TODO_FLOW_YAML.replace("flowId: todo-list-v1", "flowId: another-flow-v1");
  const parsed = parseFlowStateYaml(text, "todo-list-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const error = parsed.errors.find((item) => item.path === "flowId");
    assert.ok(error);
    assert.match(error.message, /不一致/);
  }
});

test("slug 收紧（S2/T9）：文件名/步骤 id/证据 ref/supersede 引用尾连字符 ⇒ 具体路径报错并展示新正则", () => {
  // 文件名 flowId 尾连字符。
  const badName = parseFlowStateYaml(TODO_FLOW_YAML, "flow-");
  assert.equal(badName.ok, false);
  if (!badName.ok) {
    const error = badName.errors.find((item) => item.path === "flowId");
    assert.ok(error);
    assert.match(error.message, /0,62/, "错误文案经 ${FLOW_ID_RE} 自动展示现行正则");
    assert.match(error.message, /flow-/);
  }

  // 顶层 flowId 与合法文件名不一致（YAML 写旧值 flow-）⇒ flowId 路径报错。
  const badTop = parseFlowStateYaml(TODO_FLOW_YAML.replace("flowId: todo-list-v1", "flowId: flow-"), "todo-list-v1");
  assert.equal(badTop.ok, false);
  if (!badTop.ok) assert.ok(badTop.errors.some((item) => item.path === "flowId"));

  // 步骤 id 尾连字符。
  const badStep = TODO_FLOW_YAML.replace("  - id: verification-evidence", "  - id: verification-");
  const stepParsed = parseFlowStateYaml(badStep, "todo-list-v1");
  assert.equal(stepParsed.ok, false);
  if (!stepParsed.ok) {
    assert.ok(stepParsed.errors.some((item) => item.path === "steps[4].id" && /0,62/.test(item.message)));
  }

  // dispatch 证据 ref 尾连字符。
  const badRef = TODO_FLOW_YAML.replace(
    "evidence: { kind: dispatch, ref: delivery-backend }",
    "evidence: { kind: dispatch, ref: delivery-backend- }",
  );
  const refParsed = parseFlowStateYaml(badRef, "todo-list-v1");
  assert.equal(refParsed.ok, false);
  if (!refParsed.ok) {
    assert.ok(refParsed.errors.some((item) => item.path === "steps[2].evidence.ref" && /0,62/.test(item.message)));
  }

  // supersedes / supersededBy 引用尾连字符。
  const badSupersede = `flowId: slug-strict-v1
version: 1
qualityTier: production
steps:
  - id: impl-
    title: 旧实现
    owner: A
    kind: dispatch
    status: superseded
    supersededBy: impl-
  - id: impl
    title: 新实现
    owner: A
    kind: dispatch
    status: pending
    supersedes: [impl-]
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const supersedeParsed = parseFlowStateYaml(badSupersede, "slug-strict-v1");
  assert.equal(supersedeParsed.ok, false);
  if (!supersedeParsed.ok) {
    assert.ok(supersedeParsed.errors.some((item) => item.path === "steps[0].id" && /0,62/.test(item.message)));
    assert.ok(supersedeParsed.errors.some((item) => item.path === "steps[1].supersedes[0]"));
  }

  // 旧合法值零回归：连续连字符仍可作步骤 id。
  const legal = parseFlowStateYaml(GATE_FLOW_YAML.replace("  - id: impl\n", "  - id: a--b\n"), "flow-a");
  assert.equal(legal.ok, true);
});

test("version 非正整数 / qualityTier 非法 / steps 空 ⇒ 具体路径报错", () => {
  const badVersion = TODO_FLOW_YAML.replace("version: 1", "version: 0");
  assert.ok(errorPaths(badVersion, "todo-list-v1").includes("version"));

  const badTier = TODO_FLOW_YAML.replace("qualityTier: production", "qualityTier: gold");
  assert.ok(errorPaths(badTier, "todo-list-v1").includes("qualityTier"));

  const emptySteps = "flowId: todo-list-v1\nversion: 1\nqualityTier: production\nsteps: []\n";
  assert.ok(errorPaths(emptySteps, "todo-list-v1").includes("steps"));
});

test("步骤 id 重复 ⇒ 校验失败", () => {
  const text = `flowId: dup-flow-v1
version: 1
qualityTier: prototype
steps:
  - id: same-step
    title: A
    owner: A
    kind: dispatch
    status: pending
  - id: same-step
    title: B
    owner: B
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "dup-flow-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.path === "steps[1].id" && /重复/.test(error.message)));
  }
});

// —————————————————————— 规则 2：保留 id ——————————————————————

test("保留 id verification 被 dispatch 步骤占用 ⇒ 校验失败", () => {
  const text = `flowId: reserved-flow-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: implementation }
  - id: verification
    title: 证据整理
    owner: tester
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: verification }
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "reserved-flow-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const error = parsed.errors.find((item) => item.path === "steps[1].id");
    assert.ok(error);
    assert.match(error.message, /保留 id/);
    assert.match(error.message, /verification-evidence/);
  }
});

test("验收步骤只能有一个（两个 kind: acceptance）⇒ 校验失败", () => {
  const text = `flowId: two-accept-v1
version: 1
qualityTier: production
steps:
  - id: verification
    title: 复核一
    owner: verifier
    kind: acceptance
    status: pending
  - id: acceptance
    title: 复核二
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "two-accept-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => /只能有一个/.test(error.message)));
  }
});

test("kind: acceptance 但 id 非保留 ⇒ 校验失败", () => {
  const text = `flowId: bad-accept-id-v1
version: 1
qualityTier: production
steps:
  - id: final-check
    title: 复核
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "bad-accept-id-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.path === "steps[0].id" && /保留 id/.test(error.message)));
  }
});

test("验收步骤不能标 superseded（必须保留验收出口）", () => {
  const text = `flowId: void-accept-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: superseded
`;
  const parsed = parseFlowStateYaml(text, "void-accept-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.path === "steps[1].status" && /superseded/.test(error.message)));
  }
});

// —————————————————————— 规则 3：枚举 / 证据 ——————————————————————

test("kind / status / evidence.kind 非法 ⇒ 逐路径报错", () => {
  const text = `flowId: enum-flow-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: review
    status: in-progress
    evidence: { kind: decision, ref: appointment }
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "enum-flow-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const paths = parsed.errors.map((error) => error.path);
    assert.ok(paths.includes("steps[0].kind"));
    assert.ok(paths.includes("steps[0].status"));
    assert.ok(paths.includes("steps[0].evidence.kind"));
    const statusError = parsed.errors.find((error) => error.path === "steps[0].status");
    assert.match(statusError?.message ?? "", /pending \| dispatched \| delivered \| done \| superseded \| failed \| blocked \| aborted/);
  }
});

test("done 步骤缺 evidence ⇒ 校验失败", () => {
  const text = `flowId: no-evidence-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: dispatch
    status: done
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "no-evidence-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.path === "steps[0].evidence" && /必须提供 evidence/.test(error.message)));
  }
});

test("evidence.kind 与步骤 kind 不匹配 ⇒ 校验失败", () => {
  const text = `flowId: mismatch-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: artifact, ref: docs/reports/backend.md }
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "mismatch-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(
      parsed.errors.some(
        (error) => error.path === "steps[0].evidence.kind" && /必须与步骤 kind 对应/.test(error.message),
      ),
    );
  }
});

test("pending/dispatched/delivered 不要求 evidence", () => {
  const text = `flowId: no-evidence-needed-v1
version: 1
qualityTier: production
steps:
  - id: implementation
    title: 实现
    owner: backend
    kind: dispatch
    status: dispatched
  - id: review
    title: 复核
    owner: reviewer
    kind: artifact
    status: delivered
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  assert.equal(parseFlowStateYaml(text, "no-evidence-needed-v1").ok, true);
});

// —————————————————————— 规则 4：supersede ——————————————————————

test("supersededBy 成环 ⇒ 校验失败", () => {
  const text = `flowId: cycle-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: failed
    supersededBy: step-b
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: failed
    supersededBy: step-a
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "cycle-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => /形成环/.test(error.message)));
  }
});

test("supersede 双写合法：旧 supersededBy + 新 supersedes 同一对步骤不误报环", () => {
  const text = `flowId: double-write-v1
version: 1
qualityTier: production
steps:
  - id: delivery-server-old
    title: 旧交付
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: delivery-server
  - id: delivery-server
    title: 新交付
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: delivery-server }
    supersedes: [delivery-server-old]
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const flow = parseOk(text, "double-write-v1");
  const ledger = [
    entry({
      kind: "dispatch.accepted",
      flowId: "double-write-v1",
      stepId: "delivery-server",
      targetRoleId: "backend",
    }),
  ];
  assert.deepEqual(evaluateFlowCompletion(flow, ledger), { ready: true }, "双写是合法关系，旧步骤 superseded 不阻塞");
});

test("supersede 双写链条合法：A→B→C 不因两侧都写而误报环", () => {
  const text = `flowId: double-chain-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-b
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-c
    supersedes: [step-a]
  - id: step-c
    title: C
    owner: backend
    kind: dispatch
    status: pending
    supersedes: [step-b]
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  assert.equal(parseFlowStateYaml(text, "double-chain-v1").ok, true);
});

test("supersede 只写一侧仍合法（旧侧 supersededBy / 新侧 supersedes）", () => {
  const oldSide = `flowId: old-side-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-b
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  assert.equal(parseFlowStateYaml(oldSide, "old-side-v1").ok, true);

  const newSide = `flowId: new-side-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: pending
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: pending
    supersedes: [step-a]
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  assert.equal(parseFlowStateYaml(newSide, "new-side-v1").ok, true);
});

test("三节点替代真环（A→B→C→A）仍拒绝", () => {
  const text = `flowId: cycle-three-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-b
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-c
  - id: step-c
    title: C
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-a
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "cycle-three-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => /形成环/.test(error.message)));
  }
});

test("supersede 两侧矛盾 ⇒ 具体路径拒绝（两种方向）", () => {
  const oldSaysBNewListsC = `flowId: conflict-a-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-b
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: pending
    supersedes: [step-c]
  - id: step-c
    title: C
    owner: backend
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const first = parseFlowStateYaml(oldSaysBNewListsC, "conflict-a-v1");
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.ok(
      first.errors.some((error) => error.path === "steps[0].supersededBy" && /两侧矛盾/.test(error.message)),
    );
  }

  const newListsAOldSaysC = `flowId: conflict-b-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersededBy: step-c
  - id: step-b
    title: B
    owner: backend
    kind: dispatch
    status: pending
    supersedes: [step-a]
  - id: step-c
    title: C
    owner: backend
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const second = parseFlowStateYaml(newListsAOldSaysC, "conflict-b-v1");
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.ok(
      second.errors.some((error) => error.path === "steps[1].supersedes[0]" && /矛盾/.test(error.message)),
    );
  }
});

test("supersedes / supersededBy 指向不存在的步骤 ⇒ 校验失败", () => {
  const text = `flowId: dangling-v1
version: 1
qualityTier: production
steps:
  - id: step-a
    title: A
    owner: backend
    kind: dispatch
    status: superseded
    supersedes: [ghost-step]
    supersededBy: other-ghost
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "dangling-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.path.startsWith("steps[0].supersedes") && /不存在/.test(error.message)));
    assert.ok(parsed.errors.some((error) => error.path === "steps[0].supersededBy" && /不存在/.test(error.message)));
  }
});

test("failed 未标 superseded ⇒ 收尾门 fail-closed；标 superseded 后不参与判定", () => {
  const base = TODO_FLOW_YAML.replace(
    "  - id: verification-evidence\n    title: 证据整理\n    owner: tester\n    kind: dispatch\n    status: done\n    evidence: { kind: dispatch, ref: verification-evidence }\n",
    "  - id: verification-evidence\n    title: 证据整理\n    owner: tester\n    kind: dispatch\n    status: failed\n",
  );
  const ledger = todoLedger();
  const blocked = evaluateFlowCompletion(parseOk(base, "todo-list-v1"), ledger);
  assert.equal(blocked.ready, false);
  if (!blocked.ready) {
    assert.ok(blocked.issues.some((issue) => /verification-evidence/.test(issue) && /failed|尚未完成/.test(issue)));
  }

  const superseded = base.replace("status: failed", "status: superseded");
  const flow = parseOk(superseded, "todo-list-v1");
  assert.deepEqual(evaluateFlowCompletion(flow, ledger), { ready: true });
});

// —————————————————————— 规则 5：未知字段 / 缺必填 / 语法 ——————————————————————

test("未知顶层/步骤/证据字段与缺必填 ⇒ 具体路径报错", () => {
  const text = `flowId: unknown-v1
version: 1
qualityTier: production
owner: nobody
steps:
  - id: implementation
    title: 实现
    kind: dispatch
    status: pending
    notes: extra
    evidence: { kind: dispatch, ref: implementation, sha: abc }
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const parsed = parseFlowStateYaml(text, "unknown-v1");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const paths = parsed.errors.map((error) => error.path);
    assert.ok(paths.includes("owner"));
    assert.ok(paths.includes("steps[0].owner"));
    assert.ok(paths.includes("steps[0].notes"));
    assert.ok(paths.includes("steps[0].evidence.sha"));
  }
});

test("YAML 语法错误 / 重复键 ⇒ 校验失败（path=$）", () => {
  const syntax = parseFlowStateYaml("flowId: [unterminated\n", "bad-v1");
  assert.equal(syntax.ok, false);
  if (!syntax.ok) assert.equal(syntax.errors[0]?.path, "$");

  const duplicate = parseFlowStateYaml(
    "flowId: dup-key-v1\nversion: 1\nversion: 2\nqualityTier: production\nsteps: []\n",
    "dup-key-v1",
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.errors[0]?.path, "$");
});

// —————————————————————— 证据对账与收尾门 ——————————————————————

test("validateFlowEvidence：dispatch 证据缺失/补齐与客户决定结算口径", () => {
  const flow = parseOk(TODO_FLOW_YAML, "todo-list-v1");

  const missingDispatch = todoLedger().filter(
    (item) => !(item.kind === "dispatch.accepted" && item.stepId === "delivery-backend"),
  );
  const missing = validateFlowEvidence(flow, missingDispatch);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.issues.some((issue) => issue.stepId === "delivery-backend" && /dispatch\.accepted/.test(issue.message)));
  }

  const unresolved = todoLedger().map((item) =>
    item.decisionKind === "appointment" ? { ...item, customerDecision: "none" as const } : item,
  );
  const unresolvedResult = validateFlowEvidence(flow, unresolved);
  assert.equal(unresolvedResult.ok, false);
  if (!unresolvedResult.ok) {
    assert.ok(unresolvedResult.issues.some((issue) => issue.stepId === "nomination"));
  }

  assert.deepEqual(validateFlowEvidence(flow, todoLedger()), { ok: true });
});

test("evaluateFlowCompletion：齐全 ⇒ ready；缺证据/未完成/验收已派发 ⇒ 具体 issues", () => {
  const flow = parseOk(TODO_FLOW_YAML, "todo-list-v1");
  assert.deepEqual(evaluateFlowCompletion(flow, todoLedger()), { ready: true });

  const noDispatch = todoLedger().filter((item) => item.kind !== "dispatch.accepted");
  const missingEvidence = evaluateFlowCompletion(flow, noDispatch);
  assert.equal(missingEvidence.ready, false);
  if (!missingEvidence.ready) {
    assert.ok(missingEvidence.issues.some((issue) => /缺少 dispatch\.accepted/.test(issue)));
  }

  const dispatchedAcceptance = parseOk(
    TODO_FLOW_YAML.replace("    kind: acceptance\n    status: pending", "    kind: acceptance\n    status: dispatched"),
    "todo-list-v1",
  );
  const inProgress = evaluateFlowCompletion(dispatchedAcceptance, todoLedger());
  assert.equal(inProgress.ready, false);
  if (!inProgress.ready) {
    assert.ok(inProgress.issues.some((issue) => /验收已派发/.test(issue)));
  }
});

test("evaluateFlowCompletion：验收已 done ⇒ 已收口（不再派发），并要求 acceptance 证据", () => {
  const doneFlow = parseOk(
    TODO_FLOW_YAML.replace(
      "  - id: verification\n    title: 独立复核\n    owner: verifier\n    kind: acceptance\n    status: pending\n",
      "  - id: verification\n    title: 独立复核\n    owner: verifier\n    kind: acceptance\n    status: done\n    evidence: { kind: acceptance, ref: acceptance }\n",
    ),
    "todo-list-v1",
  );
  const withoutDecision = validateFlowEvidence(doneFlow, todoLedger());
  assert.equal(withoutDecision.ok, false);

  const accepted = [
    ...todoLedger(),
    entry({
      kind: "customer.decision",
      flowId: "todo-list-v1",
      actorRoleId: "verifier",
      power: "acceptance",
      decisionKind: "acceptance",
      customerDecision: "accepted",
    }),
  ];
  assert.deepEqual(validateFlowEvidence(doneFlow, accepted), { ok: true });
  const completion = evaluateFlowCompletion(doneFlow, accepted);
  assert.equal(completion.ready, false);
  if (!completion.ready) {
    assert.ok(completion.issues.some((issue) => /已收口/.test(issue)));
  }
});

test("flowCompletionIssue：旧桌面风格 string|undefined 适配；账本 errors fail-closed", () => {
  const flow = parseOk(TODO_FLOW_YAML, "todo-list-v1");
  assert.equal(flowCompletionIssue(flow, todoLedger()), undefined);
  assert.match(
    flowCompletionIssue(
      flow,
      todoLedger().filter((item) => !(item.kind === "dispatch.accepted" && item.stepId === "delivery-backend")),
    ) ?? "",
    /缺少 dispatch\.accepted/,
  );
  assert.match(
    flowCompletionIssue(flow, { entries: todoLedger(), errors: ["第 1 行不是合法 JSON"] }) ?? "",
    /账本不可读/,
  );
  assert.deepEqual(evaluateFlowCompletion(flow, { entries: todoLedger(), errors: [] }), { ready: true });
});

test("evaluateFlowCompletion：未结算决定挡住收尾门", () => {
  const flow = parseOk(TODO_FLOW_YAML, "todo-list-v1");
  const ledger = [
    ...todoLedger(),
    entry({
      kind: "customer.decision",
      flowId: "todo-list-v1",
      actorRoleId: "convener",
      power: "schedule",
      decisionKind: "unclassified",
      customerDecision: "none",
    }),
  ];
  const completion = evaluateFlowCompletion(flow, ledger);
  assert.equal(completion.ready, false);
  if (!completion.ready) assert.ok(completion.issues.some((issue) => /未结算/.test(issue)));
});

test("证据类型按 flow 显式 kind，不按 stepId 前缀猜", () => {
  const text = `flowId: explicit-kind-v1
version: 1
qualityTier: production
steps:
  - id: nomination
    title: 名字像客户决定，但显式类型是派发
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: nomination }
  - id: delivery-backend
    title: 名字像派发，但显式类型是客户决定
    owner: Crew
    kind: customer-decision
    status: done
    evidence: { kind: customer-decision, ref: proposal-accept }
  - id: verification
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;
  const flow = parseOk(text, "explicit-kind-v1");
  const ledger = [
    entry({ kind: "dispatch.accepted", flowId: "explicit-kind-v1", stepId: "nomination", targetRoleId: "backend" }),
    entry({
      kind: "customer.decision",
      flowId: "explicit-kind-v1",
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
    }),
  ];
  assert.deepEqual(evaluateFlowCompletion(flow, ledger), { ready: true });

  // 只按前缀猜会给「nomination」找 customer.decision——显式 kind 不会。
  const wrongStyleLedger = [
    entry({
      kind: "customer.decision",
      flowId: "explicit-kind-v1",
      actorRoleId: "nominator",
      power: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
    }),
  ];
  const wrong = evaluateFlowCompletion(flow, wrongStyleLedger);
  assert.equal(wrong.ready, false);
  if (!wrong.ready) {
    assert.ok(wrong.issues.some((issue) => /dispatch\.accepted/.test(issue)));
  }
});

// —————————————————————— 治理门禁 YAML 优先 ——————————————————————

function withRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ans-flow-state-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function gateLedger(flowId: string): GovernanceLedgerEntry[] {
  return [
    entry({
      kind: "customer.decision",
      flowId,
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
    }),
    entry({
      kind: "customer.decision",
      flowId,
      actorRoleId: "nominator",
      power: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      targetRoleIds: ["A"],
    }),
  ];
}

const GATE_FLOW_YAML = `flowId: flow-a
version: 1
qualityTier: prototype
steps:
  - id: impl
    title: 实现
    owner: A
    kind: dispatch
    status: pending
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;

/** O2 派发门槛所需的实施前验收标准（结构合格）。 */
function writeGateCriteria(root: string): void {
  mkdirSync(join(root, "docs", "acceptance"), { recursive: true });
  writeFileSync(
    join(root, "docs", "acceptance", "flow-a-criteria-v1.md"),
    [
      "# 验收完成标准：flow-a",
      "",
      "| ID | 标准 | 需要的证据 | 结果 |",
      "| --- | --- | --- | --- |",
      "| P1 | 示例标准 | 测试输出 | 待判定 |",
      "",
      "风险档位：T3（治理/权限变更）。",
      "",
      "判定规则：pass / fail / insufficient evidence / not applicable。",
      "",
      "证据计划：单测原始输出与全量回归记录。",
      "",
      "版本冻结：v1 写盘后冻结。",
      "",
    ].join("\n"),
    "utf8",
  );
}

test("派发门禁：docs/flows/<flowId>.yaml 存在时以 YAML 为唯一机器状态", () => {
  withRoot((root) => {
    mkdirSync(join(root, "docs", "flows"), { recursive: true });
    writeFileSync(join(root, "docs", "flows", "flow-a.yaml"), GATE_FLOW_YAML, "utf8");
    writeGateCriteria(root);
    const input = {
      projectRoot: root,
      model: "trio" as const,
      roleId: "convener",
      action: "dispatch" as const,
      flowId: "flow-a",
      stepId: "impl",
      targetRoleId: "A",
    };
    assert.deepEqual(evaluateGovernanceGate(input, { entries: gateLedger("flow-a"), errors: [] }), { allowed: true });

    // YAML 坏了 ⇒ fail-closed；即使同名 .md 里写着 impl 也不回落（唯一机器状态）。
    writeFileSync(join(root, "docs", "flows", "flow-a.md"), "| stepId | 步骤 | 状态 |\n| --- | --- | --- |\n| impl | 实现 | pending |\n", "utf8");
    writeFileSync(join(root, "docs", "flows", "flow-a.yaml"), GATE_FLOW_YAML.replace("status: pending", "status: in-progress"), "utf8");
    const denied = evaluateGovernanceGate(input, { entries: gateLedger("flow-a"), errors: [] });
    assert.equal(denied.allowed, false);
    if (!denied.allowed) assert.equal(denied.code, "flow-step-missing");
  });
});

test("派发门禁：YAML 不存在时回落旧版 .md（迁移兼容）", () => {
  withRoot((root) => {
    mkdirSync(join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      join(root, "docs", "flows", "flow-a.md"),
      "| stepId | 步骤 | 状态 |\n| --- | --- | --- |\n| impl | 实现 | pending |\n",
      "utf8",
    );
    writeGateCriteria(root);
    const input = {
      projectRoot: root,
      model: "trio" as const,
      roleId: "convener",
      action: "dispatch" as const,
      flowId: "flow-a",
      stepId: "impl",
      targetRoleId: "A",
    };
    assert.deepEqual(evaluateGovernanceGate(input, { entries: gateLedger("flow-a"), errors: [] }), { allowed: true });
  });
});

// —————————————————————— 写前校验（request_confirmation 路径） ——————————————————————

function roleFixture(root: string): ProjectConfig {
  const roleDir = join(root, "角色卡", "X");
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(join(roleDir, "role-card.md"), "# X\n", "utf8");
  writeFileSync(
    join(roleDir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n",
    "utf8",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
  };
}

function capturingAdapter(): {
  adapter: RuntimeAdapter;
  holder: { caps?: AdapterCapabilities };
} {
  const holder: { caps?: AdapterCapabilities } = {};
  const adapter: RuntimeAdapter = {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      return {
        async prompt() {
          /* 本测试不驱动模型轮次 */
        },
        async *events() {
          yield { kind: "settled", summary: "done", detail: { outcome: "completed" } };
        },
        async dispose() {},
      };
    },
  };
  return { adapter, holder };
}

test("写前校验：确认卡声明 docs/flows/<flowId>.yaml 且 YAML 非法 ⇒ 不发卡（declined，raw 通道零调用）", async () => {
  const root = mkdtempSync(join(tmpdir(), "ans-flow-card-"));
  try {
    const project = roleFixture(root);
    const captured = capturingAdapter();
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test" };
    };
    const handle = await openRoleSession(
      { roleId: "X", project, customerInput: raw },
      {
        createAdapter: (_gate, injected) => {
          captured.holder.caps = injected;
          return captured.adapter;
        },
      },
    );
    try {
      const flowYaml = [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: A",
        "    kind: dispatch",
        "    status: in-progress",
        "  - id: acceptance",
        "    title: 验收",
        "    owner: verifier",
        "    kind: acceptance",
        "    status: pending",
        "",
      ].join("\n");
      const invalid = await captured.holder.caps!.customerInput!({
        kind: "confirm",
        title: "写流程 flow-a",
        preview: `## docs/flows/flow-a.yaml\n${flowYaml}`,
        paths: ["docs/flows/flow-a.yaml"],
      });
      assert.ok(invalid);
      assert.equal(invalid.outcome, "declined");
      assert.match((invalid as { reason?: string }).reason ?? "", /流程 YAML 未通过校验/);
      assert.match((invalid as { reason?: string }).reason ?? "", /steps\[0\]\.status/);
      assert.equal(rawCalls, 0, "校验失败时不得调用原始客户通道（不发卡）");
    } finally {
      await handle.dispose();
    }

    // 合法 YAML：放行到原始客户通道（不误拒）。
    const captured2 = capturingAdapter();
    let rawCalls2 = 0;
    const raw2: CustomerInputFn = () => {
      rawCalls2 += 1;
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test" };
    };
    const handle2 = await openRoleSession(
      { roleId: "X", project, customerInput: raw2 },
      {
        createAdapter: (_gate, injected) => {
          captured2.holder.caps = injected;
          return captured2.adapter;
        },
      },
    );
    try {
      const valid = await captured2.holder.caps!.customerInput!({
        kind: "confirm",
        title: "写流程 flow-a",
        preview: `## docs/flows/flow-a.yaml\n${GATE_FLOW_YAML}`,
        paths: ["docs/flows/flow-a.yaml"],
      });
      assert.ok(valid);
      assert.equal(valid.outcome, "answered");
      assert.equal(rawCalls2, 1);
    } finally {
      await handle2.dispose();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("写前校验（S3/T11）：声明 docs/flows/flow-.yaml ⇒ 宽捕获后显式拒绝该卡，不静默跳过 YAML 校验", async () => {
  const root = mkdtempSync(join(tmpdir(), "ans-flow-card-slug-"));
  try {
    const project = roleFixture(root);
    const captured = capturingAdapter();
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test" };
    };
    const handle = await openRoleSession(
      { roleId: "X", project, customerInput: raw },
      {
        createAdapter: (_gate, injected) => {
          captured.holder.caps = injected;
          return captured.adapter;
        },
      },
    );
    try {
      // preview 完整且内容「自洽」（flowId: flow-），旧路径正则会把该卡当作非 Flow YAML 目标而跳过；
      // 宽捕获后必须显式拒绝并点名候选值，而不是静默放行/忽略。
      const selfConsistent = [
        "flowId: flow-",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: A",
        "    kind: dispatch",
        "    status: pending",
        "  - id: acceptance",
        "    title: 验收",
        "    owner: verifier",
        "    kind: acceptance",
        "    status: pending",
        "",
      ].join("\n");
      const invalid = await captured.holder.caps!.customerInput!({
        kind: "confirm",
        title: "写流程 flow-",
        preview: `## docs/flows/flow-.yaml\n${selfConsistent}`,
        paths: ["docs/flows/flow-.yaml"],
      });
      assert.ok(invalid);
      assert.equal(invalid.outcome, "declined");
      const reason = (invalid as { reason?: string }).reason ?? "";
      assert.match(reason, /流程 YAML 未通过校验/);
      assert.match(reason, /docs\/flows\/flow-\.yaml/);
      assert.match(reason, /不是合法 slug/);
      assert.match(reason, /0,62/, "拒绝文案须展示现行正则");
      assert.equal(rawCalls, 0, "被拒的卡不得触达原始客户通道");
    } finally {
      await handle.dispose();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
