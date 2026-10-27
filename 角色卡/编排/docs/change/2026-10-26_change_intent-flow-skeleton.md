---
id: intent-flow-skeleton
type: change
title: 意图交接时由应用创建通用流程骨架（幂等、不覆盖既有流程）
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [request-gate-review-orchestration-core, decision-card-orchestration]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 编排侧新增 ensureFlowSkeleton / 骨架步骤单一来源并经公共出口再导出；定向与编排套件、typecheck 通过；桌面调用端在途、跨角色 e2e 与独立验收未做
---

# 变更记录：意图交接时创建通用流程骨架（编排侧）

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排面实现与测试已跑；桌面调用端由桌面窗口角色在途落盘、跨角色 e2e 与独立验收未做，不代表通过）
- 来源：客户反馈——意图确认/交接后、提案或团队计划之前，角色 `flow_get` 报 not-found，无法登记
  contract-freeze，「流程文件不存在」看起来像流程故障。裁定：由**应用**在意图交接时自动创建
  `docs/flows/<flowId>.yaml` 的**通用骨架**，不新增步骤种类、不预设项目角色。
- 写集（实际只改以下文件）：
  - `src/common/编排/flow-service.ts`（新增骨架段）
  - `src/pipeline/orchestration/govern-session.ts`（薄再导出；标准工作流提示补骨架/一次性替换一句。同文件其余改动属并行批次，本批未动）
  - `test/编排/flow-service.test.ts`（骨架用例 5 例）
  - `test/编排/governance-session.test.ts`（标准工作流提示断言补 4 条，不成对即红）
  - 本记录、`changelog.md`、`feature-map.md`、`memo.md`、`api-spec.md`
- **未改** `app/**`、`src/model/**`、`src/provider/**`、`src/common/门禁引擎/**`、共享 i18n、其他角色资料；
  未 commit/push、未重启/停止运行中的应用、未碰 `.claude/` 与 `demos/`。

## 一、改动

### 1. `flow-service.ts` 新增应用侧流程骨架段

```ts
export const FLOW_SKELETON_STATUS = "skeleton";
export function buildFlowSkeletonSteps(): FlowStateStep[];   // 每次返回新数组/新对象
export interface EnsureFlowSkeletonInput { projectRoot: string; flowId: string; qualityTier: FlowQualityTier }
export interface EnsureFlowSkeletonResult { ok: boolean; created: boolean; revision?: string; error?: string }
export async function ensureFlowSkeleton(input: EnsureFlowSkeletonInput): Promise<EnsureFlowSkeletonResult>;
```

骨架步骤（全部 `pending`；`dependsOn` 只表达标准工作流顺序）：

| stepId | kind（既有枚举） | owner | dependsOn |
| --- | --- | --- | --- |
| contract-freeze | artifact | rapporteur | — |
| team-plan | artifact | convener | contract-freeze |
| appointment | customer-decision | convener | team-plan |
| role-cards | dispatch | nominator | appointment |
| role-readiness | artifact | convener | role-cards |
| acceptance-criteria | artifact | verifier | role-readiness |
| change-package | artifact | convener | acceptance-criteria |
| verification | acceptance（保留 id） | app | — |

- **不新增 `FlowStepKind`**；owner 只用内置治理角色 id（rapporteur/convener/nominator/verifier）或
  `app`（应用收口的 customer-decision / acceptance），**不猜项目角色、不预写 `delivery-*` / gate /
  `build-scaffold`**——这些由运营写团队计划后用一次 schedule-write 把骨架替换为完整流程。
- 顶层 `status: "skeleton"` 仅供人读（`flow-state.ts` 既有约定：顶层 status 不参与机器判定）；
  桌面据 `status === "skeleton"` 识别「已存在但只是骨架」，在提案接受后提示替换而不是直接写文件。

### 2. `ensureFlowSkeleton` 语义（钉死）

1. **已存在任何文件 ⇒ 绝不覆盖**：骨架、完整流程、甚至非法 YAML 一律 `{ok:true, created:false}`，
   原样保留（不解析、不比较、不改写）。存在性检查在 **per-project 串行队列**（`serialize`，与
   `createFlowService`/应用专用收口同一队列）内执行；同进程并发调用恰一个 `created:true`。
2. **写前复核**：候选经 `serializeFlow` → `parseFlowStateYaml` 校验（本骨架固定可过；防御未来改动）。
3. **路径/权限/原子写沿用既有约定**：`flowAbsPath`（`docs/flows/<flowId>.yaml`）、`mkdir -p`
   （`docs/flows` 不存在时建目录）、共享 `atomicWrite`（tmp + fsync + rename；失败不触碰目标）。
   读取失败非 ENOENT（目标被目录占用 / 无权限）或写盘失败 ⇒ `{ok:false, created:false, error}`，不抛。
4. **零副作用**：不写治理账本、不写客户决定、不写 `.ans`。
5. 输入 fail-closed：`projectRoot` 空、`flowId` 不匹配 `GOVERNANCE_SLUG_PATTERN`、`qualityTier`
   不属于 `prototype|production` ⇒ `ok:false` 且不落盘。

### 3. `govern-session.ts` 公共出口（薄再导出）

```ts
export { ensureFlowSkeleton, FLOW_SKELETON_STATUS } from "../../common/编排/flow-service.ts";
export type { EnsureFlowSkeletonInput, EnsureFlowSkeletonResult } from "../../common/编排/flow-service.ts";
// W6-A 块新增 parseIntentFrontmatter（桌面据此从意图 frontmatter 取 flowId/qualityTier）
```

桌面只经 Pipeline 公共出口消费，不直接 import 编排私有 `common/`；`buildFlowSkeletonSteps` 属
模块内部构造辅助，**不经公共出口暴露**。

