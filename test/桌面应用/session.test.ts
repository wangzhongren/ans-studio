// test/桌面应用/session.test.ts
// 桌面窗口：会话管理器端到端单测——真实 openRoleSession + 真实 listProject + 真实多轮演示适配器。
// 验证（客户最终模型「导入项目即授权；点角色即开」）：open 直接建会话（无摘要/无 nonce）；
// 多轮 send 事件持续刷出；同角色重复点击续接（不重建）；**B-2（2026-10-12）：切换角色**不** dispose——
// 各自保活、切回续接（LRU 上限 MAX_LIVE_SESSIONS）**；事件带 `roleId` 信封（多会话不串）；越界被拒。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SessionEvent } from "../../src/provider/pi/session.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import { openRoleSession, createPiAdapterFactory, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { listProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createChatDemoAdapter, firstProjectFilePath } from "../../app/desktop/chat-adapter.ts";
import { SessionManager, MAX_LIVE_SESSIONS, type SessionEventEnvelope } from "../../app/desktop/session.ts";
// G-2（2026-10-16 客户批准）：看护器纯逻辑（W1 信号/去重/冷却/风暴护栏 + W3 滞回收束）——**假快照＋注入
// 时钟**，不起真实会话（集成面在 message-queue/dispatch-delivery 的 G-2 块）。
import {
  createWatchdogService,
  resolveWatchdogConfig,
  WATCHDOG_SILENCE_ENV,
  WATCHDOG_TICK_ENV,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
  type WatchdogService,
} from "../../app/desktop/watchdog.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function makeManager(listing: ProjectListing, events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[]): SessionManager {
  return new SessionManager({
    openRoleSession,
    createPiAdapterFactory,
    createDemoAdapter: createChatDemoAdapter,
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => events.push(env.event),
  });
}

test("firstProjectFilePath：取边界内首个项目根 file 条目", async () => {
  const listing = await listProject(REPO_ROOT);
  const role = listing.roles.find((r) => r.roleId === "桌面窗口")!;
  // 拆分后（2026-10-14）本角色边界的首个 project file 条目是 app/main.ts。
  assert.equal(firstProjectFilePath(role.boundary), "app/main.ts");
});

test("点角色即开：open 直接建会话（无摘要/nonce），多轮 send、越界被拒且含按根分组", async () => {
  const listing = await listProject(REPO_ROOT);
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const mgr = makeManager(listing, events);

  const res = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(res.ok, true, "点角色应直接开启会话（无确认步骤）");
  await tick();

  // 客户裁定（2026-10-13）：常规「已开启…」欢迎提示已删——开启时聊天流**无**常规提示事件
  // （异常提示保留：contextWarning / O-1 边界重建 / 投递失败等不受影响）；此时尚无任何写入。
  assert.equal(events.filter((e) => e.kind === "message" && e.summary.includes("已开启")).length, 0, "不应再有会话开启欢迎提示（客户裁定）");
  assert.equal(events.filter((e) => e.kind === "tool_call" || e.kind === "denied").length, 0, "开启时不应有写入尝试");

  // 连续两条消息都生效
  await mgr.send("第一条：试着改点东西");
  await tick();
  await mgr.send("第二条：再试一次越界");
  await tick();

  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.filter((k) => k === "tool_call").length >= 4, "两轮共至少 4 次工具调用");
  assert.ok(kinds.includes("accepted"), "边界内写入应被接受（scope undefined + 导入即授权）");
  assert.ok(kinds.includes("denied"), "越界写入应被拒");
  // 事件跨两轮累积（多轮直发）
  assert.ok(events.filter((e) => e.kind === "message" && /第 2 轮/.test(e.summary)).length >= 1, "应出现第 2 轮事件");
  // 越界拒绝含按根分组的允许路径（内联反馈）
  const denied = events.find((e) => e.kind === "denied");
  assert.ok(denied && /按根分组/.test(denied.summary), "拒绝信息应含按根分组的允许路径");

  const stop = await mgr.stop();
  assert.equal(stop.ok, true);
  assert.equal(mgr.isOpen(), false);
});

