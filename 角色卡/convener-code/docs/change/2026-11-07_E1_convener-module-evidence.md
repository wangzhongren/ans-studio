# E1：convener 角色模块开发证据

- 任务：`2026-11-07-runtime-gate-role-modularization` / E1 greenfield（B1 E1.1–E1.7）
- 角色：`convener-code`（运营代码维护角色；固定 worker 上下文）
- 日期：2026-11-07
- 工作树：`.claude/worktrees/trunk-amendment`（分支 `feat/plan-escalation-card`）
- 状态：**模块实现 + 单测 + 差分 + typecheck 完成；未提交/推送；未运行真实模型；不判验收**
- 模块实现版本：`convener-module/v1`（E0.3 契约版本适用于本模块；见 `api-spec.md`）

## 1. 输入核对（只读接收）

| 输入 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- |
| E0.3 冻结契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 | `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` | 与任务给定哈希一致；§3.1 R-1/R-2、§3.2 convener 行、§3.3/§3.4/§3.5、§7、§10 D1/D5/D8/D10、§11/§11.1 已读 |
| E0 冻结记录 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md` | — | `5439d7c35deb984862ea41204551d1f498c665e9b6f5ab84939db8104b551a07` | E1 可启动、旧引擎 oracle 权威、无提交/推送授权 |
| 团队计划 `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` | 687 | `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c` | §4.4⑤、§7.4 写集/出口 |
| B1 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | 273 | `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` | §3.3 E1.1–E1.7 自检依据 |
| 角色卡 `角色卡/convener-code/role-card.md` | 37 | `19798bedeff1eb893859d7214c6f08749e1abdf9352b6394b365fb56005478a3` | 职责/纪律 |
| 边界 `角色卡/convener-code/boundary.md` / `boundary.yaml` | 20 / 36 | `87a92a2bfca82f5254580b9842a578b8e92aa26194ace65a64225ea659f347a8` / `f6cf14161fa5891117f96aebf66a7da94fef05bacd9074d5bec02c11dd24a8e5` | Section 1 唯一写集 |
| 旧规格 oracle `src/common/门禁引擎/governance-roles.ts` | 794 | `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e` | convener 卡/条目/能力/卡种 oracle；只读 |
| 旧工具装配 `src/common/门禁引擎/role-tool-registry.ts` | 157 | `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b` | D1 14 项 id→name→允许角色；convener 允许集 oracle |
| 旧编排 `src/pipeline/orchestration/run-role.ts` | 3333 | `026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6` | tools/卡种/门控 oracle；只读 |
| 旧 Service `src/service/trunk/impl/apply-journal.ts` | 3723 | `fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb` | team-plan/派发/报告/Git 角色侧条件来源；只读 |
| 旧编排公开只读入口 `src/common/编排/workflow-preconditions.ts` | 1609 | `6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41` | dispatch 硬授权/reportTarget oracle；只读 |
| Model 契约 `src/model/role.ts` | 409 | `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780` | `BuiltInRoleModule`/`RoleToolId` 等；只读 |

## 2. 交付物与写集

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/convener/index.ts` | 688 | `e125478a7809ae60a380c40236bfbc5bb6eaebd43819b40520a9a48bca6e7985` |
| `test/roles/convener/convener-module.test.ts` | 621 | `e67f1aca23369b9e1ffee591615c0fd1aedac06d007f842d375d4b2a0256937a` |
| `test/roles/convener/convener-differential.test.ts` | 395 | `5c816588b0b4c663712359568e58fe48b04e87a30595d8b39393084afbaad505` |
| **聚合候选哈希**（三文件 sha256 行排序后再 sha256） | — | `07ada1a510bdee4edde8fcd5c7ff99d7c452f5a9b1c79ef973aab56dda8ca722` |
| `角色卡/convener-code/api-spec.md` | 160 | `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4` |
| `角色卡/convener-code/memo.md` | 25 | `e1905d4841dd8aebd0e1281d34150e80f85634746ac6469aa5b2ea5f70bd2bd2` |
| `角色卡/convener-code/docs/change/2026-11-07_E1_convener-tests.log` | 38 | `1d168e4ec930694d298a31325f32aa028e46908e6eeb013aae6f5a3f4bb9b10a` |
| `角色卡/convener-code/docs/change/2026-11-07_E1_convener-typecheck.log` | 0（exit 0 无输出） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `角色卡/convener-code/docs/change/2026-11-07_E1_global-typecheck.log` | 0（exit 0 无输出） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

