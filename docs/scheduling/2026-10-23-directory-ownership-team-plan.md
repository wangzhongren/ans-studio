# 团队计划：目录级授权与目录规范（directory-ownership）

- **任务 ID**：`2026-10-23-directory-ownership`
- **产品 flowId**：`directory-ownership`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）
- **日期**：2026-10-23
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0 记录**：[`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`](../communication/2026-10-23_intent_i18n-and-directory-ownership.md)（已确认，2026-10-23）
- **闸门 1 记录**：同上文件「闸门 1 确认记录」（客户明确选择「都确认，按推荐」，2026-10-23）
- **客户确认的策划方案版本**：[`docs/planning/2026-10-23_design_directory-ownership.md`](../planning/2026-10-23_design_directory-ownership.md) v1（2026-10-23）；确认范围含 §13 Q1–Q12 的推荐 A
- **风险档位**：**T3（治理/权限/流程设计变更）**
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目没有 `.ans/project.json` 任务配置（仅有 `.ans/sessions/`）；本计划不伪造任务令牌、审批、锁或机器预检记录。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（角色指派/写集/顺序/验收安排）**；客户另行给出实施授权前不派发。本变更与「国际化（i18n）」变更分别闸门、分别实施、分别验收，不合并。

---

## 一、任务与基线

### 1.1 目标

按客户在闸门 0/1 已确认的意图与策划方案 v1，实施目录级授权变更：

1. **团队计划 schema v3**：v2 + `授权目录` 列 + `目录规范`表；每个目录唯一 owner、用途、命名、允许子目录/文件类型、契约、测试面、依赖、禁写区、共享边界；角色表保留 `精确写集` 用于治理关键/单例文件；v1/v2 计划保持原行为，不强制迁移。
2. **目录条目模型**：目录是授权单位；执行角色可在目录规范允许的范围内自行创建文件/子目录；不能跨目录、不能改规范、不能写他人目录。
3. **确定性校验 + readiness 语义复核**：应用校验目录覆盖、owner 唯一、互不重叠、规范存在、路径逃逸、治理关键路径精确授权（V-D1–D9）；Convener readiness 复核目录是否内聚、规范是否合理；验收核对**实际布局**是否符合规范（改动路径 → 目录 → 规则）。
4. **与边界 Section 1 对齐（V12 扩展）**：计划的目录必须被该角色 `boundary.yaml` 的目录条目覆盖；`new` 角色在 v3 下边界目录应与计划目录一致（角色根工作文档除外）；`changed`/`existing` 的计划目录必须被边界覆盖，边界更宽部分只能落在该角色模块实现目录/既有职责内（越出 warning + readiness），不强制重写历史边界。
5. **运行时策略 A（客户已确认）**：本轮不重写会话/任务 scope 模型；运行期仍由角色边界（目录条目）拦截越界写，计划目录的更细约束由任务文本 + readiness + 验收的实际布局核对保证。若客户改选任务级 `writeDirs`（策略 B），另开设计，不在本计划。
6. **同步面**：Convener/Crew/Verifier 卡文本、`run-role.ts` 卡前守卫、`govern-session.ts` 提示、桌面团队计划解析/V12/任务文案、运行时 `GovernanceJudgeFacts` 可选字段、测试与验收文档同步。
7. **兼容与迁移**：旧 v1/v2 计划、旧 flow、旧角色卡继续可读；不一次性重写历史边界；本仓库现有角色不在本轮强制迁移。
8. **独立验收**：T3 适用全量回归 + 治理/共享抽象检查；本变更单独 `docs/acceptance/` 标准与报告，不与 i18n 变更合并判定。

### 1.2 风险档位：T3

依据技能 `references/testing.md`「Risk-Based Verification and Change Packages」：本变更改变团队计划的写集语义与授权模型（目录条目、目录规范、边界对齐、实际布局验收），属于治理/权限变更，即使部分改动只涉及文档/卡文本也不能压成 T0/T1/T2。

**T3 默认验证**：适用的全量回归（`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`）+ 治理/共享抽象检查 + 真实启动/演示；若某项无代码面，报告写 N/A + 理由。不得以「只改卡文本/文档」为由降档。

**升档/重开条件**：
- 实施中决定把计划目录做成运行期任务级硬拦（策略 B，改 `TaskScope`/F4/session/dispatch），必须停止并另开设计，重开闸门 1/2；本计划拒绝在该方向上自行扩大。
- 实施中发现需要改动 `src/common/shared/` 属主、角色边界、治理关键路径清单之外的新路径，或新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`，停止并回报统筹。
- 客户要求立即迁移本仓库全部历史角色边界到 v3：超出本轮非目标，需单独的迁移计划与闸门 2。

### 1.3 本轮非目标（不得顺手扩大）

- 不一次迁移/重写所有历史角色边界、旧 v2 团队计划、旧 flow、旧角色卡。
- 不用目录级授权放宽治理关键路径（角色卡/边界、release/packaging、`.ans`、shared、密钥相关）；这些继续精确授权。
- 不把 i18n 与目录授权合并成一个改动。
- 不新增 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`、artifact kind。
- 不改变派发权归属、客户入口、角色 id/显示名/路径、工程基线文本（`ENGINEERING_QUALITY_BASELINE`）。
- 默认不改 `src/model/{boundary,role,decision}.ts`、`src/service/gate/resolve-write.ts`、`TaskScope`/F4、`src/provider/runtime/{tools,schema}.ts`；任务级硬拦（策略 B）另开设计。
- 不新增固定测试角色；不改变本仓库工作团队结构。
- 不删除/重写历史管理记录；不改 v1.6.0 发布配方/冻结源。
- 不提交、不推送、不合并、不发布。

### 1.4 基线（写计划时实测，2026-10-23）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `main` / `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树（写计划前） | `M docs/communication/memo.md`、`M docs/planning/memo.md`；未跟踪：`.claude/`、`demos/`、本轮意图记录与两份方案；本计划写盘后新增未跟踪 `docs/scheduling/2026-10-23-directory-ownership-team-plan.md`。以上均非产品代码改动 |
| 已跟踪代码/测试改动 | 无 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二条机器状态 |
| Node 环境 | `package.json` engines：`node >=23.6`；当前 shell PATH 未包含 Node；实施前按既有记录加入 PATH 并以实测版本为准（上轮实测 Node v24.22.1 / npm 11.19.1） |
| 测试脚本 | 仓库使用 `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 为既有命令；本计划不新增 runner/配置 |
| 现有 v2 基线 | `src/common/编排/team-plan.ts` 提供 v2 单一解析/校验（V1–V11）；`run-role.ts` 卡前守卫消费；`app/desktop/interface.ts` 经 pipeline 公共出口消费 v2 解析并做 V12；`governance-advance.ts` 多处按 `teamPlanSchema === 2` 分支；`GovernanceJudgeFacts.teamPlanSchema?: 1 \| 2` |
| 现有边界 | 边界引擎已支持 `file`/`directory`/`conditional-directory`；`resolveWrite` 对目录条目下任意路径放行；`TaskScope.writeSet` 是精确匹配；桌面派发以 `scope: undefined` 开目标会话（授权上界 = 角色边界） |
| 测试冻结面 | `test/编排/team-plan.test.ts`、`test/测试/governance-e2e-auto/p-team-plan-guard.test.ts`/`fixture.ts`/`i-full-chain.test.ts`/`q-role-granularity.test.ts`/`r-mapreduce-parallel.test.ts`、`test/桌面应用/interface.test.ts`、`test/门禁引擎/governance-trio.test.ts`/`governance-standard-workflow.test.ts` 等冻结 v2 计划结构/卡文本/任务文案 |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md` |
| 闸门 1：方案确认 | **已确认（2026-10-23，客户选择「都确认，按推荐」）** | 同上「闸门 1 确认记录」；对象为目录授权方案 v1 |
| 闸门 2：角色指派/写集确认 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开记录；未给前不派发、不改代码 |
| 实施前验收标准 | 未写盘 | 由内置独立验收在闸门 2 后、实施前写 `docs/acceptance/directory-ownership-criteria-v1.md`；沟通确认其路径/版本 |

### 2.1 实施授权与闸门 2 是两个事实

- 闸门 2 确认的是**参与角色、各自范围和写集、是否有角色/边界变更、档位、阶段顺序、验收安排、证据口径**；实施授权是对代码实施的授权。两者分开记录，不能互相替代。
- 客户在闸门 1 的「按推荐」确认**不等于**闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到闸门 2 确认 + 实施授权齐备 + 实施前验收标准写盘并经沟通确认 + 逐角色范围预留完成。

### 2.2 方案文件状态头的已知不一致（不阻塞，但须记录）

