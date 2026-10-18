// test/测试/g2-verify/w2-system-delivery.test.ts —— G-2 独立复验「W2 system 第四类投递」＋ W1/W3 集成域
// （真实 SessionManager＋假句柄＋真看护服务＋注入时钟；不触网）。
//
// 覆盖（独立构造）：
//   · system 经同一投递机真投递 su：忙时入队→settled 后按既有语义送达（正文逐字）；
//   · 队列快照：kind=system、来源标注恒空、id=去重键（看护命名空间）；
//   · **不可撤回**：withdraw 对 system 如实拒绝且条目不丢（kind !== "message" 判据）；
//   · 投递失败：如实系统行「系统消息投递失败…未丢弃」＋放回队首重试送达；
//   · W1 集成：busySince 快照 / lastTurn（role_status 文本）/ 命令超时观察（display.process 结构化事实）；
//   · fromSystemDelivery 标记：system 投递持有的轮次 settle ⇒ 观察带 fromSystemDelivery=true 且不算活动；
//   · W3 集成：静默满 N ⇒ su 真收到收束提示恰一条；su 回复（system 持有）不重武装；真实活动重武装后再投。

import test from "node:test";
import assert from "node:assert/strict";

import { makeG2Harness, flush, settledEvent, commandTimedOutEvent, toolResultOf } from "./fixture.ts";
import { createWatchdogService, type WatchdogObservation } from "../../../app/desktop/watchdog.ts";
import { WATCHDOG_CLOSURE_PREFIX } from "../../../src/common/编排/watchdog.ts";

const KEY = (root: string, label: string): string => `watchdog\u0000${root}\u0000${label}`;

test("W2：system 投递——su 忙时入队（快照 kind=system/来源空/看护键）；不可撤回且不丢；settled 后按既有语义逐字送达", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    await h.mgr.send("占位（让 su 忙）", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    assert.equal(h.ctl("su").sent.length, 1, "占位消息已直发（su 忙）");

    const text = `[系统·看护] 复验告警：角色「X」。\n事实：夹具；纪律：仅告知。`;
    const dedupKey = KEY(h.root, "alert-t");
    h.mgr.watchdogDeliver(h.root, { text, summary: "系统·看护 · 复验告警 · 角色 X", dedupKey });
    await flush(60);

    // 忙 ⇒ 入队：快照 queue[0] kind=system、来源空、id=去重键；未投出
    const snap = h.roleStates.filter((s) => s.roleId === "su").at(-1)!;
    assert.equal(h.ctl("su").sent.length, 1, "su 忙：system 条目未被投出");
    assert.equal(snap.queue.length, 1, "system 条目在队列");
    assert.equal(snap.queue[0].kind, "system", "快照 kind=system（第四类透传）");
    assert.equal(snap.queue[0].sourceRoleId, "", "来源标注恒空（系统非角色）");
    assert.equal(snap.queue[0].id, dedupKey, "id=去重键（撤回定位键）");
    assert.ok(String(snap.queue[0].id).startsWith("watchdog\u0000"), "看护命名空间（与 handback/dispatch 键隔离）");

    // 不可撤回：withdraw 如实拒绝，条目不丢
    const w = h.mgr.withdraw({ projectRoot: h.root, roleId: "su", runtime: "demo" }, dedupKey);
    assert.equal(w.ok, false, "system 条目不可撤回");
    assert.ok(/不是客户消息|只读|不可撤回/.test(w.error ?? ""), `如实理由：${w.error}`);
    assert.equal((h.roleStates.filter((s) => s.roleId === "su").at(-1)!).queue.length, 1, "拒绝后条目仍在队列（不丢）");

    // settled ⇒ 放行，按既有投递语义真投递 su（正文逐字)
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(120);
    assert.deepEqual(h.ctl("su").sent, ["占位（让 su 忙）", text], "settled 后 system 正文逐字送达 su");
    assert.equal((h.roleStates.filter((s) => s.roleId === "su").at(-1)!).running?.kind, "system", "进行中条目 kind=system");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});

test("W2：system 投递失败 ⇒ 如实系统行「未丢弃」＋放回队首；下次时机重试送达", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    await h.mgr.send("占位", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    const text = `[系统·收束] 复验收束提示。`;
    h.mgr.watchdogDeliver(h.root, { text, summary: "系统·收束 · 复验", dedupKey: KEY(h.root, "closure-t") });
    await flush(60);
    h.ctl("su").failNextSends = 1; // 精确安排：settled 放行那一次 send 失败
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(150);
    assert.ok(!h.ctl("su").sent.includes(text), "失败：未送达");
    const note = h.envelopes.find((e) => e.event.kind === "message" && /系统消息投递失败/.test(e.event.summary));
    assert.ok(note, "如实系统行（不静默）");
    assert.ok(/未丢弃/.test(note!.event.summary) && /重试/.test(note!.event.summary), "说明「未丢弃＋待重试」");
    assert.equal((h.roleStates.filter((s) => s.roleId === "su").at(-1)!).queue.length, 1, "放回队首（快照恢复）");
    // 下一次时机（settled）重试成功
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(150);
    assert.ok(h.ctl("su").sent.includes(text), "重试送达");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});

