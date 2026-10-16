# 运行时核心变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组长。角色定义已按会话授权落盘；应用开发和测试尚未完成。

- 2026-10-14：完成 C1 中立类型、公共工具/schema、隔离 ANS store 与 Service 注入组合。补齐停止信号、bounded native abort、原生目录校验和实际自定义凭据剥离；公开接口与原始自测结果见 [C1 变更](docs/change/2026-10-14_change_runtime-core.md)。适配器与最终调用者接线另行验收。

- 2026-10-14 C1R：客户 callback 新增可选第二取消上下文，确认/选项入口捕获 signal/turnId/role/runtime，旧单参兼容；原 C1 证据保留并注明依赖变化。核心当前证据见 [取消上下文修复](docs/fix/2026-10-14_fix_customer-input-cancellation.md)，实际许可发行与旧卡失效由 O1/D1 接续。

- 2026-10-14 C1H：Service 增加 `readRuntimeSessionHistory` operation，委托既有 Provider 返回 Model 记录/回放，使 Pipeline 按相邻层读取历史；当前证据见 [Service 历史入口](docs/fix/2026-10-14_fix_service-history-entry.md)，C1R metadata 契约保持原样。

- 2026-10-14 C1T：Service 与私有 timeout helper 同源解析 Pi 既有环境时限，把同一有效值传入 Provider 和外层计时；显式原值/其他 runtime 默认不变。当前证据见 [Pi 内外有效时限](docs/fix/2026-10-14_fix_pi-effective-timeouts.md)。

- 2026-10-14 C1P：公共tools入口中止按工具返回既有失败语义，await后保留实际handler失败，迟到成功仍拒绝；权限/gate/signal未变。当前核心31/31与全仓typecheck证据见 [停止失败文案兼容](docs/fix/2026-10-14_fix_tool-abort-failure-messages.md)，Pi完整回归由P1属主重测。

- 2026-10-14 C1O：Service锁定外层已决定的timed_out/aborted/failed，后续inner清理terminal/stream错误不能覆盖，清理错误照实报告；当前33/33与whole typecheck证据见 [外层结果优先级](docs/fix/2026-10-14_fix_outer-terminal-outcome.md)。

- 2026-10-14 C1A：PromptOptions可选onTurnStarted在actualturn创建后、persist/native前同步一次回传readonly轮次/角色/runtime；前置拒绝不通知，observerthrow单failed释放active且无native工作。Core38/38与全仓typecheck证据见 [prompt开始确认](docs/fix/2026-10-14_fix_prompt-start-acknowledgement.md)，桌面闭包映射和实际渲染验收由原属主接续。


## 2026-10-15 输入与请求显示身份修复

按客户既有缺陷修复授权及PM统一r1实施Core v2：统一typed输入、透传确认/选择原callId、demo生产单输入、run_shell两处argv说明。实际行为回归57/57、tsc0，独立消费者/桌面验收待续；无执行/门禁/权限变化。见[修复与原始证据](docs/fix/2026-10-15_fix_run-shell-description.md)。

## 2026-10-15 CORE-A/C-1

实施批准A4/C2文本政策1：受保护工具详情、旧native历史纯桥、真实结构execution、bound报告保存/目标receipt及仅保存恢复。原工具message/执行/门禁及给模型的交接原文保持，C历史另存有界显示副本。必要live三身份字段按PM同意图裁定兼容补入，旧live/disabled保留、不暗建目录。实际自测、原红与单调执行事实修复见[实施记录](docs/change/2026-10-15_change_complete-flow-core.md)；消费者整合与独立桌面待验。

### 2026-10-15 普通引擎失败的显示边界

修复无工具事实的accepted/denied被当工具的问题，live/history共用结构判断；保真实失败、身份与安全文本，丢未知raw侧车，不修改原工具投影或公共API。Core77/77、原独验1/1；[修复与依赖指纹](docs/fix/2026-10-15_fix_non-tool-event-routing.md)。

## 2026-10-16 kanban-live 修复实施轮（F-1 命令级执行时限 / F-7 shell 语法守卫 / F-8-a 非零退出语义）

