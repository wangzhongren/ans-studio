---
id: claude-web-search-integration-proposal
type: fix
title: Claude 路径联网搜索接入（G-3 / 服务端工具）——实施方案提案
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待验证
revision: 2
related: [claude-session]
events:
  - date: "2026-10-16"
    kind: created
    summary: 提案轮；只读调研 SDK/CLI 与网关证据，给出能力落点/客户探针口径/呈现与失败边界/测试计划；未实施未测试
  - date: "2026-10-16"
    kind: implemented
    summary: 客户批准后按本提案实施（能力位+PreToolUse 放行分支+消息泵）；32/32、typecheck 0、全量 0 新红、原生回环 probe 5/5 通过（含 hook 分发实证）；真网关 side-query 与桌面呈现待验，见实施记录
---

# Claude 路径联网搜索接入——实施方案提案

**状态：已实施待验证（2026-10-16，revision 2）。** 客户「按推荐批准，开始实施」（裁定见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-3 客户批准与实施派发」）后，已严格按本文 §2.3 落点实施：`ANS_CLAUDE_WEB_SEARCH` 能力位（默认关）、`tools/allowedTools`、PreToolUse WebSearch 放行分支（不注入 `updatedInput`）、消息泵 `native-start`/`native-result`（仅能力位开时）；**未做** §七 期 2 与任何待裁定项。实施摘要、实测事实与未验边界见[实施记录](2026-10-16_impl_web-search.md)（证据目录 [2026-10-16-web-search-evidence](2026-10-16-web-search-evidence/)）。**仍未验**：客户真网关 side-query 实测（§三.2 探针口径，客户自跑）；桌面端行样式/默认取值等待裁定。以下提案正文（revision 1）保持原文，作为批准实施规格存档。

**（提案轮存档）** 本文为**提案轮**产物：只读代码与只读依赖定位（含 bundled CLI 二进制字符串核对），**零代码改动、零测试改动、零 git 提交、不代跑探针**。文中一切「拟」「将」均为建议，未落地。

派发来源：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「候选 G-3」（:91-95）——客户要求「其他的平台都要接上搜索」，Pi 侧已探针实证其网关完整支持 Anthropic 服务端工具族声明；经 PM 评审与客户批准后实施。写作时 Pi 侧提案尚未落盘，本提案按同构要求自理；**定稿前`角色卡/Pi适配器/docs/fix/2026-10-16_proposal_server-side-tools.md` 与 `角色卡/Codex适配器/docs/fix/2026-10-16_proposal_web-search.md` 已同日落盘并完成只读核对**，三端机制差量与对齐点见 §六。

证据基线：SDK `@anthropic-ai/claude-agent-sdk@0.3.299` 及其 bundled CLI 2.1.299（darwin-arm64，`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`，sha256 `ba5ab7b8…`，见包内 manifest.json）；本仓行号以写作时工作树为准（与 HEAD `1f069c7` 的 claude 适配器相关路径无差异）。

## 一、结论（先说结果）

- **能力路径：可开**。Claude Agent SDK / bundled CLI 自带 `WebSearch` 内置工具；其搜索由 CLI 发出一次**同端点侧查询**，在请求里声明 Anthropic **服务端工具** `web_search_20250305`（`max_uses:8`、强制 `tool_choice`），由服务端真实执行并以 `server_tool_use`/`web_search_tool_result` 返回——这正是 Pi 已实证网关支持的同一 API 面。
- **开启方式正当且与 `--dangerously-skip-permissions` 无关**：`tools:["WebSearch"]`（可用性）+ 预放行（`allowedTools`/PreToolUse hook allow），ANS 的 `canUseTool` 拒一切兜底不变。
- **待探针**：客户网关对 Claude 侧 **side-query 形态**（强制 `tool_choice` + 服务端工具声明 + 无 beta 头）的端到端支持——§三.2 给出客户可自行运行的探针口径（不代跑）。
- 落点三处（全在本角色写权内，§二.3）：`queryOptions.tools/allowedTools`、PreToolUse hook 新增 WebSearch 放行分支、消息泵新增 WebSearch 工具事件（`native-start`/`native-result`）。

## 二、能力路径调研（file:line）

### 2.1 SDK / CLI 侧 WebSearch 的形态（只读事实）

