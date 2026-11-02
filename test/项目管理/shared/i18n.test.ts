// test/项目管理/shared/i18n.test.ts
// D 批（2026-10-28）：共享 i18n 的 key 清单/计数/parity/英文泄漏守卫。
//
// D-05 要求：
//   · 最终 key 分区计数固定（漏 key 或顺手加 key 必须显式更新本断言）；
//   · zh-CN / en-US key 全集一致（parity）；
//   · 英文目录零中文泄漏（按值计数）；
//   · 已撤除的 flow/triage/gate/ledger/acceptance/Liaison key 零命中。
//
// 本文件只读共享目录，不依赖 Node/DOM/Electron；行为级翻译/回退/复数测试仍在
// `i18n-guard.test.ts` 与 i18n 实现单测覆盖（本批聚焦 D-05 计数/清理守卫）。

import assert from "node:assert/strict";
import { test } from "node:test";

import { zhCN } from "../../../src/common/shared/i18n/messages/zh-CN.ts";
import { enUS } from "../../../src/common/shared/i18n/messages/en-US.ts";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, translate, type MessageKey } from "../../../src/common/shared/i18n/index.ts";

const HAN = /\p{Script=Han}/u;

const B0_KEYS = [
  "ui.settings.language.title",
  "ui.settings.language.description",
  "ui.settings.language.zhCN",
  "ui.settings.language.enUS",
  "ui.settings.language.saveFailed",
  "main.window.title",
  "main.dialog.importProject.title",
  "main.dialog.pickImage.title",
  "main.error.startup.title",
  "main.error.startup.detail",
  "preferences.error.invalidLocale",
  "preferences.error.saveFailed",
  "preferences.error.readInvalid",
] as const satisfies readonly MessageKey[];

/** D 批保留的关键 UI/主进程 key（删除旧治理机器后仍必须存在）。 */
const D_RETAINED_KEYS = [
  "ui.task.title",
  "ui.workReport.title",
  "ui.roleLog.title",
  "ui.request.title",
  "ui.governance.power.appointmentWrite",
  "ui.judge.shellOffTitle",
  "ui.judge.shellOnTitle",
  "main.requirementChange.dispatched",
  "main.viewImage.queued",
] as const;

/**
 * shell 判拒后的客户升级通道 key 契约（方案 2026-10-31 §7.3，A3 冻结）。
 * C1/C2 只消费本清单；新增/改名须回到项目管理并显式更新本断言与分区计数。
 */
const SHELL_ESCALATION_KEYS = [
  "main.operator.escalation.appliedOnce",
  "main.operator.escalation.appliedSession",
  "main.operator.escalation.denied",
  "main.operator.escalation.expired",
  "main.operator.escalation.ineligible",
  "main.operator.escalation.pending",
  "main.operator.escalation.capped",
  "main.operator.escalation.invalid",
  "main.operator.manualDenyAdvice.retryCapped",
  "main.operator.judgeWayOut",
  "ui.judge.closeAndRetry",
  "ui.confirm.escalation.title",
  "ui.confirm.escalation.intro",
  "ui.confirm.escalation.judgeHeader",
  "ui.confirm.escalation.necessityHeader",
  "ui.confirm.escalation.necessityNote",
  "ui.confirm.escalation.contextHeader",
  "ui.confirm.escalation.contextPath",
  "ui.confirm.escalation.contextNpmScript",
  "ui.confirm.escalation.contextSha",
  "ui.confirm.escalation.contextNote",
  "ui.confirm.escalation.allowOnce",
  "ui.confirm.escalation.allowSession",
  "ui.confirm.escalation.reject",
  "ui.confirm.escalation.note",
  "ui.confirm.escalation.expired",
  "ui.confirm.escalation.customerNotJudge",
  "ui.confirm.escalation.pauseSession",
  "ui.judge.pauseSession",
  "ui.judge.pauseSessionDone",
  "ui.judge.pausedBadge",
  "ui.judge.resume",
] as const satisfies readonly MessageKey[];

/**
 * 验收回交卡 14 个 `ui.*` key（方案 2026-11-02 §4.4；A1 冻结）。
 * A3 只消费本清单；新增/改名须回到项目管理并显式更新本断言与分区计数。
 */
