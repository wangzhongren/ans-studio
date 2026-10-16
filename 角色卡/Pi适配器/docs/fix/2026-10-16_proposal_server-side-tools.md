---
id: pi-server-side-tools-proposal
type: proposal
title: 服务端工具族（web_search/web_fetch/code_execution）接入提案——可配置服务端工具集（Pi 侧）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
revision: 2
---

# 服务端工具族接入提案（Pi 侧）——可配置的服务端工具集

**状态：未实施 / 未测试（提案轮，2026-10-16）。本文只出方案，未改任何 src/app/test 代码、未写测试、未 git 提交、未自行发任何探针请求。**
**【2026-10-16 更新：客户已批准（「按推荐批准，开始实施」），本角色已实施（PI-S-1 / PI-S-2 路径 C / PI-S-3），状态＝已实施待验证——批准口径的落实、与本文的差异与未验边界以文末「实施记录」为准。】**

本上下文固定为 Pi 适配器（boundary.yaml Section 1）。范围：**只管 Pi 侧**（`anthropic-messages` 协议路径）。PM 补充口径（2026-10-16，转达）：客户要求「三平台都要接上搜索」——Claude/Codex 两条路径由各自适配器上下文另立提案；本提案按**可配置的服务端工具集**设计，块类型到聊天行的映射口径同时作为跨平台参考接口（对齐由 PM 统筹，见 §二.6）。

## 〇、背景与已达成的事实（客户探针实证，PM 转达）

1. **网关实证（2026-10-16，客户本机 curl 直连 aiproxy2/deepseek）**：请求中声明 Anthropic 服务端工具 `{"type":"web_search_20250305","name":"web_search","max_uses":1}` → **HTTP 200，搜索在服务端真实执行**。返回含 `server_tool_use`（含 query input、caller direct）与 `web_search_tool_result`（`web_search_result` 列表：title/url/encrypted_content）；超限的后续调用以 `max_uses_exceeded` 优雅错误码被拒（非崩溃）；usage 含 `server_tool_use.web_search_requests`（**按次计量**）。
2. **客户要求**：不止 web_search——网关支持的其它服务端工具（至少 `web_fetch`（web_fetch_20250910）、`code_execution`（code_execution_20250825），以追加探针为准）一并接入；方案按可配置集设计，不写死单个工具。
3. **本仓链路只读核实**（本文引用的 SDK 均为已安装 dist 产物，非文档转述）：`@earendil-works/pi-coding-agent@1.1.0` + `@earendil-works/pi-ai`（随附）。引用格式 `包路径:行号`；`pi-ai`/`pi-coding-agent` 指各自 `dist/` 下文件。

## 一、（a）SDK 注入点调研（重点）

### 1.1 现行请求构造链（file:line 逐段）

本仓构造：

- `src/common/pi-adapter/real-adapter.ts:96` — `const { anthropicMessagesApi } = await import("@earendil-works/pi-ai/api/anthropic-messages.lazy")`（本角色唯一 import Pi 处，动态加载）。
- `real-adapter.ts:113-142` — 克隆 anthropic 模板模型（收窄 compat 五项）；`:144-151` — `piAi.createProvider({ id, name, baseUrl, auth, models:[model], api: anthropicMessagesApi() })`；`:153-158` — `ModelRuntime.create`（内存凭据）+ `registerNativeProvider`；`:166-179` — baseUrl / contextWindow 安全护栏。
- `real-adapter.ts:997-1011` — `createAgentSession({ cwd, noTools: "builtin", customTools, resourceLoader, model, modelRuntime, sessionManager, settingsManager })`；`:1013-1017` — 断言 `session.getActiveToolNames()` 全部属于注入工具集（否则抛错）。

wire 请求由 pi-ai 组装：

- `pi-ai/dist/api/anthropic-messages.js:858-935` — `buildParams(...)`：`params.tools = convertTools(getCurrentTools(context.messages))`（:931-934；工具来自**转录里的 system 消息元数据** `toolsAdded`，`pi-ai/dist/utils/transcript.js:41-51`）。nativeToolChanges 分支（:920-929，生成 `tool_addition`/`tool_removal` 块）因 `real-adapter.ts:136-137` 已收窄 compat 为 false **永不激活**。
- `anthropic-messages.js:1258-1285` — `convertTools(...)`：每条工具**只产出** `{ name, description, input_schema, eager_input_streaming?, strict?, cache_control? }`——**没有任何字段通道承载服务端工具声明所需的 `type`**（如 `"web_search_20250305"`）与 `max_uses`。
- `anthropic-messages.js:428-432` — **关键接缝**：`let params = buildParams(...)；const nextParams = await options?.onPayload?.(params, model)；if (nextParams !== undefined) params = { ...nextParams, stream: true }`——**onPayload 拿到完整 wire 参数对象（含 `tools`/`system`/`messages`/`betas`），可返回替换**。
- `anthropic-messages.js:438` — `client.beta.messages.create(params, { signal, timeoutMs, maxRetries: 0 })`：pi-ai 在 onPayload **之后不做任何 tools 校验/过滤**，Anthropic SDK 客户端也不做请求体校验——追加的声明原样上 wire。

### 1.2 注入通道结论（一句话）

**SDK 对服务端工具零支持**（对整个 pi-ai + pi-coding-agent dist 的 `server_tool|web_search|web_fetch|code_execution` 逐字 grep：**0 命中**），常规 `tools` 通道也无法表达（`convertTools` 无 `type` 通道，见 §一.1）；**确切注入通道＝扩展事件 `before_provider_request`**——它是 SDK 公开的扩展事件（`pi-coding-agent/dist/core/extensions/types.d.ts:680-683`：「Fired before a provider request is sent. **Can replace the payload**.」；`runner.js:1066-1090`：handler 返回值非 `undefined` 即替换 payload，handler 抛错被俘获且**不影响请求**），由 sdk.js 挂到 Agent 的 `onPayload`（见 §1.3），最终落在 pi-ai `anthropic-messages.js:428-432` 的同名钩子上——**我们在该 handler 里向 `payload.tools` 尾部追加服务端工具声明，即完成声明注入**。

