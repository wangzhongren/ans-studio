# 桌面UI 变更记录

## 2026-10-21：Phase 4A UIUX M1–M6 修正（needs-work → 修正）

**UIUX Phase 4A 评审修正（needs-work，M1–M6，2026-10-21）**：①队列子视图（同一 424 抽屉，标题「<角色> · 队列」/返回来源/当前+排队全量；工作概览与资料仅预览前 3 条排队，>3 显示「查看全部队列」；`#right-queue-body` 唯一、`state.rightTab` 不新增值）；②撤回回执——成功聊天流「已撤回排队消息：…」，失败/异常保留就地回执并追加 system 行；③设置 Tabs ←/→/Home/End + roving tabindex + aria-controls/tabpanel；④保存条 `.pi-status` 64px 内两行完整（键数/缺项数+应用时点，完整逐键文案在 title）；⑤角色头 `statusBadge(status,0)` 状态-only；⑥补 960 焦点/Esc/inert 独立断言与 200% 实测。门禁重跑：冒烟 99/99 + 28 截图；CONFIG 20/20、ROLE_FOCUS 9/9、默认段 4A 项全过；gzip 263,904B；bench 3 有效轮全过；C1 Δ=16；3B 冒烟 45/45。详见 [4A 变更记录](docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) §三·五。

## 2026-10-21：Phase 4B 范围/写集规划（仅规划，未写实现）

- 按 PM §十四 4B 授权产出[4B 范围与写集清单](docs/design/2026-10-21_design_ui-platform-phase4b-scope.md)：功能面（QUEUE_VIEW/operator 聚合、治理三权/镜像/记录动作、报告全文/persistence/delivery、operator 镜像、replayAnchorDebug、single 警告刷新、judge 跨引擎重放、菜单配置状态、queueView tab 切换、C2 重锚）、写集与解冻清单（chat-store/ChatRow/ChatStream/confirm-store/events.ts 最小解冻理由；App 不动）、扩展点、驱动/契约 #12/#13/#17/#19、测试计划（纯逻辑/4B 冒烟/uiux 段/QUEUE_VIEW/MIRROR/治理 reaccept/报告卡）、零新增依赖、热路径重基线/C1/IME、风险与待 PM 复核点。**仅规划，未写实现代码**。

## 2026-10-21：Phase 4A 实施——引擎真实切换/三引擎设置/角色资料与文档/工作概览/队列抽屉

实施——按 PM §十二放行与 UIUX 4A 设计：①`selectRuntime` 真实切换（每项目×引擎视图缓存、三元身份 open/history、切回重放、后台只缓存、旧项目丢弃、迟到结果不覆盖）；②每引擎草稿/附件（runtime×role 内存，成功发送/显式移除/切项目清除）；③三引擎设置面板（metadata 驱动、Pi 3 必填+推理选择+高级两 Slider、Codex/Claude 字段、秘密掩码/显示、固定 64px 保存条、保存 loading/saved/missing/error/晚到、缺配条 + 打开设置）；④角色资料四节 + 待办/队列预览 + 文档只读（opaque ID、错误码/重试/链接/焦点/迟到失效）；⑤工作概览（待处理定位/当前工作/排队/最近回交、角标拆分、唯一 `#right-queue-body`）；⑥队列区注入地回执/撤回；⑦新 `components/ui/slider.tsx`（Base UI copy-in，零新增依赖）；⑧Sidebar 最小修改（`#tab-pi` 启用、角色「当前+排队」计数、树分组扁平化/组长在前）；⑨`chat/extensions/`、`driver-extensions/` 扩展点；⑩契约面/组件台账/证据。

**PM §十三 裁定落地（2026-10-21）**：①批准并实施 `chat/ChatRow.tsx` 唯一最小冻结例外——失效/已答 operator 卡 `closed` 时隐藏 confirm/deny/submit/cancel（保留 disabled/finalNote/aria/卡片容器，旧 freezeOperatorCard 同义）；②左树单计数——`.ti-count` 唯一可见数字（当前+排队），状态标签 `statusBadge(status,0)` 只表达状态，队列深度进 title/aria 与工作概览；③judge 跨引擎重放归 4B（契约面注明）；④C2 按同因既有基线红待 4B/5 重锚，不阻塞 4A。

门禁（§十三 后重跑）：typecheck 0 错、build 成功、CSP 严格、gzip 263,098B ≤300KiB；旧基线 679/679；新纯逻辑 67/67；IME 24/24；懒挂载 10/10；4A 冒烟 70/70 + 20 截图；bench（旧/新交替 4 轮，首轮预热，3 有效轮中位）全部阈值通过；C1 Δ=16。uiux-v2：SELECTOR 26/26、CONFIG 20/20、ROLE_FOCUS 9/9、SEND_FACTS 8/8；RUNTIME 13/14 通过（此前阻塞项已通关，余 C2 同因旧红）；默认段 4A 项全过、止于 Phase 5 项；VISUAL 止于 4B 报告卡项。详见 [4A 变更记录](docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) 与[证据](docs/change/2026-10-21-phase4a-evidence/)。

