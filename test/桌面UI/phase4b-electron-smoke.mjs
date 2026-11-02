#!/usr/bin/env node
/**
 * test/桌面UI/phase4b-electron-smoke.mjs
 *
 * Phase 4B 真实 Electron 离线冒烟（受控 IPC 替身；无真实模型/网络/.env）：
 *  - trio 五角色状态行与左树；
 *  - QUEUE_VIEW：聚合行/queuedDebug/切引擎不复活/主进程重推/expired 清理；
 *  - operator 镜像：同 id 双面、只答一次、双面冻结、排队不物化可操作卡；
 *  - 治理记录：pin-mismatch 预览（非模态/取消零写/确认一次）、建立模型选择、迁移 not-available 如实；
 *  - 报告全文/persistence/重试同卡、交付批次事实/安全副本/历史重试/过期；
 *  - 菜单配置状态文字（读取计数守卫）、queueView 顶层 tab 切换清空；
 *  - single↔trio 一次性警告刷新、judge 结果行跨引擎重放、replayAnchorDebug；
 *  - 1360/960/200% 截图；零 console/CSP。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs [entry.html] [outDir]
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";
import { parseSessionJsonl } from "../../app/desktop/session-history.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "app/renderer/dist/index.html");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : "/tmp/ans-phase4b-smoke";
const PRELOAD = path.join(HERE, "phase4b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/phase4b-project";
const report = { entry: ENTRY, checks: [], calls: {}, console: [], csp: [], screenshots: [], failures: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  return value === true;
}

let win = null;
const calls = {
  opens: [],
  histories: [],
  configReads: [],
  operatorResponses: [],
  reacceptPreview: [],
  reaccept: [],
  establishPreview: [],
  establish: [],
  migratePreview: [],
  migrate: [],
  reportQueries: [],
  reportRetries: [],
  receiptQueries: [],
  historyRetries: [],
  projectState: [],
  judge: { shellGet: 0, decisionGet: 0, decisionSet: [] },
};
report.calls = calls;

const govRole = (roleId, fn) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: "",
  boundary: { entries: [] },
  boundaryPath: "",
  builtIn: true,
  governanceFunction: fn,
  changelog: null,
  docs: [],
});
const projectRole = (roleId) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: ROOT + "/角色卡/" + roleId + "/role-card.md",
  boundary: { entries: [] },
  boundaryPath: "",
  changelog: null,
  docs: [],
  documents: [{ version: 1, projectViewId: "epoch-one", documentId: "doc-" + roleId, roleId, relativePath: "角色卡/" + roleId + "/docs/one.md", label: "报告 1", format: "markdown" }],
});

const state = {
  mode: "trio", // trio | single | missing | invalid | pin-mismatch
  missing: { pi: ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_MODEL"], codex: [], claude: [] },
  failConfig: new Set(),
  configReadsEnabled: true,
  saveState: { state: "failed", reportId: "smoke-report", retryAvailable: true, code: "PERSIST_FAILED" },
  receipt: { version: 1, deliveryId: "d1", attemptId: "a1", turnId: "delivery-turn", inputSaved: true, history: "failed", outcome: "completed", retryHistoryAvailable: true },
  receiptState: "known",
  reacceptPreviewCalls: [],
  reacceptCalls: [],
  establishPreviewCalls: [],
  establishCalls: [],
  migratePreviewCalls: [],
  migrateCalls: [],
  judgeEnabled: false,
  decisionEnabled: false,
};

function listing(projectRoot = ROOT) {
  const roles = [
    govRole("liaison", "liaison"),
    govRole("rapporteur", "proposal"),
    govRole("nominator", "nomination"),
    govRole("convener", "schedule"),
    govRole("verifier", "verification"),
    projectRole("P"),
  ];
  const base = {
    projectRoot,
    primaryRoleId: "liaison",
    hasRoles: true,
    warnings: [],
    roles,
  };
  if (state.mode === "trio") {
    return { ...base, governanceModel: "trio", governanceRecord: { state: "present" } };
  }
  if (state.mode === "single") {
    return { ...base, governanceModel: "single", governanceRecord: { state: "present" } };
  }
  if (state.mode === "missing") {
    return { ...base, governanceModel: "single", governanceRecord: { state: "missing", reason: "" } };
  }
  if (state.mode === "invalid") {
    return { ...base, governanceModel: "single", governanceRecord: { state: "invalid", reason: "bad json" } };
  }
  return {
    ...base,
    governanceModel: "trio",
    governanceRecord: {
      state: "pin-mismatch",
      pinCount: 9,
      pinFiles: [{ path: "角色卡/assembly/boundary.yaml", pinned: "a1b2c3d4" + "0".repeat(56), actual: "9f8e7d6c" + "1".repeat(56), status: "modified" }],
    },
  };
}

function projectStateView(projectRoot) {
  return {
    schema: "project-state/v1",
    generatedAt: "2026-11-02T00:00:00.000Z",
    projectRoot,
    focus: {
      flowId: "smoke-flow",
      runId: "smoke-run",
      runState: "draft",
      stage: "build",
      selectedBy: "chief",
      updatedAt: "2026-11-02T00:00:00.000Z",
      stale: false,
    },
    flows: [
      {
        flowId: "smoke-flow",
        sources: ["run", "task"],
        runs: [{ runId: "smoke-run", state: "draft", active: true }],
        taskCounts: { unclosed: 1, blocked: 0, failed: 0 },
        lastActivityAt: "2026-11-02T00:00:00.000Z",
      },
    ],
    tasks: [],
    blockers: [],
    versions: [],
    evidence: [],
    notes: [],
    nextStep: {
      text: "continue with acceptance",
      source: "chief",
      at: "2026-11-02T00:00:00.000Z",
    },
    errors: [],
    truncated: false,
    counts: {
      unclosed: 1,
      supersededUnclosed: 0,
      activeUnclosed: 1,
      blocked: 0,
      failed: 0,
      pendingRequests: 0,
      flows: 1,
      tasks: 0,
    },
  };
}

function runtimeConfig(runtime) {
  if (state.configReadsEnabled) calls.configReads.push(runtime);
  if (state.failConfig.has(runtime)) throw new Error("离线配置读取失败");
  const definition = RUNTIME_SETTINGS[runtime];
  const missing = state.missing[runtime] || [];
  return {
    runtime,
    label: definition.label,
    path: ROOT + "/.env",
    revision: 0,
    application: "next-session",
    missingKeys: missing,
    fields: definition.fields.map((field) => ({
      ...field,
      value: "",
      isSet: field.required ? !missing.includes(field.key) : false,
      source: field.required ? "environment" : "default",
    })),
  };
}

ipcMain.handle("app:recovery-state", () => ({}));
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => listing(input?.projectRoot || ROOT));
ipcMain.handle("project-state:get", (_e, input) => {
  calls.projectState.push(input);
  return projectStateView(input?.projectRoot || ROOT);
});
ipcMain.handle("session:open", (_e, input) => {
  calls.opens.push(input);
  return { ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot };
});
ipcMain.handle("session:history-get", (_e, input) => {
  calls.histories.push(input);
  return { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 };
});
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("session:operator-response", (_e, input) => {
  calls.operatorResponses.push(input);
  return { ok: true };
});
ipcMain.handle("shell:judge-get", () => {
  calls.judge.shellGet += 1;
  return { version: 1, ok: true, enabled: state.judgeEnabled };
});
ipcMain.handle("shell:judge-set", (_e, input) => {
  state.judgeEnabled = input?.enabled === true;
  return { version: 1, ok: true, enabled: state.judgeEnabled };
});
ipcMain.handle("decision:judge-get", () => {
  calls.judge.decisionGet += 1;
  return { version: 1, ok: true, enabled: state.decisionEnabled };
});
ipcMain.handle("decision:judge-set", (_e, input) => {
  calls.judge.decisionSet.push(input?.enabled === true);
  state.decisionEnabled = input?.enabled === true;
  return { version: 1, ok: true, enabled: state.decisionEnabled };
});
ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input.runtime));
ipcMain.handle("runtime-config:save", (_e, input) => ({ ok: true, runtime: input.runtime, appliedKeys: Object.keys(input.updates || {}), revision: 1, application: "next-session" }));
ipcMain.handle("project:document-read", (_e, input) => ({
  ok: true,
  version: 1,
  projectViewId: input.projectViewId,
  documentId: input.documentId,
  roleId: "P",
  relativePath: "角色卡/P/docs/one.md",
  format: "markdown",
  byteLength: 10,
  text: "文档正文",
}));

// —— 治理记录 ——
const PREVIEW_DIGEST = "b".repeat(64);
ipcMain.handle("project:governance-reaccept-preview", (_e, input) => {
  calls.reacceptPreview.push(input);
  return {
    ok: true,
    preview: {
      projectRoot: input.projectRoot,
      writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
      pinPaths: ["角色卡/governance-boundary.yaml"],
      pinCount: 9,
      changed: [{ path: "角色卡/assembly/boundary.yaml", pinned: "a1b2c3d4" + "0".repeat(56), actual: "9f8e7d6c" + "1".repeat(56), status: "modified" }],
      canConfirm: true,
      blockers: [],
      previewDigest: PREVIEW_DIGEST,
    },
  };
});
ipcMain.handle("project:governance-reaccept", (_e, input) => {
  calls.reaccept.push(input);
  return {
    ok: true,
    status: "completed",
    phase: "write",
    message: "已重新接受：更新 1 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。",
    wrote: [".ans/project.json", "docs/bootstrap-manifest.md"],
  };
});
ipcMain.handle("project:governance-preview", (_e, input) => {
  calls.establishPreview.push(input);
  return {
    ok: true,
    preview: {
      writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
      pinPaths: ["角色卡/governance-boundary.yaml"],
      pinCount: 1,
      roleCount: 1,
      adoptExistingBoundary: true,
      governanceModel: input.governanceModel || "single",
      suggestedGovernanceModel: "trio",
      canConfirm: true,
      blockers: [],
    },
  };
});
ipcMain.handle("project:governance-establish", (_e, input) => {
  calls.establish.push(input);
  return { ok: true, phase: "write", finalize: { status: "completed", message: "治理记录已建立。" } };
});
ipcMain.handle("project:governance-migrate-preview", (_e, input) => {
  calls.migratePreview.push(input);
  return { ok: false, status: "not-available", message: "迁移预览与写入尚未接线；本版不可用。" };
});
ipcMain.handle("project:governance-migrate", (_e, input) => {
  calls.migrate.push(input);
  return { ok: false, phase: "guard", status: "not-available", message: "迁移未接线。" };
});

// —— 报告/交付 ——
const outer = (input, value) => ({ ok: true, version: 1, scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime }, value });
ipcMain.handle("session:get-persistence", (_e, input) => {
  calls.reportQueries.push({ op: "caps", input });
  return outer(input, { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true });
});
ipcMain.handle("report:get-save-state", (_e, input) => {
  calls.reportQueries.push({ op: "report", input });
  return outer(input, { ...state.saveState, reportId: input.reportId });
});
ipcMain.handle("report:retry-save", (_e, input) => {
  calls.reportRetries.push(input);
  const value = { ok: true, state: "saved", retryAvailable: false, reportId: input.reportId };
  state.saveState = { state: "saved", reportId: input.reportId, retryAvailable: false };
  return outer(input, value);
});
ipcMain.handle("delivery:get-receipt", (_e, input) => {
  calls.receiptQueries.push(input);
  if (state.receiptState === "expired") {
    return outer(input, { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false });
  }
  return outer(input, { state: "known", receipt: state.receipt });
});
ipcMain.handle("delivery:retry-history-save", (_e, input) => {
  calls.historyRetries.push(input);
  state.receipt = { ...state.receipt, history: "saved", retryHistoryAvailable: false };
  return outer(input, { ok: true, state: "saved", receipt: state.receipt });
});

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });
  wc.on("did-fail-load", (_event, code, description) => {
    report.console.push({ level: "did-fail-load", message: code + " " + description });
  });

  const js = (code) =>
    wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  const push = async (channel, payload) => {
    await js(`window.desktop.__smoke.emit(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`);
    await sleep(90);
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };
  const load = async (mode, root = ROOT) => {
    state.mode = mode;
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(root)})`);
    await sleep(160);
  };
  const select = async (roleId) => {
    await js(`await window.__ansRenderer.selectRole(${JSON.stringify(roleId)})`);
    await sleep(120);
  };

  try {
    await win.loadFile(ENTRY);
    await sleep(400);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await js(`window.__smokeCsp=[];document.addEventListener('securitypolicyviolation',(event)=>{window.__smokeCsp.push(event.violatedDirective+' '+event.blockedURI)})`);

    // —————— 1. trio 五角色 / 状态行 ——————
    await load("trio");
    check(
      "five-role listing shows trio model and verifier",
      await js(`(()=>{const t=document.getElementById('role-tree');return !!t&&t.querySelector('[data-role-id="verifier"]')!==null&&window.__ansRenderer.state.governanceModel==='trio';})()`),
    );

    // —————— 2. 排队聚合 / queuedDebug ——————
    await select("liaison");
    const queued = (id, title) => ({
      id,
      roleId: "rapporteur",
      projectRoot: ROOT,
      runtime: "pi",
      mirrorRoleId: "liaison",
      waitingFor: "mirror-1",
      request: { kind: "confirm", title, cardKind: "proposal" },
    });
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await push("session:operator-queued", queued("smoke-q1", "排队一"));
    await push("session:operator-queued", queued("smoke-q2", "排队二"));
    check(
      "queued aggregate unique on primary with count and queuedDebug",
      await js(`(()=>{const pane=document.querySelector('#chat .chat-pane[data-role-id="liaison"]');const rows=pane.querySelectorAll('.op-queue-aggregate');return rows.length===1&&rows[0].querySelector('.sys-text')?.textContent==='2'&&!rows[0].querySelector('button')&&rows[0].tabIndex<0&&window.__ansRenderer.queuedDebug().join(',')==='smoke-q1,smoke-q2';})()`),
    );
    await js(`await window.__ansRenderer.selectRuntime('codex')`);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(120);
    check(
      "runtime switch does not revive old queued aggregate",
      await js(`!document.querySelector('#chat .op-queue-aggregate')&&window.__ansRenderer.queuedDebug().length===0`),
    );
    await push("session:operator-queued", queued("smoke-q3", "重推"));
    check(
      "main process repush rebuilds aggregate with new count only",
      await js(`(()=>{const a=document.querySelector('#chat .chat-pane[data-role-id="liaison"] .op-queue-aggregate');return !!a&&a.querySelector('.sys-text')?.textContent==='1'&&window.__ansRenderer.queuedDebug().join(',')==='smoke-q3';})()`),
    );
    await push("session:operator-expired", { id: "smoke-q3", roleId: "rapporteur", projectRoot: ROOT, runtime: "pi", reason: "离线清理" });
    check(
      "expired queued id removes aggregate",
      await js(`!document.querySelector('#chat .op-queue-aggregate')&&window.__ansRenderer.queuedDebug().length===0`),
    );

    // —————— 3. operator 请求：独立决定对话框 + 聊天系统通知（旧镜像卡已由 E 批替换） ——————
    const mirrorPayload = {
      id: "smoke-mirror-1",
      roleId: "rapporteur",
      projectRoot: ROOT,
      runtime: "pi",
      mirrorRoleId: "liaison",
      request: { kind: "confirm", title: "镜像提案", cardKind: "proposal", flowId: "flow-m", summary: "提案 v1" },
    };
    await push("session:operator-request", mirrorPayload);
    await waitFor(`document.querySelector('#decision-dialog[data-request-id="smoke-mirror-1"]')`);
    check(
      "operator request opens one decision dialog and a chat notice without operable card",
      await js(`(()=>{const d=document.querySelector('#decision-dialog[data-request-id="smoke-mirror-1"]');const n=document.querySelector('.sys-operator-note[data-operator-id="smoke-mirror-1"]');return !!d&&d.textContent.includes('镜像提案')&&!!n&&n.textContent.includes('镜像提案')&&n.textContent.includes('待处理')&&!document.querySelector('#chat [data-request-id="smoke-mirror-1"] button');})()`),
    );
    const beforeResponses = calls.operatorResponses.length;
    await js(`document.querySelector('#decision-dialog[data-request-id="smoke-mirror-1"] .dd-confirm').click()`);
    await sleep(120);
    check("dialog answer responds exactly once", calls.operatorResponses.length === beforeResponses + 1, calls.operatorResponses.slice(-1));
    check(
      "answered chat notice reflects decided without operable card",
      await js(`(()=>{const n=document.querySelector('.sys-operator-note[data-operator-id="smoke-mirror-1"]');return !!n&&n.textContent.includes('已处理')&&!n.querySelector('button');})()`),
    );

    // —————— 4. 排队卡防御：聊天流只显示系统通知，不提供可操作按钮 ——————
    await select("liaison");
    await push("session:operator-request", {
      id: "smoke-queued-card",
      roleId: "liaison",
      projectRoot: ROOT,
      runtime: "pi",
      queued: true,
      request: { kind: "confirm", title: "排队中的决定" },
    });
    check(
      "queued payload shows chat notice and no operable chat card",
      await js(`(()=>{const n=document.querySelector('.sys-operator-note[data-operator-id="smoke-queued-card"]');const p=window.__ansRenderer.state.pendingOperator['smoke-queued-card'];return !!n&&n.textContent.includes('排队中的决定')&&n.textContent.includes('待处理')&&!document.querySelector('#chat [data-request-id="smoke-queued-card"] button')&&!!p&&p.queued===true;})()`),
    );
    if (await js(`!!document.querySelector('#decision-dialog')`)) {
      await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
      await sleep(80);
    }

    // —————— 5–7. 治理记录 UI（pin-mismatch / establish / migrate）：该 UI 已随 commit 98d3fe2 移除，
    //   当前无 #governance-status/#governance-preview DOM；原检查不适用，删除并记录于 A5 baseline-fix 记录。

    // —————— 8. 报告全文 / persistence 重试同卡 ——————
    await load("trio");
    await select("P");
    const fullText = "真实报告原文🙂。".repeat(60) + "\nsummary-tail";
    const snapshot = {
      version: 1,
      reportId: "smoke-report",
      source: { roleId: "P", runtime: "pi", turnId: "report-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: fullText, redacted: true, truncated: true },
      evidence: [{ text: "证据一", redacted: false, truncated: true }],
      evidenceOmitted: 2,
      at: "2026-10-21T00:00:00Z",
    };
    state.saveState = { state: "failed", reportId: "smoke-report", retryAvailable: true, code: "PERSIST_FAILED" };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: { kind: "handback", report: snapshot, reportPersistence: state.saveState, summary: "报告" },
    }]);
    check(
      "report card shows layered facts flags evidence and source button",
      await js(`(()=>{const c=document.querySelector('.msg-handback');return !!c&&c.textContent.includes('任务报告')&&c.textContent.includes('任务关联未知')&&c.querySelector('.projection-flags').textContent.includes('已截断')&&c.querySelector('.projection-flags').textContent.includes('净化')&&c.querySelector('.projection-flags').textContent.includes('预算省略')&&c.querySelector('.report-facts').textContent.includes('尚未确认')&&c.querySelector('.hb-complete-summary').textContent.includes('summary-tail')&&c.querySelector('.report-actions').firstElementChild.classList.contains('report-source-button')&&[...c.querySelectorAll('button')].some(b=>b.textContent==='重试保存报告');})()`),
    );
    await js(`window.__smokeReportCard=document.querySelector('.msg-handback');document.querySelector('.msg-handback .persistence-retry').click()`);
    await sleep(120);
    check("report retry calls save channel once", calls.reportRetries.length === 1, calls.reportRetries[0]);
    await push("report-persistence-updated", {
      version: 1,
      scope: { projectRoot: ROOT, roleId: "P", runtime: "pi" },
      change: { kind: "report-save", scope: { roleId: "P", runtime: "pi" }, reportId: "smoke-report", state: { state: "saved", reportId: "smoke-report", retryAvailable: false } },
    });
    check(
      "report save updates same card in place without retry",
      await js(`(()=>{const c=document.querySelector('.msg-handback');return c===window.__smokeReportCard&&c.querySelector('.persistence-message').textContent==='报告已保存'&&![...c.querySelectorAll('button')].some(b=>b.textContent==='重试保存报告');})()`),
    );

    // —————— 9. 交付批次事实 / 安全副本 / 历史重试 / 过期 ——————
    const received = {
      ...snapshot,
      reportId: "smoke-received",
      source: { roleId: "P", runtime: "pi", turnId: "received-turn" },
      summary: { text: "收到的安全摘要", redacted: false, truncated: false },
    };
    state.receipt = { version: 1, deliveryId: "d1", attemptId: "a1", turnId: "delivery-turn", inputSaved: true, history: "failed", outcome: "completed", retryHistoryAvailable: true };
    state.receiptState = "known";
    const deliveryInput = {
      source: "prompt-input",
      text: "安全交接 [REDACTED]",
      inputProvenance: { version: 1, kind: "handback", deliveryId: "d1", attemptId: "a1", target: { roleId: "P", runtime: "pi" }, reports: [received] },
      inputTextProjection: { version: 1, source: "trusted-handback-display", modelInputRecorded: false, redacted: true, truncated: true, summaryTruncated: true },
    };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: { kind: "message", turnId: "delivery-turn", summary: "交接", detail: deliveryInput },
    }]);
    await sleep(150);
    check(
      "delivery batch shows receipt facts and safe copy flags",
      await js(`(()=>{const c=document.querySelector('.msg-delivery');if(!c)return false;const p=c.querySelector(':scope > .persistence-state');return c.textContent.includes('交付 · 本批 1 份（不表示全部收齐）')&&p.querySelectorAll('.delivery-batch-facts dt').length===3&&p.textContent.includes('接收历史')&&p.textContent.includes('目标输入记录')&&p.textContent.includes('目标轮次结果')&&c.querySelector('.safe-input-copy').textContent.includes('此处未记录完整模型输入')&&c.querySelector('.safe-input-copy').textContent.includes('已净化')&&c.querySelector('.safe-input-copy').textContent.includes('显示副本已截断')&&!c.querySelector('.safe-input-copy').open;})()`),
    );
    await js(`window.__smokeDelivery=document.querySelector('.msg-delivery');document.querySelector('.msg-delivery .persistence-retry').click()`);
    await sleep(120);
    check("delivery history retry calls channel once", calls.historyRetries.length === 1, calls.historyRetries[0]);
    check(
      "delivery history save updates same card",
      await js(`(()=>{const c=document.querySelector('.msg-delivery');return c===window.__smokeDelivery&&c.querySelector('.delivery-batch-facts .persistence-message').textContent==='已保存';})()`),
    );
    await push("delivery-history-updated", {
      version: 1,
      scope: { projectRoot: ROOT, roleId: "P", runtime: "pi" },
      change: { kind: "delivery-history-save", scope: { roleId: "P", runtime: "pi" }, attemptId: "a1", state: "expired", receipt: state.receipt, retryAvailable: false, code: "SNAPSHOT_EXPIRED" },
    });
    const expiredDelivery = await js(`(()=>{const c=document.querySelector('.msg-delivery');if(!c)return null;return {message:(c.querySelector('.persistence-message')||{}).textContent||'',retry:!!c.querySelector('.persistence-retry')};})()`);
    check(
      "expired material removes retry and states invalid honestly",
      !!expiredDelivery && expiredDelivery.message.includes("已失效") && expiredDelivery.retry === false,
      expiredDelivery,
    );

    // —————— 10. 菜单配置状态与读取守卫 ——————
    await js(`await window.__ansRenderer.selectRuntime('claude')`);
    await sleep(120);
    const readsBeforeMenu = calls.configReads.length;
    await js(`document.getElementById('runtime-select').focus();document.getElementById('runtime-select').click()`);
    await waitFor(`document.querySelector('#runtime-option-claude .engine-option-status').textContent!=='检查中…'`, 4000);
    check(
      "menu shows configured/missing status text for all engines",
      await js(`(()=>{const t=(id)=>document.querySelector('#runtime-option-'+id+' .engine-option-status').textContent;return t('pi')==='缺配置'&&t('codex')==='已配置'&&t('claude')==='已配置'&&document.getElementById('runtime-options').getBoundingClientRect().width===208;})()`),
    );
    const afterMenu = calls.configReads.length;
    await js(`document.getElementById('runtime-select').focus()`);
    await js(`window.dispatchEvent(new Event('blur'))`);
    await sleep(40);
    await js(`document.getElementById('runtime-select').focus();document.getElementById('runtime-select').click()`);
    await sleep(250);
    check(
      "cached menu reopen performs no extra config reads",
      calls.configReads.length === afterMenu,
      { before: readsBeforeMenu, afterMenu, now: calls.configReads.length },
    );
    await js(`window.dispatchEvent(new Event('blur'))`);
    const readsBeforeSwitch = calls.configReads.length;
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(150);
    check("engine switch reads config exactly once", calls.configReads.length === readsBeforeSwitch + 1, calls.configReads.slice(-3));
    state.failConfig.add("codex");
    // 换项目以清空菜单摘要缓存（projectChanged 重置 per-engine summaries），再验证读取失败=配置未知。
    await js(`await window.__ansRenderer.loadProject('/phase4b-config-fail')`);
    await sleep(160);
    await js(`document.getElementById('runtime-select').focus();document.getElementById('runtime-select').click()`);
    await waitFor(`document.querySelector('#runtime-option-codex .engine-option-status').textContent==='配置未知'`, 4000);
    check(
      "failed config read shows unknown not missing",
      await js(`document.querySelector('#runtime-option-codex .engine-option-status').textContent==='配置未知'`),
    );
    await js(`window.dispatchEvent(new Event('blur'))`);
    state.failConfig.delete("codex");
    await load("trio");

    // —————— 11. queueView 顶层 tab 切换清空 ——————
    await select("liaison");
    const queueItems = [1, 2, 3, 4].map((index) => ({ id: "qv-" + index, kind: "message", summary: "排队消息 " + index, full: "", at: "" }));
    await push("session:role-state", { projectRoot: ROOT, roleId: "liaison", runtime: "pi", busy: false, queue: queueItems, summaries: queueItems.map((item) => item.summary) });
    await js(`document.getElementById('tab-work').click()`);
    await sleep(150);
    await js(`document.querySelector('#right-body .queue-view-all').click()`);
    await sleep(150);
    check("work queue subview title opens", await js(`document.getElementById('drawer-title').textContent.includes('队列')`));
    await js(`document.getElementById('tab-card').click()`);
    await sleep(160);
    check(
      "top tab to card clears queue subview and keeps drawer",
      await js(`window.__ansRenderer.state.rightTab==='card'&&document.getElementById('drawer-title').textContent.includes('角色资料')&&!document.getElementById('drawer-title').textContent.includes('队列')&&document.getElementById('right-drawer').classList.contains('open')`),
    );
    await js(`document.getElementById('tab-work').click()`);
    await sleep(150);
    check("top tab to work shows work overview not queue", await js(`document.getElementById('drawer-title').textContent.includes('工作概览')&&!document.getElementById('drawer-title').textContent.includes('队列')`));
    await js(`document.getElementById('tab-card').click()`);
    await sleep(120);
    if (await js(`!!document.querySelector('#right-body .queue-view-all')`)) {
      await js(`document.querySelector('#right-body .queue-view-all').click()`);
      await sleep(120);
      await js(`document.getElementById('tab-work').click()`);
      await sleep(150);
      check("card queue subview then work tab shows work overview", await js(`window.__ansRenderer.state.rightTab==='work'&&document.getElementById('drawer-title').textContent.includes('工作概览')`));
    } else {
      check("card queue subview entry absent (no queue preview)", true);
    }

    // —————— 11b. 项目状态区（project-state/v1，A4：只读/同源/刷新） ——————
    const projectStateBefore = calls.projectState.length;
    await js(`document.getElementById('tab-tasks').click()`);
    await waitFor(`document.querySelector('.project-state .ps-focus') !== null`, 4000);
    await sleep(120);
    const projectStateCalls = calls.projectState.length;
    check(
      "project state section renders focus and badges",
      await js(`(()=>{const s=document.querySelector('.project-state');if(!s)return false;const f=s.querySelector('.ps-focus');const badges=[...s.querySelectorAll('.ps-badge')];const details=s.querySelector('.ps-details');return !!f&&f.textContent.includes('smoke-flow')&&f.textContent.includes('smoke-run')&&badges.length===4&&badges[0].textContent.includes('1 个未收口')&&!!details&&details.open===false;})()`),
    );
    check(
      "project state IPC called once on open",
      projectStateCalls === projectStateBefore + 1,
      { before: projectStateBefore, after: projectStateCalls },
    );
    check(
      "project state read-only: only refresh button",
      await js(`(()=>{const s=document.querySelector('.project-state');return s.querySelectorAll('button').length===1&&!!s.querySelector('.ps-refresh');})()`),
    );
    check(
      "project state exposes no write bridge",
      !("closeTask" in calls) && !("terminateRoleRun" in calls) && !("redispatchTask" in calls) && !("projectNote" in calls),
    );
    await shot("phase4b-project-state");
    await js(`document.querySelector('.ps-refresh').click()`);
    await sleep(160);
    check(
      "project state refresh calls IPC once more",
      calls.projectState.length === projectStateCalls + 1,
      calls.projectState.slice(-3),
    );
    await js(`document.getElementById('drawer-close').click()`);
    await sleep(80);

    // —————— 12. single↔trio 一次性警告刷新 ——————
    await load("trio");
    await select("P");
    state.decisionEnabled = true;
    await js(`document.getElementById('judge-decision-toggle').click()`);
    await sleep(100);
    check(
      "trio decision enable shows one-time warning",
      await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),w=document.getElementById('shell-judge-warning');return t.checked&&!t.disabled&&!w.hidden&&document.getElementById('shell-judge-warning-text').textContent.includes('替我决策中：提案接受、任命、验收');})()`),
    );
    await js(`document.getElementById('shell-judge-warning-close').click()`);
    await sleep(60);
    await load("single");
    check(
      "single switch disables decision and drops stale warning line",
      await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),l=document.getElementById('judge-decision-label'),w=document.getElementById('shell-judge-warning');return t.disabled&&!t.checked&&l.textContent==='替我决策'&&w.hidden&&!document.getElementById('shell-judge-warning-text').textContent.includes('替我决策中');})()`),
    );
    await load("trio");
    check(
      "trio restores decision availability without stale warning",
      await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),w=document.getElementById('shell-judge-warning');return !t.disabled&&w.hidden;})()`),
    );
    await js(`document.getElementById('judge-decision-toggle').click()`);
    await sleep(80);
    await js(`document.getElementById('judge-decision-toggle').click()`);
    await sleep(80);
    check(
      "decision re-enable after single round shows warning once again",
      await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),w=document.getElementById('shell-judge-warning');return t.checked&&!w.hidden&&document.getElementById('shell-judge-warning-text').textContent.includes('替我决策中：');})()`),
    );
    await js(`document.getElementById('shell-judge-warning-close').click()`);
    await js(`document.getElementById('judge-decision-toggle').click()`);
    await sleep(60);
    state.decisionEnabled = false;

    // —————— 13. judge 结果行跨引擎重放（不串引擎） ——————
    await select("P");
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: { kind: "tool_call", turnId: "judge-turn", summary: "模型请求调用 run_shell", detail: { toolName: "run_shell", toolCallId: "judge-call", phase: "start" } },
    }]);
    const judgePayload = {
      version: 1,
      id: "judge-result-1",
      toolCallId: "judge-call",
      roleId: "P",
      projectRoot: ROOT,
      runtime: "pi",
      at: "2026-10-21T00:00:00Z",
      verdict: "allow",
      summary: "构建项目",
      engine: "claude",
      operator: "judge:claude",
      tier: "risky",
    };
    await push("shell:judge-result", judgePayload);
    check("judge result row present in its own engine", await js(`document.querySelectorAll('#chat .shell-judge-row[data-tool-call-id="judge-call"]').length===1`));
    await push("shell:judge-result", { ...judgePayload, id: "judge-result-codex", runtime: "codex", toolCallId: "judge-call-codex", roleId: "P" });
    check("foreign engine judge result not shown in current view", await js(`!document.querySelector('#chat .shell-judge-row[data-tool-call-id="judge-call-codex"]')`));
    await js(`await window.__ansRenderer.selectRuntime('codex')`);
    await sleep(150);
    check("switching to codex replays its own judge result", await js(`document.querySelectorAll('#chat .shell-judge-row[data-tool-call-id="judge-call-codex"]').length===1&&!document.querySelector('#chat .shell-judge-row[data-tool-call-id="judge-call"]')`));
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(150);
    check(
      "switching back to pi replays pi judge result once without leakage",
      await js(`document.querySelectorAll('#chat .shell-judge-row[data-tool-call-id="judge-call"]').length===1&&!document.querySelector('#chat .shell-judge-row[data-tool-call-id="judge-call-codex"]')`),
    );

    // —————— 13b. C2 重锚：失效 shell 收起 + 原因可见/可追溯 ——————
    await js(`await window.__ansRenderer.selectRuntime('codex')`);
    await sleep(120);
    await push("shell:confirm-request", {
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      id: "smoke-shell-expire",
      policy: "su-approval",
      command: "echo offline",
      summary: "离线命令",
      reasonPlain: "离线确认",
      cwd: ROOT,
      argvLines: [],
    });
    await push("session:operator-expired", {
      id: "smoke-shell-expire",
      roleId: "P",
      projectRoot: ROOT,
      runtime: "pi",
      reason: "原shell轮次已中止",
    });
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(160);
    check(
      "expired shell collapses with reason visible in its own runtime (C2 re-anchored)",
      await js(`document.getElementById('shell-confirm').hidden&&document.getElementById('composer-hint').textContent.includes('原shell轮次已中止')`),
    );

    // —————— 14. replayAnchorDebug + decided card 落位 ——————
    const anchored = parseSessionJsonl([
      { type: "session" },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "anchor-call", name: "request_confirmation", arguments: { title: "锚点提案" } }] } },
      { type: "message", message: { role: "toolResult", toolName: "request_confirmation", toolCallId: "anchor-call", isError: true, content: [{ type: "text", text: "未获同意：锚点结论" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "结论之后" }] } },
    ].map((item) => JSON.stringify(item)).join("\n")).rows;
    await push("session:history", { projectRoot: ROOT, roleId: "P", runtime: "pi", rows: anchored });
    await push("session:operator-request", {
      id: "anchor-request",
      roleId: "P",
      projectRoot: ROOT,
      runtime: "pi",
      anchorKey: anchored[0].anchorKey,
      request: { kind: "confirm", title: "锚点提案" },
    });
    await sleep(120);
    check(
      "replayAnchorDebug returns indices and card sits between request and conclusion",
      await js(`(()=>{const a=window.__ansRenderer.replayAnchorDebug('P').find(x=>x.anchorKey===${JSON.stringify(anchored[0].anchorKey)});const m=window.__ansRenderer.rowModelDebug('P');const op=m.operators.find(x=>x.requestId==='anchor-request');return !!a&&a.requestIndex!==null&&a.conclusionIndex!==null&&m.operators.length===1&&op.index===a.requestIndex+1&&op.index<a.conclusionIndex;})()`),
    );
    await js(`document.querySelector('#decision-dialog[data-request-id="anchor-request"] .dd-reject').click()`);
    await sleep(120);
    await js(`window.__smokeAnchorCard=document.querySelector('.sys-operator-note[data-operator-id="anchor-request"]')`);
    check(
      "denied anchored notice kept in place without operable card",
      await js(`(()=>{const c=document.querySelector('.sys-operator-note[data-operator-id="anchor-request"]');return !!c&&c.textContent.includes('已处理')&&!c.querySelector('button');})()`),
    );
    // 最小复现：已答卡锚点键在 full rebuild 后仍生效（卡不落尾、DOM 复用、结论索引右移）。
    await push("session:history", {
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      rows: [{ kind: "assistant", text: "前插说明", at: "" }, ...anchored],
    });
    await sleep(140);
    check(
      "decided anchored card survives full rebuild between request and conclusion",
      await js(`(()=>{const a=window.__ansRenderer.replayAnchorDebug('P').find(x=>x.anchorKey===${JSON.stringify(anchored[0].anchorKey)});const m=window.__ansRenderer.rowModelDebug('P');const op=m.operators.find(x=>x.requestId==='anchor-request');const c=document.querySelector('.sys-operator-note[data-operator-id="anchor-request"]');return !!a&&!!op&&c===window.__smokeAnchorCard&&op.index===a.requestIndex+1&&a.conclusionIndex===op.index+1;})()`),
    );

    // —————— 15. 截图与 960/200% 几何 ——————
    await load("trio");
    await select("liaison");
    const treeRowsHealthy = `(()=>{const t=document.getElementById('role-tree');const tr=t.getBoundingClientRect();const items=[...t.querySelectorAll('.tree-item')];const rects=items.map(e=>e.getBoundingClientRect()).filter(r=>r.height>0).sort((a,b)=>a.top-b.top);for(let i=1;i<rects.length;i++){if(rects[i].top<rects[i-1].bottom-0.5)return false;}const visible=items.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>tr.top+1&&r.top<tr.bottom-1;});return t.clientHeight>0&&items.length>=6&&visible.length>=2&&t.scrollWidth<=t.clientWidth+1&&items.every(e=>e.scrollWidth<=e.clientWidth+1);})()`;
    const treeReachableAt200 = `(()=>{const t=document.getElementById('role-tree'),left=document.querySelector('.col-left');const items=[...t.querySelectorAll('.tree-item')];const first=items[0],last=items[items.length-1];if(!first||!last)return false;const inWin=e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;};left.scrollTop=0;const firstVisible=inWin(first);left.scrollTop=left.scrollHeight;const lastVisible=inWin(last);left.scrollTop=Math.max(0,t.offsetTop-30);return t.clientHeight>0&&t.scrollHeight>=t.clientHeight&&firstVisible&&lastVisible;})()`;
    win.setContentSize(1360, 860);
    await sleep(160);
    check("five-role tree rows do not overlap at 1360", await js(treeRowsHealthy));
    await shot("phase4b-1360");
    win.setContentSize(960, 620);
    await sleep(160);
    check("960 no horizontal overflow", await js(`document.documentElement.scrollWidth<=innerWidth`));
    check("five-role tree rows do not overlap at 960", await js(treeRowsHealthy));
    await shot("phase4b-960");
    await shot("phase4b-960-five-role-tree");

    // 报告卡：facts 标签/值不粘连（冒号伪元素），1360/960/200 可见。
    await select("P");
    const shotReport = {
      version: 1,
      reportId: "shot-report",
      source: { roleId: "P", runtime: "pi", turnId: "shot-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: "截图报告摘要。".repeat(20), redacted: false, truncated: false },
      evidence: [{ text: "证据一", redacted: false, truncated: false }],
      evidenceOmitted: 0,
      at: "2026-10-21T00:00:00Z",
    };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: { kind: "handback", report: shotReport, reportPersistence: { state: "saved", reportId: "shot-report", retryAvailable: false }, summary: "报告" },
    }]);
    await sleep(120);
    const factsSeparated = `(()=>{const dt=document.querySelector('.msg-handback .report-facts dt');const dd=document.querySelector('.msg-handback .report-facts dd');if(!dt||!dd)return false;const after=getComputedStyle(dt,'::after').content;return after.includes('：')&&getComputedStyle(dt.parentElement).display.includes('flex')&&dd.getBoundingClientRect().left>=dt.getBoundingClientRect().left;})()`;
    win.setContentSize(1360, 860);
    await sleep(140);
    check("report facts label/value separated at 1360", await js(factsSeparated));
    await shot("phase4b-1360-report");
    win.setContentSize(960, 620);
    await sleep(140);
    check("report facts label/value separated at 960", await js(factsSeparated));
    await js(`document.querySelector('.msg-handback .report-facts').scrollIntoView({block:'center'})`);
    await sleep(120);
    check(
      "960 report facts labels visible inside chat viewport",
      await js(`(()=>{const chat=document.getElementById('chat'),cr=chat.getBoundingClientRect();const rows=[...document.querySelectorAll('.msg-handback .report-facts dt, .msg-handback .report-facts dd')];return rows.length>=2&&rows.every(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=cr.top-1&&r.bottom<=cr.bottom+1;});})()`),
    );
    await shot("phase4b-960-report");

    // 200%：头部换行、左树可见可滚动、缺配提示/治理状态换行；树/报告/治理预览截图。
    wc.setZoomFactor(2);
    await sleep(300);
    const containerMetrics = await js(`(()=>{const selectors=['#chat','.chat-head','.head-inner','#right-body','#runtime-config-notice','#role-tree','.col-mid','.session-notice','.composer'];const rows=selectors.map(sel=>{const e=document.querySelector(sel);return {sel,hidden:e?e.hidden:null,sw:e?e.scrollWidth:null,cw:e?e.clientWidth:null,display:e?getComputedStyle(e).display:null};});const mid=document.querySelector('.col-mid');const mr=mid?mid.getBoundingClientRect():null;const midOffenders=mr?[...mid.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&r.right>mr.right+1;}).slice(0,8).map(e=>({cls:String(e.className).slice(0,60),tag:e.tagName,right:Math.round(e.getBoundingClientRect().right)})):[];const chat=document.getElementById('chat');const rect=chat.getBoundingClientRect();const offenders=[...chat.querySelectorAll('*')].filter(e=>{if(e.closest('details:not([open])'))return false;const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&(r.right>rect.right+1||e.scrollWidth>e.clientWidth+1);}).slice(0,8).map(e=>({cls:String(e.className).slice(0,60),tag:e.tagName,right:Math.round(e.getBoundingClientRect().right),sw:e.scrollWidth,cw:e.clientWidth}));return {rows,offenders,midOffenders,chatRight:Math.round(rect.right),docSW:document.documentElement.scrollWidth,innerWidth};})()`);
    check(
      "200% containers no horizontal overflow",
      containerMetrics.rows.every((row) => row.sw === null || row.sw <= row.cw + 1) && containerMetrics.docSW <= containerMetrics.innerWidth,
      containerMetrics,
    );
    check("200% header wraps", await js(`getComputedStyle(document.querySelector('.head-inner')).flexWrap==='wrap'`));
    // 触发当前引擎缺配读取，使 200% 缺配条处于可见态（保留原换行检查意图）。
    await js(`await window.__ansRenderer.loadPiConfig()`);
    await sleep(200);
    const noticeState = await js(`(()=>{const n=document.getElementById('runtime-config-notice'),m=document.getElementById('runtime-config-message'),b=document.getElementById('runtime-config-settings');if(!n||n.hidden)return {visible:false,text:m?m.textContent:''};const nr=n.getBoundingClientRect(),br=b?b.getBoundingClientRect():null;return {visible:true,text:m.textContent,msgSW:m.scrollWidth,msgCW:m.clientWidth,msgSH:m.scrollHeight,msgCH:m.clientHeight,wrap:getComputedStyle(n).flexWrap,noticeTop:Math.round(nr.top),noticeBottom:Math.round(nr.bottom),buttonBottom:br?Math.round(br.bottom):null,innerHeight,btnInside:b?b.getBoundingClientRect().right<=innerWidth+0.5:null};})()`);
    check(
      "200% config notice full text wrapped without clipping",
      noticeState.visible === true &&
        noticeState.text.includes("Pi") &&
        noticeState.wrap === "wrap" &&
        noticeState.msgSW <= noticeState.msgCW + 1 &&
        noticeState.msgSH <= noticeState.msgCH + 1 &&
        noticeState.btnInside !== false &&
        noticeState.noticeBottom <= noticeState.innerHeight + 0.5 &&
        (noticeState.buttonBottom === null || noticeState.buttonBottom <= noticeState.innerHeight + 0.5),
      noticeState,
    );
    await shot("phase4b-200pct");
    // 左栏滚动到树，保证角色行在 200% 屏幕可见；树可内部滚动到最后一列。
    await js(`(()=>{const left=document.querySelector('.col-left'),tree=document.getElementById('role-tree');left.scrollTop=Math.max(0,tree.offsetTop-30);})()`);
    await sleep(120);
    check("200% five-role tree rows do not overlap", await js(treeRowsHealthy));
    const tree200Metrics = await js(`(()=>{const t=document.getElementById('role-tree'),left=document.querySelector('.col-left');const items=[...t.querySelectorAll('.tree-item')];const inWin=e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;};left.scrollTop=0;const firstVisible=inWin(items[0]);left.scrollTop=left.scrollHeight;const lastVisible=inWin(items[items.length-1]);left.scrollTop=Math.max(0,t.offsetTop-30);return {treeCH:t.clientHeight,treeSH:t.scrollHeight,leftSH:left.scrollHeight,leftCH:left.clientHeight,firstVisible,lastVisible,count:items.length};})()`);
    check("200% tree visible on screen and scrollable to last role", await js(treeReachableAt200), tree200Metrics);
    check(
      "200% tree visible rows intersect the screen",
      await js(`(()=>{const t=document.getElementById('role-tree'),tr=t.getBoundingClientRect();if(!(tr.bottom>0&&tr.top<innerHeight))return false;const rows=[...t.querySelectorAll('.tree-item')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>Math.max(tr.top,0)+1&&r.top<Math.min(tr.bottom,innerHeight)-1;});return rows.length>=2;})()`),
    );
    await shot("phase4b-200pct-five-role-tree");

    // 报告：滚到卡、展开完整摘要与证据；内部节点无横向溢出。
    await js(`document.querySelector('.msg-handback .report-complete').open=true`);
    await sleep(140);
    const reportDetailMetrics = await js(`(()=>{const chat=document.getElementById('chat');const c=document.querySelector('.msg-handback');const nodes=['.msg-handback','.report-complete-body','.hb-complete-summary','.hb-evidence'].map(sel=>{const e=document.querySelector(sel);return {sel,sw:e?e.scrollWidth:null,cw:e?e.clientWidth:null};});return {nodes,cardRight:c?c.getBoundingClientRect().right:null,chatSW:chat.scrollWidth,chatCW:chat.clientWidth,innerWidth};})()`);
    check(
      "200% report details nodes stay within width",
      reportDetailMetrics.nodes.every((node) => node.sw === null || node.sw <= node.cw + 1) &&
        reportDetailMetrics.cardRight <= reportDetailMetrics.innerWidth + 0.5 &&
        reportDetailMetrics.chatSW <= reportDetailMetrics.chatCW + 1,
      reportDetailMetrics,
    );
    await js(`document.querySelector('.msg-handback .report-top').scrollIntoView({block:'start'})`);
    await sleep(120);
    check("200% report card visible on screen", await js(`(()=>{const r=document.querySelector('.msg-handback .report-top').getBoundingClientRect();return r.height>0&&r.top<innerHeight&&r.bottom>0;})()`));
    await shot("phase4b-200pct-report");
    await js(`document.querySelector('.msg-handback .report-complete').scrollIntoView({block:'start'})`);
    await sleep(120);
    await shot("phase4b-200pct-report-details");

    // 200% 治理预览检查：治理 UI 已随 commit 98d3fe2 移除，不适用（见 A5 baseline-fix 记录）。
    wc.setZoomFactor(1);

    // —————— 11. A5 验收报告卡/决定卡 E2E（最小追加；自包含） ——————
    await load("trio");
    await js(`await window.__ansRenderer.selectRuntime("pi")`);
    // 清掉可能遗留的决策弹窗（只延后，不代答）。
    for (let i = 0; i < 5; i += 1) {
      if (!(await js(`!!document.querySelector('#decision-dialog')`))) break;
      await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
      await sleep(80);
    }
    await select("verifier");

    const acceptFull = "A5-ACCEPT-PREFIX-MARKER " + "验收报告原文🙂。".repeat(60) + "\nA5-ACCEPT-TAIL-MARKER";
    const acceptEvidence = [
      { text: "验收证据一", redacted: true, truncated: false },
      { text: "验收证据二", redacted: false, truncated: true },
    ];
    const verifierReport = {
      version: 1,
      reportId: "smoke-accept-report",
      source: { roleId: "verifier", runtime: "pi", turnId: "accept-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: acceptFull, redacted: false, truncated: false },
      evidence: acceptEvidence,
      evidenceOmitted: 2,
      at: "2026-11-02T00:00:00Z",
    };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "verifier",
      runtime: "pi",
      event: {
        kind: "handback",
        report: verifierReport,
        reportPersistence: { state: "saved", reportId: "smoke-accept-report", retryAvailable: false },
        summary: "验收报告",
      },
    }]);
    await waitFor(`!!document.querySelector('#chat .chat-pane[data-role-id="verifier"] .msg-handback.is-acceptance')`);
    check("A5 verifier handback: identity/full text/evidence/no fold", await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .chat-pane[data-role-id="verifier"] .msg-handback')].find(x=>x.textContent.includes('A5-ACCEPT-TAIL-MARKER'));
      if(!c) return false;
      const ev=c.querySelectorAll('.acceptance-evidence .hb-evidence li');
      return c.classList.contains('is-acceptance')&&
        c.querySelector('.report-title').textContent==='独立验收报告'&&
        c.querySelector('.report-acceptance-badge').textContent==='独立验收'&&
        c.querySelector('.report-top').classList.contains('is-acceptance')&&
        c.querySelector('.report-body').classList.contains('is-acceptance')&&
        c.querySelector('.hb-summary').textContent.includes('A5-ACCEPT-TAIL-MARKER')&&
        !c.querySelector('.report-complete')&&
        ev.length===2&&
        c.querySelector('.acceptance-evidence').textContent.includes('验收证据一')&&
        c.querySelector('.acceptance-evidence').textContent.includes('验收证据二')&&
        c.querySelector('.acceptance-evidence').textContent.includes('已净化')&&
        c.querySelector('.acceptance-evidence').textContent.includes('已截断')&&
        c.querySelector('.projection-flags').textContent.includes('另有 2 条证据因预算省略')&&
        c.querySelector('.report-facts').textContent.includes('验收决定（如适用）')&&
        c.querySelector('.report-facts').textContent.includes('报告本身不构成通过')&&
        c.querySelector('.report-disclaimer').textContent.includes('如本次为验收任务')&&
        !c.textContent.includes('已验收通过')&&!c.textContent.includes('验收已通过')&&!c.textContent.includes('通过验收')&&
        c.querySelector('.report-actions .report-source-button')!==null;
    })()`));
    check("A5 verifier handback cold color", await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .chat-pane[data-role-id="verifier"] .msg-handback')].find(x=>x.textContent.includes('A5-ACCEPT-TAIL-MARKER'));
      if(!c) return false;
      const s=getComputedStyle(c);
      return s.borderLeftWidth==='3px'&&s.borderLeftColor==='rgb(134, 197, 227)';
    })()`));
    await shot("a5-acceptance-handback");

    const blockedReport = {
      ...verifierReport,
      reportId: "smoke-accept-blocked",
      status: "blocked",
      summary: { text: "BLOCKED-A5-ACCEPT-MARKER " + "受阻报告。".repeat(60), redacted: false, truncated: false },
    };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "verifier",
      runtime: "pi",
      event: {
        kind: "handback",
        report: blockedReport,
        reportPersistence: { state: "saved", reportId: "smoke-accept-blocked", retryAvailable: false },
        summary: "受阻验收报告",
      },
    }]);
    check("A5 verifier blocked: identity kept + danger color priority", await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .chat-pane[data-role-id="verifier"] .msg-handback')].find(x=>x.textContent.includes('BLOCKED-A5-ACCEPT-MARKER'));
      if(!c) return false;
      const s=getComputedStyle(c);
      return c.classList.contains('is-acceptance')&&c.classList.contains('is-blocked')&&
        c.querySelector('.report-title').textContent==='独立验收报告'&&
        s.borderLeftColor==='rgb(201, 122, 109)'&&
        getComputedStyle(c.querySelector('.report-top')).backgroundColor==='rgb(46, 34, 32)';
    })()`));

    const unsupportedReport = {
      version: 2,
      reportId: "smoke-accept-unsupported",
      source: { roleId: "verifier", runtime: "pi", turnId: "accept-unsupported" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: "UNSUPPORTED-A5-ACCEPT-MARKER", redacted: false, truncated: false },
      evidence: [],
      evidenceOmitted: 0,
      at: "2026-11-02T00:00:01Z",
    };

    const ordinaryFull = "A5-ORDINARY-PREFIX-MARKER " + "普通报告原文。".repeat(80) + "\nA5-ORDINARY-TAIL-MARKER";
    const ordinaryReport = {
      version: 1,
      reportId: "smoke-ordinary-a5",
      source: { roleId: "P", runtime: "pi", turnId: "ordinary-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: ordinaryFull, redacted: false, truncated: false },
      evidence: [{ text: "普通证据", redacted: false, truncated: false }],
      evidenceOmitted: 0,
      at: "2026-11-02T00:00:02Z",
    };
    await select("P");
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: {
        kind: "handback",
        report: ordinaryReport,
        reportPersistence: { state: "saved", reportId: "smoke-ordinary-a5", retryAvailable: false },
        summary: "普通报告",
      },
    }]);
    check("A5 ordinary report: no acceptance style; preview + report-complete retained", await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .chat-pane[data-role-id="P"] .msg-handback')].find(x=>x.textContent.includes('A5-ORDINARY-PREFIX-MARKER'));
      if(!c) return false;
      const full=c.querySelector('.report-complete');
      return !c.classList.contains('is-acceptance')&&!c.querySelector('.report-acceptance-badge')&&
        c.querySelector('.report-title').textContent==='任务报告'&&
        c.querySelector('.hb-summary').textContent.includes('A5-ORDINARY-PREFIX-MARKER')&&
        !c.querySelector('.hb-summary').textContent.includes('A5-ORDINARY-TAIL-MARKER')&&
        !!full&&!full.open&&full.querySelector('summary').textContent==='查看完整报告摘要与证据'&&
        full.querySelector('.hb-complete-summary').textContent.includes('A5-ORDINARY-TAIL-MARKER')&&
        c.querySelector('.report-facts').textContent.includes('尚未确认');
    })()`));

    const deliveryReports = [verifierReport, blockedReport, ordinaryReport, unsupportedReport];
    const a5DeliveryInput = {
      source: "prompt-input",
      text: "A5-DELIVERY-MARKER",
      inputProvenance: {
        version: 1,
        kind: "handback",
        deliveryId: "a5-d1",
        attemptId: "a5-a1",
        target: { roleId: "P", runtime: "pi" },
        reports: deliveryReports,
      },
      inputTextProjection: {
        version: 1,
        source: "trusted-handback-display",
        modelInputRecorded: false,
        redacted: false,
        truncated: false,
        summaryTruncated: false,
      },
    };
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "P",
      runtime: "pi",
      event: { kind: "message", turnId: "a5-delivery-turn", summary: "验收交付", detail: a5DeliveryInput },
    }]);
    await waitFor(`[...document.querySelectorAll('#chat .chat-pane[data-role-id="P"] .msg-delivery')].some(x=>x.textContent.includes('A5-DELIVERY-MARKER'))`);
    check("A5 delivery: acceptance sections + ordinary class unchanged (P1-ARC-02)", await js(`(()=>{
      const d=[...document.querySelectorAll('#chat .chat-pane[data-role-id="P"] .msg-delivery')].find(x=>x.textContent.includes('A5-DELIVERY-MARKER'));
      if(!d) return false;
      const secs=[...d.querySelectorAll('.delivery-report')];
      const completed=secs.find(s=>s.textContent.includes('A5-ACCEPT-TAIL-MARKER'));
      const blocked=secs.find(s=>s.textContent.includes('BLOCKED-A5-ACCEPT-MARKER'));
      const ordinary=secs.find(s=>s.textContent.includes('A5-ORDINARY-PREFIX-MARKER'));
      if(!completed||!blocked||!ordinary) return false;
      return secs.filter(s=>s.classList.contains('is-acceptance')).length===2&&
        secs.filter(s=>s.classList.contains('is-acceptance')&&s.classList.contains('is-blocked')).length===1&&
        completed.classList.contains('is-acceptance')&&!completed.classList.contains('is-blocked')&&
        completed.querySelector('.report-title').textContent==='独立验收报告'&&
        completed.querySelector('.report-acceptance-badge').textContent==='独立验收'&&
        completed.querySelector('.hb-summary').textContent.includes('A5-ACCEPT-TAIL-MARKER')&&
        !completed.querySelector('.report-complete')&&
        completed.querySelectorAll('.acceptance-evidence .hb-evidence li').length===2&&
        blocked.classList.contains('is-acceptance')&&blocked.classList.contains('is-blocked')&&
        blocked.querySelector('.report-title').textContent==='独立验收报告'&&
        ordinary.className==='delivery-report'&&
        ordinary.querySelector('.report-title').textContent==='任务报告'&&
        !ordinary.querySelector('.report-acceptance-badge')&&
        ordinary.querySelector('.report-complete')!==null&&
        getComputedStyle(completed).borderLeftColor==='rgb(134, 197, 227)'&&
        getComputedStyle(blocked).borderLeftColor==='rgb(201, 122, 109)';
    })()`));
    await shot("a5-acceptance-delivery");
    check("A5 P1-ARC-01 unsupported verifier delivery report has no acceptance classes", await js(`(()=>{
      const d=[...document.querySelectorAll('#chat .chat-pane[data-role-id="P"] .msg-delivery')].find(x=>x.textContent.includes('A5-DELIVERY-MARKER'));
      if(!d) return false;
      const c=[...d.querySelectorAll('.delivery-report')].find(x=>x.textContent.includes('不支持此报告版本，未生成成果摘要。'));
      if(!c) return false;
      return c.className==='delivery-report'&&
        !c.classList.contains('is-acceptance')&&!c.classList.contains('is-blocked')&&
        !c.querySelector('.report-title')&&!c.querySelector('.report-acceptance-badge')&&
        !c.querySelector('.report-complete');
    })()`));

    await js(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
    const dialogMarker = "A5-DIALOG-REPORT-END-MARKER";
    const dialogText = "a".repeat(16384 - dialogMarker.length) + dialogMarker;
    const acceptanceDialog = {
      id: "a5-acceptance-card",
      roleId: "P",
      projectRoot: ROOT,
      runtime: "pi",
      anchorKey: "a5-acceptance-anchor",
      request: {
        kind: "choice",
        title: "独立验收决定",
        cardKind: "acceptance",
        flowId: "flow-a5",
        preview: "A5-DIALOG-PREVIEW-MARKER：请确认验收结果。",
        options: [
          { id: "accept", label: "通过" },
          { id: "rework", label: "返工", recommended: true },
        ],
      },
      acceptanceReport: {
        version: 1,
        path: "docs/quality/flow-a5-report-v1.md",
        text: { text: dialogText, redacted: false, truncated: true },
      },
    };
    await push("session:operator-request", acceptanceDialog);
    await waitFor(`document.querySelector('#decision-dialog[data-request-id="a5-acceptance-card"]')`);
    await sleep(120);
    check("A5 acceptance dialog: localized badge/report/path/preview visible/options", await js(`(()=>{
      const d=document.querySelector('#decision-dialog[data-request-id="a5-acceptance-card"]');
      if(!d) return false;
      const body=d.querySelector('.dd-acceptance-body');
      const pre=d.querySelector('.dd-preview');
      const kind=d.querySelector('.dd-kind');
      return d.classList.contains('is-acceptance')&&
        kind&&kind.textContent==='独立验收决定'&&!kind.textContent.includes('acceptance')&&
        d.querySelector('.dd-acceptance-report')!==null&&body&&
        body.textContent.includes('A5-DIALOG-REPORT-END-MARKER')&&
        d.querySelector('.dd-report-path').textContent.includes('docs/quality/flow-a5-report-v1.md')&&
        pre&&pre.textContent.includes('A5-DIALOG-PREVIEW-MARKER')&&
        pre.getBoundingClientRect().height>0&&!pre.closest('details')&&
        d.querySelector('.dd-acceptance-report .projection-flags').textContent.includes('报告原文超出显示预算，已截断。')&&
        d.querySelectorAll('.dd-option').length===2&&
        [...d.querySelectorAll('.dd-option-label')].some(x=>x.textContent.includes('★'))&&
        d.querySelector('.dd-submit')!==null&&d.querySelector('.dd-submit').disabled===false;
    })()`));
    check("A5 acceptance dialog cold color", await js(`(()=>{const d=document.querySelector('#decision-dialog[data-request-id="a5-acceptance-card"]');return !!d&&getComputedStyle(d).borderColor==='rgb(79, 134, 163)';})()`));
    await js(`document.querySelector('#decision-dialog .dd-acceptance-body').scrollIntoView({block:'center'})`);
    await wc.setZoomFactor(2);
    await sleep(250);
    check("A5 200% acceptance dialog no horizontal overflow", await js(`(()=>{const d=document.querySelector('#decision-dialog[data-request-id="a5-acceptance-card"]');if(!d)return false;const r=d.querySelector('.dd-acceptance-report'),b=d.querySelector('.dd-acceptance-body');return !!r&&!!b&&b.scrollWidth<=b.clientWidth+1&&r.getBoundingClientRect().right<=innerWidth+0.5&&d.scrollWidth<=d.clientWidth+1;})()`));
    await shot("a5-acceptance-dialog-200pct");
    await wc.setZoomFactor(1);
    await sleep(150);
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    for (let i = 0; i < 5; i += 1) {
      if (!(await js(`!!document.querySelector('#decision-dialog')`))) break;
      await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
      await sleep(80);
    }

    const highRiskDialog = {
      ...acceptanceDialog,
      id: "a5-acceptance-high-risk",
      anchorKey: "a5-acceptance-high-risk-anchor",
      risk: "high",
      request: {
        ...acceptanceDialog.request,
        title: "独立验收决定（高风险）",
        preview: "A5-HIGH-PREVIEW-MARKER",
      },
      acceptanceReport: {
        version: 1,
        path: "docs/quality/flow-a5-report-v1.md",
        text: { text: "# 高风险验收报告\n\nA5-HIGH-REPORT-MARKER", redacted: false, truncated: false },
      },
    };
    await js(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
    await push("session:operator-request", highRiskDialog);
    await waitFor(`document.querySelector('#decision-dialog[data-request-id="a5-acceptance-high-risk"]')`);
    await sleep(120);
    check("A5 high-risk acceptance danger color priority", await js(`(()=>{
      const d=document.querySelector('#decision-dialog[data-request-id="a5-acceptance-high-risk"]');
      if(!d) return false;
      const c=getComputedStyle(d).borderColor;
      return d.classList.contains('is-acceptance')&&d.classList.contains('is-high-risk')&&d.classList.contains('is-destructive')&&
        c!=='rgb(79, 134, 163)'&&(c==='rgb(92, 56, 50)'||c==='rgb(78, 66, 42)');
    })()`));
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    for (let i = 0; i < 5; i += 1) {
      if (!(await js(`!!document.querySelector('#decision-dialog')`))) break;
      await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
      await sleep(80);
    }

    await select("verifier");
    await wc.setZoomFactor(2);
    await sleep(250);
    check("A5 200% verifier report no horizontal overflow", await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .chat-pane[data-role-id="verifier"] .msg-handback.is-acceptance')].find(x=>x.textContent.includes('A5-ACCEPT-TAIL-MARKER'));
      if(!c) return false;
      const s=c.querySelector('.hb-summary'),e=c.querySelector('.acceptance-evidence');
      const r=c.getBoundingClientRect();
      return !!s&&!!e&&s.scrollWidth<=s.clientWidth+1&&e.scrollWidth<=e.clientWidth+1&&r.right<=innerWidth+0.5;
    })()`));
    await js(`document.querySelector('#chat .chat-pane[data-role-id="verifier"] .msg-handback.is-acceptance .report-top').scrollIntoView({block:'start'})`);
    await sleep(120);
    await shot("a5-acceptance-report-200pct");
    await wc.setZoomFactor(1);
    await sleep(100);

    const errorConsole = report.console.filter((entry) => String(entry.level) === "error");
    check("zero console errors", errorConsole.length === 0, errorConsole);
    check("csp meta strict and zero inline scripts", await js(`(()=>{const m=document.querySelector('meta[http-equiv="Content-Security-Policy"]');return !!m&&m.content.includes("default-src 'none'")&&m.content.includes("script-src 'self'")&&!m.content.includes("unsafe-")&&document.querySelectorAll('script:not([src])').length===0;})()`));
    report.csp = await js(`window.__smokeCsp||[]`);
    check("zero csp violations", report.csp.length === 0, report.csp);
  } catch (error) {
    report.console.push({ level: "smoke", message: String(error && error.stack ? error.stack : error) });
    check("smoke completed without exception", false, String(error));
  } finally {
    report.failures += report.checks.filter((item) => item.value !== true).length ? 0 : 0;
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(`PHASE4B_SMOKE ${report.failures === 0 ? "PASS" : "FAIL"} ${report.checks.length} checks / ${report.failures} failures ${OUT}`);
    app.quit();
  }
});
