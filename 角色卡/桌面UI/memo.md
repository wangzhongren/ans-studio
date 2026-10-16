# 桌面UI 备忘录

记录本角色掌握的事实、待核实事项与续接线索。不写全局规则，不抄任务状态。

- 2026-10-14：角色由 ANS Governance 创建并经客户确认生效（当日原话「桌面UI/桌面窗口 这个可以」），Section 1 覆盖 `app/renderer/`、8 个渲染侧测试文件与角色资料。来源：客户「桌面拆分成两个角色吧，一个UI，一个window 相关的」。
- 2026-10-14：拆分前全部历史（设计/变更/修复/功能说明/changelog/memo/api-spec）保留在冻结归档 `角色卡/桌面应用/`（原位未移动，链接有效）；本角色 feature-map 中按条目链到对应归档文档。归档说明见 `角色卡/桌面应用/归档说明.md`。
- 2026-10-14：当前未提交的设计对齐记录（`角色卡/桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md` 与 `docs/fix/2026-10-13-design-alignment-selfcheck/`）归本角色一侧，内容未改写、未移动；独立 UI/产品复核经 PM 安排。
- 2026-10-14：渲染侧两个必需事实（拆分时承接）：① 渲染进程无第二份判定——写资格判定全在主进程经门禁引擎；② 一切能力经 preload 白名单通道，渲染进程不接触 Node/fs。渲染侧导出 `globalThis.{ANSMarkdown,ANSRoleStatus,ANSToolRows,ANSUiLabels}` 供 node 测试同源加载（约定见各文件头注释与 `test/桌面应用/markdown.test.ts`）。
- 2026-10-14：测试入口沿用路径 `test/桌面应用/`（拆分未物理移动测试文件）。`e2e/main.mjs`（桌面总自检台）归「桌面窗口」；本角色界面改动若牵动其中 DOM 断言，经项目管理协调由桌面窗口侧同步。
- 2026-10-14：已知基线红（拆分前既有，非本角色引入）：`test/桌面应用/pi-config.test.ts` 检出目录名断言（本机检出名为 ans-runtime）——属桌面窗口侧测试文件的既有基线红，见项目管理备忘。
- 2026-10-14：锚点漂移修复（详见 docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md）承接的两个口径事实：① 行模型 `rec.h` = **真实行高（rect，小数）+ pane 行距（flex row-gap，实读计算样式）**——spacer 记账必须与 `.chat-pane` 真实布局同口径，任一处退回 `offsetHeight`（取整、不含行距）都会让窗口构成变化位移正文；② 行距不是常量——媒体查询/样式演进会改，故实读不硬编码。渲染源码守卫在 `renderer.test.ts` 的 Q-2 用例（5 条）。
- 2026-10-14：续接线索——测试角色的最小复现 `uiux-anchor-drift-probe.mjs` 的读数用「首个可见行」：锚点越过一行边界后会切换目标行（曾把 ~+16px 的同行位移读成 −52.875「跳位」）。若后续以其为交付断言，改用固定元素为锚。本角色 e2e 断言（uiux-v2.mjs）已按固定元素（row-120）实现，spread<2px 与既有读者锚点口径一致。
- 2026-10-14：修复候选指纹：`renderer.js 402e49a7…`、`uiux-v2.mjs 83b519e6…`、`renderer.test.ts c01163cc…`；`styles.css/index.html/tool-rows/ui-labels` 与两枚测量夹具指纹未变。归档对齐记录中的 `187d6c00…` 随之失效（归档只读不改）。
- 2026-10-14：追加修整后的**当前**指纹：`renderer.js 47703d0b…`、`uiux-v2.mjs 156b73ca…`、`renderer.test.ts df1c195c…`（第一版 402e49a7… 被 §9 修整改代；U1 定性数据以 402e49a7 采集）。
- 2026-10-14：U1_WINDOWED_TO_BOTTOM（点角色到底）偶发定性结论：main.mjs 真自检台在新侧 17 轮、修前行为副本 17 轮全 true；直接 A/B 0/16 vs 0/16（合并 PM 1/5：新 1/22 vs 旧 0/21）——无法复现、非本次回归，登记不改。复跑方式（可续用）：`ANS_E2E_OUTDIR=<d> node_modules/.bin/electron test/桌面应用/e2e/main.mjs --user-data-dir=<d>/profile`（userData 隔离可并行；旧侧用 /private/tmp/ans-oldrepo 仓库副本，仅换 renderer.js）。
- 2026-10-14：行距缓存事实（口径的一部分）：**脱离文档的 pane `getComputedStyle` 返回空**（读不到样式表）——`paneRowGap` 必须 `isConnected` 才读、命中才缓存；后台角色事件与恢复数据（session:history 先于挂载推达）会让行表在未挂载期建成，这是常见路径不是角落。e2e 有口径不变量断言（C 与 A 的 rowGap 相等且 >0），`rowModelDebug` 已暴露 `rowGap` 字段（只增不改）。
- 2026-10-14：旧名残留清扫（PM 路由）：`markdown.test.ts` 头注改「桌面UI（B-1…）」；`uiux-design-audit.mjs` 夹具示例角色改「示例角色」（19/24/25 行）。两文件内保留项（别误扫）：运行注释里的目录路径 `test/桌面应用/…`（目录名不动）与第 52 行消息文案「Vite 的桌面应用」（产品称谓，按产品评审「明确不改」名录）。指纹：`markdown.test.ts 6c2d82df…`、`uiux-design-audit.mjs 0f0233c4…`（原 `9a804242…` 失效；audit 重跑 report.json 与改名前逐字节一致）。
# 2026-10-14 U1 多引擎