写集扫描（`git status --short -- src/common/roles/convener test/roles/convener 角色卡/convener-code`）：

```
?? src/common/roles/convener/
?? test/roles/convener/
?? 角色卡/convener-code/
```

- 仅新增本角色模块目录、测试目录、自身 docs/`api-spec.md`/`memo.md`；未改 `role-card.md`/`boundary.md`/`boundary.yaml`/`changelog.md`。
- 未写旧引擎/Model/shared/gates/其他角色；工作树中其余修改来自并行角色/T1 等既有上下文，不在本角色写集。
- 未提交/推送/合并；未运行真实模型。

## 3. 实现摘要

- **规格数据（D8/D10）**：`id="convener"`、`displayName="运营"`、`function="schedule"`；卡文本/三条 Section 1 条目/预授权/禁写/capabilities 与旧规格逐字/逐字段一致；`cards=["decision"]`；全部 `Object.freeze`。
- **`tools()`**：trio 五项（`requestRequirementChange`/`completeTeamPlan`/`closeCreatedTask`/`submitRefactor`/`requestStableWrite`）；single 保留旧角色门控两项；未知模型空集 + `governance-model-unknown` reason；`capabilities` 与 spec 同引用。
- **`dispatch()`（R-2）**：只判真实 convener → 真实目标的硬身份/存在性；内置目标仅 `verifier`，内置 verifier 与项目 worker 均需 `targetExists=true`；允许时 `reportToRoleId="convener"`（仅差分期望）。run/module/D3/roster/交付属主与报告时点**未进入模块**；worker 目标以 `CONVENER_WORKER_DISPATCH_TARGETS` 纯数据导出。
- **`preflight`**：覆盖 `team-plan`/`git-action`（init/commit/integrate/revert/publish）/`stable-write`/`requirement-change`；严格事实包（只读 api-spec 登记键；未知键/缺键/类型不符 deny）；不实现 Git 执行/ACL/证据闭包与 Service 事务。
- **`context()`**：`decision-card` / `project-workflow` / `report-expectation` 三段静态文本；按 D5/Q4 不把项目 `docs/workflow.md` 写成 `resources`。

## 4. 测试与差分

命令：

```bash
node --test "test/roles/convener/*.test.ts"
```

结果：**tests 30 / pass 30 / fail 0 / skipped 0**（单测 19 + 差分 11；原始输出见 `2026-11-07_E1_convener-tests.log`）。

差分零差异项：

1. 规格数据：`builtInRoleModuleDataOf("convener")` 逐字段（卡文本逐字、条目/预授权/禁写/capabilities）；
2. `cards`：从 `run-role.ts::TRIO_CARD_KINDS` 源码提取 convener 行 ⇒ `["decision"]`；
3. `tools`：`ROLE_TOOL_CATALOG` convener 允许集逐项同序；single 旧角色门控两项；
4. `dispatch`：与 `evaluateDispatchAuthorization` 在显式存在性域内逐组合允许/拒绝一致；
5. `team-plan`：与旧 `completeTeamPlanInternal` 角色侧身份/依据/路径谓词一致（Service 结构/名单/属主/hash 漂移校验不复制）；
6. `stable-write`：旧 `canRequestStableWrite`（仅 convener）+ `kind:"workflow"`；
7. `requirement-change`：旧工具侧归属键/`changeKind`/`summary`/`rationale` 谓词。

已登记差异（均为模块更严格，非放宽；差分测试逐项断言，新增差异即失败）：

