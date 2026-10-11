// finalize_bootstrap（收口提议工具）单测（设计 §13.1 / 派发清单 T36）。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 覆盖：
//   1. 结构性：**未注入能力 → 不注册**（「非创世态」由调用方以「不注入」表达，逐字同 run_shell 先例）；
//   2. 注入 → 工具出现；
//   3. handler **真的调用**注入的 fn，并把结果**如实**转达模型——失败措辞**绝不**说成「已完成」；
//   4. **不写盘**：工具层构造指向临时目录的 writeRoot + 放行 gate，调用后盘上**无任何变化**；
//   5. 能力抛错 → fail-closed（未完成）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildGovernedTools,
  FINALIZE_BOOTSTRAP_TOOL_NAME,
  type ToolDefinition,
} from "../../src/provider/pi/tools.ts";
import type { FinalizeBootstrapFn, FinalizeResult, FinalizeStatus } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

// —————————————————————— 夹具 ——————————————————————

/** 一律放行的写门禁（finalize_bootstrap 不该触发它——工具层不写盘）。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 造一个完整的 FinalizeResult（字段齐，避免逐字段写）。 */
function result(partial: Partial<FinalizeResult> & Pick<FinalizeResult, "ok">): FinalizeResult {
  return {
    ok: partial.ok,
    status: partial.status,
    message: partial.message,
    reason: partial.reason,
    wrote: partial.wrote ?? [],
    pins: partial.pins ?? [],
    roles: partial.roles ?? [],
    projectJsonRel: partial.projectJsonRel ?? ".ans/project.json",
    manifestRel: partial.manifestRel ?? "docs/bootstrap-manifest.md",
  };
}

/** 记录调用参数的替身 fn；**不写任何盘**。 */
function spy(returns: FinalizeResult): { fn: FinalizeBootstrapFn; calls: number; lastOpts: unknown } {
  const box = { calls: 0, lastOpts: undefined as unknown, fn: undefined as unknown as FinalizeBootstrapFn };
  box.fn = async (opts) => {
    box.calls += 1;
    box.lastOpts = opts;
    return returns;
  };
  return box as unknown as { fn: FinalizeBootstrapFn; calls: number; lastOpts: unknown };
}

/** 在系统临时目录内建隔离工作区，跑完（含异步）即清理——不触碰仓库。 */
async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-finalize-"));
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

// —————————————————————— 1. 结构性：未注入 → 不注册（能力缺席） ——————————————————————

test("未注入 finalize 能力：finalize_bootstrap 不在工具集里（能力缺席 = 最强 fail-closed，§13.1）", () => {
  const names = buildGovernedTools(allowGate()).map((t) => t.name);
  assert.equal(names.includes(FINALIZE_BOOTSTRAP_TOOL_NAME), false, "未注入能力时绝不应有 finalize_bootstrap");
  // 其余工具照常存在。
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("read_file"));
});

test("非创世态由调用方以「不注入」表达：工具不存在（与 run_shell 的 arm 判据同构）", () => {
  // 调用方（编排）在创世态才注入本能力；非创世态**不注入** ⇒ 工具压根不在集合里。
  // 本用例即「非创世态 → 不存在」的表达方式（工具层同步、不查文件系统）。
  const nonGenesis = buildGovernedTools(allowGate(), { readRoot: process.cwd(), writeRoot: process.cwd() }).map(
    (t) => t.name,
  );
  assert.equal(nonGenesis.includes(FINALIZE_BOOTSTRAP_TOOL_NAME), false);
});

// —————————————————————— 2. 注入 → 出现 ——————————————————————

test("注入 finalize 能力：finalize_bootstrap 出现在工具集里", () => {
  const s = spy(result({ ok: true, status: "completed", message: "已收口" }));
  const names = buildGovernedTools(allowGate(), { finalizeBootstrap: s.fn }).map((t) => t.name);
  assert.ok(names.includes(FINALIZE_BOOTSTRAP_TOOL_NAME));
});

// —————————————————————— 3. handler 真的调用 fn，并如实转达（不谎报完成） ——————————————————————

test("handler 真的调用注入的 fn（无参），失败结果如实表达「未完成」而非「已完成」", async () => {
  const s = spy(
    result({ ok: false, status: "declined", message: "收口未获客户确认（客户拒绝）；su 可继续工作或稍后再提议" }),
  );
  const finalize = tool(buildGovernedTools(allowGate(), { finalizeBootstrap: s.fn }), FINALIZE_BOOTSTRAP_TOOL_NAME);

  const r = await finalize.handler({ name: FINALIZE_BOOTSTRAP_TOOL_NAME, args: {} });

  assert.equal(s.calls, 1, "handler 必须真的调用注入的 fn");
  assert.equal(s.lastOpts, undefined, "模型不该传参（acceptanceSource/now 由编排侧决定）");
  assert.equal(r.ok, false);
  assert.match(r.message, /收口未完成/);
  assert.match(r.message, /仍处于创世态/);
  assert.match(r.message, /待.*确认|等待客户确认/, "应传达「提议 + 等待确认」语义");
  // 关键：绝不把「未完成」说成「已完成」。
  assert.equal(/已完成/.test(r.message), false, "失败时措辞绝不能含「已完成」");
  assert.equal(/收口完成/.test(r.message), false, "失败时措辞绝不能含「收口完成」");
  assert.match(r.message, /收口未获客户确认/, "应附能力自身的原因文案");
});

