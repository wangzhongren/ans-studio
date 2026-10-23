# 变更记录：治理分工第 1/3/5 项——编排门禁/流程/判断/路由/会话（阶段 C）

- 任务 ID：`2026-10-22-governance-split-1-3-5`
- 产品 flowId：`governance-split-1-3-5`
- 角色：编排（阶段 C；与门禁引擎并行）
- 日期：2026-10-22
- 状态：**implemented-unverified**（已实现、定向检查通过；未经独立验收，不代表通过）
- 依据：客户确认的策划方案 v1 `docs/planning/2026-10-22_design_governance-split-1-3-5.md`（§5.3/§5.4/§7/§8.2/§8.6/§10.1/§11）、实施前标准 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（P2/P3/P5/P9/P10/P11/P12/P15）、团队计划 §4.2（编排）/§11.7、闸门 2 确认记录 `docs/communication/2026-10-22_intent_governance-split-1-3-5.md`。
- 契约输入：阶段 B 冻结的 `src/model/runtime.ts` 可选字段（`teamPlanPath`/`acceptanceCriteriaPath`/`acceptanceReportPath`/`changePackagePath`/`riskTier`/`teamPlanConfirmed`），只读消费，不改 Model/Provider。

## 一、改动摘要（按文件）

### 1. `src/common/编排/governance-gate.ts`

- `GovernanceGateAction` 新增 `"write-team-plan"`；`ACTION_ROLE` → `convener`；switch 与 `write-flow`/legacy `write-nomination` 共用提案接受门。`write-role-card` 仍 `nominator`。
- 错误文案改为「写流程/团队计划」「Convener（Steward/统筹）依团队计划发起任命卡」等分工口径。
- **O2 实施派发前置门槛**：`evaluateDispatchGate` 新增第 4 步（原 4/5 顺延为 5/6）：
  - 仅对**已有 appointment 决定**的 flow 生效；最新提案为 `proposal-accept-quick` 或旧流程（无 appointment）显式豁免；
  - `docs/acceptance/<flowId>-criteria-v1.md` 缺失/不可读 → `acceptance-criteria-missing`；结构不合格 → `acceptance-criteria-invalid`；
  - 新增导出 `acceptanceCriteriaRelPath(flowId)` 与 `validateAcceptanceCriteriaText(text, flowId)`（确定性结构检查：frontmatter/正文 flowId、验收表 ID 列、风险档位 T0–T3、pass/fail/insufficient evidence、证据计划、版本/冻结）。

### 2. `src/common/编排/governance-ledger.ts`

- **不新增** `GovernancePower`/`GovernanceDecisionKind`；仅注释同步：appointment 由 Convener 发起时 `power` 由发起角色职能决定（`schedule`），旧 Nominator 存量条目仍 `nomination`；团队计划/readiness/标准/报告/变更包走 `artifact.observed`。

### 3. `src/common/编排/flow-state.ts`

- `FLOW_STEP_KINDS` 枚举**不变**（`dispatch`/`customer-decision`/`artifact`/`acceptance`）。
- 注释登记新流程 step id 约定：`team-plan`/`appointment`/`role-cards`/`role-readiness`/`acceptance-criteria`/`change-package`/`verification-evidence`/`verification`/`delivery-*` 及各自 kind/evidence.ref。
- 旧版 Markdown 词形映射（`flowStepEvidenceKind`）的**实件在桌面窗口** `app/desktop/governance-advance.ts`（阶段 D）；本模块只登记约定：`team-plan*`→artifact，旧 `nomination*`→decision 保留，readiness 在新约定下为 artifact。见「契约偏差」。

### 4. `src/common/编排/flow-service.ts`

- 行为不变（`artifactPowerOf`/`observeFlowArtifacts` 未改逻辑）；仅注释确认：团队计划/readiness/标准/报告/变更包是普通项目相对路径 artifact，可被 `artifact.observed` 观察；`角色卡/` 仍在排除段。
- 测试新增专项：`observeFlowArtifacts` 观察团队计划/readiness/标准/变更包（power 分别为 `schedule`/`schedule`/`verification`/`schedule`），不观察 `角色卡/`。