- **`WebSearch` 是 SDK/CLI 的内置工具**，名字字面量即 `"WebSearch"`（CLI 常量 `Fp="WebSearch"`，偏移 ≈198,289,509；且在 `BUILTIN_TOOL_NAMES` 列表内，偏移 ≈222,882,870）。SDK 类型面：`WebSearchInput{query, allowed_domains?, blocked_domains?}`（`sdk-tools.d.ts:1122-1133`）、`WebSearchOutput{query, results[{tool_use_id, content[{title,url,snippet?}]}|string], durationSeconds, searchCount?}`（`sdk-tools.d.ts:3756-3798`）。
- **服务端工具才是执行体**。CLI 2.1.299 的 `WebSearch` 工具实现（嵌入 JS，偏移 ≈210,297,813）：
  1. 先过 CLI 内部**会话搜索预算**（默认每会话 200 次：`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION ?? 200`，偏移 ≈200,36x,xxx；每小时回补默认 0，`CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR`/服务端特性 `tengu_memoized_turtle` 可启，0–3600）。预算耗尽**不是错误**：返回正常 tool_result 文本「Web search was not performed: this … budget is used up (…)」（≈81,595,xxx 区域），并指引可调大 env、不得用 curl/wget/第三方代理绕过。
  2. 否则发**同端点侧查询**：同一 base URL/凭据；消息=单条 user「Perform a web search for the query: …」；system 一句「You run a web search for another Claude model…」；`tools:[]` + `extraToolSchemas:[{type:"web_search_20250305", name:"web_search", allowed_domains?, blocked_domains?, max_uses:8, search_profile?}]`；`toolChoice:{type:"tool",name:"web_search"}`；thinking 关闭、prompt caching 关闭；模型默认=主回路模型（内部 gate `tengu_plum_vx3` 才切替代模型，默认关）。
  3. 消费侧查询 SSE：`server_tool_use`（拿真实 query）与 `web_search_tool_result`（拿结果集）块；侧查询 API 错误归 `web-search-side-query-api-error`（≈81,596,940），截断文案「The search was cut off before any results arrived. Try again.」。
  4. 组装为模型可见 tool_result 文本：`Web search results for query: "…"` + `Links: …` + 「REMINDER: You MUST include the sources…markdown hyperlinks」（非 citations 模式；`CLAUDE_CODE_WEBSEARCH_CITATIONS` 开时改用 `search_result` 块，ANS 子环境白名单不转发，默认关）；结构化输出走 `tool_use_result`（`snippet` 只给 PostToolUse hooks，`tool_use_result` 不含）。
- **beta 头**：`web-search-2025-03-05`（常量 `$xr`，偏移 ≈195,369,463）**只在 `provider==="vertex"(受支持)||"foundry"` 时附加**（偏移 ≈196,517,866）——firstParty / 自定义 `ANTHROPIC_BASE_URL` 路由**不发**该 beta 头。
- **平台守卫**：仅 Foundry 有「Web search is not available on this Foundry deployment.」抛错分支（同一偏移区域）；桌面「网关登录模式」（`CLAUDE_CODE_USE_GATEWAY`）设置文本提示「may hide its WebSearch tool」，并明说 `false`（base-URL 路由）时**把网关当自定义 base URL 的 Anthropic API**（≈89784875 / ≈222722104）。ANS 走 API key + base URL 路由，且 childEnv 白名单不含 `CLAUDE_CODE_USE_GATEWAY`，结构上不受该模式影响。
- **进度**：CLI 内部有 `search_results_received/query_update` 进度载荷，但 SDK 面的 `SDKToolProgressMessage`（`sdk.d.ts:6235-6252`）只有 heartbeat 字段、无该载荷——**消费者拿不到实时“收到 N 条”**；UI 进度条标签映射为 `WebSearch→"Searching"`（≈220,637,405）。

### 2.2 本仓 claude 会话现状（与搜索相关的既有事实）

