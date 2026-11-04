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
 * 全局任务状态与版本决策 98 个 key（2026-11-02 global-task-state；P1 审核 §六 冻结；
 * 2026-11-03 customer-authorization-plane A3 追加 `ui.versionDecision.decidedBy.directive`）。
 * 62 `ui.projectState.*` + 19 `ui.versionDecision.*` + 17 `main.versionDecision.*`。
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
  "ui.versionDecision.decidedBy.directive",
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

/**
 * 客户指令卡内入口 14 个 `ui.*` key（2026-11-03 customer-authorization-plane；
 * P1-CAP-17 / A3 冻结；设计 §4.4、P1 提案 §2.5）。
 * C2 只消费本清单；新增/改名须回到项目管理并同步更新本断言与分区计数。
 */
const DIRECTIVE_CARD_ENTRY_KEYS = [
  "ui.directive.cardEntry.entryLabel",
  "ui.directive.cardEntry.expand",
  "ui.directive.cardEntry.collapse",
  "ui.directive.cardEntry.inputPlaceholder",
  "ui.directive.cardEntry.submit",
  "ui.directive.cardEntry.cancel",
  "ui.directive.cardEntry.openPanel",
  "ui.directive.cardEntry.status.submitting",
  "ui.directive.cardEntry.status.confirmOpened",
  "ui.directive.cardEntry.error.notDirective",
  "ui.directive.cardEntry.error.invalidTarget",
  "ui.directive.cardEntry.error.submitFailed",
  "ui.directive.cardEntry.pendingShell.badge",
  "ui.directive.cardEntry.pendingShell.note",
] as const satisfies readonly MessageKey[];

/**
 * 客户指令 104 个 key（2026-11-03 customer-authorization-plane A3 冻结）：
 * 88 `ui.directive.*` + 15 `main.directive.*` + 1 `ui.versionDecision.decidedBy.directive`。
 * C1/C2 只消费本清单；新增/改名须回到项目管理并显式更新本断言与分区计数。
 */
