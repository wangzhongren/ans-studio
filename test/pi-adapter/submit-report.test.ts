// submit_report（交报告工具，设计 C-1）单测。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 覆盖：
//   1. 结构性：**未注入回交能力 → 不注册**（只给项目角色；su 不注入即不存在）；注入 → 出现；
//   2. handler 把载荷（status/summary/evidence）**逐字**交给注入的 fn；
//   3. 参数校验：status 非法 / 缺 summary / evidence 非法 → ok:false 且 fn **未被调用**；
//   4. 回执语义：ok:true 或无回执 → 「报告已交回」；回执 ok:false / 抛错 → 「**未能交回**」如实；
//   5. **不谎报**（反向断言）：失败措辞绝不出现「已交回」；
//   6. **不写盘**：writeRoot/gate 就绪、调用成功，盘上零变化；
//   7. 中止：AbortSignal 已中止 → 立即 fail-closed 返回（防悬挂，A-6 纪律）；
//   8. 文案（describeTool）：必须交报告/不得只在正文里说/一条结论+证据；**不得**暗示有写权；
//   9. 冻结类型（§4 契约家）可从 session.ts 导入使用。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, SUBMIT_REPORT_TOOL_NAME, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import { describeTool } from "../../src/common/pi-adapter/real-adapter.ts";
import type {
  ReportHandbackFn,
  ReportHandbackPayload,
  ReportHandbackReceipt,
} from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

// —————————————————————— 夹具 ——————————————————————

/** 一律放行的写门禁（交报告**不该触发它**——工具层不写盘）。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 记录调用载荷的替身 fn；**不写任何盘**。 */
function spy(returns: ReportHandbackReceipt | null | undefined): {
  fn: ReportHandbackFn;
  calls: number;
  lastReport: ReportHandbackPayload | undefined;
} {
  const box = {
    calls: 0,
    lastReport: undefined as ReportHandbackPayload | undefined,
    fn: undefined as unknown as ReportHandbackFn,
  };
  box.fn = async (report: ReportHandbackPayload) => {
    box.calls += 1;
    box.lastReport = report;
    return returns;
  };
  return box as unknown as { fn: ReportHandbackFn; calls: number; lastReport: ReportHandbackPayload | undefined };
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

function names(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

/** 失败措辞纪律：**绝不**出现宣称已交回的话术。 */
function assertNeverClaimsDelivered(message: string): void {
  assert.equal(/已交回/.test(message), false, `失败措辞绝不能含「已交回」：${message}`);
}

const GOOD_ARGS = {
  status: "completed",
  summary: "改了什么：新增 submit_report 工具；测试全绿",
  evidence: ["src/provider/pi/tools.ts", "node --test 全绿"],
};

// —————————————————————— 1. 结构性：未注入 → 不注册 ——————————————————————

test("未注入回交能力：submit_report 不在工具集里（只给项目角色；能力缺席 = 最强 fail-closed，C-1）", () => {
  const list = names(buildGovernedTools(allowGate()));
  assert.equal(list.includes(SUBMIT_REPORT_TOOL_NAME), false, "未注入回交能力时绝不应有 submit_report");
  assert.ok(list.includes("write_file"));
  assert.ok(list.includes("read_file"));
});

test("注入回交能力：submit_report 出现在工具集里（同 run_shell / customerInput 的注入先例）", () => {
  const s = spy(undefined);
  const list = names(buildGovernedTools(allowGate(), { reportHandback: s.fn }));
  assert.ok(list.includes(SUBMIT_REPORT_TOOL_NAME));
});

// —————————————————————— 2. 载荷逐字传递 + 成功回执 ——————————————————————

test("handler 把载荷逐字交给 fn；回执 ok:true → 「报告已交回」并回显 status", async () => {
  const s = spy({ ok: true, message: "已并入回交事件" });
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: s.fn }), SUBMIT_REPORT_TOOL_NAME);

  const r = await report.handler({ name: SUBMIT_REPORT_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(s.calls, 1, "handler 必须真的调用注入的 fn");
  assert.deepEqual(s.lastReport, {
    status: "completed",
    summary: "改了什么：新增 submit_report 工具；测试全绿",
    evidence: ["src/provider/pi/tools.ts", "node --test 全绿"],
  });
  assert.equal(r.ok, true);
  assert.match(r.message, /报告已交回/);
  assert.match(r.message, /completed/);
  assert.match(r.message, /已并入回交事件/);
});

test("handler：status=blocked 与省略 evidence 的载荷也逐字传递（evidence 缺省不出现在载荷里）", async () => {
  const s = spy(undefined); // 无回执 = 已接收
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: s.fn }), SUBMIT_REPORT_TOOL_NAME);

  const r = await report.handler({
    name: SUBMIT_REPORT_TOOL_NAME,
    args: { status: "blocked", summary: "确认无法完成：缺少凭据" },
  });

  assert.deepEqual(s.lastReport, { status: "blocked", summary: "确认无法完成：缺少凭据" });
  assert.equal(r.ok, true);
  assert.match(r.message, /报告已交回/);
  assert.match(r.message, /blocked/);
});

