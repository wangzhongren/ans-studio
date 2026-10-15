---
id: runtime-report-provenance-contract-c
type: design
title: C 报告来源与接收输入持久合同
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: draft
revision: 2
text_policy_revision: 1
related: [complete-flow-orchestration-assessment, orchestration-report-provenance-consumer-c, complete-flow-window-ac-consumers, runtime-tool-display-contract-a]
---

# 源报告、接收尝试与保存恢复分别记录

C/r2 是客户确认 UX v2 方向后准备的具体实施提案，取代 r1 中 caller 持久布尔值、disabled阻投及未定义恢复操作的候选。客户尚未确认本接口、预算或失败策略；本轮只改本设计，无生产、测试、桌面或模型动作。所属[现有功能](../feature/runtime-core.md)，独立验收以[三接口计划 C](../../../测试/docs/design/2026-10-15_three-interface-verification-plan.md)为准。

已读[编排消费 r1](../../../编排/docs/design/2026-10-15_design_report-provenance-consumer-c.md)、[窗口消费 r1](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-ac-consumers.md)。r2采纳编排的兼容分支：源disabled/旧adapter unknown必须保留原live回交；不采纳Window r1的disabled一概不投递。后者会改变旧in-memory行为，Window需据r2修订。真正enabled但保存失败不能借disabled降级绕过保存。

## 真实能力来自已绑定会话

当前factory使用 `caps.persistSession ?? runtimeOptions.persistSession ?? (sessionDir !== undefined)`；Pipeline输入、runtime字段和目录存在与否都不能证明Core真实store。取消r1的 `recordRuntimeReport({persistSession:boolean,...})` 静态入口，改为Core实际bindRole返回RoleSession上的可选、只读、闭包绑定能力：

```ts
interface RuntimeSessionPersistence {
  readonly mode: 'enabled' | 'disabled';
  readonly scope: { readonly roleId:string; readonly runtime:RuntimeKind };
  recordFinalReport(draft: RuntimeReportDraftV1): Promise<ReportSaveResultV1>;
  retryReportPersistence(reportId:string): Promise<ReportSaveResultV1>;
  getReportPersistence(reportId:string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence(attemptId:string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt(attemptId:string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange(listener:(change:RuntimePersistenceChangeV1)=>void):()=>void;
}
// RoleSession.persistence?: RuntimeSessionPersistence
```

Core在真实provider/storage闭包决定mode，不接受caller写入scope、projectRoot、持久布尔或路径。上述方法不需要再次传session/环境/报告正文来重试；Pipeline只从Service公开创建/返回的RoleSession取得能力，不导Provider或私有common。自定义adapter若缺此能力，标unknown-live，不推enabled；此为可信运行时内部能力而非从renderer反序列化的数据。Core disabled仍提供能力并返回disabled，所有操作均不创建目录。

Pipeline `RoleSessionHandle` 和 `GovernanceSessionHandle` 公开同名可选方法及只读persistenceMode（enabled/disabled/unknown-live），由实际能力派生、透明转发；没有能力时返回UNSUPPORTED，不新建Core/store补能力。Core对同一session闭包执行源报告与目标历史保存，dispose后不借新handle恢复旧内存快照。

## 中立schema v1

Model定义值，绝不导编排私有TaskHandback：

```ts
type RuntimeReportDraftV1 = {
  source: { roleId:string; runtime:RuntimeKind; turnId:string };
  taskId:string|null;
  origin:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:string; evidence:readonly string[]; at:string;
};
type RuntimeReportSnapshotV1 = Omit<RuntimeReportDraftV1,'summary'|'evidence'> & {
  version:1; reportId:string;
  summary:DisplayTextV1; evidence:readonly DisplayTextV1[]; evidenceOmitted:number;
};
type RuntimeInputProvenanceV1 = {
  version:1; kind:'handback'; deliveryId:string; attemptId:string;
  target:{roleId:string;runtime:RuntimeKind};
  reports:readonly RuntimeReportSnapshotV1[];
};
type RuntimeDeliveryReceiptV1 = {
  version:1; deliveryId:string; attemptId:string; turnId?:string;
  inputSaved:boolean;
  providerMayHaveStarted:boolean;
  history:'pending'|'saved'|'failed'|'disabled';
  outcome?:RuntimeTurnOutcome;
  retryHistoryAvailable:boolean;
  retryDeliveryAllowed:boolean;
  code?:RuntimePersistenceErrorCode;
};
```

