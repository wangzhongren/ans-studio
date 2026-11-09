# E3-R 放行记录：删除全部预知式门控（B2 v2 pass）

- **任务 ID**：`2026-11-08-remove-predictive-gates`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08
- **性质**：E3-R 放行记录——只表示**当前候选满足 B1 v1（独立验收 B2 v2 判 pass）**，不替代验收、不改变客户主权；按「全权委托」放行**提交/推送/PR/合并**；**发布/tag 除外未授权**。
- **判定依据（实测）**：
  - B1 唯一判据：`docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / 34,071 bytes / `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c`）。
  - **B2 v2（pass）**：`docs/acceptance/2026-11-08_remove-predictive-gates-report-v2.md`（186 行 / SHA-256 `7b310d1a549382b067d8027f1096ec3bfdd93ddb205a7d24d748cedd5b2f32ea`；**39 pass / 0 fail / 0 insufficient / 1 N/A**；v1 六项 insufficient 全部关闭；复用合规；`impl` 术语裁定接受；无返工/无安全旁路）。
  - B2 v1（历史）：`docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md`（183 行 / `6af7f394…`，insufficient 33/0/6/1；由 v2 取代其 6 项判定）。
  - 变更包 v1.1：`docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md`（191 行 / 32,468 bytes / `58a394cc198a0ac7c4b883c85e383e64944721ea77902954e6ed3d835b28b889`）。
  - 团队计划（冻结）：`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / 66,827 bytes / `911ff546…`）；派发/状态/I0：`docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`（102 行 / 25,872 bytes / `9befc89e…`）。
  - **候选**：44 文件（17 修改 + 27 新增 + 0 删除）；聚合 `787bd9109c6ce13f27eed4dbd396b0dc9a6fce26834b96c7f6c3e37391ff2475`；原 38 文件逐文件哈希 38/38 不变、38 子集聚合 `9462391e…`（产品零改动）；`src app test` manifest **1,105 文件 / `4b5ed42fff69013b66c09bff3820ca820512220ec8f5ca18756965d1ebe7a128`**；HEAD `3f249e2`（tree `728301d8…`）、分支 `feat/plan-escalation-card`、暂存 0。
  - 参照基线：第一变更 E3 T3 + 补证组合 **4,982 / 4,753 / 196 / 1 / 32**（`5cba2d54…` + `54c0db31…`）；组合复用结果 **5,037 / 4,812 / 192 / 1 / 32**（E3-F 5,032/4,807 + W7 5/5；未重跑 545 全量 T3，B2 v2 按 B1 §5.3 复用规则接受并披露）。
  - B0 豁免：`docs/communication/2026-11-08_waiver_baseline_session-admission.md`（18 行 / `d7a699d2…`；客户指令沿用覆盖本变更，不作正式 B0 重登记；B2 v2 接受）。
  - 闸门 1/2 留痕：`docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`（47 行 / `63a62a34…`）。

## 一、放行结论

- **B2 v2 判 pass**（39/0/0/1）；当前候选（44 文件 / `787bd910…`）满足 B1 v1。
- **放行范围**：提交 / 推送 / PR / 合并（本变更范围内，按「全权委托」）。
- **不在放行范围**：发布 / tag（客户另行指示）；任何超出本候选的代码/语义变更。

## 二、限制与披露（非阻塞，随提交/PR 记录）

1. **覆盖边界与术语裁定（B2 v2 接受）**：AC-1/AC-2 的「product 会话」以真实 roster 的项目实现角色 `impl` 执行（真实三文档/模块写集/任务 ACL；commit ACL 与 roleId 名称无关；sidecar `actorRoleId=impl` 如实记录）；AC-8/P1.2-AC-25 由等价服务链驱动（desktop `resumeDeferredRunChanges`/`executeOwnedRunStop` 为私有；关键 finalize 提交与 run transition journal 为真实原件）；custom provider 无法 disposed，成员终止用生产 `stopAndInspect` drain 快路径（B1 允许）。
2. **组合复用未重跑 545 全量 T3**：E3-F 于 38 文件候选取得（5,032/4,807/192/1/32）；W7 仅新增 6 个测试/夹具（产品 38/38 不变），其 `test/测试` 687/629/39/1/18（+5/+5、0 新失败/新 skip）、`test/编排` 1,122/1,098/22/0/2、typecheck 0；B2 v2 按 B1 §5.3 复用规则接受（组合 5,037/4,812/192/1/32），并已披露。
3. **RR 下一门（另案）**：真实 Claude `git_candidate` 被基线既有缺陷阻断（`src/provider/claude/session.ts:84` `__ans_call_context` × `src/provider/runtime/schema.ts:97-101` 顶层 `oneOf`/`additionalProperties:false`）；不在本候选 delta；本变更不修复；合并后按已披露后续项另立窄修复。
4. **B0 豁免沿用**：不作正式 B0 重登记；参照第一变更 E3 T3+补证；环境差异（e2e 300s/W29/W20/W47/Node runner 崩溃）已逐条分类披露。
5. **W7 运行期事故**：一次后台残留进程并发写结果已终止/清理，单实例哨兵+逐文件干净重跑；受影响文件隔离复跑 1/1 pass；B2 v2 独立复跑 5/5 接受最终干净证据。
6. **客户可见残余风险（Q1/Q3/Q6/Q7/Q12/Q16）**：审批放行的不透明 shell 可写 `.git`；其它 active 会话 foreign MCP/未封闭工具可在 lease 外写 `.git`（只进 optionalEvidence，不宣称阻断）；Claude/Pi 进程不可观测（停稳=Core/tracked drain）；sidecar 失败即拒绝、动作前拒绝仅诊断；结构化 Git 不弹客户卡；Q16 取代第一变更 `P1.3-B1-AC-26`/B1-EV3（q9/N15 断言已逐条改写）。
7. **发布/tag 未授权**。

