# Codex适配器实现报告

适配器已实现。X1 原 14 项证据保留在[实施记录](docs/change/2026-10-14_change_codex-governed-session.md)；X1S 可选空白地址修复后自有 **16/16** 与全仓严格类型检查通过，见[修复记录](docs/fix/2026-10-14_fix_blank-base-url-default.md)。稳定 CLI `0.162.1` 的无模型配置/schema 探针已由[装配](../装配/api-spec.md)通过，用户入口最终整合由后继角色接续。正式契约仅引用 `src/model/runtime.ts` 和[运行时核心接口](../运行时核心/api-spec.md)。

公共入口为 `src/provider/codex/session.ts::createCodexRuntimeAdapter(options): RuntimeAdapter`，输入 `CodexRuntimeAdapterOptions extends RuntimeProviderOptions`。工具、存储、交互等待和当前轮 ID 全由调用方注入，不导入其他 Provider 或角色私有 common。扩展注入 `engineFactory/mcpLoader/env/cliPath` 仅用于基础设施替身/受控嵌入；工厂与入口加载不启动外部资源，`bindRole` 才加载实际 MCP 和 Codex CLI。公开类型还有 `CodexEngineFactory/CodexEngineInput/CodexRpcConnection/CodexMcpModules`，只通过本 Provider 入口引用，不直接引 common。

运输决定：实际检查 `@openai/codex-sdk@0.162.1` 后发现它不能读取有效配置或处理服务端审核请求；本地假配置实证根 MCP map 会合并外部服务。因此采用必要 app-server JSON-RPC：先枚举并禁用全部 native MCP、重启验证，再注册注入工具对应的 `dynamicTools` ANS 代理。实验 `item/tool/call` 具有 threadId/turnId/callId，校验身份后通过真正 MCP Client/Server/InMemoryTransport 调用原 handler。旧轮/未知工具在进 MCP 前拒绝，队列保持原 Signal，不补用新轮 Signal。初始化 `experimentalApi=true/explicitGatewayOauth=true`；新建/恢复/每轮 read-only+never，返回沙箱与空 native MCP catalog 必须验证。没有 HTTP MCP 分支或流式事件审核。[完整设计及独立影响评估](docs/design/2026-10-14_design_codex-governed-transport.md)。

精确依赖由装配安装：`@openai/codex@0.162.1`、`@modelcontextprotocol/sdk@1.32.1`；本角色没有改依赖与 lockfile。早期 alpha 调查与后来的稳定无模型探针分别留在原生产者记录；配置/schema 通过不能等同于在线模型或 OS 全面沙箱验证。

支持设置：模型与 key 必需，`modelId` 优先于 `ANS_CODEX_MODEL`；`baseUrl` 优先于 `ANS_CODEX_BASE_URL`。地址选中值 trim 后为空或未提供时默认 `https://api.openai.com/v1`；显式空白直接选择官方默认，不继续 fallback 到环境地址，显式非空继续优先。`apiKeyEnvVar` 显式指定来源时缺值不 fallback，否则 `CODEX_API_KEY` 优先、`OPENAI_API_KEY` 作为本适配器明确映射的 fallback。key 缺少直接失败，不读全局登录状态；base URL 接受无 username/password 的 HTTP(S) API endpoint，不接收 CLI 运输地址。只向原生子进程传 PATH、独立 CODEX_HOME、实际 CODEX_API_KEY；通过唯一自定义 provider 的 env_key 使用 key，不调用 login 或持久化 auth。bindRole 同步捕获 model/base/key 与秘密值，后续运输及错误脱敏使用同一份结果。消息、错误、工具参数/结果按共享秘密键与实际自定义 key 脱敏。

`RoleSession` 实现 prompt/events/abort/dispose 和 runtime/roleId/contextSource/nativeSessionId/contextWarning。普通停止保持会话，清理失败隔离；每轮唯一 settled/detail.outcome；detail 保留 toolName/name/toolCallId。persist 模式只用注入 storage nativeDirectory，并调用 validate/prepare；没有 storage 使用临时根，dispose 删除；回放全交核心。图片 MIME 支持 png/jpeg/gif/webp，转为临时 localImage，dispose 删除。

默认 CLI launcher 会再启动原生程序，POSIX 以本次专属进程组整体清理；TERM 不结束时 KILL 全组，确认 group/exit 或如实报清理失败。Windows 使用 owned PID 的 taskkill/T/F 先清树，该 OS 分支在当前 macOS 未动态验证。自有测试证明 wrapper/native 同时忽略 TERM 后也没有迟到写入或存活 native PID。

本地 MCP request timeout 为 `2147483647ms`。整轮计时在 interactionGate 等待期间暂停（按有效运行时间计）。服务器 dynamicTool deadline 未由官方/types 建立，不宣称无限等待；上游提前 serverRequest/resolved 立即取消原轮。错误/一般模型失败如实外推，不把一般失败改写成原生恢复失败。

自有命令：`node --test 'test/codex-adapter/**/*.test.ts'` 与 `npm run typecheck`，X1S 当前均通过。`node test/codex-adapter/native-probe.mjs` 稳定结果由装配记录；本次仅设置解析变化，没有重跑运输探针。早期临时 harness 的原始命令见实施记录，生产没有临时包路径 fallback。



## 2026-10-15 Codex-A-1：A4/C2.tp1 实际消费

