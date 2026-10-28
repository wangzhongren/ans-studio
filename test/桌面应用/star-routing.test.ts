// test/桌面应用/star-routing.test.ts
// B 批（2026-10-28）：星形派发——幕僚可派任意内置/项目 worker；任务落 tasks.jsonl；
// 回交意图携带 taskId；同 idempotencyKey 未收口不重复派；convener 旧 dispatch 保留到 D（仍走旧门）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, DispatchReceipt, DispatchTaskPayload } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "chief" | "schedule"): ProjectListing["roles"][number] => ({
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
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("convener", "schedule"), worker("worker"), worker("other")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string) {
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      const handle: RoleSessionHandle = {
        async send(text, options) {
          (sent[input.roleId] ??= []).push(text);
          (sendOptions[input.roleId] ??= []).push(options ?? {});
        },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 100; tries += 1) {
                    const arr = streams[input.roleId] ?? [];
                    if (i < arr.length) return { value: arr[i++], done: false };
                    await tick(5);
                  }
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  return { mgr, streams, sent, sendOptions, caps };
}

test("星形派发：chief → 项目 worker 受理、任务落盘、投递文本带任务编号、回交意图带 taskId", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief;
    assert.equal(typeof dispatch, "function", "chief 应注入 dispatch_task");
    assert.equal(h.caps.worker, undefined, "项目角色不注入 dispatch_task");

    const receipt = (await dispatch!({ roleId: "worker", task: "实现 X", reason: "排期", sideEffect: "code", expectedOutput: "src/X.ts", requestedEvidence: ["src/X.ts"] })) as DispatchReceipt;
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.match(receipt.message ?? "", /任务编号：#t-/);
    await waitUntil(() => (h.sent.worker?.length ?? 0) > 0);
    assert.match(h.sent.worker[0] ?? "", /任务编号：#t-/);
    assert.match(h.sent.worker[0] ?? "", /期望产出：src\/X\.ts/);
    assert.match(h.sent.worker[0] ?? "", /可选证据：src\/X\.ts/);

    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0);
    const task = [...state.records.values()][0];
    assert.equal(task.created?.from, "chief");
    assert.equal(task.created?.to, "worker");
    assert.equal(task.created?.sideEffect, "code");
    assert.equal(task.delivered?.to, "worker");
    assert.equal(h.sendOptions.worker[0].handback?.taskId, task.taskId);

    // 同 idempotencyKey 未收口：不重复派发。
    const duplicate = (await dispatch!({ roleId: "worker", task: "实现 X", idempotencyKey: task.created!.idempotencyKey })) as DispatchReceipt;
    assert.equal(duplicate.ok, true);
    assert.match(duplicate.message ?? "", new RegExp(`#${task.taskId}`));
    await tick(80);
    assert.equal(h.sent.worker.filter((text) => /实现 X/.test(text)).length, 1, "同一任务只投递一次");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("星形目标：任意内置角色可被派发；幕僚自身拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-builtin-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief!;
    const toConvener = (await dispatch({ roleId: "convener", task: "协调检查", sideEffect: "read-only" })) as DispatchReceipt;
    assert.equal(toConvener.ok, true, toConvener.message ?? "");
    const self = (await dispatch({ roleId: "chief", task: "自派" })) as DispatchReceipt;
    assert.equal(self.ok, false);
    assert.match(self.message ?? "", /不能派发给幕僚自己/);
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("convener D 批撤除 dispatch：运营会话不注入 dispatch_task，不写 tasks.jsonl", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-old-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    assert.equal(h.caps.convener, undefined, "D 批：convener 不再拥有 dispatch_task");
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "未注入能力 ⇒ 不写 tasks.jsonl");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
