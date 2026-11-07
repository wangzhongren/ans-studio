# 角色直接能力 Model 实施 M1-R1

固定角色：运行时核心。候选 HEAD `77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3`，`feat/plan-escalation-card`；保留全部既存差异，旧 plan-escalation 增量不归本轮。上位为已确认 P3.1、T1、B1 与项目管理 C0-P1；本轮经统筹实际派发，只实施 Model。

## 实施前 Mutation Contract / 签名冻结

用户入口仍是 `submit_version_change`：此前回提交状态，直接分支将可回整单 applied/no-op/rejected/committed-pending-recovery/blocked。`SubmitVersionChangeFn(input, signal?)` 保持原名；既有字段保留，新增 operation/base/期望原字节摘要以及直接回执。旧 customer 记录只读兼容，不补 decisionId。

冻结导出位置：`src/model/trunk.ts` 主属 `DirectActionSource`、`DirectActionReceipt`、`TrunkCommitRef {version,digest}`、`SnapshotRef`、`CompleteSnapshot`、`FrozenRoleEvidence` 和纯结构不变量检查；`src/model/version-change.ts` 复用来源并扩冻结记录；`src/model/runtime.ts` 提供 `SelectRunChangeFn`、`CompleteTeamPlanFn`、`ActivateRoleDocumentsFn`、`CloseCreatedTaskFn`、`DecidePendingRequestFn` 及其输入/结果、可信 chief 有界独立上下文。新窄能力不接受模型自报 actor/source；由注入闭包绑定真实会话，既有 Submit initiator 仍由 scope 填入。

写集仅上述三 Model、`test/runtime-core/direct-role-capabilities.test.ts` 和本角色 api-spec/memo/feature-map、本记录、`../feature/direct-role-capabilities.md`。不改 tools/schema/session，不做 I/O、业务编排、提交、应用或真实模型。trunk 零 import；version-change 单向 type-import trunk；runtime 只读引入 Model。原签名旁可选兼容字段不等于直接路径可以省略必需事实；直接路径使用判别联合并经服务重新核事实。

风险 T3；本节点精确检查 `node --test test/runtime-core/direct-role-capabilities.test.ts`、`npm run typecheck`。测试覆盖三来源及伪客户/缺字段拒绝、完整快照/冻结物证缺损、直接回执提交前后分支、窄输入类型和 chief 无生产写权的有界上下文。哈希/字节内容由 Provider 校验；本层纯检查不宣称持久化、原子性或身份鉴真。下游调用者证据因本共享契约变化失效，由 O/G/W 后继重测。本节点通过不代替 B2 验收。

统筹后续精确细化：新增本人原 Section 1 已覆盖的 `src/model/project-state.ts` 和 `test/runtime-core/directive-contract.test.ts`，仅为既定 chief-delegated 来源适配 `VersionDecisionDecidedBy` 与原精确 to/by 联合断言；不扩为 string、不删除断言。

## 已实施与验证

源码实际导出及逐项参数冻结见[api-spec末节](../../api-spec.md)，现行流程见[功能](../feature/direct-role-capabilities.md)。四Model/两测试为本轮精确源码测试集合，runtime.ts里原plan-escalation段仍是既存差异，未清理/覆盖也不归本轮。

Node v24.22.1，Windows PowerShell；候选为上述HEAD加全部既存差异，未commit。实际执行：

