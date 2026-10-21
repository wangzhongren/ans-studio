// Phase 3B 独立冒烟：离线 IPC 替身（contextIsolation=true）。
const { contextBridge } = require("electron");

const listeners = {
  event: [], roleState: [], history: [], projectChanged: [],
  operatorRequest: [], operatorExpired: [], operatorQueued: [],
  shellConfirm: [], recoveryConfirm: [], shellJudgeState: [],
  shellJudgeResult: [], decisionJudgeState: [], operatorJudgeResult: [],
};
const calls = {
  send: [], abort: [], shellRespond: [], recoveryRespond: [],
  withdraw: [], attachImage: [], shellJudgeSet: [], decisionJudgeSet: [],
};
const modes = { send: "ok", abort: "ok", shellRespond: "ok", recoveryRespond: "ok", withdraw: "ok" };
let shellJudgeEnabled = false;
let decisionJudgeEnabled = false;

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const api = {
  minimizeWindow: async () => ({}),
  toggleMaximize: async () => false,
  closeWindow: async () => ({}),
  isMaximized: async () => false,
  onMaximizedChanged: () => () => {},
  listProject: async (root) => ({
    projectRoot: String(root),
    primaryRoleId: "A",
    hasRoles: true,
    warnings: [],
    governanceModel: String(root).includes("single") ? "single" : "trio",
    roles: [
      { roleId: "A", cardText: "# A\n3B 冒烟角色", boundary: { entries: [] } },
      { roleId: "B", cardText: "# B\n草稿/队列角色", boundary: { entries: [] } },
    ],
  }),
  openSession: async () => ({ ok: true, contextSource: "fresh" }),
  getSessionHistory: async (input) => ({ roleId: input && input.roleId, projectRoot: input && input.projectRoot, runtime: input && input.runtime, rows: [], error: null }),
  sendSession: async (...args) => {
    calls.send.push(args);
    if (modes.send === "queued") return { ok: true, queued: true, position: 2 };
    if (modes.send === "reject") return { ok: false, error: "测试拒绝", inputAccepted: false };
    if (modes.send === "accepted-failed") return { ok: false, error: "已接受后失败", inputAccepted: true, outcome: "failed" };
    return { ok: true };
  },
  abortSession: async (target) => {
    calls.abort.push(target);
    if (modes.abort === "unsupported") return { ok: false, supported: false };
    if (modes.abort === "fail") return { ok: false, supported: true, error: "停止失败原因" };
    return { ok: true };
  },
  pickImage: async () => ({ ok: true, image: { name: "picked.png", mime: "image/png", size: 68, dataBase64: PNG } }),
  attachImage: async (input) => {
    calls.attachImage.push(input);
    return { ok: true, image: { name: input && input.name, mime: input && input.mime, size: input && String(input.dataBase64 || "").length } };
  },
  withdrawQueued: async (target, id) => {
    calls.withdraw.push([target, id]);
    if (modes.withdraw === "fail") return { ok: false, error: "消息已投递" };
    return { ok: true, summary: "被撤回的排队消息" };
  },
  listLiveSessionViews: async () => [],
  operatorRespond: async () => ({ ok: true }),
  getRecoveryState: async () => ({ projectRoot: "" }),
  recoveryReady: async () => ({ ok: true }),
  shellConfirmRespond: async (input) => {
    calls.shellRespond.push(input);
    if (modes.shellRespond === "expired") return { expired: true };
    if (modes.shellRespond === "fail") return {};
    return { ok: true };
  },
  recoveryConfirmRespond: async (input) => {
    calls.recoveryRespond.push(input);
    if (modes.recoveryRespond === "expired") return { expired: true };
    if (modes.recoveryRespond === "fail") return {};
    return { ok: true };
  },
  getShellJudgeState: async () => ({ version: 1, enabled: shellJudgeEnabled, available: true }),
  setShellJudgeEnabled: async (enabled) => {
    calls.shellJudgeSet.push(enabled === true);
    shellJudgeEnabled = enabled === true;
    return { ok: true, version: 1, enabled: shellJudgeEnabled, available: true };
  },
  getDecisionJudgeState: async () => ({ version: 1, enabled: decisionJudgeEnabled, available: true }),
  setDecisionJudgeEnabled: async (enabled) => {
    calls.decisionJudgeSet.push(enabled === true);
    decisionJudgeEnabled = enabled === true;
    return { ok: true, version: 1, enabled: decisionJudgeEnabled, available: true };
  },
  onSessionEvent: (cb) => { listeners.event.push(cb); return () => {}; },
  onRoleState: (cb) => { listeners.roleState.push(cb); return () => {}; },
  onSessionHistory: (cb) => { listeners.history.push(cb); return () => {}; },
  onProjectChanged: (cb) => { listeners.projectChanged.push(cb); return () => {}; },
  onOperatorRequest: (cb) => { listeners.operatorRequest.push(cb); return () => {}; },
  onOperatorExpired: (cb) => { listeners.operatorExpired.push(cb); return () => {}; },
  onOperatorQueued: (cb) => { listeners.operatorQueued.push(cb); return () => {}; },
  onShellConfirm: (cb) => { listeners.shellConfirm.push(cb); return () => {}; },
  onRecoveryConfirm: (cb) => { listeners.recoveryConfirm.push(cb); return () => {}; },
  onShellJudgeState: (cb) => { listeners.shellJudgeState.push(cb); return () => {}; },
  onShellJudgeResult: (cb) => { listeners.shellJudgeResult.push(cb); return () => {}; },
  onDecisionJudgeState: (cb) => { listeners.decisionJudgeState.push(cb); return () => {}; },
  onOperatorJudgeResult: (cb) => { listeners.operatorJudgeResult.push(cb); return () => {}; },
};

contextBridge.exposeInMainWorld("desktop", api);
contextBridge.exposeInMainWorld("__smoke3b", {
  setMode: (name, value) => { if (name in modes) modes[name] = value; },
  emitShellConfirm: (p) => listeners.shellConfirm.forEach((cb) => cb(p)),
  emitRecoveryConfirm: (p) => listeners.recoveryConfirm.forEach((cb) => cb(p)),
  emitShellJudgeResult: (p) => listeners.shellJudgeResult.forEach((cb) => cb(p)),
  emitOperatorJudgeResult: (p) => listeners.operatorJudgeResult.forEach((cb) => cb(p)),
  emitShellJudgeState: (p) => listeners.shellJudgeState.forEach((cb) => cb(p)),
  emitDecisionJudgeState: (p) => listeners.decisionJudgeState.forEach((cb) => cb(p)),
  emitEvent: (p) => listeners.event.forEach((cb) => cb(p)),
  emitRoleState: (p) => listeners.roleState.forEach((cb) => cb(p)),
  emitOperatorExpired: (p) => listeners.operatorExpired.forEach((cb) => cb(p)),
  calls: () => JSON.parse(JSON.stringify(calls)),
  counts: () => Object.fromEntries(Object.entries(listeners).map(([k, v]) => [k, v.length])),
  clearCalls: () => { for (const key of Object.keys(calls)) calls[key].length = 0; },
});