**观测通道＝扩展事件 `provider_stream_event`**（types.d.ts:700-706：「Fired for a parsed provider stream event **before Pi normalizes it**」；`data: unknown` 为已 JSON 解析的原始 SSE 事件）：pi-ai 在归一化**之前**逐事件回调（`anthropic-messages.js:446-447`：`await options?.onProviderStreamEvent?.(event, model)`）。服务端工具块都经 `content_block_*` 事件到达（SSE 事件白名单 `ANTHROPIC_MESSAGE_EVENTS`，:225-232），**因此 `server_tool_use`/`web_search_tool_result`/将来 `web_fetch_tool_result`/`code_execution_*` 与 `usage.server_tool_use` 全部可在此观测到**——这是唯一能看到「被 pi-ai 归一化层丢弃的内容」的位置。

### 1.3 钩子全链核实（为什么这两个扩展事件确实会被触发）

```
pi.on("before_provider_request", h)          // 我们的扩展（real-adapter.ts 的 extensionFactories 内）
  ← runner.emitBeforeProviderRequest(payload) // runner.js:1066-1090（替换 || 透传）
  ← sdk.js:225-229 transformProviderPayload   // 扩展 runner 分发
  ← Agent({ onPayload: … })                    // sdk.js:274-276（onResponse/onProviderStreamEvent 同理）
  ← agent.js:309-311 注入 streamFn options     // pi-agent-core（onPayload/onProviderStreamEvent 同携）
  ← sdk.js:266-271 streamFn → buildRequestOptions(...{...options})  // sdk.js:196-211（options 整体透传）
  ← model-runtime.js:489-513 streamSimple → prepareRequest :447-476（`...providerOptions` 全保留）
  ← pi-ai simple-options.js:18-38 buildBaseOptions（:32-34 明确保留 onPayload/onResponse/onProviderStreamEvent）
  ← anthropic-messages.js:428-432 onPayload(params) / :447 onProviderStreamEvent(event)
```

`provider_stream_event` 同链：`anthropic-messages.js:447` → `sdk.js:241-251 handleProviderStreamEvent` → `runner.js:813-835 emit`（**通用事件 handler 抛错被俘获上报，不中断流**——观测性钩子，安全）。

**注意（已核实的链路边界）**：自动压缩的摘要请求**不经过** Agent 链（`agent-session.js:19` 直接 import `streamSimple`、`:258` 以 `agent.streamFunction === streamSimple` 判定）——摘要请求既不附带声明也不产生捕获，无需处理；缓存预热请求可能途经同一 options（`sdk.js:262-270` 的 requestOptions 已含钩子），但预热请求不会产生 `server_tool_use` 块，无害（低风险，登记）。

### 1.4 排除的备选通道（依据）

| 候选 | 结论 | 依据 |
| --- | --- | --- |
| `customTools` 注册一个客户端 `web_search` 工具 | **拒** | 需本机执行搜索（无此能力；且会把「外部内容获取」引入本机治理面，与设计相反）；`web_search` 的语义在服务端执行，不落在本机 |
| 转录 system 消息 `toolsAdded` 携带带 `type` 的工具定义 | **拒** | `convertTools`（anthropic-messages.js:1258-1285）固定重建 `{name, description, input_schema}`，`type` 字段被丢弃 |
| 扩展 `context_with_system` 替换完整转录 | **拒** | 同因（tools 仍过 `buildParams`→`convertTools`）；且语义层次高于需要 |
| `onPayload` 层追加（=扩展 `before_provider_request`） | **选** | 见 §1.1-1.3；此后无任何校验/过滤 |

### 1.5 `noTools:"builtin"` 与参数校验的正交性（核实）

- `sdk.d.ts:27-33`：`noTools?: "all" | "builtin"`——`"builtin"`「disable the default built-in tools (read, bash, edit, write) but keep extension/custom tools enabled」；解析在 `sdk.js:148-157`（defaultToolNames / allowedToolNames）；`agent-session.js:132,182` 注册 `customTools`、`:1068` `getActiveToolNames`。
- **服务端工具既不是内置工具也不是扩展/自定义工具**：不进客户端工具注册表（→ `real-adapter.ts:1013-1017` 的断言不受影响）、不参与 `noTools`/`tools` 允许名单、不经任何工具执行/治理钩子。`noTools:"builtin"` 与声明注入**完全正交**。
- 参数校验面：pi-ai 在 onPayload 后直接 `.create(params)`（anthropic-messages.js:438），Anthropic SDK 客户端仅做 HTTP 序列化——**不存在会剔除追加声明的 SDK 侧校验**。`params.betas`（若未来某工具需 beta 头）也可在同一 handler 追加。

### 1.6 最小方案与落点（拟改动，全部在本角色边界内）

- **新私有模块 `src/common/pi-adapter/server-tools.ts`**（不 import Pi，可纯单测）：
  - 注册表 `SERVER_TOOL_REGISTRY`：`web_search` → `{ type: "web_search_20250305", name: "web_search", defaultMaxUses: 1 }`；`web_fetch` → `{ type: "web_fetch_20250910", … }`；`code_execution` → `{ type: "code_execution_20250825", … }`（type 串集中一处、以客户追加探针结果为准）；
  - `parseServerToolConfig(env)`：读 `ANS_PI_SERVER_TOOLS`（格式 `id[:max_uses][,id2…]`；未设置/空/显式关闭值（`0/off/none`）⇒ 关；**未知 id ⇒ 构造期抛错**——一句话明确、不静默半开，与「缺 baseUrl 即抛」同口径）；返回 `{ enabled: ServerToolDeclaration[] }`；
  - `buildServerToolDeclarations(enabled)`、`createServerToolObserver(...)`（**纯函数状态机**：输入 `provider_stream_event` 数据，输出「行事件命令 / usage 记账 / 退化标记」列表；不发事件、不碰 Pi 类型）。
