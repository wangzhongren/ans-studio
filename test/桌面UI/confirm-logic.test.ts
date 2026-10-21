// test/桌面UI/confirm-logic.test.ts
// Phase 3B 纯逻辑：确认卡状态机 / 失效收起 / 队列位次与撤回 / 附件类型呈现。

import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentTitle,
  clientImageProblem,
  expiryHitsCard,
  payloadMatchesView,
  queueItemViews,
  receiveCard,
  recoveryResponseOutcome,
  shellResponseOutcome,
  staleShellOnSettled,
  startResponding,
  withdrawExceptionOutcome,
  withdrawOutcome,
  IMAGE_MAX_BYTES,
} from "../../app/renderer/src/chat/confirm-logic.ts";

const view = { projectRoot: "/proj", runtime: "pi" };

test("卡片状态机：同 id 重推幂等、busy 防重复提交、新 id 新建", () => {
  const first = receiveCard(null, { id: "sc-1", command: "echo hi" });
  assert.equal(first?.id, "sc-1");
  assert.equal(first?.busy, false);
  const repeat = receiveCard(first, { id: "sc-1", command: "echo changed" });
  assert.equal(repeat?.payload.command, "echo changed");
  assert.equal(repeat?.busy, false);
  const busy = startResponding(repeat);
  assert.equal(busy?.busy, true);
  assert.equal(startResponding(busy)?.busy, true, "busy 中重复提交不改变状态");
  const next = receiveCard(busy, { id: "sc-2" });
  assert.equal(next?.id, "sc-2");
  assert.equal(next?.busy, false);
});

test("视图匹配：缺省身份按旧契约匹配；显式 project/runtime 必须精确相等", () => {
  assert.equal(payloadMatchesView({ id: "x" }, view), true);
  assert.equal(payloadMatchesView({ id: "x", projectRoot: "/other" }, view), false);
  assert.equal(payloadMatchesView({ id: "x", runtime: "claude" }, view), false);
  assert.equal(payloadMatchesView({ id: "x", projectRoot: "/proj", runtime: "pi" }, view), true);
});

test("shell 回包：ok ⇒ 收起无提示；expired/通道异常 ⇒ 收起并如实提示（不放行）", () => {
  assert.deepEqual(shellResponseOutcome({ ok: true }), {
    close: true,
    expired: false,
    hint: "",
  });
  const expired = shellResponseOutcome({ ok: false, expired: true });
  assert.equal(expired.close, true);
  assert.equal(expired.expired, true);
  assert.ok(expired.hint.includes("未获放行"));
  const broken = shellResponseOutcome(null);
  assert.equal(broken.close, true);
  assert.ok(broken.hint.includes("按 fail-closed 不放行"));
});

test("恢复卡回包：成功收起；失效/通道异常保留卡片并定格（不执行）", () => {
  assert.deepEqual(recoveryResponseOutcome({ ok: true }), {
    close: true,
    expired: false,
    hint: "",
  });
  const expired = recoveryResponseOutcome({ ok: false, expired: true });
  assert.equal(expired.close, false);
  assert.equal(expired.expired, true);
  assert.ok(expired.hint.includes("未获执行"));
  const broken = recoveryResponseOutcome(undefined);
  assert.equal(broken.close, false);
  assert.ok(broken.hint.includes("按 fail-closed 不执行"));
});

test("settled 只收起同角色/同 runtime/project 的 shell 卡", () => {
  const card = receiveCard(null, {
    id: "sc-1",
    roleId: "A",
    runtime: "pi",
    projectRoot: "/proj",
  });
  assert.equal(
    staleShellOnSettled(card, { roleId: "B", runtime: "pi", projectRoot: "/proj" }, view),
    false,
  );
  assert.equal(
    staleShellOnSettled(card, { roleId: "A", runtime: "claude", projectRoot: "/proj" }, view),
    false,
  );
  assert.equal(
    staleShellOnSettled(card, { roleId: "A", runtime: "pi", projectRoot: "/proj" }, view),
    true,
  );
  // 另角色/旧 id 失效回执不误收当前卡。
  assert.equal(expiryHitsCard(card, "sc-other"), false);
  assert.equal(expiryHitsCard(card, "sc-1"), true);
});

test("队列位次：running 在前显示进行中，排队 1..N；仅客户消息可撤回", () => {
  const views = queueItemViews(
    [
      { id: "dispatch", kind: "dispatch", summary: "派发任务", sourceRoleId: "B" },
      { id: "msg-1", kind: "message", summary: "客户消息" },
    ],
    { id: "running", kind: "message", summary: "正在处理当前请求" },
  );
  assert.equal(views.length, 3);
  assert.equal(views[0].position, "进行中");
  assert.equal(views[0].running, true);
  assert.equal(views[0].canWithdraw, false);
  assert.equal(views[1].position, "1");
  assert.equal(views[1].canWithdraw, false, "派发不可撤回");
  assert.equal(views[1].sourceLabel, "派发 · 来自 B");
  assert.equal(views[2].position, "2");
  assert.equal(views[2].canWithdraw, true);
  assert.equal(views[2].sourceLabel, "客户消息");
});

test("撤回回执：成功/无效/异常都如实一行，绝不假装撤掉", () => {
  assert.deepEqual(withdrawOutcome({ ok: true, summary: "客户长消息" }), {
    ok: true,
    text: "已撤回排队消息：客户长消息",
  });
  assert.deepEqual(withdrawOutcome({ ok: false, error: "已开始处理" }), {
    ok: false,
    text: "撤回无效：已开始处理",
  });
  assert.equal(withdrawOutcome({ ok: false }).text, "撤回无效：未知原因");
  assert.ok(withdrawExceptionOutcome(new Error("net down")).text.includes("net down"));
});

test("附件类型呈现：快速筛只挡不合规者；标题含名称与 KB", () => {
  assert.equal(clientImageProblem({ type: "image/png", size: 68 }), "");
  assert.ok(clientImageProblem({ type: "image/svg+xml", size: 68 }).includes("不支持"));
  assert.ok(
    clientImageProblem({ type: "image/png", size: IMAGE_MAX_BYTES + 1 }).includes("过大"),
  );
  assert.equal(attachmentTitle("fixture.png", 68), "fixture.png（1KB）");
  assert.equal(attachmentTitle("big.png", 2048), "big.png（2KB）");
});
