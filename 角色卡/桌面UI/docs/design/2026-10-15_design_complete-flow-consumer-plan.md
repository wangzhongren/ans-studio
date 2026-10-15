---
id: desktop-complete-flow-consumer-plan
type: design
title: UXv2的A工具核对 B文档阅读 C成果来源消费总方案
created: "2026-10-15"
updated: "2026-10-15"
status: draft
revision: 3
---

# 核对执行与成果，失败恢复不重新发任务

这是桌面UI的**唯一消费实施方案候选**，对应客户已确认的[UXv2](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)，取代前阶段[UI只读评估](2026-10-15_design_complete-flow-ui-assessment.md)作为下一次实施的UI设计入口。用户本轮确认的是UX方向及准备具体接口方案，**未授权本新合同的生产实现**。本文仅新增自身设计，不改产品/测试/配置、不操作桌面、不运行未来API。

公共类型不在UI重写：A唯一来源为[Core A/r4](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)，C为[Core C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)及[编排消费r2](../../../编排/docs/design/2026-10-15_design_report-provenance-consumer-c.md)，B为[Window B/r2](../../../桌面窗口/docs/design/2026-10-15_design_restricted-document-read.md)；[Window A/C r3](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-ac-consumers.md)已完成persistfalse兼容、唯一enqueue与保存/查询接口修订，仍待具体实施批准。**本r3已完整读取并对齐Core A4、C2、Window B2/AC3及编排r2；A3 source/profile/required部分保持，A4只补legacy桥。本文下述最终回签取代前版接口阻点，后续公共合同实质变化仍须修订本方案。** 不把待定项当现有API，也不在UI复制净化/持久化/文档权限私有逻辑。

## A：一次真实调用的诊断阅读

Window应在既有live envelope与ReplayRow.activity透传公开ToolDisplayV1；UI仅消费版本1，身份沿项目/role/runtime/顶层actualturn/toolCallId，三个phase start/blocked/result独立，不靠正文配对。普通工具有完整身份时合为一次调用的可展开记录；没有身份的旧行继续“N条活动”，不说“N次调用”。同文不同call/turn保持不同记录；special工具与原请求卡仍为一份生命周期，不改变答复/失败/失效。

| 实际公开字段 | 首屏与展开行为 | 缺失或限制 |
| --- | --- | --- |
| display.target.kind/value | path或实际获审command为主目标；点击展开可读完整**展示投影** | 无字段写目标未保存，不从summary/邻近助手反解命令，不重新拼argv |
| display.error、detail.errorCode、ok/status/phase | 显示真实失败原因/代码；blocked不等于已执行，未返回不写成功 | stderr非空不等于error；未知不补exit0/ENOENT |
| display.resultText | 默认收起的结果文字，用文本/安全呈现 | 不是任意SDK对象，不取raw detail.result/message兜底绕保护 |
| display.process.exitCode/signal/stdout/stderr | 分开显示已知退出事实与两流，只有用户展开才物化大文本 | 未启动/未记录不补值；signal退出不补数字 |
| display.durationMs、事件真实at | 短时间便于扫读，完整时间及duration可得 | 无at不造时间；时间不是身份 |
| DisplayTextV1.truncated/redacted、display.omissions | 字段旁分别标“展示已截断/已净化”；budget/unsupported-input/unsupported-content说明不同 | 空text+truncated不是未保存，源已丢弃也不能说完整 |

A/r4推荐target4KiB、result/stdout/stderr各16KiB、error4KiB、summary1KiB、display JSON56KiB/事件64KiB，全部脱敏后UTF-8与JSON预算；这些属于Core具体待批准政策，**UI只消费最终标志，不再以另一套字符计数裁剪/重做脱敏**。长内容仅在本字段容器横滚/换行，不让整窗溢出；大批记录沿原窗口化与惰性构造，不一次把全部输出放DOM。

unknown display.version不读其内部字段，保留公共读取入口已保护的短summary并写“不支持此详情版本”。legacy无display只显示实际已保留/经公共入口投影的字段及“历史未保存”；不能直接读旧native或调用私有投影器。Core投影诊断 `{source:'tool-display-diagnostic',code:'IDENTITY_TOO_LARGE'}`及CALL_CONTEXT_UNATTRIBUTED等无可信关联诊断 只是一条无法关联的展示诊断，不变成denied、工具完成、报告或任务失败。净化保护已知值和明确格式，不标“所有输出无秘密”，不提供“查看未净化原文”旁路。

