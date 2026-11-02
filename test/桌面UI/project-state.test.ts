// test/桌面UI/project-state.test.ts
// A4（2026-11-02）：项目状态区（project-state/v1）的纯视图/只读/同源/两语言证据。
//
// Node 不能执行 .tsx（仓库既有口径），因此：
//  · 纯解析/视图函数放在 lib/platform.ts（A4 列内替代），本文件直接 import 验证实际输出；
//  · ProjectStatePanel.tsx 的接线/只读边界用源码守卫（去注释、无硬编码中文）；
//  · E2E 由 phase4b 夹具在 A2 完成后由 D1 运行，本文件不声称 E2E 通过。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  asProjectStateView,
  projectStateDetailsView,
  projectStateSummaryView,
} from "../../app/renderer/src/lib/platform.ts";
import type { ProjectStateView } from "../../app/renderer/src/lib/platform.ts";
import {
  createTranslator,
  enUS,
  zhCN,
} from "../../app/renderer/src/i18n/index.ts";
import type { TranslateDiagnostic } from "../../app/renderer/src/i18n/index.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PANEL = join(ROOT, "app", "renderer", "src", "chat", "ProjectStatePanel.tsx");
const PLATFORM = join(ROOT, "app", "renderer", "src", "lib", "platform.ts");

const read = (path: string) => readFileSync(path, "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const hasHan = (source: string) => /[一-鿿]/.test(source);

/** PM §六冻结的 62 个 `ui.projectState.*` key（A4 只用本家族；不加别名）。 */
const PROJECT_STATE_KEYS = [
  "title",
  "refresh",
  "readOnly",
  "empty",
  "loadError",
  "unavailable",
  "schemaUnsupported",
  "truncated",
  "errors",
  "pinnedHint",
  "focus.label",
  "focus.none",
  "focus.stale",
  "focus.derived",
  "focus.application",
  "focus.stageUndefined",
  "focus.updatedAt",
  "badge.unclosed",
  "badge.blocked",
  "badge.failed",
  "badge.pendingRequests",
  "section.flows",
  "section.tasks",
  "section.blockers",
  "section.versions",
  "section.evidence",
  "section.nextStep",
  "flow.superseded",
  "flow.taskCounts",
  "flow.runs",
  "blocker.kind.taskBlocked",
  "blocker.kind.taskFailed",
  "blocker.kind.requestPending",
  "blocker.kind.acceptanceRework",
  "blocker.kind.redispatchExhausted",
  "blocker.kind.versionDrift",
  "blocker.kind.referenceInvalid",
  "blocker.kind.runAmbiguous",
  "blocker.kind.focusStale",
  "blocker.kind.chiefNote",
  "blocker.source.app",
  "blocker.source.chief",
  "evidence.kind.acceptanceCard",
  "evidence.kind.verifierReport",
  "evidence.kind.taskEvidence",
  "evidence.status.present",
  "evidence.status.missing",
  "version.latest",
  "version.pinned",
  "version.newerThanPinned",
  "version.missing",
  "version.docKind.intent",
  "version.docKind.proposal",
  "version.docKind.modules",
  "version.docKind.roster",
  "version.docKind.topology",
  "version.docKind.architecture",
  "version.docKind.assets",
  "nextStep.source.chief",
  "nextStep.source.derived",
  "note.kind.blocker",
  "note.kind.nextStep",
].map((key) => `ui.projectState.${key}`);

function fixture(overrides: Partial<ProjectStateView> = {}): ProjectStateView {
  return {
    schema: "project-state/v1",
    generatedAt: "2026-11-02T00:00:00.000Z",
    projectRoot: "/phase4b-project",
    focus: {
      flowId: "flow-a",
      runId: "run-a",
      runState: "pinned",
      stage: "build",
      selectedBy: "chief",
      updatedAt: "2026-11-02T00:00:00.000Z",
      stale: false,
    },
    flows: [
      {
        flowId: "flow-a",
        sources: ["run", "task", "docs"],
        runs: [
          { runId: "run-a", state: "pinned", active: true },
          { runId: "run-a-closed", state: "closed", active: false },
        ],
        taskCounts: { unclosed: 3, blocked: 1, failed: 1 },
        lastActivityAt: "2026-11-02T00:00:00.000Z",
      },
      {
        flowId: "flow-old",
        sources: ["run", "task"],
        runs: [{ runId: "run-old", state: "closed", active: false }],
        taskCounts: { unclosed: 2, blocked: 0, failed: 0 },
        lastActivityAt: "2026-11-01T00:00:00.000Z",
        supersededBy: "flow-a",
      },
    ],
    tasks: [],
    blockers: [
      {
        id: "blocker-1",
        kind: "task-blocked",
        flowId: "flow-a",
        summary: "worker reported blocked",
        source: "app",
      },
      {
        id: "blocker-2",
        kind: "chief-note",
        summary: "waiting for client",
        source: "chief",
      },
    ],
    versions: [
      {
        flowId: "flow-a",
        docKind: "proposal",
        latest: { path: "docs/proposal-v3.md", version: 3 },
        pinned: { path: "docs/proposal-v2.md", version: 2 },
        newerThanPinned: true,
      },
      {
        flowId: "flow-a",
        docKind: "intent",
        newerThanPinned: false,
      },
    ],
    evidence: [
      {
        flowId: "flow-a",
        kind: "verifier-report",
        ref: "docs/verifier.md",
        summary: "report pointer",
        status: "present",
      },
      {
        flowId: "flow-a",
        kind: "task-evidence",
        ref: "docs/missing.md",
        status: "missing",
      },
    ],
    notes: [
      {
        noteKey: "next-step",
        kind: "next-step",
        text: "start next version",
        at: "2026-11-02T00:00:00.000Z",
        roleId: "chief",
        active: true,
      },
    ],
    nextStep: {
      text: "start next version",
      source: "chief",
      at: "2026-11-02T00:00:00.000Z",
    },
    errors: [{ source: "run-manifest", message: "bad manifest" }],
    truncated: false,
    counts: {
      unclosed: 5,
      supersededUnclosed: 2,
      activeUnclosed: 3,
      blocked: 1,
      failed: 1,
      pendingRequests: 1,
      flows: 2,
      tasks: 0,
    },
    ...overrides,
  };
}

function placeholders(template: unknown): string[] {
  const texts =
    typeof template === "string"
      ? [template]
      : template && typeof template === "object"
        ? Object.values(template as Record<string, unknown>).filter(
            (value): value is string => typeof value === "string",
          )
        : [];
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}

test("i18n：ui.projectState 62 key 全量、中英成对、占位符一致、英文零 Han", () => {
  assert.equal(PROJECT_STATE_KEYS.length, 62);
  const zh = zhCN as Record<string, unknown>;
  const en = enUS as Record<string, unknown>;
  const actual = Object.keys(zh)
    .filter((key) => key.startsWith("ui.projectState."))
    .sort();
  assert.deepEqual(actual, [...PROJECT_STATE_KEYS].sort());
  for (const key of PROJECT_STATE_KEYS) {
    assert.ok(key in en, `en-US 缺 key：${key}`);
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `占位符不一致：${key}`);
    const text = typeof en[key] === "string" ? en[key] : JSON.stringify(en[key]);
    assert.equal(hasHan(text), false, `en-US 含中文：${key}`);
  }
});