按客户 2026-10-16 批准（PM 评审 §客户批准记录）实施：[F-1 命令级执行时限](docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md)——`ANS_PI_SHELL_EXEC_TIMEOUT_MS`/选项 `shellExecTimeoutMs`/默认 600000（只可调大不可禁用），到期经与「停止本轮」共享的幂等 `terminate()` 终止（SIGTERM→250ms→SIGKILL→1000ms 预算不变；F-1-opt1 进程树：POSIX 进程组、Windows `taskkill /T /F`），结果如实「超时已终止（N ms）」+部分输出+`execution.timedOut/timeoutMs`，**轮次继续**；新 diagnostics `shell.exec.start/timeout`。F-7 执行层 UX 守卫（必需+opt1+opt2）：独立操作符 token 与内嵌/展开检测在 ShellGate **之前**拒绝（不 spawn+明确文案+`shell.guard.blocked`），口径与 splitCommand 同源——引号内与反斜杠前导不误杀（`grep "a\|b"`/`grep a\|b` 回归在案）。F-8-a 投影措辞：进程跑完+退出码非零 → 「已执行完成（退出码 N）」，ok/status/kind/errorCode 与消息文本不变；`display.process.timedOut` 供桌面结构化消费。另按批准落两处 schema 文案：F-5-opt2（request_confirmation「写盘一律先经本工具确认」）与 F-3-c（submit_report 输出上限引导）。F-9-opt2 立项评估另出[评估文档](docs/design/2026-10-16_design_f9-opt2-tool-result-size-window-linkage.md)（无改动）。

实测：`node --test 'test/runtime-core/**/*.test.ts'` **94/94**（基线 77+新 17）；`npm run typecheck` 0 错；全量 `node --test 'test/**/*.test.ts'` **0 失败**（最终复跑 1459/1458 通过、1 跳过；工作树另含其他角色并行实施改动）。Windows taskkill 分支未真机执行（本机 darwin）；`shell.exec.*` 的 `timeoutMs` 字段在共享 diagnostics FIELD_NAMES 增列前生产落盘会被丢弃（只回报不改）。状态：**已实施待验证（未部署）**；独立验证与真机复跑待后续轮次。

### 2026-10-16 su 预置许可例外（客户裁定配套）

按客户 2026-10-16 裁定（su 写 `docs/su/**` 与 `docs/contracts/**` 免逐次审批；编排预置机制、门禁引擎 su 卡文本同日各自落地）同步 `request_confirmation` 工具文案：描述与 guideline[0] 补「**唯一例外（仅内置治理角色 su）**——两棵目录树写盘许可已预置、无需逐次确认、直接写即可（开会话与重建后均生效）；两棵树之外的一切写盘仍须逐条确认」；必备语义（写盘一律先经本工具确认 / preview 逐条列路径 / `confirmed:true` 唯一凭据 / 未获同意不写盘 / 列出路径≠获准）逐字保留，例外显式限定 su、非 su 语义不变。登记见 [kanban 修复实施记录·配套修订](docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md)。实测 runtime-core 95/95、typecheck 0 错、全量 1504/1503 过 0 红；未 commit。

## 2026-10-16 G-1 实施轮（V1 最小闭环·A4：dispatch_task 文案同步）

按客户 2026-10-16 批准 G-1 与设计规格（[设计 §四/§九 A4](../产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md)；PM 派发「运行时核心＝`dispatch_task` 描述同步」）同步工具文案：`dispatch_task` 描述与 promptGuidelines 新增「**多角色/跨角色协作先落盘再派发**」（契约 `docs/contracts/<name>-v<N>.md`、工作流 `docs/workflow.md`）与「任务文本**按地址引用**、**不内嵌契约全文**」——「必读（按序）」块由投递系统附上、sha256 投递当刻计算（su 不手算/不转抄）；契约缺失**拒投**（如实回执）、workflow 缺失降级不拒投并如实标注；`task` 参数英文描述同步。既有必备语义逐字保留（派发≠授权/不代授权/任务自足/返工带证据），不扩权限、不动判定（纯文案）。登记见 [A4 修复记录](docs/fix/2026-10-16_fix_dispatch-task-address-reference.md)——含一处派发前提修正（预授权仅 `docs/su/**`+`docs/contracts/**`，`docs/workflow.md` 走确认制 preview；见记录 §如实标注）。实测：runtime-core **96/96**（基线 95+新 1）；typecheck 0 错；pi-adapter 全目录 **232/232** 不回归；全量 **1519 计/1518 过/0 红/1 跳过**（定稿后于工作树末态复跑，含编排 A1/门禁引擎 A3 并行改动）。未 commit；未触碰真机轮目录与测试证据目录。

