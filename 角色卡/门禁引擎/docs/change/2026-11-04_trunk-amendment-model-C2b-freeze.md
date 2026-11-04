# 门禁引擎 C2b 契约冻结记录：守卫/冻结判定 + stable-write 一次性许可（trunk-amendment）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；门禁引擎（独立固定上下文）；Batch 1 **C2b（守卫/冻结判定契约冻结）**。
- **日期 / 状态**：2026-11-04；**C2b 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/memo/changelog/api-spec/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`。
- **本角色 P1 提案（实现依据）**：`角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-P1.md`：498 行 / SHA-256 `eee0a7769c1acde373c842a8ff10c478fb4d4f002ec93da71950295b75b44e74`（rev2）。
- **PM 复审（F13/F16 冻结条件来源）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：451 行 / SHA-256 `1a73ebc6d2d0fb1776999522d1fec326e5c1eee3cab205d8a506fee7b9abcb8c`；复审结论 `recommend approval（附冻结条件）`。
- **C1 冻结（permit/freeze 形状唯一来源）**：`src/model/version-change.ts`（451 行 / `87ff10bc98ffa12e72ead4c91ef6b62862e748bfe8977f3bd5111bb691e8207c`）、`src/model/trunk.ts`、`src/model/runtime.ts`；C1 冻结记录 `角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md`。
- **基线**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/trunk-amendment-model`；HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、结论

