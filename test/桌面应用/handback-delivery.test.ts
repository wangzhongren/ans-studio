// test/桌面应用/handback-delivery.test.ts
// 桌面应用（E-1，2026-10-12 设计；客户裁定**全自动、无开关**）：**回交自动投递 su 验收**——
// 去重（一条回交只投递一次）/ su 忙时**排队按序、不并发 send** / su 未开**自动开启**再投 /
// 开启或投递失败**如实系统行 + 保留待重试**（**绝不静默丢**）。
//
// 投递文案的**单一来源** = 编排 `renderHandbackPrompt`（本测试直接以它构造期望——证「用的是同一份」，
// 不是逐字复制）。去重键的单一来源 = 编排 `handbackKey`。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, renderHandbackBatchPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail("等待实际事件超时");
}

const HANDBACK_A1: TaskHandback = {
  roleId: "A",
  taskId: "T1",
  status: "completed",
  summary: "改完了 role-card",
  evidence: ["角色卡/A/role-card.md"],
  at: "2026-10-12T02:00:00.000Z",
};
const HANDBACK_A2: TaskHandback = { ...HANDBACK_A1, taskId: "T2", at: "2026-10-12T02:05:00.000Z" };

function listingWithSuAndA(): ProjectListing {
  return {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
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
  policies: { roleId: string; policy: unknown }[];
}

/** 可脚本化假句柄：events() 从共享流拉（轮询；dispose 后立即收口）；send 记入 sent（可注入一次失败）。 */
function makeHarness(opts: { failSuOpenAttempts?: number; failSuSendTimes?: number; failReportSendTimes?: number } = {}): Harness {
  const listing = listingWithSuAndA();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const openCalls: string[] = [];
  const stopped: Record<string, boolean> = {};
  let suOpenAttempts = 0;
  let suSendFails = opts.failSuSendTimes ?? 0;
  let reportSendFails = opts.failReportSendTimes ?? 0;
  const policies: { roleId: string; policy: unknown }[] = [];

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string): Promise<void> {
        if (roleId === "su" && text.startsWith("[回交] ") && reportSendFails > 0) {
          reportSendFails -= 1;
          throw new Error("批报告投递失败");
        }
        if (roleId === "su" && suSendFails > 0) {
          suSendFails -= 1;
          throw new Error("演示：投递通道瞬时失败");
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
      policies.push({ roleId: input.roleId, policy: input.routineShellPolicy });
      openCalls.push(input.roleId);
      if (input.roleId === "su" && (opts.failSuOpenAttempts ?? 0) > suOpenAttempts) {
        suOpenAttempts += 1;
        throw new Error("演示：su 会话开启失败（凭据缺失）");
      }
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: (env) => envelopes.push(env),
  });
  return { mgr, streams, sent, envelopes, openCalls, policies };
}

test("E-1 投递：A 的回交到达 → **自动开启 su** 并把 `renderHandbackPrompt` 原文投给 su（单一来源）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  assert.deepEqual(h.openCalls, ["A"], "此时只开了 A");

  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: HANDBACK_A1 });
  await tick(150);

  assert.ok(h.openCalls.includes("su"), "su 会话未开 ⇒ **自动开启**（su 是治理主入口，验收是其职责）");
  assert.equal(h.sent.su.length, 1, "su 恰好收到一条输入");
  assert.equal(h.sent.su[0], renderHandbackPrompt(HANDBACK_A1), "投递文本 === 编排 renderHandbackPrompt 的输出（**单一来源**，非复制）");
  assert.ok(h.sent.su[0].includes("角色卡/A/role-card.md") && h.sent.su[0].includes("请验收"), "含报告字段与验收请求");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "tool_call" && /已自动投递 A 的回交/.test(e.event.summary)),
    "投递成功应有如实系统行（进 su 的 pane）"
  );
  await h.mgr.stop(null);
});

test("E-1 去重：同一条回交重复到达（重放）→ **只投递一次**", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: HANDBACK_A1 });
  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: { ...HANDBACK_A1 } }); // 同一份（key 相同）
  await tick(150);
  assert.equal(h.sent.su.length, 1, "同一条回交（handbackKey 相同）**只投递一次**——重放不得重复投递");
  await h.mgr.stop(null);
});

test("E-1 排队：su 忙时保留，settle 后连续回交按原序合成一次验收输入", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.send("先给 su 的活"); // active=su → su busy=true
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }); // 切到 A（su 仍忙）
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交1", handback: HANDBACK_A1 });
  await tick(80);
  h.streams.A.push({ kind: "handback", summary: "回交2", handback: HANDBACK_A2 });
  await tick(80);
  assert.deepEqual(h.sent.su, ["先给 su 的活"], "su 忙：两条回交都**排队**，不得并发投递");

  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(120);
  assert.deepEqual(h.sent.su.slice(1), [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])], "settle 后同一输入含两份报告且顺序保持");

  h.streams.su.push({ kind: "settled", summary: "su 又一轮结束" });
  await tick(120);
  assert.deepEqual(
    h.sent.su.slice(1),
    [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])],
    "再 settle 不重复投递原批次"
  );
  await h.mgr.stop(null);
});

