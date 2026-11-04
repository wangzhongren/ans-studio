// test/桌面UI/version-change-view.test.ts
// U1（2026-11-04 trunk-amendment-model）：版本变更/冻结/stable 续接/重构审计的纯视图逻辑——
// 入口矩阵、VCA 行（六状态/目标折叠/语义）、防御解析、冻结/迁移、重构五状态与只读指引、
// 重发卡回执；以及 F10/F17/无 drift 的源码守卫（只读提交、无渲→主提交通道）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  asDocFreezeListReply,
  asRefactorListReply,
  asStableWriteListReply,
  asVcaView,
  asVersionChangeListReply,
  freezeDocRowView,
  freezeHealthNotice,
  freezeReasonLabel,
  presentVersionChangeReceiptView,
  refactorGuidanceView,
  refactorRowView,
  refactorStatusLabel,
  stableRecordViews,
  vcaKindLabel,
  vcaRowView,
  vcaSectionViews,
  vcaStatusLabel,
  vcaSubmitGuidanceView,
  versionChangeEntryView,
  versionChangeListNotice,
  type VcaView,
} from "../../app/renderer/src/chat/version-change-view.ts";
import { translate } from "../../app/renderer/src/i18n/index.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sha = (ch: string) => ch.repeat(64);

const vca = (over: Record<string, unknown> = {}) => ({
  applicationId: "vc-1",
  kind: "detail-amendment",
  initiatorRoleId: "rapporteur",
  flowId: "flow-a",
  status: "submitted",
  summary: "补充细节",
  bootstrap: false,
  baseTrunkVersion: 3,
  targets: [
    {
      kind: "contract",
      path: "docs/proposals/flow-a-proposal-v4.md",
      action: "modify",
      version: 4,
      toSha256: sha("a"),
    },
  ],
  at: "2026-11-04T10:00:00.000Z",
  ...over,
});

// —————————————— 入口矩阵 ——————————————

test("版本变更入口：桥缺失/快照错误/D1 禁用原因/未到快照/可用", () => {
  const zh = (input: Parameters<typeof versionChangeEntryView>[0]) =>
    versionChangeEntryView(input, "zh-CN");

  const noBridge = zh({ bridgeAvailable: false, snapshot: null });
  assert.equal(noBridge.enabled, false);
  assert.equal(noBridge.label, translate("zh-CN", "ui.versionChange.entry"));
  assert.equal(noBridge.disabledReason, translate("zh-CN", "ui.versionChange.disabledUnavailable"));

  const errored = zh({ bridgeAvailable: true, snapshot: null, snapshotError: "boom" });
  assert.equal(errored.enabled, false);
  assert.match(errored.disabledReason ?? "", /boom/);

  const d1Disabled = zh({
    bridgeAvailable: true,
    snapshot: { disables: { versionChange: "冻结状态不可用；覆盖保护已按冻结处理（fail-closed）。" } },
  });
  assert.equal(d1Disabled.enabled, false);
  assert.match(d1Disabled.disabledReason ?? "", /fail-closed/);

  const loading = zh({ bridgeAvailable: true, snapshot: null });
  assert.equal(loading.enabled, true);
  assert.equal(loading.title, translate("zh-CN", "ui.versionChange.loading"));

  const ready = versionChangeEntryView(
    { bridgeAvailable: true, snapshot: { disables: { versionChange: null } } },
    "en-US",
  );
  assert.equal(ready.enabled, true);
  assert.equal(ready.label, "Version changes");
  assert.equal(ready.title, translate("en-US", "ui.versionChange.entryHint"));
});

// —————————————— VCA 防御解析/行视图 ——————————————