起始记录到达先显示start，后续同身份更新原调用DOM/阶段，避免新行及重复计数；失败不能被重复成功降级。原展开状态、卡决定、上下文隔离和读者锚点保持。原生工具失败正文此前默认禁铺开，现在只允许用户展开**经过A公共安全投影**的字段，不能删除旧禁止raw stdout断言就放开任意对象。

## B：只读文档抽屉与请求生命周期

UI消费Window新增listing.documentScope `version/projectViewId/projectRoot` 与RoleView.documents中ProjectDocumentRef的 `version/projectViewId/documentId/roleId/relativePath/label/format`。它们由可信原生导入grant及主进程registry签发；renderer不生成ID，不把listProject任意路径成功当授权，不从evidence/Markdown链接/路径句子造引用。已有docs.kind区分目录，文件才计可阅读项；无B scope仍可看原角色资料，但文档按钮说明需重新原生选择，不能伪称已授权读取。

唯一调用为 `desktop.readProjectDocument({version:1,projectViewId,documentId})`，不附root/path/role/URL。结果成功消费对应epoch/ID、roleId/relativePath/format/text/byteLength；role/路径仅用于当前引用匹配，不反向赋权。B为UTF-8 md/txt至多262144原始字节（含BOM），超限为TOO_LARGE，不静默截断全文。UI不复现realpath/扩展名/大小政策；B unsupported平台/文件系统不尝试绕道openExternal(file:)。

阅读状态为idle→loading→content或error。每次打开文档保存scope/role/runtime、原invoker、原drawer页面及阅读位置、chat阅读锚点，增加**本地请求序号**。关闭、返回资料、切项目/role/runtime、另开文档均令旧序号失效；成功/失败都只有序号、epoch、documentId及上下文仍匹配才呈现。当前B没有取消IPC，UI取消是停止接受旧结果，不谎称已中断OS读取；主进程仍负责scope撤销与句柄关闭。loading只禁本请求重复动作，不禁消息/停止/真实pending决定，不清草稿。

错误完整消费B枚举：INVALID_REQUEST、PROJECT_NOT_GRANTED、PROJECT_NOT_ACTIVE、STALE_SCOPE、UNKNOWN_DOCUMENT、NOT_LISTED、OUTSIDE_PROJECT、SYMLINK_NOT_ALLOWED、NOT_FOUND、NOT_FILE、UNSUPPORTED_FORMAT、INVALID_UTF8、BINARY_CONTENT、TOO_LARGE、PERMISSION_DENIED、CHANGED_DURING_READ、UNSUPPORTED_ENVIRONMENT、IO_ERROR。展示固定安全原因和返回动作，不附Node原始异常。只有当前引用仍有效且错误允许再查时显式重试读取；grant/scope失效引导重新原生选择，撤销/未列/不支持不自动重试风暴。未知错误码按无法读取处理，不能当空成功。失败保留原卡、路径、来源与阅读入口。

正文复用360px非模态抽屉：静态Markdown沿现html:false安全renderer，txt用textContent，代码只作文本；不执行HTML/脚本/iframe，不自动加载图片/远程资源；file/javascript/data不可触发，http/https仅用户动作经原openExternal。相对Markdown链接只有明确匹配当前已发documentRef才可显式导航，不能递归任意读。资料进入有返回资料并恢复展开/滚动；报告进入关闭回实际阅读按钮，若已离窗则按可信原行身份定位/稳定备选，不按正文找同名路径。B正文不进诊断、模型prompt、浏览器持久存储；只读不授写权，文件包含用户手写秘密也不能宣传全面净化。

## C：报告声明、投递事实与仅保存恢复

UI不构造inputProvenance或报告正文给发送API。消费公开RuntimeReportSnapshotV1的 `version/reportId/source.{roleId,runtime,turnId}/taskId/origin/status/summary/evidence/evidenceOmitted/at`；DisplayText沿A类型但**C独立预算**。target的inputProvenance由可信Window→Pipeline验证生成，含 `deliveryId/attemptId/target/reports`；目标actualturn来自Core，不用源turn替代。reportId为成员身份、deliveryId为固定批次、attemptId为一次发送尝试，不能用时间/正文/taskId相互替代。

origin=submitted-report显示“报告声明：…”；terminal-fallback显示“系统按终态记录：…”而不叫模型主动报告。status completed/blocked/unreported/failed/aborted逐项如实，全部不是独立验收通过。taskId=null标关联未知；本批N份只说本批，不声称全部收齐。evidence仍是证据文字，evidenceOmitted明确省略数量；summary/evidence的redacted/truncated分别呈现。C/r2待批准预算为summary16KiB、最多32条evidence且各2KiB、snapshot JSON96KiB、目标provenance最多256成员/1MiB；UI不拆批、丢成员或截身份回避PROVENANCE_TOO_LARGE。