- `node --test test/runtime-core/direct-role-capabilities.test.ts`：修订前初次exit 0，8 tests / 8 pass / 0 fail / 0 skip。
- `node --test test/runtime-core/direct-role-capabilities.test.ts test/runtime-core/directive-contract.test.ts`：最终exit 0，27 tests / 27 pass / 0 fail / 0 skip，duration 111.3409 ms。新增强来源/回执、完整快照/冻结证据、chief上下文及旧调用兼容；原directive断言保持精确联合，穷举显式处理chief-delegated。
- `npm run typecheck`：首轮仅UI reason遗漏；chief来源扩展后曾额外暴露O赋值与原精确联合/穷举，已在统筹授权的project-state和原测试内最窄关闭。最终exit 1，仅`app/renderer/src/chat/version-change-view.ts(354,14) TS2741`：`Record<DocFreezeReason,I18nKey>`缺`role-direct-applied`。已报统筹由U/P适配，本人不越界修。不能声称M1主类型通过。
- `git diff --check -- src/model/runtime.ts src/model/trunk.ts src/model/version-change.ts src/model/project-state.ts test/runtime-core/directive-contract.test.ts`：exit 0，仅Git CRLF提示；无跨层项目import，trunk零import，version-change单向type-import trunk，runtime调用trunk纯结构检查。新增测试亦均为Model。

最终原字节SHA256（采集后本节点不再改这些文件）：

| 路径 | SHA256 |
| --- | --- |
| src/model/runtime.ts | 14F950D5884F2453E2438F8215839E94DA063A4B82C4B3FE213DB4D87CFFD72F |
| src/model/trunk.ts | 8E7951CC37D9C623F73629EA6063ABBD2503E6673E3A55FCE9B0C3DD420023B2 |
| src/model/version-change.ts | CF9F8F205B242AC6ED79C0C122B67F7A484766A2FB9C73CEB491D7E2A077745D |
| src/model/project-state.ts | 62E3B1B996FBC87F1A603835D219DD3CCCEF4EBF6AD59B6A9A9042C0A5B5C1FC |
| test/runtime-core/direct-role-capabilities.test.ts | 8230AD1D130D4605FC78DDD409F1214A9EFF1DBFF7420AA6F5AC1C7A557F6D73 |
| test/runtime-core/directive-contract.test.ts | CEB2A29366C4DBCF5A35071A90BACACE70CE798CE07024623800EC1DF56D0F54 |

这仅识别本节点六文件，不代表全组合候选。未启动应用/真实模型、未commit/push。工具/schema/session及O/G/W真实身份、CAS/字节校验/快照解引用/通知/收口/委托rev结算均待后继；新增Model会使相关caller旧证据失效。无哈希校验/持久化的纯结构测试不能代替这些集成证据，未独立验收。

P实际短review要求的最窄修订已落：`CloseCreatedTaskInput.outcome`直接复用既有`TaskClosedOutcome`（accepted|rework|rejected），新测试含cancelled编译期拒绝，api同步；不把执行失败/取消伪成收口。修订后重新跑上述两文件27/27及主type，后者仍仅UI映射一红。表格哈希已更新至该修订。

六文件聚合身份 `ADE9D98EF9023F6A7BE6063E77DB9290D4B5F6AC92223A7649375B41B2CB48B1`：按上述六个相对路径的PowerShell Sort-Object升序，对每项拼`path + 空格 + lowercase(raw-byte-sha256)`，LF连接、无末尾LF，UTF8无BOM后SHA256。仅此六文件；全文档及组合候选由统筹另采。旧差异保留，非本轮成果。

## R2 实施前短合同（统筹续派，与O S1不相交）

沿C0最新3431B667D46E54D043B3279E7AD8CB292806563D499EDF7B8641C38E4E550519及P2同对象审结，写集仅provider/runtime/schema.ts、tools.ts、service/runtime/session.ts，两既有授权测试submit-capability-tools/direct-role-capabilities及本人原文档；暂不改冻结Model。五工具select_run_change/complete_team_plan/activate_role_documents/close_created_task/decide_pending_request严格未知字段拒绝、可信scope门控、Fn未注入不注册，既有submit_version_change严格透传operation/base/期望原hash且保来源回执。工具仅参数/回执薄包装，不做I/O或业务判定。Service新增可选chiefDecisionContext:ChiefDecisionExecutionContext注入锚点，宿主创建真实chief上下文；此模式仅决定工具、无MCP/生产写/shell/dispatch/close，校验身份/绑定request与有界预算。普通会话保持继承注入透传，旧plan-escalation实现保留。