test("VCA 防御解析：合法行保留；坏行丢弃；失败/未知 schema 如实", () => {
  const parsed = asVcaView(vca());
  assert.match(parsed?.applicationId ?? "", /^vc-/);
  assert.equal(parsed?.targets.length, 1);

  assert.equal(asVcaView(null), null);
  assert.equal(asVcaView({ applicationId: "vc-1" }), null);
  const badTargets = asVcaView(vca({ targets: [{ path: "", toSha256: "" }, { path: "x", toSha256: sha("b") }] }));
  assert.equal(badTargets?.targets.length, 1);

  const list = asVersionChangeListReply({ ok: true, items: [vca(), { nope: true }] });
  assert.equal(list?.ok, true);
  assert.equal(list?.ok === true ? list.items.length : -1, 1);
  const failed = asVersionChangeListReply({ ok: false, code: "vca-invalid", error: "boom" });
  assert.deepEqual(failed, { ok: false, error: "boom" });
  assert.equal(asVersionChangeListReply({ items: [] }), null);
});

test("VCA 行：kind/status 六状态映射；未知值不猜测", () => {
  assert.equal(vcaKindLabel("detail-amendment", "zh-CN"), "修正案");
  assert.equal(vcaKindLabel("version-upgrade", "en-US"), "Version upgrade");
  assert.equal(vcaKindLabel("other", "zh-CN"), translate("zh-CN", "shared.common.unknown"));
  const statuses = ["draft", "submitted", "approved", "rejected", "applied", "superseded"];
  for (const status of statuses) {
    assert.equal(
      vcaStatusLabel(status, "zh-CN"),
      translate("zh-CN", `ui.versionChange.status.${status}` as never),
    );
  }
  assert.equal(vcaStatusLabel("weird", "zh-CN"), translate("zh-CN", "shared.common.unknown"));
});

test("VCA 行：目标折叠（>3）、语义按 kind、决定/结果主干、可重发卡仅 submitted", () => {
  const targets = Array.from({ length: 5 }, (_, index) => ({
    kind: "contract",
    path: `docs/proposals/flow-a-proposal-v${index + 2}.md`,
    action: "modify",
    version: index + 2,
    toSha256: sha(String(index)),
  }));
  const row = vcaRowView(
    asVcaView(vca({ targets, status: "submitted", decisionId: "decision-1", decidedAt: "2026-11-04T11:00:00.000Z" }))!,
    "zh-CN",
    "策划",
  );
  assert.equal(row.targetLines.length, 3);
  assert.equal(row.moreLine, translate("zh-CN", "ui.versionChange.targetMore", { count: 2 }));
  assert.match(row.targetLines[0] ?? "", /flow-a-proposal-v2\.md · v2 · /);
  assert.equal(row.semantics, translate("zh-CN", "ui.versionChange.semantics.detailAmendment"));
  assert.match(row.initiatorLine, /策划/);
  assert.match(row.decisionLine ?? "", /decision-1/);
  assert.equal(row.canPresent, true);
  assert.equal(row.canOpenCard, true);
  assert.equal(row.resultTrunkLine, null);

  const upgrade = vcaRowView(
    asVcaView(vca({ kind: "version-upgrade", status: "applied", resultTrunkVersion: 5 }))!,
    "en-US",
  );
  assert.equal(upgrade.semantics, translate("en-US", "ui.versionChange.semantics.versionUpgrade"));
  assert.equal(upgrade.resultTrunkLine, translate("en-US", "ui.versionChange.resultTrunk", { version: 5 }));
  assert.equal(upgrade.canPresent, false);
  assert.equal(upgrade.canOpenCard, false);
});

test("VCA 分节：submitted/approved 待批；draft/rejected/applied/superseded 历史", () => {
  const items = [
    vca({ applicationId: "vc-1", status: "submitted" }),
    vca({ applicationId: "vc-2", status: "approved" }),
    vca({ applicationId: "vc-3", status: "draft" }),
    vca({ applicationId: "vc-4", status: "rejected" }),
    vca({ applicationId: "vc-5", status: "applied" }),
    vca({ applicationId: "vc-6", status: "superseded" }),
  ]
    .map(asVcaView)
    .filter((item): item is VcaView => item !== null);
  const sections = vcaSectionViews(items, "zh-CN");
  assert.deepEqual(sections.pending.map((row) => row.id), ["vc-1", "vc-2"]);
  assert.deepEqual(sections.history.map((row) => row.id), ["vc-3", "vc-4", "vc-5", "vc-6"]);
  assert.equal(sections.pending[0]?.statusLabel, translate("zh-CN", "ui.versionChange.status.submitted"));
});

