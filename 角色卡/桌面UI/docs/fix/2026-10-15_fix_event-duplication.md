---
id: desktop-event-duplication
type: fix
title: 工具调用与输入回交的重复展示身份修复
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: implemented-unverified
revision: 2
---

# 同一次调用或投递只展示一次

客户在实际 p-limit 工作台看到 `dispatch_task · 调用发起`、`request_confirmation` 提示连续出现两次，并要求核查其它工具与回交投递。本角色固定为桌面UI，前阶段只读源码与 native/replay并写自身草案；现按客户“核查所有都修复”的既有合同纠错授权、PM统一r1与root的UI r2实施指令完成本侧实现及回归。客户授权不记录成对本新文档逐字确认。本侧未操作用户 ANS 窗口。现有功能：[桌面引擎会话](../feature/runtime-choice.md)。

## 可核对证据与根因

只读项目 `/private/tmp/ans-real-p-limit-20261014/.ans/sessions/*/pi/`，自身[按角色与工具计数](2026-10-15-event-duplication-evidence/source-counts.json)记录路径、SHA-256及计数，不复制正文/凭据。su native dispatch_task 7 次，对应 replay tool_call 14 条；request_confirmation 5/10，read_file 18/36，write_file 19/38。维护、测试、项目管理的 read_file/edit_file/write_file/run_shell/submit_report 同样两倍，每个 native 调用对应一条缺 toolCallId 的 start。真实已出现工具全集为 read_file、write_file、edit_file、run_shell、request_confirmation、dispatch_task、submit_report；request_choice/report_shell_verdict 虽本次未出现，仍按同一泛工具路径验收，不只给两个工具打补丁。

例如 dispatch 真实 turn `10acf64a-2881-4b4d-8a54-02f96506561f` 在14:46:48.490Z记录“开始执行 dispatch_task”，detail.toolCallId=`call_00_sDuuzBPdSa2fdwXZEj4P5336`；.491Z另记录“模型请求调用 dispatch_task”，同turn却没有callId。Core属主只读追踪确认 Pi `tool_call` hook 与 execution_start 两个生产点，Core会话只转发一次；native调用计数不支持“两次实际handler”的判断。修复生产源属 Pi/Core协作，不归本角色。缺ID旧行不能仅因正文类似而由UI猜成同一次调用。

`renderer.js::appendActivity` 当前的 callId 仅用于目标继承，未用于幂等登记；普通工具每条push到activity items，SPECIAL_TOOLS barrier每条直接建立sysRow。即便两start后来都拥有callId，UI仍会显示两条。`runtime-ui.js::replayKey` 仅按turn/eventKind/全文与出现次数对照live/history，缺少工具call/phase语义，两个start摘要不同会视为两个独立事件。

Window独立核对维护报告投递：su replay仅一条user，at=`2026-10-14T14:49:04.645Z`，turn=`ffda1878-902f-44f7-870a-331d63a725a8`；其后.647Z一条message“用户指令：[回交] …”，native仅一条user。原备份见[真实回交证据](../../../测试/docs/change/2026-10-14-p-limit-real-code-evidence/su-received-reports.json)。UI `appendInjectedMessage` 收实时message，token类别为message；`appendReplayRow` 收历史user，token类别为user。`preserveUncoveredRows` 保留未被history token覆盖的live injected，再建立history user，故同一投递出现两份；不是已证明的两次send。

交互卡 `appendOperatorRequest` 已按 requestId 幂等，但request tool barrier/plain摘要不会与卡片共享表示身份；需核对已确认的 callId/requestId对应后才可把同一个请求的重复提示整合。不能将同标题的新请求误认旧卡。恢复说明 `showSessionContext` 当前token只是contextSource/warning，onRoleState与open结果均调用；文字token不是会话生命周期身份。该分支为待明确归因的检查项，本侧尚无独立native证据证明恢复动作真的发生两次。

## 最小跨角色契约与UI方案

