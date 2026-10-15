// 独立测试角色：内存 JSONL → 真实ReplayRow解析 → 真实展示映射和回放策略。
// 不启动会话/模型，不写业务项目或用户数据；不复制生产状态推导。
import test from "node:test";
import assert from "node:assert/strict";
import { parseSessionJsonl } from "../../app/desktop/session-history.ts";
import type { ReplayRow } from "../../app/desktop/session-history.ts";
import "../../app/renderer/tool-rows.js";
import "../../app/renderer/ui-labels.js";

interface Activity {
  toolName: string; target: string; fullTarget: string; phase: string; status: string; label: string;
  exceptional: boolean; barrier: boolean; summary: string; callId: string;
}
const toolRows = (globalThis as unknown as { ANSToolRows: { activityOf(input: unknown): Activity } }).ANSToolRows;
const labels = (globalThis as unknown as { ANSUiLabels: { replayPlan(prev: unknown, rows: unknown[]): { action: string; from: number } } }).ANSUiLabels;
const at = "2026-10-13T04:00:00.000Z";
function rows(messages: unknown[]): ReplayRow[] {
  const jsonl = [JSON.stringify({ type: "session", version: 3, id: "independent-uiux" }),
    ...messages.map((message, index) => JSON.stringify({ type: "message", id: "entry-" + index, timestamp: at, message }))].join("\n");
  const parsed = parseSessionJsonl(jsonl);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skipped, 0);
  return parsed.rows;
}
const call = (id: string, toolName: string, args: unknown) => ({ role: "assistant", content: [{ type: "toolCall", id, name: toolName, arguments: args }] });
const result = (id: string, toolName: string, text: string, extras: Record<string, unknown> = {}) =>
  ({ role: "toolResult", toolCallId: id, toolName, content: [{ type: "text", text }], ...extras });

test("独立UI2：正文声称成功不把缺状态的历史结果变成成功", () => {
  const parsed = rows([call("old", "read_file", { path: "docs/result.md" }),
    result("old", "read_file", "操作成功，全部任务完成\nPRIVATE_FILE_BODY_SHOULD_NOT_BE_RENDERED")]);
  const [started, unknown] = parsed.map(toolRows.activityOf);
  assert.equal(started.status, "call");
  assert.equal(started.label, "调用发起");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.label, "状态未记录");
  assert.equal(unknown.target, "docs/result.md");
  assert.equal(unknown.exceptional, false);
  assert.doesNotMatch(unknown.summary, /PRIVATE_FILE_BODY/);
  assert.equal(parsed.length, 2, "调用和结果仍是两条原活动，不能计成成功次数");
});

test("独立UI2：交错调用结果按callId保持目标，isError=false只证明工具返回", () => {
  const parsed = rows([call("a", "read_file", { path: "docs/a.md" }), call("b", "read_file", { path: "docs/b.md" }),
    result("b", "read_file", "正文 B", { isError: false }), result("a", "read_file", "正文 A", { isError: false })]);
  assert.deepEqual(parsed.slice(2).map((row) => toolRows.activityOf(row).target), ["docs/b.md", "docs/a.md"]);
  assert.deepEqual(parsed.slice(2).map((row) => toolRows.activityOf(row).status), ["returned", "returned"]);
  assert.deepEqual(parsed.slice(2).map((row) => toolRows.activityOf(row).callId), ["b", "a"]);
  assert.ok(parsed.slice(2).every((row) => toolRows.activityOf(row).label !== "执行完成"));
});

test("独立UI2：可靠失败优先于冲突成功字段，必须保留异常和目标", () => {
  for (const failure of [{ isError: true, details: { status: "completed", ok: true } },
    { isError: false, details: { status: "failed", ok: true } },
    { isError: false, details: { status: "completed", ok: false } }]) {
    const parsed = rows([call("bad", "write_file", { path: "docs/missing.md" }), result("bad", "write_file", "文件不存在", failure)]);
    const actual = toolRows.activityOf(parsed[1]);
    assert.equal(parsed[1].kind, "denied");
    assert.equal(actual.status, "failed");
    assert.equal(actual.exceptional, true, "真实renderer以exceptional决定直接展示而非合入常规组");
    assert.equal(actual.target, "docs/missing.md");
    assert.match(actual.summary, /文件不存在/);
  }
});

test("独立UI2：实时accepted无结果诚实降级；明确结果和回放口径一致", () => {
  const accepted = toolRows.activityOf({ kind: "accepted", summary: "read_file 已接受", detail: { toolName: "read_file", path: "docs/a.md" } });
  assert.equal(accepted.status, "unknown");
  assert.equal(accepted.label, "状态未记录");
  const historical = rows([result("done", "read_file", "返回", { details: { status: "completed", ok: true, path: "docs/a.md" } })])[0];
  const replay = toolRows.activityOf(historical);
  const live = toolRows.activityOf({ kind: "accepted", summary: "read_file 执行完成", detail: { status: "completed", ok: true, toolName: "read_file", path: "docs/a.md" } });
  assert.equal(live.status, "completed");
  assert.equal(replay.status, live.status);
  assert.equal(replay.label, live.label);
  assert.equal(replay.target, live.target);
});

