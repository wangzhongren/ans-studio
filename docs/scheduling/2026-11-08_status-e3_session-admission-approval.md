# E3 放行记录与提交分组计划：会话创建准入改为「按操作审批」+ Git 只读/专属命令放行

- **任务 ID**：`2026-11-08-session-admission-approval`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08
- **性质**：E3-R 放行记录，依据 B2 v2 `pass`；**不是验收结论**；放行范围为提交/推送/PR/合并（依客户全权委托），**发布/tag 未授权**。本记录同时给出提交分组计划（A/B/C）供沟通执行。
- **B2 v2（pass）**：`docs/acceptance/2026-11-08_session-admission-approval-report-v2.md`（176 行 / SHA-256 `71b418791f7ba04aa137f3198f9a9afe8f358b2f41a3484d5bcea853baae1541`）；**35 pass / 0 fail / 0 insufficient / 6 N/A**；AC-2/AC-4 缺口关闭、证据复用合规、无代码返工、无安全旁路。
- **B2 v1（历史）**：`docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`（198 行 / `d49fa516…`，33 pass/2 insufficient/6 N/A；已由补证关闭）。
- **B1 判据**：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / `fb881126…`）。

## 一、放行候选身份

- HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`（tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`）；分支 `feat/plan-escalation-card`；暂存 0。
- **候选 39 文件**（`git status --porcelain -- src app test` = 42 项 = 候选 39 + T1 只读 3）；聚合 **`e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070`**（`<sha256>  <path>` 两空格、整行 `LC_ALL=C` 排序、行连接 SHA-256）；逐文件哈希见 B2 补证证据 `03-candidate-hashes.tsv`。
- 稳定性 manifest：`src app test` **1,078 文件 / `57087b8bd0d2a83af6fc59ab60ddb4be3004eb700187a813bd3401c834b862f5`**（补证运行前后 diff 0）。
- T1 只读三文件（不属本变更候选）：`src/common/claude-adapter/schema.ts`（`afe70c62…`）、`test/claude-adapter/session.test.ts`（`f0db260e…`）、`test/claude-adapter/schema.test.ts`（`358ac967…`）；聚合 `06cc75ca…`。
- 变更包：`docs/scheduling/2026-11-08_change-package_session-admission-approval.md`（181 行 / `127848cd…`）；派发/接口评审记录：`docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`（93 行 / `4fe9ac80…`）；团队计划：`docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`（449 行 / `ce30fad6…`）。

## 二、B2 v2 结论与放行范围

- **B2 v2 = pass**：35 pass / 0 fail / 0 insufficient / 6 N/A；AC-2（Pi + 项目角色 + `bindPreparedRole` + `session.open.ready`）与 AC-4（Claude/Pi 无 shell 的 ready + appTools 不含 shell）由补证测试（`test/测试/session-admission-approval-b2-gap-integration.test.ts`，3/3）关闭；证据复用合规；无代码返工、无安全旁路。
- **放行**：按客户全权委托，允许沟通执行**提交、推送、PR、合并**（本变更范围内）。
- **不放行**：发布/tag（客户未授权）；不替代客户对最终结果的知情（沟通按委托报告）。

## 三、限制与披露（放行附带，必须随提交/PR/B2 保留）

1. **B0 豁免**：客户指令跳过 B0 正式重记（`docs/communication/2026-11-08_waiver_baseline_session-admission.md`，18 行 / `d7a699d2…`）；B1 §B0-1–B0-5 豁免。豁免前测试角色已完成一次辅助 B0（`角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-baseline.md`，645 行 / `31e178b3…`），**仅参考、不作正式基线**；其 200 fail 与参考基线 198 的差异（chief-workflow 13→16、git-shell-acl 转绿等）已在 E3 报告逐条解释，**不得混用/不得作为 pass/fail 依据**。
2. **组合复用（未重跑 521 全量 T3）**：E3-F 全量 T3 在**原 38 文件候选**（`b62c7c7c…`）上完成（520 文件、4,979/4,750/196/1/32；新增确定性失败 0/新 skip 0）。B2 补证仅新增 1 个测试文件（39 文件候选 `e89716bd…`），产品/既有测试文件零变化；新文件 3/3、`test/测试` 673/615/39/1/18。**未在 39 文件候选上重跑 521 文件全量 T3**；B2 v2 已按 B1 复用规则接受该组合复用。此限制如实披露。
3. **参照基线非确定性**：与上一变更 E3 T3（4,872/4,641/198/1/32）逐条对照：193 一致、新增失败 2（application-line 顺序竞态、chief-workflow `unmanaged` ENOTEMPTY，均隔离复跑不复现）、消失 5（2 条设计 §4.5 点名既有红预期转绿：shell-gate readonly 裁定 A、shell-readonly git status；3 条参照侧非确定性/记账）。**新增确定性失败 0、新增 skip 0**。
4. **RR 限制**：AC-23 已真机达成（受保护项目 + 真实 Claude：父门受理→task.created→product 会话 `session.open.ready`→投递→product 回合；`runtime-creation-admission-unproven` 0 次）；AC-24 只读 `git status` 真机 0 卡、固定传输、审计字段齐全；**非只读审批卡未真机观测**（`touch` 被 write-guard 既有硬地板拒绝），按 AC-25 回退确定性证据、不宣称已真实验证；预算偏差（dispatch 2 次、驱动未在 48s 停止→10m04s、product 重复报告 2、CDP 关闭挂起）已如实记录，未追加预算/未重跑。
5. **T1 单列**：`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/schema.test.ts` 为**已验收的独立候选**，不属本变更；提交时单列（见 §四 A）。
6. **客户可见限制**：Q9（受保护项目角色 Git 写/初始化仍可能被注册表级 `inspectInitializationProtection` 拒绝，本方案不放宽）；F1（shell 只读 Git 不套用 `git_query` 的 readableOids/publication-proof，可读任意完整 OID/历史；`log` 默认 HEAD、`--all` 拒绝）；Q4 `deny-non-readonly`；Q10 无运行时回切开关（回切=回滚提交）；`protectedScope` 字段无生产者（O7 默认不做视觉）。
7. **桌面边界漂移（非本变更引入）**：`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/session.test.ts` 已被历史提交 `4c24149` 删除但 `角色卡/桌面窗口/boundary.md` 仍列；本变更未恢复/未新建；留待人事/治理后续处理。
8. **并行变更**：`2026-11-08-remove-predictive-gates` 已写团队计划/派发记录（自述未派发、串行前置为本变更）；其设计/计划/B1/派发文档不随本变更提交（见 §四 C 排除项）。

