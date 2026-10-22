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
import {
  createCustomerInputChannel,
  judgeResultSummary,
  resolveChannelJudgeTimeoutMs,
  formatJudgeTimeoutMs,
  DEFAULT_GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MS,
  GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_ENV,
  type OperatorRequestPayload,
  type OperatorJudgeResultPayload,
  type GovernanceNextStepContext,
  type GovernanceNextStepPayload,
} from "../../app/desktop/customer-input.ts";
import {
  buildAcceptanceTaskMessage,
  buildGovernanceAdvanceMessage,
  buildRoleReadinessTaskMessage,
  flowCompletionIssue,
  normalizeFlowStepStatus,
  parseFlowStepStatuses,
  type FlowCompletionLedgerEntryLike,
} from "../../app/desktop/governance-advance.ts";
import { interactionAnchorKey } from "../../app/desktop/request-anchor.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { CustomerInputFn, CustomerInputRequest, SessionEvent } from "../../src/provider/pi/session.ts";
import type {
  GovernanceJudgeContext,
  GovernanceJudgeFn,
  GovernanceJudgeGroup,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";
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

test("治理下一步：proposal accept 派 Convener 写流程+团队计划并发任命卡（无 followUp）；accept-quick 直接排程", async () => {
  const { channel, next } = makeNextStepChannel();

  const p1 = channel.customerInput(proposalRequest("flow-a", { proposalPath: "docs/proposals/flow-a-v2.md" }), GOVERNANCE_CTX);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await p1)!.outcome, "answered");
  assert.deepEqual(next[0].payload, {
    version: 1,
    flowId: "flow-a",
    cardKind: "proposal",
    nextFunction: "schedule",
    roleId: "convener",
    proposalPath: "docs/proposals/flow-a-v2.md",
  }, "accept → Convener 写流程状态 YAML + 团队计划并直接发 appointment 卡（2026-10-22 第 1 项，不再产生两段式 followUp）");
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
  }, "accept-quick → Convener 写流程并排步骤（无任命）");
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

test("治理下一步：appointment 任命成功 → Crew 写卡（role-card-write），任命名单进上下文", async () => {
  const { channel, next } = makeNextStepChannel();
  const appointment: CustomerInputRequest = {
    kind: "choice",
    title: "任命",
    cardKind: "appointment",
    flowId: "flow-c",
    multiple: true,
    options: [{ id: "role-a", label: "角色 A" }, { id: "role-b", label: "角色 B" }],
  };
  const p = channel.customerInput(appointment, { roleId: "convener", projectRoot: "/p", runtime: "pi" });
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["role-a", "role-b"] } }).ok, true);
  await p;
  assert.deepEqual(next[0].payload, {
    version: 1,
    flowId: "flow-c",
    cardKind: "appointment",
    nextFunction: "role-card-write",
    roleId: "nominator",
  }, "任命成功 → 应用派 Crew 写卡（不是 Convener 排程；2026-10-22 第 1 项）");
  assert.deepEqual(next[0].context.targetRoleIds, ["role-a", "role-b"], "任命名单原样透传（供任务消息使用）");
  assert.equal(next[0].context.sourceRoleId, "convener", "任命卡由 Convener 发起");
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

test("preload：暴露 onGovernanceNextStep/决策开关/结果行订阅且不暴露 Node 能力", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../../app/preload.cjs", import.meta.url), "utf8");
  assert.ok(source.includes("onGovernanceNextStep"), "preload 应暴露 onGovernanceNextStep");
  assert.ok(source.includes('"governance:next-step"'), "订阅通道名应为 governance:next-step");
  // 2026-10-18 双开关评审 §3.3：decision 的四个白名单方法（get/set/state/result）逐字存在。
  for (const method of ["getDecisionJudgeState", "setDecisionJudgeEnabled", "onDecisionJudgeState", "onOperatorJudgeResult"]) {
    assert.ok(source.includes(method), `preload 应暴露 ${method}`);
  }
  for (const channel of ['"decision:judge-get"', '"decision:judge-set"', '"decision:judge-state"', '"session:operator-judge"']) {
    assert.ok(source.includes(channel), `订阅/调用通道名应为 ${channel}`);
  }
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

// ————— ⑤ 2026-10-18 双开关：judging 状态机 / 正向代批 / 按组回落 / 审计 —————
//
// 依据：PM 评审《「替我审批」/「替我决策」双开关——项目管理评审与 V1 拆发》§3.2/§4/§8；
// 2026-10-19 客户总原则「我勾选了替我决策就不用我来管了」：判断实际运行后，approve ⇒ 代批；
// deny/manual（负向/证据不足/读取失败/超时/引擎不可用/事实不可读…）⇒ **自动退回发起角色重做**
// （declined + 可操作原因，不呈现客户卡）；唯一例外＝判断期间客户关闭开关（switch-off）⇒ 原卡 + 提示。

const flushJudge = () => new Promise((resolve) => setTimeout(resolve, 5));

function factsOf(flowId: string) {
  return {
    governanceModel: "trio" as const,
    flowId,
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  };
}

function judgeContextOf(flowId: string, extra: Partial<GovernanceJudgeContext> = {}): GovernanceJudgeContext {
  return { flowId, facts: factsOf(flowId), ...extra };
}

const JUDGE_CTX = { roleId: "rapporteur", projectRoot: "/p", runtime: "claude" as const, governanceModel: "trio" as const };

function makeJudgeChannel(opts: {
  enabled: (group: GovernanceJudgeGroup) => boolean;
  judge?: GovernanceJudgeFn;
  emit?: (payload: OperatorJudgeResultPayload) => void;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  queued?: (payload: OperatorRequestPayload, waitingFor: string) => void;
  /** 2026-10-20：排队项未呈现即结算 ⇒ onExpired（渲染侧删排队行）的收集器。 */
  expired?: (payload: { id: string; roleId: string; reason: string }) => void;
}) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  const next: { payload: GovernanceNextStepPayload; context: GovernanceNextStepContext }[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    judge: {
      isGroupEnabled: opts.enabled,
      ...(opts.judge !== undefined ? { fn: opts.judge } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.env !== undefined ? { env: opts.env } : {}),
    },
    emitJudgeResult: opts.emit ?? ((payload) => results.push(payload)),
    onNextStep: (payload, context) => next.push({ payload, context }),
    ...(opts.queued !== undefined ? { onQueued: opts.queued } : {}),
    ...(opts.expired !== undefined ? { onExpired: opts.expired } : {}),
  });
  return { channel, pushed, results, next };
}

function writeRequest(title = "写盘"): CustomerInputRequest {
  return { kind: "confirm", title, cardKind: "write", preview: "docs/proposals/flow-a-v1.md" };
}

function approveJudge(requests: GovernanceJudgeRequest[]): GovernanceJudgeFn {
  return async (request) => {
    requests.push(request);
    const value = request.card.kind === "confirm" ? { confirmed: true as const } : { selected: ["accept"] };
    return {
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      reasonCode: "sufficient",
      engine: request.runtime,
      model: "judge-model",
      value,
      paths: request.paths,
      evidence: ["docs/proposals/flow-a-v1.md"],
      durationMs: 12,
      readCalls: 2,
      readBytes: 128,
    };
  };
}

test("双开关矩阵：仅所属组开启才判断；两开关互不影响；无 cardKind 旧卡永不判断", async () => {
  const enabled = { approval: false, decision: false };
  const requests: GovernanceJudgeRequest[] = [];
  const { channel, pushed, results, next } = makeJudgeChannel({
    enabled: (group) => enabled[group],
    judge: approveJudge(requests),
  });
  const proposalMeta = { cardKind: "proposal" as const, flowId: "flow-a", judgeContext: judgeContextOf("flow-a") };

  // 两开关都关：与改动前逐字一致（卡呈现、无 judge 调用、无结果行）
  const p1 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, proposalMeta);
  assert.equal(requests.length, 0);
  assert.equal(channel.judgingCount(), 0);
  assert.equal(pushed.length, 1);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await p1;

  // 只开 approval：proposal（decision 组）不判断，原卡照常
  enabled.approval = true;
  const p2 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, proposalMeta);
  assert.equal(requests.length, 0, "approval 开关不影响 decision 卡");
  assert.equal(pushed.length, 2);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await p2;

  // 只开 decision：proposal 代批成功——0 卡、1 行、answered+judge 审计、下一步恰一次
  enabled.approval = false;
  enabled.decision = true;
  const nextBefore = next.length;
  const o3 = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, proposalMeta))!;
  assert.equal(requests.length, 1, "decision 组只判断一次");
  assert.equal(requests[0].group, "decision");
  assert.equal(pushed.length, 2, "代批成功不呈现卡");
  assert.equal(results.length, 1, "代批成功产生一条结果行");
  assert.equal(results[0].group, "decision");
  assert.equal(results[0].cardKind, "proposal");
  assert.deepEqual(results[0].selected, ["accept"]);
  assert.equal(results[0].engine, "claude");
  assert.equal(next.length, nextBefore + 1, "onNextStep 恰一次（派发 Nominator）");
  assert.equal(next[nextBefore].payload.cardKind, "proposal");
  assert.equal(o3.outcome, "answered");
  assert.deepEqual(o3.value, { selected: ["accept"] });
  assert.equal(o3.operatorId, "judge:claude");
  assert.equal(o3.judge?.group, "decision");
  assert.equal(o3.judge?.cardKind, "proposal");
  assert.equal(o3.judge?.engine, "claude");
  assert.equal(o3.judge?.model, "judge-model");
  assert.deepEqual(o3.judge?.selected, ["accept"]);

  // 只开 decision：write（approval 组）不判断
  const w1 = channel.customerInput(writeRequest(), JUDGE_CTX, { cardKind: "write", flowId: "flow-a", judgeContext: judgeContextOf("flow-a") });
  assert.equal(requests.length, 1, "decision 开关不影响 write 卡");
  assert.equal(pushed.length, 3);
  assert.equal(channel.respond({ id: "op-4", decision: { kind: "confirm", confirmed: true } }).ok, true);
  await w1;

  // 只开 approval：write 代批成功（confirmed:true）
  enabled.decision = false;
  enabled.approval = true;
  const o5 = (await channel.customerInput(writeRequest(), JUDGE_CTX, { cardKind: "write", flowId: "flow-a", judgeContext: judgeContextOf("flow-a") }))!;
  assert.equal(requests.length, 2);
  assert.equal(requests[1].group, "approval");
  assert.equal(o5.outcome, "answered");
  assert.deepEqual(o5.value, { confirmed: true });
  assert.equal(o5.judge?.group, "approval");
  assert.equal(results.length, 2);
  assert.equal(results[1].group, "approval");

  // 无 cardKind 旧卡：即使两开关都开也不判断（零行为变化）
  enabled.decision = true;
  const legacy = channel.customerInput({ kind: "confirm", title: "旧卡" }, JUDGE_CTX);
  assert.equal(requests.length, 2);
  assert.equal(pushed.length, 4);
  assert.equal(channel.respond({ id: "op-6", decision: { kind: "confirm", confirmed: true } }).ok, true);
  await legacy;
});

