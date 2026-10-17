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
    // I4（2026-10-17）：治理记录状态——原样转自 listProject 的 `governanceRecord`
    // （`{state:"present"|"missing"|"invalid"|"pin-mismatch", reason?, pinFiles?, pinCount?}`；桌面窗口派生）。
    // **旧主进程无此字段 ⇒ 按 `{state:"present"}` 兜底**（不显示动作、不崩）。判据只经
    // `UiLabels.governanceActionFor` 单一谓词，不在此直接比较状态字符串。
    governanceRecord: { state: "present" },
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
    // 恢复确认卡（G-2/U1，2026-10-16 客户批准；设计 §6.2）：当前挂起的一张 `{id, busy}`；无则 null。
    // 与 shell 卡同纪律：**等待不设限**（裁定 4；无计时器）；恰 `{allow:true}`（点「执行」）才作为
    // 执行请求回传；失效/通道异常如实标记（`markRecoveryConfirmExpired`——**绝不**呈现为已执行）。
    recoveryConfirm: null,
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

  var currentHintSource = null;
  /** **U1（2026-10-16 桌面窗口 e2e 定位，dist=18px）**：聊天区上方 `.session-notice` 提示条
   *  （`#composer-hint` + `#history-projection-note`，空时 `display:none`）出现/增高会**改变 `#chat`
   *  的可见高度**——「先贴底、后出提示」的时序（典型：selectRole 异步尾部 `setHint(res.note)` 的
   *  「续接当前会话。」≈19px）会把已贴底内容整体顶上去且无补滚。
   *  口径：改文案**前**按 S-1 同款距底判据（`STICK_THRESHOLD_PX`）记「是否在底部附近」；改后
   *  **提示条高度确有变化**且原在底部 ⇒ 补一次贴底。上翻者不打扰（超出阈值绝不动）；高度不变不动
   *  （重复写同值零副作用，不引入滚动抖动）；批量期（`batchDepth`）照 Q-1 口径只登记一次，
   *  收尾统一贴底（不逐条布局）。 */
  function noticeLayoutPin() {
    var chat = $("chat");
    if (!chat || backgroundDelivery) return null;
    var bar = document.querySelector(".session-notice");
    return {
      chat: chat, bar: bar, h: bar ? bar.getBoundingClientRect().height : 0,
      pinned: UiLabels.stickToBottom(chat.scrollHeight - chat.scrollTop - chat.clientHeight, UiLabels.STICK_THRESHOLD_PX),
    };
  }
  function restickAfterNoticeChange(pin) {
    if (!pin || !pin.pinned || backgroundDelivery || !pin.chat.isConnected) return;
    var h = pin.bar ? pin.bar.getBoundingClientRect().height : 0;
    if (h === pin.h) return; // 提示条高度未变：不动（防抖动）
    var pane = pin.chat.querySelector(".chat-pane");
    if (batchDepth > 0) { if (pane) batchSuppressedScroll = pane; return; } // Q-1：批量期抑制，收尾统一贴底
    pin.chat.scrollTop = pin.chat.scrollHeight;
  }
  function setHint(text, source) {
    var pin = noticeLayoutPin(); // U1：提示条高度变化会把已贴底内容顶起——改前记「在底部附近」，改后补滚
    $("composer-hint").textContent = text || "";
    currentHintSource = source || null;
    restickAfterNoticeChange(pin);
  }
  function clearQueueHint(roleId, clientMessageId) {
    if (backgroundDelivery || state.selectedRoleId !== roleId) return;
    var source = currentHintSource;
    if (source && source.kind === "queue" && source.projectRoot === state.projectRoot && source.runtime === state.runtime && source.roleId === roleId && (!clientMessageId || source.clientMessageId === clientMessageId)) setHint("");
  }

  // —————— 可收起左栏（2026-10-17 客户反馈「左边和内容区域不太协调…最好左边能收起来」）——————
  // 状态单点＝`.app.is-sidebar-collapsed` 类（DOM 是唯一判据）；持久化只读写 localStorage 的
  // `ans.sidebar.collapsed`（"1" 收起 / "0" 展开）。坏值/异常（隐私模式等）一律回退**展开**。
  // 切换时先记 `#chat.scrollTop`、改后回写（内容列宽仍是 900，正文换行不变，滚动不跳顶）。
  var SIDEBAR_STORAGE_KEY = "ans.sidebar.collapsed";
  // 左栏宽度（2026-10-17 客户选择「248px + 可拖拽」）：单一来源 = CSS 变量 `--sidebar-width`；
  // 持久化键独立；折叠只把栅格首列置 0，宽度变量原样保留，展开即恢复。
  var SIDEBAR_WIDTH_STORAGE_KEY = "ans.sidebar.width";

  function currentSidebarWidth() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width");
    var n = parseFloat(raw);
    return isFinite(n) ? UiLabels.clampSidebarWidth(n) : UiLabels.SIDEBAR_WIDTH_DEFAULT;
  }

  /** 应用宽度（不做持久化）：只改变量 + 分隔线 aria，不重建 DOM。 */
  function applySidebarWidth(width) {
    var w = UiLabels.clampSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-width", w + "px");
    var resizer = $("sidebar-resizer");
    if (resizer) resizer.setAttribute("aria-valuenow", String(w));
    return w;
  }

  function readSidebarWidth() {
    try { return UiLabels.clampSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)); }
    catch (_) { return UiLabels.SIDEBAR_WIDTH_DEFAULT; }
  }

  function writeSidebarWidth(width) {
    try { window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(UiLabels.clampSidebarWidth(width))); }
    catch (_) { /* 存储不可用：本次会话仍可拖动，只是不持久化 */ }
  }

  /** 分隔线：pointer 拖动（改 CSS 变量 + aria）、双击复位 248、←/→ ±8（Shift ±24）。
   *  拖动期间 `.is-sidebar-resizing` 禁用宽度过渡（避免滞后）；松手恢复并持久化。 */
  function initSidebarResizer() {
    var resizer = $("sidebar-resizer");
    if (!resizer) return;
    var app = document.querySelector(".app");
    var startX = 0, startWidth = 0, dragging = false;
    resizer.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startWidth = currentSidebarWidth();
      if (app) app.classList.add("is-sidebar-resizing");
      try { resizer.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    resizer.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      applySidebarWidth(startWidth + (event.clientX - startX));
      event.preventDefault();
    });
    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      if (app) app.classList.remove("is-sidebar-resizing");
      try { resizer.releasePointerCapture(event.pointerId); } catch (_) {}
      writeSidebarWidth(currentSidebarWidth());
    }
    resizer.addEventListener("pointerup", endDrag);
    resizer.addEventListener("pointercancel", endDrag);
    resizer.addEventListener("dblclick", function () {
      applySidebarWidth(UiLabels.SIDEBAR_WIDTH_DEFAULT);
      writeSidebarWidth(UiLabels.SIDEBAR_WIDTH_DEFAULT);
    });
    resizer.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      var step = event.shiftKey ? 24 : 8;
      var next = UiLabels.stepSidebarWidth(currentSidebarWidth(), event.key === "ArrowRight" ? step : -step);
      applySidebarWidth(next);
      writeSidebarWidth(next);
    });
  }

  function sidebarCollapsedNow() {
    var app = document.querySelector(".app");
    return !!app && app.classList.contains("is-sidebar-collapsed");
  }

  function readSidebarCollapsed() {
    try { return UiLabels.sidebarCollapsedFromStorage(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)); }
    catch (_) { return false; }
  }

  function writeSidebarCollapsed(collapsed) {
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed === true ? "1" : "0"); }
    catch (_) { /* 存储不可用：本次会话仍可切换，只是不持久化 */ }
  }

  /** 应用收起态（不负责持久化）：类 + 两枚按钮的显隐/aria（展开按钮始终在内容区左上可达）。 */
  function applySidebarCollapsed(collapsed) {
    var value = collapsed === true;
    var app = document.querySelector(".app");
    if (app) app.classList.toggle("is-sidebar-collapsed", value);
    var expand = $("sidebar-expand"), collapse = $("sidebar-collapse");
    if (expand) { expand.hidden = !value; expand.setAttribute("aria-expanded", String(!value)); }
    if (collapse) { collapse.hidden = value; collapse.setAttribute("aria-expanded", String(!value)); }
  }

  function toggleSidebar() {
    var chat = $("chat"), top = chat ? chat.scrollTop : 0;
    var next = !sidebarCollapsedNow();
    applySidebarCollapsed(next);
    writeSidebarCollapsed(next);
    if (chat) chat.scrollTop = top; // 先量后改：正文列宽不变，滚动位置保持
  }

  function initSidebar() {
    applySidebarWidth(readSidebarWidth()); // 默认 248；坏值/越界 clamp
    initSidebarResizer();
    applySidebarCollapsed(readSidebarCollapsed()); // 默认展开；坏值回退展开
    var collapse = $("sidebar-collapse"), expand = $("sidebar-expand");
    if (collapse) collapse.addEventListener("click", toggleSidebar);
    if (expand) expand.addEventListener("click", toggleSidebar);
  }

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
    $("composer-scope").textContent = (role ? role.roleId : "未选择角色") + " / " + Rt.runtimeLabel(state.runtime);
    $("inp-message").placeholder = role ? "给" + role.roleId + "发送消息…" : "选择角色后发送消息…";
    renderContextState(role ? role.roleId : null);
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
    var action = governanceActionVisible();
    var title, sub, cta, hint = "";
    if (state.projectRoot && state.hasRoles === false) {
      // S0（客户裁定原文，逐字不变）：未-bootstrap 这件事只说一遍，只在中栏正中。
      title = "项目尚未 bootstrap";
      sub = "与 " + esc(primary) + " 对话，让它把角色建出来；左树会随之长出。";
    } else if (action === "reaccept") {
      // pin-mismatch（评审 §5.4）：沿用 su 空态宿主，文案全部来自 ui-labels。
      var record = governanceRecordOf();
      var gv = UiLabels.governancePinMismatchEmptyState(record.pinCount, record.pinFiles);
      title = esc(gv.title);
      sub = esc(gv.sub);
      hint = esc(gv.hint);
    } else if (action === "establish") {
      // S1（I4，2026-10-17）：su 空态改为治理记录引导（沿用 primaryRoleId，不硬编码角色名）。
      var gv1 = UiLabels.governanceEmptyState(projectRoleCount(), primary);
      title = esc(gv1.title);
      sub = esc(gv1.sub);
    } else {
      title = "选择左侧角色开始聊天";
      sub = "消息直接发送，无需确认；写入由治理引擎在后台把关。";
    }
    if (state.projectRoot && state.hasRoles === false) {
      cta = state.projectRoot && primary
        ? '<button id="btn-start-primary" class="btn btn-primary btn-start">开始与 ' + esc(primary) + " 对话</button>"
        : "";
    } else if (action === "reaccept") {
      cta = '<button class="btn btn-primary btn-start" type="button" data-governance-reaccept>检查并重新接受</button>';
    } else if (action === "establish") {
      cta = '<button class="btn btn-primary btn-start" type="button" data-governance-establish>建立治理记录</button>';
    } else {
      cta = state.projectRoot && primary
        ? '<button id="btn-start-primary" class="btn btn-primary btn-start">开始与 ' + esc(primary) + " 对话</button>"
        : "";
    }
    return '<div class="chat-empty">' +
      '<p class="empty-title">' + title + "</p>" +
      '<p class="empty-sub">' + sub + "</p>" +
      (hint !== "" ? '<p class="empty-hint">' + hint + "</p>" : "") +
      cta +
      "</div>";
  }

  /** 给某个容器里的空状态主按钮挂上点击（对 #chat 与各 pane 通用；容器内查询，避免同名 id 混指）。 */
  function bindEmptyState(container) {
    var b = container.querySelector(".chat-empty #btn-start-primary");
    if (b) {
      b.addEventListener("click", function () { selectRole(state.primaryRoleId); });
    }
    var g = container.querySelector(".chat-empty [data-governance-establish]");
    if (g) g.addEventListener("click", openGovernancePreview);
    var r = container.querySelector(".chat-empty [data-governance-reaccept]");
    if (r) r.addEventListener("click", openGovernancePreview);
  }

  // —————— I4 治理记录（2026-10-17 客户批准 B+C；设计评审 §二 I4 / §4.2 / §4.5）——————
  // 状态值原样转自 `listProject.governanceRecord`（桌面窗口派生）；**动作可见谓词唯一入口** =
  // `UiLabels.governanceActionFor`——本文件不另立判据（S1 = `hasRoles === true && missing`；
  // pin-mismatch = `reaccept`；未知状态一律 null）。预览/建立/重新接受通道按契约名消费，不另起别名。
  var governanceFlow = {
    open: false, loading: false, busy: false,
    mode: "establish", // "establish" | "reaccept"——共用 #governance-preview 宿主与取消/关闭
    preview: null, error: null, result: null,
  };

  function governanceRecordOf() {
    var r = state.governanceRecord;
    return r && typeof r === "object" ? r : { state: "present" };
  }

  function governanceActionVisible() {
    return UiLabels.governanceActionFor(
      typeof state.projectRoot === "string" && state.projectRoot !== "",
      state.hasRoles,
      governanceRecordOf().state
    );
  }

  /** S1 文案用的**项目角色**数（I4 实机缺陷修正：`state.roles` 含内置 su——只数 `builtIn !== true`；
   *  过滤单点在 `UiLabels.projectRoleCount`，此处只喂当前枚举）。 */
  function projectRoleCount() {
    return UiLabels.projectRoleCount(state.roles);
  }

  /** 状态行/预览面板的宿主：均**非模态**。状态行挂在既有提示条 `.session-notice` 里（同一位置，
   *  不新增模态/弹窗）；预览面板紧随提示条之后（空态/状态区展开）。 */
  function ensureGovernanceUi() {
    var notice = document.querySelector(".session-notice");
    if (!notice) return null;
    var status = $("governance-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "governance-status";
      status.className = "governance-status";
      status.hidden = true;
      status.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest
          ? e.target.closest("[data-governance-establish], [data-governance-reaccept]")
          : null;
        if (btn) openGovernancePreview();
      });
      notice.appendChild(status);
    }
    var preview = $("governance-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "governance-preview";
      preview.className = "governance-preview";
      preview.hidden = true;
      preview.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-governance-establish]")) confirmGovernanceEstablish();
        else if (t.closest("[data-governance-reaccept]")) confirmGovernanceReaccept();
        else if (t.closest("[data-governance-recheck]")) openGovernancePreview();
        else if (t.closest("[data-governance-cancel]")) cancelGovernancePreview();
        else if (t.closest("[data-governance-dismiss]")) closeGovernancePreview();
      });
      notice.parentNode.insertBefore(preview, notice.nextSibling);
    }
    return { status: status, preview: preview };
  }

  /** 状态行文案：reaccept＝不一致说明＋「检查并重新接受」；S1＝说明＋「建立治理记录」；
   *  invalid＝原因原文＋「本版不自动覆盖」（无动作）；present / S0＝不显示。 */
  function governanceStatusHtml() {
    var action = governanceActionVisible();
    if (action === "reaccept") {
      var mismatch = governanceRecordOf();
      return '<span class="gs-text">' + esc(UiLabels.governancePinMismatchText(mismatch.pinCount, mismatch.pinFiles)) + "</span>" +
        '<button class="btn btn-primary btn-mini" type="button" data-governance-reaccept>检查并重新接受</button>';
    }
    if (action === "establish") {
      return '<span class="gs-text">' + esc(UiLabels.governanceMissingText(projectRoleCount())) + "</span>" +
        '<button class="btn btn-primary btn-mini" type="button" data-governance-establish>建立治理记录</button>';
    }
    var record = governanceRecordOf();
    if (state.projectRoot && record.state === "invalid") {
      return '<span class="gs-text gs-invalid">' + esc(UiLabels.governanceInvalidText(record.reason)) + "</span>";
    }
    return "";
  }

  function normalizeGovernancePreview(p) {
    var src = p && typeof p === "object" ? p : {};
    var list = function (v) {
      return Array.isArray(v) ? v.map(function (x) { return String(x == null ? "" : x); }) : [];
    };
    return {
      projectRoot: typeof src.projectRoot === "string" ? src.projectRoot : "",
      governanceBoundaryRel: typeof src.governanceBoundaryRel === "string" ? src.governanceBoundaryRel : "",
      writePaths: list(src.writePaths),
      pinPaths: list(src.pinPaths),
      roleIds: list(src.roleIds),
      adoptExistingGovernanceDoc: src.adoptExistingGovernanceDoc === true,
      acceptanceSource: typeof src.acceptanceSource === "string" ? src.acceptanceSource : "",
      legacyBoundaryRoleIds: list(src.legacyBoundaryRoleIds),
    };
  }

  /** pin 恢复预览的形状归一（`GovernanceReacceptPreview`；缺字段 fail-closed：canConfirm=false）。 */
  function normalizeGovernanceReacceptPreview(p) {
    var src = p && typeof p === "object" ? p : {};
    var list = function (v) {
      return Array.isArray(v) ? v.map(function (x) { return String(x == null ? "" : x); }) : [];
    };
    var changed = Array.isArray(src.changed) ? src.changed.map(function (f) {
      var x = f && typeof f === "object" ? f : {};
      return {
        path: typeof x.path === "string" ? x.path : "",
        pinned: typeof x.pinned === "string" ? x.pinned : "",
        actual: typeof x.actual === "string" ? x.actual : null,
        status: typeof x.status === "string" ? x.status : "",
      };
    }) : [];
    var blockers = Array.isArray(src.blockers) ? src.blockers.map(function (b) {
      var x = b && typeof b === "object" ? b : {};
      return {
        code: typeof x.code === "string" ? x.code : "",
        paths: list(x.paths),
        message: typeof x.message === "string" ? x.message : "",
      };
    }) : [];
    return {
      projectRoot: typeof src.projectRoot === "string" ? src.projectRoot : "",
      writePaths: list(src.writePaths),
      pinPaths: list(src.pinPaths),
      pinCount: typeof src.pinCount === "number" && isFinite(src.pinCount) ? Math.floor(src.pinCount) : 0,
      changed: changed,
      canConfirm: src.canConfirm === true,
      blockers: blockers,
      previewDigest: typeof src.previewDigest === "string" ? src.previewDigest : "",
    };
  }

  function governancePathList(paths) {
    if (!paths.length) return '<span class="gp-list">（无）</span>';
    return '<span class="gp-list">' + paths.map(function (p) { return esc(p); }).join("<br>") + "</span>";
  }

  /** 预览面板 HTML（非模态）：将写路径 / 将 pin 的对象与角色数 / 是否采纳既有治理边界文档 /
   *  授权来源逐字 / 旧格式提示 / 「不扩大、不修改」声明 / [建立治理记录] [取消]。 */
  function governancePreviewHtml() {
    var f = governanceFlow;
    if (f.mode === "reaccept") return governanceReacceptPreviewHtml(f);
    var html = '<p class="gp-title">建立治理记录（预览）</p>';
    if (f.loading) {
      return html + '<p class="gp-note">正在读取预览…</p>' +
        '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
    }
    if (f.result) {
      var cls = f.result.kind === "success" ? "gp-success" : "gp-error";
      html += f.result.lines.map(function (line) { return '<p class="' + cls + '">' + esc(line) + "</p>"; }).join("");
      if (f.result.kind === "success" || f.result.noRetry) {
        html += '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-dismiss>关闭</button></div>';
      } else {
        html += '<div class="gp-actions">' +
          '<button class="btn btn-primary btn-mini" type="button" data-governance-establish>建立治理记录</button>' +
          '<button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
      }
      return html;
    }
    if (f.error) {
      html += '<p class="gp-error">' + esc(f.error.message) + "</p>";
      if (f.error.detail) html += '<p class="gp-note">' + esc(f.error.detail) + "</p>";
      return html + '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
    }
    var p = f.preview;
    html += '<p class="gp-line">将写入：' + governancePathList(p.writePaths) + "</p>";
    html += '<p class="gp-line">将 pin 的对象（' + p.pinPaths.length + " 项）及角色（" + p.roleIds.length + " 个）：" +
      governancePathList(p.pinPaths) + "</p>";
    html += '<p class="gp-line">' + (p.adoptExistingGovernanceDoc
      ? "将采纳既有治理边界文档（不覆盖其内容）。"
      : "将写入治理边界文档：" + esc(p.governanceBoundaryRel) + "。") + "</p>";
    html += '<p class="gp-line">授权来源（逐字）：' + esc(p.acceptanceSource) + "</p>";
    if (p.legacyBoundaryRoleIds.length) {
      html += '<p class="gp-line gp-legacy">以下角色的边界仍是旧版 Markdown，将被原样 pin：' +
        esc(p.legacyBoundaryRoleIds.join("、")) + "（迁移属后续版本）</p>";
    }
    html += '<p class="gp-declare">不扩大任何角色写边界、不修改任何角色边界文件内容。</p>';
    html += '<div class="gp-actions">' +
      '<button class="btn btn-primary btn-mini" type="button" data-governance-establish' + (f.busy ? " disabled" : "") + ">" +
      (f.busy ? "正在建立治理记录…" : "建立治理记录") + "</button>" +
      '<button class="btn btn-ghost btn-mini" type="button" data-governance-cancel' + (f.busy ? " disabled" : "") + ">取消</button></div>";
    return html;
  }

  /**
   * pin 恢复预览（与建立共用 #governance-preview 宿主；非模态）。全部业务文案来自
   * `UiLabels.governanceReacceptPreviewView`；`canConfirm === false` ⇒ 确认按钮 disabled 并列出 blockers。
   */
  function governanceReacceptPreviewHtml(f) {
    var view = UiLabels.governanceReacceptPreviewView(f.preview);
    var html = '<p class="gp-title">' + esc(view.title) + "</p>";
    if (f.loading) {
      return html + '<p class="gp-note">正在读取预览…</p>' +
        '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
    }
    if (f.result) {
      var cls = f.result.kind === "success" ? "gp-success" : "gp-error";
      html += f.result.lines.map(function (line) { return '<p class="' + cls + '">' + esc(line) + "</p>"; }).join("");
      if (f.result.kind === "success" || f.result.noRetry) {
        html += '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-dismiss>关闭</button></div>';
      } else {
        html += '<div class="gp-actions">' +
          '<button class="btn btn-primary btn-mini" type="button" data-governance-recheck>重新检查</button>' +
          '<button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
      }
      return html;
    }
    if (f.error) {
      html += '<p class="gp-error">' + esc(f.error.message) + "</p>";
      if (f.error.detail) html += '<p class="gp-note">' + esc(f.error.detail) + "</p>";
      return html + '<div class="gp-actions"><button class="btn btn-ghost btn-mini" type="button" data-governance-cancel>取消</button></div>';
    }
    view.fileLines.forEach(function (line) {
      html += '<p class="gp-line gp-file">' + esc(line.text) + "</p>";
    });
    html += '<p class="gp-line">' + esc(view.writeLine) + "</p>";
    html += '<p class="gp-line">' + esc(view.pinLine) + "</p>";
    html += '<p class="gp-declare">' + esc(view.warning) + "</p>";
    if (!view.canConfirm) {
      view.blockerLines.forEach(function (line) {
        html += '<p class="gp-line gp-blocker">' + esc(line) + "</p>";
      });
    }
    var confirmDisabled = f.busy || !view.canConfirm;
    html += '<div class="gp-actions">' +
      '<button class="btn btn-primary btn-mini" type="button" data-governance-reaccept' + (confirmDisabled ? " disabled" : "") + ">" +
      (f.busy ? "正在重新接受…" : "确认接受") + "</button>" +
      '<button class="btn btn-ghost btn-mini" type="button" data-governance-cancel' + (f.busy ? " disabled" : "") + ">取消</button></div>";
    return html;
  }

  /** 重画状态行与预览面板（状态行变化会引起 `.session-notice` 高度变化——沿用 U1 的「量—写—补」）。 */
  function renderGovernanceUi() {
    var ui = ensureGovernanceUi();
    if (!ui) return;
    var pin = noticeLayoutPin();
    var html = governanceStatusHtml();
    ui.status.hidden = html === "";
    ui.status.innerHTML = html;
    if (!governanceFlow.open) {
      ui.preview.hidden = true;
      ui.preview.innerHTML = "";
    } else {
      ui.preview.hidden = false;
      ui.preview.innerHTML = governancePreviewHtml();
    }
    restickAfterNoticeChange(pin);
  }

  /** 空态文案刷新（治理记录状态变化后，已存在的空态要跟着换；有内容的 pane 不动）。 */
  function refreshEmptyStates() {
    var chat = $("chat");
    if (chat) {
      var direct = chat.firstElementChild;
      if (direct && direct.classList.contains("chat-empty")) {
        chat.innerHTML = emptyStateHtml();
        bindEmptyState(chat);
      }
    }
    Object.keys(chatPanes).forEach(function (key) {
      var pane = chatPanes[key];
      if (!pane || !pane.querySelector(".chat-empty")) return;
      pane.querySelector(".chat-empty").outerHTML = emptyStateHtml();
      bindEmptyState(pane);
    });
  }

  /** 点「建立治理记录」/「检查并重新接受」/空态主按钮 → 先取预览（非模态展开），**不直接写入**。 */
  async function openGovernancePreview() {
    var action = governanceActionVisible();
    if (!action) return;
    var reaccept = action === "reaccept";
    var projectRoot = state.projectRoot;
    governanceFlow.open = true;
    governanceFlow.mode = reaccept ? "reaccept" : "establish";
    governanceFlow.loading = true;
    governanceFlow.busy = false;
    governanceFlow.preview = null;
    governanceFlow.error = null;
    governanceFlow.result = null;
    renderGovernanceUi();
    var res;
    try {
      if (reaccept) {
        if (!d || typeof d.previewGovernanceReacceptance !== "function") {
          res = { ok: false, status: "invalid-request", message: "预览通道不可用（桌面窗口尚未接线）。" };
        } else {
          res = await d.previewGovernanceReacceptance(projectRoot);
        }
      } else if (!d || typeof d.previewGovernanceRecord !== "function") {
        res = { ok: false, code: "unavailable", message: "预览通道不可用（桌面窗口尚未接线）。" };
      } else {
        res = await d.previewGovernanceRecord(projectRoot);
      }
    } catch (err) {
      res = reaccept
        ? { ok: false, status: "invalid-request", message: err && err.message ? String(err.message) : String(err) }
        : { ok: false, code: "error", message: err && err.message ? String(err.message) : String(err) };
    }
    if (projectRoot !== state.projectRoot) return; // 换项目后丢弃旧响应
    governanceFlow.loading = false;
    if (!res || res.ok !== true) {
      if (reaccept) {
        var status = res && typeof res.status === "string" ? res.status : "";
        var message = res && typeof res.message === "string" && res.message !== "" ? res.message : "预览失败。";
        var view = UiLabels.governanceReacceptFailureView("guard", status, message);
        governanceFlow.error = {
          message: view.lines.length ? view.lines[0] : message,
          detail: view.lines.slice(1).join(" "),
        };
        renderGovernanceUi();
        if (status === "no-record" || status === "invalid-record") void refreshListingQuietly(projectRoot);
        return;
      }
      var code = res && typeof res.code === "string" ? res.code : "";
      var detail = code ? "错误码：" + code : "";
      if (code === "already-established") detail += "（治理记录已存在；本次未写入任何文件。）";
      else if (code === "invalid-record") detail += "（治理记录不可用；本版不自动覆盖。）";
      else if (code === "busy") detail += "（上一次建立仍在进行中；本次未写入任何文件。）";
      governanceFlow.error = {
        message: res && typeof res.message === "string" && res.message !== "" ? res.message : "预览失败。",
        detail: detail,
      };
      renderGovernanceUi();
      if (code === "already-established" || code === "invalid-record") void refreshListingQuietly(projectRoot);
      return;
    }
    governanceFlow.preview = reaccept
      ? normalizeGovernanceReacceptPreview(res.preview)
      : normalizeGovernancePreview(res.preview);
    renderGovernanceUi();
  }

  /** 取消：关闭面板，**不调用任何 IPC**（建立/重新接受均不调），如实提示零副作用。 */
  function cancelGovernancePreview() {
    if (governanceFlow.busy) return;
    governanceFlow.open = false;
    governanceFlow.loading = false;
    governanceFlow.mode = "establish";
    governanceFlow.preview = null;
    governanceFlow.error = null;
    governanceFlow.result = null;
    renderGovernanceUi();
    setHint("已取消，未写入任何文件。");
  }

  function closeGovernancePreview() {
    governanceFlow.open = false;
    governanceFlow.loading = false;
    governanceFlow.busy = false;
    governanceFlow.mode = "establish";
    governanceFlow.preview = null;
    governanceFlow.error = null;
    governanceFlow.result = null;
    renderGovernanceUi();
  }

  async function refreshListingQuietly(projectRoot) {
    try {
      var list = await d.listProject(projectRoot);
      if (projectRoot !== state.projectRoot) return;
      if (list && typeof list === "object") applyListing(list, false);
    } catch (_) { /* 刷新失败不覆盖已如实显示的失败文案 */ }
  }

  /** 确认建立：按钮 disabled＋「正在建立治理记录…」；成功只认 `phase === "write" && status === "completed"`。 */
  async function confirmGovernanceEstablish() {
    if (!governanceFlow.open || governanceFlow.busy) return;
    if (!governanceFlow.preview || governanceFlow.mode !== "establish" || governanceActionVisible() !== "establish") return;
    var projectRoot = state.projectRoot;
    governanceFlow.busy = true;
    governanceFlow.result = null;
    renderGovernanceUi();
    var res;
    try {
      if (!d || typeof d.establishGovernanceRecord !== "function") {
        res = { ok: false, phase: "guard", code: "unavailable", finalize: { status: "blocked", message: "建立通道不可用（桌面窗口尚未接线）。" } };
      } else {
        res = await d.establishGovernanceRecord(projectRoot);
      }
    } catch (err) {
      res = { ok: false, phase: "guard", code: "error", finalize: { status: "blocked", message: err && err.message ? String(err.message) : String(err) } };
    }
    if (projectRoot !== state.projectRoot) return;
    governanceFlow.busy = false;
    var finalize = res && res.finalize && typeof res.finalize === "object" ? res.finalize : {};
    var phase = res && (res.phase === "write" || res.phase === "precheck" || res.phase === "guard") ? res.phase : "guard";
    var code = res && typeof res.code === "string" ? res.code : "";
    var message = typeof finalize.message === "string" ? finalize.message : "";
    if (res && res.ok === true && phase === "write" && finalize.status === "completed") {
      governanceFlow.result = {
        kind: "success",
        lines: [message, "治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。"].filter(function (line) { return line !== ""; }),
      };
      renderGovernanceUi();
      void refreshListingQuietly(projectRoot); // 刷新后状态变 present，动作隐藏
      return;
    }
    // 失败：逐字显示 finalize.message；`phase` 是「是否零副作用」的唯一依据（写入阶段失败不得宣称零副作用）。
    if (message === "" && phase === "write") {
      message = "写入阶段中断（主进程未返回 finalize.message）；可能已写入部分文件，请重新执行或核对现场。";
    } else if (message === "") {
      message = "建立失败（主进程未返回 finalize.message）。";
    }
    governanceFlow.result = governanceFailureResult(phase, code, message);
    renderGovernanceUi();
    if (governanceFlow.result.noRetry) void refreshListingQuietly(projectRoot);
  }

  function governanceFailureResult(phase, code, message) {
    var view = UiLabels.governanceFailureView(phase, code, message);
    return { kind: "failure", lines: view.lines, noRetry: view.noRetry };
  }

  /**
   * 确认重新接受（评审 §5.4）：只从**本次预览**取 `previewDigest` 回传；成功/失败后**不伪造刷新**——
   * 由主进程 `project:changed` 驱动重新 `listProject`（状态回 present、动作消失）。
   * `phase` 是「是否零副作用」的唯一依据；`phase === "write"` 不提供重试（可能已部分落盘）。
   */
  async function confirmGovernanceReaccept() {
    if (!governanceFlow.open || governanceFlow.busy) return;
    if (!governanceFlow.preview || governanceFlow.mode !== "reaccept" || governanceActionVisible() !== "reaccept") return;
    var preview = governanceFlow.preview;
    var digest = typeof preview.previewDigest === "string" ? preview.previewDigest : "";
    if (!/^[0-9a-fA-F]{64}$/.test(digest) || preview.canConfirm !== true) return;
    var projectRoot = state.projectRoot;
    governanceFlow.busy = true;
    governanceFlow.result = null;
    renderGovernanceUi();
    var res;
    try {
      if (!d || typeof d.reacceptGovernancePins !== "function") {
        res = { ok: false, status: "invalid-request", phase: "guard", message: "重新接受通道不可用（桌面窗口尚未接线）。", wrote: [] };
      } else {
        res = await d.reacceptGovernancePins(projectRoot, digest);
      }
    } catch (err) {
      res = {
        ok: false, status: "blocked", phase: "guard",
        message: err && err.message ? String(err.message) : String(err), wrote: [],
      };
    }
    if (projectRoot !== state.projectRoot) return;
    governanceFlow.busy = false;
    var phase = res && (res.phase === "write" || res.phase === "precheck" || res.phase === "guard") ? res.phase : "guard";
    var status = res && typeof res.status === "string" ? res.status : "";
    var message = res && typeof res.message === "string" ? res.message : "";
    if (res && res.ok === true && status === "completed") {
      var changedCount = Array.isArray(preview.changed) ? preview.changed.length : 0;
      setHint(""); // 清掉先前的「已取消」提示，避免成功文案旁残留矛盾的零写入提示
      governanceFlow.result = {
        kind: "success",
        lines: [UiLabels.governanceReacceptSuccessText(preview.pinCount, changedCount)],
      };
      renderGovernanceUi();
      // 不在此自行改状态/伪造刷新：主进程写后 emitProjectChanged → 重新 listProject。
      return;
    }
    if (message === "" && phase === "write") {
      message = "写入阶段中断（主进程未返回 message）；可能已写入部分文件，请核对现场。";
    } else if (message === "") {
      message = "重新接受失败（主进程未返回 message）。";
    }
    var view = UiLabels.governanceReacceptFailureView(phase, status, message);
    governanceFlow.result = { kind: "failure", lines: view.lines, noRetry: view.noRetry };
    renderGovernanceUi();
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
      sessionOpenRoleId: state.sessionOpenRoleId, shellConfirm: state.shellConfirm, recoveryConfirm: state.recoveryConfirm, chatPanes: chatPanes, paneRowLists: paneRowLists, paneAnchors: paneAnchors,
      opRequests: opRequests, replayState: replayState, activityOpen: activityOpen, groupSeqByRole: groupSeqByRole,
      groupIdentitiesByRole: groupIdentitiesByRole, drawerReading: drawerReading, composerDrafts: composerDrafts,
      withdrawPending: withdrawPending, withdrawFeedback: withdrawFeedback, lastManualSend: lastManualSend,
      liveReplayCounts: liveReplayCounts, manualMessages: manualMessages, reportCards: reportCards, deliveryCards: deliveryCards, persistenceCache: persistenceCache };
  }

  function installRuntimeView(view) {
    var v = view || {};
    state.liveRoles = v.liveRoles || [];
    ["roleMeta", "roleBusy", "queueByRole", "queueItemsByRole", "runningByRole"].forEach(function (key) { state[key] = v[key] || Object.create(null); });
    state.sessionOpenRoleId = v.sessionOpenRoleId || null;
    state.shellConfirm = v.shellConfirm || null;
    state.recoveryConfirm = v.recoveryConfirm || null;
    chatPanes = v.chatPanes || Object.create(null); paneRowLists = v.paneRowLists || Object.create(null);
    paneAnchors = v.paneAnchors || Object.create(null); opRequests = v.opRequests || Object.create(null);
    replayState = v.replayState || Object.create(null); activityOpen = v.activityOpen || Object.create(null);
    groupSeqByRole = v.groupSeqByRole || Object.create(null); groupIdentitiesByRole = v.groupIdentitiesByRole || Object.create(null);
    drawerReading = v.drawerReading || Object.create(null); composerDrafts = v.composerDrafts || Object.create(null);
    withdrawPending = v.withdrawPending || Object.create(null); withdrawFeedback = v.withdrawFeedback || Object.create(null);
    liveReplayCounts = v.liveReplayCounts || Object.create(null); manualMessages = v.manualMessages || Object.create(null);
    reportCards = v.reportCards || Object.create(null); deliveryCards = v.deliveryCards || Object.create(null); persistenceCache = v.persistenceCache || Object.create(null);
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
    invalidateDocumentRead();
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
    $("recovery-confirm").hidden = true;
    if (state.recoveryConfirm) renderRecoveryConfirm(state.recoveryConfirm);
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
    // S1：合并行以首相位下标承载 data-activity-index（捕获口径不变）；phases 属性兜底任一相位下标。
    var el = saved.sub != null ? rec.el.querySelector('[data-activity-index="' + saved.sub + '"], [data-activity-phases~="' + saved.sub + '"]') : null;
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
    closeRecoveryConfirm();
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
    reportCards = Object.create(null); deliveryCards = Object.create(null); persistenceCache = Object.create(null);
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
    flushDeferredFolds(); // 工具行折叠口径：轮结束折叠在该批尾、贴底之后落地（批内折叠会撞中间态布局，见 foldTurnGroups）
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
      turnId: typeof o.turnId === "string" ? o.turnId : "", assistantText: o.assistantText === true, originalOpen: o.originalOpen === true, originalFlags: o.originalFlags || "",
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

  /** 助手行元素构造（唯一构造点）。**2026-10-17 修订**：三种适配器只发**完整消息**
   *  （Pi `message_end` / Codex `item/completed` / Claude assistant text block），渲染层没有增量文本
   *  更新——`appendAssistant` 新建行恒 `mdReady: true`，此处**即时 Markdown**。
   *  下面的 `mdReady === false` 分支仅作**旧行/异常行安全网**（唯一用途；正常路径不可达），
   *  不构成第二套正常渲染路径；`upgradeStreamingMarkdown` 会在 settle 时把旧行升为 Markdown。 */
  function buildAssistantRow(rec) {
    var div = document.createElement("div");
    div.className = "msg msg-assistant";
    if (rec.mdReady) {
      div.innerHTML = Md.renderMarkdown(rec.data); // B-1：受控 Markdown（先转义后解析）
    } else {
      div.classList.add("is-streaming"); // 安全网专用（旧 `.is-streaming` 样式仅服务此分支）
      div.textContent = String(rec.data == null ? "" : rec.data);
    }
    return div;
  }

  function appendAssistant(pane, text, turnId) {
    // Q-1/Q-2（2026-10-17 修订）：**完整消息 ⇒ 即时 Markdown**——不再按 `roleBusy` 退化为纯文本，
    // 也不等 settled 升级；离屏行仍由行表惰性 build（窗口化语义不变）。
    var pin = streamShouldPin(pane); // S-1：**先量后挂**（在底部附近才贴底；上翻不打断）
    registerRow(
      pane,
      buildAssistantRow,
      60,
      { kind: "assistant", data: text, mdReady: true, turnId: turnId, assistantText: true }
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

  function terminalFact(event) {
    if (!event || ["denied", "settled"].indexOf(event.kind) < 0 || typeof event.turnId !== "string" || !event.turnId || Tr.isToolActivity(event)) return null;
    var outcome = event.detail && event.detail.outcome;
    return ["completed", "failed", "aborted", "timed_out"].indexOf(outcome) >= 0 ? { turnId: event.turnId, outcome: outcome } : null;
  }
  function buildTurnTerminal(rec) {
    var div = document.createElement("div"), texts = [];
    div.className = "sys sys-call turn-terminal";
    div.dataset.turnId = rec.data.turnId; div.dataset.outcome = rec.data.outcome;
    // 身份已由实际turn/outcome确定；这里只让同一生命周期的相同摘要读一次，不用于识别或删除别的事实。
    rec.data.sources.forEach(function (source) { if (texts.indexOf(source.text) < 0) texts.push(source.text); });
    div.innerHTML = '<span class="sys-ico">' + (rec.data.outcome === "completed" ? ICONS.call : ICONS.deny) + '</span><div class="sys-text">' + texts.map(function (text) { return '<div>' + esc(text) + '</div>'; }).join("") + '</div>';
    return div;
  }
  function appendTurnTerminal(pane, event, previousData) {
    var identity = terminalFact(event); if (!identity) return false;
    var rl = rowListFor(pane), reading = captureChatReading(pane), pin = streamShouldPin(pane);
    var rec = rl.rows.find(function (row) { return row.kind === "turn-terminal" && row.data.turnId === identity.turnId && row.data.outcome === identity.outcome; });
    var sourceToken = event.kind === "denied" ? rowReplayToken : null;
    if (!rec && sourceToken && rl.tokenRows) {
      var existing = rl.tokenRows[Rt.tokenId(sourceToken)];
      if (existing && existing.kind === "system" && existing.data.cls === "sys-call") rec = existing;
    }
    var isNew = !rec;
    var data = rec && rec.kind === "turn-terminal" ? rec.data : previousData || { turnId: identity.turnId, outcome: identity.outcome, sources: [] };
    if (!data.sources.some(function (source) { return source.kind === event.kind && source.text === event.summary; })) data.sources.push({ kind: event.kind, text: String(event.summary || ""), replayToken: sourceToken });
    if (!rec) rec = registerRow(pane, buildTurnTerminal, 34, { kind: "turn-terminal", data: data, replayToken: sourceToken });
    else {
      rec.kind = "turn-terminal"; rec.data = data; rec.build = buildTurnTerminal;
      if (rec.el) { var updated = buildTurnTerminal(rec); rec.el.className = updated.className; rec.el.dataset.turnId = data.turnId; rec.el.dataset.outcome = data.outcome; rec.el.innerHTML = updated.innerHTML; }
      refreshActivityHeight(pane, rec, reading);
    }
    data.sources.forEach(function (source) { if (source.replayToken) { (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(source.replayToken)] = rec; if (!rec.replayToken) rec.replayToken = source.replayToken; } });
    if (isNew) scrollBottom(pane, pin);
    return true;
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

  // —————— G-5 wave 2（推理折叠行；客户 2026-10-16 批准 G-5「按推荐批准，开始实施」）——————
  // 行形＝「已思考 N 秒 ▸」（文案单点在 `tool-rows.js::reasoningLabel`）：**默认折叠（含运行中）**——
  // 与工具行「运行中默认展开」的刻意差异（设计 §5.2：推理是长文本，运行中就铺＝与去噪目相悖；尾行转轮
  // 已在表达进行中）；点击展开＝`reasoning.text` **原文纯文本**（不做 Markdown——思考过程不是正式回复，
  // 视觉层级低于助手正文）。**不进工具组**（组语义＝「本轮 N 个调用」计数，推理不是工具调用；`registerRow`
  // 既有「非 activities 行切断组」语义即为「组外独立成行、真实序位」）、**不加 `[系统·]` 前缀**（那是投递面
  // 定格标记；推理属助手输出面）。开合**复用工具行折叠状态机**同一套：手动开合记 `activityOpen`（会话内
  // 保持、默认态不再覆盖该行）、程序化改动以 `data.open` 为守卫（不记成手动）、开合经
  // captureChatReading → 改 → refreshActivityHeight 的**阅读锚点零位移**语义；键盘焦点在行内不被自动
  // 动作打扰（无自动开合动作——本行到达即终形）。**批尾落地**：行走 `registerRow` 进场，布局由既有
  // `flushBatchSideEffects`/`updateVirtualWindow` 批尾统一落定（无计时器）。「轮结束定型」在 wave 2
  // 契约下无需动作：事实＝单段**完成**事件（complete/omitted＋可缺时长），行到达即终形（事件面无
  // 「思考中」相位——不发明中间态）。
  /** 行身份（供 `activityOpen` 手动开合会话内保持）：同轮第 N 段＝稳定序位（回放重建同序 ⇒ 同 id）；
   *  无轮次身份（防御）⇒ ephemeral 计数（与工具组同款兜底）。 */
  function reasoningRowId(rl, roleId, turnId) {
    if (typeof turnId === "string" && turnId !== "") {
      var ord = 1;
      for (var i = 0; i < rl.rows.length; i += 1) {
        if (rl.rows[i].kind === "reasoning" && rl.rows[i].data && rl.rows[i].data.turnId === turnId) ord += 1;
      }
      return "reasoning:" + turnId + ":" + ord;
    }
    return "reasoning-ephemeral-" + (groupSeqByRole[roleId] = (groupSeqByRole[roleId] || 0) + 1);
  }
  /** 追加一条推理行（entry＝{label, text, flags, foldable, turnId}——label/text 已由纯函数单点合成，
   *  不在此另写文案）。foldable=false（omitted/空正文/诊断形）⇒ 如实单行、不摆空展开器。 */
  function appendReasoningRow(pane, entry) {
    var roleId = pane.dataset.roleId || "";
    var rl = rowListFor(pane);
    var id = reasoningRowId(rl, roleId, entry.turnId);
    var opens = activityOpen[roleId] || (activityOpen[roleId] = Object.create(null));
    var manual = Object.prototype.hasOwnProperty.call(opens, id) ? opens[id] === true : null;
    var pin = streamShouldPin(pane); // S-1：先量后挂（在底部附近才贴底；上翻不打断）
    var rec = registerRow(pane, function (record) {
      var data = record.data;
      var el;
      if (data.foldable) {
        el = document.createElement("details");
        el.className = "reasoning-record";
        el.open = data.open === true; // 先 data 后 el（toggle 监听以 data.open 为程序化改动守卫，不记成手动）
        el.innerHTML =
          '<summary><span class="reasoning-label">' + esc(data.label) + "</span>" + ICONS.chev + "</summary>" +
          '<div class="reasoning-body">' + (data.flags ? '<span class="projection-flags">' + esc(data.flags) + "</span>" : "") + esc(data.text) + "</div>";
        el.addEventListener("toggle", function () {
          if (data.open === el.open) return;
          var reading = captureChatReading(pane);
          data.open = el.open;
          opens[data.id] = el.open; // 手动开合（会话内保持；默认态不再覆盖该行）
          refreshActivityHeight(pane, record, reading);
        });
      } else {
        el = document.createElement("div");
        el.className = "reasoning-record is-plain";
        el.innerHTML = '<div class="reasoning-line"><span class="reasoning-label">' + esc(data.label) + "</span></div>";
      }
      return el;
    }, 34, { kind: "reasoning", data: { id: id, turnId: entry.turnId, label: entry.label, text: entry.text, flags: entry.flags, foldable: entry.foldable === true, open: manual === true }, turnId: entry.turnId });
    scrollBottom(pane, pin);
    return rec;
  }
  /** live/replay 同解入口：从投影形 detail（或回放行携带的同形标量）渲染——文本一律 esc 纯文本。 */
  function appendReasoningFromDetail(pane, detail, turnId) {
    var facts = detail && detail.reasoning && typeof detail.reasoning === "object" ? detail.reasoning : null;
    var foldable = Tr.reasoningFoldable ? Tr.reasoningFoldable(facts) === true : false;
    appendReasoningRow(pane, {
      label: Tr.reasoningLabel ? Tr.reasoningLabel(facts) : "推理内容",
      text: foldable ? String(facts.text.text) : "",
      flags: foldable && Rt.textFlags ? Rt.textFlags(facts.text) : "",
      foldable: foldable,
      turnId: typeof turnId === "string" ? turnId : "",
    });
  }

  // —————— 工具行折叠的状态机（2026-10-16 客户批准口径）——————
  // 口径：**分组依据 = turnId**（组 = 同一轮内**连续**的工具行；卡片/助手行/关联不上的未放行行打断即另起
  // 一组——`registerRow` 的 `rl.activityGroup` 语义不变）。开合三规则：
  //   · **运行中不折叠**：该轮实时到达（live）、未 settled、本角色 busy ⇒ 默认**展开**（逐条实时可见）；
  //   · **轮结束后折叠成一行**：settled 到达 ⇒ 未手动开合过的组收为「本轮 N 个调用：…」一行（foldTurnGroups）；
  //   · **手动开合优先并在会话内保持**：用户点开/收起记入 `activityOpen`（既有机制），默认态不再覆盖
  //     （含 settled 折叠：读过的人不被自动收起）；键盘焦点在组内时同样不收（自动动作不吞焦点）。
  function groupManualOpen(roleId, id) {
    var opens = activityOpen[roleId];
    return opens && Object.prototype.hasOwnProperty.call(opens, id) ? opens[id] === true : null;
  }
  /** 默认开合：仅「实时到达（live）且该轮未 settled 且本角色 busy」的组默认展开——工具组自身判据；
   *  回放/无轮次身份/已 settle ⇒ 默认折叠。（2026-10-17：助手消息已即时 Markdown，不再共享流式判据。） */
  function groupDefaultOpen(pane, activity, rl) {
    var turnId = activity.turnId || "";
    if (activity.origin !== "live" || turnId === "") return false;
    if (rl.settledTurns && rl.settledTurns[turnId]) return false;
    return state.roleBusy[pane.dataset.roleId || ""] === true;
  }
  /** 组创建/追加后同步默认开合：手动开合过 ⇒ 不动；运行中被折叠（busy 快照晚到/回放重建）⇒ 重开。 */
  function syncGroupOpen(pane, rl, rec, activity) {
    if (groupManualOpen(pane.dataset.roleId || "", rec.data.id) !== null) return;
    var want = groupDefaultOpen(pane, activity, rl);
    if (rec.data.open === want) return;
    rec.data.open = want; // 先 data 后 el：toggle 监听以 data.open 为程序化改动守卫（不记成手动）
    if (rec.el) rec.el.open = want;
  }
  /** 轮结束折叠（settled 事件触发）：该轮所有仍展开的组收为折叠一行——先读锚点后改（captureChatReading →
   *  折叠 → 实测 → restoreChatReading，与手动开合同一套锚点语义）；组自身作锚时锚组行首（折叠一行形态）。
   *  **批内推迟到批尾**（2026-10-16 离线 e2e 实测）：折叠是布局变更——批内做会撞上「spacer 未落定」的
   *  中间态（阅读锚点恢复偏 6px）且折叠收缩尾段会令 appendTurnTerminal 的贴底判定误读「在底部」而强制
   *  贴底；改在 `flushBatchSideEffects` 收尾（贴底/窗口落定之后）落地，与手动开合（天然在批外）同一条件，
   *  锚点恢复精确（无计时器——renderer 无计时器纪律）。 */
  var deferredFolds = [];
  /** 批尾挂点：flushBatchSideEffects 的收尾（与贴底/窗口落定同一批尾，绝不用计时器——renderer 无计时器纪律）。 */
  function flushDeferredFolds() {
    if (!deferredFolds.length) return;
    var pending = deferredFolds;
    deferredFolds = [];
    for (var i = 0; i < pending.length; i += 1) foldTurnGroupsNow(pending[i].pane, pending[i].turnId);
  }
  function foldTurnGroups(pane, turnId) {
    if (!turnId) return;
    if (batchDepth > 0) { deferredFolds.push({ pane: pane, turnId: turnId }); return; }
    foldTurnGroupsNow(pane, turnId);
  }
  function foldTurnGroupsNow(pane, turnId) {
    if (!turnId) return;
    var rl = paneRowLists[pane.dataset.roleId];
    if (!rl) return;
    var changed = [];
    for (var i = 0; i < rl.rows.length; i += 1) {
      var rec = rl.rows[i];
      if (rec.kind !== "activities" || !rec.data || rec.data.turnId !== turnId) continue;
      if (rec.data.open !== true) continue;
      if (groupManualOpen(pane.dataset.roleId || "", rec.data.id) !== null) continue;
      if (rec.el && rec.el.contains(document.activeElement)) continue; // 键盘焦点在组内：自动动作不吞焦点
      changed.push(rec);
    }
    if (!changed.length) return;
    // 与手动开合**同序**（既有 toggle 路径：浏览器先翻转 `el.open`、监听器随后捕获阅读锚点再刷新）——
    // 先折叠（先 data 后 el：toggle 监听以 data.open 为程序化改动守卫），再捕获、再实测与恢复。
    // 离线 e2e（2026-10-16）：文档中部阅读态折叠锚点零位移（<2px，与既有开合标准同款）；尾部阅读态
    //（锚点下方不足一屏）按下限夹取自然移动（物理边界，任何文档尾收缩同此），不逐次累积。
    changed.forEach(function (rec) {
      rec.data.open = false;
      if (rec.el && rec.el.parentNode === pane) rec.el.open = false;
    });
    var reading = pane.parentNode === $("chat") ? captureChatReading(pane) : null;
    if (reading && reading.sub != null && changed.indexOf(reading.rec) >= 0) reading.sub = null;
    changed.forEach(function (rec, index) {
      if (index === changed.length - 1) refreshActivityHeight(pane, rec, reading);
      else {
        if (rec.el && rec.el.parentNode === pane) { var h = rowFootprint(rl, rec.el); if (h > 0) rec.h = h; }
        rec.measured = false;
      }
    });
  }

  /** 工具行折叠（2026-10-16 客户批准口径）：折叠行**文案**——「本轮 N 个调用：a / b ×k / c」+
   *  标注「 · 含 X 条未放行」「 · 含 Y 条失败」「 · 含状态未记录」（计数均来自 `Tr.callSummary` 单点，
   *  每次仅一条；信息零丢失：展开即逐条完整列表）。 */
  function foldSummaryText(sum) {
    var tools = sum.tools.map(function (t) { return t.name + (t.count > 1 ? " ×" + t.count : ""); }).join(" / ");
    var text = "本轮 " + (sum.calls + ' 个调用') + (tools ? "：" + tools : "");
    if (sum.denied > 0) text += " · 含 " + sum.denied + " 条未放行";
    if (sum.failed > 0) text += " · 含 " + sum.failed + " 条失败";
    if (sum.unknown) text += ' · 含状态未记录';
    return text;
  }

  function fillActivities(rec) {
    var data = rec.data;
    // S1/S4（2026-10-16 客户批准）+ 工具行折叠口径（2026-10-16 客户批准）：同一 toolCallId 的「调用发起 +
    // 结果（含未放行/失败相位）」并成**一行**（`Tr.mergePhases` 给出下标映射——`data.items` 本体与身份不动：
    // token→行映射、回放锚点、`data-legacy-index` 展开/物化全按下标照旧取用）；折叠行文案 =「本轮 N 个调用：
    // 工具分解」+ 未放行/失败/未知标注（`Tr.callSummary` 纯计数单点，失败/未知在**折叠摘要**仍可见；
    // 行态/目标以**终态为准**，未返回时即「调用发起」）。折叠/展开的默认态与时机见 `syncGroupOpen`/
    // `foldTurnGroups`（运行中展开·轮结束折叠；手动开合优先并在会话内保持）。
    var sum = Tr.callSummary(data.items);
    rec.el.innerHTML = '<summary><span class="record-count">' + esc(foldSummaryText(sum)) + '</span></summary>' + Tr.mergePhases(data.items).map(function (row) {
        // 相位按到达序；终态 = 末相位（其结果/标签为准，目标为空时回退首相位）。
        var phases = row.phases.map(function (i) { return data.items[i]; });
        var terminal = phases[phases.length - 1] || {};
        var first = phases[0] || terminal;
        var at = terminal.at || first.at || "";
        var target = terminal.target || first.target || "";
        var stateText = phases.map(function (a) { return a.label + (a.legacyStatusSource === 'legacy-classifier' ? ' · 旧文本分类' : ''); }).join(' → ');
        var isUnknown = phases.some(function (a) { return a.status === "unknown"; });
        return '<div class="tool-activity" title="' + esc(at || '') + '" data-activity-index="' + row.index + '" data-activity-phases="' + row.phases.join(' ') + '">' +
          '<span class="activity-time">' + esc(Rt.shortTime(at)) + '</span>' +
          '<span class="activity-op">' + esc(terminal.toolName || first.toolName) +
          '<span class="activity-target">' + esc(target || '目标未记录') + '</span></span>' +
          '<span class="activity-state' + (isUnknown ? ' is-unknown' : '') + '">' + esc(stateText) + '</span></div>' +
          // 各相位信息保留可展开：每相位（有安全详情/原记录投影者）各带自己的「折叠摘要」details（原下标，物化单点不变）。
          row.phases.map(function (i) {
            var a = data.items[i] || {};
            return (a.hasDisplay || a.legacyTextProjection) ? '<details class="legacy-tool-detail" data-legacy-index="' + i + '"' + (a.legacyOpen ? ' open' : '') + '><summary>查看已保存的安全详情</summary><div></div></details>' : '';
          }).join("");
      }).join("");
    rec.el.open = data.open;
    rec.el.querySelectorAll("[data-legacy-index]").forEach(function (details) {
      var activity = data.items[Number(details.dataset.legacyIndex)];
      function show() {
        activity.legacyOpen = details.open;
        var body = details.querySelector("div");
        if (details.open && !body.dataset.materialized) { body.innerHTML = toolDetails(activity) + displayField("历史原记录（安全显示）", activity.legacyTextProjection); body.dataset.materialized = "true"; }
        rec.measured = false;
        if (rec.pane && rec.pane.isConnected) refreshActivityHeight(rec.pane, rec, captureChatReading(rec.pane));
      }
      details.addEventListener("toggle", show);
      if (details.open) show();
    });
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
    var previousDetails = panel.querySelector(".operator-tool-details"), wasOpen = previousDetails && previousDetails.open;
    var focusedDetail = previousDetails && previousDetails.contains(document.activeElement);
    panel.textContent = ["blocked", "result"].filter(function (phase) { return entry.activityStages[phase]; }).map(function (phase) {
      var activity = entry.activityStages[phase];
      return activity.toolName + " · " + activity.label + (activity.exceptional ? "：" + (activity.deniedSummary || activity.visibleSummary) : "");
    }).join("；");
    panel.hidden = panel.textContent === "";
    var displayed = ["blocked", "result"].filter(function (phase) { return entry.activityStages[phase] && entry.activityStages[phase].hasDisplay; });
    if (displayed.length) {
      var detail = document.createElement("details"); detail.className = "operator-tool-details";
      detail.innerHTML = '<summary>查看安全执行详情</summary><div class="operator-safe-detail-body"></div>';
      function materializeOperatorDetails() {
        var body = detail.querySelector("div"); if (!detail.open || body.dataset.materialized) return;
        var pane = paneFor(entry.roleId), reading = captureChatReading(pane);
        body.innerHTML = displayed.map(function (phase) { return toolDetails(entry.activityStages[phase]); }).join(""); body.dataset.materialized = "true";
        var rl = paneRowLists[entry.roleId], rec = rl && rl.rows.find(function (record) { return record.requestId && opRequests[record.requestId] === entry; });
        if (rec && pane.isConnected) refreshActivityHeight(pane, rec, reading);
      }
      detail.addEventListener("toggle", materializeOperatorDetails);
      panel.appendChild(detail); panel.hidden = false;
      detail.open = wasOpen === true; if (detail.open) materializeOperatorDetails();
      if (focusedDetail) detail.querySelector("summary").focus({ preventScroll: true });
    }
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

  function displayField(label, value) {
    if (!value || typeof value.text !== "string") return "";
    return '<section class="tool-detail-field"><strong>' + esc(label) + '</strong><span class="projection-flags">' + esc(Rt.textFlags(value)) + '</span><pre>' + esc(value.text) + '</pre></section>';
  }
  function toolDetails(activity) {
    var display = activity.display;
    var statusSource = { "native-result": "状态来源：原生结果记录", "tool-details": "状态来源：工具明细记录", "legacy-classifier": "状态来源：旧文本分类，不是新机器执行事实" }[activity.legacyStatusSource];
    var targetSource = { argument: "目标来源：原参数记录", "tool-detail": "目标来源：工具明细记录", "same-call": "目标来源：同一真实调用记录" }[activity.legacyTargetSource];
    var notes = [statusSource, targetSource, Rt.metadataLabel(activity.metadataOmissions)].filter(Boolean).join("；");
    var metadata = notes ? '<p class="projection-flags">' + esc(notes) + '</p>' : "";
    if (!display) return metadata + '<p class="muted">' + (activity.displayUnsupported ? "不支持此详情版本。" : "这条历史没有保存更多目标和错误详情。") + '</p>';
    var html = display.target ? displayField(display.target.kind === "command" ? "实际命令" : "目标文件", display.target.value) : '<p class="muted">目标未保存</p>';
    // F-8-b（2026-10-16 批准）：非零退出中性类里 display.error 实为工具消息（投影回填），按「消息」如实标注——不叫「错误」。
    html += displayField(activity.status === "exited-nonzero" ? "消息" : "错误", display.error) + displayField("结果", display.resultText);
    var process = display.process;
    if (process) {
      if (typeof process.exitCode === "number") html += '<p>退出码：' + esc(process.exitCode) + '</p>';
      if (process.signal) html += '<p>信号：' + esc(process.signal) + '</p>';
      html += displayField("标准输出", process.stdout) + displayField("标准错误", process.stderr);
    }
    if (typeof display.durationMs === "number") html += '<p>耗时：' + esc(display.durationMs) + ' ms</p>';
    if (display.omissions && display.omissions.length) html += '<p class="muted">' + esc(display.omissions.map(function (reason) { return reason === "budget" ? "部分展示内容因预算省略" : reason === "unsupported-content" ? "非文本结果未展示" : "未支持的输入未展示"; }).join("；")) + '</p>';
    return metadata + html;
  }
  function refreshToolLifecycle(record, pane) {
    if (!record.el || record.kind === "operator") return;
    var stages = record.activityStages || {}, all = ["start", "blocked", "result"].filter(function (phase) { return stages[phase]; });
    var activity = stages.result || stages.blocked || stages.start;
    if (!activity) return;
    if (!all.some(function (phase) { return stages[phase].hasDisplay; })) {
      record.el.textContent = activity.toolName + " · " + all.map(function (phase) { var a = stages[phase]; return a.label + (a.exceptional ? "：" + (a.deniedSummary || a.visibleSummary) : ""); }).join("；"); return;
    }
    var old = record.el.querySelector("details"), open = old && old.open;
    var focus = old && old.contains(document.activeElement);
    var target = activity.fullTarget || stages.start && stages.start.fullTarget || "目标未保存";
    var timestamp = Rt.shortTime(activity.at);
    var label = all.map(function (phase) { return stages[phase].label; }).join(" → ");
    // F-8-b（2026-10-16 批准）：非零退出中性类不摆红色错误预览——进程正常跑完，退出码已在状态标签如实给出；
    // 其余类（失败/超时/拒绝）照旧显示首行原因/错误码。
    var errorPreview = activity.status === "exited-nonzero" ? "" : activity.display && activity.display.error ? reportText(activity.display.error).split(/\r?\n/)[0] : activity.errorCode || "";
    record.el.innerHTML = '<details class="tool-call-record"' + (open ? ' open' : '') + '><summary><span class="tool-call-time" title="' + esc(activity.at || "时间未保存") + '">' + esc(timestamp) + '</span><strong>' + esc(activity.toolName) + '</strong><span class="tool-call-target">' + esc(target) + '</span><span class="tool-call-status">' + esc(label) + '</span>' + (errorPreview ? '<span class="tool-call-error">' + esc(errorPreview.length > 180 ? errorPreview.slice(0,180) + '…' : errorPreview) + '</span>' : '') + '</summary><div class="tool-call-details"></div></details>';
    var details = record.el.querySelector("details"), body = record.el.querySelector(".tool-call-details");
    function materialize() {
      if (!details.open || body.dataset.materialized) return;
      var reading = captureChatReading(pane);
      body.innerHTML = all.map(function (phase) { return '<h4>' + esc(stages[phase].label) + '</h4>' + toolDetails(stages[phase]); }).join("");
      body.dataset.materialized = "true"; record.measured = false; if (pane.isConnected) refreshActivityHeight(pane, record, reading);
    }
    details.addEventListener("toggle", materialize);
    if (open) materialize();
    if (focus) record.el.querySelector("summary").focus({ preventScroll: true });
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
          record.el = el; el.addEventListener("toggle", function () { refreshActivityHeight(pane, record, captureChatReading(pane)); }, true); if (record.refreshLifecycle) record.refreshLifecycle(); return el;
        }, 34, { kind: "tool-lifecycle", data: null });
        lifecycle.activityStages = {};
        lifecycle.refreshLifecycle = function () { refreshToolLifecycle(lifecycle, pane); };
      }
      if (activity.hasDisplay) lifecycle.keepEl = true;
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
      // 工具行折叠口径（2026-10-16 客户批准）：**未放行/失败相位属同一次调用的相位**——该调用已有行在
      // 本组（同轮同 callId）时，相位并入该组行（S1 相位合并的完整形态：折叠行如实计「含 N 条未放行/
      // 失败」），组**不**因此切断（同轮后续调用仍并入同一条折叠行）；独立未放行行照旧（治理信号全量
      // 呈现：原因与允许路径不折叠）。无法关联（无 callId / 组内无该调用）⇒ 维持原行为：切断组 + 独立行。
      var assocGroup = null;
      if (activity.callId && rl.activityGroup && rl.activityGroup.data && rl.activityGroup.data.turnId === activity.turnId) {
        for (var ai = 0; ai < rl.activityGroup.data.items.length; ai += 1) {
          var assocItem = rl.activityGroup.data.items[ai];
          if (assocItem && assocItem.callId === activity.callId && assocItem.turnId === activity.turnId) { assocGroup = rl.activityGroup; break; }
        }
      }
      if (!assocGroup) rl.activityGroup = null;
      appendDenied(pane, activity.deniedSummary || activity.visibleSummary || activity.toolName + ' · ' + activity.label, activity.fullTarget, activity);
      var deniedRec = rl.rows[rl.rows.length - 1]; deniedRec.toolActivity = activity; rememberActivities(rl, deniedRec);
      if (assocGroup) {
        var assocPin = streamShouldPin(pane), assocReading = !assocPin ? captureChatReading(pane) : null;
        assocGroup.data.items.push(activity);
        if (activity.replayToken) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(activity.replayToken)] = assocGroup;
        syncGroupOpen(pane, rl, assocGroup, activity);
        if (assocGroup.el) fillActivities(assocGroup);
        rememberActivities(rl, assocGroup); // 身份映射以组为准：该调用的再投递走组内就地更新（不重复独立行）
        refreshActivityHeight(pane, assocGroup, assocReading);
        scrollBottom(pane, assocPin);
      }
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
      var manual = Object.prototype.hasOwnProperty.call(opens, id) ? opens[id] === true : null;
      rec = registerRow(pane, function (record) {
        var el = document.createElement("details");
        el.className = "tool-records";
        record.el = el; record.pane = pane;
        fillActivities(record);
        el.addEventListener("toggle", function () {
          if (record.data.open === el.open) return;
          var reading = captureChatReading(pane);
          record.data.open = el.open;
          opens[record.data.id] = el.open; // 手动开合（会话内保持；默认态不再覆盖该组）
          refreshActivityHeight(pane, record, reading);
        });
        return el;
      }, 38, { kind: "activities", data: { id: id, items: [activity], open: manual !== null ? manual : groupDefaultOpen(pane, activity, rl), turnId: activity.turnId } });
      rl.activityGroup = rec;
    } else {
      rec.data.items.push(activity);
      if (activity.replayToken) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(activity.replayToken)] = rec;
      if (!rec.data.turnId && activity.turnId) rec.data.turnId = activity.turnId;
      syncGroupOpen(pane, rl, rec, activity); // 运行中保持逐条实时（展开）；手动开合优先
      if (rec.el) fillActivities(rec);
      refreshActivityHeight(pane, rec, saved);
    }
    rec.pane = pane;
    rememberActivities(rl, rec);
    scrollBottom(pane, pin);
    return rec;
  }

  /** 拒绝事件：内联显示，点击可展开看完整信息（含按根分组的允许路径）。 */
  function appendDenied(pane, text, target, activity) {
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
        if (activity && (activity.hasDisplay || activity.legacyTextProjection)) {
          var body = det.querySelector(".sys-detail"); body.textContent = "";
          det.addEventListener("toggle", function () {
            if (!det.open || body.dataset.materialized) return;
            var reading = captureChatReading(pane);
            body.innerHTML = toolDetails(activity) + displayField("历史原记录（安全显示）", activity.legacyTextProjection); body.dataset.materialized = "true";
            var rl = rowListFor(pane), record = rl.rows.find(function (item) { return item.el === det; }); if (record) refreshActivityHeight(pane, record, reading);
          });
        }
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
  var reportCards = Object.create(null), deliveryCards = Object.create(null), persistenceCache = Object.create(null);
  function storageKey(scope, id) { return JSON.stringify([scope.projectRoot, scope.roleId, scope.runtime, id]); }
  function reportText(value) { return value && typeof value.text === "string" ? value.text : ""; }
  function reportDeclaration(report) {
    var labels = { completed: "已完成", blocked: "被拦下", unreported: "未报告", failed: "失败", aborted: "已中止" };
    var origin = report.origin === "submitted-report" ? "报告声明：" : report.origin === "terminal-fallback" ? "系统按终态记录：" : "来源未确认：";
    return origin + (labels[report.status] || "未知状态");
  }
  function reportBody(report, includeSave) {
    if (!report || report.reportId && report.version !== 1) return '<p>不支持此报告版本，未生成成果摘要。</p>';
    var full = reportText(report.summary), preview = Array.from(full).slice(0, 180).join("").split(/\r?\n/).slice(0, 4).join("\n"), folded = preview.length < full.length;
    var evidence = report.evidence || [], flags = Rt.textFlags(report.summary);
    var evidenceFlags = evidence.some(function (item) { return item.truncated; }) ? "部分证据显示已截断" : "";
    if (evidence.some(function (item) { return item.redacted; })) evidenceFlags += (evidenceFlags ? "；" : "") + "部分证据已净化";
    return '<div class="report-top"><div class="report-eyebrow">来源 ' + esc(report.source && report.source.roleId || "未知") + ' · ' + esc(report.origin === "submitted-report" ? "正式回交" : report.origin === "terminal-fallback" ? "终态记录" : "来源未确认") + '</div><h2 class="report-title">任务报告</h2><div class="hb-head"><strong>' + esc(reportDeclaration(report)) + '</strong></div><p class="hb-meta">' + esc(report.source && report.source.runtime ? Rt.runtimeLabel(report.source.runtime) : "引擎未知") + ' · ' + esc(report.taskId ? "任务 " + report.taskId : "任务关联未知") + '</p></div><div class="report-body"><div class="excerpt-label">报告原文摘录</div><div class="hb-summary card-md">' + Md.renderMarkdown(preview) + '</div><p class="projection-flags">' + esc([flags, folded ? "摘要已折叠，完整可用显示副本见下方" : "", evidenceFlags, report.evidenceOmitted ? "另有 " + report.evidenceOmitted + " 条证据因预算省略" : ""].filter(Boolean).join("；")) + '</p><dl class="report-facts">' + (includeSave ? '<div><dt>报告存储</dt><dd><div class="persistence-state" role="status" aria-live="polite"></div></dd></div>' : '') + '<div><dt>独立验收</dt><dd>尚未确认</dd></div></dl><p class="report-disclaimer">以上为报告或终态记录，不等于独立验收通过。</p><div class="report-actions"><details class="report-complete"><summary>查看完整报告摘要与证据</summary><div class="report-complete-body"><div class="hb-complete-summary card-md">' + Md.renderMarkdown(full) + '</div><p class="projection-flags">' + esc(flags) + '</p><ul class="hb-evidence">' + (evidence.length ? evidence.map(function (item) { return '<li>' + esc(reportText(item)) + '<small class="projection-flags">' + esc(Rt.textFlags(item)) + '</small></li>'; }).join("") : '<li>（未提供证据）</li>') + '</ul></div></details></div></div>';
  }
  function bindReportReading(card, pane) {
    card.querySelectorAll("details").forEach(function (details) { details.addEventListener("toggle", function () {
      var rl = paneRowLists[pane.dataset.roleId], rec = rl && rl.rows.find(function (row) { return row.el === card; });
      if (rec) refreshActivityHeight(pane, rec, captureChatReading(pane));
    }); });
  }
  function taskTurn(rec) {
    if (!rec.replayToken) return null;
    try { var key = JSON.parse(rec.replayToken.key); return key[0] === "input" ? key[1] : null; } catch (_) { return null; }
  }
  function applyReportedTask(pane, turnId, receiver) {
    if (typeof turnId !== "string" || !turnId) return;
    var rl = rowListFor(pane), reading = captureChatReading(pane);
    if (receiver) (rl.deliveryTurns || (rl.deliveryTurns = Object.create(null)))[turnId] = true;
    receiver = !!(rl.deliveryTurns && rl.deliveryTurns[turnId]);
    if (!receiver) (rl.reportedTurns || (rl.reportedTurns = Object.create(null)))[turnId] = true;
    rl.rows.forEach(function (rec) {
      var reply = rec.assistantText && rec.turnId === turnId && (rec.origin === "history" || rl.settledTurns && rl.settledTurns[turnId]);
      var task = !receiver && taskTurn(rec) === turnId && rec.kind !== "injected";
      if ((!reply && !task) || reply && rec.replyFolded || task && rec.taskRequest) return;
      var previousBuild = rec.build;
      if (reply) { rec.replyFolded = true; rec.deliveryReply = receiver; } else rec.taskRequest = true;
      rec.keepEl = true;
      rec.build = function (record) { return wrapTaskRequest(previousBuild(record), record, reply); };
      if (rec.el) { var previous = rec.el, parent = previous.parentNode, next = previous.nextSibling; rec.el = wrapTaskRequest(previous, rec, reply); if (parent) parent.insertBefore(rec.el, next); }
      refreshActivityHeight(pane, rec, reading);
    });
  }
  function wrapTaskRequest(content, record, reply) {
    var className = reply ? "reply-original" : "task-request";
    if (content.classList.contains(className)) return content;
    var details = document.createElement("details"); details.className = className; details.open = record.originalOpen === true;
    var summary = document.createElement("summary"); summary.textContent = reply ? record.deliveryReply ? "本轮回交处理回复原文（展开）" : "本轮角色回复原文（展开）" : "任务请求原文"; if (record.originalFlags) { var flags = document.createElement("small"); flags.className = "original-flags projection-flags"; flags.textContent = record.originalFlags; summary.appendChild(flags); } details.appendChild(summary);
    var body = document.createElement("div"); body.className = "task-request-body"; body.appendChild(content); details.appendChild(body);
    details.addEventListener("toggle", function () { record.originalOpen = details.open; var pane = details.closest(".chat-pane"), rl = pane && paneRowLists[pane.dataset.roleId], rec = rl && rl.rows.find(function (row) { return row.el === details; }); if (rec) { rec.originalOpen = details.open; refreshActivityHeight(pane, rec, captureChatReading(pane)); } });
    return details;
  }

  function sourceDocumentButton(report, container) {
    var roleId = report.source && report.source.roleId;
    if (!roleId || report.reportId && report.version !== 1) return;
    var button = document.createElement("button"); button.type = "button"; button.className = "btn report-source-button"; button.textContent = "查看来源角色文档";
    button.addEventListener("click", function () { documentList(roleId, button, "report"); }); var actions = container.querySelector(".report-actions"); if (actions) actions.insertBefore(button, actions.firstChild); else container.appendChild(button);
  }
  function findCardRecord(entry) {
    var rl = paneRowLists[entry.scope.roleId];
    return rl && rl.pane === entry.pane ? rl.rows.find(function (row) { return row.el === entry.card; }) : null;
  }
  function updatePersistenceCard(entry) {
    var state = entry.saveState || {}, target = entry.target;
    var panel = entry.card.querySelector(".persistence-state"); if (!panel) return;
    var hadFocus = panel.contains(document.activeElement);
    var reading = captureChatReading(entry.pane);
    var text = entry.pending ? target ? "正在保存历史…" : "正在保存报告…" : Rt.persistenceLabel(state, target);
    var retry = target ? state.history === "failed" && state.retryHistoryAvailable : state.state === "failed" && state.retryAvailable;
    var supported = entry.capabilities && (target ? entry.capabilities.deliveryHistorySaveSupported : entry.capabilities.reportSaveSupported);
    var receipt = entry.lastReceipt;
    var receiptOutcomeLabel = receipt && ({ completed: "已完成", failed: "失败", aborted: "已中止", timed_out: "运行超时" }[receipt.outcome] || receipt.outcome);
    var historyLabel = entry.pending ? "正在保存历史…" : state.history === "saved" || state.history === "already-saved" ? "已保存" : text;
    var inputLabel = receipt ? receipt.inputSaved === true ? "已保存" : receipt.history === "disabled" ? "未启用历史保存" : "尚未保存" : "未确认";
    var outcomeLabel = receipt ? receipt.outcome ? receiptOutcomeLabel : receipt.providerMayHaveStarted ? "可能已开始，结果未确认" : "尚未交给Provider" : "未确认";
    var execution = target ? '<dl class="report-facts delivery-batch-facts"><div><dt>接收历史</dt><dd class="persistence-message" tabindex="-1">' + esc(historyLabel) + '</dd></div><div><dt>目标输入记录</dt><dd>' + esc(inputLabel) + '</dd></div><div><dt>目标轮次结果</dt><dd>' + esc(outcomeLabel) + '</dd></div></dl>' : "";
    var signature = JSON.stringify([text, execution, entry.error || "", !!retry, !!supported, !!entry.pending]);
    if (entry.renderSignature === signature) return;
    entry.renderSignature = signature;
    panel.innerHTML = (target ? execution : '<span class="persistence-message" tabindex="-1">' + esc(text) + '</span>') + (target && state.history === "failed" ? '<p class="muted small">补存已有记录，不再次执行或投递。</p>' : '') + (entry.error ? '<p class="persistence-error">' + esc(entry.error) + '</p>' : '');
    if (retry && supported && entry.id) {
      var button = document.createElement("button"); button.type = "button"; button.className = "btn btn-ghost btn-mini"; button.textContent = target ? "重试保存历史" : "重试保存报告"; button.disabled = entry.pending === true;
      button.addEventListener("click", function () { void persistenceAction(entry, true); }); panel.appendChild(button);
    }
    if (hadFocus) {
      var focus = !entry.pending && retry && supported ? panel.querySelector("button") : panel.querySelector(".persistence-message");
      if (focus) focus.focus({ preventScroll: true });
    }
    var rec = findCardRecord(entry); if (rec) refreshActivityHeight(entry.pane, rec, reading);
  }
  function persistenceValue(entry, value) {
    if (!value) return;
    if (entry.target && (value.receipt && value.receipt.version !== 1 || value.history && value.version !== undefined && value.version !== 1)) {
      entry.error = "不支持此接收回执版本。"; entry.capabilities = null; updatePersistenceCard(entry); return;
    }
    if (entry.target && (value.receipt && value.receipt.version === 1 || value.version === 1 && value.history)) entry.lastReceipt = value.receipt || value;
    var next = entry.target ? value.receipt || (value.history ? value : null) : value;
    if (entry.target && ["expired", "unsupported", "disabled", "failed"].indexOf(value.state) >= 0) next = { history: value.state, retryHistoryAvailable: value.retryAvailable === true, code: value.code };
    if (!next) {
      if (value.state === "expired" || value.state === "unsupported" || value.state === "disabled") next = entry.target ? { history: value.state, retryHistoryAvailable: false, code: value.code } : value;
      else return;
    }
    if (entry.target && next.attemptId && next.attemptId !== entry.id || !entry.target && next.reportId && next.reportId !== entry.id) return;
    if (next.state === "already-saved") next = Object.assign({}, next, { state: "saved" });
    var previous = entry.saveState || {};
    // 成功存储事实不被迟到pending/failed覆盖，expired仍撤销恢复能力。
    if ((previous.history || previous.state) === "saved" && ["saved", "already-saved", "expired"].indexOf(next.history || next.state) < 0) return;
    entry.saveState = next; entry.error = null; updatePersistenceCard(entry);
  }
  async function persistenceAction(entry, retry) {
    if (!entry.id || entry.pending) return;
    var root = state.projectRoot, generation = projectGeneration, sequence = (entry.requestVersion || 0) + 1;
    entry.requestVersion = sequence;
    var request = { version: 1, projectRoot: entry.scope.projectRoot, roleId: entry.scope.roleId, runtime: entry.scope.runtime };
    request[entry.target ? "attemptId" : "reportId"] = entry.id;
    var operation = retry ? entry.target ? "retryDeliveryHistorySave" : "retryReportSave" : entry.target ? "getDeliveryReceipt" : "getReportSaveState";
    if (!d[operation]) { entry.capabilities = null; updatePersistenceCard(entry); return; }
    if (retry) { entry.pending = true; updatePersistenceCard(entry); }
    try {
      if (!retry && d.getSessionPersistence) {
        var caps = await d.getSessionPersistence({ version: 1, projectRoot: request.projectRoot, roleId: request.roleId, runtime: request.runtime });
        if (caps && caps.ok && caps.version === 1 && caps.scope && storageKey(caps.scope, "") === storageKey(entry.scope, "")) entry.capabilities = caps.value;
      }
      var result = await d[operation](request);
      if (root !== state.projectRoot || generation !== projectGeneration || entry.requestVersion !== sequence) return;
      if (!result || result.version !== 1 || result.ok && !result.scope || result.scope && storageKey(result.scope, "") !== storageKey(entry.scope, "")) throw new Error();
      if (!result.ok) {
        entry.error = ({ SNAPSHOT_EXPIRED: "可补存的会话材料已失效，无法在此补存。", SESSION_NOT_AVAILABLE: "当前没有原会话可供保存恢复。", UNSUPPORTED: "当前会话不支持此保存恢复能力。", PROJECT_NOT_ACTIVE: "项目已失效。", INVALID_REQUEST: "保存请求无效。" })[result.code] || "无法取得保存状态。";
        entry.capabilities = null;
      } else persistenceValue(entry, result.value); // 外层ok不等于内层保存成功。
    } catch (_) { if (root === state.projectRoot && entry.requestVersion === sequence) entry.error = "保存状态请求失败。"; }
    finally { entry.pending = false; if (root === state.projectRoot && entry.requestVersion === sequence) updatePersistenceCard(entry); }
  }
  function onPersistenceUpdate(payload) {
    if (!payload || payload.version !== 1 || !payload.scope || payload.scope.projectRoot !== state.projectRoot || !payload.change) return;
    var change = payload.change;
    if (!change.scope || change.scope.roleId !== payload.scope.roleId || change.scope.runtime !== payload.scope.runtime) return;
    deliverRuntimePayload({ projectRoot: payload.scope.projectRoot, roleId: payload.scope.roleId, runtime: payload.scope.runtime }, function () {
      var target = change.kind === "delivery-history-save";
      if (!target && change.kind !== "report-save") return;
      var id = target ? change.attemptId : change.reportId;
      if (typeof id !== "string" || !id) return;
      var key = storageKey(payload.scope, id);
      var entry = (target ? deliveryCards : reportCards)[key];
      var value = target ? change.state === "expired" ? { state: "expired", receipt: change.receipt, retryAvailable: false, code: change.code } : change.receipt || { history: change.state, retryHistoryAvailable: change.retryAvailable, code: change.code } : change.state;
      persistenceCache[key] = value;
      if (entry) persistenceValue(entry, value);
    });
  }
  function appendHandback(pane, report, persistence) {
    if (!report || !report.source || report.source.roleId !== pane.dataset.roleId || report.source.runtime && report.source.runtime !== state.runtime || typeof report.summary !== "object" || report.reportId && report.version !== 1) return;
    applyReportedTask(pane, report.source.turnId);
    var scope = { projectRoot: state.projectRoot, roleId: report.source.roleId, runtime: report.source.runtime || state.runtime };
    var key = report.reportId && storageKey(scope, report.reportId), existing = key && reportCards[key];
    if (existing) { existing.pane = pane; if (!findCardRecord(existing)) registerRow(pane, function () { return existing.card; }, 190, { keepEl: true, kind: "handback" }); if (persistence) persistenceValue(existing, persistence); return; }
    var card = document.createElement("div"); card.className = "msg-handback" + (report.status !== "completed" ? " is-blocked" : "");
    card.innerHTML = reportBody(report, true);
    sourceDocumentButton(report, card);
    bindReportReading(card, pane);
    applyReportedTask(pane, report.source.turnId);
    var entry = { card: card, pane: pane, report: report, scope: scope, id: report.reportId, target: false, saveState: persistence || { state: report.reportId ? "saved" : "unknown-live", retryAvailable: false } };
    if (key) reportCards[key] = entry;
    updatePersistenceCard(entry);
    var pin = streamShouldPin(pane); registerRow(pane, function () { return card; }, 190, { keepEl: true, kind: "handback" }); scrollBottom(pane, pin);
    if (key && persistenceCache[key]) persistenceValue(entry, persistenceCache[key]);
    if (key) void persistenceAction(entry, false);
    updateWorkReports(scope.roleId);
  }
  function appendDelivery(pane, input, text, projection, turnId) {
    var provenance = input && input.inputProvenance, presentation = input && input.inputPresentation;
    if (!provenance && !presentation) return false;
    var value = provenance || presentation;
    if (value.version !== 1 || !Array.isArray(value.reports)) return false;
    applyReportedTask(pane, turnId, true);
    var scope = { projectRoot: state.projectRoot, roleId: pane.dataset.roleId, runtime: state.runtime };
    var id = value.attemptId, key = storageKey(scope, id || "live:" + (turnId || ""));
    if (deliveryCards[key]) { var previous = deliveryCards[key]; previous.pane = pane; if (!findCardRecord(previous)) registerRow(pane, function () { return previous.card; }, 170, { keepEl: true, kind: "injected" }); return true; }
    var card = document.createElement("div"); card.className = "msg-injected msg-delivery";
    card.innerHTML = '<p>回交投递 · 本批 ' + value.reports.length + ' 份（不表示全部收齐）</p>';
    value.reports.forEach(function (report) { var body = document.createElement("section"); body.className = "delivery-report"; body.innerHTML = reportBody(report, false); sourceDocumentButton(report, body); card.appendChild(body); });
    var details = document.createElement("details"); details.className = "safe-input-copy";
    var summary = document.createElement("summary"); summary.textContent = "交接内容（安全显示副本）"; details.appendChild(summary);
    var flag = document.createElement("p"); flag.className = "projection-flags"; flag.textContent = "此处未记录完整模型输入" + (projection && projection.redacted ? " · 已净化" : "") + (projection && projection.truncated ? " · 显示副本已截断" : "") + (projection && projection.summaryTruncated ? " · 摘要已截断" : ""); details.appendChild(flag);
    var pre = document.createElement("pre"); pre.textContent = projection && projection.version === 1 && projection.source === "trusted-handback-display" && projection.modelInputRecorded === false ? text : "交接内容安全显示副本未提供，不能显示完整模型输入。"; details.appendChild(pre); card.appendChild(details);
    bindReportReading(card, pane);
    var panel = document.createElement("div"); panel.className = "persistence-state"; panel.setAttribute("role", "status"); panel.setAttribute("aria-live", "polite"); card.insertBefore(panel, card.querySelector(".delivery-report") || card.querySelector(".safe-input-copy"));
    var entry = { card: card, pane: pane, reports: value.reports, scope: scope, id: id, target: true, saveState: { history: presentation ? "disabled" : "pending", retryHistoryAvailable: false } };
    deliveryCards[key] = entry; updatePersistenceCard(entry);
    var pin = streamShouldPin(pane); registerRow(pane, function () { return card; }, 170, { keepEl: true, kind: "injected" }); scrollBottom(pane, pin);
    if (persistenceCache[key]) persistenceValue(entry, persistenceCache[key]);
    if (id) void persistenceAction(entry, false);
    updateWorkReports(scope.roleId);
    return true;
  }
  function applyDeliveryReceipt(pane, receipt) {
    if (!receipt || receipt.version !== 1) return;
    var scope = { projectRoot: state.projectRoot, roleId: pane.dataset.roleId, runtime: state.runtime }, key = storageKey(scope, receipt.attemptId);
    persistenceCache[key] = receipt;
    if (deliveryCards[key]) persistenceValue(deliveryCards[key], receipt);
  }

  // —————— shell 命令确认卡（M-1，2026-10-12 客户裁定「这个太丑了」）：应用内卡片替代原生对话框 ——————
  // 三层闸 (a) 层：命令原文**逐字**呈在等宽 `<pre>`；白话摘要与人话版「为什么问你」由**主进程**推来
  // （行话不外露，见 operator-channel.ts 的 `shellIntentSummary`/`plainReasonFor`）；argv/cwd 折叠在「详情」。
  // **fail-closed**：拒绝为**默认焦点**；关闭（×）/ Esc / 「拒绝」一律回 `{allow:false}`——恰 `allow:true`
  // 才可能放行。渲染侧**只呈现**：不做任何命令判定；回传失败/失效时如实标记（**绝不**呈现为「已放行」）。
  // **无计时器**（G-1 纪律）：本卡不按时间自我定格——超时判定在主进程通道侧（超时 = 不放行）。
  var SHELL_CONFIRM_DEFAULT_HINT = "点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。";
  // su 审批卡（2026-10-17 PM 评审 §3.6）：必备风险披露——shell 不受文件写边界约束，客户审批是唯一闸。
  var SU_APPROVAL_WARNING = "批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。";

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
    // su 审批卡与项目角色三层链卡：同组件、不同标题/档位/披露；project/旧请求逐字保持既有行为。
    var suApproval = payload.policy === "su-approval";
    $("sc-title").textContent = UiLabels.shellConfirmTitle(payload.policy);
    // 命令**逐字原文**：textContent 落入（无 HTML 注入口——不美化、不改写、不截断）。
    $("sc-command").textContent = typeof payload.command === "string" ? payload.command : "";
    var summary = typeof payload.summary === "string" && payload.summary !== "" ? payload.summary : "";
    var tierLabel = suApproval ? UiLabels.suApprovalTierLabel(payload.tier) : "";
    var summaryText = suApproval && tierLabel ? (summary ? tierLabel + " · " + summary : tierLabel) : summary;
    var sumEl = $("sc-summary");
    sumEl.textContent = summaryText;
    sumEl.hidden = summaryText === ""; // 无从安全概括 ⇒ 只显示命令本体（绝不编意图）
    // 高风险原因：su 卡把 `reasonRaw`（如「命中硬拒程序规则：reshell」）作为**可见**单独一行；
    // 项目卡保持原文：reasonPlain 可见、reasonRaw 仍只在折叠详情里。
    var reasonText = typeof payload.reasonPlain === "string" ? payload.reasonPlain : "";
    if (suApproval && typeof payload.reasonRaw === "string" && payload.reasonRaw !== "") {
      reasonText += (reasonText ? "\n" : "") + "命中原因：" + payload.reasonRaw;
    }
    $("sc-reason").textContent = reasonText;
    $("sc-cwd").textContent = typeof payload.cwd === "string" ? payload.cwd : "";
    $("sc-argv").textContent = Array.isArray(payload.argvLines) ? payload.argvLines.join("\n") : "";
    var raw = typeof payload.reasonRaw === "string" && payload.reasonRaw !== "" ? "审核原文（内部用语，仅供核查）：" + payload.reasonRaw : "";
    var rawEl = $("sc-reason-raw");
    rawEl.textContent = raw;
    rawEl.hidden = raw === "";
    $("sc-details").open = false; // 技术详情**默认收起**（每次来新请求都复位）

    var overlay = $("shell-confirm");
    overlay.hidden = false;
    overlay.classList.toggle("is-su-approval", suApproval);
    syncDrawerModal();
    overlay.classList.remove("is-expired");
    $("sc-hint").textContent = (suApproval ? SU_APPROVAL_WARNING + " " : "") + SHELL_CONFIRM_DEFAULT_HINT;
    $("sc-deny").disabled = cur.busy;
    $("sc-allow").disabled = cur.busy;
    $("sc-close").disabled = cur.busy;
    if (cur.expiredReason) markShellConfirmExpired(cur.expiredReason);
    $("sc-deny").focus(); // 拒绝为默认焦点（fail-closed 的 UI 侧同向）——su 卡同样不得默认批准
  }

  function closeShellConfirm() {
    if (!backgroundDelivery) $("shell-confirm").hidden = true;
    state.shellConfirm = null;
    syncDrawerModal();
    if (!backgroundDelivery && state.rightTab !== null) $("drawer-close").focus({ preventScroll: true });
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

  // —————— 恢复确认卡（G-2/U1，2026-10-16 客户批准；设计 §6.2「提议 → 一键确认 → 应用执行 → 回执」）——————
  // su 只能**提议**恢复动作（{abort-turn / rebuild-session / redeliver}）；本卡是客户的一键确认处——
  // **恰 `{allow:true}`（点「执行」）才可能执行**；取消 / Esc / 关闭（×）一律回 `{allow:false}` = 未获执行
  // （fail-closed；取消为默认焦点）。呈现面 = 主进程推来的数据面：动作 / 目标角色 / 证据**逐字**
  // （textContent 落入，无 HTML 注入口）；动作人话标签与后果说明走 `ui-labels.js` 的纯映射
  // （未知动作只呈现原始 token——不假装认识）。**等待不设限**（裁定 4；无计时器——G-1 纪律）。
  //
  // 数据形状（**以桌面窗口 W5 交回说明为准**；未落树前按设计 §6.1/§6.2 提案形状实现，交回已标注待接）：
  //   `recovery:confirm-request`（preload `onRecoveryConfirm(cb)`）推：
  //   `{ id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId? }`
  //   ——`evidence` 逐字；`requestedBy`/`requestedAt`/`itemId` 可选（缺省则对应位隐藏，不假装有值）。
  //   `recovery:confirm-response`（preload `recoveryConfirmRespond({id, allow})`）回报：
  //   `{ ok:true }` | `{ ok:false, expired:true }` | `{ ok:false, error }`——同 shell 卡回包口径。
  //   通道缺席（W5 未落树）⇒ 不订阅、零影响（fail-closed：无卡可点即无执行路径）。
  var RECOVERY_CONFIRM_DEFAULT_HINT = "点「取消」、按 Esc 或关闭本框 = 不执行；仅点「执行」才会执行。";

  function onRecoveryConfirm(payload) {
    if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || payload.id === "") return;
    if (!Rt.matchesView(payload, state.projectRoot, state.runtime)) return;
    var cur = state.recoveryConfirm;
    if (!cur || cur.id !== payload.id) cur = { id: payload.id, busy: false, runtime: state.runtime, projectRoot: state.projectRoot, roleId: payload.roleId, payload: payload };
    state.recoveryConfirm = cur;
    if (!backgroundDelivery) renderRecoveryConfirm(cur);
  }

  /** 时间本地化（同 queueTimeText 口径：解析不了 ⇒ 空——不假装有时间）。 */
  function recoveryTimeText(at) {
    if (typeof at !== "string" || at === "") return "";
    var t = new Date(at);
    return isNaN(t.getTime()) ? "" : t.toLocaleString();
  }

  function renderRecoveryConfirm(cur) {
    var payload = cur.payload;
    var action = typeof payload.action === "string" ? payload.action : "";
    var view = typeof UiLabels.recoveryActionView === "function" ? UiLabels.recoveryActionView(action) : null;
    // 动作行：有人话标签 ⇒ 标签 + 原始 token；未知动作 ⇒ **只**呈现原始 token（不编语义）。
    $("rc-action").textContent = view ? "动作：" + view.label + "（" + action + "）" : "动作：" + action;
    $("rc-note").textContent = view ? view.note : "";
    $("rc-note").hidden = !view;
    $("rc-role").textContent = "目标角色：" + (typeof payload.roleId === "string" && payload.roleId !== "" ? payload.roleId : "(未标识)");
    // 证据**逐字**：textContent 落入（无 HTML 注入口——不美化、不改写、不截断）。
    $("rc-evidence").textContent = typeof payload.evidence === "string" ? payload.evidence : "";
    var reason = typeof payload.reason === "string" && payload.reason !== "" ? "原因（提议方提供）：" + payload.reason : "";
    var reasonEl = $("rc-reason");
    reasonEl.textContent = reason;
    reasonEl.hidden = reason === "";
    // 可选元数据（仅呈现主进程推来的值；缺省即隐藏——不假装有值）。
    var by = typeof payload.requestedBy === "string" && payload.requestedBy !== "" ? "提议方：" + payload.requestedBy : "";
    var at = recoveryTimeText(payload.requestedAt);
    at = at === "" ? "" : "提议时间：" + at;
    var item = typeof payload.itemId === "string" && payload.itemId !== "" ? "目标条目：" + payload.itemId : "";
    [["rc-by", by], ["rc-at", at], ["rc-item", item]].forEach(function (pair) {
      $(pair[0]).textContent = pair[1];
      $(pair[0]).hidden = pair[1] === "";
    });
    $("rc-details").hidden = by === "" && at === "" && item === "";
    $("rc-details").open = false; // 技术详情**默认收起**（每次来新请求都复位）

    var overlay = $("recovery-confirm");
    overlay.hidden = false;
    syncDrawerModal();
    overlay.classList.remove("is-expired");
    $("rc-hint").textContent = RECOVERY_CONFIRM_DEFAULT_HINT;
    $("rc-deny").disabled = cur.busy;
    $("rc-allow").disabled = cur.busy;
    $("rc-close").disabled = cur.busy;
    if (cur.expiredReason) markRecoveryConfirmExpired(cur.expiredReason);
    $("rc-deny").focus(); // 取消为默认焦点（fail-closed 的 UI 侧同向：默认不执行）
  }

  function closeRecoveryConfirm() {
    if (!backgroundDelivery) $("recovery-confirm").hidden = true;
    state.recoveryConfirm = null;
    syncDrawerModal();
    if (!backgroundDelivery && state.rightTab !== null) $("drawer-close").focus({ preventScroll: true });
  }

  /** 卡片终态（失效/回传失败）：禁用全部动作键 + 如实一行——**绝不**呈现为「已执行」。 */
  function markRecoveryConfirmExpired(text) {
    if (!state.recoveryConfirm) return;
    state.recoveryConfirm.busy = true;
    state.recoveryConfirm.expiredReason = text;
    if (backgroundDelivery) return;
    $("recovery-confirm").classList.add("is-expired");
    $("rc-deny").disabled = true;
    $("rc-allow").disabled = true;
    $("rc-close").disabled = false; // 失效后只可关闭展示，不回传执行。
    $("rc-hint").textContent = text;
  }

  /** 回传决定（**恰 allow:true 才作为执行请求**；取消/Esc/关闭均为 false）。受理 ⇒ 收起卡片；
   *  失效/通道失败 ⇒ 如实终态（不假装已裁决、更不假装已执行）。 */
  function respondRecoveryConfirm(allow) {
    var cur = state.recoveryConfirm;
    if (!cur) return;
    if (cur.busy) { if (cur.expiredReason && allow !== true) closeRecoveryConfirm(); return; }
    cur.busy = true;
    var done = function (res) {
      deliverRuntimePayload(cur, function () {
      if (state.recoveryConfirm !== cur) return;
      if (res && res.ok === true) {
        closeRecoveryConfirm();
        return;
      }
      if (res && res.expired === true) {
        markRecoveryConfirmExpired("此确认已失效（应用重启或请求已结束），未获执行——请让提议方重新发起。");
        return;
      }
      markRecoveryConfirmExpired("未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。");
      });
    };
    if (!d.recoveryConfirmRespond) {
      done(null);
      return;
    }
    Promise.resolve(d.recoveryConfirmRespond({ id: cur.id, allow: allow === true })).then(done, function () {
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
    updateRightQueue(roleId);
    if (!backgroundDelivery) syncCoveredOperatorCards();
  }

  function refreshEntryAwaiting(entry) {
    deliverRuntimePayload({ projectRoot: entry.projectRoot, runtime: entry.runtime, roleId: entry.roleId }, function () { refreshAwaitingBadge(entry.roleId); });
  }

  /** 卡片的**终态呈现**（按钮永久隐藏 + 如实说明；重物化时同款输出）。 */
  function freezeOperatorCard(card, text, cls) {
    var bs = card.querySelectorAll(".op-actions button, .op-options input");
    for (var i = 0; i < bs.length; i += 1) { bs[i].disabled = true; if (bs[i].tagName === "BUTTON") bs[i].hidden = true; }
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
    // S3（2026-10-16 客户批准）：chip 与尾行**同一刷新点**——本函数每次落定 chip 可见性后回呼
    // renderCurrentWork(roleId)，让尾行据此让位/兜底（不设第二处状态源、防两处漂移）。
    // 非当前查看角色：chip 承载的是**当前查看角色**的状态，后台角色的刷新**不得动它**（历史缺陷：
    // 后台请求到达会顺手隐藏正在显示的 chip）——只回呼该角色自己的尾行。
    if (!viewing) {
      renderCurrentWork(roleId);
      return;
    }
    if (ids.length === 0) {
      el.hidden = true;
      renderCurrentWork(roleId);
      return;
    }
    if (opChipState.roleId !== roleId || opChipState.count !== ids.length) {
      opChipState.roleId = roleId;
      opChipState.count = ids.length;
      opChipState.cursor = 0; // 计数变了（新到达/已作答）⇒ 定位从头开始（先给最早那张）
    }
    var pendingLabel = St.pendingKindLabel(ids.map(function (id) { return opRequests[id].request.kind; }));
    el.querySelector(".op-chip-text").textContent = pendingLabel === "待确认" ? UiLabels.pendingChipLabel(ids.length) : "有 " + ids.length + " 条" + pendingLabel + " · 定位";
    el.hidden = false;
    $("chat").appendChild(el); // 保持在 #chat 尾部（sticky 贴底）——空状态/重挂把它清掉后由本处复位
    renderCurrentWork(roleId);
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
    updateRightQueue(roleId);
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
      var bs = card.querySelectorAll(".op-actions button, .op-options input");
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
        if (entry.state !== "open") return;
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

  /** 系统投递输入（E-1 回交 / H-1 派发 / G-2 `system`）的**单独样式**元素：图标 + 来源标签 + 正文
   *  （Markdown/esc 单一来源）。`system` 类（看护告警/收束提示/恢复回执）来源=**系统**（非角色）——
   *  图标取 shield 区分、标签带子类原文（`tool-rows.js::classifySystemMessage` 单一来源）。
   *  W6b（2026-10-16 客户批准）：`system` 类正文取 `displayBody`——文首标记（`[系统·<子类>] `）已由
   *  chip「系统消息 · <子类>」承载，正文不再重复（回放/实时同解；归类判据仍在投递原文，不改判据）。 */
  function buildInjectedElement(inj, isReplay) {
    var el = document.createElement("div");
    el.className = "msg msg-injected is-" + inj.kind + (isReplay ? " is-replay" : "");
    var label = inj.kind === "handback" ? "原始交接内容 · 来源未确认" : inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "");
    var bodyText = typeof inj.displayBody === "string" ? inj.displayBody : inj.body;
    var body = '<div class="mi-body">' + Md.renderMarkdown(bodyText) + "</div>";
    if (inj.kind === "handback") body = '<details class="mi-report-detail"><summary>交接内容（结构化来源未保存）</summary>' + body + "</details>";
    el.innerHTML =
      '<div class="mi-head">' +
      '<span class="mi-ico">' + (inj.kind === "handback" ? ICONS.handback : inj.kind === "system" ? ICONS.shield : ICONS.send) + "</span>" +
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

  /** **安全网**（2026-10-17 修订）：仅升级历史上仍为 `mdReady: false` 的助手行（新行恒即时 Markdown，
   *  不依赖本函数）。已挂载元素就地转 Markdown；未挂载行只改状态标志，待其挂载时由
   *  `buildAssistantRow` 直接出 Markdown（**离屏不跑解析器**）。高度变化一次性重测（写读分离）。 */
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
    if (!terminalFact(ev) && !toolIdentity && token && ((historyCounts[key] || 0) >= token.occurrence || canonical && alreadyLive)) return;
    var priorOrigin = rowOrigin, priorToken = rowReplayToken;
    rowOrigin = "live"; rowReplayToken = token;
    try { renderOneEvent(env); }
    finally { rowOrigin = priorOrigin; rowReplayToken = priorToken; }
  }

  function bindManualTurn(env) {
    var ev = env.event, message = manualMessages[env.clientMessageId];
    if (!message || message.roleId !== env.roleId || typeof ev.turnId !== "string" || ev.turnId === "") return;
    if (message.turnId && message.turnId !== ev.turnId) return;
    var firstBinding = !message.rec.replayToken;
    message.turnId = ev.turnId;
    if (ev.kind === "message" && ev.detail && ev.detail.source === "prompt-input" && typeof ev.detail.text === "string") message.inputAccepted = true;
    if (!message.outcome && ev.kind === "settled" && ev.detail && ["completed", "failed", "aborted", "timed_out"].indexOf(ev.detail.outcome) >= 0) message.outcome = ev.detail.outcome;
    if (message.onFacts) message.onFacts();
    clearQueueHint(env.roleId, env.clientMessageId);
    if (!firstBinding) return; // 后续同轮事实可更新，原投递身份不可改绑。
    var key = Rt.replayKey({ kind: "user", turnId: ev.turnId, text: message.text });
    var counts = liveReplayCounts[env.roleId] || (liveReplayCounts[env.roleId] = Object.create(null));
    message.rec.replayToken = { key: key, occurrence: (counts[key] = 1) };
    var rl = paneRowLists[env.roleId];
    if (rl) (rl.tokenRows || (rl.tokenRows = Object.create(null)))[Rt.tokenId(message.rec.replayToken)] = message.rec;
    var history = replayState[env.roleId];
    if (rl && (rl.reportedTurns && rl.reportedTurns[ev.turnId] || rl.deliveryTurns && rl.deliveryTurns[ev.turnId])) applyReportedTask(paneFor(env.roleId), ev.turnId);
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
      var hb = ev.report || ev.liveReport;
      if (!hb) { sysRow(pane, "sys-call", ICONS.handback, "回交已收到（旧来源，安全详情未提供）"); return; }
      // 产出角色自己的聊天 → 「回交 su」卡；主入口角色 su 的聊天 → 镜像「来自 <role> 的报告」。
      appendHandback(pane, hb, ev.reportPersistence);
      // 主入口只显示真正投递的输入详情与助手汇总；不提前镜像尚在队列中的报告。
      return; // 左树重渲染由批量收尾统一做（flushBatchSideEffects）
    }
    if (kind === "message") {
      if (ev.detail && ev.detail.source === "delivery-note") { sysRow(pane, "sys-call sys-delivery-note", ICONS.call, ev.summary); return; }
      if (ev.detail && ev.detail.source === "delivery-receipt") { applyDeliveryReceipt(pane, ev.detail.receipt); return; }
      if (ev.detail && ev.detail.source === "delivery-boundary") return;
      // G-5 wave 2：推理事件（投影冻结点 `RuntimeReasoningDisplayDetailV1`——Service 已过核心投影单点；
      // summary 已定格为「已思考」类常量、承载语义全在 detail）⇒ 推理折叠行**独立一行**（不进工具组、
      // 不加 [系统·] 前缀、默认折叠含运行中）；投影失败的诊断形按如实一行呈现（不假装内容）。
      if (ev.detail && ev.detail.source === "reasoning") { appendReasoningFromDetail(pane, ev.detail, ev.turnId); return; }
      if (ev.detail && ev.detail.source === "reasoning-diagnostic") {
        appendReasoningRow(pane, { label: String(ev.summary || "推理内容无法安全显示"), text: "", flags: "", foldable: false, turnId: typeof ev.turnId === "string" ? ev.turnId : "" });
        return;
      }
      // 事件流异常经外推层以 message 形式送来（session.ts consume 的 catch）——如实归为「错误」态。
      if (typeof ev.summary === "string" && ev.summary.indexOf("会话事件流异常") === 0) {
        metaFor(roleId).error = true;
      }
      // 系统投递输入（E-1 回交 / H-1 派发）**单独样式**：判据＝编排两名渲染函数的定格前缀
      // （`tool-rows.js::INJECT_PREFIXES`；**非启发式**——格式若变只改那张表）＋剥离 `用户指令：` 回显前缀。
      // **手输防误伤**（fca8f6b 起为**身份绑定**；旧的「同角色 15s 时间窗」启发式已在 fca8f6b 删除）：
      // 本端手发送的气泡在 `bindManualTurn` 以 canonical 键 `["input", turnId]` 绑定身份（并置 live 计数），
      // 其同轮回显事件在 `appendOneEvent` 判到同键已 live ⇒ 整条去重、**不进入本归类**——手输即便字面
      // 像投递前缀也不当投递（普通气泡路径）。注意该保护**只覆盖实时回显**；回放侧历史行无身份可依
      // （残余边界见 `appendReplayRow` 的 `kind === "user"` 归类注释）。
      var input = ev.detail && ev.detail.source === "prompt-input" && typeof ev.detail.text === "string" ? ev.detail : null;
      if (input) {
        if (appendDelivery(pane, input, input.text, input.inputTextProjection, ev.turnId)) return;
        var injected = Tr.classifyInjectedMessage ? Tr.classifyInjectedMessage(input.text) : null;
        if (injected) appendInjectedMessage(pane, injected);
        else { appendUser(pane, input.text, false); var inputList = rowListFor(pane); if ((inputList.reportedTurns && inputList.reportedTurns[ev.turnId] || inputList.deliveryTurns && inputList.deliveryTurns[ev.turnId])) applyReportedTask(pane, ev.turnId); }
      } else { appendAssistant(pane, ev.summary, ev.turnId); var replyList = rowListFor(pane); if ((replyList.reportedTurns && replyList.reportedTurns[ev.turnId] || replyList.deliveryTurns && replyList.deliveryTurns[ev.turnId])) applyReportedTask(pane, ev.turnId); }
    }
    else if ((kind === "tool_call" || kind === "accepted") && Tr.isToolActivity(ev)) appendActivity(pane, Tr.activityOf(ev));
    else if (kind === "tool_call") sysRow(pane, "sys-call sys-unknown-tool-event", ICONS.call, "旧/未知系统记录：" + ev.summary);
    else if (kind === "denied") {
      if (Tr.isToolActivity(ev)) appendActivity(pane, Tr.activityOf(ev));
      else if (!appendTurnTerminal(pane, ev)) sysRow(pane, "sys-call", ICONS.deny, ev.summary);
    } // 治理信号（拒绝原因 + 允许路径）：全量，不瘦身
    else if (kind === "settled") {
      // 一轮结束：**忙态由主进程快照转述**（session:role-state 的 busy=false——见 onRoleState），
      // 此处只清「上一次的错误态」（本轮正常收口）并记行；**不再**由事件流自设忙闲（准确性裁定）。
      var outcome = ev.detail && ev.detail.outcome;
      metaFor(roleId).error = outcome === "failed" || outcome === "timed_out";
      // Q-1/Q-2（2026-10-17 修订）：助手消息已即时 Markdown（完整消息语义，见 appendAssistant）；
      // 此处保留 upgradeStreamingMarkdown **仅作旧行/异常行安全网**，正常新行不依赖。
      upgradeStreamingMarkdown(roleId);
      if (typeof ev.turnId === "string" && ev.turnId) { var settledList = rowListFor(pane); (settledList.settledTurns || (settledList.settledTurns = Object.create(null)))[ev.turnId] = true; if ((settledList.reportedTurns && settledList.reportedTurns[ev.turnId] || settledList.deliveryTurns && settledList.deliveryTurns[ev.turnId])) applyReportedTask(pane, ev.turnId); foldTurnGroups(pane, ev.turnId); } // 工具行折叠口径：轮结束 ⇒ 该轮工具组折叠成一行（手动开合/焦点在内者除外）
      if (!appendTurnTerminal(pane, ev)) sysRow(pane, "sys-settled", ICONS.call, ev.summary);
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
  // 与主进程 pi-config.ts 的 PI_PANEL_KEYS 一致：**3 项必填**（端点 / 模型 / token）+ **2 项高级**（上下文窗口、
  // 整轮超时；均可留空、收进「高级」）。token 为机密：**值永不回显**（主进程只给 isSet 布尔、恒返回空 value），
  // 此处字段恒为 password 型、只示「已设置/未设置」。界面**不作任何判定**（掩码/读写全在主进程侧经共享
  // env-file 模块，单一来源）。**`ANS_PI_PROVIDER` 不在面板里**（代码里有默认值 ans-gateway、是内部标签，
  // 客户 2026-10-11 裁定移除）。
  var PI_KEYS = [
    "ANTHROPIC_AUTH_TOKEN",
    "ANS_PI_BASE_URL",
    "ANS_PI_MODEL",
    "ANS_PI_CONTEXT_WINDOW",
    "ANS_PI_PROMPT_TIMEOUT_MS",
  ];
  // **高级区字段（单一来源，按此顺序渲染）**：折叠、可留空（留空 = 不下发该键，用适配器默认值）。
  // 主字段区排除本组；未知/缺件字段自动跳过（兼容旧窗口视图只给其中一项）。
  var ADVANCED_SETTING_KEYS = [
    "ANS_PI_CONTEXT_WINDOW",
    "ANS_PI_PROMPT_TIMEOUT_MS",
  ];
  // 必填键（3 项）——缺任一才「配置不全、会被拒」；高级键均可选，缺失不算缺（留空 = 默认）。
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

  /** 预设档位滑块：hidden 规范值 → slider 下标 → output/aria 标签（映射单点在 `ui-labels`）。
   *  仅当该键存在 range 控件时生效；自定义值（回退文本输入）无滑块 ⇒ no-op。 */
  function syncRange(key) {
    var slider = $("pi-range-" + key), out = $("pi-range-out-" + key), hidden = piInput(key);
    if (!slider || !out || !hidden) return;
    var f = piFieldByKey(key) || {};
    var choices = Array.isArray(f.choices) ? f.choices : [];
    var labels = Array.isArray(f.choiceLabels) ? f.choiceLabels : [];
    if (!choices.length) return;
    var idx = UiLabels.rangeChoiceIndex(choices, hidden.value);
    if (idx < 0) idx = 0;
    var text = UiLabels.rangeChoiceLabel(choices, labels, idx);
    slider.value = String(idx);
    slider.setAttribute("aria-valuetext", text);
    out.textContent = text;
    hidden.value = UiLabels.rangeChoiceValue(choices, idx); // 规范值（默认档为 ""）
  }

  /** 拖动/键盘调整 range：同步 hidden 规范值 + output 标签 + aria-valuetext（保存链不变）。 */
  function bindRangeControl(key) {
    var slider = $("pi-range-" + key), out = $("pi-range-out-" + key), hidden = piInput(key);
    if (!slider || !out || !hidden) return;
    var f = piFieldByKey(key) || {};
    var choices = Array.isArray(f.choices) ? f.choices : [];
    var labels = Array.isArray(f.choiceLabels) ? f.choiceLabels : [];
    if (!choices.length) return;
    slider.addEventListener("input", function () {
      var idx = parseInt(slider.value, 10);
      if (!isFinite(idx)) idx = 0;
      idx = Math.max(0, Math.min(choices.length - 1, idx));
      var text = UiLabels.rangeChoiceLabel(choices, labels, idx);
      hidden.value = UiLabels.rangeChoiceValue(choices, idx);
      out.textContent = text;
      slider.setAttribute("aria-valuetext", text);
    });
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
    hint.textContent = "保存到上方显示的 .env 路径，只修改本引擎字段。" + Rt.applicationLabel(piView.application || "next-session");
    function fieldHtml(f) {
      var required = f.required === true || (state.runtime === "pi" && PI_REQUIRED_KEYS.indexOf(f.key) >= 0);
      // G-5 wave 2（档位控件）：封闭值域字段（元数据 `choices` 非空）⇒ **选择控件**——值域即选项（面板
      // 显示值＝保存接受值＝适配器认识值，单一来源；值域按运行时，如 Codex 无 off 档自动成立）。
      // 「留空（平台默认）」＝未设态（保存侧空串＝清除该键＝维持平台默认）；现存值不在选项内（手编坏值）
      // ⇒ 附一条原值选项**如实显示**（不静默改写/不假装未设；保存时由主进程按 choices 校验如实拒绝）。
      // 自由文本字段（choices 缺席/空）逐字现状；机密字段不走此支（choices 字段均非机密）。
      var choices = Array.isArray(f.choices) && f.choices.length > 0 ? f.choices : null;
      var choiceLabels = Array.isArray(f.choiceLabels) ? f.choiceLabels : [];
      var control, forId = "pi-inp-" + f.key;
      if (f.control === "range" && choices) {
        // G-5 wave 2 扩展（2026-10-17）：预设档位滑块。可见 range + output 显示 choiceLabels；
        // **hidden #pi-inp-<key> 持有规范值**（既有保存循环原样读 #pi-inp-<key>，保存链零改动）。
        // 键盘方向键由原生 range 提供；aria-valuetext 与 output 同步为同一标签。
        var rangeIndex = UiLabels.rangeChoiceIndex(choices, f.value);
        if (rangeIndex < 0) {
          // 当前保存值不在预设档位：**不静默覆盖**——回退文本输入 + 明示提示，让用户显式改档后保存。
          control = '<input id="pi-inp-' + esc(f.key) + '" class="pi-input" type="text" autocomplete="off" spellcheck="false" />' +
            '<span class="pi-range-note">当前值不在预设档位；改为预设档位后保存</span>';
        } else {
          var rangeText = UiLabels.rangeChoiceLabel(choices, choiceLabels, rangeIndex);
          forId = "pi-range-" + f.key;
          control = '<span class="pi-range-wrap">' +
            '<input id="pi-range-' + esc(f.key) + '" class="pi-range" type="range" min="0" max="' + (choices.length - 1) + '" step="1" value="' + rangeIndex + '" aria-valuetext="' + esc(rangeText) + '" />' +
            '<output id="pi-range-out-' + esc(f.key) + '" class="pi-range-out" for="pi-range-' + esc(f.key) + '">' + esc(rangeText) + "</output>" +
            "</span>" +
            '<input id="pi-inp-' + esc(f.key) + '" type="hidden" value="' + esc(UiLabels.rangeChoiceValue(choices, rangeIndex)) + '" />';
        }
      } else if (choices) {
        var opts = ['<option value="">留空（平台默认）</option>'].concat(choices.map(function (c) { return '<option value="' + esc(String(c)) + '">' + esc(String(c)) + "</option>"; }));
        if (typeof f.value === "string" && f.value !== "" && choices.indexOf(f.value) < 0) opts.push('<option value="' + esc(f.value) + '">' + esc(f.value) + "</option>");
        control = '<select id="pi-inp-' + esc(f.key) + '" class="pi-input pi-select">' + opts.join("") + "</select>";
      } else {
        control = '<input id="pi-inp-' + esc(f.key) + '" class="pi-input" type="' + (f.secret ? "password" : "text") +
          '" autocomplete="off" spellcheck="false" />' + (f.secret ? '<button id="pi-toggle-secret" class="btn btn-ghost btn-mini" type="button">显示</button>' : "");
      }
      return '<label class="pi-field" for="' + esc(forId) + '"><span class="pi-field-label">' +
        esc(f.label || f.key) + ' · ' + (required ? "必填" : "可选") + (f.secret ? ' <span class="pi-secret-tag">机密</span>' : "") +
        '</span><span class="pi-input-wrap">' + control +
        '</span><span class="runtime-field-help">' + esc(f.key + " · " + Rt.sourceLabel(f) + (f.help ? "。" + f.help : "")) + '</span></label>';
    }
    var mainFields = fields.filter(function (f) { return ADVANCED_SETTING_KEYS.indexOf(f.key) < 0; });
    $("pi-panel").querySelector(".pi-fields").innerHTML = mainFields.map(fieldHtml).join("");
    var advanced = $("pi-panel").querySelector(".pi-advanced");
    // 按 ADVANCED_SETTING_KEYS 的顺序取存在的字段（缺件跳过——旧窗口视图只给 CONTEXT_WINDOW 时照常工作）。
    var advancedFields = ADVANCED_SETTING_KEYS.map(function (key) {
      return fields.filter(function (f) { return f.key === key; })[0] || null;
    }).filter(Boolean);
    advanced.hidden = advancedFields.length === 0;
    // 两项之间给一行沿用 `.pi-advanced-hint` 的分隔说明（不新增控件/视觉体系）；单项时自然无分隔。
    advanced.querySelector(".pi-advanced-body").innerHTML = advancedFields.map(fieldHtml).join(
      '<p class="pi-advanced-hint">以下高级项均可留空；留空 = 使用默认值。</p>'
    );
    fields.forEach(function (f) {
      var inp = piInput(f.key);
      if (!inp) return;
      if (f.secret === true) {
        inp.value = ""; // 绝不回显值
        inp.placeholder = f.isSet ? "已设置，留空则不修改" : "未设置";
        inp.type = "password";
      } else inp.value = typeof f.value === "string" ? f.value : "";
    });
    // 滑块预填/同步：hidden 值已由上段写入 ⇒ 设 slider 下标与 output 标签（默认档 index 0）。
    fields.forEach(function (f) {
      if (f.control !== "range") return;
      syncRange(f.key);
      bindRangeControl(f.key);
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

  var drawerInvoker = null;
  var documentView = null, documentReadVersion = 0, documentScope = null, documentReadUnavailable = null;
  function validInvoker(el) { if (!el || !el.isConnected || el.disabled || !el.getClientRects().length) return false; var rect = el.getBoundingClientRect(); return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth; }
  function rememberInvoker(event) { drawerInvoker = event && event.currentTarget && event.currentTarget.nodeType === 1 ? event.currentTarget : document.activeElement; }
  function restoreInvoker(fallback) {
    var target = validInvoker(drawerInvoker) ? drawerInvoker : fallback;
    if (validInvoker(target)) target.focus({ preventScroll: true });
  }
  function invalidateDocumentRead() {
    documentReadVersion += 1;
    if (state.rightTab === "document") { state.rightTab = null; documentView = null; }
  }
  function documentContextMatches(view) {
    return documentView === view && view.projectRoot === state.projectRoot && view.runtime === state.runtime && view.chatRoleId === state.selectedRoleId;
  }
  function documentList(roleId, invoker, origin) {
    captureDrawerReading();
    invalidateDocumentRead();
    if (!invoker || !$("right-drawer").contains(invoker)) drawerInvoker = invoker || document.activeElement;
    documentView = { projectRoot: state.projectRoot, runtime: state.runtime, chatRoleId: state.selectedRoleId, roleId: roleId,
      origin: origin || "report", listScroll: 0, selectedId: null, mode: "list", error: null, refs: [] };
    var role = state.roles.find(function (r) { return r.roleId === roleId; });
    documentView.refs = role && Array.isArray(role.documents) ? role.documents : [];
    if (!role) documentView.error = "无法确定来源角色，暂不能列出来源文档。";
    state.rightTab = "document"; renderRight(); renderTabs(); $("drawer-close").focus();
  }
  function renderDocumentView() {
    var view = documentView, body = $("right-body");
    if (!view) { body.textContent = "文档上下文已失效。"; return; }
    $("drawer-title").textContent = view.roleId + " · 来源文档";
    if (view.mode === "list") {
      body.innerHTML = (view.origin === "card" ? '<button class="btn btn-ghost btn-mini" data-doc-action="back-role">返回角色资料</button>' : '') +
        '<p class="document-source-note">以下是当前项目中该角色已列出的可读文档，请选择要阅读的文件。</p>' +
        (!documentScope ? '<p role="status">' + esc(Rt.documentError(documentReadUnavailable || "PROJECT_NOT_GRANTED")) + '</p>' : '') +
        (view.error ? '<p role="status">' + esc(view.error) + '</p>' : '') +
        (view.refs.length ? '<ul class="document-list">' + view.refs.map(function (ref) { return '<li><div class="document-list-meta"><strong>' + esc(ref.label) + '</strong><small>' + esc(ref.relativePath) + '</small></div><button class="btn btn-mini" data-doc-id="' + esc(ref.documentId) + '"' + (!documentScope || ref.projectViewId !== documentScope.projectViewId ? ' disabled' : '') + '>阅读</button></li>'; }).join("") + '</ul>' : '<p>该角色当前没有已列出的可读文档。</p>') +
        '<button class="btn btn-ghost btn-mini" data-doc-action="refresh">刷新已列文档</button>';
      body.scrollTop = view.listScroll || 0;
      if (view.selectedId) body.querySelectorAll('[data-doc-id]').forEach(function (button) { if (button.dataset.docId === view.selectedId) button.focus({ preventScroll: true }); });
      return;
    }
    body.innerHTML = '<button class="btn btn-ghost btn-mini" data-doc-action="back-list">返回来源文档</button><p class="document-path">' + esc(view.ref && view.ref.relativePath || "") + '</p><div id="document-read-status" role="status"></div><div id="document-read-text" class="document-read-text"></div>';
    var status = $("document-read-status"), content = $("document-read-text");
    if (view.mode === "loading") status.textContent = "正在读取文档…";
    else if (view.mode === "error") {
      status.textContent = view.error;
      if (["IO_ERROR", "CHANGED_DURING_READ", "NOT_FOUND", "PERMISSION_DENIED"].indexOf(view.errorCode) >= 0) {
        var retry = document.createElement("button"); retry.className = "btn btn-ghost btn-mini"; retry.textContent = "重试读取"; retry.dataset.docAction = "retry"; status.appendChild(retry);
      }
    } else if (view.result) {
      status.textContent = "只读文档 · " + view.result.byteLength + " 字节";
      if (view.result.format === "markdown") { content.classList.add("card-md"); content.innerHTML = Md.renderMarkdown(view.result.text); }
      else { var pre = document.createElement("pre"); pre.textContent = view.result.text; content.appendChild(pre); }
    }
  }
  async function readDocument(ref) {
    var view = documentView;
    if (!view || !documentScope || ref.projectViewId !== documentScope.projectViewId || ref.roleId !== view.roleId) return;
    if (view.mode === "list") view.listScroll = $("right-body").scrollTop;
    var version = ++documentReadVersion, epoch = documentScope.projectViewId;
    view.ref = ref; view.selectedId = ref.documentId; view.mode = "loading"; view.error = null;
    renderRight();
    try {
      var result = d.readProjectDocument ? await d.readProjectDocument({ version: 1, projectViewId: epoch, documentId: ref.documentId }) : { ok: false, code: "UNSUPPORTED_ENVIRONMENT" };
      if (version !== documentReadVersion || !documentContextMatches(view) || !documentScope || documentScope.projectViewId !== epoch) return;
      if (!result || result.version !== 1 || result.projectViewId && result.projectViewId !== epoch || result.documentId && result.documentId !== ref.documentId) result = { ok: false, code: "INVALID_REQUEST" };
      if (result.ok && result.projectViewId === epoch && result.documentId === ref.documentId && result.roleId === ref.roleId && ["markdown", "text"].indexOf(result.format) >= 0 && typeof result.text === "string") { view.result = result; view.mode = "content"; }
      else { view.mode = "error"; view.errorCode = result.code || "IO_ERROR"; view.error = Rt.documentError(view.errorCode); }
    } catch (_) {
      if (version !== documentReadVersion || !documentContextMatches(view)) return;
      view.mode = "error"; view.errorCode = "IO_ERROR"; view.error = Rt.documentError("IO_ERROR");
    }
    renderRight();
  }
  async function refreshDocumentList() {
    var view = documentView, version = ++documentReadVersion;
    if (!view) return;
    try {
      var listing = await d.listProject(view.projectRoot);
      if (version !== documentReadVersion || !documentContextMatches(view)) return;
      if (!listing || listing.projectRoot !== view.projectRoot) throw new Error();
      documentScope = listing.documentScope || null; documentReadUnavailable = listing.documentReadUnavailable;
      var role = (listing.roles || []).find(function (r) { return r.roleId === view.roleId; });
      view.refs = role && role.documents || []; view.error = role ? null : "无法确定来源角色，暂不能列出来源文档。";
      // 清单刷新不applyListing、不切聊天角色/引擎或开启会话。
    } catch (_) { if (documentContextMatches(view)) view.error = "文档清单刷新失败。"; }
    if (documentContextMatches(view)) renderRight();
  }
  function onDocumentAction(event) {
    if (state.rightTab !== "document" || !documentView) return;
    var action = event.target.closest('[data-doc-action]'), refButton = event.target.closest('[data-doc-id]');
    if (refButton) { var ref = documentView.refs.find(function (item) { return item.documentId === refButton.dataset.docId; }); if (ref) void readDocument(ref); return; }
    if (action) {
      if (action.dataset.docAction === "refresh") void refreshDocumentList();
      else if (action.dataset.docAction === "retry" && documentView.ref) void readDocument(documentView.ref);
      else if (action.dataset.docAction === "back-list") { documentReadVersion += 1; documentView.mode = "list"; renderRight(); }
      else if (action.dataset.docAction === "back-role") { documentReadVersion += 1; state.rightTab = "card"; documentView = null; renderRight(); renderTabs(); var equivalent = $("right-body").querySelector(".role-document-entry"); if (validInvoker(equivalent)) equivalent.focus({ preventScroll: true }); else restoreInvoker($("tab-card")); }
      return;
    }
    var link = event.target.closest('a');
    if (link) {
      event.preventDefault();
      var href = link.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) { if (d.openExternal) void d.openExternal(href); }
      else {
        var path = href;
        try { var resolved = new URL(href, "https://document.invalid/" + (documentView.ref && documentView.ref.relativePath || "")); path = resolved.origin === "https://document.invalid" ? decodeURIComponent(resolved.pathname.slice(1)) : ""; } catch (_) { path = ""; }
        var target = documentView.refs.find(function (ref) { return ref.relativePath === path; });
        if (target) void readDocument(target);
        else { var note = $("document-read-status"); if (note) note.textContent = "此链接尚未提供阅读入口。"; }
      }
    }
  }
  function openPiPanel(event) {
    if (state.rightTab === "document") invalidateDocumentRead();
    rememberInvoker(event);
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
      // 保存配置不重新开启当前会话，后续输入由窗口实际profile应用时点接管。
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
    if (projectChanged || fresh) invalidateDocumentRead();
    if (documentScope && (!res.documentScope || documentScope.projectViewId !== res.documentScope.projectViewId)) invalidateDocumentRead();
    documentScope = res.documentScope || null; documentReadUnavailable = res.documentReadUnavailable || null;
    if (projectChanged || fresh) { ++configSaveVersion; void loadPiConfig(); }
    state.roles = res.roles || [];
    state.primaryRoleId = res.primaryRoleId || null;
    state.hasRoles = res.hasRoles !== false;
    // I4：治理记录状态原样落状态；`pin-mismatch` 一并接受并保留逐文件证据（pinFiles/pinCount）。
    // **未知状态 ⇒ 按 present 兜底**（不显示动作，fail-closed）；判据只经 `UiLabels.governanceActionFor`。
    var gr = res.governanceRecord;
    var knownGovernanceStates = ["present", "missing", "invalid", "pin-mismatch"];
    state.governanceRecord = gr && typeof gr === "object" && knownGovernanceStates.indexOf(gr.state) >= 0
      ? {
          state: gr.state,
          reason: typeof gr.reason === "string" ? gr.reason : "",
          pinFiles: Array.isArray(gr.pinFiles) ? gr.pinFiles : [],
          pinCount: typeof gr.pinCount === "number" && isFinite(gr.pinCount) ? gr.pinCount : 0,
        }
      : { state: "present" };
    if (projectChanged || fresh) closeGovernancePreview(); // 换项目：旧项目的预览不跨项目保留
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
    $("sidebar-role-count").textContent = state.roles.length + " 个角色 · 本地会话";
    $("project-path").title = state.projectRoot || "尚未导入项目";
    renderRoleTree();
    ensureRoleTreeVisible(state.selectedRoleId || state.primaryRoleId); // 导入/刷新：主入口/选中项可见（用户滚动不被重置到顶）
    renderRight();
    renderTabs();
    setChatHeader(selectedRole());
    updateControls();
    renderGovernanceUi(); // I4：状态行随列举结果刷新（S1/invalid/隐藏）
    refreshEmptyStates(); // I4：空态文案同步（S1 引导 / 建立成功后回到常态）
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
   *  最近事件（若有）。图标/文案/样式/描述均来自 `St.statusBadge` 的**唯一映射**。
   *  W9（2026-10-16 客户批准）：working 态图标经 `iconHtml` 输出 SVG 弧线转轮（图源 = role-status.js
   *  的编译期常量 `SPINNER_SVG`，非外部输入——此处**不转义**是单点决策；其余态/缺省一律照旧 esc 文本字形。
   *  **不得**对徽标做 DOM 注入实现转轮：左树重绘会抹掉注入（本批审计已实地验证），唯一落点是本单点。 */
  function statusBadgeHtml(roleId) {
    var pending = (state.queueByRole[roleId] || []).length;
    var waitingKinds = openRequestIdsFor(roleId).map(function (id) { return opRequests[id].request.kind; });
    var badge = St.statusBadge(roleStatusOf(roleId), pending, waitingKinds);
    var m = state.roleMeta[roleId] || {};
    var hover = badge.title + (m.lastSummary ? " ｜ 最近事件（" + m.lastAt + "）：" + m.lastSummary : "");
    return (
      '<span class="ti-status ' + badge.className + '" title="' + esc(hover) + '">' +
      '<span class="ts-ico" aria-hidden="true">' + (badge.iconHtml || esc(badge.icon)) + "</span>" +
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
    if (Array.isArray(info.queue) && info.queue.length === 0) clearQueueHint(roleId);
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

  /** 待确认 chip 当前是否**在屏可见**（唯一写方 = updateOpChip；chip 是 #chat 的 sticky 尾元素）。
   *  S3 判据（2026-10-16 客户批准）：chip 可见 ⇒ 尾行不再重复「等待你确认」（同一状态源，见下）。 */
  function opChipShown() {
    var chip = document.getElementById("op-chip");
    return !!chip && !chip.hidden && chip.parentNode === $("chat");
  }

  /** 聊天尾行（`.tool-current`）。S3（2026-10-16 客户批准）：**chip 可见时不显示「等待你确认」**——
   *  chip 已承载同一状态与计数（F4 去重；B2 消除）；**「正在工作」保留**（W10：文本前加同款转轮）；
   *  chip 不可见时状态词仍兜底。刷新点与 updateOpChip 同源联动（updateOpChip 每次改可见性后回呼本函数）。 */
  function renderCurrentWork(roleId) {
    var pane = paneFor(roleId);
    var el = pane.querySelector(".tool-current");
    var awaiting = openRequestIdsFor(roleId).length > 0;
    if (awaiting && opChipShown()) { if (el) el.remove(); return; }
    if (!awaiting && state.roleBusy[roleId] !== true) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.className = "tool-current"; }
    if (awaiting) {
      el.textContent = St.pendingKindLabel(openRequestIdsFor(roleId).map(function (id) { return opRequests[id].request.kind; })).replace("待", "等待你");
    } else if (!el.querySelector(".spin-arc")) {
      // W10（2026-10-16 客户批准）：尾行「正在工作」= 同款 12px SVG 转轮 + 原文案（不新造词；
      // 行高不因图标增加——图标为 flex 子项，文本行高照旧）。**等待确认场景不加任何动效**（长期约束）。
      // 已有转轮时不重写 innerHTML——不打断旋转帧（重复刷新只保内容不重置动画）。
      el.innerHTML = St.SPINNER_SVG + "<span>正在工作</span>";
    }
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
      if (rec.kind === "turn-terminal") {
        var coveredSource = rec.data.sources.find(function (source) { return covered(source.replayToken); });
        if (coveredSource) anchor = Rt.tokenId(coveredSource.replayToken);
        else if (rec.origin !== "history") preserve({ record: rec });
        return;
      }
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
        origin: old.origin, replayToken: old.replayToken, manualClientId: old.manualClientId, atIndex: atIndex, turnId: old.turnId, assistantText: old.assistantText, originalOpen: old.originalOpen, originalFlags: old.originalFlags });
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

  function orderedHistoryReports(reports) {
    var copy = Array.isArray(reports) ? reports.slice() : [];
    if (!copy.every(function (report) { return report && typeof report.at === "string" && report.at.trim() !== "" && Number.isFinite(Date.parse(report.at)); })) return copy;
    return copy.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
  }

  function replayHistory(payload, forceFull) {
    var roleId = payload.roleId;
    var rows = Array.isArray(payload.rows) ? payload.rows : [];
    var error = typeof payload.error === "string" && payload.error !== "" ? payload.error : null;
    var projection = payload.projection || {}, projectionNote = [];
    if (projection.omittedEntries) projectionNote.push("仅显示最近记录，已省略前 " + projection.omittedEntries + " 条");
    if (projection.invalidEntries) projectionNote.push("无效投影条目 " + projection.invalidEntries + " 条");
    if (payload.skipped) projectionNote.push("原解析跳过 " + payload.skipped + " 条");
    if (projection.truncated) projectionNote.push("部分文字已截断");
    if (payload.reportErrors && payload.reportErrors.length) projectionNote.push("有 " + payload.reportErrors.length + " 项报告记录不可读，不作为成果显示");
    metaFor(roleId).historyNotice = projectionNote.join("；");
    if (roleId === state.selectedRoleId) renderContextState(roleId);
    if (rows.length === 0 && error === null && !(payload.reports && payload.reports.length)) return;
    var prev = replayState[roleId];
    if (prev && prev.projectRoot !== payload.projectRoot) prev = null;
    var plan = forceFull ? { action: "full", from: 0 } : UiLabels.replayPlan(prev, rows);
    if (prev && error !== prev.error) plan = { action: "full", from: 0 };
    diagnose("renderer.replay", { count: rows.length, state: plan.action });
    if (plan.action === "skip") {
      orderedHistoryReports(payload.reports).forEach(function (report) { appendHandback(paneFor(roleId), report, { state: "saved", reportId: report.reportId, retryAvailable: false }); });
      return;
    }
    var pane = paneFor(roleId), oldList = paneRowLists[roleId];
    var reading = captureChatReading(pane);
    var knownOriginalRows = Object.create(null);
    if (oldList) oldList.rows.forEach(function (record) { if ((record.taskRequest || record.replyFolded) && record.replayToken) knownOriginalRows[Rt.tokenId(record.replayToken)] = record.el ? record.el.open : record.originalOpen; });
    var knownTerminalRows = Object.create(null);
    if (oldList) oldList.rows.forEach(function (record) { if (record.kind === "turn-terminal") record.data.sources.forEach(function (source) { if (source.replayToken) knownTerminalRows[Rt.tokenId(source.replayToken)] = record.data; }); });
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
        else { var replayed = appendReplayRow(pane, rows[i], knownTerminalRows[Rt.tokenId(token)]); if (replayed && Object.prototype.hasOwnProperty.call(knownOriginalRows, Rt.tokenId(token))) replayed.originalOpen = knownOriginalRows[Rt.tokenId(token)]; }
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
    orderedHistoryReports(payload.reports).forEach(function (report) { appendHandback(pane, report, { state: "saved", reportId: report.reportId, retryAvailable: false }); });
    Object.keys(rowListFor(pane).deliveryTurns || {}).forEach(function (turnId) { applyReportedTask(pane, turnId, true); });
    materializePendingFor(roleId); renderCurrentWork(roleId);
  }

  /** 单条回放行（kind: user|assistant|tool|denied；助手/用户文本走 Markdown 渲染器，工具行 esc）。
   *  Q-2：`build` **惰性**——离屏行不建 DOM、不跑解析器；挂载时才构造。 */
  function appendReplayRow(pane, row, knownTerminal) {
    if (!row || typeof row !== "object") return;
    var kind = String(row.kind || "");
    var text = String(row.text == null ? "" : row.text);
    if (row.deliveryReceipt) { applyDeliveryReceipt(pane, row.deliveryReceipt); return; }
    if (row.deliveryBoundary) return;
    // G-5 wave 2：推理行回放——行数据通道以结构化字段 `row.reasoning` 携带投影形（reasoning 子对象，
    // 同「投递历史状态」族的结构化行字段；投影形幂等 ⇒ 实时/回放渲染同一行形）。**不靠摘要文本猜**
    // （非启发式纪律：无该字段＝不是推理行，普通行路径逐字不变）。
    if (row.reasoning && typeof row.reasoning === "object") { appendReasoningFromDetail(pane, { reasoning: row.reasoning }, row.turnId); return; }
    if (kind === "user" && appendDelivery(pane, { inputProvenance: row.inputProvenance, inputPresentation: row.inputPresentation }, text, row.inputTextProjection, row.turnId)) return;
    if (text === "") return;
    if (kind !== "assistant" && kind !== "user" && kind !== "tool" && kind !== "denied") return; // 未知 kind：跳过（防御式）
    // D-1 回放同样归类：投递输入在回放里也呈**注入样式**（判据=同一张前缀表）。
    // **已知残余边界（2026-10-16 桌面窗口实核、桌面UI核对）**：历史行（session-history 的 user 行）只带
    // 文本、不携「手输/投递」身份——**手输**的仿前缀文本在回放里会被归成注入行（实时回显路径有身份绑定
    // 防误伤，见 prompt-input 分支；回放侧无身份可依）。彻底修复需历史行携带投递身份（跨角色边界），
    // 本轮只如实标注、不改行为（定性见 docs/fix 记录）。
    if (kind === "denied" && !Tr.isToolActivity(row)) {
      if (!knownTerminal || !appendTurnTerminal(pane, { kind: "denied", turnId: knownTerminal.turnId, summary: text, detail: { outcome: knownTerminal.outcome } }, knownTerminal)) sysRow(pane, "sys-call", ICONS.deny, text);
      return;
    }
    if ((kind === "tool" || kind === "denied") && Tr.isToolActivity(row)) {
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
        var flags = [Rt.textFlags(row.textProjection), Rt.metadataLabel(row.metadataOmissions)].filter(Boolean).join("；");
        if (flags) { var note = document.createElement("small"); note.className = "projection-flags"; note.textContent = flags; el.appendChild(note); }
        return el;
      },
      kind === "tool" || kind === "denied" ? 34 : 60,
      { keepEl: injRow !== null, kind: "replay", turnId: row.turnId, assistantText: kind === "assistant", originalFlags: [Rt.textFlags(row.textProjection), Rt.metadataLabel(row.metadataOmissions)].filter(Boolean).join("；"), data: { identity: JSON.stringify([kind, text, row.at || ""]) } }
    );
    // 真机缺陷修复（锚点物化）：交互工具的调用行/结论行带锚点标识（requestId/anchor/anchorKey，主进程
    // session-history.ts 给出）⇒ 按行序位登记进回放锚点表——交互卡（重）物化据此落回它发生的位置。
    if (row.anchorKey) noteReplayAnchor(pane.dataset.roleId || "", row, rec.index);
    return rec;
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
    item.setAttribute("data-role-id", r.roleId);
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    var identityDescription = [isPrimary ? "主入口：默认入口与主路径" : "", r.builtIn ? "内置角色：定义在 SKILL.md，无角色目录" : ""].filter(Boolean).join("；");
    if (identityDescription) { item.setAttribute("aria-description", identityDescription); item.title = r.roleId + "；" + identityDescription; }
    item.innerHTML =
      '<span class="ti-icon"><span class="ti-avatar">' + esc(Array.from(r.roleId).slice(0, 1).join("")) + "</span></span>" +
      '<span class="ti-main"><span class="ti-name">' + esc(r.roleId) + "</span>" +
      (r.group && r.groupDuty ? '<span class="ti-group-duty">' + esc(r.groupDuty) + "</span>" : "") +
      '<span class="ti-sub">' + esc(Rt.runtimeLabel(state.runtime)) + ' · ' + statusBadgeHtml(r.roleId) + "</span></span>" +
      '<span class="ti-facts">' +
      "</span>";
    function activate() { selectRole(r.roleId); }
    item.addEventListener("click", activate);
    item.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    return item;
  }

  /**
   * 让指定角色项落在 `.tree` 视口内（2026-10-17 实机：248px 左栏 + 9 角色时，导入/选中后
   * 主入口 `su` 可能被滚出可视区，看起来像「主入口消失」）。
   * 口径：**已可见就不动**（保留用户手动滚动）；需要时只做**最小位移**（近端对齐），
   * 不强制 `scrollTop=0`。切项目/导入/选中后调用。
   */
  function ensureRoleTreeVisible(roleId) {
    var tree = $("role-tree");
    if (!tree || typeof roleId !== "string" || roleId === "") return;
    var items = tree.querySelectorAll(".tree-item[data-role-id]"), target = null;
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].getAttribute("data-role-id") === roleId) { target = items[i]; break; }
    }
    if (!target) return;
    var treeRect = tree.getBoundingClientRect(), itemRect = target.getBoundingClientRect();
    var delta = UiLabels.roleTreeScrollDelta(treeRect.top, treeRect.bottom, itemRect.top, itemRect.bottom);
    if (delta !== 0) tree.scrollTop += delta; // 最小位移到近端；浏览器自行夹取上下限
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
    invalidateDocumentRead();
    var projectRoot = state.projectRoot;
    var runtime = state.runtime;
    metaFor(roleId).contextText = "正在开启或恢复会话…"; renderContextState(roleId);
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
    ensureRoleTreeVisible(roleId); // 499：选中角色必须在左树视口内（不强制回顶）
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
      // W11（2026-10-16 客户批准）：开会话 loading 行改用**同一枚** SVG 弧线转轮（图源 = role-status.js
      // 的 SPINNER_SVG 单点；边框转轮 .spinner/`spin 0.8s` 已退役——全应用只有一种转轮）。
      : sysRow(pane, "sys-loading", St.SPINNER_SVG, "正在开启与角色 " + roleId + " 的会话…");
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
      var readableHistoryAtOpen = hasTranscript(roleId);
      var res = await d.openSession({
        projectRoot: projectRoot,
        roleId: roleId,
        runtime: runtime,
      });
      if (loading) loading.remove();
      if (selectionVersion !== roleSelectionVersion || state.projectRoot !== projectRoot || state.runtime !== runtime) return;
      if (!res.ok) {
        state.sessionOpenRoleId = null;
        metaFor(roleId).contextText = "会话开启失败"; renderContextState(roleId);
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
      showSessionContext(roleId, res, true, readableHistoryAtOpen);
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
      metaFor(roleId).contextText = "会话开启失败"; renderContextState(roleId);
      metaFor(roleId).error = true; // B-3：会话开启异常
      renderRoleTree();
      sysRow(pane, "sys-call", ICONS.deny, "会话开启异常：" + (err && err.message ? err.message : err));
    }
  }

  function hasTranscript(roleId) {
    var history = replayState[roleId];
    if (history && history.rows.some(function (row) { return row.kind === "user" || row.kind === "assistant" || row.kind === "tool" || row.kind === "denied"; })) return true;
    var rl = paneRowLists[roleId];
    return !!rl && rl.rows.some(function (row) { return ["assistant", "activities", "injected", "replay", "handback", "operator", "tool-lifecycle"].indexOf(row.kind) >= 0 || row.manualClientId; });
  }
  function renderContextState(roleId) {
    var el = $("context-state"); if (!el || backgroundDelivery) return;
    var meta = roleId && state.roleMeta[roleId];
    el.textContent = meta && meta.contextText || "尚未开启会话";
    el.title = meta && meta.contextWarning || "";
    var history = $("history-projection-note");
    if (history) { // U1：历史投影注记与 composer-hint 同住提示条——出现在贴底之后同样补滚（同一口径）
      var pin = noticeLayoutPin();
      history.textContent = meta && meta.historyNotice || "";
      restickAfterNoticeChange(pin);
    }
  }
  function showSessionContext(roleId, info, fromOpen, readableHistoryAtOpen) {
    var meta = metaFor(roleId);
    if (fromOpen && info.resumed === false) meta.readableHistoryAtOpen = readableHistoryAtOpen === true;
    var text = info.resumed || info.contextSource === "resumed" ? "会话继续使用现有上下文" : info.contextSource === "recovered" ? "已从本地恢复模型上下文" : info.contextSource === "fresh" ? info.contextWarning ? "恢复失败，当前为新会话" : "新会话" : "上下文来源未报告";
    if (info.contextSource === "fresh" && meta.readableHistoryAtOpen === true) text += "；可读历史保留，模型未恢复";
    meta.contextText = text; meta.contextWarning = info.contextWarning || "";
    if (roleId === state.selectedRoleId) renderContextState(roleId);
    if (fromOpen && info.resumed === false && ["fresh", "recovered"].indexOf(info.contextSource) >= 0) {
      sysRow(paneFor(roleId), "sys-context-event", ICONS.call, "本次开启会话：" + text + (info.contextWarning ? "。" + info.contextWarning : ""));
    }
    // 仅实际open返回resumed:false留本次事实；快照广播只更新固定区域，不以同文猜生命周期。
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
      if (state.rightTab === "work") reading = reading.work || { full: {}, sections: {} };
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
          (expandable ? '<button class="q-toggle" data-safe-input="' + (v.kind === 'handback') + '" type="button" aria-expanded="' + opened + '" data-id="' + encoded + '" title="展开全文">' + (opened ? '收起' : v.kind === 'handback' ? '交接内容（安全显示副本）' : '全文') + '</button>' : '') +
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
        toggle.textContent = fullEl.hidden ? toggle.dataset.safeInput === "true" ? "交接内容（安全显示副本）" : "全文" : "收起";
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
    if (["card", "work"].indexOf(state.rightTab) < 0 || !renderedDrawerRole) return;
    var body = $("right-body");
    if (body.dataset.drawerView !== state.rightTab) return;
    var base = drawerReading[renderedDrawerRole] || { sections: {}, full: {} };
    var old = state.rightTab === "work" ? base.work || (base.work = { sections: {}, full: {} }) : base;
    old.sectionScroll = old.sectionScroll || {};
    body.querySelectorAll("details[data-section]").forEach(function (d) {
      old.sections[d.dataset.section] = d.open;
      var content = d.querySelector(".card-text");
      if (d.open && content) old.sectionScroll[d.dataset.section] = { top: content.scrollTop, left: content.scrollLeft };
    });
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
    drawerReading[renderedDrawerRole] = base;
  }

  function restoreDrawerReading(roleId) {
    var saved = drawerReading[roleId];
    if (state.rightTab === "work") saved = saved && saved.work;
    var body = $("right-body");
    if (!saved) { body.scrollTop = 0; return; }
    body.querySelectorAll("details[data-section]").forEach(function (d) {
      d.open = saved.sections[d.dataset.section] === true;
      var position = saved.sectionScroll && saved.sectionScroll[d.dataset.section], content = d.querySelector(".card-text");
      if (position && content) { content.scrollTop = position.top; content.scrollLeft = position.left; }
    });
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

  function pendingRequestsHtml(roleId) {
    var ids = openRequestIdsFor(roleId);
    if (!ids.length) return '<p class="muted small">无待处理请求</p>';
    return '<h3 class="work-heading">待处理 ' + ids.length + '</h3><ul class="pending-requests">' + ids.map(function (id) {
      var request = opRequests[id].request;
      return '<li><span>' + esc(request.kind === "choice" ? "待选择" : "待确认") + ' · ' + esc(request.title || "交互请求") + '</span><button type="button" class="btn btn-ghost btn-mini pending-locate" data-request-id="' + esc(id) + '">定位</button></li>';
    }).join("") + '</ul>';
  }
  function workListHtml(roleId) {
    var pending = pendingRequestsHtml(roleId);
    var views = queueViewsFor(roleId);
    if (!views.length) return pending + '<div class="muted small">无进行中或排队消息</div>';
    var running = views.filter(function (v) { return v.pos === "进行中"; });
    var queue = views.filter(function (v) { return v.pos !== "进行中"; });
    return pending + (running.length ? '<h3 class="work-heading">当前工作</h3>' + queueRowsHtml(running) : '') +
      (queue.length ? '<h3 class="work-heading">排队</h3>' + queueRowsHtml(queue) : '');
  }

  function currentWorkReports(roleId) {
    var reports = [], ids = new Set(), objects = new Set();
    function add(report, entry) {
      if (!report || !report.source || !report.summary || typeof report.summary.text !== "string" || report.reportId && report.version !== 1) return;
      var key = report.reportId ? JSON.stringify([report.source.roleId, report.source.runtime, report.reportId]) : null;
      if (key ? ids.has(key) : objects.has(report)) return;
      if (key) ids.add(key); else objects.add(report);
      var record = findCardRecord(entry);
      reports.push({ report: report, key: key, order: record ? record.index : reports.length });
    }
    function matches(entry) { return entry.scope.projectRoot === state.projectRoot && entry.scope.runtime === state.runtime && entry.scope.roleId === roleId; }
    Object.keys(reportCards).forEach(function (key) { var entry = reportCards[key]; if (matches(entry)) add(entry.report, entry); });
    Object.keys(deliveryCards).forEach(function (key) { var entry = deliveryCards[key]; if (matches(entry)) (entry.reports || []).forEach(function (report) { add(report, entry); }); });
    return reports.sort(function (a, b) { return a.order - b.order; });
  }
  function updateWorkReports(roleId) {
    if (backgroundDelivery || state.rightTab !== "work" || state.selectedRoleId !== roleId || renderedDrawerRole !== roleId) return;
    var list = $("right-body").querySelector(".recent-reports"); if (!list) return;
    var scroll = $("right-body").scrollTop, active = document.activeElement, focused = list.contains(active), identity = focused && active.closest(".recent-report");
    var key = identity && identity.dataset.reportIdentity;
    var reports = currentWorkReports(roleId);
    list.innerHTML = '<h3>最近回交</h3>' + (!reports.length ? '<p class="muted small">暂无回交报告</p>' : '');
    reports.forEach(function (value, index) {
      var report = value.report, item = document.createElement("div"); item.className = "recent-report"; item.dataset.reportIdentity = value.key || "live:" + index;
      item.innerHTML = '<p>' + esc(reportDeclaration(report)) + '</p><p>' + esc(Array.from(reportText(report.summary)).slice(0, 120).join("")) + '</p><small class="projection-flags">' + esc(Rt.textFlags(report.summary)) + '</small>';
      sourceDocumentButton(report, item); list.appendChild(item);
    });
    $("right-body").scrollTop = scroll;
    if (focused && document.activeElement === document.body) list.querySelectorAll(".recent-report").forEach(function (item) { if (item.dataset.reportIdentity === key) item.querySelector("button").focus({ preventScroll: true }); });
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

  /** 任一应用内模态确认卡可见（shell 命令确认卡 M-1 / 恢复确认卡 G-2；同开时都算——抽屉让位）。
   *  供抽屉 inert、focusin 归位与 Tab 焦点圈共用（单一判据，不逐卡重写）。 */
  function anyConfirmOverlayOpen() {
    return !$("shell-confirm").hidden || !$("recovery-confirm").hidden;
  }

  /** 右上角图标簇的**角标**：第二轮裁定（2026-10-13）待办/队列归角色、簇只留两枚——「角色资料」图标角标 =
   *  当前选中角色的待办深度（进行中+排队视图行数；继承原待办图标角标语义；同一 role-state 快照，无新数据源）。 */
  function syncDrawerModal() {
    if (backgroundDelivery) return;
    var open = state.rightTab !== null, drawer = $("right-drawer");
    [document.querySelector(".col-left"), document.querySelector(".col-mid")].forEach(function (element) { if (element) element.inert = open; });
    $("drawer-backdrop").hidden = !open;
    drawer.setAttribute("aria-hidden", String(!open));
    drawer.inert = !open || anyConfirmOverlayOpen();
  }
  function drawerFocusables() {
    return Array.from($("right-drawer").querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')).filter(function (element) { return !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[hidden]'); });
  }
  function renderTabs() {
    if (backgroundDelivery) return;
    var roleId = state.selectedRoleId;
    var views = roleId ? queueViewsFor(roleId) : [];
    setTabBadge("work", views.length + (roleId ? openRequestCountFor(roleId) : 0));
    ["work", "card", "pi"].forEach(function (id) {
      var b = $("tab-" + id);
      if (b) b.classList.toggle("active", state.rightTab === id);
    });
    var drawer = $("right-drawer");
    if (drawer) drawer.classList.toggle("open", state.rightTab !== null);
    syncDrawerModal();
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
    if (state.rightTab === "document") invalidateDocumentRead();
    drawerInvoker = $("tab-" + tab) || document.activeElement;
    state.rightTab = state.rightTab === tab ? null : tab;
    renderRight();
    renderTabs();
    if (state.rightTab) $("drawer-close").focus();
    else restoreInvoker($("tab-" + tab));
    if (state.rightTab === "pi") void loadPiConfig(); // Pi 面板每次展开都重取视图（掩码/缺项告警如实）
  }

  function closeRightDrawer() {
    if (state.rightTab === null) return;
    captureDrawerReading();
    var priorTab = state.rightTab;
    documentReadVersion += 1; documentView = null;
    state.rightTab = null;
    renderRight();
    renderTabs();
    restoreInvoker($(priorTab === "pi" ? "tab-pi" : priorTab === "work" ? "tab-work" : "tab-card"));
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
    body.dataset.drawerView = tab || "";
    var titles = { work: "工作概览", card: "角色资料", pi: Rt.runtimeLabel(state.runtime) + " 配置" };
    var settingsTab = $("tab-pi");
    settingsTab.title = Rt.runtimeLabel(state.runtime) + " 设置";
    settingsTab.setAttribute("aria-label", settingsTab.title);
    if (titleEl) titleEl.textContent = titles[tab] || "角色资料";
    syncPiPanel();
    if (!tab) {
      body.innerHTML = "";
      return;
    }
    if (tab === "document") { renderDocumentView(); return; }
    if (tab === "pi") {
      body.innerHTML = ""; // Pi 面板本体（#pi-panel）在抽屉内由 syncPiPanel 控制显隐——不在此重渲染
      return;
    }
    var role = selectedRole();
    if (!role) {
      body.innerHTML =
        '<div class="right-empty">' +
        '<p class="empty-title">选择角色后查看资料</p>' +
        '<p class="empty-sub">先在左侧选择角色，再从会话头部的“角色资料”或“工作概览”打开对应面板；内容跟随当前角色。</p>' +
        "</div>";
      return;
    }
    if (tab === "work") {
      if (titleEl) titleEl.textContent = role.roleId + " · 工作概览";
      body.innerHTML = '<div id="right-queue-body" class="role-work">' + workListHtml(role.roleId) + '</div><section class="recent-reports"><h3>最近回交</h3></section>';
      renderedDrawerRole = role.roleId; updateWorkReports(role.roleId); restoreDrawerReading(role.roleId); return;
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
    var html = "";
    html += sec("角色卡", null,
      '<div class="kv">' + esc(role.cardPath) + "</div>" +
      // N-2（2026-10-12 客户裁定）：「右边的角色卡要有 markdown 渲染」——走**既有 Markdown 管线**
      // （`Md.renderMarkdown` 同一 `esc` 单一来源；转义/白名单不变：html:false、链接 rel + `md-link` 类、
      // 图片=原文文本；表格已启用（2026-10-13），单元格照常转义）。`card-md` 只是这套渲染产物的样式钩子。
      '<div class="card-text card-md">' + Md.renderMarkdown(role.cardText || "（空）") + "</div>", false);
    html += sec("边界条目", entries.length, renderBoundaryTable(role.boundary), false);
    html += sec("变更记录", role.changelog ? null : "无", renderChangelog(role), false);
    html += sec("文档", role.docs && role.docs.filter(function (item) { return item.kind === "file"; }).length || "无", renderDocs(role), false);
    body.innerHTML = html;
    var documentEntry = document.createElement("button"); documentEntry.className = "btn btn-ghost btn-mini role-document-entry"; documentEntry.textContent = "查看已列文档";
    documentEntry.addEventListener("click", function () { documentList(role.roleId, documentEntry, "card"); }); body.appendChild(documentEntry);
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
    // H-1 附录：记「本端手发送的最近一条」（随运行时视图捕获/恢复）。**仅是记录**：回显防误伤的判据
    // 已改为身份绑定（本函数下方 `manualMessages[clientMessageId]` + `bindManualTurn` 的 canonical 键
    // `["input", turnId]`，去重在 `appendOneEvent`）——不再有读取方，勿据此记录做归类判断。
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
    var message = manualMessages[clientMessageId];
    function clearSendHint() {
      if (!backgroundDelivery && currentHintSource && currentHintSource.kind === "send" && currentHintSource.clientMessageId === clientMessageId && currentHintSource.projectRoot === projectRoot && currentHintSource.runtime === runtime) setHint("");
    }
    function reconcileFailedSend() {
      var result = message.result;
      if (!result || result.ok) return;
      if (message.inputAccepted) clearSentAttachments(role.roleId, sentKeys);
      var outcome = message.outcome;
      if (outcome === "aborted" || outcome === "completed") {
        metaFor(role.roleId).error = false;
        clearSendHint(); renderRoleTree(); return;
      }
      if (!outcome && message.turnId) {
        if (!backgroundDelivery && state.selectedRoleId === role.roleId && (!currentHintSource && !$("composer-hint").textContent || currentHintSource && currentHintSource.kind === "send" && currentHintSource.clientMessageId === clientMessageId)) setHint("发送调用未正常返回，实际轮次结果尚未报告。", { kind: "send", projectRoot: projectRoot, runtime: runtime, roleId: role.roleId, clientMessageId: clientMessageId });
        return;
      }
      clearSendHint();
      metaFor(role.roleId).error = true;
      if (!message.inputAccepted) {
        restoreFailedDraft();
        if (result.sessionCurrent == null && !message.turnId && state.projectRoot === projectRoot && state.sessionOpenRoleId === role.roleId) { state.sessionOpenRoleId = null; if (!backgroundDelivery) updateControls(); }
      }
      // 已接受轮次由真实settled记录报告失败；拒发仍保留原发送错误。
      if (!message.inputAccepted && !message.failureShown) { message.failureShown = true; sysRow(pane, "sys-call", ICONS.deny, (result.transportException ? "发送异常：" : "发送失败：") + (result.error || "")); }
      renderRoleTree();
    }
    message.onFacts = reconcileFailedSend;
    try {
      var res = await d.sendSession(text, images, { projectRoot: projectRoot, roleId: role.roleId, runtime: runtime }, { clientMessageId: clientMessageId });
      deliverRuntimePayload({projectRoot:projectRoot,roleId:role.roleId,runtime:runtime}, function () {
      if (!res.ok) {
        if (res.clientMessageId != null && res.clientMessageId !== clientMessageId || res.turnId && message.turnId && res.turnId !== message.turnId) { if (!backgroundDelivery) setHint("发送返回的轮次身份不一致，未改写当前会话。"); return; }
        if (typeof res.turnId === "string" && res.turnId) message.turnId = res.turnId;
        if (res.inputAccepted === true && message.turnId) message.inputAccepted = true;
        if (!message.outcome && message.turnId && ["completed", "failed", "aborted", "timed_out"].indexOf(res.outcome) >= 0) message.outcome = res.outcome;
        message.result = res;
        reconcileFailedSend();
      } else if (res.queued === true) {
        // L-1：角色忙——消息**已入队**（不再直接失败）；如实提示位次。徽标/队列行由主进程真实快照驱动
        // （onRoleState），此处不自设忙态（准确性裁定）。图片**入队即定格**（排队后到投递都带原图）。
        stampLastEvent(role.roleId, "你：" + firstLine(text));
        var queuedMsg = "已入队：等它完成当前任务后处理（第 " + (res.position || 1) + " 位）。";
        sysRow(pane, "sys-queue", ICONS.clock, queuedMsg);
        if (state.selectedRoleId === role.roleId && !manualMessages[clientMessageId].turnId) setHint(queuedMsg, { kind: "queue", projectRoot: projectRoot, runtime: runtime, roleId: role.roleId, clientMessageId: clientMessageId });
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
      message.result = { ok: false, transportException: true, error: String(err && err.message || err) };
      reconcileFailedSend();
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
  function alignEngineMenu() {
    var menu = $("runtime-options"); if (menu.hidden) return;
    var rect = $("runtime-select").getBoundingClientRect();
    var position = window.ANSEngineSelector.placement({ left: rect.right - menu.offsetWidth, top: rect.top, bottom: rect.bottom, height: rect.height }, { width: window.innerWidth, height: window.innerHeight }, menu.offsetWidth, menu.offsetHeight);
    menu.style.left = position.left + "px";
  }
  [$("runtime-select"), $("runtime-options")].forEach(function (element) { element.addEventListener("click", alignEngineMenu); element.addEventListener("keydown", alignEngineMenu); });
  window.addEventListener("resize", alignEngineMenu);
  window.addEventListener("scroll", alignEngineMenu, true);

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
  $("tab-work").addEventListener("click", function () { toggleRightDrawer("work"); });
  $("tab-card").addEventListener("click", function () { toggleRightDrawer("card"); });
  // P1-1：抽屉内待办行的「全文 / 撤回」点击（事件委托挂 Persistent 的 #right-body——行重渲染不丢绑定）。
  $("right-body").addEventListener("click", onRightBodyClick);
  $("right-body").addEventListener("click", onDocumentAction);
  $("right-body").addEventListener("click", function (event) {
    var button = event.target.closest(".pending-locate"); if (!button) return;
    var id = button.dataset.requestId, entry = opRequests[id]; if (!entry || entry.roleId !== state.selectedRoleId) return;
    closeRightDrawer(); scrollToOperatorCard(entry.roleId, id);
    var card = cardElInPane(paneFor(entry.roleId), id); if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
  });
  $("drawer-close").addEventListener("click", closeRightDrawer);
  // Markdown 链接（B-1）：点聊天流里的链接一律**外开**（事件委托挂在 #chat 上——pane 切换不丢）。
  $("chat").addEventListener("click", onChatLinkClick);
  // Q-2：滚动 → rAF 合帧 → 一次虚拟窗口更新（窗口化长转录时按需挂载/回收）。
  $("chat").addEventListener("scroll", onChatScroll);
  // shell 命令确认卡（M-1）：拒绝为默认焦点；关闭（×）/ Esc / 「拒绝」= **不放行**（fail-closed 的 UI 侧同向）。
  $("sc-deny").addEventListener("click", function () { respondShellConfirm(false); });
  $("sc-allow").addEventListener("click", function () { respondShellConfirm(true); });
  $("sc-close").addEventListener("click", function () { respondShellConfirm(false); });
  // 恢复确认卡（G-2/U1）：同款 fail-closed——取消为默认焦点；关闭（×）/ Esc / 「取消」= **不执行**。
  $("rc-deny").addEventListener("click", function () { respondRecoveryConfirm(false); });
  $("rc-allow").addEventListener("click", function () { respondRecoveryConfirm(true); });
  $("rc-close").addEventListener("click", function () { respondRecoveryConfirm(false); });
  $("drawer-backdrop").addEventListener("click", closeRightDrawer);
  document.addEventListener("focusin", function (event) {
    if (state.rightTab !== null && !anyConfirmOverlayOpen() && !$("right-drawer").contains(event.target) && !event.target.closest(".win-btn")) $("drawer-close").focus({ preventScroll: true });
  });
  document.addEventListener("keydown", function (e) {
    // 两卡同开时 Esc 先答**上层**那张（recovery 在 DOM 里声明于 shell 之后 ⇒ 视觉在上；
    // 两者 Esc 都 = 否决——fail-closed 优先级不受顺序影响）。
    if (e.key === "Escape" && state.recoveryConfirm) {
      e.preventDefault();
      respondRecoveryConfirm(false);
      return;
    }
    if (e.key === "Escape" && state.shellConfirm) {
      e.preventDefault();
      respondShellConfirm(false);
      return;
    }
    if (e.key === "Tab" && state.rightTab !== null && !anyConfirmOverlayOpen()) {
      var focusable = drawerFocusables(), index = focusable.indexOf(document.activeElement);
      if (!focusable.length) { e.preventDefault(); $("right-drawer").focus(); }
      else if (e.shiftKey && index <= 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!e.shiftKey && (index < 0 || index === focusable.length - 1)) { e.preventDefault(); focusable[0].focus(); }
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
  var persistenceUnsubscribers = [];
  if (d.onReportPersistenceUpdated) persistenceUnsubscribers.push(d.onReportPersistenceUpdated(onPersistenceUpdate));
  if (d.onDeliveryHistoryUpdated) persistenceUnsubscribers.push(d.onDeliveryHistoryUpdated(onPersistenceUpdate));
  window.addEventListener("beforeunload", function () { persistenceUnsubscribers.forEach(function (off) { if (typeof off === "function") off(); }); });
  if (d.onOperatorRequest) d.onOperatorRequest(function (payload) { deliverRuntimePayload(payload, appendOperatorRequest); });
  if (d.onOperatorExpired) d.onOperatorExpired(function (payload) { deliverRuntimePayload(payload, onOperatorExpired); });
  // shell 命令确认卡（M-1）：主进程推来的数据面 → 应用内卡片（拒绝为默认；Esc/关闭 = 不放行）。
  if (d.onShellConfirm) d.onShellConfirm(function (payload) { deliverRuntimePayload(payload, onShellConfirm); });
  // 恢复确认卡（G-2/U1，2026-10-16 客户批准）：su 提议的恢复动作数据面 → 应用内卡片
  // （取消为默认；恰「执行」= allow:true；Esc/关闭 = 不执行）。通道缺席（W5 未落树）⇒ 不订阅、零影响。
  if (d.onRecoveryConfirm) d.onRecoveryConfirm(function (payload) { deliverRuntimePayload(payload, onRecoveryConfirm); });
  // 会话记录恢复（D-1）：主进程推来的规范化界面行 → 回放进该角色的 pane（解析在主进程；渲染侧不碰 SDK）。
  if (d.onSessionHistory) d.onSessionHistory(function (payload) {
    if (!state.projectRoot || payload.projectRoot && payload.projectRoot !== state.projectRoot) { pendingHistories.push(payload); return; }
    deliverRuntimePayload(payload, onSessionHistory);
  });
  // L-1 + 状态准确性：每角色**真实状态快照**（busy × 队列摘要，变化时）→ 徽标「工作中 · N 待办」+ 队列行。
  if (d.onRoleState) d.onRoleState(function (payload) { deliverRuntimePayload(payload, onRoleState); });

  initSidebar(); // 读 localStorage（默认展开/坏值回退）并绑定收起/展开按钮
  ensureGovernanceUi(); // I4：提前建立状态行/预览容器（hidden）——`.session-notice` 的显隐判据因此稳定
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
    // 可收起左栏探针（只读状态 + 切换）：判据仍是 `.app.is-sidebar-collapsed` 单点。
    sidebar: {
      collapsed: sidebarCollapsedNow,
      toggle: toggleSidebar,
      set: function (collapsed) {
        var chat = $("chat"), top = chat ? chat.scrollTop : 0;
        applySidebarCollapsed(collapsed === true);
        writeSidebarCollapsed(sidebarCollapsedNow());
        if (chat) chat.scrollTop = top;
      },
      width: currentSidebarWidth,
      setWidth: function (width) { var w = applySidebarWidth(width); writeSidebarWidth(w); return w; },
    },
    // I4（2026-10-17）：治理记录探针（只读状态 + 三个入口）——供 e2e 驱动非模态预览/取消/建立；
    // 判据仍只有 `governanceActionVisible()` 一个入口（探针不另算）。
    governance: {
      state: function () {
        return {
          record: governanceRecordOf(),
          action: governanceActionVisible(),
          visible: governanceActionVisible(),
          open: governanceFlow.open,
          mode: governanceFlow.mode,
          busy: governanceFlow.busy,
          preview: governanceFlow.preview,
          error: governanceFlow.error,
          result: governanceFlow.result,
        };
      },
      openPreview: openGovernancePreview,
      cancelPreview: cancelGovernancePreview,
      confirm: confirmGovernanceEstablish,
      confirmReaccept: confirmGovernanceReaccept,
    },
    // L-1/状态准确性：供探针直接注入真实快照（按 IPC 契约 `{roleId, busy, summaries}`）。
    onRoleState: function (payload) { deliverRuntimePayload(payload, onRoleState); },
    onOperatorExpired: function (payload) { deliverRuntimePayload(payload, onOperatorExpired); },
    // M-1：供探针直接注入 shell 确认数据面（按 IPC 契约 `{id, command, summary, reasonPlain, …}`）。
    onShellConfirm: onShellConfirm,
    // G-2/U1：供探针直接注入恢复确认数据面（按 IPC 契约 `{id, roleId, action, evidence, …}`；
    // 回包仍走 `d.recoveryConfirmRespond`——通道缺席时如实终态「未能回传……不执行」）。
    onRecoveryConfirm: onRecoveryConfirm,
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