test("fire-and-forget（void 返回）能力可注入：编排的 (report) => void | Promise<void> 形态 → 「报告已交回」", async () => {
  // 这就是编排 `AdapterCapabilities.reportHandback` 的实际形态（不要求回执）——若类型不接纳它，
  // 集成侧 typecheck 即断（曾实测：拒绝 void 时 run-role.ts/govern-target.test.ts 报 TS2322/TS2345）。
  const seen: ReportHandbackPayload[] = [];
  const asyncVoid: ReportHandbackFn = async (report) => {
    seen.push(report);
  }; // Promise<void>
  const syncVoid: ReportHandbackFn = (report) => {
    seen.push(report);
  }; // void

  for (const fn of [asyncVoid, syncVoid]) {
    const report = tool(buildGovernedTools(allowGate(), { reportHandback: fn }), SUBMIT_REPORT_TOOL_NAME);
    const r = await report.handler({ name: SUBMIT_REPORT_TOOL_NAME, args: GOOD_ARGS });
    assert.equal(r.ok, true, "无回执（void）应视为已接收");
    assert.match(r.message, /报告已交回/);
  }
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
});

// —————————————————————— 3. 参数校验（fn 不该被调用） ——————————————————————

test("参数校验：status 非法 / 缺 summary / evidence 非法 → ok:false 且 fn 未被调用", async () => {
  const s = spy({ ok: true });
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: s.fn }), SUBMIT_REPORT_TOOL_NAME);

  const badStatus = await report.handler({
    name: SUBMIT_REPORT_TOOL_NAME,
    args: { status: "done", summary: "x" },
  });
  assert.equal(badStatus.ok, false);
  assert.match(badStatus.message, /status/);

  const missingSummary = await report.handler({
    name: SUBMIT_REPORT_TOOL_NAME,
    args: { status: "completed", summary: "   " },
  });
  assert.equal(missingSummary.ok, false);
  assert.match(missingSummary.message, /summary/);

  const badEvidence = await report.handler({
    name: SUBMIT_REPORT_TOOL_NAME,
    args: { status: "completed", summary: "x", evidence: "不是数组" },
  });
  assert.equal(badEvidence.ok, false);
  assert.match(badEvidence.message, /evidence/);

  const badEvidenceEntry = await report.handler({
    name: SUBMIT_REPORT_TOOL_NAME,
    args: { status: "completed", summary: "x", evidence: ["ok", "  "] },
  });
  assert.equal(badEvidenceEntry.ok, false, "空串条目应被拒");

  assert.equal(s.calls, 0, "参数非法时绝不调用注入的 fn");
});

// —————————————————————— 4/5. 失败如实（含反向断言） ——————————————————————

test("fn 抛错 → fail-closed「未能交回」+ 原因，绝不谎报「已交回」", async () => {
  const fn: ReportHandbackFn = async () => {
    throw new Error("回交通道内部异常");
  };
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: fn }), SUBMIT_REPORT_TOOL_NAME);

  const r = await report.handler({ name: SUBMIT_REPORT_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能交回/);
  assert.match(r.message, /回交通道内部异常/);
  assertNeverClaimsDelivered(r.message);
});

