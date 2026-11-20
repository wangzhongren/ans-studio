# 变更记录：block resolved 后阶段重入场——桌面接线（S1/S2 桌面批）

- 日期：2026-11-20
- 角色：ANS 内置「桌面窗口」（桌面侧运行时实现；协调者已授权本批范围）
- 分支/工作树：`fix/block-reentry-task-texts`（worktree `.claude/worktrees/fix-block-reentry-task-texts`；
  HEAD `2a363da` = origin/main（含 PR #159 SMOKE-1 接缝修复）；编排/模型批未提交改动 + 本批未提交）
- 编排批依据：`角色卡/编排/docs/change/2026-11-20_change_block-reentry-task-texts-foundation.md`
  （S1：`reenterBlockedStageAfterResolution` / `BLOCK_STAGE_REENTRY_OPTION_IDS`；S2：流程定义 v3 只改 A2/A3 文本）
- 范围：只改 `app/desktop/**` + 本记录。未改 `test/**`、门禁文本/roles、workflow 资源、`release.yml`/
  release-policy、`block-resolution.ts` 分类语义（只消费）；未 commit/push/CI/tag/main；未读 `.env`；
  未占 9222/9223/9224；验证用 `node_modules` junction 仅为本工作树临时依赖可见（gitignored，结束后移除）。

## 一、问题复盘（SMOKE-2 接缝）

1. **S1（核心）**：B8 owner-repair `resolved(fixed)` 后，桌面 `reEnterAfterFixed` 只调用
   `advanceAppDispatch`（重驱当前阶段）；阶段仍 `blocked` 时 `driveAppDispatchStage` 按 Q8 预算拒绝
   （`attempt > autoRetries+1`）⇒ 连续 17 次 `app-dispatch.drive.failed code:"stage-transition-invalid"`，
   阶段永久停在 A2 blocked。根因：block 解法是既成事实，重入必须先写显式账本事件
   （`stage.reworked` 带 `blockId`、同阶段、新 attempt），随后才 drive——桌面未接该 API。
2. **S2**：A2 任务文本越界（product 写 `docs/intents`）是编排/定义批的文本修复（v3 只影响新 select），
   桌面无需改动；本批只保证 v3/v2 在飞互不迁移（协议/版本语义由服务解释）。
3. **decided 面**：B9 客户/judge 裁决的「修订范围/返工/换执行者/限次重试」在桌面走旧的
   `advance`/属主修复/重派分支——同样没有明确重入场事实，换执行者路径还会对已 blocked/closed 的旧任务
   做重派（双动作风险）。

## 二、实现（接线点）

### 2.1 宿主管线

- `app/desktop/session/fixed-workflow/stage-dispatch.ts`：新增
  `reenterBlockedStage(projectRoot, {workflowId, stage, blockId, resolution, reason?})` —— 直接调用编排
  `reenterBlockedStageAfterResolution`（只透传账本事实；幂等/并发/锁/校验全在服务层；非 app-dispatch/v1
  由服务 `workflow-protocol-mismatch` fail-closed）。
- `app/desktop/session/index.ts`：block router 宿主注入
  `reenterBlockedStage: (root, input) => this.fixedWorkflowStageDispatch.reenterBlockedStage(root, input)`。
- `app/desktop/block-router.ts`：`DesktopBlockRouterHost` 新可选端口 `reenterBlockedStage?`（缺省 ⇒ 不重入，
  旧宿主零变化）。新增 `tryReenterBlockedStage` 归一服务结果为
  `reentered / already-completed / already-in-flight / drive-error / skipped / failed`：
  - 硬失败（`workflow-closed`/`workflow-stopping`/`workflow-corrupt`/`block-ledger-corrupt`/
    `workflow-ledger-write-failed`）⇒ 系统行、不回落第二套动作；
  - `block-not-*`/`block-resolution-mismatch`/`block-reentry-inapplicable`/`stage-transition-invalid`
    ⇒ `skipped`，调用方按既有语义回退（不误判）。

