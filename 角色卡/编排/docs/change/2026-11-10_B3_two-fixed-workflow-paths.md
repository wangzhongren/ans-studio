# 编排 B3 记录：两条固定工作流路径（发布合并 / 验收归档 / 基线-路径B 服务）

- 批次：**B3 桌面/卡片——编排服务批次**（团队计划 §三 B3「编排」行 + 任务精确写集）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；基线 HEAD **`e104f12`**（B0–B2 已提交；`git status --porcelain -- src app test` 为空）
- 状态：**已实现，未提交**；`npm run typecheck` **exit 0**；`test/编排` before **1,265/1,239/24/2** →
  after **1,291/1,265/24/2**（失败名集合逐名一致、新 skip=0）；新增 26 测试全绿（targeted 26/26）；
  `test/roles` **275/275 pass**；`test/门禁引擎` **499/493/5/1**（5 known-red 与 B2 记录逐名一致）；
  `test/runtime-core` **577/540/33/4**（33 known-red 与 B1 记录环境基线逐名一致，零回归）。
  **未 commit / 未 push / 未 merge / 未发布**；未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测（字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（MF-IR-8） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 35,665 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§4.2/§4.3/§5.1–§5.5/§6.4/§7.1/§8.4/§9.4） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| B2 编排记录（本批起点） | `角色卡/编排/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | — / `9b0d65496dd5b18e0835d405920e7d63a26b5db5b5d1bc3af2cc3168e164c428` |

覆盖判据：**AC-09/AC-10/AC-11/AC-14/AC-15/AC-16/AC-19/AC-20/AC-22**、T-07/T-10/T-11/T-12/T-15 的编排侧确定性测试
（桌面呈现/真实 Git/真机由桌面 B3/B4/B5 与独立验收执行）。

## 1. 实施内容（按写集）

### 1.1 `src/common/编排/workflow-service.ts`（M）：应用自有 merge-main 发布合并通道（AC-11/AC-14/AC-22/T-10）

**MF-IR-8 遵守**：**未新增 `requestReleaseMerge`**（`RoleToolId` 仍 14 项；本文件零导出该名）；合并通道 = 应用服务
（前置校验/preview 事实/账本事件/客户本人确认/固定 argv 端口），桌面 B3 构造 `merge-main` 非判断卡。

- `ReleaseGitPort`（桌面 B3 注入真实 Git；**只本地、无 push/tag**）：
  `inspectRepository`（分支/HEAD/main OID/tracked+非忽略 untracked/.gitignore hash/tracked-dirty）、
  `previewMerge`（branch↔main files/fileCount/diffStat/diffDigest）、
  `mergeMain`（固定 argv；main unborn ⇒ `mergeKind:"initial"`；main 存在 ⇒ `merge --no-ff`；冲突 abort 回任务分支）。
- `prepareReleaseMerge`（呈卡前）：
  - 公共前置：workflow 在 A13/B4（或在 A12b→A13 / B3→B4 合法推进处；服务写 `stage.requested A13|B4`）、
    basis 未漂移（`verifyBasisForWorkflow`）、当前分支=`ans/task/<workflowId>`、tracked 修改/删除=0、
    非忽略 untracked=0、`.gitignore` 字节 hash = `basis.repo.gitignoreSha256`、同一 workflow 无开放 release；
  - **A13** ⇒ A12b accepted + `docs/acceptance/<flowId>-acceptance-vN.md` 归档已写入（按 workflowId 绑定；
    归档记录的 report path+sha256 若存在则复核字节，漂移 ⇒ `basis-drift`）；
  - **B4** ⇒ B3 accepted + 运营报告（本 workflow 任务上 convener 的 done 报告；**不要求 A12b**）；
  - 任一缺失 ⇒ `release-workflow-not-ready`（附路径 + `missing[]`），**不发卡、不写 `release.requested`**；
  - evidence 逐路径重算字节 SHA-256 比对（不一致 ⇒ `release-unauthorized`）；
  - 写 `release.requested`（`operationId/summary/evidence/baseOid/tipOid/mergeKind`）+ 返回
    `ReleaseMergePreview`：workflowId/flowId、main base OID、branch tip OID、**分支基点 OID
    `branchBaseOid` + `nonMainBaseline`（AC-22/G-2 非 main 基线披露）**、文件数、diff stat、合并方式、
    高风险提示（`HIGH_RISK_MERGE_NOTES`）；同 tip 重复 prepare ⇒ replay；已合并 ⇒ `release-already-merged`。
- `executeReleaseMerge`（执行）：**客户本人确认唯一有效来源**（缺失/`by:"judge"` ⇒ `release-unauthorized`，
  不写 confirmed/merged）；执行前复核 basis/分支/tip/工作区漂移（workflow stopping ⇒
  `release-workflow-not-ready`）；写 `release.confirmed(by:"customer")` →
  端口 `mergeMain`；冲突/失败写 `release.failed` + `stage.blocked`（不 force/reset/clean，workflow 不关闭）；
  成功写 `release.merged`（baseOid/tipOid/mergeOid/mergeKind/files/diffDigest）→ `stage.completed A13|B4`
  （cause `release-merged`）→ `workflow.closed delivered`（带 releaseId）；幂等 `release:<workflowId>:<tipOid>`；
  已合并 ⇒ no-op 成功（`alreadyMerged:true`，`code:"release-already-merged"`）；端口回执 tip/kind/base 不一致 ⇒
  `release-merge-failed` fail-closed。
- `rejectReleaseMerge`：客户本人拒绝或 **judge 转人工/拒绝**（`release.rejected.by` ∈ customer|judge）+
  `stage.blocked release-rejected`；replay 幂等；拒绝后执行 ⇒ `release-rejected`。
- 事件/键 helper：`releaseIdFor`、`releaseIdempotencyKey`（逻辑键 `release:<wf>:<tip>`）、
  `releaseEventIdempotencyKey`（事件级键）、`taskBranchName`、`HIGH_RISK_MERGE_NOTES`。
- **judge 来源不冒充客户**：`release.confirmed.by` 只能 `"customer"`（服务双检）；`merge-main` 仍为
  应用自有非判断卡（模型 `GOVERNANCE_CARD_GROUP` 无该键；本批未改 Model，测试断言）。
- **不 push/tag/发布产物**：端口只有 inspect/preview/mergeMain 三方法；测试断言无 push/tag 导出。

### 1.2 `src/common/编排/workflow-service.ts`（M）：A12 归档补齐（AC-09/AC-20）

- `archiveAcceptance` 增强：归档 frontmatter 追加 `idempotencyKey: acceptance:<workflowId>:<reportSha>`
  （`acceptanceIdempotencyKey` 导出）；replay 判定接受 reportSha256 行或 idempotencyKey 行；
  版本仍随 report 版本（`<flowId>-report-vN.md` ⇒ `docs/acceptance/<flowId>-acceptance-vN.md`）；
  同版本不同 report ⇒ `acceptance-archive-failed`（不覆盖）；写失败 ⇒ `acceptance-archive-failed`。
- 新增 `findAcceptanceArchive({projectRoot, flowId, workflowId})`：取最高版本且 `workflowId` 匹配的归档，
  返回 path/sha256/version/report path+sha256（发布前置与桌面只读展示复用）。
- `closeTask` A12b accepted + `acceptanceArchive` 证据 ⇒ `stage.completed A12` 聚合（既有 B1 行为，本批补测）；
  缺归档 ⇒ A12 不完成（阻塞 A12），归档失败不静默通过。**角色边界不变**（应用写归档、角色只读）。

### 1.3 `src/common/编排/workflow-service.ts`（M）：基线 3 件小事与路径 B（AC-10/AC-15/AC-16/T-07/T-12）

- `BaselineGitPort`（桌面 B3 注入真实 Git；固定 argv/sanitized env 由端口实现）：
  `ensureRepository({allowInit})`（A9 `git init -b main`；路径 B 既有仓库否则 `b-repository-required`；
  父仓库 `baseline-parent-repository-detected`）、`ensureGitignore`（ans-managed 块 + 仅 `.gitignore`
  baseline commit；被跟踪且 dirty ⇒ `baseline-gitignore-dirty`）、`inspectWorktree`（tracked 修改/删除 +
  非忽略 untracked）、`prepareTaskBranch({base:"head"|"main", allowReuse})`（`ans/task/<workflowId>`；
  同名他属分支 ⇒ `baseline-branch-exists`）。
- `recordBasis` 扩展：`planSha256?`（声明即断言 ⇒ `baseline-plan-hash-drift`）、`port?`（文档校验通过后、
  basis 写入前执行 Git 准备；失败不写 basis、不产生客户卡）、`baseline-operation-conflict`（同 operationId
  指向不同幂等键 ⇒ 冲突拒绝）、A9 在办门接受 `blocked`（AC-16 失败后同阶段重试）；回执追加
  `teamPlan`/`git`；`repo` 快照来自端口（state/branch/baseOid/headOid/mainUnborn/initialBranch/
  ignorePolicy/gitignoreSha256/objectFormat/identityDefaultsApplied）。
- `completeTeamPlanFixed`（`complete_team_plan` v4 应用服务）：`runId/baseDigest` 出现 ⇒
  `baseline-legacy-field-forbidden`；`actorRoleId` 提供且非 convener ⇒ `baseline-identity-invalid`；
  顺序 = 计划/文档校验 → Git 准备（init→gitignore+baseline commit→dirty→任务分支）→ `basis.recorded` →
  `stage.completed A9`；失败写 `stage.blocked A9`（code/summary/attempt）、无客户卡；同幂等键 replay。
- `preparePathBStart`（路径 B 最小准备）：既有仓库（无仓库 ⇒ `b-repository-required`，不自动 init）、
  `.gitignore` 托管块/baseline commit、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、dirty 检查、
  `basis.recorded(reason:"path-b")`（只读文档快照：只收存在文档、teamPlan=null、不产生写权、不写团队计划、
  不弹卡）；失败 `stage.blocked B1`。
- `derivePathBWriteSets`（B3 写集来源 = scope.files ∩ roster/边界）：有 roster ⇒ 模块路径前缀匹配 →
  模块属主（无/多属主 ⇒ `b-change-scope-invalid`）；治理文档仅允许策划/产品属主（否则
  `b-change-scope-requires-rapporteur`）；无 roster ⇒ `角色卡/<role>/boundary.yaml|md` 项目边界唯一属主
  （多义 ⇒ `b-change-scope-invalid`）；`.ans/**`、`角色卡/**` 永不进入实现写集。
- `recordChangeScopeDecision`（B2 `change.scope-decided`）：影响面报告字节 hash 校验、派生
  `effectiveWritesets`、幂等 `scope:<wf>:<impactSha>:<scopeDigest>`；投影据此完成 B2；越界
  ⇒ `b-change-scope-invalid`。
- 读取预算沿用 B0 `basis-guard`（32 文件 / 单文件 4 MiB / 总 8 MiB；服务对外映射
  `baseline-document-missing|unreadable|budget`）。

### 1.4 `src/common/编排/workflow-state.ts`（M，+6）：release 投影

- `stage.completed A13|B4`（cause.kind=`release-merged`）⇒ `view.releaseId = cause.ref`；
  `workflow.closed` 带 `releaseId` ⇒ 投影记录（`project_state` 只读展示对齐 release 账本）。
  其余投影语义/状态机不改。

## 2. G-IR must-fix 闭环（本批 owner 部分）

| 条件 | 状态 | 证据/说明 |
| --- | --- | --- |
| **MF-IR-8** 发布合并通道 | **闭环（编排服务侧）** | 未新增 `requestReleaseMerge`；应用自有 `prepareReleaseMerge/executeReleaseMerge/rejectReleaseMerge`；客户本人/ judge 排除 / fail-closed 前置 / 幂等 / 本地合并端口；桌面 B3 构造 merge-main 卡（本批写集外） |
| MF-IR-6 码表 | 遵守 | 新增码均为本记录登记的非客户门码；A9 对外仍 `baseline-document-*`（单点映射）；无 `role-*` 新码 |
| MF-IR-7 roster v4 | 不受影响 | 复用 B1 parser/`reviewRoleIdOfRoster`；本批未改格式/54 doc-format id |

新增稳定码（书面扩展，均非客户门；失败不产生客户卡）：`release-workflow-not-ready`、`release-unauthorized`、
`release-main-busy`、`release-merge-conflict`、`release-merge-failed`、`release-already-merged`、`release-rejected`、
`release-ledger-write-failed`、`baseline-legacy-field-forbidden`、`baseline-parent-repository-detected`、
`baseline-repository-dirty`、`baseline-gitignore-dirty`、`baseline-gitignore-malformed`（B1 既有）、
`baseline-gitignore-write-failed`（B1 既有）、`baseline-branch-exists`、`b-repository-required`、
`baseline-operation-conflict`、`b-change-scope-invalid`、`b-change-scope-requires-rapporteur`。

## 3. 桌面 B3 需要的 port/exports 签名（单一来源 = `workflow-service.ts`）

```ts
// —— 发布合并（只本地；不 push/tag）——
export interface ReleaseGitPort {
  inspectRepository(req: { projectRoot: string }): Promise<
    { ok: true; facts: WorkflowGitRepositoryFacts } | WorkflowServiceFailure>;
  previewMerge(req: { projectRoot: string; mainOid: GitOid | null; tipOid: GitOid }): Promise<
    { ok: true; files: ReleaseFileChange[]; fileCount: number; diffStat: string; diffDigest: string }
    | WorkflowServiceFailure>;
  mergeMain(req: {
    projectRoot: string; workflowId: string; flowId: string; branch: string;
    baseOid: GitOid | null; tipOid: GitOid; mergeKind: ReleaseMergeKind;
  }): Promise<ReleaseGitMergeOutcome>; // ok:{mergeKind,baseOid,tipOid,mergeOid,files,diffDigest} | failure
}
export interface WorkflowGitRepositoryFacts {
  branch: string; headOid: GitOid; mainOid: GitOid | null; objectFormat: "sha1" | "sha256";
  trackedChanges: number; untracked: string[]; gitignoreSha256: string | null; gitignoreTrackedDirty: boolean;
}
export function prepareReleaseMerge(input: {
  projectRoot: string; workflowId: string; operationId: string; summary: string;
  evidence: readonly { path: string; sha256: string }[]; port: ReleaseGitPort; now?: () => Date;
}): Promise<PrepareReleaseMergeResult>; // ok:{releaseId,releaseKey,stage:"A13"|"B4",preview,replay} | failure
export function executeReleaseMerge(input: {
  projectRoot: string; workflowId: string; releaseId: string;
  confirmation?: { by: "customer" | "judge"; decisionId?: string }; // 仅 customer 有效
  port: ReleaseGitPort; now?: () => Date;
}): Promise<ExecuteReleaseMergeResult>;
export function rejectReleaseMerge(input: {
  projectRoot: string; workflowId: string; releaseId: string;
  by: "customer" | "judge"; reason?: string; now?: () => Date;
}): Promise<RejectReleaseMergeResult>;
export function findAcceptanceArchive(input: {
  projectRoot: string; flowId: string; workflowId: string;
}): Promise<AcceptanceArchiveFacts | undefined>;
export function releaseIdFor(workflowId: string, tipOid: GitOid): string;
export function releaseIdempotencyKey(workflowId: string, tipOid: GitOid): string;
export function taskBranchName(workflowId: string): string;
export const HIGH_RISK_MERGE_NOTES: readonly string[];
// ReleaseMergePreview: workflowId/flowId/releaseId/mainBaseOid/branchTipOid/branchBaseOid/nonMainBaseline/
//   fileCount/diffStat/files/diffDigest/mergeKind/highRiskNotes

// —— 基线 / 路径 B ——
export interface BaselineGitPort {
  ensureRepository(req: { projectRoot: string; allowInit: boolean }): Promise<
    { ok: true; repository: BaselineGitRepositoryState } | WorkflowServiceFailure>;
  ensureGitignore(req: { projectRoot: string }): Promise<
    { ok: true; changed: boolean; committed: boolean; sha256: string } | WorkflowServiceFailure>;
  inspectWorktree(req: { projectRoot: string; branch?: string }): Promise<
    { ok: true; branch: string; trackedChanges: number; untracked: string[] } | WorkflowServiceFailure>;
  prepareTaskBranch(req: { projectRoot: string; workflowId: string; base: "head" | "main"; allowReuse: boolean }): Promise<
    { ok: true; branch: string; baseOid: GitOid | null; reused: boolean } | WorkflowServiceFailure>;
}
export function completeTeamPlanFixed(input: {
  projectRoot: string; flowId: string; workflowId: string; operationId: string;
  plan: { path: string; version?: number; sha256?: string }; port: BaselineGitPort;
  actorRoleId?: string; runId?: string; baseDigest?: string; now?: () => Date;
}): Promise<CompleteTeamPlanFixedResult>;
export function preparePathBStart(input: {
  projectRoot: string; flowId: string; workflowId: string; operationId: string;
  port: BaselineGitPort; now?: () => Date;
}): Promise<PreparePathBStartResult>;
export function derivePathBWriteSets(input: {
  projectRoot: string; flowId: string; workflowId: string; scopeFiles: readonly string[];
}): Promise<DerivePathBWriteSetsResult>; // ok:{writesets:[{roleId,paths[]}],source:"roster"|"boundary",roster?}
export function recordChangeScopeDecision(input: {
  projectRoot: string; flowId: string; workflowId: string; operationId?: string;
  impactReport: { path: string; sha256: string };
  scope: { summary: string; files?: string[]; rationale?: string };
  requestTaskId: string; now?: () => Date;
}): Promise<RecordChangeScopeDecisionResult>;
export function acceptanceIdempotencyKey(workflowId: string, reportSha256: string): string;
```

端口失败码约定（真实原因 fail-closed）：`b-repository-required`、`baseline-git-init-failed`、
`baseline-parent-repository-detected`、`baseline-gitignore-dirty`、`baseline-gitignore-malformed`、
`baseline-gitignore-write-failed`、`baseline-branch-exists`、`release-main-busy`、`release-merge-conflict`、
`release-merge-failed`（其余非空稳定码由服务原样落 `release.failed`/返回）。
**真实 Git 端口（app/desktop 实现）不在本批写集**；桌面 B3 调用 `ensureProjectGitignore` 等既有 helper 实现端口内步骤。

## 4. 测试与证据

### 4.1 typecheck

`npm run typecheck` → **exit 0**（before/after 均 0；证据 02/03）。

### 4.2 `test/编排` before/after（同一命令：`node --test --test-concurrency=1 --test-force-exit --test-reporter=tap "test/编排/**/*.test.ts"`）

