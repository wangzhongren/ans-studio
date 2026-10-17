# 桌面UI 变更记录

- 2026-10-14：创建——按客户「桌面拆分成两个角色吧，一个UI，一个window相关的」从「桌面应用」拆分：本角色承接渲染前端（`app/renderer/` 与渲染侧测试）。**客户 2026-10-14 确认原话「桌面UI/桌面窗口 这个可以」——已确认生效**；旧角色目录原位冻结为归档。Doc: docs/design/2026-10-14_design_role-split-ui.md
- 2026-10-14：修复——测试角色独立回归上报的「开合执行记录组 → 组前正文阅读锚点逐轮漂移」（确定性、1360/960 两档一致、修前 +2px/轮累积）。根因：行模型 `rec.h` 取 `offsetHeight`（取整、且不含 `.chat-pane` 的 16px flex 行距），spacer 记账与真实布局口径不一致，窗口构成变化按行距量级位移正文、被滚动锚定补偿后剩恒向残差。修法：`rec.h` 口径改为「真实行高（rect，小数）+ pane 行距」（`paneRowGap`/`rowFootprint` 六处统一，估算同口径）。设计对齐成果零回退（CSS/HTML 未动，双档实测 66/100/52/760/14px·26.6 等一致；uiux-v2 78 项含新增两档开合漂移断言全过，A/B 自证该断言修前必红）。Doc: docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md
- 2026-10-14：修复（同日追加）——① PM 转来 `U1_WINDOWED_TO_BOTTOM`（点角色到底）偶发定性：main.mjs 真自检台两侧各 17 轮全 true、直接 A/B 0/16 vs 0/16（合并 PM 观测 1/30 vs 0/21）——无法复现，判既有偶发/夹具时序，未改该行为代码；② 排查中修掉本修复第一版的行距缓存缺陷：脱离文档的 pane 读不到样式表，原实现把「读不到」当 0 落缓存（后台事件/恢复数据先于挂载建行表即中招、该 pane 退回错口径）——改为 `isConnected` 才读、命中才缓存；e2e 新增口径不变量断言（缺陷副本实测必红：C.rowGap=0 vs A=16）+ 源码守卫。新候选指纹：renderer.js `47703d0b…`、uiux-v2.mjs `156b73ca…`、renderer.test.ts `df1c195c…`。Doc: 同上 §9
- 2026-10-14：旧名残留清扫（PM 按产品评审逐文件路由）：`test/桌面应用/markdown.test.ts` 头注「桌面应用（B-1…）」→「桌面UI（B-1…）」（直接改写、不加历史注记）；`test/桌面应用/e2e/uiux-design-audit.mjs` 假枚举夹具示例角色「桌面应用」→「示例角色」（19/24/25 三处；第 52 行消息文案里的产品称谓与运行注释中的目录路径按「明确不改」名录保留）。改后 `node --test test/桌面应用/markdown.test.ts` 4/4 过；audit 夹具重跑 **report.json 与改名前逐字节一致**（测量值零影响）。指纹：markdown.test.ts `6c2d82df…`、uiux-design-audit.mjs `0f0233c4…`（其原指纹 `9a804242…` 随本次清扫失效，属既有测量夹具、不影响任何已采集证据——证据是当次图片/几何）。

## 2026-10-14：三引擎渲染接入（U1）

已按批准的 ANS-RUNTIME-V2r1 实现引擎选择、三元视图与掩码设置、组摘要及旧请求失效消费；本侧单测与真实离线 Electron 自测通过。当前流程见 [runtime-choice](docs/feature/runtime-choice.md)，原始候选、失败过程及截图见 [实现报告](docs/change/2026-10-14_change_multi-runtime-ui.md)。主进程全链路最终组合交独立测试角色。

## 2026-10-16：F-8-b 非零退出行分类（kanban-live 修复批次·实施轮）

实施——客户按推荐批准 2026-10-15 修复批次（F-8-a+b 全数）后按派发实现 **F-8-b（渲染侧）**：`app/renderer/tool-rows.js` 对 run_shell「进程跑完、退出码非零」改用结构化事实 `display.process`（exitCode 存在且无 error/signal）判为**中性**「已执行完成（退出码 N）」、`exceptional` 不置位（红→中性）；`timedOut` 独立一类「超时终止」（异常终止，保持显著）；旧 `knownFailure` 正则保留作无结构化事实旧文本行的回退（**事实优先**，过渡期兼容）。`app/renderer/renderer.js` 同判据让位：中性类不摆红色错误预览（原 L1041 一带）、详情字段按「消息」如实标注（不叫「错误」）。测试：`tool-rows.test.ts` 新增 2 条（13/13）、`renderer.test.ts` 新增接线守卫（边界内 62/62）、Electron 离线 e2e 更新 1 项期望（41+9 全过，含中性类渲染截图）；`npm run typecheck` 本侧 0 错（全仓现存红为并行上下文在飞中间态——tools.ts/编排测试随其推进变化，非本侧）。候选指纹：`tool-rows.js 3eef5bfd`、`renderer.js 74e24c7f`、`tool-rows.test.ts d2432c7a`、`renderer.test.ts 41485c5d`、`uiux-v2.mjs d9f56499`。Doc: docs/fix/2026-10-16_fix_kanban-f8b-tool-rows-exit-classification.md
- 2026-10-16：注释修订（G-1 收口同步，纯注释零逻辑）——`app/renderer/tool-rows.js` 系统投递归类块的过期注释改为如实现状：派发文案渲染单一来源=编排 `src/common/编排/handback.ts::renderDispatchPrompt`（桌面本地副本 `renderDispatchPromptLocal` 已删除、不得两处并存）；分类器只依赖首行前缀特征（`[派发] ` + `来自 X 的`），不解析正文其余——原「本仓落地前同模板，见 session.ts 的登记」与旧式 `任务：…` 描述作废。测试：tool-rows 13/13、renderer 45/45、markdown+runtime-ui 17/17、dispatch-delivery+dispatch-fresh-enum 20/20（只读回归）；`npm run typecheck` 0 错。指纹：tool-rows.js `f4e19c45`（原 `3eef5bfd` 随本次修订失效）。

