---
id: product-desktop-complete-walkthrough-20261015
type: design
title: 从发起工作到核对成果的真实桌面走查
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: designed
related: [engine-selector-product-brief, desktop-runtime-choice]
events:
  - date: "2026-10-15"
    kind: created
    summary: 产品独占真实Electron完成两阶段只读走查与真实选择路径
  - date: "2026-10-15"
    kind: designed
    summary: 第二轮独立实操复核v2修订闭合，推荐设计方向，接口前置仍保留
---

# 从发起工作到核对成果的真实桌面走查

用户想完整走过ANS的实际交互，再由产品与UI/UX设计改进并做可点击原型。本轮产品亲自用CUA操作真实Electron；先看已有工作，不发送新模型任务、不改源码或配置。重点建议先修“出了什么错”和“成果在哪里看”两条路径，再减少状态与记录噪声。此文是产品输入，实施需PM评审及客户确认具体设计。

## 实际范围与证据

- 2026-10-15，工作树HEAD `fca8f6b`。应用为仓库 `node_modules/electron/dist/Electron.app`，窗口“ANS 治理会话工作台”；初始1360×860，另实际拖到960×760，再恢复1360×860。
- 从 `/private/tmp/ans-real-p-limit-20261015-status-retest` Pi/su开始；实际切Claude、Codex、Pi，查看缺配和设置；通过真实macOS选目录切到 `/private/tmp/ans-real-p-limit-20261015-duplicate-retest`，分别打开su与测试历史。未运行npm test、未重新生成任务或报告。历史中的测试结论仅当内容观察，不是本角色验证结果。
- 第一阶段结束已向root明确释放控制权，停在duplicate项目/Pi/测试/抽屉关闭，窗口恢复原尺寸。
- 截图生产者全部是产品CUA；下面路径均为本机绝对路径。截图为真实应用，非HTML夹具。截图编号表达观察顺序，不冒称同一瞬间快照。

## 用户任务路径

| 用户要完成什么 | 实际走过 | 判断 |
| --- | --- | --- |
| 导入/切换已有项目 | 点击切换项目，macOS目录面板⌘⇧G指定duplicate-retest，打开后角色和项目刷新，再点su读取历史 | 可走通；本轮没验证导入失败或进行中切项目保护 |
| 选择引擎并处理缺配 | Pi开层↓/Esc保持Pi；选Claude，Tab到对应设置，Enter开抽屉；选Codex见缺配与开启失败，切回Pi正常 | 主恢复入口可走通；有文案及焦点问题P4/P5/P6 |
| 查看普通聊天 | status-retest su现有“普通聊天收到”与其前用户请求 | 可读；不重发消息 |
| 查看正式任务/派发/回交 | duplicate su任务、执行组、回交详情，再切测试看其真实执行历史 | 可查看历史；成果核对与诊断断点P1/P2/P3 |
| 查角色资料 | 角色资料→角色卡/文档，点击报告路径，Esc关闭 | 角色卡可读；路径无导航P3 |
| 窄窗与键盘 | 拖960宽、抽屉开合；选择器Esc、设置Tab/Enter/Esc | 基础可达；完整输入/待处理流程另补 |
| 未导入/运行中/队列/撤回/停止 | 当前没有未导入或运行中状态；无卸载项目入口，不删除持久配置造空态，不中断任务 | 未覆盖，不从源码或旧证据补签 |
| 确认预览/选择/定位 | root隔离普通聊天UX-WALK-1生成单次request_choice，产品第二阶段接入 | 已补单选与定位，最终提交/取消未执行；不能称完整验收 |

## 独立问题清单

严重度：P1为本轮优先设计、影响核对任务或恢复失败；P2为第二优先、增加困惑或操作负担。没有当前证据支持P0。问题均限定本次观察状态，历史数据能力不足不能从UI自动反推出某层代码有错。

