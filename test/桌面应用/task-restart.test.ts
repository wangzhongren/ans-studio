// test/桌面应用/task-restart.test.ts
// B 批（2026-10-28）：重启恢复——重放 tasks.jsonl；未投递任务重新入队（同 taskId/去重键，不重复）；
// 已投递/已报告未收口只展示；坏行跳过；恢复不伪造成功。
//
// 2026-11-16（B7 前置收尾批）：v2.0.0 来源门要求真实 run-bound 受派任务。旧夹具的裸 legacy
// `task.created`（无 runId/flowId/run record）会被 drain 的 `inspectAssignedTask` fail-closed 移除，
// 恢复路径永远走不到投递。本文件改用 `git-write-chain-fixture` 的**真实 pinned run**（真实
// intent/计划/激活/initial workflow/freezeExecutionRun）与真实 `createExecutionAssignment`
//（chief→convener 控制任务 + convener→impl 受派任务 + 真实 parentTaskRef），使恢复投递被真实来源门
// 接受。断言口径不变：未投递任务恰重投一次、已投递/已报告不前移、重复恢复不重复投、坏行如实计数。
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { inspectAssignedTask } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { buildWriteChain, createExecutionAssignment, disposeChainSessions } from "../测试/git-write-chain-fixture.ts";
import { disposeOpenedSessions } from "../测试/git-action-cross-runtime-fixture.ts";

after(async () => { await disposeOpenedSessions(); await disposeChainSessions(); });

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

