# 卡请求生命周期与消费契约（request.created / presented / orphaned / resolved）

本文是桌面窗口侧对**卡请求生命周期**的对外契约（供 SMOKE 驱动、block resolver 与未来消费者引用），
依据 2026-11-20 SMOKE-3 S3 立案修复（桌面批 + 编排/模型地基批）。

## 一、事件与语义

`tasks.jsonl` 中与同一 `requestId`（app-dispatch/v1 卡请求 = `promptId`）相关的生命周期事件：

| 事件 | 语义 |
| --- | --- |
| `request.created` | 请求开启/重新呈现。首次创建与既有记录无 `supersedesOrphanAt`；**同 requestId 重呈现**时携带 `supersedesOrphanAt`（= 被取代 `request.orphaned.at` 原文，非空可解析时间戳；坏值拒写）。 |
| `request.presented` | 卡已在目标会话呈现（等客户/judge/幕僚作答）。不改变请求是否等待。 |
| `request.orphaned` | 该请求在**当时**已无可重投（`reason` ∈ `restart` / `superseded` / `initiator-aborted` 冻结三值）。表示「此刻没有活跃卡」，**不是粘性终态集合**。 |
| `request.resolved` | 最终态：已裁决（answered/declined/unavailable 等）。之后不再等待。 |

## 二、最新事件为准（last-wins）

**消费者必须按账本事件的最后一条判断请求当前状态，不得把 `request.orphaned` 当作终态集合。**

- 生命周期链示例（SMOKE-3 场景）：
  `created → orphaned(restart) → created(supersedesOrphanAt=<orphan.at>) → presented`
  ⇒ 请求**重新等待/可答**；消费者应正常作答，而不是因历史 orphan 跳过。
- `request.created`（任意一条）晚于 `request.orphaned` ⇒ 取代该 orphan（新 created 自带
  `supersedesOrphanAt` 显式凭据；旧记录/兼容期也可仅凭顺序判定）。
- `request.presented` 晚于 `request.orphaned` ⇒ 清除 orphan（同一请求已重新呈卡、仍在等待；
  与 project-state / block-router / 桌面 `requestViewOf` 同口径）。
- `request.resolved` 之后不再等待（最终态；后续事件不改变该判定）。
- 等待判定 = 有 `request.created` 且最后一条生命周期事件 ∈ {created, presented}。

仓库内读侧实现（同口径，修改时须同步）：
`src/common/编排/project-state.ts::collectRequests`、`app/desktop/block-router.ts::findRequestState`、
`app/desktop/session/fixed-workflow/stage-dispatch.ts::requestViewOf`。

## 三、应用侧（桌面）写入纪律

### 3.1 重启对账（`restoreRequestState`）

`listProject` 每次刷新都会并发触发 `restoreTasks`（fire-and-forget），对账必须：

1. **不得 orphan 仍可等待的卡**：app-dispatch/v1 card-prompt 请求（`request.created` 带
   workflowId/stage/promptId，或能匹配到应用 `card-prompt` 任务）在以下条件全部成立时视为
   waiting——**不写 `request.orphaned`**，只记一次去重诊断 `desktop.request.restore.waiting`
   （字段 workflowId/stage/requestId/taskId；同 requestId 不刷屏）：
   - 匹配的 `card-prompt` 任务存在，且 `record.closed === undefined && record.reports.length === 0`；
   - workflow 协议 = `app-dispatch/v1` 且账本可读；
   - workflow 仍活动（未 `workflow.closed`、未 stopping）、当前阶段 = 请求阶段（未迁移）。
2. **允许 orphan 的情形**：无可重投（找不到 `card-prompt` 任务）或任务已终态
   （closed/rejected/已报告）而请求仍开 ⇒ 既有 `orphaned(restart)` 路径（请求级 block 扫描随后
   `card-prompt-orphaned` → 属主修复/客户裁决，见 §3.3）；workflow 已关闭/停用/阶段迁移 ⇒
   `orphaned(superseded)`（不误重投；prompt 任务按实际语义 rejected 收口）。
