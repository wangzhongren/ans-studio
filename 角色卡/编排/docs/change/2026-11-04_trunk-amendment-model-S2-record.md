# 编排 S2 实现记录：Service / 状态机（trunk + version-change 接线）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 2 **S2（Service/状态机）**。
- **日期 / 状态**：2026-11-04；**S2 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **实施契约基线**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**（1151 行 / `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`），§4.4–§4.8/§5.4/§5.5。
- **编排 P1 提案**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`（610 行 / `895fe6a90d42c328684244d926381dbc0f97a5df1642beef6b8578736d359c44`），§2.3/§2.4/§3.3/§3.4/§3.7/§4.5–§4.8。
- **PM 复审**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（`1a73ebc6…`，F13/F14/F16/F34）。
- **C2c 冻结**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-C2c-freeze.md`（`d0f4f974…`）；`src/service/version-change/abstract/version-change-service.ts`。
- **S1 记录（存储/Port）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-S1-record.md`。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **S2 trunk service 落地**：`src/service/trunk/`（abstract/public/impl，10 个新文件）实现唯一 pinned run 派生 v1（零写入）、verifyTrunk（pinned run/stable hash/roster/D3/R9）、apply-journal 两阶段提交（提交点 = trunk manifest 写成功）+ history 归档 + 内容对账、客户确认恢复 tN+1、stable mini re-pin、修正案解析/哈希定格/边界扩大/目标版本/生命周期映射；消费 S1 `TrunkStore`/`FreezeRegistryStore`，run manifest 只经既有只读 API；re-pin 写为注入 Port（S3）。
- **C2c Service 接到 S1 Provider Ports**：新增 `createVersionChangeIntegration`，组合 `createVersionChangeStore`/`createStableWriteStore`/`createStableWritePermitStore`/`createGuardFreezeRegistry`/`createFreezeCacheStore` + `createTrunkService` + S2 `ProjectHashPort`；`ProjectHashPort` 生产实现（canonical JSON 记录哈希）与迁移扫描/编排（`ensureMigration`）落地；**不改任何 C2c 公共契约形状**。
- **C15 修正（Service 写集内）**：`vca-service.apply` 对 `execution` target **跳过 guard 冻结**（C2b 只认版本化文档路径；execution 的冻结/re-pin 由 trunk manifest + verifyTrunk 保证）。这是 C2c 实现与 C15 裁决的接线修正，契约/状态机/错误码不变；既有 C2c 测试全绿。
- **C8 裁决（安全收窄）**：C1/C2b 冻结形状无 `removed`/`moved` 事件，S2 **不新增记录**；草稿删除/改名/移动后由 R9 `verifyVersionedDocBaselines` 如实报 `missing`（fail-closed），trunk `verify` 同理；不静默、不伪造事件（测试含真实基线证据）。
- **测试/类型检查**：S2 专项 **15 / 15 pass**；`test/编排` 全量 **861 tests / 860 pass / 1 fail（既有 Windows symlink EPERM）**；`npm run typecheck` **exit 0**。**未改断言、未新增 skip**。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/service/trunk/abstract/trunk-service.ts` | 新增 | 304 | `0f083ab005f7f7aed66b0f26b660b3e564901338e5632db7d8a98854117caec4` |
| 2 | `src/service/trunk/impl/trunk-common.ts` | 新增 | 162 | `efe0222ff3ea5e6c1f89e29743454c721e293e36176f5ff11d653d3fa0a87c85` |
| 3 | `src/service/trunk/impl/trunk-derive.ts` | 新增 | 215 | `897dd095d8bc0cfa57dbcd3349ae05e6e59471ce84cdc57bdf0ec370946c7d0d` |
| 4 | `src/service/trunk/impl/amendment-validate.ts` | 新增 | 333 | `7d943123779c4efd7511c748c81d617f0655a87ea4fb8a7ed1ad436725a38e63` |
| 5 | `src/service/trunk/impl/amendment-expansion.ts` | 新增 | 78 | `46c0f9f2ce382dc4cebabb9f0e86d1378136981a00bb9c668ba07caae3fa47b6` |
| 6 | `src/service/trunk/impl/trunk-verify.ts` | 新增 | 141 | `4fae7a52d654aa4db3debe5e59cd313b725f9671eec8d0734193974f1f16a68b` |
| 7 | `src/service/trunk/impl/apply-journal.ts` | 新增 | 522 | `4068fba8e91a86f2a12d2ef6db57fbb246cc07f0b0cdc96a9ed069f1b37ea00c` |
| 8 | `src/service/trunk/impl/stable-snapshot.ts` | 新增 | 93 | `4941bc59bea171dd52840bec41f6e5197cae6cb90aeaf5417429b73da1e83506` |
| 9 | `src/service/trunk/impl/trunk-recovery.ts` | 新增 | 88 | `bf2e9e00ef1b045549300655ec28a52aa5da76dd1280f263c8fd5350250b2b5d` |
| 10 | `src/service/trunk/public/trunk-service.ts` | 新增 | 252 | `eb20afddd9c1d8f622e8e48d973ca6c17c3d1cc2ad19314c207285122f8250c3` |
| 11 | `src/service/version-change/impl/project-hash-port.ts` | 新增 | 51 | `548e1634ebdb5fe8310b4d9d08d75a87484e41d7e4f71cc28599e46ea878b2f8` |
| 12 | `src/service/version-change/impl/freeze-migration.ts` | 新增 | 83 | `b49577b87f53759a8df9ce4b0b08b9426bcff77be558a07083b69859ee637619` |
| 13 | `src/service/version-change/public/version-change-integration.ts` | 新增 | 110 | `8fe466380c8005472efffce9fec077865581b88fd0530d0cab315cbbb7e250f1` |
| 14 | `src/service/version-change/impl/vca-service.ts` | 修改（C15 接线；契约不变） | 615 | `aa5da6c6fc81160fb90bffa69c8136e44044935c9837d2e2fba73cce16e5c496` |
| 15 | `test/编排/fixtures/trunk-project.ts` | 新增（夹具） | 339 | `e9c84ca9c1444dea9abbb3d7712329017205c7e72407add9691f70c269535844` |
| 16 | `test/编排/trunk-service.test.ts` | 新增 | 661 | `8d7245167d297480c57bf78bc8a85c9c09b994cb8084dc5d91af9e43f9bab1bc` |
| 17 | `test/编排/version-change-service-integration.test.ts` | 新增 | 511 | `9176324308421b96e5f58ce0277f1918eed451ae4456cc7f44d992426c68abca` |

