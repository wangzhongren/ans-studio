# 变更记录：角色粒度与 MapReduce — Map A 运行时核心契约冻结

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`（产品 flowId：`role-granularity-parallel-testing`；节点 N4/Map A）
- **执行者/角色**：运行时核心（独立固定角色上下文）
- **日期**：2026-10-22
- **状态**：`implemented-unverified`（契约与定向测试完成；未提交、未推送、未合并、未发布、**未验收**）
- **依据**：客户确认的策划方案 `docs/planning/2026-10-22_design_role-granularity-parallel-testing.md` §6.2/§8.1/§8.2/§9.1/§13 Q3 A；团队计划 `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` §4.3（运行时核心）/§5.4 N4/§6；实施前验收标准 `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` P1/P6/P13/P14。
- **授权写集（实际只动这些）**：`src/model/runtime.ts`、`test/runtime-core/governance-flow-metadata.test.ts`、`角色卡/运行时核心/api-spec.md`、`角色卡/运行时核心/memo.md`、本文件。`src/provider/runtime/{tools,schema}.ts` **未改**。
- **环境**：Windows 11 Pro 10.0.26300 / Git Bash 5.3.15；Node **v24.22.1**、npm **11.19.1**（每条命令先 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`）；仓库根 `C:\Users\51054\Desktop\work\ans-studio`。

## 1. 写前基线（2026-10-22 20:47 +08:00）

- `git rev-parse HEAD` = `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（与任务书/N3 基线一致）。
- `git status --short`（写前）：` M docs/communication/memo.md`、` M docs/planning/memo.md`；未跟踪验收标准/意图/方案/团队计划与测试角色基线证据（均为其他角色写区产物）。无已跟踪产品代码/测试改动。
- `git diff --name-only`（写前）：`docs/communication/memo.md`、`docs/planning/memo.md`（其他角色自身 memo，非本角色）。
- `git diff --cached --name-only`（写前）：空。

写前目标文件哈希（工作区）：

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts` | `120db534d7952f3320d34f21afe222067b2b744c` | `d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `becc8b899cae085fe0ccc8acbca82b5646bfbb43` | `ce2d018f4449398e27ac0184faf5b13be3138655b2bb5fc86885941e6495077b` |
| `角色卡/运行时核心/api-spec.md` | `c59ba9236c87b5131fab035e2917f6ea75d9af0c` | `cb56700814c0f8748875b48ab53a9a1ad296b8734f35b62bd48999becd166cc3` |
| `角色卡/运行时核心/memo.md` | `7eae69b60fea575a86194c6d133691c68bd7ecea` | `5a94020eed195a42b42ca77c4f6285d95a3321511f23e750c5ee4bbc92439a77` |

写前检查（供失败分类，不作为本阶段交付证据）：

| 命令 | 退出码 | tests/pass/fail/skip/todo | 耗时 | 备注 |
| --- | --- | --- | --- | --- |
| `node --test test/runtime-core/governance-flow-metadata.test.ts` | 0 | 11/11/0/0/0 | 149.4533 ms | 基线 |
| `node --test "test/runtime-core/**/*.test.ts"` | 1 | 290/283/3/4/0 | 14477.5765 ms | 3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 ×1、`session-store` ×2） |
| `npm run typecheck`（`tsc --noEmit`） | 0 | — | — | 0 诊断 |

## 2. 改动摘要

本阶段只做**契约层可选加法**；不实现 flow 静态校验/dispatch 前置/团队计划解析/桌面消费（Map B/C），不改任何枚举值、卡种、派发权或写权。

### 2.1 `src/model/runtime.ts`

1. **`FlowToolStepView`**（`flow_get` 步骤视图）增两个可选字段：
   - `parallelGroup?: string`：`map-<slug>` 或 `reduce`；仅承载，语法/同组无依赖/Reduce 覆盖等静态校验在编排。
   - `dependsOn?: string[]`：前置 step id；仅承载，环检测与 dispatch 前置 `done` 检查在编排。
   - `FlowToolView.steps: FlowToolStepView[]` 因此同步承载；**当前代码不存在独立的 `FlowToolStep` 符号**（实际为步骤视图 `FlowToolStepView` 与流程视图 `FlowToolView`，以符号名为准）。
2. **`FlowStepSupersedeFn`** 输入增同名可选 `parallelGroup?: string`、`dependsOn?: string[]`（新步骤可声明；服务端校验）。
3. **`GovernanceJudgeFacts`** 可选增：
   - `teamPlanSchema?: 1 | 2`（`1` = legacy 缺省、`2` = 团队计划 v2；方案 §5.1）。
   - `teamPlanModules?: string[]`（有界、去重的模块 id 摘要；只是机器摘要，不代表应用已做粒度语义判断）。
4. **未改**：`FlowToolStepKind`/`FLOW_TOOL_STEP_KINDS`（仍恰 `dispatch`/`customer-decision`/`artifact`/`acceptance` 四值，不新增 `map`/`reduce`）；`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 值；`GovernanceJudgeRequest.artifacts`/`GovernanceJudgeContext.artifacts`（沿用 `teamPlanPath`，**不新增** evidence artifact kind）；`FlowToolEvidence`、`FlowToolStatus` 等。
5. 所有新增字段可选：旧 flow/旧调用不填 ⇒ 字段缺席，类型与行为逐字不变。

