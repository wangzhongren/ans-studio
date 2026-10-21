// test/测试/phase3a-lazy-toolgroup-preload.cjs
// Phase 3A 延迟挂载正向检查的离线 IPC 替身（contextIsolation=true）。
const { contextBridge } = require("electron");
const listeners = { event: [], roleState: [], history: [], projectChanged: [] };

contextBridge.exposeInMainWorld("desktop", {
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
    governanceModel: "single",
    roles: [
      { roleId: "A", cardText: "# A\n延迟挂载检查", boundary: { entries: [] } },
      { roleId: "B", cardText: "# B\n小工具组对照", boundary: { entries: [] } },
    ],
  }),
  openSession: async () => ({ ok: true, contextSource: "fresh" }),
  getSessionHistory: async (input) => ({ roleId: input && input.roleId, projectRoot: input && input.projectRoot, runtime: input && input.runtime, rows: [], error: null }),
  sendSession: async () => ({ ok: true }),
  listLiveSessionViews: async () => [],
  operatorRespond: async () => ({ ok: true }),
  getRecoveryState: async () => ({ projectRoot: "" }),
  recoveryReady: async () => ({ ok: true }),
  onSessionEvent: (cb) => { listeners.event.push(cb); return () => {}; },
  onRoleState: (cb) => { listeners.roleState.push(cb); return () => {}; },
  onSessionHistory: (cb) => { listeners.history.push(cb); return () => {}; },
  onProjectChanged: (cb) => { listeners.projectChanged.push(cb); return () => {}; },
});

contextBridge.exposeInMainWorld("__lazy", {
  emitEvents: (arr) => { listeners.event.forEach((cb) => cb(arr)); },
  emitRoleState: (payload) => { listeners.roleState.forEach((cb) => cb(payload)); },
});