| ID/级别 | 实际复现与事实 | 对用户的影响 | 建议与验收 |
| --- | --- | --- | --- |
| P1 失败无法诊断 / P1 | duplicate→测试，展开红色read_file失败卡：首行“read_file 执行失败”，次行“目标未记录”；展开正文仍是“read_file 执行失败”。[08截图](2026-10-15-desktop-walkthrough-evidence/08-tool-failure-expanded.png) | 用户看到失败却无法判断是什么、为何失败；必须读模型总结找ENOENT和路径。该例是预期失败，但它仍证明诊断展示不可用 | 失败首屏给可靠目标/原因，展开提供真实输入/错误；没有数据时诚实说未保存，不从附近聊天猜目标。用此真实历史与新的受控失败分别验收，区分旧记录缺信息与新事件缺展示 |
| P2 执行记录看不出做了什么 / P1 | 同角色展开12条执行组，显示run_shell/目标未记录/调用发起或执行完成；ISO时间在窄列拆为多行。[09截图](2026-10-15-desktop-walkthrough-evidence/09-execution-history.png) | 想核对“两次node -v、npm test”等行为时，12条活动难以读成实际工作；首末配对与输出无从查证 | 按真实调用身份聚合一次调用的开始/结果，优先命令或文件、退出/原因，短时间可扫读、全文可得。不能按同文或邻近顺序猜配对；无身份保留原记录。此历史不能伪造命令，旧数据缺口明确 |
| P3 成果路径不能阅读 / P1 | su回交详情产物路径是普通文字；测试→资料→文档6，点击docs/change/dup-fresh-3.md后仍原界面，AX是文本无链接。列表还把docs/change/目录算一项。[07](2026-10-15-desktop-walkthrough-evidence/07-handback-expanded.png)、[10](2026-10-15-desktop-walkthrough-evidence/10-document-list-no-navigation.png) | 用户完成“收到报告”却还得离开ANS自己找文件，无法就地核对全文 | 在已允许且确实存在的项目文档上提供明确打开/阅读入口，保持返回上下文与阅读位置；目录与文件区分。只读预览不等于新写权，路径越界/不存在有明示失败。该能力需桌面窗口契约评估，不承诺仅CSS可做 |
| P4 回交详情泄露内部工作指令 / P2 | 展开su回交卡，原始[回交]文本的completed、任务关联未知与大段“请验收…不要把会话结束…授权范围…”内部交接说明一同展示；报告与解释长段同层。[07截图](2026-10-15-desktop-walkthrough-evidence/07-handback-expanded.png) | 用户需要结果/证据/待办，却读到面向模型的行为指令；不知道哪部分是成果 | 默认摘要优先来源、真实结论、产物、证据和未完成；原文放“原始交接内容”按需展开。未知关联诚实保留，禁止按某报告标题推成已收齐或全部完成；“已回交”不等于“已验收” |
| P5 空态与恢复提示混淆 / P2 | Claude空白会话有“新会话…以上为历史记录”但没有历史；Pi切回后又追加一条“已从本地会话文件恢复”，与已有同句重复。[03截图](2026-10-15-desktop-walkthrough-evidence/03-claude-missing.png)、本轮切回AX记录 | 用户难知道“当前模型记得什么”，相同提示随切换堆积成聊天内容 | 当前上下文状态在固定状态区域准确表达；无历史不说“以上”；重复恢复不新增噪声。历史事件仍可溯源，不能抹去真正不同的恢复/失败；用空新会话与Pi↔Claude重复切换验收 |
| P6 缺配恢复后焦点跳到另一入口 / P2 | Claude引擎触发器Tab→打开Claude设置→Return→抽屉→Escape，焦点回右上角Claude设置，而非主条发起按钮。角色资料Esc正确回资料入口。[04截图](2026-10-15-desktop-walkthrough-evidence/04-settings-missing.png)及实际AX焦点观察 | 键盘用户退出后跳离原来的恢复路径，需要重新定位 | 记录实际发起入口，关闭回该入口；入口已消失才使用稳定备选。三种设置打开路径与保存后主条消失分别验收 |

P1/P2/P3是下一版原型的核心任务路径；P4/P5/P6建议同版作为这些路径的必要表达与焦点细节，不扩张成项目管理平台、模型/账号管理或新通知中心。

## 证据文件（绝对路径）

```text
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/01-current-chat.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/02-role-drawer.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/03-claude-missing.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/04-settings-missing.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/05-codex-missing-failure.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/06-task-history-bottom.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/07-handback-expanded.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/08-tool-failure-expanded.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/09-execution-history.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/10-document-list-no-navigation.png
/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/11-narrow-drawer.png
```

## 真实待选择补查（第二阶段，仍属首轮观察）

root亲自只发送UX-WALK-1普通聊天，使su调用一次request_choice（“选择查看方式”；查看摘要/查看完整记录），无文件写入/派发/报告。**状态生产者=root；以下界面操作生产者=产品。** 产品未提交最终决定或取消，也未停止该轮。