test("judging 状态机：不呈现/不计 pending、占住一项目一卡；respond 返回 expired；manual ⇒ 自动退回重做", async () => {
  let release: ((outcome: GovernanceJudgeOutcome) => void) | undefined;
  const judge: GovernanceJudgeFn = (request) =>
    new Promise((resolve) => {
      release = (outcome) => resolve(outcome);
    });
  const queued: { payload: OperatorRequestPayload; waitingFor: string }[] = [];
  const { channel, pushed, results, next } = makeJudgeChannel({
    enabled: () => true,
    judge,
    queued: (payload, waitingFor) => queued.push({ payload, waitingFor }),
  });
  const p1 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  assert.equal(pushed.length, 0, "judging 不调用 presenter");
  assert.equal(channel.pendingCount(), 0, "judging 不计入 pending");
  assert.equal(channel.queuedCount(), 0);
  assert.equal(channel.judgingCount(), 1, "新增的 judgingCount 仅诊断用");
  assert.equal(channel.pendingRoles().size, 0, "看护不把 judging 当作「等待客户」");
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).expired, true, "判断中的卡不可作答");

  // 一项目一卡：第二张（无 cardKind 的旧卡，不会被判断）入队等待
  const p2 = channel.customerInput({ kind: "confirm", title: "第二张" }, JUDGE_CTX);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].waitingFor, "op-1", "judging 占住队列");
  assert.equal(channel.queuedCount(), 1);
  assert.equal(channel.judgingCount(), 1);

  release!({
    verdict: "manual",
    group: "decision",
    cardKind: "proposal",
    reasonCode: "insufficient-evidence",
    reason: "提案证据不足",
    engine: "claude",
  });
  await flushJudge();
  const o1 = (await p1)!;
  assert.equal(o1.outcome, "declined", "manual ⇒ 自动退回重做（不呈现客户卡）");
  assert.equal(o1.operatorId, "judge:claude", "归因判断引擎");
  assert.match(o1.reason ?? "", /自动决策未通过：证据不足（提案证据不足）/, "原因含映射后的人话与具体理由");
  assert.match(o1.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
  assert.equal(results.length, 0, "manual 不发结果行");
  assert.equal(channel.judgingCount(), 0);
  assert.equal(pushed.length, 1, "队列中的第二张照常呈现（被退回的 op-1 不呈现）");
  assert.equal(pushed[0].id, "op-2");
  assert.equal(channel.pendingCount(), 1, "op-2 active");
  assert.equal(next.length, 0, "declined 不产生下一步");

  assert.equal(channel.respond({ id: "op-2", decision: { kind: "confirm", confirmed: true } }).ok, true);
  await p2;
});

test("allow 代批合成结果：proposal/appointment/acceptance 选项、write confirmed；审计字段有界", async () => {
  const requests: GovernanceJudgeRequest[] = [];
  const judge: GovernanceJudgeFn = async (request) => {
    requests.push(request);
    if (request.cardKind === "appointment") {
      return {
        verdict: "approve",
        group: "decision",
        cardKind: "appointment",
        reasonCode: "sufficient",
        engine: "pi",
        value: { selected: ["role-a", "role-b"] },
        evidence: ["docs/nominations/flow-a-v1.md"],
        durationMs: 9,
      };
    }
    return {
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      reasonCode: "sufficient",
      engine: "pi",
      value: { selected: ["accept"] },
      evidence: ["docs/flows/flow-a.md"],
    };
  };
  const { channel, results, next } = makeJudgeChannel({ enabled: () => true, judge });

  const proposal = await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  assert.deepEqual((proposal as { value: unknown }).value, { selected: ["accept"] });
  assert.equal((proposal as { judge?: { engine?: string } }).judge?.engine, "pi");

  const appointment: CustomerInputRequest = {
    kind: "choice",
    title: "任命",
    cardKind: "appointment",
    flowId: "flow-a",
    multiple: true,
    options: [
      { id: "role-a", label: "A" },
      { id: "role-b", label: "B" },
      { id: "role-c", label: "C" },
    ],
  };
  const o2 = (await channel.customerInput(appointment, { ...JUDGE_CTX, roleId: "nominator" }, {
    cardKind: "appointment",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a", { recommendedRoleIds: ["role-a", "role-b"] }),
  }))!;
  assert.equal(o2.outcome, "answered");
  assert.deepEqual(o2.value, { selected: ["role-a", "role-b"] });
  assert.deepEqual(next.find((entry) => entry.payload.cardKind === "appointment")?.context.targetRoleIds, ["role-a", "role-b"]);

  const acceptance: CustomerInputRequest = {
    kind: "choice",
    title: "验收",
    cardKind: "acceptance",
    flowId: "flow-a",
    options: [{ id: "accept", label: "通过" }, { id: "reject", label: "退回" }],
  };
  const o3 = (await channel.customerInput(acceptance, { ...JUDGE_CTX, roleId: "convener" }, {
    cardKind: "acceptance",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;
  assert.equal(o3.outcome, "answered");
  assert.deepEqual(o3.value, { selected: ["accept"] });

  // 代批结果行与审计：group/cardKind/reason/engine/selected/paths/readCalls/readBytes
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(result.version, 1);
    assert.equal(typeof result.id, "string");
    assert.equal(typeof result.requestId, "string");
    assert.equal(result.reasonCode, "sufficient");
  }
  assert.deepEqual(results[1].selected, ["role-a", "role-b"]);
  assert.equal(o3.judge?.group, "decision");
  assert.equal(o3.judge?.cardKind, "acceptance");
  assert.deepEqual(o3.judge?.evidence, ["docs/flows/flow-a.md"]);
});

test("manual 负向结果（decision/approval 两组）⇒ 自动退回重做：无客户卡、无结果行、原因可操作", async () => {
  for (const group of ["decision", "approval"] as const) {
    const { channel, pushed, results, next } = makeJudgeChannel({
      enabled: () => true,
      judge: async (request) => ({
        verdict: "manual",
        group: request.group,
        cardKind: request.cardKind,
        reasonCode: "not-recommended",
        reason: "应拒绝",
        engine: "claude",
      }),
    });
    const request = group === "decision" ? proposalRequest("flow-a") : writeRequest();
    const meta = {
      cardKind: group === "decision" ? ("proposal" as const) : ("write" as const),
      flowId: "flow-a",
      judgeContext: judgeContextOf("flow-a"),
    };
    const outcome = (await channel.customerInput(request, JUDGE_CTX, meta))!;
    assert.equal(outcome.outcome, "declined", `${group}：manual ⇒ declined（退回发起角色）`);
    assert.equal(outcome.operatorId, "judge:claude", `${group}：归因判断引擎`);
    assert.match(
      outcome.reason ?? "",
      new RegExp(`自动${group === "decision" ? "决策" : "审批"}未通过：候选与推荐/选项不一致（应拒绝）`),
      `${group}：原因含映射后的人话与具体理由`,
    );
    assert.match(outcome.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
    assert.equal(pushed.length, 0, `${group}：不呈现客户卡`);
    assert.equal(results.length, 0, `${group}：不发结果行`);
    assert.equal(next.length, 0, `${group}：declined 不产生下一步`);
    assert.equal(channel.pendingCount(), 0);
    assert.equal(channel.judgingCount(), 0);
    assert.equal(
      channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).expired,
      true,
      `${group}：重复结算不重复回投（同一请求只结算一次）`,
    );
  }
});

test("治理·read-denied 退回原因带出具体路径；无记录如实说明；超长仍限 200（客户反馈 2026-10-18）", async () => {
  const run = async (reason?: string): Promise<string> => {
    const { channel, pushed, results } = makeJudgeChannel({
      enabled: () => true,
      judge: async (request) => ({
        verdict: "manual",
        group: request.group,
        cardKind: request.cardKind,
        reasonCode: "read-denied",
        engine: request.runtime,
        ...(reason !== undefined ? { reason } : {}),
      }),
    });
    const outcome = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
      cardKind: "proposal",
      flowId: "flow-a",
      judgeContext: judgeContextOf("flow-a"),
    }))!;
    assert.equal(pushed.length, 0, "manual ⇒ 自动退回重做（不呈现客户卡）");
    assert.equal(results.length, 0, "manual 不得发结果行");
    assert.equal(outcome.outcome, "declined");
    const text = outcome.reason ?? "";
    const prefix = "自动决策未通过：";
    const suffix = "。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。";
    assert.ok(text.startsWith(prefix) && text.endsWith(suffix), "统一退回文案");
    return text.slice(prefix.length, text.length - suffix.length);
  };

  // ①带具体路径：与 shell 通道同解，原样带出冒号后的内容（去尾）。
  const concrete = "判断读取被拒：.ans/sessions/x.json（应用私有数据，判断侧不开放）、src/foo.txt（敏感文件），无法保证无损判断，已转手动确认。";
  assert.equal(
    await run(concrete),
    "读取被拒：.ans/sessions/x.json（应用私有数据，判断侧不开放）、src/foo.txt（敏感文件），无法保证无损判断",
  );

  // ②无 reason / 不符合约定前缀：如实说明「未记录具体路径」。
  const fallback = "所需项目文件无法读取（未记录具体路径）";
  assert.equal(await run(undefined), fallback, "无 reason 不再只说笼统一句");
  assert.equal(
    await run("判断读取被拒（敏感文件/越界/二进制），无法保证无损判断，已转手动确认。"),
    fallback,
    "无约定前缀（旧式 reason）回落兜底",
  );

  // ③超长：映射输出仍限 200 码点，前缀保留、尾部截断。
  const mapped = await run(`判断读取被拒：${"长".repeat(300)}，无法保证无损判断，已转手动确认。`);
  assert.equal(Array.from(mapped).length, 200, "映射输出限 200 码点");
  assert.equal(mapped, `读取被拒：${"长".repeat(195)}`, "超长截断且保留前缀");
});

