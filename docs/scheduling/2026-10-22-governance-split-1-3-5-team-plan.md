# 团队计划：治理分工第 1、3、5 项（governance-split-1-3-5）

- **任务 ID**：`2026-10-22-governance-split-1-3-5`
- **产品 flowId（用于本任务验收标准/变更包命名）**：`governance-split-1-3-5`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）
- **日期**：2026-10-22
- **状态**：**团队计划；闸门 2 已确认，客户已授权实施（2026-10-22）；阶段 A–E 已完成；变更包已写盘；阶段 F（内置独立验收）已判定「通过（当前候选）」；N10 完成、N11 放行；验收通过不授权提交/推送/合并/发布**；未改代码、测试、角色卡、边界、方案或验收文档
- **闸门 0 记录**：[`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`](../communication/2026-10-22_intent_governance-split-1-3-5.md)（已确认，2026-10-22）
- **闸门 1 记录**：同上文件「闸门 1 确认记录」（客户选择「确认，按推荐项」，2026-10-22）
- **客户确认的策划方案版本**：[`docs/planning/2026-10-22_design_governance-split-1-3-5.md`](../planning/2026-10-22_design_governance-split-1-3-5.md) 草案 v1（2026-10-22）；确认范围为 §13 Q1–Q12 的推荐 A 项、§9.8 的 O1–O5 推荐项，第 2、4 项及其余差异不改
- **风险档位**：**T3（治理/权限变更）**
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目没有 `.ans/project.json` 任务配置；本计划不伪造任务令牌、审批、锁或机器预检记录。
- **当前停点**：闸门 2 已确认、阶段 A 基线已完成；阶段 B 在验收标准经沟通确认前不启动。除本计划与调度记录外未改任何文件。

---

## 一、任务与基线

### 1.1 目标

按客户在闸门 0/1 已确认的范围，实施策划方案 v1 的第 1、3、5 项：

1. **第 1 项（团队计划归统筹，Crew 只写卡）**：团队判断与团队计划从 Crew（Nominator）移到 Convener（Steward/统筹）；Convener 写 `docs/scheduling/<flowId>-team-v1.md` 并发起 `cardKind=appointment` 客户任命卡；Crew 只读客户确认后的团队计划，按任命名单写 `角色卡/<id>/**` 及配套工作文档，不再选角色、不再写 `docs/nominations/`、不再发 appointment 卡；应用在客户 appointment 决定后派 Crew 写卡（不是直接派 Convener），写卡结构校验通过后再派 Convener 做角色就绪复核。
2. **第 5 项（Crew 写卡补齐能力与工作流描述）**：Crew 按团队计划补齐能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单，以及 `feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md`（或 `not-applicable` + 理由）；确定性结构校验与 Convener 语义 readiness 两层落实；计划缺能力细节时只报告 Convener 补充。
3. **第 3 项（验收先写标准、按风险档位判定）**：独立验收在实施前按客户确认的策划方案版本写 `docs/acceptance/<flowId>-criteria-v1.md`；实施后按同一版本判定；先核对 T0–T3 档位，按档位选择检查、复用同一候选的有效证据，全量回归只在 T3 或证据不足时执行；报告首行记录档位、判定依据、选定检查、复用证据、全量回归理由。

O1–O5（readiness 记录、实施派发前标准门槛、报告进 `docs/acceptance/`、旧 nomination 过渡回落、appointment 文案改「任命」）按闸门 1 的「按推荐项」纳入实施范围；O6（新增固定测试角色）不选。

### 1.2 风险档位：T3

依据技能 `references/testing.md`「Risk-Based Verification and Change Packages」：治理或权限变更属于 **T3**，即使部分改动只涉及文档/角色卡文本，也不能压成 T0。本任务改变：

- 内置治理角色的职责、写权、客户任命卡发起人和流程步骤归属；
- 独立验收的完成标准位置、风险档位与证据来源；
- 跨层共享 Model（`src/model/runtime.ts`）的判断物证字段；
- 编排门禁/账本/写路径路由、桌面推进回路与渲染文案。

因此按 T3 管理：适用的全量回归 + 共享抽象/治理检查；报告不得以「只改文案」为由压档。

### 1.3 本轮非目标（不得顺手扩大）

- 第 2 项客户入口不唯一、第 4 项派发权分散：不改。
- 角色内部 id / 显示名 / 路径（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）不改；只改与第 1、3、5 项直接相关的卡文本与 UI 文案。
- 不改工程基线 `ENGINEERING_QUALITY_BASELINE` 文本与工程法案 §二.9 文本。
- 不新增固定测试角色；不新增 `cardKind`；不新增 `FlowStepKind`（推荐 A）。
- 不删除、不重写历史 nomination 文件、历史 flow YAML、既有角色卡。
- 不提交、不推送、不合并、不发布。

### 1.4 基线（写计划时实测，2026-10-22）

| 项 | 值 |
| --- | --- |
| HEAD | `c3693ecdcb78bd83def351c0f2967571dad7174c` |
| 工作树 | `M docs/communication/memo.md`（沟通角色自身 memo，非本次候选）；`?? docs/communication/2026-10-22_intent_governance-split-1-3-5.md`；`?? docs/planning/` |
| 已跟踪代码/测试改动 | 无 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops |
| Node 要求 | `package.json` engines：`node >=23.6`；平台 Windows 11 |

`docs/` 不是整体未跟踪：当前已有 6 个 `docs/` 文件被跟踪（含上一轮 acceptance-risk-tier 记录）；本计划、验收标准、验收报告、变更包会新增为未跟踪文件。候选身份以产品代码/测试文件的哈希与已跟踪 diff 为准，不把管理记录混入产品候选。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认 | `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` |
| 闸门 1：方案确认 | 已确认（草案 v1，按推荐项） | 同上「闸门 1 确认记录」 |
| 闸门 2：角色指派/写集确认 | **已确认（2026-10-22，客户选择「确认并授权实施」）** | `docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」 |
| 客户实施授权 | **已记录（2026-10-22，与闸门 2 同次明确选择）** | 同上 |
| 实施前验收标准 | 独立验收正在写；写盘后须由沟通确认 | `docs/acceptance/governance-split-1-3-5-criteria-v1.md` |

### 2.1 实施授权与闸门 2 是两个事实（均已具备）

- 闸门 2 确认的是**参与角色、各自范围和写集**；实施授权是对代码实施的授权。两者分开记录。
- 2026-10-22 客户在同一次确认中选择「确认并授权实施」；确认记录已写入 `docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」。闸门 2 与实施授权均已具备。
- 阶段 B 的启动仍须满足：实施前验收标准已写盘、逐角色范围预留完成、基线回归证据已回。当前只启动阶段 A 基线；标准未确认前不开始代码改动。

### 2.2 方案文件状态头的已知不一致（不阻塞，但须记录）

策划文件头与 §2.1 仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，而沟通的闸门 1 确认记录已写明客户确认。本计划以 `docs/communication/` 的确认记录为授权事实，不改写策划文件；实施角色按策划正文的符号名与实际代码为准，不把文件头的过期状态当成未确认。

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | 无新增持续独立责任 | 变更横跨既有分层（Model/Provider、门禁引擎、编排、桌面 Interface、渲染层、跨角色测试），每一部分都是现有角色的职责。产品内部的 Convener/Crew/Verifier 职责变化是 `governance-roles.ts` 的数据/行为变更，不是本仓库新增角色。独立验收本来就是独立管理角色 |
| 2. 范围归属 | 现有 owner 精确覆盖；仅一处条件性缺口 | §10.1/§10.2 的产品源码与测试路径逐个映射到现有 Section 1（见 §四）。`test/桌面应用/` 是**单文件条目**：新增测试文件不在任何角色 Section 1 内，属条件性边界缺口；把新断言并入既有四个精确文件即可避免。`docs/scheduling/`、`docs/acceptance/` 是内置统筹/验收默认写区，不派给 worker |
| 3. 契约影响 | 有，跨角色共享契约变更 | 共享 Model（`src/model/runtime.ts`）、治理门禁动作、账本 power/物证、写路径路由、流程步骤约定、判断物证/verdict/prompt、acceptance 门槛、桌面 next-step 契约均变。单一主属：`src/model/runtime.ts` → 运行时核心；`src/model/boundary.ts`/`role.ts`/`decision.ts` → 门禁引擎（本轮不改）。须以 Model 契约先行冻结，下游再并行 |
| 4. 证据独立性 | 已满足 | 开发角色各自跑受影响单测/层测试；测试角色独立跑跨角色 e2e、完整流程与 T3 全量回归，并产出真实启动/演示证据；内置独立验收按实施前标准判定。实施者不自验，调度不改验收结论 |
| 5. 协调成本 | 维持现有团队最低 | 6 个现有 worker + 内置验收 + 统筹；分 4 个实施阶段、两组可并行。新增角色/拆分编排会增加建卡、边界、交接与证据成本，而写集与职责没有产生新的持续独立责任 |

### 3.2 决策表结果

**不变，派给现有角色。** 无新增、无拆分、无合并；无角色卡改动。条件项：若实施确实需要新建 `test/桌面应用/<新文件名>.test.ts`，则触发**改边界**（由 ANS 人事按本计划与闸门 2 额外确认补精确单文件条目）；本计划的默认方案是**不新建该目录下的文件**，把桌面侧新断言并入既有精确文件，从而保持「不变」。

### 3.3 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有六个 worker + 内置验收 + 统筹，按层分阶段 | **采用** | 写集与现有 Section 1 一一对应；契约、实现、测试、验收分离；协调成本最低 |
| B. 新增「治理流程」专职角色 | 否决 | 一次性跨层变更，不构成持续独立责任；现有 owner 已覆盖；新增角色会触发人事写卡与额外闸门 |
| C. 把编排拆成「治理流程」与「判断/证据」两个角色 | 否决 | 当前无过载证据；文件与契约高度耦合，拆分会增加交接与证据成本 |
| D. 由一个角色包办全部实现 | 否决 | 跨越门禁引擎、运行时核心、桌面窗口、桌面UI 的 Section 1；违反单一属主与写权限 |
| E. 用现有 `角色卡/独立验收` worker 判定本任务 | 否决 | 其 Section 1 仅覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；且会与内置独立验收形成同一候选双重验收。沿用 2026-10-22 acceptance-risk-tier 的既有决定，本任务只用内置独立验收 |
| F. 测试角色只审报告、不跑全量回归 | 否决 | T3 要求适用全量回归；测试角色须产出真实 e2e/回归/启动演示证据 |

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-10-22 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本；下表依据实际 Section 1。未列路径默认只读。

