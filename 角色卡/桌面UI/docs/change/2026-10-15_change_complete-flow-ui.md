---
id: desktop-complete-flow-ui-implementation
type: change
title: A/B/C及P5–P7的实际桌面UI接线
created: "2026-10-15"
updated: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 能核对执行、选读成果文档，并区分保存与处理结果

按客户批准的总方案revision2、PM正式预留 `UI-P1–7-1` 与root实施指令，本固定桌面UI实现既有[消费方案r3](../design/2026-10-15_design_complete-flow-consumer-plan.md)；批准A4/B2/C2文本政策1、WindowAC3及UX短评未被改写。开始和结束均核对13份批准文档hash全部一致，边界MD/YAML与角色身份不变，没有新角色/派生或越界修改。

产品实际仅六文件：index.html、styles.css、renderer.js、tool-rows.js、runtime-ui.js、role-status.js。测试实际仅五文件：tool-rows.test.ts、runtime-ui.test.ts、renderer.test.ts、markdown.test.ts、e2e/uiux-v2.mjs。没有新增helper、库或公共schema，没有修改后端/Model/适配器/边界/.env/真实p-limit项目；未操作用户真实窗口。相关当前功能：[桌面引擎与会话](../feature/runtime-choice.md)。

## 实际交付

- **A工具核对**：消费actual display而不为新display从raw args降级，未知display版本不读内部值；同scope/turn/call保留start/blocked/result与失败，不把同文不同call合并。可靠command/path、真实错误预览、短时分与完整原时间可读，安全详情分结果/错误/exit/signal/stdout/stderr/duration及净化/截断/omissions。正文只在展开时物化，开合/状态更新保持读者与原请求卡。旧历史没有字段明确未保存，不从模板补新机器事实。
- **A4 legacy**：按Window最终overlay消费legacyStatusSource、legacyTargetSource和metadataOmissions。旧文本分类明确不是新机器执行事实，时间/定位标记/超预算身份的省略只提示不补造。原native ID与hashed anchor分离，未知缺turn不跨轮去重。历史前缀省略、投影无效、parser跳过三计数独立，窗口只读保护失败不回raw。
- **B/P3阅读**：“查看来源角色文档”只用可信来源role打开当前已列B refs，用户必须显选；不抽evidence、猜首个文件、切聊天role/runtime或开启模型。请求只含version/epoch/documentId，正文静态安全Markdown/txt，无HTML/脚本/自动图片；相对链接仅查当前已签发引用，外链沿原用户动作HTTP(S)入口。读取错误、scope/grant/平台/格式/大小、关闭/返回/换上下文的迟到结果均处理，返回列表/关回实际invoker保持原卡与草稿。
- **C成果与保存**：源事件实际消费安全report/liveReport/reportPersistence，不读取raw handback侧车。submitted报告声明与terminal-fallback区分，completed不等验收，未知任务号/缺证据/省略明确。目标输入仅用provenance/live presentation与安全显示副本，标签“交接内容（安全显示副本）”及modelInputRecorded:false/净化/正文截断/摘要截断；未知标记不冒称完整模型输入。原普通聊天不升级为报告。
- **五操作/两通知**：查询只读能力、report状态/receipt；重试报告保存和目标历史保存只传scope+实际ID。外层ok与Core value结果分开，同ID更新原卡、每次在途禁重复、expired/冲突/损坏不给假按钮；不以UI入队或重新send修历史。源补存成功可由Window唯一归并首次继续原回交，不重源；目标补历史绝不启动Provider。当前Provider可能已处理/实际outcome与安全用户记录保存分别显示，旧handle/项目/未知版本不能更新新卡。无变化通知不重复重绘/朗读整份成果，按钮消失后仅原焦点仍在该卡时回同卡状态。
- **P5–P7**：上下文固定区域用实际转录事实，不以loading清空DOM当有历史；真实open返回resumed:false的事实仍留记录，快照广播只更新当前状态，不新增generation或同文删真实恢复。设置/阅读保存实际opener，非空草稿不清、设置保存不重开已有会话；失效入口才退稳定图标。资料独立列待选择/待确认/混合待处理和定位，pending不进入queue/running数量，不默认替客户决定、不把choice叫写许可。

