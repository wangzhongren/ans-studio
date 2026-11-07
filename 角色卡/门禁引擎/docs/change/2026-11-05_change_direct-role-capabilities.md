# 六角色直接能力提示与冻结解析准备

## G3实际短交付

三项已实际落地，签名见本人api-spec当前首节：Service公开await Provider刷新后纯install（异常invalidate）；无run使用独立ActiveRoleEvidence自身snapshot及activeRevision/digest（不等doc快照、不造run/pin）；G freeze validator精确alias Model。G role与boundary Service分别合法调用Provider public，共享common纯选择/解析，G2的Service peer已移除。run仍严格核可信run/pin及全8refs，不live回退。

实际测试：`node --test test/门禁引擎/direct-role-capabilities.test.ts test/门禁引擎/versioned-doc-guard.test.ts`，正常执行、本人同隔离TEMP，**34计/34过/0失败/0skip，exit0**，duration_ms 988.3289；原日志`2026-11-05_direct-role-capabilities-evidence/G3-targeted-normal.log`。`npm run typecheck` **exit0、0诊断**，原日志`G3-typecheck.log`。

新增/调整正反例：通过真实Provider active CAS激活字节fixture，doc-only snapshot/CAS更新后实际重新解析active保持原卡/边界且不含run/pin，原run解析保持旧pin；撤active后无run拒绝、旧run仍可读。Provider通过确认来源冻结fixture登记R9后，G缓存仍unknown（证明Provider不上调）；await新Service后立即frozen并拒edit，破坏原R9字节后刷新corrupt、缓存unknown仍拒写。此为G/Provider层测试，fixture明确不冒充真实客户点击或完整角色生命周期；保留客户卡完整生产链由O/W/Q后继验证。Model validator同一函数引用已断言。

本短节点不改G1提示、不运行应用/模型、不commit/push。完整旧R9业务I/O迁移（含既有register/verify/baseline/refresh/append/lock旧caller改线）仍未完成；本入口不转发效应能力，不以common→Provider wrapper冒层合规。按统筹要求即交付释放后续W/native槽。

## G3短节点 Mutation Contract（实施前）

沿统筹正式续派T1/P5，普通实现细化不重做客户闸门：既有boundary Service公开`refreshAndInstallVersionedDocFreezeSnapshot(root,options?):Promise<VersionedDocFreezeSnapshot>`，真正await Provider返回普通snapshot后纯install，异常invalidate后抛，Provider不回调G。无run角色读取manifest.activeRoles/activeRevision/activeDigest及active自己的snapshot；不与文档snapshot强等、不造run/pin。有run仍核Frozen真实run/pin/八refs。纯来源校验改Model同一函数别名。去除G Service之间的读取调用，I/O各在其Service经Provider public，私有common共享纯选择/解析。

只改本续派精确G源/测试及本人api/change/memo/evidence；不新增源文件或Provider私有import。定向direct-role-capabilities/versioned-doc-guard及类型检查，补真实冻结登记→Service刷新→同进程拒覆盖，doc-only更新→active重新解析保持及缺证据拒绝；run重解析隔离保留。R9旧业务I/O完整迁移明确后继，不借本短入口宣称全迁移完成。

## G2实际checkpoint

按统筹要求短交付释放R/O1槽位：来源校验、纯三文档DTO/检查、真实Provider同8refs读取、可信context解析、冻结门禁禁live探测已实施；**不等于整个G2或R9迁移完成**。O已确认实际context/validator签名，详见本人api-spec。G role/boundary同组件共享Service读操作，只返回普通内容，不返回Provider对象；Provider不向上回调G。

实际生产改动：model/boundary.ts（已批准DTO/标识精确细化）、model/role.ts、service/role/resolve-role.ts、service/boundary/resolve-boundary.ts、service/gate/resolve-write.ts、common/门禁引擎/boundary-core.ts、common/门禁引擎/versioned-doc-guard.ts。G1治理提示未再修改；新增验证只扩本轮direct-role-capabilities.test.ts，既有另两文件仅运行。

