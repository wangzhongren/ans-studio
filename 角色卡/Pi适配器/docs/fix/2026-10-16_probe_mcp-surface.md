---
id: pi-probe-mcp-surface
type: probe
title: V2 MCP P0 探针（Pi 侧）——bindExtensions／判据草案／startupWaitMs／env 收窄／HTTP 面 逐项定格
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: probe-complete
related: [role-mcp-install, pi-server-side-tools]
---

# V2 MCP P0 探针（Pi 侧）——逐项定格（客户 2026-10-16 批准的 P0 探针轮）

**状态：探针完成。** 依据＝运行时核心评估 `角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md` §九.3（客户批准 P0 探针轮）。本轮**只写 scratch 探针脚本（本角色 test 目录，非产品路径）＋本记录/证据**；**未改任何产品代码**（本任务接线改动见 changelog，与 MCP 无交集）；**未发任何真实网关请求**（faux 模型在进程内）；未 git 提交。

**探针脚本（scratch，`test/**/*.test.ts` glob 不选中）**：
- `test/pi-adapter/mcp-surface.probe.ts` — 驱动（A–E 五段；`node test/pi-adapter/mcp-surface.probe.ts [OUTDIR]`；scratch 全落系统临时目录并于结尾自清、`PI_CODING_AGENT_DIR` 覆盖到 scratch ⇒ 全程不碰真实 `~/.pi`、不碰网关）。
- `test/pi-adapter/mcp-probe-server.probe.ts` — 最小 stdio MCP server 夹具（JSON-RPC 逐行；`--dump-env` 只写 **env 键名**、`--call-log`、`--init-delay`、`--tools`）。

**证据目录**：`docs/fix/2026-10-16_probe_mcp-surface-evidence/`（`driver-output.txt` 全文 32/32 PASS；`probe-result.json` 结构化结果；`env-self-held*.json`／`env-default-transport.json` 子进程 env 键名清单；`calls-*.log` 服务端收到的调用单）。

## 〇、结论摘要（逐项）

| # | 探针项（§九.3） | 定格结论 |
|---|---|---|
| ① | `bindExtensions` 引入后 MCP 接通、工具可达面、治理扩展行为 | **接通成立**：bindExtensions 发射 session_start ⇒ MCP 扩展 loadConfig 并后台建连；direct 工具进入「声明面＋可被工具调用面」（`getActiveToolNames`/`getCallableToolNames` 同见 `mcp__probe_a__echo,pid`）。**治理回归钉住**：settled 恰 1/轮（A 段 2 轮＝映射面；B 段 4 轮＝原生＋映射双面）、门禁拒绝路径逐字、server-tools 观测（注册面＋合成观测＋声明注入）均在 bindExtensions 在链情况下行为不变。**新发现（V2 必读）**：`session.dispose()` **不触发** session_shutdown ⇒ 直接 dispose 后 MCP 子进程存活；补发 `extensionRunner.emit({type:"session_shutdown",reason:"quit"})` 后子进程退出（见 §一.4）。 |
| ② | direct 曝光下 1128 校验与门禁的放行判据（前缀模式） | **现状口径实锤拒真**：快照集（注入名）会把 MCP 工具视作「非注入」——1128 形态会 throw（快照实测 `["mcp__probe_b__echo","stray_tool"]`）、499-504 门禁实测拒绝 `mcp__probe_a__echo`（执行前阻断、服务端零调用）。**前缀判据草案**（§二）在实测名上全数命中、边界负例全数拒绝、端到端放行。名字形态实测：`mcp__<清洗后 server>__<清洗后 tool>`（非字母数字下划线→`_`；超长/同名冲突走 `_<sha256前8>` 缩短路径，前缀仍完整）。 |
| ③ | `startupWaitMs` 对首轮时延 | **实测**：slow server（initialize 延迟 3000ms）＋`startupWaitMs=800` ⇒ 首轮 806ms（被钳）；次轮 2ms（等待只发生一次）；后台 3080ms 接通后工具动态出现、第三轮 4ms 正常。`startupWaitMs=0` ⇒ 首轮 3ms 不等。无 MCP baseline 3ms（§三表）。 |
| ④ | `createTransport` 自持 `StdioTransport({inheritEnv:false,env:最小集})` | **收窄成立**：子进程 env 键＝自持 3 键（`PATH`/`PROBE_ENV_DUMP`/`PROBE_MARKER`）＋ **1 个平台注入键**（macOS `__CF_USER_TEXT_ENCODING`——`env -i` 下亦可见，与 transport 无关，如实登记）；宿主哨兵键未泄漏。**对照组（默认 transport）实锤泄漏**：子进程 env 键 ⊇ 宿主全量（91 vs 宿主 90 键；plant 的哨兵键出现在第三方 server 环境里）。 |
| ⑤ | HTTP 路径等价环境面 | **环回实测接通**（`StreamableHttpTransport` 在宿主进程内 fetch，**结构性无子进程**；本探针 server 即驱动进程，pid 同体）；header `${VAR}` **逐键**自 `process.env` 解析（实测 `X-Probe-Token` 以声明引用形式到达）。风险面与 stdio 不同：无 env 继承面，但有出站网络面、header 引用读面、OAuth 面（未接，§五）。 |

