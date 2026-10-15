---
id: orchestration-report-provenance-consumer-c
type: design
title: C 编排消费与 A 历史投影公开桥接方案
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: draft
revision: 2
related: [runtime-report-provenance-contract-c, complete-flow-orchestration-assessment]
---

# 最终报告先记录，恢复只保存；旧历史继续受保护地阅读

固定编排角色。本r2取代本文件r1自拟恢复union/静态record建议，以[Core C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)、[Window AC/r3](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-ac-consumers.md)和[Core A/r4](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)为唯一合同来源。用户确认UX v2，本轮仍只接口方案/独立审核，没有生产授权，未改代码或测试、未操作桌面、未跑验证。源评估见[编排P4](2026-10-15_design_complete-flow-orchestration-assessment.md)。

## C2同版回签：接受

C2已闭合本角色r1提出的真实持久能力、disabled兼容、保存恢复入口与最终回执阻塞。接受Window AC3的五个受限操作及两个状态通知，由Window校验实际项目/role/runtime/原handle/已登记ID，编排只透明代理Core能力。本r2不另造Model union，不把Core规范视作本角色生产授权。

实际值只从经Service创建的 `session.persistence` 取得；readonly `persistenceMode`为enabled/disabled/unknown-live，绝不从input、runtimeOptions或目录存在推断。Core闭包已经绑定实际scope和已结束轮次，recordFinalReport不接受外来持久开关/路径。自定义adapter缺能力是unknown-live；pm-reviewer的persistSession:false、普通in-memory/demo与su治理流程继续原档，不暗建目录。

withHandback仍只在真实终局完成候选选择/终态覆盖、origin判定、finished登记及报告/intent清理后yield最终值；common不回调Service。Pipeline外层在看到已最终化handback时调用真实 `session.persistence.recordFinalReport(draft)`，处理保存结果后仍透传真实settled，不能把模型completed改成存储failed，不能存候选后再覆盖同reportId。合法submit_report即submitted-report，最终failed/aborted覆盖后仍保留该来源；无有效报告任务兜底才terminal-fallback。非法/迟到不变；chat无报告仍不生成，主动合法报告照常生成；chat显式false不继承旧taskId，未知taskId为null。

生产报告回调直接返回Model已冻结的accepted-memory回执；Core tools解释候选已接收、最终保存/投递待收口，不宣称su已收。源enabled保存失败仍显示安全live事实与reportPersistence，暂不投su，不提前消耗排队去重键；source disabled/legacy继续原live自动回交，不伪造durable reportId或真实turn，不把enabled失败伪装disabled绕过保存。安全live展示用Core公开纯projectRuntimeLiveHandback并保留真实已知task/runtime；target disabled只live、history disabled，旧adapter无能力仍不被强迫建store。

## 句柄代理、失败恢复与唯一入队者

RoleSessionHandle和GovernanceSessionHandle公开同名可选方法，直接引用Model canonical类型：

- `retryReportPersistence(reportId:string):Promise<ReportSaveResultV1>`
- `getReportPersistence(reportId:string):Promise<ReportSaveStateV1>`
- `retryDeliveryHistoryPersistence(attemptId:string):Promise<DeliverySaveResultV1>`
- `getDeliveryReceipt(attemptId:string):Promise<DeliveryReceiptQueryV1>`
- `onPersistenceChange(listener:(change:RuntimePersistenceChangeV1)=>void):()=>void`

生产Core路径透明转发实际能力，缺能力明确UNSUPPORTED；不另开session/SDK/store补能力。Governance代理全部操作及同一RoleSessionSendOptions，投su链不能丢新字段。句柄dispose退订，不让旧handle的通知更新新scope；具体失效/安全message用Core原结果，不重写为r1自造union。

快照、16MiB预算/FIFO、128详细receipt及seenAttempt防重、每ID一次在途Promise/保存重试、readonly查询和失效全部由Core拥有，编排不再造第二pending对象仓或后台重试循环。源retry只传ID，不传报告正文，成功状态不会发第二份完成报告；target retry只补已捕获可幂等历史，从不prompt。材料过期/dispose/重启/partial或变更尾段按C机器码显示，不能从旧文字复活。Core返回已保存事实不等于它还持有可重试材料。

**Window是唯一enqueue owner。** Pipeline只返回初始最终业务对象+安全snapshot/保存态、透明返回重试结果和状态；既不在retry success入队，也不订阅后偷偷dispatch。Window按C2/AC3一个同步mergeReportState归并初始saved、Promise和通知：已有原业务对象且saved后，在任何await前从not-queued置queued，才调用一次原入队；通知先到只能缓存状态，不造handback。state更新按同reportId更新卡，不生成新成果；窗口的五个IPC和两个event不在本角色写集。

