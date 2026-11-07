# Codex 原生停止事实补齐

T1.1 已确认的实现记录草稿，固定原 Codex 适配器 owner；复用 P5/R6 生命周期合同，不涉及 Git 权限方案。

此前 `abort()` 或主动 reject 只表明请求中止，无法证明底层停止。现在拟由 `RoleSession.nativeLifecycle` 向 Service 返回同源实例、捕获的 Core/native turn、实际 prompt/工具/运输/owned process 事实。原生入口 `src/provider/codex/session.ts::nativeEngine` 复用 exit、stdio close、POSIX 专属组与 Windows taskkill 等待；chat 入口 `createCodexChatSession` 观察 fetch/body 和真实 handler/prompt settle。失去树覆盖、未知注入 engine、超时、活工具都保留 unknown。

精确 mutation contract：源仅 session.ts、protocol.ts、chat-transport.ts；测试仅 session.test.ts、chat-transport.test.ts、fixtures/native-cli.mjs。无新生产/测试文件、依赖、配置、边界或 Model 修改。保留检出 77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3 既有差异；只做本人增量，不提交。

验证：`node --test test/codex-adapter/session.test.ts test/codex-adapter/chat-transport.test.ts`，必要时先 `--test-name-pattern` 定向。正例必须真实 process exit+close / HTTP raw settle；负例覆盖晚关闭/不关闭、handler 忽略 abort、超时、重复 stop、错 instance/turn、缺观察 hook。`npm run typecheck` 检查当前共享契约。离线 Node/本地运输与显式假凭据，无真实模型/账户/外网。保留首红、退出值与原始输出到本人 evidence 目录。当前未实施、未测试；最终回交独立验收。

当前行为说明：[native-stop](../feature/native-stop.md)。

## 已实施与实际验证

上述三源与两既有测试文件已增量实施，fixtures/native-cli.mjs 未改。`RoleSession.nativeLifecycle` 直接复用 R6 签名；私有 `CodexRpcConnection.inspectLifecycle?()` 仅观察运输/owned-process，不上抛能力对象。关联来自实际绑定 UUID、prompt 起点 Core turn、真实 thread/turn 返回；raw prompt、实际工具 handler、RPC handler、进程 exit/stdio close 分别计数观察。intentional stop 的原生请求取消不会再误写为上游意外失败。

- `04-native-lifecycle-fixed.log`：精确定向 6/6，exit 0，覆盖真实 Node owned process/taskkill + stdio close、HTTP body、活工具、重复 stop、错实例/轮、晚/不返回 close 与缺观察 hook。负例只在实际释放后恢复；没有放松断言。
- `05-session-chat-regression.log`：两文件 39 项，37 pass、1 fail（原 Windows symlink EPERM）、1 原 POSIX skip，exit 1；未删测试或新增 skip。既有 upstream cancellation 与 abort 后续轮测试通过。
- `06-typecheck.log`：当前全仓 `npm run typecheck` exit 0。首次类型检查曾报他 owner `test/编排/direct-role-capabilities.test.ts:256` 的 `TaskSideEffect='none'`，本角色未改该路径；后继 owner 更新后当前通过。
- 首红 `01-native-lifecycle-first.log`（3 pass/2 fail，exit 1）和 `02-http-first-detail.log`（本地 fetch 沙箱失败，exit 1）原样保留；`03-native-lifecycle-elevated.log`（4 pass/1 fail，exit 1）定位 intentional stop 被误认 upstream cancellation。本角色修复取消归因后得到 04。首轮未退出夹具 PID12320 经完整 fixture 路径与父测试 PID15232 校验后只回收该树；首轮最终失败未掩盖或当通过。

环境 Windows / Node v24.22.1，evidence 专属 TEMP；沙箱内本地 fetch/进程停止受限，精确离线命令经 require_escalated 自动审批执行，未获拒。全部原始日志在 [evidence](2026-11-05_native-stop-evidence/)，逐文件 SHA256 与来源见 manifest.json。没有网络模型请求、Git 提交、权限/依赖/配置修改。

限制：本轮动态正例为 Windows 直接 owned Node child 退出+taskkill/stdio 排空；未动态验证 POSIX 组和 Windows 多代后代场景。installed native MCP 的全树覆盖、注入 engine 无事实 hook 均保持 unknown；专用 native stop 后 app-server 必须新绑定。尚待 O/Q 后继真实 handle→stop/restart 链与独立验收，不以 6 个新例宣告三引擎完成。

## N2：真实 Chat 工具注册表观察（实施草稿）

