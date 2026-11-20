# 变更记录：block resolved 后阶段重入场 + 流程定义 v3 任务文本与角色边界（编排/模型批）

- 日期：2026-11-20
- 角色：ANS 内置「编排」（编排/模型侧实现；协调者已授权本批范围）
- 分支/工作树：`fix/block-reentry-task-texts`（worktree `.claude/worktrees/fix-block-reentry-task-texts`；
  HEAD 起点 `2a363da` = origin/main；本记录未提交）
- 背景：SMOKE-2（真机基线 `2a363da`，记录 `角色卡/测试/docs/change/2026-11-20_SMOKE2_app-dispatch.md`）
  验证 PR #159 的 block 路由大幅生效（B6 fixed(engine)/B9 decided(customer)/B8 fixed(convener 修复)，
  无重复任务、无 orphan），但暴露两个新接缝：
  - **S1（核心）**：B8 owner-repair `resolved(fixed)` 后，应用重驱 A2 连续 17 次
    `app-dispatch.drive.failed code:"stage-transition-invalid"`，阶段停在 A2 blocked——
    `driveAppDispatchStage` 对 blocked 阶段的 `attempt > autoRetries+1` 预算拒绝只该约束**普通自动重试**
    （Q8）；block 解法是既成事实，重入必须是一条显式账本事件，随后才 drive；
  - **S2**：A2 任务文本要求 product 写 `docs/intents`，而 product 边界只允许 `docs/product`
    （`path-outside-boundary` 根因）；`docs/intents` 的唯一写者是幕僚（chief）。
- 范围：**只改编排/模型/记录**——`src/model/runtime.ts`、`src/common/编排/workflow-state.ts`、
  `src/common/编排/workflow-service.ts`、`src/common/编排/workflow-definitions.ts` 与本记录。
  未改 `app/desktop/**`、`test/**`、门禁文本/roles、workflow 资源、`release.yml`/release-policy、
  `block-resolution.ts` 分类语义（只消费）；未 commit/push/CI/tag/main；未读 `.env`；未占端口；
  验证用 `node_modules` junction 仅为本工作树临时依赖可见（gitignored，结束后移除）。

## 一、S1：block resolved(fixed|decided) 后阶段合法重入场

### 1.1 状态机/事件（`src/model/runtime.ts` + `src/common/编排/workflow-state.ts`）

- `StageReworkedEvent` 增**可选** `blockId?: string`（旧记录/旧事件无字段，读取与语义逐字不变）。
  事件形状守卫：`blockId` 出现时必须是非空文本（空串 ⇒ 事件形状非法，读取侧计入 `skipped.invalid`）。
- `deriveWorkflowView` 的 `stage.reworked` 应用分支按 `blockId` 分流：
  - **无 `blockId`**：MF-IR-1 冻结语义逐字不变（`reworkOf`=被返工来源、`stage`=冻结回落目标
    A3→A2/A6→A5/A12b→A11/B2→B1；来源置 failed、目标置 pending）。
  - **有 `blockId`（本批新增：同阶段 block 重入场）**：要求
    ① `stage === reworkOf === 当前阶段`；② 当前阶段状态必须是 `blocked`；③ `blockId` 非空。
    通过后：该阶段记录置 `pending`（历史尝试结束）、`attempt = max(旧 attempt, event.attempt)`、
    `lastEventId` 更新、`view.blocked` 清除、`view.stage = 目标`。
    任一条件不满足 ⇒ `workflow-corrupt`（不猜、不自动推进）；带 `blockId` 但语义写成普通回落
    （`stage ≠ reworkOf`）同样 corrupt——普通 MF-IR-1 回落仍必须不带 `blockId`，新旧语义不可混写。
- `nextStages` 对重入后的 pending 阶段返回同阶段（沿用既有规则，无需改动）。

### 1.2 服务 API（`src/common/编排/workflow-service.ts`，给桌面）

```ts
export async function reenterBlockedStageAfterResolution(input: {
  projectRoot: string;
  workflowId: string;
  stage: WorkflowStage;          // 当前 blocked 阶段
  blockId: string;               // blocks.jsonl 中已 block.resolved 的 id
  resolution: "fixed" | "decided";
  reason?: string;
  now?: () => Date;
}): Promise<ReenterBlockedStageAfterResolutionResult>;
```

