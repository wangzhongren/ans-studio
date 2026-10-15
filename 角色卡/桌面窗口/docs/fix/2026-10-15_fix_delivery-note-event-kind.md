---
id: delivery-note-event-kind
type: fix
title: 派发投递进展使用系统消息而不是工具调用
created: "2026-10-15"
status: implemented
---

# 去掉投递通知产生的幽灵工具行

WINDOW-DELIVERY-NOTE-FIX-1由root转发PM窄修建议及用户既有V2实施/问题修复授权。root真实worker界面比Core/native多出一条工具记录，展开显示的是「已接收来自su的派发任务」，见[原真实红例](../../../测试/docs/change/2026-10-15-visual-v2-implementation-evidence/native-extra-tool-row-open-red-ax.txt)。本角色只读该证据，不操作GUI、不启动Electron、不读取目标项目。

根因是session.ts的emitDeliveryNote明明生产投递系统进展，却用kind=tool_call且没有真实工具元数据。现仅将这一个producer出口改为 `event:{kind:'message',summary:原文,detail:{source:'delivery-note'}}`。外层projectRoot/roleId/runtime和完整summary不变，不添turn/call/phase、不伪造assistant角色、不改变实际工具事件、ACK、queue、发送次数或持久化身份。复用既有generic message.detail，无Model/API扩张。UI由独立属主按typed source呈现系统全文。

严格先RED后GREEN：新增自有实际Window dispatch行为用例，走su注入的dispatch→worker实际send→受控真实形状工具开始/结果事件。修复前worker工具计数为2而应1，原断言失败；单行producer修复后同断言通过。用例同时要求双边完整系统note、detail精确marker且无假turn/call、目标恰好一次prompt、su零额外prompt，以及原工具turnId/toolCallId/phase保留。此为受控Window行为，不冒称真实在线SDK执行。

精确修改测试为dispatch-delivery.test.ts（新增红绿用例与既有note断言）、handback-delivery.test.ts、message-queue.test.ts（只将原系统note断言改为message+typedmarker，summary、来源、失败保留/重试断言不减）。dispatch-fresh-enum仅复跑未改。初次新fixture的envelope静态类型缺projectRoot，已改用实际SessionEventEnvelope，不通过cast虚造字段；类型错误日志留档。

最终4文件专项31/31，npm run typecheck退出0、git diff --check通过。源码只有session.ts单行生产更改；候选精确hash、严格red/green、专项及类型日志见[新overlay](2026-10-15-delivery-note-evidence/manifest.json)。旧批准文档、旧final manifest、已接受证据和所有原红例不覆盖。root将完整重启并发送明确新任务验证当前字节；旧formal执行/报告证据不冒充新字节的全链复测。