沿本任务获准的同路径必要观测，在 `createCodexChatSession` 真正持有并执行 `toolMap` 的闭包增加 R8 `inspectNativeToolSurface(): RuntimeNativeToolSurfaceFacts`。只公开实际 appTools、空 native builtin/MCP 的真实执行路径事实，nativeInstanceId 同本闭包 nativeLifecycle.instanceId；disposed、工具对象/注册表漂移或内部身份不一致时 unknown。Responses/native 分支无该观察口，不从 wireApi/runtime 配置字符串生成肯定票。事实不代表文件系统沙箱或全团队安全。

本次源写只需既有 chat-transport.ts；session.ts 维持真实 Chat 分支生产接线，不增加 caller safe bool。protocol.ts 只读。两既有测试增加无 factory override 的默认生产工厂＋隔离本地 HTTP 回应，验证真实允许工具进入注入 handler、未注册 command/tool 拒绝且无执行，及 disposed/registry 变化/非Chat/MCP/webSearch 负例。验证命令仍为精确两文件，可先 `--test-name-pattern='native tool surface'`；随后重跑 T1.1 lifecycle 与两文件回归、类型检查。保留旧首红与日志，不拼旧生命周期证据为新候选通过。

### N2 已实施与新候选验证

观察口实际位于 `src/common/codex-adapter/chat-transport.ts::createCodexChatSession` 的 `inspectNativeToolSurface`，本次只改该生产文件及原两测试；session.ts/protocol.ts 的 T1.1 hash 保持不变。真实工具 Map、发送的 function specs 和绑定 handler/实例互相核对；dispose、name/handler 漂移与内部 identity 错报 unknown。事实数组为快照，不给可修改注册表句柄。

`08-n2-surface-lifecycle.log` 为新候选定向 9/9、exit 0：默认生产工厂（没有 engineFactory/chatFetch/providerFactories 替换）通过真实 localhost HTTP 收模型回应，已注册工具仅执行一次，未注册原生命令/工具均拒绝，原生 spawn trap 计数 0；同时重跑全部六个 T1.1 lifecycle 例、非Chat无port断言和原 MCP/webSearch 失败关闭例。脚本仅两轮，耗尽返回 HTTP500，不用无限模型替身。

`09-n2-session-chat-regression.log` 新候选精确两文件共 41 项：39 pass、1 原 symlink EPERM、1 原 POSIX skip，exit 1；没有新增 skip 或放宽断言。`10-n2-typecheck.log` 全仓类型检查 exit 0。`07-n2-typecheck-first.log` 保留测试断言的 `unknown` 参数类型首红，修正为明确 Record 类型后通过，运行断言不变。

R8 Model 读入 hash `37917B6A802D286739277A4EA0BDA93B4B7E546FC07F7A40C772E9E58563DAA0`。本角色已向 R8 提交实际字段/producer/hash，向统筹确认 Q 可用的真实默认工厂＋本地 HTTP 请求/响应形状；未代写 Q driver、Core consumer 或全局安全判定。当前事实只证明真实 Chat 工具闭包；原 FS/全树/跨run限制继续保留。

## N3：构造前真实计划（实施草稿）

本次仅原 session.ts/chat-transport.ts 与两测试，protocol 只读；读取 R12 Model `0616403C078A530A98AB45C4F6AED49140E43D32EAEFC978CE08EFCAEFE5CC64`。新增 `prepareCodexRuntimeAdapter(options,role)`，在不 bind/compose/spawn/HTTP/写目录的前提下，用真实 settings/env/MCP 与 judge 覆盖解析同份配置。只有真正已证 Chat 工具闭包且无 MCP/websearch/未知自定义 engine/fetch/CLI 接缝时返回 adapter；其余 unknown，无 adapter。prepared adapter 绑定同一 resolved 私有快照，不二次读取新 env；role/config/registry/env 变化使 isCurrent false，绑定前拒绝。公开 configDigest 仅非 secret 的工具面计划形状；凭据/rawenv/secret hash 不进入事实或日志。真实 Chat registry 回报同次 factoryPlan 的 planId/configDigest。

验证复用既有本地 HTTP server：prepare 的 spawn/HTTP计数0、根目录前后不变、序列化事实无secret；prepared adapter实际 bind和HTTP toolcall 回绑真实实例/计划。错角色、配置/环境/registry变化、Responses/MCP/websearch/自定义接缝负例必须在构造前拒或unknown且0spawn。重跑原N2/lifecycle必要例和两文件回归、类型检查，原首红/Windows环境红保留。

### N3 已实施与当前证据