DisplayTextV1复用[A/r3](2026-10-15_design_tool-display-contract-a.md)的text/truncated/redacted。status是最终报告声明或真实兜底，不是验收结果；origin按withHandback实际分支，合法submit_report即使终态失败仍是submitted-report。无报告的普通chat不产生对象，chat主动合法报告同样记录；taskId未知null，不从会话旧任务、标题或正文补。evidence不赋B文件读取权。

reportId推荐SHA256(canonicalJSON([source.runtime,source.roleId,source.turnId,'terminal-handback-v1']))，64位hex，projectscope隐含绑定会话目录。只保存终态覆盖后的最终对象，同ID同规范化内容幂等、不同内容CONFLICT；at不参与identity。缺真实turn/runtime时不构造可信reportId，保legacy round/handbackKey显示，不能跨会话猜身份。

deliveryId由Window在首次定格的有序连续批次生成一次UUID；其report成员、原始TaskHandback、原renderHandbackBatchPrompt文本与目标均冻结。允许的再次投递沿用deliveryId/报告成员，另生成attemptId；实际目标turn由Core生成，永不借源turn。失败期间新报告不得扩入原批次，原客户消息/dispatch屏障保持。单批数量不意味着任务全部收齐。

## 源保存与Pipeline接点

withHandback只完成最终选择、outcome覆盖、finished/intent清理和yield值，不直接/回调调用Service。**Pipeline外层消费已最终化handback时**调用真实 `session.persistence.recordFinalReport(draft)`；捕获保存结果并转发真实settled，不把存储失败改成模型failed，也不把保存等待说成模型仍工作。common不隐式依赖Service。

Core record方法验证draft.source等于绑定scope且真实turn存在于该session的已结束轮次；origin/终态业务由Pipeline提供，Core不根据正文再判。首次纯投影只做一次并冻结安全snapshot；PERSIST_FAILED也返回这个snapshot和reportId，Core自己保留待保存对象，后续重试只接受ID。不用变化后的环境重新生成summary/at或重新调用模型。

Provider在既有session-store.ts保存 `ans/reports/<reportId>.json`，0700目录/0600文件，复用目录链/普通文件校验和共享atomicWrite，读/构造不建目录。同进程同scope串行check/put，同内容already-saved，冲突保留原文件。承诺写入调用已确认，不承诺源/目标事务、掉电事务或多进程compare-and-swap；并发两个独立写进程不在本r2exactly-once保证内。未知版本/损坏report文件不覆盖修复，返回INVALID或CONFLICT及安全原因。

```ts
type ReportSaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';report:RuntimeReportSnapshotV1;retryAvailable:false}
  | {ok:false;state:'failed'|'disabled'|'expired'|'unsupported';
     code:'PERSIST_FAILED'|'CONFLICT'|'INVALID'|'PERSISTENCE_DISABLED'|'SNAPSHOT_EXPIRED'|'UNSUPPORTED';
     reportId?:string;report?:RuntimeReportSnapshotV1;retryAvailable:boolean;message:string};
// getReportPersistence: 同样state/reportId/retryAvailable与既有安全snapshot，绝不触发写或prompt。
```

enabled保存失败：仍显示真实livehandback并标报告未保存，暂不投su；pending独立于deliveryQueue，不提前消耗已入队去重键。只有PERSIST_FAILED且冻结快照实际保留时retryAvailable:true；INVALID/CONFLICT不自动覆盖。

submit_report生产回调返回 `{ok:true,state:'accepted-memory'}`，tools据此说明“候选已收到，最终保存与投递待本轮收口”，不抢称su已保存。非法/迟到返回false。旧无回执替身保持兼容，但生产由编排真实返回，Model冻结这一可选receipt字段。

