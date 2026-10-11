// app/preload.cjs
// 渲染进程 ↔ 主进程 的受限桥（Interface 层）。
//
// 纪律：只暴露白名单 IPC 通道，**不暴露** require / fs / process 等任何 Node 能力。
// 渲染进程唯一能做的事，就是调用下面这些方法。
//
// 采用 CommonJS（.cjs）：preload 由 Electron 自行加载，不经 Node 的类型擦除/ESM 解析，
// 用 CJS 最稳。

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  /** 调系统文件夹选择器导入项目，返回项目根路径或 null。 */
  pickProject: () => ipcRenderer.invoke("app:pick-project"),

  /** 枚举项目下的角色（含角色卡正文、边界条目、文档与变更记录索引）。 */
  listProject: (projectRoot) => ipcRenderer.invoke("app:list-project", { projectRoot }),

  /** 点角色即开：直接建立与该角色的会话（导入项目即授权，无确认框）。 */
  openSession: (input) => ipcRenderer.invoke("session:open", input),

  /** 发送一轮消息；开启后可反复调用（多轮聊天，不再确认）。 */
  sendSession: (text) => ipcRenderer.invoke("session:send", { text }),

  /** 关闭当前会话（切换角色或退出时）。 */
  stopSession: () => ipcRenderer.invoke("session:stop"),

  /**
   * 创世 finalize（T36）：「完成 bootstrap」动作的可见性/就绪状态（`{available, settled, finalized}`）。
   * 仅创世 su 会话可能 available；渲染侧据它决定是否显示入口、并提示「该不该现在点」。纯读。
   */
  getBootstrapState: () => ipcRenderer.invoke("session:bootstrap-state"),

  /**
   * 显式完成 bootstrap（T36/T38）：**T37 语义 = su 提议收口 → 挂起等客户确认 → 确认通过才落盘**。
   * 返回 `FinalizeResult`（`{ok, wrote, pins, roles, reason?, ...}`）——**成功示写出了什么、失败示原因**
   * （未接确认通道 / 客户拒绝 / 超时 → **不完成**，fail-closed）。
   */
  finalizeBootstrap: () => ipcRenderer.invoke("session:finalize"),

  /**
   * 订阅「su 提议收口」事件（T38）：finalize 收口时，主进程把提议推来，渲染侧应把它渲染为
   * **聊天流里的一张确认卡**（提议原文 + `[确认完成]`/`[暂不]`）。入参 `{toolCallId, proposal, reason}`。
   * 返回取消订阅函数。
   */
  onFinalizeProposal: (cb) => {
    const listener = (_event, p) => cb(p);
    ipcRenderer.on("session:finalize-proposal", listener);
    return () => ipcRenderer.removeListener("session:finalize-proposal", listener);
  },

  /**
   * 回传客户对「su 提议收口」的选择（T38）：`{toolCallId, allow}`——allow:true=[确认完成]，
   * 否则=[暂不]。解挂主进程挂起的确认 Promise（→ finalize 落盘 / 不完成）。回报 `{ok, error?}`。
   */
  finalizeConfirm: (input) => ipcRenderer.invoke("session:finalize-confirm", input),

  /**
   * 读取 Pi 配置面板视图（设计 §11/T28）：返回 `{ path, fields:[{key,secret,value,isSet}] }`。
   * **机密键（ANTHROPIC_AUTH_TOKEN）的值恒为空串**——值绝不外发到渲染进程（只给 isSet 布尔）。
   */
  getPiConfig: () => ipcRenderer.invoke("pi-config:get"),

  /**
   * 保存 Pi 配置到仓库根 `.env`（只改面板键、原子写；成功后主进程重载 env，下一会话生效）。
   * 入参 `updates` 为 `{ 键: 值 }`（只含面板键）；回报 `{ ok, appliedKeys, error? }`——**只含键名，不含值**。
   */
  savePiConfig: (updates) => ipcRenderer.invoke("pi-config:save", { updates }),

  /** 订阅会话事件流；返回取消订阅函数。 */
  onSessionEvent: (cb) => {
    const listener = (_event, ev) => cb(ev);
    ipcRenderer.on("session:event", listener);
    return () => ipcRenderer.removeListener("session:event", listener);
  },

  /** 订阅「项目内容可能已变」信号（主入口角色 su 一轮结束后，主进程发出）；
   * 渲染侧收到后应重取 listProject 让左树随 su 建角色而刷新（§10.3）。返回取消订阅函数。
   */
  onProjectChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("project:changed", listener);
    return () => ipcRenderer.removeListener("project:changed", listener);
  },

  // —— 自绘标题栏的窗口控制（客户要求：去掉原生标题栏，自绘一条）——
  // 只驱动窗口本体，不含任何 Node 能力、不含任何治理判定。
  /** 最小化窗口（自绘标题栏右侧按钮）。 */
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  /** 最大化 / 还原切换（自绘标题栏右侧按钮）。
   * 注意：**双击拖动区**的最大化由系统按 Windows 惯例**原生**处理（拖动区即 HTCAPTION），
   * 不经此通道——故渲染侧**不**再挂 dblclick，避免与原生行为叠加。
   */
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  /** 关闭窗口（自绘标题栏右侧按钮）。 */
  closeWindow: () => ipcRenderer.invoke("window:close"),
  /** 当前是否最大化（初始化按钮图标用；纯读）。 */
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  /** 订阅最大化状态变化（最大化/还原时按钮图标据此切换）；返回取消订阅函数。 */
  onMaximizedChanged: (cb) => {
    const listener = (_event, v) => cb(v);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },
});