- **C2b 冻结通过（本节点写集）**：`versionedDocOverwriteDecision` 成为唯一同步冻结判定（write/edit/delete/rename/move/pin/re-pin；frozen ⇒ 拒绝、draft ⇒ 允许、unknown/缓存损坏 ⇒ fail-closed）；R9 记录变体（`frozen`/`draft-updated`/`draft-marker`）+ latest-record-per-path + 冻结同步快照（单一实现）+ `stableWriteDecision` 一次性许可判定已落地；`amendment` 模式加入；旧版本保护不回归。
- **F13 已关闭（C2b 侧）**：`StableWritePermitView` 为 C1 `StableWritePermit` 的**类型别名**（无第二套字段/状态枚举）；许可快照存 `StableWritePermit[]`；`stableWriteDecision` 直接消费 C1 `StableWriteDecisionInput`；denied 分支携带可直接返回的 `WriteDecision`（`allowedByRoot` 空集 + code/rejection）；allowed 分支由 run-role 继续 `baseGate`（`matchedEntry` 由 baseGate 提供）。
- **F16 已关闭（门禁侧口径 + 机械保证）**：appointment-write 的 stable 实际执行点 = 编排 S3 `run-role.gate`（write/edit 带 permit）+ B-11 `completeWrite`；D1 只发行 writeSet/appointment-write 卡/许可安装/结果外显，**无直接写盘路径**。门禁侧不提供任何 D1 直写函数：`stableWriteDecision` 是 pre-write 纯判定，shell 通道对 stable 一律拒绝（无内容 hash），不存在新增写路径。
- **`src/model/decision.ts` 未改**：`WriteDecision` 既有拒绝形状已含可选 `code`/`rejection`，`allowedByRoot` 空集可直接构造；**无需最小加法**。`StableWritePermitView` 别名与返回映射均在门禁单文件内完成（属门禁引擎单文件授权）。
- **遗留依赖（不声称已完成，见 §八）**：`run-role.ts` 接线（C2c/S3）、`run-manifest` pin/re-pin 调用（C2c）、B-11 `completeWrite` 消费与 mini re-pin、S1/B-6 `doc-freezes.json` 缓存持久化、C2c 迁移进度标记、C8 删除/改名/移动草稿的 R9 变更记录。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/门禁引擎/versioned-doc-guard.ts` | 修改（唯一同步判定 + 冻结快照 + R9 变体 + stable 许可） | 1562 | `46c4433de7bcaa9f7b8711925d2c9e39526b3739` | `95b7887303fda31b193b4753b41c65e06fa5fa065d70bcfd24a6b6d0f066a158` |
| 2 | `src/common/门禁引擎/shell-write-guard.ts` | 修改（调用点：冻结注入 + stable 拒绝） | 754 | `bfe518e783d90bcbf55e82a860661f1dba52c472` | `bc4c13aba0615e69d9682955512bf539b7622e997ee88107ee8be99770ed91ca` |
| 3 | `test/门禁引擎/versioned-doc-guard.test.ts` | 扩展现有测试（+8 用例） | 631 | `1a0ba8deb19907619aa494c7949c6b0ee4c32aa8` | `f3313b1343890e0b3d8bcbe99769ee3fc34a143772f1ce32d3fbc9f98704b05d` |
| 4 | `test/门禁引擎/shell-write-guard.test.ts` | 扩展现有测试（+2 用例） | 341 | `ed2a79ca08d6748c93a6dcbf5bfca8e648f1a36e` | `1aae853813913679dd89283aa62a6a7cd4dc11bed370f3809ce03237cb9e3a98` |
| 5 | `test/门禁引擎/stable-write-guard.test.ts` | 新增（10 用例） | 288 | `8b28d5f7b9163eb3b1dc9f841121097e3369c55a` | `36ddf79bf84261568e686ded4ca7fba00cd0703e2e2ce6b150856c53c048666e` |
| 6 | `角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-C2b-freeze.md` | 新增（本文件） | — | — | — |

**明确未改**：`src/model/decision.ts`（哈希保持 `7eaddc0b…`）、`src/model/trunk.ts`/`version-change.ts`/`runtime.ts`（C1）、`src/pipeline/orchestration/**`、`src/service/**`、`src/provider/**`、`app/**`、`governance-roles.ts`、其它角色测试/文档、`test/门禁引擎/versioned-doc-guard-assets.test.ts`（无需适配，保持 `f3c7d182…`）。
`test/门禁引擎/` 既有断言未改写；未新增 skip。

## 三、冻结的导出符号与契约版本

### 3.1 唯一同步冻结判定（`versioned-doc-guard.ts`）

```ts
export type VersionedDocOperation = "write" | "edit" | "delete" | "rename" | "move" | "pin" | "repin";

export function versionedDocOverwriteDecision(input: {
  relPath: string;
  exists: boolean;
  frozen?: DocFreezeLookupState;      // C1 frozen|draft|unknown；生产由 versionedDocFreezeState 提供
  operation?: VersionedDocOperation;   // 缺省 "write"
  destRelPath?: string;                // rename/move 目标
  destExists?: boolean;
  destFrozen?: DocFreezeLookupState;
}): VersionedDocDecision;              // allowed | { code: "versioned-doc-overwrite" | "versioned-doc-not-frozen", rejection, reason }
```

- 真值表：**frozen ⇒ 拒绝**（覆盖/删除/改名/移动/pin 规则见实现注释）；**draft ⇒ 允许（仍受写权）**；**unknown/缓存损坏 ⇒ fail-closed 拒绝（含新建 vN+1，C10）**；未传 `frozen` 时保留旧「存在即只读」保护（既有调用方/回归）。
- `pin`/`repin`：只有 `frozen==="frozen" && exists` 允许；其余拒绝码 `versioned-doc-not-frozen`（C14）。rename/move 源与目标同判。
- `versionedDocExists`、`protectedVersionedPaths(Sync)`、`isVersionedDocPath`、`versionedDocVersionOf`、`normalizeVersionedDocPath` 保留。
- **`checkVersionedDocWrite` 已删除导出与死导入**（全仓无外部调用；AC-15 允许「对齐/删除」）：唯一判定入口不再有第二个包装。

### 3.2 冻结同步快照（C2b 单一实现，F7/F33）

```ts
export type VersionedDocFreezeSnapshotState = "ready" | "migration-required" | "corrupt" | "unknown";
export interface VersionedDocFreezeEntry { path; version; sha256; frozen; reason?; applicationId?; migratedDraft? }
export interface VersionedDocFreezeSnapshot {
  v: 1; schema: "doc-freezes/v1"; state: VersionedDocFreezeSnapshotState;
  baselineSha256?: string; entries: readonly VersionedDocFreezeEntry[]; builtAt: string;
}
export function buildVersionedDocFreezeSnapshot(input): VersionedDocFreezeSnapshot;
export function installVersionedDocFreezeSnapshot(projectRoot, snapshot): void;
export function invalidateVersionedDocFreezeSnapshot(projectRoot?): void;
export function versionedDocFreezeState(projectRoot, relPath, exists): DocFreezeLookupState; // 生产唯一同步查询
export async function refreshVersionedDocFreezeSnapshot(projectRoot, opts?): Promise<VersionedDocFreezeSnapshot>;
```

- 语义：`ready`（迁移完成）= 有冻结记录 ⇒ frozen、缺记录 ⇒ draft；`migration-required` = 既有路径一律 frozen、新路径 draft（F29 安全向）；`corrupt`（baseline/marker/非法快照）= 所有查询 unknown；未安装 = unknown。**guard 只消费已安装快照，不直接读 `doc-freezes.json`**。
- 快照安装会做结构校验；非法快照安装为 `corrupt`（不沿用旧快照）；`refresh` 在 baseline/marker 缺失或损坏时安装 `corrupt`（fail-closed，不自动重建）。
- 编排只调用 install/refresh/query；**不得自建第二份 Map / `freeze-snapshot.ts`**（F7）。

### 3.3 R9 baseline 变体与单一写入者（F34）

```ts
export type VersionedDocKind = "intent" | "proposal" | "roster" | "modules" | "topology" | "architecture" | "assets" | "amendment";
export type VersionBaselineEvent = "baseline" | "version-added" | "frozen" | "draft-updated" | "draft-marker";
export interface VersionBaselineRecord { v; flowId; doc; version; path; sha256; recordedAt; event; recordedBy; freeze?: DocFreezeRecord }
export function appendDocFreezeRecords(inputs, options?): Promise<DocBaselineAppendResult>;       // 同 versions.lock + fencing
export function appendDocDraftMarkerRecords(inputs, options?): Promise<DocBaselineAppendResult>; // migrated-draft 证据
```

- `frozen` 的 `freeze` 子形状 = C1 `DocFreezeRecord`（type-import，不复制；reason↔origin 归属一致、applicationId 非空、decidedBy 仅 customer 类）。
- **latest-record-per-path**：verify / `baselineShaFor` / 快照 / `registerVersionedDocAfterWrite` 均以同一实际路径最后一条记录为准；冻结为终态（再冻结不同 sha/内容 ⇒ `frozen-conflict`；冻结后写后登记/草稿标注一律拒绝）。
- `registerVersionedDocAfterWrite`：同 path/version 草稿原位改追加 `draft-updated`（`verify` 不误报旧 sha）；新版本仍要求「当前最大 N+1 + 版本头」；TOFU/锁/fencing 语义不变。
- `appendDocFreezeRecords` 首次调用可在 baseline/marker 都不存在时建立 R9 基线（handoff-pin bootstrap 用）；幂等（同 sha + 同 reason/applicationId ⇒ skipped）。

### 3.4 stable-write 一次性许可（F13）

```ts
export type StableWritePermitView = StableWritePermit; // C1 类型别名（唯一 permit 形状）
export interface StableWritePathInfo { kind: StableFileKind; roleId?: string; path: string }
export function stableWritePathOf(relPath): StableWritePathInfo | undefined;
export function installStableWritePermitSnapshot(projectRoot, permits: readonly StableWritePermit[]): void;
export function invalidateStableWritePermitSnapshot(projectRoot?): void;
export function noteStableWritePermitConsumed(projectRoot, permitId, at?): void;
export function stableWriteDecision(input: StableWriteDecisionInput): StableWriteDecision;
```

- 与 `versioned-doc-guard` **同模块、同路径规范化、同快照实现**；许可快照唯一实现，编排/桌面只调用 install/consume/invalidate/query。
- `stableWritePathOf`：`docs/workflow.md`（workflow/convener）、`角色卡/<roleId>/role-card.md`、`角色卡/<roleId>/boundary.yaml`（单层、非内置角色 id）；`角色卡/governance-boundary.yaml` 不匹配；大小写不敏感、反斜杠/`..`/绝对路径拒绝（C18）。

#### `stableWriteDecision` 签名与返回映射（F13）

```ts
// 入参 = C1 StableWriteDecisionInput（唯一形状）：
//   { projectRoot: string; relPath: string; sha256: string; permit?: StableWritePermit; now?: () => Date }
export type StableWriteDecision =
  | { allowed: true; permitId: string; requestId: string; decisionId?: string; confirmationId?: string }
  | {
      allowed: false; reason: string; code: StableWriteErrorCode; rejection: MechanicalRejection;
      /** 可直接作为 WriteGate 拒绝返回：allowedByRoot 空集 + code/rejection。 */
      writeDecision: Extract<WriteDecision, { allowed: false }>;
    };