test("自动退回文案：人话 reason 以句末标点结尾时不出现「。。」/「。；」", async () => {
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: () => true,
    judge: async (request) => ({
      verdict: "manual",
      group: request.group,
      cardKind: request.cardKind,
      reasonCode: "driver-manual",
      reason: "按 fail-closed 回落客户。",
      engine: request.runtime,
    }),
  });
  const outcome = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;
  assert.equal(outcome.outcome, "declined");
  if (outcome.outcome !== "declined") return;
  assert.equal(
    outcome.reason,
    "自动决策未通过：按 fail-closed 回落客户。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。",
    "尾部句号去掉一个再接正文",
  );
  assert.ok(!String(outcome.reason).includes("。；"), "不出现「。；」");
  assert.ok(!String(outcome.reason).includes("。。"), "不出现「。。」");
  assert.equal(pushed.length, 0, "不呈现客户卡");
  assert.equal(results.length, 0);
});

test("结果行投达失败（row-failed）⇒ 自动退回重做：无客户卡、无结果行、原因可操作", async () => {
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: () => true,
    judge: approveJudge([]),
    emit: () => { throw new Error("窗口已关闭"); },
  });
  const outcome = (await channel.customerInput(writeRequest(), JUDGE_CTX, {
    cardKind: "write",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;
  assert.equal(outcome.outcome, "declined", "结果行投达失败：不再甩回客户，自动退回重做");
  assert.equal(outcome.operatorId, "judge:claude");
  assert.match(outcome.reason ?? "", /自动审批未通过：判断结果无法在聊天中显示/);
  assert.match(outcome.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
  assert.equal(pushed.length, 0, "不呈现客户卡");
  assert.equal(results.length, 0, "结果行未投达（0 行）");
  assert.equal((outcome as { judge?: unknown }).judge, undefined, "不是客户/代批 answered");
});

test("判断中关闭开关 ⇒ 再查一次：原卡 + switch-off 提示，不发结果行", async () => {
  let enabled = true;
  let release: ((outcome: GovernanceJudgeOutcome) => void) | undefined;
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: (group) => group === "decision" && enabled,
    judge: () => new Promise((resolve) => { release = resolve; }),
  });
  const p = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  assert.equal(channel.judgingCount(), 1);
  enabled = false; // 判断期间关闭
  release!({ verdict: "approve", group: "decision", cardKind: "proposal", reasonCode: "sufficient", engine: "claude", value: { selected: ["accept"] } });
  await flushJudge();
  assert.equal(pushed.length, 1, "开关关闭 ⇒ 原卡");
  assert.match(String(pushed[0].judgeNotice), /你已关闭对应开关/);
  assert.equal(results.length, 0);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await p;
});

test("按组退回互不影响：approval 组 manual 自动退回，decision 组仍可代批", async () => {
  const requests: GovernanceJudgeRequest[] = [];
  const judge: GovernanceJudgeFn = async (request) => {
    requests.push(request);
    if (request.group === "approval") {
      return { verdict: "manual", group: "approval", cardKind: request.cardKind, reasonCode: "artifact-not-read", reason: "未读物证", engine: "claude" };
    }
    return { verdict: "approve", group: "decision", cardKind: request.cardKind, reasonCode: "sufficient", engine: "claude", value: { selected: ["accept"] } };
  };
  const { channel, pushed, results } = makeJudgeChannel({ enabled: () => true, judge });
  // 不同 projectRoot：互不排队（同一项目一卡只影响同项目）。
  const pWrite = channel.customerInput(writeRequest(), { ...JUDGE_CTX, projectRoot: "/p-write" }, {
    cardKind: "write",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  const pProposal = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  await flushJudge();
  assert.equal(pushed.length, 0, "approval 组 manual 也不呈现客户卡");
  assert.equal(results.length, 1, "decision 组仍代批（1 行）");
  assert.equal(results[0].group, "decision");
  assert.equal((await pProposal)!.outcome, "answered");
  const writeOutcome = (await pWrite)!;
  assert.equal(writeOutcome.outcome, "declined", "approval 组 manual ⇒ 自动退回重做");
  assert.match(writeOutcome.reason ?? "", /自动审批未通过：判断未读取必需的项目文件（未读物证）/);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).expired, true, "退回的卡从未呈现");
});

test("replayPending 不重新判断；rejectAllPending 结算 judging 为 declined，迟到结果丢弃", async () => {
  let release: ((outcome: GovernanceJudgeOutcome) => void) | undefined;
  const requests: GovernanceJudgeRequest[] = [];
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: () => true,
    judge: (request) => {
      requests.push(request);
      return new Promise((resolve) => { release = resolve; });
    },
  });
  const p = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  assert.equal(channel.replayPending(), 0, "judging 不在 pending，重放不呈现");
  assert.equal(requests.length, 1, "replay 不重新判断");
  assert.equal(channel.judgingCount(), 1);
  channel.rejectAllPending("窗口已关闭，未获同意（fail-closed）");
  const outcome = (await p)!;
  assert.equal(outcome.outcome, "declined");
  // 迟到结果：state 已 done ⇒ 丢弃（不呈现、不发结果行、不改结算）
  release!({ verdict: "approve", group: "decision", cardKind: "proposal", reasonCode: "sufficient", engine: "claude", value: { selected: ["accept"] } });
  await flushJudge();
  assert.equal(pushed.length, 0);
  assert.equal(results.length, 0);
  assert.equal(channel.judgingCount(), 0);
});

test("通道层防御超时：判断超时 ⇒ 自动退回重做（无客户卡、原因含实际时长，fail-closed）", async () => {
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: () => true,
    judge: () => new Promise(() => {}),
    timeoutMs: 20,
  });
  const outcome = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;
  assert.equal(outcome.outcome, "declined");
  assert.match(outcome.reason ?? "", /自动决策未通过：判断超时（>20ms）/);
  assert.match(outcome.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
  assert.equal(pushed.length, 0, "超时也不呈现客户卡（勾选后不用客户管）");
  assert.equal(results.length, 0);
});

test("治理 judge 通道超时：默认 135s（driver 120s+15s）；由 ANS_GOVERNANCE_JUDGE_TIMEOUT_MS 派生；非法回 135s", async () => {
  // 结构性：driver 120s 时通道 = 135s，绝不让通道先杀 driver。
  assert.equal(DEFAULT_GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MS, 135_000);
  assert.equal(GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_ENV, "ANS_GOVERNANCE_JUDGE_TIMEOUT_MS");
  assert.equal(resolveChannelJudgeTimeoutMs(undefined, {}), 135_000, "缺省 135s");
  assert.equal(resolveChannelJudgeTimeoutMs(undefined, { ANS_GOVERNANCE_JUDGE_TIMEOUT_MS: "120000" }), 135_000, "driver 120s ⇒ 通道 135s");
  assert.equal(resolveChannelJudgeTimeoutMs(undefined, { ANS_GOVERNANCE_JUDGE_TIMEOUT_MS: "60000" }), 75_000, "env 覆盖 +15s");
  assert.equal(resolveChannelJudgeTimeoutMs(undefined, { ANS_GOVERNANCE_JUDGE_TIMEOUT_MS: "20" }), 15_020, "余量恒为 15s");
  for (const bad of ["abc", "0", "-1", "1.5", "", " "]) {
    assert.equal(
      resolveChannelJudgeTimeoutMs(undefined, { ANS_GOVERNANCE_JUDGE_TIMEOUT_MS: bad }),
      135_000,
      `非法 env 回 135s：${JSON.stringify(bad)}`,
    );
  }
  assert.equal(resolveChannelJudgeTimeoutMs(20, {}), 20, "显式 timeoutMs 原样使用（测试/宿主）");
  assert.equal(formatJudgeTimeoutMs(135_000), "135s");
  assert.equal(formatJudgeTimeoutMs(75_000), "75s");
  assert.equal(formatJudgeTimeoutMs(35), "35ms");
});

test("single/su、缺 judgeContext、事实不可用：前二者旧路径零变化；事实不可用自动退回重做", async () => {
  let calls = 0;
  const judge: GovernanceJudgeFn = async (request) => {
    calls += 1;
    return { verdict: "approve", group: "decision", cardKind: "proposal", reasonCode: "sufficient", engine: "claude", value: { selected: ["accept"] } };
  };
  const { channel, pushed } = makeJudgeChannel({ enabled: () => true, judge });

  // single：即使开关开也不判断
  const single = channel.customerInput(proposalRequest("flow-a"), { ...JUDGE_CTX, governanceModel: "single" }, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  });
  assert.equal(calls, 0, "single/su 不代批");
  assert.equal(pushed.length, 1);
  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await single;

  // 缺 judgeContext（应用事实未接线）：不判断、无 notice
  const missing = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, { cardKind: "proposal", flowId: "flow-a" });
  assert.equal(calls, 0);
  assert.equal(pushed.length, 2);
  assert.equal(pushed[1].judgeNotice, undefined);
  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await missing;

  // 事实不可用（run-role 计算失败）：不调用模型；勾选后自动退回重做（不再呈现客户卡）。
  const unavailable = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: { ...judgeContextOf("flow-a"), unavailableReason: "ledger unreadable" },
  }))!;
  assert.equal(calls, 0, "事实不可用时不浪费模型调用");
  assert.equal(pushed.length, 2, "事实不可用不再呈现第三张卡");
  assert.equal(unavailable.outcome, "declined");
  assert.match(unavailable.reason ?? "", /自动决策未通过：治理事实不可读（ledger unreadable）/);
  assert.match(unavailable.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
  assert.equal(channel.pendingCount(), 0);
});

