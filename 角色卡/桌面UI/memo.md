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
