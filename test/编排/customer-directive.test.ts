// test/编排/customer-directive.test.ts
// B1（2026-11-03 客户授权平面）：客户指令账本 Provider/Service/Pipeline 公共句柄。
//
// 覆盖（B1 提案 §6/§7）：
//   · A1 常量单一来源（路径/ID 模式/五个字段上限）与 Provider `relPath` 一致性；
//   · Provider 追加/回放/轮转/坏行；Service schema/ID `d-<seq>`/seq max+1/状态机/target 隔离/
//     快照/创建/撤销/消费/失效/高危（含 decisionGroupEnabled 2×2）/错误语义；
//   · Pipeline `submitFromInput`（presenter 合法/取消/异常/幂等/高危）、`takeDirective`
//     （精确匹配/once 原子消费/session 重复/跨 target 防御）、`applyDecisionDirective`
//     （推荐/选项/拒绝/冲突/不匹配/emitResult 先于 durable consume）、`revoke`/`list`；
//   · `task-state` 迁移等价（追加/轮转/坏行/旧→新）与 Q9 `directive` 校验的回调点。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES,
  CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH,
  CUSTOMER_DIRECTIVE_ID_PATTERN,
  CUSTOMER_DIRECTIVE_PATH_MAX_BYTES,
  CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES,
  CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES,
  CUSTOMER_DIRECTIVES_REL,
  type ApprovalAction,
  type DecisionAction,
  type DirectiveCreatedEventV1,
} from "../../src/model/directive.ts";
import {
  createDirectiveFileStore,
  customerDirectiveLedgerPath,
} from "../../src/provider/directive/public/directive-store.ts";
import {
  createDirectiveService,
  type DirectiveCreateRequest,
} from "../../src/service/directive/public/directive-service.ts";
import {
  createCustomerDirectiveRuntime,
  type CustomerDirectiveRuntime,
  type DecisionApplyResult,
  type DecisionCardFacts,
  type DecisionHooks,
  type DirectiveConfirmationValues,
  type DirectiveListResult,
  type DirectivePresenter,
  type DirectivePresenterRequest,
  type DirectiveStore,
  type RevokeResult,
  type SubmitFromInput,
  type SubmitResult,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import {
  DEFAULT_TASKS_MAX_BYTES,
  DEFAULT_TASKS_ROTATIONS,
  TASKS_STATE_REL,
  appendTaskEvent,
  readTaskState,
  taskEvent,
} from "../../src/common/编排/task-state.ts";
import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
} from "../../src/common/shared/jsonl-ledger.ts";

// —————————————————————— 夹具 ——————————————————————

async function tempRoot(prefix = "ans-directive-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

interface MemoryStore extends DirectiveStore {
  readonly lines: string[];
  appended: string[];
}

function memoryStore(initial: string[] = [], opts: { failAppend?: boolean } = {}): MemoryStore {
  const lines = [...initial];
  return {
    relPath: CUSTOMER_DIRECTIVES_REL,
    lines,
    appended: lines,
    async append(line: string): Promise<void> {
      if (opts.failAppend === true) throw new Error("模拟写盘失败");
      lines.push(line);
    },
    async replay() {
      return { lines: [...lines], errors: 0, files: ["customer-directives.jsonl"] };
    },
  };
}

const NOW = () => new Date("2026-11-03T00:00:00.000Z");

function approvalShell(command: string, root: string): ApprovalAction {
  return { kind: "allow", resource: { type: "shell", command, cwd: root } };
}

function approvalDenyShell(command: string, root: string): ApprovalAction {
  return { kind: "deny", resource: { type: "shell", command, cwd: root } };
}

function confirmation(root: string, action: ApprovalAction | DecisionAction, until: DirectiveConfirmationValues["until"] = "once", scope: DirectiveConfirmationValues["scope"] = {}): DirectiveConfirmationValues {
  return { action, scope, until };
}

/** 高危指令的确认值（主进程复核要求 `acknowledged:true`）。 */
function acknowledged(values: DirectiveConfirmationValues): DirectiveConfirmationValues {
  return { ...values, acknowledged: true };
}

function fixedPresenter(
  values: DirectiveConfirmationValues,
  capture?: DirectivePresenterRequest[],
): DirectivePresenter {
  return {
    async present(req) {
      capture?.push(req);
      return { decision: "confirm", values };
    },
  };
}

function cancelPresenter(): DirectivePresenter {
  return { async present() { return { decision: "cancel" }; } };
}

function throwPresenter(): DirectivePresenter {
  return { async present() { throw new Error("通道断开"); } };
}

/** 按顺序回放多个确认值（同一 runtime 多次提交/多指令测试用）。 */
function queuePresenter(
  values: DirectiveConfirmationValues[],
  capture?: DirectivePresenterRequest[],
): DirectivePresenter {
  let index = 0;
  return {
    async present(req) {
      capture?.push(req);
      const value = values[index];
      index += 1;
      if (value === undefined) throw new Error("队列已空");
      return { decision: "confirm", values: value };
    },
  };
}

function createRuntime(root: string, options: {
  presenter: DirectivePresenter;
  store?: DirectiveStore;
  sessionId?: string;
}): CustomerDirectiveRuntime {
  return createCustomerDirectiveRuntime({
    projectRoot: root,
    sessionId: options.sessionId ?? "session-A",
    present: options.presenter,
    now: NOW,
    ...(options.store !== undefined ? { store: options.store } : {}),
  });
}

async function submitApproval(
  runtime: CustomerDirectiveRuntime,
  root: string,
  command: string,
  until: "once" | "session" | "forever" = "once",
): Promise<SubmitResult> {
  return runtime.submitFromInput({
    rawText: `@审批 允许 shell "${command}" ${until}`,
    target: "approval",
    projectRoot: root,
    roleId: "worker",
    clientMessageId: `m-${Math.random().toString(16).slice(2)}`,
    decisionGroupEnabled: true,
  });
}

async function submitDecision(
  runtime: CustomerDirectiveRuntime,
  root: string,
  action: DecisionAction,
  options: { until?: "once" | "session" | "forever"; scope?: { flowId?: string }; decisionGroupEnabled?: boolean; acknowledged?: true; clientMessageId?: string } = {},
): Promise<SubmitResult> {
  const until = options.until ?? "once";
  const scope = options.scope ?? {};
  void action;
  void scope;
  void until;
  return runtime.submitFromInput({
    rawText: "@决策 测试",
    target: "decision",
    projectRoot: root,
    roleId: "worker",
    clientMessageId: options.clientMessageId ?? `m-${Math.random().toString(16).slice(2)}`,
    decisionGroupEnabled: options.decisionGroupEnabled ?? true,
  });
}

function createdLine(overrides: Partial<DirectiveCreatedEventV1> & Record<string, unknown> = {}): string {
  const base: DirectiveCreatedEventV1 = {
    version: 1,
    kind: "directive.created",
    id: "d-1",
    seq: 1,
    target: "approval",
    action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "/proj" } },
    scope: {},
    until: "once",
    rawText: '@审批 允许 shell "npm install" once',
    sessionId: "session-A",
    createdAt: "2026-11-03T00:00:00.000Z",
    createdBy: "customer",
    source: "desktop-input",
    ...overrides,
  } as DirectiveCreatedEventV1;
  return JSON.stringify(base);
}

