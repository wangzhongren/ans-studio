// test/桌面应用/message-queue.test.ts
// 桌面窗口（L-1，2026-10-12 客户裁定「每个角色如果正在工作，应该可以有个队列的概念，可以派发到队列里面去」
// + 「现在是直接失败」）与**状态准确性**（客户：「执行的时候这个状态显示不对吧…应该用图标来表示」）的集成证据。
//
// 覆盖：
//  ① 忙时客户消息**入队**（不再直接失败）——如实位次；settled 后按到达序自动放行；摘要入队列快照；
//  ② 队列投递失败语义**不变**（如实系统行 + 未丢弃 + 放回队首待重试）；传输失败仍如实回错；
//  ③ 状态准确性**复现 vs 修后对照**：真跑一轮（投递开跑的轮次——界面从未发过任何消息）——
//    旧「界面侧推测」事实组合会派生「空闲」（复现「其实在跑却显示空闲」）；主进程**真实快照**（busy）
//     派生「工作中」；后台（切走/无界面动作）跑的轮次同样如实；队列待办不得显示「空闲」；
//  ④ 接线钉子：preload/main/interface/session/renderer 的 role-state 通道两端齐备；渲染侧**不设**忙态推测。
//
// **不发真实模型请求**：全程用假适配器（handle.send 只登记文本），无网络、无 Pi SDK。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createRuntimeAdapterFactory as createRuntimeAdapterFactoryReal,
  openRoleSession as openRoleSessionReal,
} from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type {
  PromptImage,
  PromptOptions,
  RuntimeProviderFactory,
  SessionEvent,
  ToolResult,
  ViewImageFn,
} from "../../src/model/runtime.ts";
// 2026-10-26 view_image（桌面侧投递能力）：正式文本来自实现模块（单一来源，不另写第二份）。
import { buildViewImagePrompt } from "../../app/desktop/view-image.ts";
// G-2（2026-10-16 客户批准）：W2 `system` 第四类投递（快照/队列视图/撤回/投递机复用）＋ W3 完成态收束的
// **SessionManager 集成**（真看护服务＋注入时钟＋同源快照——不起真实模型）。
import { createWatchdogService, type WatchdogObservation } from "../../app/desktop/watchdog.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app");
const PRELOAD = fs.readFileSync(path.join(APP_DIR, "preload.cjs"), "utf8");
const NEW_RENDERER_IPC = fs.readFileSync(path.join(APP_DIR, "renderer", "src", "chat", "ipc.ts"), "utf8");
const MAIN = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
const IFACE = fs.readFileSync(path.join(APP_DIR, "desktop", "interface.ts"), "utf8");
const SESSION = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8");

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

interface RoleStateSnapshot {
  roleId: string;
  busy: boolean;
  summaries: string[];
  /** N-3（2026-10-12 追加）：结构化排队条目（右栏「待办 / 队列」组的数据面——与 summaries 同源）。 */
  queue: { kind: string; sourceRoleId: string; summary: string; at: string }[];
  /** 正在跑的那条投递（若有）。 */
  running: { kind: string; sourceRoleId: string; summary: string; at: string } | null;
}

const HANDBACK_A: TaskHandback = {
  roleId: "A",
  taskId: "L1",
  status: "completed",
  summary: "做完了",
  evidence: ["docs/x.md"],
  at: "2026-10-12T05:00:00.000Z",
};

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
  return { projectRoot: "/proj", roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  envelopes: { roleId: string; event: import("../../app/desktop/session.ts").DesktopOrchestrationEvent }[];
  roleStates: RoleStateSnapshot[];
  openCalls: string[];
  /** 可运行期调整的失败计数器（`handle.send` 每次调用消耗 1；用于精确安排「第二次尝试失败」）。 */
  failLeft: Record<string, number>;
  /** 某角色**最近一次**真实状态快照（外推值；无则 undefined）。 */
  latest: (roleId: string) => RoleStateSnapshot | undefined;
  /** F-2-T4 夹具：挂起某角色**下一次** send（release 前不 resolve）。 */
  hangNext: (roleId: string) => () => void;
}

function makeHarness(opts: { deliveryQueueStorePath?: string } = {}): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: { roleId: string; event: import("../../app/desktop/session.ts").DesktopOrchestrationEvent }[] = [];
  const roleStates: RoleStateSnapshot[] = [];
  const openCalls: string[] = [];
  const stopped: Record<string, boolean> = {};
  const failLeft: Record<string, number> = {};
  // F-2-T4 夹具（2026-10-16）：可控挂起的 send——release 前 promise 不 resolve（模拟整轮在跑）。
  const nextGate: Record<string, Promise<void> | undefined> = {};
  const hangNext = (roleId: string): (() => void) => {
    let release!: () => void;
    nextGate[roleId] = new Promise<void>((resolve) => { release = resolve; });
    return release;
  };

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string): Promise<void> {
        if ((failLeft[roleId] ?? 0) > 0) {
          failLeft[roleId] = (failLeft[roleId] ?? 0) - 1;
          throw new Error(`演示：${roleId} 投递通道瞬时失败`);
        }
        const gate = nextGate[roleId];
        if (gate) {
          nextGate[roleId] = undefined;
          await gate;
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
    // L-1 + 状态准确性：**真实状态快照**外推的收集器（快照即拷——断言时不被后续 push 影响）。
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        summaries: [...info.summaries],
        queue: (info.queue ?? []).map((i) => ({ ...i })),
        running: info.running ? { ...info.running } : null,
      }),
    // 2026-10-20 客户要求：投递队列持久化（重启自动续跑）——测试注入临时 store（缺省 ⇒ 不持久化）。
    ...(opts.deliveryQueueStorePath !== undefined ? { deliveryQueueStorePath: opts.deliveryQueueStorePath } : {}),
  });
  return {
    mgr,
    streams,
    sent,
    envelopes,
    roleStates,
    openCalls,
    failLeft,
    hangNext,
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
  };
}

