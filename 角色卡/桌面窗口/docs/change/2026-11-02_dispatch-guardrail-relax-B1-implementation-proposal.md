# 桌面窗口 B1 实现提案：派发护栏只保留「谁能给谁派发」

- **任务 ID**：`2026-11-02-dispatch-guardrail-relax`（产品 flowId：`dispatch-guardrail-relax`）
- **角色**：桌面窗口（Desktop Window），独立上下文
- **阶段**：P1 实现提案（团队计划 §5.1/§5.3；P1 入口 = 实施授权 + V1 + B0 已满足）
- **日期**：2026-11-02
- **状态**：**`proposal-only, no code`**。本文只写 B1 的实现口径、调用协议与测试迁移；**未改任何产品源码/测试，未运行测试，未启动应用，未 commit/push/merge/release**。产出交项目管理（P1 审核）；审核结论非 `recommend approval` 前 B1 不开工。本文不改变 P1.1 的方案语义、Q1–Q5、AC 或写集；若审核发现方案/写集/档位实质变化，停止并回报统筹。
- **修订**：**Revision 2（2026-11-02）**，按 P1 审核记录 `角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md`（复审后 **323 行** / SHA-256 `597a585978fc14f28863c2cdd85fb159fe8814461d34d8986b4522203a515003`，含 Revision 1 复审）修订；Revision 1 为 528 行 / SHA-256 `aef0c4cc5a913e30597093a8d5036dfa8ac3915a4c65c7d0f34e58d40db2f284`；Revision 0 为 412 行 / `6b89f2d58b8c18ef1f9219110e4799129390b07a16fcb62b69eb99d794edd403`。逐项 P1-R 落点见 §12。
- **写入路径**：`角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation-proposal.md`（本阶段唯一写盘文件；未更新 memo/其他角色文档）。

---

## 1. 输入与基线

### 1.1 代码与工作树基线

| 项 | 值 | 来源 |
| --- | --- | --- |
| 分支 / HEAD | `feat/flow-improvements-wave1` / `c80f4944c3421554fcbd35f8570cedd3e2119a0a` | 本提案只读实测（2026-11-02） |
| HEAD tree | `689a49580fd7e79a0bfae1be343597b793967f71` | 同上；与 B0 一致 |
| 产品/测试工作树 | `git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空 | 同上；与 B0 §3.1 一致 |
| 既有非产品改动 | 6 个已跟踪管理/治理文件 + B0 时的 5 个未跟踪管理文档 + B0 证据目录；桌面窗口 `boundary.md`/`boundary.yaml` 已含 H1 的 B-1/B-2 两条测试授权；本提案写盘时另有并发 A1 提案与本提案（均未跟踪） | B0 §3.1；本提案只读核对 boundary 第 74–75 行 |

### 1.2 治理输入（只读；行数/SHA-256 实测）

| 文档 | 行数 | SHA-256 |
| --- | --- | --- |
| 客户确认方案 P1.1：`docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 团队计划 v1：`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| 验收标准 V1：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` |
| 独立复核（P1.0 F1–F12 + P1.1 R1–R4）：`docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| B0 基线：`角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |
| P1 审核记录（含 Revision 1 复审；结论 `needs revision`）：`角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md` | 323 | `597a585978fc14f28863c2cdd85fb159fe8814461d34d8986b4522203a515003` |
| 沟通记录（B0 快照，含实施授权小节）：`docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md` | 124 | `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f`（管理记录，可能继续追加；授权以沟通确认小节为准） |

基线与引用关系：方案 §5.2/§5.3.3/§5.4/§5.5/§7.3/§8.2、团队计划 §4.3（B1 写集）/§6.1–§6.3（R1/R2/R3）/§7.3（证据）、V1 §3–§4（AC 与 R1/R2/R3 核对项）、P1 审核记录 §4.1/§5/§6（返工要求与裁决）为本提案的硬约束；复核 R1–R4 均按团队计划 §6 的裁决落实（R1 调用时序、R2 锚点三分、R3 证据回退、R4 只引用不代改）。

**并发输入（只读引用）**：编排 A1 提案 **Revision 1** `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md`（**684 行** / SHA-256 `2d7335d89b170af42f5ef8979b27f201ebedf3629f8078859c47680012e0a131`）。A1 最终冻结哈希以 A1 退出报告为准；B1 开工时复测并绑定 A1 冻结两文件（`workflow-preconditions.ts`/`dispatch-advisories.ts`）的 blob+sha256。B1 只按 A1 最终冻结版消费，不修改 A1 文档。**版本说明**：本提案写盘时 A1 工作树已进一步并发修订（707 行 / `75a184b27d0b0941367eeb2107c16e1aab13535a1876b7895c48e8ccc9f212e7`）；本提案依据仍是 P1 复审快照 684 行 / `2d7335d8…`，最终以 A1 退出报告冻结版为准。

### 1.3 B1 目标文件写前基线（`git hash-object` + `sha256sum`）

| 文件 | blob | sha256 |
| --- | --- | --- |
| `app/desktop/session.ts` | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` |
| `test/桌面应用/chain-enforcement.test.ts` | `9c99ccc7e10ffd3749a2b57f54bd5024f0312765` | `9a17307995f3bba32839577d8714d7e3d5910232625a76fb0258a6b8a84dd1b2` |
| `test/桌面应用/star-routing.test.ts` | `23fef02d5db560911d2b359f13a77301854b3b86` | `0c42a33acaf55a4539884b1697d775ed990a570fbafa972e94ef3537df036471` |
| `test/桌面应用/rejection-copy.test.ts` | `24ce83df85adb4a5dd54a45b7a1d4ab199e4c122` | `fb75d9f8e4eb4c28a59e5a4ed00994da112dfca0cf480e11750a75991c40e13a` |
| `test/桌面应用/run-pin.test.ts` | `7e4ddabbccfa9194d6a292ef7a3646283279d802` | `bdf1fb6ef035594835a7e2af0c59a09e99815ff46417d114f1f3dba213c006bc` |
| `test/桌面应用/run-change-trigger.test.ts` | `d37871f3dd6d555ac5b159f194aaf3d4b17e9894` | `142c42990bb7581aea89cd2daa9aa9c927a94b53bdfdda5777e612484df1fd9a` |
| `test/桌面应用/run-change-entry.test.ts` | `01c5e92d8e4363f381d1f3f32704a01964959dfd` | `bc0a9e51b2c7c819039d1fc35a29a1fe1fa27e5564a6dc500ad7125e39d3fe91` |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | `2b799498c572fd55111a868caa5ebda9e20fd3dc` | `fdca2a3f592db475c67f13d85a9f0d410e25131e63f6aee3fdc7d82d17f89425` |

B0 受影响套件基线：桌面 7 文件 **50 tests / 50 pass / 0 fail / 0 skip / 0 todo**（B0 §3.4 套件 B）。B1 迁移后测试数预计增加（新增 R1/R2/R3 与 verifier/文件型模块用例），以实际输出为准；不得删除测试、新增 skip/todo 或放松断言。

---

## 2. R1 调用协议与 `routeStarDispatch` 新调用图

### 2.1 A1 依赖：编排冻结的 API（B1 开工前）

**A1 提案（只读引用）**：`角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md`（**Revision 1：684 行 / SHA-256 `2d7335d89b170af42f5ef8979b27f201ebedf3629f8078859c47680012e0a131`**）。A1 最终冻结哈希以 A1 退出报告为准；B1 开工时复测并绑定 `workflow-preconditions.ts`/`dispatch-advisories.ts` 两文件 blob+sha256，只按最终冻结版接线。B1 不修改 A1 文档。

```ts
// src/common/编排/dispatch-advisories.ts（A1 提案 §2.1 候选形状）
export type DispatchAdvisoryCode =
  | "flow-required" | "intent-missing" | "proposal-missing" | "roster-missing"
  | "roster-modules-missing" | "env-bootstrap-missing" | "d3-missing"
  | "d3-selected-cards-incomplete" | "handoff-missing" | "run-legacy-readonly"
  | "run-pin-required" | "run-pin-failed" | "run-role-missing" | "run-ledger-unavailable"
  | "run-document-hash-mismatch" | "run-pinned-roster-invalid"
  | "versioned-doc-baseline-violation" | "module-required" | "module-missing"
  | "module-not-owned" | "module-path-invalid" | "module-path-outside"
  | "target-not-nominated";
export type DispatchAdvisory = { code: DispatchAdvisoryCode; message: string };
export function collectDispatchAdvisories(input: DispatchPreflightInput): DispatchAdvisory[];