**冻结给下游的签名（以实际代码为准）：**

```ts
interface FlowToolStepView {
  // 既有字段不变
  parallelGroup?: string;
  dependsOn?: string[];
}

type FlowStepSupersedeFn = (input: {
  // 既有字段不变
  parallelGroup?: string;
  dependsOn?: string[];
}) => Promise<FlowToolResult>;

interface GovernanceJudgeFacts {
  // 既有字段不变
  teamPlanSchema?: 1 | 2;
  teamPlanModules?: string[];
}
```

### 2.2 `test/runtime-core/governance-flow-metadata.test.ts`

新增 2 例（11 → 13），**未改**既有 11 例断言：

1. **flow step 可选字段（方案 A）**：`FlowToolStepView[]`/`FlowToolView` 可携带 `parallelGroup`/`dependsOn`（Map 与 Reduce 样例）；旧步骤不填时 `Object.hasOwn` 为 false；`Parameters<FlowStepSupersedeFn>[0]` 可携带两字段，旧替代输入不凭空出现字段；`FLOW_TOOL_STEP_KINDS` 逐字等于四值（不新增 kind）。
2. **judge facts 可选摘要**：`GovernanceJudgeFacts` 接受 `teamPlanSchema: 2`/`teamPlanModules`，旧 facts 形状仍合法且不凭空造值；`GovernanceJudgeRequest`/`GovernanceJudgeContext` 的 artifacts 仍仅用 `teamPlanPath`，两处同形且键集合恰为 `["teamPlanPath"]`（不新增 artifact kind）。

### 2.3 文档

- `角色卡/运行时核心/api-spec.md`：追加本阶段契约冻结段（字段、状态 `implemented-unverified`、下游未接线边界）。
- `角色卡/运行时核心/memo.md`：追加本阶段实施记录。

### 2.4 Provider（未改）

`src/provider/runtime/tools.ts`/`schema.ts` **零改动**：未改参数、schema、`required`、枚举、校验形状或 handler 行为；未新增 `cardKind`。方案 §9.3/团队计划 §4.3 要求默认不改，本层只在 Model 承载类型。

## 3. 检查命令与原始结果（写后）

