---
id: complete-flow-window-ac-consumers
type: design
title: Window 对 A 工具展示与 C 报告持久合同的消费方案
created: "2026-10-15"
revision: 3
status: draft
---

# 独立消费评估与具体失败选择

仅设计，无代码/测试/桌面操作。规范唯一来源为[Core A/r4](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)、[Core C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)，本文件不复制schema或替Core/编排授权。独立检查当前session.ts的consume、handleHandback、drainQueue、activeDeliveries与catch，以及runtime-history.ts后给出如下选择。

## A：接受安全投影，禁止历史旁路

接受A的Model ToolDisplayV1/DisplayTextV1及中立phase，Window只导入公开类型。现live envelope原样转发，只能在Core/适配器已经完成安全投影后继续透明送IPC；Window不能在收到raw detail后自行承诺统一保护。历史必须走既有Pipeline `readRoleSessionHistory` → Service公开 `readRuntimeSessionHistory`，不从Interface直接调用Service，也不直接读store。history mapper在ReplayRow.activity新增可选display:ToolDisplayV1、保持原scope/actualturn/call/phase，原summary/detail不得作为raw旁路输出。未知版本display留空并表示不可展示，不解析本地化summary制造exit/stdout。

**撤回r1/r2“暂禁读legacy”的退化建议**。最小推荐保留Window既有legacy文件读取与parser，不增加原生文件路径/扫描面，不迁移/复制parser；它的瞬时产物转换为公开Model中立legacy entry，再调用Pipeline公开纯投影→Service公开保护→Window转回ReplayRow。既有fs代码是本轮兼容读取保留，不作为新能力跨层先例；新增安全能力严格相邻层调用。原native-only Pi继续可读，不需另批禁读政策。raw产物只在Interface内存转交可信Pipeline，不发IPC、不打日志、不反序列化renderer提供的entries。生产必接保护；缺该入口是实施依赖缺失，不是静默裸读分支。

A同turn/call的start/blocked/result分别保留；同文不同call与迟到结果不合并。预算截断/净化标志随display保真；用户展开看到的是有界投影，不称全部原始输出。IDENTITY_TOO_LARGE诊断保留为无业务结论消息，不转成denied/完成/新任务报告。当前未知凭据匹配和模式保护不是全DLP，Window/UI必须沿A的残余限制表述。

## C：源保存、固定批次与目标回执

### 源报告入口

当前consume无条件把handback交handleHandback，后者在入队前登记dedupKey。推荐改变为：enabled路径只接受编排公开事件带来的最终冻结snapshot和真实reportPersistence；合法source state=saved/already-saved进入durable自动投递；disabled/legacy另走下述原live兼容。source failed不入deliveryQueue，也不先消耗“已排队”去重键；独立待保存登记按scope/reportId记录冻结对象、错误与保存状态，UI显示未保存。保存重试只能调编排公开的“重试该冻结reportId保存”入口，不prompt源模型，不重触工具；接口由编排主属给，缺该入口不得用再次派发替代。成功状态再次到达按reportId只入队一次。source conflict/invalid保持错误，不自动覆盖。

**Window是唯一enqueue owner**。Pipeline只返回原业务handback/结果、转发状态，绝不入队。Window同步mergeReportState按project/sourceRole/runtime/reportId登记原TaskHandback、冻结snapshot、保存态；初始saved、retry Promise与订阅都先调用同一个归并函数。必须原业务对象已登记且saved，任何await前先将not-queued置queued，再调用一次原入队；通知先到仅缓存状态，不能造新业务报告。纯状态事件只更新原卡，只有归并函数在首次条件满足时推进一次待投递报告，不把订阅当第二条enqueue入口。disabled/legacy走既有key的同等once登记，不伪造reportId。

**纠正r1，接受C/r2原live兼容默认**：source disabled照旧自动live回交，标memory-only未保存，不建目录；缺能力/缺真实turn的legacy照旧live，标unknown-live，不造reportId或durable snapshot。enabled PERSIST_FAILED不能冒充disabled绕过保存，仍留待保存而暂不投su。target disabled保原live发送，receipt history=disabled/inputSaved=false，不写user/boundary/report目录；target缺能力保旧文本投递而不承诺新receipt。live报告用Pipeline提供RuntimeLiveHandbackPresentationV1安全投影；原TaskHandback/render文本供模型逐字不变，UI原始交接需同A有界保护。disabled/legacy不是breaking阻投选项。