成功回执（`ok:true`）：

```ts
{
  workflowId; stage;
  reentry?: { stage; attempt; eventId; taskId? };  // 已写入/已存在的重入场事实
  driven?: DriveAppDispatchStageReceipt;           // 同锁 drive 回执（新 attempt 任务）
  alreadyCompleted?: true;   // 阶段已由引擎重试完成：不写 rework，调用方继续 advance 下一阶段
  alreadyInFlight?: true;    // 阶段已有在飞尝试（引擎重试/先前重入已驱动）：不写第二条 rework/任务
  driveError?: { code; message };  // rework 已写但 drive 未成功（如实返回；可重试本 API 或 reconcile）
  replay: boolean;           // 同 (blockId, stage) 重复调用 ⇒ replay（复跑 drive 幂等）
}
```

失败稳定码（`ok:false`）：`workflow-not-found` / `workflow-protocol-mismatch`（非 app-dispatch/v1）/
`workflow-closed` / `workflow-stopping` / `workflow-corrupt` / `stage-transition-invalid`
（stage 不在定义内、无任务阶段 taskKind=none、非 blocked 且非 completed/在飞）/
`block-not-found` / `block-not-resolved`（raised/routed/escalated 均拒绝）/
`block-resolution-mismatch`（终态不符 / block 绑定的 workflow 或 stage 与请求不一致）/
`block-reentry-inapplicable`（decided 的裁决选项不属于重入场类）/
`block-ledger-corrupt`（blocks.jsonl 坏行） / `workflow-ledger-write-failed`。
另导出常量 `BLOCK_STAGE_REENTRY_OPTION_IDS = ["block-revise-scope","block-rework","block-replace-executor","block-retry-with-cap"]`
（B9 decided 的重入场类选项；`block-terminate-flow`/`block-accept-current-state`/`block-accept-with-limits`/
`block-grant-exception`/merge-main/stable-write 等按既有语义不重入场）。

校验顺序与事实来源（不采信调用方自报）：
1. 读 `blocks.jsonl`（`readBlockLedger` + `replayBlockLifecycles`）：block 必须已
   `resolved`，`resolution` 与请求一致；decided 时 `block.resolved.reEntry`（桌面写入的选项 id）
   必须属于重入场类；block 已绑定 workflow/stage 时必须与请求一致；
2. 载入 app-dispatch 上下文（协议/定义/hash/投影 fail-closed，复用 `loadAppDispatchContext`）；
3. 阶段 completed ⇒ `alreadyCompleted`（不写 rework）；已有同 block 重入场事件 ⇒ replay（复跑 drive）；
   阶段 requested/dispatched/in-progress ⇒ `alreadyInFlight`（不并列）；
4. 仅 blocked 阶段：写 `stage.reworked`（`stage=reworkOf=stage`、`attempt = max(已有 stage.requested attempt,
   投影 attempt) + 1`、`blockId`、`reason`；幂等键 `stage-rework:<workflowId>:<stage>:<attempt>`），
   随后在**同一把锁**内调用 `driveAppDispatchStageLocked` 生成新 attempt 任务；
5. drive 失败不伪造完成：回执携 `reentry` + `driveError`，阶段保持 pending，reconcile/再次调用可补驱动。

### 1.3 幂等 / 并发 / 锁

- 整个 API 走 `withServiceLock(workflowLockKey(projectRoot, workflowId))`，与
  `driveAppDispatchStage`/`observeAppDispatchTaskReport`/`reconcileFixedWorkflow`/`selectWorkflow` 共用锁；
- 同一 (blockId, stage) 只写一条 rework：存在性检查 + `appendWorkflowEvent` 幂等键；
  attempt 与 `stage-exec:<wf>:<stage>:<role>:<attempt>` 任务键均由账本确定性派生，
  账本唯一 guard（`appendTaskEvent`）兜底；并发双触发 ⇒ 一条 rework、一条新 attempt 任务；
- 阶段已由引擎重试完成（completed）或已在飞时不写第二条 rework/任务。

### 1.4 reconcile 补驱动（`reconcileFixedWorkflow`）

