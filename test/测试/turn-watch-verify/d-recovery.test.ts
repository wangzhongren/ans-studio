// test/测试/turn-watch-verify/d-recovery.test.ts
// 测试角色：卡死恢复链路（propose_recovery + 客户确认）独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §5.3/§5.4：到点检查只提示；没卡死不动作；卡死才走 propose_recovery；
// 提议必须客户确认，未确认/取消＝未执行（零自动执行）；工具回执如实。
//
// 独立构造：桩 proposeRecovery 能力（记录调用/返回值）；不真等待、不跑真实命令。

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import type { ProposeRecoveryPayload, RecoveryReceipt, WriteGate } from "../../../src/model/runtime.ts";
import { busyRole, makeWatchdogRig, roleView, snapshot, SU } from "./fixture.ts";

const INSPECT = 300_000;
const allowWrite: WriteGate = () => ({
  allowed: true,
  matchedEntry: { root: "project", path: "unused", kind: "file", purpose: "独立验证夹具" },
});

test("D1 卡死才提议：到点检查消息不自动执行任何恢复；propose_recovery 需客户确认", async () => {
  const rig = makeWatchdogRig();
  const t0 = rig.now();
  rig.setSnapshot(snapshot({ roles: [busyRole("X", t0, "stuck-turn"), roleView(SU)] }));

  const calls: { payload: ProposeRecoveryPayload; confirmed: boolean }[] = [];
  let confirmed = false;
  const proposeRecovery = async (payload: ProposeRecoveryPayload): Promise<RecoveryReceipt> => {
    calls.push({ payload, confirmed });
    return confirmed
      ? { outcome: "executed", operatorId: "客户", message: "已停止本轮" }
      : { outcome: "declined", message: "客户取消" };
  };
  const tools = new Map(
    buildGovernedTools(allowWrite, { proposeRecovery, currentTurnId: () => "su-turn-1" }).map((t) => [t.name, t]),
  );
  const tool = tools.get("propose_recovery");
  assert.ok(tool, "注入能力后才注册 propose_recovery");

  // 到点检查：只投一条消息，不调用 proposeRecovery（watchdog 无恢复执行钩子）。
  rig.advance(INSPECT);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1);
  assert.ok(rig.deliveries[0].text.includes("propose_recovery"), "消息指向 propose_recovery");
  assert.ok(rig.deliveries[0].text.includes("客户确认后应用执行"));
  assert.equal(calls.length, 0, "到点检查本身不得执行恢复");

  // 客户未确认（取消）⇒ 工具如实「未获执行」，零执行。
  const declined = await tool!.handler({
    name: "propose_recovery",
    args: { roleId: "X", action: "abort-turn", evidence: "role_status：busy=true 且无活动 30 分钟" },
  });
  assert.equal(declined.ok, false);
  assert.match(declined.message ?? "", /未获执行|客户未确认/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].confirmed, false);

  // 客户确认 ⇒ executed；回执如实「已执行」。
  confirmed = true;
  const accepted = await tool!.handler({
    name: "propose_recovery",
    args: { roleId: "X", action: "abort-turn", evidence: "role_status：busy=true 且无活动 30 分钟" },
  });
  assert.equal(accepted.ok, true);
  assert.match(accepted.message ?? "", /客户已确认.*已执行/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].confirmed, true);
  assert.equal(calls[1].payload.action, "abort-turn");
  assert.equal(calls[1].payload.roleId, "X");
});

test("D2 非法动作为拒绝且不触达能力；无证据不提议", async () => {
  let calls = 0;
  const tools = new Map(
    buildGovernedTools(allowWrite, {
      proposeRecovery: async () => {
        calls += 1;
        return { outcome: "declined" };
      },
    }).map((t) => [t.name, t]),
  );
  const tool = tools.get("propose_recovery")!;
  const bad = await tool.handler({ name: "propose_recovery", args: { roleId: "X", action: "rm-rf", evidence: "x" } });
  assert.equal(bad.ok, false);
  assert.equal(calls, 0, "非法动作不得触达能力");
  const noEvidence = await tool.handler({ name: "propose_recovery", args: { roleId: "X", action: "abort-turn" } });
  assert.equal(noEvidence.ok, false);
  assert.equal(calls, 0, "无证据不得提议");
});
