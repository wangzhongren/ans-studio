# 派发与状态记录：提案确认卡 draft-run 绑定缺陷修复（2026-11-09）

- **任务 ID**：`2026-11-09-proposal-card-run-binding-fix`
- **记录角色**：ANS 统筹调度（Scheduler）；**修复快路径（T1）**
- **日期**：2026-11-09
- **性质**：派发/状态记录；不是验收结论；不授权提交/推送/合并/发布（合并需客户逐 PR 允许；发布/tag 未授权）。
- **依据**：
  - 缺陷记录（客户修复指示「修复并继续」）：`docs/communication/2026-11-09_defect_proposal-card-run-binding.md`。
  - 修复路由/设计：`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`（183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`）。
  - **B1 v1/v1.1（冻结）**：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`（v1 `42a1ec9b…`；v1.1 294 行 / 48,124 bytes / `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`；含基线已知红附录 A）。
  - 子修复记录（F7，先于代码）：A′ `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding.md`（81 行 / 11,151 bytes / `d4147997…`）；B `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md`（96 行 / 16,245 bytes / `4005b0f4…`）。
  - D1：`角色卡/测试/docs/change/2026-11-09_D1_proposal-card-run-binding-fix.md`（`fdda222a…`）；RR4：`角色卡/测试/docs/change/2026-11-09_RR4_proposal-card-run-binding-real-run.md`（`6c6c4487…`；S1 修正运行进行中）。
- **基线**：HEAD `c1439ce`（tree `262e7ba4…`；分支 `feat/plan-escalation-card`）；`src app test` 干净基线；已知红：`optional-acceptance.test.ts` 6/2/1/3/0 + `test/编排/**` 22 fail/2 skip（B1 v1.1 A.1 逐条）。

## 一、修复结构（D1–D5 处置）

- **D1（F3 跨两角色）**：采用「一缺陷两子修复」——A′ owner=**编排**（`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts`），B owner=**桌面窗口**（`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts`）；每个子修复单所有者、均在 Section 1、无新契约/数据模型；共用本缺陷记录/B1；协调方已放行修正 S1。
- **D2**：A′ 等价绑定（出卡时按实际项目字节 `complete-snapshot/v1` 快照+SHA-256 + drift 复核；不改 `run-manifest.ts`/`RunDocKind`）；若改走 manifest 持久化须递增 B1。
- **D3**：materials 全部失败 fail-closed；execution 阶段既有回退不变。
- **D4**：`declined+notPresented+reason`、无 operatorId、`by` 沿用既有约定（不声称客户拒绝/同意）。
- **D5**：真实运行使用全新隔离目标项目/副本；贪吃蛇 9222/其 target/run 根零改动；9223 结束关闭。

## 二、写集与批次

| 批次 | owner | 写集 | 状态 |
| --- | --- | --- | --- |
| A′ | 编排 | `src/service/trunk/impl/apply-journal.ts`（draft 分支 refs 空：实际字节→快照+SHA-256+drift；pinned/无 runId 不动）、`test/编排/direct-role-capabilities.test.ts`（A1–A5） | **完成（确定性）**：+31/−5；test/编排 1122→1127（+5，22 fail/2 skip 同一集合）；typecheck 0；候选 2 文件聚合 `bb24291e…` |
| B | 桌面窗口 | `app/desktop/customer-input.ts`（materials 失败不呈现/不写 presented；declined+notPresented+reason）、`test/桌面应用/chief-workflow.test.ts`（B1–B5） | **完成（确定性）**：+40/−5、+167/−20；chief-workflow 63 tests（新用例全过；0 新确定性失败/0 新 skip）；typecheck 0；修复记录 `4005b0f4…` |
| D1（组合） | 测试 | 证据 | **完成**：候选 4 文件聚合 `bf12745676901055ccfcb98e3578205465c88a3ef8293faa91827dc5beb80986`；manifest 1,109 / `4958207f196109ef5c7d25e642f8846880236a94e6fe4fca6bb6af03e1cab064`；`test/编排` 1127/1103/22/0/2、`chief-workflow` 63（0 新确定性失败/新 skip）、回归/typecheck 通过；证据 `fdda222a…` |
| RR4 | 测试 | 证据 + 仓库外根 | **S1 修正运行成功**（9223/隔离副本；1 消息/1 卡/≈1m54s）：draft run 提案卡 `req-303944cb359e95cd` → 客户接受（by customer/operatorId 51054）→ `request.resolved` → 工具回执 ok → 流程继续；A′ 决策快照 `decision-3755…`（6 files 实际字节一致）；无「通道未受理」；S2 fail-closed 真机已触发；9222 零改动、9223 关闭。记录 `e561c38e…`；D1 记录 `d6270956…` |
| B2 | 内置独立验收 | `docs/acceptance/` | **完成：pass（48/48；0 fail/0 insufficient/0 NA）**；报告 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-report-v1.md`（211 行 / 33,857 bytes / `8af767e2fc998e7bee691f8bdb1949c582f10280632dfaf92ae7dabf69a4afc8`）；候选/原件/隔离/已知红独立复算通过；限制见报告 §6 |
| E3-B/变更包 | 统筹 | `docs/scheduling/` | **完成**：`docs/scheduling/2026-11-09_change-package_proposal-card-run-binding-fix.md`（64 行 / 9,039 bytes / `e5735373b7b3cb0dfaea946ef1ac75a43a030f6aead12e7f6fbc8a22a391b01f`）；候选 `bf127456…`、manifest `4958207f…`；放行前待客户逐 PR「允许我合并」；贪吃蛇恢复运行待协调方确认预算 |

## 三、状态更新记录

- 2026-11-09：修复路由 `4e8fb354…` 完成；B1 v1 `42a1ec9b…`；A′/B 修复记录完成并实施（确定性层完成）；D1 组合验证完成（`fdda222a…`）；RR4 第一次运行 S1 未达（taskId `#` 夹具错误）、S2 fail-closed 真机触发；协调方授权一次修正 S1；B1 v1.1 `682539ba…` 追加已知红附录。
- 2026-11-09：修正 S1 运行进行中（新副本/新 userData/9223；1 消息/≤1 卡/≤15 分钟/首果即停；不触碰 9222）。待 S1 完成后立即启动 B2。
- 2026-11-09：**S1 修正运行成功**（1 消息/1 卡/≈1m54s；客户接受、请求解决、流程继续、A′ 快照 6 文件实际字节一致；无「通道未受理」；S2 fail-closed 真机已触发；9222 零改动/9223 关闭）；D1/RR4 记录更新（`d6270956…`/`e561c38e…`）。**B2 = pass（48/48）**（`8af767e2…`）。变更包完成。待协调方确认贪吃蛇恢复运行预算。
