---
id: desktop-chat-handback-origin
type: fix
title: 正式派发回交来源的桌面接线
created: "2026-10-14"
updated: "2026-10-14"
status: implemented
revision: 2
---

# 普通聊天不再自动生成任务缺报告回交

revision 2 已经客户确认并实施；窗口专项已验证，真实桌面复测由测试角色执行。现象依据[真实桌面验证](../../../测试/docs/change/2026-10-14_change_desktop-real-project-validation.md)：角色完成任务后，客户发送「只回复收到、不提交报告」，普通聊天轮次产生 unreported 并自动投 su，干扰原任务验收。相关功能：[桌面多引擎会话](../feature/multi-runtime-desktop.md)。

## 根因与调用证据

`app/desktop/session.ts` 的即时客户消息（send）、排队客户消息、正式派发（routeDispatch）与回交消费均经 sendDelivery。队列本来已用 `DeliveryItem.kind` 区分 message / dispatch / handback，但 sendDelivery 只传正文、图片及 onTurnStarted，来源未进入编排。

openRoleSession 不传 taskId。现有 Core ACK 只有真实 turnId / roleId / runtime；桌面已有原调用闭包与 ACK 的准确关联，不能用正文或下一个事件猜来源。编排的 withHandback 当前在每个项目角色 settled 无条件产生回交，这是底层需要修复的判断，桌面不能靠隐藏事件消除假报告。

## 最小契约与桌面修改

唯一规范见[编排方案 revision 2](../../../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md)。编排作为主属主新增 RoleSessionSendOptions（扩展既有 PromptOptions），用于 RoleSessionHandle.send：`handback?: { required: boolean; taskId?: string }`。该字段由 Pipeline 消费，不改变 Model、SDK、preload 或 IPC。

桌面每次 sendDelivery 都明确本轮来源：drainQueue 的 `sent.kind === "dispatch"` 投递附 `handback: { required: true }`；即时客户消息、排队客户消息和回交消费明确附 `handback: { required: false }`。原图片与 onTurnStarted 回调保持，编排用原 prompt invocation 的真实 ACK 把派发上下文关联到 turnId。正文不作为来源判据。桌面 dispatch payload 没有 taskId，本修复不创造任务号；真实 turnId 继续用于去重与定位。

编排约定：正式派发完成时缺报告仍回 unreported，失败/中止仍回真实终局；任何轮次合法 submit_report 均回交，包括普通聊天。聊天无报告不生成回交，但 settled、状态复位与队列放行照常。未提供 per-send handback 且 openRoleSession input.taskId 非空的旧集成调用兼容默认仍要求回交。显式 required:false 必须覆盖旧会话 taskId，普通聊天主动报告也不得继承被覆盖的旧任务号。单次 CLI runRole 沿用独立生命周期，不新增回交功能；具体定义以编排 revision 2 为准。桌面不会传会话级 taskId。

来源标记在每次 dispatch 投递时由同一冻结队列条目 kind 决定，失败放回与重试保持正式派发语义。角色切换、边界重建、runtime 隔离沿用既有队列目标，不引入全局当前任务变量。

## 修改范围与必要验证

实施授权范围候选：`app/desktop/session.ts`（sendDelivery 接受编排专用 opts；每次直发与出队明确传入 false/true 来源）；`test/桌面应用/dispatch-delivery.test.ts` 与 `test/桌面应用/handback-delivery.test.ts`（正式派发和普通客户消息的来源）；必要时 `test/桌面应用/message-queue.test.ts`（排队来源保存）。实施后更新本记录与 `角色卡/桌面窗口/api-spec.md`。没有可选加固项。

必须核对：即时与排队聊天、回交消费附 required:false；正式派发附 required:true（含重试、同文返工）；图片及原 ACK 回调未丢；项目/runtime 仍隔离；底层编排真实整合下，聊天无报告不产生 handback、主动报告仍投 su、正式派发缺报告/失败/中止仍投 su。运行受影响单测、类型检查及现有停止/客户消息来源回归。测试角色负责原生桌面复测，不能以单测替代。

风险是来源附错会漏真实回交或再次污染聊天；通过以队列 kind 为唯一输入、按真实 turnId 关联避免串轮。旧日志与回放不新增字段、不重写历史：过去已生成的 unreported 保留为历史证据，恢复展示不应重新派发它们。本修复只改变后续实际发送轮次的判定，原生恢复后的新聊天明确带 required:false。未知旧替身无 ACK 的兼容回交由编排单独测试，不能猜测真实 turnId。


## 实施与窗口验证

实际修改 `app/desktop/session.ts`、`test/桌面应用/dispatch-delivery.test.ts`、`test/桌面应用/handback-delivery.test.ts`、`test/桌面应用/p0-halt-and-images.test.ts` 与本角色 api-spec。本次没有修改 message-queue 源文件，只运行其既有回归。

p0 测试的必要范围差异经项目管理独立评估并由 root 传达授权：旧「纯文本 opts undefined」改为明确 required:false 且无 images；旧「整个 options 同一引用」改为图片数组同一引用、新外层包不污染原包，data 与嗅探 mime 的严格断言原样保留。这是新来源合同的必要同步，没有删除业务测试或放宽图片行为。

实跑 7 文件 72/72：dispatch-delivery、handback-delivery、message-queue、p0-halt-and-images、multi-runtime、operator-wiring、session-rebuild-race。来源验证包括直发 false、dispatch 排队 true、失败重试 true、同文返工新 true、回交消费 false、客户屏障 false。既有 multi-runtime 真实 ACK/clientMessageId 与跨项目/runtime 隔离回归通过；图片数组原引用、base64 与嗅探 mime 通过。`git diff --check` 通过。[原始结果](2026-10-14_chat-handback-window-tests.txt)与[候选及依赖哈希](2026-10-14_chat-handback-window-manifest.txt)记录实际输入。

早期 typecheck 通过；最新全仓 typecheck 在并行新增 `test/测试/chat-handback-integration.test.ts` 出现 EventListener/handback narrowing 类型错误，已交测试角色修复，不修改同伴文件。全仓最终类型检查与原生桌面复测待协调后补证，当前不宣称全链验收完成。

并行测试类型错误修复后，最终 `npm run typecheck` exit 0（[原始结果](2026-10-14_chat-handback-window-typecheck.txt)）。原生桌面验证仍待测试角色完成。
