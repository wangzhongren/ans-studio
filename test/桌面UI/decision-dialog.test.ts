// test/桌面UI/decision-dialog.test.ts
// E 批：决策对话框卡视图/优先级/推荐项/待办语义（纯逻辑）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  confirmDecisionPayload,
  decisionPriority,
  decisionView,
  isDestructiveDecision,
  nextDecisionId,
  orderedDecisionIds,
  pendingMoreCount,
  rejectDecisionPayload,
  sameDisplayText,
  shouldOpenDecision,
  type DecisionAcknowledgementView,
} from "../../app/renderer/src/chat/decision-dialog.ts";

const ACCEPTANCE_REQUEST = {
  kind: "choice",
  title: "验收决定",
  cardKind: "acceptance",
  options: [
    { id: "accept", label: "通过" },
    { id: "rework", label: "返工", recommended: true },
  ],
} as const;

const acceptanceReport = (text = "# 验收报告\n\n正文", extra: Record<string, unknown> = {}) => ({
  version: 1,
  path: "docs/quality/flow-a-report-v1.md",
  text: { text, redacted: true, truncated: false },
  ...extra,
});

function payload(over: Record<string, unknown> = {}, request: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    roleId: "rapporteur",
    request: { kind: "confirm", title: "提案", ...request },
    ...over,
  };
}

test("优先级：高风险 > 审批（appointment-write）> decision > 低风险确认；同级 FIFO", () => {
  const pending = {
    low1: payload({ id: "low1" }),
    high: payload({ id: "high", risk: "high" }),
    decision: payload({ id: "decision" }, { kind: "choice", cardKind: "proposal", options: [{ id: "a", label: "A" }] }),
    approval: payload({ id: "approval" }, { kind: "confirm", cardKind: "appointment-write" }),
    low2: payload({ id: "low2" }),
  };
  assert.deepEqual(orderedDecisionIds(pending, ["low1", "high", "decision", "approval", "low2"]), [
    "high",
    "approval",
    "decision",
    "low1",
    "low2",
  ]);
  assert.equal(decisionPriority(pending.high), 0);
  assert.equal(decisionPriority(pending.approval), 1);
  assert.equal(decisionPriority(pending.decision), 2);
  assert.equal(decisionPriority(pending.low1), 3);
});

test("上下文：来源/标题/预览/选项/唯一推荐/可作答；缺选项不可作答", () => {
  const view = decisionView(
    payload(
      { judgeNotice: "代批失败，回落客户" },
      {
        kind: "choice",
        title: "材料性选择",
        preview: "preview",
        detail: "detail",
        cardKind: "decision",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B", recommended: true },
        ],
      },
    ),
  );
  assert.equal(view.sourceRoleId, "rapporteur");
  assert.equal(view.title, "材料性选择");
  assert.equal(view.preview, "preview");
  assert.equal(view.detail, "detail");
  assert.equal(view.recommendedId, "b");
  assert.equal(view.answerable, true);
  assert.equal(view.judgeNotice, "代批失败，回落客户");
  assert.deepEqual(view.options.map((option) => option.id), ["a", "b"]);
  const empty = decisionView(payload({}, { kind: "choice", title: "空", cardKind: "decision", options: [] }));
  assert.equal(empty.answerable, false);
});

test("破坏性/审批卡需要二次确认；普通确认不需要", () => {
  assert.equal(isDestructiveDecision(payload({}, { kind: "confirm", cardKind: "appointment-write" })), true);
  assert.equal(isDestructiveDecision(payload({ risk: "high" })), true);
  assert.equal(isDestructiveDecision(payload()), false);
});

test("待办/队列：稍后处理不参与自动弹出，但仍在 pending 计数", () => {
  const pending = {
    a: payload({ id: "a" }),
    b: payload({ id: "b" }),
    c: payload({ id: "c" }),
  };
  assert.equal(nextDecisionId(pending, [], ["a", "b", "c"]), "a");
  assert.equal(nextDecisionId(pending, ["a"], ["a", "b", "c"]), "b");
  assert.equal(nextDecisionId(pending, ["a", "b"], ["a", "b", "c"], "c"), null);
  assert.equal(pendingMoreCount(pending, "a"), 2);
  assert.equal(pendingMoreCount(pending, null), 3);
});

