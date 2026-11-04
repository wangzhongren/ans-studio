# 运行时核心 C1d 记录：Batch 3.5 提交能力工具（VCA / 重构 / stable 写入请求）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；运行时核心（独立固定上下文）；Batch 3.5 **C1d（提交能力工具）**。
- **日期 / 状态**：2026-11-05；**C1d 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push**。
- **批准记录（本节点依据）**：`docs/communication/2026-11-05_gate_closure_batch-3.5.md`：12 行 / SHA-256 `43220baf3f8c41ed9c17727d66688266501373a474643595804ed465cc341692`；确认按 Batch 3.5 执行（不新增闸门/边界、无新角色/无新 B-x），C1d = `GovernedToolsOptions` 三能力位 + 三工具/schema（注入才注册、按角色门控、只提交不批准）。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`；§4.10/§7.2 AC-9、AC-18、AC-33。
- **本角色 P1 提案 r2**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md`：927 行 / `8b0c3d1969a03785e431a2f55b8a4ab5b65d62dd0715da0e6f407b945aaa9e00`。
- **D1 P1 提案（能力位来源）**：`角色卡/桌面窗口/docs/change/2026-11-04_trunk-amendment-model-P1.md`：461 行 / `1a0b5c9a6bcbcb165e3c45c7c70408aee22d4f3f77d046a66a5b0f0219549c42`；§三-3 能力注入（`submitVersionChangeCapability?`/`submitRefactorCapability?`/`requestStableWriteCapability?`）与 F10/F11 裁决（VCA 只经角色能力工具、重构只经 convener 能力工具、无渲→主提交 IPC）。
- **C1/C1b/C1c 冻结（形状/工具面基线）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md`、`C1b-freeze.md`、`C1c-freeze.md`；本节点改动前 `runtime.ts` = C1c 冻结 `259c4e01…`（3076 行）、`tools.ts` = C1c 冻结 `4146574f…`（3911 行）、`schema.ts` = HEAD（1476 行 / `969e4614…`）。
- **C2c Service 契约（回执/错误码来源）**：`src/service/version-change/abstract/version-change-service.ts`（`VersionChangeService.submit`、`StableWriteService.request`、`RefactorValidator.validate`；`ServiceResult`）；C1 `src/model/version-change.ts` 冻结错误码 `VERSION_CHANGE_ERROR_CODES`/`STABLE_WRITE_ERROR_CODES`/`REFACTOR_ERROR_CODES`。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。工作树中其它并行节点改动不属本节点写集；本节点未触碰（§二末）。

## 一、结论

- **三能力位已落 `GovernedToolsOptions`**：`submitVersionChange?`、`submitRefactor?`、`requestStableWrite?`（`RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions, …>` 自动继承，S5/D1b 直接注入，无需改会话类型）。
- **三工具已落**：`submit_version_change` / `submit_refactor` / `request_stable_write`；**注入才注册**（能力缺席 ⇒ 工具不存在 = 最强 fail-closed）。
- **角色门控（工具层机械执行，模型不可自报身份）**：`version-upgrade` 仅 `product`、`detail-amendment` 仅 `rapporteur`；`submit_refactor` 仅 `convener`；`request_stable_write` 仅 `convener`。角色不符/未注入 ⇒ 拒绝并回 `vca-role-not-allowed`/`refactor-role-not-allowed`/`stable-write-invalid` 指引。
- **只提交、绝不批准**：成功回执 `ok:true` 只接受精确状态 `submitted`（VCA）或 `requested`（refactor/stable）；`approved`/`accepted`/`written` 等越权成功回执一律按契约外 fail-closed，不伪装成功。工具不写账本/项目文件、不发客户卡、不签发许可、不派发任务。
- **形状校验与错误码**：参数/未知键/上界错误在触达能力前拒绝，错误码对齐 C1 冻结集合（`vca-*`/`refactor-*`/`stable-write-*`）；能力回执 `errorCode` 也按同一集合复核。
- **验证**：`npm run typecheck` exit 0；新增定向测试 13/13；runtime-core 全量 370 / 363 pass / 3 fail / 4 skipped（3 个失败与 C1c/B0 基线同源，均为 Windows symlink EPERM）。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | 加法（C1c 3076 → 3189，净 +113） | 3189 | `3cab4897f6b76b004e90ceb21f655a6f0a913ddd` | `ceb27df8857066ccaabd982eb80a87a7160eb00c321295f853c124442c415baa` |
| 2 | `src/provider/runtime/tools.ts` | 加法（C1c 3911 → 4457，净 +546） | 4457 | `9b03030ea39097a3a0a1595e26f165f4ae3a5a52` | `1355e09ec9e31294b21e7b9fd9e4adeecaf030fa0f710c1a3f4276ad14529d91` |
| 3 | `src/provider/runtime/schema.ts` | 加法（+176/−1；HEAD 1476 → 1651） | 1651 | `5041c1940c01874bc21fd949dcb5a338875b197b` | `ee9139e1f8cbb84f2d95a3856f2b91ff6e70895a205baafd49aa4207d6577c98` |
| 4 | `test/runtime-core/submit-capability-tools.test.ts` | 新增 | 313 | `204bc351aefbc994ca85b38138dd8fddd67faa0c` | `25832a9f398a420f7fafdaa6d55308511f72da2f3545aed153e592b6e64dd3aa` |

- **改动前对照**：`runtime.ts` = C1c 冻结 `259c4e0193d9…`（3076 行）；`tools.ts` = C1c 冻结 `4146574f53ac…`（3911 行）；`schema.ts` = HEAD blob `43669aef…` / SHA-256 `969e4614…`（1476 行）⇒ 本节点改动全部为叠加/最小增量。
- **落点**：
  - `src/model/runtime.ts:1722-1811`（能力契约段：常量、输入/结果/Fn 类型）；`:2720-2735`（`GovernedToolsOptions` 三能力位）。
  - `src/provider/runtime/tools.ts:3683-4175`（三工具与校验/回执/调用辅助）；`:4372-4390`（`buildGovernedTools` 注册）。
  - `src/provider/runtime/schema.ts:1452-1650`（三工具 schema/描述/提示）。
- **明确未改（本节点零编辑）**：`src/pipeline/orchestration/run-role.ts`（C1c 收尾实测 = C2c 冻结 `93b78f09…`；C1d 收尾实测 `9895502d…`，系并行 S5 节点改动，非本节点）、`src/service/runtime/session.ts`（收尾实测 `e36ffc22…`，系并行 D1b/S5 节点改动，非本节点）、`app/desktop/**`、`src/service/version-change/**`、`src/common/门禁引擎/**`、`src/provider/**` 其它文件、其它角色测试、角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling。
- **命名映射**：D1 P1 §三-3 的 `submitVersionChangeCapability?`/`submitRefactorCapability?`/`requestStableWriteCapability?` 在本轮批准记录下冻结为 `GovernedToolsOptions.submitVersionChange?`/`submitRefactor?`/`requestStableWrite?`（字段名即契约）；D1b 注入时按后者。

## 三、冻结的契约（增量）

```ts
export const VCA_SUBMISSION_TARGETS_MAX = 64;
export const VCA_SUBMISSION_PATH_MAX_CHARS = 500;
export const REFACTOR_SCOPE_ITEMS_MAX = 64;
export const STABLE_WRITE_CONTENT_MAX_CHARS = 262144;

export interface SubmitVersionChangeInput {
  kind: VersionChangeKind;                       // version-upgrade | detail-amendment
  initiatorRoleId: VersionChangeInitiatorRoleId; // 工具从 scope.roleId 填入（product/rapporteur）
  flowId: string;
  summary: string;
  targets: VersionChangeTargetSubmission[];      // {kind,path,action,from?,roleId?}
  amendmentId?: string;
  amendmentDocPath?: string;
  bootstrap?: boolean;
}
export interface SubmitVersionChangeResult {
  ok: boolean;
  applicationId?: string;
  status?: VersionChangeStatus;
  errorCode?: VersionChangeErrorCode;
  message?: string;
}
export type SubmitVersionChangeFn = (input: SubmitVersionChangeInput, signal?: AbortSignal) => Promise<SubmitVersionChangeResult>;

export interface SubmitRefactorInput {
  roleId: string;                                // 工具填入（恒 convener）
  flowId: string;
  title: string;
  reason: string;
  scope: RefactorRequestScope;                   // {modules,paths,roles}
}
export interface SubmitRefactorResult { ok: boolean; requestId?: string; status?: RefactorRequestStatus; errorCode?: RefactorErrorCode; message?: string; }
export type SubmitRefactorFn = (input: SubmitRefactorInput, signal?: AbortSignal) => Promise<SubmitRefactorResult>;

export interface RequestStableWriteInput {
  roleId: string;                                // 工具填入（恒 convener）
  kind: "workflow";                              // 仅 docs/workflow.md
  content: string;                               // 完整提议内容（app 计算 base/target hash）
}
export interface RequestStableWriteResult { ok: boolean; requestId?: string; status?: StableWriteStatus; errorCode?: StableWriteErrorCode; message?: string; }
export type RequestStableWriteFn = (input: RequestStableWriteInput, signal?: AbortSignal) => Promise<RequestStableWriteResult>;
```

`GovernedToolsOptions` 三字段：`submitVersionChange?: SubmitVersionChangeFn`、`submitRefactor?: SubmitRefactorFn`、`requestStableWrite?: RequestStableWriteFn`。

## 四、工具契约（名称 / 注册 / 门控 / 回执）

| 工具 | 注册条件 | 角色门控 | 成功回执（工具层强制精确匹配） | 失败回执 code 集合 |
| --- | --- | --- | --- | --- |
| `submit_version_change` | 注入 `submitVersionChange` | `version-upgrade` 仅 `product`；`detail-amendment` 仅 `rapporteur` | `{ok:true, applicationId:"vc-<n>", status:"submitted"}` | `VERSION_CHANGE_ERROR_CODES`（`vca-*`） |
| `submit_refactor` | 注入 `submitRefactor` | 仅 `convener` | `{ok:true, requestId:"rf-<n>", status:"requested"}` | `REFACTOR_ERROR_CODES`（`refactor-*`） |
| `request_stable_write` | 注入 `requestStableWrite` | 仅 `convener` | `{ok:true, requestId:"sw-<n>", status:"requested"}` | `STABLE_WRITE_ERROR_CODES`（`stable-write-*`） |

- 工具层拒绝（形状/角色/未知参数）统一为 `ok:false` + 人话 + `[技术 code：<冻结码>]`；能力不会被调用。
- 能力调用恰好一次（`raceAbort` 包裹 `signal`）；中止/异常 ⇒ `ok:false`「未提交」，不重试、不伪造。
- 回执复核：`ok` 必须为布尔；成功时 id 必须匹配 `^vc-\d+$`/`^rf-\d+$`/`^sw-\d+$` 且状态精确为 `submitted`/`requested`、不得带 `errorCode`；失败时 `errorCode`（若有）必须属于对应冻结集合、`status`（若有）必须属于 C1 状态集合；契约外回执一律 fail-closed。
- schema 单一来源：`src/provider/runtime/schema.ts`（`additionalProperties:false`、冻结枚举/上界、`executionMode:"sequential"`）。

## 五、客户主权 / AC 支撑

- **AC-9（UI 入口）**：三工具只为发起角色会话注册对应能力（product/rapporteur/convener）；客户侧无提交工具/无渲→主提交 IPC（D1b 保持）。
- **AC-18（客户卡/通道）**：VCA 提交只产生 `submitted`，客户卡/批准仍由治理会话通道与 B-8/S4 处理；工具不弹卡、不代选。
- **AC-33（stable 确认即写）**：`request_stable_write` 只提交 `docs/workflow.md` 内容，客户 `stable-write` 确认卡与许可/写入仍归 B-11/S4；工具不签发许可、不直接写。
- **F10/F11（D1 裁决）**：VCA 只经发起角色能力工具、重构只经 convener 能力工具；工具层无任何直接写盘/派发/审批路径。

## 六、测试 / 类型检查原始结果

1. **`npm run typecheck`**（全仓 `tsc --noEmit`，include 含 `src`/`test`/`app` 除 renderer）：**exit 0**。
2. **定向**：`node --test "test/runtime-core/submit-capability-tools.test.ts"` → **tests 13 / pass 13 / fail 0 / skipped 0**；exit 0。
3. **runtime-core 全量**：`node --test "test/runtime-core/**/*.test.ts"` → **tests 370 / pass 363 / fail 3 / cancelled 0 / skipped 4 / duration ≈ 14.5 s**；exit 1（仅既有环境失败）。
   - 失败分类（全部为 **Windows symlink EPERM**，与 C1c/B0 基线同源，非本改动引入）：`file-write-safety` D3 linked workspace 1 例；`session-store` 2 例。
   - **计数对照**：C1c 基线 = 357 tests / 350 pass / 3 fail / 4 skip；本次 = +13 新增 = 370 tests / 363 pass；fail/skip 完全一致 ⇒ **无既有测试回归、无断言改写、无新增 skip**。