| | 文件数（含新增） | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| before（基线 e104f12） | 123 | 1,265 | 1,239 | 24 | 2 |
| after（本批工作树） | 127 | 1,291 | 1,265 | 24 | 2 |

- **失败名集合 diff：BEFORE−AFTER = 0、AFTER−BEFORE = 0（IDENTICAL）**；24 known-red 逐名一致；
  新增确定性失败 = 0；新 skip = 0；既有失败无消失。
- 新增 26 测试（targeted 26/26，证据 04）：

| 文件 | tests | 覆盖 |
| --- | --- | --- |
| `test/编排/release-merge.test.ts`（新） | 11 | A13 前置（A12b+归档）/B4 前置（B3+运营报告，不要求 A12b）/缺项 `release-workflow-not-ready`/basis·.gitignore·分支·dirty 呈卡前拒绝/main unborn initial + 客户本人执行 + stage.completed A13 + workflow.closed delivered + releaseId 投影/冲突 `release-merge-conflict`+`stage.blocked`/judge·缺失确认 `release-unauthorized`/judge 拒绝/客户拒绝/已合并 no-op/幂等/审计字段/无 requestReleaseMerge/merge-main 不进 judge 分组/端口无 push·tag |
| `test/编排/acceptance-archive.test.ts`（新） | 3 | 版本随 report 递增/归档 frontmatter（flowId/workflowId/criteria/report path+sha256/结论/幕僚决策/时间/idempotencyKey）/幂等 replay/同版本不同 report 不覆盖/写失败 `acceptance-archive-failed`/缺归档阻塞 A12/A12b+归档 ⇒ `stage.completed A12` 聚合 |
| `test/编排/baseline-service.test.ts`（新） | 9 | complete_team_plan v4 Git 顺序（init→gitignore→dirty→branch）/basis.recorded(repo)+A9 完成/幂等 replay/git init·父仓库·dirty·gitignore-dirty·branch-exists 失败码+stage.blocked A9+不写 basis/文档预算（32 文件·4 MiB·8 MiB）/团队计划结构/legacy 字段/operationId 冲突/非运营发起/分支复用 allowReuse/不触 trunk·runs·无客户卡 |
| `test/编排/path-b-baseline.test.ts`（新） | 5 | preparePathBStart（既有仓库不自动 init/从 HEAD 建分支/basis reason=path-b 只读快照/不写团队计划/不弹卡）/无仓库 `b-repository-required`/dirty/写集派生 roster 属主·越界·.ans·角色卡/无 roster 边界唯一属主·多属主·治理文档 `b-change-scope-requires-rapporteur`/recordChangeScopeDecision（B2 完成/幂等/漂移/越界） |