- **query options 构造**：`src/provider/claude/session.ts:224-231`——`tools: []`（清空全部内置工具）、`allowedTools: [...names]`（仅 `mcp__ans__*`）、`settingSources: []`、`strictMcpConfig: true`、`skills/plugins: []`、`settings:{disableAllHooks:true}`（只关设置文件 hooks；**SDK 回调 hooks 仍生效**，见 :232 与 native-loopback.probe 断言）、`extraArgs:{disable-slash-commands:null}`、`mcpServers:{ans}`、`env: childEnv`、`canUseTool: 一律 deny`（:231）。
- **childEnv**：`:163-174`——严格白名单（PATH/HOME/TMPDIR/TEMP/TMP/SystemRoot/WINDIR/LANG/LC_ALL）+ `ANTHROPIC_API_KEY`/`CLAUDE_CONFIG_DIR`/`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`；**base URL 覆盖已支持**：`options.baseUrl?.trim() || env.ANTHROPIC_BASE_URL?.trim()`，只接受无凭据的 http(s)（:168-174）。`CLAUDE_CODE_USE_BEDROCK` 等不转发（测试断言 `session.test.ts:115`）。环境在适配器构造时快照（:50），与 `ANS_CLAUDE_MODEL` 的读法一致（:230）。
- **PreToolUse 统一治理**：`:246-262`——只有名字在 `mcp__ans__*`、`mcp_server.name==="ans" && source==="sdk"`、且能绑定原始轮次（`prompt_id→nativeTurns`）的调用被 `allow` 并注入 `__ans_call_context`；**其余一律 `deny`**（:260-261，含 WebSearch）。该 hook 是 SDK 回调，先于权限判定执行，deny 短路 `allowedTools`。
- **消息泵只消费两类帧**：`:272-273`（assistant 只抽 `text` 块）、`:274-292`（result 判定 subtype/is_error/session_id）。`tool_use`/`tool_result` 块与 `user` 型消息**目前被忽略**——WebSearch 的呈现/审计需要新消费面（§四.1）。
- **工具事件契约已支持原生工具**：`RuntimeToolEventFactsV1` 的 `origin` 含 `native-start`/`native-result` 与 `native:{isError,content}` 形状（`src/model/runtime.ts:528-537`），Pi 适配器即以此发射（`src/common/pi-adapter/real-adapter.ts:518/544`）——Claude 侧不需要新契约即可发射同类事实。
- **配置通道**：运行时配置走 `.env`（桌面 `resolveRepoEnvPath()`＝库根 `.env`，打包＝userData `.env`，`app/desktop/pi-config.ts:69-80`）；保存为**合并写**，未知键不被面板保存抹掉（`src/common/shared/env-file.ts:301-325/390-405`）。`RUNTIME_SETTINGS` 里 claude 的字段由项目管理维护（`src/common/shared/runtime-settings.ts:3/39-46`）。

### 2.3 ANS 内按能力位开启的**确切落点**（全部在本角色写权内）

1. **开关（能力位）**：`ANS_CLAUDE_WEB_SEARCH`，在 `startEngine` 内从 env 快照读取（同 `ANS_CLAUDE_MODEL` 先例，`session.ts:230`）。取值口径建议：未设/`0`/`off`＝关（默认关，fail-closed、行为逐字不变）；`1`/`on`＝开。默认关是发布策略建议（探针通过后可一行翻默认开，属客户裁定，§七-①）。
2. **可用性**：`session.ts:226` `tools: webSearchEnabled ? ["WebSearch"] : []`（SDK 语义：`string[]` 指定内置工具集，`[]` 清空，`sdk.d.ts:1637-1649`）。
3. **预放行**：`allowedTools` 追加 `"WebSearch"`（`sdk.d.ts:1584-1590`「auto-allowed without prompting」）。是否保留此后备见 §七-②；无论留否，**hook 分支（下一项）是必需项**——hook deny 先于 `allowedTools` 判定（`sdk.d.ts:5588` 原文），不改 hook 则 WebSearch 必被今天的 deny 兜底拦死。
4. **PreToolUse 分支**：在 `:250` 的 ANS 分支之后、`:255` 的兜底之前加：`webSearchEnabled && hook.tool_name === "WebSearch" && !hook.mcp_server &&`（轮次与信号守卫同现有条件）→ 返回 `{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"allow"}}`。**不注入** `updatedInput`（保持模型原文输入不改写；注入 `__ans_call_context` 会污染 `WebSearchInput`）。未绑定轮次的 WebSearch 仍走 deny 兜底。
5. **消息泵新增 WebSearch 事件消费**（`:272-292`）：
   - assistant 帧 `tool_use` 块（`block.name==="WebSearch"`）→ 记 `tool_use_id → 轮次` 映射，`emitTool(callTurn, {origin:"native-start", phase:"start", toolName:"WebSearch", toolCallId:`${callTurn.id}:${block.id}`, input:{rule:"none", args:block.input}}, …)`（toolCallId 格式对齐 :201 的既有 `${turn}:${toolUseId}`）。
   - 新增 `message.type==="user"` 分支：扫 `tool_result` 块（`tool_use_id` 命中映射）→ `emitTool(… {origin:"native-result", phase:"result", native:{isError, content:[{type:"text"}|{type:"unsupported"}]}})`；`tool_use_result`（`SDKUserMessage.tool_use_result`，`sdk.d.ts:6351`，WebSearch 形状见 sdk-tools.d.ts:3756）可用于结果计数/审计（若做，§七-⑥）。
   - 现状守卫不变：帧只在 `active` 轮在途时归因（:271），abort 后丢弃（:90）。
