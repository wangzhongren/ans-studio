# 编排 S4 实现记录：Pipeline 句柄（trunk / version-change / refactor / stable-write）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 2 **S4（Pipeline 句柄）**。
- **日期 / 状态**：2026-11-05；**S4 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **实施契约基线**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**（1151 行 / `fccb1f54…`），§4.4/§4.5/§4.5.1/§4.7/§4.8/§4.9/§4.10；§5.5 事件归属。
- **编排 P1 提案**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`（610 行 / `895fe6a9…`），§2.5-25…28、§3.5。
- **前置节点**：S1（Provider 存储）/S2（Service）/S3（守卫与 pin/re-pin）记录见同目录；C1/C2b/C2c 冻结契约未改。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **四个 Pipeline 公共句柄落地**（均为每会话/每面板一份；不持写权、不派角色、不写项目文档、不直接落盘账本）：
  - `createTrunkRuntime(deps)`（B-2）：status/reconcile、bootstrap、applyApproved（VCA upgrade/detail）、主干升级（**收窄 emergency/recovery + 客户 decisionId + 高危二次确认**，拒绝版本化文档/execution 变更）、恢复（客户确认 tN+1）、stable mini re-pin（不升 trunkVersion）；导出 `createRunRepinPort(projectRoot)` 作为 S3 `repinPinnedRun` 的生产 `RunRepinPort` 适配。
  - `createVersionChangeRuntime(deps)`（B-8）：submit（create+submit → `version.change(submitted)` + 提交冻结 `doc.freeze` + 通知）、present（客户卡；无通道 ⇒ `vca-channel-unavailable`，保持 submitted）、approve/reject（客户本人；哈希重验由 S2 保证）、version-upgrade 单次（冻结 → trunk apply/re-pin → `vca.apply` → applied 事件）、detail 逐项卡（`runAmendmentItems` + `applyAmendmentItems`：item-apply/item-keep/item-cancel-amendment + acknowledgments；只冻结 applied 项、C15 execution 跳过 guard）、bootstrap。
  - `createRefactorRuntime(deps)`（B-9）：convener 发起 → S2 校验（flow/scope/机械写集）→ S1 记录 + `refactor.request` 事件（application、无 decidedBy、`managedBy:"application-scheduler"`）；越界拒绝并提示 VCA/stable；客户只读；不产生 trunk 版本。
  - `createStableWriteRuntime(deps)`（B-11）：workflow 轻量确认卡（preview：path/base/target sha256 + diff）、appointment-write 钩子、许可签发/安装（C2b 快照由 S2 approve 安装）、`stablePermitOf` 候选注入、`completeWrite(actualSha)` 复核/消费/mini re-pin（不升 trunkVersion）+ `stable.write.*`/`trunk.state(stable-repinned)` 事件、失败作废（不可复用）、无 manifest 待续接、无 drift。
- **事件归属**（只经注入 `emitEvent`；生产 = `appendTaskEvent(projectRoot, event)`）：
  - `version.change`：submitted/applied/superseded application（applied/superseded 带 decisionId，不冒充 customer）；approved/rejected customer + decisionId。
  - `doc.freeze`：按冻结记录 reason/origin/decidedBy 原样镜像（提交/迁移/bootstrap application；客户确认类 customer）。
  - `trunk.state`：switched/recovered/stable-repinned 均由客户 decisionId/confirmationId 绑定 ⇒ origin/decidedBy customer；reconcile 补写仅在内容已过提交点且 phase 滞后（携带 journalId 供幂等）。
  - `trunk.amendment`：逐项 applied/kept/cancelled customer + decisionId；生命周期 applied/applyState application，不记 customer。
  - `refactor.request`：application、无 decidedBy、无批准卡字段。
- **测试/类型检查**：S4 专项 **21 / 21 pass**；`test/编排` 全量 **889 / 888 pass / 1 fail（既有 Windows symlink EPERM）**；`test/桌面应用` **562 / 562**；`npm run typecheck` **exit 0**。未改断言、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/pipeline/orchestration/trunk-runtime.ts` | 新增（B-2） | 312 | `fa1ffce378d9f25f8cdab5fd5b3dcbdc7a4cbf8d2e75b1562a9ca5d1db014fbc` |
| 2 | `src/pipeline/orchestration/version-change-runtime.ts` | 新增（B-8） | 664 | `f49e4abb4048eba581f37a81728a52dcf35166e74fd5292d7f563046d8a58ae4` |
| 3 | `src/pipeline/orchestration/refactor-runtime.ts` | 新增（B-9） | 151 | `57febf9990d6358897f9400cbda42282eee98c74e976a1c3b276076464e86c80` |
| 4 | `src/pipeline/orchestration/stable-write-runtime.ts` | 新增（B-11） | 323 | `49f778a8334671d61a37e53663b8f1003b0fdec156448a7fdf6d835590eb8560` |
| 5 | `test/编排/trunk-runtime.test.ts` | 新增 | 366 | `8cc67b34731e08e645fc8ce109b1d7d8672f3cc9065fe1ae528dd897e20cf803` |
| 6 | `test/编排/version-change-runtime.test.ts` | 新增 | 427 | `26ee14bc18460e5ad7d020b099eb5838d1fac0cc71762da45bd64f188624ad61` |
| 7 | `test/编排/refactor-runtime.test.ts` | 新增 | 150 | `b50a50335d8ab536aea325fb606de3e194140b1dc34edb6e047c09454dffcafd` |
| 8 | `test/编排/stable-write-runtime.test.ts` | 新增 | 275 | `d77fbcb784789519f494da0c7e2e5a2f31b5cb5df78b459931b6c291228550ee` |
| 9 | `角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-S4-record.md` | 新增（本记录） | — | — |