const ACCEPTANCE_RETURN_CARD_KEYS = [
  "ui.reportCard.acceptanceTitle",
  "ui.reportCard.acceptanceBadge",
  "ui.reportCard.acceptanceReportLabel",
  "ui.reportCard.evidenceCount",
  "ui.reportCard.acceptanceDecision",
  "ui.reportCard.acceptanceDecisionPending",
  "ui.reportCard.acceptanceDisclaimer",
  "ui.decisionDialog.acceptanceKind",
  "ui.decisionDialog.acceptanceReportTitle",
  "ui.decisionDialog.acceptanceReportFallback",
  "ui.decisionDialog.acceptanceReportMissing",
  "ui.decisionDialog.acceptanceReportTruncated",
  "ui.decisionDialog.acceptancePreviewLabel",
  "ui.decisionDialog.reportPath",
] as const satisfies readonly MessageKey[];

/**
 * 全局任务状态与版本决策 97 个 key（2026-11-02 global-task-state；P1 审核 §六 冻结）。
 * 62 `ui.projectState.*` + 18 `ui.versionDecision.*` + 17 `main.versionDecision.*`。
 * A3 只按本清单实施；新增/改名须回到项目管理并同步更新本断言与分区计数。
 */
const GLOBAL_TASK_STATE_KEYS = [
  // ui.projectState.*（62）
  "ui.projectState.title",
  "ui.projectState.refresh",
  "ui.projectState.readOnly",
  "ui.projectState.empty",
  "ui.projectState.loadError",
  "ui.projectState.unavailable",
  "ui.projectState.schemaUnsupported",
  "ui.projectState.truncated",
  "ui.projectState.errors",
  "ui.projectState.pinnedHint",
  "ui.projectState.focus.label",
  "ui.projectState.focus.none",
  "ui.projectState.focus.stale",
  "ui.projectState.focus.derived",
  "ui.projectState.focus.application",
  "ui.projectState.focus.stageUndefined",
  "ui.projectState.focus.updatedAt",
  "ui.projectState.badge.unclosed",
  "ui.projectState.badge.blocked",
  "ui.projectState.badge.failed",
  "ui.projectState.badge.pendingRequests",
  "ui.projectState.section.flows",
  "ui.projectState.section.tasks",
  "ui.projectState.section.blockers",
  "ui.projectState.section.versions",
  "ui.projectState.section.evidence",
  "ui.projectState.section.nextStep",
  "ui.projectState.flow.superseded",
  "ui.projectState.flow.taskCounts",
  "ui.projectState.flow.runs",
  "ui.projectState.blocker.kind.taskBlocked",
  "ui.projectState.blocker.kind.taskFailed",
  "ui.projectState.blocker.kind.requestPending",
  "ui.projectState.blocker.kind.acceptanceRework",
  "ui.projectState.blocker.kind.redispatchExhausted",
  "ui.projectState.blocker.kind.versionDrift",
  "ui.projectState.blocker.kind.referenceInvalid",
  "ui.projectState.blocker.kind.runAmbiguous",
  "ui.projectState.blocker.kind.focusStale",
  "ui.projectState.blocker.kind.chiefNote",
  "ui.projectState.blocker.source.app",
  "ui.projectState.blocker.source.chief",
  "ui.projectState.evidence.kind.acceptanceCard",
  "ui.projectState.evidence.kind.verifierReport",
  "ui.projectState.evidence.kind.taskEvidence",
  "ui.projectState.evidence.status.present",
  "ui.projectState.evidence.status.missing",
  "ui.projectState.version.latest",
  "ui.projectState.version.pinned",
  "ui.projectState.version.newerThanPinned",
  "ui.projectState.version.missing",
  "ui.projectState.version.docKind.intent",
  "ui.projectState.version.docKind.proposal",
  "ui.projectState.version.docKind.modules",
  "ui.projectState.version.docKind.roster",
  "ui.projectState.version.docKind.topology",
  "ui.projectState.version.docKind.architecture",
  "ui.projectState.version.docKind.assets",
  "ui.projectState.nextStep.source.chief",
  "ui.projectState.nextStep.source.derived",
  "ui.projectState.note.kind.blocker",
  "ui.projectState.note.kind.nextStep",
  // ui.versionDecision.*（18）
  "ui.versionDecision.title",
  "ui.versionDecision.question",
  "ui.versionDecision.option.versionModify",
  "ui.versionDecision.option.newVersionDevelopment",
  "ui.versionDecision.disclaimer",
  "ui.versionDecision.fact.header",
  "ui.versionDecision.fact.unclosed",
  "ui.versionDecision.fact.blockedFailed",
  "ui.versionDecision.fact.pendingRequests",
  "ui.versionDecision.fact.acceptanceReworks",
  "ui.versionDecision.fact.latestVsPinned",
  "ui.versionDecision.fact.previousDecisions",
  "ui.versionDecision.decidedBy.customer",
  "ui.versionDecision.decidedBy.judge",
  "ui.versionDecision.status.executing",
  "ui.versionDecision.status.executed",
  "ui.versionDecision.status.failed",
  "ui.versionDecision.status.uncertain",
  // main.versionDecision.*（17）
  "main.versionDecision.presented",
  "main.versionDecision.notifiedResolved",
  "main.versionDecision.executed.versionModify",
  "main.versionDecision.executed.newVersion",
  "main.versionDecision.declined",
  "main.versionDecision.unavailable",
  "main.versionDecision.aborted",
  "main.versionDecision.partialFailed",
  "main.versionDecision.uncertain",
  "main.versionDecision.error.versionDecisionInvalid",
  "main.versionDecision.error.flowNotFound",
  "main.versionDecision.error.runAmbiguous",
  "main.versionDecision.error.runChangeRequired",
  "main.versionDecision.error.decisionPending",
  "main.versionDecision.error.channelUnavailable",
  "main.versionDecision.error.executionFailed",
  "main.versionDecision.error.executionUncertain",
] as const satisfies readonly MessageKey[];