未新增 skip/force-exit（测试内）；未启动真实模型/Electron；旧测试文件/断言未改（仅新增 4 文件 + 2 源文件）。

### 4.3 只读回归

- `test/roles/**`：**275/275 pass**（证据 08）。
- `test/门禁引擎/**`：**499/493/5/1**（证据 09；5 个 known-red 与 B2 记录逐名一致，无新增/无恶化）。
- `test/runtime-core/**`：**577/540/33/4**（证据 10；33 个失败名与 B1 记录 worktree 环境基线逐名一致，
  diff = 0；worktree `.git` 为文件导致的环境性失败，非本批引入）。

## 5. 候选（本角色 B3 写集）

### 5.1 逐文件（raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts`（M） | `e5b247b2cadd6bbd489054eb43994f147f9183ffe8b0509c1103c3fba20a43b8` | 183,365 | 3,991 |
| `src/common/编排/workflow-state.ts`（M） | `8fb4e22a940db785e03bd99a0cf2188555ee4cd3f0e3140afe33d94ec56e5f05` | 21,101 | 442 |
| `test/编排/release-merge.test.ts`（新） | `0060b8dfba6ac1ca2855534fc6772686c36c4013b9f1f5961e06b0769e258357` | 32,111 | 703 |
| `test/编排/acceptance-archive.test.ts`（新） | `ccfdff80a77ec482b56c3605f87c9ac2b96b1d32c2c16d31d6954488db4f9eda` | 11,454 | 228 |
| `test/编排/baseline-service.test.ts`（新） | `beb0c23b9b6da3f7f86fc49500ce0f5eb5e93cd4427db35caae0b6aa6509e91e` | 23,479 | 515 |
| `test/编排/path-b-baseline.test.ts`（新） | `4500b602281914afd2d4ec96429eeb7d371f22ec1d3a3814bfe9569c7a9d64aa` | 18,824 | 417 |

