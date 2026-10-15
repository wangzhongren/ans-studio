---
id: complete-flow-implementation
type: change
title: 已批准P1–P7接口与桌面改进实施记录
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
revision: 1
related: [complete-flow-interface-plan]
---

# 按已批准r2分阶段实现，不重复请求授权

客户已明确：**“确认按r2方案实施，接受取舍。先精确边界更新，再相关角色实现P1–P7，真实桌面完整测试，问题owner修复。”** 本次实际授权覆盖[总方案revision2](../design/2026-10-15_design_complete-flow-interface-plan.md)、A4/B2/C2文本政策1、同版consumer与B八源码一测试的精确Governance先行依赖。不是仅设计授权，也不是尚待再次确认。批准[manifest](../design/2026-10-15-complete-flow-interface-evidence/review-manifest.json)保持不改，本记录承载后续实际执行与证据；治理依赖已完成，相关owner分阶段候选已交；UI仍在实施、整体仍待全仓与真实桌面验收。

PM固定项目管理，仅写自己资料；root固定测试，仅独立跨角色/真实桌面，另独立Governance负责精确Window职责与边界。业务源与自有测试由原固定owner上下文实现，不能继承协调者身份切角色。无已启用/客户pin的task_ops项目配置（仓库无.ans/project.json），沿role-card允许的同等角色/边界/冲突/依赖核对，在本角色change记录执行事实，不伪造task_ops日志或自行创建更宽配置。

## 第一批与冲突预留

| 阶段 | owner/上下文 | 状态和放行条件 | 写冲突预留 |
| --- | --- | --- | --- |
| G-B | root启动的独立Governance | 已完成、root与PM已核实际8+1/职责，治理前无生产diff | Window角色卡/边界/功能职责资料，仅Governance |
| CORE-A/C | 运行时核心 / 原runtime_shell_guidance | 完整C75后又修非工具route红，现77/77/typecheck0，最新14哈希PM复算一致；公开基础已放行，非全链完成 | Model/runtime.ts、Service/runtime/session.ts、Provider/runtime/tools.ts与session-store.ts、Core私有helper/自有tests/docs；后续红只回原owner |
| B | 桌面窗口 / 原desktop_window_fix | 首候选导入失败红已owner修；39/39/typecheck0+独验green，当前14合并哈希一致，底层可消费，GUI仍待 | 新B八源码+一测试已接受；main/preload/interface/project与后续A/C共享，Window一个writer |
| Adapter-A | Pi / Codex / Claude各自固定owner | Pi217/39、Claude28、Codex22+本地CLI已交；root最终Core后501及Codex28独验全过，在线/GUI仍按实际覆盖 | 各adapter各自source/tests/docs，互不代写；shared Model只能Core |
| Pipeline-C | 编排 / 原orchestration_fix | 已交256/256/typecheck0、manifest全MATCH；root11合同+最终501回归，通过当前公开层，可放Window，非GUI | handback/run-role/govern-session及自有测试，唯一编排writer |
| Window-A/C | 桌面窗口原context | 已交7源11测试，37源码/测试/依赖/B保留hash经PM全匹配；owner206/206、root独验17/17；非GUI | 原Window scope，唯一writer；保B修复，不同时改B |
| UI-P1–7 | 桌面UI / 原desktop_ui_tests | root真实followup成功、owner ACK批准13/Core哈希匹配；六renderer接线在途，未冻结候选 | renderer六文件、UI五测试；不会改运行时、窗口或权限 |
| Assembly-fixture | 装配固定owner | 实际none固定owner ACK后已交单文件两行维护；专项13/13、全装配67/67、tsc/diff0 | 仅test/装配/multi-runtime.test.ts及own证据，无生产源码 |
| Independent | root固定测试 | 当前共同候选后独立合同、全仓、真实Electron；失败回实际owner | 测试角色自己的测试/证据；不越权修产品 |

活动容量为4含root/PM，通常只放两个worker。按客户本轮“先精确边界更新”的最新先后要求，Governance未完成前所有owner仅read/prep，不启动生产写入；不是只禁B。root已启动独立`/root/governance_p1p7`，待其真实回执和root明确放行后才派首批Core，不用旧方案的并行可能性覆盖最新要求。所有实施派发均附批准版本/窄写集/不可变manifest与测试要求。每owner先核自身现边界并回复实际理解，再写代码；B必须另核治理后的真实边界。不新增选装/平台/依赖或自动重跑策略；发现必须实质修约，暂停受影响写集并报PM，不扩权绕过。