// —————————————— 只读提交指引（F10） ——————————————

test("提交指引：产品/策划可见，其他角色/无 governanceFunction 隐藏；无表单字段", () => {
  for (const fn of ["product", "proposal"]) {
    const view = vcaSubmitGuidanceView({ governanceFunction: fn }, "zh-CN");
    assert.equal(view.visible, true);
    assert.equal(view.text, translate("zh-CN", "ui.versionChange.submitGuidance"));
    assert.deepEqual(Object.keys(view).sort(), ["text", "visible"]);
  }
  for (const fn of ["schedule", "chief", "verification", undefined]) {
    assert.equal(vcaSubmitGuidanceView({ governanceFunction: fn }, "zh-CN").visible, false);
  }
});

// —————————————— 冻结清单 ——————————————

test("冻结行：frozen/draft、原因标签、迁移标注；未知 reason 不猜", () => {
  const frozen = freezeDocRowView(
    {
      path: "docs/proposals/flow-a-proposal-v4.md",
      version: 4,
      sha256: sha("c"),
      frozen: true,
      reason: "vca-approved",
      at: "2026-11-04T10:00:00.000Z",
    },
    "zh-CN",
  );
  assert.equal(frozen.statusLabel, translate("zh-CN", "ui.freeze.status.frozen"));
  assert.match(frozen.line, /docs\/proposals\/flow-a-proposal-v4\.md · v4 · /);
  assert.match(frozen.line, /客户批准版本变更/);
  assert.equal(frozen.migrationLabel, "");

  const draft = freezeDocRowView(
    {
      path: "docs/proposals/flow-a-proposal-v5.md",
      version: 5,
      sha256: sha("d"),
      frozen: false,
      at: "2026-11-04T10:00:00.000Z",
    },
    "zh-CN",
  );
  assert.equal(draft.statusLabel, translate("zh-CN", "ui.freeze.status.draft"));
  assert.match(draft.line, /草稿（未冻结）/);

  assert.equal(freezeReasonLabel("migrated-legacy", "en-US"), translate("en-US", "ui.freeze.reason.migratedLegacy"));
  assert.equal(freezeReasonLabel("made-up", "en-US"), translate("en-US", "shared.common.unknown"));
});

test("冻结回执：列表防御解析 + 缓存健康（fail-closed 文案）", () => {
  const list = asDocFreezeListReply({
    ok: true,
    freezes: [
      {
        path: "docs/workflow.md",
        version: 1,
        sha256: sha("e"),
        frozen: true,
        reason: "migrated-legacy",
        migrationMark: "migrated-legacy",
        at: "2026-11-04T10:00:00.000Z",
      },
    ],
    cacheHealth: "ok",
  });
  assert.equal(list?.ok, true);
  assert.equal(freezeHealthNotice("corrupt-failclosed", "zh-CN"), translate("zh-CN", "ui.freeze.failClosed"));
  assert.equal(freezeHealthNotice("missing-migrated", "zh-CN"), translate("zh-CN", "ui.freeze.unavailable"));
  assert.equal(freezeHealthNotice("ok", "zh-CN"), "");
  assert.match(versionChangeListNotice(null, "zh-CN"), /数据版本不受支持/);
  assert.match(versionChangeListNotice({ ok: false, error: "boom" }, "zh-CN"), /boom/);
});

// —————————————— 重构审计（客户只读/运营只读指引） ——————————————