test("L-1 入队：忙时客户消息**入队**（不再直接失败）——位次如实、settled 后按到达序自动放行、摘要入快照", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  const r1 = await h.mgr.send("第一条");
  assert.equal(r1.ok, true);
  assert.equal(r1.queued, undefined, "空闲路径逐字不变（直接发出，不入队）");
  assert.deepEqual(h.sent.A, ["第一条"]);
  assert.equal(h.latest("A")?.busy, true, "真开跑 ⇒ 真实快照 busy:true（工作中有据）");

  const r2 = await h.mgr.send("第二条");
  assert.equal(r2.ok, true, "**不再**直接失败（旧行为＝回 already processing 报错——已退役）");
  assert.equal(r2.queued, true, "忙 ⇒ 入队");
  assert.equal(r2.position, 1, "位次从 1 起（如实）");
  assert.ok(!r2.error, "入队不是错误");
  assert.deepEqual(h.sent.A, ["第一条"], "入队期间**不**并发投递");
  const q = h.latest("A");
  assert.equal(q?.busy, true);
  assert.equal(q?.summaries.length, 1, "队列快照应有 1 条待办");
  assert.ok(q!.summaries[0].startsWith("你：第二条"), "队列行摘要 = 「你：<首段>」（如实）");
  // N-3（右栏「待办 / 队列」数据面）：结构化条目同源转出——来源/摘要/**入队时间**。
  assert.equal(q?.queue.length, 1, "结构化排队条目同源（不造第二套数据源）");
  assert.equal(q?.queue[0].kind, "message");
  assert.equal(q?.queue[0].sourceRoleId, "A");
  assert.ok(q!.queue[0].summary.startsWith("你：第二条"));
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(q!.queue[0].at), "入队时间（ISO，入队即定格）");
  assert.equal(q?.running, null, "尚未开跑 ⇒ 无「进行中」条目");

  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.A, ["第一条", "第二条"], "settled 后自动放行（按到达序，绝不并发 send）");
  assert.equal(h.latest("A")?.summaries.length, 0, "放行后队列快照清空（如实）");
  assert.equal(h.latest("A")?.busy, true, "排队消息已开跑 ⇒ busy:true");
  // N-3：正在跑的那条 = 刚放行的排队消息（标「进行中」；**排队 ≠ 已执行**）。
  const running = h.latest("A")?.running;
  assert.ok(running, "开跑后应有「进行中」条目");
  assert.equal(running!.kind, "message");
  assert.ok(running!.summary.startsWith("你：第二条"), "进行中 = 刚放行的那条");
  assert.equal(h.latest("A")?.queue.length, 0, "它已出队（不再是「排队中」）");

  h.streams.A.push({ kind: "settled", summary: "第二轮结束" });
  await tick(150);
  assert.equal(h.latest("A")?.busy, false, "第二轮 settle ⇒ 快照 busy:false（徽标回「空闲」）");
  assert.equal(h.latest("A")?.running, null, "一轮结束 ⇒ 「进行中」撤销（如实）");
  await h.mgr.stop(null);
});

test("L-1 位次与摘要截断：第 1、2 位如实；超长文本摘要截断（不铺全文）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("占位（让 A 忙）");

  const a = await h.mgr.send("甲".repeat(100));
  const b = await h.mgr.send("乙");
  assert.equal(a.position, 1);
  assert.equal(b.position, 2, "第二条排队消息位次=2");
  const q = h.latest("A");
  assert.equal(q?.summaries.length, 2);
  assert.ok(q!.summaries[0].startsWith("你：甲"), "第 1 条摘要取队首");
  assert.ok(q!.summaries[0].endsWith("…"), "超长文本被截断（队列行不铺全文）");
  assert.ok(q!.summaries[0].length <= 43, "截断长度上界（40 字 + 「你：」+ 省略号）");
  assert.ok(!h.sent.A.includes("甲".repeat(100)), "排队期间未投递");
  await h.mgr.stop(null);
});

test("L-1 失败语义不变：排队消息投递失败 ⇒ 如实系统行（未丢弃）+ 放回队首；下次时机成功送达", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("第一条");
  await h.mgr.send("第二条");
  h.failLeft.A = 1; // 精确安排：下一次 send（=队列放行那次）失败一次

  h.streams.A.push({ kind: "settled", summary: "放行时机（会失败）" });
  await tick(150);
  assert.deepEqual(h.sent.A, ["第一条"], "投递失败：未送达");
  const note = h.envelopes.find(
    (e) => e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /排队消息投递失败（角色 A）/.test(e.event.summary)
  );
  assert.ok(note, "**如实系统行**（不静默）");
  assert.ok(/未丢弃/.test(note!.event.summary) && /重试/.test(note!.event.summary), "说明「未丢弃 + 待重试」");
  assert.equal(h.latest("A")?.summaries.length, 1, "快照恢复：待办仍在（放回队首）");
  assert.equal(h.latest("A")?.busy, false, "失败后忙态复位（如实——并没有在跑）");

  h.streams.A.push({ kind: "settled", summary: "重试时机" });
  await tick(150);
  assert.deepEqual(h.sent.A, ["第一条", "第二条"], "保留的排队消息在下次时机成功送达");
  await h.mgr.stop(null);
});

test("L-1 传输失败仍如实回错：空闲路径的 send 失败 = {ok:false,error}（并**不**虚报忙态）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  h.failLeft.A = 1;
  const r = await h.mgr.send("会失败");
  assert.equal(r.ok, false, "传输失败如实回错（不吞）");
  assert.ok(r.error && r.error.length > 0, "错误原因随回执");
  assert.equal(r.queued, undefined, "传输失败**不是**入队");
  assert.equal(h.latest("A")?.busy, false, "没有开跑 ⇒ busy:false（不得虚报「工作中」）");
  await h.mgr.stop(null);
});