test("E-05：输入中仅高风险打断；已有卡仅更高优先级高风险替换", () => {
  assert.equal(shouldOpenDecision({ activePriority: null, bestPriority: 3, suppressed: false }), true);
  assert.equal(shouldOpenDecision({ activePriority: null, bestPriority: 2, suppressed: true }), false);
  assert.equal(shouldOpenDecision({ activePriority: null, bestPriority: 0, suppressed: true }), true);
  assert.equal(shouldOpenDecision({ activePriority: 3, bestPriority: 2, suppressed: false }), false, "decision 不能替换低风险确认");
  assert.equal(shouldOpenDecision({ activePriority: 2, bestPriority: 1, suppressed: false }), false, "审批不能替换 decision");
  assert.equal(shouldOpenDecision({ activePriority: 3, bestPriority: 0, suppressed: false }), true, "高风险可打断");
  assert.equal(shouldOpenDecision({ activePriority: 0, bestPriority: 0, suppressed: false }), false, "同级高风险 FIFO，不替换");
});

test("验收卡：acceptance 标志与合法报告视图；选项/推荐/可作答性/优先级不变", () => {
  const view = decisionView(
    payload({ id: "acc-1", acceptanceReport: acceptanceReport() }, { ...ACCEPTANCE_REQUEST, preview: "验收卡说明" }),
  );
  assert.equal(view.acceptance, true);
  assert.deepEqual(view.acceptanceReport, {
    version: 1,
    path: "docs/quality/flow-a-report-v1.md",
    text: "# 验收报告\n\n正文",
    redacted: true,
    truncated: false,
  });
  assert.equal(view.kind, "choice");
  assert.deepEqual(view.options.map((option) => option.id), ["accept", "rework"]);
  assert.equal(view.recommendedId, "rework");
  assert.equal(view.answerable, true);
  assert.equal(view.priority, 2);
  assert.equal(view.highRisk, false);
  assert.equal(view.destructive, false);
  assert.equal(view.preview, "验收卡说明");

  const high = decisionView(
    payload({ risk: "high", acceptanceReport: acceptanceReport() }, ACCEPTANCE_REQUEST),
  );
  assert.equal(high.acceptance, true);
  assert.equal(high.priority, 0);
  assert.equal(high.highRisk, true);
  assert.equal(high.destructive, true);
});

test("非验收卡不消费 acceptanceReport；验收卡缺失报告时保持可作答", () => {
  const ordinary = decisionView(
    payload(
      { acceptanceReport: acceptanceReport() },
      { kind: "choice", cardKind: "decision", options: [{ id: "a", label: "A" }] },
    ),
  );
  assert.equal(ordinary.acceptance, false);
  assert.equal(ordinary.acceptanceReport, null);

  const missing = decisionView(payload({}, ACCEPTANCE_REQUEST));
  assert.equal(missing.acceptance, true);
  assert.equal(missing.acceptanceReport, null);
  assert.equal(missing.answerable, true);
});

test("验收报告防御读取：版本/字段类型/路径不合法一律 null，不抛错", () => {
  const cases: unknown[] = [
    undefined,
    null,
    { version: 2, path: "docs/quality/flow-a-report-v1.md", text: { text: "x", redacted: false, truncated: false } },
    { version: 1, path: "docs/quality/flow-a-report-v1.md" },
    { version: 1, path: "docs/quality/flow-a-report-v1.md", text: { text: 1, redacted: false, truncated: false } },
    { version: 1, path: "docs/quality/flow-a-report-v1.md", text: { text: "x", redacted: "no", truncated: false } },
    { version: 1, path: "docs/quality/flow-a-report-v1.md", text: { text: "x", redacted: false, truncated: 1 } },
    { version: 1, path: 1, text: { text: "x", redacted: false, truncated: false } },
  ];
  for (const value of cases) {
    const view = decisionView(payload({ acceptanceReport: value }, ACCEPTANCE_REQUEST));
    assert.equal(view.acceptance, true);
    assert.equal(view.acceptanceReport, null);
    assert.equal(view.answerable, true);
  }
  // path 允许空串（UI 据此不显示路径行）。
  const emptyPath = decisionView(
    payload(
      { acceptanceReport: { version: 1, path: "", text: { text: "x", redacted: false, truncated: false } } },
      ACCEPTANCE_REQUEST,
    ),
  );
  assert.equal(emptyPath.acceptanceReport?.path, "");
});