公开查询/通知候选也以Model固定如下；通知是保存状态，不是业务报告或模型运行事件：

```ts
type RuntimePersistenceErrorCode = 'INVALID'|'CONFLICT'|'PERSIST_FAILED'|'PERSISTENCE_DISABLED'
  |'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'PROVENANCE_TOO_LARGE'
  |'REPLAY_DAMAGED'|'REPLAY_CHANGED'|'ATTEMPT_ALREADY_STARTED'|'RECEIPT_UNAVAILABLE'|'TEXT_PROJECTION_FAILED';
type ReportSaveStateV1 = {
  state:'saved'|'failed'|'disabled'|'expired'|'unsupported';
  reportId?:string; report?:RuntimeReportSnapshotV1;
  code?:RuntimePersistenceErrorCode; retryAvailable:boolean;
};
type DeliveryReceiptQueryV1 =
  | {state:'known';receipt:RuntimeDeliveryReceiptV1}
  | {state:'expired'|'unsupported';code:'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'REPLAY_DAMAGED';retryAvailable:false};
type DeliverySaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';receipt:RuntimeDeliveryReceiptV1}
  | {ok:false;state:'failed'|'expired'|'unsupported'|'disabled';
     code:RuntimePersistenceErrorCode;receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;message:string};
type RuntimePersistenceChangeV1 =
  | {kind:'report-save';scope:{roleId:string;runtime:RuntimeKind};reportId:string;state:ReportSaveStateV1}
  | {kind:'delivery-history-save';scope:{roleId:string;runtime:RuntimeKind};attemptId:string;
     state:'saved'|'failed'|'expired'|'disabled';receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;code?:RuntimePersistenceErrorCode};
type RuntimeDeliveryProgressV1 = {
  stage:'turn-created'|'input-saved'|'provider-may-start'|'settled';
  receipt:RuntimeDeliveryReceiptV1;
};
// PromptOptions.onDeliveryProgress?: (progress:RuntimeDeliveryProgressV1)=>void
// RuntimeDeliveryError extends Error { readonly receipt:RuntimeDeliveryReceiptV1 }
```

retryAvailable仅表示当前有材料可执行一次仅保存，不表示存储一定恢复。source同reportId/target同attemptId重复点击共用一个在途Promise；失败后只在下一次显式调用再试一次，无内部循环。get/订阅不执行保存。成功后重复调用返回already-saved，失效后不能自动从旧原文重建。所有code最终限定为本文已列机器码，message必须经A保护，绝不通过IPC回显raw异常对象。

## disabled与legacy兼容分流

| 源/目标实际能力 | 行为 |
| --- | --- |
| source enabled、saved | durable snapshot链，可投递；target enabled保存来源，target disabled仅live |
| source enabled、PERSIST_FAILED | live事实保留，暂不投递，支持显式仅保存恢复；禁止冒充disabled绕过 |
| source disabled | 保留原live自动回交，标“仅本次会话，报告未保存”，不建目录、不阻原行为 |
| source缺能力/真实turn的legacy | 保留原livehandback与旧key，标来源/持久未知；不造reportId、不可声称saved |
| target disabled | 原live投递继续，Core内存receipt/progress可用，history:disabled、inputSaved:false，不写user/boundary/report目录 |
| target旧adapter缺能力 | 原live文本兼容；无新durable保证，receipt缺失不得被新恢复动作当可安全重发证明 |

为source disabled/unknown live呈现报告摘要，候选 `RuntimeLiveHandbackPresentationV1 {version:1;kind:'handback-live';durability:'memory-only'|'unknown-live';reports:readonly RuntimeLiveReportViewV1[]}`；view包含来源角色、已知runtime/turn（可选）、实际已知taskId（只在未知时null）、真实origin（若已知）、status、安全summary/evidence，不含reportId或saved声明。memory-only不抹掉真实已知任务关联。完整公开值类型为：