6. **不做的事**：不动 `canUseTool`（保持 deny 兜底）；不动权限模式/`extraArgs`（不开任何 skip 或 bypass 口）；不转发预算 env（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`/`…REFILLS_PER_HOUR` 是否透传见 §七-④）；不重写 CLI 的 tool_result 文本（审计如实）。

## 三、网关兼容性（b）

### 3.1 结构判断

Claude 引擎经 `ANTHROPIC_BASE_URL` 指向客户现网关（同 Pi 的 anthropic-messages 兼容面）时，搜索的服务端执行发生在 **side-query 子请求**里——与 Pi 已实证的「服务端工具族声明」是**同一 API 面**（`/v1/messages` 的 tools 声明 `web_search_20250305`）。相对 Pi 探针已证部分的**增量差异**只有：

| 差异点 | 内容 | 现状 |
| --- | --- | --- |
| 强制 tool_choice | 侧查询带 `tool_choice:{type:"tool",name:"web_search"}` | 未实证（Pi 探针为自然调用） |
| 侧查询消息形态 | 单条 user + 内部 system + `tools:[]`、thinking 关 | 未实证（属常规 messages 形态） |
| `max_uses:8` | 服务端工具参数随声明下发 | Pi 已证 `max_uses`/`max_uses_exceeded` 优雅 |
| beta 头 | firstParty/base-URL 路由**不发** `web-search-2025-03-05` | 与 Pi 裸探针一致 |
| 块族与计量 | `server_tool_use`/`web_search_tool_result`/`usage.server_tool_use.web_search_requests` | Pi 已证网关完整支持 |

结论：**同理可用（高置信，待探针闭环）**。若网关在「强制 tool_choice + 服务端工具」组合上有缺口，失败是**逐次如实**的（侧查询 API 错误 → tool_result is_error → 轮次继续，§四.3），不会毁会话；兜底另有适配器侧自建搜索工具的大改方案（本文不展开，仅登记为备选）。

### 3.2 客户可自行运行的探针思路（不代跑；读客户配置、输出无秘密）

目的：用**客户真实网关 + 真实模型**验证 Claude side-query 形态端到端（Pi 裸 HTTP 声明探针不能替代它；两者互补）。本角色不代跑、不落脚本文件；口径如下：

- **配置来源**：读应用实际使用的 `.env`（开发＝库根；打包＝userData 路径；口径同 `resolveRepoEnvPath/resolveDesktopEnvPath`，`app/desktop/pi-config.ts:69-80`），取 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANS_CLAUDE_MODEL`。**只读取，不打印任何值**；输出中仅出现布尔、计数、HTTP 状态码与脱敏错误文本。
- **脚本形态**：独立目录一个 Node 脚本（不写入本仓、不经 ANS 代码），`import` 应用自带 `node_modules` 里的 `@anthropic-ai/claude-agent-sdk`；`query()` 单次 prompt（例如「搜索今天的日期，给出一个来源链接」），options 最小面：`cwd=空临时目录`、`tools:["WebSearch"]`、`allowedTools:["WebSearch"]`、`settingSources:[]`、`env` 只放 PATH/HOME/临时目录 + 上两项凭据、不注入任何 ANS hooks。
- **断言与输出（逐条打印布尔/行数即可）**：
  1. init 目录（`system/init`）的 `tools` 是否含 `"WebSearch"`；
  2. 流内是否出现 assistant `tool_use`（name=WebSearch）与随后的 `tool_result` 是否 `is_error=false`、文本是否含 `Web search results for query`（成功路径）或如实错误文本（失败路径）；
  3. `result` 帧 subtype 是否 success（证明「搜索失败/网关不认也不毁轮次」在真网关侧成立）；
  4. 请求计数与耗时；HTTP 4xx/5xx 出现时打印状态码与（脱敏后的）错误 message/type。
