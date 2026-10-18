# Pi 公开接口（ANS-RUNTIME-V2 revision 1 / P1）

中立类型单一入口是 `src/model/runtime.ts`。`src/provider/pi/session.ts` 显式转出原有 ToolCall/SessionEvent/PromptImage/PromptOptions/RoleSession/RuntimeAdapter、WriteGate/ShellGate、客户/操作者、报告、派发、审读及 Finalize 结果类型；新增 CustomerInputMetadata 也转出。没有第二份类型定义；已删除的 FinalizeBootstrapFn 不重建。

`createPiRuntimeAdapter(options: RuntimeProviderOptions): RuntimeAdapter` 是 Service 生产入口。只接受 runtime=pi；输入工具及交互闸、currentTurnId、storage 直接消费。SDK 仍只在 bindRole 时加载；composeContext 仅渲染角色文本。完整工具定义以注入的 inputSchema/description/promptGuidelines/executionMode/handler 为准；SDK execute 原 signal 与调用 ID 原样交给该 handler。客户 metadata 的取消身份由核心 handler 捕获，本适配器不换为后来轮次 signal。

同名 overload `createPiRuntimeAdapter(options: PiRuntimeAdapterOptions)` 保留旧 gate/projectRoot/skillRoot/provider 配置、交互/报告/派发/审读/shell、sessionDir 与时限用法。只在这个 legacy branch 通过 Pi public tools facade 构造核心工具；其实际 apiKeyEnvVar 也加入共享 shell 凭据剥离集合。旧显式 sessionDir 继续精确指定旧存储目录，供直接消费者兼容；Service 生产入口只用 injected storage 的隔离 nativeDirectory。

`src/provider/pi/tools.ts` 是批准迁移的窄兼容 facade：显式转出 `src/provider/runtime/tools.ts` 的 buildGovernedTools/buildShellEnv、工具名、shellKillSwitch、凭据常量，转出 `src/provider/runtime/schema.ts::describeTool`，工具/结果/options 型引用 Model。没有复制生产 gate、shell spawn 或客户 callback 实现。另一个实际窄 edge 为 `common/pi-adapter/tool-compat.ts` 仅显式转出同一 Core public schema operation，供原私有辅助 describeTool alias 与 name+handler 的 toPiTool 旧测试兼容。生产完整定义不走名称 lookup。生产 real-adapter 无 Core Provider/private common/peer adapter import 或重新构造工具；这些 facade 不授权一般 Provider 平级调用。

原 private helper `toPiTool`、`selectSessionManager`、`sessionFileHasForeignToolChangeBlocks`、`buildGovernanceExtension`、makeRolePrompt/makeRoleSession/wireSettledOnce 保留供既有测试。production hook 带精确 injected-name set：所有非注入名称执行前 block，native bash/write/edit/read 亦拒绝；native builtin tools 关闭，其他扩展发现关闭，构造后实际 active tool names 再核对。旧直接 hook fixture 无 set 时保留原写 gate/shell kill-switch 行为。

持久化：先调用 storage.validateNativeDirectory，再读取本角色 Pi native 文件；新建或迁移写前调用 prepareNativeDirectory。只在 native 无 JSONL 时读 Pi legacyDirectory；只扫描该目录直接子级 Pi JSONL，拒绝文件链接。旧文件复制到 native 后才交 SDK open，ID/上下文保留，SDK 之后不 append 旧角色目录。坏历史没有有效上下文则新建并返回 recovered+warning，不从 Codex/Claude 目录读取。目录链守卫由核心 storage callbacks 单一维护。

`RoleSession.runtime/roleId/nativeSessionId/contextSource/contextWarning` 在真实 SDK 构造完成后给出，Service 可保存实际状态。in-memory=没有持久化；fresh=无可用历史新建；resumed=SDK 管理器投影包含模型上下文并成功构造；recovered=恢复失败/无效历史后重建并附 warning。桌面旧词汇不能直接透传：核心 resumed 对应桌面“已恢复”，核心 recovered 对应“上下文已重建”。ANS replay 不表示恢复成功。

production prompt/abort：Service turn ID 注入到 Pi lifecycle，事件顶层及 detail 使用同一 ID。SDK settled 只暂存，prompt promise 结果确定后才发一次终态；首次明确中止/超时/失败不被清理错误改名。同一轮共享一次 native abort，空闲 stop 为 no-op，原生清理最多900ms，失败隔离会话；legacy direct helper 无 strictLifecycle 仍保留原 fixture 透传行为。等待客户或审核用原注入 InteractionGate 暂停整轮最后兜底。

