# W19/W33 产品修复：closeCreatedTask 复用 notify 补发 close 通知

- 日期：2026-11-16
- 角色：编排（roleId: 编排）
- 工作树：`.claude/worktrees/w19`（分支 `fix/test-debt-w19-w33`，起点 `a0baea2` = `origin/main`）
- 依据：协调者裁定（W19/W33 产品修复批准）；B4 调查 `角色卡/测试/docs/change/2026-11-16_test-debt-b4-e71501c-drift.md` §3 + `…_evidence/w19-w33-close-notify-investigation.txt`
- 约束遵守：只改 `src/pipeline/orchestration/trunk-runtime.ts`、`test/桌面应用/chief-workflow.test.ts`（仅 W19/W33 相关行）、本记录与 `_evidence/`；未改其他产品/测试/workflow/release.yml/角色卡/边界；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。

> **更新（2026-11-16，协调者裁定方案 a 已实施）**：§3/§4 的「停手」状态已被 §8 取代——hub 准备跨 run 例外已按严格白名单落入 `apply-journal.ts`，W33 转绿；`direct-role-capabilities.test.ts` 三处旧「close 不通知」语义已按新裁定逐条更新。§0–§7 保留为当时（方案 a 前）的记录。

## 0. 摘要

1. **产品修复已实施**：`createDirectRoleRuntime.closeCreatedTask` 成功回执后复用既有 `notify(receipt)`（与 `activateRoleDocuments`/`completeTeamPlan`/`selectRunChange` 同一接线）；错误码/排序/既有回执语义不变。
2. **W19 转绿**：定向 5× 全绿（加一个时序屏障后）；失败根因由「缺少 close 通知生产」变为「通知队列按 close 回执 information-only 退役」链路真实走通。
3. **W33 仍红（停手）**：产品侧 close 通知已真实入队，但**消费侧跨 run 例外只认 legacy `document-preparation`**（`apply-journal.ts:2327-2356`），当前 chief→product 准备走 hub（`builtin-preparation`/`builtinPreparationSource`/`run-hub-`），`classifyClosedTaskNotice` 返回 `closed-task-notice-unproven`，队列项不被退役。该修复点在 `apply-journal.ts`（超出本任务允许写入范围）⇒ 按裁定**停手报告**，未改消费侧。
4. **发现既有测试与新裁定语义直接冲突（超出本任务允许写入范围）**：`test/编排/direct-role-capabilities.test.ts` 明确断言「close 不广播」（`:63`）与「close 无 sink 也必须 applied 且不得调用 notifyDirect」（`:711-717`）。修复后该文件新增 3 个红；基线（未改产品）本就另有 1 个无关红（`:90`）。需 owner/测试角色按新裁定同步更新。
5. W19 初次 3× 中出现 1× 时序 flake（`:1561`，断言早于 drain 记账）；加 W19 内 wait 屏障（不弱化断言）后 5× 全绿，如实披露。
6. `npm run typecheck` **EXIT=0**；`chief-workflow.test.ts` 全文件 **66 tests / 65 pass / 1 fail（仅 W33）**。

## 1. 产品修复（diff 与接线依据）

文件：`src/pipeline/orchestration/trunk-runtime.ts`（`createDirectRoleRuntime.closeCreatedTask`，原 :831-836）

```diff
     // A task lifecycle receipt belongs to its actual creator/caller and persisted UI task state.
-    // It is not a document/permission effect and must not start unrelated model turns.
-    return service.closeCreatedTask(request, input.actorRoleId);
+    // It is not a document/permission effect and must not start unrelated model turns; the same
+    // idempotent notify sink only adds this exact close receipt (consumed as information-only).
+    const receipt = await service.closeCreatedTask(request, input.actorRoleId);
+    const pending = await notify(receipt); return pending ? { ...receipt, ...pending } : receipt;
   }, completeTeamPlan: async (request, signal) => {
```