test("asProjectStateView：仅认 project-state/v1 顶层形状；不补默认值", () => {
  const state = fixture();
  assert.equal(asProjectStateView(state), state);
  assert.equal(asProjectStateView(null), null);
  assert.equal(asProjectStateView([]), null);
  assert.equal(asProjectStateView({ ...state, schema: "project-state/v2" }), null);
  assert.equal(asProjectStateView({ ...state, counts: undefined }), null);
  assert.equal(asProjectStateView({ ...state, flows: undefined }), null);
  assert.equal(asProjectStateView({ ...state, errors: undefined }), null);
  assert.equal(
    asProjectStateView({ ...state, counts: { ...state.counts, unclosed: "5" } }),
    null,
  );
});

test("summary：focus 一行 + 徽标；计数只读 counts.*（与 tasks 数组不一致也照用）", () => {
  const t = createTranslator("zh-CN");
  const state = fixture();
  // 冻结口径（A0/A1）：unclosed 含 superseded；active = unclosed - superseded。
  assert.ok(state.counts.supersededUnclosed <= state.counts.unclosed);
  assert.equal(
    state.counts.activeUnclosed,
    state.counts.unclosed - state.counts.supersededUnclosed,
  );
  const summary = projectStateSummaryView(state, t);
  assert.equal(summary.pinned, true);
  assert.equal(summary.stale, false);
  assert.equal(summary.selectedBy, "chief");
  assert.match(summary.focusLine, /flow-a/);
  assert.match(summary.focusLine, /run-a/);
  assert.match(summary.focusLine, /build/);
  assert.equal(summary.focusLine.includes(t("ui.run.state.pinned")), true);
  assert.equal(summary.readOnlyLabel, t("ui.projectState.readOnly"));
  assert.deepEqual(
    summary.badges.map((badge) => badge.key),
    ["unclosed", "blocked", "failed", "pendingRequests"],
  );
  assert.equal(summary.badges[0]!.text, t("ui.taskCenter.unclosed", { count: 5 }));
  assert.equal(summary.badges[1]!.text, t("ui.projectState.badge.blocked", { count: 1 }));
  assert.match(summary.badges[1]!.text, /活动/);
  assert.equal(summary.badges[2]!.text, t("ui.projectState.badge.failed", { count: 1 }));
  assert.equal(
    summary.badges[3]!.text,
    t("ui.projectState.badge.pendingRequests", { count: 1 }),
  );

  // 证明没有本地重算：counts.unclosed=9，但 tasks 为空、各 flow taskCounts 合计 5。
  const inconsistent = fixture({
    counts: { ...state.counts, unclosed: 9, activeUnclosed: 7, supersededUnclosed: 2 },
  });
  const again = projectStateSummaryView(inconsistent, t);
  assert.equal(again.badges[0]!.text, t("ui.taskCenter.unclosed", { count: 9 }));
});