function templateTexts(template: unknown): string[] {
  if (typeof template === "string") return [template];
  if (template !== null && typeof template === "object") return Object.values(template).filter((v): v is string => typeof v === "string");
  return [];
}

function placeholdersOf(template: unknown): string[] {
  const names = new Set<string>();
  for (const text of templateTexts(template)) {
    for (const match of text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}

test("locale：SUPPORTED_LOCALES 只有 zh-CN/en-US，默认 zh-CN", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
});

test("key 分区计数：ui 1001 / main 576 / shared 62 / preferences 3，总计 1642", () => {
  const keys = Object.keys(zhCN);
  const prefixes = {
    ui: keys.filter((key) => key.startsWith("ui.")).length,
    main: keys.filter((key) => key.startsWith("main.")).length,
    shared: keys.filter((key) => key.startsWith("shared.")).length,
    preferences: keys.filter((key) => key.startsWith("preferences.")).length,
  };
  assert.deepEqual(prefixes, { ui: 1001, main: 576, shared: 62, preferences: 3 });
  assert.equal(keys.length, 1642);
});

test("验收回交卡 key 契约：14 key 中英成对、精确文案与占位符一致", () => {
  const expected: Record<string, { zh: string; en: string }> = {
    "ui.reportCard.acceptanceTitle": { zh: "独立验收报告", en: "Independent acceptance report" },
    "ui.reportCard.acceptanceBadge": { zh: "独立验收", en: "Independent acceptance" },
    "ui.reportCard.acceptanceReportLabel": { zh: "验收报告原文", en: "Acceptance report text" },
    "ui.reportCard.evidenceCount": { zh: "证据（{count} 条）", en: "Evidence ({count})" },
    "ui.reportCard.acceptanceDecision": { zh: "验收决定（如适用）", en: "Acceptance decision (if applicable)" },
    "ui.reportCard.acceptanceDecisionPending": {
      zh: "若本次为验收任务，由客户在验收决定卡作出；报告本身不构成通过。",
      en: "If this is an acceptance task, the customer decides on the acceptance card; this report alone is not an approval.",
    },
    "ui.reportCard.acceptanceDisclaimer": {
      zh: "以上为质检提交的报告原文；如本次为验收任务，是否验收通过以验收决定卡为准。",
      en: "This is the verifier's report; if this is an acceptance task, approval is decided on the acceptance card.",
    },
    "ui.decisionDialog.acceptanceKind": { zh: "独立验收决定", en: "Independent acceptance decision" },
    "ui.decisionDialog.acceptanceReportTitle": { zh: "验收报告原文", en: "Acceptance report" },
    "ui.decisionDialog.acceptanceReportFallback": {
      zh: "未能读取验收报告原文；验收卡说明仍可见。",
      en: "The acceptance report text could not be read; the card preview remains visible.",
    },
    "ui.decisionDialog.acceptanceReportMissing": {
      zh: "未提供验收报告原文。",
      en: "No acceptance report text is available.",
    },
    "ui.decisionDialog.acceptanceReportTruncated": {
      zh: "报告原文超出显示预算，已截断。",
      en: "The report text exceeds the display budget and is truncated.",
    },
    "ui.decisionDialog.acceptancePreviewLabel": { zh: "验收卡说明", en: "Card preview" },
    "ui.decisionDialog.reportPath": { zh: "报告路径：{path}", en: "Report path: {path}" },
  };
  for (const key of ACCEPTANCE_RETURN_CARD_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.equal(zhCN[key], expected[key]!.zh, `zh-CN 文案不一致：${key}`);
    assert.equal(enUS[key], expected[key]!.en, `en-US 文案不一致：${key}`);
    assert.deepEqual(placeholdersOf(zhCN[key]), placeholdersOf(enUS[key]), `占位符不一致：${key}`);
  }
  assert.deepEqual(placeholdersOf(zhCN["ui.reportCard.evidenceCount"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.decisionDialog.reportPath"]), ["path"]);
  for (const key of ACCEPTANCE_RETURN_CARD_KEYS) {
    if (key === "ui.reportCard.evidenceCount" || key === "ui.decisionDialog.reportPath") continue;
    assert.deepEqual(placeholdersOf(zhCN[key]), [], `不应有占位符：${key}`);
  }
  assert.equal(translate("zh-CN", "ui.reportCard.evidenceCount", { count: 3 }), "证据（3 条）");
  assert.equal(translate("en-US", "ui.reportCard.evidenceCount", { count: 3 }), "Evidence (3)");
  assert.equal(
    translate("zh-CN", "ui.decisionDialog.reportPath", { path: "docs/quality/flow-a-report-v1.md" }),
    "报告路径：docs/quality/flow-a-report-v1.md",
  );
  assert.equal(
    translate("en-US", "ui.decisionDialog.reportPath", { path: "docs/quality/flow-a-report-v1.md" }),
    "Report path: docs/quality/flow-a-report-v1.md",
  );
});

test("全局任务状态/版本决策 key 契约：97 key 中英成对、分组数量、占位符一致", () => {
  assert.equal(GLOBAL_TASK_STATE_KEYS.length, 97);
  const families = {
    projectState: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("ui.projectState.")).length,
    uiVersionDecision: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("ui.versionDecision.")).length,
    mainVersionDecision: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("main.versionDecision.")).length,
  };
  assert.deepEqual(families, { projectState: 62, uiVersionDecision: 18, mainVersionDecision: 17 });
  for (const key of GLOBAL_TASK_STATE_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.deepEqual(placeholdersOf(zhCN[key]), placeholdersOf(enUS[key]), `占位符不一致：${key}`);
    assert.deepEqual(templateTexts(enUS[key]).filter((text) => HAN.test(text)), [], `en-US 含中文：${key}`);
  }
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.badge.unclosed"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.badge.blocked"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.badge.failed"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.badge.pendingRequests"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.errors"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.flow.runs"]), ["count"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.flow.taskCounts"]), ["blocked", "failed", "unclosed"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.focus.updatedAt"]), ["time"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.version.latest"]), ["version"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.projectState.version.pinned"]), ["version"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.versionDecision.title"]), ["flowId"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.versionDecision.fact.blockedFailed"]), ["blocked", "failed"]);
  assert.deepEqual(placeholdersOf(zhCN["main.versionDecision.executed.versionModify"]), ["flowId", "targets"]);
  assert.deepEqual(placeholdersOf(zhCN["main.versionDecision.executed.newVersion"]), ["newFlowId", "newRunId", "oldFlowId"]);
});

