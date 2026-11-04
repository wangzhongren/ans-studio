// test/桌面UI/trunk-view.test.ts
// U1（2026-11-04 trunk-amendment-model）：主干面板/收窄「主干升级」的纯视图逻辑——
// `trunk:state` 防御解析、F15 三类 stable 快照、stable 续接记录分组（无 drift）、
// 升级入口四态、请求/确认回执（只显示「待二次确认」与版本事实，绝不显示「已升级」）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  TRUNK_SEGMENT_KEYS,
  asTrunkStatePayload,
  stableRecordGroupView,
  stableSnapshotRowsView,
  trunkPanelView,
  trunkUpgradeConfirmReceiptView,
  trunkUpgradeEntryView,
  trunkUpgradeRequestReceiptView,
} from "../../app/renderer/src/chat/trunk-view.ts";
import type { StableWriteView } from "../../app/renderer/src/chat/version-change-view.ts";
import { translate } from "../../app/renderer/src/i18n/index.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sha = (ch: string) => ch.repeat(64);

const payload = (over: Record<string, unknown> = {}) => ({
  version: 1,
  ok: true,
  projectRoot: "/p",
  generatedAt: "2026-11-04T10:00:00.000Z",
  availability: "frozen",
  trunkVersion: 3,
  source: "amendment",
  runId: "run-1",
  flowId: "flow-a",
  digest: "digest-1",
  derived: false,
  stable: {
    workflow: { kind: "workflow", path: "docs/workflow.md", sha256: sha("w") },
    roleCards: {
      A: { kind: "role-card", path: "角色卡/A/role-card.md", sha256: sha("r") },
    },
    boundaries: {
      A: { kind: "boundary", path: "角色卡/A/boundary.yaml", sha256: sha("b") },
    },
  },
  amendment: null,
  journal: null,
  pendingReattach: [],
  issues: [],
  freezes: { count: 2, cacheHealth: "ok" },
  pendingVersionChanges: { count: 0, items: [] },
  refactors: { count: 0, items: [] },
  disables: { versionChange: null, stableWrite: null, trunkUpgrade: null, refactor: null },
  ...over,
});

// —————————————— trunk:state 防御解析 ——————————————

test("trunk:state 防御解析：version/ok/stable/disables 不成立 ⇒ null；坏条目丢弃", () => {
  assert.ok(asTrunkStatePayload(payload()));
  assert.equal(asTrunkStatePayload({ ...payload(), version: 2 }), null);
  assert.equal(asTrunkStatePayload({ ...payload(), ok: false }), null);
  assert.equal(asTrunkStatePayload({ ...payload(), stable: undefined }), null);
  assert.equal(asTrunkStatePayload({ ...payload(), disables: undefined }), null);
  assert.equal(asTrunkStatePayload(null), null);

  const parsed = asTrunkStatePayload(
    payload({
      pendingVersionChanges: { count: 2, items: [{ applicationId: "vc-1" }, { bad: true }] },
    }),
  );
  assert.equal(parsed?.pendingVersionChanges.count, 2);
  assert.equal(parsed?.pendingVersionChanges.items.length, 0);
});

test("主干面板：版本行/无主干/来源与问题如实透传", () => {
  const state = asTrunkStatePayload(payload({ issues: ["issue-a"], pendingReattach: ["docs/workflow.md"] }));
  const view = trunkPanelView(state, "zh-CN");
  assert.equal(view.versionLine, translate("zh-CN", "ui.trunk.version", { version: 3 }));
  assert.deepEqual(view.issues, ["issue-a"]);
  assert.deepEqual(view.pendingReattach, ["docs/workflow.md"]);
  assert.equal(view.source, "amendment");

  const none = trunkPanelView(null, "zh-CN");
  assert.equal(none.versionLine, translate("zh-CN", "ui.trunk.versionNone"));
});

