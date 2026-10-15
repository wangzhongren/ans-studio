---
id: desktop-visual-v2-implementation
type: change
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 按已接受V2统一阅读与辅助资料层级

客户已确认UIUX V2并明确实施，PM授权UI-VISUAL-V2-1，固定桌面UI。只改packet指定6源/5测试及own非冻结文档，保留现有394候选全部未提交P1P7成果，不reset/clean/提交推送。原型e95b363d、规范25474437复算一致，批准13件不改。

实际接线：导航208/176、阅读最大800、统一字阶/32px控件；真实report summary确定性预览，完整安全摘要与证据独立展开，失败/unknown/净化/截断/事实首层保留；424模态抽屉使背景inert并约束Tab/Esc，关闭回实际invoker，保原草稿/聊天及资料内外阅读；任务原文只在同实际turn结构化报告关联后默认折叠，普通chat不升级报告，不重排时间线、不另调模型摘要或改r2预算。

源仍消费现有preload真实事实，无后端/Model/API/权限变更。基线见visual-v2-implementation-evidence/baseline.json；后续红绿/实际字节与双宽图逐项归档，受控renderer不替root原生验收。


## 实际交付与设计核对

当前只实际改index.html/styles.css/renderer.js及renderer.test.ts/e2e/uiux-v2.mjs；指定另3源/另3测试保基线字节。整个工作区原未提交P1P7完整保留，未reset/clean/提交推送，未改后端、Model、adapter、env、目标项目或冻结设计。完整前后hash及设计/依赖指纹见[manifest](2026-10-15-visual-v2-implementation-evidence/manifest.json)、[基线](2026-10-15-visual-v2-implementation-evidence/baseline.json)。

首轮只调tokens未完成结构，root/UX严格指出4项差距，未作为最终候选；其后落实导航品牌/紧凑项目/底部入口、头部身份/右侧动作、上下输入、浅绿report-top分层。UX再指出重复主入口第三行及旧资料列表，已移除可见重复但保真实primary与accessible说明；共享抽屉标题18px、浅底来源说明、左名称路径/右描边32px阅读行均落地。[逐项实际对照](2026-10-15_visual-v2-design-alignment.md)与[UX独立review](../../../UIUX设计师/docs/design/2026-10-15_design_visual-v2-implementation-review.md)保留各阶段事实，不改accepted e95/2547基线。

- 工作概览独立于角色资料，不是旧混排改标题。actual pending/queue按来源与kind分开；当前scope自己的报告与已实际收到的safe structured reports均可见，同reportId只在概览去重，不删真实不同delivery attempt。普通聊天无报告明确空态。不从DOM或自然语言猜内容/身份，不新造API。
- 源报告及主入口received报告复用report-top/body；来源/真实origin眉题→可靠标题缺失时“任务报告”→声明/任务未知；原summary确定性180码点/最多4行预览，完整可用安全summary/evidence独立展开。真实净化/截断/省略保持首层，source只存储和未验收两项可知facts，不凑原型4格。target处理/保存回执在batch层、每份报告不伪造此事实；已知outcome按真实enum转中文，未知值保未知，不从stdout造通过数。
- 任务请求只在actual source-turn与canonical用户输入精确关联后原位折叠。SV13角色回复：cold可靠同turn非活动文本可用中性“本轮角色回复原文（展开）”；live流中不折，只有真实settled可核后才折同turn，后到同turn亦依真实已收尾事实。原文/行序/锚点/显式open和投影flags保留，不称Provider完成/预算外全文；无可信turn legacy或无报告普通chat不猜不折，工具/错误/决定/终态不藏。
- 424模态复用资料层，背景导航/会话inert，Tab双向约束/Esc回实际入口；真实系统窗口控件保留不inert，受控preload三操作均有调用断言。内外scroll、展开、草稿、source文档显选与实际scope继续保护。引擎32px触发器/180px右对齐菜单沿既有公开placement夹取/翻转，不写readonly selector模块、不复制其viewport算法。

## 首红与纠正

原始日志均保留于本轮evidence：

1. unit-first-red为Markdown源码构造守卫，原inline reportText表达式改为full/preview变量；修守卫同时严格核预览和完整副本均走原Md，证据仍逐条esc，未放宽XSS或业务要求。
2. unit-structure-first-red含旧设置位置/旧快捷键文案/旧头部禁止新增动作/旧card角标构造。按accepted V2定位、工作概览源计数、上输入/下动作迁移；旧受理、边界、图片、ACK/client/turn、三phase、失效与停止断言不删。
3. visual-first-red是普通Markdown段末换行的测试精确比较setup，修为仅trim段末；task actualturn/普通chat不升级断言仍严格。visual-geometry-red为实际960列宽被10px既有scrollbar挤窄，修稳定沟槽补偿，阅读与输入两档同宽同位置。
4. consumer/full结构首红为旧“.msg-handback > button”与work里角色details混排定位；按真实新入口选择，并分别实际验证work全文/独立资料展开、快照、往返、草稿、撤回与焦点，不放松业务。full从98增至99记录。
5. selector旧Tab直接到缺配按钮及28/160视觉值首红，按V2自然顺序work→资料→缺配保取消不提交与键盘可达，ShiftTab到导航设置；32/180/right alignment及原viewport/长名称/当前项no-op等全保。selector从25增至26记录。未通过拉长timeout/删assert/隐藏错误解决。