test("同一角色重复点击：续接当前会话，不重建", async () => {
  const listing = await listProject(REPO_ROOT);
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  let opened = 0;
  const mgr = new SessionManager({
    openRoleSession: (input, deps) => {
      opened += 1;
      return openRoleSession(input, deps);
    },
    createPiAdapterFactory,
    createDemoAdapter: createChatDemoAdapter,
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => events.push(env.event),
  });

  const r1 = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r1.ok, true);
  await tick();
  const r2 = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r2.ok, true, "同角色重复点击应成功（续接）");
  assert.ok(r2.note, "续接应附说明");
  assert.equal(opened, 1, "续接不得重建会话");

  await mgr.send("续接后仍可发");
  await tick();
  assert.ok(events.some((e) => e.kind === "message" && e.summary.includes("续接后仍可发")), "续接后消息应继续进入同一会话");
  await mgr.stop();
});

// ————— B-2（2026-10-12）：切换保留历史——并存会话 + LRU 上限 + 事件信封 —————

/** 造一个假项目枚举（roles 为纯数据；boundary 用最小形状）。 */
function fakeListing(roleIds: string[], primaryRoleId: string): ProjectListing {
  return {
    projectRoot: "/proj",
    roles: roleIds.map((id) => ({
      roleId: id,
      cardPath: `角色卡/${id}/role-card.md`,
      boundaryPath: `角色卡/${id}/boundary.yaml`,
      cardText: `角色 ${id}`,
      boundary: {
        entries: [{ root: "project", path: `src/${id}.ts`, kind: "file", purpose: "p" }],
        boundarySource: `角色卡/${id}/boundary.yaml`,
        acceptance: { accepted: false, source: "" },
      },
    })),
    warnings: [],
    hasRoles: true,
    primaryRoleId,
  };
}

/** 假句柄：事件流立即结束；dispose 记名（验证 LRU/定向 stop 的释放语义）。 */
function fakeQuietHandle(roleId: string, disposed: string[]): RoleSessionHandle {
  return {
    async send(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      disposed.push(roleId);
    },
  };
}

test("B-2 切换并存：A→B→A 不 dispose 旧会话，切回直接续（open 计数=2）", async () => {
  const listing = fakeListing(["A", "B"], "A");
  const disposed: string[] = [];
  let opened = 0;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      opened += 1;
      return fakeQuietHandle(input.roleId, disposed);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
  });

  const r1 = await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(r1.ok, true);
  assert.equal(r1.resumed, false, "首个会话是新建");
  assert.equal(mgr.openForRoleId(), "A");
  const r2 = await mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  assert.equal(r2.ok, true);
  assert.deepEqual(disposed, [], "B-2：切换角色**不得** dispose 旧会话（并存保活）");
  assert.deepEqual(mgr.liveRoleIds().sort(), ["A", "B"], "两角色都应保活");
  assert.equal(mgr.openForRoleId(), "B");

  // 切回 A：**续接**（不重建）——设计锚点「A→B→A open 计数=2」。
  const back = await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(back.ok, true);
  assert.equal(back.resumed, true, "切回应续接已保活会话（resumed=true）");
  assert.ok(back.note && back.note.includes("续接"), "续接应附说明");
  assert.equal(opened, 2, "A→B→A 只应开 2 个会话（切回不重建）");
  assert.equal(mgr.openForRoleId(), "A");

  // 定向 stop：只关 A；B 仍保活；再全关。
  const s1 = await mgr.stop("A");
  assert.equal(s1.ok, true);
  assert.deepEqual(disposed, ["A"], "定向 stop 只 dispose 该角色");
  assert.deepEqual(mgr.liveRoleIds(), ["B"], "B 不受定向 stop 影响");
  const s2 = await mgr.stop(null);
  assert.equal(s2.ok, true);
  assert.deepEqual(disposed, ["A", "B"], "stop(null) 关闭全部");
  assert.equal(mgr.isOpen(), false);
});

