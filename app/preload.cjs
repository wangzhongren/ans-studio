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
  reportDiagnostic: (input) => ipcRenderer.invoke("app:renderer-diagnostic", input),
  getRecoveryState: () => ipcRenderer.invoke("app:recovery-state"),
  recoveryReady: () => ipcRenderer.invoke("app:recovery-ready"),
  reloadInterface: () => ipcRenderer.invoke("app:reload-interface"),
  /** 调系统文件夹选择器导入项目，返回项目根路径或 null。 */
  pickProject: () => ipcRenderer.invoke("app:pick-project"),

  /** 枚举项目下的角色（含角色卡正文、边界条目、文档与变更记录索引）。 */
  listProject: (projectRoot) => ipcRenderer.invoke("app:list-project", { projectRoot }),

  /**
   * I2（existing-project-compat V1，PM 评审 §四.2）：预览「建立治理记录」——**只读**，不写文件。
   * 主进程守卫：projectRoot 必须是当前导入项目；`governanceModel`（可选，single|trio）由 Interface
   * 校验并透传给机制（缺省＝single，旧行为逐字不变）。其余状态由机制原样回执。
   */
  previewGovernanceRecord: (projectRoot, options) => ipcRenderer.invoke("project:governance-preview", {
    projectRoot,
    ...(options && Object.prototype.hasOwnProperty.call(options, "governanceModel") ? { governanceModel: options.governanceModel } : {}),
  }),

  /**
   * I2：显式建立治理记录——**仅**由渲染侧预览面板的确认按钮调用（导入/枚举/定时器等一律不得调用）。
   * `confirm: true` 固定在本桥内；`governanceModel`（可选）原样上送、由 Interface 校验（非法即 invalid-request）。
   */
  establishGovernanceRecord: (projectRoot, options) =>
    ipcRenderer.invoke("project:governance-establish", {
      projectRoot,
      confirm: true,
      ...(options && Object.prototype.hasOwnProperty.call(options, "governanceModel") ? { governanceModel: options.governanceModel } : {}),
    }),

  /**
   * C2（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）：预览重新接受——**只读**，不写文件。
   * 主进程守卫：projectRoot 必须是当前导入项目；其余状态由机制原样回执。
   */
  previewGovernanceReacceptance: (projectRoot) =>
    ipcRenderer.invoke("project:governance-reaccept-preview", { projectRoot }),

  /**
   * C2：显式重新接受现有 pin——**仅**由渲染侧预览面板的确认按钮调用。
   * `confirm: true` 固定在本桥内；主进程 Interface 再校验它、当前导入项目与 64 hex previewDigest。
   */
  reacceptGovernancePins: (projectRoot, previewDigest) =>
    ipcRenderer.invoke("project:governance-reaccept", { projectRoot, confirm: true, previewDigest }),

  /**
   * V1b 预留（评审 §5.5/§11.2）：治理模型迁移预览/写入。本版 Interface 恒回 `not-available`
   * （零写入、不改 `.ans`/manifest）——渲染侧据此显示「升级入口待本版后续」，**不得**当作已可用。
   */
  previewGovernanceMigration: (projectRoot) =>
    ipcRenderer.invoke("project:governance-migrate-preview", { projectRoot }),
  migrateGovernanceModel: (projectRoot, previewDigest) =>
    ipcRenderer.invoke("project:governance-migrate", { projectRoot, confirm: true, previewDigest }),

  /** B/2: only opaque current-project refs; no renderer filesystem paths. */
  readProjectDocument: (input) => ipcRenderer.invoke("project:document-read", input),
  retryReportSave: input => ipcRenderer.invoke('report:retry-save', input),
  getReportSaveState: input => ipcRenderer.invoke('report:get-save-state', input),
  retryDeliveryHistorySave: input => ipcRenderer.invoke('delivery:retry-history-save', input),
  getDeliveryReceipt: input => ipcRenderer.invoke('delivery:get-receipt', input),
  getSessionPersistence: input => ipcRenderer.invoke('session:get-persistence', input),
  onReportPersistenceUpdated: callback => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('report-persistence-updated', listener); return () => ipcRenderer.removeListener('report-persistence-updated', listener); },
  onDeliveryHistoryUpdated: callback => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('delivery-history-updated', listener); return () => ipcRenderer.removeListener('delivery-history-updated', listener); },

  /** 点角色即开：直接建立与该角色的会话（导入项目即授权，无确认框）。 */
  openSession: (input) => ipcRenderer.invoke("session:open", input),

  /** 发送一轮消息；开启后可反复调用（多轮聊天，不再确认）。
   *  **P0-1（2026-10-13 客户批准）**：`images` 为可选图片载荷（`[{type:"image", data:<base64>, mimeType}]`）——
   *  主进程按**真实字节重校验**（嗅探 + ≤5MB）后才送模型；渲染侧声明值不可信。 */
  sendSession: (text, images, target, metadata) =>
    ipcRenderer.invoke("session:send", { text, images: Array.isArray(images) ? images : [], target, metadata }),

  /** 关闭会话（B-2 **定向**）：传角色 id 只关该角色（历史留在界面上）；不传/null 关全部（换项目/退出）。 */
  stopSession: (roleId) => {
    if (typeof roleId === "object" && roleId !== null) return ipcRenderer.invoke("session:stop", roleId);
    if (roleId == null) return ipcRenderer.invoke("session:stop", { roleId: null });
    return ipcRenderer.invoke("session:stop", { roleId: String(roleId) });
  },

  /**
   * 撤回一条未投递的排队消息（P1-1，2026-10-13 客户裁定）：`id` = role-state 快照条目视图的 `id`。
   * 仅「客户消息」类、且仍**在队列中（未投递）**者可撤；成功回报 `{ok, summary}`；已「进行中」/派发/
   * 回交/不存在如实回报 `{ok:false, error}`——绝不假装撤掉。
   */
  withdrawQueued: (roleId, id) => {
    let target = { roleId: String(roleId ?? "") };
    if (typeof roleId === "object" && roleId !== null) target = roleId;
    return ipcRenderer.invoke("session:withdraw", { ...target, id: String(id ?? "") });
  },

  /** 停当前轮次（P0-2，2026-10-13 客户批准）：向该角色会话请求中止当前进行中的轮次。
   *  回报三态 `{ok, supported, error?}`——已请求停止 / 当前运行时不支持停止 / 停止失败：<error>；
   *  轮次仍以既有收尾事件结束（渲染侧如实一行，不造「已停止」假象）；重复点击幂等。 */
  abortSession: (roleId) => {
    if (typeof roleId === "object" && roleId !== null) return ipcRenderer.invoke("session:abort", roleId);
    return ipcRenderer.invoke("session:abort", { roleId: String(roleId ?? "") });
  },

  /** 保活中的角色 id 列表（B-2：左树「有活动会话」小圆点数据源）。纯读。 */
  listLiveSessions: () => ipcRenderer.invoke("session:live"),
  listLiveSessionViews: () => ipcRenderer.invoke("session:live-views"),
  getSessionHistory: (input) => ipcRenderer.invoke("session:history-get", input),
  getRuntimeConfig: (runtime) => ipcRenderer.invoke("runtime-config:get", { runtime }),
  saveRuntimeConfig: (input) => ipcRenderer.invoke("runtime-config:save", input),
  onOperatorExpired: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("session:operator-expired", listener);
    return () => ipcRenderer.removeListener("session:operator-expired", listener);
  },

  /** 外部浏览器打开链接（B-1：Markdown 链接外开）。主进程/Interface 侧只放行 http/https；
   *  回报 `{ok, error?}`——不假装打开成功。 */
  openExternal: (url) => ipcRenderer.invoke("app:open-external", { url: String(url == null ? "" : url) }),

  /**
   * 选图（K-2）：主进程系统文件选择器 + 读文件（**渲染进程不碰文件/fs**）→ Interface 按**真实字节**校验
   * （魔数嗅探类型、≤5MB）。回报 `{ok, image?:{name,mime,size,dataBase64}, cancelled?, error?}`——
   * 取消是 `cancelled:true`（不是失败）；超限/非图片/读取失败 → `ok:false,error` 如实。
   */
  pickImage: () => ipcRenderer.invoke("app:pick-image"),

  /**
   * 粘贴/拖入的图片（K-2）：把 File API 读出的 base64 交主进程 Interface 校验（声明 mime/size 不可信，
   * 以真实字节为准）。回报 `{ok, image?:{name,mime,size}, error?}`。**发送**随消息上送
   * （`sendSession(text, images)`——主进程重校验后送模型，P0-1 已接线）。
   */
  attachImage: (input) =>
    ipcRenderer.invoke("app:attach-image", {
      name: input && typeof input.name === "string" ? input.name : "",
      mime: input && typeof input.mime === "string" ? input.mime : "",
      dataBase64: input && typeof input.dataBase64 === "string" ? input.dataBase64 : "",
    }),

  /**
   * 订阅「客户交互请求」（A-5，2026-10-12）：su 的 `request_confirmation` / `request_choice` 挂起等客户
   * 作答时，主进程把请求推来，渲染侧应把它渲染为**该角色聊天流里的交互卡**（确认 / 单选 / 多选 / 带预览）。
   * 入参 `{id, roleId, request}`——`request` 为冻结形状：confirm 的 `title/preview?/detail?`；
   * choice 的 `title/question?/options[{id,label,description?}]/multiple?/preview?`。返回取消订阅函数。
   */
  onOperatorRequest: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("session:operator-request", listener);
    return () => ipcRenderer.removeListener("session:operator-request", listener);
  },

  /**
   * 回传客户对交互请求的决定（A-5）：`{id, decision}`——confirm：`{kind:"confirm",confirmed:boolean}`；
   * choice：`{kind:"choice",selected:string[]}` 或 `{kind:"choice",cancelled:true}`。主进程**按请求快照
   * 校验**（选项 id 必须 ⊆ 已发、单选恰一个）后解挂为冻结三态；回报 `{ok, error?}`（非法回包不受理）。
   */
  operatorRespond: (input) => ipcRenderer.invoke("session:operator-response", input),

  /**
   * 订阅「治理决定卡排队」状态（三权 §6.1 硬约束 / §九-10，2026-10-17）：同一项目已有待客户决定卡时，
   * 后续提案/任命/写盘/验收请求**入队、不呈现**；载荷 `{...OperatorRequestPayload, waitingFor}`——
   * 渲染侧据此显示「等待前一个决定」（**不自动合并、不自动批准**）。前一张 resolve/取消/失效后，
   * 下一张仍经 `onOperatorRequest` 正常呈现。返回取消订阅函数。
   */
  onOperatorQueued: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("session:operator-queued", listener);
    return () => ipcRenderer.removeListener("session:operator-queued", listener);
  },

  /**
   * 订阅「shell 命令确认请求」（M-1，2026-10-12）：三层闸 (a) 层为**应用内确认卡**（不再用原生对话框）。
   * 主进程推 `{id, command, summary, reasonPlain, reasonRaw, argvLines, cwd}`——`command` 为**逐字原文**；
   * `summary`/`reasonPlain` 已由主进程翻成**人话**（内部行话不外露）；`reasonRaw`/`argvLines`/`cwd` 供
   * 折叠「详情」核查。渲染侧**只呈现、不判定**。返回取消订阅函数。
   */
  onShellConfirm: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("shell:confirm-request", listener);
    return () => ipcRenderer.removeListener("shell:confirm-request", listener);
  },

  /**
   * 回传对 shell 确认卡的决定（M-1）：`{id, allow}`——**恰 `allow:true` 才放行**；拒绝 / Esc / 关闭 = false。
   * 回报 `{ok, error?, expired?}`：`expired:true` = 该确认已失效（超时或应用重启），**未获放行**。
   */
  shellConfirmRespond: (input) =>
    ipcRenderer.invoke("shell:confirm-response", {
      id: input && typeof input.id === "string" ? input.id : "",
      allow: !!(input && input.allow === true),
    }),

  /**
   * 「替我审」开关（2026-10-17 PM 评审 §6.6，方法名钉死）：主进程是权威状态（默认 false、重载复位）。
   * `getShellJudgeState()` 返回 `{version:1, ok, enabled?, error?}`；`setShellJudgeEnabled(enabled)` 仅提交意图，
   * **以主进程返回为准**（失败不改状态，渲染侧不得显示假开启态）。**不暴露任何 Node/fs/process 能力。**
   */
  getShellJudgeState: () => ipcRenderer.invoke("shell:judge-get"),
  setShellJudgeEnabled: (enabled) => ipcRenderer.invoke("shell:judge-set", { enabled: enabled === true }),
  /** 订阅开关状态（开关变化 / 重载复位 / 初次加载后推送）；载荷 `{version:1, enabled}`。返回取消订阅函数。 */
  onShellJudgeState: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("shell:judge-state", listener);
    return () => ipcRenderer.removeListener("shell:judge-state", listener);
  },
  /** 订阅判断结果行（`ShellJudgeResultPayload`；按 `roleId` 落 pane、按 `toolCallId` 锚定）。返回取消订阅函数。 */
  onShellJudgeResult: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("shell:judge-result", listener);
    return () => ipcRenderer.removeListener("shell:judge-result", listener);
  },

  /**
   * 订阅「恢复确认请求」（G-2/W5，2026-10-16 客户批准）：su 经 `propose_recovery` 提议恢复动作
   * （停止本轮 / 重建会话 / 重投任务，带逐字证据）时，主进程把卡推来——渲染侧渲染为确认卡
   * （**取消为默认焦点**）。载荷 `{id, projectRoot?, runtime?, roleId, action, evidence, reason?,
   * requestedBy?, requestedAt?, itemId?}`——`evidence` 逐字；缺省位隐藏、不假装有值。
   * 返回取消订阅函数。（通道缺席 = 未接线：无卡可点即无执行路径——fail-closed。）
   */
  onRecoveryConfirm: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("recovery:confirm-request", listener);
    return () => ipcRenderer.removeListener("recovery:confirm-request", listener);
  },

  /**
   * 回传对恢复确认卡的决定（G-2/W5）：`{id, allow}`——**恰 `allow:true` 才作为执行请求**；
   * 取消 / Esc / 关闭 = 不执行（fail-closed 的 UI 侧同向）。回报 `{ok:true}` | `{ok:false, expired:true}`
   * （失效/旧回包——**未获执行**）| `{ok:false, error}`（非法回包不受理）。
   */
  recoveryConfirmRespond: (input) =>
    ipcRenderer.invoke("recovery:confirm-response", {
      id: input && typeof input.id === "string" ? input.id : "",
      allow: !!(input && input.allow === true),
    }),

  /**
   * 读取 Pi 配置面板视图（设计 §11/T28）：返回 `{ path, fields:[{key,secret,value,isSet}] }`。
   * **机密键（ANTHROPIC_AUTH_TOKEN）的值恒为空串**——值绝不外发到渲染进程（只给 isSet 布尔）。
   */
  getPiConfig: () => ipcRenderer.invoke("pi-config:get"),

  /**
   * 保存 Pi 配置到仓库根 `.env`（只改面板键、原子写；成功后在安全点应用，新输入重建会话生效）。
   * 入参 `updates` 为 `{ 键: 值 }`（只含面板键）；回报 `{ ok, appliedKeys, error? }`——**只含键名，不含值**。
   */
  savePiConfig: (updates) => ipcRenderer.invoke("pi-config:save", { updates }),

  /**
   * 订阅会话事件流；返回取消订阅函数。
   * **入参为 `{projectRoot,roleId,runtime,event}` 信封**（B-2：多会话并存——渲染侧按 `roleId` 分发到该角色的
   * 聊天流；不带标识会串消息）。`event` 为编排事件（含 `handback` 回交，§10.8）。
   * **Q-1（2026-10-12）**：生产走 **合帧批量**通道 `session:events`（回调收到**信封数组**，顺序不变）；
   * 同时保留单发 `session:event`（兼容既有探针/直发路径——回调收到单个信封）。渲染侧两者同解。
   */
  onSessionEvent: (cb) => {
    const single = (_event, envelope) => cb(envelope);
    const batch = (_event, envelopes) => cb(envelopes);
    ipcRenderer.on("session:event", single);
    ipcRenderer.on("session:events", batch);
    return () => {
      ipcRenderer.removeListener("session:event", single);
      ipcRenderer.removeListener("session:events", batch);
    };
  },

  /**
   * 订阅「角色状态变化」（L-1 + 状态准确性；2026-10-12 追加右栏「待办 / 队列」）：主进程在**忙/闲切换**与
   * **队列变化**时推 `{roleId, busy, summaries, queue, running}`——**真实信号**（会话 busy / 队列深度），
   * 渲染侧据此出「工作中 · N 待办」徽标、聊天流队列行与**右栏待办组**（`queue` 结构化条目：来源/摘要/入队
   * 时间；`running`=正在跑的那条投递，可标「进行中」），**不得**用界面侧推测补状态。
   * 返回取消订阅函数。
   */
  onRoleState: (cb) => {
    const listener = (_event, info) => cb(info);
    ipcRenderer.on("session:role-state", listener);
    return () => ipcRenderer.removeListener("session:role-state", listener);
  },

  /**
   * 订阅「会话历史已恢复」（D-1，2026-10-12）：项目导入/重载后，主进程按项目/角色/runtime 读取 ANS 回放，把**规范化后的界面行**推来
   * （`{roleId,projectRoot,runtime,rows:[{kind:user|assistant|tool|denied,text,at}],error,skipped}`）——
   * 渲染侧回放进**该角色**的聊天流（回放不证明模型上下文已恢复）。渲染进程**不碰 Pi SDK/JSONL**。
   * 返回取消订阅函数。
   */
  onSessionHistory: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("session:history", listener);
    return () => ipcRenderer.removeListener("session:history", listener);
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