## 目标投递、回执和批次

保留旧ACK映射与图数组引用。ACK只证明实际turn-created，不能推inputSaved/provider开始。Core进度、RuntimeDeliveryError.receipt与最终getDeliveryReceipt来自同一权威状态；send不得丢原typed错误。成功也查真实最终receipt，不用Promise<void>或最后一次progress猜history saved。Core新增最终delivery-receipt写入事实支持跨handle只读查询；仅user/boundary没有最终receipt就是保守pending/RECEIPT_UNAVAILABLE，无实际outcome且不自动重发。

接受Window AC3改变C handback catch：仅Core明确retryDeliveryAllowed且providerMayHaveStarted=false、完整replay校验允许时才新attempt重试原固定单元。Provider可能启动、receipt缺失/未知/损坏时不自动requeue，不靠重模型修历史；即使补存成功也不暗示可重投。target disabled依Core内存receipt防同session重入，不夸称跨重启。

Window定格deliveryId、有序reportId/snapshot与原text，失败期间新成员不混入、message/dispatch屏障不变；每次获准发送的新attempt有新attemptId/targetturn，源turn不能填目标turn。相同源turn最终成员reportId不变、冲突不覆盖；不同真实turn同文各保留。C的256成员/1MiB上限超限Provider前拒绝，不能截断成员或偷偷拆批改模型上下文。activeDeliveries只在途，状态/报告completed都非独立验收通过，batch长度不代表收齐。

Pipeline仅接受可信Window队列对象，不从renderer前缀或助手话构造provenance。handback.required仍是编排专用；inputProvenance/inputPresentation/onDeliveryProgress依Model交Core，Core在SDK前剥离。安全DisplayText用于UI/持久展示，不反向拿截断snapshot重渲染模型交接：原最终TaskHandback和原入队renderHandbackBatchPrompt的text分别保留，text逐字、images数组原引用不变；UI原文显示再受A投影保护。

## A4同版回签：接受legacy纯桥接，保原parser与读取，不开新读面

接受AC3保留Window已有native-only Pi读取/parser，不迁移或复制parser、不新增路径或扫描。Window把自己瞬时读到的user-text/assistant-text/tool-record转为Core唯一Model中立值，raw只在受信Interface→Pipeline→Service链流转，不进IPC/日志，不接受renderer自报entries；Service是纯投影，不读FS、不构建Provider/SDK/store。

原parser若从shell模板首行反解target/失败，只保受保护原文，不晋升新结构事实；只有真实args/details或相同真实call已证明的target、明确native ok/isError等才能填中立字段。exit/stdout/stderr绝不从旧本地化正文反解析。Window保留same-call/request/结论/阅读锚点，anchorKey只在自己单一helper变为 `legacy-anchor-v1:` opaque token，raw标题键不送Service/IPC；token不是报告或全局去重ID。

Pipeline公开thin wrapper最终候选签名与A4一致，命名 `projectRoleLegacyHistory`，实现位置仅run-role.ts；中立entries及返回直接引用Model，不复制Window私有ReplayRow：

```ts
export function projectRoleLegacyHistory(
  input:{
    projectRoot:string;roleId:string;runtime:'pi';readOk:boolean;
    entries:readonly RuntimeLegacyHistoryEntryV1[];
    source?:string;error?:string;skipped:number;
  },
  context?:{credentialEnvNames?:readonly string[]}
):RuntimeLegacyHistoryProjectionV1;
```

Pipeline校验projectRoot/roleId/runtime原scope，只将 `scope:{roleId,runtime}` 与其余中立reader字段和可信键名交 `projectRuntimeLegacyHistory`；projectRoot不是Service读指令，不调用FS/adapter/provider。实际纯Service签名为 `(input:RuntimeLegacyHistoryProjectionInputV1):RuntimeLegacyHistoryProjectionV1`。所有schema、readOk/reader.ok语义、metadataOmissions、4096条/1MiB总量与单字段规则以A4为准，不在本角色建立另一投影/脱敏实现。readOk:false而投影ok:true只说明成功保护了失败说明，不代表文件读取成功；projection失败只安全错误，绝不raw fallback。

