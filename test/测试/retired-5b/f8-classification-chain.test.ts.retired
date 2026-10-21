// 独立复验（测试角色，2026-10-16）：F-8 三级分类链一致性——**同一执行事实**在
//   ① 运行时核心投影（tool-display.projectToolEvent → display.process / summary 措辞）
//   ② 桌面窗口行归类（session-history.classifyProcessOutcome）
//   ③ 桌面UI 行样式（app/renderer/tool-rows.js activityOf → status/label/exceptional）
// 三级上的结论必须一致（《非零退出＝已执行完成（退出码 N）》、《超时＝超时终止》）。
// 独立构造：把 ① 的输出**直接喂给** ②③，断言同源事实全链一致（不复用任何实施方用例断言）。
import test from "node:test";
import assert from "node:assert/strict";
import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import { classifyProcessOutcome } from "../../../app/desktop/session-history.ts";
import type { RuntimeToolEventSource } from "../../../src/model/runtime.ts";

await import(new URL("../../../app/renderer/tool-rows.js", import.meta.url).href);
const toolRows = (globalThis as unknown as { ANSToolRows: { activityOf(input: unknown): { status: string; label: string; exceptional: boolean } } }).ANSToolRows;

const projector = createToolDisplayContext();

function projectHandlerResult(execution: Record<string, unknown>, message: string) {
  const source: RuntimeToolEventSource = {
    origin: "handler-result",
    phase: "result",
    toolName: "run_shell",
    toolCallId: "verify-call-1",
    turnId: "verify-turn-1",
    result: { ok: false, message, execution },
  };
  return projector.projectToolEvent(source);
}

test("F-8 链一致性（非零退出）：投影措辞=已执行完成（退出码 3）；classify=exited-nonzero；activityOf 中性标签", () => {
  const projected = projectHandlerResult(
    { exitCode: 3, stdout: "部分输出", stderr: "" },
    "run_shell 已执行：grep x f（exit 3）\nstdout:\n部分输出\nstderr:\n",
  );
  assert.equal(projected.kind, "denied", "ok:false 契约不变（kind/status 仍如实标失败）");
  assert.ok(projected.summary.includes("已执行完成（退出码 3）"), `投影摘要：${projected.summary}`);
  assert.ok(!projected.summary.includes("执行失败"), "不得再落入「执行失败」兜底");
  const display = (projected.detail as { display: unknown }).display;
  // ② 桌面窗口行归类：直接消费①的结构化事实。
  assert.equal(classifyProcessOutcome(display), "exited-nonzero");
  // ③ 桌面UI 行样式：同一 detail 直接给 activityOf。
  const row = toolRows.activityOf({ kind: projected.kind, summary: projected.summary, detail: projected.detail });
  assert.equal(row.status, "exited-nonzero");
  assert.equal(row.label, "已执行完成（退出码 3）");
  assert.equal(row.exceptional, false, "非零退出不再标红（红→中性）");
});

test("F-8 链一致性（超时终止）：投影「超时终止」+ process.timedOut；classify=timed-out；activityOf 独立一类且仍显著", () => {
  const projected = projectHandlerResult(
    { timedOut: true, timeoutMs: 250, signal: "SIGKILL", stdout: "started", stderr: "" },
    "run_shell 超时已终止（250 ms）：命令超过本次执行时限，已被终止。",
  );
  assert.ok(projected.summary.includes("超时终止"), `投影摘要：${projected.summary}`);
  const display = (projected.detail as { display: { process?: { timedOut?: boolean } } }).display;
  assert.equal(display.process?.timedOut, true, "display.process.timedOut 为冻结接口的结构化事实");
  assert.equal(classifyProcessOutcome(display), "timed-out");
  const row = toolRows.activityOf({ kind: projected.kind, summary: projected.summary, detail: projected.detail });
  assert.equal(row.status, "timed-out", "超时与普通失败/非零退出互为独立类别");
  assert.equal(row.label, "超时终止");
  assert.equal(row.exceptional, true, "异常终止保持显著（不当中性）");
});

test("F-8 链一致性（spawn 失败不被吞）：投影仍「执行失败」；classify=null（无结构化完成事实）；activityOf 仍标红", () => {
  const projected = projectHandlerResult(
    { error: "spawn ENOENT" },
    "run_shell 执行失败（未能启动或运行）：spawn ENOENT",
  );
  assert.ok(projected.summary.includes("执行失败"), `投影摘要：${projected.summary}`);
  const display = (projected.detail as { display: unknown }).display;
  assert.equal(classifyProcessOutcome(display), null, "无「进程跑完」事实 ⇒ 不得冒充分类");
  const row = toolRows.activityOf({ kind: projected.kind, summary: projected.summary, detail: projected.detail });
  assert.equal(row.exceptional, true);
  assert.notEqual(row.status, "exited-nonzero");
});

test("F-8 旧行兼容（无结构化事实）：classify=null、activityOf 文本口径逐字保留（过渡期不误伤）", () => {
  assert.equal(classifyProcessOutcome(undefined), null);
  assert.equal(classifyProcessOutcome({ version: 1 }), null);
  assert.equal(classifyProcessOutcome({ version: 2, process: { exitCode: 1 } }), null, "版本不识别不猜");
  const legacy = toolRows.activityOf({ kind: "denied", summary: "run_shell 已执行：grep x（exit 1）\nstdout:\nstderr:\n" });
  assert.equal(legacy.status, "failed", "旧文本行仍走既有 knownFailure 正则路径");
  assert.equal(legacy.exceptional, true);
});