test("B-2 LRU 上限：第 MAX_LIVE_SESSIONS+1 个会话淘汰最久未用者；被淘汰者切回是新建", async () => {
  const listing = fakeListing(["A", "B", "C", "D"], "A");
  const disposed: string[] = [];
  let opened = 0;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      opened += 1;
      return fakeQuietHandle(input.roleId, disposed);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
  });

  for (const id of ["A", "B", "C"]) {
    await mgr.open({ projectRoot: "/proj", roleId: id, runtime: "demo" });
  }
  assert.equal(disposed.length, 0, `保活 ${MAX_LIVE_SESSIONS} 个以内不淘汰`);

  await mgr.open({ projectRoot: "/proj", roleId: "D", runtime: "demo" });
  assert.equal(opened, 4);
  assert.deepEqual(disposed, ["A"], "开第 4 个会话应淘汰最久未用的 A");
  assert.deepEqual(mgr.liveRoleIds().sort(), ["B", "C", "D"]);

  const again = await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(again.resumed, false, "被淘汰者切回是**新建**（渲染侧据此提示「模型上下文已重启」）");
  assert.equal(opened, 5, "被淘汰者切回应重新 open（不是续接）");
  assert.deepEqual(disposed, ["A", "B"], "越限后淘汰当时的 LRU（B）");
  await mgr.stop(null);
});

test("B-2 事件信封：每会话事件带自己的 roleId；切走/在别的会话期间，后台仍持续拉取（不串消息）", async () => {
  const listing = fakeListing(["A", "B"], "A");
  const envelopes: SessionEventEnvelope[] = [];
  const streams: Record<string, OrchestrationEvent[]> = { A: [], B: [] };
  const stopped: Record<string, boolean> = { A: false, B: false };
  const streamHandle = (id: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(): Promise<void> {},
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                // 简易轮询（测试用）：有新事件即给；dispose 后立刻收口。
                for (let tries = 0; tries < 60; tries += 1) {
                  if (stopped[id]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  if (i < streams[id].length) return { value: streams[id][i++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {
        stopped[id] = true;
      },
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => streamHandle(input.roleId),
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

  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  streams.A.push({ kind: "message", summary: "A 轮 1" });
  await tick(30);

  // 切到 B 之后，再给 A 推事件——**后台消费未停**（拉驱动不停则重 pin/回交会停摆）。
  await mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  streams.A.push({ kind: "message", summary: "A 轮 2（B 打开后）" });
  streams.B.push({ kind: "message", summary: "B 轮 1" });
  await tick(60);

  const aMsgs = envelopes.filter((e) => e.roleId === "A").map((e) => e.event).filter((e) => e.kind === "message");
  const bMsgs = envelopes.filter((e) => e.roleId === "B").map((e) => e.event).filter((e) => e.kind === "message");
  assert.ok(
    aMsgs.some((e) => e.summary === "A 轮 1") && aMsgs.some((e) => e.summary === "A 轮 2（B 打开后）"),
    "A 的两条事件都应到达（含 B 打开后推的那条——后台持续消费）"
  );
  assert.ok(bMsgs.some((e) => e.summary === "B 轮 1"), "B 的事件应到达且带 B 的信封");
  assert.ok(!aMsgs.some((e) => e.summary === "B 轮 1") && !bMsgs.some((e) => /^A 轮/.test(e.summary)), "多会话不得串消息（信封隔离）");
  await mgr.stop(null);
});

test("未导入项目就点角色：open 如实失败", async () => {
  const listing = await listProject(REPO_ROOT);
  const mgr = makeManager(listing, []);
  const r = await mgr.open({ projectRoot: "D:/never-listed", roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r.ok, false);
  assert.match(r.error || "", /尚未枚举/);
});

test("未知角色：open 如实失败", async () => {
  const listing = await listProject(REPO_ROOT);
  const mgr = makeManager(listing, []);
  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "不存在的角色", runtime: "demo" });
  assert.equal(r.ok, false);
  assert.match(r.error || "", /未找到角色/);
});

test("send 在未开启会话时如实失败", async () => {
  const listing = await listProject(REPO_ROOT);
  const mgr = makeManager(listing, []);
  const r = await mgr.send("hi");
  assert.equal(r.ok, false);
  assert.match(r.error || "", /尚未开启/);
});

// ————— T10 第1件：运行期同意是「登记的非-pin 例外」，行为不变（accepted:true 且不带 pin）—————

test("运行期同意：登记的非-pin 例外——accepted:true 且不带 pin，来源如实标注（行为不变）", async () => {
  const listing = await listProject(REPO_ROOT);
  let captured: ProjectConfig | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured = input.project;
      return {
        async send(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<SessionEvent>> {
                  return { value: undefined as unknown as SessionEvent, done: true };
                },
              };
            },
          };
        },
        async dispose(): Promise<void> {},
      };
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: () => {},
  });

  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r.ok, true);
  assert.ok(captured, "应调用 openRoleSession");
  const acc = captured!.governanceBoundary?.acceptance;
  assert.ok(acc, "应带 governanceBoundary.acceptance");
  // 行为不变：导入即授权（accepted:true）——这是 §3.3 登记的例外，不是「忘了加 pin」。
  assert.equal(acc!.accepted, true, "导入项目即授权（登记的非-pin 例外）");
  assert.equal(acc!.pin, undefined, "登记的非-pin 例外不得带 pin（给实时授权硬加 hash 是假证据）");
  assert.ok((acc!.source || "").includes("desktop-app"), "来源须如实标注 desktop-app");
  assert.ok((acc!.source || "").includes("无客户 pin"), "来源须如实标注无客户 pin");
  await mgr.stop();
});