test("全局任务状态复用既有 key：run 状态/通用短词/任务中心计数不新建别名", () => {
  const reused = [
    "ui.run.state.draft",
    "ui.run.state.pinned",
    "ui.run.state.closed",
    "ui.run.state.cancelled",
    "ui.run.state.legacy",
    "shared.common.failed",
    "shared.common.completed",
    "shared.common.truncated",
    "ui.taskCenter.unclosed",
    "ui.governance.status.blocked",
    "ui.work.reportStatus.blocked",
  ];
  for (const key of reused) {
    assert.ok(key in zhCN, `zh-CN 缺复用 key ${key}`);
    assert.ok(key in enUS, `en-US 缺复用 key ${key}`);
  }
  const keys = Object.keys(zhCN);
  for (const forbidden of ["ui.projectState.runState.", "ui.projectState.taskStatus.", "ui.projectState.common."]) {
    assert.deepEqual(keys.filter((key) => key.startsWith(forbidden)), [], `不得新建别名：${forbidden}`);
  }
});

test("key parity：zh-CN 与 en-US 全集一致（顺序无关）", () => {
  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(zhCN).sort());
});

test("英文泄漏计数：en-US 所有模板值零 Han 字符", () => {
  const leaking: string[] = [];
  for (const [key, value] of Object.entries(enUS)) {
    if (templateTexts(value).some((text) => HAN.test(text))) leaking.push(key);
  }
  assert.deepEqual(leaking, []);
});