- 2026-10-21（治理边界·UI 平台化）：ANS Team Formation 依据客户 2026-10-21 审阅「UI 平台化」方向后的「开干」指示与已接受的默认值「Vite 只构建渲染层、主进程保持无构建」，按项目管理评审 §四边界缺口清单，在本角色 Section 1：①新增目录条目 `test/桌面UI/`（渲染层 React 组件与设计系统守卫测试；独立目录，与桌面窗口的 `test/桌面应用/` 精确文件授权互不重叠）；②在既有目录条目 `app/renderer/` 的用途说明中补充「包含渲染层 React 源码（src/）、样式、组件、渲染层 tsconfig/components.json 与构建产物（dist/）」——权限范围仍是目录整体授权，未新增逐文件条目。`boundary.md` 与 `boundary.yaml` 同步逐条对应（各 20 条）。未改应用代码或测试、未改角色卡。见[治理记录](docs/change/2026-10-21_change_ui-platform-boundary.md）。

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

## 2026-10-17：整页等宽字体（客户裁定「和 claude code 一样」→ 整页等宽终端感）

客户逐字「字体设置成和claude code 一样的字体」，并选择「**整页等宽（终端感）**」。`app/renderer/styles.css` `:root`：
- `--mono: ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Consolas, "Liberation Mono", "Microsoft YaHei", monospace;`
- `--sans: var(--mono);`（单一来源，避免 sans/mono 漂移）——UI 标签/按钮/标题/消息/表格全部走该栈；中文由 `"Microsoft YaHei"` 兜底；不引入外部字体文件或专有 Anthropic 字体。
- `index.html` CSP 保持 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`——本地系统字体不触发网络/资源加载，**无需新增 font-src**；未改 HTML。
- A1+A2 基线保持：900 内容列、三条结构线、贴底输入区、body 13px/1.55、消息 15px/27px 均未改；未因换字体调整字号。
- 测试：`renderer.test.ts` 新增字体栈用例（等宽栈逐字、`--sans` 复用 `--mono`、无 system-ui/Segoe UI 主字体、中文回退、无外部/专有字体、CSP 与字号基线）；renderer **70 计 / 66 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5）。真实 Electron：`ANS_VISUAL_V2_UI_ONLY=1` **VISUAL_V2_PASS 36**、`ANS_TERMINAL_UI_ONLY=1` **TERMINAL_PASS 14**；默认套件仍只在既有 `virtual visible nonempty` 失败（行号随本轮新增 e2e 用例后移至 :1056，同一基线红）。
- 指纹：`styles.css 773200fa`、`renderer.test.ts 8c61cd01`。

## 2026-10-17：可收起左栏（客户反馈「左边和内容区域不太协调…最好左边能收起来」）

- **交互**：展开态 `.col-left` 品牌区右上角 `#sidebar-collapse`（`‹`，aria-label「收起左侧栏」）；收起态 `.col-left` 完全隐藏（栅格首列 0、不占位），内容区左上 `#sidebar-expand`（`›`，aria-label「展开左侧栏」）始终可达；原生 `<button>` ⇒ Enter/Space 可触发，无新快捷键、不与窗口按钮/拖拽区冲突。状态单点＝`.app.is-sidebar-collapsed` 类。
- **持久化**：`localStorage["ans.sidebar.collapsed"]`（`"1"` 收起 / `"0"` 展开；默认展开）；读写各自 try/catch，坏值/异常经 `ui-labels.js::sidebarCollapsedFromStorage` 回退展开。切换前记 `#chat.scrollTop`、改后回写（正文列宽不变时滚动位置保持；960 档收起使内容列变宽、内容变矮时按浏览器上限夹取，不退到顶部）。
- **协调/稳定**：收起后内容列仍为 `var(--content-max)=900px` 居中；`.chat-head`/`.composer` 的 y 不变；无页面横向溢出（1362/1280/960 实测）。过渡：宽档（≥1101）`grid-template-columns` 160ms + 左栏 opacity/padding；窄档不参与栅格过渡（避免窗口跨 1100 断点时内容列短暂错位），仍保留 opacity 过渡；`prefers-reduced-motion: reduce` 全部禁用。A1+A2 的框线/900 列/贴底/重量体系未改；未新增字体/颜色。
- **测试**：`renderer.test.ts` 新增收起左栏用例（默认展开、存储解析坏值回退、单点类判据、按钮显隐/可达、滚动先量后改、160ms/reduced-motion、900 列保持）；renderer **71 计 / 67 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5）。真实 Electron `ANS_VISUAL_V2_UI_ONLY=1` **VISUAL_V2_PASS 42**（新增 1362/1280/960 收起/展开 6 项几何与截图）；`ANS_TERMINAL_UI_ONLY=1` **TERMINAL_PASS 14**；默认套件仍只在既有 `virtual visible nonempty` 失败（行号随新增用例移至 :1068，同一基线红）。
- 指纹：`renderer.js 2a74a347`、`index.html 6a1641b9`、`styles.css 7d8abbc2`、`ui-labels.js 4799508d`、`renderer.test.ts a65533c2`、`uiux-v2.mjs 65de9503`。

## 2026-10-17：左栏宽度可调（248px + 可拖拽）

客户选择「**248px + 可拖拽（推荐）**」：
- **默认/范围**：默认 248px，范围 208–360px。`.app` 栅格首列改为 `var(--sidebar-width)`（窄档同样使用该变量）；`:root { --sidebar-width: 248px }`。拖动/键盘只改该变量与分隔线 aria，不重建 DOM。
- **分隔线**：`#sidebar-resizer`（`role="separator"`、`aria-orientation="vertical"`、`aria-valuemin/max/now`、`tabindex="0"`、`cursor: col-resize`）贴左栏右缘；**不与收起按钮重叠**、不进入标题栏拖拽区。Pointer 拖动（`is-sidebar-resizing` 期间禁用宽度过渡，松手恢复并持久化）；双击复位 248；←/→ ±8px、Shift ±24px。
- **持久化**：`localStorage["ans.sidebar.width"]`；纯函数 `ui-labels.js::clampSidebarWidth/stepSidebarWidth`（默认 248、越界 clamp、坏值/非数回退 248、四舍五入）。读取 try/catch，写入 clamp 后持久化。
- **折叠保留**：折叠只切 `.app.is-sidebar-collapsed`（栅格首列 0），宽度变量与 aria 原样保留；展开恢复上次宽度。
- **窄窗口（≤1100）**：不额外响应式 clamp——960 档默认 248 时内容列 664px、无横向溢出（展开后 `.chat-pane` 随容器流式收缩）；拖动到 360 时仍无横向溢出，仅阅读列更窄。A1+A2 的 900 列、框线、贴底与等宽字体保持。
- **测试**：renderer **72 计 / 68 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5），新增宽度用例（默认/clamp/坏值/持久化/拖动/双击/键盘/折叠保留）；真实 Electron `ANS_VISUAL_V2_UI_ONLY=1` **VISUAL_V2_PASS 46**（新增默认 248、拖动 328、双击复位、Shift+24、折叠保留 5 项几何与截图：`visual-resized-1362.png` / `visual-width-reset-1362.png`）；`ANS_TERMINAL_UI_ONLY=1` **TERMINAL_PASS 14**；默认套件仍只在既有 `virtual visible nonempty` 失败（行号移至 :1083，同一基线红）。
- 指纹：`renderer.js 13edf327`、`index.html a894a25e`、`styles.css 3ba8adf7`、`ui-labels.js b935c072`、`renderer.test.ts 0f83061c`、`uiux-v2.mjs 30f68cc4`。

## 2026-10-17：左树选中项滚动定位（248px + 9 角色时主入口被滚出视口）

实机反馈：`.tree` `scrollTop=91`（clientHeight 500 / scrollHeight 591），主入口 `su` rect y=153、高 58、视口从 y=216 开始——选中项被滚出可视区，看起来像「主入口消失」。
- **实现**：角色树项加 `data-role-id`；新增 `ensureRoleTreeVisible(roleId)`：找到目标项后按 `.tree`/条目 rect 计算**最小位移**（上方对齐顶、下方对齐底），已完整可见（±1px）则**不动**——不强制 `scrollTop=0`，保留用户手动滚动。纯位移单点 `ui-labels.js::roleTreeScrollDelta`（非法输入 ⇒ 0）。在 `applyListing`（导入/刷新，取 `selectedRoleId || primaryRoleId`）与 `selectRole` 渲染树后调用。未用 `scrollIntoView`（避免连带滚动其它容器）。
- **不变项**：248px 默认/208–360 拖拽、折叠/展开、900 内容列、贴底、等宽字体与 A1+A2 体系均未改。
- **测试**：renderer **73 计 / 69 过 / 4 红**（既有基线 N-1、data-state、P1-3、G-5），新增左树可见性用例（可见不动/上下最小位移/±1 容差/非法不动/两处调用/不强制回顶）；真实 Electron `ANS_VISUAL_V2_UI_ONLY=1` **VISUAL_V2_PASS 50**（新增 9 角色：导入后 su 可见、选中中段可见、刷新保留手动滚动、点 su 立即可见；截图 `visual-tree-su-visible-1362.png`）；`ANS_TERMINAL_UI_ONLY=1` **TERMINAL_PASS 14**；默认套件仍只在既有 `virtual visible nonempty` 失败（行号 :1101，同一基线红）。
- 指纹：`renderer.js db1d4583`、`ui-labels.js 3645aaad`、`renderer.test.ts 6ef0698f`、`uiux-v2.mjs 6d75e481`。

## 2026-10-17：治理记录 pin 不符的重新接受（D1–D3 UI）

任务书：项目管理评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.4；产品提案 `2026-10-17_design_governance-pin-recovery.md` §三。
- **单一谓词**：`ui-labels.js::governanceActionFor(hasProject, hasRoles, recordState)` → `null | "establish" | "reaccept"`（`pin-mismatch ⇒ reaccept`；`hasRoles === true && missing ⇒ establish`；其余 null）。既有 `canEstablishGovernance` 保留并委托单点。renderer 的 `governanceActionVisible()` 改为返回该谓词结果，**全文件不再直接比较 `pin-mismatch`**。
- **文案单点（全部在 ui-labels）**：`governancePinMismatchText/EmptyState`（只列非零类别、三类全零用「存在不一致」、空态 hint）、`governanceReacceptPreviewView`（标题/逐文件行/写入行/pin 行/警示/blockers）、`governanceReacceptSuccessText`、`governanceReacceptFailureView`（`phase !== "write"` 才追加「本次未写入任何文件。」与 status 提示；`phase === "write"` 只逐字 message，绝不宣称已恢复/已成功）。
- **状态落库**：`applyListing` 用白名单数组接受第四态 `pin-mismatch` 并保留 `pinFiles`/`pinCount`；未知状态仍兜底 `{state:"present"}`（fail-closed、不显示动作）。
- **入口（复用三处，不新增模态/第四入口）**：`#governance-status` 在 `reaccept` 时显示 mismatch 文案＋「检查并重新接受」；su 空态显示 mismatch 标题/说明/`.empty-hint` 次行＋主按钮；`#governance-preview` 以 `governanceFlow.mode` 复用宿主——`reaccept` 打开调 `previewGovernanceReacceptance(projectRoot)`，确认调 `reacceptGovernancePins(projectRoot, previewDigest)`；取消/关闭零 IPC；`busy`/`canConfirm:false` 时确认 disabled，失败可「重新检查」。
- **刷新**：成功后**不自行伪造刷新**——由主进程 `project:changed` → `refreshProject` → `listProject`，状态回 `present`、动作消失；不自动开会话。
- **样式**：最小增量 `.governance-preview .gp-file`、`.gp-blocker`、`.empty-hint`；900 列与整页等宽字体未动。
- **测试**：`tool-rows.test.ts` 新增 **5 例**（谓词真值表、文案逐字、预览视图、成功文案、失败分支含 phase=write/precheck 差异）→ 31/31；`renderer.test.ts` 新增 **5 例**（落库与单一谓词、状态行、空态、预览宿主/零 IPC/无新增模态、成功失败路径）→ **78 计 / 74 过 / 4 红**（4 红为**先于本批**的 CRLF 基线 N-1、data-state、P1-3、G-5，已用 HEAD 干净 worktree 复现，与本批无关）。
- **真机渲染检查（2026-10-17 协调者补验）**：`uiux-v2.mjs` 新增独立模式 `ANS_GOVERNANCE_REACCEPT_UI_ONLY=1`（复用既有受控 IPC 替身与真实 Electron 窗口；不改既有模式行为/断言）。夹具 `governanceRecord=pin-mismatch`（9 条 pin、1 条 modified）；预览/确认 IPC 记录调用参数。7 项 DOM 断言全过：状态行与 su 空态、预览复用 `#governance-preview`（无新增模态）、文件/写入/pin/警示行、取消不调 `project:governance-reaccept`、确认只传 `{projectRoot, confirm:true, previewDigest}`、成功文案。实跑 `GOVERNANCE_REACCEPT_UI_PASS 7`；截图：`%TEMP%/ans-governance-reaccept-ui/governance-reaccept-{mismatch,preview,success}-1360.png`。实跑发现并修复一处真实渲染问题：取消后再成功时 `#composer-hint` 残留「已取消，未写入任何文件。」——成功后清空（e2e 新增断言）。
- **未接线事实**：`governanceRecord.pin-mismatch`、`previewGovernanceReacceptance`、`reacceptGovernancePins` 由桌面窗口实现；落树前动作不可达（兜底 present）。

## 2026-10-17：默认会话引擎改为 Claude

客户指令「默认选择调成claude」——只改默认值，不改选择器交互模型、不重排选项、不覆盖已保存/显式传入的 runtime。
- **JS 初始态**：`app/renderer/renderer.js` 的 `state.runtime` 初值 `"pi"` → `"claude"`。其余判据未动：`selectRuntime` 白名单 `["pi","codex","claude"]`、`deliverRuntimePayload` 的 `payload.runtime || "pi"`（消息信封兜底）、`Rt.matchesView` 旧缺身份只兼容 Pi、`viewKey` 缺省键。
- **静态初始态（首帧一致、不闪）**：`app/renderer/index.html` 的 `#runtime-select` `aria-label`「会话引擎，当前 Claude」、`.engine-value`「Claude」、输入区 `#composer-scope`「未选择角色 / Claude」、`#runtime-option-pi` `aria-selected="false"`、`#runtime-option-claude` `aria-selected="true"`、`#tab-pi` title/aria-label「Claude 设置」。选项顺序仍为 **Pi / Codex / Claude**。
- **已保存/显式 runtime 优先**：启动恢复 `getRecoveryState().runtime` 为合法枚举时仍原样覆盖默认值；设置抽屉标题与「打开 X 设置」按钮随当前引擎。
- **测试（只按新默认改期望，未放宽断言）**：`uiux-v2.mjs` SELECTOR 模式新增 Claude 默认断言，并把交互语义平移到新默认下验证——Home 浏览首项 Pi 不提交、Space 提交 Pi 并触发一次配置读取、Enter 仅关闭、关闭后方向键打开当前选中、End 浏览末项并停底不提交、Tab/ShiftTab/外部指针/窗口 blur 取消、hover 只移临时高亮不改选中、点击才提交、长标签省略且保留可访问全名。CONFIG 模式改为 Claude 默认并保留 Pi/Claude 切换检查；FLOW_ONLY 各段与恢复台在 `loadProject` 后显式 `selectRuntime('pi')`（恢复夹具显式 `runtime:'pi'`），保持原 pi 夹具语义且顺带验证「显式 runtime 覆盖默认」。`renderer.test.ts` 新增默认值/静态一致性/选项顺序守卫。
- **实测**：SELECTOR **27**、CONFIG **21**、COMPLETE_FLOW **41**、SEND_FACTS **8**、ROLE_FOCUS **11** 全过；截图 `%TEMP%/ans-uiux-claude-selector-final2/initial-engine-claude.png`（触发器与输入区均显示 Claude）。`renderer.test.ts` **79 计 / 75 过 / 4 红**——4 红仍为既有 CRLF 基线 N-1、data-state、P1-3、G-5（新增默认值用例通过）。`runtime-ui.test.ts` **12 计 /11 过 /1 红**——红为既有 localStorage 守卫（左栏持久化早于本批）。默认套件的既有 `virtual visible nonempty` 红仍在；已用「默认 pi」同点复现（隐藏窗口 rAF 不执行，滚动 55% 后虚拟窗口不更新），先于本批、未改断言。
- 指纹：`renderer.js 2b12ecc6`、`index.html ea5a5da2`、`renderer.test.ts 3deba253`、`uiux-v2.mjs 21fbb8ce`。

## 2026-10-17：su 确认卡预览改为受控 Markdown（客户反馈「预览感觉需要markdown 显示啊」）

实施——客户原话「预览感觉需要markdown 显示啊，不然的话看的很累」。定位为交互确认卡的「预览内容（点击展开）」：原实现 `<pre class="op-preview-body">` + `esc(req.preview)` 纯文本。
- **渲染**：`renderer.js` 预览体改为 `<div class="op-preview-body card-md">` + `Md.renderMarkdown(req.preview)`——复用应用唯一 Markdown 管线（`markdown.js`：`html:false` 先转义原文 HTML、http/https/mailto 链接白名单、表格启用、`breaks:true`），**不在渲染侧另写解析、不改库安全配置**。折叠 `<details>`、summary 文案、限高滚动与焦点样式不变。
- **样式**：`styles.css` 的 `.op-preview-body` 去掉 `white-space: pre-wrap` 与等宽字体（Markdown 块产物会因此出现异常空白），保留 `max-height:40vh; overflow:auto` 与内边距；字号/行高按角色卡正文口径 `12px/1.8`；标题/列表/表格沿用全局 `.card-md` 规则（表格容器内横向滚动），不新增第二套 Markdown 样式。
- **测试**：`renderer.test.ts` 新增 1 例（标题/列表/表格/加粗渲染、`breaks:true` 多行、原文 `<script>` 仍转义、预览体样式占位），交互卡用例改为断言 `card-md` + `Md.renderMarkdown(req.preview)`，并反向守卫不得回退纯文本 `<pre>`；`uiux-v2.mjs` pending 夹具改为 Markdown + 原文 HTML，新增「展开后 h2/li/table/strong 渲染且 script 未执行」「展开后不横向溢出卡片」两项断言。
- **实测**：`renderer.test.ts` 80 计 /76 过 /4 红（既有 CRLF 基线 N-1/data-state/P1-3/G-5，HEAD 干净 worktree 复跑同集）；`ANS_UIUX_INTERACTIVE=1 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` → **UIUX_V2_PASS 101**（含两项新断言）；全仓 `node --test "test/**/*.test.ts"` **2366 计 /2343 过 /20 红**，与 HEAD 基线 2365/2342/20 的红集完全一致；`npx tsc --noEmit` 0 错。默认（隐藏窗口）套件的既有 `virtual visible nonempty` 红仍在（环境性 rAF 不执行），交互模式可见窗口全过，不由本批引入。无 XSS 回退、无横向溢出。
- 指纹：`renderer.js 39f8969b`、`styles.css 68588a2c`、`renderer.test.ts f164107a`、`uiux-v2.mjs 36ace305`。

## 2026-10-17：P5「替我审」自动判断 UI（开关 / 常驻警告 / 结果行 / 手动回落提示）

任务书：项目管理评审 `2026-10-17_design_shell-auto-approve-review.md` §6.5、§6.6、§9.3、§10（客户 D1/D2 已拍板）。渲染侧只按冻结桥消费；主进程是开关权威。

- **index.html**：`.composer-bottom` 左侧、附件按钮之后、`#composer-scope` 之前新增 §10.1 逐字复选框（`label.composer-auto-approve` + `input#auto-approve-toggle` + `span#auto-approve-label`，静态「替我审」）；错误状态位 `#auto-approve-status`（aria-live）；输入区下方常驻警告 `#shell-judge-warning`（默认 hidden）；shell 卡新增 `#sc-judge-notice`（摘要后、原因前，默认 hidden）。
- **ui-labels.js 文案单点**：`shellJudgeToggleView`（off/on/桥缺失三态，桥缺失**绝不 checked/不显示警告**）、`shellJudgeToggleResult`（成功采用主进程实际值；失败/坏件保持原状态+错误）、`shellJudgeWarningLines`（§10.2 三段逐字）、`shellJudgeNoticeText`（一般 manual 与 `row-failed` 两类逐字，后者**不**说成「判断没发生」）、`shellJudgeReasonText`、`shellJudgeResultView`（allow/deny/deny 档放行；manual ⇒ null）、`shellJudgeEngineLabel`。
- **renderer.js**：`initShellJudge()` 判四方法齐备 → 订阅 `shell:judge-state`/`shell:judge-result` → 启动 `getShellJudgeState()`；复选框 change 只调 `setShellJudgeEnabled`，落 `shellJudgeToggleResult` 的实际值（失败回退并显示错误，无乐观改状态）；开启后显示常驻警告与琥珀「判断 agent」标记（`.is-on`，非错误红）。`onShellJudgeResult` 按 `roleId` 落 pane、按 `toolCallId`（工具组/生命周期/operator/裸 data）锚定插入，定位不到追加流尾；`payload.id` 幂等；仅在底部附近贴底；**不自动切角色/开会话、不写 localStorage/.env/项目文件、不动已挂起卡**。确认卡 `judgeNotice` 原样 `textContent` 呈现、无值隐藏。探针新增 `window.__ansRenderer.shellJudge = { state(), onState, onResult }`。
- **结果行**：`.sys.shell-judge-row` 显示标题/命令摘要/档位/判断引擎/operator/时间/理由/替代方案/客户说明/出路，详情折叠含命令原文、cwd、证据、`hardDenyOverride`、toolCallId。deny 档放行标题带「deny 档」、琥珀徽标「deny 档 · judge 放行」、正文「该命令属于硬拒类…请复核」。
- **styles.css 最小增量**：`.composer-auto-approve(.is-on/.is-unsupported)`、`.composer-judge-status`、`.judge-warning`、`.shell-judge-row`/`.sj-*`、`.sc-judge-notice`；开启态与警告一律 `--amber`，警告随 900 内容列、继承整页等宽字体。
- **测试**：`tool-rows.test.ts` 新增 8 例（三态/失败不改状态/警告逐字/allow/deny 档/deny/manual/notice）→ 45/45；`renderer.test.ts` 新增 5 例（DOM 与样式钩子、开关三态与失败回退、结果行锚定与 deny 徽标、judgeNotice、边界）→ **85 计 /81 过 /4 红**（4 红仍为先于本批的 CRLF 基线 N-1、data-state、P1-3、G-5）；全仓 `node --test "test/**/*.test.ts"` **2454 计 /2431 过 /20 红 /3 skip**——20 红与改动前基线红集逐条一致（无新增红）；`npx tsc --noEmit` 0 错。`uiux-v2.mjs` 新增独立模式 `ANS_JUDGE_UI_ONLY=1`（受控 IPC 替身＋真实 Electron，**JUDGE_UI_PASS 14**）：启动权威关闭态、勾选开启（琥珀标记+常驻警告）、取消关闭、失败保持实际状态并显示错误、`shell:judge-state` 推送同步、deny 档 allow 结果行（标题/徽标/硬拒说明）按 toolCallId 锚在工具调用之后、普通 deny（理由/替代方案/客户说明/关闭开关重试）、manual 不产生结果行、`#sc-judge-notice` 原样呈现、已挂起卡在开关切换前后保持可作答、后台角色结果不切当前视图且切回可见。既有 `ANS_TERMINAL_UI_ONLY=1` 同步新增启动态断言 → **TERMINAL_PASS 15**。
- **未验边界**：结果行未持久化（V1 界面会话内，重启不保证重现——持久来源为审计 JSONL+诊断）；`alternatives/evidence` 的展示为上界文本，未做长文折叠（证据按设计有界）。

## 2026-10-17 W4 治理三权界面（左树/空态/状态行/决定卡；评审 §8）

实施——项目管理评审《治理三权分立》§8/§九/§十一 W4（客户已批准方向；V1 最小 UI 面）：
- **左树**（`renderRoleTree`/`roleTreeItem`/`roleSubtitle`）：trio 三组＝主入口（`primaryRoleId`）→「治理职能（内置）」（其余带 `governanceFunction` 的内置角色）→ 其余项目角色沿用 `group`/`groupDuty`。治理行显示「报告员 Rapporteur / 提名官 Nominator / 召集人 Convener」、权力副标题（提案权/提名权/编排权 · 不拥有最终批准权）、内置标识「内置角色：随应用发布，无角色目录」。全部由 `governanceFunction`/`builtIn` 派生，渲染源码**零三权 id 字面量**；single 旧树（su + 项目角色）逐字不变。
- **空态**：Nominator「通常由流程单提名步骤打开；仅在客户明确要求时直接使用」；Convener「通常由已接受提案开启流程；只负责排步骤与派发，不批准方案」；Rapporteur 保留「建立治理记录 / 检查并重新接受」入口（S0/S1 文案逐字）。`emptyStateHtml(roleId)` 按 pane 角色取文案；未 bootstrap/主聊天区仍用通用空态。
- **状态行**：`#governance-status` 显示「治理模型：三权 / 旧模型（su）」、当前流程 id（接口给 `governanceFlow.flowId` 才显示）与四态（等待客户决定/进行中/阻塞/已升级客户）；只认接口事实，未知不猜。单模型项目追加旧模型提示条「本项目使用旧治理模型（su）。可升级为三权模型。」+ 按钮；V1 未接线 ⇒「升级入口待本版后续」且恒 disabled（不假装可用）。
- **S1 建立治理记录预览**：新增治理模型单选 `single`/`trio`（默认 `single`；接口明确 trio 时保留），点选即重取预览并显示「将写入的治理模型」；预览/建立以 `{ governanceModel }` 透传 interface。检测到三权产物（接口返回 `suggestedGovernanceModel:"trio"` 或 `detectedGovernanceArtifacts:true`）只显示「建议选择 trio」，**必须客户点选**。接口未报告模型 ⇒ 单选与建立按钮 disabled 并说明。
- **决定卡**：显示 `flowId`/`stepId`、权力类型（`cardKind`→提案/提名/编排/验收）、将写路径（可选 `paths`）、摘要/哈希（可选 `summary`/`artifactSha256`）、选项；治理决定徽标「治理决定 · 客户最终批准」。`queued:true`（桌面窗口决定队列）⇒「等待前一个决定」+ 作答控件禁用；UI **不自动合并/批准**（到达路径无 `operatorRespond`）。
- **文案与样式**：全部新文案单点在 `ui-labels.js`；`styles.css` 仅加 `.ti-power/.ti-builtin/.gs-model/.gs-banner/.gp-model*/.op-gov-badge/.op-meta/.op-queued` 最小钩子，900 内容列与整页等宽字体未动。
- **测试**：`tool-rows.test.ts` +5（角色文案/专属空态/状态行/迁移按钮/决定卡元信息逐字）；`renderer.test.ts` +5（三组树与无硬编码 id/空态接线/状态行与迁移条/S1 模型选择与透传/决定卡与排队不自动批准）。边界内 `renderer+tool-rows` **134 计 /130 过 /4 红**（4 红＝既有 CRLF 基线 N-1、data-state、P1-3、G-5）。全量 `node --test "test/**/*.test.ts"` **2596 计 /2538 过 /55 红 /3 skip**：红集为既有/他域在飞（W0–W3）＋上述 4 条 CRLF 基线，另有 `test/测试/existing-project-compat-verify/e-contract-wiring` E2 因 `establishGovernanceRecord` 新增第二实参（模型透传）的旧正则失配，待测试角色 W5 同步。`uiux-v2.mjs` 本批未加 UI-only 模式（真实 Electron 夹具成本高；DOM 行为由源码守卫覆盖，真机验收留 W5）。
- **跨角色待接（W3/W5）**：`listProject.governanceModel`、`RoleView.governanceFunction`、可选 `governanceFlow`、`operator-request.queued`、`preview/establishGovernanceRecord` 第二实参 `{governanceModel}`；迁移桥未接线（V1b）。

## 2026-10-17 V1b 旧模型迁移界面（预览→确认；零写入预览）

实施——桌面窗口接通真实 `previewGovernanceMigration`/`migrateGovernanceModel` 后，本侧完成渲染面：
- **提示条按钮**：两桥方法齐备 ⇒「查看差异 / 升级」启用；缺失 ⇒「升级入口待本版后续」禁用。点击只打开**非模态零写入预览**（复用 `#governance-preview`，`mode:"migrate"`），取消/关闭不调任何写入口。
- **预览**：模型「旧模型（su） → 三权」、`writePaths` 逐条（`.ans/project.json`、`docs/bootstrap-manifest.md`）、`modelField`（`null` 如实「字段缺失，将新增」）、`manifestLine`、`pinChanges`（空 ⇒「无（不重算 pin）」；非空如实 path + 新旧前 8 位）、`retainedFiles`、`snapshotDigest` 前 8 位；「确认升级」在摘要缺失/忙时 disabled（fail-closed）。
- **确认**：`d.migrateGovernanceModel(projectRoot, preview.snapshotDigest)`；成功只认 `ok && status==="completed"`，文案「已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。」，由主进程 `project:changed` 驱动刷新（不自行改模型/刷新）。失败按 status/phase 如实：already-trio/no-record/blocked/preview-stale/busy/invalid-request 声明零写入；`write-failed`（phase=write）只提示可能部分落盘、不提供重试，绝不出现「已升级」假成功。
- **S1 模型选择**：listing 已回报 `governanceModel` ⇒ 选择器与建立按钮不再因「模型未知」禁用；继续以 `(projectRoot, { governanceModel })` 透传 preview/establish；「建议 trio」只提示，必须客户点选，默认 single。
- **测试**：`tool-rows.test.ts` +2（迁移按钮启用/禁用；预览字段/成功/失败逐字，含 pinChanges 防御与 phase=write 不假成功）→ 46/46；`renderer.test.ts` +4（按钮能力与零写入预览、预览字段与 fail-closed、确认摘要/成功/失败/取消零写、S1 透传与默认 single）→ 94 计/90 过/4 基线红。边界内合计 **140 计 /136 过 /4 红**（4 红＝既有 CRLF 基线 N-1、data-state、P1-3、G-5）。`uiux-v2.mjs` 未加假 IPC 模式（成本高；源码守卫覆盖，真机验收留 W5）。
- **跨角色对齐（已核）**：`app/preload.cjs` 的 `previewGovernanceRecord`/`establishGovernanceRecord` 已接受 `(projectRoot, options)` 并把 `{governanceModel}` 并入 IPC 载荷（Interface 同字段校验）；渲染侧调用形状与之一致，S1 选择不再被静默忽略。

## 2026-10-18：「替我审」开启警告改为一次性弹出（客户反馈）

客户逐字「这个提示应该弹出只出现一次就行了」（截图：输入区下方三段「替我审批中…」一直占着版面）。按评审 `2026-10-17_design_shell-auto-approve-review.md` §10 的警告文案与 `app/renderer` 边界实施；**本次客户口径覆盖原「常驻警告」**。

- **行为**：勾选「替我审」且主进程确认开启后，完整三段警告**只显示一次**；带「知道了」关闭按钮，约 9 秒自动收起（`SHELL_JUDGE_WARNING_AUTO_DISMISS_MS=9000`，客户 8–10 秒口径）；关闭/自动消失后**不再重复显示**，直到客户关闭开关再重新开启。关闭开关即复位「已提示」；**不持久化**（不写 localStorage），应用重启后再次开启会再提示一次。渲染重绘/收消息/切角色/重复 `shell:judge-state` 推送均不重现——状态迁移纯函数 `ui-labels.js::shellJudgeWarningStep(enabled, shown)`（关闭 ⇒ `shown=false`；开启且未提示 ⇒ 显示一次并记住；已提示 ⇒ 不显示）。开启期间输入区仍保留琥珀「替我审批中 · 判断 agent」紧凑标记（`.is-on` 圆点）。
- **不占布局**：警告改为 `.composer` 内的绝对定位浮层（`.composer{position:relative}` + `.judge-warning{position:absolute; bottom:calc(100% + 8px)}`），不参与 flex 布局、不推动聊天消息区；琥珀色，非错误红。
- **DOM/文案**：`#shell-judge-warning` 内拆出 `#shell-judge-warning-text`（三段）+ `#shell-judge-warning-close`（「知道了」，文案单点 `SHELL_JUDGE_WARNING_CLOSE_LABEL`）；警告仍由 `shellJudgeWarningLines()` 单一来源生成。`shellJudgeToggleView` 的 `warningVisible` 保留为**兼容字段**（= 开启态；实际显隐不再由它决定，渲染侧不得使用）。
- **计时器纪律例外**：本功能是客户明确要求的一次性提示自动收起，也是渲染侧唯一的 `setTimeout`；卡片等待/抽屉/滚动/折叠仍零计时器（`renderer.test.ts` 六条守卫改为剔除 `@shell-judge-start…end` 段后检查）。
- **测试**：`tool-rows.test.ts` +1（一次性状态机真值表/关闭文案/自动收起时长区间）→ **47/47**；`renderer.test.ts` P5 用例按新行为改写（DOM 结构、一次性接线、关闭按钮、无重绘重显）→ **94 计/90 过/4 红**（4 红仍为先于本批的 CRLF 基线 N-1、data-state、P1-3、G-5）；`markdown.test.ts` vendor pin 与 `runtime-ui.test.ts` localStorage 守卫为既有基线红。`uiux-v2.mjs` `ANS_JUDGE_UI_ONLY=1` 段增补：首次显示/「知道了」收起后开关与紧凑标记保持/重复推送与切角色不重现/关闭再开启再显示/约 9 秒自动消失。真实 Electron 离线 e2e（受控 IPC 替身，无真实模型/网络）**JUDGE_UI_PASS 21**。
- **全量**：`node --test "test/**/*.test.ts"` **2670 计 /2648 过 /19 红 /3 skip**。19 红中 **3 条为测试角色 `test/测试/` 的「renderer 全文零 setTimeout」守卫**（`existing-project-compat-verify/e-contract-wiring.test.ts` E4、`g2-verify/u1-renderer.test.ts`、`g3-search-verify/scope-audit-and-fold.test.ts`）——需其属主按本批批准的一次性计时器豁免本段（本角色不改他域测试）；其余 16 红为此前基线（8 条环境 symlink/abort、`runtime-core` 读取器防御 1 条、`g4-skill-verify` 全量并发偶发 1 条（单跑通过）、4 条 CRLF 基线 + vendor pin + runtime-ui localStorage 守卫）。
- 指纹：本轮工作树未提交，以 `git diff` 为准（`app/renderer/{index.html,renderer.js,styles.css,ui-labels.js}`、`test/桌面应用/{renderer.test.ts,tool-rows.test.ts,e2e/uiux-v2.mjs}` 与本文件）。

## 2026-10-18：W6-C 四角色左树 / 决定卡镜像 / 排队聚合（三权·四角色）

按项目管理评审 `2026-10-18_design_governance-liaison-review.md` §6/§9 实施桌面UI侧（W6-C）：

- **左树/文案**：`ui-labels.js` 增 `liaison`＝「联络官 Liaison」「客户沟通 · 不拥有最终批准权」（`primaryEntrance` 标记，渲染侧不硬编码 id）；治理职能组自动只剩 Rapporteur/Nominator/Convener。single 旧树（su + 项目角色）输出逐字不变。
- **空态**：优先级钉死 S0 → 治理记录动作 → 治理角色专属 → 默认。Liaison 空态逐字「客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。本版起默认入口为联络官；报告员与历史提案不变。」；Rapporteur 增「通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。」；`resetPanes`/`refreshEmptyStates` 的 `#chat` 空态按当前主入口取文案，使导入后立即可见 Liaison 说明（single 输出不变）。
- **镜像卡**：`opRequests` 扩为 `{surfaces, cards, id, mirrorRoleId}`；镜像面追加到 `mirrorRoleId`（主入口 Liaison）pane 末尾、不参与源面锚点表、不自动滚动；`.op-request.is-mirror` + `.op-mirror-badge`「镜像 · 主入口」+ `.op-mirror-source`「来自 <发起角色> 的治理决定 · 客户最终批准」。源面保留。作答唯一入口 `submitOperatorDecision`（一个 `operatorRespond` 调用点），`submitting` + 终态双闸，成功后/失效率先冻结 `surfaces` 全部卡。
- **排队**：订阅既有 `session:operator-queued`；trio 主入口 pane 显示 `.op-queue-aggregate`「还有 N 个决定等待前一个决定」，排队请求不物化可操作卡；同一 id 呈现/失效后移除；single/su 不出现该行。`refreshEntryAwaiting`/`updateQueuedOperatorCard` 遍历全部呈现面，徽标/chip/队列/启停两侧一致。
- **状态行**：`governanceStatusText` 的 trio 文案改为「治理模型：三权 · 四角色」；迁移预览等仍用「三权」。
- **测试**：`tool-rows.test.ts` **48/48**；`renderer.test.ts` **100 计/96 过**（4 红＝既有 CRLF 基线 N-1、data-state、P1-3、G-5）；真实 Electron `ANS_MIRROR_UI_ONLY=1` 新段 **MIRROR_UI_PASS 8**（四角色树/状态行/Liaison 空态/镜像双面/只答一次/排队聚合）。全量三层 glob **2735 计/2709 过/23 红/3 skip**；红集为他域预期红：旧三权断言（`test/测试/governance-trio-verify/*`、`test/编排/*`）、Windows symlink EPERM、vendor CRLF pin、`runtime-ui` localStorage 守卫、`abort running shell` 环境红与上述 4 条基线红。
- 指纹：本轮工作树未提交，以 `git diff` 为准（`app/renderer/{renderer.js,styles.css,ui-labels.js}`、`test/桌面应用/{renderer.test.ts,tool-rows.test.ts,e2e/uiux-v2.mjs}` 与本文件）。

## 2026-10-18：P5 双开关「替我审批 / 替我决策」UI（评审 §三/§八/§九/§十二 P5）

任务书：项目管理评审 `2026-10-18_design_judge-governance-cards-review.md` §3.3、§8、§9、§12 P5。P4 桌面窗口正在并行实现 decision IPC；本角色按冻结契约消费，桥缺失时按组禁用并说明（不假开启）。

- **index.html**：`.composer-bottom` 附件按钮后并排两个复选框——`#auto-approve-toggle`（静态标签「替我审批」）与新增 `#judge-decision-toggle`（「替我决策」），各自状态位 `#auto-approve-status` / `#judge-decision-status`（aria-live；single 说明走 `.is-note` 琥珀）。一次性警告仍是**同一块** `#shell-judge-warning`（两个开关共用，按开启组重建文本）。
- **ui-labels.js 文案单点**：新增 `judgeToggleView(group, available, enabled, busy, {singleDisabled})`（两组各自 off/on/桥缺失；decision+single ⇒ 禁用 +「旧治理模型（single）不支持代决策」）、`judgeWarningStep`（每组各自 `promptShown`）、`judgeWarningLines(groups)`（§9.2 同一块按开启项列行：approval/decision 段 + 三段共享说明）、`governanceJudgeResultView`（标题「judge 代批 · 代审批/代决策」；结论按 cardKind：接受提案/任命/验收通过/确认写入 N 个路径；详情含理由/选中项/路径/逐路径结论/证据/耗时/读取量）、`governanceJudgeNoticeText` / `governanceJudgeReasonText`。既有 `shellJudge*` 名字保留为 approval 别名；shell 结果标题按 §10.2 加「代审批」分组标记，deny 出路改「关闭「替我审批」后重试」。
- **renderer.js**：`initJudgeSwitches()` 分组判桥（各四方法）→ 各自订阅 state/result → 启动读取；`renderJudgeToggles()` 是唯一重绘点（两开关 + 警告同步）。点击只调对应 set，由 `shellJudgeToggleResult` 落主进程实际值（失败保持原值并显示错误）；`available:false` 经读取/推送落为不可用。`applyListing` 落 `governanceModel` 后重绘：single 禁用 decision、trio 恢复。**不自动开会话/切角色、不写 localStorage/.env/项目文件、不触碰已挂起卡。**
- **结果行**：shell `onShellJudgeResult` 保持原锚定；新增 `onOperatorJudgeResult`（`session:operator-judge`）按 `roleId` 落 pane、按 `toolCallId` 锚定，定位不到追加流尾；`payload.id` 幂等；行类 `.sys.shell-judge-row.governance-judge-row`，琥珀标题/徽标表达「judge 代批」，与客户手批卡区分。`manual` 不产生结果行。
- **手动回落**：shell 卡沿用 `#sc-judge-notice`；治理交互卡新增 `.op-judge-notice`——主进程 `judgeNotice` 原文 `esc` 呈现、同一请求重推可补/更新，卡仍可作答（UI 不自动批准）。
- **样式**：仅加 `.composer-judge-status.is-note`、`.governance-judge-row .sj-title`、`.op-judge-notice`；琥珀/中性色，未动 900 列与等宽字体。
- **探针（只增）**：`window.__ansRenderer.decisionJudge = { state(), onState, onResult }`。
- **测试**：`tool-rows.test.ts` **51/51**（双开关矩阵/警告按组列行/治理结果行/回落文案）；`renderer.test.ts` **152 计 / 148 过 / 4 红**（4 红＝既有 CRLF 基线 N-1、data-state、P1-3、G-5）；真实 Electron `ANS_JUDGE_UI_ONLY=1` → **JUDGE_UI_PASS 33**（含 decision 开关读取/设置/推送/失败回退、首次警告、治理结果行按 toolCallId 锚定、写盘代批行、`judgeNotice` 卡、single 禁用与 trio 恢复；P4 IPC 在本批联调时已落树），`ANS_TERMINAL_UI_ONLY=1` → **TERMINAL_PASS 22**（含启动两组权威关闭态与真机卡收起 7 项）。全量三层 glob（最新收尾）：**2972 计 / 2953 过 / 16 红 / 3 skip**。
- **红集分类（如实）**：本域仅 4 条 `renderer.test.ts` 既有 CRLF 基线（N-1/data-state/P1-3/G-5）；其余 12 条为既有/他域：9 条 Windows symlink EPERM、`abort running shell`、Pi/Codex/Claude 适配器存储与 symlink 用例，1 条 `markdown` vendor pin、1 条 `runtime-ui` localStorage 守卫、1 条 `g4-skill` 读取器防御。此前 `test/测试/shell-judge-verify/*` 的旧 UI 文案断言已由测试角色同步更新转绿；本批未新增本域红；3 条「唯一计时器必须位于 showShellJudgeWarning」测试角色守卫通过保留函数名与计时器位置继续全绿。

## 2026-10-18：真机修复——轮次结束/失效回执后收起 shell 确认卡

真机 UX：轮次中止/重建后，挂起的 shell 确认卡没有被收起，留下按钮全禁用、写着「此确认已失效」的卡，看起来像页面卡住。

- **settled 收起**：`appendOneEvent` 在本轮 `settled`（完成/失败/中止/超时）时调用 `closeStaleShellConfirm(env)`——只命中同 `roleId` + 同 `runtime` + 同 `projectRoot` 的当前卡；其它角色或仍在等待（未 settled）的卡保持可操作。
- **失效回执收起**：`session:operator-expired` 按 `id` 命中当前 shell 卡时直接 `closeShellConfirm()` 并 `setHint(payload.reason)`；旧 id/迟到回执不误收、不重建。
- **回包三路径收起**：`respondShellConfirm` 的受理、`expired:true`、通道失败都收起卡片；过期/失败用 `setHint` 如实说明「未获放行」。删除 `markShellConfirmExpired` 与 shell 卡的 `is-expired` 终态（恢复卡保留自己的失效态）。
- **文案同步（2026-10-18 收尾）**：`ui-labels.shellJudgeNoticeText` 与桌面通道 `manualJudgeNotice` 对齐——一般 manual 增「规则判定仅作参考；判断 agent 未完成时才由你手批。」，`row-failed` 改为「…；规则判定仅作参考，本卡已转你手动确认。」；`tool-rows.test.ts` 相关逐字断言同步。`test/测试/shell-judge-verify/c-manual-flow.test.ts` 的 retry-capped 旧期望仍待测试角色更新（本角色不改他域测试）。
- **测试**：`renderer.test.ts` +1 源码守卫（settled 清理、role/runtime/project 校验、失效回执收起、三路径收起、迟到回包不重建）；`ANS_TERMINAL_UI_ONLY=1` 新增 7 项 DOM 断言（等待中的卡保持、其它角色 settled 不影响、settled 收起、新卡恢复可操作、旧 id 失效不误收、失效回执收起并提示原因、重复失效不重建）→ **TERMINAL_PASS 22**；`ANS_JUDGE_UI_ONLY=1` **JUDGE_UI_PASS 33** 不回归。全量三层 glob **2972 计 / 2953 过 / 16 红 / 3 skip**（本域仅 4 条既有 CRLF 基线，无新增红）。`test/桌面应用/e2e/main.mjs`（桌面窗口自检台）仍断言 Esc 后保留 `is-expired` 可见卡，需其属主按新 UX 更新（本角色不改其文件）。

## 2026-10-19：shell 审批卡标题按实际角色显示（客户截图反馈）

客户真机截图：Proof / 验收 发起的 shell 审批卡标题仍显示「SU 命令审批」。五个内置治理角色现统一走审批档（内部 policy 仍叫 `su-approval`），但 UI 不应再显示 SU，应按实际角色显示（客户示例「命令审批 · Proof / 验收」）；单模型 su 仍可显示「SU 命令审批」。

- **ui-labels.js**：`shellConfirmTitle(policy, roleId)`——内置治理角色（liaison/rapporteur/nominator/convener/verifier）⇒「命令审批 · <显示名>」；否则 `su-approval` ⇒「SU 命令审批」（逐字保留）；其余（project/旧请求）⇒「shell 命令请求」（既有兜底逐字保留）。新增 `GOVERNANCE_ROLE_FUNCTION_BY_ID` + `governanceRoleDisplayNameById`：显示名由既有 `GOVERNANCE_ROLE_TEXT` 的 en/cn 派生（英文 / 中文，与注册表 `displayName` 同序）；非内置治理 id/坏值 ⇒ 空串，不编名字。roleId 优先于 policy（统一审批档不再显示 SU）。
- **renderer.js**：`renderShellConfirm` 仅在标题调用处传入 `confirmRoleId`（`payload.roleId` 非空优先，回退 `cur.roleId`）；卡片行为、按钮、默认焦点、放行判据、警告、HTML/CSS 零改动。
- **影响面**：仅标题文案。su（roleId=`su` 或无 roleId 的旧请求）与项目角色卡逐字不变；左树显示名（中文 英文）未动，本卡按客户示例用注册表同序（英文 / 中文）。
- **测试**：`renderer.test.ts` 新增 8 条标题映射断言（verifier→Proof / 验收、五角色、su、project 兜底、未知/坏值、roleId 优先）并更新接线守卫 → **104/104**；`node --test "test/桌面应用/*.test.ts"` **605 计 / 604 过 / 1 红**（唯一红＝`runtime-ui.test.ts:69` localStorage 源码守卫，HEAD 即红、与本批无关）；`npx tsc --noEmit` 本侧零错误（全仓现存报错在他角色在飞的 `shell-judge/policy.ts`）。
- **跨域待同步**：`test/测试/su-shell-approval-verify/d-card-data.test.ts:107` 的源码子串守卫 `UiLabels.shellConfirmTitle(payload.policy)` 会因第二实参失配，需测试角色更新（本角色不改他域测试）；e2e su 卡夹具不带 roleId，仍为「SU 命令审批」，无需改。
- Doc: [docs/change/2026-10-19_change_shell-confirm-role-title.md](docs/change/2026-10-19_change_shell-confirm-role-title.md)

## 2026-10-19：深色石墨主题（客户「色调不够沉稳」→ 选择深色石墨）

客户看过 ANS Studio 主界面后反馈「整体页面风格这种色调不够沉稳」，选择**深色石墨**方向；本批只换视觉，布局/尺寸/文案/交互/无障碍语义零改动。

- **色板**：`--bg #14171A`、`--bg-side #1A1E22`、`--bg-drawer #171B1F`、`--bg-soft #1E2328`、`--bg-hover #252A30`、`--bg-selected #2A3037`；`--border #2C3238`、`--border-strong #3A4148`、`--border-control #6B757E`（控件边界 ≥3:1）；`--text #E7E9EB`、`--text-2 #A7ADB5`、`--text-3 #949BA4`；主强调/焦点/成功 `#6FA08B`、danger `#C97A6D`、amber `#C4A15F`，并补 `--danger-bg/--danger-border/--amber-bg/--amber-border/--success-hover` 等深色语义底；`color-scheme: dark`。
- **对比度（纯函数实测）**：正文/主底 **14.78:1**、次级 7.96:1、三级在次级表面 5.64:1、danger 5.56/4.75:1、success 6.06/4.64:1、amber 7.38/6.59:1、焦点环 5.34:1、控件边框 3.37:1；主按钮改用深色文字（6.06:1），避免白字在 `#6FA08B` 上仅 2.97:1。
- **审计**：`styles.css` 148 处颜色字面量逐条替换——旧浅色表面/深绿文字/浅语义底/浅边框清零，组件层改走令牌（不只改 `:root`）；滚动条、选中文本、hover/active/focus、浮层阴影全部深色适配。`index.html` 与全部渲染 JS **零颜色字面量**（图标均 `currentColor`，无需改）。
- **测试**：`renderer.test.ts` A1/A2 输入区与 token/对比度断言改深色口径（阈值不放宽：正文 ≥7、次级 ≥5、三级 ≥4.5、控件/focus ≥3），新增「深色石墨主题」用例（color-scheme、首层令牌、滚动条/选中文本、旧浅色清零）→ **105/105**；`tool-rows` 52/52、`markdown` 5/5；`runtime-ui` 12 计/11 过/1 红（`localStorage` 源码守卫，HEAD 即红，与本次无关）；`npx tsc --noEmit` **0 错**。
- **真实 Electron 夹具**：`ANS_VISUAL_V2_UI_ONLY=1 uiux-v2.mjs` → **VISUAL_V2_PASS 54**（改前基线 50；新增 4 条真实渲染树「无可见亮底元素」扫描，1360/960 主视图 + 抽屉，按计算样式相对亮度判定）；`.report-top` 计算背景断言 244,248,242 → 34,48,43。全量交互套件前 100 项通过，最后一项 `expired old shell shown disabled in its own runtime` 失败——**A/B 证**换回 HEAD `styles.css` 同点同败（他角色在飞/夹具既有红，非本批引入，未改断言）。
- **证据**：`docs/change/2026-10-19-dark-graphite-evidence/`（改前/改后 1360·960·抽屉·折叠截图 + report.json；改前 = HEAD 浅色主题，同一夹具同一状态）；原始运行目录 `/private/tmp/ans-dark-theme-before|after`（已删 user-data）。
- Doc: [docs/change/2026-10-19_change_dark-graphite-theme.md](docs/change/2026-10-19_change_dark-graphite-theme.md)
- 指纹：本轮工作树未提交，以 `git diff` 为准（`app/renderer/styles.css`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`、本文件与 `docs/change/2026-10-19_change_dark-graphite-theme.md` + 证据目录）。

## 2026-10-19：左树取消角色折叠 + 系统通知独立成行（客户两句反馈）

客户：「这个左侧这个角色，还是去除这个展开收缩吧，看不到谁在工作，也是尬的。」＋「这个应该加一个标记啊，不然谁知道啊。」

- **A. 取消角色分组折叠**：`renderer.js::renderRoleTree` 删除 `treeGroupFold`/`governanceFoldOpen`/`othersFoldOpen` 与 trio 折叠分支——single/trio/模型未知**一律平铺**；主入口仍置顶，治理职能与项目角色沿用 `treeGroupLabel` + `roleTreeItem`（项目分组仍由 `Rt.roleGroups` 驱动），角色状态徽标/忙态沿用既有唯一状态源。`styles.css` 清理全部 `.tree-group-fold` 样式。整栏收起（`is-sidebar-collapsed`）未动。**补充（同日协调转达）**：无分组角色的默认可见标签由「其他角色（查看/调试）」改为**「工作角色」**（`runtime-ui.js::roleGroups` 单一来源，`renderer.js` 不硬编码）；旧字面量仅保留在不可见 `append+remove` 兼容锚点（跨角色 `e-ui.test.ts` 源码定位，无可见节点）。
- **B. 系统通知独立成行**：`tool-rows.js` 新增单一分类点 `classifySystemNotice`（`classifyInjectedMessage` 最先调用）：文首 `【系统通知】`/`【系统通知·<子类>】`（严格闭合判据，不逐子类登记）⇒ `{kind:"system-notice", displayBody, remainder}`；`renderer.js` 实时（`appendInjectedMessage`→`appendSystemNotice`）与回放（`appendReplayRow`）同规则渲染 `.sys sys-notice` 独立系统行 + 「系统通知 · <子类>」徽标，`\n\n` 之后的用户正文仍按普通 `.msg-user` 呈现（回放 token 只落身份行，防 `tokenRows` 覆盖）。通知文本、模型可见内容与消息顺序不变；`styles.css` 新增 `.sys-notice`/徽标（深色石墨令牌）。
- **测试**：`renderer.test.ts` 折叠用例改写 + 新增系统通知用例（107/107）、`tool-rows.test.ts` 新增归类真值表（53/53）→ 合跑 **160/160**；`markdown` 5/5；`runtime-ui` 12 计/11 过/**1 红＝既有基线**（`localStorage` 源码守卫，HEAD 即红，未改；分组名断言已同步「工作角色」并通过）；`npm run typecheck` 0 错；跨角色 `e-ui.test.ts` 10/10。Electron 离线夹具新增 `ANS_NOTICE_UI_ONLY=1` → **SYSTEM_NOTICE_UI_PASS 6**（实时/回放系统通知 + 平铺角色树 + 无文件目标工具行 + 1360/960 截图，含「工作角色」分组截图）；既有 `ANS_RUNTIME_UI_ONLY=1` 的分组名期望同步后，分组检查通过，仍止于既有基线红 `expired old shell…`。默认 e2e A/B（HEAD vs 本批）：101 条报告后同点同败集合逐条一致，本批零新增失败。
- **证据**：`docs/change/2026-10-19-notice-flat-evidence/`（5 张截图 + report.json；运行目录 `/private/tmp/ans-notice-flat-ui-final5`，已隔离 user-data；截图已按正文提亮后的 `--text` 刷新）。跨域待同步：`test/桌面应用/e2e/main.mjs` 仍断言子串「其他角色」（非本角色写入面，需其属主改为「工作角色」）。
- Doc: [docs/change/2026-10-19_change_role-tree-flat-and-system-notice.md](docs/change/2026-10-19_change_role-tree-flat-and-system-notice.md)
- 指纹：本轮工作树未提交，以 `git diff` 为准（`app/renderer/renderer.js`、`app/renderer/tool-rows.js`、`app/renderer/runtime-ui.js`、`app/renderer/styles.css`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/tool-rows.test.ts`、`test/桌面应用/runtime-ui.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`、本文件 + Doc + 证据目录）。

## 2026-10-19：深色主题正文提亮（客户「白的有点发灰」）

客户补充：深色主题下正文「白的有点发灰」。只改 `--text` 一个令牌：`#E7E9EB` → **`#F2F4F6`**（近白、非纯白）；`styles.css` 三处 `:root --text` 覆盖块同步更新（避免后层覆盖回旧值）。`--text-2 #A7ADB5` / `--text-3 #949BA4` 与其他令牌、布局、字号零改动。对比度（主底 `#14171A`）：14.78:1 → **16.32:1**；侧栏/抽屉/次级表面 15.20/15.70/14.36:1；参考纯白 17.99:1（未采用）。
- **测试**：`renderer.test.ts` A2 对比度断言改用 `#F2F4F6`（阈值未放宽）并新增「正文亮于次级文字」层次断言 → 边界内合跑 **160/160**（含同期 tool 行文案修正用例）；`ANS_VISUAL_V2_UI_ONLY=1` 改前/改后各 **VISUAL_V2_PASS 54**（暗色表面扫描零回归）；`ANS_NOTICE_UI_ONLY=1` **SYSTEM_NOTICE_UI_PASS 6**（证据已按新文本色刷新）；`runtime-ui` 12 计/11 过/1 红＝既有基线；`npm run typecheck` 0 错。
- **证据**：`docs/change/2026-10-19-text-brightness-evidence/`（改前/改后 1360·960 截图 + report.json；运行目录 `/private/tmp/ans-text-brightness-before|after`，隔离 user-data）。
- Doc: [docs/change/2026-10-19_change_text-brightness.md](docs/change/2026-10-19_change_text-brightness.md)
- 指纹：工作树未提交，以 `git diff` 为准（`app/renderer/styles.css`、`test/桌面应用/renderer.test.ts`、本文件 + Doc + 证据目录）。

## 2026-10-19：tool 行「目标未保存」改为中性「无文件目标」

客户看到 tool 行「目标未保存」，误以为未保存导致流程被挡。实为 `display.target` 缺失时的占位（`request_confirmation`/`dispatch_task` 等交互/派发类工具本无文件目标）。

- **改动**：`renderer.js::toolDetails` 详情占位 → **「本次调用无文件目标（交互/派发类工具）」**；`refreshToolLifecycle` 摘要行兜底 → **「无文件目标」**（工具名已在行首 `<strong>` 显示）。仅文案，工具行为/生命周期/判定零改动；详情面继续 display 驱动，不按工具名分支（既有 MCP 零特判守卫保持通过）；`目标未记录` 等其他占位未动。
- **测试**：`renderer.test.ts` 新增「无文件目标的工具行」用例（旧文案清零/中性文案/无工具名分支/摘要兜底/行为接线未动）→ renderer **107/107**、`renderer+tool-rows` 合跑 **160/160**；`ANS_NOTICE_UI_ONLY=1` 新增真实渲染断言（摘要与详情均不含「未保存/失败」）→ **SYSTEM_NOTICE_UI_PASS 6**；`npm run typecheck` 0 错。
- **证据**：`docs/change/2026-10-19-notice-flat-evidence/tool-row-no-file-target-1360.png`（`request_confirmation` 行展开：无文件目标 + 等待客户确认）；运行目录 `/private/tmp/ans-notice-flat-ui-final5`。
- Doc: [docs/change/2026-10-19_change_tool-row-no-file-target.md](docs/change/2026-10-19_change_tool-row-no-file-target.md)
- 指纹：工作树未提交，以 `git diff` 为准（`app/renderer/renderer.js`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`、本文件 + Doc + 证据）。

## 2026-10-19：runtime-ui 持久化契约更新——侧栏偏好白名单守卫（HEAD 既有红收口）

`test/桌面应用/runtime-ui.test.ts` 的「renderer 仅消费 IPC…无持久化」用例在 HEAD 即红：旧断言要求整文件零 `localStorage`，而 renderer 自 2026-10-17 起按客户要求持久化侧栏宽度/收起两项界面偏好（HEAD 已存在）。判定为**测试契约过期**，非产品回归（测试角色只读核对与拟议补丁见 `角色卡/测试/docs/fix/2026-10-19_verify_runtime-ui-persistence-contract.md`）。

- **改动**：替换旧整文件禁令为收紧白名单——`sessionStorage|node:fs|require("fs")|import(` 仍全禁；去注释后 `localStorage` 恰 4 处、每处只允许 `window.localStorage.(getItem|setItem)(SIDEBAR_WIDTH_STORAGE_KEY|SIDEBAR_STORAGE_KEY)`；同行不得夹带其它存储调用；邻近一行禁凭据/审批判断状态（并补 `piConfig`）；键字面量恰为 `ans.sidebar.width` / `ans.sidebar.collapsed`。原有切引擎不停后台任务、输入不回显、`onOperatorExpired`、`entry.runtime !== state.runtime` 断言保留。renderer 源码与产品行为零改动。
- **负向变异**（真实用例 + `/tmp` 副本）：sessionStorage、键改 `apiKey`、写 `token`、`removeItem`、裸 `localStorage`、写 `shellConfirm`、写 `piConfig`、新增第 5 处偏好写、`require("fs")` —— 9 个变异全部被捕获，基线通过。
- **测试**：`node --test "test/桌面应用/runtime-ui.test.ts"` **12/12 / exit 0**（改前 12/11/1）；`node --test "test/桌面应用/**/*.test.ts"` **636 计 / 636 过 / 0 红 / exit 0**；`npm run typecheck` **exit 0**。此前测试角色快照的 11 红在本轮已由对应属主推进后全部消失，当前无剩余红。
- Doc: [docs/fix/2026-10-19_fix_runtime-ui-persistence-whitelist.md](docs/fix/2026-10-19_fix_runtime-ui-persistence-whitelist.md)
- 指纹：工作树未提交，以 `git diff` 为准（`test/桌面应用/runtime-ui.test.ts`、本文件 + Doc）。

## 2026-10-20：切到后台在跑的角色聊天区空白——transcript 判据 + loading + 中性占位

真机：切到正在后台跑的角色，聊天区空白数秒，只剩底部队列/「正在工作」。根因：`selectRole` 用 `!pane.querySelector(".chat-empty")` 判「已有历史」；后台 `session:role-state` 快照先建队列/状态行并移除 `.chat-empty`，于是误判已有历史、不建 loading，而 `getSessionHistory` 尚未返回 ⇒ 无 transcript 的 pane 全空。

- **判据**：`selectRole` 改用既有 `hasTranscript(roleId)`；新增单点 `TRANSCRIPT_ROW_KINDS`（user/assistant/activities/injected/replay/handback/operator/tool-lifecycle），队列/状态（system）行不计入；`appendUser` 登记 `{kind:"user"}`。
- **loading**：无 transcript ⇒ 建 `sys-loading`；pane 已有队列/状态行时文案「正在载入会话历史…」，全新 pane 保留「正在开启与角色 X 的会话…」；回放 full 重建或 `openSession` 返回时移除，选择版本变化早退也显式移除。
- **占位**：新增 `renderEmptyNote`——会话已开启、仍无 transcript 且无错误/报告时显示中性 `sys sys-note empty-note`：忙碌「会话已开启；后台正在工作，暂无可见消息」/空闲「会话已开启，可直接输入消息」。占位是 pane 直属 DOM，**不进行表**（不参与回放去重/虚拟窗口/未决卡锚定）；真实 transcript 行登记即清除。刷新点为 `replayHistory` 空历史早退与收尾、`selectRole` 开会话成功尾部。
- **未动**：回放去重/增量/全量策略、滚动贴底、未决卡锚定、队列/状态行语义；`styles.css` 仅加 `.sys-note` 中性样式；新增只读探针 `paneDebug(roleId)` 供 e2e 读游离 pane。
- **测试**：`renderer.test.ts` +1 源码守卫 → **108/108**；`tool-rows` **53/53**；`runtime-ui` **12/12**；`node --test "test/桌面应用/**/*.test.ts"` **662/662 / exit 0**；`npm run typecheck` **exit 0**。Electron 离线夹具新增 `ANS_BLANK_PANE_UI_ONLY=1` → **BLANK_PANE_UI_PASS 6**（含后台 pane 前提、loading、空历史占位、历史到达清除、已有 transcript 不再 loading、空闲占位）；负向对照：临时还原旧 `.chat-empty` 判据 ⇒ 夹具在 loading 检查处 exit 1，恢复后全绿。既有夹具回归：TERMINAL_MERGE 12、MERGE 12、TERMINAL 22、DUP 32 全过。
- **证据**：`docs/change/2026-10-20-blank-pane-evidence/report.json`（运行目录 `/tmp/ans-blank-pane-final2`，隔离 user-data）。
- Doc: [docs/change/2026-10-20_change_blank-pane-loading-placeholder.md](docs/change/2026-10-20_change_blank-pane-loading-placeholder.md)
- 指纹：工作树未提交，以 `git diff` 为准（`app/renderer/renderer.js`、`app/renderer/styles.css`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`、本文件 + Doc + 证据）。

## 2026-10-20：排队聚合残留「还有 7 个决定」——queuedRequests 移出 runtime view 快照

真机：主进程队列已 0，界面仍显示「还有 7 个决定等待前一个决定」。根因：渲染侧 `queuedRequests` 被写进 `captureRuntimeView()`/`installRuntimeView()`（约 1240/1255），切引擎/视图恢复时把已不存在的旧排队计数复活；`replayPending` 只增不减，不会清旧 id。

- **快照**：`queuedRequests` 不再进入 runtime view 快照，恢复时也不从 `v.queuedRequests` 赋值（后台投递的 install/restore 不打断当前运行期事实）；`opRequests`/`replayState` 等照旧保留。
- **清理**：`selectRuntime` 安装目标视图后清空 `queuedRequests` 并调 `renderQueueAggregate()`（n=0 移除残留聚合行）；`applyListing` 恢复/列举完成同样按当前排队事实清理；`resetPanes` 既有清空保留。计数只由主进程 `session:operator-queued`（重载后 `replayPending`）重建。
- **测试**：`renderer.test.ts` W6-C 扩展源码守卫（快照不得含 queuedRequests / 恢复不得赋值 / 切引擎与列举完成清理）→ **108/108**；Electron 离线夹具新增 `ANS_QUEUE_VIEW_UI_ONLY=1` → **QUEUE_VIEW_UI_PASS 4**（2 条旧排队 → 切引擎往返后聚合与旧 id 均消失 → 主进程重推按新 count 1 显示 → expired 清空移除）；负向对照：临时去掉清理 ⇒ 夹具在恢复检查处 exit 1，恢复后全绿。`node --test "test/桌面应用/**/*.test.ts"` **679/679 / exit 0**；`npm run typecheck` **exit 0**；空白兜底夹具复核 **BLANK_PANE_UI_PASS 6** 无回归。
- **已知环境红（非本批）**：`ANS_MIRROR_UI_ONLY=1` 首个断言因其他角色在途的治理角色显示名变更（联络官 Liaison → 主理 Lead 等）而失败，与本批无关，未改其断言。
- **证据**：`docs/change/2026-10-20-queued-view-evidence/report.json`（运行目录 `/tmp/ans-queue-view-final`，隔离 user-data）。
- Doc: [docs/change/2026-10-20_change_queued-view-restore.md](docs/change/2026-10-20_change_queued-view-restore.md)
- 指纹：工作树未提交，以 `git diff` 为准（`app/renderer/renderer.js`、`test/桌面应用/renderer.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs`、本文件 + Doc + 证据）。


## 2026-10-21：UI 平台化 Phase 2——React 新渲染器骨架（与旧渲染器并存）

- **改动**：在 `app/renderer/` 内新建 Vite/React/shadcn base-nova 渲染器：`src/index.html`（严格 CSP）、`src/index.css`（深色石墨令牌唯一来源 + Tailwind v4 `@theme inline`）、`src/shell/{TitleBar,Sidebar,ChatHeader,Composer,Drawer,ConfirmCard}.tsx`、`src/stores/{ui-store,confirm-demo-store}.ts`、`src/lib/{utils,platform}.ts`、`src/test-driver.ts`、`src/components/ui/`（16 个 copy-in 组件 + 台账）。旧入口与 7 个经典脚本**零改动**，仍为生产入口。
- **行为**：骨架演示，不接业务。标题栏 36px（窗口三按钮在真实 Electron 接 preload 通道，浏览器缺失即禁用并标注）；左栏 248/208–360、pointer 拖动/双击复位/←→±8、Shift±24/`aria-valuenow` px/localStorage 两键/收起 `.app.is-sidebar-collapsed`（用 shadcn resizable 的 Group/Panel，手柄按 Q4 自绘 + `flushSync`）；会话头/空态/贴底输入区（Enter/Shift+Enter/IME 组合保护；发送禁用如实标注）；右抽屉 Motion 424/Esc/焦点返回；shell 确认卡 AlertDialog 640/命令逐字/拒绝默认焦点/Esc=不放行，仅 `__ansRenderer.openConfirmDemo` 打开演示载荷。
- **组件取件**：shadcn CLI 4.22.1、base-nova、16 组件全部可用。CLI 需目标目录 `package.json`（用临时存根后删除）、把 `@/lib/utils` 误装成 npm 包 `cn`（重复 `node_modules`/`package-lock` 已删，15 处导入改回）；根清单零改动。圆角/过渡/遮罩/阴影按规范收敛；`tw-animate-css` 未装，registry 动画类惰性。
- **CSP**：生产 meta 严格；Base UI `ScrollArea` 内联 `<style>` 由 `CSPProvider disableStyleElements` 关闭；产物 0 内联脚本/`<style>`/`style=`/`unsafe-*`；真实 Electron `file://` 冒烟 `CONSOLE_MESSAGES=0`。
- **契约面**：新增 [ui-contract-surface](docs/feature/ui-contract-surface.md)：四套件 + `renderer.test.ts` 的入口/env/驱动方法/DOM id/class/data/aria/写死路径；新渲染器三态表；Phase 3/5 双端逐 check 名执行方式。IME 实际 **24 个运行时 check 名**（重锚，非 26）；`uiux-v2` 394 个 `check(` 调用点；`main` 323 条 `NAME=` 报告行；`bench` 无 check。
- **验证**：`npm run typecheck:renderer` 通过；`npm run build:renderer` 通过；入口引用资产 gzip（level 9）**216,401B**（JS 204,292 + CSS 11,725 + HTML 384）≤300KB；两档截图 `docs/change/2026-10-21-phase2-evidence/`；真实 Electron 44.7.0 `file://` 冒烟全绿（`#root`/模块/样式、标题栏 36、侧栏 248、内容列 900、引擎菜单 3 radio/aria-expanded/零 CSP、抽屉 424/Esc/焦点返回、确认卡 640/默认焦点/Esc、拖宽 328/双击 248/Shift+→272/收起、IME 组合保护、零 did-fail-load/零 CSP 错误）；`git diff --check` exit 0。
- **未验证**：真实聊天流/发送/附件/停止/双开关/确认卡 IPC/恢复卡/治理卡/设置/Pi 面板/打包安装包/bench/200% 文字/屏读/Windows。偏差（其中引擎 DropdownMenu 契约已在 Phase 2b 修正；其余如 ScrollArea 滚动条隐藏、菜单无 Motion 入场、空态演示文案、`dist/src/index.html` 路径等）逐项见变更记录。
- **证据**：`docs/change/2026-10-21-phase2-evidence/`（两档截图 + `electron-smoke/report.{json,txt}` + 默认/抽屉/确认卡截图）；冒烟脚本在 `/tmp/ans-phase2-file-smoke.cjs`（不入库），证据已删 `user-data`。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase2-shell.md](docs/change/2026-10-21_change_ui-platform-phase2-shell.md)
- 指纹：工作树未提交，以 `git diff`/`git status` 为准（`app/renderer/src/**`、`components.json`、`app/renderer/tsconfig.json` 新增；旧渲染器文件零改动）。


## 2026-10-21 Phase 2b：UIUX 设计对齐评审 needs-work 修正

- **触发**：UIUX Phase 2 评审 needs-work（三项 Phase 3 前必须 + 引擎契约决定 + 廉价项）。只改 `app/renderer/` 与 `角色卡/桌面UI/`。
- **修正**：① `<html class="dark">`，深色变体生效；`#sc-allow` 边界回 `--input`（rgb(107,117,126)）。② Button/Input/Textarea/Checkbox/Switch/菜单项焦点环统一 2px solid `--ring` + 3px offset；修掉 Tailwind v4 `outline-none` 的 `--tw-outline-style:none` 与基础 `outline-ring/50` 压色（未分层规则）。③ Button primary hover `--success-hover`（rgb(127,178,155)）/ active `--primary-active`（rgb(94,143,122)）；outline/ghost/secondary hover/active 收敛；字号 13、disabled 0.45；发送禁用中性底。④ 引擎选择器改为自绘 `EngineSelect`，恢复旧 `combobox/listbox/option` ARIA 与 ↑↓/Home/End/Enter/Space/Esc/Tab/视口 placement；`DropdownMenu` 保留但不再用于引擎。⑤ Checkbox 选中 `--warning`（rgb(196,161,95)）。⑥ 960 scope 后缀隐藏、ScrollArea thumb 令牌、图标描边/尺寸、Button 字号等廉价项。
- **验证**：`typecheck:renderer` 0 错；`build:renderer` 通过；Electron `file://` 冒烟 **49 项全 true**（含 dark、outline 边界、焦点环、primary hover/active、checkbox warning、引擎 ARIA/键盘、960 scope），零 console/CSP/did-fail-load；gzip（level 9）**188,883B**（JS 176,510 + CSS 11,984 + HTML 389）；CSP 扫描 0 内联/0 unsafe；`git diff --check` exit 0。证据：`docs/change/2026-10-21-phase2b-evidence/`（1360/960 默认/引擎菜单/确认卡放行 hover+焦点 + `cdp-styles.json` + Electron report）。
- **未做**：角色树 roving tabindex/↑↓/Home/End（Phase 3）；确认卡退场/菜单入场 Motion、空态文案、Phase 5 演示标记与 dist 入口（按阶段）。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase2-shell.md](docs/change/2026-10-21_change_ui-platform-phase2-shell.md)（Phase 2b 节）