策划文件头与 §2.1 表格仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，而沟通的闸门 1 确认记录已明确客户选择「都确认，按推荐」。本计划以 `docs/communication/` 的确认记录为授权事实，不改写策划文件；实施角色按方案正文的符号名与实际代码为准。

### 2.3 客户在闸门 1 已确认的默认项（本计划据此排期）

| 方案问题 | 确认结果（推荐 A） |
| --- | --- |
| Q1 规范格式/位置 | 团队计划内 Markdown 表；frontmatter `directories` 强制；不新增权威规范文件 |
| Q2 子目录 | 允许在 `允许子目录` 声明的范围内（`—`/显式列表/`*` 一层/`**` 任意层）；超出即失败 |
| Q3 共享目录 | 单 owner 默认；大型共享树用 `shared: split` 显式子目录 owner；不允许共写 |
| Q4 迁移范围 | 新流程 v3；旧 v2/v1 不强制；下一次实质变更时迁移；不设硬截止 |
| Q5 运行期强制力 | **策略 A**：边界目录硬拦 + 任务文本 + 布局核对；`new` 边界与计划一致；`changed`/`existing` 计划 ⊆ 边界，更宽限于模块实现目录/既有职责；不做任务级 `writeDirs` |
| Q6 治理关键路径 | 按方案 §5.5 清单继续精确授权；`src/model/` 不整体目录授权；`docs/verification/` 归测试/验收专用 |
| Q7 文件例外 | 允许 `精确写集` 例外，但必须写 `粒度理由`；不覆盖治理关键路径既有归属 |
| Q8 命名/文件类型 | 代码/测试目录 ASCII kebab-case；扩展名按类型；角色根文档目录（中文）不在计划目录内 |
| Q9 模块实现目录 | 模块清单新增 `实现目录`；角色目录必须在其下 |
| Q10 规范变更 | 只有 Convener 能改计划/规范；新计划版本 + readiness 重跑；角色/范围实质变化重开闸门 2 |
| Q11 空目录 | 规范可先于目录存在；首次写入时创建；边界目录条目不要求目录已存在 |
| Q12 布局核对 | 测试角色/验收脚本用纯函数核对；Verifier 读报告 + 原始证据 |

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 这是产品治理行为的变化，横跨既有分层：团队计划解析/校验/布局核对归编排（既有权责）、卡文本归门禁引擎、桌面解析/V12/任务文案归桌面窗口、Model 类型归运行时核心、跨角色 e2e/回归归测试。没有产生需要不同知识与契约的独立角色。产品内部的「目录 owner」是目标项目角色模型，不是本仓库新增工作角色 |
| 2. 范围归属 | **现有 Section 1 精确覆盖；无默认缺口** | 方案 §9.1/§9.2 的路径逐个映射到现有 Section 1（见 §四）。`src/common/编排/directory-conformance.ts` 与 `test/编排/directory-conformance.test.ts` 是已授权目录内新文件；`test/桌面应用/` 是逐文件授权，本计划默认不新建该目录文件 |
| 3. 契约影响 | **有，跨角色共享契约与治理规则变更** | 团队计划 v3 frontmatter/角色表/目录规范表、V-D1–D9、V12 扩展、`TeamPlanParseResult.teamPlanSchema: 1\|2\|3`、桌面 `TeamPlanInfo`、`GovernanceJudgeFacts` 可选字段、Convener/Crew/Verifier 卡文本、桌面任务文案。单一主属：解析/校验/布局核对 → 编排；卡文本/注册表数据 → 门禁引擎；桌面消费/V12/任务文案 → 桌面窗口；Model 类型 → 运行时核心；跨角色 e2e → 测试。v3 合同必须由编排先冻结，桌面再消费 |
| 4. 证据独立性 | **已满足** | 各开发角色跑自己的单元/层测试；测试角色独立跑跨角色 e2e、完整链路、布局核对与 T3 全量回归，并产出真实启动/演示证据；内置独立验收按实施前标准判定。实施者不自验，调度不改验收结论 |
| 5. 协调成本 | **维持现有团队最低** | 5 个现有 worker（编排、门禁引擎、运行时核心、桌面窗口、测试；桌面UI 可选默认 N/A；项目管理可选文档）+ 内置独立验收 + 统筹。新增「目录授权」专职角色会增加建卡、边界、交接与证据成本，而本轮没有产生新的持续独立责任；不新增角色 |

### 3.2 决策表结果

**不变，派给现有角色。**

- 无新增、无拆分、无合并、无角色卡改动。
- `src/common/编排/team-plan.ts` 的 v3 扩展、`directory-conformance.ts` 新文件、`test/编排/*` 新测试均在既有目录授权内。
- **条件项（不是默认）**：
  - 若实施确实需要新建 `test/桌面应用/<新文件名>.test.ts`：该目录对桌面窗口是**逐文件授权**，触发**改边界**，须由 ANS 人事按本计划与闸门 2 的额外确认补精确单文件条目；本计划默认**不新建**该目录文件，把新断言并入 `interface.test.ts` 等既有精确文件。
  - 桌面UI 的目录/规范提示默认 **N/A**（不做）。若客户要求展示目录规范且现有 `governance-view.ts`/`role-view.ts` 不足以承载，需在闸门 2 明确；并排在 i18n B1/B2 之后，使用已建立的 i18n key，避免同一文件并发写与中文硬编码回潮。
  - 项目管理若需在工程法案登记 v3 规则，只写其自身 `角色卡/项目管理/docs/`；不改 `ENGINEERING_QUALITY_BASELINE` 与既有法案文本。
- 产品运行期 Convener 写 `docs/scheduling/<flowId>-team-vN.md`、测试角色写 `docs/verification/` 是**产品行为/目标项目行为**，不是本仓库 worker 写集；本仓库执行时测试证据写 `角色卡/测试/docs/`，不扩张写权。
- **本仓库现有角色不在本轮迁移到 v3**：本计划只实施产品能力；不对现有 `角色卡/**` 做目录级重写（人事默认不参与）。

### 3.3 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有 5 个 worker（编排、门禁引擎、运行时核心、桌面窗口、测试）+ 内置验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；解析/卡文本/桌面/测试分离；协调成本最低 |
| B. 新增「目录授权/团队计划 v3」专职角色 | 否决 | 一次性跨层治理变更，不构成持续独立责任；现有 owner 已覆盖；新增角色触发人事写卡与额外闸门 |
| C. 把编排拆成「团队计划解析」与「flow/门禁」两个角色 | 否决 | 无过载证据；`team-plan.ts` 与 `run-role.ts`、`governance-gate.ts`、`govern-session.ts` 高度耦合；拆分会增加交接与证据成本 |
| D. 由一个角色包办全部实现 | 否决 | 跨越编排、门禁引擎、运行时核心、桌面窗口、测试的 Section 1；违反单一属主与写权限 |
| E. 用现有 `角色卡/独立验收` worker 判定本任务 | 否决 | 其 Section 1 仅覆盖 `角色卡/独立验收/docs/`，不含 `docs/acceptance/`；沿用既有决定，使用内置独立验收 |
| F. 任务级 `writeDirs` 硬拦（策略 B） | 否决（本轮） | 需改 `TaskScope`/session/dispatch/model，超出 T3 方案范围；客户已确认策略 A；若改 B 另开设计 |
| G. 双团队计划解析器（run-role + interface 各一份） | 否决 | 现有 v2 已确定单一解析器经 pipeline 公共出口；v3 必须沿用，避免「卡前通过、写卡后拒绝」或反之 |
| H. 立即迁移本仓库全部角色到 v3 | 否决（按 Q4 A） | 工作量与闸门成本大；不一次性重写历史边界 |
| I. 桌面UI 做目录规范展示 | 默认否决（可选/条件） | 桌面已通过 `TeamPlanInfo` 读取计划；规范展示不是本变更验收必需；避免与 i18n 写集冲突 |

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-10-23 核对）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本；下表依据实际 Section 1。未列路径默认只读。新增文件位于已接受目录内时不重写边界；新增目录/改动归属/增删逐条路径才交人事。