test("旧治理 key 零命中：flow/triage/gate/ledger/acceptance/liaison", () => {
  const keys = Object.keys(zhCN);
  for (const pattern of ["ui.flow.", "ui.triage.", "ui.gate.", "ui.ledger.", "ui.acceptance.", "liaison"]) {
    assert.deepEqual(
      keys.filter((key) => key.includes(pattern)),
      [],
      `${pattern} 旧 key 不得残留`,
    );
  }
});

test("关键 key 清单：B0 与 D 保留能力 key 全部存在且中英成对", () => {
  for (const key of [...B0_KEYS, ...D_RETAINED_KEYS]) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
  }
  assert.equal(translate("zh-CN", "main.window.title"), zhCN["main.window.title"]);
  assert.equal(translate("en-US", "main.window.title"), enUS["main.window.title"]);
});

test("shell 升级 key 契约：§7.3 清单中英成对且回执保留兜底子串", () => {
  for (const key of SHELL_ESCALATION_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
  }
  // 改写后的回执必须保留「关闭」「替我审批」「重试」三词（方案 §4.6 / V1 AC-19）。
  for (const text of [zhCN["main.operator.judgeWayOut"], zhCN["ui.judge.closeAndRetry"], zhCN["main.operator.manualDenyAdvice.retryCapped"]]) {
    for (const word of ["关闭", "替我审批", "重试"]) {
      assert.ok(text.includes(word), `改写文案缺少「${word}」：${text}`);
    }
  }
  // judge 判拒与 retry-capped 回执给出「申请客户确认」新出路（不再只写重试）。
  assert.ok(zhCN["main.operator.judgeWayOut"].includes("request_shell_escalation"));
  assert.ok(zhCN["main.operator.manualDenyAdvice.retryCapped"].includes("request_shell_escalation"));
  // 升级卡三选项、不可信标注与「客户手批 ≠ judge 放行」声明（方案 §4.3/§7.1）。
  assert.equal(zhCN["ui.confirm.escalation.allowOnce"], "允许一次");
  assert.equal(zhCN["ui.confirm.escalation.allowSession"], "本会话允许该精确命令");
  assert.equal(zhCN["ui.confirm.escalation.reject"], "拒绝");
  assert.ok(zhCN["ui.confirm.escalation.customerNotJudge"].includes("客户手批 ≠ judge 放行"));
  assert.ok(zhCN["ui.confirm.escalation.necessityNote"].includes("由角色提供，未经验证"));
});
