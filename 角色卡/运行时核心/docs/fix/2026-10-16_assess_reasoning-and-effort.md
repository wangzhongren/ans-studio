---
id: reasoning-and-effort-assessment
type: fix
title: G-5 推理与推理强度——三平台技术评估（产品设计输入·PM 评审依据）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: assessment-only
related: [pi-server-side-tools-live-probe-results]
---

# G-5「支持推理、支持推理强度」——运行时核心跨平台技术评估

**状态：评估轮——未实施、未测试。** 本轮只写评估文档：**零代码改动、零 git 提交、未运行任何真实网关请求**。行号基于**工作树**（HEAD `57a4a61` 起，`src/provider/claude/session.ts`、`src/provider/codex/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`src/common/codex-adapter/*`、`src/service/runtime/session.ts` 等在 `git status` 中为 M，本文行号以工作树实际内容逐处 `sed`/`Read` 复核；未触碰任何在飞文件，`test/测试/**` 未触碰）。

本轮除静态核实外，做了两项**本机离线只读探证**（pin 依赖的包产物自证，无任何网络出口，见 §十）：① pinned codex 0.162.1 的 `app-server generate-ts` 协议 schema 生成（输出在 `/tmp`，未入仓）；② pinned codex 二进制 `debug models`（内置目录 dump）与一次性 `initialize + config/read` 本地 stdio 回环（空 `CODEX_HOME`、无凭据）。凡静态不可判定处一律标「**待探针**」并给探针方案（§七）；探针方案沿 G-3 先例分「loopback 可离线决」与「需客户真网关」两列。

## 结论（先列）

| 平台 | 请求推理（现状→机制） | 推理强度（机制与值域） | 输出面 thinking 事件与当前归属 | 网关待验 |
| --- | --- | --- | --- | --- |
| **Claude** | 现状**零配置**；SDK 顶层选项 `thinking`（`adaptive`/`enabled+budgetTokens`/`disabled`）与 `effort`（`low…max`）现成，`queryOptions` 顶层直接可加，与 `strictMcpConfig`/`tools:[]`/hooks/`canUseTool` **正交、无交互** | `Options.effort: EffortLevel`＝`low\|medium\|high\|xhigh\|max`；`thinking.display` 控制返回原文/仅签名；settings 层另有 `effortLevel`（持久、无 `max`）/`maxEffortLevel`（钳制顶） | thinking 块随 `SDKAssistantMessage.message.content` 到达消息泵（`sdk.d.ts:3631-3635`），**在 `src/provider/claude/session.ts:361` 被静默丢弃**（content 循环只认 `text`/`tool_use`） | thinking/effort 字段在第三方 anthropic-messages 网关的接受性、未知模型是否静默降级＝**待探针**（§七 B1/B2） |
| **Codex** | 现状零配置；0.162.1 **确有** `model_reasoning_effort`（config.toml 键，协议 `v2/Config.ts` 逐字），另有 plan 专用键与 `model_reasoning_summary`；per-turn `turn/start.effort` 亦存在 | **协议面 `ReasoningEffort = string`（无封闭枚举）**；内置模型目录逐模型给支持集（本机离线 dump：`low/medium/high/xhigh/max/ultra` 子集，缺省 `low`/`medium`）；config 层**不做值校验**（本机探证：任意串原样回读） | app-server **有完整 reasoning 事件面**：`item/reasoning/textDelta`、`summaryTextDelta`、`summaryPartAdded`＋`item/…` 的 `{type:"reasoning", summary[], content[]}`（0.162.1 schema 逐字）；**当前适配器只订阅 `item/completed` 且无 reasoning 分支 → 静默忽略**（`src/provider/codex/session.ts:537-569`） | 网关是否接受 `reasoning.effort` 并回 reasoning items/summary；无效值拒绝形态＝**待探针**（§七 B3） |
| **Pi** | 现状**已隐式请求推理**：会话缺省 thinkingLevel=`medium`，经预算路径每轮发 `thinking:{type:"enabled", budget_tokens:8192}`（客户 G-3 探针实测响应已含 thinking 块） | 会话级 `ThinkingLevel`＝`off\|minimal\|low\|medium\|high\|xhigh\|max`（pi-agent-core 逐字），`AgentSession.setThinkingLevel()` 公开可调；预算映射 1024/2048/8192/16384（xhigh/max 钳到 high） | thinking 块在 `AssistantMessage.content` 中（`ThinkingContent`），**在 `src/common/pi-adapter/real-adapter.ts:796-810 extractMessageText` 只收 `type==="text"` 被丢弃**（`message_end` 于 `:671-676`） | 预算形态已被 G-3 实证可用；adaptive 形态（`forceAdaptiveThinking:true` 方向）＝**待探针**（§七 B1/B4） |

**建议中立字段（形状与落点，§五）：**

```ts
// src/model/runtime.ts —— RuntimeProviderOptions 增一可选字段
export type ReasoningEffortV1 = "off" | "low" | "medium" | "high" | "xhigh";
reasoningEffort?: ReasoningEffortV1;   // 未设（undefined）＝逐字现状
```

Service 在 `providerFor`（`src/service/runtime/session.ts:97-140`）读取 per-runtime env（`ANS_CLAUDE_REASONING_EFFORT` / `ANS_CODEX_REASONING_EFFORT` / `ANS_PI_REASONING_EFFORT`，沿 `ANS_PI_*`/`ANS_CODEX_MODEL`/`ANS_CLAUDE_MODEL` 先例；同时进 `runtime-settings.ts` 注册表以复用桌面设置面板与 `.env` 写入链），归一为中立值后注入；适配器**纯消费**（沿 `installedMcpServers` 先例）；未设＝三平台各自零行为变化。

## 一、任务与基线

- 客户提出 G-5「需要支持推理，需要支持推理强度」；PM 现状核：Pi 响应已有 thinking 块（G-3 探针）但不呈现；Claude `queryOptions` 零 thinking 配置；Codex 无 `model_reasoning_effort` 面；设置面（`src/common/shared/runtime-settings.ts`）无推理强度字段。
- 本仓逐项复核（全静态 grep ＋ 通读）：`src/` 内 `maxThinkingTokens|thinking|effort` 除注释与 Pi `server-tools.ts` 观测说明外**零命中**——三平台确无推理/强度配置面；Pi 的「隐式请求推理」不是显式配置而是 SDK 缺省行为（§四）。
- 与本角色关系：`src/model/runtime.ts`（中立类型）、`src/service/runtime/session.ts`（Provider 注入）、`src/common/shared/runtime-settings.ts`（设置注册表）属本角色写权面；三平台适配器属各自角色——本文只读定位，实施改动归各属主。
- 版本基线（`package.json:27-32`）：`@anthropic-ai/claude-agent-sdk` 0.3.299（随包 CLI 2.1.299，`node_modules/@anthropic-ai/claude-agent-sdk/manifest.json`）；`@openai/codex` 0.162.1；`@earendil-works/pi-coding-agent|pi-ai|pi-agent-core` 1.1.0。

## 二、Claude 路径

### 2.1 SDK 思考/强度支持面（静态实证，`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`）

`query()` 的 `Options`（`sdk.d.ts:1527` 起）顶层三个相关键：

- `thinking?: ThinkingConfig`（`:1901-1912`）；`ThinkingConfig = ThinkingAdaptive | ThinkingEnabled | ThinkingDisabled`（`:9831-9852`）：
  - `{ type: 'adaptive', display?: 'summarized'|'omitted' }`——「Claude decides when and how much to think (Opus 4.6+)」**且「This is the default for models that support it」**（`:1903-1905`）；
  - `{ type: 'enabled', budgetTokens?: number, display? }`——老模型固定预算；
  - `{ type: 'disabled' }`——关闭扩展思考。
  - 三形态对 `maxThinkingTokens`（`:1921-1928`，deprecated；Opus 4.6 上退化为 on/off）**有优先级**。
- `effort?: EffortLevel`（`:1914-1919`）——「Controls how much effort Claude puts into its response. Works with adaptive thinking to guide thinking depth」；`EffortLevel = 'low'|'medium'|'high'|'xhigh'|'max'`（`:692`）。
- 运行中控面：`query.setMaxThinkingTokens(maxThinkingTokens, thinkingDisplay?)`（`:2944`，display 可 `summarized|omitted|highlights`）；`applyFlagSettings({ effortLevel })`（`:2956-2973`，`'max'` 仅会话级、不写 settings 文件、不越组织上限）。
- 模型能力位（可先查询再决定）：`supportsEffort` / `supportedEffortLevels`（`low…max` 子集）/ `supportsAdaptiveThinking`（`:1415-1424`）。
- settings 层（`sdk.d.ts:9075-9085`）：`alwaysThinkingEnabled`（缺省 true＝支持模型自动开思考）、`effortLevel`（持久；不含 `max`）、`maxEffortLevel`（钳制顶；`CLAUDE_CODE_EXTRA_BODY` 供的 effort 不被钳）、以及 `showThinkingSummaries`（`:9264-9266`，请求 API 侧思考摘要并进对话/转录视图）。
- 钩子面旁证：hook 输入带当轮 `effort`（`:193-197`，含静默降级后的实际值；同时以 `CLAUDE_EFFORT` 环境变量暴露给 hook 命令）。
- 用量面：`ModelUsage.thinkingTokens`「已计入 outputTokens」（`:1444-1449`）——计费与呈现的如实口径现成。

### 2.2 与本仓 `queryOptions` 及 hook 泵的交互

现有 `queryOptions`（`src/provider/claude/session.ts:291-352`）：`tools:[]`（或 WebSearch 能力位）、`allowedTools` 白名单、`settingSources:[]`、`strictMcpConfig:true`、`skills:[]`、`plugins:[]`、`settings:{disableAllHooks:true}`、`mcpServers`、`canUseTool` deny-all、`hooks:{UserPromptSubmit,PreToolUse}`。逐项核对：

- **无交互**：`thinking`/`effort` 是模型请求姿态；与 MCP 隔离面（`strictMcpConfig`/`settingSources`/`plugins`）、工具白名单、hook 泵（hook 只裁决工具调用与轮次归属）互不相干。hook 泵不消费消息内容（`:302-350` 只读 `prompt_id/tool_name/tool_input/mcp_server`），thinking 不动其任何判据。
- **注入点建议（三选一，推荐①）**：① `queryOptions` 顶层加 `thinking`/`effort`（单点、显式、与既有 `model` 注入同形，`:299`）；② `settings` 覆盖层加 `effortLevel`（`:296` 现为 `{disableAllHooks:true}`；`Options.settings` 即 flag-settings 层，`sdk.d.ts:2216-2232`）——可行但把会话姿态混进 settings 层，且 `max` 不可持久化；③ 环境变量（`CLAUDE_CODE_EFFORT_LEVEL`/`CLAUDE_CODE_EXTRA_BODY`）——**注意**：本适配器子进程 env 是白名单化构造（`:227-238`，仅 PATH/HOME/TMPDIR/…/`ANTHROPIC_API_KEY`/`CLAUDE_CONFIG_DIR`/`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` ＋ 可选 `ANTHROPIC_BASE_URL`），env 路必须同时扩白名单，不如①②干净。**推荐①**。
- **回读/如实面**：`get_settings` 报 `applied.effort`（「after env overrides, session state, org caps and model-support downgrades」，`sdk.d.ts:6062-6064`）——「声称的强度 vs 实际生效」有官方回读面，可用于诚实呈现（可选加固）。

### 2.3 请求面 vs 输出面（区分清楚）

- **请求面**：`thinking` 决定「要不要思考、以什么形态要（adaptive/预算/关闭）」；`effort` 在 adaptive 下决定思考深度。二者只影响**请求姿态**。
- **输出面**：thinking 输出块随 `SDKAssistantMessage.message.content` 到达（`sdk.d.ts:3631-3635`：BetaMessage 形状，「content blocks (text, thinking, tool_use, ...)」；另 `resumed_from_incomplete_thinking` 表明思考签名参与多轮拼接，`:3657`）。**输出块的有无不由选项开关直接决定**：模型支持 adaptive 且未显式 disabled 时，是否产出思考块由 API/模型自行决定（可能零思考）；`display:'omitted'` 时仍回签名块但正文被涂掉。因此「呈现面」不能假设每轮必有 thinking 块。
- 另有两条输出侧旁路：`SDKThinkingTokensMessage`（`type:'system', subtype:'thinking_tokens'`，`:6220-6234`）在 redacted 阶段给估算 token 进度（spinner 用途，非计费权威）；`includePartialMessages` 开启时 `SDKPartialAssistantMessage` 带流式增量（`:1866`，仓内未开）。
- **本仓当前落点**：消息泵（`src/provider/claude/session.ts:357-374`）对 assistant 的 content 逐块处理——`block.type === "text"` 发 message 行（`:362`）、`tool_use` 走 WebSearch/已装 MCP 分支（`:363-373`），**`thinking` / `redacted_thinking` 无任何分支 → 静默丢弃**（`:361` 循环体）。这是 Claude 侧呈现缺口的唯一丢弃点；补呈现＝在此加分支（产品定展示纪律，见 §六），无机制障碍。

### 2.4 第三方网关（anthropic-messages 兼容）＝待探针

网关侧无法静态判定。可给出的是**要探的 wire 面**（Anthropic Beta Messages 类型，`node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`）：

- `thinking?: BetaThinkingConfigParam`（`:1622`）＝`{type:'enabled', budget_tokens: number, display?}`（`:1598-1621`，「budget ≥1024 且**小于 `max_tokens`**」）｜`{type:'adaptive', display?}`（`:1572-1585`）｜`{type:'disabled'}`（`:1586`）；
- `output_config?: BetaOutputConfig`（`:1232-1236`）＝`{ effort?: 'low'|'medium'|'high'|'xhigh'|'max' | null, format?, task_budget? }`——**effort 的 wire 落点是 `output_config.effort`**（Claude Agent SDK 的 `effort` 选项由此字段承载，pi-ai 同构：`anthropic-messages.js:953`）。
- 未知模型行为：CLI 对能力表外模型可能**静默降级**（不发 effort 或不发 thinking）——「未验」而非「拒绝」；回读面见 2.2（`applied.effort`）。
- 探针参数形态与客户直跑形态见 §七 A1/A2/B1/B2。

## 三、Codex 路径

### 3.1 配置键与值域

- **键（静态实证＋本机离线探证）**：`model_reasoning_effort` 是 0.162.1 的一等 config.toml 键——协议面 `v2/Config.ts` 逐字：`model_reasoning_effort: ReasoningEffort | null`（config/read 回读面，与 `model_reasoning_summary: ReasoningSummary | null`、`model_verbosity` 并列）；二进制内嵌 ConfigToml 字段串还含 `plan_mode_reasoning_effort`（plan 模式专用）。相邻面：`TurnStartParams.effort?: ReasoningEffort | null`（per-turn 覆盖，「this turn and subsequent turns」）；`ThreadSettings.effort`；`Thread.reasoningEffort`（thread/started 通知携带；既有 P0 证据 `mcp-surface.raw.json` 中实测为 `None`——未设时 null）；`NewThreadModelDefaults.modelReasoningEffort`。
- **值域（分层，务必区分）**：
  1. **协议面不设枚举**：`ReasoningEffort.ts`（0.162.1 自生成 schema）＝`export type ReasoningEffort = string`——**协议与 config 层都不做白名单校验**（本机探证：`-c model_reasoning_effort=bogus` 后 `config/read` 原样回读 `"bogus"`，`--strict-config` 亦不拦）。
  2. **目录面是权威值集**：pinned 二进制内置模型目录（本机离线 `codex debug models` dump）逐模型给 `supported_reasoning_levels`。实测集：`low/medium/high/xhigh/max/ultra`（ultra＝「Maximum reasoning with automatic task delegation」）；`gpt-5.5` 只到 `xhigh`；缺省 `default_reasoning_level` 为 `low` 或 `medium`。**无 `minimal`/`none`**（目录可见模型）。
  3. **内部枚举**（二进制字符串 `core/src/session/reasoning_effort.rs` 邻域 blob）含 `minimal…max` 等更宽字母表——旧模型/历史值可能仍被内部接受，但**对目录内模型的有效集合以目录为准**；无效值行为（钳制 or 请求期报错）＝**待探针**（§七 A4）。
- 任务书候选 `minimal/low/medium/high/[xhigh]` 逐一落位：0.162.1 目录对该客户典型模型（gpt-5.x/6.x 系列）**均含 low/medium/high/xhigh**；`minimal` 不在目录集内；此外本版本还有 `max`/`ultra`（新模型）。故**中立 v1 建议不纳入 minimal/max/ultra**（§五）。

### 3.2 `-c` 注入面与环境叠加

- 注入形态现成：`nativeEngine` 以 `codex app-server --listen stdio:// --strict-config -c <override>…` 启动（`src/provider/codex/session.ts:117`），`configOverrides` 数组由 `safetyOverrides(...)`＋provider 定义＋`model_provider` 拼成（`:390`）。追加一条 `model_reasoning_effort="high"`（沿 `web_search="live"` 的 `JSON.stringify` 引号风格，`src/common/codex-adapter/config.ts:100`）即可。
- **叠加无冲突**：P0 探针铁律「连续两条 `-c` 同根键＝后者整体覆盖」只约束**根 map 键**（`mcp_servers={…}` 必须一条整编，`config.ts:101-104`）；`model_reasoning_effort` 是顶层标量键，独立一条安全。`--strict-config` 下该键为已识别字段，不触发 strict 拒绝。
- **回读面（可选加固）**：`effectiveConfig()`（`config.ts:110-121`）已读 `config/read` 的 features/sandbox/approval/web_search——可提取 `model_reasoning_effort` 做「请求值＝生效值」断言（fail-closed 风格现成）；但**注意本机探证：config 层不做值校验**，回读只能证明「值原样落进配置层」，不能证明「被模型/后端接受」——后者在请求期，属探针项。
- 备选注入口：per-turn `turn/start` 的 `effort` 参数（`session.ts:620` 的 params 可加）与线程级 `threadConfig`（`:500-501`）。建议**主用 `-c`**（会话级、与安全姿态同批、可回读），per-turn 面留作将来「逐轮强度」扩展。

### 3.3 app-server 事件面（reasoning/thinking 内容）

0.162.1 自生成 schema（本机离线 `generate-ts` 复现）逐字：

- 增量通知：`item/reasoning/textDelta`（`{threadId, turnId, itemId, delta, contentIndex}`）、`item/reasoning/summaryTextDelta`（…`summaryIndex`）、`item/reasoning/summaryPartAdded`（`{threadId, turnId, itemId, summaryIndex}`）。
- 完成态 item：`ThreadItem` 联合含 `{ "type": "reasoning", id: string, summary: Array<string>, content: Array<string> }`——经 `item/started`/`item/completed`（两者都带完整 `ThreadItem`）到达。
- 旁路：`rawResponseItem/completed`、`rawResponse/completed`；token 面 `thread/tokenUsage/updated` 带 `reasoningOutputTokens`（既有证据实测为 `0`）。
- 摘要开关：`model_reasoning_summary`（`ReasoningSummary`＝`auto|concise|detailed|none`）＋协议 `TurnStartParams.summary`——要让网关回摘要而不是空 reasoning item，可能需设此项（**待探针**）。
- **本仓当前归属**：通知订阅只处理 `mcpServer/startupStatus/updated`、`item/completed`（内嵌 `agentMessage/webSearch/mcpToolCall` 三分支＋越权 quarantine）、`turn/completed`、`error`（`session.ts:515-580`）。**`item/completed` 若为 `type:"reasoning"` 落不到任何分支（`:537-569`）——静默忽略；`item/reasoning/*` 增量通知从未被订阅**。呈现缺口＝两处订阅面各差一个分支，机制（同一通道、无新能力位）现成。

### 3.4 与 `safetyConfig`／白名单化批次的叠加

- `safetyConfig`（`config.ts:57-63`）管 features/sandbox/approval/web_search/projects；`model_reasoning_effort` 与之并列、互不覆盖。白名单化批次（G-4 V2 P2）的 `mcp_servers` 单条整编纪律不受影响（§3.2）。
- 线程级恰等校验（`enabledServers` 与 catalog 判等，`session.ts:408-414/581-597`）不涉及 effort 键，不用改。
- 唯一叠加风险：**值域校验缺位**——新增 `-c` 前应在本仓做白名单校验（用 §3.1 的目录值集作校验源；无效值在 providerFor 期抛错，沿「坏件即抛、不静默半开」先例），否则无效值要到请求期才可能炸（形态待探针）。

## 四、Pi 路径

### 4.1 thinking 支持实据（模型模板字段与会话/请求选项）

- **模板字段（本机离线读包实证）**：`anthropicProvider().getModels()[0]` ＝ `claude-fable-5`：`reasoning: true`；`thinkingLevelMap = { "off": null, "xhigh": "xhigh", "max": "max" }`（`null`＝该档不支持）；`maxTokens: 128000`；`compat.forceAdaptiveThinking: true`（另三项与 `real-adapter.ts:145-158` 注释逐字对上，注释系属主角色真机观测所写）。适配器克隆模型时**只覆写 id/baseUrl/provider/contextWindow/compat**（`real-adapter.ts:138-167`）——**`thinkingLevelMap` 原样保留**；`forceAdaptiveThinking` 被显式置 `false`（`:163`）。
- **会话选项**：`createAgentSession({ thinkingLevel?: ThinkingLevel })`（`pi-coding-agent/dist/core/sdk.d.ts:19-20`）；本仓未传该参数（`real-adapter.ts:1282-1295`）→ 走缺省解析：恢复态取会话记录，否则 settings 缺省，再否则 `DEFAULT_THINKING_LEVEL = "medium"`（`sdk.js:121-143`；`defaults.js:1`），最后按模型钳制（`sdk.js:143`）。
- **层级与值域**：`ThinkingLevel = "off"|"minimal"|"low"|"medium"|"high"|"xhigh"|"max"`（`pi-agent-core/dist/types.d.ts:300`）；pi-ai 侧 `ModelThinkingLevel = "off" | ThinkingLevel`、`ThinkingLevelMap`（`pi-ai/dist/types.d.ts:23-26`）。
- **可调面**：`AgentSession.setThinkingLevel(level)`（`agent-session.js:2052-2075`，同发 `thinking_level_changed` 事件），`get thinkingLevel`（同文件 `:1037` / d.ts `:398`）。
- 会话级传播链：state.thinkingLevel → agent-loop `config.reasoning`（`agent.js:307`，`"off"`⇒undefined）→ `streamFunction` 选项（`agent-loop.js:270-277`）→ `streamSimple`（默认 streamFunction，`agent-session.js:19/258` 实证其即使用 `streamSimple`）。

### 4.2 `forceAdaptiveThinking:false`（`real-adapter.ts:163`）的准确语义——**不是禁用推理**

`pi-ai/dist/api/anthropic-messages.js` `streamSimple` 三分支（`:713-746`）：

1. `options.reasoning` 缺省（thinkingLevel=off）→ `thinkingEnabled:false`（不发思考请求）；
2. `reasoning` 有值 **且 `compat.forceAdaptiveThinking === true`** → 走 adaptive：`thinking:{type:"adaptive"}`＋`output_config.effort=<档位映射>`（`:729-737`；映射函数 `:697-712`，模板 map 把 `xhigh/max` 直通、其余按 low/medium/high 归并）；
3. `reasoning` 有值 **且 flag 为 false（＝本仓现状）** → 走**预算路径**（`:739-746`）：`thinking:{type:"enabled", budget_tokens: N}`（渲染于 `:946-965`）。

⇒ 收窄为 `false` 的准确含义是「**不按 Anthropic 官方端点的 adaptive 能力声明伪造 adaptive 请求形态**，退回全兼容的预算形态」；**推理请求本身照发**（这正是 G-3 探针能看到 thinking 块的原因）。它不禁用推理、也不阻止调档；只是把 wire 形态从 adaptive 换成 budget。若要上 adaptive 形态（含 `output_config.effort`，与本仓 Claude 通道的 effort 同字段），＝把该 flag 翻回 true，**网关接受性未证**（探针 §七 B1/B4）；且它按模型 capability 声明全轮生效，属「请求格式变化」而非「强度开关」，实施时要警惕范围溢出。

### 4.3 请求路径逐段与当前实际值

- **档位→预算映射**（预算路径，`simple-options.js:44-62`）：`minimal 1024 / low 2048 / medium 8192 / high 16384`；`clampReasoning` 把 `xhigh/max` 归并到 `high`（16384）。
- **`max_tokens` 联动**（`:63-80` `adjustMaxTokensForThinking`）：`maxTokens = min(base + budget, model.maxTokens)`（base 已先经 `clampMaxTokensToContext`，`simple-options.js:5-10`）；随后 `thinkingBudgetTokens = min(budget, max(0, maxTokens - 1024))`（`anthropic-messages.js:745`）。注意渲染侧 `budget_tokens: options.thinkingBudgetTokens || 1024`（`:962`）——**预算算出 0 会回落到 1024**，在 `max_tokens` 被上下文钳到极小（F-9 的「钳到 1 token」场景）时，wire 会出现 `budget=1024 ≥ max_tokens=1` 的**非法组合**（API 规则：budget ≥1024 且 < max_tokens）。这是本轮静态推演出的**首要技术风险**（§八 R1；探针 A5 边界用例）。
- **当前实际值**：thinkingLevel 缺省 medium → 每轮发 `thinking:{type:"enabled", budget_tokens: min(8192, …)}`，且 `max_tokens` 被抬 `+8192`（上限仍是 `model.maxTokens=128000`）；非 adaptive 时另加 interleaved thinking beta 头（`anthropic-messages.js:844-847`：`model.reasoning && thinkingEnabled && interleavedThinking!==false && !forceAdaptiveThinking`）。**这与「未设＝逐字现状」口径直接相关：Pi 的现状就是「已开 reasoning（medium）」，G-5 在 Pi 上是「可见/可调」，不是「从零开」。**
- **`off` 的暗礁**：会话克隆模型的 `thinkingLevelMap.off` 为 `null` ⇒ `getSupportedThinkingLevels` 认为 `off` 不可用（`models.js:679-689`），`setThinkingLevel("off")` 会被 `clampThinkingLevel` **钳到 `minimal`**（`models.js:691-705`；`agent-session.js:2053-2055`）。即：不加处理地「选 off」，实际仍在请求 1024 预算的思考。要真正实现 off：把克隆时 `thinkingLevelMap.off` 从 `null` 改为 `undefined`（该档变可用）；此时 off → agent.js:307 走 undefined → `thinkingEnabled:false` → 渲染分支 `thinkingLevelMap.off !== null` 成立 → wire 出 `thinking:{type:"disabled"}`（`anthropic-messages.js:966-968`）。**归属 Pi适配器角色的实现注记**，本文只登记。

### 4.4 响应侧 thinking 块在本仓观测面的丢弃点

- thinking 块实际存在：`AssistantMessage.content: (TextContent | ThinkingContent | ToolCall)[]`；`ThinkingContent = { type:"thinking", thinking: string, thinkingSignature?: string, redacted?: boolean }`（`pi-ai/dist/types.d.ts:268-276/373-376`）；AssistantMessage 还带 `thinkingLevel`（pi 请求档位）与 `providerThinkingLevel`（provider 实际档位）（`:383-385`）——**呈现与「实际生效档位」的如实面现成**。
- **丢弃点（确切位置）**：消息链 `session.subscribe` → `wireSettledOnce`（`real-adapter.ts:456-459`）把 `message_end` 交给 `lifecycle.observe`（只读 `stopReason`，`lifecycle.ts:53-70`）＋适配器自己的 `pi.on("message_end")` 处理器（`:671-676`）→ `extractMessageText`（`:796-810`）**只收 `type==="text"` 的块**——`thinking` 块在此被静默跳过。与 G-3「白名单字段」的关系：G-3 的 server-tools 观测窗（`server-tools.ts`）只提取 title/url/error_code/count 等白名单字段、且 pi-ai 归一化层**保留** thinking 块（服务端工具块才被丢弃）；thinking 的丢弃**发生在本适配器的文本抽取**，不在归一化层——修呈现不用动 `(node_modules)` 任何字节。
- 流式面旁路：agent-loop 事件含 `thinking_start/thinking_delta/thinking_end`（`agent-loop.js:288-296`），适配器未订阅（现无用途，将来做「思考中」进度条可用）。
- 轮次语义注意（F-9 已登记）：thinking-only 截断消息在 replay 完全不可见——开启呈现时须同步复核 replayed transcript 语义，避免「有思考行但无正文」轮次的回放歧义。

## 五、配置注入面（建议形状与落点）

**中立字段**（本角色写权面，建议一期即定型）：

```ts
// src/model/runtime.ts:623-647 RuntimeProviderOptions 追加（纯可选项）
export type ReasoningEffortV1 = "off" | "low" | "medium" | "high" | "xhigh";
reasoningEffort?: ReasoningEffortV1;
```

- **值域取舍**：取三平台**交集可用集**——`low/medium/high` 三平台原生档；`xhigh` Claude 原生、Codex 目录内、Pi 原生（预算钳到 high，但语义档位保留）；`off` Claude `thinking:{disabled}`、Pi 原生（需 §4.3 的 off 收窄）、Codex **无 off 档**（建议语义＝不注入该键并如实说明，或产品裁定 Codex 最小档为 low）。**不纳入** `minimal`（Claude effort 无此档；Codex 目录无；仅 Pi 有）、`max`/`ultra`（Claude `max` 仅 settings 会话级且各平台语义分歧大）——需要时二期扩值域，扩展点唯一。
- **来源与落点（Service 读取，沿现成先例）**：
  - 注册表：`src/common/shared/runtime-settings.ts:21-47` 各 runtime 增一字段（如 `ANS_CLAUDE_REASONING_EFFORT` / `ANS_CODEX_REASONING_EFFORT` / `ANS_PI_REASONING_EFFORT`，required:false）——桌面设置面板与 `.env` 写入链（`app/desktop/runtime-config.ts:48-135`；`src/common/shared/env-file.ts`）**零新增机制**自动生效。
  - Service：`providerFor`（`src/service/runtime/session.ts:97-140`）自 env 读取、白名单校验（非法值**抛错**，沿 `webSearchEnabled` 的 fail-closed 先例而非静默）并归一为 `ReasoningEffortV1`，经 `providerOptions`（`:120-130`）注入；适配器纯消费（沿 `installedMcpServers` 的「Service 读取、适配器纯消费」先例，`src/model/runtime.ts:641-646`）。
- **未设＝逐字现状（硬口径）**：`undefined` 时三平台各自字节级不变——Claude 不在 `queryOptions` 增任何键；Codex 不增任何 `-c`；Pi **不调用** `setThinkingLevel`（现状＝medium 隐式路径原样保留，因「现状即已开推理」，见 §4.3）。
- **每平台映射（建议定稿）**：

| 中立值 | Claude | Codex | Pi |
| --- | --- | --- | --- |
| `off` | `thinking: { type: 'disabled' }` | 不支持——不注入＋如实一行（或产品裁 low） | `setThinkingLevel("off")`（**前置**把 `thinkingLevelMap.off` 收窄为 undefined） |
| `low/medium/high/xhigh` | `effort: '<值>'`（thinking 缺省＝支持模型 adaptive） | `-c model_reasoning_effort="<值>"` | `setThinkingLevel("<值>")`（预算 2048/8192/16384/16384） |

## 六、呈现面事实（供产品/桌面 UI）

事实底三层：

1. **事件可达性**（三平台都有现成事件源；均不进工具行，只可能进消息面/进度面）：
   - Claude：`SDKAssistantMessage.message.content` 的 `thinking`/`redacted_thinking` 块（`:3631-3635`）＋可选 `thinking_tokens` 进度帧（`:6220-6234`）。丢弃点：`src/provider/claude/session.ts:361`。补呈现＝加分支。
   - Codex：`item/reasoning/textDelta`＋`summaryTextDelta`＋`summaryPartAdded`（增量）与 `item/…` 的 `{type:"reasoning", summary[], content[]}`（完成态）；丢弃点：`src/provider/codex/session.ts:537-569`（无分支）＋未订阅的三个增量方法（`:515` 订阅处）。补呈现＝两处订阅分支。增量 vs 完成态需产品二选一（建议完成态先行，增量做「思考中」条）。
   - Pi：`ThinkingContent` 块（含 `redacted`/签名）就在 `message_end` 的消息对象里；丢弃点 `real-adapter.ts:806`。另有 `thinking_start/delta/end` 流事件未订阅。
2. **现有承载面**：`SessionEvent.kind` 是冻结五元组 `tool_call|denied|accepted|message|settled`（`src/model/runtime.ts:15-20`）——thinking 内容只能走 `kind:"message"`（先例：压缩通知、收尾补发、MCP 降级行都用 message＋`detail.source` 标记）。工具行面（`tool_call/accepted/denied`＋投影器）**不适合**承载思考内容。回放面：message 行进 replay 的既有管道现成，但**冗余与预算**（`protectText` 16KiB 摘要面）须产品定裁。
3. **如实性事实**（呈现文案的事实约束）：
   - Claude：`display:'summarized'`（缺省）才有思考正文；`omitted` 时只有签名（无正文可呈现）；是否产出由模型定——**「本平台承诺有思考行」是失真表述**。实际生效档位可回读（`get_settings` 的 `applied.effort`，§2.2）。
   - Codex：reasoning item 的 `summary/content` 可能为空数组（摘要需 `model_reasoning_summary` 开关，网关支持待验）；`providerThinkingLevel` 无同类回读，但有 `thread.reasoningEffort` 与 `reasoningOutputTokens` 佐证。
   - Pi：`thinkingLevel`（请求）与 `providerThinkingLevel`（实际）双字段现成；G-3 已实证网关会回 thinking 正文。
   - 三平台 thinking 正文都可能包含敏感文本 → 呈现必须走既有脱敏管道（Claude `redact`/Codex `scrub`/Pi `projectToolEvent` 的 protectText 或等价 path），预算按 message 行既有口径。

## 七、探针清单

**A 列：loopback 可离线决**（本机假网关/假 SSE，零真实网关；沿 P0/G-3 先例：`test/claude-adapter/mcp-surface-loopback.probe.ts`、`test/codex-adapter/native-probe.mjs`、`test/pi-adapter/*.probe.ts` 的夹具与脚本形态；新增脚本属测试角色/各适配器角色批次）：

| # | 探针 | 断言/产出 |
| --- | --- | --- |
| A1 | Claude：loopback anthropic-messages 假网关＋pinned CLI/SDK，四组 queryOptions——(a) 零配置（b) `thinking:{enabled,budgetTokens:2048}`（c) `thinking:{adaptive}`（d) `effort:'low'` | 捕获请求体：`thinking`/`output_config`/`max_tokens` 精确形状与 beta 头；假 SSE 回 `thinking`＋`redacted_thinking`＋`text` 混合块，断言消息泵内容（复证 §2.3 丢弃点、为呈现分支定输入） |
| A2 | Claude：假网关对 `thinking`/`output_config` 未知字段回 400 | CLI 行为：剥离重试？硬失败文案？——定位「网关拒绝时的如实降级」要挂在哪个面 |
| A3 | Codex：假 Responses SSE 注入 `reasoning` output item（含 summary/content）＋summary 增量事件 | app-server 是否发 `item/reasoning/*` 与 `item/completed(type:"reasoning")`；帧形状逐字；再断言本仓适配器当前忽略且不误报（回归钉） |
| A4 | Codex：`-c model_reasoning_effort="high"` 全链（config/read 回读＋上游请求体捕获）；同跑 `"bogus"` | 请求体 `reasoning.effort` 落点与值；无效值的钳制/报错时机（config 层已证不拦） |
| A5 | Pi：faux 网关＋`session.setThinkingLevel` 全档（off/minimal/low/medium/high/xhigh/max）＋**极端 contextWindow 边界用例**（复现 F-9 钳制） | `thinking.budget_tokens`/`max_tokens`/beta 头逐档捕获；off→minimal 钳制复证；**`budget≥max_tokens` 非法组合**是否可达（§4.3 风险 R1） |
| A6 | Pi：faux 流回 thinking 块（含 redacted/签名） | message.content 内 thinking 存在性与 `extractMessageText` 丢弃复证；呈现分支输入形状 |

**B 列：需客户真网关**（客户直跑形态沿 G-3 先例＝本仓探针脚本读 `.env`、输出回贴；不发任何 live 请求的是本角色，客户跑）：

| # | 探针 | 直跑形态要点 |
| --- | --- | --- |
| B1 | anthropic-messages 网关上 `thinking`/`output_config` 接受面（**一并覆盖 Claude 通道与 Pi 的 adaptive 方向**）：六变体 `{无}`、`{thinking enabled 2048}`、`{thinking adaptive}`、`{output_config effort low}`、`{adaptive+effort high}`、`{display omitted}` | 单脚本对 `/v1/messages` 逐变体 POST：断言 HTTP 码、错误码与文案、响应块类型（`thinking`/`redacted_thinking`）、usage；并覆盖边界 `budget≥max_tokens` 的报错形态 |
| B2 | Claude 全链：`.env` 设 `ANS_CLAUDE_REASONING_EFFORT=low`（拟议键）跑一个角色轮 | 轮次 200/4xx 如实形态；CLI stderr 对未知字段的反应；thinking 块到达与否（本地丢弃不影响判定） |
| B3 | Responses 面推理强度：对 `/v1/responses` 以 `reasoning:{effort:"high"}`（另各一次 xhigh 与无效值）单发 | 200/拒绝形态；output items 是否含 `reasoning`/summary；再经 ANS Codex 链跑一轮对比 `reasoningOutputTokens` 与耗时事实 |
| B4 | （可选，产品定）Pi adaptive：B1 已覆盖同 wire；仅当产品要翻 `forceAdaptiveThinking` 时需额外一轮 `.env` 全链复证 | 同 B2 形态 |

## 八、分期与风险

**分期建议**：P0＝A 列探针（离线，先行）＋B 列按产品裁剪 → P1＝配置注入（三平台各属主；本文 §五为共同契约）→ P2＝呈现面（产品先定展示纪律：完成态/增量、摘要/正文、是否入 replay）→ 每期独立验证角色复闸，未设＝逐字现状的字节级回归钉住（三平台各自既有测试面）。

**风险清单**：

- **R1（最高，Pi）预算×上下文钳制**：思考预算把 `max_tokens` 抬高 `+budget`，而 `clampMaxTokensToContext` 按**配置窗口**（F-9 已知口径差）可钳到极小值；预算侧 `||1024` 回落会让 wire 出现 `budget_tokens(1024) ≥ max_tokens` 的**非法组合**（§4.3 静态推演，A5 探针定格）。缓解：注入时对「窗口余量 < 最小预算+1024」的会话**不发强度参数**（如实一行）或按 Pi适配器角色裁定收窄；需与 F-9-opt2 评估合批看。
- **R2（Claude）budget 与 max_tokens 的 API 硬约束**（`budget ≥1024 && budget < max_tokens`，`@anthropic-ai/sdk` beta types 逐字）：CLI 自带 max_tokens 管理，但在第三网关的行为未证（A1/A2）。
- **R3（计费）**：思考 token 计入 output（Claude `ModelUsage.thinkingTokens`「已计入 outputTokens」`:1444`；Codex `reasoningOutputTokens`；Pi usage 同层）——档位升高＝成本与耗时真实上升。设置面文案与产品提案应如实（Codex 二进制里就有「reasoning effort can quickly consume Plus plan rate limits」级提示可参照）。
- **R4（网关拒绝→如实降级）**：沿 server-tools 路径 C 先例——**不自动剥离重试**；拒绝＝轮次失败如实上抛＋一条类别化行；「未见即如实记未见」（G-3 归档纪律）。
- **R5（Codex 值校验缺位）**：config 层不拦任意串（本机探证）——白名单校验必须前置到本仓装配面，否则无效值错误延后到请求期且形态未知（A4）。
- **R6（Pi off 暗礁）**：不做 `thinkingLevelMap.off` 收窄时，"off" 实际=minimal 1024（§4.3）——虚假的「已关闭」比不提供更糟；归 Pi适配器角色实施注记。
- **R7（静默降级与声称）**：Claude 未知模型可能不发/降级 effort；Codex 网关可能忽略 effort——呈现与文案不得凭设置值声称「已生效」；优先用回读面（`applied.effort`、config/read、`providerThinkingLevel`）做实。
- **R8（脱敏与回放预算）**：thinking 正文进任何 ANS 面必须过既有脱敏/预算管道（三平台各异路径，§六.3）；回放语义（F-9 的 thinking-only 轮次）同步复核。
- **R9（逐字现状）**：未设路径的零变化必须可证（建议三平台各加字节级断言，沿 A-base 批同款口径）。

## 九、未决点

1. 产品：档位集合定裁（是否要 `minimal`/`max`；Codex `off` 语义；`ultra` 是否永远排除）；粒度（每运行时 or 每角色——现 env 先例是每运行时/每项目，每角色需扩 `providerFor` 读取键）。
2. 产品/桌面UI：呈现纪律（仅「思考中」进度 or 完成态正文；进不进 replay；摘要预算）。
3. Claude 网关：§2.4 全项（含未知模型 effort 是否发出）；CLI 400 行为（A2）。
4. Codex 网关：reasoning items/summary 回传面与无效值形态（A3/A4/B3）；`model_reasoning_summary` 是否随 v1 一并暴露。
5. Pi：adaptive 方向是否值得翻旗（B1/B4 结果裁决）；`off` 收窄方案归属 Pi适配器角色；预算路线与 F-9-opt2 的合并评估窗口。
6. 门禁/PM：设置面板文案的计费提示（R3）与「如实降级」话术的裁定。

## 十、证据清单（本轮核对，全部只读）

- **Claude SDK**：`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:193-197/692/1415-1424/1527/1866/1901-1928/2216-2232/2919-2944/2956-2973/3631-3659/5395/5553/6062-6064/6220-6234/9075-9085/9264-9266/9825-9852`；`manifest.json`（CLI 2.1.299）；Anthropic Beta 类型 `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts:1232-1236/1570-1622`。
- **Claude 仓库面**：`src/provider/claude/session.ts`（工作树全文；引用处 `:227-238/291-352/357-374`）。
- **Codex schema（本机离线 `app-server generate-ts` 于 /tmp，未入仓；pin＝0.162.1）**：`ReasoningEffort.ts`（＝string）、`v2/Config.ts`（`model_reasoning_effort`/`model_reasoning_summary`）、`v2/TurnStartParams.ts`（`effort`/`summary`）、`v2/ThreadSettings.ts`、`v2/Thread.ts`（`reasoningEffort`）、`v2/Model.ts`（`supportedReasoningEfforts`/`defaultReasoningEffort`）、`v2/ReasoningEffortOption.ts`、`v2/Reasoning{TextDelta,SummaryTextDelta,SummaryPartAdded}.ts`、`v2/ThreadItem.ts`（reasoning item）、`ServerNotification.ts`（三个 `item/reasoning/*` 方法名）；等价复现命令：`codex app-server generate-ts --out <dir>`（空 `CODEX_HOME`）。
- **Codex 本机离线探证（2026-10-16，无网络出口）**：`codex debug models`（内置目录：`low/medium/high/xhigh/max/ultra` 子集、缺省 low/medium）；`initialize＋config/read` 回环（`model_reasoning_effort` 任意串原样回读，`--strict-config` 不拦）；二进制 `strings`（`model_reasoning_effort`/`plan_mode_reasoning_effort`/`core/src/session/reasoning_effort.rs`）。
- **Codex 既有探针证据**：`角色卡/Codex适配器/docs/change/2026-10-16-mcp-surface-evidence/{mcp-surface.raw.json（thread/reasoningEffort=None、reasoningOutputTokens=0）, schema/…（0.162.1 生成的 ThreadItem/ServerNotification 摘录）}`；`…/2026-10-16-web-search-evidence/t3-key-matrix.raw.json`（spawn_agent 工具 schema 的 `reasoning_effort` 字段文案）。
- **Codex 仓库面**：`src/provider/codex/session.ts:117/385-397/500-511/515-580/620`；`src/common/codex-adapter/config.ts:26-63/96-121`。
- **Pi 包产物**：`pi-coding-agent/dist/core/{sdk.d.ts:19-20, sdk.js:121-143, defaults.js:1, agent-session.js:1037/2052-2075/2101-2114}`；`pi-agent-core/dist/{types.d.ts:300, agent.js:41/307, agent-loop.js:100-105/133-137/270-277/288-296}`；`pi-ai/dist/{types.d.ts:23-28/263-276/373-388/942, models.js:679-705, api/anthropic-messages.js:697-746/844-847/928-968, api/simple-options.js:5-80}`；`providers/anthropic.js:74`＋`providers/data/anthropic.json`（模板模型 `claude-fable-5`：`reasoning:true`、`thinkingLevelMap{off:null,xhigh,max}`——另经本机 node 读包自证）。
- **Pi 仓库面与 G-3 记录**：`src/common/pi-adapter/real-adapter.ts:138-167/456-465/671-676/796-810/1282-1295`；`角色卡/Pi适配器/docs/fix/2026-10-16_probe_server-side-tools-live-results.md:20-24`（客户实跑：响应 blocks 含 thinking）。
- **核心/服务面**：`src/model/runtime.ts:15-20/623-647`；`src/service/runtime/session.ts:97-140`；`src/common/shared/runtime-settings.ts:21-47`；`app/desktop/runtime-config.ts:1-135`；`src/common/shared/env-file.ts`（头注与接口）。

## 十一、对本次评估的自我限界

- 全部结论基于**静态代码/包产物/既有记录＋两项本机离线只读探证**（§十说明；均在 /tmp、无网络出口、未改任何文件）；未发任何真实网关请求。§二-§四凡标「待探针」处，在 P0/A 列探针前不得当作已证事实引用；B 列结论只能由客户真机产出。
- 行号以工作树为准并已逐处复核；在飞批次（V2 独立验证等）收敛后如行号漂移，以内容为准再核一次即可，结论不受影响。
- 本评估不替 PM/产品/门禁裁定：档位集合、`off` 语义、呈现纪律、计费提示文案、每角色粒度均为其上会材料项；`forceAdaptiveThinking` 翻旗与 `thinkingLevelMap.off` 收窄属 Pi适配器角色实施注记（本文只登记事实）。

（本文状态：**未实施 / 未测试**。如需推进 §八 分期，请 PM 按角色派发。）
