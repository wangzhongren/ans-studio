// test/编排/shell-judge-concurrency.test.ts
// 会话内 shell 判断并发池离线单测：**假 createAdapter、真 createShellJudge，绝不调用真实模型**。
//
// 2026-10-19 真机：前端同一轮并行发出 4 条 shell（`/`、`app.js`、`styles.css`、`wc`），
// 旧单飞 `busy` 使后 3 条中 2 条立刻回落手动（`shell-confirm.presented requestId=sc-8 pendingCount=3`）。
// 本文件覆盖：默认上限 3 的 4 并发、超限 FIFO 排队后成功、排队超时、排队中止、队列有界、
// 单条失败隔离、每请求独立计时、闭包隔离（不同 createShellJudge 不共享池）、并发下防循环计数。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { DiagnosticLog, ShellJudgeRequest } from "../../src/model/runtime.ts";
import type { RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createShellJudge,
  DEFAULT_SHELL_JUDGE_CONCURRENCY,
  DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS,
  resolveShellJudgeConcurrency,
  resolveShellJudgeQueueTimeoutMs,
  SHELL_JUDGE_CONCURRENCY_ENV,
  SHELL_JUDGE_CONCURRENCY_MAX,
  SHELL_JUDGE_CONCURRENCY_MIN,
  SHELL_JUDGE_QUEUE_TIMEOUT_ENV,
  type ShellJudgeFn,
} from "../../src/common/编排/shell-judge.ts";

const PROJECT: ProjectConfig = {
  projectRoot: process.cwd(),
  skillRoot: process.cwd(),
  roles: {},
};

function request(overrides: Partial<ShellJudgeRequest> = {}): ShellJudgeRequest {
  return {
    command: "npm test",
    argv: ["npm", "test"],
    cwd: PROJECT.projectRoot,
    toolCallId: "call-1",
    roleId: "编排",
    projectRoot: PROJECT.projectRoot,
    runtime: "claude",
    policy: "project",
    tier: "risky",
    reason: "risky 命令：pm 判放行，仍须操作者确认",
    turnText: "请运行测试并修复失败用例。",
    ...overrides,
  };
}

interface LoggedEvent {
  event: string;
  fields?: Record<string, unknown>;
}

function captureLogger(): { logger: DiagnosticLog; events: LoggedEvent[] } {
  const events: LoggedEvent[] = [];
  return {
    events,
    logger: {
      record(event, fields) {
        events.push({ event, fields });
      },
      error() {
        // 本测试不消费 error 事件。
      },
    },
  };
}

interface ControlledSession {
  index: number;
  release: () => void;
}

interface HarnessOptions {
  /** 第 N 次 bindRole 是否抛错（用于单条失败隔离）。 */
  throwOnBind?: (index: number) => boolean;
  /** 第 N 次判断交回的原始裁决（缺省 allow）。 */
  verdict?: (index: number) => unknown;
  /** 第 N 条不再交回裁决（静默挂起，用于独立超时）。 */
  silent?: (index: number) => boolean;
}

interface Harness {
  factory: RuntimeAdapterFactory;
  startedCount: () => number;
  waitForStarted: (count: number, timeoutMs?: number) => Promise<void>;
  release: (index: number) => void;
  disposedIndexes: number[];
}

/**
 * 可控并发适配器：每次 bindRole 生成一个独立会话；prompt 交回裁决后**挂起**，
 * 直到测试显式 `release(index)` 才返回并由 events 落 settled——这样才能观察到
 * 「前 N 条正在跑、第 N+1 条排队」的真实时序。
 */
