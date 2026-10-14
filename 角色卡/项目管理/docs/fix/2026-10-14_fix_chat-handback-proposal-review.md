---
id: chat-handback-proposal-review
type: fix
title: 普通聊天误回交的跨角色方案审核
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
revision: 2
related: [chat-handback-scope, desktop-chat-handback-origin, chat-handback-independent-verification]
events:
  - date: "2026-10-14"
    kind: created
    summary: 核查底层无条件回交与桌面来源丢失，协调统一逐轮回交契约
  - date: "2026-10-14"
    kind: designed
    summary: 两属主已统一 required:boolean revision 2，项目管理推荐批准最小修复
  - date: "2026-10-14"
    kind: implementation-authorized
    summary: 客户明确确认审核 revision 2 并授意属主实施及测试角色桌面复测
  - date: "2026-10-14"
    kind: verified
    summary: 当前候选哈希一致，独立联调、全仓重测与真实 Pi 桌面来源回交复测通过
---

# 普通聊天结束不再干扰正式任务验收

客户已经要求相关角色修复并在真实桌面复测。项目管理独立审查源码、工程法案、属主方案和测试计划；本记录不代表客户已经确认具体方案，也不代表实现或测试已完成。

审查对象：[编排 revision 2](../../../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md)、[桌面窗口 version 2](../../../桌面窗口/docs/fix/2026-10-14_fix_chat-handback-origin.md)、[独立测试方案](../../../测试/docs/fix/2026-10-14_fix_chat-handback-verification.md)。现象证据见[真实桌面验证](../../../测试/docs/change/2026-10-14_change_desktop-real-project-validation.md)。相关现状见[项目架构](../architecture.md)。

## 独立判断与统一契约

`src/common/编排/handback.ts::withHandback` 在非重复 settled 时无条件生成回交；`app/desktop/session.ts` 已区分 dispatch/message/handback，但 sendDelivery 没有交给编排本轮来源。Q1/Q2 是两个聊天轮次，不是同轮重复投递。仅桌面丢弃或隐藏 unreported 会留下底层假任务结果，不能解决问题；依正文识别任务会把客户文字当控制信息。推荐在原发送调用闭包定格来源、用 Runtime Core 的真实同步开轮确认绑定 turnId，再在编排生成处决定是否回交。

唯一最终契约为编排 `RoleSessionSendOptions extends PromptOptions`，附 `handback?: { required: boolean; taskId?: string }`。桌面直发聊天显式 false；队列实际条目 dispatch 为 true，message/handback 为 false，包括重试。编排剥离专用字段，不修改 Model/Core/Provider/IPC。调用方既有图片及 ACK 回调保持，合法 submit_report 无论来源均回交。

正式任务无报告继续产生 unreported/blocked，失败、超时或中止仍覆盖成功声明；聊天无报告只透传实际事件与 settled，不生成任务报告。聊天即使失败或发生写入，也不能凭这些事实制造任务回交。每轮都清理报告、证据、来源并登记终局，重复/迟到事件不得污染下一轮。

没有逐次选项而 input.taskId 非空的旧 openRoleSession 调用保留正式任务默认；显式 false 覆盖它，主动聊天报告也不继承旧 taskId。单次 runRole 本来直接消费原生事件，不挂 withHandback，本次保持原生命周期及退出码，不新增 CLI 回交。无 metadata 的旧串行替身仅保留有界的一轮降级；未知真实轮次不能借另一轮来源。旧日志不重写，历史展示与既有去重保留，不把旧记录补造为新任务。

## 架构、范围与风险

Interface 桌面通过已有 Pipeline 公开句柄传来源，Pipeline 按已有 Service/Core ACK 绑定，不新增层依赖、外来私有 common 消费或共享组件。业务 taskId 当前缺少可靠来源，允许未知，不伪造编号。角色边界已覆盖以下文件，无需扩权。修改必须避开已有 README 和其他未提交工作。

最小生产文件：编排 `src/pipeline/orchestration/run-role.ts`、`src/common/编排/handback.ts`；桌面窗口 `app/desktop/session.ts`。

必需测试文件：编排 `test/编排/handback.test.ts`、`handback-lifecycle.test.ts`、`session-abort-images.test.ts`，新增 `test/编排/chat-handback-scope.test.ts`；桌面窗口 `test/桌面应用/dispatch-delivery.test.ts`、`handback-delivery.test.ts`、`message-queue.test.ts`；测试角色新增 `test/测试/chat-handback-integration.test.ts`。属主只同步自身相关 API、功能说明和本次修复证据，项目管理只维护本审核记录。

主要风险是来源串轮、聊天被旧 taskId 污染或显式报告被误吞。上述逐轮真实确认、终局清理和来源覆盖属于修复必需契约，不是选装。没有可选增强项，不改写权、shell 审核、确认流程或 renderer。

## 必需验收与审批摘要

先通过编排专项及 typecheck，再重测桌面调用方的投递、排队、停止、图片和客户消息来源；独立测试接真实 openRoleSession 与桌面管理器，不能靠过滤假回交通过。既有 T1 任务集成的 aborted/unreported/completed 断言必须保留。正式任务缺报告、失败/超时/中止、普通聊天主动报告、重复终局、迟到报告、runtime 隔离与 ACK 回调均需当前候选证据。

