// test/测试/g5-reasoning-verify/a-contract.test.ts —— A 域：契约与归一（独立验证，对抗性构造）。
//
// 验证对象：`src/model/runtime.ts` 的 G-5 冻结符号（五值/字段缺席语义）＋ `src/common/runtime-core/reasoning.ts`
// 的归一器（三态/大小写/trim/非法 10 类/64 截断/三 env 键逐字/跨键不串/demo 恒缺席）。
// **不复用实施方断言**：本文件全部用例为独立构造（含实施方测试未覆盖的类别：完整值域膨胀探测、
// 全角/emoji 类非法、三态边界同时断言 raw 形状、frozen 语义探测等）。
//
// 批准口径来源：PM 记录 §G-5（冻结符号）+ 产品提案 §3.1/§3.2 + 运行时核心评估 §五。

import test from "node:test";
import assert from "node:assert/strict";

import {
  REASONING_EFFORT_VALUES,
  REASONING_EFFORT_ENV_KEYS,
  REASONING_EVENT_SUMMARY,
  REASONING_DIAGNOSTIC_SUMMARY,
  isReasoningEffortV1,
  normalizeReasoningEffortValue,
  resolveReasoningEffort,
} from "../../../src/common/runtime-core/reasoning.ts";

// —————————————————————— ① 五值冻结 ——————————————————————

test("A1 五值冻结：恰 off/low/medium/high/xhigh 五枚，顺序即产品档位梯，数组本体冻结（写入抛错）", () => {
  assert.deepEqual([...REASONING_EFFORT_VALUES], ["off", "low", "medium", "high", "xhigh"], "恰五值且顺序＝关/低/中/高/极高");
  assert.equal(REASONING_EFFORT_VALUES.length, 5, "长度恰五（防悄然扩值域）");
  // 冻结语义：push/splice 在严格模式（ESM 天然严格）下抛 TypeError——值域扩展点只经源码改动。
  assert.throws(() => (REASONING_EFFORT_VALUES as string[]).push("max"), TypeError, "冻结数组拒绝 push");
  assert.throws(() => { (REASONING_EFFORT_VALUES as string[])[0] = "none"; }, TypeError, "冻结数组拒绝索引写");
  assert.deepEqual([...REASONING_EFFORT_VALUES], ["off", "low", "medium", "high", "xhigh"], "写尝试后逐字不变");
  // 平台侧存在但中立 v1 未收编的档一律不是成员（防「静默收编」）。
  for (const outside of ["minimal", "max", "ultra", "none", "default", "adaptive"]) {
    assert.equal((REASONING_EFFORT_VALUES as readonly string[]).includes(outside), false, `${outside} 不得在中立值域`);
  }
});

// —————————————————————— ② 三 env 键逐字 + 跨键不串 + demo ——————————————————————

test("A2 env 键逐字：三键三名恰等冻结符号；键面不含 demo；跨键读取不串", () => {
  assert.deepEqual(Object.keys(REASONING_EFFORT_ENV_KEYS).sort(), ["claude", "codex", "pi"], "恰三平台键面（demo 无键）");
  assert.equal(REASONING_EFFORT_ENV_KEYS.claude, "ANS_CLAUDE_REASONING_EFFORT");
  assert.equal(REASONING_EFFORT_ENV_KEYS.codex, "ANS_CODEX_REASONING_EFFORT");
  assert.equal(REASONING_EFFORT_ENV_KEYS.pi, "ANS_PI_REASONING_EFFORT");
  // 跨键不串：只设 claude 键 ⇒ pi/codex 仍 unset；各平台只读自己的键。
  const env = { ANS_CLAUDE_REASONING_EFFORT: "high" };
  assert.deepEqual(resolveReasoningEffort("claude", env), { state: "set", effort: "high" });
  assert.deepEqual(resolveReasoningEffort("codex", env), { state: "unset" }, "claude 键不得泄漏进 codex");
  assert.deepEqual(resolveReasoningEffort("pi", env), { state: "unset" }, "claude 键不得泄漏进 pi");
  // demo 恒缺席：即便三键全设，demo 仍 unset（无键面）。
  const all = { ANS_CLAUDE_REASONING_EFFORT: "low", ANS_CODEX_REASONING_EFFORT: "high", ANS_PI_REASONING_EFFORT: "xhigh" };
  assert.deepEqual(resolveReasoningEffort("demo", all), { state: "unset" }, "demo 恒 unset");
});

test("A3 纯读快照：resolve 按传入 env 快照读（不偷看 process.env）；缺键＝unset 而非 undefined 异常", () => {
  assert.deepEqual(resolveReasoningEffort("claude", {}), { state: "unset" }, "空快照 ⇒ unset");
  assert.deepEqual(resolveReasoningEffort("claude", { ANS_CLAUDE_REASONING_EFFORT: undefined }), { state: "unset" }, "显式 undefined ⇒ unset");
  // 双快照隔离：同名键两个快照互不影响（证明无隐藏全局态）。
  const a = { ANS_CODEX_REASONING_EFFORT: "medium" };
  const b = { ANS_CODEX_REASONING_EFFORT: "off" };
  assert.deepEqual(resolveReasoningEffort("codex", a), { state: "set", effort: "medium" });
  assert.deepEqual(resolveReasoningEffort("codex", b), { state: "set", effort: "off" });
  assert.deepEqual(resolveReasoningEffort("codex", a), { state: "set", effort: "medium" }, "重复读取同快照同答案");
});

// —————————————————————— ③ 归一三态：未设/合法（大小写+trim）/非法 ——————————————————————

