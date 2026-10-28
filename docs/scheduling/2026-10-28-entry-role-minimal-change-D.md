# entry-role-minimal 批次 D：治理机器撤除（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：D（治理机器撤除）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 §8（D-01–D-12）。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地逐批提交，不 push、不合并 main。
- 依据：C 批已判 pass（v1 报告 122 行 / `945623f8…`，候选 `d364ea6931a7bdf2388caf8855d7af36e09bd2a7`）；D 批放行口径（Delta-2/3/7 已确认，A 口径；方案 §16、团队计划 §4.4、amendment-1/2）。
- D 实施提交：**D1 `c2b6cf97d2ea59f3cd239a2b0f39b2b36ff188ec`**（核心撤除）、**D2 `98d3fe2f59cedd7fe1c78b5387a4ebaf9ed846ce`**（桌面/UI 撤除）；D3 证据提交 `4c2414909d4336a5e2a259b513ad16c74a899571`；D 返工代码/测试提交 `e8e5c1fd83f40dce93f30b1c11f6222573ba2e4e`；最终文档提交见最终报告。
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

## 5. 验证（D 出口 / rework）

- **最终 clean 全量**（`--test-concurrency=1`，枚举 328 个 `*.test.ts`，排除 `write-sequencing.test.ts` 后执行 327 个）：**2880 tests / 2850 pass / 12 fail / 18 skip**；C 基线 4569/4535/15/19（425 枚举/424 执行）。12 fail 全部为基线既红（9 条 Windows symlink + T1 pi/codex/claude×3）；**新增确定性失败 = 0**；**无新 skip**（C 的 19 条 skip 中 1 条随已删治理测试消失）。日志 `%TEMP%\d-final-candidate.log`（sha256 `cad61ab9dc518e62bbf03e09a0abab924cbc8b290cd0a784e26aea62c691dcc0`；code/tests = 返工提交 `e8e5c1f`，其后仅文档提交）。
- **返工前 D 候选**（`64705c8`）：2817/2787/12/18（日志 `d-full-final2.log` `745c3de4…`）；返工恢复/重写 11 个保留能力测试文件，测试数 +63，失败/跳过不变。
- **D 专项**：`test/测试/entry-role-minimal-d.test.ts` **5/5**（新增 D-03/D-10 基线扫描断言）；日志 `%TEMP%\d-rw-special.log`（sha256 `226c206b4a34c61cd270e0c620cb01f46cb28289ea270719ff204c777d05a6cc`）。
- **保留能力测试恢复/重写**（11 文件）：`项目管理/shared/i18n.test.ts`（6）、`runtime-core/view-image-tool.test.ts`（19）、`编排/view-image.test.ts`（3）、`门禁引擎/view-image-cards.test.ts`（3）、`runtime-core/request-requirement-change-tool.test.ts`（9）、`编排/request-requirement-change.test.ts`（5）、`门禁引擎/decision-card.test.ts`（4）、`编排/decision-card.test.ts`（3）、`编排/decision-evidence-packet.test.ts`（4）、`编排/section1-write-preauthorization.test.ts`（5）、`测试/governance-e2e-auto/i-full-chain.test.ts`（1，既有文件名，Delta-6）。
- **D-04/D-03/D-10 rg/guard**：D-04 指定 regex 在 `src`/`app`（排除 dist）**0 命中**；D 专项同时断言 `ENGINEERING_QUALITY_BASELINE` / `ENGINEERING_QUALITY_STAGE_REQUIREMENTS` / `工程质量基线` 零命中。
- **静态**：`npm run typecheck` exit 0（`%TEMP%\d-rw-typecheck.log`，sha256 `aee168652259817d015b93dfeec328925fe0dc72c59b689ed06560ab0abe6cbd`）；`npm run typecheck:renderer` exit 0（`%TEMP%\d-rw-typecheck-renderer.log`，sha256 `914780f65ceb172dd3e1640d8c55a7cc6911a6dc8cd7d5680f1d5f35f46fad72`）；`npm run build:renderer` exit 0（`%TEMP%\d-rw-build.log`，sha256 `7043f6081577f3e8c8ccab58a961aa840ca9253870dd6d43c05c388a72d393c7`）。
- **Electron（rework 复跑）**：真实 Electron 44.7.0，临时夹具 `/tmp/ans-e2e-c4-fixture-q897xP`，输出 `%TEMP%ns-e2e-d-rw-out-7xVNVO`：**`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`ROLE_COUNT=2`、`PRIMARY_ROLE_ID=su`、`BOOTSTRAP_PRIMARY=chief`、`BOOTSTRAP_ROLE_COUNT=6`、`GOVERNANCE_COORDINATION={"verifierSends":0,"sessions":0,"events":0}`**；截图 **16/17**（`00-titlebar.png` 环境性 `UnknownVizError`）；报告 sha256 `ecc4dc8ff76f54492477bfc206f9eae168a39a1d4be8053f51a60c77b0f40c5a`；截图清单 sha256 `edac9d75668a6b1343ec93f6a22be3aa8b67366286d550caf5c5b444b22afe7b`。
- **环境**：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；Electron 44.7.0；无 `.env`；临时夹具 `%TEMP%`。

## 6. 文件统计 / commit 表

| 提交 | 内容 | 文件/行数 |
| --- | --- | --- |
| `d364ea6` | C 候选（基线） | — |
| `c2b6cf9` | D1 核心撤除 | 34 files / +427 / −19862 |
| `98d3fe2` | D2 桌面/UI 撤除 | 31 files / +403 / −6244 |
| `4c24149` | D3 测试/文档 | 147 files / +756 / −93621 |
| `64705c8` | D3 后续文档（返工前 HEAD） | 10 files / +14 / −13 |
| `e8e5c1f` | D rework（基线删除 + 保留能力测试恢复） | 15 files / +2611 / −54 |
| 最终文档提交 | change-D/属主记录更新 | 见最终报告 |

- 返工后（`d364ea6..e8e5c1f`）：**212 files changed / +2101 / −117684**；加返工文档后 **212 files / +2387 / −117684**（最终文档提交见最终报告）。
- 删除路径：**127**（生产 23 + 测试 104；原始候选 138 删除中 11 个保留能力测试已在返工恢复）；新增测试 1（D 专项）。
- `package.json` / `package-lock.json`：**零改动**。

## 7. 测试差异表（附录 A 119 + 额外删除）

| # | 文件（`test/` 相对） | 预分类 / 批次 | D 最终处置 / 批次 | 用例数（前→后） | 说明 |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `claude-adapter/session.test.ts` | 重写 / C | 保留（复核） / 前批完成 | 55 → 55 | 偏差：按 D 复核调整 |
| 2 | `codex-adapter/judge-governance.test.ts` | 保留（复核） / C | 保留（复核） / 前批完成 | 6 → 6 | 按附录 A |
| 3 | `pi-adapter/flow-tools.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 4 | `runtime-core/flow-tools.test.ts` | 删除 / D | 删除 / D | 11 → 0 | 按附录 A |
| 5 | `runtime-core/governance-flow-metadata.test.ts` | 删除 / D | 删除 / D | 14 → 0 | 按附录 A |
| 6 | `runtime-core/governance-judge.test.ts` | 重写 / C | 删除 / D | 14 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 7 | `runtime-core/liaison-handoff-tools.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 8 | `runtime-core/request-acceptance-tool.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 9 | `runtime-core/request-boundary-change-tool.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 10 | `runtime-core/request-choice-decision-card.test.ts` | 重写 / C | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 11 | `runtime-core/request-gate-review-tool.test.ts` | 删除 / D | 删除 / D | 11 → 0 | 按附录 A |
| 12 | `runtime-core/request-requirement-change-tool.test.ts` | 重写 / C | 重写 / D | 10 → 9 | 按附录 A |
| 13 | `runtime-core/shell-judge.test.ts` | 保留（复核） / C/D | 保留（复核） / 前批完成 | 8 → 8 | 按附录 A |
| 14 | `runtime-core/tools.test.ts` | 重写 / D | 删除 / D | 16 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 15 | `runtime-core/view-image-tool.test.ts` | 保留（复核） / — | 重写 / D | 20 → 19 | 偏差：按 D 复核调整 |
| 16 | `桌面UI/background-tasks.test.ts` | 保留（复核） / — | 保留（复核） / 前批完成 | 11 → 11 | 按附录 A |
| 17 | `桌面UI/decision-card-view.test.ts` | 重写 / E | 删除 / D | 9 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 18 | `桌面UI/flow-status.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 19 | `桌面UI/governance-view.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 20 | `桌面UI/history-dedupe.test.ts` | 重写 / E | 保留（复核） / 前批完成 | 4 → 4 | 偏差：按 D 复核调整 |
| 21 | `桌面UI/i18n-b1-b2.test.ts` | 重写 / A/E | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 22 | `桌面UI/judge.test.ts` | 重写 / A | 重写 / D | 7 → 7 | 按附录 A |
| 23 | `桌面UI/operator-view.test.ts` | 重写 / C/E | 重写 / D | 8 → 8 | 按附录 A |
| 24 | `桌面UI/role-status-view.test.ts` | 重写 / E | 保留（复核） / 前批完成 | 9 → 9 | 偏差：按 D 复核调整 |
| 25 | `桌面UI/role-view.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 6 → 6 | 偏差：按 D 复核调整 |
| 26 | `桌面应用/acceptance-dispatch.test.ts` | 删除 / D | 删除 / D | 143 → 0 | 按附录 A |
| 27 | `桌面应用/dispatch-delivery.test.ts` | 重写 / B | 删除 / D | 56 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 28 | `桌面应用/genesis-bootstrap.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 7 → 7 | 偏差：按 D 复核调整 |
| 29 | `桌面应用/handback-delivery.test.ts` | 重写 / B | 重写 / D | 18 → 18 | 按附录 A |
| 30 | `桌面应用/interface.test.ts` | 重写 / B→E | 删除 / D | 142 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 31 | `桌面应用/operator-channel.test.ts` | 重写 / C | 重写 / D | 53 → 53 | 按附录 A |
| 32 | `桌面应用/operator-wiring.test.ts` | 重写 / C/E | 删除 / D | 75 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 33 | `桌面应用/runtime-resolution.test.ts` | 重写 / B | 删除 / D | 14 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 34 | `桌面应用/session.test.ts` | 重写 / B/C | 删除 / D | 48 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 35 | `测试/g1-verify/g1-copy-and-nails.test.ts` | 删除 / D | 重写 / D | 6 → 5 | 偏差：D 保留/重写（保留能力按新语义落地） |
| 36 | `测试/governance-e2e-auto/a-proposal-write-auto.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 37 | `测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 38 | `测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 39 | `测试/governance-e2e-auto/c-appointment-timing.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 40 | `测试/governance-e2e-auto/d-dispatch-listing.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 41 | `测试/governance-e2e-auto/e-switch-matrix.test.ts` | 重写 / C/F | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 42 | `测试/governance-e2e-auto/f-acceptance-gate.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 43 | `测试/governance-e2e-auto/g-judge-timeout.test.ts` | 重写 / C/F | 删除 / D | 3 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 44 | `测试/governance-e2e-auto/i-full-chain.test.ts` | 重写 / F | 重写 / D | 4 → 1 | 按附录 A |
| 45 | `测试/governance-e2e-auto/j-intent-confirm.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 46 | `测试/governance-e2e-auto/k-governance-feedback.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 47 | `测试/governance-e2e-auto/l-crew-write-validation.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 48 | `测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` | 删除 / D | 删除 / D | 6 → 0 | 按附录 A |
| 49 | `测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 50 | `测试/governance-e2e-auto/n-invalid-governance-card.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 51 | `测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 52 | `测试/governance-e2e-auto/p-team-plan-guard.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 53 | `测试/governance-e2e-auto/q-role-granularity.test.ts` | 重写 / A | 删除 / D | 15 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 54 | `测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 55 | `测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 56 | `测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 57 | `测试/governance-judge-cards-verify/a-switch-matrix.test.ts` | 重写 / C | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 58 | `测试/governance-judge-cards-verify/b-card-kinds.test.ts` | 重写 / C | 删除 / D | 13 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 59 | `测试/governance-judge-cards-verify/c-fallback.test.ts` | 重写 / C | 删除 / D | 9 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 60 | `测试/governance-judge-cards-verify/d-audit-ledger.test.ts` | 重写 / C | 删除 / D | 4 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 61 | `测试/governance-judge-cards-verify/e-queue-once.test.ts` | 重写 / C/E | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 62 | `测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | 删除 / D | 删除 / D | 8 → 0 | 按附录 A |
| 63 | `测试/governance-liaison-verify/b-intent-handoff.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 64 | `测试/governance-liaison-verify/c-clarification.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 65 | `测试/governance-liaison-verify/e-audit.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 66 | `测试/governance-liaison-verify/f-cli.test.ts` | 删除 / D | 保留（复核） / 前批完成 | 1 → 1 | 偏差：D 保留/重写（保留能力按新语义落地） |
| 67 | `测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | 重写 / A | 删除 / D | 4 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 68 | `测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 69 | `测试/governance-trio-verify/c-migration.test.ts` | 删除 / D | 删除 / D | 6 → 0 | 按附录 A |
| 70 | `测试/governance-trio-verify/d-single-compat.test.ts` | 重写 / D | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 71 | `测试/i18n-integration.test.ts` | 重写 / A/D/E | 保留（复核） / 前批完成 | 8 → 8 | 偏差：按 D 复核调整 |
| 72 | `测试/real-entry.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 8 → 8 | 偏差：按 D 复核调整 |
| 73 | `测试/shell-judge-verify/f-readonly-sandbox.test.ts` | 保留（复核） / — | 重写 / D | 4 → 4 | 偏差：按 D 复核调整 |
| 74 | `测试/t9-block1-bootstrap.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 11 → 11 | 偏差：按 D 复核调整 |
| 75 | `编排/acceptance-rework.test.ts` | 删除 / D | 删除 / D | 19 → 0 | 按附录 A |
| 76 | `编排/acceptance-triage-record.test.ts` | 删除 / D | 删除 / D | 17 → 0 | 按附录 A |
| 77 | `编排/acceptance-triage.test.ts` | 删除 / D | 删除 / D | 29 → 0 | 按附录 A |
| 78 | `编排/confirm-preview-completeness.test.ts` | 重写 / C | 重写 / D | 7 → 4 | 按附录 A |
| 79 | `编排/decision-card.test.ts` | 重写 / C | 重写 / D | 20 → 3 | 按附录 A |
| 80 | `编排/decision-evidence-packet.test.ts` | 重写 / C | 重写 / D | 20 → 4 | 按附录 A |
| 81 | `编排/decision-intent-drift.test.ts` | 重写 / C | 重写 / D | 5 → 5 | 按附录 A |
| 82 | `编排/directory-conformance.test.ts` | 删除 / D | 删除 / D | 15 → 0 | 按附录 A |
| 83 | `编排/dispatch-reads.test.ts` | 重写 / B | 保留（复核） / 前批完成 | 19 → 19 | 偏差：按 D 复核调整 |
| 84 | `编排/finalize.test.ts` | 重写 / D | 保留（复核） / 前批完成 | 9 → 9 | 偏差：按 D 复核调整 |
| 85 | `编排/flow-gate.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 86 | `编排/flow-service.test.ts` | 删除 / D | 删除 / D | 89 → 0 | 按附录 A |
| 87 | `编排/flow-state.test.ts` | 删除 / D | 删除 / D | 64 → 0 | 按附录 A |
| 88 | `编排/governance-gate.test.ts` | 删除 / D | 删除 / D | 28 → 0 | 按附录 A |
| 89 | `编排/governance-judge.test.ts` | 重写 / C | 删除 / D | 82 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 90 | `编排/governance-ledger.test.ts` | 删除 / D | 删除 / D | 8 → 0 | 按附录 A |
| 91 | `编排/governance-migration.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 92 | `编排/governance-record-ledger.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 93 | `编排/governance-session.test.ts` | 删除 / D | 删除 / D | 39 → 0 | 按附录 A |
| 94 | `编排/liaison-handoff.test.ts` | 删除 / D | 删除 / D | 15 → 0 | 按附录 A |
| 95 | `编排/liaison-session.test.ts` | 删除 / D | 删除 / D | 12 → 0 | 按附录 A |
| 96 | `编排/report-artifact.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 97 | `编排/request-acceptance.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 98 | `编排/request-boundary-change.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 99 | `编排/request-gate-review.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 100 | `编排/request-requirement-change.test.ts` | 重写 / C | 重写 / D | 5 → 5 | 按附录 A |
| 101 | `编排/requirement-change-judge-guidance.test.ts` | 重写 / C | 删除 / D | 3 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 102 | `编排/section1-write-preauthorization.test.ts` | 保留（复核） / — | 重写 / D | 5 → 5 | 偏差：按 D 复核调整 |
| 103 | `编排/shell-readonly.test.ts` | 保留（复核） / — | 保留（复核） / 前批完成 | 9 → 9 | 按附录 A |
| 104 | `编排/team-plan.test.ts` | 删除 / D | 删除 / D | 32 → 0 | 按附录 A |
| 105 | `编排/view-image.test.ts` | 保留（复核） / — | 重写 / D | 3 → 3 | 偏差：按 D 复核调整 |
| 106 | `装配/govern-target.test.ts` | 重写/删除 / D | 重写 / D | 11 → 11 | 按附录 A |
| 107 | `装配/release-packaging.test.ts` | 重写 / D | 重写 / D | 9 → 9 | 按附录 A |
| 108 | `门禁引擎/customer-card-rules.test.ts` | 重写 / C | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 109 | `门禁引擎/decision-card.test.ts` | 重写 / C | 重写 / D | 5 → 4 | 按附录 A |
| 110 | `门禁引擎/gate-review-flow-busy.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 111 | `门禁引擎/governance-standard-workflow.test.ts` | 删除 / D | 删除 / D | 28 → 0 | 按附录 A |
| 112 | `门禁引擎/governance-trio.test.ts` | 重写 / A | 删除 / D | 51 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 113 | `门禁引擎/liaison-role.test.ts` | 重写/退役 / A | 删除 / D | 13 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 114 | `门禁引擎/list-project.test.ts` | 重写 / A | 重写 / D | 15 → 15 | 按附录 A |
| 115 | `门禁引擎/requirement-change-cards.test.ts` | 重写 / C | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 116 | `门禁引擎/screenshot-only-evidence.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 117 | `门禁引擎/verifier-artifact-report.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 118 | `门禁引擎/view-image-cards.test.ts` | 保留（复核） / C | 重写 / D | 5 → 3 | 偏差：按 D 复核调整 |
| 119 | `项目管理/shared/i18n.test.ts` | 重写 / A/B/C/D/E | 重写 / D | 65 → 6 | 按附录 A |

**附录 A 计数对照**：预分类 = 删除 58 / 重写 50 / 保留（复核）9 / 重写或删除 1 / 重写或退役 1；D 最终 = 删除 82 / 重写 22 / 保留（复核）15。

**偏差说明**：D 批实际删除比预分类多、重写少——旧治理机器（flow/gate/ledger/team-plan/分诊/返工/迁移/handoff/Liaison/旧 UI/旧 IPC）整体撤除后，预分类为「重写」的多数文件已无对象；保留能力测试（view_image、request_requirement_change、decision 卡、i18n、section1 写预授权、最小系统全链）已在 D 末尾恢复/重写并按新语义通过。E/F 仍需按 E-02/E-09/FIN-08 重写/新增被删的 UI/对话框/日志/终态测试。

**119 之外新增删除（D，22 个）**：
- `test/runtime-core/governance-slug-pattern.test.ts`：4 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/runtime-core/report-artifact-tool.test.ts`：10 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/runtime-core/watchdog-tools.test.ts`：8 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/directory-layout.test.ts`：1 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/existing-project-compat-verify/a-state-preview.test.ts`：14 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/existing-project-compat-verify/b-establish.test.ts`：13 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/existing-project-compat-verify/c-invariants.test.ts`：8 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/g2-verify/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/g2-verify/r1-desktop-datasource.test.ts`：3 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/g2-verify/r1-r2-tools.test.ts`：8 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/g2-verify/w2-system-delivery.test.ts`：4 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/g2-verify/w4-w5-recovery.test.ts`：6 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-e2e-auto/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-e2e-auto/h-list-dir.test.ts`：4 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-judge-cards-verify/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-liaison-verify/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-pin-recovery-verify/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-pin-recovery-verify/pin-recovery-e2e.test.ts`：11 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/governance-trio-verify/fixture.ts`：0 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/测试/turn-watch-verify/d-recovery.test.ts`：2 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/编排/governance-reaccept.test.ts`：20 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）
- `test/编排/watchdog.test.ts`：11 → 0（grep 外旧测试/夹具；随 D 撤除机器删除）

