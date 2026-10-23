# 变更记录：角色粒度（bounded context）与 MapReduce 并行——编排（Map B）

- 任务 ID：`2026-10-22-role-granularity-parallel-testing`
- 产品 flowId：`role-granularity-parallel-testing`
- 角色：编排（Map B；依赖 Map A 冻结契约）
- 日期：2026-10-22
- 状态：**implemented-unverified**（已实现、定向检查通过；未经独立验收，不代表通过）
- 依据：客户确认的策划方案 v1 `docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`（§4–§9、§13 Q1–Q12 推荐 A）、验收标准 `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`（P1–P6、P11、P14）、团队计划 `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md`（§4.3 编排、§5.4 N5、§11.5/§11.6）。
- 契约输入：Map A 冻结的 `FlowToolStepView.parallelGroup?/dependsOn?`、`FlowStepSupersedeFn` 输入可选字段、`GovernanceJudgeFacts.teamPlanSchema?/teamPlanModules?`；**未改** `src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/门禁引擎/**`。

## 一、改动摘要（按文件）

### 1. 新增 `src/common/编排/team-plan.ts`（团队计划 v2 单一解析/校验，Q9 A）

- 唯一实现：`parseTeamPlan(text, {flowId?})`；推荐集解析**复用** `governance-judge-facts.ts::parseRecommendedRoleIds`，不复制。
- frontmatter：`flowId`/`version`（正整数）/`riskTier`（T0–T3）/`recommended` 内联数组/`teamPlanSchema`/`modules` 内联数组（或固定行「模块：a、b」）。
- 模块清单表：`module | 职责 | 公开契约 | 架构来源`；恰好覆盖 `modules`，每行非空，架构来源须可追溯（`docs/`、`角色卡/`、`§`、`.md`、URL 等）。
- 角色表 14 列：`roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由`；别名 `module|boundedContext`、`contract`、`testSurface`、`parallelGroup`、`granularityRationale`；同名列重复/歧义拒绝；缺列拒绝。
- 校验 V1–V10（见 §二）；`warning`（单文件写集）与 `exception-review`（整层名/多模块有粒度理由）**不阻断发卡**，交 readiness。
- 写集原语导出给 V12：`parseWritesetCell` / `writesetsOverlap` / `isGovernanceWritesetPath`。
- V11：`validateTeamPlanFlowConsistency(plan, flow)`；仅 flow 已写时由 `run-role.ts` 调用。
- 公共出口：`src/pipeline/orchestration/run-role.ts` 再导出上述函数/类型（桌面不直接 import 编排私有 common）。
- 关键导出签名：
  - `parseTeamPlan(text: string, options?: { flowId?: string }): TeamPlanParseResult`
  - `parseTeamPlanModuleIds(text: string): { modules?: string[]; issues: TeamPlanIssue[] }`
  - `parseWritesetCell(raw: string): { entries: WritesetEntry[]; issues: string[] }`
  - `writesetsOverlap(a: WritesetEntry, b: WritesetEntry): boolean`
  - `isGovernanceWritesetPath(value: string): boolean`
  - `legacyTeamPlanRoleRowIssues(text: string, recommended: readonly string[]): string[]`
  - `teamPlanIssueMessages(result: TeamPlanParseResult, severity?: TeamPlanIssueSeverity): string[]`
  - `validateTeamPlanFlowConsistency(plan: TeamPlanParseResult, flow: FlowState): TeamPlanIssue[]`
- 结果形状：`TeamPlanParseResult = { ok; legacy; teamPlanSchema: 1|2; flowId?; version?; riskTier?; recommended; modules; moduleList; roleRows; issues }`；`roleRows` 含 `roleId/roleType/module/modules/primaryModule/duty/ability/writeset/writesets/contracts/testSurface/deps/dependsOnRaw/dependsOn/parallelGroup/group/apiSpec/apiSpecStatus/apiSpecReason/granularityRationale/isMap/isReduce`。
- legacy：缺省或 `teamPlanSchema: 1` ⇒ 只跑既有 v1 表格检查（推荐角色职责/能力/写集/依赖非空），不强制新字段、不强制 Reduce。

### 2. `src/common/编排/flow-state.ts`

- `FlowStateStep` 新增可选 `parallelGroup?: string`、`dependsOn?: string[]`；`STEP_KEYS` 严格加入两字段（未知字段仍拒绝）；`FLOW_STEP_KINDS` 不变（仍四值）。
- 解析：`parallelGroup` 只接受 `map-<slug>` / `reduce`；`dependsOn` 必须是步骤 id 数组，目标存在、无自依赖/重复/环。
- 静态校验（仅当 flow 使用了任一可选字段；旧 flow 零新增检查）：
  - 同一 `map-*` 组内步骤之间不得有依赖路径（[直接/传递]）；
  - 每个 reduce 步骤（`dispatch`/`artifact`，`acceptance` 除外）必须直接/传递依赖全部 `map-*` dispatch 步骤；
  - Map 步骤不得直接/传递依赖 Reduce 步骤；
  - 含 Map dispatch 步骤的新契约 flow 必须有 `contract-freeze`，且每个 Map dispatch 步骤都直接/传递依赖它；
  - `superseded` 步骤不参与 Map/Reduce 调度语义（与收尾门一致）；仍参与 dependsOn 存在性/环校验。

