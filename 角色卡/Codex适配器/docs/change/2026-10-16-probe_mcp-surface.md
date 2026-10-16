---
id: codex-mcp-surface-probe
type: change
title: Codex 面 MCP P0 探针——六项待确认逐项定格（G-4 V2 前置）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: probe-complete
related: [role-mcp-install-assessment, codex-web-search-change]
---

# Codex 面 MCP P0 探针：§九.2 六项逐项定格（离线；无生产改动、无真实网关、无提交）

对上：`角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md` §九.2（Codex 六项待确认）。本上下文＝Codex适配器 角色上下文（客户 2026-10-16 批准 G-4 V1＋V2 口径与 P0 探针轮）。**手段**：固定 codex 0.162.1 真 app-server 进程（`node_modules/@openai/codex`）＋本地夹具 MCP server（原始 JSON-RPC，无 SDK 依赖）＋本机 loopback 假 Responses SSE 端点（T3 先例）；**外部模型调用 0、凭据全假**；另用 `app-server generate-ts` 从同版本二进制导出协议 schema 作为静态定格（证据目录 `schema/`）。生产代码本批**零改动**（同批另一交付＝G-4 注入节拼接，见文末附录）。

**一句话总纲**：白名单化的三处「恰等」与降级口径在 0.162.1 上可成立，但探针新增两条关键约束——**①白名单 server 的工具要能被模型调用，必须同时配 `default_tools_approval_mode="approve"`（或逐工具 approval_mode），否则 `approval_policy:"never"` 下所有 MCP 工具调用被核内直接拒绝；②`-c` 根 map 连续多条同名根键＝后者整体覆盖不合并，whitelist 定义与 disabled 集必须编码进同一条 `mcp_servers={…}`。** 另有一条跨边界前置风险：0.162.1 给 Responses API 的 MCP 工具走 `type:"namespace"` 桥容器，上游（ANS 网关）须按 `name`＋`namespace` 对回传，真实网关接受性未验（禁真实网关）。

## ① `-c` 根 map 完整定义的 TOML 转义（args 数组/引号/空格）

**结论：全部定格，现状编码器（全字符串 `JSON.stringify`）逐字安全。**

- **实测（A 格）**：单条 `-c 'mcp_servers={"probe-surface"={command="…",args=[…8 项…],env={…},startup_timeout_sec=5,tool_timeout_sec=0.25}}'`（字符串全部经 `JSON.stringify`——与 `config.ts:73` 既有先例同法），`--strict-config` 接受；`config/read` 回读完整（引号/反斜杠/前后空格/双空格/中文全部原样）；夹具进程 `argv`（去 script 头 7 项）**逐字等于**注入 args 的后 7 项（含 ` value with leading space`、`quote"q`、`back\slash`、`中文值 空格`、`two  spaces`），`env` 两键值逐字到子进程（`PROBE_ENV_ONE="space value"`、`PROBE_ENV_TWO` 含引号反斜杠）。回读附带 codex 默认：`environment_id:"local"`、`enabled:true`、缺省 `args:[]`、缺省 `tool_timeout_sec:null`。
- **键名面（A2a 格）**：同一 map 内的 quoted key 含空格（`"probe surface"`）与内嵌引号（`"probe\"q"`）能解析并进入生效配置；空字符串 arg（`args:["","x"]`）保真。⇒ TOML 层不因这些字符丢条目。（**产品面纪律仍建议自设名称字符集校验**——见评估文 §5.2。）
- **⚠ 新发现（A2b 格）**：**连续两条 `-c mcp_servers={…}` ⇒ 后者整体覆盖前者（不合并）**。P2 编码器必须把「disabled 集＋白名单完整定义」合并进**一条** `mcp_servers={…}` 值（`safetyOverrides` 现只有一条 `mcp_servers=…`，扩白名单时在构造处合并即可，不要追加第二条）。
- 数字键直写（非字符串）：`startup_timeout_sec=5`、`tool_timeout_sec=0.25` 通过且回读为数字。

## ② 白名单 server 的工具调用 item 形状/状态字段与通知方法名

**结论：全部定格（活体实证）。**

- **模型面下发形状（B 格活体）**：0.162.1 对 `wire_api="responses"` 把每个 MCP server 的工具包成**一个 `type:"namespace"` 桥工具**：
  `{"type":"namespace","name":"mcp__probe_surface","description":"Tools in the mcp__probe_surface namespace.","tools":[{"type":"function","name":"echo_probe","description":"…","strict":false,"parameters":{…}}, …]}`
  ——server 名 `probe-surface` 被规范化为 `mcp__probe_surface`（`-`→`_`）；各工具是嵌套 function。模型回传调用＝**`function_call` 带 `namespace` 双字段**：`{"type":"function_call","name":"echo_probe","namespace":"mcp__probe_surface","arguments":"{…}","call_id":"…"}`（缺 `namespace` ⇒ 核内 `unsupported call: mcp__probe_surface`，B 格首轮实测）。