// ————— T20：emitEvent 放宽到编排事件——handback 回交事件被外推（设计 §10.8）—————

test("T20 handback 事件被外推：会话句柄产出的回交事件经 emitEvent 原样送达（§10.8）", async () => {
  const listing = await listProject(REPO_ROOT);
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const handback: TaskHandback = {
    roleId: "桌面窗口",
    taskId: "T20",
    status: "completed",
    summary: "完成边界内改动",
    evidence: ["角色卡/桌面窗口/feature-map.md"],
    at: "2026-10-11T00:00:00.000Z",
  };
  // 假句柄：事件流产出编排的 `OrchestrationEvent`（settled 之前带一条 handback，与 withHandback 同序）。
  const mgr = new SessionManager({
    openRoleSession: async () => {
      const seq: OrchestrationEvent[] = [
        { kind: "settled", summary: "会话结束" },
        { kind: "handback", summary: `回交 su：${handback.summary}`, handback, liveReport: { source: { roleId: handback.roleId }, taskId: handback.taskId ?? null, status: handback.status, summary: { text: handback.summary, truncated: false, redacted: false }, evidence: handback.evidence.map(text => ({ text, truncated: false, redacted: false })), evidenceOmitted: 0, at: handback.at } },
      ];
      let i = 0;
      return {
        async send(): Promise<void> {},
        events(): AsyncIterable<OrchestrationEvent> {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return i < seq.length
                    ? { value: seq[i++], done: false }
                    : { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose(): Promise<void> {},
      };
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => events.push(env.event),
  });

  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r.ok, true);
  await tick();

  const hb = events.find((e) => e.kind === "handback");
  assert.ok(hb, "handback 事件应经 emitEvent 外推（emitEvent 已放宽到 OrchestrationEvent）");
  assert.equal(Object.hasOwn(hb!, "handback"), false, "raw model report never reaches IPC");
  const payload = (hb as Extract<import("../../app/desktop/session.ts").DesktopOrchestrationEvent, { kind: "handback" }>).liveReport!;
  assert.equal(payload.source.roleId, "桌面窗口", "回交应携带产出角色 id");
  assert.equal(payload.status, "completed", "回交应携带结论（completed/blocked）");
  assert.equal(payload.taskId, "T20", "回交应携带任务 id");
  assert.deepEqual(payload.evidence.map(e => e.text), ["角色卡/桌面窗口/feature-map.md"], "回交只搬证据（产物路径）");
  await mgr.stop();
});

// ——————————————————————————————————————————————————————————————————————————————————————
// G-2（2026-10-16 客户批准；设计 2026-10-16_design_role-watchdog-and-closure.md §三/§七/§十一）：
// **看护器（W1 信号 #1-#4 + W3 滞回收束）纯逻辑**——假快照＋注入时钟，node 下直接单测。
// 覆盖：阈值边界、排除项（挂起确认卡角色 / su 自身忙）、去重与冷却、F-6 形态「看护恢复」行、
// 风暴护栏、watchdog.failed 隔离、滞回状态机（恰一次 / su 回复不重武装 / 真实活动重武装 / 预热）。
// 文案是**编排单一来源**（common/编排/watchdog.ts）——本组只钉关键不变式（文首/计数/次数），不逐字抄。
// ——————————————————————————————————————————————————————————————————————————————————————

interface WatchdogHarness {
  service: WatchdogService;
  delivered: { projectRoot: string; text: string; summary: string; dedupKey: string }[];
  setSnapshot: (root: string, snapshot: WatchdogProjectSnapshot | undefined) => void;
  advance: (ms: number) => void;
  nowMs: () => number;
  /** 令下一次 deliver 抛错（「投递端异常 ⇏ 消费窗口」钉子）；一次性。 */
  failNextDeliver: () => void;
}

function makeWatchdogHarness(): WatchdogHarness {
  let ms = 1_700_000_000_000;
  const delivered: WatchdogHarness["delivered"] = [];
  const snapshots = new Map<string, WatchdogProjectSnapshot>();
  let failNext = false;
  const service = createWatchdogService({
    projects: () => [...snapshots.keys()],
    snapshot: (root) => snapshots.get(root),
    deliver: (root, message) => {
      if (failNext) {
        failNext = false;
        throw new Error("替身：投递端异常");
      }
      delivered.push({ projectRoot: root, ...message });
    },
    now: () => ms,
    config: { env: {}, silenceMs: 5 * 60 * 1000, tickMs: 30 * 1000 },
  });
  return {
    service,
    delivered,
    setSnapshot: (root, snapshot) => {
      if (snapshot === undefined) snapshots.delete(root);
      else snapshots.set(root, snapshot);
    },
    advance: (delta) => { ms += delta; },
    nowMs: () => ms,
    failNextDeliver: () => { failNext = true; },
  };
}

function wdRole(roleId: string, extra: Partial<WatchdogRoleView> = {}): WatchdogRoleView {
  return { roleId, runtime: "demo", busy: false, ...extra };
}

function wdSnapshot(over: Partial<WatchdogProjectSnapshot> = {}): WatchdogProjectSnapshot {
  return {
    projectRoot: "/p",
    suRoleId: "su",
    roles: [],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map(),
    ...over,
  };
}

test("G-2 配置：tick/静默仅 env 可调（非法/缺失回退默认 30s/5min）；阈值表取 §3.2 默认", () => {
  const defaults = resolveWatchdogConfig({});
  assert.equal(defaults.tickMs, 30000, "默认 tick 30s");
  assert.equal(defaults.silenceMs, 5 * 60 * 1000, "默认静默 5min");
  assert.equal(defaults.turnDeadlineRatio, 0.9, "阈值 #1：90%");
  assert.equal(defaults.queueHeadAgeMs, 10 * 60 * 1000, "阈值 #2：队首 age 10min");
  assert.equal(defaults.queueDepth, 5, "阈值 #2 辅判：深度 5");
  assert.equal(defaults.repeatFailCount, 3, "阈值 #4：15min ≥3");
  const overridden = resolveWatchdogConfig({ [WATCHDOG_TICK_ENV]: "5000", [WATCHDOG_SILENCE_ENV]: "180000" });
  assert.equal(overridden.tickMs, 5000, "env 覆盖 tick");
  assert.equal(overridden.silenceMs, 180000, "env 覆盖静默");
  assert.equal(resolveWatchdogConfig({ [WATCHDOG_TICK_ENV]: "0", [WATCHDOG_SILENCE_ENV]: "abc" }).tickMs, 30000, "非法值回退默认（不炸）");
});

test("G-2/W1 #1：轮次 90% 生效时限才报（demo=120s → 108s 边界）；每轮一次；正常结束投「看护恢复」行", () => {
  const h = makeWatchdogHarness();
  const started = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: started, turnId: "t1" })] }));
  h.advance(107_000); // 107s < 108s
  h.service.tick();
  assert.equal(h.delivered.length, 0, "未到 90% 线不报（边界之下）");
  h.advance(1_000); // 恰 108s
  h.service.tick();
  assert.equal(h.delivered.length, 1, "到 90% 线即报（含边界）");
  assert.ok(h.delivered[0].text.startsWith("[系统·看护]") && h.delivered[0].text.includes("轮次逼近超时") && h.delivered[0].text.includes("A"), "文案＝编排单一来源（文首/信号/角色）");
  h.advance(30_000);
  h.service.tick();
  assert.equal(h.delivered.length, 1, "同一活跃期内重复命中只累计（不重复打扰）");
  // 该轮正常结束（settled, completed）⇒ 条件解除 ⇒ 一条「看护恢复」（含命中/抑制计数）。
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick();
  assert.equal(h.delivered.length, 2, "解除时恰一条恢复行");
  assert.ok(h.delivered[1].text.includes("看护恢复") && h.delivered[1].text.includes("轮次逼近超时"), "F-6 形态恢复行");
  // 新一轮（新身份）⇒ 允许再次告警（「每轮一次」≠ 一生一次）。
  const restart = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: restart, turnId: "t2" })] }));
  h.advance(108_000);
  h.service.tick();
  assert.equal(h.delivered.length, 3, "新一轮到线再次告警（t2 独立去重身份）");
});