### 5. `src/common/编排/governance-judge-facts.ts`

- `requiredArtifactPaths`：
  - appointment → `teamPlanPath`（团队计划优先；仅无团队计划且给了 `nominationPath` 时 legacy 回落，O4）；
  - appointment-write → teamPlan + flow；
  - acceptance → proposal + flow + `acceptanceCriteriaPath` + `acceptanceReportPath` + `changePackagePath`（五类缺失逐条列约定路径）；
  - `write` → 已给的 proposal/teamPlan/nomination/flow 均进入 required-read；
  - 约定路径：`docs/scheduling/<flowId>-team-v1.md`、`docs/acceptance/<flowId>-criteria-v1.md`、`docs/acceptance/<flowId>-report-v1.md`、`docs/scheduling/<flowId>-change-v1.md`。
- `buildGovernanceJudgeFacts` 新增 `teamPlanConfirmed`：最新 appointment 决定的 `artifactPath` 匹配 `docs/scheduling/<flowId>-team-vN.md` 时为 true（legacy 提名绑定为 false）。
- 推荐集解析继续复用 `parseRecommendedRoleIds`（不写第二份 parser）。

### 6. `src/common/编排/governance-judge-evidence.ts`

- `EvidenceArtifactKind` 新增 `team-plan`/`acceptance-criteria`/`acceptance-report`/`change-package`；`nomination` 保留 legacy。
- 新增确定性摘录：团队计划（frontmatter/推荐集声明/判断/角色/写集/依赖/档位章节）、验收标准（验收表/档位/判定/证据计划）、验收报告（**首行五项**原样 + 结论/判定）、变更包（frontmatter + 候选/档位/证据）。
- `addSpec`：团队计划优先，legacy 提名回落；acceptance 三类新物证按需/必需加入。
- `artifactRequired` 更新；recommended 解析来源改为 `team-plan`（legacy `nomination` 回落）；冲突文案「与团队计划重解析」/「团队计划缺少唯一的机器可读推荐集（内联数组 recommended 或固定行「推荐：」）」。
- 证据包版本不变（结构只加可选物证种类；旧夹具兼容）。

### 7. `src/common/编排/governance-judge.ts`

- `verifyAcceptanceMechanics` 在流程收尾门之外新增 `verifyAcceptanceArtifacts`：
  - 标准存在/可读，flowId 可核对（frontmatter 或 `<flowId>-criteria-vN.md` 文件名）；
  - 报告存在/可读，**首行含五项标签**（风险档位/判定依据/选定检查/复用证据/全量回归）；
  - 变更包存在/可读且 frontmatter 有 `riskTier`（T0–T3）；
  - 报告档位**不低于**变更包档位（Verifier 可升档，不可降档）；
  - 缺失/不一致 → `insufficient-evidence`（manual），不 auto-approve。
- 读取损伤/账本/流程门槛逐字保留。

### 8. `src/common/编排/governance-judge-verdict.ts`

- `SOURCE_WRITE_ROOTS`：`convener` +`docs/scheduling/`；`verifier` +`docs/acceptance/`；`nominator` −`docs/nominations/`（`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` 保留）。`角色卡/**` 仍只能走 appointment-write。
- appointment 缺推荐集文案改为团队计划（内联数组/固定行）。

### 9. `src/common/编排/governance-judge-prompt.ts`

- appointment rubric：推荐集来源改为团队计划；legacy 提名回落说明。
- acceptance rubric：标准/报告/变更包与档位机械门槛说明（系统已核对，模型不重复）。
- write 来源写区：Steward +`docs/scheduling/**`、Proof +`docs/acceptance/**`、Crew −`docs/nominations/**`（按团队计划写角色卡走 appointment-write）。
- 读取纪律/不可信数据中的「提名」改为「团队计划」。

### 10. `src/pipeline/orchestration/run-role.ts`