| 方案 §10 路径 / 目录 | 所属角色 | Section 1 依据（boundary.md） | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 | 「目录（私有） `src/common/门禁引擎/`」 | 是 |
| `test/门禁引擎/**` | 门禁引擎 | 「目录（测试） `test/门禁引擎/`」 | 是 |
| `src/common/编排/governance-*.ts`、`flow-state.ts`、`flow-service.ts` | 编排 | 「目录（私有） `src/common/编排/`」 | 是（限 §10.1 列明文件） |
| `src/pipeline/orchestration/run-role.ts` | 编排 | 「单文件 `src/pipeline/orchestration/run-role.ts`」 | 是 |
| `src/pipeline/orchestration/govern-session.ts` | 编排 | 「单文件 `src/pipeline/orchestration/govern-session.ts`」 | 是 |
| `test/编排/**` | 编排 | 「目录（测试） `test/编排/`」 | 是 |
| `src/model/runtime.ts` | **运行时核心** | 「单文件 `src/model/runtime.ts` / 中立运行时类型与能力契约」 | 是 |
| `src/provider/runtime/tools.ts` | 运行时核心 | 「单文件 `src/provider/runtime/tools.ts` / 公共受治理工具执行」 | 是 |
| `src/provider/runtime/schema.ts` | 运行时核心 | 「单文件 `src/provider/runtime/schema.ts` / 公共工具 schema 与描述」 | 是 |
| `test/runtime-core/**` | 运行时核心 | 「目录 `test/runtime-core/` / 本角色单元测试与契约夹具」 | 是 |
| `app/desktop/governance-advance.ts`、`interface.ts`、`session.ts`、`customer-input.ts` | 桌面窗口 | 「目录 `app/desktop/` / 桌面 Interface（主进程侧纯逻辑）」 | 是 |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/interface.test.ts`」 | 是 |
| `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/acceptance-dispatch.test.ts`」 | 是 |
| `test/桌面应用/session.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/session.test.ts`」 | 是 |
| `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/operator-wiring.test.ts`」 | 是 |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 「单文件 `test/桌面应用/e2e/main.mjs`」 | 仅当 e2e 总自检需扩展时 |
| `app/renderer/src/chat/governance-view.ts`、`role-view.ts` | 桌面UI | 「目录 `app/renderer/` / 渲染进程前端」 | 是 |
| `test/桌面UI/**` | 桌面UI | 「目录 `test/桌面UI/` / 渲染层 React 组件与设计系统守卫测试」 | 是 |
| `test/桌面应用/renderer.test.ts` | 桌面UI | 「单文件 `test/桌面应用/renderer.test.ts`」 | 仅当渲染源码不变式需同步时 |
| `test/测试/**`（e2e/跨角色/回归） | 测试 | 「目录（测试） `test/测试/`」 | 是 |
| `docs/scheduling/`（团队计划、变更包、readiness） | 统筹（内置） | 技能 `references/scheduler.md` 默认写权 | 是（不派 worker） |
| `docs/acceptance/`（验收标准、报告） | 独立验收（内置） | 技能 `references/acceptance-role.md` 默认写权；沿用 2026-10-22 既有安排 | 是（不派 worker） |

**Model 主属核对（不猜）**：

- `src/model/runtime.ts`：运行时核心唯一主属。依据 `角色卡/运行时核心/boundary.md` Section 1 单文件条目，以及 `角色卡/项目管理/docs/architecture.md`「`src/model/runtime.ts` 的单一主属为运行时核心」。
- `src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts`：门禁引擎唯一主属。依据 `角色卡/门禁引擎/boundary.md`「`src/model/` 的这三个文件是跨层共享类型，本角色是唯一主属主」与工程法案 §一.5。**本轮不改这三个文件**（`GovernanceFunction` 值不变）。
- 因此方案 §10.1 的 Model 改动全部落在 `src/model/runtime.ts`（运行时核心），不派给门禁引擎。

### 4.2 逐角色精确写集与可观察交付

#### 运行时核心（阶段 B，契约先行）

- **写集**：
  - `src/model/runtime.ts`：`GovernanceAppointmentStepPayload.teamPlanPath?`（保留 `nominationPath?` legacy）、`GovernanceJudgeRequest`/`GovernanceJudgeContext.artifacts` 的 `teamPlanPath?`/`acceptanceCriteriaPath?`/`acceptanceReportPath?`/`changePackagePath?`、`GovernanceJudgeFacts` 可选 `riskTier?`/`teamPlanConfirmed?`；`GovernanceStepKind` 保留并标注 legacy（推荐不新增）。
  - `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`：更新「提名/任命」文案与角色允许卡种说明；不新增 cardKind，不改校验形状。
  - `test/runtime-core/governance-flow-metadata.test.ts` 及 `test/runtime-core/` 下必要的新增/更新测试。
  - 自身文档：`角色卡/运行时核心/api-spec.md`、`docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）。
- **不写**：`src/service/runtime/session.ts`、`src/model/role.ts`、`src/model/boundary.ts`、`src/model/decision.ts`（除非另行获得授权并更新计划；当前不在写集）。
- **可观察交付**：Model 可选字段/类型 diff；Provider 文案 diff；受影响测试通过；`npm run typecheck` 通过；契约字段可直接被下游引用的类型证据。

#### 门禁引擎（阶段 C，与编排并行）

- **写集**：
  - `src/common/门禁引擎/governance-roles.ts`：`NOMINATOR_CARD_TEXT`、`CONVENER_CARD_TEXT`、`VERIFIER_CARD_TEXT`、`LIAISON_CARD_TEXT`/`RAPPORTEUR_CARD_TEXT` 的治理文件命名段、`BUILT_IN_GOVERNANCE_ROLES` 注册表 entries/preauthorizedDirs/forbiddenWritePaths、`LIAISON_WRITE_OWNER_HINTS`。
  - `test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`，以及 `test/门禁引擎/` 下必要的新增负例。
  - 自身文档：`角色卡/门禁引擎/api-spec.md`（按需）、`docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）。
- **写权调整边界（产品数据，不是本仓库边界）**：Convener `+docs/scheduling/`；Crew `−docs/nominations/`、新增禁写 `docs/scheduling/`；Verifier `+docs/acceptance/`；其他角色不变；不授予 Convener `角色卡/`，不授予 Crew `docs/scheduling/`。
- **可观察交付**：五张卡文本 diff；注册表 entries/preauthorized/forbidden diff；写权正/负例测试；`node --test "test/门禁引擎/**/*.test.ts"` 结果；`npm run typecheck`。

#### 编排（阶段 C，与门禁引擎并行）

- **写集**（限方案 §10.1 列明文件）：
  - `src/common/编排/governance-gate.ts`（新增 `write-team-plan` → convener；`write-role-card` 仍 nominator；错误文案；可选标准前置门槛）。
  - `src/common/编排/governance-ledger.ts`（仅在类型/注释同步确有必要时；**不新增** `GovernancePower`/`GovernanceDecisionKind`）。
  - `src/common/编排/flow-state.ts`（枚举不变；新增步骤 id 约定/注释/模板）。
  - `src/common/编排/flow-service.ts`（`artifactPowerOf`/`observeFlowArtifacts` 按需同步；不观察 `角色卡/`）。
  - `src/common/编排/governance-judge-facts.ts`、`governance-judge-evidence.ts`、`governance-judge.ts`、`governance-judge-verdict.ts`、`governance-judge-prompt.ts`（物证、推荐集、档位、verdict、prompt）。
  - `src/pipeline/orchestration/run-role.ts`（卡种白名单/默认卡种、卡前守卫、`judgeArtifactsForCard`、`computeJudgeContext`、`findDecisionArtifact`、`latestVersionedArtifact`、`governanceActionForPath`、`recordCustomerDecision`）。
  - `src/pipeline/orchestration/govern-session.ts`（标准工作流提示/Verifier 写区提示）。
  - `test/编排/governance-gate.test.ts`、`test/编排/governance-judge.test.ts`、`test/编排/flow-state.test.ts`、`test/编排/flow-service.test.ts`、`test/编排/governance-ledger.test.ts`、`test/编排/governance-session.test.ts` 及 `test/编排/` 下必要新增测试。
  - 自身文档：`角色卡/编排/api-spec.md`、`docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）。
- **不写**：`src/common/编排/governance-advance.ts`（该路径不存在；`governance-advance.ts` 实际在 `app/desktop/`，属桌面窗口）。`src/pipeline/orchestration/flow-state.ts` 是公共再导出，当前方案不要求改；若实施发现必须同步，先停止并回报统筹，不自行纳入写集。
- **可观察交付**：卡前守卫负例（计划缺失/flowId 不符/推荐集为空/含内置角色/选项不一致）；`appointment` 决定物证绑定 `-team-vN.md` 与 `latestVersionedArtifact` 扩展；`write-team-plan` 门禁正/负例；推荐集解析（内联数组）测试；`node --test "test/编排/**/*.test.ts"`；`npm run typecheck`。

#### 桌面窗口（阶段 D，与桌面UI 并行）

- **写集**：
  - `app/desktop/governance-advance.ts`（`GovernanceNextFunction`、`deriveGovernanceNextStep`、`buildGovernanceAdvanceMessage`、`buildAppointmentWriteReminderMessage`、`buildNominationAlreadyDoneMessage`、`buildAcceptanceTaskMessage`、`flowStepEvidenceKind`）。
  - `app/desktop/interface.ts`（`validateAppointmentArtifacts` 第 5 项结构校验扩展、`buildAppointmentArtifactFeedback`、`reportAppointmentArtifactIssues`、`runPostWriteAdvanceCheck`、`advanceGovernanceFlow` 的 appointment→Crew 主路径与写卡→Convener、`dispatchAcceptanceForFlow`、`noteVerifierSettle`）。
  - `app/desktop/session.ts`（能力注入/卡种路由确认；无新增能力）。
  - `app/desktop/customer-input.ts`（`notifyNextStep` 透传 appointment 计划上下文/nextFunction 映射）。
  - `test/桌面应用/interface.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/session.test.ts`、`test/桌面应用/operator-wiring.test.ts`。
  - `test/桌面应用/e2e/main.mjs`（仅当桌面端到端总自检需扩展）。
  - 自身文档：`角色卡/桌面窗口/api-spec.md`、`docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）。
- **硬约束**：**不得在 `test/桌面应用/` 新建文件**（该目录对本角色是逐文件授权，不是目录授权）。新断言并入上述四个精确测试文件或 `e2e/main.mjs`。确需新文件时停止并回报统筹，交人事改边界。
- **不写**：`app/renderer/**`（桌面UI）、`package.json`/`tsconfig.json`/`app/main.ts`/`app/preload.cjs`（装配/桌面窗口各自既有条目；本任务不改）。
- **可观察交付**：appointment→Crew 派发恰一次（运行期 Set + 账本双重去重、重启/重复事件不重派/不漏派）；写卡校验失败按来源分流（Crew 文件 vs 团队计划）；校验通过后才派 Convener；拒绝/取消不派；标准/变更包门槛与报告路径；`node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/session.test.ts test/桌面应用/operator-wiring.test.ts`；`npm run typecheck`。

#### 桌面UI（阶段 D，与桌面窗口并行）