// src/common/编排/workflow-preconditions.ts（A1 提案 §2.1 候选形状）
export type DispatchPreflightInput = {
  // ...既有字段不变；新增/调整：
  targetExists?: boolean;          // 复合入口兼容字段；旧调用方可省略，窄输入必填
  chiefRoleId: string | null;      // 由 string 放宽
  run?: {
    state: "draft" | "pinned" | "legacy";
    runId?: string;
    roles?: readonly string[];
    /** P1-R-08 (a)：pinned run 声明的模块 id 清单；仅 B1 传 pinned 事实。 */
    modules?: readonly string[];
  };
  /**
   * 会话层观察到的 run 事实（R2；纯逻辑不读盘、不推断）。
   * P1 §5.3 有条件接受为「实施级可选事实扩展」；仅 B1 传入，旧调用方省略。
   */
  runFacts?: {
    /** run 读取/草案创建失败，或 handoff 无 runManifest/flowId。 */
    ledgerUnavailable?: boolean;
    /** handoff pin 尝试失败（run 保持 draft/缺失）。 */
    pinFailed?: boolean;
    /** verifyPinnedRun 发现文档哈希不一致。 */
    documentHashMismatch?: boolean;
    /** loadPinnedRoster 读取/校验失败。 */
    pinnedRosterInvalid?: boolean;
  };
  /** 会话层事实：verifyVersionedDocBaselines 的违规路径；非空即 advisory。 */
  versionedDocBaselineViolations?: string[];
};
export type DispatchAuthorizationInput = Pick<
  DispatchPreflightInput,
  "fromRoleId" | "targetRoleId" | "targetBuiltIn" | "chiefRoleId" | "convenerRoleId"
> & { targetExists: boolean };
export type DispatchAuthorizationFailure = {
  ok: false; code: string; message: string; rejection: MechanicalRejection;
};
export type DispatchAuthorizationResult = { ok: true } | DispatchAuthorizationFailure;
export type DispatchPreflightResult =
  | { ok: true; advisories: DispatchAdvisory[] }
  | DispatchAuthorizationFailure;
export function evaluateDispatchAuthorization(input: DispatchAuthorizationInput): DispatchAuthorizationResult;
export function evaluateDispatchPreflight(input: DispatchPreflightInput): DispatchPreflightResult;
```

要求与边界：

- `evaluateDispatchPreflight` 进入复合逻辑后的**第一个判定步骤**是 `evaluateDispatchAuthorization`（`Pick` 收窄输入）；不得有第二份硬授权谓词。B1 的早调用与入口内部调用是**同一个导出函数**；B1 只在 `routeStarDispatch` 调窄步骤 + collector，不调复合入口（避免第二次授权评估）。P1-R-11：不按字面要求「函数第一行」做脆弱断言。
- `src/common/编排/workflow-preconditions.ts` 与 `dispatch-advisories.ts` 之间只允许 `import type` 互相引用类型；`verbatimModuleSyntax` 擦除类型导入，运行期无环（P1-R-10）。
- `targetExists`：复合输入可省略（旧调用方兼容，A1 提案 §2.2 的私有唯一解析 `resolveTargetExists(input) = input.targetExists ?? input.targetCardFound`，fail-closed）；窄输入必填。**P1 §5.2 裁决**：B1 在 `routeStarDispatch` 始终显式传 boolean，不依赖回退；B1 迁移 `rejection-copy` 时对存在性分支传显式 `targetExists`（新硬负例传 `false`）。
- `runFacts`/`versionedDocBaselineViolations`/`run.modules`：**P1 §5.3/§5.4 有条件接受为实施级可选事实扩展**（不是产品语义/schema/写集/档位变化）；A1 冻结声明须标注为何超出方案 §5.7 字面，A1 为每个 fact 至少一正一负；B1 只在观察到时设置，不把「未读到」误写成 false 事实。
- `TaskCreatedEvent`/`DispatchReceipt`/`RunManifest` 形状不变；`task-state.ts`/`run-manifest.ts`/`handback.ts` 不改。

**advisory 产出位置（P1 §5.4 裁决，必须落入实施）**：

- `collectDispatchAdvisories` 是**全部 advisory code 的唯一产出点**；B1 只收集事实、合并/截断（最多 3 条 + 「另有 N 项」）、呈现、诊断，**不在会话层追加同类 advisory、不写第二套文案/诊断/去重逻辑**。B1 的「同 code 去重」仅为展示层防御；A1 必须保证同一场景不重复产出同一 code（R2 组合 `run-pin-failed` + `run-pin-required` 是不同 code，允许并存）。
- 文案由 A1 `dispatch-advisories.ts` 统一（中文），B1 不另写。
- 规则：状态事实优先**最新**名单/D3（`chainFacts.roster`、`chainFacts.d3Selected`）交给 collector；pinned roster/D3 只用于 run 专属 advisory 与模块元数据（A1 提案 §2.4）；每条链只报首个未满足项由 A1 保证。
- **P1-R-01 组合与顺序**：pin 尝试失败时至少产出 `run-pin-failed`；若 run 仍为 draft（pin 失败后通常仍在 draft），同时产出 `run-pin-required`；固定顺序 `run-pin-failed` → `run-pin-required`。A1 删除「pinFailed 时不再报 run-pin-required」的互斥规则并补组合矩阵；B1 只按固定顺序呈现/诊断，不自行补 code。

### 2.2 `routeStarDispatch` 新调用图（HEAD c80f494 行号为锚）

```text
routeDispatch :5770（trio 来源身份不变 :5786-5803；single 路径不变）
└─ routeStarDispatch :6067
   1. payload 解析 :6089-6098；幂等键/读取/抑制 :6099-6125（只读；不建任务、不投递）
   2. refreshListingNow + 目标信息 :6130-6137
      targetRole / targetBuiltIn / targetExists / convenerRoleId / chiefRoleId（允许 null）
   3. 【硬授权】evaluateDispatchAuthorization（纯函数）→ ok:false ⇒ fail() 返回
   4. chainDispatchFacts :6138-6149（只读；读失败按缺事实）
   5. run 只读/记账 :6150-6178（可能写：ensureDraftRun；仅本步之后；事实记入 `runFacts`）
   6. handoff pin :6244-6277（可能写：pinRun；仅本步之后；失败记入 `runFacts.pinFailed`）
   7. verifyVersionedDocBaselines :6225-6242（只读；违规记入 `versionedDocBaselineViolations`）
   8. collectDispatchAdvisories（纯函数；主路径）+ 同 code 去重合并
   9. task.created 构造 :6278-6312（锚点/模块字段按 §3/§5）+ appendTaskState :6313-6318（失败仍 fail）
  10. planDispatchDelivery :6331-6349（保留；拒投仍 task.closed(rejected)、运行文案逐字不变）
  11. openInternal / enqueueDelivery / drainQueue :6353-6401（失败语义不变）
  12. 成功回执 :6393-6401 追加 advisory 摘要；emitDeliveryNote 一行；诊断逐 code
