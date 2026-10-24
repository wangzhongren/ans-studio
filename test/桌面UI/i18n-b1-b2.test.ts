// test/桌面UI/i18n-b1-b2.test.ts
// i18n B1/B2：渲染层文案迁移证据。
//
// 两层证据：
//  1) 纯逻辑在 en-US 下的真实输出（由 shared 目录计算，不是复制的第三份文案）；
//  2) 源码扫描：已迁移文件在去除注释后不再含 Han 字符；仍含中文的文件是
//     已登记的机器匹配/共享 key 缺口（PM 收紧 allowlist 时按此清单处理）。
//
// 旧 zh-CN 断言仍在各原测试文件中逐字通过；本文件只新增 en-US 与源码证据。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { statusBadge } from "../../app/renderer/src/chat/status.ts";
import {
  governanceView,
  groupRoles,
  roleDisplayName,
  roleSubtitle,
} from "../../app/renderer/src/chat/role-view.ts";
import {
  queueTitle,
  reportDeclaration,
  workTitle,
  profileTitle,
} from "../../app/renderer/src/chat/work-view.ts";
import {
  clientImageProblem,
  queueItemViews,
  withdrawOutcome,
} from "../../app/renderer/src/chat/confirm-logic.ts";
import {
  governanceInvalidText,
  governanceModelStatusText,
  governanceReacceptSuccessText,
} from "../../app/renderer/src/chat/governance-view.ts";
import {
  applicationLabel,
  configWarningText,
  fieldLabelText,
  savedStatusText,
  saveFailureStatusText,
  sourceLabel,
} from "../../app/renderer/src/chat/runtime-config.ts";
import {
  deliveryBatchFacts,
  deliveryBatchTitle,
  historyProjectionText,
  persistenceView,
} from "../../app/renderer/src/chat/report-view.ts";
import {
  documentErrorText,
  documentStatusText,
} from "../../app/renderer/src/chat/document-view.ts";
import {
  activityPhaseLabel,
  foldSummaryText,
} from "../../app/renderer/src/chat/tool-summary.ts";
import { reasoningLabel } from "../../app/renderer/src/chat/reasoning.ts";
import { operatorFinalNote } from "../../app/renderer/src/chat/operator-view.ts";
import {
  JUDGE_GROUP_APPROVAL,
  governanceJudgeResultView,
  judgeToggleView,
  shellConfirmTitle,
  suApprovalTierLabel,
} from "../../app/renderer/src/chat/judge.ts";
import { classifyInjected, toolStatus } from "../../app/renderer/src/chat/events.ts";
import { findHan, toRepoPath } from "../项目管理/shared/i18n-guard-scanner.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("B1 纯逻辑 en-US：状态/角色/工作概览/确认/治理/设置", () => {
  assert.equal(statusBadge("working", 2, "en-US").label, "Working · 2 pending");
  assert.equal(statusBadge("stopped", 0, "en-US").label, "Stopped");

  assert.equal(roleDisplayName(null, "en-US"), "No role selected");
  const lead = governanceView("liaison", "en-US");
  assert.equal(lead?.name, "Lead");
  assert.equal(lead?.power, "Customer communication · no final approval power");
  assert.equal(lead?.builtinNote, "Built-in role: shipped with the app, no role directory");
  assert.equal(
    roleSubtitle({ roleId: "x", builtIn: true } as never, "en-US"),
    "Built-in governance role (see SKILL.md)",
  );
  assert.equal(
    roleSubtitle(
      { roleId: "x", cardText: "", boundary: { entries: [{}] } } as never,
      "en-US",
    ),
    "1 boundary entry",
  );
  assert.equal(
    roleSubtitle(
      { roleId: "x", cardText: "", boundary: { entries: [{}, {}] } } as never,
      "en-US",
    ),
    "2 boundary entries",
  );
  assert.deepEqual(
    groupRoles([{ roleId: "p" }, { roleId: "w" }] as never, "p", "en-US").map(
      (group) => group.label,
    ),
    ["Primary", "Work roles"],
  );

  assert.equal(workTitle("A", "en-US"), "A · Work overview");
  assert.equal(profileTitle("A", "en-US"), "A · Role profile");
  assert.equal(queueTitle("A", "en-US"), "A · Queue");
  assert.equal(
    reportDeclaration({ origin: "submitted-report", status: "completed" }, "en-US"),
    "Reported by the report: Completed",
  );

  const dispatch = queueItemViews(
    [{ id: "1", kind: "dispatch", sourceRoleId: "B", summary: "s" }],
    null,
    "en-US",
  );
  assert.equal(dispatch[0].sourceLabel, "Dispatch · from B");
  assert.equal(dispatch[0].position, "1");
  assert.equal(
    withdrawOutcome({ ok: false, error: "busy" }, "en-US").text,
    "Withdrawal had no effect: busy",
  );
  assert.equal(
    clientImageProblem({ type: "image/svg+xml", size: 1 }, "en-US"),
    "Unsupported image type: image/svg+xml — only png / jpeg / webp / gif are supported.",
  );

  assert.equal(
    governanceModelStatusText("trio", "en-US"),
    "Governance model: Trio · five roles",
  );
  assert.equal(
    governanceInvalidText("", "en-US"),
    "Governance record unavailable: Reason not provided; this version does not overwrite automatically",
  );
  assert.equal(
    governanceReacceptSuccessText(9, 1, "en-US"),
    "Re-accepted: updated 1 pins (9 total); wrote .ans/project.json and docs/bootstrap-manifest.md. The project is usable again.",
  );

  assert.equal(
    configWarningText("Pi", ["A", "B"], "en-US"),
    "Pi configuration is incomplete; missing: A, B. Fill it in before saving.",
  );
  assert.equal(
    applicationLabel("after-active-turn", "en-US"),
    "The current turn keeps the old configuration; the next input uses the new one.",
  );
  assert.equal(
    fieldLabelText({ key: "K", label: "Token", required: true }, "en-US"),
    "Token · Required",
  );
  assert.equal(
    sourceLabel({ key: "K", source: "fallback", fallbackKey: "OPENAI_API_KEY" }, "en-US"),
    "Fallback (OPENAI_API_KEY)",
  );
  assert.equal(
    savedStatusText([], [], "current", "en-US"),
    "Saved to .env (no keys changed). Required configuration is complete. The current configuration is applied.",
  );
  assert.equal(
    savedStatusText(["A", "B"], ["C"], "next-session", "en-US"),
    "Saved to .env (2 changed keys). Required configuration still missing 1 items (see above).Applied when the next session opens.",
  );
  assert.equal(
    saveFailureStatusText("", "en-US"),
    "Save failed: Unknown error",
  );
});