function listing(root: string): ProjectListing {
  return {
    projectRoot: root,
    roles: [
      { roleId: "chief", cardPath: "", boundaryPath: "", cardText: "chief", boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "chief" },
      { roleId: "impl", cardPath: "角色卡/impl/role-card.md", boundaryPath: "角色卡/impl/boundary.yaml", cardText: "impl", boundary: { entries: [{ root: "project", path: "src/impl/", kind: "directory", purpose: "implementation" }], boundarySource: "角色卡/impl/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string) {
  const sent: Record<string, string[]> = {};
  const events: unknown[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input): Promise<RoleSessionHandle> => ({
      async send(text) { (sent[input.roleId] ??= []).push(text); },
      events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(40); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
      async dispose() {},
    }),
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: (event) => { events.push(event); },
  });
  return { mgr, sent, events };
}

test("重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过", { timeout: 300000 }, async () => {
  // 真实 pinned run + 真实受派任务账本：恢复投递必须通过 `inspectAssignedTask` 的来源门。
  const chain = await buildWriteChain({ prefix: "ans-task-restart-" });
  const root = chain.root;
  const h = harness(root);
  try {
    const assignment = await createExecutionAssignment(chain, { controllerTaskId: "restart-controller", workerTaskId: "t-pending" });
    assert.equal(assignment.dispatch.ok, true, JSON.stringify(assignment.dispatch));
    assert.equal(assignment.dispatch.ok && assignment.dispatch.value.kind, "execution");
    // 恢复只看未收口条目：真实链夹具的既有规划任务与本用例控制任务在恢复前收口，使断言只覆盖本用例
    // 的「受派任务恢复 + 已投递只展示 + 坏行」三项事实（不让夹具初始化任务混入 skipped 计数）。
    for (const record of (await readTaskState(root)).records.values()) {
      if (record.created === undefined || record.closed !== undefined || record.taskId === "t-pending") continue;
      assert.equal((await appendTaskEvent(root, taskEvent("task.closed", {
        taskId: record.taskId,
        by: record.created.from,
        outcome: "accepted",
      }))).ok, true, `夹具任务 ${record.taskId} 收口失败`);
    }

    const delivered = taskEvent("task.created", {
      taskId: "t-delivered",
      from: "chief",
      to: "impl",
      text: "已投递任务",
      sideEffect: "docs",
      idempotencyKey: "key-delivered",
    });
    await appendTaskEvent(root, delivered);
    await appendTaskEvent(root, taskEvent("task.delivered", { taskId: "t-delivered", to: "impl" }));
    await appendTaskEvent(root, taskEvent("task.reported", { taskId: "t-delivered", from: "impl", status: "done", summary: "做完了" }));

    const first = await h.mgr.restoreTasks(root);
    assert.equal(first.restored, 1);
    assert.deepEqual(first.taskIds, ["t-pending"]);
    assert.equal(first.skipped, 1, "已投递/已报告任务只展示，不重投");
    // 真实来源门：受派任务必须被 `inspectAssignedTask`（run pin + module + active authorization）接受。
    const gate = await inspectAssignedTask({ projectRoot: root, taskId: "t-pending", actorRoleId: "impl" });
    assert.equal(gate.ok, true, JSON.stringify(gate));
    try {
      await waitUntil(() => (h.sent.impl?.length ?? 0) === 1);
    } catch (error) {
      const record = (await readTaskState(root)).records.get("t-pending");
      throw new Error(`恢复投递未发生：${String(error)} record=${JSON.stringify({ delivered: record?.delivered, reports: record?.reports })}
events=${JSON.stringify(h.events.slice(-12))}`);
    }
    assert.match(h.sent.impl[0], /任务编号：#t-pending/);
    assert.doesNotMatch(h.sent.impl[0], /已投递任务/);
    // 投递成功先落盘 task.delivered（durability），再据此验证「重复恢复不重复投」。
    await waitUntil(async () => (await readTaskState(root)).records.get("t-pending")?.delivered !== undefined);

    const second = await h.mgr.restoreTasks(root);
    assert.equal(second.restored, 0);
    await tick(120);
    assert.equal(h.sent.impl.length, 1, "重复恢复不重复投递");

    // v2.0.0 语义：坏行 ⇒ 受派任务来源门 fail-closed（audit-ledger-unreadable），恢复不得伪造投递。
    // 先在有可读账本时准备第二个真实受派任务，再把坏行写入 tasks.jsonl。
    const assignment2 = await createExecutionAssignment(chain, { controllerTaskId: "restart-controller-2", workerTaskId: "t-pending-2" });
    assert.equal(assignment2.dispatch.ok, true, JSON.stringify(assignment2.dispatch));
    for (const record of (await readTaskState(root)).records.values()) {
      if (record.created === undefined || record.closed !== undefined) continue;
      if (["t-pending", "t-pending-2", "t-delivered"].includes(record.taskId)) continue;
      assert.equal((await appendTaskEvent(root, taskEvent("task.closed", {
        taskId: record.taskId,
        by: record.created.from,
        outcome: "accepted",
      }))).ok, true, `夹具任务 ${record.taskId} 收口失败`);
    }
    const file = path.join(root, ".ans", "state", "tasks.jsonl");
    await fs.appendFile(file, "{broken line}\n", "utf8");
    const afterCorrupt = await h.mgr.restoreTasks(root);
    assert.equal(afterCorrupt.restored, 1, "坏行不清空可读任务记录（恢复仍识别未投递任务）");
    assert.deepEqual(afterCorrupt.taskIds, ["t-pending-2"]);
    await tick(200);
    assert.equal(h.sent.impl.length, 1, "坏行账本下来源门 fail-closed，不得投递或伪造成功");
    assert.equal((await readTaskState(root)).records.get("t-pending-2")?.delivered, undefined, "未投递任务不得被标记 delivered");

    const view = await h.mgr.listTasks(root);
    assert.equal(view.errors, 1, "坏行如实计数");
    assert.equal(view.unclosed, 3);
    assert.ok(view.tasks.some((task) => task.taskId === "t-delivered" && task.status === "reported"));
    assert.ok(view.tasks.some((task) => task.taskId === "t-pending" && task.status === "delivered"));
    assert.ok(view.tasks.some((task) => task.taskId === "t-pending-2" && task.status === "created"));
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
    await disposeOpenedSessions();
    await disposeChainSessions();
  }
});

test("任务已收口：恢复不重投；列表显示 closed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-task-restart-closed-"));
  const h = harness(root);
  try {
    const created = taskEvent("task.created", { taskId: "t-closed", from: "chief", to: "impl", text: "已收口", sideEffect: "read-only", idempotencyKey: "key-closed" });
    await appendTaskEvent(root, created);
    await appendTaskEvent(root, taskEvent("task.closed", { taskId: "t-closed", by: "chief", outcome: "accepted" }));
    const restored = await h.mgr.restoreTasks(root);
    assert.equal(restored.restored, 0);
    await tick(80);
    assert.equal(h.sent.impl?.length ?? 0, 0);
    const view = await h.mgr.listTasks(root);
    assert.equal(view.tasks[0].status, "closed");
    assert.equal(view.unclosed, 0);
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-closed")?.closed?.outcome, "accepted");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