```ts
type RuntimeLiveReportViewV1 = {
  source:{roleId:string;runtime?:RuntimeKind;turnId?:string};
  taskId:string|null;origin?:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:DisplayTextV1;evidence:readonly DisplayTextV1[];evidenceOmitted:number;at:string;
};
type RuntimeLiveReportDraftV1 = Omit<RuntimeLiveReportViewV1,'summary'|'evidence'|'evidenceOmitted'> & {
  summary:string;evidence:readonly string[];
};
type RuntimeLiveHandbackPresentationV1 = {
  version:1;kind:'handback-live';durability:'memory-only'|'unknown-live';
  reports:readonly RuntimeLiveReportViewV1[];
};
```

编排/Window从实际对象构造，不从renderer前缀构造。为unknown adapter也能取得相同安全投影而不新建store，Service提供纯公开 `projectRuntimeLiveHandback(draft:RuntimeLiveReportDraftV1,context?:{credentialEnvNames?:readonly string[]}):RuntimeLiveReportViewV1`；draft是上面view相同来源/status/task/at但summary:string、evidence:readonly string[]，不接受reportId。Pipeline从实际最终对象调用，使用A同owner纯净化/预算，无Provider/SDK/磁盘副作用；Window仍只经Pipeline拿结果，不导Service或Core私有common。此函数只形成有界值，不发行durable记录身份或权限，context仅可信当前键名、旧secret限制同A。

`PromptOptions.inputPresentation?`只用于live；Core可把它附canonical输入live事件，但**存盘的user/typed event不持久这个live报告对象**，否则会伪装成durable链。给模型的原text保持；target enabled的user/typed文本改存下述安全有界交接投影，不存raw模型输入。history重开只显示该“交接内容显示副本”、结构化来源未保存，不承诺live摘要或完整模型原文恢复。Core对emit的live与persist投影明确分开，测试核对。source enabled/saved向disabled target也可live显示原snapshot，但target无重开恢复保证。以上不新增自动队列恢复。

## 目标输入、开始边界与权威回执

可信Window队列把provenance或live presentation交Pipeline；普通renderer sendSession文本不接收构造报告权。Pipeline确认项目/角色与源状态并交Core，Core用绑定targetscope再次校验version/预算/来源：durable provenance必须匹配source已保存snapshot，live分支不伪造source验证。不同入口的原handback.required语义保持。

推荐 `PromptOptions.inputProvenance?`、`inputPresentation?`、`onDeliveryProgress?` 可选兼容增加；Core在进入SDK前剥离这些新字段，图片原引用、原模型文本完全不变，不能用安全截断summary重新render模型交接。

1. bound session持有preflight互斥，enabled读取完整target replay查attemptId、损坏严格失败；disabled只查本session内存。相同attempt已存在只返回既有receipt或ATTEMPT_ALREADY_STARTED，不再创建turn。跨handle enabled可读日志拒重入，不承诺两进程同时通过的exactly-once。
2. Core生成actualturn并调用原onTurnStarted；progress:turn-created/history:pending（disabled为disabled），此时ACK不能证明保存或Provider已开始。新progress回调是同步观察，异常只写有界诊断，不改变执行/许可，不允许回调重入prompt。
3. enabled await appendReplay同一user条目(安全displayText/actualturn/inputTextProjection/inputProvenance)，成功后inputSaved:true；失败receipt明确providerMayHaveStarted:false、history:failed，无inner.prompt。文件可能已partial，不谎称磁盘零字节。disabled不调用append，不建目录，inputSaved:false/history:disabled，仍走下一步live。
4. canonical输入live事件沿原actualturn生成。enabled在调用Provider之前await追加内部message边界 `{source:'delivery-boundary',version:1,deliveryId,attemptId,turnId,stage:'provider-may-start'}`；其保存失败Provider0次。边界成功但进程随后崩溃只能证明“可能已开始”，不能由缺settled反推未执行。disabled只保内存边界。signal复查/真实调用前更新保守providerMayHaveStarted。
5. 调用inner.prompt后，任何同步抛错、异步failed/aborted/timed_out/completed或事件/index保存错误都不自动重发模型。Core保留最终outcome和实际history结果，返回成功也可通过query取得权威receipt；失败抛 `RuntimeDeliveryError {receipt:RuntimeDeliveryReceiptV1}`，不让Pipeline包装丢失。progress不足以替代最终receipt。
6. Window仅在receipt确定providerMayHaveStarted:false、目标日志可完整读取、失败不是INVALID/冲突/超预算/损坏时可沿原下次放行策略创建新attempt投原冻结工作单元；input已保存但Provider未开始也保留旧user事实。可能开始、receipt缺失/未知、partial记录一概不自动新attempt。仅C可信handback路径消费新receipt，旧普通message/dispatch规则不顺带改动；legacy分支保原流程、不伪造新的安全重试保证。

