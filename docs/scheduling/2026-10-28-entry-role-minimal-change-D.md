# entry-role-minimal 批次 D：治理机器撤除（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：D（治理机器撤除）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 §8（D-01–D-09）。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地逐批提交，不 push、不合并 main。
- 依据：C 批已判 pass（v1 报告 122 行 / `945623f8…`，候选 `d364ea6931a7bdf2388caf8855d7af36e09bd2a7`）；D 批放行口径（Delta-2/3/7 已确认，A 口径；方案 §16、团队计划 §4.4、amendment-1/2）。
- D 实施提交：**D1 `c2b6cf97d2ea59f3cd239a2b0f39b2b36ff188ec`**（核心撤除）、**D2 `98d3fe2f59cedd7fe1c78b5387a4ebaf9ed846ce`**（桌面/UI 撤除）；D3 证据提交 `4c2414909d4336a5e2a259b513ad16c74a899571`；最终文档提交见最终报告（本文件在 D3 内）。
- 代码树哈希（git diff --binary）：D1 = `ecd8bedae2f8470ce81b2512dff1c87dce89871c3d52f84aeafef56473c11f2b`；D1+D2 = `ecb3afdd3b08a1392199757ce5506be1f1f7bba2c6e7a5f1d3a3cc229ff0f0e8`。D3 最终全树哈希由最终报告记录。

## 1. 批次目标与生效口径

- **撤除治理机器**：gate、flow 状态/工具、ledger、证据包中的流程/账本事实、team-plan、验收分诊/返工路由、directory-conformance、governance migration、record lock、governance handoff、Liaison 身份/别名。
- **撤除工具面**：`write`、`schedule-write`、`flow_get`、`flow_step_update`、`flow_step_supersede`、`request_acceptance`、`request_gate_review`、`request_boundary_change`、`hand_off_intent`、`request_clarification`、`report_artifact_ready`、`propose_recovery`；`request_confirmation` 仅保留 `appointment-write`。
- **写区切换（目标态）**：

