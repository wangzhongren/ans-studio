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