- **写集**：
  - `app/renderer/src/chat/governance-view.ts`（appointment 徽标「提名」→「任命」、Crew 提示改为「客户任命后打开写卡」、下一步文案）。
  - `app/renderer/src/chat/role-view.ts`（nomination 说明文案；不改显示名/内部 id）。
  - `test/桌面UI/governance-view.test.ts`、`test/桌面UI/role-view.test.ts` 及 `test/桌面UI/` 下必要测试。
  - `test/桌面应用/renderer.test.ts`（仅当渲染源码不变式守卫需同步）。
  - 自身文档：`角色卡/桌面UI/api-spec.md`（按需）、`docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`package.json`。
- **构建产物**：`app/renderer/dist/` 未跟踪，允许由 `npm run build:renderer` 重新生成用于验证，但不作为候选改动路径。
- **可观察交付**：文案 diff；`node --test "test/桌面UI/**/*.test.ts"`；`test/桌面应用/renderer.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` 成功。

#### 测试（阶段 A 基线 + 阶段 E 终验）

- **写集**：`test/测试/`（目录）。至少覆盖方案 §10.2 的：
  - `governance-e2e-auto/c-appointment-timing.test.ts`、`i-full-chain.test.ts`、`l-crew-write-validation.test.ts`、`d-dispatch-listing.test.ts`、`f-acceptance-gate.test.ts`、`b-proposal-accept-timing.test.ts`；
  - 同目录受影响的 `n-invalid-governance-card.test.ts` 及 fixture；
  - `governance-trio-verify/a-listing-sessions-writes.test.ts`、`b-gates-dispatch-ledger.test.ts`；
  - `governance-judge-cards-verify/b-card-kinds.test.ts`；
  - `governance-liaison-verify/a-roles-writes-caps.test.ts`；
  - `test/测试/` 下必要的新增 e2e/负例（目录授权允许新文件）。
  - 自身文档：`角色卡/测试/feature-map.md`、`docs/fix/` 或 `docs/design/` 下的测试方案/问题记录、`memo.md`（按需）。
- **不写**：产品源码、其他角色的单测、角色卡/边界、`docs/acceptance/`、`docs/scheduling/`。
- **可观察交付**：
  - 阶段 A：当前 HEAD 的**基线全量回归**原始输出与失败分类（区分既有失败，如 Windows symlink EPERM、缺依赖适配器用例）。
  - 阶段 E：更新后的跨角色 e2e/完整流程负例与正例；T3 全量回归；真实启动/演示证据；候选哈希与 diff/status；复跑说明。

### 4.3 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹默认写区。本任务中由统筹写本计划、变更包、任务记录；**不派给任何 worker**。产品运行期的 Convener 团队计划也落在此目录（`<flowId>-team-v1.md`），但那是产品行为与测试数据，不是本仓库 worker 的写集。
- `docs/acceptance/`：内置独立验收默认写区。本任务由内置独立验收写实施前标准与验收报告；**不使用**项目 `角色卡/独立验收` worker（其 Section 1 不覆盖 `docs/acceptance/`，且会造成双重验收）。
- `docs/verification/`：产品运行期的详细证据附件目录（方案 §7.1），不是本任务 worker 的写区；本任务的原始证据随角色报告与变更包链接。
- `docs/communication/`：沟通角色写区；本计划不写，闸门 2 确认记录由沟通写入。

### 4.4 边界缺口与共享属主

| 事项 | 结论 | 处理 |
| --- | --- | --- |
| `test/桌面应用/` 新增文件 | **条件性边界缺口** | 桌面窗口该目录是逐文件授权；本计划要求把新断言并入 `interface.test.ts`/`acceptance-dispatch.test.ts`/`session.test.ts`/`operator-wiring.test.ts`/`e2e/main.mjs`。若确需新文件，交 ANS 人事按闸门 2 额外确认补精确单文件条目，不默认派发 |
| `docs/acceptance/` 归属 | 内置验收默认写区，不是项目 worker 缺口 | 本任务只用内置独立验收；项目 `角色卡/独立验收` 的迁移是另行的迁移决策 |
| `docs/scheduling/` 与项目管理 boundary 重叠 | 该目录同时出现在项目管理 boundary，用途是「任务调度记录（内容由 task_ops 写入）」 | 本项目未启用 task_ops；本任务不把 `docs/scheduling/` 列入任何 worker 写集，统筹是唯一写入者；无实际写集重叠 |
| `src/model/runtime.ts` | 运行时核心唯一主属；不是门禁引擎 | 见 §4.1 主属核对；Model 变更先行冻结 |
| 其他 §10.1/§10.2 路径 | 均被现有 Section 1 精确覆盖 | 无缺口 |

### 4.5 工作量与范围预留

工作量按文件与检查项计，不编造工时：

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 运行时核心 | 3 个产品文件 + 1–2 个测试文件 + 文档 | 阶段 B 独占 `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`test/runtime-core/` 相关文件 |
| 门禁引擎 | 1 个数据文件 + 2–3 个测试文件 + 文档 | 阶段 C 独占 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关文件 |
| 编排 | 约 10 个产品文件 + 5–7 个测试文件 + 文档 | 阶段 C 独占 `src/common/编排/` 列明文件、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`test/编排/` |
| 桌面窗口 | 4 个产品文件 + 4 个测试文件 + 文档 | 阶段 D 独占 `app/desktop/` 列明文件与四个精确测试文件 |
| 桌面UI | 2 个产品文件 + 2–3 个测试文件 + 文档 | 阶段 D 独占 `app/renderer/src/chat/` 列明文件、`test/桌面UI/` |
| 测试 | 约 10 个 e2e/验证文件 + 全量回归 + 启动演示 | 阶段 A 基线、阶段 E 终验；`test/测试/` 独占 |

范围预留规则：每个阶段开始前按角色 `roleId` 与精确路径预留；任何角色不得写其他角色的路径；同一文件同一时间只有一个写入者。阶段 B 的 Model 契约冻结前，阶段 C/D 不开始写引用新字段的代码。

---

## 五、依赖、阶段与门

### 5.1 阶段与节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| N1 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、边界变更、档位、顺序）；客户实施授权记录 | 本计划写盘 |
| N2 | 标准 | 内置独立验收 | `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（验收表、T3、判定规则、证据计划、版本冻结） | N1 |
| N3 | 基线 | 测试 | 当前 HEAD 全量回归基线原始输出与失败分类；环境事实 | N1 |
| N4 | 契约 | 运行时核心 | `src/model/runtime.ts` 可选字段/类型 + Provider 文案 + 测试证据；Model 契约冻结 | N3（基线先于代码改动） |
| N5 | 实现 | 门禁引擎 | 角色卡文本/注册表写权 + 测试证据 | N4（契约冻结） |
| N6 | 实现 | 编排 | 门禁/流程/判断/路由/会话 + 测试证据 | N4 |
| N7 | 实现 | 桌面窗口 | appointment→Crew 回路、校验/派发/验收门槛 + 测试证据 | N5、N6 |
| N8 | 实现 | 桌面UI | 文案与渲染测试 + typecheck/build 证据 | N5、N6 |
| N9 | 终验 | 测试 | 跨角色 e2e/完整流程/负例 + T3 全量回归 + 真实启动/演示证据 | N7、N8 |
| N10 | 验收 | 统筹 → 内置独立验收 | 变更包（候选哈希、改动路径、节点、证据链接、T3）→ 验收报告（通过/返工/证据不足） | N9 |
| N11 | 放行 | 统筹 → 沟通 | 按匹配当前候选的结论更新记录、释放依赖、交沟通回报 | N10 通过 |

### 5.2 并行与串行

- **必须串行**：N3 → N4（基线先于代码改动，避免把既有失败误判为新失败）；N4 → N5/N6（Model 契约冻结先于引用方）；N5/N6 → N7/N8（卡种/门禁/流程/判断契约先于桌面消费）；N7/N8 → N9（终验必须针对合并后的实际候选）；N9 → N10（验收按当前候选判定）。
- **可并行**：
  - N2 与 N3（验收标准与基线回归互不写同一路径）。
  - N5 与 N6（`src/common/门禁引擎/` 与 `src/common/编排/`、`src/pipeline/orchestration/` 写集不相交）。
  - N7 与 N8（`app/desktop/` 与 `app/renderer/` 写集不相交）。
- **不允许**：N4 与 N5/N6 并行写引用新 Model 字段的代码；N7 与 N8 互写对方目录；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`。

### 5.3 各阶段放行条件

- **N1 放行**：闸门 2 确认 + 实施授权记录齐备；本计划版本被确认记录覆盖。
- **N2 放行**：标准含验收表（ID/标准/证据/候选/产出角色/结果/判定）、T3 依据、判定规则（pass/fail/insufficient evidence/not applicable）、证据计划、版本/哈希冻结；未通过结构门槛不派实施。
- **N3 放行**：基线命令、环境、计数、失败清单与分类可复算；确认无已跟踪代码改动。
- **N4 放行**：Model/Provider 测试与 typecheck 通过；契约字段形状与方案 §8.2 一致；完成报告含候选哈希、diff/status。
- **N5/N6 放行**：各自受影响测试与 typecheck 通过；写集不越界；负例覆盖方案 §8.6 的对应项；完成报告齐全。
- **N7/N8 放行**：桌面侧测试、渲染测试、typecheck/typecheck:renderer/build 通过；N7 的去重/重启/拒绝分支有测试；N8 只改文案与断言，不改 id/名称。
- **N9 放行**：跨角色 e2e/完整流程通过；T3 全量回归完成并分类；真实启动/演示证据存在；候选哈希与 diff/status 齐全。
- **N10 放行**：变更包完整、候选可复算；独立验收按标准给出通过/返工/证据不足；调度只按匹配当前候选的结论放行。
- **N11 放行**：只表示当前候选满足标准；不授权提交、推送、合并、发布。

---

## 六、证据要求

### 6.1 通用证据（每个实施角色）

1. **写前基线**：目标文件的 `git hash-object` 与 `sha256sum`、`git rev-parse HEAD`、`git status --short`；若与计划记录不一致，停止并回报统筹。
2. **候选身份**：每个改动文件的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 表示差异分别记录，不互相误判）。
3. **改动范围**：`git diff --name-only` 必须等于该角色写集；`git diff --stat`；`git diff --cached --name-only` 为空（不暂存）；`git status --short` 无授权外已跟踪变化。
4. **原始检查输出**：命令、退出码、环境（Node 版本、OS/Shell）、测试计数（pass/fail/skip）、失败原文；跳过项写明原因。
5. **文档状态**：实现完成但未验收的文档状态如实写 `implemented-unverified`，不写成 `verified`。
6. **禁止**：不提交、不推送、不合并、不发布；不修改断言以保绿；不把计划写成结果；不伪造测试输出。

### 6.2 逐角色检查命令（最低要求）

> 命令按仓库实际脚本与既有 runner；Windows 既有失败须用基线对照，不得记为本次新失败。

| 角色 | 受影响检查 | 证据 |
| --- | --- | --- |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`（至少 `governance-flow-metadata.test.ts` 与相关契约测试）；`npm run typecheck` | 测试计数/失败原文；Model/Provider diff；类型引用证据 |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"`（至少 `governance-trio.test.ts`、`governance-standard-workflow.test.ts`）；`npm run typecheck` | 卡文本/注册表 diff；写权负例；测试计数 |
| 编排 | `node --test "test/编排/**/*.test.ts"`（至少 `governance-gate.test.ts`、`governance-judge.test.ts`、`flow-state.test.ts`、`flow-service.test.ts`）；`npm run typecheck` | 卡前守卫负例；`latestVersionedArtifact` 扩展；appointment 物证/power；测试计数 |
| 桌面窗口 | `node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/session.test.ts test/桌面应用/operator-wiring.test.ts`；可按需只读跑 `test/桌面应用/` 全目录；`npm run typecheck` | appointment→Crew 去重/重启/拒绝；校验分流；派 Convener 时机；测试计数 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`（至少 `governance-view.test.ts`、`role-view.test.ts`）；`node --test test/桌面应用/renderer.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` | 文案 diff；渲染测试；build 输出 |
| 测试 | 定向 e2e 目录先行，再 `node --test "test/**/*.test.ts"`；`npm run typecheck`；`npm run typecheck:renderer`（两者均 noEmit，不产生构建写盘） | 基线对照；全量回归计数/失败分类；e2e 正/负例；启动演示证据 |

### 6.3 T3 全量回归

- 最终候选必须跑：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`（两者均 `noEmit`）。
- `npm run build:renderer` 会写 `app/renderer/dist/`，属桌面UI 自有目录；由桌面UI 在其阶段产出构建证据，测试角色不写该路径。最终候选如需构建检查，复用桌面UI 对同一候选的构建证据（同一候选、同一命令有效）。
- 基线（N3）在实施前对当前 HEAD 跑同一组命令；最终结果与基线逐项对照，区分：
  - 本次新增失败；
  - 既有失败（如 Windows symlink EPERM、缺依赖的适配器/MCP 用例）；
  - 环境不可用/跳过。
- 任一本次新增失败不得放行；既有失败必须附基线证据与原因，不能笼统写「环境问题」。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。

### 6.4 真实启动/演示证据

工程基线要求「验收前必须真实启动应用并演示」。本轮由**测试角色**产出（方案 §7.5；团队计划指定，不由 Verifier 默认承担）：

- 启动方式：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；
- 演示内容：至少覆盖一条治理链路的关键变化——团队计划 → appointment 卡 → Crew 写卡 → Convener readiness → 实施派发 → 验收标准/变更包 → Verifier 报告与 acceptance 卡（可用产品流程夹具/离线驱动，但须真实启动应用；具体可执行程度由测试角色在标准与证据计划中说明）；
- 证据：启动命令、时间、版本/候选、访问地址或窗口截图/录屏清单、日志；缺失或失效时不得建议 accept。

---

## 七、独立验收安排

> 本节只安排验收，不代替验收标准；正式标准由内置独立验收在实施前写盘。

### 7.1 实施前完成标准

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、N4 实施前；可与 N3 基线并行。
- **路径**：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的策划方案 v1（`docs/planning/2026-10-22_design_governance-split-1-3-5.md`）+ 闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、风险档位 T3 与依据、选定检查/复用规则/全量回归条件、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则。
- **标准不得弱于**方案 §11 的 P1–P15；不得自造需求或放宽/加严标准实质。
- **冻结**：实施开始后不得改标准适配候选；确需变更时递增版本、记录理由、交沟通/统筹确认，受影响证据重新核对。