- `TRIO_CARD_KINDS`：`nominator` → `["appointment-write","write"]`；`convener` → `["appointment","schedule-write","write"]`。
- `defaultGovernanceChoiceCardKind`：Convener 对 appointment 形状（非空且不含 accept/accept-quick/revise/reject/confirm）默认 `appointment`；Nominator 不默认。
- **Convener appointment 卡前守卫** `validateConvenerAppointmentCard`（触达客户前）：
  1. flowId 合法；
  2. 最新团队计划存在可读；
  3. frontmatter `flowId` 与卡片一致；
  4. `recommended` 非空/无重复/不含内置治理角色（`parseRecommendedRoleIds`；空集/歧义不静默接受）；
  5. 卡选项覆盖推荐集且不含内置角色；
  6. 角色表含每个推荐角色的职责目标/能力要求/写集/依赖且非空。
  失败 → `declined + notPresented:true`（不调 raw、不计算 judgeContext、不镜像、不写账本、不占 pending），诊断 `governance.card.rejected{state:"not-presented"}`。
- `judgeArtifactsForCard`：appointment → teamPlan（legacy 提名回落）；appointment-write → teamPlan+flow；acceptance → proposal+flow+criteria/report/change；Convener `write` 可选带 teamPlan；Verifier `write` 可选带标准/变更包。
- `latestVersionedArtifact` 扩展版本扫描：`team`/`criteria`/`report`/`change` 分别匹配 `<flowId>-team-vN.md`/`-criteria-vN.md`/`-report-vN.md`/`-change-vN.md`。
- `findDecisionArtifact`：appointment 绑定最新团队计划；无团队计划才 legacy 提名回落（O4）。
- `governanceActionForPath`：`docs/scheduling/<flowId>-team-vN.md` → `write-team-plan`（文件名匹配但 flowId 非法时不带 flowId → 门禁 fail-closed）；`docs/nominations/**` 保留 legacy。
- `computeJudgeContext`：推荐集从团队计划解析（legacy 提名回落）；acceptance 读取变更包 frontmatter `riskTier` 写入 `facts.riskTier`。
- `recordCustomerDecision`：appointment 由 Convener 发起 ⇒ `power=schedule`（行为变化；测试同步）；`actorRoleId` 仍为发起角色。
- `governanceWriteOwnerHint`：Steward `docs/scheduling/`、Proof `docs/acceptance/`、Crew 角色卡/技能/MCP、旧提名 legacy 归属文案。

### 11. `src/pipeline/orchestration/govern-session.ts`

- `STANDARD_WORKFLOW_PROMPT`：阶段顺序改为「意图确认 → 提案与契约 → 团队计划与客户任命 → Crew 写卡与就绪 → 流程与派发 → 独立验收」；新增团队计划、实施前标准、风险档位/证据复用、报告路径 `docs/acceptance/<flowId>-report-v1.md` 与首行五项。
- Crew 纪律：只读团队计划按任命名单写卡；不再选角色/发 appointment/写 nominations。
- Steward 纪律：写团队计划、发 appointment、readiness、变更包；移除「首步标『提名』」。
- Proof 纪律：实施前标准 `docs/acceptance/<flowId>-criteria-v1.md`；标准/报告进 `docs/acceptance/`，证据附件进 `docs/verification/`；T0–T3 档位与复用规则。

## 二、契约映射

| 契约（阶段 B Model） | 编排消费点 |
| --- | --- |
| `GovernanceAppointmentStepPayload.teamPlanPath?` | appointment `judgeArtifactsForCard`、`requiredArtifactPaths`、证据包 `team-plan`、推荐集解析 |
| `GovernanceJudgeRequest.artifacts.teamPlanPath?` | `requiredArtifactPaths`、`addSpec`、证据包 |
| `artifacts.acceptanceCriteriaPath?` / `acceptanceReportPath?` / `changePackagePath?` | acceptance required-read、证据包、`verifyAcceptanceMechanics` |
| `GovernanceJudgeFacts.riskTier?` | `computeJudgeContext` 从变更包 frontmatter 写入 |
| `GovernanceJudgeFacts.teamPlanConfirmed?` | `buildGovernanceJudgeFacts` 从最新 appointment 的 `artifactPath` 计算 |
| `nominationPath?`（legacy） | 旧流程 O4 一次性回落（团队计划优先） |
| `GovernanceStepKind` | 未使用/未改（flow YAML 用 `FlowStepKind`，枚举不变） |

