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

  // —————— 系统投递输入的归类（H-1 附录，2026-10-12 客户观察：投递输入不得长得像"客户发的消息"；
  //           G-2，2026-10-16 客户批准：新增 `system` 类，判据块见下方）——————
  // 判据（**单一来源依赖**，注释即契约）：投递正文由编排 `src/common/编排/handback.ts` 的两名函数**唯一生成**——
  //   · `renderHandbackPrompt`：首行固定 `[回交] 来自 <角色> 的报告…`
  //   · `renderDispatchPrompt`：首行固定 `[派发] 来自 su 的任务…`（G-1/A2 已收口：桌面本地副本已删除、
  //     不得两处并存；原因段/必读块等扩展均不改变本归类依赖的前缀特征）
  // 适配器把**程序化输入**回显为 `用户指令：<正文>` 的 message 事件，故归类 =（剥掉可选的 `用户指令：`
  // 前缀后）以 `[回交] ` / `[派发] ` / `[系统·` **开头**——分类只依赖该前缀特征（`来自 X 的` 仅用于
  // 提取来源角色），不解析正文其余部分。**这不是"看起来像"的启发式**：前缀就是各渲染函数首行的定格
  // 格式；格式若变，只改下表 `INJECT_PREFIXES`（角色投递归类唯一改动点）与下方 `SYSTEM_HEAD`（系统类
  // 唯一改动点），并同步渲染侧注释。
  var INJECT_PREFIXES = [
    { kind: "handback", prefix: "[回交] ", label: "回交投递" },
    { kind: "dispatch", prefix: "[派发] ", label: "派发" },
  ];

  // —————— `system` 类投递输入的归类（G-2，2026-10-16 客户批准；设计 §3.3/§6.2/§7.3）——————
  // 看护告警 / 收束提示 / 恢复回执都经既有投递机以 `kind:"system"` 真投递给 su，回显与回放路径与上面
  // 两类同款。判据（**单一来源依赖**，注释即契约）：`system` 类投递正文的**文首定格标记**统一为
  // `[系统·<子类>] `（设计 §3.3 `[系统·看护]`、§7.3 `[系统·收束]`；子类集合随编排 O1 的文案单一来源
  // 落树扩充——判据只依赖该标记形态，不逐子类登记）。归类 =（剥掉可选 `用户指令：` 前缀后）以
  // `[系统·` 开头、`<子类>` 闭合于 `]` 且其后为空白或文末（子类内无括号/换行、长度有界——
  // 「看起来像」不归类）。来源标注 = **系统**（非角色）：`sourceRoleId` 恒空、标签带子类原文。
  var SYSTEM_HEAD = "[系统·";
  var SYSTEM_SUB_MAX = 12;

  function classifySystemMessage(body) {
    if (body.indexOf(SYSTEM_HEAD) !== 0) return null;
    var rest = body.slice(SYSTEM_HEAD.length);
    var end = rest.indexOf("]");
    if (end < 1 || end > SYSTEM_SUB_MAX) return null;
    var sub = rest.slice(0, end);
    if (/[\[\]\r\n]/.test(sub)) return null;
    var after = rest.slice(end + 1);
    if (after !== "" && !/^\s/.test(after)) return null;
    // W6b（2026-10-16 客户批准）：正文**展示**去掉文首标记（chip「系统消息 · <子类>」已承载）——`displayBody`
    // 仅供呈现层取用；`body` 保持投递原文（归类判据/身份不因此改变：判据仍在原文上）。
    var displayBody = after.replace(/^\s+/, "");
    return { kind: "system", label: "系统消息 · " + sub, sourceRoleId: "", body: body, displayBody: displayBody };
  }

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
    return classifySystemMessage(body);
  }

  // —————— S1（2026-10-16 客户批准）：工具调用相位合并 ——————
  // 同一 `toolCallId`（带 turnId 时同 turn）的「调用发起 + 结果」两相位并成**一行**展示（终态为准；
  // 未返回时只有「调用发起」）；**不折叠重复调用**——不同 callId 永远各占一行，行序 = 该调用**首相位**
  // 在条目序中的位置（合并只发生在同一身份的两相位之间，实际身份与顺序逐条保留）。仅返回下标映射
  // （纯函数）：`[{ index: 首相位下标, phases: [各相位下标(到达序)] }]`——行内各相位的身份、详情
  // 展开与 legacy 投影由呈现层按原下标继续取用（`data.items` 本体不动——虚拟窗口行高缓存、
  // token→行映射、回放锚点全部不受影响）。无 callId 的条目各成一行（缺一不并）。
  function mergePhases(items) {
    var list = Array.isArray(items) ? items : [];
    var byCall = Object.create(null);
    var rows = [];
    for (var i = 0; i < list.length; i += 1) {
      var a = list[i] && typeof list[i] === "object" ? list[i] : {};
      var callId = typeof a.callId === "string" && a.callId !== "" ? a.callId : "";
      var turnId = typeof a.turnId === "string" ? a.turnId : "";
      var key = callId ? turnId + "\u0000" + callId : "";
      if (key && byCall[key]) { byCall[key].phases.push(i); continue; }
      var row = { index: i, phases: [i] };
      if (key) byCall[key] = row;
      rows.push(row);
    }
    return rows;
  }

  /** 组摘要口径（S4，2026-10-16 客户批准；工具行折叠口径，2026-10-16 客户批准修订）：
   *  `calls` = **调用数**（`mergePhases` 行数）——「N 个调用」；`tools` = 按**调用行**的
   *  **工具分解**（首现序 `[{name, count}]`，名字取终态相位、回退首相位）——「a / b ×k / c」；
   *  `denied` = 含**未放行**相位的行数 / `failed` = 含**失败或超时终止**相位的行数（同一行既有未放行
   *  又有失败相位时记入未放行——一笔调用只进一类；未放行 = 门禁未放行，从未执行，「未放行优先」如实）；
   *  `unknown` = 任一条目状态未记录（保留既有「· 含状态未记录」如实计数）。
   *  **旧「exceptional」计数由本修订拆分为 denied/failed**（口径见折叠行文案：含 X 条未放行 / 含 Y 条失败）——
   *  拆分口径逐行走同一 `status` 事实（tool-rows 单点），渲染侧不另判。纯计数，不改变任何条目事实。 */
  function callSummary(items) {
    var list = Array.isArray(items) ? items : [];
    var rows = mergePhases(list);
    var denied = 0;
    var failed = 0;
    var unknown = false;
    var tools = [];
    var toolIndex = Object.create(null);
    for (var i = 0; i < rows.length; i += 1) {
      var rowDenied = false;
      var rowFailed = false;
      var first = null;
      var terminal = null;
      for (var j = 0; j < rows[i].phases.length; j += 1) {
        var a = list[rows[i].phases[j]] || {};
        if (a.status === "denied") rowDenied = true;
        if (a.status === "failed" || a.status === "timed-out") rowFailed = true;
        if (a.status === "unknown") unknown = true;
        if (!first) first = a;
        terminal = a;
      }
      if (rowDenied) denied += 1;
      else if (rowFailed) failed += 1;
      var name = (terminal && terminal.toolName) || (first && first.toolName) || "工具";
      if (toolIndex[name] === undefined) {
        toolIndex[name] = tools.length;
        tools.push({ name: name, count: 0 });
      }
      tools[toolIndex[name]].count += 1;
    }
    return { calls: rows.length, denied: denied, failed: failed, unknown: unknown, tools: tools };
  }

  // —————— G-5 wave 2（推理折叠行；客户 2026-10-16 批准 G-5「按推荐批准，开始实施」）——————
  // 消费面冻结形＝`RuntimeReasoningDisplayDetailV1.reasoning`（`{text: DisplayTextV1, status, durationMs?}`，
  // 核心投影单点后的唯一呈现输入——脱敏/预算已在投影发生，本层只合成**文案**、不碰内容）。文案纪律
  // （设计 §5.2 定格）：**有真实时长信号才显示秒数**（无信号不发明时间——「推理内容」类如实措辞）、
  // **平台省略内容时不假装有内容**（omitted ⇒ 如实注明，绝不拿「发生」冒充「内容」）。文案终形＝桌面UI，
  // 单一来源＝本两纯函数（renderer 只取用、不另写一份；改动只在此处）。
  //   complete ＋ durationMs ⇒ 「已思考 N 秒」；complete 无时长 ⇒ 「推理内容」；
  //   omitted ⇒ 「已思考（内容由平台省略）」/「已思考 N 秒（内容由平台省略）」。
  // `N`＝四舍五入到整秒、**下限 1**（防「已思考 0 秒」措辞坏件；亚秒真实信号仍如实体现在「已思考过」）。
  function reasoningSeconds(ms) {
    var s = Math.round(ms / 1000);
    return s < 1 ? 1 : s;
  }
  /** 折叠行文案（纯函数；非法/缺席 durationMs 按「无时长信号」——绝不猜测）。 */
  function reasoningLabel(reasoning) {
    var r = reasoning && typeof reasoning === "object" ? reasoning : {};
    var ms = typeof r.durationMs === "number" && isFinite(r.durationMs) && r.durationMs >= 0 ? r.durationMs : null;
    if (r.status === "omitted") return "已思考" + (ms === null ? "" : " " + reasoningSeconds(ms) + " 秒") + "（内容由平台省略）";
    if (ms === null) return "推理内容";
    return "已思考 " + reasoningSeconds(ms) + " 秒";
  }
  /** 可展开性：仅 **complete 且正文非空** 才给折叠开合——omitted/仅签名（空正文）无内容可展（不摆空展开器）。 */
  function reasoningFoldable(reasoning) {
    var r = reasoning && typeof reasoning === "object" ? reasoning : {};
    return r.status === "complete" && !!r.text && typeof r.text.text === "string" && r.text.text !== "";
  }

  // 展示事实只来自已存在的执行结果；accepted单独出现不是执行成功。
  var SPECIAL_TOOLS = ["request_confirmation", "request_choice", "submit_report", "dispatch_task", "report_shell_verdict"];
  function isToolActivity(input) {
    var o = input && typeof input === "object" ? input : {};
    var d = o.activity || o.detail;
    if (d && d.source === "delivery-note") return false;
    if (o.kind === "tool") return true;
    if (!d || typeof d !== "object") return false;
    return typeof d.toolName === "string" && d.toolName !== "" || typeof d.name === "string" && d.name !== "" || typeof d.callId === "string" && d.callId !== "" || typeof d.toolCallId === "string" && d.toolCallId !== "" || !!(d.call && typeof d.call.name === "string" && d.call.name !== "") || !!(d.display && d.display.version === 1);
  }
  function activityOf(input) {
    var o = input && typeof input === "object" ? input : {};
    var d = o.activity || (o.detail && typeof o.detail === "object" ? o.detail : {});
    var call = d.call && typeof d.call === "object" ? d.call : d;
    var args = call.args && typeof call.args === "object" ? call.args : {};
    var ok = typeof d.ok === "boolean" ? d.ok : d.result && typeof d.result.ok === "boolean" ? d.result.ok : undefined;
    var raw = String(o.summary == null ? (o.text || "") : o.summary);
    var match = /(?:调用工具 |请求调用 |开始执行 )([\w.-]+)/.exec(raw);
    var resultName = /^([\w.-]+)[:： ]/.exec(raw);
    var tool = typeof d.toolName === "string" ? d.toolName : typeof call.name === "string" ? call.name : (match ? match[1] : resultName ? resultName[1] : "工具");
    var phase = d.phase || (o.kind === "tool_call" || /^调用工具 [\w.-]+$/.test(raw) ? "call" : "result");
    var eventKind = o.eventKind || o.kind;
    var identityPhase = ["start", "result", "blocked"].indexOf(d.phase) >= 0 ? d.phase : eventKind === "tool_call" ? "start" : eventKind === "accepted" ? "result" : eventKind === "denied" ? "blocked" : "";
    if (identityPhase === "start") phase = "call";
    if (identityPhase === "blocked") phase = "blocked";
    var head = raw.split(/\r?\n/)[0];
    if (head.indexOf(tool + '：' + tool) === 0) head = head.slice(tool.length + 1);
    var shellResult = tool === "run_shell" ? /^run_shell 已执行：(.+)（exit (-?\d+|\?)(?:，signal [^）]+)?）$/.exec(head) : null;
    var readFailure = tool === "read_file" ? /^read_file 失败：(.+)（.+）$/.exec(head) : null;
    var knownFailure = !!readFailure || !!(shellResult && shellResult[2] !== "?" && Number(shellResult[2]) !== 0);
    var failed = knownFailure || d.status === "failed" || ok === false;
    var status = failed ? "failed" : (o.kind === "denied" || identityPhase === "blocked") ? "denied" : phase === "call" ? "call" : (d.status === "completed" || ok === true) ? "completed" : d.status === "returned" ? "returned" : "unknown";
    var target = typeof d.target === "string" && d.target !== "" ? d.target : typeof d.path === "string" && d.path !== "" ? d.path : typeof args.path === "string" ? args.path : typeof args.command === "string" ? args.command : shellResult ? shellResult[1] : readFailure ? readFailure[1] : "";
    var hasDisplay = Object.prototype.hasOwnProperty.call(d, "display");
    var display = d.display && d.display.version === 1 ? d.display : null;
    if (hasDisplay) target = display && display.target && display.target.value && typeof display.target.value.text === "string" ? display.target.value.text : "";
    // —— F-8-b（2026-10-16 客户批准）：run_shell「进程跑完、退出码非零」的行分类——**结构化事实优先** ——
    // 判据只认 `display.process` 的结构化事实，不解析消息文本（旧 `knownFailure` 正则解析的
    // 「run_shell 已执行：…（exit N）」消息**不改**，故与旧正则并存；本块命中即覆盖上面的文本推断，
    // 未命中（无 display.process 的旧文本行）走既有路径，行为不变——过渡期兼容）：
    //  · `timedOut === true` → 独立一类「超时终止」（命令被时限终止属异常终止，仍置 exceptional 标红）；
    //  · `exitCode` 为数字、非 0、且无 `error`/`signal` → 「已执行完成（退出码 N）」中性类：进程正常跑完，
    //    退出码非零可以是合法结果（如 grep 无匹配 exit 1）——不置 exceptional（红→中性）。
    //    `display.process` 当前无 error 成员，此处防御式检查（未来生产者若携带则不判中性，绝不吞异常）。
    // 消费方（renderer.js）据 `status === "exited-nonzero"` 让位错误预览/详情「错误」字段——同一判据，单处来源。
    var process = display && display.process && typeof display.process === "object" ? display.process : null;
    var processExitCode = process && typeof process.exitCode === "number" && isFinite(process.exitCode) ? process.exitCode : null;
    if (process && process.timedOut === true) status = "timed-out";
    else if (processExitCode !== null && processExitCode !== 0 && process.error === undefined && process.signal === undefined) status = "exited-nonzero";
    var label = status === "failed" ? "执行失败" : status === "denied" ? "已拒绝" : status === "call" ? "调用发起" : status === "completed" ? "执行完成" : status === "returned" ? "工具返回" : status === "exited-nonzero" ? "已执行完成（退出码 " + processExitCode + "）" : status === "timed-out" ? "超时终止" : "状态未记录";
    var exceptional = status === "exited-nonzero" ? false : status === "timed-out" ? true : (failed || o.kind === "denied" || identityPhase === "blocked");
    return { legacyTextProjection: o.textProjection && typeof o.textProjection.text === "string" ? o.textProjection : null, legacyStatusSource: o.legacyStatusSource || "", legacyTargetSource: o.legacyTargetSource || "", metadataOmissions: Array.isArray(o.metadataOmissions) ? o.metadataOmissions : [], display: display, hasDisplay: hasDisplay, displayUnsupported: hasDisplay && !display,
      errorCode: typeof d.errorCode === "string" ? d.errorCode : "", toolName: tool, target: slimToolRow(target), fullTarget: target, phase: phase, identityPhase: identityPhase, status: status,
      label: label,
      turnId: typeof o.turnId === "string" ? o.turnId : "", callId: typeof d.toolCallId === "string" ? d.toolCallId : typeof call.toolCallId === "string" ? call.toolCallId : typeof d.callId === "string" ? d.callId : "",
      runtime: typeof o.runtime === "string" ? o.runtime : typeof d.runtime === "string" ? d.runtime : "",
      exceptional: exceptional, deniedSummary: o.eventKind === "denied" || o.kind === "denied" && typeof o.summary === "string" ? raw : "", visibleSummary: head, barrier: hasDisplay || SPECIAL_TOOLS.indexOf(tool) >= 0 || !!o.anchorKey,
      summary: slimToolRow(raw), at: typeof o.at === "string" ? o.at : "" };
  }

  var api = { isToolActivity: isToolActivity, activityOf: activityOf, slimToolRow: slimToolRow, LIMIT: LIMIT, classifyInjectedMessage: classifyInjectedMessage, INJECT_PREFIXES: INJECT_PREFIXES, mergePhases: mergePhases, callSummary: callSummary, reasoningLabel: reasoningLabel, reasoningFoldable: reasoningFoldable };
  root.ANSToolRows = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