接线依据（全部为既有机制，未新增分支/错误码）：

- `notify(receipt)`（:785-804）守卫只接受 `role-direct` 成功回执，并使用 `applicationId/journalId/targetDigest`。`closeCreatedTask` 成功回执（`apply-journal.ts:3226-3228`）四项齐备；replay 分支（:3196-3197）同样齐备。
- 幂等键 `` `${operationId}:${targetDigest}:${source.action}:${recipientRoleId}` ``、`directDeliveryRecorded`/`recordDirectDelivery`、`committed-pending-recovery`（`direct-notifications-pending`）逐字复用；收件人 `{chief, convener, actor}` 与其它三个 direct 动作一致。
- host 侧既有接线已足够：`app/desktop/session/lifecycle/open.ts:581` 的 `notifyDirect → queueDirectNotification`，且 `:582-587` 在 `closeCreatedTask` 成功后 `drainAllQueuesFor`；本次仅补生产侧调用点。
- 消费侧（现有实现）：`app/desktop/session/delivery/queue.ts:742-757` 对带 `notificationSource` 的 system 项调用 `classifyClosedTaskNotice`，成功即以 information-only 退役（不产生模型轮次、不重开任务）；`apply-journal.ts:2304-2359` 支持 `action === "close-created-task"` 的精确匹配（`canonicalJson(actionSource)`、源任务唯一 `task.created`/`task.closed`、收件人旧绑定已关闭、同 flow）。W19 的同一 run 与同 run 跨任务场景均通过。

**语义变化（有意、与其它 direct 动作一致）**：close 成功后若没有 `notifyDirect` sink，`notify` 抛 `Idempotent direct notification sink is unavailable` 并被捕获为 `committed-pending-recovery`（`direct-notifications-pending`）。此前 close 不需要 sink。生产调用点（open.ts）始终提供 sink；测试调用点需同步（见 §4）。

## 2. W19 对齐与结果

- 修复前：W19 在 `chief-workflow.test.ts:1512` 失败「The actual creator receipt must supply notification source」——`closeCreatedTask` 从不调用 `notifyDirect`，`actualCloseNotice` 恒为 undefined。
- 修复后：close 回执经 `notifyDirect` 抵达 convener（`actualCloseNotice` 填充）→ `queueDirectNotification` 入队 → 当前 convener 回合结束后 drain → `classifyClosedTaskNotice` 以 information-only 退役（不产生新模型提示，:1515 断言保持）→ 第三方 close（child，同 run、不同任务）同样退役（:1539-1543 断言保持）→ 故意错 targetDigest 的 notice 保持 pending 且投递失败 `delivery-assignment-unavailable`（:1554-1562 断言保持）。用例转绿，未改任何既有断言语义。
- **新增的 W19 时序屏障（仅 W19 行）**：`:1553` 增加
  `await waitFor(() => …queuedDispatches.find(operationId)?.lastAttempt.state === "failed", "Wrong-source notice must record its failed delivery attempt before its persisted effect is observed")`。
  原因：修复后用例首次走到 `:1561` 的 `lastAttempt.state === "failed"`；drain 的尝试记账是异步的，原断言可能早于记账（初次 3× 中 1×、随后 8× 中 3× 观察到 `unknown !== failed`）。屏障只等待既有真实失败事实，不弱化断言。
- 结果：加屏障后定向 **5×（run9-run13）全绿**；修复前同用例稳定红。

## 3. W33 对齐与结果（产品侧已通、消费侧阻断）

- 修复前：`:1843` 失败「The exact cross-run host close notice must retire rather than block the queue」——close 通知根本不产生。
- 修复后：close 通知**已真实入队到 convener**（证据 `w19-w33-first-notice-projection.json`：`notificationSource.operationId = w33-close-product-draft`、`runId = run-hub-4de68b20…`、`systemAssignmentTaskId = init 任务 t-mwizqlkz-bb1de12e`）。但队列项未被退役，最终 `lastAttempt = failed / delivery-assignment-unavailable`。
- 直接对同一工程根调用 `classifyClosedTaskNotice`（`classification-probe.txt`）返回：
  `{"ok":false,"code":"closed-task-notice-unproven","message":"The actual recipient assignment and source fact do not share the same original project flow/run"}`