### 最终receipt落盘与跨handle查询

enabled目标在本轮实际事件与index保存通过后，追加一个具entryId的内部message记录，detail为 `{source:'delivery-receipt',version:1,receipt:RuntimeDeliveryReceiptV1}`。这是最终保存回执，不是boundary，不含报告全文。拟保存receipt写history:saved、实际outcome及实际inputSaved/providerMayHaveStarted；只有这个最终条目的写入也确认成功，当前调用才对外返回history:saved。若最终条目追加失败，内存权威receipt改history:failed，保留该条目作为仅保存恢复的候选，不再调用Provider。恢复检查已完整存在的同entryId条目时不得重复追加；未知/损坏仍按既定保守拒补。Window对delivery-receipt也只呈现投递/保存状态，不当助手发言或验收结论。

新handle的getDeliveryReceipt读取同targetscope完整replay，按attemptId+实际targetturn找到有效version1最终delivery-receipt才返回其真实结论；不得凭boundary或某个邻近settled拼最终回执。读到最终receipt说明当时写入已确认，不夸称掉电事务。只有boundary或user、没有最终receipt时返回known但history:pending/code:RECEIPT_UNAVAILABLE、providerMayHaveStarted:true（保守未知）、无outcome、retryHistoryAvailable:false、retryDeliveryAllowed:false；不将缺settled说成没执行。完全找不到attempt或旧unknown版本返回expired/unsupported，不复活内存材料。新handle即便可查旧saved receipt，历史补存仍因材料失效返回SNAPSHOT_EXPIRED；disabled没有磁盘receipt，重开只expired。读取损坏不返回伪known成功。

## 仅保存恢复：入口、次数、保留与失效

**没有定时器、自动退避或重新prompt。** UI必须明确区分“重试保存报告”“重试保存历史”和再次投递；新增动作及状态需UI/Window按本接口补具体消费方案再交客户确认，不是本设计已经有按钮。

源：`retryReportPersistence(reportId)`在当前源bound capability中查第一次失败的安全快照，只执行同对象文件保存。单reportId至多一个在途Promise，重复点击复用；成功后重复返回already-saved、不发新成果。Pipeline同名代理，Window受限入口候选 `retryReportSave({projectRoot,sourceRoleId,runtime,reportId})`验证当前导入scope/实际source handle，拒绝正文/路径/持久布尔。成功只更新原reportId保存状态，不重新发模型完成结论。**唯一enqueue owner是Window**：Pipeline仅返回结果/转发保存状态，绝不在retry success或订阅回调里另调用dispatch/enqueue。Window一个同步状态归并函数按project/sourceRole/runtime/reportId登记原TaskHandback+安全snapshot+保存态，初始saved、retry Promise返回与onPersistenceChange都只进入此函数；必须同时已有原业务对象和saved，且在任何await前把not-queued转queued，才调用一次原入队能力。状态通知先到只能缓存state，不能造handback；Promise与通知两次到达不会各入队一次，失败→成功亦不生成第二份源成果。

目标：`retryDeliveryHistoryPersistence(attemptId)`只使用Core保留的本次捕获材料，绝不让caller拼JSONL；Pipeline/Governance句柄透明转发，Window候选 `retryDeliveryHistorySave({projectRoot,targetRoleId,runtime,attemptId})`只处理已知失败receipt。即使原Provider没启动，补存成功也不启动它，不等同再次投递。