### 7.2 变更包与判定

- 统筹在 N9 完成后组装变更包：`docs/scheduling/governance-split-1-3-5-change-v1.md`，含候选哈希（产品代码/测试文件；`git hash-object` + `sha256sum`）、改动路径、任务节点 N1–N11、证据链接、风险档位 T3、复用证据与失效说明。
- 独立验收按标准与变更包判定；报告路径 `docs/acceptance/governance-split-1-3-5-report-v1.md`；报告首行必须含：风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；调度不改验收结论。
- 验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

### 7.3 证据复用与档位纪律

- 复用仅限同一候选、同一输入/依赖、同一命令的有效证据；候选/输入/依赖/契约/夹具/配置变化使受影响证据失效，只补失效部分。
- 本任务为 T3，全量回归是默认要求；若某项确无代码面（例如只改卡文本且已有针对性断言），报告中写 N/A + 理由，不能掩盖代码面。
- 独立验收可**升档**，不能降档；档位与改动不符时退回统筹或按更高档补证。

---

## 八、闸门 2 确认项与确认记录（已确认，2026-10-22）

以下为闸门 2 的确认项。客户已于 2026-10-22 选择「确认并授权实施」，确认记录见 `docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」；本节保留为确认范围核对清单。

1. **参与角色**：运行时核心、门禁引擎、编排、桌面窗口、桌面UI 为实施 worker；测试为独立测试/回归角色；内置独立验收负责实施前标准与实施后判定；统筹负责计划、派发、收证、变更包与记录。**不启用人事**（无角色/边界变更，条件项见第 3 条）；**不启用装配**（无构建配置/入口改动）。
2. **精确写集**：
   - 运行时核心：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/` 相关测试、自身文档；
   - 门禁引擎：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关测试、自身文档；
   - 编排：`src/common/编排/` 方案 §10.1 列明文件、`src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/` 相关测试、自身文档；
   - 桌面窗口：`app/desktop/governance-advance.ts`、`interface.ts`、`session.ts`、`customer-input.ts`、`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`session.test.ts`、`operator-wiring.test.ts`（及 `e2e/main.mjs` 如需）、自身文档；
   - 桌面UI：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`、`test/桌面UI/` 相关测试（及 `test/桌面应用/renderer.test.ts` 如需）、自身文档；
   - 测试：`test/测试/` 下 e2e/跨角色/回归用例与夹具、自身文档；
   - 统筹：`docs/scheduling/`；内置验收：`docs/acceptance/`。
3. **是否有角色/边界变更**：默认**无**。唯一条件项：若桌面侧必须在 `test/桌面应用/` 新建测试文件，该目录对本角色不是目录授权，需 ANS 人事按本计划与闸门 2 的额外确认新增精确单文件条目；不默认派发。推荐方案是并入既有四个精确文件，避免边界变更。
4. **档位**：T3（治理/权限变更），全量回归按适用范围执行，报告首行五项。
5. **阶段顺序**：闸门 2 + 实施授权 → 验收标准 + 基线回归 → Model/Provider 契约 → 门禁引擎/编排并行 → 桌面窗口/桌面UI 并行 → 测试终验与全量回归 → 变更包与独立验收判定 → 放行/回报。
6. **验收安排**：使用内置独立验收（写 `docs/acceptance/`），不使用项目 `角色卡/独立验收` worker；实施前标准先于实施。
7. **证据与记录**：未启用 task_ops；以文件哈希、原始命令输出、diff/status、账本/夹具测试为证据；不提交、不推送、不发布。

**客户实施授权**已在同一次确认中明确给出，并与闸门 2 分开记录；两者均已具备。

---

## 九、前置问题、风险与阻塞

1. **闸门 2 已确认，阶段 B 的硬门槛是验收标准经沟通确认**：验收标准已写盘（`docs/acceptance/governance-split-1-3-5-criteria-v1.md`），但在沟通确认其路径/版本前不派发运行时核心、不改代码。
2. **客户实施授权已记录**：客户已明确「确认并授权实施」；实施仍须严格限于本计划写集，不得扩大角色、边界或写权。
3. **条件性边界缺口（`test/桌面应用/` 新文件）**：见 §4.4/§八第 3 条；默认并入既有精确文件，确需新文件时交人事改边界并补闸门 2 确认。
4. **共享属主与证据失效**：`src/model/runtime.ts` 是运行时核心唯一主属，改动会使所有引用方既有证据失效；`src/model/{boundary,role,decision}.ts` 是门禁引擎主属，本轮不改。工程法案 §一.5 规定共享抽象单一主属，并明确门禁引擎三个 Model 文件改动须先经项目管理协调；`runtime.ts` 按架构文档的单一主属执行。本计划把 Model 契约影响列入协调记录，项目管理只读、不获得产品写权。Model 必须先冻结（N4），下游再写。
5. **appointment→Crew 回路（最高风险）**：任命卡从 Crew 移到 Convener 后，客户决定不会自然回到 Crew；必须在 `deriveGovernanceNextStep`/`advanceGovernanceFlow` 显式派 Crew，并用运行期 Set + 账本双重去重覆盖重启/重复事件；验证恰一次派发、拒绝/取消不派、Crew 未写卡不派 Convener。
6. **`latestVersionedArtifact` 扩展**：当前只扫 `docs/proposals|nominations` 的 `<flowId>-vN.md`；团队计划 `-team-vN.md` 必须扩展匹配，否则 appointment 决定绑不到计划哈希。不得靠猜目录或静默回落。
7. **推荐集解析格式**：团队计划必须用内联 `recommended: [role-a, role-b]` 或固定行；YAML 块数组会被现有解析器当作空推荐集并回落手动。实施时要么扩展解析器，要么由卡前守卫明确拒绝空集；不得静默接受。
8. **测试冻结与断言更新**：大量测试冻结角色卡文本、写权、appointment 时序、验收消息（`governance-trio`、`governance-standard-workflow`、`governance-e2e-auto/*`、`governance-trio-verify/*`、`governance-judge-cards-verify/*`、`governance-liaison-verify/*`、`test/桌面应用/*`）。各 owner 更新断言必须对应真实行为变化，不得删测试/放松断言保绿；测试角色负责终验，不接受「自测通过」替代集成。
9. **`docs/` 跟踪状态与候选口径**：当前有 6 个已跟踪 `docs/` 文件，新计划/标准/报告/变更包为未跟踪；候选身份以产品代码/测试文件哈希与已跟踪 diff 为准，不把管理记录混入候选，也不把未跟踪文件冒充产品改动。
10. **无 task_ops**：无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件与原始输出为准。
11. **`docs/scheduling/` 重叠**：项目管理 boundary 同目录条目仅用于 task_ops 记录，本项目未启用；统筹是本任务唯一写入者，不派 worker。产品运行期 Convener 写 `docs/scheduling/<flowId>-team-vN.md` 必须声明唯一写入者与命名，避免与项目调度记录冲突。
12. **旧流程/旧卡兼容**：旧 nomination 文件、旧 flow YAML、既有角色卡保留；O4 过渡回落窗口与 Q11 迁移策略按推荐 A 实施，不删除、不重写历史；既有角色卡只做最低格式检查，不强制补齐第 5 项。
13. **方案路径笔误/行号快照**：方案 §5.4 提到的 `src/common/编排/governance-advance.ts` 不存在；实际文件是 `app/desktop/governance-advance.ts`（桌面窗口）。所有行号是 2026-10-22 快照，实施以符号名和实际代码为准，不得据笔误新建 common 文件。
14. **策划文件状态头过期**：见 §2.2；以 `docs/communication/` 的闸门 1 记录为准，不改策划文件。
15. **Windows/环境既有失败**：历史基线存在 Windows symlink EPERM、缺 npm 依赖的适配器/MCP 用例失败；N3 基线必须先记录并分类，终验只对本次新增失败负责，既有失败附证据说明。
16. **`qualityTier` 不是风险档位**：`prototype`/`production` 是质量档位；T0–T3 是风险档位，二者不得混用。
17. **真实启动/演示证据来源**：工程基线不降；本计划指定测试角色产出，测试角色不得以「Verifier 会跑」为由省略；缺失时验收判证据不足。
18. **O1–O5 与 O6 边界**：O1–O5 已按闸门 1 纳入；O6（新增固定测试角色）不选，不得在实施中顺手新增角色或扩大团队。
19. **共享组件/工程法案边界**：本轮不改 `src/common/shared/`、`角色卡/项目管理/docs/project-rules.md`、`ENGINEERING_QUALITY_BASELINE` 文本；若实施发现必须改，停止并回报统筹，由项目管理/策划按各自归属处理。
20. **产品运行期 `docs/scheduling/` 写区与项目治理记录同名风险**：产品 Convener 的团队计划、readiness、变更包都用 `<flowId>-vN.md` 命名；在本仓库演示/测试时不得覆盖既有的 `2026-10-22-acceptance-risk-tier.md` 等调度记录。测试夹具应使用独立 flowId/临时目录。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`）。
- **已确认**：闸门 2 与客户实施授权（2026-10-22，记录见 `docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」）。
- **已完成**：阶段 A 基线回归（测试角色，独立固定上下文；证据见 §11.3）。
- **已确认**：实施前验收标准 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（哈希见 §11.4；沟通已确认，N4 已放行）。
- **已完成**：阶段 B（Model/Provider 契约，运行时核心；候选哈希与复核见 §11.6；状态 `implemented-unverified`）。
- **已完成**：阶段 C（门禁引擎 + 编排并行；候选哈希、测试与复核见 §11.8；状态 `implemented-unverified`）。
- **已完成（初始写集）**：阶段 D（桌面窗口 + 桌面UI 并行；候选哈希、测试与复核见 §11.10；状态 `implemented-unverified`）。
- **已完成（补充写集）**：`test/桌面应用/dispatch-delivery.test.ts` 夹具修复（见 §11.11；52/52；阶段 D 收口）。
- **已完成**：阶段 E（测试终验/T3 全量回归/真实启动演示/canonical e2e；见 §11.13）。
- **已写盘**：变更包 `docs/scheduling/governance-split-1-3-5-change-v1.md`（候选 53 文件、T3、证据链接、复用/失效说明）；提交后未再修改（blob `fa2d6aba3775fd523a3e447cb6f0105e87352828`）。
- **已完成**：阶段 F（内置独立验收）判定**通过（当前候选）**；N10 完成、N11 放行（见 §11.14）。
- **未做**：提交、推送、合并、发布；验收通过不授予这些动作。
- **下一步**：由沟通向客户回报验收结论；提交/推送/合并/发布由客户另行决定。

## 十一、闸门 2 确认、实施授权与阶段 A 记录（2026-10-22）

### 11.1 闸门 2 与实施授权

- **客户选择**：**确认并授权实施**（2026-10-22，本地）。
- **确认对象**：本团队计划（2026-10-22 版本）。
- **确认记录**：[`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`](../communication/2026-10-22_intent_governance-split-1-3-5.md)「闸门 2 确认与实施授权记录」。
- **确认范围**：参与角色（6 个现有 worker + 内置验收 + 统筹；不启用人事、装配）；按团队计划 §4.2/§八的逐角色精确写集；默认不新建 `test/桌面应用/` 文件；角色/边界无变更（条件项保留）；T3；阶段顺序；证据口径。
- **实施授权**：与闸门 2 分开记录；客户明确选择「确认并授权实施」，两者均已具备。

### 11.2 阶段 A：基线回归派发

- **节点**：N3 基线回归。
- **角色**：测试（独立固定角色上下文；绑定 `角色卡/测试/role-card.md` 与 `boundary.md`）。
- **授权范围**：只读基线；不修改产品代码、测试、角色卡、边界、`docs/scheduling/`、`docs/acceptance/`；不暂存、不提交、不推送；写区仅 `角色卡/测试/docs/`（基线证据记录）。
- **命令**：`node --test "test/**/*.test.ts"`；`npm run typecheck`；`npm run typecheck:renderer`；记录 Node/npm 版本、OS、退出码、测试计数、失败清单、HEAD 与工作树状态。
- **边界说明**：不运行 `npm run build:renderer`（该命令写 `app/renderer/dist/`，属桌面UI 后续证据；测试角色不写该路径）。
- **状态**：已完成（2026-10-22；原始证据见 §11.3）。
- **阶段 B 停点**：`docs/acceptance/governance-split-1-3-5-criteria-v1.md` 已写盘，等待沟通确认其路径/版本；确认后派发运行时核心。

