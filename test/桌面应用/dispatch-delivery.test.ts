// test/桌面应用/dispatch-delivery.test.ts
// 桌面窗口（H-1，2026-10-12 设计）：**su 派发任务的路由**——复用 E-1 投递机的证据：
// 路由（目标未开→自动开 / 忙→排队按序 / 失败→如实系统行+保留待重投）；校验（非本项目角色/su 自身/
// 空参数 → **如实回执**给工具 + 系统行）；去重（**队列期窗口**，送达即释放以保返工可再派）；闭环
// （su 派发 → 角色回交 → su 收到报告；不重复、不空转）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../src/provider/pi/session.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const HANDBACK_A: TaskHandback = {
  roleId: "A",
  taskId: "H1",
  status: "completed",
  summary: "做完了",
  evidence: ["docs/x.md"],
  at: "2026-10-12T03:00:00.000Z",
};

/** 派发输入文案（与 session.ts 的 `renderDispatchPromptLocal` 同模板；编排 `renderDispatchPrompt`
 *  落地后，本期望改用它——见 change 文档的依赖登记）。 */
const dispatchTemplate = (from: string, task: string, reason?: string) =>
  `[派发] 来自 ${from} 的任务：${task}${reason ? `（原因：${reason}）` : ""}——完成后请交回报告`;

function listing(): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : {
          entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
    builtIn: builtIn ? true : undefined,
  });
  return {
    projectRoot: "/proj",
    roles: [mk("su", true), mk("A"), mk("B")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  sendOptions: Record<string, RoleSessionSendOptions[]>;
  envelopes: import("../../app/desktop/session.ts").SessionEventEnvelope[];
  openCalls: string[];
  /** 打开某角色时拿到的派发能力（仅 su 会话应注入）——测试直接调用以驱动路由。 */
  dispatchOf: (roleId: string) => DispatchTaskFn | undefined;
  /** **F-2 夹具（2026-10-16）**：挂起某角色的**下一次** send——返回 release；在 release 前该 send 的
   *  promise 不 resolve（模拟真实 Pi「prompt 随整轮 resolve」——立即 resolve 的旧桩天然掩盖 F-2 缺陷）。 */
  hangNext: (roleId: string) => () => void;
  /** 各角色 send 的**并发峰值**（对同会话并发 send 的钉子：恒应 ≤1）。 */
  maxConcurrent: Record<string, number>;
}

function makeHarness(opts: { failSends?: Record<string, number>; openDelayMs?: number } = {}): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [], B: [] };
  const sent: Record<string, string[]> = { su: [], A: [], B: [] };
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const envelopes: import("../../app/desktop/session.ts").SessionEventEnvelope[] = [];
  const openCalls: string[] = [];
  const openInputs: Record<string, { dispatchTask?: DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};
  const failLeft: Record<string, number> = { ...(opts.failSends ?? {}) };
  const nextGate: Record<string, Promise<void> | undefined> = {};
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
      async send(text: string, options?: RoleSessionSendOptions): Promise<void> {
        activeSends[roleId] = (activeSends[roleId] ?? 0) + 1;
        maxConcurrent[roleId] = Math.max(maxConcurrent[roleId] ?? 0, activeSends[roleId]);
        try {
          (sendOptions[roleId] ??= []).push(options ?? {});
          const gate = nextGate[roleId];
          if (gate) {
            nextGate[roleId] = undefined;
            await gate; // F-2 夹具：可控挂起——release 前 promise 不 resolve（模拟整轮在跑）
          }
          if ((failLeft[roleId] ?? 0) > 0) {
            failLeft[roleId] = (failLeft[roleId] ?? 0) - 1;
            throw new Error(`演示：${roleId} 投递通道瞬时失败`);
          }
          (sent[roleId] = sent[roleId] || []).push(text);
        } finally {
          activeSends[roleId] -= 1;
        }
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
      async dispose(): Promise<void> {
        stopped[roleId] = true;
      },
    };
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openCalls.push(input.roleId);
      openInputs[input.roleId] = { dispatchTask: (input as { dispatchTask?: DispatchTaskFn }).dispatchTask };
      // F-2-opt2 夹具：可选的开会话延迟——让并发 open 真正重叠（互斥未落地时必现双开）。
      if ((opts.openDelayMs ?? 0) > 0) await new Promise((r) => setTimeout(r, opts.openDelayMs));
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? l : undefined),
    emitEvent: (env) => envelopes.push(env),
  });
  return { mgr, streams, sent, sendOptions, envelopes, openCalls, dispatchOf: (roleId) => openInputs[roleId]?.dispatchTask, hangNext, maxConcurrent };
}