检查`node --test test/runtime-core/submit-capability-tools.test.ts test/runtime-core/direct-role-capabilities.test.ts`与`npm run typecheck`；正反例核角色/自报来源/未知嵌套字段/必需hash/直接回执/中止后已提交事实保留，Service隔离及预算由受控Provider检查。跨owner在飞类型红仅记录不越界修。不应用/真实模型/commit/push。

## R2 最终交付

三个生产路径与submit-capability-tools.test.ts已实施；direct-role-capabilities.test.ts本节点未改。具体工具名/注入位/Service签名与限制见[api-spec R2](../../api-spec.md)。原plan-escalation段保留，不清理旧差异，不计本轮成果；Model未改。

Node v24.22.1 / Windows PowerShell，同候选HEAD加既存及本轮差异。实际最后命令：`node --test test/runtime-core/submit-capability-tools.test.ts test/runtime-core/direct-role-capabilities.test.ts` exit0，29 tests /29 pass /0 fail /0 cancelled /0 skip，duration248.6831ms。测试明确核roleDocumentChecks/actor/source/委托开关未知字段零调用、嵌套缺损/越界、scope门控、原样参数/signal、所有直接状态/提交后中止、错operation/坏恢复回执、非推荐项/退修/原发起者绑定、chief无生产工具/MCP/持久化与实际25ms轮次超时、普通会话透传。

`npm run typecheck`最终exit0。早期实际曾有O在飞src/service/trunk/public/trunk-service.ts缺executeDirect/recoverDirect/readEffectiveSnapshot导出、test/编排/direct-role-capabilities.test.ts message on never，未越界修；后续owner差异收敛后同命令真实通过。`git diff --check -- src/provider/runtime/schema.ts src/provider/runtime/tools.ts src/service/runtime/session.ts test/runtime-core/submit-capability-tools.test.ts` exit0，仅CRLF提示。

| R2候选五文件 | 原字节SHA256 |
| --- | --- |
| src/provider/runtime/schema.ts | C3A86E972764139D779DB72ABDB3F2F4DD9E71FDE765EC249E6E1EEEE22E5F39 |
| src/provider/runtime/tools.ts | F064DC1827C0691DADE8FDF769327E7174D52F6E508C043EA55566BD02F6CE09 |
| src/service/runtime/session.ts | 919019A9A41DFFE9BDF1E1830E3E60D50838F13538EC70849C4403DA0F3CECC2 |
| test/runtime-core/submit-capability-tools.test.ts | D2CF8C46423182ECAE49D6C0CFCFCC03A8C344001768CF449B17C88D234D7284 |
| test/runtime-core/direct-role-capabilities.test.ts（复用未改） | 8230AD1D130D4605FC78DDD409F1214A9EFF1DBFF7420AA6F5AC1C7A557F6D73 |

五文件聚合`E51E7119CC8E4E259684F39359C8DE6D1C8E2C5C9CE5C753F6251FA13CC4AD0F`；算法同M1：相对路径Sort-Object升序，每项path空格lowercase(raw SHA256)，LF连接无末尾LF，UTF8无BOM后SHA256。不是全组合候选身份。调用边仅Service构造本属Provider公共工具入口，工具新逻辑只调注入Fn及Model/纯schema，未新增I/O、账本、业务状态机或跨owner导入。必要日志沿既有工具调用/结果与Service终态，无另造业务日志。

当前为本层已实现并自测；W真实会话/权威rev/独立上下文生命周期、O/G真实权限/快照/原创建者及Q跨层闭环仍需消费验证，本测试未替代这些生产事实；T3适用全量及独立验收交统筹。无应用/真实模型/commit/push。

## R3 实施前窄合同