推荐可补范围：store saveSession/index失败，或append返回失败但现文件仍为完整可解析的**已知base前缀+本次已确认写入的记录前缀**，且无后续/外来记录。Core保存base指纹、该attempt逐条实际捕获的安全JSON编码与已确认结果；补写采用当前scope串行、检查后共享atomicWrite替换完整replay（仅已知缺失尾段）/index。每条新记录有可选entryId（由实际turn+本轮单调序号组成，非正文），只补未确认尾段，不重复已存项。原模型未调用的事实不因补写而变已调用；必要的最终receipt记录显式保留未开始状态，边界标记不冒充真实执行。

partial损坏/未知版本、不匹配base、已出现后续或外来记录→REPLAY_DAMAGED/REPLAY_CHANGED，retryAvailable:false，不自动截断/覆盖/跳坏行，也不重模型。能补的内存材料超过保留预算或已失效→SNAPSHOT_EXPIRED。此范围有意保守，不称通用日志修复。补存成功只更新history状态，providerMayHaveStarted/outcome/report成员/attempt次数不能回退。

目标返回 `DeliverySaveResultV1 = {ok:true;state:'saved'|'already-saved';receipt} | {ok:false;state:'failed'|'expired'|'unsupported'|'disabled';code;receipt?;retryAvailable:boolean;message:string}`。`getDeliveryReceipt(attemptId)`返回 `{state:'known',receipt}` 或 `{state:'expired'|'unsupported';code:'SNAPSHOT_EXPIRED'|'UNSUPPORTED';retryAvailable:false}`；只查当前会话内已知/日志中完整可识别结果，不以读取失败造空成功。stage观察、query和RuntimeDeliveryError使用同一状态源，不能由Window按错误文案猜。

推荐内存恢复材料总预算**每bound session 16MiB**，覆盖报告快照和目标补存材料；单对象先检查能否完整保留，超预算不保留部分可写材料，返回retryAvailable:false。采用FIFO淘汰最旧未在途材料并发typed状态更新expired，后续ID查询SNAPSHOT_EXPIRED；成功receipt最多保128个，超过其详细回执失效；最小seenAttemptId标识集不随receipt淘汰，避免disabled模式旧attempt因详细回执过期而被再次执行。标识集也计16MiB；若连新标识都无法容纳，新的C投递在分配turn前明确拒绝（PROVENANCE_TOO_LARGE），不淘汰已见标识伪装新attempt。普通无C metadata prompt不因此新增读取或执行权。跨handle disabled不承诺重启去重。无时间TTL/后台timer，已在途对象不被淘汰。dispose/项目关闭/handle替换令所有未保存材料失效（允许已开始单次保存完成但不再投递）；UI禁旧按钮且不能借新handle重建旧对象。重启后只读事实，不恢复内存待保存或自动发送。预算与保守恢复范围是本r2实质待批准策略。

## 状态外推与公开读取

Pipeline外层保存包装候选 `reportPersistence:{state:'saved'|'failed'|'disabled'|'unknown-live'|'expired';reportId?;code?;retryAvailable:boolean}`，原TaskHandback业务对象和模型原文另外保留。`report-persistence-updated`/`delivery-history-updated`是编排/Window的只读存储状态更新，不新增Core SessionEvent.kind，不当新handback，也不作为再次入队依据。Core capability提供只读订阅 `onPersistenceChange(listener):()=>void`，事件含scope/ID/state/安全code/retryAvailable，dispose退订，不能传原secret或报告raw正文；Pipeline/Window按原handle转发，旧handle通知不可更新新scope。UI具体载荷与主进程受限操作由owner补充，本r2不替其授新IPC权。