1. 初始两个radio未选，提交禁用；点击摘要后提交启用；↓改到完整记录、Tab到提交。临时改选没有把轮次结束，角色一直“等待你确认”。
2. 打开资料抽屉，卡部分被覆盖，右侧仍“无进行中或排队消息”。全局“有1条待确认·定位”一直可见；点击后关抽屉、卷动到卡并将焦点放卡容器，下一Tab进入已选radio。主恢复路径可用，不把覆盖本身认定成卡丢失。
3. 真窗口1360×860拖到960×760后，卡在composer下方仅露标题；再次点击定位后完整卡、radio、提交与取消全部可见。窗口恢复1360×860后释放给UI/UX，选项暂留完整记录（未决定），抽屉关闭。

**P7 / P2（信息一致性）**：在等待选择时角色树/主区pill都指出待确认，资料抽屉只有“无进行中或排队消息”，没有说明该待确认。正式任务队列为空与普通聊天等待选择可以同时成立，不能把这句话直接当队列数据错误；建议资料顶部准确区分“待确认1”和“无排队消息”，并有定位入口，避免“含待办/队列”的入口漏掉当前唯一需要用户动作的事。验收应分别覆盖普通聊天确认与正式任务确认，队列数不以确认数代替。

确认预览的写入差异/审批内容、最终决定后的受理/失败恢复仍未覆盖：本次仅request_choice，没有request_confirmation权限审批。不为补齐表格而代点批准。新增截图：

- [12 初始选择卡](2026-10-15-desktop-walkthrough-evidence/12-choice-initial.png)
- [13 等待中资料抽屉](2026-10-15-desktop-walkthrough-evidence/13-pending-drawer.png)
- [14 缩窗后卡在输入区以下](2026-10-15-desktop-walkthrough-evidence/14-narrow-choice-located.png)（文件名沿采集名，图中未再次定位）
- [15 窄窗定位后的完整卡](2026-10-15-desktop-walkthrough-evidence/15-narrow-choice-after-locate.png)

绝对目录均为 `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/角色卡/产品/docs/design/2026-10-15-desktop-walkthrough-evidence/`；与上述文件名拼接即实际绝对路径。

## 下一步与边界

安全pending第二阶段已补查并明确释放真实窗口给UI/UX，进入其独立走查与可点击原型。产品第二轮只审实际原型及证据，PM主持并评估跨角色影响。全程未改app/src/test、未保存.env、未提交确认决定/消息、未停止任务；切引擎与角色会自然请求已有会话的读取/恢复，不把这一过程声称完全没有运行时副作用。


## 第二轮：具体原型评审（v2收口）

参评具体件为UI/UX [完整流程规范](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)及同目录HTML。产品另开独立IAB标签亲手操作本地原型，没有再操作用户Electron。本轮先读revision1，后等待设计师同轮revision2有限修正，不新增第三轮议题。

### 已亲手走通的模拟路径

- 普通聊天待选择：两radio未选、提交禁用；资料将待处理1与当前工作/队列0分开；定位关闭抽屉并聚焦原卡，下一Tab到radio，↓改选后Tab到提交；点取消后“已取消选择”，没有派发。许可确认是另一演示场景，不能冒充本轮真实request_choice。
- 回交：默认来源/摘要/产物与内部原文分层；展开原始交接内容能读到原指令；阅读报告后Esc回原阅读按钮。报告读取失败保留卡和原路径，能重试、关闭仍回入口；不冒称原型读了真实磁盘。
- 资料：文档1个文件与目录分别显示，阅读后“返回角色资料”保留文档展开、焦点回阅读文档按钮。
- 执行与失败：3次调用与开始/结果可分辨，node -v详情有真实含义的演示字段；npm test失败展开给command/exit/stderr演示。停止进入stopping等待收尾、按钮禁重复停止，原草稿与队列1保留，没有直接宣布完成。

### 本轮实际发现的修订

| 反馈 | 实际复现 | 修订要求与当前状态 |
| --- | --- | --- |
| R1 草稿被填入操作覆盖 | failure→草稿“保留我的原草稿，不要覆盖。”→填写后续消息，原内容被预设句替代；[实际原型图16](2026-10-15-desktop-walkthrough-evidence/16-prototype-draft-overwrite.png) | 仅空草稿填示例，已有内容只聚焦；设计师同轮v2已修，产品reload后非空只聚焦/空才填两分支亲测闭合 |
| R2 保存配置重置已开聊天 | chat→草稿→右上设置填演示必填→模拟保存，界面变ready、聊天隐去、role未开、输入禁用 | 缺配尚未开会话才进ready；已开聊天/待选择/工作状态保留，应用时点仍服从既有真实metadata；设计师同轮v2已修，产品分别亲测chat和choice保存保原状态/草稿/请求闭合 |
| 阅读保持 | 展开运行组/node-v详情后点停止，旧原型整chat render使详情收起 | v2停止后原组与node-v详情仍展开、草稿保留；产品亲测open状态闭合。本角色未比较精确滚动像素，相关读数是UIUX自身记录 |

