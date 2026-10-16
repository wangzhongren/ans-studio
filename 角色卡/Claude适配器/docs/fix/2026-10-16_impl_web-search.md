---
id: claude-web-search-implementation
type: fix
title: Claude 路径联网搜索接入——实施记录（G-3）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待验证
related: [claude-session, claude-web-search-integration-proposal]
---

# Claude 路径联网搜索接入——实施记录（G-3）

客户已批准（2026-10-16「按推荐批准，开始实施」，裁定见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-3 客户批准与实施派发」）。实施严格按[批准提案](2026-10-16_proposal_web-search.md)落点，无范围外改动；仅本角色边界内文件（`src/provider/claude/session.ts`、`test/claude-adapter/`、本角色资料）。

## 实施内容

**能力位**：`ANS_CLAUDE_WEB_SEARCH`——未设/`0`/`off`/其他＝关（默认关，fail-closed），`1`/`on`（trim、大小写不敏感）＝开；构造期 env 快照读取（同 `ANS_CLAUDE_MODEL` 先例）。默认关时 `tools`/`allowedTools`/hooks/消息泵全部与现状逐字一致。

**三处落点（`src/provider/claude/session.ts`）**：

1. **可用性/预放行**：`tools: webSearchEnabled ? ["WebSearch"] : []`；`allowedTools` 追加 `"WebSearch"`（关时 `[...names]` 不变）。`canUseTool` 拒一切兜底不动。
2. **PreToolUse 放行分支**（必需项：hook deny 先于 allowedTools 判定）：能力位开 + `tool_name==="WebSearch"` + 无 `mcp_server` + 绑定轮次为当前活动轮 + 全部信号未中止 → `permissionDecision:"allow"`，**不注入 `updatedInput`**（模型原文 query 不改写、无 `__ans_call_context`）；未绑定/延后轮次与其他工具仍走原 deny 兜底与 blocked 事件。
3. **消息泵**：assistant 帧 `tool_use` 块（`block.name==="WebSearch"`，仅能力位开时）→ 记录 `tool_use_id → {turn, toolCallId}`（Engine 新增 `nativeCalls`，随 closeEngine/轮末清理）并发 `native-start`（`input:{rule:"none",args:原文输入}`）；新增 `message.type==="user"` 分支扫 `tool_result` 块 → 发 `native-result`（`native:{isError,content:[text|unsupported]}`，string/数组 content 都归一到文本行；失败如实 denied）。均只走工具事件通道，不发 assistant 文本行；assistant 其他 `tool_use` 块不消费。

## 验证范围与结果

环境 Node v24.14.0 / darwin arm64；SDK 0.3.299、bundled CLI 2.1.299、已装依赖。证据目录：[2026-10-16-web-search-evidence](2026-10-16-web-search-evidence/)。

- `node --test test/claude-adapter/*.test.ts`：**32/32 通过**（原 29 + 新 3）。新增：①关（未设/`0`/`off`）——`tools=[]`、allowedTools 不含 WebSearch、绑定轮次 WebSearch 仍 deny、同帧序列零 native 事件；②开——`tools=["WebSearch"]`、allowedTools 含 WebSearch、绑定轮次放行且无 `updatedInput`/`__ans_call_context`、未绑定/未知/跨轮延后/Bash/他源 WebSearch 仍 deny、`canUseTool` 仍 deny、ANS 工具分支不回退；③泵——4 轮合成帧：成功文本/网关错误（is_error 字符串 content）/非文本 content（unsupported-content 省略）/预算文案 各恰一条 start+result 配对（toolCallId=`turnId:tool_use_id`）、`ok/status/resultText/error` 如实、非 WebSearch 的 tool_use（Bash）不消费、四轮 settled 全 completed（is_error 不毁轮次）。
- `test/claude-adapter/web-search-loopback.probe.ts`（新增，真实 bundled CLI + 127.0.0.1 假 Messages，假凭据、零外部调用）：最终形态**连续 6/6 通过**（5 连跑 + 证据复跑；90s 界）。三相位证据：开-成功、开-侧查询 400、关-对照。见下方实测事实与 `probe-web-search-loopback.json`。
- `npm run typecheck`：exit 0（含新测试与 probe）。
- `git diff --check`：exit 0。
- 全量 `node --test "test/**/*.test.ts"`：**1714 计 / 1713 过 / 0 红 / 1 skip**、退出 0；实施前同树快照 1679 计 / 0 红——**0 新增红**（计数增量为并行角色在跑期间并入工作树的改动，非本角色）。

