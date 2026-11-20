# 变更记录：card-request orphan 语义——桌面批（对账等待判定 / 重呈现取代与幂等 / 请求级 orphan→resolver / drive 等待口径 / 消费者契约）

- 日期：2026-11-20
- 角色：ANS 内置「桌面窗口」（桌面侧运行时实现；协调者已授权本批范围）
- 分支/工作树：`fix/card-request-orphan-semantics`（worktree `.claude/worktrees/fix-card-request-orphan`；
  HEAD 起点 `1b7801b` = origin/main；编排/模型地基批未提交改动 + 本批未提交）
- 地基批依据：`角色卡/编排/docs/change/2026-11-20_change_card-request-orphan-semantics-foundation.md`
  （`RequestCreatedEvent.supersedesOrphanAt?`、`DriveAppDispatchStageReceipt.waiting?`、
  project-state「presented 晚于 orphan 清 orphaned」、reconcile 对 waiting 跳过 requestTaskId 判定）
- 范围：只改 `app/desktop/**` + 本记录/契约文档。**未改** `src/**`、`test/**`、门禁文本/roles、
  workflow 资源、`release.yml`；未 commit/push；未读 `.env`；未占 9222/9223/9224；
  `node_modules` junction 仅为本工作树临时依赖可见（结束后移除）。

## 一、问题与修复点（SMOKE-3 S3）

SMOKE-3（基线 `1b7801b`）在 A3 意图卡停摆：`listProject` 刷新并发触发 `restoreTasks`，两次
`restoreRequestState` 把**仍在等待**的卡 prompt 请求标 `request.orphaned(reason:"restart")`
（13:01:59.436/.449 双写）；block `card-prompt-orphaned` 同 requestId 重呈现后，消费侧按 orphan 粘性
跳过，卡永久未答。桌面批修四处：

1. **对账不得 orphan 仍可等待的卡**（`app/desktop/session/cards/version-decisions.ts`）；
2. **orphan 后重呈现的显式取代 + 幂等**（`app/desktop/session/fixed-workflow/stage-dispatch.ts`）；
3. **A3 入口有界等待不再记为失败**（同文件 `advance`）；
4. **请求级 orphan → resolver 闭环**（同文件 `scanAppCardPromptFacts`：无任务/任务已终态而请求仍开
   ⇒ `card-prompt-orphaned(engineCanRepair:false)` ⇒ 属主修复/客户裁决，不落 engine）；
5. **消费者契约文档化**（`角色卡/桌面窗口/docs/feature/card-request-lifecycle.md`）。

## 二、实现

### 2.1 `restoreRequestState`：waiting / superseded / orphan / legacy 分类（S3.1核心）

- **判定**（`appCardPromptWaitState`）：对每个未决 `request.created`（不在 resolved/orphaned 集合）：
  - app-dispatch/v1 card-prompt 请求的事实形状 = `request.created` 带 workflowId/stage/promptId，
    **或**能匹配到应用 `card-prompt` 任务（`from:"application" && taskKind:"card-prompt" && promptId===requestId`）；
    协议按 `workflow.started.protocol`（缺省 fixed-v2.1 ⇒ legacy）。
  - **waiting（不写 orphan）**：匹配任务存在且 `closed === undefined && reports.length === 0`，且
    workflow 视图可读、未 corrupt、未 closed、未 stopping、`view.stage === 请求 stage`（未迁移）。
    只记一次去重诊断 `desktop.request.restore.waiting`（字段 workflowId/stage/requestId/taskId、
    reasonCode=waiting；同 project+requestId 不刷屏）。
  - **superseded**：workflow 已关闭/stopping/阶段迁移 ⇒ 写 `request.orphaned(reason:"superseded")`
    （冻结三值），后续既有扫描按 superseded 语义 rejected 收口 prompt 任务（不重投、不重弹）。
  - **orphan(restart)**：无可重投（找不到 card-prompt 任务）或任务已终态（closed/reported）而请求仍开
    ⇒ 既有 `request.orphaned(reason:"restart")` 路径；workflow 账本缺 started/不可读、或视图 corrupt
    ⇒ fail-closed 同样走 restart（不把不确定当 waiting、也不冒充 superseded）。
  - **legacy**（非 app-dispatch 请求）：`orphaned(restart)` + 系统通知逐字不变（既有 C-08 语义）。