test("回执 ok:false（回交被拒）→ ok:false + 回执原因，绝不谎报", async () => {
  const s = spy({ ok: false, message: "没有对应的在手任务" });
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: s.fn }), SUBMIT_REPORT_TOOL_NAME);

  const r = await report.handler({ name: SUBMIT_REPORT_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能交回/);
  assert.match(r.message, /没有对应的在手任务/);
  assertNeverClaimsDelivered(r.message);
});

test("中止：signal 已中止 → 立即 fail-closed 返回（不等注入 fn；防悬挂，A-6 纪律）", async () => {
  const s = spy({ ok: true });
  const report = tool(buildGovernedTools(allowGate(), { reportHandback: s.fn }), SUBMIT_REPORT_TOOL_NAME);
  const controller = new AbortController();
  controller.abort();

  const r = await report.handler({ name: SUBMIT_REPORT_TOOL_NAME, args: GOOD_ARGS, signal: controller.signal });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能交回/);
  assertNeverClaimsDelivered(r.message);
});

// —————————————————————— 6. 不写盘 ——————————————————————

test("不写盘：即便 writeRoot 就绪、gate 放行、交报告成功，工具层零文件系统副作用", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-report-"));
  try {
    assert.deepEqual(readdirSync(dir), [], "起始：临时目录为空");

    const s = spy({ ok: true });
    const tools = buildGovernedTools(allowGate(), { writeRoot: dir, reportHandback: s.fn });
    const r = await tool(tools, SUBMIT_REPORT_TOOL_NAME).handler({
      name: SUBMIT_REPORT_TOOL_NAME,
      args: GOOD_ARGS,
    });

    assert.equal(r.ok, true);
    assert.equal(s.calls, 1);
    assert.deepEqual(readdirSync(dir), [], "交报告调用后盘上应无任何新文件/目录");
    assert.equal(existsSync(join(dir, ".ans")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// —————————————————————— 7. 文案（C-1；含反向断言） ——————————————————————

test("describeTool 文案：写死「必须交报告、不得只在正文里说」，且不得暗示任何写权", () => {
  const d = describeTool(SUBMIT_REPORT_TOOL_NAME);
  const text = [d.description, ...(d.promptGuidelines ?? [])].join("\n");

  assert.match(text, /必须/, "应写死「必须交回报告」");
  assert.match(text, /交回报告|交回.*报告/, "应说明语义是交回报告");
  assert.match(text, /不得只在正文里说/, "应禁止「只在正文里说」");
  assert.match(text, /一句话|结论/, "应要求一句话结论");
  assert.match(text, /证据/, "应要求关键证据");
  // 写权防线：明示不写盘/不改变写盘权限。
  assert.match(text, /不写盘/);
  assert.match(text, /不改变.*写盘权限|写盘权限.*不变|不改变任何写盘权限/);
  // 反向断言：不得出现「可直接写盘 / 获得写盘许可」这类暗示。
  assert.equal(/(可直接写盘|获准写盘|写盘许可.*本工具)/.test(text), false, "不得暗示本工具有写权");

  // schema：status 枚举 + summary 必填 + evidence 可选数组。
  assert.deepEqual(d.parameters.required, ["status", "summary"]);
  const props = d.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(props["status"]["enum"], ["completed", "blocked"]);
  assert.equal(props["evidence"]["type"], "array");
  // 不并到 sequential 档（它不是交互等待；无执行模式覆盖）。
  assert.equal(d.executionMode, undefined);
});

// —————————————————————— 8. 冻结契约家（§4） ——————————————————————

test("ReportHandbackPayload / ReportHandbackReceipt / ReportHandbackFn 可从冻结契约家 session.ts 导入并使用", async () => {
  const payload: ReportHandbackPayload = { status: "completed", summary: "s", evidence: ["p"] };
  const receipt: ReportHandbackReceipt = { ok: true };
  const fn: ReportHandbackFn = async () => receipt;

  const got = await fn(payload);
  assert.equal(got?.ok, true);
});
