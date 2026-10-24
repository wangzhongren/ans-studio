# 统筹调度备忘录

本文件只记录统筹的续接线索和已核事实，不是任务状态、不是角色定义，也不写其他角色的文档。

## 2026-10-23

- 已写三份团队计划（闸门 2 未确认、实施授权未给、未派发、未实施）：
  - `docs/scheduling/2026-10-23-i18n-team-plan.md`（任务 `2026-10-23-i18n`，flowId `i18n`，T2）
  - `docs/scheduling/2026-10-23-directory-ownership-team-plan.md`（任务 `2026-10-23-directory-ownership`，flowId `directory-ownership`，T3）
  - `docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`（任务 `2026-10-23-governance-advance-redispatch`，flowId `governance-advance-redispatch`，T3；方案 A/Q1–Q8 已由客户在闸门 1 确认）
- 基线：`main` / `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`。写 i18n/目录计划时工作树只有既有 memo 修改与未跟踪管理文档；写治理写卡推进计划时（2026-10-23）工作树已有目录 v3 实施候选（独立验收报告判定“通过（当前候选）”、未提交）与 i18n B0/B1–B4 key/契约相关改动（未提交、验收未完成）。无 `.ans/project.json`（未启用 task_ops）。
- 治理写卡推进计划（T3）已核：五维「不变，派现有角色」；参与编排（`flow-service.ts`/`flow-state.ts`/`test/编排/flow-service.test.ts`）、桌面窗口（`interface.ts`/`governance-advance.ts`/既有精确测试）、测试（`test/测试/governance-e2e-auto/`）、内置验收、统筹；无角色/边界变更。已发现 `src/pipeline/orchestration/flow-state.ts` 只在 `角色卡/编排/boundary.yaml`、未在权威 `boundary.md`（既有 Markdown/YAML 漂移），列为闸门 2 条件；`test/桌面应用/` 逐文件授权、不得新建文件；`acceptance-dispatch.test.ts` 当前工作树 md 已由目录 v3 补入（条件改）；共享 `interface.ts`/`governance-advance.ts`/`interface.test.ts` 必须等 i18n 冻结后串行写。
- 下一步：交沟通向客户确认三份计划的闸门 2；客户实施授权另行取得；实施前验收标准由内置独立验收写 `docs/acceptance/{i18n,directory-ownership,governance-advance-redispatch}-criteria-v1.md`。本上下文待续接，不自行向客户确认或扩大授权。
- 闸门 0/1 记录（i18n/目录）：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（客户「都确认，按推荐」）；方案：`docs/planning/2026-10-23_design_i18n.md`、`docs/planning/2026-10-23_design_directory-ownership.md`（v1）。闸门 0/1 记录（治理写卡推进）：`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`（方案 A + Q1–Q8）；方案：`docs/planning/2026-10-23_design_governance-advance-redispatch.md`（v1，299 行；SHA-256 `f3f75f28…d28341`；blob `9223448f…9fef`）。
- 五维结论（i18n/目录）：两变更均为「不变，派给现有角色」，无角色/边界变更，默认不派人事/装配；i18n 的装配（`vite.config.ts`）与 UIUX 为条件项。
- 共享文件排序（i18n/目录）：i18n B0 → 目录授权全部 → i18n B1/B2/B3/B4；`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts` 不得并发写。治理写卡推进排在 i18n 对上述共享文件停写之后。
- 边界缺口更新：目录 v3 变更已在工作树 `角色卡/桌面窗口/boundary.md` 补入 `acceptance-dispatch.test.ts`/`runtime-resolution.test.ts`，此前漂移在该候选内闭合；`src/pipeline/orchestration/flow-state.ts` 仍只有 `boundary.yaml` 条目、权威 md 未覆盖，已列为治理写卡推进计划的闸门 2 条件。（2026-10-23 复核：该文件 md 第 12 行已列单文件，漂移已在目录 v3 候选内闭合。）
- 2026-10-23：i18n（变更 A，T2）I10 变更包已写盘 `docs/scheduling/i18n-change-v1.md`（98 个产品/测试候选，含补入的 `test/桌面应用/boundary-refresh.test.ts`；候选表前后哈希一致）；I9 `verified-by-tests-only`、三项阻塞关闭；待独立验收，本包不判通过/返工。
- 2026-10-23：已写第四份团队计划 `docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（任务 `2026-10-23-acceptance-rework-routing`，flowId `acceptance-rework-routing`，T3，389 行，SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`；方案 v1 951 行/SHA-256 `9ceea642…`，闸门 1 已确认 Q1–Q13 A、O1–O4 不做）。闸门 2 未确认、实施授权未给、未派发、未实施。
- 五维结论（验收返工路由）：**不变**，5 个 worker（编排、桌面窗口、运行时核心、项目管理、测试）+ 内置独立验收 + 统筹；**无新增角色、无边界变更**。关键校正：`app/main.ts` 按权威 Section 1 属桌面窗口，不属装配（方案 §6.1/§7.1 标签），交闸门 2 确认。`src/pipeline/orchestration/flow-state.ts` 已在 md 覆盖；`test/桌面应用/acceptance-dispatch.test.ts` 等逐文件覆盖（依赖目录 v3 候选 boundary 条目，S1 预检；若未落地则停止派发）；无未覆盖路径。
- 验收返工路由的基线：前三项变更（i18n、目录 v3、治理写卡推进）均已验收但未提交，作为冻结基线；共享 `interface.ts`/`governance-advance.ts`/`customer-input.ts`/`app/main.ts`/i18n messages 串行写；S1 重测全量基线（最近 356 文件/3693/3666/9/18）。下一步：交沟通闸门 2；实施授权另行；标准由内置独立验收写 `docs/acceptance/acceptance-rework-routing-criteria-v1.md`。
- 2026-10-23：验收返工路由（T3，v1.7.0）I10 变更包已写盘 `docs/scheduling/acceptance-rework-routing-change-v1.md`：21 个产品/测试候选（相对 HEAD 新增 6、修改 15；本变更新建 3），候选表前后复算一致（快照 SHA-256 `30deb89e…`）；闸门 0/1/2 + 实施授权以沟通记录 `b4bc67b7…` 为准（团队计划/标准状态头为过期状态）；S7 `verified-by-tests-only`（e2e 10/10×3、受影响 2813/2793/5/15、T3 3790/3763/9/18、typecheck/build 0、Electron 2/2、目标零写入），目标现场 59 步/751 条与账本第 646 行 `unclassified/none` 未结算决定已记录；待内置独立验收判 P1–P12，本上下文不判通过/返工。