test("H-1 路由：su 派发 → 目标未开**自动开**并收到派发输入（模板文案）；su 与目标两边都有系统行", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su");
  assert.ok(typeof dispatch === "function", "su 会话应注入派发能力（dispatchTask）");
  assert.equal(h.dispatchOf("A"), undefined, "普通角色会话**不**注入（未取过即 undefined）");

  const r = (await dispatch!({ roleId: "A", task: "给 A 的活", reason: "因为排期" })) as DispatchReceipt;
  assert.equal(r.ok, true);
  assert.ok(/已受理/.test(r.message || "") && /未开——将自动开启/.test(r.message || ""), "回执如实（受理≠已完成；会话未开会自动开）");
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback), [{ required: true }]);
  assert.ok(h.openCalls.includes("A"), "目标未开会话 ⇒ **自动开启**");
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "给 A 的活", "因为排期")], "目标收到派发输入（模板文案）");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /已派发任务给 A/.test(e.event.summary)),
    "su 的 pane 有受理回执行"
  );
  assert.ok(
    h.envelopes.some((e) => e.roleId === "A" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /已接收来自 su 的派发任务/.test(e.event.summary)),
    "目标的 pane 有「任务到货」行"
  );
  await h.mgr.stop(null);
});

test("H-1 排队：目标忙 ⇒ 入队；其 settled 后按序放行（绝不并发 send）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("A 先忙一会儿"); // A busy=true
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "排队活" });
  await tick(100);
  assert.deepEqual(h.sent.A, ["A 先忙一会儿"], "A 忙：派发**排队**，不得并发投递");
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback), [{ required: false }, { required: true }]);
  assert.deepEqual(h.sent.A, ["A 先忙一会儿", dispatchTemplate("su", "排队活")], "settled 后按序放行派发");
  await h.mgr.stop(null);
});

test("H-1 失败保留：投递失败 ⇒ 如实系统行（未丢弃）+ 放回队首；下次时机成功送达", async () => {
  // 连失败两次：把「自动开启后的放行」与「入队触发的放行」两条链上的尝试都耗尽，再由下一时机成功。
  const h = makeHarness({ failSends: { A: 2 } });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "会失败一次" });
  await tick(150);
  assert.equal(h.sent.A.length, 0, "投递失败：未送达");
  const note = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /派发投递失败（目标 A）/.test(e.event.summary));
  assert.ok(note, "**如实系统行**（不静默）");
  assert.ok(/未丢弃/.test(note!.event.summary) && /重试/.test(note!.event.summary), "系统行说明「未丢弃 + 重试」");

  h.streams.A.push({ kind: "settled", summary: "重试时机" });
  await tick(150);
  assert.ok(h.sendOptions.A.length >= 3);
  assert.ok(h.sendOptions.A.every(o => o.handback?.required === true), "每次重试保持正式任务来源");
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "会失败一次")], "保留的派发在下次时机成功送达");
  await h.mgr.stop(null);
});

test("H-1 校验（如实回执，不静默）：非本项目角色 / 内置治理角色（含 su 自身）/ 空参数 → {ok:false} + 系统行", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;

  const unknown = (await dispatch({ roleId: "不存在", task: "x" })) as DispatchReceipt;
  assert.equal(unknown.ok, false);
  assert.ok(/不在本项目/.test(unknown.message || ""), "工具收到如实失败原因");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /角色 不存在 不在本项目/.test(e.event.summary)),
    "系统行如实"
  );

  const selfDispatch = (await dispatch({ roleId: "su", task: "x" })) as DispatchReceipt;
  assert.equal(selfDispatch.ok, false);
  assert.ok(/内置治理角色/.test(selfDispatch.message || ""), "指向 su 自身 → 如实拒绝");

  const emptyTask = (await dispatch({ roleId: "A", task: "   " })) as DispatchReceipt;
  assert.equal(emptyTask.ok, false);
  assert.ok(/必须非空/.test(emptyTask.message || ""), "空参数 → 如实拒绝");
  await h.mgr.stop(null);
});

