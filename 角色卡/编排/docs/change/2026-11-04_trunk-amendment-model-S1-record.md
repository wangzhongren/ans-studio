# 编排 S1 实现记录：Provider 存储（trunk / version-change）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 2 **S1（Provider 存储）**。
- **日期 / 状态**：2026-11-04；**S1 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`。
- **编排 P1 提案（实现依据）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`（610 行 / `895fe6a90d42c328684244d926381dbc0f97a5df1642beef6b8578736d359c44`），§2.1/§2.2/§3.1/§3.2/§3.8/§4.1/§4.5。
- **PM 复审（F13/F14/F16/F34）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（`1a73ebc6…`）。
- **C2c 冻结（Port 形状）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-C2c-freeze.md`（`d0f4f974…`）；`src/service/version-change/abstract/version-change-service.ts`（521 行）。
- **C1 冻结（记录形状）**：`src/model/trunk.ts`（388 行）、`src/model/version-change.ts`（451 行）；C2b 冻结：`src/common/门禁引擎/versioned-doc-guard.ts`（R9 追加/快照/许可 API）。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。并行在树中的 C1/C2a/C2b/C3/其他角色改动不属本节点写集（见 §七）。

## 一、结论

- **S1 存储层落地**：`src/provider/trunk/`（manifest/amendment/apply-journal 原子读写、坏件判别、history 归档）与 `src/provider/version-change/`（VCA/重构/stable-write 记录、record/permit 分表、`doc-freezes` 派生缓存、R9 冻结注册表 C2b 适配）共 9 个新源文件；`src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/pipeline/**`、`app/**` **零改动**。
- **C2c Port 全部对齐**：`VersionChangeRepositoryPort` / `StableWriteRepositoryPort` / `StablePermitPort` / `FreezeRegistryPort` 均由 Provider 提供结构等价实现，测试内以类型断言固定（编译期 + 运行期烟测）；`FreezeRegistryPort` 追加/刷新映射 C2b `appendDocFreezeRecords`/`appendDocDraftMarkerRecords`/`refreshVersionedDocFreezeSnapshot`，**不复制 R9 锁/追加实现、不直写 `versions.jsonl`**。
- **F13 落地**：`StableWriteRecord` 与 `StableWritePermit` 分表（`stable-writes.json` / `stable-write-permits.json`），record 仅以 `permitId` 关联；无第三 permit 形状。
- **F34 落地**：`doc-freezes.json` = C2b 冻结同步快照（`doc-freezes/v1`）的持久化派生缓存，带 `baselineSha256` 对账；不一致以 baseline 为准重建并告警，缓存损坏 fail-closed，baseline corrupt/缺失不重写。
- **原子写/并发**：全部写入复用 `src/common/shared/atomic-write.ts`（同目录临时文件 + fsync + rename + Windows EPERM 有界重试，单一来源）；每个文件一条进程内串行链（写后读、并发写可复现）。
- **测试/类型检查**：本节点两个测试文件 **15 / 15 pass**；`test/编排` 全量 **846 tests / 845 pass / 1 fail（既有 Windows symlink EPERM，非本节点）**；`npm run typecheck` **exit 0**。**未改断言、未新增 skip**。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/provider/trunk/abstract/trunk-store.ts` | 新增（B-3） | 76 | `6da3fbd38a8fc68c88b0037f7e1c35b8e3a2a22bf777e8e30cab5a634a5f166c` |
| 2 | `src/provider/trunk/impl/fs-trunk-store.ts` | 新增（B-3） | 302 | `7ec9e9eb969aebdedad9877b4acbe5e3a7cb6f387bbd966da06493b50a5ba1d0` |
| 3 | `src/provider/trunk/public/trunk-store.ts` | 新增（B-3） | 19 | `d641fdf647b51ea00bb18d41bea5f607dd338a07f68ab872ad14736fbdbc3e68` |
| 4 | `src/provider/version-change/abstract/version-change-store.ts` | 新增（B-6） | 109 | `fcdaffff937e2639c622110785436d4d8963ea2864d88c16c16979fb9c621da7` |
| 5 | `src/provider/version-change/abstract/freeze-cache.ts` | 新增（B-6） | 93 | `668a6c5a313658b8fe6ffe94fee0f5ea6ccd58bf4b7b162a72edcf7b37ceafbe` |
| 6 | `src/provider/version-change/impl/fs-version-change-store.ts` | 新增（B-6） | 409 | `38dca7b53983caff7e3f174173bfc4c048e666253ab847027c40dfc930b65362` |
| 7 | `src/provider/version-change/impl/fs-freeze-cache.ts` | 新增（B-6） | 212 | `ca72a6db1f6b47b09d927a5ee1b3bc392274b367c547e2b74b1b1b22fe324b99` |
| 8 | `src/provider/version-change/impl/guard-freeze-registry.ts` | 新增（B-6） | 270 | `99eb9ef549a5ef487d3e6908b628a5820a08830b82f80a5f29b74d2850a560ec` |
| 9 | `src/provider/version-change/public/version-change-store.ts` | 新增（B-6） | 38 | `d8a1c43fdbb32a1cd5457ae3cfeb2ffcc0b5a9ea7f02557c8c913f08eb5c1aa5` |
| 10 | `test/编排/trunk-store.test.ts` | 新增（测试） | 237 | `1fdc4e61e55a0b522eb120cc642569a9402a026626a8faac3f3b6ed12605d92d` |
| 11 | `test/编排/version-change-store.test.ts` | 新增（测试） | 495 | `3cacd3b768fd63a84b0fce882736ec531cc8b73c89d95219e828c041b7fabadf` |

**明确未改**：`src/model/**`（C1）、`src/common/门禁引擎/**`（C2b）、`src/common/编排/task-state.ts`（C2a）、`src/service/**`（C2c）、`src/pipeline/**`、`src/common/shared/**`（C3）、`app/**`、其它角色测试/文档。Provider 只**消费** `src/common/shared/atomic-write.ts`、`src/common/门禁引擎/versioned-doc-guard.ts` 的既有导出。

## 三、存储布局（`.ans` app-only；角色不可写）

| 路径 | 内容 | 权威/派生 |
| --- | --- | --- |
| `.ans/trunk/manifest.json` | `TrunkManifest`（C1） | 当前主干基线 |
| `.ans/trunk/amendment.json` | `TrunkAmendmentState`（C1） | 进行中修正案状态 |
| `.ans/trunk/apply-journal.json` | `TrunkApplyJournal`（C1） | 提交日志（提交点 = manifest 写成功，S2 判定） |
| `.ans/trunk/history/manifest-v<N>.json` | 归档的 `TrunkManifest` | 不可变（同版本同内容幂等，不同内容拒绝） |
| `.ans/state/version-changes.json` | `VersionChangeRecord[]` | VCA 记录 |
| `.ans/state/refactor-requests.json` | `RefactorRequestRecord[]` | 重构申请记录 |
| `.ans/state/stable-writes.json` | `StableWriteRecord[]` | stable 写入记录（**不含 permit**） |
| `.ans/state/stable-write-permits.json` | `StableWritePermit[]` | 一次性许可（F13 与 record 分表） |
| `.ans/state/doc-freezes.json` | `VersionedDocFreezeSnapshot` | **派生缓存**（权威 = R9 `versions.jsonl`） |
| `.ans/state/versions.jsonl` | R9 baseline | **只经 C2b 读写**（本 Provider 不直写、不解析为权威） |

**写协议**：同目录临时文件 + `fsync` + `rename` 覆盖（`src/common/shared/atomic-write.ts`；Windows `EPERM/EBUSY/EACCES` 有界重试单一来源）；每文件一条进程内串行链（`serialize`），读写按调用顺序排队。跨进程语义：R9 由 C2b `versions.lock`/fencing 保证；`.ans/state` 记录文件按 P1 §2.2「进程内串行链」实现（应用单实例写者）。

**坏件语义**：读判别 `missing`/`corrupt`/`io`，不自动重建/覆盖；记录 `list()` 在 corrupt/io 时**抛错**（不静默当空，防丢记录/ID 复用），`insert`/`updateWithExpectedStatus` 返回 `{ok:false, code:"io"}` 且不改文件；未知字段保留（读回原样、更新以现有记录为基底合并）。

## 四、与 C2c 冻结 Port 的对齐

| C2c Port（`src/service/version-change/abstract`） | S1 Provider 实现 | 对齐方式 |
| --- | --- | --- |
| `VersionChangeRepositoryPort`（list/findById/findByFlow/insert/updateWithExpectedStatus） | `createVersionChangeStore(projectRoot)` | 方法名/入参/返回 `{ok}|{ok:false,code:"conflict"|"io"}` 结构一致；测试类型断言 |
| `StableWriteRepositoryPort` | `createStableWriteStore(projectRoot)` | 同上 |
| `StablePermitPort`（list/upsert/installSnapshot） | `createStableWritePermitStore(projectRoot, {installSnapshot?})` | `installSnapshot` 缺省调用 C2b `installStableWritePermitSnapshot`（同步许可快照单一实现） |
| `FreezeRegistryPort`（state/listFreezes/listDraftMarkers/appendDocFreezeRecords/appendDraftMarkers/refreshSnapshot） | `createGuardFreezeRegistry(projectRoot, {migrationCompleted?, refresh?, now?})` | 追加 → C2b `appendDocFreezeRecords`/`appendDocDraftMarkerRecords`（同锁/fencing）；状态/刷新 → C2b `refreshVersionedDocFreezeSnapshot`；`frozen-conflict` → `conflict`，其余失败 → `io` |
| `TrunkStore`（P1 §3.1；S2 `TrunkService` 消费） | `createFsTrunkStore(projectRoot)` | C1 类型 type-import；读 `missing/corrupt/io`、写 `invalid/io` 判别 |
| `DocFreezeCache`（P1 §2.2-5） | `createFreezeCacheStore(projectRoot, {migrationCompleted?, refresh?, now?})` | 缓存形状 = C2b `VersionedDocFreezeSnapshot`（`doc-freezes/v1`），不另造形状 |

**R9 读侧声明（披露）**：C2b 未导出 baseline 记录列表 API。`guard-freeze-registry.ts` 在 C2b 判定 baseline 非损坏后做**只读投影**（JSONL 行 → `DocFreezeRecordInput`/`DraftMarkerEntry`，latest-record-per-path；冻结子形状用 C2b 导出 `isValidDocFreezeRecord` 校验），不写盘、不做锁/迁移/追加语义，**不是第二权威**；若 C2b 后续导出读 API，可在不改 Service Port 的前提下替换。`migrationCompleted` 由注入决定（缺省 `false` = 安全向：migration-required 下既有文档按冻结处理，F29）。

## 五、测试与类型检查原始结果

1. **S1 专项**：`node --test test/编排/trunk-store.test.ts test/编排/version-change-store.test.ts`
   → **tests 15 / pass 15 / fail 0 / skipped 0 / exit 0**。
   覆盖：原子写（无临时残留）、manifest/amendment/journal 读写与结构校验、坏 JSON 不重建不覆盖、25 路并发写串行、history 归档/幂等/冲突/坏件跳过诊断；VCA/重构/stable 记录 CRUD、乐观并发、未知字段保留、坏件抛错、30 路并发、同主键并发唯一成功、record/permit 分表、许可 upsert/快照注入、缓存缺失重建/一致/陈旧重建/损坏 fail-closed/baseline corrupt/缺失、真实 C2b 集成（append → baseline → snapshot → frozen/draft、conflict、缓存对账）、C2c Port 类型对齐。
2. **`test/编排` 全量**：`node --test "test/编排/**/*.test.ts"`
   → **tests 846 / pass 845 / fail 1 / skipped 0**。唯一失败为 **既有** Windows 符号链接 `EPERM`（`test/编排/shell-authorized-routine.test.ts:184`，C2c 基线已记录同款失败）；C2c 基线 831 tests / 830 pass / 1 fail，本节点 +15 tests 后 = 846 / 845 / 1。**既有断言未改写、未新增 skip**。