## 放行证据与原有工作保护

每阶段交实际changed paths、候选哈希、命令/环境/退出结果、own API/feature文档和未覆盖；PM检查才可放依赖，不把worker完成文字当verified。Core公共字节改后重测adapter/编排/Window/UI；窗口/renderer改后root必须重载当前候选再桌面复测。接口测试未跑不能沿用旧1258通过作新证据。

先窄专项后必要全仓/typecheck/diff检查。root按已批准三接口验收框架独立核：真实结构/UTF-8与总量/敏感旁路，文件grant/路径/句柄/拒读/迟到/无写副作用，ACK与Provider调用次数/保存失败/仅保存恢复/唯一入队，P3显选与P5–P7业务保持。真实Pi与受控Codex/Claude分开，屏读/平台/安全未测诚实保留，不降低断言或改超时/权限通过。

原p-limit补丁、红绿及独立绿、报告与源码临时权限撤销保持；本轮不得恢复其写权、改.env或读取凭据值到日志。初始工作树含已批准设计资料未提交，不覆盖或并入无关改动；生产实施前app/src/test尚无本轮diff。PM不提交/推送或发布，除非另有用户指令。

准备期状态（已由下节实际派发取代）：实施授权已记录，Core准备、Governance待回报。后续证据在本记录追加，不覆盖批准manifest。

准备期root指出required-v1在bind时严格profile登记，旧custom providerFactory/controlled factory必须显式登记空profile或真实假profile。后续只由各测试owner在自己已接受测试目录/文件中同步协议夹具，保留原行为断言，不放松生产required、不删测试。root维护测试角色夹具，Core维护runtime-core夹具，其它owner同理；实际必要变更路径在交付时逐条补本记录。若某单列测试路径不在已接受边界，先报PM/Governance，不以“兼容测试”越权；这项准备提醒先于下节源写派发。

## 首批实际派发

截至2026-10-15 11:19:14（Asia/Shanghai，工具UTC 03:19:14核时）：root已正式回报Governance final并放行，PM独立读[治理证据](../../../桌面窗口/docs/change/2026-10-15-restricted-document-boundary-evidence.json)、实际role-card/YAML，新增恰8源码+1测试、35→44全file、无删除，职责含专属分层/Model唯一主属；root已复算批准13文件未变。放行前与首批ACK时app/src/test/.env无diff。

CORE-A/C-1已成功发原固定runtime_shell_guidance，owner回复13批准hash全MATCH、A4/C2.tp1/总r2、窄source/tests及保护范围ACK，先A再C单writer。此为真实实施派发，不是已验证完成；当前尚无代码交付结果。

WINDOW-B-1已准备同版独立scope，但首次工具启动返回thread limit，未产生成功派发；暂记ready/等待活动slot释放，不能写成running。治理已完成因此只剩容量依赖，B准备与Core实际源码范围不交叠；待成功重发再记ACK。没有创建重复Window上下文或切身份。

随后PM只读见Core当前已经修改model/runtime.ts、provider/runtime/tools.ts并创建自有tool-display.ts，符合首批范围；这是实施在途，不是完成/测试结果。B第二次工具启动仍thread limit。list_agents显示早已交付设计的Codex评估子上下文仍pending_init，占据容量；interrupt返回pending_init但未释放，不能假称B已运行或继续无限重试。已向root报告调度限制，Core写锁保持、B ready等待，原B生产文件尚未启动修改。

root决定由PM暂时final释放活动slot，root仅作为本轮用户授权的trusted operator把PM已准备且预留的WINDOW-B-1窄包转发到**原固定桌面窗口上下文**，不自行扩大写集、不写task_ops/global记录、不改角色。Core在途不打断，不重复启动pending Codex、不创建重复Window角色。PM之后在有slot时复核实际dispatch/ACK/候选，再维护本记录。

WINDOW-B-1预留包以B/r2、总r2及治理证据为准：新Model/Pipeline/Service/Provider八文件与project-document.test.ts；既有main.ts/preload.cjs/desktop interface.ts/project.ts的B接线及interface/project/diagnostics三个测试，own API/feature/memo/实施change/fix证据。**先只B，不写session.ts、runtime-history.ts、session-history.ts、request-anchor.ts或C保存/队列代码**，后续A/C须Core+编排实际依赖验证后由PM另派。复用root转发不等新用户许可，既有明确实施授权继续有效。

