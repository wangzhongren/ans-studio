// app/renderer/role-status.js —— 左树「角色状态徽标」的**纯函数映射**（B-3，2026-10-12 设计稿；
// 状态准确性 + 图标化见同日客户裁定）。
//
// 职责边界（与渲染分离——测试锚点要求可独立断言）：
//   · `deriveRoleStatus(facts)`：由**真实信号**派生状态 id——**只由既有信号推导，不发明进度/预计时间**；
//   · `statusBadge(status, pendingCount)`：状态 id → `{icon, label, className, title}`（**图标 + 短标签** +
//     样式类 + 悬停的完整描述，供左树渲染）。待办数 > 0 时标签带「 · N 待办」后缀。
//
// 状态集与判据（设计稿 B-3 表；`idle-restored` 为 D-1 新增）：
//   not-opened（未开启）        —— 无会话句柄且无历史（从未开启过）
//   idle（空闲）                —— 会话已开、无进行中的轮次、无所排待办
//   working（工作中）           —— **真实信号**：会话 busy（轮次在跑——**含 B-2 下切走的后台轮次**）或队列有待办
//   awaiting-confirm（等待你确认）—— 该角色有未决的交互请求（A-5 落地后由交互卡登记驱动）
//   stopped（已停止）           —— 会话被停（stop/dispose；含 LRU 淘汰——历史标注保留）
//   error（错误）               —— 该角色最近一次轮次/会话以错误结束
//   idle-restored（空闲（已恢复））—— D-1：该角色有**恢复出来的界面记录**（句柄未开/未保活时）——如实标注，
//                                  **不假装"工作中/未开启"**
//
// 派生优先级：错误 > 等待你确认 > 工作中 >（保活⇒空闲 / 有过会话⇒已停止 / 有恢复记录⇒空闲（已恢复）/
// 否则⇒未开启）。
//
// **准确性纪律（2026-10-12 客户裁定，重点）**：`working` 只由**真实信号**派生——
//   · `facts.busy`       = 主进程外推的会话 busy 标志（开跑 / settled / dispose 时推；后台跑的轮次同样计入）；
//   · `facts.queueDepth` = 主进程外推的投递队列深度（入队 / 出队时推）。
// **不得**由界面侧推测（如「本端刚发过消息就算在跑」）——本函数的判据里**没有**任何可由界面自设的
// 「working」布尔（旧版有，已退役：它正是「其实在跑却显示空闲」的根因）。
//
// **措辞唯一（2026-10-12 客户裁定）**：状态里的「停止」措辞**全应用只此一处**（`已停止`，见
// `STOPPED_LABEL`）——渲染侧一律经本表取用，不再自写第二份「停止/已停」文案。
//
// 装载：与 markdown.js 同款「经典脚本 + node 双环境」——浏览器挂 `window.ANSRoleStatus`，
// node 测试挂 `globalThis.ANSRoleStatus`（同一个纯函数，无第二份实现）。
(function (root) {
  "use strict";

  /** 由既有事实派生状态 id（facts 均可缺省——缺省即该项为假/零）。 */
  function deriveRoleStatus(facts) {
    var f = facts || {};
    if (f.error) return "error";
    if (f.awaitingConfirm) return "awaiting-confirm";
    // 真实信号：会话 busy（轮次在跑）或队列有待办——两者任一为真都**不得**显示「空闲」。
    if (f.busy === true) return "working";
    if (typeof f.queueDepth === "number" && f.queueDepth > 0) return "working";
    if (f.live) return "idle";
    if (f.hadSession) return "stopped";
    if (f.restored) return "idle-restored";
    return "not-opened";
  }

  /** 「已停止」——**全应用唯一的「停止」措辞**（测试反向断言钉死；渲染侧不得自写同义词）。 */
  var STOPPED_LABEL = "已停止";

  // 运行/思考状态转轮（W9–W11，2026-10-16 客户批准——「正在思考，没有动画」「运行中的图标太丑了」）：
  // **全应用唯一一枚** 12px SVG 弧线转轮（约 270° 弧；静止时弧线本身可读为「运行中」，不依赖动画传达状态）。
  // 本常量是**唯一图源**：工作徽标（下方 BADGES）、聊天尾行「正在工作」、开会话 loading 行共用（渲染侧经
  // `St.SPINNER_SVG` 取用；不得出现第二份图标/第二枚转轮——样式动画 `v3spin` 见 styles.css 两条规则）。
  // 颜色走 currentColor（随所在状态的既有颜色规则，不新增颜色）；prefers-reduced-motion 由全局规则兜底
  // （animation-duration 压到近零、iteration 1 ⇒ 静止弧）。
  var SPINNER_SVG = '<svg class="spin-arc" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="21.7 7.2"/></svg>';

  // 状态 → 徽标（**唯一映射**：图标 + 短标签 + 样式类 + 悬停完整描述；渲染侧只用本表，不再自写判断）。
  // 图标为单字符文本字形（非 emoji；macOS/Windows 均可渲染）；`iconHtml` 为该状态的**SVG 图源**
  // （可选；目前仅 working——W9 批准，渲染侧以 `iconHtml || esc(icon)` 单点决胜，见 renderer.js::statusBadgeHtml）。
  var BADGES = {
    "not-opened": { icon: "○", label: "未开启", className: "st-off", title: "尚未开启会话（点它即可开启）" },
    "idle": { icon: "●", label: "空闲", className: "st-idle", title: "会话已开启，当前没有在跑的任务" },
    "working": { icon: "◐", iconHtml: SPINNER_SVG, label: "工作中", className: "st-working", title: "有轮次在跑（切走后仍在后台跑的轮次同样计入）或队列有待办" },
    "awaiting-confirm": { icon: "?", label: "等待你确认", className: "st-confirm", title: "有交互请求挂起，等你在会话流里作答" },
    "stopped": { icon: "■", label: STOPPED_LABEL, className: "st-stopped", title: "会话已停止（历史保留在界面上；再点开为新会话）" },
    "error": { icon: "✕", label: "错误", className: "st-error", title: "最近一次轮次或会话以错误结束" },
    "idle-restored": { icon: "◌", label: "空闲（已恢复）", className: "st-restored", title: "句柄未开；聊天流里是该角色恢复出来的历史记录" },
  };

  /**
   * 状态 id → 徽标 `{icon, iconHtml, label, className, title}`（未知状态给保守占位——不假装认识）。
   * `iconHtml`：该状态的 SVG 图源（仅 working——`SPINNER_SVG`；其余状态缺省），渲染侧以它为优先单点。
   * `pendingCount`（队列待办数，可选）：> 0 时短标签带「 · N 待办」后缀（**如实**——有排队待办不得只显示忙闲）；
   * 悬停描述同时带上待办说明。计数非法（非正数/非有限数）按 0 处理。
   */
  function pendingKindLabel(kinds) {
    if (Array.isArray(kinds) && kinds.length && kinds.every(function (kind) { return kind === "choice"; })) return "待选择";
    if (!Array.isArray(kinds) || !kinds.length || kinds.every(function (kind) { return kind === "confirm"; })) return "待确认";
    return "待处理";
  }
  function statusBadge(status, pendingCount, waitingKinds) {
    var b = BADGES[status] || { icon: "?", label: "未知", className: "st-unknown", title: "未知状态（保守占位）" };
    var n = typeof pendingCount === "number" && isFinite(pendingCount) && pendingCount > 0 ? Math.floor(pendingCount) : 0;
    var label = (status === "awaiting-confirm" && Array.isArray(waitingKinds) && waitingKinds.length && pendingKindLabel(waitingKinds) !== "待确认" ? pendingKindLabel(waitingKinds) : b.label) + (n > 0 ? " · " + n + " 待办" : "");
    var title = b.title;
    if (n > 0) {
      title +=
        status === "working"
          ? "；另有 " + n + " 项已入队，当前任务完成后依次处理"
          : "；另有 " + n + " 项待办在队列中（完成后依次处理）";
    }
    return { icon: b.icon, iconHtml: b.iconHtml, label: label, className: b.className, title: title };
  }

  /**
   * **打开会话后的「上下文来源」提示**（唯一文案映射；D-1 契约 pm 2026-10-12 钉死后统一由本函数出文案——
   * B-2 时期的「模型上下文已重启」在该契约下已失真：dispose / LRU 淘汰**不擦除**会话文件，重开 = 恢复）。
   * facts：
   *  · resumed          —— 句柄仍在（同运行内续接）→ **无提示**；
   *  · contextSource    —— 主进程按「会话文件在/不在/坏」分类："resumed" | "recovered" | "fresh"；
   *  · contextWarning   —— "fresh" 且文件损坏时的如实说明（有值 → 用「损坏」措辞）；
   *  · hadHistory       —— 该角色聊天流里已有历史（回放/此前消息）；
   *  · alreadyAnnounced —— D-1 回放分隔行已说过「会话已恢复…」→ 不重复。
   * 返回 `{kind: "none"|"recovered"|"fresh", text}`——渲染侧只看 text 是否为空。
   *  **逐情形对照**（对照表见 docs/change：dispose 后、LRU 后 → recovered；文件缺失/损坏 → fresh）。
   */
  function sessionContextNotice(facts) {
    var f = facts || {};
    var src = f.contextSource;
    if (f.resumed === true || src === "resumed") return { kind: "none", text: "" };
    if (src === "recovered") {
      if (f.alreadyAnnounced === true) return { kind: "none", text: "" }; // 回放分隔行已说过
      return { kind: "recovered", text: "已从本地会话文件恢复（模型上下文一并恢复）。" };
    }
    // 来源未知时不推断恢复或新建；回放存在不证明模型上下文已恢复。
    if (src !== "fresh") return { kind: "none", text: "" };
    if (f.contextWarning) return { kind: "fresh", text: String(f.contextWarning) + " 以上为可读历史，模型上下文未恢复，请重新说明需求。" };
    if (f.hadHistory !== true) return { kind: "none", text: "" };
    return {
      kind: "fresh",
      text: "新会话（本地无可用会话文件）——以上为历史记录，模型不会记得；请重新说明需求。",
    };
  }

  var api = {
    pendingKindLabel: pendingKindLabel,
    deriveRoleStatus: deriveRoleStatus,
    statusBadge: statusBadge,
    sessionContextNotice: sessionContextNotice,
    SPINNER_SVG: SPINNER_SVG,
    STOPPED_LABEL: STOPPED_LABEL,
    ROLE_STATUSES: Object.keys(BADGES),
  };
  root.ANSRoleStatus = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
