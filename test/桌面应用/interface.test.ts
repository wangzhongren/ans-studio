// test/桌面应用/interface.test.ts
// 桌面窗口 Interface 层单测：注入假下游，验证枚举→RoleView 映射、点角色即开（scope undefined、
// 导入即授权的 acceptance）、多轮 send 透传与切换角色的 dispose 语义。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import type { RuntimeAdapter, SessionEvent, WriteGate, CustomerInputFn } from "../../src/provider/pi/session.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FAKE_LISTING: ProjectListing = {
  projectRoot: "/proj",
  roles: [
    {
      roleId: "A",
      cardPath: "角色卡/A/role-card.md",
      boundaryPath: "角色卡/A/boundary.yaml",
      cardText: "# 角色 A",
      boundary: {
        entries: [
          { root: "project", path: "src/a.ts", kind: "file", purpose: "p" },
          { root: "project", path: "src/dir", kind: "directory", purpose: "d" },
        ],
        boundarySource: "角色卡/A/boundary.yaml",
        acceptance: { accepted: false, source: "" },
      },
    },
  ],
  warnings: ["某角色边界解析失败：坏 YAML"],
  hasRoles: true,
  primaryRoleId: "A",
};

function makeFakeHandle(): {
  handle: RoleSessionHandle;
  sends: string[];
  disposed: () => number;
  /** 推一条 `settled`（模拟一轮结束）并等消费循环处理完（忙态复位、队列放行）。 */
  settle: () => Promise<void>;
} {
  const sends: string[] = [];
  let disposed = 0;
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> { sends.push(text); },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              // 轮询窗口 ~1s：够本用例的几次 send/settle 往返；之后流自然结束（消费循环退出，无泄漏）。
              for (let i = 0; i < 200; i += 1) {
                if (queue.length > 0) return { value: queue.shift() as SessionEvent, done: false };
                await new Promise((r) => setTimeout(r, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> { disposed += 1; },
  };
  const settle = async (): Promise<void> => {
    queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent);
    await new Promise((r) => setTimeout(r, 60)); // 等消费循环：忙态复位 + 队列放行
  };
  return { handle, sends, disposed: () => disposed, settle };
}

test("listProject 映射为 RoleView（无 writeSet 字段）", async () => {
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
  });
  const res = await iface.listProject({ projectRoot: "/proj" });
  assert.equal(res.roles.length, 1);
  assert.equal(res.roles[0].roleId, "A");
  assert.equal(res.roles[0].cardPath, "角色卡/A/role-card.md");
  assert.equal(res.roles[0].boundary.entries.length, 2);
  assert.equal((res.roles[0] as unknown as { suggestedWriteSet?: unknown }).suggestedWriteSet, undefined, "writeSet 已从界面层移除");
  assert.deepEqual(res.warnings, ["某角色边界解析失败：坏 YAML"]);
});

test("内置角色 su：RoleView 标为 builtIn，且不去读文档索引（cardPath 为空串）", async () => {
  // projectRoot 用真实仓库根：若守卫失效、真去 walk 索引，docs 一定非空。
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: {
          entries: [{ root: "skill", path: "SKILL.md", kind: "file", purpose: "治理规则" }],
          boundarySource: "<built-in:ans-governed-construction SKILL boundary>",
          acceptance: { accepted: false, source: "" },
        },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal(res.roles.length, 1);
  assert.equal(res.roles[0].roleId, "su");
  assert.equal(res.roles[0].builtIn, true);
  assert.equal(res.roles[0].changelog, null, "内置角色无 changelog");
  assert.deepEqual(res.roles[0].docs, [], "不得把项目根当角色目录去 walk");
});