test("重构行：五状态（含 superseded）映射；scope 优先级 paths > modules > roles", () => {
  for (const status of ["requested", "accepted", "closed", "rejected", "superseded"]) {
    assert.equal(
      refactorStatusLabel(status, "zh-CN"),
      translate("zh-CN", `ui.refactor.status.${status}` as never),
    );
  }
  assert.equal(refactorStatusLabel("bogus", "zh-CN"), translate("zh-CN", "shared.common.unknown"));

  const parsed = asRefactorListReply({
    ok: true,
    items: [
      {
        requestId: "rf-1",
        flowId: "flow-a",
        initiatedBy: "convener",
        title: "拆分模块",
        reason: "内部实现整理",
        scope: { modules: ["src/a"], paths: ["src/a/index.ts"], roles: ["A"] },
        status: "accepted",
        managedBy: "application-scheduler",
        at: "2026-11-04T10:00:00.000Z",
      },
    ],
  });
  assert.equal(parsed?.ok, true);
  const item = parsed?.ok === true ? parsed.items[0]! : null;
  assert.ok(item);
  const row = refactorRowView(item, "zh-CN");
  assert.equal(row.title, "拆分模块");
  assert.equal(row.statusLabel, translate("zh-CN", "ui.refactor.status.accepted"));
  assert.match(row.scopeLine, /src\/a\/index\.ts/);
  assert.match(row.summaryLine, /内部实现整理/);
  // 只读审计行：无动作/可批准字段。
  assert.deepEqual(Object.keys(row).sort(), ["at", "flowId", "id", "scopeLine", "statusLabel", "summaryLine", "title"]);
});

test("重构指引：仅运营（schedule）可见；其他角色隐藏", () => {
  const schedule = refactorGuidanceView({ governanceFunction: "schedule" }, "zh-CN");
  assert.equal(schedule.visible, true);
  assert.equal(schedule.text, translate("zh-CN", "ui.refactor.submitGuidance"));
  assert.equal(refactorGuidanceView({ governanceFunction: "product" }, "zh-CN").visible, false);
  assert.equal(refactorGuidanceView({ governanceFunction: undefined }, "en-US").visible, false);
});

// —————————————— stable 续接记录（无 drift） ——————————————

test("stable 续接记录：只取 written；含 path/decisionId/old→new hash/时间；无 drift 字段", () => {
  const records = asStableWriteListReply({
    ok: true,
    items: [
      {
        requestId: "sw-1",
        roleId: "convener",
        path: "docs/workflow.md",
        kind: "workflow",
        baseSha256: sha("1"),
        targetSha256: sha("2"),
        status: "written",
        decisionId: "decision-9",
        writtenAt: "2026-11-04T12:00:00.000Z",
        at: "2026-11-04T11:00:00.000Z",
      },
      {
        requestId: "sw-2",
        roleId: "nominator",
        path: "角色卡/A/role-card.md",
        kind: "role-card",
        baseSha256: sha("3"),
        targetSha256: sha("4"),
        status: "rejected",
        at: "2026-11-04T11:30:00.000Z",
      },
    ],
  });
  assert.equal(records?.ok, true);
  const rows = stableRecordViews(records?.ok === true ? records.items : [], "zh-CN");
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.line, /docs\/workflow\.md/);
  assert.match(rows[0]!.line, /decision-9/);
  assert.match(rows[0]!.line, new RegExp(`${sha("1")} → ${sha("2")}`));
  assert.equal(rows[0]!.kindLabel, translate("zh-CN", "ui.stableWrite.kind.workflow"));
  assert.equal("drift" in rows[0]!, false);
});

// —————————————— 重发卡回执（只显示 D1 事实） ——————————————