test("G-2/W1 「正确等待不报」：#1 对带挂起确认卡的角色排除；su 自身忙不触发任何告警", () => {
  const h = makeWatchdogHarness();
  let t = h.nowMs();
  // 角色 A 过 90% 但带一张挂起确认卡 ⇒ 不报。
  h.setSnapshot("/p", wdSnapshot({
    roles: [wdRole("A", { busy: true, turnStartedAt: t, turnId: "t1" })],
    pendingConfirmationsTotal: 1,
    pendingConfirmationsByRole: new Map([["A", 1]]),
  }));
  h.advance(110_000);
  h.service.tick();
  assert.equal(h.delivered.length, 0, "挂起确认卡 = 正确等待（不计入 #1）");
  // 卡解除后到线 ⇒ 报。
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: t, turnId: "t1" })] }));
  h.service.tick();
  assert.equal(h.delivered.length, 1, "卡解除后恢复检测");
  // su 自身忙：su 过 90% 不报；su 忙时对 su 的命令超时（#3 事件）也不报。
  t = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("su", { busy: true, turnStartedAt: t, turnId: "st" })] }));
  h.advance(110_000);
  h.service.tick();
  h.service.observe("/p", { kind: "command-timed-out", roleId: "su", at: h.nowMs() });
  const before = h.delivered.length;
  h.service.tick();
  assert.equal(h.delivered.length, before, "su 自身忙（正在处理）不触发任何告警");
});