## 四、提交分组计划（供沟通执行）

### A. T1 独立候选（已验收，单独一提交）

```
src/common/claude-adapter/schema.ts          (M)
test/claude-adapter/session.test.ts          (M)
test/claude-adapter/schema.test.ts           (??)
```
- 不属本变更候选；建议提交信息独立标明 T1，不混入本变更。
- **需沟通核对**：T1 相关记录是否随 A 提交——`docs/acceptance/2026-11-07_claude-schema-fix-report-v1.md`、`docs/scheduling/2026-11-07_fix-routing_claude-schema-if.md`、`角色卡/Claude适配器/docs/fix/2026-11-07_fix_claude-schema-if-then.md`（+同名 evidence 目录按惯例排除）。

### B. 本变更产品/测试候选（39 文件；聚合 `e89716bd…`）

> 即候选聚合 `e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070` 的组成；逐文件 SHA-256 见 `角色卡/测试/docs/change/2026-11-08_B2-gap-integration-evidence/03-candidate-hashes.tsv`。

```
app/desktop/operator-channel.ts
app/renderer/src/chat/judge.ts
app/renderer/src/shell/ConfirmCard.tsx
src/common/shared/i18n/messages/en-US.ts
src/common/shared/i18n/messages/zh-CN.ts
src/common/shared/shell-approval-binding.ts
src/common/编排/shell-audit.ts
src/common/编排/shell-gate.ts
src/common/门禁引擎/classify-shell.ts
src/common/门禁引擎/shell-write-guard.ts
src/model/runtime.ts
src/pipeline/orchestration/run-role.ts
src/pipeline/orchestration/shell-arming.ts
src/provider/runtime/schema.ts
src/provider/runtime/tools.ts
src/provider/trunk/impl/git-command.ts
src/provider/trunk/public/trunk-store.ts
src/service/gate/shell-rules.ts
src/service/runtime/session.ts
test/runtime-core/git-capability-tools.test.ts
test/runtime-core/readonly-git-routing.test.ts
test/runtime-core/session-admission-approval.test.ts
test/桌面UI/judge.test.ts
test/桌面应用/operator-channel.test.ts
test/测试/session-admission-approval-b2-gap-integration.test.ts
test/测试/session-admission-approval-integration.test.ts
test/测试/session-admission-approval-q9-integration.test.ts
test/编排/readonly-git-transport.test.ts
test/编排/run-role-admission.test.ts
test/编排/shell-approval-wiring.test.ts
test/编排/shell-risky-order.test.ts
test/编排/shell-write-guard-injection.test.ts
test/门禁引擎/classify-shell.test.ts
test/门禁引擎/git-shell-acl.test.ts
test/门禁引擎/readonly-git-matcher.test.ts
test/门禁引擎/shell-rules-public-reexport.test.ts
test/门禁引擎/shell-write-guard.test.ts
test/项目管理/shared/i18n.test.ts
test/项目管理/shared/shell-approval-binding.test.ts
```

### C. 治理记录（本变更；按上次惯例排除 `*-evidence/` 原始目录）