context仅由可信Window主进程已经为**该runtime**解析/选择的实际配置构造：明确apiKeyEnvVar和extraCredentialEnvVars名称过滤非空/去重。Window接线用现宿主runtimeOptions及已有当前profile，不允许renderer请求/history正文提供键名，不传任何env值；Pipeline只接该可信内部context转Service，Service才在纯内存捕获当前值。不能把当前readRoleSessionHistory只有scope的事实写成Pipeline已有profile解析器，也不能在wrapper调用Pi私有resolver、SDK或读取.env补历史。无可用实际配置时context缺省，仅公共已知当前值/模式保护；当前名字/值不保证能恢复旧轮换secret，不声称全DLP。生产native-only必须接这个公开纯保护链，不能利用optional保留raw IPC旁路。

这是同步相邻层桥接，接受A4严格 `legacy-anchor-v1:` token和实际nativeCallId分离、template-only目标不升级、legacy-classifier状态必须标来源等约束。Window单一parser/helper保持，scope只表示已有读取调用来源，不发新文件请求。项目未导入/角色scope守卫由Window原入口先核，本Pipeline纯wrapper仍校验值形状，不把纯entries转换当文件权限证明。

既有 `readRoleSessionHistory(scope, trusted?)`同样由可信context提供明确键名再调Core readRuntimeSessionHistory，返回类型透传Core新增reports/reportErrors而不在本地窄化丢字段；read是已有异步FS链，纯legacy投影是另一个纯接口，不互相混称。host当前配置改变不证明旧日志凭据值可恢复。

## A4写入证据兼容：接受现有写集内补齐

已确认当前 `handback.ts::writeEvidence` 只读detail.path/call.args.path和两类旧summary正则。A4新事件去掉raw args并更换安全summary后，真实写入可能无法进入任务兜底证据；因此本次在原已列handback.ts内补消费display.target，不改A合同、不新增文件读取能力。

新A分支必须同时满足：原事件kind为accepted、detail.phase为result、detail.ok严格true，且detail.status不能是failed/error；detail.toolName为现有已知write_file/edit_file/write/edit；detail.display为可信ToolDisplayV1且version严格1；target.kind严格path，target.value.text为非空完整字符串，redacted严格false、truncated严格false。只把该值作为真实写入/编辑路径文字证据，同动作同路径仍去重。start、blocked、denied、ok缺失/false、未知工具/read/shell、command目标、未知版本/畸形display均不进入新可定位证据；不从新summary/resultText反解路径。

如果新display存在却被隐藏/截断/畸形或版本未知，这一事件**不能**再回退detail.path/raw args/summary找替代“完整路径”，以免绕过A保护。旧事件不含新display且属于现有legacy输入形状时，保留原detail.path/call.args.path及旧摘要兼容；新增A结果即便无可用display也不通过新summary猜路径。实现时用明确新展示分支与已知旧形状分支，不因看到一个summary像旧文案就把新事件改归legacy。两支都只表达已有事件事实，不读取文件或赋予B打开权限；hidden/truncated应表现为没有可定位产物证据，不能说“已保存到[隐藏]”。

在原已列 `test/编排/handback-lifecycle.test.ts` 增加一个实际buildTaskHandback/withHandback行为用例（可表驱动子场景）：同一真实任务turn的accepted/result/oktrue/write_file、完整未隐藏display.path，终局无正式报告→unreported且evidence含“已写入：src/a.ts”，重复同路径只一条；对照同样事件将path设redacted或truncated，并故意附旧raw path/匹配旧summary，evidence必须为空而状态不伪completed；再对照start/blocked/okfalse/read/command/unknownversion不收录。该case串入已有legacy路径/旧摘要回归，保证新兼容不会删旧行为。只补原文件行为断言，无新测试文件/Model/权限面。

## P3/P4阅读入口回签

同意PM最小方案：可信typed卡只用source.roleId导航“查看来源角色文档”，调用B当前已核准docrefs列表，让用户明确选文件；没有已列refs就说明没有阅读入口。C不新增artifact candidates、submit_report schema或从evidence提路径的能力；sourceRoleId只定位资料scope，文档读取仍由B精确docref/current清单/权限与真实文件校验决定。此入口比UX v2准确报告一键多一步，不宣称“查看本报告”，产品短评接受仍须客户具体确认。legacy来源未知不能靠原文猜角色发阅读请求；completed不显示已验收。

## 精确候选写集、依赖与验收

生产仍仅本角色现边界三件：`src/common/编排/handback.ts`（origin/值包装、A4完整写入路径证据兼容，不调用Service）、`src/pipeline/orchestration/run-role.ts`（最终记录、bound代理、历史read与公开纯projection wrapper/可信键名接线）、`src/pipeline/orchestration/govern-session.ts`（同send opts与能力透明转发）。不改pm-reviewer源码、Model/Core/Provider/Window/根测试，不新增私有跨role导入。

