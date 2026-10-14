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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app");
const RENDERER = fs.readFileSync(path.join(APP_DIR, "renderer", "renderer.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(APP_DIR, "preload.cjs"), "utf8");
const MAIN = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
const IFACE = fs.readFileSync(path.join(APP_DIR, "desktop", "interface.ts"), "utf8");
const SESSION = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8");
const STYLES = fs.readFileSync(path.join(APP_DIR, "renderer", "styles.css"), "utf8");

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
  envelopes: { roleId: string; event: OrchestrationEvent }[];
  roleStates: RoleStateSnapshot[];
  openCalls: string[];
  /** 可运行期调整的失败计数器（`handle.send` 每次调用消耗 1；用于精确安排「第二次尝试失败」）。 */
  failLeft: Record<string, number>;
  /** 某角色**最近一次**真实状态快照（外推值；无则 undefined）。 */
  latest: (roleId: string) => RoleStateSnapshot | undefined;
}

function makeHarness(): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const roleStates: RoleStateSnapshot[] = [];
  const openCalls: string[] = [];
  const stopped: Record<string, boolean> = {};
  const failLeft: Record<string, number> = {};

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
  });
  return {
    mgr,
    streams,
    sent,
    envelopes,
    roleStates,
    openCalls,
    failLeft,
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
    (e) => e.event.kind === "tool_call" && /排队消息投递失败（角色 A）/.test(e.event.summary)
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

test("状态准确性（复现 vs 修后）：投递开跑的后台轮次——旧事实组合派生「空闲」（复现），真实快照 busy 派生「工作中」（修后）", async () => {
  const href = new URL("../../app/renderer/role-status.js", import.meta.url).href;
  await import(href);
  const St = (globalThis as Record<string, unknown>).ANSRoleStatus as {
    deriveRoleStatus: (f: Record<string, unknown>) => string;
    statusBadge: (s: string, n?: number) => { label: string };
  };

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
    h.envelopes.filter((e) => e.event.kind === "tool_call" && /形状不符/.test(e.event.summary)).length,
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

  // ——复现（旧）——：界面侧唯一「working」来源是**本端自己 send 成功**；投递开跑的一轮，界面上什么忙态信号
  // 都没有（live 只说明会话保活着）——旧派生结果 = 「空闲」＝「其实在跑却显示空闲」。
  assert.equal(
    St.deriveRoleStatus({ live: true, hadSession: true }),
    "idle",
    "复现：旧事实组合（无真实 busy 信号）派生「空闲」——正是客户报的错标"
  );
  // ——修后——：同一时刻，主进程真实快照（busy:true）如实驱动派生 = 「工作中」。
  assert.equal(
    St.deriveRoleStatus({ live: true, hadSession: true, busy: snap!.busy }),
    "working",
    "修后：真实快照驱动 ⇒ 「工作中」（不再由界面推测）"
  );

  // 后台在跑（B-2 下切走/无任何界面动作）：静置后快照仍是 busy:true；轮次结束（settled）转 false。
  await tick(150);
  assert.equal(h.latest("su")?.busy, true, "无界面动作期间快照保持 busy:true（后台轮次如实）");
  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(150);
  assert.equal(h.latest("su")?.busy, false, "settled ⇒ 快照转 busy:false");
  assert.equal(
    St.deriveRoleStatus({ live: true, hadSession: true, busy: h.latest("su")!.busy }),
    "idle",
    "轮次结束、无待办 ⇒ 「空闲」（如实）"
  );
  await h.mgr.stop(null);
});

test("状态准确性：队列待办的角色不得显示「空闲」——快照(queueDepth) + 徽标「工作中 · N 待办」", async () => {
  const href = new URL("../../app/renderer/role-status.js", import.meta.url).href;
  await import(href);
  const St = (globalThis as Record<string, unknown>).ANSRoleStatus as {
    deriveRoleStatus: (f: Record<string, unknown>) => string;
    statusBadge: (s: string, n?: number) => { label: string; icon: string; title: string };
  };

  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("占位");
  await h.mgr.send("排队 1");
  await h.mgr.send("排队 2");
  const snap = h.latest("A");
  assert.ok(snap && snap.summaries.length === 2, "快照带 2 条待办（真实队列深度）");
  assert.equal(
    St.deriveRoleStatus({ live: true, busy: snap!.busy, queueDepth: snap!.summaries.length }),
    "working",
    "有排队待办 ⇒ 「工作中」（不得显示「空闲」）"
  );
  assert.equal(St.statusBadge("working", 2).label, "工作中 · 2 待办", "徽标如实带待办数");
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
  // 渲染侧：只如实转述快照；队列行与徽标由它驱动。
  assert.ok(RENDERER.includes("d.onRoleState") && RENDERER.includes("function onRoleState("), "渲染侧应订阅并处理真实快照");
  assert.ok(RENDERER.includes("state.roleBusy") && RENDERER.includes("state.queueByRole"), "快照落两表（busy/队列摘要）");
  assert.ok(RENDERER.includes("【队列】") && RENDERER.includes("条待办"), "聊天流应有队列行");
  assert.ok(RENDERER.includes("已入队：等它完成当前任务后处理（第 "), "入队后有如实位次提示");
  assert.ok(STYLES.includes(".sys-queue"), "样式钩子 .sys-queue");
  // **反向断言**：界面侧不再自设忙态（旧 `working` 推测已退役——它正是错标根因）。
  assert.ok(!RENDERER.includes("metaFor(role.roleId).working"), "渲染侧不得由本端发送自设忙态");
  assert.ok(!RENDERER.includes(".working = true"), "渲染侧不得有任何 working=true 的界面推测");
  assert.ok(!RENDERER.includes("working: m.working"), "派生事实里不得再喂界面自设的 working");
});
