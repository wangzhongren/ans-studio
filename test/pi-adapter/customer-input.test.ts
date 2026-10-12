// 交互工具族（request_confirmation / request_choice）单测（设计 `2026-10-12_design_governed-interaction-and-chat-ux.md`
// §三 A-1 / A-2 / A-6）。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 覆盖：
//   1. 结构性：**未注入客户通道 → 不注册**（判据是「有客户通道」，不是「是否创世态」）；注入 → 两工具出现；
//   2. handler **真的调用**注入的 fn，请求形状（kind/title/preview/detail/options/multiple/question）逐字传递；
//   3. 三态转达：answered（confirm/choice）/ declined / unavailable；
//   4. **失败语义**（A-1）：拒绝/超时/通道不可用/抛错 → `ok:false`，文案「未获客户同意（原因：…）→ 不要写盘；
//      如实告知客户，不得假设同意」——失败措辞**绝不**出现「客户已确认」；
//   5. 参数校验：title / options 缺失或非法 → ok:false 且**注入的 fn 未被调用**；
//   6. 勾选守卫：通道返回**未提供过的选项 id** → 视为未获同意（fail-closed，不猜）；
//   7. 超时（G-1 起**缺省不设限**）：仅显式配置（option / `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`）才计时；**超时 = 未获同意**；
//   8. 中止：AbortSignal 中止 → **立即** fail-closed 返回（防悬挂，A-6）；
//   9. **不写盘**：工具层不存在任何文件系统副作用（即便 writeRoot/gate 就绪）；
//  10. `readOptionalTimeoutMs` 语义（未设/非法 → undefined = 不限时）+ **缺省不限时的长等待**（mock 时钟，
//      虚拟等待 180s 仍生效——旧缺省 110s 上限的判别用例）；
//  11. 冻结类型（§4 冻结契约家）可从 session.ts 导入使用。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildGovernedTools,
  REQUEST_CHOICE_TOOL_NAME,
  REQUEST_CONFIRMATION_TOOL_NAME,
  type ToolDefinition,
  type ToolResult,
} from "../../src/provider/pi/tools.ts";
import type {
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputOption,
  CustomerInputRequest,
} from "../../src/provider/pi/session.ts";
import { CUSTOMER_INPUT_TIMEOUT_ENV, readOptionalTimeoutMs } from "../../src/common/pi-adapter/timeout.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

// —————————————————————— 夹具 ——————————————————————

/** 让出 microtask 队列（配合 mock 时钟：tick 之后等 handler 的 await 继续）。 */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** 一律放行的写门禁（交互工具**不该触发它**——工具层不写盘）。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 记录调用参数的替身 fn；**不写任何盘**。 */
function spy(outcome: CustomerInputOutcome | null | undefined): {
  fn: CustomerInputFn;
  calls: number;
  lastReq: CustomerInputRequest | undefined;
} {
  const box = {
    calls: 0,
    lastReq: undefined as CustomerInputRequest | undefined,
    fn: undefined as unknown as CustomerInputFn,
  };
  box.fn = async (req: CustomerInputRequest) => {
    box.calls += 1;
    box.lastReq = req;
    return outcome;
  };
  return box as unknown as { fn: CustomerInputFn; calls: number; lastReq: CustomerInputRequest | undefined };
}

/** 在系统临时目录内建隔离工作区，跑完（含异步）即清理——不触碰仓库。 */
async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-interactive-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