test("W1 集成：busySince 同源快照；lastTurn 落表（role_status 文本）；命令超时观察＝display.process 结构化事实；fromSystemDelivery 标记", async () => {
  const h = await makeG2Harness();
  try {
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(40);

    // busySince：X 开跑后快照带 turnStartedAt=注入时钟值
    const t0 = h.clock.now();
    await h.mgr.send("干活", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
    await flush(30);
    const snap = h.mgr.watchdogSnapshot(h.root)!;
    const xView = snap.roles.find((r) => r.roleId === "X")!;
    assert.equal(xView.busy, true, "X 在跑");
    assert.equal(xView.turnStartedAt, t0, "busySince 定格＝注入时钟（同源快照，不造第二数据源）");

    // 命令超时观察（结构化 display.process；不解析文本）
    h.ctl("X").streams.push(commandTimedOutEvent());
    await flush(60);
    assert.ok(
      h.observations.some((o) => o.observation.kind === "command-timed-out" && o.observation.roleId === "X"),
      "命令超时经事件消费循环转发作看护观察",
    );

    // lastTurn：settled(timed_out) ⇒ role_status 文本含「最近一轮：timed_out」
    h.clock.advance(1000);
    h.ctl("X").streams.push(settledEvent("timed_out", "turn-t1"));
    await flush(60);
    assert.equal(h.mgr.lastTurnOf(h.root, "X", "demo")?.outcome, "timed_out", "lastTurn 小状态落表（四值终局）");
    const suInput = h.openedInputs.find((i) => i.roleId === "su")!;
    const statusText = toolResultOf(await suInput.roleStatus!({ roleId: "X" }));
    assert.equal(statusText.ok, true);
    assert.ok(statusText.text!.includes("最近一轮：timed_out"), `role_status 文本含最近一轮：${statusText.text}`);
    assert.ok(!h.observations.some((o) => o.observation.kind === "settled" && o.observation.fromSystemDelivery), "非 system 轮次 settle：fromSystemDelivery=false");

    // fromSystemDelivery：system 投递持有的轮次 settle ⇒ 标记 true，且不记真实活动
    h.mgr.watchdogDeliver(h.root, { text: "[系统·看护] t", summary: "s", dedupKey: KEY(h.root, "mark-1") });
    await flush(120); // su 空闲 ⇒ 自动开跑一轮（system 持有）
    assert.equal(h.ctl("su").sent.at(-1), "[系统·看护] t", "system 已投出（su 空闲路径）");
    const activityBefore = h.observations.filter((o) => o.observation.kind === "activity").length;
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(60);
    const sysSettled = h.observations.filter((o) => o.observation.kind === "settled" && o.observation.roleId === "su").at(-1)!;
    assert.equal((sysSettled.observation as { fromSystemDelivery: boolean }).fromSystemDelivery, true, "system 持有轮次标记 true");
    assert.equal(h.observations.filter((o) => o.observation.kind === "activity").length, activityBefore, "system 轮 settle 不记真实活动（防骚扰回路）");
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});

test("W3 已移除（2026-10-18）：静默满多个窗口也不投 [系统·收束]；活动/回复同样不产生收束项", async () => {
  const SILENCE = 60_000;
  let service: ReturnType<typeof createWatchdogService> | undefined;
  const h = await makeG2Harness({
    onObservation: (root, obs: WatchdogObservation) => service?.observe(root, obs),
  });
  try {
    service = createWatchdogService({
      projects: () => [h.root],
      snapshot: (root) => h.mgr.watchdogSnapshot(root),
      deliver: (root, message) => h.mgr.watchdogDeliver(root, message),
      now: () => h.clock.now(),
      config: { env: {} },
    });
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    // 一轮真实活动（客户消息）＋settle ⇒ 预热＋静默开始
    await h.mgr.send("先干点活", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(60);
    const closures = (): string[] => h.ctl("su").sent.filter((t) => t.startsWith(WATCHDOG_CLOSURE_PREFIX));

    // 连续跨过多个「旧静默阈值」：差 1ms、恰值、以及远超阈值——均不得投收束。
    for (const advanceMs of [SILENCE - 1, 1, SILENCE * 10]) {
      service.tick();
      h.clock.advance(advanceMs);
      service.tick();
      await flush(60);
      assert.equal(closures().length, 0, `静默 +${advanceMs}ms：不得投完成态收束`);
    }
    assert.equal(
      h.ctl("su").sent.some((text) => text.startsWith(WATCHDOG_CLOSURE_PREFIX)),
      false,
      "完成态收束已移除：真投递机零 [系统·收束]",
    );
    // 真实活动（新客户消息）仍正常，但同样不产生收束。
    await h.mgr.send("客户追问", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
    await flush(40);
    h.ctl("su").streams.push(settledEvent("completed"));
    await flush(60);
    service.tick();
    h.clock.advance(SILENCE * 2);
    service.tick();
    await flush(120);
    assert.equal(closures().length, 0, "活动后仍不投收束");
    const snapshot = h.mgr.watchdogSnapshot(h.root);
    const queuedSummaries = (snapshot?.queues ?? []).flatMap((queue) => queue.items.map((item) => item.summary));
    assert.equal(
      queuedSummaries.some((summary) => summary.startsWith(WATCHDOG_CLOSURE_PREFIX)),
      false,
      "投递队列不得出现收束项（验收通过即结束）",
    );
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});