- **通知方法名**：轮内为通用 `item/started`／`item/completed`（信封 `{item, threadId, turnId, startedAtMs|completedAtMs}`），item 的 `type:"mcpToolCall"`；另有专用 `item/mcpToolCall/progress`（params `{threadId, turnId, itemId, message}`；schema 定格，夹具不发 progress ⇒ 未实触发）与 `mcpServer/startupStatus/updated`（见④）。
- **item 字段全集（活体逐字；schema `v2/ThreadItem.ts` 同形）**：
  `{type:"mcpToolCall", id:"<function_call id>", server:"probe-surface", tool:"echo_probe", status:"inProgress"|"completed"|"failed", arguments:{…}, appContext:null, mcpAppUi:null, pluginId:null, readOnlyHint:null, result:null|{content:[{type:"text",text:"echo:{…}"}],structuredContent:null,_meta:null}, error:null|{message:"…"}, durationMs:0}`
  ——`result.content` 为 MCP 原始 content blocks（**text 原样**，未包装/未改写）；成功态 `durationMs:0–1`（极快夹具）。
- **边界事实**：直呼 RPC `mcpServer/tool/call`（`{threadId,server,tool,arguments}`）**不产生任何 item/通知**（A 格 callNotices=[]）——item 生命周期只在**轮内**（模型驱动）产生。⇒ P2 的 item 映射补在 `item/completed` 分支（现 `:526-539` 只处理 agentMessage/webSearch，command/fileChange 走隔离，`mcpToolCall` 现在**完全不可见**）。

## ③ MCP 工具调用是否产生审批类 server request

**结论：ANS 姿态（`approvalPolicy:"never"`）下零 server request；但调用会被核内拒绝——白名单 server 必须配审批模式才可执行。非 ANS 姿态的审批通道被定格为既有 `mcpServer/elicitation/request`。**

- **默认姿态即拒绝（B 格）**：不配审批模式时，模型驱动的调用在**app-server 核内**被拒：`item/completed` `status:"failed"`、`error:{message:"MCP tool call requires approval, but approval policy is never"}`；同文案进入 `function_call_output` 回喂模型；turn 照常 completed；**无任何 server request**。
- **审批模式键与枚举（定格）**：server 级 `default_tools_approval_mode`（字符串键，随 root map 注入）；枚举＝**`auto`|`prompt`|`writes`|`approve`**（strict-config 错误文案逐字枚举；`never` 为非法值 ⇒ 进程拒启）。活体扫描（policy=never）：
  - `approve` ⇒ **调用可执行**：`item/completed` `status:"completed"`、`result.content[0].text` 回传、夹具进程收到 `{text:"from fake model"}`（B-mode-approve 格）。
  - `auto` / `writes` ⇒ 仍拒绝（同 `requires approval, but approval policy is never`）。
- **非 ANS 姿态对照（E 格，policy=on-request + mode=prompt；仅探针)**：审批请求到达客户端，方法＝**`mcpServer/elicitation/request`**（即 elicitation 通道复用，**不是**新方法）：`params {threadId, turnId, serverName:"probe-surface", mode:"form", _meta:{codex_approval_kind:"mcp_tool_call", tool_description, tool_params, tool_params_display}, message:"Allow the probe-surface MCP server to run tool \"echo_probe\"?", requestedSchema:{…}}`。既有 handler（`session.ts:395` 答 `{action:"cancel"}`）⇒ item error `"user cancelled MCP tool call"`（核内文案）。**ServerRequest 全集（schema）中没有独立的 MCP 审批方法**——ANS 姿态下也不会落入 `:146-151` fail-closed（无未知方法产生）。
- 含义：批文所述「白名单＝能力级授予」成立，但 **P2 必须同时显式授予执行（approve）**，否则授予后调用全数在核内被拒；「装什么≈能跑什么」在 0.162.1 需要两个键共同表达。

## ④ 起不来的白名单 server 的 catalog/线程形状

**结论：定格；线程/轮次照常（降级口径可成立）；目录恰等校验须按名字集而非空目录。**