### 连续批次定格

当前drainQueue每次取连续handback并render，失败把sentItems逐条unshift，下一次可能混入新成员。接受C/r2要求：第一次实际发送前把有序成员reportId/snapshot、原交接text与target冻结为一个投递工作单元；生成一次deliveryId。之后重试该单元不可重新合并到来的报告；原message/dispatch屏障保持。实际新重试生成attemptId，reportId/deliveryId及成员顺序不变。多报告超过C/r2成员或JSON预算时，Provider前明确阻塞PROVENANCE_TOO_LARGE，保留固定单元，不静默丢成员/拆批/改模型文本。

### ACK、进度与catch

保留原onTurnStarted→clientMessageId映射及图片引用；ACK只能证明turn-created，不称投递/保存成功。onDeliveryProgress用于在途事实，最终返回/RuntimeDeliveryError.receipt是本调用权威；回调丢失、乱序或抛错不驱动再次prompt。provenance仅可信Window队列构造，普通renderer sendSession不接收自报report对象。由Pipeline验证保存源与scope、剥离内部options后进入Core/Provider；Window不直接调Service。

针对handback新工作单元，**不再沿用当前catch无条件unshift全部sentItems**：

| 事实 | 推荐Window动作 |
| --- | --- |
| receipt明确retryDeliveryAllowed=true、providerMayHaveStarted=false，且Pipeline/Core确认目标replay完整可读 | 保留固定单元，可按既有下次放行时机新attempt重试；旧已存user事实不删；不会重用原attempt |
| receipt providerMayHaveStarted=true，无论目标settled失败/超时/中止/保存失败 | 不重新入自动prompt队列；保留“可能/已经处理，历史未保存或执行失败”事实；仅补保存捕获事件，不把“重试保存”变“再次发送” |
| receipt缺失、未知版本、日志partial/损坏、attempt重复已开始 | 不自动重发；保留受阻事实及固定身份，请用户核对；不把未知当确定未启动 |
| input已保存但Provider确定未开始 | 可按第一行新attempt重试，UI分别显示输入保存与尚未处理，不删旧turn |

上述保守策略只用于C可信handback路径；普通message/dispatch失败规则不顺带扩大修改。旧纯文字handback没有provenance/receipt时不能冒充新保存保证，生产迁移需编排把新源明确分流；legacy未知阶段不为恢复投递而猜Provider未启动。自动队列没有跨进程持久化：重启只读源/目标事实，不自动恢复发送，不承诺exactly-once。

activeDeliveries仍只表示在途工作：真实settled只清对应scope/实际origin，迟到旧回执不能撤销新attempt。Provider可能已启动但send抛错时不应把可能还工作的handle乐观置idle；仍依Core终态/当前origin决定busy和确认信号。受阻单元与待保存报告是独立状态，不把它们伪装成正在运行或普通排队消息。新状态若需UI按钮，必须与UX/产品具体确认；本提案不偷偷增加新业务操作。

## C 历史与旧数据

接受Core公开读取的reports/reportErrors、原user与typed输入上的inputProvenance，以及delivery-boundary内部事件。Window只经Pipeline读取安全快照；ReplayRow可选provenance/report映射直接引用Model，源报告、目标delivery/attempt与actualtargetturn分别呈现。边界事件转为投递状态记录，不作为助手发言；缺boundary不得推断模型没执行，缺settled不得重发。旧纯文字只显示原始交接内容、来源未知，不从[回交]升级，不补taskId，不写回日志。新报告snapshot的evidence仍只是文字，不赋B读取权。

建议旧raw交接“原文”也经过A/C的安全有界展示入口后才发IPC；SDK原text逐字不变，UI不能承诺显示无界原始全文。源状态保存失败仍可见、目标状态不混同“验收成功”，单次批次不等于所有报告收齐。