### 2.2 fixed 后重入（S1）

`reEnterAfterFixed`（engine fixed / repair fixed / 引擎对账 fixed 统一入口）：
- app-dispatch/v1 + `workflowId` + `lifecycle.stage` + 端口存在 ⇒ 先
  `reenterBlockedStage({resolution:"fixed", blockId, stage, reason:"block <id> resolved(fixed)"})`：
  - `reentered` ⇒ 系统行（新 attempt/taskId）+ `advanceAppDispatch` **补投递/续驱**新 attempt
    （服务 drive 只建任务；advance 幂等，不写第二条 rework）；失败只如实系统行；
  - `already-completed` ⇒ 系统行 + `advanceAppDispatch` 推进下一阶段（服务文档语义）；
  - `already-in-flight` ⇒ 不重复 driving；
  - `drive-error` ⇒ 系统行（reconcile/再次恢复可补驱动；不伪造完成）；
  - `failed` ⇒ 系统行、不伪造阶段推进；
  - `skipped`（stage pending/绑定不一致等）⇒ 保持既有 `advance` 行为（逐字不变）。
- fixed-v2.1/legacy：条件不满足 ⇒ 既有「修复完成简报」逐字保留（Q10 零迁移）。

### 2.3 decided 后重入（B9）

`executeChosenOption`：app-dispatch/v1 + `workflowId` + 选项 ∈
`BLOCK_STAGE_REENTRY_OPTION_IDS`（`block-revise-scope`/`block-rework`/`block-replace-executor`/
`block-retry-with-cap`）⇒ 先调同一端口（`resolution:"decided"`；`blockId` 账本事实 + `fact.stage ??
lifecycle.stage`）：
- `reentered` ⇒ 系统行 + `advanceAppDispatch` 投递/续驱；**不再**走旧属主修复/重派（不双动作）；
- `already-in-flight` ⇒ 空操作；`already-completed` ⇒ 系统行 + advance 下一阶段；
- `drive-error`/`failed` ⇒ 如实系统行；
- `skipped` ⇒ 按既有选项语义回退（旧行为；fixed-v2.1 逐字保留）。
- `block-terminate-flow`/`block-accept-current-state`/`block-accept-with-limits`/`block-grant-exception`/
  merge-main/stable-write 等**不重入**（既有终止/披露/主权卡语义）。

### 2.4 恢复路径（崩溃窗口）

`recover` 新增 `reenterResolvedFixedBlocks`：
- 扫描 blocks 账本中 `resolved(fixed)` + app-dispatch/v1 + 有 `workflowId/stage` 的 block；
- workflow 投影仍停在同一 **blocked** 阶段，且**尚无该 block 的 `stage.reworked` 事件**（即
  `resolveBlock` 与重入场之间崩溃）⇒ 调同一重入口（fixed），成功补 advance 投递；
- 已有该 block 重入场事件的旧 block **跳过**（后续失败由新 block 处理，不按旧 block 反复 re-drive）；
- 只补 `fixed`（decided 的崩溃窗口沿用既有恢复语义，见 §五）。

### 2.5 幂等 / 并发

- 服务层 `withServiceLock(projectRoot+workflowId)` + `stage.reworked` 幂等键 + 账本唯一 guard：
  同 `(blockId, stage)` 只一条 rework、一条新 attempt 任务；
- 桌面重复调用（恢复/重试/裁决重放）⇒ 服务回执 `replay=true`（同一 eventId/taskId），桌面不写第二条；
- `executeChosenOption` 只在 `resolveBlock(decided)` 成功后调用（账本终态为唯一触发）。

## 三、验证（cwd = worktree，均未提交）

