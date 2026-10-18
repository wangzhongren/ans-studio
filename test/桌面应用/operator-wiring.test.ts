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
import { createCustomerInputChannel, type OperatorRequestPayload, type GovernanceNextStepContext, type GovernanceNextStepPayload } from "../../app/desktop/customer-input.ts";
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

// ————— ④ 治理下一步（2026-10-18 客户修正）：按 cardKind + 客户**实际选择**推导 —————
//
// 客户反馈「这个不是应该自动的转发人物给后续流程吗」：客户决定成功后，应用要能自动进入下一角色/步骤。
// 本通道只负责**推导并回调**（主进程据此后台派发）；取消/拒绝/expired 绝不回调。
// 事件载荷契约固定：`{version:1, flowId?, cardKind, nextFunction, roleId, proposalPath?}`。

function makeNextStepChannel() {
  const next: { payload: GovernanceNextStepPayload; context: GovernanceNextStepContext }[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: () => {},
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    onNextStep: (payload, context) => { next.push({ payload, context }); },
  });
  return { channel, next };
}

function proposalRequest(flowId: string, extra: Record<string, unknown> = {}): CustomerInputRequest {
  return {
    kind: "choice",
    title: "提案",
    cardKind: "proposal",
    flowId,
    options: [
      { id: "accept", label: "接受" },
      { id: "accept-quick", label: "快捷接受" },
      { id: "revise", label: "修订" },
      { id: "reject", label: "拒绝" },
    ],
    ...extra,
  } as CustomerInputRequest;
}

const GOVERNANCE_CTX = { roleId: "rapporteur", projectRoot: "/p", runtime: "claude" as const };

test("治理下一步：proposal accept/accept-quick 推导提名/排程；flowId 与 proposalPath 透传", async () => {
  const { channel, next } = makeNextStepChannel();

  const p1 = channel.customerInput(proposalRequest("flow-a", { proposalPath: "docs/proposals/flow-a-v2.md" }), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await p1)!.outcome, "answered");
  assert.deepEqual(next[0].payload, {
    version: 1,
    flowId: "flow-a",
    cardKind: "proposal",
    nextFunction: "nomination",
    roleId: "nominator",
    proposalPath: "docs/proposals/flow-a-v2.md",
  }, "accept → Nominator；请求显式给出的 proposalPath 原样透传");
  assert.deepEqual(next[0].context, {
    sourceRoleId: "rapporteur",
    projectRoot: "/p",
    runtime: "claude",
  }, "上下文只带桌面派发所需信息（不进 IPC 载荷）");

  const p2 = channel.customerInput(proposalRequest("flow-b"), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept-quick"] } }).ok, true);
  await p2;
  assert.deepEqual(next[1].payload, {
    version: 1,
    flowId: "flow-b",
    cardKind: "proposal",
    nextFunction: "schedule",
    roleId: "convener",
  }, "accept-quick → Convener（快捷路径，无 proposalPath 时不编造）");
});

test("治理下一步：proposal revise/reject、acceptance、write 推导为 null（明确无下一步，仍回调）", async () => {
  const { channel, next } = makeNextStepChannel();

  const p1 = channel.customerInput(proposalRequest("flow-a"), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["revise"] } }).ok, true);
  await p1;
  const p2 = channel.customerInput(proposalRequest("flow-a"), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["reject"] } }).ok, true);
  await p2;
  for (const event of next) {
    assert.equal(event.payload.nextFunction, null, "修订/拒绝 = 无下一步");
    assert.equal(event.payload.roleId, null);
  }

  const acceptance: CustomerInputRequest = {
    kind: "choice",
    title: "验收",
    cardKind: "acceptance",
    flowId: "flow-a",
    options: [{ id: "accept", label: "通过" }, { id: "reject", label: "退回" }],
  };
  const p3 = channel.customerInput(acceptance, GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-3", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await p3;
  assert.deepEqual(next[2].payload, { version: 1, flowId: "flow-a", cardKind: "acceptance", nextFunction: null, roleId: null }, "验收成功 = 流程收口");

  const p4 = channel.customerInput({ kind: "confirm", title: "写盘", cardKind: "write", flowId: "flow-a" }, GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-4", decision: { kind: "confirm", confirmed: true } }).ok, true);
  await p4;
  assert.deepEqual(next[3].payload, { version: 1, flowId: "flow-a", cardKind: "write", nextFunction: null, roleId: null }, "普通写盘不解锁下一步");
});