- 6 文件合计 **290,334 bytes**；git numstat（M）：`+1601/−4`（workflow-service）、`+6/−0`（workflow-state）。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256）：
  `ded2f4dad8e794ccbeebc6752dbbccefca8f5611ff23580e9e6e14e321fdd23a`（证据 07，可复算）。

### 5.2 写集外 diff=0（实测，证据 06）

- `git status --porcelain -- src app test` 恰为上述 6 文件；`src/model`、`src/provider`、`src/common/roles`、
  `src/common/门禁引擎`、`src/common/gates`、`app` 零 diff；`package.json`/`package-lock.json` 零 diff（无新依赖）。
- 未改其它角色文档；本批仅新增本记录与 `_evidence/`（会话开始前已存在的其它角色未跟踪文档不属于本批，见基线状态口径）。

## 6. 限制与披露

1. **真实 Git 未在本批执行**：`ReleaseGitPort`/`BaselineGitPort` 由桌面 B3（`app/desktop/**`，本批写集外）注入
   真实实现（固定 argv/sanitized env）；本批以 fake port 覆盖服务层顺序/前置/失败面/幂等/审计。`git init -b main`、
   `merge --no-ff`、`merge --abort` 的实际命令行为以桌面 B3 实现与 B4/B5 真机为准。