统筹正式续派、root按已批P3.1/C0澄清：规划trunk可缺workflow，真实run/派发执行必须有，不造默认引用/空hash/第二phase。仅改src/model/trunk.ts、version-change.ts和既有direct-role-capabilities.test.ts，本人api/change/memo追加。冻结记录纯结构不变量从G当前实际逻辑收敛唯一Model导出isValidDocFreezeRecord；不混当前委托开关或业务授权，历史合法已提交chief-delegated物证在关闭委托后仍有效。O/G自改消费者，O/W自修workflow空态与执行拒绝，不代写。精确node --test test/runtime-core/direct-role-capabilities.test.ts、npm run typecheck，记录真实caller红；不应用/模型/commit。

## R3 已实施证据与消费交接

最终签名见[api R3](../../api-spec.md)。`hasExecutionWorkflow`只核workflow结构前提，不授执行权；规划缺失在序列化时原样缺失，无默认物证。`isValidDocFreezeRecord`规范Model导出已经就绪，O/G自改各自读取/持久化入口，本文不假称其全部收敛完毕。

Node v24.22.1，Windows PowerShell；同HEAD加既存/并行候选。最后`node --test test/runtime-core/direct-role-capabilities.test.ts` exit0，10 tests/10 pass/0 fail/0 cancelled/0 skip，101.7427ms。含规划缺workflow正例、执行前提缺损/null/坏kind/path/hash反例、ExecutionTrunkManifest编译期拒绝未收窄规划、历史customer/application及bound direct/chief freeze正例与21项坏来源/错reason/假客户/缺快照等负例；未调用live委托开关。`git diff --check -- src/model/trunk.ts src/model/version-change.ts test/runtime-core/direct-role-capabilities.test.ts` exit0，只有CRLF提示。

最后`npm run typecheck` exit1，40条旧workflow必填消费者诊断；本节点Model与新测试无诊断。确切caller为：

| 原属主消费路径 | 最后输出行号（并行owner可能后续移动） |
| --- | --- |
| app/desktop/version-change.ts | 1022、1024、1080、1082、1099 |
| src/pipeline/orchestration/version-change-runtime.ts | 305（两处） |
| src/service/trunk/impl/apply-journal.ts | 87（两处）、646（两处）；前次在飞输出为86/640 |
| src/service/trunk/impl/refreeze.ts | 107（两处） |
| src/service/trunk/impl/stable-snapshot.ts | 53 |
| src/service/trunk/impl/trunk-common.ts | 115（两处） |
| src/service/trunk/impl/trunk-verify.ts | 34（两处） |
| test/桌面应用/version-change.test.ts | 660、661、711、885、1320 |
| test/测试/trunk-stable-write-integration.test.ts | 594（两处） |
| test/编排/stable-write-runtime.test.ts | 139、184（两处） |
| test/编排/trunk-runtime.test.ts | 91（两处）、251、264、278 |
| test/编排/trunk-service-refreeze.test.ts | 77、93 |
| test/编排/trunk-service.test.ts | 73、486、533 |
| test/编排/version-change-service-integration.test.ts | 362、391 |

多数TS18048 possibly undefined；W1022为TS2345引用不可传undefined，trunk-runtime264/278为TS2532。已报统筹，由O/W/Q原owner做规划条件消费和真实执行缺workflow拒绝，不能恢复必填/空hash或过滤undefined假绿；本人不越界。共享契约变更使相关caller旧证据失效，后继须重测生产执行拒绝与规划首建。

| R3三文件 | 原字节SHA256 |
| --- | --- |
| src/model/trunk.ts | C592E7EBF9889F42B3DF3CE1039AC3022E8ACCF8CD502C67B5B9FF749A921CF1 |
| src/model/version-change.ts | 895842738B2D7B769024FDCAB431D4EDDE2CC082FB948CF4C04965A8C0837958 |
| test/runtime-core/direct-role-capabilities.test.ts | 6AC4EE1D45B1D2A4522AD057FB77FA3D72344A838FD1B5C8C75AF5AF0951AA36 |