源报告卡按scope+reportId登记，目标批次按scope+deliveryId，attempt状态另按attemptId；同ID保存/投递更新修改原卡及小状态，不再创建一份handback或重新展开、移走阅读锚点。同ID内容冲突仅显示CONFLICT，不覆盖冻结正文。submitted候选工具回执accepted-memory只说明候选已收到、最终保存/投递待收口，不能抢先给最终成果或su已收标签。旧无typed报告的交接只显示经过公共保护的原始交接内容和来源限制，不按[回交]/completed/标题解析成snapshot，不伪造taskId、reportId或报告文件可读授权。

| 权威状态 | UI文案/动作 | 禁止动作 |
| --- | --- | --- |
| 源enabled且saved/already-saved | 报告历史已保存；后续队列/接收事实分开更新 | 不把saved称为已验收或已投su |
| 源enabled的PERSIST_FAILED且有安全冻结snapshot/重试能力 | 执行已结束，报告待保存；“重试保存报告” | 不重prompt源、重工具、重派发或重算报告正文 |
| 源disabled或旧adapter unknown-live | 仅本次会话、报告未持久保存，**保留原live自动回交** | 不新增阻投，不暗建目录，不伪称saved/重开可恢复；不能把真实enabled失败降级逃过保存 |
| target disabled | 原live投递，history=disabled | 不伪造磁盘boundary或跨重启幂等 |
| ACK/turn-created或input-saved | 分别显示轮次创建/输入保存与尚未获处理事实 | ACK不证明Provider开始或投递完成 |
| providerMayHaveStarted=true/receipt未知/partial日志 | 已处理或可能处理、历史状态按事实；仅支持的补保存入口可用 | 不因报错自动再次发送；UI不从缺settled推未执行 |
| target历史failed且Core有可幂等捕获内容 | “重试保存历史”，同attempt状态更新 | 不叫“重新投递”，补保存完成也不暗发新attempt |
| SNAPSHOT_EXPIRED/expired/UNSUPPORTED/invalid/conflict | 快照已失效/当前不支持/冲突，说明限制，撤下重试能力 | 不从旧文字重建快照、不开模型补报告、不自动覆盖 |

Window AC3已纠正r1不兼容提议，本r3回签：persistfalse/unknown-live不能从原live自动回交改成不投递。源enabled失败阻止durable自动投递、可能启动后禁止自动重prompt属于新C具体失败合同，仍需公共r2/客户具体确认；不把它扩大到普通message/dispatch，也不把报告待保存/投递受阻伪装成busy或普通排队。

保存恢复候选由编排提出：UI只把现有scope+reportId交Window `retryReportSave`，或scope+target/attemptId交 `retryDeliveryHistorySave`，**不传summary/evidence/持久布尔值**。按钮仅权威failed且retryAvailable为真显示；一次在途禁重复点击，服务端仍须按ID复用Promise/幂等。成功、失败、迟到、expired皆按当前scope/ID/本地请求序号更新原卡；状态通知与按钮返回重排时不得把saved倒退pending，未知进度不自推完成。handle关闭/项目切换后旧动作不影响新卡，pending内存丢失限制明确可见。

Core r2已明确真实RoleSession.persistence是闭包只读能力，mode=enabled/disabled；缺能力为unknown-live，不以输入布尔、runtime名字或目录猜。Pipeline/Governance代理persistenceMode与同名方法，UI只消费Window给出的结果/可用性，不持有Core能力或自行补建会话。源ReportSaveResultV1成功为saved/already-saved且retryAvailable:false；失败state为failed/disabled/expired/unsupported，code为PERSIST_FAILED/CONFLICT/INVALID/PERSISTENCE_DISABLED/SNAPSHOT_EXPIRED/UNSUPPORTED，reportId/snapshot可缺席，缺ID不得画保存按钮。Pipeline reportPersistence.state还可为unknown-live，旧key仅live关联，不伪造reportId。

目标DeliverySaveResultV1成功含receipt，失败含failed/expired/unsupported/disabled、code、可选receipt与retryAvailable；RuntimeDeliveryReceiptV1的version、deliveryId/attemptId、可选turnId、inputSaved、providerMayHaveStarted、history、outcome、retryHistoryAvailable/retryDeliveryAllowed分别消费。INVALID/PROVENANCE_TOO_LARGE/REPLAY_DAMAGED/REPLAY_CHANGED/PERSIST_FAILED/ATTEMPT_ALREADY_STARTED/SNAPSHOT_EXPIRED/UNSUPPORTED按机器码显示安全说明，不从message猜是否执行。query known只更新同attempt，expired/unsupported撤下旧动作；get和订阅不发写/模型请求。progress是观察，不足以盖过最终receipt/RuntimeDeliveryError。UI不按阶段数字自行倒退/前进，乱序通知须由Window同权威状态源提供当前结果，迟到未知查询不造成功。

