# 运行时核心 C1 契约冻结记录：trunk / 版本变更申请 / 冻结 / stable-write / 重构（Model 层）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；运行时核心（独立固定上下文）；Batch 1 **C1（Model 契约冻结）**。
- **日期 / 状态**：2026-11-04；**C1 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / 实际字节 SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` / 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`。
- **本角色 P1 提案（实现依据）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md` **r2**：927 行 / `8b0c3d1969a03785e431a2f55b8a4ab5b65d62dd0715da0e6f407b945aaa9e00`。
- **PM 复审（F13/F14 冻结条件来源）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：451 行 / `1a73ebc6…`（任务输入口径）；复审结论 `recommend approval（附冻结条件）`。
- **团队计划增量**：`docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md`：468 行 / `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5`（§10.4/§10.5/§10.6）。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`；改动前 `git status --porcelain -- src test` 为空。

## 一、结论

- **C1 冻结通过（本节点写集）**：`trunk/v1`、`trunk-amendment/v1`、`trunk-apply-journal/v1`、`version-change/v1`、`doc-freeze/v1`、`stable-write/v1`、`refactor-request/v1` 的 Model 形状/状态/错误码与六类账本事件已落地；`npm run typecheck` exit 0；新增 23 个契约测试全部通过；runtime-core 既有套件无新增失败（失败与 B0 基线一致，均为 Windows symlink EPERM）。
- **F13 已关闭（C1 侧）**：`StableWritePermit` 为唯一 permit 形状；无第二套 permit 状态枚举；record/permit 分表契约与门禁输入语义已冻结。
- **F14 已关闭**：`StableWriteEvent` 增可选 `approvedAt?` / `expiresAt?` / `consumedAt?`。
- **遗留依赖（不声称已完成，见 §六）**：F2 的 `stable-write` app-owned 卡种 + `GOVERNANCE_CARD_KINDS`、F6 的 `WriteGate` 内容上下文 + `src/provider/runtime/tools.ts`、`RunRepinRecord` 落点。原因：均在本次派发 C1 写集之外或与 PM 裁决（Q8/Q15）交叉；本记录如实披露，不自行扩写集。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/trunk.ts` | 新增 | 388 | `ba5367eed986ac7b5b97f427f82202e27b645a70` | `e50e11466325e4e9b4e426a43edf76cfe86baf407463966b58a2edc6adcc5be4` |
| 2 | `src/model/version-change.ts` | 新增 | 451 | `9d943fc77d29d4cb54d834c7e5af81d6bf55aef9` | `87ff10bc98ffa12e72ead4c91ef6b62862e748bfe8977f3bd5111bb691e8207c` |
| 3 | `src/model/runtime.ts` | 加法（+233/−2） | 3025 | `b796981e68dff6733727c51e3214128ffcd9857d` | `1dae1d3fce4a00e6ce62cf86e0e302de3a54293d5767cf7fcdeb5b17936263d7` |
| 4 | `test/runtime-core/trunk-contract.test.ts` | 新增 | 337 | `645218a6419f1a276b32f361398de4cff91ecbb3` | `b63ac2a3351864e47bc5e592d0c83c87bfdde3b0daa4839df11cecc536d9770f` |
| 5 | `test/runtime-core/version-change-contract.test.ts` | 新增 | 565 | `05b674dbd2a324a5bf655c99781531089426fdab` | `a8654514abfac2eda59beec38900100c1722842d7e61cdff6f0fe7f3c82ed308` |

`git status --porcelain -uall -- src test`：仅上述 5 个文件（1 修改 + 4 新增）。
**明确未改**：`src/model/decision.ts`、`src/model/project-state.ts`、`src/model/boundary.ts`、`src/model/role.ts`、`src/common/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、`app/**`、其它角色测试。

## 三、冻结的导出符号与契约版本

### 3.1 `src/model/trunk.ts`（零项目依赖；纯类型/常量）