- 根因（消费侧语义不匹配，位于 `src/service/trunk/impl/apply-journal.ts:2327-2356`）：跨 run 的 information-only 例外 `sourcePlanningDraft` 只接受 `value.purpose === "document-preparation"` 且 run 记录 `documentPreparationSource === ref.sourceId`。当前 chief→product 准备走 hub：`purpose = "builtin-preparation"`、`hubRouting = "chief-hub-v1"`、run 记录 `builtinPreparationSource`（同文件 :3841/:3859-3860），初始 init 与后续 draft 的 run 不同（`run-hub-7cc1…` vs `run-hub-4de68…`）⇒ 跨 run 被拒。
- 3× 结果：3/3 红。run2/run3 稳定失败于 `:1843`；run1 的 waitFor 因队列项被 claim/在途而瞬时通过，随后在 `:1863` 以「该 operationId 仍在 queuedDispatches」失败——同一根因的另一种时序表现。
- **已完成的 W33 测试对齐（仅 W33 行）**：`:1849-1851` 将 `run-docs-` 断言更新为 `run-hub-` 并加注释。依据（证据文件实测）：`draft.created.runId = run-hub-4de68b20…`、`init.created.runId = run-hub-7cc11708…`（互不相同）；draft 工作源 `purpose=builtin-preparation`、`hubRouting=chief-hub-v1`、`kind=creator-report`、`parent.kind=handback`、`creatorReports[0].taskId = init.taskId`——W33 其余 `:1852-1855` 断言与该真实形态已一致，无需改动。
- **未继续对齐/未改产品消费侧**：按裁定「若发现消费侧语义不匹配或需要扩大改动，停手报告」。W33 转绿需要 owner 裁决是否把 `apply-journal.ts` 的 cross-run 例外扩展到 hub 准备（在同等 provenance 校验下接受 `purpose=builtin-preparation`+`hubRouting`+`builtinPreparationSource`），或调整 W33 期望。

## 4. 既有测试冲突（停手事项，超出允许写入范围）

`test/编排/direct-role-capabilities.test.ts` 明确固化旧语义，与新裁定相反：

| 位置 | 旧断言 | 修复后实际 | 基线（未改产品） |
| --- | --- | --- | --- |
| `:63` | `noticeRecipients` 必须为 `[]`（"Real task closes do not broadcast…"） | 每次 close 向 `{chief, convener, actor}` 通知 ⇒ 数组非空 | 通过 |
| `:711-717`（chief / convener 两个用例共用） | `missingSink` 无 sink 时 close 必须 `status === "applied"`；带会抛错 sink 时 `delivered.size === 0`（"No task lifecycle model broadcast is expected"） | 无 sink ⇒ `committed-pending-recovery / direct-notifications-pending`；有 sink ⇒ 真实调用 ⇒ 抛错 | 通过 |
| `:90` | 形状伪造的确认不得提升迁移 | 失败（**与本次修复无关，基线同样红**） | **红（pre-existing）** |

- 全文件复跑：基线 **46 pass / 1 fail**；修复后 **43 pass / 4 fail**（新增 3 个，均在上表前两行）。
- 这些测试文件不在本任务允许写入范围（只允许 `chief-workflow.test.ts` 的 W19/W33 行），故**未改**，交 owner/测试角色处理。注意：该冲突无法通过产品侧「无 sink 时跳过 notify」调和——`:717` 要求即使提供 sink 也不得调用。

