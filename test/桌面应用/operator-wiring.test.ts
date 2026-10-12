// test/桌面应用/operator-wiring.test.ts
// 桌面应用（A-5，2026-10-12）：**客户确认制交互**的桌面侧验证——通道泛化（按请求快照校验）+ fail-closed
// 四条 + SessionManager 的注入判据（仅内置治理角色 su）。
//
// 背景（A-4 语义）：旧「收口提议 / 确认 / 手动 finalize」已删、被确认制取代——本文件即其替身
// （原 finalize-wiring.test.ts 打的正是已删 API，随本改动删除并按**新语义**重写；不为变绿放宽语义）。
// 冻结形状单一来源：`src/provider/pi/session.ts`（CustomerInputRequest / CustomerInputOutcome）——只读引用。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../app/desktop/session.ts";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { CustomerInputFn, CustomerInputRequest, SessionEvent } from "../../src/provider/pi/session.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

// ————— ① 通道本体（纯逻辑）：confirm / choice / 快照校验 / fail-closed 四条 —————

function makeChannel() {
  const pushed: OperatorRequestPayload[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
  });
  return { channel, pushed };
}

test("A-5 通道：confirm 作答 → answered/confirmed:true；「不同意」→ declined（未获同意）", async () => {
  const { channel, pushed } = makeChannel();
  const req: CustomerInputRequest = { kind: "confirm", title: "写角色卡？", preview: "角色卡…" };
  const p1 = channel.customerInput(req, { roleId: "su" });
  assert.equal(pushed.length, 1, "请求应经 presenter 推达（带 roleId 信封）");
  assert.deepEqual(pushed[0], { id: "op-1", roleId: "su", request: req });
  assert.equal(channel.pendingCount(), 1);

  assert.deepEqual(channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }), { ok: true });
  assert.deepEqual(await p1, { outcome: "answered", value: { confirmed: true }, operatorId: "tester" });
  assert.equal(channel.pendingCount(), 0);

  const p2 = channel.customerInput({ kind: "confirm", title: "×" }, { roleId: "su" });
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: false } }).ok, true);
  const o2 = await p2;
  assert.equal(o2!.outcome, "declined", "「不同意」= 未获同意（fail-closed 方向）");
});

test("A-5 通道（请求快照校验）：selected 必须 ⊆ 已给选项、单选恰一个、空选择不受理——非法回包不落三态", async () => {
  const req: CustomerInputRequest = {
    kind: "choice",
    title: "选一个",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  };
  const { channel } = makeChannel();
  const p = channel.customerInput(req, { roleId: "su" });
  // 单选给两个 → 不受理（pending 保留）
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["a", "b"] } }).ok, false);
  // 选项不在本次请求中 → 不受理
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["zzz"] } }).ok, false);
  // 空选择 → 不受理
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: [] } }).ok, false);
  // 类型不符（choice 决定答到 confirm 请求上——此处请求是 choice、决定也算 choice，故改用 confirm 决定）→ 不受理
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).ok, false);
  assert.equal(channel.pendingCount(), 1, "不受理的非法回包不得解挂（界面可修正重试）");
  // 合法 → answered/selected
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["b"] } }).ok, true);
  assert.deepEqual(await p, { outcome: "answered", value: { selected: ["b"] }, operatorId: "tester" });
});

test("A-5 通道：多选子集/去重合法；取消 → declined；窗口关闭 rejectAll → declined；未接线 → unavailable", async () => {
  const req: CustomerInputRequest = {
    kind: "choice",
    title: "勾选",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    multiple: true,
  };
  const { channel } = makeChannel();
  const p = channel.customerInput(req, { roleId: "su" });
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["a", "c", "a"] } }).ok, true, "多选：子集合法且去重");
  const o = await p;
  assert.deepEqual((o as { value: { selected: string[] } }).value.selected, ["a", "c"]);

  const p2 = channel.customerInput({ kind: "confirm", title: "×" }, { roleId: "su" });
  channel.rejectAllPending("窗口已关闭，未获同意（fail-closed）");
  const o2 = await p2;
  assert.equal(o2!.outcome, "declined", "窗关 = 未获同意（fail-closed）");

  const p3 = channel.customerInput({ kind: "choice", title: "×", options: [{ id: "a", label: "A" }] }, { roleId: "su" });
  assert.equal(channel.respond({ id: "op-3", decision: { kind: "choice", cancelled: true } }).ok, true);
  assert.equal((await p3)!.outcome, "declined", "取消 = 未获同意");

  const bare = createCustomerInputChannel({ operatorId: "t" }); // 无 presenter（未接线）
  const o4 = await bare.customerInput({ kind: "confirm", title: "×" }, { roleId: "su" });
  assert.equal(o4!.outcome, "unavailable", "未接线 → unavailable（不挂起、绝不放行）");
});

