// test/桌面UI/judge-row-view.test.ts
// shell 判断结果行卡片渲染（2026-10-25）：allow / deny / deny-tier 三类的图标、徽标、
// 命令 chip、元信息、默认收起的详情与全文 title 不丢。

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShellJudgeRowCard,
  splitJudgeTitle,
} from "../../app/renderer/src/chat/judge-row-view.ts";
import { shellJudgeResultView } from "../../app/renderer/src/chat/judge.ts";
import { createTranslator } from "../../app/renderer/src/i18n/index.ts";

const t = createTranslator("zh-CN");

const allow = shellJudgeResultView({
  verdict: "allow",
  summary: "npm run build",
  engine: "claude",
  at: "2026-10-17T10:00:00Z",
  command: "npm run build -- --mode production",
});
const denyTier = shellJudgeResultView({
  verdict: "allow",
  tier: "deny",
  hardDenyOverride: true,
  label: "deny 档 · judge 放行",
  summary: "构建项目",
  reason: "构建产物需要刷新",
  engine: "claude",
  at: "2026-10-17T10:00:00Z",
  command: "npm run build",
});
const deny = shellJudgeResultView({
  verdict: "deny",
  tier: "risky",
  summary: "删除源码目录",
  reason: "会删除未提交源码",
  customerMessage: "该命令会删除项目源码，风险过高。",
  alternative: { kind: "command", value: "rm -rf dist", rationale: "只清理构建产物" },
  engine: "pi",
  at: "2026-10-17T10:01:00Z",
  command: "rm -rf src",
  cwd: "/proj",
  evidence: ["rm -rf src", "docs/security/notes.md"],
  toolCallId: "call-1",
});