function makeHarness(options: HarnessOptions = {}): Harness {
  const sessions = new Map<number, ControlledSession>();
  const disposedIndexes: number[] = [];
  let bindCalls = 0;

  const factory: RuntimeAdapterFactory = (_gate, capabilities) => ({
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      const index = bindCalls;
      bindCalls += 1;
      if (options.throwOnBind?.(index) === true) throw new Error(`判断会话 ${index} 开不了`);
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => { openGate = resolve; });
      sessions.set(index, { index, release: openGate });
      return {
        async prompt() {
          if (options.silent?.(index) !== true) {
            const verdict = options.verdict?.(index) ?? { verdict: "allow", reason: `并发判断 ${index}` };
            capabilities?.shellJudge?.report(verdict);
          }
          await gate;
        },
        async *events() {
          yield { kind: "settled" as const, summary: "settled" };
        },
        async dispose() {
          disposedIndexes.push(index);
          openGate();
        },
        async abort() {
          openGate();
        },
      };
    },
  });

  async function waitForStarted(count: number, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (bindCalls < count) {
      if (Date.now() > deadline) {
        throw new Error(`等待判断会话启动超时（期望 ${count}，实际 ${bindCalls}）`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  return {
    factory,
    startedCount: () => bindCalls,
    waitForStarted,
    release(index) {
      const session = sessions.get(index);
      assert.ok(session !== undefined, `第 ${index} 个判断会话尚未创建`);
      session.release();
    },
    disposedIndexes,
  };
}

function makeJudge(
  factory: RuntimeAdapterFactory,
  options: {
    concurrency?: number;
    queueTimeoutMs?: number;
    maxQueue?: number;
    timeoutMs?: number;
    maxDeny?: number;
    logger?: DiagnosticLog;
  } = {},
): ShellJudgeFn {
  return createShellJudge({
    project: PROJECT,
    runtime: "claude",
    createAdapter: factory,
    timeoutMs: options.timeoutMs ?? 2000,
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    ...(options.queueTimeoutMs !== undefined ? { queueTimeoutMs: options.queueTimeoutMs } : {}),
    ...(options.maxQueue !== undefined ? { maxQueue: options.maxQueue } : {}),
    ...(options.maxDeny !== undefined ? { maxDenyPerCommand: options.maxDeny } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
}

// —————————————————————— 1. 并发上限 / 排队时限解析 ——————————————————————

test("并发与排队配置：默认 3 / 60s；env 覆盖；非法回默认；并发夹在 1..8", () => {
  assert.equal(DEFAULT_SHELL_JUDGE_CONCURRENCY, 3);
  assert.equal(DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS, 60_000);

  assert.equal(resolveShellJudgeConcurrency(undefined, {}), 3);
  assert.equal(resolveShellJudgeConcurrency(undefined, { [SHELL_JUDGE_CONCURRENCY_ENV]: "5" }), 5);
  assert.equal(resolveShellJudgeConcurrency(undefined, { [SHELL_JUDGE_CONCURRENCY_ENV]: "99" }), SHELL_JUDGE_CONCURRENCY_MAX);
  assert.equal(resolveShellJudgeConcurrency(undefined, { [SHELL_JUDGE_CONCURRENCY_ENV]: "0" }), 3);
  for (const bad of ["", "-1", "1.5", "abc", "9007199254740993"]) {
    assert.equal(resolveShellJudgeConcurrency(undefined, { [SHELL_JUDGE_CONCURRENCY_ENV]: bad }), 3, `非法并发 ${JSON.stringify(bad)}`);
  }
  assert.equal(resolveShellJudgeConcurrency(2, { [SHELL_JUDGE_CONCURRENCY_ENV]: "5" }), 2, "显式选项优先");
  assert.equal(resolveShellJudgeConcurrency(100, {}), SHELL_JUDGE_CONCURRENCY_MAX, "显式选项也夹上限");
  assert.equal(SHELL_JUDGE_CONCURRENCY_MIN, 1);
  assert.equal(resolveShellJudgeConcurrency(0, {}), 3, "显式 0 视为非法，回默认");

  assert.equal(resolveShellJudgeQueueTimeoutMs(undefined, {}), 60_000);
  assert.equal(resolveShellJudgeQueueTimeoutMs(undefined, { [SHELL_JUDGE_QUEUE_TIMEOUT_ENV]: "1234" }), 1234);
  for (const bad of ["", "0", "-1", "1.5", "abc", "9007199254740993"]) {
    assert.equal(
      resolveShellJudgeQueueTimeoutMs(undefined, { [SHELL_JUDGE_QUEUE_TIMEOUT_ENV]: bad }),
      DEFAULT_SHELL_JUDGE_QUEUE_TIMEOUT_MS,
      `非法排队时限 ${JSON.stringify(bad)} 应回默认`,
    );
  }
  assert.equal(resolveShellJudgeQueueTimeoutMs(25, { [SHELL_JUDGE_QUEUE_TIMEOUT_ENV]: "1234" }), 25, "显式选项优先");
});

// —————————————————————— 2. 默认上限 3：4 并发全部得到判断结果 ——————————————————————

test("env `ANS_SHELL_JUDGE_CONCURRENCY` 生效：设为 1 时第二条排队", async () => {
  const previous = process.env[SHELL_JUDGE_CONCURRENCY_ENV];
  process.env[SHELL_JUDGE_CONCURRENCY_ENV] = "1";
  try {
    const harness = makeHarness();
    const judge = makeJudge(harness.factory);
    const first = judge(request({ toolCallId: "call-1" }));
    await harness.waitForStarted(1);
    const second = judge(request({ toolCallId: "call-2" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(harness.startedCount(), 1, "env 并发 1 时第二条必须排队");
    harness.release(0);
    await harness.waitForStarted(2);
    harness.release(1);
    assert.equal((await first).verdict, "allow");
    assert.equal((await second).verdict, "allow");
  } finally {
    if (previous === undefined) delete process.env[SHELL_JUDGE_CONCURRENCY_ENV];
    else process.env[SHELL_JUDGE_CONCURRENCY_ENV] = previous;
  }
});

test("默认上限 3：同轮 4 条并发全部 allow，无 manual/unavailable；第 4 条排队后成功", async () => {
  const harness = makeHarness();
  const { logger, events } = captureLogger();
  const judge = makeJudge(harness.factory, { logger });
  const pending = [1, 2, 3, 4].map((n) =>
    judge(request({ toolCallId: `call-${n}`, command: `echo ${n}`, argv: ["echo", String(n)] })),
  );

  await harness.waitForStarted(3);
  assert.equal(harness.startedCount(), 3, "第 4 条必须排队，不得提前判断，也不得回落 manual");
  harness.release(0);
  harness.release(1);
  harness.release(2);
  await harness.waitForStarted(4, 1000);
  harness.release(3);

  const outcomes = await Promise.all(pending);
  assert.equal(outcomes.length, 4);
  for (const out of outcomes) {
    assert.equal(out.verdict, "allow");
    assert.equal(out.reasonCode, "necessary");
  }

  assert.ok(events.some((entry) => entry.event === "shell-judge.queued"), "必须有排队诊断事件");
  const queued = events.find((entry) => entry.event === "shell-judge.queued");
  assert.equal(queued?.fields?.queueDepth, 1, "第 4 条入队时队列深度 1");
  assert.equal(queued?.fields?.count, 3, "入队时在跑条数进入诊断");
  assert.ok(events.some((entry) => entry.event === "shell-judge.queue.granted"), "槽位移交应有诊断事件");
  assert.equal(harness.disposedIndexes.length, 4, "四个判断会话都必须 dispose");
});

test("上限 1：3 条请求按 FIFO 依次排队、依次成功", async () => {
  const harness = makeHarness();
  const judge = makeJudge(harness.factory, { concurrency: 1 });
  const pending = [1, 2, 3].map((n) =>
    judge(request({ toolCallId: `call-${n}`, command: `echo ${n}`, argv: ["echo", String(n)] })),
  );

  await harness.waitForStarted(1);
  assert.equal(harness.startedCount(), 1);
  harness.release(0);
  await harness.waitForStarted(2);
  assert.equal(harness.startedCount(), 2);
  harness.release(1);
  await harness.waitForStarted(3);
  assert.equal(harness.startedCount(), 3);
  harness.release(2);

  const outcomes = await Promise.all(pending);
  assert.deepEqual(outcomes.map((out) => out.verdict), ["allow", "allow", "allow"]);
  assert.deepEqual(harness.disposedIndexes, [0, 1, 2], "判断会话按 FIFO 顺序创建并收口");
});

// —————————————————————— 3. 排队超时 / 排队中止 ——————————————————————

test("排队超时 → manual/queue-timeout，reason 含「排队超时」与实际在跑条数", async () => {
  const harness = makeHarness();
  const { logger, events } = captureLogger();
  const judge = makeJudge(harness.factory, { concurrency: 1, queueTimeoutMs: 40, logger });
  const first = judge(request({ toolCallId: "call-running" }));
  await harness.waitForStarted(1);

  const second = await judge(request({ toolCallId: "call-waiting" }));
  assert.equal(second.verdict, "manual");
  assert.equal(second.reasonCode, "queue-timeout");
  assert.match(second.reason ?? "", /排队超时/);
  assert.match(second.reason ?? "", />40ms/);
  assert.match(second.reason ?? "", /仍有 1 条判断在跑/);

  const timeoutEvent = events.find((entry) => entry.event === "shell-judge.queue.timeout");
  assert.ok(timeoutEvent !== undefined, "必须有排队超时诊断事件");
  assert.equal(timeoutEvent?.fields?.timeoutMs, 40);
  assert.equal(timeoutEvent?.fields?.count, 1, "超时时在跑条数");

  harness.release(0);
  assert.equal((await first).verdict, "allow");
});

test("排队中外部中止 → manual/aborted（不建判断会话，也不放行）", async () => {
  const harness = makeHarness();
  const judge = makeJudge(harness.factory, { concurrency: 1, queueTimeoutMs: 5000 });
  const first = judge(request({ toolCallId: "call-running" }));
  await harness.waitForStarted(1);

  const controller = new AbortController();
  const second = judge(request({ toolCallId: "call-waiting" }), controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  const out = await second;
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "aborted");
  assert.match(out.reason ?? "", /本轮已中止/);
  assert.equal(harness.startedCount(), 1, "排队中止的请求不得建立判断会话");

  harness.release(0);
  assert.equal((await first).verdict, "allow");
});

test("有界队列：排队已满 → 立即 manual/queue-full（不无限堆积、不假装成功）", async () => {
  const harness = makeHarness();
  const { logger, events } = captureLogger();
  const judge = makeJudge(harness.factory, { concurrency: 1, maxQueue: 1, logger });
  const first = judge(request({ toolCallId: "call-running" }));
  await harness.waitForStarted(1);
  const second = judge(request({ toolCallId: "call-waiting" }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const third = await judge(request({ toolCallId: "call-overflow" }));
  assert.equal(third.verdict, "manual");
  assert.equal(third.reasonCode, "queue-full");
  assert.match(third.reason ?? "", /排队已满/);
  assert.equal(harness.startedCount(), 1, "队列已满的请求不得建立判断会话");
  assert.ok(events.some((entry) => entry.event === "shell-judge.queue.full"));

  harness.release(0);
  await harness.waitForStarted(2);
  harness.release(1);
  assert.equal((await first).verdict, "allow");
  assert.equal((await second).verdict, "allow");
});

// —————————————————————— 4. 失败隔离 / 独立计时 ——————————————————————

test("单条判断失败不影响并发中的其他条（各自独立结果）", async () => {
  const harness = makeHarness({ throwOnBind: (index) => index === 0 });
  const judge = makeJudge(harness.factory, { concurrency: 2, timeoutMs: 2000 });
  const failing = judge(request({ toolCallId: "call-broken" }));
  const healthy = judge(request({ toolCallId: "call-healthy" }));
  await harness.waitForStarted(2);

  const broken = await failing;
  assert.equal(broken.verdict, "manual");
  assert.equal(broken.reasonCode, "unavailable");
  assert.match(broken.reason ?? "", /判断会话不可用/);

  let healthySettled = false;
  void healthy.then(() => { healthySettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(healthySettled, false, "另一条仍在判断中，不应被失败条影响");

  harness.release(1);
  const ok = await healthy;
  assert.equal(ok.verdict, "allow");
  assert.equal(ok.reasonCode, "necessary");
});

test("每请求独立计时：一条按时完成、另一条独立超时", async () => {
  const harness = makeHarness({ silent: (index) => index === 1 });
  const judge = makeJudge(harness.factory, { concurrency: 2, timeoutMs: 60 });
  const fast = judge(request({ toolCallId: "call-fast" }));
  const slow = judge(request({ toolCallId: "call-slow" }));
  await harness.waitForStarted(2);

  harness.release(0);
  assert.equal((await fast).verdict, "allow");
  const timedOut = await slow;
  assert.equal(timedOut.verdict, "manual");
  assert.equal(timedOut.reasonCode, "timeout");
  assert.match(timedOut.reason ?? "", /判断超时（>60ms）/);
});

// —————————————————————— 5. 闭包隔离 / 并发下防循环 ——————————————————————

test("并发池不跨 createShellJudge 实例共享", async () => {
  const harnessA = makeHarness();
  const harnessB = makeHarness();
  const judgeA = makeJudge(harnessA.factory, { concurrency: 1 });
  const judgeB = makeJudge(harnessB.factory, { concurrency: 1 });

  const a = judgeA(request({ toolCallId: "call-a" }));
  await harnessA.waitForStarted(1);
  const b = judgeB(request({ toolCallId: "call-b" }));
  await harnessB.waitForStarted(1); // 若共享全局池，B 会排队而不会启动
  assert.equal(harnessB.startedCount(), 1);

  harnessA.release(0);
  harnessB.release(0);
  assert.equal((await a).verdict, "allow");
  assert.equal((await b).verdict, "allow");
});

test("并发下的 denyCounts：两条同命令并发 deny 都计数，随后命中 retry-capped", async () => {
  const harness = makeHarness({ verdict: () => ({ verdict: "deny", reason: "不必要" }) });
  const judge = makeJudge(harness.factory, { concurrency: 2, maxDeny: 2 });
  const first = judge(request({ toolCallId: "call-1" }));
  const second = judge(request({ toolCallId: "call-2" }));
  await harness.waitForStarted(2);
  harness.release(0);
  harness.release(1);
  assert.equal((await first).verdict, "deny");
  assert.equal((await second).verdict, "deny");

  const capped = await judge(request({ toolCallId: "call-3" }));
  assert.equal(capped.verdict, "manual");
  assert.equal(capped.reasonCode, "retry-capped");
  assert.equal(harness.startedCount(), 2, "上限命中后不得再建立判断会话");
});
