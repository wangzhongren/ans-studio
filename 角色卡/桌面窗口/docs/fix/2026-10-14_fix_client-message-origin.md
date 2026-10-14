# 将原客户输入与实际轮次作显示关联

D1R2，ANS-RUNTIME-V2 revision 1 的必要显示修复。当前窗口真实ack对接与受影响自验完成，实际窗口合并验收待U1/T1。沿用客户既有多运行时开发授权，写集仍为窗口 main/preload/desktop、已接受的multi-runtime.test.ts和自有资料。依据[管理冻结契约](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)末尾；D1R1的历史turn字段已完成，但乐观user气泡还没有安全对应实际turn的来源，不能用最新轮次或相同文本补ID。

新增兼容第四参 `sendSession(text,images?,target?,metadata?:{clientMessageId?:string})`，Window仅采纳非空字符串作显示关联。Interface将metadata固定于本次直接输入或原队列DeliveryItem，不送Model/Core/store，不作为授权。

独立评估发现仅用首次事件/FIFO仍不能区分无事件send失败与Pipeline延后yield的已创建失败轮次。前者留下记录会借下一turn，后者提前删来源会丢原failed/aborted terminal。管理和Governance已确认需要真实只读ack，不采用永久关闭旧handle未来显示关联的降级作为完整修复。

已实现方案消费Core属主的实际Model `PromptOptions.onTurnStarted?(metadata:{readonly turnId:string,readonly roleId:string,readonly runtime:RuntimeKind}):void`。Core实际创建turn后、persist/native前同步一次；disposed/active/quarantined前置拒绝没有ack；callbackthrow仍走正常failedterminal清理。Pipeline原send已原样透传PromptOptions，不需要SDK/O1接口改动，clientID绝不交Core/store。

Window对每个原prompt invocation建立独立来源记录和callback闭包，包括匿名派发/回交；只有该闭包收到真实ack才注册actualturn→该原record。事件仅查精确映射，不再通过首次事件/FIFO/current/latest或文本绑定。缺ack的旧提供方不回传clientID。settled先捕获原record和ID再清忙/启动下一队列；迟到旧terminal不能清新busy。已ack的失败记录保留ID供延后terminal；未ack失败记录可以精确移除，因为实际未创建新turn。映射按已终结记录有界保留，未知/已清理旧ID不借新客户ID，dispose清理本句柄记录。

临时首次事件FIFO和uncertain永久禁源分支已删除。第四参、原DeliveryItem和实际ack callback只在own scope对接；没有未知Model字段、cast或Model/Core写入。未知事件只查现有映射，不能建立来源。已ack终结映射有界保留128条，旧/已清理ID不复用新记录，dispose清当前精确句柄映射。

`SessionEventEnvelope.clientMessageId?:string`仅在原来源拥有客户端ID且事件带实际turnId时增加，原event对象不修改。客户端ID本身不持久化、不改变发送回执或执行。

窄测试覆盖实际Pipeline/Service对直接与queued两次同文的不同客户端ID/真实turn；旧settled与下一队列交接、匿名投递、未知/陈旧/缺turn事件、停止与发送失败。只用无网络假引擎及临时数据，不改U1/T1/Model/Core/storage，旧阶段证据保留为历史。UI据原clientMessageId查原气泡，然后以实际turn参加已冻结的history合并；实际入口由T1后续证明。


## R2 阶段准备证据

第四参main/preload/Interface/session接线和直接/queued/匿名/旧terminal窄测试已经准备。当前首次窄运行58/59，失败在真实Service夹具把后台su匿名回交的全局start计数误当作A的第二轮；该夹具将按role隔离计数，最终断言不放宽。临时实现strict tsc exit0；这些只作准备证据，不宣称真实ack、完整修复或最终owner gate通过。Core字段ready后同固定窗口上下文继续精确ack对接、删除首次事件猜测，再跑受影响gate与新manifest。此前D1/D1R1记录保持历史。


## D1R2-R1 最终窗口候选与证据

生产者桌面窗口，节点D1R2，契约ANS-RUNTIME-V2 revision1与C1A实际只读ack。写入仅app/main.ts、preload.cjs、desktop/interface.ts与session.ts，边界内multi-runtime.test.ts及message-queue.test.ts源码钉子、自有资料。Model/Core源由原属主实现，Window只消费实际API；没有renderer、SDK、store、package/env/Git写入。

- 受影响10个窗口文件 `node --test test/桌面应用/{multi-runtime,session-history,interface,message-queue,dispatch-delivery,handback-delivery,session-rebuild-race,p0-halt-and-images,boundary-refresh,session}.test.ts`：**101/101，exit0，零跳过**；multi-runtime22/22，其中R2新增5项。
- 新测试包括原client直接/queued两同文两个actualturn、旧settled延后且第三条仍排队、匿名dispatch/未知/legacy不借ID、真实Pipeline/Service角色独立计数、实际创建失败但仅terminal延后与下一原输入中止、无ACK前置失败后新ACK仍绑定新client。真实失败/中止测试延后的是实际Pipeline events yield，Core原turn不造假；旧failed/aborted terminal均保留原client，不能清新busy。
- 原 images 整包旧替身/排队定格、FIFO/失败回队首、派发/回交、历史metadata和边界刷新/竞态回归均在101项中通过。源码钉子仅重指新sendDelivery调用，仍验证先置busy再await，没有放宽实际行为断言。
- strict `tsc --noEmit --pretty false` **exit0、无输出**；scope `git diff --check` **exit0**。

[最终单元原输出](2026-10-14_client-message-origin-tests.txt)、[类型检查](2026-10-14_client-message-origin-typecheck.txt)、[当前候选与消费依赖manifest](2026-10-14_client-message-origin-manifest.txt)。准备期[58/59原红](2026-10-14_client-message-origin-preparation-tests.txt)保留；匿名su的global计数夹具已改为按role计数与A角色过滤，原“两同文不同原ID/actualturn”断言仍严格通过。该准备红不作为产品已修复证据，也未删除。

Node v24.14.0 / macOS，无网络假Provider和临时项目，未使用真实.env、账户或模型。原D1全Window171与D1R1的37项仍保持原历史，未声称此阶段全Window重跑或真实Electron全链已通过。窗口实际字段ready，U1/T1据冻结原API独立续接实际入口验证。当前行为见[功能说明](../feature/multi-runtime-desktop.md)。
