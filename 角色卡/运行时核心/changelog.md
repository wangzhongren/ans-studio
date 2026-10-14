# 运行时核心变更记录

- 2026-10-14：依据客户“可以的，你新建角色吧，然后开发吧”，建立角色与独立边界，加入运行时接入组，组内职责为组长。角色定义已按会话授权落盘；应用开发和测试尚未完成。

- 2026-10-14：完成 C1 中立类型、公共工具/schema、隔离 ANS store 与 Service 注入组合。补齐停止信号、bounded native abort、原生目录校验和实际自定义凭据剥离；公开接口与原始自测结果见 [C1 变更](docs/change/2026-10-14_change_runtime-core.md)。适配器与最终调用者接线另行验收。

- 2026-10-14 C1R：客户 callback 新增可选第二取消上下文，确认/选项入口捕获 signal/turnId/role/runtime，旧单参兼容；原 C1 证据保留并注明依赖变化。核心当前证据见 [取消上下文修复](docs/fix/2026-10-14_fix_customer-input-cancellation.md)，实际许可发行与旧卡失效由 O1/D1 接续。

- 2026-10-14 C1H：Service 增加 `readRuntimeSessionHistory` operation，委托既有 Provider 返回 Model 记录/回放，使 Pipeline 按相邻层读取历史；当前证据见 [Service 历史入口](docs/fix/2026-10-14_fix_service-history-entry.md)，C1R metadata 契约保持原样。

- 2026-10-14 C1T：Service 与私有 timeout helper 同源解析 Pi 既有环境时限，把同一有效值传入 Provider 和外层计时；显式原值/其他 runtime 默认不变。当前证据见 [Pi 内外有效时限](docs/fix/2026-10-14_fix_pi-effective-timeouts.md)。

- 2026-10-14 C1P：公共tools入口中止按工具返回既有失败语义，await后保留实际handler失败，迟到成功仍拒绝；权限/gate/signal未变。当前核心31/31与全仓typecheck证据见 [停止失败文案兼容](docs/fix/2026-10-14_fix_tool-abort-failure-messages.md)，Pi完整回归由P1属主重测。

- 2026-10-14 C1O：Service锁定外层已决定的timed_out/aborted/failed，后续inner清理terminal/stream错误不能覆盖，清理错误照实报告；当前33/33与whole typecheck证据见 [外层结果优先级](docs/fix/2026-10-14_fix_outer-terminal-outcome.md)。

- 2026-10-14 C1A：PromptOptions可选onTurnStarted在actualturn创建后、persist/native前同步一次回传readonly轮次/角色/runtime；前置拒绝不通知，observerthrow单failed释放active且无native工作。Core38/38与全仓typecheck证据见 [prompt开始确认](docs/fix/2026-10-14_fix_prompt-start-acknowledgement.md)，桌面闭包映射和实际渲染验收由原属主接续。