| 方案 §9.1/§9.2 路径 | 所属角色 | Section 1 依据（boundary.md） | 本任务写入 |
| --- | --- | --- | --- |
| `src/common/编排/team-plan.ts` | 编排 | `角色卡/编排/boundary.md`「目录（私有）`src/common/编排/` / 本角色私有辅助代码」 | 是 |
| `src/common/编排/directory-conformance.ts`（新增） | 编排 | 同上「目录（私有）`src/common/编排/`」 | 是（推荐新文件） |
| `src/pipeline/orchestration/run-role.ts` | 编排 | 「单文件 `src/pipeline/orchestration/run-role.ts` / 普通角色会话的编排」 | 是 |
| `src/pipeline/orchestration/govern-session.ts` | 编排 | 「单文件 `src/pipeline/orchestration/govern-session.ts` / 治理 bootstrap 会话的编排」 | 是 |
| `test/编排/team-plan.test.ts`、`test/编排/directory-conformance.test.ts`（新增）及受影响 `test/编排/**` | 编排 | 「目录（测试）`test/编排/` / 本角色的单元与层契约测试及夹具」 | 是 |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 | `角色卡/门禁引擎/boundary.md`「目录（私有）`src/common/门禁引擎/` / 本角色私有辅助代码」 | 是（仅卡文本数据；entries/forbidden/preauthorized/工程基线不变） |
| `test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts` 及必要新增负例 | 门禁引擎 | 「目录（测试）`test/门禁引擎/` / 本角色的单元与层契约测试及夹具」 | 是 |
| `src/model/runtime.ts` | **运行时核心** | `角色卡/运行时核心/boundary.md`「单文件 `src/model/runtime.ts` / 中立运行时类型与能力契约」 | **条件（推荐）**：`GovernanceJudgeFacts.teamPlanSchema?: 1 \| 2 \| 3`、可选 `teamPlanDirectories?: string[]`；不新增 artifact kind/枚举 |
| `test/runtime-core/` 受影响测试 | 运行时核心 | 「目录 `test/runtime-core/` / 本角色单元测试与契约夹具」 | 条件（仅当 Model 类型变化） |
| `app/desktop/interface.ts` | 桌面窗口 | `角色卡/桌面窗口/boundary.md`「目录 `app/desktop/` / 桌面 Interface（主进程侧纯逻辑）」 | 是（v3 `TeamPlanInfo`/`parseTeamPlanInfo`/V12 扩展） |
| `app/desktop/governance-advance.ts` | 桌面窗口 | 同上「目录 `app/desktop/`」 | 是（Crew/readiness/验收任务文案 v3；`teamPlanSchema` 类型 1\|2\|3） |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/interface.test.ts` / 主进程侧测试：Interface 处理器」 | 是 |
| `test/桌面应用/operator-wiring.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/operator-wiring.test.ts`」 | 条件（仅当任务文案/验收提示断言受影响） |
| `test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/runtime-resolution.test.ts` | 桌面窗口 | **未在 `boundary.md` Section 1 覆盖**（只出现在 `boundary.yaml`，属 Markdown/YAML 漂移） | **否（边界缺口）**；默认不改、不派发；见 §4.5，交人事/闸门 2 校正 |
| `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts`、`fixture.ts`、`i-full-chain.test.ts`、`q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts`；新增 `test/测试/directory-layout.test.ts`（或并入现有 e2e）；`real-entry.test.ts`（如快照语义受影响） | 测试 | `角色卡/测试/boundary.md`「目录（测试）`test/测试/` / 跨角色联调、完整流程与回归用例」 | 是 |
| `app/renderer/src/chat/governance-view.ts`、`role-view.ts`；`test/桌面UI/**` | 桌面UI | `角色卡/桌面UI/boundary.md`「目录 `app/renderer/`」「目录 `test/桌面UI/`」 | **可选，默认 N/A**（见 §3.2；若做，排在 i18n B1/B2 之后并使用 i18n key） |
| `角色卡/项目管理/docs/project-rules.md`、`docs/architecture/**` | 项目管理 | `角色卡/项目管理/boundary.md`「单文件 `角色卡/项目管理/docs/project-rules.md`」「目录 `角色卡/项目管理/docs/architecture/`」 | 可选（登记 v3 规则；不改工程基线文本；不作为产品候选验收项） |
| `docs/acceptance/`（标准、报告） | 独立验收（内置） | 技能 `references/acceptance-role.md` 默认写权 | 是（不派 worker） |
| `docs/scheduling/`（本计划、变更包） | 统筹（内置） | 技能 `references/scheduler.md` 默认写权 | 是（不派 worker） |

### 4.2 共享属主核对（不猜）

- `src/common/编排/team-plan.ts`：**编排私有 common**；v2 单一解析器已在此。v3 必须继续单一实现，桌面**只经** `src/pipeline/orchestration/run-role.ts` 公共出口消费；不保留第二份解析。
- `src/common/门禁引擎/governance-roles.ts`：门禁引擎私有目录；本轮只改 `CONVENER_CARD_TEXT`/`NOMINATOR_CARD_TEXT`/`VERIFIER_CARD_TEXT` 数据文本；`BUILT_IN_GOVERNANCE_ROLES` 的 entries/forbidden/preauthorized、能力位、内部 id/显示名、`ENGINEERING_QUALITY_BASELINE` 零变化。
- `src/model/runtime.ts`：**运行时核心唯一主属**。本变更如扩展 `GovernanceJudgeFacts`，只加**可选**字段/字面量，不新增 artifact kind/枚举；改动会使所有引用方既有证据失效，故先于桌面消费冻结。
- `src/model/{boundary,role,decision}.ts`、`src/service/gate/resolve-write.ts`、`src/provider/runtime/{tools,schema}.ts`：**默认不改**（门禁引擎/运行时核心边界内，但方案明确不做）；任务级硬拦（策略 B）另开设计。
- `app/desktop/`：桌面窗口；`app/renderer/`：桌面UI；`test/桌面应用/` 逐文件授权；`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/测试/`、`test/桌面UI/` 各自目录授权，互不重叠。
- `src/common/shared/`：项目管理唯一写入；本变更**不改**（布局核对复用 `path-primitives` 只读导入）。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。v3 schema/解析器由编排先冻结，门禁/运行时/桌面再消费。

#### 编排（D4 核心；契约先行）

- **写集**：
  - `src/common/编排/team-plan.ts`：新增 `TEAM_PLAN_SCHEMA_V3 = 3`；`DirectorySpec`/目录规范表解析；角色表 `授权目录`/`精确写集` 列（`唯一写集` 作为 v3 兼容别名带 warning；`边界` 别名不再接受）；frontmatter `directories`；V-D1–D9；V12 结果所需的结构化输出；v1/v2 分支**逐字保留**。
  - 新增 `src/common/编排/directory-conformance.ts`：改动路径 → 目录规范核对纯函数（`DirectorySpec`/`LayoutCheckInput`/`LayoutCheckRow`）；复用 `src/common/shared/path-primitives.ts` 与 `resolveWrite` 口径，不另写第二份路径逻辑；不读 git/不写报告。
  - `src/pipeline/orchestration/run-role.ts`：`teamPlanRoleRowIssues`/`validateConvenerAppointmentCard` 支持 schema 3（返回 `teamPlanSchema: 1\|2\|3`）；卡前守卫跑 V-D1–D9；V11（flow-plan 一致性）不变；经此公共出口再导出 v3 类型/函数（`DirectorySpec`、`parseTeamPlan`、`teamPlanIssueMessages`、`writesetsOverlap` 等）。
  - `src/pipeline/orchestration/govern-session.ts`：`STANDARD_WORKFLOW_PROMPT`、Convener/Crew 提示同步 v3 写法/目录规范/布局核对/治理关键路径；v2 兼容说明。
  - `test/编排/team-plan.test.ts`（更新）、新增 `test/编排/directory-conformance.test.ts`；必要的 v3 正/负例与 legacy 夹具。
  - 自身文档：`角色卡/编排/docs/change/2026-10-23_change_directory-ownership.md`、`api-spec.md`、`memo.md`（按需）。
- **不写**：`src/common/门禁引擎/`、`src/model/**`、`app/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面应用/`、`test/测试/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：`TeamPlanParseResult.teamPlanSchema: 1|2|3`；`DirectorySpec`/`LayoutCheckRow` 类型；V-D 问题码/severity（error/warning/exception-review）；v2 行为逐字不变；旧 v1/v2 计划不强制迁移。
- **测试面**：`test/编排/`。
- **可观察交付**：v3 正例（frontmatter/模块清单/角色表/目录规范齐全、owner 唯一、目录不重叠、边界覆盖、依赖 DAG 无环）；负例（缺规范、重复目录、多 owner、目录重叠/嵌套未拆分、治理路径目录、整层名无理由、路径逃逸、`shared: split` 违规、`new` 边界比计划宽）；v1/v2 legacy 夹具逐字通过；布局核对正/负例（类型/子目录/命名/禁写区/删除重命名）；`node --test "test/编排/**/*.test.ts"` + `npm run typecheck` 原始输出；候选哈希。

#### 门禁引擎（D4，与编排并行）