Pi 时限显式值优先，缺省读旧 ANS_PI_PROMPT_TIMEOUT_MS/ANS_PI_CONSTRUCT_TIMEOUT_MS，再缺省 **300000（检查时限 5 分钟）** / 120000（构造）；Core C1T 现将同值一次注入 inner/outer。**整轮两层时限（客户裁定 2026-10-17）**：`promptTimeoutMs`/`ANS_PI_PROMPT_TIMEOUT_MS` 仅作看护到点检查，**不中止**主 prompt；主 prompt 与 G-5 重发用 `turnLastResortMs`（缺省 3600000，固定无 env，测试可注入），到点错误标记 `TURN_LAST_RESORT`、outcome 仍 `timed_out`；F-3-a 截断收尾补发段仍用检查时限有界。Pi配置的 contextWindow 仍接受旧显式字段或 ANS_PI_CONTEXT_WINDOW，缺省 500000（系统默认值；2026-10-17 客户裁定）并提示。

当前：迁移已实现，Pi 全部199/199（原185+新增14）与全仓strict tsc exit0，最终候选指纹见原记录。跨角色合并验收由各原属主完成。SDK固定 `@earendil-works/pi-coding-agent@1.1.0`，没有真实模型调用、真实 .env/持久凭据写入或提交。原始证据最终见 [P1 记录](docs/change/2026-10-14_change_pi-injected-runtime.md)，当前流程见 [Pi 功能](docs/feature/pi-runtime.md)。


## 2026-10-15 工具及输入事件身份修复

Pi唯一tool_call事件源为SDK tool_execution_start，detail带真实turnId/toolCallId/phase=start；治理拒绝phase=blocked，SDK结果phase=result，两者独立保真。生产Core注入路径Pi关闭自身input echo，消费Core唯一typed prompt-input；direct makeRolePrompt默认兼容旧摘要并提供source/text/imageCount。公共RoleSession形状未改，门禁与handler未改。实际验证与候选指纹见[本次修复记录](docs/fix/2026-10-15_fix_canonical-tool-events.md)。


## PI-A-1 统一工具显示接线（2026-10-15）

生产消费Model实际RuntimeToolEventSource/projector、ToolDefinition.displayInputRule与RuntimeProviderOptions的toolDisplayMode/projectToolEvent/registerToolDisplayProfile/toolDisplayCredentialEnvNames。required-v1缺函数SDK前拒绝，cfg实际选中键/值以同次env快照纯内存登记；legacy直接入口兼容。真实start/hook blocked/native result统一投影；execution只经私有callFacts桥到projector，SDK content和原安全details不新增execution或C对象。未知旧hook不借当前turn，原text/images与metadata双层剥离保持。见[实现及候选证据](docs/change/2026-10-15_change_tool-display-projection.md)。

## 2026-10-17 P3b 判断 agent（「替我审」）judge 模式

依据 PM 评审 `2026-10-17_design_shell-auto-approve-review.md` revision 2 §5.1/§6.1/§7/§十一 P3b。判断会话由编排以一次性非持久化会话创建，适配器只按注入的工具集开会话；只读工具与读取策略的唯一实现归运行时核心 `src/common/runtime-core/shell-judge/`。

**输入面（两面等价）**
- Service 生产入口：`RuntimeProviderOptions{ tools, judgeMode?: true, installedMcpServers: [] }`——工具已由装配层用 `buildShellJudgeTools` 定形，本层纯消费。
- legacy 直接入口：`PiRuntimeAdapterOptions.shellJudge?: ShellJudgeToolOptions`（或 `judgeMode?: true`）；本层自己只调 `buildShellJudgeTools`，绝不调 `buildGovernedTools`。

