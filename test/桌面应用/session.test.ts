// test/桌面应用/session.test.ts
// 桌面窗口：会话管理器端到端单测——真实 openRoleSession + 真实 listProject + 真实多轮演示适配器。
// 验证（客户最终模型「导入项目即授权；点角色即开」）：open 直接建会话（无摘要/无 nonce）；
// 多轮 send 事件持续刷出；同角色重复点击续接（不重建）；**B-2（2026-10-12）：切换角色**不** dispose——
// 各自保活、切回续接（LRU 上限 MAX_LIVE_SESSIONS）**；事件带 `roleId` 信封（多会话不串）；越界被拒。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import type { SessionEvent } from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { RuntimeAdapter, OperatorChannelFn } from "../../src/provider/pi/session.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import { renderHandbackPrompt } from "../../src/common/编排/handback.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import { openRoleSession, createPiAdapterFactory, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { listProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createChatDemoAdapter, firstProjectFilePath } from "../../app/desktop/chat-adapter.ts";
import { SessionManager, MAX_LIVE_SESSIONS, type SessionEventEnvelope, type GovernanceClientProjectionV1 } from "../../app/desktop/session.ts";
import { createCustomerInputChannel } from "../../app/desktop/customer-input.ts";
import type { CustomerInputFn, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult } from "../../src/model/runtime.ts";
// W6-B（2026-10-18）：四角色能力矩阵与意图交接/澄清的桌面投递端。
import { buildIntentHandoffMessage } from "../../app/desktop/governance-advance.ts";
import { createMainI18n, mainT } from "../../app/desktop/i18n.ts";
import type { HandOffIntentPayload } from "../../src/model/runtime.ts";
import { appendGovernanceLedger, readGovernanceLedger } from "../../src/pipeline/orchestration/govern-session.ts";
// G-2（2026-10-16 客户批准）：看护器纯逻辑（W1 信号/去重/冷却/风暴护栏；W3 收束已于 2026-10-18 移除）
// ——**假快照＋注入时钟**，不起真实会话（集成面在 message-queue/dispatch-delivery 的 G-2 块）。
import {
  createWatchdogService,
  resolveWatchdogConfig,
  WATCHDOG_TICK_ENV,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
  type WatchdogService,
  type WatchdogServiceDeps,
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

test("open 旧缓存缺角色：强制刷新一次 listing 后找到即成功；仍缺则如实报错、不循环", async () => {
  const stale = fakeListing(["A"], "A");
  const fresh = fakeListing(["A", "convener"], "A");
  let current = stale;
  let refreshCalls = 0;
  const disposed: string[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => fakeQuietHandle(input.roleId, disposed),
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? current : undefined),
    refreshListing: async () => { refreshCalls += 1; current = fresh; },
    emitEvent: () => {},
  });
  const opened = await mgr.open({ projectRoot: "/proj", roleId: "convener", runtime: "demo" });
  assert.equal(opened.ok, true, opened.error ?? "");
  assert.equal(refreshCalls, 1, "旧缓存缺角色 ⇒ 刷新恰好一次");
  await mgr.stop(null);

  // 刷新后仍缺：如实报错，只刷新一次、不循环（同一查找路径也覆盖陈旧重建重开）。
  let missingRefreshCalls = 0;
  const mgr2 = new SessionManager({
    openRoleSession: async (input) => fakeQuietHandle(input.roleId, disposed),
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? stale : undefined),
    refreshListing: async () => { missingRefreshCalls += 1; },
    emitEvent: () => {},
  });
  const failed = await mgr2.open({ projectRoot: "/proj", roleId: "convener", runtime: "demo" });
  assert.equal(failed.ok, false);
  assert.match(failed.error ?? "", /未找到角色：convener/);
  assert.equal(missingRefreshCalls, 1, "只刷新一次、不循环");
  await mgr2.stop(null);
});

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
// 风暴护栏、watchdog.failed 隔离、滞回状态机（静默恰 30s 恰一条 / 两 tick 内不重复 / su 回复不重武装 /
// 真实活动重置 / 预热）。
// 文案是**编排单一来源**（common/编排/watchdog.ts）——本组只钉关键不变式（文首/计数/次数/ms 直传），
// 不逐字抄正文；收束 summary（本模块自持呈现面）按自适应时长逐字钉。
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

function makeWatchdogHarness(extra: Partial<WatchdogServiceDeps> = {}): WatchdogHarness {
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
    // 与生产默认同值（客户 2026-10-16 裁定：静默 30s＝一个 tick 的最小防抖）。
    // 2026-10-17 起检查时限默认改为 5 分钟（`resolveRuntimeTimeouts().promptTimeoutMs`）——本夹具**显式注入**
    // 120s 检查时限与 1 小时最后兜底，避免依赖默认值（阈值边界断言保持可读、稳定）。
    config: { env: {}, tickMs: 30 * 1000, promptTimeoutOverrideMs: 120_000, turnLastResortOverrideMs: 3_600_000 },
    ...extra,
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
    governanceRoleId: "su",
    roles: [],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map(),
    ...over,
  };
}

test("G-2 配置：tick 仅 env 可调（非法/缺失回退默认 30s）；阈值表取 §3.2 默认", () => {
  const defaults = resolveWatchdogConfig({});
  assert.equal(defaults.tickMs, 30000, "默认 tick 30s");
  assert.equal(defaults.turnDeadlineRatio, 1.0, "阈值 #1：到点检查（100% 检查时限，客户 2026-10-17 裁定）");
  assert.equal(defaults.queueHeadAgeMs, 10 * 60 * 1000, "阈值 #2：队首 age 10min");
  assert.equal(defaults.queueDepth, 5, "阈值 #2 辅判：深度 5");
  assert.equal(defaults.repeatFailCount, 3, "阈值 #4：15min ≥3");
  assert.equal("silenceMs" in defaults, false, "W3 收束已移除：配置不再含静默阈值");
  const overridden = resolveWatchdogConfig({ [WATCHDOG_TICK_ENV]: "5000" });
  assert.equal(overridden.tickMs, 5000, "env 覆盖 tick");
  assert.equal(resolveWatchdogConfig({ [WATCHDOG_TICK_ENV]: "0" }).tickMs, 30000, "非法值回退默认（不炸）");
});

test("G-2/W1 #1：轮次**到点检查**（demo 检查时限 120s → 120s 边界，只提示不中止）；每轮一次；正常完成自动解除", () => {
  const h = makeWatchdogHarness();
  const started = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: started, turnId: "t1" })] }));
  h.advance(119_999); // < 120s
  h.service.tick();
  assert.equal(h.delivered.length, 0, "未到检查时限不报（边界之下）");
  h.advance(1); // 恰 120s
  h.service.tick();
  assert.equal(h.delivered.length, 1, "到点即检查（含边界）");
  assert.ok(h.delivered[0].text.startsWith("[系统·看护]") && h.delivered[0].text.includes("轮次到点检查") && h.delivered[0].text.includes("A"), "文案＝编排单一来源（文首/信号/角色）");
  // 客户裁定 2026-10-17：到点**只提示、不中止本轮**——事实行给出核对/恢复指引与 1 小时最后兜底；
  // 不得再出现「逼近超时/已超时/硬超时/剩余约」等旧硬超时话术。
  assert.match(h.delivered[0].text, /看护检查时限 120000ms；到点仅检查/, "到点检查语义（100% 检查时限）");
  assert.ok(h.delivered[0].text.includes("显式配置的自动中止时限 2 分 0 秒"), "夹具显式覆盖时限时如实标注（默认禁用见专门用例）");
  assert.ok(h.delivered[0].text.includes("role_status / session_tail") && h.delivered[0].text.includes("仍在推进则不动作"), "核对指引：仍在推进不动作");
  assert.ok(h.delivered[0].text.includes("propose_recovery"), "卡死才 propose_recovery");
  assert.ok(h.delivered[0].text.includes("整轮最后兜底 1 小时"), "1 小时最后兜底说明");
  for (const forbidden of ["逼近", "已超时", "硬超时", "剩余约", "尚未超时", "系统未中止"]) {
    assert.equal(h.delivered[0].text.includes(forbidden), false, `不得出现旧话术「${forbidden}」`);
  }
  assert.ok(h.delivered[0].summary.includes("轮次到点检查"), "summary 用「轮次到点检查」");
  h.advance(30_000);
  h.service.tick();
  assert.equal(h.delivered.length, 1, "同一活跃期内重复命中只累计（不重复打扰）");
  // 该轮正常结束（settled, completed）⇒ 条件解除。**到点检查不是故障：不投「看护恢复」行**
  // （评审建议 2026-10-17——恢复行会让 su 误以为发生过一次超时/中止）。
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  h.service.tick();
  assert.equal(h.delivered.length, 1, "解除时不投「看护恢复」行（到点检查不是故障）");
  assert.equal(h.delivered.some((d) => d.text.includes("看护恢复")), false, "全程无「看护恢复」行");
  // 新一轮（新身份）⇒ 允许再次告警（「每轮一次」≠ 一生一次）。
  const restart = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: restart, turnId: "t2" })] }));
  h.advance(120_000);
  h.service.tick();
  assert.equal(h.delivered.length, 2, "新一轮到点再次告警（t2 独立去重身份；无恢复行插入）");
});