test("F15：stable 快照按 workflow / role-card / boundary 三类展示（顺序固定）", () => {
  const state = asTrunkStatePayload(payload());
  const rows = stableSnapshotRowsView(state, "zh-CN");
  assert.deepEqual(rows.map((row) => row.kindLabel), [
    translate("zh-CN", "ui.stableWrite.kind.workflow"),
    translate("zh-CN", "ui.stableWrite.kind.roleCard"),
    translate("zh-CN", "ui.stableWrite.kind.boundary"),
  ]);
  assert.equal(rows[0]?.path, "docs/workflow.md");
  assert.equal(rows[1]?.roleId, "A");
  assert.equal(rows[2]?.roleId, "A");

  // 缺 roleCards（旧载荷）⇒ 不虚构 role-card 行，但不影响 workflow/boundary。
  const withoutRoles = asTrunkStatePayload(
    payload({ stable: { workflow: { path: "docs/workflow.md", sha256: sha("w") }, boundaries: {} } }),
  );
  assert.deepEqual(
    stableSnapshotRowsView(withoutRoles, "zh-CN").map((row) => row.kindLabel),
    [translate("zh-CN", "ui.stableWrite.kind.workflow")],
  );
});

// —————————————— 收窄的主干升级入口 ——————————————

test("主干升级入口：桥缺失/快照错误/未收到快照/D1 禁用原因/可用", () => {
  const noBridge = trunkUpgradeEntryView(
    { bridgeAvailable: false, snapshot: { disables: { trunkUpgrade: null } } },
    "zh-CN",
  );
  assert.equal(noBridge.enabled, false);
  assert.equal(noBridge.disabledReason, translate("zh-CN", "ui.trunk.upgrade.disabledUnavailable"));

  const errored = trunkUpgradeEntryView(
    { bridgeAvailable: true, snapshot: null, snapshotError: "boom" },
    "zh-CN",
  );
  assert.equal(errored.enabled, false);
  assert.match(errored.disabledReason ?? "", /boom/);

  const unknown = trunkUpgradeEntryView({ bridgeAvailable: true, snapshot: null }, "zh-CN");
  assert.equal(unknown.enabled, false);
  assert.match(unknown.disabledReason ?? "", /未知/);

  const noTrunk = trunkUpgradeEntryView(
    {
      bridgeAvailable: true,
      snapshot: { disables: { trunkUpgrade: translate("zh-CN", "ui.trunk.upgrade.disabledNoTrunk") } },
    },
    "zh-CN",
  );
  assert.equal(noTrunk.enabled, false);
  assert.equal(noTrunk.disabledReason, translate("zh-CN", "ui.trunk.upgrade.disabledNoTrunk"));

  const ready = trunkUpgradeEntryView(
    { bridgeAvailable: true, snapshot: { disables: { trunkUpgrade: null } } },
    "en-US",
  );
  assert.equal(ready.enabled, true);
  assert.equal(ready.label, "Trunk upgrade");
  assert.equal(ready.title, translate("en-US", "ui.trunk.entryHint"));
});

// —————————————— stable 续接记录（按 kind 分组；无 drift） ——————————————

const stableRecord = (over: Partial<StableWriteView> = {}): StableWriteView => ({
  requestId: "sw-1",
  roleId: "convener",
  path: "docs/workflow.md",
  kind: "workflow",
  baseSha256: sha("1"),
  targetSha256: sha("2"),
  status: "written",
  decisionId: "decision-1",
  writtenAt: "2026-11-04T12:00:00.000Z",
  at: "2026-11-04T11:00:00.000Z",
  ...over,
});