test("G-2/W1 #2：投递排队积压（age ≥10min 或深度 ≥5）；冷却 10min；队列清空投恢复行", () => {
  const h = makeWatchdogHarness();
  const now = h.nowMs();
  const item = (at: number, id: string) => ({ kind: "dispatch", dedupKey: id, sourceRoleId: "su", summary: "跑任务", enqueuedAtMs: at });
  // 深度 5（age 新——depth 辅判即触发）。
  h.setSnapshot("/p", wdSnapshot({ queues: [{ targetRoleId: "A", runtime: "demo", items: [1, 2, 3, 4, 5].map((i) => item(now, `d${i}`)) }] }));
  h.service.tick();
  assert.equal(h.delivered.length, 1, "深度 ≥5 触发（age 优先/depth 辅判——§3.2 #2）");
  assert.ok(h.delivered[0].text.includes("投递排队积压") && h.delivered[0].text.includes("队列深度 5"), "事实行含深度");
  // 队列清空 ⇒ 恢复行；随后又积压（10min 冷却内）⇒ 不再报。
  h.setSnapshot("/p", wdSnapshot());
  h.service.tick();
  assert.equal(h.delivered.length, 2, "清空 ⇒ 恢复行");
  h.advance(60_000);
  h.setSnapshot("/p", wdSnapshot({ queues: [{ targetRoleId: "A", runtime: "demo", items: [item(h.nowMs(), "d9")] }] }));
  h.service.tick();
  assert.equal(h.delivered.length, 2, "10min 冷却内的再次积压：抑制（不重复打扰）");
  // age 通道：单条但队首 age ≥10min ⇒ 触发（跨过冷却后）。
  h.setSnapshot("/p", wdSnapshot());
  h.service.tick();
  h.advance(10 * 60 * 1000);
  const old = h.nowMs() - 10 * 60 * 1000;
  h.setSnapshot("/p", wdSnapshot({ queues: [{ targetRoleId: "A", runtime: "demo", items: [item(old, "dA")] }] }));
  h.service.tick();
  assert.equal(h.delivered.length, 3, "冷却过后：队首 age ≥10min 触发（age 优先）");
});

