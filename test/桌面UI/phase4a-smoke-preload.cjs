// test/桌面UI/phase4a-smoke-preload.cjs
// Phase 4A 离线 IPC 替身 preload：只暴露白名单方法的受控桩 + 测试用推送入口。
// 所有业务回包由 smoke 主进程按可控模式返回；不接触真实模型/网络/文件系统。

const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

function subscribe(channel) {
  return (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const list = listeners.get(channel) || [];
    list.push(callback);
    listeners.set(channel, list);
    // 同时接真实主进程推送（与生产 preload 同形），__smoke.emit 只用于夹具直推。
    const listener = (_event, payload) => {
      try {
        callback(payload);
      } catch (error) {
        console.error("[phase4a-preload] listener error", String(error));
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      const current = listeners.get(channel) || [];
      listeners.set(
        channel,
        current.filter((item) => item !== callback),
      );
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

function emit(channel, payload) {
  const list = listeners.get(channel) || [];
  for (const callback of list.slice()) {
    try {
      callback(payload);
    } catch (error) {
      console.error("[phase4a-preload] listener error", String(error));
    }
  }
}

contextBridge.exposeInMainWorld("desktop", {
  // —— 项目/会话/历史 ——
  listProject: (projectRoot) => ipcRenderer.invoke("app:list-project", { projectRoot }),
  openSession: (input) => ipcRenderer.invoke("session:open", input),
  sendSession: (text, images, target, metadata) =>
    ipcRenderer.invoke("session:send", { text, images, target, metadata }),
  stopSession: (roleId) => ipcRenderer.invoke("session:stop", roleId),
  abortSession: (target) => ipcRenderer.invoke("session:abort", target),
  withdrawQueued: (target, id) => ipcRenderer.invoke("session:withdraw", { target, id }),
  getSessionHistory: (input) => ipcRenderer.invoke("session:history-get", input),
  listLiveSessionViews: () => ipcRenderer.invoke("session:live-views"),
  getRecoveryState: () => ipcRenderer.invoke("app:recovery-state"),
  recoveryReady: () => ipcRenderer.invoke("app:recovery-ready"),

  // —— 引擎设置（4A）——
  getRuntimeConfig: (runtime) => ipcRenderer.invoke("runtime-config:get", { runtime }),
  saveRuntimeConfig: (input) => ipcRenderer.invoke("runtime-config:save", input),
  getPiConfig: () => ipcRenderer.invoke("pi-config:get"),
  savePiConfig: (updates) => ipcRenderer.invoke("pi-config:save", { updates }),

  // —— 文档只读（4A）——
  readProjectDocument: (input) => ipcRenderer.invoke("project:document-read", input),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", { url: String(url == null ? "" : url) }),

  // —— 订阅 ——
  onSessionEvent: (callback) => {
    const offSingle = subscribe("session:event")(callback);
    const offBatch = subscribe("session:events")(callback);
    return () => {
      offSingle();
      offBatch();
    };
  },
  onRoleState: subscribe("session:role-state"),
  onSessionHistory: subscribe("session:history"),
  onProjectChanged: subscribe("project:changed"),
  onOperatorRequest: subscribe("session:operator-request"),
  onOperatorExpired: subscribe("session:operator-expired"),
  onOperatorQueued: subscribe("session:operator-queued"),
  operatorRespond: (input) => ipcRenderer.invoke("session:operator-response", input),
  onShellConfirm: subscribe("shell:confirm-request"),
  shellConfirmRespond: (input) => ipcRenderer.invoke("shell:confirm-response", input),
  onRecoveryConfirm: subscribe("recovery:confirm-request"),
  recoveryConfirmRespond: (input) => ipcRenderer.invoke("recovery:confirm-response", input),
  getShellJudgeState: () => ipcRenderer.invoke("shell:judge-get"),
  setShellJudgeEnabled: (enabled) => ipcRenderer.invoke("shell:judge-set", { enabled: enabled === true }),
  onShellJudgeState: subscribe("shell:judge-state"),
  onShellJudgeResult: subscribe("shell:judge-result"),
  getDecisionJudgeState: () => ipcRenderer.invoke("decision:judge-get"),
  setDecisionJudgeEnabled: (enabled) => ipcRenderer.invoke("decision:judge-set", { enabled: enabled === true }),
  onDecisionJudgeState: subscribe("decision:judge-state"),
  onOperatorJudgeResult: subscribe("session:operator-judge"),

  // —— 图片/窗口 ——
  pickImage: () => ipcRenderer.invoke("app:pick-image"),
  attachImage: (input) => ipcRenderer.invoke("app:attach-image", input),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChanged: subscribe("window:maximized-changed"),

  // —— 测试推送入口（仅替身）——
  __smoke: { emit },
});