| # | 场景 | 旧 oracle | 新模块 | 理由 |
| --- | --- | --- | --- | --- |
| 1a | 内置 `verifier` + `targetExists` 缺省/false（2 例） | allow | deny `dispatch-target-missing` | 契约 §3.1/D4：存在性缺省按 false，内置目标也要求宿主显式核验 |
| 1b | 空 `targetRoleId` + project + `targetExists:true` | allow | deny `dispatch-target-invalid` | 硬身份：空 id 不是真实派发目标 |
| 2a | team-plan `plan.sha256` 缺失/非 64hex（2 例） | 旧角色侧谓词 allow | deny `team-plan-facts-invalid` | D4 fact 类型校验；Service 仍做最终 hash 漂移校验 |
| 2b | stable-write `content=""` | 旧类型只约束 string | deny `stable-write-facts-invalid` | 空内容视为无事实；Service/工具层仍做最终校验 |

> Git 动作角色侧条件无纯函数 oracle（闭包于 Git Service/宿主上下文）；差分测试固定旧源码锚点（convener 身份、creator close、integration/revert 文案），行为正负例由单测覆盖（init/commit/integrate/revert/publish 各 3–8 例）。

## 5. Typecheck

- 本角色（模块 + 两个测试文件）scoped typecheck：

```bash
npx tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext \
  --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly \
  --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node \
  src/common/roles/convener/index.ts test/roles/convener/convener-module.test.ts test/roles/convener/convener-differential.test.ts
```

结果：**exit 0**（日志 `2026-11-07_E1_convener-typecheck.log`）。

- 全仓 `npx tsc --noEmit`：**exit 0**（日志 `2026-11-07_E1_global-typecheck.log`）。注意工作树有并行角色在飞；该结果以本次运行时刻为准，其他角色后续写盘可能改变全仓状态。

## 6. Import / 模块图自检