- **`real-adapter.ts`**：在 `buildGovernanceExtension`（:455-593）内注册四个 handler（缺省未启用时全部**早退**——行为逐字与今日一致）：
  1. `before_provider_request`：`payload.tools` 尾部追加声明（**幂等**：已含同名 `type` 声明则跳过；`tools` 为 undefined 时创建）；标记 `usedThisRequest`；
  2. `after_provider_response`：记录 `status`（降级判据用，§四.2）；
  3. `provider_stream_event`：过滤 `event.api==="anthropic-messages"` 后委派 observer（O(1) 早退；见 §二.7 性能口径），产物经既有 `projectToolEvent`/`emit` 输出；
  4. `agent_before_settle`：**仅**在启用时注册（§四.2 剥离重试；handler 内状态驱动、不命中即返回 undefined）。
- **bindRole**：解析配置（`real-adapter.ts` 的 `opts.config ?? resolvePiProviderConfig(...)` 一带或新解析函数）；启用非空时——`log.stage` + **一次**聊天行「本会话已启用服务端工具：web_search（max_uses=1，按次计费）」+ 诊断 `server_tool.declare`。
- **不动**：`src/provider/pi/*`（契约不新增类型）、`settings.ts`、`timeout.ts`、`lifecycle.ts`（v1 无需改；settled 扩展见 §二.5 建议）。

## 二、（b）块类型处理：现状 → 拟映射

### 2.1 现状（pi-ai 归一化层，逐块核实）

| 服务端工具块/字段 | pi-ai 现状 | 后果 |
| --- | --- | --- |
| `content_block_start` 的 `server_tool_use` | 不在识别列表（:472-523 只认 fallback/text/thinking/redacted_thinking/tool_use）→ **静默不入块、不报错** | 转录无此块；不会出现在助手消息/回放 |
| `web_search_tool_result`（及将来 `web_fetch_tool_result`/`code_execution_tool_result`） | 同上，静默丢弃 | 同上（**含 encrypted_content，天然不进本机任何存储**） |
| `content_block_delta`（`input_json_delta` 至 server_tool_use 索引、`citations_delta` 等） | 只认 text/thinking/input_json/signature（:524-573）；未知索引/类型 no-op | 静默丢弃；**不会错配到其它块**（按 index 查找，未知块从未入块） |
| `content_block_stop`（未知块索引） | `findIndex` 找不到块 → no-op（:574-608） | 静默 |
| `usage.server_tool_use.web_search_requests`（message_delta） | :609-651 只读 input/output/cache 系列 + thinking_tokens | **计量被丢弃**（必须由我们自己在 `provider_stream_event` 捕获） |
| `stop_reason: "pause_turn"` | mapStopReason :1299-1300 → `"stop"` | 轮次按正常完成收尾（服务端长任务会被提前结束，见 §四.3） |
| 未知 `stop_reason` | :1305-1307 **直接 throw** → 流 error | 轮次 error 收尾（既有行为；`provider_stream_event` 先于该 throw 看到原始值，:447 早于 :614-615） |
| 助手消息回放（多轮） | :1091-1144 只回放 text/thinking/redacted/toolCall；任何未识别块**回放时也会被丢弃** | 即便将来把块存进转录，回放也不上行 |

适配器侧现状：`real-adapter.ts:596-610` `extractMessageText` 只抽 text 块、`buildGovernanceExtension` 的既有映射（:473-590）与 `wireSettledOnce`（:415-430）都不受未知块影响——**现状无任何「丢弃/报错」缺口会变坏；缺口是「服务端工具全程不可见」**。

### 2.2 拟映射（聊天流工具行，复用既有工具行/显示 profile 口径）

在 `provider_stream_event` 观测到的原始事件 → 组装为 `RuntimeToolEventSource`（`src/model/runtime.ts:528-542`）→ 经既有 `projectToolEvent`（接缝：`real-adapter.ts:315-318` / `:516-544`；Core 实现 `src/common/runtime-core/tool-display.ts:90-158`）投影为既有 `tool_call`/`accepted`/`denied` 行——**与客户端工具行同一形状、同一净化/预算/回放路径，桌面 v1 零改动**：

| 原始事件 | 拟投影 |
| --- | --- |
| `content_block_start{server_tool_use}` | `{origin:"native-start", phase:"start", runtime:"pi", roleId, turnId, toolName:"web_search"|"web_fetch"|"code_execution", toolCallId: <block.id>, input:{rule:"none", args:{}}}` → 行「web_search 调用发起」 |
| `content_block_delta{input_json_delta}`（server_tool_use 索引） | 累积查询串（解析容错；解析供行文本用，**不单独落任何存储**） |
| `content_block_start{web_search_tool_result}` 或对应块 stop | `{origin:"native-result", phase:"result", …, result:{ ok, message }}`：`message` =「查询「…」→ N 条结果：title — url；…（截断）」；块出现在 start（完整）或 delta 增量两种形状**都容忍**（以探针/loopback 定形） |
| 结果块为错误变体（如 `max_uses_exceeded`） | `ok:false` → denied 行，文案「搜索次数已达上限（max_uses_exceeded）：本调用被网关拒绝，**非运行错误**」（§四.1） |
| 将来 `code_execution` | 同表：start 行；结果行 message = 退出码 + stdout 摘要（预算内） |

口径说明（沿用不改）：
- 行文本经 Core `protectText`（凭据清洗 + 预算 16 384 B 截断，tool-display.ts:70-78/:11）；**URL 会被 `cleanPatterns` 去掉 query/fragment/userinfo**（tool-display.ts:38-41）——搜索结果链接将只显示 host+path，属既有防泄密口径，**不改**；
- `display.target` 的 kind 目前只有 `path`/`command`（runtime.ts:481）——v1 查询串放结果行文本；若客户要「查询作为行目标」需 Core 扩充 target kind（跨边界建议，§六）；
- **encrypted_content 一律不进内存捕获与任何落盘**（observer 只取 title/url/计数白名单字段，URL 摘除见上）；
- 行事件照既有路径进 ANS replay（与其它工具行同权）；**原生 Pi JSONL 转录不含服务端块**（pi-ai 丢弃所致），历史回看以 ANS replay 行为准。

### 2.3 usage 计量透出（诊断）

