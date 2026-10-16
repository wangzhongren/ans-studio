// test/测试/g2-verify/w4-w5-recovery.test.ts —— G-2 独立复验「W4 恢复执行桥 + W5 恢复确认卡」对抗域
// （真 SessionManager＋真 createRecoveryConfirmPresenter＋假句柄/注入时钟）。
//
// 覆盖（独立构造）：
//   · propose → 卡 → **恰 allow:true 才执行**（abort-turn 恰一次）；卡面字段逐字段；幂等 by id；
//   · 取消 / allow 非布尔 / 关窗 rejectAllPending ⇒ declined 如实（绝不呈已执行）；
//   · 通道未接线 ⇒ declined；非法载荷（坏动作/缺证据/缺角色/不在项目/目标是 su）⇒ 零推卡零执行；
//   · unsupported（运行时不支持）与 error（在跑不打断）如实；rebuild 空闲 ⇒ executed（旧句柄 dispose＋新一代）；
//   · redeliver：itemId 不存在如实；目标忙 ⇒ 如实「仍在队列」不谎报已投出；
//   · 回执双路：工具返回值四值 + 经投递机投回 su（[系统·恢复]）+ UI 系统行。

import test from "node:test";
import assert from "node:assert/strict";

import { makeG2Harness, flush, settledEvent, receiptOf } from "./fixture.ts";
import { createRecoveryConfirmPresenter, type RecoveryConfirmRequest } from "../../../app/desktop/recovery-channel.ts";
import type { ProposeRecoveryPayload, RecoveryReceipt } from "../../../src/model/runtime.ts";
import { WATCHDOG_RECOVERY_PREFIX } from "../../../src/common/编排/watchdog.ts";

interface Rig {
  h: Awaited<ReturnType<typeof makeG2Harness>>;
  cards: RecoveryConfirmRequest[];
  presenter: ReturnType<typeof createRecoveryConfirmPresenter>;
  propose(payload: ProposeRecoveryPayload): Promise<RecoveryReceipt>;
  cleanup(): Promise<void>;
}

async function makeRig(withChannel = true): Promise<Rig> {
  const cards: RecoveryConfirmRequest[] = [];
  let presenterRef: ReturnType<typeof createRecoveryConfirmPresenter> | undefined;
  if (withChannel) {
    presenterRef = createRecoveryConfirmPresenter({
      present: (req) => {
        cards.push(req);
      },
      operatorId: "verify-op",
    });
  }
  const h = await makeG2Harness({ ...(presenterRef ? { recoveryConfirm: presenterRef } : {}) });
  await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
  await flush(40);
  const suInput = h.openedInputs.find((i) => i.roleId === "su")!;
  return {
    h,
    cards,
    presenter: presenterRef as ReturnType<typeof createRecoveryConfirmPresenter>,
    propose: async (payload) => receiptOf(await suInput.proposeRecovery!(payload)),
    cleanup: async () => {
      presenterRef?.rejectAllPending("复验夹具收尾");
      await h.mgr.stop(null).catch(() => undefined);
      h.cleanup();
    },
  };
}