**明确未改**：`src/model/**`（C1）、`src/common/门禁引擎/**`（C2b）、`src/service/**`（C2c/S2）、`src/provider/**`（S1）、`src/common/编排/**`（S3）、`app/**`、桌面测试、其它角色测试/文档。

## 三、公共句柄与注入 Port

| 句柄 | 关键方法 | 注入依赖 |
| --- | --- | --- |
| `createTrunkRuntime` | `status`/`reconcile`/`bootstrap`/`applyApproved`/`mainUpgrade`/`recover`/`completeStableWrite` | `projectRoot`、S2 `TrunkService`、`emitEvent`、`now`、`log`；导出 `createRunRepinPort`（S3 `repinPinnedRun`） |
| `createVersionChangeRuntime` | `submit`/`present`/`approve`/`reject`/`runAmendmentItems`/`applyAmendmentItems`/`list` | S2 `VersionChangeServices` + `TrunkService`、S4 `trunkRuntime`（apply/bootstrap）、`emitEvent`、`presenter?`（VCA 卡/逐项卡）、`notify?`、`now` |
| `createRefactorRuntime` | `submit`/`list`/`close` | S1 `RefactorRequestStore`、S2 `RefactorValidator`、`emitEvent`、`flowExists?`、`allowedModuleRoots?`、`now` |
| `createStableWriteRuntime` | `requestWorkflowWrite`/`settle`/`onAppointmentWriteApproved`/`completeWrite`/`fail`/`stablePermitOf`/`list` | S2 `StableWriteService`、S4 `trunkRuntime.completeStableWrite`、`emitEvent`、`presenter?`（workflow 卡）、`notify?`、`now` |

- **卡/通知 Port**：`VersionChangePresenter`（`presentVersionChange` + 可选 `presentAmendmentItem`）、`StableWritePresenter.presentWorkflowWrite`；D1 后续以 IPC/UI 实现（客户本人；judge/委托/指令结构性排除）。无 presenter ≠ 伪造决定：VCA 保持 submitted、stable 只记录请求。
- **`stablePermitOf`**：stable-write-runtime 缓存最近签发且未消费的**候选 permit 对象**（按 path），供 run-role `stableWriteDecision` 注入；C2b 同步许可快照仍是唯一判定权威（一次性/过期/逐字段一致性由 `stableWriteDecision` 校验；F7 的同步快照不自建第二份）。

## 四、事件与审计归属（P1.6 §5.5 / AC-31）

| 事件 | 何时写 | 归属 |
| --- | --- | --- |
| `version.change(submitted)` | VCA submit 成功（仅 draft→submitted 迁移；幂等不重复） | application（decidedBy 缺省） |
| `version.change(approved/rejected)` | S2 approve/reject 成功（客户 decisionId） | customer |
| `version.change(applied)` | trunk apply + `vca.apply` 成功 | application + decisionId（不冒充 customer） |
| `doc.freeze` | submit（修正案冻结）/approve（upgrade 目标）/apply（detail applied 项） | 按冻结记录 reason/origin（F35） |
| `trunk.state(switched)` | bootstrap/upgrade/detail apply 成功 | customer（decisionId） |
| `trunk.state(recovered)` | 客户确认恢复成功 | customer（decisionId + reason） |
| `trunk.state(stable-repinned)` | `completeWrite` 且 mini re-pin 成功（有 manifest） | customer（decisionId/confirmationId；trunkVersion 不变） |
| `trunk.amendment` | detail 逐项结果 + 生命周期 applied | 逐项 customer + decisionId；生命周期 application |
| `refactor.request` | submit/状态流转 | application、无 decidedBy、无批准卡 |
| `stable.write.*` | requested/approved/rejected/written/failed | requested/written/failed application；approved/rejected customer + decisionId/confirmationId |

- **失败路径**：VCA approve 失败（含 `vca-hash-drift`）不冻结/不 re-pin、不写 approved/applied 事件；trunk apply 失败不改指针、不写 switched；stable completeWrite 失败 ⇒ `stable.write.failed`、许可作废、不写 stable-repinned；reconcile 只对「内容已过提交点且 phase 滞后」补写事件（载荷含 journalId，消费方按 journalId 幂等）。

## 五、D1 接线清单（后续节点，不在本节点实现）

