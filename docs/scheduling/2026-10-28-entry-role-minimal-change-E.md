# entry-role-minimal 批次 E：UI 对话框（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：E（UI 对话框）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 E-01–E-10。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地提交，不 push、不合并 main。
- 依据：D 批已判 pass（v2 报告 205 行 / `71b32058…`，候选 `e019ffec08b36c681ab36df21e03beade3243ed7`）；团队计划 §4.5、验收标准 E-01–E-10、Delta-6（不新增 e2e 目录/文件）、Delta-1（F 批 optional-acceptance 不在本批）。
- E 实施提交：`e7ac5b2`（本文件为 E 文档提交，最终 SHA 见最终报告）。

## 1. 目标与生效口径

- **全部客户裁决/审批**（decision/proposal/appointment/acceptance/intent-confirm、appointment-write、普通确认）在应用窗口内以**独立模态对话框**呈现；聊天流只保留沟通/系统通知，不渲染可作答卡。
- **一次一卡**：同一时刻最多一个决策对话框；高风险（显式 `risk:"high"`/`destructive`）> 审批（`appointment-write`）> decision > 低风险确认；同优先级 FIFO；新到高优先级可打断当前低优先级（不自动聚焦确认）。
- **稍后处理**：移入待办，不代答、不默认；关闭/Esc 同义；当前卡处理完/稍后后自动推进下一张未稍后卡；「还有 N 张待处理」含 queued。
- **judge 代批**：主进程已结算的卡不进入 pendingOperator ⇒ 不弹窗；结果行/历史保留 judge 代批；manual/deny/不可用不弹窗。
- **对话框**：来源角色/标题/上下文/预览/选项/唯一推荐/风险提示/操作按钮；默认焦点在「稍后处理」；焦点陷阱、Tab/Enter/Esc、ARIA 标签/描述；破坏性/审批卡二次确认；内容未就绪不可提交；不堆叠多窗。
- **独立决策中心**：抽屉 `decisions` tab：待办（含稍后）、历史、judge 代批、搜索/筛选、「处理」重新打开对话框；不在聊天流。
- **任务/日志**（B-10 收口）：抽屉 `tasks` tab：任务卡/状态/期望产出/最后短报、收口（accepted/rework/rejected）、终止、安全重派入口；角色日志徽标（正常/迟滞/卡死/等待）、最后日志时间/最近动作、日志视图；数据经新 IPC 白名单。
- **开关**：保持「替我审批/替我决策」复选框、一次性警告、`judge 代批` 结果行；新增提示（申请由角色直接提交、应用裁决、幕僚只收通知；裁决在独立对话框/待办面板；开关开启代批不弹窗）。
- **shell/恢复确认**：保留既有独立模态（高风险）；决策对话框在 shell/recovery 活跃时隐藏，保证一次只显示一个模态。

## 2. 主要文件

- 桌面UI：新增 `app/renderer/src/chat/{DecisionDialog,DecisionCenterPanel,TaskCenterPanel}.tsx`、`chat/{decision-dialog,role-log-view}.ts`、`stores/decision-center-store.ts`；改 `ChatRow/ChatStream/App/ChatHeader/Composer/Drawer/WorkOverview/drawer-store/test-driver/phase4a.css`；移除聊天流 operator 可作答卡（`op-request/op-confirm/op-submit`），改为 `sys-operator-note` 系统通知。
- 桌面窗口：`app/main.ts`/`app/preload.cjs` 新增 `tasks:list|restore|close|redispatch`、`roles:activity-log|terminate` 白名单；`app/desktop/interface.ts` **物理删除** 3 个旧治理入口方法（`advanceGovernanceFlow`、`routeAcceptanceAutoRework`、`evaluateAcceptanceTriage`）及其声明（@ts-nocheck 清理启动）。
- 项目管理：i18n `ui.decisionDialog.*`（含 switchHint/statusQueued）与 `ui.taskCenter.*`；`i18n.test.ts` 计数更新。
- 测试：新增 `test/桌面UI/{decision-dialog,dialog-queue,dialog-a11y,dialog-history,role-log-view,i18n-b1-b2}.test.ts`；重写 `decision-card-view.test.ts`；改 `ans-wiring.test.ts`（E IPC 接线）、`test/桌面UI/phase5a-electron-smoke.mjs`、`test/桌面应用/e2e/main.mjs`；`operator-view/history-dedupe/role-status-view` 保留复核（行为不变）。

## 3. i18n

- 新增 key：`ui.decisionDialog.*` 38 个（标题/来源/风险/稍后/确认/拒绝/提交/二次确认/待办/历史/搜索/筛选/打开/状态/judge/ARIA/空态/排队/开关提示等）+ `ui.taskCenter.*` 20 个（任务/日志/收口/终止/重派/最后日志/最近动作等）。
- 计数：`ui` **850**（D 末 792，+58）、`main` 541、`shared` 62、`preferences` 3，总计 **1456**；zh/en parity；en-US Han 泄漏 0；旧 flow/triage/gate/ledger/acceptance/liaison key 0 命中。

## 4. 测试与验证