## 一、① bindExtensions：接通与治理回归（A/B 段）

### 1.1 接通机制（实测链）

- 生产适配器真实路径（A 段；仅经测试接缝 `dependencies.loadPi` 在**运行期**给 `DefaultResourceLoader` 追加 MCP 扩展——产品文件零改动）：`bindRole` 后活动工具＝仅注入（`edit_file/read_file/write_file`，与既有 1128 一致通过）；补调 `session.bindExtensions({})` 后 ⇒ 扩展的 `session_start` 处理器执行 `loadConfig(ctx)` 并后台建连；数十至数百毫秒级后 `getActiveToolNames()` 变为 `[edit_file, mcp__probe_a__echo, mcp__probe_a__pid, read_file, write_file]`——direct 工具**同时**进入声明面与「可被工具调用面」（`getCallableToolNames` 同集）；无 codemode/tool_search/资源类工具自动激活（direct-only 配置）。
- 服务端证据：夹具 server 进程被真实拉起（dump 文件含其 pid/ppid），`tools/call` 到达（B 段 call-log `echo …`），结果进入转录（`role=toolResult` 内容 `{"echo":{...}}`）。
- 名字形态（实测）：server 名 `probe-a` ⇒ 工具名 `mcp__probe_a__echo`（`-`→`_`）；`probe-srv.v2` ⇒ `mcp__probe_srv_v2__*`（`.`→`_`）；超长名 ⇒ `mcp__probe_srv_v2__tool_name_that_is_quite_long_indeed__731aa8e9`（前缀完整，`_<hash8>` 缩短在后部）。

### 1.2 治理回归（bindExtensions 为既有链路新触点）

- **settled 单点**：B 段 4 轮实测「原生 `agent_settled` 计数 = 1/轮 ∧ 经 `wireSettledOnce` 映射的 settled 事件 = 1/轮」双面同表（`probe-result.json.b.perTurnSettled`）；A 段 2 轮（生产适配器链）映射面 = 1/轮、outcome 均 completed。bindExtensions 不新增任何 settled/终态发射（既有结论不变：治理扩展无 `session_start` 处理器，扩展 handler 键清单在 bind 前后逐字不变）。
- **门禁**：①现状口径 499-504 对 MCP 直连工具的拒绝路径实测（拒绝行＝`非注入的 ANS 工具，拒绝执行：mcp__probe_a__echo`；理由经 `createErrorToolResult` 进转录；服务端 call-log 为空 ⇒ 执行前阻断）；②前缀面模拟下 `stray_tool`（注册了但面外）仍被同一分支拒绝且未执行；③注入 handler 层写门禁照旧：允许写落盘（`src/ok.ts`）、越界写拒绝（`不在允许写集内`，未落盘）。
- **server-tools 观测**：治理扩展 handler 键＝`[before_provider_request, message_end, provider_stream_event, session_before_compact, session_compact, session_compact_failed, tool_call, tool_execution_end, tool_execution_start]`（与 G-3 实施面一致）；以注册 handler 合成驱动——`provider_stream_event`（anthropic-messages 原始事件 `content_block_start/server_tool_use`）⇒ 观测行「模型请求调用 web_search（服务端工具）」；`before_provider_request` ⇒ 声明注入改动 payload（`{"tools":[{"type":"web_search_20250305",…}]}`）。faux 不产生真实的 `provider_stream_event`（如实登记：观测链路端到端仍以既有 server-tools 套件＋本合成面为证）。

