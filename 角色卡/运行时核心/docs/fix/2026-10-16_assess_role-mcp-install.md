---
id: role-mcp-install-assessment
type: fix
title: 外来 MCP server 按角色安装——三平台可行性评估（G-4 技术输入）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: assessment-only
related: [kanban-fixes-pm-review]
---

# 外来 MCP server 按角色安装（G-4）——运行时核心技术可行性评估

**状态：评估轮——未实施、未测试。** 本轮只写评估文档：**零代码改动、零测试、零 git 提交、未运行任何真实网关请求**。依据＝G-4 候选（客户 2026-10-16 讨论提出，PM 记录见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md:120-125`）与其中「待解设计点：MCP 三平台机制（Claude 放行面／Codex 白名单化／Pi 支持性）」。行号基于**工作树**（HEAD `2c70e5b`；三平台搜索批在飞——`src/provider/claude/session.ts`、`src/provider/codex/session.ts`、`src/common/pi-adapter/real-adapter.ts` 在 `git status` 中为 M，本文行号以工作树实际内容核对；未触碰任何在飞文件）。文中推测性结论均标证据等级；无法从静态证据判定的均标「**待确认**」并给探针方案（§九）。

## 结论（先列）

| 平台 | 可行性 | 需改什么（最小集） | 主要风险 |
| --- | --- | --- | --- |
| **Claude** | **可行**（放行面最小、机制已被本仓 WebSearch 先例验证同形） | ① 在 `queryOptions.mcpServers` 追加安装产物里的 server（注入面现成，`strictMcpConfig` 维持）；② PreToolUse 兜底 deny（`session.ts:270-276`）新增白名单放行分支——**不改则外来 MCP 工具一并被拦**；③ 审计行两处新发射点（hook start＋消息泵 result 配对，与 WebSearch 完全同形）；④ 失败时查 `mcpServerStatus()` 如实出一行 | canUseTool 复合行为、`mcp_server.source` 取值、MCP 子进程环境三项**待确认**（各一次 loopback 探针可定格） |
| **Codex** | **可行**（实现面中等） | ① 全量 disable 改白名单化（`session.ts:336-341`）；② 进程级/线程级/目录级三处硬校验改「**恰等于**白名单集」（`:341`、`:426`、`:439-440`）；③ 定义注入（`-c` 根 map，沿 `config.ts:69` 先例，转义待探针）；④ `mcpToolCall` 类原生 item 的行映射新增（现未映射） | 原生 MCP 调用**不经 ANS 门禁**（既有结论：流式事件在派发/结果阶段，不能作写前拦截点；native 调用无可靠轮次身份）——白名单＝**能力级授予**，非逐调用治理，批文须如实写；子进程环境/审批请求形态待探针 |
| **Pi** | **可行，但接入面最大**（SDK 有 MCP 面，实据在 §四——**不是**「V1 不可用」） | ① resourceLoader 增 `createMcpExtension({loadConfig})`（`real-adapter.ts:1056-1068`）；② 构造后补调 `session.bindExtensions()`（**现版全程未调**，MCP 靠 session_start 建连）；③ 门禁白名单放行 `mcp__<server>__*`（`real-adapter.ts:499-504`）；④「非注入工具」硬校验放开同前缀（`:1128-1132`）；⑤ 曝光模式二选一（direct 最小；codemode/deferred 需再加扩展与设置） | **默认把全量 `process.env` 交给第三方 server 子进程**（pi-mcp 实据，三平台中唯一默认不安全）——必须自持 transport 收窄；`bindExtensions` 是既有会话链路的新触点，须回归 |

共同口径（建议写进产品/批文）：安装产物由 **Service 层读取、会话构造（bindRole）时注入**，**下次开会话生效**，活会话不受影响（与客户「安装可见、可撤」预期一致）；**server 起不来 ⇒ 会话照开、工具缺席、如实出一行、不毁会话轮次**；卸载＝删产物条目、同样下次生效。

## 一、任务与基线

- 客户裁定（PM 记录 `:122`）：**不设二次确认卡**——「客户会话中指令 su 安装即完成授权；su 不自主发起；安装可见、可撤即可」。故本评估不引入新确认面；机制上三平台的「授权」都落在「安装产物被写入 ⇒ 下次会话注入」这一环。
- 现状事实（PM 记录 `:123`）：技能走 `skillRoot`（另案）；MCP——「ANS 自身即以 MCP 通道向 Claude/Codex 注入内置工具（管道已验证），外来 MCP 现被三重封死；Pi **无** MCP 面」。**本评估对 Pi 的这条事实做了实测更正**：Pi SDK 有完整 MCP 面（§四），「封死」只因其为可选扩展、ANS 未加载。
- 与本角色关系：`src/model/runtime.ts`（中立类型与能力位）、`src/service/runtime/session.ts`（Provider 注入面）、`src/provider/runtime/tools.ts`（受治理工具）、`src/common/runtime-core/tool-display.ts`（展示投影）属本角色写权面；三平台适配器属各自角色——本文对适配器只读定位，实施改动归各属主。

## 二、Claude 路径

### 2.1 现状：三处封死＋隔离面（工作树行号）

| 位置 | 内容 | 作用 |
| --- | --- | --- |
| `src/provider/claude/session.ts:234` | `settingSources: [], strictMcpConfig: true` | 封死配置面：`strictMcpConfig` 只允许 `options.mcpServers` 传入的 server（SDK 类型文档逐字：`node_modules/@anthropic-ai/claude-sdk/sdk.d.ts:2310-2321`——「Only use MCP servers passed via the `mcpServers` option…ignoring all other MCP configurations」），`settingSources: []` 再关文件设置面 |
| `session.ts:235` | `skills: [], plugins: [], settings: { disableAllHooks: true }` | 关插件/盘上 hook 面（plugin 来源 MCP 一并封死） |
| `session.ts:239` | `canUseTool: async () => ({ behavior: "deny", … })` | 许可兜底：一律拒绝 |
| `session.ts:254-277` | PreToolUse hook（唯一工具调用拦截点） | 放行仅两类：`mcp__ans__*`（`:258-261`）与 WebSearch 能力位（`:267-269`）；**其余一律** emit blocked 行（`:270-275`）＋`permissionDecision: "deny"`（`:276`） |

隔离面（维持，不动）：`:178-179` ANS 工具名白名单校验；`:184-185` 进程内 SDK MCP server（`name:"ans"`）；`:166-170` CLI 子进程 env 白名单（PATH/HOME/TMPDIR/TEMP/TMP/SystemRoot/WINDIR/LANG/LC_ALL ＋ `ANTHROPIC_API_KEY`＋`CLAUDE_CONFIG_DIR`＋`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS="0"`，可选 `ANTHROPIC_BASE_URL` `:171-177`）。

### 2.2 最小放开面（注入侧）

- **注入面现成**：`SDK.Options.mcpServers?: Record<string, McpServerConfig>`（`sdk.d.ts:1963`）；`McpStdioServerConfig = { type?: "stdio"; command; args?; env?; timeout?; alwaysLoad? }`（`sdk.d.ts:1340-1360`）。最小改法＝在 `:236` 的 `mcpServers: { ans: server }` 追加一项安装产物 server。**`strictMcpConfig: true` 无需改**——它恰好保证「除本宿主显式注入外一概不生效」。
- 两个配置纪律（建议成为产物字段要求）：
  1. **`alwaysLoad: true`**（`sdk.d.ts:1352-1359`）：否则 tool search 启用时外部工具会被隐藏到检索之后；本适配器 `tools: []`（`:232`）连检索工具都没有，隐藏即不可达。ANS 自家 server 正是靠 `_meta:{"anthropic/alwaysLoad":true}`（`:194`）常驻。
  2. **`timeout`**：ANS server 设了 `MCP_TOOL_TIMEOUT_MS`（`:42`，≈24.8 天）；外来 server 建议给有限 tool-call 超时，否则单次调用可挂满整轮（轮级时限仍在，见 2.5）。
- server 名规则：以自身字面量参与工具名 `mcp__<name>__<tool>` 与 hook 判据（2.3），须自定字符集校验、拒绝与 `ans` 重名、拒绝与 ANS 工具名前缀冲突。

### 2.3 关键核实：现有兜底/许可链会不会把外来 MCP 工具一并拦掉——**会**，逐行

对一次 `mcp__<installed>__<tool>` 调用，PreToolUse hook 的判据逐条落空／命中：

1. `:258` 条件含 `names.has(hook.tool_name)`——`names` 只含 `mcp__ans__*`（`:178`）→ 不成立，ANS 放行分支跳过；
2. `:267` WebSearch 分支要求 `!hook.mcp_server` 且 `tool_name==="WebSearch"` → 不成立；
3. `:270` `if (originalTurn)`——正常轮次内 `originalTurn` 存在（`UserPromptSubmit` `:241-253` 已登记）→ 走 `:272-275`：**发「拒绝非 ANS 工具」blocked 行**；
4. `:276` 返回 `permissionDecision: "deny"` → **执行被拒**。

⇒ 两重后果：外来工具调用被执行层拒绝，且审计面把它显示为「非 ANS 工具拒绝」。**放行需动的最小几处**：

- **①（必须）** 在 `:262` 与 `:264` 的 WebSearch 分支之间新增白名单放行分支：条件＝`hook.mcp_server?.name === <已安装名>`（name 命中本宿主注入集即可信——`strictMcpConfig:true`＋`settingSources:[]`＋`plugins:[]`＋无 agents 已封死其余来源；**不要**照抄 `:258` 的 `source === "sdk"` 作为条件，那是 in-process server 专属标记，SDK 文档明确 process server 的 source 走配置作用域枚举 `sdk|plugin|user|project|local|dynamic|…`，`sdk.d.ts:1226-1241`，`options.mcpServers` 进程 server 的实际取值**待确认**，一次 loopback 探针定格）＋轮次活性条件（照抄 `:258` 后半段 guard）。返回 `permissionDecision: "allow"`，**不注入 `updatedInput`**——沿 WebSearch 分支的既有纪律（`:263-266` 注释：「No updatedInput — the model's query must reach the tool unchanged」），外来 server 的入参必须原样到达。
- **②（先例支持，建议同做）** `:233` `allowedTools` 追加白名单条目。WebSearch 先例是「hook 放行分支＋allowedTools 登记」两者都做（`:233` 含 `"WebSearch"`，`:267` 放行分支注释明言「hook deny precedes allowedTools」，即仅登记不够、hook 分支是必需的）；外来 server 条目形态（`mcp__<name>` server 级还是逐工具）**待确认**。
- **③（待探针定必要性）** `:239` `canUseTool` deny-all。证据倾向「hook allow 会短路它」：本仓 G-3 记录（PM 记录 `:113`）以 loopback probe 6/6 实证「PreToolUse 对内置 WebSearch **实分发**」——当时 `canUseTool` 即已是 deny-all 且 WebSearch 无 handler 回退路径，说明 hook-allow 在既有组成下未经 canUseTool 拦截。但该实证对象是内置工具，**进程型 MCP 工具**是否同样短路须一次探针确认；若不短路，`canUseTool` 需按白名单放行（同条件）。

### 2.4 放行后：可见性/审计（能进 ANS 工具行，但需新增两处发射点）

- **来源可见**：`PreToolUseHookInput` 带 `tool_name/tool_input/tool_use_id/mcp_server?: {name, source}`（`sdk.d.ts:2760-2766`），即 hook 层可直接看到「这是哪个 server 的哪个工具、入参是什么」。
- **start 行**：放行分支内用 `emitTool(originalTurn, { origin: "native-start", phase: "start", … })` 发一行（`native-start` 语义＝原生执行、非 ANS handler；事实联合类型见 `src/model/runtime.ts:528-536`）。当前 `:270-275` 只有 blocked 路径——放行而**不发射**＝工具执行零行（审计缺口）。
- **result 行**：外部 MCP 的结果与 WebSearch 同形态回到消息泵（assistant 的 `tool_use` 块与随后 `user` 的 `tool_result` 块）。机制已在本仓验证同形（G-3「消息泵 native-start/result 配对」，PM 记录 `:113`）：照抄 `nativeCalls` 登记（`:290-296`）与 tool_result 消费（`:298-311`）即可，content 文本块→`native.content`，非文本→`unsupported`（`:305-308`）。
- **脱敏**：两处发射都经 `emitTool → projectToolEvent`，走核心 `protectText`（`src/common/runtime-core/tool-display.ts:70-77`）——按当前凭据集替换。**外来 server 自己的令牌不在** `RUNTIME_CREDENTIAL_ENV_VARS`（`src/common/shared/runtime-shared.ts:50-58`），若模型把产物里的 `env` 秘密打进输出，不会被替换。**建议**：把安装产物声明的秘密值并入 `registerToolDisplayProfile` 注册面（`session.ts:72-76`）——本角色 `tool-display.ts:79-88` 已支持任意注册集，属小改。

### 2.5 失败边界（server 起不来）

- SDK 宿主面有**只读状态查询**：`query.mcpServerStatus(): Promise<McpServerStatus[]>`（`sdk.d.ts:3046`），条目含 `status: connected|failed|needs-auth|pending|disabled`、`error`、`tools`（`sdk.d.ts:1258-1289`）。MCP 启动整体**非阻塞**（`alwaysLoad:true` 的条件注释：非阻塞为默认行为，`alwaysLoad` 才阻塞到 ≤5s 连接超时，`sdk.d.ts:1352-1359`）。
- 建议口径：会话照常构造；会话就绪后查一次状态，`failed/needs-auth` 的已安装 server 发一条如实 `message` 行（「已安装 MCP「X」未连接：<error 类别>」——**不落 error 正文全文**，沿 server-tools 只落类别的纪律）；本轮正常执行。**不因 server 起不来拒绝开会话、不毁轮次。**

## 三、Codex 路径

### 3.1 现状（工作树行号）

| 位置 | 内容 | 作用 |
| --- | --- | --- |
| `src/provider/codex/session.ts:321` | 子进程 env 白名单 `{ PATH, CODEX_HOME, CODEX_API_KEY }` | 隔离面 |
| `session.ts:323-341` | 预检运输：`connect([])` → 读 `config/read` 枚举全部 server（`:335`）→ 有则 `connect(allServers)` 对**每一个** ID 叠加 `enabled=false`（`:336-340`）→ `if (connection.inspected.enabled.length) throw`（`:341`，「任何 foreign MCP 仍启用即拒开工线程」） | 进程级全量封死 |
| `src/common/codex-adapter/config.ts:62-71` | `safetyOverrides(cwd, disabledServers)` → `mcp_servers={name={enabled=false},…}` 根 TOML map 叠加（`:69`） | 禁用实现（既有探针结论：根 map 叠加是可靠手段，quoted dotted override 不可靠——Codex 设计文档 §「为什么需要 app-server」） |
| `config.ts:74-85` | `effectiveConfig`：校验 features/sandbox/approval/web_search 后返回 `{servers, enabled: 未显式 enabled=false 的 ID 列表}`（`:84`） | 读回复核（Pin 3） |
| `session.ts:426` | 线程级 `mcp_servers: {每个发现 ID → {enabled:false}}` | 双保险 |
| `session.ts:439-440` | `mcpServerStatus/list`（`detail:"toolsAndAuthOnly", limit:100`）**必须空**：`data.length` 非 0 或 `nextCursor` 存在即抛 | 目录级硬校验（「空目录硬校验」） |
| `session.ts:392-397` | 审批链：command/fileChange → decline；permissions → 空授予；`mcpServer/elicitation` → cancel；`item/tool/requestUserInput` → `{}`；只放行 `item/tool/call`（动态 ANS 工具代理）；**其余方法 → JSON-RPC error 拒绝**（fail-closed，`:146-151`） | ANS 单一代执行链 |
| `session.ts:427` | `sandbox:"read-only", approvalPolicy:"never"`（线程与每轮 `:463` 双处） | 原生写入封死 |

### 3.2 白名单化最小改法（逐点）

1. **禁用集收窄**（`:336-340`）：`const disabled = allServers.filter(n => n !== allowed)` 传给 `connect`；`allowed` 空时逐字现状。
2. **进程级复核改「恰等」**（`:341`）：由 `enabled.length===0` 改为「`enabled` 集合（排序后）恒等于白名单集」，白名单空时＝现状。判定落在 `config.ts:84` 已有输出上。
3. **线程级**（`:426`）：`mcp_servers: { [name]: { enabled: name === allowed } }`（白名单外显式 false 不变）。
4. **目录级复核改「恰等」**（`:439-440`）：`catalog.data` 的名字集恰等于白名单集 ∧ `nextCursor` 为空；每条的 `status` 字段用于「起不来」如实报告（条目形状**待确认**）。
5. **定义注入**：白名单 server 的 `command/args/env` 从哪来？两条路线任选：
   - (a) **`-c` 根 map 注入定义**（推荐候选）：沿 `:69` 既有根 map 先例，在 `connect` 的 overrides 追加 `mcp_servers={<name>={command="…",args=[…],env={…}}}`；`config/read` 会把它并入 `servers`，后续「恰等」校验自然成立。TOML 字符串转义（args 数组/引号）**待探针**。
   - (b) 写角色 native `CODEX_HOME/config.toml`——与现行「不读用户 ~/.codex、不写 auth 文件、native 目录只放会话状态」纪律冲突（Codex 设计文档 §「设置、认证与装配依赖」），不推荐。
6. **降级口径**：进程级/目录级「恰等」校验只对「出现白名单**之外**的 enabled／目录出现白名单外条目」fail-closed 拒开工（隔离不放松）；白名单 server **自身**连不上 ⇒ 不拒开工，走如实一行（「已安装 MCP X 未连接：类别」）——与 Claude 口径一致。**起不来时的目录/线程行为形状待探针**。

### 3.3 与内置审批链的关系（如实转述本角色内既有结论）

- 白名单 server 的工具由 codex app-server **原生执行**：不走 `item/tool/call`（那是 ANS 动态工具代理，`:397-423`）、不生成 `item/commandExecution|fileChange`（那是隔离触发项，`:535-538`）。审批侧能触及的只有原生审批请求（`:392-396` 已处理四类；未知方法已被 fail-closed 拒绝，`:146-151`）。
- 本角色 Codex 设计文档（`角色卡/Codex适配器/docs/design/2026-10-14_design_codex-governed-transport.md`，§「为什么需要 app-server」与 §「MCP 和公共契约」）已有两条相关实测结论：**「MCP 工具流式事件已经发生在派发/结果阶段，不能成为写前拦截点」**、**「X1 发现 native HTTP MCP 的现有类型没有可靠轮次身份」**（迟到调用无法安全归轮、无法补信号）。
- ⇒ 白名单＝**能力级授予**：被安装 server 的工具在 app-server 内直接执行，ANS 无逐调用预审；治理面剩「装什么」（客户授权＋su 安装）＋「事后留痕」。**批文与 su 卡文案必须照此表述**，不得宣称为逐调用受审。`approvalPolicy:"never"` 下是否会出现 MCP 工具调用的审批请求（以及其方法名）**待探针**；若出现且被 `:146-151` 拒绝，届时需裁定继续拒（fail-closed）还是转治理。

### 3.4 留痕缺口（必改项）

`item/completed` 映射（`:526-539`）现只处理 `agentMessage`/`webSearch`，`commandExecution`/`fileChange` 走隔离；**MCP 工具调用的 item（预计 `mcpToolCall` 类）未映射**（全仓 grep `mcpToolCall|mcp_tool` 0 命中）——不放行则外来调用在 ANS 事件面**完全不可见**。需新增行映射（Phase P2），item 精确形状/状态字段**待探针**（0.162.1 二进制与官方 app-server schema 可查，探针同 §九）。

## 四、Pi 路径（对 PM 记录「Pi 无 MCP 面」的实测更正）

### 4.1 SDK MCP 面实据（全部来自固定版 `@earendil-works/pi-coding-agent@1.1.0` 包产物）

| 事实 | 证据 |
| --- | --- |
| 包本体依赖 MCP 客户端库 | `node_modules/@earendil-works/pi-coding-agent/package.json` dependencies 含 `@earendil-works/pi-mcp@^1.1.0` |
| MCP 支持是**内置扩展**，SDK 会话默认不加载 | `dist/index.d.ts:32` 导出 `createMcpExtension`；文档 `docs/sdk.md:114-116`：「The CLI loads codemode, tool_search, and MCP as built-in extensions. SDK sessions do not; add … `createMcpExtension()` to the `extensionFactories`」 |
| 配置来源可**完全替换**（不碰 `~/.pi`、不依赖项目信任） | `McpExtensionOptions.loadConfig?: (ctx) => LoadedMcpConfig`（`dist/extensions/mcp/index.d.ts:33-36`，默认读 agentDir 与受信项目 `mcp.json`）；`LoadedMcpConfig{servers: McpServerEntry[], errors}`（`dist/extensions/mcp/config.d.ts:34-53`） |
| 传输可**完全自持**（环境收窄的挂点） | `createTransport?: McpTransportFactory`（`index.d.ts:37`）；工厂签名 `(entry, cwd, authProvider) => McpTransport`（`dist/extensions/mcp/runtime.d.ts:20`） |
| 扩展可运行时注册 server | `pi.registerMcpServer(name, config)`（`dist/core/extensions/types.d.ts:1364`） |
| **MCP 调用全程过 Pi 工具管道**（治理/行/许可同样适用） | `docs/mcp.md:252-254`：「Every MCP call passes through Pi's tool pipeline. Extension `tool_call` and `tool_result` handlers, including permission gates, therefore apply to MCP tools」；工具名 `mcp__<server>__<tool>`（`mcp.md:77`） |
| 连接时机＝`session_start` ⇒ 需 `session.bindExtensions()` | `dist/extensions/mcp/index.js:968-969`（`pi.on("session_start", …)` 内 `loadConfig` 并后台建连）；`dist/core/agent-session.js:2598/2618-2619`（`bindExtensions` 发射 session_start）；`docs/sdk.md:116` 明示「call `session.bindExtensions()`」 |
| 曝光可控（工具是否直接进模型声明面） | `mcp.md:191-198` 四档：codemode（默认，仅脚本可达）/deferred（tool_search 加载）/direct（直接声明）/hidden；`toolExposure` 可逐工具覆盖 |
| 后台连接与启动报告 | 会话启动后台建连、**首个 prompt 仅为 `direct` 工具 server 等 ≤10s**（`mcp.md:100`；`startupWaitMs` 默认 10000，`index.d.ts:54`）；启动期配置错误/连接失败/需登录**一次性报告**（`mcp.md:98`） |
| 大结果处理 | >20KB 中段截断＋全文写临时文件（`mcp.md:232`） |

### 4.2 ANS 适配器接入点（`src/common/pi-adapter/real-adapter.ts`，工作树行号）

- `:1128-1132` **「非注入工具」硬校验**：`session.getActiveToolNames()` 出现任何不在 `allowedToolNames` 的名字即 dispose＋抛错——MCP 工具（direct 曝光）与 codemode/tool_search 工具（另行加载时）都会命中 ⇒ **必须放开白名单前缀**。
- `:499-504` **门禁白名单**：生产路径 `allowedToolNames` 命中才放行，否则 `{block:true, reason:"非注入的 ANS 工具，拒绝执行"}` ⇒ 不放开则模型调用 MCP 工具会被拦（与 Claude 的 hook 兜底同性质）。放行后**行/结果为免费副产物**：`:528-539`（tool_execution_start → native-start 行）与 `:541-569`（tool_execution_end → native-result，含正文 content 映射 `:560-561`）对**一切工具名**通用，当前模型外工具不存在只是门禁没放行过。
- `:1056-1068` `DefaultResourceLoader`：`extensionFactories: [extension]`（治理扩展）、`noExtensions: true`（盘上扩展面封死，`noSkills/noPromptTemplates/noThemes/noContextFiles` 同排）——**MCP 扩展要显式加入此列表**，`noExtensions` 不影响 factories 自身（现治理扩展即证明此路径可用）。
- **`session.bindExtensions()` 全仓 0 调用**（`grep -rn bindExtensions src/` 0 命中）：MCP 扩展靠 session_start 建连，不补这一步**装上也不会连**；且 `bindExtensions` 还会触发 `reportUnhandledMcpServers()`（`agent-session.js:2619`）与扩展资源发现（无 handler 时 no-op）。这是对既有链路的新触点 ⇒ 必做回归（治理扩展不监听 session_start，理论零行为变化，但须实测钉住）。
- `:1018` `SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES)`：设置面封闭（`settings.ts:48-57`）。若走 codemode/deferred 路线，需在固定覆盖里加 `defaultTools`（该文件头注「不要根据环境变量或配置文件改」——即**代码变更＋评审**）。

### 4.3 曝光两路线（实现/治理代价对照）

| 路线 | 模型如何到达工具 | 额外代价 | 适用 |
| --- | --- | --- | --- |
| **direct** | 工具直接声明给模型（等同内置工具） | ① 1128 校验放开 `mcp__<白名单>__*` 前缀；② 门禁 499-504 放行同前缀；③ 首个 prompt 最多等 10s（server 慢/坏也要等，可调 `startupWaitMs`）；④ 工具连接后**动态出现**，声明面变化要关注与网关的兼容（本仓曾因 `tool_addition` 块被网关 500——real-adapter.ts:131-152 注释；Pi 侧对工具声明变化的机制与之不同，但属回归关注项） | **V1 推荐**（最小接入） |
| **codemode / deferred**（Pi 默认档） | 工具不进模型声明面，模型写脚本（codemode）或先检索（tool_search）再调 | ① 需再加载 `createCodemodeExtension()`/`createToolSearchExtension()`（`sdk.md:116`）；② settings 需 `defaultTools`（见上）；③ 1128 与门禁需再放行 `codemode`/`tool_search` 两个工具名；④ `mcp_servers` 系统提示段（`mcp.md:202`）会让模型得知 server 存在——与「direct 不可见即不可达」相反 | 后续按需 |

### 4.4 替代方案（不走内置 MCP 扩展；登记不推荐但如实列出）

用 `@earendil-works/pi-mcp` 客户端（或 `@modelcontextprotocol/sdk`）由 ANS **自持连接**，把外来工具经 `toPiTool`（`real-adapter.ts:365-406`）注册为 customTools——治理形状与内置工具完全一致（写门禁/行/结果零新改），传输环境也可完全自持。代价：工具清单固定在会话构造时（`listChanged` 动态变更需自建）、连接生命周期（重连/关闭）自持、实现量大于内置扩展路线。列为候选二。

## 五、配置与生效

### 5.1 安装产物形态与存放候选

产物字段三平台近乎同构（`name`＋`command/args/env` 或 `url/headers`），可归一为中立 JSON（本角色 `src/model/runtime.ts` 增 `InstalledMcpServerV1` 类型，单一来源）。存放候选：

| 候选 | 可见性 | 技术面 |
| --- | --- | --- |
| (a) `角色卡/<roleId>/mcp.json` | 仓库内可见、随项目走、天然的「安装可见、可撤」 | su 现**无**写权（`run-role.ts:912` 预授权仅 `docs/su`、`docs/contracts`）；且内容可能含第三方令牌（入 git 风险，见 §六）；三平台加载器都不读它，读取仍须走 ANS 自持通道 |
| (b) `.ans/roles/<roleId>/mcp.json` | 应用域、天然隐藏（需另设展示渠道） | `.ans/sessions/<roleId>/<runtime>/{ans,native}` 已是 ANS 产物区（`session-store.ts:20-23,64-67`），权限先例 `mode:0o700`（`session-store.ts:64-91`）；不污染任何 SDK native 目录，符合三平台「环境封闭」纪律 |
| (c) 项目根 `mcp.json` | 与 Pi `.pi/mcp.json` 形状同但语义不同 | 三平台加载器都不读，反而与「strictMcpConfig/不受信项目」语义纠缠——不推荐 |

(a)/(b) 的取舍属产品/PM 裁定；**技术约束**：读取必须是纯读、失败不建目录（沿 `session-store.ts:20` 注释纪律）；产物不存在/损坏 ⇒ 视作未安装＋如实一行，**绝不因产物问题打不开角色会话**。

### 5.2 谁写：su 工具能力位路线（沿既有先例，不并入写边界）

- 现成范式：`dispatch_task` 只给 su——能力注入才注册（`run-role.ts:515-516`；`tools.ts:1014` `makeDispatchTaskTool`；能力位形状＝`src/model/runtime.ts:374` `GovernedToolsOptions` 可选字段）。安装工具照此：新增能力位（如 `installMcpServer`/`uninstallMcpServer`），只对内置治理角色注入；handler 由编排/桌面路由执行**落盘**。
- **不走模型 `write_file`** 的理由：把「安装产物写权」放进门禁写边界会牵动边界条目/预授权列表（`:912` 是否扩列——PM 记录的待解设计点之一——以及 F4 精确集合表达不了「动态新角色目录」的老问题，见 `governance-seed.ts` 头注）。若 PM 裁定要走 write_file 路线，则扩列与路径注入面须另评估。
- handler 自持校验（不依赖模型自律）：名字字符集与保留名（`ans`）拒绝、`command` 非空/`url` 合法、env 值只收**引用形态**（§六）、上限条数；写盘用原子写原语＋0o700/0o600。

### 5.3 何时生效与读取点（三平台构造时机实据）

- **Claude**：`startEngine` 每次建引擎时构造 `queryOptions`（`:230-236`）；同一 RoleSession 内引擎复用（`:142` `if (engine && !engine.closed) return engine`）⇒ 注入集**随会话冻结**；关引擎后（中止清理/恢复失败重建）下轮重建会重新读取——建议 Service 在 bindRole 时读一次并随会话固定，避免「同一会话中途换集」。
- **Codex**：`bindRole` → `connect` 每次新起进程（`:323-340`），产物在每次构造读取。
- **Pi**：`bindRole` 建 resourceLoader（`:1056-1073`）→ `bindExtensions` 时 `loadConfig` 回调被调用（MCP 扩展 `index.js:968-969`）⇒ 读取点＝会话构造内。
- 共同结论：**「安装/卸载 ⇒ 下次开该角色会话生效；活会话不受影响」**。客户预期「安装可见、可撤」按此口径写产品文案。未来若要「不重启生效」，Claude 有 `setMcpServers`（`sdk.d.ts:3228`）、Pi 有 `registerMcpServer`（types.d.ts:1364）——列登记、V1 不做。

### 5.4 与现配置加载路径的关系

现链：装配 `src/index.ts:156-165` 载入 `.ans/project.json` → `ProjectConfig` → `resolve-role.ts:21-70` 解析角色 → 编排 `run-role.ts` 组装 → `RuntimeProviderOptions`（`src/model/runtime.ts:452-469`，**现无 env/额外配置字段**）→ 各适配器。建议新增**中立只读字段**（如 `installedMcpServers?: readonly InstalledMcpServerV1[]`）由 Service 在 `service/runtime/session.ts:103-131`（`providerFor` 组装 providerOptions 处）读取产物后注入；适配器保持纯消费、不各自去找文件（单一来源、三平台同形、也便于测试注入）。字段与读取器归本角色写权面。

## 六、安全面

### 6.1 三平台 MCP server 子进程环境对照

| 平台 | ANS→SDK 子进程（现状实据） | SDK→MCP server 子进程（外来方） |
| --- | --- | --- |
| Claude | CLI 子进程 env＝白名单＋`ANTHROPIC_API_KEY`＋config dir（`claude/session.ts:166-170`） | 由 CLI 内 MCP 客户端 spawn；**官方 MCP SDK 行为**＝`getDefaultEnvironment()`（仅 HOME/LOGNAME/PATH/SHELL/TERM/USER＋win 补充）＋配置 `env`（`node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js:20-42,65-75`）。CLI 打包副本内可见 `StdioClientTransport` 字符串（二进制证据弱）。**待探针**：CLI 实际是否按此收窄（若按此，`ANTHROPIC_API_KEY` 不外泄） |
| Codex | app-server 子进程 env＝`{PATH, CODEX_HOME, CODEX_API_KEY}`（`codex/session.ts:321`） | app-server（Rust）自行 spawn；**继承面待探针**——若全量继承 app-server env 则 `CODEX_API_KEY` 会到第三方 server；配置支持 `mcp_servers.<name>.env` |
| Pi | **无子进程**（同进程 SDK）；`process.env` 即应用 env | **默认全量继承**：`const env = inheritEnv === false ? {...options.env} : {...process.env, ...options.env}`（`@earendil-works/pi-mcp/dist/transports/stdio.js:75`）；`StdioTransportOptions.inheritEnv` 存在（`stdio.d.ts:8`）。⇒ **必须**用 `createTransport`（`mcp/index.d.ts:37`）自建 `StdioTransport({ inheritEnv:false, env: 最小集 })`，否则第三方 server 直接拿到 ANS 进程 env 中的网关凭据（`PI_CREDENTIAL_ENV_VARS`，`runtime-shared.ts:41-47`）。**这是三平台中唯一默认不安全的一条，实据充分** |

### 6.2 第三方代码执行面

- 三平台 MCP server 都是**用户权限的子进程**，不受 ANS 沙箱约束（Claude/Codex 的 read-only 只约束各自命令执行工具；**codex 的沙箱是否覆盖 MCP 子进程待探针**）。这是「装 MCP＝把第三方代码执行权授予该角色会话」的实质，须写入产品/批文。
- **Pi 特有**：默认传输会对配置值做 `${VAR}`/`!command` 解析，`!command` 形态会在**建连前于 ANS 进程内执行命令**（`dist/extensions/mcp/runtime.js:61-64` 调 `resolveConfigValueOrThrow`；`dist/core/resolve-config-value.js:199-207` 证 command 引用存在）。产物校验必须只收字面量/`${VAR}` 引用（拒 `!` 开头），或由自持 transport 直传字面量绕过解析。
- Claude 侧 `env` 值无 `!command` 语法（`McpStdioServerConfig.env` 直传，`sdk.d.ts:1340-1352`）；Codex TOML `env` 同。统一产物形态建议：**值只允许字面量或 `env:NAME` 引用**，由各适配器自持展开（真值来自进程 env，不落产物）。

### 6.3 凭据/秘密暴露面清单

1. 产物内嵌第三方令牌（如 HTTP server 的 `Authorization`）：存储权限＋落点见 5.1/5.2（若落 (a) 须 PM 明确「入 git」口径或强制引用形态）。
2. **展示脱敏缺口**：外来秘密不在既有凭据集（`runtime-shared.ts:50-58`），出到工具行/回放（`tool-display.ts:70-77`）不会被替换 ⇒ 建议把产物秘密值注册进三平台 `registerToolDisplayProfile` 调用（`claude:72-76`、`codex:250-254`、`pi:984`），核心侧已支持任意注册集（`tool-display.ts:79-88`）。
3. ANS 自身网关凭据：见 6.1 表（Pi 必须修；Claude/Codex 待探针）。
4. 回放/历史：行经核心预算与脱敏（`DISPLAY_LIMITS`，`tool-display.ts:11`），无新面。

### 6.4 失败边界（统一口径）

**server 起不来 ⇒ 如实降级、不毁会话轮次**：Claude 非阻塞＋`mcpServerStatus()` 查询（2.5）；Codex 白名单自身失败不拒开工、只有「白名单外仍启用/目录出现白名单外条目」fail-closed（3.2⑥）；Pi 后台连接＋启动一次性报告（4.1）。三平台共同要求：发一条**明确、类别的**事件行；**不得静默**；**不得**把坏 server 描述成可用。超时面（R6）：外来 server 的 tool 调用应配 `timeout`（Claude `McpStdioServerConfig.timeout`；Pi `mcpServers[].timeout` 秒；Codex 查 schema 待探针），否则单调用可挂到轮级时限。

## 七、可见性/审计机制点与差距（三平台汇总）

| 平台 | start 行机制点 | result 行机制点 | 现状差距 |
| --- | --- | --- | --- |
| Claude | PreToolUse hook 内 `emitTool(origin:"native-start")`（新分支） | 消息泵 `tool_result` 配对（镜像 `:298-311` WebSearch） | 二者**都不存在**：现在只有 blocked 分支（`:270-275`）；被放行的调用零行 |
| Codex | 原生 `item` 流（app-server 通知） | 同上 | `mcpToolCall` 类 item **未映射**（`:526-539`）；原生执行无预审，只能事后留痕 |
| Pi | `tool_execution_start`（`:528-539`，已通用） | `tool_execution_end`（`:541-569`，含正文/`unsupported`） | 机制**已就绪**，只差门禁放行；大结果按核心预算裁（`omissions:"budget"`） |

共性：三平台行最终都走 `RuntimeToolEventFactsV1` → `projectToolEvent`（核心投影 `tool-display.ts:90-158`）→ Service `emit` 持久化（`service/runtime/session.ts:168-181` `appendReplay`），脱敏/预算/回放单点在核心。**「安装可见」的查询面**另有建议：su 已有 `role_status`/`session_tail` 只读工具（G-2 已实施）；「某角色已安装哪些 MCP」宜作为安装工具的读侧（`list` 动作）或扩展 `role_status` 载荷——属产品/编排裁定，本评估只指出机制点在能力位一侧（无需新写权）。

## 八、分期与风险清单

**分期（建议）**

- **P0 探针轮（无生产改动，全部可离线/loopback，不发真实网关请求）**：
  - Claude：临时脚本以 `options.mcpServers` 注入一个本地 stdio 假 server，观察：spawn 与否与 child env（`ps eww`）、PreToolUse 对 `mcp__*` 是否分发及 `mcp_server.source` 取值、hook-allow 后 `canUseTool` 是否被咨询、`mcpServerStatus()` 条目形状、`alwaysLoad` 与首轮等待。沿 G-3 loopback 探针先例（PM 记录 `:113`）。
  - Codex：夹具假 MCP（沿 `test/codex-adapter` 既有假 engine 先例）验证：`-c` 根 map 定义注入的 TOML 转义、白名单 server 的 item/通知/可能的审批请求形态、失败 server 的 catalog 形状与线程存活、子进程 env。
  - Pi：scratch（不入产品路径）验证 `createMcpExtension({loadConfig, createTransport})` ＋ `bindExtensions` ＋ 门禁放行后的行/结果与 env 收窄；确认治理扩展在 `bindExtensions` 引入后行为逐字不变。
- **P1 Claude**（放行分支＋审计两发射点＋状态行＋探针修正）→ **P2 Codex**（白名单化＋定义注入＋目录恰等＋item 映射＋降级行）→ **P3 Pi**（扩展接入＋bindExtensions＋门禁/校验放开＋传输收窄）。每期各自角色独立上下文、各自回归；P1/P2/P3 可并行但发布可分批。
- **P4 产品/门禁面**：su 工具面文案（install/uninstall、无二次确认的授权口径）、产物落点裁定、卡文本「不自主发起」约束、「安装可见」展示渠道。

**风险清单**

- **R1（治理，最高）**：Codex 原生 MCP 调用不经 ANS 门禁、无可靠轮次身份（既有结论）；Claude 放行后也是 SDK 直执行。白名单＝能力级授予，任何「逐调用受审」的表述都失真。缓解：批文如实、su 卡文案写清、审计行如实标注「原生执行」。
- **R2（探针缺口）**：2.3③/2.4 source/6.1 环境三项未探针前，Claude 方案存在「按错误条件放行」或「秘密外泄」的可能；P0 必须先做。
- **R3（Pi bindExtensions 触点）**：对既有会话链路的新调用，须回归钉住治理扩展行为不变（settled 单点、门禁、server-tools 观测）。
- **R4（秘密入仓）**：产物落 (a) 且含字面量令牌＝入 git；须产物形态（引用式）或落点 (b) 规避。
- **R5（脱敏缺口）**：产物秘密未注册进展示 profile 前，模型转述即裸露在回放/工具行。
- **R6（超时/挂起）**：外来 server 无 per-call timeout 时，单调用挂到轮级时限；dispose 清理对新子进程树（Pi 用其自带 taskkill/进程组逻辑；Claude/Codex 由各自 CLI 管理）需在探针/回归覆盖。
- **R7（Pi 动态工具面）**：direct 曝光下声明面随连接变化（网关兼容、10s 首轮等待、1128 校验竞态）；codemode 路线动 settings 固定覆盖（需显式评审）。
- **R8（供应链）**：第三方 server 代码＝用户权限执行（6.2）；安装即授权，卸载＝下次会话摘除，但**已发生的副作用不可撤**——文案须如实。
- **R9（Windows）**：三平台子进程清理路径各有既有先例（Codex EBUSY 修复、Pi StdioTransport taskkill、Claude config dir）；新 server 进程纳入各自清理链属回归项，非新机制。
- **R10（多角色并发）**：同项目多角色会话各自注入各自产物——读取按 `(projectRoot, roleId)` 键；su 会话自身不注入（除非安装给 su），无共享进程面。

## 九、待确认项（静态证据不可判定，P0 探针逐项）

1. Claude：`options.mcpServers` 进程 server 的 `mcp_server.source` 取值；hook-allow 后 `canUseTool` 是否被咨询；CLI 对 MCP 子进程的 env 是否＝MCP SDK 默认收窄；`allowedTools` 对外部 server 的条目形态（server 级 vs 工具级）。
2. Codex：`mcpToolCall` item 形状/状态字段与通知方法名；MCP 工具调用是否产生审批类 server request；白名单 server 连接失败的 catalog/线程形状；`-c` 根 map 携带完整定义的 TOML 转义；app-server→MCP 子进程 env；per-call timeout 配置键。
3. Pi：`bindExtensions` 引入后治理扩展逐字行为；direct 曝光下 1128 校验与门禁放行的正确判据（前缀模式而非快照枚举）；`startupWaitMs` 对首轮时延实测；`createTransport` 收窄后 OAuth/HTTP 路径是否需要等价处理（HTTP server 无子进程，风险面不同）。
4. 产品/PM/门禁：产物落点 (a)/(b)；「安装可见」展示渠道（工具读侧 vs role_status 扩展）；产物引用形态（`env:NAME`）是否采纳；su 卡文案与「不自主发起」约束的表述。

## 十、证据清单（本轮核对，全部只读）

- Claude 适配器与 SDK：`src/provider/claude/session.ts`（工作树全文，§二引用处逐行 `sed` 复核）；`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:989/1226-1241/1258-1289/1340-1360/1592-1595/1963/2310-2321/2760-2766/3046/3228`；CLI 二进制 `strings` 命中 `StdioClientTransport`（`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`）；`@modelcontextprotocol/sdk/dist/esm/client/stdio.js:20-42,65-75`。
- Codex 适配器与设计记录：`src/provider/codex/session.ts`、`src/common/codex-adapter/config.ts`、`protocol.ts`（工作树）；`角色卡/Codex适配器/docs/design/2026-10-14_design_codex-governed-transport.md` §「为什么需要 app-server」/§「MCP 和公共契约」；全仓 `mcpToolCall|mcp_tool` grep 0 命中。
- Pi 包产物：`@earendil-works/pi-coding-agent/{package.json, dist/index.d.ts:32, dist/extensions/mcp/index.d.ts:33-54/76, dist/extensions/mcp/config.d.ts:34-53, dist/extensions/mcp/index.js:968-969/284/335/376, dist/extensions/mcp/runtime.js:56-73, dist/core/agent-session.d.ts:416/755, dist/core/agent-session.js:2598/2618-2619, dist/core/extensions/types.d.ts:1364, docs/mcp.md:3/32/77/81/98/100/191-198/232/252-254/260/266/272, docs/sdk.md:114-116}`；`@earendil-works/pi-mcp/dist/transports/{stdio.js:75, stdio.d.ts:8}`；`dist/core/resolve-config-value.js:199-207`；`src/` 内 `bindExtensions|mcp` grep 0 命中（Pi 适配器侧）。
- 核心/服务：`src/model/runtime.ts:374/452-469/500-538`；`src/common/runtime-core/tool-display.ts:11/63-88/90-158`；`src/service/runtime/session.ts:103-131/168-181`；`src/provider/runtime/tools.ts:467-478/1014/1341`；`src/provider/runtime/session-store.ts:20-23/64-91`；`src/common/shared/runtime-shared.ts:41-58`。
- 编排/门禁：`src/pipeline/orchestration/run-role.ts:443-459/512-520/912/921-936`；`src/common/门禁引擎/governance-seed.ts:44-58`；`src/service/role/resolve-role.ts:21-70/98-100`；`src/index.ts:156-165`。
- PM 记录：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md:109-113`（G-3 先例）、`:120-125`（G-4）。

## 十一、对本次评估的自我限界

- 全部结论基于**静态代码/包产物/既有记录**；未运行任何真实网关请求、未跑探针、未改任何文件。§二-§四的端到端行为（尤其 hook 分发、子进程环境、原生 item 形状）凡标「待确认」处，均在 P0 探针前不得当作已证事实引用。
- 行号以工作树为准且已复核；三平台搜索批在飞（PM 记录 `:112` 周边），若其收敛后行号漂移，以内容为准复核一次即可，结论不受影响。
- 本评估不替 PM/门禁/产品作裁定：产物落点与写权、su 工具名与文案、Codex「能力级授予」的批文表述，均为其上会材料项。

（本文状态：**未实施 / 未测试**。如需推进 §八 分期，请 PM 按角色派发。）