### 属主评估对产品承诺的约束

已读[窗口](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-window-assessment.md)、[UI](../../../桌面UI/docs/design/2026-10-15_design_complete-flow-ui-assessment.md)、[运行时核心](../../../运行时核心/docs/design/2026-10-15_design_complete-flow-core-assessment.md)、[编排](../../../编排/docs/design/2026-10-15_design_complete-flow-orchestration-assessment.md)独立只读评估。产品认可其边界：P1/P2的新真实输入/结果/退出与历史透传需源端统一可选字段、有界展示与进入持久化前的敏感处理；旧缺字段只说未保存。P3没有现成受限读正文API，evidence字符串不是可读授权。P4需真实typed报告/投递关联与源/接收scope持久合同；原文前缀和completed不能证明正式报告或已验收。P5当前状态可以固定呈现，但不同真实重开/恢复事件不能按同文抹掉；P6/P7可复用既有请求与invoker状态，选择/确认与队列各自计数。

以上都是实施前置，不因产品推荐设计或原型按钮可点而自动完成。客户确认设计之后，仍需PM协调对应属主冻结合同、边界、失败策略和验证范围，再执行被授权的实现。


### 最终唯一结论

**recommend approval（仅设计方向，revision2）。无剩余产品方向阻塞项。** 原型让失败有可核对的信息、成果有阅读出口、待选择与队列分别表达，且保留聊天工作台。第二轮两条实质修订和阅读保持反馈均在同轮实操闭合，没有用“设计师已接受”替代验修。

最终具体件本机复核：

- UI/UX规范revision2：SHA-256 `3143a45ee2c434b69dfbf52958466868578d3c47576e9d56a117005b92038a67`。
- 最终HTML v2：SHA-256 `0ea73a24312def8e0f7c237bd5c6ff22fde1c8961c5b69f62af845054babd95a`。
- 产品独立IAB执行reload后检查，最后关闭自身临时原型标签，不再碰真实ANS。最终版实际复核范围为：960×620未选禁提交/侧栏“待选择”/待处理与queue0分开/定位后Tab与↓改选；choice保存配置保原请求/已选完整记录/草稿，chat保存保原普通聊天/草稿及输入发送启用；失败后续填入非空保护和空草稿才填；停止等待收尾且停止按钮禁用、组与node-v详情展开/草稿保留；legacy诚实未保存；报告标签“报告声明：已完成”并仍等主入口核对。
- 本角色v2自有原型截图：[17 窄窗选择](2026-10-15-desktop-walkthrough-evidence/17-prototype-v2-choice-960.png)、[18 空草稿才填](2026-10-15-desktop-walkthrough-evidence/18-prototype-v2-empty-suggestion.png)、[19 报告声明](2026-10-15-desktop-walkthrough-evidence/19-prototype-v2-report-960.png)。均为原型，不与01–15真实Electron混记；16是修前问题证据。19张PNG总量包含15真机与4原型。

P1–P7规格覆盖不等于本角色把全部正式业务测试了一遍：报告阅读/读取失败/返回invoker、资料文件计数/返回保展开、choice取消等先在本轮revision1原型实操，最终reload只复核上述受影响路径与具体标签，未逐项重跑所有前序操作。两轮都没有操作真实文件接口、模拟以外的配置写入或权限批准。权限卡仅独立演示，不能以其通用“同意”替代既有shell/治理专属决定契约。

未覆盖项如实保留：最终生产实现、真实文件读取/错误/符号链接/越界限制、typed源/接收持久和回放、新字段敏感处理/大小预算、全引擎真实诊断、最终选择的真实受理/拒绝/过期、真实运行队列撤回与停止、附件/IME/屏读软件，以及精确滚动像素与所有极端视口。这些不靠原型绿勾补签。

PM应把本结论与UIUX/各属主评估共同提交客户。客户确认此设计不自动冻结P1/P2/P3/P4接口或授权未写清的跨层实现；先完成被接受范围内的合同/失败策略/边界评审，再按授权实施。本记录没有新选装、没有新增生产权限，也不是已实施验收结论。