## 精确本角色写集与依赖前置

Window候选：`app/desktop/session.ts`（源状态门控、固定批次/UUID、progress/receipt分类、在途身份）；`app/desktop/runtime-history.ts`、`session-history.ts`（A/C公开Model安全投影映射）；`app/desktop/interface.ts`仅公开注入/返回类型必要同步；main/preload现透明事件通道不增加raw读取。api-spec、当前功能、相应design/fix证据同步。测试精确为现白名单 `test/桌面应用/handback-delivery.test.ts`、`dispatch-delivery.test.ts`、`message-queue.test.ts`、`multi-runtime.test.ts`、`session-history.test.ts`、`p0-halt-and-images.test.ts`。无新增未列生产/测试文件；若实际实现超出先交PM/Governance。

依赖前置：Core A/C canonical经审核冻结；编排公开源状态/保存重试/目标receipt与合法历史入口；Pi/Core保障安全投影与完整scope身份。当前Pipeline/Service缺能力由真实主属在自己方案补，Window不新增私有补丁绕层。不因本提案便宣称这些合同已实现。

必需回归按[独立三接口验收](../../../测试/docs/design/2026-10-15_three-interface-verification-plan.md)：A live/history投影一致、保护不旁路、三phase与旧未知保留；C enabled source失败零入队且disabled/legacy仍live入队、原对象存储重试不prompt、批次失败期间新报告不扩入、屏障保留、saved后重放仅入一次；ACK后user失败Provider0次、input-saved/boundary失败0次、Provider可能开始后任何失败Provider至多1次且不自动重发；同attempt拒重入、partial日志阻塞；目标实际turn不借源turn；late terminal/receipt不清新origin；provenance不进SDK、文本/图片原样；跨项目/runtime与普通聊天不变。Provider调用次数由真实受控计数验证，不能用展示卡数代替。源/目标非事务与persistfalse原live兼容必须在产品验收中明确。

结论：推荐接受A/r4投影消费与C/r2上述保守失败语义，**待客户确认后实施**。实质选择包含enabled保存失败阻止自动投递、可能启动后禁止自动重发、固定大批超限阻塞、legacy历史保持原可读但新增纯投影必须接通；disabled/legacy保原live兼容不是阻投breaking选择。未验证、未部署，不以独立评估代替客户决定。


## r2冻结的受限保存、查询与状态通知接口

以下是Window自己的外层scope/IPC，不重定义Core业务union：全部从Model引用 `ReportSaveResultV1`、`ReportSaveStateV1`、`DeliverySaveResultV1`、`DeliveryReceiptQueryV1`、`RuntimePersistenceChangeV1`，版本以C/r2为准；A/r4的source/projector/required/profile注册与新增纯legacy投影按其唯一规范消费；Window不构造adapter原source、不复制rule，不把required缺失降级为raw。

```ts
type PersistenceScope = { projectRoot:string; roleId:string; runtime:RuntimeKind };
type PersistenceRequestScope = PersistenceScope & {version:1};
type PersistenceReply<T> =
 | {ok:true;version:1;scope:PersistenceScope;value:T}
 | {ok:false;version:1;scope?:PersistenceScope;
    code:'INVALID_REQUEST'|'PROJECT_NOT_ACTIVE'|'SESSION_NOT_AVAILABLE'|'SNAPSHOT_EXPIRED'|'UNSUPPORTED';message:string};
// value 内的 Core result.ok 独立表示保存结果，外层ok仅表示受限调用完成。
```

方法与通道唯一对应：

| preload方法 | IPC | 请求 | 返回value |
| --- | --- | --- | --- |
| retryReportSave | report:retry-save | PersistenceRequestScope + reportId:string | ReportSaveResultV1 |
| getReportSaveState | report:get-save-state | PersistenceRequestScope + reportId:string | ReportSaveStateV1 |
| retryDeliveryHistorySave | delivery:retry-history-save | PersistenceRequestScope + attemptId:string | DeliverySaveResultV1 |
| getDeliveryReceipt | delivery:get-receipt | PersistenceRequestScope + attemptId:string | DeliveryReceiptQueryV1 |
| getSessionPersistence | session:get-persistence | PersistenceRequestScope | {mode:'enabled'|'disabled'|'unknown-live';reportSaveSupported:boolean;deliveryHistorySaveSupported:boolean;querySupported:boolean} |