- **两种预期结论**：全绿＝网关支持 Claude 侧搜索形态，可进入实施/默认开评估；`tool_result.is_error=true` 但 `result.success`＝网关不认服务端工具声明/强制 tool_choice，如实降级已成立、搜索不可用（备选与处置按 §3.1 末与 §七 待裁定点）。
- **不得输出**：密钥、Authorization/x-api-key 头、完整请求体、完整 URL（网关地址脱敏为主机名亦可）、搜索结果全文（可给条数与前 1 条域名）。

## 四、呈现 / 审计 / 失败（c）

### 4.1 行样式目标（与 Pi 口径对齐）

- **事件口径**：搜索全程走**工具事件**通道（`tool_call`/`accepted`/`denied` + `detail.display`），toolName＝`"WebSearch"`，不走 assistant 文本行、不发额外 message 行。桌面聊天流按现有工具行渲染（开始一行、结果一行；轮末折叠沿用既有「本轮 N 个调用」机制）。与 Pi 侧对齐点＝「一行 start（含 query 目标）+ 一行 result（含结果/失败）」语义，具体措辞由桌面UI 定稿。
- **当前契约的限制（需要跨角色决定）**：`ToolDisplayV1.target` 只支持 `path|command` 两类（`src/model/runtime.ts:481`、投影器 `src/common/runtime-core/tool-display.ts:107/128`、`coreToolTarget:20-29`）——**query 无法作为 target 呈现**。两个选项：
  - **V1 最小（本提案默认）**：`input:{rule:"none", args:{query,…}}`——不新增契约；成功时 query 在 resultText（模型可见文本含 `Web search results for query: "…"`）与折叠详情里可见；被拒/失败调用**无 query 展示**。
  - **对齐增强（与 Pi 合流）**：运行核心给 `ToolDisplayInputRuleV1` 加 `core-query-v1`、`ToolDisplayV1.target` 加 `kind:'query'`（单一来源 `model/runtime.ts`，属主运行时核心），两个适配器同口径；桌面UI 定行文案（如「联网搜索：“query” → N 条结果」）。
  - 两选项不互斥；增强项登记为 §七-④ 待裁定，Claude 侧代码面在契约落地后仅改一条 `rule` 常量。
- **隐私**：结果 URL 经显示管线 `cleanPatterns` 去 query/hash（`tool-display.ts:38-41`）后呈现；工具事件 detail 走既有 redact 全链（`session.ts:53-59/91/105`），不新增旁路。

### 4.2 计量（usage）透出

- **ANS 现状不消费任何 usage/cost 帧**（消息泵只读 subtype/is_error/session_id）；本提案**不新增**计量面。
- 可如实说明的计量事实：侧查询的 token 与 `usage.server_tool_use.web_search_requests` 计量发生在**网关侧**（客户账单可见）；SDK 面的 `AgentOutput` 类型里该字段存在（`sdk-tools.d.ts:121-122`）但属子代理输出路径，主 result 帧未见该字段；适配器若需展示，可用 `tool_use_result.searchCount/durationSeconds` 做**逐次**呈现（§七-⑥，可选）；CLI 的实时进度载荷不经 SDK 暴露（§2.1 末条），V1 不做“搜索中收到 N 条”的假进度。

### 4.3 失败如实（不毁轮次）