1. Pi每个真实SDK execution_start仅生产一个canonical tool_call，顶层真实turnId、detail.toolCallId及detail.phase=`start`；治理拒绝为`blocked`，SDK终局为`result`。Core转发保真，Window历史保留同样metadata。UI统一使用项目/角色/runtime/顶层turnId/toolCallId/phase定位工具可见行；Pi新phase按原值，其他既有适配器仅按事件kind映射阶段（tool_call→start、accepted→result、denied→blocked），不按摘要猜。重复同身份同阶段合并，同call的blocked/result分别保留，不以callId一刀切；失败/拒绝信息不能被重复成功降级。不同turn/call的同文真实调用分别可见。顶层与嵌套turn冲突不能以旧嵌套字段覆盖真实top身份。
2. Core唯一生产输入回显 `message.detail: PromptInputEventDetail {source:'prompt-input',text:string,imageCount?:number}`，顶层actual turn/runtime/role。Pi注入路径不再自发旧echo，standalone/helper保留同typed来源兼容。Window r2 明确 `ReplayRow.input?:PromptInputEventDetail`，typed echo规范为kind=user，同scope/actualturn的persisted user与echo优先保留原user正文/at并合入input元数据；不改审计原日志。UI仅对显式typed来源使用detail.text显示，可信输入使用scope+actualturn+规范`user`类别身份（不以摘要/正文作身份），history user同类，live/history两向覆盖一份；普通assistant/message即使正文以“用户指令：”或“[回交]”开头也不转为typed输入。图片只记数量、原图引用不重建，客户clientMessageId/ACK仍来自原发送闭包，已绑定actualturn的本端气泡与该输入表示合并；同文不同turn/真实投递分别保留。缺actualturn或来源的legacy不按正文猜身份。
3. Core `CustomerInputMetadata.toolCallId?:string`携带确认/选择handler入口原callId；Window `OperatorRequestPayload`透传可选真实toolCallId/turnId，原随机requestId仅作作答关联。UI用项目/role/runtime/turn/call匹配工具生命周期与卡片，再以requestId保持卡DOM/决定/失效幂等。SPECIAL_TOOLS全部适用工具阶段登记；确认/选择的plain生命周期摘要与实际卡在可信匹配后只保留一份生命周期表示，结果/失败状态仍准确可见，不吞结果。工具先到与卡先到均处理，原锚点、旧决定及后台指针保留；同标题新call或新request不得合并，缺metadata按原显示保留，不将random requestId当callId。
4. 恢复提示：本批保留现 `showSessionContext` 的contextSource/warning token幂等，不新增sessionInstanceId或其它生命周期API。此前Window评估的sessionInstanceId只是候选，当前无同handle真实重复实证，不自动纳入实施。如果后续取得相同handle重复提示的原始证据，另提最小修复供PM审核；profileRevision/nativeSessionId/正文都不能冒充会话生命周期。此检查不阻塞已证实工具与输入修复。
5. 历史兼容：原始native/replay不改写；有新可信call/phase或typed输入身份时走新幂等路径，缺身份旧记录维持事实，不根据“开始执行/模型请求调用”、标题、正文、时间窗或最近调用猜删。不为消除旧双行重写审计或补造callId。既有全文+出现次数规则仅用于原legacy兼容，不作为新事件身份。旧p-limit记录仍可解释其双生产来源，但不能承诺缺ID旧start自动消失。

本r2精确对齐[Core v2](../../../运行时核心/docs/fix/2026-10-15_fix_run-shell-description.md)、[Window r2](../../../桌面窗口/docs/fix/2026-10-15_fix_duplicate-display-identity.md)与[PM统一审核r1](../../../项目管理/docs/fix/2026-10-15_fix_duplicate-event-integration-review.md)，已由root冻结并派发本侧实施；UI不修改生产源或窗口。没有文本隐藏、超时窗猜重、工具黑名单或吞失败的选装增强。

## 本角色拟修改与必测

仅允许 `app/renderer/renderer.js`（工具/typed输入/交互行登记、回放覆盖和锚点保真；恢复提示API不改）、`tool-rows.js`/`runtime-ui.js`（可信identity与phase的纯展示映射），必要时同目录纯展示helper；测试只 `test/桌面应用/tool-rows.test.ts`、`runtime-ui.test.ts`、`renderer.test.ts`、`e2e/uiux-v2.mjs`。自身本记录、相关feature/docs证据同步。UI不改Window、Model、Pi、runtime或配置/.env，不以本草案新增跨角色字段写权限。

验收集合：真实七工具和未出现的两特殊工具逐个跑same-identity双start/单result、重复result保真、不同call同文、不同turn同call文本、缺ID不猜重、失败/拒绝优先；交互卡两个到达顺序、同标题不同request、重复广播、后台隔离、失效、原决定与full-replay锚点；维护报告原turn输入的live/history两向、append/full/growth、同文两次真实投递、普通客户输入/图片/clientMessageId；现有恢复说明幂等回归（不新增生命周期API）。读者上翻/贴底、窗口化行计数、工具展开状态、原确认DOM均需回归。

预定命令：`node --test test/桌面应用/tool-rows.test.ts test/桌面应用/runtime-ui.test.ts test/桌面应用/renderer.test.ts`，实际Electron复用 `e2e/uiux-v2.mjs` 隔离IPC专项、现有merge/runtime/config/selector回归，`npm run typecheck` 和范围diff检查。独立测试需用真实修后Pi调用/native与回放对照确认无副作用重复，并验证原p-limit历史回交与用户所见行为；离线UI成功不等于真实派发/确认只执行一次。

当前状态：r2已实施，本侧当前候选验证通过；字段按Core v2、Pi canonical phase与Window最终三phase规范化对齐，sessionInstanceId明确排除。独立真实桌面验收由root测试角色另记，本上下文未派生、未越界代修。


## 实施与当前候选验证

产品仅 `renderer.js`、`tool-rows.js`、`runtime-ui.js`。可信input key为actualturn的input类别，工具key为topactualturn/call/identityPhase，scope由原项目/role/runtime视图隔离。无可信身份继续原legacy key/出现次数；普通message不根据正文转换输入。原clientMessageId绑定给手动气泡同一canonical token，typed输入到达不另建气泡。

