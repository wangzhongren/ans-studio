---
id: codex-web-search-proposal
type: fix
title: Codex 路径联网搜索（服务端 web_search）接入实施方案提案
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待验证（implemented-unverified；2026-10-16 实施轮完成，客户探针 P1–P3 与真机验收待做）
revision: 2
---

# Codex 路径联网搜索（服务端 web_search）接入实施方案提案

本上下文固定为 Codex适配器（boundary.yaml Section 1）。**提案轮（2026-10-16）：只写本文档——未改任何 src/app/test 代码、未写测试、零 git 提交、未代跑任何探针**。派发来源：客户要求（原文「其他的平台都要接上搜索」，见 PM 评审件 §候选 G-3，`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md:91-95`）；G-3 主属主为 Pi适配器（其提案在做），本提案是 **Codex 侧配套**。文中凡推测均标注证据等级；拿不准处标「**待确认**」。

## 结论（先列）

1. **能力形态**：Codex 0.162.1 的联网搜索＝**Responses 内置 `web_search` 工具**（请求里声明、由 Responses 端点**服务端执行**，与 Pi 侧 Anthropic 服务端工具同构）。固定版二进制不含 `web_search_preview`（0 命中）；含顶层 `web_search` 模式键（`live`/`indexed`/`cached`/`disabled`）与 `[tools].web_search` 工具键两套开关，**具体哪套向自定义供应商的 Responses 请求注入工具声明，待回环矩阵实证**（§五-1）。
2. **ANS 现状＝三处硬钉 disabled，且是显式安全不变量**：`config.ts:43`（线程配置）、`config.ts:51`（进程 TOML 覆盖）、`config.ts:65-66`（config/read 回读断言，不符即拒启动）。**开启的确切落点就是这三钉同翻**＋回读期望值随能力位切换；环境快照、错误脱敏、只读沙箱、`networkAccess:false`（`session.ts:442`，搜索在网关侧执行、不需要本地网络）全部保持不变。
3. **事件缺口**：app-server 协议含 `webSearch` ThreadItem（`{query, action, results}`）与 `item/started`/`item/completed` 通知；本适配器 `item/completed` 分支（`session.ts:505-512`）今天**只处理 agentMessage 与两种禁工具**——`webSearch` item 现在零处理：既不隔离也不呈现（搜索活动在 ANS 聊天流不可见）。这是要补的映射缺口；`webSearch` 属服务端工具、**不得进隔离分支**。
4. **引用（url_citation 类）**：固定版二进制 `url_citation` **0 命中**——codex 0.162.1 不解析 Responses `output_text` 的引用注解；ANS 可见的引用信息只能来自 `webSearch` item 的 `query/action/results` 或正文内文本。行样式口径需与 Pi 提案联合定稿（§三、§五-4）。
5. **网关前提**：Codex 侧必须走 **OpenAI Responses 兼容端点**（适配器现有硬要求，`session.ts:299` `wire_api="responses"`；`ANS_CODEX_BASE_URL` 即此地址）。客户网关的 Anthropic-messages 兼容（Pi 已证服务端工具族）**不自动等价于** Responses 端点接受并执行 `web_search` 声明——以客户自跑探针 P1–P3 结论为准（§二）。探针结论前**不得默认开启**。
6. **默认姿态建议 fail-closed**：能力默认关；默认值与开关时点待客户裁定（§五-待裁定点 2）。开启后失败走既有诚实路径（网关拒绝声明→请求失败→轮次如实 failed；item 形状不符→codex 报 `failed to parse response.output_item.done`→流错误→failed），不新增静默面（§三-3）。

## 一、能力路径调研（file:line / 二进制只读定位）

### 1.1 固定 CLI 0.162.1 的搜索开关面【二进制证据】

只读对象：`node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`（`@openai/codex@0.162.1`，package.json 已核对）。命令均为 `strings`/字节级 `grep -aob`，无执行、无网络。