```

关键顺序与副作用：

1. **硬授权在任何 run 账本写入之前**：`evaluateDispatchAuthorization` 位于 `:6137` 之后、`chainDispatchFacts`/`findActiveRun`/`ensureDraftRun`/`pinRun` 之前。硬拒绝路径只发生 `readTasks`/listing 读取与 `emitDeliveryNote`，**不调用 `newTaskId`、`appendTaskState`、`openInternal`、`ensureDraftRun`、`pinRun`**。
2. **硬授权事实最小化**：仅 `fromRoleId/targetRoleId/targetBuiltIn/targetExists/chiefRoleId/convenerRoleId`；`targetRole` 与 `targetBuiltIn` 来自 `:6131-6133`，`targetExists = targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId)`（方案 §5.3.1），并以**显式 boolean** 传给窄输入（不依赖 A1 的兼容解析）。`listing` 不可用时项目 worker 目标按 `targetExists=false`（硬 `target-card-missing`，不猜）；内置目标仍由注册表判定。
3. **单一公开入口保持（P1 §5.1 已接受）**：`evaluateDispatchPreflight` 仍是唯一「授权 + advisory」组合入口；B1 因 R1 的时序要求分两次调用同模块导出的两个纯步骤（早授权、晚 advisory）。这不是第二份谓词——入口内部复用同一 `evaluateDispatchAuthorization`，`collectDispatchAdvisories` 永不返回 `ok:false`。P1-R-03：A1 须把其 §3.2 调用图重排为「run 记账/handoff pin → `verifyVersionedDocBaselines` → `collectDispatchAdvisories` → `task.created` → 投递」，与本调用图逐项一致；B1 不按 A1 旧文本实现。
4. **advisory 不反向影响硬授权**：状态事实/run 读取失败按缺事实处理，不抛到调用方；`collectDispatchAdvisories` 无 `ok:false`。按 P1 §5.4，advisory 只由 A1 collector 产出；B1 不追加同类 advisory，只做合并/截断/呈现/诊断。
5. **幂等位置不变**：仍在 `:6099-6125`（刷新/授权之前），作为业务去重；不创建任务、不投递、不产生 run 写入。
6. **收窄 `:6086-6088` 防御（P1-R-05）**：只保留 `fromRoleId === targetRoleId`（自派），删除 `targetRoleId === chiefRoleId` 分支；「target=幕僚且来源非幕僚」交给矩阵（convener→chief 由 `evaluateDispatchAuthorization` 返回 `convener-target-forbidden`）。自派仍用现有「不能派发给幕僚自己」文案；防御位于硬授权之前、不写账本，不构成第二条目标判定。
7. **调整 `:6135-6137` 的无条件 `chiefRoleId === null` 早退**（A1 提案 checklist 第 34 行）：`chiefRoleId` 允许 null；不再因幕僚缺失误伤运营来源。来源无法确定时由 `evaluateDispatchAuthorization` 的 `unknown-source` 拒绝（不在会话层另写来源谓词）；`handoffDispatch`/`stepId`/`created.from` 全部 null 安全。
8. **`targetCardFound` 仅作为 advisory 事实**：chief→convener 仍传 `chainFacts.selectedCardsFound`；convener→worker 传 `targetRole !== undefined`。硬目标存在性改由 `targetExists` 判定。
9. **legacy advisory 事实（P1-R-02 裁决 (a)）**：`hasLegacyFlowTask === true` 时，传给 collector 的 `run` 事实固定为 `{state:"legacy"}`（仅 advisory 事实），同时保留本地 `runManifest`（可能是本次 `ensureDraftRun` 创建的 draft）用于任务锚点；**不把 legacy 当锚点**。A1 的 `run` 字段注释/冻结声明同步写明。

### 2.3 硬拒绝零副作用与测试落点（R1-a/R1-e）

硬拒绝必须同时满足：`tasks.jsonl` 行数不变、目标会话未打开/未投递、`.ans/runs` 无新 draft（不产生/不领养）。测试落点：

| 硬拒绝类 | 落点 | 可核对断言 |
| --- | --- | --- |
| 运营→非质检内置且带 flowId（本会触发“先 ensureDraftRun 再授权”的回归） | `star-routing.test.ts` 新增 | `ok:false` + `convener-target-forbidden`；`readTaskState().records.size` 不变；`h.sent.<target>` 为空；`listRunManifestsResult(root).manifests.length === 0`（或 `.ans/runs` 不存在） |
| 幕僚→项目 worker（带 flowId） | `star-routing.test.ts` 扩充既有 :110 用例 | 同上，`chief-to-project-forbidden` |
| 自派（带 flowId） | `star-routing.test.ts` :132 用例 | 会话层 `:6086` 仅拦 `from === target`（收窄后）；保持现有 `/不能派发给幕僚自己/` 文案；无任务行/会话/run；纯函数 `self-dispatch` 由 A1 矩阵覆盖 |
| 运营→幕僚（target=chief、来源非 chief） | `star-routing.test.ts` 新增（P1-R-05） | 矩阵返回 `convener-target-forbidden`；无任务行、无目标会话、无 draft run；不得被 `:6086` 提前改成「不能派发给幕僚自己」 |
| 未知来源（非 chief/convener） | `star-routing.test.ts` 新增：测试内以窄类型 cast 直接调用 `mgr.routeDispatch(root, "demo", "worker", payload)`（P1-R-07(g)；或走接口层注入） | `ok:false`（`routeDispatch` 来源校验）；`readTaskState().records.size` 不变；目标会话未打开；无 run manifest；不得只以纯函数 `unknown-source` 代替桌面证据 |
| 运营→不存在的项目 worker | `star-routing.test.ts` 新增（P1-R-07(a)） | `ok:false` + `target-card-missing`；任务行不变；目标会话未打开；无 draft run |
| 调用顺序 | 上述「运营→非质检内置且带 flowId 无 draft run」即顺序回归：若把 `ensureDraftRun` 放在授权前，该用例必现 draft | `ensureDraftRun` 未被调用或 run 目录无新记录 |
| `run-required` 正例不回归 | `run-pin.test.ts` :176/:438 既有正例 | 有 flowId 时 draft/pinned 锚点照旧 |

---

## 3. R2：pin/draft 锚定三分口径

### 3.1 handoff 三分（`session.ts:6244-6277`，早退 `:6245-6247`）

| handoff 事实 | 处理 | advisory | 任务锚点 |
| --- | --- | --- | --- |
| `runManifest === undefined`（无 runManifest / 无 flowId / run 读取或 `ensureDraftRun` 失败） | **不再 fail**；跳过 pin；任务照常创建 | `run-ledger-unavailable`（无 runManifest 口径；无 flowId 时同时有 A1 的 `flow-required`） | **省略** `flowId`/`runId`/`runState`；`stepId=project-handoff` 仍写 |
| run 为 **draft**，`pinRun` 失败（缺 D3/缺文档等） | 受理；run 保持 draft；不伪造 pinned | `run-pin-failed` → `run-pin-required`（顺序固定；run 仍未 pin） | **锚定已有 draft**：`runId` + `runState:"draft"` +（有 flowId 时）`flowId` |
| run 为 **pinned**，`verifyPinnedRun` 失败/violations | 受理；不重写 manifest/文档 | `run-document-hash-mismatch` | **省略**三者（不锚定校验失败的 pinned run） |
| pin 成功但 **post-pin verify / loadPinnedRoster 失败** | 受理；不重写、不回滚 | `run-document-hash-mismatch` / `run-pinned-roster-invalid` | **省略**三者（不得锚定失效 pinned；也不得伪称 draft——磁盘上该 run 已是 pinned） |
| pin 成功且 verify/roster 成功 | 受理；正常交接 | 无 pin 失败 advisory | 合法 pinned 锚定（见 §3.2） |

`task.created` 的 `dispatchStepId` 规则不变：`fromRoleId === chiefRoleId && targetRoleId === convenerRoleId` → `"project-handoff"`；因此无锚点 handoff 仍可被后续 `chainDispatchFacts.handoffFound` 按 stepId 识别（AC-3.3/R2-b）。

**决策矩阵（P1-R-12；取代旧「二选一」表述）**：

| handoff/run 事实 | advisory（A1 collector 唯一产出，固定顺序） | 任务锚点 |
| --- | --- | --- |
| `runManifest === undefined`（无 flowId / 无 runManifest / run 读取或 `ensureDraftRun` 失败） | `run-ledger-unavailable`（无 flowId 时另有 `flow-required`） | 省略 `flowId/runId/runState`；`stepId` 仍写 |
| `runManifest` 为 draft 且 `pinRun` 尝试失败（P1-R-01） | `run-pin-failed` → `run-pin-required`（至少前者；run 仍 draft 时两者并存、顺序固定） | 锚定已有 draft |
| `runManifest` 为 draft 且未尝试 pin（`dispatchFlowId` 缺失的异常态） | `run-pin-required` | 锚定 draft（有 flowId 时写 flowId） |
| `runManifest` 为 pinned 且 `verifyPinnedRun` 失败/violations | `run-document-hash-mismatch` | 省略三者 |
| pin 成功但 post-pin verify/roster 失败 | `run-document-hash-mismatch` 或 `run-pinned-roster-invalid`（按实际） | 省略三者 |
| pinned 合法但目标**不在已声明的** `run.roles` | `run-role-missing` | 省略三者 |
| pinned 合法、带 `moduleId` 但模块**不在已声明的** `run.modules`（P1-R-08 (a)） | `module-missing` | 省略三者 |
| pinned 合法但 `run.roles === undefined` / `run.modules === undefined`（P1-R-08-R1） | **无 run 专属 advisory**（undefined 视为无事实；不产 `run-role-missing`/run 专属 `module-missing`） | 省略三者；B1 证据记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制 |
| `hasLegacyFlowTask === true`（P1-R-02 裁决 (a)） | `run-legacy-readonly`（collector 的 `run` 事实固定为 `{state:"legacy"}`，仅 advisory 事实）；任务锚点仍用本地 `runManifest` 的 draft | draft（若 `ensureDraftRun` 成功）；旧 legacy 记录不改写 |

- **P1-R-08-R1 口径（对齐 A1 保守口径）**：B1 采用 (a) 最小可选事实 `run.modules?: readonly string[]`（仅传 pinned 模块 id）；但 `run.roles === undefined`/`run.modules === undefined` 视为**无事实**：A1 collector **不产** `run-role-missing`/run 专属 `module-missing`，B1 **不锚定**该 pinned run，并在证据/实施记录中记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制。B1 **不得**在会话层补产同类 code。若 A1 复审改选「undefined 也产出」的备选，则 A1 须修订契约并重新冻结，B1 跟随。
- **无效 pinned 的事实传递（P1-R-16）**：`documentHashMismatch`/`pinnedRosterInvalid` 时，B1 **不向 collector 传 `run`**（只传 `runFacts` 对应事实），由 collector 产出对应 run advisory；不在 collector 增加「抑制 run-role/module」的额外规则。
- **legacy 与锚点分离**：collector 的 `run` 事实是 advisory 用途；`task.created` 的锚点只读本地 `runManifest`（draft/pinned），两者不混用；旧 legacy 任务记录保持可读、不改写。

### 3.2 锚点规则（`task.created` 构造，`:6293-6312`）

- **draft run 直接锚定**：`runManifest.state === "draft"` → 写 `runId`、`runState:"draft"`、`runStage`（如有）；`flowId` 仅当 `chainFacts.flowId !== undefined` 时写（pending draft 保留既有「有 runId 无 flowId」形状，`task-state.ts` 只在 flowId 存在时要求 run）。
- **pinned run 仅在全部满足时锚定**：
  1. `verifyPinnedRun` ok 且 `violations.length === 0`；
  2. `loadPinnedRoster` ok；
  3. 目标覆盖：目标为内置角色，**或**目标项目 worker 满足 `run.roles !== undefined && run.roles.includes(targetRoleId)`；`run.roles === undefined` 视为未证明覆盖：不锚定，**不产 `run-role-missing`**（P1-R-08-R1），B1 证据记录限制。
  4. 模块覆盖：若带 `requestedModuleId`，该模块存在于 **pinned roster**（`loadPinnedRoster` 成功的结果）；collector 的 `run.modules` 由 B1 取同一 pinned roster 的 `modules[].id` 传入。若无法取得（roster 不可读/manifest 未声明），不锚定且**不产 run 专属 `module-missing`**（由 `runFacts.pinnedRosterInvalid` 或证据限制表达），不另行推断。
- **其余情况省略三者**（`flowId`/`runId`/`runState` 全部不写），避免下游把失效/不覆盖目标的冻结契约当依据（方案 §5.5/§8.2 AC-3.1/AC-3.2）。
- 不锚定 pinned 时，`runRoster`/模块元数据改用**最新 roster**（`chainFacts.roster`，§5.3.3「适用名单」）；pinned 覆盖事实仅进入 advisory（`run-role-missing`/`module-missing`）。
- `hasLegacyFlowTask === true`（P1-R-02）：collector 的 `run` 事实固定 `{state:"legacy"}`（advisory 用途）；任务锚点仍读本地 `runManifest`——若 `ensureDraftRun` 成功则按 draft 锚定，**不把 legacy 当锚点、不因 draft 丢失 `run-legacy-readonly`**；旧 legacy 记录保持可读、不改写。
- 无效 pinned（verify/roster 失败）**不传 `run` 给 collector**，只传 `runFacts.documentHashMismatch`/`pinnedRosterInvalid`，由 collector 产出对应 run advisory（不要求 collector 实现额外抑制规则；P1-R-16）。

### 3.3 测试（`run-pin.test.ts`）

- 改写 `:308-328`：缺 D3 → handoff **受理**、任务行 +1、`runId`/`runState:"draft"`、run 仍非 pinned、回执含 `状态提示（未阻断）`、无 run-change 卡；断言 advisory 顺序 `run-pin-failed` → `run-pin-required`（P1-R-01）。
- 新增 handoff **无 flowId**：受理、任务无 `flowId`/`runId`/`runState`、`stepId=project-handoff`、advisory `run-ledger-unavailable`。
- 新增 handoff **runManifest 缺失/run 账本不可用**（如 `.ans/runs` 不可写/不可读）：受理、无锚点、advisory `run-ledger-unavailable`。
- 新增 **会话级 pinned 哈希漂移**（P1-R-07(b)）：先 pin 成功，再修改某个 pinned 文档使 `verifyPinnedRun` 失败；convener→roles 内 worker 派发 → 受理、advisory `run-document-hash-mismatch`、manifest/文档未被改写、任务行无 `flowId`/`runId`/`runState`。
- 新增 **会话级 pinned roster 失败**（P1-R-07(b)）：pin 后使 pinned roster 不可读/不可解析 → 受理、advisory `run-pinned-roster-invalid`、manifest 未被改写、任务无锚点。
- 新增 **legacy flow 派发**（P1-R-02/P1-R-07(c)）：项目含旧 `task.created`（无 runId、flowId=focus）→ convener→roles 内 worker 带 flowId 派发 → 受理、`ensureDraftRun` 产生/复用 draft、任务锚定 draft（非 legacy）、advisory `run-legacy-readonly`、旧 legacy 记录仍可读且未被改写。
- 改写 `:531-550`：基线违规 → 受理 + advisory `versioned-doc-baseline-violation`、任务行 +1、基线/manifest 哈希未变。
- `:176-307`、`:330-530`、`:552-641` 的直接 pin/manifest/contract_check/legacy 用例保持不变；`run-pin` 正例（draft→pin 同一 runId、任务锚定 pinned）不回归。
- 对 `run.roles === undefined` / `run.modules === undefined` 的覆盖（P1-R-08-R1）：构造 pinned manifest 缺 `roles`/无法取得模块清单的夹具，断言**不产 `run-role-missing`/run 专属 `module-missing`**、不锚定该 pinned run，并在证据记录「无法证明覆盖」的限制；不要求 B1 会话层补 code。

---

## 4. R3：`evidenceScopeRoots` 回退优先级与 fail-closed

目标：不因 flow 锚点省略让 verifier 的 `scopeRoots` 静默变空（拒绝所有物证），也不让角色边界无界放宽验收范围。实现于 `session.ts:7062-7094`（签名不变：`(projectRoot, flowId, run, roleId)`）。

### 4.1 优先级与精确匹配

1. **任务自身 `modulePaths`（最高优先；P1-R-04 修订）**：`readTasks` 中匹配以下既有任务记录字段，**不以当前 roster 是否仍含该 moduleId 为门槛**：
   - `created.to === roleId`；
   - 有 flow 锚点：`created.flowId === flowId`，并且（`run === undefined` 或 `created.runId === run.runId`）——保留现状；
   - **无 flow 锚点**（`created.flowId === undefined`）且 `created.moduleId !== undefined`；creator 兼容集合按角色类别精确限定（用 `this.deps.getListing(projectRoot)` 判定；listing 不可用/角色无法归类时不做无锚点匹配，不猜）：
     * `roleId === "verifier"` → `created.from === "chief" || created.from === "convener"`（质检可由幕僚调度或运营发起，P1-R-04-R1）；
     * 其它内置目标（listing `builtIn === true` 且非 verifier）→ `created.from === "chief"`；
     * 项目 worker（listing `builtIn !== true`）→ `created.from === "convener"`；**chief 来源的 worker 任务不得进入 tier ①**；
   - 满足上述条件的记录**直接纳入 `created.modulePaths`**，即使最新/pinned roster 已漂移或不再含该 moduleId（覆盖 AC-5.6「roster 漂移不导致有根误空」）；
   - 明确排除：`created.flowId !== undefined && created.flowId !== flowId` 的任务；creator 不在上述集合的无锚点任务。
   - 限制：`EvidenceCheckInput`（`src/model/runtime.ts:565-574`）无 taskId，且不得改 schema；无法做 taskId 精确匹配，只能按 `created.to/from/moduleId/modulePaths` 兼容匹配。B1 证据记录该限制。
2. **适用 roster 模块根**：pinned run 且 `loadPinnedRoster` 成功 → pinned roster；否则最新 roster（`loadLatestRoster`）。取 `roleId` 的 modules → module paths，经 `validateEvidencePath` 规范化。
3. **角色边界根（仅最后兜底）**：仅当 ①② 得到空集合时：
   - 从 `this.deps.getListing(projectRoot)`（必要时 `refreshListingNow` 一次）取调用角色的 `boundary.entries`；
   - 只接受 `root === "project"` 且 `kind` 为 `directory`/`conditional-directory` 的条目；路径按目录规范化（比较时统一补 `/`）；
   - **只接受等于或位于适用 roster 某模块路径之内的边界根**（角色边界不得越过模块范围）；若适用 roster 不可用，则不做边界兜底；
   - 加入边界根时记录来源：`createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).record("evidence.scope.boundary-fallback", { sourceRoleId: roleId, count: N })`（字段均在 `diagnostics.ts:11-20` 白名单内）。
4. **都没有 → 返回 `[]`**：调用方 `evidenceCheckText:6998-7000` 以 `evidence-scope-denied` fail-closed；不误放行、不伪造。

`scopeRoots` 是集合语义；优先级只决定「边界兜底是否启用」，不改变集合合并结果。

### 4.2 测试（`chain-enforcement.test.ts` 新增 R3 用例；不改 `acceptance-evidence.test.ts`）

- **正例**：无 flow 锚点的 verifier 任务（convener→verifier，无 flowId，带 moduleId）→ 任务保留 `moduleId`/`modulePaths`；`evidence_check` 的 `scope` 非空且包含该路径；模块内物证被接受。
- **正例（P1-R-04-R1）**：**chief→verifier**、无 flow、带 moduleId/modulePaths 的任务 → 同样贡献证据根（verifier creator 集合含 chief）；`scopeRoots` 非空且包含该路径。
- **负例**：同一 verifier 对模块外物证（如 `docs/...`）调用 → `evidence-scope-denied`；不得因边界兜底把模块外物证算作模块证据。
- **roster 漂移不导致空 roots（P1-R-04）**：先建无 flow verifier 任务，再改写/移除最新 roster 中该 moduleId（或提升 roster 版本移除该模块）；`evidence_check` 仍以任务 `modulePaths` 得到非空 scope 并接受模块内物证。
- **creator 不匹配负例（P1-R-04-R1）**：用 `appendTaskEvent` 构造 `to=implementer`（项目 worker）、`from="chief"`、无 flow、带 modulePaths 的任务记录（项目 worker 的合法 creator 是 convener）→ 该记录**不得**进入 tier ①；并确保无其它合格根（roster 无该角色模块、边界根在模块外），最终 `evidence-scope-denied` fail-closed。不得再用 `to=verifier, from="chief"` 作负例（修正后为合法组合）。
- **兜底有界/记录**：verifier 无任务 modulePaths 但有边界目录、且该目录位于 roster 模块路径内 → `scopeRoots` 非空且诊断出现 `evidence.scope.boundary-fallback`；模块外边界根不得进入。
- **无根 fail-closed**：无任务 modulePaths、roster 无该角色模块、边界无合格目录 → `scope` 为空 → `evidence-scope-denied`（拒绝而非误放行）。
- **verifier 模块元数据**：无 flow 锚点仍写 `moduleId`/`modulePaths`（不要求属主）；文件型模块不写 `moduleDirectory`。
- 夹具：复用 `chain-enforcement` 的临时项目/roster/角色卡模式，补最小 `docs/acceptance/<flow>-criteria-v1.md` 与证据文件；`evidenceCheck` 经 `openRoleSession` 入参捕获（harness 增加一个 capture 字段，属测试夹具）。

---

## 5. 模块字段（`task.created` 构造）

适用名单 = **锚定的 pinned roster**（§3.2 条件全部满足时）；否则最新 `chainFacts.roster`（`ok === true`）。规则：

| 目标类型 | `moduleId` 存在且模块在适用名单 | 写 `moduleId`/`modulePaths` | 写 `moduleDirectory` |
| --- | --- | --- | --- |
| 实现目标（非内置项目 worker，且不是 verifier） | 目标必须是该模块属主（`roster.roles.find(r => r.modules.includes(module.id))?.id === targetRoleId`） | 是 | 仅当 `module.path` 以 `/` 结尾（目录型） |
| verifier / 其它合法验收/治理内置目标 | 模块存在即可（**不要求属主**） | 是 | 同上 |
| 非属主实现目标 / 模块不在适用名单 / 未带 moduleId | 不写模块字段 | 否 | 否 |

- `modulePaths` 用名单模块的 `module.paths`（模型自报 `requestedModulePaths` 只参与 advisory，不落盘——保留 `:6280-6285` 口径）。
- **文件型模块**（`module.path` 不以 `/` 结尾）不写 `moduleDirectory`，避免 `task-state.ts:383-394` 的目录校验把任务行判坏（现状 `:6298` 总是写，属隐患修复）。测试夹具的文件模块路径不得与 `src/`、`test/` 等目录型模块重叠（P1-R-06），并断言 `parseProjectRoster` 成功。
- 不匹配时省略并记 advisory：`module-required`（实现目标未带 moduleId）、`module-missing`（模块不在适用/最新名单或不在 pin 名单）、`module-not-owned`（实现目标非属主）、`module-path-invalid`/`module-path-outside`（模型自报路径非法/越界）。
- verifier 的模块元数据是 `evidenceScopeRoots` 的证据根来源；不得因「非属主」省略（F2/AC-5.3）。
- 若任务账本写入因其它原因失败，仍 `fail`（不投递、不自称受理）。

---

## 6. 其余 session 改动

1. **`chiefRoleId` 允许 null / listing 不可用**：调整并移除 `:6135-6137` 的无条件早退（来源由 `evaluateDispatchAuthorization` 的 `unknown-source` 判定，不在会话层另写来源谓词）；`chiefRoleId`、`convenerRoleId`、`handoffDispatch`、`dispatchStepId`、`created.from` 全部 null 安全。listing 不可用时 `targetExists=false`，项目 worker 目标硬 `target-card-missing`，内置目标仍按注册表判定。
2. **run 读取/记账 best-effort**：`findActiveRun`、`ensureDraftRun`、`verifyPinnedRun`、`loadPinnedRoster` 的失败不再 `return fail`，按缺事实转 `runFacts`/advisory；**带 `flowId`（`runFlowId !== undefined`）时对所有来源/目标都 `ensureDraftRun`**（不再只限 handoff/product/rapporteur/nominator），避免新方案移除 `run-missing` 后撞 `task.created` 的 `run-required`。pinned 多 active 冲突（`findActiveRun` 失败）→ `runFacts.ledgerUnavailable`，任务无锚点。`hasLegacyFlowTask === true` 时 collector 的 `run` 事实固定 `{state:"legacy"}`（advisory），任务锚点仍用本地 `runManifest`（§3.1/§3.2，P1-R-02）。
3. **删除派发触发的 run-change**：删除 `runChangeRejectionForDispatch`（`:2050-2077`）、`dispatchFrozenConflictDetail`（`:2080-2123`）及 `:6209-6221` 调用点；保留 `proposalCardFrozenRejection`（`:2131-2153`）、`offerRunChangeOnFrozenContract`（`:2159-2209`）、`requestRunChangeDecision`（`:1909`）与显式入口；`findNewerContractDocs` 仍供提案卡路径使用。不新增自动批准/代批。
4. **版本基线 advisory**：`verifyVersionedDocBaselines`（`:6225-6242`）违规不再 `makeMechanicalRejection`/fail；结果写入 `versionedDocBaselineViolations`，由 A1 collector 产出 `versioned-doc-baseline-violation`；B1 不写文案、不在会话层追加（P1 §5.4）。基线/文档不被改写。
5. **账本写入失败仍 fail**：`appendTaskState`（`:6313-6318`）失败保持 `ok:false`、不投递。
6. **`planDispatchDelivery` 保留**：`:6331-6349` 的拒投行为、`task.closed(rejected)` 收口与运行文案**逐字不变**；B1 不改 `src/common/编排/handback.ts`。B1 的回执/系统行只在成功路径追加 advisory，不触碰 G-1 拒投文案。
7. **回执/系统行/诊断**：成功投递后（`:6393-6401`）在既有 `main.session.acceptedTask` 回执后追加 advisory 摘要：最多 3 条人话；超过 3 条以「另有 N 项，见诊断记录」收口；不出现「拒绝/失败/未受理」；技术 code 不进客户卡。`emitDeliveryNote` 一行「状态提示（未阻断）：…」。按 P1 §5.4，advisory 文案/产出点唯一在 A1 collector；B1 只做合并/截断/呈现/诊断。诊断用既有 `createDiagnosticLogger`：每个 advisory 一条 `tasks.dispatch.advisory`，字段 `sourceRoleId`、`targetRoleId`、`reasonCode`、`phase:"dispatch"`、`mode:"authorization-only"`；**只在有 advisory 时记录**，正常派发零噪声。
8. **注释/import 清理**：更新 `:6127-6128` 等仍写「M1–M8 机械前置」的注释为「硬授权 + 状态提示」；`session.ts:92` 的 `evaluateDispatchPreflight` import 改为窄步骤/advisory 类型（具体以 A1 冻结导出为准）；删除 `runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail` 时，注释/字符串不得保留这些标识符（P1-R-07(f)）；不引入未使用 import、不重构无关代码。

---

## 7. 测试计划（B1，7 个既有文件）

通用纪律：不删除测试文件/用例、不新增 `skip`/`todo`、不放松断言；旧状态拒绝逐条迁移为「硬负例」或「受理 + advisory 正例」；每个旧负例至少保留一个等价强度的断言。B0 基线：7 文件 50 tests 全过。

### 7.1 `chain-enforcement.test.ts`

- **M1/M2 用例（:305-353）**：
  - 缺意图/缺 flowId：`ok:true`、任务行 +1、投递发生、回执含 `已受理` + `状态提示（未阻断）` + 意图相关 advisory（`intent-missing`/`flow-required` 按链顺序）。
  - **同文幂等**（P1-R-07(e)）：缺意图派发已受理并占用幂等键后，同一文本再次派发 → 显式断言 `ok:true` 且回执含「同一任务已存在/重复派发已抑制」、任务行不新增；补齐后**改用新任务文本**验证再次受理。
  - 缺名单：受理 + `roster-missing` advisory + 任务行 +1；同文复派按上述幂等断言处理，补齐后用新任务文本验证受理。
  - 基线篡改：受理 + `versioned-doc-baseline-violation` advisory + 任务行 +1；不再出现 `派发未受理`/三段式拒绝。
  - 硬负例保留：幕僚→项目 worker 仍拒（见 star-routing）。
- **M5/M6/M7 用例（:355-429）**：
  - handoff 正例不变（stepId/flowId/from）。
  - `modulePaths` 越界：受理 + `module-path-outside` advisory；任务模块字段仍取名单 `impl-core`（`src/`）。
  - 非属主模块：受理 + `module-not-owned`；**任务行不写 moduleId/modulePaths/moduleDirectory**。
  - verifier 带非属主模块：受理 + 任务行写 `moduleId`/`modulePaths`（不要求属主）。
  - **文件型模块（P1-R-06）**：夹具新增一个**不与 `src/`、`test/` 重叠**的目录外文件路径模块（如 `scripts/build.mjs`，属主 implementer），构造后断言 `parseProjectRoster` 成功；派发 → 受理、任务写 `moduleId`/`modulePaths`、**不写 `moduleDirectory`**，任务行可被 `readTaskState` 读回。
  - 运营→产品：仍硬拒 `convener-target-forbidden`、无任务行。
  - 目标不在 D3 选中：受理 + `target-not-nominated` advisory（不再拒）。
  - 实现目标未带 moduleId：受理 + `module-required` advisory、无模块字段。
- **诊断捕获（P1-R-07(d)）**：在本文件的一个 advisory 正例中临时 `configureDiagnostics({ directory: temp })`，派发后 `flushDiagnostics()` 读取 JSONL：断言 `event === "tasks.dispatch.advisory"`、`reasonCode` 与回执对应、字段含 `sourceRoleId`/`targetRoleId`/`phase:"dispatch"`/`mode:"authorization-only"`、不含任务正文；测试结束 `disposeDiagnostics()`。洁净派发零条断言放在 `star-routing`（§7.2）。
- **R3 新用例**（见 §4.2）：无 flow 锚点 verifier 正例 / 模块外负例 / roster 漂移 / creator 不匹配 / 边界兜底记录 / 无根 fail-closed。
- `:431-758` 的 D3 卡种、M9 报告路由、M11、F4 用例保持不变。

### 7.2 `star-routing.test.ts`

- `:110-130` 幕僚→项目 worker：保留硬拒；payload 增加 `flowId`，追加「无任务行、无目标会话、无 draft run」断言（R1）。
- `:132-153`：chief→产品受理不变；chief→运营缺 D3 改为**受理** + `d3-missing` advisory（handoff pin 失败时另含 `run-pin-failed` → `run-pin-required`，顺序固定），任务行 +1、`stepId=project-handoff`；自派仍由收窄后的 `:6086` 拒绝（保持现有 `/不能派发给幕僚自己/` 断言）。
- **新增 P1-R-05**：convener→chief → `convener-target-forbidden`（不得被 `:6086` 改成「不能派发给幕僚自己」）；无任务行、无目标会话、无 draft run。
- **新增 P1-R-07(a)**：convener→不存在的项目 worker（未枚举）→ `target-card-missing`；`readTaskState().records.size` 不变；目标会话未打开；无 draft run。
- **新增 P1-R-07(g) wrong-source**：测试内以窄类型 cast 直接调用 `mgr.routeDispatch(root, "demo", "worker", payload)`（来源非 chief/convener；或走接口层等价注入）→ `ok:false`；无任务行、无目标会话、无 run manifest。不得只以 A1 纯函数 `unknown-source` 代替桌面证据。
- **新增 P1-R-07(d) 洁净派发零噪声**：状态齐备的 chief→产品派发后，`configureDiagnostics`/`flushDiagnostics` 读取 JSONL，断言无 `tasks.dispatch.advisory` 记录、回执与现状一致；与 chain-enforcement 的 advisory 捕获形成对照。
- `:155-171` convener→worker 未接交付：改为**受理** + `handoff-missing` advisory + 任务行 +1（目标存在时投递）。
- `:173-297` 幂等/打开失败/排队/回交用例保持不变（预期不变，作为幂等回归）。

### 7.3 `rejection-copy.test.ts`

- `:42-79` BUG-4：改为 `evaluateDispatchPreflight` 返回 `ok:true` + `advisories` 含 `d3-selected-cards-incomplete`（列出缺卡 id），且不经 `MechanicalRejection`；新增硬 `target-card-missing` 用例（convener→不存在的项目 worker，**显式** `targetExists:false`，P1 §5.2）断言 owner=`nominator`、action 同时覆盖「id 拼写/角色 id 错误」与「角色卡/边界未就绪」、`M5_TARGET_CARD_MISSING` 别名保留。迁移本文件所有构造 `DispatchPreflightInput` 的存在性分支都显式传 `targetExists`（不依赖 `targetCardFound` 回退）。
- `:111-128` code→owner 表：保留既有高频 code；新增断言 `d3-selected-cards-incomplete`/`run-ledger-unavailable`/`run-pin-failed`/`run-document-hash-mismatch`/`run-pinned-roster-invalid` 不在拒绝 map 中（advisory 不走三段式）。
- `:25-40`、`:81-109`、`:130-237` 保持不变。

### 7.4 `run-pin.test.ts`

- 按 §3.3 逐项：改写 `:308-328`（pin 失败受理 + draft 锚点 + `run-pin-failed`→`run-pin-required` 顺序）、`:531-550`（基线违规受理 + advisory）；新增「handoff 无 flowId」「handoff 无 runManifest/账本不可用」「会话级 pinned 哈希漂移」「会话级 pinned roster 失败」「legacy flow 派发」五类；保留 `:176-307`、`:330-530`、`:552-641` 直接 pin/manifest/contract_check/legacy 用例。三类 handoff 均有可核对断言：受理、锚点字段、不伪造 pinned、不弹 run-change 卡、`stepId` 保留。
- 会话级 AC-2.8 证据：pinned 哈希漂移/roster 失败时断言受理、advisory、manifest 写前/写后 sha256 一致、任务无锚点；legacy 证据断言旧记录可读且未被改写（P1-R-07(b)(c)）。

### 7.5 `run-change-trigger.test.ts`

- `:242-326` 三模式自动触发：迁移为「派发不再自动弹卡」——pinned run + 新版本派发 → `ok:true` + advisory（`run-role-missing`/`module-missing` 等按实际）+ 任务行 +1 + `h.customerRequests.length === 0` + 旧 run 未被改写（`state:"pinned"`、`runChange` 未新增）。
- 为保留三模式覆盖，另将 `requestRunChangeDecision`（显式入口）的 continue-frozen/stop-and-restart/stop 三模式落账断言保留（可放在同一循环或 `:328-379` 改写中）；`run-change.test.ts` 既有直接方法用例不动。
- **覆盖归属（P1-R-13）**：三模式直接方法由 `run-change.test.ts` 覆盖；本文件覆盖「派发不再自动触发」与「显式入口真实链路」；无会话兜底与提案卡路径各保留一条，不重复断言、不隐式删除。
- `:328-379` 改为通过显式入口发起 stop-and-restart，再重新 pin v2 并派发新角色，断言新任务锚定 `runId`/`runState:"pinned"`。
- `:380-416` 无会话兜底：改为显式入口的无会话失败（`customerRequests` 为 0、如实失败/不伪造呈现），或提案卡冻结路径的无会话失败；不得静默删除覆盖。
- `:417-443` 宁可不弹：ghost 目标（未枚举）改为**硬 `target-card-missing`**、无任务行、无客户卡；`run-role-missing` 不自动弹卡的覆盖由 :242 迁移用例承担。
- `:444-479` 提案卡冻结路径保持不变（仍走 `proposalCardFrozenRejection` → run-change 卡）。

### 7.6 `run-change-entry.test.ts`

- `:195-218` 源码钉：**删除** `assert.ok(session.includes("runChangeRejectionForDispatch"), ...)`；保留 `this.requestRunChangeDecision({`、`proposalCardFrozenRejection`、显式入口（main handler/preload/platform/ChatHeader/interface）与 `"run-change-required"` 码表钉。
- **负向钉（P1-R-07(f)）**：推荐直接移除负向钉；若保留，只用精确正则（如 `/\brunChangeRejectionForDispatch\s*\(/`），**不得用裸子串**；同时 B1 清理 `session.ts` 注释时不得保留该标识符（避免注释误红）。
- `:99-193` 行为用例保持不变。

### 7.7 `dispatch-fresh-enum.test.ts`

- 既有「缓存 miss → 重枚举一次 → 受理」「确实不存在 → 如实拒绝」「重枚举抛错 → 如实拒绝」保持不变（single/su 路径，本变更不改）；作为回归复跑。如 P1 要求，可在 star 路径补「目标不存在硬拒」由 `star-routing` 承担，本文件不重复造桩。

### 7.8 B1 退出命令与计数

```bash
node --test --test-concurrency=1 test/桌面应用/chain-enforcement.test.ts test/桌面应用/star-routing.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts test/桌面应用/run-change-entry.test.ts test/桌面应用/dispatch-fresh-enum.test.ts
npm run typecheck
```

记录：命令、工作目录、Node/npm、退出码、tests/pass/fail/skip/todo、失败原文、执行时间；与 B0 的 50 tests 基线对照；新增确定性失败=0、新 skip/todo=0、无删测/弱化断言。测试计数预计上升，以实际输出为准。

### 7.9 旧用例 → 新落点映射（P1-R-13）

| 文件 | 旧用例 | 新落点/断言语义 |
| --- | --- | --- |
| chain-enforcement | `:305` M1 缺意图拒 | 受理 + `intent-missing` advisory + 任务行 +1；同文复派被幂等抑制（不新增行）；补齐后用新文本受理 |
| chain-enforcement | `:305` M2 缺名单拒 | 受理 + `roster-missing` advisory + 任务行 +1；同文复派幂等抑制；补齐后新文本受理 |
| chain-enforcement | `:305` R9 基线篡改拒 | 受理 + `versioned-doc-baseline-violation` advisory + 任务行 +1；基线/文档未被改写 |
| chain-enforcement | `:355` handoff 正例 | 不变（stepId/flowId/from） |
| chain-enforcement | `:355` 错路径/非属主/目标不在 D3/运营→产品 | 错路径→受理 + `module-path-outside`；非属主→受理 + `module-not-owned`、无模块字段；不在 D3→受理 + `target-not-nominated`；运营→产品→仍硬拒 |
| chain-enforcement | `:355` verifier 带模块 | 受理 + 任务写 `moduleId`/`modulePaths`（不要求属主） |
| chain-enforcement | 无文件型模块用例 | 新增文件型模块（非重叠路径）→ 不写 `moduleDirectory`、任务行可读回 |
| chain-enforcement | `:431-758` D3/M9/M11/F4 | 保持不变 |
| star-routing | `:110` 幕僚→worker 拒 | 保留硬拒；补带 flowId 的「无任务行/会话/draft run」断言 |
| star-routing | `:132` chief→产品受理 | 不变 |
| star-routing | `:132` chief→运营缺 D3 拒 | 受理 + `d3-missing`（+ pin 失败组合 `run-pin-failed`→`run-pin-required`）、任务行 +1、stepId |
| star-routing | `:132` 自派拒 | 保留现有「不能派发给幕僚自己」断言（收窄后的 `:6086`） |
| star-routing | `:155` convener→worker 未接交付拒 | 受理 + `handoff-missing` + 任务行 +1 |
| star-routing | `:173-297` 幂等/打开失败/排队/回交 | 保持不变 |
| star-routing | 新增 | convener→chief `convener-target-forbidden`；convener→不存在 worker `target-card-missing`；wrong-source；洁净派发零诊断 |
| rejection-copy | `:42` BUG-4 D3 缺卡 `target-card-missing` | 改为 `ok:true` + `d3-selected-cards-incomplete` advisory；新增硬 `target-card-missing`（显式 `targetExists:false`） |
| rejection-copy | `:111` code→owner 表 | 保留；新增 advisory-only code 不在 map 的断言 |
| rejection-copy | 其余 8 个用例 | 保持不变 |
| run-pin | `:308` 缺 D3 pin 失败不建任务 | 受理 + draft 锚点 + `run-pin-failed`→`run-pin-required` |
| run-pin | `:531` 基线违规拒 | 受理 + `versioned-doc-baseline-violation` + 任务行 +1 |
| run-pin | 新增 | handoff 无 flowId / 无 runManifest；pinned 哈希漂移 / roster 失败；legacy flow 派发 |
| run-pin | `:176-307`、`:330-530`、`:552-641` | 保持不变（直接 pin/manifest/contract_check/legacy） |
| run-change-trigger | `:242` 三模式自动触发拒+弹卡 | 派发受理 + advisory、客户卡 0；三模式改由显式入口真实链路覆盖（`run-change.test.ts` 已有直接方法覆盖） |
| run-change-trigger | `:328` stop-and-restart 后重新 pin | 显式入口发起 stop-and-restart → 重新 pin → 派发锚定 pinned |
| run-change-trigger | `:380` 无会话兜底 | 改为显式入口无会话失败（不伪造呈现） |
| run-change-trigger | `:417` 宁可不弹 | ghost 目标→硬 `target-card-missing`、无任务行、无客户卡 |
| run-change-trigger | `:444` 提案卡冻结 | 保持不变 |
| run-change-entry | `:99`/`:122`/`:155` 行为用例 | 保持不变 |
| run-change-entry | `:195` 源码钉 | 删除 `runChangeRejectionForDispatch` 正向钉；保留其余钉；负向钉按 §7.6 精确正则或移除 |
| dispatch-fresh-enum | `:86`/`:171` | 保持不变（single 路径回归）；star 路径的 wrong-source/target-not-exists 由 star-routing 覆盖 |

---

## 8. 写集与非目标

### 8.1 B1 精确写集（团队计划 §4.3）

- `app/desktop/session.ts`（唯一产品源码）。
- `test/桌面应用/chain-enforcement.test.ts`、`star-routing.test.ts`、`rejection-copy.test.ts`、`run-pin.test.ts`、`run-change-trigger.test.ts`、`run-change-entry.test.ts`、`dispatch-fresh-enum.test.ts`（7 个既有文件）。
- 自身 `角色卡/桌面窗口/docs/change/` 证据与（按需）`api-spec.md`/`memo.md`；本提案只写本文件。
- 前置：A1 已冻结契约；H1 已完成（boundary B-1/B-2 已含 `run-change-trigger.test.ts`、`run-change-entry.test.ts`）；P1 审核通过。B1 不写这两个测试之外的任何新测试。

### 8.2 明确不改

- 不改 `app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`app/desktop/` 其他文件（`interface.ts`、`project.ts`、`customer-input.ts` 等）；确需时停止回报统筹。
- 不改 `src/**`（含 `src/common/编排/**`、`src/common/shared/**`、`src/model/runtime.ts`、`src/provider/runtime/schema.ts`）；不改 `task-state.ts`/`run-manifest.ts`/`versioned-doc-guard.ts`/`governance-roles.ts`/`handback.ts` schema 或运行文案。
- 不改 `test/测试/**`、`test/编排/**`、其他角色测试目录；不新增 `test/桌面应用/` 新文件。
- **F4 不改**：不触碰 `redispatchTask`（`session.ts:4476` 起）、`chooseRedispatchTarget`（`:4324-4330`）及重派路径；B1 自检 `git diff -U0 app/desktop/session.ts` 不覆盖这些区域。
- **R4 只引用**：方案 §13 的复核引用更正由策划作者执行；B1 不写 `docs/planning/`，引用当前复核快照 `aa702f6b…` 并记录 R4 状态。
- 不写 `docs/scheduling|acceptance|communication|planning`、角色卡/边界/YAML/changelog；不 commit/push/merge/release；不启动应用；不接触客户。

---

## 9. i18n

**默认不新增 key。** 回执复用现有 `main.session.acceptedTask`（`src/common/shared/i18n/messages/zh-CN.ts:1152`、`en-US.ts:1272`）；advisory 人话文本由 A1 的 `dispatch-advisories.ts` 统一提供（中文，方案 §4.2 口径），B1 只负责拼接/展示与诊断 `reasonCode`，不另写双语 key；诊断只存技术字段，不含任务正文/密钥。理由：本任务不改渲染层，回执是主进程字符串，新增 key 会扩大项目管理写集与 i18n 计数，且方案已允许「复用现有文案 + 中文 advisory 文本」。

**条件项：无。** 若 P1 审核认为摘要必须 i18n 化，需由项目管理按既有目录授权新增成对 key（`zh-CN`/`en-US`）并更新 `test/项目管理/shared/i18n.test.ts` 计数；本提案不申请该条件写，B1 也不写 `src/common/shared/`。

---

## 10. 风险、开放点与证据计划

### 10.1 风险与开放点

| # | 风险/开放点 | 影响 | 处置 |
| --- | --- | --- | --- |
| 1 | **A1 最终冻结形状**：A1 Revision 1 为 684 行 / `2d7335d8…`；剩余 P1-R-15（§5.1 规则 2 与 run 专属 `module-missing`）及 P1-R-08-R1 选定口径需 A1 修订并**最终冻结**（新行数/SHA-256）；B1 只按最终冻结版消费 | 阻塞 B1 | P1 复审；A1 退出冻结并回传两文件哈希；B1 开工复测绑定；不一致则停止回报，不复制谓词 |
| 2 | **advisory 产出位置**：P1 §5.4 已裁决只批准 A1 collector 主路径；B1 不追加同类 advisory | 已裁决，实施时核对 | B1 实施记录记录「按 P1 裁决采用主路径」；同 code 去重仅展示层防御 |
| 3 | **R3 tier ① 匹配**：已按 P1-R-04 改为 `created.to/from/moduleId/modulePaths` 兼容匹配、不以 roster 为门槛；taskId 精确匹配因 `EvidenceCheckInput` 无 taskId 且不得改 schema 不可用 | 已修订，待 P1 复审 | §4.1/§4.2；B1 证据记录限制 |
| 4 | 单测内诊断捕获：`createDiagnosticLogger` 需 `configureDiagnostics`；全局单例与其他测试文件串行运行 | AC-4.2 证据 | 在单个测试内临时 `configureDiagnostics` + `flushDiagnostics` + 读取 JSONL 后 `disposeDiagnostics`；D1 另取原始输出 |
| 5 | pin 后校验失败的竞态路径（pin 成功→verify 失败）难以在真实会话稳定注入 | AC-3.2 覆盖 | 保留代码路径（不锚定、advisory）；pin 失败三类用例覆盖主分支；verifyPinnedRun 直接测试（run-pin.test :408）覆盖哈希漂移 |
| 6 | 测试计数/迁移量大，可能误删/放宽 | AC-6.1 | 逐文件映射（§7）；B1 记录 before/after 测试数与 diff；不新增 skip/todo |
| 7 | `ensureDraftRun` 扩到所有带 flowId 目标，投递失败时可能留下 draft run | 账本痕迹 | 这是受理记账（非硬拒绝），符合方案 §5.5；R1 只要求硬拒绝不产生 draft；证据中如实记录 |
| 8 | 文件型模块不写 `moduleDirectory` 改变现状行为 | 任务行校验 | §5 明确条件写；测试断言任务行可读回；`task-state.ts` 不改 |
| 9 | F4 重派路径未纳入硬矩阵 | 范围外缺口 | 只读核对（D1）；B1 不改；R4 只引用 |
| 10 | B1 证据需绑定 A1 冻结候选 | 证据失效 | B1 证据同时记录 A1 两文件哈希与 B1 候选；A1 变更使 B1 证据失效 |

### 10.2 证据计划（B1 退出，状态 `implemented-unverified`）

1. **写前基线**：HEAD/tree、`git status --short`、`git diff --cached`、8 个目标文件 `git hash-object` + `sha256sum`（§1.3 已记录；B1 开工时复测）。
2. **候选身份**：逐文件 before/after blob + sha256；A1 提案 Revision 1（684 行 / `2d7335d8…`）与最终冻结的 `workflow-preconditions.ts`/`dispatch-advisories.ts` blob+sha256（最终以 A1 退出报告为准；B1 开工复测绑定）；候选 diff。
3. **改动范围**：`git diff --name-only` 仅 §8.1 写集；`git diff -U0 app/desktop/session.ts` hunk 不覆盖 `:4324-4330`/`:4476` 起重派区域（F4）。
4. **检查输出**：§7.8 命令原文、环境、退出码、计数、失败原文；`npm run typecheck` 退出码 0；无新 skip/todo；无删测/弱化断言（`git diff -U0` 片段）。
5. **断言证据**：R1 硬拒无任务行/会话/draft run + wrong-source 桌面证据；R2 三类 handoff + `run-pin-failed`→`run-pin-required` 顺序 + 锚点字段 + stepId + 会话级 pinned 哈希/roster 失败 + legacy flow；R3 正/负例 + roster 漂移 + creator 不匹配 + boundary fallback 诊断 + 无根 fail-closed；模块字段 verifier/文件型（非重叠路径）；AC-1.2/AC-1.5 star 负例；AC-4 回执原文 + `tasks.dispatch.advisory` 的 `reasonCode` 原始记录 + 洁净派发零条；M1/M2 同文幂等断言。
6. **不作声明**：不 commit/push/merge/release；不声称验收通过；不写 `docs/verification/`；不伪造 task_ops 状态。D1/D2 由测试角色按团队计划另行取证。

---

## 11. P1 审核对照（V1 §4）

| 核对项 | 本提案落点 |
| --- | --- |
| R1-a 硬授权先于 `ensureDraftRun`/`pinRun` | §2.2 步骤 3 在 5/6 之前；§2.3 测试 |
| R1-b 事实最小化 | §2.2 步骤 2–3；`targetExists` 公式 |
| R1-c 单一公开入口/无第二谓词 | §2.1 组合式入口 + 窄导出；§2.2 说明 |
| R1-d advisory 不反向影响授权 | §2.1 `collectDispatchAdvisories` 永不 `ok:false`；§6 |
| R1-e 测试 | §2.3、§7.2、§7.4 |
| R2-a pin 失败→draft/缺失、不伪造 pinned | §3.1、§3.3 |
| R2-b 无 flowId/runManifest→省略锚点 + stepId | §3.1、§3.3 |
| R2-c advisory 口径不混写 | §3.1 表 |
| R2-d 三类 handoff 测试 | §3.3 |
| R3 优先级与 fail-closed + 正/负例 | §4 |
| F4 不改重派 | §8.2 |
| R4 只引用 | §8.2 |

---

## 12. P1 审核返工处置（Revision 2）

- **审核记录**：`角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md`（复审后 **323 行** / SHA-256 `597a585978fc14f28863c2cdd85fb159fe8814461d34d8986b4522203a515003`，含 Revision 1 复审），结论 `needs revision`；本修订版为 **Revision 2**，Revision 1 为 528 行 / `aef0c4cc…`。复审已关闭 P1-R-01/02/03/05/06/07/09、P1-R-10~13、PM §5.2/§5.4、A1/B1 调用图一致性；剩余 B1 项为 **P1-R-04-R1、P1-R-08-R1、P1-R-14、P1-R-16**（P1-R-15 为 A1）。
- **PM 裁决必须落入**：advisory 唯一产出点 = A1 `collectDispatchAdvisories`；B1 只收集事实/合并/截断/呈现/诊断，不在会话层追加同类 advisory。`targetExists`：B1 在 `routeStarDispatch` 始终显式传 boolean；迁移 `rejection-copy` 时对存在性分支传显式 `targetExists`（新硬负例 `false`）。`runFacts`/`versionedDocBaselineViolations`/`run.modules` 为实施级可选事实（P1 §5.3 有条件接受）。legacy 事实 = collector `run: {state:"legacy"}`（仅 advisory），任务锚点仍用本地 draft。

| 编号 | P1 要求（摘要） | B1 落点 | 状态 |
| --- | --- | --- | --- |
| P1-R-01 | `run-pin-failed`/`run-pin-required` 组合与固定顺序 | §2.1 裁决段、§3.1 决策矩阵、§3.3/§7.2/§7.4 断言 | 已修订；A1 须删除互斥规则并补组合矩阵 |
| P1-R-02 | legacy 事实 (a) + 会话测试 | §2.2 第 9 条、§3.1 决策矩阵、§3.2 legacy 条、§3.3/§7.4 | 已修订；A1 须同步 `run` 注释/冻结声明 |
| P1-R-03 | A1 调用图重排（run 记账/handoff pin → 版本基线 → collector → task.created） | §2.2 第 3 条引用 | A1 负责；B1 调用图已对齐 |
| P1-R-04 | R3 tier ① 改用 `created.to/from/moduleId/modulePaths`，不以 roster 为门槛 | §4.1/§4.2 | 已修订；verifier creator 集合另见 P1-R-04-R1 |
| P1-R-05 | 收窄 `:6086` 为仅自派；convener→chief 归矩阵 | §2.2 第 6 条、§2.3、§7.2 | 已修订 |
| P1-R-06 | 文件型模块夹具非重叠路径 + roster 解析成功 | §5、§7.1 | 已修订 |
| P1-R-07 | (a) star 目标不存在；(b) pinned 哈希/roster；(c) legacy flow；(d) 诊断捕获/洁净零噪声；(e) M1/M2 幂等；(f) 负向源码钉；(g) wrong-source 桌面证据 | §2.3、§7.1–§7.4、§7.6、§7.9、§10.2 | 已修订 |
| P1-R-08 | pinned 模块覆盖事实二选一；roles 缺失口径 | §2.1 code（`run.modules?`）、§3.1 决策矩阵、§3.2、§3.3 | 已选 (a)；undefined 按 A1 无事实口径对齐（P1-R-08-R1） |
| P1-R-09 | A1 `liaison` 断言修正 | A1 负责；B1 不涉及 | 不适用（A1） |
| P1-R-10 | type-only 环说明/路径等价性测试 | §2.1 注明 type-only、运行期无环；等价性测试归 A1 | B1 引用 |
| P1-R-11 | 「第一行」措辞 | §2.1 改为「进入复合逻辑后的第一个判定步骤」 | 已修订 |
| P1-R-12 | 决策矩阵/笔误 | §3.1 决策矩阵 | 已修订 |
| P1-R-13 | 旧用例逐条新落点 | §7.9 映射表 | 已修订 |
| P1-R-04-R1 | verifier creator 集合含 chief；不匹配负例改 implementer/chief；补 chief→verifier 正例 | §4.1/§4.2 | 已修订 |
| P1-R-08-R1 | roles/modules `undefined` 对齐 A1 保守口径：不产 code、不锚定、记录限制；B1 不补 code | §3.1 决策矩阵、§3.2 第 3/4 条、§3.3、§12 | 已修订 |
| P1-R-14 | A1 依赖快照更新为 Revision 1 684 行 / `2d7335d8…`；最终冻结以 A1 退出报告为准；B1 开工复测绑定两文件 blob+sha256 | §1.2、§2.1、§10.2 | 已修订 |
| P1-R-15 | A1 §5.1 规则 2「module-* 永远 latest」与 run 专属 `module-missing` 冲突 | A1 负责；B1 按 run 专属 pinned 事实（`run.modules`）实现 | 不适用（A1） |
| P1-R-16 | §3.1 改为「无效 pinned 不传 `run`、只传 `runFacts`」；A1 冻结声明补 §5.7 理由 | §3.1；声明部分归 A1 | 已修订（B1 部分） |

- **未采纳项**：无 B1 可执行项未采纳；P1-R-08-R1 按复审推荐方案对齐 A1 保守口径（未选「undefined 也产出」的备选）；P1-R-15 及 P1-R-16 的 A1 声明部分属 A1 修订范围，B1 只按最终冻结结果消费。
- **实质变化**：本轮修订仅为文本/测试计划/事实口径，不改变授权矩阵、advisory 语义、写集、档位或客户确认范围；不需要重开闸门 1/2。若复审发现实质变化，停止并回报统筹。
- **纪律**：本修订未改产品源码/测试/审核记录/A1 文档/其他角色文档；未 commit/push/merge/release；未运行测试/应用。

---

**本文件状态：`proposal-only, no code`；Revision 2 等待项目管理 P1 复审。未实施、未测试、未提交。**