test("W5：propose→卡（字段逐字段）→恰 allow:true 执行 abort-turn 恰一次；回执三路如实；幂等 by id", async () => {
  const rig = await makeRig();
  const { h, cards, presenter } = rig;
  try {
    const p = rig.propose({ roleId: "X", action: "abort-turn", evidence: "证据正文（逐字，含引号「」与换行\n第二行）" });
    await flush(30);
    assert.equal(cards.length, 1, "恰推一张卡");
    const card = cards[0];
    assert.ok(card.id.startsWith("rp-"), `id 前缀 rp-（卡族标识）：${card.id}`);
    assert.equal(card.roleId, "X", "目标角色=被恢复角色（非提议者）");
    assert.equal(card.action, "abort-turn");
    assert.equal(card.evidence, "证据正文（逐字，含引号「」与换行\n第二行）", "证据逐字（不加工、不截断）");
    assert.equal(card.requestedBy, "su", "提议者=su");
    assert.equal(card.projectRoot, h.root, "随带 projectRoot（渲染视图身份过滤）");
    assert.equal(card.runtime, "demo", "随带 runtime");
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(card.requestedAt ?? ""), "提议时刻 ISO");
    assert.equal(h.ctl("X").abortCalls, 0, "未作答：零执行");
    const res = presenter.respond({ id: card.id, allow: true });
    assert.equal(res.ok, true);
    const receipt = await p;
    assert.equal(receipt.outcome, "executed", "恰 allow:true ⇒ executed");
    assert.equal(receipt.operatorId, "verify-op", "确认者标识");
    assert.equal(h.ctl("X").abortCalls, 1, "abort 恰一次");
    // 幂等：同 id 再回包 ⇒ expired，不再执行
    const again = presenter.respond({ id: card.id, allow: true });
    assert.equal(again.ok, false);
    assert.equal(again.expired, true, "旧 id 失效（恰执行一次）");
    await flush(120);
    assert.equal(h.ctl("X").abortCalls, 1, "重复回包不再执行");
    // 回执三路：① 工具返回值（上方）② UI 系统行 ③ 经投递机投回 su
    const note = h.envelopes.find((e) => e.event.kind === "message" && /恢复回执（停止本轮 · 角色 X）/.test(e.event.summary));
    assert.ok(note, "② UI 系统行如实（含动作人话与目标）");
    const delivered = h.ctl("su").sent.filter((t) => t.startsWith(WATCHDOG_RECOVERY_PREFIX));
    assert.equal(delivered.length, 1, "③ 回执经投递机投回 su（恰一条）");
    assert.ok(delivered[0].includes("结果：已执行"), `executed 如实：${delivered[0].slice(0, 60)}`);
    assert.ok(delivered[0].includes("operator:verify-op"), "含确认者");
  } finally {
    await rig.cleanup();
  }
});

test("W5：取消 / allow 非布尔 / 关窗 ⇒ declined 如实——未执行、绝不呈已执行", async () => {
  const rig = await makeRig();
  const { h, cards, presenter } = rig;
  try {
    // 取消（allow:false）
    const p1 = rig.propose({ roleId: "X", action: "abort-turn", evidence: "e1" });
    await flush(20);
    presenter.respond({ id: cards[0].id, allow: false });
    const r1 = await p1;
    assert.equal(r1.outcome, "declined", "取消 ⇒ declined");
    assert.ok(!/已执行/.test(r1.message ?? "") || /没有执行|未执行|未获执行/.test(r1.message ?? ""), `文案不假装已执行：${r1.message}`);
    // allow 非布尔（"true" 字符串）⇒ 判据只认 === true ⇒ declined
    const p2 = rig.propose({ roleId: "X", action: "abort-turn", evidence: "e2" });
    await flush(20);
    assert.notEqual(cards.at(-1)!.id, cards[0].id, "第二张新卡（新 id）");
    presenter.respond({ id: cards.at(-1)!.id, allow: "true" });
    const r2 = await p2;
    assert.equal(r2.outcome, "declined", "非布尔 true 字符串 ⇒ declined（恰 allow:true 判据）");
    // 关窗 rejectAllPending
    const p3 = rig.propose({ roleId: "X", action: "abort-turn", evidence: "e3" });
    await flush(20);
    presenter.rejectAllPending("窗口已关闭，未获执行（fail-closed）");
    const r3 = await p3;
    assert.equal(r3.outcome, "declined", "关窗 ⇒ declined（fail-closed）");
    await flush(120);
    assert.equal(h.ctl("X").abortCalls, 0, "三次机会全部未执行（零执行）");
    const delivered = h.ctl("su").sent.filter((t) => t.startsWith(WATCHDOG_RECOVERY_PREFIX));
    for (const d of delivered) assert.ok(!d.includes("结果：已执行"), `declined 回执绝不呈已执行：${d.slice(0, 60)}`);
    assert.ok(delivered.some((d) => d.includes("未执行（未获客户确认/已取消）")), "declined 如实标签");
  } finally {
    await rig.cleanup();
  }
});