普通工具同阶段幂等；special工具同call只有一个生命周期行，start/blocked/result阶段分别保留。重复成功不降级既有失败，稀疏metadata不清掉原目标。确认/选择卡以Window原turn/call匹配，可采用已存在生命周期行，或在卡先到时把后来的阶段附于原卡；保留随机requestId响应、原决定DOM、失效和回放锚点。治理denied事件保留完整原因/允许路径，原生工具失败仍只显示可信首行，避免回退为stdout全文。程序化输入与生命周期更新沿原贴底/上翻规则，客户主动发送继续原强制贴底语义。context token原代码未改，未新增API。

自有实际验证：`node --test test/桌面应用/tool-rows.test.ts test/桌面应用/runtime-ui.test.ts test/桌面应用/renderer.test.ts` **59/59 pass**，Node v24.14.0；`npm run typecheck` exit 0；限定 `git diff --check` exit 0。测试只修改上述3文件和 `e2e/uiux-v2.mjs`。原deny全量断言经阶段幂等helper保持，旧手输15秒猜重静态断言改为typed来源/原ACK身份断言；原内容、图片及回调守卫不弱化。实际工具名校正为report_shell_verdict，未新增工具。

实际 Electron 44.7.0 / Node 24.21.0使用既有preload/受控IPC，目录均隔离于private/tmp。命令均为 `ANS_UIUX_OUTDIR=<目录> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs`，分别加模式变量：

| 模式/目录 | 当前结果 | 覆盖 |
| --- | --- | --- |
| ANS_DUP_UI_ONLY=1 / ans-dup-ui-r2 | DUP_UI_PASS 32，exit 0 | 九工具、3phase/live/history、卡片两到达顺序与原决定DOM、不同call同失败body、不同turn同输入、clientACK、后台role/runtime、虚拟阅读与稀疏目标保真 |
| ANS_MERGE_UI_ONLY=1 / ans-dup-merge | MERGE_UI_PASS 12，exit 0 | 原live/full/append/growth、原确认/决定卡DOM、legacy锚点及后台恢复 |
| 无专项开关 / ans-dup-full | UIUX_V2_PASS 98，exit 0 | 完整界面、图片/队列/输入、虚拟行组开合阅读、OP锚点及多引擎16项 |
| ANS_CONFIG_UI_ONLY=1 / ans-dup-config | CONFIG_UI_PASS 20，exit 0 | 原缺项、保存/失败/stale及导入限制 |
| ANS_SELECTOR_UI_ONLY=1 / ans-dup-selector | SELECTOR_UI_PASS 25，exit 0 | 原选择器禁用/键盘/焦点/视口/缺项入口 |

初期失败真实保留于本说明：新增夹具误给start设置ok:false，导致按真实失败逻辑显示为拒绝；修正为真实start无ok。行计数最初未扣原开会话loading记录，校正为reset取得基线后验证业务增量，full replay仍严格核实际总行数。原merge denied历史fixture固定phase=result，与最终Window blocked契约冲突，更新为blocked并保留单份拒绝严断言。完整UI曾检出原native失败stdout被当完整denied内容外露，本侧修正仅原治理denied/event保全量，native失败维持首行；不改原禁止SECRET正文断言。最终上述同一产品候选全部通过；各模拟fixture失败日志为用例主动注入。

原始证据：[当前候选/只读依赖manifest](2026-10-15-event-duplication-evidence/candidate-manifest.txt)、[单元输出](2026-10-15-event-duplication-evidence/unit-tests.txt)、[32项重复专项](2026-10-15-event-duplication-evidence/duplicate-report.json)、[12项合并](2026-10-15-event-duplication-evidence/merge-report.json)、[98项完整UI](2026-10-15-event-duplication-evidence/full-ui-report.json)、[20项配置](2026-10-15-event-duplication-evidence/config-report.json)、[25项选择器](2026-10-15-event-duplication-evidence/selector-report.json)、[960阅读截图](2026-10-15-event-duplication-evidence/reader-960.png)、[1360阅读截图](2026-10-15-event-duplication-evidence/reader-1360.png)。已查看960截图，读者保持在中段，输入区及头部无溢出。UI三产品候选在最后目标保真修整后冻结，之后仅文档证据归档。

本证据验证实际renderer与离线IPC，不冒称真实Pi工具handler执行次数或原生投递次数。Window最终只读依赖runtime-history `46343b7ffe8625b4bd089dc10bb35a6a176364f4535721c15343ad5b743d7fcf`已包含已知kind的阶段fallback与explicitphase优先；原审计未知旧message不按文本删。独立真实主进程/模型/native-replay对照由root测试角色在当前候选另行完成。

后续新项目首次徽标顺序bug按同一客户修复授权完成最小纠错；当前renderer候选已替代ffbb73bc，原本记录测试为该历史候选，新字节DUP32/MERGE12/FULL98/UNIT59重跑见[状态清理顺序修复](2026-10-15_fix_project-status-reset-order.md)。