| 情形 | 发生层 | ANS 可观测形态 | 处置 |
| --- | --- | --- | --- |
| 能力位关 / 轮次未绑定 | 本仓 hook | `deny`，tool_result is_error（既有文案） | 与今天一致（fail-closed） |
| 预算超限（默认 200/会话） | CLI | **正常** tool_result：「Web search was not performed: … budget is used up…」 | 如实结果行（accepted）；不加伪装、不代绕过 |
| 网关不认声明 / 侧查询 API 错误 | 网关→CLI | tool_result is_error（`web-search-side-query-api-error` 类） | 如实失败行（denied）+ 错误文本；**轮次继续** |
| 侧查询截断 | CLI | tool_result 文本「The search was cut off before any results arrived. Try again.」 | 如实结果行 |
| 零结果 | 服务端 | tool_result 含「No links found.」 | 如实结果行 |
| 模型绕行（curl/wget 等） | 模型行为 | 现有 `run_shell`/网络治理不变 | 不在本提案新增门；CLI 文案已明令禁止，风险登记 |

所有情形都只影响**该次工具调用**，不产生新的轮次失败语义（与 result 帧判定无耦合）。

## 五、测试计划（d）

先例：受控假 SDK 单测＝`test/claude-adapter/session.test.ts:34-86`（真实 MCP Client/Server，仅 query 为假）；受控假服务器＋**真实 bundled CLI** 回环＝`test/claude-adapter/native-loopback.probe.ts`（127.0.0.1 SSE 假 API、假凭据、45s 上限、0 外部调用）。

1. **单元（扩展 `fake()` 脚本支持合成帧序列）**：
   - 关（默认）回归：`config.tools deepEqual []`、allowedTools 不含 WebSearch、hook 对 WebSearch 仍 deny（新增显式用例，锚住今天行为）。
   - 开：`tools===["WebSearch"]`、allowedTools 含 WebSearch；hook：绑定轮次的 WebSearch→allow 且 `updatedInput` 缺省（**断言无 `__ans_call_context`**）；未绑定/延后轮次→deny；其他工具（Bash 等）仍 deny。
   - 消息泵：assistant `tool_use`＋user `tool_result` 帧 → 恰一条 `native-start`＋一条 `native-result`（toolCallId 配对、`ok=true`、resultText＝真实文本）；变体：is_error=true（denied）、预算文案（accepted）、非文本 content（unsupported 省略标记）。
2. **原生回环探针（新增 `test/claude-adapter/web-search-loopback.probe.ts`，形制沿 native-loopback）**：假服务器同时扮演主轮与**侧查询**（按请求体区分：`tools` 含 `web_search_20250305` 者回 `server_tool_use`＋`web_search_tool_result` SSE；主轮先回 WebSearch tool_use，后回收尾文本）。断言：
   - 侧查询请求形态：`type/name/allowed_domains/blocked_domains/max_uses:8`、强制 `tool_choice`、**无 `anthropic-beta: web-search-2025-03-05`**（base-URL 路由）；
   - ANS 事件流：native-start/native-result 各恰一、文本符合；init 目录含 WebSearch 与 `mcp__ans__*`；
   - **PreToolUse 是否对 WebSearch 分发**（包装 hooks 计数）——一锤定音 §七-②；
   - 失败对照：假服务器对侧查询回 400 → tool_result is_error → **result 帧仍 success**（“不毁轮次”实证）；
   - 控制组：能力位关 → 无 WebSearch 声明、无侧查询、零外部调用；保留 `count_tokens` 桩（probe 既有惯例 :34）。
3. **门槛**：本角色全套（现 29/29 + 新增）全绿、`npm run typecheck` 零错、`git diff --check` 干净；证据落 `docs/fix/2026-10-16-web-search-evidence/`（沿 change 证据目录先例）。
4. **真机收尾（客户侧，实施后）**：能力位开＋真实网关＋客户模型，跑 §三.2 同题 prompt；验证真实结果入上下文、预算/失败如实。**发布默认开以探针（§三.2）结果为准**。

## 六、与 Pi / Codex 提案的差量核对（三端口径，供 PM 合流）

定稿前只读核对了两份同日提案（Pi：声明注入派；Codex：Responses 内置工具派）。三端**缺省姿态一致（fail-closed 关）**，但机制与可呈现数据面不同源，逐项差量如下：

