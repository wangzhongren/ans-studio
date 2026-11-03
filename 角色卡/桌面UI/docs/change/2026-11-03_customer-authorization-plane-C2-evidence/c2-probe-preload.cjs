// C2 supplementary Electron probe preload (evidence only; not a product/test source file).
// Mirrors the controlled phase3b stub and adds the five C1-frozen directive methods.

const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

function subscribe(channel) {
  return (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const list = listeners.get(channel) || [];
    list.push(callback);
    listeners.set(channel, list);
    // Real main→renderer push (same shape as production preload); __smoke.emit stays for direct injection.
    const listener = (_event, payload) => {
      try {
        callback(payload);
      } catch (error) {
        console.error("[c2-probe-preload] listener error", String(error));
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
  const list = listeners.get(channel) || [];
  for (const callback of list.slice()) {
    try {
      callback(payload);
    } catch (error) {
      console.error("[c2-probe-preload] listener error", String(error));
    }
  }
}

let lastDirectiveState = null;
const ipcSeen = [];

// Top-level production-style cache probe: proves main→renderer IPC delivery independently
// of the exposed subscription closures.
ipcRenderer.on("directive:state", (_event, payload) => {
  ipcSeen.push(payload);
  lastDirectiveState = payload;
});
ipcRenderer.on("directive:confirm-request", (_event, payload) => {
  ipcSeen.push({ channel: "directive:confirm-request", payload });
});

contextBridge.exposeInMainWorld("desktop", {
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

  onShellConfirm: subscribe("shell:confirm-request"),
  shellConfirmRespond: (input) => ipcRenderer.invoke("shell:confirm-response", input),
  onRecoveryConfirm: subscribe("recovery:confirm-request"),
  recoveryConfirmRespond: (input) => ipcRenderer.invoke("recovery:confirm-response", input),

  getShellJudgeState: () => ipcRenderer.invoke("shell:judge-get"),
  setShellJudgeEnabled: (enabled) => ipcRenderer.invoke("shell:judge-set", { enabled }),
  onShellJudgeState: subscribe("shell:judge-state"),
  onShellJudgeResult: subscribe("shell:judge-result"),
  getDecisionJudgeState: () => ipcRenderer.invoke("decision:judge-get"),
  setDecisionJudgeEnabled: (enabled) =>
    ipcRenderer.invoke("decision:judge-set", { enabled }),
  onDecisionJudgeState: subscribe("decision:judge-state"),
  onOperatorJudgeResult: subscribe("session:operator-judge"),

  // C1-frozen directive bridge (five methods).
  onDirectiveConfirmRequest: subscribe("directive:confirm-request"),
  directiveConfirmRespond: (input) =>
    ipcRenderer.invoke("directive:confirm-response", input),
  listDirectives: (input) => ipcRenderer.invoke("directive:list", input),
  revokeDirective: (input) => ipcRenderer.invoke("directive:revoke", input),
  onDirectiveState: (callback) => {
    if (lastDirectiveState !== null) {
      try {
        callback(lastDirectiveState);
      } catch (error) {
        console.error("[c2-probe-preload] state replay error", String(error));
      }
    }
    return subscribe("directive:state")((payload) => {
      lastDirectiveState = payload;
      callback(payload);
    });
  },

  pickImage: () => ipcRenderer.invoke("app:pick-image"),
  attachImage: (input) => ipcRenderer.invoke("app:attach-image", input),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChanged: subscribe("window:maximized-changed"),

  __smoke: {
    emit: (channel, payload) => emit(channel, payload),
    ipcSeen: () => ipcSeen.slice(),
  },
});
