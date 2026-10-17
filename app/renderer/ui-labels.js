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
  // **动作可见谓词唯一入口**：`hasProject && hasRoles === true && governanceRecord.state === "missing"`。
  // 渲染侧不得另立判据（S1 的定义亦为此，见评审 §4.1）。
  function canEstablishGovernance(hasProject, hasRoles, recordState) {
    return hasProject === true && hasRoles === true && recordState === "missing";
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
    canEstablishGovernance: canEstablishGovernance,
    projectRoleCount: projectRoleCount,
    rangeChoiceIndex: rangeChoiceIndex,
    rangeChoiceValue: rangeChoiceValue,
    rangeChoiceLabel: rangeChoiceLabel,
    governanceMissingText: governanceMissingText,
    governanceInvalidText: governanceInvalidText,
    governanceEmptyState: governanceEmptyState,
    governanceFailureView: governanceFailureView,
    stickToBottom: stickToBottom,
    replayPlan: replayPlan,
    AUTO_SCROLL_THRESHOLD_PX: AUTO_SCROLL_THRESHOLD_PX,
    STICK_THRESHOLD_PX: STICK_THRESHOLD_PX,
  };
  root.ANSUiLabels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