| 维度 | Pi 侧 | Codex 侧 | Claude 侧（本提案） | 对齐含义 |
| --- | --- | --- | --- | --- |
| 机制 | 扩展钩子把声明**注入每轮请求**（Pi §1.2/§1.6） | 走 Responses 内置 `web_search` 工具键（待 T3 矩阵实证，Codex §1.1） | **CLI 内置 `WebSearch` 工具**；声明与执行都在 CLI 内部 side-query（§2.1） | 三端都是「声明式服务端执行」，但 ANS 的介入点分别是：注入/钉三处/不可介入 |
| 能力位 | `ANS_PI_SERVER_TOOLS`（列表 `id[:max_uses]`，Pi §3.1） | `ANS_CODEX_WEB_SEARCH`（off/on，Codex §1.5） | `ANS_CLAUDE_WEB_SEARCH`（默认关，§2.3-1） | Claude 与 Codex 同形；Pi 列表形态因其多工具面，皆有据；建议三端文档统一「缺省关、探针过后再议默认」表述 |
| toolName | `web_search` 等协议名（Pi §2.2） | `webSearch` item（Codex §1.3） | SDK 面字面名 **`WebSearch`** | 建议**如实发原生名**，桌面端做显示映射（Codex 提案「口径对齐落行语义、不逐字段一致」的原则同样适用）；若 PM 要求同串，可在投影层映射——属 §七-④ 一部分 |
| 单次上限 | `max_uses` 客户可配（缺省 1，Pi §3.1） | `search_context_size` 等可配（Codex §1.1） | **固定 `max_uses:8`/次**（CLI 硬编码）+ 会话预算默认 200（env 可调，§2.1） | 治理含义不同：Claude 侧的可见事实是「每会话预算」，行文案/说明应据实，勿照搬 Pi 的「max_uses=1」措辞 |
| 网关不认时 | 可**剥离声明重试**（声明可撤，Pi §4.2） | 声明在请求上→**轮次 failed**（Codex §三-3） | 声明在按需 side-query→**只损失该次搜索**（tool_result is_error、轮次继续，§四.3）；**无剥离重试也无注入点可剥离** | Claude 侧影响面最小，避免把 Pi 的 400-剥离需求套到 Claude；也不必为 Claude 立剥离机制 |
| usage 透出 | 直读 `usage.server_tool_use.web_search_requests`（Pi §2.3） | app-server 面无可直读计数（Codex §三-2） | 不经 SDK 暴露（side-query 内部计量）；`tool_use_result.searchCount` 逐次可用（§四.2） | 对齐目标应定为「按次调用计数可显示」而非同一字段；三端计量数据面本就不同层 |
| 提示注入面口径 | 外部内容进上下文，启用行如实提示（Pi §3.1/§3.2） | 同族治理口径 | 同族（搜索结果为外部不可信内容进上下文；本提案不新增内容审查面） | 若客户要「启用提示行」：Pi 拟每会话一行；Claude 侧可选项（未拟 v1），三端是否统一由 PM 裁 |

**结论**：三端提案无相互依赖，可独立评审；上表第 3 行（toolName）与第 7 行（启用提示）建议 PM 随行样式裁定一并定；其余为各端机制固有差量，如实呈现即可（勿互相套用降级/配置措辞）。

## 七、分期归属与待裁定点

**期 1（本角色，批准后实施）**：§2.3 六项落点 + §五 测试 1/2 + 功能文档更新。改动面=三处（`queryOptions`、PreToolUse、消息泵）＋env 开关，均为增量，默认关时逐字旧行为。

**期 2（跨角色，另派）**：
- 设置面板字段 `ANS_CLAUDE_WEB_SEARCH`（`src/common/shared/runtime-settings.ts` 属主：项目管理；消费＝装配/桌面窗口）。期 1 期间客户可手动写 `.env`（合并写不丢键，§2.2 末）。
- 行样式定稿与「轮末折叠」核对（桌面UI，建议与 Pi 侧同批）。
- 契约对齐增强（`core-query-v1`/`target kind:'query'`，运行时核心；与 Pi 合流）。
- WebFetch 是否另行立项评估（Claude 侧它是**客户端抓取＋小模型摘要**，非服务端工具；且有 preflight/域名策略面，语义与搜索不同，默认不并入 V1）。
- 计量/“N 条结果”呈现（可选）。