固定桌面UI；已批准 ANS-RUNTIME-V2r1。实际窗口 API 同范围冻结后消费 get/saveRuntimeConfig、三元 session identity、history-get/live-views/operator-expired。dropdown 保留旧后台任务；切换仅保存/安装各引擎视图。经典脚本 runtime-ui.js 只做展示。旧 Pi DOM/API 探针名保留，配置来源和秘密 metadata 只走窗口。

自有当前流程见 docs/feature/runtime-choice.md；候选/失败历史/当前58单测/15运行时断言，以及前阶段完整Electron87布尔断言+10观测/IME26/bench与双宽截图见 docs/change/2026-10-14_change_multi-runtime-ui.md。真实主进程全链路交独立测试角色，不宣称在线模型。

U1R渲染阶段已实现turn/event/原文+次数合并及独立clientMessageId绑定；60/60、离线Electron9项通过。整体未验收，真实Core onTurnStarted与Window原投递ack待对接，不能称first-event FIFO猜测为权威。阶段manifest和原main红记录见 docs/fix/2026-10-14_fix_live-history-merge.md。待PM同固定UI上下文续实际gate。

U1R最终：仅迁移renderer.test.ts旧直发handle名字守卫；实际sendDelivery区分legacy原包/单参与真实ack浅包装，images保持同引用、原callback与身份校验保留。自有60/60、tsc/scope diff0；T1actual23生产fingerprint全部当前匹配，非本侧重跑。最终19file hash5c85d48bca3060f7847fe20c8dcb87e59a5bb4a476805b64ce2ebf4a872b73ba，原阶段/红记录保留，见docs/fix/2026-10-14_fix_live-history-merge.md。

U1R2本侧冻结：原卡按真实request/conclusion重插与显式null token保留；60/12/tsc绿。新19file候选b4882fe2e0c674e8d3b3d1185d60a873e9768d0529b48e3bc04c6cdf97b531aa，产品renderer已变，T1实际23/旧119/锚点14/全仓待重验。详见docs/fix/2026-10-14_fix_preserved-card-replay-anchor.md。

- 2026-10-15 UXv2六源接线：源HandbackEvent的实际公开字段是report/liveReport/reportPersistence（无raw handback）；目标新C文本只读安全副本且modelInputRecorded:false，不能再标完整模型原文。B只消费Window签发epoch/docID，P3先来源角色列表显选，不按evidence找路径。五保存/查询方法与两可取消状态事件同ID归并，raw/private状态不造UI能力。当前实现与最终hash见docs/change/2026-10-15_change_complete-flow-ui.md，批准13文档不可改写。