三文件聚合`C89F819AC54FAB8B7871DFB246BF17E5638BA4334F51C7486D096A301118A66D`；相对路径Sort-Object升序、path空格lowercase(raw SHA256)、LF连接无末尾LF，UTF8无BOM后SHA256。同一三文件稳定，不代表全组合候选。未改runtime/tools/schema/O/W/G，不应用/真实模型/commit；无独立验收结论。

## R4 实施前回执消费窄合同

统筹正式派发：仅tools.ts的request_choice/request_confirmation现有回执呈现，及direct-role-capabilities.test.ts/confirmation-paths.test.ts与本人api/change/memo。消费既有actionSource真实chief-delegated，显示选择/拒绝/要求修订与原理由；修订非批准且不标任务取消。保原customer/judge/directive回执，不新增Model/schema/权限/业务开关、不看live委托状态。定向两文件与主类型；O/Q在飞caller红只记不修，不应用/模型/commit。

## R4 最终证据

makeRequestChoiceTool/makeRequestConfirmationTool现共同调用本人私有纯呈现helper chiefDelegatedInputReceipt，在旧非judge客户分流前识别既有actionSource。用Model既有source shape，不造新接口；真实chief选择/确认/拒绝/退修显式归属，原reason及完整typed outcome JSON可由原发起者读回。退修ok:false，未写任务取消/批准状态。错来源/矛盾选择不能回落客户批准；旧customer/judge/directive回执测试保持既有文案。未读当前委托开关，不重新鉴定历史已提交物证。

Node v24.22.1 / Windows PowerShell；`node --test test/runtime-core/direct-role-capabilities.test.ts test/runtime-core/confirmation-paths.test.ts` exit0，19 tests/19 pass/0 fail/0 cancelled/0 skip，duration213.7754ms。4个新增R4用例分别覆盖两工具chief拒绝/退修原理由+JSON不改、非推荐项/确认真实来源、错source/矛盾selected拒绝、旧customer/judge/directive文案。`npm run typecheck` exit1仅4条外部caller：src/pipeline/orchestration/version-change-runtime.ts(305,27)/(305,69)、test/测试/trunk-stable-write-integration.test.ts(594,23)/(594,65)，均TS18048 workflow possibly undefined；已报统筹由O/Q原owner适配，不越界。`git diff --check -- src/provider/runtime/tools.ts test/runtime-core/confirmation-paths.test.ts test/runtime-core/direct-role-capabilities.test.ts` exit0无输出。

| R4三文件身份 | 原字节SHA256 |
| --- | --- |
| src/provider/runtime/tools.ts | E42774A7788370EC6D387D13D4865E6F286CD89221CEEBB6474974F7C6F4D225 |
| test/runtime-core/confirmation-paths.test.ts | 5BD49E775D5F5A3B5A131018E9EA0867FCB2146D1D24526D01596EE42576C280 |
| test/runtime-core/direct-role-capabilities.test.ts（本节点未改） | 6AC4EE1D45B1D2A4522AD057FB77FA3D72344A838FD1B5C8C75AF5AF0951AA36 |

聚合`0F32C48F62D20CE3E5B48E2A755C5E7AAAFEF71CAAAA90776F2A97E582447762`，算法同前三轮：相对路径Sort-Object升序、path空格lowercase(raw SHA256)，LF连接无末尾LF，UTF8无BOM后SHA256。仅本三文件身份，tools中原差异保留非全部归本轮；非全候选。Model/schema/业务审批/专门执行权限均未改。真实W SessionManager与完整E2E由后继消费，未独立验收；不应用/模型/commit。

## R5 实施前最小合同