## 2026-10-21：vendored markdown-it 安全升级 15.0.2 → 15.0.3

- **安全依据**：15.0.2 命中 GHSA-gfr2-rv44-r23c（high，CVSS 7.5，默认配置下多行 link reference definition 二次方渲染，聊天渲染路径可达）与 GHSA-vfgh-jcmw-g37q（low），均修于 15.0.3；装配已把 npm 依赖升到 15.0.3，本轮把 vendor UMD 同步到同版本。
- **来源/哈希**：`npm pack markdown-it@15.0.3`（临时目录 `/tmp/ans-md-it-1503`），tarball sha256 `98a7453983ab0e268c17dbd5260bf7190ba46b4cca912327fc1c1a2578e4b56d`、integrity `sha512-+Az7Ojz3iRGu8KYMvJ6xVhvrxP3eE+vEtJX75Ow88XBpcQNV/0lGX5ZynIIBftREo4DC2jsveAMDaeltmm8QvQ==`（与根 lock 一致）。vendor UMD sha256：`635972b9…`→`391f2aa6…`；LICENSE 内容不变（`792c48c5…`）。
- **改动**：替换 vendor UMD/LICENSE；`vendor/README.md` 版本/URL/sha/安全说明；`markdown.js` **仅头注释版本号**；`test/桌面应用/markdown.test.ts` pin 版本+sha+README 断言。`html:false`、链接白名单、图片禁用、表格启用、代码块类与装载顺序**逐字未动**。
- **测试**：`node --test test/桌面应用/markdown.test.ts` **5/5 / exit 0**；`node --test test/桌面应用/*.test.ts` **679/679 / 0 败 / exit 0**（XSS 负例与 html:false 钉子全绿）；`git diff --check` exit 0。
- **未验证**：真实 Electron 聊天流渲染（Phase 3 迁移后复验）；未跑全仓其他角色测试。
- Doc: [docs/change/2026-10-21_change_markdown-it-vendor-15-0-3.md](docs/change/2026-10-21_change_markdown-it-vendor-15-0-3.md)


