---
id: claude-mcp-surface-probe
type: fix
title: Claude 路径 V2 MCP P0 探针——options.mcpServers 注入面逐项定格（评估轮）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: probe-only（零产品改动；未 git 提交）
related: [role-mcp-install-assessment, claude-session, claude-web-search-implementation]
---

# Claude 路径 V2 MCP P0 探针（评估轮，§九.1 逐项定格）

客户 2026-10-16 批准 G-4 V2 口径与 P0 探针轮；本记录按运行时核心评估 [`2026-10-16_assess_role-mcp-install.md`](../../../运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md) §九.1 逐项定格，沿 G-3 loopback 探针先例（[实施记录](2026-10-16_impl_web-search.md)）：**真 bundled CLI ＋ 127.0.0.1 假网关 ＋ 本地 stdio 假 MCP server（scratch 夹具，不入产品路径）**。**零产品改动、零真实网关请求、未 git 提交**；探针文件为本角色测试面新增（`.probe.ts`，不进 `*.test.ts` 全量）。

## 一、方法与环境

- 环境：Node v24.14.0、Darwin 25.6.0（arm64）；`@anthropic-ai/claude-agent-sdk` 0.3.299、bundled CLI **2.1.299**（`claude --version` 实测）；假凭据 + 假网关（`ANTHROPIC_BASE_URL` 指 127.0.0.1 临时端口，每个请求断言 `x-api-key`＝假值与来源地址）。
- 组成：经 `createRuntimeAdapter → createClaudeRuntimeAdapter` **生产装配**起会话，仅在三处做探针包裹（`loadSdk` 内对最终 `SDK.query` options 包装）：①观察/按相位改写 PreToolUse 输出；②观察/按相位改写 `canUseTool`；③注入 `mcpServers: { ...生产, probe: <假 server 配置> }`（这正是 P1 的注入通道。生产 hook、schema、消息泵逐字在跑）。
- 假 MCP server（`test/claude-adapter/mcp-fake-stdio-server.probe.ts`）：极简 stdio JSON-RPC（`initialize`/`tools/list`/`tools/call`/`ping`），单工具 `echo`；可配 initialize 延迟/永不答；落 `spawn.json`（**仅 env 键名、绝不落值**）与 `events.jsonl`。工具名＝`mcp__probe__echo`。
- 14 相位（每相位起独立适配器实例）：`baseline-connected`、`tool-call-production-hook`、`hook-allow-canuse-delegate`、`hook-allow-canuse-allow`、`alwaysload-delay3s`、`default-delay3s`、`broken-command`、`allowedtools-server-level`、`allowedtools-tool-level`、`allowedtools-absent`（负对照）、`alwaysload-hang`、`default-hang`、`alwaysload-hang-no-ab`/`default-hang-no-ab`（后两相位另揿掉 `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`）。全部相位 settled＝completed、零相位错误、零清理竞态。
- 证据目录：[2026-10-16-mcp-surface-evidence](2026-10-16-mcp-surface-evidence/)（`probe-mcp-surface.json` 全量报告、`probe-stderr.txt`、`unit-claude-adapter.txt`、`typecheck.txt`、`full-suite.txt`、`diff-check.txt`）。
  - 验证快照：`test/claude-adapter/*.test.ts` **33/33**；全量 `node --test "test/**/*.test.ts"` **1814 计 / 1813 过 / 0 红 / 1 skip**（派发时登记的测试角色 4 处预期红在本快照**未复现**——其属主已同步，无需本角色处理）；`git diff --check` 干净；`typecheck.txt` 在捕获时为**跨边界红**（仅 `app/desktop/session.ts` 一处、属桌面角色在飞状态，两次捕获错误点变化即其编辑中；**本角色文件零错误**，随后复跑已归零——见 changelog 同日条）。

## 二、逐项结论（先列）

