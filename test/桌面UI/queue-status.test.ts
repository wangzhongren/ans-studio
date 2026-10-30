// test/桌面UI/queue-status.test.ts
// P0（2026-10-30 团队计划 §3.6 / 附录 B）：队列可见性 UI 纯逻辑——
//  - `ageMs` 进入队列视图（「已等待 N 分钟」）；`headKind/blockedReason/activeTurnId` → 「为什么没动」一行；
//  - 接线条：主进程 role-state → chat-store → QueuePanel 的字段端到端存在（源码钉，沿用本仓库既有惯例）；
//  - 文案只用人话，不出现技术细节；空/旧快照（无 ageMs）不报错、不虚构等待时长。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  queueAgeText,
  queueBlockedView,
  queueGroups,
  queueKindLabel,
} from "../../app/renderer/src/chat/work-view.ts";
import { queueItemViews } from "../../app/renderer/src/chat/confirm-logic.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "app");
const SESSION = fs.readFileSync(path.join(APP, "desktop", "session.ts"), "utf8");
const MAIN = fs.readFileSync(path.join(APP, "main.ts"), "utf8");
const STORE = fs.readFileSync(path.join(APP, "renderer", "src", "chat", "chat-store.ts"), "utf8");
const PANEL = fs.readFileSync(path.join(APP, "renderer", "src", "shell", "QueuePanel.tsx"), "utf8");

const ITEM = {
  kind: "handback",
  sourceRoleId: "A",
  summary: "完成 T1",
  at: "2026-10-30T10:00:00.000Z",
  id: "hb-key-1",
  full: "完成 T1（全文）",
};

test("ageMs：快照数值进入队列视图；缺失/非法旧快照按 0（不虚构等待）", () => {
  const views = queueItemViews(
    [
      { ...ITEM, ageMs: 90_000 },
      { ...ITEM, id: "hb-key-2", ageMs: -5 },
      { ...ITEM, id: "hb-key-3" },
      { ...ITEM, id: "hb-key-4", ageMs: Number.NaN },
    ],
    null,
  );
  assert.deepEqual(views.map((view) => view.ageMs), [90_000, 0, 0, 0]);
  assert.equal(views[0].kind, "handback");
  assert.equal(views[0].id, "hb-key-1", "撤回/展开定位键不丢");
});

test("ageText：≥1 分钟才显示人话等待（zh/en 一致语义）", () => {
  assert.equal(queueAgeText(0), "");
  assert.equal(queueAgeText(59_999), "", "不足 1 分钟不显示（时钟行已给出时间）");
  assert.equal(queueAgeText(60_000), "已等待 1 分钟");
  assert.equal(queueAgeText(90_000), "已等待 1 分钟");
  assert.equal(queueAgeText(9 * 60_000), "已等待 9 分钟");
  assert.equal(queueAgeText(90_000, "en-US"), "waiting 1 min");
  assert.equal(queueAgeText(null), "");
});

test("blockedView：「为什么没动」＝队首类别 + 阻塞原因（target-busy / origin-missing / session-closed / network）", () => {
  const busy = queueBlockedView({ headKind: "handback", blockedReason: "target-busy", activeTurnId: "turn-1" });
  assert.ok(busy);
  assert.equal(busy.blockedReason, "target-busy");
  assert.equal(busy.headKind, "handback");
  assert.equal(busy.activeTurnId, "turn-1", "当前回合 id 暴露给界面（诊断位）");
  assert.ok(busy.text.includes("队首：交付"), `队首类别应为「交付」：${busy.text}`);
  assert.ok(busy.text.includes("目标角色正在执行上一轮"), busy.text);
  assert.ok(!/turn-1|ECONN|stack/i.test(busy.text), "人话行不泄露技术细节");

  const missing = queueBlockedView({ headKind: "handback", blockedReason: "origin-missing", activeTurnId: "turn-x" });
  assert.ok(missing);
  assert.ok(missing.text.includes("收尾异常") && missing.text.includes("停止本轮"), missing.text);
  assert.ok(missing.text.includes("队首：交付"));

  const closed = queueBlockedView({ headKind: "system", blockedReason: "session-closed", activeTurnId: null });
  assert.ok(closed);
  assert.ok(closed.text.includes("队首：系统") && closed.text.includes("尚未开启"), closed.text);

  const offline = queueBlockedView({ headKind: "dispatch", blockedReason: "network", activeTurnId: null });
  assert.ok(offline);
  assert.ok(offline.text.includes("网络不可用"), offline.text);

  assert.equal(queueBlockedView(null), null);
  assert.equal(queueBlockedView({ headKind: null, blockedReason: null, activeTurnId: null }), null);
  assert.equal(queueKindLabel("dispatch"), "派发");
  assert.equal(queueKindLabel("handback", "en-US"), "Delivery");
});

test("queueGroups：运行中/排队分组仍单一来源，ageMs 随条目透出", () => {
  const groups = queueGroups(
    [
      { ...ITEM, ageMs: 30_000 },
      { ...ITEM, id: "hb-key-2", ageMs: 120_000 },
    ],
    { ...ITEM, id: "run-1", ageMs: 5_000 },
  );
  assert.equal(groups.total, 3);
  assert.equal(groups.running.length, 1);
  assert.equal(groups.running[0].ageMs, 5_000);
  assert.deepEqual(groups.queued.map((view) => view.ageMs), [30_000, 120_000]);
});

test("接线钉子：session 快照 → main 透传 → chat-store → QueuePanel 字段端到端", () => {
  assert.ok(SESSION.includes("headKind") && SESSION.includes("blockedReason") && SESSION.includes("activeTurnId"), "session.ts 应外推队列可见字段");
  assert.ok(SESSION.includes('"watchdog.notice.bypass"'), "看护旁路诊断应存在");
  assert.ok(MAIN.includes("blockedReason") && MAIN.includes("activeTurnId"), "main.ts 的 role-state 去抖类型应透传新字段");
  assert.ok(STORE.includes("queueMetaByRole") && STORE.includes("record.blockedReason") && STORE.includes("record.activeTurnId"), "chat-store 应消费新字段");
  assert.ok(PANEL.includes("queueBlockedView") && PANEL.includes("data-blocked-reason"), "QueuePanel 应呈现阻塞原因");
  assert.ok(PANEL.includes("queueAgeText") && PANEL.includes("data-age-ms"), "QueuePanel 应呈现等待时长");
});