function names(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

/** 失败措辞纪律：**绝不**出现宣称已获同意的话术。 */
function assertNeverClaimsConsent(message: string): void {
  assert.equal(/客户已确认/.test(message), false, `失败措辞绝不能含「客户已确认」：${message}`);
  assert.equal(/已获明确同意/.test(message), false, `失败措辞绝不能含「已获明确同意」：${message}`);
}

const OPTIONS: CustomerInputOption[] = [
  { id: "a", label: "选项甲" },
  { id: "b", label: "选项乙", description: "附注" },
];

// —————————————————————— 1. 结构性：未注入 → 不注册（能力缺席） ——————————————————————

test("未注入客户通道：request_confirmation / request_choice 都不在工具集里（能力缺席 = 最强 fail-closed，A-1）", () => {
  const list = buildGovernedTools(allowGate());
  assert.equal(names(list).includes(REQUEST_CONFIRMATION_TOOL_NAME), false, "未注入通道时绝不应有此工具");
  assert.equal(names(list).includes(REQUEST_CHOICE_TOOL_NAME), false);
  // 其余工具照常存在（本族只增不扰）。
  assert.ok(names(list).includes("write_file"));
  assert.ok(names(list).includes("read_file"));
});

test("注入客户通道：两工具出现在工具集里（判据是「有客户通道」，非「创世态」）", () => {
  const s = spy({ outcome: "answered", value: { confirmed: true } });
  const list = names(buildGovernedTools(allowGate(), { customerInput: s.fn }));
  assert.ok(list.includes(REQUEST_CONFIRMATION_TOOL_NAME));
  assert.ok(list.includes(REQUEST_CHOICE_TOOL_NAME));
});

// —————————————————————— 2/3. handler 调用 fn、请求形状、三态转达 ——————————————————————

test("request_confirmation：请求形状逐字传递（kind/title/preview/detail），confirmed:true → 明确「客户已确认」", async () => {
  const s = spy({ outcome: "answered", value: { confirmed: true }, operatorId: "alice" });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const r = await confirm.handler({
    name: REQUEST_CONFIRMATION_TOOL_NAME,
    args: { title: "预览角色卡", preview: "# 角色卡全文 ……", detail: "边界摘要 ……" },
  });

  assert.equal(s.calls, 1, "handler 必须真的调用注入的 fn");
  assert.deepEqual(s.lastReq, {
    kind: "confirm",
    title: "预览角色卡",
    preview: "# 角色卡全文 ……",
    detail: "边界摘要 ……",
  });
  assert.equal(r.ok, true);
  assert.match(r.message, /客户已确认/);
  assert.match(r.message, /alice/, "应带操作者标识（审计）");
});

test("request_confirmation：confirmed:false（明确选「否」）→ ok:false，「未获客户同意」且不谎报", async () => {
  const s = spy({ outcome: "answered", value: { confirmed: false } });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "落盘角色卡" } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /不要写盘/);
  assert.match(r.message, /不得假设同意/);
  assertNeverClaimsConsent(r.message);
});

test("request_confirmation：answered 但 confirmed 缺失（undefined）→ 同样视为未获同意（只认 true）", async () => {
  const s = spy({ outcome: "answered", value: {} });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assertNeverClaimsConsent(r.message);
});

test("request_confirmation：declined（客户拒绝）→ ok:false，附原因", async () => {
  const s = spy({ outcome: "declined", operatorId: "bob", reason: "内容还没看够" });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /客户拒绝/);
  assert.match(r.message, /内容还没看够/);
  assertNeverClaimsConsent(r.message);
});

test("request_confirmation：unavailable（通道不可用/超时）→ ok:false，如实转达原因", async () => {
  const s = spy({ outcome: "unavailable", reason: "客户确认超时（>110000ms）" });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /超时/);
  assertNeverClaimsConsent(r.message);
});

test("request_confirmation：fn 返回 null/undefined（通道没给出结果）→ ok:false 视为通道不可用", async () => {
  for (const val of [null, undefined]) {
    const s = spy(val);
    const confirm = tool(
      buildGovernedTools(allowGate(), { customerInput: s.fn }),
      REQUEST_CONFIRMATION_TOOL_NAME,
    );
    const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });
    assert.equal(r.ok, false);
    assert.match(r.message, /未获客户同意/);
    assertNeverClaimsConsent(r.message);
  }
});

test("request_confirmation：fn 抛错 → fail-closed（不抛给上层），文案含原因", async () => {
  const fn: CustomerInputFn = async () => {
    throw new Error("通道内部异常");
  };
  const confirm = tool(buildGovernedTools(allowGate(), { customerInput: fn }), REQUEST_CONFIRMATION_TOOL_NAME);

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /通道内部异常/);
  assertNeverClaimsConsent(r.message);
});