**明确未改**：`src/model/**`（C1）、`src/common/门禁引擎/**`（C2b）、`src/provider/**`（S1）、`src/pipeline/**`、`src/common/编排/**`（S3）、`app/**`、其它角色测试/文档。`vca-service.ts` 的唯一改动是 C15 execution 冻结跳过（见 §四）。

## 三、trunk service 公共 API 与语义（P1 §2.3/§3.3）

- `status()`：frozen（落盘 manifest）/derived（唯一 pinned run，零写入）/unavailable（无/多 pinned、坏 manifest、roster 不可用）/apply-uncertain（未提交 journal）；含 frozen 文档清单、stable 快照、进行中修正案与 journal 摘要。
- `derive()`：`listRunManifestsResult` → 唯一 pinned → `verifyPinnedRun` → `loadPinnedRoster`；stable 哈希取磁盘；role-card/boundary 缺失记 issue（workflow 缺失不可派生）；manifest `trunkVersion:1`、`source:"adopted"`、不落盘。
- `verify()`：pinned run（`verifyPinnedRun`）+ stable 哈希 + roster/D3（D3 ⊆ roster/roles）+ R9 冻结（registry corrupt ⇒ violation；missing/migration-required 按 F29 既有文档默认冻结不误报；ready ⇒ 必须匹配冻结记录）；无 manifest 时校验派生视图；**不改指针、不恢复**。
- `validateAmendment()`：S2 文档化格式（YAML frontmatter，`schema: trunk-amendment/v1`，items = C1 形状）；校验 flow/版本/baseTrunk/bootstrap/item kind（contract/roster/execution；workflow/boundary 拒绝）/change/非空实际变更；`snapshotItemHashes` 计算 from（trunk/run 基线 ref 优先、磁盘兜底）与 to（当刻字节）。
- `selectTargetVersion()`：同路径族既有版本候选（0/1/多）；`detectBoundaryExpansion()`：复用门禁引擎 `boundary-yaml` 只读解析，旧/遗留 boundary item 的条目级覆盖判定（解析失败/不可读按扩大 fail-closed）。
- `recordAmendment()`/`readAmendment()`：`.ans/trunk/amendment.json`；状态转移表（draft→submitted/superseded、submitted→approved/rejected/superseded、approved→applied/superseded、rejected→superseded、applied/superseded 终态；同状态幂等）；**旧状态（proposed/confirmed/cancelled）不可写**，读侧映射由 C1 常量承载。
- `executeApply()`：journal（prepared）→ 可选 `RunRepinPort`（run-manifest-written）→ 旧 manifest history 归档 → **trunk manifest 写成功 = 提交点** → journal committed（仅审计）；目标内容以磁盘字节复核（内容匹配为主）；版本化文档必须已冻结（execution/stable 不查 guard，C15）；失败一律不改指针；幂等重放返回 `alreadyApplied`；返回 `TrunkStateAuditPayload`（op switched、decidedBy customer 当且仅当 decisionId）。
- `reconcileJournal()`：内容匹配判定实际阶段（journal.target vs trunk manifest / run manifest），phase 辅助；committed 返回补写事件载荷；两方向/相位滞后返回 split 并如实报告，不自动修指针；journal 损坏 ⇒ `trunk-journal-corrupt`。
- `recover()`：客户 decisionId 必须；registry corrupt ⇒ 拒绝（不自动重建）；内容缺省从唯一 pinned run 派生或取 journal.target；复用两阶段提交，新版本 tN+1、`source:"recovery"`、审计 `op:"recovered"` + reason；损坏 manifest 时以 journal 最后版本为 tN 提示。
- `applyStableSnapshot()`：workflow/roleCards[role]/boundaries[role] 快照更新；`oldSha` 必须与当前快照一致（新文件 "" 且无快照可新增）；**不升 trunkVersion**；无/坏 manifest、哈希不符 ⇒ `{applied:false,pendingReattach:true}`（不虚构/不发事件）；返回 `stable-repinned` 审计载荷（origin/decidedBy customer）。
- `current()`/`latestFrozenVersion()`：结构等价 C2c `TrunkBaselinePort`；digest 算法在 `trunk-common.computeTrunkDigest` 文档化（canonical JSON 的 sha256）。