1. 以真实 `appendTaskEvent(projectRoot, event)` 注入四个句柄的 `emitEvent`；通知注入系统行/幕僚转发。
2. VCA 卡：`presentVersionChange`（application-owned decision 卡；approve/reject 选项、推荐 reject；显示 kind/initiator/targets/sha/diff/summary；客户本人）；detail 逐项卡 `presentAmendmentItem`（`item-apply`/`item-keep`/`item-cancel-amendment` + 边界扩大 acknowledgments）；重发卡 = `present()`（仅 submitted）。
3. stable workflow 卡：app-owned `stable-write` 卡（preview path/base/target/diff；恰一推荐项、≥2 选项；C1b 白名单）；role-card/boundary 沿用 appointment-write 卡，确认后调用 `onAppointmentWriteApproved`。
4. 许可：`settle` 成功后把 `stablePermitOf` 注入 `openRoleSession`（S3 run-role）；重启后由 D1/S4 调 `services.stableWrite.findPermit`/permit 列表 + `installStableWritePermitSnapshot` 重建 C2b 快照，再 `sync` 候选（本节点候选缓存只在进程内）。
5. 冻结/迁移：启动/会话打开 `integration.ensureMigration` + C2b `refreshVersionedDocFreezeSnapshot`；`migrationCompleted` 置 true。
6. IPC/面板：`version-change:*`/`stable-write:*`/`refactor:*`/`trunk:*`（trunk 面板只读 `status()`/`reconcile()` 结果；恢复/主干升级仅客户确认路径）。

## 六、测试与类型检查原始结果

1. **S4 专项**：`node --test test/编排/trunk-runtime.test.ts test/编排/version-change-runtime.test.ts test/编排/refactor-runtime.test.ts test/编排/stable-write-runtime.test.ts` → **tests 21 / pass 21 / fail 0 / skipped 0**。
   - trunk-runtime：status/reconcile（none）、bootstrap t1 + customer 事件、upgrade applyApproved（S3 真实 re-pin + verify 一致）、主干升级收窄（高危急/拒绝版本化文档/stable re-pin allowed）、mini re-pin 不升版本 + 无 manifest 待续接、恢复 tN+1、split 补写事件。
   - version-change-runtime：bootstrap upgrade（submit/present/approve/apply 全链路 + 事件序列 + 通知）、既有 trunk upgrade t2、detail 逐项（apply/keep + 预冻结 + trunk t2 + trunk.amendment/version.change 事件）、无卡通道 submitted 可重试、批准前 hash 漂移（vca-hash-drift、指针不变）、拒绝 customer 事件。
   - refactor-runtime：convener 发起 + 机械写集 + 事件无 decidedBy、非 convener 拒绝、越界拒绝并提示 VCA/stable、flow 缺失、状态流转/重复 requestId。
   - stable-write-runtime：workflow 卡 preview + permit 安装 + `stablePermitOf` + completeWrite mini re-pin（不升版本）、失败作废、无卡通道 fail-closed、appointment-write 钩子、无 manifest 待续接。
2. **`test/编排` 全量**：**889 / 888 pass / 1 fail / 0 skipped**；唯一失败为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts`）。S3 基线 868/867/1，+21 S4 测试 = 889/888/1。
3. **`test/桌面应用`**：**562 / 562 pass**（未改桌面测试）。
4. **`test/测试`（跨节点既有分类，非 S4 引入）**：两处失败同 S3 记录——① Windows symlink `EPERM`（g4 读取器防御）；② D-04「撤除残留」命中 C1/C2c/C3 新契约文件词面（S4 文件零命中）。交对应测试/角色裁决。
5. **`npm run typecheck`**：`tsc --noEmit` **exit 0**。

## 七、遗留与披露

1. **D1**：卡/IPC/面板/许可快照重建/迁移标记（§五）；`app/**` 不在本节点写集。
2. **生产组合**：把 S1 存储 + S2 services/store + S4 四句柄接进桌面会话（`createVersionChangeIntegration` 已提供 S1/S2 组合；S4 句柄为纯注入）。
3. **`stablePermitOf` 候选缓存**：进程内；重启后由 D1 重新安装/同步（C2b 快照权威不变）。
4. **`project-state.ts:719`** 仍有 run-change 字样（S3 已记录，不在写集）。
5. **`test/测试` D-04 词面冲突**：需对应测试/角色裁决（非本节点）。
6. **`item-cancel-amendment`**：S2 `VersionChangeService` 无 approved→superseded 公开方法；本节点返回 `vca-apply-failed`（保持 approved，不改 trunk）并披露；如需取消落账/状态迁移，属 S2 契约追加（跨节点停止项）。
7. **detail 逐项确认边界扩大 acknowledgments**：本节点原样回传/记录在 `ItemDecision`，未写入账本字段（C1 `trunk.amendment` 无 acknowledgments 字段）；UI 侧展示与勾选由 D1 承载。

## 八、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅新增 §二列出的文件；未改 `src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/provider/**`、`src/common/编排/**`、`app/**`、桌面测试、其它角色测试/文档、角色卡/边界/communication/acceptance/scheduling。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改冻结契约/服务/守卫或新增 B-x，按停止项回报，不自行扩写集。
