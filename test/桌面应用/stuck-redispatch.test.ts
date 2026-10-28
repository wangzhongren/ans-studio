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
import { appendRoleLog } from "../../src/common/编排/role-log.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { BackgroundTaskSnapshot } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

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

function harness(root: string, opts: { abortOk?: boolean } = {}) {
  const sent: Record<string, string[]> = {};
  const listCalls: string[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input): Promise<RoleSessionHandle> => ({
      async send(text) { (sent[input.roleId] ??= []).push(text); },
      events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(40); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
      async abort() { return opts.abortOk === false ? { ok: false, supported: true, error: "演示：终止失败" } : { ok: true, supported: true }; },
      listBackgroundTasks(): BackgroundTaskSnapshot[] { listCalls.push(input.roleId); return []; },
      async dispose() {},
    }),
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  return { mgr, sent, listCalls };
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