| # | 问题（§九.1） | 定格值 | 等级 |
| --- | --- | --- | --- |
| ① | CLI 是否 spawn 注入的 stdio server；子进程 env 是否＝MCP SDK 默认收窄 | **spawn＝是**（引擎启动期，首请求前 ~30ms）；**env 未收窄**——CLI 进程 env 全量继承（25 键，含 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`CLAUDE_CONFIG_DIR`、宿主 messaging socket/token）＋配置 `env` | **实测**（安全面反证，见 §三-①） |
| ② | PreToolUse 对 `mcp__<name>__<tool>` 是否分发；`mcp_server.source` 取值 | **分发＝是**（prompt_id 已绑、`tool_input` 原文到达）；**source＝`"dynamic"`**（name＝配置键名 `probe`） | **实测**（全部 6 个工具调用相位一致） |
| ③ | hook-allow 后 `canUseTool` 是否被咨询（放行是否需动 `:239` deny-all） | **不被咨询**——14 相位零咨询记录；hook 放行＋生产 deny-all 委托下工具照常执行 ⇒ **P1 放行不需要动 `:239`**（沿 WebSearch 先例同形，且从内置工具推广到进程型 MCP 工具成立） | **实测**（含负对照） |
| ④ | `mcpServerStatus()` 对起不来的 server 的条目形状 | spawn 失败：`{name, status:"failed", error:"ENOENT: … posix_spawn 'stdio'", config:{type,command,args}, scope:"dynamic", source:"dynamic"}`（无 serverInfo/tools）；挂起超时：同形、`error:"Request timed out"`；正常：＋`serverInfo`＋`tools:[{name,annotations}]`。**三种情形会话照开、轮次 completed**（不毁会话实证） | **实测** |
| ⑤ | `alwaysLoad` 与首轮等待 | **本组成下两种取值无可观测差异**：连接延迟 3s 时两者首请求都等 ~3.06-3.08s（连接完成后 ~60-70ms 发出，工具已在首轮声明）；永不答时两者都等 **~27.0-27.1s** 才发出首请求（工具缺席，CLI 对 initialize 发 `notifications/cancelled`）；揿 `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` 亦无差异。⇒ 首轮等待的约束是 **CLI 内部 ~27s 连接释放界**，非 `alwaysLoad`、非该 env | **实测**（与 SDK 文档注释「非阻塞为默认、alwaysLoad 阻塞 ≤5s」在本组成不一致，见 §三-⑤） |
| 补 | `allowedTools` 对外部 server 的条目形态（server 级 vs 工具级） | **两级均自动放行**（hook 弃权下 `"mcp__probe"` 与 `"mcp__probe__echo"` 均直接执行、不经 canUseTool；SDK 侧同步打 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告点名两级条目）；两者都缺 → 落到 **auto 模式分类器**（额外模型调用），本夹具分类不可决 ⇒ CLI 以「auto mode cannot determine the safety」拒（canUseTool 仍未被咨询） | **实测** |

## 三、逐项证据摘要（原始数字）

### ① 注入与 spawn＋子进程 env（键名，绝不落值）

- spawn 发生在**引擎启动期**（`startEngine → sdk.query` 即起，早于第一条用户输入处理）——快相位实测 spawn→首请求 31-34ms；`broken-command`（命令不存在）无 spawn（`spawn.json` 不存在）——spawn 由 CLI 负责、ANS 侧不感知进程。
- 假 server 落盘 `spawn.json.argv/cwd/pid/ppid`（证据 JSON 内各相位 `spawn` 字段）。
- **子进程 env 实测键名（25 键，全部相位一致）**：`AI_AGENT`、`ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`CLAUDECODE`、`CLAUDE_AGENT_SDK_VERSION`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`CLAUDE_CODE_ENTRYPOINT`、`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`、`CLAUDE_CODE_MESSAGING_SOCKET`、`CLAUDE_CODE_MESSAGING_TOKEN`、`CLAUDE_CODE_SESSION_ID`、`CLAUDE_CONFIG_DIR`、`CLAUDE_PROJECT_DIR`、`COREPACK_ENABLE_AUTO_PIN`、`DISABLE_AUTOUPDATER`、`DISABLE_ERROR_REPORTING`、`DISABLE_TELEMETRY`、`FAKE_MCP_DELAY_MS`、`FAKE_MCP_MODE`、`FAKE_MCP_RECORD_DIR`、`HOME`、`NoDefaultCurrentDirectoryInExePath`、`PATH`、`TMPDIR`、`__CF_USER_TEXT_ENCODING`（FAKE_MCP_* 3 键＝本夹具注入的配置 env，验证配置 env 确会合入）。
- **§九.1 之问的答案：不是 MCP SDK 默认收窄**。评估文 §6.1 引的 MCP SDK `getDefaultEnvironment()`（HOME/LOGNAME/PATH/SHELL/TERM/USER）不是实际形态；实测＝**CLI 进程 env 的（近乎）全量继承**（含网关凭据 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL` 与宿主 messaging socket/token）。第三方 server 子进程直接可见这些**键**（值不在证据内、只验键名）。⇒ 评估文 §6.1-表「Claude 待探针」项定格为**未收窄**（此前推测的「若按 MCP SDK 收窄则 API key 不外泄」被反证）。
- 握手序列：`server/discover`（本夹具以 method-not-found 应答，CLI 容忍）→ `initialize` → `notifications/initialized` → `tools/list`。挂起时 CLI 在 ~27s 发 `notifications/cancelled` 放弃。

### ② PreToolUse 分发与 `mcp_server.source`

