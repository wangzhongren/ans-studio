---
id: codex-web-search-change
type: change
title: Codex 路径联网搜索（服务端 web_search）R1 实施
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-web-search-proposal, codex-governed-session]
---

# Codex 路径联网搜索 R1：能力位 + 三钉同翻 + webSearch 行映射

客户已批准（2026-10-16「按推荐批准，开始实施」，裁定见 PM 评审件 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-3 客户批准与实施派发」）。本上下文为派发的 Codex适配器 实施上下文，实施规格＝本角色提案 `docs/fix/2026-10-16_proposal_web-search.md`，按其 R1 分期实施。批准口径逐条落实：①默认关＋`ANS_CODEX_WEB_SEARCH` 开关（并落 options 能力位 `CodexRuntimeAdapterOptions.webSearch`）；②首批只 `web_search`；③查询串不进诊断（仅进会话事件行）；④网关/端点不认声明＝如实失败不毁轮次（本次不加剥离重试）；⑤行样式＝message 行＋结构化 detail（UI 配合见「跨边界」）；⑥开关落点键按 T3 回环矩阵实证定型（结论见下）。

## 改动（本角色边界内 6 个文件）

- `src/common/codex-adapter/config.ts`：新增 `webSearchEnabled`（白名单 `on|off`，缺省/空白 off，非法值显式抛错）；`settings()` 返回 `webSearch` 布尔能力位（`options.webSearch` 显式优先、env 兜底）；三钉参数化——`safetyConfig(cwd, webSearch?)`（pin1，线程配置）、`safetyOverrides(cwd, disabledServers?, webSearch?)`（pin2，进程 `-c` 覆盖，位置与格式不变）、`effectiveConfig(response, webSearch?)`（pin3，回读期望值随能力位切换，错误文案不变）。能力关时三函数输出逐字节与改动前一致。
- `src/common/codex-adapter/protocol.ts`：新增 `webSearchRow(item)` 纯映射（detail v1），容错不抛。
- `src/provider/codex/session.ts`：`CodexRuntimeAdapterOptions` 增 `webSearch?: boolean`（显式值优先于 env；R2 由 Core 升格时字段名不变）；connect/线程/回读三处传能力位；`TurnState.searchCalls` 计数；`item/completed` 增 `webSearch` 分支——一条 `kind:"message"` 行，摘要 `联网搜索：<query>`（缺/空 query 时仅 `联网搜索`），**不进隔离分支**、**不因能力位关闭而丢事实**（映射恒开）；settled detail 在计数 >0 时附 `searchCalls: n`。
- `test/codex-adapter/fixtures.ts`：FakeEngine `config/read` 回读从 `-c web_search="…"` 覆盖回显（缺省仍逐字节 `disabled`）；新增 `webSearchReadback` 行为（模拟 requirements 压回）；新增 `webSearch(item)`/`event(method, item)` 发射器。
- `test/codex-adapter/fixtures/native-cli.mjs`：`config/read` 回读按同一规则从 argv 回显（默认路径不变）。
- `test/codex-adapter/web-search.test.ts`（新）：8 项测试（见下）。

不改动（明确保持）：`turn/start` 的 `sandboxPolicy {type:"readOnly", networkAccess:false}`（服务端工具由网关执行，本地沙箱不需要网络）；`config.redact` 脱敏管线与 URL 保守裁剪；错误脱敏、只读沙箱、native features 全禁用；依赖/lockfile/其他角色文件。

## T3/T4 实证结论（本机、pinned CLI 0.162.1、本地假 Responses SSE、外部模型 0）

**T4 离线 oracle**（`codex app-server generate-json-schema` / `generate-ts`，离线、无模型；全量产物裁剪后保留关键定义原样摘录 `oracle-defs.json`，回答提案待确认 3/4/6）：
- `ThreadItem` 含 `{type:"webSearch"} & WebSearchItem`；`WebSearchItem = {id: string, query: string, action: WebSearchAction|null, results: Array<JsonValue>|null}`；`results` 为**不透明 JSON**（schema 原文：standalone 搜索的回填，"stay as opaque JSON at the extension/app-server boundary"）。
- `WebSearchAction`（app-server 侧 camelCase）：`{type:"search", query: string|null, queries: string[]|null} | {type:"openPage", url} | {type:"findInPage", url, pattern} | {type:"other"}`。Responses 线侧同族为 snake_case（`open_page`/`find_in_page`），两套序列化各归一侧。
- `Config.web_search: WebSearchMode|null`、`Config.tools: ToolsV2{web_search: WebSearchToolConfig|null}`；通知载体 `ItemStartedNotification`/`ItemCompletedNotification`（`{item, threadId, turnId, startedAtMs/completedAtMs}`）。