test("G-2/W1 #3：命令超时（F-1 事实）单次即报；10min 冷却内抑制；无恢复行", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  h.service.observe("/p", { kind: "command-timed-out", roleId: "A", at: h.nowMs() });
  assert.equal(h.delivered.length, 1, "单次即报（低频高信号）");
  assert.ok(h.delivered[0].text.includes("命令超时"), "文案＝编排单一来源信号名");
  h.service.observe("/p", { kind: "command-timed-out", roleId: "A", at: h.nowMs() });
  assert.equal(h.delivered.length, 1, "冷却内的重复：只累计抑制");
  h.advance(11 * 60 * 1000);
  h.service.tick();
  h.service.tick();
  assert.equal(h.delivered.length, 1, "瞬时事件无「解除」可言——不投恢复行");
});

test("G-2/W1 #4：15min 窗口 failed/timed_out ≥3 才报；窗口滑出投恢复行；aborted/completed 不计", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "aborted", at: h.nowMs(), fromSystemDelivery: false });
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "failed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "timed_out", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick();
  assert.equal(h.delivered.length, 0, "2 次（aborted/completed 不计）不达阈值 3");
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "failed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick();
  assert.equal(h.delivered.length, 1, "3 次即报");
  assert.ok(h.delivered[0].text.includes("重复失败"), "信号名");
  h.advance(15 * 60 * 1000 + 1000);
  h.service.tick();
  assert.equal(h.delivered.filter((d) => d.text.includes("看护恢复")).length, 1, "窗口滑出（计数低于阈值）⇒ 恰一条恢复行");
  // （同 tick 可能另有一条收束提示——settled 已满足预热且此刻全静默：这是设计内行为，与本用例无关。）
});

test("G-2/W1 风暴护栏：15min 窗口 ≤5 条；超限投一条抑制通告（不占额度、每风暴期恰一条）＋诊断", () => {
  const h = makeWatchdogHarness();
  const now = h.nowMs();
  // 7 个角色同轮一起到 90% —— 第 6/7 条被风暴护栏抑制。
  h.setSnapshot("/p", wdSnapshot({ roles: "ABCDEFG".split("").map((r) => wdRole(r, { busy: true, turnStartedAt: now, turnId: `t-${r}` })) }));
  h.advance(110_000);
  h.service.tick();
  const alerts = h.delivered.filter((d) => d.text.includes("轮次逼近超时"));
  assert.equal(alerts.length, 5, "窗口内恰 5 条告警（上限）");
  assert.equal(h.delivered.length, 6, "第 6 条 = 风暴护栏抑制通告（不占额度）");
  assert.ok(h.delivered[5].text.includes("看护告警已抑制"), "通告文案＝编排单一来源");
  const stats = h.service.stats("/p");
  assert.equal(stats.suppressedTotal, 2, "被抑制 2 条（7 告警 − 5 额度）");
  assert.equal(stats.activeAlerts, 5, "统计：活跃且已投出告警 = 5");
  // 条件解除（角色全空闲）＋窗口滑出（额度恢复）⇒ 5 个投出过告警的活跃期各投一条恢复行；被抑制者不投。
  h.setSnapshot("/p", wdSnapshot({ roles: "ABCDEFG".split("").map((r) => wdRole(r)) }));
  h.advance(15 * 60 * 1000 + 1000);
  h.service.tick();
  const recoveries = h.delivered.filter((d) => d.text.includes("看护恢复"));
  assert.equal(recoveries.length, 5, "解除时恰 5 条恢复行（仅有告警投出过的活跃期；同样过风暴护栏）");
});