`session.ts::prepareCodexRuntimeAdapter(options:RuntimeProviderOptions,role:ResolvedRole):RuntimeNativeFactoryPreparation` 已实际导出。private `resolveCodexBinding` 由直接工厂与 prepared 工厂共用；prepared 工厂持有同次 config/environment/MCP 与克隆 role/tool 定义，bind/compose 及 Chat 构造前核私有 isCurrent，不二次解析环境。当前已证 Chat 的计划列表无进程来自实际 HTTP-only 创建分支；未证 Responses、MCP、websearch、custom fetch/engine/loader/CLI 无 adapter。judge 的真实 MCP 清空与 websearch 关闭由同份解析实施。Chat registry 透传私有 factoryPlan 引用；旧 direct 调用无该引用。

`13-n3-plan-surface-lifecycle.log`：新候选定向 12/12、exit 0，含三个 N3 例、原 N2 与 lifecycle。真正 prepared 默认工厂，prepare 观察 spawn0/HTTP0/profile-register0/root树无改，公开序列化无凭据、rawenv、secret hash；真实 bind 后 HTTP 工具调用一次且回报同planId/configDigest/native实例。模型/协议/role/tool name或handler/环境变化在任何 profile 注册或实例创建前拒；unsupported 分支0spawn/HTTP，judge有效覆盖可观察。

`14-n3-session-chat-regression.log`：最终断言补充后两文件 44 项，42 pass、1 原 Windows symlink EPERM、1 原 POSIX skip，exit 1；其中全部 12 个定向用例再次通过。`11-n3-typecheck-first.log`、`12-n3-typecheck-tests.log`、`15-n3-typecheck-final.log` 均 exit 0。本轮没有运行红；历史首红不覆盖。逐文件 hash 与实际来源追加在 manifest.n3，原 manifest 与 N2 记录保留。

此交付只完成本 owner 无副作用计划 producer 与真实绑定；Core token、共享 lease、全 actor 库存、Git 初始化/写权限及完整四链由原 owner 组合验证。本角色未写 Core/其他 owner、未 Git 提交/迁移、未调用真实模型、未改变系统权限。

## N4：Windows alias fixture 等价对照（实施草稿）

原失败实际是 `session.test.ts` 的 native 目录 `symlink(outside,nativeDirectory,"dir")` 创建阶段 EPERM，不是文件 symlink，也不是产品拒绝路径已得到验证。安全保证在 `src/provider/runtime/session-store.ts::checkDirectoryChain`：真实 lstat 的链接目录（含 Windows junction）必须在引擎创建前拒绝，越界 owned 目录不能被写入。

本次只改原测试：Windows 使用无需新增系统权限的真实 directory junction，其他平台保留原 dir symlink；先以 lstat/realpath 和通过 alias 读取 owned 越界 canary 证明路径确可穿透，再执行原产品拒绝与零引擎断言，验证 canary 不变，最后移除本人 canary 后保留原 outside=[] 断言。没有 skip、放宽产品拒绝、改安全原语或用 sandbox 拒绝冒保护。旧 EPERM 原始日志保留；后继只跑原两文件一次自然退出与当前主类型/diff检查。

### N4 实际结果

本轮生产 source 与 chat 测试均未改，只修改原 session 测试的目录 alias fixture。`16-n4-junction-session-chat-regression.log` 记录完整两文件一次自然退出：44 项，43 pass、0 fail、1 原 POSIX-only skip，exit 0。原 native-dir case 成功创建真实 junction，lstat 链接标记、realpath 指向 owned 外部目录、通过 alias 读取 canary 全成立后，原产品拒绝 regex、零 engine、canary 不变及 outside=[] 全通过。不是文件 symlink 的覆盖，不是 Windows symlink 创建权限被提升；原 05/09/14 的 EPERM 日志保持原样。

当前 `17-n4-typecheck.log` 为 exit 1，错误来自其他 owner `src/provider/trunk/impl/git-trunk-store.ts:21` 的 StoreRead 返回值缺 `path`，本角色未改该文件，已交统筹。本人定向 diff check exit 0；不能把该当前类型红写成全仓通过。source/test 当前 SHA 与来源追加 manifest.n4，原 N3 hash 和历史证据继续保留。未运行真实模型/账户，无生产源、依赖、OS 权限或 Git 操作改变。

## N5：真实 Chief 的有界决策工具集（实施草稿，2026-11-06）

R28 的 Core 已验证并克隆 ChiefDecisionExecutionContext，却只向 Provider 发送 judgeMode 和单工具 decide_pending_request。Codex 因既有 shell/governance judge 三工具冻结集校验拒绝，问题不在模型或HTTP。最小适配是单独的 Chief closed-tool 分支，不把 Chief 伪装成 judge，不放宽原 judge allowlist。

