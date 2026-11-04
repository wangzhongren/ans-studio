---
id: trunk-amendment-model-p1-proposal-orchestration
type: change
title: P1 实现提案：主干/冻结与版本变更申请——编排（Provider/Service/Pipeline + 守卫接线）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
related: [trunk-amendment-model]
events:
  - date: "2026-11-04"
    kind: created
    summary: 写编排 P1 实现提案（proposal-only；未改产品/测试代码；未 commit/push；B-12/B-13 条件项不触发，stable-write Service 默认并入 B-7）
  - date: "2026-11-04"
    kind: revised
    summary: Revision 1 处置 PM P1 审核 F3/F4/F5/F6/F7/F8/F11/F12 与非阻断项（roleCards/TrunkApplySnapshot、journal committed phase、source "upgrade"、stable 许可 approvedAt/expiresAt/consumedAt/baseSha256="" 与 pre-write+post-write+失败作废、WriteGate contentSha256、删除自建冻结快照改消费门禁引擎、applied/written 归属 application、refactor 身份校验、bootstrap baseTrunk null、TASK_EVENT_KINDS 17 类更正、vcKind/stableKind/错误码对齐、B0/V1/G2a 引用刷新）；只改本文件
---

# P1 实现提案：主干/冻结与版本变更申请——编排

- **角色/节点**：编排（Orchestration）/ `2026-11-04-trunk-amendment-model` / P1（Provider/Service/Pipeline 实现提案，T3）/ **Revision 1（处置 PM P1 审核 F3/F4/F5/F6/F7/F8/F11/F12 与非阻断项）**。
- **PM 审核依据（只读）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（368 行 / SHA-256 `2cb04caefae4074ef732e7030900bd11201a4c6a5583d74bf94814aacaf2ed93`；结论 `needs revision`，F1–F12）。本修订只回应与编排相关的阻断/非阻断项；跨角色契约以审核记录 §4.1–§4.10 的冻结裁决为准。
- **状态**：**proposal-only, no code**——本文件只写提案；未改产品/测试源码、`boundary.md`/`boundary.yaml`/`changelog.md`、`docs/planning|scheduling|acceptance|communication`、其他角色文件；未 commit/push。实现须待五角色 P1 审核 `recommend approval` 与 Batch 1 契约冻结（C1/C2a/C2b/C2c/C3）后，按团队计划增量 §10.6 Batch 2 进入 S1–S4。
- **实施契约基线（唯一）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：**1151 行**；实际字节/CRLF SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`；归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`（本文件写盘前实测，与 V1 v1.1/增量一致）。AC 以 P1.6 §7.2 **AC-1–AC-36** 为准；G 以 **P1.6-G1–G11**（全部按推荐 A；G5 按 F29 安全向 B；G9/G11 按 stable 最终决定）为准；实施检查表以增量 §5.4 九条 + §10.5 七条为准。
- **标注**：`[事实]` 只读核对；`[设计候选]` 未实现提议；`[交接]` 依赖其他角色冻结件；`[停止项]` 需回报统筹/审核，不得自行扩大。
- **授权范围**：本提案只落在 `角色卡/编排/boundary.md` + `boundary.yaml` Section 1 已确认的 **B-2/B-3/B-6/B-7/B-8/B-9/B-11** 与既有目录（`src/common/编排/`、`test/编排/`）内；**不提出 B-1..B-11 之外的路径/角色/权限**；B-12（独立 `src/service/stable-write/`）、B-13（独立 `test/桌面应用/stable-write.test.ts`）**不触发**（§7.4）。

## 0. 结论摘要

[设计候选] 编排在既有五层与 P1.3 内部机制（trunk manifest、apply-journal、re-pin、逐项确认）之上落地「R9 冻结权威 + 派生缓存 + VCA 外壳 + stable 确认即写/mini re-pin + 轻量重构记录」：

