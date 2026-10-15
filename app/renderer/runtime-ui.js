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
  function metadataLabel(omissions) {
    if (!Array.isArray(omissions)) return "";
    var labels = { timestamp: "原时间未保存或不可展示", "anchor-token": "原定位标记未提供", "oversize-identity": "原调用身份超出展示预算" };
    return omissions.map(function (key) { return labels[key] || ""; }).filter(Boolean).join("；");
  }
  function shortTime(at) {
    if (typeof at !== "string" || !at) return "";
    var value = new Date(at); return isNaN(value.getTime()) ? "" : value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function textFlags(value) {
    if (!value || typeof value !== "object") return "";
    return [value.redacted ? "已净化" : "", value.truncated ? "已截断" : ""].filter(Boolean).join(" · ");
  }
  function persistenceLabel(value, target) {
    var state = value && (value.history || value.state);
    var failure = value && ({ CONFLICT: "保存内容冲突，不能自动覆盖。", INVALID: "保存材料无效，不能自动恢复。", REPLAY_DAMAGED: "历史记录损坏，不能自动补存。", REPLAY_CHANGED: "历史记录已变化，不能自动补存。", SNAPSHOT_EXPIRED: "可补存的会话材料已失效，无法在此补存。", PROVENANCE_TOO_LARGE: "回交记录超过展示与来源预算，尚未继续投递。" })[value.code];
    if (failure && state !== "saved" && state !== "already-saved") return failure;
    if (state === "saved" || state === "already-saved") return target ? "接收历史已保存" : "报告已保存";
    if (state === "expired") return "可补存的会话材料已失效，无法在此补存。";
    if (state === "disabled") return "仅本次会话可见，未启用历史保存。";
    if (state === "unknown-live" || state === "unsupported") return "当前会话无法确认或不支持此保存恢复能力。";
    if (value && value.code === "TEXT_PROJECTION_FAILED") return "交接显示内容生成失败，尚未交给Provider。";
    if (state === "failed") return target ? "本次接收历史未保存；执行状态以上方实际结果为准。" : "报告尚未保存，暂未继续回交。可补存原报告，无需重新运行任务。";
    return target ? "尚未取得最终历史回执，处理可能已开始。" : "报告保存状态未确认。";
  }
  function documentError(code) {
    return ({ INVALID_REQUEST:"文档请求无效。", PROJECT_NOT_GRANTED:"尚未获得当前项目的文档读取许可，请重新选择项目文件夹。", PROJECT_NOT_ACTIVE:"该项目不是当前项目。", STALE_SCOPE:"项目文档列表已失效，请返回当前项目重新选择。", UNKNOWN_DOCUMENT:"文档引用未知。", NOT_LISTED:"该文档已不在可读清单中。", OUTSIDE_PROJECT:"该文件不在当前项目允许的阅读范围。", SYMLINK_NOT_ALLOWED:"符号链接文档不可读取。", NOT_FOUND:"文档不存在。", NOT_FILE:"该引用不是普通文件。", UNSUPPORTED_FORMAT:"此文档格式暂不支持。", INVALID_UTF8:"文档不是有效UTF-8文本。", BINARY_CONTENT:"文档包含二进制内容，不能预览。", TOO_LARGE:"文档超过256KiB，无法在此预览。", PERMISSION_DENIED:"没有读取此文档的权限。", CHANGED_DURING_READ:"读取期间文档发生变化，请重新选择。", UNSUPPORTED_ENVIRONMENT:"当前环境暂不支持安全读取项目文档。", IO_ERROR:"文档读取失败。" })[code] || "无法读取此文档。";
  }
  root.ANSRuntimeUI = { metadataLabel: metadataLabel, shortTime: shortTime, textFlags: textFlags, persistenceLabel: persistenceLabel, documentError: documentError, runtimeLabel: runtimeLabel, viewKey: viewKey, matchesView: matchesView, roleGroups: roleGroups, sourceLabel: sourceLabel, applicationLabel: applicationLabel, canonicalKey: canonicalKey, replayKey: replayKey, replayCounts: replayCounts, tokenId: tokenId };
})(typeof window !== "undefined" ? window : globalThis);