test("G-2/W1 看护器自身故障：快照抛错 ⇒ 只记诊断、不炸、不投递；下个 tick 自动恢复", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot());
  // 让 snapshot 抛错：用一个会抛的假快照函数替代。
  const failing = createWatchdogService({
    projects: () => ["/p"],
    snapshot: () => { throw new Error("替身：快照读取爆炸"); },
    deliver: () => { throw new Error("不该走到投递"); },
    now: () => h.nowMs(),
    config: { env: {} },
  });
  assert.doesNotThrow(() => failing.tick(), "看护器异常在 tick 内隔离（绝不上抛）——会话/投递不受影响");
  // 恢复正常快照后下个 tick 照常（看护暂停 ≠ 看护死亡）。
  const healed = makeWatchdogHarness();
  healed.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: healed.nowMs(), turnId: "t1" })] }));
  healed.advance(110_000);
  healed.service.tick();
  assert.equal(healed.delivered.length, 1, "下个 tick 重试即恢复工作");
});

test("G-2/W3 收束滞回：静默 ≥5min 恰一条；su 回复（system 投递持有的 settled）不重武装；真实活动重新武装", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  // 预热未满足（从未 settled）⇒ 静默再久也不触发。
  h.advance(30 * 60 * 1000);
  h.service.tick();
  assert.equal(h.delivered.length, 0, "预热：自导入以来至少一轮 settled（防空项目一进来就触发）");
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick(); // 静默起点 = 本 tick
  h.advance(5 * 60 * 1000 - 1000);
  h.service.tick();
  assert.equal(h.delivered.length, 0, "未满 N 不触发");
  h.advance(2000);
  h.service.tick();
  assert.equal(h.delivered.length, 1, "满 N 恰一条收束提示");
  assert.ok(h.delivered[0].text.startsWith("[系统·收束]"), "文首＝编排单一来源（U1 归类判据）");
  // su 对收束提示的那一轮回复：settled 由 system 投递持有 ⇒ **不算真实活动**（防骚扰回路）。
  h.service.observe("/p", { kind: "settled", roleId: "su", outcome: "completed", at: h.nowMs(), fromSystemDelivery: true });
  h.service.tick();
  h.advance(30 * 60 * 1000);
  h.service.tick();
  assert.equal(h.delivered.length, 1, "静默窗口内至多一条：su 的收束回复不重新武装（5 分钟后不再催）");
  // 真实活动（客户消息/派发等）⇒ 重新武装；随后再次静默满 N ⇒ 第二条。
  h.service.observe("/p", { kind: "activity", reason: "customer-send" });
  h.service.tick(); // 起点重记
  h.advance(5 * 60 * 1000 + 2000);
  h.service.tick();
  assert.equal(h.delivered.length, 2, "真实活动开启新静默窗口 ⇒ 新一条收束提示");
});

test("G-2/W3 静默谓词：任一非静默事实都拦（busy/队列/在途/待确认/链在跑）", () => {
  const cases: Partial<WatchdogProjectSnapshot>[] = [
    { roles: [wdRole("A", { busy: true, turnStartedAt: 0 })] },
    { queues: [{ targetRoleId: "A", runtime: "demo", items: [{ kind: "dispatch", dedupKey: "k", sourceRoleId: "su", summary: "s", enqueuedAtMs: 0 }] }] },
    { activeDeliveries: 1 },
    { pendingConfirmationsTotal: 1 },
    { chainsActive: true },
    { roles: [wdRole("su", { busy: true, turnStartedAt: 0 })] },
  ];
  for (const extra of cases) {
    const h = makeWatchdogHarness();
    h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
    h.setSnapshot("/p", wdSnapshot(extra));
    h.advance(30 * 60 * 1000);
    h.service.tick();
    assert.equal(h.delivered.filter((d) => d.text.includes("收束")).length, 0, `非静默事实拦下收束：${JSON.stringify(Object.keys(extra))}`);
  }
});

test("G-2/W3 投递端异常：收束投不出去 ⇒ 不标已投——下个 tick 重试成功后才恰一条", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot());
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick();
  h.advance(5 * 60 * 1000 + 2000);
  h.failNextDeliver();
  h.service.tick();
  assert.equal(h.delivered.length, 0, "投递端异常：未投出（不假装已投）");
  h.service.tick();
  assert.equal(h.delivered.filter((d) => d.text.includes("收束")).length, 1, "下个 tick 重试成功——恰一条");
  h.service.tick();
  assert.equal(h.delivered.filter((d) => d.text.includes("收束")).length, 1, "此后不重发");
});