test("request_choice：请求形状逐字传递（options/multiple/question），selected → ok:true 且列出所选项", async () => {
  const s = spy({ outcome: "answered", value: { selected: ["b"] }, operatorId: "carol" });
  const choice = tool(buildGovernedTools(allowGate(), { customerInput: s.fn }), REQUEST_CHOICE_TOOL_NAME);

  const r = await choice.handler({
    name: REQUEST_CHOICE_TOOL_NAME,
    args: { title: "选角色模板", question: "用哪个？", options: OPTIONS, multiple: true },
  });

  assert.equal(s.calls, 1);
  assert.deepEqual(s.lastReq, {
    kind: "choice",
    title: "选角色模板",
    question: "用哪个？",
    options: OPTIONS,
    multiple: true,
  });
  assert.equal(r.ok, true);
  assert.match(r.message, /客户已选择/);
  assert.match(r.message, /b（选项乙）/);
  assert.match(r.message, /不得擅自代选/);
});

test("request_choice：declined / unavailable → 未获客户同意（不得据此写盘或代选）", async () => {
  for (const outcome of [{ outcome: "declined" } as const, { outcome: "unavailable", reason: "无人值守" } as const]) {
    const s = spy(outcome);
    const choice = tool(buildGovernedTools(allowGate(), { customerInput: s.fn }), REQUEST_CHOICE_TOOL_NAME);
    const r = await choice.handler({ name: REQUEST_CHOICE_TOOL_NAME, args: { title: "x", options: OPTIONS } });
    assert.equal(r.ok, false);
    assert.match(r.message, /未获客户同意/);
    assertNeverClaimsConsent(r.message);
  }
});

test("request_choice：通道返回**未提供过**的选项 id → 视为未获同意（fail-closed，不猜）", async () => {
  const s = spy({ outcome: "answered", value: { selected: ["a", "zzz"] } });
  const choice = tool(buildGovernedTools(allowGate(), { customerInput: s.fn }), REQUEST_CHOICE_TOOL_NAME);

  const r = await choice.handler({ name: REQUEST_CHOICE_TOOL_NAME, args: { title: "x", options: OPTIONS } });

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /zzz/);
  assertNeverClaimsConsent(r.message);
});

// —————————————————————— 4. 参数校验（fn 不该被调用） ——————————————————————

test("参数校验：确认缺 title / 选择缺 options 或非法 → ok:false 且注入的 fn 未被调用", async () => {
  const s = spy({ outcome: "answered", value: { confirmed: true } });
  const tools = buildGovernedTools(allowGate(), { customerInput: s.fn });
  const confirm = tool(tools, REQUEST_CONFIRMATION_TOOL_NAME);
  const choice = tool(tools, REQUEST_CHOICE_TOOL_NAME);

  const badConfirm = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "  " } });
  assert.equal(badConfirm.ok, false);
  assert.match(badConfirm.message, /title/);

  const badChoice1 = await choice.handler({ name: REQUEST_CHOICE_TOOL_NAME, args: { title: "x" } });
  assert.equal(badChoice1.ok, false);
  assert.match(badChoice1.message, /options/);

  const badChoice2 = await choice.handler({
    name: REQUEST_CHOICE_TOOL_NAME,
    args: { title: "x", options: [{ id: "a", label: "" }] },
  });
  assert.equal(badChoice2.ok, false);

  const badChoice3 = await choice.handler({
    name: REQUEST_CHOICE_TOOL_NAME,
    args: { title: "x", options: [{ id: "a", label: "甲" }, { id: "a", label: "乙" }] },
  });
  assert.equal(badChoice3.ok, false, "重复 id 应被拒（回包无法区分）");

  assert.equal(s.calls, 0, "参数非法时绝不打扰客户（fn 一次都不该被调）");
});

// —————————————————————— 5. 超时（超时 = 未获同意） ——————————————————————

