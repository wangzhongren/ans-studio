# entry-role-minimal 批次 E：UI 对话框（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：E（UI 对话框）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 E-01–E-10。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地提交，不 push、不合并 main。
- 依据：D 批已判 pass（v2 报告 205 行 / `71b32058…`，候选 `e019ffec08b36c681ab36df21e03beade3243ed7`）；E v1 判 rework（报告 165 行 / `8d8bea68…`，候选 `d436c07c`）；团队计划 §4.5、验收标准 E-01–E-10、Delta-6、Delta-1。
- 提交链：E 初版代码/测试 `e7ac5b2`；E 初版文档 `d436c07`；**E rework 代码/测试 `d30f648`**；最终 E 文档提交见最终报告。

## 1. 目标与生效口径

- **全部客户裁决/审批**（decision/proposal/appointment/acceptance/intent-confirm、appointment-write、普通确认）在应用窗口内以**独立模态对话框**呈现；聊天流只保留沟通/系统通知，不渲染可作答卡。
- **一次一卡/优先级**：高风险（显式 `risk:"high"`/`destructive`）> 审批（`appointment-write`）> decision > 低风险确认；同优先级 FIFO。
- **打断语义（rework 修正）**：无活动卡时，空闲打开最优卡；**输入中只有高风险可立即打断**。已有活动卡时，**只允许更高优先级的高风险替换**；decision/审批/低风险新卡一律排队到当前卡处理完或稍后。停止输入空闲（约 1.2s）/focusout 后自动推进队列。
- **稍后处理**：移入待办，不代答、不默认；关闭/Esc 同义；当前卡处理完/稍后后自动推进下一张未稍后卡；「还有 N 张待处理」含 queued。选择题「拒绝/取消」**不受选项完整性限制**（rework 修正）。
- **judge 代批**：主进程已结算的卡不进入 pendingOperator ⇒ 不弹窗；结果行/历史保留；manual/deny/不可用不弹窗。
- **对话框**：来源/标题/上下文/预览/选项/唯一推荐/风险提示/操作按钮；默认焦点「稍后处理」；焦点陷阱、Tab/Enter/Esc、ARIA；破坏性/审批卡二次确认；提交锁防双击；内容未就绪不可提交；不堆叠。
- **独立决策中心**：`decisions` 抽屉 tab：待办（含稍后/排队）、历史（含过期）、judge 代批、搜索/筛选、处理重开；不在聊天流。
- **任务/日志**：`tasks` tab：任务卡/状态/期望产出/最后短报、收口/终止/安全重派、角色日志徽标/最后日志/最近动作/日志视图。
- **开关**：保留双复选框/一次性警告/结果行，新增直接提交/应用裁决/独立对话框/代批不弹窗提示。
- **shell/恢复确认**：保留独立高风险模态；决策对话框在其活跃时隐藏，保证一次只显示一个模态。

## 2. 主要文件

- 桌面UI：`app/renderer/src/chat/{DecisionDialog,DecisionCenterPanel,TaskCenterPanel}.tsx`、`chat/{decision-dialog,role-log-view}.ts`、`stores/decision-center-store.ts`；改 `ChatRow/ChatStream/App/ChatHeader/Composer/Drawer/WorkOverview/drawer-store/test-driver/phase4a.css`；operator 行只保留 `sys-operator-note`。
- 桌面窗口：`app/main.ts`/`app/preload.cjs` 新增 `tasks:list|restore|close|redispatch`、`roles:activity-log|terminate`；`app/desktop/interface.ts` 删除 3 个旧治理入口方法（`advanceGovernanceFlow`/`routeAcceptanceAutoRework`/`evaluateAcceptanceTriage`，−624 行）。
- 项目管理：i18n `ui.decisionDialog.*`/`ui.taskCenter.*` 58 key；`i18n.test.ts` 计数更新。
- 测试：新增 `desktopUI/{decision-dialog,dialog-queue,dialog-a11y,dialog-history,role-log-view,i18n-b1-b2}.test.ts`；重写 `decision-card-view.test.ts`；改 `ans-wiring`、`phase5a`、E2E；`operator-view/history-dedupe/role-status-view` 保留复核（E-02 偏差见 §7）。

