# 沟通工作线索

- 2026-10-22 客户提出「我需要使用ans 技能来管理这个项目」。已写[闸门 0 意图记录](2026-10-22_intent_ans-skill-managed-project.md)；客户明确选择 **A 保留现有角色**（接入内置五角色管理流程，保留现有 worker 角色卡；项目管理/独立验收暂不迁移）。闸门 0 已通过。
- 2026-10-22 客户提出「把验收必须先判断风险档位的口径固化到项目规则或验收角色卡」。已写[闸门 0 意图记录](2026-10-22_intent_acceptance-risk-tier.md)，落点 `角色卡/项目管理/docs/project-rules.md`；[团队计划](../../scheduling/2026-10-22-acceptance-risk-tier.md)已写盘，客户闸门 2 确认「确认计划」。
- 结果：工程法案 §二第 9 条「验收先判风险档位」与 2026-10-22 变更记录已写入；独立验收按标准 v1 判定 **通过（A1–A9 全部 pass）**，报告见[验收报告](../../acceptance/2026-10-22_acceptance-risk-tier-report.md)。候选 `fdb738bb...` / `fdc50559...`；T3；无代码/测试面，全量回归 N/A。
- 2026-10-22 客户提出「1，5优化，其他的暂时不改」并追加「3 也加一下」：优化 ANS 技能对照差异的第 1 项（统筹提团队计划/边界，Crew 只写卡）、第 3 项（验收先写标准、按 T0–T3 风险分档、复用证据）和第 5 项（Crew 写卡补能力/工作流描述）；第 2、4 项及其余差异暂不改。已写[闸门 0 意图记录](2026-10-22_intent_governance-split-1-3-5.md)，闸门 0 已按客户明确指令确认。
- 2026-10-22 闸门 1 已确认：客户选择「确认，按推荐项」；方案 [2026-10-22_design_governance-split-1-3-5.md](../../planning/2026-10-22_design_governance-split-1-3-5.md) 草案 v1 + §13 Q1–Q12 推荐 A / §9.8 O1–O5 推荐项。
- 2026-10-22 闸门 2 已确认并授权实施：团队计划 [2026-10-22-governance-split-1-3-5-team-plan.md](../../scheduling/2026-10-22-governance-split-1-3-5-team-plan.md)；6 个现有 worker + 内置独立验收/统筹，无角色/边界变更，T3；默认不新建 `test/桌面应用/` 文件。
- 2026-10-22 实施前验收标准已写盘冻结：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（19 条，T3；blob `85f50a7b…`，SHA-256 `e97eadec…`）。测试角色基线证据已在 `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-baseline-evidence/`。
- 2026-10-22 阶段 A 基线 + 阶段 B Model/Provider 已完成：4 个候选文件哈希由统筹复核一致，定向测试 11/11、typecheck 0，无新增红。
- 2026-10-22 阶段 C 门禁引擎 + 编排已完成：关键候选哈希复核一致，`app/**` 零改动；门禁 305/304/0/1、编排 735/734/1（唯一红为基线 EPERM）、typecheck 0。
- 2026-10-22 阶段 D 桌面窗口 + 桌面UI 已完成授权写集：5 个源码候选哈希复核一致，`test/桌面应用/` 无新建文件；四个精确测试 198/198、`test/桌面UI/**` 163/163、typecheck 双 0。补充写集 `test/桌面应用/dispatch-delivery.test.ts`（已在桌面窗口 Section 1）修复夹具后 52/52，hash `73bdb768…`，阶段 D 收口。
- 2026-10-22 阶段 E 已放行：测试角色更新 `real-entry` 断言、T3 全量回归、真实启动/演示、canonical e2e；完成后交变更包给内置独立验收。
- 2026-10-22 阶段 E 完成（`verified-by-tests-only`，未宣布验收通过）：变更包 `docs/scheduling/governance-split-1-3-5-change-v1.md`（hash `fa2d6a…` / sha `551780…`）；候选 53 文件（清单 `743f41…` / `2ca97b…`）；串行全量 3448/3421/9/18（9 项均基线 EPERM）；typecheck 双 0、build 0、canonical e2e 154/154、Electron E2E_PASS、governance demo DEMO_PASS。并行全量有 1–2 个桌面测试并发偶发，隔离复跑通过。
- 2026-10-22 独立验收结论：**通过（当前候选）**。报告 `docs/acceptance/governance-split-1-3-5-report-v1.md`（blob `6de76394…` / SHA-256 `921f3014…`）；P1–P15/G1–G4 全部 pass；53 文件哈希复算 mismatches=0；T3 全量 9 项均为基线 EPERM。残余观察：并行偶发、`write-sequencing` 一次挂起、真实在线模型未验证；G2 补充写集已补记到闸门 2 记录。
- 2026-10-22 客户明确要求提交本次工作树改动（53 个产品/测试候选 + 治理/验收/角色记录）。验收通过本身仍不授权推送、合并或发布；提交由客户本次指令单独授权。
