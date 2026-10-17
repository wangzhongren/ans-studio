// test/桌面应用/operator-wiring.test.ts
// 桌面窗口（A-5，2026-10-12）：**客户确认制交互**的桌面侧验证——通道泛化（按请求快照校验）+ fail-closed
// 四条 + SessionManager 的注入判据（仅内置治理角色 su）。
//
// 背景（A-4 语义）：旧「收口提议 / 确认 / 手动 finalize」已删、被确认制取代——本文件即其替身
// （原 finalize-wiring.test.ts 打的正是已删 API，随本改动删除并按**新语义**重写；不为变绿放宽语义）。
// 冻结形状单一来源：`src/provider/pi/session.ts`（CustomerInputRequest / CustomerInputOutcome）——只读引用。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../app/desktop/session.ts";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { interactionAnchorKey } from "../../app/desktop/request-anchor.ts";
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
  // 锚点键（真机缺陷修复 2026-10-12）：载荷带 anchorKey（请求本体 kind+title 的单一算法键）——
  // 渲染侧据此与回放行精确关联、把交互卡（重）物化到它发生的位置。
  assert.deepEqual(pushed[0], { id: "op-1", roleId: "su", request: req, anchorKey: interactionAnchorKey("confirm", "写角色卡？") });
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

// ————— ③ 三权 §6.1 硬约束 / §九-10：同一项目一项目一卡（排队、不自动合并/批准） —————
//
// 适用范围＝本通道的全部请求（仅内置治理角色 su/三人的 `customerInput` 会走这里；项目角色从不注入）。
// 按 `projectRoot` 串行：第一张正常呈现；后续入队、**不调用 presenter**；第一张 resolve/取消/失效后按序呈现。

test("一项目一卡：第二张入队不呈现（onQueued 报 waitingFor）；第一张结束后按序呈现；排队中不能作答", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const queued: { payload: OperatorRequestPayload; waitingFor: string }[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    onQueued: (payload, waitingFor) => queued.push({ payload, waitingFor }),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "claude" as const };
  const p1 = channel.customerInput(
    { kind: "choice", title: "提案", options: [{ id: "accept", label: "接受" }] },
    ctx,
    { cardKind: "proposal", flowId: "flow-a" },
  );
  const p2 = channel.customerInput({ kind: "confirm", title: "写盘" }, ctx, { cardKind: "appointment-write", flowId: "flow-a" });
  assert.equal(pushed.length, 1, "第一张正常呈现");
  assert.equal(pushed[0].id, "op-1");
  assert.deepEqual(queued.map((q) => [q.payload.id, q.waitingFor]), [["op-2", "op-1"]], "第二张经 onQueued 报「等待前一个决定」");
  assert.equal(channel.pendingCount(), 2, "挂起数＝已呈现＋排队（两者都在等待客户）");
  assert.equal(channel.queuedCount(), 1, "第二张在队列中");

  const early = channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: true } });
  assert.equal(early.ok, false, "排队中的卡不能作答（不自动批准）");
  assert.equal(early.expired, true, "未呈现的 id 不是待答请求");
  let secondSettled = false;
  void Promise.resolve(p2).then(() => { secondSettled = true; });
  await Promise.resolve();
  assert.equal(secondSettled, false, "排队请求保持未决（绝不自动 answered/declined）");

  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await p1)!.outcome, "answered");
  assert.equal(pushed.length, 2, "第一张结束后第二张呈现");
  assert.equal(pushed[1].id, "op-2");
  assert.equal(channel.queuedCount(), 0);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await p2)!.outcome, "answered");
});

test("一项目一卡：第一张取消/失效 → 第二张呈现；排队项随会话失效出队；rejectAllPending 清空并按 fail-closed 结算", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const expired: string[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    onExpired: (payload) => expired.push(payload.id),
  });
  const ctx = { roleId: "convener", projectRoot: "/p", runtime: "pi" as const };
  const first = new AbortController();
  const p1 = channel.customerInput({ kind: "confirm", title: "第一张" }, ctx, { signal: first.signal });
  const second = new AbortController();
  const p2 = channel.customerInput({ kind: "confirm", title: "第二张" }, ctx, { signal: second.signal });
  assert.equal(pushed.length, 1, "第二张未呈现");

  // 排队项随本轮/会话中止（dispose）出队：不呈现、如实 unavailable。
  second.abort();
  assert.equal((await p2)!.outcome, "unavailable", "排队项失效 = 未获同意（fail-closed）");
  assert.equal(channel.queuedCount(), 0, "失效项已出队");
  assert.equal(pushed.length, 1, "失效的排队项从未呈现");

  // 第一张被取消 → 无下一张可呈现。
  first.abort();
  assert.equal((await p1)!.outcome, "unavailable");
  assert.equal(channel.pendingCount(), 0);

  // 新的两张：第一张呈现、第二张排队；窗关 rejectAllPending ⇒ 两张都 declined、队列清空。
  const p3 = channel.customerInput({ kind: "confirm", title: "甲" }, ctx);
  const p4 = channel.customerInput({ kind: "confirm", title: "乙" }, ctx);
  assert.equal(pushed.length, 2, "前一组清空后新第一张正常呈现");
  assert.equal(channel.pendingCount(), 2, "挂起数＝已呈现＋排队");
  assert.equal(channel.queuedCount(), 1);
  channel.rejectAllPending("窗口已关闭，未获同意（fail-closed）");
  assert.equal((await p3)!.outcome, "declined");
  assert.equal((await p4)!.outcome, "declined");
  assert.equal(channel.pendingCount(), 0);
  assert.equal(channel.queuedCount(), 0);
  assert.ok(expired.includes("op-3") && expired.includes("op-4"), "两张都收到失效通知（排队项也清掉等待行）");
});

test("一项目一卡按项目隔离：不同 projectRoot 各自可同时呈现（单窗口内不互相阻塞）", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (p) => pushed.push(p), operatorId: "tester" });
  void channel.customerInput({ kind: "confirm", title: "a" }, { roleId: "convener", projectRoot: "/a" });
  void channel.customerInput({ kind: "confirm", title: "b" }, { roleId: "convener", projectRoot: "/b" });
  assert.equal(pushed.length, 2, "不同项目各一张，互不排队");
  assert.equal(channel.pendingCount(), 2);
  assert.equal(channel.queuedCount(), 0);
  channel.rejectAllPending("cleanup");
});