### 1.3 交互面备注

bindExtensions 的 `reportUnhandledMcpServers()` 在 MCP 扩展在场时早退（`hasHandlers("mcp_servers_change")`），无输出污染；`extendResourcesFromExtensions` 无 handler ⇒ no-op。headless 下扩展的 UI 通知为 no-op（无 UI 上下文传入）——未观察到任何多余 stdout/事件行。

### 1.4 新发现：dispose 不收回 MCP 子进程（V2 收口必读）

实测：`session.dispose()` 后子进程**存活**（A/B 两处复现）；补发 `session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" })` 后子进程退出（≤5s 内，A/B 均真）。根因（dist 只读核实）：`session_shutdown` 由 **AgentSessionRuntime**（print/rpc/tui 模式壳）发射（`agent-session-runtime.js:107/298`），本适配器直接持有 `AgentSession`（不经 Runtime）⇒ 现链路无任何发射点；`session.dispose()` 只 abort 轮次、invalidate 扩展并断开 agent。MCP 扩展的 `session_shutdown` 处理器才 `abort()` 会话级 controller 并 `close()` 全部连接（`extensions/mcp/index.js:1111-1118`）。StdioTransport 仅在**宿主进程退出**时以 exit-hook 兜底杀进程组（`pi-mcp/dist/transports/stdio.js:39-50`）——长驻宿主（桌面应用）里被 dispose 的会话会**留下子进程**直到应用退出。**V2 处置建议**（供实施轮裁定）：`makeRoleSession.dispose`（或 bindRole 收口）在 `session.dispose()` 前补 `emit({type:"session_shutdown",reason:"quit"})`（公共面，类型含于 `RunnerEmitEvent`，`{ }` 之外无需其它绑定）；或自持 transport 引用主动 close。两者均属本角色文件内改动。

## 二、② 放行判据草案（1128 与门禁 499-504 同判据）

### 2.1 现状 vs 草案（实测对照）

- 现状 1128 形态（快照集：`active.filter(n => !injected.has(n))`）在 bindExtensions 后实测残余 `["mcp__probe_b__echo","stray_tool"]` ⇒ **会误伤 MCP 工具**（这正是评估 §九.3 预判）。
- 现状门禁（499-504 快照 `allowedToolNames.has`）实测拒绝 MCP 直连工具（A 段）。
- 草案（前缀面）在同一实测名集上：`mcp__` 残余 = 0（`stray_tool` 系探针脚手架、真 V2 拼装不存在）；判据边界样例 6/6 符合（命中/空白名单/近似串 `mcp__probe_bx__`/异 server/注入名 `write_file`/未清洗原名 均按预期）。

### 2.2 判据草案（确切形态；两处共用）