## 3. i18n

- `ui` **850**（D 末 792，+58）、`main` 541、`shared` 62、`preferences` 3，总计 **1456**；zh/en parity；en-US 泄漏 0；旧 flow/triage/gate/ledger/acceptance/liaison key 0。

## 4. 验证（rework）

- **最终 clean 全量**（rework 代码/测试后）：**2903 tests / 2873 pass / 12 fail / 18 skip**（335 枚举/334 执行）；D 基线 2880/2850/12/18 ⇒ +23 tests/pass、fail/skip 无增；12 fail 全为既有基线（9 Windows symlink + T1×3）；**新增确定性失败 0、无新 skip**。日志 `%TEMP%\e-rw-full.log`（sha256 `b463248208eae194a0c60ea82f4ad2b867d7e0978f708e4138199190e0272638`）。
- **E 专项**：`decision-dialog` 5/5、`dialog-queue` 3/3、`dialog-a11y` 5/5、`dialog-history` 2/2、`role-log-view` 3/3、`decision-card-view` 2/2、`i18n-b1-b2` 2/2、`ans-wiring` 7/7、`i18n` 6/6；既有 `operator-view` 8、`history-dedupe` 4、`role-status-view` 9、`source-guard` 10、`i18n-guard` 6 全过。
- **运行时 Electron 行为（phase5a rework，既有文件名）**：**30/30 checks、failures=0**，新增真实点击覆盖：choice 未选择拒绝→cancelled、Esc=稍后不提交、焦点陷阱 Tab、ARIA modal/labelledby/describedby、破坏性与二次确认、双击只提交一次、输入中 decision 不打断/高风险打断/空闲推进、已有对话框 decision 不替换、过期申请进入历史；日志 sha256 `efdae1a6…`，report.json `0c77c913…`。
- **phase3b smoke**：45 checks 全过、无 console/CSP；日志 sha256 `e7a2f664…`，report.json `a8bb2c9a…`。
- **Electron E2E（最终）**：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空；17 PNG + `00-titlebar.png` 环境性 `UnknownVizError`；`OP_CANCEL_DECLINED=true`、`OPX_EXPIRED_HISTORY=true`、E_DIALOG/E_CHAT/E_LATER/E_TODO 全 true；report sha256 `3ee429c0…`，SHA256SUMS `247bf3da…`。
- **静态**：`typecheck`/`typecheck:renderer`/`build:renderer` exit 0；日志 sha256 `aee16865…`/`914780f6…`/`7ac9084e…`。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0；无 `.env`。

## 5. E v1 阻断项处置

| ID | 处置 | 证据 |
| --- | --- | --- |
| F-E1 choice 拒绝无效 | 修复 `send(decision,{allowCancel})`；取消路径不受 canSubmit 限制；single-submit lock | phase5a“choice 未选择时拒绝可提交 cancelled=true”；E2E `OP_CANCEL_DECLINED=true`；`decision-dialog` 5/5 |
| F-E2 输入中/打断语义 | 仅高风险可在输入中打断；已有卡只允许更高优先级高风险替换；focusout/stop-input idle（1.2s）推进 | `shouldOpenDecision` 单测 5/5；phase5a 输入中 decision 不打断/高风险打断/空闲推进/decision 不替换全 true |
| F-E3 运行时无障碍 | phase5a 实机覆盖 Esc/焦点陷阱/ARIA/二次确认/双击/取消；源码正则仅保留辅助 | phase5a 30/30 |
| F-E4 过期历史 | `chat-store.expireOperator` 调用决策中心 `expire(...,payload)`；历史显示已失效 | phase5a 过期历史 true；E2E `OPX_EXPIRED_HISTORY=true` |
| F-E5 哈希/owner | §8 补 43 文件逐文件 blob/sha256；owner 记录补代码/change-E 哈希；最终文档提交见报告 | §8、9 owner |
| F-E6 E2E 假绿 | 删除旧聊天卡 anchor/chip 段；OPX 按模态语义重写；E-03/04/05/06 关键项纳入 hardChecks；仍 false 项见 §6 | E2E `OPX_DUP_SINGLE_CARD/EXPIRED_HISTORY/OP_CANCEL=true`；`E2E_PASS` 由 hardChecks+repairCheck 共同决定 |
| E-02 偏差 | `operator-view/history-dedupe/role-status-view` 本批保留复核（行为不变）；F-04 完整差异表解释 | §7 |