## 首红与修复记录

首轮单元为7条旧源码构造守卫失败，见[原始首红](2026-10-15-complete-flow-ui-evidence/first-unit-red.txt)。涉及raw hb字段、旧Window opts/queue.full构造、旧docs目录计数、固定源码距离等；按actual安全字段和批准接口迁移，保留原Markdown转义/证据逐条转义、图片数组原引用、callback/ACK身份、派发来源、虚拟build与原撤回断言。没有删除业务保护或放宽required。

实际renderer初期的新夹具有savePending变量重名语法错误，三个仅自有进程由各自session SIGINT结束并修正；未全局kill Electron。原runtime断言要求恢复说明堆在chat，现改核固定状态的真实warning与无伪恢复；legacy回放的raw标题锚点按A4改固定SHA常量，仍核同键/原卡决定/位置，不让生产实现定义期望。B关层原invoker严断言曾因夹具DOM.click点击视口外按钮失败，补先将真实入口滚入可见后原严断言通过；不可见入口fallback限制未放开。

最后独立补测发现报告历史只有reportErrors而rows空时被旧early-return吞掉，保留[真实首红报告](2026-10-15-complete-flow-ui-evidence/report-errors-red.json)。仅将安全计数说明放到空历史return前：不可读报告不生新成果卡，不回显原异常/未知正文。Window source/省略元数据漏透传已由其原属主修，UI没有代改。当前最终字节针对两处均实际复验。

## 前阶段候选与验证（082/913）

[manifest](2026-10-15-complete-flow-ui-evidence/manifest.json)记录6源/5测试SHA、批准13文档、Core+编排+Window/B及最后metadata overlay的48个实际依赖，hash全部匹配。编排 `ba462b…` 是其组合manifest，实际run-role为 `fad87c…`，没有把组合hash误当单文件。Window最终runtime-history `8d605a48…` / session-history `17534509…` 覆盖原base manifest相应两项，其余base和B保持一致。

原冻结renderer SHA `08201e9390253764d87fc533ac15b6e2d1140c0408994ba5961de41d7156ce13` 后，文档检查发现资料→文档→返回采样顺序缺口，先通知root并保[严格首红](2026-10-15-complete-flow-ui-evidence/role-doc-return-red.json)。root授权仅两处顺序修复：进入文档前captureDrawerReading；采样函数只读实际角色资料DOM，避免返回时将文档列表scroll覆盖原资料。没有新字段/接口。**该阶段renderer为 `91316665a8f027a2ff58648d37b8e37170a443beb85523d6e8212081ee829395`**，另5源不变；root已获新重载信号。随后root真实桌面暴露下述原scope问题；先保首红、按root明确授权修复并重新冻结，未静默改源。

环境：Node v24.14.0 / Darwin arm64；实际受控Electron44.7.0、内置Node24.21.0。所有模式都用真实renderer/preload与离线IPC，临时profile分目录，不触真实凭据。

| 命令/模式 | 最终实际结果 |
| --- | --- |
| node --test test/桌面应用/{tool-rows,runtime-ui,renderer,markdown}.test.ts | 66 tests / 66 pass / 0 fail / 0 skip，exit0 |
| ANS_COMPLETE_FLOW_UI_ONLY=1 | 当前913候选 COMPLETE_FLOW_UI_PASS 41记录，40个true布尔观察+1操作快照；另有实际调用计数断言，exit0 |
| 无专项变量 | UIUX_V2_PASS 98记录，含原图片/队列/工具/OP/虚拟阅读及多引擎断言，exit0 |
| ANS_DUP_UI_ONLY=1 / ANS_MERGE_UI_ONLY=1 | DUP32 / MERGE12，exit0 |
| ANS_RUNTIME_UI_ONLY=1 | RUNTIME16记录（15布尔+1调用快照），exit0 |
| ANS_CONFIG_UI_ONLY=1 / ANS_SELECTOR_UI_ONLY=1 | CONFIG20 / SELECTOR25，exit0 |
| ANS_PROJECT_RESET_UI_ONLY=1 | PROJECT7，exit0 |
| ANS_IME_OUTDIR=... node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs | 26个true / E2E_DONE=1，exit0；未修改此夹具 |
| npm run typecheck / 限定git diff --check | exit0 / exit0 |