统筹正式续派，P5/C0§7同P3.1既定目标：A先在已授trunk/runtime/schema/tools区分ActiveRoleEvidence与真实run FrozenRoleEvidence，独立activeRevision/activeDigest维度、激活结果用Active；显式supersedesApplicationId严格VCA ID透传；TaskClosedEvent加可选来源/operation/event供历史兼容。O负责同锁CAS/历史/真实creator账本，工具不接host授权回执。A稳定立即交O/G。B仅既有Service/session与Provider/tools及Model必要共享句柄，实际核abort/drain/终态/活工具/owned子进程证据，unknown阻断，不能请求abort即称停稳；不新通用process服务/阶段库/私藏效应。额外Provider路径先报；测试仅本节点指定runtime-core四文件（含精确新session-lifecycle.test.ts），本人api/change/memo短追踪。无O/G/W/P源码、无应用/真实模型/commit。

## R5 A/B交付与真实证据

A规范字段与B实际接口见[api R5](../../api-spec.md)。A先交O/G且三文件定向52/52；随后root明确team-plan枚举同合同追加已落。B实际代码在原Model runtime、Service session、Provider tools，未扩写common或三引擎Provider。O/W须将真正创建的Service sessionId/turn按run登记、先核目标可执行前提再封新派发/停旧；缺handle/跨重启不得拿空表补造停稳。当前未可证的Windows树/背景树/原生Adapter进程范围明确unknown，不能作为stop/restart放行证据。

Node v24.22.1 / Windows PowerShell，候选同HEAD加全部旧/并行变更。最终正常环境精确命令：`node --test test/runtime-core/direct-role-capabilities.test.ts test/runtime-core/submit-capability-tools.test.ts test/runtime-core/directive-contract.test.ts test/runtime-core/session-lifecycle.test.ts`，自然exit0，58 tests/58 pass/0 fail/0 cancelled/0 skip，11430.4909ms。未使用force-exit。新的6个生命周期场景：abort已请求但provider未真实结束/settled拒成功；晚到真实结束后无活工作才quiescent；stream/Core synthetic终态/已dispose空表拒代真物证；raceAbort早返不隐去底层Fn；owned同步Node child真实close与树unknown；owned后台Node child真实stop与树unknown；native无自有进程覆盖拒成功（前两观察在同场景）。仅controlled Provider与本Node子树，无应用或模型。

### 受限首轮原始失败保留

相同`node --test test/runtime-core/session-lifecycle.test.ts`首先在受限环境执行。输出先为前三场景通过，然后同步/后台两owned child断言失败；runner因尚存夹具子进程未自然退。受限只读定位报`Get-CimInstance: 无法从客户端中访问 CIM 资源。`。按已给正常环境权限，只读核测试脚本命令/父子：runner4124→worker8692，其直接child15308和22956命令均`node.exe -e setInterval(()=>{},1000)`。仅Stop-Process这两个已核夹具child，未kill其他进程/未force-exit runner；原runner随后自然输出原失败并exit1：

```text
ℹ tests 6
ℹ pass 4
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 78272.4495
session-lifecycle.test.ts:96 owned synchronous child close ...
AssertionError: assert.ok(result.processes.some(process => process.kind === "shell" && process.state === "exited" && process.pid !== undefined))
session-lifecycle.test.ts:112 owned background child ...
AssertionError: assert.ok(result.processes.some(process => process.kind === "background" && process.state === "exited"))
```

此首错仍为失败，未以清理当通过。随后正常环境同精确单文件自然6/6 exit0（11453.5995ms），再最终正常组合58/58自然exit0，两次正常测试子进程由生产stop实际终止，无人工清理。正常测试仍明确断言Windows/后台treeStatus unknown，不放宽为假quiescent。

`npm run typecheck`最终exit1，仅test/测试/trunk-stable-write-integration.test.ts(594,23)/(594,65) TS18048 workflow possibly undefined，原Q消费未修，本人无诊断、不越界。中间O在飞曾见apply-journal.ts:1259收口结果缺eventId/taskStatus、public/trunk-service.ts:42缺recordTaskObservation/closeCreatedTask，原owner后续消除，未由本人修改。上述九源码/测试`git diff --check` exit0，仅trunk/submit测试CRLF提示。仅运行授权精确文件，不广回归。

