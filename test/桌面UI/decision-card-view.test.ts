// test/桌面UI/decision-card-view.test.ts
// 决策卡（cardKind="decision"）卡面：标题、「非客户批准」标识、唯一推荐项的「推荐」标识，
// 以及普通 choice / proposal / appointment / acceptance 等卡种的零回归。
//
// 仓库没有 DOM 渲染依赖（沿 i18n-view.test.ts 先例），本文件用两层证据：
//  1) 纯视图模型：decision-card.ts 在 zh-CN / en-US 下的真实输出（文案来自共享 i18n 目录）；
//  2) 源码接线守卫：OperatorRow 确实只经该映射渲染标题/徽标/推荐标识，选项 input 的
//     name/value/交互未被改动，且 code 面没有中文硬编码或第二份 cardKind 判据。
// 这不是快照伪造：输出由真实共享目录计算，接线由可复核的源码断言证明。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LOCALE,
  enUS,
  translate,
  zhCN,
} from "../../app/renderer/src/i18n/index.ts";
import {
  decisionCardView,
  decisionOptionBadge,
} from "../../app/renderer/src/chat/decision-card.ts";
import { governanceCardMetaView } from "../../app/renderer/src/chat/governance-view.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RENDERER = join(ROOT, "app", "renderer", "src");
const read = (path: string) => readFileSync(path, "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const hasHan = (source: string) => /[一-鿿]/.test(source);

const decisionRequest = (extra: Record<string, unknown> = {}) => ({
  kind: "choice",
  cardKind: "decision",
  title: "采用方案 A 还是方案 B？",
  question: "两种方案的成本与客户可见行为不同。",
  flowId: "flow-demo",
  options: [
    { id: "a", label: "方案 A", recommended: true },
    { id: "b", label: "方案 B" },
  ],
  ...extra,
});

test("decision 卡：标题 / 非客户批准 / 推荐标识来自共享 i18n（zh-CN 默认）", () => {
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  const view = decisionCardView(decisionRequest());
  assert.equal(view.decision, true);
  assert.equal(view.title, translate(DEFAULT_LOCALE, "ui.decisionCard.title"));
  assert.equal(view.title, zhCN["ui.decisionCard.title"]);
  assert.equal(view.title, "决策卡 · 材料性选择");
  assert.equal(view.notApprovalBadge, translate(DEFAULT_LOCALE, "ui.decisionCard.notApprovalBadge"));
  assert.equal(view.notApprovalBadge, zhCN["ui.decisionCard.notApprovalBadge"]);
  assert.equal(view.notApprovalBadge, "非客户批准");
  assert.equal(view.recommendedBadge, translate(DEFAULT_LOCALE, "ui.decisionCard.recommended"));
  assert.equal(view.recommendedBadge, zhCN["ui.decisionCard.recommended"]);
  assert.equal(view.recommendedBadge, "推荐");
});

test("decision 卡：英文目录同 key、同语义", () => {
  const view = decisionCardView(decisionRequest(), "en-US");
  assert.equal(view.decision, true);
  assert.equal(view.title, enUS["ui.decisionCard.title"]);
  assert.equal(view.title, "Decision card · material choice");
  assert.equal(view.notApprovalBadge, enUS["ui.decisionCard.notApprovalBadge"]);
  assert.equal(view.notApprovalBadge, "Not customer approval");
  assert.equal(view.recommendedBadge, enUS["ui.decisionCard.recommended"]);
  assert.equal(view.recommendedBadge, "Recommended");
});

test("推荐标识：仅 decision 卡且 recommended === true（严格布尔）；不改选项 id", () => {
  const request = decisionRequest();
  const view = decisionCardView(request);
  assert.equal(decisionOptionBadge(view, request.options[0]), "推荐");
  for (const option of [
    request.options[1],
    { recommended: false },
    { recommended: "true" },
    { recommended: 1 },
    {},
    null,
    undefined,
    "a",
  ]) {
    assert.equal(decisionOptionBadge(view, option), "");
  }
  const snapshot = JSON.stringify(request);
  for (const option of request.options) decisionOptionBadge(view, option);
  assert.equal(JSON.stringify(request), snapshot, "option view must not mutate request");
  assert.deepEqual(
    request.options.map((option) => option.id),
    ["a", "b"],
  );
});

test("decision 卡：原 request.title/question 作为问题行保留，不丢材料性选择内容", () => {
  const view = decisionCardView(decisionRequest());
  assert.equal(view.question, "采用方案 A 还是方案 B？");
  assert.equal(view.questionNote, "两种方案的成本与客户可见行为不同。");
  const bare = decisionCardView({ cardKind: "decision" });
  assert.equal(bare.question, "");
  assert.equal(bare.questionNote, "");
  const nonStrings = decisionCardView({
    cardKind: "decision",
    title: 42,
    question: { text: "x" },
  });
  assert.equal(nonStrings.question, "");
  assert.equal(nonStrings.questionNote, "");
});

test("其它卡种零回归：标题 / 徽标 / 推荐标识均不出现（含 recommended 字段）", () => {
  const cardKinds: Array<string | undefined> = [
    "proposal",
    "appointment",
    "appointment-write",
    "schedule-write",
    "acceptance",
    "intent-confirm",
    "write",
    "Decision",
    "",
    undefined,
  ];
  for (const cardKind of cardKinds) {
    const request = {
      kind: "choice",
      ...(cardKind !== undefined ? { cardKind } : {}),
      title: "普通选择标题",
      question: "普通选择问题",
      options: [{ id: "a", label: "A", recommended: true }],
    };
    const view = decisionCardView(request);
    const label = String(cardKind);
    assert.equal(view.decision, false, label);
    assert.equal(view.title, "", label);
    assert.equal(view.notApprovalBadge, "", label);
    assert.equal(view.recommendedBadge, "", label);
    assert.equal(view.question, "", label);
    assert.equal(view.questionNote, "", label);
    assert.equal(decisionOptionBadge(view, request.options[0]), "", label);
  }
});

test("decision 卡不套用提案/任命/验收权力徽标；三类治理卡仍保持原分类", () => {
  const decisionMeta = governanceCardMetaView(decisionRequest());
  assert.equal(decisionMeta.governance, false);
  assert.equal(decisionMeta.badge, "");
  assert.equal(decisionMeta.power, "");
  for (const cardKind of ["proposal", "appointment", "acceptance"]) {
    const meta = governanceCardMetaView({
      kind: "choice",
      cardKind,
      flowId: "flow-demo",
    });
    assert.equal(meta.governance, true, cardKind);
    assert.notEqual(meta.badge, "", cardKind);
    assert.notEqual(meta.power, "", cardKind);
  }
});

test("ChatRow 接线：decision 卡只经单一映射，其它卡种保留原标题回退与选项交互", () => {
  const chatRow = codeOnly(read(join(RENDERER, "chat", "ChatRow.tsx")));
  assert.match(chatRow, /from "@\/chat\/decision-card"/);
  assert.match(chatRow, /const decisionCard = decisionCardView\(request, locale\);/);
  // 标题：decision 卡固定标题优先，其它卡种仍走原 request.title → 「选择/确认」回退。
  assert.match(chatRow, /decisionCard\.title \|\|/);
  assert.match(
    chatRow,
    /\(kind === "choice" \? t\("ui\.chatRow\.choose"\) : t\("ui\.chatRow\.confirm"\)\)/,
  );
  // 「非客户批准」标识只在 decision 视图非空时出现；推荐标识只随选项视图出现。
  assert.match(
    chatRow,
    /className="op-decision-badge">\{decisionCard\.notApprovalBadge\}</,
  );
  assert.match(chatRow, /const recommendedBadge = decisionOptionBadge\(decisionCard, option\);/);
  assert.match(chatRow, /className="op-recommended-badge">\{recommendedBadge\}</);
  // 问题行只在 decision 卡出现。
  assert.match(
    chatRow,
    /\{decisionCard\.decision && \(decisionCard\.question \|\| decisionCard\.questionNote\) \?/,
  );
  // 选项 id / input 契约不变。
  assert.match(chatRow, /const optionId = asString\(option\.id\) \|\| String\(index\);/);
  assert.match(chatRow, /name=\{"op-" \+ id\}/);
  assert.match(chatRow, /value=\{optionId\}/);
  // 文案 key 只在单一映射模块；组件 code 面无中文硬编码、无第二份 cardKind 判据。
  assert.equal(chatRow.includes("ui.decisionCard."), false);
  assert.equal(/cardKind\s*===\s*"decision"/.test(chatRow), false);
  assert.equal(hasHan(chatRow), false, "ChatRow code has hardcoded Chinese");
});

test("decision-card 映射：共享 key / 严格布尔 / 代码面无中文硬编码", () => {
  const moduleSource = codeOnly(read(join(RENDERER, "chat", "decision-card.ts")));
  for (const key of [
    "ui.decisionCard.title",
    "ui.decisionCard.notApprovalBadge",
    "ui.decisionCard.recommended",
  ]) {
    assert.ok(moduleSource.includes(key), key);
  }
  assert.match(moduleSource, /req\.cardKind !== "decision"/);
  assert.match(moduleSource, /\.recommended === true/);
  assert.equal(hasHan(moduleSource), false, "decision-card code has hardcoded Chinese");
});

test("卡面样式钩子存在（非 decision 卡不使用这些类）", () => {
  const css = read(join(RENDERER, "shell", "phase4b.css"));
  for (const selector of [".op-decision-badge", ".op-recommended-badge", ".op-question"]) {
    assert.ok(css.includes(selector), selector);
  }
});