getSessionPersistence由实际RoleSessionHandle的persistenceMode/方法存在性派生，不由runtime、目录或renderer布尔猜。supported表示操作入口存在，不表示某个ID有材料可重试；具体按钮还须该ID Core query.retryAvailable/receipt.retryHistoryAvailable。所有get只查当前已绑定会话，不启动SDK、不打开角色、不创建store或恢复材料，不触发保存。不存在真实handle返回SESSION_NOT_AVAILABLE，不临时open一个新handle补能力。

主进程校验：版本/字段非空、runtime合法、请求项目等于当前成功导入项目、角色在该项目listing、原handle和runtime匹配；ID还必须存在当前Window登记或该scope合法历史呈现过的typed ID，renderer任意ID不触发跨scope读取。retry更严格：必须关联当前实际原bound handle上失败且可重试的原对象。旧handle dispose/替换后撤销该映射，旧ID请求SNAPSHOT_EXPIRED；不借新handle/raw报告重建材料。读取旧已保存receipt可以由当前bound query给事实，但不因此恢复旧保存按钮。UI角色/引擎切换本地seq令迟到不覆盖；主进程在调用前和完成后核对当前项目与原handle，scope/handle失效不再投递或发新卡。

每reportId/attemptId的保存操作按scope+原handle+ID至多一在途Promise，重复点击复用；失败后仅下一次显式调用再试，无后台循环。成功重复返回Core already-saved，不调用sendSession、dispatch或prompt；Core材料预算为每bound16MiB，FIFO/128receipt/dispose的expired由typed查询和状态反映，不擅自续期或从磁盘修复未知尾段。REPLAY_DAMAGED/REPLAY_CHANGED拒补，不截断坏行、不删除报告、不重模型。最终target状态只来自C/r2真实最终delivery-receipt/query/error，boundary或邻近settled不能拼history:saved/outcome。

新增两条主→渲事件及preload取消订阅方法：

```ts
type ReportPersistenceUpdated = {version:1;scope:PersistenceScope;
  change:Extract<RuntimePersistenceChangeV1,{kind:'report-save'}>};
type DeliveryHistoryUpdated = {version:1;scope:PersistenceScope;
  change:Extract<RuntimePersistenceChangeV1,{kind:'delivery-history-save'}>};
// report-persistence-updated -> desktop.onReportPersistenceUpdated(callback)
// delivery-history-updated -> desktop.onDeliveryHistoryUpdated(callback)
```

在open成功后为该实际handle登记一次onPersistenceChange，dispose前退订；闭包捕获原project/role/runtime及handle对象，转发前身份守卫。change.scope必须与绑定role/runtime一致，外层projectRoot由主进程绑定，不采信外部字段。通知只更新原reportId/attempt卡，不构造新的handback业务事件，不含raw正文/凭据。query负责订阅未接上/重载后的当前能力快照；旧handle迟到通知不更新新scope。保存Promise完成与change可能任意顺序，均进上文唯一同步归并器，先queued再await，防double enqueue。

相对r1精确新增Window写集：`app/main.ts`五条IPC及两条状态推送，`app/preload.cjs`五白名单方法/两可取消订阅；`app/desktop/interface.ts`实际scope/handle受限操作接线，`app/desktop/session.ts`实际handle查询、单在途/订阅生命周期/唯一归并；runtime-history/session-history仍A/C映射。测试在原r1白名单外明确增加既有授权`test/桌面应用/interface.test.ts`与`operator-wiring.test.ts`用于IPC校验、scope和过期并不扩大目录。尚未实现。