- schema 常量：`TRUNK_MANIFEST_SCHEMA = "trunk/v1"`、`TRUNK_AMENDMENT_SCHEMA = "trunk-amendment/v1"`、`TRUNK_APPLY_JOURNAL_SCHEMA = "trunk-apply-journal/v1"`、`TRUNK_VERSION_MIN = 1`。
- 枚举/常量：`TRUNK_STABLE_FILE_KINDS`（workflow/role-card/boundary）、`TRUNK_SOURCES`（含 `"upgrade"`/`"bootstrap"`/`"recovery"`，无 `main-upgrade`）、`TRUNK_DOC_KINDS`、`TRUNK_AMENDMENT_STATUSES`（`draft|submitted|approved|rejected|applied|superseded`）、`TRUNK_AMENDMENT_LEGACY_STATUSES`/`TRUNK_AMENDMENT_LEGACY_STATUS_MAP`（proposed→submitted、confirmed→approved、cancelled→rejected）、`TRUNK_AMENDMENT_APPLY_STATES`、`TRUNK_AMENDMENT_VCA_ITEM_KINDS`/`TRUNK_AMENDMENT_LEGACY_ITEM_KINDS`、`TRUNK_AMENDMENT_CHECK_IDS`（8 项候选，P1.3 原文不可得，按 PM Q9 冻结）、`TRUNK_APPLY_JOURNAL_PHASES`（含 `"committed"`）、`TRUNK_STATE_OPS`（含 `"stable-repinned"`）、`TRUNK_STATE_LEGACY_OPS`（`drift`/`unfrozen-expired` 仅旧读）、`TRUNK_STATE_CUSTOMER_OPS`/`TRUNK_STATE_APPLICATION_OPS`、`TRUNK_ERROR_CODES`（无 `trunk-drift`）。
- 类型：`TrunkStableFileKind`、`TrunkSource`、`TrunkDocKind`、`TrunkArtifactRef`、`TrunkExecutionRef`、`TrunkStableArtifactRef`（含 `kind`/`confirmationId`/`decisionId`）、`TrunkVersionRef`、`TrunkManifest`（含 `artifacts.roleCards?`、`runId: string | null`）、`TrunkAvailability`、`TrunkStateView`（含 `roleCards?`）、`TrunkAmendmentStatus`、`TrunkAmendmentApplyState`、`TrunkAmendmentItemKind`、`TrunkAmendmentItemChange`、`TrunkAmendmentItemResult`、`TrunkAmendmentItem`、`TrunkAmendmentDoc`（`baseTrunk: TrunkVersionRef | null` + `bootstrap?`）、`TrunkAmendmentState`（含 `applicationId?`/`applyState`）、`TrunkAmendmentCheckId`、`TrunkAmendmentCheck`、`TrunkApplyJournalPhase`、`TrunkApplySnapshot`（含 `roleCards?`）、`TrunkApplyJournal`、`TrunkStateOp`、`TrunkStateLegacyOp`、`TrunkErrorCode`。

### 3.2 `src/model/version-change.ts`（只 type-import `./trunk.ts`；纯类型/常量）