test("结果行人话摘要：四类卡的代批行含「judge 代批 · 代审批/代决策」", () => {
  const base = { version: 1 as const, id: "gj", requestId: "op", anchorKey: "k", toolCallId: "t", roleId: "r", at: "x", engine: "claude" as const, reasonCode: "sufficient" };
  assert.match(judgeResultSummary({ ...base, group: "decision", cardKind: "proposal", flowId: "flow-a" }), /judge 代批 · 代决策：接受提案（accept）/);
  assert.match(judgeResultSummary({ ...base, group: "decision", cardKind: "appointment", selected: ["a", "b"], flowId: "flow-a" }), /任命 a、b/);
  assert.match(judgeResultSummary({ ...base, group: "decision", cardKind: "acceptance", flowId: "flow-a" }), /验收通过/);
  assert.match(judgeResultSummary({ ...base, group: "approval", cardKind: "write", paths: ["p1", "p2", "p3", "p4"] }), /代审批：确认写入 4 个路径/);
});

test("intent-confirm（2026-10-20 纳入 decision 组）：开关开启 ⇒ 判断调用、approve confirm 自动作答（零客户卡/结果行/审计）；开关关闭 ⇒ 原卡手答（confirm/revise/取消）；manual ⇒ 自动退回不伪造同意", async () => {
  const card = (): CustomerInputRequest => ({
    kind: "choice",
    title: "需求确认",
    cardKind: "intent-confirm",
    flowId: "flow-i",
    options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }],
  });
  const ctx = { roleId: "liaison", projectRoot: "/p", runtime: "claude" as const, governanceModel: "trio" as const };
  const meta = { cardKind: "intent-confirm" as const, flowId: "flow-i", judgeContext: judgeContextOf("flow-i") };

  // ① 开关开启（decision）：判断调用；approve confirm ⇒ 自动作答（无客户卡、结果行/审计按既有 approve 路径）。
  const requests: GovernanceJudgeRequest[] = [];
  const on = makeJudgeChannel({
    enabled: (group) => group === "decision",
    judge: async (request) => {
      requests.push(request);
      return {
        verdict: "approve",
        group: request.group,
        cardKind: request.cardKind,
        reasonCode: "sufficient",
        engine: request.runtime,
        value: { selected: ["confirm"] },
        durationMs: 7,
      };
    },
  });
  const answered = on.channel.customerInput(card(), ctx, meta);
  await flushJudge();
  assert.equal(requests.length, 1, "intent-confirm 已纳入 decision 组：开关开启即调用判断 agent");
  assert.equal(requests[0].group, "decision", "分组＝decision（客户 2026-10-20「勾了替我决策就不用我管」）");
  assert.equal(requests[0].cardKind, "intent-confirm", "卡片种类如实传给判断");
  assert.equal(on.pushed.length, 0, "代批成功 ⇒ 不呈现客户卡");
  const auto = (await answered)!;
  assert.equal(auto.outcome, "answered", "approve confirm ⇒ 自动作答");
  assert.deepEqual(auto.value, { selected: ["confirm"] }, "自动作答 confirm");
  assert.equal(auto.operatorId, "judge:claude", "审计标明由 judge 代作（不是客户手答）");
  assert.equal(auto.judge?.cardKind, "intent-confirm");
  assert.deepEqual(auto.judge?.selected, ["confirm"]);
  assert.equal(on.results.length, 1, "结果行按既有 judge approve 路径恰一条");
  assert.deepEqual(on.results[0].selected, ["confirm"]);
  assert.equal(on.results[0].group, "decision");
  assert.equal(on.channel.pendingCount(), 0, "无挂起卡");

  // ② 开关关闭：不判断、原卡照旧；confirm / revise / 取消三条路径都交回客户原样结算。
  let offCalls = 0;
  const off = makeJudgeChannel({
    enabled: () => false,
    judge: async () => { offCalls += 1; throw new Error("开关关闭时不应调用判断"); },
  });
  const p1 = off.channel.customerInput(card(), ctx, meta);
  await flushJudge();
  assert.equal(offCalls, 0, "开关关闭 ⇒ 不判断");
  assert.equal(off.pushed.length, 1, "开关关闭 ⇒ 客户卡照旧呈现");
  assert.equal(off.results.length, 0, "无 judge 结果行");
  assert.equal(off.channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["confirm"] } }).ok, true);
  const firstOutcome = (await p1)!;
  assert.equal(firstOutcome.outcome, "answered");
  assert.deepEqual((firstOutcome as { value?: unknown }).value, { selected: ["confirm"] }, "客户手答 confirm 原样结算");
  const p2 = off.channel.customerInput(card(), ctx, meta);
  await flushJudge();
  assert.equal(off.pushed.length, 2);
  assert.equal(off.channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["revise"] } }).ok, true);
  const revised = (await p2)!;
  assert.equal(revised.outcome, "answered");
  assert.deepEqual((revised as { value?: unknown }).value, { selected: ["revise"] }, "revise 仍交回客户（判断不代选）");
  assert.equal((revised as { judge?: unknown }).judge, undefined, "手答无 judge 审计");
  const p3 = off.channel.customerInput(card(), ctx, meta);
  await flushJudge();
  assert.equal(off.pushed.length, 3);
  assert.equal(off.channel.respond({ id: "op-3", decision: { kind: "choice", cancelled: true } }).ok, true);
  assert.equal((await p3)!.outcome, "declined", "取消 = 未获同意（不伪造客户同意）");

  // ③ 判断 manual（无法核对/偏离）：不呈现客户卡、自动退回发起角色重做（2026-10-19 总原则），
  //    绝不伪造客户同意或选项。
  const manual = makeJudgeChannel({
    enabled: (group) => group === "decision",
    judge: async (request) => ({
      verdict: "manual",
      group: request.group,
      cardKind: request.cardKind,
      reasonCode: "insufficient-evidence",
      reason: "意图摘要与客户当前要求不一致",
      engine: request.runtime,
    }),
  });
  const rework = (await manual.channel.customerInput(card(), ctx, meta))!;
  await flushJudge();
  assert.equal(manual.pushed.length, 0, "manual ⇒ 不呈现客户卡（自动退回重做）");
  assert.equal(rework.outcome, "declined", "未获客户同意 ⇒ declined（不伪造 answered）");
  assert.match(rework.reason ?? "", /本次自动判断未通过\/未完成，已拒绝/, "可操作原因如实回投发起角色");
  assert.equal((rework as { value?: unknown }).value, undefined, "绝不伪造客户同意/选项");
  assert.equal((rework as { judge?: unknown }).judge, undefined, "manual 不产生代批审计");
  assert.equal(manual.results.length, 0, "manual 不发 approve 结果行");
});

test("SessionManager：trio 会话注入 governanceJudge 上下文；single/su 不构造", async () => {
  const listing = trioMirrorListing();
  const judge: GovernanceJudgeFn = async (request) => ({
    verdict: "manual",
    group: request.group,
    cardKind: request.cardKind,
    reasonCode: "insufficient-evidence",
    engine: "claude",
  });
  let factoryCalls = 0;
  let captured: { customerInput?: CustomerInputFn } | undefined;
  const ctxSeen: { governanceModel?: string; governanceJudge?: unknown; turnText?: string }[] = [];
  const metadataSeen: unknown[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "rapporteur") captured = input as unknown as { customerInput?: CustomerInputFn };
      return quietHandle();
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: () => {},
    customerInput: (_req, ctx, metadata) => {
      ctxSeen.push(ctx as { governanceModel?: string; governanceJudge?: unknown; turnText?: string });
      metadataSeen.push(metadata);
      return { outcome: "declined", reason: "替身：拒绝" };
    },
    createGovernanceJudge: () => {
      factoryCalls += 1;
      return judge;
    },
  });
  assert.equal((await mgr.open({ projectRoot: listing.projectRoot, roleId: "rapporteur", runtime: "demo" })).ok, true);
  assert.equal(factoryCalls, 1, "trio + 通道已接 ⇒ 构造每会话闭包");
  const judgeContext = judgeContextOf("flow-a");
  await captured!.customerInput!(
    proposalRequest("flow-a"),
    { cardKind: "proposal", flowId: "flow-a", judgeContext },
  );
  assert.equal(ctxSeen[0].governanceModel, "trio");
  assert.equal(ctxSeen[0].governanceJudge, judge);
  assert.deepEqual((metadataSeen[0] as { judgeContext?: unknown }).judgeContext, judgeContext, "judgeContext 原样透传到通道");
  await mgr.stop(null);

  // single/su：不构造、ctx 无 judge
  const single: ProjectListing = {
    projectRoot: "/single-judge-session",
    roles: [{ roleId: "su", cardPath: "", boundaryPath: "", cardText: "# su", boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } }, builtIn: true }],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
    governanceModel: "single",
  };
  let singleFactoryCalls = 0;
  let suInput: { customerInput?: CustomerInputFn } | undefined;
  const singleCtx: { governanceJudge?: unknown }[] = [];
  const singleMgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "su") suInput = input as unknown as { customerInput?: CustomerInputFn };
      return quietHandle();
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === single.projectRoot ? single : undefined),
    emitEvent: () => {},
    customerInput: (_req, ctx) => {
      singleCtx.push(ctx as { governanceJudge?: unknown });
      return { outcome: "declined", reason: "替身：拒绝" };
    },
    createGovernanceJudge: () => {
      singleFactoryCalls += 1;
      return judge;
    },
  });
  assert.equal((await singleMgr.open({ projectRoot: single.projectRoot, roleId: "su", runtime: "demo" })).ok, true);
  assert.equal(singleFactoryCalls, 0, "single/su 不构造治理判断闭包");
  await suInput!.customerInput!({ kind: "confirm", title: "旧卡" });
  assert.equal(singleCtx[0].governanceJudge, undefined);
  await singleMgr.stop(null);
});

// ————— ⑥ 2026-10-18 收尾推进：流程全部完成后派 Rapporteur 出验收（触发门） —————

function flowMarkdown(steps: Array<[string, string]>): string {
  return [
    "# flow-a",
    "",
    "| 步骤 | 状态 |",
    "| --- | --- |",
    ...steps.map(([id, status]) => `| ${id} | ${status} |`),
  ].join("\n");
}