test("W5：通道未接线 ⇒ declined（零执行）；非法载荷 ⇒ error 且零推卡", async () => {
  const noChannel = await makeRig(false);
  try {
    const r = await noChannel.propose({ roleId: "X", action: "abort-turn", evidence: "e" });
    assert.equal(r.outcome, "declined", "通道未接线 ⇒ declined");
    assert.ok(/未接线|未获执行/.test(r.message ?? ""), `如实：${r.message}`);
    assert.equal(noChannel.h.ctl("X").abortCalls, 0, "零执行");
  } finally {
    await noChannel.cleanup();
  }

  const rig = await makeRig();
  try {
    const cases: [string, ProposeRecoveryPayload][] = [
      ["坏动作", { roleId: "X", action: "disable-role" as never, evidence: "e" }],
      ["缺证据", { roleId: "X", action: "abort-turn", evidence: "   " }],
      ["缺角色", { roleId: "", action: "abort-turn", evidence: "e" }],
      ["不在项目", { roleId: "不存在角色", action: "abort-turn", evidence: "e" }],
      ["目标是 su（内置治理）", { roleId: "su", action: "abort-turn", evidence: "e" }],
    ];
    for (const [name, payload] of cases) {
      const before = rig.cards.length;
      const r = await rig.propose(payload);
      assert.equal(r.outcome, "error", `${name} ⇒ error（如实拒绝）`);
      assert.equal(rig.cards.length, before, `${name} ⇒ 零推卡`);
    }
    assert.equal(rig.h.ctl("X").abortCalls, 0, "零执行");
  } finally {
    await rig.cleanup();
  }
});