已向统筹请求 R 原 owner 冻结复用的 host-only `RuntimeProviderOptions.chiefDecisionContext?:ChiefDecisionExecutionContext`，由 Core 仅从既有已验证上下文透传；Codex 只消费该正式字段。Provider 再核有效 context、judge隔离标志、真实 built-in chief/governanceFunction 与恰一只 decide_pending_request，系统提示使用 Chief 身份和固定 request Goal。无普通读写/shell/派发/MCP、无持久化、搜索关闭，原 shell/governance judge 原隔离不变。

源仅既有 session.ts（chat-transport.ts无必要不改），测试仅原两文件：真实默认 Core/Codex＋本地 HTTP composer/handler 正例，错role/额外工具/缺或错hostcontext拒，原judge回归。回调保持pending的失败回执，不伪造客户批准；原 R28 首拒事实保留。无真实模型/远端/依赖/权限变更，必要定向/type/hash后短交。

### N5 已实际实施并冻结（2026-11-06）

等待 Q69 真正退出释放后，R29 已冻结复用字段；本轮只改 `src/provider/codex/session.ts` 与原 `test/codex-adapter/chat-transport.test.ts`。独立 `assertIsolatedToolSet` 消费 host-only context，核有效上下文、隔离标志、exact一个 decide_pending_request；prepare/compose/bind 再核 role.id=chief、built-in-governance、governanceFunction=chief。原 `assertJudgeToolSet` 未扩白名单。固定 request 作为 Chief Goal，不装作只读 judge；搜索/MCP/存储/技能与矩阵隔离复用原结构。chat-transport.ts/protocol.ts 未改。

生产 source 已 FROZEN：session.ts SHA256 `9D3227CBEC2F9D9F9524DB102AC81917DDD46D25FA3E17C0934594590D7DD71E`。已报统筹及 R，后续 Q 读窗期间无生产修改。

`20-n5-chief-native-judge-regression.log`：默认 Core 真实选择 Codex 工厂（无 providerFactories/engineFactory/chatFetch 替换），仅以 localhost HTTP 回复模型推理。真实 composer 是实际 Chief+固定 Goal，工具面只有 ans_decide_pending_request，真实 handler 收到精确 payload 一次并返回 pending/fixture-not-approved；第二次工具尝试受预算拒、shell未知工具拒、第二轮预算拒，native spawn=0。wrongrole、项目角色冒名chief、缺真实governanceFunction、额外工具、缺host context或非法写权context均构造前拒。原两文件及 shell/governance judge 完整四文件59项=58 pass/0 fail/1原POSIX-only skip，自然exit0；`21-n5-typecheck-final.log` exit0。

首次 `18-n5-chief-judge-first.log`/`19-n5-typecheck.log` 保留测试错误首红：DecidePendingRequestInput本不含roleId，原断言错误地从payload读身份。修正为真实session.roleId=chief及payload深等固定args后通过，没有新增字段/改产品/放宽决策断言。R28原默认拒绝仍作为历史缺口保留，当前是正式默认链的新证据，不是custom替身盖旧拒。此自测不代替客户批准、全队安全或后继独验。

## N6：Chat 无工具回答的历史保留（2026-11-07，实施草稿）

Q91原真实多轮请求发现第二次messages为system/user/user：chat-transport.ts在无tool_calls时先break，assistant仅在工具分支被追加。最窄修复为同一位置统一追加一次assistant：无工具也保存content及真实reasoning_content，有工具保留tool_calls；然后再决定退出循环。原historyMark及abort/fail/timeout回滚不变，不改变工具能力/Chief或judge身份。

只改已授权chat-transport.ts和原chat测试，补真实loopback两轮历史正例及前一成功轮之后失败/超时回滚，保原工具与abort回归；无真实模型/新依赖/协议改造。修复后source冻结交Q普通澄清小case接续，Q原断言与首红不改。

### N6 已实施并冻结

仅chat-transport.ts统一追加assistant后再无工具break，非空tool_calls才携带，真实reasoning_content保留；historyMark/abort/fail/timeout rollback与工具边界未改。生产FROZEN SHA3E4E4D875384A3CC0A284EDCF2C152FB618308C23FA7FBA24BEFF6122AC9BCA8。23-n6-history-first-red.log三个真实loopback例0pass/3fail/exit1，准确复现缺assistant；原断言不改，修后24-n6-chat-history-regression.log全Chat22/22/0skip自然exit0；25-n6-typecheck.log exit0。包括默认生产工厂真实两轮澄清、失败/超时仅回滚本轮且保留前轮assistant、原abort/工具/reasoning/N5回归。session/protocol/其他owner/Q断言未改，接口不变；只本地HTTP，无真实模型。Q整场景证据仍需后继实际运行。