| R5九文件候选身份 | 原字节SHA256 |
| --- | --- |
| src/model/trunk.ts | BDBB368E45792B96E501A2E97A67B2C986825FCBA8C2ABBF7BB1624BCEC48FC1 |
| src/model/runtime.ts | F19FBF4F214BEA340C2A0EDCF87BE05A58825B9AA72B8B596726F436D912B52B |
| src/provider/runtime/schema.ts | 0AC05CA33FE79850144CC4AC2DB2C1DEDB2F3D01769B5A37C475AEBF95F3BB64 |
| src/provider/runtime/tools.ts | 03781FA72E254E2936D87B4E5BDC0852DE811F86CBA36371CEB62C071C47B7C7 |
| src/service/runtime/session.ts | 1E8BE5AB082C6EED76A7829BA9F65FC3BD119DD313ADFED0186A683DC8628237 |
| test/runtime-core/direct-role-capabilities.test.ts | D9289FFFA9BE0BFC42265B3CFAC9789E6A547A2C94461F0A35773AF08A2EFFD4 |
| test/runtime-core/submit-capability-tools.test.ts | 1AAAE579DAED8B844F32156C73C3E478FEB4A1885B72C16418913809E4162EEB |
| test/runtime-core/directive-contract.test.ts（复用未改） | CEB2A29366C4DBCF5A35071A90BACACE70CE798CE07024623800EC1DF56D0F54 |
| test/runtime-core/session-lifecycle.test.ts（本节点新增） | 82E93A63CCA008C8519EE4A10977B6F48E045B3953D0A6ACCEE4ECD476C92586 |

聚合`025258120DBC92E12AED4E4A5FB63AFB9D1CB3E3580AC357D0144A54B2D46191`，同前各轮算法（path排序+空格+lowercase原字节hash，LF无末尾LF，UTF8无BOM后SHA256），仅此九文件非全组合候选。原旧差异保留非全部归本轮。

### 必须保留的实际缺口

现common/runtime-core/process-tree.ts的Windows taskkill返回void且不等待，降级child.kill也无树完成物证；background-tasks.ts提供primary close/stop但无整树证明且dispose清表。因此本节点只证primary child退出，整树缺证返回unknown。另provider/pi/session.ts、codex/session.ts、claude/session.ts的原RoleSession未提供其自有native进程覆盖，Service非demo会明确native-provider-process-coverage-unavailable，不能宣称三真实引擎停稳。需要原owner精确授权后继补证；本节点未以增加文件/藏common/模拟receipt越过这些缺口。Model事实不读当前业务委托开关，不新增通用process服务/第二阶段库；stop/restart整体仍待O/W实际同handle消费与上述缺证，continue/direct独立可推进。未独立验收、无应用/真实模型/commit/push。

### root要求的最小native后继矩阵（只读定点核、未改adapter）

| 原owner / 精确现源 | 已有事实与缺口 | 最小hook与无模型验证 |
| --- | --- | --- |
| Pi适配器：provider/pi/session.ts:392；common/pi-adapter/real-adapter.ts:1351/1384 | 生产facade直接返回real makeRoleSession；已有SDK abort promise/本地lifecycle，MCP sessionShutdown为best-effort并吞超时诊断，SDK dispose void；不能以finish/退出队列证明MCP子树。 | 原real-adapter提供实例ID与实际idle/严格shutdown/owned MCP终态，legacy facade透传；既有makeRoleSession、test/pi-adapter/settled-once.test.ts接缝＋受控本Node MCP child验迟关/超时，不跑模型。 |
| Claude适配器：provider/claude/session.ts:413/977/997 | closeEngine先closed/主动reject turn再query.close() void；abort只race interrupt与1s，dispose不等native进程。Service只能补prompt/tool事实，当前公开handle不能补子树事实。 | 同源接SDK真实运输关闭/owned child exit hook并暴露实例facts；SDK若不提供可观察句柄则保持unknown，不假造。test/claude-adapter/session.test.ts既有loadSdk/query接缝验迟关/未关/活工具，实际关闭证明另由owner最窄核，不调用真实模型。 |
| Codex适配器：provider/codex/session.ts:167/274/882；common/codex-adapter/protocol.ts；Chat分支common/codex-adapter/chat-transport.ts:294 | app-server已有spawn child与close等待Windows taskkill成功、exit/stdio或POSIX组消失，确有可复用事实；但RoleSession abort只interrupt且未暴露engine生命周期。Chat已有abort await settled且不启动app-server，可分支证明无此进程。 | 从现engine close状态/子进程事实提供hook，经protocol普通DTO交RoleSession实例facts；Chat独立露实际idle/工具清零/无app-server事实。test/codex-adapter/session.test.ts engineFactory与fixtures/native-cli.mjs真实本Node夹具验证close/interrupt迟报，无模型。 |

