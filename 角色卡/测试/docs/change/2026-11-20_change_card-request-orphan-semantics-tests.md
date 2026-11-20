# 变更记录：card-request orphan 语义 S3/S4——测试批（既有断言更新 + 地基回归 + 桌面回归 + smoke 驱动修复）

- 日期：2026-11-20
- 角色：ANS「测试」（独立固定上下文；协调者已授权本批范围）
- 分支/工作树：`fix/card-request-orphan-semantics`（worktree `.claude/worktrees/fix-card-request-orphan`；
  HEAD `1b7801b` = origin/main；编排/模型地基批 + 桌面批的 7 个产品文件为**既有未提交改动**）
- 依据：
  - `角色卡/测试/docs/change/2026-11-20_SMOKE3_app-dispatch.md`（S3/S4 立案）；
  - `角色卡/编排/docs/change/2026-11-20_change_card-request-orphan-semantics-foundation.md` §五；
  - `角色卡/桌面窗口/docs/change/2026-11-20_change_card-request-orphan-semantics-desktop.md` §四/§五；
  - `角色卡/桌面窗口/docs/feature/card-request-lifecycle.md`（最新事件为准/orphan 非粘性/`supersedesOrphanAt`）。
- 范围：只改 `test/**`、本记录、仓库外 smoke 驱动脚本。**未改** `src/**`、`app/**`、门禁文本/roles、
  workflow 资源、`release.yml`；未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224；
  未启动真机 Electron。`node_modules` junction 仅运行期临时使用，结束已移除。
- 产品树完整性：运行前后 `git diff --stat` 的产品 7 文件行数一致（编排/模型地基批 + 桌面批的未提交改动
  未被本批触碰）；若产品树运行期被改动，以最新为准（本批未观察到）。

## 一、改动清单

### 1.1 测试代码（仓库内）

| 文件 | 改动 |
| --- | --- |
| `test/编排/app-dispatch-service.test.ts` | 「A3 card prompt」用例按有界等待新语义更新并加强；新增 `ledgerLineCount` 助手；导入 `TASKS_STATE_REL`/`WORKFLOWS_STATE_REL`。 |
| `test/编排/task-state.test.ts` | 新增 1 用例：`request.created.supersedesOrphanAt` 合法写读/坏值拒写/读侧坏行/旧行兼容。 |
| `test/编排/project-state.test.ts` | 新增 1 用例：request 生命周期「最后一条为准」（orphaned→presented 恢复等待等 4 条链）。 |
| `test/编排/app-dispatch-task-idempotency.test.ts` | 新增 1 用例：reconcile 遇 drive waiting 不报 corrupt/零写入；入口恢复后补建；新增 `writeFile`/`writeProductIntent`/`writeIntentEntry`/`ledgerLineCount` 助手。 |
| `test/桌面应用/card-request-orphan.test.ts` | **新增**（8 用例）：SMOKE-3 回归（waiting）、请求级 orphan→resolver、并发/幂等、重呈现取代、findRequestState、consumer 重开、drive.pending。 |

未放宽/删除既有断言或新增 skip；未改产品代码。测试暴露实现与立案文字有出入时以实现为准细化（见 §五）。

### 1.2 smoke 驱动（仓库外，不提交；PR 说明披露）

| 文件 | 改动 |
| --- | --- |
| `C:\Users\51054\Desktop\work\ans-smoke-app-dispatch-2026-11-20\rr\smoke-drive.mjs` | 去粘性 orphan 集合 → 每 requestId 最新生命周期 Map；对话框按最新事件判定；`dialog.re-presented.answer` 审计日志。 |
| `C:\Users\51054\Desktop\work\ans-smoke3-app-dispatch-2026-11-20\rr\smoke3-drive.mjs` | 同上 + 汇总 `requestOrphans`/`orphanedUnresolved` 改为最新事件口径（`orphanedNow`/`lifecycles` 增量字段）。 |
| `C:\Users\51054\Desktop\work\ans-smoke3-app-dispatch-2026-11-20\rr\smoke4-drive.mjs` | **另存副本**（供 SMOKE-4 复制后改 RR/预算；与 smoke3-drive 同内容）。 |