## 2026-10-21 Phase 3A：聊天流核心迁移（真实 IPC；旧渲染器不动）

- **范围**：新渲染器接真实 listing/会话/历史/事件；旧 `index.html`/`renderer.js`/`styles.css` 与 7 个经典脚本零改动；只写 `app/renderer/`、`test/桌面UI/`、三个 e2e 目标切换、角色资料。
- **实现**：`src/chat/` 纯逻辑（行模型 150/30、回放 skip/append/full+去重、状态优先级、事件路由/工具事实、markdown-it 15.0.3 封装、角色视图）+ `chat-store`/`ipc`；`Sidebar` 真实项目/角色树（分组/状态/roving tabindex/导入）；`ChatStream`/`VirtualPane`/`ChatRow`（历史回放/实时事件/虚拟窗口/空/加载/队列/tool-current/行类型）；`Composer` 非受控 textarea + IME + sendSession + pickImage 最小附件；`ChatHeader`/`Drawer` 真实角色；驱动扩展 `loadProject/selectRole/rowModelDebug/paneDebug/onRoleState/appendOperatorRequest/...`。
- **门禁**：typecheck 0 错；build 通过；gzip **246,608B**（JS 232,745 + CSS 13,475 + HTML 388）≤300KB；CSP 0 内联/0 unsafe；`ime-enter` 新入口 **24/24**；`bench-storm` 新入口 **BENCH_DONE=1**；新单测 **15/15**；旧基线 **679/679**；真实 Electron 冒烟 **16/16**（历史/虚拟/operator 锚点/状态/Markdown）；`git diff --check` 0。
- **未达/未实现**：uiux-v2 新入口默认段首个 check 未过（工具组/拒绝行细节），**不宣称双端等价**；shell/恢复/双开关/停止/队列抽屉/设置/治理卡/delivery/persistence/report 全文/operator 镜像留 3B/4；无新增依赖、未改根清单/主进程/preload/desktop。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase3a-chat.md](docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)
- 证据：`docs/change/2026-10-21-phase3a-evidence/`（Electron report/截图、ime 报告、bench JSON、uiux-v2 失败报告）