test("状态准确性（主进程）：投递开跑的后台轮次 — 真实快照 busy 如实外推；状态派生/徽标纯逻辑见 test/桌面UI/status.test.ts", async () => {
  // 旧 renderer 的 deriveRoleStatus/statusBadge 源钉随 5B 下线；状态派生纯逻辑由桌面UI
  // test/桌面UI/status.test.ts 覆盖，本文件保留主进程快照语义。
  const h = makeHarness();
  // 「真跑一轮」：只开 A；A 的回交到达 ⇒ 投递机**自动开启 su**并把回交投递进去 ⇒ su 会话真开跑一轮。
  // 这一轮**不是界面发的**（客户从没在 su 会话里点过发送）——正是旧实现「其实在跑却显示空闲」的现场。
  // 按真实编排顺序：一轮结束先发 `handback`、再发 `settled`——两者都会触发投递机（并发触发现场）。
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  h.streams.A.push({ kind: "handback", summary: "回交 su：做完了", handback: HANDBACK_A });
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(300);

  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A)], "su 真收到一条投递（一轮在跑；恰好一条——不重投）");
  // 并发投递修正（同轮）：多个触发点（回交入队 + settled 放行）竞争时，串行门保证不重复开启、不误报。
  assert.equal(h.openCalls.filter((r) => r === "su").length, 1, "su 只应被自动开启 **一次**（旧缺陷：双 drain 并发 ⇒ 开两个会话）");
  assert.equal(
    h.envelopes.filter((e) => e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /形状不符/.test(e.event.summary)).length,
    0,
    "不得误报「投递条目形状不符」（旧缺陷：双 drain 抢同一队列 shift 出 undefined）"
  );
  const snap = h.latest("su");
  assert.ok(snap, "主进程应外推 su 的真实状态快照");
  assert.equal(snap!.busy, true, "真实信号：su 会话 busy（后台/投递开跑的轮次同样计入）");

  // 活动角色不被后台开启抢走（同轮真机缺陷修复）：投递自动开 su **不得**改活动角色——用户下一条消息
  // 必须仍落到 A（旧缺陷：自动开 su 后直接 send 会把用户消息**错发到 su**）。
  assert.equal(h.mgr.openForRoleId(), "A", "后台自动开启 su 不抢活动角色");
  const toA = await h.mgr.send("给 A 的消息（不得错投 su）");
  assert.equal(toA.ok, true);
  await tick(60);
  assert.ok(h.sent.A.includes("给 A 的消息（不得错投 su）"), "用户消息应落到活动角色 A");
  assert.ok(!h.sent.su.includes("给 A 的消息（不得错投 su）"), "不得错投 su（旧缺陷：自动开 su 抢活动角色）");

  // 旧「界面侧推测」派生已退役；主进程真实快照 busy:true 是唯一忙态事实
  // （状态派生/徽标由 test/桌面UI/status.test.ts 覆盖）。

  // 后台在跑（B-2 下切走/无任何界面动作）：静置后快照仍是 busy:true；轮次结束（settled）转 false。
  await tick(150);
  assert.equal(h.latest("su")?.busy, true, "无界面动作期间快照保持 busy:true（后台轮次如实）");
  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(150);
  assert.equal(h.latest("su")?.busy, false, "settled ⇒ 快照转 busy:false");
  assert.equal(h.latest("su")!.busy, false, "轮次结束 ⇒ 快照 busy:false（如实）");
  await h.mgr.stop(null);
});

test("状态准确性（主进程）：队列待办快照如实（queueDepth）；徽标/派生纯逻辑见 test/桌面UI/status.test.ts", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("占位");
  await h.mgr.send("排队 1");
  await h.mgr.send("排队 2");
  const snap = h.latest("A");
  assert.ok(snap && snap.summaries.length === 2, "快照带 2 条待办（真实队列深度）");
  assert.equal(snap!.busy, true, "有排队待办 ⇒ 主进程快照 busy:true（唯一忙态事实）");
  // 状态派生/徽标（状态-only、单计数）由桌面UI `test/桌面UI/status.test.ts` 与 main.mjs 单计数检查覆盖。
  await h.mgr.stop(null);
});

test("接线钉子：role-state 通道两端齐备；忙态判据只在主进程（会话 busy × 队列深度）；渲染侧**无**界面侧推测", () => {
  // preload ↔ main：真实快照通道。
  assert.ok(PRELOAD.includes('"session:role-state"') && PRELOAD.includes("onRoleState"), "preload 应订阅 session:role-state");
  assert.ok(MAIN.includes('win.webContents.send("session:role-state", info)'), "main 应推 session:role-state");
  assert.ok(MAIN.includes("emitRoleState") && IFACE.includes("emitRoleState: deps.emitRoleState"), "Interface 应透传 emitRoleState");
  assert.ok(
    SESSION.includes("const busy = entry?.busy === true;"),
    "忙态判据 = 会话 busy 标志（真实信号——不靠界面推测）"
  );
  assert.ok(
    SESSION.includes("this.notifyRoleState(en.projectRoot, roleId, runtime);"),
    "settled（一轮结束）应外推快照（B-2 后台轮次结束同样走这里）"
  );
  assert.ok(SESSION.includes("this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);"), "直接 send 开跑应外推快照");
  // L-1 顺序修正（防竞态）：直接 send **先置忙再 await**——快适配器（如 demo）的 settled 可能在 await
  // 返回前就被消费；若此刻才置忙，settled 的复位会被反向覆盖，忙态永不复位（队列永不放行）。
  assert.ok(
    SESSION.indexOf("entry.busy = true;") >= 0 &&
      SESSION.indexOf("entry.busy = true;") < SESSION.indexOf("await this.sendDelivery(entry, origin, text, opts);"),
    "直接 send 应先置忙再 await（与投递机同款）"
  );
  // 新渲染器（5B）：经 preload 白名单订阅真实快照并落入投影；队列行/单计数由 main.mjs 与
  // test/桌面UI 覆盖。旧 renderer.js/styles.css 源钉随旧渲染器下线退役。
  assert.ok(NEW_RENDERER_IPC.includes("session:role-state"), "新渲染器应订阅 session:role-state");
  assert.ok(NEW_RENDERER_IPC.includes("applyRoleState"), "新渲染器应把快照应用到投影");
});

// ————— F-2-T4（2026-10-16 客户批准）：长轮不阻塞客户消息投递 —————
// 旧实现：su 的回交投递轮把串行链持有到整轮结束——期间 A settle 触发的「排队客户消息放行」被链压住。
// 修复后：投递开跑即释放链，客户消息随 A settle **立即**送达；su 自己的队列仍按序放行（语义保真）。