test("openSession 点角色即开：scope undefined、导入即授权；多轮 send 透传、stop 收口", async () => {
  const { handle, sends, disposed, settle } = makeFakeHandle();
  let captured: { roleId: string; project: ProjectConfig; scope?: unknown } | undefined;

  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async (input): Promise<RoleSessionHandle> => {
      captured = input as typeof captured;
      return handle;
    },
    createDemoAdapterFn: (_opts: { gate: WriteGate }) => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
  });

  assert.equal(await iface.pickProject(), "/proj");

  await iface.listProject({ projectRoot: "/proj" });
  const open = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(open.ok, true, "点角色应直接开启会话（无确认步骤）");
  assert.ok(captured, "应调用 openRoleSession");
  assert.equal(captured!.roleId, "A");
  assert.equal(captured!.scope, undefined, "聊天会话 scope 应为 undefined（无任务收窄）");
  assert.equal(captured!.project.governanceBoundary?.acceptance.accepted, true, "导入项目即授权");
  assert.ok(
    (captured!.project.governanceBoundary?.acceptance.source || "").includes("desktop-app"),
    "acceptance 来源应如实标注",
  );

  // 多轮 send（L-1 起）：一轮在跑时 send 会**入队**（见 message-queue.test.ts）——替身先推一条 settled
  // 模拟第一轮结束（忙态复位），下一轮直发；「多轮透传」意图不变。
  assert.equal((await iface.sendSession({ text: "一" })).ok, true);
  await settle();
  assert.equal((await iface.sendSession({ text: "二" })).ok, true);
  assert.deepEqual(sends, ["一", "二"]);

  // 同角色重复 open：续接（不重建，openRoleSession 不应被再次调用）
  const again = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(again.ok, true);
  assert.ok(again.note, "续接应附说明");
  assert.deepEqual(sends, ["一", "二"]);

  const stop = await iface.stopSession();
  assert.equal(stop.ok, true);
  assert.equal(disposed(), 1);
});

test("切换角色（B-2）：open 新角色**不** dispose 旧会话（并存）；定向 stop 只关指定角色", async () => {
  const disposed: string[] = [];
  let created = 0;
  function makeHandle(): RoleSessionHandle {
    const id = String(created);
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
        disposed.push(id);
      },
    };
  }
  const listingB: ProjectListing = {
    ...FAKE_LISTING,
    roles: [
      ...FAKE_LISTING.roles,
      {
        roleId: "B",
        cardPath: "角色卡/B/role-card.md",
        boundaryPath: "角色卡/B/boundary.yaml",
        cardText: "# 角色 B",
        boundary: {
          entries: [{ root: "project", path: "src/b.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/B/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listingB,
    openRoleSessionFn: async (): Promise<RoleSessionHandle> => {
      created += 1;
      return makeHandle();
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });

  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "B", runtime: "demo" })).ok, true);
  assert.deepEqual(disposed, [], "B-2：切换角色**不得** dispose 旧会话（并存保活）");
  assert.deepEqual(await iface.listLiveSessions(), ["A", "B"], "两角色都应保活（状态徽标/圆点的数据源）");
  const stop = await iface.stopSession({ roleId: "A" });
  assert.equal(stop.ok, true);
  assert.deepEqual(disposed, ["1"], "定向 stop 只 dispose 指定角色（计数从 1 起）");
  assert.deepEqual(await iface.listLiveSessions(), ["B"], "B 不受定向 stop 影响");
});

test("stopSession：无运行中会话时如实返回", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING });
  const r = await iface.stopSession();
  assert.equal(r.ok, false);
});

test("openSession：未先枚举项目则报错", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING });
  const r = await iface.openSession({ projectRoot: "/never-listed", roleId: "A", runtime: "demo" });
  assert.equal(r.ok, false);
  assert.match(r.error || "", /尚未枚举/);
});

// —————— 「只读」徽标已按客户裁定移除：RoleView/界面**不得**再有 readOnly（守卫「它不该出现」）——————
// 客户 2026-10-11 裁定：回到「导入项目 = 授权；门禁静默执行、拒绝在聊天流内联；用户对边界无感」的原模型。
// 「只读」徽标偏离了这条（把边界机制提前摊给用户看），故移除 `isReadOnlyRole` / `RoleView.readOnly` 及其派生。
// 以下是**原只读场景**的反向守卫：任何角色（内置 su、创世态、可写项目角色）都不再带 readOnly 字段。