- 模块根只有 `index.ts`；无散放文件。
- import 仅两条（均 type-only）：`../../../model/boundary.ts`、`../../../model/role.ts`；无 value import。
- 零跨角色 import；未 import `src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、`src/common/shared/`、gates 或其他角色。
- 无 I/O/账本/会话/时钟/随机数/可变状态；模块/卡数据/能力位/卡种/上下文段 frozen；测试静态断言（`convener-differential.test.ts` 最后两项）。

## 7. B1 E1.1–E1.7 自检

| B1 | 自检结果 |
| --- | --- |
| E1.1 | 上岗前只读接收冻结契约（§1）；只写 Section 1 写集（§2 扫描）；越界 0 |
| E1.2 | `src/common/roles/convener/` 为 greenfield 新目录/新文件 |
| E1.3 | 本角色未写旧引擎/Model/shared/gates/其他角色；旧文件 diff 由各 owner 维持；E2 前旧引擎仍 oracle |
| E1.4 | 唯一 public entry `index.ts`；模块根无散放文件；测试断言 |
| E1.5 | 零跨角色 import；不 import 引擎/门控/共享；模块图扫描由 gates-code 的全仓脚本另判；本模块自检通过 |
| E1.6 | 模块只含数据/纯策略；未复制 shared 组件；旧数据迁移为 E1 设计内单一模块数据源 |
| E1.7 | 模块 public entry + 单测 + 差分 + 依赖扫描 + 候选哈希 + `api-spec.md` + 本证据 |

## 8. 候选哈希复算（最终）

| 文件 | SHA-256 |
| --- | --- |
| `src/common/roles/convener/index.ts` | `e125478a7809ae60a380c40236bfbc5bb6eaebd43819b40520a9a48bca6e7985` |
| `test/roles/convener/convener-module.test.ts` | `e67f1aca23369b9e1ffee591615c0fd1aedac06d007f842d375d4b2a0256937a` |
| `test/roles/convener/convener-differential.test.ts` | `5c816588b0b4c663712359568e58fe48b04e87a30595d8b39393084afbaad505` |
| 聚合 | `07ada1a510bdee4edde8fcd5c7ff99d7c452f5a9b1c79ef973aab56dda8ca722` |
| `角色卡/convener-code/api-spec.md` | `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4` |
| `角色卡/convener-code/memo.md` | `e1905d4841dd8aebd0e1281d34150e80f85634746ac6469aa5b2ea5f70bd2bd2` |

## 9. 遗留与限制

1. 消息键 `role.convener.*` 目前是模块内部稳定诊断键；用户可见 i18n 文案在 E2 呈现接入时统一评审/补充。
2. E2 门面需装配 `BuiltInRoleModuleMap` 并删除 `governance-roles.ts` convener 内联规格；消费方需显式提供 `targetExists` 与 §5 事实包。
3. Git 动作前置只消费宿主已核验事实；Git 执行/ACL/候选证据闭包仍在 Git Service，本模块不替代。
4. 项目 `docs/workflow.md` 的 path/version/hash 由宿主上下文装配提供（D5/Q4）。
5. 未运行真实模型；未提交/推送；不判验收。

## 10. E2 X-R4 fixture 金样化（2026-11-07，convener-code）

### 10.1 触发与结果

- 触发：E2 X-R4 已把 convener 规格迁入模块门面（`governance-roles.ts` 649 行 / `c31274f9…`；
  `specOf(convenerRoleModule)` 零复制投影）。`test/roles/convener/convener-differential.test.ts`
  的规格用例退化为模块自比较（仍 30/30 绿，但不再提供独立物证；见 E2-XR4 证据 §6.4/§8.6）。
- 处置：按 E2 检查单 **G9**（先冻结金样：场景输入 + 期望输出 + 来源候选 + hash；禁止删断言/
  整文件）把 live oracle 依赖改为**冻结金样**；参照 rapporteur 先例
  `test/roles/rapporteur/oracle-fixture.ts`（rapporteur-code，`21c0220a…`）。
- 结果：**32 tests / 32 pass / 0 fail / 0 skip / 0 todo**（原 30 例：模块单测 19 + 差分 11；
  金样化后差分 13 + 模块单测 19 = 32）。差分矩阵 107 项比较与 6 项 `KNOWN_DELTAS` 全部保留。

### 10.2 改动点

| 文件 | 变更 |
| --- | --- |
| `test/roles/convener/oracle-fixture.ts` | **新增**（1,634 行）：冻结金样 `ORACLE_CONVENER_SPEC` / `ORACLE_CONVENER_TRIO_TOOLS` / `ORACLE_CONVENER_SINGLE_TOOLS` / `ORACLE_DISPATCH_CASES`（54）/ `ORACLE_PREFLIGHT_CASES`（27）/ `ORACLE_GIT_ACTION_CASES`（9）/ `KNOWN_DELTAS`（6）+ `ORACLE_GOLDEN_PAYLOAD` + `ORACLE_GOLDEN_META`（来源候选 8 文件/切换后实测/模块身份/计数/覆盖映射/`payloadSha256`）。 |
| `test/roles/convener/convener-differential.test.ts` | 395 → **435 行**：改为金样对照（不再 import `governance-roles`/`role-tool-registry`/`workflow-preconditions` 等旧引擎，不读取旧文件字节）；矩阵/断言不弱化；新增稳定码/reportToRoleId 逐例断言、`KNOWN_DELTAS` 前缀一致性、金样 provenance 自洽（元数据/计数/覆盖/载荷哈希/无旧依赖扫描）。 |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.mjs` | **新增**（998 行）：一次性捕获脚本（`--out` 写 capture JSON；`--emit-fixture` 重新生成 fixture；含非已知差异 allow 位自校验）。 |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.json` | **新增**（1,730 行）：捕获期原始数据（spec/tools/54 dispatch/27 preflight/9 git-action/KNOWN_DELTAS/counts/来源身份）。 |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_fixture-update/convener-tests.log` | **新增**（40 行）：测试原始输出。 |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_fixture-update/typecheck.log` | **新增**（4 行）：全仓 typecheck 原始输出（exit 0）。 |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_fixture-update/convener-scoped-typecheck.log` | **新增**（0 行）：本角色模块 + 两个测试的 scoped typecheck（exit 0，无输出）。 |

**来源候选**：

- 捕获期（E1，2026-11-07）：`governance-roles.ts` 794 / `fddda111…`、`run-role.ts` 3333 /
  `026f5e99…`、`role-tool-registry.ts` 157 / `9aca72a5…`、`workflow-preconditions.ts` 1609 /
  `6c2349a5…`、`apply-journal.ts` 3723 / `fd778342…`（以上见本证据 §1）。
  `provider/runtime/tools.ts`、`model/runtime.ts`、`git-capabilities.ts` 的 E1 哈希未记录，
  按金样化时实测冻结，元数据 `capturedAt` 字段区分「E1」/「金样化」。
