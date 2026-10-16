// test/runtime-core/reasoning-effort.test.ts —— G-5 推理强度（wave 1 契约层）：
// ① 冻结值集/环境键映射（单一来源）；② 归一（合法/大小写/空白变体/非法/未设/空串）；
// ③ Service providerFor 读取注入（三键各自生效、未设＝字段缺席、非法⇒未设＋诊断如实、
// 诊断故障不毁会话、跨键不串）。
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import {
  REASONING_EFFORT_ENV_KEYS, REASONING_EFFORT_VALUES,
  isReasoningEffortV1, normalizeReasoningEffortValue, resolveReasoningEffort,
} from "../../src/common/runtime-core/reasoning.ts";
import type { GovernedToolsOptions, RuntimeProviderFactory, RuntimeProviderOptions } from "../../src/model/runtime.ts";
import { deny, role } from "./fixtures.ts";

const ENV_KEYS = ["ANS_CLAUDE_REASONING_EFFORT", "ANS_CODEX_REASONING_EFFORT", "ANS_PI_REASONING_EFFORT"] as const;

/** 三键全量接管（先清后设，未列出的键一律清空），退出还原——单文件内互不串、且不受宿主环境残留影响。 */
async function withEffortEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => Promise<void>): Promise<void> {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] !== undefined) process.env[key] = values[key];
    else delete process.env[key];
  }
  try { await run(); }
  finally { for (const key of ENV_KEYS) { const prior = saved.get(key); if (prior === undefined) delete process.env[key]; else process.env[key] = prior; } }
}

function captureFactory(sink: RuntimeProviderOptions[]): RuntimeProviderFactory {
  return (options) => {
    sink.push(options);
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole(): Promise<never> { throw new Error("fixture：本文件只取证 providerFor 的注入面"); },
    };
  };
}

function spyDiagnostics(): { log: NonNullable<GovernedToolsOptions["diagnostics"]>; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  return { log: { record(event, fields) { events.push({ event, fields }); }, error(event, _error, fields) { events.push({ event, fields }); } }, events };
}

/** 经真实 Service 入口构造一次 providerOptions 捕获（composeContext 即触发 providerFor）。 */
async function captureFor(runtime: "claude" | "codex" | "pi" | "demo", diagnostics?: GovernedToolsOptions["diagnostics"]): Promise<RuntimeProviderOptions> {
  const sink: RuntimeProviderOptions[] = [];
  await createRuntimeAdapter({
    runtime, gate: deny, projectRoot: process.cwd(), skillRoot: process.cwd(),
    ...(diagnostics ? { diagnostics } : {}),
    providerFactories: { [runtime]: captureFactory(sink) },
  }).composeContext(role());
  return sink[0]!;
}