**T3 开关矩阵**（`t3-key-matrix.probe.mjs`，5 格，回答待确认 1/2/6——**键形态结论**）：`web_search="live"`（**顶层键**，进程 `-c` 与 thread config 双落点）即注入键——出站 Responses 请求 `tools` 数组新增 `{"type":"web_search","external_web_access":true}`；`[tools].web_search=true` 单开**不注入**（与 off 基线出站逐字段同形；config/read 回读归一为 `tools:{web_search:null}`）；双开与单开顶层键无差别；自定义 provider **无需**追加能力声明（`capabilities={external_web_access=true}` 格与无能力格无差别）。回读形态：`config.web_search` 精确回显 `"live"`/`"disabled"`——pin3 只断言顶层键，不依赖 tools 键形态。

**T3②/③**（`t3-item-notification.probe.mjs`，2 格）：SSE 返回 `web_search_call` item 时 app-server 发 `item/started` + `item/completed`，载荷实测 `{"type":"webSearch","id":"ws_probe_1","query":"…","action":{"type":"search","query":"…","queries":null},"results":null}`——**服务端内置工具路径 results 恒 null**（结果不边界回填，与 oracle 描述一致：results 属 standalone 路径）。`response.web_search_call.in_progress` 子帧**被 0.162.1 容忍**（turn 照常 completed，无 error 通知）。

**T3 端到端（适配器全链）**（`t3-adapter-mapping.probe.ts`）：真实适配器＋pinned CLI＋真实 MCP＋假 SSE（含子帧）→ 能力开，出站含 `web_search` 声明；行事件 `联网搜索：controlled probe query`，detail `{version:1, source:"web-search", itemId:"ws_probe_1", query:"controlled probe query", action:{type:"search"}}`；settled `{outcome:"completed", searchCalls:1}`；轮次 completed，无隔离。

## 行/事件契约（v1，detail 只外推真实字段，缺即是缺）

- 行：`kind:"message"`；摘要 `联网搜索：<query>`（缺/空 query → `联网搜索`）。一次 item 一行；`item/started` 不接（v1 最小面，防流噪声）。
- detail v1：`{version:1, source:"web-search", itemId?, query?, action?:{type, url?, pattern?, queries?}, results?:[{title?, url?}…], resultsTruncated?:true}`。action 的 `query` 字段实测存在但按批准 v1 模板不投影（与顶层 query 冗余）；`results` 元素不透明——只取字符串 `title`/`url`，其余字段与非法元素以 `{}` 占位保序不补造；列表上界 20，超出置 `resultsTruncated:true`。
- 容错：缺字段/未知 action/action 或 results 非法 → 保底行照发，绝不抛、绝不隔离（非禁工具）、不毁轮次。
- 脱敏：行走既有 `emit`（summary redact＋detail 递归 scrub）；URL 剥 query string 保留路径（如 `https://example.test/search?q=…` → `https://example.test/search`）——与全仓现状一致的保守行为，query 串**不进**诊断落盘（failures/错误文案不含 query）。
- 计量：`settled.detail.searchCalls` 仅在本轮 webSearch item 计数 >0 时出现；0 次时 settled detail 与改动前逐字段一致。是否入 UI/计费面属 PM 归属（本角色只如实计数）。

## 验证

