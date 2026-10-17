// test/测试/g2-verify/r1-desktop-datasource.test.ts —— G-2 独立复验「R1 桌面数据源（W1/W5）」域：
// role_status / session_tail 的桌面闭包——**纯读保证**（调用前后同源快照逐字段相等）＋文本结构＋失败如实。
//
// 独立构造：真 SessionManager＋假句柄；快照比较用独立序列化（不经实施方断言）。

import test from "node:test";
import assert from "node:assert/strict";

import { makeG2Harness, flush, settledEvent, toolResultOf } from "./fixture.ts";

/** 同源快照的可比较序列化（Map 显式展开；字段逐项——独立实现，不复用产品序列化）。 */
function freezeSnapshot(s: import("../../../app/desktop/watchdog.ts").WatchdogProjectSnapshot): unknown {
  return {
    projectRoot: s.projectRoot,
    // 2026-10-17（三权 V1）：快照字段 `suRoleId` → `governanceRoleId`（值=回交主人）。
    governanceRoleId: s.governanceRoleId,
    roles: [...s.roles].sort((a, b) => a.roleId.localeCompare(b.roleId)),
    queues: [...s.queues].map((q) => ({ targetRoleId: q.targetRoleId, runtime: q.runtime, items: [...q.items].map((i) => ({ ...i })) })),
    activeDeliveries: s.activeDeliveries,
    chainsActive: s.chainsActive,
    pendingConfirmationsTotal: s.pendingConfirmationsTotal,
    pendingConfirmationsByRole: [...s.pendingConfirmationsByRole.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

test("R1 纯读保证：role_status/session_tail 调用前后——同源快照逐字段相等、零外推、零投递、零事件", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(40);
    // 造点运行态：X 忙＋一条排队
    await h.mgr.send("占位", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    await h.mgr.send("排队项", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);

    const before = freezeSnapshot(h.mgr.watchdogSnapshot(h.root)!);
    const beforeStates = h.roleStates.length;
    const beforeEnvelopes = h.envelopes.length;
    const beforeSentX = h.ctl("X").sent.length;

    const suInput = h.openedInputs.find((i) => i.roleId === "su")!;
    const status = toolResultOf(await suInput.roleStatus!({ roleId: "X" }));
    const tail = toolResultOf(await suInput.sessionTail!({ roleId: "X", lines: 10 }));
    assert.equal(status.ok, true, "role_status 成功");
    assert.equal(tail.ok, false, "无会话历史 ⇒ 如实失败（不抛不猜）");
    await flush(30);

    const after = freezeSnapshot(h.mgr.watchdogSnapshot(h.root)!);
    assert.deepEqual(after, before, "同源快照逐字段相等（纯读——不改 busy/队列/在途/待确认）");
    assert.equal(h.roleStates.length, beforeStates, "零状态外推");
    assert.equal(h.envelopes.length, beforeEnvelopes, "零事件/系统行");
    assert.equal(h.ctl("X").sent.length, beforeSentX, "零投递（不触达投递机）");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});

test("R1 role_status 文本结构：项目/时间、su 行（busy/待确认/看护行）、角色行（忙闲/会话/队列/进行中）、队列明细含 id、最近一轮", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(40);
    await h.mgr.send("占位", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    await h.mgr.send("排队项甲", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);

    const suInput = h.openedInputs.find((i) => i.roleId === "su")!;
    const r = toolResultOf(await suInput.roleStatus!({}));
    assert.equal(r.ok, true);
    const text = r.text!;
    assert.ok(text.startsWith(`role_status（项目 ${h.root}，`), `头行含项目：${text.split("\n")[0]}`);
    assert.ok(text.includes("su：busy="), "su 行");
    assert.ok(text.includes("待确认卡"), "su 行含待确认数");
    assert.ok(text.includes("看护：未接线"), "未注入 watchdogStats ⇒ 如实「看护：未接线」（不编造）");
    assert.ok(/角色 X：busy=true ｜ 会话 已开（contextSource=/.test(text), `角色行（忙态/会话态如实）：${text}`);
    assert.ok(text.includes("队列 1"), "队列深度");
    assert.ok(text.includes("队列明细：- [message] 来自 X："), "队列明细含来源");
    assert.ok(text.includes("id=msg\u0000"), "队列明细含条目 id（撤回/重定位键）");

    // 看护统计注入后 ⇒ 看护行如实（activeAlerts/lastAlertAt/suppressedTotal）
    const h2 = await makeG2Harness({
      watchdogStats: () => ({ activeAlerts: 2, lastAlertAt: 1_700_000_000_000, suppressedTotal: 3, failuresByRole: new Map([["X", 1]]) }),
    });
    try {
      await h2.mgr.open({ projectRoot: h2.root, roleId: "su", runtime: "demo" });
      await flush(40);
      const su2 = h2.openedInputs.find((i) => i.roleId === "su")!;
      const r2 = toolResultOf(await su2.roleStatus!({ roleId: "X" }));
      assert.equal(r2.ok, true);
      assert.ok(r2.text!.includes("看护：活跃告警 2"), "看护行如实");
      assert.ok(r2.text!.includes("已抑制 3"), "抑制计数");
    } finally {
      await h2.mgr.stop(null).catch(() => undefined);
      h2.cleanup();
    }

    // 最近一轮行：X settle(timed_out) 后出现。2026-10-17 呈现消歧：busy=true 时写作「上一轮终局」
    // （明示不表示当前轮），非 busy 时仍为「最近一轮」——两者都如实，接受任一。
    h.ctl("X").streams.push(settledEvent("timed_out"));
    await flush(60);
    const r3 = toolResultOf(await suInput.roleStatus!({ roleId: "X" }));
    assert.ok(/(最近一轮|上一轮终局)：timed_out @/.test(r3.text!), `最近一轮如实：${r3.text}`);
    if (r3.text!.includes("上一轮终局：")) {
      assert.ok(r3.text!.includes("不表示当前轮"), "「上一轮终局」须明示不表示当前轮");
    }
    assert.ok(r3.text!.includes("近 15 分钟 failed/timed_out 计"), "窗口计数行");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});

test("R1 session_tail：无历史如实（来源/规范行/跳过 结构）；失败不抛；行数归一在工具层（此处复验实现防御）", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    const suInput = h.openedInputs.find((i) => i.roleId === "su")!;
    const r = toolResultOf(await suInput.sessionTail!({ roleId: "X", lines: 10 }));
    assert.equal(r.ok, false, "无会话历史 ⇒ ok:false");
    assert.ok(/无会话历史/.test(r.message ?? ""), `如实：${r.message}`);
    assert.ok(/来源 .*；规范行 \d+ 条，跳过 \d+ 行/.test(r.message ?? ""), `含来源/总行数/坏行数 结构：${r.message}`);
    const rEmpty = toolResultOf(await suInput.sessionTail!({ roleId: "" }));
    assert.equal(rEmpty.ok, false, "空 roleId ⇒ 拒绝");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});
