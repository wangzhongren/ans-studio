# 主干/修订法案 P1.6 实现提案审核记录（项目管理）

- **任务 / flowId**：`2026-11-04-trunk-amendment-model` / 不适用（应用级治理特性）；风险档位 **T3**。
- **审核角色 / 阶段**：项目管理（technical-architecture）/ 团队计划增量 §10.8 Batch 0「五角色 P1 提案 + 项目管理审核」；按 `ans-governed-construction/references/proposal-review.md` 执行。
- **审核性质**：**只读审核**。本记录是本次唯一写盘文件；未改任何提案、产品/测试源码、`boundary.{md,yaml}`/角色卡/changelog、方案/复核/验收/沟通/调度文档；未运行产品测试、未启动应用；未 commit/push/暂存。本记录是**审核建议**，不是实施授权、不是客户闸门、不是契约冻结、不是验收结论。
- **结论（本记录）**：**`needs revision`**。五份提案均实质可审；写集均在各自 Section 1 与团队计划/B-1..B-11 内，**未发现新角色、隐性扩权、B-12/B-13 触发或边界外路径需求**；但存在跨角色契约阻断（账本 applied 归属、stable 卡种/白名单、`acknowledgments` 形状、`artifacts.roleCards`/journal `committed` phase、stable 许可字段与消费点、`WriteGate` 内容哈希落点、冻结快照单一实现、D1 `@决策` 指令排除点）与 D1/U1 提交入口/IPC 推送面不一致，须按本记录裁决修订后复审。**未发现需要重开闸门 0/1/2 的范围变化**，故不是 `not ready`。

## 一、审核对象与输入（写盘前只读实测）

### 1.1 五份 P1 提案

| # | 角色 | 提案路径 | 行数 | SHA-256（实际字节） |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 | `角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 816 | `e3e74ad0f0faa6ad101c87171aff36b3c443103996a869edb3033aaced089f6c` |
| 2 | 编排 | `角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 578 | `ac208b4d5cc3cf4ba3f67ba183e4a46d78ad6fc6fc8fb07f20fc16f24b3eb3eb` |
| 3 | 门禁引擎 | `角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 469 | `c8edbe4166175be2b1643e17494be370ccfda74838867760414cff0920cb5ff1` |
| 4 | 桌面窗口 | `角色卡/桌面窗口/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 437 | `7fe52f3c9d34e734e3d3bee1add0bf35d511ef92634d33440bebf5ec08e0178e` |
| 5 | 桌面UI | `角色卡/桌面UI/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 573 | `bad69e2367b3e47a1612e6559ec6d06e10ea0b1f290d648954926c09d7773b11` |

五份均与任务输入清单一致；均声明 `proposal-only, no code`，`git status --porcelain -- src app test` 写盘前为空。

### 1.2 审核输入（任务清单口径；写盘前实测）