test("H-1 去重：同一派发在**队列期**重复调用 → 去重（只投一次）；送达后同文再派 → 放行（返工回路）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("A 忙");
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;

  const r1 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  const r2 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.ok(/去重/.test(r2.message || ""), "在途窗口内重复调用 → 如实去重回执");
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.A, ["A 忙", dispatchTemplate("su", "返工：改 X")], "在途窗口内**只投一次**");

  // 送达即释放窗口去重：同文再派（返工）应作为**新的一次**放行。
  const r3 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  assert.equal(r3.ok, true);
  assert.ok(!/去重/.test(r3.message || ""), "送达后同文再派 → 新派发（不被去重）");
  h.streams.A.push({ kind: "settled", summary: "又一轮结束" });
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback?.required), [false, true, true]);
  assert.equal(h.sent.A.filter((t) => t === dispatchTemplate("su", "返工：改 X")).length, 2, "返工可再派（共两次投递）");
  await h.mgr.stop(null);
});

test("真机崩溃修复（钉子）：派发条目**不走 handback 渲染**；坏回交并入同一机也不炸、零未捕获拒绝", async () => {
  const rejections: unknown[] = [];
  const onRej = (r: unknown) => {
    rejections.push(r);
  };
  process.on("unhandledRejection", onRej);
  try {
    const h = makeHarness();
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await tick(30);
    const dispatch = h.dispatchOf("su")!;
    await dispatch({ roleId: "A", task: "正常派发" });
    await tick(120);
    assert.deepEqual(
      h.sent.A,
      [dispatchTemplate("su", "正常派发")],
      "dispatch 条目按**入队定格的派发文本**投递（不经 renderHandbackPrompt——真机崩溃根因即两者混走）"
    );
    // 同机并入一条**坏形状**回交（缺载荷）：应如实拦截，绝不产生未捕获拒绝。
    h.streams.A.push({ kind: "handback", summary: "坏回交（无载荷）" } as unknown as OrchestrationEvent);
    await tick(150);
    await tick(100);
    assert.equal(rejections.length, 0, "**不得出现未捕获拒绝**（真机崩溃钉子）");
    assert.ok(
      h.envelopes.some((e) => e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /形状不符/.test(e.event.summary)),
      "坏回交应如实系统行（不崩、不静默）"
    );
    await h.mgr.stop(null);
  } finally {
    process.removeListener("unhandledRejection", onRej);
  }
});

test("H-1 闭环：su 派发 → 角色回交 → su 收到报告；不重复、不空转（EC-1 后无自激）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "做闭环" });
  await tick(120);
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "做闭环")], "A 收到派发输入");

  h.streams.A.push({ kind: "handback", summary: "回交 su：做完了", handback: HANDBACK_A });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A)], "su 恰好收到一条回交投递（E-1，单一来源原文）");
  // 不空转：静置再等，不应再多任何投递（闭环不自我激发——su 的验收/报告不产生新的派发或回交投递）。
  const aCount = h.sent.A.length;
  const suCount = h.sent.su.length;
  await tick(120);
  assert.equal(h.sent.A.length, aCount, "A 无多余投递");
  assert.equal(h.sent.su.length, suCount, "su 无多余投递（不重复、不空转）");
  await h.mgr.stop(null);
});