| 角色 | Section 1 目标写区 |
| --- | --- |
| 幕僚 chief | `docs/intents/` |
| 产品 product | `docs/product/` |
| 策划 rapporteur | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` |
| 人事 nominator | `角色卡/**`（appointment-write 逐次审批）、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` |
| 运营 convener | `docs/scheduling/`、`docs/governance/convener/` |
| 质检 verifier | `docs/quality/`、`docs/verification/`、`docs/governance/verifier/` |

- **能力位**：convener 不再有 dispatch/role_status/session_tail；星形派发/看护/终止/重派只给幕僚（single/su 旧行为保留）。
- **judge**：facts 只从任务/申请上下文构造；旧账本快照参数被忽略；Q4 A rubric 与两开关语义保留；approval 组仅 `appointment-write`。
- **single-su/CLI/适配器**：single/su 角色模型与 `ans govern` 保留（Delta-2 A 口径）；适配器/运行时核心的边界、流式、工具注册语义不变。
- **规则**：Delta-7 仅改项目规则 §二.13/15/16；§二.9/11/12 不变。

## 2. 生产代码删除（23 个文件）

- `app/desktop/artifact-report.ts`
- `app/desktop/boundary-change.ts`
- `app/renderer/src/chat/extensions/governance.ts`
- `app/renderer/src/chat/flow-status.ts`
- `app/renderer/src/chat/governance-view.ts`
- `app/renderer/src/driver-extensions/governance.ts`
- `app/renderer/src/shell/FlowStatusPanel.tsx`
- `app/renderer/src/shell/GovernancePanel.tsx`
- `app/renderer/src/stores/flow-status-store.ts`
- `app/renderer/src/stores/governance-store.ts`
- `src/common/编排/acceptance-rework.ts`
- `src/common/编排/acceptance-triage-record.ts`
- `src/common/编排/acceptance-triage.ts`
- `src/common/编排/directory-conformance.ts`
- `src/common/编排/flow-service.ts`
- `src/common/编排/flow-state.ts`
- `src/common/编排/governance-gate.ts`
- `src/common/编排/governance-handoff.ts`
- `src/common/编排/governance-ledger.ts`
- `src/common/编排/governance-migration.ts`
- `src/common/编排/governance-record-lock.ts`
- `src/common/编排/team-plan.ts`
- `src/pipeline/orchestration/flow-state.ts`

## 3. 关键实现点

- `src/model/runtime.ts`：删除 flow/handoff/clarification/gate/acceptance/report-artifact/propose-recovery 类型与 `GovernedToolsOptions` 字段；`GovernanceConfirmCardKind = "appointment-write"`；`write`/`schedule-write` 从枚举与 schema 删除；`flowId` 仅保留为 C 批申请归属键。
- `src/provider/runtime/{tools,schema}.ts`：删除已撤除工具的函数/注册/常量/中止分支；`CONFIRM_CARD_KINDS = ["appointment-write"]`；schema 文案改为六角色最小系统。
- `src/common/门禁引擎/governance-roles.ts`：六角色注册表与 D 卡文本；写区/能力位按目标态；Liaison 别名、卡文本、职能删除；Nominator 卡保留 boundary 最小模板以配合写前结构校验。
- `src/pipeline/orchestration/run-role.ts`：删除 flow 工具注入、gate/ledger、team-plan/directory 守卫、Liaison 别名、write/schedule-write 分支；`TRIO_CARD_KINDS`/`GOVERNANCE_CONFIRM_CARD_KINDS` 收敛；judgeContext 只从申请上下文构造。
- `src/pipeline/orchestration/govern-session.ts`：删除已撤除模块 re-export/Liaison 分支；治理提示改为 D 最小文案；保留 `ans govern` CLI 路径。
- `src/common/编排/governance-judge-{facts,intent,evidence,verdict}.ts`：facts 不读账本/flow；意图只从显式 intentId/提案 frontmatter/`docs/intents/<flowId>.md` 定位；证据不解析 flow 步骤/团队计划；approval 仅 appointment-write。
- `src/common/runtime-core/shell-judge/policy.ts`：`.ans` 只读开放仅 `.ans/project.json`；账本/`governance` 目录不再开放。
- `src/service/role/resolve-role.ts`：trio 证据改为 `.ans/state/tasks.jsonl`（B 任务主干）；旧 Liaison 目录按退休保留 id 跳过；Liaison 职能删除。
- `app/main.ts` / `app/preload.cjs`：删除治理记录、flow:status、恢复确认、分诊呈现 IPC/桥；`focus/show` 只重推 shell 卡。
- `app/renderer/**`：删除 flow/gate/ledger/acceptance 面板/视图/store；新增最小 `chat/card-meta.ts`；ChatHeader/WorkOverview/ChatStream 移除治理提示。
- `角色卡/项目管理/docs/project-rules.md`：§二.13/15/16 D 修订，§二.9/11/12 不变。
- `src/common/装配/release-policy.mjs`：移除已删除旧团队计划模块的 v1.7.0 overlay 条目（避免 release prepare 引用不存在文件）。

## 4. C-11 小修（change-C）

- §10 C-listed 编排/judge/门禁集计数更正为 **304 tests / 303 pass / 1 fail**（失败为 Claude 适配器 symlink 基线）。
- 全量命令口径补记：`find` **枚举 425 个 `*.test.ts`**，排除 `write-sequencing.test.ts` 后**实际执行 424 个**。
- C 证据提交后的 change-C SHA-256 记录为 `f75f2ac54effa675c3d3143fde39a7a53bebf3f18aa46de8e48401b7b38d94ad`（182 行）；D 修订后的最终字节哈希由最终报告记录。

## 5. 验证（D 出口）

- **全量**（与 C 同口径，`--test-concurrency=1`，排除 `write-sequencing.test.ts`）：**2817 tests / 2787 pass / 12 fail / 18 skip**；C 基线 4569/4535/15/19。12 fail 全部为基线既红（9 条 Windows symlink + T1 pi/codex/claude×3）；**新增确定性失败 = 0**；**无新 skip**（C 的 19 条中 1 条随已删治理测试消失）。日志 `%TEMP%\d-full-final2.log`（sha256 `745c3de4a3bdf14f25041f0ebed6923bbb159bf9eb6a56e3a35b6c5cff204dd1`）。
- **测试变化**：删除 115 个旧测试文件（逐文件登记见 §7）；恢复并改造 6 个仍适用的测试文件（合计 59 tests：`handback-delivery` 18、`real-entry` 16、`tool-error-view` 4、`write-safety` 5、`judge` 7、`release-packaging` 9）；新增 D 专项 `test/测试/entry-role-minimal-d.test.ts` 4/4（写区/能力矩阵、工具面、judge facts、D-04 残留扫描）。日志 `%TEMP%\d-special.log`（sha256 `a2becc0320f74ac65aaae23cb28ac01d6650b983c964deae2cad05429ea27422`）。
- **D-04 rg**：`rg -n "governance-gate|governance-ledger|flow_get|flow_step_update|flow_step_supersede|flow-service|flow-state|team-plan|acceptance-triage|acceptance-rework|request_acceptance|request_gate_review|request_boundary_change|hand_off_intent|request_clarification|schedule-write|report_artifact_ready|docs/flows/|ledger\.jsonl" src app --glob '!app/renderer/dist/**'` ⇒ **0 命中**（D 专项测试同时常驻扫描）。
- **静态**：`npm run typecheck` exit 0（`%TEMP%\d-typecheck.log`，sha256 `aee168652259817d015b93dfeec328925fe0dc72c59b689ed06560ab0abe6cbd`）；`npm run typecheck:renderer` exit 0（`%TEMP%\d-typecheck-renderer.log`，sha256 `914780f65ceb172dd3e1640d8c55a7cc6911a6dc8cd7d5680f1d5f35f46fad72`）；`npm run build:renderer` exit 0（`%TEMP%\d-build.log`，sha256 `a2f35b1765a6758ff584a9b6cbe4cf1c0585dfe04bd0309a4e65086163359ef8`）。
- **Electron**（真实 Electron 44.7.0，临时夹具 `/tmp/ans-e2e-c4-fixture-q897xP`，输出 `%TEMP%\ans-e2e-d-out2-avh3mV`）：**`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`ROLE_COUNT=2`、`PRIMARY_ROLE_ID=su`、`BOOTSTRAP_PRIMARY=chief`、`BOOTSTRAP_ROLE_COUNT=6`、`GOVERNANCE_COORDINATION={"verifierSends":0,"sessions":0,"events":0}`**；截图 **16/17**（`00-titlebar.png` 捕获偶发 `UnknownVizError`，环境性；其余 16 张成功）；报告 `report.txt`（sha256 `af0931ca3b5ab0ddf3f255d67430f9c4ec4d0fe048802f73307c473a008b53e5`）；截图清单 `SHA256SUMS`（sha256 `9ea569b07d361c21efea0156061b333e99592977bf19eef35ca68b4efda0d7d7`，16 项）。
- **环境**：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；Electron 44.7.0。

## 6. 文件统计

- D1+D2 代码提交（`d364ea6..98d3fe2`）：**65 files changed / +830 / −26106**。
- D3 测试/文档提交（`98d3fe2..HEAD`）：**147 files changed / +757 / −93621**（含 115 个测试/夹具删除、6 个测试恢复改造、D 专项测试与 change-D/属主记录；其中最终文档修订 10 files / +14 / −13）。
- 合计（`d364ea6..HEAD`）：**212 files changed / +1587 / −119727**。
- 生产删除 23 个文件（§2）；新增 `app/renderer/src/chat/card-meta.ts` 与 `test/测试/entry-role-minimal-d.test.ts`。
- `package.json` / `package-lock.json`：**零改动**。

## 7. 删除测试逐文件登记（115 个）

说明：以下为 D 批删除的全部测试/夹具文件。删除原因：①测试目标为已撤除的 gate/flow/ledger/team-plan/分诊/返工/迁移/lock/directory/handoff/Liaison/recovery/artifact 机器；②测试绑定已删除的 UI 面板/store/IPC；③测试绑定旧卡种/旧账本/旧能力注入假设，已被 D 专项/改造后的测试替代。仍适用的保留能力测试已恢复并改造（§5，59 tests）。

- `test/pi-adapter/flow-tools.test.ts`
- `test/runtime-core/flow-tools.test.ts`
- `test/runtime-core/governance-flow-metadata.test.ts`
- `test/runtime-core/governance-judge.test.ts`
- `test/runtime-core/governance-slug-pattern.test.ts`
- `test/runtime-core/liaison-handoff-tools.test.ts`
- `test/runtime-core/report-artifact-tool.test.ts`
- `test/runtime-core/request-acceptance-tool.test.ts`
- `test/runtime-core/request-boundary-change-tool.test.ts`
- `test/runtime-core/request-choice-decision-card.test.ts`
- `test/runtime-core/request-gate-review-tool.test.ts`
- `test/runtime-core/request-requirement-change-tool.test.ts`
- `test/runtime-core/tools.test.ts`
- `test/runtime-core/view-image-tool.test.ts`
- `test/runtime-core/watchdog-tools.test.ts`
- `test/桌面UI/decision-card-view.test.ts`
- `test/桌面UI/flow-status.test.ts`
- `test/桌面UI/governance-view.test.ts`
- `test/桌面UI/i18n-b1-b2.test.ts`
- `test/桌面应用/acceptance-dispatch.test.ts`
- `test/桌面应用/dispatch-delivery.test.ts`
- `test/桌面应用/interface.test.ts`
- `test/桌面应用/operator-wiring.test.ts`
- `test/桌面应用/runtime-resolution.test.ts`
- `test/桌面应用/session.test.ts`
- `test/测试/directory-layout.test.ts`
- `test/测试/existing-project-compat-verify/a-state-preview.test.ts`
- `test/测试/existing-project-compat-verify/b-establish.test.ts`
- `test/测试/existing-project-compat-verify/c-invariants.test.ts`
- `test/测试/g2-verify/fixture.ts`
- `test/测试/g2-verify/r1-desktop-datasource.test.ts`
- `test/测试/g2-verify/r1-r2-tools.test.ts`
- `test/测试/g2-verify/w2-system-delivery.test.ts`
- `test/测试/g2-verify/w4-w5-recovery.test.ts`
- `test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts`
- `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts`
- `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts`
- `test/测试/governance-e2e-auto/c-appointment-timing.test.ts`
- `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts`
- `test/测试/governance-e2e-auto/e-switch-matrix.test.ts`
- `test/测试/governance-e2e-auto/f-acceptance-gate.test.ts`
- `test/测试/governance-e2e-auto/fixture.ts`
- `test/测试/governance-e2e-auto/g-judge-timeout.test.ts`
- `test/测试/governance-e2e-auto/h-list-dir.test.ts`
- `test/测试/governance-e2e-auto/i-full-chain.test.ts`
- `test/测试/governance-e2e-auto/j-intent-confirm.test.ts`
- `test/测试/governance-e2e-auto/k-governance-feedback.test.ts`
- `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts`
- `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`
- `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts`
- `test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts`
- `test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts`
- `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts`
- `test/测试/governance-e2e-auto/q-role-granularity.test.ts`
- `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts`
- `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`
- `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts`
- `test/测试/governance-judge-cards-verify/a-switch-matrix.test.ts`
- `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts`
- `test/测试/governance-judge-cards-verify/c-fallback.test.ts`
- `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts`
- `test/测试/governance-judge-cards-verify/e-queue-once.test.ts`
- `test/测试/governance-judge-cards-verify/fixture.ts`
- `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`
- `test/测试/governance-liaison-verify/b-intent-handoff.test.ts`
- `test/测试/governance-liaison-verify/c-clarification.test.ts`
- `test/测试/governance-liaison-verify/e-audit.test.ts`
- `test/测试/governance-liaison-verify/fixture.ts`
- `test/测试/governance-pin-recovery-verify/fixture.ts`
- `test/测试/governance-pin-recovery-verify/pin-recovery-e2e.test.ts`
- `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`
- `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts`
- `test/测试/governance-trio-verify/c-migration.test.ts`
- `test/测试/governance-trio-verify/d-single-compat.test.ts`
- `test/测试/governance-trio-verify/fixture.ts`
- `test/测试/turn-watch-verify/d-recovery.test.ts`
- `test/编排/acceptance-rework.test.ts`
- `test/编排/acceptance-triage-record.test.ts`
- `test/编排/acceptance-triage.test.ts`
- `test/编排/decision-card.test.ts`
- `test/编排/decision-evidence-packet.test.ts`
- `test/编排/directory-conformance.test.ts`
- `test/编排/flow-gate.test.ts`
- `test/编排/flow-service.test.ts`
- `test/编排/flow-state.test.ts`
- `test/编排/governance-gate.test.ts`
- `test/编排/governance-judge.test.ts`
- `test/编排/governance-ledger.test.ts`
- `test/编排/governance-migration.test.ts`
- `test/编排/governance-reaccept.test.ts`
- `test/编排/governance-record-ledger.test.ts`
- `test/编排/governance-session.test.ts`
- `test/编排/liaison-handoff.test.ts`
- `test/编排/liaison-session.test.ts`
- `test/编排/report-artifact.test.ts`
- `test/编排/request-acceptance.test.ts`
- `test/编排/request-boundary-change.test.ts`
- `test/编排/request-gate-review.test.ts`
- `test/编排/request-requirement-change.test.ts`
- `test/编排/requirement-change-judge-guidance.test.ts`
- `test/编排/section1-write-preauthorization.test.ts`
- `test/编排/team-plan.test.ts`
- `test/编排/view-image.test.ts`
- `test/编排/watchdog.test.ts`
- `test/门禁引擎/customer-card-rules.test.ts`
- `test/门禁引擎/decision-card.test.ts`
- `test/门禁引擎/gate-review-flow-busy.test.ts`
- `test/门禁引擎/governance-standard-workflow.test.ts`
- `test/门禁引擎/governance-trio.test.ts`
- `test/门禁引擎/liaison-role.test.ts`
- `test/门禁引擎/requirement-change-cards.test.ts`
- `test/门禁引擎/screenshot-only-evidence.test.ts`
- `test/门禁引擎/verifier-artifact-report.test.ts`
- `test/门禁引擎/view-image-cards.test.ts`
- `test/项目管理/shared/i18n.test.ts`

## 8. 决策点 / 过渡态 / 风险

1. **`@ts-nocheck` 兼容层（重点风险）**：`app/desktop/interface.ts` 与 `app/desktop/session.ts` 仍有大量旧治理死代码（flow/gate/账本/分诊相关 helper/注释/type-only import）。D 批已删除其**运行时入口**（IPC/preload/UI/能力注入），并以 `// @ts-nocheck` + 运行时兼容 stub 保持旧调用方加载；这些路径不可达、不注册工具、不暴露 IPC，但**源码未完全物理删除**。原因：interface.ts 为 14k 行桌面聚合层，整文件删除级联风险高；本批按“先撤入口、再物理清理”分步。**后续批次必须完成死代码清理并移除 @ts-nocheck**。
2. **删除测试覆盖缺口**：115 个删除测试中，少数针对仍保留的能力（如 view_image、request_requirement_change、decision 卡）但绑定旧卡文本/旧能力注入假设；本批恢复了 6 个高价值文件，其余留待 E/F 按新语义重写。D 专项与全量无新增确定性失败。
3. **release-policy**：为移除旧团队计划模块的 overlay 条目，`src/common/装配/release-policy.mjs` 有 2 行改动；不改变 package/lock，不影响当前版本运行。
4. **single/su 兼容**：single 模型、su 角色、`ans govern` CLI 与项目角色/适配器路径保留；trio 证据改为 `.ans/state/tasks.jsonl`，旧项目无该文件仍按 single（行为不变）。
5. **不改范围**：不 push、不合并 main；不新增依赖；不修改 package.json/lock；E/F 批内容未提前实施。

## 9. 回滚

- 回滚 D：按顺序 `git revert` D3/D2/D1；恢复 C 候选 `d364ea6` 并重跑 C 验证。无数据/schema 迁移；`.ans/state` 可删。
- 回滚后需恢复 C 批 UI/IPC/治理机器；本批不涉及不可逆数据写入。
