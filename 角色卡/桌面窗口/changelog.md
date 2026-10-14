# 桌面窗口 变更记录

- 2026-10-14：客户确认双括号字印并要求更新README和桌面图标；两处共用 `app/desktop/assets/ans-bracket-seal.png`。窗口/macOS Dock 独立检查、typecheck与diff检查通过。[记录](docs/change/2026-10-14_change_bracket-seal-icon.md)。

- 2026-10-14：按客户要求接入悬桥 A 窗口与 macOS Dock 图标；真实 Electron 独立检查通过。客户随后指出与整体风格不搭，产品与 UI/UX 结合现有 CSS 和界面截图重新讨论，生成暖灰/炭灰「双括号字印」PNG 候选 `app/desktop/assets/ans-bracket-seal-concept.png`，尚未替换运行时配置。[接入证据](docs/change/2026-10-14_change_suspended-bridge-icon.md)。

- 2026-10-14：创建——按客户「桌面拆分成两个角色吧，一个UI，一个window相关的」从「桌面应用」拆分：本角色承接 Electron 主进程、窗口生命周期、preload 受限桥与桌面会话装配（`app/main.ts`、`app/preload.cjs`、`app/desktop/` 与主进程侧测试）。**客户 2026-10-14 确认原话「桌面UI/桌面窗口 这个可以」——已确认生效**；旧角色目录原位冻结为归档。Doc: docs/design/2026-10-14_design_role-split-window.md

- 2026-10-14：**拆分落地：样例角色 id 更新（本角色侧待办件，PM 派发执行）**。`test/桌面应用/` 5 个文件（`session`、`operator-channel`、`project`、`p0-halt-and-images`〔清单外同因转红〕与 `e2e/main.mjs` 85 处）里以「桌面应用」为样例角色的引用改指「桌面窗口」；`firstProjectFilePath` 期望按新边界重新推导为 `app/main.ts`；`project.test.ts` 按新枚举事实重写断言（含「冻结目录被跳过并提示」「桌面UI 与 桌面窗口 两个新角色」）。e2e 保留 2 处 `test/桌面应用/` 目录路径（目录名沿用拆分前）。证据：三个指定单测 **42/42 全过**；全部边界内单测 **207 计 206 过 / 1 红**（唯一红=既有基线 `pi-config.test.ts` 检出目录名断言）；`npm run typecheck` 整仓 0 错；e2e 退出 0，与拆分前留档报告逐行对照仅预期差异 + 一条被改名揭开的陈旧抽屉检查（界面断言同步待办，交 PM）。**未改 `app/**`、`src/**`、`test/测试/**` 及任何其他角色文件。** Doc: docs/change/2026-10-14_change_split-role-id-test-updates.md

- 2026-10-14：**抽屉/队列 e2e 断言同步至 UIUX v2 现行结构（PM 同日跟进派发）**：6 处 log-only 检查按现行真实结构重锚（`RIGHT_HAS_TODO_SECTION`→工作列表区存在；`RIGHT_HAS_OVERVIEW_SECTION`/`QUEUE_OVERVIEW_ROWS`/`QUEUE_OVERVIEW_IN_CARD` 随语义改名 `RIGHT_QUEUE_SINGLE_LIST`/`QUEUE_POSITION_ROWS`/`QUEUE_POSITION_IN_CARD`；`RIGHT_QUEUE_RUNNING_FIRST`→is-running+「当前工作」组；`RIGHT_QUEUE_EMPTY_PLACEHOLDER`→「无进行中或排队消息」）；**未升级严重级**（保持 log-only）。证据：e2e 重跑退出 0、6 处转真、与上轮逐行仅差这 6 处+路径+堆栈行号、仍停在既有基线红（`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`）；报告留档 `docs/change/2026-10-14_drawer-check-sync-e2e-report.txt`。同族「文案/格式面」5 行脱节如实列名交 PM 决定（见 change 记录跟进节）。