test("连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢", async () => {
  const harness = makeHarness({ failReportSendTimes: 1 });
  try {
    await harness.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await harness.mgr.send("先忙");
    await harness.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    harness.streams.A.push({ kind: "handback", summary: "one", handback: HANDBACK_A1 }, { kind: "handback", summary: "two", handback: HANDBACK_A2 });
    await waitUntil(() => harness.envelopes.filter((envelope) => envelope.event.kind === "handback").length === 2);
    harness.streams.su.push({ kind: "settled", summary: "释放" });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.summary.includes("批报告投递失败")));
    assert.deepEqual(harness.sent.su, ["先忙"]);
    harness.streams.A.push({ kind: "handback", summary: "duplicate", handback: { ...HANDBACK_A1 } }, { kind: "handback", summary: "duplicate", handback: { ...HANDBACK_A2 } });
    harness.streams.A.push({ kind: "settled", summary: "触发重试" });
    await waitUntil(() => harness.sent.su.length === 2);
    assert.deepEqual(harness.sent.su.slice(1), [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])]);
    harness.streams.su.push({ kind: "settled", summary: "完成" });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.summary === "完成"));
    assert.equal(harness.sent.su.length, 2, "同轮重放未重新入队，批次没有丢失/重复");
  } finally {
    await harness.mgr.stop(null);
  }
});

test("客户消息屏障：A报告→客户消息→B报告，不跨消息合批或改变顺序", async () => {
  const harness = makeHarness();
  try {
    await harness.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await harness.mgr.send("先忙");
    await harness.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    harness.streams.A.push({ kind: "handback", summary: "one", handback: HANDBACK_A1 });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.kind === "handback"));
    await harness.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    assert.equal((await harness.mgr.send("客户屏障")).queued, true);
    harness.streams.A.push({ kind: "handback", summary: "two", handback: HANDBACK_A2 });
    await waitUntil(() => harness.envelopes.filter((envelope) => envelope.event.kind === "handback").length === 2);
    for (let round = 0; round < 3; round += 1) {
      harness.streams.su.push({ kind: "settled", summary: "放行" });
      await waitUntil(() => harness.sent.su.length === round + 2);
    }
    assert.deepEqual(harness.sent.su.slice(1), [renderHandbackPrompt(HANDBACK_A1), "客户屏障", renderHandbackPrompt(HANDBACK_A2)]);
  } finally {
    await harness.mgr.stop(null);
  }
});

test("常规检查宿主政策实际注入项目角色，su不接委托免确认", async () => {
  const harness = makeHarness();
  try {
    await harness.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await harness.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    assert.deepEqual(harness.policies, [
      { roleId: "A", policy: { enabled: true, projectRoot: "/proj", authorizationSource: "customer-delegated-routine-checks" } },
      { roleId: "su", policy: undefined },
    ]);
  } finally {
    await harness.mgr.stop(null);
  }
});

test("E-1 开启失败：如实系统行（含原因与重试时机）+ **保留回交**；下次时机成功投递（绝不静默丢）", async () => {
  const h = makeHarness({ failSuOpenAttempts: 1 });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交", handback: HANDBACK_A1 });
  await tick(150);
  assert.equal(h.sent.su.length, 0, "开启失败 → 未投递");
  const failureNote = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "tool_call" && /开启 su 会话失败/.test(e.event.summary));
  assert.ok(failureNote, "**如实系统行**（不得静默）");
  assert.ok(/未投递（已保留/.test(failureNote!.event.summary), "系统行须说明「未投递 + 已保留」与重试时机");
  assert.ok(/重试/.test(failureNote!.event.summary), "系统行须给出重试时机");

  // 下一次时机：A 一轮结束触发重试 → 这次开启成功 → 投递完成（保留的回交不丢）。
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A1)], "保留的回交在下次时机成功投递");
  await h.mgr.stop(null);
});

test("真机崩溃修复：坏形状回交事件（缺载荷/缺 roleId）→ 不投递、如实系统行、**零未捕获拒绝**", async () => {
  const rejections: unknown[] = [];
  const onRej = (r: unknown) => {
    rejections.push(r);
  };
  process.on("unhandledRejection", onRej);
  try {
    const h = makeHarness();
    await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await tick(30);
    // ① 缺 handback 载荷（真机崩溃形态：renderHandbackPrompt 被喂 undefined）
    h.streams.A.push({ kind: "handback", summary: "坏回交（无载荷）" } as unknown as OrchestrationEvent);
    // ② 载荷缺 roleId
    h.streams.A.push({
      kind: "handback",
      summary: "坏回交（缺 roleId）",
      handback: { taskId: "T1", status: "completed", summary: "x", evidence: [], at: "t" },
    } as unknown as OrchestrationEvent);
    await tick(150);
    await tick(100); // 再多给一轮时间：任何异步拒绝都有机会冒出来
    assert.equal(rejections.length, 0, "**不得出现未捕获拒绝**（真机崩溃钉子）");
    assert.equal(h.sent.su.length, 0, "坏形状不得投递");
    assert.ok(
      h.envelopes.some((e) => e.event.kind === "tool_call" && /形状不符/.test(e.event.summary)),
      "坏形状应如实系统行（不崩、不静默）"
    );
    await h.mgr.stop(null);
  } finally {
    process.removeListener("unhandledRejection", onRej);
  }
});

test("E-1 投递失败：如实系统行（含原因）+ 放回队首保留；重试成功后送达（顺序与内容不损）", async () => {
  // 连续失败两次：把「开启 su」与「投递」两条链上的重试都耗尽（看清失败如实与保留），再由下一时机成功。
  const h = makeHarness({ failSuSendTimes: 2 });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交", handback: HANDBACK_A1 });
  await tick(150);
  assert.equal(h.sent.su.length, 0, "首次投递失败 → 未送达");
  const failNote = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "tool_call" && /回交投递失败/.test(e.event.summary));
  assert.ok(failNote, "**如实系统行**（不得静默）");
  assert.ok(/未丢弃/.test(failNote!.event.summary) && /重试/.test(failNote!.event.summary), "系统行须说明「未丢弃/保留待重试」");

  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A1)], "保留的回交重试后送达（内容为单一来源原文）");
  await h.mgr.stop(null);
});