```ts
// 组合面：精确注入名 ∪ 白名单 server 的 MCP 前缀。白名单 = 我方 loadConfig 返回的启用条目（单一来源）。
const MCP_TOOL_PREFIX = "mcp__";
function mcpToolAllowedByWhitelistedServer(toolName: string, whitelistedServerNames: readonly string[]): boolean {
  if (!toolName.startsWith(MCP_TOOL_PREFIX)) return false;
  return whitelistedServerNames.some((server) => {
    // 与 SDK 同名清洗（dist/extensions/mcp/tools.js:46：`mcp__${server}__${tool}` 后 [^A-Za-z0-9_]→"_"）；
    // 清洗后名前缀匹配对「超长/冲突名走 _<hash8> 缩短路径」同样成立（前缀完整，§1.1 实测）。
    const sanitized = server.replace(/[^A-Za-z0-9_]/g, "_");
    return sanitized !== "" && toolName.startsWith(`${MCP_TOOL_PREFIX}${sanitized}__`);
  });
}
function buildAllowedToolSurface(injected: ReadonlySet<string>, whitelistedServers: readonly string[]) {
  return (name: string): boolean => injected.has(name) || mcpToolAllowedByWhitelistedServer(name, whitelistedServers);
}
```

- **1128（构造校验）**：`session.getActiveToolNames().filter((n) => !surface(n))` 必须为空（在 bindExtensions/连接等待点之后执行；空即通过）。语义＝**走私检测兜底**——只抓「既非注入、又非白名单 MCP」的名字；MCP 工具不再误伤，其它扩展偷加的工具照旧即抛。
- **门禁（499-504）**：`if (surface(event.toolName)) return undefined;` 否则 block（现文案与 `blocked()` 路径逐字保留）。**每调用执行前**拦截，是运行期的**唯一活口闸**（1128 是构造期快照；MCP 工具可能在会话中途连接后出现——见 2.3）。
- **`shellArmed` 判据保持读注入集**（`allowedSurface` 与「run_shell 是否注入」解耦；`allowedToolNames.has("run_shell")` 原口径不变，勿从组合面推）。

### 2.3 为何前缀而非快照枚举（本轮新增静态闭环）

- 枚举（tools/list 快照）拿不到「调用发生那一刻」的面：连接异步、可重连、server 可增删工具（SDK 侧对消失工具以 hidden 重注册、对新工具按曝光注册，`extensions/mcp/index.js:284-352`）；前缀面是**配置派生**、O(1)、与会话内动态完全解耦。
- **中途声明面变化的网关风险已静态闭环**：本仓 compat 收窄（`supportsMidConvoToolChanges:false`，`real-adapter.ts:145-152`）⇒ pi-ai 走 `params.tools = convertTools(getCurrentTools(messages))` 普通路径（`pi-ai/dist/api/anthropic-messages.js:920-929`）——**每次请求整份当前 tools 列表**、**绝不生成 `tool_addition/tool_removal` 块**（该块仅在 nativeToolChanges=true 时生成，同文件 :866-870/:1035-1040）。MCP direct 工具中途连接 = 下一请求 tools 多几项（既有网关形态，无未知变体风险）。
- **恢复路径安全**：Pi 会话 JSONL 的工具变化记录为 system 消息上的 `toolsAdded/toolsRemoved` **元数据**（非字面块，`agent-session.js:1333+`）⇒ 本仓恢复防护 `sessionFileHasForeignToolChangeBlocks` 不误跳（只认字面块）；`_restoreToolsFromTranscript`（`agent-session.js:1368-1378`）恢复的是「转录名 ∩ 已注册」——构造时 MCP 尚未连接 ⇒ 1128 构造期检查天然只见过注入名（不误伤、不放过）。

### 2.4 判据边界与残余（如实）