| # | 命令 | 退出码 | 结果 | 耗时 |
| --- | --- | --- | --- | --- |
| 1 | `node --test test/runtime-core/governance-flow-metadata.test.ts` | **0** | `tests 13` / `pass 13` / `fail 0` / `skipped 0` / `todo 0` | 147.6203 ms |
| 2 | `node --test "test/runtime-core/**/*.test.ts"` | **1** | `tests 292` / `pass 285` / `fail 3` / `skipped 4` / `todo 0` | 14537.2503 ms |
| 3 | `npm run typecheck`（`tsc --noEmit`） | **0** | 0 诊断 | — |

- 第 2 条较写前基线 **+2 计 / +2 过 / 同 3 红 / 同 4 skip**；3 红与基线逐项相同，均为既有 Windows symlink EPERM 环境失败（`test/runtime-core/file-write-safety.test.ts`「D3 linked workspace root remains usable…」×1、`test/runtime-core/session-store.test.ts`「store: traversal…」×1、「store: native validation…」×1），**无本次新增失败**。退出码 1 由这 3 条既有环境红导致。
- 原始日志（本机临时文件，不随仓库交付）：`/tmp/rc-gfm-baseline.log`、`/tmp/rc-suite-baseline.log`、`/tmp/typecheck-baseline.log`、`/tmp/rc-gfm-after.log`、`/tmp/rc-suite-after.log`、`/tmp/typecheck-after.log`。
- 并行 transient（如实记录）：门禁引擎 worker 同期在写 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`（不在本角色写集，本角色未触碰）；上述 3 条命令均不涉及这些文件；`npm run typecheck` 在本角色改动完成后实测 0 诊断（截至本记录写盘时对方改动仍在进行；若最终复跑因对方未完成改动失败，属跨角色 transient，需在统筹合流后复跑）。

## 4. 写后候选哈希（工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts` | `4b96ae9db3f8f962913e2d010d5ab47bba110389` | `6d3299920982cb1191b7d9f18dc31b74d1b94e200c7acd8af7ec9bfc3cd54cfc` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `1ba4b621c682b3fb81e9cfe977ed2e8d2080697b` | `c7ef45c3e917de1570add346f01654ebc7030440025488fd67216864a3d8fa66` |
| `角色卡/运行时核心/api-spec.md`（文档） | `a331b868aaebf8c1cca96c494793ba97b50f6e09` | `85b689d2a7c85f2f27100f54beaee5de22450553d635354bf0159db4f205820f` |
| `角色卡/运行时核心/memo.md`（文档） | `5c45ee94cd3ae8f085143f76f4ea98fe4958ec6e` | `b248df9c76dc069f679ddc0860d62297996b842796dddd48233ca02b83a4ace7` |

（哈希按工作区当前字节计算；后两行为角色自身文档，不计入产品候选；本文件为自述记录，自哈希会随写盘变化，不列入。）

## 5. 改动范围（写后原始输出）

- `git diff --name-only`（本角色相关）：
  - `src/model/runtime.ts`
  - `test/runtime-core/governance-flow-metadata.test.ts`
  - `角色卡/运行时核心/api-spec.md`
  - `角色卡/运行时核心/memo.md`
- **非本角色但出现在同一工作树 diff 的并行改动**（Gate 2 写集属门禁引擎，本角色未写）：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`。
- **写前已存在、非本角色改动**：`docs/communication/memo.md`、`docs/planning/memo.md`。
- `git diff --stat`（全工作树，最终复核）：9 个已跟踪文件；其中本角色 4 个（`src/model/runtime.ts` +32/-4、测试 +103/-1、api-spec +8、memo +2），其余为并行/写前改动。
- `git diff --cached --name-only`：**空**（未暂存）。
- 越界声明：未修改 `src/model/{boundary,role,decision}.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/编排/`、`src/common/门禁引擎/`、`app/`、`test/编排/`、`test/门禁引擎/`、`test/桌面应用/`、`test/测试/`、`docs/scheduling/`、`docs/acceptance/`；未改角色 id/显示名/`GovernanceFunction`；未改 `FlowStepKind`/`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 值；未改 `package.json`/`package-lock.json`；未运行 `npm install`；未提交/暂存/推送/合并/发布。