- 切换后（X-R4）：`governance-roles.ts` 649 / `c31274f9…`（E2-XR4 证据 §7.1）；
  `run-role.ts` 3483 / `655095b0…`（E2-XR4 证据 §1；X-R4 未改本文件，X-R1 起由编排单元修改）；
  `role-tool-registry.ts` 157 / `9aca72a5…` 与捕获期**逐字节一致**。
  `workflow-preconditions.ts`（1656 / `a7e50118…`）与 `apply-journal.ts`（3734 / `cc3342e6…`）
  在 E1 后由并发单元修改（非 X-R4），仅在元数据记录、**不参与期望值**。

写集扫描（`git status --short -- src/common/roles/convener test/roles/convener 角色卡/convener-code`）：

```
?? src/common/roles/convener/
?? test/roles/convener/
?? 角色卡/convener-code/
```

### 10.3 锚点变化（逐条）

| 文件 | 捕获期锚点（历史） | 切换后等价锚点（实测） | 说明 |
| --- | --- | --- | --- |
| `governance-roles.ts` | `159`（`CREATED_TASK_CLOSURE` 共享段）/ `178-202`（`CONVENER_CARD_TEXT`）/ `365-411`（内联规格） | `21-23`（模块 import）/ `246-262`（`BUILT_IN_ROLE_MATRIX.convener`）/ `356-358`（`specOf(convenerRoleModule)`）/ `423`（`BUILT_IN_ROLE_MODULES` 装配） | X-R4：内联卡/规格删除，改由模块 `specOf` 零复制投影；matrix 逐字迁入（D6）。差分期望值不受旧结构影响。 |
| `run-role.ts` | `1826-1830`（`directGovernance`/工具门控）/ `2347-2349`（`canRequestStableWrite`）/ `2859-2878`（`TRIO_CARD_KINDS`） | `3009`（`TRIO_CARD_KINDS.convener` 回退仍在） | X-R4 未改本文件；`TRIO_CARD_KINDS.convener` 仍为回退与迁移前源码 oracle，待编排 S2 删除。 |
| `role-tool-registry.ts` | `52-67`（`ROLE_TOOL_CATALOG`） | **不变**（`capture == switch`） | X-R4 未改。 |
| `workflow-preconditions.ts` / `apply-journal.ts` / `provider/runtime/tools.ts` / `model/runtime.ts` / `service/trunk/impl/git-capabilities.ts` | §10.2 捕获期/金样化锚点 | 旧行为锚点以字符串冻结在 fixture | 运行期不读取旧文件；锚点仅作历史记录。 |

**结构断言影响**：本差分测试的结构性断言只有 provenance 元数据；期望值均为纯数据 fixture，
不依赖旧文件结构/行号，故仅按上表做等价锚点冻结，无删除或放宽。

### 10.4 差分矩阵/断言未弱化

- 保留：规格 8 字段、卡文本 sha256/长度/行数、cards 1 项、tools trio 5 + single 2、dispatch
  54 组合（allow 位）、preflight 27 例（team-plan 12 + stable-write 5 + requirement-change 10）、
  git-action 9 例、`KNOWN_DELTAS` 6 类；合计 **107 项比较**（`ORACLE_GOLDEN_META.counts.fixtureComparisons`）。
- 强化：dispatch 由「仅 allow 位」扩为 **allow + 稳定码 + reportToRoleId** 逐例冻结；preflight
  由 allow 位扩为 **allow + 稳定码**；git-action 由「仅旧源码锚点」扩为 **9 例模块行为 + 历史锚点**；
  provenance 增加**载荷 SHA-256**、来源/切换身份交叉核对、无旧引擎 import/读取扫描。
