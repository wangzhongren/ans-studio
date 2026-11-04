// test/桌面UI/directive-dialog.test.ts
// 客户授权平面 C2：确认对话框纯视图 / 冻结载荷窄化 / 撤销识别 / 高危映射 /
// AC-22 卡内入口 target 严格 fail-closed / 渲染源码守卫。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDirectiveMarker } from "../../src/model/directive-marker.ts";
import {
  DIRECTIVE_APPROVAL_MARKER,
  DIRECTIVE_DECISION_MARKER,
  asDirectiveConfirmRequest,
  cardDirectiveTarget,
  directiveConfirmValues,
  directiveDialogView,
  directiveRevokeTarget,
} from "../../app/renderer/src/stores/directive-store.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RENDERER = join(ROOT, "app", "renderer", "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const SHELL_ACTION = {
  kind: "allow",
  resource: { type: "shell", command: "npm test", cwd: "/proj" },
} as const;

function confirmPayload(
  request: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    request: {
      id: "req-1",
      target: "approval",
      rawText: "@审批 允许 npm test",
      projectRoot: "/proj",
      roleId: "A",
      runtime: "claude",
      prefill: {
        action: SHELL_ACTION,
        scope: {},
        until: "once",
        unrecognized: [],
      },
      highRisk: { reasons: [] },
      confirmable: true,
      decisionGroupEnabled: false,
      ...request,
    },
  };
}

function parsed(request: Record<string, unknown> = {}) {
  const view = asDirectiveConfirmRequest(confirmPayload(request));
  assert.ok(view, "frozen confirm payload should parse");
  return view;
}

test("确认请求冻结载荷：字段齐全才接受；非法 runtime/confirmable/action 一律拒绝", () => {
  assert.equal(parsed().id, "req-1");
  assert.equal(
    asDirectiveConfirmRequest(confirmPayload({ confirmable: "yes" })),
    null,
  );
  assert.equal(
    asDirectiveConfirmRequest(confirmPayload({ runtime: "other" })),
    null,
  );
  assert.equal(
    asDirectiveConfirmRequest(
      confirmPayload({
        prefill: {
          action: { kind: "allow", resource: { type: "file", path: "/x" } },
          scope: {},
          until: "once",
          unrecognized: [],
        },
      }),
    ),
    null,
  );
  assert.equal(asDirectiveConfirmRequest({ version: 2, request: {} }), null);
});

test("审批 shell 视图：原文/动作/范围/资源/期限全部来自冻结载荷", () => {
  const view = directiveDialogView(parsed());
  assert.equal(view.titleKey, "ui.directive.dialog.titleApproval");
  assert.equal(view.rawText, "@审批 允许 npm test");
  assert.equal(view.actionKey, "ui.directive.dialog.action.allow");
  assert.equal(view.actionDetail, "");
  assert.equal(view.scopeKey, "ui.directive.dialog.scope.project");
  assert.deepEqual(view.scopeParams, {});
  assert.equal(view.scopeNoteKey, "ui.directive.dialog.scope.projectNote");
  assert.equal(view.resourceKey, "ui.directive.dialog.resource.shell");
  assert.deepEqual(view.resourceParams, { command: "npm test" });
  assert.equal(view.resourceNoteKey, null);
  assert.equal(view.untilKey, "ui.directive.panel.until.once");
  assert.equal(view.highRiskVisible, false);
  assert.equal(view.isRevoke, false);
  assert.equal(view.confirmable, true);
});

test("决策视图：flow 范围 / select-option 详情 / 「替我决策」开关状态只读展示", () => {
  const view = directiveDialogView(
    parsed({
      target: "decision",
      rawText: "@决策 flow=flow-a 选 方案B",
      prefill: {
        action: { kind: "select-option", selector: "方案B" },
        scope: { flowId: "flow-a" },
        until: "session",
        unrecognized: [],
      },
      decisionGroupEnabled: true,
    }),
  );
  assert.equal(view.titleKey, "ui.directive.dialog.titleDecision");
  assert.equal(view.scopeKey, "ui.directive.dialog.scope.flow");
  assert.deepEqual(view.scopeParams, { flowId: "flow-a" });
  assert.equal(view.actionKey, "ui.directive.dialog.action.selectOption");
  assert.equal(view.actionDetail, "方案B");
  assert.equal(view.resourceKey, null);
  assert.equal(view.untilKey, "ui.directive.panel.until.session");
  assert.equal(view.decisionGroupEnabled, true);
});