- **幂等/并发**：每 project 在飞去重（`requestRestoreInFlight` promise memo——并发调用共用同一次执行）；
  执行体内若有未决候选，**追加前按最新账本再判定一次**（迟到快照不重复写）。重复调用零新增。
- `restoreTasks` 的其它部分（未投递任务重投、approvals expired）未动。

### 2.2 `representOrphanedCardRequest`：`supersedesOrphanAt` + 同 orphan 只重呈现一次（S3.2）

- 追加的**同 requestId** `request.created` 携带 `supersedesOrphanAt = 被取代 request.orphaned.at`
  （地基已加字段与写侧校验：非空可解析时间戳，坏值拒写）。
- 每 `(projectRoot, requestId)` 在飞去重（`cardRepresentInFlight`；并发调用 no-op 返回 waiting）。
- **追加前重读最新事件**：`requestViewOf` 的 last 必须仍是 `orphaned`；若已被并发重呈现（last=created）、
  已呈卡（presented ⇒ visible）、已裁决（resolved ⇒ 收口 settled）、或被并发标 superseded ⇒ 按最新状态
  no-op/收口——账本零新增或恰一条。后到的 `request.presented` 保持既有写入（不写「重置」事件，
  契约按最新事件为准）。

### 2.3 `advance`：drive 有界等待不是失败（附带口径）

- `driven.ok === true && driven.waiting !== undefined` ⇒ 记一次去重诊断 `app-dispatch.drive.pending`
  （同 workflow/stage/code 不刷屏；reasonCode=waiting.code、attempt 为诊断白名单字段），
  **不写 `app-dispatch.drive.failed`、不造 block**，停止本轮；入口出现后下一 tick 正常推进。
- 全仓复核：`reconcile` 包装/`selectWorkflowAndDeliver`/block-router 引擎动作均经 `advance` 或服务
  回执消费，waiting 无其它「当失败」路径；item 9「不得连续 drive.failed」只约束 block resolved 后的
  重入路径，本分支不改变该路径。

### 2.4 读侧口径对齐（findRequestState）

`app/desktop/block-router.ts::findRequestState` 补 `request.presented` 清 orphaned 分支，与
project-state（地基补丁）及 `requestViewOf` 的「最后一条为准」口径一致（此前忽略 presented；
现有写入顺序 created→presented 下行为等价，补齐后对「orphan 后仅 presented」场景不再粘滞）。

### 2.5 请求级 orphan 扫描：orphan → resolver 闭环（S3.1 补齐）

`app/desktop/session/fixed-workflow/stage-dispatch.ts::scanAppCardPromptFacts` 新增**请求级**扫描
（原扫描只遍历 live card-prompt 任务且跳过已收口/已报告，导致「无任务 / 任务已终态而请求仍开」的
orphan 永远无 block 事实、resolver 不动作，违反 S3.1）：

- 遍历 app-dispatch/v1 的 `request.created` 生命周期视图（`requestViewOf`，last-wins）：
  **最新为 `request.orphaned(restart)`**、workflow 仍活动且阶段未迁移、且该 requestId **无 live
  card-prompt 任务**（不存在，或任务已 closed/已报告）⇒ 产出 `card-prompt-orphaned` 事实。
- **目标属主/客户，不落 engine**：事实 = `code:"card-prompt-orphaned"`、`detailCode:"reconcile"`、
  `engineCanRepair:false`、`ownerRoleId`（原 prompt 任务 `created.to`，缺任务时 "chief"）；
  经既有 `decideBlockRoute`：detailCode=reconcile ⇒ protocol-reconcile 类；engineCanRepair:false +
  ownerRoleId ⇒ **owner-repair**（app-dispatch 下由 router 创建属主修复任务并投递）。
  **未改** `src/common/编排/block-resolution.ts` 分类语义（自检断言 `decideBlockRoute` 输出）。
- superseded（`orphaned(superseded)`）/ workflow 关闭/stopping/阶段迁移 ⇒ 不造块（既有实际语义：
  无 live 任务可收口则无动作）；initiator-aborted 同样不纳入本扫描。
