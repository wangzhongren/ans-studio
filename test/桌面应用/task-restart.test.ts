// test/桌面应用/task-restart.test.ts
// B 批（2026-10-28）：重启恢复——重放 tasks.jsonl；未投递任务重新入队（同 taskId/去重键，不重复）；
// 已投递/已报告未收口只展示；坏行跳过；恢复不伪造成功。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

function listing(root: string): ProjectListing {
  return {
    projectRoot: root,
    roles: [
      { roleId: "chief", cardPath: "", boundaryPath: "", cardText: "chief", boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "chief" },
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string) {
  const sent: Record<string, string[]> = {};
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
    emitEvent: () => {},
  });
  return { mgr, sent };
}

test("重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-task-restart-"));
  const h = harness(root);
  try {
    const created = taskEvent("task.created", {
      taskId: "t-pending",
      from: "chief",
      to: "worker",
      text: "实现恢复功能",
      sideEffect: "code",
      idempotencyKey: "key-pending",
    });
    const delivered = taskEvent("task.created", {
      taskId: "t-delivered",
      from: "chief",
      to: "worker",
      text: "已投递任务",
      sideEffect: "docs",
      idempotencyKey: "key-delivered",
    });
    await appendTaskEvent(root, created);
    await appendTaskEvent(root, delivered);
    await appendTaskEvent(root, taskEvent("task.delivered", { taskId: "t-delivered", to: "worker" }));
    await appendTaskEvent(root, taskEvent("task.reported", { taskId: "t-delivered", from: "worker", status: "done", summary: "做完了" }));
    const file = path.join(root, ".ans", "state", "tasks.jsonl");
    await fs.appendFile(file, "{broken line}\n", "utf8");

    const first = await h.mgr.restoreTasks(root);
    assert.equal(first.restored, 1);
    assert.deepEqual(first.taskIds, ["t-pending"]);
    assert.equal(first.skipped, 1, "已投递/已报告任务只展示，不重投");
    await waitUntil(() => (h.sent.worker?.length ?? 0) === 1);
    assert.match(h.sent.worker[0], /任务编号：#t-pending/);
    assert.doesNotMatch(h.sent.worker[0], /已投递任务/);

    const second = await h.mgr.restoreTasks(root);
    assert.equal(second.restored, 0);
    await tick(120);
    assert.equal(h.sent.worker.length, 1, "重复恢复不重复投递");

    const view = await h.mgr.listTasks(root);
    assert.equal(view.errors, 1, "坏行如实计数");
    assert.equal(view.unclosed, 2);
    assert.ok(view.tasks.some((task) => task.taskId === "t-delivered" && task.status === "reported"));
    assert.ok(view.tasks.some((task) => task.taskId === "t-pending" && task.status === "delivered"));
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("任务已收口：恢复不重投；列表显示 closed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-task-restart-closed-"));
  const h = harness(root);
  try {
    const created = taskEvent("task.created", { taskId: "t-closed", from: "chief", to: "worker", text: "已收口", sideEffect: "read-only", idempotencyKey: "key-closed" });
    await appendTaskEvent(root, created);
    await appendTaskEvent(root, taskEvent("task.closed", { taskId: "t-closed", by: "chief", outcome: "accepted" }));
    const restored = await h.mgr.restoreTasks(root);
    assert.equal(restored.restored, 0);
    await tick(80);
    assert.equal(h.sent.worker?.length ?? 0, 0);
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