test("超时：注入 fn 不返回时，handler 在配置时限内以「未获客户同意」返回（绝不假设同意）", async () => {
  const fn: CustomerInputFn = () => new Promise(() => {}); // 永不返回
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: fn, customerInputTimeoutMs: 60 }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const began = Date.now();
  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } });
  const elapsed = Date.now() - began;

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /超时/);
  assert.ok(elapsed < 2000, `应在时限附近返回（实测 ${elapsed}ms）`);
  assertNeverClaimsConsent(r.message);
});

// —————————————————————— 6. 中止（防悬挂，A-6） ——————————————————————

test("中止：AbortSignal 触发后 handler **立即** fail-closed 返回，不等通道", async () => {
  // 通道 10s 后才回音（带 unref 的定时器，不拖住测试进程）；中止一到就必须返回。
  const fn: CustomerInputFn = () =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve({ outcome: "answered", value: { confirmed: true } }), 10_000);
      t.unref?.();
    });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: fn, customerInputTimeoutMs: 30_000 }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );

  const controller = new AbortController();
  const began = Date.now();
  const waiting = confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" }, signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  const r = await waiting;
  const elapsed = Date.now() - began;

  assert.equal(r.ok, false);
  assert.match(r.message, /未获客户同意/);
  assert.match(r.message, /中止/);
  assert.ok(elapsed < 1000, `中止应立即使 handler 返回（实测 ${elapsed}ms）`);
  assertNeverClaimsConsent(r.message);
});

test("中止：signal 已中止时立即返回（即便通道会立刻同意）", async () => {
  const s = spy({ outcome: "answered", value: { confirmed: true } });
  const confirm = tool(
    buildGovernedTools(allowGate(), { customerInput: s.fn }),
    REQUEST_CONFIRMATION_TOOL_NAME,
  );
  const controller = new AbortController();
  controller.abort();

  const r = await confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" }, signal: controller.signal });

  assert.equal(r.ok, false);
  assert.match(r.message, /中止/);
  assertNeverClaimsConsent(r.message);
});

// —————————————————————— 7. 不写盘（工具层零文件系统副作用） ——————————————————————

test("不写盘：即便 writeRoot 就绪、gate 放行、客户同意，工具层也不产生任何文件系统变化", async () => {
  await inTempDir(async (dir) => {
    assert.deepEqual(readdirSync(dir), [], "起始：临时目录为空");

    const s = spy({ outcome: "answered", value: { confirmed: true } });
    const tools = buildGovernedTools(allowGate(), { writeRoot: dir, customerInput: s.fn });

    const r = await tool(tools, REQUEST_CONFIRMATION_TOOL_NAME).handler({
      name: REQUEST_CONFIRMATION_TOOL_NAME,
      args: { title: "x" },
    });

    assert.equal(r.ok, true);
    assert.equal(s.calls, 1);
    assert.deepEqual(readdirSync(dir), [], "交互工具调用后盘上应无任何新文件/目录");
    assert.equal(existsSync(join(dir, ".ans")), false);
  });
});

// —————————————————————— 8. 等待时限（G-1：缺省不设限） ——————————————————————

test("readOptionalTimeoutMs：未设/空串/非法 → undefined（不限时）；显式正数 → 取整生效", () => {
  assert.equal(readOptionalTimeoutMs({}, CUSTOMER_INPUT_TIMEOUT_ENV), undefined);
  assert.equal(readOptionalTimeoutMs({ [CUSTOMER_INPUT_TIMEOUT_ENV]: "" }, CUSTOMER_INPUT_TIMEOUT_ENV), undefined);
  assert.equal(readOptionalTimeoutMs({ [CUSTOMER_INPUT_TIMEOUT_ENV]: "abc" }, CUSTOMER_INPUT_TIMEOUT_ENV), undefined);
  assert.equal(readOptionalTimeoutMs({ [CUSTOMER_INPUT_TIMEOUT_ENV]: "0" }, CUSTOMER_INPUT_TIMEOUT_ENV), undefined);
  assert.equal(readOptionalTimeoutMs({ [CUSTOMER_INPUT_TIMEOUT_ENV]: "-5" }, CUSTOMER_INPUT_TIMEOUT_ENV), undefined);
  assert.equal(readOptionalTimeoutMs({ [CUSTOMER_INPUT_TIMEOUT_ENV]: "1234.9" }, CUSTOMER_INPUT_TIMEOUT_ENV), 1234);
});

