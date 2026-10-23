# 团队计划：角色粒度（bounded context）与 MapReduce 并行测试

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`
- **产品 flowId（用于验收标准/变更包命名）**：`role-granularity-parallel-testing`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）
- **日期**：2026-10-22
- **状态**：**团队计划已写盘；闸门 2 已确认，客户已授权实施（2026-10-22）；N3 官方基线完成；Map A（运行时核心 + 门禁引擎）完成；Map B（编排）完成；Map C（桌面窗口 + 桌面UI）完成；Reduce（测试终验）完成；变更包已写盘；内置独立验收判定通过（当前候选），N8 完成、N9 放行；验收通过不授权提交/推送/合并/发布；未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0 记录**：[`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`](../communication/2026-10-22_intent-role-granularity-parallel-testing.md)（已确认，2026-10-22）
- **闸门 1 记录**：同上文件「闸门 1 确认记录」（客户明确选择「确认，按推荐项」，2026-10-22）
- **客户确认的策划方案版本**：[`docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`](../planning/2026-10-22_design_role-granularity-parallel-testing.md) 草案 v1（2026-10-22）；确认范围为 §13 Q1–Q12 推荐 A；第 2、4 项、角色 id/显示名/路径、工程基线文本、历史文件不改
- **风险档位**：**T3（治理/权限/流程设计变更）**
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目没有 `.ans/project.json` 任务配置（仅有 `.ans/sessions/`）；本计划不伪造任务令牌、审批、锁或机器预检记录。
- **当前停点**：闸门 2 与实施授权已具备；N3 基线回归已派发；实施前验收标准由内置独立验收写盘并经沟通确认前，不启动 Map A。团队计划写盘后不自行扩大角色、边界或写权。

---

## 一、任务与基线

### 1.1 目标

按客户在闸门 0/1 已确认的范围，实施策划方案 v1：

1. **角色粒度模型**：一个角色 = 一个 bounded context / 模块或服务；单一职责、明确契约、独立写集、独立测试面；太大要拆、太小不建角色；用五维协调成本约束；禁止纳米角色/函数级拆分。
2. **团队计划 schema v2**：在现有角色表上增加 `module`/`boundedContext`、`公开契约`、`测试面`、`并行组`、`dependsOn`、可选 `粒度理由`；增加模块清单与模块覆盖检查；确定性硬校验 + Convener readiness 语义复核。
3. **MapReduce 并行**：团队计划/flow 标出 Map 组（独立模块、写集不相交、夹具隔离、可同组并行）与 Reduce 阶段（契约冻结/集成/e2e/验收）；flow 用现有 `kind` + step id/title + 可选 `parallelGroup`/`dependsOn` 字段（方案 A，不新增 `FlowStepKind`）；测试角色按模块分片并行、每分片独立证据，Reduce 合并并跑契约/集成/e2e；验收复用同候选证据，按 T0–T3 决定强度。
4. **兼容与迁移**：`teamPlanSchema: 2` 标记新计划；旧团队计划、旧 flow、旧角色卡保持原行为；不重写历史文件。
5. **同步面**：Convener/Crew 卡文本、团队计划角色表校验、Model 类型/物证、门禁/flow/judge、桌面 readiness/UI、测试与验收文档同步。

**本轮不改变本仓库的工作团队结构**：产品内部的角色粒度规则、团队计划 schema、MapReduce 流程是本方案要实现的**产品行为**，不是本仓库新增/拆分/合并工作角色。

### 1.2 风险档位：T3

依据技能 `references/testing.md`「Risk-Based Verification and Change Packages」：治理或权限变更属于 **T3**，即使部分改动只涉及文档/角色卡文本，也不能压成 T0。本任务改变：

- 产品治理模型：角色粒度规则、团队计划 schema/校验、模块覆盖/写集/DAG/并行组；
- 产品 flow 语义：可选 `parallelGroup`/`dependsOn`、dispatch 前置依赖检查；
- 跨层共享 Model（`src/model/runtime.ts`）的 `FlowToolStepView`/`FlowToolStep`/`FlowStepSupersedeFn`/`GovernanceJudgeFacts`；
- 编排门禁/判断、桌面团队计划解析/写卡校验/任务文案、渲染层提示；
- 测试分片/证据合并与验收证据规则。

因此按 T3 管理：适用的全量回归 + 共享抽象/治理检查；不得以「只改卡文本/文案」为由压档。

### 1.3 本轮非目标（不得顺手扩大）

- 第 2 项客户入口不唯一：不改。
- 第 4 项派发权分散：不改；不新增或转移派发权。
- 角色命名/内部 id/路径（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier` 及显示名）：不改。
- 工程基线 `ENGINEERING_QUALITY_BASELINE` 与工程法案 §二.9 文本：不改。
- 不新增固定测试角色；不新增 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`。
- 不引入纳米角色/函数级拆分；不把角色拆到按钮/端点级。
- 不删除、不重写历史 `docs/nominations/**`、旧 flow YAML、旧团队计划、既有角色卡。
- 不提交、不推送、不合并、不发布。

### 1.4 基线（写计划时实测，2026-10-22）

| 项 | 值 |
| --- | --- |
| HEAD | `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（`feat(governance): split team planning from role-card writing`） |
| 上轮关系 | 上轮 1/3/5 项候选及管理记录已提交为 `64ed44a`；本轮在其之上继续，不重做上轮 |
| 工作树 | `M docs/communication/memo.md`（沟通角色自身 memo）；`M docs/planning/memo.md`（策划角色自身 memo）；`?? docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`；`?? docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`；本计划写盘后新增 `?? docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md`。以上均非产品代码改动 |
| 已跟踪代码/测试改动 | 无 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二条机器状态 |
| Node 环境 | `package.json` engines：`node >=23.6`；平台 Windows 11 Pro 10.0.26300。当前 shell 的 PATH 未包含 Node，执行前按上轮记录把 `C:\Users\51054\AppData\Local\Programs\nodejs` 加入 PATH，并以实测版本为准（上轮实测 Node v24.22.1 / npm 11.19.1） |
| 测试脚本 | 仓库使用 `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 为既有命令；本计划不新增 runner/配置 |

`docs/` 现状：上轮的团队计划、验收标准/报告、变更包已随 `64ed44a` 跟踪；本轮新增的意图记录、策划方案和本计划为未跟踪文件。候选身份以产品代码/测试文件的 `git hash-object` + `sha256sum` 与已跟踪 diff 为准，不把管理记录混入产品候选。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认** | `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md` |
| 闸门 1：方案确认 | **已确认（草案 v1，按推荐项）** | 同上「闸门 1 确认记录」 |
| 闸门 2：角色指派/写集确认 | **已确认（2026-10-22，客户选择「确认并授权实施」）** | `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`「闸门 2 确认与实施授权记录」 |
| 客户实施授权 | **已记录（2026-10-22，与闸门 2 同次明确选择）** | 同上 |
| 实施前验收标准 | 由内置独立验收写盘中；写盘后须由沟通确认 | `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` |

### 2.1 实施授权与闸门 2 是两个事实

- 闸门 2 确认的是**参与角色、各自范围和写集、是否有角色/边界变更、档位、阶段顺序、验收安排、证据口径**；实施授权是对代码实施的授权。两者分开记录，不能互相替代。
- 客户在闸门 1 的「按推荐项」确认不等于闸门 2，也不等于实施授权。
- 2026-10-22 客户在同一次确认中选择「确认并授权实施」；闸门 2 与实施授权均已记录，但仍是两个事实，记录见 `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`「闸门 2 确认与实施授权记录」。
- N3 基线回归可先启动（只读/基线，无代码改动）；Map A 实施仍须等实施前验收标准写盘并经沟通确认，且逐角色范围预留完成。

### 2.2 方案文件状态头的已知不一致（不阻塞，但须记录）

策划文件头与 §2.1 表格仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，而沟通的闸门 1 确认记录已明确客户选择「确认，按推荐项」。本计划以 `docs/communication/` 的确认记录为授权事实，不改写策划文件；实施角色按策划正文的符号名与实际代码为准，不把文件头的过期状态当成未确认。

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | 无新增持续独立责任 | 变更横跨既有分层：Model（运行时核心）、门禁引擎卡文本、编排（团队计划解析/flow/门禁/judge）、桌面 Interface、渲染层、跨角色测试。每一部分都是现有角色的职责。产品内部的角色粒度/团队计划 v2/MapReduce 是 `governance-roles.ts`、编排解析器与 flow 行为的变化，不是本仓库新增工作角色 |
| 2. 范围归属 | 现有 owner 精确覆盖；无默认缺口 | 方案 §9.1/§9.2 的路径逐个映射到现有 Section 1（见 §四）。新增 `src/common/编排/team-plan.ts` 与 `test/编排/team-plan.test.ts` 位于编排已授权的私有目录/测试目录内，按 `references/module-boundary.md`「在已接受目录内新增文件不需要重写边界」不构成边界变更。`test/桌面应用/` 是**逐文件授权**，本计划默认不新建该目录文件 |
| 3. 契约影响 | 有，跨角色共享契约变更 | 团队计划 v2 frontmatter/角色表列、flow step 可选字段、dispatch 前置依赖、桌面团队计划解析/写卡校验（V12）、任务文案、测试证据 manifest 均变。单一主属：`src/model/runtime.ts` → 运行时核心；团队计划解析/flow/gate → 编排；卡文本/注册表 → 门禁引擎；桌面解析消费 → 桌面窗口（经 pipeline 公共出口）。须以 Model 契约先行冻结，下游再并行 |
| 4. 证据独立性 | 已满足 | 开发角色各自跑受影响单测/层测试；测试角色独立跑跨角色 e2e、完整流程、Map 分片与 T3 全量回归，并产出真实启动/演示证据；内置独立验收按实施前标准判定。实施者不自验，调度不改验收结论 |
| 5. 协调成本 | 维持现有团队最低 | 6 个现有 worker（运行时核心、门禁引擎、编排、桌面窗口、桌面UI、测试）+ 内置独立验收 + 统筹；分 3 个 Map 组 + 1 个 Reduce。新增/拆分角色会增加建卡、边界、交接与证据成本，而本轮没有产生新的持续独立责任；不新增角色 |

### 3.2 决策表结果

**不变，派给现有角色。**

- 无新增、无拆分、无合并、无角色卡改动。
- `src/common/编排/team-plan.ts` 是编排私有目录内的新文件，不是新角色/新边界；`test/编排/team-plan.test.ts`、`test/测试/governance-e2e-auto/q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts` 同样位于既有目录授权内。
- 唯一条件项：若实施确实需要新建 `test/桌面应用/<新文件名>.test.ts`，该目录对桌面窗口是逐文件授权，触发**改边界**（由 ANS 人事按本计划与闸门 2 的额外确认补精确单文件条目）；本计划默认不新建该目录文件，把新断言并入既有精确文件，从而保持「不变」。
- 产品运行期的 Convener 写 `docs/scheduling/<flowId>-team-vN.md`、测试角色写 `docs/verification/` 是**产品行为/目标项目行为**，不是本仓库 worker 写集；本仓库执行时测试证据写入 `角色卡/测试/docs/`，不扩张写权。

### 3.3 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有六个 worker + 内置验收 + 统筹，按 Map/Reduce 分组 | **采用** | 写集与现有 Section 1 一一对应；契约、实现、测试、验收分离；协调成本最低 |
| B. 新增「角色粒度/团队计划 v2」专职角色 | 否决 | 一次性跨层变更，不构成持续独立责任；现有 owner 已覆盖；新增角色会触发人事写卡与额外闸门 |
| C. 把编排拆成「团队计划解析」与「flow/门禁」两个角色 | 否决 | 无过载证据；`team-plan.ts` 与 `run-role.ts`、`flow-state.ts`、`governance-gate.ts` 高度耦合，拆分会增加交接与证据成本 |
| D. 由一个角色包办全部实现 | 否决 | 跨越运行时核心、门禁引擎、编排、桌面窗口、桌面UI 的 Section 1；违反单一属主与写权限 |
| E. 用现有 `角色卡/独立验收` worker 判定本任务 | 否决 | 其 Section 1 仅覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；沿用 2026-10-22 既有决定，使用内置独立验收 |
| F. 测试角色只审报告、不跑全量回归 | 否决 | T3 要求适用全量回归；测试角色须产出真实 e2e/回归/启动演示证据 |
| G. 双团队计划解析器（run-role + interface 各一份） | 否决 | 客户已确认 Q9 推荐 A：抽单一 `src/common/编排/team-plan.ts`，经 pipeline 公共出口给桌面；避免两份解析漂移。若实施确实无法抽出，必须加 parity 测试并回报统筹，不能静默保留两份 |

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-10-22 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本；下表依据实际 Section 1。未列路径默认只读。新增文件位于已接受目录内时不重写边界；新增目录/改动归属/增删逐条路径才交人事。

| 方案 §9.1/§9.2 路径 | 所属角色 | Section 1 依据（boundary.md） | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 | `角色卡/门禁引擎/boundary.md`「目录（私有） `src/common/门禁引擎/`」 | 是 |
| `test/门禁引擎/**` | 门禁引擎 | 「目录（测试） `test/门禁引擎/`」 | 是 |
| `src/common/编排/team-plan.ts`（新增） | 编排 | `角色卡/编排/boundary.md`「目录（私有） `src/common/编排/`」；已接受目录内新增文件不重写边界 | 是（推荐新文件） |
| `src/common/编排/flow-state.ts`、`flow-service.ts`、`governance-gate.ts`、`governance-judge*.ts` | 编排 | 同上「目录（私有） `src/common/编排/`」 | 是（限方案列明文件） |
| `src/pipeline/orchestration/run-role.ts` | 编排 | 「单文件 `src/pipeline/orchestration/run-role.ts`」 | 是 |
| `src/pipeline/orchestration/govern-session.ts` | 编排 | 「单文件 `src/pipeline/orchestration/govern-session.ts`」 | 是 |
| `test/编排/team-plan.test.ts`（新增）及 `test/编排/**` 受影响测试 | 编排 | 「目录（测试） `test/编排/`」 | 是 |
| `src/model/runtime.ts` | **运行时核心** | `角色卡/运行时核心/boundary.md`「单文件 `src/model/runtime.ts` / 中立运行时类型与能力契约」 | 是 |
| `src/provider/runtime/{tools,schema}.ts` | 运行时核心 | 「单文件 `src/provider/runtime/tools.ts`」「单文件 `src/provider/runtime/schema.ts`」 | 默认不改；仅最小文案同步时按条件写（见 §4.3） |
| `test/runtime-core/**` | 运行时核心 | 「目录 `test/runtime-core/` / 本角色单元测试与契约夹具」 | 是 |
| `app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts` | 桌面窗口 | `角色卡/桌面窗口/boundary.md`「目录 `app/desktop/` / 桌面 Interface（主进程侧纯逻辑）」 | 是 |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/interface.test.ts`」 | 是 |
| `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/acceptance-dispatch.test.ts`」 | 条件/按需 |
| `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/operator-wiring.test.ts`」 | 条件/按需 |
| `test/桌面应用/dispatch-delivery.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/dispatch-delivery.test.ts`」 | 条件：仅当 dispatch 文案/依赖变化使其断言失效 |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 「单文件 `test/桌面应用/e2e/main.mjs`」 | 仅当端到端总自检需扩展；运行不写源码 |
| `app/renderer/src/chat/governance-view.ts`、`role-view.ts` | 桌面UI | `角色卡/桌面UI/boundary.md`「目录 `app/renderer/` / 渲染进程前端」 | 条件/可选文案 |
| `test/桌面UI/**` | 桌面UI | 「目录 `test/桌面UI/` / 渲染层 React 组件与设计系统守卫测试」 | 条件/按需 |
| `test/桌面应用/renderer.test.ts` | 桌面UI | 「单文件 `test/桌面应用/renderer.test.ts`」 | 可选；当前不存在，不默认创建 |
| `test/测试/**`（e2e/跨角色/回归/夹具） | 测试 | `角色卡/测试/boundary.md`「目录（测试） `test/测试/`」 | 是 |
| `docs/scheduling/`（本计划、变更包） | 统筹（内置） | 技能 `references/scheduler.md` 默认写权 | 是（不派 worker） |
| `docs/acceptance/`（标准、报告） | 独立验收（内置） | 技能 `references/acceptance-role.md` 默认写权 | 是（不派 worker） |
| `docs/verification/`（产品运行期证据根） | 测试角色（目标项目产品行为） | 本项目测试角色 Section 1 **不含**该路径；本仓库执行不写它，测试夹具只在临时项目根内生成 | 否（本仓库 worker 不写） |

### 4.2 Model / 共享属主核对（不猜）

- `src/model/runtime.ts`：**运行时核心唯一主属**。依据 `角色卡/运行时核心/boundary.md` 单文件条目，以及 `角色卡/项目管理/docs/architecture.md`「`src/model/runtime.ts` 的单一主属为运行时核心」。
- `src/model/boundary.ts`、`role.ts`、`decision.ts`：**门禁引擎唯一主属**（`角色卡/门禁引擎/boundary.md` 文末声明）。本轮**不改**这三个文件；方案 §9.3 明确不改。
- `src/common/shared/`：项目管理所有；本轮**不改**。
- `src/common/门禁引擎/`、`src/common/编排/`、`app/desktop/`、`app/renderer/`：各自角色私有/专属目录，互不重叠。
- 因此方案 §9.1 的 Model 改动全部落在 `src/model/runtime.ts`（运行时核心），不派给门禁引擎；门禁引擎只改 `governance-roles.ts` 的卡文本/注册表数据。

### 4.3 逐角色精确写集与可观察交付

#### 运行时核心（Map A：契约先行）

- **写集**：
  - `src/model/runtime.ts`：按方案 A 增加可选 flow step 字段的类型承载：`FlowToolStepView`、`FlowToolStep`/`FlowToolView`（如实际类型存在）、`FlowStepSupersedeFn`；`GovernanceJudgeFacts` 可选 `teamPlanSchema?`/模块摘要（如实施需要）；`GovernanceJudgeRequest/Context.artifacts` 沿用 `teamPlanPath`，不新增 evidence artifact kind；`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 值不变。
  - `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`：**默认不改**。仅当卡种/参数文案必须同步时做最小文案/注释改动；不得新增 `cardKind`、参数形状或校验形状；实施报告须单列理由。
  - `test/runtime-core/` 下受影响测试（至少 `governance-flow-metadata.test.ts`；按实际需要新增/更新）。
  - 自身文档：`角色卡/运行时核心/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`src/model/{boundary,role,decision}.ts`、`src/service/runtime/session.ts`、其他角色目录、`app/`、`test/桌面应用/`、`test/测试/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：`src/model/runtime.ts` 的可选字段；必须向后兼容，旧消费者不填不读。
- **测试面**：`test/runtime-core/`（单元/契约）。
- **可观察交付**：可选字段类型 diff；旧字段/枚举值不变；`node --test "test/runtime-core/**/*.test.ts"` 与 `npm run typecheck` 原始输出；候选哈希；契约偏差逐条报告。**Model 契约冻结后下游才启动。**