- **写集**：
  - `src/common/门禁引擎/governance-roles.ts`：`CONVENER_CARD_TEXT`（写 v3 计划：frontmatter `directories`、模块清单 `实现目录`、角色表 `授权目录`/`精确写集`、目录规范表、共享策略、治理关键路径、readiness 目录列）；`NOMINATOR_CARD_TEXT`（Crew 按计划目录写边界：目录条目 + 精确文件；`new` 与实际布局；不改规范/不跨目录）；`VERIFIER_CARD_TEXT`（核对布局报告 + 原始证据；不把结构通过当语义正确）。
  - **不改** `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized、`ENGINEERING_QUALITY_BASELINE`、内部 id/显示名、导出函数签名、枚举值。
  - `test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts` 及必要新增负例（卡文本断言按真实变化更新，不放宽）。
  - 自身文档。
- **不写**：`src/model/**`（三个共享类型属本角色但本轮不改）、`src/common/编排/`、`app/`、`test/编排/`、`test/测试/`、`test/桌面应用/`、`docs/scheduling/`、`docs/acceptance/`。
- **公开契约**：卡文本/流程提示（产品数据）；不改写权、不新增 cardKind、不改注册表 entries/forbidden/preauthorized。
- **测试面**：`test/门禁引擎/`。
- **可观察交付**：三张卡文本 diff（至少 Convener/Crew；Verifier 必须同步）；注册表 entries/forbidden/preauthorized 未变；写权正/负例；`node --test "test/门禁引擎/**/*.test.ts"`；`npm run typecheck`；候选哈希。

#### 运行时核心（D4，条件/推荐：Model 类型同步）

- **触发**：桌面 `interface.ts` 继续把 `teamPlanSchema` 传入 judge facts（现状如此）。v3 后该值可为 3；若 `GovernanceJudgeFacts.teamPlanSchema` 仍是 `1|2`，TypeScript 会拒绝或桌面必须丢弃 v3 信息。**推荐扩展为 `1|2|3`**，可选增加有界 `teamPlanDirectories?: string[]`。
- **写集（仅触发时）**：`src/model/runtime.ts`（仅 `GovernanceJudgeFacts` 可选字段/字面量；不新增 artifact kind/枚举/协议字段）；`test/runtime-core/` 受影响测试（如 `governance-flow-metadata.test.ts`/`governance-judge.test.ts` 有类型/事实断言时）；自身文档。
- **不写**：`src/provider/runtime/{tools,schema}.ts`（默认不改）、`src/service/runtime/session.ts`、其他角色目录、`app/`、`test/桌面应用/`、`test/测试/`。
- **公开契约**：`GovernanceJudgeFacts` 可选字段；旧消费者不填不读；缺失不得假定 v3。
- **测试面**：`test/runtime-core/`。
- **可观察交付**：类型 diff；旧字段/枚举值不变；`node --test "test/runtime-core/**/*.test.ts"`；`npm run typecheck`；候选哈希。若实施判断无需改动（例如桌面显式映射 3→v2 且 judge 不需要 v3 信息），报告 N/A + 理由，不写文件。

#### 桌面窗口（D5，依赖编排公共出口）

- **写集**：
  - `app/desktop/interface.ts`：`TeamPlanRoleRow`/`TeamPlanInfo` v3（`授权目录`/`精确写集`/目录规范/`实现目录`）；`parseTeamPlanInfo` 支持 `teamPlanSchema: 3`，经 pipeline 公共出口消费（不复制 v3 解析）；`validateAppointmentArtifacts` 的 V12 扩展：计划目录被边界目录覆盖、`new` 边界目录与计划一致（角色根工作文档除外）、`changed`/`existing` 计划 ⊆ 边界（更宽部分越出模块实现目录/职责 → warning + readiness；existing 只 warning + 迁移提示）；精确文件被 file/dir 覆盖；来源分流（Crew 文件问题 vs 计划问题）。
  - `app/desktop/governance-advance.ts`：`buildGovernanceAdvanceMessage`/`buildAppointmentWriteMessage`/`buildRoleReadinessTaskMessage`/`buildAcceptanceTaskMessage`/`buildAcceptanceCriteriaTaskMessage` 等任务文案同步 v3（授权目录/目录规范/布局核对/共享/`new` vs existing 规则）；`teamPlanSchema` 选项类型 `1|2|3`；legacy v2 文案保留。
  - `test/桌面应用/interface.test.ts`（v3 解析/V12/来源分流/legacy warning）；`operator-wiring.test.ts`（条件）。`acceptance-dispatch.test.ts`/`runtime-resolution.test.ts` **不在授权范围**（见 §4.5），不得写入。
  - 自身文档。