- 6 个相位（生产 deny / 两 hook-allow / 两 allowedTools / 负对照）各 1 次分发，记录逐字一致：`{tool:"mcp__probe__echo", promptBound:true, provenance:{name:"probe", source:"dynamic"}, inputKeys:["text"], productionDecision:"deny"}`。
- **source＝`"dynamic"`**（即 CLI 把 `options.mcpServers` 进程 server 归入 dynamic 配置作用域；与 `ans` 进程内 server 的 `"sdk"` 区分——生产判据若照抄 `source==="sdk"` 会**漏放行**，评估文 §2.3-① 的「不要照抄 source==="sdk"」警告被实测确认，具体值＝`dynamic`）。
- 生产 hook 现行为照实：`permissionDecision:"deny"`（reason「仅允许当前轮注册的 ANS MCP 工具」），CLI 对模型呈现为 tool_result 文本 `PreToolUse:mcp__probe__echo hook error: …`；同时生产事件面发一条 blocked 行（`denied/blocked/mcp__probe__echo`）。

### ③ hook-allow → canUseTool

- **全部 14 相位 `canUseToolRecords=[]`**（探针包裹若被调用必有记录）。
- `hook-allow-canuse-delegate`：hook 改为 allow（同 WebSearch 分支形态，不注 `updatedInput`）＋canUseTool **委托生产 deny-all** → 假 server 收到 `tools/call`（events.jsonl `tools-call-received`）、模型请求 2 携 `fake-echo:probe-input` 结果、settled completed。若 canUseTool 被咨询则必被 deny-all 拒——实测执行成功 ⇒ **不被咨询**。
- 负对照 `allowedtools-absent`（hook 弃权＋allowedTools 无该条目）：walk 到 CLI 的 **auto 权限模式分类器**（额外一次 `/v1/messages`、无工具声明），本夹具答不可决 → CLI 拒（文本「claude-sonnet-4-6 is temporarily unavailable, so auto mode cannot determine the safety of mcp__probe__echo…」），**canUseTool 仍未被咨询**。⇒ 在「hook / allowedTools / 分类器」都定不了时，咨询面是分类器而非 canUseTool（sdk.d.ts:1991-1995：未设 `permissionMode` 时 CLI 自选，'auto' 可用即为 'auto'；分类器不可决才「prompting through canUseTool」）。
- **对 P1 的落点结论**：放行分支做成后，`session.ts:239` 的 deny-all `canUseTool` **不需要动**（hook allow 短路一切后续许可面）。

### ④ `mcpServerStatus()` 条目形状（query.mcpServerStatus() 实测）

- 正常（进程型 stdio）：`{ name:"probe", status:"connected", serverInfo:{name,version}, config:{type:"stdio", command, args}, scope:"dynamic", source:"dynamic", tools:[{name:"echo", annotations:{}}] }`；`ans`（进程内 SDK server）：`{ … scope:"dynamic", source:"sdk", tools:[{name, annotations:{destructive:true}}] }`。
- spawn 失败：`{ name:"probe", status:"failed", error:"ENOENT: no such file or directory, posix_spawn 'stdio'", config:{…}, scope:"dynamic", source:"dynamic" }`（无 serverInfo/tools；args 归一为空数组）。
- initialize 挂起超时：同形，`error:"Request timed out"`。
- system/init 消息 `mcp_servers` 条目＝`{name, status}`（connected/failed），每次流式输入各发一次 init。
- 三情形（connected/failed×2）**会话照开、轮次 settled completed**——「server 起不来不毁会话」实测成立；`broken` 情形首轮不等待（spawn 即败，168ms 出请求）。

### ⑤ alwaysLoad 与首轮等待（含隔离对照）

- `delay3s`（initialize 延迟 3s，未超任何界）：`alwaysLoad:true` spawn→首请求 **3077ms**（initialize 应答@3007ms，应答后 ~70ms 出请求）；**无 alwaysLoad 3062ms**（应答@3005ms）——两者都在连接完成后才建首请求，且**首轮即声明 `mcp__probe__echo`**。
- `hang`（永不答 initialize）：`alwaysLoad:true` spawn→首请求 **27068ms**、无 alwaysLoad **27071ms**、揿掉 `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` 后 **27078/27071ms**——四者同界 **~27.0-27.1s**（CLI 对 initialize 发 `notifications/cancelled` 于 ~27006-27011ms），随后首请求**不带**该类工具，轮次照常 completed，status＝failed/Request timed out。
- ⇒ 在本组成下（生产 options ＋ ANS 的 env 组合），**首个模型请求一律等待 MCP 连接有结果**（成功→带工具；失败/超时→不带工具继续），`alwaysLoad` 与 `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` 都未产生可观测差异。SDK 类型注释（sdk.d.ts:1352-1359：「非阻塞为默认；alwaysLoad 阻塞至 ≤5s 连接超时」）中的「≤5s」与「非阻塞默认」在本组成未复现（可能前提是启用 tool search 等其它组合，未探）；**P0 如实登记：本组成以 ~27s 为界**。
- 对 P1/R6 的直接含义：挂装的 server「永不答 initialize」会给新引擎**首轮加 ~27s 静默等待**（非 5s）；这一窗口内会话不失败、之后如实降级（工具缺席＋status failed 可查）。派发/文案与轮级时限设计需把它计入（沿 §2.5 如实报告口径）。