#### 门禁引擎（Map A：与运行时核心并行）

- **写集**：
  - `src/common/门禁引擎/governance-roles.ts`：
    - `CONVENER_CARD_TEXT`：团队计划 v2 字段、模块清单、Map/Reduce、并行组、dependsOn、readiness 例外、flow 模板 `parallelGroup`/`dependsOn`（方案 A）；
    - `NOMINATOR_CARD_TEXT`：Crew 读 module/公开契约/测试面/dependsOn/粒度理由；角色卡写 bounded context/契约/测试面；boundary 按计划写集；不纳米/不整层；
    - `VERIFIER_CARD_TEXT`：可选补充验收核对模块覆盖/MapReduce manifest/分片证据；不改变真实启动/演示基线；
    - **不改** `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized、`ENGINEERING_QUALITY_BASELINE`。
  - `test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts` 及 `test/门禁引擎/` 下必要新增负例。
  - 自身文档：`角色卡/门禁引擎/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`src/model/**`（三个共享类型属本角色但本轮不改）、`src/common/编排/`、`app/`、`test/测试/`、`test/桌面应用/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：卡文本/流程模板（产品数据）；不改写权、不新增 cardKind。
- **测试面**：`test/门禁引擎/`。
- **可观察交付**：五张卡文本 diff（至少 Convener/Crew；Verifier 可选）；注册表 entries/forbidden/preauthorized 未变；写权正/负例；`node --test "test/门禁引擎/**/*.test.ts"`；`npm run typecheck`；候选哈希。

#### 编排（Map B：依赖 Map A 契约冻结）

- **写集**：
  - 新增 `src/common/编排/team-plan.ts`：团队计划 v2 单一解析/校验（frontmatter `teamPlanSchema`/`modules`/`recommended`/`riskTier`、模块清单表、角色表别名列、写集语法/重叠、模块覆盖、dependsOn DAG/环、并行组规则、粒度启发式 V1–V10）；导出给 `run-role.ts`/`govern-session.ts`，**不要求桌面直接 import 私有 common**。
  - `src/common/编排/flow-state.ts`：`FlowStateStep` 可选 `parallelGroup`/`dependsOn`、`STEP_KEYS` 严格 schema、`parseFlowStateYaml` 静态校验（语法、目标存在、自依赖/重复/环、同 Map 组无依赖路径、Reduce 覆盖全部 Map、Map 不依赖 Reduce、Map 交付依赖 `contract-freeze`）；`FLOW_STEP_KINDS` 不变。
  - `src/common/编排/flow-service.ts`：`viewOf`/`serializeFlow`/`flowStepSupersede` 携带可选字段；旧 flow 序列化逐字不变。
  - `src/common/编排/governance-gate.ts`：`evaluateDispatchGate` 在步骤声明 `dependsOn` 时要求前置全部 `done`；不改变派发权/动作；旧步骤无 `dependsOn` 不新增检查。
  - `src/common/编排/governance-judge-facts.ts`/`-evidence.ts`/`-prompt.ts`：可选模块/并行事实与提示；不新增 cardKind/decision/artifact kind。
  - `src/pipeline/orchestration/run-role.ts`：扩展/替换 `teamPlanRoleRowIssues` 为 v2 V1–V10，保留 legacy 分支；`validateConvenerAppointmentCard` 调用 v2 校验并读 flow 做 V11，失败不弹卡/不写账本；`latestVersionedArtifact`/`judgeArtifactsForCard`/`computeJudgeContext` 按需暴露 `teamPlanSchema`/模块摘要；导出 `team-plan.ts` 的解析/校验公共出口。
  - `src/pipeline/orchestration/govern-session.ts`：`STANDARD_WORKFLOW_PROMPT`、Convener/Crew 提示同步模块粒度/MapReduce/flow 字段/readiness 例外/测试分片/证据 manifest。
  - `test/编排/`：新增 `team-plan.test.ts`；更新 `flow-state.test.ts`、`flow-service.test.ts`、`governance-gate.test.ts`、`governance-session.test.ts`；`governance-judge.test.ts` 按需；必要时新增 v2 负例。
  - 自身文档：`角色卡/编排/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`src/common/门禁引擎/`、`src/model/runtime.ts`、`app/`、`test/测试/`、`test/桌面应用/`、`test/门禁引擎/`、`test/runtime-core/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：团队计划 v2 解析/校验结果（问题列表/结构化问题）；flow step 可选字段；dispatch 前置依赖。桌面经 `src/pipeline/orchestration/run-role.ts` 公共出口消费。
- **测试面**：`test/编排/`。
- **可观察交付**：V1–V10 正向/负向矩阵（缺模块、模块重复/孤儿、写集重叠、环、同组依赖、整层名、多模块无理由、Reduce 未覆盖 Map、legacy 通过）；V11 flow-plan 一致性；`dependsOn` 未完成拒绝、完成后允许；旧 flow 夹具逐字不变；`node --test "test/编排/**/*.test.ts"`；`npm run typecheck`；候选哈希。

#### 桌面窗口（Map C：依赖编排公共出口）

- **写集**：
  - `app/desktop/interface.ts`：`TeamPlanRoleRow`/`TeamPlanInfo` v2 字段（module/公开契约/测试面/dependsOn/并行组/粒度理由/模块清单）；`parseTeamPlanInfo` v2 + legacy 分支（缺 `teamPlanSchema: 2` 按 v1，只记迁移 warning）；改用共享解析器（经 pipeline 公共出口），不复制第二份 v2 解析；`validateAppointmentArtifacts` 的 V12：计划写集 vs 角色边界覆盖、模块/契约/测试面/依赖/并行问题来源分流、`existing` 只 warning。
  - `app/desktop/governance-advance.ts`：`buildProposalAcceptMessage`/`buildAppointmentWriteMessage`/`buildRoleReadinessTaskMessage`/`buildAcceptanceTaskMessage` 等任务文案同步模块清单/v2 字段/MapReduce/测试分片/验收 manifest；`flowStepEvidenceKind` 按需。
  - `app/desktop/customer-input.ts`：appointment 上下文按需透传模块/并行信息；不改客户入口/通道。
  - `test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts`；`e2e/main.mjs` 仅当总自检需扩展；`dispatch-delivery.test.ts` 仅当 dispatch 文案/依赖变化使其断言失效（条件）。
  - 自身文档：`角色卡/桌面窗口/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`、`api-spec.md`、`memo.md`（按需）。
- **硬约束**：**不得在 `test/桌面应用/` 新建文件**（该目录对本角色是逐文件授权，不是目录授权）。新断言并入上述既有精确文件或 `e2e/main.mjs`。确需新文件时停止并回报统筹，交 ANS 人事按闸门 2 额外确认补精确单文件条目，不默认派发。
- **不写**：`app/renderer/**`（桌面UI）、`app/main.ts`、`app/preload.cjs`、`package.json`/`tsconfig.json`/`vite.config.ts`（装配）、`src/common/编排/`、`src/model/runtime.ts`、`test/测试/`、`test/编排/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：桌面团队计划读取/写卡校验结果（问题列表/来源分流）；任务文案。不改变 IPC 通道/客户入口/派发权。
- **测试面**：`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts`（+ `dispatch-delivery.test.ts` 条件；`e2e/main.mjs` 运行）。
- **可观察交付**：`parseTeamPlanInfo` v2 正/负例与 legacy warning；V12 计划写集未覆盖边界 → 退回 Crew/Convener；来源分流；任务文案含模块/并行/分片；`node --test` 精确文件；`npm run typecheck`；候选哈希。

#### 桌面UI（Map C：条件/可选，与桌面窗口并行）

- **写集**：
  - `app/renderer/src/chat/governance-view.ts`、`role-view.ts`：可选文案：模块粒度/并行提示；**不改**角色 id/显示名/客户入口/派发权。
  - `test/桌面UI/governance-view.test.ts`、`role-view.test.ts` 及 `test/桌面UI/` 下必要测试；`test/桌面应用/renderer.test.ts` 仅在确需同步且文件存在/确需创建时（该文件当前不存在，默认不创建）。
  - 自身文档：`角色卡/桌面UI/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`package.json`/`tsconfig.json`/`vite.config.ts`、`src/**`、`test/测试/`、`test/桌面应用/` 下除 `renderer.test.ts` 外的文件（且默认不创建该文件）。
- **公开契约**：渲染层文案/DOM 契约；不改客户入口。
- **测试面**：`test/桌面UI/`。
- **可观察交付**：文案 diff；`node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer`（写 `app/renderer/dist/`，本角色自有目录，dist 被忽略、非候选路径）；若无需文案变化，报告 N/A 并不改文件。

#### 测试（Reduce：跨角色集成/e2e/回归/证据合并）

- **写集**：`test/测试/`（目录）。至少覆盖方案 §9.2 的：
  - `governance-e2e-auto/p-team-plan-guard.test.ts`（扩负例：缺 module/模块清单、模块重复/孤儿、写集重叠、环、同组依赖、整层名、多模块无理由、Reduce 未覆盖 Map、legacy 通过）；
  - `governance-e2e-auto/fixture.ts`（`teamPlanDoc` v2 + 保留 v1 夹具）；
  - `governance-e2e-auto/i-full-chain.test.ts`（v2 完整链路 + legacy v1 链路）；
  - `c-appointment-timing.test.ts`、`b-proposal-accept-timing.test.ts`、`d-dispatch-listing.test.ts`；
  - 新增 `q-role-granularity.test.ts`（v2 正/负矩阵）、`r-mapreduce-parallel.test.ts`（Map 组并行、Reduce 等 Map done、分片独立证据、失败隔离）；
  - 受影响的 `governance-trio-verify/*`、`governance-judge-cards-verify/*`、`governance-liaison-verify/*`（仅当卡文本/任务文案断言变化）；
  - `real-entry.test.ts` 仅在新增调度记录导致其快照语义失效时更新（保持「演示不产生新记录/不改写既有记录」的快照语义，不得放宽为永远通过）。
  - 自身文档与证据：`角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing*.md` 及 `...-evidence/`。
- **不写**：产品源码、其他角色单测、`test/桌面应用/`（不新建、不修改；如需其精确文件变更，由桌面窗口 owner 处理）、`test/编排/`、`test/门禁引擎/`、`test/桌面UI/`、`test/runtime-core/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：测试命令、分片证据 manifest（本仓库执行放 `角色卡/测试/docs/`；产品运行期 manifest 路径 `docs/verification/<flowId>/manifest.md` 只在临时项目根/目标项目内使用）。
- **测试面**：`test/测试/`（跨角色集成/e2e/回归）。
- **可观察交付**：
  - 阶段基线：HEAD `64ed44a` 的 T3 全量回归原始输出与失败分类（区分既有失败，如 Windows symlink EPERM、桌面并发偶发）。
  - 终验：v2 完整链路 + legacy v1 链路；Map 分片并行证据（每分片独立临时根/端口/日志/命令/候选哈希/退出码/pass-fail-skip）；Reduce manifest 合并；T3 适用全量回归；真实启动/演示；候选哈希与 diff/status；复跑说明。
  - 不修改模块代码；失败分片保留原始日志，交对应 owner 修复；修复后只重跑该分片和受影响下游。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹默认写区。本任务由统筹写本计划、变更包、任务记录；**不派给任何 worker**。产品运行期 Convener 的团队计划也落在此目录（`<flowId>-team-vN.md`），但那是产品行为与测试数据，不是本仓库 worker 的写集；测试夹具必须使用独立 flowId/临时项目根，不得覆盖本仓库既有调度记录。
- `docs/acceptance/`：内置独立验收默认写区。本任务由内置独立验收写实施前标准与验收报告；**不使用**项目 `角色卡/独立验收` worker（其 Section 1 不覆盖 `docs/acceptance/`，且会造成双重验收）。
- `docs/verification/`：产品运行期的详细证据附件目录（方案 §6.3/§8.2），不是本任务 worker 的写区；本仓库执行的原始证据随角色报告与变更包链接，测试角色自身证据写 `角色卡/测试/docs/`；产品 e2e 只在临时项目根内生成 `docs/verification/`。
- `docs/communication/`：沟通角色写区；本计划不写，闸门 2 确认记录由沟通写入。

### 4.5 边界缺口与共享属主

| 事项 | 结论 | 处理 |
| --- | --- | --- |
| `src/common/编排/team-plan.ts`（新文件） | **不是边界缺口** | 位于编排已授权私有目录；`references/module-boundary.md` 明确已接受目录内新增文件不需要重写边界。仍需在闸门 2 写集内列明 |
| `test/编排/team-plan.test.ts`、`test/测试/governance-e2e-auto/q-*.test.ts`、`r-*.test.ts`（新文件） | **不是边界缺口** | 分别位于编排/测试的目录授权内 |
| `test/桌面应用/` 新增文件 | **条件性边界缺口** | 桌面窗口该目录是逐文件授权；本计划要求把新断言并入既有精确文件。若确需新文件，交 ANS 人事按本计划与闸门 2 额外确认补精确单文件条目，不默认派发 |
| `docs/verification/` 归属 | 产品/目标项目路径，不是本仓库 worker 缺口 | 本仓库执行不写它；测试角色自身证据写 `角色卡/测试/docs/`；产品 e2e 用临时项目根。不为本任务扩张测试角色边界 |
| `docs/scheduling/` 与项目管理 boundary 重叠 | 该目录同时出现在项目管理 boundary，用途是「任务调度记录（内容由 task_ops 写入）」 | 本项目未启用 task_ops；本任务不把 `docs/scheduling/` 列入任何 worker 写集，统筹是唯一写入者；无实际写集重叠 |
| `src/model/runtime.ts` | 运行时核心唯一主属；不是门禁引擎 | 见 §4.2；Model 变更先行冻结（Map A），下游再写 |
| `src/provider/runtime/{tools,schema}.ts` | 运行时核心 Section 1 覆盖；方案默认不改 | 仅最小文案同步时写；不得改 schema/参数/校验形状；报告单列理由 |
| `app/desktop/session.ts` | 桌面窗口 Section 1 覆盖，但不在方案 §9.1 列明面 | **默认不改**。若实施发现必须接线，先停止并回报统筹，不自行纳入写集 |
| 其他 §9.1/§9.2 路径 | 均被现有 Section 1 精确覆盖 | 无缺口 |

### 4.6 工作量与范围预留

工作量按文件与检查项计，不编造工时：

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 运行时核心 | 1 个共享 Model 文件 + 1–2 个测试文件 + 文档；Provider 默认不改 | Map A 独占 `src/model/runtime.ts`、`test/runtime-core/` 相关文件 |
| 门禁引擎 | 1 个卡文本/注册表数据文件 + 2–3 个测试文件 + 文档 | Map A 独占 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关文件 |
| 编排 | 1 个新解析器 + 约 6–8 个产品文件 + 5–7 个测试文件 + 文档 | Map B 独占 `src/common/编排/` 列明文件、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`test/编排/` |
| 桌面窗口 | 3 个产品文件 + 3–4 个精确测试文件 + 文档 | Map C 独占 `app/desktop/` 列明文件与既有精确测试文件 |
| 桌面UI | 0–2 个产品文案文件 + 0–2 个测试文件 + 文档 | Map C 条件/可选；独占 `app/renderer/src/chat/` 列明文件、`test/桌面UI/` |
| 测试 | 约 8–12 个 e2e/验证文件 + 全量回归 + 启动演示 | Reduce；`test/测试/` 独占；基线 + 终验 |

范围预留规则：每个阶段开始前按角色 `roleId` 与精确路径预留；任何角色不得写其他角色的路径；同一文件同一时间只有一个写入者。Map A 的 Model 契约冻结前，Map B/C 不开始写引用新字段的代码。

---

## 五、阶段、依赖与并行组（Map/Reduce）

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| N1 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、边界变更、档位、顺序、验收安排、证据口径）；客户实施授权记录（分开） | 本计划写盘 |
| N2 | 标准 | 内置独立验收 | `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`（验收表、T3、判定规则、证据计划、版本冻结） | N1 |
| N3 | 基线 | 测试 | HEAD `64ed44a` 的 T3 全量回归基线原始输出与失败分类；环境事实 | N1 |
| N4 | Map A（契约） | 运行时核心 + 门禁引擎（并行） | Model 可选字段/类型 + 卡文本 v2 要求 + 各自测试/typecheck；Model 契约冻结 | N2 标准经沟通确认、N3 基线先于代码改动 |
| N5 | Map B（核心） | 编排 | `team-plan.ts` V1–V10、flow 可选字段/V11、dispatch `dependsOn`、run-role 卡前守卫、会话提示 + 测试/typecheck | N4（Model 契约冻结） |
| N6 | Map C（桌面） | 桌面窗口 + 桌面UI（并行） | 团队计划 v2 解析/V12、任务文案、可选渲染文案 + 测试/typecheck/build | N5（编排公共出口稳定） |
| N7 | Reduce（终验） | 测试 | v2 完整链路 + legacy v1 链路；Map 分片并行证据；Reduce manifest；T3 全量回归；真实启动/演示 | N6 |
| N8 | 验收 | 统筹 → 内置独立验收 | 变更包（候选哈希、改动路径、节点、证据链接、T3）→ 验收报告（通过/返工/证据不足） | N7 |
| N9 | 放行 | 统筹 → 沟通 | 按匹配当前候选的结论更新记录、释放依赖、交沟通回报 | N8 通过 |

### 5.2 Map / Reduce 分组

| 组 | 角色 | 模块/上下文 | 进入条件 | 退出条件 |
| --- | --- | --- | --- | --- |
| **map-contract** | 运行时核心、门禁引擎 | 共享 Model 契约；治理卡文本 | N2/N3 完成 | Model 可选字段冻结；卡文本 v2 要求落地；各自测试/typecheck 通过；写集不越界 |
| **map-core** | 编排 | 团队计划解析、flow、门禁、judge、会话 | map-contract 退出（Model 冻结） | V1–V10/V11、flow 可选字段、dispatch 前置、卡前守卫、会话提示完成；测试/typecheck 通过 |
| **map-desktop** | 桌面窗口、桌面UI | 桌面 Interface/任务文案；渲染文案（可选） | map-core 退出（公共出口稳定） | 桌面 v2 解析/V12/文案完成；测试/typecheck/build 通过；写集不越界 |
| **reduce** | 测试 | 跨角色 e2e/集成/回归/证据合并 | 所有 Map 交付 `done`（不是仅 dispatched） | v2 + legacy 链路通过；分片证据/manifest 完整；T3 全量回归与基线对照；真实启动/演示完成 |

### 5.3 并行与串行

- **必须串行**：N3 → N4（基线先于代码改动，避免把既有失败误判为新失败）；N4 → N5（Model 契约冻结先于引用方）；N5 → N6（团队计划解析/flow/gate 公共出口先于桌面消费）；N6 → N7（终验必须针对合并后的实际候选）；N7 → N8（验收按当前候选判定）。
- **可并行**：
  - N2 与 N3（验收标准与基线回归互不写同一路径）。
  - N4 内：运行时核心与门禁引擎（`src/model/runtime.ts` vs `src/common/门禁引擎/`，写集不相交）。
  - N6 内：桌面窗口与桌面UI（`app/desktop/` vs `app/renderer/`，写集不相交）。
  - N7 内：测试按模块分片并行，但每个分片必须独立临时根/端口/日志/输出目录，不共享可变夹具。
- **不允许**：N4 与 N5 并行写引用新 Model 字段的代码；N5 与 N6 并行写桌面消费代码；N6 两个角色互写对方目录；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`；任何角色写 `test/桌面应用/` 新文件。

### 5.4 各阶段入口/出口条件

- **N1 入口**：本计划写盘。**出口**：闸门 2 确认记录 + 实施授权记录齐备；确认记录覆盖本计划版本、参与角色、精确写集、是否有角色/边界变更、T3、阶段顺序、验收安排、证据口径。
- **N2 入口**：N1。**出口**：标准含验收表（ID/标准/证据/候选/产出角色/结果/判定）、T3 依据、判定规则（pass/fail/insufficient evidence/not applicable）、证据计划、版本/哈希冻结；沟通确认其路径/版本；未确认不派实施。
- **N3 入口**：N1。**出口**：基线命令、环境、计数、失败清单与分类可复算；确认无已跟踪代码改动（除既有 memo/未跟踪管理文档）。N3 跑 `npm run typecheck`、`npm run typecheck:renderer`、受影响定向套件与 `node --test "test/**/*.test.ts"`；`npm run build:renderer` 不在 N3 运行（写 `app/renderer/dist/`，属桌面UI，后续由桌面UI 对同一候选产出/复用）。
- **N4 入口**：N2 标准经沟通确认 + N3 基线完成。**出口**：Model 可选字段与卡文本 v2 要求落地；受影响测试与 typecheck 通过；契约字段形状与方案 §8.2 一致；完成报告含候选哈希、diff/status；Model 契约冻结。
- **N5 入口**：N4 退出。**出口**：V1–V10/V11 正/负例、flow 可选字段/序列化/静态校验、dispatch `dependsOn`、run-role 卡前守卫、session 提示完成；旧 flow 夹具不变；测试/typecheck 通过；候选哈希/diff/status。
- **N6 入口**：N5 退出。**出口**：桌面 `parseTeamPlanInfo` v2/legacy、V12 写集覆盖、来源分流、任务文案完成；渲染文案（如做）通过；精确测试/typecheck/typecheck:renderer/build 通过；候选哈希/diff/status。
- **N7 入口**：N6 退出。**出口**：v2 完整链路 + legacy v1 链路通过；Map 分片并行证据与 Reduce manifest；T3 全量回归完成并与基线逐项对照；真实启动/演示证据存在；候选哈希/diff/status 齐全。
- **N8 入口**：N7 完成。**出口**：变更包完整、候选可复算；独立验收按标准给出通过/返工/证据不足；调度只按匹配当前候选的结论放行。
- **N9 出口**：只表示当前候选满足标准；不授权提交、推送、合并、发布。

