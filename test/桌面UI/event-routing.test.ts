// test/桌面UI/event-routing.test.ts
// Phase 3A 纯逻辑：事件信封路由、事件→行分类、工具事实（exitCode/timedOut）优先。

import test from "node:test";
import assert from "node:assert/strict";
import {
  activityFromEvent,
  classifyInjected,
  describeEvent,
  envelopeMatches,
  historyRowToDescriptor,
  normalizeEnvelopes,
  toolStatus,
} from "../../app/renderer/src/chat/events.ts";
import {
  callSummary,
  foldSummaryText,
  mergePhases,
  phaseRowView,
} from "../../app/renderer/src/chat/tool-summary.ts";

test("信封路由：project/runtime/role 不匹配即丢弃", () => {
  const view = { projectRoot: "/p", runtime: "pi" };
  const base = { projectRoot: "/p", roleId: "A", runtime: "pi", event: { kind: "message" } };
  assert.equal(envelopeMatches(base, view), true);
  assert.equal(envelopeMatches({ ...base, projectRoot: "/x" }, view), false);
  assert.equal(envelopeMatches({ ...base, runtime: "claude" }, view), false);
  assert.equal(
    envelopeMatches({ ...base, event: { kind: "message", runtime: "claude" } }, view),
    false,
  );
  assert.equal(
    envelopeMatches({ ...base, event: { kind: "message", roleId: "B" } }, view),
    false,
  );
});

test("单发与批量信封归一化", () => {
  const single = { roleId: "A", event: { kind: "message" } };
  assert.deepEqual(normalizeEnvelopes(single), [single]);
  assert.deepEqual(normalizeEnvelopes([single, null, { event: {} }]), [single]);
  assert.deepEqual(normalizeEnvelopes(null), []);
});

test("事件→行：prompt-input→user；assistant；settled→turn-terminal；tool→activities", () => {
  const user = describeEvent({
    kind: "message",
    turnId: "t1",
    summary: "用户输入",
    detail: { source: "prompt-input", text: "你好" },
  });
  assert.equal(user?.kind, "user");
  assert.deepEqual(user?.data, { text: "你好" });

  const assistant = describeEvent({
    kind: "message",
    turnId: "t1",
    summary: "回复原文",
  });
  assert.equal(assistant?.kind, "assistant");

  const settled = describeEvent({
    kind: "settled",
    turnId: "t1",
    summary: "本轮结束",
    detail: { outcome: "completed" },
  });
  assert.equal(settled?.kind, "turn-terminal");
  assert.equal((settled?.data as { outcome: string }).outcome, "completed");

  const tool = describeEvent({
    kind: "tool_call",
    turnId: "t1",
    summary: "读取文件",
    detail: {
      toolName: "read_file",
      toolCallId: "call-1",
      phase: "start",
      args: { path: "docs/a.md" },
    },
  });
  assert.equal(tool?.kind, "activities");
  assert.equal(tool?.callId, "call-1");

  const deniedTool = describeEvent({
    kind: "denied",
    turnId: "t1",
    summary: "未放行：越界",
    detail: { toolName: "write_file", toolCallId: "call-2", phase: "blocked" },
  });
  assert.equal(deniedTool?.kind, "denied");
  assert.equal(deniedTool?.callId, "call-2");
});

test("工具事实：timedOut > exitCode≠0 > failed > phase", () => {
  assert.deepEqual(toolStatus({ timedOut: true, exitCode: 2 }), {
    status: "timed-out",
    statusText: "超时终止",
  });
  assert.deepEqual(toolStatus({ exitCode: 2 }), {
    status: "exited-nonzero",
    statusText: "已执行完成（退出码 2）",
  });
  assert.deepEqual(toolStatus({ phase: "start" }), {
    status: "running",
    statusText: "运行中",
  });
  assert.deepEqual(toolStatus({ denied: true }), {
    status: "denied",
    statusText: "未放行",
  });
  const activity = activityFromEvent({
    kind: "tool_call",
    turnId: "t1",
    summary: "run_shell",
    detail: {
      toolName: "run_shell",
      toolCallId: "c1",
      display: { target: "npm test" },
      process: { exitCode: 1 },
    },
  });
  assert.equal(activity?.target, "npm test");
  assert.equal(activity?.status, "exited-nonzero");
  assert.equal(activity?.callId, "c1");
});