必需测试仍为 `test/编排/handback.test.ts`、`handback-lifecycle.test.ts`、`chat-handback-scope.test.ts`、`session-abort-images.test.ts`、`runtime-orchestration.test.ts`、`govern-engine.test.ts`、`shell-review-chain.test.ts`及新增 `test/编排/report-provenance-consumer.test.ts`；A纯wrapper的0FS/0SDK、trusted键名与安全返回验证纳入同新增测试，不增另一未审文件。自身API/feature-map/memo/changelog/任务回交feature和方案证据同步。具体实现超出此集先回PM，不以Core代授权。

验收须证明终态后record、origin全分支、chat不串task；runtimeOptions/caps真实档与custom unknown、源/目标disabled/审读无目录且live兼容；源失败暂不投与仅保存幂等/过期；初始saved/Promise/通知竞态只Window入一次；目标ACK后user失败0Provider、boundary失败0、provider后history失败1且不自动重发；最终receipt缺失/跨handle/损坏保守；补存不改outcome/attempt或工具次数；批次冻结/屏障/未知task；原prompt/图片/ACK保真及metadata不进SDK；govern代理；native-only继续可读、真实字段与模板隔离、无新增FS/SDK/副作用、锚点不含secret且配对不变、历史假secret不通过summary/detail/source/error旁路IPC。拟命令仍 `node --test 'test/编排/*.test.ts'`、`npm run typecheck`；所有结果待实施，不引用旧247/247作为新接口通过。

Core先实现并验证A/C的Model/Service/实际bound能力，编排随后接线，Window/UI按同版接入，独立测试再验真实桌面；PM审核具体策略/数值/残余风险后客户授权实施。本文没有生产变更、验证或部署声明。

## 最终审核状态

已实际读取并接受 Core A revision 4、Core C revision 2、Window AC revision 3 的同版消费合同；本角色r1提出的能力/失败/legacy接口阻塞已在上述规范解决，无剩余技术合同阻塞。待PM综合确认的是客户对具体保存失败策略、预算/残余保护限制、16MiB材料与128回执策略、五保存查询动作及“查看来源角色文档”多一步的具体批准；这些不是本回签可以代授。源码和测试仍未实施。

## C2.tp1 文本保护窄回签（text_policy_revision 1）

已实际读取Core C同路径文末text_policy_revision 1，接受 **A4 / C2.tp1 / Window AC3**。本节覆盖前文“原文展示/持久”的任何歧义：modelPromptText及原TaskHandback只留可信Pipeline/Window内部，供原SDK调用逐字发送；不经IPC、日志或原文sidecar送renderer，不存入新增C报告来源/恢复材料。Core在首次保存前生成冻结displayInputText安全副本，新trusted-handback ANS user.text、typed detail.text/summary、IPC和仅保存恢复材料只消费该副本；给模型的原text与图片引用仍不变。三adapter既有native转录不在本批追溯清洗或改写范围。

直接引用Model `RuntimeInputTextProjectionV1`，保留modelInputRecorded:false及实际redacted/truncated/summaryTruncated标志；inputSaved只说明安全用户记录已保存，不声称完整模型输入落盘。接受16KiB显示文本、1KiB输入summary及每条完整编码记录1MiB联合上界；UI称“交接内容（安全显示副本）”，不得说可读完整模型原文。显示投影失败TEXT_PROJECTION_FAILED时Provider0次、inputSaved:false且retryDeliveryAllowed/retryHistoryAvailable:false，不raw fallback、不以空文字伪成功、不作为模型任务failed或工具denied。

source保存重试只存原冻结安全snapshot；成功后Window唯一归并入口可以**首次继续投递原回交**，这不是重跑源模型，Pipeline本身不enqueue。target历史补保存绝不启动Provider、重投或增加attempt。Core bound能力对象/方法与原内部options剥离范围保持C2，不增SDK字段或自造result union。

精确写集仍三源码/八测试，前述handback.ts的完整未隐藏写入路径证据兼容及handback-lifecycle实际行为case计划保留；在原report-provenance-consumer测试内补inner.prompt原文逐字与安全user/typed/summary/IPC不含虚构已知secret、flags/UTF-8预算、投影失败0Provider、补存不增加Provider的行为断言，不新建文件或能力。不宣称整份旧chat/助手/native日志全面无秘密。仅本设计记录更新，代码/测试/桌面未操作，待客户具体实施批准。
