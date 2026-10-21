// test/桌面UI/phase4b-smoke-preload.cjs
// Phase 4B 离线 IPC 替身 preload：只暴露白名单方法的受控桩 + __smoke.emit 夹具直推。
// 不接触真实模型/网络/文件系统。

const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

function subscribe(channel) {
  return (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const list = listeners.get(channel) || [];
    list.push(callback);
    listeners.set(channel, list);
    const listener = (_event, payload) => {
      try {
        callback(payload);
      } catch (error) {
        console.error("[phase4b-preload] listener error", String(error));
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      const current = listeners.get(channel) || [];
      listeners.set(channel, current.filter((item) => item !== callback));
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

function emit(channel, payload) {
  for (const callback of (listeners.get(channel) || []).slice()) {
    try {
      callback(payload);
    } catch (error) {
      console.error("[phase4b-preload] listener error", String(error));
    }
  }
}

contextBridge.exposeInMainWorld("desktop", {
  __smoke: { emit },

  listProject: (projectRoot) => ipcRenderer.invoke("app:list-project", { projectRoot }),
  openSession: (input) => ipcRenderer.invoke("session:open", input),
  openExternal: (url) =>
    ipcRenderer.invoke("app:open-external", { url: String(url == null ? "" : url) }),
  sendSession: (text, images, target, metadata) =>
    ipcRenderer.invoke("session:send", { text, images, target, metadata }),
  stopSession: (roleId) => ipcRenderer.invoke("session:stop", roleId),
  abortSession: (target) => ipcRenderer.invoke("session:abort", target),
  withdrawQueued: (target, id) => ipcRenderer.invoke("session:withdraw", { target, id }),
  getSessionHistory: (input) => ipcRenderer.invoke("session:history-get", input),
  listLiveSessionViews: () => ipcRenderer.invoke("session:live-views"),
  getRecoveryState: () => ipcRenderer.invoke("app:recovery-state"),
  recoveryReady: () => ipcRenderer.invoke("app:recovery-ready"),
  getRuntimeConfig: (runtime) => ipcRenderer.invoke("runtime-config:get", { runtime }),
  saveRuntimeConfig: (input) => ipcRenderer.invoke("runtime-config:save", input),
  readProjectDocument: (input) => ipcRenderer.invoke("project:document-read", input),
  pickProject: () => ipcRenderer.invoke("app:pick-project"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", { url }),

  onSessionEvent: (callback) => {
    const offSingle = subscribe("session:event")(callback);
    const offBatch = subscribe("session:events")(callback);
    return () => {
      offSingle();
      offBatch();
    };
  },
  onSessionEventBatch: subscribe("session:events"),
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

  // —— Phase 4B：治理记录 / 报告持久化 / 交付回执 ——
  previewGovernanceRecord: (projectRoot, options) =>
    ipcRenderer.invoke("project:governance-preview", { projectRoot, ...(options || {}) }),
  establishGovernanceRecord: (projectRoot, options) =>
    ipcRenderer.invoke("project:governance-establish", { projectRoot, confirm: true, ...(options || {}) }),
  previewGovernanceReacceptance: (projectRoot) =>
    ipcRenderer.invoke("project:governance-reaccept-preview", { projectRoot }),
  reacceptGovernancePins: (projectRoot, previewDigest) =>
    ipcRenderer.invoke("project:governance-reaccept", { projectRoot, confirm: true, previewDigest }),
  previewGovernanceMigration: (projectRoot) =>
    ipcRenderer.invoke("project:governance-migrate-preview", { projectRoot }),
  migrateGovernanceModel: (projectRoot, previewDigest) =>
    ipcRenderer.invoke("project:governance-migrate", { projectRoot, confirm: true, previewDigest }),
  onGovernanceNextStep: subscribe("governance:next-step"),
  getSessionPersistence: (input) => ipcRenderer.invoke("session:get-persistence", input),
  getReportSaveState: (input) => ipcRenderer.invoke("report:get-save-state", input),
  retryReportSave: (input) => ipcRenderer.invoke("report:retry-save", input),
  getDeliveryReceipt: (input) => ipcRenderer.invoke("delivery:get-receipt", input),
  retryDeliveryHistorySave: (input) => ipcRenderer.invoke("delivery:retry-history-save", input),
  onReportPersistenceUpdated: subscribe("report-persistence-updated"),
  onDeliveryHistoryUpdated: subscribe("delivery-history-updated"),
});
