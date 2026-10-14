---
id: chat-handback-scope
type: fix
title: 普通聊天不自动产生任务未报告回交
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented
revision: 2
related: [task-handback]
---

# 普通聊天结束后，不让主入口误判已完成任务

编排角色方案 revision 2 已经项目管理审核并经客户确认实施，现已完成本角色源码、测试和说明。以下方案内容保留为审核依据；真实桌面复测仍待测试角色完成。当前功能见[任务回交](../feature/task-handback.md)。

## 已确认的症状和根因

[真实桌面验证](../../../测试/docs/change/2026-10-14_change_desktop-real-project-validation.md)记录：正式派发完成并 submit_report 后，再给测试角色发送 Q1/Q2「只回复收到、不提交报告」，两个独立聊天轮次均产生 unreported 回交并自动投递 su。su 把聊天回执混入原任务验收，误判原 completed 尚未闭环。

调用链是 `app/desktop/session.ts::sendDelivery` → `openRoleSession().send` → Runtime Core `prompt` → `withHandback` → 桌面投递 su。桌面 DeliveryItem.kind 已精确区分 dispatch/message/handback；sendDelivery 只传 PromptOptions 中的图片和真实开轮确认回调，未把本次派发来源传给编排。编排 `withHandback` 对每个首次 settled 无条件生成回交；无有效报告便生成 unreported/blocked。因此普通聊天也被认成需要任务报告的工作。当前 session 级 taskId 也不能表达复用会话里的本轮任务来源。此次不是同轮去重失效，不能用隐藏界面行或加强去重修复。

Model `src/model/runtime.ts::PromptOptions` 只含 images/onTurnStarted，主属运行时核心；`onTurnStarted` 是 Core 在建立真实轮次时同步发出的确认，已有 turnId/roleId/runtime，足够绑定调用来源，不需要新增 Model 字段或适配器能力。

## 拟定行为与最小接口

编排公开定义 `RoleSessionSendOptions extends PromptOptions`，增加编排专用 `handback?: { required: boolean; taskId?: string }`，并将 RoleSessionHandle.send 的可选第二参数声明为该类型。原 PromptOptions 仍可结构兼容传入。该 handback 数据只在 Pipeline 消费，剥离后交 Runtime prompt，不进入模型提示、不作为写授权、不扩张 Model。

桌面窗口根据投递条目显式设置：dispatch 为 required:true；message 与 handback 为 required:false。包括排队、重试、图片发送，都从实际投递条目得到来源，不能用正文 `[派发]`、上一轮任务、角色是否繁忙或已存在的回交判断。派发任务当前没有可靠业务 taskId，允许不填，不把去重键或时间戳伪装成业务任务编号。

本轮 required:true 表示正式任务，required:false 表示普通聊天；两者都仍可主动 submit_report。默认规则：没有 per-send handback 时，既有 input.taskId 非空的调用保留任务会话兼容；没有 input.taskId 的 send 按普通聊天处理。显式 required:false（chat）必须覆盖 session taskId，且主动报告不得继承被覆盖的旧 taskId。这让旧任务调用继续获得兜底报告，桌面新路径按轮明确来源。

| 本轮来源 | 有合法 submit_report | 无合法 submit_report |
| --- | --- | --- |
| 正式派发/task | 正常终局报告原结论；失败/超时/中止覆盖为真实终态 | 继续返回 unreported/blocked/failed/aborted |
| 普通聊天/chat | 保留主动回交；失败/超时/中止仍覆盖报告为真实终态 | 不生成 handback，原事件与 settled 完整透传 |
| su 治理会话 | 现状不注入报告能力、不自我回交 | 现状不自我回交 |

非法报告不把聊天升级为任务；已有合法报告不被非法报告覆盖。聊天即使写过文件、遇拒绝或运行失败，也不凭这些事件制造任务报告；原聊天事件仍显示真实结果。

## 本轮绑定、清理与兼容

send 在调用 runtime prompt 前定格来源，并组合既有 onTurnStarted：Core 真正开轮时，按确认的 turnId 保存本轮上下文，再转调调用方回调。必须核对 runtime/roleId/非空 turnId；不能把任意最早到达的事件猜作本次 send。withHandback 增加本轮上下文查询入口，在终局查同轮任务属性，决定是否生成；报告、证据、上下文均按同轮消费，即使 chat 被跳过也执行 completed 清理并登记 finished，防止迟到报告或重复 settled 污染之后任务。

只对未提供真实 metadata 的既有串行替身保留一轮上下文降级，与现有 legacyReport/legacy settle 行为对齐；不宣称它能识别交错轮次。真实 Runtime 没有开轮确认时不把调用上下文绑定到未知事件，诊断记录关联缺失，不静默借用其他轮次。prompt 在开轮确认前抛错时移除待关联上下文；确认后抛错依 Core 终局事件收口，不能重复造回交。dispose 清空上下文。

无新增编排选项的旧 send 保留现有 PromptOptions 同一引用与单参数调用形式；设置 handback 时剥离专用字段并按需组合回调，images 数组保持原引用。确认回调需要组合时明确属于新来源绑定路径，不要求 options 整包引用等于原包，但回调必须恰一次转达。