- **硬约束**：**不得在 `test/桌面应用/` 新建文件**（该目录对本角色是逐文件授权，不是目录授权）。新断言并入上述既有精确文件。确需新文件时停止并回报统筹，交 ANS 人事按闸门 2 额外确认补精确单文件条目，不默认派发。
- **不写**：`app/renderer/**`（桌面UI）、`app/main.ts`、`app/preload.cjs`、`src/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、`test/测试/`、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面UI/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：桌面团队计划读取/写卡校验结果（问题列表/来源分流）；任务文案；不改 IPC 通道/客户入口/派发权。
- **测试面**：`test/桌面应用/interface.test.ts`（+ 条件精确文件）。
- **可观察交付**：`parseTeamPlanInfo` v3/legacy 正负例；V12 覆盖/一致性/来源分流；`new` 宽边界阻塞、`changed`/`existing` 只 warning；v2 计划行为不变；任务文案含目录/规范/布局；`node --test` 精确文件 + `npm run typecheck`；候选哈希。

#### 桌面UI（可选，默认 N/A）

- **写集（仅客户明确要求时）**：`app/renderer/src/chat/governance-view.ts`、`role-view.ts` 的目录/规范提示；`test/桌面UI/` 相关测试；自身文档。
- **排序**：必须排在 i18n B1/B2 之后，使用已建立的 `ui.*` key；不得让中文硬编码回潮；不得与 i18n 共享文件并发写。
- **默认**：报告 N/A + 理由，不改文件；不因「界面也可以显示」而自行扩大范围。

#### 测试（D6/D7：跨角色 e2e、布局核对、T3 全量回归、真实演示）

- **写集**：`test/测试/`（目录）。至少覆盖方案 §9.2：
  - `governance-e2e-auto/p-team-plan-guard.test.ts`（v3 负例：缺规范、重复目录、多 owner、目录重叠、治理路径目录、整层名、路径逃逸、`shared: split` 违规；v2 夹具保持）；
  - `governance-e2e-auto/fixture.ts`（`teamPlanDoc` v3 生成器 + v1/v2 保留）；
  - `governance-e2e-auto/i-full-chain.test.ts`（v3 完整链路：计划 → appointment → Crew 写卡/目录边界 → readiness → Map 目录内新建文件/子目录 → 布局核对 pass → 变更包 → Verifier；至少一条 v2 链路保持通过）；
  - `governance-e2e-auto/q-role-granularity.test.ts`/`r-mapreduce-parallel.test.ts`（v3 目录/共享/布局；Map/Reduce 不变）；
  - 新增 `test/测试/directory-layout.test.ts`（或并入现有 e2e）：临时项目根 + 两角色；目录内新增文件通过；跨目录/他人目录/禁写区/命名不符/子目录越界失败；布局核对报告可复算；
  - `real-entry.test.ts` 仅在新增调度记录导致其快照语义失效时更新（保持「演示不产生新记录/不改写既有记录」的快照语义，不放宽为永远通过）；
  - 受影响 `governance-trio-verify/*`、`governance-judge-cards-verify/*`、`governance-liaison-verify/*`（仅当卡文本/任务文案断言变化）；
  - 自身文档与证据：`角色卡/测试/docs/change/2026-10-23_change_directory-ownership*.md` 及 `...-evidence/`。
- **不写**：产品源码、其他角色单测、`test/桌面应用/`（不新建、不修改；如需其精确文件变更，由桌面窗口 owner 处理）、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面UI/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **公开契约**：测试命令、布局核对报告、分片/回归证据（本仓库写 `角色卡/测试/docs/`；产品运行期 `docs/verification/<flowId>/manifest.md` 只在临时项目根/目标项目内使用）。
- **可观察交付**：
  - 基线（D3）：实施前 HEAD/工作树的 T3 全量回归原始输出与失败分类（区分既有失败，如 Windows symlink EPERM、桌面并发偶发）。
  - 终验（D7）：v3 完整链路 + legacy v2 链路；布局核对 e2e；T3 适用全量回归；真实启动/演示；候选哈希与 diff/status；复跑说明。
  - 不修改模块代码；失败保留原始日志，交对应 owner 修复；修复后只重跑受影响分片与下游。

#### 项目管理（可选文档，默认不参与）

- 仅在需要把 v3 规则登记进工程法案/架构文档时写 `角色卡/项目管理/docs/project-rules.md`/`docs/architecture/**`；不改 `ENGINEERING_QUALITY_BASELINE` 与既有法案文本；不作为产品候选验收项；无 write set 时不派发。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹默认写区。本任务由统筹写本计划、变更包、任务记录；**不派给任何 worker**。产品运行期 Convener 的团队计划/readiness/变更包也落在此目录，但那是产品行为/测试数据；测试夹具必须使用独立 flowId/临时项目根，不得覆盖本仓库既有调度记录。
- `docs/acceptance/`：内置独立验收默认写区；**不使用**项目 `角色卡/独立验收` worker（其 Section 1 不含 `docs/acceptance/`，且会造成双重验收）。
- `docs/communication/`：沟通角色写区；闸门 2 确认记录由沟通写入。
- `角色卡/**` 的角色卡、边界、YAML、根 changelog：人事维护；本变更默认无角色/边界变更，不派人事。

### 4.5 边界缺口与共享属主

| 事项 | 结论 | 处理 |
| --- | --- | --- |
| `src/common/编排/directory-conformance.ts`（新文件） | **不是边界缺口** | 编排已授权私有目录内新文件；`references/module-boundary.md` 明确已接受目录内新增文件不需要重写边界 |
| `test/编排/directory-conformance.test.ts`、`test/测试/directory-layout.test.ts`（新文件） | **不是边界缺口** | 分别在编排/测试目录授权内 |
| `test/桌面应用/` 新增文件 | **条件性边界缺口** | 桌面窗口该目录是逐文件授权；本计划要求把新断言并入 `interface.test.ts` 等既有精确文件。若确需新文件，交 ANS 人事按本计划与闸门 2 额外确认补精确单文件条目，不默认派发 |
| `test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/runtime-resolution.test.ts` | **Markdown/YAML 漂移（边界缺口）** | 两个文件只出现在 `角色卡/桌面窗口/boundary.yaml`，未出现在权威的 `boundary.md` Section 1。按 `references/module-boundary.md`：Markdown 是唯一维护与授权来源，YAML 只是同步副本；两者不一致须由人事在对应治理产物中修正后该对才被接受。默认**不改、不派发**；若任务文案变化确实需要改它们，先交人事/闸门 2 补精确单文件条目（本变更不顺手改边界） |
| 编排 `boundary.yaml` 中的 `flow-state.ts`/`shell-arming.ts`/`pm-reviewer.ts` 等 YAML-only 条目 | **Markdown/YAML 漂移（与本变更无关）** | 本计划不使用这些路径（V11/flow 不变）；只作为已核事实记录，漂移交人事校正，不在本变更内顺手改 |
| `src/model/runtime.ts` | 非缺口；运行时核心主属 | 仅可选字段扩展；若不做，报告 N/A + 理由；不得把 `src/model/` 整体授权给其他角色 |
| `src/model/{boundary,role,decision}.ts`、`resolve-write.ts`、`provider/runtime/{tools,schema}.ts` | 非缺口；本轮默认不改 | 策略 B（任务级硬拦）另开设计；若实施发现必须改，停止回报、重开闸门 |
| `app/renderer/**`（桌面UI 可选） | 非缺口；默认 N/A | 若做，排在 i18n B1/B2 之后；不得与 i18n 写集并发 |
| `角色卡/项目管理/docs/**`（可选文档） | 非缺口 | 只由项目管理写自身 docs；不改工程基线文本 |
| `docs/verification/` | 不是本仓库 worker 缺口 | 本仓库执行不写它；测试证据写 `角色卡/测试/docs/`；产品 e2e 只在临时项目根内生成 |
| 其他方案 §9.1/§9.2 路径 | 均被现有 Section 1 精确覆盖 | 无缺口 |

### 4.6 工作量与范围预留

工作量按文件与检查项计，不编造工时：

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 编排 | 1 个解析器大改 + 1 个新纯函数模块 + 2 个 pipeline 文件 + 2–3 个测试文件 + 文档 | D4 独占 `src/common/编排/` 列明文件、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`test/编排/` |
| 门禁引擎 | 1 个卡文本/注册表数据文件 + 2–3 个测试文件 + 文档 | D4 独占 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关文件 |
| 运行时核心 | 0–1 个 Model 文件 + 0–1 个测试 + 文档 | D4 条件；独占 `src/model/runtime.ts`、`test/runtime-core/` 相关文件 |
| 桌面窗口 | 2 个产品文件 + 1–3 个精确测试文件 + 文档 | D5 独占 `app/desktop/` 列明文件与既有精确测试文件 |
| 测试 | 约 6–8 个 e2e/验证文件 + 全量回归 + 真实演示 | D6/D7；`test/测试/` 独占；基线 + 终验 |
| 桌面UI | 0（默认）；条件 0–2 个产品文案文件 + 0–2 个测试 + 文档 | 可选；若做，排在 i18n 批次之后 |
| 项目管理 | 0（默认）；条件文档 | 可选；不参与产品验收 |

范围预留规则：每个阶段开始前按角色 `roleId` 与精确路径预留；任何角色不得写其他角色的路径；同一文件同一时间只有一个写入者。v3 解析/类型冻结前，桌面不写 v3 消费代码；`GovernanceJudgeFacts` 类型冻结前，桌面不把 schema 3 传入 judge facts。

### 4.7 与国际化（i18n）变更的共享文件与排序

本变更是「程序计划」中的变更 B（T3）；变更 A 是 i18n（T2，`docs/scheduling/2026-10-23-i18n-team-plan.md`）。两者**独立闸门、独立实施窗口、独立验收**，但共享以下文件：

| 共享文件 | 本变更写入 | i18n 写入 | 排序要求 |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | v3 解析/`TeamPlanInfo`/V12 | B0（preferences IPC）、B3（用户可见文本） | **i18n B0 → 本变更 → i18n B3**；同一文件不并发写 |
| `app/desktop/governance-advance.ts` | Crew/readiness/验收任务文案 | B3（仅用户可见系统行/提示；agent 任务文案不翻译） | **本变更 → i18n B3** |
| `test/桌面应用/interface.test.ts` | v3/V12 断言 | B0、B3 断言 | **i18n B0 → 本变更 → i18n B3** |
| `src/common/门禁引擎/governance-roles.ts` | 卡文本 v3 | 不写（卡文本本轮不翻译） | 无冲突，仅本变更写入 |
| `src/common/shared/**` | 不改 | i18n 唯一写入 | 无冲突 |
| `app/renderer/**`（桌面UI 可选） | 可选目录提示 | B1/B2 文案迁移 | 若本变更做桌面UI，必须排在 i18n B1/B2 之后 |

**推荐顺序（采纳方案 §14.1）**：i18n **B0** → 本变更**全部实施/验收** → i18n **B1/B2/B3/B4** → i18n 集成/验收。
- 本变更在 i18n B0 之后启动，以保证 `app/desktop/interface.ts` 的 preferences 接线先落地、v3 改动叠加在其上；i18n B3 在本变更之后迁移用户可见文本，v3 新增的 agent 任务文案不属于 i18n 用户可见文本，不需要 key 化。
- 若客户要求先做本变更：i18n B0/B1/B2/B3/B4 排在其后；B0 的 preferences 接线叠加在 v3 之上；B3 迁移以 v3 文案为准。两变更仍分别验收。
- **候选隔离**：每个变更在自己的阶段入口记录写集内文件的 `git hash-object`/`sha256sum` 基线；变更包只列相对该基线发生变化的路径；另一变更的既有改动声明为「既有上下文」，不纳入本变更候选，也不得用本变更验收结论为其背书。若客户允许在每变更验收后提交（或使用独立 worktree），可进一步隔离；本计划不自行提交。

---

## 五、阶段、依赖与并行组（Map/Reduce）

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| D1 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、边界变更、档位、顺序、验收安排、证据口径）；客户实施授权记录（分开） | 本计划写盘 |
| D2 | 标准 | 内置独立验收 | `docs/acceptance/directory-ownership-criteria-v1.md`（验收表 P1–P12 不弱化、T3 依据、判定规则、证据计划、版本冻结） | D1 |
| D3 | 基线 | 测试 | 当前 HEAD/工作树的 T3 全量回归基线原始输出与失败分类；环境事实 | D1（可与 D2 并行） |
| D4 | Map A（核心契约） | 编排 + 门禁引擎 + 运行时核心（并行；编排内部先 team-plan 后 run-role） | v3 schema/解析/V-D1–D9/布局核对纯函数/卡前守卫；卡文本 v3；`GovernanceJudgeFacts` 类型（条件）；各自测试/typecheck；v3 契约冻结 | D2 标准经沟通确认 + D3 基线完成；**且 i18n B0 已冻结（若两变更均确认）** |
| D5 | Map B（桌面消费） | 桌面窗口 | `TeamPlanInfo` v3/V12 扩展、任务文案 v3、legacy 兼容；精确测试/typecheck | D4 退出（v3 契约与公共出口稳定） |
| D6 | Map C（测试夹具） | 测试 | v3 夹具/负例/完整链路/布局核对 e2e 写盘；可先对 D4 契约准备，最终对 D5 候选运行 | D4 退出（v3 契约冻结） |
| D7 | Reduce（终验） | 测试 | v3 完整链路 + legacy v2 链路；布局核对 e2e；T3 适用全量回归；真实启动/演示；候选哈希/diff/status | D5 与 D6 完成 |
| D8 | 验收 | 统筹 → 内置独立验收 | 变更包（候选哈希、改动路径、节点、证据链接、T3）→ 验收报告（通过/返工/证据不足） | D7 完成 |
| D9 | 放行 | 统筹 → 沟通 | 按匹配当前候选的结论更新记录、释放依赖、交沟通回报 | D8 通过 |

### 5.2 Map / Reduce 分组

| 组 | 角色 | 模块/上下文 | 进入条件 | 退出条件 |
| --- | --- | --- | --- | --- |
| **map-core** | 编排、门禁引擎、运行时核心（并行） | v3 解析/校验/布局核对；卡文本；Model 可选字段 | D2/D3 完成；i18n B0 冻结（如适用） | v3 契约冻结；V-D1–D9/布局核对/卡前守卫完成；卡文本 v3；Model 类型（或 N/A）；各自测试/typecheck 通过；写集不越界 |
| **map-desktop** | 桌面窗口 | v3 解析消费/V12/任务文案 | map-core 退出 | 桌面 v3/V12/文案完成；legacy v2 行为不变；精确测试/typecheck 通过；写集不越界 |
| **map-e2e** | 测试 | v3 夹具/负例/完整链路/布局核对 e2e | map-core 退出（契约冻结） | e2e 文件写盘；对 D5 候选运行通过；失败分片保留原始日志 |
| **reduce** | 测试 | T3 全量回归、真实启动/演示、证据合并 | map-desktop 与 map-e2e 完成 | 全量回归与基线逐项对照；v3 + legacy 链路通过；布局核对报告可复算；真实演示证据齐全；候选哈希/diff/status 齐全 |

### 5.3 并行与串行

- **必须串行**：D3 → D4（基线先于代码改动）；i18n B0 → D4（若两变更均确认；共享 `interface.ts` 不能并发写）；D4 → D5（v3 契约冻结先于桌面消费）；D5/D6 → D7（终验必须针对合并后的实际候选）；D7 → D8（验收按当前候选判定）。
- **可并行**：
  - D2 与 D3（验收标准与基线回归互不写同一路径）。
  - D4 内：编排（`src/common/编排/` + pipeline）与门禁引擎（`src/common/门禁引擎/`）与运行时核心（`src/model/runtime.ts`）写集不相交；编排内部按「team-plan.ts → run-role.ts」顺序。
  - D5 与 D6 部分并行：测试可在 D4 契约冻结后先写 v3 夹具/e2e（`test/测试/`），但最终运行必须等 D5 候选。
  - D7 内：测试按模块分片并行，但每分片独立临时根/端口/日志/输出目录，不共享可变夹具。
- **不允许**：D4 与 D5 并行写引用 v3 类型的桌面代码；D5 与 i18n B3 并行写 `interface.ts`/`governance-advance.ts`/`interface.test.ts`；D4 与 i18n B0 并行写 `interface.ts`/`interface.test.ts`；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`；任何角色写 `test/桌面应用/` 新文件；任何角色直接 import 编排私有 common 复制 v3 解析。

### 5.4 各阶段入口/出口条件

- **D1 入口**：本计划写盘。**出口**：闸门 2 确认记录 + 实施授权记录齐备；确认记录覆盖本计划版本、参与角色、精确写集、无角色/边界变更（条件项保留）、T3、阶段顺序、验收安排、证据口径。
- **D2 入口**：D1。**出口**：标准含验收表（ID/标准/证据/候选/产出角色/结果/判定）、T3 依据、判定规则（pass/fail/insufficient evidence/not applicable）、证据计划、版本/哈希冻结；沟通确认其路径/版本；未确认不派实施。
- **D3 入口**：D1。**出口**：基线命令、环境、计数、失败清单与分类可复算；确认无产品代码改动（除既有 memo/未跟踪管理文档）；记录 Node/npm、OS/Shell、HEAD/worktree。
- **D4 入口**：D2 标准经沟通确认 + D3 基线完成；若两变更均确认，i18n B0 已冻结（共享文件状态一致）。**出口**：v3 schema/V-D1–D9/布局核对/卡前守卫落地；卡文本 v3；`GovernanceJudgeFacts` 类型（或 N/A + 理由）；v1/v2 行为逐字不变；测试/typecheck 通过；v3 契约冻结；候选哈希/diff/status。
- **D5 入口**：D4 退出。**出口**：`parseTeamPlanInfo` v3/legacy、V12 扩展、来源分流、任务文案完成；v2 行为不变；精确测试/typecheck 通过；候选哈希/diff/status。
- **D6 入口**：D4 退出。**出口**：v3 夹具/负例/完整链路/布局核对 e2e 写盘；对 D5 候选运行通过；失败日志保留。
- **D7 入口**：D5 与 D6 完成。**出口**：v3 完整链路 + legacy v2 链路通过；布局核对 e2e 通过；T3 全量回归完成并与基线逐项对照；真实启动/演示证据存在；候选哈希/diff/status 齐全。
- **D8 入口**：D7 完成。**出口**：变更包完整、候选可复算；独立验收按标准给出通过/返工/证据不足；调度只按匹配当前候选的结论放行。
- **D9 出口**：只表示当前候选满足标准；不授权提交、推送、合并、发布。

---

## 六、证据要求

### 6.1 通用证据（每个实施角色）

1. **写前基线**：目标文件的 `git hash-object` 与 `sha256sum`、`git rev-parse HEAD`、`git status --short`；若与本计划记录不一致，停止并回报统筹。
2. **候选身份**：每个改动文件的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 差异分别记录，不互相误判）；新增文件同。
3. **改动范围**：`git diff --name-only` 与 `git status --short` 必须落在该角色写集内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
4. **原始检查输出**：命令、退出码、环境（Node 版本、OS/Shell）、测试计数（pass/fail/skip/todo）、失败原文；跳过项写明原因。
5. **文档状态**：实现完成但未验收的文档状态如实写 `implemented-unverified`，不写成 `verified`。
6. **禁止**：不提交、不推送、不合并、不发布；不修改断言以保绿；不把计划写成结果；不伪造测试输出。

### 6.2 逐角色检查命令（最低要求）

> 命令按仓库实际脚本与既有 runner；Node 需按基线加入 PATH。Windows 既有失败须用基线对照，不得记为本次新失败。

| 角色 | 受影响检查 | 证据 |
| --- | --- | --- |
| 编排 | `node --test "test/编排/**/*.test.ts"`（至少 `team-plan.test.ts`、`directory-conformance.test.ts`）；`npm run typecheck` | V-D1–D9 正/负矩阵；v1/v2 legacy 夹具；布局核对正/负例；测试计数；候选哈希 |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"`（至少 `governance-trio.test.ts`、`governance-standard-workflow.test.ts`）；`npm run typecheck` | 卡文本 diff；entries/forbidden/preauthorized 未变；写权正/负例；测试计数；候选哈希 |
| 运行时核心（条件） | `node --test "test/runtime-core/**/*.test.ts"`（受影响契约测试）；`npm run typecheck` | Model 可选字段 diff；旧字段/枚举不变；测试计数；候选哈希；或 N/A + 理由 |
| 桌面窗口 | `node --test test/桌面应用/interface.test.ts`（+ 条件 `operator-wiring.test.ts`）；可按需只读跑 `test/桌面应用/` 目录；`npm run typecheck` | v3 解析/legacy warning；V12 覆盖/一致性/来源分流；任务文案；测试计数；候选哈希 |
| 测试 | 定向 e2e 先行，再 `node --test "test/**/*.test.ts"`；`npm run typecheck`；`npm run typecheck:renderer`；`build:renderer` 默认 N/A（无渲染层产品改动），若桌面UI 可选改动则复用其构建证据 | 基线对照；全量回归计数/失败分类；v3/legacy e2e；布局核对报告；真实演示证据；候选哈希/diff/status |
| 桌面UI（可选） | `node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer` | 文案 diff；渲染测试；build 输出（dist 非候选）；或 N/A + 理由 |
| 项目管理（可选文档） | 无代码检查；文档链接/一致性检查 | 文档 diff；不纳入产品候选 |

### 6.3 T3 全量回归

- 最终候选必须跑：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`；`build:renderer` 默认 N/A（本变更不改渲染层产品代码；若桌面UI 可选改动发生，由桌面UI 对同一候选产出并复用其证据）。
- 基线（D3）在实施前对相同 HEAD/工作树跑同一组命令；最终结果与基线逐项对照，区分：
  - 本次新增失败；
  - 既有失败（如 Windows symlink EPERM、桌面并发偶发）；
  - 环境不可用/跳过。