**判断模式的结构性保证（`src/provider/pi/session.ts` + `src/common/pi-adapter/real-adapter.ts`）**
- 工具面恰为 `judge_read_file` / `judge_list_dir` / `report_shell_judgement`；`judgeMode` 下 real-adapter 校验注入工具名必须全在该集合内，否则构造期抛「判断会话只允许 judge 只读工具」。
- 不构造/不注册 `write_file`、`edit_file`、`read_file`、`run_shell`、`request_confirmation`、`request_choice`、`submit_report`、`dispatch_task`、`report_shell_verdict`、MCP/网络/服务端工具；legacy 判断分支的写门禁置为 deny-all（纵深防御）。
- 不注入 ShellGate、客户交互、回交、派发能力（legacy 分支显式置空；生产分支由 Service 不注入表达）。
- 强制关闭原生能力：忽略 `ANS_PI_SERVER_TOOLS`（不注册 web_search/web_fetch）、忽略 `installedMcpServers`（零 MCP 装配、不加载 pi-mcp）、`noTools:"builtin"`。
- 不持久化：忽略 `storage`/`sessionDir`，会话管理器恒为 in-memory；不写 `.ans`、不写项目文件、不产生聊天/角色状态。`report_shell_judgement` 只把模型原始参数交给注入回调（规范化/合成归编排）。
- 未注入 `shellJudge`/未置 `judgeMode` ⇒ 普通角色会话路径逐字不变（受治理工具、ShellGate、交互/回交/派发、持久化与既有行为一致）。

**测试**：`test/pi-adapter/shell-judge.test.ts`（7 例，离线；假适配器 + pi-ai faux 进程内模型 + legacy 注入面）。专项 297 项 294 pass / 2 既有 Windows symlink EPERM / 1 skip；本角色 typecheck 0 错。

## 2026-10-18 P3b 治理卡判断 agent（「替我审批」/「替我决策」）Pi 接入

依据 PM 评审 `2026-10-18_design_judge-governance-cards-review.md` §六/§十二 P3b（P1 已冻结运行时核心的 `buildGovernanceJudgeTools`、`GOVERNANCE_JUDGE_TOOL_NAMES`、`ALL_JUDGE_TOOL_NAMES`、`GovernedToolsOptions.governanceJudge`）。本角色只做 Pi 侧接入；工具实现、读取策略、规范化与裁决全在运行时核心/编排。

**输入面（两面等价）**
- Service 生产入口：`RuntimeProviderOptions{ tools, judgeMode: true, installedMcpServers: [] }`——Service 注入 `governanceJudge` 时已用 `buildGovernanceJudgeTools` 把工具定形为恰三只治理只读工具，本层纯消费。
- legacy 直接入口：`PiRuntimeAdapterOptions.governanceJudge?: GovernanceJudgeToolOptions`（或沿用 `judgeMode?: true`）；本层只调 `buildGovernanceJudgeTools`，绝不调 `buildGovernedTools`。与 `shellJudge` **恰一**：同时给出在构造期抛「shellJudge 与 governanceJudge 互斥」（假适配器在 `bindRole` 抛同款错误），不静默择一。

**结构性保证（`src/provider/pi/session.ts` + `src/common/pi-adapter/real-adapter.ts`）**
- 治理 judge 工具面恰为 `judge_read_file` / `judge_list_dir` / `report_governance_judgement`；`judgeMode` 下 real-adapter 的 allowlist 改为运行时核心并集 `ALL_JUDGE_TOOL_NAMES`（恰四名：两个 report 工具）；并集**只用于 allowlist，不用于装配**——每次会话实际注入的仍恰是某一方三只工具。非并集工具（`write_file` 等）在构造期抛「判断会话只允许 judge 只读工具」。
- shell judge 会话装配不变：仍只走 `buildShellJudgeTools`，恰三只 `SHELL_JUDGE_TOOL_NAMES`；其行为与 allowlist 语义（三只均被放行）不回归。
- 不构造/不注册写、编辑、shell、客户交互、回交、派发、MCP/网络/服务端工具；legacy 判断分支写门禁 deny-all（纵深防御）。
- 强制关闭原生能力：忽略 `ANS_PI_SERVER_TOOLS`、忽略 `installedMcpServers`（零 MCP 装配）、`noTools:"builtin"`；不持久化（忽略 `storage`/`sessionDir`，会话恒 in-memory）。
- `report_governance_judgement` 只把模型原始参数交给注入回调（不规范化/不裁剪）；规范化、required-read、逐路径机械复核在编排侧。
- 未注入任何判断能力 ⇒ 普通角色会话路径逐字不变（受治理工具、ShellGate、交互/回交/派发、持久化与既有行为一致）。

**测试**：`test/pi-adapter/governance-judge.test.ts`（8 例，离线）：工具集常量（治理恰三、shell 恰三、并集恰四）；假适配器治理模式工具面/未知工具/report 原样/文件未变；两能力互斥；普通路径不回归；真实 faux 适配器 judgeMode 工具面 + 服务端/MCP/持久化关闭；非 judge 工具构造期拒绝；legacy `governanceJudge` 直连分支与构造期互斥。专项 305 项 302 pass / 2 既有 Windows symlink EPERM / 1 skip。