## 四、S1 Provider 接线（C2c Service deps）与 C15/C8 裁决

| C2c deps | S2 接线 |
| --- | --- |
| `versionChanges` / `stableWrites` / `permits` | S1 `createVersionChangeStore` / `createStableWriteStore` / `createStableWritePermitStore`（permit 分表、installSnapshot → C2b） |
| `freezeRegistry` | S1 `createGuardFreezeRegistry`（C2b append/refresh；读侧投影，见 S1 记录） |
| `hashes` | S2 `createProjectHashPort`（文件字节/内容字节/canonical record JSON；算法文档化） |
| `trunk` | S2 `createTrunkService`（`current`/`latestFrozenVersion`/`applyStableSnapshot` 结构对齐；`completeWrite` 的 mini re-pin 走真实 trunk manifest） |
| `freezeCache` / 迁移 | S2 `createFreezeCacheStore` 接线 + `ensureMigration`/`scanExistingVersionedDocs`（missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；draft-marker 证据标记） |

- **C15（execution 不纳入 guard 冻结）**：`vca-service.apply` 只对 `contract`/`roster` applied 目标调用 `freezeMany`；`execution` 目标由 trunk manifest + verifyTrunk 保证。测试覆盖 detail 修正案（contract + execution target）：apply 返回 freeze 仅 contract，trunk manifest 记录 execution 哈希，审计/对账正常。
- **C8（草稿删除/改名/移动）**：C1 `DOC_FREEZE_BASELINE_EVENT_KINDS`/C2b `VersionBaselineEvent` 无 `removed`/`moved`；**不新增事件形状**（需改 C1/C2b，属停止项）。安全收窄证据：登记草稿后删除 → `verifyVersionedDocBaselines` 报 `missing`（fail-closed），基线无 `removed`/`moved` 记录；trunk `verify` 对 `pinned run` 缺失/漂移同样报 violation。**披露**：改名/移动等价于删除+新增，需重新登记（R9 latest-record-per-path），不伪造事件。
- **M5/S4 顺序**：detail 逐项 applied 的真实顺序 = 预冻结 applied 目标（`freeze.freezeMany`）→ `trunk.executeApply` → `vca.apply`（幂等复冻结 + 标记 applied）；测试按此顺序验证。若 executeApply 失败，VCA 仍未 applied（预冻结记录保留，可由下一轮重试复用）。