## 2026-10-16：G-2/U1 恢复确认卡渲染 + `[系统]` 消息行样式（角色看护与收束·实施轮）

实施——客户按推荐批准 G-2（2026-10-16，`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`；9 个待裁点全部采纳、V1a+V1b 同轮）后按派发实现 **U1（渲染侧）**：
- **恢复确认卡**（设计 §6.2；复用 shell 确认卡组件族）：`index.html` 新增 `#recovery-confirm.sc-overlay`（动作/目标角色/证据逐字 `<pre>`/折叠详情/执行·取消/fail-closed 提示）；`renderer.js` 新增 `onRecoveryConfirm`/`renderRecoveryConfirm`/`respondRecoveryConfirm` 等（**恰 `{allow:true}` 才作为执行请求**；取消/Esc/关闭=不执行；**等待不设限**（裁定 4，无计时器）；失效/通道未接如实终态「未获执行」——绝不呈现为已执行）；模态互斥收口为 `anyConfirmOverlayOpen()`（抽屉 inert/focusin/Tab 三处共用）；动作人话标签走 `ui-labels.js::recoveryActionView` 纯映射（三枚冻结枚举，未知 ⇒ null）。
- **`[系统]` 消息行**：`tool-rows.js` 新增 `system` 类归类（文首定格标记 `[系统·<子类>] `——看护/收束/恢复回执同族，单一改动点；来源=系统、绝不当客户气泡）；`buildInjectedElement` 取 shield 图标；队列视图 `queueSourceLabel("system")⇒「系统」`、撤回判据只认 `message` ⇒ system 行**不可撤回呈现**。
- **接口待接**（W5/O1 均未落树，按提案形状实现）：W5 推达 `recovery:confirm-request`（建议随带 `projectRoot/runtime`，沿 shell 先例）+ `recoveryConfirmRespond({id, allow})` 三态回包；O1 文案须保持 `[系统·<子类>] ` 文首标记形态（判据唯一依赖）。
- 测试：边界内 80/80（renderer 48 / tool-rows 15 / markdown+runtime-ui 17）、桌面目录 321/321；Electron 离线 e2e **G2_RECOVERY_UI_PASS 5**（新增 `g2RecoveryChecks` 段 + 两档卡面截图）、既有主回归 COMPLETE_FLOW 41、默认全量台 99 全过；`npm run typecheck` **全仓 0 错**。
- 指纹：`renderer.js 928ffacd`、`tool-rows.js 02d75fb2`、`ui-labels.js 564fdb9a`、`index.html a39e3652`、`styles.css dbbb66f0`、`tool-rows.test.ts 6881dc34`、`renderer.test.ts 606e5287`、`uiux-v2.mjs aa8565bb`。Doc: docs/fix/2026-10-16_fix_g2-recovery-card-and-system-rows.md

## 2026-10-16：视觉收敛 v3 实施（间距密度 / 系统行去前缀 / 工具相位合并 / chip 对齐与尾行去重 / SVG 弧线转轮）

实施——客户 2026-10-16「**按推荐批准，开始实施**」，按设计 `2026-10-16_design_visual-convergence-v3.md` 落 ①–⑦ 批准面（W8 未列批准、零触碰；§二(c) 不动清单零触碰）：
- **W1–W6/W6b**：`.chat-pane` gap 24→16、p 段距 14→10、h3 21/7→16/6、用户气泡 12/16+1.8→9/14+24px（51→42px）、输入区 20/32/14→14/32/12（胶囊 10/14、gap 6、空框 40→28、脚注 6；总高 165.6→137.6px）、活动行 8→5（首行 9→6、摘要 26→22；53.1→47.1px）、注入盒正文 1.8→1.6（71.9→68.9px）；W6b 系统行正文剥离 `[系统·<子类>] ` 重复前缀（`displayBody` 单点；判据/原文不动）。W7 行高按批准②不动（有反向守卫）。
- **S1/S4**：`tool-rows.js::mergePhases/callSummary`（纯函数）——同一 toolCallId 两相位并一行（终态为准、未返回示「调用发起」、行态相位链、各相位详情折叠可展开、`data.items` 与身份/顺序/回放锚点零改动）；摘要「N 条活动」→「N 个调用」（异常补「· 异常 M」、未知保留）。展开组 4→2 行、95px≤60%现状（212.4）。
- **S2/S3**：chip 左缘对齐 `.chat-pane`（margin calc，实测 x 240→384、diff 0≤8px；卡样式未动）；chip 可见 ⇒ 尾行不重复「等待你确认」（`renderCurrentWork`↔`updateOpChip` 同源联动；「正在工作」保留、无 chip 兜底；并修「后台角色刷新顺手隐藏在显 chip」的历史缺陷）。
- **W9–W11**：`role-status.js::SPINNER_SVG` 全应用唯一一枚 12px SVG 弧线转轮（270° 弧、currentColor、静止可读）——侧栏 working 徽标经映射 `iconHtml` 单点输出（不做 DOM 注入）、尾行「正在工作」前置同款（行高 26.6px 不变）、开会话 loading 统一同款（边框 `.spinner`/spin 0.8s **退役**）；动画 `v3spin 0.9s linear infinite` 恰两条规则（transform 合成）；reduced-motion 全局兜底实测 1e-06s/1 ⇒ 静止弧。**长期约束⑦照做**：等待确认卡/恢复卡/chip/正文零新增动效（e2e 钉 chip animation-name=none；确认卡至多既有 op-flash 一次性定位高亮）。
- **验收**：设计 §二(d) 12 条数值断言 + S1–S3 结构断言（同源口径，e2e 夹具新增 v3 段）**30/30 全过**——gap 16、p 10、h3 16/6、气泡 42、输入区 137.6/空框 28、转录总高 789.2（基线 945）、可见行 9（原 7）、活动行 47.1（原 53.1）、两档无横向溢出、徽标 12px svg/0.9s、尾行 26.6、loading 同款、reduced-motion 静止弧、S1 2 个调用/94.2px、S2 diff 0、S3 两态、截断附验。截图 `v3-after-*` 与 UIUX before 对照入证据目录。
- **测试**：边界单测 87/87；uiux-v2 全家族（默认 99 / DUP 32 / G2 5 / FLOW 41 / VISUAL 36 / RUNTIME 16 / GHOST 9）全过；ime E2E_DONE、bench BENCH_DONE；`npm run typecheck` 全仓 0 错。**v2 基线修订**（批准范围内，旧→新均注明理由）：5 处断言（2 相位断言行数/文本、活动→调用口径词、两处尾行→chip 语义）。
- 指纹：`role-status.js ba3051c8`、`tool-rows.js 3f851983`、`renderer.js 0d704b44`、`styles.css 7f83b2bc`、`tool-rows.test.ts a0915e71`、`renderer.test.ts 74630b45`、`uiux-v2.mjs 08aa1845`、`uiux-design-audit.mjs 9d1b05c9`。
- 跨边界（只读定位、请 PM 路由）：桌面窗口 e2e `main.mjs` 需同批同步——①本批新增失效点 `ROLE_STATE_BADGE_HAS_ICON`（`.ts-ico` 现为纯 SVG）；②既有红（非本批）：badge 早挂 `#tab-work` 而 main.mjs 仍查 `#tab-card .tab-badge` 并在此空指针崩溃，另有 12 处右栏/队列/横栏过期断言。Doc: docs/fix/2026-10-16_fix_visual-convergence-v3-implementation.md