### 3. `src/common/编排/flow-service.ts`

- `viewOf` / `serializeFlow` 携带可选 `parallelGroup`/`dependsOn`；旧 flow 序列化**逐字不变**（新增测试用注入写盘逐字对照）。
- `FlowService.supersede` 输入新增可选 `parallelGroup`/`dependsOn`；新步骤写入这两个字段；幂等比较包含两字段（同字段重放 `idempotent`，字段不同仍 `step-exists`）。
- 候选 YAML 写前仍经 `parseFlowStateYaml`（非法字段/依赖图 ⇒ `invalid-flow`，不写盘）。

### 4. `src/common/编排/governance-gate.ts`

- `evaluateDispatchGate` 新增第 5b 步：步骤声明 `dependsOn` 时，全部前置必须 `status: done`，否则 `dependencies-not-done`（文案列出 `id（status）`）。
- 不改变派发权/动作；旧步骤无 `dependsOn` 不新增检查；旧 `.md` flow 不含该字段。
- 内部 `flowStepExists` 改为 `lookupFlowStep`（返回结构化步骤/flow，供前置检查）；YAML 坏行仍 fail-closed。

### 5. `src/pipeline/orchestration/run-role.ts`

- `teamPlanRoleRowIssues` 改为单一实现委托：legacy 走 `legacyTeamPlanRoleRowIssues`，v2 走 `parseTeamPlan` 的 error 条目（保留既有文案与「不完整」前缀）。
- `validateConvenerAppointmentCard`：v2 追加 V1–V10；flow YAML 已写时追加 V11；任何失败**不弹卡/不写账本**；返回值新增 `teamPlanSchema`/`modules`（供内部/未来消费）。
- `computeJudgeContext`（appointment）：用 `parseTeamPlan` 填入 `facts.teamPlanSchema` 与有界 `facts.teamPlanModules`（≤20 项、每项 ≤64B）；`artifacts.teamPlanPath` 不变，不新增 artifact kind。
- Pipeline 公共出口再导出 `team-plan.ts` 的解析/校验/写集函数与类型（Q9 A / P14；桌面 Map C 经此消费）。

### 6. `src/pipeline/orchestration/govern-session.ts`

- `STANDARD_WORKFLOW_PROMPT` 新增「团队计划 v2（角色粒度 / MapReduce）」「Map/Reduce 与 flow（方案 A）」「测试分片与证据（Reduce）」块。
- Convener 纪律：v2 frontmatter/模块清单/14 列/写集/依赖/并行组/粒度理由、readiness 新列与例外、Map/Reduce flow 与硬拦前置、Reduce 分片/manifest/演示。
- Crew 纪律：读 module/bounded context、公开契约、测试面、dependsOn、粒度理由；角色卡写 bounded context/契约/测试面/依赖；不写整层/纳米角色。
- 不改变派发权/客户入口；`已批准/已授权` 断言保持不出现。

## 二、V1–V11 覆盖

| ID | 实现 | 测试 |
| --- | --- | --- |
| V1 | frontmatter flowId/version/riskTier/recommended/modules（slug、非空、无重复、不含 `reduce`）；模块清单内联数组（块数组拒绝） | `test/编排/team-plan.test.ts`：正向、flowId 不一致、version/riskTier 非法、块数组、重复/保留 reduce、推荐集空/内置/缺行 |
| V2 | 14 列 + 别名 + 同名列重复/歧义 + 缺列 | 正向、别名、重复列/缺列 |
| V3 | 类型 new/changed/existing；推荐角色恰一行/角色行不重复；必填非空（粒度理由除外）；apiSpec required/not-applicable+理由 | 类型非法、空职责、重复行、apiSpec 无理由 |
| V4 | 模块清单恰好覆盖 modules；每模块恰一个 Map 覆盖；无孤儿/重复/未声明；Reduce 不计覆盖；多模块主模块=第一个 | 缺模块、孤儿/未声明、重复覆盖、Reduce 不计、多模块主模块 |
| V5 | 写集语法（精确路径/目录、分号、无通配符/散文/`..`/绝对路径）；治理路径拒绝；跨角色两两不相交；只读契约不算写集 | 通配符、散文、`..`、绝对、7 条治理路径、目录/文件重叠；写集原语单测 |
| V6 | 公开契约/测试面非空；Map 至少一个测试路径；Reduce 至少集成/e2e/装配检查；`internal` 需理由 | Map 无路径、Reduce 无检查、internal 无理由 |
| V7 | dependsOn 目标存在/无自依赖/重复/环；`依赖` 非空 | 目标不存在、自依赖、重复、两节点环 |
| V8 | 并行组语法；产品模块必须 map-*；reduce 必须 reduce；同组无依赖路径；Map 不依赖 Reduce；每个 Reduce 直接/传递覆盖全部 Map；至少一个 Reduce 角色 | 同组依赖、Map→Reduce、Reduce 未覆盖、组语法、缺 Reduce |
| V9 | 整层名/多模块无理由硬拒；有理由 exception-review；单文件写集 warning | frontend 无理由/有理由、多模块无/有理由、单文件 warning |
| V10 | 「五维判断/协调成本」章节存在且非空 | 缺章节、空章节 |
| V11 | Map 交付 `delivery-<主模块>`、owner、parallelGroup、dependsOn 精确 `{contract-freeze} ∪ 依赖角色 delivery-*`；Reduce 步骤覆盖全部 Map 交付；contract-freeze 存在 | 正向；缺交付/owner/组/deps 缺或多；Reduce 未覆盖；缺 Reduce 步骤；缺 contract-freeze；集成守卫正/负例 |

