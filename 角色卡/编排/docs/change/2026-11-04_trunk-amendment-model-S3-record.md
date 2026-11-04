# 编排 S3 实现记录：守卫接线 / pin-repin / 文案迁移

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 2 **S3（守卫/接线/文案）**。
- **日期 / 状态**：2026-11-04；**S3 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **实施契约基线**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**（1151 行 / `fccb1f54…`），§3.7/§4.5/§4.6/§5.4/§5.5。
- **编排 P1 提案**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`（610 行 / `895fe6a9…`），§2.6-29…35、§3.6/§3.7/§3.8。
- **C1b/C1c 冻结**：`GOVERNANCE_CARD_KINDS`（8 项，含 app-owned `stable-write`）/ `GovernanceCardKind`；`WriteGate(path, context?: {contentSha256?, operation?})`（`src/model/runtime.ts`；`tools.ts` 第二调 gate 传最终字节 sha）。
- **C2b 冻结**：`versionedDocFreezeState` / `versionedDocOverwriteDecision`（frozen/operation/dest）/ `stableWriteDecision`（denied 携带 `writeDecision`）/ `appendDocFreezeRecords` / `refreshVersionedDocFreezeSnapshot`。
- **C2c/S2 冻结**：`src/service/version-change/**`、`src/provider/**`、`src/service/trunk/**`；S1/S2 记录见同目录。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **run-manifest**：新增 `RunRepinRecord`/`repins` 与 `repinPinnedRun`（同 runId、保留 `createdAt`/`runId`/`flowId`、内容 hash 磁盘重算、幂等 `alreadyApplied`、追加 `repins`）；`prepareRunPin`/`pinRun` 增加 pin 冻结校验（`versionedDocFreezeState` + `versionedDocOverwriteDecision({operation:"pin"|"repin"})`），首次 handoff 在写 run manifest 前先写 `handoff-pin-bootstrap` 冻结记录（origin application，不冒充客户）并刷新 C2b 快照；失败不改 run 指针。`verifyPinnedRun` **语义不变**（P1 §3.7 原文）。
- **迁移语义（F29）**：legacy baseline（无任何 `frozen`/`draft-marker` 记录）按「既有文档默认冻结」放行 pin；一旦出现冻结记录（C2c 迁移/首次 handoff bootstrap）⇒ 按 ready 严格判定，未冻结目标 ⇒ `versioned-doc-not-frozen` fail-closed。baseline corrupt ⇒ 快照 corrupt ⇒ 拒绝。
- **run-role gate（真实执行点，F16）**：
  - 版本化文档：`versionedDocFreezeState(projectRoot, rel, exists)` + `versionedDocOverwriteDecision({relPath, exists, frozen, operation: context.operation ?? "write"})`；denied ⇒ 返回 `allowed:false` + `allowedByRoot` 空集 + `code`/`rejection`（C2b 拒绝形状）。
  - stable 文件：注入 `stablePermitOf` 时消费 `WriteGateContext.contentSha256` 调 `stableWriteDecision`（denied ⇒ 直接返回 `decision.writeDecision`；allowed ⇒ 继续 `baseGate` 及其 `matchedEntry`）；无内容 hash/shell ⇒ 拒绝。**分阶段接线**：未注入 `stablePermitOf`（B-11/S4/D1 未接）时保留既有 appointment-write 确认制路径（客户确认后发行的 writeSet 仍由 baseGate 把关；不新增无确认直写），见 §五披露。
  - shell 写守卫与 shell-post-audit 注入同一同步冻结查询（C2b 快照唯一实现，不自建 Map）；shell/opaque 无内容 hash ⇒ stable 一律拒绝（C7，C2b 侧实现）。
- **task-state**：`isGovernanceCardKind` 改读 C1b `GOVERNANCE_CARD_KINDS`（判断分组键集 + app-owned `stable-write`）；未知 cardKind 仍坏行。C2a 事件校验不变。
- **shell-post-audit**：版本化变化按冻结状态分开——frozen 漂移/删除 ⇒ 越界；draft 原位改/新增版本 ⇒ **不误报**；删除已登记草稿 ⇒ 越界（C8 安全收窄，与 R9 verify missing 一致）；unknown/corrupt ⇒ fail-closed 越界。
- **文案迁移**：`version-decision` 的 `run-change-required` 消息、`mechanical-rejection` 的 `run-change-invalid`/`run-change-required` action 指向「版本变更申请」/「主干升级」；错误码/低层机制/审计语义不变。`project-state` 的同类提示不在本节点写集（记录为遗留，见 §六）。
- **测试/类型检查**：S3 专项 **31 / 31 pass**；`test/编排` 全量 **868 / 867 pass / 1 fail（既有 Windows symlink EPERM）**；`test/桌面应用` **562 / 562**；`test/测试` 2 个失败均为**跨节点既有分类**（1 个 Windows symlink EPERM；`D-04 撤除残留` 命中的是 C1/C2c/C3 新文件 `src/model/version-change.ts`、`src/service/version-change/**`、`en-US.ts` 的 `team-plan`/`docs/flows/` 词面，与 S3 改动文件无关）；`npm run typecheck` **exit 0**。未改断言、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/common/编排/run-manifest.ts` | 修改（S3：repins/repinPinnedRun/pin 冻结/bootstrap） | 1125 | `69d616742cab7d6b82190f89d24b5100bec79c7be572ae6c8c85f7c2914836d4` |
| 2 | `src/pipeline/orchestration/run-role.ts` | 修改（S3：版本化/stable 两条 gate 路径 + shell 注入） | 2582 | `9895502d27244182cd6852f4d7a59c3b29ec50c33491d735f2fd6d34c367a347` |
| 3 | `src/common/编排/task-state.ts` | 修改（S3：`GOVERNANCE_CARD_KINDS`） | 1218 | `76a742d0c490027e7b8499b316377a34fc800d8c268b3723ab6f6d68a953f78a` |
| 4 | `src/common/编排/shell-post-audit.ts` | 修改（S3：draft/frozen/unknown） | 331 | `1976b2466215977abb522e46875908ed8c1d40cae2e0df9f28002254b91e88cc` |
| 5 | `src/common/编排/version-decision.ts` | 修改（S3：文案迁移） | 514 | `133778f87f67b68c504959c4bf5735d39292caf05d6536be6ec6f7c2c1ae759f` |
| 6 | `src/common/编排/mechanical-rejection.ts` | 修改（S3：文案迁移） | 341 | `7c46dc88a1c9f154e1d198920479f5c542c8ccb7b0d04599d27574c0ab0ab9fa` |
| 7 | `test/编排/run-manifest.test.ts` | 更新（S3：pin/repin 冻结用例） | 433 | `feee17a4572585bb41eae722e98ead699d9f443c1bdd4799cbc76b5cf2f315d6` |
| 8 | `test/编排/task-state.test.ts` | 更新（stable-write cardKind 正/负例） | 594 | `b90deca363547b8e6b7ea6617a3cd3c95ed5f34819e7b25f15e35fbefa648c6f` |
| 9 | `test/编排/run-role-stable-write.test.ts` | 新增（gate 两路径矩阵） | 294 | `6a19cc547217538c0bda287d9334991d37e12f52413cc32ebf68952e15032eec` |
| 10 | `test/编排/fixtures/trunk-project.ts` | 更新（夹具：proposal→intent / architecture→proposal 版本链 + pin schema） | 340 | `85670205dfe24cd2ba36d998db6541497d19803c338e1e0a938a7027b465f86a` |
| 11 | `角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-S3-record.md` | 新增（本记录） | — | — |

**明确未改**：`src/model/**`（C1）、`src/common/门禁引擎/**`（C2b）、`src/service/**`（C2c/S2）、`src/provider/**`（S1；`tools.ts` 由 C1c 已改，本节点未动）、`app/**`、桌面测试、其它角色测试/文档。`test/编排/fixtures/trunk-project.ts` 为编排自有测试夹具（S2 建、S3 增补 pin 所需 frontmatter/版本链）。

## 三、接线点（逐条对应 P1 §2.6-29…35 / §3.7 / §3.8）

| 调用点 | 现状（S3 后） |
| --- | --- |
| `run-manifest.prepareRunPin` | 组装七类文档后，若注册表已初始化则做 pin 冻结预检（不写盘；`versioned-doc-not-frozen`） |
| `run-manifest.pinRun` | 首次 handoff（baseline+marker 缺失）先 `appendDocFreezeRecords(handoff-pin-bootstrap)` → `refreshVersionedDocFreezeSnapshot` → 严格 frozen 校验 → 写 manifest（提交点不变）；失败不改 pointer |
| `run-manifest.repinPinnedRun`（新） | pinned only；target 形状/磁盘 hash 重算；版本化 target 必须 frozen（`operation:"repin"`；execution 不查 guard，C15）；更新 refs + `repins`；幂等 |
| `run-manifest.verifyPinnedRun` | **不变**（P1 §3.7：语义不变；hash/schema/roster/D3 校验照旧） |
| `run-role.gate`（write/edit） | 版本化 → `versionedDocFreezeState`+`versionedDocOverwriteDecision`；stable → `stableWriteDecision`（contentSha256 + permit）；denied 映射见 §一 |
| `run-role` shell 写守卫 | `freezeStateOf`（C2b `versionedDocFreezeState`，exists 现算）与 `stablePermitOf` 注入 `evaluateShellWriteTargets`；shell stable 无内容 hash ⇒ C2b 拒绝 |
| `run-role` shell-post-audit | `freezeStateOf(rel, exists)` 注入 `createShellPostAudit`；版本化变化按冻结状态判定 |
| `task-state.isGovernanceCardKind` | 读 `GOVERNANCE_CARD_KINDS`（含 `stable-write`）；`GOVERNANCE_CARD_GROUP` 精确键集断言不变 |
| `CARD_KIND_ROUTE_HINTS` | 已含 `stable-write` route hint（C2c）；C1b 联合成员加入后类型等价，无需改（保持现有可选键交叉类型） |
| `version-decision` / `mechanical-rejection` | UI 入口文案迁移（错误码/审计/低层调用不变） |

## 四、C8 / C15 相关

- **C8（草稿删除/改名/移动）**：S2 已裁决不新增 `removed`/`moved` R9 事件（C1/C2b 冻结形状）；S3 在 shell-post-audit 对「已登记草稿删除」记为越界（fail-closed），与 `verifyVersionedDocBaselines` 的 `missing` 一致——不静默、不伪造记录。
- **C15（execution 不纳入 guard 冻结）**：run-manifest 的 pin/repin 冻结检查只覆盖 `isVersionedDocPath`（intent/proposal/modules/roster/topology/architecture/assets）；teamPlan/flow 仅做磁盘 hash 重算与 manifest 记录；S2 trunk service 的 apply 冻结校验同口径。

## 五、分阶段接线披露（stable gate）

- `stableWriteDecision` 要求 `permit` 对象；C2b 未导出同步许可查询（快照为模块私有）。S3 在 `openRoleSession` 输入新增可选 `stablePermitOf?: (relPath) => StableWritePermit | undefined`（非第二份 Map；由宿主在许可签发/消费后安装 C2b 快照并注入同一查询）。
- **注入时**：stable 路径严格一次性许可判定（无/伪造/过期/哈希不符/无上下文全部 fail-closed；denied 返回 C2b `writeDecision`）。本节点测试覆盖 allowed/denied 映射。
- **未注入时**（当前桌面 appointment-write 旧链路 / B-11 未接）：保留既有确认制写权路径（Section 1 预授权或客户确认发行 writeSet，仍经 baseGate）；这不是新的无确认写路径，但也不校验 stable 一次性许可。**S4/D1（B-11 stable-write-runtime）接线时必须注入 `stablePermitOf` 并安装许可快照**，届时严格判定全量生效；若需 C2b 导出同步查询 API，属跨节点停止项。

## 六、测试与类型检查原始结果

1. **S3 专项**：`node --test test/编排/run-manifest.test.ts test/编排/task-state.test.ts test/编排/run-role-stable-write.test.ts` → **tests 31 / pass 31 / fail 0 / skipped 0**。
   - run-manifest：首次 handoff bootstrap 冻结 + pin；幂等；repin 追加 `repins`/保留 createdAt/runId/flowId/幂等；未冻结 ⇒ `versioned-doc-not-frozen`；hash 不符 ⇒ `run-pin-hash-mismatch`；legacy baseline（无冻结记录）默认冻结允许 pin 且不写 bootstrap；baseline corrupt ⇒ pin 拒绝且 run 指针不变；ready 语义下 prepare 拒绝未冻结最新文档。
   - task-state：`cardKind:"stable-write"` 记账通过；未知卡种仍坏行。
   - run-role：stable 许可 allowed（matchedEntry 来自 baseGate）/hash 不符/无上下文/无许可/过期；版本化 frozen 拒绝（code/rejection/allowedByRoot 空集）、draft 原位改/新版本允许、unknown fail-closed；未注入 `stablePermitOf` 时既有确认制路径照旧。
2. **`test/编排` 全量**：**868 / 867 pass / 1 fail / 0 skipped**；唯一失败为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts`）。S2 基线 861/860/1，+7 S3 测试 = 868/867/1。
3. **`test/桌面应用`**：**562 / 562 pass**（含 run-pin/run-change/acceptance/rejection 文案等；未改桌面测试）。
4. **`test/测试`**（跨节点既有分类，非 S3 引入）：2 fail——
   - `g4-skill-verify/b-render-double-check.test.ts`「读取器入参防御」：Windows symlink `EPERM`（与本特性既有同类失败）；
   - `entry-role-minimal-d.test.ts` D-04「撤除残留」：命中 `src/model/version-change.ts`、`src/service/version-change/impl/{refactor-validate,targets-items}.ts`、`src/common/shared/i18n/messages/en-US.ts` 的 `team-plan`/`docs/flows/` 词面（C1/C2c/C3 新增内容；S3 改动文件零命中）。属跨节点测试词面与新契约的冲突，需对应角色/测试维护者裁决，不属本节点写集。
5. **`npm run typecheck`**：`tsc --noEmit` **exit 0**。

## 七、遗留依赖与披露

1. **S4/D1（B-11 stable-write-runtime）**：注入 `stablePermitOf` + 安装 C2b 许可快照；`completeWrite(actualSha)` 消费许可 + mini re-pin；TKV 卡/事件。接线后 stable gate 严格判定全量生效（§五）。
2. **S4**：`trunk-runtime`/`version-change-runtime` 使用 `repinPinnedRun`（S2 `RunRepinPort` 生产实现）；事件落账；`present()` 重发卡。
3. **C2b 同步许可查询**：若生产需要把 `stablePermitOf` 直接绑定 C2b 快照（而非宿主注入），需 C2b 导出只读查询（跨节点停止项）。
4. **project-state 文案**：`project-state.ts:719` 仍有「先走 run-change/人工核对」字样；不在本节点写集（S3 写集未含），记录为遗留文案项。
5. **D-04 撤除残留**：`test/测试` 与新契约词面冲突（§六-4），交对应测试/角色裁决；本节点不修改其它角色测试。
6. **`RunRepinRecord` 持久化**：`repins` 为加法字段，旧读者忽略；S2/S4 的事件载荷仍以 `trunk.state(switched)` 审计为准。

## 八、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅改 §二列出的文件；未改 `src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/provider/**`、`app/**`、桌面测试、其它角色测试/文档、角色卡/边界/communication/acceptance/scheduling。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改 C1/C2b/C2c/S1/S2 文件或新增 B-x，按停止项回报，不自行扩写集。