### 5.5 测试分片与 Reduce 合并（本任务执行口径）

- **Map 分片**：测试角色按模块并行运行受影响测试面（如 `test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面应用/` 精确文件、`test/桌面UI/`、`test/测试/governance-e2e-auto/`）。每个分片使用独立临时项目根/端口/输出目录/日志文件；共享只读夹具必须 pin 哈希；不并发 `npm install`/构建到同一输出目录。
- **独立证据**：每个分片记录命令、环境、候选哈希、退出码、pass/fail/skip、失败原文；本仓库执行时日志写 `角色卡/测试/docs/change/<task>-evidence/map-<module>.log`；产品运行期 manifest/分片日志写 `docs/verification/<flowId>/`（仅在临时项目根/目标项目内）。
- **失败隔离**：一个分片失败不阻塞其他独立分片；失败分片保留原始日志，交模块 owner 修复；修复后只重跑该分片和受影响下游。
- **Reduce 合并**：所有分片完成后，合并 manifest（候选哈希、分片清单、命令、日志路径、结果、环境）；然后运行契约/集成/e2e 与真实启动/演示；最终 `verification-evidence` 步骤指向 manifest。
- **不得改模块代码**：测试角色只读模块代码，写自己的测试/证据；失败交 owner 修，不代改。

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

