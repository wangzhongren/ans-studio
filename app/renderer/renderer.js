// app/renderer/renderer.js —— 三栏界面逻辑（经典脚本；无 Node、无 fs，仅经 window.desktop 调主进程）。
//
// 交互模型（客户最终定稿）：导入项目 = 授权；点角色 → 立即进入聊天（无确认弹窗）；
// 多轮直发；越界写入被门禁拦截后在聊天流里内联显示（可展开看允许路径）。
// 同一角色重复点击 = 续接当前会话。
// **B-2（2026-10-12）：切换角色不再结束旧会话**——每角色一个 chat pane（游离 DOM 保留历史与监听器），
// 会话在引擎侧并存（renderer 只呈现）；事件带 `roleId` 信封，按角色分发到各自 pane。
// **B-1（同日）**：消息经最小子集 Markdown 受控渲染（`markdown.js` 的纯函数，先转义后解析）。
// **真机缺陷修复（2026-10-12）：交互卡锚点物化**——已决/未决卡的（重）物化按其**时序锚点**落位
// （虚拟窗口脱挂后切回不再重建落尾；主修复＝复用既有行；回放行带请求标识 → 锚点表 → 插回原位；
// 找不到锚点兜底落尾且绝不丢卡）。open 与 decided 一视同仁。
(function () {
  "use strict";

  var d = window.desktop;
  var $ = function (id) { return document.getElementById(id); };
  function diagnose(event, fields) {
    if (!d || typeof d.reportDiagnostic !== "function") return;
    Promise.resolve(d.reportDiagnostic({ event: event, fields: fields || {} })).catch(function (error) {
      console.error("诊断上报失败", error && error.name);
    });
  }
  window.addEventListener("error", function (event) {
    diagnose("renderer.error", { errorMessage: String(event.message || "界面异常"), errorType: "Error" });
  });
  window.addEventListener("unhandledrejection", function (event) {
    var error = event.reason;
    diagnose("renderer.unhandled-rejection", { errorMessage: String(error && error.message || "未处理异常"), errorType: String(error && error.name || "Error") });
  });

  // Markdown 最小子集渲染器（B-1；硬约束：index.html 保证 `markdown.js` **先于本文件**加载）。
  // `esc` 也取自它——**单一来源**（本文件不再自持第二份转义实现）。缺失即显式失败，不静默降级。
  var Md = window.ANSMarkdown;
  if (!Md || typeof Md.renderMarkdown !== "function" || typeof Md.esc !== "function") {
    document.body.innerHTML = '<p style="padding:24px;font:13px sans-serif;">界面组件加载失败：markdown.js 未就绪（须在 renderer.js 之前加载）。</p>';
    return;
  }
  var esc = Md.esc;

  // 角色状态徽标映射（B-3，2026-10-12；硬约束：`role-status.js` 同样**先于本文件**加载）。
  // 状态派生与文案/样式映射是纯函数（可独立单测）；本文件只用它、不另写判断。
  var St = window.ANSRoleStatus;
  if (!St || typeof St.deriveRoleStatus !== "function" || typeof St.statusBadge !== "function") {
    document.body.innerHTML = '<p style="padding:24px;font:13px sans-serif;">界面组件加载失败：role-status.js 未就绪（须在 renderer.js 之前加载）。</p>';
    return;
  }

  // 工具行瘦身映射（2026-10-12 客户裁定：工具行只显示状态与目标、不显示内容；同样须先于本文件加载）。
  var Tr = window.ANSToolRows;
  if (!Tr || typeof Tr.slimToolRow !== "function") {
    document.body.innerHTML = '<p style="padding:24px;font:13px sans-serif;">界面组件加载失败：tool-rows.js 未就绪（须在 renderer.js 之前加载）。</p>';
    return;
  }

  // 界面文案纯映射（N-1，2026-10-12）：如「导入项目 / 切换项目」——同样须先于本文件加载。
  var UiLabels = window.ANSUiLabels;
  if (!UiLabels || typeof UiLabels.pickProjectLabel !== "function") {
    document.body.innerHTML = '<p style="padding:24px;font:13px sans-serif;">界面组件加载失败：ui-labels.js 未就绪（须在 renderer.js 之前加载）。</p>';
    return;
  }
  var Rt = window.ANSRuntimeUI;

  var state = {
    projectRoot: null,
    runtime: "pi",
    roles: [],
    // 主入口角色 id：**原样转自门禁引擎 listProject 的 primaryRoleId**（§10.7），渲染侧据此设主位/默认选中，
    // **不硬编码 "su"**。null = 尚未导入项目。
    primaryRoleId: null,
    // 项目是否已 bootstrap（枚举到项目角色）：原样转自门禁引擎 listProject 的 hasRoles（§10.3）。
    hasRoles: true,
    selectedRoleId: null,
    // 当前**显示中**的角色（其 pane 挂在 #chat 下）；与 sessionOpenRoleId 的关系见下。
    sessionOpenRoleId: null, // 当前活动会话的角色 id（最近一次 openSession 成功者；null=无）
    // 保活中的会话角色 id（B-2：主进程 `session:live` 的如实转述）。
    liveRoles: [],
    // 每角色的**既有事实**（状态派生的输入；不发明进度/预计时间）：
    // hadSession=曾成功开过会话；error=最近一次轮次/会话以错误结束；awaitingConfirm=有未决交互请求；
    // lastSummary/lastAt=最近一条事件（悬停用）。
    // **忙/闲与队列不在此推算**——它们只来自主进程 `session:role-state` 的**真实快照**（见 roleBusy/queueByRole）。
    roleMeta: {},
    // 每角色的**真实状态快照**（L-1 + 状态准确性，2026-10-12 客户裁定）：主进程 `session:role-state` 外推的
    // 原始值——busy=会话有一轮在跑（含 B-2 下切走的后台轮次）；queueByRole=投递队列摘要（如实转述，不加工）。
    roleBusy: {},
    queueByRole: {},
    // 右栏「待办 / 队列」组（2026-10-12 追加）：结构化的排队条目（`{kind, sourceRoleId, summary, at}`）与
    // **正在跑的那条投递**（若有）——同一 `session:role-state` 快照通道，**不造第二套数据源**。
    queueItemsByRole: {},
    runningByRole: {},
    // shell 命令确认卡（M-1，2026-10-12）：当前挂起的一张 `{id, busy}`；无则 null。**无计时器**（G-1 纪律）——
    // 卡片不按时间自我定格；失效只来自主进程回包（`expired`）或正常裁决。
    shellConfirm: null,
    // 客户裁定（2026-10-13）：右栏改**抽屉**——当前展开的右上角图标 tab（null=全收起）；
    // 第二轮裁定（同日）：簇只留两枚，待办/队列**归角色**——"card"=角色资料（角色卡 md + 待办/队列两节 +
    // 边界/变更/文档），"pi"=Pi 配置（面板本体原样迁入抽屉）。同一时刻至多一块；内容跟随当前选中角色。
    rightTab: null,
  };

  // —————— 内联 SVG 图标（无外部依赖） ——————
  var ICONS = {
    role:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/></svg>',
    call:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    ok:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
    deny:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    chev:
      '<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m9 6 6 6-6 6"/></svg>',
    readonly:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    handback:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v2"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  // （原本地 `esc` 实现已在 B-1 删除：转义是 `markdown.js` 的**单一来源**——见文件头。）

  function setHint(text) { $("composer-hint").textContent = text || ""; }

  /** 会话状态（客户裁定 2026-10-13：界面**不再显示**「聊天中/空闲」pill）——kind **程序化保留**：
   *  写到 `#chat` 的 `data-state` 属性（run/idle/err），e2e 与外部驱动仍可断言；label 参数保留以兼容调用点。 */
  function setState(kind, label) {
    if (backgroundDelivery) return;
    void label; // pill 文案随视觉删除而退役；kind 才是程序化保留的部分
    var chat = $("chat");
    if (chat) chat.dataset.state = kind;
  }

  function setChatHeader(role) {
    $("chat-role").textContent = role ? role.roleId : "未选择角色";
    $("chat-role-sub").textContent = role
      ? ""
      : "从左侧选择一个角色开始聊天";
    $("chat-role-sub").hidden = !!role;
    updateHaltButton();
    syncChatState(role ? role.roleId : null);
  }

  /** `#chat[data-state]`（程序化状态出口，pill 退役后保留）：**只随 role-state 真实快照**——有轮次在跑 =
   *  `run`、空闲 = `idle`（真机缺陷修复 2026-10-13：旧实现只在开启会话时写 `run`、轮末**无回 idle 路径**，
   *  开启后恒 `run`）。`err` 仍由开启失败/异常两条路径设置（下一次快照/切角色会再校准）。
   *  同一单一数据源 = `state.roleBusy`（与停止钮同一判据，不造第二套）。 */
  function syncChatState(roleId) {
    var busy = !!roleId && state.roleBusy[roleId] === true;
    setState(busy ? "run" : "idle", busy ? "聊天中" : "空闲");
  }

  // —————— 停止入口（P0-2 UI，2026-10-13 客户批准「跑飞轮次的停」；同日客户反馈后位置调整）——————
  // 位置：**输入框区、发送钮左侧**的小圆钮（#btn-halt；客户反馈「停止按钮位置有问题」——从聊天头移来）。
  // **仅该角色会话忙碌时出现**（判据 = role-state 真实快照 `state.roleBusy`——主进程外推，不做界面侧推测）；
  // 点击调 `d.abortSession(roleId)`，按**三态**在聊天流**如实一行**（已请求停止 / 当前运行时不支持停止 /
  // 停止失败：<error>）。轮次仍以既有 settled 收尾——**不做乐观「已停止」假象**；重复点击幂等
  // （无在飞轮次 = no-op，abort 语义已在适配器环测试钉死）。**与发送钮并存、各司其职**——发送钮
  // 绝不因忙碌被替换/禁用（「忙碌时发消息=入队」是既定语义）；这不是已删的「结束会话」按钮
  // （那是关整只会话；这里只停**当前一轮**，会话保留）。
  function updateHaltButton() {
    if (backgroundDelivery) return;
    var btn = $("btn-halt");
    if (!btn) return;
    var busy = state.selectedRoleId !== null && state.roleBusy[state.selectedRoleId] === true;
    btn.hidden = !busy;
  }

  async function onHaltClick() {
    var roleId = state.selectedRoleId;
    if (!roleId) return;
    var pane = activePane();
    var target = sessionTarget(roleId);
    var res;
    try {
      res = await d.abortSession(target);
    } catch (err) {
      deliverRuntimePayload(target, function () { sysRow(pane, "sys-call", ICONS.deny, "停止失败：" + (err && err.message ? err.message : err)); });
      return;
    }
    deliverRuntimePayload(target, function () {
    var r = res && typeof res === "object" ? res : {};
    if (r.ok === true) {
      sysRow(pane, "sys-call", ICONS.call, "已请求停止当前轮次——轮次仍会以收尾事件结束。");
    } else if (r.supported !== true) {
      // 方法缺席与 supported:false 同一处理：如实告知能力缺席，绝不假装已停。
      sysRow(pane, "sys-call", ICONS.call, "当前运行时不支持停止。");
    } else {
      sysRow(pane, "sys-call", ICONS.deny, "停止失败：" + (r.error || "未知原因"));
    }
    });
  }

  /**
   * 空聊天区（每个角色的聊天容器/默认视图都以它开局，作 HTML 字符串返回）：
   * **这是「未 bootstrap」这件事唯一该说的地方**（客户裁定：它曾同时出现在中栏横栏、中栏正中、左栏三处，
   * 收敛为只在此处）——若 `hasRoles === false`，标题/说明引导与 su 对话、把角色建出来，并给一个
   * **「开始与 <主入口> 对话」主按钮**（§10.7，`primaryRoleId` 驱动、不硬编码）。注意：默认主路径是 su，
   * 但**不自动开会话**（避免每次导入都起会话）。
   */
  function emptyStateHtml() {
    var primary = state.primaryRoleId;
    var title, sub;
    if (state.projectRoot && state.hasRoles === false) {
      title = "项目尚未 bootstrap";
      sub = "与 " + esc(primary) + " 对话，让它把角色建出来；左树会随之长出。";
    } else {
      title = "选择左侧角色开始聊天";
      sub = "消息直接发送，无需确认；写入由治理引擎在后台把关。";
    }
    var cta = state.projectRoot && primary
      ? '<button id="btn-start-primary" class="btn btn-primary btn-start">开始与 ' + esc(primary) + " 对话</button>"
      : "";
    return '<div class="chat-empty">' +
      '<p class="empty-title">' + title + "</p>" +
      '<p class="empty-sub">' + sub + "</p>" +
      cta +
      "</div>";
  }

  /** 给某个容器里的空状态主按钮挂上点击（对 #chat 与各 pane 通用；容器内查询，避免同名 id 混指）。 */
  function bindEmptyState(container) {
    var b = container.querySelector(".chat-empty #btn-start-primary");
    if (b) {
      b.addEventListener("click", function () { selectRole(state.primaryRoleId); });
    }
  }

  // —————— 每角色聊天容器（B-2：切走保留历史） ——————
  // 每角色一个 chat pane；同一时刻只有一个 pane 挂在 #chat 下，其余为**游离 DOM**——历史节点与
  // **事件监听器**因此原样保留（不用 innerHTML 快照，卡片按钮不会失灵）。后台会话的事件按信封 `roleId`
  // 追加进**它所属**的 pane（即使当前不可见），切回即见。
  var activityOpen = Object.create(null);
  var groupSeqByRole = Object.create(null);
  var groupIdentitiesByRole = Object.create(null);
  var drawerReading = Object.create(null);
  var renderedDrawerRole = null;
  var withdrawPending = Object.create(null);
  var withdrawFeedback = Object.create(null);
  var composerDrafts = Object.create(null);
  var projectGeneration = 0;
  var runtimeViews = Object.create(null);
  var backgroundDelivery = false;
  var liveReplayCounts = Object.create(null);
  var manualMessages = Object.create(null);
  var rowOrigin = "extra";
  var rowReplayToken = null;

  function sessionTarget(roleId) {
    return { projectRoot: state.projectRoot, roleId: roleId, runtime: state.runtime };
  }

  function captureRuntimeView() {
    return { liveRoles: state.liveRoles, roleMeta: state.roleMeta, roleBusy: state.roleBusy,
      queueByRole: state.queueByRole, queueItemsByRole: state.queueItemsByRole, runningByRole: state.runningByRole,
      sessionOpenRoleId: state.sessionOpenRoleId, shellConfirm: state.shellConfirm, chatPanes: chatPanes, paneRowLists: paneRowLists, paneAnchors: paneAnchors,
      opRequests: opRequests, replayState: replayState, activityOpen: activityOpen, groupSeqByRole: groupSeqByRole,
      groupIdentitiesByRole: groupIdentitiesByRole, drawerReading: drawerReading, composerDrafts: composerDrafts,
      withdrawPending: withdrawPending, withdrawFeedback: withdrawFeedback, lastManualSend: lastManualSend,
      liveReplayCounts: liveReplayCounts, manualMessages: manualMessages };
  }

  function installRuntimeView(view) {
    var v = view || {};
    state.liveRoles = v.liveRoles || [];
    ["roleMeta", "roleBusy", "queueByRole", "queueItemsByRole", "runningByRole"].forEach(function (key) { state[key] = v[key] || Object.create(null); });
    state.sessionOpenRoleId = v.sessionOpenRoleId || null;
    state.shellConfirm = v.shellConfirm || null;
    chatPanes = v.chatPanes || Object.create(null); paneRowLists = v.paneRowLists || Object.create(null);
    paneAnchors = v.paneAnchors || Object.create(null); opRequests = v.opRequests || Object.create(null);
    replayState = v.replayState || Object.create(null); activityOpen = v.activityOpen || Object.create(null);
    groupSeqByRole = v.groupSeqByRole || Object.create(null); groupIdentitiesByRole = v.groupIdentitiesByRole || Object.create(null);
    drawerReading = v.drawerReading || Object.create(null); composerDrafts = v.composerDrafts || Object.create(null);
    withdrawPending = v.withdrawPending || Object.create(null); withdrawFeedback = v.withdrawFeedback || Object.create(null);
    liveReplayCounts = v.liveReplayCounts || Object.create(null); manualMessages = v.manualMessages || Object.create(null);
    lastManualSend = v.lastManualSend || { roleId: null, text: "", at: 0 };
  }

  // 异引擎信封仅进入自己的游离视图；任何旧项目信封直接丢弃。
  function deliverRuntimePayload(payload, handler) {
    if (!payload || typeof payload !== "object") return;
    if (payload.projectRoot != null && payload.projectRoot !== state.projectRoot) return;
    var runtime = payload.runtime || "pi";
    if (["pi", "codex", "claude", "demo"].indexOf(runtime) < 0) return;
    if (runtime === state.runtime) { handler(payload); return; }
    var active = captureRuntimeView(), activeRuntime = state.runtime, selected = state.selectedRoleId;
    var activeBatch = { depth: batchDepth, dirty: batchDirtyPanes, scroll: batchSuppressedScroll, pin: batchStreamPin };
    var key = Rt.viewKey(state.projectRoot, runtime);
    backgroundDelivery = true;
    state.runtime = runtime; state.selectedRoleId = null;
    installRuntimeView(runtimeViews[key]);
    batchDepth = 1; batchDirtyPanes = []; batchSuppressedScroll = null; batchStreamPin = null;
    try { handler(payload); }
    finally {
      try { batchDepth = 0; flushBatchSideEffects(); }
      finally {
        runtimeViews[key] = captureRuntimeView();
        installRuntimeView(active); state.runtime = activeRuntime; state.selectedRoleId = selected; backgroundDelivery = false;
        batchDepth = activeBatch.depth; batchDirtyPanes = activeBatch.dirty; batchSuppressedScroll = activeBatch.scroll; batchStreamPin = activeBatch.pin;
      }
    }
  }

  async function selectRuntime(runtime) {
    if (!state.projectRoot || ["pi", "codex", "claude"].indexOf(runtime) < 0 || runtime === state.runtime) return;
    ++configSaveVersion;
    saveComposerDraft(state.selectedRoleId); captureDrawerReading();
    runtimeViews[Rt.viewKey(state.projectRoot, state.runtime)] = captureRuntimeView();
    ++roleSelectionVersion; projectGeneration += 1;
    state.runtime = runtime;
    piView = null;
    $("pi-panel").querySelector(".pi-fields").innerHTML = "";
    $("pi-panel").querySelector(".pi-advanced-body").innerHTML = "";
    $("pi-panel").querySelector(".pi-advanced").hidden = true;
    setPiStatus("正在读取 " + Rt.runtimeLabel(runtime) + " 配置…", "");
    installRuntimeView(runtimeViews[Rt.viewKey(state.projectRoot, runtime)]);
    renderedDrawerRole = null; state.sessionOpenRoleId = null;
    engineSelector.sync(runtime, !state.projectRoot);
    $("shell-confirm").hidden = true;
    if (state.shellConfirm) renderShellConfirm(state.shellConfirm);
    restoreComposerDraft(state.selectedRoleId);
    showPane(state.selectedRoleId); renderRoleTree(); renderRight(); renderTabs(); updateControls(); setChatHeader(selectedRole());
    void loadPiConfig();
    if (state.selectedRoleId) await selectRole(state.selectedRoleId);
  }

  function captureChatReading(pane) {
    var chat = $("chat");
    if (!pane || pane.parentNode !== chat) return null;
    var rl = paneRowLists[pane.dataset.roleId];
    var top = chat.getBoundingClientRect().top;
    var bottom = chat.getBoundingClientRect().bottom;
    if (rl) for (var i = 0; i < rl.rows.length; i += 1) {
      var rec = rl.rows[i];
      if (!rec.el || rec.el.parentNode !== pane) continue;
      var rect = rec.el.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= bottom) continue;
      var sub = null;
      if (rec.kind === "activities" && rec.data.open) {
        var entries = rec.el.querySelectorAll("[data-activity-index]");
        for (var j = 0; j < entries.length; j += 1) if (entries[j].getBoundingClientRect().bottom > top) { sub = entries[j]; break; }
      }
      return { index: rec.index, rec: rec, identity: rec.data && (rec.data.id || rec.data.identity), offset: (sub || rec.el).getBoundingClientRect().top - top,
        sub: sub ? Number(sub.dataset.activityIndex) : null, scrollTop: chat.scrollTop };
    }
    return { scrollTop: chat.scrollTop };
  }

  function restoreChatReading(pane, saved) {
    var chat = $("chat");
    if (!saved || pane.parentNode !== chat) return;
    var rl = paneRowLists[pane.dataset.roleId];
    if (!rl || saved.index == null || !rl.rows.length) { chat.scrollTop = saved.scrollTop || 0; return; }
    var matched = saved.identity ? rl.rows.find(function (row) { return row.data && (row.data.id || row.data.identity) === saved.identity; }) : null;
    var rec = rl.rows.indexOf(saved.rec) >= 0 ? saved.rec : matched || rl.rows[Math.min(saved.index, rl.rows.length - 1)];
    var sums = rl.prefix || rebuildPrefix(rl);
    chat.scrollTop = sums[rec.index];
    updateVirtualWindow(pane, { preferIndex: rec.index });
    if (!rec.el || rec.el.parentNode !== pane) attachRow(rl, rec);
    var el = saved.sub != null ? rec.el.querySelector('[data-activity-index="' + saved.sub + '"]') : null;
    chat.scrollTop += (el || rec.el).getBoundingClientRect().top - chat.getBoundingClientRect().top - saved.offset;
    updateVirtualWindow(pane, null);
  }

  function measureComposer() {
    var composer = document.querySelector(".composer");
    var app = document.querySelector(".app");
    if (composer && app) app.style.setProperty("--composer-height", composer.getBoundingClientRect().height + "px");
    syncCoveredOperatorCards();
  }

  var chatPanes = Object.create(null); // roleId -> Element

  function paneFor(roleId) {
    var key = String(roleId == null ? "" : roleId);
    var p = chatPanes[key];
    if (!p) {
      p = document.createElement("div");
      p.className = "chat-pane";
      p.setAttribute("data-role-id", key);
      p.innerHTML = emptyStateHtml();
      bindEmptyState(p);
      chatPanes[key] = p;
    }
    return p;
  }

  /** **U-1（2026-10-12 客户裁定）**：把该角色的视图定位到「**最新**」——无未作答卡 ⇒ **到底部**；
   *  有 ⇒ **滚到那张卡**（P-1 例外优先）。点角色（含重复点击）与切 pane 都走这一条。 */
  function stickPaneToBottomOrCard(roleId) {
    var key = String(roleId == null ? "" : roleId);
    var pendingIds = openRequestIdsFor(key);
    if (pendingIds.length > 0) {
      scrollToOperatorCard(key, pendingIds[0]);
    } else {
      // 窗口化（≥150 行）时 forced 内部先实体化尾部再滚（落点准确）；常规路径逐字贴底。
      scrollBottomForced(paneFor(key));
    }
  }

  /** 把某角色的 pane 切到视图里（唯一挂在 #chat 下的那个）；重挂后按登记表**补挂**未决卡（防丢卡）。 */
  function showPane(roleId) {
    var p = paneFor(roleId);
    var chat = $("chat");
    var key = String(roleId == null ? "" : roleId);
    if (p.parentNode !== chat) {
      chat.innerHTML = "";
      chat.appendChild(p);
    }
    materializePendingFor(key); // 真机缺陷修复：切回必须有未作答的卡
    // **U-1（2026-10-12 客户裁定「点击这个角色，应该滚动到滚动条最下面」）**：点角色（切换会话）⇒ **到底部**
    // （最新一条）——**取代** B-2 时期的「恢复上次位置」（scrollMemo 已删干净，语义反转理由见 change 文档）。
    // **例外（P-1 优先）**：该角色有未作答的卡 ⇒ 仍**滚到那张卡**。chip 同处刷新（同一状态源）。
    stickPaneToBottomOrCard(key);
    updateOpChip(key);
    renderCurrentWork(key);
    syncCoveredOperatorCards();
  }

  /** 当前**显示**的 pane（选中角色的；未选角色时用通用空 key——仅兜底，正常流程用不到）。 */
  function activePane() {
    return paneFor(state.selectedRoleId);
  }

  /** 重置所有 pane（换项目）：老项目的历史**不跨项目保留**；#chat 恢复为默认空状态。 */
  function resetPanes() {
    closeShellConfirm();
    Object.keys(runtimeViews).forEach(function (key) {
      var drafts = runtimeViews[key].composerDrafts || {};
      Object.keys(drafts).forEach(function (roleId) { releaseImages(drafts[roleId].images || []); });
    });
    runtimeViews = Object.create(null);
    clearAllComposerDrafts();
    projectGeneration += 1;
    activityOpen = Object.create(null);
    groupSeqByRole = Object.create(null);
    groupIdentitiesByRole = Object.create(null);
    drawerReading = Object.create(null);
    renderedDrawerRole = null;
    withdrawPending = Object.create(null);
    withdrawFeedback = Object.create(null);
    chatPanes = Object.create(null);
    paneRowLists = Object.create(null); // Q-2：行表随 pane 作废（老项目的行模型不跨项目）
    paneAnchors = Object.create(null); // 回放锚点表随项目作废（锚点是行序位——只对老项目的行表有意义）
    opRequests = Object.create(null); // 交互请求登记表随之作废（旧项目的请求已随会话/时限自行落定）
    replayState = Object.create(null); // 回放去重状态随项目作废（新项目的转录从零核对）
    liveReplayCounts = Object.create(null); manualMessages = Object.create(null);
    $("chat").innerHTML = emptyStateHtml();
    bindEmptyState($("chat"));
  }

  /** **强制**贴底（用户动作/卡到达/切角色/回放收尾等——不看守滚位置）。窗口化时**先让窗口与高度落定**
   *  再滚（S-1 根因：贴底发生在 spacer 增长之前会差一整批的高度；见 flushBatchSideEffects 的写明）。 */
  function scrollBottomForced(pane) {
    // 只有**挂在视图里**的 pane 需要（也才允许）滚动；游离 pane 自动滚它没有意义。
    var chat = $("chat");
    if (pane && pane.parentNode === chat) {
      if (batchDepth > 0) {
        // Q-1：批量期**抑制**（一次 flush 只做一次贴底——防 per-event 读 scrollHeight 的 reflow 风暴）。
        batchSuppressedScroll = pane;
        return;
      }
      var rl0 = paneRowLists[pane.dataset.roleId];
      if (rl0 && rl0.pane === pane && rl0.rows.length >= VIRT_MIN_ROWS) updateVirtualWindow(pane, { preferTail: true });
      chat.scrollTop = chat.scrollHeight;
    }
  }

  /** S-1（2026-10-12 客户「输出不会让滚动条滚动到最底下了」）：**流式输出**的贴底判定——
   *  「**在底部附近**（≤ `STICK_THRESHOLD_PX`）才贴底；**用户往上翻就不打断**」。距离必须**在追加新行之前**测
   *  （行本身会立刻把距离推过阈值——P-1 同款时序坑）。批量期**一次测量、批内复用**（防 per-append 读布局）。 */
  var batchStreamPin = null; // {pane, pin}
  function streamShouldPin(pane) {
    var chat = $("chat");
    if (!pane || pane.parentNode !== chat) return false;
    if (batchDepth > 0) {
      if (batchStreamPin !== null && batchStreamPin.pane === pane) return batchStreamPin.pin;
      var p = UiLabels.stickToBottom(chat.scrollHeight - chat.scrollTop - chat.clientHeight, UiLabels.STICK_THRESHOLD_PX);
      batchStreamPin = { pane: pane, pin: p };
      return p;
    }
    return UiLabels.stickToBottom(chat.scrollHeight - chat.scrollTop - chat.clientHeight, UiLabels.STICK_THRESHOLD_PX);
  }

  /** 流式行通用收尾：**先量后挂**——调用方在 `registerRow` **之前**取 `streamShouldPin(pane)`，挂完再调本函数。 */
  function scrollBottom(pane, pin) {
    if (pin === true) scrollBottomForced(pane);
  }

  // —————— Q-1/Q-2（2026-10-12）：批量合帧 + 聊天流**窗口化**（客户「应该虚拟渲染啊」） ——————
  // Q-1：一次批量 flush 期（跨多个事件）内**抑制**滚动与窗口更新；flush 尾统一做一次（不再 per-event 布局）。
  var batchDepth = 0;
  var batchSuppressedScroll = null; // 批内最后一次请求「贴底」的 pane
  var batchDirtyPanes = [];          // 批内需要重算虚拟窗口的 pane（去重）
  function markDirtyPane(pane) {
    for (var i = 0; i < batchDirtyPanes.length; i += 1) if (batchDirtyPanes[i] === pane) return;
    batchDirtyPanes.push(pane);
  }
  /** 批量收尾（每批一次）：左树重渲染一次 + 统一的贴底/窗口更新（绝不在事件循环里逐条做）。 */
  function flushBatchSideEffects() {
    if (batchDepth > 0) return;
    renderRoleTree(); // 状态徽标随事件变化——每批至多一次（原先每事件一次）
    var forcePane = batchSuppressedScroll;
    batchSuppressedScroll = null;
    var streamPin = batchStreamPin; // S-1：批内流式贴底判定（先量后挂的结论）
    batchStreamPin = null;
    if (forcePane && forcePane.parentNode === $("chat")) markDirtyPane(forcePane);
    var dirty = batchDirtyPanes;
    batchDirtyPanes = [];
    // **先**更新窗口（挂尾行、spacer 与实测高落定），**再**贴底——S-1 根因：修前贴底在窗口更新之前，
    // 长会话（窗口化）里 spacer 尚未增长 ⇒ 贴到「旧底」，每批差一整批高度（e2e 实测差 339px）。
    for (var i = 0; i < dirty.length; i += 1) {
      var preferTail = dirty[i] === forcePane || !!(streamPin && streamPin.pin === true && streamPin.pane === dirty[i]);
      try {
        updateVirtualWindow(dirty[i], { preferTail: preferTail });
      } catch (error) {
        diagnose("renderer.event-error", { errorMessage: String(error && error.message || "窗口显示失败"), errorType: String(error && error.name || "Error") });
        setHint("部分内容显示失败，可重新点击角色恢复查看。");
      }
    }
    var target = null;
    if (forcePane && forcePane.parentNode === $("chat")) target = forcePane;
    else if (streamPin && streamPin.pin === true && streamPin.pane && streamPin.pane.parentNode === $("chat")) target = streamPin.pane;
    if (target !== null) $("chat").scrollTop = $("chat").scrollHeight; // 贴底（窗口/高度已落定）
  }

  // Q-2 **窗口化行模型**：每个 pane 一张 append-only **行表**——行 = {build(rec)→元素, el|null, h, keepEl, …}。
  //  · 行数 < `VIRT_MIN_ROWS`（150）⇒ **全挂载**（常规会话逐字不变：既有行为/探针/定位全保）；
  //  · ≥ 阈值 ⇒ 只实体化「视口 ± VIRT_BUFFER 行」，窗口外折成上下 **spacer**（按行占位和撑总高）——离屏行
  //    **不持 DOM、不跑 Markdown**（`build` 惰性、挂载时构造/渲染）；
  //  · 行高：先按类型**估算**，挂载/升级后**实测修正**——口径 = 真实行高（rect，小数）+ pane 行距
  //    （`rowFootprint`；spacer 记账与真实布局同口径，见其注释）；写读分离防 reflow；
  //  · 滚动：`#chat` 的 scroll 经 rAF 合帧后跑一次 `updateVirtualWindow`（每帧至多一次）。
  // 交互行（待确认卡/回交卡/注入行）标 `keepEl`——离窗时**保留元素实例**（监听器/内部状态不丢），仅脱挂。
  var VIRT_MIN_ROWS = 150;
  var VIRT_BUFFER = 30;
  var paneRowLists = Object.create(null); // roleId → rowList
  var rowListSeq = 0; // 行表身份号（真机缺陷修复：锚点物化据此判断「同一张行表」——重建过的表 seq 不同）

  function rowListFor(pane) {
    var key = pane.dataset.roleId || "";
    var rl = paneRowLists[key];
    if (rl && rl.pane === pane) return rl;
    rl = {
      pane: pane,
      seq: ++rowListSeq, // 行表身份（重建即换号——锚点物化的同表校验用）
      rows: [],
      top: document.createElement("div"),    // 上 spacer（窗口以上各行占位之和）
      bottom: document.createElement("div"), // 下 spacer（窗口以下各行占位之和）
      prefix: null,
      allMeasured: false,
      rowGap: null, // pane 纵向行距（flex row-gap）缓存——行占位口径的一半（见 rowFootprint）
    };
    rl.top.className = "virt-spacer";
    rl.bottom.className = "virt-spacer";
    pane.appendChild(rl.top);
    pane.appendChild(rl.bottom);
    paneRowLists[key] = rl;
    return rl;
  }

  function rebuildPrefix(rl) {
    var sums = new Array(rl.rows.length + 1);
    sums[0] = 0;
    for (var i = 0; i < rl.rows.length; i += 1) sums[i + 1] = sums[i] + rl.rows[i].h;
    rl.prefix = sums;
    return sums;
  }

  /** 行模型的**完整布局占位**口径（2026-10-14 锚点漂移修复）：`rec.h` = 行的真实高度（rect，含小数）
   *  + pane 的纵向行距（flex row-gap）。spacer 记账必须与真实布局同口径——窗口化下每行在 pane 里实际
   *  占用「行高 + 行距」，若只记行高（或只记 offsetHeight 的取整值），每次挂/脱引起窗口构成变化时，
   *  其上方正文在内容坐标里都会按行距量级（≈16px/行）位移，开合执行记录组时表现为逐轮累积的阅读
   *  锚点漂移（详见 docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md）。
   *  注意：**脱离文档的 pane 读不到样式表**（后台角色事件/恢复数据会先于挂载进 pane 建行表——
   *  `getComputedStyle` 对未连接元素返回空），此时不得把读不到的结果当 0 落缓存；只在可读（已连接）
   *  时缓存，未读到时返回暂缺省（挂载后的实测会以正确行距修正）。 */
  function paneRowGap(rl) {
    if (rl.rowGap === null && rl.pane.isConnected) {
      var g = parseFloat(getComputedStyle(rl.pane).rowGap);
      if (isFinite(g) && g >= 0) rl.rowGap = g;
    }
    return rl.rowGap === null ? 0 : rl.rowGap;
  }
  function rowFootprint(rl, el) {
    var h = el.getBoundingClientRect().height + paneRowGap(rl);
    return h > 0 ? h : 0;
  }

  /** 挂一行到窗口（保持行序：插到其后首个**已挂载**行之前；没有则插到 bottom spacer 前）。 */
  function attachRow(rl, rec) {
    if (rec.el === null) rec.el = rec.build(rec);
    var pane = rl.pane;
    var next = null;
    for (var i = rec.index + 1; i < rl.rows.length; i += 1) {
      var other = rl.rows[i];
      if (other.el !== null && other.el.parentNode === pane) {
        next = other.el;
        break;
      }
    }
    pane.insertBefore(rec.el, next !== null ? next : rl.bottom);
  }

  /** 脱一行（先量后摘；普通行丢元素——**离屏不持 DOM**；`keepEl` 行保留实例）。 */
  function detachRow(rl, rec) {
    if (rec.el === null) return;
    if (rec.el.parentNode === rl.pane) {
      if (!rec.measured) {
        var m = rowFootprint(rl, rec.el);
        if (m > 0) rec.h = m;
        rec.measured = true;
      }
      rec.el.remove();
    }
    if (!rec.keepEl) rec.el = null;
  }

  /** 记一行（缺省**追加**行表尾；`opts.atIndex` 给出时**按锚点插入**——真机缺陷修复 2026-10-12：
   *  交互卡的（重）物化要落回它发生时的行序位，而不是永远追加到表尾）。`build(rec)` **惰性**造元素
   *  （离屏不构造/不渲染）；`estH` 为估算高（px，**行高口径**——存表时补 pane 行距，与实测同口径）。
   *  插入后其后各行的 index 顺次右移（index 是行在表内的序位——attachRow/卡定位/虚拟窗口都按它找行）。 */
  function registerRow(pane, build, estH, opts) {
    var rl = rowListFor(pane);
    ensureContent(pane);
    var o = opts || {};
    if (o.kind !== "activities") rl.activityGroup = null;
    var at = rl.rows.length;
    if (typeof o.atIndex === "number" && o.atIndex >= 0 && o.atIndex <= rl.rows.length) at = Math.floor(o.atIndex);
    var rec = {
      index: at,
      kind: typeof o.kind === "string" ? o.kind : "",
      build: build,
      el: null,
      h: (typeof estH === "number" && estH > 0 ? estH : 40) + paneRowGap(rl),
      keepEl: o.keepEl === true,
      data: o.data,
      mdReady: o.mdReady === true,
      measured: false,
      requestId: typeof o.requestId === "string" ? o.requestId : null,
      origin: o.origin || rowOrigin, replayToken: Object.prototype.hasOwnProperty.call(o, "replayToken") ? o.replayToken : rowReplayToken,
      manualClientId: o.manualClientId || null,
    };
    if (at === rl.rows.length) {
      rl.rows.push(rec);
    } else {
      rl.rows.splice(at, 0, rec);
      for (var x = at + 1; x < rl.rows.length; x += 1) rl.rows[x].index = x; // 右移重编号（插入极少数，O(n) 一次）
    }
    if (rec.replayToken) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(rec.replayToken)] = rec;
    rl.prefix = null;
    if (rl.rows.length < VIRT_MIN_ROWS) {
      attachRow(rl, rec); // 小 pane：立即挂载（**不**测量——热路径禁逐条强制布局）
    } else if (batchDepth > 0) {
      markDirtyPane(pane); // 批内：只记一次脏（flush 尾统一算窗口）
    } else {
      updateVirtualWindow(pane, null); // 新输出先保留实际视口；确需贴底由显式 scrollBottomForced 处理。
    }
    return rec;
  }

  /** Q-2：按当前滚动位置**实体化视口 ± 缓冲**，窗口外脱挂、spacer 撑高（每帧至多一次）。 */
  function updateVirtualWindow(pane, opts) {
    var rl = paneRowLists[pane.dataset.roleId];
    if (!rl || rl.pane !== pane) return;
    var rows = rl.rows;
    if (rows.length < VIRT_MIN_ROWS) return; // 小 pane：全挂载
    var chat = $("chat");
    if (pane.parentNode !== chat) return; // 游离 pane：切回时再算
    // S-1：进入时记「是否就在底部」——高度/窗口修正后据此补一次贴底（**只在底部者**；上翻者绝不被拽）。
    var wasAtBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight <= 1;
    // 首次（或大规模挂载后）对**已挂载**行做一次实测修正（写读分离，一次布局）。
    if (!rl.allMeasured) {
      for (var a = 0; a < rows.length; a += 1) {
        var ra = rows[a];
        if (ra.el !== null && ra.el.parentNode === pane) {
          var ma = rowFootprint(rl, ra.el);
          if (ma > 0) ra.h = ma;
          ra.measured = true;
        }
      }
      rl.allMeasured = true;
      rl.prefix = null;
    }
    var sums = rl.prefix !== null ? rl.prefix : rebuildPrefix(rl);
    var paneTop = pane.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
    var viewTop = Math.max(0, chat.scrollTop - paneTop);
    var viewBottom = viewTop + chat.clientHeight;
    // 视口首行（≤ viewTop 的最后一行）/ 末行（≥ viewBottom 的第一行前一行）——prefix 线性找（n 小，µs 级）。
    var first = 0;
    while (first + 1 < rows.length && sums[first + 1] <= viewTop) first += 1;
    var last = rows.length - 1;
    while (last > 0 && sums[last] >= viewBottom) last -= 1;
    first = Math.max(0, first - VIRT_BUFFER);
    last = Math.min(rows.length - 1, last + VIRT_BUFFER);
    if (opts && opts.preferTail === true) {
      // 贴底优先：窗口钉在**尾部**（新行到达时尾部即可见），上方只留一个缓冲带。
      last = rows.length - 1;
      first = Math.max(0, last - 2 * VIRT_BUFFER);
    }
    if (opts && typeof opts.preferIndex === "number") {
      first = Math.max(0, opts.preferIndex - VIRT_BUFFER);
      last = Math.min(rows.length - 1, opts.preferIndex + VIRT_BUFFER);
    }
    var newly = [];
    for (var i = first; i <= last; i += 1) {
      var rec = rows[i];
      if (rec.el === null || rec.el.parentNode !== pane) {
        attachRow(rl, rec);
        newly.push(rec);
      }
    }
    for (var j = 0; j < rows.length; j += 1) {
      if (j >= first && j <= last) continue;
      var rj = rows[j];
      if (rj.el !== null && rj.el.parentNode === pane) detachRow(rl, rj);
    }
    rl.top.style.height = sums[first] + "px";
    rl.bottom.style.height = sums[rows.length] - sums[last + 1] + "px";
    // 新挂载行实测（写完统一读——一次布局）。
    var dirty = false;
    for (var k = 0; k < newly.length; k += 1) {
      var mk = rowFootprint(rl, newly[k].el);
      if (mk > 0 && mk !== newly[k].h) {
        newly[k].h = mk;
        dirty = true;
      }
      newly[k].measured = true;
    }
    if (dirty) {
      // S-1：实测修正后**立即**重算 prefix 并把 spacer 高度改到位——避免「估→实」差撑出一帧的高度漂移。
      var sums2 = rebuildPrefix(rl);
      rl.top.style.height = sums2[first] + "px";
      rl.bottom.style.height = sums2[rows.length] - sums2[last + 1] + "px";
    }
    if (wasAtBottom) $("chat").scrollTop = $("chat").scrollHeight; // 本就在底部者：高度修正后仍贴底（上翻者绝不拽）
    var windowState = "viewport";
    if (opts && opts.preferTail === true) windowState = "tail";
    var visibleCount = 0;
    var currentTop = Math.max(0, chat.scrollTop - paneTop);
    var currentBottom = currentTop + chat.clientHeight;
    var currentSums = rl.prefix || rebuildPrefix(rl);
    for (var visibleIndex = first; visibleIndex <= last; visibleIndex += 1) {
      if (currentSums[visibleIndex] < currentBottom && currentSums[visibleIndex + 1] > currentTop) visibleCount += 1;
    }
    diagnose("renderer.viewport", { firstRow: first, lastRow: last, count: rows.length, visibleCount: visibleCount, state: windowState });
  }

  // 滚动 → rAF 合帧 → 一次窗口更新（无 rAF 环境退化为立即——仅测试面）。
  var virtScrollScheduled = false;
  function onChatScroll() {
    if (virtScrollScheduled) return;
    virtScrollScheduled = true;
    var run = function () {
      virtScrollScheduled = false;
      var pane = $("chat").querySelector(".chat-pane");
      if (pane) updateVirtualWindow(pane, null);
      syncCoveredOperatorCards();
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  }

  /** 有第一条内容进入 pane 时清掉它的空状态。 */
  function ensureContent(pane) {
    var empty = pane.querySelector(".chat-empty");
    if (empty) empty.remove();
  }

  /** 取首行（拒绝摘要的折叠标题用；在换行或分号处截断）。 */
  function firstLine(text) {
    var s = String(text == null ? "" : text);
    var i = s.search(/[\n；;]/);
    return i >= 0 ? s.slice(0, i) : s;
  }

  // —————— 事件渲染：气泡 / 系统状态行 / 内联拒绝（均**落到指定 pane**，B-2） ——————
  function appendUser(pane, text, force) {
    var inputPin = force === false ? streamShouldPin(pane) : null;
    var rec = registerRow(
      pane,
      function () {
        var div = document.createElement("div");
        div.className = "msg msg-user";
        // B-1：受控 Markdown 渲染（先转义后解析、只产白名单标签——模型/用户输出绝不可直通 HTML）。
        div.innerHTML = Md.renderMarkdown(text);
        return div;
      },
      52
    );
    if (force === false) scrollBottom(pane, inputPin);
    else scrollBottomForced(pane); // 用户自己的动作：强制贴底
    return rec;
  }

  function appendAssistant(pane, text) {
    // Q-1/Q-2（2026-10-12）：**流式惰性 Markdown**——该角色正在跑（真信号 `roleBusy`）时助手消息先以
    // **纯文本**挂上（textContent——天然转义），一轮结束（settled）再**一次性** Markdown 化该段；
    // 离屏行（窗口化）**不跑解析器**——挂载时才渲染。非流式（回放/静止态消息）逐字照旧即时渲染。
    var roleId = pane.dataset.roleId || "";
    var streaming = state.roleBusy[roleId] === true;
    var pin = streamShouldPin(pane); // S-1：**先量后挂**（在底部附近才贴底；上翻不打断）
    registerRow(
      pane,
      function (rec) {
        var div = document.createElement("div");
        div.className = "msg msg-assistant";
        if (rec.mdReady) {
          div.innerHTML = Md.renderMarkdown(rec.data); // B-1：同上
        } else {
          div.classList.add("is-streaming");
          div.textContent = String(rec.data == null ? "" : rec.data); // 纯文本（无 HTML 注入口）
        }
        return div;
      },
      60,
      { kind: "assistant", data: text, mdReady: !streaming }
    );
    scrollBottom(pane, pin);
  }

  function sysRow(pane, cls, icon, text) {
    var pin = streamShouldPin(pane); // S-1：先量后挂
    var rec = registerRow(
      pane,
      function () {
        var div = document.createElement("div");
        div.className = "sys " + cls;
        div.innerHTML = '<span class="sys-ico">' + icon + '</span><span class="sys-text">' + esc(text) + "</span>";
        return div;
      },
      34, { kind: "system", data: { cls: cls, icon: icon, text: text } }
    );
    scrollBottom(pane, pin);
    return rec.el; // 小 pane（非窗口化）恒已挂载；窗口化下离屏行 el 为 null——调用方须容忍（现有唯一用法=开头 loading 行）
  }

  function refreshActivityHeight(pane, rec, saved) {
    var rl = rowListFor(pane);
    if (rec.el && rec.el.parentNode === pane) {
      var h = rowFootprint(rl, rec.el);
      if (h > 0) rec.h = h;
    }
    rec.measured = false;
    rl.prefix = null;
    if (batchDepth > 0) markDirtyPane(pane);
    else updateVirtualWindow(pane, null);
    if (saved) restoreChatReading(pane, saved);
  }

  function fillActivities(rec) {
    var data = rec.data;
    var unknown = data.items.some(function (a) { return a.status === "unknown"; });
    rec.el.innerHTML = '<summary>查看执行记录<span class="record-count">' + data.items.length + ' 条活动' +
      (unknown ? ' · 含状态未记录' : '') + '</span></summary>' + data.items.map(function (a, i) {
        // v2 对齐（2026-10-13）：三列 = 42px 时间 / 操作名+目标 / 状态；未知状态带 is-unknown（琥珀色）。
        return '<div class="tool-activity" title="' + esc(a.at || '') + '" data-activity-index="' + i + '">' +
          '<span class="activity-time">' + esc(a.at || '') + '</span>' +
          '<span class="activity-op">' + esc(a.toolName) +
          '<span class="activity-target">' + esc(a.target || '目标未记录') + '</span></span>' +
          '<span class="activity-state' + (a.status === "unknown" ? ' is-unknown' : '') + '">' + esc(a.label) + '</span></div>';
      }).join("");
    rec.el.open = data.open;
  }

  function activityIdentity(activity) {
    return activity.turnId && activity.callId && activity.identityPhase ? JSON.stringify([activity.turnId, activity.callId, activity.identityPhase]) : null;
  }
  function lifecycleIdentity(turnId, callId) { return turnId && callId ? JSON.stringify([turnId, callId]) : null; }
  function matchingOperator(pane, activity) {
    var ids = Object.keys(opRequests);
    for (var i = 0; i < ids.length; i += 1) {
      var entry = opRequests[ids[i]];
      if (entry.projectRoot === state.projectRoot && entry.runtime === state.runtime && entry.roleId === pane.dataset.roleId &&
          entry.turnId && entry.toolCallId && entry.turnId === activity.turnId && entry.toolCallId === activity.callId) return entry;
    }
    return null;
  }
  function fillOperatorLifecycle(entry) {
    if (!entry.card || !entry.activityStages) return;
    var panel = entry.card.querySelector(".op-tool-lifecycle");
    if (!panel) { panel = document.createElement("div"); panel.className = "sys sys-call op-tool-lifecycle"; entry.card.appendChild(panel); }
    panel.textContent = ["blocked", "result"].filter(function (phase) { return entry.activityStages[phase]; }).map(function (phase) {
      var activity = entry.activityStages[phase];
      return activity.toolName + " · " + activity.label + (activity.exceptional ? "：" + (activity.deniedSummary || activity.visibleSummary) : "");
    }).join("；");
    panel.hidden = panel.textContent === "";
  }
  function rememberActivities(rl, rec) {
    var map = rl.activityByIdentity || (rl.activityByIdentity = Object.create(null));
    var activities = rec.activityStages ? Object.keys(rec.activityStages).map(function (phase) { return rec.activityStages[phase]; }) :
      rec.toolActivity ? [rec.toolActivity] : rec.kind === "activities" ? rec.data.items : [];
    activities.forEach(function (activity) { var key = activityIdentity(activity); if (key) map[key] = { activity: activity, record: rec };
      if (activity.replayToken) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(activity.replayToken)] = rec;
    });
    if (rec.activityStages && activities.length) (rl.toolLifecycles || (rl.toolLifecycles = Object.create(null)))[lifecycleIdentity(activities[0].turnId, activities[0].callId)] = rec;
  }
  function adoptOperatorLifecycle(pane, entry, card, old) {
    var rl = rowListFor(pane), key = lifecycleIdentity(entry.turnId, entry.toolCallId);
    var rec = key && rl.toolLifecycles && rl.toolLifecycles[key];
    if (!rec || rec.kind === "operator") return null;
    var reading = captureChatReading(pane);
    if (rec.el && rec.el.parentNode === pane) rec.el.replaceWith(card);
    rec.el = card; rec.build = function () { return card; }; rec.kind = "operator";
    rec.keepEl = true; rec.requestId = old ? old.requestId : card.dataset.requestId; rec.replayToken = null;
    rec.activityStages = entry.activityStages = rec.activityStages || entry.activityStages || {};
    entry.card = card; fillOperatorLifecycle(entry); rememberActivities(rl, rec);
    refreshActivityHeight(pane, rec, reading);
    return rec;
  }

  function appendActivity(pane, activity) {
    var rl = rowListFor(pane);
    activity.origin = activity.origin || rowOrigin;
    activity.replayToken = activity.replayToken || rowReplayToken;
    var identity = activityIdentity(activity), map = rl.activityByIdentity || (rl.activityByIdentity = Object.create(null));
    var existing = identity && map[identity];
    if (existing) {
      var previous = existing.activity;
      // 同阶段重复可补失败事实，绝不让重复成功覆盖已知失败/拒绝。
      if (!previous.exceptional || activity.exceptional) {
        var reading0 = captureChatReading(pane);
        if (!activity.fullTarget && previous.fullTarget) { activity.fullTarget = previous.fullTarget; activity.target = previous.target; }
        Object.assign(previous, activity);
        var rec0 = existing.record;
        if (rec0.kind === "activities" && rec0.el) fillActivities(rec0);
        if (rec0.refreshLifecycle) rec0.refreshLifecycle();
        var op0 = matchingOperator(pane, activity); if (op0) fillOperatorLifecycle(op0);
        refreshActivityHeight(pane, rec0, reading0);
      }
      return existing.record;
    }
    if (identity && activity.barrier) {
      var lifecyclePin = streamShouldPin(pane), lifecycleReading = captureChatReading(pane);
      var callKey = lifecycleIdentity(activity.turnId, activity.callId);
      var lifecycles = rl.toolLifecycles || (rl.toolLifecycles = Object.create(null));
      var lifecycle = lifecycles[callKey], operator = matchingOperator(pane, activity);
      if (!lifecycle && operator) lifecycle = rl.rows.find(function (record) { return record.requestId && opRequests[record.requestId] === operator; });
      if (!lifecycle) {
        lifecycle = registerRow(pane, function (record) {
          var el = document.createElement("div"); el.className = "sys sys-call";
          record.el = el; if (record.refreshLifecycle) record.refreshLifecycle(); return el;
        }, 34, { kind: "tool-lifecycle", data: null });
        lifecycle.activityStages = {};
        lifecycle.refreshLifecycle = function () {
          if (!lifecycle.el || lifecycle.kind === "operator") return;
          lifecycle.el.textContent = activity.toolName + " · " + ["start", "blocked", "result"].filter(function (phase) { return lifecycle.activityStages[phase]; }).map(function (phase) {
            var stage = lifecycle.activityStages[phase]; return stage.label + (stage.exceptional ? "：" + (stage.deniedSummary || stage.visibleSummary) : "");
          }).join("；");
        };
      }
      lifecycle.activityStages = lifecycle.activityStages || {};
      lifecycle.activityStages[activity.identityPhase] = activity;
      lifecycles[callKey] = lifecycle;
      if (operator) { operator.activityStages = lifecycle.activityStages; fillOperatorLifecycle(operator); }
      if (lifecycle.refreshLifecycle) lifecycle.refreshLifecycle();
      rememberActivities(rl, lifecycle); refreshActivityHeight(pane, lifecycle, lifecycleReading);
      scrollBottom(pane, lifecyclePin);
      return lifecycle;
    }
    if (activity.callId) {
      var targets = rl.activityTargets || (rl.activityTargets = Object.create(null));
      var targetKey = JSON.stringify([activity.turnId, activity.callId, activity.toolName]);
      if (activity.fullTarget) targets[targetKey] = { fullTarget: activity.fullTarget, target: activity.target };
      else if (targets[targetKey]) { activity.fullTarget = targets[targetKey].fullTarget; activity.target = targets[targetKey].target; }
    }
    if (activity.exceptional) {
      rl.activityGroup = null;
      appendDenied(pane, activity.deniedSummary || activity.visibleSummary || activity.toolName + ' · ' + activity.label, activity.fullTarget);
      var deniedRec = rl.rows[rl.rows.length - 1]; deniedRec.toolActivity = activity; rememberActivities(rl, deniedRec);
      return deniedRec;
    }
    if (activity.barrier) {
      rl.activityGroup = null;
      sysRow(pane, "sys-call", ICONS.call, activity.toolName + ' · ' + activity.label + (activity.target ? ' · ' + activity.target : ''));
      return rl.rows[rl.rows.length - 1];
    }
    var pin = streamShouldPin(pane); // S-1：先量后挂
    var saved = !pin ? captureChatReading(pane) : null;
    var rec = rl.activityGroup;
    if (rec && activity.turnId && rec.data.turnId && activity.turnId !== rec.data.turnId) rec = null;
    if (!rec) {
      var roleId = pane.dataset.roleId;
      var identity = activity.callId || (activity.at ? JSON.stringify([activity.at, activity.toolName, activity.target, activity.phase, activity.summary]) : "");
      var counts = groupIdentitiesByRole[roleId] || (groupIdentitiesByRole[roleId] = Object.create(null));
      var id = identity ? 'activity:' + identity + ':' + (counts[identity] = (counts[identity] || 0) + 1) :
        'ephemeral-' + (groupSeqByRole[roleId] = (groupSeqByRole[roleId] || 0) + 1);
      var opens = activityOpen[roleId] || (activityOpen[roleId] = Object.create(null));
      rec = registerRow(pane, function (record) {
        var el = document.createElement("details");
        el.className = "tool-records";
        record.el = el;
        fillActivities(record);
        el.addEventListener("toggle", function () {
          if (record.data.open === el.open) return;
          var reading = captureChatReading(pane);
          record.data.open = el.open;
          opens[record.data.id] = el.open;
          refreshActivityHeight(pane, record, reading);
        });
        return el;
      }, 38, { kind: "activities", data: { id: id, items: [activity], open: opens[id] === true, turnId: activity.turnId } });
      rl.activityGroup = rec;
    } else {
      rec.data.items.push(activity);
      if (activity.replayToken) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(activity.replayToken)] = rec;
      if (!rec.data.turnId && activity.turnId) rec.data.turnId = activity.turnId;
      if (rec.el) fillActivities(rec);
      refreshActivityHeight(pane, rec, saved);
    }
    rememberActivities(rl, rec);
    scrollBottom(pane, pin);
    return rec;
  }

  /** 拒绝事件：内联显示，点击可展开看完整信息（含按根分组的允许路径）。 */
  function appendDenied(pane, text, target) {
    // 仅截正文换行，命令里的分号不是原因/退出码的边界。
    var headline = String(text == null ? "" : text).split(/\r?\n/)[0].trim();
    var pin = streamShouldPin(pane); // S-1：先量后挂
    registerRow(
      pane,
      function () {
        var det = document.createElement("details");
        det.className = "sys-denied";
        det.innerHTML =
          "<summary>" + '<span class="denied-copy"><span>' + esc(headline) + '</span>' +
          (target && headline.indexOf(target) >= 0 ? "" : '<span class="denied-target">' + esc(target || "目标未记录") + '</span>') +
          "</span>" + ICONS.chev + "</summary>" +
          '<div class="sys-detail">' + esc(text) + "</div>";
        return det;
      },
      40
    );
    scrollBottom(pane, pin);
  }

  /**
   * 回交（设计 §10.8；C-1 回交报告卡片，2026-10-12）：角色会话**完成一个任务**时，编排在 `settled` 之前
   * 发一个 `handback` 事件（`{roleId, taskId?, status, summary, evidence, at}`，「只搬证据、不搬身份/写权」）。
   * C-1 起内容来自模型的 `submit_report`（未调用则回退既有推导）——桌面**只管呈现**：
   * 卡片按 **角色 / 任务（若有）/ 结论（completed|blocked）/ 摘要 / 证据（逐条列出文件路径）** 呈现；
   * **摘要与证据逐条 esc**（`markdown.js` 的**单一转义来源**——模型输出禁直插 HTML）；
   * 证据为空 → 「（未提供证据）」（不留空白）；`blocked` 除文字外还给**明显视觉区分**（左语义色竖条，见样式）。
   *
   * 呈现（客户原话「其他的角色完成了要返回给 su」；B-2 起按信封落到**各自角色**的 pane，切回即见）：
   *  - 在**产出该回交的角色自己的聊天里**显示一张「**回交 su**」卡片；
   *  - 同时把该回交**镜像进主入口角色 su 的聊天流**——标题为「**来自 <role> 的报告**」。
   *
   * 本函数只**呈现**事件携带的结构化数据，**不作任何判定**（是否完成/是否被拦由编排给出）；
   * 「谁进谁的 pane」的分发在 `appendEvent` 里按信封 `roleId` 决定（B-2：各归各的 pane，无跨角色串扰）。
   */
  function appendHandback(pane, hb) {
    ensureContent(pane);
    var blocked = hb.status !== "completed";
    var statusLabel = "未知状态";
    if (hb.status === "completed") statusLabel = "已完成";
    else if (hb.status === "blocked") statusLabel = "被拦下";
    else if (hb.status === "failed") statusLabel = "失败";
    else if (hb.status === "aborted") statusLabel = "已中止";
    else if (hb.status === "unreported") statusLabel = "未报告";
    var title = "回交主入口";
    if (hb.evidence !== undefined && !Array.isArray(hb.evidence)) throw new Error("报告证据形状不符");
    var evItems = hb.evidence && hb.evidence.length
      ? hb.evidence.map(function (e) { return '<li class="hb-ev">' + esc(e) + "</li>"; }).join("")
      : '<li class="hb-ev hb-ev-empty">（未提供证据）</li>';
    var meta = "角色 " + esc(hb.roleId) + (hb.taskId ? "，任务 " + esc(hb.taskId) : "");
    var card = document.createElement("div");
    // `is-blocked`：blocked 的**可见**区分（左语义色竖条 + 边色；不只靠状态文字）。
    card.className = "msg-handback";
    if (blocked) card.className += " is-blocked";
    card.innerHTML =
      '<div class="hb-head">' +
      '<span class="hb-ico">' + ICONS.handback + "</span>" +
      '<span class="hb-title">' + title + "</span>" +
      '<span class="hb-status ' + (blocked ? "hb-blocked" : "hb-ok") + '">' + statusLabel + "</span>" +
      "</div>" +
      '<div class="hb-meta">' + meta + "</div>" +
      // N-4（2026-10-12 客户裁定「都要 markdown 化」）：回交卡**摘要**（角色产出的报告文本）走**同一 Markdown
      // 管线**（同一 `esc`/白名单）；**证据列表**保持逐条 esc（不拼成一段 Markdown）。
      '<div class="hb-summary card-md">' + Md.renderMarkdown(hb.summary || "") + "</div>" +
      '<ul class="hb-evidence">' + evItems + "</ul>";
    var pin = streamShouldPin(pane); // S-1：先量后挂（回交卡到达也按「在底部才贴底」）
    registerRow(pane, function () { return card; }, 190, { keepEl: true, kind: "handback" }); // Q-2：卡离窗保留实例
    scrollBottom(pane, pin);
  }

  // —————— shell 命令确认卡（M-1，2026-10-12 客户裁定「这个太丑了」）：应用内卡片替代原生对话框 ——————
  // 三层闸 (a) 层：命令原文**逐字**呈在等宽 `<pre>`；白话摘要与人话版「为什么问你」由**主进程**推来
  // （行话不外露，见 operator-channel.ts 的 `shellIntentSummary`/`plainReasonFor`）；argv/cwd 折叠在「详情」。
  // **fail-closed**：拒绝为**默认焦点**；关闭（×）/ Esc / 「拒绝」一律回 `{allow:false}`——恰 `allow:true`
  // 才可能放行。渲染侧**只呈现**：不做任何命令判定；回传失败/失效时如实标记（**绝不**呈现为「已放行」）。
  // **无计时器**（G-1 纪律）：本卡不按时间自我定格——超时判定在主进程通道侧（超时 = 不放行）。
  var SHELL_CONFIRM_DEFAULT_HINT = "点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。";

  function onShellConfirm(payload) {
    if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || payload.id === "") return;
    if (!Rt.matchesView(payload, state.projectRoot, state.runtime)) return;
    var cur = state.shellConfirm;
    if (!cur || cur.id !== payload.id) cur = { id: payload.id, busy: false, runtime: state.runtime, projectRoot: state.projectRoot, roleId: payload.roleId, payload: payload };
    state.shellConfirm = cur;
    if (!backgroundDelivery) renderShellConfirm(cur);
  }

  function renderShellConfirm(cur) {
    var payload = cur.payload;
    // 命令**逐字原文**：textContent 落入（无 HTML 注入口——不美化、不改写、不截断）。
    $("sc-command").textContent = typeof payload.command === "string" ? payload.command : "";
    var summary = typeof payload.summary === "string" && payload.summary !== "" ? payload.summary : "";
    var sumEl = $("sc-summary");
    sumEl.textContent = summary;
    sumEl.hidden = summary === ""; // 无从安全概括 ⇒ 只显示命令本体（绝不编意图）
    $("sc-reason").textContent = typeof payload.reasonPlain === "string" ? payload.reasonPlain : "";
    $("sc-cwd").textContent = typeof payload.cwd === "string" ? payload.cwd : "";
    $("sc-argv").textContent = Array.isArray(payload.argvLines) ? payload.argvLines.join("\n") : "";
    var raw = typeof payload.reasonRaw === "string" && payload.reasonRaw !== "" ? "审核原文（内部用语，仅供核查）：" + payload.reasonRaw : "";
    var rawEl = $("sc-reason-raw");
    rawEl.textContent = raw;
    rawEl.hidden = raw === "";
    $("sc-details").open = false; // 技术详情**默认收起**（每次来新请求都复位）

    var overlay = $("shell-confirm");
    overlay.hidden = false;
    overlay.classList.remove("is-expired");
    $("sc-hint").textContent = SHELL_CONFIRM_DEFAULT_HINT;
    $("sc-deny").disabled = cur.busy;
    $("sc-allow").disabled = cur.busy;
    $("sc-close").disabled = cur.busy;
    if (cur.expiredReason) markShellConfirmExpired(cur.expiredReason);
    $("sc-deny").focus(); // 拒绝为默认焦点（fail-closed 的 UI 侧同向）
  }

  function closeShellConfirm() {
    if (!backgroundDelivery) $("shell-confirm").hidden = true;
    state.shellConfirm = null;
  }

  /** 卡片终态（失效/回传失败）：禁用全部动作键 + 如实一行——**绝不**呈现为「已放行」。 */
  function markShellConfirmExpired(text) {
    if (!state.shellConfirm) return;
    state.shellConfirm.busy = true;
    state.shellConfirm.expiredReason = text;
    if (backgroundDelivery) return;
    $("shell-confirm").classList.add("is-expired");
    $("sc-deny").disabled = true;
    $("sc-allow").disabled = true;
    $("sc-close").disabled = false; // 失效后只可关闭展示，不回传放行。
    $("sc-hint").textContent = text;
  }

  /** 回传决定（**恰 allow:true 才作为放行**；拒绝/Esc/关闭均为 false）。受理 ⇒ 收起卡片；
   *  失效/通道失败 ⇒ 如实终态（不假装已裁决、更不假装已放行）。 */
  function respondShellConfirm(allow) {
    var cur = state.shellConfirm;
    if (!cur) return;
    if (cur.busy) { if (cur.expiredReason && allow !== true) closeShellConfirm(); return; }
    cur.busy = true;
    var done = function (res) {
      deliverRuntimePayload(cur, function () {
      if (state.shellConfirm !== cur) return;
      if (res && res.ok === true) {
        closeShellConfirm();
        return;
      }
      if (res && res.expired === true) {
        markShellConfirmExpired("此确认已失效（超时或应用重启），未获放行——请让角色重新发起。");
        return;
      }
      markShellConfirmExpired("未能回传你的决定（通道未接或异常）——按 fail-closed 不放行；请让角色重新发起。");
      });
    };
    if (!d.shellConfirmRespond) {
      done(null);
      return;
    }
    Promise.resolve(d.shellConfirmRespond({ id: cur.id, allow: allow === true })).then(done, function () {
      done(null);
    });
  }

  // —————— 客户交互卡（A-5，2026-10-12）：确认 / 单选 / 多选 / 带预览的确认 ——————
  // 客户裁定（设计 A-1/A-5）：「客户确定了才加、才落盘」——su 的 `request_confirmation` / `request_choice`
  // 挂起等客户作答时，主进程经 `session:operator-request` 把请求推来；本函数把它渲染为**该角色聊天流里
  // 的一张交互卡**（kind：confirm〔含带预览〕/ choice〔单选或勾选〕）。客户作答经 `operatorRespond` 回传——
  // **主进程按请求快照校验**（选项 id 必须 ⊆ 已发）。**界面不作判定**：发行 writeSet 在编排、写不写在
  // 门禁+工具——本层只呈现与收集，**绝不悄悄放行**（取消/不同意 = declined = 未获同意）。
  //
  // **B-3 接线（A-5 起真的会亮）**：请求到达 ⇒ 该角色状态徽标点「**等待你确认**」；作答（含取消/回传
  // 受理失败重试期间）与受理结果同步切换——不再留位。

  /** 交互请求卡（冻结形状 `CustomerInputRequest` → 卡片；作答经 `d.operatorRespond` 回传）。 */
  // —— 真机缺陷修复（2026-10-12）：交互请求**严格投递**所属角色的 pane + 挂起登记表（去重/重物化/失效终态）——
  // 缺陷（客户真机）：卡只在「请求到达时正被查看的那个会话」里可见；切走后无从得知（110s 空转超时）。
  // 修法（本块）：
  //  · **roleId 只信 payload**——不再 `|| state.selectedRoleId` 回落（那会把卡落进"当时在看"的 pane：错卡+丢卡同源）；
  //  · `opRequests` 登记表把「请求」与「渲染」解耦：一条请求**一次渲染**（幂等），pane 重挂后按表**补挂**；
  //  · 请求不属于**当前查看**的角色时，向当前 pane 放一条**只读指针**（只提示位置，不搬卡、不落错）；
  //  · **失效终态**（respond 回 `expired`，G-1 起**只剩一种真实失效**：应用关闭/重启后未决请求不复存在——
  //    客户已裁定「没必要超时啊，就卡在这等客户同意呗」）——卡片可**无限期**保持待答；本块**无任何计时器**
  //    （无 setTimeout/setInterval，测试有钉子）；时限问题归适配器侧，桌面不自造第二套计时。
  var opRequests = Object.create(null); // requestId → { roleId, request, state:"open"|"decided"|"expired", finalNote, card,
                                        //   anchorKey（请求锚点键，主进程按单一算法给出）,
                                        //   anchorIndex/anchorListSeq（首次物化的行序位与行表身份——重物化落位用）}
  var opLocalSeq = 0; // 防御：payload 无 id 时本地生成（正常链路 channel 恒给 id）

  // ——— 回放锚点表（真机缺陷修复 2026-10-12：「已决卡切走再切回跑到聊天流最末尾」）———
  // 主进程 session-history.ts 解析会话 JSONL 时，把 request_confirmation / request_choice 的**调用行**与
  // **结论行**带上同一标识（requestId＝pi toolCallId、anchor="request"|"conclusion"、anchorKey＝请求本体
  // kind+title 的单一算法键）。渲染侧回放时按 anchorKey 记下两行的**行序位**，交互卡（重）物化时据此把卡
  // 插回「调用工具 request_confirmation」行之后（两行之间）＝它发生时的位置。open 与 decided 一视同仁。
  var paneAnchors = Object.create(null); // roleId → Map<anchorKey, {requestIndex, conclusionIndex, rowsAtReplay}>

  /** 登记一枚回放锚点（appendReplayRow 对带 anchorKey 的回放行调用）。同一 anchorKey 再次出现（同题请求
   *  历史上问过两次）⇒ 以**最后一次**为准（新的一问把旧结论作废、等它自己的结论行配对）。
   *  `rowsAtReplay` = 该行登记时的行表长度——重物化时校验当前行表至少长到这个规模（防行表重建后错位）。 */
  function noteReplayAnchor(roleId, row, rowIndex) {
    var key = String(roleId == null ? "" : roleId);
    if (typeof row.anchorKey !== "string" || row.anchorKey === "") return;
    var table = paneAnchors[key];
    if (!table) table = paneAnchors[key] = new Map();
    var a = table.get(row.anchorKey);
    if (!a) {
      a = { requestIndex: null, conclusionIndex: null, rowsAtReplay: 0 };
      table.set(row.anchorKey, a);
    }
    if (row.anchor === "request") {
      a.requestIndex = rowIndex;
      a.conclusionIndex = null; // 新的一问：旧结论作废（配对以最后一次调用为准）
    } else if (row.anchor === "conclusion" && a.conclusionIndex === null) {
      a.conclusionIndex = rowIndex; // 只配第一次见到的结论（紧跟其调用行的那次）
    }
    a.rowsAtReplay = rowIndex + 1;
  }

  /** 该角色**未作答**请求的 id 列表（登记次序=到达次序）——左树徽标 / 当前 pane 指针 / P-1 chip **共用同一状态源**。 */
  function openRequestIdsFor(roleId) {
    var ids = [];
    for (var id in opRequests) {
      if (opRequests[id].roleId === roleId && opRequests[id].state === "open") ids.push(id);
    }
    return ids;
  }

  function openRequestCountFor(roleId) {
    return openRequestIdsFor(roleId).length;
  }

  /** 刷新该角色的「等待你确认」徽标（**任一** open 请求在 ⇒ 亮；全终态 ⇒ 灭）——只由既有事实推导。
   *  P-1（2026-10-12）：同处一并刷新**待确认 chip**（三者一致：同一状态源、同一刷新点）。 */
  function refreshAwaitingBadge(roleId) {
    metaFor(roleId).awaitingConfirm = openRequestCountFor(roleId) > 0;
    renderRoleTree();
    updateOpChip(roleId);
    renderCurrentWork(roleId);
    if (!backgroundDelivery) syncCoveredOperatorCards();
  }

  function refreshEntryAwaiting(entry) {
    deliverRuntimePayload({ projectRoot: entry.projectRoot, runtime: entry.runtime, roleId: entry.roleId }, function () { refreshAwaitingBadge(entry.roleId); });
  }

  /** 卡片的**终态呈现**（按钮永久隐藏 + 如实说明；重物化时同款输出）。 */
  function freezeOperatorCard(card, text, cls) {
    var bs = card.querySelectorAll(".op-actions button");
    for (var i = 0; i < bs.length; i += 1) bs[i].hidden = true;
    var noteEl = card.querySelector(".op-note");
    if (noteEl) {
      noteEl.hidden = false;
      noteEl.className = "op-note" + (cls ? " " + cls : "");
      noteEl.textContent = text;
    }
  }

  /** 该 pane 里某卡的**元素**（按 data-request-id 逐子节点比对——不做选择器拼接；找不到 ⇒ null）。 */
  function cardElInPane(pane, requestId) {
    var kids = pane.children;
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].dataset && kids[i].dataset.requestId === requestId) return kids[i];
    }
    return null;
  }

  /** 该 pane 里是否已有这张卡。 */
  function cardInPane(pane, requestId) {
    return cardElInPane(pane, requestId) !== null;
  }

  /** P-1：此刻**是否可以自动滚动**到该角色的卡（判据纯映射在 ui-labels.js：正看着 + 距底 ≤ 阈值）。 */
  function arrivalShouldScrollToCard(roleId) {
    var chat = $("chat");
    var viewing = state.selectedRoleId === roleId && paneFor(roleId).parentNode === chat;
    var distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    return UiLabels.arrivalScrolls(viewing, distance, UiLabels.AUTO_SCROLL_THRESHOLD_PX);
  }

  /** P-1：滚动到该卡并**高亮**（一次性 CSS 动画——无计时器，G-1 纪律不破）；卡不在当前视图 ⇒ 不打扰、返回 false。
   *  Q-2：窗口化下目标行可能**未实体化** ⇒ **先实体化（含实测）再滚动**（P-1 语义在窗口化下保住）。 */
  function scrollToOperatorCard(roleId, requestId) {
    var pane = paneFor(roleId);
    var rl = paneRowLists[roleId];
    var rec = null;
    if (rl && rl.pane === pane) {
      for (var i = 0; i < rl.rows.length; i += 1) {
        if (rl.rows[i].requestId === requestId) {
          rec = rl.rows[i];
          break;
        }
      }
    }
    var el = null;
    if (rl && rec !== null && rl.rows.length >= VIRT_MIN_ROWS) {
      // 窗口化：先实体化该行（未挂载则挂载 + 实测），再按其真实位置滚动（块居中）。
      if (rec.el === null || rec.el.parentNode !== pane) {
        attachRow(rl, rec);
        var m = rowFootprint(rl, rec.el);
        if (m > 0) rec.h = m;
        rec.measured = true;
        rl.prefix = null;
      }
      el = rec.el;
      var chat = $("chat");
      if (pane.parentNode === chat) {
        var sums = rl.prefix !== null ? rl.prefix : rebuildPrefix(rl);
        var paneTop = pane.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
        chat.scrollTop = Math.max(0, paneTop + sums[rec.index] - (chat.clientHeight - rec.h) / 2);
        updateVirtualWindow(pane, null); // 归位窗口（其余行按新位置重新挂/脱）
        // 邻近行首次实体化会修正估算高；明确定位以卡的最终真实rect校准，不能停在旧prefix坐标。
        if (el && el.parentNode === pane) {
          var cardBounds = el.getBoundingClientRect();
          var viewportBounds = chat.getBoundingClientRect();
          chat.scrollTop += cardBounds.top - viewportBounds.top - Math.max(0, (chat.clientHeight - cardBounds.height) / 2);
        }
      }
    } else {
      el = cardElInPane(pane, requestId);
    }
    if (el === null) return false;
    if (pane.parentNode === $("chat")) {
      if (!(rl && rl.rows.length >= VIRT_MIN_ROWS)) el.scrollIntoView({ block: "center" }); // 非窗口化：直接滚到元素
      el.classList.remove("is-flash");
      void el.offsetWidth; // 强制 reflow：同一次点击/重复定位也能**重播**高亮动画
      el.classList.add("is-flash");
    }
    return true;
  }

  // —————— P-1（2026-10-12 真机：su 的卡被 288 行活动淹掉、客户以为卡丢了）：常驻「待确认」chip ——————
  // 位置 = **该角色视图底部**的悬浮药丸（#chat 的 sticky 尾元素；同一时刻只有一个 pane 挂载）。
  // 语义：未作答卡存在**且正看着该角色** ⇒ 亮（计数=**同一状态源** `openRequestIdsFor`）；点击**逐张定位**
  // （滚动到下一张未作答卡并高亮；到达次序循环）；作答/失效（终态）⇒ 灭。**无计时器**。
  var opChip = null;
  var opChipState = { roleId: "", count: 0, cursor: 0 };

  function ensureOpChip() {
    if (opChip !== null) return opChip;
    var el = document.createElement("button");
    el.type = "button";
    el.id = "op-chip";
    el.className = "op-chip";
    el.hidden = true;
    el.innerHTML = '<span class="op-chip-ico" aria-hidden="true">' + ICONS.shield + '</span><span class="op-chip-text"></span>';
    el.addEventListener("click", function () {
      // 逐张定位：点一下滚到**下一张**未作答卡（到达次序循环）并高亮。
      var roleId = String(state.selectedRoleId == null ? "" : state.selectedRoleId);
      var ids = openRequestIdsFor(roleId);
      if (ids.length === 0) return;
      if (opChipState.cursor >= ids.length) opChipState.cursor = 0;
      closeRightDrawer(); // 主动定位先露出完整卡；普通到达/刷新不关抽屉。
      scrollToOperatorCard(roleId, ids[opChipState.cursor]);
      var card = cardElInPane(paneFor(roleId), ids[opChipState.cursor]);
      if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
      opChipState.cursor += 1;
    });
    opChip = el;
    return el;
  }

  /** 刷新 chip（与左树徽标 / 当前 pane 指针**同一状态源**、同一刷新点）。 */
  function updateOpChip(roleId) {
    if (backgroundDelivery) return;
    var el = ensureOpChip();
    var viewing = state.selectedRoleId === roleId && paneFor(roleId).parentNode === $("chat");
    var ids = openRequestIdsFor(roleId);
    if (!viewing || ids.length === 0) {
      el.hidden = true;
      return;
    }
    if (opChipState.roleId !== roleId || opChipState.count !== ids.length) {
      opChipState.roleId = roleId;
      opChipState.count = ids.length;
      opChipState.cursor = 0; // 计数变了（新到达/已作答）⇒ 定位从头开始（先给最早那张）
    }
    el.querySelector(".op-chip-text").textContent = UiLabels.pendingChipLabel(ids.length);
    el.hidden = false;
    $("chat").appendChild(el); // 保持在 #chat 尾部（sticky 贴底）——空状态/重挂把它清掉后由本处复位
  }

  /** 交互请求到达：**严格路由** + 幂等物化 + 徽标 + （未查看时的）只读指针。 */
  function appendOperatorRequest(payload) {
    if (!payload || typeof payload !== "object") return;
    var req = payload.request && typeof payload.request === "object" ? payload.request : {};
    var requestId = payload.id ? String(payload.id) : "op-local-" + (++opLocalSeq);
    var rawRoleId = typeof payload.roleId === "string" ? payload.roleId : "";
    // 严格路由：**绝不**回落 `state.selectedRoleId`——正常链路（channel 每会话闭包恒带 roleId）不会走到空值分支；
    // 若真为空（异常），落到显式命名的兜底并如实说明，**不**冒充"当前查看的角色"。
    var roleId = rawRoleId !== "" ? rawRoleId : "(未标识角色)";
    var entry = opRequests[requestId];
    if (entry) {
      materializeOperatorCard(requestId); // 重复到达（重放/重渲染）：幂等补挂，不重复建卡、不重复提示
      return;
    }
    // anchorKey：请求的锚点键（主进程按单一算法从请求本体 kind+title 拼出）——（重）物化时与回放行
    // 精确关联、把卡落回它发生的位置；payload 未带（旧主进程/探针直发）⇒ null ⇒ 走首物化位/兜底落尾。
    var anchorKey = typeof payload.anchorKey === "string" && payload.anchorKey !== "" ? payload.anchorKey : null;
    opRequests[requestId] = entry = { roleId: roleId, runtime: state.runtime, projectRoot: state.projectRoot, turnId: typeof payload.turnId === "string" ? payload.turnId : "", toolCallId: typeof payload.toolCallId === "string" ? payload.toolCallId : "", request: req, state: "open", finalNote: null, card: null, anchorKey: anchorKey };
    materializeOperatorCard(requestId);
    refreshAwaitingBadge(roleId);
    if (backgroundDelivery) return;
    if (rawRoleId === "") {
      sysRow(activePane(), "sys-call", ICONS.shield, "（异常）收到一条未带角色标识的交互请求——已就地呈现；正常链路不会如此。");
    } else if (roleId !== state.selectedRoleId) {
      // 可见性指针：请求**不属于**当前查看的角色时，在当前 pane 放一条只读提示（客户「切走就看不到」的正面解法）。
      sysRow(activePane(), "sys-call", ICONS.shield, "【待确认】角色 " + esc(roleId) + " 有一条交互请求等你作答——点左侧该角色查看。");
    }
  }

  function onOperatorExpired(payload) {
    if (state.shellConfirm && state.shellConfirm.id === payload.id) markShellConfirmExpired("此确认已失效，未获放行。" + (payload.reason || "请让角色重新发起。"));
    var entry = payload && opRequests[payload.id];
    if (!entry || entry.state !== "open" || payload.roleId !== entry.roleId) return;
    entry.state = "expired";
    entry.finalNote = { text: "请求已失效，未获同意。" + (payload.reason ? "原因：" + payload.reason : "请让角色重新发起。"), cls: "op-note-err" };
    if (entry.card) freezeOperatorCard(entry.card, entry.finalNote.text, entry.finalNote.cls);
    refreshEntryAwaiting(entry);
  }

  /** pane 重挂/重建后的**补挂**（正常路径卡随 pane 元素存活；本钩子防 pane 被重建时丢卡）。 */
  function materializePendingFor(roleId) {
    for (var id in opRequests) {
      if (opRequests[id].roleId === roleId) materializeOperatorCard(id);
    }
  }

  /** 交互卡的**插入位**（锚点物化的②级；真机缺陷修复 2026-10-12）。按优先级：
   *  a. 首次物化记录的行序位（`anchorListSeq` 校验同一张行表）：其后新行只追加/重编号 ⇒ 此位恒指
   *     「它发生时的地方」；
   *  b. 回放锚点表（`anchorKey` 与回放行精确关联——主进程给回放行带 requestId/anchor/anchorKey）：
   *     插到「调用工具 request_confirmation」行**之后**（结论行之前）＝两行之间；只有结论行可锚时
   *     插到它**之前**（附近）。`rowsAtReplay` 校验当前行表至少长到锚点登记时的规模（防行表重建后错位）。
   *  c. **兜底：返回 null ⇒ registerRow 追加行表尾**——找不到任何锚点时**绝不丢卡**（不丢卡优先于落位；
   *     落尾的卡仍可被 P-1 chip 定位、作答、定格，只是时序位靠后——如实取舍）。 */
  function operatorAnchorIndex(rl, entry) {
    if (typeof entry.anchorIndex === "number" && entry.anchorListSeq === rl.seq && entry.anchorIndex <= rl.rows.length) {
      return entry.anchorIndex;
    }
    if (entry.anchorKey) {
      var table = paneAnchors[entry.roleId];
      var a = table ? table.get(entry.anchorKey) : null;
      if (a && rl.rows.length >= a.rowsAtReplay) {
        if (a.requestIndex !== null && a.requestIndex + 1 <= rl.rows.length) return a.requestIndex + 1;
        if (a.conclusionIndex !== null && a.conclusionIndex <= rl.rows.length) return a.conclusionIndex;
      }
    }
    return null; // 兜底：行表尾（绝不丢卡——位置让位于不丢）
  }

  /** 物化（幂等）：按登记表把卡建进**其所属** pane——一条请求一次渲染；终态按 finalNote 定格呈现。
   *  **锚点物化（真机缺陷修复 2026-10-12，「已确认的卡切走再切回跑到聊天流最下面」）**——三级落位：
   *  ① **行表里已有这张卡的行 ⇒ 复用、直接返回**（**主修复**）。keepEl 行被虚拟窗口脱挂（离屏）时，
   *     `cardInPane`（按当前 DOM 子节点找）会误判「卡丢了」——旧实现据此**重新建卡并 registerRow 追加行表尾**，
   *     即客户所见：已决/未决卡每次切走切回都被搬到流尾，且旧行仍持旧元素（潜在双份呈现）。行仍在（只是
   *     离屏不持 DOM——keepEl 元素实例保留），虚拟窗口滚到它时自会挂回；这里无事可做。
   *  ② 走不到 ①（行表被整体重建而登记表仍在——防线）⇒ **按锚点落位**（`operatorAnchorIndex`）：
   *     首次物化记录的行序位 → 回放锚点表（anchorKey 与回放行精确关联）。**首次到达不加锚**——
   *     卡就是当下最新事件，行表尾即它发生的位置（防同题新请求被回放锚点插进历史）。
   *  ③ **兜底：追加行表尾**——找不到任何锚点也**绝不丢卡**（不丢卡优先于落位；语义在 operatorAnchorIndex 写明）。
   *  open 与 decided 一视同仁（decided 卡按 finalNote 定格呈现，落位同法）。 */
  function materializeOperatorCard(requestId) {
    var entry = opRequests[requestId];
    if (!entry) return;
    var pane = paneFor(entry.roleId);
    var rl0 = paneRowLists[String(entry.roleId == null ? "" : entry.roleId)];
    if (rl0 && rl0.pane === pane) {
      for (var i0 = 0; i0 < rl0.rows.length; i0 += 1) {
        if (rl0.rows[i0].kind === "operator" && rl0.rows[i0].requestId === requestId) return; // ① 行仍在（可能离屏）——卡未丢
      }
    }
    ensureContent(pane);
    if (cardInPane(pane, requestId)) return; // 去重：行表缺失但 DOM 还在（防御）——同样不重建
    var req = entry.request;

    var isChoice = req.kind === "choice";
    var multiple = isChoice && req.multiple === true;
    // 卡片变体类（**命名与按钮不冲突**：按钮用 op-confirm/op-deny/op-submit/op-cancel，卡用 op-kind-*）。
    var variantClass = isChoice
      ? (multiple ? "op-kind-multi" : "op-kind-select")
      : (req.preview ? "op-kind-preview" : "op-kind-confirm");

    var card = document.createElement("div");
    card.className = "op-request " + variantClass;
    card.dataset.requestId = requestId;

    var html = "";
    html +=
      '<div class="op-head">' +
      '<span class="op-ico">' + ICONS.shield + "</span>" +
      '<span class="op-title">' + esc(isChoice ? req.title || "请选择" : req.title || "请确认") + "</span>" +
      "</div>";
    if (isChoice && typeof req.question === "string" && req.question !== "") {
      html += '<div class="op-question">' + esc(req.question) + "</div>";
    }
    // 预览（两种 kind 都可带）：**折叠**（details）+ 限高可滚 + pre-wrap——长角色卡正文也能读。
    if (typeof req.preview === "string" && req.preview !== "") {
      html +=
        '<details class="op-preview"><summary>' + ICONS.chev + "<span>预览内容（点击展开）</span></summary>" +
        '<pre class="op-preview-body">' + esc(req.preview) + "</pre></details>";
    }
    if (!isChoice && typeof req.detail === "string" && req.detail !== "") {
      html += '<div class="op-detail">' + esc(req.detail) + "</div>";
    }
    if (isChoice) {
      var opts = Array.isArray(req.options) ? req.options : [];
      html +=
        '<div class="op-options">' +
        opts
          .map(function (o) {
            return (
              '<label class="op-option">' +
              '<input type="' + (multiple ? "checkbox" : "radio") + '" name="op-' + esc(requestId) + '" value="' + esc(o.id) + '">' +
              "<span>" + esc(o.label || o.id) +
              (o.description ? '<span class="op-desc">' + esc(o.description) + "</span>" : "") +
              "</span></label>"
            );
          })
          .join("") +
        "</div>";
    }
    html += '<div class="op-actions">';
    if (isChoice) {
      // 选择卡：提交前须至少选一项（界面先挡一层；通道层对空选择同样不受理——双重保险）。
      html += '<button class="btn btn-primary op-submit" type="button" disabled>提交</button>';
      html += '<button class="btn btn-ghost op-cancel" type="button">取消</button>';
    } else {
      html += '<button class="btn btn-primary op-confirm" type="button">确认</button>';
      html += '<button class="btn btn-ghost op-deny" type="button">不同意</button>';
    }
    html += '<span class="op-note" hidden></span></div>';
    card.innerHTML = html;
    // P-1（2026-10-12 真机：卡被后续 288 行活动推走；e2e 又暴露一处时序 bug）：**先量后挂**——
    // 判据是「**到达前**用户是否在底部附近」；卡本体上百 px 会立刻把距离推过阈值，不能拿加卡后的距离当判据。
    var nearBottomAtArrival = arrivalShouldScrollToCard(entry.roleId);
    // ② 按锚点落位（走不到 ① 的防线——见函数头注）；③ 找不到锚点 ⇒ atIndex=null ⇒ 追加行表尾（兜底不丢卡）。
    //    **首次到达不加锚**：卡就是当下最新的事件，行表尾＝它发生的位置（此后新行只在其后追加，位置关系
    //    不再变）——回放锚点表只服务于「位置丢失后的重物化」（防同题新请求被插进历史）。
    var rl = rowListFor(pane);
    var first = entry.anchorIndex === undefined;
    var atIndex = first ? null : operatorAnchorIndex(rl, entry);
    // Q-2：待确认卡入行表（**keepEl**——离窗只脱挂、实例与监听器保留；`requestId` 供 P-1 定位按行找）。
    var rec = adoptOperatorLifecycle(pane, entry, card) || registerRow(pane, function () { return card; }, 220, { keepEl: true, kind: "operator", requestId: requestId, atIndex: atIndex });
    if (first) {
      entry.anchorIndex = rec.index; // 首次物化的时序位置（其后新行只追加/重编号，此位恒指「它发生时的地方」）
      entry.anchorListSeq = rl.seq;
    }
    if (nearBottomAtArrival) scrollBottomForced(pane); // 到达即达（在往上翻 ⇒ 不打断——chip 持久指示）
    updateOpChip(entry.roleId);

    // —— 作答流程（**登记表驱动**）：提交期间禁用按钮；成功/失效 → **终态定格**（登记 finalNote，
    //    重物化时同款输出）；可重试失败（校验驳回等）→ 解冻重试——如实，不假装成功。 ——
    entry.card = card;
    fillOperatorLifecycle(entry);
    if (entry.state !== "open") {
      freezeOperatorCard(card, entry.finalNote.text, entry.finalNote.cls); // 补挂的终态卡：定格呈现
      return;
    }
    function setNote(text, cls) {
      var noteEl = card.querySelector(".op-note");
      if (!noteEl) return;
      noteEl.hidden = false;
      noteEl.className = "op-note" + (cls ? " " + cls : "");
      noteEl.textContent = text;
    }
    function setButtonsDisabled(disabled) {
      var bs = card.querySelectorAll(".op-actions button");
      for (var i = 0; i < bs.length; i += 1) bs[i].disabled = disabled;
    }
    /** 回传决定：先乐观熄灯（B-3 按**全部 open 请求**重算）；成功/失效定格；可重试则解冻。 */
    function submit(decision, pendingText, okText) {
      if (entry.state !== "open" || entry.runtime !== state.runtime || entry.projectRoot !== state.projectRoot) return;
      setButtonsDisabled(true);
      setNote(pendingText, "");
      refreshEntryAwaiting(entry);
      Promise.resolve(d.operatorRespond({ id: requestId, decision: decision }))
        .then(function (r) {
          if (entry.state !== "open") return;
          if (r && r.ok === true) {
            entry.state = "decided";
            entry.finalNote = { text: okText, cls: "op-note-ok" };
            freezeOperatorCard(card, entry.finalNote.text, entry.finalNote.cls);
            refreshEntryAwaiting(entry);
            return;
          }
          if (r && r.expired === true) {
            // **失效终态**（G-1：卡片**不按时间过期**）：此分支只剩一种真实失效——应用关闭/重启后，
            // 未决请求随窗口一起消失；旧卡作答时如实告知（含出路），定格、不再解冻重试。
            entry.state = "expired";
            entry.finalNote = { text: "请求已失效（轮次停止、会话重建或应用关闭），未获同意——请让角色重新发起。", cls: "op-note-err" };
            freezeOperatorCard(card, entry.finalNote.text, entry.finalNote.cls);
            refreshEntryAwaiting(entry);
            return;
          }
          throw new Error((r && r.error) || "通道未受理");
        })
        .catch(function (err) {
          if (entry.state !== "open") return;
          // 可重试（校验驳回/通道瞬时失败等）：请求仍 open——解冻供修正重试，如实示原因。
          setButtonsDisabled(false);
          refreshEntryAwaiting(entry);
          setNote("回传失败：" + String(err && err.message ? err.message : err) + "——请重试。", "op-note-err");
        });
    }

    var btnConfirm = card.querySelector(".op-confirm");
    var btnDeny = card.querySelector(".op-deny");
    var btnSubmit = card.querySelector(".op-submit");
    var btnCancel = card.querySelector(".op-cancel");
    if (btnConfirm) {
      btnConfirm.addEventListener("click", function () {
        submit({ kind: "confirm", confirmed: true }, "已提交，等待主进程受理…", "已确认。");
      });
    }
    if (btnDeny) {
      btnDeny.addEventListener("click", function () {
        submit({ kind: "confirm", confirmed: false }, "已提交，等待主进程受理…", "已回「不同意」（未获同意）。");
      });
    }
    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        submit({ kind: "choice", cancelled: true }, "已提交，等待主进程受理…", "已取消（未获同意）。");
      });
    }
    if (btnSubmit) {
      var inputs = card.querySelectorAll(".op-options input");
      function refreshSubmit() {
        var any = false;
        for (var i = 0; i < inputs.length; i += 1) {
          if (inputs[i].checked) { any = true; break; }
        }
        btnSubmit.disabled = !any;
      }
      for (var i = 0; i < inputs.length; i += 1) inputs[i].addEventListener("change", refreshSubmit);
      btnSubmit.addEventListener("click", function () {
        var selected = [];
        for (var j = 0; j < inputs.length; j += 1) {
          if (inputs[j].checked) selected.push(inputs[j].value);
        }
        if (selected.length === 0) return; // 防御：按钮禁用态已挡
        submit({ kind: "choice", selected: selected }, "已提交，等待主进程受理…", "已提交选择。");
      });
    }
  }

  // 本端**手动发送**的最近一条（H-1 附录：投递回显归类时的**防误伤**判据——手输内容即便字面以投递前缀
  // 开头，其回显也不得被当成"系统投递"，一律走普通气泡路径）。
  var lastManualSend = { roleId: null, text: "", at: 0 };

  /** 系统投递输入（E-1 回交 / H-1 派发）的**单独样式**元素：图标 + 来源标签 + 正文（Markdown/esc 单一来源）。 */
  function buildInjectedElement(inj, isReplay) {
    var el = document.createElement("div");
    el.className = "msg msg-injected is-" + inj.kind + (isReplay ? " is-replay" : "");
    var label = inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "");
    var body = '<div class="mi-body">' + Md.renderMarkdown(inj.body) + "</div>";
    if (inj.kind === "handback") body = '<details class="mi-report-detail"><summary>查看已投递的报告详情</summary>' + body + "</details>";
    el.innerHTML =
      '<div class="mi-head">' +
      '<span class="mi-ico">' + (inj.kind === "handback" ? ICONS.handback : ICONS.send) + "</span>" +
      '<span class="mi-chip">' + esc(label) + "</span>" +
      "</div>" +
      body;
    return el;
  }

  /** 实时路径：把系统投递输入追加进 pane（**绝不**与客户手输气泡同款——客户观察修订）。 */
  function appendInjectedMessage(pane, inj) {
    // Q-2：注入行入行表（keepEl——离窗保留实例；该类行带展示状态，重建成本不值当）。
    var pin = streamShouldPin(pane); // S-1：先量后挂
    registerRow(pane, function () { return buildInjectedElement(inj, false); }, 120, { keepEl: true, kind: "injected" });
    scrollBottom(pane, pin);
  }

  // —————— 会话事件入口 ——————

  /**
   * 会话事件入口（B-2：**带 `roleId` 信封**的 `{roleId, event}`）——按角色分发到**它所属**的 pane
   * （多会话并存不串消息；后台会话的事件落进游离 pane，切回即见）。界面**不作判定**：事件内容由
   * 主进程/编排产出，本层只呈现。
   */
  /** Q-1/Q-2：事件入口——接受**单个信封**（`session:event`/探针直发）或**信封数组**（`session:events` 合帧批）。
   *  批量期：抑制滚动/窗口更新（见 `batchDepth`），收尾统一做一次——**绝不在每事件里做布局/重排/重渲染**。 */
  function appendEvent(envOrBatch) {
    if (Array.isArray(envOrBatch)) {
      batchDepth += 1;
      try {
        for (var i = 0; i < envOrBatch.length; i += 1) appendEventSafely(envOrBatch[i]);
      } finally {
        batchDepth -= 1;
        flushBatchSideEffects();
      }
      return;
    }
    appendEventSafely(envOrBatch);
    flushBatchSideEffects();
  }

  function appendEventSafely(envelope) {
    try {
      deliverRuntimePayload(envelope, appendOneEvent);
    } catch (error) {
      diagnose("renderer.event-error", { errorMessage: String(error && error.message || "事件显示失败"), errorType: String(error && error.name || "Error") });
      setHint("一条事件无法显示，其余消息继续接收。");
    }
  }

  /** 一轮结束（settled）时的**流式 Markdown 一次性升级**（Q-1/Q-2）：
   *  把该角色仍为纯文本的助手行统一升级——**已挂载**元素就地转 Markdown；**未挂载**行只改状态标志，
   *  待其挂载时由 `build` 直接出 Markdown（**离屏不跑解析器**）。高度变化一次性重测（写读分离）。 */
  function upgradeStreamingMarkdown(roleId) {
    var rl = paneRowLists[roleId];
    if (!rl || rl.pane !== paneFor(roleId)) return;
    var touched = [];
    for (var i = 0; i < rl.rows.length; i += 1) {
      var rec = rl.rows[i];
      if (rec.kind !== "assistant" || rec.mdReady) continue;
      rec.mdReady = true;
      if (rec.el !== null && rec.el.parentNode === rl.pane) {
        rec.el.innerHTML = Md.renderMarkdown(rec.data);
        rec.el.classList.remove("is-streaming");
        touched.push(rec);
      }
    }
    var dirty = false;
    for (var j = 0; j < touched.length; j += 1) {
      var m = rowFootprint(rl, touched[j].el);
      if (m > 0 && m !== touched[j].h) {
        touched[j].h = m;
        dirty = true;
      }
    }
    if (dirty) {
      rl.prefix = null;
      markDirtyPane(rl.pane);
    }
  }

  function appendOneEvent(env) {
    if (!env || !env.event || typeof env.roleId !== "string") return;
    var ev = env.event;
    if (ev.runtime != null && ev.runtime !== state.runtime || ev.roleId != null && ev.roleId !== env.roleId) return;
    bindManualTurn(env);
    var key = Rt.replayKey({ turnId: ev.turnId, kind: ev.kind, eventKind: ev.kind, text: ev.summary, detail: ev.detail });
    var counts = liveReplayCounts[env.roleId] || (liveReplayCounts[env.roleId] = Object.create(null));
    var canonical = Rt.canonicalKey({ turnId: ev.turnId, kind: ev.kind, eventKind: ev.kind, detail: ev.detail });
    var alreadyLive = key && counts[key];
    var token = key ? { key: key, occurrence: (counts[key] = canonical ? 1 : (counts[key] || 0) + 1) } : null;
    var historyCounts = replayState[env.roleId] && replayState[env.roleId].counts || {};
    var toolIdentity = canonical && JSON.parse(canonical)[0] === "tool";
    if (!toolIdentity && token && ((historyCounts[key] || 0) >= token.occurrence || canonical && alreadyLive)) return;
    var priorOrigin = rowOrigin, priorToken = rowReplayToken;
    rowOrigin = "live"; rowReplayToken = token;
    try { renderOneEvent(env); }
    finally { rowOrigin = priorOrigin; rowReplayToken = priorToken; }
  }

  function bindManualTurn(env) {
    var ev = env.event, message = manualMessages[env.clientMessageId];
    if (!message || message.roleId !== env.roleId || typeof ev.turnId !== "string" || ev.turnId === "") return;
    if (message.turnId) return; // 原投递只能绑定一次，不接受迟到事件改绑。
    message.turnId = ev.turnId;
    var key = Rt.replayKey({ kind: "user", turnId: ev.turnId, text: message.text });
    var counts = liveReplayCounts[env.roleId] || (liveReplayCounts[env.roleId] = Object.create(null));
    message.rec.replayToken = { key: key, occurrence: (counts[key] = 1) };
    var rl = paneRowLists[env.roleId];
    if (rl) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(message.rec.replayToken)] = message.rec;
    var history = replayState[env.roleId];
    if (history && (history.counts[key] || 0) >= message.rec.replayToken.occurrence) {
      replayHistory({ projectRoot: state.projectRoot, roleId: env.roleId, runtime: state.runtime, rows: history.rows, error: history.error }, true);
    }
  }

  function renderOneEvent(env) {
    if (!env || typeof env !== "object" || typeof env.roleId !== "string" || !env.event) return;
    var roleId = env.roleId;
    var ev = env.event;
    if (ev.runtime != null && ev.runtime !== state.runtime) return;
    var pane = paneFor(roleId);
    var kind = ev.kind || "message";
    // B-3：每条事件都记「最近一条事件摘要 + 时间」（悬停用；复用事件流，不新增数据源）。
    metaFor(roleId).hadSession = true;
    stampLastEvent(roleId, ev.summary);
    if (kind === "handback") {
      var hb = ev.handback;
      if (!hb) return;
      // 产出角色自己的聊天 → 「回交 su」卡；主入口角色 su 的聊天 → 镜像「来自 <role> 的报告」。
      appendHandback(pane, hb);
      // 主入口只显示真正投递的输入详情与助手汇总；不提前镜像尚在队列中的报告。
      return; // 左树重渲染由批量收尾统一做（flushBatchSideEffects）
    }
    if (kind === "message") {
      // 事件流异常经外推层以 message 形式送来（session.ts consume 的 catch）——如实归为「错误」态。
      if (typeof ev.summary === "string" && ev.summary.indexOf("会话事件流异常") === 0) {
        metaFor(roleId).error = true;
      }
      // 系统投递输入（E-1 回交 / H-1 派发）**单独样式**：判据＝编排两名渲染函数的定格前缀
      // （`tool-rows.js::INJECT_PREFIXES`；**非启发式**——格式若变只改那张表）＋剥离 `用户指令：` 回显前缀。
      // **手输防误伤**：若该回显正是本端刚手发送的文本（同角色、15s 内），一律不当投递——普通气泡路径。
      var input = ev.detail && ev.detail.source === "prompt-input" && typeof ev.detail.text === "string" ? ev.detail : null;
      if (input) {
        var injected = Tr.classifyInjectedMessage ? Tr.classifyInjectedMessage(input.text) : null;
        if (injected) appendInjectedMessage(pane, injected);
        else appendUser(pane, input.text, false);
      } else appendAssistant(pane, ev.summary);
    }
    else if (kind === "tool_call" || kind === "accepted") appendActivity(pane, Tr.activityOf(ev));
    else if (kind === "denied") {
      var failure = Tr.activityOf(ev);
      appendActivity(pane, failure);
    } // 治理信号（拒绝原因 + 允许路径）：全量，不瘦身
    else if (kind === "settled") {
      // 一轮结束：**忙态由主进程快照转述**（session:role-state 的 busy=false——见 onRoleState），
      // 此处只清「上一次的错误态」（本轮正常收口）并记行；**不再**由事件流自设忙闲（准确性裁定）。
      var outcome = ev.detail && ev.detail.outcome;
      metaFor(roleId).error = outcome === "failed" || outcome === "timed_out";
      // Q-1/Q-2：流式段的**一次性 Markdown 化**（本轮期间到达的助手消息先是纯文本——见 appendAssistant）。
      upgradeStreamingMarkdown(roleId);
      sysRow(pane, "sys-settled", ICONS.call, ev.summary);
    }
    else sysRow(pane, "sys-settled", ICONS.call, ev.summary);
    // 状态徽标随事件变化（工作中↔空闲/错误等）——左树重渲染改在**批量收尾**统一做（每批至多一次）。
  }

  /**
   * 生效配置来源说明（T13）：**如实**呈现项目 `.ans/project.json` 的加载结果，
   * 绝不让用户把「未接受」误当成「已授权」。
   *
   * 只在**未授权**时出现（`kind==="ans-invalid"` 或 `accepted===false`）：
   *  - `.ans` 存在但不可用 → 载入器 fail-closed 未接受、**不回退**运行期同意；
   *  - `.ans` 声明已接受但缺 pin → 终态规则置为未接受。
   * 两种情况门禁引擎都会拒绝该角色的一切写入——这是**门禁引擎**的职责，不是本会话/界面的限制。
   * 文案只述**载入结果**（界面层不作判定），是否开启仍由主进程/门禁决定。
   */
  function appendConfigNote(pane, cfg) {
    var text;
    if (cfg.kind === "ans-invalid") {
      text =
        "该项目带 .ans/project.json 但不可用（fail-closed）：门禁引擎会拒绝该角色的一切写入——" +
        "这不是已授权状态（不会回退到「导入即授权」）。" +
        (cfg.reason ? "原因：" + cfg.reason : "");
    } else {
      text =
        "该项目 .ans/project.json 声明已接受但缺少 pin（fail-closed）：门禁引擎会拒绝该角色的一切写入——" +
        "这不是已授权状态。";
    }
    sysRow(pane, "sys-config", ICONS.readonly, text);
  }

  /**
   * 写入语义（V2r1：Pi/Codex/Claude 共用同一治理语义）。
   *
   * 所选真实引擎经窗口层与编排建立会话（写入目标为导入项目）：
   * **写入会真正落到导入的项目**，但仍受门禁约束（角色边界 Section 1 + acceptance，与 CLI 同一套
   * `resolveWrite`），**越界写在写之前被拒**。文案只述运行时语义（界面层**不作判定**），判定仍唯一来自门禁引擎。
   *
   * 位置（客户 2026-10-11 裁定）：原来在底部输入区的常驻说明**上移到中栏横栏**（与状态提示同一行），只留一句。
   */
  var WRITE_NOTE = "实际写入导入项目，角色边界外的写入会被拒绝。";

  /** 横栏常驻写入语义（单一来源；三种真实引擎共用）。
   *  v2 对齐（2026-10-13）：纯文字、无图标（「异常依文字而非堆图标」；说明在标题下方左对齐）。 */
  function renderWriteNote() {
    var el = $("runtime-note");
    if (!el) return;
    el.className = "runtime-note";
    el.innerHTML = '<span class="rt-text">' + esc(WRITE_NOTE) + "</span>";
  }

  // —————— Pi 配置面板（设计 §11/T28）：设置 pi 运行时配置 → 保存到仓库根 .env ——————
  // 与主进程 pi-config.ts 的 PI_PANEL_KEYS 一致：**3 项必填**（端点 / 模型 / token）+ **1 项可选**（上下文窗口，
  // 收进「高级」、可留空）。token 为机密：**值永不回显**（主进程只给 isSet 布尔、恒返回空 value），此处字段
  // 恒为 password 型、只示「已设置/未设置」。界面**不作任何判定**（掩码/读写全在主进程侧经共享 env-file 模块，
  // 单一来源）。**`ANS_PI_PROVIDER` 不在面板里**（代码里有默认值 ans-gateway、是内部标签，客户 2026-10-11 裁定移除）。
  var PI_KEYS = [
    "ANTHROPIC_AUTH_TOKEN",
    "ANS_PI_BASE_URL",
    "ANS_PI_MODEL",
    "ANS_PI_CONTEXT_WINDOW",
  ];
  // 必填键（3 项）——缺任一才「配置不全、会被拒」；`ANS_PI_CONTEXT_WINDOW` 可选，缺失不算缺（留空 = 保守默认）。
  var PI_REQUIRED_KEYS = [
    "ANTHROPIC_AUTH_TOKEN",
    "ANS_PI_BASE_URL",
    "ANS_PI_MODEL",
  ];
  var piView = null; // 最近一次 getPiConfig 结果（供「已设置/未设置」与缺项告警）

  function piInput(key) { return $("pi-inp-" + key); }

  function setPiStatus(text, kind) {
    var el = $("pi-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "pi-status" + (kind ? " is-" + kind : "");
  }

  function piFieldByKey(key) {
    if (!piView || !piView.fields) return null;
    return piView.fields.filter(function (f) { return f.key === key; })[0] || null;
  }

  /**
   * 把一次 getPiConfig 结果落到面板：
   *  - 非机密键：预填当前值；
   *  - 机密键（token）：**绝不预填**——value 恒清空、type=password，只据 `isSet` 设 placeholder
   *    「已设置，留空则不修改」/「未设置」（值不在渲染进程出现，单一来源是主进程掩码）。
   */
  function applyPiView(view) {
    piView = view || { path: "", fields: [] };
    var p = $("pi-panel-path");
    if (p) p.textContent = piView.path || "";
    var fields = piView.fields || [];
    var label = piView.label || Rt.runtimeLabel(state.runtime);
    var hint = $("pi-panel").querySelector(".pi-panel-hint");
    hint.textContent = "保存到仓库根 .env，只修改本引擎字段。" + Rt.applicationLabel(piView.application || "next-session");
    function fieldHtml(f) {
      var required = f.required === true || (state.runtime === "pi" && PI_REQUIRED_KEYS.indexOf(f.key) >= 0);
      return '<label class="pi-field" for="pi-inp-' + esc(f.key) + '"><span class="pi-field-label">' +
        esc(f.label || f.key) + ' · ' + (required ? "必填" : "可选") + (f.secret ? ' <span class="pi-secret-tag">机密</span>' : "") +
        '</span><span class="pi-input-wrap"><input id="pi-inp-' + esc(f.key) + '" class="pi-input" type="' + (f.secret ? "password" : "text") +
        '" autocomplete="off" spellcheck="false" />' + (f.secret ? '<button id="pi-toggle-secret" class="btn btn-ghost btn-mini" type="button">显示</button>' : "") +
        '</span><span class="runtime-field-help">' + esc(f.key + " · " + Rt.sourceLabel(f) + (f.help ? "。" + f.help : "")) + '</span></label>';
    }
    var mainFields = fields.filter(function (f) { return f.key !== "ANS_PI_CONTEXT_WINDOW"; });
    $("pi-panel").querySelector(".pi-fields").innerHTML = mainFields.map(fieldHtml).join("");
    var advanced = $("pi-panel").querySelector(".pi-advanced");
    var advancedField = fields.find(function (f) { return f.key === "ANS_PI_CONTEXT_WINDOW"; });
    advanced.hidden = !advancedField;
    advanced.querySelector(".pi-advanced-body").innerHTML = advancedField ? fieldHtml(advancedField) : "";
    fields.forEach(function (f) {
      var inp = piInput(f.key);
      if (!inp) return;
      if (f.secret === true) {
        inp.value = ""; // 绝不回显值
        inp.placeholder = f.isSet ? "已设置，留空则不修改" : "未设置";
        inp.type = "password";
      } else inp.value = typeof f.value === "string" ? f.value : "";
    });
    var tg = $("pi-toggle-secret");
    if (tg) tg.addEventListener("click", toggleSecretVisibility);
    $("drawer-title").textContent = label + " 配置";
  }

  function renderPiConfigWarning() {
    if (!piView || !piView.fields) { setPiStatus("", ""); return; }
    var missing = Array.isArray(piView.missingKeys) ? piView.missingKeys : piView.fields
      .filter(function (f) { return (f.required === true || state.runtime === "pi" && PI_REQUIRED_KEYS.indexOf(f.key) >= 0) && !f.isSet; })
      .map(function (f) { return f.key; });
    var label = piView.label || Rt.runtimeLabel(state.runtime);
    setPiStatus(missing.length ? label + " 配置不完整，缺：" + missing.join("、") + "。请补齐后保存。" : label + " 必填配置已齐备。" + Rt.applicationLabel(piView.application || "next-session"), missing.length ? "warn" : "ok");
    return missing;
  }

  function renderRuntimeConfigNotice(text, kind, actionable) {
    var bar = $("runtime-config-notice");
    bar.hidden = !state.projectRoot || !text;
    bar.className = "runtime-config-notice" + (kind ? " is-" + kind : "");
    $("runtime-config-message").textContent = text || "";
    var button = $("runtime-config-settings");
    button.hidden = !actionable;
    button.textContent = "打开 " + Rt.runtimeLabel(state.runtime) + " 设置";
  }

  var configLoadVersion = 0;
  var configSaveVersion = 0;
  async function loadPiConfig() {
    var runtime = state.runtime, projectRoot = state.projectRoot, version = ++configLoadVersion;
    renderRuntimeConfigNotice("正在检查 " + Rt.runtimeLabel(runtime) + " 配置…", "", false);
    try {
      var view = d.getRuntimeConfig ? await d.getRuntimeConfig(runtime) : runtime === "pi" ? await d.getPiConfig() : null;
      if (runtime !== state.runtime || projectRoot !== state.projectRoot || version !== configLoadVersion) return;
      if (!view || !Array.isArray(view.fields) || (d.getRuntimeConfig && (view.runtime !== runtime || !Array.isArray(view.missingKeys) || !view.missingKeys.every(function (key) { return typeof key === "string"; })))) throw new Error("配置摘要未就绪");
      applyPiView(view);
      var missing = renderPiConfigWarning();
      renderRuntimeConfigNotice(missing.length ? Rt.runtimeLabel(runtime) + " 配置不完整，缺：" + missing.join("、") + "。" : "", "warn", missing.length > 0);
      return { view: view, missing: missing };
    } catch (err) {
      if (runtime !== state.runtime || projectRoot !== state.projectRoot || version !== configLoadVersion) return;
      piView = null;
      setPiStatus("读取配置失败：" + (err && err.message ? err.message : err), "err");
      renderRuntimeConfigNotice("读取 " + Rt.runtimeLabel(runtime) + " 配置失败，请打开设置检查或重试。", "err", true);
    }
  }

  function openPiPanel() {
    if (state.rightTab !== "pi") {
      state.rightTab = "pi";
      renderRight(); renderTabs();
    }
    void loadPiConfig();
    $("drawer-close").focus();
  }

  function toggleSecretVisibility() {
    var f = piView && piView.fields.find(function (field) { return field.secret === true; });
    var inp = piInput(f ? f.key : "ANTHROPIC_AUTH_TOKEN"), tg = $("pi-toggle-secret");
    if (!inp) return;
    var showing = inp.type === "text";
    inp.type = showing ? "password" : "text";
    if (tg) tg.textContent = showing ? "显示" : "隐藏";
  }

  async function savePiConfigFromForm() {
    if (!piView || piView.runtime && piView.runtime !== state.runtime) return;
    var runtime = state.runtime, projectRoot = state.projectRoot, saveVersion = ++configSaveVersion;
    ++configLoadVersion;
    var updates = {};
    (piView.fields || []).forEach(function (f) {
      var inp = piInput(f.key);
      if (!inp) return;
      var v = inp.value;
      if (f.secret) { if (v !== "") updates[f.key] = v; return; }
      if (v !== "" || f.isSet) updates[f.key] = v;
    });
    setPiStatus("正在保存…", "");
    $("pi-save").disabled = true;
    try {
      var res = d.saveRuntimeConfig ? await d.saveRuntimeConfig({ runtime: runtime, updates: updates }) : await d.savePiConfig(updates);
      if (runtime !== state.runtime || projectRoot !== state.projectRoot || saveVersion !== configSaveVersion) return;
      if (!res || !res.ok) { setPiStatus("保存失败：" + ((res && res.error) || "未知错误"), "err"); return; }
      var refreshed = await loadPiConfig();
      if (runtime !== state.runtime || projectRoot !== state.projectRoot || saveVersion !== configSaveVersion) return;
      if (refreshed) setPiStatus("已保存到 .env（改动键：" + ((res.appliedKeys && res.appliedKeys.join("、")) || "无") + "）。" + (refreshed.missing.length ? "必填配置仍缺：" + refreshed.missing.join("、") + "。" : "必填配置已齐备。") + Rt.applicationLabel(res.application || "next-session"), refreshed.missing.length ? "warn" : "ok");
      if (state.selectedRoleId && state.roleBusy[state.selectedRoleId] !== true && res.application !== "after-active-turn") await selectRole(state.selectedRoleId);
    } catch (err) {
      if (runtime === state.runtime && projectRoot === state.projectRoot && saveVersion === configSaveVersion) setPiStatus("保存异常：" + (err && err.message ? err.message : err), "err");
    } finally { $("pi-save").disabled = false; }
  }

  // —————— 左栏：导入项目 + 角色树 ——————
  /** N-1（2026-10-12 客户裁定）：导入项目按钮文案——**已有项目 ⇒ 「切换项目」**；未导入/清空 ⇒ 「导入项目」。
   *  判据只取**已有状态** `state.projectRoot`（不靠界面猜测）；文案映射在纯函数 `ui-labels.js`（可独立断言）。 */
  function updatePickButton() {
    var hasProject = typeof state.projectRoot === "string" && state.projectRoot !== "";
    $("btn-import").textContent = UiLabels.pickProjectLabel(hasProject);
  }
  // —————— P1-3（2026-10-13 客户裁定）：「切换项目」的一次性防呆 ——————
  // 触发条件 = **确有后台工作**（role-state 真实快照 `state.roleBusy`，不用界面侧推测）；无 busy ⇒ 行为**逐字不变**。
  // 确认条是**动作防呆、不是会话内容**：放在 #chat 之外（不进行表/不回放/切项目即随重置消失）。
  function busyRoleIds() {
    var ids = [], seen = Object.create(null);
    for (var k in state.roleBusy) {
      if (state.roleBusy[k] === true) { ids.push(k); seen[k] = true; }
    }
    Object.keys(runtimeViews).forEach(function (key) {
      if (key === Rt.viewKey(state.projectRoot, state.runtime)) return;
      var busy = runtimeViews[key].roleBusy || {};
      Object.keys(busy).forEach(function (id) { if (busy[id] === true && !seen[id]) { ids.push(id); seen[id] = true; } });
    });
    return ids;
  }

  /** 显示/刷新确认条（n=0 时收起——比如等待期间轮次自己结束了，防呆就不再有意义）。 */
  function showSwitchConfirm() {
    var bar = $("switch-confirm");
    if (!bar) return;
    var ids = busyRoleIds();
    if (ids.length === 0) {
      bar.hidden = true;
      return;
    }
    $("switch-confirm-text").textContent = "有 " + ids.length + " 个角色正在工作，切换项目会停止它们——";
    bar.hidden = false;
  }

  function hideSwitchConfirm() {
    var bar = $("switch-confirm");
    if (bar) bar.hidden = true;
  }

  async function importProject() {
    // P1-3：破坏性动作防呆——有 busy 会话先出内联确认条（取消=什么都不发生）；无 busy 走原路径（零提示）。
    if (busyRoleIds().length > 0) {
      showSwitchConfirm();
      return;
    }
    await doImportProject();
  }

  /** 真正的导入/切换流程（确认后与原路径共用；loadProject 首步 `d.stopSession(null)`「关闭全部」即确认语义）。 */
  async function doImportProject() {
    try {
      var p = await d.pickProject();
      if (!p) { setHint("已取消导入。"); return; }
      await loadProject(p);
    } catch (err) {
      setHint("导入失败：" + (err && err.message ? err.message : err));
    }
  }

  async function loadProject(projectRoot) {
    ++roleSelectionVersion; // 换项目使旧的角色开启结果失效。
    // 换项目（fresh）：先关掉**全部**保活会话（老项目的历史**不跨项目保留**——applyListing 里重置各 pane）。
    try { await d.stopSession(null); } catch (err) { /* 关不掉不阻断导入；后续 open 会如实报错 */ }
    state.liveRoles = [];
    var res = await d.listProject(projectRoot);
    applyListing(res, true);
    var n = state.roles.length;
    // 未-bootstrap 那件事**只在中栏正中的空状态说一次**（`emptyStateHtml` 的标题 + 说明 + 按钮）；
    // 横栏第二行不再重复它（客户：同一件事说过三遍），横栏只留写入语义（`#runtime-note`）。
    setHint(state.hasRoles === false ? "" : "已导入项目，共 " + n + " 个角色。点击角色即可开始聊天。");
  }

  /**
   * 把一次 listProject 结果落到界面。
   *  - `fresh=true`（导入）：重置选择并**默认选中主入口角色**（§10.7）——但**不自动开会话**；
   *  - `fresh=false`（刷新，su 一轮结束后）：保留当前选择/会话，仅当所选角色已不存在时回退到主入口。
   * 主入口 id 一律取门禁引擎给的 `primaryRoleId`，**不硬编码 "su"**。
   */
  function applyListing(res, fresh) {
    var projectChanged = state.projectRoot !== res.projectRoot;
    engineSelector.close(false);
    state.projectRoot = res.projectRoot;
    updatePickButton(); // N-1：已有项目 ⇒ 按钮文案「切换项目」（纯映射见 ui-labels.js）
    if (projectChanged || fresh) { ++configSaveVersion; void loadPiConfig(); }
    state.roles = res.roles || [];
    state.primaryRoleId = res.primaryRoleId || null;
    state.hasRoles = res.hasRoles !== false;
    var pp = $("project-path");
    pp.textContent = res.projectRoot;
    pp.classList.remove("is-empty");
    // v2 对齐：项目名 = 路径末段（纯展示派生，无新数据源）；无项目时回落隐藏。
    var pn = $("project-name");
    if (pn) {
      var seg = String(res.projectRoot == null ? "" : res.projectRoot).replace(/[\\/]+$/, "").split(/[\\/]/);
      var base = seg.length ? seg[seg.length - 1] : "";
      pn.textContent = base;
      pn.hidden = base === "";
    }
    renderWarnings(res.warnings || []);

    var has = function (id) { return !!id && state.roles.some(function (r) { return r.roleId === id; }); };
    if (fresh) {
      state.selectedRoleId = state.primaryRoleId;
      state.sessionOpenRoleId = null;
    } else {
      if (!has(state.selectedRoleId)) state.selectedRoleId = state.primaryRoleId;
      if (!has(state.sessionOpenRoleId)) state.sessionOpenRoleId = null;
    }

    if (fresh) {
      setState("idle", "未连接");
      state.roleMeta = {}; // B-3：换项目后状态从零开始（老项目的状态不跨项目保留）
      state.roleBusy = {}; // 真实快照同样从零开始（老项目的忙态/队列不跨项目）
      state.queueByRole = {};
      state.queueItemsByRole = {};
      state.runningByRole = {};
      updateHaltButton(); // 停止按钮随快照清零隐藏（P0-2 UI）
      resetPanes();
      flushPendingHistories(); // D-1：本项目的恢复数据（可能先于 pane 就绪推达）在此回放
    }
    renderRoleTree();
    renderRight();
    renderTabs();
    setChatHeader(selectedRole());
    updateControls();
  }

  /** 取主进程的保活会话列表（B-2）→ 「有活动会话」与状态派生的数据源。失败如实清空（不假装有）。 */
  async function refreshLiveRoles() {
    try {
      var runtime = state.runtime, projectRoot = state.projectRoot;
      var ids = d.listLiveSessionViews ? await d.listLiveSessionViews() : await d.listLiveSessions();
      if (runtime !== state.runtime || projectRoot !== state.projectRoot) return;
      state.liveRoles = Array.isArray(ids) ? ids.filter(function (id) { return typeof id === "string" ? runtime === "pi" : Rt.matchesView(id, projectRoot, runtime); }).map(function (id) { return typeof id === "string" ? id : id.roleId; }) : [];
    } catch (err) {
      state.liveRoles = [];
    }
  }

  // —————— 角色状态（B-3，2026-10-12；状态准确性裁定同日）：per-role 事实 + 主进程真实快照 ——————
  // 派生与文案映射在 `role-status.js`（纯函数，可独立断言）；此处只喂事实、不写判断。
  // **忙/闲/队列绝不在此推算**——只取自 `onRoleState` 转述的主进程快照（roleBusy/queueByRole）。
  function metaFor(roleId) {
    var m = state.roleMeta[roleId];
    if (!m) {
      m = { hadSession: false, error: false, awaitingConfirm: false, restored: false, lastSummary: "", lastAt: "" };
      state.roleMeta[roleId] = m;
    }
    return m;
  }

  /** 记「最近一条事件」（B-3 悬停用）：摘要 + 时间——复用事件流，不新增数据源。 */
  function stampLastEvent(roleId, summary) {
    var m = metaFor(roleId);
    m.lastSummary = String(summary == null ? "" : summary);
    try {
      m.lastAt = new Date().toLocaleTimeString();
    } catch (err) {
      m.lastAt = "";
    }
  }

  /** 某角色当前状态 id（纯派生照 `role-status.js`；**忙/队列只用主进程真实快照**——不做界面侧推测）。 */
  function roleStatusOf(roleId) {
    var m = state.roleMeta[roleId] || {};
    return St.deriveRoleStatus({
      live: state.liveRoles.indexOf(roleId) >= 0,
      hadSession: m.hadSession === true,
      busy: state.roleBusy[roleId] === true, // 真实信号（主进程外推；后台轮次同样计入）
      queueDepth: (state.queueByRole[roleId] || []).length, // 真实信号（主进程外推）
      error: m.error === true,
      awaitingConfirm: m.awaitingConfirm === true,
      restored: m.restored === true, // D-1：有恢复出来的界面记录
    });
  }

  /** 状态徽标的渲染 HTML：**图标 + 短标签**（待办数 > 0 时带「 · N 待办」后缀）；悬停 = 完整描述 +
   *  最近事件（若有）。图标/文案/样式/描述均来自 `St.statusBadge` 的**唯一映射**。 */
  function statusBadgeHtml(roleId) {
    var pending = (state.queueByRole[roleId] || []).length;
    var badge = St.statusBadge(roleStatusOf(roleId), pending);
    var m = state.roleMeta[roleId] || {};
    var hover = badge.title + (m.lastSummary ? " ｜ 最近事件（" + m.lastAt + "）：" + m.lastSummary : "");
    return (
      '<span class="ti-status ' + badge.className + '" title="' + esc(hover) + '">' +
      '<span class="ts-ico" aria-hidden="true">' + esc(badge.icon) + "</span>" +
      esc(badge.label) +
      "</span>"
    );
  }

  // —————— 每角色真实状态快照（L-1 + 状态准确性，2026-10-12 客户裁定）——————
  // 主进程在**忙/闲切换**（开跑/一轮结束/开停会话）与**队列变化**（入队/出队）时推
  // `{roleId, busy, summaries}`——真实信号（会话 busy / 队列深度）。渲染侧只**如实转述**：
  // 左树徽标（「工作中 · N 待办」）与该角色的队列行都由它驱动；**不做任何界面侧推测**。
  function onRoleState(info) {
    if (!info || typeof info !== "object" || typeof info.roleId !== "string" || info.roleId === "") return;
    var roleId = info.roleId;
    state.roleBusy[roleId] = info.busy === true;
    if (typeof info.contextSource === "string") showSessionContext(roleId, info);
    state.queueByRole[roleId] = Array.isArray(info.summaries)
      ? info.summaries.map(function (s) { return String(s == null ? "" : s); })
      : [];
    // 右栏「待办 / 队列」：结构化条目 + 进行中的那条（形状防御式逐字段转写，不信任外部输入）。
    // P1-1：增 `id`（撤回定位键）与 `full`（全文，展开用）——同一快照通道，**不造第二套数据源**。
    var copyItem = function (it) {
      var o = it && typeof it === "object" ? it : {};
      return {
        kind: typeof o.kind === "string" ? o.kind : "",
        sourceRoleId: typeof o.sourceRoleId === "string" ? o.sourceRoleId : "",
        summary: typeof o.summary === "string" ? o.summary : "",
        at: typeof o.at === "string" ? o.at : "",
        id: typeof o.id === "string" ? o.id : "",
        full: typeof o.full === "string" ? o.full : "",
      };
    };
    state.queueItemsByRole[roleId] = Array.isArray(info.queue) ? info.queue.map(copyItem) : [];
    state.runningByRole[roleId] = info.running && typeof info.running === "object" ? copyItem(info.running) : null;
    renderQueueRow(roleId);
    renderCurrentWork(roleId);
    renderRoleTree();
    // 停止按钮（P0-2 UI）随**真实快照**显隐（忙碌=可见；空闲=隐藏——不做界面侧推测）。
    updateHaltButton();
    // data-state（程序化出口）同随真实快照：正看着该角色时 run/idle 实时校准（轮末回 idle 的路径）。
    if (state.selectedRoleId === roleId) syncChatState(roleId);
    // P1-3：切换项目确认条若正挂着——busy 数随之刷新；归零（轮次自己结束）就收起（防呆不再有意义）。
    var swcf = $("switch-confirm");
    if (!backgroundDelivery && swcf && !swcf.hidden) showSwitchConfirm();
    // 右栏：若正看着该角色 → 只更新「待办 / 队列」组（**定点更新**，不重排整个手风琴、不重置展开态）。
    if (state.selectedRoleId === roleId) updateRightQueue(roleId);
    // 图标簇角标随**真实快照**刷新（待办=视图行数 / 队列=排队条数——收起也不丢信息）。
    renderTabs();
  }

  /** 当前动作缺少可靠字段时仅转述真实busy；不拿已结束工具冒充当前动作。 */
  /** 被辅助抽屉覆盖的卡先经既有定位入口读全；inert不改变审批状态/按钮原disabled。 */
  function syncCoveredOperatorCards() {
    if (backgroundDelivery) return;
    var pane = $("chat").querySelector(".chat-pane");
    if (!pane) return;
    var drawer = $("right-drawer").getBoundingClientRect();
    pane.querySelectorAll(".op-request").forEach(function (card) {
      var rect = card.getBoundingClientRect();
      var covered = state.rightTab !== null && rect.right > drawer.left && rect.left < drawer.right && rect.bottom > drawer.top && rect.top < drawer.bottom;
      card.inert = covered;
      card.classList.toggle("is-obscured", covered);
    });
  }

  function renderCurrentWork(roleId) {
    var pane = paneFor(roleId);
    var el = pane.querySelector(".tool-current");
    var awaiting = openRequestIdsFor(roleId).length > 0;
    if (!awaiting && state.roleBusy[roleId] !== true) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.className = "tool-current"; }
    el.textContent = awaiting ? "等待你确认" : "正在工作";
    pane.appendChild(el);
  }

  /** 该角色聊天流里的**队列行**（一条，原位更新、始终排在流尾）：`【队列】N 条待办：<第 1 条摘要>…`；
   *  队列清空即移除。正文经 `textContent` 落入（无注入口，不碰 HTML）。 */
  function renderQueueRow(roleId) {
    var pane = paneFor(roleId);
    var q = state.queueByRole[roleId] || [];
    var el = pane.querySelector(".queue-row");
    if (q.length === 0) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      ensureContent(pane);
      el = document.createElement("div");
      el.className = "sys sys-queue queue-row";
      el.innerHTML = '<span class="sys-ico">' + ICONS.clock + '</span><span class="sys-text q-text"></span>';
    }
    var text =
      "【队列】" + q.length + " 条待办：" + q[0] +
      (q.length > 1 ? "（另有 " + (q.length - 1) + " 条）" : "") +
      "——等它完成当前任务后依次处理。";
    el.querySelector(".q-text").textContent = text;
    pane.appendChild(el); // 移到流尾（状态行始终停在最新处）
  }

  // —————— 会话记录恢复（D-1，2026-10-12）：主进程推来的规范化界面行 → 回放进该角色的 pane ——————
  // 渲染进程**不碰 Pi SDK/JSONL**（解析在主进程；本层只呈现）。回放行与实时行**视觉可区分**
  // （`.is-replay`）；助手文本同样走 `Md.renderMarkdown`（esc 单一来源）。
  // **回放去重（2026-10-13 真机「同一段消息渲染两遍」修复）**：su 一轮结束 → `project:changed` →
  // refreshProject → 主进程对每角色**重推**会话历史——旧实现对同一 pane 无守卫地整份再回放 ⇒ 转录重复。
  // 现在每角色记住上次回放状态：**同一份历史幂等（skip）**、盘上文件增长走**增量（append）**、
  // 其余（重写/截断/错误态变化）走**全量重建（full，绝不追加第二份）**——策略是纯函数 `UiLabels.replayPlan`。
  var pendingHistories = []; // 项目尚未就绪/正在切换时先寄存（applyListing(fresh) 重置 pane 后统一冲洗）
  var replayState = Object.create(null); // roleId → { rows, error, projectRoot }（随项目作废，见 resetPanes）

  /** 重建某角色的 pane（回放 **full** 路径专用——会话文件重写/截断时全量重放，绝不追加第二份）。
   *  行模型与回放锚点表随 pane 作废重建（锚点是行序位、只对旧行表有意义——旧 Map 一并删，防错位复用）；
   *  请求登记表（opRequests）**保留**：`materializePendingFor` 会按新行表重物化未作答的卡。 */
  function rebuildPane(roleId) {
    var key = String(roleId == null ? "" : roleId);
    var old = chatPanes[key];
    var wasActive = !!old && old.parentNode === $("chat");
    if (old) old.remove();
    delete chatPanes[key];
    delete paneRowLists[key];
    delete paneAnchors[key];
    var pane = paneFor(key); // 新建空 pane（含空状态；首行登记时 ensureContent 清掉）
    if (wasActive) {
      $("chat").innerHTML = "";
      $("chat").appendChild(pane);
    }
    return pane;
  }

  function onSessionHistory(payload) {
    if (!payload || typeof payload !== "object" || typeof payload.roleId !== "string") return;
    if (!state.projectRoot || (typeof payload.projectRoot === "string" && payload.projectRoot !== state.projectRoot)) {
      pendingHistories.push(payload); // 未就绪或属于别的项目：寄存，不串项目
      return;
    }
    replayHistory(payload);
  }

  /** 冲洗寄存的恢复数据（在 applyListing(fresh) 重置 pane 之后调用；旧项目的寄存直接丢弃）。 */
  function flushPendingHistories() {
    var pend = pendingHistories;
    pendingHistories = [];
    for (var i = 0; i < pend.length; i += 1) {
      if (!state.projectRoot || pend[i].projectRoot !== state.projectRoot) continue;
      deliverRuntimePayload(pend[i], replayHistory);
    }
  }

  function preserveUncoveredRows(rl, nextCounts) {
    var buckets = new Map(), manuals = Object.create(null), anchor = "";
    function covered(token) { return token && (nextCounts[token.key] || 0) >= token.occurrence; }
    function preserve(value) { if (!buckets.has(anchor)) buckets.set(anchor, []); buckets.get(anchor).push(value); }
    if (rl) rl.rows.forEach(function (rec) {
      if (rec.kind === "activities" || rec.kind === "tool-lifecycle") {
        var preservedActivities = rec.kind === "activities" ? rec.data.items : Object.keys(rec.activityStages).map(function (phase) { return rec.activityStages[phase]; });
        preservedActivities.forEach(function (activity) {
          if (covered(activity.replayToken)) anchor = Rt.tokenId(activity.replayToken);
          else if (activity.origin !== "history") preserve({ activity: activity });
        });
        return;
      }
      if (covered(rec.replayToken)) {
        anchor = Rt.tokenId(rec.replayToken);
        if (rec.manualClientId) manuals[anchor] = rec;
      } else if (rec.origin !== "history" && !(rec.kind === "system" && rec.data.cls === "sys-loading")) preserve({ record: rec });
    });
    return { buckets: buckets, manuals: manuals, gap: rl && rl.rowGap || 0 };
  }

  function appendPreservedRow(pane, old, gap, atIndex) {
    var savedEl = old.el;
    var rl = rowListFor(pane);
    if (typeof atIndex === "number" && atIndex < rl.rows.length) {
      var table = paneAnchors[pane.dataset.roleId];
      if (table) table.forEach(function (anchor) {
        if (anchor.requestIndex !== null && anchor.requestIndex >= atIndex) anchor.requestIndex += 1;
        if (anchor.conclusionIndex !== null && anchor.conclusionIndex >= atIndex) anchor.conclusionIndex += 1;
        if (anchor.rowsAtReplay > atIndex) anchor.rowsAtReplay += 1;
      });
      Object.keys(opRequests).forEach(function (id) {
        var entry = opRequests[id];
        if (entry.roleId === pane.dataset.roleId && entry.anchorListSeq === rl.seq && entry.anchorIndex >= atIndex) entry.anchorIndex += 1;
      });
    }
    var operatorEntry = old.requestId && opRequests[old.requestId];
    var adopted = operatorEntry && savedEl && adoptOperatorLifecycle(pane, operatorEntry, savedEl, old);
    var rec = adopted || registerRow(pane, function (record) { return savedEl || old.build(record); }, Math.max(1, old.h - gap),
      { kind: old.kind, data: old.data, keepEl: old.keepEl, mdReady: old.mdReady, requestId: old.requestId,
        origin: old.origin, replayToken: old.replayToken, manualClientId: old.manualClientId, atIndex: atIndex });
    if (old.manualClientId && manualMessages[old.manualClientId]) manualMessages[old.manualClientId].rec = rec;
    rec.toolActivity = old.toolActivity; rec.activityStages = old.activityStages ? Object.assign({}, old.activityStages, rec.activityStages || {}) : rec.activityStages;
    if (rec.activityStages && operatorEntry) { operatorEntry.activityStages = rec.activityStages; fillOperatorLifecycle(operatorEntry); }
    rememberActivities(rl, rec);
    if (old.requestId && opRequests[old.requestId]) {
      opRequests[old.requestId].anchorIndex = rec.index;
      opRequests[old.requestId].anchorListSeq = rowListFor(pane).seq;
    }
    return rec;
  }

  function replayHistory(payload, forceFull) {
    var roleId = payload.roleId;
    var rows = Array.isArray(payload.rows) ? payload.rows : [];
    var error = typeof payload.error === "string" && payload.error !== "" ? payload.error : null;
    if (rows.length === 0 && error === null) return;
    var prev = replayState[roleId];
    if (prev && prev.projectRoot !== payload.projectRoot) prev = null;
    var plan = forceFull ? { action: "full", from: 0 } : UiLabels.replayPlan(prev, rows);
    if (prev && error !== prev.error) plan = { action: "full", from: 0 };
    diagnose("renderer.replay", { count: rows.length, state: plan.action });
    if (plan.action === "skip") return;
    var pane = paneFor(roleId), oldList = paneRowLists[roleId];
    var reading = captureChatReading(pane);
    var nextCounts = Rt.replayCounts(rows);
    var preserved = plan.action === "full" ? preserveUncoveredRows(oldList, nextCounts) : null;
    if (plan.action === "full") {
      groupIdentitiesByRole[roleId] = Object.create(null);
      if (oldList && oldList.rows.length) pane = rebuildPane(roleId);
    }
    metaFor(roleId).restored = true;
    var counts = Object.create(null), liveCounts = liveReplayCounts[roleId] || {};
    var priorOrigin = rowOrigin, priorToken = rowReplayToken;
    var operatorAnchors = new Set(), deferredOperators = [];
    rows.forEach(function (row) {
      if (row.anchorKey && (row.anchor === "request" || row.anchor === "conclusion")) operatorAnchors.add(row.anchorKey);
    });
    function appendSaved(anchor) {
      if (!preserved || !preserved.buckets.has(anchor)) return;
      preserved.buckets.get(anchor).forEach(function (entry) {
        if (entry.activity) {
          rowOrigin = entry.activity.origin || "live"; rowReplayToken = entry.activity.replayToken || null;
          appendActivity(pane, entry.activity);
        } else {
          var request = entry.record.requestId && opRequests[entry.record.requestId];
          if (entry.record.kind === "operator" && request && operatorAnchors.has(request.anchorKey)) deferredOperators.push(entry.record);
          else appendPreservedRow(pane, entry.record, preserved.gap);
        }
      });
      preserved.buckets.delete(anchor);
    }
    batchDepth += 1;
    try {
      rowOrigin = "history"; rowReplayToken = null;
      if (error !== null && plan.action === "full") {
        registerRow(pane, function () {
          var divider = document.createElement("div"); divider.className = "sys sys-replay-divider";
          divider.innerHTML = '<span class="sys-ico">' + ICONS.deny + '</span><span class="sys-text">' + esc("会话记录读取失败，未回放：" + error) + "</span>";
          return divider;
        }, 34);
      }
      appendSaved("");
      var from = plan.action === "append" ? plan.from : 0;
      for (var i = 0; i < rows.length; i += 1) {
        var key = Rt.replayKey(rows[i]);
        var seenCanonical = key && Rt.canonicalKey(rows[i]) && counts[key];
        var token = key ? { key: key, occurrence: (counts[key] = Rt.canonicalKey(rows[i]) ? 1 : (counts[key] || 0) + 1) } : null;
        if (i < from || seenCanonical && rows[i].kind === "user") continue;
        rowOrigin = "history"; rowReplayToken = token;
        if (plan.action === "append" && token && (liveCounts[key] || 0) >= token.occurrence) {
          var existing = rowListFor(pane).tokenRows && rowListFor(pane).tokenRows[Rt.tokenId(token)];
          if (rows[i].anchorKey && existing) noteReplayAnchor(roleId, rows[i], existing.index);
          continue;
        }
        var manual = preserved && preserved.manuals[Rt.tokenId(token)];
        if (manual) appendPreservedRow(pane, manual, preserved.gap);
        else appendReplayRow(pane, rows[i]);
        appendSaved(Rt.tokenId(token));
      }
      if (preserved) Array.from(preserved.buckets.keys()).forEach(appendSaved);
      deferredOperators.forEach(function (record) {
        var request = opRequests[record.requestId];
        appendPreservedRow(pane, record, preserved.gap, operatorAnchorIndex(rowListFor(pane), request));
      });
      if (!prev) scrollBottomForced(pane);
    } finally {
      rowOrigin = priorOrigin; rowReplayToken = priorToken; batchDepth -= 1;
    }
    replayState[roleId] = { rows: rows, error: error, counts: nextCounts, projectRoot: typeof payload.projectRoot === "string" ? payload.projectRoot : "" };
    flushBatchSideEffects();
    if (prev && reading) restoreChatReading(pane, reading);
    materializePendingFor(roleId); renderCurrentWork(roleId);
  }

  /** 单条回放行（kind: user|assistant|tool|denied；助手/用户文本走 Markdown 渲染器，工具行 esc）。
   *  Q-2：`build` **惰性**——离屏行不建 DOM、不跑解析器；挂载时才构造。 */
  function appendReplayRow(pane, row) {
    if (!row || typeof row !== "object") return;
    var kind = String(row.kind || "");
    var text = String(row.text == null ? "" : row.text);
    if (text === "") return;
    if (kind !== "assistant" && kind !== "user" && kind !== "tool" && kind !== "denied") return; // 未知 kind：跳过（防御式）
    // D-1 回放同样归类：投递输入在回放里也呈**注入样式**（判据=同一张前缀表）；手输的历史行不受影响。
    if (kind === "tool" || kind === "denied") {
      var toolRec = appendActivity(pane, Tr.activityOf(row));
      if (row.anchorKey && toolRec) noteReplayAnchor(pane.dataset.roleId || "", row, toolRec.index);
      return;
    }
    var injRow = kind === "user" && Tr.classifyInjectedMessage ? Tr.classifyInjectedMessage(text) : null;
    var rec = registerRow(
      pane,
      function () {
        var el;
        if (injRow) {
          el = buildInjectedElement(injRow, true);
        } else if (kind === "assistant" || kind === "user") {
          el = document.createElement("div");
          el.className = "msg " + (kind === "assistant" ? "msg-assistant" : "msg-user") + " is-replay";
          el.innerHTML = Md.renderMarkdown(text);
        } else {
          el = document.createElement("div");
          el.className = "sys sys-call is-replay";
          el.innerHTML =
            '<span class="sys-ico">' + (kind === "denied" ? ICONS.deny : ICONS.call) + "</span>" +
            // 回放的工具行同样**只显示目标与状态**（D-1 回放会带 toolResult 文本——防御式瘦身；失败原因头保留）。
            '<span class="sys-text">' + esc(Tr.slimToolRow(text)) + "</span>";
        }
        if (row.at) el.setAttribute("title", "恢复自：" + String(row.at));
        return el;
      },
      kind === "tool" || kind === "denied" ? 34 : 60,
      { keepEl: injRow !== null, kind: "replay", data: { identity: JSON.stringify([kind, text, row.at || ""]) } }
    );
    // 真机缺陷修复（锚点物化）：交互工具的调用行/结论行带锚点标识（requestId/anchor/anchorKey，主进程
    // session-history.ts 给出）⇒ 按行序位登记进回放锚点表——交互卡（重）物化据此落回它发生的位置。
    if (row.anchorKey) noteReplayAnchor(pane.dataset.roleId || "", row, rec.index);
  }

  /** 重取当前项目的枚举（su 一轮结束后主进程推 `project:changed` 时调用）→ 左树随之长出（§10.3）。 */
  async function refreshProject() {
    if (!state.projectRoot) return;
    try {
      var res = await d.listProject(state.projectRoot);
      applyListing(res, false);
    } catch (err) {
      setHint("刷新角色列表失败：" + (err && err.message ? err.message : err));
    }
  }

  function renderWarnings(warnings) {
    var el = $("warnings");
    el.innerHTML = warnings.length ? warnings.map(esc).join("<br>") : "";
  }

  /**
   * 「角色简介」首句（展示用小字；无正文则回退到边界条目数）。 */
  function roleSubtitle(role) {
    if (role.builtIn) return "内置治理角色（定义见 SKILL.md）";
    var text = String(role.cardText || "").trim();
    var m = text.replace(/^#+\s*/m, "").split(/[\n。；;]/)[0].trim();
    if (m && m.length > 1) return m.length > 42 ? m.slice(0, 42) + "…" : m;
    var n = role.boundary && role.boundary.entries ? role.boundary.entries.length : 0;
    return n + " 条边界条目";
  }

  /** 单条角色树项（图标 + 名称 + 副标题 + 徽标 + **状态徽标**（B-3：色点+短标签，悬停示最近事件））。 */
  function roleTreeItem(r, isPrimary) {
    var item = document.createElement("div");
    // primary：主入口条目在左树里用**带边框的区域**框出（呈现；主入口身份本身来自 primaryRoleId）。
    item.className = "tree-item" + (r.builtIn ? " builtin" : "") +
      (isPrimary ? " primary" : "") +
      (r.roleId === state.selectedRoleId ? " active" : "");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.innerHTML =
      '<span class="ti-icon">' + (r.builtIn ? ICONS.shield : ICONS.role) + "</span>" +
      '<span class="ti-main"><span class="ti-name">' + esc(r.roleId) + "</span>" +
      (r.group && r.groupDuty ? '<span class="ti-group-duty">' + esc(r.groupDuty) + "</span>" : "") +
      '<span class="ti-sub">' + esc(roleSubtitle(r)) + "</span></span>" +
      (isPrimary ? '<span class="ti-badge primary" title="主入口：默认入口与主路径">主入口</span>' : "") +
      (r.builtIn ? '<span class="ti-badge" title="内置角色：定义在 SKILL.md，无角色目录">内置</span>' : "") +
      statusBadgeHtml(r.roleId);
    function activate() { selectRole(r.roleId); }
    item.addEventListener("click", activate);
    item.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    return item;
  }

  function treeGroupLabel(text) {
    var d = document.createElement("div");
    d.className = "tree-group";
    d.textContent = text;
    return d;
  }

  /**
   * 角色树：**主入口角色（`primaryRoleId`）置顶为「主入口」分组**，其余归入「其他角色（查看/调试）」分组
   * （§10.7）——次级角色**保留、可点、可聊**。主入口 id 取门禁引擎给的字段，**不硬编码 "su"**。
   */
  function renderRoleTree() {
    if (backgroundDelivery) return;
    var el = $("role-tree");
    el.innerHTML = "";
    if (!state.roles.length) {
      el.innerHTML = '<div class="tree-empty">该项目下未枚举到角色。</div>';
      return;
    }
    var primary = state.roles.find(function (r) { return r.roleId === state.primaryRoleId; }) || null;
    var others = state.roles.filter(function (r) { return !primary || r.roleId !== primary.roleId; });
    if (primary) {
      el.appendChild(treeGroupLabel("主入口"));
      el.appendChild(roleTreeItem(primary, true));
    }
    if (others.length) {
      el.appendChild(treeGroupLabel("其他角色（查看/调试）"));
      el.lastChild.remove();
      Rt.roleGroups(others).forEach(function (group) {
        el.appendChild(treeGroupLabel(group.name));
        group.roles.forEach(function (r) { el.appendChild(roleTreeItem(r, false)); });
      });
    }
  }

  function selectedRole() {
    return state.roles.find(function (r) { return r.roleId === state.selectedRoleId; }) || null;
  }

  function updateControls() {
    engineSelector.sync(state.runtime, !state.projectRoot);
    // 发送仅在**会话已开启**时可用。默认选中主入口但未开会话时，入口是空聊天区的主 CTA（§10.7），
    // 故不因「有选中角色」而放开发送。（「结束会话」按钮已按客户裁定 2026-10-13 删除——
    // 停止能力保留在程序化路径：换项目时 d.stopSession(null)「关闭全部」。）
    $("btn-send").disabled = !state.sessionOpenRoleId;
  }

  var roleSelectionVersion = 0;
  async function selectRole(roleId) {
    var selectionVersion = ++roleSelectionVersion;
    var projectRoot = state.projectRoot;
    var runtime = state.runtime;
    // 同角色显式点击仍定位，同时经后端确认会话（本地标记不能代替真实句柄）。
    if (state.sessionOpenRoleId === roleId) {
      setHint("已在该角色的会话中，直接输入消息即可。");
      // U-1：**重复点击同一角色**也是显式动作 ⇒ 行为一致（到底部；有未作答卡则滚到卡）。
      if (paneFor(roleId).parentNode === $("chat")) {
        stickPaneToBottomOrCard(roleId);
        updateOpChip(roleId);
      }
    }
    var priorRoleId = state.selectedRoleId;
    var isSameRole = priorRoleId === roleId;
    if (!isSameRole) {
      saveComposerDraft(priorRoleId);
      captureDrawerReading();
    }
    state.selectedRoleId = roleId;
    if (!isSameRole) restoreComposerDraft(roleId);
    renderRoleTree();
    renderRight();
    renderTabs();
    setChatHeader(selectedRole());
    updateControls();
    // B-2：**不得无条件清空聊天**——切到该角色自己的 pane（历史原样在；节点与监听器都未丢）。
    showPane(roleId);
    if (isSameRole) stickPaneToBottomOrCard(roleId);
    var pane = paneFor(roleId);
    var hasHistory = !pane.querySelector(".chat-empty");
    var loading = hasHistory
      ? null
      : sysRow(pane, "sys-loading", '<span class="spinner"></span>', "正在开启与角色 " + roleId + " 的会话…");
    setHint("");

    try {
      if (d.getSessionHistory) {
        var history;
        try { history = await d.getSessionHistory({ projectRoot: projectRoot, roleId: roleId, runtime: runtime }); }
        catch (error) { history = { projectRoot: projectRoot, roleId: roleId, runtime: runtime, rows: [], error: "读取历史失败：" + String(error && error.message || error) }; }
        deliverRuntimePayload(history, onSessionHistory);
        if (selectionVersion !== roleSelectionVersion || state.projectRoot !== projectRoot || state.runtime !== runtime) return;
        pane = paneFor(roleId);
        hasHistory = hasHistory || Array.isArray(history.rows) && history.rows.length > 0;
      }
      // 每次开启捕获所选 runtime；不同引擎的后台会话继续保持原身份。
      // B-2：切换**不再先 stop 旧会话**——引擎侧并存（各自保活、切回直接续；LRU 上限见 session.ts）。
      var res = await d.openSession({
        projectRoot: projectRoot,
        roleId: roleId,
        runtime: runtime,
      });
      if (loading) loading.remove();
      if (selectionVersion !== roleSelectionVersion || state.projectRoot !== projectRoot || state.runtime !== runtime) return;
      if (!res.ok) {
        state.sessionOpenRoleId = null;
        setState("err", "连接失败");
        updateControls();
        metaFor(roleId).error = true; // B-3：该角色最近一次会话开启以错误结束
        renderRoleTree();
        sysRow(pane, "sys-call", ICONS.deny, "会话开启失败：" + (res.error || ""));
        setHint("会话开启失败，可重试，或在「" + Rt.runtimeLabel(runtime) + " 设置」中检查配置。");
        return;
      }
      state.sessionOpenRoleId = roleId;
      metaFor(roleId).hadSession = true; // B-3：曾成功开过会话（停/淘汰后据它示「已停止」而非「未开启」）
      metaFor(roleId).error = false;
      syncChatState(roleId); // data-state 随真实快照（2026-10-13 修复：旧实现写死 run、轮末无回 idle 路径）
      renderRoleTree();
      updateControls();
      setHint(res.note || "");
      await refreshLiveRoles();
      if (selectionVersion !== roleSelectionVersion || state.projectRoot !== projectRoot || state.runtime !== runtime) return;
      renderRoleTree();
      // D-1 契约（pm 2026-10-12 钉死）：上下文来源文案走**唯一映射** `St.sessionContextNotice`——
      // 实际原生恢复结果由窗口转换；回放存在不证明模型上下文恢复。失败后重建必须保留原因。
      showSessionContext(roleId, res);
      // 生效配置来源（T13）：`.ans` 存在但不可用 / 声明已接受却缺 pin → 载入器 fail-closed 未接受。
      // 如实内联明示「这不是已授权状态」——绝不回退运行期同意、绝不让用户误以为已授权。
      if (res.config && (res.config.kind === "ans-invalid" || !res.config.accepted)) {
        appendConfigNote(pane, res.config);
      }
      // 会话欢迎消息经 session:event 推达，自动出现在该角色的聊天流中。
    } catch (err) {
      if (loading) loading.remove();
      if (selectionVersion !== roleSelectionVersion || state.projectRoot !== projectRoot || state.runtime !== runtime) return;
      state.sessionOpenRoleId = null;
      setState("err", "连接失败");
      updateControls();
      metaFor(roleId).error = true; // B-3：会话开启异常
      renderRoleTree();
      sysRow(pane, "sys-call", ICONS.deny, "会话开启异常：" + (err && err.message ? err.message : err));
    }
  }

  function showSessionContext(roleId, info) {
    var pane = paneFor(roleId), meta = metaFor(roleId);
    var token = JSON.stringify([info.contextSource, info.contextWarning || ""]);
    if (meta.contextNoticeToken === token) return;
    meta.contextNoticeToken = token;
    var notice = St.sessionContextNotice({ resumed: info.resumed === true, contextSource: info.contextSource,
      contextWarning: info.contextWarning, hadHistory: !pane.querySelector(".chat-empty"), alreadyAnnounced: false });
    if (notice.text) sysRow(pane, "sys-settled", ICONS.call, notice.text);
  }

  // —————— 右栏：角色资料（手风琴） ——————
  function sec(summary, count, bodyHtml, open, countId) {
    return (
      '<details class="sec"' + (open ? " open" : "") + "><summary>" +
      '<svg class="sec-chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
      '<span class="sec-label">' + esc(summary) + "</span>" +
      (count == null ? "" : '<span class="sec-count"' + (countId ? ' id="' + countId + '"' : "") + ">" + esc(String(count)) + "</span>") +
      "</summary>" +
      '<div class="sec-body">' + bodyHtml + "</div></details>"
    );
  }

  // —————— 右栏「待办 / 队列」组（2026-10-12 追加；数据来自 `session:role-state` 快照——**不造第二套数据源**）——————
  /** 该角色的待办视图行（纯映射在 `ui-labels.js`：来源标签/截断/位置；本函数只取数）。 */
  function queueViewsFor(roleId) {
    return UiLabels.queueItemViews(state.queueItemsByRole[roleId] || [], state.runningByRole[roleId]);
  }

  /** 入队时间的本地显示（ISO → 本地时区；解析不了则不显示——不假装有时间）。 */
  function queueTimeText(at) {
    if (typeof at !== "string" || at === "") return "";
    var t = new Date(at);
    return isNaN(t.getTime()) ? "" : t.toLocaleTimeString();
  }

  /** 待办行 HTML：**每字段 esc**（来源/摘要/时间——摘要已在纯映射里截断，长内容不铺开）。
   *  「进行中」= 正在跑的那条投递；排队条目位置 1..N（**如实**：排队 ≠ 已执行）。
   *  **P1-1（2026-10-13 客户裁定）**：① 有全文者带「全文」展开钮（`.q-toggle` → `.q-full`，抽屉内展开）；
   *  ② **仅「客户消息」且未投递（非进行中）**的行带「撤回」（`.q-withdraw`）——派发/回交**只读、无撤回钮**
   *  （呈现与语义同口径：治理流单方面撤会破坏 su 验收/派发的因果）。 */
  function queueRowsHtml(views) {
    if (views.length === 0) return '<div class="muted small">无进行中或排队消息</div>';
    var html = '<ul class="queue-list">';
    var roleId = state.selectedRoleId;
    for (var i = 0; i < views.length; i += 1) {
      var v = views[i];
      var reading = drawerReading[roleId] || { full: {}, sections: {} };
      var opened = reading.full[v.id] === true;
      var pending = withdrawPending[roleId + "\u0000" + v.id] === true;
      var feedback = (withdrawFeedback[roleId] || {})[v.id] || "";
      var running = v.pos === "进行中";
      var canWithdraw = v.kind === "message" && !running;
      var expandable = v.full !== "" && v.full.length > v.text.length;
      var encoded = esc(encodeURIComponent(v.id));
      html += '<li data-queue-id="' + encoded + '" class="q-item' + (running ? ' is-running' : '') + '">' +
        (running ? '' : '<span class="q-pos">' + esc(v.pos) + '</span>') +
        '<div class="q-content"><div class="q-head"><span class="q-src">' + esc(v.source) + '</span><span class="q-meta">' + esc(queueTimeText(v.at)) + '</span></div>' +
        '<p class="q-text">' + esc(v.text) + '</p>' +
        (expandable || canWithdraw ? '<div class="q-actions">' +
          (expandable ? '<button class="q-toggle" type="button" aria-expanded="' + opened + '" data-id="' + encoded + '" title="展开全文">' + (opened ? '收起' : '全文') + '</button>' : '') +
          (canWithdraw ? '<button class="q-withdraw" type="button" ' + (pending ? 'disabled' : '') + ' data-id="' + encoded + '" title="撤回该条排队消息（仅未投递者可撤）">' + (pending ? '撤回中…' : '撤回') + '</button>' : '') + '</div>' : '') +
        (feedback ? '<div class="q-feedback" role="status">' + esc(feedback) + '</div>' : '') +
        (expandable ? '<div class="q-full" data-full-id="' + encoded + '"' + (opened ? '' : ' hidden') + '>' + esc(v.full) + '</div>' : '') +
        '</div></li>';
    }
    return html + "</ul>";
  }

  /** [P1-1] 抽屉待办行的点击（事件委托挂 #right-body——行重渲染不丢绑定）：
   *  「全文」切换展开、「撤回」调 IPC 并按结果在聊天流如实一行（ok ⇒「已撤回排队消息：〈摘要〉」；
   *  无效 ⇒「撤回无效：〈原因〉」——绝不假装撤掉）。 */
  function onRightBodyClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var toggle = t.closest(".q-toggle");
    if (toggle) {
      var item = toggle.closest(".q-item");
      var fullEl = item ? item.querySelector(".q-full") : null;
      if (fullEl) {
        fullEl.hidden = !fullEl.hidden;
        toggle.textContent = fullEl.hidden ? "全文" : "收起";
        toggle.setAttribute("aria-expanded", String(!fullEl.hidden));
        captureDrawerReading();
      }
      return;
    }
    var wd = t.closest(".q-withdraw");
    if (wd) {
      var rawId = wd.getAttribute("data-id") || "";
      var id = rawId;
      try {
        id = decodeURIComponent(rawId); // 与渲染侧 encodeURIComponent 配对（NUL 等字符安全往返）
      } catch (err) {
        id = rawId; // 编码异常时按原样尝试（防御，不崩）
      }
      void withdrawQueuedMessage(id);
    }
  }

  /** [P1-1] 撤回一条排队消息：`id` 来自快照条目（单一数据源）。结果在聊天流如实一行；位次前移由
   *  onRoleState 的既有快照刷新（updateRightQueue/队列行/角标）自然完成——不造第二套界面状态。 */
  async function withdrawQueuedMessage(id) {
    var roleId = state.selectedRoleId;
    if (!roleId || !id) return;
    var generation = projectGeneration;
    var pane = activePane();
    var pendingKey = roleId + "\u0000" + id;
    var pendingTable = withdrawPending;
    var focused = document.activeElement;
    var restoreFocus = focused && focused.classList.contains("q-withdraw") && focused.dataset.id === encodeURIComponent(id);
    function restoreWithdrawFocus() {
      if (!restoreFocus || state.selectedRoleId !== roleId || document.activeElement !== document.body) return;
      $("right-body").querySelectorAll(".q-withdraw").forEach(function (button) {
        if (button.dataset.id === encodeURIComponent(id) && !button.disabled) button.focus({ preventScroll: true });
      });
    }
    if (withdrawPending[pendingKey]) return;
    var feedback = withdrawFeedback[roleId] || (withdrawFeedback[roleId] = Object.create(null));
    delete feedback[id];
    withdrawPending[pendingKey] = true;
    renderWithdrawResult(roleId, id);
    var res;
    try {
      res = await d.withdrawQueued(sessionTarget(roleId), id);
    } catch (err) {
      delete pendingTable[pendingKey];
      feedback[id] = "撤回失败：" + String(err && err.message ? err.message : err);
      if (generation !== projectGeneration) return;
      sysRow(pane, "sys-call", ICONS.deny, feedback[id]);
      delete withdrawPending[pendingKey];
      if (state.selectedRoleId === roleId) renderWithdrawResult(roleId, id);
      restoreWithdrawFocus();
      return;
    }
    delete pendingTable[pendingKey];
    if (generation !== projectGeneration) { if (!res || !res.ok) feedback[id] = "撤回无效：" + ((res && res.error) || "未知原因"); return; }
    delete withdrawPending[pendingKey];
    if (res && res.ok === true) {
      delete feedback[id];
      sysRow(pane, "sys-call", ICONS.ok, "已撤回排队消息：" + (res.summary || ""));
    } else {
      feedback[id] = "撤回无效：" + ((res && res.error) || "未知原因");
      sysRow(pane, "sys-call", ICONS.deny, feedback[id]);
    }
    if (state.selectedRoleId === roleId) renderWithdrawResult(roleId, id);
    restoreWithdrawFocus();
  }

  /** 同项状态更新保留按钮实例/键盘焦点；队列成员仍唯一来自role-state。 */
  function renderWithdrawResult(roleId, id) {
    if (state.selectedRoleId !== roleId || renderedDrawerRole !== roleId) return;
    var items = $("right-body").querySelectorAll(".q-item[data-queue-id]");
    var encoded = encodeURIComponent(id);
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].dataset.queueId !== encoded) continue;
      captureDrawerReading();
      var button = items[i].querySelector(".q-withdraw");
      if (button) {
        button.disabled = withdrawPending[roleId + "\u0000" + id] === true;
        button.textContent = button.disabled ? "撤回中…" : "撤回";
      }
      var text = (withdrawFeedback[roleId] || {})[id] || "";
      var note = items[i].querySelector(".q-feedback");
      if (text) {
        if (!note) {
          note = document.createElement("div"); note.className = "q-feedback"; note.setAttribute("role", "status");
          items[i].querySelector(".q-content").insertBefore(note, items[i].querySelector(".q-full"));
        }
        note.textContent = text;
      } else if (note) note.remove();
      restoreDrawerReading(roleId);
      return;
    }
  }

  function captureDrawerReading() {
    if (state.rightTab !== "card" || !renderedDrawerRole) return;
    var body = $("right-body");
    var old = drawerReading[renderedDrawerRole] || { sections: {}, full: {} };
    body.querySelectorAll("details[data-section]").forEach(function (d) { old.sections[d.dataset.section] = d.open; });
    body.querySelectorAll("[data-full-id]").forEach(function (el) {
      var id; try { id = decodeURIComponent(el.dataset.fullId); } catch (_) { id = el.dataset.fullId; }
      old.full[id] = !el.hidden;
    });
    old.scrollTop = body.scrollTop;
    var top = body.getBoundingClientRect().top;
    var candidates = body.querySelectorAll(".q-item, details[data-section]");
    old.anchor = null;
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i].getBoundingClientRect().bottom <= top) continue;
      var button = candidates[i].querySelector("[data-id]");
      old.anchor = { section: candidates[i].dataset.section, id: candidates[i].dataset.queueId || (button ? button.dataset.id : null), offset: candidates[i].getBoundingClientRect().top - top };
      break;
    }
    drawerReading[renderedDrawerRole] = old;
  }

  function restoreDrawerReading(roleId) {
    var saved = drawerReading[roleId];
    var body = $("right-body");
    if (!saved) { body.scrollTop = 0; return; }
    body.querySelectorAll("details[data-section]").forEach(function (d) { d.open = saved.sections[d.dataset.section] === true; });
    body.scrollTop = saved.scrollTop || 0;
    if (saved.anchor) {
      var nodes = body.querySelectorAll(".q-item, details[data-section]");
      for (var i = 0; i < nodes.length; i += 1) {
        var button = nodes[i].querySelector("[data-id]");
        if ((saved.anchor.id && (nodes[i].dataset.queueId === saved.anchor.id || button && button.dataset.id === saved.anchor.id)) || (saved.anchor.section && nodes[i].dataset.section === saved.anchor.section)) {
          body.scrollTop += nodes[i].getBoundingClientRect().top - body.getBoundingClientRect().top - saved.anchor.offset;
          break;
        }
      }
    }
  }

  function workListHtml(roleId) {
    var views = queueViewsFor(roleId);
    if (!views.length) return '<div class="muted small">无进行中或排队消息</div>';
    var running = views.filter(function (v) { return v.pos === "进行中"; });
    var queue = views.filter(function (v) { return v.pos !== "进行中"; });
    return (running.length ? '<h3 class="work-heading">当前工作</h3>' + queueRowsHtml(running) : '') +
      (queue.length ? '<h3 class="work-heading">排队</h3>' + queueRowsHtml(queue) : '');
  }

  function updateRightQueue(roleId) {
    if (state.selectedRoleId !== roleId || renderedDrawerRole !== roleId) return;
    var body = $("right-queue-body");
    if (!body) return;
    var focused = body.contains(document.activeElement) ? document.activeElement : null;
    var focusId = focused && focused.dataset.id;
    var focusClass = focused && (focused.classList.contains("q-toggle") ? "q-toggle" : focused.classList.contains("q-withdraw") ? "q-withdraw" : "");
    captureDrawerReading();
    body.innerHTML = workListHtml(roleId);
    restoreDrawerReading(roleId);
    if (focusId && focusClass) body.querySelectorAll("." + focusClass).forEach(function (button) {
      if (button.dataset.id === focusId && !button.disabled) button.focus({ preventScroll: true });
    });
  }

  // —————— 右抽屉 + 右上角图标簇（客户裁定 2026-10-13）：右栏不常驻，点了才展示 ——————
  // tab → 抽屉标题；同一时刻至多开一块（state.rightTab）；"pi" tab 展示迁入抽屉的既有 Pi 面板
  // （面板本体、保存/掩码纪律一字不动）。内容跟随当前选中角色（打开状态下随 selectRole/applyListing 重渲染）。

  /** 右上角图标簇的**角标**：第二轮裁定（2026-10-13）待办/队列归角色、簇只留两枚——「角色资料」图标角标 =
   *  当前选中角色的待办深度（进行中+排队视图行数；继承原待办图标角标语义；同一 role-state 快照，无新数据源）。 */
  function renderTabs() {
    if (backgroundDelivery) return;
    var roleId = state.selectedRoleId;
    var views = roleId ? queueViewsFor(roleId) : [];
    setTabBadge("card", views.length);
    ["card", "pi"].forEach(function (id) {
      var b = $("tab-" + id);
      if (b) b.classList.toggle("active", state.rightTab === id);
    });
    var drawer = $("right-drawer");
    if (drawer) drawer.classList.toggle("open", state.rightTab !== null);
    syncCoveredOperatorCards();
  }

  function setTabBadge(id, n) {
    var b = $("tab-" + id);
    if (!b) return;
    var el = b.querySelector(".tab-badge");
    if (!el) return;
    if (typeof n === "number" && n > 0) {
      el.textContent = String(n);
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  /** 点图标：同 tab 再点 = 收起；不同 tab = 切换内容（至多开一块）。 */
  function toggleRightDrawer(tab) {
    captureDrawerReading();
    state.rightTab = state.rightTab === tab ? null : tab;
    renderRight();
    renderTabs();
    if (state.rightTab) $("drawer-close").focus();
    else $("tab-" + tab).focus();
    if (state.rightTab === "pi") void loadPiConfig(); // Pi 面板每次展开都重取视图（掩码/缺项告警如实）
  }

  function closeRightDrawer() {
    if (state.rightTab === null) return;
    captureDrawerReading();
    var priorTab = state.rightTab;
    state.rightTab = null;
    renderRight();
    renderTabs();
    $("tab-" + priorTab).focus();
  }

  /** 抽屉内的 Pi 面板可见性（面板本体 hidden 由 tab 状态驱动；内容/保存/掩码逻辑一字不动）。 */
  function syncPiPanel() {
    var panel = $("pi-panel");
    var body = $("right-body");
    if (panel) panel.hidden = state.rightTab !== "pi";
    if (body) body.hidden = state.rightTab === "pi";
  }

  function renderRight() {
    if (backgroundDelivery) return;
    captureDrawerReading();
    var body = $("right-body");
    var tab = state.rightTab;
    var titleEl = $("drawer-title");
    var titles = { card: "角色资料", pi: Rt.runtimeLabel(state.runtime) + " 配置" };
    var settingsTab = $("tab-pi");
    settingsTab.title = Rt.runtimeLabel(state.runtime) + " 设置";
    settingsTab.setAttribute("aria-label", settingsTab.title);
    if (titleEl) titleEl.textContent = titles[tab] || "角色资料";
    syncPiPanel();
    if (!tab) {
      body.innerHTML = "";
      return;
    }
    if (tab === "pi") {
      body.innerHTML = ""; // Pi 面板本体（#pi-panel）在抽屉内由 syncPiPanel 控制显隐——不在此重渲染
      return;
    }
    var role = selectedRole();
    if (!role) {
      body.innerHTML =
        '<div class="right-empty">' +
        '<p class="empty-title">选择角色后查看资料</p>' +
        '<p class="empty-sub">点右上角图标展示对应面板；内容跟随当前选中角色。</p>' +
        "</div>";
      return;
    }
    // "card"（角色资料）：既有四组逐字保留（角色卡 md / 边界条目 / 变更记录 / 文档索引）+ **待办/队列两节
    // 归角色**（2026-10-13 第二轮裁定：「代办是不是应该放在角色里面……这个是和角色相关的」——同一真实
    // 快照的两个视图、逐字保留；随 session:role-state 快照定点更新，见 updateRightQueue）。
    var entries = role.boundary && role.boundary.entries ? role.boundary.entries : [];
    var qViews = queueViewsFor(role.roleId);
    var qDepth = (state.queueByRole[role.roleId] || []).length;
    if (titleEl) titleEl.textContent = role.roleId + " · 角色资料";
    var saved = drawerReading[role.roleId] || { sections: {}, full: {} };
    drawerReading[role.roleId] = saved;
    var html = '<div id="right-queue-body" class="role-work">' + workListHtml(role.roleId) + '</div>';
    html += sec("角色卡", null,
      '<div class="kv">' + esc(role.cardPath) + "</div>" +
      // N-2（2026-10-12 客户裁定）：「右边的角色卡要有 markdown 渲染」——走**既有 Markdown 管线**
      // （`Md.renderMarkdown` 同一 `esc` 单一来源；转义/白名单不变：html:false、链接 rel + `md-link` 类、
      // 图片=原文文本；表格已启用（2026-10-13），单元格照常转义）。`card-md` 只是这套渲染产物的样式钩子。
      '<div class="card-text card-md">' + Md.renderMarkdown(role.cardText || "（空）") + "</div>", false);
    html += sec("边界条目", entries.length, renderBoundaryTable(role.boundary), false);
    html += sec("变更记录", role.changelog ? null : "无", renderChangelog(role), false);
    html += sec("文档", role.docs && role.docs.length ? role.docs.length : "无", renderDocs(role), false);
    body.innerHTML = html;
    renderedDrawerRole = role.roleId;
    body.querySelectorAll("details.sec").forEach(function (d, i) {
      d.dataset.section = ["card", "boundary", "changes", "docs"][i];
      d.open = saved.sections[d.dataset.section] === true;
      d.addEventListener("toggle", function () { if (renderedDrawerRole === role.roleId) captureDrawerReading(); });
    });
    restoreDrawerReading(role.roleId);
  }

  function renderBoundaryTable(boundary) {
    var entries = boundary && boundary.entries ? boundary.entries : [];
    if (!entries.length) {
      return '<div class="muted small">（无条目' + (boundary && boundary.parseError ? "；解析失败：" + esc(boundary.parseError) : "") + "）</div>";
    }
    var rows = entries.map(function (e) {
      // 行类由 kind 驱动——CSS 据此**画出**边界：允许（dir/file）实线行、条件目录虚线行（呈现，非判定）。
      var rowCls = e.kind === "directory" ? "row-dir"
        : e.kind === "conditional-directory" ? "row-cond"
        : "row-file";
      // kind 用**线型样片**标出（实线=目录 / 虚线=条件 / 细线=文件），画面本身就是边界说明。
      var kindBadge = e.kind === "directory" ? '<span class="badge dir">directory</span>'
        : e.kind === "conditional-directory" ? '<span class="badge cond">conditional</span>'
        : '<span class="badge">file</span>';
      var cond = e.condition ? '<span class="badge cond">' + esc(e.condition) + "</span>" : "";
      // 每条边界画成一个**块**：首行 = root 尺寸标注 + kind 线型 + path；次行 = purpose / condition。
      return '<tr class="' + rowCls + '"><td class="entry">' +
        '<div class="bnd-head">' +
        '<span class="bnd-root">' + esc(e.root) + "</span>" +
        kindBadge +
        '<span class="bnd-path">' + esc(e.path) + "</span>" +
        "</div>" +
        '<div class="bnd-note"><span class="purpose">' + esc(e.purpose) + "</span>" + cond + "</div>" +
        "</td></tr>";
    }).join("");
    return '<table class="boundary"><tbody>' + rows + "</tbody></table>";
  }

  function renderChangelog(role) {
    if (!role.changelog) return '<div class="muted small">（无 changelog.md）</div>';
    // N-4（2026-10-12 客户裁定「都要 markdown 化」）：变更记录正文走**同一 Markdown 管线**（同 esc/白名单）。
    return (
      '<div class="kv">' + esc(role.changelog.path) + '</div>' +
      '<div class="card-text card-md">' + Md.renderMarkdown(role.changelog.text) + "</div>"
    );
  }

  function renderDocs(role) {
    if (!role.docs || !role.docs.length) return '<div class="muted small">（无 docs/ 目录或为空）</div>';
    // N-4：文档索引 = **路径清单**（无正文）——同样走**同一 Markdown 管线**：每条一行 `- path`（目录带尾 `/`）；
    // 路径逐字转抄（CommonMark 里词内下划线不成强调；`*` 等罕见字符的边界见 change 文档登记）。
    var md = role.docs
      .map(function (e) {
        var p = String(e.path == null ? "" : e.path);
        return "- " + p + (e.kind === "directory" ? "/" : "");
      })
      .join("\n");
    return '<div class="card-text card-md">' + Md.renderMarkdown(md) + "</div>";
  }

  // —————— 输入区：图片附件（K-2，2026-10-12；**P0-1 端到端接线**，2026-10-13 客户批准）——————
  // 边界：渲染进程**不碰文件系统**——选图走主进程（`d.pickImage()`：dialog + fs 读）；粘贴/拖入仅用浏览器
  // File API 读字节并交主进程校验（`d.attachImage`；**声明 mime/size 不可信**——主进程以真实字节为准：
  // 魔数嗅探 + ≤5MB）。**发送**：随消息**带载荷上送** `d.sendSession(text, images)`——
  // `[{type:"image", data:<base64>, mimeType}]`；**主进程按真实字节重校验**（解码 → 魔数嗅探 → ≤5MB），
  // 全过才放行、任一张不合格**整条拒发**（fail-closed，绝不「丢图发文字」）。旧「图片未发送」提示行
  // 与其生成函数已随接线**退役**（不留死代码——图片真正随消息送进模型了）。
  var IMAGE_MIME_ALLOW = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  var IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  var attachments = []; // {key, name, mime, size, data(base64), previewUrl, revoke}
  var attachSeq = 0;

  /** 附件行渲染（缩略图 chips；空时整行隐藏）。 */
  function renderAttachRow() {
    var row = $("attach-row");
    if (!row) return;
    row.hidden = attachments.length === 0;
    row.innerHTML = attachments
      .map(function (a) {
        var title = a.name + "（" + Math.max(1, Math.round(a.size / 1024)) + "KB）";
        return (
          '<span class="attach-chip" data-key="' + esc(a.key) + '" title="' + esc(title) + '">' +
          '<img alt="" src="' + esc(a.previewUrl) + '">' +
          '<button class="attach-rm" type="button" data-key="' + esc(a.key) + '" aria-label="移除图片">×</button>' +
          "</span>"
        );
      })
      .join("");
  }

  function removeAttachment(key) {
    attachments = attachments.filter(function (a) {
      if (a.key !== key) return true;
      if (a.revoke && a.previewUrl.indexOf("blob:") === 0) {
        try {
          URL.revokeObjectURL(a.previewUrl);
        } catch (err) {
          // 撤销失败不影响移除本身
        }
      }
      return false;
    });
    draftFor(state.selectedRoleId).images = attachments;
    renderAttachRow();
  }

  function draftFor(roleId) {
    var key = String(roleId == null ? "" : roleId);
    return composerDrafts[key] || (composerDrafts[key] = { text: "", images: [] });
  }

  function saveComposerDraft(roleId) {
    var draft = draftFor(roleId);
    draft.text = $("inp-message").value;
    draft.images = attachments;
  }

  function restoreComposerDraft(roleId) {
    var draft = draftFor(roleId);
    $("inp-message").value = draft.text;
    attachments = draft.images;
    renderAttachRow();
    autoGrow();
    measureComposer();
  }

  function releaseImages(images) {
    images.forEach(function (a) {
      if (a.revoke && a.previewUrl.indexOf("blob:") === 0) try { URL.revokeObjectURL(a.previewUrl); } catch (_) { /* 浏览器资源清理 */ }
    });
  }

  function clearAllComposerDrafts() {
    saveComposerDraft(state.selectedRoleId);
    for (var roleId in composerDrafts) releaseImages(composerDrafts[roleId].images);
    composerDrafts = Object.create(null);
    attachments = [];
    $("inp-message").value = "";
    renderAttachRow();
    autoGrow();
  }

  function addAttachment(image, previewUrl, revoke, data, roleId) {
    var targetRole = roleId == null ? state.selectedRoleId : roleId;
    if (targetRole === state.selectedRoleId) saveComposerDraft(targetRole);
    var draft = draftFor(targetRole);
    draft.images.push({ key: "att-" + (++attachSeq), name: String(image.name || "图片"), mime: String(image.mime || ""),
      size: Number(image.size) || 0, data: typeof data === "string" ? data : "", previewUrl: String(previewUrl || ""), revoke: revoke === true });
    if (targetRole === state.selectedRoleId) { attachments = draft.images; renderAttachRow(); }
  }

  function clearSentAttachments(roleId, keys) {
    if (roleId === state.selectedRoleId) saveComposerDraft(roleId);
    var draft = draftFor(roleId);
    var sent = draft.images.filter(function (a) { return keys.indexOf(a.key) >= 0; });
    draft.images = draft.images.filter(function (a) { return keys.indexOf(a.key) < 0; });
    releaseImages(sent);
    if (roleId === state.selectedRoleId) { attachments = draft.images; renderAttachRow(); }
  }

  /** 客户端**快速筛**（UX 层：先挡明显不合规者，如实提示）；**权威校验在主进程**（真实字节嗅探）。 */
  function clientImageProblem(file) {
    if (IMAGE_MIME_ALLOW.indexOf(String(file.type || "")) < 0) {
      return "图片类型不支持：" + (file.type || "（未知）") + "——只支持 png / jpeg / webp / gif。";
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return "图片过大（> " + Math.round(IMAGE_MAX_BYTES / 1024 / 1024) + "MB）——请压缩后再发。";
    }
    return null;
  }

  /** File（粘贴/拖入）→ base64（只读字节：浏览器 File API，**不经 Node/fs**）。 */
  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () {
        reject(new Error("读取文件失败"));
      };
      fr.onload = function () {
        var s = String(fr.result || "");
        var i = s.indexOf("base64,");
        resolve(i >= 0 ? s.slice(i + "base64,".length) : "");
      };
      fr.readAsDataURL(file);
    });
  }

  /** 粘贴/拖入的一张图：快速筛 → 读字节 → 交主进程校验（不可信声明）→ 收下（blob 缩略图）。 */
  async function attachBrowserFile(file) {
    var requestRole = state.selectedRoleId;
    var generation = projectGeneration;
    var problem = clientImageProblem(file);
    if (problem) {
      setHint(problem);
      return;
    }
    var dataBase64;
    try {
      dataBase64 = await readFileBase64(file);
    } catch (err) {
      if (generation === projectGeneration && requestRole === state.selectedRoleId) setHint("读取图片失败：" + (err && err.message ? err.message : err));
      return;
    }
    var res = await d.attachImage({ name: file.name || "粘贴的图片", mime: file.type || "", dataBase64: dataBase64 });
    if (!res || !res.ok) {
      if (generation === projectGeneration && requestRole === state.selectedRoleId) setHint((res && res.error) || "图片校验失败。");
      return;
    }
    if (generation !== projectGeneration) return;
    var url = "";
    try {
      url = URL.createObjectURL(file);
    } catch (err) {
      url = "";
    }
    if (url === "") url = "data:" + res.image.mime + ";base64," + dataBase64;
    addAttachment(res.image, url, url.indexOf("blob:") === 0, dataBase64, requestRole);
    if (requestRole === state.selectedRoleId) setHint("");
  }

  /** 选图（系统文件选择器，走主进程）——取消是安静返回；失败如实提示。 */
  async function pickImageViaMain() {
    var requestRole = state.selectedRoleId;
    var generation = projectGeneration;
    if (!d.pickImage) {
      setHint("选图未接线。");
      return;
    }
    var res;
    try {
      res = await d.pickImage();
    } catch (err) {
      if (generation === projectGeneration && requestRole === state.selectedRoleId) setHint("选图失败：" + (err && err.message ? err.message : err));
      return;
    }
    if (!res || !res.ok) {
      if (generation === projectGeneration && requestRole === state.selectedRoleId) setHint((res && res.error) || "选图失败。");
      return;
    }
    if (res.cancelled || generation !== projectGeneration) return;
    addAttachment(res.image, "data:" + res.image.mime + ";base64," + res.image.dataBase64, false, res.image.dataBase64, requestRole);
    if (requestRole === state.selectedRoleId) setHint("");
  }

  // —————— 中栏：发送消息（多轮直发，不再确认） ——————
  async function onSend() {
    var role = selectedRole();
    if (!role) { setHint("请先在左侧选择角色。"); return; }
    var inp = $("inp-message");
    var projectRoot = state.projectRoot;
    var runtime = state.runtime;
    var rawDraft = inp.value;
    var text = rawDraft.trim();
    saveComposerDraft(role.roleId);
    var sentKeys = attachments.map(function (a) { return a.key; });
    if (!text) {
      // 仍要求**有字**（图片随消息发送，不单独发图——队列条目的正文形状钉死了非空正文）。
      setHint("请输入消息内容；图片会随消息一起发送。");
      return;
    }

    // P0-1：随消息**带载荷上送**（`[{type:"image", data:<base64>, mimeType}]`）——主进程会按真实字节
    // 重校验（不信任渲染侧）；失败整条拒发、附件保留在输入区可重试。
    var images = attachments.map(function (a) {
      return { type: "image", data: a.data, mimeType: a.mime };
    });

    if (state.sessionOpenRoleId !== role.roleId) {
      // 防御路径：正常流程点角色即已开会话；若未开，先补开再发。
      await selectRole(role.roleId);
    }
    // 补开失败/用户已切换时保留输入和附件，不追加假发送气泡、不调用 sendSession。
    if (state.projectRoot !== projectRoot || state.runtime !== runtime || state.selectedRoleId !== role.roleId || state.sessionOpenRoleId !== role.roleId) return;
    var pane = paneFor(role.roleId);
    // H-1 附录：记「本端手发送的最近一条」——投递回显归类据此**防误伤**（手输即便字面像投递前缀，
    // 其回显也不得被当成系统投递）；普通气泡路径不受影响。
    lastManualSend = { roleId: role.roleId, text: text, at: Date.now() };
    // 带图时在用户气泡上保留**如实记录**（附件行发送成功后清空——图已定格进载荷/队列）。
    var clientMessageId = window.crypto.randomUUID();
    var manualRec = appendUser(pane, images.length > 0 ? "（图片 ×" + images.length + "）" + text : text);
    manualRec.manualClientId = clientMessageId;
    manualMessages[clientMessageId] = { roleId: role.roleId, text: text, rec: manualRec, turnId: null };
    // 原发送交互：提交后即腾出输入框；返回只能更新本次请求角色。
    inp.value = "";
    draftFor(role.roleId).text = "";
    autoGrow();
    setHint("");
    function restoreFailedDraft() {
      if (state.projectRoot !== projectRoot || state.runtime !== runtime) return;
      if (state.selectedRoleId === role.roleId) saveComposerDraft(role.roleId);
      var original = draftFor(role.roleId);
      if (!original.text) original.text = rawDraft;
      if (state.selectedRoleId === role.roleId) restoreComposerDraft(role.roleId);
    }
    try {
      var res = await d.sendSession(text, images, { projectRoot: projectRoot, roleId: role.roleId, runtime: runtime }, { clientMessageId: clientMessageId });
      deliverRuntimePayload({projectRoot:projectRoot,roleId:role.roleId,runtime:runtime}, function () {
      if (!res.ok) {
        restoreFailedDraft();
        metaFor(role.roleId).error = true; // B-3：最近一次轮次以错误结束
        if (state.projectRoot === projectRoot && state.sessionOpenRoleId === role.roleId) {
          state.sessionOpenRoleId = null;
          updateControls();
        }
        sysRow(pane, "sys-call", ICONS.deny, "发送失败：" + (res.error || ""));
        // 拒发（如主进程校验不合格）：附件**保留在输入区**（本条没发出，可移除/压缩后重试）。
      } else if (res.queued === true) {
        // L-1：角色忙——消息**已入队**（不再直接失败）；如实提示位次。徽标/队列行由主进程真实快照驱动
        // （onRoleState），此处不自设忙态（准确性裁定）。图片**入队即定格**（排队后到投递都带原图）。
        stampLastEvent(role.roleId, "你：" + firstLine(text));
        var queuedMsg = "已入队：等它完成当前任务后处理（第 " + (res.position || 1) + " 位）。";
        sysRow(pane, "sys-queue", ICONS.clock, queuedMsg);
        if (state.selectedRoleId === role.roleId) setHint(queuedMsg);
        clearSentAttachments(role.roleId, sentKeys);
      } else {
        // 忙态由主进程快照转述（session:role-state 的 busy=true——见 onRoleState）；此处只记最近一条（悬停用）。
        stampLastEvent(role.roleId, "你：" + firstLine(text));
        clearSentAttachments(role.roleId, sentKeys);
      }
      renderRoleTree();
      });
    } catch (err) {
      deliverRuntimePayload({projectRoot:projectRoot,roleId:role.roleId,runtime:runtime}, function () {
      restoreFailedDraft();
      metaFor(role.roleId).error = true;
      if (state.projectRoot === projectRoot && state.sessionOpenRoleId === role.roleId) {
        state.sessionOpenRoleId = null;
        updateControls();
      }
      renderRoleTree();
      sysRow(pane, "sys-call", ICONS.deny, "发送异常：" + (err && err.message ? err.message : err));
      });
    }
  }

  // 「结束会话」按钮已按客户裁定（2026-10-13）删除：渲染侧只服务该按钮的 stop() 一并清（不留死代码）。
  // 停止**能力**保留在程序化路径——换项目时 loadProject 的 d.stopSession(null)「关闭全部」（定向 stopSession
  // 仍在主进程/会话管理器，供该路径与测试使用）。
  // **区分（P0-2，2026-10-13 客户批准）**：新增的「停止」钮（#btn-halt，**输入框区、发送钮左侧**、
  // 仅忙碌时出现）停的是**当前一轮**（abort；会话保留、轮次仍以 settled 收尾）——与已删的「结束会话」
  // （关整只会话）不是一回事，不是它的恢复。

  /**
   * Markdown 链接的点击（B-1）：一律**外开**（`d.openExternal` → 主进程校验 http/https 后交系统浏览器），
   * 不在应用内导航；打不开时如实提示一行（不静默、不假装成功）。
   */
  function onChatLinkClick(e) {
    var t = e.target;
    var a = t && t.closest ? t.closest("a.md-link") : null;
    if (!a) return;
    e.preventDefault();
    var href = a.getAttribute("href") || "";
    Promise.resolve(d.openExternal(href))
      .then(function (r) {
        if (r && r.ok === false) {
          sysRow(activePane(), "sys-call", ICONS.deny, "链接未能打开：" + (r.error || "未知原因"));
        }
      })
      .catch(function () {});
  }

  // —————— 输入框：Enter 发送，Shift+Enter 换行，自动增高 ——————
  function autoGrow() {
    var inp = $("inp-message");
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 132) + "px";
  }

  // —————— 自绘标题栏（客户要求：去掉原生标题栏与默认菜单栏，自己搞一个）——————
  // 右侧三个按钮经 IPC 接主进程（最小化 / 最大化-还原 / 关闭）；最大化态经
  // `onMaximizedChanged` 反推回来，令按钮图标在「最大化」与「还原」两态间切换。
  //
  // **双击拖动区最大化**：由系统按 Windows 惯例**原生**处理——整条标题栏是拖动区
  // （`-webkit-app-region: drag`），在 Windows 上按 HTCAPTION 对待，双击即最大化/还原。
  // 故此处**不**再挂 dblclick（否则会与原生切换叠加，双击变成没反应）。
  function setMaximizedUI(maximized) {
    var btn = $("win-max");
    if (!btn) return;
    var isMax = !!maximized;
    btn.classList.toggle("is-maximized", isMax);
    btn.setAttribute("title", isMax ? "还原" : "最大化");
    btn.setAttribute("aria-label", isMax ? "还原" : "最大化");
  }

  function initTitlebar() {
    var min = $("win-min");
    var max = $("win-max");
    var close = $("win-close");
    if (min) min.addEventListener("click", function () { d.minimizeWindow(); });
    if (max) max.addEventListener("click", function () { d.toggleMaximize(); });
    if (close) close.addEventListener("click", function () { d.closeWindow(); });
    if (d.onMaximizedChanged) d.onMaximizedChanged(setMaximizedUI);
    if (d.isMaximized) {
      // 初始化一次（据当前真实态设定图标）；失败则保持默认「最大化」态，不刷屏。
      d.isMaximized().then(setMaximizedUI).catch(function () {});
    }
  }

  // —————— 绑定 ——————
  initTitlebar();
  $("btn-import").addEventListener("click", importProject);
  // P1-3：切换项目确认条两端——取消=什么都不发生（隐藏即止）；确认=关闭全部并进新项目（走原导入流程，
  // loadProject 首步 stopSession(null)「关闭全部」即「会停止它们」的兑现）。
  $("switch-confirm-cancel").addEventListener("click", hideSwitchConfirm);
  $("switch-confirm-go").addEventListener("click", function () {
    hideSwitchConfirm();
    void doImportProject();
  });
  $("btn-send").addEventListener("click", onSend);
  // 停止入口（P0-2 UI）：忙碌时才可见（updateHaltButton 由 role-state 快照驱动）；点击三态如实行。
  $("btn-halt").addEventListener("click", onHaltClick);
  var inputCompositionActive = false;
  $("inp-message").addEventListener("compositionstart", function () { inputCompositionActive = true; });
  $("inp-message").addEventListener("compositionend", function () { inputCompositionActive = false; });
  $("inp-message").addEventListener("keydown", function (e) {
    // IME候选确认属于原生组合输入；end可能先于最后keydown，此时229仍标识IME处理。
    if (inputCompositionActive || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  $("inp-message").addEventListener("input", autoGrow);
  // K-2：图片入口——选图键 / 粘贴 / 拖入（渲染进程只读字节（File API），**校验在主进程**——不碰 fs）。
  if ($("btn-attach-image")) $("btn-attach-image").addEventListener("click", pickImageViaMain);
  if ($("attach-row")) {
    $("attach-row").addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest(".attach-rm") : null;
      if (b) removeAttachment(b.getAttribute("data-key"));
    });
  }
  $("inp-message").addEventListener("paste", function (e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    var files = [];
    for (var i = 0; i < e.clipboardData.items.length; i += 1) {
      var it = e.clipboardData.items[i];
      if (it.kind === "file" && it.type && it.type.indexOf("image/") === 0) {
        var f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return; // 无图：走默认粘贴（文字）
    e.preventDefault();
    files.forEach(function (f) {
      void attachBrowserFile(f);
    });
  });
  var capsuleEl = $("composer-capsule");
  if (capsuleEl) {
    ["dragenter", "dragover"].forEach(function (evName) {
      capsuleEl.addEventListener(evName, function (e) {
        e.preventDefault();
        capsuleEl.classList.add("is-dropping");
      });
    });
    ["dragleave", "drop"].forEach(function (evName) {
      capsuleEl.addEventListener(evName, function (e) {
        e.preventDefault();
        capsuleEl.classList.remove("is-dropping");
      });
    });
    capsuleEl.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files) return;
      Array.prototype.forEach.call(e.dataTransfer.files, function (f) {
        if (String(f.type || "").indexOf("image/") === 0) void attachBrowserFile(f);
        else setHint("只支持图片文件（png / jpeg / webp / gif）。");
      });
    });
  }
  // 横栏写入语义对真实引擎相同；选择器另行处理会话身份。
  var engineSelector = window.ANSEngineSelector.create($("runtime-select"), $("runtime-options"), function (runtime) { void selectRuntime(runtime); });
  engineSelector.sync(state.runtime, !state.projectRoot);
  renderWriteNote();
  // N-1：初始按钮文案（未导入 ⇒ 「导入项目」；与 HTML 静态文案同款——此后由 applyListing 维护）。
  updatePickButton();

  // Pi 配置面板（设计 §11/T28；客户裁定 2026-10-13 入口上移到右上角图标簇）：tab-pi 点开/再点收起
  // （面板本体与保存/掩码纪律一字未动）；面板内「收起」照旧可关。
  $("tab-pi").addEventListener("click", function () { toggleRightDrawer("pi"); });
  $("runtime-config-settings").addEventListener("click", openPiPanel);
  $("pi-save").addEventListener("click", savePiConfigFromForm);
  $("pi-toggle-secret").addEventListener("click", toggleSecretVisibility);
  // 右上角图标簇（客户裁定 2026-10-13；第二轮裁定同日：待办/队列归角色，簇只留两枚）——同图标再点收起；
  // 抽屉头 × 收起；Esc 收起（shell 确认卡在先——fail-closed 优先级不受影响）。
  $("tab-card").addEventListener("click", function () { toggleRightDrawer("card"); });
  // P1-1：抽屉内待办行的「全文 / 撤回」点击（事件委托挂 Persistent 的 #right-body——行重渲染不丢绑定）。
  $("right-body").addEventListener("click", onRightBodyClick);
  $("drawer-close").addEventListener("click", closeRightDrawer);
  // Markdown 链接（B-1）：点聊天流里的链接一律**外开**（事件委托挂在 #chat 上——pane 切换不丢）。
  $("chat").addEventListener("click", onChatLinkClick);
  // Q-2：滚动 → rAF 合帧 → 一次虚拟窗口更新（窗口化长转录时按需挂载/回收）。
  $("chat").addEventListener("scroll", onChatScroll);
  // shell 命令确认卡（M-1）：拒绝为默认焦点；关闭（×）/ Esc / 「拒绝」= **不放行**（fail-closed 的 UI 侧同向）。
  $("sc-deny").addEventListener("click", function () { respondShellConfirm(false); });
  $("sc-allow").addEventListener("click", function () { respondShellConfirm(true); });
  $("sc-close").addEventListener("click", function () { respondShellConfirm(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state.shellConfirm) {
      e.preventDefault();
      respondShellConfirm(false);
      return;
    }
    // 抽屉的 Esc 收起（客户裁定：点了才展示；Esc 也是收起路径之一）。
    if (e.key === "Escape" && state.rightTab !== null) {
      e.preventDefault();
      closeRightDrawer();
    }
  });
  // 保存后重载 Pi 配置视图——pi 路径的开会话 fail-closed 报错即由此面板补救（不在此处作判定）。
  // B-2：入参为**带 `roleId` 信封**的 `{roleId, event}`（多会话并存按角色分发，见 appendEvent）。
  d.onSessionEvent(appendEvent);
  // 主入口角色一轮结束（settle）→ 主进程推 `project:changed` → 重取枚举，左树随 su 建出的角色而长出（§10.3）。
  d.onProjectChanged(refreshProject);
  // 客户交互请求（A-5）：su 的 request_confirmation/request_choice → 渲染为该角色聊天流里的交互卡
  // （kind：confirm〔可带预览〕/ choice〔单选或勾选〕）；作答经 `d.operatorRespond` 回传（主进程按请求快照校验）。
  if (d.onOperatorRequest) d.onOperatorRequest(function (payload) { deliverRuntimePayload(payload, appendOperatorRequest); });
  if (d.onOperatorExpired) d.onOperatorExpired(function (payload) { deliverRuntimePayload(payload, onOperatorExpired); });
  // shell 命令确认卡（M-1）：主进程推来的数据面 → 应用内卡片（拒绝为默认；Esc/关闭 = 不放行）。
  if (d.onShellConfirm) d.onShellConfirm(function (payload) { deliverRuntimePayload(payload, onShellConfirm); });
  // 会话记录恢复（D-1）：主进程推来的规范化界面行 → 回放进该角色的 pane（解析在主进程；渲染侧不碰 SDK）。
  if (d.onSessionHistory) d.onSessionHistory(function (payload) {
    if (!state.projectRoot || payload.projectRoot && payload.projectRoot !== state.projectRoot) { pendingHistories.push(payload); return; }
    deliverRuntimePayload(payload, onSessionHistory);
  });
  // L-1 + 状态准确性：每角色**真实状态快照**（busy × 队列摘要，变化时）→ 徽标「工作中 · N 待办」+ 队列行。
  if (d.onRoleState) d.onRoleState(function (payload) { deliverRuntimePayload(payload, onRoleState); });

  measureComposer();
  if (typeof ResizeObserver === "function") new ResizeObserver(measureComposer).observe(document.querySelector(".composer"));
  window.addEventListener("resize", measureComposer);

  // 供 e2e 探针驱动（仅渲染进程内）。
  if (d.getRecoveryState) {
    d.getRecoveryState().then(async function (recovery) {
      if (!recovery || !recovery.projectRoot) return;
      if (["pi", "codex", "claude"].indexOf(recovery.runtime) >= 0) { state.runtime = recovery.runtime; engineSelector.sync(state.runtime, !state.projectRoot); }
      var listing = await d.listProject(recovery.projectRoot);
      applyListing(listing, true); // 恢复界面不调用 loadProject，不停止正在工作的会话。
      var roleId = recovery.roleId || state.primaryRoleId;
      if (roleId && state.roles.some(function (role) { return role.roleId === roleId; })) await selectRole(roleId);
      if (d.recoveryReady) await d.recoveryReady(); // 只重推仍pending的同id请求，不作答。
      diagnose("renderer.recovery", { state: "ready" });
    }).catch(function (error) {
      diagnose("renderer.event-error", { errorMessage: String(error && error.message || "界面恢复失败") });
      setHint("界面恢复失败，可重新选择项目或角色。");
    });
  }
  window.__ansRenderer = {
    state: state,
    loadProject: loadProject,
    refreshProject: refreshProject,
    refreshLiveRoles: refreshLiveRoles,
    selectRole: selectRole,
    selectRuntime: selectRuntime,
    openPiPanel: openPiPanel,
    loadPiConfig: loadPiConfig,
    savePiConfigFromForm: savePiConfigFromForm,
    appendOperatorRequest: appendOperatorRequest,
    piKeys: PI_KEYS.slice(),
    // L-1/状态准确性：供探针直接注入真实快照（按 IPC 契约 `{roleId, busy, summaries}`）。
    onRoleState: function (payload) { deliverRuntimePayload(payload, onRoleState); },
    onOperatorExpired: function (payload) { deliverRuntimePayload(payload, onOperatorExpired); },
    // M-1：供探针直接注入 shell 确认数据面（按 IPC 契约 `{id, command, summary, reasonPlain, …}`）。
    onShellConfirm: onShellConfirm,
    // 真机缺陷修复（锚点物化，2026-10-12）探针：读**行模型**（每行 kind/序位/交互卡行）与**回放锚点表**——
    // e2e 断言「卡的行序索引落在锚点而非行表尾」用（仅渲染进程内，无副作用）。
    rowModelDebug: function (roleId) {
      var key = String(roleId == null ? "" : roleId);
      var pane = paneFor(key);
      var rl = paneRowLists[key];
      if (!rl || rl.pane !== pane) return null;
      var ops = [];
      for (var i = 0; i < rl.rows.length; i += 1) {
        if (rl.rows[i].kind === "operator") ops.push({ index: rl.rows[i].index, requestId: rl.rows[i].requestId });
      }
      // rowGap：行占位口径中的 pane 行距缓存（2026-10-14 锚点漂移修复）——e2e 断言
      // 「未挂载期建行表的角色挂载后读到与已挂载角色相同的行距」用（防脱离文档读样式表落 0 缓存）。
      return { count: rl.rows.length, lastIndex: rl.rows.length - 1, operators: ops, rowGap: rl.rowGap };
    },
    replayAnchorDebug: function (roleId) {
      var table = paneAnchors[String(roleId == null ? "" : roleId)];
      if (!table) return [];
      var out = [];
      table.forEach(function (a, k) {
        out.push({ anchorKey: k, requestIndex: a.requestIndex, conclusionIndex: a.conclusionIndex, rowsAtReplay: a.rowsAtReplay });
      });
      return out;
    },
  };
})();