test("F-2-T4 长轮不阻塞客户消息：su 的回交投递轮挂起期间，A settle 后的排队客户消息**立即**放行；su 队列在放行+settle 后按序投递", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  // ① su 的长轮：一条回交投递（自动开 su → 认领 → send 挂起）。
  const releaseSu = h.hangNext("su");
  h.streams.A.push({ kind: "handback", summary: "回交1", handback: HANDBACK_A });
  await tick(150);
  assert.ok(h.openCalls.includes("su"), "su 被自动开启");
  assert.equal(h.sent.su.length, 0, "su 的回交投递挂起中（整轮在跑；send promise 未结）");

  // ② A：直发置忙 + 再排一条客户消息（入队）。
  await h.mgr.send("A 占位（在跑）");
  const queued = await h.mgr.send("A 排队消息");
  assert.equal(queued.queued, true);
  // ③ su 挂起期间又推一条回交（su 忙 ⇒ 入队，等 su settle 后按序放行）。
  h.streams.A.push({ kind: "handback", summary: "回交2", handback: { ...HANDBACK_A, taskId: "L2", summary: "第二件做完" } });
  await tick(120);
  assert.equal((h.latest("su")?.summaries.length ?? 0), 1, "第二条回交在 su 队列排队（su 忙——排队语义未变）");

  // ④ A settle ⇒ 排队客户消息**立即**放行——不被 su 的长轮持有（旧实现：链被 su 持有贯穿其整轮）。
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(200);
  assert.deepEqual(h.sent.A, ["A 占位（在跑）", "A 排队消息"], "客户消息随 A settle 立即送达（chain 只属认领段）");
  assert.equal(h.sent.su.length, 0, "对照面：此期间 su 仍挂起（不是因为 su 结束才送到 A）");

  // ⑤ 放行 su + su settle ⇒ su 队列按序放行第二条回交（恰一次、不丢）。
  releaseSu();
  await tick(80);
  assert.equal(h.sent.su.length, 1, "第一份回交结算");
  assert.ok(h.sent.su[0].includes("做完了"), "第一份 = 先到的回交1");
  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(200);
  assert.equal(h.sent.su.length, 2, "su settle 后第二份回交放行");
  assert.ok(h.sent.su[1].includes("第二件做完"), "按到达序（回交2 在后）");
  await h.mgr.stop(null);
});

// ————————————————— G-2（2026-10-16 客户批准）：W2 system 投递 ＋ W3 收束集成 —————————————————

interface G2Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  roleStates: { roleId: string; busy: boolean; summaries: string[]; queue: { kind: string; sourceRoleId: string; summary: string; at: string; id: string; full: string }[]; running: { kind: string; sourceRoleId: string; summary: string; at: string } | null }[];
  observations: { projectRoot: string; observation: WatchdogObservation }[];
  service: ReturnType<typeof createWatchdogService>;
  advance: (ms: number) => void;
  latest: (roleId: string) => G2Harness["roleStates"][number] | undefined;
  release: (roleId: string) => void;
  hangNext: (roleId: string) => void;
}

function makeG2Harness(): G2Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const roleStates: G2Harness["roleStates"] = [];
  const observations: { projectRoot: string; observation: WatchdogObservation }[] = [];
  const stopped: Record<string, boolean> = {};
  const gates: Record<string, Promise<void> | undefined> = {};
  const releases: Record<string, (() => void) | undefined> = {};
  let ms = 1_700_000_000_000;
  const hangNext = (roleId: string): void => {
    gates[roleId] = new Promise<void>((resolve) => { releases[roleId] = resolve; });
  };
  const release = (roleId: string): void => {
    const r = releases[roleId];
    gates[roleId] = undefined;
    releases[roleId] = undefined;
    r?.();
  };
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string): Promise<void> {
        const gate = gates[roleId];
        if (gate) {
          gates[roleId] = undefined;
          await gate;
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
      async dispose(): Promise<void> { stopped[roleId] = true; },
    };
  };
  let mgr!: SessionManager;
  const service = createWatchdogService({
    projects: () => ["/proj"],
    snapshot: (root) => mgr.watchdogSnapshot(root),
    deliver: (root, message) => mgr.watchdogDeliver(root, message),
    now: () => ms,
    config: { env: {}, tickMs: 30 * 1000 },
  });
  mgr = new SessionManager({
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? l : undefined),
    emitEvent: () => {},
    emitRoleState: (info) => roleStates.push({
      roleId: info.roleId,
      busy: info.busy,
      summaries: [...info.summaries],
      queue: (info.queue ?? []).map((x) => ({ ...x })),
      running: info.running ? { ...info.running } : null,
    }),
    // 真接线：观察转发给看护服务（与 interface.ts 生产装配同款）＋留证供断言。
    watchdogObserver: (projectRoot, observation) => {
      observations.push({ projectRoot, observation });
      service.observe(projectRoot, observation);
    },
    now: () => ms,
  });
  return {
    mgr, streams, sent, roleStates, observations, service,
    advance: (delta) => { ms += delta; },
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
    release,
    hangNext,
  };
}

test("G-2/W2：`system` 第四类投递——su 忙时入队（快照 kind=system、来源空白、无第二数据源）；不可撤回；settled 后按既有投递机送达", async () => {
  const h = makeG2Harness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  h.hangNext("su");
  const send = h.mgr.send("占住 su 本轮");
  await tick(30);
  // 看护系统消息（kind:"system"——告警/收束/回执都走这里）：su 忙 ⇒ 入队。
  h.mgr.watchdogDeliver("/proj", { text: "[系统·看护] 测试告警：角色「A」。", summary: "系统·看护 · 测试告警 · 角色 A", dedupKey: "watchdog\u0000/proj\u0000test\u00000" });
  await tick(30);
  const q = h.latest("su");
  assert.equal(q?.summaries.length, 1, "系统消息入队（同一套投递机）");
  assert.equal(q?.queue[0].kind, "system", "快照 kind=system（W2 第四类——渲染侧据此显示「系统」）");
  assert.equal(q?.queue[0].sourceRoleId, "", "来源标注恒空（U1 已落树契约：系统非角色）");
  assert.ok(q?.queue[0].id.startsWith("watchdog\u0000"), "去重键＝看护自持命名空间（与 handback/dispatch 键隔离）");
  // 撤回判据：system 归治理流只读面——不可撤回（与界面「无撤回钮」同语义）。
  const wd = h.mgr.withdraw("su", q!.queue[0].id);
  assert.equal(wd.ok, false, "system 不可撤回");
  assert.match(wd.error ?? "", /只读|不可撤回/, "如实说明");
  // 放行本轮 → settled → 投递机按序送达。
  h.release("su");
  await send;
  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(150);
  assert.ok(h.sent.su.includes("[系统·看护] 测试告警：角色「A」。"), "系统消息真投递给 su（同机送达）");
  assert.equal(h.latest("su")?.queue.length, 0, "送达后队列清空");
  await h.mgr.stop(null);
});