- `node --test test/codex-adapter/*.test.ts`：**33/33 通过，0 skip**（原 25 全绿保留＋新 8：能力解析白名单与非法拒、options 优先级、三钉逐字节/同翻、回读不符双向 fail-closed、映射行形状与身份（真实 T3② 载荷）、容错与截断、非隔离＋item/started 不接、脱敏与 URL 保守、真实原生进程 fixture 开着态全链）。日志 `tests.txt`。
- `npm run typecheck`：**exit 0**（0 处错误）。日志 `typecheck.txt`。注：实施中途并行在飞的他方文件（test/claude-adapter/*）曾短暂报 3 处 tsc 错误，由该 owner 自行修复后复跑 0；本角色文件始终 0 处。
- 全量 `node --test "test/**/*.test.ts"`：**1722 tests / 1721 pass / 0 fail / 1 skip（外部既有 skip）**，exit 0——0 新红。日志摘要 `full-tests.txt`。
- 回环探针（真实 pinned CLI 0.162.1，外部模型调用 0，凭据假值）：矩阵 `t3-key-matrix.summary.txt`（全量 JSON `t3-key-matrix.raw.json`）、item 通知 `t3-item-notification.raw.json`、端到端 `t3-adapter-mapping.txt`。
- 文件哈希清单 `manifest.json`（生产 3＋测试 3＋证据 13）。

## 客户自跑探针清单（P1–P3，网关 Responses 侧；输出只留状态码/事件名/布尔，不贴 key 与响应正文）

1. **P1（声明可接受性）**：POST `<网关>/v1/responses`，最小流式请求＋`tools:[{"type":"web_search"}]`（模型、一条会诱发搜索的提问）。只记录：HTTP 状态码；SSE 事件**类型名清单**（尤其是否出现 `response.web_search_call.*` 子事件）；`response.completed` 的 output 是否含 `web_search_call` item 及其 `action.type`/`status`；`usage` 顶层键名。
2. **P2（隔离对照）**：同请求去掉 tools 声明重发。P1 败而 P2 成 → 归因钉在工具声明；两者皆败 → 先查网关 Responses 兼容层本身。
3. **P3（声明形态矩阵）**：`{"type":"web_search"}` × 带 `search_context_size`/`filters`/`user_location` 字段（0.162.1 实际只发 `{"type":"web_search","external_web_access":true}`，见 T3）；观察拒绝是硬 4xx 还是字段被忽略。
- 判读与后续：P1 绿 → 可置 `ANS_CODEX_WEB_SEARCH=on`（或 options）做真机验收；P1 红 → 保持 off 如实降级，不硬接。开启后网关拒声明＝请求失败 → 轮次如实 `failed`＋原因文案（既有路径，本版不加自动剥离/重试，属后置优化）。
- 真机验收点：置 on 后跑诱发搜索的一轮 → 出现一行 `联网搜索：…`（本适配器行已证）；折叠/展开呈现与引用区样式属桌面UI 边界（见下）；另跑一格网关拒绝场景确认轮次如实 failed 不可救。

## 跨边界（回交 PM 路由）

- **桌面UI/UIUX**：搜索行渲染（按批准⑤行样式＝message 行＋结构化 detail；本适配器已给 `detail.source:"web-search"` 与 query/action/results 事实面；`detail.results` 在服务端路径实测恒缺——UI 不应假设有结果区）。
- **运行时核心（R2，可选）**：`RuntimeProviderOptions.webSearch?: boolean` 升格——适配器已接受该字段（`CodexRuntimeAdapterOptions.webSearch`），Core 声明同名透传即生效，适配器无需再改；env 键的用户可见设置项元数据（runtime-settings）属项目管理/UI 边界。
- **计量/UI**：`settled.searchCalls` 是否上 UI/计费面待 PM 裁定（当前仅事件事实）。

## 未验边界（如实）

- 真实网关 Responses 端点对 `web_search` 声明的**接受与执行**未验（本机全部以假 SSE 回环；客户探针 P1–P3 为准）。
- 在线模型与真实凭据未验；真机验收（测试角色）未做。
- T3③ 仅实测一帧 `in_progress` 子事件形态的容忍；其他未知子事件形态未穷举。
- Windows 未动态验证（沿用既有边界）；`[tools].web_search` 在回读中归一为 `null` 的解释（解析层）以 oracle/矩阵观察为准，不影响本版落点（不用该键）。

（2026-10-16 实施轮：零 git 提交；未触碰 app/renderer、/private/tmp 轮次目录与他方在飞文件。）
