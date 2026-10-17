// test/测试/turn-watch-verify/b-last-resort.test.ts
// 测试角色：1 小时最后兜底独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §5.1/§5.5/§5.6：
//   · 检查时限（注入小值）到点**不中止**；
//   · 注入小 `turnLastResortMs` 才中止；settled 摘要/错误文案明确「最后兜底」，与到点检查区分；
//   · 确认卡挂起期间暂停（有效运行时间）——挂起 2× 时限不中止，解除后继续计；
//   · 非整轮时限不变：shell 命令 600000、审核/确认 120000、构造 120000。
//
// 确定性：mock timers（Date/setTimeout）；挂起 provider 自建；不真等 1 小时。

import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextIO } from "node:timers/promises";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { createInteractionGate, DEFAULT_CONSTRUCT_TIMEOUT_MS, DEFAULT_PROMPT_TIMEOUT_MS, DEFAULT_SHELL_EXEC_TIMEOUT_MS, DEFAULT_SHELL_REVIEW_TIMEOUT_MS, DEFAULT_TURN_LAST_RESORT_MS, isTimeoutError, withPausableTimeout } from "../../../src/common/runtime-core/timeout.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { SessionEvent } from "../../../src/model/runtime.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import { hangingProviderFactory, makeTempProject } from "./fixture.ts";

function projectOf(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:turn-watch" } },
  };
}

async function untilIO(fn: () => boolean, timeoutMs = 3000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > end) throw new Error("独立验证观察超时");
    await nextIO();
  }
}

test("B1 检查时限到点不中止；turnLastResortMs 到点才中止，文案明确「最后兜底」", { timeout: 10000 }, async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const fx = makeTempProject();
  try {
    const provider = hangingProviderFactory();
    const handle = await openRoleSession(
      { roleId: "X", project: projectOf(fx.root), runtime: "pi", persistSession: false },
      { runtimeOptions: { providerFactories: { pi: provider.factory }, promptTimeoutMs: 40, turnLastResortMs: 300 } },
    );
    const events: OrchestrationEvent[] = [];
    const pump = (async () => {
      for await (const event of handle.events()) events.push(event);
    })();
    const rejected = assert.rejects(handle.send("hang"), /本轮最后兜底 超时（300ms）/);
    await untilIO(() => provider.starts.length === 1);

    t.mock.timers.tick(100); // 100ms > 检查时限 40ms，< 兜底 300ms
    await nextIO();
    assert.equal(events.filter((e) => e.kind === "settled").length, 0, "检查时限到点不得中止整轮");
    assert.equal(provider.starts[0].aborted, false);

    t.mock.timers.tick(200);
    await nextIO();
    await rejected;
    await untilIO(() => events.some((e) => e.kind === "settled"));
    const terminals = events.filter((e): e is SessionEvent => e.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0].detail as { outcome: string }).outcome, "timed_out", "兜底到点 outcome 仍为既有 timed_out");
    assert.match(terminals[0].summary, /最后兜底/, "settled 摘要＝最后兜底（区别于到点检查）");
    assert.equal(/到点检查/.test(terminals[0].summary), false);
    assert.equal(provider.starts[0].aborted, true, "兜底到点必须中止轮次");
    await handle.dispose();
    await pump;
  } finally {
    fx.cleanup();
  }
});

test("B2 确认卡挂起期间暂停兜底（同一 withPausableTimeout 原语）：挂起 2× 时限不中止，解除后继续计", async () => {
  const interaction = createInteractionGate();
  let outcome: "pending" | "timeout" = "pending";
  const lastResort = withPausableTimeout(
    new Promise<void>(() => {}),
    120,
    "本轮最后兜底",
    interaction,
  ).then(
    () => {
      outcome = "pending";
    },
    (err: unknown) => {
      outcome = isTimeoutError(err) ? "timeout" : "pending";
      return;
    },
  );
  interaction.begin(); // 客户确认卡挂起
  await new Promise((r) => setTimeout(r, 260)); // 2× 兜底时限
  assert.equal(outcome, "pending", "确认等待期间不得触发兜底");
  interaction.end();
  await Promise.race([lastResort, new Promise((r) => setTimeout(r, 1000))]);
  assert.equal(outcome, "timeout", "解除后按有效运行时间继续计并到点");
});

test("B3 常量与非整轮时限不变：检查默认 300000、兜底 3600000、shell 600000、审核/确认 120000、构造 120000", () => {
  assert.equal(DEFAULT_PROMPT_TIMEOUT_MS, 300_000);
  assert.equal(DEFAULT_TURN_LAST_RESORT_MS, 3_600_000);
  assert.equal(DEFAULT_SHELL_EXEC_TIMEOUT_MS, 600_000);
  assert.equal(DEFAULT_SHELL_REVIEW_TIMEOUT_MS, 120_000);
  assert.equal(DEFAULT_CONSTRUCT_TIMEOUT_MS, 120_000);
});