test("summary：无 focus 不猜；derived/application/stale 标签来自既有 key", () => {
  const t = createTranslator("zh-CN");
  const none = fixture({
    focus: { selectedBy: "none", stale: true },
  });
  const summary = projectStateSummaryView(none, t);
  assert.equal(summary.focusLine, t("ui.projectState.focus.none"));
  assert.equal(summary.stale, true);
  assert.equal(summary.pinned, false);

  const derived = projectStateSummaryView(
    fixture({
      focus: {
        flowId: "flow-a",
        selectedBy: "derived",
        stale: false,
      },
    }),
    t,
  );
  assert.match(derived.focusLine, new RegExp(t("ui.projectState.focus.derived")));
  assert.match(derived.focusLine, new RegExp(t("ui.projectState.focus.stageUndefined")));
  assert.equal(derived.focusLine.includes(t("ui.projectState.focus.stale")), false);
});

test("blocker kind 映射：rework-pending → ui.projectState.blocker.kind.acceptanceRework（key 保留）", () => {
  const t = createTranslator("zh-CN");
  const details = projectStateDetailsView(
    fixture({
      blockers: [
        {
          id: "rework-pending:flow-a",
          kind: "rework-pending",
          flowId: "flow-a",
          summary: "acceptance rejected",
          source: "app",
        },
      ],
    }),
    t,
  );
  assert.equal(details.blockers[0]!.primary, t("ui.projectState.blocker.kind.acceptanceRework"));
});

test("details：按 payload 顺序映射 flows/tasks/blockers/versions/evidence/nextStep", () => {
  const t = createTranslator("zh-CN");
  const details = projectStateDetailsView(fixture(), t);
  assert.deepEqual(details.flows.map((flow) => flow.flowId), ["flow-a", "flow-old"]);
  assert.equal(details.flows[0]!.runs[0]!.active, true);
  assert.equal(details.flows[0]!.runs[1]!.active, false);
  assert.equal(details.flows[1]!.superseded, true);
  assert.match(details.flows[1]!.runsText, /flow-a/);
  assert.equal(details.flows[1]!.runsText.includes(t("ui.projectState.flow.runs", { count: 1 })), true);

  assert.deepEqual(details.tasks.map((row) => row.id), ["flow-a", "flow-old"]);
  assert.equal(
    details.tasks[0]!.secondary,
    t("ui.projectState.flow.taskCounts", { unclosed: 3, blocked: 1, failed: 1 }),
  );

  assert.equal(details.blockers[0]!.primary, t("ui.projectState.blocker.kind.taskBlocked"));
  assert.match(details.blockers[0]!.secondary ?? "", /worker reported blocked/);
  assert.match(details.blockers[0]!.secondary ?? "", new RegExp(t("ui.projectState.blocker.source.app")));
  assert.equal(details.blockers[1]!.primary, t("ui.projectState.blocker.kind.chiefNote"));
  assert.equal(details.blockers[1]!.secondary?.endsWith(t("ui.projectState.blocker.source.chief")), true);

  assert.equal(details.versions[0]!.primary, `flow-a · ${t("ui.projectState.version.docKind.proposal")}`);
  assert.match(details.versions[0]!.secondary ?? "", /v3/);
  assert.match(details.versions[0]!.secondary ?? "", /v2/);
  assert.match(details.versions[0]!.secondary ?? "", new RegExp(t("ui.projectState.version.newerThanPinned")));
  assert.match(details.versions[1]!.secondary ?? "", new RegExp(t("ui.projectState.version.missing")));

  assert.equal(details.evidence[0]!.secondary?.startsWith(t("ui.projectState.evidence.status.present")), true);
  assert.equal(details.evidence[1]!.secondary?.startsWith(t("ui.projectState.evidence.status.missing")), true);
  assert.deepEqual(details.nextStep, {
    text: "start next version",
    source: t("ui.projectState.nextStep.source.chief"),
  });
});