**D 新增测试**：
- `test/测试/entry-role-minimal-d.test.ts`：0 → 5

## 8. 决策点 / 过渡态 / 风险

1. **`@ts-nocheck` 兼容层（重点风险，验收按过渡接受）**：`app/desktop/interface.ts` 与 `app/desktop/session.ts` 仍有旧治理死代码；D 已删除其运行时入口（IPC/preload/UI/工具/能力注入），死代码不可达、不注册工具、不暴露 IPC。条件：E/F 必须物理清理并移除 `@ts-nocheck`；F 终态验证无死代码/旧治理残留。不得以 `@ts-nocheck` 隐藏新行为。
2. **测试差异闭环**：附录 A 预分类 119（删 58/重写 50/保留 9/重写或删除 1/重写或退役 1）；D 最终为删 82/重写 22/保留 15，另有 22 个 grep 外旧测试/夹具删除。偏差原因：D 整体撤除机器/旧 UI/旧 IPC 后，预分类为「重写」的多数文件已无对象；保留能力测试（view_image、request_requirement_change、decision 卡/证据、i18n、section1 写预授权、最小系统全链）已在 D 末尾恢复/重写并通过（11 文件/63 tests）。E/F 仍按 E-02/E-09/FIN-08 重写/新增被删 UI/对话框/日志/终态测试；无隐藏删除。
3. **最小系统 e2e**：以既有 `test/测试/governance-e2e-auto/i-full-chain.test.ts` 文件名重写（Delta-6，不新增目录/文件），覆盖六角色、幕僚派发落 tasks.jsonl、无 flow/gate/ledger、convener 无 dispatch。
4. **release-policy**：移除已删除旧团队计划模块的 v1.7.0 overlay 条目（2 行），不影响 package/lock 或当前运行；接受。
5. **single/su 兼容**：single 模型、su 角色、`ans govern` CLI 与项目角色/适配器路径保留；trio 证据改为 `.ans/state/tasks.jsonl`，旧项目无该文件仍按 single。
6. **不改范围**：不 push、不合并 main；不新增依赖；不修改 package.json/lock；E/F 内容未提前实施。