### 补：allowedTools 条目形态（§九.1 末项）

- `allowedtools-server-level`（`allowedTools` 追加 `"mcp__probe"`）、`allowedtools-tool-level`（追加 `"mcp__probe__echo"`）：hook 弃权下两者都**直接执行**（tools/call 到达、结果回模型），canUseTool 零咨询；SDK 同步警告逐字「Bare allowedTools entries auto-approve the whole tool before the callback is consulted」并点名 `mcp__probe`／`mcp__probe__echo`。
- 负对照（都不加）→ 分类器路径被拒（见 ③）。⇒ 对外部 server **server 级与工具级两种写法均有效**；评估文 §2.3-② 的「条目形态待确认」定格为**两者皆可**（P1 建议按逐工具白名单登记，粒度更细）。

## 四、附带发现（如实登记，非本探针问题项）

1. **auto 权限模式分类器**：未设 `permissionMode` 时本 CLI（2.1.299）会话以 'auto' 起（sdk.d.ts:1991-1995 语义）；未被 hook/allowedTools 决定的调用会先经**模型分类器**（额外一次无工具声明的 `/v1/messages`）——即「未预批准的工具」在生产真网关下会多一次网关调用再定夺。P1 的 hook 分支覆盖全部 installed 工具名后该路径不再触发；但「未知外来工具」的兜底当前实际是「分类器→（不可决才）canUseTool→生产 deny-all」，文案与预算评估时勿按「直接 deny」表述。
2. **hook deny 的模型可见形态**：`PreToolUse:mcp__probe__echo hook error: <reason>`（tool_result 文本）——P1 若保留 `permissionDecisionReason` 文案，模型会读到它。
3. **tool_result 尾部 `<system-reminder>…</system-reminder>`**：本宿主集成下 CLI 会在工具结果尾部追加含 token 预算的 reminder（证据记录已截断 160 字符，正文不落文档）；非 MCP 面行为，登记备查。
4. 探针包裹物的观察副作用：`hook-allow-*`/`allowedtools-*` 相位里生产 hook 先按现状跑了（发 blocked 行）再被探针改写输出——**行记录里的 blocked 行是探针构造物**，P1 实地实现时该分支将改为发 native-start 行而非 blocked。
5. `server/discover`：CLI 在建连时先发该（较新 SEP 的）方法，夹具答 method-not-found 后照常走经典 `initialize`——第三方老 server 缺此方法不阻塞（本夹具即实证）。

## 五、未验边界（如实）

- **HTTP/SSE 型 server**（`type:"http"/"sse"`、headers/needs-auth 面）未探（本探针仅 stdio）；`needs-auth` 状态形状未定格。
- **`McpStdioServerConfig.timeout`（逐调用超时）**与挂起 server 的工具级行为未探（本轮只到建连面）。
- **tool search 启用**（`alwaysLoad` 的另一半语义「防被检索隐藏」）未探——生产现 `tools:[]` 无检索面，本探针未启用；「非阻塞默认」的文档语义未在其它组合下复验。
- **~27s 界的内部成因**（CLI 常量/重试构成）未定格，仅实测边界与取消报文；换 CLI 版本需复验。
- **Windows/多角色并发/长跑泄漏**（挂起 server 的子进程清理路径）未探；`dispose` 后假 server 均随 stdin 关闭退出（`stdin-closed` 事件），未见孤儿。
- 真网关下的分类器行为（④ 附带发现 1）未在真网关验证（P0 禁真实请求）。

## 六、边界声明

- 改动仅本角色边界：`test/claude-adapter/mcp-surface-loopback.probe.ts`（新增）、`test/claude-adapter/mcp-fake-stdio-server.probe.ts`（新增夹具）、本记录与 changelog/memo。**未碰** `src/` 任何生产文件（同轮「G-4 注入节拼接」的 `src/provider/claude/session.ts` 改动另记，不属本探针）、未碰其它角色文件与在飞文件。
- 零真实网关请求：全程 127.0.0.1 假网关（逐请求断言来源地址与假凭据）、假 token；子进程 env 证据只落**键名**，报告末尾断言全量 JSON 不含假凭据值。
- 未 git 提交；夹具与探针为 scratch 评估物，产品化（P1）时按需要重写为交付路径。
