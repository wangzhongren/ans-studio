# 重复事件与桌面回交独立验收

日期：2026-10-15。生产者：固定测试角色 root。用户授权：核查所有重复的调用、确认、回交并修复；由各实际源码所有者实施。状态：最终测试与桌面验证完成，项目管理已核对 13 个候选哈希并归档为 verified，见下方统一审查。

以前一次 dispatch_task 会出现两次“调用发起”，确认提示、输入及回交也可能重复。实际工具处理器没有因此执行两次：Pi 同时发出 SDK execution_start 与 tool_call hook 两份开始事件；输入又在核心持久化和适配器回显中进入两路；窗口与 UI 缺少可追踪到真实 turn/call 的合并规则。

## 修复与核验范围

| 所有者 | 实际修复 | 独立核验 |
| --- | --- | --- |
| Pi适配器 | 只从 SDK execution_start 发出开始，保留真实 callId、blocked 与 result | 九种工具、串并行、拒绝/异常场景自动覆盖；处理器未重复执行 |
| 运行时核心 | 实际接受输入后发一份 typed prompt-input；禁止生产适配器重复回显；传递原确认 callId | root 三引擎受控集成用例：同文不同 turn 保留、图片数保留、真实助手前缀文本不被删 |
| 桌面窗口 | 输入与工具真实身份传入实时和历史；blocked/result 不混成一个阶段 | 新鲜项目原生记录与 replay 一致，测试角色 11 个调用/11 个结果/11 个开始，无重复身份 |
| 桌面UI | 以项目、角色、引擎、turn、call、phase 合并同一事件；确认卡与工具生命周期合并 | 新任务派发一条、submit_report 一条、回交投递一条；重载后仍各一条，失败读取保留 |
| 桌面UI | 新项目清旧状态发生在首次渲染前 | 重载后导入无 sessions 同名角色副本，首次 DOM 四角色全“未开启”，未点角色前即正确 |

根因及契约详见 [PM 统一审查](../../../项目管理/docs/fix/2026-10-15_fix_duplicate-event-integration-review.md)、[Pi 修复](../../../Pi适配器/docs/fix/2026-10-15_fix_canonical-tool-events.md)、[核心修复](../../../运行时核心/docs/fix/2026-10-15_fix_run-shell-description.md)、[窗口修复](../../../桌面窗口/docs/fix/2026-10-15_fix_duplicate-display-identity.md)、[UI 修复](../../../桌面UI/docs/fix/2026-10-15_fix_event-duplication.md)、[首次渲染修复](../../../桌面UI/docs/fix/2026-10-15_fix_project-status-reset-order.md)。

## 桌面真实执行

使用正在运行的 Electron 桌面，经原生 UI 操作而非用 CLI 冒充界面验证。原 p-limit 副本中 request_choice、request_confirmation 各一次，已实际点击选择/确认；write_file/edit_file 各一次，文件落盘两行并读回。选择、确认卡各一份，完成状态各一次。后续原长会话发生压缩超时，该轮保留失败记录，未当通过。

新副本 `ans-real-p-limit-20261015-duplicate-retest` 无旧 sessions。桌面发出 DUP-FRESH-3，由 su 一次派发测试。测试读取实际源码、故意读取不存在文件（ENOENT 真实失败）、两次独立 node -v 均退出 0、分次 git、精确 npm test 31 项通过/退出 0、写自己报告、submit_report；主入口收到一次并只读核对。两个独立同文命令均保留。原生/replay 统计：su 10 调用/10 结果/10 开始，测试 11/11/11；重复 start 身份 0；su 两个实际输入 turn（用户任务和报告）各一份 typed input。重载最终 renderer 后派发和回交仍各一份。

最终顺序修复后，在另一无 sessions 副本首次导入，四角色立即“未开启”。随后 DUP-CHAT-4 普通聊天只一条输入及“普通聊天收到”回复，零工具调用、零回交，未自动产生“未报告”。

## 当前候选测试

- 最终 renderer SHA256：`cbd3a40459776306f04b12c24e66e7e0da5edab9eec9625f40311f7abd53df0a`；[完整源码/测试哈希](2026-10-15-duplicate-event-evidence/candidate-manifest.json)。
- 最终整套 `node --test 'test/**/*.test.ts'`：1259 总数，1258 通过，0 失败，1 个既有 Windows 专属跳过。[原日志](2026-10-15-duplicate-event-evidence/full-tests-current.txt)。第一次受限运行仅本地 HTTP listen 被沙箱 EPERM 阻断，原日志保留；允许本地监听后同命令完整通过。
- `npm run typecheck` 退出 0。UI 所有者当前候选专项：项目切换 7、重复 32、合并 12、完整 UI 98、单元 59 均通过，证据在其顺序修复记录。
- 独立旧回放断言曾使用不存在的 request_shell_verdict 工具名，已改为实际 report_shell_verdict，未放宽屏障断言。初始失败日志与最终通过日志均保留。
- `.env` 哈希与基线一致，未改凭据、配置或超时来通过。实际 Pi 在线验证；Claude/Codex 只做受控合同集成，未声称在线通过。

## 可复查证据与限制

[桌面重载前](2026-10-15-duplicate-event-evidence/fresh3-su-before-reload.ax.txt)、[重载后](2026-10-15-duplicate-event-evidence/fresh3-su-after-reload.ax.txt)、[原生与重放对照](2026-10-15-duplicate-event-evidence/fresh3-native-replay.json)、[新项目首次 DOM](2026-10-15-duplicate-event-evidence/status-new-project-first-dom.ax.txt)、[普通聊天 DOM](2026-10-15-duplicate-event-evidence/ordinary-chat-current.ax.txt)、[原项目真实复测](2026-10-15-duplicate-event-evidence/original-desktop-replay.json)。p-limit 红绿、独立验证和授权撤销见 [真实代码修改报告](../change/2026-10-15_p-limit-real-code-desktop.md)。

没有可靠 turn/call 身份的旧匿名日志仍保留，不按文本相同猜测删除；因此未承诺旧历史所有重复都能自动清理。真实不同 turn、不同 call、blocked 与失败 result 均保留。未复现同一有效会话句柄重复恢复通知，不新增猜测性的 sessionInstanceId 接口；真实重开与恢复通知不能当重复删掉。

最后普通聊天出现的一次配置更新提示与一次恢复提示已只读核查：root 新夹具写 JSON 时没有尾换行，su 自动收尾标准化后仅增加 LF（1491→1492 字节，语义相同）。配置内容哈希确实改变，触发真实 dispose/open；这是两个实际生命周期提示，不是同一事件重复。[字节核查](2026-10-15-duplicate-event-evidence/fixture-normalization.json)。

相关功能：[运行时核心](../../../运行时核心/docs/feature/runtime-core.md)、[Pi适配](../../../Pi适配器/docs/feature/pi-runtime.md)、[桌面引擎与事件展示](../../../桌面UI/docs/feature/runtime-choice.md)。