test("治理下一步：appointment 任命成功 → Convener 排程，任命名单进上下文", async () => {
  const { channel, next } = makeNextStepChannel();
  const appointment: CustomerInputRequest = {
    kind: "choice",
    title: "任命",
    cardKind: "appointment",
    flowId: "flow-c",
    multiple: true,
    options: [{ id: "role-a", label: "角色 A" }, { id: "role-b", label: "角色 B" }],
  };
  const p = channel.customerInput(appointment, { roleId: "nominator", projectRoot: "/p", runtime: "pi" });
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["role-a", "role-b"] } }).ok, true);
  await p;
  assert.deepEqual(next[0].payload, {
    version: 1,
    flowId: "flow-c",
    cardKind: "appointment",
    nextFunction: "schedule",
    roleId: "convener",
  }, "任命成功 → Convener 写流程单并派发");
  assert.deepEqual(next[0].context.targetRoleIds, ["role-a", "role-b"], "任命名单原样透传（供任务消息使用）");
  assert.equal(next[0].context.sourceRoleId, "nominator");
});

test("治理下一步：取消/拒绝/expired、无 cardKind 一律不回调（绝不自动推进）", async () => {
  const { channel, next } = makeNextStepChannel();

  const p1 = channel.customerInput(proposalRequest("flow-a"), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", cancelled: true } }).ok, true);
  assert.equal((await p1)!.outcome, "declined");
  assert.equal(next.length, 0, "取消 = 未获同意，不发下一步");

  const p2 = channel.customerInput({ kind: "confirm", title: "写盘", cardKind: "appointment-write", flowId: "flow-a" }, GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: false } }).ok, true);
  assert.equal((await p2)!.outcome, "declined");
  assert.equal(next.length, 0, "拒绝 = 未获同意，不发下一步");

  const p3 = channel.customerInput(proposalRequest("flow-a"), GOVERNANCE_CTX);
  channel.rejectAllPending("窗口已关闭，未获同意（fail-closed）");
  assert.equal((await p3)!.outcome, "declined");
  assert.equal(next.length, 0, "expired/关窗 = 未获同意，不发下一步");

  const legacy = channel.customerInput(
    { kind: "choice", title: "旧卡", options: [{ id: "accept", label: "接受" }] },
    GOVERNANCE_CTX,
  );
  assert.equal(channel.respond({ id: "op-4", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await legacy)!.outcome, "answered");
  assert.equal(next.length, 0, "无治理元数据的旧卡零行为变化（不产生下一步）");
});

test("治理下一步：onNextStep 抛错不影响客户决定结算与后续排队", async () => {
  const pushed: OperatorRequestPayload[] = [];
  let calls = 0;
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: (() => { let n = 0; return () => `op-${++n}`; })(),
    onNextStep: () => { calls += 1; throw new Error("派发下游故障"); },
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "claude" as const };
  const p1 = channel.customerInput(proposalRequest("flow-a"), ctx);
  const p2 = channel.customerInput({ kind: "confirm", title: "排队第二张" }, ctx);
  assert.equal(pushed.length, 1);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await p1)!.outcome, "answered", "回调抛错不改变客户决定");
  assert.equal(calls, 1);
  assert.equal(pushed.length, 2, "排队下一张照常呈现");
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await p2)!.outcome, "answered");
});

