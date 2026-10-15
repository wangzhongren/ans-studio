---
id: visual-convergence-implementation
type: change
title: 已接受V2视觉方案实施协调
created: "2026-10-15"
status: verified
revision: 1
---

客户明确授权：“按 V2 方案让相关角色实施，完成后在真实桌面里完整测试，发现问题让对应角色修复。”沿用已accepted设计，不重复请求确认、不改设计基线。原型SHA256 e95b363dfe4191f32a53d139de3b80d75a48b89362f886376ed49e3ad7b4ea4b；规范SHA256 25474437047fdb864fcb401f8ff42b67bcf77cc534b98b37c44146cfa265c101。

## 精确预约与依赖

UI-VISUAL-V2-1预留原desktop_ui_tests固定桌面UI，唯一生产writer。源仅app/renderer/{index.html,styles.css,renderer.js,tool-rows.js,runtime-ui.js,role-status.js}；测试仅test/桌面应用/{tool-rows.test.ts,runtime-ui.test.ts,renderer.test.ts,markdown.test.ts,e2e/uiux-v2.mjs}；自身API/feature/memo/change/fix及证据按现边界。先核角色/边界与实际工作区，保留全部未提交P1–P7成果及其证据，不reset/clean/覆盖旧工作，不提交推送。记录修改前候选hash与新字节。

实施208/176双栏、最大800阅读列、统一字阶/间距/32px控件、报告summary/真实保存投递事实优先与完整展开、424模态抽屉及实际opener/Tab/Esc/内外阅读位置/展开/草稿恢复、任务原文默认折叠但可达。原型演示条/硬编码报告/假数据/504缩放不搬生产。真实report summary确定性预览，不生成新摘要，不解析自然语言补事实，不抹失败/未知/截断/保护标志，不更改模型原文或安全投影预算。无默认决定，pending/queue分源、失效决定禁用、停止真实事实与普通chat/正式报告语义保持。

禁止修改app/desktop、main/preload、Core/Model/Pipeline/adapter、.env、目标项目、治理边界、冻结13件及已accepted设计。若缺数据/字段，先只读定位实际来源并回PM，不新造接口/权限或让用户流程暴露实现细节。未发现必要后端变更，不启其它生产owner。

UX-VISUAL-V2-REVIEW-1预留原ux_selector固定UIUX，只读比对实际实现与accepted规范/原型，在自身新docs/design评审记录意见；不改生产、不更改accepted基线、不代UI实现。root固定测试，在自身已接受测试/证据范围做独立合同与受控renderer/真实桌面完整路径验证，不写产品源码。真实窗口使用串行，UI自测结束明确退出并发稳定reload信号后root接管。

## 完成门槛

UI先ACK范围及基线，实施后交精确实际files/hashes、原红/修绿日志、自有相关单元与renderer功能回归、typecheck/diff及视觉双宽截图；自测不代替root原生验收。root按实际候选重载，完整检查1360/960布局、报告摘要/失败/未知/全文、工具与终态保真、来源文档显选及模态焦点/阅读/草稿、未导入禁选/缺配设置/键盘选择、pending/队列/停止/失效、普通chat/正式任务与必要真实执行链。最后新字节全仓、typecheck/diff及保护文件/hash审核，问题保首红交原owner修再复验。线上覆盖如实限定，不以本地CLI假服务代表在线模型。

当前仅已授权与scope预留，尚未实际派发/ACK，不记running或verified。批准方案与旧P1–P7资料不覆盖；后续事实在本记录追加。

## 实际派发与客户验收强调

root已成功转发UI-VISUAL-V2-1至原desktop_ui_tests并获ACK；UI为唯一生产writer。UIUX只读落地评审包已转固定uiux_visual并获ACK；root已准备自身独验记录与baseline，当前不占用GUI，保UI自测时段。仅记录实际回执，不将准备或ACK写成完成。

客户实施在途中明确强调：“我需要完全按照产品和Ui/ux的去实现”。本条收紧同一accepted V2的验收标准，不是新设计、无需重复客户确认：必须按规范及e95原型逐项视觉、结构与交互对齐，不能只改tokens或以功能测试通过代替设计落实。root将以真实桌面截图逐项对照，UI应交明确对应表：原型/规范项目、生产实际位置/尺寸/状态、截图及行为证据；任何未实现项不得隐去或自行简化。

重点核对原生产遗留结构：titlebar资料/设置、sidebar项目切换、header长提示，与V2导航底设置、会话头工作/资料、项目导航、报告分层与输入区的对应。由UIUX依据既accepted设计独立判断必要落地项并反馈UI整改，不由实现者静默保旧。保持真实数据/安全来源、原生窗口控件，原型演示条及硬编码假数据不迁生产，不引新业务/接口；真实数据长短/多角色差异需在既有设计规则中适配并说明，不能借此保留明显旧布局。只有实质新设计变更才另交客户决定，不把原V2遗漏实现重新当设计待定。