真实 Electron 再跑 p-limit 的正式任务 completed → Q1/Q2 只回复收到：角色正常空闲、底层没有新 handback、su 没有新待办且既有 completed 不受干扰。再验真实派发正常报告、缺报告和普通聊天主动报告；真实停止如无法覆盖，必须标未验证，不能用单测声称桌面已通过。检查新增 replay/native 证据与目标已跟踪文件不变。

审批摘要：推荐上述三份方案的统一版本实施，因为它在任务结果生成处修复来源判断，同时保留真实任务的缺报告/失败/中止与主动报告。批准范围仅上述生产和必需测试文件、各属主相关说明与证据，以及真实桌面复测；无选装、无新增角色或 Model 权限。推荐结论与客户授权、最终验证分别记录。

唯一审核结论：**recommend approval**。已复核两属主 revision/version 2 统一契约；两方各自确认其边界、来源判断与兼容影响，独立测试角色已提交完整复测计划。无未解决方案分歧。

客户已明确确认审核 revision 2 并授意实施。编排、桌面窗口在原固定角色上下文实施各自范围，测试角色进行独立集成与真实桌面复测；项目管理只读核对实现与当前证据，待属主结果后更新最终判断。此确认不扩张原批准范围。实现及最终验证尚待当前候选证据。

## 实现对照中的必要测试校准

窗口实施后，既有 `test/桌面应用/p0-halt-and-images.test.ts` 两处旧断言要求 options 整包同一引用或纯文本第二参数缺席，与批准的逐次来源包不再一致。属主将其同步为图片数组原引用、数据逐字/MIME 保真、纯文本显式 chat 与无 images 字段，并新增客户原包不被写入 handback 的断言。项目管理只读核查这些变更没有删除图片行为验证，也没有弱化失败检查；这是本修复必需的调用方契约测试校准，无可选功能或生产范围扩张。

当前三生产文件对照已见：每次来源声明、Core 同步 ACK 按 turnId 保存、聊天跳过仍终局清理、合法主动报告保留与旧 taskId 显式覆盖，均符合已批准 revision 2。窗口来源单测保留原投递/正文断言并新增直发、队列、重试与返工来源断言。最终集成与真实桌面结果仍待测试角色当前证据。

编排回报专项 247/247、窗口回报七文件 72/72，最终 typecheck 均 exit 0；项目管理核对当前源码 SHA-256 与编排交付一致，窗口证据见其修复记录。测试角色另回报独立集成 8/8、全仓 1238 项中 1235 pass/2 fail/1 skip：一项 localhost 沙箱 EPERM 需在允许回环环境重跑；一项桌面 UI 主属的 renderer 图片接线测试仍断言旧 options 构造字符串。项目管理已只读核查该测试及桌面 UI 精确边界，建议独立属主只同步相关三个旧包装/单参数断言，保留图片不重造、调用者不被修改、role/runtime/turnId ACK 校验和原回调转发。无需任何 renderer 产品变更。该必要调用方测试同步与 p0 校准同理，不能由窗口越界代改。真实桌面及全仓最终闭合尚未完成，当前不标 verified。

当前核查的生产 SHA-256：handback.ts `a6782edd274eea3d85bcd75109b3de43eaa2e53ad115a4e965a999bdbdd886a8`；run-role.ts `000fb82b9bd3d7ecca59fcbca66aed6d92c188583b7ea83dd13517b54aa2e621`；session.ts `43948d439e80af3e1801b7586a4f3a4a99c9f5484fccccf5931f7e998a51652c`。后续生产候选变化需重新核对受影响证据。

## 当前候选最终验收

项目管理已只读复核[测试角色最终记录](../../../测试/docs/fix/2026-10-14_fix_chat-handback-verification.md)、候选 SHA 清单、全仓原始结果及桌面 replay 轮次证据；当前三生产文件及独立测试文件哈希与其清单一致。UI 属主只同步既有图片接线测试的必要来源包断言，未修改 renderer 产品；README、app/main.ts、图标等并行工作不纳入本修复交付。

独立集成与原 T1 为 8/8；允许本地回环、完成必要 UI 测试同步后，全仓 1238 项为 1237 pass、0 fail、1 既有 Windows 专属 skip。最终 typecheck 由测试角色记录通过；项目管理另跑当前 git diff --check 通过。此前沙箱 EPERM 与旧字符串断言均有实际闭合证据，没有删测或放宽产品行为。

真实新版 Electron 的 Pi/p-limit 复测记录与 replay 相符：CHAT-R1/R2 后 su 输入数量维持 10；TASK-R1 实际读取 package.json 并 submit_report，completed 自动回交；TASK-NOREPORT 无报告仍 unreported；直接聊天 CHAT-REPORT 的合法主动报告仍 completed 回交；随后 CHAT-R3 没有新回交。su 最终 15 条输入恰对应新增两次派发请求和三个预期回交，工作角色从 4 增至 10 条输入恰对应六个新轮次，均有实际终局。测试角色报告两角色界面最终空闲、目标上游跟踪文件未改、三个 pin 重算匹配。

结论：**当前候选 verified**，本次普通聊天误回交修复与要求的真实桌面来源/报告复测已闭合。验收范围不含真实桌面主动制造失败或停止；这部分由当前自动测试支持，真实桌面未测限制保留。在线桌面仅 Pi，Codex/Claude 是无网络整链替身覆盖。本轮没有提交、推送或发布。