## 5. 验证结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| W19 定向（最终代码） | `node --test --test-timeout=120000 --test-force-exit --test-name-pattern "W19" test/桌面应用/chief-workflow.test.ts` | **5× 全绿**（run9-run13；初次 8× 中 3× 同一 `:1561` 时序红，见 §2） |
| W33 定向（最终代码） | 同上 `--test-name-pattern "W33"` | **3× 红**：2× `:1843`（退役 waitFor），1× 瞬时过后 `:1863`（同根因） |
| chief-workflow 全文件 | `node --test --test-timeout=120000 --test-force-exit "test/桌面应用/chief-workflow.test.ts"` | **66 tests / 65 pass / 1 fail**；唯一红 = W33；W19 绿；其余 64 与 B4 基线一致 |
| direct-role-capabilities | 同参数全文件 | 基线 46/1；修复后 43/4（新增 3 个均为 §4 语义冲突） |
| 模块消费（convener/rapporteur/product） | 三文件同跑 | **21/21 绿** |
| judge-delegated effectiveness | 同参数 | **1/1 绿** |
| typecheck | `npm run typecheck` | **EXIT=0** |

说明：`chief-workflow.test.ts` 为重夹具文件，按其既有口径使用 `--test-force-exit`（B4 同口径）。W19 时序 flake 已如实披露并用 W19 内 wait 屏障收敛（最终 5× 全绿）。

## 6. 风险与限制

- **W33 未完成**：close 通知生产侧已通；消费侧跨 run 例外未覆盖 hub 准备，W33 保持红。需要 owner 对 `apply-journal.ts`（或 W33 期望）作一次性裁决；本任务未越界修改。
- **运行时契约收紧**：成功的 close 现在与其它 direct 动作一样需要 `notifyDirect` sink；无 sink 的调用返回 `committed-pending-recovery`。生产调用点（open.ts）已提供 sink；测试侧需按新语义更新（§4）。
- **通知面扩大（有意）**：每次 close 成功会向 chief/convener/actor 各幂等投递一条 information-only 通知；消费侧校验通过才退役，不启动模型轮次。W19 证明同 run 与同 run 跨任务可退役；W33 暴露 hub 跨 run 尚不可退役。
- W19 新增的 wait 屏障依赖真实失败记账可达（实测 5×+ 可达）；W33 的退役 waitFor 存在「claim 瞬时通过」的既有测试竞态，待消费侧修复落地后建议一并稳定。
- 本工作树所有改动未 commit/push。

## 7. 证据索引（`角色卡/编排/docs/change/2026-11-16_w19-w33-close-notify_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `product-diff.txt` | 产品 diff（trunk-runtime.ts） |
| `test-diff.txt` | 测试 diff（chief-workflow.test.ts，仅 W19/W33 行） |
| `classification-probe.txt` | 对 W33 工程根直接调用 `classifyClosedTaskNotice` 的输入/输出（`closed-task-notice-unproven`） |
| `w19-w33-first-notice-projection.json` | W33 用例自身导出的首条通知投影（closeSamples/队列/任务/trace） |
| `verify-w19-run1.txt` … `run8.txt` | 加屏障前的 W19 定向复跑（5 绿 / 3 红，红均为 `:1561` 时序） |
| `verify-w19-run9.txt` … `run13.txt` | 加屏障后的 W19 定向复跑（5× 全绿） |
| `verify-w33-run1.txt` … `run3.txt` | W33 定向 3×（均为同根因红；run1 为 `:1863` 变体） |
| `verify-chief-workflow-full.txt` | 全文件 66/65/1（唯一红 W33） |
| `verify-direct-role-capabilities-baseline.txt` | 未改产品的基线复跑（46 pass / 1 pre-existing fail :90） |
| `verify-direct-role-capabilities-full.txt` | 修复后复跑（43 pass / 4 fail：新增 §4 三例） |
| `verify-module-consumption.txt` | convener/rapporteur/product 模块消费 21/21 |
| `verify-judge-delegated.txt` | judge-delegated 1/1 |
| `verify-typecheck.txt` | `tsc --noEmit` EXIT=0 |

