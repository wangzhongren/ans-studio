# B6 语义核对表（回交 B8 / fixed T3 / 派发 fail-closed / Git 端口）

- 日期：2026-11-13
- 角色：桌面窗口
- 方法：语义项 → 证据 → 结论。证据 = 方法体归一化 sha 相等（`moved-methods.json`）+ 定向测试
  （`final/*.log`，失败名对照基线 `baseline/*.log`，见 `failure-name-diff.txt`）。

| # | 语义项 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | **回交 B8 形状防御先行**：`isTaskHandbackShape` 在任何 `hb.taskId` 读取之前；坏形状走 `commitHandback` 的 fail-closed 系统行（`handbackMalformed`），不抛 TypeError 进事件流异常 | `handleHandback`/`commitHandback`/`isTaskHandbackShape` 归一化 sha 相等（moved-methods.json）；`handback-delivery` 16/18；`chat-handback-integration` 3/3；`b82` 11/11；`b111` 5/5 | ✅ 逐字搬移 |
| 2 | **回交去重/提交屏障**：`enqueuedHandbackKeys`（一条回交只投一次、永不放行重投）、`pendingHandbackKeys`（在途闸）、`taskHandbackCommits` 按 taskId 串行、`taskDeliveryCommits.done` 等待 | handback 2 字段由 `Handback.state` 单 owner 创建；`commitHandback`/`handleHandback` sha 相等；`handback-delivery` 16/18（2 项既有失败与干净 b5901ac 基线**逐名一致**：`2026-10-24 trio 回交路由…`、`B 星形回交…`） | ✅ |
| 3 | **回交目标路由**：星形任务按 `task.created.from` 回创建者（`reportTargetForTaskCreator`）、内置来源→Lead（trio）、single/su 不自交、`handbackOwner` 合批语义（`resolvedTarget === handbackOwner` 只在 drain 侧 delivery/queue.ts） | `commitHandback` 全文哈希相等；drain 侧合批（delivery/queue.ts `batchesForHandbackOwner`，B4 已迁出）本批未动；`message-queue` 20/20；`chat-handback-integration` 3/3 | ✅ |
| 4 | **fixed stage-request 核心接线**：fail-closed 字段校验（flowId/workflowPath/stage/workflowAction/roleId）、`ensureFixedPathStarted` 原子写、fixed 模式复核、convener 生产派发从真实受派任务自动绑定 workflowId/stage/flowId、不回落 legacy | `routeFixedPathDispatch` sha 相等；`b71-fixed-fail-closed` 7/7；`fixed-path-routing` 13/13；`b51` 14/14；`b61` 9/9；`b81` 6/6；`b101` 11/11 | ✅ |
| 5 | **fixed scope 记录（B2 change.scope-decided）/路径 B 写集/启动门**：B3 advance 前 `recordFixedPathBScopeDecisionForDispatch`；B1/B3 派发前 `ensurePathBStartForDispatch`；B3 `checkPathBWriteSetForDispatch` 越界 `b-change-scope-invalid` | 3 方法 sha 相等；`b3-fixed-baseline-pathb` 10/10；`b3-workflow-git-real` 9/9；`fixed-path-full-chain` 3/3 | ✅ |
| 6 | **轻量验收 close 门（B31/B34）**：A12a/A12b accepted 收口前 `verifyFixedReviewCloseBasis`（drift/缺失 fail-closed 原样透传）；A12b/B3 accepted ⇒ 自动 `prepareReleaseMerge` + merge-main 卡（`isFixedReleaseTriggerStage` 窗口） | `verifyFixedReviewCloseBasis`/`closeCreatedTaskFixedForSession` sha 相等；`b31-fixed-release-auto-desktop` 9/9；`b3-fixed-cards-panel` 8/8；`b3-release-merge-desktop` 7/7；`b51` 14/14 | ✅ |
| 7 | **fixed 卡裁决/阶段推进**：intent-confirm confirm/revise、proposal accept/revise/reject、appointment 选定 ⇒ 对应 stage 事件；失败只诊断+系统行（不阻塞客户决定、不伪造） | `recordFixedCardWorkflowResolution`/`prepareFixedAppointmentCardRequest` sha 相等；`b3-fixed-cards-panel` 8/8；`b51` 14/14 | ✅ |
| 8 | **派发 fail-closed 门逐字保留**：`document-planning-source-unavailable`、`document-planning-module-forbidden`、`document-planning-source-changed/invalid`、`review-source-*`、`worker-dispatch-*`、`stage-request-required`、`controller-resume-*`、`assigned-child-unavailable-before-enqueue` 等 | `routeDispatch`/`routeStarDispatch`/`resumeChiefController` 归一化 sha 相等（仅 §6 门面中转/类型两处记录化适配）；`b71` 7/7（含 fixed 聊天 `stage-request-required` 反例）；`dispatch-fresh-enum` 2/2；`star-routing` 失败名与基线**逐名一致（NO_DIFF，3/7 同基线）** | ✅ |
| 9 | **star/legacy 路由与 chief controller 恢复**：legacy 普通派发仍 routeStar；`prepareControllerResume` 双次核验 + lease 顺序 + `host.isCurrent()` 失败码（`controller-resume-source-*`/`-basis-changed`/`-stopped`）逐字 | 同上方法 sha 相等；`star-routing` NO_DIFF；`b71` 7/7；`b61` 9/9 | ✅ |
| 10 | **Git runtime 装配注入顺序与失败隔离**：turn 校验 → assignment 复核 → run-stop 栅栏 → `createGitRoleRuntime`；失败码 `git-delivery-source-changed`/`run-stop-host-fenced`；gitQuery/gitCandidate/gitPublish 三处经 `gitContextFailure`（repoId unavailable/blocked） | `git-ports.ts` 片段逐行等价（adapters-and-equivalence.md §2.1–2.2）；`b42-task-git-port-desktop` 8/8；`b3-workflow-git-real` 9/9；`boundary-refresh` 14/14 | ✅ |
| 11 | **session-dispose lease/信号**：begin（kind session-dispose）→ 命中宿主动作记录中断信号 → end；错误文案/抛出点不变 | adapters-and-equivalence.md §2.4；构造/停止相关套件（`message-queue` 20/20、`handback-delivery` 16/18、`b82` 11/11）与工具面快照 7 角色一致 | ✅ |
| 12 | **工具面零变化**：7 角色 openRoleSession 注入工具名集合/顺序与 c234e79 冻结清单逐字一致 | `session-structure.test.ts` 8/8（含工具面快照两用例） | ✅ |
| 13 | **导出面零变化**：运行时 6 值 + 类型 45 逐字不变 | `session-structure.test.ts` 8/8 | ✅ |
| 14 | **fixed 卡通道**：presentMergeMainCard 经 CardGateway（`presentAppCard`），客户本人唯一授权；judge 只能转人工/拒绝/超时；无通道保持等待 | `presentMergeMainCard`/`settleMergeMainCard`/`autoPresentFixedReleaseMerge` sha 相等；`b31` 9/9；`b3-release-merge-desktop` 7/7 | ✅ |

