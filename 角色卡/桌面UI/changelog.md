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