## 2026-10-21 Phase 3A2：UIUX 3A 评审 7 项必须修正

- **触发**：UIUX Phase 3A 评审 needs-work（7 项 Phase 3B 前必须）+ 工具组折叠 check。只改 `app/renderer/`、`test/桌面UI/`、`角色卡/桌面UI/`；旧渲染器零 diff、断言未改。
- **修正**：① Markdown 标题 15/15/14 + 16/6、列表 4/18/20、引用、表格 `--card` 表头/6×10/强底线/外框、p 10。② `.is-replay .88`、`.msg-handback.is-blocked` 3px danger。③ 工具行真实时间（旧 `shortTime`）、timed-out 危险色、折叠摘要异常计数危险色、`›` chevron、未放行直显 + 前相位目标补全；工具组相位合并/连续组/运行中展开/轮末折叠/手动保持。④ choice 选项 40px 可点区/选中底/`accent-color`/中性 `--input` 边。⑤ 删除未消费 `keepEl`；details 开合与 choice 选中提升到 store；`preferTail` 仅贴底时生效。⑥ 空态 CTA 改 shadcn Button。⑦ `sys-config` danger。
- **门禁**：typecheck 0；build 通过；gzip **250,017B**（JS 235,651 + CSS 13,964 + HTML 402）；CSP 0 内联/0 unsafe；新单测 **18/18**；IME **24/24**；bench `BENCH_DONE=1`（两次 stormA 36.9/29.9ms、stormB 31.6/28.2ms，handler ≤1.0ms；阈值未定）；Phase 3A2 Electron 冒烟 12 组行为断言全 true、0 console/0 did-fail；`git diff --check` 0。
- **uiux-v2 新入口**：默认段前 8 项 true，第 9 项「one independent work list without duplicated role documents」未过（工作概览 3B/4）；工具折叠段前 12 项 true，第 13 项尾部折叠阅读锚点未过（3B/5）。**不宣称双端等价**。
- 证据：`docs/change/2026-10-21-phase3a2-evidence/`（smoke report + 1360/960 聊天流与 choice 截图、ime、bench、uiux/toolfold 报告）。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase3a-chat.md](docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)（3A2 节）