现有Service `readRuntimeSessionHistory({projectRoot,roleId,runtime,credentialEnvNames?})`经Pipeline读取，返回 `{record?,entries,reports?:RuntimeReportSnapshotV1[],reportErrors?:{reportId?,code}[]}`；source报告单文件未知版本/损坏列reportErrors，旧replay损坏仍整体报错不跳行。user/typed event可选provenance及boundary/receipt由Window归一，不把内部边界当助手发言；缺字段旧历史只原始交接，不从[回交]升级。target disabled/live对象不凭新加载history恢复typed报告。

源记录成功而目标失败不回滚源报告；目标补存成功不改变源结论。report saved只说明历史已存，completed也不等独立验收。仅给模型的交接text逐字保留；新C历史/IPC的交接内容按下节安全有界投影，UI不得称为完整模型原文，不给raw旧summary旁路；新source报告存前应用A纯净化能力，绝不把凭据快照写盘。

## C/r2 文本政策补充1：模型原文与历史显示副本分开

**单一推荐**：只对本次新C可信handback路径（实际inputProvenance或inputPresentation）实行下面分离；不把“模型收到原文”解释为“ANS必须另存raw原文”。这是具体内容政策，待客户确认，替代r1/r2早期“原user.text照旧落盘”的表述。普通无C metadata聊天、旧ANS/native日志不随本补充重写或扩大行为。

- modelPromptText：可信Window/Pipeline定格的实际交接全文，只保在原调用链内存，inner.prompt继续逐字接收它、原图片引用不变。安全报告snapshot不能反向用于重render模型输入。三adapter/native引擎原本是否记录该模型输入，保持既有语义，本次不泛清/改写native转录。
- displayInputText：Core在首次保存前从同一modelPromptText一次性计算，应用A同一个当前profile已知值+敏感格式净化，**先净化再UTF-8截断**。只把这个安全副本用于新C target replay.user.text、canonical输入event.detail.text及其summary、IPC和历史恢复材料。Pipeline/Window不能把raw text/原TaskHandback当sidecar再次送renderer或诊断日志。
- modelPromptText不存进新C的provenance、inputPresentation持久分支、receipt或history补存材料。source enabled失败后的“重试保存报告”只保存冻结安全snapshot；成功后**可以首次继续原回交投递**，由Window唯一enqueue路径推进，不重跑源模型。target“重试保存历史”只补已经捕获的安全记录，绝不启动Provider或再投递。

新增Model可选标记（schema 1，不改A工具Source）：

```ts
type RuntimeInputTextProjectionV1 = {
  version:1;
  source:'trusted-handback-display';
  modelInputRecorded:false;
  redacted:boolean;
  truncated:boolean; // detail.text/user.text相对modelPromptText是否截断
  summaryTruncated:boolean;
};
// RuntimeReplayEntry.inputTextProjection?:RuntimeInputTextProjectionV1
// PromptInputEventDetail.inputTextProjection?:RuntimeInputTextProjectionV1
```

新C input.user.text和detail.text使用同一displayInputText；summary只从该安全副本产生，不再插raw原文。标记明确“此处未记录完整模型输入”，不能据redacted:false/truncated:false让UI声称这是native完整转录；旧无标记user仍按旧文本/未知来源处理，不给它补新保护承诺。inputSaved:true表示**安全用户记录已保存**，不再含“raw模型输入已落盘”之意；receipt其余执行事实不变。

推荐displayInputText上限**16KiB UTF-8**、typed输入summary上限**1KiB**，截断保持完整码点，分别准确标truncated与summaryTruncated；redacted只在实际替换时true。两段、上述flags、身份及provenance合计必须分别满足每个新增user/event编码后**1MiB**总记录上界，不另叠加一份1MiB文字附件；因此provenance接近原1MiB预算时可能因完整记录开销而PROVENANCE_TOO_LARGE，Provider前明确返回，不静默丢成员。source-disabled/target-disabled在live IPC同样只给该安全显示副本；disabled仍不写任何目录，给模型text不变。