// ——————————————————————————————————————————————————————————————————————————————————————
// 2026-10-20 真机（Convener 卡 1h、24 条回交被 target-busy 堵住）：**回合自动中止**——
// 看护覆盖所有角色（含内置治理角色），**仅显式配置正时限**且开关开启时到点调用注入回调
// （同一 role+turnId 恰一次），并投 Lead 系统行（自动中止 ≠ 客户批准）。
// 2026-10-21 客户要求：默认不再自动中止（0/禁用），只到点提示；显式 env/测试覆盖才开启。
// ——————————————————————————————————————————————————————————————————————————————————————

test("2026-10-20 看护自动中止：内置 Convener 超时 + 开关开 ⇒ onTurnDeadline 恰一次（同一 role+turnId 去重）＋ Lead 系统行", () => {
  const calls: { root: string; roleId: string; runtime: string; turnId: string }[] = [];
  const h = makeWatchdogHarness({
    autoRecoveryEnabled: (_root, roleId) => roleId === "Convener",
    onTurnDeadline: (root, roleId, runtime, turnId) => { calls.push({ root, roleId, runtime, turnId }); },
  });
  const started = h.nowMs();
  // 内置治理角色（governanceRoleId 的会话）自身忙——旧告警会因「治理主人自身忙」抑制，但自动中止不受该排除。
  h.setSnapshot("/p", wdSnapshot({
    governanceRoleId: "Convener",
    roles: [wdRole("Convener", { busy: true, turnStartedAt: started, turnId: "ct1" })],
  }));
  h.advance(119_999);
  h.service.tick();
  assert.equal(calls.length, 0, "未到中止时限（120s）不触发");
  h.advance(1);
  h.service.tick();
  assert.equal(calls.length, 1, "到点 ⇒ onTurnDeadline 恰一次（内置治理角色不被 builtIn/governanceFunction 排除）");
  assert.deepEqual(calls[0], { root: "/p", roleId: "Convener", runtime: "demo", turnId: "ct1" }, "回调参数如实（projectRoot/roleId/runtime/turnId）");
  assert.ok(
    h.delivered.some((d) => d.text.startsWith("[系统·看护]") && d.text.includes("回合自动中止") && d.text.includes("自动中止 ≠ 客户批准")),
    "Lead 系统行：自动中止 ≠ 客户批准",
  );
  h.advance(60_000);
  h.service.tick();
  assert.equal(calls.length, 1, "同一 role+turnId 只触发一次（abort 生效前的后续 tick 不重复）");
});

test("2026-10-20 看护自动中止：开关关闭 ⇒ 不调用 onTurnDeadline（旧语义：只告警、1h 最后兜底，不中止）", () => {
  const calls: string[] = [];
  const h = makeWatchdogHarness({
    autoRecoveryEnabled: () => false,
    onTurnDeadline: (_root, roleId) => { calls.push(roleId); },
  });
  const started = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: started, turnId: "t1" })] }));
  h.advance(15 * 60 * 1000); // 远超检查/中止时限、仍低于 1h
  h.service.tick();
  assert.equal(calls.length, 0, "开关关 ⇒ 看护绝不中止");
  assert.ok(h.delivered.some((d) => d.text.includes("轮次到点检查")), "旧告警语义保留（到点检查只提示）");
  h.advance(60 * 60 * 1000);
  h.service.tick();
  assert.equal(calls.length, 0, "开关关：到 1h 也不由看护中止（旧语义由运行时最后兜底）");
});

test("2026-10-21 看护自动中止默认禁用：未配置时限 + 开关开 ⇒ 只到点提示，不调用 onTurnDeadline", () => {
  const calls: string[] = [];
  const h = makeWatchdogHarness({
    autoRecoveryEnabled: () => true,
    onTurnDeadline: (_root, roleId) => { calls.push(roleId); },
    config: { env: {}, tickMs: 30 * 1000, turnLastResortOverrideMs: 3_600_000 },
  });
  const started = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: started, turnId: "t-default" })] }));
  h.advance(15 * 60 * 1000); // 旧默认 15 分钟已过
  h.service.tick();
  assert.equal(calls.length, 0, "默认 0/禁用：开关开也不自动中止");
  const alert = h.delivered.find((d) => d.text.includes("轮次到点检查"))?.text || "";
  assert.ok(alert.includes("未配置看护自动中止"), "告警如实说明未配置自动中止");
  assert.ok(!alert.includes("15 分钟自动中止"), "不得声称 15 分钟自动中止");
  assert.ok(alert.includes("整轮最后兜底 1 小时（运行时硬上限，不是看护自动中止）"), "1 小时最后兜底保留并如实标注");
  h.advance(2 * 60 * 60 * 1000);
  h.service.tick();
  assert.equal(calls.length, 0, "即使超过 1 小时，看护也不自动中止（运行时最后兜底另算）");
});

test("2026-10-21 看护自动中止显式 env：ANS_PI_PROMPT_TIMEOUT_MS 配置时开关开 ⇒ 到点恰一次，开关关 ⇒ 只告警", () => {
  const calls: string[] = [];
  const h = makeWatchdogHarness({
    autoRecoveryEnabled: () => true,
    onTurnDeadline: (_root, roleId) => { calls.push(roleId); },
    config: { env: { ANS_PI_PROMPT_TIMEOUT_MS: "120000" }, tickMs: 30 * 1000, turnLastResortOverrideMs: 3_600_000 },
  });
  const started = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: started, turnId: "t-env" })] }));
  h.advance(119_999);
  h.service.tick();
  assert.equal(calls.length, 0, "未到显式时限不中止");
  h.advance(1);
  h.service.tick();
  assert.equal(calls.length, 1, "显式 env 时限到点 ⇒ onTurnDeadline 恰一次");
  assert.ok(h.delivered.some((d) => d.text.includes("回合自动中止") && d.text.includes("显式配置的自动中止时限")), "系统行注明显式配置");

  const offCalls: string[] = [];
  const off = makeWatchdogHarness({
    autoRecoveryEnabled: () => false,
    onTurnDeadline: (_root, roleId) => { offCalls.push(roleId); },
    config: { env: { ANS_PI_PROMPT_TIMEOUT_MS: "120000" }, tickMs: 30 * 1000, turnLastResortOverrideMs: 3_600_000 },
  });
  const offStarted = off.nowMs();
  off.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: offStarted, turnId: "t-env-off" })] }));
  off.advance(15 * 60 * 1000);
  off.service.tick();
  assert.equal(offCalls.length, 0, "开关关：即使显式配置也绝不自动中止（只告警）");
  assert.ok(off.delivered.some((d) => d.text.includes("轮次到点检查")), "只告警");
});