- 若进程在「已写 rework、未驱动」之间中断，阶段为 pending 且账本存在同阶段带 `blockId` 的
  `stage.reworked`（attempt 与投影 attempt 一致）⇒ reconcile 对该阶段执行一次幂等 drive
  （补建 `stage.requested`/任务/`stage.dispatched`），**不新开尝试**；
- 无 block rework 的普通 pending 阶段（如 workflow.started 后的初始阶段）不被 reconcile 驱动
  （行为不变：reconcile 只处理 requested/dispatched/in-progress + 上述重入场待驱动态）。

## 二、S2：流程定义 v3（任务文本与角色边界一致）

`src/common/编排/workflow-definitions.ts`：

- `WORKFLOW_DEFINITION_VERSION = 3`；`WORKFLOW_DEFINITION_VERSIONS = [1,2,3]`；
  `getWorkflowDefinition` 缺省解析 v3、显式 1/2/3 合法（4+ ⇒ `workflow-definition-version-unsupported`）；
  注册表/当前 hash 表指向 v3；`WORKFLOW_DEFINITION_HASHES_BY_VERSION` 增 v3。
- **v1/v2 逐字保留**：v1 = 旧 app-dispatch 语义；v2 = v1 + `onExhausted:"route-block-resolver"`；
  `versionedStages` 仅对 v3 应用 `V3_TASK_TEXT_OVERRIDES`（A2/A3），其余字段/顺序/文本不变。
- **v3 A2 任务文本**（根因修复）：
  - 只写 `docs/product/<flowId>-intent-vN.md`（frontmatter schema=project-intent/v1；product 边界只允许 docs/product）；
  - `docs/intents/<intentId>.md` 由幕僚（chief，唯一写者）在 A3 呈卡前按产品意图 frontmatter 创建/核对（B24）；
  - product 不得写 `docs/intents`（越界 ⇒ path-outside-boundary fail-closed）；
  - 报告后由应用重算字节 SHA-256 并收口；hash/入口缺失 ⇒ 不收口。
- **v3 A3 任务文本**：补「幕僚呈卡前按产品意图 frontmatter 创建/核对 `docs/intents/<intentId>.md`
  （B24；应用校验入口与 intent 一致）」；其余呈卡/回传/裁决语义逐字保留。
- **其它内置阶段审计（A5/A8/A9/A11/B1/B3 与 A12a/A12b/A13/B4）**：与角色边界核对未发现越界路径
  —— rapporteur 写 `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`（A5 文本一致）；
  nominator 经 `activate_role_documents` 写角色卡（A8 一致）；convener 写 `docs/scheduling/`
  （A9 团队计划一致）；A11/B1/B3 为 worker-dispatch，无越界文档路径声明；verifier 写
  `docs/quality/`、`docs/verification/`，A12a/A12b 文本未引用具体路径。**本批只改 A2/A3（仅 v3）**，
  未改角色边界与其它语义。
- 自检 `validateWorkflowDefinitions()` 版本语义更新：v1 必须 `blocked`、v2/v3 必须
  `route-block-resolver`；新增 v3 文本断言（A2 必须给出 docs/product、写明幕僚创建/核对 docs/intents
  且 fail-closed 禁止 product 写 docs/intents；A3 必须写明幕僚呈卡前核对入口）。
- 定义 hash（canonical JSON SHA-256）：

| 定义 | v1（逐字保留） | v2（逐字保留） | v3（本批新增） |
| --- | --- | --- | --- |
| add | `ef7720c112c76c8d77882118af8a331b06c16aa634246aa263b0a8ce871ecbee` | `9718975bc34780b4ea0be49f99890388ff21a36b87455d023392fd088b72a1e2`（= SMOKE-2 记录值） | `c9e87ad6772a2d61149c5d1e006c58b01c2c653781f41ab409a7d167406f3d08` |
| modify | `4bea23eb0b1c00c849aff0990aefefa0b045759bdbea1331ff2f932540594bb6` | `41bbe743738569defa85e2295744c56545cf8d9f97c679a7025c1cfe25968445` | `4ac0513401bab5a9a8f95bf157fb4cb4baffeb2975ecbf114f6b40a02aa9e539` |