- 任一本次新增失败不得放行；既有失败必须附基线证据与原因，不能笼统写「环境问题」。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。
- 并行全量出现桌面时序偶发时，必须以隔离/整文件/串行复跑分类；不得把新增红归为基线红，也不得用并行偶发掩盖真实失败。
- 治理/共享抽象检查：v3 前后 v2 计划逐字不变；`src/common/shared/` 零改动；`src/model/{boundary,role,decision}.ts`/`resolve-write.ts` 零改动（除非策略 B 另开设计）；卡文本注册表 entries/forbidden/preauthorized 零变化。

### 6.4 真实启动/演示

- **执行者**：测试角色（方案 §11 证据计划；团队计划指定，不由 Verifier 默认承担）。
- **内容**：至少覆盖一条 v3 治理链路的关键变化：v3 团队计划（frontmatter `directories`/模块清单 `实现目录`/角色表 `授权目录`+`精确写集`/目录规范表）→ appointment → Crew 写卡/目录边界 → V12（`new` 一致、`changed`/`existing` 覆盖）→ Convener readiness（目录/规范/共享/边界/契约/测试面）→ Map 在授权目录内新建文件/子目录 → 布局核对 pass → 变更包 → Verifier → acceptance；以及至少一条 legacy v2 链路保持通过。
- **启动方式**：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；离线无真实凭据时如实记录模型桩边界。
- **证据**：启动命令、时间、版本/候选、窗口截图/日志清单；缺失或失效时不得建议 accept。

