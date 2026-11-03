# 团队计划：给内置策划一个可查询的文档 schema（`contract_check` topic）

- **任务 ID**：`2026-11-03-contract-schema-query`
- **产品 flowId**：`contract-schema-query`（沿用意图/方案文件名）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-03
- **状态**：团队计划已写盘；**闸门 2 未确认、客户实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0/1 记录**：[`docs/communication/2026-11-03_intent_contract-schema-query.md`](../communication/2026-11-03_intent_contract-schema-query.md)（当前 **91 行 / SHA-256 `7e078ad33f3a3bfda2fc41be7dbda373f0ecf9f28c074392b7633751667f5fa4`**，含闸门 0、闸门 1 材料与闸门 1 确认记录；方案头引用的 64 行 / `2c11b726…` 是追加闸门 1 记录前的闸门 0 快照，两者不混用）
- **客户确认的策划方案（唯一实施基线）**：[`docs/planning/2026-11-03_design_contract-schema-query.md`](../planning/2026-11-03_design_contract-schema-query.md) **P1.3**（**911 行 / SHA-256 `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85`**，本计划写盘前实测一致）
- **独立复核**：[`docs/planning/2026-11-03_review_contract-schema-query.md`](../planning/2026-11-03_review_contract-schema-query.md)（**282 行 / SHA-256 `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`**；P1.0 完整复核 178 行 / `87494f33…`（F1–F16）、P1.1 窄复核追加至 237 行 / `57cc1809…`（N1–N7）、P1.2 窄复核追加至 282 行 / `55a2d268…`；最终结论「建议提交客户确认」；N9 为非阻断建议）
- **闸门 1 客户原话**：「确认闸门 1：方案 P1.3（Q1–Q4 A/A/A/A、T2、三项待确认建议），进入团队计划。」
- **风险档位**：**T3（统筹判定，不压档）**。客户闸门 1 确认的 P1.3 建议 T2，并同时确认「若统筹/验收按『凡触 Model/公共工具契约即 T3』管理，则按 T3 全量回归并重评」。本变更触及 `src/model/runtime.ts` 共享 Model 与 `contract_check` 公共工具契约，且改动内置策划卡文本（治理材料），按技能 `references/testing.md` 的 T3 定义与项目先例管理为 T3；理由与验证口径见 §1.2。该判断在客户已确认的条件范围内，不构成方案实质变更。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（未启用 task_ops）；不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（参与角色/精确写集/无边界变更/T3/阶段顺序/验收安排/证据口径/越界规则/实施授权边界）**；**闸门 2 确认与客户实施授权前不派发任何 worker、不写卡、不改代码**。闸门 2 与实施授权是两个分开的事实。

---

## 一、任务与基线

### 1.1 目标（按客户确认的 P1.3，不扩大）

只增加只读可查询性与错误可诊断性，不改放行语义：

1. **扩展 `contract_check`**：新增可选只读 `topic: "modules" | "roster" | "topology"`。传 `topic` 时只返回该文档的字段表 + 最小合法 YAML 示例；**不读 run、不混入 run 摘要/写区**，不依赖项目/run 是否已存在。不传 `topic`（含 `null`/空串/仅空白串）时保持现有 run/写区/taskKind 摘要逐字不变。
2. **schema 单一定义**：`CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic` 放 `src/model/runtime.ts`；文本、示例与 `contractSchemaText(topic)` 放 `src/common/编排/workflow-preconditions.ts`（与三个 parser 同文件，降低漂移）；工具层只校验枚举并透传，会话层直接复用；桌面会话在 `contractCheckText` 第一条语句 topic 早退，topic 模式零磁盘读。
3. **示例由真实解析器锁定**：`PROJECT_MODULES_SCHEMA_EXAMPLE` / `PROJECT_ROSTER_SCHEMA_EXAMPLE` / `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE` 导出常量；测试用真实 `parseProjectModules` / `parseProjectRoster` 验证 `ok:true`；roster 示例包含 topology 示例；两示例 `modules[]` 逐项一致（`deepEqual`）；roster 文本列明加载级硬拒绝，AC-15 用 `loadLatestRoster` 正/负例锁住。
4. **错误文案逐字段**：把 roster 与 modules 文档的四字段合并报错改为 `name` / `purpose` / `publicContract` / `architectureSource` 逐字段，带收到类型（如 `boolean: true`）；保留 `responsibility` 兼容别名语义；topology 的 schema/management 提示统一到「顶层扁平数组」，去掉误导性的 `management.roles` 与 topology `category` 说法。**错误码不变，接受/拒绝集合不变。**
5. **策划卡两行指引**：写模块/名单/拓扑前先查 `contract_check({topic:...})`；`publicContract` 是非空字符串；`management` 是含 convener 与全部项目角色 id 的扁平数组。
6. **已确认口径**：topic 对所有已注入 `contract_check` 的角色可查（不新增角色门禁）；不接受 `management.roles` 兼容（保留顶层扁平数组严格校验）；`architectureSource` 不强制路径校验（非空字符串 + 写作约定路径）。
7. **完成标准**：方案 §7.2 **AC-1–AC-18**；正式验收标准由内置独立验收在实施前基于同一确认版本写盘（见 §七）。

### 1.2 风险档位与验证口径：T3

**统筹判定 T3，不压档。** 依据：

1. 本变更修改 `src/model/runtime.ts` 的共享 Model 类型（`ContractCheckInput` 新增可选 `topic`、新增枚举/类型）与 `contract_check` 公共工具入参/描述；技能 `references/testing.md` 的 T3 定义明确含「shared-abstraction change (Model, public entry, cross-module contract)」。
2. 本变更修改 `src/common/门禁引擎/governance-roles.ts` 的内置策划卡文本，属治理材料变更；方案 §8.6 也把「角色卡文本/治理材料变更」列为按 T3 重评的条件。
3. 项目先例：`2026-11-02_team-plan_acceptance-return-card.md` 明确把「改 `src/model/runtime.ts` 共享报告/客户输入契约」列为升 T3 条件并因此选择应用私有字段；`2026-11-02_team-plan_global-task-state.md`、`2026-11-02_team-plan_dispatch-guardrail-relax.md` 对共享 Model/治理变更均按 T3 管理。
4. 客户闸门 1 已确认的条件：「若统筹/验收按『凡触 Model/公共工具契约即 T3』管理，则按 T3 全量回归并重评」。统筹按此条件管理为 T3，**不是**对 P1.3 范围、AC 或方案实质内容的变更；闸门 2 将把 T3 作为待确认项呈现。若客户在闸门 2 明确要求改为 T2，须由客户明确指示并理解证据口径（作为客户对档位的明确决定记录）；统筹不自行降档。

**T3 验证口径**：

- 受影响角色层测试：运行时核心（`npm run typecheck` + 其改动面）；编排（`test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts`）；桌面窗口（`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts`）；门禁引擎卡内容守卫回归（`test/门禁引擎/view-image-cards.test.ts`、`test/门禁引擎/list-project.test.ts`）。
- **T3 全量适用回归**：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；允许按既有验收记录排除 `test/pi-adapter/write-sequencing.test.ts`，必须在证据中记录命令、清单与排除理由，不得静默跳过。Windows symlink `EPERM` 等既有环境失败由 B0 单独分类，新增确定性失败必须为 0、新增 skip 必须为 0。
- **双端 typecheck**：`npm run typecheck`、`npm run typecheck:renderer` 均须为 0（方案 §7.3/AC-14）。
- **不要求真实 Electron E2E**：本变更不触及渲染层/UI/窗口行为；`contract_check` 是模型面向工具，证据由 Node 工具层/会话层测试与角色卡字符串断言覆盖。若验收认为证据不足，可按只读方式运行既有 E2E，但不作为 V1 默认项，也不得把未运行 E2E 写成通过。
- **档位不降**：若实施触及 parser 接受/拒绝集合、`management.roles` 兼容、`architectureSource` 强制路径、角色权限/边界/闸门/验收规则，立即停止并回报统筹；这类变更需另立意图并按 T3（甚至更高）重评，不在本写集内。

### 1.3 本轮非目标（不得顺手扩大）

- 不放宽任何校验：不接受 `management.roles` mapping，不把 `publicContract: true` 当字符串，不跳过名单/模块/拓扑校验，不改 parser 接受/拒绝集合。
- 不自动修复项目文档：不修改 `ans-work/科研/layer0` 或任何运行项目；不替客户/策划重写名单。
- 不改变放行语义：除错误文案外，parser 行为不变；`architectureSource` 路径形状仍是写作约定，不是强制校验。
- 不新增写路径/权限：不改角色卡写区、boundary、Section 1、shell/写守卫、闸门、验收/证据规则；不新增角色门禁。
- 不新增 `proposal`/`architecture` topic；不新增工具；不新增依赖；不新增文件（优先在现有测试文件补用例）。
- 不处理独立事项：roster/引用循环、demo 重复投递、run pin 哈希、版本链 M13、D3 招人逻辑等不在本次范围。
- 不把 schema 查询当放行/授权/验收结论；查询输出首行明示「查询不构成放行/授权」。
- 不改角色卡权限/边界（除必要时的精确条目——经核对**本任务无边界变更**，见 §4.5）。
- 不改运行项目文档、README、`package.json`、构建/发布配置；不 commit/push/merge/release。
- 不混入客户授权平面（`@审批`/`@决策`）等其它事项。