Core r2保留材料上限每bound session16MiB、成功详细receipt最多128、无时间TTL；FIFO淘汰非在途材料时expired通知会使原卡按钮失效，不能重新提交旧正文。seenAttemptId保留用来防重入，详细receipt过期不等于允许再次发送。UI不自己按时间过期，也不持有持久化恢复材料。仅完整可解析且base/已写前缀吻合、无后续/外来写入的缺失尾段或index可补；partial/REPLAY_DAMAGED/REPLAY_CHANGED无可补能力，文案为历史不可自动恢复，不提供“修复文件”或prompt替代。dispose/handle替换/关项目失效允许原在途保存完成但不再投递，旧通知不能更新新scope。

Core r2的RuntimeLiveHandbackPresentationV1.kind=handback-live、durability=memory-only/unknown-live来自实际上游对象，其reports不带reportId或saved声明；若收到可在当前live输入展示摘要与限制，不升级为durable。inputPresentation只live，重开history只能显示受保护原始交接，不能用本地缓存伪复原typed报告。enabled源saved送disabled目标也不承诺目标重开可恢复。公共读取reports/reportErrors及内部delivery-boundary属于报告/状态事实，不作为助手答复；未知版本/损坏文件只列读取错误，不升级成果或自动补发。

上述retry/query IPC与两类存储状态事件已由Window AC3冻结，见本文最终接口回签表；UI引用其外层scope与Core对应union，不另立schema。不能用现sendSession或重新生成工具调用冒充保存重试。B的重试读取与C的两类补保存是三个不同动作，各自状态/权限/ID不混同。

## P5–P7：当前状态、实际回焦与独立待处理

P5在会话头现次级区域按当前root/role/runtime显示尚未开启/正在开启恢复/已恢复/新会话/恢复失败，来源仅实际OpenResult/resumed/contextSource/contextWarning。hadHistory用实际replay/实质转录事实排除loading/纯状态行，不再以chat-empty是否存在推断；空新会话不说“以上为历史”。既有真实恢复/重开/失败记录保留可溯源，不按同文删除。固定状态减少新状态堆到对话尾，但现API不足以精准去重所有生命周期，本版不新增sessionInstanceId，不把nativeSessionId/profileRevision当新handle身份，不抹尾LF规范化导致的真实dispose/open。若需求仍要求完整生命周期审计须另冻结公共事实，不声称已具备。

P6保存实际invoker DOM与上下文，关闭优先回仍connected/可见/可用的原入口；主条保存后消失回稳定设置图标，项目改变不得抢回旧按钮。资料/主条/右上设置三入口、报告/资料文档返回各自维护来源。非模态抽屉不锁Tab，不把关闭或隐藏当授权决定。设置保存不清消息草稿，不推进已有聊天/运行/pending状态；建议输入只在空草稿填，非空仅聚焦。

P7资料顶部单列未决请求，按request.kind=choice显示待选择、confirm显示待确认，原题及可信任务关联可显示，未知不补。用requestId定位原卡/原turn/call，不把choice叫写许可；同标题新request独立。pending数量不进queue/running深度，两者可各自为空/并存。定位沿原关闭抽屉/物化原卡/聚焦卡容器/下一Tab到选项，普通开合不抢聊天位置。无权威默认值不预选，radio箭头只改选、提交才答复；取消/过期/拒绝依既有回包，不改权限。

## 精确UI写集与依赖顺序

仅拟以下owned源文件，不加公共schema/私有导入或Node能力：

| 文件 | 必要责任 |
| --- | --- |
| app/renderer/index.html | 现会话头上下文区、同一抽屉阅读/错误/返回骨架 |
| app/renderer/styles.css | UXv2诊断层级/短时间/字段详情、只读文档、pending分区及双宽可达 |
| app/renderer/renderer.js | 原可信身份登记上增调用聚合/详情、B请求版本与返回位置、C同ID状态更新/保存按钮、P5事实与P6/P7接线 |
| app/renderer/tool-rows.js | 消费公开display的纯展示字段及阶段；不投影raw输出或重做脱敏 |
| app/renderer/runtime-ui.js | 公共版本/来源/持久状态的纯标签与可信ID分区，unknown显式降级 |
| app/renderer/role-status.js | 既有状态派生不变，仅基于真实pending kind的标签与上下文表述需要的纯映射 |