test("preload：暴露 onGovernanceNextStep 订阅且不暴露 Node 能力", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../../app/preload.cjs", import.meta.url), "utf8");
  assert.ok(source.includes("onGovernanceNextStep"), "preload 应暴露 onGovernanceNextStep");
  assert.ok(source.includes('"governance:next-step"'), "订阅通道名应为 governance:next-step");
  assert.ok(!/require\(["'](?:node:)?fs["']\)/.test(source), "preload 不暴露 fs");
  assert.ok(!source.includes("process."), "preload 不暴露 process");
});

// ————— W6-B（2026-10-18）：决定卡镜像（四角色评审 §6.1）—————
//
// 镜像 = **同一个请求 id 的第二处呈现**，不是第二个请求、不是第二次审批：同一 pending、同一个
// respond、只结算一次；镜像只是呈现路由（`mirrorRoleId`），不改卡片内容/选项/审计。

test("W6-B 镜像载荷：同一请求带 mirrorRoleId，内容/选项/锚点不变；同一 id 只答一次、第二次按终态拒绝", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => "op-mirror-1",
  });
  const req = proposalRequest("flow-a");
  const pending = channel.customerInput(
    req,
    { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", mirrorRoleId: "liaison" },
    { cardKind: "proposal", flowId: "flow-a" },
  );
  assert.equal(pushed.length, 1, "镜像不产生第二条 pending（仍只有一张呈现）");
  assert.equal(pushed[0].id, "op-mirror-1");
  assert.equal(pushed[0].roleId, "rapporteur", "roleId 仍是发起角色（回执归属/原生徽标）");
  assert.equal(pushed[0].mirrorRoleId, "liaison", "镜像面 = 主入口 Liaison（同一请求 id）");
  assert.equal(pushed[0].request, req, "卡片内容/选项原样透传（不改契约）");
  assert.equal(pushed[0].anchorKey, interactionAnchorKey("choice", req.title), "锚点键不变");

  // 任一侧作答 → 同一个 respond 结算一次；第二次（另一侧/同一侧）按终态拒绝（两侧冻结）。
  assert.deepEqual(channel.respond({ id: "op-mirror-1", decision: { kind: "choice", selected: ["accept"] } }), { ok: true });
  const second = channel.respond({ id: "op-mirror-1", decision: { kind: "choice", selected: ["revise"] } });
  assert.equal(second.ok, false, "第二次作答不受理");
  assert.equal(second.expired, true, "已结算请求按终态拒绝（界面冻结，不产生第二份决定）");
  assert.equal((await pending)!.outcome, "answered");
  assert.equal(channel.pendingCount(), 0);
});

test("W6-B 镜像只呈现 active 卡：排队卡不推送，第一张结算后第二张带 mirrorRoleId 呈现", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const queued: OperatorRequestPayload[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => `op-q-${++n}`,
    onQueued: (payload) => queued.push(payload),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, mirrorRoleId: "liaison" };
  const p1 = channel.customerInput(proposalRequest("flow-a"), ctx, { cardKind: "proposal", flowId: "flow-a" });
  const p2 = channel.customerInput(
    { kind: "choice", title: "任命", cardKind: "appointment", flowId: "flow-a", options: [{ id: "role-a", label: "A" }] } as CustomerInputRequest,
    ctx,
    { cardKind: "appointment", flowId: "flow-a" },
  );
  assert.equal(pushed.length, 1, "一项目一卡：第二张排队、不物化可操作镜像");
  assert.equal(queued.length, 1, "排队经 onQueued 报「等待前一个决定」");
  assert.equal(channel.queuedCount(), 1);

  assert.equal(channel.respond({ id: "op-q-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await p1;
  assert.equal(pushed.length, 2, "第一张结算后第二张才呈现");
  assert.equal(pushed[1].id, "op-q-2");
  assert.equal(pushed[1].mirrorRoleId, "liaison", "active 卡才镜像到主入口");
  assert.equal(channel.respond({ id: "op-q-2", decision: { kind: "choice", selected: ["role-a"] } }).ok, true);
  await p2;
  channel.rejectAllPending("cleanup");
});

/** trio 枚举：liaison 为主入口，rapporteur 携带提案职能。 */
function trioMirrorListing(): ProjectListing {
  return {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "liaison",
        cardPath: "",
        boundaryPath: "",
        cardText: "# liaison",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } },
        builtIn: true,
        governanceFunction: "liaison",
      },
      {
        roleId: "rapporteur",
        cardPath: "",
        boundaryPath: "",
        cardText: "# rapporteur",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } },
        builtIn: true,
        governanceFunction: "proposal",
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "liaison",
    governanceModel: "trio",
  };
}

