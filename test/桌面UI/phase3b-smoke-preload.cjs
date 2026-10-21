// test/桌面UI/phase3b-smoke-preload.cjs
// Phase 3B 离线 IPC 替身 preload：只暴露白名单方法的受控桩 + 测试用推送入口。
// 所有业务回包由 smoke 主进程按可控模式返回；不接触真实模型/网络/文件系统。

const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

function subscribe(channel) {
  return (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const list = listeners.get(channel) || [];
    list.push(callback);
    listeners.set(channel, list);
    return () => {
      const current = listeners.get(channel) || [];
      listeners.set(
        channel,
        current.filter((item) => item !== callback),
      );
    };
  };
}

function emit(channel, payload) {
  const list = listeners.get(channel) || [];
  for (const callback of list.slice()) {
    try {
      callback(payload);
    } catch (error) {
      // 测试替身：监听器异常只记录，不影响其它订阅。
      console.error("[smoke-preload] listener error", String(error));
    }
  }
}

contextBridge.exposeInMainWorld("desktop", {
  // —— 会话/项目 ——
  listProject: (projectRoot) => ipcRenderer.invoke("app:list-project", { projectRoot }),
  openSession: (input) => ipcRenderer.invoke("session:open", input),
  sendSession: (text, images, target, metadata) =>
    ipcRenderer.invoke("session:send", { text, images, target, metadata }),
  abortSession: (target) => ipcRenderer.invoke("session:abort", target),
  withdrawQueued: (target, id) => ipcRenderer.invoke("session:withdraw", { target, id }),
  getSessionHistory: (input) => ipcRenderer.invoke("session:history-get", input),
  listLiveSessionViews: () => ipcRenderer.invoke("session:live-views"),
  getRecoveryState: () => ipcRenderer.invoke("app:recovery-state"),
  recoveryReady: () => ipcRenderer.invoke("app:recovery-ready"),
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

  // —— 确认卡 ——
  onShellConfirm: subscribe("shell:confirm-request"),
  shellConfirmRespond: (input) => ipcRenderer.invoke("shell:confirm-response", input),
  onRecoveryConfirm: subscribe("recovery:confirm-request"),
  recoveryConfirmRespond: (input) => ipcRenderer.invoke("recovery:confirm-response", input),

  // —— 双开关 ——
  getShellJudgeState: () => ipcRenderer.invoke("shell:judge-get"),
  setShellJudgeEnabled: (enabled) => ipcRenderer.invoke("shell:judge-set", { enabled }),
  onShellJudgeState: subscribe("shell:judge-state"),
  onShellJudgeResult: subscribe("shell:judge-result"),
  getDecisionJudgeState: () => ipcRenderer.invoke("decision:judge-get"),
  setDecisionJudgeEnabled: (enabled) =>
    ipcRenderer.invoke("decision:judge-set", { enabled }),
  onDecisionJudgeState: subscribe("decision:judge-state"),
  onOperatorJudgeResult: subscribe("session:operator-judge"),

  // —— 附件/窗口（最小）——
  pickImage: () => ipcRenderer.invoke("app:pick-image"),
  attachImage: (input) => ipcRenderer.invoke("app:attach-image", input),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChanged: subscribe("window:maximized-changed"),

  // —— 测试专用：主→渲推送入口（生产 preload 不暴露）——
  __smoke: {
    emit: (channel, payload) => emit(channel, payload),
  },
});
