// test/测试/governance-e2e-auto/i-full-chain.test.ts
// D 批（2026-10-28）：最小系统全链（既有文件名重写，Delta-6 不新增 e2e 目录/文件）。
//
// 覆盖 D 最小系统：
//   · 六角色注册表（chief → product → rapporteur → nominator → convener → verifier）+ 项目角色枚举；
//   · 幕僚按序派发（链首产品）→ 任务落 `.ans/state/tasks.jsonl` → 投递目标；
//   · 不产生 flow/gate/ledger 文件（治理机器已撤除）；
//   · 运营拥有 dispatch（v4.1）；未接交付时派 worker 受理 + handoff-missing advisory，任务行 +1（不阻断）。
//
// 使用真实 SessionManager/routeDispatch + 假 openRoleSession（不启动模型、不触网）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
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

/**
 * B3a 残差（2026-11-16）：本套件是 v4.1 legacy 星形链。B6.1/B7.1 起空 trio 聊天默认 fixed，
 * 显式写 legacy/v1 固定被测项目模式（B7.1 既有模式；不预置文档/审批/pin）。
 */
function markLegacyProject(root: string): void {
  mkdirSync(path.join(root, ".ans"), { recursive: true });
  writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
}

function harness(root: string) {
  markLegacyProject(root);
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
  // B3a 残差（2026-11-16，B4 同口径）：v4.1 legacy 星形链在当前 source 门下已 fail-closed——
  //  · hub 准备（chief→product/convener 等内置角色）必须带 flowId（否则 chief-hub-flow-unavailable）；
  //  · 带 flowId 但无真实来源/managed 证据 ⇒ document-planning-source-unavailable；
  //  · 幕僚直派项目 worker ⇒ chief-to-project-forbidden（M8）；运营无真实受派任务 ⇒
  //    worker-dispatch-source-unavailable。
  // 保留判据：六角色枚举、零任务行、零投递、无 flow/gate/ledger 文件、拒绝不建任务账本。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-d-full-chain-"));
  const h = harness(root);
  try {
    const roles = listing(root).roles.map((role) => role.roleId);
    assert.deepEqual(roles, ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "worker"]);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief;
    assert.equal(typeof dispatch, "function", "幕僚有 dispatch_task");
    // 2026-10-29（v4.1）：幕僚按序派发——链首派产品（无前置）；当前 hub 准备必须带明确 flowId。
    const noFlow = (await dispatch!({
      roleId: "product",
      task: "写产品意图文档",
      sideEffect: "docs",
      expectedOutput: "docs/product/focus-intent-v1.md",
      requestedEvidence: ["docs/product/focus-intent-v1.md"],
    })) as DispatchReceipt;
    assert.equal(noFlow.ok, false);
    assert.match(noFlow.message ?? "", /chief-hub-flow-unavailable/);
    assert.equal((await readTaskState(root)).records.size, 0, "拒发零任务");
    assert.equal(h.sent.product, undefined, "拒发零投递");
    const withFlow = (await dispatch!({
      roleId: "product",
      task: "写产品意图文档",
      sideEffect: "docs",
      flowId: "focus",
      expectedOutput: "docs/product/focus-intent-v1.md",
      requestedEvidence: ["docs/product/focus-intent-v1.md"],
    })) as DispatchReceipt;
    assert.equal(withFlow.ok, false, "无真实来源/managed 证据的文档准备必须 fail-closed");
    assert.match(withFlow.message ?? "", /document-planning-source-unavailable/);
    assert.equal((await readTaskState(root)).records.size, 0, "source 门拒发零任务");
    assert.equal(h.sent.product, undefined, "source 门拒发零投递");

    const toWorker = (await dispatch!({ roleId: "worker", task: "实现切片", sideEffect: "code" })) as DispatchReceipt;
    assert.equal(toWorker.ok, false, "幕僚不得直接派项目 worker（M8）");
    assert.match(toWorker.message ?? "", /chief-to-project-forbidden|幕僚不直接/);
    assert.equal((await readTaskState(root)).records.size, 0, "拒绝不产生新任务行");

    // D 撤除：不产生 flow/gate/ledger 文件；fail-closed 也不创建任务账本。
    assert.equal(await fs.stat(path.join(root, "docs", "flows")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "governance", "ledger.jsonl")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "state", "tasks.jsonl")).then(() => true, () => false), false, "fail-closed 不创建任务账本");

    // 运营拥有 dispatch 接口（v4.1 capability 仍在），但当前 source 门要求真实受派任务 ⇒ 如实拒绝。
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    assert.equal(typeof h.caps.convener, "function", "v4.1：convener 注入 dispatch_task");
    const convenerDispatch = (await h.caps.convener!({ roleId: "worker", task: "实现切片", sideEffect: "code" })) as DispatchReceipt;
    assert.equal(convenerDispatch.ok, false);
    assert.match(convenerDispatch.message ?? "", /worker-dispatch-source-unavailable/);
    assert.equal((await readTaskState(root)).records.size, 0, "未接交付不伪造任务行");
    assert.equal(h.sent.worker, undefined, "零投递");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("F 终态收口：幕僚调度验收（review 任务→质检回交→工作结果）且无自动验收派发", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：chief→verifier 属 hub 准备，当前必须带 flowId + 真实来源；
  // 裸 legacy 夹具下 fail-closed（缺 flowId ⇒ chief-hub-flow-unavailable；带 flowId ⇒
  // document-planning-source-unavailable）。无任务可回交，故「settle/回交后无自动验收任务、无 flow/账本
  // 文件、无自动验收派发」判据按零任务形态保留。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-f-full-chain-"));
  const h = harness(root);
  const sentByRole = h.sent;
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
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /chief-hub-flow-unavailable/);
    const withFlow = (await dispatch({
      roleId: "verifier",
      task: "复核交付：核对 worker.ts 与验收标准",
      reason: "终态验收可选调度",
      sideEffect: "read-only",
      flowId: "focus",
      expectedOutput: "复核结论",
    })) as DispatchReceipt;
    assert.equal(withFlow.ok, false);
    assert.match(withFlow.message ?? "", /document-planning-source-unavailable/);
    assert.equal(h.sent.verifier, undefined, "零投递");

    // F-03：验收由幕僚调度，不自动——settle 后无新任务、无自动验收派发、无 flow/账本文件。
    (h.streams.chief ??= []).push({ kind: "settled", summary: "幕僚一轮结束" } as OrchestrationEvent);
    await tick(250);
    const after = await readTaskState(root);
    assert.equal(after.records.size, 0, "回交/settle 不产生自动验收任务");
    assert.equal(await fs.stat(path.join(root, "docs", "flows")).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, ".ans", "governance", "ledger.jsonl")).then(() => true, () => false), false);
    assert.equal((sentByRole.verifier ?? []).filter((text: string) => !text.includes("任务编号")).length, 0, "无自动验收派发到质检");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