### 11.3 阶段 A 基线证据（测试角色回报，2026-10-22）

- **执行者**：测试角色独立固定上下文（agent `a06b097ae325ebda3`）；仅只读基线，未开始任何代码修改。
- **环境**：Windows 11 Pro 10.0.26300；Git Bash 5.3.15；Node v24.22.1；npm 11.19.1；分支 `feat/background-tasks-governance-and-reasoning`。Node/npm 需将 `C:\Users\51054\AppData\Local\Programs\nodejs` 加入 PATH。
- **HEAD**：`c3693ecdcb78bd83def351c0f2967571dad7174c`（前后一致）。
- **工作树**：命令前与预期基线一致（`M docs/communication/memo.md`；`?? docs/communication/2026-10-22_intent_governance-split-1-3-5.md`；`?? docs/planning/`；`?? docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`）；`git diff --cached` 空；无其他已跟踪代码/测试变化。命令后仅新增测试角色获准写区证据（`角色卡/测试/docs/`，未跟踪）；另观察到独立验收并行写入的未跟踪 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（N2 产物，非测试角色写入）。
- **命令与退出码**：
  - `npm run typecheck` → 0（1,459ms，无诊断）；
  - `npm run typecheck:renderer` → 0（638ms，无诊断）；
  - `node --test "test/**/*.test.ts"` run1 → 1（23,129ms；tests 3416 / pass 3386 / fail 12 / skipped 18 / todo 0）；
  - 同命令 run2 对照 → 1（23,236ms；tests 3416 / pass 3388 / fail 10 / skipped 18 / todo 0）；
  - 无命令超时。
- **失败分类**：
  - **确定性既有失败 10 项**（两次全量均出现）：
    - Windows symlink EPERM 9 项（环境：无创建符号链接权限，errno -4048）：`test/claude-adapter/session.test.ts:637`；`test/codex-adapter/session.test.ts:351`；`test/pi-adapter/injected-runtime.test.ts:185、193`；`test/runtime-core/file-write-safety.test.ts:97`；`test/runtime-core/session-store.test.ts:46、58`；`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`；`test/编排/shell-authorized-routine.test.ts:103`。
    - `test/测试/real-entry.test.ts:38`「真实入口:演示不产生 docs/scheduling 记录(F3)」1 项：该用例断言仓库根 `docs/scheduling` 不存在，但未跟踪的团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` 已存在；属**调度记录导致的基线红**，非产品缺陷、非缺依赖、非超时。阶段 E 终验时该记录仍在则会持续红：按既有失败对照，不得删除调度记录或改断言。
  - **偶发时序失败 2 项**（仅 run1；run2 与单文件复跑均通过，判为全量并发负载下偶发）：`test/桌面应用/acceptance-dispatch.test.ts:1265`（waitFor 约 3.1s 超时；单文件复跑 34/34 exit 0）；`test/桌面应用/dispatch-delivery.test.ts:1023`（role_status 期望「当前轮：进行中」，实测 busy=false/timed_out；单文件复跑 52/52 exit 0）。
  - **skipped 18 项**：平台/环境型按设计跳过（1 项 SIGTERM 进程组、1 项 chmod 语义、15 项 D3 权限/umask/chmod/sync、1 项 unreadable 权限）；无「缺依赖导致整文件无法运行」、无超时。
- **未运行**（按任务书与写区）：`npm run build:renderer`（写 `app/renderer/dist/`，属桌面UI）、`npm run app`、Electron e2e/uiux、真实模型、打包。
- **证据**：
  - `角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-baseline.md`
  - `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-baseline-evidence/`（`typecheck.log`、`typecheck-renderer.log`、`full-test-node.log`、`full-test-summary.txt`、`full-test-node-run2.log`、`full-test-summary-run2.txt`、`rerun-acceptance-dispatch.log`、`rerun-dispatch-delivery.log`）
- **写区声明**：除 `角色卡/测试/docs/` 外未写任何文件；未修改产品代码、测试源码、角色卡、边界、`docs/scheduling/`、`docs/acceptance/`；未在 `test/桌面应用/` 新建文件；未运行 `npm install`；未暂存、提交、推送、合并或发布。
- **用途**：阶段 E 终验以本基线对照，仅对本次新增失败负责；上述既有失败与偶发项按证据分类，不得笼统写「环境问题」。

### 11.4 实施前验收标准状态

- **文件**：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（2026-10-22 写盘；标准版本 `governance-split-1-3-5-criteria-v1`；T3；结论「待判定」）。
- **观察**：文件头已记录闸门 0/1/2 与实施授权，并声明只建立标准、不判定候选。
- **统筹结构预检（只读，2026-10-22）**：含验收表（P1–P15、G1–G4）、风险档位 T3 与依据、判定规则（pass/fail/insufficient evidence/not applicable）、证据失效矩阵、T3 全量回归规则、版本冻结与报告要求；结构上满足 N2 放行门槛。该预检不代替沟通确认，也不代替独立验收判定。
- **沟通确认（2026-10-22）**：路径 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`；`git hash-object` = `85f50a7bd26097e43d10400ef5cbcc579be22166`；SHA-256 = `e97eadec8ca41205c515b3ae559259e9de006c93b17a7f4ad898752c65346259`；578 行；19 条标准；T3。统筹独立复算一致。**已放行 N4（阶段 B）**。
- **状态**：**已写盘并经沟通确认**；阶段 B 已派发运行时核心。标准未与候选混同：标准是验收基线输入，候选另行以产品代码/测试哈希标识。

### 11.5 阶段 B：Model/Provider 契约派发（2026-10-22）

- **节点**：N4（契约）。
- **角色**：运行时核心（独立固定角色上下文；绑定 `角色卡/运行时核心/role-card.md` 与 `boundary.md`）。
- **授权写集**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/**`（含 `test/runtime-core/governance-flow-metadata.test.ts`）；自身文档 `角色卡/运行时核心/docs/change/`、`api-spec.md`、`memo.md`（按需）。
- **明确不写**：`src/model/{boundary,role,decision}.ts`、`src/service/runtime/session.ts`、其他角色目录、`test/桌面应用/`、`docs/scheduling/`、`docs/acceptance/`。下游因契约变更出现的编译错误不得由本 worker 跨边界修改，必须停止并回报统筹。
- **契约要求**：按方案 §8.2/§10.1 增加可选字段（`teamPlanPath`、acceptance criteria/report/change package path、`riskTier`/`teamPlanConfirmed`），保留 `nominationPath` legacy；`GovernanceStepKind` 保留/标注 legacy；Provider 只更新卡种说明文案，不新增 `cardKind`、不改校验形状；所有新增字段向后兼容。
- **证据要求**：写前/写后文件哈希（`git hash-object`、`sha256sum`）；`git diff --name-only` 必须等于写集；`git diff --stat`；`git status --short`；`git diff --cached` 空；`node.exe --test "test/runtime-core/**/*.test.ts"` 与 `npm run typecheck` 的原始输出、退出码、计数；契约偏差逐条报告。
- **状态**：已完成（2026-10-22；证据见 §11.6）。阶段 C/D 未启动。

### 11.6 阶段 B 结果与候选证据（运行时核心回报 + 统筹独立复核，2026-10-22）

- **执行者**：运行时核心 worker（固定角色上下文，agent `a10ef503f79176715`）。
- **写前基线**：HEAD `c3693ec...` 未变；`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/governance-flow-metadata.test.ts` 的 `git hash-object`/sha256 与任务书逐字一致；无意外已跟踪改动。
- **契约改动（全部可选、向后兼容）**：
  - `GovernanceAppointmentStepPayload.teamPlanPath?`；`nominationPath?` 保留 legacy（`@deprecated`）。
  - `GovernanceJudgeRequest.artifacts` / `GovernanceJudgeContext.artifacts`：新增 `teamPlanPath?`、`acceptanceCriteriaPath?`、`acceptanceReportPath?`、`changePackagePath?`；两处同形；`nominationPath?` legacy。
  - `GovernanceJudgeFacts`：新增可选 `riskTier?`（T0–T3）与 `teamPlanConfirmed?`。
  - `GovernanceStepKind`：保留四值，`nomination` 标 legacy；不新增 `team-plan`，未改 `FlowStepKind`。
  - Provider：仅 `schema.ts`/`tools.ts` 文案与注释（appointment=任命、Convener 依团队计划发起、Crew 任命后 `appointment-write`）；不新增 `cardKind`，参数形状/校验/handler 未变。
- **产品候选哈希（写后）**：
  - `src/model/runtime.ts`：`git hash-object` = `120db534d7952f3320d34f21afe222067b2b744c`；sha256 = `d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9`
  - `src/provider/runtime/tools.ts`：`2023e9f08be24c577f8c1adc91fc8f5d8792271b`；`c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c`
  - `src/provider/runtime/schema.ts`：`cefd13ea40700fc8d5f5f6b37f4aa63b79fb52ab`；`4c3c7a710f5d6a3995440ad7fe68a677110d3850cbc3282647bb28fe396d24c3`
  - `test/runtime-core/governance-flow-metadata.test.ts`：`becc8b899cae085fe0ccc8acbca82b5646bfbb43`；`ce2d018f4449398e27ac0184faf5b13be3138655b2bb5fc86885941e6495077b`
- **检查（worker 原始结果）**：
  - `node --test test/runtime-core/governance-flow-metadata.test.ts` → exit 0；tests 11 / pass 11 / fail 0 / skip 0。
  - `node --test "test/runtime-core/**/*.test.ts"` → exit 1；tests 290 / pass 283 / fail 3 / skip 4；3 红与写前基线逐项相同（`file-write-safety.test.ts` ×1、`session-store.test.ts` ×2，均 Windows symlink EPERM），较基线 288/281/3/4 为 +2 计 +2 过、零新增红。
  - `npm run typecheck` → exit 0，0 错。
- **统筹独立复核（只读）**：HEAD 未变；`git diff --name-only` 仅写集文件 + 写前预置的 `docs/communication/memo.md`；`git diff --cached --name-only` 空；四个候选哈希复算与 worker 报告一致；定向测试 11/11 exit 0；`npm run typecheck` exit 0；契约 diff 逐条核对：仅可选字段/注释/文案，无行为改动。
- **契约偏差**：无。`riskTier` 落在 `GovernanceJudgeFacts`（方案 §8.2 允许「或 facts.riskTier」），未在 Context 顶层重复添加。
- **证据文档**：`角色卡/运行时核心/docs/change/2026-10-22_change_governance-split-1-3-5-model-provider.md`（`implemented-unverified`）；`角色卡/运行时核心/api-spec.md` 与 `memo.md` 已同步。
- **候选口径**：产品候选为上述 4 个产品/测试文件；`角色卡/运行时核心/*` 为角色证据文档，`docs/` 管理记录不混入产品候选。
- **状态**：阶段 B 完成（implemented-unverified）；阶段 C/D 未开始；等待沟通/统筹确认后进入阶段 C。

### 11.7 阶段 C 派发与阶段 E 测试前置（2026-10-22）