test("G-2/W3 已移除：完成静默不再投 `[系统·收束]`（验收通过即收束）", async () => {
  const h = makeG2Harness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  // 跑一轮真实 turn（旧 W3 的预热：至少一轮 settled）。
  const s1 = h.mgr.send("干点活");
  await tick(20);
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await s1;
  await tick(150);
  // 远超旧静默阈值（30s）的多个 tick：不得再产生收束消息。
  h.service.tick();
  h.advance(30 * 60 * 1000);
  h.service.tick();
  h.advance(30 * 60 * 1000);
  h.service.tick();
  await tick(150);
  assert.equal(h.sent.su.filter((t) => t.startsWith("[系统·收束]")).length, 0, "看护不再投收束提示");
  assert.equal(h.sent.su.filter((t) => t.startsWith("[系统·看护]")).length, 0, "完成静默态也不产生告警");
  await h.mgr.stop(null);
});

test("G-2/W1 集成：同源快照（busy/busySince/队列/在途）＋观察转发（命令超时限＝结构化 display.process）＋lastTurn", async () => {
  const h = makeG2Harness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const s1 = h.mgr.send("长活");
  await tick(20);
  const snap = h.mgr.watchdogSnapshot("/proj");
  assert.ok(snap, "快照可读（同源：会话/队列直读，不造第二数据源）");
  assert.equal(snap!.governanceRoleId, "su", "su 判据来自门禁枚举（primaryRoleId）");
  const roleA = snap!.roles.find((r) => r.roleId === "A");
  assert.equal(roleA?.busy, true, "busy 事实");
  assert.equal(typeof roleA?.turnStartedAt, "number", "本轮起点（看护 #1 的 elapsed 基准）");
  // 命令超时限：事件流里带 display.process.timedOut 的结构化事实（F-1）——复用同一判据转发观察。
  h.streams.A.push({ kind: "denied", summary: "run_shell 超时终止", detail: { toolName: "run_shell", phase: "result", display: { version: 1, omissions: [], process: { timedOut: true } } } });
  await tick(50);
  assert.ok(h.observations.some((o) => o.observation.kind === "command-timed-out" && o.observation.roleId === "A"), "命令超时观察已转发（classifyProcessOutcome 单一判据）");
  h.streams.A.push({ kind: "settled", summary: "结束", detail: { outcome: "failed" } });
  await s1;
  await tick(150);
  const last = h.mgr.lastTurnOf("/proj", "A", "demo");
  assert.equal(last?.outcome, "failed", "lastTurn 小状态（W1；settled 顺带落表）");
  const settledObs = h.observations.find((o) => o.observation.kind === "settled" && o.observation.roleId === "A");
  assert.equal(settledObs && settledObs.observation.kind === "settled" ? settledObs.observation.fromSystemDelivery : undefined, false, "普通轮 settle：fromSystemDelivery=false（真实活动）");
  await h.mgr.stop(null);
});

// —————— 2026-10-20 客户要求：投递队列持久化 + 重启自动续跑（不是只给 Lead 提示） ——————

/** 有界等待持久队列文件满足条件（原子写链是异步的）。 */
async function waitForStore(
  storePath: string,
  predicate: (doc: { version?: number; items?: unknown[] }) => boolean,
  timeoutMs = 4000,
): Promise<{ version?: number; items?: unknown[] }> {
  const started = Date.now();
  let last: { version?: number; items?: unknown[] } = {};
  while (Date.now() - started <= timeoutMs) {
    try {
      last = JSON.parse(fs.readFileSync(storePath, "utf8")) as { version?: number; items?: unknown[] };
    } catch {
      last = {};
    }
    if (predicate(last)) return last;
    await tick(10);
  }
  assert.fail(`等待持久队列条件超时（最后：${JSON.stringify(last).slice(0, 300)}）`);
}