本阶段前置：O1尚未冻结真实run的名单/计划/D3/激活/授权业务字节schema，不能由G编造；现只核M1八refs同snapshot/hash/完整bytes和真实角色三文档语义。O已新增Provider `readVersionBaselineState(root)`、`writeVersionBaselineState(root,{text,expectedSha256,initialize?,lockToken})`，但G尚未消费。旧guard仍有baseline/register/verify/refresh/append/lock I/O，本checkpoint未假称已迁移或共锁已收敛。后继G Service保业务判定/安装，Provider只字节/锁/CAS/追加，common保持纯转换；具体caller：W session/version-change、O run-role/run-manifest/shell-post-audit（及其必要govern-session接线），由原owner改线。不得common包Provider效应、不得Service向Provider再导出。

验证环境与G1同机，Node24；原始日志在本人已授权 `docs/change/2026-11-05_direct-role-capabilities-evidence/`：

| 原日志 | 实际命令/环境 | 结果 |
| --- | --- | --- |
| G2-first-restricted.log | node --test direct-role-capabilities + boundary-yaml-validation；默认受限TEMP | exit1，17计14过3失败；三例prepareSnapshot返回EPERM hardlink versions.lock，保留完整错误 |
| G2-context-normal.log | 同两文件，自动审批获准的正常执行、本人隔离TEMP | exit0，17/17，无skip |
| G2-three-normal.log | node --test test/门禁引擎/direct-role-capabilities.test.ts test/门禁引擎/boundary-yaml-validation.test.ts test/门禁引擎/versioned-doc-guard.test.ts；正常执行、本人隔离TEMP | exit0，37/37，无skip，duration_ms 962.2458 |
| G2-typecheck.log | npm run typecheck | exit0，0诊断 |

最早一次定向未给Provider失败message，亦观察14/17（工具输出保留）；随后只补错误输出，不放松断言，精确识别EPERM。一次TS中发现本人隐式any，已收窄类型后重跑0诊断。完整三文件含真实Provider准备/发布/读取：live改与删除后实际新建旧run会话重解析，仍使用旧卡/边界并拒新路径；缺/错run/pin/role/hash/授权ref/snapshot拒绝；规划trunk可发布但缺角色激活物证时启用拒绝；MD/YAML漂移、缺必填、越界与共享属主拒绝；真实role-direct/chief-delegated与历史customer来源分辨。

未运行应用/真实模型、未commit/push、未独立验收。仅此已实现阶段可供O1/W消费，其后合同/Provider行为变化使受影响证据失效，按路径补测。

## G2 Mutation Contract（续派实施前）

按已冻结M1、C0/P2与统筹正式续派，生产只改T1 G集及versioned-doc-guard.ts；model/boundary.ts两普通DTO增量已消息记录并获统筹确认。测试仅direct-role-capabilities、boundary-yaml-validation、versioned-doc-guard。G1无关提示不改。

`ProjectConfig.documentContext?:{runId?:string;pinDigest?:string;frozenRoleEvidence?:FrozenRoleEvidence}`由宿主传入；有run缺/错物证即拒绝，不回live。G Service从O Provider public读取完整同snapshot字节，私有核心做纯解析；无run查询若有效trunk存在则消费不可变快照。G边界增加frozenEvidence普通标识，门禁不再探查live边界提示。

公开 `validateRoleDocumentsSnapshot({snapshot,roles:[{roleId,cardPath,boundaryMdPath,boundaryYamlPath,allowedPaths:[{path,kind}]}]})`返回`{ok:true,roleDocumentChecks:RoleDocumentCheck[]}`或`{ok:false,message}`。DTO字段roleId/snapshotDigest/cardSha256/boundaryMdSha256/boundaryYamlSha256/ok:true。纯核完整字节hash、必填、MD/YAML同步、目录范围及唯一属主；Pipeline组合调用，O Service仅核普通结果与持久化字节，不peer调用。O已认可签名。run八ref业务来源schema尚待O1，本节点不自造D3/授权文档语义。

