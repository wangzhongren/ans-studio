// test/桌面应用/dispatch-delivery.test.ts
// 桌面窗口（H-1，2026-10-12 设计）：**su 派发任务的路由**——复用 E-1 投递机的证据：
// 路由（目标未开→自动开 / 忙→排队按序 / 失败→如实系统行+保留待重投）；校验（非本项目角色/su 自身/
// 空参数 → **如实回执**给工具 + 系统行）；去重（**队列期窗口**，送达即释放以保返工可再派）；闭环
// （su 派发 → 角色回交 → su 收到报告；不重复、不空转）。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../src/provider/pi/session.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

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
  envelopes: { roleId: string; event: OrchestrationEvent }[];
  openCalls: string[];
  /** 打开某角色时拿到的派发能力（仅 su 会话应注入）——测试直接调用以驱动路由。 */
  dispatchOf: (roleId: string) => DispatchTaskFn | undefined;
}

function makeHarness(opts: { failSends?: Record<string, number> } = {}): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [], B: [] };
  const sent: Record<string, string[]> = { su: [], A: [], B: [] };
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const openCalls: string[] = [];
  const openInputs: Record<string, { dispatchTask?: DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};
  const failLeft: Record<string, number> = { ...(opts.failSends ?? {}) };

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string): Promise<void> {
        if ((failLeft[roleId] ?? 0) > 0) {
          failLeft[roleId] = (failLeft[roleId] ?? 0) - 1;
          throw new Error(`演示：${roleId} 投递通道瞬时失败`);
        }
        (sent[roleId] = sent[roleId] || []).push(text);
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
  return { mgr, streams, sent, envelopes, openCalls, dispatchOf: (roleId) => openInputs[roleId]?.dispatchTask };
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
  assert.ok(h.openCalls.includes("A"), "目标未开会话 ⇒ **自动开启**");
  assert.deepEqual(h.sent.A, [dispatchTemplate("su", "给 A 的活", "因为排期")], "目标收到派发输入（模板文案）");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "tool_call" && /已派发任务给 A/.test(e.event.summary)),
    "su 的 pane 有受理回执行"
  );
  assert.ok(
    h.envelopes.some((e) => e.roleId === "A" && e.event.kind === "tool_call" && /已接收来自 su 的派发任务/.test(e.event.summary)),
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
  const note = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "tool_call" && /派发投递失败（目标 A）/.test(e.event.summary));
  assert.ok(note, "**如实系统行**（不静默）");
  assert.ok(/未丢弃/.test(note!.event.summary) && /重试/.test(note!.event.summary), "系统行说明「未丢弃 + 重试」");

  h.streams.A.push({ kind: "settled", summary: "重试时机" });
  await tick(150);
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
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "tool_call" && /角色 不存在 不在本项目/.test(e.event.summary)),
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
      h.envelopes.some((e) => e.event.kind === "tool_call" && /形状不符/.test(e.event.summary)),
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
