// 独立测试角色：内存 JSONL → 新渲染器纯逻辑（events/replay）的回放/分类等价回归。
// 旧 renderer/tool-rows.js/ui-labels.js 已于 5B 删除；本文件按新模块重写，保留原覆盖语义。
import test from "node:test";
import assert from "node:assert/strict";
import { parseSessionJsonl } from "../../app/desktop/session-history.ts";
import type { ReplayRow } from "../../app/desktop/session-history.ts";
import { historyRowToDescriptor, classifyInjected, isSpecialTool, toolStatus } from "../../app/renderer/src/chat/events.ts";
import { planReplay, rowSignature } from "../../app/renderer/src/chat/replay.ts";

type Activity = Record<string, unknown>;
const at = "2026-10-13T04:00:00.000Z";

function rows(messages: unknown[]): ReplayRow[] {
  const jsonl = [JSON.stringify({ type: "session", version: 3, id: "independent-uiux" }),
    ...messages.map((message, index) => JSON.stringify({ type: "message", id: "entry-" + index, timestamp: at, message }))].join("\n");
  const parsed = parseSessionJsonl(jsonl);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skipped, 0);
  return parsed.rows;
}
function activityOf(row: ReplayRow): Activity {
  const descriptor = historyRowToDescriptor(row as unknown as Record<string, unknown>);
  const data = descriptor.data as Record<string, unknown>;
  if (descriptor.kind === "tool-lifecycle") return (data.activity || {}) as Activity;
  return (((data.items as Activity[]) || [])[0] || {}) as Activity;
}
const call = (id: string, toolName: string, args: unknown) => ({ role: "assistant", content: [{ type: "toolCall", id, name: toolName, arguments: args }] });
const result = (id: string, toolName: string, text: string, extras: Record<string, unknown> = {}) =>
  ({ role: "toolResult", toolCallId: id, toolName, content: [{ type: "text", text }], ...extras });

test("独立UI2：正文声称成功不把缺状态的历史结果变成成功", () => {
  const parsed = rows([call("old", "read_file", { path: "docs/result.md" }),
    result("old", "read_file", "操作成功，全部任务完成\nPRIVATE_FILE_BODY_SHOULD_NOT_BE_RENDERED")]);
  const [started, unknown] = parsed.map(activityOf);
  assert.equal(started.status, "running");
  assert.equal(started.label, "调用发起");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.target, "docs/result.md");
  assert.doesNotMatch(String(unknown.visibleSummary), /PRIVATE_FILE_BODY/);
  assert.equal(parsed.length, 2, "调用和结果仍是两条原活动，不能计成成功次数");
});

test("独立UI2：交错调用结果按callId保持目标", () => {
  const parsed = rows([call("a", "read_file", { path: "docs/a.md" }), call("b", "read_file", { path: "docs/b.md" }),
    result("b", "read_file", "正文 B"), result("a", "read_file", "正文 A")]);
  assert.deepEqual(parsed.slice(2).map((row) => activityOf(row).target), ["docs/b.md", "docs/a.md"]);
  assert.deepEqual(parsed.slice(2).map((row) => activityOf(row).callId), ["b", "a"]);
  assert.ok(parsed.slice(2).every((row) => activityOf(row).status !== "completed"));
});

test("独立UI2：可靠失败保留异常和目标；toolStatus 对失败/未知一致", () => {
  const parsed = rows([call("bad", "write_file", { path: "docs/missing.md" }), result("bad", "write_file", "文件不存在", { isError: true })]);
  const descriptor = historyRowToDescriptor(parsed[1] as unknown as Record<string, unknown>);
  assert.equal(parsed[1].kind, "denied");
  assert.equal(descriptor.kind, "denied");
  assert.match(String((descriptor.data as Record<string, unknown>).text), /文件不存在/);
  assert.equal(toolStatus({ phase: "blocked" }).status, "denied");
  assert.equal(toolStatus({ phase: "result" }).status, "unknown");
});

test("独立UI2：交互调用和结论保留同一锚点，特殊工具独立生命周期", () => {
  const parsed = rows([call("confirm-7", "request_confirmation", { title: "是否保存方案？" }),
    result("confirm-7", "request_confirmation", "客户已确认")]);
  assert.equal(parsed[0].requestId, "confirm-7");
  assert.equal(parsed[1].requestId, "confirm-7");
  assert.equal(parsed[0].anchor, "request");
  assert.equal(parsed[1].anchor, "conclusion");
  assert.equal(parsed[0].anchorKey, parsed[1].anchorKey);
  assert.equal(isSpecialTool("request_confirmation"), true);
  assert.equal(historyRowToDescriptor(parsed[0] as unknown as Record<string, unknown>).kind, "tool-lifecycle");
  for (const name of ["request_choice", "submit_report", "dispatch_task", "report_shell_verdict"]) {
    assert.equal(isSpecialTool(name), true, name);
  }
});

test("独立UI2：回放计划 skip/append/full 与行签名一致", () => {
  const unknown = rows([result("x", "read_file", "同一正文")]);
  const completed = rows([result("x", "read_file", "同一正文")]);
  const sig = unknown.map((row) => rowSignature(row as unknown as Record<string, unknown>));
  assert.deepEqual(planReplay(sig, sig), { mode: "skip" });
  assert.deepEqual(planReplay(null, sig), { mode: "full" });
  assert.deepEqual(planReplay(sig.slice(0, 0), sig), { mode: "append", from: 0 });
  const changed = rows([result("x", "read_file", "同一正文", { isError: true })]);
  assert.equal(planReplay(sig, changed.map((row) => rowSignature(row as unknown as Record<string, unknown>))).mode, "full");
});

test("独立UI2：系统通知/注入分类仍识别，伪形态不误伤", () => {
  const system = classifyInjected("[系统·安装] 已安装技能「k」→ 角色「X」");
  assert.equal(system?.kind, "system");
  assert.equal(classifyInjected("[系统·安装]伪行"), null);
  const handback = classifyInjected("[回交] 来自 维护 的报告");
  assert.equal(handback?.kind, "handback");
  assert.equal(handback?.sourceRoleId, "维护");
});
