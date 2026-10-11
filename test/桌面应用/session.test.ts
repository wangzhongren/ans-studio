// test/桌面应用/session.test.ts
// 桌面应用：会话管理器端到端单测——真实 openRoleSession + 真实 listProject + 真实多轮演示适配器。
// 验证（客户最终模型「导入项目即授权；点角色即开」）：open 直接建会话（无摘要/无 nonce）；
// 多轮 send 事件持续刷出；同角色重复点击续接（不重建）；切换角色先 dispose 旧会话；越界被拒。

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
import { SessionManager } from "../../app/desktop/session.ts";

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
    emitEvent: (ev) => events.push(ev),
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
    emitEvent: (ev) => events.push(ev),
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

test("切换角色：先 dispose 旧会话再开新会话（注入假编排验证语义）", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "角色 A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
      {
        roleId: "B",
        cardPath: "角色卡/B/role-card.md",
        boundaryPath: "角色卡/B/boundary.yaml",
        cardText: "角色 B",
        boundary: {
          entries: [{ root: "project", path: "src/b.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/B/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "A",
  };
  const disposed: string[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      const id = input.roleId;
      const handle: RoleSessionHandle = {
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
          disposed.push(id);
        },
      };
      return handle;
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
  assert.equal(mgr.openForRoleId(), "A");
  const r2 = await mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  assert.equal(r2.ok, true);
  assert.deepEqual(disposed, ["A"], "切换角色应先 dispose 旧会话");
  assert.equal(mgr.openForRoleId(), "B");

  const stop = await mgr.stop();
  assert.equal(stop.ok, true);
  assert.deepEqual(disposed, ["A", "B"], "stop 应 dispose 当前会话");
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
    emitEvent: (ev) => events.push(ev),
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