## 2026-10-21 Phase 3A2 性能：bench-storm 热路径回归修复

- **归因**：Chrome tracing + DOM 计数显示 300 事件风暴把 300 个无 callId 工具事件放进同一个默认折叠组，React 仍每批重建 300 个 `.tool-activity`（`createElement` 1,805 次；最长 `TimerFire` 12.36ms，其中 React `FunctionCall` 10.36ms）。`getBoundingClientRect` 仅 6 次、Layout 0.34ms、Paint 0.06ms，布局/时间格式化/选择器不是主因。
- **优化**：>40 行且折叠的工具组延迟挂载明细（小工具组保持旧 DOM 契约）；`ChatRowView` 按 row + data 引用 memo；活动项原地 push 追加（行数据换新引用）；保留 16ms 合帧与实时性，不做滚动降频。
- **结果**：同机交替 3 轮，新 stormA 17.7/21.3/17.6ms（旧 26/23.3/17.5，中位 23.3→17.7），新 stormB 19.8/18.9/17.2ms（旧 17.6/17.7/17.6）；handler max ≤0.3ms；replay 2.1–5.9ms、scroll 0.5–7.3ms。优化后 tracing 最长任务 5.58ms、createElement 4、无 longtask。目标 ≤25ms 达成。
- 证据：`docs/change/2026-10-21-phase3a2-evidence/bench-opt/`（3 轮 old/new JSON、profile-final、trace-final、profiling-summary、优化前 profile）。其余门禁：typecheck/build、新单测 18/18、旧基线 679/679、IME 24/24、Phase 3A2 冒烟 12 组全 true、uiux-v2 前 8 项与 toolfold 前 12 项不回退。

