# 角色直接能力 C0-P1 合同交接

- 2026-11-05，固定项目管理；仅完成实现合同，产品代码未改、未测试、未验收。
- 触发：根P3.1/T1已确认；产品/策划提交、run择时、人事写卡和运营计划拟移除五类客户等待，保留D3及真实执行审批。
- 交付：[唯一合同 C0-P1](../design/2026-11-05_design_direct-role-capabilities-contract.md)。真实入口及调用边见§1；R/O/G/W/U稳定签名及可信来源见§2；原子提交、旧run物证及最小范围增量见§3。
- 候选HEAD `77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3`，完整路径/既存差异与释放来源以合同为准；旧plan-escalation差异保留，不计本轮成果。
- 关键前置：冻结校验尚无role-direct来源；O→G私有I/O边及完整不可变快照/旧run冻结读取必须补齐。三个遗漏精确路径已有§1覆盖，按根最新裁定由统筹记录必要细化；真公共契约/层边界/权限变化再回具体delta。长期责任不默默移交。
- 检查：只读定点源码/文档，核白名单与引用；低影响文档不写形式测试，无应用/模型/测试运行，无commit/merge/push。
- 状态：C0文档交付；实现/集成/独立验收均待后继，相关前置不阻塞不相交Model工作。

## P1续派：owner晚补短核与单键适配

- 本次核R/G各自同日change、实际Model/提示差异与C0。**owner已实施后才做本次技术短核**，此前缺P对owner提案结论的过程缺口如实保留，不倒填事前审核。
- **G1：recommend approval**，范围仅六角色提示/矩阵摘要及原能力边界。取消五卡、保留D3、真实来源/完整激活/旧run不读live、原创建者收口及委托限制与P3.1一致；纯数据无新增I/O/运行层依赖，不扩工具能力位/写区。G2尚未实施，不能把提示10/10当真实能力通过。
- **R M1：needs revision（仅一处）**：`CloseCreatedTaskInput.outcome`当前为completed/failed/cancelled，而`task-state.ts:123`、`session.ts:594–597`既有收口为accepted/rework/rejected。执行结果不能直接冒充收口判断；请原owner最窄对齐既有枚举并同步本人测试/api，再回签名。其余来源联合、强制operation/base/hash的DirectSubmit输入、整套冻结字节/物证Model、五窄Fn及有界真实chief上下文建议采用；Model无I/O、不产生授权，宿主仍须实际鉴真与CAS。
- R当前project-state精确联合/原directive-contract修正由原owner负责；据统筹R最新定向27/27，主类型仅余U freezeReason穷尽映射缺新reason，不沿用G历史四诊断为当前事实；本角色没有重跑R/G测试或全类型检查。收口枚举修正前仅此项需修改，其余可供O/G准备，不扩设计。
- C0补记根分层裁定（O Provider持久化、G校验、原范围修边不移owner/不增Provider源/服务），以及chief主回合等待worker时，独立真实chief有界决策不得反等同一忙回合；W/Q须真实等待场景验证。
- 生产增量仅`src/common/shared/i18n/messages/zh-CN.ts`/`en-US.ts`新增`ui.freeze.reason.roleDirectApplied`：`角色直接提交生效` / `Applied by direct role submission`。保留旧键，不改U映射；交U按实际reason消费。
- 原测试只新增该键的清单/逐字断言，按真实+1调全局1906（ui1207/main634/shared62/preferences3）、C3家族101（freeze18）。parity/英文零Han/占位符/精确文案断言保持。该文案测试验证来源措辞，不证明生产提交。

环境：Windows PowerShell，Node v24.22.1/npm11.19.1；候选HEAD不变，含他owner并行增量。2026-11-05T14:44:51.9676801+08:00采时间后执行下列定向命令；最终结果后时间2026-11-05T14:45:13.5017375+08:00。无应用/模型、无commit/merge/push。

命令：`node --test 'test/项目管理/shared/i18n.test.ts'`。首轮exit1，保留失败：

```text
tests 13 / pass 12 / fail 1 / cancelled 0 / skipped 0 / todo 0
主干/冻结与版本变更 C3 冻结：100 key ...
AssertionError [ERR_ASSERTION]: 101 !== 100
test/项目管理/shared/i18n.test.ts:952:10
```