除IME外Electron命令均为 `ANS_UIUX_OUTDIR=/private/tmp/ans-complete-<模式> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` 加表中模式变量。报告记录数并非独立测试用例数，manifest另列布尔观察统计。配置/撤回错误为夹具主动模拟；IME原夹具未注册新配置查询通道，因此打印一次caught missing-handler，26项输入/图文/组合保护仍通过，不能据其声称配置能力通过。

最后两处P3仅影响资料采样：当前913重跑消费者41/完整98/合并12/单元66/typecheck/diff；DUP32、RUNTIME16、CONFIG20、SELECTOR25、PROJECT7、IME26为原082同组候选结果，未把它们冒记为913重新执行。manifest逐报告标其实际renderer hash与适用性；rootGUI前部观察同样明确属082。当前strict consumer新增检查真实资料scroll>100、文档往返后误差<2px与原展开状态，未放宽位置断言。

原始结果：[66单元](2026-10-15-complete-flow-ui-evidence/unit-tests.txt)、[消费者40记录](2026-10-15-complete-flow-ui-evidence/consumer-report.json)、[完整98](2026-10-15-complete-flow-ui-evidence/full-ui-report.json)、[DUP32](2026-10-15-complete-flow-ui-evidence/duplicate-report.json)、[MERGE12](2026-10-15-complete-flow-ui-evidence/merge-report.json)、[运行时](2026-10-15-complete-flow-ui-evidence/runtime-report.json)、[配置](2026-10-15-complete-flow-ui-evidence/config-report.json)、[选择器](2026-10-15-complete-flow-ui-evidence/selector-report.json)、[项目状态](2026-10-15-complete-flow-ui-evidence/project-reset-report.json)、[IME](2026-10-15-complete-flow-ui-evidence/ime-report.txt)。所有false布尔观察为0。

已本侧目视检查：[工具错误/命令/退出码](2026-10-15-complete-flow-ui-evidence/01-tool-detail.png)、[源报告](2026-10-15-complete-flow-ui-evidence/02-source-report.png)、[受限静态文档](2026-10-15-complete-flow-ui-evidence/03-document-read.png)、[1360](2026-10-15-complete-flow-ui-evidence/complete-flow-1360.png)、[960](2026-10-15-complete-flow-ui-evidence/complete-flow-960.png)。root亦只读查看前述图，未提出新布局返工；这不替代其真实窗口键盘/焦点/文件/20KiB截断走查。

## 证据边界

本侧证明UI消费者、受控IPC调用数、静态安全呈现及旧保护不回退；不以卡数证明真实Provider/工具/保存次数，不代签后端IO权限/竞态、平台安全、真实模型凭据或屏读软件。B在允许文档内显示用户原文不等于全面脱敏；A/C只按权威投影显示，不声称全日志无秘密。真实主进程/native/实际保存恢复/在线Pi及完整CUA走查由root测试角色在当前候选独立提供，当前status保持implemented-unverified待该最终证据。

补充覆盖边界：资料→文档→返回角色资料的913专项严格验证滚动和展开；文件→来源列表原文件焦点、关层→原卡invoker另已验证。返回角色资料会重建该资料DOM，当前未新增主动聚焦其新文档入口，不能把本滚动专项当这一分支键盘回焦已通过；已明确交root真实GUI核对及必要同范围修正，不静默增改冻结源。


## 真实桌面首红后的daf候选

root在913候选的真实普通消息/原生导入/选择/停止中发现P5/P3/P7/A消费缺陷，当前均按既有批准范围修复。原始AX保留于本证据目录；P5和P3另有修前受控严格首红。旧阶段边界说明保留作历史，不代表当前仍缺回焦。