test("A-5 通道（真机语义）：未知 id 回包 → 终态 expired；非法决定 → 可重试（无 expired）", async () => {
  const { channel } = makeChannel();
  // 无挂起请求（G-1：只剩容器重启/关闭这一种真实失效）：**终态**——界面据此定格、不再解冻重试。
  const dead = channel.respond({ id: "nope", decision: { kind: "confirm", confirmed: true } });
  assert.equal(dead.ok, false);
  assert.equal(dead.expired, true, "无挂起请求 → 终态 expired:true");
  assert.ok(/应用重启|关闭/.test(dead.error || ""), "终态原因如实指向「重启/关闭」（G-1：不再有按时间超时）");
  // 非法决定（类型不符）：**可重试**——请求仍挂起。
  const p = channel.customerInput({ kind: "confirm", title: "×" }, { roleId: "su" });
  const bad = channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["a"] } });
  assert.equal(bad.ok, false);
  assert.ok(!bad.expired, "非法决定不得标终态（界面可修正重试）");
  assert.equal(channel.pendingCount(), 1, "请求仍挂起");
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await p)!.outcome, "answered");
});

// ————— ② SessionManager 注入判据：仅内置治理角色（su）会话注入；roleId 经闭包绑定 —————

function fakeListing(): ProjectListing {
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
    hasRoles: false,
    primaryRoleId: "su",
  };
}

function quietHandle(): RoleSessionHandle {
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
}

test("A-5 注入判据：仅内置治理角色（su）会话注入 customerInput；roleId 闭包绑定；普通角色不注入", async () => {
  const listing = fakeListing();
  const captured: { roleId: string; customerInput?: CustomerInputFn }[] = [];
  const seen: string[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured.push({ roleId: input.roleId, customerInput: input.customerInput });
      return quietHandle();
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
    customerInput: (_req, ctx) => {
      seen.push(ctx.roleId);
      return { outcome: "declined", reason: "替身：拒绝" };
    },
  });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });

  const suInput = captured.find((c) => c.roleId === "su");
  const aInput = captured.find((c) => c.roleId === "A");
  assert.ok(suInput && typeof suInput.customerInput === "function", "内置治理角色（su）会话应注入 customerInput（确认制成立）");
  assert.equal(aInput!.customerInput, undefined, "普通角色会话**不**注入（无客户通道：两交互工具不注册）");
  // roleId 经闭包绑定：调用注入的 fn → 桌面通道收到 ctx.roleId（请求本体不带角色标识）。
  const out = await suInput!.customerInput!({ kind: "confirm", title: "要写角色卡吗？" });
  assert.deepEqual(seen, ["su"], "customerInput 应带 roleId 上下文");
  assert.equal((out as { outcome: string }).outcome, "declined", "替身裁决原样回转");
  await mgr.stop(null);
});

test("A-5 未接通道：deps.customerInput 缺省 ⇒ 连 su 也不注入（无确认制——绝不悄悄放行）", async () => {
  const listing = fakeListing();
  const captured: { roleId: string; customerInput?: CustomerInputFn }[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured.push({ roleId: input.roleId, customerInput: input.customerInput });
      return quietHandle();
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
    // 刻意不提供 customerInput（主进程未接线）
  });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  assert.equal(captured[0].customerInput, undefined, "通道未接 ⇒ 不注入 ⇒ 无确认制（工具不注册）");
  await mgr.stop(null);
});