## 报告优先与同源原文呈现的证据边界

root反馈UIUX严格SV1–SV13已确认旧结构需完整替换，报告眉题来源→真实标题/任务报告→声明/未知，facts及来源动作位于完整展开前，独立工作概览不能用旧资料标题替代；仍保原生窗口控件。关联助手原文只能在实际report.source.turnId与真实assistant actualturn同源时考虑阅读折叠，不移序/删改正文，不从NLP猜，不折普通chat/未知legacy/tool/error/decision/terminal，保展开锚点。

UI实查live可信settled能证明终态，cold ReplayRow仅assistant actualturn/eventKind而无settled；报告来源同turn不等于Provider已结束。PM明确本轮不为纯display加Window/Core metadata。已向root给只读边界：cold完整记录如经UX裁定可按“本轮角色回复原文/展开”阅读折叠，但不得称结束/完成；live流中保持展开至实际settled。同源身份只是关联，折叠不创造终态事实。待UX同版具体裁定反馈UI，PM不代UX签设计意见，不重问已接受V2。

## 当前真实桌面进展与未闭首红

UI实际交付只改index/styles/renderer与renderer.test/uiux-v2，其余预约文件保原P1–P7字节；当前文字窄校正候选renderer5b80a727…/index7beda47c…/styles56d2ff9e…，前结构字节受控全组通过与当前静态67结果分别归因，不能混称当前全部回归。root独占真实GUI时UI不重启自测争抢。

root当前已实际验证导入/取消禁选、键盘Claude取消不改值、设置Tab约束/Esc回入口、role/engine草稿、普通chat/choice/队列保留撤回、普通report0、停止单终态/失效/草稿/后续发送。正式派发与Test输入/源报告/目标回交各1、npm31、4业务hash不变是已完成实际链，不等全部界面验收完成。

尚有明确首红：Test冷历史报告后“执行记录1条活动”出现无名generic“工具目标未记录调用发起”，实际Core/native只有10个有名call，UI多1条generic。首红由root保存在本轮独验newE/native-extra-tool-row-open-red-ax.txt，已交UI先静态定位；当前未认定根因，不以推测删除事件/按文案去重。若来源越UI边界，先证据交实际owner，不静默扩scope。修后新hash、受影响回归与root实际复验前，本实施保持未完成/未verified。已通过路径与此未闭缺陷分开记录，不重复请求已授权修复许可。

## 投递系统行伪工具根因与跨owner窄包

UI只读定位并root确认：Window emitDeliveryNote注释投递系统行却发kind=tool_call且无detail/turn/call，实际worker派发接收note经live进入UI，被isToolActivity无条件判工具而多出1generic；Core/native本身仅真实10call。不是模型重复执行或持久化重复，不能按文案吞掉。

PM已预留WINDOW-DELIVERY-NOTE-FIX-1给原Window：仅session.ts/既有owner测试/ownfix，优先复用message+detail.source='delivery-note'通用Desktop事件结构（须核actual类型），保完整summary，不造身份/phase、不改执行/ACK/queue/持久化、不增Model/API。UI配套窄包依实际source作为系统事实全文保留；旧匿名缺工具metadata的tool_call不编造调用统计/目标/phase，未知信息仍可达，真实legacy已知工具/可信metadata不回退。源与消费同版确认，strict实际dispatch note红绿，root真实原路径复验。包目前为ready，需root实际转发及ACK后记running；属既有用户owner修复授权，不重问客户或改accepted设计。

## Ghost修复实测与最后批次facts视觉项

Window/UI系统note窄包实际已交候选，UI已退出自测并发稳定重载信号。root在新独立V2-FIX-1任务真实验证：不是旧任务自动重试；派发1次，新source运行shell+submit共2call，累计12call=旧10+新2，2份sourceReports；typed投递提示全文可见，匿名“工具目标未记录”0，原模型上下文恢复。工具ghost执行事实已修复并验证，不等全部V2视觉验收完成。

UX严格比对root实际target received/batch截图，确认批次归属语义正确；仍有必要视觉对齐未闭：旧松散段落/左竖线receipt需改V2紧凑batch-level facts（dt11/dd13、gap12/24、上下14边界），仅用真实history/input/outcome字段，unknown/错误/retry保留，不伪造逐report投递事实，不强塞同帧或隐藏summary保护标志。root已按原scope交UI markup窄修，无Window/Model/API变化，不新增设计或重复确认。待自测串行时段、新hash与root最终960/内外阅读复验，整体仍未verified。

## SV13接收侧原文必要覆盖