test("listProject：内置 su（已 bootstrap）不再带 readOnly 字段（只读徽标已移除）", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:ans-governed-construction SKILL boundary>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "某内置已接受角色",
        cardPath: "",
        boundaryPath: "",
        cardText: "# x",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: true, source: "客户 pin" } },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  for (const r of res.roles) {
    assert.equal("readOnly" in r, false, `角色 ${r.roleId} 不应再有 readOnly 字段（只读徽标已移除）`);
  }
});

test("listProject：**未 bootstrap**（创世态）内置 su 亦不再带 readOnly 字段", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:ans-governed-construction SKILL boundary>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: ["项目根下无角色目录"],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal("readOnly" in res.roles[0], false, "创世态 su 亦不应再有 readOnly 字段（只读徽标已移除）");
});

test("listProject：可写的项目角色（非内置）亦不再带 readOnly 字段", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "项目角色",
        cardPath: "角色卡/P/role-card.md",
        boundaryPath: "角色卡/P/boundary.yaml",
        cardText: "# 角色 P",
        boundary: { entries: [], boundarySource: "角色卡/P/boundary.yaml", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal("readOnly" in res.roles[0], false, "项目角色不应再有 readOnly 字段（只读徽标已移除）");
});

// —————— T17：su 主位（primaryRoleId / hasRoles 透传）与刷新信号 ——————

test("T17 listProject：hasRoles 与 primaryRoleId 原样转自门禁引擎（渲染侧据此设主位/默认选中，不硬编码 su）", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: ["项目根下无角色目录"],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  // 原样转达（界面不重判——单一来源仍是门禁引擎）。
  assert.equal(res.hasRoles, false, "hasRoles 应原样转达（供「尚未 bootstrap」判断）");
  assert.equal(res.primaryRoleId, "su", "primaryRoleId 应原样转达（供主位/默认选中）");
});

test("T17 主入口角色一轮结束（settled）→ 触发 emitProjectChanged；非主入口角色不触发", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "# A",
        boundary: { entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }], boundarySource: "b", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const makeHandle = (events: SessionEvent[]): RoleSessionHandle => {
    let i = 0;
    return {
      async send(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<SessionEvent>> {
                return i < events.length
                  ? { value: events[i++], done: false }
                  : { value: undefined as unknown as SessionEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {},
    };
  };
  let changed = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    emitProjectChanged: () => { changed += 1; },
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => makeHandle([{ kind: "settled", summary: "会话结束" }]),
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });

  // 打开主入口 su → 其 settled 应触发一次刷新信号。
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "su", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(changed, 1, "主入口角色的 settled 应触发一次 project:changed 信号");

  // 切到非主入口角色 A → 其 settled 不应再触发（只有主入口才刷左树）。
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(changed, 1, "非主入口角色的 settled 不应触发刷新");
});

// ————— T20：会话事件外推放宽到编排事件——handback 被 Interface 层外推（设计 §10.8）—————

test("T20 handback 事件被外推：Interface 层的 emitEvent 收到编排的 handback 事件（类型已放宽到 OrchestrationEvent）", async () => {
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const handback: TaskHandback = {
    roleId: "A",
    status: "blocked",
    summary: "被拦下：无写入落地",
    evidence: [],
    at: "2026-10-11T00:00:00.000Z",
  };
  const seq: OrchestrationEvent[] = [
    { kind: "handback", summary: "回交 su：被拦下", handback, liveReport: { source: { roleId: handback.roleId }, taskId: handback.taskId ?? null, status: handback.status, summary: { text: handback.summary, truncated: false, redacted: false }, evidence: handback.evidence.map(text => ({ text, truncated: false, redacted: false })), evidenceOmitted: 0, at: handback.at } },
    { kind: "settled", summary: "会话结束" },
  ];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: (env) => events.push(env.event),
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async (): Promise<RoleSessionHandle> => {
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
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));

  const hb = events.find((e) => e.kind === "handback");
  assert.ok(hb, "handback 事件应经 Interface 的 emitEvent 外推（emitEvent 已放宽到 OrchestrationEvent）");
  assert.equal(
    (hb as Extract<import("../../app/desktop/session.ts").DesktopOrchestrationEvent, { kind: "handback" }>).liveReport!.status,
    "blocked",
    "外推的 handback 数据应原样（含 status）",
  );
});