来源校验用M1联合，历史完成customer记录兼容只读；新来源必须真实kind/origin/reason/application/actor及snapshot绑定，不伪造customer凭据。旧guard效应迁移的实际caller/未迁API已报统筹，未授权全仓清债或私有common包Provider效应。验证包括live改变后真实重新解析旧run及缺物证反例；定向Node测试与必要TS，原始输出在本人隔离evidence目录保留。

- 固定角色：门禁引擎；日期：2026-11-05；类型：change；状态：G1提示已实施并定向自测，主类型检查未通过；G2未实施，未独立验收。提案在源码前写入，P原角色短核待统筹安排，不倒填已评审。
- 依据：根 P3.1（SHA256 `3A0650FC14298DC5A3DFAE40D2723386FDD810747692C34FFE9AFB2710C6A73C`）、T1及沟通已确认 Gate 2；候选 `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3` 加确认保留的既存差异。
- 本 G1 仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/built-in-roles-field.test.ts`、新增 `test/门禁引擎/direct-role-capabilities.test.ts`，及本轮明确许可的本人文档。不改技能、角色定义、治理闸门或其他角色文件，不提交/push。

## 实现提案

用户入口是幕僚客户入口；六角色的真实会话提示及只读矩阵摘要统一描述：产品升级/策划整单修正直接提交；策划决定运行三模式；人事经真实 D3 后直接写三文档并整套激活；运营直接完成团队计划、主动提交环境阻塞卡；幕僚/运营只收口自己创建的任务；幕僚接受真实委托，基于证据选择/拒绝/退修。保留 D3、独立质检及 shell/下载/stable 专门执行审批。

只复用已知 `submit_version_change`、`request_choice`、`submit_report` 等工具；C0 的新工具名仅是拟议名称，未注入时报告实现中/待注入，不虚构成功或回退到已取消卡。角色身份由应用取得，不接受模型自报来源；角色提示不是运行时实现证据，能力布尔位不冒充新工具注册。

调用边仅数据：Model/无状态共享文本 → 本人私有注册表 → 既有解析公开入口供消费者读取；不新增 I/O 或跨层调用。测试核正向语义、取消卡反向回归、边界/能力位不越权。定向 `node --test test/门禁引擎/built-in-roles-field.test.ts test/门禁引擎/direct-role-capabilities.test.ts` 与 `npm run typecheck`，保留真实输出及其他 owner 错误。

## G2 最小准备（本节点只读）

`versioned-doc-guard.ts::isValidDocFreezeRecord` 目前只接受 customer/application；须等 R 的真实 `DocFreezeRecord.source` 与来源签名冻结，再新增 role-direct/chief-delegated 的纯结构及 reason/origin/source 一致性校验；不可仅扩大 origin 枚举或伪造 customer decisionId。该文件及其现有 test 的修改已由统筹记录同范围必要细化，本 G1 不写。

冻结持久化由 O 既有 Provider public 承载，G 保留纯解析/角色边界校验；O Provider 不可调用 G Service，也不可继续深导入 G 私有 I/O。`FrozenRoleEvidence` 与 O 完整字节读取合同冻结后，G2 才接相同 run/pin 的角色卡、边界 md/yaml、名单/计划/D3/授权；缺物证拒绝，运行中不得回退 live。无 run 查询才读取有效 trunk。新 Provider 源文件先给精确 delta；本节点不新增。

## G1实际结果与验证

用户在幕僚客户入口收到业务卡；会话从 `governance-roles.ts` 的六个 `*_CARD_TEXT` 读取提示，矩阵从各条目 `matrix` 展示同口径摘要。以前人事被提示逐次 appointment-write、策划仍发 proposal 卡、幕僚不代决；现提示按P3.1改为直接整单提交、D3后完整激活和真实委托。`CREATED_TASK_CLOSURE` 明确报告不是关闭；`DIRECT_CAPABILITY_AVAILABILITY` 在六卡明确未注入不假报成功。布尔能力位、路径/禁写、导出签名不变；人事路径条目的用途说明更新，不扩写权。

实际生产delta仅 `src/common/门禁引擎/governance-roles.ts`（51增/25删），测试新增 `test/门禁引擎/direct-role-capabilities.test.ts`；既有 `built-in-roles-field.test.ts` 只读执行未修改。另写本人 api-spec/memo/feature-map、本记录与[当前说明](../feature/direct-role-capabilities.md)。没有修改G2文件、其他owner源码、技能或治理定义；未跑应用/真实模型、未commit/push。

环境为Windows，Node `v24.22.1`、npm `11.19.1`；末次定向输出后记录时间 `2026-11-05T14:42:43.1997803+08:00`。候选HEAD不变，包含R等owner并行增量，以下hash只标识本节点实际测试的G输入，不冒充完整候选冻结身份：

| 输入 | SHA256原字节 |
| --- | --- |
| governance-roles.ts | `C1A49864C40BE9F1EC1E3D1462022E1281D8D61AA3C0CC7B6BEA666B09F8EB4E` |
| direct-role-capabilities.test.ts | `05CE4458B8D4CA04F3FCC559B2CCAAFF70048143B7F924E385B9FDB4C44F7C5A` |
| built-in-roles-field.test.ts | `27A74181F59F9412A2D4493EDB26E46FC16CAC3CCB0E4637BEB112C9445FD02F` |

命令 `node --test 'test/门禁引擎/built-in-roles-field.test.ts' 'test/门禁引擎/direct-role-capabilities.test.ts'` 首次与最后一次均exit0；末次原始结果：

```text
✔ builtInRoles：声明 su 不改变 resolveRole 的解析结果（仍下沉为内置治理角色且不抛错） (0.5629ms)
✔ builtInRoles：未设置时行为不变——未登记角色照样下沉为内置治理角色 (0.0906ms)
✔ 六角色明确未注入能力不得虚构或恢复取消卡 (0.8746ms)
✔ 产品/策划整单直接提交，来源和旧run冻结约束可见 (0.2199ms)
✔ 策划独占三模式，旧pin与停稳失败不能绕过 (0.0907ms)
✔ 人事保留真实D3，三文档整体激活，不再逐次写卡审批 (0.1076ms)
✔ 运营直接完成计划与主动环境卡，真实恢复条件先行 (0.1146ms)
✔ chief/convener收口必须为原创建者，报告不等于关闭 (0.093ms)
✔ 真实chief委托能选非推荐项/拒绝/退修，且受revision单次结算约束 (0.1188ms)
✔ 提示变化不扩充工具布尔位、写区或派发权 (0.1402ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 152.37
```

`npm run typecheck` exit1，首次原始错误保留如下；没有为求绿修改其他owner文件。与统筹先告知的单个UI诊断相比，运行当时还观察到O/R三处新增诊断，已如实转报，不声称全TS0：

```text
> ans-cli@1.9.2 typecheck
> tsc --noEmit

app/renderer/src/chat/version-change-view.ts(354,14): error TS2741: Property '"role-direct-applied"' is missing in type 'Readonly<{ "vca-approved": "ui.freeze.reason.vcaApproved"; "version-upgrade-approved": "ui.freeze.reason.versionUpgradeApproved"; "detail-item-applied": "ui.freeze.reason.detailItemApplied"; ... 5 more ...; "intent-confirmed": "ui.freeze.reason.intentConfirmed"; }>' but required in type 'Readonly<Record<DocFreezeReason, "main.backgroundTasks.unavailable" | "main.common.recoveryPageBody" | "main.common.recoveryPageHeading" | "main.common.recoveryPageTitle" | ... 1900 more ... | "ui.workReport.unreported">>'.
src/common/编排/version-decision.ts(456,7): error TS2322: Type '"chief-delegated" | "customer" | "directive" | "judge"' is not assignable to type 'VersionDecisionDecidedBy'.
  Type '"chief-delegated"' is not assignable to type 'VersionDecisionDecidedBy'.
test/runtime-core/directive-contract.test.ts(88,27): error TS2344: Type 'false' does not satisfy the constraint 'true'.
test/runtime-core/directive-contract.test.ts(90,28): error TS2344: Type 'false' does not satisfy the constraint 'true'.
```

验证范围仅提示、只读摘要及原能力边界；不证明提交/激活/委托工具、停稳、不可变快照、CAS或跨角色调用已经接通。T3完整适用回归和独立验收由统筹后继安排。

## G13实施前短delta（2026-11-06）

沿P3.1/P7，新增resolve-boundary公开registerVersionedDocument/verifyVersionedDocuments/readVersionBaselineSha三业务方法；guard抽parse/完整文件集验证/登记计算等纯普通数据函数。Service独占O public同R9锁/fencing/原text CAS与真实scan/read，不把Provider效应塞common；不开放公共ports factory/test-only参数。旧入口保持暂未迁状态，O/W统一切caller、同步stable/currentFile/canonical/permit上调另续。Provider scan非ENOENT吞错实际差额已报，原O同已有文件修；未知扫描不冒完整TOFU。sourcebefore/hash与0delta已memo固化，当前O15无运行入口切换。

### G13第一段实际交付（2026-11-06）

沿P7原形新增G Service registerVersionedDocument/verifyVersionedDocuments/readVersionBaselineSha及两个结果类型公开；common抽原解析并新增纯完整字节校验/登记计划/查sha，不从common包装Provider。Service原O public锁内读baseline→strict:true扫描/read bytes→纯算→带原textSHA/locktoken CAS→重读确认/纯缓存安装→finally释放。保原TOFU/N+1/冻结终态，原text缺末换行时只补分隔后追加。初TOFU和migration-required不假完成迁移；只沿原ready缓存保持已证状态。无公共ports factory/test-only参数，无新src/Model/他owner写。

O strictscanner差额已原owner同原file补严格ENOTDIR，G新口实际消费；旧default兼容。G13-01指定file旧候选24/24、约1.3s，PID15232自然CLOSEexit0/signalnull，60s未触；最后仅修migration状态判据及同test负断言，G13-02四focus4/4、约0.53s，PID28140自然CLOSE0/signalnull。START/PID/CLOSE/预算/源码前后hash及原stdout均在本人direct-role-capabilities-evidence/G13-*，无skip/强过。G13-03最终主type仅O在飞test/编排/direct-role-capabilities.test.ts918/925 message on never两诊断，不代改/不等，G源测无诊断。真实Service TOFU全扫描/登记/查询/篡改/冻结/N+1/并发、ENOTDIR/marker/Provider读失败及纯登记计划→真实Provider staleCAS/lostfence拒已覆盖；没有注入遍历新Service内部每个fail分支，未冒此覆盖。

before→after SHA256：resolve-boundary CD6CD644515A98EF9191178647B28F31FCAB903EE87233D229B7FD2489244B03→EEA19B3BBEFC5B3AAA04A40AC85F3E29DCC7E41BCEE78377D8ACA4EA8CE3AB27；guard05C86625425E4D328C88269C2C31A3E0143641E0CD245F7FD811F0F7795432D9→93CEC0633FA25584295DF4A8AD80873A027CD77B377623230433BAA1A2DA4877；原test F3313B1343890E0B3D8BCBE99769EE3FC34A143772F1CE32D3FBC9F98704B05D→F3BC194DCDACD2B6BB9D87437784BDF732A06973C0E2179EAC5D2B221925EB66。

旧common effect入口刻意暂留待原O/W caller统一迁，不把新口当已全切；同步stable read/currentFile/canonical、Provider permit上调G、旧锁/FS删除等第二段仍未完成。G11 policy/Active/Frozen语义未改，无模型/SDK/网络/app生产/devGit/远端。源稳定释放后继。

## G15实施前最小delta（2026-11-06）

沿P8/G14同范围新增resolveWriteReadPreflight/resolveWriteFinal纯路径入口及stableWriteDecisionFromFacts普通currentFile入口；旧resolveWrite/stableWriteDecision legacy effect暂保，R/O后继统一切后必须删除旧效应，不报全迁完。O先R私有身份inspect再交普通DTO，G不peer-call；无新Model/源路径/公共ports factory。新pure绝不realResolve/reload/文件读取。canonical真实双root/target/完整保护根coverage+basis/reasons，unknown拒；同immutable边界/task，旧pin不取currentRoleCache。scope缺席与真实无task的最小口径已报统筹待澄清，不推定unmanaged。

### G15实际交付（2026-11-06）

现有resolve-write公开resolveWriteReadPreflight/resolveWriteFinal及stableWriteDecisionFromFacts/types，完整实际TS已直发原R/O并抄统筹。canonical字段按G15 coverage/basisDigest/reasons；新managed缺scope拒，已按统筹澄清取消scopeMode/role豁免。ordinaryfacts由O先Rinspect后传G，不G peerCall。新纯函数不readFile/realResolve/reload，否定路径用G普通结果而不调O私有formatter；最终stable许可仍独立纯判定由O组合原真实前置。原resolveWrite与stableWriteDecision保明确legacy effect，旧caller未切，不冒IO已迁完，R真实末hash/BOM/canonical/nlink/rename防护未削。

指定两test G15-01-tests.txt：47/47，无skip/forcepass，PID5716自然CLOSEexit0/signalnull，约7.76s、60s未触；G15-02-typecheck.txt主type0，PID28496自然CLOSE0/signalnull。wrapper START/PID/CLOSE/预算/源测beforeafterhash保原。内容含未接受/缺scope/越界/敏感读取拒、错阶段/binding、canonical双root/escape/保护根unknown/缺证、同旧pinboundary不替currentcache、preflight不当write、final明确currentFile与contentSHA、许可snapshot/base/role/TTL/BOM字节，以及真实FS mock计数新纯入口零FS；原Active/Frozen/基线回归保。普通fixture不冒R私有ctx或整生产阶段已通。

before→after SHA256：resolve-write BCC2AEEE341E7BAD34749F446773BD20A75F70A05F95FF8C9BE725988E45943F→48621BC66B59E399B3866A00D0D73686F03428D6D1C9618F40EACF77A2AFE94B；guard93CEC0633FA25584295DF4A8AD80873A027CD77B377623230433BAA1A2DA4877→F05A22E8A03832EC3F119C4F5047B3B1013C27AB5CA8F961916067BE37E25BB6；direct test DE7F4B5193ECFE5ACD5187A4FE79F539B123181D1F89AE44ACDF494C2876BF25→5F2BBE0008A0BB06620B4D583CF2DCCB82BC54BEF50D1CCF19AA36ED614CB837；baseline test F3BC194DCDACD2B6BB9D87437784BDF732A06973C0E2179EAC5D2B221925EB66→3B64D12CABC251AAE58B4EB4F7057B5D177002B8BF585C2289DD53FE17AEE652。

后继精确未清：O run-role的旧registerVersionedDocAfterWrite及run-manifest append/refresh、shell-post-audit baselineShaFor，W session旧register/verify需原Pipeline换G13口；O fs-version-change-store默认permit安装上调/stableService调用仍未迁；R Model/runtime/tools/schema/Service发行inspect、O每阶段同scope输入与final组合尚待实施。仅记录，不跨写。本节点无新src/Model/边界/权限/portsfactory，无真实模型/App/devGit/远端；稳定释放R20。