- observer 在 `message_delta` 捕获 `usage.server_tool_use.<tool>_requests`（客户探针已证存在）；若网关不回传，以本地观察到的成功 `server_tool_use` 块**计数兜底**，诊断字段区分来源（`state:"from-usage"|"from-blocks"`）。
- 记账：`diagnostics.record("server_tool.usage", { toolName, count })`（`turnId` 随附）——字段全部落在共享诊断白名单内（`src/common/shared/diagnostics.ts:11-18`：toolName/count/turnId/state）。声明时 `server_tool.declare`、调用时 `server_tool.call`（count=1/次）、降级时 `server_tool.degraded`（§四.2）。

### 2.4 内容/元数据分层（沿既有诊断契约）

- 契约依据：`diagnostics.ts:9-10` 注释——「落盘白名单：仅元数据（标识/量值/判定）可入；命令原文、argv、prompt/源内容等正文依设计契约禁入」；`safeFields`（:49-59）只透白名单字段。
- **查询串建议不进诊断**（正文类；白名单亦无字段可承载）。诊断只落：工具名、次数、ok/状态、错误码类别。**行文本与结果标题/URL 只进聊天流/Replay**（与工具结果同层，天然对用户可见可回放）。
- 如需「查询串级」进诊断：须共享 diagnostics（项目管理属主）加白名单字段并评审——**本提案建议先不加**；待客户裁定。

### 2.5 终态记录

- v1：settled 不动（`lifecycle.ts:97` 的 detail「只增字段」先例可扩展 `serverToolUse:{web_search:N}`，但属桌面可见性需求、跨边界留建议）。
- 服务端工具**不新增 settled 发射点**（X-1 纪律：settled 唯一出口在 wireSettledOnce/生命周期），行事件为 tool_call/accepted/denied/message——无重复源风险（每个 `server_tool_use` 块 id 恰一对 start/result；SDK 自动重试/剥离重试会产生**新一轮**行——如实呈现，与客户端工具行在重试下的既有行为同口径）。

### 2.6 跨平台接口备注（PM 口径）

本节的「块 → 行」映射（toolName 用 `web_search`/`web_fetch`/`code_execution`；行文本、ok 语义、denied 文案、usage 记账口径）即**聊天流行样式的跨平台参考接口**：Pi 侧按本表实现；Claude/Codex 两条路径由各自适配器上下文另立提案；**三平台呈现与治理口径的最终对齐由 PM 统筹**，本提案不代拟别家方案。

### 2.7 观测性能口径（实现约束）

`provider_stream_event` 对流内**每个** SSE 事件触发。handler 必须：只处理 `content_block_start|delta|stop|message_delta|message_start` 五类（其余立即 return）；同步累积、无重活；不做日志（诊断在结果行时聚合记录一次）。`before_provider_request` 同理幂等轻量。

## 三、（c）能力位与策略

### 3.1 形态与默认值

- **全局开关**：环境变量 `ANS_PI_SERVER_TOOLS`（本角色内闭环，沿 `ANS_PI_*` 先例）。例：`ANS_PI_SERVER_TOOLS=web_search`（max_uses 缺省 1）、`=web_search:3,web_fetch`。未设置/空/`off|0|none` ⇒ 关。**未知 id ⇒ bindRole 抛错**（明确失败）。
- **缺省值建议：全关（[]）**。理由：
  1. **按次计费**——搜索/抓取调用由模型自发触发、在角色权限判定之外发生（计费在服务端、发生时点不受本仓治理）；
  2. **提示注入面**——服务端工具把**外部不可信内容**直接注入模型上下文，而本仓治理一直只管「写盘/命令」面、不审内容可信度；搜索会把内容信任问题引入决策回路（对 su/派发类角色影响更大）；
  3. 与既有「能力缺席＝最强 fail-closed」纪律一致（customerInput/dispatchTask 先例）。
- 拟有默认参数：`web_search`/`web_fetch` `max_uses` 缺省 **1**（客户探针同值；按次计费下最保守）；`code_execution` 无 max_uses 参数。
- **per-role 授予（v2，跨边界建议）**：沿 dispatch_task「按角色注入」先例，经 `RuntimeProviderOptions` 扩可选 `serverTools?` 契约字段 + capabilities 链（`run-role.ts:984-1013` → `src/service/runtime/session.ts:113-135` → adapter）实现「按角色授予」；契约字段属**运行时核心**（`model/runtime.ts` 单一来源），编排接线属编排——本提案只列建议，PM 统筹。v1 先全局 env。

### 3.2 与 `noTools:"builtin"` 正交（治理面澄清）

- `noTools` 管的是**客户端工具注册表**（§1.5）；服务端工具**不触碰本机文件系统与 shell**、不执行本地进程、不进注册表、不受 `WriteGate`/`ShellGate`/`allowedToolNames` 约束，亦不产生本机痕迹。
- **重要口径（防混淆）**：`code_execution` 在**服务端沙箱**执行——**不受 F-1（命令级执行时限）/ ShellGate / run_shell kill-switch 管辖**；不要在呈现上让用户误以为它与本机 shell 受同一治理。启用 code_execution 时建议行文案/启用行明示「服务端执行」。
- 治理面实际变化仅三点：**计费**（usage 透出，§2.3）、**内容可信度**（外部内容进上下文；建议启用行/文档如实提示；角色卡层面的提示属跨边界建议）、**trace 呈现**（行 + 诊断，§二）。

## 四、（d）失败与边界

### 4.1 `max_uses_exceeded` 如实呈现

客户探针已证：超限的后续调用被**优雅拒绝**（非崩溃）。拟：结果块为错误变体时 → `ok:false` 的 denied 行 + 文案「搜索次数已达上限（max_uses_exceeded）：本调用被网关拒绝，非运行错误；可继续交谈或由客户调大 max_uses」。**绝不**映射为轮次失败/模型故障。诊断记 `server_tool.degraded`（同 `errorCode:"MAX_USES_EXCEEDED"`……以实现轮定名；字段走白名单）。

### 4.2 网关不认声明（4xx）：不毁轮次、如实降级/剥离重试

检测链（全在扩展内，不改 pi-ai）：