- **幂等**：指纹材料含 `orphan.at`（同 requestId 新 orphan 才允许新事实）；扫描时与 blocks 账本
  已 replay 的 blockId 比对，同 orphan 的 blockId 已存在 ⇒ 不产出事实（重复扫描/tick 零新增、
  不重复 raised；也避免既有「同 blockId 重复事实 ⇒ 一次 executor-replace 升级」被 tick 轮询触发）。
- 任务循环原有语义（live 任务 + orphaned restart ⇒ engine 重呈现/重投）**逐字不变**；两循环互斥
  （请求级跳过 live 任务）。

## 三、契约文档

新增 `角色卡/桌面窗口/docs/feature/card-request-lifecycle.md`：生命周期事件语义、
**最新事件为准**（`resolved` 终态；`orphaned` 非粘性，其后更晚的 `created`（带
`supersedesOrphanAt`）/`presented` ⇒ 恢复等待/可答）、对账 waiting/orphan 判定、重呈现幂等、
drive 等待非失败、**请求级 orphan 的属主修复/客户裁决路径（无 live 任务 ⇒ 不落 engine）**、
消费者检查清单（供 SMOKE-4 驱动与未来消费者引用）。

## 四、验证

- `npx tsc --noEmit`（node_modules junction 临时）：**0 错误**。
- 临时自检（`.tmp-s3-desktop/selfcheck.ts`，未跟踪、不提交；真实 SessionManager + 真实账本夹具）：
  1. **SMOKE-3 回归**：created+presented + live card-prompt 任务 ⇒ `restoreTasks` 两次均 **0 orphan**、
     账本零 orphan、扫描零 block 事实；waiting 诊断去重（2 次 restore 记 1 条，携带 requestId）。
     card-prompt 任务 rejected 收口后请求仍开 ⇒ 1 条 `orphaned(restart)`。
  2. **并发**：`Promise.all` 3 次 `restoreTasks` ⇒ app 请求恰 1 条 orphan、legacy 请求恰 1 条；
     重复调用零新增。
  3. **重呈现**：orphan 后并发两次 `redeliverAppTask` ⇒ 同 requestId 恰 2 条 created（原 1 + 重呈现 1）、
     恰一条 `supersedesOrphanAt = orphan.at`；第三次重投零新增、orphan 未重复。
  4. **可见/收口**：重呈现后 `request.presented` 晚于 orphan ⇒ project-state pendingRequests=1、
     `request-pending` 阻塞可见；客户 `request.resolved` + A3 stage.completed ⇒ prompt 任务 accepted 收口，
     advance 继续推进（A4 on-dispatch 后到 A5，A3 completed）。
  5. **drive waiting**：A3 入口 `docs/intents/<intentId>.md` 缺失 ⇒ 回执 `ok:true`、
     `waiting.code=intent-entry-missing`、零任务/未 requested、等待期间零 stage.requested/零任务；
     两次 advance 记 1 条 `app-dispatch.drive.pending`、`app-dispatch.drive.failed` **0**。
  6. **请求级 orphan → resolver**（S3.1 闭环）：无 card-prompt 任务（崩溃窗口）+ `orphaned(restart)`
     ⇒ 扫描 1 条 `card-prompt-orphaned`、`engineCanRepair=false`、无 taskId；`decideBlockRoute` =
     **owner-repair**（class protocol-reconcile，owner=chief，不落 engine）；经 router 实跑
     blocks.jsonl 恰 1 条 raised（requestId/engineCanRepair=false）+ routeKind=owner-repair + 创建
     chief 修复任务；重复扫描零新增。任务 closed/rejected 同断言（带原 prompt taskId）。
     `orphaned(superseded)`、阶段迁移 + restart、live waiting(presented) 均不造块。
  全量自检 **59 项断言全部 PASS**。