2026-10-15 root真实GUI首红补修仍属UI-P1–7-1：当前轮新增转录不是旧上下文；send通用error不是aborted事实；ACK不是inputAccepted；sessionCurrent不是ready；终态卡radio也须只读。最终候选renderer daf00c90 / tool-rows97b688e5，受控证据与root真实验收分开，批准设计及13hash未改。


2026-10-15 最后终态展示补修：renderer efd2e33c继承daf，只把同scope/actualturn/structuredoutcome的普通诊断与收尾放同一行，保不同诊断与工具、legacy。strictRED→12GREEN及既有全组受控回归通过；原生验收另属root，IME仍标daf。所有Electron自测已结束，避免与root CUA同bundle守卫干扰。


2026-10-15 P3 nested真实首红补修：renderer394a7abb，按既有section身份同时保card/changes/docs内滚及outer/expanded/原入口focus；位置严格首RED→GREEN11（9bool+2快照），原全组与IME26当前字节均过。rootGUI退出后集中测试，全部窗口退出后释放slot；当前原生验收由root，批准13/依赖48未改。


2026-10-15 UI-VISUAL-V2-1：严格按e95/2547结构实施，最终rendererb5cf95d/styles56d2ff9/indexbb5c29a；3source+2tests变动，其余P1P7保留。work独立聚合实际source/received safe报告，ID只在概览去重，attempt不删。SV13 cold可靠turn中性入口/live需真实settled，flags入口可读。所有自测已quit，root接管；received受控PNG为中间帧明确excluded，不能拿它证明布局通过。


2026-10-15 原生V2空态仍指右上角首红后，仅按root授权改三处设置/资料指路字符串，当前index7beda47c、renderer5b80a727、styles56d2ff9e。无新Electron，静态67/语法/diff0；结构版full/visual等保bb5/b5执行版本，root独占GUI重载实际词句，不能将旧图当新native证明。

## 2026-10-16 F-8-b 非零退出行分类（实施轮）

客户按推荐批准（2026-10-15 评审批次，F-8-a+b 全数）。本侧实施 F-8-b：`activityOf` 结构化事实优先——`display.process.timedOut===true` → `status:"timed-out"`/「超时终止」/exceptional:true；`display.process.exitCode` 数字且≠0 且无 error/signal → `status:"exited-nonzero"`/「已执行完成（退出码 N）」/exceptional:false；无 process 事实走原路径（旧 `knownFailure` 正则保留，**事实优先**）。`renderer.js` 两处按 `status === "exited-nonzero"` 让位：error preview（L1044 一带）不摆、详情字段「消息」替「错误」（L1018）。新增状态值 `exited-nonzero`/`timed-out` 为渲染侧呈现分类，`ok/status/kind/errorCode` 契约面不动。

续接线索（事实与判断，供复验）：① 真机命中形状（证据 `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/…/实现者/replay.jsonl` L89）**必然带 `display.error`**（=工具消息回填、与 resultText 同文），故判据**不能**读 `display.error` 缺席——否则功能在真机全失效；「无 error」按派发映射为「exitCode 存在＋无 signal＋（防御式）process.error」。② `display.process.timedOut` 由运行时核心（F-1/F-8-a）在飞添加，本侧防御式读取，落地前恒缺省。③ 桌面窗口侧 session-history/runtime-history 的行归类归其 F-8-b，未同步时其行仍可能 kind:'denied'（但带 display 事实的行经本侧 activityOf 已按事实分类）。④ 已知观察项：中性类详情「消息/结果」在真机投影下同文（上游回填），未动，若消除由运行时核心评估。

证据与指纹：单测 13/13、边界内 62/62、Electron e2e 41+9 全过（`01-tool-detail.png` 见「调用发起 → 已执行完成（退出码 2）」）；`tool-rows.js 3eef5bfd`、`renderer.js 74e24c7f`、`tool-rows.test.ts d2432c7a`、`renderer.test.ts 41485c5d`、`uiux-v2.mjs d9f56499`。typecheck 本侧 0 错（两测）；全仓现存红随并行上下文在飞变化（tools.ts×3→编排 shell-gate.test.ts×1），均非本侧。Doc: docs/fix/2026-10-16_fix_kanban-f8b-tool-rows-exit-classification.md