root另回报已在自己的测试scope准备`test/测试/p1p7-desktop-fixture.ts`：本地clone临时副本，原p-limit补丁四源hash一致、pins匹配、无sessions，复用本机依赖无联网安装；新增unicode/超256KiB/非法UTF8/静态危险链接等假文档与假.env仅在fixture。基线[manifest](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/desktop-fixture-before.json)由测试角色维护。这只是测试准备，不是新接口通过证据，也不改变Core/Window生产写集。

## 首批候选审核与必要owner修复

PM释放后，root按本包真实成功启动WINDOW-B-1并收到原Window ACK：新职责/MD/YAML已重读、批准13文档0 mismatch，严格只B8源码+1测试与main/preload/interface/project/指定测试。B首候选14个源码/测试hash经PM独立重算全匹配，批准manifest13仍全部匹配；owner四文件36/36、diff检查通过。分层只依Model/本组件public，Service唯一refs/资格与Provider句柄IO，固定错误无raw异常，原生pick grant不由renderer路径授权。root独立Pipeline→Service→Provider正反例已通过，但均不等UI/真实平台或完整P1–P7通过。

PM实读发现B首候选在原生选目录/开始枚举即撤旧scope，已有项目A→选择B但枚举失败后A旧ref不可读，违背失败切换保原上下文。root已在自有独验加原断言并真实red1，保[失败证据](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/b-failed-import-red.json)，用户已授权owner修复，root确认无需重复许可。预留WINDOW-B-FIX-1同scope：分离active grant/scope与pending选择/枚举，成功updateListing才commit；失败/取消保A，成功切新项目即使无grant也撤旧ref。保原错误/安全/乱序/只读测试，不放松断言、不改批准proposal。当前B不能标verified或放完整UI依赖。

Core A基础实际52/52通过，第一次发现JSON遗漏标志追加后超预算，owner修字节重算且保独立断言与首失败日志。required测试夹具额外必要路径`test/runtime-core/fixtures.ts`、`effective-timeouts.test.ts`在现目录权限内，由Core同步协议，不动同伴测试。最新联合typecheck0；先前Window五项类型错已其owner修，Core在途implicit-any也已自身修。C初期8/8仅该子集结果，完整C未释放。PM实读A公开Model/source/required/profile/legacy纯Service API已存在，允许准备A消费者接线；Model/Service因C兼容增长仍需最终共同候选后重测，不冒称已冻结全Core哈希。

C落地发现memory-only live presentation缺delivery/attempt/target而原合同要求target receipt/去重，PM裁定同意图最小兼容补三个optional字段：全齐且target实际匹配才启用新receipt/progress；部分出现INVALID，全缺保legacy live不造ID/不承诺receipt。不得造durable source报告或把live报告对象存盘；这是批准C要求的必要落地，不新增业务/权限。Core只在自己的Model/Service/common/自有用例处理，批准proposal/manifest不改，并在实施证据披露；source/store/durableC仍继续。

Core已交[stage A实际发布](../../../运行时核心/docs/change/2026-10-15-complete-flow-core-evidence/stage-a-manifest.json)（03:40:05Z），PM实读当前Model/Service public与required/profile接线，独立复算tool-display实现hash `57643567ada6d088028931519c1ca321b7060a4d0784b4920f079b5614618c2d`一致，A52/52与当时typecheck0。**A适配器依赖已放行；完整C/编排未放行。** Model/Service因同worker C仍兼容增长，不把stage A哈希说成整个Core最终冻结；所有caller须在最终共同候选重测。

当前容量仍有pending-init占位，root采用PM释放slot/自己trusted operator转发预留包的既定方案继续。预留WINDOW-B-FIX-1优先修新增导入失败回归，沿原B scope、原owner、保root原red断言，不改批准文档；B修复交付并独验green前不签B完整通过。其后可启动PI-A-1（只A来源接线），依据当前Model已存在的Source/Rule/required-v1/projector/register与A4/Pi r2，不等未完成的C去猜未来接口；仍不写Core或编排源。PM只预留scope及放行依赖，实际启动/ACK由root据成功工具回执回报，不预写running。

## B修后、Pi交付与Core完整C放行