驱动逻辑：
- `noteRequestLifecycle` 只认 `request.created/presented/resolved/orphaned`，last-wins，保留 `orphanAt`/`supersedesOrphanAt`/`presentedAt`/`resolvedAt`（审计）。
- 对话框：先 `scanTaskLedger()` 重扫（避免主循环扫描滞后），`dialogLifecycleDecision(rid)`：最新 = `orphaned` ⇒ `dialog.orphaned.skip`；最新 = `resolved` ⇒ `dialog.resolved.skip`；最新 = `created/presented` 且历史有 `orphanAt` ⇒ **正常作答** + `dialog.re-presented.answer`（含 `orphanAt`/`supersedesOrphanAt`）；无 orphan ⇒ 正常作答。
- 汇总（smoke3/smoke4）：`requestOrphans` = 历史出现过 orphan 的 requestId（审计）；`orphanedNow` = 最新事件为 orphaned（含 `orphanAt/lastAt`）；`orphanedUnresolved` = `orphanedNow` 的 id（resolved 为最终态，不再等待）。旧 `orphanedUnresolved`（历史 orphan 减 resolved）口径替换。

## 二、逐用例名（新增/更新）

### 2.1 `test/编排/app-dispatch-service.test.ts`（更新）

- `A3 card prompt：request.created（promptId/documentRefs/选项/推荐集）+ card-prompt 任务；重放不重复`
  - 入口缺失：`ok:true`、`waiting.code==="intent-entry-missing"`、`waiting.message` 含 `docs/intents/snake-intent.md`、`tasks=[]`、`requested/dispatched/completed/replay=false`、`stage=A3/attempt=1`；
  - **零写入**：`tasks.jsonl` / `workflows.jsonl` 非空行数不变；无 `request.created`、无 A3 任务；
  - 重复 drive 仍等待、仍零写入；
  - 补入口后 drive 成功：A3 `stage.requested` 恰 1、`request.created` 恰 1、`card-prompt` 任务恰 1、`stage.dispatched A3`；保留原有形状/重放断言。

### 2.2 `test/编排/task-state.test.ts`（新增）

- `S3 地基：request.created.supersedesOrphanAt 合法写入/读回；坏值拒写（invalid-event-source+稳定消息）且读侧坏行；无字段旧行兼容`
  - 合法值按原文读回；空串/纯空白/非时间戳 ⇒ `{ok:false, code:"invalid-event-source", message:"request.created.supersedesOrphanAt 非法"}` 且零落账；
  - 手写坏行 ⇒ `readTaskState.errors` 恰 1 且含 `supersedesOrphanAt`；无字段旧行零坏行。

### 2.3 `test/编排/project-state.test.ts`（新增）

- `S3 地基：request 生命周期按最后一条为准——orphaned→presented 恢复等待；presented→orphaned 终态；resolved 最终态`
  - `created→orphaned→presented` ⇒ pendingRequests 0→1、`request-pending` blocker 可见；
  - `created→orphaned→created(supersedesOrphanAt)` ⇒ 仍等待（回归）；
  - `created→presented→orphaned` ⇒ orphan 终态（不计待决）；
  - `created→orphaned→presented→resolved` ⇒ resolved 最终态（不计待决）。

### 2.4 `test/编排/app-dispatch-task-idempotency.test.ts`（新增）

- `S3 地基：reconcile 遇 drive waiting（A3 入口缺失）不报 workflow-corrupt、不建任务；入口恢复后对账补建`
  - 现场：A2 完成 + A3 已 `stage.requested`（issuedBy=application，`requestTaskId`=确定性 card-prompt taskId），入口缺失；
  - 对账回执 `corrupt/skipped` 均 undefined、`driven.waiting.code=intent-entry-missing`、`tasks=[]`、`requested/dispatched/completed/replay=false`；两类账本行数不变；零 A3 任务；
  - 重复对账仍等待、零新增；
  - 补入口后：`driven.tasks` 恰 1 条 `card-prompt`（taskId=原 `requestTaskId`、promptId 确定）、A3 `stage.requested`/`stage.dispatched` 各 1、`request.created` 恰 1，`corrupt` undefined（`requestTaskId` 一致性校验通过）。