3. **`npm run typecheck`**：`tsc --noEmit` **exit 0**（本节点开工前 HEAD+C1/C2 绿；最终实测绿）。

## 六、遗留依赖与披露（不声称已完成）

1. **S2（trunk service）**：消费 `TrunkStore` 实现派生/verify/apply-journal 两阶段/恢复/`applyStableSnapshot`；Provider 不判定状态、不写事件。`archiveHistory` 的调用时点由 S2 决定。
2. **S2/S3 注入**：`createVersionChangeService({ freezeRegistry: createGuardFreezeRegistry(...) })`；C2c 迁移完成后把 `migrationCompleted` 置 `true`（否则安全向 `missing`）。`createFreezeCacheStore` 同理。
3. **C2b 读 API 缺口**：见 §四披露；S1 的只读投影仅为过渡实现，不构成第二权威。
4. **S3/S4**：`stable-write` 的 `completeWrite` 消费 permit store + record store；启动/会话打开时用 `list()` + `installSnapshot()` 恢复 C2b 许可同步快照（快照在内存，进程重启需重装）；R9 冻结快照由 C2b 刷新安装。
5. **事件/账本**：全部 `version.change`/`doc.freeze`/`refactor.request`/`stable.write.*`/`trunk.state` 事件由 S2/S4 经 `task-state` 写入，Provider 只存储。
6. **C8（草稿删除/改名/移动的 R9 变更记录）**：C2b 交接遗留项，不属 S1；未扩 R9 事件形状。
7. **跨进程并发**：`.ans/state` JSON 文件按 P1 冻结为进程内串行链；若未来多实例并发写同一项目，需另立锁方案（当前不在范围）。
8. **`doc-freezes.json` 与 `doc-freezes/v1` 快照同形**：缓存文件可被 C2b `isValidFreezeSnapshot` 语义消费（但 guard 生产路径只读已安装快照，不读文件；F7 不变）。

## 七、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅新增 §二列出的 11 个文件；未改 `src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/pipeline/**`、`app/**`、`src/common/shared/**`、其它角色测试/文档、角色卡/边界/communication/acceptance/scheduling。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改 C1/C2b/C2c 文件或新增 B-x，按停止项回报，不自行扩写集。