test("W6-B 镜像判据（SessionManager）：trio 的 proposal/write 都带主入口、无 cardKind 不镜像；single 不镜像", async () => {  const contexts: { roleId: string; mirrorRoleId?: string }[] = [];
  const listing = trioMirrorListing();
  let rapporteurInput: { customerInput?: CustomerInputFn } | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "rapporteur") rapporteurInput = input as { customerInput?: CustomerInputFn };
      return quietHandle();
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
    customerInput: (_req, ctx) => {
      contexts.push(ctx as { roleId: string; mirrorRoleId?: string });
      return { outcome: "declined", reason: "替身：拒绝" };
    },
  });
  assert.equal((await mgr.open({ projectRoot: "/proj", roleId: "rapporteur", runtime: "demo" })).ok, true);
  assert.ok(rapporteurInput?.customerInput, "Rapporteur 注入客户通道（镜像由此通道计算）");

  const proposal: CustomerInputRequest = {
    kind: "choice",
    title: "提案",
    cardKind: "proposal",
    flowId: "flow-a",
    options: [{ id: "accept", label: "接受" }],
  };
  await rapporteurInput!.customerInput!(proposal, { cardKind: "proposal", flowId: "flow-a" });
  const writeCard: CustomerInputRequest = { kind: "confirm", title: "写盘", cardKind: "write" };
  await rapporteurInput!.customerInput!(writeCard, { cardKind: "write" });
  const legacy: CustomerInputRequest = { kind: "confirm", title: "旧卡" };
  await rapporteurInput!.customerInput!(legacy);
  assert.deepEqual(
    contexts.map((ctx) => ctx.mirrorRoleId),
    ["liaison", "liaison", undefined],
    "trio：proposal 与 write 都镜像到主入口；无 cardKind 不镜像",
  );
  await mgr.stop(null);

  // single：即使卡片种类命中也不镜像（`governanceModel !== "trio"`）。
  const singleContexts: { roleId: string; mirrorRoleId?: string }[] = [];
  const singleListing: ProjectListing = {
    projectRoot: "/single-proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
    governanceModel: "single",
  };
  let suInput: { customerInput?: CustomerInputFn } | undefined;
  const singleMgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "su") suInput = input as { customerInput?: CustomerInputFn };
      return quietHandle();
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === singleListing.projectRoot ? singleListing : undefined),
    emitEvent: () => {},
    customerInput: (_req, ctx) => {
      singleContexts.push(ctx as { roleId: string; mirrorRoleId?: string });
      return { outcome: "declined", reason: "替身：拒绝" };
    },
  });
  assert.equal((await singleMgr.open({ projectRoot: "/single-proj", roleId: "su", runtime: "demo" })).ok, true);
  await suInput!.customerInput!(proposal, { cardKind: "proposal", flowId: "flow-a" });
  const singleWrite: CustomerInputRequest = { kind: "confirm", title: "写盘", cardKind: "write" };
  await suInput!.customerInput!(singleWrite, { cardKind: "write" });
  assert.equal(singleContexts.length, 2);
  assert.deepEqual(
    singleContexts.map((ctx) => ctx.mirrorRoleId),
    [undefined, undefined],
    "single：proposal/write 均不镜像（无 Liaison 主入口）",
  );
  await singleMgr.stop(null);
});

test("W6-B 步骤审计：request.stepId 原样进 next-step context（不进 IPC 载荷、缺席不猜）", async () => {
  const { channel, next } = makeNextStepChannel();
  const withStep = channel.customerInput(
    proposalRequest("flow-a", { stepId: "step-1" }),
    GOVERNANCE_CTX,
  );
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await withStep;
  assert.equal(next[0].context.stepId, "step-1", "卡片显式给出的 stepId 原样透传（供 dispatch.accepted 审计）");
  assert.equal("stepId" in next[0].payload, false, "governance:next-step IPC 载荷不扩");

  const withoutStep = channel.customerInput(proposalRequest("flow-b"), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await withoutStep;
  assert.equal(next[1].context.stepId, undefined, "请求未给 stepId 时不伪造");
});

test("W6-B 报告员 write 卡镜像：mirrorRoleId=liaison、同一请求只答一次（第二次 expired）", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (p) => pushed.push(p),
    operatorId: "tester",
    nextId: () => "op-write-1",
  });
  const req: CustomerInputRequest = {
    kind: "confirm",
    title: "写提案文件",
    cardKind: "write",
    preview: "docs/proposals/flow-a-v1.md",
  };
  const pending = channel.customerInput(
    req,
    { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", mirrorRoleId: "liaison" },
    { cardKind: "write" },
  );
  assert.equal(pushed.length, 1, "write 卡仍只有一个请求（镜像不是第二张 pending）");
  assert.equal(pushed[0].mirrorRoleId, "liaison", "报告员 write 确认卡镜像到联络官");
  assert.equal(pushed[0].roleId, "rapporteur", "来源角色不变");
  assert.equal(pushed[0].request, req, "卡片内容/选项原样透传");

  assert.equal(channel.respond({ id: "op-write-1", decision: { kind: "confirm", confirmed: true } }).ok, true);
  const second = channel.respond({ id: "op-write-1", decision: { kind: "confirm", confirmed: true } });
  assert.equal(second.ok, false, "同一请求只答一次");
  assert.equal(second.expired, true, "两侧冻结：第二次按终态拒绝");
  assert.equal((await pending)!.outcome, "answered");
  assert.equal(channel.pendingCount(), 0);
});