> 命令按仓库实际脚本与既有 runner；Node 需按基线加入 PATH。Windows 既有失败须用基线对照，不得记为本次新失败。

| 角色 | 受影响检查 | 证据 |
| --- | --- | --- |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`（至少 `governance-flow-metadata.test.ts` 与相关契约测试）；`npm run typecheck` | 测试计数/失败原文；Model/Provider diff；类型引用证据 |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"`（至少 `governance-trio.test.ts`、`governance-standard-workflow.test.ts`）；`npm run typecheck` | 卡文本/注册表 diff；写权正/负例；测试计数 |
| 编排 | `node --test "test/编排/**/*.test.ts"`（至少 `team-plan.test.ts`、`flow-state.test.ts`、`flow-service.test.ts`、`governance-gate.test.ts`、`governance-session.test.ts`）；`npm run typecheck` | V1–V10/V11 负例；flow 序列化/旧夹具；dispatch 前置；测试计数 |
| 桌面窗口 | `node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/operator-wiring.test.ts`（必要时加 `dispatch-delivery.test.ts`）；可按需只读跑 `test/桌面应用/` 全目录；`npm run typecheck` | v2 解析/legacy warning；V12 来源分流；任务文案；测试计数 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`（至少 `governance-view.test.ts`、`role-view.test.ts`）；`npm run typecheck:renderer`；`npm run build:renderer` | 文案 diff；渲染测试；build 输出（dist 忽略、非候选） |
| 测试 | 定向 e2e/受影响套件先行，再 `node --test "test/**/*.test.ts"`；`npm run typecheck`；`npm run typecheck:renderer`；`npm run build:renderer` 复用桌面UI 对同候选的构建证据（测试角色不写 `app/renderer/dist/`） | 基线对照；全量回归计数/失败分类；v2/legacy e2e；分片证据/manifest；启动演示证据 |

### 6.3 T3 全量回归

- 最终候选必须跑：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`；`npm run build:renderer` 由桌面UI 对同一候选产出（写 `app/renderer/dist/`，该目录属桌面UI、被忽略、非候选路径），测试角色复用该构建证据，不自行写该路径。
- 基线（N3）在实施前对 HEAD `64ed44a` 跑同一组命令；最终结果与基线逐项对照，区分：
  - 本次新增失败；
  - 既有失败（如 Windows symlink EPERM、桌面并发偶发）；
  - 环境不可用/跳过。
- 任一本次新增失败不得放行；既有失败必须附基线证据与原因，不能笼统写「环境问题」。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。
- 并行全量出现桌面时序偶发时，必须以隔离/整文件/串行复跑分类；不得把新增红归为基线红，也不得用并行偶发掩盖真实失败。

### 6.4 真实启动/演示

工程基线要求「验收前必须真实启动应用并演示」。本轮由**测试角色**产出（方案 §11 证据计划；团队计划指定，不由 Verifier 默认承担）：

- 启动方式：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；
- 演示内容：至少覆盖一条 v2 治理链路的关键变化：团队计划 v2（模块清单/角色表/MapReduce）→ appointment → Crew 写卡 → Convener readiness（模块/契约/测试面/并行/粒度）→ Map 并行派发 → 测试分片 → Reduce 合并/契约/集成/e2e → 变更包 → Verifier → acceptance；以及至少一条 legacy v1 链路保持通过；
- 证据：启动命令、时间、版本/候选、访问地址或窗口截图/录屏清单、日志；离线无真实凭据时如实记录模型桩边界；缺失或失效时不得建议 accept。

---

## 七、独立验收安排

> 本节只安排验收，不代替验收标准；正式标准由内置独立验收在实施前写盘。

### 7.1 实施前完成标准

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、N4 实施前；可与 N3 基线并行。
- **路径**：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的策划方案 v1（`docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`）+ 闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、风险档位 T3 与依据、选定检查/复用规则/全量回归条件、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则。
- **标准不得弱于**方案 §11 的 P1–P12；不得自造需求或放宽/加严标准实质。
- **冻结**：实施开始后不得改标准适配候选；确需变更时递增版本、记录理由、交沟通/统筹确认，受影响证据重新核对。

### 7.2 变更包与判定

- 统筹在 N7 完成后组装变更包：`docs/scheduling/role-granularity-parallel-testing-change-v1.md`，含候选哈希（产品代码/测试文件；`git hash-object` + `sha256sum`）、改动路径、任务节点 N1–N9、证据链接、风险档位 T3、复用证据与失效说明。
- 独立验收按标准与变更包判定；报告路径 `docs/acceptance/role-granularity-parallel-testing-report-v1.md`；报告首行必须含：风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；调度不改验收结论。
- 验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

### 7.3 证据复用与档位纪律

- 复用仅限同一候选、同一输入/依赖、同一命令的有效证据；候选/输入/依赖/契约/夹具/配置变化使受影响证据失效，只补失效部分。
- 本任务为 T3，全量回归是默认要求；若某项确无代码面（例如只改卡文本且已有针对性断言），报告中写 N/A + 理由，不能掩盖代码面。
- 独立验收可**升档**，不能降档；档位与改动不符时退回统筹或按更高档补证。
- Map 分片证据带候选哈希和模块标识；验收核对 manifest + 分片原始日志，不把测试角色摘要当原始证据；缺失/失效判 `insufficient evidence`。

---

## 八、闸门 2 待客户确认项

> 以下为闸门 2 需客户确认的具体项；客户确认记录由沟通写入 `docs/communication/`。本计划不自行判断客户是否同意。

1. **参与角色**：运行时核心、门禁引擎、编排、桌面窗口为实施 worker；桌面UI 为条件/可选文案角色（无必要改动时报告 N/A，不派发）；测试为独立测试/回归角色；内置独立验收负责实施前标准与实施后判定；统筹负责计划、派发、收证、变更包与记录。**默认不启用人事**（无角色/边界变更；条件项见第 3 条）；**不启用装配**（无构建配置/入口改动）。
2. **精确写集**：
   - 运行时核心：`src/model/runtime.ts`、`test/runtime-core/` 相关测试、自身文档；`src/provider/runtime/{tools,schema}.ts` 仅最小文案同步时写；
   - 门禁引擎：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关测试、自身文档；
   - 编排：`src/common/编排/` 方案列明文件 + 新增 `team-plan.ts`、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/` 相关测试、自身文档；
   - 桌面窗口：`app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts`、`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts`（`dispatch-delivery.test.ts`/`e2e/main.mjs` 条件）、自身文档；
   - 桌面UI（条件）：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`、`test/桌面UI/` 相关测试、自身文档；
   - 测试：`test/测试/` 下 e2e/跨角色/回归用例与夹具、自身文档与证据目录；
   - 统筹：`docs/scheduling/`；内置验收：`docs/acceptance/`。
3. **是否有角色/边界变更**：默认**无**。`src/common/编排/team-plan.ts` 与 `test/编排/team-plan.test.ts` 是已授权目录内新文件，不需要改边界。唯一条件项：若桌面侧必须在 `test/桌面应用/` 新建测试文件，该目录对桌面窗口不是目录授权，需 ANS 人事按本计划与闸门 2 的额外确认新增精确单文件条目；不默认派发。推荐方案是并入既有精确文件，避免边界变更。
4. **档位**：T3（治理/权限/流程设计变更），全量回归按适用范围执行，报告首行五项。
5. **阶段顺序**：闸门 2 + 实施授权 → 验收标准 + 基线回归 → Map A（运行时核心 + 门禁引擎并行）→ Map B（编排）→ Map C（桌面窗口 + 桌面UI 并行）→ Reduce（测试终验/分片/全量回归/真实启动演示）→ 变更包与独立验收判定 → 放行/回报。
6. **验收安排**：使用内置独立验收（写 `docs/acceptance/`），不使用项目 `角色卡/独立验收` worker；实施前标准先于实施，标准基于客户闸门 1 确认的方案 v1。
7. **证据口径**：未启用 task_ops；以文件哈希、原始命令输出、diff/status、分片日志/manifest、真实启动/演示为证据；不提交、不推送、不合并、不发布；管理记录不混入产品候选。
8. **实施授权与闸门 2 分开**：客户可先确认角色指派，再另行给出实施授权；本计划写盘后不派发，直到两者齐备且标准经沟通确认。

---

## 九、前置问题、风险与阻塞

