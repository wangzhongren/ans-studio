// test/桌面UI/download-card.test.ts
// 下载文件申请 C2（桌面UI）：judge 结果行 download 标签 / 指令面板 consumer 消费（AC-14/27）/
// 既有 confirm 卡复用（AC-3）/ i18n 冻结 key 消费（AC-19）。
//
// 纯逻辑、无 DOM：node --test 直接 import app/renderer/src 的 .ts 纯函数；
// 不启动 Electron、不 mock IPC、不访问文件系统（project-rules §三 UI 平台化口径）。

import test from "node:test";
import assert from "node:assert/strict";

import { governanceJudgeResultView } from "../../app/renderer/src/chat/judge.ts";
import { decisionView } from "../../app/renderer/src/chat/decision-dialog.ts";
import { decisionCardView } from "../../app/renderer/src/chat/decision-card.ts";
import {
  asDirectiveListView,
  consumerLabelKey,
  directiveRowView,
  type DirectiveItemView,
} from "../../app/renderer/src/stores/directive-store.ts";
import { translate } from "../../app/renderer/src/i18n/index.ts";

const DOMAIN_RESOURCE = {
  type: "domain",
  host: "example.com",
  wildcard: false,
} as const;
const PATH_RESOURCE = { type: "path", path: "/outside" } as const;

function directiveItem(over: Partial<DirectiveItemView> = {}): DirectiveItemView {
  return {
    id: "d-1",
    target: "approval",
    action: { kind: "allow", resource: DOMAIN_RESOURCE },
    scope: {},
    until: "session",
    status: "active",
    createdAt: "2026-11-04T00:00:00.000Z",
    consumer: "download",
    ...over,
  };
}

function listOf(items: Partial<Record<string, DirectiveItemView[]>> = {}) {
  return {
    active: [],
    consumed: [],
    revoked: [],
    expired: [],
    ...items,
  };
}

test("judge 结果行：cardKind=download 复用既有审批组标签与「已代批」headline，不含原始 token", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    const view = governanceJudgeResultView(
      {
        version: 1,
        group: "approval",
        cardKind: "download",
        engine: "claude",
        requestTitle: "下载文件申请",
        toolCallId: "gov-call",
        requestId: "gov-req",
      },
      locale,
    );
    assert.ok(view, "download 结果行必须可渲染");
    assert.equal(view!.group, "approval");
    assert.equal(view!.cardKind, "download");
    assert.equal(view!.kindClass, "generic");
    assert.equal(view!.groupLabel, translate(locale, "ui.judge.mode.approval"));
    assert.equal(view!.badge, translate(locale, "ui.judge.mode.approval"));
    assert.equal(view!.headline, translate(locale, "ui.judge.headline.autoApproved"));
    assert.equal(view!.headline.includes("download"), false);
    assert.equal(view!.requestTitle, "下载文件申请");
    assert.equal(view!.details.toolCallId, "gov-call");
    assert.equal(view!.details.requestId, "gov-req");
  }

  // 其它未知卡种行为不变（仍使用带 cardKind 的既有文案）。
  const unknown = governanceJudgeResultView({
    group: "approval",
    cardKind: "mystery",
  });
  assert.ok(unknown);
  assert.equal(
    unknown!.headline,
    translate("zh-CN", "ui.judge.headline.autoApprovedWithKind", {
      cardKind: "mystery",
    }),
  );
});