## 2026-10-21 PM §10.4：登记大工具组延迟挂载为唯一 DOM 例外

- **登记**：契约面 `docs/feature/ui-contract-surface.md` §七；常量 `DEFER_TOOL_ROWS_WHEN_CLOSED=40`，仅同一连续工具组闭合且调用数 >40 时延迟内部 `.tool-activity-list`；摘要、失败/未放行计数与直显保持；展开立即挂载；≤40 调用小组保持旧契约。
- **依据**：PM [2026-10-21_review_ui-platform-round.md §10.4](../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) 批准为唯一、限定范围例外；其他 DOM 差异须另行报 PM。
- **验证**：`docs/change/2026-10-21-phase3a2-evidence/defer-tool-rows-verify.json`：60 调用闭合组内部行 0、摘要可见；点击展开后 60 行挂载（首/末路径正确）；再次折叠回 0；10 调用小组闭合仍挂载 10 行。

## 2026-10-21 Phase 3B：真实确认卡族、judge 双开关与输入区完整接线

- **范围**：按 PM §10.6 放行，完成 Phase 3 Phase 剩余项——真实 shell/su/恢复确认卡（fail-closed）、judge 结果行与双开关、发送/停止/队列位次与撤回/角色草稿/完整附件 UX、`[系统·看护/收束]` 注入行；外加 UIUX 3A2 非阻塞项（Lucide chevron、表格 13px、status glyph 清理、C1）。未扩围到 Phase 4。
- **实现**：新增 `chat/judge.ts`（文案/结果映射纯逻辑）、`chat/confirm-logic.ts`（卡状态机/失效/队列/附件纯逻辑）、`stores/confirm-store.ts`（卡 + 双开关 + 一次性警告）；`ConfirmCard` 改为真实 IPC 双卡（`#shell-confirm/#recovery-confirm` 常驻 DOM、`hidden` 切换、拒绝/取消默认焦点、Esc/×、失效定格）；`Composer` 发送三态/停止/附件（选/粘/拖/data URL 缩略图/移除）/双开关；`ChatStream` 队列位次 + 撤回就地回执；`ChatRow` judge 结果行 + operator `judgeNotice`；`chat-store` 判断结果行锚定/幂等、提示来源收口、空历史不覆盖实时行、`append(from 0)` 全量重建、aborted 清除错误；`events.ts` 注入分类补 `用户指令：`/`[系统·]` 严格闭合/`[派发]/[回交]`、非工具 denied 只作系统事实；`test-driver` 补齐 3B 驱动面。
- **门禁**：typecheck 0；build 通过；CSP 0 内联/0 unsafe；gzip **240,133B** ≤300KB；新纯逻辑 **33/33**；旧基线 **679/679**；旧渲染器核心零 diff；IME **24/24**；延迟挂载 **10/10**；真实 Electron 离线 IPC 冒烟 **45/45** + 18 张 1360/960 截图，零 console/CSP；bench 旧/新交替各 4 轮（首轮预热）全阈值通过（stormA 中位 17.6ms、stormB 19.2ms、p95/单轮 19.5ms）；uiux-v2 JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17、默认 9/10、SEND_FACTS 8/9、QUEUE_VIEW 1/2。
- **C1**：尾部折叠 Δ 由 51→**16px**（旧 32px），中段 0；未放宽断言。
- **UIUX 3B 评审修正（同日，5 项 Phase 4 前必须）**：SU 档位摘要 600 + 绕过写边界警告 `--warning`（默认提示仍 `--text-3`）；`#sc-details` 加 Lucide ChevronRight；`.capsule.is-dropping` 拖入反馈（`--text-3`/`--hover`）；`.queue-withdraw` 20→28px/11px；`.attach-chip` 10→8px、`.attach-rm` 圆形→4px、X→12/1.5。冒烟扩至 **45 项 + 17 张截图**（新增 6 项样式断言与 shell 详情/拖入态截图），复验 JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17；gzip **240,133B**。评审记录：`角色卡/UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase3b-review.md`。
- **未实现**：Phase 4 项（引擎真实切换/每引擎会话、工作概览/队列抽屉、治理三权/镜像/治理记录动作、资料/文档、delivery/persistence/报告全文、operator 镜像、`replayAnchorDebug`）；全量双端等价仍 Phase 5。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md](docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md)
- 证据：`docs/change/2026-10-21-phase3b-evidence/`（smoke 45 项 + 截图、uiux 各段报告、ime、bench 8 轮、lazy、单测、构建/CSP/预算、C1 归因）。

## 2026-10-21 Phase 4A 范围与写集清单（仅规划）

- **依据**：PM 评审 revision 5 §11.2–§11.4（Phase 4 已授权，拆 4A→4B；4A 派发前置 1 要求桌面UI 先产出范围与写集清单）。
- **交付**：[docs/design/2026-10-21_design_ui-platform-phase4a-scope.md](docs/design/2026-10-21_design_ui-platform-phase4a-scope.md)：4A 五个功能面（引擎真实切换与每引擎会话/历史/草稿、三引擎设置、角色资料/待办/队列/文档只读、工作概览、队列抽屉）逐项行为与验收面；新增/修改文件写集（全部在 `app/renderer/`、`test/桌面UI/`、`角色卡/桌面UI/`）；4A 驱动方法与契约面 #7/#9/#10/#15/#16/#18/#19/#20 三态目标；纯逻辑单测 + Electron 冒烟 + uiux-v2 预期关闭 check 名；零新增依赖；热路径影响（不改聊天行/工具组，仅 ipc 入口缓存 + Composer 草稿键，计划 bench 重基线与懒挂载 10/10）；风险/未决项与 4A/4B 文件级互斥。
- **待 PM 复核**：QUEUE_VIEW 口径（该段实际断言 operator 排队聚合，PM §11.2 列 4B）、runtime 是否持久化、工作概览最近回交深度、`chat/extensions`/`driver-extensions` 扩展点机制、组件台账、C2 基线红处理。
- **边界**：本轮只写 `角色卡/桌面UI/`（本文件 + memo/changelog + 3B 记录笔误更正），未改 `app/`、`test/`、依赖、主进程/preload/desktop、旧渲染器或根配置；未运行应用/测试/构建。

## 2026-10-21 Phase 4B：治理三权/镜像/聚合、治理记录、报告全文与回执

- **范围**：PM §十五放行；QUEUE_VIEW 4 项、治理三权卡/镜像/排队聚合、治理记录建立/重新接受/迁移预览、报告全文/persistence/delivery 回执、judge 跨引擎重放、`replayAnchorDebug`、single 警告刷新、菜单配置状态、queueView 顶层 tab 切换、C2 重锚、MIRROR 五角色重锚。**不做 Phase 5**（main.mjs/全量双端/入口切换/打包/真实模型）。
- **实现**：新增 `chat/governance-view.ts`/`operator-view.ts`/`report-view.ts`/`anchor-view.ts`、`stores/governance-store.ts`/`report-store.ts`、`shell/GovernancePanel.tsx`/`ReportCard.tsx`/`phase4b.css`、`chat/extensions/{reports,governance}.ts`、`driver-extensions/{replay-anchor,governance}.ts`；解冻 `chat-store/ChatRow/ChatStream/confirm-store/events`（最小）并改 `ipc/runtime-view/drawer-store/settings-store/ChatHeader/EngineSelect/lib-platform/types/work-view/test-driver`。聚合行唯一、镜像同 id 双面只答一次/双冻结、排队不入 runtime 快照、预览零写入/确认才写、报告/交付按 scope 定点更新、菜单 208 两行按需缓存。
- **重锚**：uiux-v2 MIRROR 五角色（verifier、`治理模型：三权 · 五角色`、five-role 名、显示名对齐 role-view/README v1.4.0）；C2 改名 `expired old shell collapses with reason visible in its own runtime`（收起+原因可见）；SELECTOR 菜单宽度 180→208（4B 设计 §6.1，读取次数断言保持）。
- **门禁**：typecheck/typecheck:renderer 0 错；build 成功；CSP 严格；gzip9 **284,814B ≤300KiB**；旧基线 **679/679**；`test/桌面UI` **96/96**；IME 26 true/0 false；懒挂载 **10/10**；4B 冒烟 **70/70**；QUEUE 4/4、MIRROR 8/8、GOV 5/5（7 reports）、JUDGE 33/33、G2 5/5、SELECTOR 27/27、CONFIG 21/21、ROLE 11/11、SEND 8/8、TERMINAL 22/22、TOOLFOLD 19/19、RUNTIME 17/17（C2 重锚）、VISUAL 54/54；bench 同机同日 3 轮全阈值（A 17.8/B 17.6，p95≤19.5）；C1 Δ=16；旧渲染器/main/preload/desktop 零 diff；零新增依赖/例外。
- **返工复核（needs-work→pass）**：C2 原因可见（knownShellIds + 重放 hint，RUNTIME 17/17）、已答卡 full rebuild 锚点（建行保存 anchorKey）、960 树行不收缩、200% 左栏可滚动+树可见+缺配提示全文首屏+逐容器（含 notice/status/tree/col-mid/composer）无横溢、200% 报告卡/完整摘要/治理预览可见且内部无横溢、facts 冒号分离、取消回焦；冒烟 70/70，VISUAL 54/54，补证副本（COMPLETE_FLOW 12/12、默认段 100 checks）记录于证据。
- **边界与已知**：见 [4B 变更记录](docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md) 与[证据](docs/change/2026-10-21-phase4b-evidence/)。DELIVERY_NOTE/COMPLETE_FLOW 官方段止于 Phase 5 Sidebar 项；默认段官方止于 Phase 5 虚拟窗口阅读锚点；全量双端仍留 Phase 5。