不新增helper/依赖为前提；若实现复杂度要求拆私有组件，先以精确文件名修订本写集而非随意扩目录。engine-selector组件/IME发送合同、Core/Pi/Codex/Claude/Window/编排源与Model均只读。

精确owned测试：`test/桌面应用/tool-rows.test.ts`（display字段/未知版本/三phase/失败）、`runtime-ui.test.ts`（来源/持久状态/空历史/ID与错误映射）、`renderer.test.ts`（受限接口消费/无raw/fs旁路/原守卫）、`markdown.test.ts`（文档静态XSS/图片/危险及相对链接）、`e2e/uiux-v2.mjs`（实际renderer/preload受控A/B/C、焦点、pending、回放/虚拟阅读）。不写他角色测试，不以字符串镜像代替行为。自身本设计、api-spec、feature/runtime-choice及最终证据记录更新；未创建未来测试。

依赖依次：Core A/C r2公开类型/投影/真实持久能力+receipt/retry经评审冻结→编排最终报告保存/原文保持/公开恢复代理→各真实适配器A事实接线与保护→Window A/C历史/动作及B受限reader→UI消费与实际renderer→独立真实桌面。B新增跨层文件/唯一主属须Governance和客户边界确认先完成，现Window职责不能凭本UI方案扩权。普通布局/原型显示不代表这些依赖已实现。公共r2任何实质变化先修订本方案及consumer评审，再申请实施。

## 验收矩阵与明确未决项

未来自有命令为 `node --test test/桌面应用/{tool-rows,runtime-ui,renderer,markdown}.test.ts`、`npm run typecheck`；实际renderer复用e2e隔离模式新增A/B/C/P5–7场景，并重跑DUP32/MERGE12/完整UI98/项目状态7/selector25/config20及IME保护（必要时运行既有IME夹具，不修改其测试）。新字节须新结果，旧数字只是保护集合，不提前签通过。

必验A每个真实工具、四适配器相同字段、短时间全文、start/blocked/result、缺/未知display/截断净化标志、IDENTITY_TOO_LARGE无业务结论、已净化旧历史且不读rawnative；B所有已冻结错误、scope撤销/关闭/跨role-runtime-文档迟到、静态md危险链接、原文完整/返回位置/草稿保持；C submitted/fallback/所有终态、同ID保存状态更新、accepted-memory、disabled/unknown-live原live行为、enabled失败后仅补存、expired/冲突/乱序/单次在途、target Provider可能启动后不重prompt、成员不扩入批次、报告文件引用不赋权。P5–7及两档/键盘/原决定DOM/图片clientACK/阅读锚点必须保持。实际Provider/工具调用数由Core/编排/Window及独立测试计数，UI卡数不能替代副作用次数。

尚待客户具体批准的项：A4预算/净化内容残余限制与legacy连续后缀、C2预算/16MiB/128回执/保守补尾及失败策略、Window五受限动作与两类仅保存UI、B Governance边界扩充/原生grant/平台及可信本地项目风险范围，以及下述“查看来源角色文档”多一步选择。公开技术合同已闭合但尚未实现；批准前不编码。P5无生命周期ID的审计边界仍诚实保留。本文没有测试、部署或安全通过声明，不以UXv2方向确认代替这些具体合同批准。


## r3最终回签：A4 legacy历史、AC3公开动作与P3入口

### A4保旧可读，不把模板推断升级成事实

接受Core A4的Model中立user-text/assistant-text/tool-record联合、纯projectRuntimeLegacyHistory与Pipeline projectRoleLegacyHistory；UI不接收raw entries或调用纯投影器。Window保留唯一旧reader/parser，把Service受保护返回映回已有ReplayRow。legacy projection-diagnostic仅展示诊断，不产生工具失败；原native callID/真实可选turn保持，缺turn不凭callID升级跨轮幂等。

接受reportedStatus及statusSource的区别：native-result/tool-details可作为其实际来源的旧状态，legacy-classifier必须标“旧文本分类”，不能声称新机器错误码/exit；target.source只认argument/tool-detail/same-call的可信旧字段。template-only命令/失败仍在受保护原text中可读，不拿来新建structured process/exit/stdout。保护后缺失字段继续未保存，不从邻近记录补。