1. **闸门 2 未确认**：本计划只是团队计划；客户确认角色指派前不派发、不改代码；实施授权另行取得。
2. **方案文件状态头过期**：见 §2.2；以 `docs/communication/` 的闸门 1 记录为准，不改策划文件。
3. **单解析器要求**：客户已确认 Q9 推荐 A，抽 `src/common/编排/team-plan.ts` 单一解析器，经 `src/pipeline/orchestration/run-role.ts` 公共出口给桌面。桌面不得直接依赖 `src/common/编排/` 私有实现；若实施确实无法抽出，必须加 parity 测试并回报统筹，不能静默保留两份解析。
4. **双解析漂移风险**：`run-role.ts` 与 `interface.ts` 现在是两份团队计划解析；v2 语法（模块/写集/DAG）复杂，卡前守卫与写卡后校验必须同源，否则可能出现「卡前通过、写卡后拒绝」或反之。
5. **flow 新字段的序列化/夹具**：`FlowStateStep`/`STEP_KEYS`/`flow-service` 视图/序列化/`FlowToolStepView`/`FlowStepSupersedeFn`/`govern-session` flow 模板/`flow-state.test.ts`/`flow-service.test.ts`/`governance-gate.test.ts` 需同步；旧 flow 不填新字段、按 legacy 行为断言；新增夹具只覆盖 Map/Reduce、依赖环、前置未完成、旧 flow 不变；未知字段仍严格拒绝。
6. **不新增 `FlowStepKind`**：证据种类仍只有 `dispatch/customer-decision/artifact/acceptance`；`parallelGroup`/`dependsOn` 是可选字段，不是新 kind。不得顺手新增 `cardKind`/`GovernancePower`/`GovernanceDecisionKind`。
7. **旧计划/旧 flow/旧角色卡兼容**：`teamPlanSchema: 2` 缺省按 v1；旧计划只跑现有校验；旧 flow 可选字段不改变旧解析；旧角色卡保持最低格式检查 + warning；不删除/不重写历史文件；不强制一次性迁移。
8. **模块清单可被“伪造”**：确定性检查只能抓黑名单/覆盖/重叠/环；真正的内聚判断靠 Convener readiness 对照客户确认的架构章节 + 验收抽查。不得把「字段齐全」当成「粒度正确」，应用不宣称语义完成。
9. **测试冻结面大**：大量测试冻结角色卡文本、任务文案、计划结构、flow 形状（`governance-trio`、`governance-standard-workflow`、`governance-e2e-auto/*`、`governance-trio-verify/*`、`governance-judge-cards-verify/*`、`governance-liaison-verify/*`、`test/桌面应用/*`、`test/编排/*`）。各 owner 更新断言必须对应真实行为变化，不得删测试/放松断言保绿；测试角色负责终验，不接受「自测通过」替代集成。
10. **共享属主与证据失效**：`src/model/runtime.ts` 是运行时核心唯一主属，改动会使所有引用方既有证据失效；必须先冻结（Map A），下游再写。`src/model/{boundary,role,decision}.ts` 属门禁引擎，本轮不改；`src/common/shared/` 属项目管理，本轮不改。
11. **证据根所有权**：`docs/verification/` 不在本项目测试角色 Section 1 内；本仓库执行不写它，测试自身证据写 `角色卡/测试/docs/`；产品 e2e 只在临时项目根内生成 `docs/verification/`。不得靠「测试角色本来就会写证据」假设扩张边界；若确需在本仓库写 `docs/verification/`，须另走人事改边界 + 闸门 2。
12. **`test/桌面应用/` 逐文件授权**：不得新建该目录文件；`renderer.test.ts` 当前不存在，默认不创建；`dispatch-delivery.test.ts` 仅在其断言被 dispatch 文案/依赖变化失效时由桌面窗口更新（Section 1 已覆盖），并在完成报告单列理由。
13. **Windows/环境既有失败**：历史基线存在 Windows symlink EPERM 等既有失败；N3 基线必须先记录并分类，终验只对本次新增失败负责，既有失败附证据说明。并行全量可能出现桌面时序偶发，必须用隔离/整文件/串行复跑分类。
14. **Node PATH**：当前 shell 未包含 Node；基线执行需按上轮记录把 `C:\Users\51054\AppData\Local\Programs\nodejs` 加入 PATH，并记录实测 Node/npm 版本；不得因命令不可用伪造结果。
15. **`real-entry.test.ts` 快照**：该用例快照 `docs/scheduling/`，断言演示不新增/不改写记录；本任务新增团队计划发生在演示前，理论上不影响快照；若基线确认其语义不符，测试角色可在 `test/测试/**` 内按「不新增/不改写」的真实语义更新，不得放宽为永远通过。
16. **产品运行期 `docs/scheduling/` 写入与既有记录同名风险**：产品 Convener 的团队计划、readiness、变更包都用 `<flowId>-vN.md` 命名；在本仓库演示/测试时不得覆盖既有 `docs/scheduling/2026-10-22-*.md` 等记录。测试夹具必须使用独立 flowId/临时项目根。
17. **`docs/` 跟踪状态与候选口径**：上轮管理记录已随 `64ed44a` 跟踪；本轮意图/方案/团队计划为未跟踪。候选身份以产品代码/测试文件哈希与已跟踪 diff 为准，不把管理记录混入候选，也不把未跟踪文件冒充产品改动。
18. **无 task_ops**：无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件与原始输出为准。
19. **`app/desktop/session.ts` 不在方案列明面**：默认不改；若实施发现必须接线，先停止并回报统筹，不自行扩大写集。
20. **`src/provider/runtime/*` 默认不改**：方案 §9.3 明确不改；若确需最小文案同步，属运行时核心 Section 1，须在报告中单列理由，且不得改 schema/参数/校验形状。
21. **Reduce 前置过严**：要求 Reduce 依赖全部 Map，可能让一个慢模块阻塞所有 Reduce。这是 MapReduce 的正确语义；若客户希望「部分 Reduce 先跑」，需显式声明 reduce scope，本方案不做，避免复杂度。
22. **纳米角色反向风险**：过度强调「一个模块一个角色」可能诱导把模块拆得过细；必须同时用五维协调成本、模块清单架构来源、readiness 抽查约束，不把「模块数多」当成「粒度好」。
23. **真实启动/演示边界**：工程基线不降；测试角色不得以「Verifier 会跑」为由省略；离线无真实凭据时如实记录模型桩边界；缺失时验收判证据不足。
24. **测试夹具更新范围**：`fixture.ts` 保留 v1 夹具，新增 v2 生成器；不得把所有既有夹具批量改成 v2，否则会失去 legacy 覆盖。legacy 链路必须至少保留一条。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md`）。
- **已确认**：闸门 2 与客户实施授权（2026-10-22，记录见 `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`「闸门 2 确认与实施授权记录」）。
- **已完成**：N3 官方基线（测试角色；pre-standard + post-standard；见 §11.3/§11.3.1）。
- **已完成**：Map A（运行时核心 + 门禁引擎并行；implemented-unverified；候选哈希/测试/独立复核见 §11.5）。
- **已派发并完成**：Map B（编排；implemented-unverified；候选哈希/测试/复核见 §11.7）。
- **已派发并完成**：Map C（桌面窗口 + 桌面UI 并行；桌面窗口 implemented-unverified，桌面UI N/A + exact build；见 §11.9）。
- **已完成**：Reduce（测试终验；verified-by-tests-only；见 §11.11）。
- **已写盘**：变更包 `docs/scheduling/role-granularity-parallel-testing-change-v1.md`（T3；候选 29 文件；证据链接；不是验收结论）。
- **已完成**：内置独立验收判定**通过（当前候选）**；N8 完成、N9 放行（见 §11.12）。
- **未做**：提交、推送、合并、发布、部署或任何对外操作；人事写卡/改边界（默认不需要）。
- **下一步**：由沟通向客户回报验收结论；提交/推送/合并/发布由客户另行决定。方案 §5.4.1 V12 与 §9.1/§5.5/P9 的 existing 措辞冲突建议策划下一版本统一，不追溯改报告。

## 十一、闸门 2 确认、实施授权与 N3 基线（2026-10-22）

### 11.1 闸门 2 与实施授权

- **客户选择**：**确认并授权实施**（2026-10-22，本地）。
- **确认对象**：本团队计划（2026-10-22 版本；`git hash-object` = `4fb701fc31d21dcd5f31c48db3d1e499d6c53c9e`）。
- **确认记录**：[`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`](../communication/2026-10-22_intent-role-granularity-parallel-testing.md)「闸门 2 确认与实施授权记录」。
- **确认范围**：参与角色（运行时核心、门禁引擎、编排、桌面窗口、桌面UI 条件/可选、测试 6 个现有 worker；内置独立验收与统筹；不启用人事、装配）；按本计划 §四/§八的逐角色精确写集；`src/common/编排/team-plan.ts`/`test/编排/team-plan.test.ts` 在已授权目录内；默认不新建 `test/桌面应用/` 文件；角色/边界无变更（条件项保留）；T3；阶段顺序；验收安排；证据口径。
- **实施授权**：与闸门 2 分开记录；客户明确选择「确认并授权实施」，两者均已具备。
- **放行边界**：N3 基线为只读/基线，可先启动；Map A 代码改动须等实施前验收标准写盘并经沟通确认，且逐角色范围预留完成。

#### 11.1.1 闸门 2 后团队计划版本核对（2026-10-22）

- **闸门 2 确认版本**：`git hash-object` = `4fb701fc31d21dcd5f31c48db3d1e499d6c53c9e`（意图记录「闸门 2 确认与实施授权记录」引用；SHA-256 未保存）。
- **当前版本（追加记录后）**：`git hash-object` = `a4370085528f9fc78b2aad963100d5b99f98d9f0`；SHA-256 = `73fabec537c920044ac063dffa16c097e9dd614efd48d52b91edb842b6420f07`。
- **差异核对**：只追加/更新了以下记录性内容——（a）闸门 2/实施授权状态与确认记录；（b）N3 基线派发与结果；（c）实施前验收标准状态；（d）`build:renderer` 作为 N3 验证命令、其 `app/renderer/dist/` 产物被忽略且非候选的归属说明。未修改参与角色、逐角色写集、阶段顺序、非目标或证据口径的实质内容。
- **结论**：无角色、写集或阶段实质变更；闸门 2 确认继续有效，不重开闸门 2。当前版本作为实施记录基线；若后续再出现角色/写集/阶段实质变化，重开闸门 2。
- **后续记录更新**：登记 §11.3 N3 基线结果与 §11.4 验收标准状态后，本文件 `git hash-object` 为 `66703f2fb8113b54cb4a48a0f404b524c1643d2d`、SHA-256 `df5df6ebf7810ce9bfa6e7e8494f40006bb1ec639383018e363aa22c38340e00`；追加 §11.3.1 官方基线与 §11.5 Map A 结果前的版本为 `ae9bbd2625f59e75c48404621aac2e40a3d12195`、SHA-256 `94b3233fb54898bca2470c583f05d362dbb7ab4d57e167cfa82ad529ab653d8b`。本记录条目自身也会再次改变文件哈希，属正常管理记录追加；均不构成角色/写集/阶段变更。验收核对写集时以 §4.3/§八的逐角色写集为准，不以计划文件哈希变化为由改变标准。

### 11.2 N3 基线派发

- **节点**：N3（基线）。
- **角色**：测试（独立固定角色上下文；绑定 `角色卡/测试/role-card.md` 与 `boundary.md`）。
- **授权范围**：只读基线；不修改产品代码、测试、角色卡、边界、`docs/scheduling/`、`docs/acceptance/`；不暂存、提交、推送、合并、发布；写区仅 `角色卡/测试/docs/change/`（基线证据记录）。
- **基线**：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`；工作树以 `git status --short` 实测为准；不把既有 memo/未跟踪管理文档当作代码改动。
- **命令**：`npm run typecheck`；`npm run typecheck:renderer`；受影响定向套件（`test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`test/桌面应用/` 精确文件、`test/桌面UI/**`、`test/测试/governance-e2e-auto/**`）；`node --test "test/**/*.test.ts"` run1/run2；`npm run build:renderer`（N3 官方基线验证命令，写 `app/renderer/dist/`；该目录被忽略、非候选，不改变任何已跟踪/候选文件；桌面UI 拥有该目录，测试角色仅执行验证并记录）；记录 Node/npm 版本、OS、退出码、测试计数、失败清单、HEAD 与工作树状态。
- **失败分类**：确定性既有失败（预期 9 项 Windows symlink EPERM，逐条指名文件与行号；实际数量以本次实测为准）、偶发（隔离/整文件/串行复跑分类）、跳过、不可用；不得笼统写「环境问题」。
- **状态**：已派发；pre-standard 结果见 §11.3；标准写盘后的官方 N3 基线（含 `build:renderer`）正在补跑，结果见 §11.3/§11.4。

### 11.3 N3 基线结果（测试角色回报 + 统筹复核，2026-10-22）

- **执行者**：测试角色独立固定上下文（agent `aa2a9075c28aa0af4`）；只读基线，未改代码/测试。
- **环境**：Windows 11 Pro 10.0.26300；MINGW64_NT-10.0-26300 / Git Bash 5.3.15；Git 2.55.0.windows.5；Node v24.22.1；npm 11.19.1（PATH 加入 `C:\Users\51054\AppData\Local\Programs\nodejs`）。
- **HEAD/工作树**：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`；tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`；分支 `feat/background-tasks-governance-and-reasoning`（命令前后一致）。写前工作树：`M docs/communication/memo.md`、`M docs/planning/memo.md`；未跟踪意图/方案/团队计划；`git diff --cached` 为空；无已跟踪代码/测试改动。写后仅新增测试角色证据目录；另观察到并发写入的验收标准（见 §11.4）。
- **命令与计数（pre-standard，标准写盘前）**：

| 命令 | 退出码 | tests/pass/fail/skip/todo | 耗时 | 备注 |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | 0 | — | 1,411 ms | 无诊断 |
| `npm run typecheck:renderer` | 0 | — | 610 ms | 无诊断 |
| `node --test "test/编排/**/*.test.ts"` | 1 | 735/734/1/0/0 | 1,944 ms | 唯一红为基线 EPERM |
| `node --test "test/门禁引擎/**/*.test.ts"` | 0 | 305/304/0/1/0 | 574 ms | 1 skip 平台型 |
| `node --test "test/runtime-core/**/*.test.ts"` | 1 | 290/283/3/4/0 | 14,642 ms | 3 红均为基线 EPERM |
| `node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/operator-wiring.test.ts` | 0 | 166/166/0/0/0 | 17,514 ms | 精确文件 |
| `node --test "test/桌面UI/**/*.test.ts"` | 0 | 163/163/0/0/0 | 307 ms | — |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | 0 | 68/68/0/0/0 | 11,414 ms | — |
| `node --test "test/**/*.test.ts"` run1 | 1 | 3448/3421/9/18/0 | 22,287 ms | 9 红均 EPERM |
| `node --test "test/**/*.test.ts"` run2 | 1 | 3448/3421/9/18/0 | 22,285 ms | 失败集合与 run1 一致 |

- **9 项确定性既有失败（Windows symlink EPERM，errno -4048；两次全量失败集合逐条一致）**：
  1. `test/claude-adapter/session.test.ts:637`（抛错 :641）native symlink and storage runtime mismatch fail before SDK query
  2. `test/codex-adapter/session.test.ts:351`（:369）native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary
  3. `test/pi-adapter/injected-runtime.test.ts:185`（:188）store validate callback rejects directory symlink before Pi parse or new native write
  4. `test/pi-adapter/injected-runtime.test.ts:193`（:195）Pi storage refuses file symlink and role/runtime mismatch without touching other storage
  5. `test/runtime-core/file-write-safety.test.ts:97`（:105）D3 linked workspace root remains usable; linked target itself is not replaced
  6. `test/runtime-core/session-store.test.ts:46`（:51）store: traversal, mismatched scope and symlinked runtime directories rejected
  7. `test/runtime-core/session-store.test.ts:58`（:63）store: native validation stays lazy and native symlink is rejected before effects
  8. `test/测试/g4-skill-verify/b-render-double-check.test.ts:182`（:197）读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛
  9. `test/编排/shell-authorized-routine.test.ts:103`（:110）node test 外指符号链接路径不获委托；项目内测试路径获委托