test('delivery notes are typed system messages, never ghost tools or extra prompts on the actual dispatch path',async()=>{
 const h=makeHarness();
 try{
  await h.mgr.open({projectRoot:'/proj',roleId:'su',runtime:'demo'});
  assert.equal((await h.dispatchOf('su')!({roleId:'A',task:'one actual dispatch'}))?.ok,true);
  await tick(100);
  h.streams.A.push({kind:'tool_call',summary:'actual controlled tool start',runtime:'demo',roleId:'A',turnId:'actual-turn',detail:{toolName:'read_file',toolCallId:'actual-call',phase:'start'}},{kind:'accepted',summary:'actual controlled tool result',runtime:'demo',roleId:'A',turnId:'actual-turn',detail:{toolName:'read_file',toolCallId:'actual-call',phase:'result',ok:true}});
  await tick(100);
  const worker=h.envelopes.filter(e=>e.roleId==='A');
  assert.equal(worker.filter(e=>e.event.kind==='tool_call').length,1,'the dispatch progress note must not add a second tool row');
  assert.deepEqual(h.sent.A,[dispatchTemplate('su','one actual dispatch')]);assert.equal(h.sent.su.length,0,'notes never prompt the coordinator');
  const notes=h.envelopes.filter(e=>e.event.kind==='message'&&(e.event.detail as {source?:string}|undefined)?.source==='delivery-note');
  assert.equal(notes.length,2);
  assert.ok(notes.some(e=>e.roleId==='A'&&e.event.summary==='已接收来自 su 的派发任务——请按任务文本执行，完成后交回报告。'));
  assert.ok(notes.some(e=>e.roleId==='su'&&e.event.summary==='已派发任务给 A（已投递到其会话；其结果/回交会回到本会话）。'));
  for(const note of notes){assert.equal(note.projectRoot,'/proj');assert.equal(note.runtime,'demo');assert.equal(Object.hasOwn(note.event,'turnId'),false);assert.deepEqual((note.event as {detail:unknown}).detail,{source:'delivery-note'});}
  const actual=worker.find(e=>e.event.kind==='tool_call')!.event as {turnId?:string;detail?:{toolCallId?:string;phase?:string}};assert.equal(actual.turnId,'actual-turn');assert.equal(actual.detail?.toolCallId,'actual-call');assert.equal(actual.detail?.phase,'start');
 }finally{await h.mgr.stop();}
});

// ————— F-2（2026-10-16 客户批准）：投递链持有收窄到「认领段」—————
// 真机实测：一条投递链被持有到目标**整轮**结束（16 分 55 秒），同项目其他角色的投递/回交/客户消息全被迫
// 串行等待。本组用例用「可控挂起的 send」（release 前 promise 不 resolve——模拟真实 Pi prompt 随整轮 resolve）
// 复现：旧实现在挂起期间**跨角色**投递必被压住；修复后投递开跑即释放链。

test("F-2-T1 长轮不阻塞跨角色：A 的投递轮挂起期间，su 派发 B ⇒ **立即**送达（不待 A 轮结束）；放行后两边各恰一次", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  const releaseA = h.hangNext("A");
  const r1 = (await dispatch({ roleId: "A", task: "长活" })) as DispatchReceipt;
  assert.equal(r1.ok, true);
  await tick(100); // A 自动开、认领、send 已发起（挂起中）
  assert.ok(h.openCalls.includes("A"), "A 会话被自动开启");
  assert.equal(h.maxConcurrent.A, 1, "A 的 send 在飞（挂起=整轮在跑）");
  assert.deepEqual(h.sent.A, [], "挂起期间 A 的投递尚未结算（send promise 未 resolve）");

  const r2 = (await dispatch({ roleId: "B", task: "另一条" })) as DispatchReceipt;
  assert.equal(r2.ok, true);
  await tick(100);
  assert.deepEqual(h.sent.B, [dispatchTemplate("su", "另一条")], "**B 立即收到**——不被 A 的长轮持有（旧实现：链被持有贯穿 A 整轮，B 只能干等）");
  assert.deepEqual(h.sent.A, [], "此时 A 仍在挂起（对照面：不是靠 A 结束才送达 B）");

  releaseA();
  await tick(100);
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "长活")], "放行后 A 的投递结算（恰一次）");
  assert.deepEqual(h.sent.B, [dispatchTemplate("su", "另一条")], "B 无重复投递");
  assert.equal(h.maxConcurrent.A, 1, "对 A 会话无并发 send");
  assert.equal(h.maxConcurrent.B, 1, "对 B 会话无并发 send");
  await h.mgr.stop(null);
});