- 已知差异逐项断言（新增差异即失败；均为模块更严格，非放宽）：
  1. `dispatch-existence`（2 例）：内置 `verifier` + `targetExists` 缺省/false；
  2. `dispatch-empty-target`（1 例）：空 `targetRoleId` + project + `targetExists:true`；
  3. `team-plan-fact-schema`（2 例）：plan 缺 `sha256` / `sha256` 非 64hex；
  4. `stable-write-empty-content`（1 例）：空 `content`；
  5. `dispatch-code-map`：旧粗粒度拒绝码 → 模块条件化稳定码（allow 位一致）；
  6. `git-action-no-pure-oracle`：Git 角色侧条件闭包于 Service/宿主，无纯函数 oracle。

### 10.5 测试、typecheck 与哈希

| 项 | 结果 | 原始日志（SHA-256） |
| --- | --- | --- |
| `node --test "test/roles/convener/*.test.ts"` | **32 tests / 32 pass / 0 fail / 0 skip / 0 todo**（exit 0） | `docs/change/2026-11-07_E2-XR4_fixture-update/convener-tests.log` 40 行 / `c93ed3b957bcb5c1dcaefb41a82a82a102df2a3eaad21f2788910ce3ee5e3cbe` |
| `npm run typecheck` | **exit 0** | `docs/change/2026-11-07_E2-XR4_fixture-update/typecheck.log` 4 行 / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| 本角色 scoped typecheck（模块 + 两个测试） | **exit 0** | `docs/change/2026-11-07_E2-XR4_fixture-update/convener-scoped-typecheck.log` 0 行 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

> 并发说明：全仓 typecheck 首次复跑时 `src/pipeline/orchestration/run-role.ts` 正被另一单元并发编辑
> （引用尚未创建的 helper，TS2552/TS2304；该文件不在本单元写集）。该单元落盘后复跑 **exit 0**；
> 上表为最终通过版本。`run-role.ts` 当前实测哈希已随并发 S2 修改前移，金样元数据中的
> `switch.changed.runRole` 只是 **X-R4 时点**记录，不参与运行时断言。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `test/roles/convener/oracle-fixture.ts` | 1,634 | `998f372f39ba47488f6232c7e8598b4c497b9716fe7ff57b0501a7c83230bc28` |
| `test/roles/convener/convener-differential.test.ts` | 435 | `53a9b94a7fd3a63ab6c576c05ef04a67030c336b7f5f6686b73953f0e08e5549` |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.mjs` | 998 | `768fd785a336f161d4dd883f84151c9e3f46ab0fee346fc44bd1e9de356db661` |
| `角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.json` | 1,730 | `956284c3b3587616320272d66ecbe8b01bac3598fd2b3b1a7f1da16400e83874` |
| `ORACLE_GOLDEN_META.payloadSha256`（冻结载荷） | — | `b82c364e96fd52e0f6754e819792e2a70695f16f4b2c6025edb12a3dbc258c34` |

> 本证据文件自身的行数/哈希由完成报告给出；不自引用。§2/§8 中 `convener-differential.test.ts`
> 的哈希为 **E1 交付期**值；金样化后的现行值以本节为准。`convener-module.test.ts` 未改
> （621 行 / `e67f1aca23369b9e1ffee591615c0fd1aedac06d007f842d375d4b2a0256937a`）；模块
> `src/common/roles/convener/index.ts` 未改（688 行 /
> `e125478a7809ae60a380c40236bfbc5bb6eaebd43819b40520a9a48bca6e7985`）。

### 10.6 遗留

1. 旧实现删除后本差分**无需再改**（已与旧文件解耦）；若后续要求更强漂移防护，可另加跨套件金样审计，不建议恢复 live 文件哈希。
2. 若 X-R4 后续 S2–S4（`run-role.ts` 工具注入/`cardKindsOf` 删除、dispatch、Service preflight 接入）改变模块行为或矩阵，须重取 fixture 并同步 `payloadSha256`，在本节登记原因。
3. `TRIO_CARD_KINDS.convener` 回退行尚在（编排 S2 删除）；删除后 `cards` 仍由模块/金样断言，预期无需重取。
4. 并发说明：`run-role.ts`、`workflow-preconditions.ts`、`apply-journal.ts` 等文件在 E1/X-R4 后由其他单元修改；元数据记录的是 X-R4/金样化时点实测，**不参与运行时断言**。
5. 本单元未提交/未推送；未运行真实模型；不判验收、不判 E2 pass。