r2额外必测：source初始saved、Promise先、通知先、失败→成功、重复已保存四种均enqueue恰1次；无原TaskHandback通知先到只能缓存；Pipeline enqueue计数0。source disabled/unknown原live仍投且无新目录、target disabled historydisabled；伪造scope/ID/正文、无handle、同scope换handle、不同项目晚返回均拒；两次点击一次实际存储，query/订阅0写入0prompt；16MiB/128淘汰expired按钮失效、保存开始后dispose不再自动投；最终receipt缺失保pending/unknown而非saved。所有计数需受控真实调用断言，不只比UI文本。


## r3 legacy-only Pi 的最小合法桥接（替代禁读退化）

### 现有读取事实

session-history.ts原parser不导Pi SDK：user/assistant正文来自message.content；toolCall来源assistant content块，callId=b.id，target只取实际arguments.path/command。toolResult来源message.role=toolResult，callId=message.toolCallId，target只按同原生callId继承；结果turnId仅真实details.turnId可保留，旧parser顶层缺turn/eventKind，不补成Core actualturn。at来自entry.timestamp或message.timestamp。已有部分结果失败判断来自旧文本正则，这些只保既有展示状态，不能冒充A结构execution事实；不因此造exit/信号/stdout。

readRoleSessionHistory原返回ok/rows/source?/error?/skipped，读最近角色目录文件；坏header失败、坏JSON/未知entry计skipped。原读取readFile+全split无精确字节/行数上限，本轮不冒称已有IO预算或偷偷截断源文件；纯投影仅约束展示输出，旧读取内存风险作为现有限度列出，不把展示限额当底层IO修复。

### Model中立瞬时entry的必需信息

Core新增公开中立类型候选 `RuntimeLegacyHistoryEntryV1`（最终名称由Core r4给）：保kind=user/assistant/tool/denied、原text、at、activity可选toolName/target/phase/status/toolCallId/turnId/ok，以及anchor关联requestId、稳定anchor token、anchor=request/conclusion。不得引用Window ReplayRow或SDK类型；不把原始native对象、arguments全文、图片或确认preview放进去。Window只做字段转换，不复制parser。

文字与身份必须分类：text/target/tool结果展示经Service A同一保护与预算；time/kind/phase/status是事实；原生callId/requestId仅是已有调用关联，不是Core actualturn，不因有callId便进行跨turn工具幂等。缺身份保留缺席。输出应含protected DisplayTextV1/ToolDisplayV1或等效Core唯一定义的标志，Window不得把源raw.text覆盖回去；error/source文件名同样不得未经保护侧带IPC。skipped/投影省略计数分别保留，不混称解析坏行。

### 原锚点不是opaque ID：两端一致改为非正文token

现request-anchor.ts的anchorKey是kind+NUL+原title，不能在净化正文后还把它raw旁带。推荐在Window唯一现helper `interactionAnchorKey` 内将这个原规范键做SHA256，输出`legacy-anchor-v1:`+64hex token；调用侧customer-input.ts、ANS mapper与legacy parser均继续调同一个helper，原请求request/决定内容不改，不按净化后的标题再算，也不把两个不同title因脱敏同文合并。Model只接该token，不接raw anchorKey/title。它只保原定位等价类，不升级成actualturn/call identity，不用来派发/授权。

这样live卡与history锚点在两端同步一致：原requestId/op-N仍是响应pending关联，原native toolCallId仍独立，重物化位置和决定状态不变。旧磁盘不写anchorKey，重放时经同helper生成token；现renderer DOM内旧raw anchor也不持久化，界面整次升级需重新物化，不能新旧算法混在同一次渲染。SHA256 token不把原title直接送IPC，但不是秘密的加密库或防字典猜测保证；真实卡request.title本来按原交互合同可见，本改变只消除**诊断历史锚点侧车**意外明文。若还有其它自算raw锚点消费由UI独立核对，不允许改标题后猜定位。

### 新公开纯投影的准确需求

Pipeline候选 `projectRoleLegacyHistory({projectRoot,roleId,runtime:'pi',entries,source?,error?,skipped})`；entries为Core公开中立类型，只由Window现reader转换，不开放renderer IPC接受任意entries。projectRoot/role/runtime是外层请求scope。Pipeline用可信profile取得credentialEnvNames，不采信renderer键名，调用Service候选 `projectRuntimeLegacyHistory({scope:{roleId,runtime},entries,credentialEnvNames?,source?,error?,skipped})`。后者纯函数/纯内存闭包，不FS、不Provider、不SDK，不创建目录、会话或改变原日志；Core A/r4已给最终中立entry与纯投影签名，按下文回签取代本节早期候选，不用Window私有类型补洞。