test("验收报告 UTF-8 上限 16384 字节：单字节/多字节边界", () => {
  const atLimit = decisionView(
    payload(
      { acceptanceReport: acceptanceReport("a".repeat(16384)) },
      ACCEPTANCE_REQUEST,
    ),
  );
  assert.equal(atLimit.acceptanceReport?.text.length, 16384);

  const overLimit = decisionView(
    payload(
      { acceptanceReport: acceptanceReport("a".repeat(16385)) },
      ACCEPTANCE_REQUEST,
    ),
  );
  assert.equal(overLimit.acceptanceReport, null);

  // "汉" = 3 UTF-8 字节：5461 字 = 16383 字节（接受），5462 字 = 16386 字节（拒绝）。
  assert.equal(new TextEncoder().encode("汉".repeat(5461)).byteLength, 16383);
  assert.equal(
    decisionView(
      payload({ acceptanceReport: acceptanceReport("汉".repeat(5461)) }, ACCEPTANCE_REQUEST),
    ).acceptanceReport?.text.length,
    5461,
  );
  assert.equal(
    decisionView(
      payload({ acceptanceReport: acceptanceReport("汉".repeat(5462)) }, ACCEPTANCE_REQUEST),
    ).acceptanceReport,
    null,
  );
});

test("preview 去重判据：仅统一换行/去首尾空白后完全相等", () => {
  assert.equal(sameDisplayText("a\r\nb\n", "a\nb"), true);
  assert.equal(sameDisplayText("  a  ", "a"), true);
  assert.equal(sameDisplayText("", "   "), true);
  assert.equal(sameDisplayText("a\n\nb", "a\nb"), false);
  assert.equal(sameDisplayText("a", "b"), false);
});

test("acknowledgments（C1 对象数组）：防御读取、required 严格 true、去重、旧卡零变化", () => {
  const view = decisionView(
    payload(
      {},
      {
        kind: "choice",
        title: "修正案逐项确认",
        cardKind: "decision",
        options: [
          { id: "item-apply", label: "采纳" },
          { id: "item-keep", label: "不采纳", recommended: true },
        ],
        acknowledgments: [
          { id: "boundary-expansion-0", label: "边界扩大：A → B", required: true },
          { id: "note-1", label: "附注", required: false },
          { id: "", label: "坏项" },
          { id: "boundary-expansion-0", label: "重复" },
          "bad",
        ],
      },
    ),
  );
  assert.deepEqual(view.acknowledgments, [
    { id: "boundary-expansion-0", label: "边界扩大：A → B", required: true },
    { id: "note-1", label: "附注", required: false },
  ]);
  assert.equal(view.answerable, true);
  // 旧卡（无 acknowledgments/非数组）⇒ 空数组，行为零变化。
  assert.deepEqual(decisionView(payload()).acknowledgments, []);
  assert.deepEqual(
    decisionView(payload({}, { kind: "confirm", acknowledgments: "nope" })).acknowledgments,
    [],
  );
});

test("stable-write 卡种：仅复用 decision 组优先级/样式（priority 2），appointment-write 与未知卡种不变", () => {
  const stable = payload(
    {},
    {
      kind: "choice",
      title: "workflow 写入确认",
      cardKind: "stable-write",
      options: [
        { id: "approve-stable-write", label: "放行执行" },
        { id: "reject-stable-write", label: "拒绝", recommended: true },
      ],
    },
  );
  assert.equal(decisionPriority(stable), 2);
  const view = decisionView(stable);
  assert.equal(view.cardKind, "stable-write");
  assert.equal(view.priority, 2);
  assert.equal(view.destructive, false);
  assert.equal(view.recommendedId, "reject-stable-write");

  assert.equal(decisionPriority(payload({}, { kind: "confirm", cardKind: "appointment-write" })), 1);
  assert.equal(decisionPriority(payload({}, { kind: "confirm", cardKind: "unknown-kind" })), 3);
});

