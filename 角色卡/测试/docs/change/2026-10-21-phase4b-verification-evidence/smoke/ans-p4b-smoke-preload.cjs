// Phase 4B 独立冒烟：离线 IPC 替身（contextIsolation=true）。测试角色自写。
const { contextBridge } = require("electron");

const listeners = {
  event: [], roleState: [], history: [], projectChanged: [],
  operatorRequest: [], operatorExpired: [], operatorQueued: [],
  shellConfirm: [], recoveryConfirm: [], shellJudgeResult: [], operatorJudgeResult: [],
  governanceNext: [], reportUpdate: [], deliveryUpdate: [],
};
const calls = {
  openSession: [], history: [], operatorRespond: [], establishPreview: [], establish: [],
  reacceptPreview: [], reaccept: [], migratePreview: [], migrate: [],
  reportProbe: [], reportRetry: [], deliveryProbe: [], deliveryRetry: [], configRead: [],
};
const modes = {
  establish: "ok", reaccept: "ok", migrate: "ok",
  report: "failed", delivery: "failed", operatorRespond: "ok", configCodex: "throw",
  governanceModel: "trio", governanceRecord: { state: "missing", pinCount: 0 },
};
let reportSaved = false;
let deliverySaved = false;

const DIGEST = "0123456789abcdef".repeat(4);
const SCOPE = (input) => ({ projectRoot: input && input.projectRoot, roleId: input && input.roleId, runtime: input && input.runtime });
const CLAUDE_VIEW = { runtime: "claude", label: "Claude", path: "/fixture4b/.env", revision: 1, application: "next-session", missingKeys: [], fields: [{ key: "ANTHROPIC_AUTH_TOKEN", label: "API Key", required: true, secret: true, isSet: true, value: "" }, { key: "ANS_CLAUDE_MODEL", label: "Model", value: "claude-x" }] };
const PI_VIEW = { runtime: "pi", label: "Pi", path: "/fixture4b/.env", revision: 1, application: "next-session", missingKeys: ["ANS_PI_BASE_URL"], fields: [{ key: "ANTHROPIC_AUTH_TOKEN", label: "API Key", required: true, secret: true, isSet: true, value: "" }, { key: "ANS_PI_BASE_URL", label: "Base URL", required: true, value: "" }] };
const CODEX_VIEW = { runtime: "codex", label: "Codex", path: "/fixture4b/.env", revision: 1, application: "next-session", missingKeys: ["CODEX_API_KEY"], fields: [{ key: "CODEX_API_KEY", label: "API Key", required: true, secret: true, isSet: false, value: "" }] };
const VIEWS = { claude: CLAUDE_VIEW, pi: PI_VIEW, codex: CODEX_VIEW };

function roles() {
  return ["A", "B", "C", "D", "E"].map((id, index) => ({
    roleId: id,
    cardText: "# " + id + "\n4B 冒烟角色",
    boundary: { entries: [{ root: "project", path: "docs", kind: "directory", purpose: "文档" }] },
    documents: [],
    builtIn: false,
    governanceFunction: id === "A" ? "liaison" : id === "B" ? "proposal" : id === "C" ? "nomination" : id === "D" ? "schedule" : "acceptance",
    group: index === 0 ? "主入口" : "治理",
  }));
}

function validate(scope, input) {
  const want = SCOPE(input);
  if (!scope || scope.roleId !== want.roleId || scope.runtime !== want.runtime || (scope.projectRoot || "") !== (want.projectRoot || "")) {
    return { version: 1, ok: false, code: "INVALID_REQUEST", scope: want };
  }
  return null;
}