const DIRECTIVE_KEYS = [
  // main.directive.receipt.*（5）
  "main.directive.receipt.approvalCreated",
  "main.directive.receipt.decisionCreated",
  "main.directive.receipt.approvalRevoked",
  "main.directive.receipt.decisionRevoked",
  "main.directive.receipt.noConsumerSuffix",
  // main.directive.applied.*（3）
  "main.directive.applied.approvalOnce",
  "main.directive.applied.decisionRecommended",
  "main.directive.applied.decisionDeclined",
  // main.directive.decision.*（2）
  "main.directive.decision.conflict",
  "main.directive.decision.notMatched",
  // main.directive.error.*（5）
  "main.directive.error.imageNotSupported",
  "main.directive.error.writeFailed",
  "main.directive.error.ledgerUnavailable",
  "main.directive.error.revokeRejected",
  "main.directive.error.submitRejected",
  // ui.directive.panel.*（22）
  "ui.directive.panel.title",
  "ui.directive.panel.approvalTitle",
  "ui.directive.panel.decisionTitle",
  "ui.directive.panel.status.active",
  "ui.directive.panel.status.revoked",
  "ui.directive.panel.status.consumed",
  "ui.directive.panel.status.expired",
  "ui.directive.panel.historyGroup",
  "ui.directive.panel.consumer.shellGate",
  "ui.directive.panel.consumer.decisionCard",
  "ui.directive.panel.consumer.none",
  "ui.directive.panel.until.once",
  "ui.directive.panel.until.session",
  "ui.directive.panel.until.forever",
  "ui.directive.panel.until.onceUnusedHint",
  "ui.directive.panel.until.sessionHint",
  "ui.directive.panel.until.foreverHint",
  "ui.directive.panel.revoke",
  "ui.directive.panel.empty",
  "ui.directive.panel.ledgerErrors",
  "ui.directive.panel.itemMeta",
  "ui.directive.panel.close",
  // ui.directive.dialog.*（30）
  "ui.directive.dialog.titleApproval",
  "ui.directive.dialog.titleDecision",
  "ui.directive.dialog.field.rawText",
  "ui.directive.dialog.field.action",
  "ui.directive.dialog.field.scope",
  "ui.directive.dialog.field.resource",
  "ui.directive.dialog.field.until",
  "ui.directive.dialog.field.revokeTarget",
  "ui.directive.dialog.action.allow",
  "ui.directive.dialog.action.reject",
  "ui.directive.dialog.action.revoke",
  "ui.directive.dialog.action.selectRecommended",
  "ui.directive.dialog.action.selectOption",
  "ui.directive.dialog.scope.project",
  "ui.directive.dialog.scope.allFlows",
  "ui.directive.dialog.scope.flow",
  "ui.directive.dialog.scope.projectNote",
  "ui.directive.dialog.resource.shell",
  "ui.directive.dialog.resource.domain",
  "ui.directive.dialog.resource.path",
  "ui.directive.dialog.highRisk.banner",
  "ui.directive.dialog.highRisk.acknowledge",
  "ui.directive.dialog.unrecognizedFragments",
  "ui.directive.dialog.invalidFields",
  "ui.directive.dialog.switch.approval",
  "ui.directive.dialog.switch.decision",
  "ui.directive.dialog.switch.on",
  "ui.directive.dialog.switch.off",
  "ui.directive.dialog.confirm",
  "ui.directive.dialog.cancel",
  // ui.directive.highRisk.*（8）
  "ui.directive.highRisk.forever",
  "ui.directive.highRisk.projectReject",
  "ui.directive.highRisk.projectSelect",
  "ui.directive.highRisk.wildcardDomain",
  "ui.directive.highRisk.broadPath",
  "ui.directive.highRisk.broadCommand",
  "ui.directive.highRisk.switchOffProjectSelect",
  "ui.directive.highRisk.unknown",
  // ui.directive.error.*（14）
  "ui.directive.error.panelUnavailable",
  "ui.directive.error.cancelled",
  "ui.directive.error.writeFailed",
  "ui.directive.error.imageNotSupported",
  "ui.directive.error.incompleteParse",
  "ui.directive.error.revokeNotFound",
  "ui.directive.error.revokeConsumed",
  "ui.directive.error.revokeRevoked",
  "ui.directive.error.revokeExpired",
  "ui.directive.error.revokeCrossTarget",
  "ui.directive.error.highRiskUnacknowledged",
  "ui.directive.error.ledgerUnavailable",
  "ui.directive.error.pendingPanelExists",
  "ui.directive.error.capabilityUnavailable",
  // ui.directive.cardEntry.*（14）
  ...DIRECTIVE_CARD_ENTRY_KEYS,
  // Q9 归属（1）
  "ui.versionDecision.decidedBy.directive",
] as const satisfies readonly MessageKey[];

/**
 * 下载申请 A2 key 契约（2026-11-04 download-requests；Revision 2 冻结）：
 * 37 key = main 35（card 13 + notice 5 + error 17）+ ui 2。
 * C1/C2 只按本清单消费；新增/改名须回到项目管理并显式更新本断言与分区计数。
 */