- **通知（C 格活体）**：`mcpServer/startupStatus/updated` 两帧：`{threadId, name:"broken-server", status:"starting", error:null, failureReason:null}` → `{status:"failed", error:"MCP client for \`broken-server\` failed to start: MCP startup failed: No such file or directory (os error 2)"}`（`failureReason` 枚举 schema 仅有 `"reauthenticationRequired"`）。
- **catalog（`mcpServerStatus/list`，detail="toolsAndAuthOnly"）**：失败条目仍在 `data`：
  `{name:"broken-server", runtimeStatus:"failed", pluginId:null, httpOrigin:null, serverInfo:null, serverCapabilities:null, tools:{}, toolsError:"MCP startup failed: No such file or directory (os error 2)", resources:[], resourceTemplates:[], authStatus:"unsupported"}`。
  健康对照（A 格）：`{runtimeStatus:"connected", serverInfo:{name:"ans-probe-mcp",version:"0.0.0",…}, serverCapabilities:{tools:{}}, tools:{<name>:{name,description,inputSchema}}, toolsError:null, authStatus:"unsupported"}`。
- **线程存活**：C 格 `turn/start` 照常完成（`turn/completed` status completed）——「server 起不来 ⇒ 会话照开、如实一行、不毁轮次」可落地；如实一行可取材 `startupStatus/updated.error`／catalog `toolsError`（**只落类别不落全文**的纪律仍适用于展示面）。
- **⚠ 对评估文 §3.2④ 的修正**：目录级「恰等」校验不能沿用现有「`data` 必须为空」的判据直接改成白名单——**失败的白名单 server 仍然出现在 `data` 里**；恰等＝「`data` 名字集恰等于白名单集 ∧ 无白名单外条目」。

## ⑤ app-server→MCP 子进程 env（只列键名）

**结论：现状即收窄——网关密钥不外泄；子进程 env＝server 定义 `env` ＋ codex 注入的 PATH（＋平台运行期项）。**

- **ANS 姿态格（A 格）**：app-server env＝`{PATH, CODEX_HOME, CODEX_API_KEY}`（照 `session.ts:321`），server 定义 `env={PROBE_ENV_ONE, PROBE_ENV_TWO}` ⇒ 夹具实收键名（排序）：**`PATH`、`PROBE_ENV_ONE`、`PROBE_ENV_TWO`、`__CF_USER_TEXT_ENCODING`**。**无 `CODEX_API_KEY`、无 `CODEX_HOME`、无 HOME/SHELL/其它全量继承**。
- **对照格（A3）**：app-server env 去除 PATH、server 定义无 env ⇒ 夹具仍收 `PATH`、`__CF_USER_TEXT_ENCODING`——PATH 为 codex（或 spawn 层）注入而非继承（层级未再细分）；`__CF_USER_TEXT_ENCODING` 为 darwin 运行期产物。
- 含义：评估文 §6.1 表 Codex 行「继承面待探针」结清——**不泄露**；产物若声明 `env` 值，会（也只有它会）原样进子进程（引用形态 vs 字面量的产品纪律不受影响）。

## ⑥ per-call timeout 配置键

**结论：`tool_timeout_sec`（秒，数字）；启动另有 `startup_timeout_sec`。**

- schema/二进制结构字段：`McpServerConfigToml{… startup_timeout_sec, startup_timeout_ms, …, tool_timeout_sec, …}`（同 struct 另有 `default_tools_approval_mode`/`enabled_tools`/`disabled_tools` 等）。
- 回读往返：`tool_timeout_sec: 0.25`、`startup_timeout_sec: 5` 进入生效配置并回读为数字。
- **行为实证（A 格）**：`tool_timeout_sec=0.25` 下对永不回应的 `hang_probe` 直呼，**≈0.25s 内返回** RPC error（复跑实测 253/257/258ms）：`{"code":-32603,"message":"tool call failed for \`probe-surface/hang_probe\`: timed out awaiting tools/call after 250ms"}`——直呼路径同样受该键约束。
- 含义：P2 可给外来 server 注入有限 per-call 超时（评估文 §6.4/R6 的「Codex 查 schema 待探针」结清）。

## 对 P2 的落地含义（相对评估文 §3.2 的增补，均本批实证）