required-v1 缺注入 projector/register 时在任何外部初始化前拒绝；bindRole 同一 env 快照解析认证并纯内存登记选中键与 Core 指定键。真实 handler 的 start/result、displayInputRule、原args、Error.message 和 execution 只交注入投影，净化后事件走薄出口，opaque turn/call不scrub；无独立hook不造blocked。投影失败只固定诊断。模型 text/content/images 与既有profile/url保护保持，delivery选项不进app-server。

自有22/22、独立测试角色实际命令入口6/6、固定Codex CLI0.162.1本地假SSE回环通过（2请求/1handler/2投影，外部模型0）。最终全仓typecheck0。详见[本次实施及候选证据](docs/change/2026-10-15_change_tool-display-projection.md)。在线与真实桌面仍待独验，原16/16/typecheck0是历史候选结果。

## 2026-10-16 G-3：联网搜索能力位与 webSearch 行（R1）

支持设置新增（默认关，fail-closed）：`CodexRuntimeAdapterOptions.webSearch?: boolean` 显式优先；env `ANS_CODEX_WEB_SEARCH` 白名单 `on|off` 兜底；非法值显式失败。开启＝三钉同翻（线程配置/进程 `-c`/config/read 回读期望 `web_search:"live"`，回读不符仍 fail-closed）；落点键由本地回环实证＝顶层键（`[tools].web_search` 不注入）。`turn/start` 沙箱 `networkAccess:false` 保持（搜索在网关侧执行）。

事件面：`item/completed` 的 `webSearch` item → 一条 `kind:"message"` 行（摘要 `联网搜索：<query>`；detail v1 `{version:1, source:"web-search", itemId?, query?, action?, results?, resultsTruncated?}`，只外推真实字段、cap 20、容错不抛、不进隔离、恒映射不随能力位关闭）；settled detail 计数 >0 时附 `searchCalls`。查询串不进诊断。自有33/33、typecheck0、全量0fail；真实网关接受性未验（客户探针 P1–P3）。详见[实施记录](docs/change/2026-10-16_change_web-search.md)。

## 2026-10-17 整轮最后兜底（到点检查/兜底两层时限）

`promptTimeoutMs` 语义改为**看护到点检查**（历史字段名；不中止整轮）；Codex 适配器自身的整轮上限只认 `options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS`（运行时核心常量，固定 1 小时、不暴露 env；测试/宿主可注入小值）。`pausedDeadline` 仍挂 `interactionGate`：确认卡等待期间暂停，按有效运行时间计——等待客户超过 1 小时不会触发兜底。到点仍走既有 `stop(turn,"timed_out")`（`outcome` 枚举不变），但 `turn.failure` 文案为「Codex 本轮运行超过最后兜底（Nms），已中止以免无限挂起。」并随 settled `detail.error` 外推，与到点检查/普通失败可区分；不再出现「prompt 超时」旧文案。shell 命令 10 分钟、确认卡 120 秒、构造 120 秒不变。测试：注入小 `turnLastResortMs` 到点才中止；单独设很小的 `promptTimeoutMs` 不中止、不产生 `turn/interrupt`。详见[变更记录](changelog.md)。

## 2026-10-17 P3c：判断会话（「替我审」）judgeMode

`RuntimeProviderOptions.judgeMode === true`（运行时核心中性标志；Service 在注入 `shellJudge` 时置位）时，适配器进入只读判断会话（PM 评审 §6.1/§7.1/§十一 P3c）：

- **工具面恰三只**：`options.tools` 必须恰为运行时核心 `buildShellJudgeTools` 的 `judge_read_file`/`judge_list_dir`/`report_shell_judgement`（名单取自 `src/common/runtime-core/shell-judge/tools.ts` 单一来源，本适配器不另造）。缺项/多项/夹带 `write_file`/`edit_file`/`run_shell`/`request_confirmation`/`request_choice`/`submit_report`/`dispatch_task` 任一 ⇒ 工厂与 `bindRole` 均装配前抛错、零引擎/零副作用。原生面只注册 `ans_<judge tool>` dynamicTools，内存 MCP 代理目录同集。
- **原生能力关闭**：强制 `web_search="disabled"`（忽略 `options.webSearch` 与 `ANS_CODEX_WEB_SEARCH`）；`installedMcpServers` 视为空、原生 `CODEX_HOME` 走临时目录、线程 `ephemeral:true`、沙箱 `read-only`、`networkAccess:false`、审批 `never`；原生审批/选择/自由输入请求照旧 decline/cancel/空答案。judge 轮内若仍收到 `mcpToolCall`/`webSearch`/`commandExecution`/`fileChange` ⇒ 隔离该轮 `failed`（fail closed）。
- **不持久化**：即使上游误传 `storage` 也不调用 validate/prepare/read/save/append/readReplay；`contextSource:"in-memory"`；不写 `.ans`、不产生聊天/角色状态。
- **回调原样**：`report_shell_judgement` 把模型原始参数原样交给注入的 `report`（取值域/长度/歧义规范化与脱敏在编排）。
- **提示面**：judge 系统提示明确「只读判断会话，只有 judge 读取与结论工具」；不宣称写/命令/交互/派发能力，也不拼接项目技能注入节（证据按需用 `judge_read_file` 读）。
- **普通角色会话逐字不变**：`judgeMode` 未设时工具集不限名单、webSearch 仍按 options/env、storage/installedMcpServers 照旧。

验证：`test/codex-adapter/judge-mode.test.ts` 7 例（离线假引擎＋内存 MCP；无真实模型/凭据/网络）。