Core A4限制为最多4096条、完整JSON1MiB的**最近连续后缀**，单条原text16KiB/entry JSON64KiB，target4KiB、reader.error4KiB/source1KiB；UI不二次挑行/补全。分别消费projection.omittedEntries（预算省掉前缀）、invalidEntries（不合法条目）、reader.skipped（原parser跳过）、truncated和各DisplayText标志；计数不能混称损坏。首屏明确“仅显示最近记录/部分内容已截断”，不声称全历史。外层projection.ok=true但reader.ok=false仍是读取失败；projection失败只安全错误，没有raw fallback。metadataOmissions的timestamp/anchor-token/oversize-identity如实降级，时间没有不造当前时间。

legacy anchor由Window唯一interactionAnchorKey产出 `legacy-anchor-v1:`+64hex，两端同步。UI只把token当不透明回放定位键，不重新hash标题、不用净化后的文本猜token；native call、响应requestId、actualturn分别保留。预算省掉request/conclusion一端时按已有保卡/决定降级策略处理，不造缺的一端或新pending，不吞两个同标题不同call，也不能为了“恢复定位”读raw标题侧车。原卡DOM/决定/失效/阅读保护需在有限后缀场景另测。

### C2最终回执与Window唯一入队

仅有效version1最终delivery-receipt条目能在新handle证明当时history/outcome；只有boundary/user、没有finalreceipt时接受known+history:pending/code:RECEIPT_UNAVAILABLE、providerMayHaveStarted:true、无outcome且两个retry能力false，显示“处理可能已开始，未取得最终历史回执”。不把boundary或邻近settled拼成saved，不把缺finalreceipt当没执行。Core最终receipt条目自己保存失败仍history:failed，后续只能已授权的补保存；重开能查询旧saved receipt也不能复活已过期材料。

Window是唯一enqueue owner：初始saved、保存Promise结果、订阅change都由Window同一同步mergeReportState先登记queued再await，且必须有原业务TaskHandback对象。UI只更新原reportId卡，不入队、不生成handback、不因为收到状态再次调用send/retry。通知先到没有卡可先按scope/ID缓存状态，随后原业务对象出现再显示；不能仅凭状态新造报告正文。disabled/legacy仍按旧key原live兼容，UI不生成durable ID。

### Window AC3五方法、外层失败和两事件

全部请求version1、当前projectRoot/roleId/runtime；报告操作加reportId，目标操作加attemptId，绝无正文/路径/持久布尔。UI用当前卡绑定的源role或目标role构造scope，不借当前聊天selectedRole替换它：

| preload方法 / IPC | 用途与value消费 |
| --- | --- |
| getSessionPersistence / session:get-persistence | 只读实际mode/reportSaveSupported/deliveryHistorySaveSupported/querySupported；入口存在不等于某ID有材料 |
| getReportSaveState / report:get-save-state | Core ReportSaveStateV1查询原reportID，不保存、不prompt |
| retryReportSave / report:retry-save | “重试保存报告”，消费ReportSaveResultV1，成功更新原卡不新成果 |
| getDeliveryReceipt / delivery:get-receipt | DeliveryReceiptQueryV1查询同attempt的最终事实，不从progress猜 |
| retryDeliveryHistorySave / delivery:retry-history-save | “重试保存历史”，消费DeliverySaveResultV1，不叫重新投递、不发新attempt |

外层PersistenceReply.ok只证明受限调用完成，**必须再读value内Core结果**；外层ok:true不能当保存成功。外层INVALID_REQUEST/PROJECT_NOT_ACTIVE/SESSION_NOT_AVAILABLE/SNAPSHOT_EXPIRED/UNSUPPORTED显示安全原因，过期/无原handle撤下旧动作，不为了查询启动会话。返回version/scope/当前请求序号及ID都匹配才更新；外层scope缺失只能在原请求错误区安全说明，不更新其它卡。单ID在途与重复成功由Core/Window保证，UI按钮禁重点击只是体验保护；query和订阅保持0写入/0prompt。

接受 `onReportPersistenceUpdated` 对应report-persistence-updated、`onDeliveryHistoryUpdated` 对应delivery-history-updated；载荷version1+scope:{projectRoot,roleId,runtime}+change，分别为Core RuntimePersistenceChangeV1的report-save/delivery-history-save分支。UI复用同一个scope/ID reducer处理查询、保存返回及通知，未知版本/类型不生成业务卡、不退回raw。取消订阅在renderer卸载执行；上下文切换时按原视图分区存状态且取消过时本地动作，不抹后台真实状态。Window闭包原handle守卫负责旧handle通知/保存完成失效，UI不新增generation字段冒充它。

