# 编排 C2c 契约冻结记录：冻结 / VCA / stable-write / 轻量重构 Service

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 1 **C2c（冻结/VCA/stable-write Service 契约冻结）**。
- **日期 / 状态**：2026-11-04；**C2c 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / 实际字节 SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` / 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`。
- **编排 P1 提案（实现依据）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-P1.md`（610 行 / `895fe6a90d42c328684244d926381dbc0f97a5df1642beef6b8578736d359c44`），§2.4/§3.4/§3.8/§4.3–§4.8/§7.4。
- **PM 复审（F13/F14/F16 冻结条件）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（451 行 / `1a73ebc6…`），复审结论 `recommend approval（附冻结条件）`。
- **C1 冻结（形状单一来源）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md`；`src/model/trunk.ts`、`src/model/version-change.ts`、`src/model/runtime.ts` 加法。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。并行在树中的 C1/C2a/C2b/C3 改动不属本节点写集（见 §九 计数说明）。

## 一、结论

- **C2c 冻结通过（本节点写集）**：`src/service/version-change/`（B-7；stable-write 子服务按 P1 §7.4 并入，**B-12 未触发**）冻结 VCA 状态机、冻结服务、stable-write 服务、轻量重构校验的公共 API 与错误语义；`npm run typecheck` **exit 0**；新增 **23** 个测试全部通过；`test/编排` 全量 **831 / 830 pass / 1 fail（既有 Windows symlink EPERM）/ 0 skipped**。
- **F13 已关闭（C2c 侧）**：`PermitFact = StableWritePermit`（C1 唯一 permit 形状的**别名**）；无第二套 permit/status；`StableWriteRecord` 与 permit 分表（record 按 `permitId` 关联、不内嵌）；`stable-writes.json` 记录侧只镜像 `permitId/approvedAt/expiresAt/consumedAt`。门禁 C2b 已冻结的 `StableWritePermitView` 经实测为 **C1 `StableWritePermit` 的类型别名**（`versioned-doc-guard.ts:984`），与本节点一致。
- **F14 已关闭（C1 侧落地，C2c 消费）**：`StableWriteEvent` 含可选 `approvedAt?/expiresAt?/consumedAt?`；本 Service 未要求 C2a 校验 C1 未定义字段。
- **F16 已关闭（契约层）**：本 Service **不写盘、不自带 fs**；stable 写入真实执行点 = 编排 S3 `run-role.gate`（pre-write，消费 C1 `WriteGateContext.contentSha256` + C2b `stableWriteDecision`）+ B-11 `completeWrite(actualSha)`（post-write 复核消费 + mini re-pin）；桌面窗口只发行 writeSet/呈现确认卡（D1 无直接写盘）。测试断言 Service 面仅有 `request/approve/reject/completeWrite/fail/findPermit/list`，无任何写盘方法。
- **C2b/C2c 联合契约已用 C2b 冻结实现验证**：C2c 冻结记录直接经 `appendDocFreezeRecords` / `appendDocDraftMarkerRecords` 写入 R9 baseline，经 `refreshVersionedDocFreezeSnapshot` / `versionedDocFreezeState` 得到一致的 `frozen/draft/unknown`；C2c 一次性许可经 `installStableWritePermitSnapshot` + `stableWriteDecision` 判定（allowed / hash-mismatch / expired / path-mismatch / consumed / 无快照 fail-closed）。
- **run-role 接线（最小）**：`CARD_KIND_ROUTE_HINTS` 已含 `"stable-write"` route hint（应用自有卡；进入判断/代选被结构排除）；为保持 `npm run typecheck` 绿，键类型暂以可选键交集兼容（`GovernanceCardKind` 联合成员由 C1b 追加，加入后无需再改本文件）——如实披露，见 §八。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/service/version-change/abstract/version-change-service.ts` | 新增 | 521 | `4e92746c74a28931e0c2f30d37d4fce638a5c2e553fa290cb1939add9373e719` |
| 2 | `src/service/version-change/impl/targets-items.ts` | 新增 | 172 | `a376318691d9a7855888f4d402cd3d3ac8a67593cb4f879a9390ea0d4190af19` |
| 3 | `src/service/version-change/impl/freeze-service.ts` | 新增 | 441 | `e808a58f54eae554bb8e521e9e9dcef79bdcdd1ccadc8f4f3d5e1913cbd43ba3` |
| 4 | `src/service/version-change/impl/vca-service.ts` | 新增 | 612 | `815d229ec570a35be605027ce91f71008c1311de9a79072d4e2ef5a100b2ecc8` |
| 5 | `src/service/version-change/impl/stable-write-service.ts` | 新增 | 381 | `2d1c13cf13409a71150657757b9bcce83c9d9424342e099e4b67c79f8e9e850a` |
| 6 | `src/service/version-change/impl/refactor-validate.ts` | 新增 | 210 | `573f66716df965838015ea5ab36e733d9243befabb1464d15b4274ed7a4b70d1` |
| 7 | `src/service/version-change/public/version-change-service.ts` | 新增 | 129 | `18f117ac135a30efc69a237f41d3a8a1e3c7f088eea6051f2d993b91bcb7f4b3` |
| 8 | `src/pipeline/orchestration/run-role.ts` | 加法 | 2516 | `93b78f09e08a7a4122b420a6bcdcb6e05000f96b802ffd77edc096f02810777b` |
| 9 | `test/编排/fixtures/version-change-service-fixture.ts` | 新增（夹具） | 395 | `eff056da195495373e30413ec3e64f5d7fb019d2cf4b3b564c11f2e54c02d114` |
| 10 | `test/编排/version-change-service.test.ts` | 新增 | 810 | `7a63f46a1a64713c09c0909c4909697d6909c5adf60b3e8443b9544bdc760576` |
| 11 | `test/编排/stable-write-service.test.ts` | 新增 | 518 | `2ee39cba8a44f8ce9dc65fc78ea5c21bf456c7bf6801c16419424eb9958b866b` |

**明确未改**：`src/model/**`（C1）、`src/common/门禁引擎/**`、`src/common/编排/task-state.ts`（C2a）、`src/provider/**`、`src/pipeline/orchestration/version-change-runtime.ts`/`stable-write-runtime.ts`/`refactor-runtime.ts`/`trunk-runtime.ts`（S4 后续）、`app/**`、其它角色测试、角色卡/边界/communication/acceptance/scheduling。未新建 `src/service/stable-write/`（B-12 条件未触发，P1 §7.4）。

## 三、冻结的导出与契约版本

- 契约版本：**`VERSION_CHANGE_SERVICE_CONTRACT_VERSION = "version-change-service/v1"`**（`public/version-change-service.ts`）。记录/schema 版本沿用 C1：`version-change/v1`、`doc-freeze/v1`、`stable-write/v1`、`refactor-request/v1`、`trunk/v1`。形状变更/发起角色/冻结语义/目标范围变化重开闸门 1（P1.6 §5.8）。
- 组合入口：`createVersionChangeService(deps: VersionChangeServiceDeps): VersionChangeServices`（`{vca, freeze, stableWrite, refactor}`）；deps = Provider 记录 Port + 门禁 C2b 注册表/许可快照 Port + trunk 基线/mini re-pin Port + 哈希 Port + 可选 `now`/`allocate`。工厂不读盘、不启动后台任务、不写账本。

### 3.1 VCA Service（`VersionChangeService`）

```ts
create(input: VersionChangeCreateInput): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
submit(input: VersionChangeSubmitInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
approve(input: VersionChangeApproveInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
reject(input: VersionChangeRejectInput): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
apply(input: VersionChangeApplyInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
list(filter?: { flowId?: string; status?: VersionChangeStatus }): Promise<VersionChangeRecord[]>;
```

- 状态转移（纯函数 `canTransitionVersionChange` + `VERSION_CHANGE_TRANSITIONS`）：`draft→submitted|superseded`、`submitted→approved|rejected`、`approved→applied|superseded`、`rejected→superseded`、`applied/superseded` 终态；`approved` 执行失败留在原状态（可重试，非转移）。
- 发起角色：`version-upgrade` 仅 `product`；`detail-amendment` 仅 `rapporteur`（`vca-role-not-allowed`；客户/幕僚不能发起）。
- 目标：upgrade 只 `contract`/`roster`；detail 可 `contract`/`roster`/`execution`；`workflow`/`boundary` ⇒ `vca-boundary-forbidden`（提示 stable 确认即写）；`product-intent`/未知 ⇒ `vca-target-invalid`（提示闸门 0/1）；每个 target 必须在作者写区（contract/roster=rapporteur `docs/proposals|contracts/`；execution=convener `docs/scheduling|flows/`）；版本化 target 必须为新版本（`trunk.latestFrozenVersion` 可用时校验）。
- baseTrunk：有 trunk 必须匹配（`trunkVersion`+`digest`）；无 trunk 允许 `null`+`bootstrap:true`；`bootstrap` 只成功一次 → `apply` 必须 `resultTrunkVersion===1`（`vca-apply-failed`）。
- 并发/幂等：同一 flow 同时仅一个 `submitted/approved`（第二个 `submit` ⇒ `vca-pending`）；`applicationId` 唯一；重复创建/提交同一目标返回现有申请；`submit/approve/apply` 以 `expectedStatus` 乐观并发（冲突 ⇒ `vca-conflict`）。
- 哈希：`create/submit` 由应用计算 `toSha256`（不信任自报）；`submit` 定格 `applicationSha256`；`approve` 与 `apply` 前重算 `toSha256`（漂移 ⇒ `vca-hash-drift`，保持原状态、不冻结/不 re-pin）；detail 修正案文档在提交时冻结（`amendment-submitted`，application 归属），批准时与 `freeze.entryOf` 定格 hash 比对。
- 冻结：upgrade 批准冻结全部 target（`version-upgrade-approved`，customer + decisionId；bootstrap 用 `bootstrap-vca-approved`，application 归属）；detail 批准不冻结 target，`apply` 只冻结 `appliedTargetPaths`（`detail-item-applied`，customer + decisionId）；空 applied 集合 ⇒ `vca-apply-failed`（`no-applicable-changes`），不改状态。
- targets↔items（`matchTargetsToItems`，纯函数）：每个 target 对应修正案一个 `to` 项（kind/roleId/toSha256 一致），不得额外/遗漏；`change:"none"` 不是 target；无实际变更项拒绝；新 detail item kind 限 contract/roster/execution。
- 返回 `VersionChangeMutation = { record, freezes }`，**事件由 S4 Pipeline 写**（本层不触达账本）。

### 3.2 冻结 Service（`FreezeService`）

```ts
state(): Promise<"missing" | "ready" | "corrupt">;
isFrozen(path: string, version?: number): Promise<DocFreezeLookup>;
entryOf(path: string, version?: number): Promise<DocFreezeRecordInput | undefined>;
freeze(input: DocFreezeInput): Promise<ServiceResult<DocFreezeRecordInput, DocFreezeErrorCode>>;
freezeMany(inputs: DocFreezeInput[]): Promise<ServiceResult<DocFreezeRecordInput[], DocFreezeErrorCode>>;
recordDraftMarker(input): Promise<ServiceResult<DraftMarkerEntry, DocFreezeErrorCode>>;
migrate(input: FreezeMigrationInput): Promise<ServiceResult<FreezeMigrationReport, DocFreezeErrorCode>>;
bootstrap(input: BootstrapFreezeInput): Promise<ServiceResult<DocFreezeRecordInput[], DocFreezeErrorCode>>;
ensureReady(): Promise<{ ok: true; state } | { ok: false; code }>;
migrationMarkOf(path, version): Promise<DocMigrationMark | undefined>;
```

- 语义：`ready` 下有冻结记录 ⇒ `frozen`；`draft-marker` 或新版本 ⇒ `draft`；注册表 `missing`/`corrupt`/不可读 ⇒ `unknown`（fail-closed；missing 先迁移）。冻结不可逆（常态，无解冻写路径）。
- 迁移（F29）：`missing`/`ready` ⇒ 既有版本化文档一律补 `migrated-legacy`（origin application、`migrated-draft` 需证据，无证据不降级）；`corrupt` ⇒ `doc-freeze-registry-corrupt`（不迁移/不重建/不放开覆盖）。
- 归属（F35）：customer 类 reason（vca-approved/version-upgrade-approved/detail-item-applied/proposal-confirmed/intent-confirmed）必须带 `decisionId`、`origin:"customer"`、`decidedBy:"customer"`；application 类 reason 不得记 `decidedBy`；`proposal-confirmed`/`intent-confirmed` 合成非空 `applicationId`（`proposal-<decisionId>`/`intent-<decisionId>`）。
- bootstrap：`handoff-pin-bootstrap` 合成 `applicationId="bootstrap-handoff-pin"`；`bootstrap-vca-approved` 必须带 VCA `applicationId`；已冻结同路径跳过（幂等）。
- 写入只经注入 `FreezeRegistryPort`（唯一写入者 = C2b `appendDocFreezeRecords`，同 `versions.lock`）；`doc-freezes.json` 仅派生缓存，本层不直接读缓存文件、不自建第二份 Map（F7）。

### 3.3 stable-write Service（`StableWriteService`）

```ts
request(input: StableWriteRequestInput): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
approve(requestId, decision: StableWriteDecision): Promise<ServiceResult<StableWriteApproveResult, StableWriteErrorCode>>;
reject(requestId, decision: StableWriteDecision): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
completeWrite(input: { requestId; actualSha256; at? }): Promise<ServiceResult<StableWriteCompleteResult, StableWriteErrorCode>>;
fail(requestId, reason, at?): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
findPermit(path: string): Promise<PermitFact | undefined>;
list(): Promise<StableWriteRecord[]>;
```

- **`PermitFact = StableWritePermit`**（F13 别名）；`stableWritePathOf(kind, roleId)` 唯一路径映射（`docs/workflow.md` / `角色卡/<roleId>/role-card.md` / `角色卡/<roleId>/boundary.yaml`；roleId 允许中文项目角色，拒绝空白/路径分隔符/`.`/`..`）。
- `request`：应用计算 `baseSha256`（不存在 = `""`，F5）与 `targetSha256`（预览最终字节）；同路径同 target 幂等复用。`approve`：`decisionId`/`confirmationId` 至少一个；一次性许可含 `approvedAt`/`expiresAt`（TTL = C1 `STABLE_WRITE_PERMIT_TTL_MS` = 30 分钟）/`issuedAt`/`authority`；批准后安装 C2b 同步许可快照。
- `completeWrite(actualSha)`（post-write）：`actualSha === targetSha256` 才在存储锁内标记 `written`/`consumedAt` 并消费许可；随后经 `TrunkStableSnapshotPort.applyStableSnapshot` 更新 trunk manifest stable 哈希（绑定 decisionId/confirmationId，**不升 trunkVersion**），返回 `StableRepinAudit`（`op:"stable-repinned"`、origin/decidedBy customer）供 S4 写 `trunk.state`；无 trunk manifest ⇒ `applied:false`、`pendingReattach:true`，不虚构事件。
- 异常：哈希不符/过期/存储失败 ⇒ 记录+许可 `failed/expired`（**不可复用**）、fail-closed + `fail()` 恢复；不更新快照、**无 drift 状态**。post-write 的 pre-write 判定由 C2b `stableWriteDecision` 完成（本层不复制判定）。
- 消费点冻结（PM 复审 §4.3）：pre-write 判定不消费；post-write 复核后消费；失败作废；TTL 30 分钟（C2c 定，已落在 C1 常量并由本 Service 使用）。

### 3.4 轻量重构（`RefactorValidator`）

```ts
validate(input: RefactorSubmitInput, context: { flowExists: boolean; allowedModuleRoots?: readonly string[] }): Promise<RefactorValidationResult>;
```

- 发起者必须 `convener`（`refactor-role-not-allowed`；身份由 S4/D1 活动会话能力位保证，F11）；flow 存在（`refactor-flow-missing`）；title/reason 长度（`refactor-invalid`）。
- 路径分类（`classifyRefactorPath`）：版本化文档（`docs/product|proposals|contracts/*-vN.md`）⇒ kind `versioned-doc`；`boundary.yaml` ⇒ `boundary`；`docs/workflow.md`/`role-card.md` ⇒ `stable`；`docs/scheduling/` ⇒ `team-plan`；`docs/flows/` ⇒ `flow`；`.ans/`、`角色卡/` 其它 ⇒ 拒绝；命中即 `refactor-scope-forbidden` 并提示 VCA/stable 通道。`allowedModuleRoots` 提供时越界 ⇒ `refactor-write-set-forbidden`。
- 记录：`initiatedBy:"convener"`、`managedBy:"application-scheduler"`、`status:"requested"`、`enforcement.writeSet` 仅模块代码目录、`forbiddenKinds` = `REFACTOR_FORBIDDEN_KINDS` 五类；无客户决定、不产生 trunk 版本（F31/F40）。

### 3.5 错误码

- VCA：`vca-invalid`/`vca-role-not-allowed`/`vca-target-invalid`/`vca-boundary-forbidden`/`vca-base-mismatch`/`vca-pending`/`vca-conflict`/`vca-hash-drift`/`vca-rejected`/`vca-channel-unavailable`/`vca-apply-failed`（C1 `VersionChangeErrorCode` 单一来源，未新造码）。
- 冻结：C1 `DOC_FREEZE_ERROR_CODES` 五码（本层未新造）。
- stable：C1 `STABLE_WRITE_ERROR_CODES` 九码（本层未新造）。
- 重构：C1 `REFACTOR_ERROR_CODES` 六码（本层未新造）。

## 四、C2b 联合契约（实测 C2b 冻结件）

| C2c 契约 | C2b 冻结实现（`src/common/门禁引擎/versioned-doc-guard.ts`） | 联合测试 |
| --- | --- | --- |
| `FreezeRegistryPort.appendDocFreezeRecords(DocFreezeRecordInput[])` | `appendDocFreezeRecords(DocFreezeAppendRequest[])`：`{projectRoot, relPath, freeze: DocFreezeRecord, sha256?}`，同 `versions.lock`/fencing，冻结终态冲突拒绝 | `version-change-service.test.ts`：C2c 记录经 C2b 追加 → baseline → `refreshVersionedDocFreezeSnapshot` → `versionedDocFreezeState === "frozen"` |
| `FreezeRegistryPort.appendDraftMarkers` | `appendDocDraftMarkerRecords`（`draft-marker`，不写 doc.freeze） | 同上：draft-marker → `versionedDocFreezeState === "draft"` |
| `FreezeRegistryPort.refreshSnapshot()` | `refreshVersionedDocFreezeSnapshot` / `installVersionedDocFreezeSnapshot` / `versionedDocFreezeState`（快照唯一实现，F7） | 同上 + 纯快照：migration-required ⇒ 既有文档 frozen、corrupt ⇒ unknown |
| `FreezeService.isFrozen` 三态 | C1 `DocFreezeLookupState`（frozen/draft/unknown） | 迁移/归属/快照测试断言 |
| `PermitFact` | `StableWritePermitView = StableWritePermit`（类型别名，实测 `:984`） | 类型/运行时形状断言 |
| `StableWriteService.findPermit` → 快照 | `installStableWritePermitSnapshot` + `stableWriteDecision(StableWriteDecisionInput)`（纯函数，不消费） | `stable-write-service.test.ts`：allowed / hash-mismatch / expired / path-mismatch / consumed / 无快照 fail-closed |
| mini re-pin | S2 trunk service（后续）；C2b 不消费 | `TrunkStableSnapshotPort` 契约 + fake 测试；事件载荷 `StableRepinAudit` |

> `DocFreezeRecordInput` 的 `path/version/sha256` 外层字段 → C2b `relPath`/baseline 记录；S2 实现 `FreezeRegistryPort` 时按此映射（不双写双判）。C2b `refreshVersionedDocFreezeSnapshot` 为异步读盘；本层 `refreshSnapshot()` 由 S2 适配器调用。

## 五、F13 / F14 / F16 关闭证据

- **F13（stable 许可单一形状）**：
  - C1 `StableWritePermit` 唯一形状；本层 `PermitFact` 为其**别名**（`public/version-change-service.ts` 导出；`test/编排/stable-write-service.test.ts` 断言 permit 键集恰 14 项、状态仅 `approved|consumed|expired|failed`、TTL 30 分钟）。
  - `StableWriteRecord` 与 permit 分表：record 增 `permitId?`/`approvedAt?`/`expiresAt?`/`consumedAt?`；测试断言 `"permit" in record === false`。
  - `StableWriteDecisionInput` 由 C1 冻结（`{projectRoot, relPath, sha256, permit?, now?: () => Date}`）；测试以 `PermitFact` 直接构造并交给 C2b `stableWriteDecision`（联合测试）。
  - C2b `StableWritePermitView` 实测为同一类型别名（未造第三形状）。
- **F14（`StableWriteEvent` 可选时间戳）**：C1 已加 `approvedAt?/expiresAt?/consumedAt?`；本层 record 侧字段与其一致，事件写出归 S4。
- **F16（执行点）**：Service 无 fs import、无 `writeFile` 方法；`completeWrite(actualSha)` 语义 = post-write 复核后消费 + mini re-pin；pre-write 判定归 C2b `stableWriteDecision`（run-role S3 消费 `WriteGateContext.contentSha256`，F6 由 C1b/S3 落地）。测试断言 `Object.keys(stableWrite)` 无写盘入口。

## 六、run-role 接线（最小）

- `CARD_KIND_ROUTE_HINTS` 增 `"stable-write"` hint：`"stable 写入确认卡由应用自有通道（stable-write-runtime）发起；不得用 request_choice/request_confirmation 发 stable 写入确认卡"`。
- 类型处理（如实披露）：`GovernanceCardKind` 尚未含 `stable-write`（C1 冻结记录 §六.1 将联合成员列入 C1b）；为保持 `typecheck` 绿，键表类型暂为
  `Readonly<Record<GovernanceCardKind, string>> & Readonly<Partial<Record<"stable-write", string>>>`。
  C1b 把 `"stable-write"` 加入联合后该交集仍有效，无需再改本文件；`GOVERNANCE_CARD_GROUP` 精确键集断言不变（未进判断/代选组）。
- 未改 Model/其它逻辑；未接 gate 判定（S3 在 C2b 冻结后消费 `versionedDocFreezeState`/`stableWriteDecision`）。

## 七、测试 / 类型检查原始结果

1. **`npm run typecheck`**（`tsc --noEmit`，include `src/test/app` 除 renderer）：**exit 0**（无输出错误）。
2. **定向（本节点两个文件）**：
   `node --test "test/编排/version-change-service.test.ts" "test/编排/stable-write-service.test.ts"`
   → **tests 23 / pass 23 / fail 0 / skipped 0 / duration ≈ 150 ms**；exit 0。
3. **`test/编排` 全量**：`node --test "test/编排/**/*.test.ts"`
   → **tests 831 / pass 830 / fail 1 / cancelled 0 / skipped 0**；exit 1（仅下述既有环境失败）。
   - 唯一失败：`test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托…」`EPERM: operation not permitted, symlink`（Windows 无符号链接权限；与 B0 既有失败同源，非本改动引入）。
   - **基线对照**：隐藏本节点两个测试文件后同套件 = **808 / 807 pass / 1 fail（同一 EPERM）**；B0 记录为 804/803/1，差额 +4 为并行 C2a 已落树的 `test/编排/trunk-events.test.ts`（非本节点写集）。本节点新增 23 tests、0 skip、未改任何既有断言/未新增 skip。
4. **联合契约**：见 §四；C2b 真实实现（non-fake）通过。

## 八、遗留依赖（不声称已完成）

1. **S1（Provider）**：`src/provider/version-change/` 记录/许可/缓存存储与 R9 读写适配（本节点只定义 Port；`FreezeRegistryPort` 的 C2b 适配映射见 §四）。
2. **S2（Service 全量）**：trunk service（derive/verify/apply-journal/`applyStableSnapshot`/`latestFrozenVersion`）、修正案解析/逐项确认、迁移扫描（`existingDocs` 发现）由 S2 提供；本节点只实现契约与最小纯函数/状态机。
3. **S3（守卫调用点）**：`run-role.gate` 接 `versionedDocFreezeState` + `stableWriteDecision` + `WriteGateContext.contentSha256`（F6 依赖 C1b 的 `WriteGate` 可选上下文与运行时工具落点）；shell/删除/改名/移动/pin/re-pin 调用点由 S3 接。
4. **S4（Pipeline）**：`version-change-runtime`/`stable-write-runtime`/`refactor-runtime`/`trunk-runtime` 发卡/事件/客户通道/重发卡；本节点只返回记录与 `freezes`/`StableRepinAudit` 载荷。
5. **C1b**：`GovernanceCardKind` 增 app-owned `"stable-write"` + `GOVERNANCE_CARD_KINDS` 白名单（C1 冻结记录 §六.1 移交）；本节点 route hint 已就位。
6. **D1/U1**：客户卡/面板/appointment-write 钩子/IPC 消费；D1 无直接写盘（F16）。
7. **执行（execution）非 guard 冻结**：C15 裁决保留；VCA/trunk manifest + verify 保证（E1 披露）。

## 九、范围与声明

- 本节点全部新增/修改路径在 Section 1 已确认的 B-7 与既有目录（`src/service/version-change/`、`test/编排/`、`run-role.ts` 单文件）；**无 B-1..B-11 之外的路径**；**B-12/B-13 未触发**（stable-write 子服务并入 B-7；桌面集成测试留 B-10/D1）。
- 未新增角色/能力/写权；未改 `governance-roles.ts`、WriteGate/shell 硬地板、D3/appointment-write、三道闸门、验收/证据规则；未改 `src/model/**`、`src/common/门禁引擎/**`、`src/common/编排/task-state.ts`、`src/provider/**`、`app/**`、其它角色测试。
- 未写角色卡/边界/changelog/memo/communication/acceptance/scheduling；未运行应用；**未 commit / 未 push / 未 merge / 未 release**。
- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。后续任何形状变更回编排并按 C2c 冻结流程重跑受影响证据。
