// test/桌面应用/version-decision.test.ts
// 2026-11-02（A2）：版本决策卡/客户/judge/拒绝/超时/中止/重试/并发/恢复/执行（版本修改、新版本开发）。
// 覆盖 AC-3.2–3.8、AC-4、AC-5、AC-7.1/7.2、AC-8.3–8.6、R1-e、R2/R3/R4。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { createCustomerInputChannel, type DesktopCustomerInputFn, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { readRunManifest, writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputOutcome, CustomerInputRequest, ProjectNoteFn, ProjectStateFn, RequestVersionDecisionFn } from "../../src/model/runtime.ts";
import type { VersionDecisionRequest, VersionDecisionResult } from "../../src/model/project-state.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(fn !== undefined ? { governanceFunction: fn } : {}),
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function manifest(flowId: string, runId: string, state: RunManifest["state"] = "draft"): RunManifest {
  const now = "2026-11-02T00:00:00.000Z";
  return {
    schema: "ans-run/v1",
    runId,
    flowId,
    state,
    createdAt: now,
    updatedAt: now,
    ...(state === "pinned" ? { pinnedAt: now, pinnedBy: "app" as const } : {}),
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
}

function handle(): RoleSessionHandle {
  return {
    async send() {},
    events() {
      return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(20); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
    },
    async dispose() {},
  };
}

async function append(root: string, event: Parameters<typeof appendTaskEvent>[1]): Promise<void> {
  const result = await appendTaskEvent(root, event);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
}

async function sha(file: string): Promise<string> {
  try {
    return createHash("sha256").update(await fs.readFile(file)).digest("hex");
  } catch {
    return "<missing>";
  }
}

interface Caps { projectState?: ProjectStateFn; projectNote?: ProjectNoteFn; requestVersionDecision?: RequestVersionDecisionFn }

function makeManager(root: string, options: {
  answer?: (request: CustomerInputRequest) => CustomerInputOutcome | Promise<CustomerInputOutcome>;
  customerInput?: boolean | DesktopCustomerInputFn;
} = {}): { manager: SessionManager; caps: Record<string, Caps>; requests: CustomerInputRequest[]; messages: string[] } {
  const caps: Record<string, Caps> = {};
  const requests: CustomerInputRequest[] = [];
  const messages: string[] = [];
  const injectedCustomerInput = typeof options.customerInput === "function" ? options.customerInput : undefined;
  const customerInput: DesktopCustomerInputFn = async (request, ctx, metadata) => {
    requests.push(request);
    if (injectedCustomerInput !== undefined) return injectedCustomerInput(request, ctx, metadata);
    return options.answer?.(request) ?? { outcome: "declined", operatorId: "customer" };
  };
  const manager = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as unknown as Caps;
      return handle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (candidate) => (candidate === root ? listing(root) : undefined),
    emitEvent: (event) => { if (event.event.kind === "message") messages.push(event.event.summary); },
    ...(options.customerInput === false ? {} : { customerInput }),
  });
  return { manager, caps, requests, messages };
}

async function openChief(manager: SessionManager, root: string): Promise<Caps> {
  const opened = await manager.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "");
  await tick(20);
  return {};
}

function decisionFn(caps: Record<string, Caps>): (input: VersionDecisionRequest, signal?: AbortSignal) => Promise<VersionDecisionResult> {
  const fn = caps["chief"]?.requestVersionDecision;
  assert.equal(typeof fn, "function");
  return fn as (input: VersionDecisionRequest, signal?: AbortSignal) => Promise<VersionDecisionResult>;
}

function messageText(messages: string[]): string {
  return messages.join("\n");
}