返回由Core唯一Model结果定义，Window把安全entry映回ReplayRow并保anchor token/request/conclusion、原可靠call与可选turn、时序及skipped；不得从附近消息补身份。native-only才走这条原fallback，ANS历史仍用readRoleSessionHistory→Service安全读取。投影失败安全显示保护失败错误且可重试，不回退raw；这不是policy禁读旧历史，而是任何保护必需链路失败的安全失败。尚未实施。

### 精确属主与回归增量

Window在既有候选runtime-history.ts/session-history.ts外明确增加 `app/desktop/request-anchor.ts`（唯一token算法），`app/desktop/customer-input.ts`仅必要核对两端helper调用，不定义第二份hash；测试 `test/桌面应用/session-history.test.ts`、`operator-wiring.test.ts`、`multi-runtime.test.ts`、`diagnostics.test.ts`均在现白名单。Core主属Model中立entry/纯Service API；编排主属Pipeline公开桥接与可信profile，不由Window改其文件；无Provider新文件或parser迁移。

必测native-only user/assistant/toolCall/toolResult仍可读；成功/失败、unknown旧字段和无turn不升级；原生同call请求/结论保token一致、两个同标题不同request不丢卡、两个不同敏感title不因redaction合并；live与回放锚点逐字一致、决定/过期/取消和阅读位置保持；假secret不出text/target/error/source/anchor旁路，token里不含原title；source文件与mtime不改；Service调用0FS/0SDK，raw entries不IPC，投影失败不裸回。A/r3其余required/profile规则与C/r2finalreceipt、disabled/live兼容、Window唯一enqueue保持不变。


### A/r4桥接对事实来源的补充回签

Core核对发现现parser的toolResult target还会从首行shell模板提取，失败状态也有旧模板推断。因此“保旧可读”不等于把这些推断升级成A结构事实。Window在既有parser内最小标记target来源（内部argument/tool-detail/same-call/template-only），转换中立tool-record时仅argument、原details.path或同真实call继承的已证明target可进入新structured target；template-only只留经保护的原文本。新exit/process/stdout永远不从模板造。旧模板推断的失败展示可随受保护原文字保留，但不得转成新的真实execution/errorCode；中立结构仅采native isError/details.ok/status等已有明确事实，缺则unknown。Core r4可用user-text/assistant-text/tool-record中立联合而不复制ReplayRow，Window按最终Model转换。

request-anchor.ts在本角色app/desktop目录授权内，本方案精确写集允许其单点hash修改；采用Core建议的`legacy-anchor-v1:`前缀，并与customer-input、ANS mapper、native-only parser两端一致，不改真实call/turn，不把token当去重ID。raw anchorKey不进入Service或IPC，不复制parser或原生读取实现。Core纯API与Pipeline wrapper最终名称以Core r4/编排独立签名为准；本消费者接受所述纯scope/history/credentialNames结构，不将现draft候选包装误称已经实现接口。


## 最终窄回签：A/r4与C/r2 text_policy_revision:1

### A/r4准确接口

接受Core已定Model `RuntimeLegacyHistoryEntryV1`、`RuntimeLegacyHistoryProjectionV1`，不在本文件复制其联合。Pipeline最终签名为 `projectRoleLegacyHistory({projectRoot,roleId,runtime:'pi',readOk,entries,source?,error?,skipped},context?:{credentialEnvNames?})`；Service纯入口 `projectRuntimeLegacyHistory({scope:{roleId,runtime:'pi'},readOk,entries,source?,error?,skipped,credentialEnvNames?})`。前述旧候选参数以此为准。Pipeline只能用可信profile键名context，非renderer字段；Window只发Core返回的保护内容，reader失败与投影失败分别处理。