2. **merge-main 卡呈现不在本批**：应用服务返回 preview 与事件；卡片构造/呈现/客户输入通道属桌面 B3。
   本批以 Model 断言（`GOVERNANCE_CARD_GROUP` 无 merge-main、`governanceCardGroup("merge-main")===undefined`）
   与 judge 拒绝测试保证「非判断卡/仅客户本人」。
3. **A13 运营报告**：按 §6.4 公共前置实现（convener 在本 workflow 任务上的 done 报告）；B4 的运营报告由
   AC-11 明确要求，A13 同时保留该公共前置（对本 workflow 真实运行不构成额外客户门）。
4. **拒绝后重试语义**：`release.rejected` 对同一 tip 为终态（幂等键 `release:<wf>:<tip>`），重发需新 tip/新提交
   或人工处理；失败（`release.failed`）可在同 tip 重试（再次 execute）。已在服务注释披露。
5. **路径 B 分支复用**以 `basis.recorded(basis.amended).repo.branch` 为归属证据（§5.2 G-8）；首次准备在分支创建后
   失败（basis 尚未写）时，同 workflow 重试可能 `baseline-branch-exists`，需新 workflowId/人工核对（设计口径）。
6. 未新增依赖；54 doc-format id 不变；未改 `src/model/**`/`src/provider/runtime/**`/角色模块/门禁引擎/`app/**`。
7. 未运行真实模型/Electron/真机全链；未占用 9222/9223；测试环境 Windows；套件复跑使用 `--test-force-exit`
   （环境适配，before/after 同一命令）。