## 三、写前基线核对

- HEAD：`c3693ecdcb78bd83def351c0f2967571dad7174c`（与任务书一致）。
- 目标文件 `git hash-object` 与任务书逐字一致（17 个；含未改的 `flow-state`/`flow-service`/ledger 测试）：
  - `governance-gate.ts` `2cfad17d…`；`governance-ledger.ts` `5619ac20…`；`flow-state.ts` `6ff4930e…`；`flow-service.ts` `a9b2387c…`；
  - `governance-judge-facts.ts` `f83f0aff…`；`governance-judge-evidence.ts` `4be23a6e…`；`governance-judge.ts` `dc339299…`；`governance-judge-verdict.ts` `93453abb…`；`governance-judge-prompt.ts` `831b5bc4…`；
  - `run-role.ts` `addf0398…`；`govern-session.ts` `c2f65186…`；
  - `test/编排/` 六个基线测试文件哈希同任务书一致。
- 工作树：仅 `docs/communication/memo.md`、阶段 B（运行时核心）已改文件、未跟踪管理记录；暂存区空。与团队计划记录一致。

## 四、检查命令与结果（原始输出摘要）

环境：Windows 11 Pro 10.0.26300；Git Bash；Node **v24.22.1**；npm **11.19.1**（PATH 补 `C:\Users\51054\AppData\Local\Programs\nodejs`）。

| 命令 | 退出码 | 计数/结果 |
| --- | --- | --- |
| `node --test test/编排/governance-gate.test.ts` | 0 | tests 20 / pass 20 / fail 0 |
| `node --test test/编排/governance-judge.test.ts` | 0 | tests 81 / pass 81 / fail 0 |
| `node --test test/编排/flow-state.test.ts` | 0 | tests 35 / pass 35 / fail 0 |
| `node --test test/编排/flow-service.test.ts` | 0 | tests 22 / pass 22 / fail 0 |
| `node --test test/编排/governance-session.test.ts` | 0 | tests 30 / pass 30 / fail 0 |
| `node --test test/编排/governance-ledger.test.ts test/编排/decision-evidence-packet.test.ts test/编排/decision-intent-drift.test.ts` | 0 | tests 32 / pass 32 / fail 0 |
| `node --test "test/编排/**/*.test.ts"` | 1 | tests **735** / pass **734** / fail **1** / skipped 0；唯一红＝既有 Windows symlink EPERM `test/编排/shell-authorized-routine.test.ts:103`（与阶段 A 基线同类环境红；非本批新增） |
| `npm run typecheck` | 0 | 0 诊断 |

新增/更新负例（全部通过）：

- 团队计划卡前守卫六类失败：计划缺失、flowId 不符、推荐集为空、含内置治理角色、卡选项不一致、角色行缺项（缺行/空列）——每例断言客户通道 0 调用、无 `customer.decision`、`notPresented:true`；正例断言 `judgeContext.artifacts.teamPlanPath`、`recommendedRoleIds`、账本 `actorRoleId=convener`、`power=schedule`、`targetRoleIds`、`artifactPath`/`Version`/`Sha256`。
- 推荐集解析：团队计划内联数组优先、legacy 提名回落（`requiredArtifactPaths` + 证据包 appointment legacy）。
- `latestVersionedArtifact`：`docs/scheduling/flow-a-team-v1.md` 与 `-v3.md` 共存取 v3。
- `write-team-plan` 门禁：Convener 提案接受后放行；未接受/其他角色/缺 flowId 拒；legacy `write-nomination` 仍可；`run-role` 路径路由与 Crew 拒绝。
- appointment `power=schedule`；旧 Nominator appointment 条目仍可读取。
- acceptance 标准/报告/变更包缺失、标准 flowId 不一致、报告首行缺五项、报告档位低于变更包、变更包缺 `riskTier` → `manual` 且不调用模型；报告档位高于变更包（升档）→ approve。
- `FLOW_STEP_KINDS` 枚举不变；新 step id 模板解析通过；旧 `nomination` 步骤仍可解析。
- `team-plan*` legacy Markdown 映射：本阶段只登记约定；可执行映射属桌面（阶段 D），见偏差。

