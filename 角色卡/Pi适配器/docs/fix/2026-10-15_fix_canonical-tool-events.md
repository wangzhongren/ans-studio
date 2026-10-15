---
id: pi-canonical-tool-events
type: fix
title: Pi 同一次工具调用只发一个开始事件
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
revision: 1
---

# 同一次工具调用只发一个开始事件

用户在 p-limit 实际工作台看到派发、客户确认和其它工具连续出现两个“调用发起”，并要求核查回交投递。本上下文固定为 Pi 适配器，使用本角色 boundary.yaml Section 1，已依 PM 统一审核及 root 本轮 bugfix 派发实施并验证；未调用真实模型、未操作用户 ANS 窗口。现有功能导航见[功能导航](../../feature-map.md)，当前生产接入见[Pi 接入记录](../change/2026-10-14_change_pi-injected-runtime.md)。

## 根因和证据

`src/common/pi-adapter/real-adapter.ts:433-438` 的 tool_call hook 发“模型请求调用”，缺真实 callId；`:475-480` 的 tool_execution_start 又发“开始执行”且带真实 callId。两者都映射同一个 ANS kind tool_call。Core 转发和 handler 单次执行证据见[UI 调查](../../../桌面UI/docs/fix/2026-10-15_fix_event-duplication.md)及其真实 native/replay 计数；实际七种工具都呈两倍开始记录，不能据此断言执行了两次。

2026-10-15 本角色运行当前真实 SDK 的 fauxProvider 离线探针，工厂为当前出厂 buildGovernanceExtension，无网络、临时目录、in-memory native，结束 dispose 并删除临时目录。允许 probe 时 handler=1、SDK start/end各1、ANS tool_call=2；不在 allowedToolNames 时 handler=0、SDK start/end各1、ANS tool_call仍2，并有 hook denied 和执行失败两个真实结果事实。该结果证明删 hook 重复展示不会吞掉被拒绝工具的开始事实。

安装包 `pi-agent-core/dist/agent-loop.js:379/415` 先发 start，才进 prepareToolCall；`:493` 才运行 beforeToolCall，经 `pi-coding-agent/dist/core/agent-session.js:327-341` 进入 tool_call hook。hook block 变立即失败仍发 end。工具不存在、参数校验失败、截断响应也走 start/end，不能把 start 摘要理解成 handler 已获得授权或已实际执行。

探针基线 HEAD `27aa265ccb2092406edce6116e3b7c5bbfa6b6e8`；real-adapter SHA-256 `e4f3490c56017dcab40c13c1da248d704c17cc1f44efbd5920da5205451bd05e`；SDK agent-loop SHA-256 `4d56e5352826e0dbe324eedd2b632d19867aff8844d1f010b3cdcd34069da7fb`。探针只验证允许和 hook 阻断两个最小分支，未声称覆盖真实九工具、窗口或在线派发。

Pi `makeRolePrompt:597-607` 另发普通 message“用户指令：…”，Core 已持久化同 actual turn 的 user，导致 UI live 输入与历史输入具有两种表示身份。窗口独立投递证据见[窗口方案](../../../桌面窗口/docs/fix/2026-10-15_fix_duplicate-display-identity.md)。不按“用户指令”前缀过滤助手文本。

## 最小拟修方案

保留所有治理 hook 与执行 handler。删除 hook 中重复的 tool_call emit，唯一 canonical start 使用 SDK tool_execution_start，补真实 turnId/toolCallId 和语义 phase；摘要改为“模型请求调用”，避免声称 gate 前的调用已经执行。start 所用真实 SDK args 的 path 保留。hook denied 补真实 turnId/toolCallId，保留其原拒绝原因；SDK end 保留独立结果、ok/status/errorCode，不因同 callId 与 hook denied 相同而吞掉。phase 已按 PM 冻结为 start/result/blocked；本角色不改 Model。

Core 已协商由其实际 prompt 的 onTurnStarted/persist user、检查 signal 后，在 native prompt 前唯一发送 typed input echo：kind message，detail `{source:'prompt-input',text:原始text,imageCount?:number}`，顶层 actual turnId。Pi private makeRolePrompt/RoleSessionDeps 加 emitPromptInput 可选项，旧 standalone/helper 默认保留原摘要兼容并补同 typed marker，production bindRole 明确 false。真实用户输入、回交、派发输入的统一来源由 Core 负责，Pi 不根据正文猜来源或删普通助手消息。生产接线测试必须证明 Pi native 路径零 input echo、Core 统一路径恰一份；直接 helper 仍一份且图片原样传入。