test("G-2/W1 「正确等待不报」：#1 对带挂起确认卡的角色排除；su 自身忙不触发任何告警", () => {
  const h = makeWatchdogHarness();
  let t = h.nowMs();
  // 角色 A 到点检查但带一张挂起确认卡 ⇒ 不报。
  h.setSnapshot("/p", wdSnapshot({
    roles: [wdRole("A", { busy: true, turnStartedAt: t, turnId: "t1" })],
    pendingConfirmationsTotal: 1,
    pendingConfirmationsByRole: new Map([["A", 1]]),
  }));
  h.advance(120_000);
  h.service.tick();
  assert.equal(h.delivered.length, 0, "挂起确认卡 = 正确等待（不计入 #1）");
  // 卡解除后到线 ⇒ 报。
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A", { busy: true, turnStartedAt: t, turnId: "t1" })] }));
  h.service.tick();
  assert.equal(h.delivered.length, 1, "卡解除后恢复检测");
  // su 自身忙：su 到点也不报；su 忙时对 su 的命令超时（#3 事件）也不报。
  t = h.nowMs();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("su", { busy: true, turnStartedAt: t, turnId: "st" })] }));
  h.advance(120_000);
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
  // 7 个角色同轮到点 —— 第 6/7 条被风暴护栏抑制。
  h.setSnapshot("/p", wdSnapshot({ roles: "ABCDEFG".split("").map((r) => wdRole(r, { busy: true, turnStartedAt: now, turnId: `t-${r}` })) }));
  h.advance(120_000);
  h.service.tick();
  const alerts = h.delivered.filter((d) => d.text.includes("轮次到点检查"));
  assert.equal(alerts.length, 5, "窗口内恰 5 条告警（上限）");
  assert.equal(h.delivered.length, 6, "第 6 条 = 风暴护栏抑制通告（不占额度）");
  assert.ok(h.delivered[5].text.includes("看护告警已抑制"), "通告文案＝编排单一来源");
  const stats = h.service.stats("/p");
  assert.equal(stats.suppressedTotal, 2, "被抑制 2 条（7 告警 − 5 额度）");
  assert.equal(stats.activeAlerts, 5, "统计：活跃且已投出告警 = 5");
  // 条件解除（角色全空闲）＋窗口滑出（额度恢复）⇒ **到点检查不投恢复行**（2026-10-17 评审建议）：
  // 恢复行会让 su 误以为发生过超时/中止；活跃期照常复位。
  h.setSnapshot("/p", wdSnapshot({ roles: "ABCDEFG".split("").map((r) => wdRole(r)) }));
  h.advance(15 * 60 * 1000 + 1000);
  h.service.tick();
  const recoveries = h.delivered.filter((d) => d.text.includes("看护恢复"));
  assert.equal(recoveries.length, 0, "turn-deadline 解除不投恢复行（到点检查不是故障）");
  assert.equal(h.service.stats("/p").activeAlerts, 0, "解除后活跃告警清零");
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
  healed.advance(120_000);
  healed.service.tick();
  assert.equal(healed.delivered.length, 1, "下个 tick 重试即恢复工作");
});

test("G-2/W3 已移除：完成静默不再投 `[系统·收束]`（验收通过即收束）", () => {
  const h = makeWatchdogHarness();
  h.setSnapshot("/p", wdSnapshot({ roles: [wdRole("A")] }));
  h.service.observe("/p", { kind: "settled", roleId: "A", outcome: "completed", at: h.nowMs(), fromSystemDelivery: false });
  // 各种「旧静默谓词成立」的形态（全空闲 / 队列空 / 无在途 / 无待确认 / 链停）——都不再产生收束消息。
  for (let i = 0; i < 5; i += 1) {
    h.advance(30 * 60 * 1000);
    h.service.tick();
  }
  assert.equal(h.delivered.some((d) => d.text.startsWith("[系统·收束]")), false, "不再投收束提示");
  assert.equal(h.delivered.length, 0, "完成静默态不产生任何看护消息（告警/恢复正常保留）");
});

// ———————————————— su 审批档（客户裁定 2026-10-17）：会话管理器注入判据 ————————————————

test("su 审批档注入：内置角色收到 shellOperatorOnly（(c) 实件 + (a) 通道），项目角色仍走三层链，su 不再用只读档", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "A",
        boundary: { entries: [], boundarySource: "角色卡/A/boundary.yaml", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const arming = { classifyShell: () => "allow" as const, rules: { version: "stub" } };
  const channel: OperatorChannelFn = async () => ({ outcome: "deny", operatorId: "test" });
  const seen: Record<string, unknown>[] = [];
  const makeHandle = (): RoleSessionHandle => ({
    async send() {},
    events() {
      return {
        [Symbol.asyncIterator]() {
          return { async next() { return { value: undefined as unknown as SessionEvent, done: true }; } };
        },
      };
    },
    async dispose() {},
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      seen.push(input as unknown as Record<string, unknown>);
      return makeHandle();
    },
    createPiAdapterFactory: () => () => ({}) as unknown as RuntimeAdapter,
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
    shellOperatorChannel: channel,
    shellArming: arming as never,
    loadEffectiveConfig: async (opts) => ({
      project: opts.fallback,
      source: {
        kind: "builtin-fallback" as const,
        path: "",
        acceptance: opts.fallback.governanceBoundary?.acceptance ?? { accepted: false, source: "" },
        pinPaths: [],
      },
    }),
  });
  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "pi" });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "pi" });
  const a = seen.find((input) => input.roleId === "A")!;
  const su = seen.find((input) => input.roleId === "su")!;
  // 项目角色：三层链逐字不变（(a)+(c)，无审批档）。
  assert.equal(typeof a.shellOperatorChannel, "function", "项目角色仍收 (a) 通道");
  assert.equal(a.shellArming, arming, "项目角色仍收 (c) 实件（原引用）");
  assert.ok(!("shellOperatorOnly" in a), "项目角色不走 su 审批档");
  assert.ok(!("shellReadonly" in a), "项目角色不带只读档");
  // su：审批档（(c)+(a) 同备）——不再直接收 shellOperatorChannel/shellArming/shellReadonly。
  assert.ok(!("shellOperatorChannel" in su), "su 不再直接收 shellOperatorChannel（(a) 在审批档内）");
  assert.ok(!("shellArming" in su), "su 不接三层链 (c) 字段");
  assert.ok(!("shellReadonly" in su), "su **不再**使用旧只读档");
  const only = su.shellOperatorOnly as { classifyShell?: unknown; rules?: unknown; operatorChannel?: unknown };
  assert.ok(only, "su 应收到 shellOperatorOnly");
  assert.equal(only.classifyShell, arming.classifyShell, "审批档 (c)：classifyShell 同一函数引用");
  assert.equal(only.rules, arming.rules, "审批档 (c)：rules 同一引用");
  assert.equal(typeof only.operatorChannel, "function", "审批档 (a)：operatorChannel 为绑定本会话的通道函数");
  assert.deepEqual(
    await (only.operatorChannel as OperatorChannelFn)({ command: "fixture", argv: ["fixture"], cwd: "/proj", toolCallId: "t1" }),
    { outcome: "deny", operatorId: "test" },
    "审批档 (a) 原样转交底层通道裁决",
  );
  await mgr.stop(null);
});

// ————— W6-B（2026-10-18）：四角色能力路由 / 意图交接后台投递 / 澄清送达 —————
//
// 契约：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
// §4.3（能力矩阵）、§5.3（后台投递）、§5.4（澄清送达）。本层只做投递端：校验/去重/账本在编排。

/** trio 四角色（或 single su）的假枚举；`primaryRoleId` 按模型由门禁引擎给出（trio=liaison）。 */
function governanceListing(opts: { model?: "trio" | "single"; roleIds?: string[] } = {}): ProjectListing {
  const model = opts.model ?? "trio";
  const defaultIds = model === "trio" ? ["liaison", "rapporteur", "nominator", "convener"] : ["su"];
  const ids = opts.roleIds ?? defaultIds;
  const functionOf = (id: string): ProjectListing["roles"][number]["governanceFunction"] => {
    if (model !== "trio") return undefined;
    if (id === "liaison") return "liaison";
    if (id === "rapporteur") return "proposal";
    if (id === "nominator") return "nomination";
    if (id === "convener") return "schedule";
    if (id === "verifier") return "verification";
    return undefined;
  };
  return {
    projectRoot: "/proj",
    roles: ids.map((id) => ({
      roleId: id,
      cardPath: "",
      boundaryPath: "",
      cardText: `# ${id}`,
      boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test:w6b" } },
      builtIn: model === "single" ? id === "su" : functionOf(id) !== undefined,
      ...(functionOf(id) !== undefined ? { governanceFunction: functionOf(id) } : {}),
    })),
    warnings: [],
    hasRoles: false,
    primaryRoleId: model === "trio" ? "liaison" : "su",
    governanceModel: model,
  };
}