- P5：在真实open之前、历史读取之后捕获可读旧记录事实；后续首条当前prompt、工具或当前轮回放不能把新会话退成“旧历史未恢复”。实际旧历史+恢复失败仍显示真实warning，不增generation/后台API。
- P3/P6：角色资料DOM重建返回后，聚焦仍可见有效的等效“查看已列文档”入口；无效时退稳定资料入口。保持原scroll与展开，未改变文档权限或选读顺序。
- P7当前提示：入队hint带project/runtime/role/client来源；仅确切client ACK或同scope权威空queue清除。匹配ACK先于queued返回时不复活旧提示；新错误/背景角色提示受保护。聊天里的真实入队/撤回记录完整保留。快照无clientID，未猜单项withdraw与client映射。
- P7决策：提交期间禁所有决策input/button；已决/失效后保持实际checked并永久disabled，不仅隐藏submit。预览与只读展开不受影响。
- A非工具终态：只有可信工具字段/typed activity或真实旧tool记录才能进工具详情；普通denied/aborted没有tool identity时，live及history完整保留系统事实，不造工具名/目标/phase；不同turn同文两条均保留。
- P7停止收尾：消费Window原SendResult新增可选flat事实turnId/clientMessageId/inputAccepted/outcome/sessionCurrent，结合现有同client/实际turn事件，首可信terminal不改绑。回复先/事件先都能收口；ACK不冒充接收，unknown保持unknown，不因通用error回填已接收prompt或误清仍当前句柄。真实failed/timed_out保错误；确切未接受拒发保合理草稿。sessionCurrent只代表原entry当前性，不宣称ready；false不被猜为当前新会话不存在。无timer、中文error判断、新模型调用或后台代改。

上一阶段renderer SHA256：`daf00c90fee97425428159ed46e9b58ede4292d07e7ac70353e20639a8228f01`；tool-rows：`97b688e51ce098e95c7b7f71aec822dc5e2fe8c491672ccf2beb6fe4841e5f8f`。其余四产品文件保持此前hash。root已获稳定reload信号，我方自有窗口全退出；信号后仅文档整理，若再改源必须先通知重新验。

| 当前字节命令/模式 | 实际结果 |
| --- | --- |
| node --test test/桌面应用/{tool-rows,runtime-ui,renderer,markdown}.test.ts | 67/67，0 fail/skip，exit0 |
| ANS_COMPLETE_FLOW_UI_ONLY / 无专项变量 | consumer41（40true+1快照）/ full98，exit0 |
| ANS_DUP_UI_ONLY / ANS_MERGE_UI_ONLY | 32/12，exit0 |
| ANS_RUNTIME_UI_ONLY / ANS_CONFIG_UI_ONLY / ANS_SELECTOR_UI_ONLY | 16/20/25记录，exit0 |
| ANS_PROJECT_RESET_UI_ONLY | 7，exit0 |
| ANS_FRESH_CONTEXT_UI_ONLY / ANS_ROLE_RETURN_FOCUS_UI_ONLY | 首prompt及回放4 / scroll+focus2，exit0 |
| ANS_TERMINAL_UI_ONLY | queue来源/新hint/迟到ACK、冻结卡、非工具终态及异turn回放10，exit0 |
| ANS_SEND_FACTS_UI_ONLY | 同轮收尾双序、unknown、真实failed、拒发、异runtime隔离8，exit0 |
| 原ime-enter.mjs（未改） | 26true+E2E_DONE=1，exit0；原missing runtime-config fixture caught warning仍如实记录 |
| npm run typecheck / git diff --check | 0/0 |

这些是实际renderer/preload受控IPC结果，不冒称Window/provider通过。Window停止事实实际源码候选`182e5d7a…`已由owner冻结，owner报告45/45与Window214/214；最终overlay依赖核对在manifest独立列出。普通实际Pi请求、真实文件读取/保存/中止与最终桌面验收仍由root提供，不用stub调用数替代。


## 最后同轮终态归并（efd候选）

root在daf+Window182真实普通choice/queue/stop中已验证：新会话首prompt前中后不虚假退化、旧radio禁用、已接受prompt不回填、发送仍可用、下一条队列实际模型只处理一次、顶部旧queuehint清除。上述真实结论属于daf，未冒称最后efd已原生验收。root随后保留`desktop-final-stop-after-ax.txt`：同轮普通denied(outcome=aborted)与settled各显示一次“本轮已中止”；重开历史只有一次，属于展示归并缺口。