WINDOW-B-FIX-1已真实完成。owner39/39、typecheck/diff0，root保同一red断言独验green1/0；PM已读active/pending分离的新实现，只有成功updateListing commit，取消/失败保原scope，成功切别root撤旧refs。初版B14文件与fix6文件合并的当前14hash全部匹配（[修复manifest](../../../桌面窗口/docs/fix/2026-10-15-document-scope-import-commit-evidence/manifest.json)），原manifest/red保留。B底层与窗口scope阶段证据可放后续消费，仍不等于真实GUI、Linux/Windows或完整安全隔离已验。

root据预留包成功启动原Pi owner并实际完成PI-A-1。PM已读real-adapter实际diff：只Model公开类型、仅允许target参数的callFacts、handler execution不塞SDK details、必需profile/projector早拒SDK、实际cfg env快照登记、真实ID不scrub、未知hook不借新turn、原图片/content边界保留。生产仅real-adapter.ts；新增tool-display-projection.test.ts并同步prompt-images.test.ts，当前这些源码/测试hash与[Pi证据](../../../Pi适配器/docs/change/2026-10-15-pi-tool-display-evidence/candidate-manifest.json)一致。全Pi217/217与专项39/39/typecheck0是分阶段证据；PM复算依赖只有Service已由797…变7c93…，故最终Core后必须重测受影响caller，不冒用旧dependency combo为最终整合证据。

root独验曾发现Core在Provider已执行后历史损坏、重复同attempt preflight把known执行事实退成false；已交Core原scope修，原red保留、相同断言green1/0。PM实读现prepare先查seen/known receipt，淘汰详细receipt前保实际身份事实，不再先读失败磁盘覆盖已知mayStarted/outcome。Core最终[14文件manifest](../../../运行时核心/docs/change/2026-10-15-complete-flow-core-evidence/final-manifest.json)经PM独立复算全部一致，组合`9395a1807e5af6248572bd04856adb959dbec5c01101669154803957bd55e7dc`，Core75/75/typecheck/diff0；批准13文档仍未改。**完整C公开依赖已放行编排消费实现**，不是Window或UI完成。

root当前三runtime C独验的已知Window内部boundary/receipt被当assistant等失败是尚未派发的映射依赖，保持红/断言待Window A/C接线，不混称Core失败，也不删测试。接下来预留ORCHESTRATION-C-1与CLAUDE-A-1独立写集，可在PM释放slot后由root trusted operator并行转发；旧pending-init Codex不再触发或假当实现writer。最终联合候选仍须重测Core依赖后的Pi及后续每个consumer。

## 编排、Claude回审与下一批

root已真实成功转发ORCHESTRATION-C-1与CLAUDE-A-1，各owner ACK批准13/Core14逐hash0 mismatch后实施。编排最终3源码+3测试[manifest](../../../编排/docs/change/2026-10-15-report-provenance-consumer-evidence/manifest.json)组合`ba462ba78609128199a67988422b051bc8450c2d65664e50393ee0a44b6e6310`，256/256/typecheck0；PM复算6文件0 mismatch并实读common纯origin/证据、外层recordFinalReport、5代理/govern透明、安全summary与report/liveReport、rawhandback只内部等实际接线。root独立11项同原断言通过是受控真实Core/Pipeline，不等GUI。Window须消费实际字段`report`/`liveReport`/`reportPersistence`，不能按早期草案`presentation`另造接口。

Claude生产仅session.ts（`e51e73e3593cbce8f57afba22b4913c30959e9a488eeac80e27e25b9e5921b87`），28/28/typecheck/diff0和真实CLI本地回环通过，在线调用0。PM复算其manifest8个代码/测试/文档0 mismatch，实读required/profile早拒、真实inputrule与handler结果、薄投影出口、未知hook不借active及SDK原content保持。它不是线上Claude或全桌面验收。

root新增独验[非工具engine失败RED](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/a-non-tool-routing-red.json)实际发现Core把无toolName/call的denied投成toolName空串/phase blocked。PM已真实followup原Core派发CORE-A-NONTOOL-FIX-1，仅现Service/必要Core投影helper与自有case，要求live/history按真实结构区分工具与普通engine失败；保真实denied、安全summary/turn，不要求保任意未知source字段，不造工具phase/identity或吞成投影诊断。root断言不改，旧RED与旧Coremanifest保留；修后重新发布依赖hash并重验Pi/Claude/编排及相关caller，不把旧combo当最终共同证据。