// —————————————————————— A1 常量单一来源 ——————————————————————

test("A1 契约常量：路径/ID 模式/字段上限与 Provider relPath 一致（P1-CAP-13）", () => {
  assert.equal(CUSTOMER_DIRECTIVES_REL, ".ans/state/customer-directives.jsonl");
  const idRe = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);
  assert.equal(idRe.test("d-1"), true);
  assert.equal(idRe.test("d-0"), false);
  assert.equal(idRe.test("d-01"), false);
  assert.equal(idRe.test("D-1"), false);
  assert.equal(idRe.test("d-"), false);
  assert.equal(CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES, 4096);
  assert.equal(CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES, 1024);
  assert.equal(CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH, 253);
  assert.equal(CUSTOMER_DIRECTIVE_PATH_MAX_BYTES, 512);
  assert.equal(CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES, 256);
  // Provider 默认 store 的 relPath 必须与 A1 常量逐字一致。
  const store = createDirectiveFileStore("/proj");
  assert.equal(store.relPath, CUSTOMER_DIRECTIVES_REL);
  // Service 构造期断言：错误 relPath 直接拒绝（不允许第二条路径）。
  assert.throws(
    () => createDirectiveService({ projectRoot: "/proj", sessionId: "s", store: { ...store, relPath: "other.jsonl" } }),
    /store\.relPath/,
  );
});

// —————————————————————— Provider：追加/回放/轮转/坏行 ——————————————————————