### 1.4 基线（写计划时实测，2026-11-03）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `release/v1.8.4-assets` / `243d8f6a6db663a383b516aad6320c5110c7f583`（`docs(release): record v1.8.4 published assets and checksums`） |
| 与方案基线的关系 | 方案头基线即 `243d8f6`；v1.8.4 合并（`91f08e9` 等）已在其祖先中（`git merge-base --is-ancestor 91f08e9 243d8f6` 成立）。**当前 HEAD 与方案基线一致，无需重记基线。** 若实施前 HEAD 前进/合并 main，按方案 §11.4 以符号名与文本锚点重新核对，并在实施记录中写明新基线 |
| 工作树（写本计划前） | 已跟踪修改：`docs/communication/memo.md`；未跟踪：本任务意图、方案、复核三份文档；`git status --porcelain -- src app test` **为空**，无产品/测试改动 |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops |
| 环境 | Node **v24.22.1** / npm **11.19.1**；Electron **44.7.0**（devDependency，本任务不要求启动） |
| 输入快照 | 意图当前 **91 行 / `7e078ad3…`**（含闸门 1 记录）；闸门 0 快照 **64 行 / `2c11b726…`**（历史，不混用）；方案 P1.3 **911 行 / `4d61d376…`**；复核 **282 行 / `55a2d268…`** |
| 权威边界基线 | 运行时核心 `boundary.md` 26 行 / `fe66eae2…`；编排 26 行 / `1f45d783…`；桌面窗口 95 行 / `ba701add…`；门禁引擎 28 行 / `d070ce4c…`；项目管理 23 行 / `6f75bee4…`；测试 19 行 / `9a2eba3f…`（2026-11-03 实测；YAML 同步副本按 grep 核对为同范围） |
| 角色卡基线 | 运行时核心 36 行 / `0de109a0…`；编排 30 行 / `0c40e330…`；桌面窗口 44 行 / `1f9f23cc…`；门禁引擎 29 行 / `58c6aed5…`；项目管理 36 行 / `de5c9d36…`；测试 29 行 / `452cee43…` |
| 代码锚点（当前 HEAD 实测） | `ContractCheckInput` `src/model/runtime.ts:1139`；`makeContractCheckTool` `src/provider/runtime/tools.ts:2417`；`CONTRACT_CHECK_MAX_BYTES=4096` `tools.ts:140`；`contract_check` 参数/描述 `src/provider/runtime/schema.ts:630-651`；`contractCheckText` `app/desktop/session.ts:8095`；`RAPPORTEUR_CARD_TEXT` `src/common/门禁引擎/governance-roles.ts:178`；`validateRosterTopology`/错误文案 `workflow-preconditions.ts:294/328/340-341/347-349`；`parseProjectRoster` `:443`；四字段报错 `:561-573`；`parseProjectModules` `:727`；modules 文档四字段报错 `:791-793`。所有锚点在当前 HEAD 成立；实施以符号名与文本锚点为准，不机械依赖行号 |
| 既有依赖事实 | `app/desktop/session.ts:135-142` 已从 `src/common/编排/workflow-preconditions.ts` 导入 `loadLatestRoster` 等符号；本任务新增 `contractSchemaText` 导入不新增依赖边。`src/provider/runtime/schema.ts:2` 已有从 `src/model/runtime.ts` 导入值的先例；工具层只导入枚举，不导入 `workflow-preconditions.ts` |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-03）** | 意图记录「闸门 0 确认记录」：Q1–Q4 A/A/A/A |
| 闸门 1：方案确认 | **已确认（2026-11-03，P1.3 为唯一实施基线）** | 意图记录「闸门 1 确认记录」；客户原话见本文件头 |
| 闸门 2：角色指派/写集/边界变更/档位 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发任何 worker、不改代码 |
| 实施前验收标准 | 未写盘 | 内置独立验收在闸门 2 后、实施前写 `docs/acceptance/contract-schema-query-criteria-v1.md`（沟通另起验收主上下文） |
| 提交/推送/发布 | **未授权** | 实施/验收期间不 commit/push；另行授权 |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认的是参与角色、各自范围和写集、无边界变更、T3 档位、阶段顺序、验收安排、证据口径、实施授权边界；实施授权是对代码实施与真实回归的授权。两者分开记录。
- 客户在闸门 1 的确认不等于闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到：闸门 2 确认 + 客户实施授权 + V1 写盘并经沟通确认 + 逐角色范围预留完成。H1 不适用（无边界变更）。

### 2.2 客户在闸门 1 已确认的事项（本计划据此排期，不重开）