## 6. E2E 仍 false 项（非本批 E-03/E-04/E-05/E-06 行为）

以下为报告中的旧断言/旧夹具/旧 UI 快照，均不属于 E 对话框/待办/任务日志行为；E 关键项已全部 true：

- 旧左侧/空态/CTA：`HAS_OTHER_GROUP`、`CHAT_CTA_PRESENT`、`SESSION_NOT_AUTO_OPENED`、`BOOTSTRAP_HAS_ROLES`、`REFRESH_OTHER_GROUP_SHOWN`。
- 旧聊天/报告/工具行夹具：`OLD_GENERAL_CLAIM_PRESENT`、`DENIED_REASON_VISIBLE`、`DISPATCH_ROW_NO_WITHDRAW`、`HANDBACK_CARD_PRESENT`、`HANDBACK_STATUS_OK`、`MD_STRONG_RENDERED`、`MD_TAG_TEXT_ESCAPED`、`LINK_OPEN_EXTERNAL_CALLED`、`SU_DELIVERY_CARD_PRESENT`、`TOOLROW_HAS_PATH`、`INJECTED_STYLE_PRESENT`、`REPORT_DELIVERY_DETAILS_COLLAPSED`、`REPORT_DELIVERY_INLINE_BODY_NEW`、`INJECTED_CHIP_DELIVERY_LABEL`、`INJECTED_NOT_USER_BUBBLE`、`STATUS_LAST_EVENT_RECORDED`。
- 旧侧栏/队列/滚动/设置快照：`BADGE_ON_WORK_WHILE_COLLAPSED`、`BADGES_CLEAR_ON_EMPTY`、`NO_SELECT_ELEMENTS`、`COMPOSER_ROWS_ARE_ATTACH_CAPSULE_NOTE`、`ROLE_STATE_BADGE_WORKING_PENDING`、`ROLE_STATE_BADGE_HAS_ICON`、`ROLE_STATE_BADGE_HOVER_FULL`、`ROLE_STATE_QUEUE_ROW`、`SHELL_CONFIRM_ESC_NOT_ALLOWED`（phase3b 已真实覆盖 shell Esc=不放行）、`RIGHT_QUEUE_RUNNING_FIRST`、`RIGHT_QUEUE_SOURCES`、`S1_NOT_YANKED`、`S1_STAYED_AWAY_FROM_BOTTOM`、`VIEWPORT_TOP_SINGLE_HAS_VISIBLE_ROWS`、`PI_KEYS_ARE_FIVE`、`PI_FIELDS_MATCH_REGISTRY`、`DRAWER_CLOSED_AFTER_PI`、`SWITCH_CONFIRM_ON_BUSY`、`SWITCH_CONFIRM_RELOADED`、`SWITCH_IDLE_HINT`、`REPLAY_DEDUP_REBUILD`。
- 说明：这些旧断言随 D/E UI 结构或夹具变化失效，F-04 终态回归统一重写/删除；E2E 的 E 关键检查已纳入 hardChecks，不再只靠 repairCheck。

## 7. 测试差异 / E-02 偏差