const api = {
  minimizeWindow: async () => ({}), toggleMaximize: async () => false, closeWindow: async () => ({}), isMaximized: async () => false, onMaximizedChanged: () => () => {},
  listProject: async (root) => ({
    projectRoot: String(root), primaryRoleId: "A", hasRoles: true, warnings: [],
    governanceModel: modes.governanceModel,
    governanceRecord: modes.governanceRecord,
    documentScope: { version: 1, projectViewId: "pv-4b", projectRoot: String(root) },
    roles: roles(),
  }),
  openSession: async (input) => { calls.openSession.push(input); return { ok: true, contextSource: "fresh" }; },
  getSessionHistory: async (input) => { calls.history.push(input); return { roleId: input && input.roleId, projectRoot: input && input.projectRoot, runtime: input && input.runtime, rows: [], error: null }; },
  sendSession: async () => ({ ok: true }), abortSession: async () => ({ ok: true }),
  pickImage: async () => ({ ok: false, error: "no" }), attachImage: async () => ({ ok: false, error: "no" }),
  withdrawQueued: async () => ({ ok: true, summary: "撤回" }),
  listLiveSessionViews: async () => [],
  operatorRespond: async (input) => {
    calls.operatorRespond.push(input);
    if (modes.operatorRespond === "delay") await new Promise((r) => setTimeout(r, 350));
    if (modes.operatorRespond === "fail") return { ok: false, error: "通道失败测试" };
    return { ok: true };
  },
  getRecoveryState: async () => ({ projectRoot: "" }), recoveryReady: async () => ({ ok: true }),
  getRuntimeConfig: async (runtime) => {
    calls.configRead.push(runtime);
    if (runtime === "codex" && modes.configCodex === "throw") throw new Error("配置读取失败测试");
    return VIEWS[runtime];
  },
  saveRuntimeConfig: async () => ({ ok: true, appliedKeys: [], application: "next-session" }),
  previewGovernanceRecord: async (root, options) => {
    calls.establishPreview.push({ root, options });
    return { ok: true, preview: {
      writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
      pinPaths: ["docs/a.md", "docs/b.md"], pinCount: 2, roleCount: 4,
      governanceModel: options && options.governanceModel ? options.governanceModel : "single",
      suggestedGovernanceModel: "trio", adoptExistingBoundary: false,
      boundaryPath: "docs/governance-boundary.md", legacyBoundaryRoles: [], blockers: [], canConfirm: true,
    } };
  },
  establishGovernanceRecord: async (root, options) => {
    calls.establish.push({ root, options });
    if (modes.establish === "fail-write") return { ok: false, phase: "write", code: "IO_ERROR", finalize: { status: "blocked", message: "写入阶段失败测试" } };
    if (modes.establish === "fail-guard") return { ok: false, phase: "guard", code: "already-established", finalize: { status: "blocked", message: "已存在测试" } };
    return { ok: true, phase: "write", code: "", finalize: { status: "completed", message: "治理记录已建立，pin 已写入。" } };
  },
  previewGovernanceReacceptance: async (root) => {
    calls.reacceptPreview.push({ root });
    return { ok: true, preview: {
      changed: [
        { path: "docs/a.md", status: "modified", pinned: "a".repeat(64), actual: "b".repeat(64) },
        { path: "docs/b.md", status: "missing" },
        { path: "docs/c.md", status: "unreadable" },
      ],
      pinCount: 3, blockers: [], canConfirm: true, previewDigest: DIGEST,
    } };
  },
  reacceptGovernancePins: async (root, digest) => {
    calls.reaccept.push({ root, digest });
    return { ok: true, status: "completed", message: "" };
  },
  previewGovernanceMigration: async (root) => {
    calls.migratePreview.push({ root });
    return { ok: false, status: "not-available", message: "迁移预览尚未在本版接线。" };
  },
  migrateGovernanceModel: async (root, digest) => {
    calls.migrate.push({ root, digest });
    return { ok: false, status: "not-available", message: "迁移尚未在本版接线。" };
  },
  readProjectDocument: async () => ({ version: 1, ok: false, code: "NOT_FOUND" }),
  retryReportSave: async (input) => {
    calls.reportRetry.push(input);
    reportSaved = true;
    return { version: 1, ok: true, scope: SCOPE(input), value: { state: "saved", retryAvailable: false } };
  },
  getReportSaveState: async (input) => {
    calls.reportProbe.push(input);
    if (modes.report === "failed" && !reportSaved) {
      return { version: 1, ok: true, scope: SCOPE(input), value: { state: "failed", retryAvailable: true, code: "" } };
    }
    if (modes.report === "expired") {
      return { version: 1, ok: true, scope: SCOPE(input), value: { state: "expired", retryAvailable: false, code: "SNAPSHOT_EXPIRED" } };
    }
    return { version: 1, ok: true, scope: SCOPE(input), value: { state: "saved", retryAvailable: false } };
  },
  retryDeliveryHistorySave: async (input) => {
    calls.deliveryRetry.push(input);
    deliverySaved = true;
    return { version: 1, ok: true, scope: SCOPE(input), value: { version: 1, attemptId: input && input.attemptId, history: "saved", inputSaved: true, outcome: "completed", retryHistoryAvailable: false } };
  },
  getDeliveryReceipt: async (input) => {
    calls.deliveryProbe.push(input);
    if (modes.delivery === "expired") {
      return { version: 1, ok: true, scope: SCOPE(input), value: { version: 1, attemptId: input && input.attemptId, history: "expired", inputSaved: false, outcome: "completed", retryHistoryAvailable: false, code: "SNAPSHOT_EXPIRED" } };
    }
    if (!deliverySaved) {
      return { version: 1, ok: true, scope: SCOPE(input), value: { version: 1, attemptId: input && input.attemptId, history: "failed", inputSaved: false, outcome: "completed", retryHistoryAvailable: true } };
    }
    return { version: 1, ok: true, scope: SCOPE(input), value: { version: 1, attemptId: input && input.attemptId, history: "saved", inputSaved: true, outcome: "completed", retryHistoryAvailable: false } };
  },
  openExternal: async () => ({ ok: true }),
  shellConfirmRespond: async () => ({ ok: true }), recoveryConfirmRespond: async () => ({ ok: true }),
  getShellJudgeState: async () => ({ ok: true, version: 1, enabled: false, available: true }),
  setShellJudgeEnabled: async (e) => ({ ok: true, version: 1, enabled: e === true, available: true }),
  getDecisionJudgeState: async () => ({ ok: true, version: 1, enabled: false, available: true }),
  setDecisionJudgeEnabled: async (e) => ({ ok: true, version: 1, enabled: e === true, available: true }),
  onSessionEvent: (cb) => { listeners.event.push(cb); return () => {}; },
  onRoleState: (cb) => { listeners.roleState.push(cb); return () => {}; },
  onSessionHistory: (cb) => { listeners.history.push(cb); return () => {}; },
  onProjectChanged: (cb) => { listeners.projectChanged.push(cb); return () => {}; },
  onOperatorRequest: (cb) => { listeners.operatorRequest.push(cb); return () => {}; },
  onOperatorExpired: (cb) => { listeners.operatorExpired.push(cb); return () => {}; },
  onOperatorQueued: (cb) => { listeners.operatorQueued.push(cb); return () => {}; },
  onGovernanceNextStep: (cb) => { listeners.governanceNext.push(cb); return () => {}; },
  onShellConfirm: (cb) => { listeners.shellConfirm.push(cb); return () => {}; },
  onRecoveryConfirm: (cb) => { listeners.recoveryConfirm.push(cb); return () => {}; },
  onShellJudgeState: () => () => {},
  onShellJudgeResult: (cb) => { listeners.shellJudgeResult.push(cb); return () => {}; },
  onDecisionJudgeState: () => () => {},
  onOperatorJudgeResult: (cb) => { listeners.operatorJudgeResult.push(cb); return () => {}; },
  onReportPersistenceUpdated: (cb) => { listeners.reportUpdate.push(cb); return () => {}; },
  onDeliveryHistoryUpdated: (cb) => { listeners.deliveryUpdate.push(cb); return () => {}; },
};