type CapturedCapabilityInput = {
  roleId: string;
  customerInput?: unknown;
  handOffIntent?: unknown;
  requestClarification?: unknown;
  dispatchTask?: unknown;
  roleStatus?: unknown;
  sessionTail?: unknown;
  proposeRecovery?: unknown;
  installSkill?: unknown;
  installMcp?: unknown;
};

function makeCapabilityManager(
  listing: ProjectListing,
  captured: Map<string, CapturedCapabilityInput>,
): SessionManager {
  return new SessionManager({
    openRoleSession: async (input) => {
      captured.set(input.roleId, input as unknown as CapturedCapabilityInput);
      return fakeQuietHandle(input.roleId, []);
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
    customerInput: () => ({ outcome: "declined", reason: "替身：拒绝" }),
  });
}

test("W6-B 能力路由：liaison=handOffIntent+协调派发；rapporteur=提案+clarification；nominator=install；convener=dispatch/看护；single/su 不变", async () => {
  const captured = new Map<string, CapturedCapabilityInput>();
  const trio = governanceListing();
  const mgr = makeCapabilityManager(trio, captured);
  for (const roleId of ["liaison", "rapporteur", "nominator", "convener"]) {
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId, runtime: "demo" })).ok, true, `${roleId} 应可开启`);
  }
  const liaison = captured.get("liaison")!;
  assert.equal(typeof liaison.handOffIntent, "function", "Liaison 独享 hand_off_intent 投递端");
  assert.equal(liaison.requestClarification, undefined, "Liaison 无 request_clarification");
  assert.equal(typeof liaison.customerInput, "function", "Lead 注入客户通道（仅 intent-confirm 可用；其余卡由编排白名单拒绝）");
  assert.equal(typeof liaison.dispatchTask, "function", "Lead 是工作流管理者（2026-10-20 客户拍板）：可向 Steward 派协调消息");
  assert.equal(liaison.installSkill, undefined);
  assert.equal(liaison.roleStatus, undefined);

  const rapporteur = captured.get("rapporteur")!;
  assert.equal(typeof rapporteur.requestClarification, "function", "Rapporteur 独享 request_clarification 送达端");
  assert.equal(rapporteur.handOffIntent, undefined, "Rapporteur 无 hand_off_intent");
  assert.equal(typeof rapporteur.customerInput, "function", "Rapporteur 仍有客户确认/选择卡通道");

  const nominator = captured.get("nominator")!;
  assert.equal(typeof nominator.installSkill, "function");
  assert.equal(typeof nominator.installMcp, "function");
  assert.equal(nominator.requestClarification, undefined);
  assert.equal(nominator.handOffIntent, undefined);
  // 2026-10-22 第 1 项：Crew 写卡需 appointment-write 客户卡——customerInput 仍注入（能力不变、卡种由编排单点决定）。
  assert.equal(typeof nominator.customerInput, "function", "Crew 注入客户通道（appointment-write）");

  const convener = captured.get("convener")!;
  assert.equal(typeof convener.dispatchTask, "function");
  assert.equal(typeof convener.roleStatus, "function");
  assert.equal(typeof convener.sessionTail, "function");
  assert.equal(typeof convener.proposeRecovery, "function");
  assert.equal(convener.handOffIntent, undefined);
  assert.equal(convener.requestClarification, undefined);
  // 2026-10-22 第 1 项：Convener 发 appointment 卡（任命）——customerInput 仍注入。
  assert.equal(typeof convener.customerInput, "function", "Convener 注入客户通道（appointment/schedule-write）");
  // 回交主人仍是 Convener（Liaison 只作主入口/镜像面，不接管回交/看护/恢复）。
  assert.equal(
    mgr.watchdogSnapshot("/proj")?.governanceRoleId,
    "convener",
    "trio 回交主人=Convener（Liaison 不接管）",
  );
  await mgr.stop(null);

  // single/su：旧能力集逐字不变；新增两能力一律不注入（旧行为不多给工具）。
  const singleCaptured = new Map<string, CapturedCapabilityInput>();
  const single = governanceListing({ model: "single" });
  const singleMgr = makeCapabilityManager(single, singleCaptured);
  assert.equal((await singleMgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" })).ok, true);
  const su = singleCaptured.get("su")!;
  assert.equal(su.handOffIntent, undefined, "single/su 不获得 hand_off_intent");
  assert.equal(su.requestClarification, undefined, "single/su 不获得 request_clarification");
  assert.equal(typeof su.customerInput, "function", "su 旧客户通道不变");
  assert.equal(typeof su.dispatchTask, "function", "su 旧派发能力不变");
  assert.equal(typeof su.installSkill, "function", "su 旧安装能力不变");
  assert.equal(
    singleMgr.watchdogSnapshot("/proj")?.governanceRoleId,
    "su",
    "single 回交主人=primaryRoleId（su）",
  );
  await singleMgr.stop(null);
});