---

## 七、独立验收安排

> 本节只安排验收，不代替验收标准；正式标准由内置独立验收在实施前写盘。

### 7.1 实施前完成标准

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、D4 实施前；可与 D3 基线并行。
- **路径**：`docs/acceptance/directory-ownership-criteria-v1.md`。
- **基线**：客户在闸门 1 确认的目录授权方案 v1 + 闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、风险档位 T3 与依据、选定检查/复用规则/全量回归条件、pass/fail/insufficient evidence/not applicable 判定规则、成功/失败/边界情形、证据失效规则、版本冻结规则。
- **标准不得弱于**方案 §11 的 P1–P12；不得自造需求或放宽/加严标准实质。
- **冻结**：实施开始后不得改标准适配候选；确需变更时递增版本、记录理由、交沟通/统筹确认，受影响证据重新核对。

### 7.2 变更包与判定

- 统筹在 D7 完成后组装变更包：`docs/scheduling/directory-ownership-change-v1.md`，含候选哈希（产品代码/测试文件；`git hash-object` + `sha256sum`）、改动路径（相对本变更阶段入口基线）、任务节点 D1–D9、证据链接、风险档位 T3、复用证据与失效说明。
- 独立验收按标准与变更包判定；报告路径 `docs/acceptance/directory-ownership-report-v1.md`；报告首行必须含：风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；调度不改验收结论。
- 验收通过只表示当前候选满足标准 v1，不授权提交、推送、合并、发布。

### 7.3 证据复用与档位纪律

- 复用仅限同一候选、同一输入/依赖、同一命令的有效证据；候选/输入/依赖/契约/夹具/配置变化使受影响证据失效，只补失效部分。
- 本任务为 T3，全量回归是默认要求；若某项确无代码面（例如只改卡文本且已有针对性断言），报告中写 N/A + 理由，不能掩盖代码面。
- 独立验收可**升档**，不能降档；档位与改动不符时退回统筹或按更高档补证。
- 分片证据带候选哈希和模块标识；验收核对 manifest + 分片原始日志，不把测试角色摘要当原始证据；缺失/失效判 `insufficient evidence`。
- **本变更的验收结论不得与 i18n 变更合并**；两变更各自变更包、各自标准、各自报告。

---

## 八、闸门 2 待客户确认项

> 以下为闸门 2 需客户确认的具体项；客户确认记录由沟通写入 `docs/communication/`。本计划不自行判断客户是否同意。