2026-10-16 G-1 注释同步：tool-rows.js 投递归类块注释改为如实现状——派发渲染单一来源=编排 handback.ts::renderDispatchPrompt（桌面本地副本已删；G-1 的原因段/必读块等扩展不改变归类依赖的前缀特征），分类器只依赖前缀特征（`[派发] `+`来自 X 的`）。纯注释零逻辑，INJECT_PREFIXES 与全部行为不动。tool-rows 13/13、renderer 45/45、markdown+runtime-ui 17/17、dispatch-delivery+fresh-enum 20/20、typecheck 0 错。新指纹 tool-rows.js f4e19c45（旧 3eef5bfd 失效）。

## 2026-10-16 G-2/U1 恢复确认卡 + `[系统]` 消息行（实施轮）

客户按推荐批准 G-2（9 待裁点全采纳：恢复卡**不设限**、动作集 {abort-turn, rebuild-session, redeliver}、system 呈现交实现层），V1a+V1b 同轮；设计规格 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`。

本侧实施 U1：① 恢复卡=沿 shell 卡先例的**平行**实现（overlay 组件族复用 `.sc-*`；**恰 allow:true**/取消默认焦点/Esc·×=不执行/**无计时器**（等待不设限）/失效与通道未接如实「未获执行」）；模态互斥收口 `anyConfirmOverlayOpen()`（drawer inert+focusin+Tab 三处共用）；`__ansRenderer.onRecoveryConfirm` 探针导出。② `system` 类归类判据=**文首定格标记 `[系统·<子类>] `**（子类闭合 `]`、其后空白/文末、子类≤12 字无括号换行——SYSTEM_HEAD 单一改动点）；来源=系统（sourceRoleId 恒空）、行图标 shield、队列来源「系统」+不可撤回（canWithdraw 只认 message，未动）。③ 动作标签=ui-labels::recoveryActionView 纯映射（未知 ⇒ null，渲染只呈原始 token）。

待接线索（重要）：**W5（presenter/执行桥）与 O1（文案单一来源）均未落树**——渲染侧按「以 W5 交回为准」防御式接线（`if (d.onRecoveryConfirm)` 缺席零影响）；推达 payload 建议随带 projectRoot/runtime（沿 shell:confirm-request 先例，否则异引擎视图会被 Rt.matchesView 丢弃）；回包口径 {ok}/{expired:true}/{error}。**O1 若改掉 `[系统·` 标记形态，归类会静默回落普通气泡**——唯一改动点=SYSTEM_HEAD 一带（注释即契约）。W2 的队列快照 `kind:"system"` 渲染侧已就绪（summaries 短句由主进程产，无新数据源）。

测试：边界 80/80、桌面目录 321/321、e2e G2 5 项 + COMPLETE_FLOW 41 + 默认台 99、typecheck 全仓 0 错。指纹：renderer 928ffacd / tool-rows 02d75fb2 / ui-labels 564fdb9a / index a39e3652 / styles dbbb66f0 / tool-rows.test 6881dc34 / renderer.test 606e5287 / uiux-v2 aa8565bb。证据：`docs/fix/2026-10-16-g2-recovery-card-evidence/`（卡面两档截图 + 三份 report）。Doc: docs/fix/2026-10-16_fix_g2-recovery-card-and-system-rows.md

## 2026-10-16 视觉收敛 v3 实施轮（间距/密度/相位合并/转轮）

客户「按推荐批准，开始实施」（只做 ①–⑦；**W8 不在批准清单，未做**；§二(c) 不动清单零触碰）。设计 2026-10-16_design_visual-convergence-v3.md。本侧落地：W1–W6 按默认档（gap16/p10/h3 16-6/气泡9-14+24/输入区14-32-12+空框28/活动行5/注入盒1.6）、W6b 系统行 `displayBody` 去前缀、S1 相位合并（`tool-rows.js::mergePhases` 下标映射 + `fillActivities` 终态渲染，`data.items` 本体不动）、S4 `callSummary`「N 个调用/· 异常 M」、S2 chip margin-left calc（实测 x 240→384 diff 0）、S3 chip 可见⇒尾行让位（`opChipShown()` 判据、updateOpChip 三口回呼联动）、W9–W11 `role-status.js::SPINNER_SVG` 单点（iconHtml 决胜 + 尾行 + loading；`.spinner` 退役；v3spin 0.9s 恰两条规则；reduced-motion 全局兜底）。

续接线索（重要，供复验）：① e2e 验收段在 `uiux-design-audit.mjs` 的 **v3 段**（30 断言，失败即非零退出）；其 runtime-config:get 夹具已修为新形状（旧形状会顶 48px 顶部告警条挤压视口——UIUX 亦记录过该过期提示）；**密度转录顺序敏感**：全量回放会重建 pane 并清空 #chat 子节点（chip 元素随之离场，直到下次 updateOpChip）——夹具按「卡/系统行先到达、回放后、live 系统行垫底」构型；chip 可见态另以同角色重选单验。② `_activity-phases`/`data-activity-index` 口径：捕获用首相位下标，恢复选择器已加 `[data-activity-phases~=]` 兜底。③ 已知跨边界：main.mjs 的 `ROLE_STATE_BADGE_HAS_ICON` 因纯 SVG ts-ico 失效（需桌面窗口侧改查 `.ts-ico svg.spin-arc`）；main.mjs 另有存量过期红（badge 已挂 tab-work 却查 tab-card，且在此空指针崩溃）——非本批引入但需同步。④ v2 基线修订 5 处断言（旧→新与理由见 fix 记录 §4），不属「放松断言」而系批准的口径变更；后续若客户回滚 v3，按记录 §5 分项还原。⑤ 工作概览队列条目的 `[系统·X]` 前缀未动（W6b 只含聊天流系统行；主进程 summaries 原文）。

证据与指纹：`docs/fix/2026-10-16-visual-convergence-v3-evidence/`（v3-after-*.png + audit-report.json）；role-status ba3051c8 / tool-rows 3f851983 / renderer 0d704b44 / styles 7f83b2bc / tool-rows.test a0915e71 / renderer.test 74630b45 / uiux-v2 08aa1845 / uiux-design-audit 9d1b05c9。Doc: docs/fix/2026-10-16_fix_visual-convergence-v3-implementation.md

## 2026-10-16 U1 提示条补滚（桌面窗口 e2e 路由缺陷修复轮）

桌面窗口自检台定位、PM 路由：`U1_WINDOWED_TO_BOTTOM` 确定性 false（dist=18px），V2 批 fd0ac73 引入。根因链：V2 把提示从聊天区下方搬到上方 `.session-notice` 条（空时 display:none 零高）→ 点角色立即贴底（dist=0）→ selectRole **异步尾部**的 `setHint(res.note)`（「…续接当前会话。」）让条 0→≈19px 展开、#chat 变矮 18px 且无补滚 ⇒ 距底恰 18px。

本侧修法（最小、保持既有滚动语义）：`renderer.js` 新增 `noticeLayoutPin()`+`restickAfterNoticeChange(pin)`（L148/L157），包住同一根条**两个写方**（`setHint`、`renderContextState` 的 `#history-projection-note` 写入）「先量后写」——改前按 S-1 同款判据（`UiLabels.stickToBottom`+`STICK_THRESHOLD_PX=24`）记「是否在底部附近」＋条高；改后**条高确有变化且原在底部**才补 `chat.scrollTop=chat.scrollHeight`（上翻者不打扰/高度不变不动/`batchDepth>0` 照 Q-1 只登记/`backgroundDelivery` 放弃）。强制贴底与 S-1 流式粘性逐字未动；无计时器。

续接线索（事实与判断，供复验）：① 判据挂在「**条高变化**」而非任一事件上——若未来把提示条改回零高驻留/并入别处，助手行为自然失效为 no-op，需随设计重定；② 同族两条（`#runtime-config-notice`/`#switch-confirm`）出现时同样使 #chat 变矮，本轮**范围外未动**，同一「量—写—补」范式可平移（建议单独批次）；③ 手输仿前缀：实时路径已由身份绑定保护（`bindManualTurn` canonical `["input",turnId]` + `appendOneEvent` 同键去重）；**回放路径为残余边界**（历史行无身份 ⇒ 仿前缀手输行回放时归成注入行，呈现层来源张冠李戴、无数据/授权面影响）；最小修复=历史行携带投递身份（落点 `app/desktop/session-history.ts` + 编排 `handback.ts` 族，**跨本侧边界**，未实施、建议路由）；④ 过时注释已同步三处（L2325/L4208/L3233 一带，含「15s 防误伤」启发式 fca8f6b 已删→身份绑定；`lastManualSend` 无读取方、仅记录——勿据此记录做归类判断）；⑤ 2026-10-14 changelog 旧「U1 偶发/夹具时序、无法复现」定性就此被确定性机制替换；⑥ 桌面窗口 main.mjs 只读运行、未改。

证据与指纹：桌面窗口 e2e `E2E_DONE=1`、U1_WINDOWED_TO_BOTTOM dist 18→0 转 true（U1_NORMAL/U1_REPEAT、S-1 五组粘性断言全 true 不变）；边界 354/354；全仓 1678（1677 过/0 败/1 跳过）；typecheck 全仓 0 错；uiux-v2 默认 99。`docs/fix/2026-10-16-u1-notice-restick-evidence/`（before/after 关键行 + 修复轮完整报告）。renderer.js 3179388f（原 0d704b44）/ renderer.test.ts d2c267f6（原 74630b45）；其余文件零触碰。Doc: docs/fix/2026-10-16_fix_u1-notice-restick.md

## 2026-10-16 工具行折叠（客户批准口径）实施轮

客户批准口径（2026-10-16 定稿，登记＝PM `2026-10-15_change_kanban-fixes-pm-review.md` §伴随项）：同一轮内连续工具行**轮结束后折叠成一行**「▸ 本轮 N 个调用：role_status / run_shell ×5 / write_file」、**运行中不折叠（逐条实时）**、展开**零丢失**、折叠态**显式标出未放行/失败**。派发＝v1.2.0 CI 触发之后。本侧落地：`tool-rows.js::callSummary` 拆 `{calls, denied, failed, unknown, tools}`（工具分解首现序×k；未放行优先；旧 exceptional 拆分）、`renderer.js::foldSummaryText`（「本轮 N 个调用：… · 含 X 条未放行/含 Y 条失败/含状态未记录」）+ 开合状态机（`groupManualOpen`/`groupDefaultOpen`/`syncGroupOpen`/`foldTurnGroups`；运行中默认展开、settled 折叠、手动开合会话内优先、焦点在组内不收）+ **未放行/失败相位并入同轮同 callId 组行**（组不切断；独立未放行行照旧直显不折叠——治理信号纪律未动）；CSS `.record-count` 去缩进+可换行。

续接线索（事实与判断，供复验）：① **批内不做布局变更**——settle 事件在事件批里，批内折叠会撞「spacer 未落定」中间态且令 `appendTurnTerminal` 的 `streamShouldPin` 误读「在底部」强制贴底（首跑 e2e 实测：锚点偏移 +6px 且视口被拉到最底）；现走 **`flushBatchSideEffects` 收尾挂点 `flushDeferredFolds()`**（贴底/窗口落定之后；**无计时器**——renderer 六处既有「无计时器」守卫钉住，勿用 setTimeout 规避，2026-10-16 首版实现因 `setTimeout` 直接顶红 6 条守卫）。② **锚点口径**：折叠与手动开合**同序**（先翻 open、再 capture、再实测+restore）——文档中部阅读态零位移（150→150→150）；**尾部阅读态**（锚点下方不足一屏）浏览器按上限夹取自然位移（本夹具 6px）且不累积——物理边界，任何文档尾收缩同此；e2e 两个态分别断言（中部 <2px、尾部 ≤20px 且 after===later）。③ **旧断言修订三处**（批准口径变更，NOT 放水）：tool-rows `callSummary` deepEqual 全等换新字段、renderer 守卫「· 异常」文案换「含 X 条未放行/失败」+8 条新接线钉、uiux-v2 `one canonical lifecycle` 文本 1→2（并入组者：行 1+摘要分解 1）且**加固**为按行断言（`.tool-activity` 恰 1 行含该名）。④ **口径边界**：带 display 的 `.tool-call-record` 生命周期行**不并入**本折叠（本就是逐条一行形态，F-8-b 分类共存）；若客户要连其折叠属行模型级改造，须单独提案。⑤ 「assoc」规则：仅同轮同 callId 且该调用已有行在本组时相位并入；无 callId/无匹配 ⇒ 维持断组+独立行（不发明身份）。e2e 段 `ANS_TOOLFOLD_UI_ONLY=1`（19 项+5 截图）。

证据与指纹：边界 88/88；uiux-v2 全家族全过（含 TOOLFOLD 19）；ime exit 0、bench BENCH_DONE、审计 30/30；typecheck 全仓 0 错。`docs/fix/2026-10-16-toolrow-turn-collapse-evidence/`（5 截图 + report.json）。tool-rows.js 2fd2335f / renderer.js 27d72e8e / styles.css 7cf067d4 / tool-rows.test.ts a599d1da / renderer.test.ts db80beee / uiux-v2.mjs 0a1439de。Doc: docs/fix/2026-10-16_fix_toolrow-turn-collapse.md

## 2026-10-16 G-4/I7 安装工具行/系统行如实标注（零改动实证轮）

客户 2026-10-16 批准 G-4 V1（含 I7 行样式，属主桌面UI；设计 `2026-10-16_design_role-capability-install` §5.4/§九：复用既有工具行与 `[系统·…]` 先例）。核查结论＝**`app/renderer/**` 零改动**（沿 G-3「合流即桌面零改动」先例），只在 `test/桌面应用/` 加 4 例断言（tool-rows +3：`[系统·安装]` 归类（chip「系统消息 · 安装」/displayBody 去前缀/回显回放同解）、`install_skill`/`uninstall_skill` 结构化＋legacy 两路径通用渲染（非 SPECIAL_TOOLS ⇒ 折叠计数适用；`ok:false` 回执走既有 failed 口径且护栏 reason 保留）、折叠分解含新名；renderer +1：零特判源码守卫——四源文件去注释后对两工具名与 `[系统·安装]` 零引用、tool-rows 代码不含任一子类名、无 `.is-system-` 样式变体、渲染侧不持第二份 SPECIAL_TOOLS）。

续接线索（事实与判断，供复验）：① **I3（桌面窗口）系统行产出尚未落树**——本批按冻结形态核查；真机/E2E 观测（装-看-用-撤链上两行实际呈现）属 E2E 轮。② **标记形态契约**：产出方若改 `[系统·` 标记形态（或标记前有非空白），归类静默回落普通气泡——单点＝`tool-rows.js::SYSTEM_HEAD` 一带（注释即契约，同 G-2 注记）。③ **卸载行子类命名**归属文案单一来源裁定（本批按任务冻结面 `[系统·安装]` 即安装/卸载完成行断言；渲染侧零登记——若另立 `[系统·卸载]` 同样覆盖，形态判据）。④ **两条呈现路径**：真实投影事件恒带 display ⇒ 生命周期独立行 `.tool-call-record`（L1193 工具名直出）；无 display/降级 ⇒ 轮内工具组（折叠摘要按名计数）——两路共用 `activityOf` 事实单点、零特判；真机落哪条未观测。⑤ 队列条目 `[系统·X]` 前缀摘要由主进程产（W6b 只含聊天流，沿 v3 memo ⑤），本批未动。⑥ 回放仿前缀残余边界（历史行无投递身份）为 U1 批已有登记，非本批。

证据与指纹：桌面目录 **358/358**（原 354＋4）；typecheck 全仓 0 错；全量 **1814 计 / 1809 过 / 4 红（他域已登记预期红：test/测试 g1-verify ×3＋g3 pi-loopback ×1，与本批零交集）/ 1 skip**。`app/renderer/**` 零触碰——renderer 27d72e8e / tool-rows 2fd2335f / ui-labels 564fdb9a / styles 7cf067d4（与工具行折叠批逐位一致）；`tool-rows.test.ts 52c2c4e7`（原 a599d1da）/ `renderer.test.ts 3bce42fb`（原 db80beee）。Doc: docs/fix/2026-10-16_fix_g4-i7-install-row-annotation.md

## 2026-10-16 G-4/V2-MCP MCP 工具行/安装行如实标注（零改动实证轮）

客户 2026-10-16 批准 G-4 V2（MCP 安装）分批实施（P1 Claude → P2 Codex → P3 Pi）；V2 范围⑤「呈现行」属主桌面UI（设计 §5.4：`install_mcp` 调用按既有工具行渲染＋`[系统·安装]` 定格系统行，「与技能同链，不另造行体系」）。核查结论＝**`app/renderer/**` 零改动**（沿 G-3/G-4-I7 先例），只在 `test/桌面应用/` 加 4 例断言：①`mcp__<server>__<tool>`（三平台探针定格形态——Claude `mcp__probe__echo`、Pi 清洗 `[^A-Za-z0-9_]`→`_`＋超长 `_<hash8>` 缩短、Codex server 名 `-`→`_`）经通用工具行链零特判——名称解析（结构化直出＋legacy `[\w.-]+` 正则含下划线）、屏障表不含 MCP 形态名、折叠计数按名直出、详情 `toolDetails` 零工具名引用（display 驱动）；②`install_mcp`/`uninstall_mcp`（设计 §3.2 冻结名）工具行通用渲染；③`[系统·安装]` 系统行＝既有子类路径复用（**无需新登记**——判据只依赖 `[系统·<子类>] ` 标记形态）。

续接线索（事实与判断，供复验）：① **三平台适配器发射面未落树/未接**——Claude 两发射点（hook start＋泵 result）探针实测「现均不存在」属 P1；Codex `mcpToolCall` item→行映射 wave B 落地（item 字段全集已定格；探针注「是否列入隔离属 P2 评审、建议不隔离」）；Pi 属 P3——渲染侧收口形态＝`kind:tool_call/accepted/denied`＋`detail.toolName`，三平台同款，本批只核查渲染侧。② **Codex 呈现名选择**（`server:"probe-surface"`＋`tool:"echo_probe"` → `mcp__probe_surface__echo_probe` 还是 `server/tool`）归 wave B 裁定——渲染侧名称逐字直出、两种形态均覆盖。③ **失败态映射**（Codex 审批拒绝 `status:"failed"`＋核内文案）经适配器后的行分类文案归 wave B；渲染侧按既有 `ok/status` 字段单点判类不改。④ **display 投影面**：MCP 事件 `display.target`（kind path|command，`ToolDisplayV1` 合同 src/model/runtime.ts L656–658）由投影方产出——渲染侧通用呈现、零特判。⑤ **系统行文案产出方**未落树（标记形态契约单点＝`SYSTEM_HEAD`，同 I7 注记②）。⑥ 运行时侧本批事实（只读）：`SU_PREAUTHORIZED_WRITE_DIRS` 已见四棵（含 `docs/mcp`）、`install_mcp`/`uninstall_mcp` 契约已定型于 `src/model/runtime.ts`（V2 wave A 并行在飞）——全量红均属这些在飞翻转钉（4→11 随落地变动），与本批零交集。

证据与指纹：tool-rows.test.ts **24/24**、renderer.test.ts **55/55**、桌面目录 **375/375**（并行 wave A 窗口内复跑仍全绿）；typecheck 全仓 0 错；全量两快照 1884 计 / 1879→1872 过 / 4→11 红（全＝他域在飞钉：test/测试 g1-verify・g4-skill-verify ＋ test/门禁引擎，属测试/门禁引擎/编排）/**1 skip**。`app/renderer/**` 零触碰——renderer 27d72e8e / tool-rows 2fd2335f / ui-labels 564fdb9a / styles 7cf067d4 / index a39e3652（与 G-4/I7 批逐位一致）；`tool-rows.test.ts 225e69ae`（原 52c2c4e7）/ `renderer.test.ts d06e7bfc`（原 3bce42fb）。Doc: docs/fix/2026-10-16_fix_g4v2-mcp-row-annotation.md