## 结构冻结字节与受控验证（文案修正前）

index `bb5c29a5…` / styles `56d2ff9e…` / renderer `b5cf95d7…`。Node24.14.0，Darwin arm64；真实受控Electron44.7.0/内置Node24.21.0，真实renderer/preload配离线IPC替身，临时profile，不碰root真实app。

| 实际命令/模式 | 当前最终字节结果 |
| --- | --- |
| node --test test/桌面应用/{tool-rows,runtime-ui,renderer,markdown}.test.ts | 67/67，0fail/skip，exit0 |
| ANS_VISUAL_V2_UI_ONLY=1 | 28记录，含模态Tab/Esc/inert、真实summary、SV13live/cold/展开、source/received/batch、独立work实际报告身份、原生三控件IPC、双宽几何与2个测量快照，exit0 |
| 无专项变量 / ANS_COMPLETE_FLOW_UI_ONLY | full99 / consumer41，exit0 |
| ANS_SELECTOR_UI_ONLY / ANS_CONFIG_UI_ONLY / ANS_RUNTIME_UI_ONLY | 26 / 20 / 16记录，exit0 |
| ANS_ROLE_RETURN_FOCUS_UI_ONLY / ANS_PROJECT_RESET_UI_ONLY / ANS_FRESH_CONTEXT_UI_ONLY | nested11 / project7 / fresh4，exit0 |
| ANS_TERMINAL_UI_ONLY / ANS_TERMINAL_MERGE_UI_ONLY / ANS_SEND_FACTS_UI_ONLY | 10 / 12 / 8，exit0 |
| ANS_DUP_UI_ONLY / ANS_MERGE_UI_ONLY | 32 / 12，exit0 |
| 原ime-enter.mjs（未改） | 26true及E2E_DONE=1，exit0；原fixture缺runtime-config:get的caught warning明确保留，不用它证明配置能力 |
| npm run typecheck / git diff --check | 0 / 0 |

除IME外所有Electron命令均为指定模式加`ANS_UIUX_OUTDIR=<独立临时目录> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs`。记录数不冒充独立case数，manifest逐项列布尔/测量快照。配置/撤回失败为主动负例，不吞renderer console异常，所有成功报告false=0。

实际1360导航208/阅读800/输入800，source CTA bottom584.70小于composer top694.41；960导航176/阅读736/输入736，source CTA bottom606.20小于composer top698.41。有效受控图：[1360](2026-10-15-visual-v2-implementation-evidence/visual-v2-1360.png)、[960](2026-10-15-visual-v2-implementation-evidence/visual-v2-960.png)、[宽抽屉](2026-10-15-visual-v2-implementation-evidence/visual-v2-drawer-1360.png)、[窄抽屉](2026-10-15-visual-v2-implementation-evidence/visual-v2-drawer-960.png)。owner实际看图，UX独立看图/静态比对后认为主结构对齐且此前两项视觉差距关闭，不代签其GUI。

**明确排除**：唯一controlled received PNG被UX识别为抽屉clip/虚拟滚动中间帧、receipt未入画，原样保为excluded-intermediate-received-960.png，不作为received布局通过证据。该路径只有真实structured字段/DOM/0prompt等受控断言通过；最终received布局必须由root另采稳定原生图，不能由其DOM断言代签。

## 交接与限度

全部自测Electron app.quit/exit0后已明确向root释放GUI并发送稳定hash，随后仅own docs归档，未再启Electron或静默改源。13件批准资料、e95/2547设计与48实际后台依赖hash均无差异。这里只证明当前消费者与受控布局/交互，不证明真实Provider调用次数、磁盘/平台权限或线上模型。root将在此最终字节独立Node/探针与真实桌面完整验证；当前状态implemented-unverified，不提前签全链验收或把旧394/efd native结果冒签到本V2。


## 原生空态指路首红的三字符串修正

root以真实新单进程重载bb5/b5后、未导入未发模型，发现初始空态仍指“右上角设置”，保native-before-import-guidance-red-ax.txt。root授权先只改该一句，之后授权同类两处“右上角图标”文字，且要求独占GUI、禁止再启Electron。按此仅改字符串：设置指向左下角；无角色资料提示明确先在左侧选角色，再用会话头文字入口“角色资料/工作概览”。历史注释按指令不改，无行为/样式/接口变更。

最终index `7beda47c504c81ba8a7748b407eb60efc27ec531e936d93868a9480528514f00`，renderer `5b80a72796e4e8cff369a378deb96ca1c5bc6d1dcabe92adf6bef1dc0f8b3b13`；styles56d2ff9e和另外3源保持结构冻结。当前静态unit67/67、node --check、diff0；原完整controlled suites和双宽图准确保其bb5/b5执行hash，仅按“三文字位置修正”说明适用性，不冒记新hash已重跑。root收到最终两hash后独立reload继续原生验收，未由owner代签。详见[窄修记录](../fix/2026-10-15_fix_visual-v2-guidance.md)。