test("冻结值集与环境键：五值恰序（关/低/中/高/极高）；三键逐字；demo 无键面", () => {
  assert.deepEqual([...REASONING_EFFORT_VALUES], ["off", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(REASONING_EFFORT_ENV_KEYS, { claude: "ANS_CLAUDE_REASONING_EFFORT", codex: "ANS_CODEX_REASONING_EFFORT", pi: "ANS_PI_REASONING_EFFORT" });
  for (const value of REASONING_EFFORT_VALUES) assert.equal(isReasoningEffortV1(value), true);
  for (const value of ["minimal", "max", "ultra", "none", "HIGH", "", 42, null, undefined] as const) assert.equal(isReasoningEffortV1(value), false, String(value));
  assert.deepEqual(resolveReasoningEffort("demo", { ANS_PI_REASONING_EFFORT: "high" }), { state: "unset" }, "demo 无推理强度键面，恒未设");
});

test("归一：合法五值＋大小写/空白变体 ⇒ set（规范小写形）；未设/空串/纯空白 ⇒ unset（静默，留空＝平台默认）", () => {
  for (const [raw, effort] of [["off", "off"], ["low", "low"], ["medium", "medium"], ["high", "high"], ["xhigh", "xhigh"], ["HIGH", "high"], ["XHigh", "xhigh"], [" High ", "high"], ["\tOFF\n", "off"]] as const) {
    assert.deepEqual(normalizeReasoningEffortValue(raw), { state: "set", effort }, raw);
  }
  for (const raw of [undefined, null, "", " ", "\t\n "] as const) assert.deepEqual(normalizeReasoningEffortValue(raw), { state: "unset" }, String(raw));
});

test("归一：非法 ⇒ invalid（绝不猜档——minimal/max/ultra/中文标签/任意串均不近似；原值如实带回）", () => {
  for (const raw of ["bogus", "max", "minimal", "ultra", "none", "high!", "极高", "offf", "off low", "0"]) {
    assert.equal(normalizeReasoningEffortValue(raw).state, "invalid", raw);
  }
  assert.deepEqual(normalizeReasoningEffortValue("  bogus  "), { state: "invalid", raw: "bogus" }, "trim 后如实带回");
  const clipped = normalizeReasoningEffortValue("x".repeat(100));
  assert.equal(clipped.state === "invalid" ? clipped.raw.length : -1, 64, "原值截断 64 字符");
});

test("resolve：按运行时各取各键（互不串）；键未设＝unset", () => {
  const env = { ANS_CLAUDE_REASONING_EFFORT: "high", ANS_CODEX_REASONING_EFFORT: "off", ANS_PI_REASONING_EFFORT: "low" };
  assert.deepEqual(resolveReasoningEffort("claude", env), { state: "set", effort: "high" });
  // `off` 是中立合法值（归一层收；Codex 平台无「关」档 ⇒ 落点＝不注入＋如实说明，属适配器映射面）。
  assert.deepEqual(resolveReasoningEffort("codex", env), { state: "set", effort: "off" });
  assert.deepEqual(resolveReasoningEffort("pi", env), { state: "set", effort: "low" });
  assert.deepEqual(resolveReasoningEffort("claude", {}), { state: "unset" });
});

test("Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形）", async () => {
  await withEffortEnv({ ANS_CLAUDE_REASONING_EFFORT: "xhigh" }, async () => {
    assert.equal((await captureFor("claude")).reasoningEffort, "xhigh");
  });
  await withEffortEnv({ ANS_CODEX_REASONING_EFFORT: " High " }, async () => {
    assert.equal((await captureFor("codex")).reasoningEffort, "high", "大小写/空白归一后注入");
  });
  await withEffortEnv({ ANS_PI_REASONING_EFFORT: "medium" }, async () => {
    assert.equal((await captureFor("pi")).reasoningEffort, "medium");
  });
});

test("未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席", async () => {
  await withEffortEnv({}, async () => {
    for (const runtime of ["claude", "codex", "pi"] as const) {
      assert.ok(!Object.prototype.hasOwnProperty.call(await captureFor(runtime), "reasoningEffort"), `${runtime}：未设不注入字段`);
    }
  });
  await withEffortEnv({ ANS_PI_REASONING_EFFORT: "" }, async () => {
    assert.ok(!Object.prototype.hasOwnProperty.call(await captureFor("pi"), "reasoningEffort"), "空串＝留空＝未设，零参数");
    assert.ok(!Object.prototype.hasOwnProperty.call(await captureFor("demo"), "reasoningEffort"), "demo：无推理强度面");
  });
});

test("非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话", async () => {
  const spy = spyDiagnostics();
  await withEffortEnv({ ANS_CLAUDE_REASONING_EFFORT: "bogus" }, async () => {
    // composeContext 正常返回本身即断言：坏值不拒开会话。
    const options = await captureFor("claude", spy.log);
    assert.ok(!Object.prototype.hasOwnProperty.call(options, "reasoningEffort"), "非法值零参数");
  });
  assert.deepEqual(spy.events.map((item) => item.event), ["reasoning.effort.invalid"]);
  assert.equal(spy.events[0]!.fields?.mode, "claude");
  assert.equal(spy.events[0]!.fields?.supported, false);
  assert.equal(spy.events[0]!.fields?.reasonCode, "invalid-value");

  const quiet = spyDiagnostics();
  await withEffortEnv({ ANS_PI_REASONING_EFFORT: "   " }, async () => { await captureFor("pi", quiet.log); });
  assert.deepEqual(quiet.events, [], "空白＝留空＝合法默认态，不诊断");
});

test("诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响）", async () => {
  const boom: NonNullable<GovernedToolsOptions["diagnostics"]> = { record() { throw new Error("diag down"); }, error() { throw new Error("diag down"); } };
  await withEffortEnv({ ANS_CLAUDE_REASONING_EFFORT: "nope" }, async () => {
    const options = await captureFor("claude", boom);
    assert.ok(!Object.prototype.hasOwnProperty.call(options, "reasoningEffort"), "诊断抛错也不毁 providerFor");
  });
  await withEffortEnv({ ANS_CLAUDE_REASONING_EFFORT: "high" }, async () => {
    assert.ok(!Object.prototype.hasOwnProperty.call(await captureFor("codex"), "reasoningEffort"), "codex 会话不消费 claude 键");
  });
});