下一批预留Window-A/C-1与Codex-A-1。Window的B阶段已完成且单writer空闲，当前Core/Pipeline公开API已可实现接线，非工具route局部返修不改API；最终共同验收须用修后字节。旧Codex pending-init不重启；Codex实施若需新none上下文，仅绑定已接受Codex适配器，原评估无生产实现派发/无并写，不另造角色或扩边界。PM受容量限制准备窄包后final释放，root作为trusted operator忠实转发并回报实际ACK，不伪记已启动。

CORE-A-NONTOOL-FIX-1现已完成。PM复算[新14文件manifest](../../../运行时核心/docs/fix/2026-10-15-non-tool-event-routing-evidence/manifest.json)0 mismatch，组合`dd6b50518ca7504118907e996b76f8553e0f586c9837f573a5e8bfc8c897f015`，Service现`991146051f429ef26b46b21154a574086b312233047b29c99a9d522c01280f02`。相对旧冻结仅Service与己有session.test变动，真实结构工具路由和普通失败在live/history同源区分；非工具保kind/安全summary/actualturn，不加假工具facts。owner session18/18、Core77/77、typecheck/diff0，root原独验同断言green1/0，红及旧manifest保留。

WINDOW-A/C-1已由PM**实际followup成功派发并获ACK**，不再是预留包。owner复算批准13doc0 mismatch并读实际report/liveReport/reportPersistence/Model/治理边界，先A历史/legacy/anchor再C队列/保存动作，保B修复。ROOT首轮全仓1346项1322pass/23fail/1skip的原日志保留：1本地listen沙箱EPERM、8Window旧factory/display目标/anchor依赖、7独验已知Window映射/Core非工具红、2Codex未接线缺profile、5装配旧factory缺profile。Window包已明确：actualcall/turn的canonical request anchor不再依赖被净化掉的title，保start.anchor=request原断言；可信display目标继承及self-controlled factory显式空profile，不删assert或放松生产required。装配fixture窄维护排后，不能由Window跨修。

root已在允许本地loopback环境只读运行Pi/Claude/编排原owner测试，按最终Core Service991146依赖实际501/501、0fail/0skip；[root独立出证](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/callers-after-non-tool-core-fix.json)含8源hash/log，非owner重发manifest，非在线/GUI。Codex新none固定既有角色窄包已交root，待PMfinal释放后启动；当前Window为唯一活跃源码worker，不能误记Codex已ACK。

## Codex实际交付与UI/装配预留

root在PM释放后以新none固定Codex适配器成功启动Codex-A-1（旧pending-init不重触，原评估未生产并写）。当前Codex[manifest](../../../Codex适配器/docs/change/2026-10-15-codex-tool-display-evidence/manifest.json)8个代码/测试/资料及Core依赖经PM逐hash复算全部一致，组合`b85a1f51903a122b0678872882120a51868f1bb25d7e8df0f9a27130e216bac6`，生产仅session.ts `b8ad992535f6f4e309026c7750b2311de668ccddddaea91d73a36ca9eeafcea9`。PM实读actual required/profile同快照、薄投影出口、原turn/call捕获与SDK原content、无hook不造blocked，符合A4。owner22/22/typecheck0、真实pinned CLI0.162.1本地假Responses/MCP回环过，在线0；root另实际Codex独验28/28。均不是在线Codex或GUI验收。

Window A/C五方法与两可取消订阅已实际存在。root原A/C历史10/10、ordinary3/3和新完整保存恢复3/3已绿，真实source模型1/目标handoff1、并发保存只一次、初始saved通知前到、finalreceipt故障仅补历史不重prompt、安全副本无rawIPC/queue侧车均是实际独验，原红保留。owner C/IPC34/34/typecheck0/diff0并进入全scope收口；尚无完整Windowfinal或真实UI。公开API已稳定，PM可放UI按当前实际接口实现，与Window不同文件并行；待最终manifest与共同字节统一复测，不把“只读准备”无限拖住实现。

root自有旧回放oracle曾断raw title anchor，已在自有路径按批准独立固定SHA token修正，保request/conclusion同键、barrier/身份和无rawtitle守卫，专项11/11/typecheck0，原红保留；不是产品缺陷也非删断言。装配首full中5个controlled-factory失败仍待原测试owner显式登记空profile，预留仅`test/装配/multi-runtime.test.ts`与own证据，不写装配生产或放宽Core必需协议。UI-P1–7窄包和该fixture包将由root在PM释放slot后按实际成功工具/ACK启动，不能预记running。