投影函数/profile净化异常时不回退raw，也不保存空副本假成功；返回带receipt的TEXT_PROJECTION_FAILED，inputSaved:false、providerMayHaveStarted:false、retryDeliveryAllowed:false/retryHistoryAvailable:false，安全错误说明“交接显示内容生成失败，尚未交给Provider”。该错误不是源报告结论或工具denied；需修配置/接口后由正常明确流程再尝试，不能把“重试保存历史”变重prompt。已成功计算的副本冻结后供原attempt保存重试，不因环境/凭据变化重新生成另一版。

Window/UI新入口文案应为“交接内容（安全显示副本）”，在净化/截断时给真实标志；不许把不可得的完整模型原文标成可阅读全文，不新增读取native原文按钮。source报告原业务对象用于可信内部生成实际模型交接，向renderer只传安全snapshot/投影，仍不能按用户前缀升级报告身份。

独立验收精确对应：虚构已知secret/quoted赋值/URL敏感项出现在真实交接全文时，捕获inner.prompt证明该原文逐字未改；检查**本次新增C受保护的user/typed输入/summary/provenance/report文本字段**写入ANS前及IPC前不含这些已知secret，标志与UTF-8预算正确；补存仍只写同安全副本，Provider次数不增加。检查普通chat前后语义不变、既有文件hash不被追溯清洗。此测试不宣称整份含旧chat、任意助手输出、真实opaque身份与native转录的日志“全无secret”，不承诺所有未知秘密DLP。此限定须与root验收框架一致，不用原型或脱敏截图替代存储前检查。

## 推荐数值与实际决策

每报告summary16KiB、evidence最多32条每条2KiB、snapshot JSON96KiB；长文本净化后UTF-8截断并准确evidenceOmitted，身份不可截断。durable目标provenance JSON1MiB、最多256成员，超限Provider前PROVENANCE_TOO_LARGE，不丢成员/改屏障/静默拆批。live presentation按相同文本/总预算，不把安全截断投影反向改模型原文。理由是摘要/证据可核对且单事件/恢复内存有硬上界。客户待决：上述数值、enabled保存失败阻投、Provider可能开始后禁止自动重放、16MiB/128receipt失效与保守仅补尾段策略。disabled/legacy维持原live兼容是r2默认，不另作为breaking选项偷换。

## 精确候选写集与依赖

Core：`src/model/runtime.ts`（capability/report/provenance/live presentation/progress/receipt、可选PromptOptions/replay entryId/storage形状）、`src/service/runtime/session.ts`（实际bound能力、Pipeline可得公共操作闭包、纯live投影、输入验证、边界/最终receipt/订阅/恢复材料）、`src/provider/runtime/session-store.ts`（报告原子文件、已知尾段与index补存操作）、`src/provider/runtime/tools.ts`（accepted-memory回执文案）；新增私有 `src/common/runtime-core/report-provenance.ts`。测试 `test/runtime-core/report-provenance.test.ts`、`session-store.test.ts`、`session.test.ts`、`prompt-start-acknowledgement.test.ts`、`tools.test.ts`，own api/feature/memo/changelog/design/证据。均在当前边界，A/C同owner串行实施，不新建跨role共享副本。

编排精确写集以其consumer r1为准：handback值与origin、run-role外层record/retry/proxy、govern-session代理和其自有测试；common不反向调用Service。Window须修disabled兼容和补受限保存动作/状态更新IPC、固定批次与receipt分类、历史映射；UI须补真实按钮/保存失败与expired呈现，缺receipt不推成功。它们的具体scope由各owner确认，本Core规范不替其授权。

依赖先Core canonical r2→编排/Window/UI/三adapter独立评审→PM合并具体策略与客户确认→Core实现验证→peer接线→独立真桌面。测试沿三接口计划C并加入真实factory runtimeOptions/caps持久覆盖、自定义unknown、pm-reviewer持久false、source/target disabled无目录live仍投递、source文件失败仅save重试、重复点击单在途/128与16MiB失效、target ACK后user失败Provider0/边界失败0/Provider后失败1无自动重发、完整前缀可补与partial/后续写入不可补、query/progress/最终错误一致、dispose迟到状态、原文/图片/新metadata不入SDK。没有运行这些未来测试或声明通过。