contextBridge.exposeInMainWorld("desktop", api);
contextBridge.exposeInMainWorld("__smoke4b", {
  setMode: (name, value) => { if (name in modes) modes[name] = value; },
  setGovernance: (model, record) => { modes.governanceModel = model; modes.governanceRecord = record || null; },
  resetSaved: () => { reportSaved = false; deliverySaved = false; },
  calls: () => JSON.parse(JSON.stringify(calls)),
  emitEvent: (p) => listeners.event.forEach((cb) => cb(p)),
  emitRoleState: (p) => listeners.roleState.forEach((cb) => cb(p)),
  emitHistory: (p) => listeners.history.forEach((cb) => cb(p)),
  emitOperatorRequest: (p) => listeners.operatorRequest.forEach((cb) => cb(p)),
  emitOperatorQueued: (p) => listeners.operatorQueued.forEach((cb) => cb(p)),
  emitOperatorExpired: (p) => listeners.operatorExpired.forEach((cb) => cb(p)),
  emitGovernanceNext: (p) => listeners.governanceNext.forEach((cb) => cb(p)),
  emitShellJudge: (p) => listeners.shellJudgeResult.forEach((cb) => cb(p)),
  emitOperatorJudge: (p) => listeners.operatorJudgeResult.forEach((cb) => cb(p)),
  emitReportUpdate: (p) => listeners.reportUpdate.forEach((cb) => cb(p)),
  emitDeliveryUpdate: (p) => listeners.deliveryUpdate.forEach((cb) => cb(p)),
});
