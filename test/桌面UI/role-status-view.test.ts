// test/桌面UI/role-status-view.test.ts
// 工作态视图（2026-10-25）：侧栏行/头像/chip 类名、多角色汇总、折叠态 aria、组件渲染。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chatWorkingChipView,
  RoleStatusChip,
  roleStatusChipView,
  workingRolesSummary,
} from "../../app/renderer/src/chat/role-status-view.ts";

const INDEX_CSS = readFileSync(
  new URL("../../app/renderer/src/index.css", import.meta.url),
  "utf8",
);
const SHELL_CSS = readFileSync(
  new URL("../../app/renderer/src/shell/shell.css", import.meta.url),
  "utf8",
);

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function colorToken(name: string): string {
  const match = new RegExp(name + ":\\s*(#[0-9a-fA-F]{6})").exec(INDEX_CSS);
  assert.ok(match, "missing token " + name);
  return match[1];
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4]
    .map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (
    (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  );
}

test("working：chip 绿色语义 + 行/头像强调类 + 小圆点 + 文案「工作中」", () => {
  const view = roleStatusChipView("working");
  assert.equal(view.working, true);
  assert.equal(view.highlighted, true);
  assert.equal(view.rowClass, "is-working");
  assert.equal(view.avatarClass, "is-working");
  assert.match(view.chipClass, /st-working/);
  assert.match(view.chipClass, /role-status-chip/);
  assert.match(view.chipClass, /is-working/);
  assert.equal(view.dot, true);
  assert.equal(view.label, "工作中");
  assert.ok(view.title.length > 0);
});

test("awaiting-confirm：行强调但不用「工作中」chip；error/idle 不强调", () => {
  const awaiting = roleStatusChipView("awaiting-confirm");
  assert.equal(awaiting.working, false);
  assert.equal(awaiting.awaiting, true);
  assert.equal(awaiting.highlighted, true);
  assert.equal(awaiting.rowClass, "is-awaiting");
  assert.equal(awaiting.avatarClass, "is-awaiting");
  assert.equal(awaiting.dot, false);
  assert.doesNotMatch(awaiting.chipClass, /role-status-chip/);
  assert.equal(awaiting.label, "等待你确认");

  const idle = roleStatusChipView("idle");
  assert.equal(idle.highlighted, false);
  assert.equal(idle.rowClass, "");
  assert.equal(idle.avatarClass, "");
  assert.equal(idle.dot, false);
  assert.equal(idle.chipClass, "ti-status st-idle");

  const error = roleStatusChipView("error");
  assert.equal(error.highlighted, false);
  assert.equal(error.chipClass, "ti-status st-error");
});

test("等待确认可沿用未决种类文案覆盖（待选择/等待你确认）", () => {
  assert.equal(
    roleStatusChipView("awaiting-confirm", undefined, "待选择").label,
    "待选择",
  );
});

test("多角色工作态汇总：busy 与队列去重，排队数逐角色累加", () => {
  const summary = workingRolesSummary(
    { liaison: true, nominator: false, convener: true },
    { nominator: ["q1"], convener: ["q2", "q3"], verifier: [] },
  );
  assert.deepEqual(summary.ids.slice().sort(), ["convener", "liaison", "nominator"]);
  assert.equal(summary.count, 3);
  assert.equal(summary.queued, 3);
  assert.equal(workingRolesSummary(undefined, undefined).count, 0);
  assert.equal(workingRolesSummary({}, {}).queued, 0);
});

test("ChatHeader 工作 chip：当前角色 busy 或队列非空才显示", () => {
  assert.equal(chatWorkingChipView({ busy: true }).visible, true);
  assert.equal(chatWorkingChipView({ busy: true }).label, "工作中");
  assert.equal(chatWorkingChipView({ queueDepth: 1 }).visible, true);
  assert.equal(chatWorkingChipView({ busy: false, queueDepth: 0 }).visible, false);
});