1. `before_provider_request` 置 `lastRequestHadServerTools=true`（每请求重置）+
   `after_provider_response{status}` 记录 `lastStatus`（types.d.ts:694-698 只给 status/headers，**没有响应体**）；
2. 该请求失败的助手消息经既有 `message_end`（`real-adapter.ts:554-559`）可见 `stopReason==="error"` → 若 `lastStatus>=400 && lastRequestHadServerTools && 声明仍启用`，判**疑似声明致拒** → 置 `pendingDegrade`，发**如实**行「网关拒绝了包含服务端工具声明的请求（HTTP 400）。将剥离声明后重试一次。」
3. **剥离重试机制（候选 A，须实施轮桩验证）**：扩展注册 `agent_before_settle`（types.d.ts:1186；`agent-session.js:1452` 在每轮最终 settle 前调用）——handler 检查 `pendingDegrade && outcome==="error"`，返回 `{ entries:[context_edit(把失败助手消息从投影置空)], continue: true }`：SDK 会 `agent.continue()` **重发请求且不新增用户消息**（`_runAgentPrompt` 循环 `agent-session.js:1380-1414`）；配套置 `suppressNext=true`（下一次及此后不再附带声明）。机制要点与依据：`BoundaryResult{entries?,continue?}`（types.d.ts:768-771）、`SessionBoundaryDraft` 含 `ContextEditEntryDraft`（types.d.ts:741、754）、`ContextEditEntry.replacement=null`「omits the target from model context」（`session-manager.d.ts:119-126`）、`canContinue` 要求投影末角色非 assistant（`agent-session.js:629`）——**故必须同时置空失败消息，此路径必须桩测试钉死**；
4. **退路 C**（A 若桩验证不过）：不自动重试——本轮**如实失败**（既有失败口径不变），`suppressNext=true` 使**后续轮次**正常；如实行明示「本会话已停用服务端工具声明」；
5. 剥离后仍 400：不再重试（重试有界=1；`pendingDegrade` 需「本请求含声明」前置，:2 条件天然只触发一次）；会话此后无声明 ⇒ 不再触发本路径；
6. 归属口径：错误码类别记诊断（`errorCode`），**errorMessage 不落诊断**（沿 `real-adapter.ts:740-741`「SDK error messages may embed an API response. Diagnostics store the error category only.」）；聊天行文案如实、不含响应体。

### 4.3 `pause_turn` 与未知 stop reason

- `pause_turn`：pi-ai 映射为 `"stop"`（:1299-1300）→ 轮次提前收尾。observer 在 `message_delta` 能看到 `stop_reason:"pause_turn"` → v1 拟**如实呈现一行**「服务端工具执行被暂停（pause_turn）：本轮提前收尾，可继续发消息让模型接着做」+ 诊断 `server_tool.paused`。自动续跑（resubmit）留 v2（需 prompt 级配合），标注未验证。
- 未知 stop reason：pi-ai 直接 throw（:1305-1307）→ 轮次 error 收尾（既有行为）。observer 在 throw 之前已见原始值（:447 早于 :614-615）→ 诊断可先记 `server_tool.unknown_stop_reason`（值截断到白名单字段）。属低概率边界，如实记录即可。

### 4.4 与既有机制的交互

| 机制 | 交互 | 结论 |
| --- | --- | --- |
| F-1（命令级执行时限/ShellGate） | 无代码交集；**服务端 code_execution 不受其管辖** | 呈现上区分（§3.2） |
| F-3-a（截断收尾补发） | 补发是同链新 prompt → 声明照附（或被 suppress）；无冲突 | 补发轮可能再触发搜索行——如实 |
| F-3-b / lifecycle | 不改 lifecycle；截断标记/outcome 枚举不变 | 无 |
| X-1（settled 恰一次） | 不新增 settled 发射点；行事件非 settled 类 | 无重复风险 |
| 自动压缩 | 摘要请求不经 Agent 链（agent-session.js:19,258）——不带声明、不产生捕获 | 无 |
| D-1 恢复 | 服务端块不进 Pi 原生转录（pi-ai 丢弃）⇒ 恢复后历史里没有「孤儿块」；ANS replay 里行照常恢复 | 无 |
| SDK 自动重试（429/5xx；`pi-ai/utils/retry.js:188-196`） | 重试轮重新产生服务端工具行（新 response id）——与客户端工具行在重试下的既有表现一致 | 如实、无需去重 |
| 4xx 剥离重试（§4.2） | 与 F-3-a 补发同为「同轮补发请求」，互不干扰（补发仅在正常返回后考虑；剥离重试在错误路径） | 需测试覆盖组合 |

### 4.5 关键未验证项（诚实清单）

1. **两轮复放**：第一轮搜索后，pi 发给网关的第二轮请求**不含** server_tool_use/web_search_tool_result 块（pi-ai 丢弃所致，§2.1）——**网关/上上游是否接受这种剥离转录，未验证**。客户探针需覆盖「搜索一轮 → 带工具结果的多轮往返」。若拒：需在 `before_provider_request` 里按 message `responseId` 回填捕获块（可行但复杂，按响应 id 匹配、与压缩互斥处理）——列为**预备方案 P（未验证、未设计完成）**，以探针结果决定是否启动。
2. web_fetch/code_execution 的网关支持与块形状（追加探针）；`web_search_tool_result` 是「start 即完整」还是「delta 增量」以探针/loopback 固化（observer 两形状容忍）。
3. 声明对缓存前缀的影响：追加在 `params.tools` 尾部（`cache_control` 已在最后一条客户端工具上，`anthropic-messages.js:1282`）——声明块为不缓存的尾部小 token，且**每请求一致** ⇒ 前缀缓存不受损（推理，非实测）。

## 五、（e）测试计划

全部沿用本仓既有先例；**本轮不写任何测试**。