## 五、写后候选哈希（工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/编排/governance-gate.ts` | `d932a6e5b3fe4e1e0193a26bb5a764c7c1b1a40e` | `5cc9d25ae87c1f92081bf64b7f3214e56fdaa27b3d49ff8dadfd4d093c22a820` |
| `src/common/编排/governance-ledger.ts` | `c29a78ae763769f9e204c7dc59a5eb2667df8b61` | `5fd7750c94db65fdc8a10b7155ffa4aec6fa3a99919c3d7a7bd4cb18e225c96b` |
| `src/common/编排/flow-state.ts` | `02ee95429e00c4c9f98534bfa21e950c40523013` | `baeb2e4a7ab4d2842db63d918433dc6ca4d649249f8f41ed3f54a3f7a0dc28bd` |
| `src/common/编排/flow-service.ts` | `2679703027850c948772fd59f93cc1ed171d08d1` | `828d0c9cbc8800631d20af7e976748c98d31999ecc551ec659978ea8ad31d5e4` |
| `src/common/编排/governance-judge-facts.ts` | `66cd2ad15c78392a27a02047c06d19f56d25fc67` | `b921bf3a1b0dce76c4269db9419657e7550f2ca58147aa61e55c5ced1fb482ac` |
| `src/common/编排/governance-judge-evidence.ts` | `803dc791271a31278ccf333eac31124551eefa2a` | `aedffe9cc67dc487d4777dad0d4d867e69ca1aaf4f73e4b583559457196f15d9` |
| `src/common/编排/governance-judge.ts` | `a0d315e60579dbcd11e21ec72e816eecaecda7d8` | `e398ada20751cf087c685574fd3c27a97c54aae0521d00fc7bfaa03dec768e93` |
| `src/common/编排/governance-judge-verdict.ts` | `ed14a98d9800df5debf6bb6f8aa49b204a8dfca6` | `0228962b7ea131f05e900cbcd3db5295bfde298449c91e70ecd707686d4570f7` |
| `src/common/编排/governance-judge-prompt.ts` | `e6eb723424045ab00add38241fa94a10e9597042` | `e97597f0098693477899bd522a4a15f87c5fed6af2c3657fbefb8df63ada71cf` |
| `src/pipeline/orchestration/run-role.ts` | `e77e9ffd34304a4f0c47708f15223dea5544bd6e` | `55f11d2dca9696cd5036e67e9748f4789ae1fb04bca7fc6aa30eb0ecd64a86db` |
| `src/pipeline/orchestration/govern-session.ts` | `c6723b8c9d9da14ea554b4ed081936ab6edc32fa` | `103dff0c1e555963e8ac7217da7adc06fac0f8764308989bdccdac0c33c56eb1` |
| `test/编排/governance-gate.test.ts` | `edec4821982a0fa437f736a9bf25e39caa64213a` | `81e191d8730eaad684b56d9e492e1c8a29c9a8248a0a77907d31835dca996c09` |
| `test/编排/governance-judge.test.ts` | `97d320f4d0ecdee5bcceab6f574a81543f589453` | `c5c4a2651ad89e2ed514ffb279f27d93e46c408cb13bc16823fed57d1f201457` |
| `test/编排/flow-state.test.ts` | `b4f3965ceee4a1a68e5daf359f50d03ddf2b5a03` | `7d4320c02d1d1101243921065ca9dbd7dc8c1e0af4e20c1906a323bfe3da9a04` |
| `test/编排/flow-service.test.ts` | `0c5353087f498641003f6bcb65b3e4ebdc968716` | `5496b31f51dffd09742ce3700e13eb15085c4a27e76771447f951e6aeb941772` |
| `test/编排/governance-session.test.ts` | `37c5398468a6cb6b57e416fc3e7fdd9d7319ea1d` | `b02436e4eef8b3724042fb19c5f330e63d164044b56c966f0aa277c37488da16` |
| `test/编排/decision-evidence-packet.test.ts` | `3c6b189d95f97dac5e7330d45095b53633780bb5` | `06a085e279c1fcee0da9d667fab7814c3a9e49337e53e437fcdddc0f4589f250` |
| `test/编排/decision-intent-drift.test.ts` | `e620aa957e6b016bdab602daf81a4e50b9f2ed3b` | `0132c780a6adb86219d6ec0f7e758cee03b133fba8097c8aaaa97f648934cd4e` |

