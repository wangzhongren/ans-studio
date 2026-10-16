// 独立复验（测试角色，2026-10-16）：F-2-M1「投递链持有收窄到认领段」的时序对抗核对。
// 自建最小 SessionManager 夹具（独立构造；不复用实施方 test/桌面应用/dispatch-delivery.test.ts
// 的断言），核心能力 = **可控挂起的 send**（模拟真实 Pi「prompt 随整轮 resolve」语义）：
//  - 场景 1「跨目标不阻塞」：A 目标 send 挂起期间，su 派发 B 目标 ⇒ B **立即**收到（不待 A 轮结束）；
//  - 场景 2「同目标仍排队」：同一目标在投递进行中再派 ⇒ 排在其后，绝不并发 send；settled 后按序放行。
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../../src/provider/pi/session.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function listing(): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : { entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
    builtIn: builtIn ? true : undefined,
  });
  return { projectRoot: "/proj", roles: [mk("su", true), mk("A"), mk("B")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

const dispatchTemplate = (from: string, task: string) => `[派发] 来自 ${from} 的任务：${task}——完成后请交回报告`;

function makeHarness() {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [], B: [] };
  const invoked: Record<string, string[]> = { su: [], A: [], B: [] };
  const done: Record<string, string[]> = { su: [], A: [], B: [] };
  const nextGate: Record<string, Promise<void> | undefined> = {};
  const openInputs: Record<string, { dispatchTask?: DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};
  const activeSends: Record<string, number> = {};
  const maxConcurrent: Record<string, number> = {};
  const hangNext = (roleId: string): (() => void) => {
    let release!: () => void;
    nextGate[roleId] = new Promise<void>((resolve) => { release = resolve; });
    return release;
  };
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string, _options?: RoleSessionSendOptions): Promise<void> {
        activeSends[roleId] = (activeSends[roleId] ?? 0) + 1;
        maxConcurrent[roleId] = Math.max(maxConcurrent[roleId] ?? 0, activeSends[roleId]);
        try {
          (invoked[roleId] ??= []).push(text); // 调用即登记（挂起与否都可见）
          const gate = nextGate[roleId];
          if (gate) { nextGate[roleId] = undefined; await gate; }
          (done[roleId] ??= []).push(text);
        } finally { activeSends[roleId] -= 1; }
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 120; tries += 1) {
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] || [];
                  if (i < arr.length) return { value: arr[i++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> { stopped[roleId] = true; },
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openInputs[input.roleId] = { dispatchTask: (input as { dispatchTask?: DispatchTaskFn }).dispatchTask };
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? l : undefined),
    emitEvent: () => {},
  });
  return { mgr, streams, invoked, done, openInputs, hangNext, maxConcurrent, dispatchOf: (roleId: string) => openInputs[roleId]?.dispatchTask };
}

test("F-2 场景 1（跨目标不阻塞）：A 的 send 挂起期间派发 B ⇒ B 立即收到（不待 A 轮结束）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick();
  const dispatch = h.dispatchOf("su");
  assert.ok(dispatch, "su 会话应注入派发能力");

  const releaseA = h.hangNext("A"); // A 的下一次 send 挂起（模拟整轮在跑）
  const ra = (await dispatch!({ roleId: "A", task: "A 的长活动" })) as DispatchReceipt;
  assert.equal(ra.ok, true);
  // 等 A 投递真正开跑（send 被调用且挂起）。
  const began = Date.now();
  while (h.invoked.A.length === 0 && Date.now() - began < 2000) await tick(10);
  assert.equal(h.invoked.A.length, 1, "A 的投递应已开始（且挂起中）");
  assert.equal(h.done.A.length, 0, "A 尚未完成（对照点：此刻仍是挂起态）");

  // 关键时序断言：A 挂起期间派发 B —— 立即送达。
  const t0 = Date.now();
  const rb = (await dispatch!({ roleId: "B", task: "B 的独立活" })) as DispatchReceipt;
  assert.equal(rb.ok, true);
  let delivered = false;
  while (Date.now() - t0 < 1500) {
    if (h.done.B.length === 1) { delivered = true; break; }
    await tick(10);
  }
  const elapsed = Date.now() - t0;
  assert.equal(h.done.A.length, 0, "断言前提：A 的 send 此刻仍未 resolve（修复前链会被它持有）");
  assert.equal(delivered, true, "B 必须在 A 轮未结束时收到投递（认领段后链已释放）");
  assert.ok(elapsed < 1000, `B 的送达须为秒级以下（实际 ${elapsed}ms）`);
  assert.deepEqual(h.done.B, [dispatchTemplate("su", "B 的独立活")]);

  // 放行 A：其投递照常收尾，两边各恰一次、同会话无并发。
  releaseA();
  await tick(150);
  assert.deepEqual(h.done.A, [dispatchTemplate("su", "A 的长活动")]);
  assert.equal(h.maxConcurrent.A ?? 0, 1, "同会话并发 send 峰值须 ≤1");
  assert.equal(h.maxConcurrent.B ?? 0, 1);
  await h.mgr.stop(null);
});

test("F-2 场景 2（同目标仍排队）：投递进行中再派同目标 ⇒ 排队不并发；settled 后按序放行", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick();
  const dispatch = h.dispatchOf("su")!;

  const releaseFirst = h.hangNext("A");
  await dispatch({ roleId: "A", task: "先到的活" });
  const began = Date.now();
  while (h.invoked.A.length === 0 && Date.now() - began < 2000) await tick(10);
  assert.equal(h.invoked.A.length, 1);

  // 同目标第二条（不同文本，避开队列期去重窗口语义——此处只测投递串行）。
  await dispatch({ roleId: "A", task: "后续的活" });
  await tick(400);
  assert.equal(h.invoked.A.length, 1, "同目标投递进行中：第二条**不得**并发 send（仍排队）");
  assert.equal(h.done.A.length, 0);

  // 第一轮结束 → 第二条按序放行。
  releaseFirst();
  await tick(120);
  h.streams.A.push({ kind: "settled", summary: "A 第一轮结束" });
  const t1 = Date.now();
  while (h.done.A.length < 2 && Date.now() - t1 < 2000) await tick(10);
  assert.deepEqual(h.done.A, [dispatchTemplate("su", "先到的活"), dispatchTemplate("su", "后续的活")], "同目标按序投递、不丢不换序");
  assert.equal(h.maxConcurrent.A ?? 0, 1, "同会话并发 send 峰值须 ≤1（排队防护未失真）");
  await h.mgr.stop(null);
});