**管理文档**
```
docs/communication/2026-11-08_intent_session-admission-approval-based.md
docs/communication/2026-11-08_gate-confirmation_session-admission.md
docs/communication/2026-11-08_waiver_baseline_session-admission.md
docs/communication/memo.md                    (M；含本变更与第二变更条目，见核对项)
docs/planning/2026-11-08_design_session-admission-approval-based.md
docs/planning/2026-11-08_review_session-admission-approval-based.md
docs/scheduling/2026-11-08_team-plan_session-admission-approval.md
docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md
docs/scheduling/2026-11-08_change-package_session-admission-approval.md
docs/scheduling/2026-11-08_status-e3_session-admission-approval.md（本文件）
docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md
docs/acceptance/2026-11-08_session-admission-approval-report-v1.md
docs/acceptance/2026-11-08_session-admission-approval-report-v2.md
```
**角色记录（.md；排除同名 evidence 目录）**
```
角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md
角色卡/shared-code/docs/architecture/shared-components.md   (M；W1 共享目录更新)
角色卡/门禁引擎/docs/change/2026-11-08_W3G_readonly-git-matcher.md
角色卡/运行时核心/docs/change/2026-11-08_W2W4_session-admission-runtime.md
角色卡/编排/docs/change/2026-11-08_W1bW2bW3b_shell-wiring.md
角色卡/桌面窗口/docs/change/2026-11-08_W5D_operator-card-entry.md
角色卡/桌面UI/docs/change/2026-11-08_W5U_operator-card-entry.md
角色卡/测试/docs/change/2026-11-08_D1_cross-role-integration.md
角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md
角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md
角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks_session-admission.md
角色卡/测试/docs/change/2026-11-08_B2-gap-integration.md
角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-baseline.md   (辅助 B0/客户豁免，仅记录)
```
**排除（本变更 C 不包含）**
1. **全部 `*-evidence/` 原始目录**（体积大；按上次治理提交 `a1b2f66` 惯例）：`角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-evidence/`（564 文件）、`2026-11-08_D1_cross-role-integration-evidence/`（含 `post-fix-logs/`）、`2026-11-08_RR_real-claude-minimal-evidence/`、`2026-11-08_E3-T3-full-regression-evidence/`（590 文件）、`2026-11-08_E3-scans-and-checks_session-admission-evidence/`、`2026-11-08_B2-gap-integration-evidence/`；以及历史角色 evidence 目录。
2. **第二变更 `remove-predictive-gates`（随其提交）**：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`、`docs/planning/2026-11-08_review_git-write-init-approval-based.md`、`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`、`docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`、`docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`、`docs/communication/2026-11-08_intent_remove-predictive-gates.md`、`docs/communication/2026-11-08_gate-confirmation_remove-predictive-gates.md`。
3. **历史/前置变更遗留（非本变更）**：`docs/acceptance/2026-11-07_direct-role-capabilities-closeout-report-v1.md`、`docs/acceptance/governance-authority-matrix-*`、`docs/acceptance/trunk-amendment-model-*`、`docs/communication/2026-11-04/05_*` 系列、`docs/planning/2026-11-04/05_*` 系列、`docs/scheduling/2026-11-04/05_*` 与 `trunk-amendment-model-change-v1/v2.md`、`2026-11-07_*` 系列、各角色历史 `docs/change|fix` 目录等（均为上一变更或更早未提交记录，另行处理）。
4. **T1 记录**（随 A 或单列，见核对项）：`docs/acceptance/2026-11-07_claude-schema-fix-report-v1.md`、`docs/scheduling/2026-11-07_fix-routing_claude-schema-if.md`、`角色卡/Claude适配器/docs/fix/2026-11-07_fix_claude-schema-if-then.md`。
5. **上一变更迁移步骤的未暂存删除**：`角色卡/项目管理/docs/architecture/shared-components.md`（D）——属上一变更 §6.4 的 PM 删旧副本动作，建议随上一变更收尾或第二变更前处理，不混入本变更 C。
6. **临时文件**：`.tmp-*`、`.commit-msg-*`、`.pr-body-*`（非治理记录，不提交）。
7. **memo 说明**：仅 `docs/communication/memo.md` 有改动（含本变更与第二变更条目）；`docs/planning/memo.md`、`docs/scheduling/memo.md` 当前无改动（如需补本变更条目，由沟通决定后再提交）。

## 五、非阻塞后续项

1. 若客户要求「非只读→审批卡」真机证据：修复 RR 驱动停止条件后另行授权一次最小预算，使用非写类型非只读命令（如 `npm test`/脚本类 review）；本轮不追加。
2. O7 受保护项目卡面标识（`protectedScope` 生产/展示）未做，客户选择后再接线。
3. 桌面边界漂移（`operator-wiring.test.ts`/`session.test.ts` 已删但 boundary 仍列）交人事/治理修正。
4. 外部/项目级 v3 规则集 pin 在 v4 下 fail-closed（如实设计）；如需兼容另行变更。
5. 并行变更 `remove-predictive-gates` 待本变更提交后按其计划启动（串行前置）。

## 六、状态

- **E3-R 放行记录已写盘**；B2 v2 `pass`（`71b41879…`）；候选冻结 39 文件（`e89716bd…`）、manifest 1,078（`57087b8b…`）。
- 放行到提交/推送/PR/合并（发布/tag 除外）；提交分组 A/B/C 及排除清单见 §四；**需沟通核对项**见 §四 A/C 与 §四 排除 7。
- 本记录不判验收、不授权发布/tag；B2 由独立验收判定（已 pass），最终交付报告由沟通按委托向客户提交。
