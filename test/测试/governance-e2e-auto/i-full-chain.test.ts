// test/测试/governance-e2e-auto/i-full-chain.test.ts
// D 批（2026-10-28）：最小系统全链（既有文件名重写，Delta-6 不新增 e2e 目录/文件）。
//
// 覆盖 D 最小系统：
//   · 六角色注册表（chief → product → rapporteur → nominator → convener → verifier）+ 项目角色枚举；
//   · 幕僚按序派发（链首产品）→ 任务落 `.ans/state/tasks.jsonl` → 投递目标；
//   · 不产生 flow/gate/ledger 文件（治理机器已撤除）；
//   · 运营拥有 dispatch（v4.1）但未接交付时派 worker 被拒（M6）。
//
// 使用真实 SessionManager/routeDispatch + 假 openRoleSession（不启动模型、不触网）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}
/** 投递是异步队列：回执只承诺“受理/已创建”；断言 task.delivered 前须等它真实落盘（不猜时序）。 */
async function waitUntilTaskState(
  root: string,
  check: (state: Awaited<ReturnType<typeof readTaskState>>) => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const state = await readTaskState(root);
    if (check(state)) return;
    if (Date.now() - start > timeoutMs) throw new Error("等待 tasks.jsonl 超时");
    await tick(10);
  }
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, governanceFunction: ProjectListing["roles"][number]["governanceFunction"]) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  const worker = (roleId: string) => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project" as const, path: `src/${roleId}.ts`, kind: "file" as const, purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      worker("worker"),
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string) {
  const sent: Record<string, string[]> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const streams: Record<string, OrchestrationEvent[]> = {};
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
  return { mgr, sent, sendOptions, caps, streams };
}

test("最小系统全链（v4.1）：六角色枚举 + 幕僚链首派发落 tasks.jsonl + 无 flow/gate/ledger + 运营派发作用域", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-d-full-chain-"));
  const h = harness(root);
  try {
    const roles = listing(root).roles.map((role) => role.roleId);
    assert.deepEqual(roles, ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "worker"]);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief;
    assert.equal(typeof dispatch, "function", "幕僚有 dispatch_task");
    // 2026-10-29（v4.1）：幕僚按序派发——链首派产品（无前置）；不得跳过链直接派项目 worker（M8）。
    const receipt = (await dispatch!({
      roleId: "product",
      task: "写产品意图文档",
      sideEffect: "docs",
      expectedOutput: "docs/product/focus-intent-v1.md",
      requestedEvidence: ["docs/product/focus-intent-v1.md"],
    })) as DispatchReceipt;
    assert.equal(receipt.ok, true, receipt.message ?? "");
    await waitUntil(() => (h.sent.product?.length ?? 0) > 0);
    assert.match(h.sent.product[0] ?? "", /任务编号：#t-/);
    // 回执仅为「受理」（受理 ≠ 完成）；task.delivered 在目标会话真实接收后异步落盘，等它可读再断言。
    await waitUntilTaskState(root, (snapshot) =>
      [...snapshot.records.values()].some((record) => record.created?.to === "product" && record.delivered?.to === "product"));
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0);
    const task = [...state.records.values()][0];
    assert.equal(task.created?.from, "chief");
    assert.equal(task.created?.to, "product");
    assert.equal(task.delivered?.to, "product");
    assert.equal(h.sendOptions.product[0].handback?.taskId, task.taskId);
    const toWorker = (await dispatch!({ roleId: "worker", task: "实现切片", sideEffect: "code" })) as DispatchReceipt;
    assert.equal(toWorker.ok, false, "幕僚不得直接派项目 worker（M8）");
    assert.equal((await readTaskState(root)).records.size, 1, "拒绝不产生新任务行");

    // D 撤除：不产生 flow/gate/ledger 文件；任务状态是唯一机器状态。
    assert.equal(await fs.stat(path.join(root, "docs", "flows")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "governance", "ledger.jsonl")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "state", "tasks.jsonl")).then(() => true, () => false), true);

    // 运营拥有 dispatch（v4.1）但未接交付（无 project-handoff）⇒ 派 worker 被拒（M6）。
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    assert.equal(typeof h.caps.convener, "function", "v4.1：convener 注入 dispatch_task");
    const convenerDispatch = (await h.caps.convener!({ roleId: "worker", task: "实现切片", sideEffect: "code" })) as DispatchReceipt;
    assert.equal(convenerDispatch.ok, false, "未接交付 ⇒ 运营派实现任务被拒");
    assert.match(convenerDispatch.message ?? "", /交付/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("F 终态收口：幕僚调度验收（review 任务→质检回交→工作结果）且无自动验收派发", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-f-full-chain-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief!;
    const receipt = (await dispatch({
      roleId: "verifier",
      task: "复核交付：核对 worker.ts 与验收标准",
      reason: "终态验收可选调度",
      sideEffect: "read-only",
      expectedOutput: "复核结论",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, true, receipt.message ?? "");
    await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0);
    const state = await readTaskState(root);
    const task = [...state.records.values()][0]!;
    assert.equal(task.created?.to, "verifier");

    // 质检回交（taskId 已知）→ 只投幕僚 [工作结果]；任务状态记 task.reported。
    (h.streams.verifier ??= []).push({
      kind: "handback",
      summary: "复核完成",
      handback: { roleId: "verifier", taskId: task.taskId, status: "completed", summary: "复核通过", evidence: ["src/worker.ts"], at: "2026-10-29T00:00:01.000Z", turnId: "turn-v" },
    } as OrchestrationEvent);
    await waitUntil(() => (h.sent.chief ?? []).some((text) => text.includes("复核通过")));
    assert.match(h.sent.chief.find((text) => text.includes("复核通过"))!, /^\[工作结果\]/);

    // F-03：验收由幕僚调度，不自动——回交/settle 后无新任务、无自动验收派发、无 flow/账本文件。
    (h.streams.verifier ??= []).push({ kind: "settled", summary: "质检一轮结束" } as OrchestrationEvent);
    (h.streams.chief ??= []).push({ kind: "settled", summary: "幕僚一轮结束" } as OrchestrationEvent);
    await tick(250);
    const after = await readTaskState(root);
    assert.equal(after.records.size, 1, "回交/settle 不产生自动验收任务");
    assert.equal(await fs.stat(path.join(root, "docs", "flows")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "governance", "ledger.jsonl")).then(() => true, () => false), false);
    assert.equal((h.sent.verifier ?? []).filter((text) => !text.includes("任务编号")).length, 0, "无自动验收派发到质检");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