## 2026-10-16：U1 提示条补滚——切回已开会话角色内容被顶起 18px（桌面窗口 e2e 路由缺陷·修复轮）

**修复**——桌面窗口自检台（V2 批对齐轮）定位、PM 路由：`U1_WINDOWED_TO_BOTTOM` 确定性 false（dist=18px），V2 批 fd0ac73 引入（注：2026-10-14 本 changelog 记过该断言曾按「偶发/夹具时序」无法复现——本轮由桌面窗口定位出**确定性机制**，旧「偶发」定性就此被替换）。根因（一条因果链）：V2 把状态提示从聊天区下方（composer 内）搬成聊天区**上方**的 `.session-notice` 条（空时 display:none 零高）；点角色 ⇒ 立即贴底（dist=0）→ selectRole **异步尾部**才 `setHint(res.note)`（「已在该角色的会话中，续接当前会话。」）⇒ 条 0→≈19px 展开、#chat 变矮 18px（scrollTop 未动）⇒ 距底恰 18px 且无补滚。
- **修法（最小，保持既有滚动语义）**：`renderer.js` 新增 `noticeLayoutPin()` + `restickAfterNoticeChange(pin)` 两助手（L148/L157），包住**同一根条的两个写方**——`setHint` 与 `renderContextState` 的 `#history-projection-note` 写入，全部「**先量后写**」：改前按 S-1 同款判据（`UiLabels.stickToBottom` + `STICK_THRESHOLD_PX=24`）记「是否在底部附近」＋条高；改后**条高确有变化且原在底部**才补一次 `chat.scrollTop = chat.scrollHeight`（上翻者不打扰；高度不变不动=零抖动；`batchDepth>0` 照 Q-1 只登记、收尾统一；`backgroundDelivery` 放弃）。强制贴底（点角色/卡到达/回放）与 S-1 流式粘性逐字未动；无计时器。
- **手输仿前缀附带评估（只定性+注释同步，零行为变更）**：实时回显路径 fca8f6b 起已由**身份绑定**保护（`bindManualTurn` canonical `["input", turnId]` + `appendOneEvent` 同键去重，回显不进归类）；**回放路径**为残余边界（历史行只带文本无身份，仿前缀手输行回放时被归成注入行——呈现层来源张冠李戴，无数据/授权面影响）；最小修复需历史行携带投递身份（跨角色边界：session-history + 编排投递函），**未实施**、建议路由。过时注释同步三处（renderer.js L2325 手输防误伤块→身份绑定；L4208 `lastManualSend`→「仅是记录、防误伤判据已非它」；L3233 回放归类块「手输历史行不受影响」→如实残余边界）。
- **验收**：桌面窗口 e2e（只运行不修改，`ANS_E2E_OUTDIR=/private/tmp/ans-ui-u1-e2e`）`E2E_DONE=1`、**`U1_WINDOWED_TO_BOTTOM` dist 18→0 转 true**（U1_NORMAL/U1_REPEAT 与 S-1 五组粘性断言全 true 不变，无 FAIL/ERROR）；边界单测 `test/桌面应用/**` **354/354**（含新增 U1 钉住用例）；全仓 `node --test` **1678 用例 1677 过/0 败/1 跳过**（exit 0）；`npm run typecheck` **全仓 0 错**；本侧 uiux-v2 默认全家族 `UIUX_V2_PASS 99`（无回归）。
- 指纹：`renderer.js 3179388f`（原 `0d704b44`）、`renderer.test.ts d2c267f6`（原 `74630b45`）；其余文件零触碰。Doc: docs/fix/2026-10-16_fix_u1-notice-restick.md

## 2026-10-16：工具行折叠（客户批准口径）——运行中逐条实时、轮结束折叠成一行（含未放行/失败标注）