function render(view: NonNullable<ReturnType<typeof shellJudgeResultView>>): string {
  return renderToStaticMarkup(
    createElement(
      "div",
      { className: "chat-row sys shell-judge-row is-allow" },
      createElement(ShellJudgeRowCard, { view, t }),
    ),
  );
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

test("splitJudgeTitle：主体与括号副标识拆开但拼回等于原 title", () => {
  assert.deepEqual(splitJudgeTitle("已替你放行（自动代理 · 代审批）"), {
    main: "已替你放行",
    meta: "（自动代理 · 代审批）",
  });
  const english = splitJudgeTitle("Approved for you (automatic agent)");
  assert.equal(english.main + english.meta, "Approved for you (automatic agent)");
  assert.equal(english.main.trim(), "Approved for you");
  assert.equal(english.meta, "(automatic agent)");
  assert.deepEqual(splitJudgeTitle("No wrapper"), {
    main: "No wrapper",
    meta: "",
  });
});

test("allow：盾牌图标/绿色徽标/命令 chip/元信息/详情默认收起，title 全文保留", () => {
  assert.ok(allow);
  if (!allow) return;
  const html = render(allow);
  assert.match(html, /class="sj-verdict-icon is-allow"/);
  assert.match(html, /lucide-shield-check/);
  assert.match(html, /class="sj-auto-badge is-allow"/);
  assert.equal(visibleText(html).includes("judge 代批 · 代审批"), true);
  assert.match(html, /class="sj-title-main">已替你放行</);
  assert.match(html, /class="sj-title-meta">（自动代理 · 代审批）</);
  assert.match(html, /aria-label="已替你放行（自动代理 · 代审批）"/);
  assert.equal(visibleText(html).includes(allow.title), true);
  assert.match(html, /class="sj-cmd"[^>]*title="npm run build"/);
  assert.equal(visibleText(html).includes("npm run build"), true);
  assert.equal(visibleText(html).includes("判断引擎：Claude"), true);
  assert.equal(visibleText(html).includes("operator:judge:claude"), true);
  assert.match(html, /<details class="sj-details">/);
  assert.equal(html.includes("<details class=\"sj-details\" open"), false);
  assert.equal(visibleText(html).includes("详情（命令原文 / 理由 / 证据）"), true);
  assert.equal(visibleText(html).includes("npm run build -- --mode production"), true);
  assert.equal(html.includes("sj-tier-badge"), false);
});

test("deny-tier allow：琥珀 deny 徽标 + 硬拒说明保留；title 含 deny 档全文", () => {
  assert.ok(denyTier);
  if (!denyTier) return;
  const html = render(denyTier);
  assert.match(html, /class="sj-verdict-icon is-allow"/);
  assert.match(html, /class="sj-auto-badge is-allow"/);
  assert.match(html, /class="sj-tier-badge">deny 档 · judge 放行</);
  assert.match(html, /aria-label="已替你放行（自动代理 · 代审批 · deny 档）"/);
  assert.equal(visibleText(html).includes(denyTier.title), true);
  assert.equal(visibleText(html).includes("档位：deny"), true);
  assert.equal(visibleText(html).includes("该命令属于硬拒类"), true);
  assert.match(html, /<details class="sj-details">/);
  assert.equal(html.includes("<details class=\"sj-details\" open"), false);
});

test("deny：ShieldX/红色徽标/理由 chip/retry 与详情行仍在，默认收起", () => {
  assert.ok(deny);
  if (!deny) return;
  const html = renderToStaticMarkup(
    createElement(
      "div",
      { className: "chat-row sys shell-judge-row is-deny" },
      createElement(ShellJudgeRowCard, { view: deny, t }),
    ),
  );
  assert.match(html, /class="sj-verdict-icon is-deny"/);
  assert.match(html, /lucide-shield-x/);
  assert.match(html, /class="sj-auto-badge is-deny"/);
  assert.match(html, /class="sj-cmd is-reason"/);
  assert.equal(visibleText(html).includes("删除源码目录"), true);
  assert.match(html, /aria-label="未放行（自动代理 · 代审批）"/);
  assert.equal(visibleText(html).includes("判断理由：会删除未提交源码"), true);
  assert.equal(visibleText(html).includes("替代方案：rm -rf dist"), true);
  assert.equal(visibleText(html).includes("该命令会删除项目源码，风险过高。"), true);
  assert.equal(visibleText(html).includes("关闭「替我审批」后重试"), true);
  assert.equal(html.includes("sj-tier-badge"), false);
  assert.match(html, /<details class="sj-details">/);
  assert.equal(html.includes("<details class=\"sj-details\" open"), false);
});

test("详情分区：命令只出现一次、pre/code、替代方案列表、客户 callout、证据键值", () => {
  assert.ok(deny);
  if (!deny) return;
  const html = renderToStaticMarkup(
    createElement(ShellJudgeRowCard, { view: deny, t }),
  );
  const details = html.slice(html.indexOf('<details class="sj-details"'));
  const text = visibleText(details);
  assert.match(details, /class="sj-detail-section"/);
  assert.match(details, /class="sj-d-label">命令原文<\/p><pre class="sj-pre"><code>rm -rf src<\/code><\/pre>/);
  assert.equal(text.split("rm -rf src").length - 1, 1, "命令原文只出现一次");
  assert.match(details, /class="sj-d-label">判断理由：<\/p><p class="sj-d-value">会删除未提交源码/);
  assert.match(details, /class="sj-list"><li>rm -rf dist（只清理构建产物）<\/li><\/ul>/);
  assert.match(details, /class="sj-callout"/);
  assert.match(details, /class="sj-d-label">客户说明：<\/p><p class="sj-d-value">该命令会删除项目源码，风险过高。/);
  assert.match(details, /class="sj-kv-grid"/);
  assert.match(details, /<dt>cwd<\/dt><dd>\/proj<\/dd>/);
  assert.match(details, /<dt>toolCallId<\/dt><dd>call-1<\/dd>/);
  assert.equal(text.includes("docs/security/notes.md"), true);
  assert.equal(text.includes("rm -rf src"), true);
  assert.equal(details.includes("sj-evidence"), false);
});

test("替代方案多行按列表渲染；客户说明独立 callout", () => {
  assert.ok(deny);
  if (!deny) return;
  const multi = {
    ...deny,
    details: {
      ...deny.details,
      alternative: "替代方案：npm run test:unit\n替代方案：npm run lint",
    },
  };
  const html = renderToStaticMarkup(
    createElement(ShellJudgeRowCard, { view: multi, t }),
  );
  assert.match(html, /class="sj-list"><li>npm run test:unit<\/li><li>npm run lint<\/li><\/ul>/);
  assert.match(html, /class="sj-callout"/);
});
