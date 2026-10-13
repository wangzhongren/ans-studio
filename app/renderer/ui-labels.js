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
   * dispatch=「su 派发」（派发者结构性为治理主入口）、message=「客户消息」、handback=「回交投递」。
   */
  function queueSourceLabel(kind) {
    if (kind === "dispatch") return "su 派发";
    if (kind === "message") return "客户消息";
    if (kind === "handback") return "回交投递";
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
   * 每行 `{pos, source, text, at}`——`text` 已截断（长内容不铺开），`at` 为 ISO 字符串（原样转出）。
   */
  function queueItemViews(queue, running) {
    var views = [];
    if (running && typeof running === "object") {
      views.push({
        pos: "进行中",
        source: queueSourceLabel(running.kind),
        text: shortenQueueItem(running.summary),
        at: typeof running.at === "string" ? running.at : "",
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

  var api = {
    pickProjectLabel: pickProjectLabel,
    queueSourceLabel: queueSourceLabel,
    shortenQueueItem: shortenQueueItem,
    queueItemViews: queueItemViews,
    arrivalScrolls: arrivalScrolls,
    pendingChipLabel: pendingChipLabel,
    stickToBottom: stickToBottom,
    AUTO_SCROLL_THRESHOLD_PX: AUTO_SCROLL_THRESHOLD_PX,
    STICK_THRESHOLD_PX: STICK_THRESHOLD_PX,
  };
  root.ANSUiLabels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
