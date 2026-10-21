// Phase 4A 独立冒烟：离线 IPC 替身（contextIsolation=true）。
const { contextBridge } = require("electron");

const listeners = {
  event: [], roleState: [], history: [], projectChanged: [],
  operatorRequest: [], operatorExpired: [], operatorQueued: [],
  shellConfirm: [], recoveryConfirm: [], shellJudgeResult: [], operatorJudgeResult: [],
};
const calls = { openSession: [], history: [], send: [], withdraw: [], configRead: [], configSave: [], docRead: [], openExternal: [] };
const modes = { configRead: "ok", configSave: "ok", docRead: "ok", withdraw: "ok" };
let docCallCount = 0;

const PI_VIEW = {
  runtime: "pi", label: "Pi", path: "/fixture4a/.env", revision: 1, application: "next-session", missingKeys: [],
  fields: [
    { key: "ANTHROPIC_AUTH_TOKEN", label: "API Key", required: true, secret: true, isSet: true, value: "" },
    { key: "ANS_PI_BASE_URL", label: "Base URL", required: true, value: "https://pi.example" },
    { key: "ANS_PI_MODEL", label: "Model", required: true, value: "model-x" },
    { key: "ANS_PI_REASONING_EFFORT", label: "推理强度", control: "range", choices: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], choiceLabels: ["关", "极低", "低", "中", "高", "极高", "最高"], value: "custom-tier" },
    { key: "ANS_PI_CONTEXT_WINDOW", label: "上下文窗口", control: "range", choices: ["100000", "200000", "500000", "1000000", "2000000"], value: "500000", integer: { min: 1000, max: 10000000 } },
  ],
};
const CODEX_VIEW = {
  runtime: "codex", label: "Codex", path: "/fixture4a/.env", revision: 1, application: "next-session", missingKeys: ["CODEX_API_KEY"],
  fields: [
    { key: "CODEX_API_KEY", label: "API Key", secret: true, required: true, isSet: false, value: "" },
    { key: "ANS_CODEX_MODEL", label: "Model", value: "gpt-x" },
    { key: "ANS_CODEX_BASE_URL", label: "Base URL", value: "" },
  ],
};
const CLAUDE_VIEW = {
  runtime: "claude", label: "Claude", path: "/fixture4a/.env", revision: 1, application: "next-session", missingKeys: [],
  fields: [
    { key: "ANTHROPIC_AUTH_TOKEN", label: "API Key", secret: true, isSet: true, value: "" },
    { key: "ANS_CLAUDE_MODEL", label: "Model", value: "claude-x" },
  ],
};
const VIEWS = { pi: PI_VIEW, codex: CODEX_VIEW, claude: CLAUDE_VIEW };
const ROWS = { pi: [{ kind: "assistant", text: "PI-HISTORY", at: "2026-10-21T01:00:00Z" }], codex: [{ kind: "assistant", text: "CODEX-HISTORY", at: "2026-10-21T02:00:00Z" }], claude: [] };