原因：本轮加键后漏同步既有C3家族计数；按实际101/freeze18精确更新，未删除或放松断言。最终同命令exit0原始结果：

```text
✔ locale：SUPPORTED_LOCALES 只有 zh-CN/en-US，默认 zh-CN (0.8929ms)
✔ key 分区计数：ui 1207 / main 634 / shared 62 / preferences 3，总计 1906 (0.5242ms)
✔ 下载申请 key 契约：37 key 中英成对、家族计数、精确文案/占位符一致、英文零 Han (1.146ms)
✔ 验收回交卡 key 契约：14 key 中英成对、精确文案与占位符一致 (0.3038ms)
✔ 全局任务状态/版本决策 key 契约：98 key 中英成对、分组数量、占位符一致 (0.4018ms)
✔ 客户指令 key 契约：104 key 中英成对、家族计数、占位符一致、en-US 零 Han (0.5185ms)
✔ 全局任务状态复用既有 key：run 状态/通用短词/任务中心计数不新建别名 (0.3423ms)
✔ key parity：zh-CN 与 en-US 全集一致（顺序无关） (1.2073ms)
✔ 英文泄漏计数：en-US 所有模板值零 Han 字符 (0.7823ms)
✔ 旧治理 key 零命中：flow/triage/gate/ledger/acceptance/liaison (0.6761ms)
✔ 关键 key 清单：B0 与 D 保留能力 key 全部存在且中英成对 (0.1001ms)
✔ shell 升级 key 契约：§7.3 清单中英成对且回执保留兜底子串 (0.0879ms)
✔ 主干/冻结与版本变更 C3 冻结：101 key 中英成对、家族计数、精确文案/占位符一致、en-US 零 Han (1.213ms)
tests 13 / suites 0 / pass 13 / fail 0 / cancelled 0 / skipped 0 / todo 0
duration_ms 102.4719
```

最终原字节SHA256：zh-CN `4176075AF2410FC0826AA95327A4881EC5EE5538FAC0782AEDEA49334D2577B2`；en-US `EBF156E0EA463AD66E3E860A718C30E07311074FB498AF5F7B0F1D89260F76AD`；i18n.test `9C0E32BB6AF0471D440484C39B9B080A0F90BE3E58922F74D680556C5B877BF2`。旧plan-escalation差异继续保留，不算本轮新增。

## P2：同对象批量短核（仅文档）

- **O S1：recommend approval**。已核本人22行提案和现有TrunkStore落点；prepare/readSnapshot/CAS、完整当前trunk全部refs及新目标字节闭包、manifest唯一可见点、前后恢复、重放/no-op/旧pin缺物证拒绝符合C0/P3.1。Provider仅存储、Service作业务校验，O/G原范围修私有I/O边不移owner/不增Provider源。兼容旧替身的可选能力不得使直接提交降级，直接Service缺能力须fail-closed。此为实施前提案审核，尚未审查未写出的实现或证明故障恢复。
- **R M1：recommend approval**。定点核`runtime.ts:1861`现为`outcome:TaskClosedOutcome`，实际枚举accepted/rework/rejected；本人测试含cancelled的`@ts-expect-error`负例、change/api说明同步，P1唯一needs revision关闭。R报告27/27及主TS仅U映射缺项为owner证据，本上下文未代跑。
- **U单映射：recommend approval**。已核本人12行提案和`FREEZE_REASON_KEYS`真实缺口；增加role-direct-applied→既有中英roleDirectApplied键，保留穷尽Record/旧映射/兜底、不cast，复用既有view测试及双TS，符合C0且不需新形式测试。当前尚未实施，不冒称类型已绿。
- 审结适用范围一次冻结在C0 §5：后继同对象R五Fn/schema/tools（严格参数/可信角色/注入才注册）、O1沿同Service公开签名、U等待W权威revision后消费既有IPC，W遵C0普通身份/收口/chief接线可复用；无新实质分歧不再每小节点重述审核。未知具体owner技术设计不假定已评估，出现新接口/来源/层边界/权限差异才最小再核。
- 本轮只写本人C0/change/api/memo，无源码/i18n变更、无应用/模型/测试/类型运行，无commit/merge/push；先即时回统筹recommend approval供派发，再完成此记录，不以文档收尾阻塞O。