test("details：truncated 与 errors[] 如实显示；坏 manifest + 好 flow 的 active 不丢（R1 展示）", () => {
  const t = createTranslator("zh-CN");
  const state = fixture({
    truncated: true,
    errors: [
      { source: "run-manifest", message: "bad manifest", file: "manifest.json", line: 3 },
      { source: "tasks", message: "bad line", line: 1 },
    ],
  });
  const details = projectStateDetailsView(state, t);
  assert.equal(details.truncated, true);
  assert.equal(details.errors.length, 2);
  assert.match(details.errors[0]!, /run-manifest/);
  assert.match(details.errors[0]!, /manifest\.json:3/);
  assert.equal(details.flows[0]!.runs[0]!.active, true);
});

test("两语言：en-US 输出无 Han、无缺失 key/参数诊断", () => {
  const diagnostics: TranslateDiagnostic[] = [];
  const t = createTranslator("en-US", {
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const summary = projectStateSummaryView(fixture(), t);
  const details = projectStateDetailsView(fixture(), t);
  const texts = [
    summary.focusLine,
    summary.readOnlyLabel,
    ...summary.badges.map((badge) => badge.text),
    ...details.flows.flatMap((flow) => [
      flow.flowId,
      flow.runsText,
      ...flow.runs.map((run) => `${run.runId} ${run.label}`),
    ]),
    ...details.tasks.flatMap((row) => [row.primary, row.secondary ?? ""]),
    ...details.blockers.flatMap((row) => [row.primary, row.secondary ?? ""]),
    ...details.versions.flatMap((row) => [row.primary, row.secondary ?? ""]),
    ...details.evidence.flatMap((row) => [row.primary, row.secondary ?? ""]),
    details.nextStep?.source ?? "",
    ...details.errors,
  ];
  for (const text of texts) {
    assert.equal(hasHan(text), false, `en-US 输出含中文：${text}`);
  }
  assert.deepEqual(diagnostics, []);
});

test("只读/无本地派生：面板唯一数据入口 getProjectState，无写桥/扫描/第二套状态", () => {
  const panel = codeOnly(read(PANEL));
  const platform = codeOnly(read(PLATFORM));
  assert.match(panel, /getProjectState\(\{ projectRoot \}\)/);
  assert.match(panel, /asProjectStateView\(/);
  assert.match(panel, /projectStateSummaryView\(/);
  assert.match(panel, /projectStateDetailsView\(/);
  assert.match(panel, /<details className="ps-details">/);
  assert.match(panel, /data-active=\{run\.active \? "true" : "false"\}/);
  assert.equal(
    (panel.match(/onClick=/g) ?? []).length,
    1,
    "面板除刷新外不应有动作",
  );

  const forbidden = [
    "appendTaskEvent",
    "taskStatusOf",
    "closeTask",
    "terminateRoleRun",
    "redispatchTask",
    "projectNote",
    "node:fs",
    "node:path",
    "common/编排",
    "task-state",
    "run-manifest",
    "window.",
    "document.",
  ];
  for (const token of forbidden) {
    assert.equal(panel.includes(token), false, `面板不应包含 ${token}`);
  }
  assert.equal(hasHan(panel), false, "面板源码（去注释）含硬编码中文");

  // 纯函数区不得读 window/document 或桥；Node 直接调用已证明可执行（无 DOM）。
  const pure = platform.slice(platform.indexOf("export interface ProjectStateBadgeView"));
  assert.ok(pure.length > 0);
  for (const token of ["window.", "document.", "getDesktopBridge("]) {
    assert.equal(pure.includes(token), false, `纯函数区不应包含 ${token}`);
  }
});

test("同源计数：面板 unclosed 与任务中心 listTasks.unclosed 使用同一数值", () => {
  const t = createTranslator("zh-CN");
  const state = fixture();
  const listTasksReply = { tasks: [], errors: 0, unclosed: state.counts.unclosed };
  const summary = projectStateSummaryView(state, t);
  assert.equal(
    summary.badges.find((badge) => badge.key === "unclosed")!.text,
    t("ui.taskCenter.unclosed", { count: listTasksReply.unclosed }),
  );
});

test("空态语义：不可用/解析失败/空项目均不假造数字（视图返回 null；面板有对应 key）", () => {
  assert.equal(asProjectStateView(undefined), null);
  assert.equal(asProjectStateView({ schema: "project-state/v1" }), null);
  const panel = codeOnly(read(PANEL));
  for (const key of [
    "ui.projectState.empty",
    "ui.projectState.unavailable",
    "ui.projectState.schemaUnsupported",
    "ui.projectState.loadError",
  ]) {
    assert.ok(panel.includes(key), `面板缺空态/错误 key：${key}`);
  }
});