“报告待保存”与“历史待保存”是不同对象，分别显示源成果已结束/源未保存和目标处理事实/目标历史失败。expired通知、16MiB/FIFO/128详细回执过期或dispose均让旧按钮失效并说明不能恢复；查询失效不重prompt、不从原始文字重建对象。保存失败后再次点击仅又保存一次，无自动退避/循环。两按钮及失效文案属于本次具体需确认的必要动作，非已实施功能。

### P3/P4最小闭合：查看来源角色文档

接受PM、Window及编排r2的最小替代：**typed报告卡按钮叫“查看来源角色文档”，绝不叫“阅读本报告/已定位报告”**。可信C source.roleId只定位当前项目该角色的B清单，不提供文件权限，也不证明该角色任意文件就是这份报告。C不新增artifact候选/submit_report字段；evidence、summary、原文、文件名和首个/唯一doc都不能自动匹配或自动打开。

动作顺序为：原卡按钮记录invoker与chat锚点→在同一抽屉显示该来源角色的“已列文档”列表→用户明确选择ProjectDocumentRef→B read。列表数据只来自当前成功导入scope的RoleView.documents；刚提交的产物可能尚未列入，可用既有同项目listing刷新取当前B refs（不增list API），响应仍须当前projectViewId/role匹配。此刷新只更新清单，不调用selectRole/selectRuntime/openSession/send，不改聊天目标、引擎、运行任务、草稿或权限。文档列表的sourceRole是阅读上下文，不能借切换聊天来实现。

sourceRole不在当前listing、没有可读refs、scope未授权/已换、清单刷新失败分别明确说明；提供返回/显式重试清单，不能猜role或从路径补读。legacy只有原文、来源未知不提供此按钮；若有可信live presentation source role也仅给同等来源文档列表，不伪称durable/准确报告。用户选择ref仍要经过B全部权威校验与读取错误分支。

文档页有“返回来源角色文档”，恢复列表的scroll/选中引用（已撤销则说明而非强选其它）；列表关闭回原报告卡按钮，原卡暂离窗按原可信行身份恢复或稳定备选，保持报告展开与chat锚点。资料自身的文档入口仍返回资料原位置。源报告卡、列表、正文、返回全程不切聊天scope，不清非空草稿，不触模型。加载/失败关闭令本地seq失效，迟到正文不覆盖其它文档或新项目。

本替代足够让用户在ANS就地选读已列成果文档，**比准确一键报告多一步显选，不能承诺已找到本报告**。产品已短评接受，但这项具体差异仍需客户随本次合同确认。若将来要一键准确报告，需另审结构化artifact候选与B同一清单验证，当前不实施、也不隐藏增加。

### 最终对齐、验收增量与剩余批准

本r3回签A4/B2/C2、WindowAC3、编排r2，无剩余公共字段/consumer技术阻点；公共规范中的预算、失败策略、有限保护残余、B平台/原生grant及治理扩权、两保存动作和来源角色文档显选仍待客户具体批准，不因回签就实现。精确owned源仍6个、测试仍5个，无新helper/额外测试文件、无公共schema副本、无桌面动作。

新增必要consumer验收：native-only继续可读且不造模板target/process/真实turn；protected后缀计数/reader与projection失败分离、部分锚点缺失原卡决定保持；finalreceipt缺失/新handle只boundary保pending，旧saved query不复活按钮；五方法/两事件的外层ok与value失败分离、Promise/通知竞态只改原卡、query0prompt、expired禁旧动作；来源文档列表无/一/多文件均须显选、不按evidence选、不切role/runtime或open会话、刷新清单迟到/撤销、返回列表/关回原卡保持阅读。实际prompt/工具/入队次数仍由独立接线测试计数，UI画面数量不能代签。


## r3窄补回签：C2.text_policy_revision1 与UX短评

同版接受[Core C2“文本政策补充1”](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)和[UX接口差异短评r1](../../../UIUX设计师/docs/design/2026-10-15_design_complete-flow-interface-ux-review.md)。此节只纠正C新路径的文字/消费者语义，A4、B2、AC3、编排r2与本文6源5测试写集不变，不修改冻结UXv2或原型。以下优先于本文此前可能被理解成可读完整模型原文的表述；不另定义公共schema或版本无关字段。

### 新C只读安全显示副本

可信调用链内的modelPromptText仍逐字交给SDK，原图片引用不变；UI不得读取、请求或显示它，也不能以安全snapshot重render模型输入。Core首次生成并冻结displayInputText，新C的ANS user.text、canonical typed detail.text及summary、IPC、history补存只用此副本；Window/编排的raw TaskHandback和模型全文只在可信内部，**不得作为sidecar进入renderer/诊断**。