1. **Provider**：新增 `src/provider/trunk/`（manifest/amendment/journal/history 原子读写、坏件容错）与 `src/provider/version-change/`（VCA/refactor/stable-writes 记录、`doc-freezes` 派生缓存、R9 一致性对账；**只经门禁引擎 C2b 的 R9 读写 API 扩展 baseline，不另造第二本权威账**）。
2. **Service**：新增 `src/service/trunk/`（派生/verify/修订校验/哈希定格/边界扩大/目标版本选择/提交日志执行与崩溃对账/恢复/stable 快照更新）与 `src/service/version-change/`（VCA 状态机/发起角色与目标校验/冻结服务（迁移/bootstrap/查询）/targets↔items/批准前哈希重验/并发幂等/refactor 校验/**stable-write 子服务（默认并入，不触发 B-12）**）。
3. **Pipeline**：新增 `trunk-runtime.ts`（B-2）、`version-change-runtime.ts`（B-8）、`refactor-runtime.ts`（B-9）、`stable-write-runtime.ts`（B-11）四个公共句柄；客户卡/面板/通知由桌面窗口注入 presenter，**Pipeline 不直接发卡、不写项目文档、不派角色**。VCA 卡复用 `cardKind:"decision"`+`application:true`+真实 `flowId`；stable workflow 卡使用 C1 新增的 app-owned 卡种 `stable-write`（不进 `GOVERNANCE_CARD_GROUP`，不进入判断/代选）。
4. **既有编排件**：`task-state.ts`（C2a：`version.change`/`doc.freeze`/`refactor.request`/`stable.write.*`/`trunk.state`/`trunk.amendment` 白名单与逐 kind 校验；消费 C1 常量，`vcKind`/`stableKind` 对齐）、`run-manifest.ts`（S3：`repins`/`repinPinnedRun`；`pinRun` 只 pin 冻结文档 + bootstrap 冻结；pin/re-pin 统一 `versionedDocOverwriteDecision({operation:"pin"|"repin"})`）、`run-role.ts`（守卫真实调用点：write/edit 传 frozen，stable 路径消费 `WriteGate context.contentSha256` 与许可；shell 守卫注入冻结/许可查询；补 `CARD_KIND_ROUTE_HINTS` 的 `stable-write` 一行编译解锁）、`shell-post-audit.ts`（R9 draft/frozen 分开判定；stable 变更按违规处理）、`version-decision.ts`（旧 run-change 文案迁移）、`project-state.ts`（条件：冻结/VCA/重构投影；PM 裁决不新增）。**原提案的 `freeze-snapshot.ts` 已删除**：冻结同步快照为门禁引擎 C2b 单一实现（`versionedDocFreezeState`/安装快照），编排只调用 install/refresh/query，不自建第二份 Map（F7）。
5. **纪律**：唯一同步判定 `versionedDocOverwriteDecision`（门禁引擎）与唯一冻结权威 R9 `versions.jsonl`（baseline 优先、`doc-freezes.json` 可重建）；冻结同步快照唯一实现归 C2b；冻结后不可覆盖、draft 不进入 trunk；stable 确认即写 + mini re-pin **不升 trunkVersion**；任何失败不改 trunk 指针；不扩写权、不新增角色、不改三道闸门与验收规则。

**一句话**：编排把 P1.6 的冻结/VCA/stable/重构语义，落到「单一 R9 权威 + 派生同步缓存 + 两阶段 apply-journal + 四个 Pipeline 句柄 + 真实守卫调用点」的可实现结构上；本提案不改任何产品代码。

## 1. 事实基线（只读核对，2026-11-04）

### 1.1 基线与输入

| 项 | 值（本 worktree 实测） |
| --- | --- |
| 工作区 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 / HEAD | `feat/trunk-amendment-model` / **`89b1fb2751d74c607b3a17d1b522b88061943a14`**（= `origin/main`，含下载特性 PR #62 与 PR #61） |
| 产品/测试区 | `git status --porcelain -- src app test` **为空**（本提案写盘前）；`git diff --cached --name-only` 为空 |
| 方案 P1.6（唯一实施契约基线） | **1151 行 / `fccb1f54…`（CRLF）/ `1e260646…`（归一化）** |
| 实施前验收标准 V1 | `docs/acceptance/trunk-amendment-model-criteria-v1.md` **v1.1 / 350 行 / 归一化（实际字节同值）`3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`**；PM 审核裁决以本值为当前版本，`75bf7a49…` 为旧快照（由沟通/统筹在 G2a/E1 更正） |
| 团队计划（基线） | `docs/scheduling/2026-11-04_team-plan_trunk-amendment-model.md` **721 行 / `ed6d3484…`** |
| 团队计划增量（含 §10.8 P1 任务书） | `docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md` **468 行 / `911974fa…`** |
| P1.5R 一致性核对记录 | `docs/planning/2026-11-04_trunk-amendment-p1.5R-consistency.md` **97 行 / `747db23f…`**（参考，非基线） |
| P1.4 复核记录 | `docs/planning/2026-11-04_review_trunk-amendment-model.md` **332 行 / `38121cbe…`**（参考，非基线） |
| 修订版闸门 0 | `docs/communication/2026-11-04_intent-change_freeze-and-refactor-ownership.md` **36 行 / `cda7c52d…`** |
| IA（闸门 1 重确认 + stable 最终决定） | `docs/communication/2026-11-04_authorization_trunk-amendment-ia.md` **37 行 / `0bed4240…`** |
| 原闸门 2 | `docs/communication/2026-11-04_gate2_trunk-amendment-model.md` **17 行 / `a12b39fc…`** |
| G2a 写集增补（含 P1.6 + B-11 补注） | `docs/communication/2026-11-04_gate2-addendum_trunk-amendment-B5-B10.md` **25 行 / `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201`**（本 worktree 实测；PM 裁决以 25 行补注版为准，V1 §1.1 的 16 行 / `d41665d3…` 为补注前副本，由沟通更正） |
| B0 基线（最终版） | `角色卡/测试/docs/change/2026-11-04_trunk-amendment-B0-baseline.md` **221 行 / `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058`**（最终版；**旧 173 行 / `27f9b94d…` 为含模板占位中间版，勿引用**；HEAD `89b1fb2`；T3 420 文件、`test/编排` 套件 64 文件 804/803/1 既有 EPERM） |
| PM P1 审核记录 | `角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md` **368 行 / `2cb04caefae4074ef732e7030900bd11201a4c6a5583d74bf94814aacaf2ed93`**（`needs revision`；F1–F12；本修订依据） |
| H1 边界 | `角色卡/编排/boundary.md` / `boundary.yaml` 已含 `src/provider/version-change/`（B-6）、`src/service/version-change/`（B-7）、`version-change-runtime.ts`（B-8）、`refactor-runtime.ts`（B-9）、`stable-write-runtime.ts`（B-11）；`src/provider/trunk/`、`src/service/trunk/`、`trunk-runtime.ts` 为原 B-2/B-3；本次无需新增边界变更 |
| Node / npm | v24.22.1 / 11.19.1（B0 记录） |

### 1.2 关键现状锚点（以符号/文本为准；P1.6 行号对应 `f4c24eae` 设计快照，已漂移）

[事实] 1) **同步守卫现状**：`src/common/门禁引擎/versioned-doc-guard.ts`（639 行）`VERSIONED_DOC_PATTERNS` 为七类版本化模式（intent/proposal/roster/modules/topology/architecture/assets），无 `-amendment-vN.md`；`versionedDocOverwriteDecision({relPath, exists})`（:55-70）只判路径形状 + 存在即拒；`checkVersionedDocWrite`（:80-93）**全仓无外部调用**；真实调用点仅 `run-role.ts:858-863`（write/edit 的 `gate`）与 `shell-write-guard.ts:602-604`、`:643-645`（shell 写目标）。
[事实] 2) **R9 baseline 现状**：同文件 `.ans/state/versions.jsonl`（`VERSION_BASELINE_REL`）、`versions.initialized`、`versions.lock`；`VersionBaselineRecord`（:137-147）字段 `v/flowId/doc/version/path/sha256/recordedAt/event("baseline"|"version-added")/recordedBy`；`readBaselines` 对未知 `event`/坏行 **fail-closed（baseline-corrupt）**（:199-247）；`registerVersionedDocAfterWrite`（:548-625）在属主写成功后锁内登记/TOFU，**对同 path/version 不同 sha 返回 false（现状不支持 draft 原位改登记）**；`verifyVersionedDocBaselines`（:637-639）任一旧版 hash 变化即违规；`baselineShaFor`（:420-426）用 `.find(...)` **取首条匹配而非 latest**（PM 审核实测）；`acquireVersionLock`/`ownsVersionLock` 提供项目级独占锁与 fencing。上述 latest-record-per-path / `draft-updated` 需由 C2b 修订（审核 §4.2-2）。
[事实] 3) **run manifest**：`src/common/编排/run-manifest.ts`（888 行）`prepareRunPin`（:359-504）校验七类文档 + schema/roster/D3，`pinRun`（:509-549）draft→pinned 幂等，`verifyPinnedRun`（:573-602）重算 hash；**均无冻结校验、无 `repins`/`repinPinnedRun`**（P1.3 为设计，从未实施）。`writeRunManifest` 原子写。
[事实] 4) **账本**：`src/common/编排/task-state.ts`（790 行）`TASK_EVENT_KINDS`（:58-65）当前 **17 类**（6 task + 5 request + 3 approval + `project.focus`/`project.note`/`version.decision`），`validateEvent`（:274+）逐 kind 校验；`.ans/state/tasks.jsonl` app-only、append-only、轮转 5 MB×3（复用 `src/common/shared/jsonl-ledger.ts`）。
[事实] 5) **旧文案**：`version-decision.ts:129-137` 的 `run-change-required` 消息文本仍写「请走 run-change（契约变更 · 重开 run）」（迁移目标见 P1.6 §4.10）。
[事实] 6) **shell 后审计**：`src/common/编排/shell-post-audit.ts`（303 行）对受管版本化路径凡与 baseline sha 不一致即记违规（:270-289），**不区分 draft/frozen**；`createShellPostAudit` 接受注入 `checkWrite`/`snapshot`/`auditWriter`。
[事实] 7) **run-role 装配**：`src/pipeline/orchestration/run-role.ts`（2509 行）`gate` 在 :849-866 先做 trio 禁写再查版本化覆盖；`shellWriteGuard`（:1239-1250）调用门禁引擎 `evaluateShellWriteTargets({argv,cwd,projectRoot,skillRoot,boundary,scope,conditions,forbiddenPrefixes,checkWrite})`；`createShellPostAudit`（:1260-1270）；`createRuntimeAdapterFactory`（:2372+）的 `versionedDocAfterWrite` 默认调用 `registerVersionedDocAfterWrite`（:2386-2389）。**`WriteGate = (targetPath: string) => WriteDecision`（`src/model/runtime.ts:172`，现状无内容 hash 上下文）；`src/provider/runtime/tools.ts:464-477` write_file 在 gate 调用前已持有最终 content**（F6 落点，C1 扩可选 `context.contentSha256` 后 S3 消费）。
[事实] 8) **appointment-write**：应用侧结构/D3 校验在 `app/desktop/session.ts:3868-3990`、`:4265-4298`、`:4478`（桌面窗口写集）；编排侧 `src/common/编排/confirmed-writes.ts` 提供「确认→writeSet 发行」的声明路径单一实现（`validateConfirmPreviewCompleteness`/`createConfirmedWriteIssuer`），stable 写入确认可复用其预览完整性口径。
[事实] 9) **共享原语**：`src/common/shared/jsonl-ledger.ts`（`appendJsonlLine`/`readJsonlLedger`）、`src/common/shared/atomic-write.ts`（`RENAME_TRANSIENT_CODES`/重试）、`src/common/shared/path-primitives.ts`（`absRel`/`isWithinReal`/`normalizeLexical`）；`src/common/编排/shell-post-audit.ts` 已有从 `src/common/门禁引擎/versioned-doc-guard.ts` 导入的先例（跨 common 模块导入合法）。
[事实] 10) **本特性无既有源码**：`src/provider/trunk/`、`src/service/trunk/`、`src/provider/version-change/`、`src/service/version-change/`、`src/pipeline/orchestration/{trunk-runtime,version-change-runtime,refactor-runtime,stable-write-runtime}.ts` 均不存在（`ls` 实测）；P1.6 §2 的现状锚点均可在当前树复核。
[事实] 11) **项目状态视图**：`src/common/编排/project-state.ts`（1156 行）`buildProjectStateView` 纯读聚合 run manifest/tasks/版本化文档；`ProjectStateBlockerKind` 恰 10 类（Model，`src/model/project-state.ts:66-76`），新增冻结/VCA/重构投影会触及 Model 形状（条件项，§9 Q11）。
[事实] 12) **基线漂移**：P1.6 头部写设计快照 `f4c24eae`；当前 HEAD `89b1fb2`（含下载 PR #62 / PR #61）。B0 已重记；旧证据不复用；本提案全部以符号/文本锚点实施，不以 P1.6 行号作为写入依据。

### 1.3 只读声明

本节核对全部为只读：未运行测试/应用，未改代码/测试/角色卡/边界/方案/复核/沟通/调度/验收文档，未 commit/push。

## 2. 精确写集

> 同一文件同一时间只有本角色一个写入者。所有新增源码都在 H1 已确认的 B-2/B-3/B-6/B-7/B-8/B-9/B-11 与既有私有目录内；不新增模块根。文件名为 [设计候选]，归属/职责以本节为准；实现中如确需拆分新文件，只在已授权模块/目录内，且不改变公共契约。

### 2.1 新增 Provider（trunk，B-2/B-3 既有条目）

| # | 路径 | 内容 |
| --- | --- | --- |
| 1 | `src/provider/trunk/abstract/trunk-store.ts` | `.ans/trunk/` 存储契约：`TrunkManifest`/`TrunkAmendmentState`/`TrunkApplyJournal` 持久化类型引用（Model 冻结，C1）、`TrunkStore` 接口（`readManifest`/`writeManifest`/`readAmendment`/`writeAmendment`/`readJournal`/`writeJournal`/`listHistory`/`archiveHistory`）、`TrunkStoreError` 判别形状、相对路径常量 |
| 2 | `src/provider/trunk/impl/fs-trunk-store.ts` | 原子写（临时文件 + fsync + rename，复用 `src/common/shared/atomic-write.ts` 的 EPERM 重试）、每项目串行写链、坏件容错（读返回 `ok:false,reason`，不自动重建/覆盖）、history 归档写 |
| 3 | `src/provider/trunk/public/trunk-store.ts` | 公共出口：显式 re-export 类型 + `createFsTrunkStore(projectRoot)` 工厂；不 wildcard 导出 impl 内部 |

### 2.2 新增 Provider（version-change，B-6）

| # | 路径 | 内容 |
| --- | --- | --- |
| 4 | `src/provider/version-change/abstract/version-change-store.ts` | `.ans/state/version-changes.json`（VCA 记录）、`.ans/state/refactor-requests.json`、`.ans/state/stable-writes.json` 的存储契约（`VersionChangeStore`：`list`/`insert`/`updateWithExpectedStatus`/`findByFlow`；`RefactorRequestStore`；`StableWriteStore`）；原子写、坏件容错、读结果判别 |
| 5 | `src/provider/version-change/abstract/freeze-cache.ts` | `.ans/state/doc-freezes.json` 派生缓存契约：`DocFreezeCache`（`load`/`rebuildFromBaseline`/`write`/`reconcile`）、缓存记录形状（`{path,version,sha256,applicationId,reason,origin,decidedBy?,frozenAt}` + `migrated-draft` 标记视图）、`CacheReconcileResult`（一致/已重建/不可用） |
| 6 | `src/provider/version-change/impl/fs-version-change-store.ts` | JSON 记录文件原子写 + 进程内串行链；结构校验失败返回 `ok:false`（不静默清空）；未知字段保留（新旧兼容） |
| 7 | `src/provider/version-change/impl/fs-freeze-cache.ts` | 缓存构建/重建/对账：经门禁引擎 C2b 的 R9 读 API（§3.8）读取冻结记录 → 生成缓存；与 baseline 不一致时**以 baseline 为准重写缓存并返回告警**；baseline corrupt ⇒ 缓存标 `unusable`，不重写 |
| 8 | `src/provider/version-change/public/version-change-store.ts` | 公共出口：`createVersionChangeStore(projectRoot)`、`createFreezeCacheStore(projectRoot)` |

### 2.3 新增 Service（trunk）

| # | 路径 | 内容 |
| --- | --- | --- |
| 9 | `src/service/trunk/abstract/trunk-service.ts` | `TrunkService` 接口与错误码：`derive`/`read`/`verifyTrunk`/`validateAmendment`/`snapshotItemHashes`/`detectBoundaryExpansion`/`selectTargetVersion`/`planApply`/`executeApply`/`reconcileJournal`/`recover`/`applyStableSnapshot`；`[交接]` 纯类型来自 C1 `src/model/trunk.ts` |
| 10 | `src/service/trunk/impl/trunk-derive.ts` | 从**唯一 pinned run**派生只读 v1（`readRunManifest`+`verifyPinnedRun`+`loadPinnedRoster`）；多 pinned/无 pinned/坏 manifest ⇒ `trunk-unavailable` fail-closed；stable 文件哈希取当前磁盘字节；无 trunk manifest 时按派生视图展示（不落盘） |
| 11 | `src/service/trunk/impl/amendment-validate.ts` | 修正案文档（`docs/proposals/<flowId>-amendment-vN.md`）校验：schema/amendmentId/flowId/版本/路径/大小/baseTrunk/item 形状；item kind 限 `contract`/`roster`/`execution`（**workflow/boundary 不在 detail**）；`change:none` 不是 target；空实际变更拒绝；`fromSha256`（版本化取 pinned manifest ref、execution 取 trunk `artifacts.execution`）/`toSha256`（to 路径当刻字节）计算与定格辅助 |
| 12 | `src/service/trunk/impl/amendment-expansion.ts` | 边界扩大检测：复用门禁引擎 `boundary-parse.ts`/`boundary-yaml.ts` 只读解析，对 old/new boundary 求扩大项；确认预览与 apply 两时点各判一次；只读、不写边界 |
| 13 | `src/service/trunk/impl/trunk-verify.ts` | `verifyTrunk`：校验 pinned run、workflow/role-card/boundary 哈希、roster/D3；不一致 ⇒ `trunk-verify-failed`（C1 错误码；不采用 `trunk-drift` 字面量、不恢复 drift 状态；异常 hash 不符 ⇒ fail-closed + 恢复入口），不自动改指针 |
| 14 | `src/service/trunk/impl/apply-journal.ts` | 两阶段提交与崩溃对账：`prepared → run-manifest-written → committed`；提交点 = trunk manifest 写成功；**内容匹配为主、phase 辅助**；支持两方向/相位滞后的分裂态识别；失败不改 trunk 指针；恢复产生新版本 tN+1 |
| 15 | `src/service/trunk/impl/trunk-recovery.ts` | 受控恢复：客户确认后的恢复/重建路径带审计，生成 tN+1（`source:"recovery"`）；注册表损坏时不自动重建、不自动放开覆盖 |
| 16 | `src/service/trunk/impl/stable-snapshot.ts` | mini re-pin 快照更新：更新 trunk manifest `artifacts.workflow`/`artifacts.roleCards[role]`/`artifacts.boundaries[role]` 的 `{path,sha256}`，绑定 `decisionId`/`confirmationId`，**trunkVersion 不变**；trunk manifest 不存在时只记录待续接（不虚构快照） |
| 17 | `src/service/trunk/public/trunk-service.ts` | 公共出口：显式导出接口类型 + `createTrunkService(deps)` 工厂（deps: store、roster loader、boundary parser） |

### 2.4 新增 Service（version-change，B-7；stable-write 子服务默认并入，不触发 B-12）

| # | 路径 | 内容 |
| --- | --- | --- |
| 18 | `src/service/version-change/abstract/version-change-service.ts` | `VersionChangeService`：VCA 状态机/校验；`FreezeService`：`isFrozen`/`ensureCache`/`migrate`/`bootstrapFreeze`/`recordFreeze`/`recordDraftMarker`；`StableWriteService`：确认记录/许可/哈希校验/mini re-pin 编排/异常恢复；`RefactorValidator`：申请校验/机械写集；错误码（`vca-*` 见 P1.6 §5.1） |
| 19 | `src/service/version-change/impl/vca-service.ts` | 发起角色矩阵（`version-upgrade` 仅 product；`detail-amendment` 仅 rapporteur）；目标 kind（upgrade 仅 `contract`/`roster`；detail 允许 `contract`/`roster`/`execution`；workflow/boundary/product-intent 拒绝）；目标必须在**作者角色写区**（contract/roster=rapporteur、execution=convener）；baseTrunk（有 trunk 必须匹配；无 trunk 允许 `null`+`bootstrap:true`）；版本号必须为新版本；并发（同一 flow 仅一个 submitted/approved）；幂等（applicationId 唯一）；提交时应用计算 `toSha256`/`applicationSha256` |
| 20 | `src/service/version-change/impl/freeze-service.ts` | 冻结服务：`isFrozen(path,version)`（有冻结记录 ⇒ frozen，否则 draft；unknown/corrupt ⇒ fail-closed）；**迁移**（既有版本化文档一律默认冻结，写 `migrated-legacy`；仅可证明未确认草稿写 `migrated-draft` 标记+证据；missing=迁移、corrupt=fail-closed）；**bootstrap**（首次 handoff pin 与无 trunk VCA 两条路径）；冻结记录按 reason/origin/decidedBy 归属（F35）；缓存刷新 |
| 21 | `src/service/version-change/impl/targets-items.ts` | targets↔items 一致性：每个 target 必须对应修正案一个 `to` 项（kind/roleId/toSha256 一致），不得有额外 target，`change:none` 不是 target；提交/批准/apply 三时点哈希重算与比对（F38/AC-26） |
| 22 | `src/service/version-change/impl/stable-write-service.ts` | stable-write：请求记录（`workflow` 轻量卡 / `role-card`/`boundary` 沿用 appointment-write）；一次性许可（绑定 `path/baseSha256/targetSha256/decisionId/confirmationId`）；写入后 hash 必须等于 `targetSha256`，成功才消费许可并触发 mini re-pin；无/伪造/过期 ⇒ 拒绝；异常 fail-closed + 恢复；**无 drift 状态** |
| 23 | `src/service/version-change/impl/refactor-validate.ts` | `refactor.request` 校验：发起者必须 convener；flow 存在；scope 在既有模块/角色边界内；**机械写集仅模块代码目录**；禁止版本化文档/边界/stable/teamPlan/flow/`.ans`（路径匹配 ⇒ 拒绝并提示 VCA/stable）；`managedBy:"application-scheduler"`；越界转 VCA/修正案 |
| 24 | `src/service/version-change/public/version-change-service.ts` | 公共出口：显式导出接口类型 + `createVersionChangeService(deps)` 工厂（deps: stores、freeze cache、R9 读写、trunk service） |

### 2.5 新增 Pipeline（逐文件授权）

| # | 路径 | 内容 |
| --- | --- | --- |
| 25 | `src/pipeline/orchestration/trunk-runtime.ts`（B-2） | 主干 Pipeline 公共句柄：`status()`（派生/verify/面板数据，含 frozen 清单与 stable 快照）、`mainUpgrade()`（**仅紧急/恢复**；高危二次确认；拒绝版本化文档/常规 stable）、`runAmendmentItems()`（detail 逐项确认循环：`item-apply`/`item-keep`/`item-cancel-amendment`，边界扩大勾选，acknowledgments；供 version-change-runtime 调用）、`applyApproved()`（接 apply-journal）、`recover()`、`reconcile()`；客户卡经注入 presenter；**不写项目文档、不派角色** |
| 26 | `src/pipeline/orchestration/version-change-runtime.ts`（B-8） | VCA 公共句柄：`submit()`（校验→定格→修正案提交冻结→记录→事件）、`present()`（客户卡通道，复用治理会话客户卡通道）、`approve()`/`reject()`（客户主权；批准前重验 `toSha256`；upgrade 冻结目标并接 trunk apply；detail 接 `trunk-runtime.runAmendmentItems`）、`completeBootstrap()`（`baseTrunk:null`）、`list()`；幕僚只通知；无通道保持 submitted 可重试 |
| 27 | `src/pipeline/orchestration/refactor-runtime.ts`（B-9） | 重构申请公共句柄：`submit()`（记录/校验/交应用调度层）、`status()`、`close()`；返回 `enforcement.writeSet`（仅模块代码目录）供任务/WriteGate 收窄；越界拒绝并转 VCA；**不写代码、不派角色、不产生 trunk 版本** |
| 28 | `src/pipeline/orchestration/stable-write-runtime.ts`（B-11） | stable 写入公共句柄：`requestWorkflowWrite()`（workflow 轻量确认卡：preview 展示 path/base/target sha256/diff）、`settle()`（approve→发许可；reject→不写）、`onAppointmentWriteApproved()`（role-card/boundary 确认后发许可）、`completeWrite()`（写入后 hash 校验→mini re-pin；异常 fail-closed/恢复）、`list()`（确认/续接记录） |

### 2.6 既有文件（本角色授权内）

| # | 路径 | 改动 |
| --- | --- | --- |
| 29 | `src/common/编排/task-state.ts`（C2a） | `TASK_EVENT_KINDS` 由当前 **17 类**加法 10 类（`version.change`、`doc.freeze`、`refactor.request`、`stable.write.requested`、`stable.write.approved`、`stable.write.rejected`、`stable.write.written`、`stable.write.failed`、`trunk.state`（含 `op:"stable-repinned"`）、`trunk.amendment`）→ 27 类；逐 kind 校验（§3.6）；**`isGovernanceCardKind` 改读 C1 新增白名单 `GOVERNANCE_CARD_KINDS`（GROUP 键集 + app-owned `stable-write`），不再直接读 `GOVERNANCE_CARD_GROUP` 键集**；事件校验消费 C1 常量（`DOC_FREEZE_CUSTOMER_REASONS`/`DOC_FREEZE_APPLICATION_REASONS`/`TRUNK_STATE_CUSTOMER_OPS`/`TRUNK_STATE_APPLICATION_OPS`），不复制字面量；旧事件照常读、未知 kind 旧 app 记坏行不阻塞 |
| 30 | `src/common/编排/run-manifest.ts`（S3） | 加法 `repins?: RunRepinRecord[]` 与 `repinPinnedRun`（同 runId pinned manifest 更新文档 refs/hash，保留 `createdAt`/`runId`/`flowId`；幂等）；`prepareRunPin`/`pinRun` 只 pin **冻结**文档：pin/re-pin 统一经门禁引擎 `versionedDocOverwriteDecision({relPath, exists, operation:"pin"|"repin"})` 判定；首次 handoff pin 在锁内先写 `doc.freeze(handoff-pin-bootstrap)` 再 pin；非 bootstrap 的未冻结目标 ⇒ 拒绝码 **`versioned-doc-not-frozen`**（C14 对齐，不新造 run-manifest 专属码）；`verifyPinnedRun` 语义不变；旧读者忽略未知字段 |
| 31 | `src/common/编排/shell-post-audit.ts`（S3） | R9 draft/frozen 分开判定：frozen 版本化文档 hash 漂移 ⇒ 违规；draft 变更 ⇒ 不违规（不误报）；**stable 文件经 shell 变更 ⇒ 违规**（shell 通道 stable 写入已在 gate 拒绝，C7；审计 fail-closed）；坏 baseline ⇒ 维持 fail-closed |
| 32 | `src/common/编排/version-decision.ts`（S3） | 文案迁移：`run-change-required` 消息指向「版本变更申请」/「主干升级」（语义不变）；不改两动作/卡构造/执行计划 |
| 33 | `src/common/编排/project-state.ts`（**条件**） | 仅当 C1 在 `ProjectStateView` 增加冻结/VCA/重构字段时填充投影；否则零改动（§9 Q11） |
| 34 | `src/pipeline/orchestration/run-role.ts`（S3） | **守卫真实调用点**：`gate` 扩为 `(targetPath, context?) => WriteDecision` 消费 C1 可选 `context.contentSha256`；版本化判定经 `versionedDocFreezeState(projectRoot, rel, exists)`（C2b 安装快照，**不自建 Map**）→ `versionedDocOverwriteDecision({relPath, exists, frozen, operation})`；stable 路径（workflow/role-card/boundary）必须带 `context.contentSha256` 并调 `stableWriteDecision({projectRoot, relPath, sha256, permit, now})`，无上下文/shell ⇒ stable 一律拒绝；`shellWriteGuard` 注入门禁引擎的冻结查询与许可快照（不注入自建实现）；`createShellPostAudit` 注入同一冻结查询 + stable 校验钩子；**`CARD_KIND_ROUTE_HINTS` 补 `stable-write` 一行**（F2 编译解锁，应用自有卡、不得由角色工具发起）；`versionedDocAfterWrite` 钩子路由：版本化 ⇒ 既有登记（draft 原位改由 C2b `draft-updated` 承载），stable ⇒ `completeWrite`；能力位新增 `stableWrite?: StableWriteRuntime`/`submitVersionChange?: ...`/`submitRefactor?: ...`（缺省不注册=最强 fail-closed） |
| 35 | **（不新增文件）** 冻结同步快照 | **F7 修订**：原提案的 `src/common/编排/freeze-snapshot.ts` **删除**。冻结同步快照为门禁引擎 C2b 单一实现（`versionedDocFreezeState`/安装快照）；编排在 `run-role`/`shell-post-audit` 只调用 install/refresh/query，**不自建第二份 Map、不直接读 `doc-freezes.json`**；快照不可用（unknown/corrupt）⇒ 所有版本化写判定拒绝（含 draft），面板提示恢复 |

### 2.7 新增/更新测试（`test/编排/` 目录授权）

| # | 路径 | 重点 |
| --- | --- | --- |
| 36 | `test/编排/version-change-store.test.ts`（新） | VCA/refactor/stable-writes 记录原子写、坏件容错、并发串行；doc-freezes 缓存重建/对账/不可用 |
| 37 | `test/编排/version-change.test.ts`（新） | 发起角色矩阵；目标 kind/作者写区；version-upgrade 禁边界/workflow/product-intent；baseTrunk/bootstrap；冻结/迁移（一律冻结、migrated-draft、missing/corrupt）；幂等/并发；targets↔items；批准前哈希重验；状态映射 |
| 38 | `test/编排/stable-write.test.ts`（新） | 记录/许可/哈希校验/mini re-pin（绑定 decisionId、不升 trunkVersion）/异常恢复/无 drift；无许可/伪造/过期拒绝 |
| 39 | `test/编排/trunk-store.test.ts`（新） | manifest/amendment/journal/history 原子读写、坏件容错、history 归档 |
| 40 | `test/编排/trunk-service.test.ts`（新） | 派生 v1、verifyTrunk、修订校验/哈希定格/扩大检测/目标版本选择、journal 两阶段与崩溃对账、恢复 tN+1、stable 快照 |
| 41 | `test/编排/trunk-amendment.test.ts`（新；P1.6 §7.1 指定名） | detail 生命周期 draft→submitted→approved→applied；提交冻结；逐项确认/keep/cancel；只冻结 applied；失败不改 trunk |
| 42 | `test/编排/version-change-runtime.test.ts`（新） | 提交/发卡/批准/拒绝；detail vs upgrade；无通道 submitted 重试；幕僚通知；失败/重试 |
| 43 | `test/编排/stable-write-runtime.test.ts`（新） | workflow 轻量卡/appointment-write 钩子/许可/校验/mini re-pin/拒绝/异常 |
| 44 | `test/编排/refactor-runtime.test.ts`（新） | convener 发起/应用调度层管理/越界拒绝/机械写集/无 customer decision/客户审计 |
| 45 | `test/编排/run-role-freeze-guard.test.ts`（新） | run-role 真实调用点：write/edit 传 frozen；frozen 拒绝/draft 允许；stable 无许可拒绝；shell 守卫注入；删除/重命名/移动经 shell 通道；pin/re-pin 校验目标冻结（与门禁引擎全调用点矩阵互补） |
| 46 | 更新既有 | `run-manifest.test.ts`（repins/pin 冻结）、`task-state.test.ts`（新 kind 校验 + `GOVERNANCE_CARD_KINDS` 白名单）、`decision-card.test.ts`（`CARD_KIND_ROUTE_HINTS` 增 `stable-write` 行；`GOVERNANCE_CARD_GROUP` 精确键集断言**不变**）、`version-decision.test.ts`（文案）、`shell-post-audit.test.ts`（draft/frozen 分开）、`project-state.test.ts`（条件）；其余仅在编译/行为确实受影响时按需更新，逐条理由在完成报告列出；**不弱化断言、不新增 skip** |

### 2.8 不写（明确）

`src/model/**`（运行时核心 C1/B-1/B-5）；`src/common/门禁引擎/**`、`src/service/gate/**`（门禁引擎 C2b；本角色只经冻结 API 消费，不写实现）；`app/**`（桌面窗口 D1 / 桌面UI U1）；`src/common/shared/**`（项目管理 C3）；`test/runtime-core/**`、`test/门禁引擎/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/项目管理/**`、`test/测试/**`（其他角色）；`package.json`/lock/`tsconfig*`/`vite.config.ts`/`src/index.ts`/发布配方；`docs/scheduling|acceptance|communication`、角色卡/边界（H1 治理变更除外）、其他角色 `docs/`；**不导入** `src/common/runtime-core/**`。

## 3. 契约冻结形状（编排侧）

> 以下为 [设计候选]；C1 冻结 Model 类型/事件后，本节只按冻结形状实现。C2a/C2c 冻结编排侧公共入口。

### 3.1 Provider `src/provider/trunk/`（存储，不做状态判定）

```ts
// 相对路径（.ans/trunk/）
export const TRUNK_MANIFEST_REL = ".ans/trunk/manifest.json";
export const TRUNK_AMENDMENT_REL = ".ans/trunk/amendment.json";
export const TRUNK_JOURNAL_REL = ".ans/trunk/apply-journal.json";
export const TRUNK_HISTORY_DIR = ".ans/trunk/history/";

export interface TrunkStore {
  readManifest(): Promise<StoreRead<TrunkManifest>>;       // missing / corrupt 判别，不自动重建
  writeManifest(m: TrunkManifest): Promise<StoreWrite>;    // 原子 + fsync + 串行链
  readAmendment(): Promise<StoreRead<TrunkAmendmentState>>;
  writeAmendment(a: TrunkAmendmentState): Promise<StoreWrite>;
  readJournal(): Promise<StoreRead<TrunkApplyJournal>>;
  writeJournal(j: TrunkApplyJournal): Promise<StoreWrite>;
  archiveHistory(version: number, m: TrunkManifest): Promise<StoreWrite>;
  listHistory(): Promise<number[]>;                        // 版本号列表（读目录，坏件跳过并诊断）
}
```

**纪律**：Provider 只做读写/坏件判别；不判断冻结、不发事件、不改指针。

**[交接] C1 形状对齐（PM 审核 F3/F4/F5/F12）**：`TrunkManifest`/`TrunkApplySnapshot` 以 C1 冻结为准——C1 按 F3 补 `artifacts.roleCards?: Record<string, TrunkStableArtifactRef>`（workflow/role-card/boundary 三类稳定文件映射，含 kind/path）并同步 `TrunkApplySnapshot`；`TrunkApplyJournalPhase` 按 F4 含 `"prepared" | "run-manifest-written" | "committed"`（`committed` 在提交点后写，phase 仅审计）；`TrunkSource` 使用 C1 的 `"upgrade"`（**不新造 `"main-upgrade"`**）；`TrunkAmendmentDoc.baseTrunk` 按 F12 允许 `TrunkVersionRef | null`（bootstrap）。

### 3.2 Provider `src/provider/version-change/`

- 记录文件（JSON，原子写，结构校验；未知字段保留）：
  - `.ans/state/version-changes.json`：`VersionChangeRecord[]`（`version-change/v1`，字段以 C1 冻结为准；本提案预期含 P1.6 §4.4 全字段）。
  - `.ans/state/refactor-requests.json`：`RefactorRequestRecord[]`（`refactor-request/v1`）。
  - `.ans/state/stable-writes.json`：`StableWriteRecord[]`（`stable-write/v1` + 许可字段 `permitId/expiresAt/consumedAt`）。
  - `.ans/state/doc-freezes.json`：**派生缓存**（可重建）：`{v,builtAt,baselineSha256,records:[…]}`；`baselineSha256` = baseline 文件 hash（仅用于判「是否需要重建」，不是权威）。
- **R9 baseline 读写不在此实现**：冻结记录写入/读取统一经门禁引擎 C2b API（§3.8），本 Provider 只生成缓存与对账结果；**不得双写双判**。

### 3.3 Service `src/service/trunk/`（关键公共 API）

```ts
export interface TrunkService {
  status(): Promise<TrunkStatusView>;                    // derived/frozen + stable 快照 + frozen 清单 + 待续接
  verify(): Promise<{ ok: boolean; violations: string[] }>;
  validateAmendment(input: { amendmentDocPath: string; flowId: string }): Promise<AmendmentValidation>;
  snapshotItemHashes(amendment: TrunkAmendmentState): Promise<ItemHashSnapshot>; // from/to sha256（F20/F25/F38）
  detectBoundaryExpansion(items): Promise<ExpansionResult>;                        // 只读解析，不写边界
  selectTargetVersion(kind, path): Promise<TargetVersionChoice>;                   // 0/1/多候选
  executeApply(input: ApplyInput): Promise<ApplyResult>;                          // journal 两阶段
  reconcileJournal(): Promise<ReconcileResult>;                                    // 启动/打开面板/恢复入口调用
  recover(input: RecoveryInput): Promise<RecoveryResult>;                          // 客户确认；tN+1
  applyStableSnapshot(input: StableSnapshotInput): Promise<StableSnapshotResult>;  // mini re-pin；不升 trunkVersion
}
```

**约定**：`executeApply` 的提交点 = trunk manifest 写成功；事件由 Pipeline 在返回后写（Service 不直接写账本）；失败返回判别错误、不改指针。

### 3.4 Service `src/service/version-change/`（含冻结/stable-write 子服务）

```ts
export interface VersionChangeService {
  submit(input: SubmitInput): Promise<SubmitResult>;            // 校验/定格/冻结修正案/记录；事件由 Pipeline 写
  approve(input: ApproveInput): Promise<ApproveResult>;          // 批准前重验 toSha256；漂移 ⇒ {ok:false,code:"vca-hash-drift"}
  reject(input: RejectInput): Promise<RejectResult>;
  markApplied(input: AppliedInput): Promise<void>;               // resultTrunkVersion/journalId
  markSuperseded(applicationId: string, by: string): Promise<void>;
  list(filter?: { flowId?: string; status?: string }): Promise<VersionChangeRecord[]>;
}

export interface FreezeService {
  isFrozen(path: string, version?: number): Promise<"frozen" | "draft" | "unknown">; // 服务侧查询/测试/迁移；生产守卫只用 C2b versionedDocFreezeState
  ensureCache(): Promise<CacheState>;                            // 启动/首个守卫会话前迁移+建缓存（触发 C2b install）
  migrate(): Promise<MigrationReport>;                           // 一律默认冻结；draft-marker 证据标记
  bootstrapFreeze(input: BootstrapFreezeInput): Promise<FreezeWriteResult>; // handoff-pin / bootstrap-vca
  recordFreeze(input: DocFreezeInput): Promise<FreezeWriteResult>;          // 经 C2b append API
  recordDraftMarker(input: DraftMarkerInput): Promise<void>;
  refreshAfter(event: DocFreezeEvent): Promise<void>;            // 调用 C2b refresh（不自建快照）
}

export interface StableWriteService {
  request(input: StableWriteRequest): Promise<StableWriteRecord>;   // 计算 base/target sha + diff preview
  approve(requestId: string, decision: CustomerDecision): Promise<PermitFact>; // 发一次性许可：approvedAt + expiresAt（批准后必填）；安装许可快照
  reject(requestId: string, decision: CustomerDecision): Promise<void>;
  completeWrite(input: { requestId: string; actualSha256: string }): Promise<CompleteResult>; // post-write 复核 actual===targetSha ⇒ 锁内标记 written/consumedAt + 刷新快照 + mini re-pin；不符 ⇒ failed 且许可作废
  findPermit(path: string): Promise<PermitFact | undefined>;        // 供 C2b 同步许可快照/门禁（编排不自建第二快照）
  fail(requestId: string, reason: string): Promise<void>;           // 异常 fail-closed + 恢复；failed 许可不可复用
}

export interface RefactorValidator {
  validate(input: RefactorSubmitInput): Promise<RefactorValidation>; // early warning + 机械写集
}
```

### 3.5 Pipeline 公共句柄

- `createTrunkRuntime(deps)` / `createVersionChangeRuntime(deps)` / `createRefactorRuntime(deps)` / `createStableWriteRuntime(deps)`：deps 注入 `projectRoot`、Service、task-state 写事件、presenter（桌面窗口）、customer-channel 选择器、now/log。
- 四个句柄均为**每会话/每面板一份**，`dispose()` 释放监听；不持写权、不修改角色能力、不自动派发。
- `version-change-runtime` 的 detail 路径调用 `trunk-runtime.runAmendmentItems`；upgrade 路径调用 `trunk-service.executeApply`；bootstrap 路径调用 `freeze-service.bootstrapFreeze` + `trunk-service`（建立 t1，`source:"bootstrap"`）。**VCA 提交只经发起角色能力工具**（product/rapporteur 会话注入 `submitVersionChangeCapability`，不新增 `version-change:submit` 渲→主 IPC）；`present()` 提供**重发卡入口**：仅对 `submitted` VCA，不重复写 `version.change(submitted)`、不重复通知、requestId 幂等（PM 审核 §4.7）。
- `stable-write-runtime` 的 workflow 卡使用 C1 app-owned 卡种 `stable-write`（不进 `GOVERNANCE_CARD_GROUP`，D1 独立最小结构校验：恰一推荐项/≥2 选项/path/base/target 字段齐全）；VCA/detail/trunk 逐项卡复用 `cardKind:"decision"` + `application:true` + 真实 `flowId`（PM 审核 §4.5）。
- `refactor-runtime.submit()` **必须校验发起身份**（F11）：只接受**活动 convener 会话**经能力位 `submitRefactorCapability` 的调用（或由 D1 在 IPC 处理时校验「存在活动 convener 会话且该会话发起」）；渲染侧自报角色身份一律拒绝并返回 VCA/能力指引；`refactor:list` 只读不涉及。

### 3.6 账本事件与逐 kind 校验（C2a，`task-state.ts`）

| kind | 关键字段（以 C1 冻结为准） | 归属校验（PM 审核 §4.1 冻结裁决） |
| --- | --- | --- |
| `version.change` | `applicationId/vcKind/initiatorRoleId/flowId/status/targets/decisionId?/journalId?/resultTrunkVersion?` | `submitted` ⇒ application（decidedBy 缺省）；`approved`/`rejected` ⇒ customer + `decisionId`；**`applied`/`superseded` ⇒ application + `decisionId`（不记 customer，F8）** |
| `doc.freeze` | `path/version/sha256/applicationId/reason/origin/decidedBy?/decisionId?/at` | customer 类 reason：`vca-approved`/`version-upgrade-approved`/`detail-item-applied`/`proposal-confirmed`/`intent-confirmed`；application 类：`amendment-submitted`/`handoff-pin-bootstrap`/`bootstrap-vca-approved`/`migrated-legacy`（`decidedBy` 缺省，不冒充客户，F35）；**`migrated-draft` 不是 freeze reason**；`proposal-confirmed`/`intent-confirmed` 的 `applicationId` 用 C1 定义的合成值（不得空串） |
| `refactor.request` | `requestId/flowId/initiatedBy:"convener"/scope/status/managedBy:"application-scheduler"/enforcement` | `origin:"application"`、**无 `decidedBy`**、无批准卡字段（F31） |
| `stable.write.requested/approved/rejected/written/failed` | `requestId/roleId/path/stableKind/baseSha256/targetSha256/approvedAt/expiresAt?/consumedAt?/decisionId?/confirmationId?` | `requested`/`written`/`failed` ⇒ application；`approved`/`rejected` ⇒ customer + `decisionId` 或 `confirmationId`；**`written` 是应用动作（application+decisionId），不记 customer**；`written` 后才 mini re-pin |
| `trunk.state`（含 `op:"stable-repinned"`） | `op/path/oldSha/newSha/confirmationId?/decisionId?/origin/decidedBy/trunkVersion/highRisk?` | `switched`/`unfrozen`/`refrozen`/`refrozen-cancelled`/`recovered`/`stable-repinned` ⇒ customer + `decidedBy:"customer"`（stable-repinned 另需 `confirmationId`/`decisionId`，`trunkVersion` 必填且与事件前一致）；`gap` ⇒ application、`decidedBy` 缺省、`channel:"low-level-run-change"`；`drift`/`unfrozen-expired` **仅 legacy 读，新代码不得写**；`highRisk.acknowledged` 只允许 `true`；**无 trunk manifest 时不写 `stable-repinned`**（只记待续接） |
| `trunk.amendment` | P1.3 字段 + `applicationId`；`status` 映射（proposed→submitted、confirmed→approved、cancelled→rejected） | 客户批准/拒绝、逐项 `applied`/`kept`/`cancelled` ⇒ customer + `decisionId`；`submitted`、`applyState` 应用动作、`apply-failed`/`applied-uncertain` ⇒ application、`decidedBy` 缺省；`applyState` 保留；旧事件可读 |

**校验纪律**：C2a **消费 C1 常量**（`DOC_FREEZE_CUSTOMER_REASONS`/`DOC_FREEZE_APPLICATION_REASONS`/`TRUNK_STATE_CUSTOMER_OPS`/`TRUNK_STATE_APPLICATION_OPS`），不复制字面量；`version.change` 业务字段用 `vcKind`、`stable.write.*` 用 `stableKind`（C2a 不另写 `kind`）；未知 kind 旧 app 记坏行不阻塞（兼容声明）；新事件不含密钥/隐私；字段形状非法 ⇒ 记坏行并诊断，不抛。

### 3.7 `run-manifest.ts` 加法（S3）

```ts
export interface RunRepinRecord {
  schema: "run-repin/v1";
  at: string;
  applicationId: string;         // VCA（upgrade/detail）或 bootstrap
  decisionId?: string;           // 客户批准时
  targets: Array<{ kind: RunDocKind | "teamPlan" | "flow"; path: string; sha256: string }>;
}
export interface RunManifest { …; repins?: RunRepinRecord[]; }
export async function repinPinnedRun(projectRoot: string, runId: string, input: {
  targets: RunRepinRecord["targets"]; applicationId: string; decisionId?: string;
}): Promise<RunManifestResult<{ manifest: RunManifest; alreadyApplied: boolean }>>; // 幂等
```

- `pinRun`/`prepareRunPin`（bootstrap 例外）：引用的每份版本化文档经门禁引擎 `versionedDocFreezeState` + `versionedDocOverwriteDecision({operation:"pin"})` 判定，必须 `frozen===true`；首次 handoff pin 在 `versions.lock` 内先写 `doc.freeze(reason:"handoff-pin-bootstrap", origin:"application")` 后 pin（只此一处 bootstrap 写入）；非 bootstrap 未冻结 ⇒ 拒绝码 `versioned-doc-not-frozen`（C14）。
- `repinPinnedRun` 目标必须已冻结（VCA approved/apply 时冻结；同样经 `operation:"repin"` 判定），保留 `createdAt`/`runId`/`flowId`，追加 `repins`；旧读者忽略未知字段。

### 3.8 与 C2b（门禁引擎）的联合契约（[交接]，C2b/C2c 联合冻结）

[设计候选] 按 PM 审核 §4.2/§4.3/§4.4 冻结；编排消费、门禁引擎实现并冻结：

1. **唯一同步冻结查询与判定**：
   - 生产唯一同步查询 = `versionedDocFreezeState(projectRoot, relPath, exists)` → `"frozen"|"draft"|"unknown"`（从 C2b **安装的**快照解析；guard 不直接读 `doc-freezes.json`）。
   - `versionedDocOverwriteDecision({ relPath, exists, frozen?, operation? })`：`operation` ∈ `write|edit|delete|rename|move|pin|repin`；`frozen===true` ⇒ 拒绝；`false` ⇒ 允许（仍受写权）；`unknown/corrupt/快照不可用` ⇒ fail-closed；pin/repin 目标必须 frozen；rename/move 源+目标同判。
   - `checkVersionedDocWrite` **删除导出与死导入**（实测仅 `shell-write-guard.ts:18` 死导入）；若保留只能薄包装同一判定，不得成为第二权威。
2. **R9 记录变体（C2b 扩展 reader/writer）**：`event:"frozen"`（子形状 = C1 `DocFreezeRecord`，type-import 不复制）、`event:"draft-updated"`（同 path/version 新 sha，draft 原位改）、`event:"draft-marker"`（`migrated-draft` 证据标记，不写 `doc.freeze`）、保留 `baseline`/`version-added`；`verifyVersionedDocBaselinesLocked`/`baselineShaFor`/`registerVersionedDocAfterWrite` 改「同一实际路径最后一条记录为准」，冻结记录是该 path/version 终态（冻结后不同 sha ⇒ 违规），历史记录不删。
3. **冻结写入 API（单一写入者）**：`appendDocFreezeRecords(projectRoot, records: DocFreezeRecordInput[])`（同 `versions.lock`/fencing 原子追加）；`appendDraftMarkers(...)`；B-6/B-7 **不直接写 `versions.jsonl`**；`proposal-confirmed`/`intent-confirmed` 的 `applicationId` 用 C1 合成值（不得空串）。
4. **stable 许可判定（纯函数）**：`stableWriteDecision({ projectRoot, relPath, sha256, permit, now })`——校验 `status==="approved"`、path/kind/roleId 与 `stableWritePathOf` 一致、`sha256===targetSha256`、`baseSha256` 与当前文件一致（`""` = 写入前不存在）、未过期、未消费、与**同步许可快照**逐字段一致；无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝；判定不写盘、不消费、不发事件。
5. **`shell-write-guard.ts` 输入扩展**：`ShellWriteGuardInput` 增加可选 `freezeStateOf?: (rel: string) => "frozen"|"draft"|"unknown"`、`stablePermitOf?: (rel: string) => PermitFact | undefined`；写/删除/重命名/移动目标统一调用同一判定；**shell/opaque 无内容 hash ⇒ stable 目标一律拒绝**并提示 stable-write 通道；`protectedPathMention` **保持现状**（所有受管版本化路径 mention deny，ready/unknown/corrupt 一致；精确目标判定才用冻结状态，C13 不放宽）。
6. **登记钩子**：`registerVersionedDocAfterWrite` 仍由门禁引擎维护；draft 原位改追加 `draft-updated`（现状同 path/version 不同 sha 返回 false，C2b 必须改）；frozen 写入在 gate 即拒绝，不进入登记。
7. **快照安装/刷新归 C2b**：`doc.freeze` 写成功后由 C2c/门禁引擎 refresh 安装快照；失败 ⇒ 快照 unknown ⇒ 全部 fail-closed；编排与 D1 只调用 install/refresh/query，**不自建第二份 Map**（F7）。

> `doc-freezes.json` 与冻结记录写入**只经 C2b API**；C2c 联合测试覆盖「baseline 权威/缓存可重建/不一致告警/latest-per-path/不双写双判」；旧 app 读新 event 值将 `baseline-corrupt` fail-closed（安全向，E1 披露）。

### 3.9 与 C1（运行时核心）/ D1（桌面窗口）的交接

- **C1**：`src/model/trunk.ts`（`TrunkManifest`/`TrunkAmendmentState`/`TrunkApplyJournal`/错误码）、`src/model/version-change.ts`（`version-change/v1`/`doc-freeze/v1`/`stable-write/v1`/`refactor-request/v1`）、`src/model/runtime.ts`（事件加入 `TaskStateEvent`；`acknowledgments` 对象数组）。**按 PM 审核裁决必须包含**：`TrunkManifest.artifacts.roleCards?` + `TrunkApplySnapshot` 同步（F3）；`TrunkApplyJournalPhase` 含 `"committed"`（F4）；`TrunkSource` 用 `"upgrade"`；`TrunkAmendmentDoc.baseTrunk` 允许 `null`（F12）；`stable-write/v1` 含 `approvedAt`/`expiresAt`（批准后必填）/`consumedAt?`/`baseSha256` 空串语义（F5）；`WriteGate` 扩可选 `(targetPath, context?: { contentSha256?: string; operation?: "write"|"edit" })`（F6）；`GovernanceCardKind` 加 app-owned `stable-write` + `GOVERNANCE_CARD_KINDS` 白名单（F2）；事件字段 `vcKind`/`stableKind` 与 `DocFreezeRecord.applicationId` 合成规则；错误码补 `vca-conflict`、`trunk-drift` 并入 `trunk-verify-failed`。本提案 §3.1/§3.6/§3.7 的字段为预期，**以 C1 冻结为准**。
- **C1/运行时核心写集**：`WriteGate` 内容哈希落点要求运行时核心把 `src/provider/runtime/tools.ts` 列入 C1/S3 写集（其 Section 1 单文件条目内；团队计划 §4.1「预计否」由统筹在 E1 作计划枚举补登，不是边界变更）；若运行时核心拒绝该落点，须给出等价的「写前最终字节 hash」路径，**不得以写后验证替代写前判定**（F6）。
- **D1**：客户卡通道（VCA 卡、stable workflow 卡、appointment-write 钩子、逐项卡）、客户主权排除、`acknowledgments` 结算、IPC `version-change:*`/`stable-write:*`/`refactor:*`/`doc-freeze:list`、R9 冻结缓存/许可预加载与刷新；Pipeline 只调用注入的 presenter/决策回执，不直接触达客户。
- **D1 冻结后**：渲染 UI（U1）只消费 IPC/面板数据，不导入编排实现。

## 4. 关键流程与状态机

### 4.1 R9 冻结权威与 `doc-freezes` 派生缓存

- **权威**：`.ans/state/versions.jsonl` 的 `frozen`/`draft-updated`/`draft-marker` 记录（经 C2b 读写；同一 `versions.lock`；**latest-record-per-path**）；`doc-freezes.json` 仅派生缓存，可随时由 baseline 重建。
- **同步快照（F7）**：唯一实现归门禁引擎 C2b——`versionedDocFreezeState(projectRoot, relPath, exists)` 从**安装的**快照解析；编排在会话/面板打开时调用 `ensureCache()`（迁移 + 缓存重建）并触发 install/refresh；`doc.freeze` 后刷新；**编排不得自建第二份 Map、不直接读缓存文件**。快照 `unavailable` 时所有版本化写判定 unknown ⇒ fail-closed（draft 也被拒，宁可多拒不可放行冻结覆盖；恢复入口见 §4.6）。
- **对账**：`reconcile()` 比较缓存头部 `baselineSha256` 与当前 baseline：一致 ⇒ no-op；缓存缺失/陈旧 ⇒ 从 baseline 重建并告警；缓存损坏 ⇒ fail-closed，不自动重建/放开；baseline corrupt/missing-marker ⇒ 不重建、标 `unusable`、fail-closed。**不一致以 baseline 为准**（AC-27）。
- **draft 写入**：属主写成功后 `registerVersionedDocAfterWrite` 追加 `draft-updated`（同 path/version 新 sha；C2b 修订现状「不同 sha 返回 false」）；frozen 写入在门禁即拒，不会进入登记。
- **未知/损坏语义**：baseline/快照 unknown 或 corrupt ⇒ 拒绝所有版本化变更（含新版本 vN+1），仅 migration-required 的新文件允许（C10）；恢复需客户确认（AC-21）。

### 4.2 迁移与 bootstrap

- **迁移（F29）**：`ensureCache()` 首次运行时：
  1. baseline/marker 均不存在 ⇒ TOFU 迁移：扫描七类版本化文档 + `-amendment-vN.md`，逐条写 `migrated-legacy` 冻结记录（`origin:"application"`）；**既有文档一律冻结**。
  2. baseline 存在且可读 ⇒ 对缺少冻结记录的既有文档补 `migrated-legacy`（历史/证据/已 applied 修正案不可解冻）；仅当存在可证明未确认草稿（无客户确认记录/最后写入晚于最后一次确认）⇒ 写 baseline **`event:"draft-marker"`**（`migrated-draft` 证据标记，**不写 `doc.freeze`、不是 freeze reason**），视图标 draft。
  3. baseline 存在但 corrupt/不可读 ⇒ **不迁移、不重建**，`unusable` fail-closed（AC-21）。
  4. `.ans/state/freeze-migrated.json` 若采用，**仅作迁移进度标记**（baselineSha256/记录数/时间），不得成为第二本冻结权威（C2b C2）；`proposal-confirmed`/`intent-confirmed` 的 `applicationId` 用 C1 合成值。
- **Bootstrap 两条路径（F30/AC-25）**：
  1. 首次 handoff pin：`pinRun` 内写 `doc.freeze(handoff-pin-bootstrap)`（`origin:"application"`）后 pin；`pinRun` 只 pin 冻结文档。
  2. 无 trunk VCA：`baseTrunk:null` + `bootstrap:true`；批准后 `freeze-service` 冻结目标、`trunk-service` 建立 t1（`source:"bootstrap"`，`trunkVersion:1`）；bootstrap 只成功一次。

### 4.3 VCA 状态机与批准哈希重验

```
draft --(提交校验通过；detail 提交即冻结修正案)--> submitted（申请记录定格）
submitted --(客户批准；批准前重验 toSha256)--> approved
submitted --(客户拒绝)--> rejected
approved --(version-upgrade：目标冻结 + journal re-pin 成功)--> applied
approved --(detail-amendment：逐项确认 + journal re-pin 成功)--> applied
approved --(取消/失败)--> approved（可重试） / superseded
rejected --(新申请)--> superseded
```

- **提交**：只经发起角色能力工具（product/rapporteur 会话注入；不新增渲→主提交 IPC）；角色/kind/目标/作者写区/baseTrunk/bootstrap/修正案引用/最小项/并发/幂等校验；应用计算 `toSha256` 与 `applicationSha256`；detail 的修正案文档 `doc.freeze(reason:"amendment-submitted")`。**bootstrap（F12）**：`baseTrunk` 允许 `null`（`TrunkAmendmentDoc.baseTrunk` 同）——按 C1/C2c 裁决仅 version-upgrade bootstrap 或 detail 亦允许；AC-25 按 P1.6 原文判定。
- **发卡/重发**：VCA 卡复用 `cardKind:"decision"`+`application:true`+真实 `flowId`（D1 保证主权；`tryApplyDirectiveDecision` 按审核 §4.6 排除）；经治理会话客户卡通道（convener→rapporteur→chief）；无通道 ⇒ 保持 submitted、通知、可重试；`version-change-runtime.present()` 提供**重发入口**（仅 submitted；不重复写 submitted 事件/通知，requestId 幂等）。
- **批准**：客户本人决定（D1 保证主权）；Pipeline 先对每个 target 重算 `toSha256` 与提交值比对：漂移 ⇒ 拒绝批准（保持 submitted、重发卡，不冻结/不 re-pin，AC-26）；一致 ⇒ 记录 `decidedBy:"customer"`，按 kind 执行。
- **幂等/并发**：`applicationId` 唯一；同一 flow 同时仅一个 submitted/approved；store 更新带 `expectedStatus` 乐观并发；冲突 ⇒ `vca-pending`/`vca-conflict`（C1 错误码，审核 §4.10-4）。

### 4.4 detail-amendment targets↔items 与 P1.3 逐项确认衔接

- 修正案 items 仅实际变更项；targets↔items 一一对应（kind/roleId/toSha256）；`change:none` 不是 target；无实际变更拒绝提交。
- 批准后进入 `trunk-runtime.runAmendmentItems`：逐项 `item-apply`（采纳→applied）/`item-keep`（不采纳→kept）/`item-cancel-amendment`（取消整份）；边界扩大勾选在确认预览（stable 边界不走 detail，边界扩大仅对 `execution`/contract 项相关的既有检测保留，P1.6 口径）。
- apply 只对 applied 项生效；全部 kept/none ⇒ `cancelled(no-applicable-changes)`；applied 项目标在应用时 `doc.freeze(reason:"detail-item-applied")`；全部确认后 `executeApply` → trunk+1。
- **execution（teamPlan/flow）不纳入 guard 版本化模式**（C15 裁决）：execution 的冻结/re-pin 由 VCA/trunk manifest + `verifyTrunk` 保证；E1/E2 披露「execution 非 guard 冻结」；若策划要求 guard 级执行，属方案澄清/范围变化，停止回报。

### 4.5 apply-journal 提交协议与崩溃对账（F1/F18/F27/AC-12）

1. 校验目标冻结 + 提交/批准/apply 三时点哈希（AC-26）；
2. 写 `apply-journal.json`（`phase:"prepared"`，fsync）：journalId/applicationId/targets/runRepin 计划；
3. 如需 run manifest 变更：`repinPinnedRun`（幂等）→ `phase:"run-manifest-written"`；
4. **提交点**：写 trunk manifest（含新版本号、`artifacts`（含 `roleCards`）、`TrunkApplySnapshot`、history 归档）；写成功即提交；
5. `phase:"committed"`（C1 `TrunkApplyJournalPhase` 含 `committed`，F4；提交点后写、仅审计）+ 返回结果；Pipeline 写 `trunk.state("switched")`、`version.change(applied)`（**application + decisionId，不冒充 customer**）、`doc.freeze`、`trunk.amendment` 事件并通知证据失效/重验。
- **崩溃对账**：`reconcileJournal()`（应用启动、trunk 面板打开、恢复入口）：
  - 读 journal target 与磁盘实际文件/run manifest/trunk manifest **内容匹配**（hash）判定实际阶段；phase 仅辅助；
  - 未到提交点 ⇒ 可直接重试或 `failed`（不改 trunk 指针）；
  - 已过提交点但事件缺失 ⇒ 补写事件（幂等）；
  - 两方向/相位滞后 ⇒ 如实报告分裂态，不自动“修复指针”，交恢复；
  - 失败路径一律不移动 trunk 指针。

### 4.6 trunk 状态机与恢复

```
(不存在) --(唯一 pinned run)--> derived v1（只读）
(不存在) --(bootstrap VCA approved + 目标冻结)--> frozen t1（source:"bootstrap"）
derived/frozen --(VCA approved + journal commit)--> frozen tN+1（旧版本入 history）
frozen --(主干升级：仅紧急/恢复，高危二次确认)--> frozen tN+1（source:"upgrade"；C1 字面量，不新造 "main-upgrade"）
frozen --(stable 确认即写成功)--> stable-repinned（mini re-pin；trunkVersion 不变）
unavailable(损坏) --(客户确认 recovery)--> frozen tN+1（source:"recovery"）
```

- `verifyTrunk`：pinned run + stable 哈希 + roster/D3；异常 ⇒ `trunk-verify-failed`（C1 错误码；`trunk-drift` 字面量不采用、不恢复 drift 状态；fail-closed）+ 恢复入口；注册表 corrupt ⇒ 不自动重建、不自动放开覆盖（AC-21）。
- **主干升级收窄**：`mainUpgrade` 只接受 `reason:"emergency"|"recovery"`；目标只允许 stable/紧急 re-pin；**拒绝版本化文档**；高危二次确认 + 审计 + 事后披露（AC-30）。

### 4.7 stable-write（确认卡/许可/mini re-pin）

- **请求**：workflow 由 convener；role-card/boundary 由 nominator 经 appointment-write（语义不变）。`request()` 计算 `baseSha256`（现有文件 hash；**新建为 `""`**，C1 F5）与 `targetSha256`（预览内容最终字节），生成有界 diff preview。
- **确认**：workflow 轻量卡使用 C1 app-owned 卡种 **`stable-write`**（选项 `approve-stable-write`/`reject-stable-write`，推荐 reject，preview 展示 path/base/target sha256/diff；不进 `GOVERNANCE_CARD_GROUP`、不进入判断/代选；`validateDecisionCardRequest` 不适用，由 D1 做独立最小结构校验）；role-card/boundary 沿用 appointment-write 卡；客户本人（judge/委托/指令不适用）。
- **许可**：批准 ⇒ 一次性许可 `{permitId,path,kind,roleId,baseSha256,targetSha256,approvedAt,expiresAt(批准后必填),consumedAt?,decisionId/confirmationId}`；TTL 默认 30 分钟（常量，C2c 定）；批准后**安装同步许可快照**（C2b）；**过期/伪造/无许可拒绝**，过期不自动补发。
- **写入判定与消费（F5/审核 §4.3）**：**pre-write** 由 gate 用 `(path, permit, contentSha256)` 调纯函数 `stableWriteDecision`（不消费）；**post-write** 由 `completeWrite(actualSha)` 复核 `actual===targetSha256` ⇒ 在 `stable-writes` 存储锁内标记 `written`/`consumedAt`、刷新许可快照、执行 mini re-pin → `stable.write.written`（**application+decisionId**）；不符/异常 ⇒ `stable.write.failed` + **该许可同时作废（failed/consumed，不得保留可复用的 approved 许可）**、fail-closed + 恢复、不更新快照、不产生 drift（AC-33–AC-35）。**shell/opaque 无内容 hash ⇒ stable 一律拒绝**并提示 stable-write 通道（F6/C7），不做 shell stable 写入路径。
- **mini re-pin**：更新 trunk manifest `artifacts.workflow`/`roleCards[role]`/`boundaries[role]` 快照（C1 F3，`TrunkApplySnapshot` 同步）+ `trunk.state(op:"stable-repinned",origin:"customer",decidedBy:"customer",confirmationId/decisionId,trunkVersion 与事件前一致)`，**不升 trunkVersion**；**无 trunk manifest 时不写该事件**，只记录待续接（下次 pin/bootstrap/续接时补快照）。
- **既有 stable 文件**：pin/bootstrap 作为已确认基线快照；后续任何写入均需新确认；无迁移 drift。

### 4.8 refactor.request 校验与机械写集

- 发起者必须 convener，且**身份校验接线（F11）**：只接受活动 convener 会话经能力位 `submitRefactorCapability` 的调用，或由 D1 在 IPC 处理时校验「存在活动 convener 会话且该会话发起」；渲染侧自报角色身份一律拒绝并返回 VCA/能力指引（与桌面窗口对齐）。flow 存在；`scope{modules,paths,roles}` 在既有模块/角色边界内。
- `RefactorRequestStatus` 五值（C1，含 `superseded`）：`requested → accepted | rejected`、`accepted → closed`、`requested/accepted → superseded`；状态迁移文档化、C2a 校验。
- **early warning**：路径命中 `isVersionedDocPath`、`角色卡/`、`docs/workflow.md`、`docs/scheduling/`、`docs/flows/`、`.ans/` ⇒ 拒绝并提示 VCA/stable。
- **机械保证**：返回 `enforcement.writeSet` = scope 内模块代码目录（由 convener 派发任务时写入任务 writeSet）；`WriteGate`/shell 守卫机械拒绝越界（版本化/边界/stable/teamPlan/flow）；scope 申报只作 early warning。
- 记录 `refactor.request`（`managedBy:"application-scheduler"`，无 customer decision）；状态 requested→accepted/closed/rejected；越界 ⇒ rejected/superseded + 转 VCA；不产生 trunk 版本、不弹批准卡、客户只读审计。

### 4.9 守卫真实调用点接线（AC-15/AC-33/AC-35）

| 通道 | 现状锚点 | 改法 |
| --- | --- | --- |
| write/edit（run-role gate） | `run-role.ts:849-866` | `gate` 扩 `(targetPath, context?)`；`rel` 版本化 ⇒ `versionedDocFreezeState`（C2b 安装快照）+ `versionedDocOverwriteDecision({relPath,exists,frozen,operation})`；`unknown` ⇒ fail-closed；stable 路径 ⇒ 必须带 `context.contentSha256`，调 `stableWriteDecision({projectRoot,relPath,sha256,permit,now})`，无上下文/无许可拒绝（F6） |
| shell 写目标 | `shell-write-guard.ts:602-604/643-645` | `run-role` 把 C2b `versionedDocFreezeState` 与许可快照注入 `ShellWriteGuardInput`（不自建实现）；写/删除/重命名/移动统一同一判定（`rm`/`mv`/`cp`/`tee` 等由既有静态解析路径覆盖）；**shell 无内容 hash ⇒ stable 目标一律拒绝**并提示 stable-write 通道（C7） |
| 不透明 shell/脚本 | `shell-write-guard.ts:657-669` | **保持现状**：所有受管版本化路径 mention deny（ready/unknown/corrupt 一致，C13 不放宽）；stable 路径 mention 同样 deny；精确目标判定才用冻结状态 |
| shell 后审计 | `shell-post-audit.ts:270-289` | 注入 C2b 冻结查询：frozen 漂移 ⇒ 违规；draft 变更 ⇒ 不违规；stable 变更 ⇒ 违规（stable 写入只允许 write/edit 经许可，shell 通道拒绝；fail-closed） |
| pin / re-pin | `run-manifest.ts:509-549`；新增 `repinPinnedRun`/trunk `executeApply` | 统一 `versionedDocOverwriteDecision({operation:"pin"|"repin"})`；只 pin 冻结文档；bootstrap 例外写 `handoff-pin-bootstrap`；journal 提交点前后校验 |
| 属主写后钩子 | `run-role.ts:2386-2389` | 路由：版本化 ⇒ `registerVersionedDocAfterWrite`（draft 原位改由 C2b `draft-updated` 承载）；stable ⇒ `stableWriteService.completeWrite(actualSha)`（post-write 复核后消费+mini re-pin） |
| 删除/重命名/移动已登记草稿（C8） | shell 解析路径 | Batch 1 前若不支持 `removed`/`moved` 记录，guard 拒绝已登记草稿的删除/改名/移动并 E1 披露；frozen 一律拒绝（AC-15 全调用点矩阵） |

## 5. 与实施注意点映射

### 5.1 增量 §5.4 九条（逐条核对）

| # | 注意点 | 本角色落点 | 证据 |
| --- | --- | --- | --- |
| 1 | R9 权威；`doc-freezes` 仅派生缓存；不得双写双判 | §3.2/§4.1：缓存只由 C2b R9 读 API 重建；写入只经 C2b append API；`reconcile` 以 baseline 为准 | `version-change-store.test.ts`（重建/对账/不可用）、C2b/C2c 联合测试（AC-27） |
| 2 | 唯一同步判定与真实调用点；不得依赖无调用死代码 | §4.9：run-role/shell 调用点统一接 `versionedDocFreezeState`（C2b 安装快照，单一实现）+ `versionedDocOverwriteDecision`（含 delete/rename/move/pin/repin）；`checkVersionedDocWrite` 删除导出/死导入；stable 路径经 `stableWriteDecision` + `WriteGate context.contentSha256` | `run-role-freeze-guard.test.ts` + 门禁引擎全调用点矩阵（AC-15） |
| 3 | 迁移默认一律冻结；migrated-draft 证据；missing=迁移、corrupt=fail-closed | §4.2 `freeze-service.migrate` | `version-change.test.ts` 迁移 fixtures（AC-10/AC-21） |
| 4 | Bootstrap：首次 pin 冻结；无 trunk VCA；pin 只 pin 冻结文档 | §4.2/§3.7 `pinRun`/bootstrap；`baseTrunk:null`（F12） | `run-manifest.test.ts` + `version-change.test.ts`（AC-25） |
| 5 | VCA 通道/批准前重验；无通道保持 submitted | §4.3 `version-change-runtime`：VCA 复用 `decision` 卡；只经角色能力提交；`present()` 重发幂等 | `version-change-runtime.test.ts`（AC-18/AC-26） |
| 6 | 重构写集仅模块代码目录；越界转 VCA | §4.8 `refactor-validate` + `refactor-runtime`：**发起身份经活动 convener 会话/能力位校验**（F11） | `refactor-runtime.test.ts`（AC-7/AC-8） |
| 7 | detail 只要求实际变更项；none 不是 target | §4.4 `targets-items`/`amendment-validate`；execution 非 guard 冻结（C15 披露） | `version-change.test.ts`/`trunk-amendment.test.ts`（AC-28） |
| 8 | stable 单一路径；主干升级仅紧急/恢复 | §4.6/§4.7：`mainUpgrade` 收窄、source `"upgrade"`；常规 stable 走 `stable-write` 卡（app-owned）/appointment-write；许可 pre-write+post-write+失败作废；mini re-pin 不升 trunkVersion | `trunk-service.test.ts`/`stable-write*.test.ts`（AC-30/AC-33–36） |
| 9 | 基线披露（`f4c24eae`→`89b1fb2`；旧证据不复用） | 本文件 §1.1/§1.2；实现期以 B0 记录为基线 | E1 披露；`test/编排` 基线 804/803/1 |

### 5.2 增量 §10.5 P1.6 七条

| # | 注意点 | 本角色落点 |
| --- | --- | --- |
| 1 | workflow 写路径：保留 convener 写权，改轻量确认卡；不改 appointment-write 语义；不重建 drift | §4.7 `stable-write-runtime.requestWorkflowWrite` + `stable-write-service`；workflow 卡用 app-owned 卡种 `stable-write`（不进判断组）；`run-role` gate 对 workflow 走许可判定 |
| 2 | stable 写入门禁：匹配一次性许可；hash==targetSha；异常 fail-closed/恢复 | §3.8.4/§4.7：pre-write `stableWriteDecision`（纯函数，C2b）+ `WriteGate context.contentSha256`（F6）；post-write `completeWrite` 复核后消费；失败作废许可；shell 通道 stable 拒绝 |
| 3 | mini re-pin：更新 trunk manifest stable 快照 + decisionId/confirmationId；trunkVersion 不变；审计 | §4.6/§4.7 `applyStableSnapshot`（workflow/roleCards/boundaries，F3）+ `trunk.state(stable-repinned)`（trunkVersion 必填且不变；无 manifest 不写事件） |
| 4 | VCA 收窄：workflow/boundary/product-intent 不得作为 target | §4.3 `vca-service` 目标校验（AC-5/AC-19/AC-29） |
| 5 | 模块归属：guard/stableWriteDecision 属门禁引擎；stable-write Service/Pipeline 属编排（B-7/B-11） | §2.3–§2.5/§3.8（本角色不写 `src/common/门禁引擎/**`） |
| 6 | 不升 trunkVersion；E1/面板如实显示 stable 确认/续接 | §4.7；面板数据由 D1/U1 消费 |
| 7 | 其余九条继续有效 | 见 §5.1 |

## 6. 测试计划与验收证据贡献

### 6.1 命令与基线

- 本角色最低命令（V1 §4.2 编排行）：`node --test "test/编排/**/*.test.ts"`；`npm run typecheck`；完成后按 Batch 5 交测试角色跑 T3 全量与双端构建。
- 基线（B0 最终版 **221 行 / `8c6272d5…`**，HEAD `89b1fb2`；旧 173 行/`27f9b94d…` 为含占位中间版勿引用）：`test/编排` 64 文件 / 804 tests / 803 pass / 1 既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:184`）；新增确定性失败必须为 0、新增 skip 为 0。
- 新增测试文件（§2.7）一律在 `test/编排/`；测试缝只测试装配，生产路径不打开测试缝。

### 6.2 AC 映射（本角色证据贡献；不替代 V1 判定）

| AC | 本角色提供的证据 |
| --- | --- |
| AC-1 | 冻结服务/守卫单测：draft 同版本覆盖成功、frozen 拒绝；`doc.freeze` 记录/path/version/sha256；新版本 vN+1 draft |
| AC-2 | 修正案提交冻结：`doc.freeze(reason:"amendment-submitted")`；提交后 write/edit/shell 拒绝；拒绝后不可原地复用 |
| AC-3 | 发起角色矩阵（product/rapporteur 正例；convener/chief/客户负例）；直提通道；幕僚仅通知 |
| AC-4 | 批准/拒绝两条路径的 manifest/journal/事件；detail 批准后逐项卡、目标未全冻结；拒绝不冻结/不 re-pin |
| AC-5 | upgrade 目标范围；批准前哈希漂移注入；冻结+校验+journal+trunk+1；边界目标拒绝 |
| AC-6 | detail 逐项 apply/keep/cancel；只冻结 applied；取消/失败不改 trunk |
| AC-7/8 | refactor 记录/状态/机械写集/越界转 VCA；无 customer decision；不产生 trunk 版本 |
| AC-10 | 迁移 fixtures：legacy 一律冻结、migrated-draft 证据、missing=迁移、corrupt=fail-closed、已 applied 修正案不可解冻 |
| AC-11/31 | `task-state` 逐 kind 校验（PM 审核 §4.1）：`version.change` submitted=application、approved/rejected=customer+decisionId、**applied/superseded=application+decisionId**；`stable.write.requested/written/failed`=application、approved/rejected=customer、**written=application+decisionId**；`trunk.state` 客户 op=customer、gap=application、drift 仅 legacy；`doc.freeze` reason 两族；轮转恢复 |
| AC-12 | journal 两阶段样例 + 故障注入（`prepared`/`run-manifest-written`/`committed` 三态，F4；两方向/相位滞后；失败不改指针） |
| AC-13/19/24 | 目标作者写区/写权不变结构检查；VCA/stable/refactor 不扩写权；不改闸门/验收 |
| AC-14 | 并发提交/冻结互斥；重复 applicationId 幂等；`vca-base-mismatch`/`vca-conflict`；trunk 版本单调 |
| AC-15 | run-role 真实调用点矩阵（write/edit/删除/重命名/移动/pin/re-pin 的编排侧）：`versionedDocFreezeState`+`versionedDocOverwriteDecision`；stable 路径 `WriteGate context.contentSha256`+`stableWriteDecision`；`unknown`/快照不可用 fail-closed；`checkVersionedDocWrite` 删除 |
| AC-16 | P1.3 内部机制回归（trunk manifest/逐项确认/journal/恢复既有语义不回归） |
| AC-17 | `version-decision.ts` 文案迁移；旧 API 保留 |
| AC-18 | Pipeline 卡请求载荷（kind/发起者/targets/path/version/sha256/差异/语义）；无通道 submitted；detail acknowledgments 请求 |
| AC-25 | 两条 bootstrap 路径（pin 冻结 / 无 trunk VCA）；`baseTrunk:null`（F12）；pin 只 pin 冻结文档；bootstrap 只一次 |
| AC-26 | 提交/批准/apply 三时点重算；漂移拒绝/重发卡；不冻结/不 re-pin |
| AC-27 | R9 冻结记录样例；缓存重建；draft/frozen 分离；不一致告警且归 baseline；无双写双判 |
| AC-28/29 | 最小项；targets↔items；kind→文档/团队计划/flow 映射；workflow/boundary 作为 target 拒绝 |
| AC-30 | stable 单一路径：常规 stable 走确认即写/mini re-pin；execution 走 detail；主干升级仅紧急/恢复 |
| AC-32 | 旧状态映射（proposed/confirmed/cancelled）；旧账本不重写；`applyState`/`applicationId` 保留 |
| AC-33–36 | stable-write Service/Pipeline 证据：`approvedAt/expiresAt/consumedAt`/`baseSha256=""`；pre-write targetSha 判定 + post-write 复核消费（失败作废许可）；mini re-pin（workflow/roleCards/boundaries，F3；trunkVersion 不变；无 manifest 不写事件）；异常恢复/无 drift；D1/U1 提供卡/面板证据 |

### 6.3 证据文件（写入本角色 `docs/change/`）

- 原始命令输出、`test/编排` 计数与失败分类、`npm run typecheck` 退出码；
- `.ans/state/versions.jsonl` 冻结记录样例（不含密钥/隐私）、`doc-freezes.json` 重建前后、journal/manifest 样例、`version.change`/`stable.write.*`/`trunk.state` 账本行样例；
- 迁移/bootstrap fixtures 与故障注入输出；候选哈希/路径/命令/环境。

## 7. 依赖、冻结与实施顺序

### 7.1 契约冻结依赖（Batch 1）

- **C1（运行时核心）**：Model 类型/事件/`acknowledgments`（对象数组）/`RunRepinRecord`；**按 PM 审核 F2/F3/F4/F5/F6/F12**：`stable-write` app-owned 卡种 + `GOVERNANCE_CARD_KINDS`、`artifacts.roleCards`+`TrunkApplySnapshot`、journal `committed` phase、`stable-write/v1` 字段（`approvedAt/expiresAt/consumedAt?/baseSha256=""`）、`WriteGate` 可选 `context.contentSha256`、`baseTrunk:null`；运行时核心把 `src/provider/runtime/tools.ts` 补入 C1/S3 写集（计划枚举补登，由统筹 E1 披露）。本角色 Provider/Service/Pipeline 的类型消费以 C1 为准。
- **C2a（编排）**：`task-state` 白名单（17→27 类）/逐 kind 校验/`GOVERNANCE_CARD_KINDS` 白名单 → 先冻结事件形状，S3/S4 消费；校验消费 C1 常量。
- **C2b（门禁引擎）**：`versionedDocFreezeState`（生产唯一同步查询）、`versionedDocOverwriteDecision` 扩签名与 `operation`、R9 记录变体（`frozen`/`draft-updated`/`draft-marker`）+ latest-record-per-path、`appendDocFreezeRecords`、`stableWriteDecision`、冻结/许可快照 install/refresh、shell 输入扩展 → 与 **C2c** 联合冻结（联合测试通过才算冻结）；`checkVersionedDocWrite` 删除。
- **C2c（编排）**：`src/service/version-change/` 公共 API（VCA/冻结/迁移/bootstrap/stable-write/refactor）+ 与 C2b 联合契约测试；stable 许可 `approvedAt/expiresAt`、失败作废、pre-write/post-write 消费点。
- **C3（项目管理）**：`ui.versionChange.*`/`ui.refactor.*`/`ui.freeze.*`/`ui.stableWrite.*` 与旧文案迁移（本角色只消费 key，不硬编码文案）。

### 7.2 S1–S4 顺序（同角色串行）

`S1`：Provider（trunk + version-change 存储/缓存）→ `S2`：Service（trunk + version-change 含 stable-write 子服务）→ `S3`：`run-manifest`/`run-role` 调用点/`shell-post-audit`/`version-decision`/`task-state`（C2a 冻结后）→ `S4`：Pipeline 四句柄 + 公共句柄冻结。

### 7.3 交接（冻结后只消费）

- **D1（桌面窗口）**：消费 S4 句柄 + C1 事件 + C2b 判定；负责客户卡/通道/主权/`acknowledgments`/IPC/缓存预加载；stable workflow 卡与 appointment-write 钩子由 D1 接线，调用 `stable-write-runtime`。
- **U1（桌面UI）**：只消费 IPC/面板数据（版本变更、stable 确认/续接、重构面板、主干面板无 drift）。
- **T1/T2（测试）**：跨层集成/全量回归/真实 Electron；本角色交付 `test/编排` 证据与句柄。

### 7.4 B-12/B-13 裁决（条件项不触发）

[设计候选] **不触发 B-12/B-13**：stable-write Service 的职责（确认/许可/哈希/mini re-pin）与 B-7 的 VCA/冻结服务共享同一记录存储与 trunk 快照依赖，独立目录会引入第二套入口与重复生命周期；默认并入 `src/service/version-change/`（B-7）。桌面集成测试并入 B-10 `test/桌面应用/version-change.test.ts`（stable 场景作为该文件用例组）。若实施中发现 B-7 公共面无法承载（例如循环依赖或体积失控），**停止回报**按增补程序申请 B-12/B-13，不自行新建路径。

## 8. 风险与停止项

### 8.1 风险与控制

| ID | 风险 | 影响 | 控制 |
| --- | --- | --- | --- |
| R1 | R9 baseline 与 `doc-freezes` 缓存双源不一致 | 高：守卫放行冻结覆盖/误拒 draft | 唯一权威 R9；缓存只读重建；`reconcile` 以 baseline 为准并告警；C2b/C2c 联合测试 |
| R2 | 同步快照陈旧/不可用 | 高：冻结覆盖或全量误拒 | 会话/面板打开预加载；`doc.freeze` 后刷新；`unavailable`⇒fail-closed；恢复入口 |
| R3 | 迁移误判（历史/证据文档被解冻） | 高 | 一律默认冻结；migrated-draft 需证据；missing/corrupt 分离；AC-10 测试 |
| R4 | 批准前哈希重验的 TOCTOU | 高：批准内容被换 | 重验后在同一锁/流程内立即冻结目标；apply 再验；AC-26 故障注入 |
| R5 | apply-journal 分裂态 | 高：trunk 指针与 run manifest 不一致 | 内容匹配为主、phase 辅助；提交点唯一；reconcile 报告不自动修指针；AC-12 |
| R6 | stable 许可被重复使用/伪造/过期/失败后复用 | 高：未确认写入 | 一次性许可 + path/hash 绑定 + pre-write targetSha 判定 + post-write 复核后消费 + 失败作废（不可复用）+ fail-closed/恢复；AC-33–35 |
| R7 | mini re-pin 与写入不同步（崩溃窗口） | 中高：trunk 快照落后 | 写入校验通过才消费许可；`applyStableSnapshot`（workflow/roleCards/boundaries）幂等；启动 `reconcile` 从 stable-writes 记录补续接；无 trunk manifest 不写 `stable-repinned` 事件 |
| R8 | 旧 app 读新 `versions.jsonl` 记录 fail-closed | 中：升级期旧版本不可写版本化文档 | 属安全向；E1 披露；不静默改语义 |
| R9 | 冻结/迁移首次运行误锁未确认草稿 | 中：策划改稿被打断 | `migrated-draft` 证据口径（baseline `draft-marker`）+ 面板提示；仅可证明草稿可改 |
| R10 | T3 范围大/跨角色联调 | 中 | 契约先行（C1/C2a/C2b/C2c/C3）；S1–S4 串行；测试归属清晰 |
| R11 | `WriteGate` 无 `contentSha256` 上下文（shell/旧调用）导致 stable 判定不可实现 | 高：stable 写前判定退化 | C1 扩可选上下文（F6）；S3 对无上下文一律拒绝 stable 写入；运行时核心拒绝该落点时停止回报，不以写后验证替代写前判定 |
| R12 | 冻结同步快照双实现复发（F7） | 高：两套 Map/两套判定 | 快照唯一实现归 C2b；编排只调用 `versionedDocFreezeState`/install/refresh；联合测试锁定 |

### 8.2 停止项（必须回报，不自行处理）

1. 需要 B-1..B-11 之外的路径/模块根/角色/权限（含 B-12/B-13 触发）；
2. C2b 拒绝扩展 `versionedDocFreezeState`/R9 记录变体（`frozen`/`draft-updated`/`draft-marker` + latest-per-path）/`versionedDocOverwriteDecision`/`stableWriteDecision`/快照单一实现（无法在不双账本前提下落地）；
3. C1 冻结的事件/类型形状与本提案 §3 结构冲突（需返 C1 协调，不静默偏离）；
4. 发现 P1.6 原文歧义/自相矛盾（尤其 §9 澄清项被证实无法两全）；
5. 需要应用自动派发/自动写文档/绕过客户确认，或改变冻结/VCA/stable 语义；
6. 实现中发现现有写权/闸门/角色边界必须扩大；
7. 基线再次漂移或 B0 最终版本与本提案引用不一致（先回报再实施，B0 以 221 行 / `8c6272d5…` 为当前最终版）；
8. 运行时核心拒绝 `WriteGate` 可选内容哈希上下文（F6）且无等价「写前最终字节 hash」路径；
9. C1 未按 F2 冻结 `stable-write` app-owned 卡种与 `GOVERNANCE_CARD_KINDS` 白名单（导致 C2a/D1/U1 无法同一形状消费）。

## 9. 澄清项与裁决状态（C1/C2b/C2c 冻结前必须按同一形状执行）

> 处置来源：PM P1 审核 §4.1–§4.10/§5.2（`2cb04cae…`）。状态：**采纳**＝按本提案建议；**裁决**＝按审核另一种口径；**条件**＝在冻结点执行；如后续出现与下列裁决冲突的新事实，停止回报，不自行改口径。

| # | 原澄清项 | 审核处置（本提案执行口径） | 影响 |
| --- | --- | --- | --- |
| Q1 | R9 冻结记录形状（可选字段 vs 新 event） | **采纳 + 扩展**：追加 variant 记录 `event:"frozen"`（子形状 = C1 `DocFreezeRecord`，type-import）、`event:"draft-updated"`、`event:"draft-marker"`；**latest-record-per-path**；旧 app 读新 event 按 `baseline-corrupt` fail-closed（安全向，E1 披露） | C2b/C2c；AC-27 |
| Q2 | `migrated-draft` 标记存放 | **采纳**：baseline `draft-marker` 记录 + 证据；**不是 `DOC_FREEZE_REASONS`/`doc.freeze` reason**；`.ans/state/freeze-migrated.json`（若采用）仅迁移进度标记，不作第二权威 | 迁移语义；AC-10 |
| Q3 | 冻结记录写入者 | **采纳**：只经 C2b `appendDocFreezeRecords`（同 `versions.lock`/fencing）；B-6/B-7 不直接写 `versions.jsonl` | 模块归属；AC-27 |
| Q4 | `stableWriteDecision` 的 sha 时点/消费 | **采纳并细化**：`stableWriteDecision({projectRoot,relPath,sha256,permit,now})` 纯函数（不写盘/不消费/不发事件）；**pre-write 校验 targetSha；post-write `completeWrite(actualSha)` 复核后消费**；失败作废许可、不可复用 | C2b/C2c；AC-35 |
| Q5 | 许可有效期/消费点 | **裁决**：TTL 默认 30 分钟（常量、可测，C2c 定）；`approvedAt` 批准时刻、`expiresAt` 批准后必填、`consumedAt?`、`baseSha256=""`（新文件）；过期拒绝且不自动补发 | AC-33/35 |
| Q6 | trunk stable 快照字段 role-card | **采纳**：C1 补 `artifacts.roleCards?: Record<string, TrunkStableArtifactRef>` 并同步 `TrunkApplySnapshot`（AC-34 三类） | AC-34 |
| Q7 | `doc-freezes` 不可用时 draft 可用性 | **采纳**：快照 unknown/不可用一律 fail-closed（含 draft），面板提示恢复 | 安全；AC-21/27 |
| Q8 | VCA 并发/多实例 | **采纳**：单应用进程 + 进程内串行链 + 原子写；多实例需求出现即停止回报（可复用 `versions.lock` 口径） | AC-14 |
| Q9 | targets↔items 匹配键 | **采纳**：POSIX 相对路径精确匹配（去 `./`/反斜杠）、kind/roleId 精确、toSha256 全等；execution 明确 teamPlan/flow 两类路径；S2 文档化归一化 | AC-28/29/32 |
| Q10 | `version.change`/`trunk.state` 字段 | **裁决**：以 C1 冻结字段为准（`vcKind`/`stableKind`）；C2a 只做形状校验；`stable-repinned` 必含 path/oldSha/newSha/confirmationId/decisionId/trunkVersion（不变）；applied/superseded=application+decisionId | C2a；AC-31/34 |
| Q11 | `project-state` 投影 | **采纳**：不新增（D1/U1 用 `trunk:state`/相应 IPC）；若需另案为条件项 | 范围；AC-20/36 |
| Q12 | V1 哈希漂移 | **裁决**：以 350 行 / 归一化 `3c40acad…` 为当前 V1 v1.1；`75bf7a49…` 为旧快照，由沟通/统筹在 G2a/E1 更正；不据此改标准 | 文档一致性 |
| Q13 | G2a 副本差异 | **裁决**：以 25 行 / `bfac5781…` 补注版为准；沟通更正 V1 §1.1 的 16 行引用 | 文档一致性 |
| Q14 | bootstrap `TrunkAmendmentDoc.baseTrunk` 非空 vs P1.6 `baseTrunk:null`（F12） | **裁决**：C1 允许 `baseTrunk: TrunkVersionRef \| null`（C2c 亦可明确仅 version-upgrade bootstrap 并在错误码拒绝 detail bootstrap）；AC-25 按 P1.6 原文判定 | C1/C2c；AC-25 |
| Q15 | `WriteGate` 内容哈希落点（F6） | **裁决**：C1 扩可选 `(targetPath, context?: { contentSha256?; operation? })`；运行时核心 `tools.ts` 第二次 `govern` 传最终字节 sha；S3 run-role 对 stable 路径消费；无上下文（shell/opaque）⇒ stable 拒绝；**不得以写后验证替代写前判定**；运行时核心需把 `tools.ts` 补入 C1/S3 写集（计划枚举补登） | C1/S3；AC-33/35 |
| Q16 | stable workflow 卡种（F2） | **裁决**：新增 app-owned 卡种 `stable-write`（不进 `GOVERNANCE_CARD_GROUP`）；C1 加 `GOVERNANCE_CARD_KINDS` 白名单；C2a `isGovernanceCardKind` 改读该白名单；run-role 补 `CARD_KIND_ROUTE_HINTS` 一行；VCA 复用 `decision`+`application:true`+`flowId`，不新增 `version-change` 卡种 | C1/C2a/S3；AC-18/33 |
| Q17 | 错误码/字段名 | **裁决**：补 `vca-conflict`；`trunk-drift` 并入 `trunk-verify-failed`；pin 拒绝码 `versioned-doc-not-frozen`；事件字段 `vcKind`/`stableKind`；`DocFreezeRecord.applicationId` 对 `proposal-confirmed`/`intent-confirmed` 用合成值（不得空串） | C1/C2a；AC-15/31/34 |
| Q18 | 冻结同步快照单一实现（F7） | **裁决**：快照状态归 C2b `versionedDocFreezeState`/安装快照；编排**不自建第二份 Map、不直接读缓存文件**；只调用 install/refresh/query；快照不可用 fail-closed | C2b/S3；AC-15/27 |

## 10. 与项目规则的核对（P1 审核要求）

### 10.1 边界核对

- 本提案全部新增/修改路径落在 Section 1：`src/provider/trunk/`、`src/service/trunk/`、`src/provider/version-change/`、`src/service/version-change/`、四个 Pipeline 单文件、`src/common/编排/`、`test/编排/`、`角色卡/编排/docs/change/`；**无 B-1..B-11 之外的路径**。
- **不新增角色/不拆分/不合并/不改角色 id/能力描述/显示名**；`managedBy:"application-scheduler"` 是应用调度层语义，不是 runtime 角色。
- B-12/B-13 不触发（§7.4）；如实施证明必须触发，停止回报。

### 10.2 五层依赖

- Interface → Pipeline → Service → Provider；Model 共享；编排只经注入消费门禁引擎判定（`versionedDocFreezeState`/`versionedDocOverwriteDecision`/`stableWriteDecision`/R9 API），不 import `src/service/gate/**` 实现，不 import `src/common/runtime-core/**`；`shell-post-audit` 对门禁引擎的导入与既有先例一致（只读查询/纯判定）；**冻结同步快照不新增编排本地实现**（F7）。

### 10.3 写权/闸门/验收不变

- 不改任何角色写权/Section 1/预授权/禁写清单；`versioned-doc-guard` 只改「何时允许覆盖」，stable 写入新增一次性许可但**不扩写权**（convener workflow 写权保留、nominator appointment-write 语义不变）；WriteGate/shell 硬地板、D3、三道闸门、验收/证据规则不变。

### 10.4 测试与证据

- 新增测试全部在 `test/编排/`；不写其他角色测试目录；不弱化既有断言、不新增 skip；T3 全量与双端构建交测试角色统一执行；本角色交付 `test/编排` 证据与原始输出。

### 10.5 文档纪律

- 本文件只写本角色提案；不写产品代码/测试；不改其他角色文档/方案/复核/沟通/调度/验收；不 commit/push。

## 11. 声明

- 本文件为 **proposal-only**：未实施、未测试、未验收、未 commit/push；提交/合并/发布仍须客户另行授权。
- **Revision 1** 按 PM P1 审核（`2cb04cae…`，结论 `needs revision`）F3/F4/F5/F6/F7/F8/F11/F12 与非阻断项修订；本角色**不自行评审放行**，复审由项目管理按新版本/新哈希执行。
- 本提案引用 P1.6（1151 行 / `fccb1f54…` / `1e260646…`）、AC-1–AC-36、P1.6-G1–G11、增量 §5.4/§10.5；若 P1.6 后续核对发现语义冲突，按团队计划停止/回报，不以本提案替代契约。
- 实施中如发现代码事实与方案不符，按团队计划增量 §8/§5.5 披露并回报，不静默偏离；本提案不构成对新写权/新角色/新闸门的请求。