1. **T1 配置解析单测**（无 Pi）：`server-tools.ts` 纯函数——缺省关/`off`/解析 `id:max_uses`/未知 id 抛错/声明形状逐字（type 串与客户探针 `{"type":"web_search_20250305","name":"web_search","max_uses":1}` 对齐）。
2. **T2 wire 级、不发网络**（沿 `test/pi-adapter/wire-compat-and-legacy.test.ts:76-95` 先例：直接 `anthropicMessagesApi().streamSimple` + `onPayload` 捕获后抛出中止）：断言声明出现在 `params.tools` 尾部、无 `tool_removal/tool_addition`、`stream:true` 不变。
3. **T3 loopback SSE 端到端**（沿 `test/pi-adapter/real-adapter.timeout.test.ts:26-42` 先例：`createServer` + `listen(0,"127.0.0.1")` + `baseUrl http://127.0.0.1:<port>/` + 占位凭据）：本地服务**记录请求体**并回放含 `content_block_start{server_tool_use}`（经 `input_json_delta` 给查询）、`web_search_tool_result`（含 title/url/**encrypted_content 诱饵**）、`message_delta{usage.server_tool_use.web_search_requests}`、`message_stop` 的假 SSE——断言：① 请求体含声明；② 事件流恰一对 start/result 行（toolName=`web_search`、查询与结果标题进 resultText、URL query 被剥）；③ **诱饵 encrypted_content 不出现在任何事件/诊断/落盘**；④ 诊断 `server_tool.usage` count 与来源标记；⑤ settled 恰一（X-1 回归）。
4. **T4 max_uses_exceeded**（loopback 变体：结果块为错误变体）→ denied 行文案断言 + outcome 不判失败。
5. **T5 剥离降级**（loopback：首答 400 + 无 SSE）：断言降级行文案、`suppressNext` 后**下一请求体不含声明**；A/C 两形态各自断言（A 另需桩/faux 钉 `agent_before_settle` 的 `continue`/`context_edit` 路径——**若桩验证失败即按裁决退 C 并如实记录**）。
6. **T6 pause_turn 呈现**（loopback：`message_delta{stop_reason:"pause_turn"}`）→ 行 + outcome 语义。
7. **T7 正交性回归**：服务端工具开启时 `real-adapter.ts:1013-1017` 断言不触发、`noTools:"builtin"` 既有用例全绿；未配置时**全链行为逐字不变**（既有全量用例即回归网）。
8. **T8 usage 缺省兜底**：网关不回传 `server_tool_use` → 以块计数兜底、诊断 `state:"from-blocks"`。
9. **live 探针脚本**（上线前检查，**由客户运行**）：新增 `test/pi-adapter/server-tools-probe.ts`（沿 `wire-probe.ts` 先例，`node` 直跑；**读仓库 `.env`**（`loadEnvFileInto`，`src/common/shared/env-file.ts:366`；只回报键名、绝不打印凭据值））。分项：① 逐工具一次性声明请求（web_search/web_fetch/code_execution 各自 200/4xx）；② **两轮复放**（§4.5-1，搜索后带剥离转录的第二轮）；③ `max_uses` 上限形状；④ `usage.server_tool_use` 计量回传；⑤ 可选长任务 pause_turn 观察。输出结构化摘要（**不含查询串/正文**，仅形状与计数），由 PM 转达。脚本本体在实施轮落地，**本轮不写**。
10. **基线纪律**：本机全量固定 2 红（检出目录名 `ans-cli` 断言、macOS `/var` 符号链接）为**基线非回归**；专项 `node --test 'test/pi-adapter/**/*.test.ts'`（带引号）。

## 六、（f）分期与归属

| 期 | 内容 | 归属 |
| --- | --- | --- |
| PI-S-0（本轮） | 提案（本文档）+ memo，**未实施/未测试** | 本角色 |
| PI-S-1 | `server-tools.ts`（配置/声明/observer 纯函数）+ 扩展四钩子中的前三个 + 启用行/诊断 + T1-T4/T7/T8 | **本角色**（`src/common/pi-adapter/`、`test/pi-adapter/`） |
| PI-S-2 | 4xx 剥离降级（A 桩验证后实施，否则 C）+ pause_turn 呈现 + T5/T6 | **本角色** |
| PI-S-3 | 探针脚本骨架 + 客户跑 live 检查 → 结论回填本文档 | **本角色**（脚本）+ **客户**（运行） |
| 建议（跨边界，PM 统筹） | ① 运行时核心：`RuntimeProviderOptions` 扩 `serverTools?` 契约字段（角色级授予，§3.1）；② 运行时核心：`ToolDisplayV1.target` 扩 kind（如需查询作为行目标）与 settled detail 字段（如桌面要显示计数）——均非 v1 必需；③ 编排：capabilities 链注入；④ **su 卡/工具描述**若需提示「会话可用服务端搜索」（含「结果为外部不可信内容」口径）属角色卡/核心文案；⑤ 桌面UI：**v1 零改动**（行形状复用）；可选行样式增强（图标/折叠）由桌面定；⑥ Claude/Codex 对齐（§2.6）由 PM 统筹 | 建议，不代拟 |

### 待客户裁定点（简明）

1. 默认开关（建议缺省**全关**）与是否要 v2 角色级授予；
2. 默认 `max_uses`（建议 1）与首批工具名单（建议先 `web_search` + `web_fetch`；`code_execution` 建议缓——治理面最特殊）；
3. 查询串是否进诊断（建议**不进**）；
4. 4xx 降级形态 A（需桩验证）或 C（本轮如实失败、次轮起剥离）——建议 A 成功即 A、否则 C；
5. 客户追加探针范围（web_fetch/code_execution/两轮复放/max_uses 上限/usage 回传）。

## 七、风险与诚实边界

- 本文档的 SDK 结论全部来自**已安装 dist 只读核实**（file:line 在位）；行为层面（网关对声明/剥离转录的接受度、块流形状）以**客户探针与实施轮 loopback 测试**为准——文中凡「未验证」处均已明标。
- PI-S-2 候选 A 依赖 SDK 边界机制（`agent_before_settle` + `context_edit`），**属本仓首次使用**——必须先以桩测试证明「失败消息置空 + continue 重发不新增用户消息」，不得未验证即上线。
- `provider_stream_event` 的逐事件触发带来固定小开销（§2.7 早退纪律），未启用时零注册/零开销。

---