const DISPATCHED_IMPL = { kind: "dispatch.accepted", flowId: "flow-a", stepId: "impl" };

test("收尾触发门：执行步骤全 done 才放行；验收步骤单列（pending 可派、done/缺失/已验收不派）", () => {
  const parsed = parseFlowStepStatuses(flowMarkdown([["impl", "done"], ["verify", "done"], ["acceptance", "pending"]]));
  assert.equal(parsed.wellFormed, true);
  assert.deepEqual(parsed.steps, [
    { id: "impl", status: "done" },
    { id: "verify", status: "done" },
    { id: "acceptance", status: "pending" },
  ]);
  const ledger = {
    errors: [],
    entries: [DISPATCHED_IMPL, { kind: "dispatch.accepted", flowId: "flow-a", stepId: "verify" }],
  };
  assert.equal(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["verify", "done"], ["acceptance", "pending"]]), ledger),
    undefined,
    "执行步骤全 done + 验收 pending ⇒ 允许派 Rapporteur（验收鸡生蛋修复）",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["verify", "pending"], ["acceptance", "pending"]]), ledger) ?? "",
    /未完成\/阻塞\/待派发步骤（verify=pending）/,
    "执行步骤未完成：不派",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["verify", "blocked"], ["acceptance", "pending"]]), ledger) ?? "",
    /verify=blocked/,
    "执行步骤阻塞：不派",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["acceptance", "pending"]]), { errors: [], entries: [] }) ?? "",
    /缺少 dispatch\.accepted 记录（impl）/,
    "执行步骤缺派发记录：不派",
  );
  // 验收步骤自身：缺失 / 已 done / 已有验收决定各自阻止；pending 放行（见上）。
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"]]), { errors: [], entries: [DISPATCHED_IMPL] }) ?? "",
    /流程单缺少验收步骤/,
    "缺验收步骤：fail-closed 不派",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["acceptance", "done"]]), { errors: [], entries: [DISPATCHED_IMPL] }) ?? "",
    /验收步骤已完成/,
    "验收步骤已 done：不重复派",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["acceptance", "pending"]]), {
      errors: [],
      entries: [DISPATCHED_IMPL, { kind: "customer.decision", flowId: "flow-a", decisionKind: "acceptance", customerDecision: "accepted" }],
    }) ?? "",
    /已有验收决定/,
    "已验收：不重复派",
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"], ["acceptance", "pending"]]), {
      errors: [],
      entries: [DISPATCHED_IMPL, { kind: "customer.decision", flowId: "flow-a", decisionKind: "unclassified", customerDecision: "none" }],
    }) ?? "",
    /仍有未结算的决定/,
    "未结算决定：不派",
  );
  assert.match(
    flowCompletionIssue("flow-a", "没有步骤表", { errors: [], entries: [DISPATCHED_IMPL] }) ?? "",
    /缺少可解析的步骤表/,
  );
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["impl", "done"]]), { errors: ["bad line"], entries: [] }) ?? "",
    /账本不可读/,
  );

  // 2026-10-18 真机流程单：nomination/delivery 是执行步骤，verification 是验收步骤（旧版写 acceptance）。
  const realLedger = {
    errors: [],
    entries: [
      { kind: "dispatch.accepted", flowId: "flow-a", stepId: "nomination" },
      { kind: "dispatch.accepted", flowId: "flow-a", stepId: "delivery" },
    ],
  };
  const realFlow = (verificationStatus: string | null) =>
    flowMarkdown([
      ["nomination", "done"],
      ["delivery", "done"],
      ...(verificationStatus === null ? [] : [["verification", verificationStatus] as [string, string]]),
    ]);
  assert.equal(flowCompletionIssue("flow-a", realFlow("pending"), realLedger), undefined, "verification pending ⇒ 可派 Proof");
  assert.equal(flowCompletionIssue("flow-a", realFlow("in-progress"), realLedger), undefined, "verification 未 done 也允许派");
  assert.match(flowCompletionIssue("flow-a", realFlow("done"), realLedger) ?? "", /验收步骤已完成/, "verification done：不重复派");
  assert.match(flowCompletionIssue("flow-a", realFlow(null), realLedger) ?? "", /流程单缺少验收步骤/, "缺验收步骤：不派");
  assert.match(
    flowCompletionIssue("flow-a", flowMarkdown([["nomination", "done"], ["delivery", "pending"], ["verification", "pending"]]), realLedger) ?? "",
    /delivery=pending/,
    "执行步骤未完成：不派",
  );
  assert.match(
    flowCompletionIssue("flow-a", realFlow("pending"), { errors: [], entries: [realLedger.entries[0]!] }) ?? "",
    /缺少 dispatch\.accepted 记录（delivery）/,
    "执行步骤缺派发：不派",
  );
});

// ————— ⑥-补 2026-10-19 真机：流程单状态写作「状态 + 说明」（done（证据）/pending（不由统筹派发）） —————

test("流程步骤状态首词规范化：done 变体（含 Markdown 强调/代码标记）视为完成；pending/delivered/空不视为完成", () => {
  for (const status of [
    "done",
    "done（证据）",
    "done(evidence)",
    "Done",
    "DONE",
    "done：xxx",
    "done 有落盘/回交证据",
    // 2026-10-19 真机：状态列写成 Markdown 强调/代码标记（R2 流程单实际写法 `**done**（…）`）。
    "**done**（证据）",
    "**done**（有落盘/回交证据；125/125 为角色自报）",
    "**done**",
    "**Done**（…）",
    "__done__",
    "_done_",
    "`done`",
    "`done`（证据）",
    "** done **",
  ]) {
    assert.equal(normalizeFlowStepStatus(status), "done", `${status} 应规范化为 done`);
  }
  for (const status of ["pending（…）", "pending（不由统筹派发）", "delivered（…）", "in-progress（…）", "blocked", "", "   ", "**", "``", "__"]) {
    assert.notEqual(normalizeFlowStepStatus(status), "done", `${status === "" || status.trim() === "" ? "（空）" : status} 不应视为 done`);
  }
  assert.equal(normalizeFlowStepStatus("**pending**（等待回交）"), "pending", "强调标记不改变 pending 的判定");
  assert.equal(normalizeFlowStepStatus("**superseded**：并入 `integration-e2e-v2`"), "superseded", "标记须剥离后才能识别 superseded");
});

test("收尾触发门：状态按首词判定（done（…）/Done/done：xxx 均可派；pending/delivered/空不放行）", () => {
  const ledger = {
    errors: [],
    entries: [DISPATCHED_IMPL, { kind: "dispatch.accepted", flowId: "flow-a", stepId: "verify" }],
  };
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done（有落盘/回交证据）"], ["verify", "Done"], ["acceptance", "pending（不由统筹批）"]]),
      ledger,
    ),
    undefined,
    "执行步骤写 done（…）/Done + 验收 pending（…）⇒ 可派验收",
  );
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done(evidence)"], ["verify", "done：回交报告已读"], ["acceptance", "pending(awaiting)"]]),
      ledger,
    ),
    undefined,
    "半角括号/冒号说明同样可派",
  );
  for (const status of ["pending（…）", "delivered（…）", ""]) {
    assert.match(
      flowCompletionIssue("flow-a", flowMarkdown([["impl", status], ["verify", "done"], ["acceptance", "pending（…）"]]), ledger) ?? "",
      /流程仍有未完成\/阻塞\/待派发步骤（impl=/,
      `${status === "" ? "（空）" : status} 不放行`,
    );
  }
  assert.match(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done"], ["verify", "done"], ["acceptance", "done（客户已在验收卡选择 accept）"]]),
      ledger,
    ) ?? "",
    /验收步骤已完成/,
    "验收步骤 done（…）视为已完成，不重复派",
  );
});

// ————— ⑥-补2 2026-10-19 真机：Markdown 强调状态 + superseded 作废步骤（R2 自动派发被卡） —————
// 流程单实际写成 `| **done**（证据…） |`；旧解析取首词得到 `**done**`，所有 done 步骤被判未完成，
// 自动验收派发门永远打不开。另有 `delivery-frontend-v2-evidence` 状态 `**superseded**：…`（并入
// integration-e2e-v2），旧逻辑把它当执行步骤，同样挡门。

test("收尾触发门：Markdown 强调/代码标记状态（**done**/__done__/`done`）按 done 放行", () => {
  const ledger = {
    errors: [],
    entries: [DISPATCHED_IMPL, { kind: "dispatch.accepted", flowId: "flow-a", stepId: "verify" }],
  };
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "**done**（有落盘/回交证据）"], ["verify", "__done__"], ["acceptance", "pending（不由统筹批）"]]),
      ledger,
    ),
    undefined,
    "**done**（…）/__done__ ⇒ 可派验收（旧解析会得到 **done**/__done__ 而全判未完成）",
  );
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "`done`"], ["verify", "**Done**：回交报告已读"], ["acceptance", "pending"]]),
      ledger,
    ),
    undefined,
    "反引号 done / **Done** + 说明同样放行",
  );
  assert.match(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done"], ["verify", "done"], ["acceptance", "**done**（客户已在验收卡选择 accept）"]]),
      ledger,
    ) ?? "",
    /验收步骤已完成/,
    "验收步骤 **done**（…）视为已完成，不重复派",
  );
});

test("收尾触发门：superseded/cancelled 执行步骤不阻塞、不要求证据，但不算 done", () => {
  const ledger = { errors: [], entries: [DISPATCHED_IMPL] };
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([
        ["impl", "**done**（有落盘/回交证据）"],
        ["frontend-evidence", "**superseded**：并入 integration-e2e-v2"],
        ["acceptance", "pending（不由统筹批）"],
      ]),
      ledger,
    ),
    undefined,
    "superseded 步骤没有 dispatch 证据也不阻塞验收派发",
  );
  assert.equal(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done"], ["alt", "cancelled（客户取消）"], ["acceptance", "pending"]]),
      ledger,
    ),
    undefined,
    "cancelled 步骤同样视为非执行步骤",
  );
  // 作废步骤不算 done：pending/dispatched 仍阻塞；错误详情注明跳过。
  const blocked =
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([
        ["impl", "**pending**（等待回交）"],
        ["frontend-evidence", "**superseded**：并入 integration-e2e-v2"],
        ["acceptance", "pending"],
      ]),
      ledger,
    ) ?? "";
  assert.match(blocked, /未完成\/阻塞\/待派发步骤（impl=pending\*\*（等待回交））/, "pending（含标记）仍阻塞");
  assert.match(
    blocked,
    /已跳过作废步骤（frontend-evidence=superseded\*\*：并入 integration-e2e-v2）/,
    "错误详情注明跳过的作废步骤",
  );
  assert.match(
    flowCompletionIssue(
      "flow-a",
      flowMarkdown([["impl", "done"], ["verify", "dispatched（已派发，未见回交）"], ["acceptance", "pending"]]),
      ledger,
    ) ?? "",
    /verify=dispatched（已派发，未见回交）/,
    "dispatched 仍视为未完成（派发 ≠ 完成）",
  );
});