1. `npx tsc --noEmit`：**0**。
2. 临时自检 `.tmp-block-reentry-desktop-selfcheck.ts`（未跟踪）4 组全过：
   - **S1 真实 SessionManager 全链**：A2 attempt1/2 blocked（Q8 耗尽 ⇒ blocked）⇒ B8 owner-repair 修复任务
     done accepted ⇒ block resolved(fixed) ⇒ `reEnterAfterFixed` 重入场：
     A2 task.created=3（attempt1/2/3，attempt3 唯一）、`stage.reworked` 恰 1 条（`stage===reworkOf==="A2"`、
     带 blockId）⇒ attempt3 done ⇒ A2 completed ⇒ 推进 A3 card-prompt；
     重复调用 `reenterBlockedStage` ⇒ `replay=true`，任务/rework 都不追加；
   - **decided(revise-scope)**：假宿主（真实 block 账本）裁决卡 ⇒ `executeChosenOption` 调重入端口
     （`resolution:"decided"`、正确 workflow/stage/blockId）+ advance 投递，**不建属主修复任务**；
   - **decided(terminate)**：同一宿主 ⇒ 不调重入端口（既有终止/披露语义）；
   - **恢复路径**：模拟「`resolveBlock(fixed)` 后未写 rework」崩溃窗口 ⇒ `recover` 补一条 rework（带
     blockId）+ A2 attempt3，A2 stage 任务=3。
3. 代表性桌面测试（`--test-concurrency=1`）：
   - `test/桌面应用/app-dispatch-block-seams.test.ts` **5/5**（SMOKE-1 接缝回归仍绿）；
   - `app-dispatch-delivery` + `fixed-path-routing` + `block-router` 合计 **39/40**；唯一失败 =
     `block-router`「新 select 使用 v2 定义」断言（actual 3 ≠ expected 2）——编排批 §四.4 已列明的
     版本钉死更新点（v3 现为当前版本），非逻辑回归；测试批随版本/hash 更新一并修。
   - 编排批记录中另列的 `test/编排` 版本/hash 钉死失败点（8 个）同属测试批更新范围，本批未改 test。

## 四、待测试批断言点

1. 版本/hash 更新：`WORKFLOW_DEFINITION_VERSION` 2→3、versions [1,2]→[1,2,3]、新 select 钉 v3、
   review 用例 seed 用 `WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2]`（在飞 v2 按 v2 解释）。
2. **S1**：B8 owner-repair fixed ⇒ 一条 `stage.reworked`（blockId、同阶段、attempt=旧 max+1）+ 一条新
   attempt 任务；attempt 任务 done 后阶段 completed 并推进 A3；**drive.failed 为 0**；
   `Promise.all` 双触发/重复恢复 ⇒ 仅一条 rework/任务（replay）。
3. **decided**：revise-scope/rework/replace-executor/retry-with-cap ⇒ 调重入（resolution decided），
   不建第二套修复/重派；terminate/accept 等不重入；block 账本 `block.resolved.reEntry` 为选项 id。
4. **恢复**：block resolved(fixed) + 阶段 blocked + 无 reentry 事件 ⇒ 补一条 rework/新 attempt；
   已有 reentry 事件的旧 block 不重复 re-drive。
5. **旧协议**：fixed-v2.1 不调重入端口（保持修复简报/advance 旧行为，逐字不变）；v2 在飞 workflow 重入场
   仍按 v2 定义成功（服务批自检覆盖）。

## 五、剩余风险

1. decided 的「`resolveBlock(decided)` 后、`executeChosenOption` 前崩溃」窗口：resolved 块不在 open 列表，
   本批恢复只补 fixed 重入（与编排批 §五.1 一致）；若需要，可把恢复扫描扩展到 decided 重入场类选项。
2. 重入成功后依赖同 tick 的 `advanceAppDispatch` 投递新 attempt；若投递失败，阶段已 in-flight，
   由既有 reconcile 投递一致性补投（不伪造投递成功）。
3. `reenterBlockedStage` 端口存在但对旧宿主缺省：旧宿主保持既有 advance 行为（无重入），
   生产接线由 `session/index.ts` 统一注入。
4. 本批依赖编排批未提交改动（新 API/事件字段/v3 定义）同树生效；两批需一并提交/发布。