- **偶发/跳过/不可用**：无偶发（两次全量失败集合一致，无需隔离复跑）；skipped 18 项均为平台设计跳过（codex process-group 1、pi session-persistence chmod 1、runtime-core/file-write-safety 4、lightweight-permission-repairs 6、门禁引擎/pin-evidence unreadable 1、项目管理/shared/atomic-write 5）；无超时/不可用。
- **未运行（pre-standard）**：`npm run build:renderer`（标准写盘前基线未跑；按验收标准 §3.4 在标准写盘后补跑官方基线）、`npm run app`/Electron e2e（属 Reduce）。
- **与上轮基线对照**：全量 tests 3416→3448；9 红为同一 EPERM 清单；无偶发；上轮 `real-entry` 工作树型红本次未出现（只记其通过，不判定语义变化）。
- **证据**：
  - 报告：`角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md`
  - 证据目录：`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/`（58 个文件；含 typecheck、各定向套件、full run1/run2、git status/diff/ls-tree、版本信息）
- **标准时序说明**：验收标准于 2026-10-22 20:30:55 写盘，晚于 pre-standard full run2 结束（20:30:27）。按标准 §3.2「证据生成时间必须晚于标准写盘」与 §3.4「N3 跑完整 T3 组命令（含 `build:renderer`）」，测试角色正在补跑 **官方 N3 基线（post-standard）**：typecheck/typecheck:renderer/full run1+run2/build:renderer；结果登记于 §11.3 的后续更新。pre-standard 结果保留为参考与偶发分类依据。
- **写区声明**：除 `角色卡/测试/docs/` 外未写任何文件；未修改产品代码/测试/角色卡/边界/`docs/scheduling/`/`docs/acceptance/`；未在 `test/桌面应用/` 新建文件；未暂存/提交/推送/合并/发布。

#### 11.3.1 官方 N3 基线（post-standard，2026-10-22）

- **标准时序**：验收标准于 20:30:55 写盘；测试角色在标准写盘后对同一 HEAD `64ed44a` 补跑官方基线，未启动 Map A、未改代码。
- **命令与结果（官方基线）**：

| 命令 | 退出码 | tests/pass/fail/skip/todo | 耗时 | 日志 |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | 0 | — | 1,422 ms | `post-standard/typecheck.log` |
| `npm run typecheck:renderer` | 0 | — | 611 ms | `post-standard/typecheck-renderer.log` |
| `timeout 300 node --test "test/**/*.test.ts"`（run1 rerun） | 1 | 3448/3421/9/18/0 | 22,394 ms | `post-standard/full-run1-rerun.log` |
| 同上（run2） | 1 | 3448/3421/9/18/0 | 22,326 ms | `post-standard/full-run2.log` |
| `npm run build:renderer -- --outDir C:/Users/51054/AppData/Local/Temp/ans-renderer-build-poststandard` | 0 | — | 891 ms | `post-standard/build-renderer-temp-outdir.log` |

- **9 项失败**：与 §11.3 pre-standard 的 9 项 Windows symlink EPERM 逐条一致（两次 rerun 失败标题集合一致）；无本次新增失败。
- **跳过/偶发**：skipped 18，与 pre-standard 分布一致；两次全量 rerun 未见偶发失败。
- **环境挂起观察（如实记录，不判产品缺陷）**：首次 post-standard `full-run1` 于 20:33:19 启动，日志 20:33:55 后无进展，约 621 秒后终止，无 summary；隔离复跑 `test/pi-adapter/write-sequencing.test.ts` 也出现 >1 分钟挂起并终止。两次完整全量 rerun 均正常完成且包含该文件并通过；按上轮同类瞬时挂起记录为宿主/并发观察，不作为新增红，也不能据此掩盖其他失败。
- **构建产物归属**：`build:renderer` 通过 `--outDir` 重定向到仓库外临时目录，未写 `app/renderer/dist/`；满足测试角色写集，构建结果可复算。统筹确认该等价构建为 N3 基线证据；最终候选的 exact `npm run build:renderer`（写 `app/renderer/dist/`）由桌面UI owner 在 Map C 对同一候选执行并提供，测试角色/验收复用同候选证据，不要求测试角色补跑 exact 形式、不扩张写权。该偏差与理由写入变更包。
- **N3→N4 时序核对**：官方基线最后一条命令结束于 20:48:18；Map A 两个 worker 的首个产品文件改动 mtime 为 20:48:34。重叠仅发生在测试角色报告收尾阶段；官方基线计数对应未改动的 HEAD `64ed44a` 工作树，基线有效。最终 `git status` 含 Map A 改动属预期，不是测试角色写入。
- **结论**：官方 N3 基线在 HEAD `64ed44a` 上建立：typecheck/typecheck:renderer/build 通过；全量 3448/3421/9/18，9 项均为既有 EPERM，零新增确定性失败；挂起为环境观察。可作为最终候选的全量对照基线。
- **证据**：`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/post-standard/`（typecheck、typecheck-renderer、full-run1-rerun、full-run2、build-renderer-temp-outdir、挂起记录、失败标题、git/dist 状态）。
- **放行**：N3 出口条件满足；实施前验收标准已由沟通确认（§11.4）。可派发 Map A（运行时核心 + 门禁引擎并行）；Map B/C 仍按阶段顺序等待。

### 11.4 实施前验收标准状态

- **文件**：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`（2026-10-22 写盘；标准版本 `role-granularity-parallel-testing-criteria-v1`；T3；结论「待判定」）。
- **哈希**：`git hash-object` = `759fcc312059d11d67cce4ec84e98b0409840a7b`；SHA-256 = `f5da3c31c5722370c70f33937841b860d5a64af16f8687b857aa5198e7d25751`；553 行；16 条标准（P1–P14、G1–G2）。
- **统筹结构预检（只读，2026-10-22）**：含验收表（P1–P14、G1–G2）、T3 与依据、判定规则（pass/fail/insufficient evidence/not applicable）、证据失效矩阵、T3 全量回归规则（含 `build:renderer`）、Map 分片/Reduce 证据要求、版本冻结与报告首行五项；结构上满足 N2 放行门槛。该预检不代替沟通确认，也不代替独立验收判定。
- **沟通确认（2026-10-22）**：路径与哈希如上；沟通已核对并交付统筹。**已放行 N3/N4 的标准前置**；Map A 仍须待官方 N3 基线（post-standard）完成后启动。
- **标准 §九.2 的团队计划 hash 问题**：已由 §11.1.1 核对并登记两版哈希与结论；无角色/写集/阶段实质变更，闸门 2 继续有效。
- **标准 §3.4 的 `build:renderer` 要求**：N3 官方基线补跑包含该命令；其 `app/renderer/dist/` 产物被忽略、非候选，测试角色仅作验证执行并记录。

### 11.5 Map A 派发、结果与候选证据（2026-10-22）

- **派发**：N4（Map A）两个独立 worker 并行，写集不相交：
  - 运行时核心（agent `aface2e9244b194cd`）：`src/model/runtime.ts`、`test/runtime-core/`、自身文档；门禁引擎 worker 同时写 `src/common/门禁引擎/`，互不越界。
  - 门禁引擎（agent `a714fa66b208b4da6`）：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/`、自身文档。
- **运行时核心结果（implemented-unverified）**：
  - 改动：`src/model/runtime.ts` 增加 `FlowToolStepView.parallelGroup?/dependsOn?`、`FlowStepSupersedeFn` 输入可选字段、`GovernanceJudgeFacts.teamPlanSchema?: 1 | 2` 与 `teamPlanModules?: string[]`；`FlowToolView.steps` 经 `FlowToolStepView[]` 承载；不新增 artifact kind；`FlowToolStepKind`/`FLOW_TOOL_STEP_KINDS` 仍四值；`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 未改。`src/provider/runtime/{tools,schema}.ts` 零改动。
  - 候选哈希：`src/model/runtime.ts` blob `4b96ae9db3f8f962913e2d010d5ab47bba110389`（sha256 `6d3299920982cb1191b7d9f18dc31b74d1b94e200c7acd8af7ec9bfc3cd54cfc`）；`test/runtime-core/governance-flow-metadata.test.ts` blob `1ba4b621c682b3fb81e9cfe977ed2e8d2080697b`（sha256 `c7ef45c3e917de1570add346f01654ebc7030440025488fd67216864a3d8fa66`）。
  - 检查：定向 `governance-flow-metadata.test.ts` 13/13 exit 0；`test/runtime-core/**` 292/285/3/4 exit 1（较基线 290/283/3/4：+2 计 +2 过，同 3 项既有 EPERM、同 4 skip，零新增红）；`npm run typecheck` exit 0。
- **门禁引擎结果（implemented-unverified）**：
  - 改动：`CONVENER_CARD_TEXT` 增加团队计划 v2（`teamPlanSchema: 2`/modules/模块清单/14 列角色表/模块覆盖/写集/DAG/并行组/粒度理由/readiness 新列/flow 模板 `parallelGroup`/`dependsOn`）；`NOMINATOR_CARD_TEXT` 增加 v2 读计划/写 bounded context/契约/测试面/依赖/粒度理由；`VERIFIER_CARD_TEXT` 采用可选补充（核对模块覆盖/manifest/分片证据，不改变真实启动/演示基线）；`BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized、`ENGINEERING_QUALITY_BASELINE`、角色 id/显示名/路径、枚举值均未变。
  - 候选哈希：`src/common/门禁引擎/governance-roles.ts` blob `f074f0e15598b85cd47048652adca9bde07a5259`（sha256 `2fea2f941c90dbb611f6dcf08e332c0fcb94d9da0476a2c3b4ea753919fdfb4d`）；`test/门禁引擎/governance-trio.test.ts` blob `356d4433f58a6b0172afb5be11ae263c0a261e77`；`test/门禁引擎/governance-standard-workflow.test.ts` blob `32fc34c914ca87852fc7e779921cc57f0d37243e`。
  - 检查：定向两文件 60/60 exit 0（改动前 49/49）；`test/门禁引擎/**` 313/312/0/1 exit 0（基线 305/304/0/1：+8 计 +8 过，同 1 skip）；`npm run typecheck` exit 0；只读相关套件 `governance-trio-verify`+`governance-liaison-verify` 50/50、`governance-judge-cards-verify`+`governance-e2e-auto` 104/104、`test/编排/**` 735/734/1（唯一红为 N3 基线既有 EPERM）。
- **统筹独立复核（只读）**：
  - `npm run typecheck` exit 0；定向 runtime 13/13、gate 60/60；`test/门禁引擎/**` 313/312/0/1；`test/runtime-core/**` 292/285/3/4（3 红均为 N3 基线同一 EPERM）。
  - 关键候选哈希复算与两组报告逐字一致；`git diff --cached --name-only` 为空；`git diff --name-only` 仅 Map A 写集 + 既有 `docs/communication/memo.md`/`docs/planning/memo.md` + 测试角色基线证据；无 `app/**`、`src/common/编排/**`、`src/pipeline/**`、`test/测试/**`、`test/桌面应用/**` 的 worker 写入；`src/provider/runtime/{tools,schema}.ts` 未改。
  - 不变量抽查：注册表 entries/forbidden/preauthorized、`ENGINEERING_QUALITY_BASELINE` 文本、枚举值、角色 id/显示名/路径未变；`FlowToolStepKind` 仍四值。
- **Provider 工具入口的已知限制（记录，不扩权）**：`src/provider/runtime/schema.ts`/`tools.ts` 的 `flow_step_supersede` 参数与 handler 未接收/转发 `parallelGroup`/`dependsOn`；`flow_get` 的文本投影 `renderFlowView` 也未渲染这两字段（`FlowToolStepView`/`FlowToolView` 结构化类型已可承载）。这是方案 §9.1/§9.3「Provider 工具不改、不新增参数」的直接结果。初始 flow 通过 Convener 的 `write_file`（初始创建除外）写入 YAML，可携带两个可选字段。若 Map B/C/e2e 证明必须让 `flow_step_supersede` 工具携带这两个字段或让 `flow_get` 文本投影显示它们，先停止并回报统筹，按方案变更/闸门处理，不得静默扩大 Provider 参数或写入边界。
- **状态**：Map A 完成（implemented-unverified）；Model 契约与卡文本已冻结。**Map B（编排）已按 §11.6 放行并派发；Map C 未启动。**

### 11.6 Map B 放行与口径确认（2026-10-22）

- **Map A 复核**：沟通/统筹复核 `src/model/runtime.ts` `4b96ae9d…`、`src/common/门禁引擎/governance-roles.ts` `f074f0e1…`、`test/runtime-core/governance-flow-metadata.test.ts` `1ba4b621…`；`app/`、`src/common/编排/`、`src/pipeline/`、`test/桌面应用/` 零改动；定向/套件计数与报告一致；团队计划当前 `22a54a41…`。
- **口径 1（Provider 工具限制）**：本轮维持方案 A 的「不新增/不扩展 Provider 参数」。`flow_step_supersede` 不转发、`flow_get` 不渲染 `parallelGroup`/`dependsOn`，在初始 flow YAML 可携带、Map B/C 不需要通过工具更新它们的前提下接受。若 Map B/C/e2e 证明工具必须支持，**停止并回报**，按方案变更/闸门处理，不得静默扩 Provider 参数。
- **口径 2（N3 构建）**：接受 `--outDir` 到仓库外的等价构建作为 N3 基线证据；最终候选的 exact `npm run build:renderer` 由桌面UI 在 Map C 对同一候选执行，记录输出/哈希，验收复用该证据。
- **Map B 派发**：
  - 角色：编排（独立固定角色上下文；绑定 `角色卡/编排/role-card.md` 与 `boundary.md`）。
  - 写集：新增 `src/common/编排/team-plan.ts`；`src/common/编排/flow-state.ts`、`flow-service.ts`、`governance-gate.ts`、`governance-judge*`；`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`；`test/编排/**`；自身文档。
  - 不写：`app/**`、`test/桌面应用/**`、`test/测试/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`test/桌面UI/**`、`src/common/门禁引擎/**`、`src/model/runtime.ts`、`docs/scheduling/`、`docs/acceptance/`。
  - 契约依据：Map A 冻结的 `FlowToolStepView.parallelGroup?/dependsOn?`、`FlowStepSupersedeFn` 输入可选字段、`GovernanceJudgeFacts.teamPlanSchema?/teamPlanModules?`；Provider 工具不改。
  - 验收/证据：`node --test "test/编排/**/*.test.ts"`、`npm run typecheck`；候选哈希/diff/status；文档 `implemented-unverified`；V1–V10/V11、flow 可选字段/旧 flow 不变、dispatch `dependsOn` 前置 `done`、卡前守卫、session 提示；完成后停止，不启动 Map C。