```

- **run-role 映射（F13）**：`denied ⇒ return decision.writeDecision`；`allowed ⇒ 继续 baseGate(path) 并返回其 WriteDecision`（`matchedEntry` 由 baseGate 提供；不在本判定内构造 allowed 的 `WriteDecision`）。
- 校验顺序与语义：stable 路径/kind/roleId 绑定 → permit 必填 → 许可快照可用 → permit 必须在快照且逐字段一致（防伪造/陈旧对象）→ **快照状态**：consumed/expired/非 approved ⇒ 对应拒绝码 → 路径/kind/roleId 一致（`stable-write-path-mismatch`）→ authority 至少一个 id → 时间字段合法、`now < expiresAt`、有效期 ≤ **TTL 30 分钟**（C1 `STABLE_WRITE_PERMIT_TTL_MS`）→ `sha256 === targetSha256`（`stable-write-hash-mismatch`）→ `baseSha256` 与当前文件一致（`""` = 写入前不存在；不一致 ⇒ 拒绝，重走确认）。
- 纯函数：不写盘、不消费、不发事件；消费在 post-write `completeWrite(actualSha)`（B-11），随后刷新许可快照（可用 `noteStableWritePermitConsumed` 同步内存）。
- 错误码全部取自 C1 `STABLE_WRITE_ERROR_CODES`（未新造 code）：`permit-missing`/`permit-invalid`/`permit-expired`/`permit-consumed`/`path-mismatch`/`hash-mismatch`/`confirmation-missing`/`invalid`。

## 四、F13 逐条关闭证据（C2b 侧）

| F13 要求 | 落点/证据 |
| --- | --- |
| 以 C1 `StableWritePermit` 为唯一 permit 形状；`StableWritePermitView` 为别名/窄视图，不得另造字段/状态枚举 | `export type StableWritePermitView = StableWritePermit`；文件内无第二套 permit 接口/状态常量；测试「F13 形状：StableWritePermitView 是 C1 类型别名」（双向赋值编译 + 字段断言） |
| 快照存 `StableWritePermit[]` | `installStableWritePermitSnapshot(projectRoot, permits: readonly StableWritePermit[])`；结构非法许可被过滤（不可用），不产生第三形状 |
| `stableWriteDecision` 统一输入 `{projectRoot, relPath, sha256, permit?, now?}` | 直接消费 C1 `StableWriteDecisionInput`（`now?: () => Date`、`permit?`）；C1 无判定实现，判定归 C2b |
| 一次性、路径/哈希绑定、status approved、未过期、未消费 | 校验矩阵 + 测试：consumed/failed/expired status、noteConsumed 后复用、过期、超 TTL、sha/base 不一致、path/kind/roleId 不一致、伪造/陈旧对象 |
| 无/伪造/过期/已消费 ⇒ 拒绝 | 测试覆盖 `permit-missing`/`permit-invalid`/`permit-expired`/`permit-consumed`；快照未安装 ⇒ `stable-write-invalid`（fail-closed） |
| 写入 hash 必须等于 permit target/base 约定；TTL 30 分钟 | `sha256===targetSha256`；`baseSha256===""`（新文件）或等于当前文件 hash；有效期上限 `STABLE_WRITE_PERMIT_TTL_MS`（30 分钟，C1） |
| denied ⇒ 构造 `WriteDecision` 拒绝（`allowedByRoot` 空集 + code/rejection） | `StableWriteDeniedDecision.writeDecision`；测试断言 `allowed:false`、`allowedByRoot {skill:[],project:[]}`、`code`/`rejection.code` 一致 |
| allowed 分支可被 run-role 映射回其 `WriteDecision`（`matchedEntry` 由 baseGate 提供） | allowed 分支携带 `permitId/requestId/decisionId?/confirmationId?`；类型注释明确 run-role 映射：denied ⇒ writeDecision，allowed ⇒ 继续 baseGate（F13 文字口径） |
| 若需改 `src/model/decision.ts` 只做最小加法 | **未改**：既有拒绝形状已含可选 `code`/`rejection`，`allowedByRoot` 空集可直接构造（哈希保持 `7eaddc0b…`） |

## 五、F16 逐条关闭证据（执行点文字/行为）

| F16 要求 | 落点/证据 |
| --- | --- |
| appointment-write 的 stable 实际执行点 = 编排 S3 `run-role.gate`（write/edit 带 permit） | `stableWriteDecision` 即 run-role 的 pre-write 判定（输入含 `sha256`=最终字节 hash 与 permit）；冻结记录明确唯一执行点；run-role 接线属 C2c（§八-1） |
| + B-11 `completeWrite` | post-write 由 B-11 `completeWrite(actualSha)` 复核 `actual===targetSha256` 后消费；本模块提供 `noteStableWritePermitConsumed` 供消费后同步快照；判定本身不消费（纯函数） |
| D1 只发行 writeSet/appointment-write 卡/许可安装/结果外显，**无直接写盘路径** | 门禁侧未新增任何 D1 直写函数/通道；D1 只能 `installStableWritePermitSnapshot` 安装许可（数据），写盘仍走 run-role write/edit gate。**若未来出现桌面直接写盘路径（当前不存在），必须接同一 `stableWriteDecision`——不新增写路径** |
| 不得为 D1 造新写路径 | shell 通道对 stable 目标一律拒绝（C7：无内容 hash）；stable 判定不在冻结判定内、也不引入 shell 写 stable 通道 |
| 门禁/D1 按此改文字，不新增代码路径 | 本记录 + `versioned-doc-guard.ts`/`shell-write-guard.ts` 注释落文字；无新模块/新导出写路径 |

## 六、全调用点清单（唯一同步判定 / stable 判定）

| 通道 | 调用点（归属） | 现状（C2b 后） |
| --- | --- | --- |
| write_file / edit_file（版本化） | `src/pipeline/orchestration/run-role.ts` gate（编排 S3） | 仍传 `{relPath, exists:true}`（旧保护）；**C2c 改为** `versionedDocFreezeState` → `versionedDocOverwriteDecision({..., frozen, operation})`；本模块已就绪 |
| write_file / edit_file（stable） | 同上 | **C2c 接线**：`WriteGate context.contentSha256` + `stableWriteDecision`；无上下文一律拒绝 stable（K6/C6） |
| shell 写/删除/重命名/移动 | `src/common/门禁引擎/shell-write-guard.ts`（本节点已改） | 显式目标逐项：stable 一律拒绝（C7）；版本化统一 `versionedDocOverwriteDecision`（`freezeStateOf` 注入；operation 按 rm/mv 推导）；opaque/ambiguous/review 提及版本化/stable 路径即拒绝（mention 不放宽，C13） |
| pin / re-pin | `src/common/编排/run-manifest.ts`（编排 S3） | **C2c 接线**：`versionedDocOverwriteDecision({operation:"pin"|"repin"})`；仅 frozen 允许；bootstrap 先写 `doc.freeze(handoff-pin-bootstrap)` 再 pin（本模块 `appendDocFreezeRecords` 已就绪） |
| `shell-post-audit` | `src/common/编排/shell-post-audit.ts`（编排 S3） | `baselineShaFor` 已改为 latest-record-per-path；draft/frozen 分开判定属 C2c/S3 |
| `checkVersionedDocWrite` | 原死代码（仅 shell 死导入） | **已删除导出与导入**（AC-15；全仓零引用） |
| R9 冻结/迁移写入 | 编排 C2c/B-6/B-7 | 只经本模块 `appendDocFreezeRecords` / `appendDocDraftMarkerRecords`（同锁/fencing）；**B-6/B-7 不直接写 `versions.jsonl`** |
| 快照安装/刷新 | 编排/桌面（D1/S3） | 只调用本模块 `installVersionedDocFreezeSnapshot` / `refreshVersionedDocFreezeSnapshot` / `versionedDocFreezeState`；不得自建第二份 Map |

## 七、测试 / 类型检查原始结果

1. **门禁引擎套件**：`node --test "test/门禁引擎/**/*.test.ts"`
   → **tests 312 / pass 311 / fail 0 / skipped 1 / exit 0**。
   - B0 基线（C2b 前实测）：292 tests / 291 pass / 0 fail / 1 skip。本次 +20 用例（versioned 8 + stable 10 + shell 2），全部通过；**既有断言未改写、未新增 skip**；1 skip 为 B0 既有 Windows skip。
2. **跨角色消费方回归（只读消费本模块）**：
   `node --test "test/编排/shell-post-audit.test.ts" "test/桌面应用/rejection-copy.test.ts" "test/桌面应用/run-pin.test.ts" "test/桌面应用/chain-enforcement.test.ts"` → **54 / 54 pass**；
   `node --test "test/桌面应用/acceptance-evidence.test.ts" "test/桌面应用/run-change-trigger.test.ts"` → **11 / 11 pass**。
3. **`npm run typecheck`**：C2b 改动前（HEAD+C1，本节点开工时）**exit 0**；**最终实测 exit 0 / 0 errors**（2026-11-04 本节点收尾复跑）。
   - 节点中途曾因并行 C2c（编排）未接线文件报错，均非本节点文件：`src/service/version-change/public/version-change-service.ts(96,3)` TS2459、`test/编排/fixtures/version-change-service-fixture.ts(19,8)` TS2724、`test/编排/version-change-service.test.ts` TS2345 多条；并行角色修复后复跑通过。
   - `src/common/门禁引擎/**`、`test/门禁引擎/**` **全程无 typecheck 错误**。
4. **证据口径**：以上计数为本节点实测；并行角色仍在改 `src/service/version-change/**`、`test/编排/**`、`app/**`，最终 T3 以测试角色全量回归为准。

## 八、遗留依赖与披露（不声称已完成）

1. **run-role 接线（C2c/S3）**：`run-role.ts:846-866` 仍为旧调用 `{relPath, exists:true}`（存在即拒，安全不回退）；C2c 需改为 `versionedDocFreezeState(projectRoot, rel, exists)` + `versionedDocOverwriteDecision({..., frozen, operation})`，并对 stable 路径消费 `context.contentSha256` + `stableWriteDecision`。**本节点不改编排文件**。
2. **`run-manifest` pin/re-pin（C2c/S3）**：需按 `operation:"pin"|"repin"` 调用；bootstrap 在 `versions.lock` 内先 `appendDocFreezeRecords`（handoff-pin-bootstrap）再 pin。
3. **B-11 `completeWrite`（编排）**：post-write 复核 `actualSha===targetSha`、写 `written/consumedAt`、失败作废许可、mini re-pin；本模块提供 `noteStableWritePermitConsumed` + `installStableWritePermitSnapshot`。
4. **S1/B-6 `doc-freezes.json`**：派生缓存持久化/重建/`baselineSha256` 对账归存储层；**guard 不直接读缓存文件**；缓存与 baseline 不一致时以 baseline 为准并告警（AC-27）。
5. **C2c 迁移进度标记**：`migration-required`/`ready` 由编排按迁移状态传入 `refreshVersionedDocFreezeSnapshot({ migrationCompleted })`；`migrated-draft` 证据写入经 `appendDocDraftMarkerRecords`。
6. **C8（删除/改名/移动草稿的 R9 变更记录）**：当前判定允许 draft 的 delete/rename/move（P1.6 §4.6 真值表）；若 C2c/B-6 未提供 `removed`/`moved` 类记录，verify 会对已登记草稿报 missing。C2c/S2 需按 C8 决定：提供变更记录，或安全收窄为拒绝并披露。本节点不擅自扩 R9 事件形状（C1 未定义 `removed`/`moved`）。
7. **execution（teamPlan/flow）冻结**：按 C15 裁决不纳入 guard；由 VCA/trunk manifest + verify 保证；E1/E2 披露「execution 非 guard 冻结」。
8. **`governance-roles.ts` 未改**：convener 的 `docs/workflow.md` 写权与 `preauthorizedDirs` 保留（作为写权管道），写入当刻的确认由 `stableWriteDecision` 机械强制；角色卡旧文案「预授权直写」的可读性风险按 C12 仅用拒绝文案指引；若必须改角色文本，属治理文本变更，停止回报。

## 九、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅改 §二列出的写集文件；未改 `src/model/decision.ts`、C1 文件、编排/桌面/服务文件、`governance-roles.ts`、其他角色测试/文档。
- 未运行应用；未 commit / push / merge / release。
- 后续任何形状/语义变更按 C2b 冻结流程重跑受影响证据并与 C2c 联合冻结。