// 真实 R2 流程单（/Users/wangzhongren/code/vibeingcode/ans-testbed/library-lending-live/docs/flows/
// library-lending-v2.md 的步骤表，2026-10-19 缺陷现场原文）：状态全部是 `**done**（…）` 强调写法，
// 且 `delivery-frontend-v2-evidence` 已 `**superseded**：…`（并入 integration-e2e-v2）。旧解析把
// `**done**` 原样比较，所有 done 步骤都被判未完成，自动验收派发门永远打不开。
const LIBRARY_V2_FLOW_ID = "library-lending-v2";

const LIBRARY_V2_STEP_TABLE: ReadonlyArray<readonly [id: string, description: string, executor: string, status: string]> = [
  ["nomination", "提名：Crew 读提案给出候选角色 → 客户任命", "Crew / 组队（应用派发）＋ 客户", "**done**（客户已任命 backend / frontend / test）"],
  [
    "contract-freeze-v2",
    "契约冻结 `docs/contracts/library-lending-api-v2.md`",
    "Draft / 提案（治理角色）",
    "**done**（`contractVersion: 2` · `schemaVersion: 2` · `status: frozen-v2`，含 §1 schema、§2 预约、§3 续借、§4 搜索分页、§5 CSV、§7 错误码 30、§9 迁移/回滚、§11 并发、§12 负例清单）",
  ],
  [
    "delivery-server-v2",
    "服务端（M2）：模块/迁移/配置/路由/日志/README",
    "backend",
    "**done**（回执齐备：6 新增 + 14 修订；迁移 v1→v2 含 `.bak.1.<ts>`；真实启动 18092/18093；预约队列/续借/搜索分页/CSV/并发/负例实测；**既有 155 用例 151 pass / 4 fail，4 项均为 test 侧 v1 版本断言，非行为回归**）",
  ],
  [
    "delivery-frontend-v2",
    "前端（M3）：预约/续借/搜索分页/导出 UI",
    "frontend",
    "**done**（回执：`public/assets/{api,app,styles}` + `index.html` 全在 `public/**`，无根路径文件；四段浏览器实测 17/17、16/17、30/32、17/17，**3 处 FAIL 均为其自身断言写法错误并已打印实际值**；静态门 8/8、6/6；截图在 `/tmp`，不可久留）",
  ],
  [
    "delivery-tests-v2",
    "测试（M4）：矩阵/负例/并发/回滚演练；既有 155 保持全绿",
    "test",
    "**done**（回执 + 我方核对新增文件在盘：**308 tests / 308 pass / fail 0 / exit 0**，新增 153 条；4 处版本断言改为派生 `CURRENT_SCHEMA_VERSION`；TEST-MATRIX 增 §10–§13）",
  ],
  [
    "docs-note-error-code-count",
    "文档登记：README 记「契约 §7 写 30、逐码核对 29、行为无误」（客户方案 b）",
    "backend",
    "**done**（README 4 处 30/22 → 29/21；新增差异登记引用块 + §9 第 13 条二次索引；未改代码/测试/契约）",
  ],
  [
    "delivery-frontend-v2-evidence",
    "（不派）前端落盘证据补充",
    "frontend",
    "**superseded**：并入 `integration-e2e-v2`，由 test 在 `test/tools/` 产落盘脚本 + 持久截图",
  ],
  [
    "integration-e2e-v2",
    "集成与端到端（M5 证据）：真实启动 + v2 新链路 + 旧行为回归 + 落盘截图",
    "test",
    "**done**（回执 + 我方核对产物在盘：live-e2e-v2 **238/238 PASS**、浏览器演示 **88/88 PASS**、全量套件仍 **308/308 exit 0**；证据全部在 `test/**`）",
  ],
  ["verification", "验收前验证（M6）：Proof 复核 + 亲自真实启动演示", "Proof / `verifier`（治理角色）", "pending"],
  ["acceptance", "验收卡：Proof 发起，客户决定", "Proof ＋ 客户", "pending"],
];

function libraryV2FlowMarkdown(): string {
  return [
    "---",
    `flowId: ${LIBRARY_V2_FLOW_ID}`,
    "contract: docs/contracts/library-lending-api-v2.md       # frozen-v2（已冻结）",
    "---",
    "",
    "# 流程单：library-lending-v2（变更需求 1：预约 / 续借 / 目录搜索分页 / 借阅 CSV 导出）",
    "",
    "| stepId | 步骤 | 执行方 | 状态 |",
    "| --- | --- | --- | --- |",
    ...LIBRARY_V2_STEP_TABLE.map(([id, description, executor, status]) => `| ${id} | ${description} | ${executor} | ${status} |`),
  ].join("\n");
}

/** 同形账本：治理步骤按客户决定/产物证据，交付步骤按 dispatch.accepted；作废步骤不要求任何证据。 */
function libraryV2Ledger(omitDispatchStepId?: string): { errors: string[]; entries: FlowCompletionLedgerEntryLike[] } {
  const dispatchSteps = ["delivery-server-v2", "delivery-frontend-v2", "delivery-tests-v2", "docs-note-error-code-count", "integration-e2e-v2"].filter(
    (stepId) => stepId !== omitDispatchStepId,
  );
  return {
    errors: [],
    entries: [
      ...dispatchSteps.map((stepId) => ({ kind: "dispatch.accepted", flowId: LIBRARY_V2_FLOW_ID, stepId, actorRoleId: "app" })),
      {
        kind: "customer.decision",
        flowId: LIBRARY_V2_FLOW_ID,
        stepId: "nomination",
        decisionKind: "appointment",
        customerDecision: "appointed",
      },
      { kind: "artifact.observed", flowId: LIBRARY_V2_FLOW_ID, artifactPath: "docs/contracts/library-lending-api-v2.md" },
    ],
  };
}

test("真实 R2 流程单（**done**（…）+ superseded）：新解析下可派验收，不再把所有 done 判未完成", () => {
  const markdown = libraryV2FlowMarkdown();
  const parsed = parseFlowStepStatuses(markdown);
  assert.equal(parsed.wellFormed, true);
  assert.deepEqual(
    parsed.steps.map((step) => step.id),
    LIBRARY_V2_STEP_TABLE.map(([id]) => id),
    "四列表头（stepId|步骤|执行方|状态）下仍取 stepId 作 id",
  );
  for (const [id, , , status] of LIBRARY_V2_STEP_TABLE) {
    if (status.startsWith("**done**")) {
      assert.equal(normalizeFlowStepStatus(status), "done", `${id} 的 **done**（…）应归一化为 done`);
    }
  }
  assert.equal(normalizeFlowStepStatus("**superseded**：并入 `integration-e2e-v2`"), "superseded");
  assert.equal(
    flowCompletionIssue(LIBRARY_V2_FLOW_ID, markdown, libraryV2Ledger()),
    undefined,
    "执行步骤全部 **done**（…）+ superseded 作废步骤 + verification/acceptance pending ⇒ 可派验收（缺陷现场应放行）",
  );
  const withoutFrontendDispatch = flowCompletionIssue(LIBRARY_V2_FLOW_ID, markdown, libraryV2Ledger("delivery-frontend-v2")) ?? "";
  assert.match(
    withoutFrontendDispatch,
    /缺少 dispatch\.accepted 记录（delivery-frontend-v2）/,
    "只缺真实证据时如实报证据缺口",
  );
  assert.doesNotMatch(withoutFrontendDispatch, /流程仍有未完成\/阻塞\/待派发步骤/, "不得再把 **done**（…）判成未完成");
});

// 真实 R2 流程单（/Users/wangzhongren/code/vibeingcode/ans-testbed/ticket-desk-live/docs/flows/ticket-desk-r2.md
// 的步骤表，2026-10-19 10:54 缺陷现场原文：verification/acceptance 仍为 pending；此后真机流程单已推进为
// done，本夹具保留缺陷现场快照以覆盖「状态带说明 + 待派验收」这一回归面）。
// 状态列全部是「状态 + 说明」写法。
const REAL_R2_STEP_TABLE: ReadonlyArray<readonly [id: string, description: string, status: string]> = [
  ["nomination", "提名：Crew / 组队 读取提案并给出候选角色", "done（`docs/nominations/ticket-desk-r2-v1.md`；推荐集 = 既有三角色，不新增角色）"],
  ["role-readiness", "角色就绪：客户任命决定 + 角色卡就绪确认", "done（客户经任命卡确认沿用 backend / frontend / test；本轮不新增角色、不改卡）"],
  ["contract-freeze-v2", "冻结 API 契约 v2 到 `docs/contracts/ticket-desk-api-v2.md`", "done（frozen-v2 / supersedes v1）"],
  ["delivery-backend", "服务端增量：`sort`/`order`/`assignee`、`deadline`、`overdue`、`GET /api/tickets/export`（CSV+BOM）、`canExport`、store 补全、README 同步（backend-engineer）", "done（有落盘/回交证据；125/125 + 自检 73 项为角色自报，独立复核仍待 `verification`）"],
  ["delivery-frontend", "前端增量：排序/负责人筛选控件、截止时间列与逾期高亮、创建与 PATCH deadline 表单、导出按钮（`fetch`+`Blob`）（frontend-engineer）", "done（有落盘/回交证据；e2e 后 0 处修正）"],
  ["delivery-test", "测试增量：`sorting-filtering` / `overdue` / `export` 三文件 + `persistence` 增补；既有 75 用例不得弱化（test-engineer）", "done（有落盘/回交证据；125/125 为角色自报，独立复核仍待 `verification`）"],
  ["cleanup-selfcheck", "清理 `data/selfcheck-r2.mjs` 临时自检脚本（backend-engineer 自己的写区）", "done（已删；`data/` 仅剩 `tickets.json`，统筹 `list_dir` 复核）"],
  ["r2-e2e", "R2 端到端联调：真起服务核对前端查询串/静态托管/导出链路（frontend-engineer）", "done（真起服 curl 实测 37 个请求；浏览器渲染未验证）"],
  ["verification", "独立复核：按提案 §11 八条逐条出结论（内置 Proof / verifier）", "pending（不由统筹派发）"],
  ["acceptance", "客户验收", "pending（不由统筹批）"],
];