## 三、提交分组计划（供沟通执行；按最终提交前的 `git status` 复核）

### A. 本变更产品/测试候选（44 文件，唯一候选）

> 以变更包 v1.1 §一候选表/证据 TSV 与 B2 v2 §1.2 为准；聚合 `787bd910…`、manifest 1,105/`4b5ed42f…`。**17 修改 + 27 新增，0 删除。**

**修改（17）**：
`app/desktop/session.ts`；`src/model/runtime.ts`；`src/pipeline/orchestration/run-role.ts`；`src/pipeline/orchestration/trunk-runtime.ts`；`src/provider/trunk/impl/git-command.ts`；`src/provider/trunk/public/trunk-store.ts`；`src/service/runtime/session.ts`；`src/service/trunk/impl/apply-journal.ts`；`test/runtime-core/git-capability-tools.test.ts`；`test/runtime-core/session-lifecycle.test.ts`；`test/桌面应用/chief-workflow.test.ts`；`test/测试/git-role-workflows-e2e.test.ts`；`test/测试/runtime-dispatch-gate-integration.test.ts`；`test/测试/session-admission-approval-q9-integration.test.ts`；`test/编排/rapporteur-module-consumption.test.ts`；`test/编排/stable-write-runtime.test.ts`；`test/编排/trunk-dispatch-parent.test.ts`。

**新增（27）**：
`test/runtime-core/codex-native-optional.test.ts`；`test/runtime-core/drain-predicate.test.ts`；`test/测试/git-action-activation-e2e.test.ts`；`test/测试/git-action-commit-claude-e2e.test.ts`；`test/测试/git-action-commit-pi-e2e.test.ts`；`test/测试/git-action-cross-runtime-audit-failure.test.ts`；`test/测试/git-action-cross-runtime-codex-init.test.ts`；`test/测试/git-action-cross-runtime-fixture.ts`；`test/测试/git-action-cross-runtime-init.test.ts`；`test/测试/git-action-cross-runtime-pi-init.test.ts`；`test/测试/git-action-delivery-claude-e2e.test.ts`；`test/测试/git-run-stop-host-continuation-e2e.test.ts`；`test/测试/git-write-chain-fixture.ts`；`test/测试/run-stop-host-continuation-integration.test.ts`；`test/编排/fixtures/git-action-authorization-wiring.ts`；`test/编排/git-action-authorization-gate.test.ts`；`test/编排/git-action-authorization-sidecar.test.ts`；`test/编排/git-action-authorization-wiring-audit-failure.test.ts`；`test/编排/git-action-authorization-wiring-document-audit-failure.test.ts`；`test/编排/git-action-authorization-wiring-document.test.ts`；`test/编排/git-action-authorization-wiring-initial-workflow-audit-failure.test.ts`；`test/编排/git-action-authorization-wiring-initial-workflow.test.ts`；`test/编排/git-action-authorization-wiring-publication-audit-failure.test.ts`；`test/编排/git-action-authorization-wiring-publication.test.ts`；`test/编排/git-action-authorization-wiring-retry.test.ts`；`test/编排/git-action-authorization-wiring.test.ts`；`test/编排/git-operation-sidecar-tolerance.test.ts`。

### B. 治理记录（本变更角色记录摘要，10 文件；排除原始证据目录）