test("domain 不再标注「暂无消费者」（下载消费者已上线）；path 仍如实标注；decision 无 flow 用 allFlows", () => {
  const domain = directiveDialogView(
    parsed({
      prefill: {
        action: {
          kind: "deny",
          resource: { type: "domain", host: "*.example.com", wildcard: true },
        },
        scope: {},
        until: "forever",
        unrecognized: [],
      },
    }),
  );
  assert.equal(domain.resourceKey, "ui.directive.dialog.resource.domain");
  assert.deepEqual(domain.resourceParams, { host: "*.example.com" });
  assert.equal(domain.resourceNoteKey, null);
  assert.equal(domain.actionKey, "ui.directive.dialog.action.reject");

  const path = directiveDialogView(
    parsed({
      prefill: {
        action: {
          kind: "allow",
          resource: { type: "path", path: "/outside" },
        },
        scope: {},
        until: "once",
        unrecognized: [],
      },
    }),
  );
  assert.equal(path.resourceKey, "ui.directive.dialog.resource.path");
  assert.deepEqual(path.resourceParams, { path: "/outside" });
  assert.equal(path.resourceNoteKey, "main.directive.receipt.noConsumerSuffix");

  const decision = directiveDialogView(
    parsed({
      target: "decision",
      prefill: {
        action: { kind: "reject" },
        scope: {},
        until: "once",
        unrecognized: [],
      },
    }),
  );
  assert.equal(decision.scopeKey, "ui.directive.dialog.scope.allFlows");
  assert.equal(decision.scopeNoteKey, "ui.directive.dialog.scope.projectNote");
});

test("高危原因：七个稳定码映射 A3 key；未知码透传不吞；confirmable=false 保持禁用位", () => {
  const view = directiveDialogView(
    parsed({
      highRisk: {
        reasons: [
          "forever",
          "project-decision-reject",
          "project-decision-select-option",
          "wildcard-domain",
          "wide-path",
          "wide-command",
          "switch-off-project-recommended",
          "future-code",
        ],
      },
      confirmable: false,
    }),
  );
  assert.deepEqual(
    view.highRisk.map((item) => item.key),
    [
      "ui.directive.highRisk.forever",
      "ui.directive.highRisk.projectReject",
      "ui.directive.highRisk.projectSelect",
      "ui.directive.highRisk.wildcardDomain",
      "ui.directive.highRisk.broadPath",
      "ui.directive.highRisk.broadCommand",
      "ui.directive.highRisk.switchOffProjectSelect",
      "ui.directive.highRisk.unknown",
    ],
  );
  assert.deepEqual(view.highRisk[7]!.params, { reason: "future-code" });
  assert.equal(view.confirmable, false);
});

test("空正文仍可进入确认视图（确认禁用由 C1 confirmable 决定）", () => {
  const view = directiveDialogView(
    parsed({ rawText: "@审批", confirmable: false }),
  );
  assert.equal(view.rawText, "@审批");
  assert.equal(view.confirmable, false);
});

test("回包 values：只按预填快照，勾选风险才附 acknowledged:true", () => {
  const request = parsed({
    prefill: {
      action: { kind: "select-recommended" },
      scope: { flowId: "flow-a" },
      until: "forever",
      unrecognized: [],
    },
    target: "decision",
    highRisk: { reasons: ["forever"] },
  });
  assert.deepEqual(directiveConfirmValues(request, false), {
    action: { kind: "select-recommended" },
    scope: { flowId: "flow-a" },
    until: "forever",
  });
  assert.deepEqual(directiveConfirmValues(request, true), {
    action: { kind: "select-recommended" },
    scope: { flowId: "flow-a" },
    until: "forever",
    acknowledged: true,
  });
});

test("输入式撤销：按 rawText/unrecognized 识别 #d-<seq>，渲染 revoke 字段", () => {
  const request = parsed({
    rawText: "@审批 撤销 #d-3",
    prefill: {
      action: SHELL_ACTION,
      scope: {},
      until: "once",
      unrecognized: ["撤销 #d-3"],
    },
  });
  assert.equal(directiveRevokeTarget(request), "d-3");
  const view = directiveDialogView(request);
  assert.equal(view.isRevoke, true);
  assert.equal(view.actionKey, "ui.directive.dialog.action.revoke");
  assert.equal(view.revokeTarget, "#d-3");
  assert.equal(view.resourceKey, null);

  // 仅 unrecognized 携带撤销目标（rawText 解析不到的边界）也可识别。
  const fallback = parsed({
    rawText: "@审批 撤销 #d-9",
    prefill: {
      action: SHELL_ACTION,
      scope: {},
      until: "once",
      unrecognized: ["撤销 #d-9"],
    },
  });
  assert.equal(directiveRevokeTarget(fallback), "d-9");

  assert.equal(
    directiveRevokeTarget(
      parsed({
        rawText: "@审批 撤销一下",
        prefill: {
          action: SHELL_ACTION,
          scope: {},
          until: "once",
          unrecognized: [],
        },
      }),
    ),
    "",
  );
});

test("AC-22 target：只认卡载荷 projectRoot/roleId/runtime；缺失/非法/跨项目/跨引擎 fail-closed", () => {
  const view = { projectRoot: "/proj", runtime: "claude" };
  const payload = { projectRoot: "/proj", roleId: "A", runtime: "claude" };
  const ok = cardDirectiveTarget(payload, view);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.target, {
      projectRoot: "/proj",
      roleId: "A",
      runtime: "claude",
    });
  }

  assert.equal(cardDirectiveTarget({ ...payload, projectRoot: "" }, view).ok, false);
  assert.equal(cardDirectiveTarget({ ...payload, roleId: "" }, view).ok, false);
  assert.equal(cardDirectiveTarget({ ...payload, runtime: undefined }, view).ok, false);
  assert.equal(cardDirectiveTarget({ ...payload, runtime: "bad" }, view).ok, false);
  assert.equal(cardDirectiveTarget({ ...payload, projectRoot: "/other" }, view).ok, false);
  assert.equal(cardDirectiveTarget({ ...payload, runtime: "pi" }, view).ok, false);
  assert.equal(cardDirectiveTarget(payload, { projectRoot: null, runtime: "claude" }).ok, false);
  assert.equal(cardDirectiveTarget(null, view).ok, false);
});