- **全量 clean**（最终候选，`--test-concurrency=1`，335 枚举/334 执行，排除 `write-sequencing.test.ts`）：**2902 tests / 2872 pass / 12 fail / 18 skip**；D 基线 2880/2850/12/18 ⇒ tests +22、pass +22、fail +0、skip +0；12 fail 全为既有基线（9 Windows symlink + T1 pi/codex/claude×3）；**新增确定性失败 0、无新 skip**。日志 `%TEMP%\e-full-final.log`（sha256 `703f38e8236b4ddd288a7e8b1bbc2501bc3d3a53c01f77e5acc428f1bfacdbbd`）。
- **E 专项**（新/改 UI 测试）：

| 测试文件 | 变化 | 用例数（前→后） | 结果 |
| --- | --- | ---: | --- |
| `桌面UI/decision-dialog.test.ts` | 新增 | 0 → 4 | 4/4 |
| `桌面UI/dialog-queue.test.ts` | 新增 | 0 → 3 | 3/3 |
| `桌面UI/dialog-a11y.test.ts` | 新增 | 0 → 5 | 5/5 |
| `桌面UI/dialog-history.test.ts` | 新增 | 0 → 2 | 2/2 |
| `桌面UI/role-log-view.test.ts` | 新增 | 0 → 3 | 3/3 |
| `桌面UI/i18n-b1-b2.test.ts` | 重写 | 5 → 2 | 2/2 |
| `桌面UI/decision-card-view.test.ts` | 重写 | 0 → 2 | 2/2 |
| `桌面应用/ans-wiring.test.ts` | 增 E 接线 | 6 → 7 | 7/7 |
| `项目管理/shared/i18n.test.ts` | 计数更新 | 6 → 6 | 6/6 |
| `桌面UI/phase5a-electron-smoke.mjs` | 重写 | 旧脚本 → 17 checks | 17/17 |
| `桌面UI/operator-view` / `history-dedupe` / `role-status-view` / `source-guard` / `i18n-guard` | 保留复核 | 8/4/9/10/6 | 全过 |
- **静态**：`typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0；日志 sha256 `aee16865…` / `914780f6…` / `ace8a274…`。
- **Electron E2E**（真实 Electron 44.7.0，`%TEMP%\ans-e2e-e-final-l43xsc`）：**`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空**；17 PNG + `00-titlebar.png` 环境性 `UnknownVizError`；决策对话框 single/priority/more/later/todo reopen/task/log 检查全 true；report sha256 `79feff1fe0aab87a01771e24e67a358d334a79ed27aee4d0304a6f1e799d0ae4`；SHA256SUMS `ed1fb09aa378c8772775cc19c563a4815329d08ad12a1f5b3a6f680e7b8ef1d2`。
- **phase3b smoke**：`SMOKE_DONE=1`、CHECK 全过、无 console/CSP；日志 sha256 `b3ed548d…`，report.json `789078c8…`。
- **phase5a smoke（E 重写）**：**17/17 checks、failures=0、无 console/CSP**，覆盖六角色/chief、决策对话框一次一卡/优先级/更多/默认焦点/稍后、待办/历史、任务/日志面板、200% 无横向溢出；日志 sha256 `0d01e4ca…`，report.json `8b6e15e4…`，截图 5 张。
- 环境：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；Electron 44.7.0；无 `.env`。

## 5. 文件统计

- `e019ffe..e7ac5b2`：**33 files changed / +2099 / −1722**；代码树哈希（`git diff --binary e019ffe e7ac5b2 | sha256sum`）`6b59dbbb981ab28c168b9b55955478d99b70495e482ade92d1e393e93c6a8cf6`；新增 7 个 UI/测试文件、1 个 store；删除/收窄旧聊天卡渲染与 3 个死接口方法（`interface.ts` −624 行）。
- `package.json` / `package-lock.json` 零改动；不新增依赖/目录（Delta-6：e2e 使用既有文件名/目录）。
- @ts-nocheck 进度：`interface.ts` 删除 `advanceGovernanceFlow`/`routeAcceptanceAutoRework`/`evaluateAcceptanceTriage` 三个运行时入口及声明；`interface.ts`/`session.ts` 仍有过渡死代码，F 前必须清完并移除 `@ts-nocheck`（D v1 决策条件）。

## 6. 决策点 / 风险

1. **shell/恢复确认与决策对话框**：shell 卡保持既有独立高风险模态；决策对话框检测 shell/recovery 活跃时隐藏，避免双模态堆叠。
2. **queued 语义**：「还有 N 张」= 当前 pending 其他 + `queuedOperator`；queued 卡在待办只展示「排队中」，不可直接处理（由主进程顺序呈现）。
3. **phase5a smoke 重写**：旧脚本绑定 Liaison/mirror 卡（D 已撤除），按 E 目标重写为六角色/决策对话框/任务日志/200% 检查；仍使用既有文件与目录（Delta-6）。
4. **@ts-nocheck**：本批只清理 3 个安全可删入口；F 前必须完成剩余死代码清理并移除标记。
5. **不新增依赖/package**；不写 flow/gate/ledger；不 push/合 main；F 批 optional-acceptance 未提前。

## 7. 回滚

- 回滚 E：`git revert` E 代码提交与文档提交；恢复 D 候选 `e019ffec` 并重跑 D 验证。待办/历史为 UI 状态可丢弃，不迁移。