test("2026-10-20 重启续跑：enqueue 后重启（新 SessionManager + 同一 store）⇒ 自动重投到原角色/原 runtime", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-delivery-store-queued-"));
  try {
    const storePath = path.join(dir, "delivery-queue.json");
    const h1 = makeHarness({ deliveryQueueStorePath: storePath });
    // 启动契约：先恢复上一次运行的队列（无文件 ⇒ 武装持久化），再进入正常投递。
    assert.equal((await h1.mgr.restorePersistedDeliveries()).restored, 0, "首次启动：无历史队列");
    await h1.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await tick(30);
    assert.equal((await h1.mgr.send("第一条")).ok, true);
    const queued = await h1.mgr.send("第二条");
    assert.equal(queued.queued, true, "A 忙：第二条入队");
    const persisted = await waitForStore(storePath, (doc) => Array.isArray(doc.items) && doc.items.length === 1);
    const entry = (persisted.items as Array<{ state?: string; key?: { roleId?: string; runtime?: string }; item?: { text?: string } }>)[0];
    assert.equal(entry.state, "queued", "排队项以 queued 持久化");
    assert.equal(entry.key?.roleId, "A", "键：原角色");
    assert.equal(entry.key?.runtime, "demo", "键：原 runtime");
    assert.equal(entry.item?.text, "第二条", "条目正文落盘");
    // 模拟崩溃/退出：不 settle 直接丢弃 manager1（stop 会 dispose 会话，队列仍如实保留）。
    await h1.mgr.stop(null);

    const h2 = makeHarness({ deliveryQueueStorePath: storePath });
    const report = await h2.mgr.restorePersistedDeliveries();
    assert.equal(report.restored, 1, "重启恢复恰 1 条");
    assert.deepEqual(
      report.items.map((i) => [i.roleId, i.runtime, i.kind]),
      [["A", "demo", "message"]],
      "恢复到原角色/原 runtime/原类别",
    );
    await tick(250);
    assert.ok(h2.sent.A.includes("第二条"), "自动重投到原角色（复用既有投递机；目标未开自动开启）");
    await h2.mgr.stop(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("2026-10-20 重启续跑：in-flight 未完成 ⇒ 重启后重投；delivery.end 成功后 ⇒ 移除且不重投", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-delivery-store-inflight-"));
  try {
    const storePath = path.join(dir, "delivery-queue.json");
    const item = {
      kind: "dispatch",
      runtime: "demo",
      targetRoleId: "A",
      sourceRoleId: "su",
      text: "续跑任务正文：实现 step impl",
      summary: "派发 · 续跑",
      dedupKey: "k-inflight",
      enqueuedAt: new Date().toISOString(),
      flowId: "flow-a",
    };
    fs.writeFileSync(
      storePath,
      JSON.stringify({ version: 1, items: [{ key: { projectRoot: "/proj", roleId: "A", runtime: "demo" }, item, state: "in-flight", enqueuedAt: item.enqueuedAt }] }),
      "utf8",
    );
    const h = makeHarness({ deliveryQueueStorePath: storePath });
    const restored = await h.mgr.restorePersistedDeliveries();
    assert.equal(restored.restored, 1, "in-flight 条目也恢复");
    await tick(250);
    assert.ok(h.sent.A.some((text) => text.includes("续跑任务正文")), "in-flight 重启后按 queued 重投（模型回合重新开始）");
    await waitForStore(storePath, (doc) => Array.isArray(doc.items) && doc.items.length === 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).items, [], "delivery.end 成功后移除持久项");
    await h.mgr.stop(null);

    const h2 = makeHarness({ deliveryQueueStorePath: storePath });
    assert.equal((await h2.mgr.restorePersistedDeliveries()).restored, 0, "已投递成功的条目不再重投");
    await h2.mgr.stop(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ————————————————— view_image 桌面投递（2026-10-26） —————————————————
//
// 客户端要求：工具读取的图片作为**下一轮用户提示的图片附件**排队给**同一角色**——不是客户消息、
// 不冒充客户消息、不按当前活动角色改投。桌面侧能力在开会话时注入（`openRoleSession` 入参
// `viewImage`），实现只经既有 `send` → 同一投递机（忙 ⇒ 入队、settle 后按序投递）。

interface ViewImageHarness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  /** handle.send 的真实入参（含 images 引用——断言「原引用、不丢」）。 */
  delivered: { roleId: string; text: string; images?: PromptImage[] }[];
  roleStates: {
    roleId: string;
    busy: boolean;
    summaries: string[];
    queue: { kind: string; sourceRoleId: string; summary: string; at: string; id: string; full: string }[];
    running: { kind: string; sourceRoleId: string; summary: string; at: string } | null;
  }[];
  /** 每次 open 注入的能力形（验证既有能力不因本接线丢失）。 */
  openInputs: { roleId: string; viewImage?: ViewImageFn; dispatchTask?: unknown }[];
  /** 指定角色的图片投递通道故障（仅带 images 的 send 抛错）。 */
  failImageDeliveries: Set<string>;
  /** 该角色**最近一次**开会话时注入的 viewImage（模拟工具调用它的入口）。 */
  viewImageFor: (roleId: string) => ViewImageFn;
  latest: (roleId: string) => ViewImageHarness["roleStates"][number] | undefined;
}

function makeViewImageHarness(): ViewImageHarness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const delivered: ViewImageHarness["delivered"] = [];
  const roleStates: ViewImageHarness["roleStates"] = [];
  const openInputs: ViewImageHarness["openInputs"] = [];
  const failImageDeliveries = new Set<string>();
  const stopped: Record<string, boolean> = {};

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
        if (opts?.images !== undefined && failImageDeliveries.has(roleId)) {
          throw new Error("演示：图片投递通道不可用");
        }
        delivered.push({ roleId, text, ...(opts?.images !== undefined ? { images: opts.images } : {}) });
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
      openInputs.push({ roleId: input.roleId, ...(input.viewImage ? { viewImage: input.viewImage } : {}), ...(input.dispatchTask ? { dispatchTask: input.dispatchTask } : {}) });
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
    emitEvent: (env) => {
      // 事件流本身不参与本组断言；保留入口以便 consume 循环存在。
      void env;
    },
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        summaries: [...info.summaries],
        queue: (info.queue ?? []).map((x) => ({ ...x })),
        running: info.running ? { ...info.running } : null,
      }),
  });

  return {
    mgr,
    streams,
    delivered,
    roleStates,
    openInputs,
    failImageDeliveries,
    viewImageFor: (roleId) => {
      for (let i = openInputs.length - 1; i >= 0; i -= 1) {
        const input = openInputs[i];
        if (input.roleId === roleId && input.viewImage !== undefined) return input.viewImage;
      }
      throw new Error(`角色 ${roleId} 开会话时未注入 viewImage`);
    },
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
  };
}