test("注入/系统通知分类与历史行映射", () => {
  assert.deepEqual(classifyInjected("[系统·安装] 已安装技能"), {
    kind: "system",
    label: "系统消息 · 安装",
    body: "已安装技能",
  });
  assert.equal(classifyInjected("[派发] 来自 B 的 任务")?.kind, "dispatch");
  assert.equal(classifyInjected("普通文本"), null);

  const historyUser = historyRowToDescriptor({ kind: "user", text: "历史用户", turnId: "t1" });
  assert.equal(historyUser.kind, "user");
  assert.equal(historyUser.replay, true);
  const historyTool = historyRowToDescriptor({ kind: "tool", text: "read_file: a.md", turnId: "t1" });
  assert.equal(historyTool.kind, "activities");
  const historyDenied = historyRowToDescriptor({ kind: "denied", text: "越界", turnId: "t1" });
  assert.equal(historyDenied.kind, "denied");
});

test("工具组相位合并：同轮同 callId 合并，无 callId 各成一行", () => {
  const events = [
    {
      kind: "tool_call",
      turnId: "t1",
      summary: "调用工具 read_file",
      detail: { toolName: "read_file", toolCallId: "c1", phase: "start", path: "a.md" },
    },
    {
      kind: "accepted",
      turnId: "t1",
      summary: "read_file 执行完成",
      detail: { toolName: "read_file", toolCallId: "c1", phase: "result", ok: true, status: "completed" },
    },
    {
      kind: "denied",
      turnId: "t1",
      summary: "未执行：命令被拒绝",
      detail: { toolName: "run_shell", toolCallId: "c2", phase: "blocked" },
    },
    {
      kind: "tool_call",
      summary: "旧事件无轮次",
      detail: { toolName: "legacy" },
    },
  ];
  const items = events.map((event) => activityFromEvent(event)!);
  const rows = mergePhases(items);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].phases, [0, 1]);
  assert.equal(phaseRowView(rows[0]).status, "completed");
  assert.equal(phaseRowView(rows[0]).statusText, "执行完成");
  assert.deepEqual(rows[1].phases, [2]);
  assert.equal(phaseRowView(rows[1]).status, "denied");
  assert.equal(rows[0].items.length, 2);
});

test("折叠摘要：N 个调用 + 未放行/失败/状态未记录计数", () => {
  const items = [
    activityFromEvent({
      kind: "tool_call",
      summary: "调用工具 read_file",
      detail: { toolName: "read_file", toolCallId: "a", phase: "start" },
    })!,
    activityFromEvent({
      kind: "denied",
      summary: "未执行：命令被拒绝",
      detail: { toolName: "run_shell", toolCallId: "b", phase: "blocked" },
    })!,
    activityFromEvent({
      kind: "accepted",
      summary: "write_file 执行失败：x.md（EACCES）",
      detail: { toolName: "write_file", toolCallId: "c", phase: "result", ok: false, status: "failed" },
    })!,
    activityFromEvent({
      kind: "accepted",
      summary: "request accepted",
      detail: { toolName: "legacy", phase: "result" },
    })!,
  ];
  const summary = callSummary(items);
  assert.equal(summary.calls, 4);
  assert.equal(summary.denied, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.unknown, true);
  assert.equal(
    foldSummaryText(summary),
    "本轮 4 个调用：read_file / run_shell / write_file / legacy · 含 1 条未放行 · 含 1 条失败 · 含状态未记录",
  );
});

test("取消/失败目标取自 detail.path；无目标不伪造", () => {
  const missing = activityFromEvent({
    kind: "denied",
    summary: "文件不存在",
    detail: { toolName: "read_file", path: "missing.md", status: "failed", ok: false },
  });
  assert.equal(missing?.target, "missing.md");
  assert.equal(missing?.exceptional, true);
  const unknown = activityFromEvent({
    kind: "denied",
    summary: "未执行：命令被拒绝",
    detail: { toolName: "run_shell" },
  });
  assert.equal(unknown?.target, "");
});