| 项 | 确认结果 |
| --- | --- |
| 查询面 | Q1 A：扩展现有 `contract_check`，新增只读 `topic` |
| 覆盖范围 | Q2 A：`modules` / `roster` / `topology` |
| 示例 | Q3 A：字段表 + 最小合法 YAML 示例，由真实解析器测试保证可解析 |
| 错误文案 | Q4 A：逐字段 + 收到类型；topology `management` 提示/校验口径统一 |
| topic 可见范围 | 所有已注入 `contract_check` 的角色可查；不新增角色门禁 |
| `management.roles` | 不做兼容；保留顶层扁平数组严格校验 |
| `architectureSource` | 不强制路径校验；非空字符串 + 写作约定路径 |
| 风险档位 | 建议 T2；若统筹/验收按「凡触 Model/公共工具契约即 T3」管理，则按 T3 全量回归并重评（本计划按 T3 管理，见 §1.2） |

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | schema 枚举/类型与工具契约属**运行时核心**；schema 文本/示例/错误文案属**编排**；会话数据源属**桌面窗口**；内置策划卡文本属**门禁引擎**；均为既有职责的延伸，无新知识/新契约/新持续责任 |
| 2. 范围归属 | **现有 Section 1 全覆盖；无缺失、无重叠** | 4 个源码角色 + 2 个测试目录 + 4 个逐文件测试；逐路径核对见 §4.1；无需新角色或边界变更 |
| 3. 契约影响 | **有共享 Model/公共工具契约的加法变更；唯一 primary owner 明确** | `src/model/runtime.ts`（运行时核心）主属枚举/类型/`ContractCheckInput.topic`；`src/common/编排/workflow-preconditions.ts`（编排）主属文本/示例/`contractSchemaText`；`src/provider/runtime/{tools,schema}.ts`（运行时核心）主属工具参数/透传；`src/common/门禁引擎/governance-roles.ts`（门禁引擎）主属策划卡文本；桌面窗口为消费方。因触 Model/公共工具契约，按 T3 验证（§1.2） |
| 4. 证据独立性 | **满足** | 运行时核心：typecheck/契约变更自检；编排：parser 锁、错误矩阵、加载级正/负例；桌面窗口：工具层/会话层测试；门禁引擎：卡文本与内容守卫回归；测试：跨角色与 T3 全量；内置独立验收：V1/E2，不受实施方结论约束 |
| 5. 协调成本 | **复用现有角色最低；新增角色不划算** | 4 个实施角色写集互不相交，依赖为「Model 冻结 → 并行文本/工具/卡文本 → 会话 → 回归」；新增「schema 查询」专职角色会把一条跨层契约拆到多张卡与多个上下文，协调成本大于收益 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 运行时核心 | **保留** | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` 均在既有 Section 1 单文件授权；职责不变 |
| 编排 | **保留** | `src/common/编排/`、`test/编排/` 目录授权；`workflow-preconditions.ts`、`workflow-preconditions.test.ts`、`trio-worker-report.test.ts` 均在目录内；职责不变 |
| 桌面窗口 | **保留** | `app/desktop/` 目录授权含 `session.ts`；`test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` 均为既有精确单文件条目；职责不变 |
| 门禁引擎 | **保留** | `src/common/门禁引擎/` 目录授权含 `governance-roles.ts`；`test/门禁引擎/view-image-cards.test.ts`、`list-project.test.ts` 在目录内，本任务**只读回归**；职责不变 |
| 项目管理 | **保留（P1 审核）** | 技能要求已建立技术架构工作角色时审核实现提案；只读审核，写自身 `角色卡/项目管理/docs/change/`；**不参与 i18n**（无新增用户可见 i18n key），不写 `src/common/shared/` |
| 测试 | **保留** | `test/测试/` 目录与 `角色卡/测试/docs/change/`；负责 B0/D1、T3 全量回归与证据；默认不新增 `test/测试/` 文件 |
| 内置独立验收 | **参与（V1/E2）** | 技能默认写权 `docs/acceptance/`；沟通另起唯一验收主上下文 |
| 统筹 | **参与（本计划、E1/E3、派发与收证）** | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与（闸门 2、实施授权、回报）** | `docs/communication/` |
| 人事（内置） | **不参与** | 本任务**无边界变更**（§4.5），无 H1；若实施发现未覆盖路径，停止并回报统筹，重开闸门 2 后再交人事 |
| 装配 | **不参与** | 无 `README.md`/`package.json`/`tsconfig`/构建/发布变化；无新依赖 |
| 策划（内置） | **不参与实施** | P1.3 已确认；实施期出现方案实质变更才由沟通重开闸门 1 |
| 产品、宣传、UIUX设计师、桌面UI、Claude适配器、Codex适配器、Pi适配器、项目 `角色卡/独立验收` worker | **不参与** | 本任务不涉及对应职责/路径；只读引用；不启用项目独立验收 worker，使用内置独立验收 |

### 3.3 决策表结果

**不变，派给现有角色；无新增角色、无拆分、无合并、无边界变更。** 共享抽象指定唯一 primary owner：

- **能力缺口**：无。现有角色能承接；不需要新建或修改任何角色。
- **运行时核心**：`src/model/runtime.ts` 的 `CONTRACT_SCHEMA_TOPICS`/`ContractSchemaTopic`/`ContractCheckInput.topic`，以及 `src/provider/runtime/{tools,schema}.ts` 的工具契约。
- **编排**：`src/common/编排/workflow-preconditions.ts` 的 schema 文本、三个示例常量、`contractSchemaText(topic)`、逐字段错误文案。
- **门禁引擎**：`src/common/门禁引擎/governance-roles.ts` 的策划卡两行文本。
- **桌面窗口**：消费方；`app/desktop/session.ts` 的 topic 早退与会话数据源，不复制文本/枚举。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有角色：运行时核心 + 编排 + 桌面窗口 + 门禁引擎 + 项目管理（P1 审核）+ 测试 + 内置验收 + 统筹/沟通 | **采用** | 写集与现有 Section 1 一一对应；契约/文本/会话/卡文本/证据职责分离；协调成本最低 |
| B. 新增「schema 查询」或「契约文本」专职角色 | 否决 | 一次性跨层契约变更，无持续独立责任；建卡/边界/交接成本大于收益 |
| C. 把 schema 文本放 `src/provider/runtime/tools.ts` 或 `schema.ts` | 否决 | 会把 parser 规则与文本拆到 Provider 层，且 tools 层导入编排模块会造成上行调用/非法依赖；违反方案 §3.4 单一来源与分层 |
| D. 把枚举/类型放 `workflow-preconditions.ts`（任务建议原案） | 不采用（按方案 §3.1 的有意差异） | 方案选择放 `src/model/runtime.ts`，避免工具层为枚举引入编排模块的 `fs`/`yaml` 依赖；语义不变，若实施发现必须回调，按 P1 提案重新评审 |
| E. 把 `test/编排/trio-worker-report.test.ts` 交给门禁引擎写 | 否决 | `test/编排/` 归编排；门禁引擎越界。由编排写断言，门禁引擎只改卡文本，A1 的该部分等 A3 后完成 |
| F. 新增独立测试文件（如 `contract-schema.test.ts`） | 默认否决 | 方案 §7.3/§10.2 建议在现有文件补用例，避免新增边界条目；若确需新增，停止并重开闸门 2/补边界登记 |

### 3.5 协调成本与关键排序

- **契约先行**：A0a Model 枚举/类型先冻结（`contract_check` 的输入形状唯一来源）；A0b 工具层与 A1 文本、A3 卡文本可在 A0a 后并行；A2 会话层等 A0a + A1 的 `contractSchemaText` 可用后再写；A1 的策划卡断言等 A3 卡文本落地后追加。
- **串行**：G2 → IA → V1/B0（可并行）→ P1（提案 + 项目管理审核）→ A0a → A0b/A1/A3（可并行）→ A2 → D1 → E1 → E2 → E3。H1 不适用。
- **共享文件单写者**：`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts` 只由运行时核心写；`src/common/编排/workflow-preconditions.ts` 与 `test/编排/*` 只由编排写；`app/desktop/session.ts` 与 `test/桌面应用/{rejection-copy,run-pin}.test.ts` 只由桌面窗口写；`src/common/门禁引擎/governance-roles.ts` 只由门禁引擎写；`test/门禁引擎/{view-image-cards,list-project}.test.ts` 只读回归，不修改。
- **不允许**：A0a 冻结前 A2 写 `session.ts`；A1 文本冻结前 A2 引用 `contractSchemaText`；A3 卡文本落地前 A1 写 `trio-worker-report.test.ts` 的新断言；任何角色写其他角色路径、角色卡/边界、`docs/scheduling|acceptance|communication|planning` 或 `src/common/shared/`。

### 3.6 分类组别（仅分类，不增加派发/汇报层级）

| 角色 | 组别 | 依据 |
| --- | --- | --- |
| 运行时核心 | 运行时接入组 | `角色卡/运行时核心/role-card.md` |
| 桌面窗口 | 桌面窗口 | `角色卡/桌面窗口/role-card.md` |
| 项目管理 | 项目协调组 | `角色卡/项目管理/role-card.md` |
| 编排、门禁引擎、测试 | 角色卡未标注 group（按技能单角色上下文执行） | 各自 `role-card.md` 无 group 字段 |
| 统筹、沟通、内置独立验收、人事 | 不适用（技能内置管理角色） | 技能默认角色，无需项目卡 |

组别只作分类，不增加派发/汇报层级；统筹直接向每个角色派发并收原始结果。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-11-03 核对，HEAD `243d8f6`）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。目录授权内新增文件不重写边界；逐文件目录中的新条目才交人事。**本任务逐路径均在既有授权内，无未覆盖路径。**

| 方案/任务路径 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `src/model/runtime.ts` | 运行时核心 | 单文件 `src/model/runtime.ts`（中立运行时类型与能力契约） | 是（A0a） |
| `src/provider/runtime/tools.ts` | 运行时核心 | 单文件 `src/provider/runtime/tools.ts`（公共受治理工具执行） | 是（A0b） |
| `src/provider/runtime/schema.ts` | 运行时核心 | 单文件 `src/provider/runtime/schema.ts`（公共工具 schema 与描述） | 是（A0b） |
| `src/common/编排/workflow-preconditions.ts` | 编排 | 目录（私有）`src/common/编排/` | 是（A1） |
| `test/编排/workflow-preconditions.test.ts` | 编排 | 目录（测试）`test/编排/` | 是（A1） |
| `test/编排/trio-worker-report.test.ts` | 编排 | 目录（测试）`test/编排/` | 是（A1，方案 §10.2 列；AC-11 需要；任务摘要未列，见 §9.3） |
| `app/desktop/session.ts` | 桌面窗口 | 目录 `app/desktop/` | 是（A2） |
| `test/桌面应用/rejection-copy.test.ts` | 桌面窗口 | 单文件 `test/桌面应用/rejection-copy.test.ts` | 是（A2） |
| `test/桌面应用/run-pin.test.ts` | 桌面窗口 | 单文件 `test/桌面应用/run-pin.test.ts` | 是（A2） |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 | 目录（私有）`src/common/门禁引擎/` | 是（A3） |
| `test/门禁引擎/view-image-cards.test.ts` | 门禁引擎 | 目录（测试）`test/门禁引擎/` | **否**（回归只读；由测试角色执行） |
| `test/门禁引擎/list-project.test.ts` | 门禁引擎 | 目录（测试）`test/门禁引擎/` | **否**（回归只读；由测试角色执行） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2） |
| `docs/scheduling/` | 统筹 | 技能默认写权 | 是（本计划、E1、E3、memo） |
| `docs/communication/` | 沟通 | 沟通写权 | 是（G2、实施授权、回报） |
| `角色卡/运行时核心/docs/change/` | 运行时核心 | 本角色目录 | 是（P1 提案、A0 证据） |
| `角色卡/编排/docs/change/` | 编排 | 本角色目录 | 是（P1 提案、A1 证据） |
| `角色卡/桌面窗口/docs/change/` | 桌面窗口 | 本角色目录 | 是（P1 提案、A2 证据） |
| `角色卡/门禁引擎/docs/change/` | 门禁引擎 | 本角色目录 | 是（P1 提案、A3 证据） |
| `角色卡/项目管理/docs/change/` | 项目管理 | 本角色目录 | 是（P1 审核记录） |
| `角色卡/测试/docs/change/` | 测试 | 本角色目录 | 是（B0/D1 证据） |
| `test/测试/` | 测试 | 目录（测试）`test/测试/` | **默认否**；如需跨层集成夹具，在目录内新增并回报 |

### 4.2 共享属主与既有依赖核对（不猜）

- `src/model/runtime.ts`：**运行时核心唯一写入**；其他角色只读引用。它是共享 Model，改动使所有引用方既有证据失效；本任务按 T3 重跑受影响/全量回归。
- `src/common/编排/workflow-preconditions.ts`：**编排唯一写入**；`app/desktop/session.ts` 已存在的导入（`:135-142`）是既有跨角色依赖，本任务只新增同一模块的 `contractSchemaText` 导入，不新增依赖边、不新增共享目录。
- `src/provider/runtime/tools.ts` / `schema.ts`：**运行时核心唯一写入**；工具层只从 `src/model/runtime.ts` 导入枚举，**不得**导入 `src/common/编排/workflow-preconditions.ts`（避免 Provider→Pipeline/编排的上行依赖）。`contract_check` 的 schema 文本由注入的 `ContractCheckFn` 数据源返回。
- `app/desktop/session.ts`：**桌面窗口唯一写入**；`test/桌面应用/` 对桌面窗口是逐文件授权，本任务只写 `rejection-copy.test.ts`、`run-pin.test.ts` 两个既有条目，不新建文件。
- `src/common/门禁引擎/governance-roles.ts`：**门禁引擎唯一写入**；卡文本变更不改变角色权限/边界/判定；`test/门禁引擎/` 的 `view-image-cards.test.ts`、`list-project.test.ts` 只读回归。
- `test/编排/`：编排目录；`test/桌面应用/`：桌面窗口逐文件；`test/门禁引擎/`：门禁引擎目录；`test/测试/`：测试目录；互不重叠。
- `docs/scheduling/`：统筹按技能默认写团队计划/变更包/状态；项目工程法案记录的 `task_ops` 机器状态未启用，不用普通文档写机器状态。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。实现顺序：A0a Model 冻结 → A0b/A1/A3 并行 → A2 → A1 的卡断言收尾 → D1。

#### 运行时核心（A0a + A0b；P1 提案）

- **写集（A0a）**：`src/model/runtime.ts`：新增 `export const CONTRACT_SCHEMA_TOPICS = ["modules", "roster", "topology"] as const;`、`export type ContractSchemaTopic = (typeof CONTRACT_SCHEMA_TOPICS)[number];`、`ContractCheckInput.topic?: ContractSchemaTopic`；不改既有字段、默认值、返回类型、`ContractCheckFn` 形状。
- **写集（A0b）**：`src/provider/runtime/tools.ts`：`makeContractCheckTool` 解析 `topic`；非字符串 → `ok:false`（明确「应为字符串」）；非空字符串且不在枚举 → `ok:false` 并列出 `CONTRACT_SCHEMA_TOPICS`；非空合法 → 构造 `ContractCheckInput.topic` 透传给 `fn`；空/仅空白/null → 不构造 topic（legacy）；role 隔离仍先于 topic 校验；topic 专用截断标记；不调用数据源于未知/非字符串分支。`src/provider/runtime/schema.ts`：`topic` 参数（`type:"string"`、`enum:[...CONTRACT_SCHEMA_TOPICS]`）、描述、`promptGuidelines`；`required` 不变、`additionalProperties` 不变。
- **不写**：`src/common/编排/workflow-preconditions.ts`、`app/desktop/session.ts`、`governance-roles.ts`、任何测试文件、共享 i18n、角色卡/边界。
- **可观察交付**：Model 枚举/类型/`topic` 可选字段冻结声明；工具参数校验/透传代码；`npm run typecheck` 0；候选哈希；P1 提案写明契约形状、枚举单一来源、无新工具/新写路径。
- **自测**：`npm run typecheck`；A0b 的工具行为由 A2 的 `rejection-copy.test.ts` 覆盖（跨角色测试归属），A0b 退出时记录该依赖，不把未跑测试写成通过。

#### 编排（A1；P1 提案）

- **写集（A1）**：`src/common/编排/workflow-preconditions.ts`：
  - `contractSchemaText(topic)` 与三块文本常量；`PROJECT_MODULES_SCHEMA_EXAMPLE`、`PROJECT_ROSTER_SCHEMA_EXAMPLE`、`PROJECT_TOPOLOGY_SCHEMA_EXAMPLE` 导出；文本用 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 常量插值（F10/N2）；roster 文本加「加载校验（硬拒绝）」段与三条警告；roster 示例 `omissionReason` 占位；两示例 `modules[]` 逐项一致（N1）。
  - `describeContractValue` 内部 helper；roster 与 modules 文档四字段逐字段错误（顺序 `name → purpose → publicContract → architectureSource`；`purpose` 的 raw-vs-effective 口径与 `responsibility` 别名；`publicContract` 带「不能写 YAML 布尔 true/false」；`architectureSource` 带「应为项目相对路径」）；错误码不变。
  - topology schema 提示、management 缺 convener/缺角色文案；「写作格式是扁平字符串数组」；raw `management` 显示；不改宽容读取。
  - parser 入口注释：改校验/文案时同步 `contractSchemaText` 与三个示例常量。
- **写集（A1 测试）**：`test/编排/workflow-preconditions.test.ts`：示例 parser 锁、跨示例 `deepEqual`、三块文本 ≤4096 B（roster ≤3900 B）、每 topic schema 常量恰好 3 行且等于常量拼出的期望行（N2/AC-17）、四字段 × 空值/非字符串矩阵（roster 与 modules 两侧）、`purpose` 别名、topology mapping/缺角色/v1 提示、`loadLatestRoster` 正例（两个示例 + intent/proposal/architecture + modules 文档）与负例（`roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing`）。
- **写集（A1 卡断言）**：`test/编排/trio-worker-report.test.ts`：在现有策划卡断言旁增加 `contract_check`、`topic:"modules"`、`publicContract.*非空字符串`、`management.*扁平数组`（具体正则以最终文案为准；至少锁工具名 + topic + 两个硬约束）。**该文件只由编排写；该部分必须在 A3 卡文本落地后追加。**
- **不写**：`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`app/desktop/session.ts`、`governance-roles.ts`、`test/桌面应用/**`、`test/门禁引擎/**`、共享 i18n、角色卡/边界。
- **可观察交付**：三示例经真实 parser `ok:true` 且 `modules[]` `deepEqual`；加载级正/负例；逐字段错误矩阵；topology 文案；三块文本字节数/预算守卫；schema 常量行断言；卡断言（A3 后）；`npm run typecheck` 0；候选哈希。

#### 桌面窗口（A2；P1 提案）

- **写集**：`app/desktop/session.ts`：`contractCheckText` **第一条语句**为 `if (input.topic !== undefined) return contractSchemaText(input.topic);`；从 `src/common/编排/workflow-preconditions.ts` 导入 `contractSchemaText`；早退前不得调用 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；legacy 路径逐字不变；工具/会话层 4 KiB 截断由工具层 `truncateUtf8` 处理，topic 模式 session 不预截断。
- **写集（测试）**：`test/桌面应用/rejection-copy.test.ts`：工具层 topic 透传/未知/非字符串/null/空串/空白串/角色隔离/`topic + flowId + taskKind`/三 topic ≤4096 B/含 schema 标识/legacy `seenInput` 不变；工具描述 `topic` enum/required（可选，若在既有 schema 测试更合适则按 P1 提案确认，但不新增文件）。`test/桌面应用/run-pin.test.ts`：session 层 topic 早退（无 run/legacy 项目也返回 schema 文本）、无 `run：`/`taskKind ` 且含「必填」/`可写边界：` 开头 legacy 行、三 topic ≤4096 B、legacy `{flowId,taskKind,moduleId}` 仍返回 run/角色/taskKind 摘要。
- **不写**：`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`、`test/桌面应用/` 其他文件、`test/门禁引擎/**`、共享 i18n、角色卡/边界。
- **可观察交付**：topic 模式零磁盘读/不混 run 摘要（早退在第一句）；未知/非字符串拒绝；空/空白走 legacy；角色隔离；≤4 KiB；legacy 逐字不变；SessionManager/工具层测试 + `npm run typecheck` 0；候选哈希。

#### 门禁引擎（A3；P1 提案）

- **写集**：`src/common/门禁引擎/governance-roles.ts`：在 `RAPPORTEUR_CARD_TEXT` 的产物说明之后、`名单是人事招人的唯一依据` 之前加两行（方案 §5.1 原文）：查询指引 + 两个硬约束（`publicContract` 非空字符串；`management` 扁平数组）。不重写其他卡文本，不改角色权限/边界/判定。
- **P1 只读核对（必须写入提案/证据）**：确认 `governanceRoleOf("rapporteur").cardText` 是内置策划的实际系统提示来源（`src/service/role/resolve-role.ts` 对内置治理角色走 `spec.cardText`，`src/common/pi-adapter/real-adapter.ts`/各 Provider 使用 `role.cardText`）；`RAPPORTEUR_CARD_TEXT` 虽带 `@deprecated` 注释，仍由 `governanceRoleOf` 注册表返回并被上述路径使用。若实施发现该常量已非活动路径（例如被项目卡覆盖或已被迁移），**停止并回报统筹**，转策划核对方案 §5 的活动路径；不得改未授权路径或擅自迁移卡文本。
- **不写**：`test/编排/trio-worker-report.test.ts`（编排写）、`test/门禁引擎/**`（回归只读）、`src/model/**`、边界/YAML/changelog、其他角色资料。
- **可观察交付**：卡文本两行、字节数/行数记录（预期约 +366 B / 约 4612 B / 27 行，以实测为准）、活动路径核对记录、`npm run typecheck` 0、候选哈希。

#### 项目管理（P1 审核；不参与 i18n）

- **写集**：`角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`（审核记录）。
- **P1 审核内容**：只读审核 A0/A1/A2/A3 的短实现提案；核对契约唯一来源/分层（工具层不导入编排模块、Model 枚举单一来源）、无新写路径/权限、无边界变更、T3 验证口径、AC-1–AC-18 测试映射、legacy 不变、4 KiB 预算、卡文本活动路径、无新增 i18n key；结论 `recommend approval` / `needs revision` / `not ready`。需要修订时退回原提案所有者，修订后复审；不代写实现。
- **不写**：产品/测试源码、`src/common/shared/`、i18n messages、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。
- **i18n 判断**：本方案新增/修改的是模型面向工具输出、错误文案与内置角色卡文本，不是渲染层用户可见 UI；i18n 变更的非目标明确「不翻译角色提示词、角色卡文本、系统提示」；本任务不新增 `ui.*`/`main.*`/`shared.*` key，不改 `src/common/shared/i18n` 与计数。项目管理**不参与 i18n**，只做 P1 架构审核。

#### 测试（B0/D1）

- **写集**：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md`、`2026-11-03_contract-schema-query-D1-regression.md`（或同目录等价命名）及原始日志/证据目录；`test/测试/` 目录默认**不新增**文件；若 P1/统筹确认需要跨层用例，可在 `test/测试/` 内新增并回报（目录授权）。
- **B0**：记录 HEAD/工作树、Node/npm、`npm run typecheck`、受影响套件基线、T3 全量基线（排除 `write-sequencing.test.ts` 并记录原因）、失败分类（既有 Windows symlink EPERM 等）、Electron 可运行性（本任务不要求启动）、确认无产品/测试代码改动。
- **D1**：对 A0–A3 同一候选跑受影响套件 + `test/桌面应用/**`/`test/编排/**` 补充（如需要）+ **T3 全量回归** + 双端 typecheck；输出计数/失败分类/候选哈希/diff/status；确认新增确定性失败 0、新增 skip 0；不修改产品/其他角色测试；不 commit/push。
- **不写**：产品源码、其他角色测试/组件、角色卡/边界、`docs/scheduling|acceptance|communication|planning`、共享 i18n。

#### 内置独立验收 / 统筹 / 沟通

- **内置独立验收**：V1 `docs/acceptance/contract-schema-query-criteria-v1.md`（基于 P1.3 + 当前意图 + 闸门 1/2 记录；AC-1–AC-18 不弱化；T3 依据、选定检查、证据复用/失效、判定规则、版本冻结）；E2 `docs/acceptance/contract-schema-query-report-v1.md`（通过/返工/证据不足）。沟通另起唯一验收主上下文；需要并行取证时按既有规则启动 0–4 个只读取证子上下文（主上下文不计数；子上下文只取证、不判断、不产生第二结论）。
- **统筹**：`docs/scheduling/`（本计划、E1 `contract-schema-query-change-v1.md`、E3 `contract-schema-query-status-e3.md`、memo 续接线索）；逐角色授权/预留、派发、收证、变更包、放行；不写实施方案/调研方案。
- **沟通**：`docs/communication/`（闸门 2 呈现、客户实施授权、客户回报）；不向 worker 派活。

#### 不参与角色

- **装配**：无 `README.md`/`README.en.md`/`package.json`/`package-lock.json`/`tsconfig`/构建/发布变化；本方案无 README 变化，**不参与**。若实施需要新依赖/构建改动，停止并回报统筹（超出写集）。
- **人事（内置）**：本任务无边界变更，**不参与**。若实施发现未列路径/需要新测试文件，停止，重开闸门 2 后再交人事写卡。
- **策划（内置）**：P1.3 已确认，实施期不参与；若实施发现方案实质变更（字段表/示例/AC/写集/风险档位变化），由沟通重开闸门 1，交策划修订。
- **产品、宣传、UIUX设计师、桌面UI、Claude适配器、Codex适配器、Pi适配器、项目 `角色卡/独立验收` worker**：不参与、不写盘；只读引用。项目 `角色卡/独立验收` worker 是项目角色，本任务使用技能内置独立验收，不启用该 worker。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹；`docs/acceptance/`：内置独立验收；`docs/communication/`：沟通；`docs/planning/`：策划；`角色卡/**` 角色卡/边界/YAML/changelog：人事（本任务无变更）。worker 不写这些路径。
- 各角色实现证据/提案写各自 `角色卡/<role>/docs/change/`；项目管理 P1 审核写 `角色卡/项目管理/docs/change/`；测试 B0/D1 写 `角色卡/测试/docs/change/`。

### 4.5 精确边界变更清单（闸门 2 对象，由人事执行）

**无边界变更（B-0）。** 逐路径核对：

| 路径 | 授权依据 | 结论 |
| --- | --- | --- |
| `src/model/runtime.ts` | 运行时核心 `boundary.md` 单文件条目 | 在既有授权内 |
| `src/provider/runtime/tools.ts`、`schema.ts` | 运行时核心 `boundary.md` 单文件条目 | 在既有授权内 |
| `src/common/编排/workflow-preconditions.ts` | 编排 `boundary.md` 目录 `src/common/编排/` | 在既有授权内 |
| `test/编排/workflow-preconditions.test.ts`、`trio-worker-report.test.ts` | 编排 `boundary.md` 目录 `test/编排/` | 在既有授权内 |
| `app/desktop/session.ts` | 桌面窗口 `boundary.md` 目录 `app/desktop/` | 在既有授权内 |
| `test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 桌面窗口 `boundary.md` 逐文件条目 | 在既有授权内 |
| `src/common/门禁引擎/governance-roles.ts` | 门禁引擎 `boundary.md` 目录 `src/common/门禁引擎/` | 在既有授权内 |
| `test/门禁引擎/view-image-cards.test.ts`、`list-project.test.ts` | 门禁引擎 `boundary.md` 目录 `test/门禁引擎/` | 回归只读，不写入 |

- **H1 不适用/省略**：无新增/修改/删除 Section 1 条目，无角色 id/显示名/职责描述变更，无新增角色/拆分/合并；不派人事、不写角色卡/边界/YAML/changelog。
- 若实施需要任何未列路径（含新测试文件、`app/desktop/interface.ts`、`src/common/shared/**`、`package.json`、README、角色卡/边界）：**停止**，回报统筹；需要时重开闸门 2/闸门 1，不默认越界。

### 4.6 工作量与范围预留

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 运行时核心 | 3 个源码文件 + P1 提案/证据 | A0a 独占 `src/model/runtime.ts`；A0b 独占 `tools.ts`/`schema.ts` |
| 编排 | 1 个源码 + 2 个测试 + P1 提案/证据 | A1 独占 `workflow-preconditions.ts`、`test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts` |
| 桌面窗口 | 1 个源码 + 2 个测试 + P1 提案/证据 | A2 独占 `app/desktop/session.ts`、`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts` |
| 门禁引擎 | 1 个源码 + P1 提案/证据 | A3 独占 `src/common/门禁引擎/governance-roles.ts`；`test/门禁引擎/` 只读 |
| 项目管理 | 1 份 P1 审核记录 | P1 只读审核；不写产品/测试/shared/i18n |
| 测试 | B0/D1 证据 + 原始日志 | `角色卡/测试/docs/change/`；`test/测试/` 默认不新增 |
| 内置独立验收 | 1 标准 + 1 报告 | V1/E2 |
| 统筹 | 本计划 + 变更包 + 状态 + memo | G2/E1/E3 |
| 沟通 | 闸门 2/实施授权/回报 | G2/IA |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；A0b/A1/A3 写集互不相交，可并行；A2 依赖 A0a+A1；A1 的卡断言依赖 A3；D1 只读候选；同一文件同一时间只有一个写入者。

---

## 五、契约归属与串行

### 5.1 契约唯一 primary owner

| 契约 | 唯一 primary owner | 消费方/只读 |
| --- | --- | --- |
| `CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic` | 运行时核心（`src/model/runtime.ts`） | 工具层、编排、桌面窗口只读引用 |
| `contract_check` 工具入参/描述/校验 | 运行时核心（`src/provider/runtime/tools.ts`、`schema.ts`） | 桌面会话注入数据源；其他角色只读 |
| `contractSchemaText(topic)`、三个示例常量、字段表、错误文案 | 编排（`src/common/编排/workflow-preconditions.ts`） | 桌面会话只读调用；工具层不导入 |
| 内置策划卡文本 | 门禁引擎（`src/common/门禁引擎/governance-roles.ts`） | 编排 `trio-worker-report.test.ts` 只读断言 |
| 会话 topic 早退/数据源 | 桌面窗口（`app/desktop/session.ts`） | 工具层经注入 `ContractCheckFn` 调用 |

### 5.2 串行与并行

- **必须串行**：G2 → IA（未给实施授权不派 worker）；IA → B0/P1；V1 与 B0 可并行；P1 审核通过 → A0a；A0a → A0b/A1/A3（可并行）；A0a + A1 → A2；A3 → A1 的 `trio-worker-report.test.ts` 新断言；A0–A3 → D1 → E1 → E2 → E3。
- **可并行**：A0b（运行时核心）、A1（编排文本/错误/主测试）、A3（门禁引擎卡文本）写集不相交；A1 的卡断言在 A3 后收尾；D1 内各受影响套件可并行但必须同一候选。
- **不允许**：A0a 前写任何依赖 `ContractSchemaTopic` 的代码；A0a/A1 冻结前 A2 写 `session.ts`；A3 前写 `trio-worker-report.test.ts` 新断言；A2 与 A1 并发写同一文件；任何角色修改 parser 接受/拒绝集合、角色权限/边界、共享 i18n、构建/发布面。

### 5.3 共享文件单写者

- `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`：运行时核心。
- `src/common/编排/workflow-preconditions.ts`、`test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts`：编排。
- `app/desktop/session.ts`、`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts`：桌面窗口。
- `src/common/门禁引擎/governance-roles.ts`：门禁引擎。
- `test/门禁引擎/view-image-cards.test.ts`、`test/门禁引擎/list-project.test.ts`：只读回归，任何角色不写。
- `src/common/shared/**`、`package.json`、`README*`、构建/发布配置、角色卡/边界/YAML/changelog：本任务任何 worker 不写。

---

## 六、阶段、依赖与门禁

### 6.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 2 | 沟通 → 客户 | 闸门 2 确认记录：参与角色、精确写集、无边界变更、T3、阶段、验收安排、证据口径、越界规则、实施授权边界 | 本计划写盘 |
| IA | 实施授权 | 客户 → 沟通 → 统筹 | 客户实施授权记录（与闸门 2 分开）；未给前不派发任何 worker | G2 |
| H1 | 边界变更 | 人事 | **不适用**：无 B-x；不派人事、不写角色卡/边界/YAML/changelog | — |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/contract-schema-query-criteria-v1.md`：AC-1–AC-18 不弱化、T3 依据与升档条件、证据计划、复用/失效、判定规则、版本冻结；经沟通确认 | G2（可与 B0 并行） |
| B0 | 基线 | 测试 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` + 原始日志：HEAD/工作树、Node/npm、typecheck、受影响套件、T3 全量基线、失败分类、Electron 可运行性（不要求启动）、无产品/测试改动 | IA（可与 V1 并行） |
| P1 | 实现提案与审核 | 运行时核心 + 编排 + 桌面窗口 + 门禁引擎（提案）/ 项目管理（审核） | 四份短实现提案（各自 `角色卡/<role>/docs/change/`）+ 项目管理审核记录（`recommend approval`/`needs revision`/`not ready`）；审核通过前不写产品代码 | IA + V1 经沟通确认 + B0 |
| A0a | Model 冻结 | 运行时核心 | `src/model/runtime.ts` 枚举/类型/`ContractCheckInput.topic`；`npm run typecheck` 0；冻结声明/候选哈希 | P1 审核通过 |
| A0b | Provider 工具/schema | 运行时核心 | `tools.ts`/`schema.ts` 解析/校验/透传/描述；`npm run typecheck` 0；候选哈希 | A0a（可并行 A1/A3） |
| A1 | 编排文本/示例/错误 + 测试 | 编排 | `workflow-preconditions.ts` + `test/编排/workflow-preconditions.test.ts` + `test/编排/trio-worker-report.test.ts`（卡断言在 A3 后）；parser 锁、字节守卫、错误矩阵、加载级正/负例；候选哈希 | A0a；A3（仅卡断言） |
| A2 | 桌面会话 + 测试 | 桌面窗口 | `app/desktop/session.ts` topic 早退 + `test/桌面应用/rejection-copy.test.ts`/`run-pin.test.ts`；legacy 不变/≤4 KiB/零磁盘读；候选哈希 | A0a + A1 |
| A3 | 门禁引擎卡文本 | 门禁引擎 | `governance-roles.ts` 两行 + 活动路径核对；`npm run typecheck` 0；候选哈希 | P1 审核通过（可并行 A0b/A1） |
| D1 | 跨角色回归 | 测试 | 受影响套件 + `test/桌面应用/**`/`test/编排/**` 补充（如需）+ T3 全量回归（排除 `write-sequencing.test.ts` 并记录）+ 双端 typecheck；计数/失败分类/候选哈希/diff/status；新增确定性失败 0、新增 skip 0 | A0a/A0b/A1/A2/A3 |
| E1 | 变更包 | 统筹 | `docs/scheduling/contract-schema-query-change-v1.md`：候选哈希、改动路径、任务节点、证据链接、T3、复用/失效说明 | D1 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/contract-schema-query-report-v1.md`：AC-1–AC-18 逐项；通过/返工/证据不足 | E1 |
| E3 | 放行/回报 | 统筹 → 沟通 | `docs/scheduling/contract-schema-query-status-e3.md`：按匹配当前候选的结论记录/放行/回报；提交/推送/发布另行授权 | E2 |

> 节点命名对应任务清单：**A0 = A0a（Model 枚举/类型冻结）+ A0b（Provider 工具/schema）**；**A1 = 编排**（文本/示例/错误/测试）；**A2 = 桌面窗口**（会话 + 两测试）；**A3 = 门禁引擎**（策划卡两行）。拆分 A0a/A0b 只为表达「Model 先冻结、Provider 后并行」的依赖，不增加角色或写集。

### 6.2 依赖要点

- **必须串行**：G2 → IA；IA → B0/P1；G2 → V1；V1 经沟通确认 + B0 → P1；P1 审核通过 → A0a；A0a → A0b/A1/A3；A0a + A1 → A2；A3 → A1 卡断言；A0–A3 → D1 → E1 → E2 → E3。
- **可并行**：V1/B0；A0b/A1/A3（写集不相交）；D1 内受影响套件与全量回归按同一候选分步执行。
- **不允许**：G2/IA 前派发任何 worker；V1 未确认前 P1 审核不启动；A0a 冻结前写依赖类型；A2 在 A0a/A1 前写 `session.ts`；A1 在 A3 前写卡断言；任何角色改 parser 接受/拒绝集合、角色权限/边界、共享 i18n、构建/发布面、运行项目文档。

### 6.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划版本、参与角色、精确写集、无 B-x、T3、阶段顺序、验收安排、证据口径、越界规则、实施授权边界；确认记录由沟通写入 `docs/communication/`。
- **IA 入口**：G2 确认。**出口**：客户实施授权记录（与闸门 2 分开）；未给前不派发任何 worker。
- **H1**：不适用；无边界变更。若出现未覆盖路径，H1 重新适用并重开闸门 2。
- **V1 入口**：G2 确认。**出口**：AC-1–AC-18 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、T2→T3 口径、证据复用/失效规则、pass/fail/insufficient/not applicable 判定规则、版本冻结；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：IA。**出口**：基线命令/环境/计数/失败分类可复算；确认无产品/测试代码改动；记录 Electron/E2E 可运行性（本任务不要求运行，但需记录）；T3 全量基线含 `write-sequencing.test.ts` 排除理由与既有 Windows symlink EPERM 分类。
- **P1 入口**：IA + V1 经沟通确认 + B0。**出口**：四份短实现提案明确契约形状、单一来源、分层、写集、测试映射 AC-1–AC-18、T3 验证口径、无边界变更、无 i18n；项目管理审核结论 `recommend approval`；否则回提案所有者修订后复审；审核通过前不写产品代码。
- **A0a 入口**：P1 审核通过。**出口**：枚举/类型/`topic` 可选字段落地；`npm run typecheck` 0；冻结声明（符号/形状/不做的事）；候选哈希。
- **A0b 入口**：A0a 退出。**出口**：工具解析/校验/透传/描述；`npm run typecheck` 0；无写集外改动；候选哈希；工具行为由 A2 测试覆盖的依赖已记录。
- **A1 入口**：A0a 退出；A3 已完成（仅卡断言部分）。**出口**：三示例 parser `ok:true` 且 `modules[]` `deepEqual`；加载级正/负例；逐字段错误矩阵；topology 文案；三块文本 ≤4096 B（roster ≤3900 B）；schema 常量 3 行断言；卡断言；`npm run typecheck` 0；候选哈希。
- **A2 入口**：A0a + A1 退出。**出口**：`contractCheckText` 第一句 topic 早退、零磁盘读；未知/非字符串拒绝；空/空白 legacy；角色隔离；≤4 KiB；legacy 逐字不变；两测试文件通过；`npm run typecheck` 0；候选哈希。
- **A3 入口**：P1 审核通过。**出口**：卡文本两行；活动路径核对记录；`npm run typecheck` 0；候选哈希。
- **D1 入口**：A0a/A0b/A1/A2/A3 退出。**出口**：受影响套件全过；T3 全量回归计数/失败分类（新增确定性失败 0、新增 skip 0）；双端 typecheck 0；候选哈希/diff/status；`write-sequencing.test.ts` 排除命令/原因；无产品/测试写集外改动。
- **E1 入口**：D1。**出口**：变更包候选可复算、路径/节点/证据/T3/复用/失效齐全。
- **E2 入口**：E1。**出口**：AC-1–AC-18 逐项结论、T3 档位核对、通过/返工/证据不足；不发明标准、不代改结论。
- **E3 出口**：只表示当前候选满足 V1；不授权提交/推送/发布。

### 6.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续（V1/B0/P1 之间按依赖并行）。
- 返工交原所有者：Model/工具归运行时核心；文本/示例/错误文案/编排测试归编排；会话/桌面测试归桌面窗口；卡文本归门禁引擎；测试复测归测试；统筹不改验收结论。
- 候选/契约/标准/边界变化使受影响证据失效：回到待做/返工，不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。
- P1 审核发现方案/写集/档位实质变化：停止实施，回报统筹/沟通；必要时重开闸门 1/2；若触及共享 Model/公共契约/治理语义 → 按 T3 及以上重评。

### 6.5 派发前置与不派发声明

- **派发前置**：闸门 2 确认（沟通记录）+ 客户实施授权（与闸门 2 分开）+ V1 写盘并经沟通确认 + H1 不适用（无边界变更）+ 逐角色授权与精确范围预留完成 + 无活动写入者冲突。
- **不派发声明**：本上下文只写本团队计划与 memo；**未派发任何 worker、未创建任何实现/测试上下文、未改产品/测试/角色卡/边界/方案/沟通/验收文档、未 commit/push、未接触客户**。本上下文不自行判断客户同意，不扩大授权。

---

## 七、验证与证据口径

### 7.1 受影响套件与命令

| 角色 | 命令 | 证据 |
| --- | --- | --- |
| 运行时核心 | `npm run typecheck` | Model/工具/schema 类型检查 0；枚举单一来源；无写集外改动；候选哈希 |
| 编排 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/trio-worker-report.test.ts`；`npm run typecheck` | 三示例 parser `ok:true`、`modules[]` `deepEqual`、字节守卫、错误矩阵、topology 文案、schema 常量 3 行、加载级正/负例、卡断言；候选哈希 |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts`；`npm run typecheck` | topic 透传/未知/非字符串/null/空/空白/隔离/并存参数/≤4 KiB；session 早退/无 legacy 行；legacy `seenInput` 不变；候选哈希 |
| 门禁引擎 | `node --test --test-concurrency=1 test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts`；`npm run typecheck` | 卡内容守卫/内置卡非空；A3 卡文本；活动路径核对；候选哈希 |
| 测试（D1） | 上述受影响套件 + `test/桌面应用/**`/`test/编排/**` 补充（如需）+ **T3 全量回归** + 双端 typecheck | 计数/失败分类/候选哈希/写集 diff/status；新增确定性失败 0、新增 skip 0；排除 `write-sequencing.test.ts` 的命令/原因 |

### 7.2 T3 全量回归

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；D1 证据须记录实际执行命令、文件清单、排除理由与可复现方式。
- 已知排除：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起（依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md` 的 T3 口径与既有验收记录）；不得把挂起当通过，不得新增 skip。
- 既有环境失败：Windows symlink `EPERM` 等由 B0 记录并分类；D1 与 B0 逐项对照，新增确定性失败必须为 0。若出现新增失败，交原所有者修复/返工后重跑，不得删除/放宽断言掩盖。
- 双端 typecheck：`npm run typecheck`、`npm run typecheck:renderer` 均 0。
- 本变更不触及渲染层/UI，**不要求** `npm run build:renderer` 或真实 Electron E2E；如验收认为需要，可只读执行既有命令，但不作为 V1 默认要求，也不把未执行写成通过。

### 7.3 AC-1–AC-18 证据映射

| AC | 标准摘要 | 产出角色/测试 | 证据 |
| --- | --- | --- | --- |
| AC-1 | 三个示例真实解析器通过；modules/roster 示例 `modules[]` `deepEqual` | 编排 `workflow-preconditions.test.ts` | parser 结果/断言输出 |
| AC-2 | roster 示例包含 topology 示例 | 编排同上 | `includes` 断言 |
| AC-3 | 三块文本 ≤4096 B；roster ≤3900 B | 编排同上 | 字节数断言 |
| AC-4 | topic 透传 | 桌面窗口 `rejection-copy.test.ts` | `seenInput.topic` 断言 |
| AC-5 | 未知 topic `ok:false` 且数据源未调用 | 桌面窗口同上 | 拒绝消息/调用计数 |
| AC-6 | 非字符串 topic `ok:false` 含「应为字符串」 | 桌面窗口同上 | 拒绝消息 |
| AC-7 | 角色隔离（`topic + roleId:other` 拒绝） | 桌面窗口同上 | 拒绝消息 |
| AC-8 | topic 模式无 legacy 行；topic+flowId+taskKind topic 优先 | 桌面窗口 `run-pin.test.ts`/`rejection-copy.test.ts` | 行断言/透传断言 |
| AC-9 | 四字段逐字段错误矩阵；`purpose` 别名/`purpose:true` | 编排 `workflow-preconditions.test.ts` | 错误码/reason 断言 |
| AC-10 | topology management 文案与校验口径一致 | 编排同上 | mapping/缺角色/v1 提示断言 |
| AC-11 | 策划卡出现 `contract_check`/topic/两个硬约束；卡守卫回归 | 编排 `trio-worker-report.test.ts` + 门禁引擎回归 + `view-image-cards`/`list-project` | 卡文本断言 |
| AC-12 | topic 分支第一句早退；无 run 也返回 schema；无写盘 | 桌面窗口 `run-pin.test.ts`；代码审查 | 输出/差异 |
| AC-13 | 旧调用逐字不变 | 桌面窗口 `rejection-copy.test.ts`/`run-pin.test.ts` | 既有断言/`seenInput` |
| AC-14 | 双端 typecheck + §7.3 套件 | 测试 D1 | 原始输出/计数 |
| AC-15 | `loadLatestRoster` 正/负例（drift/stale/inconsistent/missing/modules-doc-missing） | 编排 `workflow-preconditions.test.ts` | 正/负例结果 |
| AC-16 | null/空串/空白串 legacy；`topic:123` 拒绝 | 桌面窗口 `rejection-copy.test.ts` | 断言 |
| AC-17 | 每 topic schema 常量恰好 3 行且等于常量期望行 | 编排 `workflow-preconditions.test.ts` | 行集合断言 |
| AC-18 | schema 文本含占位 omissionReason 警告；真实项目文档不含占位符 | 编排测试 + 内置验收只读检查 | 文本断言/验收检查 |

### 7.4 证据要求

1. **通用**：写前基线（目标文件 `git hash-object` + `sha256sum`、HEAD、`status`）；候选身份（逐文件 before/after）；改动范围（`git status --porcelain -- src app test` 在写集内、无写集外改动、staged 空）；原始命令输出（命令/cwd/时间/Node/npm/OS/退出码/pass/fail/skip/失败原文）；不 commit/push；不改断言保绿。
2. **候选哈希**：E1 使用 `git hash-object` + `sha256sum` 记录产品/测试候选；候选必须是 D1 实际运行的那个版本；后续任何改动使受影响证据失效。
3. **不伪造**：不把源码阅读当测试证据；不把旧候选结果当当前候选；不把 skip/无法运行当通过；不伪造 `contractSchemaText` 输出；不把查询成功当放行。
4. **管理记录不混入产品候选**：`docs/` 管理记录、角色卡 docs 证据不进入产品/测试候选；不伪造 task_ops 状态。

### 7.5 Electron/构建适用性

- 本变更不涉及渲染层、窗口、IPC、preload、UI 样式或交互；**不要求真实 Electron E2E**、不要求截图/录屏（项目规则：证据最多截图，不得要求录屏）。
- 若验收认为 Node 证据不足，可只读运行既有 Electron E2E 作为补充；运行不了或不需要时如实记录，不判失败、不升级为默认要求。
- `npm run build:renderer` 不属本任务必需检查（未改渲染层）；如需静态覆盖可只读执行，但不作为 V1 通过条件。

---

## 八、闸门 2 待客户确认项

1. **参与角色**：运行时核心（Model/工具/schema）、编排（文本/示例/错误/测试）、桌面窗口（session/两测试）、门禁引擎（策划卡两行）、项目管理（P1 架构审核，不参与 i18n）、测试（B0/D1/T3 全量/证据）、内置独立验收（V1/E2）、统筹/沟通。**不参与**：人事（无边界变更）、装配（无 README/构建/依赖变化）、产品、宣传、UIUX设计师、桌面UI、Claude/Codex/Pi 适配器、项目 `角色卡/独立验收` worker、策划（方案已确认，实施期不参与）。
2. **精确写集**：按 §4.1/§4.3 逐角色列出；产品/测试写入仅限 `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/编排/workflow-preconditions.ts`、`app/desktop/session.ts`、`src/common/门禁引擎/governance-roles.ts`、`test/编排/{workflow-preconditions,trio-worker-report}.test.ts`、`test/桌面应用/{rejection-copy,run-pin}.test.ts`；不新增文件、不新增依赖；`test/门禁引擎/{view-image-cards,list-project}.test.ts` 只读回归。
3. **边界变更**：**无（B-0）**；所有路径在既有 Section 1 授权内；H1 不适用；不派人事、不改角色卡/边界/YAML/changelog。若实施发现未列路径，停止并重开闸门 2。
4. **风险档位**：**T3（统筹判定，不压档）**；理由见 §1.2。客户闸门 1 已确认「若按凡触 Model/公共工具契约即 T3 管理，则按 T3 全量回归并重评」；本计划据此管理。若客户在闸门 2 明确要求 T2，须由客户明确指示并接受证据口径（记录为客户决定）；统筹不自行降档。
5. **阶段顺序**：G2 → IA → H1（不适用）→ V1/B0（并行）→ P1（四份提案+项目管理审核）→ A0a（Model 冻结）→ A0b/A1/A3（并行）→ A2 → D1 → E1 → E2 → E3；契约先行、共享文件单写者。
6. **验收安排**：内置独立验收写 V1（`docs/acceptance/contract-schema-query-criteria-v1.md`），AC-1–AC-18 不弱化；E2 判定通过/返工/证据不足；沟通另起唯一验收主上下文；并行取证时 0–4 个只读取证子上下文，不产生第二结论。
7. **证据口径**：T3 全量回归（排除 `write-sequencing.test.ts` 并记录命令/原因）+ 受影响套件 + 双端 typecheck + 候选哈希/diff/status + 原始输出；不要求真实 Electron/截图/录屏；不 commit/push；不伪造 task_ops。
8. **实施授权与闸门 2 分开**：客户可先确认角色/写集/无边界变更/T3/阶段/验收安排/证据口径，再另行给实施授权；本计划写盘后不派发，直到 §6.5 全部前置满足。
9. **越界规则**：任何未列路径（含新测试文件、`app/desktop/interface.ts`、`src/common/shared/**`、`package.json`、README、角色卡/边界/YAML）停止并回报统筹；需要时重开闸门 2/闸门 1，不默认越界。
10. **已确认口径不重开**：Q1–Q4 A/A/A/A；topic 对所有已注入 `contract_check` 的角色可查；不接受 `management.roles` 兼容；`architectureSource` 不强制路径校验；错误码不变；不放宽/不收紧校验；不改运行项目文档。
11. **方案/快照引用**：V1/E2 以 P1.3（911 行 / `4d61d376…`）+ 当前意图（91 行 / `7e078ad3…`，含闸门 1 记录）+ 复核（282 行 / `55a2d268…`）为基线；闸门 0 快照 64 行 / `2c11b726…` 只作历史引用，不混用。
12. **计划版本**：闸门 2 确认的是本文件版本；若本计划在确认前修订，重交沟通确认；任何角色/写集/边界/档位/阶段实质变化重开闸门 2。

---

## 九、风险、开放点与不一致点

### 9.1 主要风险

1. **T3 证据成本**：全量回归时间较长且存在既有失败（Windows symlink EPERM、`write-sequencing.test.ts` 挂起）。缓解：B0 先记录基线/失败分类/排除理由；D1 只对照同一候选；新增确定性失败 0 才进入 E1。
2. **共享 Model/公共工具契约**：`ContractCheckInput.topic` 是加法可选字段，但仍是共享 Model/公共契约变更。缓解：A0a 先冻结、A0b/A2 只消费；`required`/`additionalProperties`/`ContractCheckFn` 形状不变；T3 验证；P1 审核确认无破坏性变更。
3. **跨角色卡断言**：`trio-worker-report.test.ts` 归编排，卡文本归门禁引擎；A1 的该断言依赖 A3。缓解：A3 先行/并行完成；单写者；A1 在 A3 后追加断言；D1 统一验证。
4. **卡文本活动路径**：`RAPPORTEUR_CARD_TEXT` 带 `@deprecated` 注释，但 `governanceRoleOf("rapporteur").cardText` 仍由 `resolve-role.ts` 的 `spec.cardText` 使用。缓解：A3 P1 只读核对实际系统提示路径；若发现已非活动路径，停止并回报统筹/策划，不擅自迁移/扩大写集。
5. **4 KiB 预算**：roster 文本 3763 B，距 4096 余 333 B，距 3900 守卫 137 B；新增字段可能逼近上限。缓解：AC-3/§3.6 断言 roster ≤3900 B；任何新增字段先压缩或拆子 topic，且拆子 topic 属方案变更需重开闸门 1。
6. **示例/加载级不一致**：modules 与 roster 示例必须 `modules[]` 逐项一致；`loadLatestRoster` 正例必须使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`，负例覆盖 drift/stale/inconsistent/missing/modules-doc-missing。缓解：N1/AC-15 测试锁死。
7. **legacy 回归**：不传 topic 的 `seenInput` 与输出必须逐字不变。缓解：AC-13/AC-16 断言；A2 早退必须第一句、早退前无 `getListing`/`refreshListingNow`/写盘；代码审查 + 测试。
8. **不放宽校验**：不得为让示例通过而放宽 parser；不得接受 `management.roles`；不得把 `architectureSource` 路径改为强制。缓解：非目标、P1 审核、E2 核对。
9. **无 i18n**：本方案无新增用户可见 i18n key；如实施发现需要 i18n，停止并回报统筹（可能超出写集/需 PM/i18n 参与）。
10. **未启用 task_ops**：不伪造机器状态/凭证；证据以文件哈希与原始输出为准。
11. **运行项目只读**：不修改 `ans-work/科研/layer0` 或任何运行项目；AC-18 的真实文档检查只读；不可访问时如实记录 not applicable/insufficient。

### 9.2 开放点

1. **`trio-worker-report.test.ts` 的归属/纳入**：方案 §10.2 含该文件；任务写集摘要未列；本计划纳入 A1（`test/编排/` 目录授权、AC-11 需要）。若闸门 2 前客户/人事决定不纳入，则 AC-11 的卡断言无落点，需另找编排目录内既有文件（不得新增未列文件）并在 P1 提案说明。
2. **工具描述测试位置**：方案 §7.1 允许 `rejection-copy.test.ts` 或既有 schema 测试；本计划默认在 A2 的 `rejection-copy.test.ts` 内，不新增文件；P1 提案可确认具体文件。
3. **卡文本活动路径**：见 §9.1 第 4 条；P1/A3 只读核对；若发现 `RAPPORTEUR_CARD_TEXT` 已非活动路径，停止并回报策划/统筹，可能需方案/意图变更。
4. **T3 全量回归基线**：B0 记录的既有失败可能与历史记录不同（环境变化）；D1 以 B0 为对照，不把既有失败算作本次通过/失败，新增确定性失败必须为 0。
5. **AC-18 真实项目文档检查**：运行项目不在本 worktree 读取范围时，验收记录 not applicable/insufficient 并说明，不修改运行项目。
6. **基线前进**：若实施前 HEAD/合并 main 前进，按方案 §11.4 重新核对符号/文本锚点并重记基线；若方案锚点/行为变化，重开 P1/闸门 1。

### 9.3 与方案/任务标签的不一致点（如实记录）

1. **`test/编排/trio-worker-report.test.ts`**：方案 §10.2 列出；任务写集摘要未列。本计划纳入 A1，理由：AC-11/§5.3 需要策划卡断言，且该文件在编排 `test/编排/` 目录授权内。不是写集扩大，是方案写集的完整落地。
2. **意图文件快照**：方案头引用闸门 0 快照 64 行 / `2c11b726…`；当前意图 91 行 / `7e078ad3…`（含闸门 0/1 记录）。本计划/V1/E2 使用当前文件；不混用快照。
3. **风险档位**：方案 §8.6 建议 T2；本计划按客户闸门 1 的条件管理为 T3（§1.2）。这不是对方案范围/AC 的实质修改，而是验证档位的更高管理口径；闸门 2 确认。
4. **枚举位置**：任务建议把 `CONTRACT_SCHEMA_TOPICS` 放 `workflow-preconditions.ts`；方案 §3.1 有意放 `src/model/runtime.ts`（避免工具层引入编排模块依赖）。本计划按方案 P1.3 执行；若实施需回调，按 P1 提案并重新评审，不擅自改方案。
5. **方案 §7.3 回归文件**：`test/门禁引擎/view-image-cards.test.ts`/`list-project.test.ts` 是回归只读，不是写集；本计划不把回归命令当写集。
6. **T2/T3 与 E2 口径**：若独立验收按 testing.md 判 T3（与统筹一致），按 T3 全量证据；若验收认为需更高档位，按更高档位补证并记录，不降档。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-03_team-plan_contract-schema-query.md`）；统筹 memo 续接线索。
- **未确认**：闸门 2（参与角色/精确写集/无边界变更/T3/阶段/验收安排/证据口径/越界规则/实施授权边界）与客户实施授权。
- **未写盘**：实施前验收标准（内置独立验收在闸门 2 后写 `docs/acceptance/contract-schema-query-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、提交、推送、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未接触客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权（分开）→ 内置独立验收写 V1（沟通另起验收主上下文）→ B0/P1 → 按 §六顺序派发。若客户改变方案/写集/边界/档位/阶段，重开对应闸门；本上下文不自行判断客户同意，不扩大授权。
