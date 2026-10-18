// app/renderer/ui-labels.js —— 界面**文案的纯映射**（N-1，2026-10-12 客户裁定；可独立断言）。
//
// 职责边界：只做「既有状态 → 文案」的**纯函数**转写，不做任何判定/猜测；渲染侧只取用（`window.ANSUiLabels`）。
// 装载：与 markdown.js / role-status.js 同款「经典脚本 + node 双环境」——**必须先于 renderer.js 加载**。
(function (root) {
  "use strict";

  /**
   * 「导入项目 / 切换项目」按钮文案（N-1）。客户原话：「导入项目之后，按钮名字变成切换项目」。
   * 判据 = **已有状态** `hasProject`（= `state.projectRoot` 是否已设——**不靠界面猜测**）：
   *  · 已导入 ⇒ 「切换项目」（点它去换一个项目）；
   *  · 未导入 / 清空回退 ⇒ 「导入项目」。
   */
  function pickProjectLabel(hasProject) {
    return hasProject === true ? "切换项目" : "导入项目";
  }

  /**
   * 队列条目**来源标签**（右栏「待办 / 队列」组；客户语言三条固定映射）：
   * dispatch=「su 派发」（派发者结构性为治理主入口）、message=「客户消息」、handback=「回交投递」、
   * system=「系统」（G-2 看护告警/收束提示/恢复回执——来源=系统，非角色；**不可撤回呈现**的判据在
   * 渲染侧 `canWithdraw`（只认 message 类），本函数只管来源文案）。
   */
  function queueSourceLabel(kind) {
    if (kind === "dispatch") return "su 派发";
    if (kind === "message") return "客户消息";
    if (kind === "handback") return "回交投递";
    if (kind === "system") return "系统";
    return "投递";
  }

  /** 队列条目摘要的**展示上界**（长内容不铺开；转义由渲染侧 `esc` 统一负责，本函数只截断）。 */
  var QUEUE_TEXT_MAX = 80;

  /** 一条待办的显示用摘要（压空白 + 截断到 `n`，默认 80 字；不改变任何语义）。 */
  function shortenQueueItem(text, n) {
    var limit = typeof n === "number" && isFinite(n) && n > 0 ? Math.floor(n) : QUEUE_TEXT_MAX;
    var s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    return s.length > limit ? s.slice(0, limit) + "…" : s;
  }

  /**
   * 待办列表的**视图行**（纯函数；渲染侧逐字段 `esc` 后插入——**排队 ≠ 已执行**如实呈现）：
   *  · `running`（正在跑的那条投递，若有）在最前，位置显示「进行中」；
   *  · `queue` 逐条：位置 = 1..N（与入队次序一致）。
   * 每行 `{pos, source, text, at, kind, id, full}`——`text` 已截断（长内容不铺开）；`kind` 供渲染侧区分
   *  可操作性（P1-1：仅 message 可撤）；`id` = 快照给的定位键（撤回用）；`full` = 全文（展开用）。
   *  `at` 为 ISO 字符串（原样转出）。
   */
  function queueItemViews(queue, running) {
    var views = [];
    if (running && typeof running === "object") {
      views.push({
        pos: "进行中",
        source: queueSourceLabel(running.kind),
        text: shortenQueueItem(running.summary),
        at: typeof running.at === "string" ? running.at : "",
        kind: typeof running.kind === "string" ? running.kind : "",
        id: typeof running.id === "string" ? running.id : "",
        full: typeof running.full === "string" ? running.full : "",
      });
    }
    var items = Array.isArray(queue) ? queue : [];
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i] && typeof items[i] === "object" ? items[i] : {};
      views.push({
        pos: String(i + 1),
        source: queueSourceLabel(it.kind),
        text: shortenQueueItem(it.summary),
        at: typeof it.at === "string" ? it.at : "",
        kind: typeof it.kind === "string" ? it.kind : "",
        id: typeof it.id === "string" ? it.id : "",
        full: typeof it.full === "string" ? it.full : "",
      });
    }
    return views;
  }

  /** P-1（2026-10-12）：到达时**自动滚动**到卡的距底阈值（px）——「在底部附近」的口径。 */
  var AUTO_SCROLL_THRESHOLD_PX = 120;

  /** S-1（2026-10-12）：**流式输出贴底**的距底阈值（px）——「读者就在底部」的口径（比卡到达的更紧）。 */
  var STICK_THRESHOLD_PX = 24;

  /**
   * S-1：普通流式输出到达时是否**贴底**——① 正看着该角色由渲染侧另行判（本函数只管距离）；
   * ② 视口**距底 ≤ 阈值**（缺省 24px）。距离应在**追加新行之前**测（行本身会立刻把距离推过阈值）。
   * 用户往上翻（超出阈值）⇒ false = **不打断阅读**（新输出不把读者拽回底部）。
   */
  function stickToBottom(distanceToBottom, threshold) {
    var t = typeof threshold === "number" && isFinite(threshold) ? threshold : STICK_THRESHOLD_PX;
    return typeof distanceToBottom === "number" && isFinite(distanceToBottom) && distanceToBottom <= t;
  }

  /**
   * P-1：请求到达时是否**自动滚动到卡**——① 正看着该角色（`isViewing`）；② 视口**距底 ≤ 阈值**。
   * 任一不满足（在往上翻 / 不在该角色）⇒ false = **不打断阅读**，改由常驻 chip 提供持久指示。
   */
  function arrivalScrolls(isViewing, distanceToBottom, threshold) {
    if (isViewing !== true) return false;
    var t = typeof threshold === "number" && isFinite(threshold) ? threshold : AUTO_SCROLL_THRESHOLD_PX;
    return typeof distanceToBottom === "number" && isFinite(distanceToBottom) && distanceToBottom <= t;
  }

  /** P-1：待确认 chip 文案（`有 N 条待确认 · 定位`）；计数 ≤0 ⇒ 空串（渲染侧据此隐藏 chip）。 */
  function pendingChipLabel(count) {
    var n = typeof count === "number" && isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return n > 0 ? "有 " + n + " 条待确认 · 定位" : "";
  }

  /**
   * G-2 恢复确认卡的**动作文案**（纯映射，2026-10-16 客户批准；设计
   * `2026-10-16_design_role-watchdog-and-closure` §6.2/§6.3）。动作枚举**冻结**为
   * {abort-turn, rebuild-session, redeliver}——本函数只做「动作 token → 人话标签 + 后果说明」的纯转写
   * （说明与设计 §6.3 钉死的语义同向；渲染侧不新增任何判定）；**未知动作 ⇒ null**——渲染侧只呈现
   * 原始 token（不假装认识、不编语义）。
   */
  function recoveryActionView(action) {
    if (action === "abort-turn") return { label: "停止本轮", note: "停该角色当前轮次；不销毁会话。" };
    if (action === "rebuild-session") return { label: "重建会话", note: "重建该角色会话（保留 ANS 回放）；目标正忙时不会执行。" };
    if (action === "redeliver") return { label: "重新投递", note: "触发该角色投递队列立即重试。" };
    return null;
  }

  // —————— I4 治理记录（2026-10-17 客户批准 B+C；项目管理评审 §二 I4/§四.1/§4.5）——————
  // **动作可见谓词唯一入口**（D1，2026-10-17 pin 恢复评审 §5.4）：
  //  · `pin-mismatch` ⇒ `reaccept`（恢复入口，与 S1 互斥）；
  //  · `hasRoles === true && missing` ⇒ `establish`（既有 S1）；
  //  · 其余 ⇒ null（present/invalid/未知状态一律不显示动作，fail-closed）。
  // 渲染侧不得另立判据（尤其不得直接比较 `record.state === "pin-mismatch"`）。
  function governanceActionFor(hasProject, hasRoles, recordState) {
    if (hasProject !== true) return null;
    if (recordState === "pin-mismatch") return "reaccept";
    if (hasRoles === true && recordState === "missing") return "establish";
    return null;
  }

  /** 既有导出保留（既有测试与调用方兼容），实现委托单一入口。 */
  function canEstablishGovernance(hasProject, hasRoles, recordState) {
    return governanceActionFor(hasProject, hasRoles, recordState) === "establish";
  }

  /**
   * **项目**角色计数（I4 实机缺陷修正，2026-10-17）：`state.roles` 含内置角色（`builtIn === true`，
   * 如治理主入口）——S1 文案只应报**项目角色**数，不含内置。判据只看 `builtIn` 布尔事实，
   * **不硬编码任何角色名/id**；缺字段（旧枚举）按项目角色计。
   */
  function projectRoleCount(roles) {
    var list = Array.isArray(roles) ? roles : [];
    var n = 0;
    for (var i = 0; i < list.length; i += 1) {
      var r = list[i];
      if (r && typeof r === "object" && r.builtIn !== true) n += 1;
    }
    return n;
  }

  /**
   * 左树「让选中项可见」的**最小滚动位移**（2026-10-17 实机修复：248px + 多角色时主入口被滚出视口）：
   * 已完整可见（±1px 容差）⇒ 0（保留用户手动滚动，绝不重置到顶）；在上方 ⇒ 负位移（对齐顶）；
   * 在下方 ⇒ 正位移（对齐底）。非数/缺参 ⇒ 0（保守不动）。
   */
  function roleTreeScrollDelta(treeTop, treeBottom, itemTop, itemBottom) {
    var t = Number(treeTop), b = Number(treeBottom), i = Number(itemTop), j = Number(itemBottom);
    if (![t, b, i, j].every(function (n) { return isFinite(n); })) return 0;
    if (i >= t - 1 && j <= b + 1) return 0;
    if (i < t) return i - t;
    return j - b;
  }

  /** 左栏宽度（2026-10-17 客户选择「248px + 可拖拽」）：默认 248、范围 208–360（单一来源）。 */
  var SIDEBAR_WIDTH_DEFAULT = 248;
  var SIDEBAR_WIDTH_MIN = 208;
  var SIDEBAR_WIDTH_MAX = 360;

  /** 宽度解析/clamp：数值越界 → 边界；非数/坏值/缺失 → 默认 248；四舍五入到整数。 */
  function clampSidebarWidth(value) {
    var n = typeof value === "number" ? value : parseFloat(value == null ? "" : String(value));
    if (!isFinite(n)) return SIDEBAR_WIDTH_DEFAULT;
    n = Math.round(n);
    return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, n));
  }

  /** 键盘步进（±8 / Shift ±24）：先归一当前值再加步长，最终仍 clamp。 */
  function stepSidebarWidth(current, delta) {
    var step = typeof delta === "number" && isFinite(delta) ? delta : 0;
    return clampSidebarWidth(clampSidebarWidth(current) + step);
  }

  /** 左栏收起状态的**存储值解析**（单点）：仅 `"1"` 表示收起；`"0"`/缺失/坏值 ⇒ 展开。 */
  function sidebarCollapsedFromStorage(value) {
    return value === "1";
  }

  /** shell 确认卡标题：su 审批卡与项目角色三层链卡区分（缺省/旧请求 ⇒ 保持原文）。 */
  function shellConfirmTitle(policy) {
    return policy === "su-approval" ? "SU 命令审批" : "shell 命令请求";
  }

  /** su 审批档位可见标签（PM 评审 §3.6；未知/缺省 ⇒ 空串，只显示原因与警告，不编档位）。 */
  function suApprovalTierLabel(tier) {
    if (tier === "risky") return "风险命令（risky）";
    if (tier === "review") return "未自动判定（review）";
    if (tier === "deny") return "硬拒类（deny）";
    return "";
  }

  /**
   * **预设档位纯映射**（2026-10-17 滑块控件；G-5 wave 2 的 choices 控件族扩展）：
   * `choices` 为元数据值域（第 0 项固定为默认/清除档，通常是 `""`）。三函数只做
   * 「值 ↔ 下标 ↔ 展示标签」的纯转写，不判定、不改写、不猜值域：
   *  · `rangeChoiceIndex`：当前保存值 → 下标；不在值域 ⇒ **-1**（调用方回退文本输入，不硬塞滑块）；
   *  · `rangeChoiceValue`：下标 → 规范值（越界 ⇒ `""`；写入 hidden `#pi-inp-*` 的唯一来源）；
   *  · `rangeChoiceLabel`：下标 → `choiceLabels[index]`，缺省回退 raw value（不美化）。
   */
  function rangeChoiceIndex(choices, value) {
    var list = Array.isArray(choices) ? choices : [];
    var v = value == null ? "" : String(value);
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i] == null ? "" : list[i]) === v) return i;
    }
    return -1;
  }

  function rangeChoiceValue(choices, index) {
    var list = Array.isArray(choices) ? choices : [];
    var i = typeof index === "number" && isFinite(index) ? Math.floor(index) : -1;
    if (i < 0 || i >= list.length) return "";
    return String(list[i] == null ? "" : list[i]);
  }

  function rangeChoiceLabel(choices, choiceLabels, index) {
    var list = Array.isArray(choices) ? choices : [];
    var i = typeof index === "number" && isFinite(index) ? Math.floor(index) : -1;
    if (i < 0 || i >= list.length) return "";
    var labels = Array.isArray(choiceLabels) ? choiceLabels : [];
    if (typeof labels[i] === "string" && labels[i] !== "") return labels[i];
    return String(list[i] == null ? "" : list[i]);
  }

  // —————— P5「替我审批」/「替我决策」双开关（2026-10-18 评审 §三/§八/§九；文案单一来源）——————
  // 本段只做「开关/警告/结果/回落提示 → 文案」的纯映射；不判定命令/卡片、不读项目、不决定是否放行。
  // 渲染侧只取用（`renderer.js`）；桥缺失时**不得**呈现任何「已开启」态。
  // 分组单一来源在主进程（`GOVERNANCE_CARD_GROUP`）；渲染侧只按载荷里的 group 显示，不再写第二张映射表。

  var JUDGE_GROUP_APPROVAL = "approval";
  var JUDGE_GROUP_DECISION = "decision";
  var JUDGE_GROUP_LABELS = { approval: "代审批", decision: "代决策" };

  var SHELL_JUDGE_ON_LABEL = "替我审批中 · 判断 agent";
  var SHELL_JUDGE_OFF_LABEL = "替我审批";
  var DECISION_JUDGE_ON_LABEL = "替我决策中 · 判断 agent";
  var DECISION_JUDGE_OFF_LABEL = "替我决策";
  var SHELL_JUDGE_BRIDGE_MISSING = "当前版本不支持自动判断，保持手动";
  var DECISION_JUDGE_SINGLE_NOTE = "旧治理模型（single）不支持代决策";
  var SHELL_JUDGE_OFF_TITLE = "手动逐条确认 shell 命令与 trio 写盘/写卡确认（默认）";
  var SHELL_JUDGE_ON_TITLE = "判断 agent 先评估 shell 命令与 trio 写盘/写卡确认；可随时关闭";
  var DECISION_JUDGE_OFF_TITLE = "手动逐张确认提案接受、任命与验收（默认）";
  var DECISION_JUDGE_ON_TITLE = "判断 agent 先评估提案接受、任命与验收；可随时关闭";

  /** 开启警告的关闭按钮文案（客户 2026-10-18：提示只出现一次，可手动收起）。 */
  var SHELL_JUDGE_WARNING_CLOSE_LABEL = "知道了";
  /** 开启警告的自动收起时长（客户要求约 8–10 秒；无计时器纪律只豁免此一次性提示，不用于业务等待）。 */
  var SHELL_JUDGE_WARNING_AUTO_DISMISS_MS = 9000;

  /** 分组的人话标记（§9.3/§10.2）：结果行、审计可见文案统一用「代审批/代决策」。 */
  function judgeGroupLabel(group) {
    return JUDGE_GROUP_LABELS[group] || "";
  }

  /**
   * 一个开关的视图（纯映射）：`available` 来自 preload 四个方法是否齐备 + 主进程 `available`；
   * `enabled` 只信主进程。
   *  · 桥缺失/驱动缺失 ⇒ 禁用 + 桥缺失文案，**绝不** checked（不显示假开启态）；
   *  · decision 在 single 项目 ⇒ 禁用 +「旧治理模型（single）不支持代决策」（`note`），不显示开启态；
   *  · 可用 ⇒ 文案/悬停按真实 enabled 切换；开启期间输入区保留紧凑琥珀标记（label + `.is-on` 圆点）；
   *  · `busy`（IPC 在途）只禁用，不改文案与真实状态。
   * 长文警告的显隐**不在这里**（不是 enabled 的纯函数）：见 `judgeWarningStep`。
   */
  function judgeToggleView(group, available, enabled, busy, options) {
    var decision = group === JUDGE_GROUP_DECISION;
    var ok = available === true;
    var singleDisabled = decision && !!(options && options.singleDisabled === true);
    var on = ok && !singleDisabled && enabled === true;
    var onLabel = decision ? DECISION_JUDGE_ON_LABEL : SHELL_JUDGE_ON_LABEL;
    var offLabel = decision ? DECISION_JUDGE_OFF_LABEL : SHELL_JUDGE_OFF_LABEL;
    var offTitle = decision ? DECISION_JUDGE_OFF_TITLE : SHELL_JUDGE_OFF_TITLE;
    var onTitle = decision ? DECISION_JUDGE_ON_TITLE : SHELL_JUDGE_ON_TITLE;
    return {
      group: group,
      available: ok,
      enabled: on,
      checked: on,
      singleDisabled: singleDisabled,
      disabled: !ok || singleDisabled || busy === true,
      label: ok ? (on ? onLabel : offLabel) : SHELL_JUDGE_BRIDGE_MISSING,
      title: !ok ? SHELL_JUDGE_BRIDGE_MISSING : (singleDisabled ? DECISION_JUDGE_SINGLE_NOTE : (on ? onTitle : offTitle)),
      note: ok && singleDisabled ? DECISION_JUDGE_SINGLE_NOTE : "",
      // 兼容字段（旧调用方仍读取）：仅表示「开启态下一次性警告的候选」——实际显隐由
      // `judgeWarningStep` 决定（每次开启只显示一次）；渲染侧**不得**用它控制警告显隐。
      warningVisible: on,
    };
  }

  /** 兼容旧调用方：approval 组开关视图。 */
  function shellJudgeToggleView(available, enabled, busy) {
    return judgeToggleView(JUDGE_GROUP_APPROVAL, available, enabled, busy, null);
  }

  /**
   * 一次性开启警告的**状态迁移**（纯函数；客户 2026-10-18「这个提示应该弹出只出现一次就行了」）：
   *  · `enabled !== true` ⇒ 复位 `shown=false`、不显示（关闭开关后清掉「已提示」）；
   *  · 开启且该次开启尚未提示 ⇒ `shown=true, show=true`（只显示这一次）；
   *  · 开启且已提示（重绘/收消息/切角色/重复推送）⇒ 不显示（**绝不重复弹出**）。
   * 每个组**各自**一份 `shown`：另一组首次开启时会再显示一次（仍是同一块警告）。
   * 渲染侧只在 `show` 时展示；展示后无论手动「知道了」还是到时自动消失都不再出现，
   * 直到客户关闭该组开关再重新开启。**不持久化**：应用重启后再次开启会再提示一次。
   */
  function judgeWarningStep(enabled, shown) {
    if (enabled !== true) return { shown: false, show: false };
    if (shown === true) return { shown: true, show: false };
    return { shown: true, show: true };
  }

  /** 兼容旧调用方：approval 组一次性状态迁移。 */
  function shellJudgeWarningStep(enabled, shown) {
    return judgeWarningStep(enabled, shown);
  }

  /**
   * §9.2 开启警告：**同一块**按当前开启的组列行（两个都开 ⇒ 两段）。
   * 返回 `[{text, strong}]`——strong 由渲染侧 class 表达（不含 Markdown 标记）。
   * 客户 2026-10-18 口径：整块每次开启只显示一次（每个组各自一次，见 `judgeWarningStep`）。
   */
  function judgeWarningLines(groups) {
    var list = Array.isArray(groups) ? groups : [];
    var approval = list.indexOf(JUDGE_GROUP_APPROVAL) >= 0;
    var decision = list.indexOf(JUDGE_GROUP_DECISION) >= 0;
    var lines = [];
    if (approval) lines.push({ text: "替我审批中：shell 命令与写盘/写卡确认（write / appointment-write / schedule-write）将由判断 agent 代批。", strong: true });
    if (decision) lines.push({ text: "替我决策中：提案接受、任命、验收将由判断 agent 代批。", strong: true });
    lines.push({ text: "判断 agent 只读项目内代码/文档/角色卡（不含 .env、密钥/凭据、.ans 账本/会话、审计日志与项目外），不写文件、不执行命令；只代你「接受/任命/确认/验收」，不会代你拒绝、要求修改或勾选证据不足的候选；不确定、缺证据、读取失败、引擎不可用、超时或解析失败会按所属开关回落逐张卡，由你决定。", strong: false });
    lines.push({ text: "提案快捷路径（accept-quick）默认不代批；旧治理模型（single/su）的治理方向卡仍逐张确认；single 下写盘确认仍逐张手动。", strong: false });
    lines.push({ text: "每次代批会产生一次模型调用（token/延迟）；结果行与审计会标明「judge 代批 · 代审批/代决策」；可能误判，可随时关闭。", strong: false });
    return lines;
  }

  /** 兼容旧调用方：approval 组的警告文本（仅文字）。 */
  function shellJudgeWarningLines() {
    return judgeWarningLines([JUDGE_GROUP_APPROVAL]).map(function (line) { return line.text; });
  }

  /**
   * 开关 IPC 结果的自洽化（纯函数；主进程是开关权威）：
   *  · `ok:true` 且带布尔 `enabled` ⇒ 采用主进程实际值（不采用本地点击意图）；
   *  · 其余（失败/坏件/异常）⇒ **保持 previousEnabled**（失败不改状态），并给出可见错误。
   */
  function shellJudgeToggleResult(previousEnabled, res) {
    var prev = previousEnabled === true;
    if (res && res.ok === true && typeof res.enabled === "boolean") {
      return { enabled: res.enabled, error: "" };
    }
    var error = res && typeof res.error === "string" && res.error !== ""
      ? res.error
      : "未能确认自动判断开关（通道异常）；保持原状态。";
    return { enabled: prev, error: error };
  }

  /** 判断引擎展示名（缺省如实「未报告」，不编引擎）。 */
  function shellJudgeEngineLabel(engine) {
    if (engine === "claude") return "Claude";
    if (engine === "pi") return "Pi";
    if (engine === "codex") return "Codex";
    return typeof engine === "string" && engine !== "" ? engine : "未报告";
  }

  /** `manual` reasonCode 的人话原因（shell judge；与桌面通道 `judgeManualHumanReason` 同解）。 */
  function shellJudgeReasonText(reasonCode) {
    var map = {
      "unsupported-engine": "当前引擎不支持自动判断",
      "unavailable": "判断服务不可用",
      "timeout": "判断超时",
      "aborted": "本轮已中止",
      "parse-failed": "判断结果无法解析",
      "read-denied": "所需项目文件无法读取",
      "budget": "读取预算已用尽",
      "read-truncated": "读取内容被截断",
      "retry-capped": "同类命令连续被拒，已达重试上限",
      "context-missing": "缺少当前轮任务上下文",
      "context-too-large": "命令或上下文过大",
      "model-manual": "判断 agent 自报无法判断",
      "row-failed": "结果无法在聊天中显示",
    };
    return typeof reasonCode === "string" && map[reasonCode] ? map[reasonCode] : "判断未完成";
  }

  /** 治理卡 `manual` reasonCode 的人话原因（driver 规范化后的安全名单；未知 ⇒「判断未完成」）。 */
  function governanceJudgeReasonText(reasonCode) {
    var map = {
      "sufficient": "判断通过",
      "not-recommended": "判断 agent 未推荐该选择",
      "path-unverified": "写入路径未经逐路径核对",
      "path-outside-boundary": "写入路径越出角色边界",
      "artifact-missing": "缺少规范物证文件",
      "artifact-not-read": "判断 agent 未读取必需文件",
      "insufficient-evidence": "证据不足",
      "group-mismatch": "判断分组与卡片不一致",
      "switch-off": "判断期间开关已关闭",
      "budget": "读取预算已用尽",
      "read-denied": "所需项目文件无法读取",
      "read-truncated": "读取内容被截断",
      "unsupported-engine": "当前引擎不支持自动判断",
      "unavailable": "判断服务不可用",
      "timeout": "判断超时",
      "aborted": "本轮已中止",
      "parse-failed": "判断结果无法解析",
      "model-manual": "判断 agent 自报无法判断",
      "row-failed": "结果无法在聊天中显示",
    };
    return typeof reasonCode === "string" && map[reasonCode] ? map[reasonCode] : "判断未完成";
  }

  // —————— 读取被拒的具体原因（2026-10-18 客户反馈：回落卡只说「所需项目文件无法读取」看不懂）——————
  // 编排约定：`read-denied` 的 `reason` 形如
  // 「判断读取被拒：.ans/sessions/x.json（应用私有数据，判断侧不开放）、src/foo.txt（敏感文件），
  //   无法保证无损判断，已转手动确认。」
  // 本段只做「reason → 具体内容」的纯转写（渲染侧不猜原因）；无 reason/格式不符 ⇒ 如实「未记录具体路径」。
  var READ_DENIED_PREFIX = "判断读取被拒：";
  var READ_DENIED_NO_DETAIL = "所需项目文件无法读取（未记录具体路径）";
  var JUDGE_NOTICE_MAX = 200;

  /** 取「判断读取被拒：」之后的具体内容，去掉编排追加的通用尾注；格式不符 ⇒ 空串。 */
  function judgeReadDeniedDetail(reason) {
    if (typeof reason !== "string") return "";
    var at = reason.indexOf(READ_DENIED_PREFIX);
    if (at < 0) return "";
    var detail = reason.slice(at + READ_DENIED_PREFIX.length).trim();
    // 尾注变体：`，无法保证无损判断，已转手动确认。` / `，已转手动确认。` / `。`
    detail = detail.replace(/，已转手动确认。$/, "");
    detail = detail.replace(/。$/, "");
    detail = detail.replace(/，无法保证无损判断$/, "");
    detail = detail.replace(/。$/, "").trim();
    return detail;
  }

  /** 拼接回落提示并保证 ≤200 字：具体内容超限时截断加「…」（固定文案不动，与主进程同解）。 */
  function judgeNoticeWithDetail(prefix, detail, suffix) {
    var room = JUDGE_NOTICE_MAX - prefix.length - suffix.length;
    var text = detail.length <= room ? detail : (room > 1 ? detail.slice(0, room - 1) + "…" : "");
    return prefix + text + suffix;
  }

  /**
   * 手动回落卡 `judgeNotice`（§9.3 逐字；主进程也会给 `judgeNotice`，渲染侧优先原样呈现主进程文本）：
   *  · `row-failed` ⇒「判断已完成，但结果无法在聊天中显示」——**不**说成「判断没发生」；
   *  · `read-denied` 且 `reason` 含「判断读取被拒：<具体内容>」⇒「读取被拒：<具体内容>」，与主进程同解；
   *    无 `reason`/格式不符 ⇒「所需项目文件无法读取（未记录具体路径）」；
   *  · 其余 manual ⇒「判断 agent 未代批（代审批/代决策）：<人话原因>；已转你手动确认。」
   */
  function governanceJudgeNoticeText(group, reasonCode, reason) {
    var label = judgeGroupLabel(group) || "代审批/代决策";
    if (reasonCode === "row-failed") {
      return "判断 agent 已完成判断，但结果无法在聊天中显示（" + label + "）；已转你手动确认。";
    }
    if (reasonCode === "read-denied") {
      var detail = judgeReadDeniedDetail(reason);
      if (detail !== "") {
        return judgeNoticeWithDetail(
          "判断 agent 未代批（" + label + "）：读取被拒：",
          detail,
          "，无法保证无损判断；已转你手动确认。"
        );
      }
      return "判断 agent 未代批（" + label + "）：" + READ_DENIED_NO_DETAIL + "；已转你手动确认。";
    }
    return "判断 agent 未代批（" + label + "）：" + governanceJudgeReasonText(reasonCode) + "；已转你手动确认。";
  }

  /**
   * 手动回落卡 `judgeNotice`（与桌面通道 `manualJudgeNotice` 同解；通道已更新为「规则判定仅作参考」口径）：
   *  · `row-failed` ⇒「判断已完成，但结果无法在聊天中显示」——**不**说成「判断没发生」；
   *  · `read-denied` 且 `reason` 含「判断读取被拒：<具体内容>」⇒「读取被拒：<具体内容>」，与主进程同解；
   *    无 `reason`/格式不符 ⇒「所需项目文件无法读取（未记录具体路径）」；
   *  · 其余 manual ⇒「判断 agent 未能完成判断：<人话原因>。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。」
   */
  function shellJudgeNoticeText(reasonCode, reason) {
    if (reasonCode === "row-failed") {
      return "判断 agent 已完成判断，但结果无法在聊天中显示；规则判定仅作参考，本卡已转你手动确认。";
    }
    var reasonText = shellJudgeReasonText(reasonCode);
    if (reasonCode === "read-denied") {
      var detail = judgeReadDeniedDetail(reason);
      if (detail !== "") {
        return judgeNoticeWithDetail(
          "判断 agent 未能完成判断：读取被拒：",
          detail,
          "，无法保证无损判断。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。"
        );
      }
      reasonText = READ_DENIED_NO_DETAIL;
    }
    return "判断 agent 未能完成判断：" + reasonText + "。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。";
  }

  /**
   * 判断结果行视图（§9.3；纯映射）。`manual` 不产生结果行（原卡替代，本函数只接收 approve 载荷）。
   * 返回字段均为已定稿文案/数据；渲染侧只 `esc` 后落 DOM，不再拼业务措辞。
   *  · 标题固定「judge 代批 · 代审批/代决策」，徽标重复分组标记；
   *  · 结论按 cardKind：提案接受 / 任命 <roleIds> / 验收通过 / 确认写入 N 个路径（前 3 个）；
   *  · 引擎/operator/流程/理由/选中项/路径在正文与折叠详情。
   */
  function governanceJudgeResultView(payload) {
    if (!payload || typeof payload !== "object") return null;
    var group = typeof payload.group === "string" ? payload.group : "";
    if (group !== JUDGE_GROUP_APPROVAL && group !== JUDGE_GROUP_DECISION) return null;
    function str(v) { return typeof v === "string" && v !== "" ? v : ""; }
    function arr(v) {
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && x !== ""; }) : [];
    }
    var cardKind = str(payload.cardKind);
    var engine = str(payload.engine);
    var flowId = str(payload.flowId);
    var selected = arr(payload.selected);
    var paths = arr(payload.paths);
    var evidence = arr(payload.evidence);
    var pathDecisions = Array.isArray(payload.pathDecisions)
      ? payload.pathDecisions.filter(function (p) { return p && typeof p === "object" && typeof p.path === "string" && p.path !== ""; })
        .map(function (p) { return { path: p.path, ok: p.ok === true, reason: str(p.reason) }; })
      : [];
    var groupLabel = judgeGroupLabel(group);
    var headline = "";
    if (cardKind === "proposal") {
      headline = "接受提案（" + (selected.length ? selected.join("、") : "accept") + "）";
    } else if (cardKind === "acceptance") {
      headline = "验收通过（" + (selected.length ? selected.join("、") : "accept") + "）";
    } else if (cardKind === "appointment") {
      headline = selected.length ? "任命 " + selected.join("、") : "任命（未报告选中项）";
    } else if (cardKind === "write" || cardKind === "appointment-write" || cardKind === "schedule-write") {
      var pathCount = paths.length;
      headline = pathCount
        ? "确认写入 " + pathCount + " 个路径（" + paths.slice(0, 3).join("、") + (pathCount > 3 ? " 等 " + pathCount + " 个" : "") + "）"
        : "确认写入（未报告路径）";
    } else {
      headline = "已代批" + (cardKind ? "（" + cardKind + "）" : "");
    }
    if (flowId) headline += " · 流程 " + flowId;
    var lines = [];
    var reason = str(payload.reason);
    if (reason) lines.push("判断理由：" + reason);
    if (selected.length && cardKind !== "appointment" && cardKind !== "proposal" && cardKind !== "acceptance") {
      lines.push("选中项：" + selected.join("、"));
    }
    if (paths.length && cardKind !== "write" && cardKind !== "appointment-write" && cardKind !== "schedule-write") {
      lines.push("路径：" + paths.join("、"));
    }
    var durationMs = typeof payload.durationMs === "number" && isFinite(payload.durationMs) ? payload.durationMs : null;
    var readCalls = typeof payload.readCalls === "number" && isFinite(payload.readCalls) ? payload.readCalls : null;
    var readBytes = typeof payload.readBytes === "number" && isFinite(payload.readBytes) ? payload.readBytes : null;
    return {
      group: group,
      groupLabel: groupLabel,
      cardKind: cardKind,
      title: "judge 代批 · " + groupLabel,
      badge: groupLabel,
      headline: headline,
      engineText: "判断引擎：" + shellJudgeEngineLabel(engine),
      operatorText: "operator:" + (engine ? "judge:" + engine : "judge"),
      flowText: flowId ? "流程：" + flowId : "",
      at: str(payload.at),
      lines: lines,
      toolCallId: str(payload.toolCallId),
      requestId: str(payload.requestId),
      details: {
        reason: reason,
        selected: selected,
        paths: paths,
        pathDecisions: pathDecisions,
        evidence: evidence,
        durationMs: durationMs,
        readCalls: readCalls,
        readBytes: readBytes,
        toolCallId: str(payload.toolCallId),
        requestId: str(payload.requestId),
        flowId: flowId,
      },
    };
  }

  /**
   * 判断结果行视图（§9.3；纯映射）。`manual`/未知裁决 ⇒ **null**（手动卡替代，不产生结果行）。
   * 返回字段均为已定稿文案/数据；渲染侧只 `esc` 后落 DOM，不再拼业务措辞。
   *  · allow ⇒「已替你放行（判断 agent）」；deny 档放行（客户 D1）标题/徽标必须一眼可分；
   *  · deny ⇒ 理由 +（有则）替代方案 + 客户说明 + 「关闭开关重试」的出路；
   *  · `summary` 为空 ⇒「无法概括命令；展开查看原文」（不编命令意图）。
   */
  function shellJudgeResultView(payload) {
    if (!payload || typeof payload !== "object") return null;
    var verdict = payload.verdict;
    if (verdict !== "allow" && verdict !== "deny") return null; // manual 不产生结果行
    function str(v) { return typeof v === "string" && v !== "" ? v : ""; }
    var engine = str(payload.engine);
    var hardDeny = payload.hardDenyOverride === true || (verdict === "allow" && payload.tier === "deny");
    var summary = str(payload.summary) || "无法概括命令；展开查看原文";
    var reason = str(payload.reason);
    var customerMessage = str(payload.customerMessage);
    var alt = payload.alternative && typeof payload.alternative === "object" ? payload.alternative : null;
    var altValue = alt ? str(alt.value) : "";
    var altText = altValue ? "替代方案：" + altValue + (alt && str(alt.rationale) ? "（" + str(alt.rationale) + "）" : "") : "";
    var operator = str(payload.operator) || (engine ? "judge:" + engine : "judge");
    var tierText = payload.tier === "risky" || payload.tier === "review" || payload.tier === "deny" ? "档位：" + payload.tier : "";
    var lines = [];
    if (verdict === "allow") {
      if (hardDeny) lines.push("该命令属于硬拒类，判断 agent 判定必要后放行；请复核");
    } else {
      if (reason) lines.push("判断理由：" + reason);
      if (altText) lines.push(altText);
      if (customerMessage) lines.push(customerMessage);
    }
    return {
      verdict: verdict,
      denyOverride: hardDeny,
      title: verdict === "allow"
        ? (hardDeny ? "已替你放行（判断 agent · 代审批 · deny 档）" : "已替你放行（判断 agent · 代审批）")
        : "未放行（判断 agent · 代审批）",
      label: hardDeny ? (str(payload.label) || "deny 档 · judge 放行") : "",
      summary: summary,
      engineText: "判断引擎：" + shellJudgeEngineLabel(engine),
      operatorText: "operator:" + operator,
      tierText: tierText,
      at: str(payload.at),
      lines: lines,
      retryHint: verdict === "deny" ? "可关闭「替我审批」后重试（改为手动确认），或按替代方案调整命令。" : "",
      toolCallId: str(payload.toolCallId),
      details: {
        command: str(payload.command),
        cwd: str(payload.cwd),
        reason: reason,
        alternative: altText,
        customerMessage: customerMessage,
        customerMessageSynthesized: payload.customerMessageSynthesized === true,
        evidence: Array.isArray(payload.evidence) ? payload.evidence.filter(function (x) { return typeof x === "string" && x !== ""; }) : [],
        hardDenyOverride: hardDeny,
        toolCallId: str(payload.toolCallId),
      },
    };
  }

  /** 状态行/空态的 S1 说明（文案单一来源；N 为项目角色数，如实取枚举结果）。 */
  function governanceMissingText(roleCount) {
    var n = typeof roleCount === "number" && isFinite(roleCount) && roleCount >= 0 ? Math.floor(roleCount) : 0;
    return "本项目有 " + n + " 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。";
  }

  /** `.ans` 存在但不可用（S3）——显示原因为原文，**不自动覆盖**（修复属后续版本）。 */
  function governanceInvalidText(reason) {
    var r = typeof reason === "string" && reason !== "" ? reason : "原因未提供";
    return "治理记录不可用：" + r + "；本版不自动覆盖";
  }

  /** S1 空态（su 空态）标题/说明——主入口角色经 `primaryRoleId` 传入，**不硬编码任何角色名**。 */
  function governanceEmptyState(roleCount, primaryRoleId) {
    var primary = typeof primaryRoleId === "string" && primaryRoleId !== "" ? primaryRoleId : "主入口角色";
    return {
      kind: "governance",
      title: "尚无治理记录",
      sub: governanceMissingText(roleCount) + "与 " + primary + " 对话前，请先建立治理记录；也可在终端运行 ans govern <项目目录>。",
    };
  }

  /**
   * establish 失败文案行（评审 §4.5；`phase` 是「是否零副作用」的**唯一依据**）：
   *  · `phase !== "write"` ⇒ 可声明未写入任何文件；
   *  · `phase === "write"` ⇒ **绝不**出现「未写入任何文件」（写入阶段可能已落盘部分文件）。
   * `finalize.message` 由调用方逐字传入（本函数不重写）。
   */
  function governanceFailureView(phase, code, message) {
    var lines = [];
    if (typeof message === "string" && message !== "") lines.push(message);
    if (phase !== "write") {
      if (code === "already-established") lines.push("治理记录已存在；本次未写入任何文件。");
      else if (code === "busy") lines.push("上一次建立仍在进行中；本次未写入任何文件。");
      else if (code === "invalid-record") lines.push("治理记录不可用；本版不自动覆盖，修复路径待后续版本。");
      else {
        if (typeof code === "string" && code !== "") lines.push("错误码：" + code);
        lines.push("未写入任何文件。");
      }
    } else if (typeof code === "string" && code !== "") {
      lines.push("错误码：" + code);
    }
    return { lines: lines, noRetry: code === "already-established" || code === "invalid-record" };
  }

  // —————— pin 不符的重新接受（D1，2026-10-17 评审 §5.4；文案单一来源，渲染侧不拼）——————
  // 纯映射：状态行/空态/预览/成功/失败的**全部业务文案**只在这里生成；渲染侧只取用与 esc。

  /** 归一 pin 计数（非数/负数 ⇒ 0）。 */
  function pinCountOf(pinCount) {
    return typeof pinCount === "number" && isFinite(pinCount) && pinCount > 0 ? Math.floor(pinCount) : 0;
  }

  /** 归一不一致条目（非数组 ⇒ []）。 */
  function changedListOf(changed) {
    return Array.isArray(changed) ? changed : [];
  }

  /** 逐状态计数（只认三态；未知状态不计，也不编类别）。 */
  function changedCounts(changed) {
    var counts = { modified: 0, missing: 0, unreadable: 0 };
    var list = changedListOf(changed);
    for (var i = 0; i < list.length; i += 1) {
      var st = list[i] && typeof list[i] === "object" ? list[i].status : "";
      if (st === "modified") counts.modified += 1;
      else if (st === "missing") counts.missing += 1;
      else if (st === "unreadable") counts.unreadable += 1;
    }
    return counts;
  }

  /** pin / 实际哈希的前 8 位（UI 展示用；manifest 用完整 64 位，不在本函数范围）。 */
  function shortHash(value) {
    return typeof value === "string" ? value.slice(0, 8) : "";
  }

  /**
   * 状态行文案（评审 §5.4 逐字）：只列**非零**类别；三类均零时用「存在不一致」。
   */
  function governancePinMismatchText(pinCount, changed) {
    var n = pinCountOf(pinCount);
    var list = changedListOf(changed);
    var c = changedCounts(list);
    var parts = [];
    if (c.modified > 0) parts.push(c.modified + " 个内容已变更");
    if (c.missing > 0) parts.push(c.missing + " 个缺失");
    if (c.unreadable > 0) parts.push(c.unreadable + " 个不可读");
    var detail = parts.length ? parts.join("、") : "存在不一致";
    return "治理记录与盘上边界不一致：共 " + n + " 条 pin，其中 " + list.length +
      " 个与记录不一致（" + detail + "）。未确认前，会话不能开启、写入会被拒绝。";
  }

  /** su 空态（pin-mismatch）：标题/说明/次行——说明 = 状态行文案 + 影响面声明。 */
  function governancePinMismatchEmptyState(pinCount, changed) {
    return {
      kind: "governance",
      title: "治理记录与盘上边界不一致",
      sub: governancePinMismatchText(pinCount, changed) + "确认接受后只会刷新 SHA-256 与留痕，不会修改任何边界文件内容。",
      hint: "也可在终端核对 git 历史后再处理。",
    };
  }

  /**
   * 预览面板的视图（纯映射；评审 §5.4 逐字）：
   *  · 逐文件行只认 modified / missing / unreadable（未知状态不编语义、不展示）；
   *  · `canConfirm === false` ⇒ `blockerLines` 列出机制给的原因（渲染侧据此禁用确认）。
   */
  function governanceReacceptPreviewView(preview) {
    var p = preview && typeof preview === "object" ? preview : {};
    var list = changedListOf(p.changed);
    var fileLines = [];
    for (var i = 0; i < list.length; i += 1) {
      var f = list[i] && typeof list[i] === "object" ? list[i] : {};
      var path = typeof f.path === "string" ? f.path : "";
      var text = "";
      if (f.status === "modified") {
        text = path + " — 内容已变更（pin " + shortHash(f.pinned) + "… → 现 " + shortHash(f.actual) + "…）";
      } else if (f.status === "missing") {
        text = path + " — 文件缺失（无法重新 pin）";
      } else if (f.status === "unreadable") {
        text = path + " — 文件不可读（无法重新 pin）";
      }
      if (text !== "") fileLines.push({ status: f.status, path: path, text: text });
    }
    var blockers = Array.isArray(p.blockers) ? p.blockers : [];
    var blockerLines = [];
    for (var j = 0; j < blockers.length; j += 1) {
      var b = blockers[j] && typeof blockers[j] === "object" ? blockers[j] : {};
      if (typeof b.message === "string" && b.message !== "") blockerLines.push(b.message);
    }
    return {
      title: "重新接受治理边界（预览）",
      fileLines: fileLines,
      writeLine: "将写入：.ans/project.json、docs/bootstrap-manifest.md",
      pinLine: "将重算这 " + pinCountOf(p.pinCount) + " 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。",
      warning: "如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。",
      canConfirm: p.canConfirm === true,
      blockerLines: blockerLines,
    };
  }

  /** 成功文案（评审 §5.4 逐字）。 */
  function governanceReacceptSuccessText(pinCount, changedCount) {
    var n = pinCountOf(pinCount);
    var c = typeof changedCount === "number" && isFinite(changedCount) && changedCount > 0 ? Math.floor(changedCount) : 0;
    return "已重新接受：更新 " + c + " 条 pin（共 " + n + " 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。";
  }

  /**
   * 重新接受失败视图（评审 §5.4 逐字；`phase` 仍是「是否零副作用」的**唯一依据**）：
   *  · `phase !== "write"` ⇒ message 逐字；message 未含「未写入任何文件」时追加 `本次未写入任何文件。`；
   *    再按 status 追加对应提示。
   *  · `phase === "write"` ⇒ **只逐字显示 message**；绝不追加「未写入任何文件」、绝不出现「已恢复/已成功」。
   */
  function governanceReacceptFailureView(phase, status, message) {
    var lines = [];
    var msg = typeof message === "string" ? message : "";
    if (msg !== "") lines.push(msg);
    if (phase !== "write") {
      if (msg.indexOf("未写入任何文件") < 0) lines.push("本次未写入任何文件。");
      if (status === "no-record") lines.push("没有治理记录；请先建立治理记录。");
      else if (status === "invalid-record") lines.push("治理记录不可用；本版不提供修复。");
      else if (status === "not-needed") lines.push("边界与记录一致，无需重新接受。");
      else if (status === "preview-stale") lines.push("预览后边界文件又有变化，已取消本次写入；请重新检查。");
      else if (status === "missing-file" || status === "unreadable-file" || status === "unparseable-boundary") {
        lines.push("请先处理上述文件后重试。");
      } else if (status === "busy") lines.push("上一次操作仍在进行中；本次未写入任何文件。");
    }
    return { lines: lines, noRetry: phase === "write" };
  }

  // —————— W4 治理三权（2026-10-17 评审 §8；全部文案单一来源）——————
  // 只做「接口事实 → 文案」的纯转写：角色显示名/权力副标题按 `governanceFunction`，决定卡按
  // `cardKind`，状态行按 `governanceModel` 与接口给的流程事实。**不按角色 id 分叉**（渲染侧亦不出现
  // 三权 id 字面量）；未知值一律返回空/兜底，不猜、不编。

  // 五角色（2026-10-18 客户批准新增验收 Proof 并统一显示名）：顺序/名称以注册表为准，此处只做展示转写。
  // `primaryEntrance` 只标记客户默认入口（Lead）；渲染侧据此附加职责提示，不按角色 id 分叉。
  var GOVERNANCE_ROLE_TEXT = {
    liaison: { cn: "主理", en: "Lead", power: "客户沟通 · 不拥有最终批准权", primaryEntrance: true },
    proposal: { cn: "提案", en: "Draft", power: "提案权 · 不拥有最终批准权" },
    nomination: { cn: "组队", en: "Crew", power: "组队权 · 不拥有最终批准权" },
    schedule: { cn: "统筹", en: "Steward", power: "统筹权 · 不拥有最终批准权" },
    verification: { cn: "验收", en: "Proof", power: "验收权 · 不拥有最终批准权" },
  };
  var GOVERNANCE_ROLE_BUILTIN_NOTE = "内置角色：随应用发布，无角色目录";
  var GOVERNANCE_GROUP_LABEL = "治理职能（内置）";
  // 结论性空态说明（五角色各自一句；评审 §9.2 逐字）。Lead 的说明在其它空态分支里作附加提示。
  var GOVERNANCE_ROLE_EMPTY_HINT = {
    liaison: "客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给提案 Draft 形成提案。我不写提案、不批准。本版起默认入口为主理 Lead；提案 Draft 与历史提案不变。",
    proposal: "通常由主理 Lead 交接打开；客户也可以直接找我。我只写提案，不批准。",
    nomination: "通常由流程单提名步骤打开；仅在客户明确要求时直接使用",
    schedule: "通常由已接受提案开启流程；只负责排步骤与派发，不批准方案",
    verification: "通常由交付回交后的验收步骤打开；只核对证据、出验收卡，不批准。",
  };
  var GOVERNANCE_MODEL_TEXT = { single: "旧模型（su）", trio: "三权" };
  // 状态行专用（任务 W6-C：治理模型显示「三权 · 五角色」）；迁移预览等仍用 `GOVERNANCE_MODEL_TEXT`。
  var GOVERNANCE_MODEL_STATUS_TEXT = { single: "旧模型（su）", trio: "三权 · 五角色" };
  // 状态行只认这四个接口状态值；未知值不显示（不猜「进行中」）。
  var GOVERNANCE_FLOW_STATUS_TEXT = {
    "awaiting-customer": "等待客户决定",
    "in-progress": "进行中",
    "blocked": "阻塞",
    "escalated-to-customer": "已升级客户",
  };
  var GOVERNANCE_MIGRATION_TEXT = "本项目使用旧治理模型（su）。可升级为三权模型。";
  var GOVERNANCE_MIGRATION_LABEL = "查看差异 / 升级";
  var GOVERNANCE_MIGRATION_LABEL_PENDING = "升级入口待本版后续";
  var GOVERNANCE_DECISION_BADGE = "治理决定 · 客户最终批准";
  // 客户需求确认卡（intent-confirm；仅 Lead 发、客户本人确认）——不是「治理决定」，不用最终批准徽标。
  var GOVERNANCE_INTENT_BADGE = "需求确认 · 客户";
  var GOVERNANCE_QUEUE_NOTE = "等待前一个决定";
  var GOVERNANCE_MIRROR_BADGE = "镜像 · 主入口";
  var GOVERNANCE_MODEL_OPTION_TEXT = { single: "单模型（single）", trio: "三权（trio）" };
  var GOVERNANCE_MODEL_SUGGEST = "检测到三权产物（docs/proposals / docs/nominations / docs/flows），建议选择 trio；请由你点选。";
  var GOVERNANCE_MODEL_UNWIRED = "当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。";
  var GOVERNANCE_CARD_POWER = {
    proposal: "提案",
    appointment: "提名",
    "appointment-write": "提名",
    "schedule-write": "编排",
    acceptance: "验收",
    "intent-confirm": "需求确认",
  };

  /** 治理角色显示视图（按 function；未知/缺失 ⇒ null——不当成治理角色，也不编名字）。 */
  function governanceRoleView(governanceFunction) {
    if (typeof governanceFunction !== "string") return null;
    var t = GOVERNANCE_ROLE_TEXT[governanceFunction];
    if (!t) return null;
    return {
      function: governanceFunction,
      cn: t.cn,
      en: t.en,
      name: t.cn + " " + t.en,
      power: t.power,
      primaryEntrance: t.primaryEntrance === true,
      builtinNote: GOVERNANCE_ROLE_BUILTIN_NOTE,
      emptyHint: GOVERNANCE_ROLE_EMPTY_HINT[governanceFunction] || "",
    };
  }

  /** 治理决定卡的**镜像来源标签**（评审 §6.1：镜像面标明来源，不是第二张审批）。 */
  function governanceMirrorSourceLabel(sourceName) {
    var name = typeof sourceName === "string" && sourceName !== "" ? sourceName : "发起角色";
    return "来自 " + name + " 的治理决定 · 客户最终批准";
  }

  /** 主入口排队聚合行文案（评审 §6.1/§9.3）：只有数量，不编请求内容。 */
  function governanceQueueAggregateText(count) {
    var n = typeof count === "number" && isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return n > 0 ? "还有 " + n + " 个决定等待前一个决定" : "";
  }

  /** 治理角色空态（带专属说明的职能返回；其余 ⇒ null = 沿用既有 S0/S1/默认空态）。 */
  function governanceRoleEmptyState(governanceFunction) {
    var view = governanceRoleView(governanceFunction);
    if (!view || view.emptyHint === "") return null;
    return { kind: "governance-role", title: view.name, sub: view.emptyHint };
  }

  /** 治理模型展示名（未知 ⇒ 空串，不显示、不猜）。 */
  function governanceModelText(model) {
    return typeof model === "string" && GOVERNANCE_MODEL_TEXT[model] ? GOVERNANCE_MODEL_TEXT[model] : "";
  }

  /** 流程状态展示名（只认接口四态；未知/缺失 ⇒ 空串）。 */
  function governanceFlowStatusText(status) {
    return typeof status === "string" && GOVERNANCE_FLOW_STATUS_TEXT[status] ? GOVERNANCE_FLOW_STATUS_TEXT[status] : "";
  }

  /**
   * 状态行文案（纯拼接）：治理模型（三权/旧模型）· 当前流程（若接口给）· 流程状态（若接口给且认识）。
   * 接口未给 model 时返回空串（渲染侧据此不显示——**不猜模型**）。
   */
  function governanceStatusText(model, flowId, flowStatus) {
    var parts = [];
    var modelText = typeof model === "string" && GOVERNANCE_MODEL_STATUS_TEXT[model] ? GOVERNANCE_MODEL_STATUS_TEXT[model] : "";
    if (modelText !== "") parts.push("治理模型：" + modelText);
    if (typeof flowId === "string" && flowId !== "") parts.push("当前流程：" + flowId);
    var statusText = governanceFlowStatusText(flowStatus);
    if (statusText !== "") parts.push(statusText);
    return parts.join(" · ");
  }

  /** 旧模型提示条按钮（V1b：桥齐备 ⇒「查看差异 / 升级」可用；否则「升级入口待本版后续」禁用）。 */
  function governanceMigrationButtonView(wired) {
    var ok = wired === true;
    return {
      label: ok ? GOVERNANCE_MIGRATION_LABEL : GOVERNANCE_MIGRATION_LABEL_PENDING,
      disabled: !ok,
      title: ok ? "打开迁移预览（零写入）；确认后只改 .ans 的 governanceModel 并追加 manifest 记录。" : "迁移预览与写入尚未接线；本版不可用。",
    };
  }

  /** 迁移预览列表项的展示文本（字符串原样；pin 变更对象显示 path + 新旧前 8 位；其余取 path/message）。 */
  function migrationItemText(item) {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      var p = typeof item.path === "string" ? item.path : "";
      var oldHash = typeof item.oldSha256 === "string" ? item.oldSha256 : "";
      var newHash = typeof item.newSha256 === "string" ? item.newSha256 : "";
      if (p !== "" && (oldHash !== "" || newHash !== "")) {
        return p + "（" + shortHash(oldHash) + "… → " + shortHash(newHash) + "…）";
      }
      if (p !== "") return p;
      if (typeof item.message === "string" && item.message !== "") return item.message;
      try { return JSON.stringify(item); } catch (_) { return ""; }
    }
    return item == null ? "" : String(item);
  }

  /**
   * 迁移预览视图（纯映射；评审 §5.5 结果形状）：
   *  · `model → targetModel`、`writePaths`、`modelField`、`manifestLine`、`pinChanges`（应为空）、
   *    `retainedFiles`、`snapshotDigest` 前 8 位；
   *  · `canConfirm` 只在 `snapshotDigest` 非空时 true（fail-closed：无摘要不发行）；
   *  · 未知/缺失项如实「未报告」，不编造路径或哈希。
   */
  function governanceMigrationPreviewView(preview) {
    var p = preview && typeof preview === "object" ? preview : {};
    var listOf = function (v) { return Array.isArray(v) ? v.map(migrationItemText).filter(function (x) { return x !== ""; }) : []; };
    var model = governanceModelText(p.model) || (typeof p.model === "string" && p.model !== "" ? p.model : "旧模型");
    var target = governanceModelText(p.targetModel) || (typeof p.targetModel === "string" && p.targetModel !== "" ? p.targetModel : "三权");
    var writePaths = listOf(p.writePaths);
    var pinChanges = listOf(p.pinChanges);
    var retainedFiles = listOf(p.retainedFiles);
    var digest = typeof p.snapshotDigest === "string" ? p.snapshotDigest : "";
    var modelFieldText = p.modelField === null
      ? "（字段缺失，将新增 governanceModel: \"trio\"）"
      : (p.modelField === "single" || p.modelField === "trio" ? p.modelField : "（未报告）");
    return {
      title: "升级为三权治理模型（预览）",
      modelLine: "模型：" + model + " → " + target,
      writeLines: writePaths.length
        ? writePaths.map(function (x) { return "将写入：" + x; })
        : ["将写入：（未报告）"],
      modelFieldLine: "将写入 .ans 字段：" + modelFieldText,
      manifestLine: "将追加 manifest 记录：" + (typeof p.manifestLine === "string" && p.manifestLine !== "" ? p.manifestLine : "（未报告）"),
      pinLines: pinChanges.length
        ? pinChanges.map(function (x) { return "pin 变更：" + x; })
        : ["pin 变更：无（不重算 pin）"],
      retainedLines: ["保留文件：" + (retainedFiles.length ? retainedFiles.join("、") : "无")],
      digestLine: "预览摘要（前 8 位）：" + (digest !== "" ? shortHash(digest) : "（未报告）"),
      warning: "预览零写入。确认后只改 .ans 的 governanceModel 并追加 manifest 记录；不重写角色卡/边界/pin/历史会话。",
      canConfirm: digest !== "",
      digest: digest,
    };
  }

  /** 迁移成功文案（逐字；不宣称角色卡/边界/pin/历史被重写）。 */
  function governanceMigrationSuccessText() {
    return "已升级为三权治理模型（.ans governanceModel = \"trio\"）。旧角色卡/边界/pin/历史会话保留。";
  }

  /**
   * 迁移失败视图（评审 §5.5 status；`phase === "write"` 是「可能已部分落盘」的唯一依据）：
   *  · phase !== write ⇒ 按 status 给出可声明的零副作用说明；
   *  · phase === write ⇒ 只逐字 message + 核对现场提示，**绝不**出现「已升级」或「未写入任何文件」。
   *  `noRetry`：写入阶段失败、already-trio、no-record 不再提供确认重试（防假成功/无意义重试）。
   */
  function governanceMigrationFailureView(phase, status, message) {
    var lines = [];
    var msg = typeof message === "string" ? message : "";
    if (msg !== "") lines.push(msg);
    var st = typeof status === "string" ? status : "";
    if (phase !== "write") {
      if (st === "already-trio") lines.push("已是三权治理模型，无需升级；本次未写入任何文件。");
      else if (st === "no-record") lines.push("没有治理记录（.ans/project.json）；本次未写入任何文件。");
      else if (st === "blocked") lines.push("升级被阻止；本次未写入任何文件。");
      else if (st === "preview-stale") lines.push("预览后 .ans 又有变化，已取消本次写入；请重新检查。");
      else if (st === "busy") lines.push("上一次升级仍在进行中；本次未写入任何文件。");
      else if (st === "invalid-request") lines.push("升级请求无效；本次未写入任何文件。");
      else {
        if (st !== "") lines.push("状态：" + st);
        lines.push("本次未写入任何文件。");
      }
    } else if (st === "write-failed") {
      lines.push("写入阶段失败，可能已写入部分文件，请核对现场。");
    } else if (st !== "") {
      lines.push("状态：" + st);
    }
    return { lines: lines, noRetry: phase === "write" || st === "already-trio" || st === "no-record" };
  }

  /** 建立治理记录预览的模型选项文案（未知 ⇒ 空串）。 */
  function governanceModelOptionText(model) {
    return typeof model === "string" && GOVERNANCE_MODEL_OPTION_TEXT[model] ? GOVERNANCE_MODEL_OPTION_TEXT[model] : "";
  }

  /**
   * 治理决定卡元信息（纯映射；`CustomerInputRequest` 的可选治理字段）：
   *  · `cardKind` ⇒ 权力类型（提案/提名/编排/验收/需求确认）+「治理决定 · 客户最终批准」徽标；
   *    `intent-confirm` 是客户需求确认卡（仅 Lead 发、客户本人确认）⇒ 徽标「需求确认 · 客户」；
   *    普通 `write` 与缺席 ⇒ 不是治理决定（无徽标、无权力行——旧卡零变化）；
   *  · `flowId`/`stepId` 原样显示；
   *  · `paths`（可选，写盘确认逐路径）、`summary`（可选）、`artifactSha256`（可选）——接口未给就不显示，
   *    渲染侧不从预览/正文里抽取或自算。
   */
  function governanceCardMetaView(request) {
    var req = request && typeof request === "object" ? request : {};
    var cardKind = typeof req.cardKind === "string" ? req.cardKind : "";
    var power = GOVERNANCE_CARD_POWER[cardKind] || "";
    var flowId = typeof req.flowId === "string" ? req.flowId : "";
    var stepId = typeof req.stepId === "string" ? req.stepId : "";
    var lines = [];
    if (flowId !== "") lines.push("流程：" + flowId);
    if (stepId !== "") lines.push("步骤：" + stepId);
    if (power !== "") lines.push("权力类型：" + power);
    var paths = Array.isArray(req.paths)
      ? req.paths.filter(function (p) { return typeof p === "string" && p !== ""; })
      : [];
    for (var i = 0; i < paths.length; i += 1) lines.push("将写路径：" + paths[i]);
    if (typeof req.summary === "string" && req.summary !== "") lines.push("摘要：" + req.summary);
    if (typeof req.artifactSha256 === "string" && req.artifactSha256 !== "") lines.push("哈希：" + req.artifactSha256);
    return {
      governance: power !== "",
      badge: power === "" ? "" : cardKind === "intent-confirm" ? GOVERNANCE_INTENT_BADGE : GOVERNANCE_DECISION_BADGE,
      power: power,
      flowId: flowId,
      stepId: stepId,
      lines: lines,
    };
  }

  // —————— D-1 回放去重（2026-10-13 真机「同一段消息渲染两遍」修复）——————
  // 真机链路：su 一轮结束 → `project:changed` → 渲染侧 refreshProject → 主进程对每角色**重推**会话历史
  // → 旧实现对同一 pane **无守卫地整份再回放** ⇒ 转录重复（轮次越多重复越多）。本函数给出**纯策略**：
  // 同一份历史**幂等**（skip）；盘上文件**增长**（追加了新轮次）→ **增量**（只回放尾巴）；其余
  //（重写/截断/内容不一致）→ **全量重建**（绝不追加第二份）。

  /** 两条回放行是否**逐字段同值**（判等键 = 呈现与锚点用到的全部字段；不做判定、纯比较）。 */
  function sameReplayRows(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      var x = a[i] && typeof a[i] === "object" ? a[i] : {};
      var y = b[i] && typeof b[i] === "object" ? b[i] : {};
      if (String(x.kind == null ? "" : x.kind) !== String(y.kind == null ? "" : y.kind)) return false;
      if (String(x.text == null ? "" : x.text) !== String(y.text == null ? "" : y.text)) return false;
      if (String(x.at == null ? "" : x.at) !== String(y.at == null ? "" : y.at)) return false;
      if (String(x.requestId == null ? "" : x.requestId) !== String(y.requestId == null ? "" : y.requestId)) return false;
      if (String(x.anchorKey == null ? "" : x.anchorKey) !== String(y.anchorKey == null ? "" : y.anchorKey)) return false;
      if (String(x.turnId == null ? "" : x.turnId) !== String(y.turnId == null ? "" : y.turnId)) return false;
      if (String(x.eventKind == null ? "" : x.eventKind) !== String(y.eventKind == null ? "" : y.eventKind)) return false;
      if (JSON.stringify(x.activity || null) !== JSON.stringify(y.activity || null)) return false;
      if (String(x.anchor == null ? "" : x.anchor) !== String(y.anchor == null ? "" : y.anchor)) return false;
    }
    return true;
  }

  /**
   * 回放策略（纯函数）：`prev` = 上次该角色回放的状态 `{rows}`（无则 null/未定义）；`nextRows` = 本次载荷行。
   * 返回 `{action:"full"|"skip"|"append", from}`：
   *  · `full`（首次 / 内容不一致——重写、截断、字段变了）→ from=0：**先作废旧回放再全量重放**；
   *  · `skip`（与上次逐字段相同）→ 幂等 no-op（重推不再叠加副本）；
   *  · `append`（新行 = 旧前缀 + 追加尾巴）→ from=旧行数：只回放追加段（增量）。
   */
  function replayPlan(prev, nextRows) {
    var next = Array.isArray(nextRows) ? nextRows : [];
    if (!prev || !Array.isArray(prev.rows)) return { action: "full", from: 0 };
    var old = prev.rows;
    if (sameReplayRows(old, next)) return { action: "skip", from: 0 };
    if (next.length > old.length && sameReplayRows(old, next.slice(0, old.length))) {
      return { action: "append", from: old.length };
    }
    return { action: "full", from: 0 };
  }

  var api = {
    pickProjectLabel: pickProjectLabel,
    queueSourceLabel: queueSourceLabel,
    shortenQueueItem: shortenQueueItem,
    queueItemViews: queueItemViews,
    arrivalScrolls: arrivalScrolls,
    pendingChipLabel: pendingChipLabel,
    recoveryActionView: recoveryActionView,
    shellConfirmTitle: shellConfirmTitle,
    suApprovalTierLabel: suApprovalTierLabel,
    shellJudgeToggleView: shellJudgeToggleView,
    shellJudgeToggleResult: shellJudgeToggleResult,
    shellJudgeWarningStep: shellJudgeWarningStep,
    shellJudgeWarningLines: shellJudgeWarningLines,
    shellJudgeNoticeText: shellJudgeNoticeText,
    shellJudgeReasonText: shellJudgeReasonText,
    shellJudgeResultView: shellJudgeResultView,
    shellJudgeEngineLabel: shellJudgeEngineLabel,
    judgeToggleView: judgeToggleView,
    judgeWarningStep: judgeWarningStep,
    judgeWarningLines: judgeWarningLines,
    judgeGroupLabel: judgeGroupLabel,
    governanceJudgeReasonText: governanceJudgeReasonText,
    governanceJudgeNoticeText: governanceJudgeNoticeText,
    governanceJudgeResultView: governanceJudgeResultView,
    JUDGE_GROUP_APPROVAL: JUDGE_GROUP_APPROVAL,
    JUDGE_GROUP_DECISION: JUDGE_GROUP_DECISION,
    SHELL_JUDGE_ON_LABEL: SHELL_JUDGE_ON_LABEL,
    SHELL_JUDGE_OFF_LABEL: SHELL_JUDGE_OFF_LABEL,
    DECISION_JUDGE_ON_LABEL: DECISION_JUDGE_ON_LABEL,
    DECISION_JUDGE_OFF_LABEL: DECISION_JUDGE_OFF_LABEL,
    SHELL_JUDGE_BRIDGE_MISSING: SHELL_JUDGE_BRIDGE_MISSING,
    DECISION_JUDGE_SINGLE_NOTE: DECISION_JUDGE_SINGLE_NOTE,
    SHELL_JUDGE_OFF_TITLE: SHELL_JUDGE_OFF_TITLE,
    SHELL_JUDGE_ON_TITLE: SHELL_JUDGE_ON_TITLE,
    DECISION_JUDGE_OFF_TITLE: DECISION_JUDGE_OFF_TITLE,
    DECISION_JUDGE_ON_TITLE: DECISION_JUDGE_ON_TITLE,
    SHELL_JUDGE_WARNING_CLOSE_LABEL: SHELL_JUDGE_WARNING_CLOSE_LABEL,
    SHELL_JUDGE_WARNING_AUTO_DISMISS_MS: SHELL_JUDGE_WARNING_AUTO_DISMISS_MS,
    sidebarCollapsedFromStorage: sidebarCollapsedFromStorage,
    clampSidebarWidth: clampSidebarWidth,
    stepSidebarWidth: stepSidebarWidth,
    roleTreeScrollDelta: roleTreeScrollDelta,
    SIDEBAR_WIDTH_DEFAULT: SIDEBAR_WIDTH_DEFAULT,
    SIDEBAR_WIDTH_MIN: SIDEBAR_WIDTH_MIN,
    SIDEBAR_WIDTH_MAX: SIDEBAR_WIDTH_MAX,
    canEstablishGovernance: canEstablishGovernance,
    governanceActionFor: governanceActionFor,
    projectRoleCount: projectRoleCount,
    rangeChoiceIndex: rangeChoiceIndex,
    rangeChoiceValue: rangeChoiceValue,
    rangeChoiceLabel: rangeChoiceLabel,
    governanceMissingText: governanceMissingText,
    governanceInvalidText: governanceInvalidText,
    governanceEmptyState: governanceEmptyState,
    governanceFailureView: governanceFailureView,
    governancePinMismatchText: governancePinMismatchText,
    governancePinMismatchEmptyState: governancePinMismatchEmptyState,
    governanceReacceptPreviewView: governanceReacceptPreviewView,
    governanceReacceptSuccessText: governanceReacceptSuccessText,
    governanceReacceptFailureView: governanceReacceptFailureView,
    governanceRoleView: governanceRoleView,
    governanceRoleEmptyState: governanceRoleEmptyState,
    governanceMirrorSourceLabel: governanceMirrorSourceLabel,
    governanceQueueAggregateText: governanceQueueAggregateText,
    governanceModelText: governanceModelText,
    governanceFlowStatusText: governanceFlowStatusText,
    governanceStatusText: governanceStatusText,
    governanceMigrationButtonView: governanceMigrationButtonView,
    governanceMigrationPreviewView: governanceMigrationPreviewView,
    governanceMigrationSuccessText: governanceMigrationSuccessText,
    governanceMigrationFailureView: governanceMigrationFailureView,
    governanceModelOptionText: governanceModelOptionText,
    governanceCardMetaView: governanceCardMetaView,
    GOVERNANCE_GROUP_LABEL: GOVERNANCE_GROUP_LABEL,
    GOVERNANCE_ROLE_BUILTIN_NOTE: GOVERNANCE_ROLE_BUILTIN_NOTE,
    GOVERNANCE_MIGRATION_TEXT: GOVERNANCE_MIGRATION_TEXT,
    GOVERNANCE_DECISION_BADGE: GOVERNANCE_DECISION_BADGE,
    GOVERNANCE_INTENT_BADGE: GOVERNANCE_INTENT_BADGE,
    GOVERNANCE_QUEUE_NOTE: GOVERNANCE_QUEUE_NOTE,
    GOVERNANCE_MIRROR_BADGE: GOVERNANCE_MIRROR_BADGE,
    GOVERNANCE_MODEL_SUGGEST: GOVERNANCE_MODEL_SUGGEST,
    GOVERNANCE_MODEL_UNWIRED: GOVERNANCE_MODEL_UNWIRED,
    stickToBottom: stickToBottom,
    replayPlan: replayPlan,
    AUTO_SCROLL_THRESHOLD_PX: AUTO_SCROLL_THRESHOLD_PX,
    STICK_THRESHOLD_PX: STICK_THRESHOLD_PX,
  };
  root.ANSUiLabels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
