// P0-2「停当前轮次」第一环：RoleSession.abort? 契约形状钉 + 真适配器 abort 行为。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 运行时**（SDK 级用例在用例内部动态 import，
// 未安装则整组跳过——同 customer-wait-end-to-end / settled-once 先例）。
//
// 覆盖：
//   1. 契约形状钉（无 Pi）：`abort` **可选**——无 abort 的会话对象（含假适配器替身）仍满足
//      `RoleSession`（既有实现不破坏）；返回型允许「同步 void」与「Promise<void>」两态；
//   2. makeRoleSession 桩件（无 Pi）：真适配器组装出的会话实现 abort 且**透传**底层
//      `session.abort()`；dispose 顺序与提取前逐字一致（退订 → SDK dispose → queue.close）；
//   3. SDK 级（faux provider，离线）：
//      a. 确认卡**挂起中** abort → 轮次以 settled 收尾（恰 1）+ 等待中的交互 fail-closed 返回
//         （gate 收闸）+ 进行中的 prompt promise 正常返回 + 会话可继续发下一条（不销毁）；
//      b. 无进行中轮次 abort = **no-op 不抛错**（prompt 前 / 两轮之间），会话随后照常工作。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFakeRuntimeAdapter, type RoleSession, type SessionEvent, type CustomerInputFn } from "../../src/provider/pi/session.ts";
import { buildGovernedTools, REQUEST_CONFIRMATION_TOOL_NAME } from "../../src/provider/pi/tools.ts";
import { buildGovernanceExtension, makeRoleSession, toPiTool, wireSettledOnce, type PromptCapableSession, type RoleSessionDeps } from "../../src/common/pi-adapter/real-adapter.ts";
import { createEventQueue, type EventQueue } from "../../src/common/pi-adapter/event-queue.ts";
import { createInteractionGate, type InteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import type { StageLogger } from "../../src/common/pi-adapter/logger.ts";
import { makeGate, makeRole } from "./fixtures.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

/** 静默日志器（桩件，同 prompt-images.test.ts 先例）。 */
function silentLogger(): StageLogger {
  return { stage: () => {}, trace: () => {}, traceEnabled: false };
}

// —————————————————————— 1. 契约形状钉（无 Pi 依赖） ——————————————————————

test("契约形状钉：abort 可选——无 abort 的会话对象（含假适配器替身）仍满足 RoleSession（既有实现不破坏）", async () => {
  const queue = createEventQueue<SessionEvent>();
  // 编译期即钉：缺 abort 的对象可赋给 RoleSession（可选性成立；若有人把它改成必填，typecheck 先红）。
  const minimal: RoleSession = {
    prompt: async () => {},
    events: () => queue.stream,
    dispose: async () => queue.close(),
  };
  assert.equal(minimal.abort, undefined, "无 abort 的实现必须合法（可选性）");

  // 假适配器（替身）保持不实现 abort——旧行为逐字不变，且仍满足契约。
  const adapter = createFakeRuntimeAdapter({ gate: makeGate({ skill: [], project: [] }) });
  const fakeSession = await adapter.bindRole(makeRole());
  assert.equal(fakeSession.abort, undefined, "假适配器不实现 abort（缺席即「不支持停止」，上层如实告知）");
  await fakeSession.dispose();
});

test("契约形状钉：abort 返回型允许「同步 void」与「Promise<void>」两态（P0-2 冻结形状）", () => {
  const base = (): Omit<RoleSession, "abort"> => ({
    prompt: async () => {},
    events: () => createEventQueue<SessionEvent>().stream,
    dispose: async () => {},
  });
  // 三种实现形态都必须可赋给契约（编译期）；运行期调用不抛错。
  const syncVoid: RoleSession = { ...base(), abort: () => {} };
  const returnsPromise: RoleSession = { ...base(), abort: () => Promise.resolve() };
  const asyncFn: RoleSession = { ...base(), abort: async () => {} };
  assert.equal(syncVoid.abort?.(), undefined, "同步 void 形态：返回 undefined");
  assert.ok(returnsPromise.abort?.() instanceof Promise, "Promise 形态：返回 Promise");
  assert.ok(asyncFn.abort?.() instanceof Promise, "async 函数形态：返回 Promise");
});

// —————————————————————— 2. makeRoleSession 桩件（无 Pi 依赖） ——————————————————————

/** 记录调用的桩件 SDK 会话（PromptCapableSession 形状）。 */
function stubSdkSession(): { session: PromptCapableSession; calls: { prompt: number; abort: number; dispose: number } } {
  const calls = { prompt: 0, abort: 0, dispose: 0 };
  const session: PromptCapableSession = {
    async prompt(): Promise<void> {
      calls.prompt += 1;
    },
    async abort(): Promise<void> {
      calls.abort += 1;
    },
    dispose(): void {
      calls.dispose += 1;
    },
  };
  return { session, calls };
}

/** 构造 makeRoleSession 依赖（含事件留档，供断言）。 */
function makeDeps(session: PromptCapableSession): RoleSessionDeps & { events: SessionEvent[] } {
  const queue = createEventQueue<SessionEvent>();
  const events: SessionEvent[] = [];
  return {
    session,
    promptMs: 30000,
    gate: createInteractionGate(),
    emit: (event) => {
      events.push(event);
      queue.push(event);
    },
    log: silentLogger(),
    queue,
    unsubscribe: () => {},
    events,
  };
}

test("makeRoleSession（桩件）：abort() 透传底层 session.abort()；反复调用不抛错", async () => {
  const sdk = stubSdkSession();
  const roleSession = makeRoleSession(makeDeps(sdk.session));
  assert.equal(typeof roleSession.abort, "function", "真适配器组装出的会话必须实现 abort（契约可选性的实现侧）");
  await roleSession.abort?.();
  assert.equal(sdk.calls.abort, 1, "abort 恰好透传一次到底层 session.abort");
  await roleSession.abort?.();
  assert.equal(sdk.calls.abort, 2, "再次调用仍透传且不抛错（无在飞轮次的 no-op 由 SDK 级用例证明）");
});

test("makeRoleSession（桩件）：dispose 顺序与提取前逐字一致（退订 → SDK dispose → queue.close）；events 流不变", async () => {
  const order: string[] = [];
  const sdk: PromptCapableSession = {
    async prompt(): Promise<void> {},
    async abort(): Promise<void> {},
    dispose(): void {
      order.push("sdk-dispose");
    },
  };
  const inner = createEventQueue<SessionEvent>();
  const queue: EventQueue<SessionEvent> = {
    push: (event) => inner.push(event),
    close: () => order.push("queue-close"),
    get stream() {
      return inner.stream;
    },
  };
  const roleSession = makeRoleSession({
    session: sdk,
    promptMs: 30000,
    gate: createInteractionGate(),
    emit: () => {},
    log: silentLogger(),
    queue,
    unsubscribe: () => order.push("unsubscribe"),
  });
  assert.equal(roleSession.events(), inner.stream, "events() 仍返回队列流（提取不改行为）");
  await roleSession.dispose();
  assert.deepEqual(order, ["unsubscribe", "sdk-dispose", "queue-close"], "dispose 顺序：先退订，再 SDK dispose，最后关队列");
});

// —————————————————————— 3. SDK 级（faux provider，离线；未安装则跳过） ——————————————————————

/**
 * 造一个**出厂接线**的离线会话：faux provider 作脚本化模型 + 真实 createAgentSession + 受治理工具
 * + `wireSettledOnce`（settled 唯一发射点）+ **生产 `makeRoleSession`**（prompt/abort/dispose 全走
 * 真适配器组装代码）——接线逐字复刻 real-adapter.bindRole（同 customer-wait-end-to-end 先例）。
 */
async function boot(opts: {
  dir: string;
  script: "confirm" | "plain";
  customerInput?: CustomerInputFn;
}): Promise<{
  roleSession: RoleSession;
  gate: InteractionGate;
  events: SessionEvent[];
}> {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import(
    "@earendil-works/pi-ai"
  );

  const gate = createInteractionGate();
  const governed = buildGovernedTools(makeGate({ skill: [], project: [] }), {
    readRoot: opts.dir,
    writeRoot: opts.dir,
    customerInput: opts.customerInput,
    interactionGate: gate,
  });
  const customTools = governed.map((tool) => toPiTool(tool as never));

  // 出厂事件面（与 real-adapter.bindRole 同构）：队列 + emit 先行，治理扩展（message_end→message
  // 等映射）挂进 resourceLoader——这样第二轮助手消息才会以 message 事件出现。
  const queue = createEventQueue<SessionEvent>();
  const events: SessionEvent[] = [];
  const emit = (event: SessionEvent): void => {
    events.push(event);
    queue.push(event);
  };
  const extension = buildGovernanceExtension(makeGate({ skill: [], project: [] }), emit, false);

  const faux = fauxProvider();
  faux.setResponses(
    opts.script === "confirm"
      ? [
          fauxAssistantMessage([fauxToolCall(REQUEST_CONFIRMATION_TOOL_NAME, { title: "预览角色卡" })]),
          fauxAssistantMessage("收尾"),
        ]
      : [fauxAssistantMessage("好的")],
  );
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id);
  assert.ok(model != null, "faux 模型应可解析");

  const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
  const resourceLoader = new DefaultResourceLoader({
    cwd: opts.dir,
    agentDir: opts.dir,
    extensionFactories: [extension],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    settingsManager,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: opts.dir,
    noTools: "builtin",
    customTools: customTools as never,
    resourceLoader,
    model: model as never,
    modelRuntime: runtime,
    sessionManager: SessionManager.inMemory(opts.dir),
    settingsManager,
  });

  // 出厂接线（与 real-adapter.bindRole 逐字同构）：settled 唯一发射点 + 生产 makeRoleSession。
  const unsubscribe = wireSettledOnce(session, emit);
  const roleSession = makeRoleSession({
    session,
    promptMs: 30000,
    gate,
    emit,
    log: silentLogger(),
    queue,
    unsubscribe,
  });
  return { roleSession, gate, events };
}