- 桌面测试：
  - 直接相关：`pending-card-restart` / `task-restart` / `app-dispatch-block-seams` ⇒ **8/8 pass**；
  - `block-router.test.ts` 单跑 22/22 pass（两次）。
  - 全量 `node --test "test/桌面应用/**/*.test.ts"`（最终代码，含请求级扫描）：**894 tests / 890 pass /
    4 fail**——失败集合与请求级扫描前完全一致，均与本批无关（基线对照见下）：
    - 3 条为 **origin/main 基线红**（在 HEAD `1b7801b` 临时 worktree 无本批改动复跑，同名同错）：
      `genesis-bootstrap`「su gate 拒绝新角色 role-card」、`operator-channel`「I-1 补丁 ShellGate」、
      `p0-halt-and-images`「P0-2 abort 三态」；
    - 1 条 `block-router`「T-4 客户主权 … confirmStop 停稳写 workflow.closed」为**全量并行负载抖动**
      （同文件单跑 22/22 通过；断言路径 fixed-v2.1 stop 确认，不经本批改动的逻辑）。
  - 请求级扫描涉及面：`app-dispatch-block-seams` / `block-router` / `block-resolver-projects` /
    `block-reentry` 合并单跑 **39/39 pass**。
- 编排侧回归（确认仅地基批已知旧断言失败）：`test/编排/app-dispatch-service.test.ts` 19 pass / 1 fail
  ——失败为地基批记录 §五.3 明列的「A3 card prompt missingEntry.ok === false」旧断言（等待回执为
  ok:true），属测试批待更新点，与本批无关。

## 五、待测试批点

1. `test/编排/app-dispatch-service.test.ts:963` 旧断言（`missingEntry.ok === false`）按地基批 §五.3 更新。
2. 新增桌面测试：① waiting 零 orphan（SMOKE-3 回归）/终态任务 orphan；② 并发 restore 至多一条 +
   重复零新增；③ 重呈现 `supersedesOrphanAt` + 并发/重复零新增；④ presented 晚于 orphan 的
   project-state/block-router 可见性；⑤ drive waiting ⇒ drive.pending、零 drive.failed；
   ⑥ **请求级 orphan 扫描**：无任务/终态任务 ⇒ `card-prompt-orphaned`(engineCanRepair:false) 经
   `decideBlockRoute` 落 owner-repair（断言 route/owner=chief，不落 engine）、重复扫描零新增；
   superseded/阶段迁移/live waiting 不造块。
3. SMOKE 驱动的 S4（presented 晚于 orphan 恢复作答）仍由测试侧修改。
4. block-router `findRequestState` 的 presented 分支建议补一条单测（orphan → presented ⇒ 可见等待）。

## 六、风险与边界

- **诊断字段截断（既有白名单）**：`src/common/shared/diagnostics.ts` 只落盘 `FIELD_NAMES` 内字段；
  `workflowId/stage/taskId/code` 会被丢弃，本批额外传 `reasonCode/phase/attempt` 等白名单字段保证
  等待事实可检索（代价：诊断里没有 workflowId）。
- **并发边界**：在飞去重为进程内（单 SessionManager）；跨进程/多实例并发不在本批（与既有账本写入同边界）。
  `restoreRequestState` 让并发第二调用者复用第一执行的回执；若第二调用者的账本快照含第一执行
  fresh 重读之后才出现的新请求，该请求留待下一次 listProject 刷新处理（不误写、不丢状态）。
- **竞态**：重呈现「superseded 判定 → 追加」之间若 workflow 恰好关闭，重呈现仍会写入（新 created），
  随后扫描按 superseded/阶段迁移收口任务；窗口已由追加前重读大幅缩小，剩余竞态属既有写序边界。
- **兼容**：全部为行为修复 + 读侧口径对齐；新增事件字段仅由重呈现写入（地基校验向后兼容）；
  legacy/非 app-dispatch 请求与旧固定路径语义逐字不变。
- 未新增 event kind、未改状态机/分类语义；失败仍 fail-closed。

## 七、改动文件

- `app/desktop/session/cards/version-decisions.ts`（restore 分类/在飞/最新账本复核 + 诊断）
- `app/desktop/session/fixed-workflow/stage-dispatch.ts`（重呈现 supersedes/幂等；advance waiting 口径；
  请求级 orphan 扫描 ⇒ owner-repair）
- `app/desktop/block-router.ts`（findRequestState presented 清 orphaned）
- `角色卡/桌面窗口/docs/feature/card-request-lifecycle.md`（新增消费契约）
- 本记录（新增）