- **顶层 `web_search` 模式键**（本适配器现在钉的就是它）：串簇 `WebSearchMode` = `disabled | cached | indexed | live`；用户指引文案原文：「Set \`web_search\` to \`"live"\`, \`"indexed"\`, \`"cached"\`, or \`"disabled"\` at the top level (or under a profile) in config.toml if you want to override it.」——同段是 `[features].web_search` / `[features].web_search_request` / `[features].web_search_cached` 三个特性键的**弃用**提示（引导迁到顶层键）。结合本适配器现状（顶层键在 `--strict-config` 下被接受且 config/read 回读一致，见 §1.3），该键是现行正路。
- **`[tools].web_search` 工具键**（T2 候选）：`ToolsToml` 字段表含 `web_search`、`experimental_request_user_input`、`update_plan`；值为 untagged 枚举 `WebSearchToolConfigInput`＝布尔 **或** 表 `WebSearchToolConfig { context_size, allowed_domains, location }`（`WebSearchContextSize` = `low|medium|high`；`WebSearchLocation { country, region, city, timezone }`；解析失败文案「data did not match any variant of untagged enum WebSearchToolConfigInput」）。**这三个子字段与 Responses 内置 web_search 工具声明字段一一对应**（search_context_size / filters.allowed_domains / user_location），是「向端点声明内置工具」的直接嫌疑键（待回环实证）。
- **供应商能力位**：`ModelProviderInfo` 共 21 字段，含 `supports_websockets`、`supports_standalone_web_search`、`capabilities`（子结构 `ModelProviderCapabilities` 含 `external_web_access`、`remote_compaction`）。本适配器自定义 provider（`session.ts:299`）目前只给 name/base_url/env_key/wire_api/requires_openai_auth，**未声明**这两个搜索相关能力——自定义供应商默认应视为不支持「standalone 搜索」；另有特性键 `features.standalone_web_search`（26 命中，与 `standalone_web_search` 特性名同族）。
- **standalone 与内置工具是两条路**：`supports_standalone_web_search`/`features.standalone_web_search` 指向 codex 自行执行的搜索（客户端侧，需要 provider/后端支持）；而 `[tools].web_search`＋Responses 内置工具是**声明式、服务端执行**（与 Pi 的服务端工具同构）。**ANS 侧要走的是后者**——本地沙箱网络保持关闭（`session.ts:442` `networkAccess:false` 不动）。
- **需求/策略约束机器**：`allowed_web_search_modes`（requirements 面，5 命中）；运行时解析文案「resolved web_search_mode is disallowed by requirements; keeping constrained value」（会话）与「review web_search_mode is disallowed by requirements; keeping constrained value」（review，`core/src/session/review.rs`）。含义：若（未来）有 managed 策略约束，有效模式会被钉在允许集内——ANS 的回读断言（§1.3 三钉之三）正好能观察到「请求开了但被策略压回」的偏差并 fail-closed。
- **首方模型目录字段**：`web_search_tool_type`、`supports_search_tool`（18 命中）属模型目录条目（首方模型能力），自定义模型无目录条目时按缺省——不构成本路径的开关。

### 1.2 Responses 线侧与 app-server 协议面【二进制证据】

- **Responses 客户端解析**：`ResponseItem` 枚举含变体 `ResponseItem::WebSearchCall`（debug 串簇）；telemetry 的 item 名清单含 `response.web_search_call`（1 命中，拼在 `response.tool_search_output`/`response.image_generation_call` 等同族名中）。即：网关在 `response.output_item.done` / 最终 `response.completed.output` 里给的 `web_search_call` item，codex 0.162.1 **会解析**。
- **子事件缺席**：`response.web_search_call.in_progress|searching|completed` 作为连续串 **0 命中**（与上一轮截断评估对 `response.incomplete` 的 0 命中同型）——0.162.1 不消费搜索子事件；网关**只需**把 `web_search_call` 放在 `output_item.done`（解析失败文案存在：「failed to parse response.output_item.done」）与最终 completed 输出里。**网关若额外发子事件，0.162.1 的容忍度未知——待确认（V1 回环发一帧实测），是网关兼容性的一项硬前提**。
- **app-server 协议**：`ThreadItem`（internally tagged enum，camelCase 变体）含 **`webSearch`** → `WebSearchItem`，字段 `query`、`action`、`results`；`WebSearchAction` 变体 `Search`（挂 `queries`）、`OpenPage`（`url`）、`FindInPage`（`url`/`pattern`）、`Other`（app-server 侧 camelCase 串簇与 Responses 线侧 snake_case 串簇 `open_page`/`find_in_page` 并存——两套序列化各归一侧；实施轮以离线 oracle 固化，§四-T4）。通知方法 `item/started`、`item/completed` 均存在（各 4 命中）。**`results` 元素的确切形状无独立结构串（待确认，schema oracle 回答）**。
- **旧事件族旁证**：legacy `EventMsg` 含 `WebSearchBeginEvent`/`WebSearchEndEvent`（serde 名 `web_search_begin`/`web_search_end`）——ANS 不走旧事件流（本适配器只消费 v2 item 通知，`session.ts:493-523`），仅作存在性旁证。
- **引用**：`url_citation` 0 命中；`Annotations` 结构仅出现在 MCP（rmcp）语境。结论：**0.162.1 不解析 Responses 引用注解**；「引用」若要进 ANS，只能来自 `webSearch.results`（若网关填）或正文文本（模型/网关自带的 markdown 链接）。
- **计量旁证**：`web_search_count` 是 codex 自有 OTel 公共属性（不经 app-server）；`codex.web_search.results.payload_bytes` 为其遥测。**app-server 面上没有直接可读的搜索计数字段被本适配器消费**——计量透出方案见 §三-2。

### 1.3 本仓现状与确切落点【本角色代码】

| 位置 | 现状 | 与开启搜索的关系 |
| --- | --- | --- |
| `src/common/codex-adapter/config.ts:39-45` `safetyConfig` | `web_search: "disabled"`（:43）进 thread 配置 | **钉一**：开启须换值（进程/线程一致的期望模式） |
| `config.ts:48-57` `safetyOverrides` | `'web_search="disabled"'`（:51）作 `-c` 进程级 TOML 覆盖 | **钉二**：开启须同翻；若落点是 `[tools].web_search`，此处追加 `-c 'tools.web_search=true'` |
| `config.ts:59-70` `effectiveConfig` | `config.web_search !== "disabled"` 即抛「Codex effective sandbox/approval/search restrictions were not applied」（:65-66），bindRole 硬失败 | **钉三**：期望值随能力位切换；回读不符 fail-closed 语义保持（含被 requirements 压回的情形，§1.1） |
| `src/provider/codex/session.ts:299` | 自定义 provider：`{name, base_url, env_key, wire_api="responses", requires_openai_auth=false}` | 若探针证明需要供应商能力声明（如 `capabilities.external_web_access`），在此追加字段（**待确认**，默认不动） |
| `session.ts:303` | `connect()` 装配 `[...safetyOverrides(cwd, disabled), providerDefinition, model_provider=…]` | 钉二的宿主；`--strict-config`（:64）使覆盖键拼写错误当场失败而非静默 |
| `session.ts:405-406` | `threadConfig = {...safetyConfig(cwd), mcp_servers}`；thread/start、thread/resume 均带 | 钉一宿主；开启后 thread 级与进程级一致 |
| `session.ts:442` | `turn/start` `sandboxPolicy {type:"readOnly", networkAccess:false}` | **保持不变**：服务端工具由网关执行，本地沙箱不需要网络；也防「standalone 客户端搜索」被误启用 |
| `session.ts:493-523` | 通知分发：`item/completed`（:505-512：agentMessage→message；commandExecution/fileChange→隔离）、`turn/completed`（:513-518）、`error`（:519-521） | **映射缺口**：`webSearch` item 现零处理；`item/started` 无任何分支 |
| `test/codex-adapter/fixtures.ts:53`、`fixtures/native-cli.mjs:21` | 假 config/read 回读 `web_search:"disabled"` | 开着态夹具需同步参数化（default-off 路径逐字节回归） |

**能力位形状（提案，跨边界见 §四「分期归属」R2）**：沿 `settings()` 既有优先级模式（`modelId` 优先 `ANS_CODEX_MODEL`、`baseUrl` 优先 `ANS_CODEX_BASE_URL`，`config.ts:13-37`）——**R1 先落 `ANS_CODEX_WEB_SEARCH` 环境键**（适配器解析，值为显式白名单如 `off|on`，缺省 off；与 `ANS_CODEX_*` 同族、零 Core 改动）；**R2 视需要升格为 options 能力位**（`RuntimeProviderOptions.webSearch?: boolean`，与 G-2「字段名即契约、注入才启用」风格统一；跨 Core 边界，须 PM 派发）。两者不冲突：options 显式值优先、env 兜底、皆缺省 off。

**事件映射方案（v1 提案，待与 Pi 口径联合定稿）**：

- 在 `session.ts:505-512` 的 `item/completed` 分支增加 `item.type === "webSearch"`：发**一条** `kind:"message"` 行，摘要如 `联网搜索：<query>`（缺 query 时仅 `联网搜索`）；结构化 detail v1：`{version:1, source:"web-search", itemId, query?, action?:{type, url?, pattern?, queries?}, results?:[{title?, url?}…], resultsTruncated?:true}`——**只外推 app-server 真实报的字段，缺即是缺，绝不补造**。
- **不进隔离分支**（不是原生本地工具）；也**不做**「模型没搜＝失败」推断（工具语义下不搜即不搜）。
- `item/started` 是否用于「搜索中…」瞬时行：v1 建议**不接**（最小面、避免流噪声）；列为可选项（§五-4）。
- 能力位只门控**请求声明**（钉一/二/三），**不门控映射**：网关即便在未开启时返回 `webSearch` item，也如实呈现（现在是被静默丢弃——开启后无论何种姿态都不该丢事实）。
- 脱敏：新行走现有 `emit`（`session.ts:269-271`，summary redact＋detail 递归 scrub）。注意 `config.redact` 的 URL 规则会**剥掉 query string**（`config.ts:31-33`）——引用 URL 的 `?…` 会被裁为保守形态：v1 接受该保守行为（与全仓现状一致），如客户要求保 query 需走受保护展示通道（跨边界，§五-4）。

## 二、网关兼容性（配置前提与客户可自跑探针）

**配置前提（Responses 侧）**：

1. `ANS_CODEX_BASE_URL` 指向的必须是与 **OpenAI Responses API 兼容**的端点（适配器既有硬要求：`wire_api="responses"`，`session.ts:299`；用户设置帮助文案已写明「自定义地址须兼容 Responses API」，`src/common/shared/runtime-settings.ts:36`）。
2. 该端点须**接受并执行** Responses 请求中的 web_search 内置工具声明（字段族：`search_context_size` / `filters` / `user_location`），在 `output_item.done` / 最终 output 里返回 `web_search_call` item——即 Anthropic 侧「服务端工具族」同构能力在 Responses 线的对应物。**Pi 侧已实证的是 Anthropic-messages 面**，不自动等价。
3. SSE 事件集须被 0.162.1 可解析（已知最小集：`output_item.done`、`completed`；子事件容忍度未证，§1.2 待确认）。
4. 若网关 Responses 兼容层完全不支持该声明：Codex 路径的搜索**在网关侧不可达**——如实降级＝保持能力位 off，不硬接（后果见 §三-3 失败矩阵）。

**客户可自跑的探针思路（本轮不代跑；输出只留状态码/事件类型名/布尔结论，不含 key 与响应正文）**：

- **P1（HTTP 面、声明可接受性）**：对 `<网关>/v1/responses` 发最小流式请求（模型、一条会诱发搜索的提问），tools 声明 `{"type":"web_search"}`。观测并只记录：HTTP 状态码；SSE 事件**类型名清单**（含是否出现 `response.web_search_call.*` 子事件）；`response.completed` 的 output 里是否含 `web_search_call` item（及 `action.type`/`status` 取值）；`usage` 顶层键名清单。
- **P2（隔离对照）**：同请求**去掉** tools 声明重发——若 P1 失败而 P2 成功，失败归因即钉在工具声明上；两者皆败则先查网关 Responses 兼容层本身。
- **P3（声明形态矩阵）**：`{"type":"web_search"}` vs `{"type":"web_search_preview"}`（0.162.1 不用后者，仅测网关宽容度）vs 带 `search_context_size`/`filters`/`user_location` 字段——观测拒绝是硬 4xx 还是字段被忽略（决定「如实降级」的形态）。
- 探针脚本可有可无（curl 即可）；**任何输出不回显 Authorization、不贴响应正文**——PM/客户需要时可在实施轮由团队提供只读探针脚本模板（属实施轮，非本提案）。

## 三、呈现 / 审计 / 失败

### 3.1 聊天流行样式目标（与 Pi 侧口径对齐）

- 一行一次搜索：摘要含查询词；展开可见 `results` 引用列表（**若有**）、action 细节。失败/无结果如实（无结果字段就不显示结果区，不编造）。
- **对齐对象＝Pi适配器提案（G-3 主属主）＋桌面UI 行样式**——本提案给出 Codex 侧可呈现的事实面（§1.3 detail v1），最终行样式与摘要文案随 Pi 提案联合定稿（裁定点 §五-4）。Codex 侧现实的呈现上限就是 `query/action/results`；`url_citation` 注解不存在（§1.2），**不要按 Pi 的 citation 形状假设 Codex 能拿到同款数据**——若两侧数据面不同形（Anthropic `web_search_tool_result` vs Responses `web_search_call`），口径对齐应落在「行语义与交互」而非逐字段一致。

### 3.2 计量透出

- 现状：Codex 路径**没有**任何 usage/计量进入 ANS 事件面（usage 面未映射）；Pi 侧有 `usage.server_tool_use.web_search_requests` 可直接读。
- v1 最小建议（适配器本地、无契约改动）：turn 内 `webSearch` item 计数 >0 时，settled detail 附加 `searchCalls: n`（`detail` 为 `unknown` 类型，向后兼容）。可选升级：透出网关 usage（来自 `thread/tokenUsage/updated` 或 turn 载荷——形状待确认）列为后续口径，不承诺。
- 其归属判断（是否列 UI/计费面）属 PM/产品；本角色只保证「有事实可依、不虚报」。

### 3.3 失败矩阵（如实降级、不毁可救轮次）

| 层 | 情形 | 期望行为（沿既有路径，不新增静默面） |
| --- | --- | --- |
| 配置 | 能力开但 codex 未生效（config/read 回读不符 / 被 requirements 压回） | bindRole 硬失败（`config.ts:65-66` 模式），fail-closed |
| 请求 | 网关拒绝 web_search 声明（4xx/5xx） | 请求失败 → 轮次如实 `failed`＋原因文案（`session.ts:519-521`/`513-518`）——**这是外部拒绝的正确诚实态**；提示文案是否优化属 Core/编排（若需） |
| 流 | `web_search_call` item 形状不符 | codex「failed to parse response.output_item.done」→ 流错误 → 轮次 failed——同型既有外推路径（见上一轮截断评估） |
| 映射 | item 字段缺失 / 未知 action / results 非法 | 适配器**容错**：跳过缺失字段照常发保底行，绝不抛、绝不造数据、绝不隔离（非禁工具）；单条坏 item 不毁轮次 |
| 搜索本身 | 网关如实报告搜索失败/无结果（模型继续） | 行如实显示（无结果即无结果）；不推断、不补白 |
| 停止 | 搜索中 abort | 沿既有 stop（`turn/interrupt`）：`turn.completed` 置位后迟到的 `item/completed` 被既有守卫拒收（`session.ts:495/504`）——行为不因搜索改变 |

## 四、测试计划与分期归属

- **T1 单元（FakeEngine）**：`fixtures.ts` 增 `webSearch(...)` 发射器（`item/completed` `type:"webSearch"`），覆盖：映射行形状/身份（actual ansId）、缺 query/未知 action/results 缺失容错、redact 与 URL 保守裁切断言、**不隔离**、settled/searchCalls 计数、以及 off 路径逐字节回归（默认姿态不动的硬断言，沿 `fixtures.ts:76-79` 既有模拟法）。
- **T2 配置单元**：能力解析（env 白名单、非法值拒；R2 后 options 优先级）、三钉同翻一致性、`config/read` 回读期望值切换、回读不符 fail-closed。
- **T3 本地回环（先例：`docs/change/2026-10-15-codex-tool-display-evidence/native-loopback.probe.ts`——pinned CLI 0.162.1＋本地假 Responses SSE，捕获出站请求体、外部模型 0）**：①**开关矩阵**（`web_search="live"` × `[tools].web_search=true` 单独/组合）→ 读取出站 Responses 请求的 tools 数组，**回答待确认 1**（哪套键注入声明）；②受理 `web_search_call` item（`output_item.done` + `completed`）→ 观测 app-server 发出的 `item/started`/`item/completed` 载荷与 ANS 行事件（**回答待确认 3/4**）；③发一帧 `response.web_search_call.in_progress` → 测 0.162.1 容忍度（**回答待确认 5**）。夹具凭据一律假值、断言无外部调用。
- **T4 离线协议 oracle**：`codex app-server generate-json-schema` / `generate-ts`（子命令存在于固定二进制；**离线、无模型**）→ 以产物固化 `WebSearchItem`/`WebSearchAction`/`results` 精确形状入夹具（**回答待确认 3/4**）。本轮不运行。
- **T5 独立验证 + 真机**：测试角色独立验证（对照断言×探针结论）；真机 E2E 在客户网关开启搜索后执行（搜索行可见、失败如实、轮次完成）——随发布批次。
- **分期归属**：
  - **R1（本角色，实施轮）**：能力位（env 键）＋三钉＋映射行＋T1-T3＋文档更新。前置：PM/客户批准提案（含开关落点由 T3 矩阵定值）。
  - **R2（跨边界，须 PM 派发）**：运行时核心（options 能力位升格，若采纳）、项目管理（`runtime-settings.ts` 增设置项元数据，若走 env 键为用户可见开关）、桌面UI/UIUX（搜索行样式，与 Pi 提案对齐后）。
  - **R3（客户侧）**：探针 P1–P3；结论回来后裁定默认值；真机验收（测试角色）。

## 五、待确认项与待裁定点

**待确认**（实施轮实证，全部本地可答）：

1. 哪套键向自定义 provider 的 Responses 请求注入 web_search 声明：顶层 `web_search="live"` vs `[tools].web_search=true`（或需 provider 能力声明配合）——T3① 回答。
2. 开启时是否需在 `session.ts:299` provider 定义追加能力字段（如 `capabilities`）——随 1 一起看请求/回读。
3. app-server `webSearch` item 的确切载荷与通知载体（`item/started`/`item/completed` 之外是否还有其他）——T4＋T3②。
4. `results` 元素的字段形状与填充来源（Responses 内置工具路径下网关是否回填结果列表）——T4＋T3②。
5. 0.162.1 对未知 SSE 子事件（如 `response.web_search_call.in_progress`）的容忍度——T3③（网关兼容性硬前提）。
6. config/read 回读中 `[tools].web_search` 的扁平路径/形态（供钉三断言）——T2/T3。

**待裁定点**（客户/PM）：

1. **能力位形状与归属**：R1 env 键（`ANS_CODEX_WEB_SEARCH`，零 Core 改动）× R2 options 能力位（跨边界）——建议按分期推进，二选一作长期形态。
2. **默认值**：建议 fail-closed 默认 off、由客户裁定何时置 on（网关探针结论后）；若客户要求出厂即 on，需先有 P1 绿。
3. **开关落点键**：待 T3 矩阵后由 PM/客户知悉结论即可（技术性、建议按结论定，不另裁）。
4. **行样式与引用通道**：与 Pi 提案联合定稿（摘要文案、结果/引用区、query 内 URL 参数是否保真展示——现 redact 会剥 query）；`item/started` 瞬时行要不要。
5. **计量透出**：v1 `settled.searchCalls` 计数是否入 UI/计费面（本角色只照实计数）。
6. **失败文案**：网关拒绝声明时的用户提示优化（Core/编排文案若需要）。

## 六、证据清单（本轮命令，全部只读）

- **E1**：二进制身份——`node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`（`@openai/codex@0.162.1` package.json 核对）。
- **E2**：`strings -n 6 <bin> | grep …` 开关面——`WebSearchMode` 枚举串簇（`disabledcachedindexedlive`）；弃用文案「Set \`web_search\` to \`"live"\`, \`"indexed"\`, \`"cached"\`, or \`"disabled"\` …」；`ToolsToml` 字段表 `web_search`；`WebSearchToolConfigInput`/`WebSearchToolConfig{context_size,allowed_domains,location}`；`allowed_web_search_modes`（5 命中）；「resolved web_search_mode is disallowed by requirements」。
- **E3**：供应商面——`ModelProviderInfo` 21 字段串簇（`supports_websockets`、`supports_standalone_web_search`）；`ModelProviderCapabilities`（`external_web_access`、`remote_compaction`）；`standalone_web_search` 26 命中、`supports_standalone_web_search` 17 命中。
- **E4**：app-server 协议——`ThreadItem` camelCase 变体串含 `webSearch`（15 命中）；`WebSearchItem{query,action,results}`（24 命中）；`WebSearchAction::{Search,OpenPage,FindInPage,Other}`；通知 `item/started`/`item/completed` 各 4 命中。
- **E5**：Responses 客户端——`ResponseItem::WebSearchCall` 变体串；telemetry item 名 `response.web_search_call`（1 命中）；`web_search_call` 总 17 命中；`web_search_call.in_progress` **0**；`url_citation` **0**；「failed to parse response.output_item.done」；`WebSearchBeginEvent/EndEvent`（legacy 旁证）。
- **E6**：计量旁证——OTel 公共属性 `web_search_count`；`codex.web_search.results.payload_bytes`。
- **E7**：离线 oracle 存在性——`generate-json-schema`、`generate-ts` 子命令串（2 命中）。
- **E8**：本角色现状 file:line——§1.3 表（`config.ts:43/51/65-66`；`session.ts:64/299/303/405-406/442/493-523`；`fixtures.ts:53`；`fixtures/native-cli.mjs:21`；回环先例 `native-loopback.probe.ts`）。
- **E9**：派发与对照——PM 评审件 §候选 G-3（`:91-95`）；上一轮截断评估（同型二进制判据先例）`docs/fix/2026-10-16_assess-truncation-parity.md` §六。

## 七、对本次提案的自我限界

- 全部结论基于**静态代码＋固定版二进制字符串＋PM 在案探针记录**；本轮未运行 CLI、未跑回环、未跑网关探针（提案轮约束）。凡「二进制未见」处均按待确认处理，未升级为断言；§四的 T3/T4 是对应实证手段。
- `strings` 判据不穷尽（可达字符串≠全部代码路径）；「0 命中」仅证明该连续串不在二进制中，不排除动态构造。
- 状态：**未实施 / 未测试**。如需推进，请 PM 派发实施轮（R1）与跨边界件（R2）；网关探针（R3）由客户执行。

（2026-10-16 提案轮：零代码改动、零测试、零 git 提交。）

## 实施摘要（2026-10-16 实施轮追加；上文提案原文保留不动）

客户「按推荐批准，开始实施」，实施规格＝本提案。R1 已实施（6 文件：config.ts / protocol.ts / session.ts / fixtures.ts / native-cli.mjs / 新 web-search.test.ts），详见[实施记录](../change/2026-10-16_change_web-search.md)与[证据目录](../change/2026-10-16-web-search-evidence/manifest.json)。

- **待确认项落地**：T4 oracle（generate-json-schema / generate-ts 产物入库）＋ T3 本地回环矩阵（pinned CLI 0.162.1＋假 Responses SSE，外部模型 0）回答全部 6 项——①开关落点＝**顶层 `web_search="live"`**（进程 `-c`＋thread config 双落点）；`[tools].web_search=true` 不注入、不用；②无需 provider 能力声明；③载荷＝`{type:"webSearch", id, query, action, results}` 经 `item/started`＋`item/completed`；④`results` 为不透明 JSON、服务端内置工具路径恒 `null`；⑤0.162.1 容忍 `response.web_search_call.in_progress` 子帧；⑥回读形态＝顶层键精确回显，pin3 只断言该键。
- **批准口径落地**：①默认关（env `ANS_CODEX_WEB_SEARCH=on|off` 白名单＋options 能力位，显式优先、缺省 off、非法拒）；②只 web_search；③查询串仅进会话行、不进诊断；④失败走既有诚实路径（不剥离不重试）；⑤行＝message＋detail v1（`source:"web-search"`，cap 20）；⑥键形态已实证定型。
- **验证**：自有 33/33（0 skip）、typecheck exit 0、全量 1722/1721 pass、0 fail、0 新红；真实 CLI 端到端回环绿（声明注入＋行映射＋searchCalls＋子帧容忍）。
- **未验边界**：真实网关接受/执行声明（客户探针 P1–P3 清单见实施记录）；在线模型真机；桌面UI 行样式（跨边界，PM 路由）。
