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

## 2026-10-29

- entry-role-minimal **F 批（终态收尾，T3）** 实施完成并本地提交 `e008187`（父 `9a23b88`）：`@ts-nocheck` 物理清理（interface 13715→2389、session 6936→6116）、旧 liaison shim 清理、新增 `optional-acceptance` 4 tests、`i-full-chain` 收口 2 tests。规范全量 **2908/2878/12/18**（`18a44152…`；相对 E +5/+5/0/0），双 typecheck/build 0（`aee16865…`/`914780f6…`/`ff7f1dd0…`），真实 Electron `E2E_PASS=true` 17 PNG（`2b73e5f6…`），phase3b 45 checks、phase5a 30/30；D-04 `rg` 0；主检出前后快照一致。change-F `docs/scheduling/2026-10-28-entry-role-minimal-change-F.md`；终态报告 `docs/acceptance/entry-role-minimal-final-report-v1.md`；三条处置 `docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md`。**F 文档提交见最终报告回执**；不 push/合 main。下一步：独立验收终态判定（另写 `entry-role-minimal-final-acceptance-report-v1.md`），本上下文不代判。

- 2026-10-29：entry-role-minimal F 批最终回执——代码/测试 `e008187`（整树 `70412769a5b1876c289738d0793720422be5c557`）；文档 `4a6ebfb`（15 files / +478）；change-F **256 行 / sha256 `4f9118bd4bd73c46e862ec2938aba31bb3b3e88c77c7cef808048e384594bd5a`**；终态报告 `docs/acceptance/entry-role-minimal-final-report-v1.md` **82 行 / `e8df25dfd2eae113f36a1007d441467d6f968eada578ca07f945282a95aa84e2`**；三条处置 **32 行 / `50fe20ca779a2d1bf40c7e960731af15279a97cfb8ddfb53c8ac35ef51b483c4`**；`9a23b88..4a6ebfb` = 21 files（9 A + 12 M）/ +1121 / −12501，整树 `53c444cb6e1611b32389b70af1c5a1539465d8f3`；package/lock 零 diff；主检出前后快照一致；不 push/合 main。本文件提交后的最终 HEAD 见提交回执。

- 2026-10-29：**entry-role-minimal 终态 rework 证据修订**（FIN-01/09/10 + FIN-07 + test-only @ts-nocheck）——终态报告升级为最终组合候选 `8fc673e..044811f4` 实测 **308 files = 87 A + 125 D + 96 M，+13594/−131336**、整树 `8dcbdb8d…`、完整 diff `34b5d221…`；change-F §10 补 **308 文件逐文件 blob/sha256 表**（行数/状态核对 308=87+125+96）；终态报告补 **C1–C16 代价清单** 与 test-only `@ts-nocheck` 例外登记（`test/测试/redispatch-target-recompute.ts`，非测试收集、依赖已删 fixture、不影响生产 typecheck）。rework 文档提交前：change-F **573 行 / `ec37eec2bf5e9ec37ec22f333e12f9c5cc103020ddec26badee77bf4e0ba2979`**；终态报告 **109 行 / `f0039bd87b7f89a91521ec6de09304f4f233500fb280c397582353c54387d806`**（提交后的最终 HEAD/哈希见回执；本修订只改 change-F/终态报告/memo，代码/测试不变，全量/E2E/静态证据保持）。

- 2026-10-29：主检出零写入口径澄清——实现侧 F 全程未写主检出（前后 status/HEAD/diff/index/stash 全同）；主检出后续唯一 delta 为独立验收角色写入的 `docs/acceptance/entry-role-minimal-final-acceptance-report-v1.md`（非实现侧写入）。