- `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md`（`b6d4f688…`）
- `角色卡/编排/docs/change/2026-11-08_W2_remove-predictive-gates.md`（`fa166eed…`）
- `角色卡/编排/docs/change/2026-11-08_W3a_git-action-authorization-sidecar.md`（`6a07a922…`）
- `角色卡/编排/docs/change/2026-11-08_W3b_remove-predictive-gates.md`（`1547235e…`）
- `角色卡/桌面窗口/docs/change/2026-11-08_W4_remove-predictive-gates.md`（`210d2066…`）
- `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md`（`8d678fff…`）
- `角色卡/测试/docs/change/2026-11-08_W7_b2-gap-e2e.md`（`3fe62b90…`）
- `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`（含 D1-R1；`4e52a01f…`）
- `角色卡/测试/docs/change/2026-11-08_RR_remove-predictive-gates.md`（`c40011de…`）
- `角色卡/测试/docs/change/2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`）

**说明**：本变更**未改** shared-code / 门禁引擎 / 桌面UI / Claude/Codex/Pi 适配器 / 项目管理等其它角色文件（候选 A 无这些路径；角色记录仅上述 10 个）。上述记录对应的 `*_evidence/`、`*-evidence/`、`2026-11-08_W*_evidence/`、`2026-11-08_W7_b2-gap-e2e-evidence/` 等**原始证据目录不提交**（保留在工作树，供审计复取）。

### C. 管理文档（本变更，12 文件）

- `docs/communication/2026-11-08_intent_remove-predictive-gates.md`
- `docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`
- `docs/communication/memo.md`（M；本变更沟通备忘，按协调方指示纳入）
- `docs/planning/2026-11-08_design_git-write-init-approval-based.md`
- `docs/planning/2026-11-08_review_git-write-init-approval-based.md`
- `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`
- `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`
- `docs/scheduling/2026-11-08_change-package_remove-predictive-gates.md`
- `docs/scheduling/2026-11-08_status-e3_remove-predictive-gates.md`（本放行记录）
- `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`
- `docs/acceptance/2026-11-08_remove-predictive-gates-report-v1.md`
- `docs/acceptance/2026-11-08_remove-predictive-gates-report-v2.md`

### 排除项与理由

- **原始证据目录**：本变更各角色 `*-evidence/` / `*_evidence/`（W1/W3a/W3b/W4/W5/W7/D1/RR/E3-F）不提交——体积大、为复算原始件，保留工作树；B2 判定引用其哈希（已在 B/C 摘要与变更包/报告记录）。
- **第一变更文档/记录（已提交，不重复）**：`2026-11-08_session-admission-approval-*`（B1/B2/计划/派发/变更包/design/review/通信等）与第一变更角色证据——已在 `9bca68a`/`2ca434a`/`3f249e2` 基线内，不再纳入。
- **其它历史未跟踪文档/角色证据**（非本变更）：`docs/acceptance/{governance-authority-matrix,trunk-amendment-model}*`、`docs/communication/2026-11-04/05/07_*`、`docs/planning/2026-11-04/05_*`、`docs/scheduling/2026-11-04/05/07_*`、`角色卡/{Claude/Codex/Pi适配器,gates-code,shared-code,桌面窗口,测试,编排}/docs/change/2026-11-05/07_*` 等——属既有变更/历史留存，不属本变更候选或记录。
- **临时文件**：`.tmp-*`、`.pr-body-*`、`.commit-msg-*`、截图等——草稿，不提交。
- **T1 三文件**：已在基线（`afe70c62…`/`f0db260e…`/`358ac967…`），不属本变更 delta。

## 四、非阻塞后续项

1. **Claude MCP schema 缺陷（另案）**：`__ans_call_context` × 顶层 `oneOf`/`additionalProperties:false` 使真实 Claude 的 `git_candidate` 在 MCP 校验层失败（RR 下一门，基线既有、非本候选）；合并后另立窄修复（写集涉及 `src/provider/claude/session.ts` 与/或 `src/provider/runtime/schema.ts`，按角色边界与流程单独实施/验收）。
2. **发布/tag**：仍未授权；按客户后续指示。
3. **覆盖边界**：commit/delivery/activation/run-stop 的完整链已由 W7 确定性补证；真实模型路径（除 Claude MCP 缺陷外）与六角色闭环仍不在本变更承诺内。
4. **证据复取**：原始证据目录保留于工作树；如后续清理，先归档索引哈希（各记录已列）。

## 五、状态更新记录

- 2026-11-08：B2 v2 判 **pass**（`7b310d1a…`；39/0/0/1）；本放行记录写盘；放行提交/推送/PR/合并（发布/tag 除外）；提交分组 A（44）/B（10）/C（12）如上。
