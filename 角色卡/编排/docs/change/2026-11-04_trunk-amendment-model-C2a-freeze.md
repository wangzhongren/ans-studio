---
id: trunk-amendment-model-c2a-freeze
type: change
title: 契约冻结记录：trunk-amendment-model C2a（账本事件白名单与逐 kind 校验）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: frozen
related: [trunk-amendment-model]
events:
  - date: "2026-11-04"
    kind: created
    summary: C2a 冻结完成（TASK_EVENT_KINDS 17→27、逐 kind 校验、F14 关闭）；未 commit/push
---

# 契约冻结记录：trunk-amendment-model C2a（编排账本事件契约）

- **角色 / 任务 / 节点**：编排（Orchestration）/ `2026-11-04-trunk-amendment-model` / Batch 1 **C2a（账本事件契约冻结）**。
- **状态**：**C2a 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/changelog/memo/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`（§4.4/§4.5/§4.5.1/§5.5/§7.2 AC-1–AC-36/§10）。
- **本角色 P1 提案（实现依据）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`：610 行 / `895fe6a90d42c328684244d926381dbc0f97a5df1642beef6b8578736d359c44`（§3.6 C2a 契约、§7.1 冻结依赖）。
- **PM 复审（F13/F14/F16 冻结条件来源）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：451 行 / `1a73ebc6d2d0fb1776999522d1fec326e5c1eee3cab205d8a506fee7b9abcb8c`；结论 `recommend approval（附冻结条件）`。
- **C1 冻结记录（事件形状/常量单一来源）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md`：126 行 / `3134f6cb1b4510e9b7132e4c8350f964d159475e322fdb007099da6fa826fbd6`。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **C2a 冻结通过（本节点写集）**：`src/common/编排/task-state.ts` 的 `TASK_EVENT_KINDS` 由 **17 → 27** 类（新增 1 + 1 + 1 + 1 + 1 + 5：`trunk.state`、`trunk.amendment`、`version.change`、`doc.freeze`、`refactor.request`、`stable.write.requested/approved/rejected/written/failed`），并新增六类事件的逐 kind 读侧校验。
- **单一来源纪律**：事件联合同一份 = C1 `model/runtime.ts`；状态/归属/分区全部**消费** C1 常量（`TRUNK_STATE_*`、`VERSION_CHANGE_*`、`DOC_FREEZE_*`、`STABLE_WRITE_*`、`REFACTOR_*`、`TRUNK_AMENDMENT_*`、`TRUNK_STABLE_FILE_KINDS`），未复制字面量、未另造同义枚举（C1 冻结记录 §六-6 要求）。
- **F14 已关闭（C2a 侧）**：`StableWriteEvent.approvedAt?/expiresAt?/consumedAt?` 仅按「给出才校验 ISO 形状」处理；C2a **不要求** C1 未定义字段，缺失三字段的旧/简形状事件合法。
- **旧兼容**：旧事件（task/request/approval/project/version.decision）照常读；`trunk.state` 的 `drift`/`unfrozen-expired` 与 `trunk.amendment` 的 `proposed`/`confirmed`/`cancelled` 仅作旧账本读兼容；未知 kind（含未来事件）记坏行、跳过、不阻塞、不丢数据；`TaskRecord` 语义不变（新事件不进入任务记录）。
- **验证**：定向测试 20/20 通过；`test/编排` 全量 808 tests / 807 pass / 1 fail（基线既有 Windows symlink EPERM）/ 0 skip；C2a 写集限定 `tsc` **exit 0**。全仓 `npm run typecheck` 在 C2a 写盘后首次运行为 **exit 0**；完成复核时因**并行 C2c 在途文件**（`src/service/version-change/impl/**`，写盘时间晚于本节点）报类型错误（均不在 C2a 写集，清单随其在途进度变化），如实披露（见 §六-3）。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/编排/task-state.ts` | 修改（白名单 + 六类事件校验 + 重放排除） | 1217 | `5cbe308dba0f720b981564f72b355928f97da321` | `8c626b1818d44ea64e9f37c03f3adc6a3876133f2c5225ab69b6b1a75a91df0b` |
| 2 | `test/编排/trunk-events.test.ts` | 新增（C2a 事件契约测试） | 332 | `4a18d6b39779073e89b875fa40c56c1f932b287e` | `7cd14d01cbe4c3e17549183af92cdb83d4d2e81ec48082f17e370f2525ec937b` |

本节点未改：`src/model/**`（C1 属主）、`src/common/门禁引擎/**`、`src/service/**`、`src/pipeline/**`、`app/**`、其它角色测试、角色卡/边界/communication/acceptance/scheduling。
工作区里另见 C1 Model 与其它角色/并行节点的既有改动（如 `src/model/trunk.ts`、`src/model/version-change.ts`、`src/model/runtime.ts`、i18n、`src/service/version-change/**` 等），**不属于本节点，未触碰**。

## 三、事件 kind / 校验矩阵（读侧，`validateEvent`）

> 逐 kind 校验以 C1 冻结类型为准；字段「给出才校验」表示可选。错误一律 `{ok:false,message}` → 坏行跳过并诊断，不抛、不阻塞其它行。

| kind | 必填与值域（消费的 C1 常量） | 归属校验（§5.5/AC-31/F35） | 旧兼容 |
| --- | --- | --- | --- |
| `trunk.state` | `op` ∈ `TRUNK_STATE_OPS`；`trunkVersion` 正整数 ≥ `TRUNK_VERSION_MIN`；`previousTrunkVersion` 可选正整数；`source` ∈ `TRUNK_SOURCES`；`highRisk.acknowledged` 只允许 `true`；`runId` 为 `isRunId` 或 `null`；`flowId` 为 slug；`scope`/`highRisk.items` 有界数组；`decisionId`/`confirmationId`/`amendmentId`/`journalId`/`reason`/`message`/`channel` 给出须非空串 | 客户 op（`TRUNK_STATE_CUSTOMER_OPS`，含 `stable-repinned`）⇒ `origin:"customer"` + `decidedBy:"customer"`；应用 op（`TRUNK_STATE_APPLICATION_OPS`，`gap`）⇒ `origin:"application"`、`decidedBy` 缺省。**`stable-repinned`** 另需：`path` 非空、`oldSha` 为 `""` 或 64 hex、`newSha` 64 hex、`confirmationId`/`decisionId` 至少一个；带 `previousTrunkVersion` 时必须等于 `trunkVersion`（**不升版本**，AC-34） | `TRUNK_STATE_LEGACY_OPS`（`drift`/`unfrozen-expired`）仅旧读，不要求新归属字段；新代码不得写 |
| `trunk.amendment` | `amendmentId` 非空（新状态须 `AMENDMENT_ID_PATTERN`）；`flowId` slug；`status` ∈ `TRUNK_AMENDMENT_STATUSES`（旧读另允许 `TRUNK_AMENDMENT_LEGACY_STATUSES`）；`applyState` ∈ `TRUNK_AMENDMENT_APPLY_STATES`；`itemKind` ∈ `TRUNK_AMENDMENT_VCA_ITEM_KINDS` ∪ `TRUNK_AMENDMENT_LEGACY_ITEM_KINDS`；`itemResult` 给出须非空串（C1 未导出该值集常量，不另造）；`resultTrunkVersion` 可选正整数；`applicationId`/`decisionId`/`journalId`/`itemId`/`message` 给出须非空串 | 新状态：`origin` 必填 `customer|application`；`decidedBy` 给出只能是 `"customer"`；`approved`/`rejected` 必须 `decidedBy:"customer"` 且带 `decisionId`。提交/应用动作（`submitted`/`applied`/`applyState` 变化）由应用写、`decidedBy` 缺省 | 旧状态（`proposed`/`confirmed`/`cancelled`）只做最小字段校验（不要求 `origin`），供 AC-32 映射读取 |
| `version.change` | `schema` = `VERSION_CHANGE_SCHEMA`；`applicationId` 匹配 `VERSION_CHANGE_ID_PATTERN`；`vcKind` ∈ `VERSION_CHANGE_KINDS` 且 `initiatorRoleId` = `VERSION_CHANGE_INITIATOR_BY_KIND[vcKind]`；`flowId` slug；`status` ∈ `VERSION_CHANGE_CUSTOMER_STATUSES` ∪ `VERSION_CHANGE_APPLICATION_STATUSES`（**`draft` 不是账本事件状态**）；`targets` 有界，逐项 `kind` ∈ `DETAIL_AMENDMENT_TARGET_KINDS`（contract/roster/execution 并集）、`action` ∈ `VERSION_CHANGE_TARGET_ACTIONS`、`path` 安全相对、`toSha256` 64 hex；`baseTrunkVersion`/`resultTrunkVersion` 可选正整数；`bootstrap` 可选 bool | `approved`/`rejected`（customer 状态）⇒ `origin:"customer"` + `decidedBy:"customer"` + `decisionId` 必填；`submitted`/`applied`/`superseded`（application 状态）⇒ `origin:"application"`、`decidedBy` 缺省（`applied`/`superseded` 可携 `decisionId` 供审计，**不记 customer**，F8） | 新事件，无旧账本 |
| `doc.freeze` | `schema` = `DOC_FREEZE_SCHEMA`；`path` 安全相对；`version` 正整数；`sha256` 64 hex；`applicationId` 非空；`reason` ∈ `DOC_FREEZE_REASONS`；`decisionId`/`actorRoleId` 给出须非空串 | customer 类 reason（`DOC_FREEZE_CUSTOMER_REASONS`）⇒ `origin:"customer"` + `decidedBy:"customer"`；application 类 reason（`DOC_FREEZE_APPLICATION_REASONS`）⇒ `origin:"application"` + `decidedBy` 缺省（不冒充客户，F35）。**`migrated-draft` 不是 freeze reason**（不在 `DOC_FREEZE_REASONS`，直接拒绝） | 新事件，无旧账本 |
| `refactor.request` | `schema` = `REFACTOR_REQUEST_SCHEMA`；`requestId` 匹配 `REFACTOR_REQUEST_ID_PATTERN`；`flowId` slug；`initiatedBy` = `REFACTOR_REQUESTED_BY`（convener）；`title` 非空；`reason` 非空且 ≤ `REFACTOR_REASON_MAX`；`status` ∈ `REFACTOR_REQUEST_STATUSES`；`managedBy` = `REFACTOR_MANAGED_BY`（application-scheduler）；`scope.modules/roles` 非空串数组、`scope.paths`/`enforcement.writeSet` 安全相对路径；`enforcement.forbiddenKinds` ⊆ `REFACTOR_FORBIDDEN_KINDS` | **无客户决定**：不得带 `decidedBy`（不是批准卡事件；F31）。归属语义为 `origin:"application"`（C1 事件类型不含 `origin` 字段，C2a 不要求/不伪造该字段） | 新事件，无旧账本 |
| `stable.write.requested` / `approved` / `rejected` / `written` / `failed` | `schema` = `STABLE_WRITE_SCHEMA`；`requestId` 匹配 `STABLE_WRITE_REQUEST_ID_PATTERN`；`roleId` 非空；`path` 安全相对；`stableKind` ∈ `TRUNK_STABLE_FILE_KINDS`；`baseSha256` 为 `""` 或 64 hex；`targetSha256` 64 hex；`status` ∈ `STABLE_WRITE_STATUSES`（归属判定以 `kind` 为准）；`F14`：`approvedAt`/`expiresAt`/`consumedAt` 可选，给出须 ISO；`decisionId`/`confirmationId` 给出须非空串 | `approved`/`rejected`（`STABLE_WRITE_CUSTOMER_EVENT_KINDS`）⇒ `origin:"customer"` + `decidedBy:"customer"` + `decisionId`/`confirmationId` 至少一个；`requested`/`written`/`failed`（`STABLE_WRITE_APPLICATION_EVENT_KINDS`）⇒ `origin:"application"`、`decidedBy` 缺省；**`written` 是应用动作（不记 customer）**，`written` 后才 mini re-pin | 新事件，无旧账本 |

**白名单**：`TASK_EVENT_KINDS` 中 `stable.write.*` 五项由 `STABLE_WRITE_EVENT_KINDS` 展开（C1 单一来源），其余 kind 为事件联合判别字面量。
**重放**：新事件在 `replayTaskEvents` 中显式排除，不产生 `TaskRecord`/不算 `unclosed`（既有行为等价，语义不变）。

## 四、F14 关闭证据（C2a 侧）

| F14 要求 | 落点/证据 |
| --- | --- |
| `StableWriteEvent` 增可选 `approvedAt?/expiresAt?/consumedAt?`（C1 已落，C1 冻结记录 §四） | C2a 校验分支：三字段**仅在 `!== undefined` 时**校验 ISO 时间戳（`isIsoTimestampString`），缺失不报错 |
| 不得要求 C2a 校验 C1 未定义字段 | 校验只引用 C1 `StableWriteEvent` 已定义字段；测试 `F14：stable.write.* 的 approvedAt/expiresAt/consumedAt 为可选字段`：无三字段的 `stable.write.approved` 合法（断言 `"approvedAt" in event === false`），带三字段的 `stable.write.written` 合法，非法 `approvedAt:"not-a-date"` 成坏行 |
| 与 C2a 字段一致（审计时间戳） | 事件读出后 `consumedAt` 原样保留（测试断言） |

## 五、冻结的导出/常量清单

### 5.1 本模块（`task-state.ts`）

- 公共导出**无新增**（`appendTaskEvent`/`readTaskState`/`replayTaskEvents`/`taskEvent` 等签名不变）；`TASK_EVENT_KINDS` 仍为模块内白名单，内容 17 → 27 类。
- 新增内部辅助（不导出）：`isOneOf`/`isNonEmptyTrimmedString`/`isPositiveInteger`/`isSha256Hex`/`isIsoTimestampString`/`isProjectRelativePath`/`isBoundedArray`/`isPlainRecord`；`SHA256_HEX_RE` 与本模块内 `VERSION_CHANGE_ID_RE`/`REFACTOR_REQUEST_ID_RE`/`STABLE_WRITE_REQUEST_ID_RE`/`AMENDMENT_ID_RE`（全部由 C1 常量构造）。

### 5.2 消费的 C1 常量（不复制、不另造）

- `model/runtime.ts`：`STABLE_WRITE_EVENT_KINDS`、`STABLE_WRITE_CUSTOMER_EVENT_KINDS`、`STABLE_WRITE_APPLICATION_EVENT_KINDS`；事件类型联合 `TaskStateEvent`。
- `model/trunk.ts`：`TRUNK_STATE_OPS`、`TRUNK_STATE_LEGACY_OPS`、`TRUNK_STATE_CUSTOMER_OPS`、`TRUNK_STATE_APPLICATION_OPS`、`TRUNK_SOURCES`、`TRUNK_VERSION_MIN`、`TRUNK_STABLE_FILE_KINDS`、`TRUNK_AMENDMENT_STATUSES`、`TRUNK_AMENDMENT_LEGACY_STATUSES`、`TRUNK_AMENDMENT_APPLY_STATES`、`TRUNK_AMENDMENT_VCA_ITEM_KINDS`、`TRUNK_AMENDMENT_LEGACY_ITEM_KINDS`。
- `model/version-change.ts`：`VERSION_CHANGE_SCHEMA`、`VERSION_CHANGE_ID_PATTERN`、`VERSION_CHANGE_KINDS`、`VERSION_CHANGE_CUSTOMER_STATUSES`、`VERSION_CHANGE_APPLICATION_STATUSES`、`VERSION_CHANGE_INITIATOR_BY_KIND`、`VERSION_CHANGE_TARGET_ACTIONS`、`DETAIL_AMENDMENT_TARGET_KINDS`、`DOC_FREEZE_SCHEMA`、`DOC_FREEZE_REASONS`、`DOC_FREEZE_CUSTOMER_REASONS`、`DOC_FREEZE_APPLICATION_REASONS`、`REFACTOR_REQUEST_SCHEMA`、`REFACTOR_REQUEST_ID_PATTERN`、`REFACTOR_REASON_MAX`、`REFACTOR_REQUEST_STATUSES`、`REFACTOR_REQUESTED_BY`、`REFACTOR_MANAGED_BY`、`REFACTOR_FORBIDDEN_KINDS`、`STABLE_WRITE_SCHEMA`、`STABLE_WRITE_REQUEST_ID_PATTERN`、`STABLE_WRITE_STATUSES`。

## 六、测试 / 类型检查原始结果

1. **定向**：`node --test "test/编排/task-state.test.ts" "test/编排/trunk-events.test.ts"`
   → **tests 20 / pass 20 / fail 0 / skipped 0 / todo 0**（既有 16 + 新增 4）；exit 0。
2. **`test/编排` 全量**：`node --test "test/编排/**/*.test.ts"`
   → **tests 808 / pass 807 / fail 1 / cancelled 0 / skipped 0 / todo 0**。
   - 唯一失败为 **基线既有 Windows symlink EPERM**：`test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托；项目内测试路径获委托」。
   - **计数对照（B0 最终版）**：804 tests / 803 pass / 1 fail / 0 skip → 本次 +4 新增 tests 全部 pass；fail/skip 与基线完全一致 ⇒ **无既有回归、无断言改写、无新增 skip**。
3. **`npm run typecheck`**（`tsc --noEmit`）：
   - C2a 代码写盘后的全仓运行：**exit 0**（无输出；mtime：task-state 23:07:25 / 测试 23:08:04）。
   - 完成复核时的全仓运行：**exit 1**，类型错误全部位于并行的 C2c 在途文件 `src/service/version-change/impl/**`（复核期间两次采样：`freeze-service.ts` 3 + `vca-service.ts` 2；`freeze-service.ts` 3 + `stable-write-service.ts` 9——清单随该节点在途写盘变化；mtime 均晚于本节点写盘）。不属 C2a 写集，本节点未触碰、不代改。
   - **C2a 写集限定 typecheck**（`tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node "src/common/编排/task-state.ts" "test/编排/trunk-events.test.ts"`）：**exit 0**。

## 七、兼容性声明

- 旧事件/旧账本：既有 17 类 kind 的白名单与校验路径不变；旧 `drift`/`unfrozen-expired`、旧修正案状态可读；不迁移/不改写旧账本。
- 未知 kind：新事件之外的 kind（含未来版本）记坏行并诊断，不阻塞启动、不丢其它行（与既有行为一致）。
- 写侧：`appendTaskEvent` 不做校验（既有行为）；事件写入方（C2c Pipeline/S3）必须按本矩阵与 C1 类型写事件。
- `TaskRecord`/`taskStatusOf`/`taskCardOf`/幂等/重派语义未变（测试断言任务状态机不受新事件影响）。

## 八、遗留依赖与披露（不声称已完成）

1. **`GOVERNANCE_CARD_KINDS`（F2）未在 C1 落地**：C1 冻结记录 §六-1 如实披露；本节点未把 `isGovernanceCardKind` 改为读 `GOVERNANCE_CARD_KINDS`（该常量尚不存在，改动会导致 `npm run typecheck` 失败，且卡种属 C1b/S3 写集）。C2a 事件校验不依赖该白名单；待 C1b 落地 `stable-write` app-owned 卡种后，若编排 P1 §2.6-29 仍要求，可在 S3 同批改一行。
2. **C2a 为读侧校验**：写侧事件的构造/状态机归 C2c/S4；本冻结不覆盖 VCA 提交/批准、冻结服务、stable 许可/写入门禁（C2b/C2c）。
3. **值集无 C1 常量的字段**：`trunk.amendment.itemResult`、`trunk.state.channel` 无 C1 导出常量，C2a 仅校验形状（非空串），不另造同义枚举；如需严格值域由 C1 冻结补充常量后加法收紧。
4. **`trunk.state.stable-repinned.oldSha` 允许 `""`**：表示此前无该文件快照；若 S2/S3 实施要求必须 64 hex，请回 C2a 重冻结（当前与「无 manifest 不写事件」不冲突）。
5. **旧修正案状态校验从宽**：`proposed`/`confirmed`/`cancelled` 事件不要求 `origin`（P1.3 形状不可得；AC-32 只读映射）；新状态按 §三矩阵严格校验。

## 九、声明

- 本记录为 **C2a 契约冻结**，不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 未改角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling；未运行应用；未 commit/push/merge/release。
- 若后续需要改 C1 Model 或其它角色文件，按停止项回报，不代改。
