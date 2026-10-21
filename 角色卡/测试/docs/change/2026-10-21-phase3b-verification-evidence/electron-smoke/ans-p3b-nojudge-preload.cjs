// Phase 3B 冒烟：桥缺失变体（无 judge 四方法），用于验证双开关禁用 + 固定文案。
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
    governanceModel: "trio",
    roles: [{ roleId: "A", cardText: "# A", boundary: { entries: [] } }],
  }),
  openSession: async () => ({ ok: true, contextSource: "fresh" }),
  getSessionHistory: async (input) => ({ roleId: input && input.roleId, projectRoot: input && input.projectRoot, runtime: input && input.runtime, rows: [], error: null }),
  sendSession: async () => ({ ok: true }),
  listLiveSessionViews: async () => [],
  getRecoveryState: async () => ({ projectRoot: "" }),
  recoveryReady: async () => ({ ok: true }),
  onSessionEvent: (cb) => { listeners.event.push(cb); return () => {}; },
  onRoleState: (cb) => { listeners.roleState.push(cb); return () => {}; },
  onSessionHistory: (cb) => { listeners.history.push(cb); return () => {}; },
  onProjectChanged: (cb) => { listeners.projectChanged.push(cb); return () => {}; },
});