## 2026-10-21 Phase 5A：范围、删除清单与测试迁移计划（仅规划）

- **交付**：[docs/design/2026-10-21_design_ui-platform-phase5a-scope.md](docs/design/2026-10-21_design_ui-platform-phase5a-scope.md)。5A 三项缺口（Sidebar 身份 data/aria 无第三行、P7「待选择」文案、虚拟窗口 full replay 阅读锚点）实现计划；旧渲染器/vendor/旧测试删除清单（index.html、renderer.js、styles.css、7 经典脚本、vendor 3 文件；renderer/markdown/tool-rows/runtime-ui 四测试 178 项先迁后删；hot-path/message-queue 旧段交接桌面窗口）；测试迁移分组与新源码守卫；e2e（uiux-v2/ime/bench/design-audit）目标切换与双端快照；5B 最终入口路径（推荐 dist/index.html，回退 dist/src/index.html）与切换前置；5A/5B 写集/不写、契约面最终更新、1360/960/200% 证据、热路径重基线；风险与 8 个待 PM 复核点。
- **边界**：本轮只写 `角色卡/桌面UI/docs/design/` 与 memo/changelog；未改 `app/`、`test/`、依赖、主进程/preload/desktop、旧渲染器或根配置；未运行应用/测试/构建。

## 2026-10-21 Phase 5A：Sidebar 身份、P7 待选择、阅读锚点与测试迁移

- **范围**：PM §十七放行；三项缺口 + 178 项旧测试逐名迁移 + 四 e2e 目标切换/fail-fast。**不删旧渲染器/vendor/旧测试、不切生产入口、不打包/接真实模型**。
- **实现**：Sidebar 删除可见 `.ti-badge`，身份保留 `.primary/.builtin` + `data-primary/data-builtin` + `aria-description`/title；`.ti-count` 唯一数字。`operator-view.pendingKindFor` 按 `operatorSurfaces` 聚合：任一 choice ⇒「待选择」，否则「等待你确认」，无 pending ⇒ null；状态标签只换文案。新增 `chat/reading-anchor.ts`（60 字前缀/offset/贴底/delta/一次性登记），`chat-store.applyHistory` 在 `model.clear()` 前只读捕获，`VirtualPane` 行高测量后按同一文本行 delta 校正 scrollTop（找不到/贴底不动，无动画/计时器）。四套件 `ANS_RENDERER_ENTRY` 显式缺失 exit 2。
- **链接回归修复**：`chat/markdown.ts` 在 document 捕获 `a.md-link`，一律 preventDefault+stopPropagation 不导航；仅 http/https 经 `getDesktopBridge().openExternal` → preload `app:open-external`（主进程白名单 http/https）外开；相对/锚点/mailto/file/data 不导航；通道缺失/失败写 `data-open-result`/title 如实标记；DocumentView `#document-read-text` 保留自身内部链接解析；rel=noopener noreferrer 不变。
- **测试迁移**：[178 项逐名台账](docs/change/2026-10-21_phase5a-test-migration-ledger.md)；新增 `markdown`（XSS/配置/npm pin/外链拦截）、`tool-summary`、`role-view`、`source-guard`、`ui-store`、`reading-anchor`，`operator-view` 扩充。
- **门禁**：typecheck/typecheck:renderer 0；build 成功；CSP 严格；gzip9 **288,552B**；新单测 **142/142**；旧基线 **683/683**（原 679 + 桌面窗口 Phase 5A 新增 4 项（入口接线/dev 回退/导航兜底/导航守卫））；5A 冒烟 **36/36** + 21 截图（含 Markdown 外链、200% composer/错误态、200% 镜像卡/交付批次目标、680/480 六类目标遮挡断言）；DELIVERY_NOTE **9/9**（identity 官方 pass）；COMPLETE_FLOW P7 **官方 pass**；默认段阅读锚点 **官方 pass**（offset 差 0）；MIRROR 8/8、QUEUE 4/4、GOV 7 报表、JUDGE 33/33、G2 5/5、SELECTOR 27/27、CONFIG 21/21、ROLE 11/11、SEND 8/8、TERMINAL 22/22、RUNTIME 17/17、FRESH 4/4、VISUAL 54/54、TOOLFOLD 19/19（C1 Δ=20）、4B 冒烟回归 70/70；IME 26/0；懒挂载 10/10；bench 旧/新交替 4 轮（3 有效中位）全阈值（A 18.3、B 17.7、replay 6.2、scroll 11.9）；main 新端 E2E_FAILURES 空；COMPLETE_FLOW 41/41。
- **UIUX 最终审计 P1（同日第三轮）**：200%（680/480 CSS）sticky composer 遮挡报告/完整摘要/治理预览/镜像动作/交付事实/S0 CTA。≤680 CSS composer 压缩到 **95px**（底栏单行、折叠 scope/compose-note/键盘提示；480 审/决单字），`#chat`/`.col-mid` `scroll-padding-bottom:104`、`#chat` padding-bottom 104；治理预览打开时 composer static；480 头部/空态收紧（chat client 200）。冒烟新增 **12 项目标 bottom ≤ composer.top**（report/details/preview/mirror/delivery/S0 × 680/480），**36/36**、21 截图；4B 70/70、design audit 31 项 0 bad、main E2E_PASS。新 hash：JS `f568e2aa…`、CSS `b52cfca1…`、HTML `f372e111…`；gzip **288,552B**。
- **已知边界**：toggleDrift/MERGE 重锚已落地（默认段 110/110、MERGE 12/12）；COMPLETE_FLOW 41/41；design audit 已按 §十九重锚 exit 0；剩余交 UIUX 的重跑/带提示条密度与 P2 观察。旧渲染器/vendor/旧测试未删除，生产入口未切换。
- Doc: [docs/change/2026-10-21_change_ui-platform-phase5a-gaps.md](docs/change/2026-10-21_change_ui-platform-phase5a-gaps.md)
- 证据：`docs/change/2026-10-21-phase5a-evidence/`（gates、smoke 21 图、GHOST/FLOW/DEFAULT/VISUAL/TOOLFOLD、各段、IME、lazy、bench 原始+summary）。

## 2026-10-21 Phase 5B 原子批次 a：旧渲染器删除与新源入口迁移（桌面UI）

- **前置**：5A 门关闭；178 项迁移台账关闭；XSS 负例已迁 `test/桌面UI/` 全绿。
- **删除旧渲染器**：`app/renderer/index.html`（旧 326 行）、`renderer.js`、`styles.css`、`engine-selector.js`、`markdown.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js`、`vendor/`（README/LICENSE/markdown-it.umd.min.js）；逐文件哈希见 [5B 变更记录](docs/change/2026-10-21_change_ui-platform-phase5b-cutover.md)。
- **移动**：`app/renderer/src/index.html` → `app/renderer/index.html`（481B，SHA256 `0785…311d`，逐字一致；CSP meta 与 `/src/main.tsx` 保留）。
- **删除旧守卫测试**：`test/桌面应用/{renderer,markdown,tool-rows,runtime-ui}.test.ts`（178 项台账覆盖）。
- **e2e 默认目标**：`uiux-v2`/`ime-enter`/`bench-storm`/`uiux-design-audit` 默认 `app/renderer/dist/index.html`；`ANS_RENDERER_ENTRY` 覆盖与 fail-fast 保留，断言未改。
- **核验**：`app/renderer/` 顶层只剩 `index.html`/`src/`/`dist/`/`tsconfig.json`/`components.json`；`app/renderer/src` 无代码 import 已删文件（仅历史注释）。非本步骤范围的 `hot-path.test.ts`/`message-queue.test.ts`/`test/测试/**`/`test/装配/verify-local-package.mjs` 仍引用旧文件，已在变更记录列明，交步骤 b/各属主。
- **未执行**：按步骤 a 约定不构建/不测试（Vite input 待步骤 b，构建暂时失败）；生产入口未切换。

### 5B 步骤 b：默认新入口复跑（2026-10-21）

- 装配产出 `app/renderer/dist/index.html` 后，桌面UI 四个冒烟默认（3B/4A/4B/5A）与四个 e2e 默认均切 `dist/index.html`；`ANS_RENDERER_ENTRY` 覆盖/fail-fast/断言保留。
- `source-guard` 静态入口路径改 `app/renderer/index.html`；3B `session:send` 夹具补 `sessionCurrent:true`（5A 拒发不失效语义）。
- 复跑：5A **36/36**（21 图）、4B **70/70**、3B **45/45**、4A **99/99**、IME **26/0**、design audit **31 项 0 bad**、`test/桌面UI` **142/142**。bench 4 次中位 stormA 19.1/B 18.6/handler 0.65/0.7/replay 11.05/scroll 15.15，均低于阈值。
- 产物 `dist/index.html` SHA256 `3c4da2a2…33b301`；JS `f568e2aa…`、CSS `76fad7ce…`；gzip **288,530B**。证据 `docs/change/2026-10-21-phase5b-evidence/`。

### 5B 收尾：AC8 文档最终化（2026-10-21）

- `ui-contract-surface.md`：状态 implemented；生产入口唯一 `app/renderer/dist/index.html`（renderer-entry 解析）；删除 `dist/src`/旧入口/旧守卫作为现行契约的表述；三态表 #1、#22、#24–#28 更新，新增 #34–#39（入口切换、旧渲染器删除、vendor 删除、e2e/冒烟默认翻转、DOM 例外保持、驱动面最终）；套件总表与 3.x 入口全部改 dist/index.html；清理旧文件/旧模块引用。
- `api-spec.md`：顶部新增「最终口径」新渲染器模块表；装配说明改 Vite 输入/产物与 CSP；合规守卫改 `test/桌面UI`；Phase 2 历史段标注，旧入口表述改为历史。
- 死 CSS：确认 `.ti-badge` 无引用；为保持已审计冻结候选 hash 不重建，本批不删除（契约面选择器附录已移除）。DOM 例外保持两条（延迟挂载 40、失效 operator 卡动作隐藏）；未新增。

### 角色显示名回退修复：治理职能新称（2026-10-21）

- `role-view.ts`：proposal `报告员 / Rapporteur`→**Draft / 提案**；nomination `提名官 / Nominator`→**Crew / 组队**；schedule `召集人 / Convener`→**Steward / 统筹**；liaison「主理 / Lead」、verification「验收 / Proof」不变。
- 同步 `role-view.test.ts`、`governance-view.test.ts`、`phase4b-electron-smoke.mjs`（来自 Draft / 提案）、`uiux-v2.mjs` W6-C names/mirror source；role id 不变。
- 复跑：role/governance **15/15**、`test/桌面UI` **142/142**、4B **70/70**、5A **36/36**、MIRROR **8/8**、typecheck 0/0、build 成功。
- 新 dist：html `c8ad0e82…`、js `050776ec…`、css `76fad7ce…`；gzip **288,514B**。记录 [role-display-names](docs/change/2026-10-21_change_ui-platform-role-display-names.md)。

### 历史派发去重 + 品牌图标（2026-10-21）

- `events.ts` 新增 `historyProjectionKey`/`dedupeHistoryDescriptors`/`dedupeHistoryRows`；`applyHistory` 对 user/injected/system/delivery 按 (turnId + 分组 + 首行文本) 去重，优先保留带 anchor/request 身份的一条；assistant 同轮多行、不同 callId 工具行不误删。新增 `test/桌面UI/history-dedupe.test.ts` 4 项。
- 品牌图标：复制 `ans-studio-ans-icon.png` 到 `src/assets/`；TitleBar `.titlebar-mark` 20px、Sidebar `.workspace-brand-mark` 30px，`img alt="ANS"`；保留「治理会话工作台」「AGENT WORKSPACE」；source-guard 与 5A 冒烟新增断言，1360/960/200% 截图更新。
- 复跑：单测 **147/147**、5A **37/37**、4B **70/70**、uiux 默认 **110/110**、MERGE **12/12**、MIRROR **8/8**、TOOLFOLD **19/19**（C1 Δ=20）、design audit **31 项 0 bad**、main **E2E_PASS=true**、bench 4 次全阈值。
- 新 dist：html `f779ac60…`、js `007c60aa…`、css `531d8035…`、icon `ff88e313…`；gzip **288,931B**。记录 [history-dedupe-brand-icon](docs/change/2026-10-21_change_ui-platform-history-dedupe-and-brand-icon.md)。