test("缺省不设限（G-1）：虚拟等待 180s（超过旧缺省 110s）仍等到答复；110s 时尚未超时（mock 时钟，不真等）", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // 环境变量必须干净（否则退化为显式计时）。
  const prev = process.env[CUSTOMER_INPUT_TIMEOUT_ENV];
  delete process.env[CUSTOMER_INPUT_TIMEOUT_ENV];
  try {
    // fn 在「180 秒后」作答（mock 时钟）。
    const fn: CustomerInputFn = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ outcome: "answered", value: { confirmed: true } }), 180_000);
      });
    const confirm = tool(buildGovernedTools(allowGate(), { customerInput: fn }), REQUEST_CONFIRMATION_TOOL_NAME);

    let settled: ToolResult | undefined;
    const waiting = confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } }).then((r) => {
      settled = r;
      return r;
    });

    await flushMicrotasks();
    t.mock.timers.tick(110_000); // 旧缺省上限处：**不得**已超时。
    await flushMicrotasks();
    assert.equal(settled, undefined, "缺省不设限：110s（旧缺省上限）时不得超时");

    t.mock.timers.tick(70_000); // 到 180s：fn 作答。
    const r = await waiting;
    assert.equal(r.ok, true, "虚拟 180s 后收到答复：应成功");
    assert.match(r.message, /客户已确认/);
  } finally {
    if (prev === undefined) delete process.env[CUSTOMER_INPUT_TIMEOUT_ENV];
    else process.env[CUSTOMER_INPUT_TIMEOUT_ENV] = prev;
    t.mock.timers.reset();
  }
});

test("显式配置仍计时（env）：虚拟走到配置时限即「未获客户同意（超时）」", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const prev = process.env[CUSTOMER_INPUT_TIMEOUT_ENV];
  process.env[CUSTOMER_INPUT_TIMEOUT_ENV] = "60000";
  try {
    const fn: CustomerInputFn = () => new Promise(() => {}); // 永不返回
    const confirm = tool(buildGovernedTools(allowGate(), { customerInput: fn }), REQUEST_CONFIRMATION_TOOL_NAME);

    let settled: ToolResult | undefined;
    const waiting = confirm.handler({ name: REQUEST_CONFIRMATION_TOOL_NAME, args: { title: "x" } }).then((r) => {
      settled = r;
      return r;
    });

    await flushMicrotasks();
    t.mock.timers.tick(59_999);
    await flushMicrotasks();
    assert.equal(settled, undefined, "未到时限不得超时");

    t.mock.timers.tick(1);
    const r = await waiting;
    assert.equal(r.ok, false);
    assert.match(r.message, /未获客户同意/);
    assert.match(r.message, /超时/);
    assertNeverClaimsConsent(r.message);
  } finally {
    if (prev === undefined) delete process.env[CUSTOMER_INPUT_TIMEOUT_ENV];
    else process.env[CUSTOMER_INPUT_TIMEOUT_ENV] = prev;
    t.mock.timers.reset();
  }
});

// —————————————————————— 9. 冻结契约家（§4）导出这些型：可导入、可用 ——————————————————————

test("CustomerInputRequest / CustomerInputOutcome / CustomerInputFn 可从冻结契约家 session.ts 导入并使用", async () => {
  const req: CustomerInputRequest = { kind: "choice", title: "t", options: [{ id: "a", label: "甲" }] };
  const out: CustomerInputOutcome = { outcome: "answered", value: { selected: ["a"] }, operatorId: "u" };
  const fn: CustomerInputFn = async () => out;

  const got = await fn(req);
  assert.equal(got?.outcome, "answered");
});