## 七、S5 / D1b 接线契约（不声称已完成）

1. **注入点**：S5 `run-role.ts` 与 D1b `session.ts` 按治理身份把能力函数放进 `RuntimeSessionOptions`（继承 `GovernedToolsOptions`）：
   - `product` 会话：仅 `submitVersionChange`（工具层再按 kind 拒绝 detail）；`rapporteur` 会话：仅 `submitVersionChange`（工具层拒绝 upgrade）；
   - `convener` 会话：`submitRefactor` + `requestStableWrite`；
   - 其他角色：不注入（工具不存在）。
2. **能力实现**（S5/D1b）：
   - `submitVersionChange(input)`：调用 C2c `vca.create({kind, initiatorRoleId: input.initiatorRoleId, flowId, baseTrunk: <trunk.current() 或 null+bootstrap>, targets: input.targets, amendmentId?, amendmentDocPath?, summary, at})` → `vca.submit({applicationId, at})`；返回 `{ok, applicationId, status:"submitted"}` 或 `{ok:false, errorCode, message}`。
   - `submitRefactor(input)`：分配 `rf-<n>`，调用 `validateRefactorSubmit({requestId, flowId, roleId: input.roleId, title, reason, scope, at}, {flowExists, allowedModuleRoots})`，成功后插入记录/发 `refactor.request`；返回 `{ok, requestId, status:"requested"}`。
   - `requestStableWrite(input)`：调用 `stableWrite.request({roleId:"convener", kind:"workflow", content, at})`；返回 `{ok, requestId, status:"requested"}`。批准/发卡/`completeWrite`/mini re-pin 仍归 B-11/S4/D1。