test("2026-10-26 view_image：工具本轮调用 ⇒ 后台 system 提示入队；settle 后按序投递给同一角色（图片原引用）", async () => {
  const h = makeViewImageHarness();
  const image: PromptImage = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
  const prompt = buildViewImagePrompt("docs/设计/界面 截图.png");

  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(20);
  const viewImage = h.viewImageFor("A");

  // 既有能力不受影响：A（项目角色）无派发能力、但有 view_image；su（内置）两条都在。
  assert.equal(h.openInputs.find((x) => x.roleId === "A")?.dispatchTask, undefined, "既有能力路由不变（项目角色无派发）");
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  assert.equal(typeof h.openInputs.find((x) => x.roleId === "su")?.dispatchTask, "function", "su 既有派发能力保留");
  assert.equal(typeof h.openInputs.find((x) => x.roleId === "su")?.viewImage, "function", "view_image 对内置角色同样注入");

  // A 真开跑一轮（工具在本轮内调用 ⇒ 角色忙）。显式寻址 A（当前活动角色已切到 su）。
  assert.equal((await h.mgr.send("客户消息：看一下图", undefined, { projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  assert.equal(h.mgr.isRoleBusy("/proj", "A", "demo"), true, "客户消息开跑后 A 忙");
  // 用户切到 su：view_image 必须仍投给**开会话时定格的 A**（不按 activeRoleId 改投）。
  assert.equal(h.mgr.openForRoleId(), "su");
  assert.equal(h.delivered.length, 1, "此时只有客户消息已投出");

  const receipt = await viewImage({ path: "docs/设计/界面 截图.png", image });
  assert.deepEqual(receipt, { ok: true }, "入队成功 ⇒ ok:true（已交给投递机）");
  assert.equal(h.delivered.length, 1, "角色忙：不并发投递图片提示");
  const q = h.latest("A");
  assert.equal(q?.queue.length, 1, "图片提示进入 A 的既有队列");
  assert.equal(q?.queue[0].kind, "system", "后台系统提示（不冒充客户消息）");
  assert.equal(q?.queue[0].sourceRoleId, "A", "来源＝本角色（系统投递）");
  assert.equal(q?.queue[0].full, prompt, "正文含图片路径与原指令");
  assert.ok(!q!.queue[0].summary.startsWith("你："), "系统条目摘要不写「你：」");
  assert.equal(h.latest("su")?.queue.length ?? 0, 0, "不投给当前活动角色 su");

  // settle ⇒ 既有投递机按到达序送达：客户消息在前，图片系统提示在后。
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(
    h.delivered.map((d) => [d.roleId, d.text]),
    [
      ["A", "客户消息：看一下图"],
      ["A", prompt],
    ],
    "settle 后按序投递到同一角色",
  );
  assert.equal(h.delivered[1].images?.length, 1, "PromptOptions.images 恰一张（工具读取的那张）");
  assert.equal(h.delivered[1].images?.[0], image, "工具给的 PromptImage 保持对象原引用（不重新编码/不复制）");
  assert.equal(h.latest("A")?.running?.kind, "system", "出队投递的进行中条目类别仍为 system");
  await h.mgr.stop(null);
});

test("2026-10-26 view_image：发送失败/会话不可用/非法载荷都如实失败，不谎称已提供", async () => {
  const h = makeViewImageHarness();
  const image: PromptImage = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(20);
  const viewImage = h.viewImageFor("A");

  // 非法载荷：不投文本、不制造「说了有图、实际无图」的假消息。
  const noImage = await viewImage({ path: "docs/a.png", image: undefined as unknown as PromptImage });
  assert.equal(noImage.ok, false);
  assert.match(noImage.message ?? "", /不含可投递的图片数据/);
  const badImage = await viewImage({ path: "docs/a.png", image: { type: "image", data: "", mimeType: "image/png" } });
  assert.equal(badImage.ok, false, "空 data 不投递");
  const noPath = await viewImage({ path: "   ", image });
  assert.equal(noPath.ok, false);
  assert.match(noPath.message ?? "", /缺少图片路径/);
  assert.equal(h.delivered.length, 0, "非法载荷零投递");

  // 传输失败：如实回执失败 + 底层原始原因（不吞、不假装已提供）。
  h.failImageDeliveries.add("A");
  const failed = await viewImage({ path: "docs/a.png", image });
  assert.equal(failed.ok, false, "发送失败 ⇒ ok:false");
  assert.match(failed.message ?? "", /投递失败/);
  assert.match(failed.message ?? "", /图片投递通道不可用/, "带底层原始原因");
  assert.equal(h.delivered.length, 0);
  assert.equal(h.mgr.isRoleBusy("/proj", "A", "demo"), false, "直发失败后忙态如实复位");

  // 会话已释放：能力仍被调用时如实报「会话尚未开启」。
  await h.mgr.stop("A");
  const closed = await viewImage({ path: "docs/a.png", image });
  assert.equal(closed.ok, false, "会话不可用 ⇒ ok:false");
  assert.match(closed.message ?? "", /尚未开启/, "如实回执不可用原因");
  await h.mgr.stop(null);
});

test("2026-10-26 view_image：真实客户消息与后台投递的图片语义不变（原引用透传，不额外改写）", async () => {
  const h = makeViewImageHarness();
  const customerImages: PromptImage[] = [{ type: "image", data: "Y3VzdG9tZXI=", mimeType: "image/jpeg" }];
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(20);

  const sent = await h.mgr.send("客户带图消息", { images: customerImages });
  assert.equal(sent.ok, true);
  assert.equal(h.delivered.length, 1);
  assert.equal(h.delivered[0].images, customerImages, "客户消息的 images 同一引用（既有 P0-1 语义逐字不变）");
  assert.equal(h.latest("A")?.running ?? null, null, "真实客户消息仍按既有路径直发（不属于排队系统条目）");
  await h.mgr.stop(null);
});

test("2026-10-26 view_image 集成：真实 openRoleSession + 真实 view_image 工具 ⇒ 本轮内排队、settle 后把同一 PromptImage 投给同一角色", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-desktop-view-image-"));
  try {
    // 1×1 透明 PNG（工具按真实文件读取/扩展名校验；base64 由工具自己生成交给能力）。
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "shot.png"), png);
    // 真实 openRoleSession 会读角色卡与边界文件（枚举只提供路径；内容以盘上为准）。
    fs.mkdirSync(path.join(dir, "角色卡", "A"), { recursive: true });
    fs.writeFileSync(path.join(dir, "角色卡", "A", "role-card.md"), "# 角色 A\n\nview_image 集成测试。\n");
    fs.writeFileSync(
      path.join(dir, "角色卡", "A", "boundary.yaml"),
      "role: A\nentries:\n  - kind: file\n    path: docs/shot.png\n    purpose: view_image 测试图片\n",
    );

    const projectListing: ProjectListing = {
      projectRoot: dir,
      roles: [
        {
          roleId: "A",
          cardPath: "角色卡/A/role-card.md",
          boundaryPath: "角色卡/A/boundary.yaml",
          cardText: "角色 A",
          boundary: {
            entries: [{ root: "project", path: "docs/shot.png", kind: "file", purpose: "view_image 测试图片" }],
            boundarySource: "角色卡/A/boundary.yaml",
            acceptance: { accepted: false, source: "" },
          },
        },
      ],
      warnings: [],
      hasRoles: true,
      primaryRoleId: "A",
    };

    // 假 provider（不触网、不跑真实模型）：只在**第一轮**客户端提示里真实调用注册的 view_image 工具，
    // 然后照常发 settled（驱动既有投递机放行排队项）。
    const engineEvents: SessionEvent[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const pushEvent = (event: SessionEvent): void => {
      engineEvents.push(event);
      wake?.();
      wake = undefined;
    };
    const delivered: { text: string; images?: PromptImage[] }[] = [];
    const toolResults: ToolResult[] = [];
    let toolCalls = 0;
    const providerFactory: RuntimeProviderFactory = (options) => {
      assert.equal(options.toolDisplayMode, "required-v1", "真实编排按 required-v1 装配工具展示");
      options.registerToolDisplayProfile?.({ credentials: [] });
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole() {
          return {
            runtime: options.runtime,
            async prompt(text: string, opts?: PromptOptions): Promise<void> {
              if (toolCalls === 0) {
                const tool = options.tools.find((item) => item.name === "view_image");
                assert.ok(tool, "桌面注入 viewImage ⇒ 真实编排/运行时核心注册 view_image");
                toolCalls += 1;
                toolResults.push(
                  await tool!.handler({ name: "view_image", args: { path: "docs/shot.png" }, toolCallId: "call-view-image-1", signal: new AbortController().signal }),
                );
              } else if (text.startsWith("这是 view_image 请求的图片：")) {
                delivered.push({ text, ...(opts?.images !== undefined ? { images: opts.images } : {}) });
              }
              pushEvent({ kind: "settled", summary: "engine settled", runtime: options.runtime });
            },
            events(): AsyncIterable<SessionEvent> {
              return {
                [Symbol.asyncIterator]() {
                  return {
                    async next(): Promise<IteratorResult<SessionEvent>> {
                      while (true) {
                        if (engineEvents.length > 0) return { value: engineEvents.shift()!, done: false };
                        if (closed) return { value: undefined as unknown as SessionEvent, done: true };
                        await new Promise<void>((resolve) => {
                          wake = resolve;
                        });
                      }
                    },
                  };
                },
              };
            },
            async dispose(): Promise<void> {
              closed = true;
              wake?.();
            },
          };
        },
      };
    };

    const roleStates: ViewImageHarness["roleStates"] = [];
    const openInputs: { roleId: string; viewImage?: ViewImageFn }[] = [];
    const mgr = new SessionManager({
      openRoleSession: (input, deps) => {
        openInputs.push({ roleId: input.roleId, ...(input.viewImage !== undefined ? { viewImage: input.viewImage } : {}) });
        return openRoleSessionReal(input, deps);
      },
      createRuntimeAdapterFactory: (project, runtime, options) =>
        createRuntimeAdapterFactoryReal(project, runtime, {
          ...options,
          providerFactories: { demo: providerFactory },
          persistSession: false,
        }),
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
      buildProjectConfig,
      getListing: (root) => (root === dir ? projectListing : undefined),
      emitEvent: () => {},
      emitRoleState: (info) =>
        roleStates.push({
          roleId: info.roleId,
          busy: info.busy,
          summaries: [...info.summaries],
          queue: (info.queue ?? []).map((x) => ({ ...x })),
          running: info.running ? { ...info.running } : null,
        }),
    });

    const opened = await mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    assert.equal(typeof openInputs[0]?.viewImage, "function", "开会话时向真实编排注入 viewImage");

    const sent = await mgr.send("请查看 docs/shot.png");
    assert.equal(sent.ok, true);
    await tick(250);

    assert.equal(toolCalls, 1, "工具在本轮内被调用一次");
    assert.equal(toolResults[0]?.ok, true, "能力受理（排队）⇒ 工具回执 ok");
    assert.match(toolResults[0]?.message ?? "", /已读取并排队/, "工具本轮只回「已排队」（两轮附件语义）");
    assert.equal(delivered.length, 1, "settle 后图片提示按既有投递机送达一次");
    assert.equal(delivered[0].text, buildViewImagePrompt("docs/shot.png"), "文本含路径与原指令");
    assert.equal(delivered[0].images?.length, 1, "带恰一张图片附件");
    assert.deepEqual(
      delivered[0].images?.[0],
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      "工具读取的真实字节（base64 + MIME）原样进入下一轮 PromptOptions.images",
    );
    assert.ok(
      roleStates.some((s) => s.roleId === "A" && s.queue[0]?.kind === "system" && s.queue[0].full === buildViewImagePrompt("docs/shot.png")),
      "本轮内（角色忙）以 system 类别入队，settle 后放行",
    );
    await mgr.stop(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("2026-10-20 重启续跑：重复 dedupKey 只重投一次；损坏条目/损坏 store 不崩；多项目/多角色键隔离", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-delivery-store-multi-"));
  try {
    const storePath = path.join(dir, "delivery-queue.json");
    const itemOf = (targetRoleId: string, text: string, dedupKey: string) => ({
      kind: "message",
      runtime: "demo",
      targetRoleId,
      sourceRoleId: "客户",
      text,
      summary: `你：${text}`,
      dedupKey,
      enqueuedAt: new Date().toISOString(),
    });
    const entryOf = (projectRoot: string, roleId: string, item: ReturnType<typeof itemOf>) => ({
      key: { projectRoot, roleId, runtime: "demo" },
      item,
      state: "queued",
      enqueuedAt: item.enqueuedAt,
    });
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        items: [
          entryOf("/proj", "A", itemOf("A", "A-任务", "dup-key")),
          entryOf("/proj", "A", itemOf("A", "A-重复", "dup-key")),
          { key: { projectRoot: "/proj" }, item: null, state: "queued" }, // 坏条目
          entryOf("/proj2", "B", itemOf("B", "B-任务", "b-key")),
        ],
      }),
      "utf8",
    );
    const h = makeHarness({ deliveryQueueStorePath: storePath });
    const report = await h.mgr.restorePersistedDeliveries();
    assert.equal(report.restored, 2, "A 一条（重复 dedupKey 去重）+ B 一条；坏条目跳过");
    assert.ok(report.skipped >= 2, "重复与坏条目计入 skipped（如实）");
    await tick(250);
    assert.deepEqual(h.sent.A, ["A-任务"], "同 dedupKey 只重投一次");
    const otherQueue = h.mgr.watchdogSnapshot("/proj2")?.queues.find((q) => q.targetRoleId === "B");
    assert.equal(otherQueue?.items.length, 1, "另一项目的队列独立保留（按 project+role+runtime 键隔离，不并入 /proj）");
    await h.mgr.stop(null);

    fs.writeFileSync(storePath, "{ not json", "utf8");
    const h2 = makeHarness({ deliveryQueueStorePath: storePath });
    const broken = await h2.mgr.restorePersistedDeliveries();
    assert.equal(broken.restored, 0, "损坏 store ⇒ 只记诊断、返回 0、不猜内容、不崩");
    await h2.mgr.stop(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