UX依据root真实native-main-default-after-reload.png裁定：接收handback后的同receiver turn长assistant说明仍铺满，破坏已accepted报告优先。appendDelivery已有typed inputProvenance/inputPresentation与真实receiver turn可作关联，不需要借source report turn或新增API。root已将同scope必要补齐交UI：确切target turn助手正文原位details，中性标签“本轮回交处理回复原文（展开）”；cold按已有记录、live等真实settled，不暗示报告来源等于Provider完成，不折input/delivery/system/tool/error/terminal/无关普通chat。正文/顺序/flags/用户显式展开均保留，不引全局滚动新策略。

这是UIUX对既accepted SV13完整落实的独立意见，生产图producer=root，PM仅协调记录，不代签视觉亲测。batchfacts窄候选已热载，最终receiver fold仍待新字节/受影响复测；root继续960与内层阅读，未yield前UI只Node准备、不得争抢GUI。之后无需再运行模型，保留两次显式独立任务实际执行证据，最后重载检查fold/布局、候选hash与fullgate后方可收口。

## 冷来源报告顺序首红（未闭）

root在现有两次真实任务读取中发现cold source报告顺序反转：native-nested-960-close-ax.txt显示FIX1新08:46先于REAL1旧08:05，默认尾部落旧报告。源Provider按文件hash排序未承诺时序，UI冷payload.reports裸forEach追加，不能将wire顺序误作成果时间。当前仅确认显示读取缺陷，不重新运行模型或改报告文件。

root已按既有“最新成果”目标窄派UI：仅renderer冷payload.reports副本，在所有report.at均有效时稳定升序，等时稳定；任何未知/非法时间则保持wire顺序不猜。不重排原rows或实时事件，保ID/正文/去重，不新增API/后台/设计。原真实RED留档，待UI短专项及热载现有两报告验证、最终候选/fullgate，当前不封板。receiver SV13已属主自验候选ce182…不等此次新字节通过；后续manifest须准确叠加。


## 最终验收封板

PM已实读root[最终验证清单](../../../测试/docs/change/2026-10-15-visual-v2-implementation-evidence/final-verification.json)、[独立报告](../../../测试/docs/change/2026-10-15_change_visual-v2-independent-verification.md)与[UIUX最终严格回签](../../../UIUX设计师/docs/design/2026-10-15_design_visual-v2-implementation-review.md)。UIUX revision2按真实PNG/AX及源码关闭SV1–SV13，不冒称其本人操作GUI；产品贡献为既有静态评审，真实原生验收producer=root固定测试，PM为证据/范围审核。

最终renderer `5324b786162b46962d03ff698a3e562963df82c33b16c4a8dc177b39e253b4c3`，styles `df554f8760809edf09184a824876012cf0d41feadffc518dacb34c05573f7469`，index `7beda47c504c81ba8a7748b407eb60efc27ec531e936d93868a9480528514f00`，toolrows `a4d86a1c8c45a4c84ed9cd283596d164c63833849899bb05bfcbf0379901d4bd`，Window session `1e623ae7f71462d80bb69eb3e464a1bdd2dcb8c45b0907dc60646c9a6d749df1`。PM独立复算清单7个源hash全部匹配（含2个未改UI模块）；未再启动GUI/测试或改产品。

Node最终1385总=1384过/0失败/1个Windows-only用例在macOS合理跳过，exit0；typecheck/diff0，3个独立Electron脚本exit0，均为root实际执行。原生1360/960、modal/焦点/草稿/内外阅读、真实来源显选、报告顺序及source/receiver原文折叠完成；完整跨阶段路径与最终窄修按影响复测明确区分，不能声称所有场景最后字节重新从头执行。两任务REAL-1与FIX-1是显式独立任务：累计2派发/2worker输入/2报告/2 completed saved receipt，REAL-1 npm31过，12Core工具=12native工具，匿名额外工具0，su普通源报告0。没有为排序修复重跑模型。

严格相对本轮开始baseline仅5生产文件和9对应测试变化，旧未提交P1–P7成果保留；accepted V2原型/规范、r2冻结13件、真实.env、p-limit4业务、只读样本与pins均匹配。Window唯一跨前端源变化为已授权系统note假工具bug修复，既有通道typed来源、不新增Model/API/权限。源报告未知保存/验收信息不补猜；真实目标receipt保持batch级facts，不伪分每report。长实际报告/保护flags与批次facts允许滚动分视图，来源按钮在报告定位可见，不为同帧美化隐藏事实；这属于真实数据映射，无新增设计。

本次用户要求完全按产品与UIUX的accepted V2落地，严格清单和原生截图已回签，无未闭必要项。PM协调记录封板verified，历史首红/阶段未闭描述保留作审计，以本节为当前结论。线上覆盖Pi/原生macOS，不外推Claude/Codex在线、Windows读文档、屏读全部通过；已接受平台/数据/净化预算限制不变。不提交Git或推送，不新增后续范围。