- **状态**：Map B 已派发并完成，结果见 §11.7。

### 11.7 Map B 结果与候选证据（2026-10-22）

- **执行者**：编排 worker（独立固定角色上下文，agent `afcbd56d7ab65a4f8`）；状态 `implemented-unverified`；未提交/暂存/推送/合并/发布。
- **改动摘要**：
  - 新增 `src/common/编排/team-plan.ts`：团队计划 v2 单一解析/校验（Q9 A），实现 V1–V10；复用 `parseRecommendedRoleIds`；legacy v1 分支保留。
  - `flow-state.ts`：`FlowStateStep` 可选 `parallelGroup`/`dependsOn`；`STEP_KEYS` 严格；静态校验（语法、目标存在/自依赖/重复/环、同 map 组无依赖路径、Reduce 覆盖全部 Map、Map 不依赖 Reduce、新契约 flow 的 Map 交付依赖 `contract-freeze`）；`FLOW_STEP_KINDS` 仍四值。
  - `flow-service.ts`：`viewOf`/`serializeFlow`/`flowStepSupersede` 携带可选字段；旧 flow 序列化逐字不变。
  - `governance-gate.ts`：`evaluateDispatchGate` 对声明 `dependsOn` 的步骤要求前置全部 `done`；不改变派发权；旧步骤无 dependsOn 不新增检查。
  - `run-role.ts`：`teamPlanRoleRowsIssues` 改为单一 `team-plan.ts` 实现；`validateConvenerAppointmentCard` 跑 V1–V11；失败不弹卡/不写账本；经 pipeline 公共出口再导出 `team-plan.ts` 的解析/校验 API（Map C 桌面消费，不直接 import 私有 common）。
  - `govern-session.ts`：v2/模块清单/MapReduce/flow 字段/readiness 例外/测试分片/manifest 提示同步。
  - `governance-judge-facts.ts`/`-evidence.ts`/`-prompt.ts` 未改（无必要）；Provider 零改动；未新增 cardKind/FlowStepKind/power/decision/artifact kind。
- **公共 API（供 Map C）**：`parseTeamPlan(text, {flowId?})`、`parseTeamPlanModuleIds(text)`、`parseWritesetCell(raw)`、`writesetsOverlap(a,b)`、`isGovernanceWritesetPath(value)`、`legacyTeamPlanRoleRowIssues(text, recommended)`、`teamPlanIssueMessages(result, severity?)`、`validateTeamPlanFlowConsistency(plan, flow)`；结果含 `{ok, legacy, teamPlanSchema, flowId?, version?, riskTier?, recommended, modules, moduleList, roleRows, issues}`，`roleRows` 含 `roleType/modules/primaryModule/writesets/contracts/testSurface/dependsOn/parallelGroup/granularityRationale/apiSpecStatus/isMap/isReduce`。经 `src/pipeline/orchestration/run-role.ts` 再导出。
- **候选哈希（关键）**：
  - `src/common/编排/team-plan.ts`（新）blob `328737a3735f69209fd4ac8e32c26d789df16d44`；sha256 `c32f7b3ce3394ece2099389beaa5d496bb6a713341c4e116a03efd26f71c2b82`
  - `src/common/编排/flow-state.ts` blob `ec1ba7c1706cc5b07ef17f01ef935bf529a8ea9a`；sha256 `f9c4959a8def24ecfbc317220ece27545195f1f7eaed0d930cb37a1b63252e44`
  - `src/common/编排/flow-service.ts` blob `cdba51754e73e4d39bfbdedea7ecc788a05e76e8`；sha256 `6808144984231aa7e57f650201734c3ee00da2d9abb809682cd006344bb588b7`
  - `src/common/编排/governance-gate.ts` blob `948116e73141830342a1e8721b56163dfda53ffa`；sha256 `178ad78a5dbfdd4480fcd7469e5fb020ac976becf878218b941896a54ff7c2b2`
  - `src/pipeline/orchestration/run-role.ts` blob `8aa00772c5228037fcd080bcdd520a616b4ea794`；sha256 `80338c7b809f3bc0a95dfaa458cab5b92a8089eca236f9298d1d1636c5933879`
  - `src/pipeline/orchestration/govern-session.ts` blob `988934b43c7b2fb16c6638f79128674bc77eddef`；sha256 `e9b7dd85a6fade9e1242d2111b1a0d6a4f7c2fcb179e018f71043497e00052be`
  - `test/编排/team-plan.test.ts`（新）blob `402b909ade71a79efb30f68252b4e413b5701426`；sha256 `b7babe60bde270c12a4794f6ed3dd364ea001f49cb62c1ca8ab3cf8c51f50e47`
- **检查（worker 原始 + 统筹独立复核）**：
  - 定向 5 套件 141/141（team-plan 17、flow-state 44、flow-service 24、governance-gate 22、governance-session 34）。
  - `node --test "test/编排/**/*.test.ts"`：**769/768/1/0**，exit 1，1,868 ms；唯一红为 N3 基线既有 `test/编排/shell-authorized-routine.test.ts:103` EPERM；较基线 735/734/1：+34 计 +34 过、零新增红。统筹独立复跑同计数。
  - `npm run typecheck` exit 0（1.407 s）；统筹独立复跑 exit 0。
  - 只读跨角色回归：`test/测试/governance-e2e-auto/**` 68/68；`test/runtime-core/**` 292/285/3/4（同基线 3 项 EPERM）；`test/门禁引擎/**` 313/312/0/1（同 Map A）。统筹未重跑这三组，按同候选只读证据与 Map A/N3 对照记录。
  - 统筹复核：`git diff --cached` 空；关键哈希逐字一致；`git diff --name-only` 仅 Map B 写集 + Map A 写集 + 既有 memo + 测试基线证据；无 `app/**`、`test/桌面应用/**`、`test/测试/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`src/common/门禁引擎/**`、`src/model/runtime.ts`、`src/provider/runtime/**`、`docs/scheduling/`、`docs/acceptance/` 的 Map B 越界写入；grep 确认 `FLOW_STEP_KINDS` 仍四值、`STEP_KEYS` 含新可选字段、`evaluateDispatchGate` 有 dependsOn 前置 `done`、`run-role.ts` 有公共再导出。
- **偏差/限制（如实登记）**：
  1. Provider 工具限制非阻塞：`flow_step_supersede` 不转发、`flow_get` 文本投影不渲染 `parallelGroup`/`dependsOn`（Map A/§11.6 已接受）；服务层类型/视图/序列化已支持，初始 YAML 可携带。Map B 未证明必须扩 Provider；若 Map C/e2e 证明必须，按 §11.6 停止回报。
  2. V11 的部分防御分支被 flow 静态校验前置（真实入口先 `parseFlowStateYaml`，坏 flow 以 YAML 校验失败退回）；单测以直接构造 FlowState 覆盖 V11 防御分支。
  3. `superseded` 步骤不参与 Map/Reduce 调度语义（同收尾门），但仍参与 dependsOn 存在性/环；替代 Map 交付时需同步 Reduce 依赖；本轮未扩 `flow_step_update`。
  4. v2 按 Q8 A 要求至少一个 Reduce 角色（V8 硬规则）；`web` 属通用层名黑名单，测试正例模块使用 `storefront`。
- **状态**：Map B 完成（implemented-unverified）；Map C 已按 §11.8 放行并派发；Map D/Reduce 未启动。

### 11.8 Map C 放行与派发（2026-10-22）

- **Map B 复核**：沟通/统筹复核 `team-plan.ts` `328737a3…`、`flow-state.ts` `ec1ba7c1…`、`flow-service.ts` `cdba5175…`、`governance-gate.ts` `948116e7…`、`run-role.ts` `8aa00772…`、`govern-session.ts` `988934b4…`；`app/`、`test/桌面应用/`、`test/测试/` 零改动；编排套件 769/768/1（唯一红为既有 EPERM）、typecheck 0；团队计划当前 `272ca4d5…`。
- **Provider 口径维持**：不新增/不扩展参数；`flow_step_supersede` 不转发、`flow_get` 不渲染 `parallelGroup`/`dependsOn`，在初始 YAML 可携带的前提下接受。若 Map C/e2e 证明必须支持，停止回报，按方案变更/闸门处理，不得静默扩参。
- **Map C 派发（桌面窗口 + 桌面UI 并行）**：
  - 桌面窗口写集：`app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts`；既有 `test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts`（`dispatch-delivery.test.ts`/`e2e/main.mjs` 条件）；自身文档。**不得新建 `test/桌面应用/` 文件。**
    - 实现 `parseTeamPlanInfo` v2/legacy（消费 `src/pipeline/orchestration/run-role.ts` 公共出口，不直接 import 私有 common）；V12 计划写集 vs 角色边界覆盖；问题来源分流（Crew 文件 vs Convener 计划）；任务文案含模块/并行/分片/manifest；`customer-input.ts` 按需透传；不改客户入口/IPC/派发权。
  - 桌面UI 写集：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`、`test/桌面UI/**`；自身文档。只在团队计划/模块/并行信息或 appointment 文案需要时改；不需要则以 N/A + 理由记录。`test/桌面应用/renderer.test.ts` 当前不存在，默认不创建。
    - 最终候选 exact `npm run build:renderer` 由桌面UI 对同一候选执行（写 `app/renderer/dist/`，忽略、非候选），记录输出/哈希，供测试/验收复用。
  - 不写：`test/测试/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`src/common/编排/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、`src/model/runtime.ts`、`src/provider/runtime/**`、`docs/scheduling/`、`docs/acceptance/`、`app/main.ts`、`app/preload.cjs`、构建配置。
  - 证据：`node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/operator-wiring.test.ts`（必要时加 `dispatch-delivery.test.ts`）；`npm run typecheck`；桌面UI `node --test "test/桌面UI/**/*.test.ts"`、`npm run typecheck:renderer`、`npm run build:renderer`；候选哈希/diff/status；文档 `implemented-unverified`。
- **状态**：Map C 已派发并完成，结果见 §11.9。

### 11.9 Map C 结果与候选证据（2026-10-22）

- **执行者**：桌面窗口（agent `affea1f99cb99ccaa`，opus）与桌面UI（agent `a808cf889d2a8d966`，sonnet）并行；均未提交/暂存/推送/合并/发布；HEAD 仍 `64ed44a`。
- **桌面窗口结果（implemented-unverified）**：
  - `app/desktop/interface.ts`：`TeamPlanRoleRow`/`TeamPlanInfo` 扩展 v2 字段（module/modules/primaryModule/writesets/contracts/testSurface/dependsOn/parallelGroup/granularityRationale/isMap/isReduce、模块清单、planIssues/warnings/legacy/teamPlanSchema）；`parseTeamPlanInfo` 经 `src/pipeline/orchestration/run-role.ts` 公共出口消费 `team-plan.ts`，未直接 import 私有 common、未保留第二份 v2 解析；legacy 保留 v1 表头/推荐集/四列检查 + 非阻断迁移 warning；v2 warning/exception-review 只记诊断，error 来源=Convener。
  - `validateAppointmentArtifacts`（V12）：计划写集必须被角色 `boundary.yaml` entries 覆盖（file 精确；directory/conditional-directory 经 `writesetsOverlap` 覆盖其中写集；仅 project root）；new/changed 未覆盖 ⇒ Crew 阻塞（提示计划有误时报告 Convener）；existing 未覆盖 ⇒ 仅 warning 不阻塞；来源分流（Crew 文件 vs Convener 计划）。
  - `app/desktop/governance-advance.ts`：proposal accept 分支要求团队计划 v2（teamPlanSchema/modules/模块清单/14 列/五维/Map 写集/Reduce 覆盖/粒度理由，legacy 迁移提醒）；appointment→Crew 读 module/契约/测试面/dependsOn/并行/粒度 + V12 boundary 覆盖；readiness 任务含模块列/Map/Reduce/测试分片/独立证据/manifest；验收标准/验收任务含 MapReduce 证据要求；派发权/卡种/客户入口未动。
  - `customer-input.ts`、`acceptance-dispatch.test.ts`、`dispatch-delivery.test.ts`、`e2e/main.mjs` 未改（N/A：现有已按结构透传 teamPlanPath；既有断言回归通过；无 dispatch 文案/依赖失效）。未新建 `test/桌面应用/` 文件。
  - 候选哈希：`app/desktop/interface.ts` blob `203e36f492f4bcc07689810bdd6c861a75e5cba9`（sha256 `a683e5a51c88f7bef1d4b9d652ec0bcadd2de1d32f8299094e1fa2b264364c88`）；`app/desktop/governance-advance.ts` blob `965e46568a49c4e445ae947de3addd21a51a1d5f`（sha256 `c0eaa76920ad2159597055cb04c90662d133abd160555021e5cbfdf5588b9364`）；`test/桌面应用/interface.test.ts` blob `f3b8cae8c2bf637020c469e1874f675f6a2aef9f`；`test/桌面应用/operator-wiring.test.ts` blob `da29d2675969f84bf401acd0840974408a33b013`。
  - 检查：`npm run typecheck` exit 0；定向三文件 171/171 exit 0（17,396 ms）；只读 `test/桌面应用/**` 518/518；`test/测试/governance-e2e-auto/**` 68/68；`governance-{trio,judge-cards,liaison}-verify/**` 86/86。