const DOWNLOAD_KEYS = [
  // main.download.card.*（13）
  "main.download.card.title",
  "main.download.card.role",
  "main.download.card.purpose",
  "main.download.card.url",
  "main.download.card.host",
  "main.download.card.resolvedIps",
  "main.download.card.resolvedIpsTruncated",
  "main.download.card.filename",
  "main.download.card.sizePolicy",
  "main.download.card.redirectPolicy",
  "main.download.card.mechanical.scheme",
  "main.download.card.mechanical.publicHost",
  "main.download.card.mechanical.publicIps",
  // main.download.notice.*（5）
  "main.download.notice.completed",
  "main.download.notice.failed",
  "main.download.notice.directiveAllowed",
  "main.download.notice.directiveSource",
  "main.download.notice.gitignoreHint",
  // main.download.error.*（17）
  "main.download.error.invalidArguments",
  "main.download.error.unsafeUrl",
  "main.download.error.dnsFailed",
  "main.download.error.deniedByDirective",
  "main.download.error.declined",
  "main.download.error.unavailable",
  "main.download.error.factsMissing",
  "main.download.error.rebindingDetected",
  "main.download.error.redirectCrossHost",
  "main.download.error.httpError",
  "main.download.error.tooLarge",
  "main.download.error.unsupportedEncoding",
  "main.download.error.timeout",
  "main.download.error.networkError",
  "main.download.error.writeFailed",
  "main.download.error.busy",
  "main.download.error.aborted",
  // ui.directive.panel.consumer.*（2）
  "ui.directive.panel.consumer.download",
  "ui.directive.panel.consumer.downloadLegacyOff",
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

test("key 分区计数：ui 1092 / main 626 / shared 62 / preferences 3，总计 1783", () => {
  const keys = Object.keys(zhCN);
  const prefixes = {
    ui: keys.filter((key) => key.startsWith("ui.")).length,
    main: keys.filter((key) => key.startsWith("main.")).length,
    shared: keys.filter((key) => key.startsWith("shared.")).length,
    preferences: keys.filter((key) => key.startsWith("preferences.")).length,
  };
  assert.deepEqual(prefixes, { ui: 1092, main: 626, shared: 62, preferences: 3 });
  assert.equal(keys.length, 1783);
});

test("下载申请 key 契约：37 key 中英成对、家族计数、精确文案/占位符一致、英文零 Han", () => {
  assert.equal(DOWNLOAD_KEYS.length, 37);
  assert.equal(new Set(DOWNLOAD_KEYS).size, 37, "DOWNLOAD_KEYS 存在重复 key");
  const families = {
    card: DOWNLOAD_KEYS.filter((key) => key.startsWith("main.download.card.")).length,
    notice: DOWNLOAD_KEYS.filter((key) => key.startsWith("main.download.notice.")).length,
    error: DOWNLOAD_KEYS.filter((key) => key.startsWith("main.download.error.")).length,
    uiConsumer: DOWNLOAD_KEYS.filter((key) => key.startsWith("ui.directive.panel.consumer.download")).length,
  };
  assert.deepEqual(families, { card: 13, notice: 5, error: 17, uiConsumer: 2 });

  for (const key of DOWNLOAD_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.deepEqual(placeholdersOf(zhCN[key]), placeholdersOf(enUS[key]), `占位符不一致：${key}`);
    assert.deepEqual(templateTexts(enUS[key]).filter((text) => HAN.test(text)), [], `en-US 含中文：${key}`);
  }

  // 逐字冻结（37 项；与 A2 Revision 2 提案 §3.1 一致）。
  const expected: Record<string, { zh: string; en: string }> = {
    "main.download.card.title": { zh: "下载文件申请", en: "Download request" },
    "main.download.card.role": { zh: "申请角色：{role}", en: "Requesting role: {role}" },
    "main.download.card.purpose": { zh: "用途：{purpose}", en: "Purpose: {purpose}" },
    "main.download.card.url": { zh: "URL：{url}", en: "URL: {url}" },
    "main.download.card.host": { zh: "主机：{host}", en: "Host: {host}" },
    "main.download.card.resolvedIps": { zh: "已解析 IP：{ips}", en: "Resolved IPs: {ips}" },
    "main.download.card.resolvedIpsTruncated": {
      zh: "（共 {total} 个，仅显示前 {shown} 个）",
      en: "(showing the first {shown} of {total})",
    },
    "main.download.card.filename": {
      zh: "预期文件名：{filename}（可能被服务器的 Content-Disposition 覆盖）",
      en: "Expected filename: {filename} (the server's Content-Disposition may override it)",
    },
    "main.download.card.sizePolicy": {
      zh: "大小策略：≤ {maxMb} MB（实际大小未知，直至收到响应）",
      en: "Size policy: ≤ {maxMb} MB (actual size is unknown until the response arrives)",
    },
    "main.download.card.redirectPolicy": {
      zh: "重定向策略：仅同域跟随；跨域重定向将中止并要求重新申请",
      en: "Redirect policy: same-host redirects only; a cross-host redirect stops the download and requires a new request",
    },
    "main.download.card.mechanical.scheme": { zh: "协议校验：通过（{scheme}）", en: "Scheme check: passed ({scheme})" },
    "main.download.card.mechanical.publicHost": { zh: "主机校验：公网地址", en: "Host check: public address" },
    "main.download.card.mechanical.publicIps": { zh: "解析 IP 校验：全部为公网地址", en: "Resolved IP check: all public addresses" },
    "main.download.notice.completed": {
      zh: "已下载「{host}」→ {path}（{bytes} 字节，sha256 {sha}）；审批来源：{source}。",
      en: "Downloaded “{host}” → {path} ({bytes} bytes, sha256 {sha}); approval source: {source}.",
    },
    "main.download.notice.failed": {
      zh: "未下载（技术 code：{code}）：{reason}",
      en: "Not downloaded (technical code: {code}): {reason}",
    },
    "main.download.notice.directiveAllowed": {
      zh: "客户审批指令 #{id} 已允许此下载（domain={host}，until={until}）。",
      en: "Approval directive #{id} allowed this download (domain={host}, until={until}).",
    },
    "main.download.notice.directiveSource": { zh: "审批指令 #{id}", en: "Approval directive #{id}" },
    "main.download.notice.gitignoreHint": {
      zh: "如需忽略已下载文件，请自行将 download/ 加入 .gitignore。",
      en: "To ignore downloaded files, add download/ to .gitignore yourself.",
    },
    "main.download.error.invalidArguments": {
      zh: "下载申请参数不合法；未发卡、未联网。",
      en: "The download request arguments are invalid; no card was issued and no network request was made.",
    },
    "main.download.error.unsafeUrl": { zh: "目标地址不安全：{detail}", en: "The target URL is unsafe: {detail}" },
    "main.download.error.dnsFailed": { zh: "域名解析失败：{host}", en: "DNS resolution failed: {host}" },
    "main.download.error.deniedByDirective": {
      zh: "客户审批指令 #{id} 拒绝了此下载。",
      en: "Approval directive #{id} denied this download.",
    },
    "main.download.error.declined": {
      zh: "审批未通过（客户拒绝或判断拒绝）。",
      en: "The download was not approved (declined by the customer or the judge).",
    },
    "main.download.error.unavailable": {
      zh: "审批通道不可用，未能取得审批。",
      en: "The approval channel is unavailable; no approval was obtained.",
    },
    "main.download.error.factsMissing": {
      zh: "判断器无法核对申请事实，已转客户确认。",
      en: "The judge could not verify the request facts; the request was escalated to the customer.",
    },
    "main.download.error.rebindingDetected": {
      zh: "下载连接地址与校验结果不一致（疑似 DNS rebinding），已中止且未写入文件。",
      en: "The connection address did not match the verified addresses (possible DNS rebinding); the download was aborted and nothing was written.",
    },
    "main.download.error.redirectCrossHost": {
      zh: "服务器重定向到其他主机（{target}）；未跟随，请对最终地址重新申请。",
      en: "The server redirected to another host ({target}); it was not followed. Request again for the final URL.",
    },
    "main.download.error.httpError": {
      zh: "服务器返回了不支持的响应：{detail}",
      en: "The server returned an unsupported response: {detail}",
    },
    "main.download.error.tooLarge": { zh: "文件超过大小上限（{maxMb} MB）。", en: "The file exceeds the size limit ({maxMb} MB)." },
    "main.download.error.unsupportedEncoding": {
      zh: "服务器使用了不支持的内容编码：{encoding}",
      en: "The server used an unsupported content encoding: {encoding}",
    },
    "main.download.error.timeout": { zh: "下载超时（连接、空闲或总时限）。", en: "The download timed out (connect, idle, or total limit)." },
    "main.download.error.networkError": {
      zh: "网络连接失败（连接重置或 TLS 校验失败）。",
      en: "The network connection failed (connection reset or TLS verification failure).",
    },
    "main.download.error.writeFailed": {
      zh: "写入 download/ 失败，下载未完成。",
      en: "Writing to download/ failed; the download did not complete.",
    },
    "main.download.error.busy": { zh: "同时执行的下载已达上限，请稍后重试。", en: "Too many downloads are running at once; try again later." },
    "main.download.error.aborted": {
      zh: "本轮已中止或应用已关闭，下载已取消。",
      en: "The turn was aborted or the app closed; the download was cancelled.",
    },
    "ui.directive.panel.consumer.download": { zh: "消费者：下载", en: "Consumer: download" },
    "ui.directive.panel.consumer.downloadLegacyOff": {
      zh: "不作用于下载（早于下载功能启用）",
      en: "Does not apply to downloads (created before download support was enabled)",
    },
  };
  for (const key of DOWNLOAD_KEYS) {
    assert.equal(zhCN[key], expected[key]!.zh, `zh-CN 文案不一致：${key}`);
    assert.equal(enUS[key], expected[key]!.en, `en-US 文案不一致：${key}`);
  }

  // 关键占位符/删除/复用断言。
  assert.deepEqual(placeholdersOf(zhCN["main.download.notice.completed"]), ["bytes", "host", "path", "sha", "source"]);
  assert.deepEqual(placeholdersOf(zhCN["main.download.card.resolvedIpsTruncated"]), ["shown", "total"]);
  assert.equal(
    Object.keys(zhCN).filter((key) => key === "ui.directive.panel.consumer.downloadStartsNow").length,
    0,
    "downloadStartsNow 必须不存在（G8 B 未选）",
  );
  assert.deepEqual(
    Object.keys(zhCN)
      .filter((key) => key.startsWith("main.download.card.mechanical."))
      .sort(),
    [
      "main.download.card.mechanical.publicHost",
      "main.download.card.mechanical.publicIps",
      "main.download.card.mechanical.scheme",
    ],
    "mechanical 只允许三项（scheme/publicHost/publicIps）",
  );
  for (const key of [
    "ui.judge.mode.approval",
    "ui.judge.headline.autoApproved",
    "ui.request.toCustomer",
    "ui.request.toJudge",
    "ui.directive.panel.consumer.none",
    "ui.directive.panel.until.once",
    "ui.directive.panel.until.session",
    "ui.directive.panel.until.forever",
  ] as const) {
    assert.ok(key in zhCN, `zh-CN 缺复用 key ${key}`);
    assert.ok(key in enUS, `en-US 缺复用 key ${key}`);
  }
  assert.deepEqual(
    Object.keys(zhCN).filter((key) => key.startsWith("ui.download.")),
    [],
    "不得新增 ui.download.* 重复 key",
  );
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

test("全局任务状态/版本决策 key 契约：98 key 中英成对、分组数量、占位符一致", () => {
  assert.equal(GLOBAL_TASK_STATE_KEYS.length, 98);
  const families = {
    projectState: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("ui.projectState.")).length,
    uiVersionDecision: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("ui.versionDecision.")).length,
    mainVersionDecision: GLOBAL_TASK_STATE_KEYS.filter((key) => key.startsWith("main.versionDecision.")).length,
  };
  assert.deepEqual(families, { projectState: 62, uiVersionDecision: 19, mainVersionDecision: 17 });
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

test("客户指令 key 契约：104 key 中英成对、家族计数、占位符一致、en-US 零 Han", () => {
  assert.equal(DIRECTIVE_KEYS.length, 104);
  assert.equal(new Set(DIRECTIVE_KEYS).size, 104, "DIRECTIVE_KEYS 存在重复 key");
  const families = {
    uiDirective: DIRECTIVE_KEYS.filter((key) => key.startsWith("ui.directive.")).length,
    mainDirective: DIRECTIVE_KEYS.filter((key) => key.startsWith("main.directive.")).length,
    versionDecision: DIRECTIVE_KEYS.filter((key) => key === "ui.versionDecision.decidedBy.directive").length,
  };
  assert.deepEqual(families, { uiDirective: 88, mainDirective: 15, versionDecision: 1 });

  assert.equal(DIRECTIVE_CARD_ENTRY_KEYS.length, 14);
  assert.equal(new Set(DIRECTIVE_CARD_ENTRY_KEYS).size, 14, "DIRECTIVE_CARD_ENTRY_KEYS 存在重复 key");
  for (const key of DIRECTIVE_CARD_ENTRY_KEYS) {
    assert.ok(key.startsWith("ui.directive.cardEntry."), `卡内入口 key 前缀不一致：${key}`);
    assert.ok((DIRECTIVE_KEYS as readonly string[]).includes(key), `DIRECTIVE_KEYS 缺卡内入口 key：${key}`);
  }

  for (const key of DIRECTIVE_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.deepEqual(placeholdersOf(zhCN[key]), placeholdersOf(enUS[key]), `占位符不一致：${key}`);
    assert.deepEqual(templateTexts(enUS[key]).filter((text) => HAN.test(text)), [], `en-US 含中文：${key}`);
  }

  // AC-5 四条回执精确模板（设计 §4.4；A3 冻结）。
  assert.equal(zhCN["main.directive.receipt.approvalCreated"], "已记录审批指令 #{id}");
  assert.equal(zhCN["main.directive.receipt.decisionCreated"], "已记录决策指令 #{id}");
  assert.equal(zhCN["main.directive.receipt.approvalRevoked"], "已撤销审批指令 #{id}");
  assert.equal(zhCN["main.directive.receipt.decisionRevoked"], "已撤销决策指令 #{id}");
  assert.equal(enUS["main.directive.receipt.approvalCreated"], "Approval directive #{id} recorded");
  assert.equal(enUS["main.directive.receipt.decisionCreated"], "Decision directive #{id} recorded");
  assert.equal(enUS["main.directive.receipt.approvalRevoked"], "Approval directive #{id} revoked");
  assert.equal(enUS["main.directive.receipt.decisionRevoked"], "Decision directive #{id} revoked");
  // 回执参数只允许 {id}，不得携带原文。
  for (const key of [
    "main.directive.receipt.approvalCreated",
    "main.directive.receipt.decisionCreated",
    "main.directive.receipt.approvalRevoked",
    "main.directive.receipt.decisionRevoked",
  ] as const) {
    assert.deepEqual(placeholdersOf(zhCN[key]), ["id"], `回执参数只能有 {id}：${key}`);
    assert.deepEqual(placeholdersOf(enUS[key]), ["id"], `回执参数只能有 {id}：${key}`);
  }

  // 应用结果行均含 {id} 与「不是客户本人点击」归属说明。
  for (const key of [
    "main.directive.applied.approvalOnce",
    "main.directive.applied.decisionRecommended",
    "main.directive.applied.decisionDeclined",
  ] as const) {
    assert.ok(placeholdersOf(zhCN[key]).includes("id"), `应用结果行缺 {id}：${key}`);
    assert.ok(zhCN[key].includes("不是客户本人点击"), `应用结果行缺归属说明：${key}`);
  }
  assert.deepEqual(placeholdersOf(zhCN["main.directive.applied.decisionRecommended"]), ["id", "option"]);

  // 冲突/不匹配说明参数（C1 投递用 {ids}/{id}）。
  assert.deepEqual(placeholdersOf(zhCN["main.directive.decision.conflict"]), ["ids"]);
  assert.deepEqual(placeholdersOf(zhCN["main.directive.decision.notMatched"]), ["id"]);

  // 卡内入口占位符（C2 传入 A1 标记常量值）。
  assert.deepEqual(placeholdersOf(zhCN["ui.directive.cardEntry.inputPlaceholder"]), ["approvalMarker", "decisionMarker"]);
  assert.deepEqual(placeholdersOf(zhCN["ui.directive.cardEntry.error.notDirective"]), ["approvalMarker", "decisionMarker"]);

  // 能力不可用/旧版本主进程入口说明（P1-CAP-09）。
  assert.ok(enUS["ui.directive.error.capabilityUnavailable"].includes("older version"));

  // Q9 归属文案（AC-10/AC-15）。
  assert.equal(zhCN["ui.versionDecision.decidedBy.directive"], "客户指令代选，不是客户本人点击");
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
