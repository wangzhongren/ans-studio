// test/桌面应用/session.test.ts
// 桌面应用：会话管理器端到端单测——真实 openRoleSession + 真实 listProject + 真实多轮演示适配器。
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function makeManager(listing: ProjectListing, events: OrchestrationEvent[]): SessionManager {
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
  const role = listing.roles.find((r) => r.roleId === "桌面应用")!;
  assert.equal(firstProjectFilePath(role.boundary), "角色卡/桌面应用/feature-map.md");
});

test("点角色即开：open 直接建会话（无摘要/nonce），多轮 send、越界被拒且含按根分组", async () => {
  const listing = await listProject(REPO_ROOT);
  const events: OrchestrationEvent[] = [];
  const mgr = makeManager(listing, events);

  const res = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "demo" });
  assert.equal(res.ok, true, "点角色应直接开启会话（无确认步骤）");
  await tick();

  // 开启即有提示事件；此时尚无任何写入
  assert.ok(events.some((e) => e.kind === "message" && e.summary.includes("已开启")), "应有会话开启提示");
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
  const events: OrchestrationEvent[] = [];
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

  const r1 = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "demo" });
  assert.equal(r1.ok, true);
  await tick();
  const r2 = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "demo" });
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
  const r = await mgr.open({ projectRoot: "D:/never-listed", roleId: "桌面应用", runtime: "demo" });
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

  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "demo" });
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
  const events: OrchestrationEvent[] = [];
  const handback: TaskHandback = {
    roleId: "桌面应用",
    taskId: "T20",
    status: "completed",
    summary: "完成边界内改动",
    evidence: ["角色卡/桌面应用/feature-map.md"],
    at: "2026-10-11T00:00:00.000Z",
  };
  // 假句柄：事件流产出编排的 `OrchestrationEvent`（settled 之前带一条 handback，与 withHandback 同序）。
  const mgr = new SessionManager({
    openRoleSession: async () => {
      const seq: OrchestrationEvent[] = [
        { kind: "settled", summary: "会话结束" },
        { kind: "handback", summary: `回交 su：${handback.summary}`, handback },
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

  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "demo" });
  assert.equal(r.ok, true);
  await tick();

  const hb = events.find((e) => e.kind === "handback");
  assert.ok(hb, "handback 事件应经 emitEvent 外推（emitEvent 已放宽到 OrchestrationEvent）");
  const payload = (hb as Extract<OrchestrationEvent, { kind: "handback" }>).handback;
  assert.equal(payload.roleId, "桌面应用", "回交应携带产出角色 id");
  assert.equal(payload.status, "completed", "回交应携带结论（completed/blocked）");
  assert.equal(payload.taskId, "T20", "回交应携带任务 id");
  assert.deepEqual(payload.evidence, ["角色卡/桌面应用/feature-map.md"], "回交只搬证据（产物路径）");
  await mgr.stop();
});