## 8. 方案 a 追加实施（协调者裁定）：hub 准备跨 run information-only 例外

### 8.1 产品修改

**路径说明**：任务书写 `src/pipeline/orchestration/apply-journal.ts`，仓库不存在该文件；`classifyClosedTaskNotice` 的实现位置与本文 §3 一致，为 `src/service/trunk/impl/apply-journal.ts`（约 :2304-2360）。本次按实际路径修改，未新建任何桥接文件。

`classifyClosedTaskNotice` 的跨 run 例外由「只认 legacy `document-preparation`」改为「共同 provenance + 二选一来源白名单」：

- **共同 provenance（legacy 与 hub 同等校验，逐字保留原强度）**：`schema=repository-work-source/v1`；`kind` 与 `workSourceRef.kind` 匹配（`chief-creator-report` ⇒ `creator-report`，否则 `customer-turn`）；`sourceId`/`projectRoot`/`flowId`/`targetRoleId=created.to`/`planningRunId=created.runId` 全匹配；`parent.roleId="chief"`；run 记录 `state=draft` 且 `flowId=created.flowId`；`bound.from=created.from`。随后原有 creator-report 历史校验、bound 已关闭（精确 `close-created-task` 回执）、同 flow 条件与 `{kind:"information-only"}` 返回/幂等键形状均不变。
- **legacy 白名单（原逻辑）**：`value.purpose === "document-preparation"` 且 `run.documentPreparationSource === ref.sourceId`。
- **hub 白名单（新增，严格）**：`created.hubRouting === "chief-hub-v1"` 且 `value.purpose === "builtin-preparation"` 且 `value.hubRouting === created.hubRouting` 且 `run.builtinPreparationSource === ref.sourceId`。
- **其它任何 purpose/来源**：仍返回 `closed-task-notice-unproven`，错误码、消息与 fail-closed 面未放宽。hub 分支沿用原 cross-run 条件的目标角色白名单（chief 创建的 product/rapporteur draft），未额外扩张到五内置；这是覆盖 W33 的最小面。

产品 diff（含上一轮 trunk-runtime 接线）：`_evidence/product-diff-hub.txt`。

### 8.2 `direct-role-capabilities.test.ts` 三处旧语义更新（语义对齐，不是放宽断言）

| 位置 | 旧断言（close 不通知） | 新断言（close 成功必须经 notify 通知） | 理由 |
| --- | --- | --- | --- |
| `:63`（五角色 hub close 用例） | `noticeRecipients` 必须为 `[]` | 精确等于 5×`["chief","convener"]` 的 10 条序列 | 每次 close 经 `notify(receipt)` 向 `{chief, convener, actor}` 幂等投递；actor=chief 时去重为 2 收件人。断言仍是「只通知确切收件人、不产生 model turn/action authority」，只是不再要求「零通知」。 |
| `:711-713`（planning draft close，无 sink） | close 必须 `status="applied"` | `status="committed-pending-recovery"`、`ok=false`、`errorCode="direct-notifications-pending"`，消息含 sink 不可用；同时保留 `closed.by=actor` 断言 | close 先持久化提交，再由既有 `notify` 补发；无 sink 时的 pending-recovery 语义与 `activateRoleDocuments`/`completeTeamPlan`/`selectRunChange` 完全一致。`closed.by` 断言证明「提交先于通知恢复」，不是弱化。 |
| `:715-718`（planning draft close，带 sink） | 即使提供会抛错的 sink 也必须 `applied` 且 `delivered.size===0` | 使用记录型 sink：`status="applied"`；按幂等键恰投递 `chief`/`convener` 两份；重复调用 deepEqual 保持 | 旧断言与新裁定相反（要求「有 sink 也不得调用」）。新断言直接编码「成功的 close 必须经 notify 通知」，并保留幂等 replay 不变。 |