此修复只改变展示事件源与身份，不改 shell:false、门禁、signal、公共工具回调、dispatch/report 去重或 settled 生命周期，不修改本轮 p-limit patch。duplicate/stale/end 报告事实必须继续外推，后续集成由其属主验证。

## 精准修改和验证范围

生产仅 `src/common/pi-adapter/real-adapter.ts`。测试拟新增 `test/pi-adapter/tool-call-events.test.ts`，必要修改 `test/pi-adapter/prompt-images.test.ts`、`test/pi-adapter/injected-runtime.test.ts`；文档只本角色 docs/fix、memo、api-spec 和 feature-map 的实际关联记录。Core/Model/Window/UI/Pipeline 文件均只读。

新测试需使用真实 Pi faux SDK 配合出厂扩展，验证一次真实 handler 对应一个 canonical start、一个 result；覆盖 read_file/write_file/edit_file/run_shell/request_confirmation/request_choice/dispatch_task/submit_report/report_shell_verdict 的统一映射。同文本不同 call/turn 分别可见；钩子白名单拒绝、旧 gate 拒绝、shell kill-switch 拒绝、工具缺失和参数校验失败保留真实 start/denied/result且 handler无副作用；顺序和并行两类 SDK 路径均确认。对 hook throw 保留失败 end，不能用删诊断掩盖失败。已知正确的缺 ID legacy条目不按文本猜重。

输入测试覆盖 standalone默认echo/显式关闭、图片数量及原样数据、生产注入关闭；普通 assistant正文恰含“用户指令：…”时保留。执行命令为 `node --test test/pi-adapter/tool-call-events.test.ts test/pi-adapter/prompt-images.test.ts test/pi-adapter/injected-runtime.test.ts`、`node --test "test/pi-adapter/*.test.ts"`、`npm run typecheck` 和 `git diff --check`。跨角色测试负责真实修后 native/replay与各工具回调次数、拒绝/中止/重复及迟到报告不丢失、输入 live/history两向合并；本角色单测不代替这些验收。

## 实施与真实验证（2026-10-15）

PM [统一审核 revision 1](../../../项目管理/docs/fix/2026-10-15_fix_duplicate-event-integration-review.md)依据用户“所有重复都修复”的明确 bugfix 指令冻结必要范围，root 下达实施。实际仅改 real-adapter.ts、tool-call-events.test.ts、prompt-images.test.ts、injected-runtime.test.ts；治理/handler/shell/目标 p-limit 文件未改。

真实 SDK 离线专项最终 **31/31通过**：九工具名称的注入 handler 各一次、start各一次、result各一次，顺序/并行两种路径；白名单/写闸/shell kill拒绝均handler零次且blocked+失败result继续存在；missing/invalid/gate throw仍失败；不同turn、迟到与重复失败end保留、legacy缺ID不猜。Service→真实Pi集成证明Core typed input恰一份，Pi raw生产零份，确认metadata原callId与start相同；direct默认typed一份、关闭后零份且图片原对象透传；带“用户指令”前缀的真实助手文本继续保留。

全 Pi 测试首次sandbox **208过/1红**，唯一红为既有本地loopback listen EPERM；受管提升同命令运行本地假HTTP服务（无在线API）后 **209/209通过**。此后仅新增Service集成断言，最终专项31通过；生产候选未再改。`npm run typecheck` exit0、`git diff --check` exit0。原始完整日志为 `/private/tmp/pi-event-suite-escalated.log` 与 `/private/tmp/pi-event-targeted-final.log`（本机临时证据）。

生产 SHA-256 `16d7264ac165f7ab85e0bd69bf7afb5b69b7e96cd3ed52d729c28fceb2477bae`；新SDK测试 `4227a46a752f1a119322730127990a736cc44943730c47584266fce7ec8fa40d`；injected-runtime测试 `55a3b21356b76ddedcfe1c63070894b06968a02f2ce0094c7ced1b60c5dbd41e`；prompt-images测试 `4459ecd8b298b1e60814b5450fe9630fd85ac362ede778b8adcc000893fa8796`。

状态：本角色实施和无网络单元/SDK/Service集成验证完成；用户窗口、真实账号及全跨角色UI验收仍由root/测试角色执行，不把Pi绿色声称为整批验收。没有日志改写、文本过滤或门禁放宽。