test("F-2-T2 同目标仍严格排队：A 挂起期间再派 A ⇒ 排队（绝不并发 send）；放行 + settled 后按序投递", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  const releaseA = h.hangNext("A");
  await dispatch({ roleId: "A", task: "第一件" });
  await tick(100);
  assert.deepEqual(h.sent.A, [], "A 认领并挂起中");
  const r2 = (await dispatch({ roleId: "A", task: "第二件" })) as DispatchReceipt;
  assert.equal(r2.ok, true);
  await tick(120);
  assert.deepEqual(h.sent.A, [], "A 忙（send 未结）：第二件**排队**，不得并发投递");
  assert.equal(h.maxConcurrent.A, 1, "同会话并发 send 恒 ≤1");

  releaseA();
  await tick(80);
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "第一件")], "第一件送达");
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(200);
  assert.deepEqual(
    h.sent.A,
    [dispatchTemplate("su", "第一件"), dispatchTemplate("su", "第二件")],
    "settled 后按到达序放行第二件（链释放后行为逐字保真）"
  );
  assert.equal(h.maxConcurrent.A, 1, "全程对同会话无并发 send");
  await h.mgr.stop(null);
});

test("F-2-opt2 openInternal 按会话键互斥：并发两次 open 同一角色 ⇒ 恰一次建会话（第二次续接，不双开）；用户 open × 投递自动开同键同样恰一次", async () => {
  // ① 两次用户 open 并发：旧实现双方并发穿过「已有会话?」检查后各自建会话（先建者被覆盖——句柄泄漏）。
  const h = makeHarness({ openDelayMs: 30 });
  const [r1, r2] = await Promise.all([
    h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }),
    h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }),
  ]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1, "**恰一次**建会话（互斥闭合双开窗口）");
  assert.equal(r1.resumed, false, "先到者新建");
  assert.equal(r2.resumed, true, "后到者按序等待后**续接**同一会话（不双开、不覆盖）");
  assert.match(r2.note ?? "", /续接/, "续接说明如实");
  await h.mgr.stop(null);

  // ② 用户 open × 投递机自动开（§三论证的既有窗口①）：两者并发也不得双开。
  const h2 = makeHarness({ openDelayMs: 30 });
  await h2.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h2.dispatchOf("su")!;
  const userOpen = h2.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }); // 不 await：与投递自动开并发
  const receipt = (await dispatch({ roleId: "A", task: "触发自动开" })) as DispatchReceipt;
  assert.equal(receipt.ok, true);
  assert.equal((await userOpen).ok, true);
  await tick(200);
  assert.equal(h2.openCalls.filter((x) => x === "A").length, 1, "用户 open 与投递自动开同键：**恰一次**建会话");
  assert.deepEqual(h2.sent.A, [dispatchTemplate("su", "触发自动开")], "派发照常送达一次（互斥不丢投递）");
  await h2.mgr.stop(null);
});

test("F-2-opt3 认领段起止诊断：delivery.claim.start/end 与 delivery.start/end 同场，顺序如实（claim.start < delivery.start < claim.end < delivery.end）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-f2-diagnostics-"));
  configureDiagnostics({ directory: dir });
  const h = makeHarness();
  try {
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await tick(30);
    const dispatch = h.dispatchOf("su")!;
    await dispatch({ roleId: "A", task: "诊断活" });
    await tick(200);
    await flushDiagnostics();
    const files = await fs.readdir(dir);
    const records = (await Promise.all(files.map((f) => fs.readFile(path.join(dir, f), "utf8")))).join("").trim().split("\n").map((line) => JSON.parse(line) as { event: string; state?: string; queueDepth?: number; count?: number; ok?: boolean });
    const at = (event: string) => records.findIndex((r) => r.event === event);
    const start = records[at("delivery.claim.start")];
    const end = records[at("delivery.claim.end")];
    assert.ok(start, "认领段开始有诊断（delivery.claim.start）");
    assert.equal(start?.state, "dispatch", "认领条目类型如实");
    assert.equal(start?.queueDepth, 1, "认领时的队列深度如实");
    assert.ok(end, "认领段结束有诊断（delivery.claim.end）");
    assert.equal(end?.state, "dispatch");
    assert.equal(end?.count, 1, "合批计数如实");
    assert.ok(
      at("delivery.claim.start") < at("delivery.start") && at("delivery.start") < at("delivery.claim.end") && at("delivery.claim.end") < at("delivery.end"),
      "顺序如实：claim.start < delivery.start < claim.end < delivery.end（下一轮真机可据 claim 跨度区分「认领耗时」vs「轮次时长」）"
    );
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
