// app/renderer/tool-rows.js —— 工具事件行的**瘦身映射**（2026-10-12 客户裁定：工具行只显示状态与目标，不显示内容）。
// 客户原话：「read 内容不用展示，只显示是否读取成功了，就行了。修改之类的都不用展示。」
//
// 规则（纯函数 `slimToolRow(raw)`；**防御式**——上游格式再变也不把内容铺进聊天流）：
//  1. **只取首行**（多行内容一律不进聊天流）；
//  2. 掐掉预览分隔「 # 」及其后一切（工具结果消息里常见的「路径 # 正文预览」拼接格式）；
//  3. 掐掉「 · 」列表：只保留第一段（`a · b · c` → `a`）；
//  4. 工具名后的**重复工具名段**去重（`read_file：read_file: docs/x.md` → `read_file：docs/x.md`）；
//  5. `工具名：` 后若仍是**又长又无路径样**的内容（>60 字且无 `/`、无 `xxx.ext`）→ 折叠为 `工具名：…`；
//  6. 总长限 **140** 字符，超出截断加「…」（错误/失败**原因**的摘要在限内保留）。
//
// **保留**（不走本函数）：`denied` 行（门禁拒绝是治理信号——原因与允许路径照旧全量呈现，见 renderer.js）、
// 交互卡与回交卡（`request_*`/`submit_report` 的卡片与摘要是结构化请求/报告，不是工具内容）。
//
// 装载：与 markdown.js / role-status.js 同款「经典脚本 + node 双环境」——浏览器挂 `window.ANSToolRows`、
// node 测试挂 `globalThis.ANSToolRows`（同一纯函数，无第二份实现）。
(function (root) {
  "use strict";

  var LIMIT = 140;
  var COLLAPSE_BEYOND = 60;

  function hasPathLike(s) {
    return /[^\s/]+\/[^\s]*/.test(s) || /\S+\.\w{1,8}(\s|$|[),，。）])/.test(s);
  }

  /** 见文件头规则表——把一条工具事件行瘦身为「工具名 + 目标（+状态词/原因摘要）」。 */
  function slimToolRow(raw) {
    var s = String(raw == null ? "" : raw);
    var nl = s.search(/\r?\n/);
    if (nl >= 0) s = s.slice(0, nl); // ① 首行
    s = s.trim();
    if (s === "") return "";
    var hash = s.indexOf(" # ");
    if (hash >= 0) s = s.slice(0, hash).trim(); // ② 预览分隔之后不是内容
    var dot = s.indexOf(" · ");
    if (dot >= 0) s = s.slice(0, dot).trim(); // ③ 列表只留第一段
    var m = /^([\w.-]+)[:：]\s*(.+)$/.exec(s); // ④/⑤ 工具名冒号式
    if (m) {
      var tool = m[1];
      var rest = m[2].trim();
      var dup = new RegExp("^" + tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[:：]\\s*");
      rest = rest.replace(dup, "").trim();
      if (rest.length > COLLAPSE_BEYOND && !hasPathLike(rest)) rest = "…";
      s = tool + "：" + (rest === "" ? "…" : rest);
    }
    if (s.length > LIMIT) s = s.slice(0, LIMIT) + "…"; // ⑥ 硬上限
    return s;
  }

  // —————— 系统投递输入的归类（H-1 附录，2026-10-12 客户观察：投递输入不得长得像"客户发的消息"）——————
  // 判据（**单一来源依赖**，注释即契约）：投递正文由编排的两名函数**唯一生成**——
  //   · `renderHandbackPrompt`：首行固定 `[回交] 来自 <角色> 的报告…`
  //   · `renderDispatchPrompt`：固定 `[派发] 来自 <角色> 的任务：…`（本仓落地前同模板，见 session.ts 的登记）
  // 适配器把**程序化输入**回显为 `用户指令：<正文>` 的 message 事件，故归类 =（剥掉可选的 `用户指令：`
  // 前缀后）以 `[回交] ` / `[派发] ` **开头**。**这不是"看起来像"的启发式**：前缀就是两个渲染函数的定格
  // 格式；格式若变，只改下表 `INJECT_PREFIXES`（唯一改动点），并同步渲染侧注释。
  var INJECT_PREFIXES = [
    { kind: "handback", prefix: "[回交] ", label: "回交投递" },
    { kind: "dispatch", prefix: "[派发] ", label: "派发" },
  ];

  /** 识别"系统投递输入"的 message 事件/回放文本；非投递 → null（普通气泡路径不受影响）。 */
  function classifyInjectedMessage(raw) {
    var s = String(raw == null ? "" : raw);
    var body = s.indexOf("用户指令：") === 0 ? s.slice("用户指令：".length) : s;
    for (var i = 0; i < INJECT_PREFIXES.length; i += 1) {
      var p = INJECT_PREFIXES[i];
      if (body.indexOf(p.prefix) === 0) {
        var m = /^来自 (.+?) 的/.exec(body.slice(p.prefix.length));
        return { kind: p.kind, label: p.label, sourceRoleId: m ? m[1] : "", body: body };
      }
    }
    return null;
  }

  // 展示事实只来自已存在的执行结果；accepted单独出现不是执行成功。
  var SPECIAL_TOOLS = ["request_confirmation", "request_choice", "submit_report", "dispatch_task", "request_shell_verdict"];
  function activityOf(input) {
    var o = input && typeof input === "object" ? input : {};
    var d = o.activity || (o.detail && typeof o.detail === "object" ? o.detail : {});
    var raw = String(o.summary == null ? (o.text || "") : o.summary);
    var match = /(?:调用工具 |请求调用 |开始执行 )([\w.-]+)/.exec(raw);
    var resultName = /^([\w.-]+)[:： ]/.exec(raw);
    var tool = typeof d.toolName === "string" ? d.toolName : (match ? match[1] : resultName ? resultName[1] : "工具");
    var phase = d.phase || (o.kind === "tool_call" || /^调用工具 [\w.-]+$/.test(raw) ? "call" : "result");
    var head = raw.split(/\r?\n/)[0];
    if (head.indexOf(tool + '：' + tool) === 0) head = head.slice(tool.length + 1);
    var shellResult = tool === "run_shell" ? /^run_shell 已执行：(.+)（exit (-?\d+|\?)(?:，signal [^）]+)?）$/.exec(head) : null;
    var knownFailure = tool === "read_file" && /^read_file 失败：.+（.+）$/.test(head) || !!(shellResult && shellResult[2] !== "?" && Number(shellResult[2]) !== 0);
    var failed = knownFailure || d.status === "failed" || d.ok === false;
    var status = failed ? "failed" : o.kind === "denied" ? "denied" : phase === "call" ? "call" : d.status === "completed" && d.ok !== false ? "completed" : d.status === "returned" ? "returned" : "unknown";
    var target = typeof d.target === "string" ? d.target : typeof d.path === "string" ? d.path : shellResult ? shellResult[1] : "";
    return { toolName: tool, target: slimToolRow(target), phase: phase, status: status,
      label: status === "failed" ? "执行失败" : status === "denied" ? "已拒绝" : status === "call" ? "调用发起" : status === "completed" ? "执行完成" : status === "returned" ? "工具返回" : "状态未记录",
      turnId: typeof d.turnId === "string" ? d.turnId : "", callId: typeof d.toolCallId === "string" ? d.toolCallId : "",
      exceptional: failed || o.kind === "denied", visibleSummary: head, barrier: SPECIAL_TOOLS.indexOf(tool) >= 0 || !!o.anchorKey,
      summary: slimToolRow(raw), at: typeof o.at === "string" ? o.at : "" };
  }

  var api = { activityOf: activityOf, slimToolRow: slimToolRow, LIMIT: LIMIT, classifyInjectedMessage: classifyInjectedMessage, INJECT_PREFIXES: INJECT_PREFIXES };
  root.ANSToolRows = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
