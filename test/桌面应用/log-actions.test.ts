// test/桌面应用/log-actions.test.ts
// B 批（2026-10-28）：Interface 动作入口——任务列表/角色日志/终止/重派（参数校验 + 如实回执；
// 不弹客户卡、不伪造成功）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDesktopInterface } from "../../app/desktop/interface.ts";
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

test("listTasks / readRoleActivityLog / terminateRoleRun / redispatchTask 参数校验与如实回执", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-log-actions-"));
  const sent: string[] = [];
  const handle: RoleSessionHandle = {
    async send(text) { sent.push(text); },
    events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(40); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
    async abort() { return { ok: true, supported: true }; },
    listBackgroundTasks(): BackgroundTaskSnapshot[] { return []; },
    async dispose() {},
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    listProjectFn: async () => listing(root),
    openRoleSessionFn: async () => handle,
  });
  try {
    await iface.listProject({ projectRoot: root });
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-ui", from: "chief", to: "worker", text: "实现 UI 功能", sideEffect: "code", idempotencyKey: "key-ui" }));
    await appendRoleLog(root, "worker", { kind: "turn.start", summary: "开始一轮", taskId: "t-ui" });

    const tasks = await iface.listTasks({ projectRoot: root });
    assert.equal(tasks.tasks.length, 1);
    assert.equal(tasks.tasks[0].taskId, "t-ui");
    assert.equal(tasks.unclosed, 1);
    const invalidTasks = await iface.listTasks({ projectRoot: "" });
    assert.deepEqual(invalidTasks, { projectRoot: "", tasks: [], errors: 0, unclosed: 0 });

    const log = await iface.readRoleActivityLog({ projectRoot: root, roleId: "worker" });
    assert.equal(log.ok, true);
    assert.match(log.text ?? "", /turn\.start/);
    const badLog = await iface.readRoleActivityLog({ projectRoot: root, roleId: "" });
    assert.equal(badLog.ok, false);

    const opened = await iface.openSession({ projectRoot: root, roleId: "worker", runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    const terminated = await iface.terminateRoleRun({ projectRoot: root, roleId: "worker", runtime: "demo", taskId: "t-ui" });
    assert.equal(terminated.ok, true, terminated.message ?? "");
    assert.equal(terminated.terminationConfirmed, true);
    const badTerminate = await iface.terminateRoleRun({ projectRoot: root, roleId: "", runtime: "demo" });
    assert.equal(badTerminate.ok, false);
    assert.equal(badTerminate.terminationConfirmed, false);

    const redispatched = await iface.redispatchTask({ projectRoot: root, taskId: "t-ui" });
    assert.equal(redispatched.ok, true, redispatched.message);
    assert.equal(redispatched.safety, "safe");
    assert.equal(redispatched.retryOf, "t-ui");
    const state = await readTaskState(root);
    // e71501c 起（B5 stuck-redispatch 同口径）：原任务由 recordTaskFailure 写 failed 报告
    // （stuck-terminated:redispatch），不再写 task.closed/rework；任务保持未收口。
    assert.equal(state.records.get("t-ui")?.closed, undefined, "重派不 close 原任务（当前语义：失败报告、未收口）");
    const originalFailure = state.records.get("t-ui")?.reports.at(-1);
    assert.equal(originalFailure?.status, "failed", "原任务末条报告为 failed");
    assert.match(originalFailure?.summary ?? "", /stuck-terminated:redispatch/, "失败报告带重派终止标记");
    assert.equal(state.records.get(redispatched.taskId!)?.retryOf, "t-ui");
    await tick(120);
    // v2.0.0/e71501c 交付层：项目 worker 的派发投递要求真实受派任务/run 绑定（openInternal →
    // resolveDeliveryAssignment）；本裸 legacy 任务无 runId/pinned run ⇒ 投递按来源门 fail-closed
    // （B5 stuck-redispatch 同口径，不是产品回归）。重派回执与新任务账本事实仍如实；不伪造送达。
    assert.equal(sent.some((text) => text.includes(redispatched.taskId!)), false, "裸 legacy 任务无 run 绑定 ⇒ 不投递（来源门 fail-closed）");
    assert.equal((await readTaskState(root)).records.get(redispatched.taskId!)?.retryOf, "t-ui", "新任务账本事实保留");

    // B-03 演化（v2.0.0/e71501c）：客户面板 closeTask 不得冒充角色收口——收口只由任务原创建者
    // 经角色能力（close_created_task）执行。接口层级如实拒绝，且不写 task.closed（不重写历史）。
    await appendTaskEvent(root, taskEvent("task.created", { taskId: "t-close", from: "chief", to: "worker", text: "可收口任务", sideEffect: "docs", idempotencyKey: "key-close" }));
    const closed = await iface.closeTask({ projectRoot: root, taskId: "t-close", outcome: "accepted", note: "证据齐全" });
    assert.equal(closed.ok, false, "客户面板不得冒充角色收口");
    assert.match(closed.message ?? "", /原创建者.*收口能力/, `收口拒绝如实指向原创建者：${closed.message}`);
    assert.equal((await readTaskState(root)).records.get("t-close")?.closed, undefined, "拒绝路径不写 task.closed");
    const closedAgain = await iface.closeTask({ projectRoot: root, taskId: "t-close", outcome: "rework" });
    assert.equal(closedAgain.ok, false, "重复调用同样如实失败（不重写历史）");

    const badRedispatch = await iface.redispatchTask({ projectRoot: root, taskId: "" });
    assert.equal(badRedispatch.ok, false);
    assert.equal(badRedispatch.safety, "unsafe");
  } finally {
    await iface.stopSession();
    await fs.rm(root, { recursive: true, force: true });
  }
});