- **阶段 C 已派发两个独立 worker，写集不相交、基于阶段 B 冻结契约**：
  - **门禁引擎**：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/**`、自身文档；实现 Convener 团队计划/appointment 发起、Crew 只写卡、写权调整（Convener +`docs/scheduling/`、Crew −`docs/nominations/`、Verifier +`docs/acceptance/`）、第 5 项角色卡内容要求。
  - **编排**：`src/common/编排/` 方案 §10.1 列明文件、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/**`、自身文档；实现 appointment→Crew 回路、卡前守卫、推荐集/团队计划物证、账本 power、写路径路由、判断物证/门槛。
  - 两组不写对方目录、不写 `app/`、不写 `test/测试/`、不写 `test/桌面应用/`、不写 `docs/scheduling/`、`docs/acceptance/`。阶段 D 不启动。
- **阶段 E 测试前置（沟通确认，2026-10-22）**：基线 `test/测试/real-entry.test.ts:38` 的失败是因为本任务新建了管理用的 `docs/scheduling/`（该用例断言仓库根不存在该目录）。阶段 E 由测试角色在 `test/测试/**` 内更新该断言：验证「演示不产生新的 scheduling 记录」，而不是假设目录不存在；**不得删除 `docs/scheduling/`、不得放宽为永远通过**。该测试更新须单独记录理由与证据，交独立验收判定。
- **状态**：阶段 C 已完成（2026-10-22；证据见 §11.8）；阶段 D 未启动。

### 11.8 阶段 C 结果与候选证据（门禁引擎 + 编排，统筹独立复核，2026-10-22）

#### 11.8.1 门禁引擎（agent `a149008afc63dd678`）

- **写前基线**：HEAD 未变；`governance-roles.ts`、`governance-trio.test.ts`、`governance-standard-workflow.test.ts` 哈希与任务书逐字一致；无意外已跟踪改动。
- **改动摘要**：
  - Crew 卡：移除提名权/选角色/`docs/nominations/**`/appointment 发起；改为读团队计划 → `appointment-write` → 逐路径写卡；加入第 5 项内容清单（方案 §6.1 的 1–16 项）；计划缺细节停止并报告 Convener；保留技能/MCP。
  - Convener 卡：新增团队判断/团队计划/`request_choice(cardKind=appointment)`/role-readiness/变更包；保留不写角色卡；写区 +`docs/scheduling/`。
  - Verifier 卡：新增实施前标准/风险档位/证据核对与复用/报告首行五项；写区 +`docs/acceptance/`；真实启动/演示基线不降，证据来源改为实施/装配/测试角色。
  - Liaison/Rapporteur 命名段：团队计划路径；nominations 标 legacy；其他命名规则不变。
  - 注册表：Convener +`docs/scheduling/`；Crew −`docs/nominations/`、禁写 `docs/scheduling/`；Verifier +`docs/acceptance/`；其他角色不变。未新增 cardKind，角色 id/显示名/`GovernanceFunction`/工程基线文本未变。
  - `LIAISON_WRITE_OWNER_HINTS`：`docs/scheduling/`→Steward、`docs/acceptance/`→Proof；Crew 提示移除 nominations。
- **候选哈希（关键）**：
  - `src/common/门禁引擎/governance-roles.ts`：`4573b5cc2da48f79e5abd3ed5e76503ac120a471`（sha256 `d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f`）
  - `test/门禁引擎/governance-trio.test.ts`：`daaa9f4f7e01a499b4929a5b3470688d28bb2f08`
  - `test/门禁引擎/governance-standard-workflow.test.ts`：`813b46939417c93c52d02e982e5a5a219a06d884`
  - `test/门禁引擎/liaison-role.test.ts`：`7721c99f7de3d15ff38a248b6f1d1f6f0f7ea353`
- **检查**：定向两文件 52/52 exit 0；`node --test "test/门禁引擎/**/*.test.ts"` → 305 计 / 304 过 / 0 失败 / 1 skip（Windows 既有 skip），exit 0；`npm run typecheck` 最终 exit 0（中途曾因并发编排编辑 `run-role.ts` 出现瞬时 TS2554，编排完成后复跑 0）。
- **证据**：`角色卡/门禁引擎/docs/change/2026-10-22_change_governance-split-1-3-5-roles.md`（`implemented-unverified`）；`api-spec.md`/`memo.md` 已同步。

#### 11.8.2 编排（agent `aedcc1ccfc1554a1d`）

- **写前基线**：HEAD 未变；17 个目标文件哈希与任务书逐字一致；暂存区空；阶段 B 改动属预期。
- **改动摘要**：
  - `governance-gate.ts`：`write-team-plan`→convener（复用提案接受门）；legacy `write-nomination` 保留；O2 派发前置门槛（已有 appointment 的 flow 要求 criteria 存在且结构合格；`accept-quick`/旧流程显式豁免）+ `validateAcceptanceCriteriaText`；错误文案改为团队计划/任命分工。
  - `governance-ledger.ts`：不新增 power/decision kind（仅注释）；appointment 由 Convener 发起时 power=`schedule`。
  - `flow-state.ts`：枚举不变；注释登记 `team-plan`/`appointment`/`role-cards`/`role-readiness`/`acceptance-criteria`/`change-package` step id 约定。
  - `flow-service.ts`：行为不变；确认团队计划/readiness/标准/变更包作为普通 artifact 可观察、不观察 `角色卡/`。
  - 判断四件套：appointment→团队计划物证；appointment-write→teamPlan+flow；acceptance→proposal+flow+标准/报告/变更包；推荐集复用 `parseRecommendedRoleIds`（团队计划优先、legacy 提名回落）；报告首行五项 + 报告档位不得低于变更包（否则 insufficient-evidence/manual）；`SOURCE_WRITE_ROOTS` convener +`docs/scheduling`、verifier +`docs/acceptance`、nominator −`docs/nominations`。
  - `run-role.ts`：Crew 去 appointment、Convener 加 appointment 与默认卡种；Convener appointment 卡前六项守卫（失败 `declined+notPresented`，不触达客户/不调判断/不写账本）；团队计划推荐集/物证/版本扫描（`-team-vN`、`-criteria-vN`、`-report-vN`、`-change-vN`）；appointment 绑定 `docs/scheduling/<flowId>-team-vN.md`；`docs/scheduling/<flowId>-team-vN.md`→`write-team-plan`；appointment power=`schedule`；acceptance `facts.riskTier`。
  - `govern-session.ts`：标准工作流、Crew/Steward/Proof 纪律与报告路径/档位提示同步。
- **候选哈希（11 个产品文件）**：
  - `src/common/编排/governance-gate.ts`：`d932a6e5b3fe4e1e0193a26bb5a764c7c1b1a40e`
  - `src/common/编排/governance-ledger.ts`：`c29a78ae763769f9e204c7dc59a5eb2667df8b61`
  - `src/common/编排/flow-state.ts`：`02ee95429e00c4c9f98534bfa21e950c40523013`
  - `src/common/编排/flow-service.ts`：`2679703027850c948772fd59f93cc1ed171d08d1`
  - `src/common/编排/governance-judge-facts.ts`：`66cd2ad15c78392a27a02047c06d19f56d25fc67`
  - `src/common/编排/governance-judge-evidence.ts`：`803dc791271a31278ccf333eac31124551eefa2a`
  - `src/common/编排/governance-judge.ts`：`a0d315e60579dbcd11e21ec72e816eecaecda7d8`
  - `src/common/编排/governance-judge-verdict.ts`：`ed14a98d9800df5debf6bb6f8aa49b204a8dfca6`
  - `src/common/编排/governance-judge-prompt.ts`：`e6eb723424045ab00add38241fa94a10e9597042`
  - `src/pipeline/orchestration/run-role.ts`：`e77e9ffd34304a4f0c47708f15223dea5544bd6e`
  - `src/pipeline/orchestration/govern-session.ts`：`c6723b8c9d9da14ea554b4ed081936ab6edc32fa`
- **检查**：定向 gate 20/20、judge 81/81、flow-state 35/35、flow-service 22/22、governance-session 30/30、ledger+decision 32/32 均 exit 0；`node --test "test/编排/**/*.test.ts"` → 735 计 / 734 过 / 1 失败 / 0 skip，exit 1；唯一红 `test/编排/shell-authorized-routine.test.ts:103` 为阶段 A 基线已有的 Windows symlink EPERM，非本批新增；`npm run typecheck` exit 0。
- **偏差（如实登记）**：
  1. 任务书要求的 `team-plan*→artifact` legacy Markdown 映射实件是 `app/desktop/governance-advance.ts::flowStepEvidenceKind`（桌面窗口，阶段 D）；本阶段未改 `app/**`，仅在 `flow-state.ts` 注释登记约定并用测试固化。
  2. appointment→Crew 桌面派发回路、`validateAppointmentArtifacts`/桌面 UI 文案属阶段 D，未做。
  3. `test/测试/` 跨角色 e2e 与 T3 全量回归属阶段 E，未做。
  4. `teamPlanConfirmed` 按阶段 B 契约落在 `GovernanceJudgeFacts`，未在 Context 顶层重复添加。
- **证据**：`角色卡/编排/docs/change/2026-10-22_change_governance-split-1-3-5-flow.md`（`implemented-unverified`；git `f3f2cd03a0bfd6e860d77eca88390610fda23208`）；`api-spec.md`/`memo.md` 已同步。

#### 11.8.3 统筹独立复核（只读，两组完成后）

- HEAD `c3693ec...` 未变；`git diff --cached --name-only` 空。
- `git diff --name-only` 的已跟踪变更为阶段 B 4 个产品/测试文件 + 阶段 C 门禁引擎 1 个产品文件/3 个测试 + 编排 11 个产品文件/7 个测试 + 三组角色文档 + 写前预置的 `docs/communication/memo.md`；**无 `app/**`、`test/测试/**`、`test/桌面应用/**`、`src/model/{boundary,role,decision}.ts`、`docs/acceptance/**`、`docs/scheduling/**` 的 worker 写入**。
- 关键候选哈希复算与两组报告一致（门禁 `4573b5c...`；编排 `d932a6e...`、`a0d315e...`、`e77e9ff...`、`c6723b8...`）。
- 复核重跑：`npm run typecheck` exit 0；`test/门禁引擎/**` 305/304/0/1 exit 0；`test/编排/**` 735/734/1/0 exit 1（唯一红为基线既有 symlink EPERM）。与两组报告一致，零新增红。
- 关键行为抽查：`TRIO_CARD_KINDS` 已改为 nominator `["appointment-write","write"]`、convener `["appointment","schedule-write","write"]`；Convener 默认 appointment；`write-team-plan`→convener；`docs/scheduling/`/`docs/acceptance/` 写区与 Crew 禁写已落；团队计划卡前守卫/推荐集/版本扫描/验收门槛有对应代码与测试。
- **契约偏差**：无功能性偏差；编排 §11.8.2 的 4 项为阶段边界说明，不是范围外改动。

- **状态**：阶段 C 完成（implemented-unverified）；阶段 D 已启动（见 §11.9）；等待沟通/统筹确认后进入阶段 E。

### 11.9 阶段 D 派发与阶段 E 前置（2026-10-22）

- **阶段 D 已派发两个独立 worker，写集不相交、以阶段 B/C 契约为准**：
  - **桌面窗口**：`app/desktop/governance-advance.ts`、`interface.ts`、`session.ts`、`customer-input.ts`；既有 `test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`session.test.ts`、`operator-wiring.test.ts`（`e2e/main.mjs` 仅在总自检需扩展时）；自身文档。**不得在 `test/桌面应用/` 新建文件；不得改 `app/renderer/`。**
    - 实现：appointment→Crew 回路（不是直接派 Convener）、团队计划/任命名单/stepId、运行期+账本双重去重与重启恢复；`validateAppointmentArtifacts` 第 5 项结构校验扩展；标准/报告/变更包门槛；`team-plan*` 的 `flowStepEvidenceKind`；拒绝/取消不派；写卡后校验通过再派 Convener。
  - **桌面UI**：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`、`test/桌面UI/**`（`test/桌面应用/renderer.test.ts` 仅在需同步时；该文件当前不存在，非必须）；自身文档。只改 appointment 徽标/提示「提名」→「任命」与必要文案；角色 id/显示名/路径不改。`npm run build:renderer` 写 `app/renderer/dist/`，属本角色自有目录，作为构建证据。
- **阶段 E 前置（沿用 §11.7）**：`test/测试/real-entry.test.ts:38` 由测试角色在 `test/测试/**` 内改为验证「演示不产生新的 scheduling 记录」，不删除 `docs/scheduling/`、不放宽为永远通过；理由与证据单独记录交验收。
- **阶段 D 补充写集（统筹/沟通确认，2026-10-22）**：`test/桌面应用/dispatch-delivery.test.ts` 加入阶段 D 补充写集，由桌面窗口（该文件属主、Section 1 精确覆盖）修复 O2 门槛导致的夹具缺口；属必要测试更新，不改变公共契约/权限/治理策略，沿用客户实施授权，不重开闸门 2。只改该文件，不新建 `test/桌面应用/` 文件，不碰其他写集；见 §11.11。
- **状态**：阶段 D 进行中（补充修复）；阶段 E 未启动。