## 五、测试与类型检查原始结果

1. **S2 专项**：`node --test test/编排/trunk-service.test.ts test/编排/version-change-service-integration.test.ts`
   → **tests 15 / pass 15 / fail 0 / skipped 0**。
   - trunk：派生 v1（唯一/零写入/stable 磁盘哈希/derived 状态）、无/多 pinned/坏 manifest fail-closed、verify（ok、workflow 漂移、R9 not-frozen）、bootstrap t1 + 升级 t2（journal 两阶段/history/审计/re-pin、bootstrap 仅一次、哈希/base/未冻结失败不改指针）、reconcile（none/committed/相位滞后 split/phase 领先/内容未提交/corrupt）、recover（tN+1 source recovery、缺 decisionId、registry corrupt 拒绝）、mini re-pin（不升版本/旧哈希不符/无 manifest 待续接、role-card 更新）、修正案（解析/from-to 定格/目标版本/边界扩大/生命周期/非法 item）、apply-uncertain。
   - version-change 集成（真实 S1 存储 + C2b + trunk）：bootstrap version-upgrade VCA 全链路（create/submit/approve 冻结 → trunk t1 → apply；幂等；vca-pending）、detail-amendment（提交冻结修正案 → 批准 → 预冻结 → trunk t2 → apply；execution C15）、批准前哈希漂移（vca-hash-drift 不冻结保持 submitted）、stable-write（request/approve/completeWrite + mini re-pin 不升版本；失败作废许可）、迁移（missing ⇒ migrated-legacy、corrupt fail-closed、draft-marker）、refactor 机械写集 + C8 安全收窄。
2. **`test/编排` 全量**：`node --test "test/编排/**/*.test.ts"`
   → **tests 861 / pass 860 / fail 1 / skipped 0**。唯一失败为既有 Windows 符号链接 `EPERM`（`test/编排/shell-authorized-routine.test.ts:184`）；S1 基线 846 / 845 / 1，本节点 +15 tests 后 = 861 / 860 / 1。**未改断言、未新增 skip**。
3. **`npm run typecheck`**：`tsc --noEmit` **exit 0**。

## 六、遗留依赖与披露（不声称已完成）

1. **S3**：`src/common/编排/run-manifest.ts` 的 `repins`/`repinPinnedRun` 生产实现（S2 定义 `RunRepinPort`，测试用真实写 run manifest 的替身；trunk 对账已按内容读取 run manifest）；`run-role`/`shell-post-audit`/`task-state` 事件接线；`version-decision` 文案。
2. **S4**：`trunk-runtime`/`version-change-runtime`/`refactor-runtime`/`stable-write-runtime` 编排（发卡/重试/客户通道）；把 Service 返回的记录/事件载荷（`TrunkStateAuditPayload`/`StableRepinAuditPayload`/`DocFreezeRecordInput[]`/VCA record）写账本；reconcile 补写事件时用 VCA `applicationId` 解析 `decisionId`（S2 载荷不冒充客户）。
3. **D1**：VCA/stable-write/逐项确认卡、IPC、许可/冻结快照预加载（重启后 `permits.list()+installSnapshot()`、C2b `refreshVersionedDocFreezeSnapshot`）。
4. **迁移完成标记**：`migrationCompleted` 由 S4/S3 在 C2c 迁移成功后置 true（缺省 false = 安全向 migration-required）；缓存/快照随会话重启重建。
5. **C8**：安全收窄（不新增 removed/moved 记录）；若后续需要变更记录，须重开 C1/C2b 契约，属停止项。
6. **执行通道披露**：execution（teamPlan/flow）非 guard 冻结（C15）；stable 文件不走 VCA（stable 确认即写 + mini re-pin）。
7. **跨进程并发**：`.ans/state` 记录文件按 P1 冻结为进程内串行链；R9 由 C2b `versions.lock`/fencing 保证。

## 七、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅新增/修改 §二列出的 17 个文件（其中 `vca-service.ts` 为 C15 接线修正，C2c 公共契约不变）；未改 `src/model/**`、`src/common/门禁引擎/**`、`src/provider/**`、`src/pipeline/**`、`src/common/编排/**`、`app/**`、其它角色测试/文档、角色卡/边界/communication/acceptance/scheduling。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改 C1/C2b/S1 文件或新增 B-x，按停止项回报，不自行扩写集。