# 实施记录（2026-10-16；PI-S-1 / PI-S-2（路径 C）/ PI-S-3；**已实施待验证**）

**批准依据**：客户 2026-10-16「按推荐批准，开始实施」（裁定全文见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-3 客户批准与实施派发」）。实施上下文＝Pi适配器角色。**零 git 提交；未发任何真实网关请求**（live 探针由客户在验证阶段运行，见文末清单）。

## 批准口径的逐条落实

| 批准口径 | 落实 |
| --- | --- |
| ① 默认关 + env `ANS_PI_SERVER_TOOLS`（id 列表；缺省 max_uses=1；未知 id 抛错） | `server-tools.ts` 的 `parseServerToolConfig`：未设置/空/`0\|off\|none` ＝关；未知 id / 非法 max_uses（非正整数）/ 重复 id ⇒ **bindRole 构造期抛错**（任何网络请求之前；与「缺 baseUrl 即抛」同口径）。格式 `id[:max_uses][,id2…]`。 |
| ② 首批工具集 ＝ web_search + web_fetch（code_execution 缓） | 注册表仅含 `web_search_20250305` / `web_fetch_20250910`（缺省 max_uses=1；web_search 形状与客户探针逐字对齐）。**code_execution 未列入**：配置它即报「未知 id」并给出可用清单；其 type 串（`code_execution_20250825`）仅出现在 live 探针脚本（探针声明专用、供解缓判据）。 |
| ③ 搜索查询串不进诊断落盘（usage 只进计数类） | 诊断事件仅 `server_tool.declare/call/usage/degraded/paused/unknown_stop_reason`，字段全落在共享诊断白名单内（count/state/toolName/toolCallId/turnId/errorCode/reasonCode/ok）。查询串/结果标题/URL 只进**聊天流行**（经既有显示 profile 净化，URL query 被剥）。loopback 用例对诊断落盘文做查询串/标题/加密诱饵三断言。 |
| ④ 网关 4xx/不认声明 ⇒ 如实失败、不毁轮次（V1 路径 C，不自动剥离重试） | `message_end{stopReason:"error"}` ∧ 本请求含声明 ∧ 错误前缀给出拒绝状态 ⇒ 会话级 `suppressed`（后续请求不再附带声明）＋ 如实行 ＋ `server_tool.degraded{errorCode:"GATEWAY_REJECTED_HTTP_<status>",state:"suppressed"}`。**不改轮次失败语义**（既有 lifecycle 照常收尾）；**未注册** `agent_before_settle`（路径 A 未实施——「剥离重试后置」）。 |
| ⑤ 行映射复用既有工具行/显示 profile | 观测命令 → `projectToolEvent` 的 `native-start`（`input:{rule:"none"}`）/ `native-result`（`result:{ok,message}`），与客户端工具行同一形状/净化/预算/回放路径；无 projector 时走既有 legacy emit。**桌面 v1 零改动**。 |

## 与提案的差异（实现轮核实修正，如实登记）

1. **§4.2 探测通道修正（关键）**：扩展事件 `after_provider_response` **只在 2xx 后回调**——非 2xx 时 Anthropic SDK 在 fetch 层直接 `throw`（其 client.js「`!response.ok` ⇒ `throw makeStatusError(...)`」；`asResponse()` reject），故该事件**看不到 4xx/5xx**（已安装 dist 只读核实，并经 loopback 400 用例实证）。实现改为：从 SDK 错误消息**前缀**取状态（`APIError.makeMessage` ＝ `` `${status} ${body}` ``；只取数字前缀、**不读正文**）——`requestRejectionStatus`：`>=400` 且排除 `408/429`（与声明无关的瞬时态）⇒ 降级。**未注册 `after_provider_response`**（死通道不留）。副作用：覆盖 5xx（历史「不认声明」案例 `tool_removal` 曾以 **500** 被整段拒绝——该形状也在降级面内）。
2. 提案 §1.6 列的第 4 个 handler（`agent_before_settle` 剥离重试，候选 A）**未实施**（批准口径 ④ 已裁定 V1 走路径 C）。
3. `code_execution` 缓（见口径 ②）。

## 落点（全部在本角色 boundary.yaml Section 1 内）

- **新** `src/common/pi-adapter/server-tools.ts`（不 import Pi；纯函数 + 状态机）：注册表、配置解析、`appendServerToolDeclarations`（幂等、尾部追加、返回新对象）、`createServerToolObserver`（原始 SSE 事件 → 观测命令；`server_tool_use`/`*_tool_result` 两形状容忍；usage 两来源 `from-usage`/`from-blocks`）、启用/降级/pause 文案、`requestRejectionStatus`。
- `src/common/pi-adapter/real-adapter.ts`：扩展内注册**三个** handler（`before_provider_request` 声明注入 / `provider_stream_event` 观测→行+诊断 / `message_end` 降级判定）——**未启用时零注册、零开销、行为逐字与旧版一致**；`bindRole` 解析配置（抛错面）＋启用行（log.stage + 聊天流 + `server_tool.declare`）＋向扩展传 `serverTools`。**未动**：`src/provider/pi/session.ts` 契约、`settings.ts`、`timeout.ts`、`lifecycle.ts`。
- **新** `test/pi-adapter/server-tools.test.ts`（**24 用例**：T1 配置解析 5 + 追加/幂等 3 + 文案 1 + `requestRejectionStatus` 1 + observer 状态机 7 + 桩件扩展面 7）。
- **新** `test/pi-adapter/server-tools-wire.test.ts`（**8 用例**：bindRole 构造期未知 id 抛错 + T2 wire 级（离线捕获真实 params）+ T3-T8 loopback（127.0.0.1，无外网））。
- **新** `test/pi-adapter/server-tools-probe.ts`（live 探针，**由客户运行**；读仓库 `.env`（`loadEnvFileInto`）**只打印键名**；输出结构化摘要**不含查询串/正文**）。

## 测试证据（本角色执行）

