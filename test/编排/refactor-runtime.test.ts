// test/编排/refactor-runtime.test.ts
// S4 refactor-runtime 测试：convener 发起/机械写集/越界转 VCA/客户只读/无 customer decision/
// 不产生 trunk 版本；`refactor.request` 事件归属（application，无 decidedBy）。
// 真实 S1 store + S2 RefactorValidator；事件 fake。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

import type { TaskStateEvent } from "../../src/model/runtime.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createRefactorRuntime } from "../../src/pipeline/orchestration/refactor-runtime.ts";
import { AT, FLOW_ID, createTrunkProject } from "./fixtures/trunk-project.ts";

async function setup(options: { flowExists?: boolean } = {}) {
  const project = await createTrunkProject();
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
  });
  const events: TaskStateEvent[] = [];
  const runtime = createRefactorRuntime({
    store: integration.refactorRequests,
    validator: integration.services.refactor,
    emitEvent: async (event) => {
      events.push(event);
    },
    flowExists: () => options.flowExists ?? true,
    allowedModuleRoots: ["src/"],
    now: () => new Date(AT),
  });
  return { project, integration, runtime, events };
}

function submitInput(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "rf-1",
    flowId: FLOW_ID,
    roleId: "convener",
    title: "拆分工具函数",
    reason: "降低重复",
    scope: { modules: ["impl-core"], paths: ["src/"], roles: ["impl"] },
    at: AT,
    ...overrides,
  };
}

test("refactor-runtime：convener 发起 → 机械写集 + refactor.request（application，无 decidedBy）", async () => {
  const { project, integration, runtime, events } = await setup();
  try {
    const result = await runtime.submit(submitInput());
    assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message ?? ""}`);
    if (!result.ok) return;
    assert.ok(result.value.enforcement.writeSet.includes("src/"));
    assert.ok(result.value.enforcement.forbiddenKinds.includes("versioned-doc"));
    const stored = await integration.refactorRequests.list();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.managedBy, "application-scheduler");
    assert.equal(stored[0]?.status, "requested");
    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.kind, "refactor.request");
    if (event.kind === "refactor.request") {
      assert.equal(event.initiatedBy, "convener");
      assert.equal(event.managedBy, "application-scheduler");
      assert.equal((event as unknown as { decidedBy?: string }).decidedBy, undefined, "无客户决定");
      assert.equal((event as unknown as { origin?: string }).origin, undefined);
    }
    // 不产生 trunk 版本（无 trunk manifest）
    assert.equal(await integration.trunk.current(), null);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("refactor-runtime：非 convener 拒绝（无记录/无事件）", async () => {
  const { project, integration, runtime, events } = await setup();
  try {
    const result = await runtime.submit(submitInput({ roleId: "rapporteur" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "refactor-role-not-allowed");
    assert.equal((await integration.refactorRequests.list()).length, 0);
    assert.equal(events.length, 0);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("refactor-runtime：越界（版本化文档/边界）拒绝并提示转 VCA/stable；flow 缺失拒绝", async () => {
  const { project, runtime, events } = await setup();
  try {
    const forbidden = await runtime.submit(
      submitInput({ requestId: "rf-2", scope: { modules: ["docs"], paths: ["docs/proposals/"], roles: ["impl"] } }),
    );
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) {
      // 版本化路径既命中 scope 禁止分类、也可能先被 allowedModuleRoots 拒绝；两者均为 early warning 拒绝。
      assert.ok(
        forbidden.code === "refactor-scope-forbidden" || forbidden.code === "refactor-write-set-forbidden",
        String(forbidden.code),
      );
      assert.match(forbidden.guidance ?? "", /版本变更申请/);
    }
    assert.equal(events.length, 0);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  const missing = await setup({ flowExists: false });
  try {
    const result = await missing.runtime.submit(submitInput({ requestId: "rf-3" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "refactor-flow-missing");
  } finally {
    await fs.rm(missing.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("refactor-runtime：状态流转（accepted/closed）事件无客户决定；重复 requestId 幂等拒绝", async () => {
  const { project, integration, runtime, events } = await setup();
  try {
    assert.equal((await runtime.submit(submitInput())).ok, true);
    const duplicate = await runtime.submit(submitInput());
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.code, "refactor-invalid");

    const accepted = await runtime.close({ requestId: "rf-1", status: "accepted", at: AT });
    assert.equal(accepted.ok, true);
    if (accepted.ok) assert.equal(accepted.value.status, "accepted");
    const closed = await runtime.close({ requestId: "rf-1", status: "closed", at: AT });
    assert.equal(closed.ok, true);
    if (closed.ok) {
      assert.equal(closed.value.status, "closed");
      assert.ok(closed.value.closedAt !== undefined);
    }
    const stored = await integration.refactorRequests.findById("rf-1");
    assert.equal(stored?.status, "closed");
    assert.equal(events.length, 3);
    assert.ok(
      events.every(
        (event) =>
          event.kind === "refactor.request" &&
          (event as unknown as { decidedBy?: string }).decidedBy === undefined,
      ),
    );
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