### 4. `govern-session.ts::STANDARD_WORKFLOW_PROMPT` 补「流程骨架与一次性替换」

门禁引擎运营卡已收口「流程骨架与完整流程（仅初始创建 / 骨架替换）」一节；标准工作流提示是其同一事实
的**物理副本**（两处靠注释互指，改文案须同批）。补一句（与门禁卡逐字对齐关键约束）：

> **流程骨架与一次性替换（2026-10-26）**：应用可能在意图交接时已创建 `status: skeleton` 的通用流程骨架
> （只含 contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria /
> change-package / verification，不含项目角色与交付步骤）；运营 / Steward 写团队计划后，用一次
> `request_confirmation`（`cardKind=schedule-write`）把骨架**一次性替换**为完整流程（含项目角色、交付
> 步骤与 gate；保留 contract-freeze 已登记证据）；没有骨架时用同一确认初始创建；替换后改用 flow 工具
> 推进，其他角色不得直接写流程 YAML。

该句随 STANDARD_WORKFLOW_PROMPT 同时进入 trio 五职能与 single/su 的治理会话提示；不改变任何门禁判定。

## 二、测试（`test/编排/flow-service.test.ts`，5 例）

1. **创建与形状**：`created:true`、`revision` 与文件字节 sha256 同口径；YAML 过 `parseFlowStateYaml`；
   `version/qualityTier/status` 正确；八步 `[id, kind, owner, status]` 逐项断言；不含 `delivery-` /
   `gateKind` / `build-scaffold`；`dependsOn` 链逐项断言；不预建 `.ans`。
2. **绝不覆盖**：已存在骨架（并改 `qualityTier` 调用）字节不变；完整流程字节不变；非法 YAML 字节不变；
   后两种仍返回 `{ok:true, created:false}` 并交既有校验报错。
3. **输入 fail-closed**：非法 flowId（空 / `../evil` / `Flow-A` / `flow-` / 含空格 / 单字符）、非法
   qualityTier、空 projectRoot ⇒ `ok:false`、`created:false`、零落盘。
4. **写失败不破坏现场**：目标路径被目录占用 ⇒ 检查失败且目录保留；`docs/flows` 是普通文件 ⇒ 失败且
   文件内容不变。
5. **并发**：同一项目两个并发调用恰一个 `created:true`，另一个视为已存在；最终文件可解析。
6. **提示成对**（`test/编排/governance-session.test.ts`「标准工作流」用例）：trio 五职能与 single/su
   提示均断言含「流程骨架与一次性替换（2026-10-26）」标题、`status: skeleton` 通用骨架、一次性替换
   （含项目角色/交付步骤/gate + 保留 contract-freeze 证据）、无骨架时同一确认初始创建。

## 三、验证（2026-10-26，win32 / Node v24.22.1）

- `node --test "test/编排/flow-service.test.ts" "test/编排/flow-state.test.ts"` → **153 tests / 152 pass /
  0 fail / 1 skip**（skip 为平台条件用例）。
- `node --test "test/编排/governance-session.test.ts"` → **39/39 pass**（含新增 4 条提示断言）。
- `node --test "test/编排/**/*.test.ts"` → **1021 tests / 1019 pass / 1 fail / 1 skip**；唯一红为既有
  **Windows symlink `EPERM`**（`shell-authorized-routine.test.ts` 创建符号链接；基线一致，本批未触碰）。
- `npm run typecheck` → **exit 0**（全仓零错）。

## 四、跨角色注意（请 pm 转达）

1. **桌面窗口（在途接线，需对齐一处）**：工作树中 `app/desktop/session.ts::ensureIntentFlowSkeleton`
   已按 `{projectRoot, flowId, qualityTier}` 调用本函数、失败只诊断不阻断交接，形状与本契约一致
   （该接线属桌面窗口角色，本批未修改）；但其识别骨架用的是**字面量**
   `parsedFlow.flow.status === "skeleton"`（`app/desktop/interface.ts`）。
   建议改从 `govern-session.ts` 只读导入 `FLOW_SKELETON_STATUS`，避免常量与字面量漂移（本批不改 `app/**`）。
2. **运营 / Steward**：团队计划完成后用一次 `request_confirmation(cardKind=schedule-write)` 把骨架
   替换为完整流程（保留 contract-freeze 已登记证据）；骨架只是占位，不是完整流程，也不代表任何批准。
3. **替换方**：骨架的 `role-cards` 用 `dispatch`（与 `flow-state.ts` 步骤约定及桌面任命后派 Crew 写
   `dispatch.accepted{stepId:"role-cards"}` 一致；`completeRoleCardsStep` 同时支持 `artifact`，替换时
   按团队计划决定）；`contract-freeze` 为 `artifact`、owner rapporteur（契约产物由报告员写下）。

## 五、未做 / 风险

- 未做：跨角色 e2e（意图交接 → 骨架落盘 → 报告员 `flow_get`/登记 contract-freeze → 运营替换）、
  桌面字面量收敛、独立验收、commit/push。
- 残余风险：存在性检查与 `atomicWrite` 的 rename 之间是 **check-then-rename**——同进程写入已由
  per-project 串行队列消除交错，但**跨进程**恰好在此窗口创建同一 flow 文件时仍可能被骨架 rename 覆盖；
  应用是骨架的唯一写者、角色改用 flow 工具写流程，正常路径不触发（如需绝对保证，需共享原子写原语
  提供 no-clobber 发布，属 `src/common/shared/` 属主）。
- 骨架按 `qualityTier` 原样写入；意图 frontmatter 未给时桌面缺省 `production`（符合「默认生产级」）。
