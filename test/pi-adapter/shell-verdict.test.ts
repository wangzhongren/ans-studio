// report_shell_verdict（审读结论工具，R-1）单测。不导入任何 Pi 包。
// 归属：Pi适配器角色测试目录。
//
// 覆盖：
//   1. 注册判据：**未注入 shellVerdict → 不注册**（只给审读会话）；注入 → 出现；
//   2. 载荷逐字（verdict 三值 + reason；省略 reason 则不在载荷里）；
//   3. 参数校验：verdict 缺失/非法 → ok:false 且注入的 fn **未被调用**；
//   4. 交回语义：能力不抛错 → 「审读结论已交回」+ 回显 verdict；能力抛错/中止 → 「**未能交回**」如实；
//   5. 文案（describeTool）：schema 三值枚举 + verdict 必填；描述写死「结论以本工具调用为准（正文里写不算）」；
//      **反向断言**：不得出现「已放行 / 已授权 / 已授予」等暗示本工具授予权限的字样；
//   6. 中止：AbortSignal 已中止 → 立即 fail-closed 返回；
//   7. 不写盘：writeRoot/gate 就绪、交回成功，盘上零变化；
//   8. 冻结类型（§4 契约家）可从 session.ts 导入使用，且与编排侧形状（void | Promise<void>）结构兼容。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, SHELL_VERDICT_TOOL_NAME, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import { describeTool } from "../../src/common/pi-adapter/real-adapter.ts";
import type { ShellVerdictFn, ShellVerdictPayload } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 记录调用载荷的替身 fn；**不写任何盘**。 */
function spy(): { fn: ShellVerdictFn; calls: number; last: ShellVerdictPayload | undefined } {
  const box = {
    calls: 0,
    last: undefined as ShellVerdictPayload | undefined,
    fn: undefined as unknown as ShellVerdictFn,
  };
  box.fn = (verdict: ShellVerdictPayload) => {
    box.calls += 1;
    box.last = verdict;
  };
  return box as unknown as { fn: ShellVerdictFn; calls: number; last: ShellVerdictPayload | undefined };
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

function names(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

const GOOD_ARGS = { verdict: "deny", reason: "命令会写边界外文件" };

// —————————————————————— 1. 注册判据 ——————————————————————

test("未注入审读结论能力：report_shell_verdict 不在工具集里（只给审读会话；能力缺席 = 最强 fail-closed）", () => {
  const list = names(buildGovernedTools(allowGate()));
  assert.equal(list.includes(SHELL_VERDICT_TOOL_NAME), false, "未注入时绝不应有 report_shell_verdict");
  assert.ok(list.includes("write_file"));
  assert.ok(list.includes("read_file"));
});

test("注入审读结论能力：report_shell_verdict 出现在工具集里（同 run_shell / customerInput 的注入先例）", () => {
  const s = spy();
  const list = names(buildGovernedTools(allowGate(), { shellVerdict: s.fn }));
  assert.ok(list.includes(SHELL_VERDICT_TOOL_NAME));
});

// —————————————————————— 2. 载荷逐字 + 交回语义 ——————————————————————

test("handler 把载荷逐字交给 fn；三值都通；成功 → 「审读结论已交回」+ 回显 verdict", async () => {
  const s = spy();
  const verdict = tool(buildGovernedTools(allowGate(), { shellVerdict: s.fn }), SHELL_VERDICT_TOOL_NAME);

  for (const v of ["allow", "deny", "unsure"] as const) {
    const r = await verdict.handler({ name: SHELL_VERDICT_TOOL_NAME, args: { verdict: v, reason: "r" } });
    assert.equal(r.ok, true);
    assert.match(r.message, /审读结论已交回/);
    assert.ok(r.message.includes(v));
    assert.equal(s.last!.verdict, v);
    assert.equal(s.last!.reason, "r");
  }
  assert.equal(s.calls, 3);
});

test("handler：省略 reason → 载荷不含 reason 字段", async () => {
  const s = spy();
  const verdict = tool(buildGovernedTools(allowGate(), { shellVerdict: s.fn }), SHELL_VERDICT_TOOL_NAME);

  await verdict.handler({ name: SHELL_VERDICT_TOOL_NAME, args: { verdict: "unsure" } });

  assert.deepEqual(s.last, { verdict: "unsure" });
});

// —————————————————————— 3. 参数校验（fn 不该被调用） ——————————————————————

test("参数校验：verdict 缺失或非三值 → ok:false 且 fn 未被调用", async () => {
  const s = spy();
  const verdict = tool(buildGovernedTools(allowGate(), { shellVerdict: s.fn }), SHELL_VERDICT_TOOL_NAME);

  for (const bad of [{}, { verdict: "ok" }, { verdict: "ALLOW" }, { verdict: 1 }, { verdict: true }]) {
    const r = await verdict.handler({ name: SHELL_VERDICT_TOOL_NAME, args: bad });
    assert.equal(r.ok, false, `非法输入应被拒：${JSON.stringify(bad)}`);
    assert.match(r.message, /verdict/);
  }
  assert.equal(s.calls, 0, "参数非法时绝不调用注入的 fn");
});

// —————————————————————— 4. 失败如实（含反向断言） ——————————————————————

test("fn 抛错 → fail-closed「未能交回」+ 原因，绝不说成「已交回」；并提示「正文里写不算」", async () => {
  const fn: ShellVerdictFn = async () => {
    throw new Error("捕获器内部异常");
  };
  const verdict = tool(buildGovernedTools(allowGate(), { shellVerdict: fn }), SHELL_VERDICT_TOOL_NAME);

  const r = await verdict.handler({ name: SHELL_VERDICT_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能交回/);
  assert.match(r.message, /捕获器内部异常/);
  assert.match(r.message, /正文里写不算/, "应重申结论只以工具调用为准");
  assert.equal(/已交回/.test(r.message), false, "失败措辞绝不能含「已交回」");
});

test("中止：signal 已中止 → 立即 fail-closed 返回（不等注入 fn）", async () => {
  const s = spy();
  const verdict = tool(buildGovernedTools(allowGate(), { shellVerdict: s.fn }), SHELL_VERDICT_TOOL_NAME);
  const controller = new AbortController();
  controller.abort();

  const r = await verdict.handler({ name: SHELL_VERDICT_TOOL_NAME, args: GOOD_ARGS, signal: controller.signal });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能交回/);
  assert.equal(/已交回/.test(r.message), false);
});

// —————————————————————— 5. 文案（含反向断言：不得暗示授予权限） ——————————————————————

test("describeTool 文案：schema 三值枚举 + verdict 必填；写死「结论以工具调用为准」；反向断言不得暗示授权", () => {
  const d = describeTool(SHELL_VERDICT_TOOL_NAME);
  const text = [d.description, ...(d.promptGuidelines ?? [])].join("\n");

  assert.match(text, /本工具调用.*为准|以.*本工具调用/, "应写死结论只以工具调用为准");
  assert.match(text, /正文里写不算|不要.*只在正文里写/, "应禁止「只在正文里写结论」");
  assert.match(text, /不执行|不放行/, "应明示本工具不执行/不放行");
  // 反向断言：不得出现「已放行 / 已授权 / 已授予 / 代表放行」这类暗示本工具授予权限的字样。
  assert.equal(
    /已放行|已授权|已授予|代表放行|代为放行/.test(text),
    false,
    `不得暗示本工具授予权限：${text}`,
  );

  assert.deepEqual(d.parameters.required, ["verdict"]);
  const props = d.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(props["verdict"]["enum"], ["allow", "deny", "unsure"]);
  assert.ok(props["reason"], "应有可选 reason");
  assert.equal(d.executionMode, undefined, "审读交回不是交互等待，不并 sequential 档");
});

// —————————————————————— 6. 不写盘 ——————————————————————

test("不写盘：即便 writeRoot 就绪、gate 放行、交回成功，工具层零文件系统副作用", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-verdict-"));
  try {
    assert.deepEqual(readdirSync(dir), [], "起始：临时目录为空");

    const s = spy();
    const tools = buildGovernedTools(allowGate(), { writeRoot: dir, shellVerdict: s.fn });
    const r = await tool(tools, SHELL_VERDICT_TOOL_NAME).handler({ name: SHELL_VERDICT_TOOL_NAME, args: GOOD_ARGS });

    assert.equal(r.ok, true);
    assert.equal(s.calls, 1);
    assert.deepEqual(readdirSync(dir), [], "交回后盘上应无任何新文件/目录");
    assert.equal(existsSync(join(dir, ".ans")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// —————————————————————— 7. 冻结契约家（§4）+ 与编排形状的结构兼容 ——————————————————————

test("ShellVerdictPayload / ShellVerdictFn 可从冻结契约家导入；且与编排形状（void | Promise<void>）结构兼容", async () => {
  const payload: ShellVerdictPayload = { verdict: "allow", reason: "命令只读" };
  const fn: ShellVerdictFn = async () => {};
  await fn(payload);

  // 结构兼容：编排侧 `(v: ShellVerdictPayload) => void | Promise<void>` 可直接注入本层选项（编译期）。
  const orchestrationShaped: (v: ShellVerdictPayload) => void | Promise<void> = (v) => void v;
  const asOurSeam: ShellVerdictFn = orchestrationShaped;
  asOurSeam({ verdict: "deny" });
  assert.equal(payload.verdict, "allow");
});