### 11.10 阶段 D 结果与候选证据（桌面窗口 + 桌面UI，统筹独立复核，2026-10-22）

#### 11.10.1 桌面窗口（agent `ad1ffb3de50eda7f2`）

- **写前基线**：HEAD 未变；9 个目标文件哈希与任务书逐字一致；暂存区空。
- **改动摘要**：
  - `governance-advance.ts`：`GovernanceNextFunction` +`role-card-write`；`deriveGovernanceNextStep` appointment→Crew 写卡（不再→Convener）；proposal accept 不再产生 `followUp`（旧路径保留迁移兼容）；`buildGovernanceAdvanceMessage` 新增「Convener 写 flow+团队计划并直接发 appointment」与「appointment→Crew 写卡」任务（flowId/团队计划路径版本/名单/`stepId=role-cards`/只写名单/逐路径确认/第 5 项清单/计划缺细节报告 Convener/不扩权）；`buildAppointmentWriteReminderMessage`/`buildNominationAlreadyDoneMessage` 更新；`flowStepEvidenceKind` +`team-plan*`→artifact；新增 `buildRoleReadinessTaskMessage`/`buildAcceptanceCriteriaTaskMessage`/路径派生/系统行；`buildAcceptanceTaskMessage` 报告 `docs/acceptance/<flowId>-report-v1.md`（首行五项）、附件 `docs/verification/`、标准/变更包/riskTier/证据复用；`noteVerifierSettle` 报告路径同步。
  - `interface.ts`：`validateAppointmentArtifacts` 扩展第 5 项结构校验（role-card 必需章节、boundary 工作文档条目+实际写集、feature-map/functional-description/memo/api-spec 或 not-applicable+理由；按团队计划 new/changed 完整清单、existing 仅 warning；计划缺行/类型/职责·能力·写集·依赖 → Convener 来源）；`buildAppointmentPlanFeedback`；`reportAppointmentArtifactIssues` 来源分流、warning 不阻塞、去重不循环；`runPostWriteAdvanceCheck` 刷新 listing、逐角色校验、通过才派 Convener 做 `role-readiness`，失败不标 appointment done；`advanceGovernanceFlow` appointment→Crew 主路径（账本最新 appointment ≤300ms 有界读、团队计划优先账本 artifactPath→卡片 context→扫描 `-team-vN.md`、仅 legacy 回落提名、缺计划不派+Lead 行、写 `dispatch.accepted{targetRoleId:"nominator",stepId:"role-cards"}`、运行期+账本双重去重、拒绝/取消不派、手选差异按实际名单并提示 v2、投递后触发写卡后检查）；`dispatchAcceptanceForFlow` 新契约流程加标准/变更包门槛：标准缺失先派 Verifier 写标准（`acceptance-criteria`）并阻塞判定，变更包/riskTier 缺失不派+Lead 行，判定任务带档位/标准/变更包/报告路径（`verification`）；`noteVerifierSettle` 报告路径。
  - `customer-input.ts`：appointment 请求按结构透传可选 `teamPlanPath`；nextFunction 经 `deriveGovernanceNextStep` 单点。
  - `session.ts`：无代码改动；测试确认 Convener/Crew customerInput 仍注入、卡种仍由 run-role 单点决定。
  - 测试：仅四个既有精确文件；新增 appointment→Crew 恰一次/重启重复不重派/拒绝不派/计划缺失不派/手选差异/来源分流/new·changed 完整清单/existing warning 不阻塞/Crew 未写卡不派 Convener/readiness stepId/标准·变更包门槛/team-plan 映射/报告路径/通道注入等。`e2e/main.mjs` 未改。
- **候选哈希（关键）**：`governance-advance.ts` = `39f8d391f962f7e58edbfd757f02278dc0cdaa7d`；`interface.ts` = `2f0282d827ed6a76b42021a7fd52757d891838b9`；`customer-input.ts` = `98ed6fc3bdae3a4f252478fd2b0755cbcd2225d5`；`interface.test.ts` = `0244d9da29b5c799df56ed841149595636e4a25b`；`acceptance-dispatch.test.ts` = `0b4a1ca63425cf6fdec3323d53add34a5234ea10`；`session.test.ts` = `19ce26b0819aaeb10f4e59f308fecd9f9db53f2e`；`operator-wiring.test.ts` = `ac8e5dbd7f30dc978e8fdd09978fa485a382b226`。`session.ts`/`e2e/main.mjs` 未改。
- **检查**：`npm run typecheck` exit 0；四个精确测试 198/198 exit 0；邻近只读 `test/桌面应用/**` 513 计/511 过/2 失败——2 红均在 `test/桌面应用/dispatch-delivery.test.ts` 的 `routeDispatch` 正例/反例（trio），**不在本阶段写集、非本角色改动**；原因见 §11.10.3。
- **偏差（阶段边界）**：标准/变更包硬门槛只作用于新契约流程（flow YAML 含 `team-plan`/`role-cards`/`role-readiness`/`acceptance-criteria`/`change-package` 任一 step id）；legacy flow 保持原行为（G4/O4）。事件早于账本 append 时用 ≤300ms 有界读账本，不猜名单。桌面只做只读版本定位/计划结构读取，不复制门禁判定。旧 appointment→Convener/followUp 保留迁移兼容。
- **证据**：`角色卡/桌面窗口/docs/change/2026-10-22_change_governance-split-1-3-5-desktop.md`（`implemented-unverified`）；`api-spec.md`/`memo.md` 已同步。

#### 11.10.2 桌面UI（agent `a1cdcb04a276f2a26`）

- **写前基线**：HEAD 未变；4 个目标文件哈希一致。
- **改动摘要**：`governance-view.ts` 的 appointment 徽标「提名」→「任命」、`appointment-write`「提名」→「任命写卡」；Crew 空态提示改为「客户任命后打开写卡；只按团队计划与任命名单写角色卡与边界，不选择角色、不批准。」；`role-view.ts` Crew 副标题「提名权…」→「写卡权（客户任命后）…」；显示名/内部 id/`GovernanceFunction`/路径未改。仅改文案与断言，无逻辑/DOM/交互变化。
- **候选哈希**：`governance-view.ts` = `f72188bd8737c6056727062f3b3487a9960d2f62`；`role-view.ts` = `a3ad631cf0e9d76b40598effd8270f5c8fabe766`；`governance-view.test.ts` = `38634fec1a4db39d07534752517e8395d2e489ba`；`role-view.test.ts` = `7cbccd4a00fca9cc55d42c5badd9e15c95999f72`。
- **检查**：定向 16/16 exit 0；`test/桌面UI/**` 163/163 exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0（2654 modules；dist 被 `.gitignore` 忽略，不是候选路径）。
- **偏差**：两个可写源码中无 appointment 专属「下一步」文案（通用下一步行在写集外的 `stores/governance-store.ts`，无「提名」措辞）；未改。`test/桌面应用/renderer.test.ts` 不存在且禁止新建，未创建。
- **证据**：`角色卡/桌面UI/docs/change/2026-10-22_change_governance-split-1-3-5-ui-copy.md`（`implemented-unverified`）；`api-spec.md`/`memo.md` 已同步。

#### 11.10.3 统筹独立复核与跨角色测试夹具缺口

- HEAD `c3693ec...` 未变；`git diff --cached` 空；`app/` 改动仅 `app/desktop/{governance-advance,interface,customer-input}.ts` 与 `app/renderer/src/chat/{governance-view,role-view}.ts`；`test/桌面应用/` 无新增文件；关键候选哈希复算与两组报告一致。
- 复核重跑：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；四个精确桌面测试 198/198 exit 0；`test/桌面UI/**` 163/163 exit 0。
- **缺口**：`test/桌面应用/dispatch-delivery.test.ts`（桌面窗口精确文件，但不在阶段 D 初始写集）2/52 失败：`routeDispatch 正例（trio）`/`反例（trio）`。复核确认原因是阶段 C 新增的 O2 门槛：测试夹具 `makeTrioRoot` 只写 proposal-accept + appointment 账本，没有 `docs/acceptance/flow-a-criteria-v1.md`，门禁按新规则返回 `acceptance-criteria-missing`，而用例仍期望「门禁全过 ⇒ 受理」。这是**测试夹具未随新门槛更新**，不是产品缺陷。统筹/沟通已于 2026-10-22 确认把该文件加入阶段 D 补充写集，由桌面窗口修复；见 §11.11。
- **状态**：阶段 D 初始写集完成；补充写集修复已派发；阶段 E 未启动。

### 11.11 阶段 D 补充修复：dispatch-delivery 测试夹具（已派发，2026-10-22）

- **范围扩围依据**：统筹/沟通确认（2026-10-22）。理由：正例夹具缺少 O2 门槛要求的 `docs/acceptance/flow-a-criteria-v1.md`，属测试夹具未随新门槛更新，不是产品缺陷；该文件在桌面窗口 Section 1 精确覆盖内，属直接必要的测试更新，不改变公共契约/权限/治理策略，沿用客户实施授权，不重开闸门 2。
- **补充写集（仅此一个文件）**：`test/桌面应用/dispatch-delivery.test.ts`。不新建 `test/桌面应用/` 文件，不碰其他写集。
- **修复要求**：
  - 正例夹具在临时项目根写入结构合格的 `docs/acceptance/flow-a-criteria-v1.md`：frontmatter `flowId: flow-a`（与流程一致）、正文含 `flow-a`、验收表（表头含 `ID` 列 + 分隔行）、风险档位 T0–T3、pass / fail / insufficient evidence 判定规则、证据计划（「证据计划/需要的证据」）、版本/冻结规则。
  - 反例按「缺失」与「结构不合格」分别断言 `acceptance-criteria-missing` / `acceptance-criteria-invalid`（或门禁实际返回的对应 reason/文案）；不得删除门槛、不得放宽为永远通过。
  - 只改该文件；保持既有其他用例不变。
- **证据要求**：写前/写后 `git hash-object`/`sha256sum`；`git diff --name-only` 仅该文件（+ 既有阶段 B/C/D 改动）；`git diff --stat`；`git status --short`；`git diff --cached` 空；重跑 `node --test test/桌面应用/dispatch-delivery.test.ts` 与阶段 D 四个精确测试的命令、退出码、计数；任何偏差逐条报告。
- **结果（2026-10-22，桌面窗口回报 + 统筹复核）**：
  - `test/桌面应用/dispatch-delivery.test.ts`：`git hash-object` = `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232`；`git diff --stat` = 112 insertions / 7 deletions；未新建 `test/桌面应用/` 文件；`git diff --cached` 空。
  - 修复方式：正例夹具写入结构合格的 `docs/acceptance/flow-a-criteria-v1.md`（frontmatter flowId、验收表 `ID` 列、T0–T3、pass/fail/insufficient evidence、证据计划、版本/冻结）；反例分别覆盖缺失/结构不合格（`acceptance-criteria-missing`/`acceptance-criteria-invalid`）。未删除门槛、未放宽断言。
  - 检查：`node --test test/桌面应用/dispatch-delivery.test.ts` → exit 0；tests 52 / pass 52 / fail 0 / skipped 0。阶段 D 四个精确测试此前 198/198 仍有效（同一候选的测试文件未再变更）。
  - **状态**：阶段 D 补充修复完成；阶段 D 收口。
- **阶段 E**：已按 §11.12 派发测试角色。

### 11.12 阶段 E：测试终验、T3 全量回归与变更包（已派发，2026-10-22）