## 接口方案补充：先查看来源角色文档，再由用户选文件

本节是客户已确认UX v2后的P3/P4接口取舍短评，不是第三轮原型重做。只读核对上文P3目标、UX v2“仅对窗口确认已列可读引用给阅读入口”的约束，以及[窗口B revision2回签](../../../桌面窗口/docs/design/2026-10-15_design_restricted-document-read.md#r2-回签p3查看来源角色文档的最小入口)。本轮没有操作桌面/原型、读取项目正文或修改生产/测试。

**产品建议：recommend approval，推荐该最小方案，无须本版新增typed artifact字段。** P3的必要目标是用户不离开ANS即可找到并阅读可读的成果文档；可信来源角色→权威已列文档→用户明确选择→只读正文，能满足这一层目标。它比准确直达报告多一步选择，不能冒称已经知道哪个文件就是这次报告。当前C只有summary/evidence文字，没有可信报告文件ref；把“阅读报告”继续做成准确直达会产生错误承诺。不能抽evidence路径赋读取资格，也不能自动挑列表首项作为报告。

建议必要交互口径：

- 回交卡改为**“查看来源角色文档”**，卡上清楚写来源角色名；进入列表标题如“测试的文档”，说明“请选择要阅读的文件；尚未关联到本次报告”。保留回交摘要和证据原文作比对，但不把普通evidence字符串变成文件链接或默认选择。
- 只依据当前可信sourceRoleId定位已导入项目的该角色RoleView.documents。浏览来源资料不等于切换聊天角色：保留原su/引擎、聊天阅读位置、草稿和待处理，不因此开启该角色会话或投递消息。
- 列表中用户显式选已签发documentRef才读；目录仍标目录，不算文件。正文标真实文件名/相对路径/来源，不能无来源地冠为“本次报告全文”。正文返回此列表并保留位置，列表关闭/返回回到原回交卡入口；读取失败保留所选文件与原回交上下文，不能悄悄换另一文件。
- 未知来源或来源不属于当前listing：就地说明“无法定位来源角色的文档”；已知来源但无可读refs：说明“来源角色暂无已列可读文档”。不放假可用入口，不从标题、邻近聊天或证据句猜来源。平台不支持或未获得原生导入grant属于不同原因，不能统一误称无文档。
- 初次使用已有listing；本版无需新list API/自动轮询。若使用现有显式项目刷新，必须保持原阅读/聊天上下文并撤销失效refs；接口副作用不能用“只刷新列表”掩盖。没有可信授权时只给解释与原生重新选择入口，不用renderer传root补grant。

typed artifact可在未来出现明确“必须直接打开这份报告”的需求时单独评审，此次不因原型存在一键演示就把它变成必加schema，也不预先引入选装项。本最小方案仍有可见能力差距：用户自己识别文件，索引未列/旧数据无ref的报告暂不能读。PM必须把此变化明确给客户确认，不能沿用v2的一键“阅读报告”演示声称已被原确认覆盖。

### 客户必须显式知晓的范围

1. **Windows暂不支持本版应用内文档读取**；首版仅在经验证的macOS/Linux本地文件系统且所需文件身份/O_NOFOLLOW能力可用时启用。网络/特殊挂载能力不足也明确拒读，不回退任意路径读取。
2. **应用重启后需要再次通过原生目录选择启用阅读**。旧项目/角色索引能显示，不等于读取grant仍存在；提示“重新选择当前项目以启用文档阅读”，复用真实系统选择，不能把恢复root或普通刷新当授权。
3. **支持可信本地项目，不提供恶意本地进程隔离保证**。Node通用fs的检查不能严密防恶意祖先目录瞬时替换/恢复、同inode改写伪时戳或硬链接来源；若客户要求对抗该威胁，当前方案不足，需要另审原生目录句柄/平台沙箱及成本和属主。
4. 首批只读已列UTF-8 md/txt、最多256KiB；未列、目录、超限/不支持/无权限/失效引用如实失败，不把它们包装成“报告已打开”。这些是实质产品限制，不能藏在实现细节。

PM客户简报可以概括为：**“回交卡先打开来源角色的文档列表，由你选文件在ANS内阅读；这版不自动认定哪个文件是报告。Windows暂不可读，重启后需重新选项目，首版面向可信本地项目。”** 本产品短评只推荐这一具体接口交互取舍；客户对该变化、平台范围与读取威胁边界的确认仍由PM记录，不替代Governance职责/写集前置或实施验证。