## Window最终回审与UI/装配实际派发

root已按PM窄包真实followup原桌面UI并获ACK：六源五测试、批准13/Core实际依赖hash匹配；当前UI接线在途，任何在途renderer字节不计冻结候选。UI可基于稳定actual接口写入，最终仍待共同候选、全仓与真实ANS桌面，不要求新授权。

Window已最终交付[manifest](../../../桌面窗口/docs/change/2026-10-15-complete-flow-window-ac-evidence/manifest.json)：7源码11测试、9依赖与B保留10文件，PM独立重算37项全部MATCH，session为`63bae375299ad4f5464f3bf22204a55f35a7dd85bafd62660bff0e691c09814f`。owner23授权文件206/206、typecheck/diff0；root另在该最终候选五文件跨角色独验17/17，证据[window-final-independent-green](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/window-final-independent-green.json)，不是owner自验冒充独立或GUI。

PM实读关键实际接线：安全Desktop handback仅report/liveReport/reportPersistence，raw对象不转渲染；队列full使用safeText或安全等待文案；source saved状态不被迟到failed降级，原事件与通知同一report状态归并，在第一个await前设置queued保证唯一入队；retry按scope/原handle/已知ID守卫，单在途、失效明确，query不走保存；target边界与最终receipt映射状态而非assistant，可信display目标继承，真实call确认锚点不依赖被移除title；旧native走公开纯保护桥与统一SHA anchor。批准预算/兼容与B修后字节保留，无新增Schema或平台承诺。此阶段可供UI消费，仍不签真实GUI/在线三引擎通过。

ASSEMBLY-FIXTURE-1由root实际none启动既有装配固定角色并ACK后final。PM实读diff仅`test/装配/multi-runtime.test.ts`两行：断言Core确实提供registerToolDisplayProfile，再显式登记空凭据；原行为断言全保，无生产变化。PM复算实际文件SHA为`18329834063f41d9ec616fec726254a929a97addc102e04353bc52f5a31ff903`，与[装配manifest](../../../装配/docs/fix/2026-10-15-required-display-profile-fixture-evidence/manifest.json)一致。首红13总8过5失败保留，修后专项13/13、全装配67/67、严格typecheck/diff0；不放松required-v1、不读取真实凭据，不等在线或桌面。Core14/批准13不变由owner与root复核，PM本次不新运行同伴测试冒签。

本次回审无新增实施阻点。UI仍唯一renderer writer；PM释放slot供真实owner问题修复，待root完整全仓及native验收再闭合整体状态。


## A4旧来源漏透传必要修复预留

root新增真实独验RED：protected native-only映ReplayRow遗漏statusSource/target.source以及metadataOmissions，真实read目标仍在但same-call来源丢失，旧模板分类可能误作原生事实。保[原红](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/a-legacy-provenance-red.json)与断言不变。此为批准A4透明映射实现遗漏，不改模型合同/预算/rawIO或重新审批。

PM已尝试followup原Window，工具实际thread limit未启动；WINDOW-A-LEGACY-PROVENANCE-FIX-1记ready预留而非running，由root在PM释放后忠实转发。窄scope runtime-history.ts、必要session-history.ts既有Model类型引用、自有已授权测试与fix证据；透传legacyStatusSource/legacyTargetSource/metadataOmissions，不补猜未知，不恢复旧模板target/process，不将legacy-classifier升为native-result。禁止改Core/Model/renderer/批准manifest/env，旧候选保留，新fixmanifest叠加，需owner专项/tsc/diff及root同断言复验。UI当前冻结与其自身空态窄修分属不同文件，不互改。


## 真实停止收口缺口窄路由

root实际913 native链发现停止后Core可信settled.outcome=aborted，send仅okfalse/error使UI清会话、回填已发送输入并禁发送；点击原角色可续原handle，不能谎称会话损坏。另旧决定radio仍可变及非工具denied误分类已由root直接交UI原owner，不由Window越修。真实桌面红与候选分开保留，不沿913或早前全仓绿签新修字节。

PM预留WINDOW-STOP-TERMINAL-FIX-1，由root在PM释放后转发原Window，当前非成功派发/非running。优先已有clientMessageId/实际ACK turn/公开settled归并；必要兼容optional SendResult结构仅透传实际终态、输入接受、原handle当前性三项独立事实，不以error文案/stop意图/持久模式推断。消费先后需明确，无timer/无限等或自动重prompt；未知缺席保守，保真实failed/timed_out与未接受输入。源写仅现Window session与必要透明IPC/类型引用、自有授权tests/docs，不改Core/Model/Pipeline/renderer/批准方案；新边界需求先报告。UI收到实际字段后消费，root保真实红复验，仍属用户批准停止收口必要实现修复，无新审批。


