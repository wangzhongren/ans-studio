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

- 2026-10-29：**F 证据修订最终值（本 memo 提交前）**：HEAD `ac44b53dd1679cf3920226dc394f8b4525d9d21e`，tree `9cf6024be2a71c8d7eb06aa03b80c8d9f7d604d0`；change-F **573 行 / `ed117a883d00041197d0a374a3c657a365a823cecc0e5503159a4792ce801d08`**；终态报告 **109 行 / `7956398a5cd5dd2108f7fb45c3119578f23890049b694b4ff8a79b44e62f1ea4`**；308 文件表与统计按被判定候选 `044811f4`（308=87 A+125 D+96 M，tree `8dcbdb8d…`，diff `34b5d221…`），rework 仅文档、代码/测试不变；本 memo 提交后的最终 HEAD 见回执。

## 2026-10-31

- 已写团队计划 `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（任务 `2026-10-31-shell-deny-customer-escalation`，flowId `shell-deny-customer-escalation`，T3）。基线 HEAD `9f670fb`（已合并 main `32d8f0d`/v1.8.3）；工作树写计划前仅三份未跟踪输入文档；无 `.ans/project.json`（未启用 task_ops）。
- 输入基线：闸门 0/1 记录 `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（含闸门 1 记录后 57 行 / `51c1a967…`；方案头引用的 49 行 / `74e0596c…` 为追加前快照）；客户确认方案 v1.3 **857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`**（实测一致）；复核记录 **148 行 / `617d9a7f…`**。
- 五维结论：**不变 + 改边界（3 项精确条目）**。实施角色：门禁引擎（A2 白名单谓词/写守卫/Service 出口/文案）、编排（B1 registry/闸/审计/回执/arming/run-role）、运行时核心（A1 模型契约/新工具/schema）、桌面窗口（C1 升级卡 presenter/仲裁/暂停 IPC/preload）、桌面UI（C2 多动作卡/暂停 UI）、项目管理（A3 i18n key+计数）、测试（D1/D2 集成/T3 全量/真实 E2E）；内置独立验收 V1/E2；统筹 G2/E1/E3；**装配本轮不参与实施**（新小版本发布另议）；不启用项目 `角色卡/独立验收` worker。
- §4.5 边界变更（闸门 2 对象，人事执行）：B-1 门禁引擎 `boundary.md` 补 `src/service/gate/shell-rules.ts`（yaml 已列、md 漂移）；B-2 编排 `boundary.md` 补 `src/pipeline/orchestration/shell-arming.ts`（yaml 已列、md 漂移）；B-3 桌面窗口 `boundary.md`+`boundary.yaml` 新增 `test/桌面应用/shell-escalation.test.ts` 精确条目（逐文件授权）。与本写集无关的既有漂移（编排 `pm-reviewer.ts` YAML-only）不校正。
- 阶段：G2 → H1/V1/B0 → A1/A2/A3（并行）→ B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3；契约先行（A1/A2/A3 冻结）、共享文件单写者；`test/桌面应用/e2e/` 不得新建脚本（仅扩展 `main.mjs`）。
- 发布：按方案建议新小版本、不用 overlay；本任务不写 `release-policy.mjs`/`package.json`/workflow；发布另行授权。
- 下一步：交沟通向客户确认闸门 2；实施授权另行；实施前标准由内置独立验收写 `docs/acceptance/shell-escalation-criteria-v1.md`。本上下文待续接，不自行向客户确认或扩大授权。

## 2026-11-01

- 已写团队计划 `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（任务 `2026-11-01-acceptance-evidence-path`，flowId `acceptance-evidence-path`，T2；**431 行 / SHA-256 `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`**）。基线 HEAD `eb77fad`（方案标注；main `a187d59` 含 PR #29 合并 `b7586ce`，目标文件内容与 HEAD 一致）；写计划前工作树仅 3 份未跟踪管理文档；无 `.ans/project.json`。
- 输入：闸门 0/1 记录 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（61 行 / `47b9b707…`；闸门 0 快照 53 行 / `e97b978b…`）；客户确认方案 P1.2 **396 行 / `355cbf1c…`**；复核记录 **124 行 / `25bc602e…`**（完整复核 F1–F11 + 窄复核 F1–F4/N1，无阻断项）；客户闸门 1 原话「确认闸门 1 修复方案（T2，含方法 A 验证授权）」。
- 五维结论：**不变 + 改边界（1 项精确条目）**。角色：桌面窗口（`app/desktop/session.ts` + 新增 `test/桌面应用/acceptance-proposal-path.test.ts`）、编排（`src/common/编排/governance-judge-facts.ts` + 新增 `test/编排/governance-judge-facts.test.ts` + 更新 `test/编排/acceptance-judge-minimal.test.ts`）、测试（B0/D1/D2 真实方法 A 回归）、人事（B-1 边界条目）、内置验收（V1/E2）、统筹；装配/项目管理（shared）默认不参与。
- **与方案 §7 角色标签的不一致（已在计划 §10.3 记录）**：§7 把三个测试都归「测试」、把 `intent-entry-contract.ts` 归「运行时核心/编排共享」；按实际 Section 1，`test/桌面应用/` 归桌面窗口逐文件、`test/编排/` 归编排、`src/common/shared/` 归项目管理。计划按实际边界分配；写集 5 文件不变。
- 边界变更 B-1：桌面窗口 `boundary.md`+`boundary.yaml` 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目（闸门 2 后人事执行）；其余 4 文件在既有目录授权内。
- 阶段：G2 → H1/V1/B0 → A1/A2（并行）→ D1（跨模块回归）→ D2（真实试跑方法 A：别名移出/还原 + 新 request.resolved/judge.evidence）→ E1 → E2 → E3。AC-8 只以方法 A 为充分证据；方法 B 仅补充；不关闭「替我决策」取证。
- 发布/提交：不 commit/push、不发行；提交/推送另行授权；不写发布/构建面。
- 下一步：交沟通闸门 2；实施授权另行；V1 由内置验收写 `docs/acceptance/acceptance-evidence-path-criteria-v1.md`。本上下文待续接，不自行向客户确认或扩大授权。