## 9. 回滚

- 回滚 D：按顺序 `git revert` D3/D2/D1；恢复 C 候选 `d364ea6` 并重跑 C 验证。无数据/schema 迁移；`.ans/state` 可删。
- 回滚后需恢复 C 批 UI/IPC/治理机器；本批不涉及不可逆数据写入。

## 10. D-12 证据：74 个变更/新增文件哈希（候选 `64705c8`）

口径：`git hash-object`（blob）与 `sha256sum` 均按候选 `64705c8` 的提交字节复算；文件状态取自 `git diff --name-status d364ea6 64705c8`（12 A + 62 M）。返工后新增/修改文件的最终哈希由最终报告记录；change-D 自身哈希见最终报告。

| 文件 | 状态 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `app/desktop/customer-input.ts` | M | `d2d7181e421412e2f9763df063fc56047cf9882d` | `8b33a550bfa96267f21064e3e9655c6da0d6889b3e4d12fe471048e29a393ccb` |
| `app/desktop/governance-advance.ts` | M | `49a5c54c9309a6c89d395a52b05af67c5a8ece28` | `fa5fb991c0020b5d59837dd997a929178c1637ba26d4c988fbf4515877bb8f9f` |
| `app/desktop/interface.ts` | M | `05ff46011d587ba14aa386b21adbbbba72d112e3` | `bb06a1fdfe27e2ccb667c98769703089c4058700857aae3f71a3eb205e7ed475` |
| `app/desktop/requirement-change.ts` | M | `f4f8839c8a42f4c810f551cda74ff725dc9c4533` | `e6694c529c36fa09d45cd9e1dc75dae485718237bfece96853a2083dd237748d` |
| `app/desktop/session.ts` | M | `7770e7257a5605e8df2389e7a8851cecd85ef576` | `a0f45c16c776e21285bf02df8bcfbed149dc36e96d2de31f023f78ef2bf49e95` |
| `app/desktop/write-preauthorization.ts` | M | `fe7fa2f1dd67d7e2b78234f3df1402b15ef38e5b` | `5f5865f18cbff46a02e4c415da794b51b91e9d1ed3c89568c6d296702b2e8ad7` |
| `app/main.ts` | M | `e44ef59357d0d68ad38039871a0178add45d8e22` | `afcf7f7113fe3f3a6db32e11eac8efe7dcd931af0d00bac14ed0ce29422eaad1` |
| `app/preload.cjs` | M | `2fdd1b54c2de53ed91a6ac4a18e6c4a728ada71c` | `1725c48fe75155c089ce0b21cad59af149261c5ced83be9ee6b70bb4c5423522` |
| `app/renderer/src/chat/ChatRow.tsx` | M | `71f439047d1d9646808b2551301865a5cbe711e9` | `8e9683ca63b50122749e1741451a6c8fa61ac6c9b744186a6fc2cede40fe35a6` |
| `app/renderer/src/chat/ChatStream.tsx` | M | `ba2adff8332f622c9ada82e1a308ad925fdc29d3` | `9b5afd587b0b536d5c9939da1c1a90472edbacb097953bfa30c6be203ef70b14` |
| `app/renderer/src/chat/card-meta.ts` | A | `fddaff8cfa91dbeb3d1bca28c49d7138cfde68a0` | `7270f7ae046656fc4137381f988f8fbd13f64d650b7f2752d644c05667be6060` |
| `app/renderer/src/chat/chat-store.ts` | M | `d6b496d99fd7a58e9215c2b9f703e06dda377ce0` | `b7248b9595ccefbb90475a795e8e198416e6354183ea69bf44ba2a2f309a205e` |
| `app/renderer/src/chat/ipc.ts` | M | `7be498dd30cb3ba721078241d34fcf6239d7f348` | `d8e4e857eb3b346647463a2393ec4aae2cb00c64bbe2fe86b6819d55ebd09bdd` |
| `app/renderer/src/chat/judge.ts` | M | `0063798cf1d5353b17675c03e8f8f5bcf525c265` | `663f3e9c988621fb0dfe0e86c401daf1c93e96410bb72838a56e5455d28bf76f` |
| `app/renderer/src/chat/operator-view.ts` | M | `9d9ed563fb9ce6be9b901a417a7831312d2f8e55` | `fae6d93e80559da5bd01e1d7f203eb09f17d053463c63c091a5a87212c8dd289` |
| `app/renderer/src/shell/ChatHeader.tsx` | M | `0f26e85d9917610cd57aa91defb3f23db8f2774c` | `6dbbd4f76b253a681755f9949e00bc880ec8d6ce6ef776b31c5881a70d337972` |
| `app/renderer/src/shell/WorkOverview.tsx` | M | `0b7f70cac126d2d8b212a4974f8643ce91bf199e` | `0a453097fd1fcd6b7f59a39b1410838208105f1401920a9dfbe115893884cb85` |
| `app/renderer/src/shell/phase4a.css` | M | `5a39c81bfd05ce5816e96529d6a5225eb9b52c48` | `218ea5eecfc47e8db34dab2c0c2d1e36ebf8a81c1708b4af4c96a44e985b0aab` |
| `app/renderer/src/test-driver.ts` | M | `0fbe4307ffc186ba46e7a12b84c842ffcd808d5b` | `91d23e19d35af0ded08fda8ecf7822b261e68431d3f87f5bb0bbc95e85362def` |
| `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md` | M | `e2f43a24562626f4d42d30cefc1565c3c715ded7` | `d6a88a1c1f32f4c230f89a1a1232de1c3647b710ceb0d2e738a99d0b1a5f62b5` |
| `docs/scheduling/2026-10-28-entry-role-minimal-change-D.md` | A | `c6d66e8e2c4d767414cc97a260a42de8f0f7d8d4` | `e7750db43086e8948638525ae1b667a0a3da3b9a934077d84c22a84eccb95368` |
| `src/common/runtime-core/shell-judge/policy.ts` | M | `ee60b2d4b80fa9de3c316c201a9068ea35bf9c87` | `d1a8b74480e26087578c5dbfa8065c1e20896a92936e53ad19762f8ac648c04b` |
| `src/common/shared/i18n/messages/en-US.ts` | M | `a0c3013b8a84eb67f4801b7513c8af18d025f392` | `3890006b0a98269825f3cf7f53d2261676096a5c84652d2bd72a60852a2ca300` |
| `src/common/shared/i18n/messages/zh-CN.ts` | M | `6ddcb42859dced0efedee609779c31101f6e8f8b` | `7b1d20981aa595926cf7ce551802561add5c6bd6ea4b588160789d194758e8d2` |
| `src/common/编排/finalize.ts` | M | `2cf32badcfa3f67576e8675bc1fb74ad6cf6e6ad` | `1db4973c343f9c6f175a77102d18d5f962f529a1205c402fb834eab3931363dd` |
| `src/common/编排/governance-judge-evidence.ts` | M | `470c6e7888a74fdfc1a8f79dce472069eafabf64` | `e3590bfe7970196312d4b7a96f1661a9672368e850bf690f67e403d5a06f3c01` |
| `src/common/编排/governance-judge-facts.ts` | M | `0d59ba9ac071b6fbb95b14eeadfe8cf487364416` | `f99d564b81ca14b26906ee17bf8f4b40da3a7362d8ceb897c4e337a6e5893303` |
| `src/common/编排/governance-judge-intent.ts` | M | `d323b559a3aab93ee303caa8c3b687019d3af53a` | `d4fe2e29d698aba935639e5f11f46ee4f320ddc1418623a04e58cdb54b14cc9b` |
| `src/common/编排/governance-judge-prompt.ts` | M | `d9a24395298ec7c5b654c217e36c2d01b212bf7a` | `8a692a47d2478cd9b7251ea609aa44b48280d1a6a097a733be6208ceabf8784a` |
| `src/common/编排/governance-judge-verdict.ts` | M | `8a1aab66a6c23c102bfe0583b235e53113b81909` | `548e87928a5b7a4420dbfd011cc8a9e7fd35a8e2cfb7546b2cb09ab011cdf1c7` |
| `src/common/编排/governance-judge.ts` | M | `20bbfdfc247cff3d81d1fb571f3cdad184accb4e` | `4c4902ee840e1d827d0dbacc43d0efd40e29f1a7c49525656981d4e6a46d334a` |
| `src/common/编排/watchdog.ts` | M | `3789c2947374aae2c9b5567fe19de3233ef96366` | `d345e13421896ce568c4bc9db1e88a18739c882205e7cc46077236357d1b4b95` |
| `src/common/装配/release-policy.mjs` | M | `f9414f2ef5c8ab68c3b28bd51b0ef36ba2f34517` | `2a33b867a3dac2b6978a5be07e0582d254115c0f3faca10863155b3c7364dfdf` |
| `src/common/门禁引擎/governance-roles.ts` | M | `7a8d23278fe9d270383005f02d7f46e722eda768` | `6ee34148824ad844fb771a31fcf762562b5dc4804f73e5e26c0eec136d201907` |
| `src/interface/cli/govern.ts` | M | `3de770751c24c620224f1a2e8140d99ff7a60a81` | `558754331f8482fc029548d9bb62e865b6056a83f7a31664e7ef770d515fa102` |
| `src/model/role.ts` | M | `db8707cc3df4c834fe987f19071c096a53e8baf4` | `8c015166fbaa25567acb719ed349a2fe6a594b285a4c3d0b905622234240de9c` |
| `src/model/runtime.ts` | M | `c96e2a7d9ec2a996ee7bd1009db29bf216083404` | `8c276de5ea5e816762a6e65dfa206e3f5cade47e0d6db8ca0baca576aad4bee1` |
| `src/pipeline/orchestration/govern-session.ts` | M | `dbdd6053b4c45d9fc02e65a3e3f89852711a1ade` | `8213517b92dac8b671f1f5014d708d33f456444fdc5ee44ee4af2a65e12d7464` |
| `src/pipeline/orchestration/run-role.ts` | M | `c2222dea712023478f023cba9cfea4fbe38f7774` | `3a2c1e60a7710ba8db50eb5afeb06e20e50c0abb7a43ad71062f9a43e863b088` |
| `src/provider/pi/session.ts` | M | `0215e9d6976d9ea43bb6e6a8173c263dc74700c6` | `337df9b1cada3c9849e8225c28d484475dc836cba3f145d71efe62b6262300b3` |
| `src/provider/runtime/schema.ts` | M | `3b1f24f7734cc90c040a8169361a75df1e0d31b1` | `a60187910ab295a38c2833f3bf9fae3e8d4edea1a71954ca0f82d46b565e7fbf` |
| `src/provider/runtime/tools.ts` | M | `f8a21efa0adb4d928c57c2d0b3d234a82da98a04` | `88bab27f959cea09899cbfb9d68e4a83ebb6ee3d8ce0f0b7def81fc52c64663c` |
| `src/service/boundary/resolve-boundary.ts` | M | `44adb28358b890487d1c141e3c88fa79db2e0e87` | `b73b943e88eaf924faf37ca5d0084fc676bf3a44d5c2486305e4da3edc96251b` |
| `src/service/role/resolve-role.ts` | M | `dd5b466489f8db1862fc61a7924126d6f2cf17e9` | `cc482d28bff18398e127696f9c832a829dded6c82a093cc7546da9ca23e8fe6c` |
| `test/桌面UI/judge.test.ts` | M | `0e7448344174aa23e42c38c2205aec4a17953e4d` | `cb005a7154f6e0a99c04ee0c3bd84c475398a7f23b706779c4fabe0fb5360f30` |
| `test/桌面UI/operator-view.test.ts` | M | `86d88ecbdda23542c31e4ab17705b51343a3693d` | `874443c59ca3ffbe5086e60a6b98f1d734a876e20d382ccc52a9ebfcfbc6332f` |
| `test/桌面UI/source-guard.test.ts` | M | `1a1253e54a253c1fbebf7ea0e368432339ae9f7a` | `4990116bd6046085dc6ba8426855fae0c6075f81f64b6133a9853c6e6038a329` |
| `test/桌面应用/ans-wiring.test.ts` | M | `0c7f8e9029f170d08e63c576771bd9ecba2b5cda` | `6a6d6e20f0a31294da32048f0b56a565a7d447f5842f80adf71abec41f4a889a` |
| `test/桌面应用/chief-workflow.test.ts` | M | `747af1e711a590e3deb1c78f625cbbf7227bb0ce` | `53d034f2a32094ce7a0ba414de42ce8fae7f8127fd467ff7198b4f1fd36c58bd` |
| `test/桌面应用/e2e/main.mjs` | M | `edad7d67239d26dab1ff5eddfecc53904cc4df3c` | `4d7689cc63cf50732ea5703cddd2525ef590c4aea0c6dc66b3408a26ec504285` |
| `test/桌面应用/handback-delivery.test.ts` | M | `88ac02fecc6a8ce19ef95ef4db2fa2e1fcfbc73f` | `5ec046b647c87447a7aea529a48708036c208b18627b845ed37d7ed46d8a8c6f` |
| `test/桌面应用/operator-channel.test.ts` | M | `167313ef8a55bc14914a3e64db8ba552b36a1558` | `ef6764c215d735459d23fc3b191ab35c6edbd56433607ac2466492e75116f591` |
| `test/桌面应用/star-routing.test.ts` | M | `7644fda97292b1d50b97ba4e1184a71ebe27717e` | `b31bb35882c18158f72206657fd9acb0fdd403283895182b92530449d9149d90` |
| `test/桌面应用/write-safety.test.ts` | M | `01245c1b743821ab51de09f67b37ca30405dd864` | `87b777a909ee275c4ffbbdfafaa13388ac8055b6121934f033f0b7e544482f03` |
| `test/测试/entry-role-minimal-d.test.ts` | A | `7660b706483d2bae9ed8d5e73baedf849e2a8da4` | `7e814fc81e737310a06493d68b898fb0d476edcdff1c5c7b622ea2b3b3212949` |
| `test/测试/g1-verify/g1-copy-and-nails.test.ts` | M | `80d174259b370f2fe887a5efbae225416a71117b` | `1533f417a417bb80de0441046fff76371b873d8298f88e57ee82f79b89ef9b9a` |
| `test/测试/redispatch-target-recompute.ts` | M | `e1e1f9f40e16c0f678737ea7a073028891422b88` | `b3170036971ae58a3a2af940c9c50ef68fe114f705958be8a9ef9ba8cbe0b9ee` |
| `test/测试/shell-judge-verify/f-readonly-sandbox.test.ts` | M | `d8a7e13ca0de445ba040026d00124a027c49a60a` | `1a6cabff7ea641fa560d7ae382faa4b58043087ad1ad4d0d0dfa8d270620d164` |
| `test/编排/confirm-preview-completeness.test.ts` | M | `94d9761c3e4c417330c227a6415a765a39971e56` | `f0617f40359b7e1785746f5312ccf6c1f427314ece9d6e69debd2de84b59a7f9` |
| `test/编排/decision-intent-drift.test.ts` | M | `f24b29c6cbc9fe6783a3bb679209550c996e7c8e` | `84751064f3bc60288fffa2c832412ff15bff711c35c72c5016acb1cf8896725b` |
| `test/装配/govern-target.test.ts` | M | `f9b79f18f38ad2c398183f7bf18a39834095e8b0` | `95b5757bad9eeac8220e0f0aab99b9f3131eb1a8f5218d27d6536a12828eeaaa` |
| `test/装配/release-packaging.test.ts` | M | `59e6838e8902e8452a7e3c13bd15fac7874cbd55` | `59b84e97bfa3b004dc803cb9507a692854517fd0e39ef2b614fd52e90d623f08` |
| `test/门禁引擎/list-project.test.ts` | M | `61ae132650751fdd914d97d21d8ea7f2204d45e9` | `e0c94f1022e62a3125cf887322fd5dc6b79fc498ec0b89b706ffc96b9df514df` |
| `test/项目管理/shared/i18n-guard-allowlist.ts` | M | `f11923d752cd85a216d1ca801834b1872fca39db` | `6c1d6a8d0440700bc51e92ffa4e1166b740b62babe366ce5c2a4d9d0694255b1` |
| `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `11ae54de6111918ea22a5b83ba299346bf35b47d` | `69a853ac2efb0df7e3ffddf9784c655fad997d5553cb7d69208a938e4feb28cc` |
| `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `4256379ec625fa11448340ca2395d0828c1018b8` | `07d22d923eb708d0be42067a9f026afbf50c857b4b92cfecb1c6fc0164f466dd` |
| `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `65ef3dc5ea092a6ce03929fb512e94cba0e0dc9b` | `8d16976cc1ae6ce40c8e449742c081f3a41404b94ff7a272fcaf1be53f204197` |
| `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `5f04e144de37f476c3c9e3546aa3a663cda30654` | `5cfa061228531cc2af04b2a4a22407197d8f9383875249ba8bfe89e96cd7b63e` |
| `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `b12c255b9dc4b3e90c2e61b0ff3f6fab105a628a` | `46ff52cd38daf84a268c4e447942689969f37ffc5484b65df1ec3eadf3dc3414` |
| `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `6884db517e6b6b170813e73fc705906b7a29fba6` | `5c4742fdcfa889c86d98253332410e68923bef7ac83c1e66d67908686b17e4d0` |
| `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `e97d00440c70ff98dc7ca9df9026f4bbd8e05c50` | `50c783a13890844014433f546ad71470fd333c9f1989919ef8d1d7ccc06432b1` |
| `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `7ee177d37186eb3c1e7d3e7be2538f57c7db63ae` | `37c9118ee70138b338ef88e8aa00005472b442ff75d9c336f6c37e5b7ed0e1ff` |
| `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `62875f4431080a85d5b50884971f96b6a050785a` | `c4cc849aa918431db5d243acaf699970bd464e5744dfd7dbda88af24199be825` |
| `角色卡/项目管理/docs/project-rules.md` | M | `c51fa0831db141094bfc09135895fe54484579d3` | `1807af39f0ddb2991d6a5489278bd30e8b0f8bd1a73f8b07804b2c4a1656aaed` |

统计：候选 `64705c8` 的 12 A + 62 M = 74 个变更/新增文件。

## 11. D-12 证据：删除 138 路径完整清单（候选 `64705c8`）

| # | 删除路径 |
| ---: | --- |
| 1 | `app/desktop/artifact-report.ts` |
| 2 | `app/desktop/boundary-change.ts` |
| 3 | `app/renderer/src/chat/extensions/governance.ts` |
| 4 | `app/renderer/src/chat/flow-status.ts` |
| 5 | `app/renderer/src/chat/governance-view.ts` |
| 6 | `app/renderer/src/driver-extensions/governance.ts` |
| 7 | `app/renderer/src/shell/FlowStatusPanel.tsx` |
| 8 | `app/renderer/src/shell/GovernancePanel.tsx` |
| 9 | `app/renderer/src/stores/flow-status-store.ts` |
| 10 | `app/renderer/src/stores/governance-store.ts` |
| 11 | `src/common/编排/acceptance-rework.ts` |
| 12 | `src/common/编排/acceptance-triage-record.ts` |
| 13 | `src/common/编排/acceptance-triage.ts` |
| 14 | `src/common/编排/directory-conformance.ts` |
| 15 | `src/common/编排/flow-service.ts` |
| 16 | `src/common/编排/flow-state.ts` |
| 17 | `src/common/编排/governance-gate.ts` |
| 18 | `src/common/编排/governance-handoff.ts` |
| 19 | `src/common/编排/governance-ledger.ts` |
| 20 | `src/common/编排/governance-migration.ts` |
| 21 | `src/common/编排/governance-record-lock.ts` |
| 22 | `src/common/编排/team-plan.ts` |
| 23 | `src/pipeline/orchestration/flow-state.ts` |
| 24 | `test/pi-adapter/flow-tools.test.ts` |
| 25 | `test/runtime-core/flow-tools.test.ts` |
| 26 | `test/runtime-core/governance-flow-metadata.test.ts` |
| 27 | `test/runtime-core/governance-judge.test.ts` |
| 28 | `test/runtime-core/governance-slug-pattern.test.ts` |
| 29 | `test/runtime-core/liaison-handoff-tools.test.ts` |
| 30 | `test/runtime-core/report-artifact-tool.test.ts` |
| 31 | `test/runtime-core/request-acceptance-tool.test.ts` |
| 32 | `test/runtime-core/request-boundary-change-tool.test.ts` |
| 33 | `test/runtime-core/request-choice-decision-card.test.ts` |
| 34 | `test/runtime-core/request-gate-review-tool.test.ts` |
| 35 | `test/runtime-core/request-requirement-change-tool.test.ts` |
| 36 | `test/runtime-core/tools.test.ts` |
| 37 | `test/runtime-core/view-image-tool.test.ts` |
| 38 | `test/runtime-core/watchdog-tools.test.ts` |
| 39 | `test/桌面UI/decision-card-view.test.ts` |
| 40 | `test/桌面UI/flow-status.test.ts` |
| 41 | `test/桌面UI/governance-view.test.ts` |
| 42 | `test/桌面UI/i18n-b1-b2.test.ts` |
| 43 | `test/桌面应用/acceptance-dispatch.test.ts` |
| 44 | `test/桌面应用/dispatch-delivery.test.ts` |
| 45 | `test/桌面应用/interface.test.ts` |
| 46 | `test/桌面应用/operator-wiring.test.ts` |
| 47 | `test/桌面应用/runtime-resolution.test.ts` |
| 48 | `test/桌面应用/session.test.ts` |
| 49 | `test/测试/directory-layout.test.ts` |
| 50 | `test/测试/existing-project-compat-verify/a-state-preview.test.ts` |
| 51 | `test/测试/existing-project-compat-verify/b-establish.test.ts` |
| 52 | `test/测试/existing-project-compat-verify/c-invariants.test.ts` |
| 53 | `test/测试/g2-verify/fixture.ts` |
| 54 | `test/测试/g2-verify/r1-desktop-datasource.test.ts` |
| 55 | `test/测试/g2-verify/r1-r2-tools.test.ts` |
| 56 | `test/测试/g2-verify/w2-system-delivery.test.ts` |
| 57 | `test/测试/g2-verify/w4-w5-recovery.test.ts` |
| 58 | `test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts` |
| 59 | `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` |
| 60 | `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` |
| 61 | `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` |
| 62 | `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts` |
| 63 | `test/测试/governance-e2e-auto/e-switch-matrix.test.ts` |
| 64 | `test/测试/governance-e2e-auto/f-acceptance-gate.test.ts` |
| 65 | `test/测试/governance-e2e-auto/fixture.ts` |
| 66 | `test/测试/governance-e2e-auto/g-judge-timeout.test.ts` |
| 67 | `test/测试/governance-e2e-auto/h-list-dir.test.ts` |
| 68 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` |
| 69 | `test/测试/governance-e2e-auto/j-intent-confirm.test.ts` |
| 70 | `test/测试/governance-e2e-auto/k-governance-feedback.test.ts` |
| 71 | `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` |
| 72 | `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` |
| 73 | `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts` |
| 74 | `test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts` |
| 75 | `test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts` |
| 76 | `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` |
| 77 | `test/测试/governance-e2e-auto/q-role-granularity.test.ts` |
| 78 | `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` |
| 79 | `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` |
| 80 | `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` |
| 81 | `test/测试/governance-judge-cards-verify/a-switch-matrix.test.ts` |
| 82 | `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts` |
| 83 | `test/测试/governance-judge-cards-verify/c-fallback.test.ts` |
| 84 | `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts` |
| 85 | `test/测试/governance-judge-cards-verify/e-queue-once.test.ts` |
| 86 | `test/测试/governance-judge-cards-verify/fixture.ts` |
| 87 | `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` |
| 88 | `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` |
| 89 | `test/测试/governance-liaison-verify/c-clarification.test.ts` |
| 90 | `test/测试/governance-liaison-verify/e-audit.test.ts` |
| 91 | `test/测试/governance-liaison-verify/fixture.ts` |
| 92 | `test/测试/governance-pin-recovery-verify/fixture.ts` |
| 93 | `test/测试/governance-pin-recovery-verify/pin-recovery-e2e.test.ts` |
| 94 | `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` |
| 95 | `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts` |
| 96 | `test/测试/governance-trio-verify/c-migration.test.ts` |
| 97 | `test/测试/governance-trio-verify/d-single-compat.test.ts` |
| 98 | `test/测试/governance-trio-verify/fixture.ts` |
| 99 | `test/测试/turn-watch-verify/d-recovery.test.ts` |
| 100 | `test/编排/acceptance-rework.test.ts` |
| 101 | `test/编排/acceptance-triage-record.test.ts` |
| 102 | `test/编排/acceptance-triage.test.ts` |
| 103 | `test/编排/decision-card.test.ts` |
| 104 | `test/编排/decision-evidence-packet.test.ts` |
| 105 | `test/编排/directory-conformance.test.ts` |
| 106 | `test/编排/flow-gate.test.ts` |
| 107 | `test/编排/flow-service.test.ts` |
| 108 | `test/编排/flow-state.test.ts` |
| 109 | `test/编排/governance-gate.test.ts` |
| 110 | `test/编排/governance-judge.test.ts` |
| 111 | `test/编排/governance-ledger.test.ts` |
| 112 | `test/编排/governance-migration.test.ts` |
| 113 | `test/编排/governance-reaccept.test.ts` |
| 114 | `test/编排/governance-record-ledger.test.ts` |
| 115 | `test/编排/governance-session.test.ts` |
| 116 | `test/编排/liaison-handoff.test.ts` |
| 117 | `test/编排/liaison-session.test.ts` |
| 118 | `test/编排/report-artifact.test.ts` |
| 119 | `test/编排/request-acceptance.test.ts` |
| 120 | `test/编排/request-boundary-change.test.ts` |
| 121 | `test/编排/request-gate-review.test.ts` |
| 122 | `test/编排/request-requirement-change.test.ts` |
| 123 | `test/编排/requirement-change-judge-guidance.test.ts` |
| 124 | `test/编排/section1-write-preauthorization.test.ts` |
| 125 | `test/编排/team-plan.test.ts` |
| 126 | `test/编排/view-image.test.ts` |
| 127 | `test/编排/watchdog.test.ts` |
| 128 | `test/门禁引擎/customer-card-rules.test.ts` |
| 129 | `test/门禁引擎/decision-card.test.ts` |
| 130 | `test/门禁引擎/gate-review-flow-busy.test.ts` |
| 131 | `test/门禁引擎/governance-standard-workflow.test.ts` |
| 132 | `test/门禁引擎/governance-trio.test.ts` |
| 133 | `test/门禁引擎/liaison-role.test.ts` |
| 134 | `test/门禁引擎/requirement-change-cards.test.ts` |
| 135 | `test/门禁引擎/screenshot-only-evidence.test.ts` |
| 136 | `test/门禁引擎/verifier-artifact-report.test.ts` |
| 137 | `test/门禁引擎/view-image-cards.test.ts` |
| 138 | `test/项目管理/shared/i18n.test.ts` |

统计：删除 138 个路径（生产 23 + 测试/夹具 115；D rework 已恢复其中 11 个保留能力测试，最终净删除 127，以最终报告/测试差异表为准）。

- 返工恢复 11 个保留能力测试（view_image×3、request_requirement_change×2、decision 卡/证据×3、i18n×1、section1×1、i-full-chain×1），最终净删除 127 路径；测试差异见 §7。
- 批前/批后 skip 与文件数对照：

| 批 | tests | pass | fail | skip | 文件枚举/执行 |
| --- | ---: | ---: | ---: | ---: | ---: |
| C 基线 `d364ea6` | 4569 | 4535 | 15 | 19 | 425 / 424 |
| D 候选 `64705c8` | 2817 | 2787 | 12 | 18 | 317 / 316 |
| D rework `e8e5c1f` | 2880 | 2850 | 12 | 18 | 328 / 327 |

- 环境：Windows 11 Pro 10.0.26300（win32 x64）；Node v24.22.1；Electron 44.7.0；npm（随 Node）；无 `.env`；临时夹具 `%TEMP%`。
- 回滚：D rework→D3→D2→D1 逆序 revert，或整体回退 `d364ea6` 并重跑 C 验证；无数据/schema 迁移，`.ans/state` 可删。
