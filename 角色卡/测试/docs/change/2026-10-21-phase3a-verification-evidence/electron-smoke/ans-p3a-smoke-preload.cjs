// Phase 3A 独立冒烟：离线 IPC 替身 preload（contextIsolation=true）。
// 暴露 window.desktop（宿主契约子集）与 window.__smoke（事件注入 + 调用记录）。
const { contextBridge } = require("electron");

const listeners = {
  event: [],
  roleState: [],
  history: [],
  projectChanged: [],
  operatorRequest: [],
  operatorExpired: [],
  operatorQueued: [],
};
const sendCalls = [];
const operatorResponses = [];
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const noopSub = () => () => {};

const api = {
  minimizeWindow: async () => ({}),
  toggleMaximize: async () => false,
  closeWindow: async () => ({}),
  isMaximized: async () => false,
  onMaximizedChanged: noopSub,
  listProject: async (root) => ({
    projectRoot: String(root),
    primaryRoleId: "A",
    hasRoles: true,
    warnings: [],
    governanceModel: "single",
    roles: [
      { roleId: "su", cardText: "# su\\n内置治理角色", boundary: { entries: [] }, builtIn: true },
      {
        roleId: "A",
        cardText: "# A 角色\\n负责聊天流验证工作",
        boundaryPath: "角色卡/A/boundary.yaml",
        boundary: { entries: [{ root: "project", path: "docs", kind: "directory" }] },
      },
      { roleId: "B", cardText: "# B 角色\\n用于验证会话失败状态", boundary: { entries: [] } },
    ],
  }),
  openSession: async (input) => {
    const roleId = input && typeof input === "object" ? input.roleId : "";
    if (roleId === "B") return { ok: false, error: "测试桩：B 的会话开启失败" };
    return { ok: true, contextSource: "fresh" };
  },
  getSessionHistory: async (input) => ({
    roleId: input && input.roleId,
    projectRoot: input && input.projectRoot,
    runtime: input && input.runtime,
    rows: [],
    error: null,
  }),
  sendSession: async (...args) => {
    sendCalls.push(args);
    return { ok: true };
  },
  pickImage: async () => ({
    ok: true,
    image: { name: "pixel.png", mime: "image/png", size: 68, dataBase64: PNG_1PX },
  }),
  listLiveSessionViews: async () => [],
  operatorRespond: async (payload) => {
    operatorResponses.push(payload);
    return { ok: true };
  },
  getRecoveryState: async () => ({ projectRoot: "" }),
  recoveryReady: async () => ({ ok: true }),
  onSessionEvent: (cb) => { listeners.event.push(cb); return noopSub(); },
  onRoleState: (cb) => { listeners.roleState.push(cb); return noopSub(); },
  onSessionHistory: (cb) => { listeners.history.push(cb); return noopSub(); },
  onProjectChanged: (cb) => { listeners.projectChanged.push(cb); return noopSub(); },
  onOperatorRequest: (cb) => { listeners.operatorRequest.push(cb); return noopSub(); },
  onOperatorExpired: (cb) => { listeners.operatorExpired.push(cb); return noopSub(); },
  onOperatorQueued: (cb) => { listeners.operatorQueued.push(cb); return noopSub(); },
};

contextBridge.exposeInMainWorld("desktop", api);
contextBridge.exposeInMainWorld("__smoke", {
  emitEvent: (payload) => { listeners.event.forEach((cb) => cb(payload)); },
  emitEvents: (arr) => { listeners.event.forEach((cb) => cb(arr)); },
  emitRoleState: (payload) => { listeners.roleState.forEach((cb) => cb(payload)); },
  emitHistory: (payload) => { listeners.history.forEach((cb) => cb(payload)); },
  emitOperatorExpired: (payload) => { listeners.operatorExpired.forEach((cb) => cb(payload)); },
  emitOperatorQueued: (payload) => { listeners.operatorQueued.forEach((cb) => cb(payload)); },
  counts: () => Object.fromEntries(Object.entries(listeners).map(([k, v]) => [k, v.length])),
  sendCalls: () => sendCalls.map((args) => args.map((a) => a)),
  operatorResponses: () => operatorResponses.slice(),
  clearSendCalls: () => { sendCalls.length = 0; },
});