withHandback 纯辅助函数的旧直接调用可保留默认任务语义；openRoleSession 必须提供明确上下文查询，修复真实入口。不能只让桌面丢弃已生成的假回交。现有终态覆盖、报告校验、稳定去重键、先 handback 后 settled 的有效回交顺序保留。

## 精确修改范围和跨角色交付

编排源码仅 `src/common/编排/handback.ts` 与 `src/pipeline/orchestration/run-role.ts`；拟修改本角色测试 `test/编排/handback.test.ts`、`test/编排/handback-lifecycle.test.ts`、`test/编排/session-abort-images.test.ts`，新增 `test/编排/chat-handback-scope.test.ts`；文档在本角色已授权导航、API、memo、变更记录和 docs 目录。没有新增边界需求。不改 src/model/runtime.ts、Core、Provider、app 或同伴测试。

桌面窗口另行修改自己拥有的 `app/desktop/session.ts`，把 RoleSessionSendOptions 用于投递的编排入口，按上表传 per-send handback；不把选项发到 renderer IPC，不新增用户开关，不改变 dispatch 受理/队列授权。测试角色承担完整桌面真实复测。跨角色方案由项目管理评审协调后，客户确认本版才实施。

单次 `runRole` 使用另一条一次性 CLI 路径，当前直接消费 SessionEvent，不挂 withHandback；保持其正式 taskId、退出码及生命周期行为，不为本次修复新增回交功能。`openRoleSession({taskId:"T1"})` 型 CLI/集成任务保持逐轮任务兼容，须继续通过 `test/测试/t1-pipeline-integration.test.ts` 既有 aborted/unreported/completed 断言。

## 必要验证范围与实际结果

1. 编排底层：chat 无报告首次/重复 settled 均无 handback；task 无报告继续 unreported/blocked；task 失败/超时/中止保留真实终态；chat 主动合法报告仍回交且终态优先；非法报告与迟到报告不串轮。
2. 编排真实入口假运行时：同一 handle 的 task completed → Q1/Q2 chat → 新 task 的事件及上下文分别绑定真实 turnId；旧 taskId 不污染显式 chat 主动报告；每轮清理、重放、dispose、开轮前异常及开轮后失败行为正确。
3. 兼容：旧 input.taskId 调用、纯 PromptOptions/图片/单参调用；旧串行替身；原 onTurnStarted 恰一次执行，图片原引用；编排私有选项不传 runtime。
4. 执行编排专项与 typecheck；修改依赖后由桌面窗口运行其投递来源和队列相关测试，测试角色运行受影响整链回归。无需扩大到无关功能。
5. 真桌面重复现有项目 dispatch → completed → Q1/Q2 只回复收到：确认无新 unreported 行、su 无新回交待办、原 completed 不降级；再派发缺报告、失败/停止任务及普通聊天主动 submit_report，核实必要回交仍能自动到达 su。停止轮需运行时实际支持；不支持不能记作已验证。

本方案无可选增强项；新增业务 taskId 协议、原有回交文案重写与全仓层结构整理不属于修复必要范围。

拟运行命令：`node --test "test/编排/*.test.ts"` 与 `npm run typecheck`；测试角色核实 T1 集成并按[独立验证方案](../../../测试/docs/fix/2026-10-14_fix_chat-handback-verification.md)完成跨角色和真实桌面验证。只有当前候选实际通过才填入结果。


## 编排实施证据

实际修改两件源码、三件既有单测及一件新增单测，范围与 revision 2 一致。`RoleSessionSendOptions` 公开 bool 契约，handback 专用字段不进入 Runtime；onTurnStarted 实际确认绑定 turnId，跳过 chat 仍调用 completed 清理并登记终局；主动合法报告保留，显式 chat 不继承旧 taskId。旧 input.taskId 的任务默认和原 runRole 路径不变。代码未新增层依赖，只引用既有 Model metadata 类型。

macOS / Node v24.14.0，假运行时及临时项目、无网络模型。`node --test 'test/编排/*.test.ts'` 247/247通过，0失败/跳过（日志 `/private/tmp/ans-orchestration-chat-tests.log`）；`npm run typecheck` 最终 exit 0。此前 typecheck 的测试角色在途 TS 错误已由其属主修正，未由编排越界编辑。单测实际覆盖派发完成→Q1/Q2→新任务延迟消费、聊天主动/非法报告、失败/超时/中止、未知真实ACK、legacy收口及开轮前抛错、写证据不串轮、原ACK只转调一次、图片原引用与专用字段剥离。T1跨角色任务集成和真实桌面仍由测试角色核实，此处不声称它们已通过。

源码候选 SHA-256：

- handback.ts：`a6782edd274eea3d85bcd75109b3de43eaa2e53ad115a4e965a999bdbdd886a8`
- run-role.ts：`000fb82b9bd3d7ecca59fcbca66aed6d92c188583b7ea83dd13517b54aa2e621`

未提交 Git、未修改权限/Model/Core/Provider、未重启桌面、未运行真实模型。遗留无 metadata 串行替身不保证交错轮次，这是已有兼容限制；实际线上来源由 Core真实ACK隔离。
