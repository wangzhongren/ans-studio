// app/renderer/renderer.js —— 三栏界面逻辑（经典脚本；无 Node、无 fs，仅经 window.desktop 调主进程）。
//
// 交互模型（客户最终定稿）：导入项目 = 授权；点角色 → 立即进入聊天（无确认弹窗）；
// 多轮直发；越界写入被门禁拦截后在聊天流里内联显示（可展开看允许路径）。
// 同一角色重复点击 = 续接当前会话；切换角色 = 先结束旧会话再开新会话。
(function () {
  "use strict";

  var d = window.desktop;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    projectRoot: null,
    roles: [],
    // 主入口角色 id：**原样转自门禁引擎 listProject 的 primaryRoleId**（§10.7），渲染侧据此设主位/默认选中，
    // **不硬编码 "su"**。null = 尚未导入项目。
    primaryRoleId: null,
    // 项目是否已 bootstrap（枚举到项目角色）：原样转自门禁引擎 listProject 的 hasRoles（§10.3）。
    hasRoles: true,
    selectedRoleId: null,
    sessionOpenRoleId: null, // 当前已开启会话的角色 id（null=未开启）
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
    pen:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    handback:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v2"/></svg>',
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHint(text) { $("composer-hint").textContent = text || ""; }

  function setState(kind, label) {
    var el = $("session-state");
    el.className = "pill " + (kind === "run" ? "pill-run" : kind === "err" ? "pill-err" : "pill-idle");
    el.textContent = label;
  }

  function setChatHeader(role) {
    $("chat-role").textContent = role ? role.roleId : "未选择角色";
    $("chat-role-sub").textContent = role
      ? "会话由治理引擎全程把关，写入受该角色边界约束"
      : "从左侧选择一个角色开始聊天";
  }

  /**
   * 空聊天区：**这是「未 bootstrap」这件事唯一该说的地方**（客户裁定：它曾同时出现在中栏横栏、中栏正中、左栏三处，
   * 收敛为只在此处）——若 `hasRoles === false`，标题/说明引导与 su 对话、把角色建出来，并给一个
   * **「开始与 <主入口> 对话」主按钮**（§10.7，`primaryRoleId` 驱动、不硬编码）。注意：默认主路径是 su，
   * 但**不自动开会话**（避免每次导入都起会话）。
   */
  function clearChat() {
    hideBootstrapAction();
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
    $("chat").innerHTML =
      '<div class="chat-empty">' +
      '<p class="empty-title">' + title + "</p>" +
      '<p class="empty-sub">' + sub + "</p>" +
      cta +
      "</div>";
    var b = $("btn-start-primary");
    if (b) {
      b.addEventListener("click", function () { selectRole(state.primaryRoleId); });
    }
  }

  function scrollBottom() {
    var chat = $("chat");
    chat.scrollTop = chat.scrollHeight;
  }

  /** 取首行（拒绝摘要的折叠标题用；在换行或分号处截断）。 */
  function firstLine(text) {
    var s = String(text == null ? "" : text);
    var i = s.search(/[\n；;]/);
    return i >= 0 ? s.slice(0, i) : s;
  }

  // —————— 事件渲染：气泡 / 系统状态行 / 内联拒绝 ——————
  function appendUser(text) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var div = document.createElement("div");
    div.className = "msg msg-user";
    div.textContent = text;
    chat.appendChild(div);
    scrollBottom();
  }

  function appendAssistant(text) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var div = document.createElement("div");
    div.className = "msg msg-assistant";
    div.textContent = text;
    chat.appendChild(div);
    scrollBottom();
  }

  function sysRow(cls, icon, text) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var div = document.createElement("div");
    div.className = "sys " + cls;
    div.innerHTML = '<span class="sys-ico">' + icon + '</span><span class="sys-text">' + esc(text) + "</span>";
    chat.appendChild(div);
    scrollBottom();
    return div;
  }

  function removeLoading() {
    var el = $("chat").querySelector(".sys-loading");
    if (el) el.remove();
  }

  /** 拒绝事件：内联显示，点击可展开看完整信息（含按根分组的允许路径）。 */
  function appendDenied(text) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var det = document.createElement("details");
    det.className = "sys-denied";
    det.innerHTML =
      "<summary>" + ICONS.deny + "<span>" + esc(firstLine(text)) + "</span>" + ICONS.chev + "</summary>" +
      '<div class="sys-detail">' + esc(text) + "</div>";
    chat.appendChild(det);
    scrollBottom();
  }

  /**
   * 回交（设计 §10.8）：角色会话**完成一个任务**时，编排在 `settled` 之前发一个 `handback` 事件
   * （`{roleId, taskId?, status, summary, evidence, at}`，「只搬证据、不搬身份/写权」）。
   *
   * 呈现（客户原话「其他的角色完成了要返回给 su」）：
   *  - 在**产出该回交的角色自己的聊天里**显示一张「**回交 su**」卡片；
   *  - **若 su 会话开着**（当前打开的即主入口角色），把该回交**镜像进 su 的聊天流**——标题为
   *    「**来自 <role> 的报告**」。
   *
   * 本函数只**呈现**事件携带的结构化数据，**不作任何判定**（是否完成/是否被拦由编排给出）。
   * 回交「属于」当前聊天流的判据（纯呈现层，非边界/写权判定）：当前打开会话是**产出它的角色**（自己的聊天），
   * 或当前打开会话是**主入口角色 su**（镜像）。二者皆非则该回交不属于当前流，跳过。
   */
  function handbackTarget(hb) {
    var open = state.sessionOpenRoleId;
    if (!open || !hb) return null;
    if (open === hb.roleId) return { mirror: false };
    if (open === state.primaryRoleId) return { mirror: true };
    return null;
  }

  function appendHandback(hb) {
    var target = handbackTarget(hb);
    if (!target) return;
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var blocked = hb.status === "blocked";
    var statusLabel = blocked ? "被拦下" : "已完成";
    var title = target.mirror ? "来自 " + esc(hb.roleId) + " 的报告" : "回交 su";
    var evItems = hb.evidence && hb.evidence.length
      ? hb.evidence.map(function (e) { return '<li class="hb-ev">' + esc(e) + "</li>"; }).join("")
      : '<li class="hb-ev hb-ev-empty">（无被接受的写入证据）</li>';
    var meta = "角色 " + esc(hb.roleId) + (hb.taskId ? "，任务 " + esc(hb.taskId) : "");
    var card = document.createElement("div");
    card.className = "msg-handback" + (target.mirror ? " is-mirror" : "");
    card.innerHTML =
      '<div class="hb-head">' +
      '<span class="hb-ico">' + ICONS.handback + "</span>" +
      '<span class="hb-title">' + title + "</span>" +
      '<span class="hb-status ' + (blocked ? "hb-blocked" : "hb-ok") + '">' + statusLabel + "</span>" +
      "</div>" +
      '<div class="hb-meta">' + meta + "</div>" +
      '<div class="hb-summary">' + esc(hb.summary || "") + "</div>" +
      '<ul class="hb-evidence">' + evItems + "</ul>";
    chat.appendChild(card);
    scrollBottom();
  }

  // —————— 创世 finalize（T36/T38）：su 提议收口 → 客户确认 → 完成 ——————
  // 客户裁定（设计 §13）：完成 bootstrap = **su 主动提议「可以收口了」→ 界面把这件事摆给客户 → 客户确认 →
  // 才落盘**。故界面分两步：
  //  ① **触发**（`#bootstrap-action`）——仅**创世 su 会话**（未 bootstrap 项目上开启的内置治理角色会话）显示；
  //     su 已 settle（说过话）时按钮可用。点它 = 请 su 发起收口提议（T37 的 finalize 语义 = 提议、非立即完成）。
  //  ② **确认面**（聊天流里的确认卡 `appendFinalizeProposal`）——**只在 su 已提议时才出现**（不是一直挂着的
  //     按钮）：提议原文 + 将写出什么 + `[确认完成]`/`[暂不]`。客户选择经 `finalizeConfirm` 回传。
  // 结果由**代码**（非模型）落盘并**如实**呈现（成功示 wrote/pins/roles，被拒示 reason）；**界面不作判定**。

  function hideBootstrapAction() {
    var el = $("bootstrap-action");
    if (el) { el.hidden = true; el.innerHTML = ""; }
  }

  function renderBootstrapAction(st) {
    var el = $("bootstrap-action");
    if (!el) return;
    if (!st || !st.available) { hideBootstrapAction(); return; }
    var hint = st.settled
      ? "su 已完成至少一轮——点「让 su 提议收口」发起提议，你在聊天流里确认后才落盘。"
      : "su 还没有完成任何一轮。现在点会被拒（无可 pin 之物）——先与 su 对话，让它把角色建出来。";
    el.hidden = false;
    el.className = "bootstrap-action " + (st.settled ? "is-ready" : "is-pending");
    el.innerHTML =
      '<span class="ba-ico">' + ICONS.shield + "</span>" +
      '<div class="ba-main">' +
      '<span class="ba-title">完成 bootstrap</span>' +
      '<span class="ba-hint">' + esc(hint) + "</span>" +
      "</div>" +
      '<button id="btn-finalize" class="btn btn-primary ba-btn">让 su 提议收口</button>';
    var b = $("btn-finalize");
    if (b) b.addEventListener("click", onFinalize);
  }

  /** 查询当前会话的 finalize 入口状态并渲染（未开会话 / 非创世 su 会话 → 隐藏入口）。 */
  async function refreshBootstrapAction() {
    if (!state.sessionOpenRoleId) { hideBootstrapAction(); return; }
    try {
      var st = await d.getBootstrapState();
      renderBootstrapAction(st);
    } catch (err) {
      // 状态查询失败：隐藏入口（fail-safe——不显示可能误导的动作），不静默报错刷屏。
      hideBootstrapAction();
    }
  }

  /**
   * **su 提议收口**（T38）：finalize 收口时主进程把「su 提议」推来——在**聊天流里**渲染一张**确认卡**：
   * 提议原文（如「su 提议：可以收口了（完成 bootstrap）」）+ 将写出什么（reason）+ `[确认完成]` / `[暂不]`。
   *
   * **这是「确认面」——只在 su 已提议时才出现**（不是一直挂着的按钮）。点 `[确认完成]` 回传
   * `finalizeConfirm({toolCallId, allow:true})` → 落盘；点 `[暂不]` 回传 allow:false → **不完成**，
   * su 可继续工作或稍后再提议。界面**不作判定**：是否落盘由门禁 + finalize 决定，结果随后如实呈现。
   */
  function appendFinalizeProposal(p) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var toolCallId = p && p.toolCallId ? String(p.toolCallId) : "";
    var card = document.createElement("div");
    card.className = "msg-finalize-proposal";
    card.dataset.toolCallId = toolCallId;
    card.innerHTML =
      '<div class="fp-head">' +
      '<span class="fp-ico">' + ICONS.shield + "</span>" +
      '<span class="fp-title">' + esc((p && p.proposal) || "su 提议：可以收口了（完成 bootstrap）") + "</span>" +
      "</div>" +
      '<div class="fp-reason">' + esc((p && p.reason) || "") + "</div>" +
      '<div class="fp-actions">' +
      '<button class="btn btn-primary fp-confirm" type="button">确认完成</button>' +
      '<button class="btn btn-ghost fp-dismiss" type="button">暂不</button>' +
      "</div>";
    chat.appendChild(card);
    scrollBottom();

    var decided = false;
    function decide(allow) {
      if (decided) return;
      decided = true;
      var actions = card.querySelector(".fp-actions");
      if (actions) {
        actions.innerHTML = allow
          ? '<span class="fp-note fp-note-ok">已确认——正在收口（写出 .ans 与 manifest）…</span>'
          : '<span class="fp-note">已暂不——su 可继续工作；稍后仍可再提议收口。</span>';
      }
      Promise.resolve(d.finalizeConfirm({ toolCallId: toolCallId, allow: allow })).catch(function () {});
    }
    var c = card.querySelector(".fp-confirm");
    var x = card.querySelector(".fp-dismiss");
    if (c) c.addEventListener("click", function () { decide(true); });
    if (x) x.addEventListener("click", function () { decide(false); });
  }

  /** 如实呈现一次 finalize 结果：成功示写出了什么（wrote/pins/roles）；被拒示原因（不假装成功）。 */
  function appendFinalizeResult(res) {
    var chat = $("chat");
    var empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();
    var det = document.createElement("details");
    if (res && res.ok) {
      var pinRows = (res.pins || []).map(function (p) {
        return '<tr><td class="path">' + esc(p.path) + '</td><td class="sha">' + esc(p.sha256) + "</td></tr>";
      }).join("");
      var wroteItems = (res.wrote || []).map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
      det.className = "sys-finalize is-ok";
      det.open = true;
      det.innerHTML =
        "<summary>" + ICONS.ok + "<span>项目已转正：bootstrap 已完成——写出 " + (res.wrote || []).length +
        " 项、pin " + (res.pins || []).length + " 个边界文件、角色 " + (res.roles || []).length + " 个。</span>" + ICONS.chev + "</summary>" +
        '<div class="sys-detail">' +
        "<p>项目已从「创世态」进入「正式态」。<strong>su 仍可继续新增/修改角色</strong>（边界由项目的治理边界文档治理；此后每轮 su 会话 settle 后 pin 自动刷新）。</p>" +
        "<p>写出的路径：</p><ul class=\"fin-wrote\">" + (wroteItems || "<li>（无）</li>") + "</ul>" +
        "<p>Pin 的边界文件（SHA-256）：</p>" +
        '<table class="fin-pins"><thead><tr><th>路径</th><th>SHA-256</th></tr></thead><tbody>' +
        (pinRows || '<tr><td colspan="2">（无）</td></tr>') + "</tbody></table>" +
        "<p>Pin 的角色：" + esc((res.roles && res.roles.join("、")) || "（无）") + "</p>" +
        "</div>";
    } else {
      det.className = "sys-finalize is-denied";
      det.open = true;
      det.innerHTML =
        "<summary>" + ICONS.deny + "<span>收口未完成：" + esc(firstLine((res && res.reason) || "未知原因")) +
        "</span>" + ICONS.chev + "</summary>" +
        '<div class="sys-detail">' + esc((res && res.reason) || "未知原因") + "</div>";
    }
    chat.appendChild(det);
    scrollBottom();
  }

  /**
   * 点「让 su 提议收口」：请 su 发起收口提议（T37 的 finalize 语义 = 提议、**非立即完成**）——提议会经
   * `session:finalize-proposal` 推回、渲染成聊天流里的**确认卡**（`appendFinalizeProposal`）；客户确认后才落盘。
   * 结果如实呈现（成功/被拒），随后刷新入口可见性。
   */
  async function onFinalize() {
    var btn = $("btn-finalize");
    if (btn) btn.disabled = true;
    var loading = sysRow("sys-loading", '<span class="spinner"></span>', "正在请 su 发起收口提议…");
    try {
      var res = await d.finalizeBootstrap();
      loading.remove();
      appendFinalizeResult(res);
      // 成功后 available 变假 → 入口隐藏；未确认/被拒则保留入口（用户可补救后再点）。
      await refreshBootstrapAction();
    } catch (err) {
      loading.remove();
      sysRow("sys-call", ICONS.deny, "收口异常：" + (err && err.message ? err.message : err));
    } finally {
      var b2 = $("btn-finalize");
      if (b2) b2.disabled = false;
    }
  }

  function appendEvent(ev) {
    var kind = ev.kind || "message";
    if (kind === "handback") appendHandback(ev.handback);
    else if (kind === "message") appendAssistant(ev.summary);
    else if (kind === "tool_call") sysRow("sys-call", ICONS.call, ev.summary);
    else if (kind === "accepted") sysRow("sys-ok", ICONS.ok, ev.summary);
    else if (kind === "denied") appendDenied(ev.summary);
    else if (kind === "settled") {
      // 一轮结束：su 可能已建出角色 / 已 settle → 刷新「完成 bootstrap」入口的可见性/就绪态（T36）。
      sysRow("sys-settled", ICONS.call, ev.summary);
      void refreshBootstrapAction();
    }
    else sysRow("sys-settled", ICONS.call, ev.summary);
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
  function appendConfigNote(cfg) {
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
    sysRow("sys-config", ICONS.readonly, text);
  }

  /**
   * 写入语义（设计 §3.9 更正，2026-10-11；客户同日裁定去掉运行时选择器、默认跑 pi）。
   *
   * 桌面一律走 **pi 真实运行时**（`writeRoot = projectRoot`，经编排 `createPiAdapterFactory` → 真实适配器）：
   * **写入会真正落到导入的项目**，但仍受门禁约束（角色边界 Section 1 + acceptance，与 CLI 同一套
   * `resolveWrite`），**越界写在写之前被拒**。文案只述运行时语义（界面层**不作判定**），判定仍唯一来自门禁引擎。
   *
   * 位置（客户 2026-10-11 裁定）：原来在底部输入区的常驻说明**上移到中栏横栏**（与状态提示同一行），只留一句。
   */
  var WRITE_NOTE = "写入会真正落到你导入的项目，但受该角色边界约束，越界写会在写之前被拒。";

  /** 横栏常驻写入语义（单一来源；无运行时分支——桌面一律 pi）。 */
  function renderWriteNote() {
    var el = $("runtime-note");
    if (!el) return;
    el.className = "runtime-note";
    el.innerHTML = '<span class="rt-ico">' + ICONS.pen + '</span><span class="rt-text">' + esc(WRITE_NOTE) + "</span>";
  }

  // —————— Pi 配置面板（设计 §11/T28）：设置 pi 运行时配置 → 保存到仓库根 .env ——————
  // 与主进程 pi-config.ts 的 PI_PANEL_KEYS 一致；token 为机密：**值永不回显**（主进程只给 isSet 布尔、
  // 恒返回空 value），此处字段恒为 password 型、只示「已设置/未设置」。界面**不作任何判定**（掩码/读写
  // 全在主进程侧经共享 env-file 模块，单一来源）。
  var PI_KEYS = [
    "ANTHROPIC_AUTH_TOKEN",
    "ANS_PI_BASE_URL",
    "ANS_PI_MODEL",
    "ANS_PI_PROVIDER",
    "ANS_PI_CONTEXT_WINDOW",
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
    PI_KEYS.forEach(function (key) {
      var inp = piInput(key);
      if (!inp) return;
      var f = piFieldByKey(key);
      if (key === "ANTHROPIC_AUTH_TOKEN") {
        inp.value = ""; // 绝不回显值
        inp.placeholder = f && f.isSet ? "已设置，留空则不修改" : "未设置";
        inp.type = "password";
        var tg = $("pi-toggle-secret");
        if (tg) tg.textContent = "显示";
      } else {
        inp.value = f ? f.value : "";
      }
    });
  }

  /** 选 pi 但配置不全 → 明确告警（fail-closed 的补救入口提示）；齐备则如实示「已齐备」。 */
  function renderPiConfigWarning() {
    if (!piView || !piView.fields) { setPiStatus("", ""); return; }
    var missing = piView.fields.filter(function (f) { return !f.isSet; }).map(function (f) { return f.key; });
    if (missing.length) {
      setPiStatus("Pi 配置不完整，缺：" + missing.join("、") + "——选 pi 开会话会被拒（fail-closed），请补齐后保存。", "warn");
    } else {
      setPiStatus("Pi 配置已齐备。", "ok");
    }
  }

  async function loadPiConfig() {
    try {
      var view = await d.getPiConfig();
      applyPiView(view);
      renderPiConfigWarning();
    } catch (err) {
      // 读取失败（如 .env 不可读）如实呈现，不静默。
      setPiStatus("读取 .env 失败：" + (err && err.message ? err.message : err), "err");
    }
  }

  function openPiPanel() {
    var panel = $("pi-panel");
    if (!panel) return;
    panel.hidden = false;
    void loadPiConfig();
  }

  function closePiPanel() {
    var panel = $("pi-panel");
    if (panel) panel.hidden = true;
  }

  function togglePiPanel() {
    var panel = $("pi-panel");
    if (panel && !panel.hidden) closePiPanel(); else openPiPanel();
  }

  /** token 明/暗切换（明示操作才显示——掩码为默认）。 */
  function toggleSecretVisibility() {
    var inp = piInput("ANTHROPIC_AUTH_TOKEN");
    var tg = $("pi-toggle-secret");
    if (!inp) return;
    var showing = inp.type === "text";
    inp.type = showing ? "password" : "text";
    if (tg) tg.textContent = showing ? "显示" : "隐藏";
  }

  /**
   * 保存：从表单收集**面板键**——
   *  - 非机密键：非空值照写；**清空一个原本已设置的键 = 写入空（清除）**；原本未设置又留空 = **跳过**
   *    （不凭空造出空键，遵守「只改相关键」）；
   *  - 机密键（token）：**仅当确实输入了非空值才提交**（留空 = 保留原值，避免把已设置的 token 抹掉）。
   * 经 `d.savePiConfig` 写 `.env`（只改相关键、原子写、保存后主进程重载 env）。回报只含键名。
   */
  async function savePiConfigFromForm() {
    var updates = {};
    PI_KEYS.forEach(function (key) {
      var inp = piInput(key);
      if (!inp) return;
      var v = inp.value;
      if (key === "ANTHROPIC_AUTH_TOKEN") {
        if (v !== "") updates[key] = v; // 留空 = 不修改（保留已设置的值）
        return;
      }
      var f = piFieldByKey(key);
      var wasSet = !!(f && f.isSet);
      if (v !== "" || wasSet) updates[key] = v; // 非空照写；清空已设置键 = 清除；未设置留空 = 跳过
    });
    setPiStatus("正在保存…", "");
    try {
      var res = await d.savePiConfig(updates);
      if (!res || !res.ok) {
        setPiStatus("保存失败：" + ((res && res.error) || "未知错误"), "err");
        return;
      }
      // 保存成功：重载视图（token 回到「已设置，留空则不修改」）并提示仅改了哪些键。
      await loadPiConfig();
      setPiStatus("已保存到 .env（改动键：" + ((res.appliedKeys && res.appliedKeys.join("、")) || "无") + "）。下一会话即用新值。", "ok");
    } catch (err) {
      setPiStatus("保存异常：" + (err && err.message ? err.message : err), "err");
    }
  }

  // —————— 左栏：导入项目 + 角色树 ——————
  async function importProject() {
    try {
      var p = await d.pickProject();
      if (!p) { setHint("已取消导入。"); return; }
      await loadProject(p);
    } catch (err) {
      setHint("导入失败：" + (err && err.message ? err.message : err));
    }
  }

  async function loadProject(projectRoot) {
    var res = await d.listProject(projectRoot);
    applyListing(res, true);
    var n = state.roles.length;
    // 未-bootstrap 那件事**只在中栏正中的空状态说一次**（`clearChat` 里的标题 + 说明 + 按钮）；
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
    state.projectRoot = res.projectRoot;
    state.roles = res.roles || [];
    state.primaryRoleId = res.primaryRoleId || null;
    state.hasRoles = res.hasRoles !== false;
    var pp = $("project-path");
    pp.textContent = res.projectRoot;
    pp.classList.remove("is-empty");
    renderWarnings(res.warnings || []);

    var has = function (id) { return !!id && state.roles.some(function (r) { return r.roleId === id; }); };
    if (fresh) {
      state.selectedRoleId = state.primaryRoleId;
      state.sessionOpenRoleId = null;
    } else {
      if (!has(state.selectedRoleId)) state.selectedRoleId = state.primaryRoleId;
      if (!has(state.sessionOpenRoleId)) state.sessionOpenRoleId = null;
    }

    renderRoleTree();
    renderRight();
    setChatHeader(selectedRole());
    updateControls();
    if (fresh) {
      setState("idle", "未连接");
      clearChat();
    }
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

  /** 单条角色树项（图标 + 名称 + 副标题 + 徽标 + 会话中圆点）。isPrimary 时加「主入口」徽标。 */
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
      '<span class="ti-sub">' + esc(roleSubtitle(r)) + "</span></span>" +
      (isPrimary ? '<span class="ti-badge primary" title="主入口：默认入口与主路径">主入口</span>' : "") +
      (r.builtIn ? '<span class="ti-badge" title="内置角色：定义在 SKILL.md，无角色目录">内置</span>' : "") +
      (state.sessionOpenRoleId === r.roleId ? '<span class="ti-live" title="会话中"></span>' : "");
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
      others.forEach(function (r) { el.appendChild(roleTreeItem(r, false)); });
    }
  }

  function selectedRole() {
    return state.roles.find(function (r) { return r.roleId === state.selectedRoleId; }) || null;
  }

  function updateControls() {
    // 发送/结束仅在**会话已开启**时可用。默认选中主入口但未开会话时，入口是空聊天区的主 CTA（§10.7），
    // 故不因「有选中角色」而放开发送。
    $("btn-send").disabled = !state.sessionOpenRoleId;
    $("btn-stop").disabled = !state.sessionOpenRoleId;
  }

  async function selectRole(roleId) {
    // 同一角色重复点击 = 续接当前会话（不重建）。
    if (state.sessionOpenRoleId === roleId) {
      setHint("已在该角色的会话中，直接输入消息即可。");
      return;
    }
    state.selectedRoleId = roleId;
    renderRoleTree();
    renderRight();
    setChatHeader(selectedRole());
    updateControls();
    clearChat();
    var loading = sysRow("sys-loading", '<span class="spinner"></span>', "正在开启与角色 " + roleId + " 的会话…");
    setHint("");

    try {
      // 切换角色：开新会话前结束当前会话（一个会话只服务一个角色）。
      if (state.sessionOpenRoleId && state.sessionOpenRoleId !== roleId) {
        await d.stopSession();
        state.sessionOpenRoleId = null;
      }
      // 桌面**一律以 pi 发起**（客户 2026-10-11 裁定：界面不再暴露运行时选择器）。
      var res = await d.openSession({
        projectRoot: state.projectRoot,
        roleId: roleId,
        runtime: "pi",
      });
      if (!res.ok) {
        loading.remove();
        hideBootstrapAction();
        setState("err", "连接失败");
        sysRow("sys-call", ICONS.deny, "会话开启失败：" + (res.error || ""));
        setHint("会话开启失败，可重试，或在「Pi 设置」中检查配置。");
        return;
      }
      removeLoading();
      state.sessionOpenRoleId = roleId;
      setState("run", "聊天中");
      renderRoleTree();
      updateControls();
      setHint(res.note || "");
      // 生效配置来源（T13）：`.ans` 存在但不可用 / 声明已接受却缺 pin → 载入器 fail-closed 未接受。
      // 如实内联明示「这不是已授权状态」——绝不回退运行期同意、绝不让用户误以为已授权。
      if (res.config && (res.config.kind === "ans-invalid" || !res.config.accepted)) {
        appendConfigNote(res.config);
      }
      // 创世 finalize（T36）：若是创世 su 会话，显示「完成 bootstrap」入口（据主进程 bootstrapState，
      // 界面不判定；有角色的普通聊天不显示）。可空会话先渲染为「未就绪」提示。
      void refreshBootstrapAction();
      // 会话欢迎消息经 session:event 推达，自动出现在聊天流中。
    } catch (err) {
      removeLoading();
      hideBootstrapAction();
      setState("err", "连接失败");
      sysRow("sys-call", ICONS.deny, "会话开启异常：" + (err && err.message ? err.message : err));
    }
  }

  // —————— 右栏：角色资料（手风琴） ——————
  function sec(summary, count, bodyHtml, open) {
    return (
      '<details class="sec"' + (open ? " open" : "") + "><summary>" +
      '<svg class="sec-chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
      '<span class="sec-label">' + esc(summary) + "</span>" +
      (count == null ? "" : '<span class="sec-count">' + esc(String(count)) + "</span>") +
      "</summary>" +
      '<div class="sec-body">' + bodyHtml + "</div></details>"
    );
  }

  function renderRight() {
    var body = $("right-body");
    var role = selectedRole();
    if (!role) {
      $("right-title").textContent = "角色资料";
      body.innerHTML =
        '<div class="right-empty">' +
        '<p class="empty-title">选择角色后查看资料</p>' +
        '<p class="empty-sub">角色卡、边界条目、变更记录与文档索引。</p>' +
        "</div>";
      return;
    }
    $("right-title").textContent = "角色资料";
    var entries = role.boundary && role.boundary.entries ? role.boundary.entries : [];
    var html = "";
    html += sec("角色卡", null,
      '<div class="kv">' + esc(role.cardPath) + "</div>" +
      '<div class="card-text">' + esc(role.cardText || "（空）") + "</div>", true);
    html += sec("边界条目", entries.length, renderBoundaryTable(role.boundary), false);
    html += sec("变更记录", role.changelog ? null : "无", renderChangelog(role), false);
    html += sec("文档", role.docs && role.docs.length ? role.docs.length : "无", renderDocs(role), false);
    body.innerHTML = html;
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
    return '<div class="kv">' + esc(role.changelog.path) + '</div><div class="card-text">' + esc(role.changelog.text) + "</div>";
  }

  function renderDocs(role) {
    if (!role.docs || !role.docs.length) return '<div class="idx"><li class="empty">（无 docs/ 目录或为空）</li></div>';
    var items = role.docs.map(function (e) {
      return '<li class="' + (e.kind === "directory" ? "dir" : "") + '">' + esc(e.path) + "</li>";
    }).join("");
    return '<ul class="idx">' + items + "</ul>";
  }

  // —————— 中栏：发送消息（多轮直发，不再确认） ——————
  async function onSend() {
    var role = selectedRole();
    if (!role) { setHint("请先在左侧选择角色。"); return; }
    var inp = $("inp-message");
    var text = inp.value.trim();
    if (!text) { setHint("请输入消息内容。"); return; }

    if (state.sessionOpenRoleId !== role.roleId) {
      // 防御路径：正常流程点角色即已开会话；若未开，先补开再发。
      await selectRole(role.roleId);
    }
    appendUser(text);
    inp.value = "";
    autoGrow();
    setHint("");
    try {
      var res = await d.sendSession(text);
      if (!res.ok) sysRow("sys-call", ICONS.deny, "发送失败：" + (res.error || ""));
    } catch (err) {
      sysRow("sys-call", ICONS.deny, "发送异常：" + (err && err.message ? err.message : err));
    }
  }

  async function stop() {
    try {
      var r = await d.stopSession();
      state.sessionOpenRoleId = null;
      hideBootstrapAction();
      setState("idle", "未连接");
      renderRoleTree();
      updateControls();
      sysRow("sys-settled", ICONS.ok, r.note || "会话已结束。");
      setHint("会话已结束。再次点击该角色可重新开启。");
    } catch (err) {
      setHint("关闭失败：" + (err && err.message ? err.message : err));
    }
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
  $("btn-send").addEventListener("click", onSend);
  $("btn-stop").addEventListener("click", stop);
  $("inp-message").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  $("inp-message").addEventListener("input", autoGrow);
  // 横栏常驻写入语义（桌面一律 pi、界面无选择器——只渲染一次，无 change 监听）。
  renderWriteNote();

  // Pi 配置面板（设计 §11/T28）：点横栏的「Pi 设置」切换展开/收起（面板与保存/掩码纪律一字未动）。
  $("btn-pi-settings").addEventListener("click", togglePiPanel);
  $("pi-close").addEventListener("click", closePiPanel);
  $("pi-save").addEventListener("click", savePiConfigFromForm);
  $("pi-toggle-secret").addEventListener("click", toggleSecretVisibility);
  // 保存后重载 Pi 配置视图——pi 路径的开会话 fail-closed 报错即由此面板补救（不在此处作判定）。
  d.onSessionEvent(appendEvent);
  // 主入口角色一轮结束（settle）→ 主进程推 `project:changed` → 重取枚举，左树随 su 建出的角色而长出（§10.3）。
  d.onProjectChanged(refreshProject);
  // su 提议收口（T38）→ 把提议渲染成聊天流里的一张确认卡（确认面只在 su 已提议时出现）。
  if (d.onFinalizeProposal) d.onFinalizeProposal(appendFinalizeProposal);

  // 供 e2e 探针驱动（仅渲染进程内）。
  window.__ansRenderer = {
    state: state,
    loadProject: loadProject,
    refreshProject: refreshProject,
    selectRole: selectRole,
    openPiPanel: openPiPanel,
    loadPiConfig: loadPiConfig,
    savePiConfigFromForm: savePiConfigFromForm,
    refreshBootstrapAction: refreshBootstrapAction,
    onFinalize: onFinalize,
    appendFinalizeProposal: appendFinalizeProposal,
    piKeys: PI_KEYS.slice(),
  };
})();