v1/v2 hash 用 `git show HEAD:src/...`（HEAD `2a363da`）的三文件镜像重算并与本工作树对照：**四个值全部一致**
（输出 `V1V2_HASHES_UNCHANGED`）。在飞 workflow 按各自 `workflow.started.definition.version/sha256`
继续解释；新 `select_workflow` 用 v3。

## 三、验证（cwd = worktree）

- `npx tsc --noEmit`：**0**。
- 临时自检 `.tmp-block-reentry-selfcheck.mjs`（未提交，21 组全过）：
  1. 状态机：block 重入场置 pending/新 attempt/清 blocked；无 blockId 同阶段 rework 仍 corrupt
     （MF-IR-1 语义不变）；非 blocked / stage≠reworkOf / 空 blockId 非法；A3→A2 普通回落逐字不变；
  2. 服务：fixed 重入 → 一条 rework（带 blockId）+ A2 attempt2 任务 + `stage.requested/dispatched`；
     重复调用 replay（同 eventId/taskId、零新增）；`Promise.all` 并发 ⇒ 仅一条 rework、一条新任务；
     A2 attempt2 报告 done → observe accepted → `stage.completed A2` → `nextStages` 含 A3；
  3. engine 重试已 completed ⇒ `alreadyCompleted`（零 rework）；阶段在飞 ⇒ `alreadyInFlight`（零 rework）；
  4. 校验：未 resolved ⇒ `block-not-resolved`；resolution 不符/block 绑定 workflow/stage 不符 ⇒
     `block-resolution-mismatch`；decided(revise-scope) ⇒ 重入成功；decided(terminate-flow) ⇒
     `block-reentry-inapplicable`；fixed-v2.1 协议 ⇒ `workflow-protocol-mismatch`；v2 定义在飞 workflow 仍可重入；
  5. reconcile：带 blockId rework 的 pending ⇒ 补驱动 attempt2（零新尝试）；普通 pending ⇒ 不驱动；
  6. 共存：已存在 repair 任务（stage=A2）时 reenter 仍成功，新 attempt 任务唯一；
  7. S2：当前 v3、版本 [1,2,3]、自检零错误；v3 A2 不再要求 product 写 docs/intents 且明确幕僚职责；
     v1/v2 文本逐字一致（v2 保留 SMOKE-2 根因旧文本）；v1/v2/v3 hash 互不相同。
- 既有测试（只跑不改）：
  - `test/编排/workflow-state`、`workflow-dispatch-fixed`、`app-dispatch-definitions`、
    `app-dispatch-service`：**50 tests / 43 pass / 7 fail**——7 个失败全部是版本钉死断言（见 §四）；
  - 全量 `test/编排/**`：**1452 tests / 1442 pass / 8 fail / 2 skipped**——8 个失败全部为版本/哈希钉死
    （§四列出的 4 + 3 + 1）；
  - `test/桌面应用/app-dispatch-block-seams`、`block-router`、`test/测试/block-resolver-protocols`：
    **32 tests / 29 pass / 3 fail**——失败均为「新 select 钉 v2 / 双版本 v1+v2 / review 用例 seed 用
    `WORKFLOW_DEFINITION_HASHES`（现指 v3）」的期望值更新点，非逻辑回归。
- 未新增依赖；`block-resolution.ts` 分类/路由语义未改（只消费 block 账本事实）。

## 四、预期测试更新点（测试批；本批不改 test/）

1. `test/编排/app-dispatch-definitions.test.ts`
   - `WORKFLOW_DEFINITION_VERSION` 期望 2→3、`WORKFLOW_DEFINITION_VERSIONS` [1,2]→[1,2,3]；
   - `workflowDefinitionVersionsOf` 期望 [1,2]→[1,2,3]；`WORKFLOW_DEFINITIONS[id].version` 2→3；
   - 冻结测试「`add.version = 3` 抛错」改为写 4 或其它值（当前版本已是 3）；
   - `getWorkflowDefinition`：version 3 现为合法（断言返回 v3/hash），version 4 才是
     `workflow-definition-version-unsupported`；
   - 建议新增：v3 A2/A3 文本断言（docs/product、幕僚/docs/intents、禁止 product 写 docs/intents）
     与 v1/v2 文本逐字快照；v1/v2 hash 常量可继续用 `WORKFLOW_DEFINITION_HASHES_BY_VERSION`。