全文件复跑：**47 tests / 46 pass / 1 fail**，与基线逐项一致（唯一红 = `:91` 的 pre-existing `frozen-conflict: <path>` 消息差异，与本次改动无关）；三处更新用例全部转绿，**零新增红**。

### 8.3 验证结果（方案 a 最终代码）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| W19 定向 3× | `node --test --test-timeout=120000 --test-force-exit --test-name-pattern "W19" test/桌面应用/chief-workflow.test.ts` | **3/3 全绿**（`verify-w19-hub-run1..3.txt`） |
| W33 定向 3× | 同上 `--test-name-pattern "W33"` | **3/3 全绿**（`verify-w33-hub-run1..3.txt`）；另加 1× 证据导出跑亦绿（`verify-w33-hub-probe.txt`） |
| chief-workflow 全文件 | `node --test --test-timeout=120000 --test-force-exit "test/桌面应用/chief-workflow.test.ts"` | **66 tests / 66 pass / 0 fail**，EXIT=0（`verify-chief-workflow-hub-full.txt`）；W19/W33 均绿 |
| direct-role-capabilities 全文件 | `node --test --test-timeout=120000 --test-force-exit test/编排/direct-role-capabilities.test.ts` | **47 / 46 pass / 1 fail**，与基线一致（唯一红为 pre-existing `:91`）；零新增（`verify-direct-role-capabilities-hub-full.txt`） |
| 相关 close/notify 文件 | `node --test --test-timeout=120000 --test-force-exit test/编排/git-capabilities.test.ts` | **16 tests / 13 pass / 1 fail / 2 skipped**；唯一红 = `Git team plan publication…`「The actual publication task has no original Chief input source」，为 B2.1/B3.1/B32 证据中已记录的 known-red（与本次 diff 无关；`verify-git-capabilities-hub.txt`） |
| typecheck | `npm run typecheck` | **EXIT=0** |

W33 证据导出（`hub-probe/`）：close 通知真实入队后退役，队列归零；来源实测 `purpose=builtin-preparation`、`hubRouting=chief-hub-v1`、`targetRoleId=product`、`planningRunId=draft run`（与 bound 的 init run 不同）。摘要见 `hub-probe-summary.txt`。

### 8.4 证据补充（`_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `product-diff-hub.txt` | trunk-runtime（W19 接线）+ apply-journal（hub 白名单）产品 diff |
| `test-diff-hub.txt` | direct-role-capabilities 三处语义更新 + chief-workflow W19/W33 行 diff |
| `verify-w19-hub-run1.txt` … `run3.txt` | 方案 a 后 W19 定向 3× |
| `verify-w33-hub-run1.txt` … `run3.txt` | 方案 a 后 W33 定向 3× |
| `verify-w33-hub-probe.txt` | W33 证据导出跑（绿） |
| `hub-probe/w33-hub-final-first-notice-projection.json`、`…-cross-run-close.json` | W33 首条通知投影与跨 run close 后队列（操作已退役，`queueAfter` 为空） |
| `hub-probe-summary.txt` | 上述投影的紧凑摘要（run 不同、hub 来源标记、队列归零） |
| `verify-chief-workflow-hub-full.txt` | 全文件 66/66 |
| `verify-direct-role-capabilities-hub-full.txt` | 全文件 46/47，与基线一致 |
| `verify-git-capabilities-hub.txt`、`verify-git-capabilities-teamplan-rerun.txt` | 相关 close 文件；唯一红为既有 known-red |

### 8.5 状态

- **W33 已转绿**（定向 3× + 全文件 + 证据跑）；W19 保持 3× 绿；全文件 66/66。
- §3/§4 的两项停手事项（消费侧 hub 例外、direct-role-capabilities 冲突）均已按裁定完成。
- 约束保持：仅改 `trunk-runtime.ts`、`apply-journal.ts`、`chief-workflow.test.ts`（W19/W33 行）、`direct-role-capabilities.test.ts`（三处旧语义）、本记录与 `_evidence/`；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