// ————— A-5（2026-10-12）：客户交互通道经 Interface 透传（仅内置治理角色会话注入）—————

test("A-5 customerInput：Interface 透传客户通道；仅内置治理角色（su）会话被注入，且 roleId 经闭包绑定", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "# A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const makeHandle = (): RoleSessionHandle => ({
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
  });
  const captured: { roleId: string; customerInput?: CustomerInputFn }[] = [];
  const seen: { roleId: string }[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => {
      captured.push({ roleId: input.roleId, customerInput: input.customerInput });
      return makeHandle();
    },
    buildProjectConfigFn: buildProjectConfig,
    // 桌面侧的客户通道带角色上下文（DesktopCustomerInputFn）——注入替身并断言 ctx 绑定。
    customerInput: (_req, ctx) => {
      seen.push({ roleId: ctx.roleId });
      return { outcome: "declined", reason: "测试替身：拒绝" };
    },
  });
  await iface.listProject({ projectRoot: "/proj" });
  await iface.openSession({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });

  const suInput = captured.find((c) => c.roleId === "su");
  const aInput = captured.find((c) => c.roleId === "A");
  assert.ok(suInput && typeof suInput.customerInput === "function", "内置治理角色（su）会话应注入 customerInput（确认制成立）");
  assert.equal(aInput!.customerInput, undefined, "普通角色会话**不**注入（无客户通道：两交互工具不注册）");
  // roleId 经闭包绑定：调用注入的 fn → 桌面通道收到 ctx.roleId（请求本体不带角色标识）。
  const out = await suInput!.customerInput!({ kind: "confirm", title: "要写角色卡吗？" });
  assert.deepEqual(seen, [{ roleId: "su" }], "customerInput 应带 roleId 上下文");
  assert.equal((out as { outcome: string }).outcome, "declined", "替身裁决原样回转");
});

test('B Interface native picker alone grants document refs; renderer listing, cancel and another window cannot grant', async () => {
 const fs=await import('node:fs/promises');const os=await import('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-interface-'));
 await fs.mkdir(path.join(root,'角色卡/A/docs'),{recursive:true});
 await fs.writeFile(path.join(root,'角色卡/A/role-card.md'),'# card');
 await fs.writeFile(path.join(root,'角色卡/A/docs/report.md'),'report body');
 const listing={...FAKE_LISTING,projectRoot:root};
 let selected:string|null=null;
 const iface=createDesktopInterface({pickDirectory:async()=>selected,emitEvent:()=>{},listProjectFn:async()=>listing,envFilePath:path.join(root,'absent-fake-env')});
 const other=createDesktopInterface({pickDirectory:async()=>null,emitEvent:()=>{},listProjectFn:async()=>listing,envFilePath:path.join(root,'absent-fake-env')});
 try{
  assert.equal((await iface.listProject({projectRoot:root})).documentReadUnavailable,'PROJECT_NOT_GRANTED');
  assert.equal(await iface.pickProject(),null);
  assert.equal((await iface.listProject({projectRoot:root})).documentScope,undefined);
  selected=root;assert.equal(await iface.pickProject(),root);
  const view=await iface.listProject({projectRoot:root});assert.ok(view.documentScope);
  const ref=view.roles[0].documents!.find(d=>d.label==='report.md')!;assert.ok(ref);
  const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  const content=await iface.readProjectDocument(request);assert.ok(content.ok);if(content.ok)assert.equal(content.text,'report body');
  assert.equal((await other.listProject({projectRoot:root})).documentScope,undefined);
  const foreign=await other.readProjectDocument(request);assert.ok(!foreign.ok);if(!foreign.ok)assert.equal(foreign.code,'PROJECT_NOT_GRANTED');
  const refresh=await iface.listProject({projectRoot:root});assert.equal(refresh.documentScope?.projectViewId,view.documentScope?.projectViewId,'same native-granted window survives renderer reload/list refresh');
  const forged=await iface.readProjectDocument({...request,projectRoot:root,path:'.env'});assert.ok(!forged.ok);if(!forged.ok)assert.equal(forged.code,'INVALID_REQUEST');
  iface.disposeProjectDocuments();const closed=await iface.readProjectDocument(request);assert.ok(!closed.ok);if(!closed.ok)assert.equal(closed.code,'PROJECT_NOT_ACTIVE');
 }finally{iface.disposeProjectDocuments();other.disposeProjectDocuments();await fs.rm(root,{recursive:true,force:true});}
});

