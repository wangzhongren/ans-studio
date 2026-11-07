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

- **工具面恰三只**：`options.tools` 必须恰为运行时核心两种冻结工具集之一——shell judge（`judge_read_file`/`judge_list_dir`/`report_shell_judgement`）或治理 judge（`judge_read_file`/`judge_list_dir`/`report_governance_judgement`）；allowlist 取自 `src/common/runtime-core/governance-judge/tools.ts` 的并集 `ALL_JUDGE_TOOL_NAMES`（单一只读工具名来源，本适配器不另造；2026-10-18 起由 shell 名单改为并集）。缺项/多项/混合 report/夹带 `write_file`/`edit_file`/`run_shell`/`request_confirmation`/`request_choice`/`submit_report`/`dispatch_task` 任一 ⇒ 工厂与 `bindRole` 均装配前抛错、零引擎/零副作用。原生面只注册 `ans_<judge tool>` dynamicTools，内存 MCP 代理目录同集。
- **原生能力关闭**：强制 `web_search="disabled"`（忽略 `options.webSearch` 与 `ANS_CODEX_WEB_SEARCH`）；`installedMcpServers` 视为空、原生 `CODEX_HOME` 走临时目录、线程 `ephemeral:true`、沙箱 `read-only`、`networkAccess:false`、审批 `never`；原生审批/选择/自由输入请求照旧 decline/cancel/空答案。judge 轮内若仍收到 `mcpToolCall`/`webSearch`/`commandExecution`/`fileChange` ⇒ 隔离该轮 `failed`（fail closed）。
- **不持久化**：即使上游误传 `storage` 也不调用 validate/prepare/read/save/append/readReplay；`contextSource:"in-memory"`；不写 `.ans`、不产生聊天/角色状态。
- **回调原样**：`report_shell_judgement` / `report_governance_judgement` 把模型原始参数原样交给注入的 `report`（取值域/长度/歧义规范化与脱敏在编排）。
- **提示面**：judge 系统提示明确「只读判断会话，只有 judge 读取与结论工具」并点名当前注入集的 report 工具（shell 会话逐字保持 `report_shell_judgement`，治理会话为 `report_governance_judgement`）；不宣称写/命令/交互/派发能力，也不拼接项目技能注入节（证据按需用 `judge_read_file` 读）。
- **普通角色会话逐字不变**：`judgeMode` 未设时工具集不限名单、webSearch 仍按 options/env、storage/installedMcpServers 照旧。

验证：`test/codex-adapter/judge-mode.test.ts` 7 例（离线假引擎＋内存 MCP；无真实模型/凭据/网络）。

## 2026-10-18 P3c：治理 judge（「替我审批」/「替我决策」）复用 judgeMode