test("W5：unsupported（句柄不带 abort）与 error（rebuild 在跑拒绝）如实；rebuild 空闲 ⇒ executed（旧句柄 dispose＋新一代）", async () => {
  const rig = await makeRig();
  const { h, cards, presenter } = rig;
  try {
    // —— unsupported：把 X 的句柄做成「运行时不支持停止」（先置旗标再重开一代会话）——
    await h.mgr.stop({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    h.ctl("X").abortSupported = false;
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    const pU = rig.propose({ roleId: "X", action: "abort-turn", evidence: "e" });
    await flush(20);
    presenter.respond({ id: cards.at(-1)!.id, allow: true });
    const rU = await pU;
    assert.equal(rU.outcome, "unsupported", "运行时不支持 ⇒ unsupported（绝不假装已执行）");
    // —— error：rebuild 遇在跑轮次 ——
    await h.mgr.send("占住 X 的轮次", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    const pE = rig.propose({ roleId: "X", action: "rebuild-session", evidence: "e" });
    await flush(20);
    const oldX = h.ctl("X");
    presenter.respond({ id: cards.at(-1)!.id, allow: true });
    const rE = await pE;
    assert.equal(rE.outcome, "error", "在跑轮次 ⇒ error（在跑不打断）");
    assert.ok(/在跑|不打断/.test(rE.message ?? ""), `如实原因：${rE.message}`);
    assert.equal(oldX.disposeCount, 0, "未 dispose（没打断）");
    // —— executed：X 空闲后 rebuild 真执行 ——
    oldX.streams.push(settledEvent("completed"));
    await flush(60);
    const pR = rig.propose({ roleId: "X", action: "rebuild-session", evidence: "e" });
    await flush(20);
    presenter.respond({ id: cards.at(-1)!.id, allow: true });
    const rR = await pR;
    assert.equal(rR.outcome, "executed", "空闲重建 ⇒ executed");
    assert.equal(oldX.disposeCount, 1, "旧句柄 dispose 恰一次");
    assert.ok(oldX.stopped, "旧一代事件流已收口");
    assert.notEqual(h.ctl("X"), oldX, "新一代句柄（重开）");
    assert.equal(h.openedInputs.filter((i) => i.roleId === "X").length, 3, "X 会话共开 3 代（初开＋unsupported 重开＋重建）");
    // 回执投递如实（unsupported/error/executed 三态各自落在 su 流）——su 每条回执各起一轮，逐轮 settle 放行
    for (let i = 0; i < 3; i += 1) {
      h.ctl("su").streams.push(settledEvent("completed"));
      await flush(150);
    }
    const delivered = h.ctl("su").sent.filter((t) => t.startsWith(WATCHDOG_RECOVERY_PREFIX));
    assert.ok(delivered.some((d) => d.includes("未执行（当前运行时不支持）")), "unsupported 如实");
    assert.ok(delivered.some((d) => d.includes("未执行（执行失败）")), "error 如实");
    assert.ok(delivered.some((d) => d.includes("结果：已执行")), "executed 如实");
  } finally {
    await rig.cleanup();
  }
});

test("W4/W5：redeliver——itemId 不存在如实报错；目标忙 ⇒ 如实「仍在队列」不谎报已投出", async () => {
  const rig = await makeRig();
  const { h, cards, presenter } = rig;
  try {
    // 让 X 忙，再排入一条客户消息（拿到队列条目 id）
    await h.mgr.send("占住", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    const queued = await h.mgr.send("排队消息", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    assert.equal(queued.queued, true);
    const item = h.roleStates.filter((s) => s.roleId === "X").at(-1)!.queue[0];

    // itemId 不存在 ⇒ error（如实，不触发）
    const p1 = rig.propose({ roleId: "X", action: "redeliver", evidence: "e", itemId: "不存在-id" });
    await flush(20);
    presenter.respond({ id: cards.at(-1)!.id, allow: true });
    const r1 = await p1;
    assert.equal(r1.outcome, "error", "itemId 不存在 ⇒ error");
    assert.ok(/不在排队中/.test(r1.message ?? ""), `如实：${r1.message}`);

    // itemId 存在但目标忙 ⇒ executed 但如实「仍在队列」（绝不写「已投出」）
    const p2 = rig.propose({ roleId: "X", action: "redeliver", evidence: "e", itemId: String(item.id) });
    await flush(20);
    presenter.respond({ id: cards.at(-1)!.id, allow: true });
    const r2 = await p2;
    assert.equal(r2.outcome, "executed", "触发重试受理 ⇒ executed");
    assert.ok(/仍在队列/.test(r2.message ?? ""), `如实状态：${r2.message}`);
    assert.ok(!/已投出/.test(r2.message ?? ""), "不谎报已投出");
    assert.ok(!h.ctl("X").sent.includes("排队消息"), "排队消息确实未被投出（忙碌中）");

    // 清空：settle 后消息放行（既有语义）
    h.ctl("X").streams.push(settledEvent("completed"));
    await flush(120);
    assert.ok(h.ctl("X").sent.includes("排队消息"), "settle 后按既有语义送达");
  } finally {
    await rig.cleanup();
  }
});

test("W5 只读保证：propose 全过程不写项目文件、不动队列语义（看护永不改判定）", async () => {
  const rig = await makeRig();
  const { h, cards, presenter } = rig;
  try {
    const fs = await import("node:fs");
    const before = fs.readdirSync(h.root, { recursive: true } as never).map(String).sort();
    const p = rig.propose({ roleId: "X", action: "abort-turn", evidence: "e" });
    await flush(20);
    presenter.respond({ id: cards.at(-1)!.id, allow: false }); // declined 路径
    await p;
    await flush(60);
    const after = fs.readdirSync(h.root, { recursive: true } as never).map(String).sort();
    assert.deepEqual(after, before, "propose 全程不写项目文件（恢复动作本身除外——本例 declined）");
  } finally {
    await rig.cleanup();
  }
});