- `node --test 'test/pi-adapter/**/*.test.ts'` → **264 / 264 绿**（基线 232 + 新增 24 + 8；263 口径连跑 4 次全绿 + 264 终态全绿）。如实登记：其中一次连跑出现 `injected-runtime.test.ts` 的 250ms 限时用例**负载性红**（单跑 14/14 绿、其余复跑全绿）——既有负载敏感用例，非本项引入。
- `npm run typecheck` → **全仓 0 错误**。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **1723 计 / 1722 过 / 0 红 / 1 跳**（0 新红；本次实测 0 红，好于记录的「2 红基线」口径——如实登记实测值）。
- 关键行为证据（loopback）：请求体**实捕获**——声明在 `tools` 尾部、无 `tool_removal`/`tool_addition`（T2+T3）；恰一对 start/result 行且 URL query 被显示 profile 剥除（T3）；**加密诱饵**在事件流与诊断双缺席（T3）；max_uses_exceeded → denied 行、轮次不判失败（T4）；400 ⇒ 请求 1 含声明→本轮 settled `failed`（既有口径）＋降级行恰一次＋**此后（含第 2 轮）请求不再附带声明**且第 2 轮正常完成（T5）；pause_turn 如实行（T6）；未配置 ⇒ 请求体零声明、零 `server_tool.*` 诊断（T7）；usage 缺省兜底 `from-blocks`（T8）。

## 未验边界（如实；以客户探针与真机为准）

**【2026-10-16 第一批验证结果已归档**：客户本机实跑探针（G-3 验证阶段），全文与分析见 `docs/fix/2026-10-16_probe_server-side-tools-live-results.md`。要点：`web_search_20250305` ✅ 网关真实执行（usage 计量 1–3 次/轮）；`web_fetch_20250910` ✗ 500 unknown variant（**本网关只应启用 web_search**；网关仅支持 web_search_20250305/20260209）；`code_execution` ✗ 维持缓；两轮复放 round2 的 500＝**探针构造产物**（探针文本捕获偏差 + 未按 pi-ai 语义省略空消息；真实链路 `convertMessages` 对空内容助手消息整条跳过，见 anthropic-messages.js:1145-1146），网关对剥离转录的接受度**待探针修复后补验**；`max_uses` 实测**未见强制**；`pause_turn` 未见。**】

1. ~~**web_fetch 的网关支持与结果块形状**~~ → **已结清（本网关）**：500 unknown variant，本网关不支持；配置指引＝只启用 web_search。observer 两形状容忍已在 loopback 分别钉住（形状本身仍以支持的网关为准）。
2. **两轮复放**：剥离转录（pi-ai 归一化层不回放服务端块）的第二轮是否被网关接受——探针 §② 第一批结果 round2 被 500 拒，经评估＝**探针构造产物**（探针脚本两处构造偏差；真实链路对空内容助手消息整条省略、不会发送空串消息——dist `anthropic-messages.js:1145-1146`）；**待探针修复后客户补跑定论**（补验亦覆盖「相邻 user 消息」残留用例）。评估全文见证据文件 §三；方案 P 维持**未启动**（条件性评估已列）。
3. **code_execution** 声明与块形状——探针 §① 第一批结果：500 unknown variant ⇒ **维持「缓」不解缓**（批准口径 ② 维持）。
4. **真机行样式观感**：桌面 v1 零改动、行形状/净化复用既有口径；可选样式增强（图标/折叠）由桌面定（见「跨边界建议」）。
5. **降级判据的误判面（登记引理）**：`requestRejectionStatus` 只按「`>=400 排除 408/429`」判——5xx 若为纯瞬时故障也会触发会话级停用（措辞为「疑似」，后果有界：仅停用声明 + 如实行；宁可漏用、不误伤轮次）。缓存预热与真实请求并发交错时 `requestHadDeclarations` 的极窄归属窗口同理（宁可漏降级、不误降级）。
6. **max_uses 上限**：探针首批结果——声明 `max_uses:1` 后仍见 2–3 次搜索、未见上限类错误码 ⇒ 如实记「**本网关上限未见强制**」：`max_uses` 声明不构成成本护栏，按次计费以 `usage.server_tool_use` 计量透出为准；「超限后继续交谈是否被持续优雅拒绝」一问随之**不适用**（无强制即无该态）。

## live 探针清单（客户在验证阶段运行；仓库根目录 `node test/pi-adapter/server-tools-probe.ts`）

**【状态：第一批已由客户实跑（2026-10-16）——结果与分析归档于 `docs/fix/2026-10-16_probe_server-side-tools-live-results.md`；§② 待探针修复（本轮已登记两处构造偏差）后补跑定论。】**

- ① 逐工具一次性声明请求：web_search / web_fetch / code_execution（探针声明专用）→ 各自 200/4xx 与块形状（`server_tool_use(...)`、`*_tool_result[n]`、错误码）；
- ② 两轮复放：搜索一轮 → 以「只含 text 块」的剥离转录发第二轮 → 网关是否接受（判据：`verdict` 字段）；
- ③ max_uses=1 连搜两次 → 观察 `max_uses_exceeded` 类错误码形状；
- ④ `usage.server_tool_use` 计量回传（逐请求数字）；
- ⑤ 观察项：`pause_turn` / 异常 stop_reason（见到即报，未见如实记「未见」）。
- 输出为结构化摘要（**不含查询串/正文**，含状态/形状/计数），可整段转交 PM。

## 跨边界建议（只列不代拟）

1. **桌面UI**：v1 零改动（行形状复用既有工具行/折叠口径）。可选增强：服务端工具行图标/「服务端」徽标、结果行折叠——由桌面UI 决定；如要「查询作为行目标」需运行时核心扩 `ToolDisplayV1.target` kind（非 v1 必需）。
2. **运行时核心**：若客户要 v2 的**角色级授予**，需扩 `RuntimeProviderOptions.serverTools?` 契约字段 + capabilities 链（提案 §3.1，PM 统筹）。
3. **编排/角色卡**：启用行已含「外部不可信内容」提示（§3.2 口径）；若需向 su/角色卡再提示「会话可用服务端搜索」，属角色卡/核心文案，本角色不代拟。
4. **PM 统筹**：Claude/Codex 两路径的呈现与治理口径对齐（§2.6 的本表即跨平台参考接口）。