const api = {
  minimizeWindow: async () => ({}), toggleMaximize: async () => false, closeWindow: async () => ({}), isMaximized: async () => false, onMaximizedChanged: () => () => {},
  listProject: async (root) => ({
    projectRoot: String(root), primaryRoleId: "A", hasRoles: true, warnings: [], governanceModel: "trio",
    documentScope: { version: 1, projectViewId: "pv-1", projectRoot: String(root) },
    roles: [
      { roleId: "A", cardText: "# A\n4A 冒烟角色", boundary: { entries: [{ root: "project", path: "docs", kind: "directory", purpose: "文档" }] }, documents: [{ version: 1, projectViewId: "pv-1", documentId: "doc-1", roleId: "A", relativePath: "docs/a.md", label: "A 文档", format: "markdown" }], docs: [] },
      { roleId: "B", cardText: "# B\n另一角色", boundary: { entries: [] }, documents: [], docs: [] },
    ],
  }),
  openSession: async (input) => { calls.openSession.push(input); return { ok: true, contextSource: "fresh" }; },
  getSessionHistory: async (input) => { calls.history.push(input); const runtime = input && input.runtime; return { roleId: input && input.roleId, projectRoot: input && input.projectRoot, runtime, rows: ROWS[runtime] || [], error: null }; },
  sendSession: async (...args) => { calls.send.push(args); return { ok: true }; },
  abortSession: async () => ({ ok: true }),
  pickImage: async () => ({ ok: false, error: "no" }),
  attachImage: async () => ({ ok: false, error: "no" }),
  withdrawQueued: async (target, id) => { calls.withdraw.push([target, id]); if (modes.withdraw === "fail") return { ok: false, error: "消息已投递" }; return { ok: true, summary: "撤回的消息" }; },
  listLiveSessionViews: async () => [],
  operatorRespond: async () => ({ ok: true }),
  getRecoveryState: async () => ({ projectRoot: "" }),
  recoveryReady: async () => ({ ok: true }),
  getRuntimeConfig: async (runtime) => {
    calls.configRead.push(runtime);
    if (modes.configRead === "fail") return { ok: false, error: "读取失败测试" };
    if (modes.configRead === "delay" && runtime === "pi") {
      await new Promise((r) => setTimeout(r, 350));
    }
    return VIEWS[runtime];
  },
  saveRuntimeConfig: async (input) => {
    calls.configSave.push(input);
    if (modes.configSave === "fail") return { ok: false, error: "保存失败测试" };
    if (modes.configSave === "delay") {
      await new Promise((r) => setTimeout(r, 450));
    }
    const updates = (input && input.updates) || {};
    return { ok: true, appliedKeys: Object.keys(updates), application: "next-session" };
  },
  readProjectDocument: async (input) => {
    calls.docRead.push(input);
    docCallCount += 1;
    if (modes.docRead === "errorOnce" && docCallCount === 1) return { version: 1, ok: false, code: "NOT_FOUND" };
    if (modes.docRead === "error") return { version: 1, ok: false, code: "IO_ERROR" };
    return { ok: true, version: 1, projectViewId: input && input.projectViewId, documentId: input && input.documentId, roleId: "A", relativePath: "docs/a.md", format: "markdown", byteLength: 24, text: "# 文档正文\n\n只读内容 <script>window.__docx=1</script>" };
  },
  openExternal: async (url) => { calls.openExternal.push(url); return { ok: true }; },
  shellConfirmRespond: async () => ({ ok: true }),
  recoveryConfirmRespond: async () => ({ ok: true }),
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
  onShellConfirm: (cb) => { listeners.shellConfirm.push(cb); return () => {}; },
  onRecoveryConfirm: (cb) => { listeners.recoveryConfirm.push(cb); return () => {}; },
  onShellJudgeState: () => () => {},
  onShellJudgeResult: (cb) => { listeners.shellJudgeResult.push(cb); return () => {}; },
  onDecisionJudgeState: () => () => {},
  onOperatorJudgeResult: (cb) => { listeners.operatorJudgeResult.push(cb); return () => {}; },
};
contextBridge.exposeInMainWorld("desktop", api);
contextBridge.exposeInMainWorld("__smoke4a", {
  setMode: (name, value) => { if (name in modes) modes[name] = value; },
  resetDocCount: () => { docCallCount = 0; },
  emitEvent: (p) => listeners.event.forEach((cb) => cb(p)),
  emitRoleState: (p) => listeners.roleState.forEach((cb) => cb(p)),
  emitOperatorExpired: (p) => listeners.operatorExpired.forEach((cb) => cb(p)),
  calls: () => JSON.parse(JSON.stringify(calls)),
  counts: () => Object.fromEntries(Object.entries(listeners).map(([k, v]) => [k, v.length])),
});