## 6. 契约偏差与实施取舍

| 方案/任务条目 | 实施 | 偏差/说明 |
| --- | --- | --- |
| `FlowToolStepView` 增可选 `parallelGroup?`/`dependsOn?` | 已按此实现 | 无 |
| `FlowToolStep`/`FlowToolView` 同步 | `FlowToolView.steps` 经 `FlowToolStepView` 承载；无独立 `FlowToolStep` 符号 | **符号名偏差**：当前代码库不存在 `FlowToolStep`；按任务书「以符号名为准」覆盖实际存在的 `FlowToolStepView`/`FlowToolView` |
| `FlowStepSupersedeFn` 输入增可选字段 | 已按此实现 | 无 |
| `GovernanceJudgeFacts` 可选 `teamPlanSchema?`/模块摘要 | 增 `teamPlanSchema?: 1 | 2` 与 `teamPlanModules?: string[]` | 模块摘要形状任务书未冻结，取最小有界 `string[]`；如 Map B 需要不同结构，应按变更流程处理，不静默改形状 |
| `GovernanceJudgeRequest/Context.artifacts` 沿用 `teamPlanPath`，不新增 evidence artifact kind | 未改 artifacts | 无 |
| 不改 `GovernanceStepKind`/`GovernancePower`/`GovernanceDecisionKind`/`cardKind` 值，不新增 `FlowStepKind` | 未改任何枚举值 | 无 |
| 新增字段全部可选、向后兼容 | 全部 `?`；测试钉住旧形状不凭空出现字段 | 无 |
| Provider `{tools,schema}.ts` 默认不改 | 零改动 | 无；因此本阶段未提供模型侧 `flow_step_supersede` 的新参数入口（见 §7） |

## 7. 未做项 / 未验证边界 / 未解决问题

- **Map B/C 未开始**：`FlowStateStep`/`STEP_KEYS`/`parseFlowStateYaml`、`flow-service` 的 `viewOf`/`serializeFlow`/`flowStepSupersede`、`governance-gate` 的 `dependsOn` 前置 `done`、团队计划 v2 解析、judge facts 计算、桌面消费均未接线；**字段存在不等于门禁已实现**。
- **Provider 模型入口缺口（需统筹/Map B 决策）**：`flow_step_supersede` 工具仍不接收 `parallelGroup`/`dependsOn` 参数，`flow_get` 文本投影也不渲染这两个字段（Provider 默认不改）。本阶段只冻结 Model 类型；若 Map B 需要模型经工具声明/读取并行字段，需另按授权改动 `src/provider/runtime/{tools,schema}.ts`（参数/schema 形状变化），不在本次写集内。
- 未跑真实模型/凭据/网络；未跑全量 `test/**`、e2e、真实启动/演示（属 Reduce/测试角色）；未做 Windows symlink 修复（既有环境红）。
- 未验证下游消费方（编排/桌面）对新字段的实际使用；Model 契约冻结后由其属主按 Map B/C 接线并重跑调用方证据。
- 并行 transient：门禁引擎 worker 的改动可能使合流后的 `npm run typecheck`/全量回归结果变化；本角色只在自身写集与不受影响的 runtime-core 测试面给出证据。

## 8. 结论

Map A（N4）运行时核心契约冻结完成：`FlowToolStepView`/`FlowToolView`（经步骤视图）与 `FlowStepSupersedeFn` 可选承载 `parallelGroup`/`dependsOn`，`GovernanceJudgeFacts` 可选承载 `teamPlanSchema`/`teamPlanModules`；枚举值、Provider 形状与旧 flow 行为不变。定向测试 13/13、`typecheck` 0 诊断、runtime-core 无新增失败（292/285/3/4，较基线 +2 计 +2 过）。状态 `implemented-unverified`，等待统筹/独立验收按当前候选判定；本角色不声称已验收、已提交或已发布。
