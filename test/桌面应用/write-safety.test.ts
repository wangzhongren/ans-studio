// test/桌面应用/write-safety.test.ts
// C 批（2026-10-28）：appointment-write 保留 + 通用 write 卡删除；角色卡边界 YAML 结构校验失败不落盘。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { validateBoundaryYamlText } from "../../src/service/boundary/resolve-boundary.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { createCustomerInputChannel, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { validateAppointmentWritePreview } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const gate = (() => ({ allowed: false, reason: "test", allowedByRoot: {} })) as unknown as WriteGate;

function requestConfirmationTool(customerInput: (req: unknown) => unknown) {
  const tools = buildGovernedTools(gate, {
    roleId: "nominator",
    runtime: "demo",
    customerInput: customerInput as never,
  });
  const tool = tools.find((entry) => entry.name === "request_confirmation");
  assert.ok(tool);
  return tool!;
}

test("通用 write 卡与 legacy 直调已删除；appointment-write 保留（审批路径）", async () => {
  const schema = describeTool("request_confirmation");
  const enumValues = (schema.parameters.properties as Record<string, { enum?: unknown[] }>).cardKind!.enum;
  assert.deepEqual(enumValues, ["appointment-write"], "模型可见 schema 仅 appointment-write");
  let called = 0;
  const tool = requestConfirmationTool(() => {
    called += 1;
    return { outcome: "answered", value: { confirmed: true } };
  });
  // D 批：write legacy 直调也已删除，非法 cardKind 在触达客户前拒绝。
  const write = await tool.handler({ name: "request_confirmation", args: { title: "普通写盘", cardKind: "write" }, toolCallId: "c1" });
  assert.equal(write.ok, false);
  assert.equal(called, 0);

  const appointment = await tool.handler({
    name: "request_confirmation",
    args: {
      title: "写角色卡",
      cardKind: "appointment-write",
      flowId: "flow-a",
      paths: ["角色卡/worker/role-card.md"],
      preview: "## 角色卡/worker/role-card.md\n# 角色卡\n",
    },
    toolCallId: "c2",
  });
  assert.equal(appointment.ok, true);
  assert.equal(called, 1);
});

test("角色卡边界 YAML：缺 role/entries 或坏语法 ⇒ 校验失败；合法结构通过", () => {
  assert.equal(validateBoundaryYamlText("role: worker\nentries:\n  - kind: file\n    path: src/w.ts\n    purpose: test\n").ok, true);
  assert.equal(validateBoundaryYamlText("role: worker\nentries:\n  - kind: nope\n    path: src/w.ts\n").ok, false, "非法 kind 拒绝");
  assert.equal(validateBoundaryYamlText("role: [\nentries: []\n").ok, false, "坏 YAML 拒绝");
});

// —————————————— C-06：appointment-write 的应用侧 D3 校验与预览结构校验 ——————————————

const AT = new Date("2026-10-28T00:00:00.000Z");