1. **参与角色**：编排（v3 解析/校验/布局核对/卡前守卫/会话提示）、门禁引擎（Convener/Crew/Verifier 卡文本）、运行时核心（条件/推荐：`GovernanceJudgeFacts` 可选类型）、桌面窗口（v3 读取/V12/任务文案）、测试（v3 e2e/布局核对/T3 全量回归/真实演示）为实施 worker；**桌面UI 可选/默认 N/A**（不显示目录规范）；**项目管理可选文档**（登记 v3 规则，不参与产品验收）；内置独立验收负责实施前标准与实施后判定；统筹负责计划、派发、收证、变更包与记录。**不启用人事**（无角色/边界变更）；**不启用装配**（无构建配置/入口改动）；**不启用品/宣传/各适配器**。
2. **精确写集**：
   - 编排：`src/common/编排/team-plan.ts`、新增 `src/common/编排/directory-conformance.ts`、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/` 相关测试、自身文档；
   - 门禁引擎：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/` 相关测试、自身文档；
   - 运行时核心（条件）：`src/model/runtime.ts`、`test/runtime-core/` 受影响测试、自身文档；
   - 桌面窗口：`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts`（`operator-wiring.test.ts` 条件）、自身文档；
   - 测试：`test/测试/` 下 v3 e2e/布局核对/回归用例与夹具、自身文档与证据；
   - 桌面UI（可选）：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`、`test/桌面UI/` 相关测试、自身文档；
   - 项目管理（可选文档）：`角色卡/项目管理/docs/project-rules.md`/`docs/architecture/**`；
   - 统筹：`docs/scheduling/`；内置验收：`docs/acceptance/`。
3. **是否有角色/边界变更**：**无**。新增 `src/common/编排/directory-conformance.ts`、`test/编排/directory-conformance.test.ts`、`test/测试/directory-layout.test.ts` 均在既有目录授权内。唯一条件项：若桌面侧必须在 `test/桌面应用/` 新建测试文件，该目录对桌面窗口不是目录授权，需 ANS 人事按本计划与闸门 2 的额外确认新增精确单文件条目；不默认派发。推荐方案是并入既有精确文件，避免边界变更。
4. **档位**：**T3**（治理/权限/流程设计变更），适用全量回归 + 治理/共享抽象检查；报告首行五项（档位、判定依据、选定检查、复用证据、全量回归）。
5. **阶段顺序**：闸门 2 + 实施授权 → 验收标准 + 全量回归基线 → Map A（编排 + 门禁引擎 + 运行时核心并行）→ Map B（桌面窗口）与 Map C（测试夹具，部分并行）→ Reduce（v3 e2e/布局核对/T3 全量回归/真实启动演示）→ 变更包与独立验收判定 → 放行。若 i18n 变更同时确认：i18n B0 → 本变更 → i18n B1/B2/B3/B4（见 §4.7）。
6. **验收安排**：使用内置独立验收（写 `docs/acceptance/directory-ownership-criteria-v1.md` / `directory-ownership-report-v1.md`），不使用项目 `角色卡/独立验收` worker；实施前标准先于实施，标准基于客户闸门 1 确认的方案 v1；**不与 i18n 变更合并判定**。
7. **证据口径**：未启用 task_ops；以文件哈希、原始命令输出、diff/status、v3/legacy e2e、布局核对报告、T3 全量回归原始输出、真实启动/演示为证据；不提交、不推送、不合并、不发布；管理记录不混入产品候选。
8. **实施授权与闸门 2 分开**：客户可先确认角色指派，再另行给出实施授权；本计划写盘后不派发，直到两者齐备且实施前验收标准经沟通确认。
9. **客户已确认的默认项**：§2.3 的 Q1–Q12 推荐 A，特别是**运行期强制力策略 A**（不做任务级 `writeDirs`）。若客户在本轮改变任一默认（如改策略 B、强制迁移现有边界、设迁移截止日、要求桌面UI 展示目录规范），视为方案实质变更，需重开闸门 1/2；本计划不自行调整。
10. **现有角色不迁移**：本计划只实施产品能力，不重写本仓库现有 `角色卡/**` 边界；若客户要求立即迁移，需单独的迁移计划、人事参与与闸门 2。

---

## 九、前置问题、风险与阻塞

1. **闸门 2 未确认**：本计划只是团队计划；客户确认角色指派前不派发、不改代码；实施授权另行取得。
2. **运行期强制力 A vs B**：方案已选 A（边界目录硬拦 + 任务文本 + 布局核对）。A 的前提是 `new` 角色边界目录与计划目录一致（V12），`changed`/`existing` 计划 ⊆ 边界、更宽部分限于模块实现目录/既有职责。若客户改选 B（任务级 `writeDirs`），需改 `TaskScope`/F4/session/桌面/model，另开设计并重开闸门 1/2；本计划拒绝在执行中自行滑向 B。
3. **v3 单一解析器**：v3 语法只在 `src/common/编排/team-plan.ts` 单一实现；桌面经 `src/pipeline/orchestration/run-role.ts` 公共出口消费，不复制。若实施无法抽出/再导出，必须加 parity 测试并回报统筹，不能静默保留两份；否则会出现「卡前通过、写卡后拒绝」或反之。
4. **`GovernanceJudgeFacts` 类型闭环**：`interface.ts` 现状把 `plan.teamPlanSchema` 传入 judge facts；v3 后值可为 3，`1|2` 类型会冲突。推荐运行时核心扩展为 `1|2|3`（可选 `teamPlanDirectories`）；若选择桌面映射/丢弃 v3 信息，必须在报告中说明理由，且 judge 不得假装看到 v3。不得新增 artifact kind/枚举。
5. **V12 `new` vs `changed`/`existing` 语义**：`new` 角色的边界目录（排除 `角色根`）必须与计划 `授权目录` 一致；`changed`/`existing` 计划 ⊆ 边界即可，边界更宽部分只能落在模块实现目录/既有职责内，越出 warning + readiness；`existing` 只 warning + 迁移提示，不强制重写。测试必须覆盖三类角色与「计划问题 vs Crew 文件问题」的来源分流，避免把计划错误混为边界错误。
6. **卡文本/任务文案同步**：Convener/Crew/Verifier 卡文本、`governance-advance.ts` 任务文案、`govern-session.ts` 提示必须同步 v3；否则模型仍按 v2 逐文件写计划，功能形同未上线。`test/门禁引擎/*` 与 `test/测试/governance-e2e-auto/*` 冻结这些文本，更新断言必须对应真实行为变化，不得删测试/放松断言保绿。
7. **v2 兼容与 legacy 夹具**：`teamPlanSchema` 缺省/1 按 legacy、2 按 v2 逐字不变；v3 继承 v2 V1–V11 并增加 V-D 系列。不得把所有既有夹具批量改成 v3，否则失去 legacy 覆盖；至少保留一条 v2 链路。旧 v2 计划不原地改、不强制迁移。
8. **目录规范语义 vs 结构校验**：应用只做路径/覆盖/重叠/枚举/正则/依赖 DAG 等确定性检查；目录是否内聚、规范是否合理、共享是否必要、契约/测试面是否真实由 Convener readiness 记录；结构通过不等于语义正确。验收核对实际布局，不把「字段齐全」当「粒度正确」。
9. **治理关键路径误伤**：`.ans`、`角色卡/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`src/common/shared/`、release/packaging、`.env`/密钥、根单例契约（`src/model/{boundary,role,decision}.ts` 等）不得作为普通 `授权目录`；只能精确文件 + 原有治理授权。V-D7/V12 必须硬拒；`src/model/` 不整体目录授权。
10. **共享目录策略**：`none`/`read-only`/`split`；`split` 父目录不得直接分配、子目录各行 owner；不允许两个角色 owner 同一目录。V-D4/V-D5/V-D8 覆盖相同/祖先/嵌套/精确文件落入他人目录。
11. **Windows 路径/大小写/符号链接**：规范化 posix、拒绝 `..`/盘符/UNC/尾随空格/点；已存在祖先 realpath 检查；大小写不敏感比较但保留显示；布局核对复用 `path-primitives`/`resolveWrite` 口径，不另写第二份。
12. **实际布局核对依赖候选清单**：`git status`/diff 必须覆盖未跟踪文件；忽略文件/生成物可能漏检；报告必须附原始命令输出与候选哈希，不把摘要当原始证据；删除/重命名按新路径核对，跨目录重命名按越界/计划变更处理。
13. **`test/桌面应用/` 逐文件授权**：不得新建该目录文件；新断言并入 `interface.test.ts` 等既有精确文件；`operator-wiring.test.ts` 仅在其断言被任务文案变化失效时由桌面窗口更新，并在完成报告单列理由。**另发现 Markdown/YAML 漂移**：`test/桌面应用/acceptance-dispatch.test.ts`、`runtime-resolution.test.ts` 只在 `boundary.yaml`、不在 `boundary.md`；以 Markdown 为准，本变更不写它们；漂移交人事/闸门 2 校正，不在本变更内顺手改边界。
14. **测试冻结面大**：`test/编排/team-plan.test.ts`、`governance-e2e-auto/*`、`test/门禁引擎/*`、`test/桌面应用/interface.test.ts` 等冻结 v2 计划结构/卡文本/任务文案；更新必须对应真实行为变化；测试角色负责终验，不接受「自测通过」替代集成。
15. **模型「照抄 v2」风险**：卡文本/提示必须明确 v3 的 `授权目录`/`目录规范`/`精确写集` 语义与 `唯一写集` 兼容别名；否则 Convener 继续写 v2 精确写集，v3 形同未上线。readiness 必须逐目录记录。
16. **`directories` frontmatter 与规范表/角色表一致性**：三处必须完全一致（不多、不少、不重复、owner 一致）；以单一来源对齐；缺少 `directories` 时是否接受由 Q1 决定（推荐强制）。解析器必须给结构化问题，桌面只消费不复制。
17. **目录依赖 DAG**：`依赖` 目标必须存在、无自依赖/重复、目录依赖 DAG 无环，并与角色 `dependsOn` 方向一致；不要把「有环」留到 readiness 才发现。
18. **与 i18n 变更的共享文件**：`app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts` 必须按 §4.7 顺序串行写；两变更的变更包/验收报告必须分开，不得合并判定。
19. **无 task_ops**：无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件与原始输出为准。
20. **`docs/` 未跟踪与候选口径**：意图记录、两份方案、本计划为未跟踪；管理记录不混入产品候选；候选身份以产品代码/测试文件哈希与已跟踪 diff 为准；本计划不自行提交。
21. **`real-entry.test.ts` 快照**：该用例快照 `docs/scheduling/`，断言演示不新增/不改写记录；本任务新增团队计划发生在演示前，理论上不影响快照；若基线确认其语义不符，测试角色可在 `test/测试/**` 内按「不新增/不改写」的真实语义更新，不得放宽为永远通过。
22. **产品运行期 `docs/scheduling/` 写入与既有记录同名风险**：产品 Convener 的团队计划/readiness/变更包都用 `<flowId>-vN.md` 命名；在本仓库演示/测试时不得覆盖既有 `docs/scheduling/2026-10-*` 记录。测试夹具必须使用独立 flowId/临时项目根。
23. **无 Node PATH**：当前 shell PATH 未包含 Node；基线/实施前必须按既有记录加入 PATH 并记录实测版本；不得因命令不可用伪造结果。
24. **T3 全量回归成本与既有失败**：历史基线存在 Windows symlink EPERM 等既有失败；D3 必须先记录并分类，终验只对本次新增失败负责；并行全量可能出现桌面时序偶发，必须用隔离/整文件/串行复跑分类；不得用「环境问题」笼统带过。
25. **桌面UI 可选项的写集冲突**：默认 N/A；若客户要求目录规范展示，必须排在 i18n B1/B2 之后并使用 i18n key，否则会与 i18n 迁移并发写同一渲染层文件，造成中文硬编码回潮与断言冲突。
26. **现有角色不迁移**：本计划不重写本仓库 `角色卡/**`；`existing` 宽边界只 warning；客户若要求立即迁移，另走迁移计划/闸门 2/人事。
27. **发布/打包**：本轮只影响产品代码候选；不改 v1.6.0 发布配方/冻结源；发布另走装配流程（T3 发布前应完成适用全量回归）。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`）。
- **未确认**：闸门 2（参与角色/写集/顺序/验收安排/证据口径）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 后写 `docs/acceptance/directory-ownership-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档。
- **下一步**：交沟通 → 客户闸门 2（含是否同时确认 i18n 变更及其顺序）→ 客户实施授权 → 内置独立验收写标准 → 按 §五阶段派发。若客户选择先行 i18n B0，本计划按 §4.7 顺序执行；若客户改变方案默认项（尤其策略 B/立即迁移），重开闸门 1/2。