- schema/常量：`VERSION_CHANGE_SCHEMA`、`DOC_FREEZE_SCHEMA`、`STABLE_WRITE_SCHEMA`、`REFACTOR_REQUEST_SCHEMA`、ID 正则（`vc-`/`rf-`/`sw-`/`am-`）、`VERSION_CHANGE_SUMMARY_MAX`、`REFACTOR_REASON_MAX`、`STABLE_WRITE_PERMIT_TTL_MS`（30 分钟）。
- VCA：`VERSION_CHANGE_KINDS`、`VERSION_CHANGE_STATUSES`、`VERSION_CHANGE_INITIATOR_BY_KIND`、`VERSION_CHANGE_CUSTOMER_STATUSES`（approved/rejected）、`VERSION_CHANGE_APPLICATION_STATUSES`（submitted/applied/superseded）、`VersionChangeTargetKind`、`VERSION_UPGRADE_TARGET_KINDS`、`DETAIL_AMENDMENT_TARGET_KINDS`、`VCA_FORBIDDEN_TARGET_KINDS`（workflow/boundary/product-intent）、`VersionChangeTarget`、`VersionChangeRecord`（`baseTrunk: TrunkVersionRef | null` + `bootstrap` + `applicationSha256`）、`VERSION_CHANGE_ERROR_CODES`（含 `vca-conflict`/`vca-hash-drift`）。
- 冻结：`DocFreezeReason`（9 类）、`DOC_FREEZE_REASONS`、`DOC_FREEZE_CUSTOMER_REASONS`、`DOC_FREEZE_APPLICATION_REASONS`、`DOC_FREEZE_BASELINE_EVENT_KINDS`（`frozen`/`draft-updated`/`draft-marker`）、`DocFreezeOrigin`、`DocFreezeRecord`（`applicationId` 非空约定）、`DocMigrationMark`/`DOC_MIGRATION_MARKS`（`migrated-draft` 不是 freeze reason）、`DocFreezeLookupState`/`DocFreezeLookup`（`frozen|draft|unknown` 三态）、`DOC_FREEZE_ERROR_CODES`。
- stable-write（**F13 唯一 permit 形状**）：`StableFileKind = TrunkStableFileKind`、`STABLE_WRITE_STATUSES`（record 五态）、`STABLE_WRITE_PERMIT_STATUSES`（permit 仅 `approved|consumed|expired|failed`）、`StableWriteAuthority`、`StableWriteRecord`（含 `permitId?`/`expiresAt?`/`consumedAt?`）、`StableWritePermit`（`v:1` + `permitId` + `authority` + `approvedAt` + `expiresAt` + `consumedAt?` + `baseSha256` 空串约定）、`StableWriteDecisionInput = {projectRoot, relPath, sha256, permit?: StableWritePermit, now?: () => Date}`、`STABLE_WRITE_ERROR_CODES`。
- refactor：`REFACTOR_REQUEST_STATUSES`（五值含 superseded）、`REFACTOR_REQUESTED_BY`、`REFACTOR_MANAGED_BY`、`REFACTOR_FORBIDDEN_KINDS`、`RefactorRequestScope`、`RefactorRequestRecord`、`REFACTOR_ERROR_CODES`。

### 3.3 `src/model/runtime.ts`（仅加法，不改既有字段语义）

- 事件接口（全部 `extends TaskStateEventBase`）：`TrunkStateEvent`（`op: TrunkStateOp`，含 `stable-repinned`；`path`/`oldSha`/`newSha`/`confirmationId`/`decisionId`）、`TrunkAmendmentEvent`、`VersionChangeEvent`（`vcKind`）、`DocFreezeEvent`、`RefactorRequestEvent`、`StableWriteEvent`（`stableKind` + F14 三可选时间戳）。
- 事件常量：`STABLE_WRITE_EVENT_KINDS`、`STABLE_WRITE_CUSTOMER_EVENT_KINDS`（approved/rejected）、`STABLE_WRITE_APPLICATION_EVENT_KINDS`（requested/written/failed）。
- `TaskStateEvent` 联合追加上述六类接口（联合成员 17 → 23；其中 `StableWriteEvent` 覆盖 5 个 `stable.write.*` kind，事件 kind 总数 17 → 27）。
- 客户卡：`CustomerInputAcknowledgement { id, label, required }`、`CustomerInputRequest.acknowledgments?`、`CustomerInputOutcome`（answered）`.acknowledged?: string[]`；`declined`/`unavailable` 不加。

## 四、F13 / F14 逐条关闭证据

### F13（stable permit 单一形状）

| F13 要求 | 落点/证据 |
| --- | --- |
| 以 C1 `StableWritePermit` 为唯一 permit 形状；含 `v:1`、`permitId`、`authority`（P1 union）、status 仅 `approved|consumed|expired|failed`；`approvedAt`、`expiresAt`（批准后必填）、`consumedAt?`、`baseSha256=""` 约定 | `src/model/version-change.ts` §stable-write；`STABLE_WRITE_PERMIT_STATUSES` 恰四值；契约测试「StableWritePermit 唯一 permit 形状（F13）」逐字段断言 + 负例（`requested` 非法、空 authority 非法、缺/undefined `expiresAt` 非法、第五状态非法） |
| 如需 diffPreview 作为窄视图，放门禁 `StableWritePermitView`（别名/窄视图），不得在 C1 造第二套状态枚举 | C1 文件头注释与 permit 注释明确：门禁 `StableWritePermitView`、编排 `PermitFact` 必为 `StableWritePermit` 的别名/窄视图（`Pick`/交叉），不得另造 permit 或第二套 status；C1 未定义第二个 permit 状态类型 |
| `StableWriteRecord` 与 `StableWritePermit` 分表存储（record 可含 `permitId`/`expiresAt`/`consumedAt`；不得第三形状） | `StableWriteRecord` 增 `permitId?`（按 id 关联）、`approvedAt?`/`expiresAt?`/`consumedAt?`；契约测试断言 record 不内嵌 permit（`"permit" in record === false`），且 record 五态 ≠ permit 四态 |
| `StableWriteDecisionInput` 对齐或移除；统一输入 `{projectRoot, relPath, sha256, permit?: StableWritePermit, now?: () => Date}`；C1 不实现判定（归 C2b），只定义类型/常量 | `StableWriteDecisionInput` 已按该形状冻结（`permit` 可选、`now` 为 `() => Date`）；C1 无判定函数实现；契约测试覆盖完整/最简两种输入 |
| 明确注释：门禁 `StableWritePermitView`/编排 `PermitFact` 均为别名/窄视图，不得另造形状 | `src/model/version-change.ts` 文件头与 stable-write 段注释（F13 冻结段落） |