## 2026-10-16 G-2 实施轮（V1a+V1b 同轮·R1/R2：看护只读工具与恢复提议）

按客户 2026-10-16 批准 G-2（9 待裁点全采纳；工具名采纳 `role_status`/`session_tail`/`propose_recovery`）与设计规格（[设计 §四/§六/§十](../产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md)）实施运行时核心 R1/R2：`src/model/runtime.ts` 中立类型（**承载契约单一来源**）`RoleStatusPayload`/`RoleStatusFn`、`SessionTailPayload`/`SessionTailFn`、`WatchdogToolResult{ok,text?,message?}`、`RecoveryAction`/`ProposeRecoveryPayload`/`RecoveryOutcome`（恰四值 `executed|declined|unsupported|error`，后三值一律未执行）/`RecoveryReceipt`/`ProposeRecoveryFn` + `GovernedToolsOptions` 三能力位（全可选，旧调用方逐字兼容；`RuntimeSessionOptions` 经 `Omit` 继承+`...options` 自动透传，service 无需改）；`tools.ts` 三 maker 与「注入才注册」（未注入⇒工具不存在，沿 dispatch_task 先例；su 限定判据在**注入端**＝编排 `suppressHandback`/桌面 `role.builtIn`，本层不造第二判据）+ 读类回执归一（`WatchdogToolResult`；契约外 fail-honest）+ `truncateUtf8`；`schema.ts` 三工具文案（只读/8 KiB 截断如实 `truncated`/失败「不可用＋原因」不编造/受保护投影脱敏边界/「**提议 ≠ 执行**」「无客户确认＝零执行」「不得承诺」「evidence 必填」「未获执行不得当成功」；负向断言防暗示授权）。行为要点：role_status 查询归一（缺省/空串＝概览、非字符串 roleId 拒绝不静默退化）、8 KiB UTF-8 **字节**截断（不劈码点；8192 不截/8193 截边界钉住）、数据源 `{ok:false,message}`（如诊断不可用）原样如实转达；session_tail 行数归一缺省 40 上限 200（超限前缀如实标注、非法拒绝且不触达数据源、「无会话历史」如实）；propose_recovery 严格三值枚举校验（非法不调能力）、回执四值如实（`executed` 唯一可称已执行；declined/unsupported/error/契约外一律 fail-closed）、等待期间挂活动闸（G-1 语义、finally 收口）、中止「未获结果」不假设已执行。**跨上下文收敛**：本批与编排/桌面窗口并行对表——承载契约最终**单一来源＝`model/runtime.ts`**（编排 `common/编排/watchdog.ts` 现 re-export 同一符号、`withWatchdogCapabilities` 并入适配器选项即被本层读取）；**发现并留档**：该并入路径的交集类型会使形状漂移**静默通过 typecheck**（与 O1 文档预期相反），本批靠逐字对表＋独立验证收敛（见 [fix 记录](docs/fix/2026-10-16_fix_g2-status-tools-recovery.md) §跨上下文对齐）。测试：runtime-core **104/104**（基线 96+8 新；「注入才注册」用例扩为 12 工具全注入）；typecheck 本层 0 错（观察：本批其他上下文在途文件仍有其收口面 TS 错，非本边界，已如实登记）；pi-adapter **232/232**、claude+codex **54/54** 不回归。登记见 [fix 记录](docs/fix/2026-10-16_fix_g2-status-tools-recovery.md)——含给桌面窗口 W1/W4/W5 与编排 O1 的接口点（透传三字段、注入端两处判据、session_tail 走受保护投影禁裸 JSONL、`ProposeRecoveryFn` 须 resolve 且等待被中止后按 §6.2 以 `kind:"system"` 投执行回执）。如实标注：端到端可用性依赖本批其他上下文落地（注入前工具不注册＝现状行为，fail-safe toward 现状）；未 commit；未触碰 kanban-live-3、`/private/tmp` 与证据目录。

## 2026-10-16 CI 修复轮（v1.1.0 发布 CI：Windows 信号断言平台分支化）

