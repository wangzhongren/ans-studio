// test/桌面UI/dialog-history.test.ts
// E 批：待办/历史独立面板（非聊天流）与 judge 代批记录。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const PANEL = readFileSync(new URL("../../app/renderer/src/chat/DecisionCenterPanel.tsx", import.meta.url), "utf8");
const STORE = readFileSync(new URL("../../app/renderer/src/stores/decision-center-store.ts", import.meta.url), "utf8");

test("独立面板：待办/历史/搜索/筛选/打开处理入口", () => {
  assert.match(PANEL, /id="decision-center-pending"/);
  assert.match(PANEL, /id="decision-center-history"/);
  assert.match(PANEL, /className="dc-search"/);
  assert.match(PANEL, /className="dc-filter"/);
  assert.match(PANEL, /className="dc-open"/);
  assert.match(PANEL, /ui\.decisionDialog\.todo/);
  assert.match(PANEL, /ui\.decisionDialog\.history/);
});

test("judge 代批历史：状态/结果/来源记录，且历史不写聊天流卡", () => {
  assert.match(STORE, /status: "judge"/);
  assert.match(STORE, /recordJudge/);
  assert.match(STORE, /history\.unshift/);
  assert.equal(STORE.includes("op-request"), false);
});