上述是后续范围决定输入，不是已完成三引擎停稳。Service不按引擎名字/void abort或dispose合成证明；未授权adapter/common源均未写。Windows通用process-tree/background无树物证仍unknown/blocked。A/O和first-layer脚本/规划/激活可并行，不让这份矩阵暂停全队。

## R6 实施前统一native hook合同

已确认T1.1（根SHA D2AFC929DF7D1AFD8294C50582E159449EB58C143454DF63F948615FBD2DF064）正式派R。只改runtime Model、Service/session和本人原测试/短文档，不代写三adapter、不做single/su兼容。统一RoleSession.nativeLifecycle可选窄hook：稳定native实例ID＋inspect()普通事实＋绑定实例/Core turn和时限的stopAndInspect；事实区分真实native session/turn、底层prompt、transport、owned child及unknown。Service消费同hook，保持原abort API；无hook/错实例/缺事实仍unknown，不以引擎名/closed布尔证明停止。纯Model结构检查不鉴真SDK事件；三原owner沿同签名实现并离线验证，不各造接口。

## R6短交付

统一nativeLifecycle签名/字段/三adapter消费要求见[api R6](../../api-spec.md)，已提前实际消息统筹供三原owner排；不等三引擎实现。只改已授runtime.ts/session.ts及既有session-lifecycle.test.ts，不写adapter/source/schema或single/su。

`node --test --test-name-pattern=R6 test/runtime-core/session-lifecycle.test.ts`受限环境exit0，3/3、0fail/skip，262.1986ms（只选择新增统一hook消费用例）；另正常环境`node --test test/runtime-core/session-lifecycle.test.ts`自然exit0，9/9、0fail/cancel/skip，11524.3661ms，含原Core六项与R6三项，所有owned测试仍只本Node子树。原Core可证/unknown、native无hook未知与新增受控hook正负例分开，不把SDK fake事实当真实三引擎停止。`npm run typecheck`实际exit1，仅O在飞src/service/trunk/public/trunk-service.ts:42缺prepareExecutionRun/pinExecutionRun；无R诊断、不越界、不等其绿。三文件diff-check exit0无输出。

最终SHA256：runtime.ts `4F59362BA494C847C97DBB7A7F63FDA7E0B8DDEEA07D991D53DE113F06B169B0`；Service session.ts `483D4553A222ED162793A23305BF7B71038300E00BF2D76CCAD775E5BE40E598`；test/runtime-core/session-lifecycle.test.ts `0644F32CB172F6BA15B505A52099D50A78A8851F1BA2CCC829BB21EB778A590E`。同前算法三文件聚合`E4149E46D01C874458C6C20476585ADF4EB6B0A6C2322B67044A9DE180B9C2DA`（路径Sort-Object升序、path空格小写原hash、LF无尾LF、UTF8无BOM后SHA256）。不是全组合候选。当前三SDK仍未按hook提供全树事实，Service无物证仍unknown；无应用/模型/commit/独立验收。