1. **（新增，最关键）** 白名单定义须带 `default_tools_approval_mode="approve"`（或逐工具 `tools={…={approval_mode="approve"}}`）；否则 `approval_policy:"never"` 下所有调用核内拒绝（③）。
2. **（新增）** whitelist 定义与 disabled 集**合并为单条** `-c mcp_servers={…}`（①-A2b）。
3. **（修正）** 目录级恰等＝名字集恰等（失败白名单条目仍在 data；④）。
4. **（新增，跨边界前置风险）** 0.162.1 对 Responses 的 MCP 下发＝`type:"namespace"` 桥容器，上游须按 `function_call{name, namespace}` 对回传；**真实 ANS 网关接受性未验**（本地假 SSE 绿）。P2 开工前应有真实网关探针（需网关方/客户配合；禁真实网关约束下的未定格项）。
5. item 映射补 `item/completed` 的 `mcpToolCall` 分支（形状见②；含 status/error/result 如实三态）；是否列入隔离属 P2 评审（探针只给形状——**建议不隔离**：白名单调用是已授予能力的执行事实，非「原生越权」信号；裁定权归 P2）。
6. 失败 server 的降级行取材 `startupStatus/updated.error`／`toolsError`（类别化，不落全文）（④）。
7. env 面**无需改动**（⑤）；给外来 server 可选注入 `tool_timeout_sec`（⑥）。

## 未定格 / 未验边界（如实登记）

1. **真实网关**对 `type:"namespace"` 桥工具的下发/回传接受性（本批全部 loopback 假端点；**禁真实网关**约束下不可验——P2 前置项）。
2. `item/mcpToolCall/progress` 的实际触发（夹具不发 progress 通知；方法名/参数按 schema 定格）。
3. server→client 主动 elicitation（非审批路径）：**三种客户端能力位组合**（现状 `{experimentalApi, explicitGatewayOauth}`／加 legacy `mcpServerOpenaiFormElicitation:true`／加 `extensions:{"openai/form":{}}`）下均在 app-server 内就地 `{action:"decline"}`（不达客户端）；其到达客户端的触发条件未定格（对 P2 不必要——ANS 语义＝取消，既有 handler 属休眠防御）。
4. 审批模式 `approve` 的完整语义边界（对 write 型工具、与 guardian/auto-review 的关系）未深挖；`auto` 需 auto-review 支撑（本 posture 无）。
5. A3 对照格 PATH 的注入层级（codex 注入 vs spawn 实现）未再细分；`__CF_USER_TEXT_ENCODING` 为 darwin 产物（Windows 未验）。
6. Windows 全项未跑（本批 darwin 25.6.0 / Node v24.14.0）。

## 证据清单

- 探针脚本：`docs/change/2026-10-16-mcp-surface-evidence/mcp-surface.probe.mjs`（14 单元格：A 全定义活体+直呼+timeout、A2a/A2b 配置边界、A3 env 对照、C 坏 server、D/D2/D3 elicitation 三组合、B 模型驱动默认拒、E 审批通道对照、B-mode-{approve,writes,never} 枚举扫描、B2 auto）。复跑：`node 角色卡/Codex适配器/docs/change/2026-10-16-mcp-surface-evidence/mcp-surface.probe.mjs`（cwd＝仓库根；需 pinned `@openai/codex@0.162.1`）。
- 原始输出：`mcp-surface.raw.json`（18/18 自检通过、exit 0；`externalModelCalls: 0`）＋ `mcp-surface.stderr.txt`（恒空）。
- 夹具：`fixtures/echo-mcp.mjs`（原始 JSON-RPC stdio MCP server：argv/cwd/env 键名落盘＋echo/hang/elicit 三工具）。
- 协议 schema（同版本 `codex app-server generate-ts --experimental` 原样摘录）：`schema/`（ServerRequest 全集、ServerNotification 方法全集、ThreadItem、mcpToolCall 系、catalog 系、elicitation 系、InitializeCapabilities 等 25 件）。
- 哈希清单与检查/限界：`manifest.json`。

## 附录：同批 G-4 注入节拼接（I4 的 Codex 侧；非探针）

- `src/provider/codex/session.ts`：`:17` 新 import `renderInstalledSkillsSection`（`src/common/编排/installed-skills.ts`，两参默认调用）；`composeContext`（`:241-250`）末段追加 `...(installedSkills === "" ? [] : [installedSkills])`——非空整段逐字拼入（沿 Claude 侧同批接线同形），空串零渲染、既有提示逐字不变。
- `test/codex-adapter/session.test.ts`：新增 1 例（`:44`）：零技能/坏件（缺 SKILL.md）⇒ 提示逐字不变且会话照开；命中 ⇒ `systemPrompt === bare + "\n\n" + 冻结段`（sha256 测试端独立计算）；假 engine 路径 ⇒ `thread/start` 的 `developerInstructions` 与 compose 结果逐字一致。
- 结果：`node --test test/codex-adapter/*.test.ts` ⇒ **35/35** 绿（基线 34＋1）；`npm run typecheck` ⇒ 0 错。未 git 提交。

（本记录状态：**探针完成 / 生产零改动 / 未提交**。六项结论均可按证据目录独立复跑。）