test("重发卡回执：pending=无通道；presented=待确认；answered=状态映射；失败=原文", () => {
  const pending = presentVersionChangeReceiptView({ ok: true, status: "pending", applicationId: "vc-1" }, "zh-CN");
  assert.equal(pending.kind, "pending");
  assert.equal(pending.text, translate("zh-CN", "ui.versionChange.noChannel"));

  const presented = presentVersionChangeReceiptView({ ok: true, status: "presented" }, "zh-CN");
  assert.equal(presented.kind, "presented");
  assert.equal(presented.text, translate("zh-CN", "ui.versionChange.status.submitted"));

  const answered = presentVersionChangeReceiptView(
    { ok: true, status: "answered", recordStatus: "applied" },
    "zh-CN",
  );
  assert.equal(answered.kind, "answered");
  assert.equal(answered.text, translate("zh-CN", "ui.versionChange.status.applied"));

  const failed = presentVersionChangeReceiptView({ ok: false, code: "vca-invalid", error: "boom" }, "zh-CN");
  assert.deepEqual(failed, { kind: "error", text: "boom" });
});

// —————————————— 源码守卫：F10/F17/无 drift/双入口 ——————————————

const UI_SOURCES = [
  "app/renderer/src/shell/ChatHeader.tsx",
  "app/renderer/src/chat/VersionChangePanel.tsx",
  "app/renderer/src/chat/RefactorPanel.tsx",
  "app/renderer/src/chat/TrunkPanels.tsx",
  "app/renderer/src/chat/version-change-view.ts",
  "app/renderer/src/chat/trunk-view.ts",
  "app/renderer/src/lib/platform.ts",
  "app/renderer/src/stores/version-change-store.ts",
];

test("F10/F17：渲染源码无 version-change:submit / refactor:request / stable-write:request 通道", () => {
  for (const rel of UI_SOURCES) {
    const code = codeOnly(read(rel));
    assert.equal(code.includes("version-change:submit"), false, `${rel} 不得出现 version-change:submit`);
    assert.equal(code.includes("refactor:request"), false, `${rel} 不得出现 refactor:request（F17）`);
    assert.equal(code.includes("stable-write:request"), false, `${rel} 不得出现 stable-write:request`);
  }
});

test("无 drift：渲染源码（去注释）无 drift/漂移 字面量（仅 noDrift key 引用除外）", () => {
  for (const rel of UI_SOURCES) {
    // `version-drift` 是既有 project-state blocker kind（与 P1.6 stable drift 无关），
    // 只允许这两个既有标识；新增的 stable/trunk 文案与视图仍不得出现 drift。
    const code = codeOnly(read(rel))
      .replace(/noDrift/g, "")
      .replace(/version-drift|versionDrift/g, "");
    assert.equal(/drift/i.test(code), false, `${rel} 不得含 drift`);
    assert.equal(code.includes("漂移"), false, `${rel} 不得含「漂移」`);
  }
});

test("会话头：无旧 run-change 按钮；有「版本变更」+「主干升级」；无重构入口", () => {
  const code = codeOnly(read("app/renderer/src/shell/ChatHeader.tsx"));
  assert.equal(code.includes('id="run-change"'), false);
  assert.equal(code.includes("requestRunChange"), false);
  assert.equal(code.includes("runChangeButtonView"), false);
  assert.equal(code.includes('id="version-change"'), true);
  assert.equal(code.includes('id="trunk-upgrade"'), true);
  assert.equal(code.includes("ui.refactor.entry"), false);
});

test("只读提交：版本变更/重构面板无表单控件；DecisionDialog 支持 acknowledgments 且不预勾选", () => {
  for (const rel of [
    "app/renderer/src/chat/VersionChangePanel.tsx",
    "app/renderer/src/chat/RefactorPanel.tsx",
  ]) {
    const code = codeOnly(read(rel));
    assert.equal(/<form\b/.test(code), false, `${rel} 不得含 <form>`);
    assert.equal(/<input\b/.test(code), false, `${rel} 不得含可编辑输入`);
    assert.equal(/<textarea\b/.test(code), false, `${rel} 不得含 textarea`);
    assert.equal(/<select\b/.test(code), false, `${rel} 不得含 select`);
  }
  const dialog = codeOnly(read("app/renderer/src/chat/DecisionDialog.tsx"));
  assert.match(dialog, /acknowledged/);
  assert.match(dialog, /aria-required/);
  assert.match(dialog, /useState<string\[\]>\(\[\]\)/);
});