function realR2FlowMarkdown(overrides: Readonly<Record<string, string>> = {}): string {
  return [
    "# 流程：ticket-desk-r2（第二轮迭代：排序/筛选/deadline/overdue/CSV 导出）",
    "",
    "## 步骤表",
    "",
    "| stepId | 步骤 | 状态 |",
    "| --- | --- | --- |",
    ...REAL_R2_STEP_TABLE.map(([id, description, status]) => `| ${id} | ${description} | ${overrides[id] ?? status} |`),
  ].join("\n");
}

// 同形账本（字段形状取自真实 `.ans/governance/ledger.jsonl` 的 R2 条目）。真实账本中 6 个执行步骤
// 有 dispatch.accepted；`role-readiness` / `contract-freeze-v2` 由客户任命/写盘决定完成、未走应用派发，
// 本夹具按「每步都有 dispatch.accepted」的同形补齐（真实账本复算仍会在这两处拦下，见变更记录残余风险）。
const REAL_R2_LEDGER = {
  errors: [],
  entries: [
    ...["proposal-v1", "nomination", "delivery-backend", "delivery-frontend", "delivery-test", "cleanup-selfcheck", "r2-e2e", "role-readiness", "contract-freeze-v2"].map(
      (stepId) => ({ kind: "dispatch.accepted", flowId: "ticket-desk-r2", stepId, actorRoleId: "app" }),
    ),
    { kind: "customer.decision", flowId: "ticket-desk-r2", decisionKind: "intent-confirm", customerDecision: "accepted" },
    { kind: "customer.decision", flowId: "ticket-desk-r2", stepId: "proposal-v1", decisionKind: "proposal-accept", customerDecision: "accepted" },
    { kind: "customer.decision", flowId: "ticket-desk-r2", stepId: "nomination", decisionKind: "appointment", customerDecision: "appointed" },
    { kind: "customer.decision", flowId: "ticket-desk-r2", decisionKind: "schedule-write", customerDecision: "accepted" },
  ],
};

test("真实 R2 流程单（状态带说明）+ 同形账本：可派验收；改一个执行步骤为 pending（…）则不放行", () => {
  const parsed = parseFlowStepStatuses(realR2FlowMarkdown());
  assert.equal(parsed.wellFormed, true);
  assert.deepEqual(
    parsed.steps.map((step) => step.id),
    REAL_R2_STEP_TABLE.map(([id]) => id),
    "canonical 三列 stepId|步骤|状态：取 stepId 作 id（与原输出形状一致）",
  );
  assert.equal(parsed.steps[0]!.status, REAL_R2_STEP_TABLE[0]![2], "status 仍保留单元格原文（说明不丢）");

  assert.equal(
    flowCompletionIssue("ticket-desk-r2", realR2FlowMarkdown(), REAL_R2_LEDGER),
    undefined,
    "执行步骤全部 done（…）+ 验收 pending（…）⇒ 可派验收",
  );
  assert.match(
    flowCompletionIssue("ticket-desk-r2", realR2FlowMarkdown({ "delivery-backend": "pending（等待回交）" }), REAL_R2_LEDGER) ?? "",
    /流程仍有未完成\/阻塞\/待派发步骤（delivery-backend=pending（等待回交））/,
    "任一执行步骤 pending（…）⇒ 不放行",
  );
});

test("收尾任务消息：带流程状态 YAML 与回交/报告路径，要求汇总并出验收卡、不自行验收", () => {
  const message = buildAcceptanceTaskMessage("flow-a", ["docs/reports/impl.md", "docs/reports/impl.md", ""]);
  assert.match(message, /流程 flow-a 步骤已全部完成/);
  assert.match(message, /流程状态 YAML：docs\/flows\/flow-a\.yaml/);
  assert.match(message, /回交\/核对报告路径：docs\/reports\/impl\.md/);
  assert.match(message, /请汇总证据并出验收卡/);
  assert.match(message, /不要自行验收或代替客户决定/);
});

// ————— 2026-10-19 客户批准（原话「可以，按你说的改」）：验收任务硬要求 —————
// 验收前最起码要真实启动应用并向客户演示；未演示或质量基线某项无证据不得建议 accept。

test("收尾任务消息（客户批准）：工程质量基线八项逐项核对，缺证据不得建议 accept", () => {
  const message = buildAcceptanceTaskMessage("flow-a", ["docs/reports/impl.md"]);
  assert.match(message, /按工程质量基线逐项核对/);
  for (const item of ["正确性", "健壮性", "安全", "可维护性", "可观测性", "性能", "前端可访问性", "测试矩阵"]) {
    assert.ok(message.includes(item), `质量基线「${item}」须逐项核对并给出结论与证据`);
  }
  assert.match(message, /某项无证据/);
  assert.match(message, /不得建议 accept/);
});