test("A4 未设态：undefined/null/空串/纯空白（空格/tab/换行/混排）一律 unset——静默合法默认态", () => {
  for (const raw of [undefined, null, "", " ", "   ", "\t", "\n", " \t\n ", "\r\n"]) {
    assert.deepEqual(normalizeReasoningEffortValue(raw), { state: "unset" }, JSON.stringify(raw) + " ⇒ unset");
  }
});

test("A5 合法态：五值原样、大小写混合、前后空白、全大写（trim+忽略大小写）⇒ set（规范小写形）", () => {
  for (const [raw, effort] of [
    ["off", "off"], ["Off", "off"], ["OFF", "off"], [" off ", "off"],
    ["low", "low"], ["Low", "low"], ["  LOW\t", "low"],
    ["medium", "medium"], ["MeDiUm", "medium"], ["\nmedium ", "medium"],
    ["high", "high"], ["HIGH", "high"], [" high\n", "high"],
    ["xhigh", "xhigh"], ["XHigh", "xhigh"], [" XHIGH ", "xhigh"],
  ] as const) {
    assert.deepEqual(normalizeReasoningEffortValue(raw), { state: "set", effort }, JSON.stringify(raw) + " ⇒ set/" + effort);
  }
  // 规范形唯一：任何合法输入的产物只可能是五值之一（防产物带出非规范形）。
  for (const raw of [" OfF ", "xHIGH"]) {
    const out = normalizeReasoningEffortValue(raw);
    assert.equal(out.state, "set");
    assert.ok((REASONING_EFFORT_VALUES as readonly string[]).includes((out as { effort: string }).effort), "产物∈冻结值域");
  }
});

test("A6 非法 10 类：平台侧档/中文标签/数字/布尔/组合串/全角/emoji/URL 样——一律 invalid，绝不猜档", () => {
  const illegal = [
    "minimal",            // Pi 档、中立未收编
    "max",                // Claude/Pi 更高档、未收编
    "ultra",              // Codex 目录档、未收编
    "none",               // 臆造档
    "关",                  // 中文标签（UI 语汇→规范值映射归写入侧，读取侧不发明）
    "低",
    "0",                  // 数字样
    "true",               // 布尔样
    "high,low",           // 组合串
    "high low",           // 空格分隔
    "ｈｉｇｈ",             // 全角字母
    "🌟",                  // emoji
    "highish",            // 近似拼写
  ];
  for (const raw of illegal) {
    const out = normalizeReasoningEffortValue(raw);
    assert.equal(out.state, "invalid", JSON.stringify(raw) + " ⇒ invalid");
    assert.equal((out as { raw: string }).raw, raw.trim(), "invalid.raw＝trim 后原值（诊断素材）");
  }
});

test("A7 invalid.raw 截断：>64 字符按前 64 字符截断（诊断素材有界）；恰 64 不截", () => {
  const long = "z".repeat(200);
  const out = normalizeReasoningEffortValue("  " + long + "  ");
  assert.equal(out.state, "invalid");
  assert.equal((out as { raw: string }).raw.length, 64, "截断到 64");
  assert.equal((out as { raw: string }).raw, "z".repeat(64), "前 64 字符逐字");
  const exact = "y".repeat(64);
  assert.equal((normalizeReasoningEffortValue(exact) as { raw: string }).raw, exact, "恰 64 不截");
  // 大小写非法不改变截断行为（invalid.raw 保留 trim 后原形，不做小写化）。
  const mixed = "Bad".repeat(30);
  assert.equal((normalizeReasoningEffortValue(mixed) as { raw: string }).raw, mixed.slice(0, 64));
});

test("A8 三态互斥完备：任意输入恰归一种态（无二义、无漏网）", () => {
  const samples: Array<string | undefined | null> = [undefined, null, "", " ", "off", "OFF", " low ", "high", "max", "x", "关"];
  for (const raw of samples) {
    const out = normalizeReasoningEffortValue(raw);
    assert.ok(["unset", "set", "invalid"].includes(out.state), JSON.stringify(raw) + " 必属三态之一");
    if (out.state === "set") assert.ok((REASONING_EFFORT_VALUES as readonly string[]).includes(out.effort));
    if (out.state === "invalid") assert.equal(typeof out.raw, "string");
    if (out.state === "unset") assert.deepEqual(Object.keys(out), ["state"], "unset 态不带多余字段");
  }
});

// —————————————————————— ④ isReasoningEffortV1（大小写敏感＝规范形判定） ——————————————————————

test("A9 isReasoningEffortV1：逐字（大小写敏感）判定；非字符串一律 false", () => {
  for (const value of REASONING_EFFORT_VALUES) assert.equal(isReasoningEffortV1(value), true, value);
  for (const value of ["High", "HIGH", " high", "off ", "max", "minimal", ""]) {
    assert.equal(isReasoningEffortV1(value), false, JSON.stringify(value) + " 非规范形");
  }
  for (const value of [undefined, null, 0, 1, true, {}, [], ["high"]]) assert.equal(isReasoningEffortV1(value), false, String(value));
});

// —————————————————————— ⑤ 文案常量定格 ——————————————————————

test("A10 文案常量：事件 summary「已思考」与诊断 summary「推理内容无法安全显示」逐字冻结", () => {
  assert.equal(REASONING_EVENT_SUMMARY, "已思考");
  assert.equal(REASONING_DIAGNOSTIC_SUMMARY, "推理内容无法安全显示");
  // 两常量互不相同（防止折叠/诊断文案合并成同一串）。
  assert.notEqual(REASONING_EVENT_SUMMARY, REASONING_DIAGNOSTIC_SUMMARY);
});