test("治理协调（session）：内置 settle→Lead；Proof 只发状态+报告指针；内置回交→Lead 且同轮 settle 不双发；worker 回交→Steward", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-session-governance-"));
  const base = governanceListing({ roleIds: ["liaison", "rapporteur", "nominator", "convener", "verifier", "A"] });
  const listing: ProjectListing = { ...base, projectRoot: root };
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const makeScriptedHandle = (roleId: string): RoleSessionHandle => {
    let index = 0;
    return {
      async send(text: string): Promise<void> {
        (sent[roleId] ??= []).push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let attempts = 0; attempts < 400; attempts += 1) {
                  const queue = streams[roleId] ?? [];
                  if (index < queue.length) return { value: queue[index++]!, done: false };
                  await new Promise((resolve) => setTimeout(resolve, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {},
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      streams[input.roleId] ??= [];
      sent[input.roleId] ??= [];
      return makeScriptedHandle(input.roleId);
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (value) => (value === root ? listing : undefined),
    emitEvent: () => {},
  });
  const waitUntil = async (check: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 400 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(check(), "等待实际事件超时");
  };
  try {
    // Proof 的报告指针来源：账本中该 flow 的 verifier 派发记录（无本轮 flowId 时的兜底）。
    await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "dispatch.accepted",
      flowId: "flow-proof",
      stepId: "verification",
      actorRoleId: "app",
      power: "app",
      targetRoleId: "verifier",
    });
    await mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
    await mgr.send("复核", undefined, { roleId: "verifier" });
    streams.verifier!.push({ kind: "message", summary: "报告正文-不得转述", turnId: "v1" } as OrchestrationEvent);
    streams.verifier!.push({ kind: "settled", summary: "verifier 一轮结束", detail: { outcome: "completed" } } as unknown as OrchestrationEvent);
    await waitUntil(() => (sent.liaison?.length ?? 0) > 0);
    const proofTask = sent.liaison![0]!;
    assert.match(proofTask, /^\[系统·治理反馈\] 来自 verifier 的验收状态/, "Proof 状态投 Lead");
    assert.match(proofTask, /状态：本轮已完成/, "只写状态，不转述报告正文");
    assert.ok(proofTask.includes("docs/acceptance/flow-proof-report-v1.md"), "报告路径指针");
    assert.ok(proofTask.includes("docs/governance/verifier/flow-proof.md"), "治理记录指针");
    assert.ok(!proofTask.includes("报告正文-不得转述"), "不转全文/不摘要替代报告");
    assert.ok(!/通过|不通过|已批准|客户同意/.test(proofTask), "不伪造验收结论/不冒充客户批准");
    // Lead 本轮收尾：放行后续投递（内置回交）——不 settled 会一直 busy，投递机按既有语义排队。
    streams.liaison!.push({ kind: "settled", summary: "liaison 一轮结束" } as OrchestrationEvent);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 内置来源回交（编排正常抑制；防御性出现）→ Lead；同一轮 settle 的治理反馈与它去重（不双发）。
    await mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await mgr.send("协调", undefined, { roleId: "convener" });
    const builtInHandback: TaskHandback = {
      roleId: "convener",
      taskId: "T-internal",
      status: "completed",
      summary: "内置回交",
      evidence: [],
      at: new Date().toISOString(),
    };
    streams.convener!.push({ kind: "handback", summary: "内置回交", handback: builtInHandback } as OrchestrationEvent);
    await waitUntil(() => sent.liaison!.includes(renderHandbackPrompt(builtInHandback)));
    const afterHandback = sent.liaison!.length;
    streams.convener!.push({ kind: "message", summary: "内部收尾正文", turnId: "c1" } as OrchestrationEvent);
    streams.convener!.push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(sent.liaison!.length, afterHandback, "同一轮内置回交与 settle 反馈不双发");
    assert.ok(!sent.liaison!.some((text) => text.startsWith("[系统·治理反馈] 来自 convener")), "不重复投递内置反馈");
    assert.ok(!sent.convener!.includes(renderHandbackPrompt(builtInHandback)), "内置来源不自我回交");

    // 项目 worker 回交 → Steward（handbackOwnerRoleId 语义不变）。
    await mgr.open({ projectRoot: root, roleId: "A", runtime: "demo" });
    const workerHandback: TaskHandback = { ...builtInHandback, roleId: "A", taskId: "T-worker" };
    streams.A!.push({ kind: "handback", summary: "A 完成", handback: workerHandback } as OrchestrationEvent);
    await waitUntil(() => sent.convener!.includes(renderHandbackPrompt(workerHandback)));
    assert.ok(!sent.liaison!.includes(renderHandbackPrompt(workerHandback)), "项目 worker 回交不投 Lead");
  } finally {
    await mgr.stop(null);
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 A3/A4 客户投影：治理反馈 prompt-input 附带结构化投影与稳定指纹；内部原文保留、未登记文本不变", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-session-projection-"));
  const base = governanceListing({ roleIds: ["liaison", "rapporteur", "nominator", "convener", "verifier", "A"] });
  const listing: ProjectListing = { ...base, projectRoot: root };
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const emitted: SessionEventEnvelope[] = [];
  const makeScriptedHandle = (roleId: string): RoleSessionHandle => {
    let index = 0;
    return {
      async send(text: string): Promise<void> {
        (sent[roleId] ??= []).push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let attempts = 0; attempts < 800; attempts += 1) {
                  const queue = streams[roleId] ?? [];
                  if (index < queue.length) return { value: queue[index++]!, done: false };
                  await new Promise((resolve) => setTimeout(resolve, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {},
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      streams[input.roleId] ??= [];
      sent[input.roleId] ??= [];
      return makeScriptedHandle(input.roleId);
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (value) => (value === root ? listing : undefined),
    emitEvent: (envelope) => emitted.push(envelope),
  });
  const waitUntil = async (check: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 800 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(check(), "等待实际事件超时");
  };
  /** 模拟运行时把程序化输入回显为 `prompt-input` 消息事件（与 provider/service 的真实形状一致）。 */
  const echo = (roleId: string, text: string, turnId: string): void => {
    streams[roleId]!.push({
      kind: "message",
      summary: `用户指令：${text}`,
      turnId,
      detail: { source: "prompt-input", text },
    } as unknown as OrchestrationEvent);
  };
  const detailFor = (text: string): Record<string, unknown> | undefined =>
    emitted
      .map((candidate) => (candidate.event as { detail?: unknown }).detail as Record<string, unknown> | undefined)
      .find((detail) => detail?.text === text);
  const projectionFor = (text: string): GovernanceClientProjectionV1 | undefined =>
    detailFor(text)?.clientProjection as GovernanceClientProjectionV1 | undefined;
  try {
    await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "dispatch.accepted",
      flowId: "flow-proof",
      stepId: "verification",
      actorRoleId: "app",
      power: "app",
      targetRoleId: "verifier",
    });
    // ① Proof completed：投影 = 报告已就绪；内部原文仍在 detail.text；重复回显同指纹。
    await mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
    await mgr.send("复核一", undefined, { roleId: "verifier" });
    streams.verifier!.push({ kind: "message", summary: "报告正文-不得转述", turnId: "v1" } as OrchestrationEvent);
    streams.verifier!.push({ kind: "settled", summary: "verifier 一轮结束", detail: { outcome: "completed" } } as unknown as OrchestrationEvent);
    await waitUntil(() => (sent.liaison?.length ?? 0) > 0);
    const proofTask = sent.liaison![0]!;
    echo("liaison", proofTask, "l1");
    await waitUntil(() => projectionFor(proofTask) !== undefined);
    const proofDetail = detailFor(proofTask)!;
    assert.equal(proofDetail.text, proofTask, "内部原文保留（审计）");
    const proofProjection = projectionFor(proofTask)!;
    assert.equal(proofProjection.version, 1);
    assert.equal(proofProjection.kind, "governance-feedback");
    assert.deepEqual(proofProjection.sourceRole, { roleId: "verifier", displayName: "verifier" });
    assert.equal(proofProjection.statusCode, "completed");
    assert.equal(proofProjection.statusText, "本轮已完成");
    assert.deepEqual(proofProjection.flowIds, ["flow-proof"]);
    assert.equal(proofProjection.reportPath, "docs/acceptance/flow-proof-report-v1.md");
    assert.equal(proofProjection.governancePath, "docs/governance/verifier/flow-proof.md");
    assert.equal(proofProjection.action, "report-ready");
    assert.match(proofProjection.fingerprint, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(proofProjection).includes("报告正文-不得转述"), "投影不含内部正文");
    echo("liaison", proofTask, "l1b");
    await waitUntil(
      () =>
        emitted.filter(
          (candidate) =>
            ((candidate.event as { detail?: { clientProjection?: { fingerprint?: string } } }).detail?.clientProjection?.fingerprint) ===
            proofProjection.fingerprint,
        ).length >= 2,
    );
    // 释放 Lead 队列，准备下一轮。
    streams.liaison!.push({ kind: "settled", summary: "liaison 一轮结束" } as OrchestrationEvent);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ② Proof failed：同流程不同状态 ⇒ 指纹不同；statusText 如实。
    await mgr.send("复核二", undefined, { roleId: "verifier" });
    streams.verifier!.push({ kind: "message", summary: "报告正文2", turnId: "v2" } as OrchestrationEvent);
    streams.verifier!.push({ kind: "settled", summary: "verifier 一轮结束", detail: { outcome: "failed" } } as unknown as OrchestrationEvent);
    await waitUntil(() => (sent.liaison?.length ?? 0) >= 2);
    const failedTask = sent.liaison![1]!;
    echo("liaison", failedTask, "l2");
    await waitUntil(() => projectionFor(failedTask) !== undefined);
    const failedProjection = projectionFor(failedTask)!;
    assert.equal(failedProjection.statusCode, "failed");
    assert.equal(failedProjection.statusText, "本轮失败");
    assert.notEqual(failedProjection.fingerprint, proofProjection.fingerprint, "状态变化 ⇒ 指纹变化");
    streams.liaison!.push({ kind: "settled", summary: "liaison 一轮结束" } as OrchestrationEvent);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ③ 非 Proof 内置内部反馈：只投影「等待 Lead 汇总」，无状态/报告路径；内部正文仅在 detail.text。
    await mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await mgr.send("协调", undefined, { roleId: "convener" });
    streams.convener!.push({ kind: "message", summary: "内部收尾正文", turnId: "c1" } as OrchestrationEvent);
    streams.convener!.push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
    await waitUntil(() => (sent.liaison?.length ?? 0) >= 3);
    const internalTask = sent.liaison![2]!;
    echo("liaison", internalTask, "l3");
    await waitUntil(() => projectionFor(internalTask) !== undefined);
    const internalDetail = detailFor(internalTask)!;
    const internalProjection = projectionFor(internalTask)!;
    assert.equal(internalProjection.statusCode, "internal-feedback");
    assert.equal(internalProjection.statusText, "内部反馈");
    assert.equal(internalProjection.action, "await-lead-summary");
    assert.equal(internalProjection.reportPath, undefined);
    assert.equal(internalProjection.governancePath, undefined);
    assert.equal(internalProjection.flowIds, undefined);
    assert.ok(String(internalDetail.text).includes("内部收尾正文"), "内部正文只保留在 detail.text（审计）");
    assert.ok(!JSON.stringify(internalProjection).includes("内部收尾正文"), "投影不含内部正文");

    // ④ 未登记的 prompt-input 文本 ⇒ 事件逐字不变（无 clientProjection）。
    streams.liaison!.push({
      kind: "message",
      summary: "用户指令：未登记",
      turnId: "l4",
      detail: { source: "prompt-input", text: "未登记" },
    } as unknown as OrchestrationEvent);
    await waitUntil(() => detailFor("未登记") !== undefined);
    assert.equal(Object.hasOwn(detailFor("未登记")!, "clientProjection"), false, "未登记文本不附加投影");
  } finally {
    await mgr.stop(null);
    rmSync(root, { recursive: true, force: true });
  }
});