**待客户/PM 裁定点**：
1. 开关形状与默认：`ANS_CLAUDE_WEB_SEARCH` 默认关→探针通过后是否翻默认开（一行变更）？适用范围＝全角色还是子集？
2. 预放行取态：`allowedTools` 后备位保留与否（回环探针定 hook 分发后收口；hook 分支无条件下必需）。
3. 预算 env（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`/`…REFILLS_PER_HOUR`）是否透传给子进程（默认不透传，CLI 默认 200/会话）。
4. 行样式与契约：V1 最小（无契约变更）先落，还是等 `query` target 契约与 Pi 合流一次到位？
5. WebFetch 排期与否（建议：另行评估）。
6. 逐次搜索计量（`searchCount`）与“N 条结果”展示是否纳入 V1（默认不纳入）。
7. 发布节奏：期 1 代码可随下一版运行包发布，但**默认取值**等客户探针结论后定。

## 八、证据坐标（复核对表）

| 事实 | 坐标 |
| --- | --- |
| G-3 派发与客户要求 | `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md:91-95` |
| 三端同日提案（差量核对对象） | `角色卡/Pi适配器/docs/fix/2026-10-16_proposal_server-side-tools.md`；`角色卡/Codex适配器/docs/fix/2026-10-16_proposal_web-search.md`（对照见本文 §六） |
| 本仓 queryOptions（tools/allowedTools/canUseTool/hooks） | `src/provider/claude/session.ts:224-231`、`:232-263`、`:246-262` |
| childEnv 白名单与 base URL 覆盖 | `session.ts:163-174`；env 快照 `:50`；模型 env 先例 `:230` |
| 消息泵现消费面（assistant text/result） | `session.ts:272-273`、`:274-292`；toolCallId 先例 `:201` |
| 原生工具事件契约与 Pi 先例 | `src/model/runtime.ts:528-537`；`src/common/pi-adapter/real-adapter.ts:518/544` |
| 显示契约 target 限制与 URL 清洗 | `src/model/runtime.ts:481`；`src/common/runtime-core/tool-display.ts:20-29/38-41/107/128` |
| SDK：tools/allowedTools/disallowedTools/canUseTool | `sdk.d.ts:1637-1649/1584-1590/1606-1610/1595` |
| SDK：tool_use_result / result / tool_progress | `sdk.d.ts:6351/5747-5806/6235-6252` |
| SDK：WebSearch 输入/输出/USAGE 计量形状 | `sdk-tools.d.ts:1122-1133/3756-3798/121-122` |
| CLI：WebSearch 侧查询与 server tool 声明、max_uses:8、tool_choice | 嵌入 JS 偏移 ≈210,297,813（含 foundry 守卫、tool_result 文案同区域） |
| CLI：预算默认 200/会话、回补默认 0 | 偏移 ≈200,36x,xxx（`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION??200`）；env 注册表 ≈193,533,643 |
| CLI：预算耗尽文案 / 侧查询错误源 | ≈81,595,xxx / ≈81,596,940 |
| CLI：beta 仅 vertex/foundry；`$xr` 常量 | ≈196,517,866 / ≈195,369,463 |
| CLI：`Fp="WebSearch"`、BUILTIN_TOOL_NAMES、进度标签 | ≈198,289,509 / ≈222,882,870 / ≈220,637,405 |
| CLI：网关登录模式说明（base-URL 路由不受限） | ≈89784875 / ≈222722104 |
| 配置通道（.env 合并写、路径口径） | `app/desktop/pi-config.ts:69-80`；`src/common/shared/env-file.ts:301-325/390-405`；`runtime-settings.ts:39-46` |
| 测试先例（假 SDK / 真实 CLI 回环） | `test/claude-adapter/session.test.ts:34-86/74/105/117-126`；`test/claude-adapter/native-loopback.probe.ts:1-2/34/40-52/61/109-113` |

附注：CLI 偏移按本机 darwin-arm64 2.1.299 构建核对（sha256 `ba5ab7b8c195fa03ab8d5bf3915c76153b576a2c40e79a5c46e265e7ed9744b3`）；跨平台二进制偏移可能不同，复核对先验身份（manifest 校验和）或改用文字锚点（如 `max_uses:8`、`web-search-side-query-api-error`）。本仓行号若与他角色并行改动冲突，以符号名定位（`startEngine`/`PreToolUse` 分支/消息泵）。行号基线：写作时工作树（claude 路径同 HEAD `1f069c7`）。

关联：[Claude 会话功能](../feature/claude-session.md)。