test("P0-2 主用例（faux 离线）：确认卡挂起中 abort → settled 恰 1 收尾 + 等待中的交互 fail-closed 返回 + prompt promise 正常返回 + 会话可继续", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-abort-"));
  try {
    let startedResolve: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    // 客户**永不作答**：等待只能靠 abort 解开——正是 P0-2 要停的「跑飞轮次」。
    const customerInput: CustomerInputFn = () =>
      new Promise((resolve) => {
        startedResolve();
        void resolve;
      });

    const { roleSession, gate, events } = await boot({ dir, script: "confirm", customerInput });
    try {
      const round = roleSession.prompt("请先向客户确认");
      await started; // 确认卡已挂起（会话在等客户）
      assert.equal(gate.isWaiting(), true, "前置：交互工具确已进入等待（gate 计数 > 0）");

      await roleSession.abort?.(); // 停当前轮次——必须不抛错（消费方写法即契约钉的 `abort?.()`）
      await round; // 进行中的 prompt promise **正常返回**（SDK 把中止落成 stopReason:"aborted" 收尾，不向上拒绝）
      assert.equal(gate.isWaiting(), false, "abort 带动等待中的客户确认 fail-closed 返回（run 级 signal → raceAbort → askCustomer 收闸）");

      const settled = events.filter((e) => e.kind === "settled").length;
      assert.equal(settled, 1, "中止后 settled 仍发射且恰 1（既有行为 + X-1 唯一发射点）——消费方不会挂起");

      // 会话未销毁：可继续发下一条（历史与模型上下文保留）。
      await roleSession.prompt("继续收尾");
      assert.equal(events.filter((e) => e.kind === "settled").length, 2, "abort 后会话仍可继续发下一条并正常 settle（不销毁会话）");
      assert.ok(
        events.some((e) => e.kind === "message" && e.summary === "收尾"),
        "第二轮的助手消息进入事件流（会话确实活着、上下文续起）",
      );
    } finally {
      await roleSession.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P0-2：无进行中轮次 abort = no-op 不抛错（prompt 前 / 两轮之间），会话随后照常工作（faux 离线）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-abort2-"));
  try {
    const { roleSession, events } = await boot({ dir, script: "plain" });
    try {
      await roleSession.abort?.(); // 从未 prompt 过——必须 no-op、不抛错
      assert.equal(
        events.filter((e) => e.kind === "settled").length,
        0,
        "无在飞轮次 ⇒ 无 settled（abort 没有凭空造出一轮）",
      );

      await roleSession.prompt("你好");
      assert.equal(events.filter((e) => e.kind === "settled").length, 1, "no-op 之后会话照常工作");

      await roleSession.prompt("再聊一句");
      await roleSession.abort?.(); // 两轮之间（无在飞轮次）——仍 no-op、不抛错
      await roleSession.prompt("最后一句");
      assert.equal(events.filter((e) => e.kind === "settled").length, 3, "轮间 no-op 不产生也不吞掉任何轮次");
    } finally {
      await roleSession.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
