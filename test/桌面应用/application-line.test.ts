// test/桌面应用/application-line.test.ts
// C 批（2026-10-28）：申请直达来源角色 + 应用呈现/裁决 + 幕僚系统通知；不镜像/不转发。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "chief" | "proposal" | "schedule"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("rapporteur", "proposal"),
      builtIn("convener", "schedule"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function handle(): RoleSessionHandle {
  return {
    async send() {},
    events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(40); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
    async dispose() {},
  };
}

test("申请直达：来源角色=rapporteur，卡片不镜像，裁决回来源；request.* 事件写 tasks.jsonl", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-application-line-"));
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const envelopes: import("../../app/desktop/session.ts").SessionEventEnvelope[] = [];
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return handle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: (envelope) => envelopes.push(envelope),
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    await tick(20);
    const request: CustomerInputRequest = {
      kind: "choice",
      title: "选择提案版本",
      cardKind: "proposal",
      flowId: "flow-a",
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    };
    const pending = capabilities.rapporteur!.customerInput!(request, { cardKind: "proposal", flowId: "flow-a", toolCallId: "call-1", turnId: "turn-1" } as never);
    await tick(20);
    assert.equal(pushed.length, 1, "申请只呈现一张卡");
    assert.equal(pushed[0]!.roleId, "rapporteur", "卡片来源=发起角色");
    assert.equal((pushed[0] as { mirrorRoleId?: string }).mirrorRoleId, undefined, "不镜像到幕僚");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["accept"]);

    const state = await readTaskState(root);
    const events = state.events;
    const created = events.find((event) => event.kind === "request.created" && event.title === "选择提案版本");
    assert.ok(created && created.kind === "request.created");
    assert.equal(created.sourceRoleId, "rapporteur");
    assert.equal(created.flowId, "flow-a");
    assert.ok(events.some((event) => event.kind === "request.presented" && event.requestId === created.requestId && event.to === "customer"));
    const resolved = events.find((event) => event.kind === "request.resolved" && event.requestId === created.requestId);
    assert.ok(resolved && resolved.kind === "request.resolved");
    assert.equal(resolved.by, "customer");
    assert.equal(resolved.choice, "accept");
    const notified = events.filter((event) => event.kind === "request.notified" && event.requestId === created.requestId);
    assert.deepEqual(notified.map((event) => event.kind === "request.notified" ? event.event : ""), ["created", "presented", "resolved"]);
    assert.ok(notified.every((event) => event.kind === "request.notified" && event.to === "chief"));
    assert.ok(envelopes.some((envelope) => envelope.roleId === "chief" && envelope.event.kind === "message" && (envelope.event.detail as { source?: string } | undefined)?.source === "request-notified"), "幕僚收到系统通知（不是可作答卡）");
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("写侧卡种收口（2026-10-31）：decision 裁决写 selectedOptionIds、不写 targetRoleIds；appointment 仍写 targetRoleIds", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-cardkind-write-"));
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return handle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    await tick(20);

    // 1) decision 卡：选项 customer-local 不是角色——只能进 selectedOptionIds。
    const decisionRequest: CustomerInputRequest = {
      kind: "choice",
      title: "浏览器验收方式",
      cardKind: "decision",
      flowId: "flow-a",
      options: [{ id: "customer-local", label: "客户本机浏览器", recommended: true }, { id: "cdp", label: "CDP" }],
    };
    const decisionPending = capabilities.rapporteur!.customerInput!(decisionRequest);
    await tick(20);
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["customer-local"] } }).ok, true);
    assert.equal((await decisionPending)?.outcome, "answered");

    // 2) appointment 卡：选中项仍是角色集（D3 唯一合法来源）。
    const appointmentRequest: CustomerInputRequest = {
      kind: "choice",
      title: "任命项目角色",
      cardKind: "appointment",
      flowId: "flow-a",
      options: [{ id: "implementer", label: "实现者" }, { id: "qa", label: "测试" }],
    };
    const appointmentPending = capabilities.rapporteur!.customerInput!(appointmentRequest);
    await tick(20);
    assert.equal(channel.respond({ id: pushed[1]!.id, decision: { kind: "choice", selected: ["implementer"] } }).ok, true);
    assert.equal((await appointmentPending)?.outcome, "answered");

    const state = await readTaskState(root);
    const decisionCreated = state.events.find((event) => event.kind === "request.created" && event.title === "浏览器验收方式");
    assert.ok(decisionCreated && decisionCreated.kind === "request.created");
    assert.equal(decisionCreated.cardKind, "decision", "request.created 显式记卡种（应用从 request 取）");
    const decisionResolved = state.events.find((event) => event.kind === "request.resolved" && event.requestId === decisionCreated.requestId);
    assert.ok(decisionResolved && decisionResolved.kind === "request.resolved");
    assert.equal(decisionResolved.cardKind, "decision");
    assert.equal(decisionResolved.targetRoleIds, undefined, "decision 卡裁决不得写 targetRoleIds");
    assert.deepEqual(decisionResolved.selectedOptionIds, ["customer-local"], "选项 id 只进审计字段");

    const appointmentCreated = state.events.find((event) => event.kind === "request.created" && event.title === "任命项目角色");
    assert.ok(appointmentCreated && appointmentCreated.kind === "request.created");
    assert.equal(appointmentCreated.cardKind, "appointment");
    const appointmentResolved = state.events.find((event) => event.kind === "request.resolved" && event.requestId === appointmentCreated.requestId);
    assert.ok(appointmentResolved && appointmentResolved.kind === "request.resolved");
    assert.equal(appointmentResolved.cardKind, "appointment");
    assert.deepEqual(appointmentResolved.targetRoleIds, ["implementer"], "appointment 裁决仍写选中角色集");
    assert.equal(appointmentResolved.selectedOptionIds, undefined, "appointment 角色集不重复写审计字段");
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("项目 worker 无申请线：不注入 customerInput；内置角色才注入", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-application-target-"));
  const channel = createCustomerInputChannel({ presenter: () => {}, operatorId: "tester" });
  const capabilities: Record<string, { customerInput?: CustomerInputFn }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capabilities[input.roleId] = input as { customerInput?: CustomerInputFn };
      return handle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput,
  });
  try {
    assert.equal((await mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    assert.equal((await mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" })).ok, true);
    assert.equal(typeof capabilities.rapporteur!.customerInput, "function");
    assert.equal(capabilities.worker!.customerInput, undefined, "项目 worker 无申请线");
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