## 三、检查与证据

- 环境：Windows 11 Pro 10.0.26300；Git Bash；Node v24.22.1（PATH 前置 `C:\Users\51054\AppData\Local\Programs\nodejs`）。
- `npm run typecheck`：exit 0（无诊断）。
- `node --test "test/编排/**/*.test.ts"`：**769 tests / 768 pass / 1 fail / 0 skip**；唯一红为 N3 基线既有 `test/编排/shell-authorized-routine.test.ts:103`（Windows symlink EPERM，errno -4048）；基线 735/734/1 → +34 tests、+34 pass、同一既有红，零新增红。
- 定向 Suites：`team-plan` 17/17；`flow-state` 44/44；`flow-service` 24/24；`governance-gate` 22/22；`governance-session` 34/34。
- 只读跨角色回归（未改其文件）：`test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` 7/7；`test/测试/governance-e2e-auto/**` 68/68。
- 旧 flow 夹具：`flow-state`「旧 flow 不填可选字段」断言解析结果不含新字段；`flow-service` 用注入写盘逐字对照旧序列化文本。
- 候选哈希：见 §六（写后实测）。

## 四、偏差、限制与未决

1. **Provider 工具限制（已接受口径，非阻塞）**：按 §11.6，本轮不改 `src/provider/runtime/**`；`flow_step_supersede` 不转发 `parallelGroup`/`dependsOn`、`flow_get` 文本投影不渲染这两字段。服务层类型/视图/序列化已支持；初始 flow 通过 `write_file` 写 YAML 可携带。Map B/C 未证明必须扩 Provider 参数。
2. **V11 的 flow-parse 前置**：`run-role` 先 `parseFlowStateYaml` 再做 V11；flow 自身静态校验失败会以「流程 YAML 校验失败」退回 Convener，不弹卡。因此 V11 的部分分支（如缺 contract-freeze）在真实入口先被 flow-state 拦截；单测用直接构造 `FlowState` 覆盖防御分支。
3. **`superseded` 步骤**：不参与 Map/Reduce 调度语义（同收尾门），但仍参与 dependsOn 目标存在性/环校验；替代 Map 交付时需同步 Reduce 依赖（本轮不扩展 `flow_step_update` 参数）。
4. **v2 至少一个 Reduce 角色**：按 Q8 A 落实为 V8 硬规则；未新增固定测试角色。
5. **粒度黑名单**：含 `frontend/backend/web/server/client/ui/fullstack/all/common/shared/utils` 等；`web` 为通用层名，故 v2 正例模块使用 `storefront`。应用只做 tripwire，语义仍由 readiness 复核。
6. **极小写集**：仅对「单个文件」发 warning；「极小目录」不在应用侧做阈值判断（避免任意行数/文件数硬阈值）。
7. **judge 公共模块未改**：`teamPlanSchema`/模块摘要只在 `run-role.ts::computeJudgeContext` 写入 `facts`；`governance-judge-facts/evidence/prompt` 无改动，不新增 artifact kind/cardKind。
8. **未做**：Map C（桌面）、测试终验/全量 T3 回归、提交/推送/合并/发布。文档状态 `implemented-unverified`。

## 五、验收对照（供 Reduce/独立验收复核）

- P1/P2/P3/P4/P5：`team-plan.ts` + `team-plan.test.ts`（V1–V10 正负例、模块覆盖、写集、DAG、粒度）。
- P6：`flow-state.ts`/`flow-service.ts`/`governance-gate.ts` + 对应测试（可选字段、旧 flow 逐字不变、静态校验、前置 done、未新增 kind）。
- P11（编排面）：受影响 `test/编排/` 套件与 typecheck 原始输出；未见断言弱化。
- P14：单一解析器 `team-plan.ts`；`run-role.ts` 公共出口再导出；卡前守卫与写卡后校验同源（桌面 Map C 待接）。
- P13（编排提示面）：`govern-session.ts` 提示文案 + `governance-session.test.ts` 断言。

## 六、写后候选哈希

见回报中的 `git hash-object` + `sha256sum` 清单；本文件不复制易失哈希。