### 2.5 `test/桌面应用/card-request-orphan.test.ts`（新增，8 用例）

1. `SMOKE-3 回归：A3 意图卡等待中（created+presented+live 任务/活动 workflow 同阶段）⇒ 并发 restoreTasks 零 orphan、零 orphan 块事实、waiting 诊断去重`
   - `Promise.all` 3 次 `restoreTasks` ⇒ `orphanedRequests` 全 0；账本零 `request.orphaned`；`blocks.jsonl` 空；扫描 0 事实；
   - `desktop.request.restore.waiting` 诊断恰 1（`requestId`/`reasonCode=waiting`），重复 restore 不再记；
   - 任务终态（rejected 收口）后请求仍开 ⇒ 允许 1 条 `orphaned(restart)`（waiting 判定只针对 live 任务）。
2. `请求级 orphan→resolver（崩溃窗口，无任务）：恰 1 条 card-prompt-orphaned(engineCanRepair=false/带 requestId) ⇒ decideBlockRoute=owner-repair；router 实跑恰 raised→routed、创建 chief 修复任务未收口；重复扫描/tick 零新增`
   - 事实：`requestId`、无 `taskId`、`engineCanRepair=false`、`ownerRoleId=chief`、`detailCode=reconcile`；
   - `decideBlockRoute` ⇒ `kind=owner-repair`、`class=protocol-reconcile`、owner role chief、reason `protocol-reconcile:owner-repair`；
   - router 实跑 blocks.jsonl 恰 `raised→routed`（无 resolved）；raised 持久化 `engineCanRepair=false`；创建 1 条 chief `repair` 任务（`block-repair:<blockId>:1`，from application，未收口/未报告）；
   - 重复扫描零事实；`tick`（未越 T_repair）零新增。
3. `请求级 orphan（任务已终态）：事实带原 prompt taskId/owner ⇒ owner-repair；superseded、阶段迁移、live 等待不造块`
   - terminal-task：`taskId`=原 prompt 任务、owner=chief；owner-repair；
   - 负例（独立 root）：`orphaned(superseded)`、阶段迁移（A3 请求而 A4 已 requested）、live 等待（created→presented）⇒ 零 `card-prompt-orphaned` 事实、零 block。
4. `并发/幂等：Promise.all 三次 restoreTasks ⇒ app 请求恰一条 orphan（至多）、legacy 请求恰一条；重复调用零新增`
   - app 崩溃窗口请求恰 1、legacy 恰 1（reason=restart）；顺序重复两次零新增（总 orphan 事件=2）。
5. `重呈现取代：orphan(restart) 后并发两次 redeliverAppTask ⇒ 同 requestId 恰一条新增 created（supersedesOrphanAt=orphan.at）；第三次零新增；后到 presented ⇒ project-state 恢复等待`
   - created 计数 1→2、`supersedesOrphanAt`=orphan.at、内容逐项复制（options/recommended）；第三次零新增；不新开卡任务/requestId；`presented` 后 pendingRequests=1、`request-pending` 可见。
6. `block-router.findRequestState：orphan→presented ⇒ 可见等待（真实 router recover 不重弹卡）`
   - 真实 `createDesktopBlockRouter` + 宿主夹具（见 §五.2）；routed 客户决策块卡请求 created→presented→orphaned→presented 后 `recover`：客户通道呈现次数不增（1）；块仍 routed、raised 仍 1。
7. `consumer 重开：orphan→重呈现→presented 后经真实 request_choice 作答被接受（request.resolved/A3 completed/prompt 任务收口/advance 到 A4-A5），零 drive.failed`
   - 真实 SessionManager 的 chief 会话 `request_choice` 作答 ⇒ `answered`；生命周期 `created×2 → orphaned×1 → presented×1 → resolved×1` 且顺序（重呈现 created 晚于 orphaned、presented 晚于重呈现、resolved 最晚）；
   - `request.resolved.by=customer`；A3 completed；prompt 任务 `closed.by=application/outcome=accepted`；A4 completed、A5 rapporteur 任务已建；`app-dispatch.drive.failed` 0。