1. **白名单=启用条目**：`disabled` 的 server 不进白名单；其工具即便残留注册（hidden）也不会被门禁放行。
2. **清洗碰撞**：两个配置 server 名清洗后相同（如 `a.b` 与 `a_b`）⇒ 前缀无法区分（并入对方前缀）；V2 配置侧可对「清洗后重名」直接拒绝（一行校验），本轮未实现。
3. **资源工具族**：direct server **若提供 resources**，SDK 会以最宽曝光激活 `list_mcp_resources`／`list_mcp_resource_templates`／`read_mcp_resource`（`extensions/mcp/index.js:363-389`）——三名字**不带 `mcp__` 前缀**，草案面未含。探针夹具未提供 resources ⇒ **未实测**。V1 二选一：白名单面加入这三名（当任意白名单 server 可能带 resources），或 V1 只接「tools-only」声明范围并文档化限制。
4. **codemode/deferred 曝光**不在 V1（direct only）；若他日开，`codemode`/`tool_search` 名会进活动面，需同步扩判据（本轮 direct-only 实测无此类激活）。
5. 前缀判据依赖 SDK 清洗公式（`tools.js:46`）——已在探针内以实测名回归（B2）；SDK 升级若改公式，该实测即红。

## 三、③ startupWaitMs 首轮时延实测（C 段）

| 组 | 配置 | 首轮 | 次轮 | 接通时刻（bind 后） | 接通后轮 |
|---|---|---|---|---|---|
| baseline | 无 MCP server | 3 ms | — | — | — |
| fast | 正常 server，默认 `startupWaitMs=10000` | 69 ms（首轮后已接通） | 1 ms | ≤69 ms | — |
| slow+800 | initialize 延迟 3000ms，`startupWaitMs=800` | **806 ms**（被钳） | 2 ms | 3080 ms（后台继续） | 4 ms（工具已动态出现） |
| slow+0 | initialize 延迟 3000ms，`startupWaitMs=0` | 3 ms（不等） | — | — | — |

语义确认（dist 只读＋实测一致）：等待**只发生在建连未完成的 direct server 上**、**只在首个 prompt**（`waitedForStartup` 一次性）；超时**不报错**、工具在连接完成后动态出现；之后调用该 server 的工具时由每个 `tool_call` 的就绪钩子按需等待其 server（`extensions/mcp/index.js:1011-1033`；本轮未单独用时延钉这条，属未定格项 §六）。

## 四、④ 环境收窄实测（D 段；只记键名）

- **自持对照**（`createTransport: (entry,cwd) => new StdioTransport({command,args,cwd,env,inheritEnv:false})`）实测子进程 env 键：`["PATH","PROBE_ENV_DUMP","PROBE_MARKER","__CF_USER_TEXT_ENCODING"]`。**平台注入键说明**：macOS 对任何子进程追加 `__CF_USER_TEXT_ENCODING`（`env -i node -e …` 实测该键在零 env 下仍出现——平台级、与 transport 无关，如实登记；收窄结论＝「自持集 ∪ 平台注入」成立，宿主其余键一律不在）。
- **哨兵不泄漏**：plant `ANS_PROBE_GATEWAY_SENTINEL` 于宿主 env ⇒ 自持子进程键集**不含**该键。
- **默认 transport 对照（实锤默认不安全）**：不给 `createTransport` ⇒ SDK 默认（`extensions/mcp/runtime.js:56-73`，`StdioTransport` 无 `inheritEnv:false`）⇒ 子进程 env = `{...process.env, ...配置 env}`：实测子进程 91 键 ⊇ 宿主 90 键，**哨兵键出现在第三方 server 环境**。与评估 §三 结论一致；**V2 必须自持 transport**（本探针的自持工厂形状可直接采用）。
- 最小集建议（实测可跑通）：`PATH`（server 自身/其子命令用；命令解析由 cross-spawn 在宿主侧完成，但 server 侧仍需要）+ 配置中声明的引用键（`${NAME}` 类需 V2 显式决议：若自持工厂执行引用解析，等于宣告「这几个键允许外读」——白名单式，非全量）。本轮自持集 3 键已验证足够跑通最小 server。

## 五、⑤ HTTP server 路径（E 段；如实注明）