接受A/r4投影预算：每text16KiB、target4KiB、source1KiB、error4KiB、entry64KiB、总JSON1MiB及4096条连续最近后缀；omittedEntries/invalidEntries/parserSkipped不混同，窗口明示仅显示最近/部分文本，源文件未修改。native actual call/turn不hash，content-derived anchor只用legacy-anchor-v1 token；reportedStatus=legacy-classifier不升级为真实execution。原读取全文件无界风险仍不被本投影预算伪称解决。A工具Source/required/profile没有本角色新定义，B/r2分层/grant/治理前置不变。

### C安全文本与内部/渲染边界

明确接受Core C/r2 **text_policy_revision:1**。Window内部原TaskHandback/rawmodelPromptText只用于原模型交接render与可信发送，**绝不原样随source handback envelope、queue.full、running.full、状态payload或诊断附给renderer**。当前consume对所有envelope透明deps.emitEvent的路径必须针对新C报告改成安全传输投影；源原业务对象留私有内存，不能把安全snapshot和raw handback并排发。界面只收RuntimeReportSnapshotV1或RuntimeLiveHandbackPresentationV1及既有安全保存状态包装；source安全summary来自同投影，不把原evidence侧带。实际实现应区分内部OrchestrationEvent与Desktop渲染传输对象，Model安全值只读引用，不反向修改模型业务对象。

目标input.text/summary、历史user.text、ReplayRow与“展开交接”仅消费Core的安全显示副本与 `RuntimeInputTextProjectionV1`；界面标签固定为 **“交接内容（安全显示副本）”**。这个Model flags原样引用，含modelInputRecorded:false与redacted/truncated/summaryTruncated，不复制另一版shape。即使flags全false也不声称该ANS记录是完整native模型原文。新增C正文16KiB UTF-8、summary1KiB，provenance+flags+文本/身份总user/event各1MiB；PROVENANCE_TOO_LARGE不拆成员，TEXT_PROJECTION_FAILED Provider0/inputSavedfalse/两种retryAllowedfalse，无rawfallback。safe copy冻结后补存原副本，不凭新凭据环境重算另一版。

Window queue目前full=text是原模型交接；新C handback必须分开内部modelPromptText与对渲safeDisplayText，full只由Core/Pipeline公开安全投影提供，尚未有安全副本时不给raw全文，显示等待安全内容，而不是调用Window私有脱敏镜像。dispatch/customer-message原队列语义不泛改；source-disabled/target-disabled的C live同样仅给安全snapshot/liveview/输入副本，不因不写盘绕IPC保护。onDeliveryProgress、receipt、保存错误与source状态都不得附raw业务对象/异常stack。

原TaskHandback和模型全文仅调用链内存用于首次/合法再次投递，不进入**新C补存材料**；Core负责ANS新Cuser/typed/event/补存安全文本策略，Window负责IPC所有侧车清理。普通chat、旧ANS/native不重写、不统称通用DLP；旧历史仍按A/r4读时有限保护，新C政策不偷偷替换旧日志或清理整个native记录。

source保存retry成功允许首次继续原回交，仍由唯一Window mergeReportState await前queued一次推进；Pipeline/订阅/Promise不各自入队。target retryDeliveryHistorySave只补安全材料，Provider计数绝不增加，即便原Provider未启动也不把补存当启动动作。

精确现有候选写集不扩：session.ts内source envelope/queue状态投影、runtime-history.ts/session-history.ts flags透传、main/preload/interface原受限保存/查询通道；request-anchor.ts与customer-input.ts原锚点同步保持。测试在现列handback-delivery/multi-runtime/message-queue/interface/session-history/diagnostics里核对：捕获真实SDK原text逐字；source envelope/queuefull/typedtext/summary/provenance/report安全字段中假secret无raw侧车；补存只safe副本、目标Provider不重启、source保存成功一次首投；16KiB/1KiB/1MiB与flags边界准确。这里只列未来测试，不宣称整份含旧chat/任意助手/native的日志全无secret。

本消费者revision3同版完成窄回签，所有实现和新测试仍未开始。客户需确认具体A/B/C内容政策与预算，PM推荐、边界批准和实际通过保持分开。