8. `drive.pending：A3 入口缺失时 advance 只记一次去重 app-dispatch.drive.pending（drive.failed=0、无 block）；补入口后下一 tick 正常建任务并投递`
   - 两次 advance 均 waiting；`app-dispatch.drive.pending` 恰 1（`reasonCode=intent-entry-missing`、`attempt=1`）；`drive.failed` 0；无 block；零 A3 任务/`stage.requested`/`request.created`；
   - 补入口后 advance：不再 waiting、1 条 `card-prompt` 任务 + 1 条 `request.created` + 1 条 `stage.requested`，chief 投递（或入队）成功；pending 诊断仍 1、failed 仍 0。

## 三、命令与计数

工作树内统一 `node --test --test-force-exit`（Node v24.22.1；`node_modules` junction 临时可见，结束移除）。

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `node --test --test-force-exit "test/编排/**/*.test.ts"` | **1466 tests / 1464 pass / 0 fail / 2 skipped**（2 skip 为 `git-capabilities.test.ts` 既有 env 门控 `ANS_O61_READONLY_*`，非本批新增） |
| 2 | `node --test --test-force-exit "test/桌面应用/**/*.test.ts"`（两次） | **902 tests / 898 pass / 4 fail**（两次同一失败集合，见 §四） |
| 3 | `node --test --test-force-exit test/桌面应用/block-router.test.ts`（单跑） | **22/22 pass**（T-4 并行负载抖动复验） |
| 4 | `node --test --test-force-exit test/测试/fixed-path-full-chain.test.ts test/测试/block-resolver-protocols.test.ts` | **10/10 pass** |
| 5 | `node --test --test-force-exit test/桌面应用/card-request-orphan.test.ts` | **8/8 pass** |
| 6 | `node --test --test-force-exit test/编排/app-dispatch-service.test.ts test/编排/task-state.test.ts test/编排/project-state.test.ts test/编排/app-dispatch-task-idempotency.test.ts` | **58/58 pass** |
| 7 | `npx tsc --noEmit` | **0 错误**（exit 0，空输出） |

## 四、基线红对比（`test/桌面应用/**` 全量 4 fail）

| 失败 | 判定 | 依据 |
| --- | --- | --- |
| `block-router`「T-4 客户主权：… 停稳写 workflow.closed」 | **并行负载抖动**（非本批） | 同文件单跑 22/22 pass（上表 #3）；断言路径 fixed-v2.1 stop 确认，不经本批改动 |
| `genesis-bootstrap`「su 的 gate 拒绝 角色卡/<新角色>/role-card.md」 | **origin/main 既有基线红** | 失败 `runtime-creation-prepared-api-unavailable`，与 orphan 语义无关 |
| `operator-channel`「I-1 补丁 … ShellGate」 | **origin/main 既有基线红** | 会话开启失败（真实装配路径），与 orphan 语义无关 |
| `p0-halt-and-images`「P0-2 abort 三态」 | **origin/main 既有基线红** | demo abort 能力判定，与 orphan 语义无关 |

前三条与桌面批记录 §四的基线对照集合一致；无新增失败、无新增 skip。

## 五、与立案文字的差异/实现口径（如实披露）

1. **reconcile waiting 的可达形态**：地基记录 §四.3/§六限定为「`stage.requested` 已存在但入口被删/未就绪」。
   本批用例按该形态播种（A3 `stage.requested` + 确定性 `requestTaskId`、无任务/请求），而非「pending 阶段由
   reconcile 补推」——`reconcileFixedWorkflow` 对 `pending` 阶段按设计不驱动（不新开阶段尝试），等待态由桌面
   `advance` 承担（用例 8 覆盖）。断言未弱化：corrupt 跳过、零写入、入口恢复后补建与一致性校验均按立案要求。