test("B2 纯逻辑 en-US：报告/文档/工具/推理/操作者/判断/事件", () => {
  assert.equal(persistenceView({ state: "saved" }, false, "en-US").text, "Report saved");
  assert.deepEqual(persistenceView({ state: "saved" }, false), {
    text: "报告已保存",
    kind: "ok",
    retry: false,
  });
  assert.equal(
    deliveryBatchTitle(2, "en-US"),
    "Handback delivery · 2 in this batch (not all received)",
  );
  assert.equal(
    historyProjectionText({ reportErrors: [{}] }, "en-US"),
    "Unreadable report records: 1",
  );
  assert.equal(
    persistenceView({ state: "pending" }, true, "en-US").text,
    "Saving history…",
  );
  assert.equal(
    deliveryBatchFacts(null, { state: "pending" }, "en-US").history,
    "Saving history…",
  );

  assert.equal(documentErrorText("NOT_FOUND", "en-US"), "Document not found.");
  assert.equal(
    documentStatusText({ byteLength: 5 } as never, "en-US"),
    "Read-only document · 5 bytes",
  );

  assert.equal(activityPhaseLabel({ status: "denied" } as never, "en-US"), "Denied");
  assert.equal(
    foldSummaryText(
      {
        calls: 2,
        denied: 1,
        failed: 0,
        unknown: false,
        tools: [{ name: "read_file", count: 2 }],
      },
      "en-US",
    ),
    "This turn: 2 tool calls: read_file ×2 · 1 not approved",
  );

  assert.equal(
    reasoningLabel({ status: "complete", durationMs: 2000 }, "en-US"),
    "Thought for 2s",
  );
  assert.equal(
    reasoningLabel({ status: "omitted", durationMs: 2000 }, "en-US"),
    "Thought for 2s (content omitted by the platform)",
  );

  assert.equal(
    operatorFinalNote({ kind: "confirm", confirmed: false }, "en-US"),
    "Replied “Disagree” (not approved).",
  );

  const toggle = judgeToggleView(JUDGE_GROUP_APPROVAL, true, false, false, null, "en-US");
  assert.equal(toggle.label, "Approve for me");
  assert.equal(suApprovalTierLabel("deny", "en-US"), "Hard-deny class (deny)");
  assert.equal(shellConfirmTitle("project", "A", "en-US"), "shell command request");
  assert.equal(
    shellConfirmTitle("su-approval", "verifier", "en-US"),
    "Command approval · Proof",
  );
  const overflow = governanceJudgeResultView(
    {
      group: "approval",
      cardKind: "write",
      paths: ["a", "b", "c", "d"],
    },
    "en-US",
  );
  assert.equal(
    overflow?.headline,
    "Confirm writing 4 paths (a, b, c, etc.)",
  );

  const injected = classifyInjected("[派发] hello", "en-US");
  assert.equal(injected?.kind, "dispatch");
  assert.equal(injected?.label, "Dispatched task");
  assert.equal(toolStatus({ denied: true }, "en-US").statusText, "Not approved");
});