- 2026-10-14：**锚点漂移修复候选（renderer.js `402e49a7…`）e2e 核对**：重跑 5 次，与今日两轮对照内容级无新增差异、仍停同点位基线红、6 处抽屉/队列断言全真；唯一例外=首跑 `U1_WINDOWED_TO_BOTTOM=false`（1/5 偶发，4 次复跑全真）——修前样本 0/4，不足以归因，交 PM 定性；未改 main.mjs 等待与断言。报告留档 `docs/change/2026-10-14_anchor-drift-fix-e2e-report{,-trial2}.txt`。Doc: docs/change/2026-10-14_change_split-role-id-test-updates.md（跟进 2 节）

- 2026-10-14：**归档收口同步（归档键约定——同日演进，取代上午的 .frozen 改名过渡）**：旧目录改以 `boundary.yaml` 顶层 `archived: true` 归档（枚举**静默跳过、零提示**；不可开启；边界不予采用）。`project.test.ts` 归档断言由「跳过并提示」更新为「`warnings == []` 且角色表不含「桌面应用」」（未放宽其余断言）；三件套复跑 **42/42**、e2e 按新仓态复跑与上轮**内容级零差异**、仍停既有基线红。报告留档 `docs/change/2026-10-14_archive-key-e2e-report.txt`。Doc: docs/change/2026-10-14_change_split-role-id-test-updates.md（跟进 3 节）

- 2026-10-14：**两项维护事项落地（A 诊断基线红修复 + B 残留清扫；产品评审 + PM 派发）**。**A**：S-1 段夹具工具事件改**生产形状**（`detail{toolName,path,turnId,toolCallId}`、每条唯一 `turnId`，helper `s1Event`）⇒ 组行逐条成行、真窗口化、`renderer.viewport` 真发出——**`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 由恒红转 true**，尾部 `MAC_CLOSE_REOPEN_*` 两条 + `E2E_DONE=1` 恢复运行；`S1_WINDOWED_ACTIVE` 重锚行模型事实（≥150 行 + 挂载<总行数 + spacer 撑高，弃常驻元素双真）；五事件集合/严重级/`VIRT_MIN_ROWS` 一字未动（评审六禁项全守）。**B**：5 行 log-only 检查按现行口径重锚（`SU_WRITE_NOTE_WRITES_IMPORTED`/`RUNTIME_NOTE_WRITES_IMPORTED` 两处改名；`TOOLROW_HAS_PATH` 改锚 `.activity-op/.activity-target` DOM，夹具生产形状，`TOOLROW_NO_CONTENT` 保留）；11 个边界内测试头注、`project.ts:224` 样例路径、3 处「归属：」句改「桌面窗口」（纯注释面，行为零改动）。证据：e2e **连跑 5 次 + 最终文件复跑 1 次**（67–68s/轮、无 WATCHDOG，run6 与 run1 内容级零差异）——`DIAGNOSTICS=true`、`E2E_DONE=1`、`S1_STAYED_AWAY` 转真、B.1 五检查全 true、**轮间内容级零差异**、`U1_PANE_HEIGHT` 恒 13689（评审观测的 13577/655 不稳定态未复现）；与修复前留档对照＝纯预期位移清单（无新增回归）。`node --test test/桌面应用/*.test.ts` → 206/207（唯一红=pi-config 基线）；typecheck 0 错。报告留档 `docs/change/2026-10-14_diagnostics-fix-runs/run1–6.txt`。Doc: docs/change/2026-10-14_change_split-role-id-test-updates.md（跟进 4 节）

- 2026-10-14：D1 多引擎会话、设置、安全应用点、历史与确认失效接线；171/171 窗口单元与 strict tsc 通过，真实窗口待 T1。Doc: [实施记录](docs/change/2026-10-14_change_multi-runtime-window.md)。

- 2026-10-14：D1R 保留历史行原turnId/eventKind并统一activity ID，受影响37/37与tsc/diff0；真实history/live重复保护待U1/T1。Doc: [修复记录](docs/fix/2026-10-14_fix_history-turn-metadata.md)。

- 2026-10-14：D1R2 真onTurnStarted ack绑定原客户显示ID，匿名/queued/failed/aborted来源隔离，受影响101/101与tsc/diff0；真实窗口由U1/T1续验。Doc: [修复记录](docs/fix/2026-10-14_fix_client-message-origin.md)。