## 当前候选最终只读审查（尚待最后P3复验）

root已实际完成在线Pi p-limit正式链：dispatch/workerInput/sourceReport/targethandback/finalreceipt各1，业务npm31通过，普通su与维护sourceReport为0；这是测试角色实际证据，不外推线上Claude/Codex。PM读[只读audit](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/native-final-readonly-audit.json)：冻结设计13件、真实.env、4业务源和4只读夹具均不变。efd候选全仓1379总1378过0失败1既有平台跳过由root实际执行，不覆盖随后P3新字节。

真实桌面暴露P5鲜context误标、queue提示、失效radio、停止错误处理与同轮双中止，均由原owner窄修并由root原生复测；Window停止结构事实透传不靠中文error，不扩新模型/业务。Window旧来源overlay保status/target来源与metadataOmissions、legacy分类不升原生，root原断言green，原红与旧manifest保留。

当前最后P3嵌套.card-text阅读位置仍在原UI授权六源五测试内修复。PM复算旧efd UI manifest11源/测试：仅renderer.js与uiux-v2.mjs为已知在途差异，其余9项一致；不把在途字节当冻结候选。实读sectionScroll按现data-section保存唯一.card-text的scrollTop/Left，沿原runtime/role drawerReading与reset恢复，未增加接口/权限/文件读取；外层anchor、展开、原入口焦点仍需owner严格case与root真机共同复验。UI最终新manifest、root最终native及finalfull未到，本记录保持implemented-unverified，不提前封板。

当前接受取舍不变：B可信本地macOS/Linux只读md/txt256KiB，Windows拒读、重启原生重选grant；P3来源角色文档列表显选而非从evidence直达报告；A4旧历史投影1MiB/4096连续后缀而原reader IO残余不谎称消除；C可能已启动不重prompt、会话内只保存恢复、源保存成功可首次续投、目标补历史不Provider；保护新声明字段而非整个原生日志DLP。无新增政策或实现范围阻点。


## 最终封板回签

最终候选renderer为`394a7abb0af61fa3f7a5ee0652238e70883d17d798235c37954cdf41086a5252`，UI manifest SHA256 `8b9a473ece0b92ef60a70a1ae4424c6f7860c0be3c040cd9676d1dd3264509d5`。PM实读测试角色[最终验证清单](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/final-verification.json)，独立复算六源五测试与48实际依赖共59项全部MATCH，manifest及原始final-full.log哈希与最终清单一致。冻结设计13件和真实.env继续保持；本次只更新PM自有记录，不改批准设计。

最后P3嵌套阅读位置修复已属主严格RED→GREEN：内角色卡/docs/changes位置与outer/展开/可见invoker/焦点及scope隔离均覆盖。root实际重载最终394候选，从可见Footer进入/返回资料，内角色卡仍第6协作位置、外层和展开保持、焦点回等效原Footer；原生960×860抽屉/composer/入口、Esc回原角色资料入口、键盘选Claude缺配→设置→Esc原按钮、再选Pi均复验，PNG/AX留在最终清单所列证据。不是用受控renderer结果代替真实窗口。

root最终全仓1379项：1378通过、0失败、1个win32-only路径大小写用例在macOS合理跳过，exit0；最终typecheck与diff-check均0。真实在线Pi已完成p-limit派发、worker输入、源报告、目标回交、最终回执各一次，npm31通过，普通su/维护无源报告；Claude/Codex仅真实固定CLI与本地受控服务验证，未宣称在线三引擎通过。完整P1–P7原生流程跨分阶段候选完成，最后窄修改仅按影响范围复验，最终全仓覆盖最终字节，不声称最后一版从头重跑全部原生流程。

据以上同版证据，本次总r2已授权P1–P7实现与发现问题owner修复完成，PM协调记录封板为verified。此前各阶段“尚待/在途”保留作当时调查和派发历史，不代表当前状态。已接受的平台、grant、两步来源文档显选、预算、旧reader残余、会话内保存恢复和脱敏限度仍有效；无额外提交或推送，无新增业务/权限/选装。