test("Provider：追加一行 durable 后 replay 旧→新可读；路径 = 项目根下 A1 常量", async () => {
  const root = await tempRoot();
  try {
    const store = createDirectiveFileStore(root);
    const line = createdLine();
    await store.append(line);
    const replay = await store.replay();
    assert.deepEqual(replay.lines, [line]);
    assert.equal(replay.errors, 0);
    assert.equal(replay.files[0], "customer-directives.jsonl");
    assert.equal(customerDirectiveLedgerPath(root), path.join(root, ...CUSTOMER_DIRECTIVES_REL.split("/")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Provider：按大小轮转（.1 最新、.N 最旧）且 replay 旧→新；坏行计数不阻塞", async () => {
  const root = await tempRoot();
  try {
    const store = createDirectiveFileStore(root, { maxBytes: 180, rotations: 2 });
    const lines = [
      createdLine({ id: "d-1", seq: 1 }),
      createdLine({ id: "d-2", seq: 2 }),
      createdLine({ id: "d-3", seq: 3 }),
      createdLine({ id: "d-4", seq: 4 }),
    ];
    for (const line of lines) await store.append(line);
    const file = customerDirectiveLedgerPath(root);
    const names = await fs.readdir(path.dirname(file));
    assert.ok(names.includes("customer-directives.jsonl"));
    assert.ok(names.includes("customer-directives.jsonl.1"), "轮转段 .1 应存在（.1 最新）");
    const replay = await store.replay();
    assert.equal(replay.errors, 0);
    assert.ok(replay.files.includes("customer-directives.jsonl"));
    // 保留份数内旧→新：最后一行一定在，且顺序不回退。
    const ids = replay.lines.map((line) => (JSON.parse(line) as { id: string }).id);
    assert.deepEqual(ids, [...ids].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))));
    assert.ok(ids.includes("d-4"));

    // 手动追加坏行 → replay.errors 计数，合法行仍可读。
    await fs.appendFile(file, "{broken\n", "utf8");
    const bad = await store.replay();
    assert.equal(bad.errors, 1);
    assert.ok(bad.lines.some((line) => line.includes("d-4")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Service 回放：version>1/坏行/未知 kind/seq 非单调/伪造 target-action 组合的容错矩阵", async () => {
  const root = await tempRoot();
  try {
    const lines = [
      JSON.stringify({ version: 2, kind: "directive.created", id: "d-99", seq: 99 }),
      createdLine({ id: "d-1", seq: 1 }),
      JSON.stringify({ version: 1, kind: "directive.future", id: "d-50", seq: 50 }),
      createdLine({ id: "d-2", seq: 2, target: "approval", action: { kind: "select-recommended" } } as never),
      createdLine({ id: "d-3", seq: 3, target: "approval", scope: { flowId: "focus" } }),
    ];
    const store = memoryStore(lines);
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const facts = service.approvalFacts();
    assert.equal(facts.ledgerErrors, 3, "version>1/伪造组合/scope 均应计错误");
    assert.deepEqual(facts.active, [], "ledgerErrors>0 ⇒ 消费者按无指令处理");
    const listed = service.list();
    assert.equal(listed.ledgerErrors, 3);
    assert.equal(listed.approval.active.length, 1, "合法 d-1 仍进入面板视图（不伪造空）");
    assert.equal(listed.decision.active.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Service：创建/ID/状态机/target 隔离 ——————————————————————

test("Service：ID d-<seq> 单调、回放含轮转的全局 max+1、target 快照互不含", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const approval: DirectiveCreateRequest = {
      target: "approval",
      action: approvalShell("npm install", root),
      scope: {},
      until: "once",
      rawText: '@审批 允许 shell "npm install" once',
      projectRoot: root,
      decisionGroupEnabled: true,
    };
    const decision: DirectiveCreateRequest = {
      target: "decision",
      action: { kind: "select-recommended" },
      scope: {},
      until: "session",
      rawText: "@决策 选推荐项 until=session",
      projectRoot: root,
      decisionGroupEnabled: true,
    };
    const first = await service.create(approval);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.id, "d-1");
    const second = await service.create(decision);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.id, "d-2");

    const approvalFacts = service.approvalFacts();
    const decisionFacts = service.decisionFacts();
    assert.equal(approvalFacts.active.length, 1);
    assert.equal(approvalFacts.active[0]!.target, "approval");
    assert.equal(decisionFacts.active.length, 1);
    assert.equal(decisionFacts.active[0]!.target, "decision");
    assert.equal(approvalFacts.active.some((fact) => fact.id === "d-2"), false);
    assert.equal(decisionFacts.active.some((fact) => fact.id === "d-1"), false);

    // 重新加载（模拟轮转后的回放）：seq 取 max+1。
    const reloaded = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await reloaded.ready();
    const third = await reloaded.create({ ...approval, rawText: '@审批 允许 shell "npm test" once', action: approvalShell("npm test", root) });
    assert.equal(third.ok, true);
    if (third.ok) assert.equal(third.id, "d-3");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Service：撤销同 target/active；跨 target/已撤销/已消费/已失效明确错误；append-only 保留历史", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const created = await service.create({
      target: "approval",
      action: approvalShell("npm install", root),
      scope: {},
      until: "session",
      rawText: '@审批 允许 shell "npm install" session',
      projectRoot: root,
      decisionGroupEnabled: true,
    });
    assert.equal(created.ok, true);
    const id = created.ok ? created.id : "";

    assert.deepEqual(await service.revoke("d-404", "approval"), { ok: false, error: "not-found", message: "指令不存在：d-404" });
    assert.deepEqual(await service.revoke(id, "decision"), { ok: false, error: "target-mismatch", message: `#${id} 属于 approval` });
    assert.deepEqual(await service.revoke(id, "approval"), { ok: true });
    assert.deepEqual(await service.revoke(id, "approval"), { ok: false, error: "already-revoked" });
    assert.equal(service.list().approval.revoked.length, 1);
    assert.equal(service.list().approval.active.length, 0);
    assert.equal(store.lines.filter((line) => line.includes('"directive.revoked"')).length, 1);

    // 已消费 ⇒ already-consumed。
    const once = await service.create({
      target: "approval",
      action: approvalShell("npm test", root),
      scope: {},
      until: "once",
      rawText: '@审批 允许 shell "npm test" once',
      projectRoot: root,
      decisionGroupEnabled: true,
    });
    assert.equal(once.ok, true);
    if (once.ok) {
      assert.deepEqual(await service.consume(once.id), { ok: true });
      assert.deepEqual(await service.consume(once.id), { ok: false, error: "already-consumed" });
      assert.deepEqual(await service.revoke(once.id, "approval"), { ok: false, error: "already-consumed" });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Service：once 消费写账本；session 消费只返回成功、不写账本", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const once = await service.create({
      target: "approval",
      action: approvalShell("npm install", root),
      scope: {},
      until: "once",
      rawText: '@审批 允许 shell "npm install" once',
      projectRoot: root,
      decisionGroupEnabled: true,
    });
    const session = await service.create({
      target: "approval",
      action: approvalShell("npm test", root),
      scope: {},
      until: "session",
      rawText: '@审批 允许 shell "npm test" session',
      projectRoot: root,
      decisionGroupEnabled: true,
    });
    assert.equal(once.ok && session.ok, true);
    if (!once.ok || !session.ok) return;
    const before = store.lines.length;
    assert.deepEqual(await service.consume(session.id, { toolCallId: "t1" }), { ok: true });
    assert.equal(store.lines.length, before, "session/forever 不写非状态事件");
    assert.deepEqual(await service.consume(once.id, { toolCallId: "t2" }), { ok: true });
    assert.equal(store.lines.length, before + 1);
    assert.ok(store.lines[store.lines.length - 1]!.includes('"directive.consumed"'));
    assert.equal(service.approvalFacts().active.length, 1, "session 指令仍 active");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Service：sessionId 重启失效（session→app-restart；未用 once→unused-once；forever 保留）", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const first = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await first.ready();
    for (const [until, command] of [["session", "npm install"], ["once", "npm test"], ["forever", "npm run build"]] as const) {
      const created = await first.create({
        target: "approval",
        action: approvalShell(command, root),
        scope: {},
        until,
        rawText: `@审批 允许 shell "${command}" ${until}`,
        projectRoot: root,
        decisionGroupEnabled: true,
        ...(until === "forever" ? { acknowledged: true } : {}),
      });
      assert.equal(created.ok, true);
    }
    const second = createDirectiveService({ projectRoot: root, sessionId: "session-B", store, now: NOW });
    await second.ready();
    const facts = second.approvalFacts();
    assert.equal(facts.active.length, 1, "只有 forever 保留 active");
    assert.equal(facts.active[0]!.until, "forever");
    const listed = second.list();
    assert.equal(listed.approval.expired.length, 2);
    assert.deepEqual(
      listed.approval.expired.map((view) => view.expiredReason).sort(),
      ["app-restart", "unused-once"],
    );
    assert.ok(store.lines.some((line) => line.includes('"reason":"app-restart"')));
    assert.ok(store.lines.some((line) => line.includes('"reason":"unused-once"')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Service：账本写失败 ⇒ ledger-write-failed，不更新视图", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore([], { failAppend: true });
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const result = await service.create({
      target: "approval",
      action: approvalShell("npm install", root),
      scope: {},
      until: "once",
      rawText: '@审批 允许 shell "npm install" once',
      projectRoot: root,
      decisionGroupEnabled: true,
    });
    assert.deepEqual(result, { ok: false, error: "ledger-write-failed", message: "模拟写盘失败" });
    assert.equal(service.approvalFacts().active.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Service：高危（2×2） ——————————————————————

test("高危 2×2：decisionGroupEnabled 关×项目级 select-recommended 是唯一触发（未确认拒绝落账）", async () => {
  const root = await tempRoot();
  try {
    const cases = [
      { enabled: false, scope: {}, high: true, reason: "switch-off-project-recommended" },
      { enabled: true, scope: {}, high: false },
      { enabled: false, scope: { flowId: "focus" }, high: false },
      { enabled: true, scope: { flowId: "focus" }, high: false },
    ] as const;
    for (const item of cases) {
      const store = memoryStore();
      const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
      await service.ready();
      const input: DirectiveCreateRequest = {
        target: "decision",
        action: { kind: "select-recommended" },
        scope: item.scope,
        until: "session",
        rawText: "@决策 选推荐项 until=session",
        projectRoot: root,
        decisionGroupEnabled: item.enabled,
      };
      const rejected = await service.create(input);
      if (item.high) {
        assert.deepEqual(rejected, {
          ok: false,
          error: "high-risk-unacknowledged",
          message: "高危指令未确认：switch-off-project-recommended",
        });
        assert.equal(store.lines.length, 0, "未确认不得落账");
        const acknowledged = await service.create({ ...input, acknowledged: true });
        assert.equal(acknowledged.ok, true);
        const line = JSON.parse(store.lines[0]!) as DirectiveCreatedEventV1;
        assert.deepEqual(line.highRisk?.reasons, [item.reason]);
        assert.equal(line.highRisk?.acknowledged, true);
      } else {
        assert.equal(rejected.ok, true);
        const line = JSON.parse(store.lines[0]!) as DirectiveCreatedEventV1;
        assert.equal(line.highRisk, undefined, "非高危不得写 highRisk");
      }
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("高危：approval forever / 项目级 reject / select-option / 通配域名 / 宽路径 / 宽命令", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const inputs: Array<{ action: ApprovalAction | DecisionAction; scope: { flowId?: string }; until: "once" | "session" | "forever"; reason: string }> = [
      { action: approvalShell("npm install", root), scope: {}, until: "forever", reason: "forever" },
      { action: { kind: "reject" }, scope: {}, until: "session", reason: "project-decision-reject" },
      { action: { kind: "select-option", selector: "方案 A" }, scope: {}, until: "session", reason: "project-decision-select-option" },
      { action: { kind: "allow", resource: { type: "domain", host: "*.example.com", wildcard: true } }, scope: {}, until: "session", reason: "wildcard-domain" },
      { action: { kind: "allow", resource: { type: "path", path: "/" } }, scope: {}, until: "session", reason: "wide-path" },
      { action: approvalShell("npm *", root), scope: {}, until: "session", reason: "wide-command" },
    ];
    for (const item of inputs) {
      const target = item.action.kind === "select-recommended" || item.action.kind === "select-option" || item.action.kind === "reject" ? "decision" : "approval";
      const result = await service.create({
        target,
        action: item.action,
        scope: item.scope,
        until: item.until,
        rawText: "@审批 测试",
        projectRoot: root,
        decisionGroupEnabled: true,
      });
      assert.deepEqual(
        result,
        { ok: false, error: "high-risk-unacknowledged", message: `高危指令未确认：${item.reason}` },
        `应命中 ${item.reason}`,
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Service：字段上限与 schema 负例 ——————————————————————

test("字段上限：rawText/command/host/path/selector 超限与空命令拒绝（invalid-input）", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const service = createDirectiveService({ projectRoot: root, sessionId: "session-A", store, now: NOW });
    await service.ready();
    const base: DirectiveCreateRequest = {
      target: "approval",
      action: approvalShell("npm install", root),
      scope: {},
      until: "session",
      rawText: '@审批 允许 shell "npm install" session',
      projectRoot: root,
      decisionGroupEnabled: true,
    };
    const cases: DirectiveCreateRequest[] = [
      { ...base, rawText: `@审批 ${"x".repeat(CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES)}` },
      { ...base, action: approvalShell("x".repeat(CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES + 1), root) },
      { ...base, action: approvalShell("   ", root) },
      { ...base, action: { kind: "allow", resource: { type: "domain", host: `${"a".repeat(CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH)}.com`, wildcard: false } } },
      { ...base, action: { kind: "allow", resource: { type: "path", path: `/${"x".repeat(CUSTOMER_DIRECTIVE_PATH_MAX_BYTES)}` } } },
      { ...base, target: "decision", action: { kind: "select-option", selector: "x".repeat(CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES + 1) } },
      { ...base, action: approvalShell("npm install", root), rawText: "" },
    ];
    for (const input of cases) {
      const result = await service.create(input);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, "invalid-input", JSON.stringify(result));
    }
    assert.equal(store.lines.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Pipeline：submitFromInput ——————————————————————

test("submitFromInput：presenter 确认 → durable d-1；presenter 收到 target/原文/预填/开关快照", async () => {
  const root = await tempRoot();
  try {
    const captured: DirectivePresenterRequest[] = [];
    const store = memoryStore();
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root), "once"), captured),
      store,
    });
    const result = await runtime.submitFromInput({
      rawText: '@审批 允许 shell "npm install" once',
      target: "approval",
      projectRoot: root,
      roleId: "worker",
      clientMessageId: "m-1",
      decisionGroupEnabled: true,
    });
    assert.deepEqual(result, { ok: true, id: "d-1", target: "approval" });
    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.target, "approval");
    assert.equal(captured[0]!.rawText, '@审批 允许 shell "npm install" once');
    assert.equal(captured[0]!.decisionGroupEnabled, true);
    assert.deepEqual(captured[0]!.prefill.action, { kind: "allow", resource: { type: "shell", command: "npm install", cwd: root } });
    assert.equal(captured[0]!.prefill.until, "once");
    assert.equal(captured[0]!.confirmable, true);
    assert.equal(store.lines.length, 1);
    const listed = await runtime.list();
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.approval.active[0]!.id, "d-1");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("submitFromInput：取消/通道异常/非法回包/标记不符/超长 ⇒ 不落账", async () => {
  const root = await tempRoot();
  try {
    const cases: Array<{ presenter: DirectivePresenter; rawText?: string; target?: "approval" | "decision"; error: string; cancelled?: boolean }> = [
      { presenter: cancelPresenter(), error: "cancelled", cancelled: true },
      { presenter: throwPresenter(), error: "presenter-unavailable" },
      { presenter: { async present() { return { decision: "confirm" } as never; } }, error: "presenter-unavailable" },
      { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root))), rawText: "@决策 选推荐项", error: "invalid-input" },
      { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root))), rawText: `@审批 ${"x".repeat(CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES)}`, error: "invalid-input" },
    ];
    for (const item of cases) {
      const store = memoryStore();
      const runtime = createRuntime(root, { presenter: item.presenter, store });
      const result = await runtime.submitFromInput({
        rawText: item.rawText ?? '@审批 允许 shell "npm install" once',
        target: item.target ?? "approval",
        projectRoot: root,
        roleId: "worker",
        decisionGroupEnabled: true,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error, item.error, JSON.stringify(result));
        assert.equal(result.directiveCancelled === true, item.cancelled === true);
      }
      assert.equal(store.lines.length, 0, "任何 ok:false 不得落账");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("submitFromInput：幂等键 (target,rawText,clientMessageId) 复用同一 id；presenter 只调一次", async () => {
  const root = await tempRoot();
  try {
    const captured: DirectivePresenterRequest[] = [];
    const store = memoryStore();
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root)), captured),
      store,
    });
    const input: SubmitFromInput = {
      rawText: '@审批 允许 shell "npm install" once',
      target: "approval",
      projectRoot: root,
      roleId: "worker",
      clientMessageId: "same-key",
      decisionGroupEnabled: true,
    };
    const [a, b] = await Promise.all([runtime.submitFromInput(input), runtime.submitFromInput(input)]);
    assert.deepEqual(a, { ok: true, id: "d-1", target: "approval" });
    assert.deepEqual(b, a);
    assert.equal(captured.length, 1);
    assert.equal(store.lines.length, 1);
    const c = await runtime.submitFromInput(input);
    assert.deepEqual(c, a);
    assert.equal(captured.length, 1, "已落账同键不重复弹面板");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("submitFromInput：decisionGroupEnabled 快照原样进 presenter；高危未确认/已确认", async () => {
  const root = await tempRoot();
  try {
    const captured: DirectivePresenterRequest[] = [];
    const store = memoryStore();
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "session"), captured),
      store,
    });
    const rejected = await runtime.submitFromInput({
      rawText: "@决策 选推荐项 until=session",
      target: "decision",
      projectRoot: root,
      roleId: "worker",
      decisionGroupEnabled: false,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error, "high-risk-unacknowledged");
    assert.equal(captured[0]!.decisionGroupEnabled, false);
    assert.deepEqual(captured[0]!.highRisk.reasons, ["switch-off-project-recommended"]);
    assert.equal(store.lines.length, 0);

    const captured2: DirectivePresenterRequest[] = [];
    const acknowledgedRuntime = createRuntime(root, {
      presenter: fixedPresenter({ action: { kind: "select-recommended" }, scope: {}, until: "session", acknowledged: true }, captured2),
      store,
    });
    const accepted = await acknowledgedRuntime.submitFromInput({
      rawText: "@决策 选推荐项 until=session",
      target: "decision",
      projectRoot: root,
      roleId: "worker",
      decisionGroupEnabled: false,
    });
    assert.equal(accepted.ok, true);
    assert.equal(captured2[0]!.decisionGroupEnabled, false);
    const line = JSON.parse(store.lines[0]!) as DirectiveCreatedEventV1;
    assert.deepEqual(line.highRisk?.reasons, ["switch-off-project-recommended"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("submitFromInput：正文预填保守（shell/选项/未知片段/不可确认）", async () => {
  const root = await tempRoot();
  try {
    const captured: DirectivePresenterRequest[] = [];
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "session"), captured),
      store: memoryStore(),
    });
    await runtime.submitFromInput({
      rawText: "@决策 只接受 方案 A flow=focus until=session",
      target: "decision",
      projectRoot: root,
      roleId: "worker",
      decisionGroupEnabled: true,
    });
    const prefill = captured[0]!.prefill;
    assert.deepEqual(prefill.action, { kind: "select-option", selector: "方案 A" });
    assert.deepEqual(prefill.scope, { flowId: "focus" });
    assert.equal(prefill.until, "session");
    assert.deepEqual(prefill.unrecognized, []);

    const captured2: DirectivePresenterRequest[] = [];
    const runtime2 = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "session"), captured2),
      store: memoryStore(),
    });
    await runtime2.submitFromInput({
      rawText: "@决策 随便来点什么",
      target: "decision",
      projectRoot: root,
      roleId: "worker",
      decisionGroupEnabled: true,
    });
    assert.equal(captured2[0]!.confirmable, false);
    assert.ok(captured2[0]!.prefill.unrecognized.length > 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Pipeline：takeDirective ——————————————————————

test("takeDirective：精确命令 + cwd 匹配；session 反复生效；不匹配/cwd 不同 ⇒ undefined", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root), "session")) });
    const submitted = await submitApproval(runtime, root, "npm install", "session");
    assert.equal(submitted.ok, true);
    const req = { command: "  npm   install ", argv: ["npm", "install"], cwd: root, toolCallId: "t1" };
    const first = await runtime.takeDirective(req);
    assert.deepEqual(first, { action: "allow", id: "d-1", scope: "session" });
    const second = await runtime.takeDirective(req);
    assert.deepEqual(second, first, "session 指令可重复应用");
    assert.equal(await runtime.takeDirective({ ...req, command: "npm test" }), undefined);
    assert.equal(await runtime.takeDirective({ ...req, cwd: path.join(root, "sub") }), undefined);
    assert.equal(await runtime.takeDirective({ ...req, command: "npm install; rm -rf /" }), undefined, "不做通配/推断");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("takeDirective：once 原子消费一次；消费失败 ⇒ undefined 且不放行", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root), "once")) });
    await submitApproval(runtime, root, "npm install", "once");
    const req = { command: "npm install", argv: ["npm", "install"], cwd: root, toolCallId: "t1" };
    assert.deepEqual(await runtime.takeDirective(req), { action: "allow", id: "d-1", scope: "once" });
    assert.equal(await runtime.takeDirective(req), undefined, "once 消费后不再生效");
    const listed = await runtime.list();
    if (listed.ok) assert.equal(listed.approval.consumed.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("takeDirective：deny 优先（intent=allow 也返回 deny）；domain/path 无消费者不匹配", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, approvalDenyShell("npm install", root), "session")),
      store: memoryStore(),
    });
    await submitApproval(runtime, root, "npm install", "session");
    const req = { command: "npm install", argv: ["npm", "install"], cwd: root, toolCallId: "t1" };
    assert.deepEqual(await runtime.takeDirective(req, "deny"), { action: "deny", id: "d-1", scope: "session" });
    assert.deepEqual(await runtime.takeDirective(req, "allow"), { action: "deny", id: "d-1", scope: "session" });
    assert.deepEqual(await runtime.takeDirective(req), { action: "deny", id: "d-1", scope: "session" });

    const runtime2 = createRuntime(root, {
      presenter: fixedPresenter(confirmation(root, { kind: "allow", resource: { type: "domain", host: "example.com", wildcard: false } }, "session")),
      store: memoryStore(),
    });
    await runtime2.submitFromInput({
      rawText: "@审批 允许联网 domain=example.com until=session",
      target: "approval",
      projectRoot: root,
      roleId: "worker",
      decisionGroupEnabled: true,
    });
    assert.equal(await runtime2.takeDirective(req), undefined, "domain 指令 consumer:none，gate 不读");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("takeDirective：ledgerErrors>0 ⇒ undefined（消费者按无指令）；跨 target 记录不进入 approvalFacts", async () => {
  const root = await tempRoot();
  try {
    const decisionOnly = createRuntime(root, { presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "session")) });
    await submitDecision(decisionOnly, root, { kind: "select-recommended" }, { until: "session" });
    const facts = decisionOnly.approvalFacts();
    assert.deepEqual(facts.active, []);
    assert.equal(await decisionOnly.takeDirective({ command: "npm install", argv: ["npm", "install"], cwd: root, toolCallId: "t" }), undefined);

    const badStore = memoryStore(["{broken"]);
    const bad = createRuntime(root, { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root))), store: badStore });
    await bad.list();
    assert.equal(bad.approvalFacts().ledgerErrors, 1);
    assert.equal(await bad.takeDirective({ command: "npm install", argv: ["npm", "install"], cwd: root, toolCallId: "t" }), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Pipeline：applyDecisionDirective ——————————————————————

function decisionCard(overrides: Partial<DecisionCardFacts> = {}): DecisionCardFacts {
  return {
    cardKind: "decision",
    requestId: "req-1",
    flowId: "focus",
    options: [
      { id: "a", label: "方案 A：并行", recommended: true },
      { id: "b", label: "方案 B：串行" },
    ],
    ...overrides,
  };
}

test("applyDecisionDirective：select-recommended 代选；emitResult 先于 durable consume", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, { presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "once")) });
    await submitDecision(runtime, root, { kind: "select-recommended" }, { until: "once" });
    const seenActiveDuringEmit: number[] = [];
    const hooks: DecisionHooks = {
      async emitResult(result) {
        assert.deepEqual(result, { kind: "selected", directiveId: "d-1", action: "select-recommended", optionId: "a" });
        const listed = await runtime.list();
        seenActiveDuringEmit.push(listed.ok ? listed.decision.active.length : -1);
      },
    };
    const result = await runtime.applyDecisionDirective(decisionCard(), hooks);
    assert.deepEqual(result, { kind: "selected", id: "d-1", optionId: "a", action: "select-recommended" });
    assert.deepEqual(seenActiveDuringEmit, [1], "emitResult 时 once 尚未消费");
    const listed = await runtime.list();
    if (listed.ok) assert.equal(listed.decision.consumed.length, 1);
    assert.equal(await runtime.applyDecisionDirective(decisionCard(), hooks), undefined, "once 已消费不再应用");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applyDecisionDirective：选项 id/标签/前缀唯一匹配；0/多匹配 no-match 且不消费", async () => {
  const root = await tempRoot();
  try {
    for (const selector of ["b", "方案 B：串行", "方案 B"]) {
      const runtime = createRuntime(root, {
        presenter: fixedPresenter(acknowledged(confirmation(root, { kind: "select-option", selector }, "session"))),
        store: memoryStore(),
      });
      const submitted = await submitDecision(runtime, root, { kind: "select-option", selector }, { until: "session" });
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      const result = await runtime.applyDecisionDirective(decisionCard(), { emitResult() {} });
      assert.deepEqual(result, { kind: "selected", id: "d-1", optionId: "b", action: "select-option" }, selector);
    }
    const noMatchRuntime = createRuntime(root, {
      presenter: fixedPresenter(acknowledged(confirmation(root, { kind: "select-option", selector: "方案 Z" }, "session"))),
      store: memoryStore(),
    });
    await submitDecision(noMatchRuntime, root, { kind: "select-option", selector: "方案 Z" }, { until: "session" });
    let emitted = 0;
    const result = await noMatchRuntime.applyDecisionDirective(decisionCard(), { emitResult() { emitted += 1; } });
    assert.deepEqual(result, { kind: "no-match", ids: ["d-1"] });
    assert.equal(emitted, 0, "no-match 不写可见行、不消费");
    const listed = await noMatchRuntime.list();
    if (listed.ok) assert.equal(listed.decision.active.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applyDecisionDirective：冲突（reject vs select）不消费；scope flowId 不匹配不适用", async () => {
  const root = await tempRoot();
  try {
    const store = memoryStore();
    const runtime = createRuntime(root, {
      presenter: queuePresenter([
        acknowledged(confirmation(root, { kind: "reject" }, "session")),
        confirmation(root, { kind: "select-recommended" }, "session"),
      ]),
      store,
    });
    await submitDecision(runtime, root, { kind: "reject" }, { until: "session" });
    await submitDecision(runtime, root, { kind: "select-recommended" }, { until: "session" });
    const listedBefore = await runtime.list();
    assert.equal(listedBefore.ok, true);
    if (listedBefore.ok) assert.equal(listedBefore.decision.active.length, 2, "前置：两条指令均已落账");
    const result = await runtime.applyDecisionDirective(decisionCard(), { emitResult() {} });
    assert.equal(result?.kind, "conflict");
    if (result?.kind === "conflict") assert.deepEqual([...result.ids].sort(), ["d-1", "d-2"]);
    const listed = await runtime.list();
    if (listed.ok) assert.equal(listed.decision.active.length, 2, "冲突不消费任何一条");

    const scoped = createRuntime(root, { presenter: fixedPresenter(confirmation(root, { kind: "reject" }, "session", { flowId: "other" })) });
    await submitDecision(scoped, root, { kind: "reject" }, { until: "session", scope: { flowId: "other" } });
    assert.equal(await scoped.applyDecisionDirective(decisionCard(), { emitResult() {} }), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applyDecisionDirective：拒绝（项目级/flow）结算 rejected；once 消费", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, {
      presenter: fixedPresenter(acknowledged(confirmation(root, { kind: "reject" }, "once"))),
      store: memoryStore(),
    });
    const submitted = await submitDecision(runtime, root, { kind: "reject" }, { until: "once" });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const seen: string[] = [];
    const result = await runtime.applyDecisionDirective(decisionCard(), {
      emitResult(value) { seen.push(`${value.kind}:${value.action}`); },
    });
    assert.deepEqual(result, { kind: "rejected", id: "d-1", action: "reject" });
    assert.deepEqual(seen, ["rejected:reject"]);
    const listed = await runtime.list();
    if (listed.ok) assert.equal(listed.decision.consumed.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applyDecisionDirective：emitResult 抛错/缺钩子 ⇒ 不消费、返回 undefined；非 decision 卡不处理", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, { presenter: fixedPresenter(confirmation(root, { kind: "select-recommended" }, "session")) });
    await submitDecision(runtime, root, { kind: "select-recommended" }, { until: "session" });
    assert.equal(await runtime.applyDecisionDirective(decisionCard()), undefined, "无钩子不应用");
    assert.equal(
      await runtime.applyDecisionDirective(decisionCard(), { emitResult() { throw new Error("投达失败"); } }),
      undefined,
      "可见行失败不应用",
    );
    const listed = await runtime.list();
    if (listed.ok) assert.equal(listed.decision.active.length, 1, "未消费");
    assert.equal(
      await runtime.applyDecisionDirective({ ...decisionCard(), cardKind: "proposal" as never }, { emitResult() {} }),
      undefined,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— Pipeline：revoke/list ——————————————————————

test("revoke：同 target/active 可撤销；跨 target/不存在明确错误；撤销后 takeDirective 不再命中", async () => {
  const root = await tempRoot();
  try {
    const runtime = createRuntime(root, { presenter: fixedPresenter(confirmation(root, approvalShell("npm install", root), "session")) });
    await submitApproval(runtime, root, "npm install", "session");
    const cross: RevokeResult = await runtime.revoke("d-1", "decision");
    assert.deepEqual(cross, { ok: false, error: "target-mismatch" });
    const ok: RevokeResult = await runtime.revoke("d-1", "approval");
    assert.deepEqual(ok, { ok: true, id: "d-1", target: "approval" });
    const req = { command: "npm install", argv: ["npm", "install"], cwd: root, toolCallId: "t" };
    assert.equal(await runtime.takeDirective(req), undefined);
    const listed: DirectiveListResult = await runtime.list();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.projectRoot, root);
      assert.equal(listed.approval.revoked.length, 1);
      assert.equal(listed.approval.active.length, 0);
      assert.equal(listed.ledgerErrors, 0);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("list：账本读取失败 ⇒ ok:false；坏行 ⇒ ok:true + ledgerErrors（面板显示错误不伪造空）", async () => {
  const root = await tempRoot();
  try {
    const failing: DirectiveStore = {
      relPath: CUSTOMER_DIRECTIVES_REL,
      async append() {},
      async replay() { throw new Error("磁盘不可读"); },
    };
    const runtime = createRuntime(root, { presenter: cancelPresenter(), store: failing });
    assert.deepEqual(await runtime.list(), { ok: false, error: "ledger-unavailable" });

    const badStore = memoryStore(["{broken", createdLine()]);
    const bad = createRuntime(root, { presenter: cancelPresenter(), store: badStore });
    const listed = await bad.list();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.ledgerErrors, 1);
      assert.equal(listed.approval.active.length, 1, "合法行仍可见（不伪造空）");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— task-state 迁移等价 + Q9 回调点 ——————————————————————

test("task-state 迁移等价：默认常量 = A2；append/read/轮转/坏行/旧→新与迁移前一致", async () => {
  const root = await tempRoot("ans-task-equiv-");
  const oldMax = process.env.ANS_TASKS_MAX_BYTES;
  const oldRot = process.env.ANS_TASKS_ROTATIONS;
  try {
    assert.equal(DEFAULT_TASKS_MAX_BYTES, DEFAULT_JSONL_MAX_BYTES);
    assert.equal(DEFAULT_TASKS_ROTATIONS, DEFAULT_JSONL_ROTATIONS);
    process.env.ANS_TASKS_MAX_BYTES = "320";
    process.env.ANS_TASKS_ROTATIONS = "3";
    const at = (n: number) => () => new Date(`2026-11-03T00:00:0${n}.000Z`);
    for (let i = 1; i <= 6; i += 1) {
      const result = await appendTaskEvent(root, taskEvent("task.created", {
        taskId: `t-${i}`,
        from: "chief",
        to: "worker",
        text: `任务 ${i} ${"x".repeat(20)}`,
        sideEffect: "code",
        idempotencyKey: `key-${i}`,
      }, at(i)));
      assert.equal(result.ok, true);
    }
    const file = path.join(root, ...TASKS_STATE_REL.split("/"));
    const names = await fs.readdir(path.dirname(file));
    assert.ok(names.includes("tasks.jsonl.1"), "轮转段 .1 存在（当前文件后移）");
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0);
    assert.ok(state.records.has("t-6"), "最新任务可读");
    // 旧→新：事件顺序严格按 at 升序（迁移前后一致）。
    const ats = state.events.map((event) => event.at);
    assert.deepEqual(ats, [...ats].sort());
    // 坏行不阻塞。
    await fs.appendFile(file, "{broken\n", "utf8");
    const bad = await readTaskState(root);
    assert.equal(bad.errors.length, 1);
    assert.ok(bad.records.has("t-6"));
  } finally {
    if (oldMax === undefined) delete process.env.ANS_TASKS_MAX_BYTES; else process.env.ANS_TASKS_MAX_BYTES = oldMax;
    if (oldRot === undefined) delete process.env.ANS_TASKS_ROTATIONS; else process.env.ANS_TASKS_ROTATIONS = oldRot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— 下载预授权（B1 2026-11-04 download-requests） ——————————————————————

import type {
  DownloadConsumerEpochState,
  DownloadConsumerEpochStore,
} from "../../src/provider/download/public/download-provider.ts";

function fakeEpochStore(state: DownloadConsumerEpochState): DownloadConsumerEpochStore {
  return {
    async ensure() { return state; },
    async read() { return state; },
  };
}

function domainValues(
  kind: "allow" | "deny",
  host: string,
  until: "once" | "session" | "forever" = "session",
): DirectiveConfirmationValues {
  return {
    action: { kind, resource: { type: "domain", host, wildcard: host === "*" || host.startsWith("*.") } },
    scope: {},
    until,
  };
}

function downloadRuntime(options: {
  store: DirectiveStore;
  presenter: DirectivePresenter;
  epoch: DownloadConsumerEpochState;
}): CustomerDirectiveRuntime {
  return createCustomerDirectiveRuntime({
    projectRoot: "/proj",
    sessionId: "session-A",
    present: options.presenter,
    now: NOW,
    store: options.store,
    downloadEpochStore: fakeEpochStore(options.epoch),
  });
}

async function submitDomain(
  runtime: CustomerDirectiveRuntime,
  rawText = "@审批 允许联网 domain=example.com",
): Promise<SubmitResult> {
  return runtime.submitFromInput({
    rawText,
    target: "approval",
    projectRoot: "/proj",
    roleId: "worker",
    clientMessageId: `dl-${Math.random().toString(16).slice(2)}`,
    decisionGroupEnabled: true,
  });
}

test("takeDownloadDirective：epoch 门槛/精确 host/归一/once 消费/deny 优先/通配", async () => {
  const store = memoryStore();
  const runtime = downloadRuntime({
    store,
    presenter: queuePresenter([
      domainValues("allow", "example.com", "session"),
      domainValues("allow", "once.example.com", "once"),
      domainValues("allow", "deny.example.com", "session"),
      domainValues("deny", "deny.example.com", "session"),
      { ...domainValues("allow", "*.wild.example.com", "session"), acknowledged: true },
    ]),
    epoch: { state: "ready", enabledAt: "2026-11-02T00:00:00.000Z", appVersion: "test" },
  });
  assert.equal((await submitDomain(runtime)).ok, true);
  assert.equal((await submitDomain(runtime, "@审批 允许联网 domain=once.example.com")).ok, true);
  assert.equal((await submitDomain(runtime, "@审批 允许联网 domain=deny.example.com")).ok, true);
  assert.equal((await submitDomain(runtime, "@审批 拒绝联网 domain=deny.example.com")).ok, true);
  assert.equal((await submitDomain(runtime, "@审批 允许联网 domain=*.wild.example.com")).ok, true);

  const enabledAt = "2026-11-02T00:00:00.000Z";
  assert.equal((await runtime.takeDownloadDirective({ host: "example.com", enabledAt }))?.action, "allow");
  assert.equal((await runtime.takeDownloadDirective({ host: "EXAMPLE.com.", enabledAt }))?.action, "allow");
  assert.equal(await runtime.takeDownloadDirective({ host: "sub.example.com", enabledAt }), undefined);
  assert.equal(await runtime.takeDownloadDirective({ host: "example.com", enabledAt: "2026-11-04T00:00:00.000Z" }), undefined);

  // once 消费一次；第二次回到审批（undefined）。
  const firstOnce = await runtime.takeDownloadDirective({ host: "once.example.com", enabledAt });
  assert.equal(firstOnce?.action, "allow");
  assert.equal(firstOnce?.scope, "once");
  assert.equal(await runtime.takeDownloadDirective({ host: "once.example.com", enabledAt }), undefined);

  // deny 优先。
  const denied = await runtime.takeDownloadDirective({ host: "deny.example.com", enabledAt });
  assert.equal(denied?.action, "deny");

  // 严格子域（不含 apex）。
  assert.equal((await runtime.takeDownloadDirective({ host: "a.wild.example.com", enabledAt }))?.action, "allow");
  assert.equal(await runtime.takeDownloadDirective({ host: "wild.example.com", enabledAt }), undefined);

  // `*` 匹配任意主机（独立运行时，避免与精确 host 用例互相干扰）。
  const anyRuntime = downloadRuntime({
    store: memoryStore(),
    presenter: queuePresenter([{ ...domainValues("allow", "*", "session"), acknowledged: true }]),
    epoch: { state: "ready", enabledAt: "2026-11-02T00:00:00.000Z", appVersion: "test" },
  });
  assert.equal((await submitDomain(anyRuntime, "@审批 允许联网 domain=*")).ok, true);
  assert.equal((await anyRuntime.takeDownloadDirective({ host: "any.other.test", enabledAt }))?.action, "allow");
});

test("list()：G8 A epoch 投影——旧 domain ⇒ consumer:none；新 domain ⇒ download；path 不变", async () => {
  const store = memoryStore();
  const runtime = downloadRuntime({
    store,
    presenter: queuePresenter([
      domainValues("allow", "example.com", "session"),
      { action: { kind: "allow", resource: { type: "path", path: "/tmp/x" } }, scope: {}, until: "session" },
    ]),
    epoch: { state: "ready", enabledAt: "2026-11-04T00:00:00.000Z", appVersion: "test" },
  });
  assert.equal((await submitDomain(runtime)).ok, true);
  assert.equal((await submitDomain(runtime, "@审批 允许外部目录 path=/tmp/x")).ok, true);
  const listed = await runtime.list();
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  const domain = listed.approval.active.find((view) => view.action.kind === "allow" && view.action.resource.type === "domain");
  const pathView = listed.approval.active.find((view) => view.action.kind === "allow" && view.action.resource.type === "path");
  assert.equal(domain?.consumer, "none", "epoch 之后的旧指令投影为 none");
  assert.equal(pathView?.consumer, "none");

  // 新 epoch（早于创建时间）⇒ domain 保持 download。
  const fresh = downloadRuntime({
    store: memoryStore(store.lines),
    presenter: queuePresenter([]),
    epoch: { state: "ready", enabledAt: "2026-11-02T00:00:00.000Z", appVersion: "test" },
  });
  const freshListed = await fresh.list();
  assert.equal(freshListed.ok, true);
  if (!freshListed.ok) return;
  const freshDomain = freshListed.approval.active.find((view) => view.action.kind === "allow" && view.action.resource.type === "domain");
  assert.equal(freshDomain?.consumer, "download");
});

test("consumerOf：domain 创建时基线为 download（Service 视图）；系统 boot 事件自动 acceptance", () => {
  const service = createDirectiveService({
    projectRoot: "/proj",
    sessionId: "s",
    store: memoryStore(),
    now: NOW,
  });
  return service.ready().then(async () => {
    const created = await service.create({
      target: "approval",
      action: { kind: "allow", resource: { type: "domain", host: "example.com", wildcard: false } },
      scope: {},
      until: "session",
      rawText: "@审批 允许联网 domain=example.com",
      projectRoot: "/proj",
      decisionGroupEnabled: true,
    });
    assert.equal(created.ok, true);
    const listed = service.list();
    assert.equal(listed.approval.active[0]?.consumer, "download");
  });
});

// —————————————————————— C1 双向可赋值（type-only；由 typecheck 验证） ——————————————————————

/** type-only 形状锁：C1 可按 B1 冻结类型赋值；缺 `decisionGroupEnabled` 必须编译失败。 */
function _c1TypeOnlyChecks(): void {
  const base: SubmitFromInput = {
    rawText: "@审批 x",
    target: "approval",
    projectRoot: "/p",
    roleId: "r",
    decisionGroupEnabled: true,
  };
  const withRuntime: SubmitFromInput = { ...base, runtime: "pi", clientMessageId: "m" };
  const success: SubmitResult = { ok: true, id: "d-1", target: "approval" };
  const cancelled: SubmitResult = { ok: false, error: "cancelled", directiveCancelled: true };
  const presenter: DirectivePresenter = {
    async present() {
      return { decision: "confirm", values: { action: { kind: "select-recommended" }, scope: {}, until: "session" } };
    },
  };
  const hooks: DecisionHooks = { emitResult() {} };
  const apply: DecisionApplyResult = { kind: "selected", id: "d-1", optionId: "a", action: "select-option" };
  const revoke: RevokeResult = { ok: true, id: "d-1", target: "approval" };
  const listed: DirectiveListResult = {
    ok: true,
    projectRoot: "/p",
    approval: { active: [], consumed: [], revoked: [], expired: [] },
    decision: { active: [], consumed: [], revoked: [], expired: [] },
    ledgerErrors: 0,
  };
  void [withRuntime, success, cancelled, presenter, hooks, apply, revoke, listed];
  // @ts-expect-error decisionGroupEnabled 必填（P1-CAP-04）
  const missingSwitch: SubmitFromInput = {
    rawText: "@审批 x",
    target: "approval",
    projectRoot: "/p",
    roleId: "r",
  };
  void missingSwitch;
}
void _c1TypeOnlyChecks;