3. **幂等/并发**：每 project 在飞去重（并发调用共用同一次执行）+ 追加前按最新账本再判定一次；
   重复调用零新增（修复 SMOKE-3 的 13:01:59.436/.449 双 orphan）。
4. legacy（非 app-dispatch）请求 `orphaned(restart)` 语义逐字不变。

### 3.2 orphan 后重呈现（`representOrphanedCardRequest`）

- 以**同 requestId** 追加一次 `request.created`，内容逐项复制原应用事实（不新开卡、不采信模型自报），
  并携带 `supersedesOrphanAt = 被取代 request.orphaned.at`。
- **同 orphan 只重呈现一次**：每 `(projectRoot, requestId)` 在飞去重；追加前重读最新事件
  （last 仍必须是 orphaned，否则按最新状态 no-op 返回 waiting/visible/settled）。
- 后到的 `request.presented` 保持既有写入；重呈现后卡恢复可答（不写额外「重置」事件——契约按
  最新事件为准）。裁决后 `request.resolved` + prompt 任务由应用收口（`task.closed(by:"application")`）。

### 3.3 orphan 后的 resolver（请求级扫描）

`scanAppCardPromptFacts` 除 live 任务扫描外，还做**请求级**扫描（任务循环只覆盖 live 任务；
「无任务 / 任务已终态而请求仍开」必须同样有 block 事实，否则流程永久停摆）：

- 条件：app-dispatch/v1 请求的最新生命周期事件为 `request.orphaned(restart)`，workflow 仍活动且
  阶段未迁移，且该 requestId **无 live card-prompt 任务**（不存在或任务已 closed/已报告）。
- 事实：`code:"card-prompt-orphaned"`、`detailCode:"reconcile"`、`engineCanRepair:false`、
  `ownerRoleId`（原 prompt 任务目标，缺任务时 `chief`）⇒ `decideBlockRoute` 落 **owner-repair**
  （属主修复任务；客户可在 block 卡路径裁决）。**不落 engine-auto-fix**——无任务可重投。
- 不造块：`orphaned(superseded)`、workflow 关闭/stopping、阶段迁移、`initiator-aborted`、
  live waiting（created/presented）。
- **幂等**：事实指纹含 `orphan.at`；同一 orphan 的 block 已在账本（raised/结算）⇒ 不重复产出
  （重复扫描/tick 零新增）；同 requestId 新 orphan（不同 at）才允许新事实。

## 四、drive 的有界等待不是失败

app-dispatch/v1 卡阶段的入口前置检查（如 A3 的 `docs/intents/<intentId>.md`）未就绪时，编排
`driveAppDispatchStage` 返回**成功形态**的 `{ ok:true, waiting:{code,message}, tasks:[], ... }`
（零事件、无 blockFact）。桌面 `advance` 对此：

- 记一次去重诊断 `app-dispatch.drive.pending`（同 workflow/stage/code 不刷屏）；
- **不写 `app-dispatch.drive.failed`、不造 block**，停止本轮；入口出现后下一 tick 正常推进。

item 9「不得连续 drive.failed」只约束 block `resolved(fixed|decided)` 后的重入路径；等待分支不改该路径。

## 五、消费者检查清单（SMOKE 驱动等）

1. 不要维护「orphan 集合」并按集合跳过对话框；按同一 requestId 的**最后一条**生命周期事件判定。
2. 见到 `created(supersedesOrphanAt)` 或晚于 orphan 的 `presented` ⇒ 卡可正常作答。
3. 只有 `resolved` 是终态；`orphaned` 之后出现新的 `created/presented` 即恢复等待。
4. 历史 orphan 保留在账本中作审计，不删除、不改写（只追加）。

来源：[本次桌面变更记录](../change/2026-11-20_change_card-request-orphan-semantics-desktop.md)、
[编排地基记录](../../../编排/docs/change/2026-11-20_change_card-request-orphan-semantics-foundation.md)、
[SMOKE-3 记录](../../../测试/docs/change/2026-11-20_SMOKE3_app-dispatch.md)（测试角色批次产出）。