- **节点**：N9（终验）+ N10 变更包准备。
- **角色**：测试（独立固定角色上下文；绑定 `角色卡/测试/role-card.md` 与 `boundary.md`）。
- **授权写集**：`test/测试/**`（含 `real-entry.test.ts` 更新与 canonical e2e/负例/夹具）；自身文档 `角色卡/测试/docs/`。**不写**产品源码、其他角色测试目录、`test/桌面应用/`、`test/编排/`、`test/门禁引擎/`、`test/桌面UI/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界；不新建 `test/桌面应用/` 文件。
- **任务**：
  1. 更新 `test/测试/real-entry.test.ts:38`：验证「演示不产生新的 scheduling 记录」，不得假设仓库根没有 `docs/scheduling/`；不删除管理记录、不放宽为永远通过；理由与证据单独记录。
  2. T3 全量回归：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；与阶段 A 基线逐项对照；9 个 Windows symlink EPERM 作为既有环境红逐条指名；不得把新增红归为基线红。`build:renderer` 写 `app/renderer/dist/`（已忽略、非候选路径），只作验证命令。
  3. 真实启动/演示证据：按团队计划 §6.4，用 `npm run app` 或 `test/桌面应用/e2e/main.mjs`；记录启动命令、访问地址/截图、关键输出；不能以单元测试/mock 代替。
  4. canonical e2e/跨角色链路：提案接受→Convener 团队计划→appointment→Crew 写卡→Convener readiness→实施→标准/变更包→Verifier→acceptance；负例覆盖拒绝/取消、计划缺失、Crew 未写卡、校验失败、证据不足、档位不符等。
  5. 候选包含阶段 B/C/D 的全部产品/测试改动 + 本次 `real-entry` 测试更新；不提交/暂存/推送。
  6. 完成后整理变更包（候选哈希、改动路径、任务节点 N1–N11、证据链接、T3）与阶段 E 报告，交回沟通；**不自行宣布通过**，不继续其他阶段。
- **统筹独立复核（待）**：收到测试证据后核对候选哈希、diff/status、全量回归计数与失败分类、真实启动证据；由统筹组装 `docs/scheduling/governance-split-1-3-5-change-v1.md` 交内置独立验收。
- **状态**：已完成（2026-10-22；证据见 §11.13）；变更包已写盘；阶段 F（验收）未启动。

### 11.13 阶段 E 结果与变更包（测试角色回报 + 统筹复核，2026-10-22）

- **执行者**：测试角色独立固定上下文（agent `a68b1aea069527ad9`）；写集仅 `test/测试/**` 与自身 docs；`verified-by-tests-only`，未宣布验收通过。
- **候选**：HEAD `c3693ec...` 未变；53 个产品/测试文件；候选清单 `角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/candidate/hashes.tsv`，清单 `git hash-object` = `743f41fe07eb172624dd4353dc1e51bb8042cb0f`、SHA-256 = `2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503`；统筹逐行复核 53 个候选哈希与工作树一致（mismatches=0）；`git diff --cached` 空。
- **real-entry 更新**：`test/测试/real-entry.test.ts` 改为运行前后递归快照 `docs/scheduling/`（逐文件 SHA-256），断言演示不新增记录、不改写既有记录，并加空集反向守卫；未删除管理记录、未跳过、未放宽。单文件 16/16 exit 0；基线确定性红 10→9。
- **T3 全量回归**：
  - 测试角色并行 run1/run2：`node --test "test/**/*.test.ts"` → 3448 / 3421 / 9 / 18（exit 1，约 22.6–23.0s），9 项均为阶段 A 既有 Windows symlink EPERM。
  - 统筹串行复核：`node --test --test-concurrency=1 "test/**/*.test.ts"` → **3448 / 3421 / 9 / 18（exit 1，约 295s）**，9 项均为既有 EPERM；零新增红。
  - 统筹并行复核出现并发偶发：run1 3448/3420/10/18、run2 3448/3419/11/18；多出的失败为 `test/桌面应用/interface.test.ts`「任命→Crew 写卡主路径…」与 `test/桌面应用/acceptance-dispatch.test.ts`「verifier settle…」，隔离/整文件复跑均通过（1/1、79/79、25/25），判为全量并行负载下的桌面测试并发偶发，非产品缺陷、非基线红；已如实写入变更包。
  - `npm run typecheck` 0、`npm run typecheck:renderer` 0、`npm run build:renderer` 0（dist 已忽略）。
  - 残余观察：一次全量在未修改的 `test/pi-adapter/write-sequencing.test.ts` 挂起 >10 min，重跑正常；记为环境/并发观察项。
- **canonical e2e**：`governance-e2e-auto` 68/68、`trio` 22/22、`judge` 36/36、`liaison` 28/28，共 154/154 exit 0；覆盖正链与拒绝/取消、计划缺失/flowId 不符/推荐集空/含内置角色、Crew 未写卡、缺标准、证据不足、报告首行缺项、档位降档等负例。
- **真实启动/演示**：`test/桌面应用/e2e/main.mjs` exit 0、`E2E_PASS=true`、17 张截图；`test/测试/phase-e-governance-demo.mjs` `DEMO_PASS=true`、`DEMO_DECISIONS=proposal-accept,appointment,appointment-write,acceptance`、`DEMO_IMPL_DISPATCH=true`、7 张关键截图；证据目录 `.../phase-e-evidence/{electron-e2e,governance-demo}/`。离线无真实凭据时产品自动验收派发按设计不启动；演示以真实 Verifier 会话显式驱动，门禁/judge/账本仍为产品代码。
- **变更包**：`docs/scheduling/governance-split-1-3-5-change-v1.md`（T3；候选清单哈希；53 文件逐文件哈希；节点 N1–N11；证据链接；复用/失效说明；并行偶发与残余观察如实列出）。**验收待判定，未宣布通过。**
- **证据**：`角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-phase-e.md`（`verified-by-tests-only`）与 `...-phase-e-evidence/`（全量/套件/typecheck/build/真实启动/演示/候选哈希）。
- **状态**：阶段 E 完成；阶段 F（内置独立验收）已完成（见 §11.14）。

### 11.14 N10 完成与 N11 放行：独立验收结论（2026-10-22）

- **验收角色**：ANS 内置独立验收（`references/acceptance-role.md`；非项目 `角色卡/独立验收` worker）。
- **验收报告**：`docs/acceptance/governance-split-1-3-5-report-v1.md`；`git hash-object` = `6de76394e68baa11b1d6b745830e3a9cd5f7c760`；SHA-256 = `921f3014cc6e42bc382eb7b53e98e81474a00698d8b202daee0e9ad2c8a26fca`。
- **结论**：**通过（当前候选）**。P1–P15 全部适用行 pass、G1–G4 pass；无 fail、无 insufficient evidence。
- **候选匹配**：报告记录的候选 = 53 个产品/测试文件，清单 `git hash-object` = `743f41fe07eb172624dd4353dc1e51bb8042cb0f`、SHA-256 = `2ca97bd78439a66c383615c105d6002fa635cee47745f427d1c3be3646fdb503`；统筹复核 53 个文件哈希与工作树一致（mismatches=0）；HEAD `c3693ec...` 未变；`git diff --cached` 空。
- **关键证据（报告摘要）**：T3 全量 3448 / 3421 / 9 / 18（9 项均阶段 A 既有 Windows symlink EPERM，零新增确定性失败）；canonical e2e 154/154；Electron `E2E_PASS=true`；治理演示 `DEMO_PASS=true`；typecheck/typecheck:renderer/build 均通过；P1–P15/G1–G4 逐行核对。
- **残余观察（报告 §5 已列）**：并行负载下两个桌面测试偶发（隔离/整文件/串行通过，基线亦有同类偶发）；`dispatch-delivery.test.ts` 补充写集的记录追溯；一次 `write-sequencing.test.ts` 瞬时挂起；真实启动/演示使用脚本桩模型（Electron/preload/renderer/Interface/门禁/账本为真实产品代码）；在线模型/凭据不在本轮验收面。上述观察不构成 fail。
- **G2 补充写集追溯**：`test/桌面应用/dispatch-delivery.test.ts` 加入阶段 D 补充写集一事已由沟通补记到闸门 2 记录，作为管理记录追溯，不影响候选（该文件已在 53 个候选内，哈希 `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232`）。
- **N10**：完成（独立验收报告匹配当前候选）。
- **N11 放行**：按匹配当前候选的通过结论记录完成并释放依赖；任务在调度记录层面完成。
- **边界（必须保留）**：验收通过只表示当前候选满足标准 v1，**不授权提交、推送、合并、发布或任何对外操作**；候选任何产品/测试/角色卡/边界文件变化会使结论失效，需按标准 §3.3 重判。变更包保持提交时快照，不因验收结论改写。
- **状态**：任务完成（当前候选）；提交/推送/合并/发布由客户/沟通另行决定。

---

## 附录 A：边界覆盖证据摘录（2026-10-22 核对）

- `角色卡/门禁引擎/boundary.md` Section 1：`src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts` 为单文件条目；`src/common/门禁引擎/` 为「目录（私有）」；`test/门禁引擎/` 为「目录（测试）」；文末注明「`src/model/` 的这三个文件是跨层共享类型，本角色是唯一主属主」。
- `角色卡/编排/boundary.md` Section 1：`src/common/编排/` 为「目录（私有）」；`src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts` 为单文件；`test/编排/` 为「目录（测试）」。
- `角色卡/运行时核心/boundary.md` Section 1：`src/model/runtime.ts`（中立运行时类型与能力契约）、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` 为单文件；`test/runtime-core/` 为目录。
- `角色卡/项目管理/docs/architecture.md`：「`src/model/runtime.ts` 的单一主属为运行时核心」；「门禁引擎是 `src/model/` 下三个共享类型文件（`boundary.ts`、`role.ts`、`decision.ts`）的唯一主属主」。
- `角色卡/项目管理/docs/project-rules.md` §一.5：同一主属声明；门禁引擎三个 Model 文件的改动须先经项目管理协调。
- `角色卡/桌面窗口/boundary.md` Section 1：`app/desktop/` 为目录；`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`session.test.ts`、`operator-wiring.test.ts`、`e2e/main.mjs` 为单文件条目；该目录不是目录授权。
- `角色卡/桌面UI/boundary.md` Section 1：`app/renderer/` 为目录；`test/桌面UI/` 为目录；`test/桌面应用/renderer.test.ts` 为单文件。
- `角色卡/测试/boundary.md` Section 1：`test/测试/` 为「目录（测试）」。
- 技能 `references/scheduler.md`：统筹默认写 `docs/scheduling/`；技能 `references/acceptance-role.md`：独立验收默认写 `docs/acceptance/`。
- `角色卡/独立验收/boundary.md` Section 1：仅 `角色卡/独立验收/docs/{design,change,fix}/` 等，不含 `docs/acceptance/`；因此本任务不使用该 worker 判定（沿用 2026-10-22 acceptance-risk-tier 既有决定）。

## 附录 B：方案 §10.1/§10.2 到角色的映射摘要

| 方案条目 | 角色 |
| --- | --- |
| `governance-roles.ts`（五张卡文本、注册表、写权提示） | 门禁引擎 |
| `src/model/runtime.ts`（appointment/judge artifacts/facts/step kind） | 运行时核心 |
| `src/provider/runtime/{tools,schema}.ts`（卡种文案） | 运行时核心 |
| `src/common/编排/{governance-gate,governance-ledger,flow-state,flow-service,governance-judge*,governance-judge-facts,governance-judge-evidence,governance-judge-verdict,governance-judge-prompt}.ts` | 编排 |
| `src/pipeline/orchestration/{run-role,govern-session}.ts` | 编排 |
| `app/desktop/{governance-advance,interface,session,customer-input}.ts` | 桌面窗口 |
| `app/renderer/src/chat/{governance-view,role-view}.ts` | 桌面UI |
| `test/门禁引擎/**` | 门禁引擎 |
| `test/runtime-core/**` | 运行时核心 |
| `test/编排/**` | 编排 |
| `test/桌面应用/{interface,acceptance-dispatch,session,operator-wiring}.test.ts`、`e2e/main.mjs` | 桌面窗口 |
| `test/桌面应用/renderer.test.ts`、`test/桌面UI/**` | 桌面UI |
| `test/测试/**`（e2e、跨角色、回归） | 测试 |
| `docs/scheduling/**`、`docs/acceptance/**` | 统筹 / 内置独立验收（不派 worker） |