## 首线验证汇总（final vs 干净 b5901ac 基线）

| 文件 | final | 基线 | 失败名 |
| --- | --- | --- | --- |
| handback-delivery | 16/18 | 16/18 | NO_DIFF（2 项既有） |
| star-routing | 3/10 | 3/10 | NO_DIFF（7 项既有） |
| message-queue | **20/20** | — | 顺序钉保持（`entry.busy = true;` 先于 `await this.sendDelivery(...)`） |
| chat-handback-integration | 3/3 | — | — |
| fixed-path-routing | 13/13 | — | — |
| fixed-path-full-chain | 3/3 | — | — |
| dispatch-fresh-enum | 2/2 | — | — |
| b101 / b111 | 11/11 / 5/5 | — | — |
| b3-fixed-cards-panel / b3-fixed-baseline-pathb / b3-release-merge-desktop / b3-workflow-git-real | 8/8 / 10/10 / 7/7 / 9/9 | — | — |
| b31 / b51 / b61 / b71 | 9/9 / 14/14 / 9/9 / 7/7 | — | — |
| b81 / b82 / b42 | 6/6 / 11/11 / 8/8 | — | — |
| chief-workflow（顺序钉） | 58/66 | 58/66 | **CHIEF_NO_DIFF** |
| run-change-entry | 5/5 | — | — |
| boundary-refresh | 14/14 | — | — |
| g1-copy-and-nails | 5/5 | — | — |
| evidence-markers / queue-status / request-status / hot-path / interface / governance-matrix | 1/1、5/5、4/4、3/3、8/8、18/18 | — | — |
| directive-input / h-scope-audit | 14/19、4/7 | 14/19、4/7 | NO_DIFF |
| session.test.ts（冒烟） | 6/7 | — | AC-8 预算 pin 既有失败（B1 起登记，非本批） |

- 结构保护：`session-structure.test.ts` **8/8**（导出面 51、导入图无环/分层、体量 4,624 ≤ 6,954、工具面快照）；
  `session-source.test.ts` **5/5**。
- `npm run typecheck` **EXIT=0**。