实施——客户批准口径（2026-10-16 定稿，登记＝`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §伴随项：「同一轮内连续工具行、轮结束后折叠成一行（「▸ 本轮 N 个调用：role_status / run_shell ×5 / …」）；运行中不折叠（实时可见）；点击展开为逐条一行完整列表（每条自身详情折叠保留，信息零丢失）；折叠态显式标出未放行/失败调用（如"含 1 条未放行"）」）；派发时机＝v1.2.0 CI 触发之后：
- **`tool-rows.js::callSummary`** 口径修订：`{calls, denied, failed, unknown, tools}`——`tools`＝按调用行工具分解（首现序 `[{name,count}]`）；`denied`/`failed`＝含未放行 / 含失败或超时相位的行数（同一行两类皆有 ⇒ 未放行优先）；旧 `exceptional` 按批准口径拆分（判据仍在 status 单点）。
- **`renderer.js`**：折叠行文案＝「本轮 N 个调用：a / b ×k / c」+（计数>0 时）「 · 含 X 条未放行」「 · 含 Y 条失败」「 · 含状态未记录」（`foldSummaryText`，数字经 `Tr.callSummary` 单点）；**开合状态机**——运行中（live+未 settled+`roleBusy`）默认展开（逐条实时）、settled 收为一行（`foldTurnGroups`；**批尾挂点 `flushDeferredFolds`**（`flushBatchSideEffects` 收尾、贴底之后）——批内折叠撞中间态布局且令贴底判定误读「在底部」（离线 e2e 实测），**无计时器**（纪律未破））；手动开合记 `activityOpen` 会话内**优先于默认态**（settled 也不收）、键盘焦点在组内不收；**未放行/失败相位并入同轮同 callId 组行**（「调用发起 → 已拒绝/执行失败」，「含 N 条」如实计数）且组不因此切断——**独立未放行行照旧直显不折叠**（治理信号全量呈现）；锚点语义与手动开合同序：文档中部阅读态折叠零位移（实测 150→150→150，<2px 同既有标准）、尾部态位移有界且不累积（物理夹取）；CSS `.record-count` 去缩进+可换行。
- **口径细则**（文案/默认态/会话内保持/窗口化交互/归属规则/「本轮」粒度）逐条写明于 fix 记录 §1.4。
- **测试**：边界单测 **88/88**（tool-rows 18 / renderer 53 / markdown+runtime-ui 17；S4 用例与 v3 守卫按新口径修订并加固，修订表见 fix 记录 §2）；新增 e2e 段 **`TOOLFOLD_UI_PASS 19`**（运行中/折叠/零丢失/手动优先/失败标注/锚点/窗口化，含 5 张截图）＋ uiux-v2 全家族回归全过（默认 99/DUP 32/FLOW 41/VISUAL 36/G2 5/GHOST 9/RUNTIME 16/MERGE 12/CONFIG 20/SELECTOR 26/RESET 7/FRESH 4/ROLE_FOCUS 11/TERMINAL 10/SEND_FACTS 8/TERMINAL_MERGE 12）、ime exit 0、bench BENCH_DONE、审计 30/30；`npm run typecheck` **全仓 0 错**。
- 指纹：`tool-rows.js 2fd2335f`、`renderer.js 27d72e8e`、`styles.css 7cf067d4`、`tool-rows.test.ts a599d1da`、`renderer.test.ts db80beee`、`uiux-v2.mjs 0a1439de`。Doc: docs/fix/2026-10-16_fix_toolrow-turn-collapse.md；证据：docs/fix/2026-10-16-toolrow-turn-collapse-evidence/

## 2026-10-16：G-4/I7 安装工具行/系统行如实标注（角色能力安装·行样式批）——**零改动实证**＋断言守卫

实施——客户 2026-10-16「都按推荐批准，开始实施」＝G-4（角色能力安装）V1 十项裁定全采纳、批准范围含 **I7（行样式，属主桌面UI）**（设计 `2026-10-16_design_role-capability-install` §5.4/§九：「复用既有工具行与 `[系统·…]` 先例，不新造行体系」）。核查结论＝**渲染平面零改动**（沿 G-3「合流即桌面零改动」先例）：
- **系统行 `[系统·安装]`**：`tool-rows.js::classifySystemMessage` 判据只依赖 `[系统·<子类>] ` **标记形态**（不逐子类登记——`安装` 天然满足）；呈现＝`buildInjectedElement` 既有 `is-system` 单一族（shield 图标＋chip「系统消息 · 安装」＋W6b 定格 `displayBody` 去前缀）；回显/回放同解；队列「系统」标签与不可撤回面（只认 message 类）沿 G-2/U1 既有口径——逐环节零分支。
- **工具行 `install_skill`/`uninstall_skill`**：经 `isToolActivity`/`activityOf` 按事件事实渲染（工具名直出、非 SPECIAL_TOOLS 屏障表成员；真实投影恒带 display ⇒ 生命周期独立行口径，legacy 路径进轮内工具组）；`slimToolRow` 的 `[\w.-]+` 含下划线零漂移；折叠分解 `callSummary` **按工具名计数**（新名字自动入「本轮 N 个调用：a / b ×k」摘要）——**确认无需特判**。
- **零改动实证（三层）**：字节级——`app/renderer/**` 未触碰，五文件指纹与工具行折叠批逐位一致（renderer `27d72e8e` / tool-rows `2fd2335f` / ui-labels `564fdb9a` / styles `7cf067d4` / index `a39e3652`）；符号级——四源文件去注释后对两工具名与子类标记**全仓零命中**（新守卫可重跑复验）；行为级——新增纯函数断言证明通用链确有覆盖。
- **测试**：`test/桌面应用/` 新增 **4 例**（tool-rows +3：`[系统·安装]` 归类/工具行两路径通用渲染/折叠分解含新名；renderer +1：零特判源码守卫）；桌面目录 **358/358**、`npm run typecheck` **全仓 0 错**；全量 **1814 计 / 1809 过 / 4 红 / 1 skipped**（4 红＝他域已登记预期红：`test/测试/g1-verify` ×3 待随 I5/I6 翻转＋`test/测试/g3-search-verify` 探针旧钉 ×1 待随 cleanPatterns 轻修同批翻转——与本批零交集）。
- 未验边界：I3（桌面窗口）系统行产出未落树（真机/E2E 观测属 E2E 轮）；产出方若改标记形态归类静默回落普通气泡（单点＝`SYSTEM_HEAD`，注释即契约）；卸载行子类命名归属产出方（渲染侧零登记、两种形态均覆盖）；真机投影下两新工具实际走生命周期行还是轮内组未观测。
- 指纹：`tool-rows.test.ts 52c2c4e7`（原 `a599d1da`）、`renderer.test.ts 3bce42fb`（原 `db80beee`）；`app/renderer/**` 零触碰（指纹见上）。Doc: docs/fix/2026-10-16_fix_g4-i7-install-row-annotation.md

## 2026-10-16：G-4/V2-MCP MCP 工具行/安装行如实标注（MCP 安装·呈现行批）——**零改动实证**＋断言守卫

实施——客户 2026-10-16 批准 G-4 V2（MCP 安装）分批实施（P1 Claude → P2 Codex → P3 Pi）；V2 范围⑤「呈现行」属主桌面UI（设计 `2026-10-16_design_role-capability-install` §5.4：`install_mcp` 调用按既有工具行渲染＋`[系统·<子类>]` 定格系统行，「与技能同链，不另造行体系」）。核查结论＝**渲染平面零改动**（沿 G-3/G-4-I7 先例）：
- **`mcp__<server>__<tool>` 使用行**（三平台收口形态同款：Claude＝hook start＋泵 result、Codex＝`mcpToolCall` item 映射〔wave B 适配器〕、Pi＝既有工具管道行；渲染侧只认 `kind:tool_call/accepted/denied`＋`detail.toolName`）：名称解析逐字直出零改写（legacy 正则 `[\w.-]+` 含下划线全名命中）；屏障表不含 MCP 形态名（真实投影带 display ⇒ 生命周期独立行直出工具名，无 display ⇒ 轮内组）；折叠计数 `callSummary` 按名直出（下划线名入「本轮 N 个调用：a / b ×k」）；详情 `toolDetails` **零工具名引用**（display 驱动）。
- **安装工具行 `install_mcp`/`uninstall_mcp`**（设计 §3.2 冻结名）：经 `isToolActivity`/`activityOf` 按事件事实渲染（与 I7 技能两工具逐环节同构）；小护栏拒绝沿既有 failed 口径、reason 保留。
- **`[系统·安装]` 系统行**：MCP 安装/卸载完成行走既有子类路径（**子类已识别、无需新登记**——判据只依赖 `[系统·<子类>] ` 标记形态）；呈现/回显回放/队列/不可撤回面全部沿 I7 定格链。
- **零改动实证（三层）**：字节级——`app/renderer/**` 未触碰，五文件指纹与 G-4/I7 批逐位一致（renderer `27d72e8e` / tool-rows `2fd2335f` / ui-labels `564fdb9a` / styles `7cf067d4` / index `a39e3652`）；符号级——四源文件去注释后对 `mcp__`/`install_mcp`/`uninstall_mcp` 零命中＋`toolDetails` 切片零 `toolName`（新守卫可重跑复验）；机制级——逐环节零新分支（fix 记录 §1）。
- **测试**：`test/桌面应用/` 新增 **4 例**（tool-rows +3：下划线/清洗/缩短名形态解析＋折叠计数＋install_mcp 行与系统行子类复用；renderer +1：零特判源码守卫）；tool-rows **24/24**、renderer **55/55**、桌面目录 **375/375**（并行 wave A 窗口内复跑仍全绿）；`npm run typecheck` **全仓 0 错**；全量两快照 1884 计 / 1879→1872 过 / 4→11 红（**全部＝他域在飞翻转钉**：测试/门禁引擎/编排属主的 V2 wave A〔`docs/mcp` 预授权扩列、`install_mcp` 契约定型〕＋卡文本批过渡态，数量随并行落地变动，**与本批零交集**；跳过＝既有 Windows 用例）。
- 未验边界：三平台适配器发射面未落树/未接（Claude 两发射点属 P1、Codex item 映射 wave B、Pi 属 P3）；Codex 呈现名选择与失败态映射文案归 wave B；display 投影面与系统行文案产出方未落树；真机 E2E 属 E2E 轮。
- 指纹：`tool-rows.test.ts 225e69ae`（原 `52c2c4e7`）、`renderer.test.ts d06e7bfc`（原 `3bce42fb`）；`app/renderer/**` 零触碰（指纹见上）。Doc: docs/fix/2026-10-16_fix_g4v2-mcp-row-annotation.md

## 2026-10-16：G-5 wave 2 推理强度档位控件＋推理折叠行（呈现面批）

实施——客户 2026-10-16「按推荐批准，开始实施」＝G-5（推理与推理强度）；本批＝wave 2 呈现面（属主桌面UI；设计 `2026-10-16_design_reasoning-and-effort` §3.4/§5.2/§5.3；投影冻结点＝`RuntimeReasoningDisplayDetailV1`——Service 已过核心投影单点、经既有事件面到账）：
- **档位控件**：设置面板对元数据 `choices` 非空字段（三平台推理强度——pi/claude 五档、codex 四档，值域逐字）以 `<select>` 呈现——首项「留空（平台默认）」＝未设态、选项逐字、手编非选项原值附项如实显示（保存由主进程按 choices 校验拒绝，值域判定不复制）；自由文本/机密字段路径逐字现状；预填/保存沿 `.value` 单点。旧注入替身路径（自建 fields 无 choices）回落文本输入（该路径已登记形状）。
- **推理折叠行**：行形「已思考 N 秒 ▸」**默认折叠（含运行中——与工具行刻意差异）**、点击展开原文纯文本（esc/pre-wrap，不做 Markdown）；`omitted`⇒「已思考（内容由平台省略）」（±真实时长）、无时长⇒「推理内容」（不发明时间）、亚秒下限 1 秒、诊断形⇒「推理内容无法安全显示」（不可展开单行）；**不进工具组、不加 `[系统·]` 前缀、不新造样式体系**（chev/锚点/批尾语义全部沿工具行折叠同款）；**开合状态机复用**：手动态记 `activityOpen`（会话内保持、程序化守卫）、开合走 `captureChatReading→改→refreshActivityHeight` 锚点零位移、行走 registerRow 批尾落地（无计时器）；**live/回放同一入口**（回放行数据通道结构化字段 `row.reasoning`——契约已冻结，主进程行映射属桌面窗口域、未落树＝已具名对齐点）。文案/可展开性纯函数单点在 `tool-rows.js`（renderer 只取用）。
- **测试**：`test/桌面应用/` 新增 **4 例**（tool-rows +2：文案边界/可展开性；renderer +2：控件守卫/折叠行接线含恰两处入口计数与状态机四点）；tool-rows **26/26**、renderer **57/57**、桌面目录 **388/388**；typecheck **本域 0 错**（全仓 6 错全在并行 Codex适配器 test 文件）；全量 **2044 计 / 2041 过 / 2 红 / 1 skip**（批内首快照 2036/2033，计数随并行落地增长）——两红均他域在飞（t29 面板键随 `pi-config.ts` 扩列待翻转；g3 审计④ Pi 扩展 handler 门位随 real-adapter 在飞重构），与本批零交集。
- 未验边界：回放载体 `row.reasoning` 未落树（落树前回放面回落「已思考」文本行——现状行为；形状已冻结＋测试钉）；三平台适配器发射面在平行波；真机 E2E 属 E2E 轮。
- 指纹：`renderer.js 7d18858b`（原 27d72e8e）、`tool-rows.js a116119e`（原 2fd2335f）、`styles.css 6029a281`（原 7cf067d4）、`tool-rows.test.ts fbca6143`（原 225e69ae）、`renderer.test.ts 6d164c91`（原 d06e7bfc）；ui-labels/index 零触碰。Doc: docs/fix/2026-10-16_fix_g5-wave2-effort-control-and-reasoning-row.md

## 2026-10-17：I4 治理记录状态行、su 空态、非模态预览面板与文案（已有角色但无治理记录兼容·V1）

实施——客户 2026-10-17「推进吧，按 B+C 来」；项目管理评审 `2026-10-17_design_existing-project-compat-review.md` §二 I4 / §四.1 / §4.2 / §4.5 / §五 D1–D3。
- **状态**：`state.governanceRecord` 从 `listProject.governanceRecord` 原样落库（`{state, reason?}`，仅接受三枚枚举值）；**缺失字段按 `{state:"present"}` 兜底**（旧主进程兼容：不显示动作、不崩）。动作可见谓词**唯一入口**＝`ui-labels.js::canEstablishGovernance(hasProject, hasRoles, recordState)`——`state.projectRoot && hasRoles === true && recordState === "missing"`，渲染侧只经它取用，不另立判据。
- **S1 状态行**（既有 `.session-notice` 位置、非模态）：说明「本项目有 N 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。」＋「建立治理记录」；`invalid` 显示「治理记录不可用：<reason>；本版不自动覆盖」且无建立钮；`present`/S0 不显示（S0 的未-bootstrap 空态逐字不变）。
- **su 空态**：S1 标题「尚无治理记录」、说明含角色数与 `ans govern <项目目录>` 兜底、主按钮「建立治理记录」；主入口角色经 `primaryRoleId` 传入（不硬编码）。文案纯函数在 `ui-labels.js::governanceEmptyState/governanceMissingText/governanceInvalidText`。
- **预览面板**（非模态，紧随提示条展开）：将写路径、将 pin 的对象与角色数、是否采纳既有治理边界文档、授权来源逐字、旧格式 `legacyBoundaryRoleIds` 单行提示（迁移属后续版本）、「不扩大任何角色写边界、不修改任何角色边界文件内容。」、[建立治理记录] [取消]。取消只关面板＋`已取消，未写入任何文件。`，**不调用任何 IPC**。
- **建立**：确认后按钮 disabled＋「正在建立治理记录…」；成功只认 `ok && phase === "write" && finalize.status === "completed"`，逐字 `finalize.message`＋「治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。」，并重新 `listProject`（状态变 present、动作隐藏）。失败逐字 `finalize.message`；**`phase !== "write"` 才可声明未写入任何文件**（纯函数 `governanceFailureView` 单一构造点）；`already-established`/`busy`/`invalid-record` 按 §4.5 文案并停止重试。
- **契约**：按名消费 preload `previewGovernanceRecord(projectRoot)` / `establishGovernanceRecord(projectRoot)`，不另起别名；预览/建立返回形状按评审 §4.3/§4.4。**未接线时**（通道缺席）如实显示通道不可用，不假装成功。
- **测试**：`test/桌面应用/renderer.test.ts` 新增 **7 例**（可见谓词四态、S1 角色数只计项目角色、S1/S0 空态文案、预览字段与取消零 IPC、phase=write 禁止零副作用文案、成功判据与刷新、助手消息即时 Markdown）；renderer 套件 **64 计 / 60 过 / 4 红**——4 红为**先于本批的基线**（N-1、data-state、P1-3、G-5：本机 CRLF 检出下 `\n` 锚点源码正则失配，与本批无关，未改其断言）；新增 7 例全过。`tool-rows.test.ts` 26/26、`hot-path.test.ts` 4/4 回归通过。未跑真实 Electron（属客户/测试角色）。
- **已知对齐点**：`governanceRecord`、两条 IPC/preload 通道由「桌面窗口」并行接线；落树前动作不可达（兜底 present），落树后按本实现生效。S4（pin 不符）在 V1 仍显示 present——文案只说「治理记录已存在」，不宣称治理角色现在可写（评审 §七-6）。
- **实机修正（2026-10-17 协调者反馈）**：首版把 `state.roles.length` 传给 S1 文案——实机导入 7 个项目角色＋内置 su 时错误显示「8 个项目角色」。改为单一计数 `ui-labels.js::projectRoleCount(roles)`（只数 `builtIn !== true`；不硬编码角色名/id，缺字段按项目角色计），renderer 包装 `projectRoleCount()`，状态行与空态两处均改用它；新增守卫「1 内置＋7 项目 ⇒ 显示 7、不显示 8」。
- **助手消息即时 Markdown（2026-10-17 实机修复）**：三种适配器只发**完整消息**（Pi `message_end` / Codex `item/completed` / Claude assistant text block），渲染层无增量文本更新；旧「`roleBusy` 且未 settled ⇒ 先纯文本、settled 再升级」使整轮正文（表格/`##`）保持原文。`appendAssistant` 改为新建行恒 `mdReady:true`、经 `buildAssistantRow` 即时 `Md.renderMarkdown`，移除 roleBusy/settledTurns 判定；`.msg-assistant.is-streaming` 仅保留为旧行/异常行安全网（无正常生产者；`upgradeStreamingMarkdown` 仍在 settle 清理），CSS 注释注明唯一用途。uiux-v2 对应断言改为「即时消息、不挂 is-streaming」。
- **离线 Electron e2e 修复（2026-10-17）**：即时 Markdown 使 `.msg-assistant` 的 `textContent` 末尾多一个换行（`<p>…</p>` 后带换行；结构标签，正文未丢）——`uiux-v2.mjs` 两处**精确等于**断言（活动轮、`routine collapsed`）改为 `.trim()` 相等，保留「assistant 文本不变」保证，不削弱断言。修后原失败点（旧 964）通过；套件前进到既有检查 `virtual visible nonempty` 仍在滚动 55% 时无可见 `.msg`。**A/B 证据**：以 `git show HEAD:app/renderer/renderer.js`（7d18858b，改动前版本）临时替换后复跑，同点同观测失败 ⇒ 该红先于本批（环境/并行分支态，非本轮渲染改动），未改其断言。`uiux-v2.mjs` 指纹 `e102e9e0`。
- **左树状态优先级修正（2026-10-17 实机反馈）**：`role-status.js::deriveRoleStatus` 原为 `error > awaitingConfirm > working`；`roleMeta.error` 只在 settled 更新、新轮 busy 不清，导致「上一轮超时 → 新一轮运行中」仍显示「错误」。改为 **`awaitingConfirm > working（busy/队列待办）> error > 其余`**：角色在跑就显示「工作中」，上一轮错误等空闲时再显示；`error` 注释明确为「上一轮终局，不代表当前轮」。新增守卫：busy+error ⇒ working/「工作中」，busy=false+error ⇒ error；同步更新原优先级断言。
- 指纹：`renderer.js 4a891913`、`ui-labels.js 5ea657e2`、`styles.css c97107e1`、`renderer.test.ts 22fddaca`、`role-status.js e41e6eda`（均覆盖原值）。Doc: 本文件（评审 §二 I4 为任务书；无单独 fix 记录）。

## 2026-10-17：A1+A2 企业级稳定感（结构 + 重量）实施

客户 2026-10-17「按推荐来，A1+A2 实施」；设计 `角色卡/UIUX设计师/docs/design/2026-10-17_design_enterprise-stability.md` §四/§五/§九/§十，PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_enterprise-stability-review.md` §三/§四。**生产代码只改 `app/renderer/styles.css`**：文件末尾两个带日期注释的覆盖块（A1 在前、A2 在后，可分别验收/回滚）；`index.html`/`renderer.js`/`role-status.js`/`app/desktop`/`src` 零改动。
- **A1 结构**：`--content-max: 900px`；`.col-left` 右 1px `--border`；`.titlebar` 下边线 `--border-strong`；`.chat-head` `height:auto; min-height:72px` + 下边线 + `padding-inline: max(32px, calc((100% - var(--content-max))/2))`（≤1100 档 base 24）；`.session-notice` 同 padding；`.composer` 上 1px 边线 + `#FAFBF8` 浅底 + `0 -6px 18px rgba(21,31,26,.035)` 上阴影；`.chat-pane`/`.capsule`/`.attach-row`/`.compose-note` 用 `var(--content-max)`；`#chat > .op-chip` 定位公式改 `var(--content-max)`。真实 Electron 实测：1360 档 pane＝capsule＝**900px**、960 档＝**736px**，同列左缘差 <2px，无页面横向溢出。
- **A2 重量**：token 按 §4.1（`--chrome #EDF0EA`、`--bg-side` 别名、`--border #D7DDD4`、`--border-strong #C4CEC2`、`--border-control #8A968B`、`--text #232C29`、`--text-2 #55625B`、`--text-3 #6A756E`、`--success #2D634E`、`--success-hover #244F3E`、`--success-bg #E5EEE7`、`--danger #A1433C`、`--danger-bg #FBEFED`、`--amber #8A5B23`、`--focus-ring #2D634E`、`--radius 8px`、`--radius-sm 6px`、`--shadow-card`、`--shadow-dock`）；胶囊/引擎选择器边框 `--border-control`；圆角容器 8、控件 6、用户气泡 `8px 8px 3px 8px`；`.msg table` 13/20 + `outline` 完整外框 + 单元格 6×10 + 表头实底/强底线（不改 `display:block/overflow-x:auto`）；阴影只给输入区与确认卡（普通消息/报告卡/任务请求零新增阴影）；`.tree-item.active` `inset 2px 0 0 var(--success)`。正文 15/27、间距刻度与 A3 项目零触碰。
- **测试**：`test/桌面应用/renderer.test.ts` → **66 计 / 62 过 / 4 红**（4 红为既有基线 N-1、data-state、P1-3、G-5，未改其断言）；新增 A1/A2 两例（含 WCAG 白底对比度纯函数：正文 ≥7、次级 ≥5、三级 ≥4.5、控件边框/focus ≥3）。`ANS_VISUAL_V2_UI_ONLY=1` 真实 Electron **VISUAL_V2_PASS 36**（含 1360/960 几何、边框、浅底、同列、抽屉 424、无溢出）。默认 e2e 仍只在既有基线 `virtual visible nonempty`（uiux-v2.mjs:1044）失败；该红在本轮前已由 HEAD renderer 复现，非 A1/A2 引入，未改其断言。
- 指纹：`styles.css 4d374ced`、`renderer.test.ts 15e6bc12`、`uiux-v2.mjs 107c06f5`。

## 2026-10-17：Pi 设置「高级」组扩展——上下文窗口 + 整轮超时

共享元数据新增 Pi `ANS_PI_PROMPT_TIMEOUT_MS`（label「整轮超时（ms）」，integer min 1000；`ANS_PI_CONTEXT_WINDOW` 亦 integer）。渲染侧（`app/renderer/renderer.js`）：
- `PI_KEYS` 增加 `ANS_PI_PROMPT_TIMEOUT_MS`；新增**单一来源** `ADVANCED_SETTING_KEYS = ["ANS_PI_CONTEXT_WINDOW","ANS_PI_PROMPT_TIMEOUT_MS"]`（按此顺序渲染）。
- 主字段区以 `ADVANCED_SETTING_KEYS.indexOf(f.key) < 0` 排除整组；`.pi-advanced` 仅在至少一个高级字段存在时显示；`.pi-advanced-body` 按白名单顺序映射存在字段（`.filter(Boolean)`，缺件跳过——旧窗口视图只给 CONTEXT_WINDOW 时照常工作），两项之间用既有 `.pi-advanced-hint` 一行「以下高级项均可留空；留空 = 使用默认值。」分隔（不新增控件/视觉体系）。
- label/help 仍逐字取元数据（渲染侧不硬编码「整轮超时（ms）」）；正整数保持文本输入；预填/保存沿用既有 `fields` 循环（新键自动接线，保存校验仍由桌面窗口执行）。
- `index.html` 的静态高级区同步为两字段 + 分隔说明（配置载入前兜底；载入后仍由 `applyPiView` 按元数据重写，顺序一致）。
- 测试：`renderer.test.ts` 新增 T28 扩展例（两键在高级区/主区排除/顺序/单项兼容/分隔说明/文本控件/元数据文案）；renderer **67 计 / 63 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5），`runtime-ui.test.ts` **12/12**。
- 指纹：`renderer.js 4af03ec0`、`index.html abfd9891`、`renderer.test.ts 800d2f20`。

## 2026-10-17：Pi 高级档位滑块（range 控件）

共享元数据为 `ANS_PI_CONTEXT_WINDOW` / `ANS_PI_PROMPT_TIMEOUT_MS` 增加 `choices`、`choiceLabels`、`control: "range"`（`""` 为默认/清除档；标签「系统默认（500k）」「系统默认（120s）」）。渲染侧（`app/renderer/`）：
- `fieldHtml` 新增 `f.control === "range" && choices` 分支：可见 `<input type="range" id="pi-range-<key>">`（`min=0`、`max=choices.length-1`、`step=1`）＋ `<output id="pi-range-out-<key>">` 展示 `choiceLabels[index]`（缺省回退 raw value）＋ **hidden `<input id="pi-inp-<key>">` 持规范值**（`choices[index]`，默认档 `""`）——既有保存循环原样读 `#pi-inp-<key>`，保存链零改动；`aria-valuetext` 与 output 同步，键盘方向键原生可调。
- 当前值不在 `choices`：不静默覆盖——回退文本输入＋提示「当前值不在预设档位；改为预设档位后保存」。
- 纯映射单点：`ui-labels.js::rangeChoiceIndex/rangeChoiceValue/rangeChoiceLabel`；预填后 `syncRange(key)`（hidden 值→index→slider/output），`input` 事件同步 hidden 规范值/output/aria。
- CSS：`.pi-range-wrap` / `.pi-range-out` / `.pi-range-note`，仅用既有 token（`--success`/`--border`/`--text-2`），无新字体/颜色体系。
- 测试：renderer **68 计 / 64 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5），新增 T28 扩展 2（7 档映射、500000/300000→index、默认档空值、自定义值 -1、DOM/同步接线）；`runtime-ui.test.ts` **12/12**。
- **跨边界影响**：`test/桌面应用/e2e/main.mjs`（桌面窗口）的 `PI_FIELDS_MATCH_REGISTRY` 用 `label[for="pi-inp-<key>"]` 取字段标签；range 字段的 label 正确指向滑块 `pi-range-<key>`，故两项标签查找为空、该断言预计红。请桌面窗口改为同时接受 `pi-range-*`/读取 `.pi-field-label`；本侧未改其文件。`PI_KEYS_ARE_FIVE`、`*_IN_ADVANCED` 与 hint 判据不受影响。
- 指纹：`renderer.js 36b5ebba`、`ui-labels.js b399f763`、`styles.css c4369839`、`renderer.test.ts 13a9ffb4`（`index.html abfd9891` 未再变）。

## 2026-10-17：su 命令审批卡（标题 / 档位 / 风险披露 / 拒绝默认焦点）

依据 PM 评审 `2026-10-17_design_su-shell-approval-review.md` §3.6（编排/门禁侧已就绪，窗口传 `policy`/`tier`）。**零 HTML 改动**，复用既有 shell 确认卡：
- **标题**：`policy === "su-approval"` ⇒「SU 命令审批」；`project`/缺省 ⇒「shell 命令请求」（`ui-labels.js::shellConfirmTitle`）。
- **档位可见行**（`#sc-summary`）：`risky`⇒「风险命令（risky）」、`review`⇒「未自动判定（review）」、`deny`⇒「硬拒类（deny）」；未知 tier 不编标签（`suApprovalTierLabel`）。
- **可见原因**：`reasonPlain` 原文；su 卡额外把 `reasonRaw` 作为单独一行「命中原因：<raw>」放进可见 `#sc-reason`（`white-space: pre-wrap`）；project 卡 `reasonRaw` 仍只在折叠详情。
- **必备警告**（`#sc-hint`）：su 卡追加「批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。」＋既有 fail-closed 提示；project 卡 hint 逐字不变。
- **默认拒绝**：沿用 `#sc-deny.focus()`；拒绝/关闭/Esc ⇒ `allow:false`；恰 `allow:true` 才回传放行；无「记住/不再询问」；不显示只读徽标。`#shell-confirm.is-su-approval` 由渲染侧切换（档位行加粗、警告用 `--amber`）。
- 测试：renderer **69 计 / 65 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5），新增 SU 审批卡用例（三档标签、标题、警告、可见命中原因、拒绝焦点、project 逐字回归、拒绝不调用放行）；`ANS_TERMINAL_UI_ONLY=1` 真实 Electron **TERMINAL_PASS 14**（新增 5 项 su/project 卡检查）；默认 e2e 仍只在既有 `virtual visible nonempty`（1044）失败。
- 依赖：`payload.policy`/`payload.tier` 字段由桌面窗口按契约提供；缺失时按 project 原行为（不猜档位）。
- 指纹：`renderer.js 9fcbf68d`、`ui-labels.js 270a1dcb`、`styles.css a5848df1`、`renderer.test.ts b8f91729`、`uiux-v2.mjs f12db959`。