3. **回执纪律**：工具只接受精确成功状态；S5 若在成功路径返回 `approved`/`accepted`/`written` 等，工具将按契约外回执拒绝（fail-closed）。失败必须带对应冻结 `errorCode`（可附 `message`）。
4. **不得新增渲→主提交 IPC**：VCA/refactor/stable 提交只经角色能力工具（D1 裁决 F10/F11）；桌面只做只读展示/重发卡/状态外显。

## 八、遗留依赖（不声称已完成）

1. **S5**：`run-role.ts` 能力注入与回执分流；`trunk-service` 的 refreeze/abandonUpgrade/history（同批，不属本节点）。
2. **D1b**：`session.ts` 注入三能力并接 refreeze/abandon/history IPC；stable-write 卡/许可安装/结果外显。
3. **B-11/S4**：stable-write 请求的发卡、批准、许可安装、写入门禁消费、`completeWrite` 与 mini re-pin。
4. **C2a（C1b 遗留）**：`isGovernanceCardKind` 改读 `GOVERNANCE_CARD_KINDS` 白名单，确保 `stable-write` 卡可记账（与 F6 无关，S3/D1 记账前完成）。
5. **测试角色 D-04**：Batch 3.5 词面裁定（同批，不属本节点）。

## 九、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 未改角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling；未运行应用；**未 commit / 未 push / 未 merge / 未 release**。
- 后续任何形状/错误码变更回运行时核心并按 C1d/C1c/C1 冻结流程重跑受影响证据。