test("指令面板 consumer：download 标签、旧 domain 标注、path 旧文案保留（形状 A）", () => {
  // A2 最终 37 key（main 35 + ui 2）中的两个 ui key；不消费 downloadStartsNow。
  assert.equal(
    consumerLabelKey("download"),
    "ui.directive.panel.consumer.download",
  );
  assert.equal(
    translate("zh-CN", "ui.directive.panel.consumer.download"),
    "消费者：下载",
  );
  assert.equal(
    translate("en-US", "ui.directive.panel.consumer.download"),
    "Consumer: download",
  );
  assert.equal(
    translate("zh-CN", "ui.directive.panel.consumer.downloadLegacyOff"),
    "不作用于下载（早于下载功能启用）",
  );

  // 严格解析：consumer:"download" 的 domain 条目必须被保留（否则整条指令被静默丢弃）。
  const list = asDirectiveListView(listOf({ active: [directiveItem()] }));
  assert.ok(list);
  assert.equal(list!.active.length, 1);

  const downloadRow = directiveRowView(list!.active[0]!);
  assert.equal(downloadRow.consumerKey, "ui.directive.panel.consumer.download");
  assert.equal(downloadRow.resourceNoteKey, null);

  // G8 A 形状 A：B1 list() 投影把旧 domain 指令置为 consumer:"none" ⇒ 显示旧指令标注。
  const legacyRow = directiveRowView(directiveItem({ consumer: "none" }));
  assert.equal(
    legacyRow.consumerKey,
    "ui.directive.panel.consumer.downloadLegacyOff",
  );

  // path 仍无消费者：保持既有 none 标签与资源 note。
  const pathRow = directiveRowView(
    directiveItem({
      consumer: "none",
      action: { kind: "allow", resource: PATH_RESOURCE },
    }),
  );
  assert.equal(pathRow.consumerKey, "ui.directive.panel.consumer.none");
  assert.equal(
    pathRow.resourceNoteKey,
    "main.directive.receipt.noConsumerSuffix",
  );

  // 既有消费者映射零变化。
  const shellRow = directiveRowView(
    directiveItem({
      consumer: "shell-gate",
      action: {
        kind: "allow",
        resource: { type: "shell", command: "npm test", cwd: "/proj" },
      },
    }),
  );
  assert.equal(shellRow.consumerKey, "ui.directive.panel.consumer.shellGate");
  const decisionCardRow = directiveRowView(
    directiveItem({
      target: "decision",
      action: { kind: "select-recommended" },
      consumer: "decision-card",
    }),
  );
  assert.equal(
    decisionCardRow.consumerKey,
    "ui.directive.panel.consumer.decisionCard",
  );
});

test("下载卡复用既有 confirm 渲染：字段逐字保留、低风险确认、不进入 decision 卡面", () => {
  const preview = [
    "申请角色：role-a",
    "用途：下载月度报表",
    "URL：https://example.com/report.csv",
    "主机：example.com",
    "已解析 IP：93.184.216.34",
    "预期文件名：report.csv",
    "大小策略：≤ 100 MB（实际大小未知，直至收到响应）",
    "重定向策略：仅同域跟随；跨域重定向将中止并要求重新申请",
  ].join("\n");
  const payload = {
    id: "op-dl-1",
    roleId: "role-a",
    judgeNotice: "判断器无法核对申请事实，已转客户确认。",
    request: {
      kind: "confirm",
      cardKind: "download",
      title: "下载文件申请",
      preview,
      detail: "安全摘要：协议校验通过；主机与解析 IP 均为公网地址。",
    },
  };

  const view = decisionView(payload);
  assert.equal(view.kind, "confirm");
  assert.equal(view.cardKind, "download");
  assert.equal(view.answerable, true);
  assert.equal(view.priority, 3);
  assert.equal(view.destructive, false);
  assert.equal(view.acceptance, false);
  assert.equal(view.title, "下载文件申请");
  assert.equal(view.preview, preview);
  assert.equal(
    view.detail,
    "安全摘要：协议校验通过；主机与解析 IP 均为公网地址。",
  );
  assert.equal(view.judgeNotice, "判断器无法核对申请事实，已转客户确认。");

  // decision-card.ts 只认 cardKind="decision"：下载卡不获得 decision 卡面。
  const card = decisionCardView(payload.request);
  assert.equal(card.decision, false);
  assert.equal(card.title, "");
  assert.equal(card.notApprovalBadge, "");
});