test("A1 标记常量与共享解析器一致（模板占位符按数据渲染）", () => {
  assert.equal(parseDirectiveMarker(DIRECTIVE_APPROVAL_MARKER)?.target, "approval");
  assert.equal(parseDirectiveMarker(DIRECTIVE_DECISION_MARKER)?.target, "decision");
  assert.equal(
    parseDirectiveMarker(DIRECTIVE_APPROVAL_MARKER + " " + DIRECTIVE_DECISION_MARKER)
      ?.target,
    "approval",
  );
});

test("源码守卫：Composer 只在能力位 true 且解析命中时抑制；res.directive/取消不画气泡", () => {
  const source = read("app/renderer/src/shell/Composer.tsx");
  const markerCall = source.indexOf("parseDirectiveMarker(rawDraft)");
  const append = source.indexOf("appendLocalUser(roleId, displayText, clientMessageId)");
  assert.ok(markerCall > 0, "Composer must use the shared parser for suppression");
  assert.ok(append > markerCall, "suppression decision precedes appendLocalUser");
  assert.ok(source.includes("ensureInitialRead(projectRoot)"));
  assert.ok(source.includes("directivesEnabled === true"));
  assert.ok(source.includes("res.directiveCancelled === true"));
  assert.ok(source.includes("resultRecord(res.directive)"));
  assert.ok(source.includes("removeOptimisticUserMessage"));
  assert.ok(source.includes('id="btn-directive-panel"'));
});

test("源码守卫：三张 shell 卡页脚入口 / overlay 让位 / target 只取卡载荷 / 不调用 shell 应答", () => {
  const card = read("app/renderer/src/shell/ConfirmCard.tsx");
  assert.ok(card.includes('prefix="sc"'));
  assert.ok(card.includes('prefix="se"'));
  assert.ok(card.includes('prefix="rc"'));
  assert.ok(card.includes('id={prefix + "-directive-entry"}'));
  assert.ok(card.includes('id={prefix + "-directive-input"}'));
  assert.ok(card.includes('id={prefix + "-directive-submit"}'));
  assert.ok(card.includes('id={prefix + "-directive-panel-open"}'));
  assert.ok(card.includes("cardDirectiveTarget(payload, { projectRoot, runtime })"));
  assert.ok(card.includes("isDirectiveOverlayOpen"));
  assert.ok(card.includes("if (directiveOverlayOpen) return;"));
  assert.ok(card.includes("collapseCardEntry(expandedCardEntryId)"));

  const entryStart = card.indexOf("function CardDirectiveEntry");
  const entryEnd = card.indexOf("function ShellConfirmCard");
  assert.ok(entryStart > 0 && entryEnd > entryStart);
  const entry = card.slice(entryStart, entryEnd);
  assert.equal(entry.includes("respondShell"), false);
  assert.equal(entry.includes("respondRecovery"), false);
  assert.equal(entry.includes("respondEscalation"), false);
  assert.equal(entry.includes("selectedRoleId"), false);
  assert.ok(entry.includes("bridge?.sendSession"));
  assert.ok(entry.includes("payload"));
});

test("源码守卫：CSS 层级 90/95、既有 .sc-overlay 仍为 60", () => {
  const css = read("app/renderer/src/shell/shell.css");
  assert.match(css, /\.directive-dialog-overlay\s*\{[^}]*z-index:\s*90/s);
  assert.match(css, /\.directive-panel-overlay\s*\{[^}]*z-index:\s*95/s);
  const shellOverlay = /\.sc-overlay\s*\{([^}]*)\}/.exec(css);
  assert.ok(shellOverlay);
  assert.match(shellOverlay![1]!, /z-index:\s*60/);
  assert.ok(css.includes(".sc-directive-entry"));
  assert.ok(css.includes(".sc-directive-input"));
});

test("源码守卫：渲染新文件零 Han（注释除外）", () => {
  const files = [
    "app/renderer/src/stores/directive-store.ts",
    "app/renderer/src/chat/directive-dialog.tsx",
    "app/renderer/src/chat/directive-panel.tsx",
    "app/renderer/src/chat/ipc.ts",
    "app/renderer/src/shell/Composer.tsx",
    "app/renderer/src/shell/ConfirmCard.tsx",
  ];
  const strip = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const han = /\p{Script=Han}/u;
  for (const file of files) {
    const code = strip(read(file));
    assert.equal(han.test(code), false, file + " contains hardcoded Han outside comments");
  }
});