按root同scope授权，先保[严格首红](2026-10-15-complete-flow-ui-evidence/terminal-merge-red.json)，再仅改renderer：现有scoped pane内，非空顶层actualturn+有效结构化outcome相同、且非工具denied/settled才共用一个可读终态行。身份不使用文案；选定生命周期后仅避免它的相同摘要重复朗读，不同诊断全文逐项保留。不同turn/outcome、无turn legacy、工具denied均独立；正常真实failed/timed_out状态不弱化。更新原行高度保持虚拟阅读位置，不删真实事件、不改backend/Model/policy。

live先/settled先都支持；历史重建只凭已实际观察来源的精确replaytoken复用同终态，携带该已知生命周期的不同诊断，不从冷历史文本补猜缺失outcome。history先到时须再收到可信同token live诊断方可赋予终态身份。没有新增generation或持久来源。

实现首轮自己的inline style被既有CSP拒绝，保[原始错误报告](2026-10-15-complete-flow-ui-evidence/terminal-merge-csp-red.json)，随后改为静态块元素；未放宽CSP或零console-error断言。旧源码构造测试因非工具分支增加聚合出口首红，保存`terminal-merge-static-first-red.txt`，更新其真实分支守卫并仍严格核全量诊断及工具瘦身；没有删断言或吞异常。

该阶段唯一新增产品变化：renderer SHA256 `efd2e33c45e587c2784a5e98528a035f08f9bca8e4c55b62d52dbe8f1f84e92c`，其余五产品文件与daf相同；测试只改已有renderer.test.ts和uiux-v2.mjs（均在原五文件集）。新专项[12个严格布尔观察](2026-10-15-complete-flow-ui-evidence/terminal-merge-green.json)全部为true：两序、同turn诊断保全、不同turn/outcome、无身份legacy、工具拒绝独立、history双序、late收尾、异runtime隔离、虚拟阅读不跳。

该阶段efd还实际重跑unit67/67、consumer41/full98/dup32/merge12/runtime16/config20/selector25/project7/P5fresh4/P3focus2/P7terminal10/SENDfacts8，均exit0；tsc/diff0，批准13文档和48实际依赖hash保持匹配。IME26沿用上一daf已执行结果，manifest准确标明不重跑，避免同bundle Electron启动影响root正在进行的原生CUA；本次未改输入/IME函数。全部自有Electron窗口均已app.quit/exit0，并已向root发稳定重载信号，之后只整理文档，不再启动测试窗口或改产品。

当前状态仍implemented-unverified，最终efd原生stop复验由root独立提供。manifest保留各阶段实际hash、原始首红与当前结果，不把旧daf/913/082真实或受控观察冒签到efd。


## P3嵌套阅读最终394候选

efd原生资料往返暴露.card-text内部滚动未保存，外层/展开/focus已通过。按root既有P3授权及GUI退出信号，[严格首红→窄修记录](../fix/2026-10-15_fix_role-info-nested-reading.md)完成。只在原drawerReading按稳定section存/还card/changes/docs三个既有独立容器scrollTop/Left，不改文本/图像静态呈现、消息、C、公共字段或依赖。修前outer916保持而三个内层2086/2047/2659均退0；修后三者及outer全部原值保持，且原可见Footer、展开、回焦断言不退。

当前renderer最终SHA256：`394a7abb0af61fa3f7a5ee0652238e70883d17d798235c37954cdf41086a5252`，另五产品文件保持efd。当前资料专项11记录=9true+2真实位置快照，含role/runtime/project隔离；unit67、consumer41/full98/terminalmerge12/sendfacts8/merge12/dup32/runtime16/config20/selector25/project7/fresh4/terminal10/IME26均当前394重新执行exit0，tsc/diff0。manifest保留旧阶段准确归因及首红，13批准文档与48实际依赖全部一致。

root真实GUI因同bundle自测守卫需暂停，故本次严格遵其退出GUI信号后集中全部Electron自测；所有自有窗口已退出，随后明确释放slot与发送当前source hash，再仅归档文档。当前394原生嵌套阅读和960验证尚由root独立提供，状态不提前标最终验收完成。