| 输入 | 行数 | SHA-256 | 备注 |
| --- | --- | --- | --- |
| 方案 P1.6（实施契约基线） | 1151 | 实际字节 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`；归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a` | 与本记录引用一致 |
| V1 v1.1（验收基线） | 350 | 归一化 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`（本 worktree 实际字节同值） | 任务清单口径；见 §1.3 |
| 团队计划（721 行） | 721 | `ed6d34846ace40bde13ee67887d486b4fc20d231baed446976ef479c46922aa4` | |
| 团队计划 P1.5 增量（含 §10.8/§10.5） | 468 | `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5` | |
| IA（闸门 1 重确认 + stable 最终决定） | 37 | `0bed4240687b3e532d2c2e9ef2374e16ed69042b7ea3fb36982ede136ee28573` | |
| 闸门 2 增补 G2a（含 P1.6/B-11 补注） | 25 | `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201` | |
| B0 基线（最终版） | 221 | `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058` | 任务清单口径；旧 173 行/`27f9b94d…` 为含占位中间版，**勿引用** |
| `角色卡/项目管理/docs/project-rules.md` | 160 | 当前生效工程法案（草稿） | 对照见 §六 |

### 1.3 输入版本/哈希差异的裁决（写入 E1/沟通更正）

1. **V1 v1.1**：团队计划增量 §5.5/§10.7 与部分提案引用 `75bf7a49…`；当前文件为 350 行、归一化 `3c40acad…`（不同环境 CRLF/LF 下实际字节 hash 可不同，归一化值一致）。**裁决**：以任务输入清单/本记录实测的 **350 行 / 归一化 `3c40acad…`** 为当前 V1 v1.1；`75bf7a49…` 视为旧快照；由沟通/统筹在 G2a/E1 更正。V1 自身声明不自引用最终哈希，故不据此改标准。
2. **G2a**：V1 §1.1 引 16 行 / `d41665d3…`，当前 worktree 为 **25 行 / `bfac5781…`**（已含 P1.6 + B-11 补注）。**裁决**：以 25 行补注版为准；沟通在合并材料更正 V1 引用。
3. **B0**：编排 §1.1、门禁引擎 §0、桌面窗口 §头部引用 **173 行 / `27f9b94d…`**（含模板占位中间版）；U1 引 221 行但 hash 为另一字节快照。当前最终版为 **221 行 / `8c6272d5…`**；其 §6.6 套件计数（runtime-core 325/318/3/4、编排 804/803/1/0、门禁 292/291/0/1、桌面应用 562/562/0/0、桌面UI 408/408/0/0、项目管理 176/171/0/5、测试 596/589/1/6）与提案引用的数字一致，仅引用版本过期。**裁决**：三份提案在修订时更新 B0 引用为 221 行 / `8c6272d5…`（或写「以测试角色最终版为准」并附本记录依据）；不阻断 P1 实质。
4. **P1.3 原文**：本 worktree 无 P1.3 快照；P1.6 是唯一实施契约基线。运行时核心 Q1/Q9 的「逐字核对 P1.3」不可执行。**裁决**：以提案 §3.1/§3.2 作为 C1 冻结候选；若沟通能在 C1 前提供 P1.3 快照，则逐字段核对；否则 C1 冻结声明注明「形状派生自 P1.6 + 本审核裁决」，不阻塞。

## 二、审核方法与只读代码核对

- 通读五份提案（共 2873 行）与 §1.2 输入；逐项对照 P1.6 §4.4/§4.5/§4.5.1/§4.6/§4.7/§4.8/§5/§10.5、V1 AC-1–AC-36、团队计划增量 §5.4 九条 + §10.5 七条、`project-rules.md` 与 HEAD `89b1fb2` 实际代码。
- 只读核对的关键代码锚点（均为实测）：
  - `src/model/runtime.ts:172` `WriteGate = (targetPath: string) => WriteDecision`（**只有路径，无内容 hash 上下文**）；`:453-463` `GOVERNANCE_CARD_GROUP`（判断分组映射）；`:470-473` `governanceCardGroup`；`:430` `GovernanceCardKind`。
  - `src/common/编排/task-state.ts:58-65` `TASK_EVENT_KINDS` 17 类；`:77-81` `isGovernanceCardKind` **直接读 `GOVERNANCE_CARD_GROUP` 键集**；`:293-319` `request.created/resolved.cardKind` 校验。
  - `app/desktop/customer-input.ts:321-333` `isApplicationDecisionReservedForCustomer`；`:1673-1680` `tryAutoSelectDecision` 用它排除；`:1217-1235` `planJudge` 对 `decision` 直接 undefined；`:1747-1800` **`tryApplyDirectiveDecision`（提案写作 `evaluateDirectiveDecision`，实际符号不同）只判 `cardKind==="decision"`，未调用主权排除谓词**——缺口属实。
  - `src/common/门禁引擎/versioned-doc-guard.ts:55-70` `versionedDocOverwriteDecision({relPath,exists})` 只判 exists；`:80-93` `checkVersionedDocWrite`；`:131-147` `VersionBaselineRecord` 七类 doc、`event:"baseline"|"version-added"`；`:186-247` `readBaselines` 未知 event/坏行 ⇒ `baseline-corrupt`；`:420-426` `baselineShaFor` 用 `.find(...)`（**首条匹配，不是 latest**）；`:548-625` `registerVersionedDocAfterWrite` 对同 path/version 不同 sha 返回 **false**（现状不支持 draft 原位改登记）。
  - `src/common/编排/run-manifest.ts:60-82` `RunManifest` 无 `repins`；`:359-504`/`:509-549` `prepareRunPin`/`pinRun` 不判冻结；`:721-755` `buildRunChangeCard`（复用 `cardKind:"decision"` + `application:true`）。
  - `src/pipeline/orchestration/run-role.ts:849-866` gate 的版本化判定；`:1235-1250` shell 守卫；`:2386-2389` 属主写后 `registerVersionedDocAfterWrite`。
  - `src/common/编排/shell-post-audit.ts:270-289` 用 `baselineShaFor`，draft/frozen 未分；`src/common/编排/version-decision.ts:129-137` 旧文案。
  - `src/provider/runtime/tools.ts:332-351` `govern(gate,name,path,writeRoot)` 只传路径；`:464-477` write_file 的 content 在 gate 调用前可用；`:423-426` 写入前二次 `govern`。
  - `src/common/编排/decision-card.ts:86-150` `validateDecisionCardRequest`：`application:true` 绕过角色上限，但仍要求 `flowId`、≥2 选项、恰一推荐。
  - i18n：`ui.versionChange.*`/`ui.stableWrite.*`/`ui.freeze.*`/`ui.refactor.*`/`ui.trunk.*` 当前 **0 key**；`ui.runChange.*` 14 key（zh/en 各 14）；`ui.projectState.pinnedHint`、`main.versionDecision.error.runChangeRequired` 存在；`test/项目管理/shared/i18n.test.ts` 分区计数/parity/零泄漏。
- 未运行产品测试/应用；本审核不替代 T1/T2、E2 或契约冻结。

## 三、范围与写集审查

### 3.1 总表

| 角色 | 提案写集（摘要） | Section 1 / 团队计划 | 结论 |
| --- | --- | --- | --- |
| 运行时核心 | 新增 `src/model/trunk.ts`（B-1）、`src/model/version-change.ts`（B-5）、`runtime.ts` 加法、两个 `test/runtime-core/` 契约测试；`project-state.ts` 0 行 | 全部在 Section 1（B-1/B-5 + 单文件 + 测试目录）；与 §4.1 运行时核心写集一致 | **合格**；但 `WriteGate` 内容哈希落点（§5.5）需要把 `src/provider/runtime/tools.ts` 列入 C1/S3 写集（该文件在 Section 1，属计划枚举补登，非边界变更） |
| 编排 | `src/provider/trunk/**`、`src/service/trunk/**`（B-3）、`src/provider/version-change/**`（B-6）、`src/service/version-change/**`（B-7）、四个 Pipeline 单文件（B-2/B-8/B-9/B-11）、`src/common/编排/{task-state,run-manifest,shell-post-audit,version-decision,project-state(条件),freeze-snapshot(新)}.ts`、`run-role.ts`、`test/编排/**` | 全部在 Section 1（`src/common/编排/` 目录 + B-x + `test/编排/`）；`freeze-snapshot.ts` 在目录内 | **合格**；B-12/B-13 **不触发**（§7.4 裁决合理）；`freeze-snapshot.ts` 与门禁引擎快照重复，须按 §5.7 收敛 |
| 门禁引擎 | `src/common/门禁引擎/versioned-doc-guard.ts`、`shell-write-guard.ts`、`test/门禁引擎/**`（含新 `stable-write-guard.test.ts`） | 目录授权；无 B-x | **合格**；`governance-roles.ts` 不改的结论正确 |
| 桌面窗口 | 新增 `app/desktop/{version-change,trunk}.ts`；`session.ts`/`customer-input.ts`/`interface.ts`/`main.ts`/`preload.cjs`/`i18n.ts`（条件）；B-4 `trunk.test.ts`、B-10 `version-change.test.ts`、既有精确测试 | `app/desktop/` 目录、`app/main.ts`、`app/preload.cjs`、B-4/B-10；既有 17 个测试文件均在 boundary 单文件条目内（实测逐个存在） | **合格**；B-13 不触发 |
| 桌面UI | `app/renderer/**` 新增/修改；`test/桌面UI/**` | 目录授权；无 B-x | **合格**；无边界外需求 |

### 3.2 隐性扩权与新增路径检查

- **无新角色、无角色 id/能力描述变更、无 B-12/B-13 触发、无 `.ans` 之外的新数据路径**。`.ans/state/{version-changes.json,refactor-requests.json,stable-writes.json,doc-freezes.json,freeze-migrated.json(条件)}` 与 `.ans/trunk/*` 均为应用独占运行数据，不是仓库候选，不需要边界条目。
- `src/common/编排/freeze-snapshot.ts`（编排提案 §2.6 #35）与 `test/门禁引擎/stable-write-guard.test.ts`（门禁提案 §11.1）都在已授权目录内，属新文件而非新模块根。
- **未发现 P1.6 之外的新卡种白名单机制被偷偷引入**；但 stable workflow 卡确实无法复用 `decision`（无 flowId），**新增 app-owned 卡种是 P1.6 主权要求的最小化落地**（见 §5.5）；须由 C1/C2a 正式定义，不得由实现自行拼装。
- `managedBy:"application-scheduler"` 是语义字面量，不是新角色；与 F31 一致。
- 运行时核心提案 §2 明确不写 `provider/runtime/**`；但 §5.5 的 `WriteGate` 内容哈希裁决需要 `src/provider/runtime/tools.ts` 的最小改动。该文件在其 Section 1 单文件条目内，**不扩权、不改边界**，但需在提案写集与团队计划 §4.1 的「预计否」处补登（计划枚举补登，由统筹在 E1 披露）。

## 四、跨角色契约一致性裁决（重点）

### 4.1 六类账本事件 + `stable.write.*` / `stable-repinned` 的形状与归属

**冻结裁决（C1 形状 + C2a 校验按此，不得各自解释）：**

| 事件 | 触发 | `origin` / `decidedBy` | 关键形状/负例 |
| --- | --- | --- | --- |
| `trunk.state` | S2/S3/S4/D1 | `switched`/`unfrozen`/`refrozen`/`refrozen-cancelled`/`recovered`/`stable-repinned` ⇒ `origin:"customer"`、`decidedBy:"customer"`（stable-repinned 另需 `confirmationId`/`decisionId`）；`gap` ⇒ `origin:"application"`、`decidedBy` 缺省、`channel:"low-level-run-change"`；`drift`/`unfrozen-expired` **仅 legacy 读**，新代码不得写 | `stable-repinned` 的 `trunkVersion` 必填且与事件前一致；`highRisk.acknowledged` 只允许 `true`；gap 记 customer 是负例 |
| `trunk.amendment` | S2/S4 | 客户批准/拒绝、逐项 `applied/kept/cancelled` ⇒ customer + `decisionId`；`submitted`、`applyState` 应用动作、`apply-failed`/`applied-uncertain` ⇒ application、`decidedBy` 缺省 | 提交/应用记 customer 是负例；新 detail 写入 workflow/boundary item 是负例 |
| `version.change` | B-8 | `submitted` ⇒ application；`approved`/`rejected` ⇒ customer + `decisionId`；**`applied`/`superseded` ⇒ application + `decisionId`（不记 customer）** | submitted 记 customer、approved 无 decisionId、applied 冒充 customer 均为负例 |
| `doc.freeze` | C2c | `vca-approved`/`version-upgrade-approved`/`detail-item-applied`/`proposal-confirmed`/`intent-confirmed` ⇒ customer（+ `decisionId` 按触发源）；`amendment-submitted`/`handoff-pin-bootstrap`/`bootstrap-vca-approved`/`migrated-legacy` ⇒ application、`decidedBy` 缺省 | 提交/迁移/bootstrap 记 customer 是负例；`migrated-draft` **不是** freeze reason |
| `refactor.request` | B-9 | `origin:"application"`、无 `decidedBy`、`initiatedBy:"convener"`、`managedBy:"application-scheduler"` | 出现 customer decision/批准卡字段是负例 |
| `stable.write.requested/approved/rejected/written/failed` | B-11 | `requested`/`written`/`failed` ⇒ application；`approved`/`rejected` ⇒ customer + `decisionId` 或 `confirmationId` | requested/written 记 customer、approved 缺 authority id 是负例 |
| `stable-repinned`（`trunk.state` op） | B-11/S2 | customer + confirmationId/decisionId；**不升 trunkVersion**；无 trunk manifest 时**不写该事件**，只记待续接 | 升 trunkVersion、缺 confirmationId、无 trunk 时虚构快照是负例 |

- **驳回** 编排提案 §3.6 的「`version.change` 的 `approved`/`rejected`/`applied` 决策类=customer」表述：`applied` 是应用动作；按本表改为 application + `decisionId`。C1 提案 §3.4/Q3 的建议正确，采纳。
- **驳回** 运行时核心 Q2 中「F19 把 gap 列入决策类」的旧口径：gap=application（团队计划 §5.5/§6.2 与 P1.6 观测事件口径一致）。
- `version.change` 事件字段名以 C1 的 `vcKind` 为准（C2a 不另写 `kind` 业务字段）；`stable.write.*` 用 `stableKind`；`StableWriteEvent.status` 与 kind 后缀同义冗余可保留，但校验以 `kind` 为准。
- 事件校验必须消费 C1 常量（`DOC_FREEZE_CUSTOMER_REASONS`/`DOC_FREEZE_APPLICATION_REASONS`/`TRUNK_STATE_CUSTOMER_OPS`/`TRUNK_STATE_APPLICATION_OPS`），不得复制字面量。

### 4.2 R9 权威扩展与 `doc-freezes` 派生缓存（吸收编排 Q1–Q3）

**裁决：**

1. **记录形状**：在 `versions.jsonl` 采用**追加 variant 记录**，不是给既有 `VersionBaselineRecord` 加可选 `freeze` 字段：
   - `event:"frozen"` + `freeze:{ applicationId, reason, origin, decidedBy?, decisionId?, frozenAt, actorRoleId? }`（子形状 = C1 `DocFreezeRecord`，由门禁引擎 type-import，不复制）；
   - `event:"draft-updated"`（同 path/version 新 sha，表示草稿原位改）；
   - `event:"draft-marker"`（`migrated-draft` 证据标记；不写 `doc.freeze`）；
   - 保留 `baseline`/`version-added`。
2. **latest-record-per-path**：`verifyVersionedDocBaselinesLocked`、`baselineShaFor`、`registerVersionedDocAfterWrite` 改为「同一实际路径最后一条记录为准」；冻结记录是该 path/version 的终态（冻结后同 path/version 不同 sha ⇒ 违规）；历史记录不删。
3. **迁移标记承载**：`migrated-draft` 只出现在 baseline 的 `draft-marker` 记录、`DocFreezeLookup.migrationMark` 与视图；**`DOC_FREEZE_REASONS` 不含 `migrated-draft`**（运行时核心 Q6 采纳）。`.ans/state/freeze-migrated.json` 若采用，仅作为迁移**进度标记**（baselineSha256/记录数/时间），**不得成为第二本冻结权威**；`doc-freezes.json` 仅为可重建缓存。
4. **写入者单一**：冻结记录只经门禁引擎 C2b 的 `appendDocFreezeRecords`（同 `versions.lock`/fencing）追加；B-6/B-7 不直接写 `versions.jsonl`（编排 Q3 采纳）。
5. **旧 app 兼容**：旧 app 读新 event 值会按 `baseline-corrupt` fail-closed（安全向），E1 必须披露；不静默改成「未知即跳过」。
6. **缓存一致性**：`doc-freezes.json` 头部 `baselineSha256` 与当前 baseline 文件 hash 不一致 ⇒ 从 baseline 重建并告警；缓存缺失 ⇒ 重建；缓存损坏 ⇒ fail-closed，不自动重建/放开；**guard 只消费安装后的同步快照，不直接读缓存文件**；快照不可用（unknown/corrupt）⇒ 所有版本化写判定拒绝（含 draft），面板提示恢复。

### 4.3 stable 一次性许可契约、消费点与 TOCTOU；`WriteGate` 内容哈希落点

**冻结裁决：**

1. **字段**：C1 `stable-write/v1` 增加 `approvedAt`（批准时刻）；`expiresAt` 在批准后**必填**；`consumedAt` 可选；`baseSha256` 为字符串，**空字符串 `""` 表示写入前文件不存在**（新文件），否则必须等于当前文件 hash；`targetSha256` 为批准内容最终字节 sha256。
2. **判定**：`stableWriteDecision({projectRoot, relPath, sha256, permit, now})` 是**纯函数**（不写盘、不消费、不发事件）；校验 `status==="approved"`、`path/kind/roleId` 与 `stableWritePathOf` 一致、`sha256===targetSha256`、`baseSha256` 与当前文件一致（新文件时不存在）、未过期、未消费、许可与**同步许可快照**逐字段一致；无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝（fail-closed）。
3. **消费点（冻结）**：**pre-write 校验 targetSha + post-write 复核后消耗**。pre-write 由 gate 用 `(path, permit, contentSha)` 判定，不消费；写入完成后由 B-11 `completeWrite(actualSha)` 重新计算实际字节 sha，`actual===targetSha` ⇒ 在 `stable-writes` 存储锁内标记 `written`/`consumedAt`、刷新许可快照、执行 mini re-pin；不符/异常 ⇒ `failed`，**该许可同时作废（标记 failed/consumed，不得保留可复用的 approved 许可）**、不更新快照、进恢复。桌面/渲染不缓存、不签发、不复算许可。
4. **TOCTOU**：base 校验 + 原子写 + 写后 sha 复核 + 一次性消费共同收窄窗口；残余窗口（gate 判定与写入之间文件被外部改）如实披露，T1 故障注入（base 变化、post-write 不符、许可复用、过期、快照不可用）。许可 TTL 默认 30 分钟（常量、可测；C2c 定），过期拒绝且不自动补发。
5. **`WriteGate` 内容哈希落点（裁决）**：
   - **C1** 扩 `WriteGate` 为可选上下文：`(targetPath: string, context?: { contentSha256?: string; operation?: "write"|"edit" }) => WriteDecision`（向后兼容：既有单参数实现/调用不变）；
   - **运行时核心**在 `src/provider/runtime/tools.ts` 的第二次（写入前复核）`govern` 调用传入**最终字节** sha（write_file 用 `Buffer.from(content)`；edit_file 在应用编辑后、`atomicWriteFile` 前计算）；该文件在其 Section 1 单文件条目内，**提案必须把它补入 C1/S3 写集并在团队计划 §4.1「预计否」处披露**（计划枚举补登，不是边界变更）；
   - **编排 S3** 的 `run-role.gate` 对 stable 路径消费 `context.contentSha256` 调 `stableWriteDecision`；无上下文（shell/opaque）⇒ stable 一律拒绝并提示 stable-write 通道；
   - 若运行时核心拒绝此落点，则须由门禁/编排给出等价的「写前最终字节 hash」路径；**不得以写后验证替代写前判定**（那只剩事后发现）。

### 4.4 守卫接线单一入口（`versionedDocOverwriteDecision` / `versionedDocFreezeState` / `stableWriteDecision`；pin/re-pin 同函数）

- **采纳门禁引擎提案**：
  - `versionedDocFreezeState(projectRoot, relPath, exists)` 是生产唯一同步冻结查询（从安装的快照解析 `frozen|draft|unknown`）；`versionedDocOverwriteDecision({relPath, exists, frozen?, operation?})` 接收 `frozen`/`projectRoot`，`operation` 含 `write|edit|delete|rename|move|pin|repin`；真值表按提案 §3.2（draft allow、frozen deny、unknown/corrupt deny；pin/repin 目标必须 frozen；rename/move 源+目标同判）。
  - `checkVersionedDocWrite` **无真实调用者**（实测仅 `shell-write-guard.ts:18` 死导入），**删除导出与导入**；若保留则薄包装同一判定，不得成为第二权威。AC-15 允许「对齐/删除」多解。
  - `stableWriteDecision` 与 `versioned-doc-guard` 同源；shell/opaque 无内容 hash ⇒ stable 目标拒绝。
  - `registerVersionedDocAfterWrite` 仍由门禁引擎维护；draft 原位改须追加 `draft-updated`（现状对同 path/version 不同 sha 返回 false，必须改）；frozen 写入在 gate 即拒绝，不进入登记。
  - pin/re-pin 统一用 `versionedDocOverwriteDecision({operation:"pin"|"repin"})`；`prepareRunPin`/`pinRun`/trunk apply 前逐文档调用；bootstrap 例外在 `pinRun` 锁内先写 `doc.freeze(handoff-pin-bootstrap)` 再 pin；**不包含** `repinIfBootstrapped` 治理边界 re-pin。

### 4.5 cardKind / 白名单裁决

- **`GOVERNANCE_CARD_GROUP` 只表达判断分组，不表达卡种白名单。**
- **VCA 卡（含 detail 逐项/最终/trunk 逐项）复用 `cardKind:"decision"` + `application:true` + 真实 `flowId`**；有 flowId 故 `validateDecisionCardRequest` 可通过；`planJudge` 对 decision 直接 undefined，`tryAutoSelectDecision` 也已有早退；**新增风险只在 `tryApplyDirectiveDecision`**（见 §4.6）。
- **stable workflow 卡（项目级、无 flowId）不能复用 `decision`**（`validateDecisionCardRequest` 要求 flowId）。**裁决：新增一个 app-owned 卡种（建议 token `stable-write`）**：
  1. C1 把该 token 加入 `GovernanceCardKind` 联合；
  2. C1 **不得**把它加入 `GOVERNANCE_CARD_GROUP`（其 `governanceCardGroup` 返回 undefined ⇒ 永不判断）；
  3. C1 新增独立白名单常量（建议 `GOVERNANCE_CARD_KINDS`：`GOVERNANCE_CARD_GROUP` 键集 + app-owned 非判断卡种）；C2a 的 `isGovernanceCardKind` 改读该白名单（不再直接读 `GOVERNANCE_CARD_GROUP` 键集），`request.created/resolved.cardKind` 校验接受 `stable-write`；`test/编排/decision-card.test.ts` 对 `GOVERNANCE_CARD_GROUP` 的精确键集断言保持不变（分组表未变）。
  4. `validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`（非 decision），D1 为 stable 卡提供**独立的最小结构校验**（恰一推荐项/≥2 选项/path/base/target 字段齐全）或复用共享形状的扩展；不得让 stable 卡绕过结构校验。
  5. `tryAutoSelectDecision`（需 `decisionCard`）、`planJudge`（decision 直接 undefined）、`tryApplyDirectiveDecision`（只处理 decision）对该卡种均不消费；`isApplicationDecisionReservedForCustomer` 扩展为识别 `stable-write` 选项词（用于结算后二次校验）。
- **不得**把 `stable-write` 进入 `GOVERNANCE_CARD_GROUP` 的 approval/decision 组；否则会打开「替我审批/替我决策」代选，与 P1.6 客户主权冲突。
- **编译解锁（计划内，非边界变更）**：`GovernanceCardKind` 增 `stable-write` 会使 `src/pipeline/orchestration/run-role.ts:2140` 的穷尽表 `CARD_KIND_ROUTE_HINTS: Record<GovernanceCardKind, string>` 缺键、`npm run typecheck` 报错。**裁决**：由编排在其既有写集 `run-role.ts`（S3）补一行 `stable-write` 的 route hint（应用自有卡、不得由角色工具发起），不要求 C1 越界改 `run-role.ts`；该行与 `test/编排/decision-card.test.ts` 的 `GOVERNANCE_CARD_GROUP` 键集断言（不变）一并回归。
- **U1/D1 只按此 token 冻结**；`DECISION_KINDS` 是否加入 token 由 D1/U1 在冻结点确认（一行改动，建议加入以复用 dialog 优先级/破坏性样式）。

### 4.6 桌面窗口发现的 `@决策` 指令主权排除缺口（确认由 D1 修，AC-5 支撑）

- **事实核对成立**：`customer-input.ts` 的指令消费者实际符号是 **`tryApplyDirectiveDecision`**（提案写作 `evaluateDirectiveDecision`/`applyDecisionDirective` 区域，名称需更正）；它只判 `cardKind==="decision"` 且不调用 `isApplicationDecisionReservedForCustomer`。因此 VCA 卡（复用 decision）即使已把选项词加入 `tryAutoSelectDecision` 的排除，**仍可能被客户预录的 `@决策` 指令按选项代选**——与「客户本人」要求冲突。
- **裁决（D1 必须修）**：`tryApplyDirectiveDecision` 在进入 `applyDecisionDirective` 前，若 `isApplicationDecisionReservedForCustomer(entry.request)`（扩展后的 VCA/trunk/detail/stable 词汇与 `stable-write` 卡种）为真 ⇒ 返回 false（不消费指令、不写 `directive:<id>`、不结算）。同时 `respondUnsafe`/`settleActive` 出口的 `operatorId`/`judge` 二次校验保留。该修复是 AC-5（客户主权三态排除）与 AC-18 的必要支撑；D1 提案须把它列入 §3.4/§13.2 测试。
- `planJudge` 对 appointment-write 的既有排除与 `isGovernanceWriteCardKind` 不变；stable 卡不得进入判断器。

### 4.7 IPC 面与 U1/D1 一致性裁决

- **D1 的 IPC 表（`version-change:list/present`、`stable-write:list`、`refactor:list/request`、`doc-freeze:list`、`trunk:state/list/upgrade-request/upgrade-confirm/refreeze-request/abandon-upgrade/recover-request`）** 是冻结候选；**U1 必须按 D1 冻结名消费**，不得自行新增渲→主捷径。
- **状态推送单一来源**：只保留 `trunk:state` 主→渲推送；D1 明确不设 `doc-freeze:state`/`stable-write:state`；**U1 §3.4/§八 的 `version-change:state`/`stable-write:state`/`refactor:state` 不支持**，改为打开面板拉取 + `trunk:state` 刷新；如 U1 论证确需独立推送，须 D1 冻结点统一增改（不双状态源）。
- **提交入口裁决**：**VCA 提交只经发起角色能力（工具）**（product/rapporteur 会话注入，D1 §3.3 `submitVersionChangeCapability?`）；**不新增 `version-change:submit` 渲→主 IPC**。U1 §3.1/§4.1/§6.2 的「表单式提交」必须改为只读展示 + 「在会话中提交」说明/跳转；AC-9 的「产品/策划入口」证据按「能力工具注入 + 面板可见说明」呈现。若客户/产品坚持表单式提交，属 D1 IPC/写集扩展，须另行确认，不阻断本 P1。
- **重构提交的身份**：D1 提供 `refactor:request`（渲→主），但渲染进程不能证明发起者是 convener；**裁决**：重构申请应经 convener 会话能力（工具）提交，或 D1 在 IPC 处理时校验「存在活动 convener 会话且该会话发起」，否则拒绝并返回 VCA/能力指引。不得接受渲染侧自报的角色身份。`refactor:list` 只读无此问题。
- **trunk 高危确认的信任**：D1 同时声明「无客户批准/拒绝的专用 IPC」与提供 `trunk:upgrade-confirm {acknowledged:true}`。**裁决**：`trunk:upgrade-confirm` 只能作为客户 UI 对**已生成 preview**的二次确认（绑定 `previewId`、reason/scope、审计），不得作为 `session:operator-response` 之外的客户决定捷径；若设计/AC 要求客户卡，则必须走卡通道。D1 须在提案中明确二选一，并与 U1 的「确认在 D1 卡内」一致；不得出现 judge/委托可触发的确认路径。
- **`version-change:present` 重发卡**：允许对 `submitted` VCA 重发；不重复写 `version.change(submitted)`、不重复通知、requestId 幂等；B-8 须提供可重发入口。
- **run-change 兼容**：低层 API/preload 方法与 `#run-change` UI 移除是两件事；preload 方法是否保留由 D1 冻结点决定，U1 不展示。`test/桌面应用/e2e/main.mjs` 与 `test/桌面应用/run-change-*.test.ts` 属 D1 写集（已核实在 boundary 条目内），D1 负责更新。

### 4.8 i18n 114 key 家族归 C3/项目管理

- **确认**：U1 §6.2 的 114 key（versionChange 43 / stableWrite 12 / refactor 20 / freeze 17 / trunk 22，实测计数一致）是**渲染侧需求清单**；共享 i18n 的唯一写入者是**项目管理（C3）**。C3 冻结最终 key 名/文案/计数（可合并/改名，以冻结集合为准），U1/D1 只消费 `MessageKey`，不硬编码。
- C3 的写集（`src/common/shared/i18n/messages/{zh-CN,en-US}.ts` + `test/项目管理/shared/i18n.test.ts`）覆盖 `ui.versionChange.*`/`ui.stableWrite.*`/`ui.refactor.*`/`ui.freeze.*`/`ui.trunk.*` 与旧 key 值迁移（`ui.runChange.entry`、`ui.projectState.pinnedHint`、`main.versionDecision.error.runChangeRequired`）；团队计划增量 §4.1 C3 未列 `ui.trunk.*`，但 §10.3/P1.6 的 trunk 面板需要，属 C3 目录内 key 家族扩展，由 C3 记录并在 E1 披露。
- `ui.stableWrite.confirm.*` 的卡面文本：**D1 用 C3 key 组装 preview/detail**（主进程 `mainT`/`translate`），U1 原样 `<pre>` 展示；不由渲染侧拼装第二套（U1 Q11 裁决）。
- `ui.freeze.reason.*` 九类与 C1 `DOC_FREEZE_REASONS` 一一对应；`migrated-draft` 只作为迁移标记 key（`ui.freeze.migratedDraft`），不作为 reason key。
- 审核者同时是 C3 的实施者，本项为自评/需求确认，不虚构独立审核人；C3 的实际 key 冻结须在 U1/D1 之前完成（团队计划依赖）。

### 4.9 run-change 存量测试迁移属 D1 写集

- 逐项核对 `角色卡/桌面窗口/boundary.yaml`：`run-change.test.ts`、`run-change-entry.test.ts`、`run-change-trigger.test.ts`、`version-decision.test.ts`、`interface.test.ts`、`session.test.ts`、`pending-card-restart.test.ts`、`decision-service.test.ts`、`project-state.test.ts`、`operator-channel.test.ts`、`rejection-copy.test.ts`、`write-safety.test.ts`、`download-request.test.ts`、`download-decision.test.ts`、`acceptance-return-card.test.ts`、`run-pin.test.ts`、`chain-enforcement.test.ts`、`test/桌面应用/e2e/main.mjs` 均为已授权精确条目/B-4/B-10。**结论：D1 的迁移清单在写集内**；更新须逐条理由、不弱化断言、不新增 skip。
- U1 侧 `test/桌面UI/run-change-view.test.ts` 的按钮级用例删除/改写由 U1 负责（其目录授权）；不得把 D1 的测试改动扩到 U1 写集。

### 4.10 其他形状不一致（修订清单）

| # | 不一致 | 裁决 |
| --- | --- | --- |
| 1 | C1 `TrunkManifest.artifacts` 无 `roleCards`；编排 §2.3 #16 使用 `artifacts.roleCards[role]`；P1.6 AC-34 要求 workflow/role-card/boundary 三类 | **C1 补 `roleCards?: Record<string, TrunkStableArtifactRef>`（或等价稳定文件映射，需带 kind/path）；`TrunkApplySnapshot` 同步补 `roleCards`**；编排按此实现 |
| 2 | C1 `TrunkApplyJournalPhase = "prepared"|"run-manifest-written"`；编排 §4.5 第 5 步写 `phase:"committed"`；V1 AC-12 要求 prepared/run-manifest-written/committed 样例 | **C1 补 `"committed"`**（提交点后写，phase 仅审计）；S2 写、T1 验 |
| 3 | 编排 §4.6 `source:"main-upgrade"`；C1 `TrunkSource` 为 `"upgrade"` | 编排改用 C1 的 `"upgrade"`；不得在消费方新造字面量 |
| 4 | 编排 §4.3/§4.6 用 `vca-conflict`、`trunk-drift`；C1 错误码无此二者 | 二选一：C1 补 `vca-conflict`（推荐，便于测试）/ `trunk-drift` 并入 `trunk-verify-failed`；不恢复 drift 状态 |
| 5 | D1 §3.4-4 `CustomerInputRequest.acknowledgments?: string[]`；C1 §3.3/§5 为 `CustomerInputAcknowledgement[]`（id/label/required）；U1 §4.5 为对象数组 | **以 C1 对象数组为准**；D1 透传对象数组并在 `respondUnsafe` 按 required 结算；`CustomerInputOutcome.acknowledged: string[]`；U1 按对象数组渲染 |
| 6 | bootstrap：C1 `TrunkAmendmentDoc.baseTrunk` 非空；P1.6 允许 `baseTrunk:null` + `bootstrap:true` 的任意 VCA | **C1 允许 `baseTrunk: TrunkVersionRef | null`**，或 C2c 明确 bootstrap 仅 version-upgrade 并在错误码拒绝 detail bootstrap；AC-25 按 P1.6 原文判定 |
| 7 | `DocFreezeRecord.applicationId` 必填，但 `proposal-confirmed`/`intent-confirmed` 可能无 VCA application | C1 为每个 reason 定义非空 applicationId 派生（允许合成 `proposal-<id>`/`intent-<id>`）；不得空串 |
| 8 | 编排 §3.6 `version.change` 关键字段写 `kind`，C1 事件用 `vcKind` | C2a 按 C1 `vcKind`/`stableKind` 校验；文档统一 |
| 9 | 编排 §1.2 称 `TASK_EVENT_KINDS` 当前 15 类；实测 17 类 | 文档更正（非语义） |
| 10 | 运行时核心 Q5 称「Model 不需要新 cardKind」；D1 §十一-1 要求 stable 卡新卡种 | 按 §4.5 裁决：仅 stable workflow 卡新增 app-owned 卡种；VCA 复用 decision |

## 五、Q 项裁决表

> 处置标记：**采纳**＝按提案建议；**裁决**＝按本审核另一种口径；**澄清**＝需策划/沟通补材料，但不阻断 P1；**条件**＝C1/C2b/C2c/D1 冻结点执行。

### 5.1 运行时核心 Q1–Q14

| # | 问题 | 提案建议 | 审核处置 |
| --- | --- | --- | --- |
| Q1 | P1.3 契约不可得，是否以提案 §3.1/§3.2 为 C1 冻结候选 | 是 | **采纳**：以提案为 C1 候选；若沟通在 C1 前提供 P1.3 快照则逐字段核对；否则 C1 声明注明派生来源（§1.3-4） |
| Q2 | `trunk.state` op 归属（gap/drift/stable-repinned） | gap=application；drift/unfrozen-expired 仅 legacy 读；stable-repinned=customer | **采纳**（§4.1）；C2a 按 `TRUNK_STATE_CUSTOMER_OPS`/`APPLICATION_OPS` 校验 |
| Q3 | applied 类事件归属 | applied/apply-failed/written=application+decisionId | **采纳**（§4.1）；编排 §3.6 的 applied=customer 须改 |
| Q4 | 一次性许可消费点 | 守卫同步快照判定 + 写后 Service 复核消费 | **裁决细化**：pre-write 纯函数校验 targetSha；post-write 复核后消费；失败作废许可；guard 不做 I/O（§4.3） |
| Q5 | `acknowledgments` 用途收窄 | 对象数组；id 词表由 D1/C3 定义；不写入 Model 枚举 | **采纳**；D1 的 `string[]` 改为对象数组（§4.10-5） |
| Q6 | `migrated-draft` 不是 freeze reason | 硬约束 | **采纳**（§4.2-3） |
| Q7 | 是否给 `project-state.ts` 加 trunk 投影 | 不加 | **采纳**：不加；D1/U1 用 `trunk:state`；若需另案（条件项） |
| Q8 | `RunRepinRecord` 位置 | 编排 `run-manifest.ts` | **采纳**：放编排；`runtime.ts` 不加（团队计划「可选」允许） |
| Q9 | 8 项整组一致性 check id | 提案 8 项候选；策划核对 P1.3 | **澄清+采纳候选**：有 P1.3 原文则核对，否则以提案候选冻结并在 C1 声明注明；S2 内部 id |
| Q10 | `RefactorRequestStatus` 是否含 `superseded` | 五值 | **采纳**五值（含 superseded）；状态迁移文档化；C2a 校验 |
| Q11 | 错误码/ID 正则/事件字段命名 | 采纳候选；`vca-hash-drift`；`vc-/rf-/sw-`；`am-[0-9]+`；`vcKind/stableKind` | **裁决**：采纳候选码集，**补 `vca-conflict`**；`trunk-drift` 并入 `trunk-verify-failed`；ID 正则与 `amendmentId` 格式采纳；事件字段保留 `vcKind`/`stableKind`（§4.10-4/8） |
| Q12 | V1 哈希差异 | 请沟通核对 | **裁决**：以当前 350 行 / 归一化 `3c40acad…` 为准；`75bf7a49…` 旧快照由沟通/统筹更正（§1.3-1） |
| Q13 | bootstrap 期 `TrunkManifest.runId` 可 null | 可 null；TrunkVersionRef.runId 同；base 比较以 version+digest 为主 | **采纳**；首个 handoff pin 回填；`vca-base-mismatch` 以 `trunkVersion`+`digest` 为主 |
| Q14 | `digest` 算法 | S2 文档化，不在 Model 定义 | **采纳**：Model 只声明字符串；S2 在 C2c/S1 文档化规范化 JSON sha256 |

### 5.2 编排 Q1–Q13

| # | 问题 | 提案建议 | 审核处置 |
| --- | --- | --- | --- |
| Q1 | R9 记录形状：可选 freeze 字段 vs 新 event | 新 `event:"frozen"` 记录 | **采纳**（§4.2-1）；latest-record-per-path；旧 app fail-closed 披露 |
| Q2 | `migrated-draft` 标记存放 | baseline `event:"draft-marker"` | **采纳**（§4.2-3）；`freeze-migrated.json` 仅进度标记（若采用） |
| Q3 | 冻结记录写入者 | 只经 C2b API | **采纳**（§4.2-4） |
| Q4 | `stableWriteDecision` 的 sha 时点 | pre-write `(path,permit)`+targetSha；post-write Service 复核 | **采纳并细化**（§4.3）；guard 纯函数；写后消费/失败作废 |
| Q5 | 许可有效期/消费点 | `expiresAt` 30 分钟；成功才消费 | **裁决**：30 分钟默认；批准后必填 `expiresAt`；成功消费；失败作废（不可复用）；过期不自动补发 |
| Q6 | trunk stable 快照字段 role-card | 增加 `artifacts.roleCards[role]` | **采纳**（§4.10-1）；C1 修订 |
| Q7 | `doc-freezes` 不可用时的 draft 可用性 | 一律 fail-closed（含 draft） | **采纳**（§4.2-6） |
| Q8 | VCA 记录并发/多实例 | 单进程串行链 + 原子写；多实例复用 versions.lock | **采纳**；若多实例需求出现，停止回报 |
| Q9 | targets↔items 匹配键 | POSIX 相对路径/精确 kind/roleId/toSha256；execution 两类 | **采纳**；S2 文档化归一化 |
| Q10 | `version.change`/`trunk.state` 精确字段 | 按 §3.6 列表冻结 | **裁决**：以 C1 冻结字段为准（`vcKind` 等）；C2a 只做形状校验；`stable-repinned` 必含 path/oldSha/newSha/confirmationId/decisionId/trunkVersion 不变 |
| Q11 | project-state 投影 | 不新增 | **采纳**（条件项） |
| Q12 | V1 哈希漂移 | 沟通核对 | **裁决**同 5.1 Q12 |
| Q13 | G2a 副本差异 | 以 25 行补注版为准 | **裁决**：以 25 行 / `bfac5781…` 为准；沟通更正 V1 引用（§1.3-2） |

### 5.3 桌面窗口 §十一 1–11

| # | 问题 | 提案建议 | 审核处置 |
| --- | --- | --- | --- |
| 1 | 主权卡 cardKind/白名单（最高优先） | 新增两个 app-owned 卡种 `version-change`/`stable-write`，白名单从 GROUP 键集拆出 | **裁决**：VCA 复用 `decision`（带 flowId）；**只新增 `stable-write` 一个 app-owned 卡种**；C1 加 `GOVERNANCE_CARD_KINDS` 白名单、**不进** `GOVERNANCE_CARD_GROUP`；C2a `isGovernanceCardKind` 改读白名单（§4.5） |
| 2 | S4/C2c 公共查询/呈现形状 | 由 S4 冻结 | **采纳**：只读、有界、项目相对路径、无密钥；名称/入参/返回 S4 冻结；不一致即停止 |
| 3 | VCA/重构/stable 提交入口形态 | 能力工具（仿 download/requirement-change） | **采纳 VCA 能力工具**（不新增 `version-change:submit`）；重构按 §4.7 身份校验或改能力；U1 表单改只读（§4.7） |
| 4 | `acknowledgments` 契约 | C1 加法；D1 回传 outcome；`request.resolved` 不加字段 | **采纳方向，形状以 C1 对象数组为准**（§4.10-5）；D1 修订 `string[]` 表述；`request.resolved` 不加 `acknowledged` |
| 5 | 通知/文案归属 | C3 key；`notify:"none"` + 桌面系统行 | **采纳**：C3 冻结 `ui.*`/`main.*`；桌面显式通知恰一次；不硬编码 |
| 6 | V1 哈希不一致 | 沟通核对 | **裁决**同 5.1 Q12 |
| 7 | trunk IPC 保留集/`trunk:state` | 移除客户侧重构 IPC；保留 upgrade/refreeze/abandon/recover/list/state | **采纳**；单一 `trunk:state`；D1/U1 冻结点统一；不设第二状态源 |
| 8 | stable 卡推荐项 | reject 为 recommended | **采纳**；新卡种仍须恰一推荐项/≥2 选项；D1/C2b/C3 冻结校验 |
| 9 | AC-21 恢复路径「若提供」 | 只展示编排是否提供，不虚构 | **采纳**；E2 按 P1.6 原文判定 |
| 10 | `version-change:present` 重复发卡 | 允许；不重复写 submitted/通知 | **采纳**；B-8 提供可重发入口；requestId 幂等 |
| 11 | B-13 条件 | 默认并入 B-10 | **采纳**；拆分须停止回报并按增补程序确认 |

### 5.4 桌面UI Q1–Q11

| # | 问题 | 提案建议/默认 | 审核处置 |
| --- | --- | --- | --- |
| Q1 | D1 IPC/快照形状 | 以 D1 冻结为准 | **采纳**；U1 按 D1 表；`pendingCount` 可选（D1 若提供则做角标） |
| Q2 | C3 key 集合/计数/措辞（含 `ui.trunk.*`） | C3 冻结 | **采纳**：C3 拥有；包含 `ui.trunk.*` 22 + `ui.stableWrite.*` 12；114 为需求清单，最终以 C3 冻结为准；旧 key 值迁移归 C3 |
| Q3 | 卡种 token 与载荷（cardKind/risk/recommended/acknowledgments 形状） | D1+C1 冻结 | **裁决**：VCA/逐项/trunk = `decision`；stable = `stable-write`（app-owned）；`acknowledgments` 对象数组；回传 `acknowledged: string[]`；U1 `DECISION_KINDS` 按 D1 冻结点加 token（§4.5/§4.10-5） |
| Q4 | 提交入口形态：渲染表单还是角色工具 | 渲染表单（默认） | **裁决**：**VCA 只经角色能力工具**（D1 §3.3）；U1 表单改只读 + 会话提交说明（AC-9 证据按能力+面板）。若客户要求表单，另行确认（不阻断） |
| Q5 | 主干升级请求形状/高危确认位置 | reason；确认在 D1 卡内 | **采纳**：reason 必填，scope 按 D1；高危二次确认在 D1 客户 UI/卡，U1 不自建确认对话框；回执只显示「待确认」（§4.7） |
| Q6 | `run-change-view.ts` 去留 | 保留内部/删除按钮用例 | **裁决**：保留为低层内部/回执用途（低层 API 保留），删除按钮级用例；由 D1 冻结点确认消费者；不新增第二状态源 |
| Q7 | 差异展示边界 | 只显示 D1 有界文本（含完整 hash） | **采纳**：不做文件级 diff（O7 未选）；结构化 diff 属新范围，停止回报 |
| Q8 | 面板导航（单 tab 三分段 vs 两 tab） | 单 tab 三分段 | **采纳**默认；`ui.projectState.pinnedHint` 加「打开版本变更」按钮默认不做；变更需评审 |
| Q9 | 冻结/状态枚举 | D1 发送稳定枚举 | **采纳**：VCA 六状态、refactor 五值（含 superseded）、freeze reason 九类、trunk op 集；与 C1/C2c 一致；U1 映射表冻结后写死 token |
| Q10 | 待批角标 | 可选，数据源 D1 `pendingCount` | **采纳**：可选、不本地统计；D1 提供则显示 |
| Q11 | stable 卡面文本归属 | D1 组装 or 渲染拼装 | **裁决**：D1 用 C3 `ui.stableWrite.confirm.*` key 组装 preview/detail（单一实现）；U1 原样展示；不得两套 |

### 5.5 门禁引擎 C1–C18（重点项）

| # | 事项 | 提案建议 | 审核处置 |
| --- | --- | --- | --- |
| C1 | 快照/cache 格式归属 | C2b 定义 builder/parser；B-6 持久化；guard 消费 | **采纳**（§4.2/§4.4） |
| C2 | 迁移完成标记 | `.ans/state/freeze-migrated.json` | **采纳（有条件）**：仅迁移进度标记；不得成为第二冻结权威；`migrated-draft` 证据在 baseline `draft-marker` |
| C3 | frozen 注入信任边界 | 生产只用 `versionedDocFreezeState`；禁硬编码 | **采纳**；集成测试锁定 run-role/shell 调用 |
| C4 | pin/re-pin 入口 | 同一判定 `operation:"pin"/"repin"`；不含 `repinIfBootstrapped` | **采纳**（§4.4） |
| C5 | stable-write 字段/TTL/base 空值 | C1 补 `approvedAt`/`expiresAt`/`consumedAt?`；`baseSha256=""` | **采纳**（§4.3）；`expiresAt` 批准后必填；TTL C2c 30 分钟 |
| C6 | write/edit 最终内容 sha 到 gate | `WriteGate` 可选 `{contentSha256}` 或预写钩子 | **采纳**：`WriteGate` 可选上下文（C1），`tools.ts` 最终字节 sha，S3 消费；tools.ts 补入运行时核心写集（§4.3-5） |
| C7 | shell 写 stable | 一律拒绝并提示 stable-write 通道 | **采纳** |
| C8 | 删除/改名/移动已登记草稿的 R9 变更 | `removed`/`moved` 记录或重建；否则安全收窄 | **采纳**：Batch 1 前不支持则 guard 拒绝已登记草稿的删除/改名/移动并 E1 披露 |
| C9 | stable 删除/改名/移动 | 本特性拒绝 | **采纳** |
| C10 | unknown/corrupt 时新建版本 | 拒绝所有版本化变更（含 vN+1）；migration-required 新文件允许 | **采纳**（AC-10/AC-21 反向） |
| C11 | `checkVersionedDocWrite` | 删除；若保留薄包装 | **采纳**：删除导出/死导入；AC-15 多解允许 |
| C12 | `governance-roles.ts` 文本 | 不改；靠拒绝文案 | **采纳**：不改；若必须改文本，停止回报走治理变更 |
| C13 | `protectedPathMention` | ready 时只覆盖 frozen 路径；unknown/corrupt 全部 | **裁决：不采纳放宽**。保留现状（所有受管版本化路径 mention deny；ready/unknown/corrupt 一致），避免 opaque shell 事后违规；精确目标判定使用 frozen 状态；在提案中说明差异 |
| C14 | legacy 拒绝码 | 保留 `versioned-doc-overwrite`；pin 用 `versioned-doc-not-frozen` | **采纳**；`rejection-copy` 回归 |
| C15 | execution（teamPlan/flow）冻结 | 明确是否纳入 guard | **裁决**：本轮**不**把 execution 加入 guard 版本化模式；execution 冻结/re-pin 由 VCA/trunk manifest + verify 保证；E1/E2 披露「execution 非 guard 冻结」；若策划要求 guard 级执行，属方案澄清/范围变化，停止回报 |
| C16 | `doc.freeze` 后快照刷新 | C2c 写后 install/refresh；失败 unknown | **采纳** |
| C17 | 许可快照刷新/消费 | B-7 批准后 install、写后 consume；D1/B-11 接线 | **采纳**（§4.3） |
| C18 | 路径大小写/反斜杠/规范化 | `normalizeVersionedDocPath`；stable 大小写不敏感 | **采纳**；测试 `..`/绝对/反斜杠/大小写 |

## 六、与 `project-rules.md` 的对照

- **无直接冲突**：本特性不改任何角色写权、Section 1、预授权/禁写清单、WriteGate/shell 硬地板、D3/appointment-write、验收/证据/三道闸门；`governance-roles.ts` 不改。现有规则 §二.12/14/15/16/17 的「不新增 cardKind」均限定各自规则范围（§二.13 明确 §二.12 的约束只限于 gate 复核）；本特性的 `stable-write` app-owned 卡种属新特性范围，**不违反既有规则**，但须在 PM 的工程法案中登记。
- **缺口（非阻断，PM 自身后续登记）**：`project-rules.md` 尚未记录 VCA/冻结/stable-write/refactor 与新增 app-owned 卡种；客户 IA 已确认本特性，建议在 P1 通过后由项目管理（C3 同一角色）在 `project-rules.md` §二新增一条「主干/冻结与版本变更-01」并在 §三/变更记录注明「实现未验证」；不扩张任何角色文件权限。
- 现有 §二.13/§二.16 的「替我决策」默认代选对 decision 卡仍有效；本特性通过 `isApplicationDecisionReservedForCustomer` 扩展排除 VCA/trunk/detail/stable 卡，**不改变其他卡种行为**，与 PR #58/2026-11-04 客户直修一致。规则登记后，读者不会误以为 VCA 卡可被代选。
- 日志/诊断：提案要求 `createDiagnosticLogger`/既有输出、不打印密钥；与 §二.10 一致；实现时按此。
- 验收/证据：提案按 V1 v1.1、T3、截图不录屏；与 §二.9/11/17 一致。

## 七、阻断项（必须修订/裁决后才能 `recommend approval`）

| # | 阻断 | 涉及角色 | 类型/落点 |
| --- | --- | --- | --- |
| F1 | `acknowledgments` 形状冲突：C1 对象数组 vs D1 `string[]`；U1 对象数组 | 运行时核心 / 桌面窗口 / 桌面UI | 提案修订；以 C1 对象数组为准（§4.10-5） |
| F2 | stable workflow 卡无 flowId 不能复用 `decision`；C1 Q5「不加 cardKind」与 D1 §十一-1 冲突 | 运行时核心 / 编排 / 桌面窗口 / 桌面UI | **契约裁决**：新增 `stable-write` app-owned 卡种 + `GOVERNANCE_CARD_KINDS` 白名单（不进 `GOVERNANCE_CARD_GROUP`）；编排在 `run-role.ts` 补 `CARD_KIND_ROUTE_HINTS` 一行编译解锁（§4.5） |
| F3 | `TrunkManifest.artifacts` 缺 `roleCards`、`TrunkApplySnapshot` 缺 roleCards；AC-34 无法绑定 role-card 快照 | 运行时核心 / 编排 | C1 补字段；编排按此实现（§4.10-1） |
| F4 | `TrunkApplyJournalPhase` 缺 `"committed"`；编排/V1 AC-12 要求 | 运行时核心 / 编排 | C1 补 phase（§4.10-2） |
| F5 | stable 许可字段/消费：C1 缺 `approvedAt`；D1/编排对消费点表述不一；失败许可可复用风险 | 运行时核心 / 门禁引擎 / 编排 | C1 补字段；冻结裁决 pre-write+post-write+失败作废（§4.3） |
| F6 | `WriteGate` 无内容 hash 上下文；stable 写前判定不可实现；`tools.ts` 未在运行时核心提案写集 | 运行时核心 / 编排 | C1 扩可选上下文；tools.ts 补入写集并在计划披露；S3 消费（§4.3-5） |
| F7 | 冻结同步快照双实现风险：门禁引擎 `VersionedDocFreezeSnapshot` vs 编排 `freeze-snapshot.ts` 自有 Map | 门禁引擎 / 编排 | **单一实现**：快照状态归 C2b；编排只调用 install/refresh/query，不自建第二 Map（§4.2/§4.4） |
| F8 | `version.change.applied` 归属：编排 §3.6 记 customer；与 AC-31/F35 及 C1 Q3 不一致 | 编排（C2a） | 改为 application + decisionId（§4.1） |
| F9 | D1 `@决策` 指令排除缺口（实际符号 `tryApplyDirectiveDecision` 未调用主权谓词）；提案用旧名 | 桌面窗口 | D1 修订并列入测试；AC-5 支撑（§4.6） |
| F10 | VCA 提交入口冲突：U1 表单 vs D1 能力工具/无 `version-change:submit`；U1 假设的推送事件 D1 不提供 | 桌面UI / 桌面窗口 | U1 改只读+能力工具；单一 `trunk:state`（§4.7） |
| F11 | refactor 渲→主提交的身份校验缺失；trunk 高危确认与「无渲→主批准捷径」自相矛盾 | 桌面窗口 / 编排 | 重构经 convener 能力或校验活动会话；trunk 确认绑定 preview/客户 UI 并明确二选一（§4.7） |
| F12 | bootstrap `TrunkAmendmentDoc.baseTrunk` 非空，与 P1.6 `baseTrunk:null` VCA 冲突 | 运行时核心 / 编排 | 允许 null 或明确禁止 detail bootstrap（§4.10-6） |

## 八、非阻断修订项

1. **B0/V1/G2a 引用**：三份提案的 173 行 B0、`75bf7a49…` V1、16 行 G2a 引用更新为 221 行/`8c6272d5…`、350 行/归一化 `3c40acad…`、25 行/`bfac5781…`（§1.3）。
2. **编排 `TASK_EVENT_KINDS` 计数**：提案写 15 类，实测 17 类；文档更正。
3. **错误码/字段名**：`vca-conflict` 补入 C1；`trunk-drift` 并入 `trunk-verify-failed`；事件字段 `vcKind`/`stableKind` 统一（§4.10-4/8）。
4. **`DocFreezeRecord.applicationId`**：为 proposal/intent-confirmed 定义合成值；不得空串（§4.10-7）。
5. **`VersionChangeEvent` applied 的 `decisionId`**：建议携带（C1 可选字段已允许）；C2a 校验 applied 无 customer。
6. **`StableWriteRecord`/permit 记录**：批准后 `expiresAt` 必填；`failed` 许可不可复用；桌面面板显示 expired（§4.3）。
7. **`freeze-migrated.json`**：仅进度标记；E1 披露；不新增第二权威（§4.2）。
8. **C13 mention 放宽**：采纳本审核裁决（保留全路径 mention deny），门禁引擎提案相应改写（§5.5）。
9. **C15 execution 冻结**：E1/E2 披露「非 guard 冻结」；不新增 guard 模式（§5.5）。
10. **U1 面板/推送**：按 D1 冻结名；`version-change:state`/`stable-write:state`/`refactor:state` 不设；单 `trunk:state`（§4.7）。
11. **U1 `DECISION_KINDS`**：若 D1 使用 `stable-write` token，按冻结点加入；VCA 复用 `decision` 不加。
12. **桌面窗口 §1.3 的函数名**：`evaluateDirectiveDecision` 更正为 `tryApplyDirectiveDecision`；`applyDecisionDirective` 是注入句柄（§4.6）。
13. **运行时核心 §1.2/§6 Q2 的 F19 旧表述**：以团队计划 §5.5/§6.2 + 本审核 gap=application 为准（§4.1）。
14. **i18n 114 key**：C3 冻结实际 key/计数；U1 的 43/12/20/17/22 为需求清单，不是冻结计数（§4.8）。
15. **C3 写集披露**：`ui.trunk.*` 22 key 未在增量 §4.1 C3 行列出，属 C3 目录内 key 家族扩展，由 C3 在提案/实施记录披露，E1 引用。

## 九、AC-1–AC-36 覆盖审查（摘要，不替代 V1）

- **AC 表完整**：V1 v1.1 的 AC-1–AC-36 与 P1.6 §7.2 逐条对应；五份提案的 AC 映射（运行时核心 §5.3、编排 §6.2、门禁 §10、D1 §13.1、U1 §十一）**无遗漏 AC 的生产角色**。Model 只证形状/常量；运行时/守卫/服务/桌面/UI/T1 分工明确；E2 不得以 Model 测试替代运行时证据（运行时核心 §5.2 已如实披露）。
- **重点 AC 的依赖**：
  - AC-1/10/15/27：C2b 守卫 + C2c 冻结服务 + C2a 账本 + T1；C13/C15 裁决不削弱 AC-15 的既有七类/旧版本保护。
  - AC-3/4/5/18/26：C1 发起/目标/哈希字段 + B-7/B-8 + D1 通道/主权 + `tryApplyDirectiveDecision` 修复（F9）；F9 未修则 AC-5 的「指令不代选」不能成立。
  - AC-6/19/28/29/30/32：C1 item/target/legacy + B-7/B-8 + S2；execution 按 §5.5 C15 披露。
  - AC-7/8/20：B-9 + D1/U1 只读审计；无客户卡。
  - AC-13/24：C2b/C2c/D1 写权不变；`governance-roles.ts` 不改；F2 新卡种不得进入判断组。
  - AC-33–AC-36：C1 stable-write + C2b 许可 + B-7/B-11 + D1 卡/面板 + U1；F2/F5/F6/F10 必须先闭合。
  - AC-12/17/25：C1 journal phase（F4）、pin/bootstrap、run-manifest；F4 必须先闭合。
- **证据边界**：B0 最终版 221 行/`8c6272d5…` 的套件计数已包含下载特性；提案引用的数字一致；E1 以测试角色最终版为准。U1 的 55 文件/408 tests、D1 的 57 文件/562 tests、门禁 33/292/291、编排 64/804/803/1 与 B0 §6.6 一致。

## 十、逐提案结论与修订要求

| 提案 | 结论 | 必修项 |
| --- | --- | --- |
| 运行时核心 | **needs revision** | F1、F2（C1 侧）、F3、F4、F5（C1 侧）、F6（C1+写集）、F12；Q1/Q9 材料澄清；B0/V1 引用更正 |
| 编排 | **needs revision** | F3（快照字段）、F4（journal phase）、F7（快照单一实现）、F8（applied 归属）、F11（refactor 身份配合）、F12（C2c 侧）、错误码/字面量对齐；**F2 的 `run-role.ts` `CARD_KIND_ROUTE_HINTS` 一行编译解锁**；B0 引用更正 |
| 门禁引擎 | **基本可批准（条件修订）** | 无跨角色阻断；按 §5.5 改写 C13（不放宽 mention）、C15（execution 不纳入 guard，E1 披露）、C5/C6 与 C1 对齐、C2 标记边界；B0 引用更正。修订后可单独 `recommend approval` |
| 桌面窗口 | **needs revision** | F1（ack 对象数组）、F2（stable 卡种消费）、F5（许可消费/失效）、F9（指令排除）、F10（无 submit IPC/推送面）、F11（重构身份/trunk 确认）、函数名更正；B0 引用更正 |
| 桌面UI | **needs revision** | F10（表单改只读+能力工具、推送面）、Q3（stable token/ack 形状）、Q9（枚举五值）、Q11（卡面文本由 D1 组装）、B0/V1 引用更正 |

## 十一、结论、前置条件与声明

- **总体结论：`needs revision`**。五份提案均实质可审、写集在授权内、未发现需重开闸门 0/1/2 的范围变化；但存在 **F1–F12 阻断项**（均为跨角色契约形状/接线与 U1/D1 一致性，可在各自既有写集内修订解决）。修订后按新版本/新哈希复审；复审通过前不进入 C1/C2a/C2b/C2c/C3 冻结与 S1–S4/D1/U1。
- **`recommend approval` 的前置条件**：
  1. 五份提案按本记录修订并写盘；复审使用新行数/SHA-256，旧哈希不复用。
  2. F1–F12 在 C1/C2a/C2b/C2c/D1/U1 冻结点**同一形状**冻结，不得各自解释；F2 的 `stable-write` app-owned 卡种和 `GOVERNANCE_CARD_KINDS` 白名单由 C1 定义、C2a 消费、D1/U1 遵守。
  3. B0/V1/G2a 引用更正由各提案作者/沟通/统筹完成（不阻断 P1 实质，但复审时须一致）。
  4. 门禁引擎提案按 §5.5 的 C13/C15/C5/C6 修订后可单独 `recommend approval`；其余四份按 F 项修订。
  5. V1 经沟通核对（路径/版本）的团队计划入口条件继续有效；P1 审核通过不等于 V1 沟通确认。
- **不授予**：本记录不授权实施、不改写提案/代码/测试/边界/方案/验收/沟通记录、不 commit/push/merge/release。实施权限以客户 IA 与团队计划派发为准；提交/推送/合并/发布仍须客户另行授权。
- **自审披露**：审核者同时是 C3（i18n）实施者；§4.8 的 i18n 需求确认与 §六的工程法案登记属于自评/后续工作，不虚构独立审核人。五份提案均为只读审核；未要求其他角色补充评估；如复审需要受影响角色独立评估，按 `proposal-review.md` 在独立上下文补做，未获得时如实记为缺口。
- **只读声明**：本文件是本次唯一写盘；未修改任何输入/提案/产品/测试/角色卡/边界/方案/复核/验收/沟通/调度文档；未运行实施测试；未 commit/push。

---

# 复审（Revision 1，2026-11-04）

> 本节追加在原审核记录（368 行 / `2cb04caefae4074ef732e7030900bd11201a4c6a5583d74bf94814aacaf2ed93`）之后；原记录正文与历史哈希保留、不改写。复审只读：未改任何提案/产品/测试/边界/角色卡；唯一写盘为本记录；未 commit/push。**旧提案哈希作废**，复审使用修订后新哈希。

## 一、复审对象与输入

| # | 角色 | 路径 | 行数 | SHA-256（实际字节） |
| --- | --- | --- | --- | --- |
| 1 | 运行时核心 | `角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 927 | `8b0c3d1969a03785e431a2f55b8a4ab5b65d62dd0715da0e6f407b945aaa9e00` |
| 2 | 编排 | `角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 610 | `895fe6a90d42c328684244d926381dbc0f97a5df1642beef6b8578736d359c44` |
| 3 | 门禁引擎 | `角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 498 | `eee0a7769c1acde373c842a8ff10c478fb4d4f002ec93da71950295b75b44e74` |
| 4 | 桌面窗口 | `角色卡/桌面窗口/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 461 | `1a0b5c9a6bcbcb165e3c45c7c70408aee22d4f3f77d046a66a5b0f0219549c42` |
| 5 | 桌面UI | `角色卡/桌面UI/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 585 | `6ac40ceb96815bf55562d5f9ac4797c7bd01b39715215e5b5e951c8771d2fa3c` |

五份均与协调者给出的新哈希一致；均仍为 `proposal-only`，写盘前 `git status --porcelain -- src app test` 为空。P1.6 `fccb1f54…`/1151、V1 350 行/归一化 `3c40acad…`、B0 221 行/`8c6272d5…`、G2a 25 行/`bfac5781…` 未变；五份均按本记录 §1.3 更新了旧引用（173 行 B0、`75bf7a49…` V1、16 行 G2a 不再引用）。

## 二、F1–F12 逐项关闭核对

| # | 复审结果 | 证据（修订后） |
| --- | --- | --- |
| **F1** `acknowledgments` | **已闭合**：C1 统一为对象数组 `CustomerInputAcknowledgement[]`（`{id,label,required}`），outcome `acknowledged: string[]`；D1 对象数组透传 + `respondUnsafe` 按 `required` 结算；U1 按对象数组渲染与回传 `acknowledged: string[]`；`request.resolved` 不加字段。三处形状一致。 | C1 §3.3-4/5、§5.1；D1 §3.4-4、§13.2-6、§17 F1；U1 §4.5、§13.2 |
| **F2** `stable-write` 卡种/白名单 | **已闭合**：VCA/逐项/最终/trunk 卡复用 `cardKind:"decision"`+`application:true`+真实 `flowId`；只新增 app-owned `stable-write`；C1 加 `GOVERNANCE_CARD_KINDS` 独立白名单且**不进** `GOVERNANCE_CARD_GROUP`；C2a `isGovernanceCardKind` 改读白名单；编排 `run-role.ts::CARD_KIND_ROUTE_HINTS` 补一行；D1 有 `validateStableWriteCardShape`；U1 只按冻结 token 加入 `DECISION_KINDS`。 | C1 §3.3-1、§3.6、Q5/Q11；编排 §2.6 #34、§3.6、§9 Q16；D1 §3.1/§5.3/§11-1；U1 §4.6/§12.1 |
| **F3** `roleCards` | **已闭合**：C1 `TrunkManifest.artifacts.roleCards?`、`TrunkStateView.roleCards?`、`TrunkApplySnapshot.roleCards?` 均补；`TrunkStableArtifactRef` 增 `kind`；编排 stable-snapshot 按 workflow/roleCards/boundaries 更新；`TrunkApplySnapshot` 同步。 | C1 §3.1、§3.4、§4.2-3；编排 §2.3 #16、§3.1 交接、§4.5/§4.7 |
| **F4** journal `committed` / `"upgrade"` | **已闭合**：C1 `TrunkApplyJournalPhase = "prepared"|"run-manifest-written"|"committed"`；编排 §4.5 第 5 步写 `committed`（仅审计）；`TrunkSource` 用 `"upgrade"`，编排状态机与 §3.1 交接均不再出现 `main-upgrade`。 | C1 §3.1、§4.2-4；编排 §3.1、§4.5、§4.6 |
| **F5** stable 许可字段/消费 | **已闭合（语义层）**：C1 补 `approvedAt`、`expiresAt`（批准后必填）、`consumedAt?`、`baseSha256=""` 约定；编排/门禁/D1 四处一致采用 pre-write 纯函数判定、post-write `completeWrite(actualSha)` 复核后消费、失败作废不可复用、TTL 30 分钟、TOCTOU 披露。**类型/记录形状统一遗留 F13（冻结条件）**。 | C1 §3.2、§3.4、§4.2-2、Q4；编排 §3.4/§3.8.4/§4.7/§9 Q4-Q5；门禁 §4.2/§4.3/§5、C5/C17；D1 §六/§11-12 |
| **F6** `WriteGate` 内容哈希 | **已闭合**：C1 扩可选 `WriteGateContext { contentSha256?, operation? }`；`src/provider/runtime/tools.ts` 第二次（写前复核）`govern` 传最终字节 sha，并**补入 C1 写集**（Section 1 单文件、计划枚举补登、非边界变更）；编排 S3 `run-role.gate` 对 stable 路径消费；门禁矩阵与 C6 同形；无上下文（shell/opaque）⇒ stable 拒绝。 | C1 §2 #4、§3.3-8、§4.2-6、Q16；编排 §3.8/§4.9/§9 Q15；门禁 §4.3、C6 |
| **F7** 冻结快照单一实现 | **已闭合**：编排**删除** `src/common/编排/freeze-snapshot.ts`（§2.6 #35 改为“不新增文件”）；冻结/许可同步快照只在门禁引擎 C2b 一份实现；编排只调用 install/refresh/query，不自建 Map；门禁 §3.1/§5 明确同一纪律。 | 编排 §0-4、§2.6 #35、§3.8.7、§8.1 R12；门禁 §3.1、§5.5、R16 |
| **F8** applied/written 归属 | **已闭合**：C1、编排 C2a、D1 一致：`version.change.applied/superseded`、`stable.write.written/failed`、`trunk.amendment` applied/apply-failed = application+`decisionId`（不记 customer）；approved/rejected、逐项客户决定、`stable-repinned` = customer。 | C1 §3.4；编排 §3.6、§4.5、§6.2 AC-11/31；D1 §5.5 |
| **F9** D1 `@决策` 排除 | **已闭合**：D1 使用实际符号 `tryApplyDirectiveDecision`，在进入 `applyDecisionDirective` 前调用扩展后的 `isApplicationDecisionReservedForCustomer`（含 VCA/逐项/最终/trunk 词汇与 `stable-write` 卡种）；列入 §13.2 测试（AC-5 支撑）。 | D1 §1.1/§1.2、§3.4-1/2、§9、§13.2-5；U1 §7-2 |
| **F10** 提交入口/推送面 | **已闭合**：无 `version-change:submit` 渲→主 IPC；VCA 只经发起角色能力工具；重构只经 convener 能力工具；stable 写入只经 B-11 presenter；单一 `trunk:state` 推送，不设 `version-change:state`/`stable-write:state`/`refactor:state`；U1 表单改只读指引。 | D1 §3.3/§四/§11-3；U1 §3.4/§4.1/§4.3/§8/§12.1 |
| **F11** 重构身份/trunk 确认 | **已闭合**：D1 不再提供 `refactor:request` 渲→主 IPC，重构只经 convener 能力（或 D1 活动会话校验）；编排 `refactor-runtime.submit` 同步校验；`trunk:upgrade-confirm` 限定为同一 `previewId` 的客户 UI 紧急/恢复二次确认（一次性/过期/sender/审计，非卡批准捷径），不用于 VCA/stable。 | D1 §3.3/§四/§5.3/§11-7；编排 §3.5/§4.8；U1 §4.4/§12.1 |
| **F12** bootstrap `baseTrunk` | **已闭合**：C1 `TrunkAmendmentDoc.baseTrunk` 与 `TrunkAmendmentState.baseTrunk` 允许 `TrunkVersionRef | null`（`bootstrap?` 配对）；编排 §4.3/§9 Q14 对齐；AC-25 按 P1.6 原文。 | C1 §3.1、Q13/Q16；编排 §4.3、§9 Q14 |

## 三、跨角色一致性复核（重点）

- **acknowledgments 三处**：C1 对象数组/outcome `string[]`、D1 对象数组+`string[]`、U1 对象数组+`string[]`；`request.resolved` 不加字段。**一致**。
- **stable 许可四处**：字段（`approvedAt`/`expiresAt` 批准后必填/`consumedAt?`/`baseSha256=""`）、TTL 30 分钟、pre-write 判定+post-write 复核消费+失败作废，在 C1/编排/门禁/D1 四处语义一致。**形状层仍有 F13**（见 §四）。
- **事件归属**：见 F8 表；`trunk.state` 的 `gap=application`、稳定 op=customer、`stable-repinned`=customer 且 trunkVersion 不变，C1/编排/D1 一致。**一致**。
- **cardKind/白名单**：`stable-write` 仅在 `GOVERNANCE_CARD_KINDS`；`GOVERNANCE_CARD_GROUP` 不含它（`governanceCardGroup` undefined ⇒ 永不判断）；C2a 改读白名单；编排 route hint 一行；D1/U1 只消费 token。**一致**。
- **冻结快照唯一实现**：编排文件已删；门禁 C2b 唯一；编排/D1 只 install/refresh/query。**一致**。
- **WriteGate contentSha256 链**：C1 `WriteGateContext` → runtime-core `tools.ts` 第二次 `govern` 最终字节 sha → 编排 S3 `run-role.gate` 消费 → 门禁 `stableWriteDecision`；shell/opaque 无上下文 ⇒ stable 拒绝。**一致**。
- **`tryApplyDirectiveDecision` 排除**：D1 已含 `stable-write` 卡种与 VCA/trunk/detail 词汇；**一致**。
- **提交/IPC**：D1 无 `version-change:submit`/`refactor:request`；U1 只读指引；单 `trunk:state`；**一致**（U1 仍保留一个条件性 `refactor:request` 描述，见 F17，默认不实现）。
- **refactor 身份**：D1 convener 能力位唯一；编排 `refactor-runtime.submit` 校验；**一致**。
- **bootstrap/R9**：C1/N 编排/门禁 append variant（`frozen`/`draft-updated`/`draft-marker`）+ latest-record-per-path + 只经 C2b `appendDocFreezeRecords`；**一致**。
- **i18n**：U1 Rev1 需求清单实测 **99 key**（versionChange 34 / stableWrite 12 / refactor 14 / freeze 17 / trunk 22，无重复）；C3（项目管理）冻结最终 key/计数；`ui.trunk.*` 22 key 属 C3 目录内扩展并披露。**一致**。
- **引用**：五份均更新 B0/V1/G2a；旧哈希不再引用。**一致**。

## 四、新发现/剩余不一致（续编号；均属 C1/C2a/C2b/C2c/D1/U1 冻结点条件，不改变行为/范围/闸门）

| # | 发现 | 裁决/落点 | 责任 |
| --- | --- | --- | --- |
| **F13** | **stable 许可形状三套名**：C1 `StableWritePermit`（含 `permitId`、status approved/consumed/expired/failed、authority union）vs 门禁 `StableWritePermitView`（含 `v`/`diffPreview`、status requested/approved/rejected/written/failed、无 `permitId`）vs 编排 `PermitFact`（未定义）；C1 `StableWriteDecisionInput.now: string`、`permit` 必填 vs 门禁 `now?: () => Date`、`permit?`；门禁返回 `StableWriteDecision` 与 run-role 需要的 `WriteDecision`（allowed 分支含 `matchedEntry`）之间无显式映射。另：编排 `stable-writes.json` 写 `StableWriteRecord[]` + `permitId/expiresAt/consumedAt`，C1 `StableWriteRecord` 无 `permitId`。 | **冻结前统一**：以 C1 `StableWritePermit` 为唯一 permit 形状（补 `v:1`、`permitId`、authority；status 仅 approved/consumed/expired/failed）；门禁 `StableWritePermitView` 改为该类型别名/窄视图，快照存 `StableWritePermit[]`；编排 `PermitFact` 为别名；`StableWriteRecord` 与 `StableWritePermit` 分表存（或 record 内嵌 `permit`），不得第三形状；`stableWriteDecision` 统一输入 `{projectRoot, relPath, sha256, permit?: StableWritePermit, now?: () => Date}`，C1 `StableWriteDecisionInput` 对齐或从 Model 移除；门禁返回形状由 C2b 定义，run-role 对 allowed ⇒ 继续 `baseGate` 并返回其 `WriteDecision`，denied ⇒ 构造 `WriteDecision` 拒绝（`allowedByRoot` 空集 + code/rejection）。 | 运行时核心 / 编排 / 门禁引擎（C1/C2b/C2c 联合冻结前） |
| **F14** | 编排 C2a §3.6 的 `stable.write.*` 关键字段含 `approvedAt/expiresAt?/consumedAt?`，C1 `StableWriteEvent` 无这三个字段。 | **二选一**：推荐 C1 `StableWriteEvent` 增可选 `approvedAt?/expiresAt?/consumedAt?`（加法、便于审计）；否则 C2a 只校验 C1 事件字段、三字段留在 `stable-writes` 记录。不得要求 C2a 校验 C1 未定义字段。 | 运行时核心 / 编排（C1/C2a 冻结前） |
| **F15** | D1 §6.4/§四 `trunk:state` 的 stable 快照文字只列 `artifacts.workflow`/`artifacts.boundaries`，C1/编排已补 `roleCards`；U1 §4.4 已按 workflow/role-card/boundary 三类显示。 | D1 在冻结点把 `roleCards` 加入 `trunk:state` 投影/载荷（workflow/role-card/boundary 三类）；U1 保持三类显示。仅显示层，不改 manifest 逻辑。 | 桌面窗口（D1 冻结前） |
| **F16** | 门禁 §4.3 表把 appointment-write 的 stable 判定调用点写成桌面 `session.ts`/`interface.ts` 的“直接落盘路径”；D1 实际只发行 writeSet/呈现 appointment-write 卡，真正写入经角色 `write_file`/`edit_file` gate（run-role），D1 无直接写盘。 | 明确**真实执行点 = 编排 S3 `run-role.gate`**（write/edit 带 permit）与 B-11 `completeWrite`；D1 只负责 appointment-write 卡/许可安装/结果外显；如未来出现桌面直接写路径（当前不存在），该路径必须接 guard。门禁/D1 按此改文字，不新增代码路径。 | 门禁引擎 / 桌面窗口 / 编排（冻结点澄清） |
| **F17** | U1 §3.4/§4.3 仍保留“若 D1 提供活动 convener 会话校验的 `refactor:request` 则 U1 可加申请动作”的条件描述；D1 Revision 1 已明确**不提供** `refactor:request`（只经 convener 能力）。 | U1 删除该条件分支或明确记为“不实现”；默认能力工具唯一路径与 D1 一致。 | 桌面UI（U1 冻结前文字收口） |

## 五、最终结论与条件

- **复审结论：`recommend approval`（附冻结条件）**。F1–F12 在五份修订版中**真实闭合**，且跨角色形状/接线一致；未发现新的范围扩张、写权/角色变化、B-12/B-13 触发或需重开闸门 0/1/2 的问题。剩余 F13–F17 为**C1/C2a/C2b/C2c/D1/U1 冻结点的合同形状/文字收口**，不改变 P1.6 语义、行为或 AC；**F13 未关闭前不得冻结 C1/C2b/C2c 的 stable-write 契约**（否则 S1–S4/D1 无法同一形状消费），但不阻断本次 P1 复审建议。
- **逐提案**：
  - 运行时核心：`recommend approval`（F13 的 permit 形状统一、F14 的可选事件字段在 C1 冻结前落实；其余按 C1 r2）。
  - 编排：`recommend approval`（F13/F14/F16 在 C2a/C2c 冻结点落实；`run-role.ts` route hint 一行编译解锁按 §4.5 执行）。
  - 门禁引擎：`recommend approval`（F13/F16 在 C2b 冻结点落实；C13 不放宽 mention、C15 execution 不纳入 guard 的裁决保持）。
  - 桌面窗口：`recommend approval`（F13/F15/F16 在 D1 冻结点落实；`tryApplyDirectiveDecision` 修复、无 submit/refactor IPC、`trunk:upgrade-confirm` 约束保持）。
  - 桌面UI：`recommend approval`（F17 在 U1 冻结点落实；F15 的 roleCards 显示 U1 已按三类，无需额外改动；99 key 为 C3 需求清单，最终以 C3 冻结为准）。
- **冻结前置条件**：
  1. C1/C2b/C2c 在冻结前按 **F13** 统一 `StableWritePermit`/`StableWritePermitView`/`PermitFact`/`StableWriteDecisionInput` 的单一形状与 `stableWriteDecision` 签名/返回映射；`stable-writes` 存储明确 record/permit 关系。
  2. C1/C2a 按 **F14** 决定 `StableWriteEvent` 是否加可选 `approvedAt/expiresAt/consumedAt`；未加则 C2a 不校验。
  3. D1 按 **F15** 在 `trunk:state` 投影/载荷加入 `roleCards`（U1 已按 workflow/role-card/boundary 三类显示）；按 **F16** 明确 appointment-write 执行点在 run-role（D1 不直接写盘）；U1 按 **F17** 去掉条件性 `refactor:request`。
  4. C3（项目管理）按 U1 99 key 需求清单冻结最终 key/计数（`ui.trunk.*` 22 为目录内扩展，E1 披露）；B0/V1/G2a 旧引用由沟通/统筹在 E1/G2a 更正。
  5. 本复审建议**不是实施授权/契约冻结/验收结论**；实施仍待客户 IA、团队计划派发与各冻结点出口；提交/推送/合并/发布仍须客户另行授权。

## 六、复审声明

- 本次复审只读五份修订版与输入；未改提案/产品/测试/边界/角色卡/方案/复核/验收/沟通/调度；唯一写盘为本记录；未运行测试；未 commit/push。
- 审核者同时是 C3（i18n）实施者；99 key 的最终冻结属 C3 后续工作（自评/需求确认，不虚构独立审核人）。
- 旧版提案哈希（`e3e74ad0…`/`ac208b4d…`/`c8edbe41…`/`7fe52f3c…`/`bad69e23…`）与旧审核记录哈希（`2cb04cae…`）不再作为当前依据；复审以本节新哈希为准。
- 本复审建议不替代 V1 沟通核对、C1/C2a/C2b/C2c/C3 契约冻结、T1/T2/E2 或客户决定。