test("收尾任务消息（客户批准）：必须真实启动应用向客户演示，报告写入 docs/acceptance/<flowId>-report-v1.md、附件写入 docs/verification/", () => {
  const message = buildAcceptanceTaskMessage("flow-a", ["docs/reports/impl.md"]);
  assert.match(message, /必须真实启动应用并向客户演示/);
  assert.match(message, /启动命令/);
  assert.match(message, /访问地址/);
  assert.match(message, /截图或录屏/);
  assert.match(message, /审批档 shell/);
  assert.match(message, /未真实启动\/演示/);
  // 2026-10-22 第 3 项（方案 §7.1/§7.6）：报告进 docs/acceptance/，详细证据附件留在 docs/verification/。
  assert.match(message, /docs\/acceptance\/flow-a-report-v1\.md/);
  assert.match(message, /docs\/verification\//);
  assert.match(message, /首行五项/);
  // 证据路径按 flowId 生成（不写死 flow-a）；无回交路径时也保留硬要求。
  const other = buildAcceptanceTaskMessage("ticket-desk-r2", []);
  assert.match(other, /docs\/acceptance\/ticket-desk-r2-report-v1\.md/);
  assert.doesNotMatch(other, /docs\/acceptance\/flow-a-report-v1\.md/);
  assert.match(other, /回交\/核对报告路径：见回交报告与流程状态 YAML/);
  assert.match(other, /不得建议 accept/);
});

// ————— 2026-10-19 客户批评（原话「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，
// 给出一个架构方案啊」）：验收须按提案/变更的「架构方案或架构影响分析」核对实现；
// 缺失架构章节或实现偏离声明不得建议 accept；既有四条硬要求逐字不变。

test("收尾任务消息（客户批评）：按架构方案/架构影响分析核对实现，缺失架构章节或偏离声明不得建议 accept", () => {
  const message = buildAcceptanceTaskMessage("flow-a", ["docs/reports/impl.md"]);
  assert.match(message, /架构方案或架构影响分析/);
  for (const item of ["模块边界", "依赖方向", "扩展点", "数据 schema/API 版本迁移"]) {
    assert.ok(message.includes(item), `架构核对项「${item}」须出现在验收任务中并与声明一致`);
  }
  assert.match(message, /与声明一致/);
  assert.match(message, /缺失架构章节/);
  assert.match(message, /实现偏离声明/);
  assert.match(message, /不得建议 accept/);
  assert.match(message, /只能建议退回或补充证据/);
  // 既有硬要求①–③与⑤逐字保留；④按 2026-10-22 第 3 项改为 acceptance 报告 + verification 附件。
  for (const requirement of [
    "① 按工程质量基线逐项核对并给出结论与证据：正确性、健壮性、安全、可维护性、可观测性、性能、前端可访问性、测试矩阵；",
    "② 必须真实启动应用并向客户演示：给出启动命令与访问地址，附截图或录屏（你已有审批档 shell，可执行启动命令，命令逐条提交审批）；",
    "③ 未真实启动/演示、或质量基线某项无证据，不得建议 accept（只能建议退回或补充证据）；",
    "④ 验收报告写入 docs/acceptance/flow-a-report-v1.md（首行五项：风险档位、判定依据、选定检查、复用证据、全量回归），详细证据附件写入 docs/verification/；报告须引用实施前标准 docs/acceptance/flow-a-criteria-v1.md 与变更包 docs/scheduling/flow-a-change-v1.md 的版本/哈希。",
    "⑤ 按提案/变更的「架构方案或架构影响分析」核对实现：模块边界、依赖方向、扩展点、数据 schema/API 版本迁移与声明一致；缺失架构章节或实现偏离声明时不得建议 accept（只能建议退回或补充证据）。",
  ]) {
    assert.ok(message.includes(requirement), `硬要求须保留：${requirement}`);
  }
  // 第 3 项新增：实施前标准/风险档位/证据复用（第⑥条）。
  assert.match(message, /按实施前标准/);
  assert.match(message, /风险档位/);
  assert.match(message, /档位只能升不能降/);
  assert.match(message, /复用同候选/);
  assert.match(message, /证据失效/);
  // 无回交路径时架构核对要求同样保留（固定硬要求，不依赖 evidence）。
  assert.match(buildAcceptanceTaskMessage("ticket-desk-r2", []), /架构方案或架构影响分析/);
});

test("2026-10-22 v2/MapReduce 任务文案：团队计划 v2 字段、模块清单、Crew 写卡读 v2 列、readiness 模块列/分片、验收 manifest", () => {
  const accept = buildGovernanceAdvanceMessage(
    {
      version: 1,
      flowId: "flow-v2",
      cardKind: "proposal",
      nextFunction: "schedule",
      roleId: "convener",
    },
    undefined,
    { proposalDecision: "accept", teamPlanPath: "docs/scheduling/flow-v2-team-v1.md" },
  )!;
  assert.match(accept, /teamPlanSchema: 2/);
  assert.match(accept, /modules: \[模块id/);
  assert.match(accept, /模块清单/);
  assert.match(accept, /parallelGroup/);
  assert.match(accept, /dependsOn/);
  assert.match(accept, /直接发任命卡/, "既有主路径文案保留");

  const crew = buildGovernanceAdvanceMessage(
    {
      version: 1,
      flowId: "flow-v2",
      cardKind: "appointment",
      nextFunction: "role-card-write",
      roleId: "nominator",
    },
    ["executor"],
    {
      teamPlanPath: "docs/scheduling/flow-v2-team-v1.md",
      teamPlanVersion: 1,
      teamPlanSchema: 2,
      teamPlanModules: ["storefront"],
    },
  )!;
  assert.match(crew, /团队计划 docs\/scheduling\/flow-v2-team-v1\.md/);
  assert.match(crew, /模块清单：storefront/);
  assert.match(crew, /bounded context/);
  assert.match(crew, /公开契约/);
  assert.match(crew, /测试面/);
  assert.match(crew, /dependsOn/);
  assert.match(crew, /并行组/);
  assert.match(crew, /V12/);

  const readiness = buildRoleReadinessTaskMessage(
    "flow-v2",
    ["executor"],
    "docs/scheduling/flow-v2-team-v1.md",
    1,
    { teamPlanSchema: 2, modules: ["storefront"] },
  );
  assert.match(readiness, /模块清单：storefront/);
  assert.match(readiness, /module\/contract\/testSurface\/parallel\/dependsOn\/granularity/);
  assert.match(readiness, /每分片独立证据/);
  assert.match(readiness, /manifest/);
  assert.match(readiness, /粒度理由/);

  const acceptance = buildAcceptanceTaskMessage("flow-v2", []);
  assert.match(acceptance, /MapReduce/);
  assert.match(acceptance, /manifest/);
  assert.match(acceptance, /分片原始证据/);
  assert.match(acceptance, /insufficient evidence/);
});

// ————— 2026-10-19 客户要求：判断 agent 拒绝（deny）+ 退回发起角色重做 —————
//
// 真机：写卡判断的 manual 回落把可修正问题甩给客户。新语义：approval 组允许 `deny` ⇒ **不呈现客户卡**，
// 以 `declined` + 具体原因结算（发起角色的 `request_confirmation` 收到原因并重做）；不发 approve 结果行、
// 不写客户决定账本。decision 组 deny（编排会回落 manual）防御性按 manual 处理。

test("judge deny（审批组）：不呈现客户卡、不发结果行，发起角色收到 declined+具体原因", async () => {
  const judge: GovernanceJudgeFn = async (request) =>
    ({
      verdict: "deny",
      group: request.group,
      cardKind: request.cardKind,
      reasonCode: "insufficient-evidence",
      reason: "写卡缺少边界声明",
      engine: "pi",
    }) as unknown as GovernanceJudgeOutcome;
  const { channel, pushed, results, next } = makeJudgeChannel({ enabled: () => true, judge });
  const request: CustomerInputRequest = {
    kind: "confirm",
    title: "写角色卡",
    cardKind: "appointment-write",
    flowId: "flow-a",
    preview: "角色卡/backend/role-card.md",
  };
  const outcome = (await channel.customerInput(request, { ...JUDGE_CTX, roleId: "nominator" }, {
    cardKind: "appointment-write",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;

  assert.equal(outcome.outcome, "declined", "deny ⇒ declined（退回发起角色），不是 answered");
  assert.equal(outcome.operatorId, "judge:pi", "归因判断引擎");
  assert.equal(
    outcome.reason,
    "自动审批拒绝：证据不足（写卡缺少边界声明）。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。",
    "具体原因随 declined 回给发起角色，指示修正后重新提交",
  );
  assert.equal(pushed.length, 0, "deny 不呈现客户卡（不把可修正问题甩给客户）");
  assert.equal(results.length, 0, "deny 不发 approve 结果行");
  assert.equal(next.length, 0, "declined 不产生下一步");
  assert.equal(channel.pendingCount(), 0);
  assert.equal(channel.judgingCount(), 0);
  assert.equal(
    channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).expired,
    true,
    "客户事后作答按终态拒绝（卡从未呈现）",
  );
});

test("judge deny（decision 组，防御）：不再回落客户卡，按 manual 语义自动退回重做", async () => {
  const judge: GovernanceJudgeFn = async (request) =>
    ({
      verdict: "deny",
      group: "decision",
      cardKind: request.cardKind,
      reasonCode: "insufficient-evidence",
      reason: "证据不足",
      engine: "claude",
    }) as unknown as GovernanceJudgeOutcome;
  const { channel, pushed, results, next } = makeJudgeChannel({ enabled: () => true, judge });
  const outcome = (await channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, {
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: judgeContextOf("flow-a"),
  }))!;
  assert.equal(outcome.outcome, "declined", "decision 组 deny 防御性回落 manual ⇒ 自动退回重做");
  assert.equal(outcome.operatorId, "judge:claude");
  assert.match(outcome.reason ?? "", /自动决策未通过：拒绝仅适用于审批组/);
  assert.match(outcome.reason ?? "", /本次自动判断未通过\/未完成，已拒绝；请按上述原因修正后重新提交确认/);
  assert.equal(pushed.length, 0, "不呈现客户卡");
  assert.equal(results.length, 0, "manual 不发结果行");
  assert.equal(next.length, 0, "declined 不产生下一步");
});

// —————— 2026-10-20 真机：UI「还有 7 个决定等待前一个决定」但主进程 queuedCount=0 ——————
//
// 根因：排队请求被判断 agent 直接代批/自动退回（从未 presenter 呈现）时，customer-input 没有通知渲染侧
// 减项；`queuedRequests` 只在 presented/onExpired 时删除。修复：曾排队（onQueued 已发）且从未呈现的
// entry 在结算时补发 onExpired（复用 session:operator-expired 的既有删除处理），且全程不呈现客户卡。

test("2026-10-20 排队请求被判断代批（从未呈现）⇒ 每个排队 id 恰一条 onExpired、queuedCount=0、无客户卡、结算语义不变", async () => {
  const queuedIds: string[] = [];
  const expired: { id: string; roleId: string; reason: string }[] = [];
  const judgeCalls: string[] = [];
  const { channel, pushed, results } = makeJudgeChannel({
    enabled: (group) => group === "decision",
    judge: async (request) => {
      judgeCalls.push(request.cardKind ?? "");
      return {
        verdict: "approve",
        group: request.group,
        cardKind: request.cardKind,
        reasonCode: "sufficient",
        engine: request.runtime,
        value: { selected: ["accept"] },
        durationMs: 1,
      };
    },
    queued: (payload) => queuedIds.push(payload.id),
    expired: (payload) => expired.push(payload),
  });
  const meta = { cardKind: "proposal" as const, flowId: "flow-a", judgeContext: judgeContextOf("flow-a") };
  const waitForLocal = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  // 第一张直接进入判断（占住一项目一卡）；第二、三张排队。
  const p1 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, meta);
  const p2 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, meta);
  const p3 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, meta);
  assert.equal(channel.queuedCount(), 2, "两张进入排队");
  assert.equal(queuedIds.length, 2, "onQueued 只在入队时调用（两张）");
  assert.equal(pushed.length, 0, "判断中/排队中都不呈现客户卡");
  await waitForLocal(() => expired.length >= 2 && channel.queuedCount() === 0);
  const outcomes = [await p1, await p2, await p3];
  for (const outcome of outcomes) assert.equal(outcome!.outcome, "answered", "判断代批成功（结算语义不变）");
  assert.equal(pushed.length, 0, "全程零客户卡（判断代批）");
  assert.equal(judgeCalls.length, 3, "每张卡各判断一次");
  assert.equal(expired.length, 2, "恰为两个排队 id 补发 onExpired");
  assert.deepEqual(
    [...expired.map((item) => item.id)].sort(),
    [...queuedIds].sort(),
    "每个排队 id 都收到 onExpired（渲染侧据此删除排队行）",
  );
  assert.ok(expired.every((item) => item.reason === "排队决定已自动处理（未呈现客户卡）"), "原因如实");
  assert.equal(new Set(expired.map((item) => item.id)).size, 2, "不双通知");
  assert.equal(channel.queuedCount(), 0, "drain 后 queuedCount 归零");
  assert.equal(channel.pendingCount(), 0, "无挂起");
  assert.equal(results.length, 3, "approve 结果行仍按既有路径（每张一条）");
});

test("2026-10-20 已呈现路径不补发排队 onExpired：第一张呈现、第二张排队后呈现并手答 ⇒ 零 onExpired", async () => {
  const queuedIds: string[] = [];
  const expired: { id: string; roleId: string; reason: string }[] = [];
  const { channel, pushed } = makeJudgeChannel({
    enabled: () => false, // 开关关：正常呈现客户卡
    queued: (payload) => queuedIds.push(payload.id),
    expired: (payload) => expired.push(payload),
  });
  const meta = { cardKind: "proposal" as const, flowId: "flow-a" };
  const p1 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, meta);
  assert.equal(pushed.length, 1, "第一张正常呈现");
  const p2 = channel.customerInput(proposalRequest("flow-a"), JUDGE_CTX, meta);
  assert.equal(channel.queuedCount(), 1, "第二张排队");
  assert.equal(queuedIds.length, 1, "第二张经 onQueued 通知");
  // 第一张手答 ⇒ 第二张被 drain 呈现（不是自动结算）。
  assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["revise"] } }).ok, true);
  await p1;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(pushed.length, 2, "第二张随后被呈现");
  assert.equal(channel.queuedCount(), 0, "排空");
  assert.equal(channel.respond({ id: pushed[1]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const outcome = await p2;
  assert.equal(outcome!.outcome, "answered");
  assert.equal(expired.length, 0, "呈现过的卡不补发「排队移除」通知（不双通知）");
});
