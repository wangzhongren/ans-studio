// test/桌面应用/shell-approval.test.ts
// C 批（2026-10-28）：shell 审批保留——恰 allow:true 放行、其余拒绝；未知/失效 id 终态 expired；
// 关窗 rejectAllPending fail-closed；presenter 抛错不静默放行。
import test from "node:test";
import assert from "node:assert/strict";

import { createShellConfirmPresenter, describeShellCommand, type ShellConfirmRequest } from "../../app/desktop/operator-channel.ts";
import type { OperatorPrompt } from "../../app/desktop/operator-channel.ts";

const prompt: OperatorPrompt = { command: "echo hi", argv: ["echo", "hi"], cwd: "/p", toolCallId: "call-1" };

function presenter(cleanupAfterMs = 10000) {
  const pushed: ShellConfirmRequest[] = [];
  const p = createShellConfirmPresenter({ present: (request) => pushed.push(request), cleanupAfterMs });
  return { p, pushed };
}

test("shell 审批：allow:true 才放行；false/缺字段拒绝；未知 id expired", async () => {
  const { p, pushed } = presenter();
  const controller = new AbortController();
  const pending = p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", signal: controller.signal });
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0]!.command, "echo hi");
  const id = pushed[0]!.id;
  assert.deepEqual(p.respond({ id: "nope", allow: true }), { ok: false, expired: true, error: "此确认已失效（超时或应用重启），未获放行——请让角色重新发起。" });
  assert.equal(p.respond({ id, allow: true }).ok, true);
  assert.deepEqual(await pending, { allow: true });

  const pending2 = p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", signal: new AbortController().signal });
  const id2 = pushed[1]!.id;
  assert.equal(p.respond({ id: id2 }).ok, true);
  assert.deepEqual(await pending2, { allow: false }, "缺 allow:true 一律拒绝");
});

test("shell 审批：rejectAllPending 全部拒绝；presenter 抛错抛给通道（不静默放行）", async () => {
  const { p, pushed } = presenter();
  const pending = p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", signal: new AbortController().signal });
  p.rejectAllPending("window closed");
  assert.deepEqual(await pending, { allow: false });
  assert.equal(p.pendingCount(), 0);

  const failing = createShellConfirmPresenter({ present: () => { throw new Error("window gone"); }, cleanupAfterMs: 10000 });
  await assert.rejects(
    failing.presenter.present(prompt, describeShellCommand(prompt), { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", signal: new AbortController().signal }),
    /window gone/,
  );
  assert.equal(pushed.length, 1); // 只用于确认第一个 presenter 有卡
});