## 原生回环实测事实（bundled CLI 2.1.299）

- **侧查询形态**（§三/§七-② 封口）：`tools=[{type:"web_search_20250305", name:"web_search", max_uses:8}]`、`tool_choice:{type:"tool",name:"web_search"}`、单条 user「Perform a web search for the query: …」、**无 `anthropic-beta: web-search-2025-03-05`**（base-URL 路由，实测 beta 头只含 claude-code/interleaved-thinking 等既有项）；声明只出现在侧查询，主轮请求不带。
- **PreToolUse 对内置 WebSearch 确实分发**：开相位收到 1 次 `PreToolUse(tool_name="WebSearch", 绑定 prompt_id)`，新放行分支实际命中（decision=allow、updatedInput 未发出）——§七-② 结论成立：hook 分支是活路径，`allowedTools` 仅为后备。SDK 同时打印 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告（bare allowedTools 先于 canUseTool），与提案对 hook/权限次序的论断一致。
- **事件流**：开-成功——恰一对 start(tool_call)+result(accepted)，resultText 为 CLI 真实组装文本（`Web search results for query: "…"` + Links，fixture URL 保留）；init 目录含 `WebSearch`+`mcp__ans__native_probe`；settled completed。开-失败（侧查询 400）——result(denied, ok=false)，resultText/error=「API Error: 400 …」如实，settled 仍 completed（**不毁轮次实证**）。关-对照——无声明、无侧查询、catalog 无 WebSearch、零 WebSearch 事件、settled completed。
- **失败路径自动重试（如实登记）**：侧查询 400 后 CLI 自动重发一次（第二次 beta 去掉 `dangerous-tool-use-2026-09-03`），随后放弃并回 is_error tool_result。属 CLI 既有 beta-回退重试行为，非本特性引入；每会话搜索预算仍以 CLI 计。
- **清理竞态（跨边界发现，未处理）**：高 CLI 活动后 `session.dispose()` 删临时 native 目录偶发 `ENOTEMPTY`（12 轮 probe≈36 次 dispose 中 2 次；CLI 进程仍在 flush sessions 文件）。probe 以 catch 记录不掩蔽；属既有临时目录清理竞态、非本特性落点，未在本轮改动（登记待另行立项）。

## 未验边界（如实）

- **客户真网关 side-query 实测**：本轮未跑（无客户凭据/网关）；以真实网关跑下方探针为准。本地假服务器证明的是 CLI 形态与 ANS 链路，不替代网关兼容性结论。
- **桌面端呈现**：V1 最小口径（无契约变更）——行样式与既有工具行合流（toolName=`WebSearch`，桌面按通用工具行渲染；query 成功时在结果文本可见，被拒/失败行无 query 目标）。若需「query 目标」呈现或文案定稿，属桌面UI/运行时核心（`core-query-v1`）另行配合，未在本轮。
- **默认取值**：发布默认仍关；翻开裁定待客户探针结论。
- **设置面板字段/预算 env 透传/逐次计量**：均未做（提案 §七 期 2 与待裁定点，未获批准变动）。

## 客户自跑探针清单（side-query 形态，口径同提案 §三.2）

不代跑；读应用实际 `.env`（开发＝库根；打包＝userData），只读不打印 `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`ANS_CLAUDE_MODEL` 值。独立目录一个 Node 脚本（不进本仓、不经 ANS 代码），`import` 应用 `node_modules` 的 `@anthropic-ai/claude-agent-sdk`；`query()` 单次 prompt（例：「搜索今天的日期，给出一个来源链接」），options 最小面：`cwd=空临时目录`、`tools:["WebSearch"]`、`allowedTools:["WebSearch"]`、`settingSources:[]`、`env` 只放 PATH/HOME/临时目录+两凭据、不注入 ANS hooks。逐条打印布尔/计数：①init 目录含 `"WebSearch"`；②流内 assistant `tool_use(WebSearch)` 与其后 `tool_result` 的 `is_error`/文本（含 `Web search results for query` 或如实错误）；③result 帧 subtype 是否 success（失败不毁轮次）；④请求计数与耗时、HTTP 4xx/5xx 状态码与脱敏错误文案。两种预期：全绿＝网关支持、可议默认开；`tool_result.is_error=true` 但 `result.success`＝网关不认，搜索不可用但如实降级成立。不得输出：密钥、鉴权头、完整请求体、完整 URL、搜索结果全文。