> 哈希为工作区内容；行尾以工作区为准。`docs/` 管理记录与角色自身文档不计入产品候选。

## 六、diff / status

- `git rev-parse HEAD`：`c3693ecdcb78bd83def351c0f2967571dad7174c`（未变）。
- 本角色改动文件（均在授权写集内；`git diff --name-only` 中其余文件为并发阶段 B/C 其他角色与既有管理记录，不由本角色写入）：
  - `src/common/编排/{governance-gate,governance-ledger,flow-state,flow-service,governance-judge-facts,governance-judge-evidence,governance-judge,governance-judge-verdict,governance-judge-prompt}.ts`
  - `src/pipeline/orchestration/{run-role,govern-session}.ts`
  - `test/编排/{governance-gate,governance-judge,flow-state,flow-service,governance-session,decision-evidence-packet,decision-intent-drift}.test.ts`
  - 自身文档：本文件、`角色卡/编排/api-spec.md`、`memo.md`。
- `git diff --cached --name-only`：空（未暂存）。
- `git status --short`：另见并发角色文件（门禁引擎 `governance-roles.ts`、运行时核心 `model/provider`、各自测试/文档）与未跟踪管理记录；本角色未触碰。
- 未提交、未推送、未合并、未发布；未运行 `npm install`；未改 `package.json`/`package-lock.json`；未新建 `test/桌面应用/` 文件；未开始阶段 D。

## 七、契约偏差与未做项

1. **旧 Markdown 映射实件不在本写集**：任务书要求「flow-state.ts legacy Markdown 映射增加 `team-plan*`→artifact」，但该映射的实件是 `app/desktop/governance-advance.ts::flowStepEvidenceKind`（桌面窗口，阶段 D）。`src/common/编排/flow-state.ts` 只承载 Flow YAML 机器状态，没有该映射。本阶段在 `flow-state.ts` 注释登记约定（`team-plan*`→artifact、旧 `nomination*`→decision、readiness→artifact），并在 `flow-state.test.ts` 固化新 step id 模板与枚举不变；未改 `app/**`，可执行映射需阶段 D 桌面窗口同步。**如实登记为偏差**。
2. **appointment→Crew 桌面派发回路属阶段 D**：本阶段只改编排门禁/判断/路由与会话提示；`deriveGovernanceNextStep`/`advanceGovernanceFlow` 的派发回路、桌面写卡校验与 UI 文案不在本写集。
3. **`test/测试/` 跨角色 e2e 与全量 T3 回归归阶段 E**：本阶段执行 `test/编排/**` 与 typecheck；`governance-e2e-auto/*`、`governance-trio-verify/*`、`governance-judge-cards-verify/*` 等冻结夹具可能因角色分工变化需测试角色更新（属阶段 E 职责，本角色未改）。
4. **`docs/scheduling/` 与 `docs/acceptance/` 未由本角色写入**：产品运行期路径与卡前守卫只读；本任务管理记录由统筹/验收写。
5. **`teamPlanConfirmed`**：按阶段 B 契约可选字段实现为「最新 appointment 的 `artifactPath` 绑定 `-team-vN.md`」；未在 `GovernanceJudgeContext` 顶层重复添加字段（按 `facts.teamPlanConfirmed` 表达，计划 §8.2 允许）。
6. **未改**：`src/model/**`、`src/provider/**`、`src/service/**`、`src/common/门禁引擎/**`、`app/**`、`test/runtime-core/**`、`test/门禁引擎/**`、`test/测试/**`、`docs/scheduling/**`、`docs/acceptance/**`、角色卡/边界。未新增 `FlowStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind`；未改角色 id/显示名/工程基线文本。