test("组件渲染：多角色两个 working chip 都含文本/圆点，无 live region", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(RoleStatusChip, {
        className: "ti-status st-working role-status-chip is-working",
        label: "工作中",
        title: "有轮次在跑",
        dot: true,
        status: "working",
        icon: createElement("span", {
          className: "ts-ico status-spinner",
          "aria-hidden": "true",
        }),
      }),
      createElement(RoleStatusChip, {
        className: "ti-status st-working role-status-chip is-working",
        label: "工作中",
        dot: true,
        status: "working",
      }),
      createElement(RoleStatusChip, {
        className: "chat-role-working role-status-chip is-working",
        label: "工作中",
        title: "有轮次在跑",
        dot: true,
        status: "working",
      }),
    ),
  );
  assert.equal((html.match(/工作中/g) || []).length, 3);
  assert.equal((html.match(/role-status-dot/g) || []).length, 3);
  assert.match(html, /class="ti-status st-working role-status-chip is-working"/);
  assert.match(html, /class="chat-role-working role-status-chip is-working"/);
  assert.match(html, /class="ts-ico status-spinner"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /data-status="working"/);
  assert.equal(html.includes("aria-live"), false);
  assert.equal(html.includes('role="alert"'), false);
});

test("组件渲染：等待确认 icon 与文字并存（颜色不是唯一信号）", () => {
  const html = renderToStaticMarkup(
    createElement(RoleStatusChip, {
      className: "ti-status st-confirm",
      label: "等待你确认",
      title: "有交互请求挂起",
      icon: createElement("span", { className: "fake-icon", "aria-hidden": "true" }),
      status: "awaiting-confirm",
    }),
  );
  assert.match(html, /class="fake-icon"/);
  assert.match(html, /等待你确认/);
  assert.equal(html.includes("role-status-dot"), false);
});

test("工作态仅用绿色 chip/头像环；竖条只保留给选中态", () => {
  for (const token of ["--working", "--working-bg", "--working-border"]) {
    colorToken(token);
  }
  const working = colorToken("--working").toLowerCase();
  const workingBg = colorToken("--working-bg").toLowerCase();
  const workingBorder = colorToken("--working-border").toLowerCase();
  assert.notEqual(working, colorToken("--warning").toLowerCase(), "工作绿不得复用 warning");
  assert.notEqual(working, colorToken("--primary").toLowerCase(), "工作绿不得等于选中行 primary");
  // 防止回退到上一版蓝/青工作态。
  assert.notEqual(working, "#86c5e3");
  assert.notEqual(workingBg, "#182630");
  assert.notEqual(workingBorder, "#4f86a3");
  // 色相回归：绿通道必须高于红/蓝通道（绿色系而非蓝青/琥珀）。
  const green = parseInt(working.slice(3, 5), 16);
  assert.ok(green > parseInt(working.slice(1, 3), 16), "工作态应为绿色系（G>R）");
  assert.ok(green > parseInt(working.slice(5, 7), 16), "工作态应为绿色系（G>B）");
  for (const selector of [
    ".ti-status.role-status-chip.is-working",
    ".chat-role-working",
    ".ti-avatar.is-working",
    ".sidebar-expand.has-working",
    ".sidebar-working-dot",
  ]) {
    const body = ruleBody(SHELL_CSS, selector);
    assert.ok(body.includes("var(--working"), selector + " 未使用工作态绿色令牌");
    assert.equal(
      body.includes("var(--warning"),
      false,
      selector + " 仍在复用 warning 琥珀",
    );
  }
  // 工作态不再有行左条/底色；竖条只属于 .tree-item.active。
  assert.equal(SHELL_CSS.includes(".tree-item.is-working"), false);
  assert.match(
    ruleBody(SHELL_CSS, ".tree-item.active"),
    /inset 2px 0 0 var\(--primary\)/,
  );
  const awaiting = ruleBody(SHELL_CSS, ".tree-item.is-awaiting:not(.active)");
  assert.match(awaiting, /var\(--warning-bg\)/);
  assert.equal(awaiting.includes("box-shadow"), false);
  assert.match(ruleBody(SHELL_CSS, ".ti-avatar.is-awaiting"), /var\(--warning\)/);
});

test("工作 chip 文本与背景对比度 ≥ 4.5:1（深色主题）", () => {
  const text = colorToken("--working");
  const background = colorToken("--working-bg");
  const ratio = contrast(text, background);
  assert.ok(ratio >= 4.5, "contrast " + ratio.toFixed(2));
});