test('B failed listing or native cancel preserves the previous imported document scope',async()=>{
 const fs=await import('node:fs/promises');const os=await import('node:os');
 const a=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-active-'));const b=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-pending-'));
 await fs.mkdir(path.join(a,'角色卡/A/docs'),{recursive:true});await fs.writeFile(path.join(a,'角色卡/A/role-card.md'),'card');await fs.writeFile(path.join(a,'角色卡/A/docs/report.md'),'active A');
 let selection:string|null=a;let failB=true;
 const iface=createDesktopInterface({pickDirectory:async()=>selection,emitEvent:()=>{},envFilePath:path.join(a,'absent-fake-env'),listProjectFn:async root=>{if(root===b&&failB)throw new Error('controlled enumeration failure');return {...FAKE_LISTING,projectRoot:root};}});
 try{
  await iface.pickProject();const before=await iface.listProject({projectRoot:a});const ref=before.roles[0].documents!.find(d=>d.label==='report.md')!;const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  selection=b;await iface.pickProject();assert.equal((await iface.readProjectDocument(request)).ok,true);
  await assert.rejects(iface.listProject({projectRoot:b}),/controlled enumeration failure/);
  const stillActive=await iface.readProjectDocument(request);assert.ok(stillActive.ok);if(stillActive.ok)assert.equal(stillActive.text,'active A');
  selection=null;assert.equal(await iface.pickProject(),null);assert.equal((await iface.readProjectDocument(request)).ok,true);
  failB=false;const next=await iface.listProject({projectRoot:b});assert.equal(next.documentReadUnavailable,'PROJECT_NOT_GRANTED');assert.equal((await iface.readProjectDocument(request)).ok,false,'only successful import changes the active scope');
 }finally{iface.disposeProjectDocuments();await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true});}
});

test('C restricted Interface validates current scope and derives support from actual bound mode', async () => {
 let calls = 0;
 const handle = makeFakeHandle().handle;
 handle.retryReportPersistence = async () => { calls++; return { ok: false, state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false, message: 'safe' }; };
 handle.getReportPersistence = async () => { calls++; return { state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false }; };
 handle.retryDeliveryHistoryPersistence = async () => { calls++; return { ok: false, state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false, message: 'safe' }; };
 handle.getDeliveryReceipt = async () => { calls++; return { state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false }; };
 const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING, openRoleSessionFn: async () => ({ ...handle, persistenceMode: 'unknown-live' }) });
 try {
  const scope = { version: 1, projectRoot: '/proj', roleId: 'A', runtime: 'demo' };
  assert.equal((await iface.getSessionPersistence(scope)).ok, false);
  await iface.listProject({ projectRoot: '/proj' }); await iface.openSession({ projectRoot: '/proj', roleId: 'A', runtime: 'demo' });
  const caps = await iface.getSessionPersistence(scope); assert.ok(caps.ok); if (caps.ok) assert.deepEqual(caps.value, { mode: 'unknown-live', reportSaveSupported: false, deliveryHistorySaveSupported: false, querySupported: false });
  for (const input of [{ ...scope, projectRoot: '/other' }, { ...scope, roleId: 'missing' }, { ...scope, reportId: 'forged', summary: 'raw fake report' }, { ...scope, version: 2 }]) assert.equal((await iface.retryReportSave(input)).ok, false);
  assert.equal((await iface.retryReportSave({ ...scope, reportId: 'forged' })).ok, false); assert.equal(calls, 0, 'invalid/unknown IDs never invoke even present proxies');
 } finally { await iface.stopSession(); iface.disposeProjectDocuments(); }
});