test("Liaison 客户通道：intent-confirm 正常呈现/手答；proposal 被编排白名单拒绝且不弹卡", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-liaison-input-"));
  try {
    const project: ProjectConfig = {
      projectRoot: root,
      skillRoot: root,
      roles: {},
      governanceModel: "trio",
      builtInRoles: ["liaison", "rapporteur", "nominator", "convener", "verifier"],
      governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:liaison-input" } },
    };
    const waitFor = async (check: () => boolean): Promise<void> => {
      for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.ok(check(), "等待条件超时");
    };
    const run = async (args: Record<string, unknown>) => {
      const pushed: { id: string; request: { kind: string; title: string } }[] = [];
      const channel = createCustomerInputChannel({
        presenter: (payload) => pushed.push({ id: payload.id, request: payload.request }),
        operatorId: "tester",
        nextId: () => "op-1",
      });
      const events: OrchestrationEvent[] = [];
      // 桌面通道的 ctx 由会话提供；集成契约 `CustomerInputFn` 只有 (req, metadata)——桥接时固定 Lead 上下文。
      const customerInput: CustomerInputFn = (req) =>
        channel.customerInput(req, { roleId: "liaison", projectRoot: root, runtime: "demo" });
      const handle = await openRoleSession(
        { roleId: "liaison", project, taskId: "T-liaison-input", customerInput },
        {
          createAdapter: (gate, caps) =>
            createFakeRuntimeAdapter({
              gate,
              script: [{ name: "request_choice", args }],
              ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
            }),
        },
      );
      const consuming = (async () => { for await (const ev of handle.events()) events.push(ev); })();
      const sending = handle.send("发起需求确认");
      return { pushed, channel, events, sending, consuming, handle };
    };

    // ① intent-confirm：Lead 发卡 → 卡片正常呈现 → 客户手答 → 工具受理。
    const confirmed = await run({
      title: "确认需求",
      cardKind: "intent-confirm",
      flowId: "flow-a",
      options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }],
    });
    await waitFor(() => confirmed.pushed.length > 0);
    assert.equal(confirmed.pushed[0].request.kind, "choice", "intent-confirm 卡片正常呈现");
    assert.equal(confirmed.channel.respond({ id: confirmed.pushed[0].id, decision: { kind: "choice", selected: ["confirm"] } }).ok, true);
    await confirmed.sending;
    await confirmed.consuming;
    assert.ok(confirmed.events.some((ev) => ev.kind === "accepted" && /确认|confirm/.test(ev.summary)), "客户手答后工具受理");
    await confirmed.handle.dispose();

    // ② proposal：编排 `TRIO_CARD_KINDS.liaison` 只允许 intent-confirm——不弹卡、如实拒绝。
    const rejected = await run({
      title: "提案",
      cardKind: "proposal",
      flowId: "flow-a",
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    });
    await rejected.sending;
    await rejected.consuming;
    assert.equal(rejected.pushed.length, 0, "Liaison 发 proposal 不弹卡");
    assert.ok(
      rejected.events.some((ev) => /不允许 cardKind=proposal|未向客户发卡/.test(ev.summary)),
      "编排白名单结构性拒绝（如实原因）",
    );
    await rejected.handle.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("W6-B 意图交接：后台开 Rapporteur、当前 pane 不变、只投一条任务、系统行如实", async () => {
  const listing = governanceListing();
  const sendsByRole = new Map<string, string[]>();
  const openRoles: string[] = [];
  const events: SessionEventEnvelope[] = [];
  type HandOffFn = (
    payload: HandOffIntentPayload,
    metadata?: { turnId?: string },
  ) => Promise<{ ok: boolean; message?: string }>;
  let liaisonInput: { handOffIntent?: HandOffFn } | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openRoles.push(input.roleId);
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      if (input.roleId === "liaison") liaisonInput = input as unknown as { handOffIntent?: HandOffFn };
      return {
        async send(text: string): Promise<void> {
          sends.push(text);
        },
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
    emitEvent: (envelope) => { events.push(envelope); },
  });
  assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "liaison", runtime: "demo" })).ok, true);
  assert.equal(mgr.openForRoleId(), "liaison");
  assert.ok(liaisonInput?.handOffIntent, "Liaison 会话应拿到 handOffIntent 投递端");

  const payload: HandOffIntentPayload = {
    intentId: "intent-a",
    handoffKind: "initial",
    goal: "客户要一份提案",
    scope: "只读分析",
    acceptance: "客户接受提案",
    summary: "客户要提案流程",
    flowId: "flow-a",
  };
  const receipt = await liaisonInput!.handOffIntent!(payload, { turnId: "turn-1" });
  assert.equal(receipt.ok, true, "投递成功回执 ok:true（成功账本由编排在回执后写 intent.handed-off）");
  assert.deepEqual(openRoles, ["liaison", "rapporteur"], "只在后台打开 Rapporteur（不额外开会话）");
  assert.deepEqual(
    sendsByRole.get("rapporteur"),
    [buildIntentHandoffMessage(payload)],
    "恰好投递一条任务消息（读意图文件 + 提案卡 + 澄清指引 + summary）",
  );
  assert.equal(mgr.openForRoleId(), "liaison", "后台投递不抢 activeRoleId、不切当前 pane");

  const notes = events.filter(
    (envelope) =>
      envelope.roleId === "liaison" &&
      envelope.event.kind === "message" &&
      (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
  );
  assert.equal(notes.length, 1, "成功系统行恰一条，落 Liaison 聊天流");
  assert.equal(notes[0].event.summary, "已交给提案（工作中）");

  // 当前 pane 仍可正常对 Liaison 发言（活动角色没有被改）。
  await mgr.send("客户继续说话");
  await tick();
  assert.ok(sendsByRole.get("liaison")!.includes("客户继续说话"), "不切换 pane：客户消息仍落 Liaison");
  await mgr.stop(null);
});

test("W6-B 意图交接失败：不重试、只落失败系统行、当前 pane 不变", async () => {
  const listing = governanceListing();
  const events: SessionEventEnvelope[] = [];
  let rapporteurSendCalls = 0;
  type HandOffFn = (
    payload: HandOffIntentPayload,
    metadata?: { turnId?: string },
  ) => Promise<{ ok: boolean; message?: string }>;
  let liaisonInput: { handOffIntent?: HandOffFn } | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "liaison") liaisonInput = input as unknown as { handOffIntent?: HandOffFn };
      if (input.roleId === "rapporteur") {
        return {
          async send(): Promise<void> {
            rapporteurSendCalls += 1;
            throw new Error("运行时拒绝投递");
          },
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
        } as RoleSessionHandle;
      }
      return fakeQuietHandle(input.roleId, []);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (envelope) => { events.push(envelope); },
  });
  assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "liaison", runtime: "demo" })).ok, true);
  const payload: HandOffIntentPayload = {
    intentId: "intent-c",
    handoffKind: "initial",
    goal: "目标",
    scope: "范围",
    acceptance: "验收",
    summary: "摘要",
  };
  const receipt = await liaisonInput!.handOffIntent!(payload, { turnId: "turn-2" });
  assert.equal(receipt.ok, false, "投递失败如实回执（不假装成功）");
  assert.match(receipt.message ?? "", /发送任务给提案失败/);
  assert.equal(rapporteurSendCalls, 1, "失败不重试（恰好一次投递尝试）");
  const notes = events.filter(
    (envelope) =>
      envelope.roleId === "liaison" &&
      envelope.event.kind === "message" &&
      (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
  );
  assert.equal(notes.length, 1, "失败恰一条系统行（不循环重试）");
  assert.match(notes[0].event.summary ?? "", /应用无法把意图交给提案：.*；未重试/);
  assert.equal(mgr.openForRoleId(), "liaison", "失败不切 pane");
  await mgr.stop(null);
});