test("handler：确认通过（ok:true）才说「收口完成」", async () => {
  const s = spy(result({ ok: true, status: "completed", message: "已收口：写出 .ans、governance-boundary.yaml、manifest" }));
  const finalize = tool(buildGovernedTools(allowGate(), { finalizeBootstrap: s.fn }), FINALIZE_BOOTSTRAP_TOOL_NAME);

  const r = await finalize.handler({ name: FINALIZE_BOOTSTRAP_TOOL_NAME, args: {} });

  assert.equal(r.ok, true);
  assert.match(r.message, /收口完成/);
  assert.match(r.message, /客户已确认/);
});

test("handler：通道不可用/超时（unavailable）→ 未完成，不谎报", async () => {
  const s = spy(result({ ok: false, status: "unavailable", message: "收口未获确认：客户确认超时（>120000ms）——不完成" }));
  const finalize = tool(buildGovernedTools(allowGate(), { finalizeBootstrap: s.fn }), FINALIZE_BOOTSTRAP_TOOL_NAME);

  const r = await finalize.handler({ name: FINALIZE_BOOTSTRAP_TOOL_NAME, args: {} });

  assert.equal(r.ok, false);
  assert.match(r.message, /收口未完成/);
  assert.match(r.message, /超时/);
  assert.equal(/已完成/.test(r.message), false);
});

test("handler：能力抛错 → fail-closed（未完成，不抛给上层）", async () => {
  const fn: FinalizeBootstrapFn = async () => {
    throw new Error("finalize 内部异常");
  };
  const finalize = tool(buildGovernedTools(allowGate(), { finalizeBootstrap: fn }), FINALIZE_BOOTSTRAP_TOOL_NAME);

  const r = await finalize.handler({ name: FINALIZE_BOOTSTRAP_TOOL_NAME, args: {} });

  assert.equal(r.ok, false);
  assert.match(r.message, /收口未完成/);
  assert.match(r.message, /finalize 内部异常/);
  assert.equal(/已完成/.test(r.message), false);
});

// —————————————————————— 4. 不写盘（工具层零文件系统副作用） ——————————————————————

test("不写盘：工具层不产生任何文件系统变化（即便 writeRoot 就绪、gate 放行）", async () => {
  await inTempDir(async (dir) => {
    const before = readdirSync(dir);
    assert.deepEqual(before, [], "起始：临时目录为空");

    // 即便注入的能力返回 ok:true，工具层也**不落盘**——真正的写全在编排的 finalize 侧。
    const s = spy(result({ ok: true, status: "completed", message: "已收口（替身，未真正写盘）" }));
    const tools = buildGovernedTools(allowGate(), { writeRoot: dir, finalizeBootstrap: s.fn });
    const finalize = tool(tools, FINALIZE_BOOTSTRAP_TOOL_NAME);

    const r = await finalize.handler({ name: FINALIZE_BOOTSTRAP_TOOL_NAME, args: {} });

    assert.equal(r.ok, true);
    assert.equal(s.calls, 1);
    assert.deepEqual(readdirSync(dir), [], "工具层调用后盘上应无任何新文件/目录");
    assert.equal(existsSync(join(dir, ".ans")), false, "工具层不得创建 .ans/");
  });
});

// —————————————————————— 5. 冻结契约家（§4）导出这些型：可导入、可用 ——————————————————————
//
// `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn` 的**单一来源**是 §4 冻结契约家
// `src/provider/pi/session.ts`（同 T20 的 operator 三型先例）。本用例把「可从这里导入并使用」
// 钉死：这是一个**类型层**契约，编译期（`npm run typecheck`）能捕获形状漂移；运行期证明导入路径成立。
test("FinalizeStatus / FinalizeResult / FinalizeBootstrapFn 可从冻结契约家 session.ts 导入并使用", async () => {
  const status: FinalizeStatus = "completed";
  const r: FinalizeResult = result({ ok: true, status, message: "已收口" });
  const fn: FinalizeBootstrapFn = async () => r;

  const out = await fn();
  assert.equal(out.status, "completed");
  assert.equal(out.ok, true);
  assert.equal(out.message, "已收口");
});