P2审核输入原字节SHA256：O change `58914694CDC85D78B6451EF669762EE181620E7EB46091BD38BB2B09B7E79D94`；U change `E34C364DC458799C0369EEB357756CADCC7BA895193C4F3A78D5F1EE6C097459`；R change `C0A03F42A092A2B3D7F6577DC8681D724E20DB85D0CF2A216C0DC11AD24EBBC1`；R runtime `14F950D5884F2453E2438F8215839E94DA063A4B82C4B3FE213DB4D87CFFD72F`。仅标识这次审核输入，不冒充全候选冻结。

## P3：规划workflow空态与冻结纯结构归一（仅差异短核）

- **recommend approval，两项无新增修订要求**。本次现时点核R本人R3记录、实际`TrunkManifest.workflow?`/`ExecutionTrunkManifest`/`hasExecutionWorkflow`及Model冻结validator、根dispatch最新同范围裁定；不倒填R3实施前已审，不重审其余产品方案。
- workflow前提函数仅检查kind/path/hash，无I/O或授权判断，规划缺失可诚实序列化；真实run/派发必须另具workflow/D3/完整卡激活/授权。`trunk-common.ts::snapshotOfManifest`本次读取仍有旧无条件workflow.path，属已派O消费修正；40条O/W/Q类型诊断由原owner处理，不退回必填或宽cast/过滤undefined假绿。后继必须补执行缺workflow真实拒绝负例，禁止造ref/默认文件/空hash/新阶段账本。
- `version-change.ts::isValidDocFreezeRecord`现为唯一纯结构出口，检查customer/application/role-direct/chief-delegated结构与reason/source绑定，不混当前开关或业务授权；历史合法chief已提交物证在关开关后仍有效。O/G导入/纯兼容出口及规划空态消费同对象普通实现复用本审结，不另占review槽；新实质契约分歧再最窄返回。
- 采用R3原证据10/10、diff检查exit0及三源测聚合`C89F819AC54FAB8B7871DFB246BF17E5638BA4334F51C7486D096A301118A66D`；40条caller类型错误在R记录逐路径保留，未声称主TS绿。本人没有代跑测试/应用/模型或修改源码/i18n，无commit；建议与行为验证/独立验收仍分开。

## P4：幕僚客户提示最小文案（已实现，仅目录）

- 固定P续派；只定点核W customer-input新chief分支及现有目录，没有重做技术审核/策划。生产只改中英目录，测试只改本人i18n既有保留键列表与真实计数；不改W/U源、allowlist、工程法案或C0。
- 保持所有历史judge keys/语义及旧keys。U唯一勾选复用`ui.judge.decisionOff`（替我决策/Decide for me）；旧decisionOn/title/toggle文案不能冒充chief来源。新增最小9键如下，无raw-code占位：

| key（main.customerInput.chief前缀） | 中文 | English |
| --- | --- | --- |
| deciding | 幕僚正在核对材料并作出决定，尚未提交结果。 | The chief is reviewing the materials and deciding. No result has been submitted yet. |
| contextUnavailable | 幕僚决策所需的上下文或证据暂不可用。可关闭“替我决策”接管，或由原发起者补齐材料后重新提交；本次未作批准。 | The context or evidence needed by the chief is unavailable. Turn off “Decide for me” to take over, or have the original requester supply the missing materials and resubmit. No approval was granted. |
| noValidDecision | 幕僚未提交有效决定，本次未作批准。可关闭“替我决策”接管，或由原发起者补齐材料后重新提交。 | The chief did not submit a valid decision. No approval was granted. Turn off “Decide for me” to take over, or have the original requester supply the missing materials and resubmit. |
| revisionRequested | 幕僚要求修订，原请求已退回，未获批准。请原发起角色补齐材料后重新提交；请求退回不代表任务取消。 | The chief requested revisions. The original request was returned without approval. The originating role must supply the missing materials and resubmit. Returning a request does not cancel its task. |
| modeChanged | 决策模式已改变，尚未提交的幕僚决定已撤销；已生效的决定不会回滚，卡片取消不代表任务取消。 | The decision mode changed. Unsubmitted chief decisions were withdrawn; decisions already applied remain in effect. Cancelling a card does not cancel its task. |
| manualTakeoverRequired | 当前请求由幕僚处理。如需亲自回答，请先关闭“替我决策”。 | The chief is handling this request. Turn off “Decide for me” before answering it yourself. |