UI消费公共RuntimeInputTextProjectionV1的version/source与modelInputRecorded:false、redacted、truncated、summaryTruncated，不重做保护/截断、不把false标志当全面安全证明。新C相关详情入口统一标 **「交接内容（安全显示副本）」**；辅助说明“此处未记录完整模型输入”。净化发生写“已净化”，正文截断写“显示副本已截断”，仅summaryTruncated时写“摘要已截断”，不能错标正文未保存/完整。即使redacted与truncated都false，也不改称native完整转录或可取模型全文。缺新标记的旧记录保持旧来源限制，不补造新保护承诺；未知标记版本不给raw回退。

正文候选预算16KiB UTF-8、summary1KiB，先A同规则净化再完整码点截断；各新增user/event连同身份/provenance/标志的编码总量各不超过1MiB，不另叠一份1MiB正文。UI显示权威标志，不丢报告成员/改批次/按字符数另剪。inputSaved只表示该安全用户记录保存，不表示raw模型输入已落盘。source/target disabled的live IPC同样只安全副本且不建目录，保原live投递。

TEXT_PROJECTION_FAILED只表示安全显示副本生成失败：inputSaved:false、Provider未开始、两个retry能力false，显示 **「交接显示内容生成失败，尚未交给Provider。」** 不画成源报告失败、工具denied或空记录成功，不fallback raw；不提供历史补存按钮变相重prompt。模型是否收到原文必须由真实Provider捕获计数证明，UI不能据summary判断。

此政策仅限本次新C可信handback（实际inputProvenance/inputPresentation）。普通无C metadata聊天语义不随本补充扩大修改，旧ANS/native文件不追溯清洗，适配器native是否原本记录模型输入仍沿旧语义。不得宣传“全日志无secret/全面脱敏”；验收限新增C受保护的user/typed/summary/provenance/report文本字段，包含既有未知秘密、opaque真实ID与旧转录的全局日志不作这种承诺。

### 两类补保存文案与焦点

采用UX短评：source失败写 **「报告尚未保存，暂未继续回交。可补存原报告，无需重新运行任务。」** 按钮“重试保存报告”/在途“正在保存报告…”。成功“报告已保存”，更新同reportId原卡，不生成新成果或重跑源模型；**Window可能在该报告首次保存成功、原业务对象存在时继续一次原待回交**，按钮文案不能承诺“保存之后绝不投递”。Window唯一enqueue先登记queued再await，Promise/通知竞态仍只推进一次；UI只反映状态。

目标失败写 **「本次接收历史未保存；执行状态以上方实际结果为准。」** 说明“补存已有记录，不再次执行或投递”，按钮“重试保存历史”/在途“正在保存历史…”。成功“接收历史已保存”，同attempt原卡更新；**即使Provider原本未开始，目标补存成功也绝不启动Provider或再次投递**。B“重试读取”继续是另一个独立动作。

expired写 **「可补存的会话材料已失效，无法在此补存。」**，无虚假按钮/重建正文；disabled写“仅本次会话可见，未启用历史保存”，仍原live；unknown-live/unsupported/无handle按实际原因说无法确认或不支持，不新开会话。CONFLICT/INVALID/REPLAY_DAMAGED/REPLAY_CHANGED按权威不可补事实呈现，不自动覆盖或重执行。外层ok与内层保存ok仍区分，query/订阅0写入0prompt。

保存状态更新不自动展开详情/跳尾/抢输入焦点。只有焦点确仍停在成功或expired后消失的重试按钮时，移到**同卡**可聚焦状态行，下一Tab自然继续；旧scope/原handle晚回执不能把焦点送到新视图。polite状态区域只报告一次短保存结果，不朗读报告全文/重复完成通知。来源文档入口按UX短评用“<来源角色> · 来源文档”和显选说明，正文“返回来源文档”，返回恢复列表/原文件焦点，关闭回原成果invoker；不能叫已找到对应报告。

本窄补新增验收在原5个测试文件内：Provider实际捕获modelPromptText逐字不变，新增C字段/ANS存储前/IPC前只含安全副本且flags/UTF-8/总量正确，补存沿同冻结副本且Provider次数不增；投影失败Provider0/rawfallback0；普通chat与旧文件hash语义不变，不作全日志脱敏断言。源保存成功可首次继续原回交但不重源、目标保存成功永不启动目标，分别受控计数；两类原卡更新与失效焦点/polite短通知、文档显选/返回/不切scope保持。所有API及行为仍待具体客户确认和实施，本次只有文档回签，没有测试或桌面执行。