test("迁移文件清单：去除注释后已无 Han；残余文件仅为已登记例外", () => {
  const migrated = [
    "app/renderer/src/App.tsx",
    "app/renderer/src/main.tsx",
    "app/renderer/src/shell/TitleBar.tsx",
    "app/renderer/src/shell/Composer.tsx",
    "app/renderer/src/shell/ConfirmCard.tsx",
    "app/renderer/src/shell/Drawer.tsx",
    "app/renderer/src/shell/EngineSelect.tsx",
    "app/renderer/src/shell/SettingsPanel.tsx",
    "app/renderer/src/shell/GovernancePanel.tsx",
    "app/renderer/src/shell/ReportCard.tsx",
    "app/renderer/src/shell/DocumentView.tsx",
    "app/renderer/src/shell/ProfilePanel.tsx",
    "app/renderer/src/shell/QueuePanel.tsx",
    "app/renderer/src/shell/WorkOverview.tsx",
    "app/renderer/src/shell/QueueSubview.tsx",
    "app/renderer/src/chat/status.ts",
    "app/renderer/src/chat/runtime-config.ts",
    "app/renderer/src/chat/role-view.ts",
    "app/renderer/src/chat/governance-view.ts",
    "app/renderer/src/chat/work-view.ts",
    "app/renderer/src/chat/confirm-logic.ts",
    "app/renderer/src/stores/confirm-store.ts",
    "app/renderer/src/stores/settings-store.ts",
    "app/renderer/src/stores/drawer-store.ts",
    "app/renderer/src/stores/governance-store.ts",
    "app/renderer/src/stores/report-store.ts",
    "app/renderer/src/chat/ChatRow.tsx",
    "app/renderer/src/chat/ChatStream.tsx",
    "app/renderer/src/chat/chat-store.ts",
    "app/renderer/src/chat/document-view.ts",
    "app/renderer/src/chat/judge.ts",
    "app/renderer/src/chat/markdown.ts",
    "app/renderer/src/chat/operator-view.ts",
    "app/renderer/src/chat/reasoning.ts",
    "app/renderer/src/chat/report-view.ts",
    "app/renderer/src/chat/tool-summary.ts",
  ];
  for (const path of migrated) {
    const hits = findHan(readFileSync(join(ROOT, ...path.split("/")), "utf8"));
    assert.deepEqual(hits, [], `${path} still has code-level Han: ${JSON.stringify(hits)}`);
  }

  // 已登记例外（供 PM 收紧 allowlist；原因见变更记录）：
  //  · 机器匹配/协议前缀：events.ts（regex + [系统·]/【系统通知】/[派发]/[回交]/用户指令：）
  //  · 主进程文本解析：ChatHeader（恢复失败：前缀；待 B3 结构化）
  //  · 角色数据值：Sidebar（groupDuty === "组长"）
  //  · 完全非目标：test-driver.ts（不在本清单内）
  const residual = {
    "app/renderer/src/shell/Sidebar.tsx": "角色数据值 groupDuty=组长",
    "app/renderer/src/shell/ChatHeader.tsx": "恢复失败：主进程文本解析前缀",
    "app/renderer/src/chat/events.ts": "机器匹配正则/协议前缀",
  };
  for (const [path, reason] of Object.entries(residual)) {
    const hits = findHan(readFileSync(join(ROOT, ...path.split("/")), "utf8"));
    assert.ok(hits.length > 0, `${path} should be residual (${reason})`);
  }
});