UI新增：`ui.judge.chiefDelegated`=幕僚代决策/Chief-delegated decision；`chiefDeciding`=幕僚处理中/Chief is deciding；`chiefTakeover`=待接管/Awaiting takeover。同名UI前缀后两键亦为`ui.judge.*`。真实客户、chief-delegated与历史judge分别呈现，W/U按实际actionSource消费，不改旧judge文案冒充新来源。本节点仅提供可消费词条，不宣称主进程literal已被替换或顶部已上线。

实际命令：`node --test 'test/项目管理/shared/i18n.test.ts'`；Windows PowerShell，沿既有Node v24.22.1环境；开始2026-11-05T15:56:22.5244413+08:00，结束15:56:22.6741017+08:00。首次exit0，无本轮首红；原输出计数：

```text
key 分区计数：ui 1210 / main 640 / shared 62 / preferences 3，总计 1915
key parity：zh-CN 与 en-US 全集一致（顺序无关） pass
英文泄漏计数：en-US 所有模板值零 Han 字符 pass
关键 key 清单：B0 与 D 保留能力 key 全部存在且中英成对 pass
主干/冻结与版本变更 C3 冻结：101 key 中英成对、家族计数、精确文案/占位符一致、en-US 零 Han pass
tests 13 / suites 0 / pass 13 / fail 0 / cancelled 0 / skipped 0 / todo 0
duration_ms 105.0373
```

全部13项通过，既有parity/英文零Han/占位符/家族计数/精确文案守卫未放宽；无新增形式测试或全量运行。源码/测试原字节SHA256：zh-CN `05DD926F0189C239F17A0FEE038BFD20D03CA7590B57A8BCDD199E1091C73521`；en-US `70D6025C9A04D2202EEBF68DBEF92E2F9BDB59E4A801D7CEBB2656AFBF695E0C`；i18n.test `849BB9685124123D2469C2FECC320FE8B1277BEC725E2F6744343BFA64B92F01`。候选HEAD不变加既存/并行增量，三hash只识别本层输入；无应用/模型/commit/push。已先发键映射统筹供W/U消费，记录后释放。

## P5：唯一入口单键与三处内部合同缺口

- 已补`ui.composer.customerEntryChiefOnly`：中“向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。”；英“Send new tasks or clarifications to the chief; other role sessions are for reading and diagnostics only.”。仅两目录与本人既有测试保留键清单/真实计数+1，无U/W源改。
- `node --test test/项目管理/shared/i18n.test.ts`首次exit0，tests13/pass13/fail0/cancelled0/skipped0，105.3992ms；计数ui1211/main640/shared62/preferences3/总1916，parity/零Han/家族及原逐字断言不放宽。后按统筹允许追加只读`npm run typecheck:renderer`（tsc -p app/renderer/tsconfig.json）exit0，结果后时间2026-11-05T16:11:56.8007306+08:00；未build/运行应用模型。
- 三文件SHA256：zh `F3D5C6A9E7BC57C16CAF9BD51C246BBE961FA672498C30958AB033C18254127A`；en `D50E09282C124AD1397FBD81913CF14C7D135EAA2F7402231A89E43F745781A0`；test `F3137A4F0982AA960C6F1B17EFEC36B0AAF7A89DD5F44EE14D022491D8D1D4D8`。
- 定点三缺口及最小合同见C0 §7，已先消息O/统筹：teamplan当前只有schema＋demo正文、候选机器字段沿旧roleRows/modules/writesets/dependsOn及现权威modules/roster；ActiveRoleEvidence无run身份，真pin绑定Frozen、doc/active独立snapshot与双维度CAS；stop/restart须真实Service/Provider生命周期事实，现abort/close manifest均不够。候选字段若根判产品合同缺口，只将精确字段/兼容口径交策划；不另写研究方案或先假放行。
- 真实停稳尚无可证实现，列R三具体问题与原文件落点供交接；unknown保持blocked，continue/direct先行。无源代写/新通用服务/假receipt；O旧fresh取消卡测试按拒绝/显式direct重提修，历史真实approved/journal与独立stable/emergency约束不重写成新批准。
- 本轮源写仅i18n，技术合同仅本人四文档，不改其他owner/allowlist/法案；无应用模型/commit。未将建议当已实施或验收通过，记录后释放。