### F14（StableWriteEvent 可选时间戳）

| F14 要求 | 落点/证据 |
| --- | --- |
| `StableWriteEvent` 增可选 `approvedAt?`、`expiresAt?`、`consumedAt?`，与 C2a `stable.write.*` 字段一致 | `src/model/runtime.ts` `StableWriteEvent`；契约测试「stable.write.* 事件五 kind + F14…」：无三字段的旧事件合法（`"approvedAt" in withoutTimes === false`），带三字段的 approved 事件合法 |
| 不得要求 C2a 校验 C1 未定义字段 | 三字段已在 C1 定义（可选）；C2a 可按存在性校验，无字段不强制 |

### 事件 attribution（AC-31/F35）

- `trunk.state`：`TRUNK_STATE_CUSTOMER_OPS`（含 `stable-repinned`）= customer；`TRUNK_STATE_APPLICATION_OPS`（`gap`）= application；`drift`/`unfrozen-expired` 仅 legacy 读，新代码不得写。`TrunkStateEvent` 注释 + 契约测试分区断言。
- `version.change`：`VERSION_CHANGE_CUSTOMER_STATUSES`（approved/rejected）= customer；`VERSION_CHANGE_APPLICATION_STATUSES`（submitted/applied/superseded）= application（applied/superseded 可携带 decisionId 供审计，不记 customer）；`draft` 非事件状态。
- `doc.freeze`：`DOC_FREEZE_CUSTOMER_REASONS`（vca-approved/version-upgrade-approved/detail-item-applied/proposal-confirmed/intent-confirmed）vs `DOC_FREEZE_APPLICATION_REASONS`（amendment-submitted/handoff-pin-bootstrap/bootstrap-vca-approved/migrated-legacy）；两分区穷尽且互斥。
- `refactor.request`：`initiatedBy:"convener"`、`managedBy:"application-scheduler"`、`origin:"application"`、无 `decidedBy`。
- `stable.write.*`：`STABLE_WRITE_CUSTOMER_EVENT_KINDS`（approved/rejected）vs `STABLE_WRITE_APPLICATION_EVENT_KINDS`（requested/written/failed）。
- `trunk.state(op:"stable-repinned")`：customer + `confirmationId`/`decisionId`；`trunkVersion` 与事件前一致（测试断言 `previousTrunkVersion === trunkVersion`），类型上无 `resultTrunkVersion` 键。

## 五、测试 / 类型检查原始结果

1. **`npm run typecheck`**（全仓 `tsc --noEmit`，include 含 `src`/`test`/`app` 除 renderer）：**exit 0**（无输出错误）。
2. **定向契约测试**：
   `node --test "test/runtime-core/trunk-contract.test.ts" "test/runtime-core/version-change-contract.test.ts"`
   → **tests 23 / pass 23 / fail 0 / skipped 0 / duration ≈ 91 ms**；exit 0。
