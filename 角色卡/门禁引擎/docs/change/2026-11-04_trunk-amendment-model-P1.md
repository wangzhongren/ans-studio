# 门禁引擎 P1 实现提案：冻结判定与 stable 写入一次性许可（trunk-amendment）

- **任务 ID**：`2026-11-04-trunk-amendment-model`
- **角色**：门禁引擎（Gate Engine），独立固定上下文
- **阶段**：P1 实现提案（团队计划增量 §10.8 Batch 0；五角色提案之一）
- **日期**：2026-11-04
- **状态**：**`proposal-only, no code`（rev2，已按 PM 审核 §5.5/F5/引用裁决修订）**。本文只写本角色实现口径、写集、契约冻结前澄清项与证据计划；未改任何源码/测试/其他角色文档，未 commit/push。提案不是批准；项目管理 P1 审核通过且 Batch 1 契约冻结前不开工。修订后由项目管理复核，不自行评审放行。
- **基线**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/trunk-amendment-model`；HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`；`git status --porcelain -- src test` 为空；Node `v24.22.1` / npm `11.19.1`（B0/V1 记录值）。
- **写入路径**：`角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-P1.md`（本阶段唯一写盘文件）。

## 0. 依据（只读实测行数 / SHA-256）

| 依据 | 行数 | SHA-256（实际字节） | 说明 |
| --- | --- | --- | --- |
| 团队计划增量 §10.8 | 468 | `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5` | P1 任务书、写集、注意点 |
| 方案 P1.6 | 1151 | `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`（归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`） | 实施契约基线 |
| V1 v1.1 | 350 | `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4` | 按 PM 审核 §1.3-1 裁决：以 350 行 / 归一化 `3c40acad…` 为当前 V1；`75bf7a49…` 为旧快照，由沟通/统筹更正 |
| B0（测试角色最终版） | 221 | `8c6272d5b332f1bc652603a1d99f6946ffab5967251bc26d0012964071066058` | 门禁套件计数 33 文件 / 292 / 291 / 0 / 1；T3 全量 3774 / 3745 / 11 / 18 |
| G2a 增补记录 | 25 | `bfac578176ec9d4beb0fe257c21155efaf81ff07af62ddbe417acbee16790201` | B-5..B-11 + P1.6 补注 |
| PM P1.6 审核记录 | 368 | `2cb04caefae4074ef732e7030900bd11201a4c6a5583d74bf94814aacaf2ed93` | §5.5/F5/引用裁决依据 |
| 本角色边界 | 28 / 59 | `boundary.yaml` `f8b0a51183639025bcca54be2cc397522ea9fa80690b6081b0f9fe254731152b` | Section 1 写入白名单 |

> **引用口径**：按 PM 审核记录 §1.3/§八-1，B0 以 **221 行 / `8c6272d5…`**、V1 以 **350 行 / 归一化 `3c40acad…`**、G2a 以 **25 行 / `bfac5781…`** 为准；旧 B0 中间版与 V1 `75bf7a49…` 均为历史快照，不再作为引用。

## 1. 写前只读基线

### 1.1 本角色与消费方文件（实测）

| 文件 | 行数 | SHA-256 | 角色归属 |
| --- | --- | --- | --- |
| `src/common/门禁引擎/versioned-doc-guard.ts` | 639 | `dcbaaeed3998c998e1bc5a54489f7b85250c0e3e2c43910b39d45382565df004` | 门禁引擎 |
| `src/common/门禁引擎/shell-write-guard.ts` | 671 | `81f43b6a8d216714b4fb3dd436a02f6bfab25d379a574bc9b400de07c2d287a5` | 门禁引擎 |
| `src/common/门禁引擎/governance-roles.ts` | 622 | `f394a8a1742b9d269eb237b6d8335a79ee74bdec5acd446f65dde51f50900d83` | 门禁引擎（本提案结论：不改） |
| `test/门禁引擎/versioned-doc-guard.test.ts` | 352 | `bdba2d246f99edca87f626b7d0c397ac4c12b23e74f73ca101c0cd38775552eb` | 门禁引擎 |
| `test/门禁引擎/versioned-doc-guard-assets.test.ts` | 36 | `f3c7d1821693dd61aab130eb4a33baa514a799e3d5333d63896fb63375004e2e` | 门禁引擎 |
| `test/门禁引擎/shell-write-guard.test.ts` | 258 | `03a333bbce0f419135b8cdb219f588520edc4d017952f1f83acd9053afd25850` | 门禁引擎 |
| `src/pipeline/orchestration/run-role.ts` | 2509 | `0ada2f5299f946130110b4015b902c503856757abd6e178d4fc3aaa911ea6991` | 编排（调用点） |
| `src/common/编排/shell-post-audit.ts` | 303 | `84532812394e6bd46393ee71015958fdc4735f2755ed0ef111b55fa81fdcf84c` | 编排（消费者） |
| `src/common/编排/run-manifest.ts` | 888 | 未逐字节核对（pin/repin 调用点） | 编排（消费者） |
| `src/model/runtime.ts` | 2794 | 未逐字节核对（`WriteGate` 定义） | 运行时核心（跨角色依赖） |
| `src/provider/runtime/tools.ts` | 3890 | 未逐字节核对（write_file/edit_file 内容面） | 运行时核心（跨角色依赖） |

- 门禁引擎套件 B0 最终版基线：`test/门禁引擎/**/*.test.ts` 33 文件 / 292 tests / 291 pass / 0 fail / 1 Windows skip / exit 0（B0 221 行 / `8c6272d5…` §6.6）；T3 全量 3774 tests / 3745 pass / 11 fail（均为既有 EPERM）/ 18 skip。
- 现状**不存在** `.ans/state/doc-freezes.json`、`stable-write/v1`、`stableWriteDecision`、`doc.freeze`/`version.change`/`stable.write.*` 的实现；本特性为新增语义。
- `git status --porcelain -- src test` 为空（无产品/测试候选改动）。

### 1.2 关键现状（只读核对）

| # | 位置 | 事实 |
| --- | --- | --- |
| 1 | `versioned-doc-guard.ts:16-24` | 七类版本化模式（intent/proposal/roster/modules/topology/architecture/assets）；**无 amendment** |
| 2 | `versioned-doc-guard.ts:55-70` | `versionedDocOverwriteDecision({relPath, exists})`：路径匹配且 `exists===true` ⇒ deny；不区分草稿/冻结 |
| 3 | `versioned-doc-guard.ts:80-93` | `checkVersionedDocWrite` 被称为「全通道入口」，全仓无外部调用；仅 `shell-write-guard.ts:18` 导入且未使用（死代码候选） |
| 4 | `versioned-doc-guard.ts:131-147`、`:548-625` | R9 `versions.jsonl` 基线、TOFU、marker、锁、`registerVersionedDocAfterWrite`；`VersionBaselineRecord.event` 仅 `baseline`/`version-added`；verify 逐条记录比对（非 latest-wins） |
| 5 | `versioned-doc-guard.ts:414-426` | `baselineShaFor` 返回首个匹配记录 hash；shell-post-audit 消费 |
| 6 | `shell-write-guard.ts:601-606`、`:642-646` | cp/mv/rm/tee/sed 等显式写目标经 `checkWrite` 后调用 `versionedDocOverwriteDecision({exists:true})`；mv 源与目标都在 targets 中 |
| 7 | `shell-write-guard.ts:474-478` | `protectedPathMention` 用**全部**受管版本化路径做命令文本提及判定（不区分草稿/冻结） |
| 8 | `run-role.ts:849-866` | gate 顺序：trio forbidden → 版本化 exists 判定 → `baseGate`（resolveWrite）；write/edit 的真实判定入口 |
| 9 | `run-role.ts:1235-1250` | shell 写目标守卫与 `checkWrite`（同一 gate）注入；删除/重命名/移动经 shell 通道 |
| 10 | `run-manifest.ts:359-504`、`:509-549` | `prepareRunPin`/`pinRun` 组装并校验文档，**不检查冻结** |
| 11 | `model/runtime.ts:172` | `WriteGate = (targetPath: string) => WriteDecision`：**只有路径，没有内容 hash 上下文** |
| 12 | `provider/runtime/tools.ts:332-351` | `govern(gate, name, path, writeRoot)` 只传路径；`:464-477` write_file 的 `content` 在 gate 调用前已可用；`:423-426` 写入前二次 `govern` 复核 |
| 13 | `shell-post-audit.ts:270-289` | 执行后对照 `baselineShaFor`；draft/frozen 未分开 |
| 14 | `governance-roles.ts:394-402` | convener Section 1 含 `docs/workflow.md` 精确文件条目，且列入 `preauthorizedDirs`（2026-11-04 恢复写权） |
| 15 | `governance-roles.ts:561-622` | `appGovernanceBoundary`/归属指引；`.ans/**`、`角色卡/**` 等禁写由各角色数据保证 |
| 16 | `test/桌面应用/rejection-copy.test.ts:390-398` | 依赖 `versionedDocOverwriteDecision({exists:true})` 返回 `allowed:false` 与 `versioned-doc-overwrite` code |

## 2. 结论摘要

1. **唯一同步冻结判定**：在 `versioned-doc-guard.ts` 内扩展 `versionedDocOverwriteDecision`，接收冻结状态（`frozen: "frozen" | "draft" | "unknown"`），并新增同模块的同步冻结快照解析 `versionedDocFreezeState(projectRoot, relPath, exists)`。真相表：**draft ⇒ 允许（仍受写权）**；**frozen ⇒ 拒绝**；**未知/缓存损坏 ⇒ fail-closed 拒绝**。覆盖 write/edit、shell 写、删除、重命名、移动；pin/re-pin 以同一函数（`operation:"pin"/"repin"` 的「目标必须已冻结」模式）要求目标已冻结。
2. **stable 写入一次性许可**：新增 `stableWriteDecision({projectRoot, relPath, sha256, permit, now})`，校验许可记录与同步许可快照：路径/kind/roleId 绑定、`status==="approved"`、`targetSha256===写入内容 sha256`、`baseSha256===当前文件 hash`、未过期、未消费；无许可/伪造/过期/哈希不符一律拒绝。**许可判定是写权判定之外的附加门，绝不扩写权**。
3. **R9 权威 / `doc-freezes` 派生缓存**：冻结事实以 R9 `versions.jsonl` 的追加记录为权威（`frozen`/`draft-updated`/`draft-marker`）；`doc-freezes.json` 是可重建缓存，带 `baselineSha256`。冻结记录经门禁引擎 C2b 的 `appendDocFreezeRecords`（同锁/fencing）追加，B-6/B-7 不直接写；冻结/许可同步快照均只在 C2b 一份实现，编排只调用 install/refresh/query，不自建第二 Map。为支持 draft 原位改，R9 记录改为 **latest-record-per-path** 校验。
4. **`governance-roles.ts` 不改**：无新增角色/工具/能力/写权；convener 的 `docs/workflow.md` 写权与 `preauthorizedDirs` 保留（作为写权管道），写入当刻的客户确认由 `stableWriteDecision` 机械强制。卡文本中 workflow「预授权直接写」的旧措辞存在可读性风险，处理方式见 §8-C12；若 PM 要求改角色文本，属本提案外的治理文本变更，**停止回报**。
5. **写集**：仅 `versioned-doc-guard.ts`、`shell-write-guard.ts` 与本角色 `test/门禁引擎/**`、本角色 `docs/`；无 B-x 增补、无新模块根、无新权限。

## 3. 冻结判定设计

### 3.1 同步冻结快照（guard 侧）

```ts
export type VersionedDocFreezeSnapshotState = "ready" | "migration-required" | "corrupt" | "unknown";
export type VersionedDocFreezeState = "frozen" | "draft" | "unknown";

export interface VersionedDocFreezeEntry {
  path: string;              // 实际项目相对路径（含 -vN.md）
  version: number;
  sha256: string;            // 冻结时定格 hash
  frozen: boolean;           // true=已冻结；false=草稿/已迁移草稿
  reason?: string;           // doc.freeze reason（不含 migrated-draft）
  applicationId?: string;
  migratedDraft?: boolean;   // 仅 draft-marker 迁移标注
}

export interface VersionedDocFreezeSnapshot {
  v: 1;
  schema: "doc-freezes/v1";
  state: VersionedDocFreezeSnapshotState;
  baselineSha256?: string;   // 快照构建时 versions.jsonl 文件字节 hash（一致性键）
  entries: readonly VersionedDocFreezeEntry[];
  builtAt: string;
}

export function buildVersionedDocFreezeSnapshot(input: {
  records: readonly VersionBaselineRecord[];
  migration: { completed: boolean; draftPaths?: readonly string[] };
  baselineSha256?: string;
  now?: () => Date;
}): VersionedDocFreezeSnapshot;

export function installVersionedDocFreezeSnapshot(projectRoot: string, snapshot: VersionedDocFreezeSnapshot): void;
export function invalidateVersionedDocFreezeSnapshot(projectRoot?: string): void;
export function versionedDocFreezeState(projectRoot: string, relPath: string, exists: boolean): VersionedDocFreezeState;
```

- `versionedDocFreezeState` 返回 `"frozen"`、`"draft"` 或 `"unknown"`（unknown/corrupt/未安装快照）。**生产调用点必须使用本函数**；测试可直接向 `versionedDocOverwriteDecision` 传 `frozen`。
- **单一实现（F7）**：冻结同步快照（`VersionedDocFreezeSnapshot`、安装/刷新/查询）只在门禁引擎 C2b 实现；编排只调用 install/refresh/query，**不得在 `src/common/编排/freeze-snapshot.ts` 或任何调用方自建第二份 Map/快照**。编排侧同名文件应按审核 §5.7 收敛/删除。
- 快照 state 语义：
  - `ready`：已迁移完成；`entries` 中显式 frozen 记录 ⇒ frozen；缺失记录 ⇒ draft。
  - `migration-required`：R9 marker/baseline 缺失、或 baseline 存在但冻结迁移未完成。**既有版本化文档一律视为 frozen**（安全向）；**新路径（exists=false）视为 draft**。历史/证据/已 applied 修正案不得解冻。
  - `corrupt`：baseline/marker/缓存损坏、不可读、行非法、快照结构非法。**所有版本化路径变更一律拒绝**（含 draft 与新建 vN+1），不自动重建、不自动放开。
  - `unknown`：快照未安装（会话启动前/刷新失败）。同样 fail-closed 拒绝版本化路径变更，并给出可操作提示。
- 迁移标注：`migrated-draft` **不是** `doc.freeze` reason；它只出现在 baseline 的 `event:"draft-marker"` 记录、`DocFreezeLookup.migrationMark` 与视图。冻结记录/`draft-marker` 由门禁引擎 C2b 的 R9 追加 API（`appendDocFreezeRecords` 及同锁/fencing 的 draft-marker 追加）写入；B-6/B-7 不直接写 `versions.jsonl`。`.ans/state/freeze-migrated.json` 若采用，仅作迁移**进度标记**（baselineSha256/记录数/时间），不得成为第二冻结权威。
- 刷新纪律：会话打开/应用启动时由编排预加载并 `install`；`doc.freeze` 追加后、`registerVersionedDocAfterWrite` 成功后、迁移完成后必须刷新或使快照失效；刷新失败 ⇒ 安装 `unknown`（fail-closed），不得沿用旧快照。C2b/C2c 联合测试须覆盖"冻结后不手动刷新也立即拒绝覆盖"。
- 旧 app 读新 event（`frozen`/`draft-updated`/`draft-marker`）会按 `baseline-corrupt` fail-closed（安全向）；E1 必须披露，不静默改成"未知即跳过"。

### 3.2 `versionedDocOverwriteDecision` 扩展

```ts
export type VersionedDocOperation = "write" | "edit" | "delete" | "rename" | "move" | "pin" | "repin";

export function versionedDocOverwriteDecision(input: {
  relPath: string;
  exists: boolean;
  frozen?: VersionedDocFreezeState; // 测试/已注入状态；生产应由 versionedDocFreezeState 提供
  projectRoot?: string;      // frozen 缺省时用于同步解析
  operation?: VersionedDocOperation; // 缺省 write
  destRelPath?: string;      // rename/move 目标
  destExists?: boolean;
  destFrozen?: VersionedDocFreezeState;
}): VersionedDocDecision;
```

```ts
export type VersionedDocDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      code: "versioned-doc-overwrite" | "versioned-doc-not-frozen";
      rejection: MechanicalRejection;
    };
```

真值表（版本化路径且 `normalizeVersionedDocPath` 通过）：

| 场景 | exists | frozen | operation | 结果 |
| --- | --- | --- | --- | --- |
| 新建版本文件（快照 ready / migration-required） | false | 任意 | write/edit | allow（新版本必须为 N+1 由登记兜底；仍受写权） |
| 新建版本文件（快照 unknown / corrupt） | false | 任意 | write/edit | deny `versioned-doc-overwrite`（fail-closed；不因"文件不存在"放行） |
| 原位改草稿 | true | draft | write/edit | allow（仍受写权；登记走 draft-updated） |
| 覆盖/删除/改名/移动已冻结 | true | frozen | write/edit/delete/rename/move | deny `versioned-doc-overwrite` |
| 删除/改名/移动草稿 | true | draft | delete/rename/move | allow（若 C2c 未支持 R9 变更记录则安全收窄为拒绝，见 §8-C8/E1 披露） |
| 状态未知/损坏 | true | unknown | 任意 | deny `versioned-doc-overwrite`（fail-closed；reason 指明冻结状态不可用） |
| pin/re-pin | true | frozen | pin/repin | allow |
| pin/re-pin | true | draft/unknown | pin/repin | deny `versioned-doc-not-frozen` |
| pin/re-pin | false | 任意 | pin/repin | deny `versioned-doc-not-frozen` |
| rename/move 目标 | destExists=true | destFrozen=frozen | rename/move | deny `versioned-doc-overwrite` |
| rename/move 目标 | destExists=false | 任意 | rename/move | allow（目标为新路径；源另判） |
| 非版本化路径 | 任意 | 任意 | 任意 | allow（本模块不适用；仍受 `resolveWrite`/禁写） |

- **rename/move 同时判源与目标**：源按 `exists:true` 判（冻结拒绝、草稿允许），目标按 `destExists/destFrozen` 判；shell 的 `mv` 已把源与目标都放进 targets，逐目标复用同一判定即可。
- **pin/re-pin 统一入口**：统一用 `versionedDocOverwriteDecision({operation:"pin" | "repin"})` 的语义（实现上由 `operation` 推导「目标必须已冻结」，不新增第二个权威判定函数）。编排在 `prepareRunPin`/`pinRun`/trunk re-pin 前逐文档调用；不存在"跳过判定直接 pin"的路径。**注意**：这里指 run pin / trunk re-pin，不是会话收尾的 `repinIfBootstrapped`（治理边界 re-pin，见 §8-C4）。
- **amendment 模式**：`VERSIONED_DOC_PATTERNS` 增加 `/^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-amendment-v[1-9]\d*\.md$/i`；同步扩展 `docKindOf`（新增 `"amendment"`）、`flowIdOf`、`canonicalPathFor`、`VersionBaselineRecord.doc` 联合与 `readBaselines` 校验。修正案提交冻结后编辑被同一判定拒绝。
- **legacy 兼容**：冻结拒绝与 unknown 拒绝都保留 code `versioned-doc-overwrite`（`test/桌面应用/rejection-copy.test.ts:390-398` 继续绿）；reason 区分「已冻结」与「冻结状态不可用」。pin 非冻结使用新 code `versioned-doc-not-frozen`。
- **`checkVersionedDocWrite`**：全仓无外部调用（仅 `shell-write-guard.ts:18` 的死导入）。建议**删除导出与导入**（AC-15 允许"对齐/删除"两种）；若 PM 要求保留，则实现为薄包装并同样使用 `versionedDocFreezeState`，不得成为第二权威判定。
- **`versionedDocExists`** 保留（只做模式+存在性探测，不判冻结）。

### 3.3 冻结与写权的关系

- 冻结判定只回答「这个既有版本化路径能否被变更」；**不扩写权**。draft 原位改仍须通过 `resolveWrite`/Section 1/F6/F4/条件/符号链接/F10 等既有门禁；跨角色/边界外照旧拒绝。
- gate 顺序保持：trio forbidden → 冻结判定 → `baseGate`（或等价的写权判定顺序）；冻结 allow 不得短路写权判定。
- `run-role.ts` 的调用点由编排 S3 改传 `projectRoot` 并使用 `versionedDocFreezeState`；本角色只提供函数与契约，不越界改 `run-role.ts`。

## 4. stable 写入一次性许可设计

### 4.1 stable 路径识别

```ts
export type StableWriteKind = "workflow" | "role-card" | "boundary";

export function stableWritePathOf(relPath: string):
  | { kind: StableWriteKind; roleId?: string; path: string }
  | undefined;
```

| 路径 | 匹配 | 说明 |
| --- | --- | --- |
| `docs/workflow.md` | exact（规范化、大小写不敏感比较） | 仅 convener 经 stable-write 卡 |
| `角色卡/<roleId>/role-card.md` | 单层项目角色目录 | `<roleId>` 不得为路径分隔/`.`/`..`；内置角色 id（`chief`/`product`/`rapporteur`/`nominator`/`convener`/`verifier`/`su`）拒绝 |
| `角色卡/<roleId>/boundary.yaml` | 单层项目角色目录 | 同上；`角色卡/governance-boundary.yaml` 不匹配（应用专用，非 stable） |
| 其它 | 不匹配 | 不由 stable 判定处理 |

- 复用 `normalizeVersionedDocPath` 的规范化/逃逸拒绝逻辑；Windows 反斜杠、`../`、绝对路径、大小写变体必须有测试。
- `stableWritePathOf` 不判断写权；写权仍由 `resolveWrite`/forbidden 决定。

### 4.2 许可记录与同步快照

```ts
export interface StableWritePermitView {
  v: 1;
  schema: "stable-write/v1";
  requestId: string;                 // sw-<n>
  roleId: string;
  path: string;
  kind: StableWriteKind;
  baseSha256: string;                // 目标当前 hash；文件不存在时为 ""
  targetSha256: string;              // 批准的内容 hash
  diffPreview?: string;
  status: "requested" | "approved" | "rejected" | "written" | "failed";
  decisionId?: string;               // 批准后必填
  confirmationId?: string;
  approvedAt?: string;
  expiresAt?: string;                // 批准后必填；ISO 时间
  consumedAt?: string;               // 写入成功后由服务写入
  at: string;
}

export function installStableWritePermitSnapshot(projectRoot: string, permits: readonly StableWritePermitView[]): void;
export function noteStableWritePermitConsumed(projectRoot: string, requestId: string, at: string): void;
export function invalidateStableWritePermitSnapshot(projectRoot?: string): void;

export function stableWriteDecision(input: {
  projectRoot: string;
  relPath: string;
  sha256: string;                    // 即将写入的**最终字节** sha256
  permit?: StableWritePermitView;    // 选择器；必须与同步快照一致
  now?: () => Date;
}): StableWriteDecision;
```

```ts
export type StableWriteDecision =
  | { allowed: true; requestId: string; decisionId: string; confirmationId?: string }
  | {
      allowed: false;
      reason: string;
      code:
        | "stable-write-permit-required"
        | "stable-write-permit-invalid"
        | "stable-write-permit-expired"
        | "stable-write-hash-mismatch"
        | "stable-write-base-mismatch"
        | "stable-write-unavailable"
        | "stable-write-channel-required";
      rejection: MechanicalRejection;
    };
```

- **同源**：`stableWriteDecision` 与 `versioned-doc-guard` 同模块、同路径规范化/快照实现（不另建第二套路径判定或许可权威）；shell/opaque 无内容 hash ⇒ stable 目标拒绝。
- **权威在服务（C2c）/存储（B-6）**：guard 只校验"已安装的同步许可快照"与许可选择器；不写 `.ans`、不持久化许可、不发明确认。**许可同步快照只在门禁引擎 C2b 维护一份**；编排/桌面只调用 install/consume/invalidate/query，不得自建第二份 Map。快照未安装/损坏 ⇒ 拒绝（fail-closed）。
- **同步判定（F5）**：`stableWriteDecision` 不做状态变更——不写盘、不消费许可、不发事件；base 校验只读当前文件 hash。`status==="approved"`、`path/kind/roleId` 与 `stableWritePathOf` 一致、`sha256===targetSha256`、`baseSha256` 与当前文件一致（文件不存在时 `baseSha256===""`）、`approvedAt/expiresAt` 合法且未过期、未消费、许可与同步快照逐字段一致；无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝（fail-closed）。
- **许可必须与快照逐字段一致**：`requestId` 必须存在；`path`/`kind`/`roleId`/`baseSha256`/`targetSha256`/`decisionId` 必须与快照记录一致；仅比对调用方传入的 permit 对象不算数（防伪造/陈旧对象）。
- 状态：仅 `approved` 可通过；`requested`/`rejected`/`written`/`failed`/带 `consumedAt` 一律拒绝。
- 过期：`expiresAt` 缺失/不可解析/`now > expiresAt` ⇒ 拒绝 `stable-write-permit-expired`。TTL 默认 30 分钟（C2c 常量、可测；审核 C5）；C1 `stable-write/v1` 必须补齐 `expiresAt`，否则 AC-35「过期许可」无法实现。
- 内容 hash：`sha256` 必须为 64 位十六进制；`sha256 === permit.targetSha256`，否则 `stable-write-hash-mismatch`。
- base 校验：guard 同步读取当前文件 hash（`readFileSync` + sha256）；文件不存在时要求 `permit.baseSha256 === ""`；文件存在时要求 `currentSha === permit.baseSha256`，否则 `stable-write-base-mismatch`（批准后文件被改 ⇒ 拒绝，重走确认）。
- 路径/kind 一致：`stableWritePathOf(relPath)` 必须存在且与 permit 的 kind/path 一致；workflow 的 roleId 必须为 `convener`；role-card/boundary 的 roleId 必须等于路径目录名。
- **一次性：pre-write 判定 + post-write 复核后消费（审核 §4.3 裁决）**：
  - pre-write：gate 用 `stableWriteDecision({projectRoot, relPath, sha256: 最终字节 sha, permit})` 判定；**不消费**；write_file 路径两次 `govern` 都能通过。
  - post-write：写入完成后由 B-11 `completeWrite(actualSha)` 重新计算实际字节 sha；`actual===targetSha` ⇒ 在 `stable-writes` 存储锁内标记 `written`/`consumedAt`、刷新许可快照、执行 mini re-pin。
  - 失败/不符/异常 ⇒ 标记 `failed` 并**同时作废该许可**（`failed`/`consumed`，不得保留可复用的 `approved` 许可）、不更新 trunk 快照、进恢复；客户/发起方需重新确认。
  - 桌面/渲染不缓存、不签发、不复算许可；许可 TTL 默认 30 分钟（C2c 常量、可测），过期拒绝且不自动补发。
  - TOCTOU：base 校验 + 原子写 + 写后 sha 复核 + 一次性消费共同收窄窗口；残余窗口（gate 判定与写入之间文件被外部改）如实披露，T1 故障注入（base 变化、post-write 不符、许可复用、过期、快照不可用）。

**F5 判定/动作归属：**

| 判定/动作 | 归属 | 时机 |
| --- | --- | --- |
| `status==="approved"`、path/kind/roleId、targetSha、baseSha、expiry、未消费、快照一致性 | 门禁引擎 C2b `stableWriteDecision`（同步、只读、fail-closed） | pre-write |
| 许可签发/install、`expiresAt` 生成（TTL 30 分钟） | 编排 C2c/B-7 + 桌面 D1 卡通道 | 客户批准后 |
| 实际字节 sha 复核、`written`/`consumedAt`、失败作废许可、mini re-pin | 编排 B-11 `completeWrite(actualSha)` / B-7 存储锁 | post-write |
| 许可缓存/复算/签发 | 桌面/渲染一律不做 | 任意 |

### 4.3 全通道接线矩阵

| 通道 | 调用点（归属） | guard 入口 | 备注 |
| --- | --- | --- | --- |
| write_file / edit_file（版本化） | `run-role.ts` gate（编排 S3）→ `src/provider/runtime/tools.ts`（运行时核心） | `versionedDocOverwriteDecision` | `WriteGate` 按审核扩可选上下文 `(path, context?: { contentSha256?; operation? })`；见 §8-C6 |
| write_file / edit_file（stable） | 同上 | `stableWriteDecision` | 运行时核心在 `tools.ts` 第二次（写入前）`govern` 传最终字节 sha；S3 对 stable 路径消费 `context.contentSha256`；无上下文 ⇒ 拒绝 |
| shell 写（cp/tee/sed -i/重定向/脚本） | `shell-write-guard.ts`（本角色）← `run-role.ts:1239-1250` | `versionedDocOverwriteDecision` + stable target 拒绝 | shell 不提供 content hash ⇒ stable 目标一律拒绝并提示走 stable-write 通道 |
| shell 删除（rm/del/erase/rmdir/shred/truncate） | `shell-write-guard.ts` | 同上（按 targets 逐项） | 删除冻结 ⇒ deny；删除草稿 ⇒ allow（Batch 1 前无 R9 变更记录则安全收窄，见 C8） |
| shell 重命名/移动（mv/move/ren/rename，含 `-t`） | `shell-write-guard.ts` | 源+目标逐项 | 源与目标都判；冻结任一 ⇒ deny |
| pin（run pin） | `run-manifest.ts:prepareRunPin/pinRun`（编排 S3） | `versionedDocOverwriteDecision({operation:"pin"})` | 逐文档；只 pin 冻结文档（AC-25）；bootstrap 在 pinRun 锁内先写 `doc.freeze(handoff-pin-bootstrap)` 再 pin |
| re-pin（trunk apply/emergency） | trunk runtime / apply-journal（编排 S3） | `operation:"repin"` | 同上；失败不改 trunk 指针 |
| appointment-write（role-card/boundary） | 桌面 `session.ts`/`interface.ts`（桌面窗口 D1） | `stableWriteDecision` | 沿用既有 appointment-write 卡；写入前校验许可与 base/target；写后钩子 `completeWrite` + mini re-pin |
| workflow stable-write 卡 | `stable-write-runtime.ts`（编排 B-11）+ 桌面 IPC（D1） | `stableWriteDecision` | 卡批准 ⇒ 生成许可并 install 快照；拒绝 ⇒ 无许可；不缓存/不复算 |
| 会话启动/刷新 | 编排/桌面（D1/S3） | `installVersionedDocFreezeSnapshot` / `installStableWritePermitSnapshot` | 加载失败 ⇒ unknown/corrupt ⇒ fail-closed；编排不自建快照 Map |
| shell 执行后审计 | `shell-post-audit.ts`（编排 S3） | 复用 `baselineShaFor`/冻结状态 | draft/frozen 分开判定；不归本角色改 |

- **顺序纪律**：任何 stable/冻结判定都排在写权判定之后（或至少不短路写权）；`forbiddenWritePaths`、`resolveWrite`、F6/F4/F7 不变。
- **C13 mention 裁决（审核不采纳放宽）**：`protectedPathMention` **保留现状**——所有受管版本化路径在命令文本中出现即 deny（ready/unknown/corrupt 一致），避免 opaque shell 事后违规；"精确目标"判定才使用 frozen 状态。本提案 §11.1 按此改写，不实现"仅 frozen 路径 mention"。
- **C15 execution 裁决**：本轮**不**把 execution（teamPlan/flow）加入 guard 版本化模式；execution 冻结/re-pin 由 VCA/trunk manifest + verify 保证；E1/E2 披露「execution 非 guard 冻结」。若策划要求 guard 级执行，属方案澄清/范围变化，停止回报。
- **桌面 appointment-write 直接落盘路径**必须调用 guard 的 stable 判定；这是本特性唯一可能绕过角色 `write_file` gate 的 stable 写入通道，D1 必须接线（AC-33/35）。

### 4.4 拒绝码与文案

| code | 触发 | owner（建议） | 说明 |
| --- | --- | --- | --- |
| `versioned-doc-overwrite` | 冻结覆盖/删除/移动；冻结状态 unknown/corrupt | `app` | 保留旧 code；reason 区分「已冻结」与「冻结状态不可用」 |
| `versioned-doc-not-frozen` | pin/re-pin 目标非冻结/不存在 | `app` | 新 code；提示先冻结/走 VCA 或 bootstrap |
| `stable-write-permit-required` | stable 路径无许可（含 shell 通道） | `convener` / `nominator`（按 kind） | 提示走 stable-write 确认卡 / appointment-write |
| `stable-write-permit-invalid` | 许可不在快照、字段不一致、伪造 | `app` | 不采信调用方对象 |
| `stable-write-permit-expired` | `expiresAt` 缺失/非法/已过期 | `app` | 重新确认 |
| `stable-write-hash-mismatch` | 写入 sha 不等于 targetSha | `app` | fail-closed，不写 |
| `stable-write-base-mismatch` | 批准后文件已变 | `app` | 重新走确认 |
| `stable-write-unavailable` | 许可快照未安装/损坏 | `app` | fail-closed |
| `stable-write-channel-required` | shell/无法验证内容的通道写 stable | `convener` / `nominator` | 改用 stable-write 通道 |

- 新 code 用 `makeMechanicalRejection(code, missing, { owner, action, retryable, docs })` 显式覆盖 owner/action，**不依赖** `src/common/编排/mechanical-rejection.ts` 的中央表；该文件属编排写集，若编排/PM 决定把新 code 登记进 RULES，由其自行登记（可选，不是本角色写集）。
- 所有拒绝保留三段式（缺什么/下一步/谁来做/技术 code），便于模型与客户卡消费。

## 5. R9 权威与派生缓存一致性（按审核 §4.2 裁决）

1. **记录形状（追加 variant，不改既有记录）**：
   - `event:"frozen"` + `freeze: { applicationId, reason, origin, decidedBy?, decisionId?, frozenAt, actorRoleId? }`；子形状 = C1 `DocFreezeRecord`，由门禁引擎 **type-import，不复制**；
   - `event:"draft-updated"`（同 path/version 新 sha，表示草稿原位改）；
   - `event:"draft-marker"`（`migrated-draft` 证据标记；不写 `doc.freeze`）；
   - 保留 `baseline`/`version-added`；`DOC_FREEZE_REASONS` 不含 `migrated-draft`。
2. **latest-record-per-path**：`verifyVersionedDocBaselinesLocked`、`baselineShaFor`、`registerVersionedDocAfterWrite` 改为「同一实际路径最后一条记录为准」；历史记录保留不删。冻结记录是该 path/version 的终态：冻结后同 path/version 不同 sha ⇒ 违规。
3. **draft 原位改登记**：`registerVersionedDocAfterWrite` 对"已记录同版本、当前为 draft"的写成功追加 `draft-updated` 并更新快照；对 frozen 直接 `false`（fail-closed）；"当前最大 N+1"仍要求版本头合法。现状对同 path/version 不同 sha 返回 false，必须改，否则 AC-1/AC-27 的 draft 保存会被误报。
4. **迁移标记承载**：`migrated-draft` 只出现在 baseline `event:"draft-marker"`、`DocFreezeLookup.migrationMark` 与视图；`.ans/state/freeze-migrated.json` 若采用仅作迁移**进度标记**（`baselineSha256`/记录数/时间），**不得成为第二本冻结权威**；`doc-freezes.json` 仅为可重建缓存。
5. **写入者单一（F7 相关）**：冻结记录只经门禁引擎 C2b 的 `appendDocFreezeRecords`（同 `versions.lock`/fencing）追加；`draft-marker` 经同一 R9 追加 API；**B-6/B-7 不直接写 `versions.jsonl`**。`registerVersionedDocAfterWrite` 仍由门禁引擎维护。冻结同步快照/许可同步快照均只在 C2b 一份实现；编排不得自建第二份 Map（含 `src/common/编排/freeze-snapshot.ts`）。
6. **缓存一致性**：`doc-freezes.json` 头部 `baselineSha256` 与当前 baseline 文件 hash 不一致 ⇒ 从 baseline 重建并告警；缓存缺失 ⇒ 重建；缓存损坏 ⇒ fail-closed，不自动重建/放开；**guard 只消费安装后的同步快照，不直接读缓存文件**；快照不可用（unknown/corrupt）⇒ 所有版本化写判定拒绝（含 draft 与新建），面板提示恢复。
7. **旧 app 兼容**：旧 app 读新 event 值会按 `baseline-corrupt` fail-closed（安全向），E1 必须披露；不静默改成"未知即跳过"。
8. **告警**：快照 `baselineSha256` 与当前 baseline 不一致、快照条目重复/冲突、冻结后又改 ⇒ 告警并以 baseline 重建；告警不改变 fail-closed 方向。

## 6. `governance-roles.ts` 影响分析（结论：不改）

- **不改注册表数据**：六个内置角色的 id/显示名/function、`entries`、`preauthorizedDirs`、`forbiddenWritePaths`、`capabilities`、卡文本均不动；不新增工具/角色/卡种/权限。
- **convener `docs/workflow.md`**：Section 1 精确文件条目与 `preauthorizedDirs` 保留。P1.6 的"预授权直写取消"由 `stableWriteDecision` 在写入当刻机械强制，而非通过删除写权实现；删除条目会真正撤销写权（与 P1.6 "保留运营写权"冲突）。`test/门禁引擎/convener-workflow-write.test.ts` 的现有断言继续成立。
- **nominator `角色卡/**`**：仍在 Section 1；role-card/boundary 写入沿用 appointment-write 卡，stable 许可只在写门禁层附加校验；appointment-write 语义不变。
- **消费关系**：`stableWritePathOf` 需要拒绝内置角色 id，可直接 import 同目录 `isBuiltInGovernanceRoleId`（只读消费，不改该文件）。
- **可读性风险**：`CONVENER_CARD_TEXT` 与 `BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE` 中「Section 1 边界内的写入是预授权……直接写」对 `docs/workflow.md` 将不再完整（写入还需 stable-write 确认卡）。本提案不擅自改角色文本；拒绝码 `stable-write-channel-required` 的文案会给出可操作指引。若 PM/C2b 认为必须改文本：属角色文本/治理变更，超出本 P1 授权，**停止回报**，按 H1/沟通程序另行确认（§8-C12）。

## 7. P1.6 注意点映射

### 7.1 §5.4 九条（P1.6 §10.5-7 继续有效）

| # | 注意点 | 本提案落点 |
| --- | --- | --- |
| 1 | R9 权威、`doc-freezes` 派生缓存、不一致以 baseline 为准、不得双写双判 | §3.1、§5 |
| 2 | 守卫真实调用点（shell 写/删/改名/移、run-role write/edit），覆盖 pin/re-pin；`checkVersionedDocWrite` 无外部调用不得依赖 | §1.2-3、§3.2、§4.3；建议删除死代码 |
| 3 | 迁移默认：既有文档一律冻结；仅 `migrated-draft` 可改；missing=迁移、corrupt=fail-closed；历史/证据/已 applied 不得解冻 | §3.1 状态机 |
| 4 | Bootstrap：首次 handoff pin 写 `doc.freeze`；无 trunk VCA `baseTrunk:null`；`pinRun` 只 pin 冻结文档 | §3.2 pin 判定；pin 前按 bootstrap 冻结记录安装快照；无冻结 ⇒ deny（不产生死锁，前提是编排先写冻结并刷新） |
| 5 | VCA 通道/批准前哈希重验 | 不在本角色；guard 提供 `sha256`/`targetSha256` 判定原语，service 负责提交/批准时点 |
| 6 | 重构写集机械限制 | guard 机械拒绝 stable 无许可写入与冻结版本化写入；重构任务写集由编排/WriteGate 限制（本角色不扩权） |
| 7 | detail 最小项 | 不在本角色；amendment 模式只影响 amendment 文档冻结，不影响 item 选择 |
| 8 | stable 单一路径 | §4；stable 不进 VCA/frozen 判定，只走 permit |
| 9 | 基线披露 | 头部/§0/§1；HEAD `89b1fb2`，旧证据不复用 |

### 7.2 §10.5 P1.6 七条

| # | 注意点 | 本提案落点 |
| --- | --- | --- |
| 1 | workflow 写路径：保留 convener 写权，改为写前轻量确认卡，不改 appointment-write | §4.1、§6；guard 只拦无许可写入 |
| 2 | stable 写入门禁：一次性许可、写入 hash 必须等于 targetSha、异常 fail-closed/恢复、无 drift | §4.2、§4.3 |
| 3 | mini re-pin：确认即更新 trunk manifest、绑定 decisionId/confirmationId、不升 trunkVersion | 不在本角色；`stableWriteDecision` 返回 `requestId`/`decisionId` 供 B-11/D1 绑定；guard 不为 stable 写冻结记录 |
| 4 | VCA 收窄：workflow/boundary/product-intent 不作 VCA 目标 | 本角色不校验 VCA target（service 职责）；guard 确保 stable 写入只能走 stable 通道，不能借 write_file/shell 绕过 |
| 5 | 模块归属：`versioned-doc-guard`/`stableWriteDecision` 属门禁引擎；service/pipeline/desktop 各归其主 | §8 写集与跨角色依赖 |
| 6 | 不升 trunkVersion | 不在本角色；guard 不触碰 trunk manifest |
| 7 | 其余九条继续有效 | §7.1 |

## 8. 契约冻结前澄清项（C2b/C2c/PM 确认）

| # | 事项 | 建议/推荐 | 若不解决的后果 |
| --- | --- | --- | --- |
| C1 | `doc-freezes/v1` 快照/cache 归属与格式 | **审核采纳**：C2b 定义 builder/parser 与快照状态（单一实现）；B-6 只持久化、编排只 install/refresh/query；**不得在 `freeze-snapshot.ts` 或调用方自建第二 Map** | 两套格式/双解析器，AC-27 与 F7 风险 |
| C2 | 迁移完成标记 | **审核采纳（有条件）**：`.ans/state/freeze-migrated.json` 仅迁移进度标记（baselineSha256/记录数/时间），不得成为第二冻结权威；`migrated-draft` 证据在 baseline `event:"draft-marker"`；未完成前既有文档 frozen、新文件 draft；完成后无冻结记录=draft | 无法区分 legacy frozen 与新 draft，AC-10/AC-1 失败 |
| C3 | `frozen` 注入信任边界 | **审核采纳**：生产只用 `versionedDocFreezeState`（返回 `frozen|draft|unknown`）；禁硬编码；集成测试锁定 run-role/shell 调用 | 调用方可伪造 draft，绕过冻结 |
| C4 | pin/re-pin 入口形态 | **审核采纳**：同一 `versionedDocOverwriteDecision` 的 `operation:"pin"/"repin"`；bootstrap 在 `pinRun` 锁内先写 `doc.freeze(handoff-pin-bootstrap)` 再 pin；不含 `repinIfBootstrapped` 治理边界 re-pin | AC-15 "唯一判定"歧义；pin 漏判 |
| C5 | `stable-write/v1` 补齐 `approvedAt`/`expiresAt`/`consumedAt?`；base 空值约定 | **审核采纳**：C1 补齐字段；`expiresAt` 批准后必填；TTL 默认 30 分钟（C2c 常量、可测）；`baseSha256=""` 表示文件不存在 | AC-35 "过期/一次性"无法实现 |
| C6 | write/edit 的最终内容 sha 如何到 gate | **审核采纳**：C1 扩 `WriteGate` 为 `(targetPath, context?: { contentSha256?; operation? })`；运行时核心 `tools.ts` 第二次 `govern` 传最终字节 sha（write_file 用 content Buffer；edit_file 在应用编辑后、原子写前计算），`tools.ts` 补入 C1/S3 写集并按团队计划 §4.1 枚举补登披露（不是边界变更）；S3 对 stable 路径消费；无上下文一律拒绝 stable，**不得以写后验证替代写前判定** | 无法在写前判 stable hash；只能事后验证，留下窗口 |
| C7 | shell 写 stable | **审核采纳**：一律拒绝（无法预知 content hash），提示 stable-write 通道；opaque 命令文本提及 stable 也拒绝 | shell 绕过 stable 确认 |
| C8 | 删除/改名/移动已登记草稿的 R9 变更 | **审核采纳**：Batch 1 前 C2c/B-6 支持 `removed`/`moved` 记录或重建则 allow；若 Batch 1 前不支持则 guard 拒绝已登记草稿的删除/改名/移动（安全收窄）并由 E1 披露 | verify 报 missing，AC-27 失败 |
| C9 | stable 删除/改名/移动 | **审核采纳**：本特性拒绝（无 permit kind；stable 路径固定） | 无确认删除/改名绕过 |
| C10 | unknown/corrupt 时新建版本 | **审核采纳**：拒绝所有版本化路径变更（含 draft 与 vN+1）；`migration-required` 下新文件允许 | "corrupt 当空注册表全放"反例失败 |
| C11 | `checkVersionedDocWrite` | **审核采纳**：删除导出/死导入；AC-15 多解允许；若保留则薄包装同一判定 | 死代码误导/双入口 |
| C12 | `governance-roles.ts` 文本 | **审核采纳**：不改；靠拒绝文案指引；若必须改文本，停止回报走治理变更 | 角色按旧卡文本直写被拒，产生困惑 |
| C13 | `protectedPathMention` | **审核裁决：不采纳放宽**。保留现状——所有受管版本化路径 mention deny（ready/unknown/corrupt 一致），避免 opaque shell 事后违规；精确目标判定才用 frozen 状态；本提案相应改写，不做"仅 frozen 路径 mention" | 放宽会漏掉 opaque shell 对冻结路径的提及 |
| C14 | legacy code 兼容 | **审核采纳**：保留 `versioned-doc-overwrite`（frozen+unknown）；pin 用 `versioned-doc-not-frozen`；`rejection-copy` 回归 | 跨角色旧测试/文案漂移 |
| C15 | execution（teamPlan/flow）冻结 | **审核裁决：不纳入 guard**。本轮不把 execution 加入版本化模式；execution 冻结/re-pin 由 VCA/trunk manifest + verify 保证；E1/E2 披露「execution 非 guard 冻结」；若策划要求 guard 级执行，停止回报（方案澄清/范围变化） | 若纳入会扩 guard 模式与测试面 |
| C16 | `doc.freeze` 后快照刷新 | **审核采纳**：C2c 经 `appendDocFreezeRecords` 写入后同步调用 refresh/install；刷新失败 ⇒ unknown；C2b/C2c 联合测试 | 冻结后短暂可覆盖 |
| C17 | 许可快照刷新/消费 | **审核采纳**：B-7/B-11 批准后 install、post-write `completeWrite(actualSha)` 后 consume；失败作废许可；D1/B-11 接线；联合测试 | 伪造/复用许可 |
| C18 | 路径大小写/反斜杠/规范化 | **审核采纳**：统一 `normalizeVersionedDocPath`；stable 比较大小写不敏感；测试覆盖 `..`/绝对/反斜杠/大小写 | Windows 绕过/误判 |

## 9. 风险

| ID | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 冻结快照陈旧（冻结后未刷新） | 高：可覆盖已冻结文档 | C16 刷新契约；`registerVersionedDocAfterWrite` 更新快照；刷新失败 install unknown；联合测试 |
| R2 | 迁移误判（legacy 当 draft 或新 draft 当 legacy） | 高：历史可改/草稿被锁 | C2 迁移标记；默认 frozen；`migrated-draft` 证据；测试 |
| R3 | R9 与 `doc-freezes` 双账/漂移 | 高：判定不一致 | baseline 权威；缓存在 `baselineSha256` 不符时重建；告警；不双写双判 |
| R4 | draft 原位改登记失败（现状 `existing.sha256` 比较） | 高：draft 保存被误报失败 | §5.3 `draft-updated` + latest-wins；AC-1/AC-27 测试 |
| R5 | stable 许可 TOCTOU/并发 | 高：同一许可双写 | pre-write targetSha + base 校验；服务按路径串行 + post-write `completeWrite` 复核后 `written`/`consumedAt`；失败作废许可；联合测试；如实披露残余窗口 |
| R6 | `WriteGate` 只有路径，stable content hash 缺失 | 高：stable 写入绕过 hash 校验 | C6 审核裁决：`WriteGate` 可选上下文 + `tools.ts` 第二次 govern 传最终字节 sha；无上下文一律拒绝 stable；D1/S3 接线 |
| R7 | shell/opaque 绕过 stable/冻结 | 高：cp/tee/脚本写 stable 或冻结文档 | shell 目标逐项判定；stable target 拒绝；opaque mention **保留全路径 deny**（C13 裁决）；测试 |
| R8 | 删除/改名已登记草稿破坏 R9 | 中高：verify missing | C8：Batch 1 前 C2c/B-6 支持 `removed`/`moved` 或重建；否则 guard 安全收窄并 E1 披露 |
| R9 | bootstrap/pin 死锁（快照未装/冻结未写） | 中高：新项目无法 pin | bootstrap 先写 freeze 再刷新再 pin；AC-25 测试；unknown 下拒绝但可操作提示 |
| R10 | 角色卡文本陈旧（预授权直写） | 中：模型困惑/拒绝循环 | C12 文案指引；若需改文本停止回报 |
| R11 | 跨角色测试漂移（rejection-copy/convener-workflow-write/shell-gate） | 中：误报回归 | 保留 legacy code；`convener-workflow-write` 不动；与桌面/编排协调 |
| R12 | 启动未安装快照导致全部版本化写入拒绝 | 中：可用性 | 会话启动预加载；unknown 拒绝并提示重开/刷新；T2 真实运行 |
| R13 | 路径规范化漏洞（大小写/反斜杠/`..`） | 中高：绕过 | 复用 `normalizeVersionedDocPath`；stable 专用测试 |
| R14 | execution 冻结缺口 | 中：trunk 执行工件漂移 | C15 裁决：execution 不在 guard；由 VCA/trunk manifest + verify 保证；E1/E2 披露 |
| R15 | 新拒绝 code 未进 `mechanical-rejection` 中央表 | 低：fallback owner=app | guard 显式 overrides；编排可选登记 |
| R16 | 编排/调用方自建冻结/许可快照第二 Map | 高：双实现不一致 | F7/C1 裁决：快照只在 C2b 一份；编排只 install/refresh/query，删除 `freeze-snapshot.ts` 第二实现 |

## 10. 验收证据贡献（本角色测试点）

> 本角色不单独判 AC；以下为 E2 可复算的测试点与证据来源，最终由内置独立验收按 V1 v1.1 判定。

| AC | 本角色贡献 | 测试落点 |
| --- | --- | --- |
| AC-1（冻结按确认） | draft 原位改 allow、frozen 覆盖 deny、新版本 allow、unknown deny、write/edit 通道 | `versioned-doc-guard.test.ts` 扩展 |
| AC-2（修正案提交冻结） | `-amendment-vN.md` 识别；已冻结 amendment 编辑 deny；draft amendment allow | `versioned-doc-guard.test.ts` |
| AC-10（冻结迁移） | migration-required / missing=迁移 / corrupt=fail-closed / migrated-draft allow / 历史不可解冻 | `versioned-doc-guard.test.ts` 新组 |
| AC-13（边界/写权/闸门） | stable 判定不绕过 `resolveWrite`/forbidden；内置角色 stable 路径拒绝；appointment-write 语义不变 | `stable-write-guard.test.ts`、`convener-workflow-write.test.ts` 回归 |
| AC-15（守卫回归） | 全通道矩阵：write/edit/shell/delete/rename/move/pin/repin；draft/frozen/missing/corrupt；amendment；`checkVersionedDocWrite` 处理；old 七类回归；stable 走 permit | `versioned-doc-guard.test.ts`、`shell-write-guard.test.ts`、`stable-write-guard.test.ts` |
| AC-21（注册表恢复） | corrupt 快照 fail-closed，不自动重建/放开 | `versioned-doc-guard.test.ts` |
| AC-25（bootstrap 首次冻结） | `operation:"pin"` 仅 frozen 通过；无冻结/unknown deny；bootstrap 冻结安装后可 pin | `versioned-doc-guard.test.ts` |
| AC-26（批准前哈希重验） | guard 提供 targetSha/baseSha 判定；service 在提交/批准/apply 调用（不在本角色） | `stable-write-guard.test.ts` 的 hash 组 |
| AC-27（R9 一致性） | latest-record-per-path、`draft-updated`/`frozen`、`baselineShaFor`、快照/cache digest、draft/frozen 分离 | `versioned-doc-guard.test.ts` R9 组 |
| AC-30（stable 单一路径） | stable 路径只接受 permit；shell/无许可拒绝；frozen 判定不处理 stable | `stable-write-guard.test.ts`、`shell-write-guard.test.ts` |
| AC-31（事件归属） | guard 不写事件；决策返回 `requestId`/`decisionId` 供 service 记账（部分） | 由编排/账本测试判定 |
| AC-33（stable 确认即写） | workflow/role-card/boundary permit 判定与拒绝路径（卡通道/客户主权由桌面判定） | `stable-write-guard.test.ts`（部分） |
| AC-34（mini re-pin） | 决策返回 `requestId`/`decisionId`；guard 不升 trunkVersion（实现不在本角色） | 由编排/桌面判定 |
| AC-35（stable 写门禁/异常） | 无/伪造/过期/路径/哈希/base/状态矩阵；shell stable 拒绝；fail-closed | `stable-write-guard.test.ts`、`shell-write-guard.test.ts` |
| AC-36（stable UX/审计） | 不适用（UI/面板/i18n 归桌面UI/项目管理） | 无 |

> **C13/C15 裁决的 AC 影响**：C13 保留全路径 mention deny，不削弱 AC-15 的既有七类/旧版本保护；C15 execution 不纳入 guard，AC-6/AC-29 的 execution 冻结由 VCA/trunk manifest + verify 承担，E1/E2 如实披露，不把「非 guard 冻结」写成 guard 已覆盖。

### 10.1 计划测试命令

```text
node --test "test/门禁引擎/**/*.test.ts"
npm run typecheck
```

- T3 全量回归由测试角色按 B0/团队计划执行；本角色只保证自身套件、不重复全量。
- 证据：改前/改后文件行数与 SHA-256；`git status --short`；`git diff --stat` 仅本角色写集；测试原始输出/退出码；`npm run typecheck` exit 0；无新增 skip。
- B0 已为最终版（221 行 / `8c6272d5…`），T3 计数完整；E1/E2 以测试角色最终记录为准，本角色不代填。

## 11. 模块/文件清单（本角色写集内）

### 11.1 计划修改/新增

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `src/common/门禁引擎/versioned-doc-guard.ts` | 修改 | 冻结快照/解析/安装（C2b 唯一实现）；`appendDocFreezeRecords`/draft-marker 追加；`versionedDocOverwriteDecision` 扩展；amendment 模式；`draft-updated`/`frozen` 记录与 latest-wins；`checkVersionedDocWrite` 删除 |
| `src/common/门禁引擎/shell-write-guard.ts` | 修改 | 目标逐项冻结判定；stable 目标拒绝；`protectedPathMention` **保留全路径 deny**（C13 裁决，不放宽） |
| `test/门禁引擎/versioned-doc-guard.test.ts` | 修改 | 冻结真值表、迁移、amendment、pin、R9 latest、回归 |
| `test/门禁引擎/versioned-doc-guard-assets.test.ts` | 修改 | 适配 draft 语义；保留 assets 七类回归 |
| `test/门禁引擎/shell-write-guard.test.ts` | 修改 | shell 写/删/改名/移冻结与 stable 拒绝 |
| `test/门禁引擎/stable-write-guard.test.ts` | 新增 | 许可矩阵、路径匹配、过期/伪造/一次性 |
| `角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-P1.md` | 新增（本文件） | P1 提案 |
| `角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model.md` | 实施期新增（不在本阶段） | C2b/S3 变更记录、证据 |
| `角色卡/门禁引擎/{memo,api-spec,changelog}.md` 等 | 实施期按需 | 不跨角色 |

- 私有目录授权：`src/common/门禁引擎/` 与 `test/门禁引擎/` 已在 Section 1；**无新增模块根、无 B-x 增补**。若 PM 要求把 stable 判定拆独立文件（同目录），仍在私有目录授权内，但默认不拆以对齐 P1.6 §4.6 的单文件表述。

### 11.2 明确不写

- `src/common/门禁引擎/governance-roles.ts`（结论不改；若需改文本停止回报）。
- `src/service/gate/resolve-write.ts`、`src/service/boundary/**`、`src/model/**`（本提案不改；模型字段由 C1 运行时核心冻结）。
- `src/pipeline/orchestration/run-role.ts`、`src/common/编排/run-manifest.ts`、`src/common/编排/shell-post-audit.ts`、`src/common/编排/mechanical-rejection.ts`（编排）。
- `src/provider/runtime/tools.ts`、`src/model/runtime.ts`（运行时核心）。
- `app/**`（桌面窗口/桌面UI）、`src/common/shared/i18n/**`（项目管理）。
- `docs/scheduling|acceptance|communication|planning`、其他角色卡/测试。
- 不 commit/push/启动应用/联系客户。

### 11.3 跨角色依赖（不是本角色写集）

| 依赖 | 角色 | 需要的内容 |
| --- | --- | --- |
| `WriteGate` 内容 hash 上下文 / `tools.ts` 第二次 govern | 运行时核心（C1）+ 编排（S3） | `WriteGate` 可选 `{ contentSha256?, operation? }`；最终字节 sha（C6）；`tools.ts` 补入 C1/S3 写集并按团队计划 §4.1 枚举补登披露 |
| `stable-write/v1` 类型字段（`approvedAt`/`expiresAt`/`consumedAt`） | 运行时核心（C1） | permit 视图结构（C5） |
| `doc-freeze/v1` 子形状（`DocFreezeRecord`） | 运行时核心（C1） | R9 `freeze` 记录字段；门禁引擎 type-import，不复制 |
| 冻结记录写入调用 `appendDocFreezeRecords` | 编排（C2c/B-7、B-6） | 只经 C2b 追加；B-6/B-7 不直接写 `versions.jsonl`（C16） |
| 快照刷新/安装 | 编排（C2c/S2） | `doc.freeze` 后 install/refresh；**不得自建第二 Map / `freeze-snapshot.ts` 第二实现**（F7） |
| run-role/shell-post-audit/run-manifest 调用点 | 编排（S3） | 传 `projectRoot`/冻结解析、pin 判定 |
| B-11 stable-write runtime + D1 appointment-write 接线 | 编排/桌面窗口 | 许可 install、post-write `completeWrite(actualSha)` 消费、失败作废、mini re-pin |
| VCA 卡/面板客户主权 | 桌面窗口/桌面UI | 与本角色无关，但影响 E2 的 AC-18/33 |
| 集成矩阵/T3 | 测试 | 全通道跨层证据 |

## 12. 声明

- 本阶段**未写代码/测试**，未改任何写集外路径，未 commit/push；仅新增本提案文件。
- 本文不构成 P1 批准、契约冻结或验收结论；开工以项目管理 P1 审核 `recommend approval` + 统筹派发 + C2b 契约冻结为准。
- 本文不提出 B-1..B-11 之外的路径、角色或权限；§8 的澄清项若最终要求扩大写集/权限/角色文本，按团队计划停止回报，不自行实施。