test("渲染层只经 facade 消费 shared i18n（facade/store 除外）", () => {
  const files = [
    "app/renderer/src/chat/ChatRow.tsx",
    "app/renderer/src/chat/ChatStream.tsx",
    "app/renderer/src/shell/SettingsPanel.tsx",
    "app/renderer/src/shell/TitleBar.tsx",
    "app/renderer/src/stores/settings-store.ts",
  ];
  for (const path of files) {
    const source = readFileSync(join(ROOT, ...path.split("/")), "utf8");
    assert.equal(
      source.includes("src/common/shared/i18n"),
      false,
      `${path} imports shared i18n directly`,
    );
    assert.match(source, /from "@\/i18n"|from "\.\.\/i18n\/index\.ts"/, path);
  }
  // facade 与 locale-store 是唯一直接导入 shared 的渲染层文件。
  assert.equal(toRepoPath(ROOT, join(ROOT, "app", "renderer", "src", "i18n", "index.ts")),
    "app/renderer/src/i18n/index.ts");
});

test("PM 补齐的缺口 key 已接线（ChatHeader/QueueSubview/设置/确认/治理/判断/报告）", () => {
  const read = (path: string) => readFileSync(join(ROOT, ...path.split("/")), "utf8");
  const cases: Array<[string, string]> = [
    ["app/renderer/src/shell/ChatHeader.tsx", 't("ui.chatHeader.tabWork")'],
    ["app/renderer/src/shell/ChatHeader.tsx", 't("ui.chatHeader.tabCard")'],
    ["app/renderer/src/shell/QueueSubview.tsx", 't("ui.chatHeader.tabCard")'],
    ["app/renderer/src/shell/QueueSubview.tsx", 't("ui.chatHeader.tabWork")'],
    ["app/renderer/src/chat/runtime-config.ts", '"ui.runtimeConfig.unknownError"'],
    ["app/renderer/src/chat/runtime-config.ts", '"ui.settings.saveNoteNoChanges"'],
    ["app/renderer/src/stores/confirm-store.ts", '"ui.confirm.expiredShell"'],
    ["app/renderer/src/stores/governance-store.ts", '"ui.governanceStore.stepFallback"'],
    ["app/renderer/src/chat/judge.ts", '"ui.judge.roleName.liaison"'],
    ["app/renderer/src/chat/judge.ts", '"ui.judge.roleName.verifier"'],
    ["app/renderer/src/chat/judge.ts", '"ui.judge.headline.writeConfirmOverflow"'],
    ["app/renderer/src/chat/report-view.ts", '"ui.reportView.savingHistory"'],
  ];
  for (const [path, needle] of cases) {
    assert.ok(read(path).includes(needle), `${path} missing ${needle}`);
  }
});