- **环回实测**：`type:"http"` server（`http://127.0.0.1:<随机端口>/mcp`）在 direct 曝光下接通（`mcp__probe_http__echo` 进入活动面）、`tools/call` 端到端结果进转录；请求面＝POST（initialize/notifications/initialized/tools/list/tools/call）+ GET 开流（本夹具以 **405** 关闭，客户端按「无 GET 流」处理，`streamable-http.d.ts` 语义吻合）；`Mcp-Session-Id` 未使用（夹具不发 ⇒ 客户端跳过 DELETE 收尾）。
- **无子进程**：结构性成立（`createDefaultTransport` 对 url 型建 `StreamableHttpTransport`，进程内 fetch）——本轮 server 本身在驱动进程内运行，pid 同体；与 stdio 的「子进程 env 继承面」对应物**不存在**。
- **等价风险面（不同）**：① 无 env 继承面，但有**出站网络面**（V1 若允许 http server，其 URL 即会话可发请求面）；② `headers` 值支持 `${VAR}`/`!cmd` 引用（`core/resolve-config-value.js`），**逐键**自 `process.env` 解析（实测 `X-Probe-Token: "${ANS_PROBE_HTTP_TOKEN}"` 以 plant 值到达）——与 stdio env 引用同族语义；③ OAuth：401 ⇒ needs-auth 状态（报一次），登录路径需 UI/浏览器与凭据存储——**V1 未接、未验**（登录/凭据落点决策归安装设计轮）。

## 六、未定格（如实登记）

1. **工具就绪按需等待的时延**（调用中途连接中 server 的工具时，`tool_call` 就绪钩子的等待时长/上限）——本轮只在连接完成后调用，未单独实测。
2. **真实第三方 server**（npx/uvx 包裹、多进程树、stderr 大流量、退出异常）行为——夹具为最小实现；POSIX 进程组关闭语义已由传输层测试覆盖面承担，**Windows（taskkill 路径）未验**。
3. **资源工具族**（见 §二.4.3）——未实测；V1 曝光范围需与安装设计裁定后一并定判据全集。
4. **多 server / 多角色并发**、**MCP 工具执行中 abort/超时语义**、**OAuth 登录/HTTP 出站策略**——未测（不属本 P0 清单）。
5. **`session_shutdown` 补发的完整副作用面**（除 MCP 收口外的其它扩展/资源收口）——本轮只观察到 MCP 子进程退出与无报错；V2 实施时随回归套件覆盖。

## 七、证据与复现

- 复现：仓库根 `node test/pi-adapter/mcp-surface.probe.ts [OUTDIR]`（纯本地；全程 faux＋本地夹具；结尾自清临时目录）。本轮全文输出：`docs/fix/2026-10-16_probe_mcp-surface-evidence/driver-output.txt`（**32/32 PASS，0 失败**）；结构化结果 `probe-result.json`；env 键名清单 `env-self-held.json`／`env-self-held-b.json`／`env-default-transport.json`；服务端调用单 `calls-a.log`（空＝被阻断）／`calls-b.log`（含 echo 一行）。
- 关键引用（dist 只读）：`extensions/mcp/index.js:968-1000`（session_start/loadConfig/建连）、`:1011-1033`（首轮等待）、`:284-352`（工具注册与曝光）、`:363-389`（资源工具族）、`:1111-1118`（session_shutdown 收口）；`core/agent-session.js:1333-1378`（工具变化元数据/恢复）、`:2598-2621`（bindExtensions）；`core/extensions/runner.js:80-88`（emitSessionShutdownEvent）、`:813-830`（emit）；`pi-mcp/dist/transports/stdio.js:75`（env 合并）、`:39-50`（exit-hook）；`pi-ai/dist/api/anthropic-messages.js:866-929/1035-1040`（nativeToolChanges 门控与普通 tools 路径）；`core/mcp-servers.d.ts`（曝光/工具名面）。

（本记录状态：**探针完成、零产品改动**。未 git 提交。回滚＝删除两个 `.probe.ts` 与本目录；对产品行为零影响。）