// —————————————— D4（2026-11-05）：confirm 正向确认携带 acknowledged ——————————————

const ACKS: DecisionAcknowledgementView[] = [
  { id: "boundary-expansion-0", label: "边界扩大：A → B", required: true },
  { id: "boundary-expansion-1", label: "边界扩大：B → C", required: true },
  { id: "note-optional", label: "附注（可选）", required: false },
];

test("D4 confirm：required 全勾选 ⇒ acknowledged 恰为 required ids（声明序；非 required 不混入）", () => {
  const decision = confirmDecisionPayload(ACKS, ["note-optional", "boundary-expansion-1", "boundary-expansion-0"]);
  assert.deepEqual(decision, {
    kind: "confirm",
    confirmed: true,
    acknowledged: ["boundary-expansion-0", "boundary-expansion-1"],
  });
  // 只勾选 required 子集也按声明序输出。
  const subset = confirmDecisionPayload(ACKS, ["boundary-expansion-1", "boundary-expansion-0"]);
  assert.deepEqual(subset?.acknowledged, ["boundary-expansion-0", "boundary-expansion-1"]);
});

test("D4 confirm：required 未勾选齐全 ⇒ null（不能 confirm）", () => {
  assert.equal(confirmDecisionPayload(ACKS, []), null);
  assert.equal(confirmDecisionPayload(ACKS, ["boundary-expansion-0"]), null);
  assert.equal(confirmDecisionPayload(ACKS, ["note-optional"]), null);
});

test("D4 confirm：无 required ⇒ 旧 payload 零变化（不带 acknowledged）", () => {
  const noRequired = confirmDecisionPayload(
    [{ id: "note-optional", label: "附注", required: false }],
    ["note-optional"],
  );
  assert.deepEqual(noRequired, { kind: "confirm", confirmed: true });
  assert.equal(noRequired !== null && "acknowledged" in noRequired, false);

  const empty = confirmDecisionPayload([], []);
  assert.deepEqual(empty, { kind: "confirm", confirmed: true });
  assert.equal(empty !== null && "acknowledged" in empty, false);
});

test("D4 reject：confirmed:false 不带 acknowledged", () => {
  const reject = rejectDecisionPayload();
  assert.deepEqual(reject, { kind: "confirm", confirmed: false });
  assert.equal("acknowledged" in reject, false);
});

test("D4 接线：DecisionDialog.confirm 经 confirmDecisionPayload；reject 经 rejectDecisionPayload（无旧直发）", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const source = readFileSync(join(root, "app", "renderer", "src", "chat", "DecisionDialog.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(source, /confirmDecisionPayload\(view\.acknowledgments, acknowledged\)/);
  assert.match(source, /rejectDecisionPayload\(\)/);
  assert.equal(source.includes('{ kind: "confirm", confirmed: true }'), false);
  const platform = readFileSync(join(root, "app", "renderer", "src", "lib", "platform.ts"), "utf8");
  assert.match(platform, /export type OperatorDecisionPayload/);
  assert.match(platform, /kind: "confirm";\s*confirmed: boolean;\s*acknowledged\?: string\[\];/);
});

test("VCA 卡底部「拒绝」：选中 reject-version-change 并提交（不再发 cancelled 放弃作答）", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const source = readFileSync(join(root, "app", "renderer", "src", "chat", "DecisionDialog.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(source, /view\.options\.find\(\(option\) => option\.id === "reject-version-change"\)/);
  assert.match(source, /send\(\{ kind: "choice", selected: \[rejectOption\.id\] \}, \{ allowCancel: true \}\)/);
});
