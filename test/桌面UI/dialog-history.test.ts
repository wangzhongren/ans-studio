// test/桌面UI/dialog-history.test.ts
// E 批：待办/历史独立面板（非聊天流）与 judge 代批记录。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const PANEL = readFileSync(new URL("../../app/renderer/src/chat/DecisionCenterPanel.tsx", import.meta.url), "utf8");
const STORE = readFileSync(new URL("../../app/renderer/src/stores/decision-center-store.ts", import.meta.url), "utf8");
const PANEL_CSS = readFileSync(new URL("../../app/renderer/src/shell/phase4a.css", import.meta.url), "utf8");
const COMPOSER_CSS = readFileSync(new URL("../../app/renderer/src/shell/shell.css", import.meta.url), "utf8");
const PHASE4B_CSS = readFileSync(new URL("../../app/renderer/src/shell/phase4b.css", import.meta.url), "utf8");

test("judge 列表优先显示原始申请标题，并带来源/时间/裁决结果", () => {
  assert.match(PANEL, /requestTitle/);
  assert.match(PANEL, /requestTitle !== "" \? requestTitle : headline/);
  assert.match(PANEL, /className="dc-time"/);
  assert.match(PANEL, /className="dc-result"/);
});

test("dc-filter 使用应用下拉组件与设计令牌，不再用原生 select", () => {
  assert.equal(PANEL.includes("<select"), false);
  assert.match(PANEL, /DropdownMenuTrigger className="dc-filter"/);
  assert.match(PANEL_CSS, /\.dc-filter \{/);
  assert.match(PANEL_CSS, /\.dc-filter:focus-visible/);
  assert.match(PANEL_CSS, /\.dc-filter-menu \{/);
  assert.match(PANEL_CSS, /background: var\(--popover\)/);
});

test("composer 按容器宽度收窄：换行 + 短标签，不依赖窗口 480 断点", () => {
  assert.match(COMPOSER_CSS, /container-type: inline-size/);
  assert.match(COMPOSER_CSS, /\.composer-controls \{[^}]*flex-wrap: wrap/s);
  assert.match(PHASE4B_CSS, /@container composer \(max-width: 720px\)/);
  assert.match(PHASE4B_CSS, /composer-label-short/);
});

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
