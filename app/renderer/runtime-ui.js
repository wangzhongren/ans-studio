// 运行时与组摘要的纯展示映射。数据由 window.desktop 提供，不读取文件或判定授权。
(function (root) {
  "use strict";
  var LABELS = { pi: "Pi", codex: "Codex", claude: "Claude", demo: "Demo" };
  function runtimeLabel(runtime) { return LABELS[runtime] || String(runtime || "未知引擎"); }
  function viewKey(projectRoot, runtime) { return JSON.stringify([projectRoot || "", runtime || "pi"]); }
  function matchesView(payload, projectRoot, runtime) {
    if (!payload || typeof payload !== "object") return false;
    // 旧 Pi IPC 替身允许省略身份；新通道的显式身份必须精确相等。
    return (payload.projectRoot == null || payload.projectRoot === projectRoot) &&
      (payload.runtime == null ? runtime === "pi" : payload.runtime === runtime);
  }
  function roleGroups(roles) {
    var groups = [], byName = new Map(), ungrouped = [];
    (roles || []).forEach(function (role) {
      var name = typeof role.group === "string" ? role.group.trim() : "";
      if (!name) { ungrouped.push(role); return; }
      var group = byName.get(name);
      if (!group) { group = { name: name, roles: [] }; byName.set(name, group); groups.push(group); }
      group.roles.push(role);
    });
    groups.forEach(function (group) {
      group.roles.sort(function (a, b) { return Number(b.groupDuty === "组长") - Number(a.groupDuty === "组长"); });
    });
    if (ungrouped.length) groups.push({ name: "其他角色（查看/调试）", roles: ungrouped });
    return groups;
  }
  function sourceLabel(field) {
    var labels = { file: "文件", environment: "环境", fallback: "回退", default: "默认", unset: "未设置" };
    var f = field || {};
    return (labels[f.source] || "来源未报告") + (f.source === "fallback" && f.fallbackKey ? "（" + f.fallbackKey + "）" : "");
  }
  function applicationLabel(application) {
    return { current: "当前配置已应用。", "next-session": "下一次开启会话时应用。", "after-active-turn": "当前轮次继续使用原配置；结束后下一次输入应用新配置。" }[application] || "配置应用时点未报告。";
  }
  function canonicalKey(row) {
    if (!row || typeof row.turnId !== "string" || row.turnId === "") return null;
    var detail = row.input || row.detail || {};
    if (row.kind === "user" || detail.source === "prompt-input" && typeof detail.text === "string") return JSON.stringify(["input", row.turnId]);
    var activity = root.ANSToolRows && root.ANSToolRows.activityOf(row);
    if (activity && activity.turnId && activity.callId && ["start", "result", "blocked"].indexOf(activity.identityPhase) >= 0)
      return JSON.stringify(["tool", activity.turnId, activity.callId, activity.identityPhase]);
    return null;
  }
  function replayKey(row) {
    var canonical = canonicalKey(row);
    if (canonical) return canonical;
    if (!row || typeof row.turnId !== "string" || row.turnId === "") return null;
    var kind = row.kind === "user" ? "user" : row.eventKind;
    if (["user", "message", "tool_call", "accepted", "denied"].indexOf(kind) < 0) return null;
    return JSON.stringify([row.turnId, kind, String(row.text == null ? "" : row.text)]);
  }
  function replayCounts(rows) {
    var counts = Object.create(null);
    (rows || []).forEach(function (row) { var key = replayKey(row); if (key) counts[key] = canonicalKey(row) ? 1 : (counts[key] || 0) + 1; });
    return counts;
  }
  function tokenId(token) { return token ? JSON.stringify([token.key, token.occurrence]) : ""; }
  root.ANSRuntimeUI = { runtimeLabel: runtimeLabel, viewKey: viewKey, matchesView: matchesView, roleGroups: roleGroups, sourceLabel: sourceLabel, applicationLabel: applicationLabel, canonicalKey: canonicalKey, replayKey: replayKey, replayCounts: replayCounts, tokenId: tokenId };
})(typeof window !== "undefined" ? window : globalThis);
