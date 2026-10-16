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