test("版本决策前置：参数/flow/pinned/multi-run/pending/channel-unavailable，失败不发卡", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-pre-"));
  try {
    const { manager, caps } = makeManager(root, { answer: () => ({ outcome: "declined", operatorId: "customer" }) });
    try {
      await openChief(manager, root);
      const decide = decisionFn(caps);
      const missing = await decide({ flowId: "focus", action: "version-modify", reason: "x" });
      assert.equal(missing.ok, false);
      assert.equal(missing.code, "flow-not-found");
      assert.equal((await readTaskState(root)).events.filter((event) => event.kind === "request.created").length, 0);

      assert.equal((await writeRunManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"))).ok, true);
      const invalid = await decide({ flowId: "focus", action: "bogus" as never, reason: "" });
      assert.equal(invalid.ok, false);
      assert.equal(invalid.code, "version-decision-invalid");

      assert.equal((await writeRunManifest(root, manifest("focus", "run-20261102-focus-bbbbbbbb"))).ok, true);
      const ambiguous = await decide({ flowId: "focus", action: "version-modify", reason: "x" });
      assert.equal(ambiguous.ok, false);
      assert.equal(ambiguous.code, "run-ambiguous");
      const withRun = await decide({ flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", action: "version-modify", reason: "x" });
      assert.equal(withRun.ok, false);
      assert.equal(withRun.code, "decision-declined");

      assert.equal((await writeRunManifest(root, { ...manifest("focus", "run-20261102-focus-cccccccc"), state: "pinned" })).ok, true);
      const pinned = await decide({ flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", action: "version-modify", reason: "x" });
      assert.equal(pinned.ok, false);
      assert.equal(pinned.code, "run-change-required");
      assert.equal((await readTaskState(root)).events.filter((event) => event.kind === "request.created").length, 1, "只有 before-pinned 的一次发卡");
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("版本决策前置：未决 decision-pending；无 chief 会话 ⇒ channel-unavailable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-pending-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    await append(root, taskEvent("request.created", {
      requestId: `version-decision-${runId}-m1abc-1234abcd`,
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "旧版本决策",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }));
    const { manager, caps } = makeManager(root);
    try {
      await openChief(manager, root);
      const pending = await decisionFn(caps)({ flowId: "focus", action: "version-modify", reason: "x" });
      assert.equal(pending.ok, false);
      assert.equal(pending.code, "decision-pending");
    } finally {
      await manager.stop(null);
    }
    const bare = makeManager(root);
    try {
      const noSession = await bare.manager.requestVersionDecision({
        projectRoot: root,
        roleId: "chief",
        runtime: "demo",
        request: { flowId: "focus", action: "version-modify", reason: "x" },
      });
      assert.equal(noSession.ok, false);
      assert.equal(noSession.code, "channel-unavailable");
    } finally {
      await bare.manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("版本修改（客户）：application-owned 卡、targetVersions、executing→executed；不改 run/文档/任务", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-modify-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    await fs.mkdir(path.join(root, "docs", "product"), { recursive: true });
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "product", "focus-intent-v1.md"), "# intent\n", "utf8");
    const proposalPath = path.join(root, "docs", "proposals", "focus-proposal-v2.md");
    await fs.writeFile(proposalPath, "# proposal\n", "utf8");
    const proposalBefore = await sha(proposalPath);
    const manifestBefore = await sha(path.join(root, ".ans", "runs", runId, "manifest.json"));
    const { manager, caps, requests, messages } = makeManager(root, {
      answer: () => ({ outcome: "answered", value: { selected: ["version-modify"] }, operatorId: "customer" }),
    });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", action: "version-modify", reason: "修引用" });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.action, "version-modify");
      assert.equal(result.flowId, "focus");
      assert.equal(result.targetVersions?.["proposal"], 3);
      assert.equal(result.targetVersions?.["intent"], 2);
      assert.equal(requests.length, 1);
      const card = requests[0] as Extract<CustomerInputRequest, { kind: "choice" }> & { application?: boolean; cardKind?: string };
      assert.equal(card.kind, "choice");
      assert.equal(card.application, true);
      assert.equal(card.cardKind, "decision");
      assert.equal(card.sourceRoleId, "application");
      assert.deepEqual(card.options.map((option) => option.id), ["version-modify", "new-version-development"]);
      assert.equal(card.options.filter((option) => option.recommended === true).length, 1);
      assert.match(card.question ?? "", /未收口任务|已知事实/);
      const events = (await readTaskState(root)).events;
      const created = events.find((event) => event.kind === "request.created");
      assert.equal(created?.kind, "request.created");
      if (created?.kind === "request.created") assert.equal(created.sourceRoleId, "application");
      const resolved = events.find((event) => event.kind === "request.resolved");
      assert.equal(resolved?.kind, "request.resolved");
      if (resolved?.kind === "request.resolved") {
        assert.deepEqual(resolved.selectedOptionIds, ["version-modify"]);
        assert.equal(resolved.by, "customer");
      }
      const audits = events.filter((event) => event.kind === "version.decision");
      assert.deepEqual(audits.map((event) => event.kind === "version.decision" ? event.status : undefined), ["executing", "executed"]);
      const executed = audits.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") {
        assert.equal(executed.targetVersions?.["proposal"], 3);
        assert.equal(executed.attempt, 1);
      }
      assert.equal((await readRunManifest(root, runId)).ok, true);
      assert.equal(await sha(path.join(root, ".ans", "runs", runId, "manifest.json")), manifestBefore);
      assert.equal(await sha(proposalPath), proposalBefore);
      assert.equal((await readTaskState(root)).events.some((event) => event.kind === "task.closed"), false);
      assert.match(messageText(messages), /\[系统·版本决策\]/);
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("版本修改（客户指令 Q9 A）：request.resolved.by=directive + directiveId；version.decision 三值归属", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-directive-"));
  try {
    const runId = "run-20261102-focus-dddddddd";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    const { manager, caps, requests } = makeManager(root, {
      answer: () => ({
        outcome: "answered",
        value: { selected: ["version-modify"] },
        operatorId: "directive:d-9",
        directive: { id: "d-9", action: "select-option" },
      }),
    });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", action: "version-modify", reason: "按客户指令修改" });
      assert.equal(result.ok, true, result.message);
      assert.equal(requests.length, 1);
      const events = (await readTaskState(root)).events;
      const resolved = events.find((event) => event.kind === "request.resolved");
      assert.equal(resolved?.kind, "request.resolved");
      if (resolved?.kind === "request.resolved") {
        assert.equal(resolved.by, "directive", "客户指令不是客户本人点击、也不是 judge");
        assert.equal(resolved.directiveId, "d-9");
        assert.equal(resolved.operatorId, "directive:d-9");
      }
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") {
        assert.equal(executed.decidedBy, "directive");
        assert.equal(executed.directiveId, "d-9");
        assert.equal(executed.operatorId, "directive:d-9");
      }
      assert.equal(events.some((event) => event.kind === "request.presented"), false, "W-6：不伪造 presented");
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("新版本开发（judge 代批）：新 flow/run；旧 flow 全部活动 run 关闭；orphan 旧申请；旧任务不自动关闭", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-newflow-"));
  try {
    const runA = "run-20261102-focus-aaaaaaaa";
    const runB = "run-20261102-focus-bbbbbbbb";
    assert.equal((await writeRunManifest(root, manifest("focus", runA))).ok, true);
    assert.equal((await writeRunManifest(root, manifest("focus", runB))).ok, true);
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    const oldDoc = path.join(root, "docs", "proposals", "focus-proposal-v1.md");
    await fs.writeFile(oldDoc, "# old\n", "utf8");
    const oldDocHash = await sha(oldDoc);
    await append(root, taskEvent("task.created", {
      taskId: "t-old",
      from: "chief",
      to: "worker",
      text: "old unclosed task",
      sideEffect: "read-only",
      idempotencyKey: "k-old",
      flowId: "focus",
      runId: runA,
      runState: "draft",
    }));
    await append(root, taskEvent("task.delivered", { taskId: "t-old", to: "worker" }));
    await append(root, taskEvent("task.reported", { taskId: "t-old", from: "worker", status: "blocked", summary: "old blocked" }));
    await append(root, taskEvent("request.created", {
      requestId: "req-old-pending",
      flowId: "focus",
      cardKind: "proposal",
      sourceRoleId: "rapporteur",
      title: "旧提案卡",
      options: [{ id: "approve", label: "通过" }, { id: "reject", label: "退回" }],
    }));
    const { manager, caps, messages } = makeManager(root, {
      answer: () => ({
        outcome: "answered",
        value: { selected: ["new-version-development"] },
        operatorId: "judge:demo",
        judge: { group: "decision", cardKind: "decision", engine: "demo", reasonCode: "test", selected: ["new-version-development"] },
      }),
    });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", runId: runA, action: "new-version-development", reason: "干净重开" });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.newFlowId, "focus-next");
      assert.match(result.newRunId ?? "", /^run-/);
      assert.deepEqual([...(result.closedRunIds ?? [])].sort(), [runA, runB].sort());
      for (const runId of [runA, runB]) {
        const stored = await readRunManifest(root, runId);
        assert.equal(stored.ok, true);
        if (stored.ok) {
          assert.equal(stored.manifest.state, "closed");
          assert.match(stored.manifest.closeReason ?? "", new RegExp(`superseded-by:focus-next/${result.newRunId}`));
        }
      }
      const newRun = await readRunManifest(root, result.newRunId!);
      assert.equal(newRun.ok, true);
      if (newRun.ok) {
        assert.equal(newRun.manifest.flowId, "focus-next");
        assert.equal(newRun.manifest.state, "draft");
      }
      const events = (await readTaskState(root)).events;
      const orphaned = events.find((event) => event.kind === "request.orphaned" && event.requestId === "req-old-pending");
      assert.equal(orphaned?.kind, "request.orphaned");
      if (orphaned?.kind === "request.orphaned") assert.equal(orphaned.reason, "superseded");
      const focus = events.filter((event) => event.kind === "project.focus").at(-1);
      assert.equal(focus?.kind, "project.focus");
      if (focus?.kind === "project.focus") {
        assert.equal(focus.flowId, "focus-next");
        assert.equal(focus.runId, result.newRunId);
        assert.equal(focus.roleId, "application");
      }
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") {
        assert.equal(executed.action, "new-version-development");
        assert.equal(executed.decidedBy, "judge");
        assert.equal(executed.operatorId, "judge:demo");
        assert.deepEqual([...(executed.closedRunIds ?? [])].sort(), [runA, runB].sort());
        assert.deepEqual(executed.orphanedRequestIds, ["req-old-pending"]);
      }
      assert.equal(events.some((event) => event.kind === "task.closed" && event.taskId === "t-old"), false, "旧未收口任务不自动关闭");
      assert.equal(await sha(oldDoc), oldDocHash, "旧产物保留");
      assert.match(messageText(messages), /focus-next/);
      assert.match(messageText(messages), /判断 agent 代批/);
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("拒绝/重试/通知不吞；超时/不可用写 resolved 不写 version.decision", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-retry-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    let answer: CustomerInputOutcome = { outcome: "declined", operatorId: "customer" };
    const { manager, caps, requests, messages } = makeManager(root, { answer: () => answer });
    try {
      await openChief(manager, root);
      const decide = decisionFn(caps);
      const first = await decide({ flowId: "focus", action: "version-modify", reason: "第一次" });
      assert.equal(first.ok, false);
      assert.equal(first.code, "decision-declined");
      let events = (await readTaskState(root)).events;
      assert.equal(events.filter((event) => event.kind === "version.decision").length, 0);
      assert.equal(events.find((event) => event.kind === "request.resolved")?.kind, "request.resolved");
      answer = { outcome: "answered", value: { selected: ["version-modify"] }, operatorId: "customer" };
      const second = await decide({ flowId: "focus", action: "version-modify", reason: "第二次" });
      assert.equal(second.ok, true, second.message);
      events = (await readTaskState(root)).events;
      const created = events.filter((event) => event.kind === "request.created");
      assert.equal(created.length, 2);
      assert.notEqual(created[0]?.requestId, created[1]?.requestId, "重试使用新 requestId");
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") assert.equal(executed.attempt, 2);
      assert.equal(requests.length, 2);
      assert.equal((messageText(messages).match(/\[系统·版本决策\]/g) ?? []).length, 2, "两次 attempt 的系统行不被吞");
    } finally {
      await manager.stop(null);
    }

    const timeoutRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-timeout-"));
    try {
      assert.equal((await writeRunManifest(timeoutRoot, manifest("focus", runId))).ok, true);
      const timeout = makeManager(timeoutRoot, { answer: () => ({ outcome: "unavailable", operatorId: "customer", reason: "timeout" }) });
      try {
        await openChief(timeout.manager, timeoutRoot);
        const result = await decisionFn(timeout.caps)({ flowId: "focus", action: "version-modify", reason: "x" });
        assert.equal(result.ok, false);
        assert.equal(result.code, "decision-unavailable");
        const events = (await readTaskState(timeoutRoot)).events;
        const resolved = events.find((event) => event.kind === "request.resolved");
        assert.equal(resolved?.kind, "request.resolved");
        if (resolved?.kind === "request.resolved") assert.equal(resolved.choice, "unavailable");
        assert.equal(events.some((event) => event.kind === "version.decision"), false);
      } finally {
        await timeout.manager.stop(null);
      }
      const thrown = makeManager(timeoutRoot, { answer: () => { throw new Error("channel down"); } });
      try {
        await openChief(thrown.manager, timeoutRoot);
        const result = await decisionFn(thrown.caps)({ flowId: "focus", action: "version-modify", reason: "x" });
        assert.equal(result.ok, false);
        assert.equal(result.code, "decision-unavailable", "通道抛错按 decision-unavailable 回执");
        const events = (await readTaskState(timeoutRoot)).events;
        assert.equal(events.some((event) => event.kind === "version.decision"), false);
        assert.ok(events.filter((event) => event.kind === "request.resolved").length >= 2);
      } finally {
        await thrown.manager.stop(null);
      }
    } finally {
      await fs.rm(timeoutRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("发起轮次中止：orphaned(initiator-aborted)、无 resolved/version.decision；晚到答案丢弃", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-abort-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    let settle!: (outcome: CustomerInputOutcome) => void;
    const pending = new Promise<CustomerInputOutcome>((resolve) => { settle = resolve; });
    const { manager, caps } = makeManager(root, { answer: () => pending });
    try {
      await openChief(manager, root);
      const controller = new AbortController();
      const resultPromise = decisionFn(caps)({ flowId: "focus", action: "version-modify", reason: "x" }, controller.signal);
      await tick(40);
      controller.abort();
      const result = await resultPromise;
      assert.equal(result.ok, false);
      assert.equal(result.code, "initiator-aborted");
      let events = (await readTaskState(root)).events;
      assert.equal(events.some((event) => event.kind === "request.resolved"), false);
      assert.equal(events.some((event) => event.kind === "version.decision"), false);
      const orphaned = events.find((event) => event.kind === "request.orphaned");
      assert.equal(orphaned?.kind, "request.orphaned");
      if (orphaned?.kind === "request.orphaned") assert.equal(orphaned.reason, "initiator-aborted");
      settle({ outcome: "answered", value: { selected: ["version-modify"] }, operatorId: "customer" });
      await tick(40);
      events = (await readTaskState(root)).events;
      assert.equal(events.some((event) => event.kind === "request.resolved"), false, "晚到答案不写 resolved");
      assert.equal(events.some((event) => event.kind === "version.decision"), false, "晚到答案不执行");
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("重启恢复：第二未决独立 orphan；F5 resolved-without-execution → uncertain；已 orphaned 排除", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-restore-"));
  const { manager } = makeManager(root);
  try {
    assert.equal((await writeRunManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"))).ok, true);
    const crashRequestId = "version-decision-flow-focus-m1abc-1234abcd";
    const pendingRequestId = "version-decision-flow-focus-m2abc-1234abcd";
    const orphanedRequestId = "version-decision-flow-focus-m3abc-1234abcd";
    await append(root, taskEvent("request.created", {
      requestId: crashRequestId,
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "崩溃窗口",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }));
    await append(root, taskEvent("request.resolved", {
      requestId: crashRequestId,
      decisionId: "decision-crash",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "version-modify",
    }));
    await append(root, taskEvent("request.created", {
      requestId: pendingRequestId,
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "第二未决",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }));
    await append(root, taskEvent("request.created", {
      requestId: orphanedRequestId,
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "已 orphaned",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }));
    await append(root, taskEvent("request.resolved", {
      requestId: orphanedRequestId,
      decisionId: "decision-orphaned",
      cardKind: "decision",
      selectedOptionIds: ["version-modify"],
      by: "customer",
      choice: "version-modify",
    }));
    await append(root, taskEvent("request.orphaned", { requestId: orphanedRequestId, reason: "superseded" }));
    const report = await manager.restoreTasks(root);
    assert.ok((report.versionDecisionsUncertain ?? 0) >= 1);
    const events = (await readTaskState(root)).events;
    const crashAudit = events.find((event) => event.kind === "version.decision" && event.decisionId === "decision-crash");
    assert.equal(crashAudit?.kind, "version.decision");
    if (crashAudit?.kind === "version.decision") {
      assert.equal(crashAudit.status, "uncertain");
      assert.equal(crashAudit.message, "resolved-without-execution-record");
    }
    assert.equal(events.some((event) => event.kind === "version.decision" && event.decisionId === "decision-orphaned"), false);
    const pendingOrphan = events.find((event) => event.kind === "request.orphaned" && event.requestId === pendingRequestId);
    assert.equal(pendingOrphan?.kind, "request.orphaned");
    if (pendingOrphan?.kind === "request.orphaned") assert.equal(pendingOrphan.reason, "restart");
    assert.equal(events.find((event) => event.kind === "request.resolved" && event.requestId === crashRequestId)?.kind, "request.resolved");
  } finally {
    await manager.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("重启对账：executing→executed/uncertain；不重复创建新 flow；执行期 pinned failed 不误判", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-executing-"));
  const { manager } = makeManager(root);
  try {
    const oldRunId = "run-20261102-focus-aaaaaaaa";
    const newRunId = "run-20261102-focus-next-bbbbbbbb";
    assert.equal((await writeRunManifest(root, { ...manifest("focus", oldRunId), state: "closed", closeReason: `superseded-by:focus-next/${newRunId}` })).ok, true);
    assert.equal((await writeRunManifest(root, manifest("focus-next", newRunId))).ok, true);
    const base = {
      schema: "version-decision/v1" as const,
      requestId: "version-decision-flow-focus-m1abc-1234abcd",
      attempt: 1,
      flowId: "focus",
      action: "new-version-development" as const,
      recommendedBy: "chief" as const,
      recommendedAction: "new-version-development" as const,
      decidedBy: "customer" as const,
      reason: "restart",
      oldFlowId: "focus",
      oldRunId,
      newFlowId: "focus-next",
      newRunId,
      closedRunIds: [oldRunId],
      status: "executing" as const,
    };
    await append(root, taskEvent("version.decision", { ...base, decisionId: "decision-ok" }));
    await append(root, taskEvent("version.decision", {
      ...base,
      decisionId: "decision-missing",
      newRunId: "run-20261102-focus-next-cccccccc",
      status: "executing",
    }));
    await append(root, taskEvent("version.decision", {
      ...base,
      decisionId: "decision-failed",
      status: "failed",
      message: "run-change-required",
    }));
    await append(root, taskEvent("project.focus", {
      flowId: "focus-next",
      runId: newRunId,
      roleId: "application",
      sourceDecisionId: "decision-ok",
    }));
    const report = await manager.restoreTasks(root);
    assert.ok((report.versionDecisionsReconciled ?? 0) >= 1);
    assert.ok((report.versionDecisionsUncertain ?? 0) >= 1);
    const events = (await readTaskState(root)).events;
    const okAudit = events.filter((event) => event.kind === "version.decision" && event.decisionId === "decision-ok").at(-1);
    assert.equal(okAudit?.kind, "version.decision");
    if (okAudit?.kind === "version.decision") assert.equal(okAudit.status, "executed");
    const missingAudit = events.filter((event) => event.kind === "version.decision" && event.decisionId === "decision-missing").at(-1);
    assert.equal(missingAudit?.kind, "version.decision");
    if (missingAudit?.kind === "version.decision") assert.equal(missingAudit.status, "uncertain");
    assert.equal(events.some((event) => event.kind === "version.decision" && event.decisionId === "decision-failed" && event.status === "uncertain"), false, "execution-time pinned failed 不被改写为 uncertain");
    assert.equal((await readRunManifest(root, newRunId)).ok, true);
  } finally {
    await manager.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("执行期 pinned（发卡后 pin）：failed/run-change-required、零创建/零关闭/零 orphan", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-pin-late-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    const { manager, caps } = makeManager(root, {
      answer: async () => {
        assert.equal((await writeRunManifest(root, { ...manifest("focus", runId), state: "pinned" })).ok, true);
        return { outcome: "answered", value: { selected: ["new-version-development"] }, operatorId: "customer" };
      },
    });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", runId, action: "new-version-development", reason: "x" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "run-change-required");
      const events = (await readTaskState(root)).events;
      const failed = events.find((event) => event.kind === "version.decision" && event.status === "failed");
      assert.equal(failed?.kind, "version.decision");
      if (failed?.kind === "version.decision") assert.equal(failed.message, "run-change-required");
      assert.equal(events.some((event) => event.kind === "project.focus" && event.roleId === "application"), false);
      const stored = await readRunManifest(root, runId);
      assert.equal(stored.ok, true);
      if (stored.ok) assert.equal(stored.manifest.state, "pinned", "未关闭任何 run");
      const flows = (await manager.projectStateView(root, { full: true })).flows.map((flow) => flow.flowId);
      assert.deepEqual(flows, ["focus"], "未创建新 flow");
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("关闭阶段失败（部分失败）：停止关闭其余 run，failed 如实记录 closedRunIds；不切 focus", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-close-fail-"));
  try {
    const runA = "run-20261102-focus-aaaaaaaa";
    const runB = "run-20261102-focus-bbbbbbbb";
    const manifestA = { ...manifest("focus", runA), createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" };
    const manifestB = { ...manifest("focus", runB), createdAt: "2026-11-02T00:00:01.000Z", updatedAt: "2026-11-02T00:00:01.000Z" };
    assert.equal((await writeRunManifest(root, manifestA)).ok, true);
    assert.equal((await writeRunManifest(root, manifestB)).ok, true);
    const manifestBPath = path.join(root, ".ans", "runs", runB, "manifest.json");
    const manifestBDir = path.dirname(manifestBPath);
    const { manager, caps } = makeManager(root, {
      answer: async () => {
        // closeRun 以临时文件 + rename 落盘；只读文件在 macOS 仍可被 rename 覆盖，目录只读才能让关闭确定性失败。
        await fs.chmod(manifestBPath, 0o444);
        await fs.chmod(manifestBDir, 0o555);
        return { outcome: "answered", value: { selected: ["new-version-development"] }, operatorId: "customer" };
      },
    });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", runId: runA, action: "new-version-development", reason: "x" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "execution-failed");
      assert.equal(result.newFlowId, "focus-next");
      assert.deepEqual(result.closedRunIds, [runA], "先关闭 runA 后 runB 失败，停止其余关闭");
      const events = (await readTaskState(root)).events;
      const failed = events.filter((event) => event.kind === "version.decision" && event.status === "failed").at(-1);
      assert.equal(failed?.kind, "version.decision");
      if (failed?.kind === "version.decision") {
        assert.match(failed.message ?? "", /close-failed/);
        assert.deepEqual(failed.closedRunIds, [runA]);
      }
      assert.equal(events.some((event) => event.kind === "project.focus" && event.roleId === "application"), false, "关闭失败不切 focus");
      const storedA = await readRunManifest(root, runA);
      const storedB = await readRunManifest(root, runB);
      assert.equal(storedA.ok && storedA.manifest.state, "closed");
      assert.equal(storedB.ok && storedB.manifest.state, "draft");
    } finally {
      await fs.chmod(manifestBDir, 0o755).catch(() => undefined);
      await fs.chmod(manifestBPath, 0o666).catch(() => undefined);
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R1-e/执行侧坏 manifest：无关坏 manifest 不阻断前置；版本修改成功；新版本开发如实 execution-failed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-badmanifest-"));
  try {
    const runId = "run-20261102-focus-aaaaaaaa";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    const brokenDir = path.join(root, ".ans", "runs", "run-20261102-broken-deadbeef");
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, "manifest.json"), "{bad", "utf8");
    const modify = makeManager(root, { answer: () => ({ outcome: "answered", value: { selected: ["version-modify"] }, operatorId: "customer" }) });
    try {
      await openChief(modify.manager, root);
      const result = await decisionFn(modify.caps)({ flowId: "focus", action: "version-modify", reason: "x" });
      assert.equal(result.ok, true, "无关坏 manifest 不阻断版本修改前置/执行");
    } finally {
      await modify.manager.stop(null);
    }
    const recreate = makeManager(root, { answer: () => ({ outcome: "answered", value: { selected: ["new-version-development"] }, operatorId: "customer" }) });
    try {
      await openChief(recreate.manager, root);
      const result = await decisionFn(recreate.caps)({ flowId: "focus", action: "new-version-development", reason: "x" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "execution-failed");
      const events = (await readTaskState(root)).events;
      const failed = events.filter((event) => event.kind === "version.decision" && event.status === "failed").at(-1);
      assert.equal(failed?.kind, "version.decision");
      const stored = await readRunManifest(root, runId);
      assert.equal(stored.ok, true);
      if (stored.ok) assert.equal(stored.manifest.state, "draft", "旧 flow 不动");
    } finally {
      await recreate.manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("requestId/pending 结构化匹配：一个 runId 是另一个前缀时互不串/attempt 正确", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-prefix-"));
  try {
    const runShort = "run-20261102-focus-aaaaaaaa";
    const runLong = "run-20261102-focus-aaaaaaaa-bbbbbbbb";
    assert.equal((await writeRunManifest(root, manifest("focus", runShort))).ok, true);
    assert.equal((await writeRunManifest(root, manifest("focus", runLong))).ok, true);
    const longRequestId = `version-decision-${runLong}-m1abc-1234abcd`;
    await append(root, taskEvent("request.created", {
      requestId: longRequestId,
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "application",
      title: "长 run 未决",
      options: [{ id: "version-modify", label: "版本修改" }, { id: "new-version-development", label: "新版本开发" }],
    }));
    const { manager, caps } = makeManager(root, { answer: () => ({ outcome: "answered", value: { selected: ["version-modify"] }, operatorId: "customer" }) });
    try {
      await openChief(manager, root);
      const result = await decisionFn(caps)({ flowId: "focus", runId: runShort, action: "version-modify", reason: "x" });
      assert.equal(result.ok, true, "长 runId 的未决不阻塞短 runId");
      const events = (await readTaskState(root)).events;
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") assert.equal(executed.attempt, 1);
      const longAudit = events.filter((event) => event.kind === "version.decision" && event.requestId === longRequestId);
      assert.equal(longAudit.length, 0);
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// ———————————————— 2026-11-04 客户直修：版本决策卡不被「替我决策」代选（真实通道） ————————————————
//
// 客户原话：「新建版本，修改版本，这个必须弹出客户确认。不能自动替我待批。」
// 真实 createCustomerInputChannel + 开关开启：卡必须呈现客户、零 judge 结果行；
// 客户作答后按既有 mapVersionDecisionAnswer / planVersionDecisionExecution 语义执行。

function realJudgeChannel(): { channel: ReturnType<typeof createCustomerInputChannel>; pushed: OperatorRequestPayload[]; judgeRows: OperatorJudgeResultPayload[] } {
  const pushed: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++seq}`,
    judge: {
      isGroupEnabled: () => true,
      fn: async (request) => ({
        verdict: "approve",
        group: "decision",
        cardKind: "decision",
        engine: request.runtime,
        reasonCode: "recommended-default",
        selected: ["version-modify"],
        durationMs: 1,
      }),
    },
    emitJudgeResult: (row) => judgeRows.push(row),
  });
  return { channel, pushed, judgeRows };
}

async function waitForPushed(pushed: OperatorRequestPayload[]): Promise<void> {
  const end = Date.now() + 3000;
  while (pushed.length === 0 && Date.now() < end) await tick(20);
}

test("2026-11-04 直修：版本修改卡（真实通道 + 替我决策开启）呈现客户、不代选；客户选择后按 customer 执行", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-real-modify-"));
  try {
    const runId = "run-20261104-focus-abcdef12";
    assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
    await fs.mkdir(path.join(root, "docs", "product"), { recursive: true });
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "product", "focus-intent-v1.md"), "# intent\n", "utf8");
    await fs.writeFile(path.join(root, "docs", "proposals", "focus-proposal-v2.md"), "# proposal\n", "utf8");
    const { channel, pushed, judgeRows } = realJudgeChannel();
    const { manager, caps } = makeManager(root, { customerInput: channel.customerInput });
    try {
      await openChief(manager, root);
      const deciding = decisionFn(caps)({ flowId: "focus", action: "version-modify", reason: "客户直修回归" });
      await waitForPushed(pushed);
      assert.equal(pushed.length, 1, "版本修改卡必须呈现客户");
      assert.equal(judgeRows.length, 0, "不得产生 judge 代批结果行");
      const request = pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
      assert.equal((request as { application?: boolean }).application, true);
      assert.deepEqual(request.options.map((option) => option.id), ["version-modify", "new-version-development"]);
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["version-modify"] } }).ok, true);
      const result = await deciding;
      assert.equal(result.ok, true, result.message);
      assert.equal(result.action, "version-modify");
      const events = (await readTaskState(root)).events;
      const resolved = events.find((event) => event.kind === "request.resolved");
      assert.equal(resolved?.kind, "request.resolved");
      if (resolved?.kind === "request.resolved") {
        assert.equal(resolved.by, "customer", "客户本人选择，不是 judge");
        assert.deepEqual(resolved.selectedOptionIds, ["version-modify"]);
      }
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") {
        assert.equal(executed.decidedBy, "customer");
        assert.equal(executed.operatorId, "tester");
        assert.equal(executed.action, "version-modify");
      }
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("2026-11-04 直修：新建版本开发卡（真实通道 + 替我决策开启）呈现客户、不代选；客户选择后按既有语义执行", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vd-real-newflow-"));
  try {
    const runA = "run-20261104-focus-aaaaaaaa";
    const runB = "run-20261104-focus-bbbbbbbb";
    assert.equal((await writeRunManifest(root, manifest("focus", runA))).ok, true);
    assert.equal((await writeRunManifest(root, manifest("focus", runB))).ok, true);
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    const oldDoc = path.join(root, "docs", "proposals", "focus-proposal-v1.md");
    await fs.writeFile(oldDoc, "# old\n", "utf8");
    const oldDocHash = await sha(oldDoc);
    await append(root, taskEvent("task.created", {
      taskId: "t-old2",
      from: "chief",
      to: "worker",
      text: "old unclosed task",
      sideEffect: "read-only",
      idempotencyKey: "k-old2",
      flowId: "focus",
      runId: runA,
      runState: "draft",
    }));
    await append(root, taskEvent("task.delivered", { taskId: "t-old2", to: "worker" }));
    await append(root, taskEvent("task.reported", { taskId: "t-old2", from: "worker", status: "blocked", summary: "old blocked" }));
    await append(root, taskEvent("request.created", {
      requestId: "req-old2-pending",
      flowId: "focus",
      cardKind: "proposal",
      sourceRoleId: "rapporteur",
      title: "旧提案卡",
      options: [{ id: "approve", label: "通过" }, { id: "reject", label: "退回" }],
    }));
    const { channel, pushed, judgeRows } = realJudgeChannel();
    const { manager, caps, messages } = makeManager(root, { customerInput: channel.customerInput });
    try {
      await openChief(manager, root);
      const deciding = decisionFn(caps)({ flowId: "focus", runId: runA, action: "new-version-development", reason: "干净重开" });
      await waitForPushed(pushed);
      assert.equal(pushed.length, 1, "新建版本开发卡必须呈现客户");
      assert.equal(judgeRows.length, 0, "不得产生 judge 代批结果行");
      const request = pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
      assert.deepEqual(
        request.options.filter((option) => option.recommended === true).map((option) => option.id),
        ["new-version-development"],
        "推荐项仍是幕僚行动作（仅供参考，必须由客户决定）",
      );
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["new-version-development"] } }).ok, true);
      const result = await deciding;
      assert.equal(result.ok, true, result.message);
      assert.equal(result.newFlowId, "focus-next");
      assert.match(result.newRunId ?? "", /^run-/);
      assert.deepEqual([...(result.closedRunIds ?? [])].sort(), [runA, runB].sort());
      for (const runId of [runA, runB]) {
        const stored = await readRunManifest(root, runId);
        assert.equal(stored.ok, true);
        if (stored.ok) assert.equal(stored.manifest.state, "closed");
      }
      const events = (await readTaskState(root)).events;
      const executed = events.find((event) => event.kind === "version.decision" && event.status === "executed");
      assert.equal(executed?.kind, "version.decision");
      if (executed?.kind === "version.decision") {
        assert.equal(executed.decidedBy, "customer");
        assert.equal(executed.operatorId, "tester");
        assert.equal(executed.action, "new-version-development");
      }
      const resolved = events.find((event) => event.kind === "request.resolved");
      if (resolved?.kind === "request.resolved") assert.equal(resolved.by, "customer");
      assert.equal(await sha(oldDoc), oldDocHash, "旧产物保留");
      assert.match(messageText(messages), /focus-next/);
    } finally {
      await manager.stop(null);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