CI 修复（纯测试面，`src/` 一行未动）：v1.1.0 发布 CI 的 Windows runner 全量回归 **1667 计 3 红**，全部落在本角色 `test/runtime-core/shell-exec-timeout.test.ts`（:45 F-1-a、:76 F-1-opt1、:171 F-1-b）。根因单一：`signal === 'SIGTERM'/'SIGKILL'` 断言假定 POSIX 语义——Windows 上 `taskkill /T /F` 与 `child.kill()` 均走 TerminateProcess，被终止进程 close 事件的 signal 恒为 null（`execution.signal` 缺省）；三条失败落点之前的实质断言均通过，**产品行为无缺陷，是测试的平台断言问题**。修点：新增 `assertKillSignal(actual, posixExpected, why)` 平台分支助手——POSIX 逐字断言不变；Windows（`process.platform === 'win32'`）只断言「signal 为空（undefined）」，**进程确已终止**沿用各用例既有等价证据（F-1-a「超时已终止（300 ms）」文案仅 close 事件路径产出 + 短收口耗时；F-1-opt1 late 写入不出现；F-1-b 中止文案）；用例不 skip、实质断言全平台照跑，只分支「信号名」一点。本机复跑（macOS arm64 / Node v24.14.0）：runtime-core **104/104**；typecheck **0 错**；全量 **1667 计 / 1666 过 / 0 红 / 1 skip**。分支激活抽查（本机 `--import` 强制 win32 模拟）：与原 CI **同三例恰 3 红**、失败点均仅信号名断言（其余全绿），未发现文件内其他平台假定。如实标注：**Windows 真机侧以 CI 复跑为准**（本机 darwin 无法直证 TerminateProcess 行为）。登记见 [fix 记录](docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md) §CI 复跑修订。未 commit；未触碰 `kanban-live-*` 与 `/private/tmp`。

## 2026-10-16 CI 时序健壮化轮（v1.2.0 发布 CI：macos-15-intel 慢 runner 微小时限）

CI 修复（纯测试面，`src/` 一行未动）：v1.2.0 发布 CI（run 38881759770）macos-15-intel 上 2 红（mac arm64 / Windows 同 run 全绿——runner 速度变异性）：250ms 级「微小时限」与**进程启动开销**赛跑——快命令被时限先收口、派生孙进程的 pid 尚未来得及写盘。修点（`test/runtime-core/shell-exec-timeout.test.ts`，**不放松语义、不 skip**）：微小时限统一 **2000ms**（远高于最坏启动开销；挂起场景仍由长挂起照触发、到期必终止）、等待/收口上界统一 **8000ms**（=时限 2000 + SIGTERM→250→SIGKILL→1000 清理预算 + 慢 runner 抖动余量）、F-1-opt1 late 写入/检查时刻同步重定时（600→3200ms / 400→2800ms，**检查点晚于写入点、断言非空转**）、env 解析 fixture 250→2000 断言同步、`fixtures.until` 增可选上界（默认 1500 不变——其余调用方逐字不变）本文件两处传 8000；Windows 平台分支信号断言逐字保留。本机复跑（macOS arm64 / Node v24.14.0）：该文件 **7/7 ×3（两次干净复跑 + 一次 2×CPU 竞争压测）**、runtime-core 全目录 **104/104**、typecheck **0 错**、全量 **1679 计 / 1678 过 / 0 红 / 1 skip**（改前同计数，0 新红）。**关键发现（如实）**：CI 那两条红的逐字落点为 `test/测试/kanban-fixes-verify/f1-timeout.test.ts`（非本文件；本文件在同 run 7/7 绿）——其同口径健壮化（spec 见 fix 记录；已在本机临时验证副本上于高 CPU 竞争负载下 4/4 ×2 通过、副本已删原文件未动）＋ release overlay 显式列入是复跑全绿的剩余前提。**归因更正与 overlay 改列（2026-10-16，装配）**：装配按最小差集将 f1-timeout.test.ts 以精确路径列入 release overlay files（同目录 f2~f8 及其余 test/ 仍 excluded）、并将本文件移出白名单——**本文件硬化与 `fixtures.ts` 配合改动（原列入决定因归因更正撤销：真红＝f1-timeout 镜像用例）随 v1.2.0 发布后的 main 常规批次提交，不入本 overlay**；f1-timeout 硬化已由属主在工作树落地（microMs=2000 / boundMs=8000 / pid 轮询 ≤10s 口径）。**慢 runner 消解以 CI 复跑为准**。登记见 [fix 记录](docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md) §慢 runner 时序健壮化。未 commit；未触碰 `kanban-live-*`、`/private/tmp` 与在飞他方改动（app/renderer、装配 policy）。