## 7. 未提交声明

- 本记录与 `_evidence/` 仅写入本角色 `docs/change/` 目录（任务精确写集）；产品/测试代码变更仅限 §1/§5 写集。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 8. 证据索引（同目录 `..._evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` / `00-baseline-status.txt` | 基线 HEAD `e104f12`；基线 `git status --porcelain -- src app test` 为空 |
| `01-before-test-orch.tap` / `01-before-failure-names.txt` | before 全量 TAP（1,265/1,239/24/2）；24 失败名 |
| `02-before-typecheck.txt` | 基线 `npm run typecheck` exit 0 |
| `03-after-typecheck.txt` | 收尾 `npm run typecheck` exit 0 |
| `04-targeted-tests.tap` | 新增 4 文件定向 TAP（26/26 pass） |
| `05-after-test-orch.tap` / `05-after-failure-names.txt` / `05-failure-names-diff.txt` | after 全量 TAP（1,291/1,265/24/2）；失败名集合一致（diff 空） |
| `06-write-set-status.txt` | 写集/禁改目录/依赖零 diff |
| `07-candidate-hashes.txt` | 候选逐文件 hash/bytes/lines/numstat/聚合 |
| `08-roles-readonly.tap` | `test/roles/**` 只读回归（275/275） |
| `09-gates-readonly.tap` | `test/门禁引擎/**` 只读回归（499/493/5/1，5 known-red 逐名一致） |
| `10-runtime-core-readonly.tap` / `10-runtime-core-fails.txt` | `test/runtime-core/**` 只读回归（577/540/33/4；33 失败名与 B1 环境基线一致） |
