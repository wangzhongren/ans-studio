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