3. **runtime-core 全量**：
   `node --test "test/runtime-core/**/*.test.ts"`
   → **tests 348 / pass 341 / fail 3 / cancelled 0 / skipped 4 / duration ≈ 14.5 s**；exit 1（仅因下述既有环境失败）。
   - 失败分类（全部为 **Windows symlink EPERM**，与 B0 既有失败一致，非本改动引入）：
     - `test/runtime-core/file-write-safety.test.ts`：「D3 linked workspace root remains usable; linked target itself is not replaced」。
     - `test/runtime-core/session-store.test.ts`：「store: traversal, mismatched scope and symlinked runtime directories rejected」「store: native validation stays lazy and native symlink is rejected before effects」。
   - **计数对照**：B0 基线 runtime-core = 325 tests / 318 pass / 3 fail / 4 skip；本次 = 325 + 23 新增 = 348 tests；318 + 23 新增 = 341 pass；fail/skip 与基线完全一致 ⇒ **无既有测试回归、无断言改写、无新增 skip**。

## 六、遗留依赖与披露（不声称已完成）

1. **F2（C1 侧）`stable-write` app-owned 卡种 + `GOVERNANCE_CARD_KINDS` 未落本节点**：
   - P1 r2/PM 复审要求 C1 把 `"stable-write"` 加入 `GovernanceCardKind` 并新增 `GOVERNANCE_CARD_KINDS` 白名单（不进 `GOVERNANCE_CARD_GROUP`）。
   - **阻塞事实**：`src/pipeline/orchestration/run-role.ts` 的 `CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind, string>>` 是穷尽表；加入新卡种会使全仓 `npm run typecheck` 失败，解锁行属编排 S3 写集（PM Q15）。本节点写集不含 `run-role.ts` 且完成定义要求 typecheck 通过，故本节点**不加入**该卡种，避免越界。
   - **建议**：由统筹在 C1b（或与编排 S3 一行同批）落 `GovernanceCardKind + GOVERNANCE_CARD_KINDS + run-role.ts` 一行；该变更纯加法，不影响本记录已冻结的事件/记录形状。
2. **F6（C1 侧）`WriteGate` 内容上下文 + `src/provider/runtime/tools.ts` 未落本节点**：该文件不在本次派发写集（任务写集未列）；`StableWriteDecisionInput`/permit 形状已冻结，待 C1b/C2b/S3 接线（第二次 `govern` 传最终字节 sha）。
3. **`RunRepinRecord` 未加入 `runtime.ts`**：P1 r2 §3.3-7 与 PM 裁决 Q8 明确放编排 `run-manifest.ts`（`runtime.ts` 不加）。任务书运行时核心写集一行提到 `RunRepinRecord`，与上述裁决冲突；按 C1 r2/PM 裁决执行，**不**在 Model 造第二份形状。若统筹确需 Model 侧类型，请另行裁决（会与编排定义重复）。
4. **`src/model/project-state.ts` 未改**：PM Q7 裁决 trunk/VCA/freeze 状态经专用 `trunk:state` 快照与面板消费，不进 `project-state/v1`。若 D1 实施证明必须并入，按既有单文件授权另案。
5. **P1.3 原文不可得**：`TRUNK_AMENDMENT_CHECK_IDS` 的 8 项候选与 P1.3 旧事件/枚举映射按 PM Q1/Q9 以本 C1 候选冻结；如后续沟通提供 P1.3 快照，逐字段核对并记录差异（不改已冻结形状，除非重开）。
6. **stable-write 契约冻结前置**：本记录关闭 C1 侧 F13/F14；C2b/C2c 冻结时必须消费同一 `StableWritePermit`/`StableWriteDecisionInput`/`DOC_FREEZE_*`/`TRUNK_STATE_*` 常量，不得另造形状或复制字面量。

## 七、依赖方向与纯类型纪律（已验证）

```text
src/model/trunk.ts            （零项目 import）
      ↑ type-only
src/model/version-change.ts   （仅 import type ./trunk.ts）
      ↑ type-only               ↑
src/model/runtime.ts ───────────┘（加法；type-import 两个新 Model 文件）
```

- `version-change.ts` 不 import `runtime.ts`；两个新文件均无 Node I/O、无文件/网络访问、无判定函数实现。
- 所有新增均为加法：不删除/不重命名既有导出，不改既有字段语义；`TaskStateEvent` 旧 kind 不变（联合成员 17 → 23）。
- 错误码为 `as const` 单一来源；无重复（测试断言）。

## 八、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 未改角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling；未运行应用；未 commit/push/merge/release。
- 后续任何形状变更回运行时核心并按 C1 冻结流程重跑受影响证据。