2. **`findRequestState` 的可测路径**：该函数是 `createDesktopBlockRouter` 闭包内私有，无导出。用例 6 用
   **真实 router + 独立宿主夹具**（`block-router.test.ts` 风格：假客户通道 + 真实 tasks/workflow/blocks 账本）
   经公开 `recover` 路径触发 `recoverBlock → findRequestState`；这是该分支的可观察行为（orphan 粘性会让同块卡
   重弹）。其余桌面用例均为真实 SessionManager。
3. **A3 card prompt 等待期「零写入」的断言方式**：同时断言事件集合与 `tasks.jsonl`/`workflows.jsonl` 非空行数，
   比只看回执更严格（覆盖「未写任何一行」）。回执 `missing` 字段不属成功回执（新语义），改为断言
   `waiting.message` 含入口路径。
4. **C5 的 `request.presented`**：测试夹具的假客户通道不回调 `onPresented`（真实通道会），故由用例按通道语义
   显式先落 `presented` 再经 `request_choice` 作答；事件顺序/幂等断言不受影响。
5. **等待诊断字段**：诊断落盘白名单（`src/common/shared/diagnostics.ts`）会丢弃 `workflowId/stage/taskId`，
   持久化仅 `requestId`/`reasonCode`/`attempt` 等；用例按白名单断言，与桌面批 §六风险一致。

## 六、S4 smoke 驱动证据（仓库外）

- 语法：`node --check` 通过 ×3（smoke-drive / smoke3-drive / smoke4-drive）。
- scratch（临时、不入库）：`C:\Users\51054\AppData\Local\Temp\ans-s4-lifecycle-wc5zb1\s4-lifecycle-check.mjs`
  - 机制：从每份驱动中提取标记块 `// ==== S4 request-lifecycle helpers … ==== end … ====` 的**实际源码**，
    在独立作用域构造 `noteRequestLifecycle/requestLifecycleState/dialogLifecycleDecision`，喂合成事件序列断言；
  - 命令：`node <scratch>/s4-lifecycle-check.mjs <smoke-drive.mjs> <smoke3-drive.mjs> <smoke4-drive.mjs>`；
  - 覆盖（3 文件 × 6 场景，全部 PASS）：
    1. `created→orphaned` ⇒ skip(orphaned)；
    2. `created→orphaned→created(supersedesOrphanAt)` ⇒ answer（`orphanAt`/`supersedesOrphanAt` 审计保留）；
    3. `created→orphaned→presented` ⇒ answer；
    4. `created→orphaned→presented→resolved` ⇒ skip(resolved)；
    5. `created`（无 orphan）⇒ answer；
    6. `created→presented→orphaned` ⇒ skip(orphaned)（last-wins）。
  - 结论：`ALL S4 LIFECYCLE SCENARIOS PASS (3 files x 6 cases)`。
- 未运行真实 Electron/CDP 冒烟（本批不占端口、不启动真机）；S4 的端到端效果留待 SMOKE-4。

## 七、剩余风险

1. **smoke 驱动在仓库外**：未提交、未入 CI；PR 说明需披露路径与改动（本批已记录）。
2. **`findRequestState` 用例为 router + 宿主夹具**（非 SessionManager）；覆盖的是真实 router 代码路径，
   但宿主 `withRequestLifecycle` 为录制桩，若将来 router 生命周期接线变化需同步调整。
3. **桌面全量 T-4 并行抖动**：全量并行下仍红、单跑绿（与既有基线一致）；CI 若并行度变化需关注。
4. **诊断断言依赖白名单字段**：白名单收窄会影响等待诊断的字段断言（事件数与 `requestId/reasonCode` 仍稳定）。
5. **夹具版本**：桌面用例以当前注册表 `add@3` + app-dispatch/v1 播种；定义版本升级时 seed 需同步（与既有
   block-seams 夹具同风险）。
6. **未覆盖**：`test/装配/**`、真机 Electron、CDP 冒烟、三平台 CI 不在本批范围。