- **桌面UI 结果（N/A，未改源码）**：
  - 判断：渲染层没有团队计划 v2 的渲染面；`governance-view.ts` 只转写治理动作/状态/卡元信息，`role-view.ts` 只按 governanceFunction/组别派生显示名与副标题；v2 任务文案由桌面窗口经 summary/正文原样透传，无需渲染侧二次映射；无经确认的模块/并行 UI 文案定稿。按验收标准 §4.4 允许的 P10/P13 可选文案子项 N/A + 理由记录。
  - `node --test "test/桌面UI/**/*.test.ts"` 163/163 exit 0；`npm run typecheck:renderer` exit 0；**exact `npm run build:renderer` exit 0**（2,654 modules，built in 298 ms；仅既有 chunk >500 kB 提示）；`app/renderer/dist` 4 个文件，`git check-ignore` → `.gitignore:9:app/renderer/dist/`，未进入 status/diff，非候选。
  - `app/renderer/src/chat/governance-view.ts`/`role-view.ts` 与 `test/桌面UI/**` blob 未变（写前=写后）；`test/桌面应用/renderer.test.ts` 未创建；自身文档记录 N/A。
- **统筹独立复核（只读）**：
  - `npm run typecheck` exit 0；定向三文件 171/171；`test/桌面应用/**` 518/518；`test/桌面UI/**` 163/163；`npm run typecheck:renderer` exit 0。
  - 关键候选哈希复算与报告逐字一致；`git diff --cached` 空；`git diff --name-only` 仅 Map A/B/C 写集 + 既有 memo + 测试基线证据；Map C 无 `test/测试/**`、`test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`src/**` 写入；`app/renderer` 源码与 `test/桌面UI` 无 diff；`test/桌面应用/` 无新增文件；`app/renderer/dist` 被忽略、非候选。
- **Provider 口径**：Map C 未证明必须扩 Provider 参数；未改 `src/provider/runtime/**`；限制继续按 §11.6 记录。
- **状态**：Map C 完成（桌面窗口 implemented-unverified；桌面UI N/A + exact build 证据）；**Reduce（测试终验）已按 §11.10 放行并派发**。

### 11.10 Reduce（测试终验）放行与派发（2026-10-22）

- **Map C 复核**：沟通/统筹复核 `app/desktop/interface.ts` `203e36f4…`、`governance-advance.ts` `965e4656…`、`test/桌面应用/interface.test.ts` `f3b8cae8…`、`operator-wiring.test.ts` `da29d267…`；`app/renderer/src/` 与 `test/桌面UI/` 零改动，`test/桌面应用/` 无新建文件；团队计划当前 `62e4f228…`。
- **Provider 口径维持**：不新增/不扩展参数；Map C 已证明不需要。若 Reduce/e2e 证明必须支持，停止回报，按方案变更/闸门处理，不得静默扩参。
- **Reduce 派发**：
  - 角色：测试（独立固定角色上下文；绑定 `角色卡/测试/role-card.md` 与 `boundary.md`）。
  - 写集：`test/测试/**`（含 v2/legacy e2e、MapReduce 分片/负例、fixture、必要的 `real-entry` 更新）；自身证据 `角色卡/测试/docs/`。**不写**产品源码、其他角色测试目录、`test/桌面应用/`、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面UI/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界；不新建 `test/桌面应用/` 文件。
  - T3 全量回归：`node --test "test/**/*.test.ts"`（串行/并行至少各一次）；`npm run typecheck`；`npm run typecheck:renderer`；exact `npm run build:renderer`（写 `app/renderer/dist/`，忽略、非候选；桌面UI 已产出同候选/同源码证据，可复用并补跑）。与 N3 基线 3448/3421/9/18 对照，9 项 EPERM 逐条指名，零新增红；并行偶发以隔离/整文件/串行复跑分类。
  - MapReduce 测试：按模块分片并行（独立临时根/端口/日志/输出目录；不共享可变夹具；不同文件并发写）；Reduce 合并 manifest 并跑契约/集成/e2e；覆盖 v2 正例/负例（缺模块、模块重复/孤儿、写集重叠、依赖环、同组依赖、整层名/多模块无理由、Reduce 未覆盖 Map、legacy v1、dependsOn 前置、Provider 不扩参）。
  - canonical e2e + 真实启动/演示：`governance-e2e-auto`、`test/桌面应用/e2e/main.mjs`、治理链 demo；记录命令/截图/输出；不能以单元测试/mock 代替。
  - `real-entry`：若新管理记录使其断言变化，按上一轮口径更新为「演示不产生新记录/不改写既有记录」，不删记录、不放宽。
  - 完成后整理候选清单（`src/**`、`app/**`、`test/**` 的产品/测试文件哈希；管理记录/角色文档不混入），由统筹写 `docs/scheduling/role-granularity-parallel-testing-change-v1.md`；测试角色不自行宣布通过、不写变更包、不提交/暂存/推送。
- **状态**：Reduce 已派发并完成，结果见 §11.11。

### 11.11 Reduce 结果与变更包（2026-10-22）

- **执行者**：测试 worker（独立固定角色上下文，agent `a4c3cf033be2e157f`）；状态 `verified-by-tests-only`；未提交/暂存/推送/合并/发布；未写 `docs/scheduling/`、`docs/acceptance/`、角色卡/边界；未修改或新建 `test/桌面应用/` 文件。
- **候选**：HEAD `64ed44a`（tree `a736eaac…`）；29 个产品/测试文件；候选清单 `角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/candidate/`（`hashes.tsv` blob `aacf6fd2…`、SHA-256 `3f18309a…`；`tracked_diff_sha256` `267194bf…`；`untracked_candidate_sha256` `621ec300…`）；逐文件哈希 29/29 复算一致（统筹复核 mismatches=0）。
- **v2/legacy e2e**：`test/测试/governance-e2e-auto/**` 99/99 exit 0；v2 完整链路（团队计划 v2 → appointment V1–V11 → Crew 写两个 Map 角色 → V12/结构校验 → readiness → Map 并行派发 → 测试分片 → Reduce → manifest → 变更包 → Verifier → acceptance）与 legacy v1 链路均通过；新增 p/q/r/b/c/d v2 场景与负例。
- **Map 分片（并行，独立临时根/日志）**：orchestration 769/768/1（唯一红 N3 EPERM）；gate-engine 313/312/0/1；runtime-core 292/285/3/4（3 红 N3 EPERM）；desktop-files 518/517/1（并行时序偶发；隔离 16/16、整目录串行 518/518）；desktop-ui 163/163；governance-e2e 99/99；共享只读夹具 20 个 pin 哈希前后一致；失败隔离完成；manifest 见 `...-phase-e-evidence/manifest.md`。
- **T3 全量回归**：
  - 并行 3528/3501/9/18/0，exit 1，约 22.6 s；串行（`--test-concurrency=1`）3528/3501/9/18/0，exit 1，300,781 ms。
  - 与 N3 基线 3448/3421/9/18 对照：+80 tests / +80 pass；9 项失败逐条为同一 Windows symlink EPERM；零新增红；并行/串行失败标题集合一致。
  - `npm run typecheck` 0；`npm run typecheck:renderer` 0；exact `npm run build:renderer` 0（2,654 modules，298 ms；`app/renderer/dist` 忽略、非候选）。
  - `real-entry` 未修改，定向 16/16。
- **真实启动/演示**：`test/桌面应用/e2e/main.mjs` 真实 Electron exit 0、`E2E_PASS=true`、17 截图；v2 治理链 `test/测试/role-granularity-v2-demo.mjs` exit 0、`DEMO_PASS=true`、`DEMO_DISPATCHES=role-cards,delivery-storefront,delivery-checkout-api,role-readiness,test-map-shards,integration-e2e`、8 截图；legacy v1 `phase-e-governance-demo.mjs` exit 0、`DEMO_PASS=true`、7 截图。模型为离线脚本桩；真实 Electron/preload/renderer/Interface/门禁/账本/客户通道为真实件。
- **残余观察**：桌面并行 E-1 去重一次偶发（隔离/串行通过）；演示输出根中文路径被治理门禁拒绝（既有 legacy demo 同样复现，ASCII 临时根通过）；v2 demo 首次预置账本行缺 `actorRoleId`/`power` 被 fail-closed，补齐后通过（演示夹具修正）；Provider 限制未证明必须扩参；未验证真实在线模型/凭据/非 Windows/打包。
- **变更包**：`docs/scheduling/role-granularity-parallel-testing-change-v1.md`（候选 29 文件逐文件哈希、改动路径、节点 N1–N8、证据链接、T3、复用/失效说明、残余观察）；本计划只记录，不宣布通过。
- **状态**：Reduce 完成（测试证据）；变更包已写盘；**内置独立验收已判定通过（当前候选），N8 完成、N9 放行**；见 §11.12。

### 11.12 N8 完成与 N9 放行：独立验收结论（2026-10-22）

- **验收角色**：ANS 内置独立验收（`references/acceptance-role.md`；非项目 `角色卡/独立验收` worker）。
- **验收报告**：`docs/acceptance/role-granularity-parallel-testing-report-v1.md`；`git hash-object` = `34f5931273ac7fe384e70297a4159dfc2144f4d1`；SHA-256 = `07fc5f886c1e334328d0d6c9d7269a2472b2b497739e908bf64f69012567dff5`；280 行。
- **结论**：**通过（当前候选）**。P1–P14 全部适用行 pass、G1–G2 pass；无 fail、无 insufficient evidence、无整行 not applicable。
- **候选匹配**：报告记录的候选 = 29 个产品/测试文件（`hashes.tsv` blob `aacf6fd2…` / SHA-256 `3f18309a…`）；验收逐文件复算 29/29、mismatches=0；HEAD `64ed44a` 未变；`git diff --cached` 空；变更包 blob `4191fb44…` / SHA-256 `95a2da33…` 与判定一致。
- **关键证据（报告摘要）**：T3 全量并行+串行 3528/3501/9/18（9 项均 N3 基线 Windows symlink EPERM，零新增确定性失败）；canonical e2e 99/99；真实 Electron `E2E_PASS=true`（17 截图）；v2 demo `DEMO_PASS=true`（8 截图）；legacy v1 demo `DEMO_PASS=true`（7 截图）；typecheck/typecheck:renderer/build:renderer 均 0；6 个 Map 分片+共享只读夹具 pin+Reduce manifest 已核对；P1–P14/G1–G2 逐行核对。
- **残余观察（报告 §五 已列，不构成 fail）**：桌面并行 E-1 去重一次偶发（隔离/串行通过）；演示输出根中文路径被治理门禁拒绝（既有 legacy demo 同样复现，ASCII 临时根通过）；v2 demo 首次预置账本行缺 `actorRoleId`/`power`（演示夹具修正，未改产品）；Provider 工具未扩参；真实在线模型/凭据、非 Windows 平台、打包未验证。
- **方案措辞澄清（报告 §5.1，记录不追溯改报告）**：方案 §5.4.1 V12 行写「existing 也必须覆盖，不覆盖退回」，§9.1/§5.5/P9 写「existing 只 warning」；实现与验收按更具体的 §9.1/§5.5/P9（existing warning、new/changed 阻塞）判定 P3 pass。该冲突不是候选产品缺陷；建议策划在下一版本统一 V12 行与 §9.1/P9 的表述；本次不改标准/报告，不追溯改结论，受影响证据无需重跑。若沟通/统筹认为必须按 V12 行严格执行 existing 阻塞，应按标准 §3.5 走澄清/新版本判定，而不是追溯改变本报告。
- **N8**：完成（独立验收报告匹配当前候选）。
- **N9 放行**：按匹配当前候选的通过结论记录完成并释放依赖；任务在调度记录层面完成。
- **边界（必须保留）**：验收通过只表示当前候选（29 文件、HEAD `64ed44a`、T3）满足标准 v1，**不授权提交、推送、合并、发布、部署或任何对外操作**；候选任一产品/测试/角色卡/边界文件变化会使结论失效，需按标准 §3.3 重判；变更包保持提交时快照，不因验收结论改写。