function appointmentListing(root: string): ProjectListing {
  const builtIn = (roleId: "chief" | "nominator", fn: "chief" | "nomination"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("nominator", "nomination"), worker("worker"), worker("worker2")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function sessionHandle(): RoleSessionHandle {
  return {
    async send() {},
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              await tick(40);
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

async function seedD3(
  root: string,
  options: { requestId?: string; decisionId?: string; targetRoleIds?: string[]; taskId?: string; intentId?: string; title?: string } = {},
): Promise<{ requestId: string; decisionId: string }> {
  const requestId = options.requestId ?? "req-d3";
  const decisionId = options.decisionId ?? "decision-req-d3";
  await appendTaskEvent(root, taskEvent("request.created", {
    requestId,
    sourceRoleId: "nominator",
    title: options.title ?? "D3 角色创建",
    context: "选择要创建的项目角色",
    options: [{ id: "worker", label: "worker" }, { id: "worker2", label: "worker2" }],
    recommended: ["worker"],
    ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
    ...(options.intentId !== undefined ? { intentId: options.intentId } : {}),
  }, () => AT));
  await appendTaskEvent(root, taskEvent("request.resolved", {
    requestId,
    decisionId,
    targetRoleIds: options.targetRoleIds ?? ["worker"],
    by: "customer",
    choice: "worker",
    ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
    ...(options.intentId !== undefined ? { intentId: options.intentId } : {}),
  }, () => AT));
  return { requestId, decisionId };
}

test("C-06 appointment-write 应用校验：D3 匹配才发卡；缺 decision/错配/内置/越界一律 declined+notPresented", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-appointment-write-d3-"));
  const { decisionId } = await seedD3(root, { taskId: "t-d3" });
  const pushed: OperatorRequestPayload[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (request) => pushed.push(request),
    operatorId: "tester",
    nextId: () => `op-${++seq}`,
  });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return sessionHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? appointmentListing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" })).ok, true);
    await tick(20);
    const input = capabilities.nominator!.customerInput!;
    const request: CustomerInputRequest = {
      kind: "confirm",
      title: "写角色卡 worker",
      cardKind: "appointment-write",
      paths: ["角色卡/worker/role-card.md", "角色卡/worker/boundary.yaml"],
      preview: "## 角色卡/worker/role-card.md\n# worker\n\n## 组别\n交付\n\n## 角色卡/worker/boundary.yaml\n```yaml\nrole: worker\nentries:\n  - kind: file\n    path: src/w.ts\n    purpose: test\n```\n",
    };
    const baseMeta = {
      cardKind: "appointment-write" as const,
      targetRoleId: "worker",
      decisionId,
      taskId: "t-d3",
      toolCallId: "call-1",
      turnId: "turn-1",
    };
    const pending = input(request, baseMeta);
    await tick(20);
    assert.equal(pushed.length, 1, "D3 匹配 ⇒ 卡片呈现");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");

    const negatives: Array<[string, CustomerInputRequest, Record<string, unknown>]> = [
      ["缺少 decisionId", request, { ...baseMeta, decisionId: "" }],
      ["decisionId 不存在", request, { ...baseMeta, decisionId: "decision-other" }],
      ["target 不在 D3 targetRoleIds", request, { ...baseMeta, targetRoleId: "worker2" }],
      ["taskId 与 D3 不一致", request, { ...baseMeta, taskId: "t-other" }],
      ["内置目标", request, { ...baseMeta, targetRoleId: "nominator" }],
      ["路径越界", { ...request, paths: ["docs/other.md"] }, baseMeta],
      ["无归属键", request, { cardKind: "appointment-write", targetRoleId: "worker", decisionId }],
    ];
    for (const [label, req, meta] of negatives) {
      const out = await input(req, meta as never);
      assert.equal(out?.outcome, "declined", `${label} ⇒ declined`);
      assert.equal(out?.notPresented, true, `${label} ⇒ 卡片未发出`);
      assert.ok((out?.reason ?? "").length > 0, `${label} 须给出原因`);
    }
    assert.equal(pushed.length, 1, "所有负例都不发卡");
  } finally {
    await mgr.stop(null);
    await tick(50);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("C-06 appointment-write 归属键：intentId 与 D3 一致同样可发卡", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-appointment-write-intent-"));
  const { decisionId } = await seedD3(root, { intentId: "intent-d3" });
  const pushed: OperatorRequestPayload[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({ presenter: (request) => pushed.push(request), operatorId: "tester", nextId: () => `op-${++seq}` });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return sessionHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? appointmentListing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    await mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" });
    await tick(20);
    const pending = capabilities.nominator!.customerInput!(
      {
        kind: "confirm",
        title: "写角色卡 worker（intent 归属）",
        cardKind: "appointment-write",
        paths: ["角色卡/worker/role-card.md"],
        preview: "## 角色卡/worker/role-card.md\n# worker\n",
      },
      { cardKind: "appointment-write", targetRoleId: "worker", decisionId, intentId: "intent-d3", toolCallId: "call-2", turnId: "turn-2" } as never,
    );
    await tick(20);
    assert.equal(pushed.length, 1);
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
    assert.equal((await pending)?.outcome, "answered");
  } finally {
    await mgr.stop(null);
    await tick(50);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("C-06 appointment-write 预览结构：role-card 必需章节 / boundary 顶层 role / 路径越界 / 内置目标", () => {
  const roleCard = [
    "# worker",
    "## 组别", "交付",
    "## 工作立场", "对交付负责",
    "## 能力描述", "实现",
    "## 职责与功能导航", "见 feature-map",
    "## 必读资料", "docs",
    "## 交接输入输出", "上下游",
    "## 执行原则", "边界内直接写",
    "## 质量职责", "自检",
    "## 标准工作流", "输入→动作→交付",
    "## 交付物清单", "代码与测试",
  ].join("\n");
  const boundary = "role: worker\nentries:\n  - kind: file\n    path: src/w.ts\n    purpose: test\n";
  const roleCardRel = "角色卡/worker/role-card.md";
  const boundaryRel = "角色卡/worker/boundary.yaml";
  const baseMeta = { cardKind: "appointment-write" as const, targetRoleId: "worker", decisionId: "decision-d3", taskId: "t-1" };
  const validRequest: CustomerInputRequest = {
    kind: "confirm",
    title: "写卡",
    cardKind: "appointment-write",
    paths: [roleCardRel, boundaryRel],
    preview: `## ${roleCardRel}\n${roleCard}\n\n## ${boundaryRel}\n\`\`\`yaml\n${boundary}\`\`\``,
  };
  assert.equal(validateAppointmentWritePreview({ request: validRequest, metadata: baseMeta as never, declaredPaths: validRequest.paths! }), undefined);
  const missingSection: CustomerInputRequest = { ...validRequest, paths: [roleCardRel], preview: `## ${roleCardRel}\n${roleCard.replace("## 质量职责", "")}` };
  assert.match(validateAppointmentWritePreview({ request: missingSection, metadata: baseMeta as never, declaredPaths: missingSection.paths! }) ?? "", /质量职责/);
  const wrongRole: CustomerInputRequest = { ...validRequest, paths: [boundaryRel], preview: `## ${boundaryRel}\n\`\`\`yaml\nrole: other\nentries: []\n\`\`\`` };
  assert.match(validateAppointmentWritePreview({ request: wrongRole, metadata: baseMeta as never, declaredPaths: wrongRole.paths! }) ?? "", /顶层 role/);
  const badYaml: CustomerInputRequest = { ...validRequest, paths: [boundaryRel], preview: `## ${boundaryRel}\n\`\`\`yaml\nrole: worker\nentries: [\n\`\`\`` };
  assert.match(validateAppointmentWritePreview({ request: badYaml, metadata: baseMeta as never, declaredPaths: badYaml.paths! }) ?? "", /YAML 非法/);
  const outside: CustomerInputRequest = { kind: "confirm", title: "写卡", cardKind: "appointment-write", paths: ["docs/other.md"], preview: "## docs/other.md\n内容\n" };
  assert.match(validateAppointmentWritePreview({ request: outside, metadata: baseMeta as never, declaredPaths: outside.paths! }) ?? "", /不在 角色卡\/worker\//);
  const builtInReq: CustomerInputRequest = { ...validRequest, paths: [roleCardRel], preview: `## ${roleCardRel}\n${roleCard}` };
  assert.match(validateAppointmentWritePreview({ request: builtInReq, metadata: { ...baseMeta, targetRoleId: "nominator" } as never, declaredPaths: builtInReq.paths! }) ?? "", /内置治理角色/);
  const legacyReq: CustomerInputRequest = { ...builtInReq, flowId: "flow-a" };
  assert.equal(validateAppointmentWritePreview({ request: legacyReq, metadata: { cardKind: "appointment-write" } as never, declaredPaths: legacyReq.paths! }), undefined, "旧 flow 路径不新增门槛");
});

// ———————————————— 2026-11-04 客户直修：治理写卡（appointment-write）＝客户主权（会话级真实链路） ————————————————

test("治理写卡客户主权（会话级 a）：替我审批开启 ⇒ 真实 SessionManager 呈现客户、judge 0 调用/0 结果行、approval.resolved by=customer", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-gov-write-sovereign-"));
  const { decisionId } = await seedD3(root, { taskId: "t-gov-write" });
  const pushed: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  let judgeCalls = 0;
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (request) => pushed.push(request),
    operatorId: "tester",
    nextId: () => `op-${++seq}`,
    judge: {
      isGroupEnabled: () => true,
      fn: async (request) => {
        judgeCalls += 1;
        return {
          verdict: "approve",
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
          reasonCode: "sufficient",
          value: { confirmed: true },
        };
      },
    },
    emitJudgeResult: (payload) => judgeRows.push(payload),
  });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return sessionHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? appointmentListing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" })).ok, true);
    await tick(20);
    const input = capabilities.nominator!.customerInput!;
    const request: CustomerInputRequest = {
      kind: "confirm",
      title: "写角色卡 worker",
      cardKind: "appointment-write",
      paths: ["角色卡/worker/role-card.md"],
      preview: "## 角色卡/worker/role-card.md\n# worker\n",
    };
    let settled = false;
    const pending = input(request, {
      cardKind: "appointment-write",
      targetRoleId: "worker",
      decisionId,
      taskId: "t-gov-write",
      toolCallId: "call-1",
      turnId: "turn-1",
      judgeContext: {
        flowId: "focus",
        facts: {
          governanceModel: "trio",
          flowId: "focus",
          ledgerErrors: 0,
          unresolvedClarificationCount: 0,
          latestDecisionKinds: [],
          appointmentTargetRoleIds: ["worker"],
        },
      },
    } as never);
    Promise.resolve(pending).then(() => {
      settled = true;
    });
    await tick(50);
    assert.equal(pushed.length, 1, "写卡呈现客户");
    assert.equal(judgeCalls, 0, "判断器 0 调用（开关开启也一样）");
    assert.equal(judgeRows.length, 0, "0 judge 结果行");
    assert.equal(settled, false, "客户作答前不结算");
    const before = await readTaskState(root);
    assert.equal(before.events.filter((event) => event.kind === "approval.resolved").length, 0, "无自动拒绝/自动结算事件");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester", "客户本人确认");
    assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined, "无 judge 审计字段");
    await tick(20);
    const state = await readTaskState(root);
    const approvals = state.events.filter((event) => event.kind === "approval.resolved");
    assert.equal(approvals.length, 1, "客户确认后恰一条 approval.resolved");
    const approval = approvals[0]!;
    if (approval.kind === "approval.resolved") {
      assert.equal(approval.by, "customer");
      assert.equal(approval.operatorId, "tester");
      assert.equal(approval.decision, "confirmed");
      assert.equal(approval.judge, undefined);
    }
    const resolved = state.events.filter((event) => event.kind === "request.resolved" && event.cardKind === "appointment-write");
    assert.equal(resolved.length, 1, "恰一条写卡 request.resolved");
    const writeResolved = resolved[0]!;
    if (writeResolved.kind === "request.resolved") {
      assert.equal(writeResolved.by, "customer");
      assert.equal(writeResolved.choice, "confirmed");
      assert.equal(writeResolved.judge, undefined);
    }
  } finally {
    await mgr.stop(null);
    await tick(50);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("治理写卡客户主权（会话级 b）：替审批关闭 ⇒ 呈现客户；客户拒绝落 approval.resolved by=customer", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-gov-write-decline-"));
  const { decisionId } = await seedD3(root, { taskId: "t-gov-write-decline" });
  const pushed: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  let judgeCalls = 0;
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (request) => pushed.push(request),
    operatorId: "tester",
    nextId: () => `op-${++seq}`,
    judge: {
      isGroupEnabled: () => false,
      fn: async () => {
        judgeCalls += 1;
        throw new Error("开关关闭不应判断");
      },
    },
    emitJudgeResult: (payload) => judgeRows.push(payload),
  });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return sessionHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? appointmentListing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "nominator", runtime: "demo" })).ok, true);
    await tick(20);
    const input = capabilities.nominator!.customerInput!;
    const pending = input(
      {
        kind: "confirm",
        title: "写角色卡 worker（关闭开关）",
        cardKind: "appointment-write",
        paths: ["角色卡/worker/role-card.md"],
        preview: "## 角色卡/worker/role-card.md\n# worker\n",
      },
      {
        cardKind: "appointment-write",
        targetRoleId: "worker",
        decisionId,
        taskId: "t-gov-write-decline",
        toolCallId: "call-2",
        turnId: "turn-2",
        judgeContext: {
          flowId: "focus",
          facts: {
            governanceModel: "trio",
            flowId: "focus",
            ledgerErrors: 0,
            unresolvedClarificationCount: 0,
            latestDecisionKinds: [],
            appointmentTargetRoleIds: ["worker"],
          },
        },
      } as never,
    );
    await tick(50);
    assert.equal(pushed.length, 1, "写卡呈现客户");
    assert.equal(judgeCalls, 0, "开关关闭不判断");
    assert.equal(judgeRows.length, 0);
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "confirm", confirmed: false } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "declined");
    assert.equal(outcome?.outcome === "declined" ? outcome.operatorId : undefined, "tester");
    await tick(20);
    const state = await readTaskState(root);
    const approvals = state.events.filter((event) => event.kind === "approval.resolved");
    assert.equal(approvals.length, 1);
    const approval = approvals[0]!;
    if (approval.kind === "approval.resolved") {
      assert.equal(approval.by, "customer");
      assert.equal(approval.operatorId, "tester");
      assert.equal(approval.decision, "declined");
      assert.equal(approval.judge, undefined);
    }
  } finally {
    await mgr.stop(null);
    await tick(50);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