test("W6-B 澄清送达：主入口 Liaison 系统行；不弹决定卡（客户通道零调用）", async () => {
  const listing = governanceListing();
  const events: SessionEventEnvelope[] = [];
  let customerInputCalls = 0;
  type ClarifyFn = (payload: {
    flowId?: string;
    intentId?: string;
    question: string;
    summary?: string;
  }) => { ok: boolean; message?: string } | Promise<{ ok: boolean; message?: string }>;
  let rapporteurInput: { requestClarification?: ClarifyFn } | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "rapporteur") rapporteurInput = input as unknown as { requestClarification?: ClarifyFn };
      return fakeQuietHandle(input.roleId, []);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (envelope) => { events.push(envelope); },
    customerInput: () => {
      customerInputCalls += 1;
      return { outcome: "declined", reason: "替身：拒绝" };
    },
  });
  assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "rapporteur", runtime: "demo" })).ok, true);
  assert.ok(rapporteurInput?.requestClarification, "Rapporteur 应拿到 requestClarification 送达端");
  const receipt = await rapporteurInput!.requestClarification!({
    flowId: "flow-a",
    intentId: "intent-a",
    question: "验收标准是否包含离线场景？",
  });
  assert.equal(receipt.ok, true, "送达成功（账本由编排在回执后写 clarification.requested）");
  const notes = events.filter(
    (envelope) =>
      envelope.roleId === "liaison" &&
      envelope.event.kind === "message" &&
      (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
  );
  assert.equal(notes.length, 1, "系统行落主入口 Liaison");
  assert.equal(notes[0].event.summary, "提案需要澄清：验收标准是否包含离线场景？");
  assert.equal(customerInputCalls, 0, "澄清不弹客户决定卡、不占「一项目一卡」队列");
  await mgr.stop(null);
});

test("W6-B 交接审计：投递成功写 dispatch.accepted(app, trigger=intent-handoff)；失败不写、不重复写 intent.handed-off", async () => {
  type HandOffFn = (
    payload: HandOffIntentPayload,
    metadata?: { turnId?: string },
  ) => Promise<{ ok: boolean; message?: string }>;
  const payload: HandOffIntentPayload = {
    intentId: "intent-audit",
    handoffKind: "initial",
    goal: "客户要一份提案",
    scope: "只读分析",
    acceptance: "客户接受提案",
    summary: "客户要提案流程",
    flowId: "flow-a",
  };
  const runHandoff = async (root: string, failSend: boolean): Promise<{ ok: boolean }> => {
    const listing: ProjectListing = { ...governanceListing(), projectRoot: root };
    let liaisonInput: { handOffIntent?: HandOffFn } | undefined;
    const mgr = new SessionManager({
      openRoleSession: async (input) => {
        if (input.roleId === "liaison") liaisonInput = input as unknown as { handOffIntent?: HandOffFn };
        if (failSend && input.roleId === "rapporteur") {
          return {
            async send(): Promise<void> {
              throw new Error("运行时拒绝投递");
            },
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
          } as RoleSessionHandle;
        }
        return fakeQuietHandle(input.roleId, []);
      },
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
      buildProjectConfig,
      getListing: (r) => (r === listing.projectRoot ? listing : undefined),
      emitEvent: () => {},
    });
    assert.equal((await mgr.open({ projectRoot: root, roleId: "liaison", runtime: "demo" })).ok, true);
    assert.ok(liaisonInput?.handOffIntent);
    const receipt = await liaisonInput!.handOffIntent!(payload, { turnId: "turn-audit" });
    await mgr.stop(null);
    return receipt;
  };

  const okRoot = mkdtempSync(path.join(tmpdir(), "ans-handoff-ledger-ok-"));
  try {
    assert.equal((await runHandoff(okRoot, false)).ok, true);
    const ledger = await readGovernanceLedger(okRoot);
    const accepted = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
    assert.equal(accepted.length, 1, "成功投递恰写一条 dispatch.accepted");
    const entry = accepted[0];
    assert.equal(entry.actorRoleId, "app");
    assert.equal(entry.power, "app");
    assert.equal(entry.trigger, "intent-handoff");
    assert.equal(entry.targetRoleId, "rapporteur");
    assert.equal(entry.intentId, "intent-audit");
    assert.equal(entry.flowId, "flow-a");
    assert.equal(entry.messageSummary, "客户要提案流程");
    assert.equal(entry.customerDecision, undefined, "交接不是客户批准");
    assert.equal(
      ledger.entries.filter((e) => e.kind === "intent.handed-off").length,
      0,
      "intent.handed-off 由编排写；桌面不重复写",
    );
  } finally {
    rmSync(okRoot, { recursive: true, force: true });
  }

  const failRoot = mkdtempSync(path.join(tmpdir(), "ans-handoff-ledger-fail-"));
  try {
    assert.equal((await runHandoff(failRoot, true)).ok, false);
    const ledger = await readGovernanceLedger(failRoot);
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "dispatch.accepted").length,
      0,
      "投递失败不写 dispatch.accepted（不重试）",
    );
    assert.equal(ledger.entries.filter((entry) => entry.kind === "intent.handed-off").length, 0);
  } finally {
    rmSync(failRoot, { recursive: true, force: true });
  }
});