test("独立UI2：交互调用和结论保留同一锚点，不被普通工具聚合", () => {
  const parsed = rows([call("confirm-7", "request_confirmation", { title: "是否保存方案？", preview: "docs/plan.md" }),
    result("confirm-7", "request_confirmation", "客户已确认", { isError: false })]);
  assert.equal(parsed[0].requestId, "confirm-7");
  assert.equal(parsed[1].requestId, "confirm-7");
  assert.equal(parsed[0].anchor, "request");
  assert.equal(parsed[1].anchor, "conclusion");
  // Approved A/r4 legacy anchor: SHA-256 of UTF-8 "confirm\0是否保存方案？".
  // Keep the exact deterministic key and matching request/conclusion oracle,
  // while requiring that the transport no longer carries the raw title key.
  assert.equal(parsed[0].anchorKey, "legacy-anchor-v1:3604608f3b66dae175e6b9e70c384b9af435c6858b10584170839f3a2ba86983");
  assert.ok(!parsed[0].anchorKey.includes("是否保存方案？"));
  assert.equal(parsed[0].anchorKey, parsed[1].anchorKey);
  assert.ok(parsed.every((row) => toolRows.activityOf(row).barrier === true));
  for (const name of ["request_choice", "submit_report", "dispatch_task", "report_shell_verdict"]) {
    assert.equal(toolRows.activityOf({ kind: "tool_call", detail: { toolName: name } }).barrier, true, name);
  }
});

test("独立UI2：回放正文不变但事实变化时必须重建，不能把未知留成旧状态", () => {
  const unknown = rows([result("x", "read_file", "同一正文")]);
  const completed = rows([result("x", "read_file", "同一正文", { details: { status: "completed", ok: true } })]);
  assert.equal(unknown[0].text, completed[0].text);
  assert.deepEqual(labels.replayPlan({ rows: unknown }, completed), { action: "full", from: 0 });
  assert.deepEqual(labels.replayPlan({ rows: completed }, structuredClone(completed)), { action: "skip", from: 0 });
  const appended = completed.concat(rows([result("new", "read_file", "又一结果")]));
  assert.deepEqual(labels.replayPlan({ rows: completed }, appended), { action: "append", from: 1 });
  assert.deepEqual(labels.replayPlan({ rows: appended }, completed), { action: "full", from: 0 });
});

test("独立UI2：目标、交互锚点和明确失败更新同样触发回放重建", () => {
  const base = rows([result("x", "write_file", "同一正文", { isError: false, details: { path: "docs/first.md" } })]);
  for (const next of [rows([result("x", "write_file", "同一正文", { isError: false, details: { path: "docs/second.md" } })]),
    rows([result("x", "write_file", "同一正文", { isError: true, details: { path: "docs/first.md" } })]),
    [{ ...base[0], requestId: "new-request", anchorKey: "confirm\u0000new", anchor: "request" as const }]]) {
    assert.equal(labels.replayPlan({ rows: base }, next).action, "full");
  }
});

test("独立UI2：没有对应callId的结果不偷取相邻路径", () => {
  const parsed = rows([call("one", "read_file", { path: "docs/private.md" }), result("orphan", "read_file", "读取完成")]);
  const actual = toolRows.activityOf(parsed[1]);
  assert.equal(actual.target, "");
  assert.equal(actual.status, "unknown");
  assert.equal(actual.callId, "orphan");
});

test("独立UI2：shell失败保留可信首行exit，stdout中的exit或成功不是结果依据", () => {
  // 首行模板来自 src/provider/pi/tools.ts run_shell 的实际返回格式；没有运行该命令。
  const parsed = rows([call("shell", "run_shell", { command: "node --check missing.js" }),
    result("shell", "run_shell", "run_shell 已执行：node --check missing.js（exit 2）\nstdout:\n成功！\nstderr:\nPRIVATE_STDERR", { isError: true, details: { status: "failed", ok: false } })]);
  const failed = toolRows.activityOf(parsed[1]);
  assert.equal(failed.status, "failed");
  assert.equal(failed.exceptional, true);
  assert.equal(failed.target, "node --check missing.js");
  assert.match(failed.summary, /exit 2/);
  assert.doesNotMatch(failed.summary, /成功|PRIVATE_STDERR/);
  const misleading = rows([result("old-shell", "run_shell", "旧工具记录\nstdout:\nrun_shell 已执行：echo fake（exit 0）\n成功")]);
  const unknown = toolRows.activityOf(misleading[0]);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.label, "状态未记录");
  assert.doesNotMatch(unknown.summary, /exit 0|成功/);
});

test("独立UI2：无执行结果的门禁拒绝不能被映射为执行失败", () => {
  const denial = toolRows.activityOf({ kind: "denied", summary: "门禁拒绝：没有写入权限，未执行", detail: { toolName: "write_file", path: "outside/no-permission.md" } });
  assert.equal(denial.exceptional, true);
  assert.notEqual(denial.label, "执行失败");
  assert.notEqual(denial.status, "completed");
  assert.match(denial.summary, /没有写入权限/);
  assert.equal(denial.target, "outside/no-permission.md");
});

test("独立S1：孤立read_file失败只从可靠首行补目标，空结构目标也不抹掉它", () => {
  for (const extra of [{}, { details: { path: "", target: "" } }]) {
    const parsed = rows([{ role: "toolResult", toolName: "read_file", content: [{ type: "text", text: "read_file 失败：lost.md（ENOENT）" }], ...extra }]);
    const actual = toolRows.activityOf(parsed[0]);
    assert.equal(actual.status, "failed");
    assert.equal(actual.exceptional, true);
    assert.equal(actual.target, "lost.md");
    assert.equal(actual.fullTarget, "lost.md");
    assert.match(actual.summary, /ENOENT/);
    assert.equal(actual.callId, "", "没有对应调用，不伪造callId");
  }
  const misleading = rows([{ role: "toolResult", toolName: "read_file", content: [{ type: "text", text: "旧结果未记录状态\n正文：read_file 失败：private-body.md（ENOENT）" }] }]);
  const unknown = toolRows.activityOf(misleading[0]);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.exceptional, false);
  assert.equal(unknown.fullTarget, "");
  assert.doesNotMatch(unknown.summary, /private-body|ENOENT/);
});