2. `test/编排/app-dispatch-service.test.ts`
   - selectWorkflow(A)/(B) 的 `definition.version` 期望 2→3（sha256 用 `WORKFLOW_DEFINITION_HASHES`，不变）；
   - 拒绝面 `definitionVersion: 3` 由「版本不支持」改为成功（或用 4 保留拒绝断言）。
3. `test/编排/app-dispatch-task-idempotency.test.ts`
   - 手工 seed workflow 的 `definition:{id:"modify",version:2,sha256:WORKFLOW_DEFINITION_HASHES.modify}`
     ⇒ 改用 `WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[2]`（HASHES 现指 v3；这正是「在飞 v2 按 v2 hash 解释」用例）。
4. `test/桌面应用/block-router.test.ts`、`test/测试/block-resolver-protocols.test.ts`
   - 「新 select 钉 v2」→ v3；双版本用例扩为 v1/v2/v3（v2 旧语义仍须逐字保留）；
   - review 用例 seed 的 v2 定义 hash 改用 `WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2]`。
5. 新增 S1 回归建议（测试批可复用本批自检场景）：fixed reenter→attempt2 唯一→completed→A3；
   alreadyCompleted/alreadyInFlight；decided(revise-scope) 重入 / terminate 不重入；
   重复调用 replay；`Promise.all` 并发仅一条 rework/任务；reconcile 补驱动；repair 任务共存。

## 五、待桌面（下一批；本批只提供 API）

1. **fixed 后重入**：block 账本 `resolved(fixed)` 且 `lifecycle.stage` 存在时，调
   `reenterBlockedStageAfterResolution({projectRoot, workflowId, blockId, stage, resolution:"fixed"})`；
   - `alreadyCompleted` ⇒ 继续既有 `advance`（下一阶段）；
   - `alreadyInFlight` ⇒ 空操作（引擎重试/其它路径已在驱动）；
   - `driveError` ⇒ 如实系统行 + 重试本 API 或依赖 reconcile 补驱动；
   - `block-not-resolved`/`block-resolution-mismatch`/`block-reentry-inapplicable` ⇒ 不重入，按既有语义。
   建议接线点：`block-router` 的引擎 fixed 收口（`applyEngineAction` 成功分支）与
   `recover` 重放路径（block 已 resolved(fixed) 但阶段仍 blocked 即补一次重入）。
2. **B9 decided 后重入**：`executeChosenOption` 中 `block-revise-scope`/`block-rework`/
   `block-replace-executor`/`block-retry-with-cap`（当前 `default` 分支转属主修复 / `block-retry-with-cap`
   走 advance）应改为先调本 API 再安排修复/重派；`block-terminate-flow`/`block-accept-*` 保持既有终止/披露语义，
   不调重入。API 会以 block 账本 `resolved.reEntry` 复核选项，桌面自报不生效。
3. **A2 根因文本**：v3 只影响**新 select**；SMOKE-2 的在飞 v2 workflow 仍按 v2 解释（不静默迁移）。
   B8 修复文本可在新流程生效；若要验证 A2 文本修复，需新起一次真机冒烟。
4. **不新增客户可见门**：本批不发行任何卡/不新增审批；重入只消费已 resolved 的 block 事实。

## 六、待测试点（测试批）

- §四全部版本/hash 更新点 + 新增 S1 回归用例；
- 真机 SMOKE-3 建议断言：B8 owner-repair fixed 后出现新 attempt 任务（`stage-exec:<wf>:<stage>:<role>:<n+1>`），
  `stage.reworked` 带 `blockId` 且 `stage===reworkOf`，A2 从 attempt≤3 内 completed 并推进到 A3；
  `blocks.jsonl` 无新增重复 block；drive 失败次数为 0（或失败时如实返回后 reconcile 可补）。
- 兼容负例：v1/v2 在飞 workflow 的 `stage.reworked`（无 blockId）读取/投影不变；坏 `blockId`（空串）事件不入账。

## 七、实现状态

- implemented-unverified（本批未独立验收）；未 commit/push/CI/tag；工作树内 4 个源文件 + 本记录为全部改动。