// —————————————— i18n B3（2026-10-23）：SessionManager 生成点 en-US 断言（zh-CN 默认逐字不变） ——————————————
test("i18n B3 session：未开会话的 send 回执按 en-US 生成；切回 zh-CN 逐字不变", async () => {
  const listing = await listProject(REPO_ROOT);
  const mgr = makeManager(listing, []);
  createMainI18n("en-US");
  try {
    const en = await mgr.send("hi", undefined, { projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
    assert.equal(en.ok, false);
    assert.equal(en.error, "The session is not started (click the role on the left to start it).");
    // 2026-10-23 PM 补 key：session 用户可见接线点 en。
    assert.equal(mainT("main.session.releaseNoSession", { roleId: "A" }), "Role A has no open session.");
    assert.equal(mainT("main.session.rebuildChangedRuntimeConfig"), "runtime configuration");
    assert.equal(mainT("main.session.install.verbInstall"), "install");
    assert.equal(
      mainT("main.session.delivery.receivedDispatch", { role: "Crew" }),
      "Received a dispatched task from Crew — follow the task text and hand back a report when done.",
    );
    assert.equal(
      mainT("main.session.delivery.handbackFailedShort", { sourceRoleId: "A", detail: "x" }),
      "Delivery failed (from A): x",
    );
    assert.equal(mainT("main.session.dispatchModelNote"), " (trio: Steward or Lead)");
    createMainI18n("zh-CN");
    assert.equal(mainT("main.session.releaseNoSession", { roleId: "A" }), "角色 A 没有打开的会话。");
    assert.equal(mainT("main.session.dispatchModelNote"), "（trio：统筹或主理）");
    assert.equal(
      mainT("main.session.delivery.handbackFailedShort", { sourceRoleId: "A", detail: "x" }),
      "交付投递失败（来自 A）：x",
    );
    createMainI18n("zh-CN");
    const zh = await mgr.send("hi", undefined, { projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
    assert.equal(zh.ok, false);
    assert.equal(zh.error, "会话尚未开启（点击左侧角色即可开启）。");
  } finally {
    createMainI18n("zh-CN");
  }
});

// —————————————— 会话级后台任务聚合（2026-10-25，桌面任务面板 B） ——————————————
// 契约：任务表/日志只在各会话内存；桌面只按 projectRoot+runtime 聚合与精确寻址，**不缓存、不持久化、不伪造**。
function fakeTaskSnapshot(over: Partial<BackgroundTaskSnapshot> & Pick<BackgroundTaskSnapshot, "taskId">): BackgroundTaskSnapshot {
  return {
    state: "running",
    command: "npm run dev",
    startedAt: "2026-10-25T00:00:00.000Z",
    durationMs: 1234,
    ...over,
  };
}

test("后台任务聚合：按项目×引擎聚合多角色、跳过无能力句柄、unavailable 区分「没有任务」与「不支持」", async () => {
  const listing = fakeListing(["A", "B", "C"], "A");
  const disposed: string[] = [];
  const snapA = fakeTaskSnapshot({ taskId: "bg-a", pid: 42 });
  let tasksA: BackgroundTaskSnapshot[] = [snapA];
  const handles: Record<string, RoleSessionHandle> = {
    // A：具备能力且有任务；B：具备能力但当前为空；C：句柄无 list 能力（必须跳过）。
    A: { ...fakeQuietHandle("A", disposed), listBackgroundTasks: () => tasksA },
    B: { ...fakeQuietHandle("B", disposed), listBackgroundTasks: () => [] },
    C: fakeQuietHandle("C", disposed),
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => handles[input.roleId]!,
    createPiAdapterFactory,
    createDemoAdapter: createChatDemoAdapter,
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
  });
  try {
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" })).ok, true);
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "C", runtime: "pi" })).ok, true);

    const demo = mgr.listBackgroundTasks("/proj", "demo");
    assert.ok(demo.ok);
    assert.deepEqual(demo.tasks, [{ ...snapA, roleId: "A", runtime: "demo" }], "只聚合具备能力会话的任务，并带角色/引擎");
    assert.equal(demo.unavailable, false, "B 具备能力但当前无任务 ⇒ 仍为 available（不是「不支持」）");

    // 直接读句柄、不缓存：句柄下真实数组变化立即反映。
    tasksA = [];
    const again = mgr.listBackgroundTasks("/proj", "demo");
    assert.ok(again.ok);
    assert.deepEqual(again.tasks, [], "聚合不缓存跨调用");

    // 不同引擎互不混入；C 无能力 ⇒ 空列表 + unavailable:true。
    const pi = mgr.listBackgroundTasks("/proj", "pi");
    assert.ok(pi.ok);
    assert.deepEqual(pi.tasks, [], "不得把 demo 任务混入 pi");
    assert.equal(pi.unavailable, true, "C 的句柄没有 listBackgroundTasks ⇒ 该引擎 unavailable");

    // 完全没有会话的引擎同样 unavailable（「没有任务」不可与「不支持」混淆）。
    const none = mgr.listBackgroundTasks("/proj", "codex");
    assert.ok(none.ok);
    assert.deepEqual(none.tasks, []);
    assert.equal(none.unavailable, true);
  } finally {
    await mgr.stop(null);
  }
});

test("后台任务读/停：read 透传选项与未知任务失败；stop 原样返回底层失败且不改写为成功", async () => {
  const listing = fakeListing(["A", "B", "C"], "A");
  const disposed: string[] = [];
  const task = fakeTaskSnapshot({ taskId: "bg-1" });
  const readResult: BackgroundTaskReadResult = {
    task,
    tailLines: 5,
    tailClamped: false,
    stdout: { text: "line-1\nline-2", truncated: false },
  };
  const stopFailure: BackgroundTaskStopResult = { ok: false, reason: "unknown-task", message: "未知任务「bg-404」" };
  const stopSuccess: BackgroundTaskStopResult = { ok: true, task, alreadyEnded: false };
  const capturedReads: { taskId: string; options?: BackgroundTaskReadOptions }[] = [];
  const capturedStops: { taskId: string; options?: BackgroundTaskStopOptions }[] = [];
  const handleA: RoleSessionHandle = {
    ...fakeQuietHandle("A", disposed),
    readBackgroundTask: (taskId, options) => {
      capturedReads.push({ taskId, ...(options !== undefined ? { options } : {}) });
      return taskId === task.taskId ? readResult : undefined;
    },
    stopBackgroundTask: async (taskId, options) => {
      capturedStops.push({ taskId, ...(options !== undefined ? { options } : {}) });
      if (taskId === "bg-boom") throw new Error("boom");
      return taskId === task.taskId ? stopSuccess : stopFailure;
    },
  };
  const handles: Record<string, RoleSessionHandle> = {
    A: handleA,
    B: fakeQuietHandle("B", disposed), // 无 read/stop 能力
    C: fakeQuietHandle("C", disposed),
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => handles[input.roleId]!,
    createPiAdapterFactory,
    createDemoAdapter: createChatDemoAdapter,
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
  });
  try {
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" })).ok, true);
    assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "C", runtime: "pi" })).ok, true);

    // read：选项透传，底层结果同一引用。
    const read = mgr.readBackgroundTask({
      projectRoot: "/proj",
      runtime: "demo",
      roleId: "A",
      taskId: task.taskId,
      stream: "stdout",
      tailLines: 5,
    });
    assert.ok(read.ok);
    assert.equal(read.result, readResult, "read 结果原样透传（同一引用）");
    assert.deepEqual(capturedReads[0], { taskId: task.taskId, options: { stream: "stdout", tailLines: 5 } });

    // 未给 stream/tailLines ⇒ options 参数缺席（保持底层默认 both/40）。
    mgr.readBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: task.taskId });
    assert.equal("options" in capturedReads[1]!, false, "无选项时不得伪造 options");

    // 未知任务：底层 undefined ⇒ 如实失败。
    const unknownRead = mgr.readBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: "bg-404" });
    assert.equal(unknownRead.ok, false);
    if (!unknownRead.ok) assert.equal(unknownRead.error, mainT("main.backgroundTasks.unavailable"));

    // 找不到会话（C 只在 pi 打开，demo 无此三元身份）。
    const missingRead = mgr.readBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "C", taskId: "bg-1" });
    assert.equal(missingRead.ok, false);
    if (!missingRead.ok) assert.equal(missingRead.error, mainT("main.session.releaseNoSession", { roleId: "C" }));

    // 句柄无能力（B 没有 readBackgroundTask）。
    const noCapRead = mgr.readBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "B", taskId: "bg-1" });
    assert.equal(noCapRead.ok, false);
    if (!noCapRead.ok) assert.equal(noCapRead.error, mainT("main.backgroundTasks.unavailable"));

    // stop：成功/失败结果原样返回，绝不改写为成功。
    const stopOk = await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: task.taskId });
    assert.equal(stopOk, stopSuccess, "ok:true 原样透传（同一引用）");
    const stopUnknown = await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: "bg-404" });
    assert.equal(stopUnknown, stopFailure, "unknown-task 原样返回（同一引用）");
    assert.equal(stopUnknown.ok, false, "失败不得改写成成功");

    // force 透传；false/缺席不伪造。
    await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: task.taskId, force: true });
    assert.deepEqual(capturedStops[2], { taskId: task.taskId, options: { force: true } });

    // 底层抛错：如实失败并带原始消息（不吞异常、不假装已停止）。
    const stopThrown = await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "A", taskId: "bg-boom" });
    assert.equal(stopThrown.ok, false);
    if (!stopThrown.ok) {
      assert.equal(stopThrown.reason, "unavailable");
      assert.equal(stopThrown.message, "boom");
    }

    // 找不到会话 ⇒ closed；句柄无能力 ⇒ unavailable。
    const stopMissing = await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "C", taskId: "bg-1" });
    assert.deepEqual(stopMissing, {
      ok: false,
      reason: "closed",
      message: mainT("main.session.releaseNoSession", { roleId: "C" }),
    });
    const stopNoCap = await mgr.stopBackgroundTask({ projectRoot: "/proj", runtime: "demo", roleId: "B", taskId: "bg-1" });
    assert.deepEqual(stopNoCap, {
      ok: false,
      reason: "unavailable",
      message: mainT("main.backgroundTasks.unavailable"),
    });
  } finally {
    await mgr.stop(null);
  }
});