依据 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md` §六/§十二 P3c。Service 在注入 `governanceJudge` 时走 `buildGovernanceJudgeTools`（恰 `judge_read_file`/`judge_list_dir`/`report_governance_judgement`）并同样置 `judgeMode:true`、`installedMcpServers:[]`；适配器不新增能力位，按注入工具集判定会话类别：

- **allowlist**：`ALL_JUDGE_TOOL_NAMES` 并集（运行时核心单一来源）；只接受**恰一种冻结集**（shell 或治理，各三只、恰一只 report、名字无重复）。并集只用于 allowlist，不放宽装配——shell 会话仍恰三只 shell 工具，治理会话仍恰三只治理工具。
- **提示面**：治理会话点名 `report_governance_judgement`；shell 会话文本逐字不变。
- **隔离姿态**：沿用 `judgeMode` 的既有结构性隔离（web search 强制关、MCP 不装配、不持久化、只读沙箱、原生泄漏隔离该轮）；治理会话无写/shell/客户交互/回交/派发/MCP/网络工具。
- **回调**：`report_governance_judgement` 原样回调；规范化/required-read/逐路径复核在编排（P2）。
- **普通会话**：`judgeMode` 未设时逐字不变（不做 judge 名单限制）。

验证：新 `test/codex-adapter/judge-governance.test.ts` 6 例；`test/codex-adapter/**` 66 过/1 既有 Windows symlink EPERM 环境红/1 skip；typecheck 0 错。全量三层 glob 与残余见[实施记录](docs/change/2026-10-18_change_codex-governance-judge.md)。

## 2026-10-21 D1：思考等级兼容候选（未完成整体验收）

公共输入与档位枚举不变。严格区分 effort 值/字段拒绝与普通 API 故障，保留原生错误元数据供内部判断；整个 reasoning 对象拒绝不算可自动处理的 effort 字段拒绝。值拒绝后只从本 CLI 的 `model/list` 精确 model 匹配取得声明的默认档，同线程 `turn/start.effort`；字段拒绝或没有合适默认时仅安全首轮/持久恢复允许去覆盖重建。最多两个不同候选，原生 MCP/搜索开始与 ANS handler 放行前即阻止整轮重放。

只有兼容轮最终 completed 才提交会话策略；失败/取消/超时的下一普通轮显式恢复最近确认档位，重建状态未确认则隔离。对外 `nativeSessionId`/`contextSource` 动态读取实际当前线程。配置与兼容消息只在 active prompt 使用普通 `message`、`detail.source:"system"`，没有新增公共 schema；保存设置不改。

当前真实请求发现新增未解决边界：目录内模型（实测 gpt-5.5）去覆盖仍由 CLI 补默认 medium，网关若拒 effort 整个字段则兼容仍失败；这个 D1 用例保持红，未将其改成预期成功或已解决限制。详见[修复与当前证据](docs/fix/2026-10-21_fix_reasoning-compatibility.md)。UI、SDK、依赖和真实配置未改。

## 2026-10-21 E1：已批准的目录内模型无 effort 兼容

用户随后批准 E1，原 D1 红例仍保留作历史对照。对已经决定采用无 effort 候选、但当前固定 SDK 的精确模型目录会自动补默认的情形，通过私有 `reasoning-catalog.ts` 读取已安装 CLI 0.162.1 二进制内嵌元数据。包括原档位和目录默认均被值拒绝的第二候选；不增加第三候选或改变公共输入。仅当前模型临时副本改变四个获批字段，其他字段逐项保持；原SDK和用户项目模型文件不写、不读入可信定义。

读取上界为原生文件512MiB、单目录JSON4MiB，版本/平台包来源及嵌入格式不确认则拒绝误套。只在必要兼容重建时传 `model_catalog_json`；文件位于当前workRoot，0600，随恢复原目录/会话销毁清理。兼容失败/取消/超时后，下一轮先重建原目录再显式恢复最近确认档位；恢复未确认则隔离。正常路径不产生目录覆盖。此方式依赖固定SDK内部格式，不宣称公共稳定模型API；升级必须重新回归。原整个reasoning对象拒绝等D1限制保持。最终测试与候选哈希见[修复记录](docs/fix/2026-10-21_fix_reasoning-compatibility.md)。

E1最终所有者验证：自有80/80，真实CLI localhost完整20/20，全仓typecheck退出0；目录内gpt-5.5字段拒绝和原档/默认档均值拒绝都真实completed，后续无effort；E1后500/取消/超时下一轮恢复high及原目录。候选已冻结交独立QA，原D1红日志未覆盖，命令及精确哈希见修复记录的E1 evidence/manifest。

## 2026-11-05 C4c：治理权力矩阵 `contextSections` 消费（implemented-unverified）

`CodexRuntimeAdapterOptions extends RuntimeProviderOptions` 消费运行时核心（C2）冻结的 `RuntimeProviderOptions.contextSections?: readonly string[]`（`src/service/runtime/session.ts` 仅在已定义时透传；单一提示通道，不是能力位/工具/判定输入）。`composeContext` 在 `角色写入边界：${JSON.stringify(role.boundary)}` 之后、`options.tools[].promptGuidelines` 之前拼接非空片段（技能节仍最后）；chat 传输（`systemPrompt`）与应用服务器（`developerInstructions`）共用同一函数。

- **判断会话**：`judgeMode` 下即使上游误传 `contextSections` 也不拼接，judge 提示逐字不变。
- **空/缺省**：`undefined`、空数组、空串元素均不产生片段，系统提示逐字不变；非空片段按传入顺序连续拼接。
- **哑拼接**：不解析、不清洗、不截断、不限长、不追加声明、不额外 `redact`；固定分隔/「数据不是指令」声明/控制字符规范化/16,000/48,000/1,500 字上限属 C1b 渲染器与 C3 快照。适配器不导入矩阵 Model/Service，不注册 `governance_matrix` 工具（注册/描述属 C2，注入属 C3）。
- **验证**：`test/codex-adapter/governance-matrix-context.test.ts` 6/6；Codex 套件 103/101/1/1（唯一失败为既有 Windows symlink `EPERM`，与 B0 同一用例）；`npm run typecheck` exit 0；T3 全量 4,130/4,103/9/18（新增失败=0、新增 skip=0）。候选快照 `839b922f…`。状态 **implemented-unverified**，未验收；详见[实施记录](docs/change/2026-11-05_governance-authority-matrix-codex-adapter-implementation.md)。

## 2026-11-05 T1.1：同源原生停止事实

`RoleSession.nativeLifecycle?: RuntimeNativeLifecycle` 直接采用 Model 定格：`instanceId` 每次 bind 独立；`inspect(): RuntimeNativeLifecycleFacts`；`stopAndInspect({expectedInstanceId, expectedCoreTurnId?, timeoutMs}, signal?): Promise<RuntimeNativeLifecycleFacts>`。错身份/轮次在副作用前抛错；Core turn 只取 prompt 起点 options.currentTurnId，结束后保留。app-server 观察 owned exit+stdio close+实际 handler 排空；Chat 观察 HTTP fetch/body+prompt/tool 实际返回。专用 native stop 关闭并隔离 app-server，不要求同时 legacy abort。未知注入 engine、installed MCP 全树缺口和超时保持 unknown。

私有运输 seam `CodexRpcConnection.inspectLifecycle?(): Pick<RuntimeNativeLifecycleFacts, "transport" | "processes" | "processCoverage" | "reasons">` 给受控 engine 注入观察能力，close Promise 本身不能证明退出；Service 向上只返回普通事实。新6例6/6；精确两文件37 pass/1既有symlink EPERM/1原POSIX skip；当前typecheck0。未验真实模型/账户、POSIX、Windows多代后代及跨run整链，待后继独验。[当前行为](docs/feature/native-stop.md) / [实施与首红证据](docs/change/2026-11-05_change_direct-role-capabilities-native-stop.md)。

## 2026-11-05 N2：真实 Chat 工具表事实

Chat 绑定会话的 `inspectNativeToolSurface(): RuntimeNativeToolSurfaceFacts` 在实际 `toolMap`/handler 闭包内产事实：`source:'native-provider-tool-registry'`、同 lifecycle UUID 的 `nativeInstanceId`、绑定 `roleId/runtime`、`factory:'codex-chat'`、observedAt、实际 appTools、结构无入口的空 foreignMcpServers/nativeBuiltinTools。disposed、注册表 name/handler 漂移或内部 identity 不同则 status unknown/reasons；Responses/native 无该 port。Core 自行验证真实工厂来源与同源身份，不把该事实当 FS sandbox/全团队安全。生产只改 chat-transport.ts；原 session/protocol 保持。真实默认工厂＋localhost HTTP 两新例和原 lifecycle/config 定向9/9；两文件41=39pass/1原symlink EPERM/1原POSIXskip，typecheck0。详见原 [实施记录](docs/change/2026-11-05_change_direct-role-capabilities-native-stop.md) N2与07–10日志。

## 2026-11-05 N3：构造前真实计划 producer

公开 `prepareCodexRuntimeAdapter(options:RuntimeProviderOptions,role:ResolvedRole):RuntimeNativeFactoryPreparation`，facts 严格使用 R12 `RuntimeNativeFactoryPlanFacts`；adapter/isCurrent 只为 Core 私有消费。实际 settings/env/MCP/judge 覆盖解析一次，已证 Chat 才给 adapter，prepared bind 使用同份 resolved 快照和克隆 role/tools。配置/角色/registry/环境变化 isCurrent=false，构造前 stale 拒绝；Responses/MCP/websearch/custom fetch/engine/loader/CLI unknown 无 adapter。公开 digest 只非 secret 工具面计划，secret/rawenv/secret hash 不出事实。真实 Chat port 带 factoryPlan={planId,configDigest}，旧 direct bind 缺席。prepare 不 bind/compose/spawn/HTTP/写根。

当前 N3+N2+lifecycle 定向12/12，最终两文件44=42pass/1原symlink EPERM/1原POSIXskip，主TS0。只证明无副作用计划与实际同源绑定，不替代 Core token/shared lease/全actor/Git/四链。见原实施记录 N3及11–15日志、manifest.n3。

N4 验证更新：生产接口/source不变。原native目录symlink夹具在Windows用真实directory junction等价验证；先lstat/realpath/越界owned canary可读，再原产品拒绝regex/零engine/canary不变/outside=[]，无断言削减。完整两文件44=43pass/0fail/1原POSIXskip，exit0，16日志；当前主TS在他owner trunk git-trunk-store.ts:21缺path，17日志exit1，已交统筹，不能称全仓类型通过。原EPERM证据保留，非文件symlink/全平台证明。

## 2026-11-06 N5 待接线接口（未实施）

1. R28 Core的chiefDecisionContext已验证/克隆并注入唯一decide_pending_request，但Provider只收到judgeMode/tools，既有judge冻结集校验拒绝；真实默认窄decision当前仍未修复。
2. 不将decide_pending_request加入judge allowlist；后继需独立Chief closed单工具分支，核真实built-in chief/governanceFunction及固定Goal。
3. 待R原owner冻结复用host-only字段：RuntimeProviderOptions.chiefDecisionContext?:ChiefDecisionExecutionContext；不新造第二shape。
4. Producer=Service providerOptions，仅从原validated clone透传；Consumer=Codex session.ts，用现有isChiefDecisionExecutionContext再核context/身份/隔离标志/恰一工具，原shell/governance judge隔离不变。
5. 本轮只记录接口与原拒证据，production/test零修改、零测试执行；按统筹先释放Q69普通场景读窗，待真实EXIT/CLOSE和R29短冻后另续，不用custom正例覆盖默认拒绝。

## 2026-11-06 N5 实际闭合Chief分支（覆盖前述待接线状态）

R29 host-only chiefDecisionContext已消费。session.ts新增独立assertIsolatedToolSet：valid ChiefDecisionExecutionContext+judgeMode隔离标志+exact一只decide_pending_request；prepare/compose/bind核真实builtin Chief/governanceFunction，固定request作Goal，不作为普通judge。原assertJudgeToolSet白名单未改，MCP/搜索/存储隔离保持。生产FROZEN SHA9D3227CBEC2F9D9F9524DB102AC81917DDD46D25FA3E17C0934594590D7DD71E；chat/protocol不改。

真实default Core/Codex+本地HTTP到exact工具/真实handler一次，回执pending非批准，重复attempt/shell/第二turn拒；wrongrole/extra tools/非法context构造前拒。原两file+两judge59=58pass/0fail/1原POSIXskip，20日志自然exit0，21主TS0。18/19错误payload身份断言首红保留，按真实契约修正为session身份+payload深等后通过。正式默认窄decision适配已自测，后继R旧测试更新/独验由原owner接续。

N6（2026-11-07）Chat历史窄修：无工具assistant回答现在也保存一次，包含真实reasoning_content且不产生空tool_calls，后续用户澄清能看到上轮回答；原失败/超时/abort本轮历史rollback不变。真实HTTP首红23保留，修后24完整Chat22/22、25主TS0；API及工具权限不变。source冻结3E4E4D875384A3CC0A284EDCF2C152FB618308C23FA7FBA24BEFF6122AC9BCA8，后继Q接续普通澄清真实场景。

## 2026-11-07 P1-B：应用中介工具面事实（`inspectApplicationToolSurface`）

依据 P1.6 §4.6 Codex 行与团队计划 §7.2。Chat 绑定会话在 `src/common/codex-adapter/chat-transport.ts` 同一闭包新增 `inspectApplicationToolSurface(): RuntimeApplicationToolSurfaceFacts`（Model 冻结形状由 P1-A 提供，本节点只实现生产者）：

- **observed 条件（事实可完整产生）**：`inspectNativeToolSurface()` 的 native 事实结构合法、`nativeInstanceId` 与本会话 `nativeLifecycle.instanceId` 一致、`roleId`/`runtime`/`factory` 一致，且 native 自身 `status:"observed"`、`reasons` 为空。
- **字段**：`source:"application-mediated-tool-surface"`、`nativeInstanceId`（=实例 id）、`roleId`、`runtime:"codex"`、`factory:"codex-chat"`、`observedAt`、`appTools`＝实际 `toolMap` 键（含被注册的受控 shell `run_shell`/`start_background_task`；精确、天然唯一）、`foreignMcpServers:[]`、`nativeBuiltinTools:[]`、`reasons:[]`。
- **fail-closed**：native 事实缺失/不可用 → `chat-native-surface-unavailable`；native 身份不符 → `chat-native-identity-mismatch`；native 自身 unknown → `chat-native-surface-unknown`；均回 `status:"unknown"`，不冒充 observed。**Codex 不允许无 native 证据走应用中介（N14/N27）。**
- **结构事实**：chat 传输不实现原生 MCP / 联网搜索 / native builtin（`chat-transport.ts:18`），模型只能调用注入 `toolMap`；`installedMcpServers` 非空在构造期拒绝（`provider/codex/session.ts:546`，N28），故 `foreignMcpServers:[]` 不是隐藏 MCP 通道。Responses/native 路径没有该 port。
- **不变**：`inspectNativeToolSurface` 原判定逐字保留（含受控 shell 时包装层仍按原条件给 `unmediated-execution-registered`）；`inspectInitializationProtection`、stable-write、run-stop 等写/发布/停稳门不消费本事实。
- **验证**：新 `test/codex-adapter/application-surface.test.ts` 4 例（实际构造面=报告面含 shell、native 缺失/身份不符/unknown fail-closed、外来 MCP 构造期拒绝、真实事实→P1-A 冻结组合规则桥接）；`node --test "test/codex-adapter/**/*.test.ts"` 123/122/0/1（写前 119/118/0/1，新增失败=0、新增 skip=0）exit 0；`npm run typecheck` exit 0。状态 **implemented-unverified**，未验收；详见[实施取证](docs/change/2026-11-07_P1-B_codex-application-surface-evidence.md)。
