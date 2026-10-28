// test/桌面应用/stuck-redispatch.test.ts
// B 批（2026-10-28）：卡死终止后的安全重派——仅 safe 产生新任务（新 taskId + retryOf + 同 idempotencyKey）；
// 原任务 closed/rework；同链最多 2 次重派；unsafe/needs-review 零自动重派、如实升级。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendRoleLog, readRoleLog } from "../../src/common/编排/role-log.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { BackgroundTaskSnapshot, CustomerInputRequest } from "../../src/model/runtime.ts";
import type { DesktopCustomerInputFn, OperatorJudgeResultPayload, OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { createCustomerInputChannel, evaluateDecisionCardRequest } from "../../app/desktop/customer-input.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("until: 等待条件超时");
    await tick(10);
  }
}

function listing(root: string, extraWorker = false): ProjectListing {
  const roles: ProjectListing["roles"] = [
    { roleId: "chief", cardPath: "", boundaryPath: "", cardText: "chief", boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "chief" },
    { roleId: "convener", cardPath: "", boundaryPath: "", cardText: "convener", boundary: { entries: [], boundarySource: "<built-in:convener>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "schedule" },
    { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
  ];
  if (extraWorker) {
    roles.push({ roleId: "worker2", cardPath: "角色卡/worker2/role-card.md", boundaryPath: "角色卡/worker2/boundary.yaml", cardText: "worker2", boundary: { entries: [{ root: "project", path: "src/w2.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker2/boundary.yaml", acceptance: { accepted: false, source: "" } } });
  }
  return {
    projectRoot: root,
    roles,
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string, opts: { abortOk?: boolean; extraWorker?: boolean; customerInput?: DesktopCustomerInputFn; backgroundTasks?: BackgroundTaskSnapshot[]; exitCode?: number; signal?: string } = {}) {
  const sent: Record<string, string[]> = {};
  const listCalls: string[] = [];
  const openCounts: Record<string, number> = {};
  const disposeCounts: Record<string, number> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input): Promise<RoleSessionHandle> => {
      openCounts[input.roleId] = (openCounts[input.roleId] ?? 0) + 1;
      return {
        async send(text) { (sent[input.roleId] ??= []).push(text); },
        events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(40); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
        async abort() { return opts.abortOk === false ? { ok: false, supported: true, error: "演示：终止失败" } : { ok: true, supported: true }; },
        listBackgroundTasks(): BackgroundTaskSnapshot[] { listCalls.push(input.roleId); return opts.backgroundTasks ?? []; },
        async stopBackgroundTask(taskId) {
          const snapshot = (opts.backgroundTasks ?? []).find((task) => task.taskId === taskId);
          return {
            ok: true,
            alreadyEnded: false,
            task: {
              ...(snapshot ?? { taskId, state: "running" as const, command: "test", startedAt: OLD.toISOString(), durationMs: 1 }),
              state: "exited" as const,
              ...(opts.exitCode !== undefined ? { exitCode: opts.exitCode } : {}),
              ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
            },
          };
        },
        async dispose() { disposeCounts[input.roleId] = (disposeCounts[input.roleId] ?? 0) + 1; },
      };
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root, opts.extraWorker === true) : undefined),
    emitEvent: () => {},
    ...(opts.customerInput !== undefined ? { customerInput: opts.customerInput } : {}),
  });
  return { mgr, sent, listCalls, openCounts, disposeCounts };
}

const OLD = new Date("2026-10-28T00:00:00.000Z");

async function seed(root: string, taskId: string, sideEffect: "code" | "external" | "read-only" | "docs" = "code", text = "实现功能"): Promise<void> {
  await appendTaskEvent(root, taskEvent("task.created", {
    taskId,
    from: "chief",
    to: "worker",
    text,
    sideEffect,
    idempotencyKey: `key-${taskId}`,
  }, () => OLD));
  await appendTaskEvent(root, taskEvent("task.delivered", { taskId, to: "worker" }, () => OLD));
}

/** C 批：造出「同链已重派 2 次仍卡死」的状态（下一次 redispatchTask 进入升级卡路径）。 */
async function seedMaxChain(root: string, tag: string): Promise<void> {
  await seed(root, tag);
  await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: `${tag}-r1`, retryOf: tag, to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
  await appendTaskEvent(root, taskEvent("task.created", { taskId: `${tag}-r1`, from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: `key-${tag}` }, () => OLD));
  await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: `${tag}-r2`, retryOf: `${tag}-r1`, to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
  await appendTaskEvent(root, taskEvent("task.created", { taskId: `${tag}-r2`, from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: `key-${tag}` }, () => OLD));
}

test("safe 重派：新 taskId + retryOf + 同 idempotencyKey；原任务 closed/rework；新任务投递", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-"));
  const h = harness(root);
  try {
    await seed(root, "t-safe");
    await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
    await tick(20);
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-safe" });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.safety, "safe");
    assert.equal(result.retryOf, "t-safe");
    assert.equal(result.taskId, "t-safe-r1");
    assert.equal(result.sessionFresh, true, "重派前建立 fresh 会话");
    assert.ok((h.disposeCounts.worker ?? 0) >= 1, "旧会话被 dispose");
    assert.ok((h.openCounts.worker ?? 0) >= 2, "重派前重建 fresh 会话");

    const state = await readTaskState(root);
    assert.equal(state.records.get("t-safe")?.closed?.outcome, "rework");
    assert.equal(state.records.get("t-safe")?.closed?.note, "stuck-terminated:redispatch");
    const next = state.records.get("t-safe-r1")!;
    assert.equal(next.created?.idempotencyKey, "key-t-safe");
    assert.equal(next.retryOf, "t-safe");
    assert.equal(next.created?.sideEffect, "code");
    assert.equal(next.created?.to, "worker");
    assert.match(next.created?.text ?? "", /^实现功能/);
    assert.match(next.created?.text ?? "", /\[重派\] 上次执行卡死；请缩窄范围/);
    const redispatchEvent = [...state.records.values()].flatMap((record) => record.redispatches).find((event) => event.taskId === "t-safe-r1");
    assert.equal(redispatchEvent?.retryOf, "t-safe");
    assert.equal(redispatchEvent?.safety, "safe");

    await tick(150);
    assert.ok((h.sent.worker ?? []).some((text) => /#t-safe-r1/.test(text)), "新任务投递文本带新 taskId");
    assert.ok(h.listCalls.length >= 1, "终止前读取后台任务");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("unsafe：external 副作用 0 次自动重派；原任务保持未收口并如实给原因", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-unsafe-"));
  const h = harness(root);
  try {
    await seed(root, "t-ext", "external", "git push origin main");
    await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
    await tick(20);
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-ext" });
    assert.equal(result.ok, false);
    assert.equal(result.safety, "unsafe");
    assert.equal(result.autoAllowed, false);
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-ext")?.closed, undefined);
    assert.equal(state.records.size, 1, "未产生新任务");
    await tick(100);
    assert.equal((h.sent.worker ?? []).length, 0);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("needs-review：部分写入 ⇒ 不自动重派；终止未确认 ⇒ unsafe", async () => {
  {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-partial-"));
    const h = harness(root);
    try {
      await seed(root, "t-partial", "code");
      await appendRoleLog(root, "worker", { kind: "tool.result", tool: "write_file", status: "ok", summary: "已写入 src/w.ts", ref: "src/w.ts", at: new Date("2026-10-28T00:00:01.000Z").toISOString() });
      await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
      await tick(20);
      const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-partial" });
      assert.equal(result.ok, false);
      assert.equal(result.safety, "needs-review");
      assert.match(result.reasons.join("；"), /部分写入/);
      const state = await readTaskState(root);
      assert.equal(state.records.size, 1);
    } finally {
      await h.mgr.stop(null);
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-abort-fail-"));
    const h = harness(root, { abortOk: false });
    try {
      await seed(root, "t-abort", "docs", "更新文档");
      await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
      await tick(20);
      const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-abort" });
      assert.equal(result.ok, false);
      assert.equal(result.safety, "unsafe");
      assert.match(result.reasons.join("；"), /终止未确认/);
    } finally {
      await h.mgr.stop(null);
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

test("重派上限：同链已 2 次仍卡死 ⇒ 第 3 次不自动重派（升级）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-max-"));
  const h = harness(root);
  try {
    await seed(root, "t-max", "code");
    // 构造两条重派链（事件可先于 created）。
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-max-r1", retryOf: "t-max", to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-max-r1", from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: "key-t-max" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-max-r2", retryOf: "t-max-r1", to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-max-r2", from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: "key-t-max" }, () => OLD));
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-max-r2" });
    assert.equal(result.ok, false);
    assert.equal(result.safety, "needs-review");
    assert.match(result.message, /上限|升级/);
    assert.equal((await readTaskState(root)).records.size, 3, "未产生第 3 次重派任务");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("B-07 自动换人：同链第 2 次重派自动选择替代角色，并缩窄任务", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-replace-"));
  const h = harness(root, { extraWorker: true });
  try {
    await seed(root, "t-auto");
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-auto-r1", retryOf: "t-auto", to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-auto-r1", from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: "key-t-auto" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.delivered", { taskId: "t-auto-r1", to: "worker" }, () => OLD));
    await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
    await tick(20);
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-auto-r1" });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.safety, "safe");
    assert.equal(result.sessionFresh, true);
    const state = await readTaskState(root);
    const next = state.records.get(result.taskId!)!;
    assert.equal(next.created?.to, "worker2", "第 2 次重派自动换人（替代 worker2）");
    assert.equal(next.retryOf, "t-auto-r1");
    assert.match(next.created?.text ?? "", /\[重派\] 上次执行卡死；请缩窄范围/);
    await tick(150);
    assert.ok((h.sent.worker2 ?? []).some((text) => text.includes(result.taskId!)), "替代角色收到重派任务");
    assert.equal(h.openCounts.worker2, 1, "替代角色以新会话接收");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("B-07 升级卡：连续 2 次重派仍卡死 ⇒ 经 customerInput 提交继续/重派/换人/终止（唯一推荐）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-redispatch-escalate-"));
  const captured: CustomerInputRequest[] = [];
  const customerInput: DesktopCustomerInputFn = async (request) => {
    captured.push(request);
    return { outcome: "answered", value: { selected: ["terminate"] }, operatorId: "customer" };
  };
  const h = harness(root, { customerInput });
  try {
    await seed(root, "t-esc");
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-esc-r1", retryOf: "t-esc", to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-esc-r1", from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: "key-t-esc" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-esc-r2", retryOf: "t-esc-r1", to: "worker", reason: "stuck", safety: "safe" }, () => OLD));
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-esc-r2", from: "chief", to: "worker", text: "实现功能", sideEffect: "code", idempotencyKey: "key-t-esc" }, () => OLD));
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-esc-r2" });
    assert.equal(result.ok, false);
    assert.equal(result.escalated, true, result.message);
    assert.equal(result.selected, "terminate");
    assert.equal(result.requestId, "task-escalation-t-esc-2");
    assert.equal(captured.length, 1);
    const request = captured[0];
    assert.equal(request.kind, "choice");
    assert.equal(request.cardKind, "decision");
    assert.equal(request.application, true, "应用直接发起（不借角色槽位）");
    assert.equal(typeof request.flowId, "string");
    const options = request.kind === "choice" ? request.options : [];
    assert.deepEqual(options.map((option) => option.id), ["continue", "redispatch", "replace", "terminate"]);
    assert.deepEqual(options.filter((option) => option.recommended === true).map((option) => option.id), ["terminate"], "恰一个推荐项");
    const gate = evaluateDecisionCardRequest({ request, roleId: "application", governanceModel: "trio" });
    assert.equal(gate.action, "allow", "应用自有 decision 卡通过校验（不扩大角色允许集）");
    if (gate.action === "allow") assert.equal(gate.recommendedOptionId, "terminate");
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-esc-r2")?.closed?.outcome, "rejected");
    assert.equal(state.records.get("t-esc-r2")?.closed?.note, "stuck-escalation:terminate");
    // 同一链重复 tick 不重复发卡（任务已收口 ⇒ 直接返回收口失败）。
    const again = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-esc-r2" });
    assert.equal(again.ok, false);
    assert.equal(captured.length, 1);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("C-04 decision 开关关闭（真实 channel）：升级卡呈现客户，客户选 continue ⇒ 任务保持未收口并留人工处置", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-escalation-switch-off-"));
  const pushed: OperatorRequestPayload[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (request) => pushed.push(request),
    operatorId: "D1",
    nextId: () => `op-${++seq}`,
  });
  const h = harness(root, { customerInput: channel.customerInput });
  try {
    await seedMaxChain(root, "t-switch-off");
    const pending = h.mgr.redispatchTask({ projectRoot: root, taskId: "t-switch-off-r2" });
    await until(() => pushed.length === 1);
    assert.equal(pushed[0]!.request.cardKind, "decision", "应用自有 decision 卡（source=application）");
    const pushedRequest = pushed[0]!.request;
    assert.equal(pushedRequest.kind, "choice");
    const pushedOptions = pushedRequest.kind === "choice" ? pushedRequest.options : [];
    assert.deepEqual(pushedOptions.map((option) => option.id), ["continue", "redispatch", "replace", "terminate"]);
    assert.deepEqual(
      pushedOptions.filter((option) => option.recommended !== undefined).map((option) => option.id),
      ["terminate"],
      "恰一个唯一推荐项",
    );
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["continue"] } }).ok, true);
    const result = await pending;
    assert.equal(result.escalated, true, result.message);
    assert.equal(result.selected, "continue");
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-switch-off-r2")?.closed, undefined, "continue 不自动收口");
    const log = await readRoleLog(root, { roleId: "chief", limit: 30 });
    assert.ok(
      log.entries.some((entry) => entry.kind === "task.escalation.manual" && entry.status === "continue"),
      "continue 的人工处置必须写入角色日志（可追溯）",
    );
  } finally {
    await h.mgr.stop(null);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选 terminate ⇒ 0 张客户卡 + 结果行 + 任务收口", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-escalation-switch-on-"));
  const pushed: OperatorRequestPayload[] = [];
  const rows: OperatorJudgeResultPayload[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({
    presenter: (request) => pushed.push(request),
    operatorId: "D1",
    nextId: () => `op-${++seq}`,
    judge: {
      isGroupEnabled: (group) => group === "decision",
      fn: async (request) => ({
        verdict: "approve",
        group: "decision",
        cardKind: "decision",
        engine: request.runtime,
        reasonCode: "recommended-default",
        selected: ["terminate"],
        durationMs: 1,
      }),
    },
    emitJudgeResult: (row) => rows.push(row),
  });
  const h = harness(root, { customerInput: channel.customerInput });
  try {
    await seedMaxChain(root, "t-switch-on");
    const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-switch-on-r2" });
    assert.equal(result.escalated, true, result.message);
    assert.equal(pushed.length, 0, "开关开启且代批成功 ⇒ 不呈现客户卡");
    assert.equal(rows.length, 1, "恰一条 judge 结果行（可见性条件）");
    assert.equal(rows[0]!.cardKind, "decision");
    assert.deepEqual(rows[0]!.selected, ["terminate"]);
    assert.equal(result.selected, "terminate");
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-switch-on-r2")?.closed?.note, "stuck-escalation:terminate", "代选后按 terminate 处置");
  } finally {
    await h.mgr.stop(null);
    channel.rejectAllPending("cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("C-04 升级卡 redispatch/replace：不自动执行危险动作，写人工处置系统行且任务保持未收口", async () => {
  for (const selected of ["redispatch", "replace"] as const) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-escalation-${selected}-`));
    const customerInput: DesktopCustomerInputFn = async () => ({
      outcome: "answered",
      value: { selected: [selected] },
      operatorId: "customer",
    });
    const h = harness(root, { customerInput });
    try {
      await seedMaxChain(root, `t-${selected}`);
      const result = await h.mgr.redispatchTask({ projectRoot: root, taskId: `t-${selected}-r2` });
      assert.equal(result.escalated, true, result.message);
      assert.equal(result.selected, selected);
      const state = await readTaskState(root);
      assert.equal(state.records.get(`t-${selected}-r2`)?.closed, undefined, `${selected} 不自动收口/不自动换人`);
      const log = await readRoleLog(root, { roleId: "chief", limit: 30 });
      assert.ok(
        log.entries.some((entry) => entry.kind === "task.escalation.manual" && entry.status === selected),
        `${selected} 必须留下人工处置记录`,
      );
    } finally {
      await h.mgr.stop(null);
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

test("B-08 终止证据：role.terminated 记录 exit/signal；temp/<role>/ 部分产物物理隔离到 staging", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-terminate-evidence-"));
  const backgroundTask: BackgroundTaskSnapshot = { taskId: "bg-1", state: "running", command: "npm run dev", startedAt: OLD.toISOString(), durationMs: 1 };
  const h = harness(root, { backgroundTasks: [backgroundTask], exitCode: 143, signal: "SIGTERM" });
  try {
    await seed(root, "t-stop");
    const partial = path.join(root, "temp", "worker", "nested", "out.txt");
    await fs.mkdir(path.dirname(partial), { recursive: true });
    await fs.writeFile(partial, "partial output", "utf8");
    await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
    await tick(20);
    const result = await h.mgr.terminateRoleRun({ projectRoot: root, roleId: "worker", runtime: "demo", taskId: "t-stop" });
    assert.equal(result.ok, true, result.message ?? "");
    assert.equal(result.terminationConfirmed, true);
    assert.deepEqual(result.childResults[0], { taskId: "bg-1", ok: true, exitCode: 143, signal: "SIGTERM" });
    assert.ok(result.isolatedArtifacts.includes("temp/worker/nested/out.txt"), `isolated=${JSON.stringify(result.isolatedArtifacts)}`);
    assert.match(result.stagingDir ?? "", /^temp\/worker\/staging\/terminated-t-stop-/);
    await assert.rejects(fs.access(partial), "原 temp 文件已移走");
    assert.equal(await fs.readFile(path.join(root, ...(result.stagingDir ?? "").split("/"), "nested", "out.txt"), "utf8"), "partial output");

    const log = await readRoleLog(root, { roleId: "worker", limit: 20 });
    assert.equal(log.ok, true);
    const terminated = log.entries.find((entry) => entry.kind === "role.terminated");
    assert.ok(terminated);
    assert.match(terminated!.summary, /exitCode=143/);
    assert.match(terminated!.summary, /signal=SIGTERM/);
    assert.match(terminated!.summary, /隔离 1 项/);

    // 有部分写入 ⇒ 后续重派 needs-review（不自动重派）。
    const redispatched = await h.mgr.redispatchTask({ projectRoot: root, taskId: "t-stop" });
    assert.equal(redispatched.ok, false);
    assert.equal(redispatched.safety, "needs-review");
    assert.match(redispatched.reasons.join("；"), /部分写入/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
