# 运行时核心工作备忘录

2026-10-14：客户确认运行时接入组并指示新建角色、开发。职责与边界已由 ANS Governance 建立；当前尚未实现或验证。

2026-10-14 C1：Model/API 已冻结并获 PM 同范围评审；实际工具由 Service 注入，不得 Provider peer-import。存储新增 optional validateNativeDirectory/prepareNativeDirectory，前者不建目录，后者仅真持久化时调用。legacyDirectory 只给 Pi。适配器原生 UUID 与 Service 本轮 ID 不同，生产 adapter 使用注入 currentTurnId，原 handler signal 必须是本轮原始信号。shared atomicWrite 新增 optional signal 已由 PM 实施。核心工具迁移 helper 的 Pi 副本仅可临时并存，由 P1 属主 facade/删除；本角色不修改 Pi。C1 原证据与候选摘要在 change 文档。

2026-10-14 C1R：CustomerInputMetadata 可选第二参数冻结，包含原始 signal 与入口捕获 turnId/role/runtime。raceAbort 只中止工具等待，原 callback promise 的许可副作用必须 O1 在发行前依据原 signal 检查，D1 使旧卡失效。核心新增真实 handler+许可替身+下一轮 gate 拒绝测例；consumer 集成证据仍由测试角色提供。共享 CODEX_ACCESS_TOKEN 仅剥离/掩码键，不作为产品认证 fallback。旧 C1 21/21保留历史，Model/tools/shared输入变化后失效；当前证据见 C1R fix。

2026-10-14 C1H：历史读取的 Pipeline 指定入口在 Service session.ts，同名 operation 委托 Provider session-store.ts；只是返回 Model 值，不 reexport Provider 对象。Model/tools/存储实现与C1R保持原样。当前 evidence 在 service-history-entry fix；编排的新测试由其属主重跑。

2026-10-14 C1T：resolveRuntimeTimeouts 位于本角色 timeout.ts，沿 Pi opts??env 及 readTimeoutMs 规则；Provider composition 一次计算，同值传内外。显式0/负/NaN/Infinity原值不校验，环境finitepositive才floor（0.5→0为既有行为），其他runtime不读Pi env。原 AbortSignal.any([controller.signal, call.signal])仍组合原call信号，无provenance扩张。当前 core28/28与whole tsc exit0证据见 pi-effective-timeouts fix；原24/24留历史。

2026-10-14 C1P：P1 legacy五项文案断言失败根因是tools统一abort包装泛化已失败结果。入口按工具专属语义，postawait只改signalaborted且oktrue；okfalse原样保留。当前31/31、whole tsc0；原28/28 evidence历史保留。Pi185全部回归及loopback权限例由P1原属主提供，不用核心证据替代。

2026-10-14 C1O：P1实际内外同45ms时outer先timeout，inner abort cleanup后来发aborted改写结果。Turn.outcomeLocked在outercatch定结论后设true；pump settled/streamcatch尊重lock，cleanup错误仍emit，正常inner outcome依旧照实采纳。当前33/33与whole tsc0证据见 outer-terminal-outcome fix；Pi真实迁移race测试由P1属主重跑。

2026-10-14 C1A：PromptOptions.onTurnStarted(metadata:PromptTurnStartedMetadata) sync optional callback，在Core prechecks通过新UUID/active/providerturn设置后try首句，persist/native前恰一次。三个readonly字段turnId/roleId/runtime，无clientID/signal/权限/Store/SDK变化，原opts/images reference透传adapter且adapter不调用。callbackthrow未开始underlying则不调用idle native.abort，单failed释放active。Window原invocation闭包捕获ack，删FIFO/latest猜测；本角色不修改Pipeline/UI/Window。当前38/38 whole tsc0原证据/manifest见prompt-start-ack fix。


2026-10-15 C1I：Core统一input echo在ack/userpersist/signal后native前单emit，detail.source=prompt-input/text/imageCount?且detail.turnId=top actualturn；Pi生产注入false由Pi属主维护，demo有Coreturn不自echo。确认/选择metadata optional toolCallId入口原值透传，不猜ID/正文。schema两说明明确argv-noshell，执行不变。Core+Pi shell+wiring57/57、tsc0，独立桌面待联合验证；原red与首候选detail.turnId失败保留说明，见本次fix。

2026-10-15 CORE-A/C-1：按用户批准总r2及匹配review-manifest实施A4/C2.tp1，批准design/manifest不可改。新common/tool-display是唯一投影，Model required-v1/profile/rule/execution精确接口已落，Core fake factory必须实际register空profile；己目录fixtures/effective-timeouts属于必要协议维护。C bound persistence/capability来自实际storage；source原子report、target安全user/typed文本+boundary/finalreceipt、只保存恢复与budget/expired已落。PM裁定live presentation可选deliveryId/attemptId/target全齐才新receipt，全缺legacy兼容，部分INVALID；不添durable报告身份/写权。同attempt必须先读已知内存事实，再验输入/读磁盘，修过真实后置损坏倒退providermay=false的独验红。Source ID冲突不覆盖、Provider可能调用不自动重发。最终候选/checks见own change，不能拿本地core测试当Window/三adapter已接。

2026-10-15 CORE-A-NONTOOL-FIX-1：普通engine denied不能仅按kind送tool projector。Service live/history同routeRuntimeDisplayEvent，只显式tool_call或非空toolName/嵌套call.name视工具；裸Error.name不是toolName。非工具仅安全summary/actualscope/turn/合法outcome，不raw侧车/造phase。Service991146051f429ef26b46b21154a574086b312233047b29c99a9d522c01280f02，新组合dd6b5051...；session18/18、root原独验1/1、Core77/77、tsc/diff0；原9395候选清单保持历史，peer需重测。只改己scopeService及session测试，见fix原证据。

2026-10-15 FIXPROP-F178（提案轮，未改任何代码）：kanban-live真机轮三问题修复提案已出（docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md，未实施/未测试）。F-1根因＝runShell(provider/runtime/tools.ts:379-438)无执行计时器、kill仅挂AbortSignal；实测583s挂起系轮次超时放宽至900s未达（触发时行为＝整轮timed_out中止，属"用轮次尺子量命令"）；提案命令级时限（默认600s、ANS_PI_SHELL_EXEC_TIMEOUT_MS、选项shellExecTimeoutMs、共享幂等terminate复用250ms SIGKILL/1000ms清理预算、如实"超时已终止（N ms）"+部分输出+execution.timedOut、轮次继续）。F-7：命令串→argv唯一在tools.ts:306 splitCommand（457唯一调用）；提案执行层UX守卫仅判"未加引号的独立操作符token"（引号内永不明中，保grep "a\|b"；反斜杠前导放行），gate前拒绝+明确文案+diagnostics shell.guard.blocked；classify-shell.ts:220-222门禁立场不动。F-8：tools.ts ok=code===0→real-adapter TOOL_FAILED→tool-display"执行失败"→tool-rows红；提案投影措辞分「已执行完成（退出码N）」而ok/status/errorCode/消息文本全不变；UI消红需桌面窗口/UI同步（只列不改）。待客户裁定4项：F-1默认值/进程树终止opt/F-7内嵌与展开检测opt/F-8桌面同步是否本轮派发。