test("stable 续接记录：只取 written、按三类分组、版本不变提示、无 drift", () => {
  const records = [
    stableRecord(),
    stableRecord({
      requestId: "sw-2",
      kind: "role-card",
      path: "角色卡/A/role-card.md",
      baseSha256: sha("3"),
      targetSha256: sha("4"),
      decisionId: "decision-2",
    }),
    stableRecord({ requestId: "sw-3", kind: "boundary", path: "角色卡/A/boundary.yaml" }),
    stableRecord({ requestId: "sw-4", status: "rejected" }),
    stableRecord({ requestId: "sw-5", status: "failed" }),
  ];
  const group = stableRecordGroupView(records, "zh-CN");
  assert.equal(group.empty, false);
  assert.deepEqual(group.groups.map((entry) => entry.kind), ["workflow", "role-card", "boundary"]);
  assert.equal(group.groups[0]?.rows.length, 1);
  assert.match(group.groups[0]?.rows[0]?.line ?? "", /decision-1/);
  assert.match(group.groups[0]?.rows[0]?.line ?? "", new RegExp(`${sha("1")} → ${sha("2")}`));
  assert.deepEqual(group.notes, [
    translate("zh-CN", "ui.stableWrite.record.unchangedVersion"),
    translate("zh-CN", "ui.stableWrite.confirm.noDrift"),
  ]);
  for (const row of group.groups.flatMap((entry) => entry.rows)) {
    assert.equal("drift" in row, false);
  }

  const empty = stableRecordGroupView([], "zh-CN");
  assert.equal(empty.empty, true);
  assert.deepEqual(empty.groups, []);
});

// —————————————— 升级回执（绝不显示「已升级」） ——————————————

test("升级请求回执：成功=已提交待二次确认（含 previewId）；失败=原文；无 ok/previewId ⇒ 错误", () => {
  const preview = trunkUpgradeRequestReceiptView(
    { ok: true, previewId: "tup-1", preview: { previewId: "tup-1" } },
    "zh-CN",
  );
  assert.equal(preview.kind, "preview");
  assert.equal(preview.previewId, "tup-1");
  assert.equal(preview.text, translate("zh-CN", "ui.trunk.upgrade.success"));
  assert.equal(preview.text.includes("已升级"), false);

  const failed = trunkUpgradeRequestReceiptView({ ok: false, code: "trunk-unavailable", error: "boom" }, "zh-CN");
  assert.deepEqual(failed, { kind: "error", text: "boom" });

  const malformed = trunkUpgradeRequestReceiptView({ ok: true }, "zh-CN");
  assert.equal(malformed.kind, "error");
});

test("升级确认回执：成功只显示主干版本事实（不写「升级成功」）；失败=原文", () => {
  const applied = trunkUpgradeConfirmReceiptView({ ok: true, status: "applied", trunkVersion: 4 }, "zh-CN");
  assert.equal(applied.kind, "applied");
  assert.equal(applied.text, translate("zh-CN", "ui.trunk.version", { version: 4 }));
  assert.equal(applied.text.includes("已升级"), false);

  const en = trunkUpgradeConfirmReceiptView({ ok: true, trunkVersion: 4 }, "en-US");
  assert.equal(en.text, translate("en-US", "ui.trunk.version", { version: 4 }));
  assert.equal(/upgraded/i.test(en.text), false);

  const failed = trunkUpgradeConfirmReceiptView(
    { ok: false, code: "trunk-high-risk-unacknowledged", error: "high risk" },
    "en-US",
  );
  assert.deepEqual(failed, { kind: "error", text: "high risk" });
});

// —————————————— 分段映射与源码守卫 ——————————————

test("分段标题 key 映射：版本变更/主干/重构", () => {
  assert.equal(translate("zh-CN", TRUNK_SEGMENT_KEYS["version-change"]), "版本变更");
  assert.equal(translate("zh-CN", TRUNK_SEGMENT_KEYS.trunk), "主干");
  assert.equal(translate("en-US", TRUNK_SEGMENT_KEYS.refactor), "Refactors");
});

test("主干面板源码：无 drift 区块；不轮询（无 setInterval）；升级确认绑定 previewId", () => {
  const panels = codeOnly(read("app/renderer/src/chat/TrunkPanels.tsx"));
  assert.equal(/drift/i.test(panels.replace(/noDrift/g, "")), false);
  assert.equal(panels.includes("漂移"), false);
  assert.equal(panels.includes("setInterval"), false);
  assert.match(panels, /trunk-upgrade-confirm|confirmTrunkUpgrade/);
  assert.match(panels, /previewId/);
  const view = codeOnly(read("app/renderer/src/chat/trunk-view.ts"));
  assert.equal(/drift/i.test(view.replace(/noDrift/g, "")), false);
  assert.equal(view.includes("setInterval"), false);
});