- 新增：decision-dialog（4→5）、dialog-queue 3、dialog-a11y 5、dialog-history 2、role-log-view 3、i18n-b1-b2 2；重写 decision-card-view 2；ans-wiring +1（7）；phase5a 17→30 checks；E2E 重写 OPX/取消/过期/旧卡断言。
- E-02 偏差：`operator-view`/`history-dedupe`/`role-status-view` 计划写“重写”，实际本批行为未变，保留复核；F-04 完整差异表解释断言数与未改原因。
- 全量测试文件仍 335（334 执行），E 批无删除/新增 skip。

## 8. E-10 逐文件哈希（候选 `d436c07`，43 文件 = 23 A + 20 M）

| 文件 | 状态 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | M | `30a36aba7d7fcb00e6c3ab6f629ea3c37e6bb311` | `75f9e6d5e4b4fbfb2f742321645ea0c6552ea9db9ad7d010e3a7431978e3851c` |
| `app/main.ts` | M | `5ae62e753dda35f34f3c21d5524132c3a2fbbb75` | `c97f2d4186be9fa44e7f12c31aa7a4d6e7a5763f084e2c7e1bff8db9e8f35f42` |
| `app/preload.cjs` | M | `b491b9a3240115b67900c93f8ae961b3ca7f0e26` | `8614190931934ceda4ee68cfcbf7059beffca92faa623d04f8408b702f15fbbf` |
| `app/renderer/src/App.tsx` | M | `97e06f506d92c16d378579660b9d94f82ce0c102` | `1e442dbcbd3d574b51d2a20cbd38be0d97943bbd2e882d0d743fb81478420cd1` |
| `app/renderer/src/chat/ChatRow.tsx` | M | `0950a992ba7cb0106dd74b706d015ccdb500b74e` | `476fa4bce011d18e2807aa3408405bf45e1f2f0204e6ab95bb904f3b4836c2ba` |
| `app/renderer/src/chat/ChatStream.tsx` | M | `279221908c3bf3c2498c17e7ce26e5dcd478c8fa` | `20a9443bd5e6b3e4402d4a905001ce4f38e98774b1f3cd90a33dc5fddc8c8be9` |
| `app/renderer/src/chat/DecisionCenterPanel.tsx` | A | `b3ddb21411adec64de06444fa89dc373cd4eac6a` | `c6066d127b9bb014a12939cc4cdd25d8bb10b836e70c0f075e834e2be517796c` |
| `app/renderer/src/chat/DecisionDialog.tsx` | A | `94c1d3b0bc6a5e5a61228880306001033894aa82` | `0a52609957e30e4fef644b9d242ba68f3b70987b614161d059569e3b80a6c6e1` |
| `app/renderer/src/chat/TaskCenterPanel.tsx` | A | `0005c8cb67150ca9fba9fa262b26802584dc5d60` | `91619d7839d46919b4d2e5d79ac313dc6c878901c38f2bd7bc76d5be07b5745f` |
| `app/renderer/src/chat/decision-dialog.ts` | A | `e515e87986e42702082fa4c7a209ecbb703da100` | `a5e653beb80498cb3a812ea5f8d4a8d1cc4455be860ff824ebf43d305ac64462` |
| `app/renderer/src/chat/role-log-view.ts` | A | `20ab996e582e082fa04100554bad07c8f77ca84d` | `0fc2b2b1335241fa67d64d065075f27cfa524c9de4d54c8dcab96d35dfffa60b` |
| `app/renderer/src/lib/platform.ts` | M | `f4ee9f35652150a411cfe5f753638755904e1cec` | `c47ee04416bacc18a83bed2180173fe7e5b4d56c0100e8899463c9aa530739a3` |
| `app/renderer/src/shell/ChatHeader.tsx` | M | `19b0f3aea98465df9e9d45139c44eef9e996b92a` | `680cd61c1e923700b9ef73cc831fa7cf4f4b617a61bf566e833aab2584fd5ed4` |
| `app/renderer/src/shell/Composer.tsx` | M | `c19e0565b4fc00fcd60522d46780306377a3da44` | `02d6acc2c4f381c13a60b90f4bbe070af611bcf4eb8d66c789fc0cc0c5342d80` |
| `app/renderer/src/shell/Drawer.tsx` | M | `71bee5e56e501b5d808338398d665fdcb82886d2` | `7ea558188e14b76f9b0db4886056514f7bbd3c9e35fae86b916f9d8f2b721adc` |
| `app/renderer/src/shell/WorkOverview.tsx` | M | `d2460aeb06642a7832649c4e325a2966b8722015` | `85405e816852abaa3bc4284ca77f92bd2c3e484c07255787a5ced99d1d3b41f0` |
| `app/renderer/src/shell/phase4a.css` | M | `143336416d3670471b7eecc3f28bc29135d38fa1` | `b8d4959e1dd7174f1e7177777a19cb0c110fb1a2f5870797a034edddb50866bf` |
| `app/renderer/src/stores/decision-center-store.ts` | A | `a53562f2922d8aac2f12084c2abc259126e760bc` | `104764fdfa85f68363f28ef64d11d21d9e1fffa006d2a77ef400578bfcaff51c` |
| `app/renderer/src/stores/drawer-store.ts` | M | `fd5478a4908a2475338a8dd2508a882d52ca3239` | `98bf5ee144eb1c5ac47533a330fba054e63bff2cc9e6cfd5b57316344e678026` |
| `app/renderer/src/test-driver.ts` | M | `fb4c1c59bb5d523b1d541c9d6e684e5bec0fa190` | `909e0f33f81b10b18d99d106fd8a6ff296088d42147c49e37a2c8eac1e53261d` |
| `docs/scheduling/2026-10-28-entry-role-minimal-change-E.md` | A | `8e1f695be9de5d7d1c146ee24bab1a19c29aa99e` | `553cc681007443ec996a9c0aba70316fb91394d4933ef6ae9f462a049696907b` |
| `src/common/shared/i18n/messages/en-US.ts` | M | `2720ab5e6e74c456ba69bc7f8e9054a3a8797953` | `50762682dfff37a12e969cd93a59f4814b0046fb99f377b4ca1847a6c91ff471` |
| `src/common/shared/i18n/messages/zh-CN.ts` | M | `a60e9f5c08f188ae3c62ccb8585a05a288684cb7` | `cef3a5fa72c1abc4c6610f491f15cb4d7215a9257672eb844ac0679fbf8112e7` |
| `test/桌面UI/decision-card-view.test.ts` | A | `312849d619b8962ce523f4e72307741b70fd2af3` | `778578b0be9fc4e4a42b5209eacaafa9c22c213cc6ed5a1727d8352ba50a6d74` |
| `test/桌面UI/decision-dialog.test.ts` | A | `f6da8204f1413910d1319f74dd6076062938943a` | `d5121ca0add422640aecbdcdb5a104c81d2886e0fed1722d8730b312d4baa8ce` |
| `test/桌面UI/dialog-a11y.test.ts` | A | `be98237dfc93748f796dd9823c47c39a10975b68` | `6111a273a53b014f556d64ff6a090f340e6b649976df6754b3a86fbdaff4f95d` |
| `test/桌面UI/dialog-history.test.ts` | A | `24bca6aa1390234d70c92bfda7a8c4cc359259df` | `5544ae14a059769015b9b969113feb01e448782a5c6e08ecfd3922d88d0b59df` |
| `test/桌面UI/dialog-queue.test.ts` | A | `23e48e600a16f9028456b201e2288b59855a0e09` | `581b1304e79b4b9904e2766523e90ea1cc3c1d51c7c024f608f622174eb6d782` |
| `test/桌面UI/i18n-b1-b2.test.ts` | A | `db30bc8ce14b7e083db21e4cc45b5caa8f5d6dfe` | `9ea86f2fcb87c701333d4772384ad2f9511d69584b568804044494cb50d6d0c7` |
| `test/桌面UI/phase5a-electron-smoke.mjs` | M | `277c40431589419f9fec85597bedadc250ef0b39` | `f9a5f3a0dc93c72b79e746b5b5f60e123b8d58c72dd78799ed7f78859b6744cc` |
| `test/桌面UI/role-log-view.test.ts` | A | `d34fc6986e1ed07706bceb8ba486595b09195438` | `0c44b31b96560dc63818e01ac6b8fc766b0c52c03b1ac426d1eb53b6b02c067b` |
| `test/桌面应用/ans-wiring.test.ts` | M | `0c295539d51a3e332b5a8a69cb4619febdcd129e` | `94bac889df7b5f7f49fe98913489d89d87634fc0193d647a7c174e6b75e2f554` |
| `test/桌面应用/e2e/main.mjs` | M | `b1846e684ab6df5ff76a230be6435a664d05a182` | `79681e185fb449997f773a70cc9c84359d7d7ecf8bc6512c6bad4b74d1aeadc7` |
| `test/项目管理/shared/i18n.test.ts` | M | `b78021e2406a06b6b53af3eb80d93e86b9a45adf` | `975ba980e10232d73b5d06fd8cd45ff2a1b521752dbb69780c8c1eac963047cd` |
| `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `997b5a195aa122764287ab8c6048cd8880ed1122` | `3b029f4a00aa9cea460559e64ff5ba1a49bcf7badf46287dfe08fc8c6720eabc` |
| `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `fbe220d88afaabec1c210261bc2044b3a22e7602` | `a2e9575f0988829ae7295d19f22d2e65866347c911c158708c4382c926992871` |
| `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `32e1d6d8a52deadea959d100df6d20aa9d031492` | `9f1793f6710d993f8575b9ec50368a0ef965f11c72fc9a4f94c7e4534caf5638` |
| `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `03efb4b139284b1cdb9df5dd778eebe7952c25a8` | `ca7d9ab04817618347e01a63fb283dba9bdc5156406ff46e96486a03d800346d` |
| `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `8e3117d49fe31bddb10c83dad781582fa59776f3` | `950a192b902f17f5a73cdaff5602143119b58b818ed9721131177c0727b68dcb` |
| `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `14de25fd387c084db6e2c57d231f73963cbd7591` | `6eb3d543e79ddf5dcc5acb48eeff3d3ba48e82aa18a83aa6cbda10817ffc3ac2` |
| `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `c47f8c89c6c7577cb8f8b1da49eadde92680bba5` | `80826204e1170e5bd564f390e72ecbbb77513e834164157e131db27ecf92a405` |
| `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `1e6260685a2d05f426adb836685ef4bb4d21c9a7` | `16737061fb1b5c47baf6641fdb08fc9e9fcb86e98b7604b6d96bdf7133271303` |
| `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `48053cf0a9498697c08f56c678266edd2149dc74` | `a7e944c1fef5b1bce579321ee2a56d10e76e752b0cb9c6cc2ba4309e966572a3` |

统计：候选 `d436c07` 的 23 A + 20 M = 43 文件。

## 9. 文件统计 / 回滚

- E rework 代码/测试 `d30f648`：9 files / +189 / −127；E 初版代码/测试 `e7ac5b2`：33 files / +2099 / −1722；E 文档累计（`d436c07` 10 files / +325 + 本文件后续）见最终报告。
- E 范围（`e019ffe..最终 HEAD`）最终统计/整树哈希见最终报告；package/lock 零改动；无新依赖/目录（Delta-6）。
- 回滚：`git revert` E rework 代码/文档 + E 初版代码/文档，恢复 `e019ffec` 并重跑 D 验证；待办/历史为 UI 状态可丢，不迁移。
