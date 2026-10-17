---
id: governance-pin-recovery-review
type: design
title: 治理记录 pin 不符的重新接受恢复——项目管理评审与拆发
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [governance-pin-recovery, existing-project-compat]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 客户裁定「这个恢复入口按角色链做一下」；PM 批准提案方向与 8 项开放问题默认值，钉死门禁引擎 pin 证据出口、编排预览/写入、桌面窗口 IPC 与桌面UI 单一谓词；修正 finalizeBootstrap 复用边界，补 pin 覆盖守卫、预览摘要防竞态与 listProject 不崩/结构性能验收
---

# 治理记录 pin 不符的重新接受恢复——项目管理评审与拆发

**审查对象**：产品提案 [governance-pin-recovery](../../../产品/docs/design/2026-10-17_design_governance-pin-recovery.md)（revision 1，status proposed）。
**客户裁定（逐字，2026-10-17）**：「这个恢复入口按角色链做一下」。此前客户已认可**不采用「文件一改就自动 hash」**。
**本轮性质**：跨角色评审与拆发，**不写代码**。本文是实施口径与派发计划，不是实施结果；代码尚未改动、测试尚未新增。
**基线**：`main` / `80bfa60`（本轮评审时点）。行号为该时点工作树读数，派发前各角色须按当轮 HEAD 复核；行号漂移不影响契约，按符号名定位。

## 一、结论

**批准按提案方向实施。** V1 范围＝只读 pin 证据检测、`pin-mismatch` 状态、两步确认（预览 → 确认写入）、G1–G8 守卫、桌面入口与测试。恢复动作**只做两件事**：把现有 pin 列表整表重算后写回 `.ans/project.json`，并把一条「重新接受记录」追加进 `docs/bootstrap-manifest.md`。**不修改任何边界文件内容、不增删 pin 条目、不改 `.ans roles` 映射、不改 `acceptance.source`、不自动开会话、不自动接受。**

批准同时附 **4 条必须执行的实施口径修正**（不改变产品方向）：

1. **不得直接调用 `finalizeBootstrap` 本体完成重新接受**。现有 `finalizeBootstrap` 会按 `scanRoles` 重建 pin 目标集与 `.ans roles` 映射（`src/common/编排/finalize.ts:299`、`303-313`），直接复用会新增/删除 pin 条目、改写 roles，违反 AC5 与开放问题 4 的裁定。重新接受写入应复用**同一落盘原语** `gatedAtomicWrite`、`finalizeRelPaths`、`isFile` 与**一次性治理种子边界**，但 `.ans` 与 manifest 的构建走重新接受专用路径（见 §五.2）。
2. **补「治理边界必须被 pin 覆盖」守卫**。`verifyPins` 要求**正在加载的边界文件**至少被一条 pin 覆盖（`boundary-core.ts:390-392`）。若 `.ans` 的 `governanceBoundary.path` 不在 pin 列表中，即使所有 pin 目标哈希一致，su 仍会因「未被任何 pin 覆盖」不可用。检测与写入都必须把这一点判为 `invalid-record`，否则会出现「重新接受成功但项目仍不可用」的假成功。提案未覆盖此点。
3. **预览快照必须成为契约的一部分（G4 的落地方式）**。提案要求「写入前重算并与预览快照比对」，但没有定义快照如何从预览传到写入。本轮钉死：门禁引擎的 pin 证据结果携带 `digest`（对全部 pin 的规范化行求 SHA-256），预览把它作为 `previewDigest` 返回，确认写入时必传并由机制重算比对；不一致 → `preview-stale`、零写入。
4. **AC12 的「现有 `present/missing/invalid` 用例逐字保持」需收窄**。`deriveGovernanceRecord` 纯函数用例可逐字保持；但 `test/桌面应用/interface.test.ts:411-442` 的 `present` 夹具使用了假 pin（`"a".repeat(64)`）。一旦 `listProject` 接入逐文件哈希校验，该夹具会变成 `pin-mismatch`。该测试必须改为**真实哈希夹具**（或明确改为期望 `pin-mismatch`），不得通过放松校验来保绿。

**没有必须返工的方案级问题；没有必须客户再拍板的点。** 8 项开放问题全部采用提案推荐值（§四），其余为实现口径收紧。

## 二、代码事实复核

提案 §1.2 的行号与机制**全部与 HEAD `80bfa60` 一致**，未发现事实性错误：

| # | 提案陈述 | 复核结果 |
| --- | --- | --- |
| 1 | `verifyPins` 在 `boundary-core.ts:374-394`，遍历全部 pin；任一不可读/不符即失败；被加载文件须被覆盖 | ✅ 逐行一致。读取失败（含 ENOENT）统一返回失败，不区分缺失/不可读 |
| 2 | `loadBoundaryFile` 在 `boundary-core.ts:447-452` 统一转 `unaccepted`（条目清空、`accepted:false`、原因入 `parseError`） | ✅ 一致 |
| 3 | `openGovernanceSession` 在 `govern-session.ts:150-155` 对非空 `parseError` 直接抛错 | ✅ 一致（`resolveRole` 后立即 `throw`） |
| 4 | `establishGovernanceRecord` 在 `finalize.ts:709-721` 对已存在记录返回 `already-established` / `invalid-record` | ✅ 一致。**补充事实**：`inspectGovernanceRecord` 的 `usable` 判据只走共享载入器的「pin 存在性/形状」，不比哈希（`config-loader.ts:22-24` 明示），所以 pin 不符时仍判 `usable`——这正是现有入口救不了现场的原因 |
| 5 | 自动重 pin 只在 `run-role.ts:901-914` 的 `settled` 后运行 | ✅ 一致 |
| 6 | 重 pin 的写本身要过 F6：`finalize.ts:189-240` 的 `precheck`；`run-role.ts:907` 传入本次边界；`finalize.ts:871-886` 写前再求一次 | ✅ 一致（`:907` 为 `boundary: setup.role.boundary`） |
| 7 | `project.ts:184-245` 的 `deriveGovernanceRecord` 只派生 `present/missing/invalid`，注释明示不声明 pin 逐文件匹配 | ✅ 一致。**补充事实**：`listProject`（`resolve-role.ts:206-213`）枚举角色边界时用**中性 acceptance**（`accepted:false`、无 pin），所以列举阶段根本不校验 pin，也不会产生 pin 相关 warning；桌面是现场唯一可能提前看到异常的位置 |

复核中另确认的、影响实施的事实：

| # | 事实 | 影响 |
| --- | --- | --- |
| F1 | `finalizeBootstrap` 的 pin 目标来自 `scanRoles` + 治理文档，`.ans roles` 也由 `scanRoles` 重建（`finalize.ts:299`、`303-313`） | 不能整段复用；否则会吸收新角色、丢弃已删角色，违反「只刷新现有 pin、不改 roles」 |
| F2 | `sha256File` 在门禁引擎 `io.ts:25-28` 与编排 `finalize.ts:946-949` 各有一份（后者注释声明同算法） | 新检测/写入必须使用门禁引擎结果里的 `actual`，不得让桌面或编排再写第三份文件哈希；编排既有那份不在本项范围内重构 |
| F3 | `loadBoundaryFile` 对 YAML `entries: []` **不报错**（`boundary-core.ts:433-435`），只有 legacy Markdown 0 条才报 `parseError` | G6 不能只看 `parseError`，必须显式判 `entries.length === 0` |
| F4 | `resolveBoundarySection` 第 2 步加载治理边界时带 `.ans` 的 `acceptance`（含 pin）（`boundary-core.ts:575-578`） | 重新接受后的成功判据是：全部 pin 哈希一致 **且** 治理边界路径被 pin 覆盖 |
| F5 | `test/桌面应用/interface.test.ts:411-442` 的 `present` 夹具 pin 是 `"a".repeat(64)` | 接入哈希校验后该用例必改（见 §一-4） |
| F6 | `listProject` 每次调用都会重新派生 `governanceRecord`，并伴随角色文档索引 IO | pin 证据检查只能在「否则会是 `present`」时执行，避免 `missing/invalid` 也做无谓哈希（§八 AC14） |

## 三、必须修正/返工的点

1. **写入路径不得整段复用 `finalizeBootstrap`**（§一-1）。`finalizeBootstrap` 的 `precheck`、`gatedAtomicWrite`、`finalizeRelPaths` 可复用；pin 集与 roles 映射必须原样保留。
2. **补治理边界覆盖守卫**（§一-2）。检测结果若 `.ans` 的 `governanceBoundary.path` 未被任何 pin 覆盖 → `invalid-record`（不提供重新接受按钮），原因点名该路径。
3. **补 `previewDigest` 契约**（§一-3）。`previewDigest` 缺失/形状非法 → `invalid-request`；形状合法但与重算值不一致 → `preview-stale`。
4. **修正 AC12 口径**（§一-4）。纯函数用例保持；桌面 `present` 夹具改真实哈希。
5. **pin 路径安全**：pin 的 `path` 必须是项目相对路径、规范化后仍在项目根内；绝对路径、`..` 逃逸、非 64 位十六进制 `sha256` → `invalid-record`。不允许把项目外文件写进 `.ans` 的 pin。
6. **缺失/不可读必须分开**：`stat` 抛 `ENOENT`（或目标不存在）→ `missing`；`stat` 抛其它错误、目标不是普通文件、或 `sha256File` 读失败 → `unreadable`。不得把两者合并成一句「不可读」。

## 四、开放问题裁定表

| # | 问题 | 裁定 | 理由与影响 |
| --- | --- | --- | --- |
| 1 | 被 pin 文件缺失时是否允许「接受删除」 | **不允许（V1 阻断）** | 无法为不存在的文件写 pin；接受删除必须同步改 `.ans roles`，超出「只刷新 pin」范围。删除角色应走独立的角色移除流程。影响：G5 会在预览标红并禁用确认，写入返回 `missing-file`/`unreadable-file` |
| 2 | 是否在 `.ans` 增加机器可读的重新接受记录 | **V1 不加** | 保持 `.ans` schema 不变；留痕只在 manifest。影响：审计可被本地写者修改（R3），如实登记，不声称防伪 |
| 3 | 预览是否展示内容 diff | **V1 不做** | 旧内容已被覆盖，只有旧哈希可用；接 git 依赖项目在 git 且无未提交改动，不普遍可靠。影响：操作者需自行用 git 历史核对；文案必须提示 |
| 4 | 新出现、未被 pin 覆盖的角色边界是否同次纳入 | **不纳入** | `verifyPins` 的覆盖规则意味着新角色边界当前不可用（R5）；本次只刷新现有 pin，不扩大治理范围。恢复后由下一轮 su settle 的自动重 pin 吸收 |
| 5 | CLI 是否提供等价入口 | **V1 只做桌面** | 与客户「按角色链」的裁定一致；CLI 需另定终端确认文案与退出码，后续版本 |
| 6 | 成功后是否自动打开 su 会话 | **不自动** | 与「不自动起会话」既有口径一致；成功后刷新列举，回到空态 |
| 7 | `.ans` 的 `acceptance.source` 是否改成「操作者重新接受」 | **V1 不改** | 保留最初授权来源；本次动作的留痕在 manifest。若改写会把「最初授权」与「最近一次刷新」混在一起 |
| 8 | 状态行与 su 空态是否同时出现 | **同时出现** | 同一谓词、同一动作；异常态更不容易被看见。预览仍复用 `#governance-preview`，不新增模态 |

**结论**：8 项均采用提案推荐值，无需客户再拍板。若客户后续对第 1、3、4 项有不同意见，按新裁定另开 revision，不在本轮实现中私自放宽。

## 五、钉死跨角色契约

### 5.1 门禁引擎：只读 pin 证据检查的公共出口

**归属**：类型放 `src/model/boundary.ts`（门禁引擎是该 Model 的唯一主属主）；实现放 `src/common/门禁引擎/pin-evidence.ts`（本角色私有）；公共出口从 `src/service/boundary/resolve-boundary.ts` **同一函数引用再导出**（沿 `buildGovernanceSeedBoundary` 先例，不复制实现）。

```ts
// src/model/boundary.ts（新增）
export type PinEvidenceFileStatus = "modified" | "missing" | "unreadable";

export interface PinEvidenceFile {
  /** pin 里的项目相对路径（posix，原样保留）。 */
  path: string;
  /** `.ans` 记录的 SHA-256（小写 64 位十六进制）。 */
  pinned: string;
  /** 当前盘上 SHA-256；missing / unreadable 为 null。 */
  actual: string | null;
  status: PinEvidenceFileStatus;
}

export type PinEvidenceState = "ok" | "mismatch" | "invalid";

export interface PinEvidenceResult {
  state: PinEvidenceState;
  /** pin 总条数（含一致项）。invalid 时 0。 */
  checked: number;
  /** **仅** status !== ok 的条目，按 pin 顺序；ok 时为空数组。 */
  files: PinEvidenceFile[];
  /** 对全部 pin 的规范化行求 SHA-256（64 hex）；invalid 时为空串。 */
  digest: string;
  /** invalid 的原因（形状非法、路径逃逸、治理边界未被覆盖等）。 */
  reason?: string;
}
```

```ts
// src/service/boundary/resolve-boundary.ts（公共出口）
export { inspectPinnedBoundaries } from "../../common/门禁引擎/pin-evidence.ts";
export type { PinEvidenceFile, PinEvidenceFileStatus, PinEvidenceResult, PinEvidenceState } from "../../model/boundary.ts";

// src/common/门禁引擎/pin-evidence.ts（实现）
export async function inspectPinnedBoundaries(input: {
  projectRoot: string;
  pins: PinEntry[];
  /** 治理边界项目相对路径；给出时必须被至少一条 pin 覆盖。 */
  requiredPath?: string;
}): Promise<PinEvidenceResult>;
```

**判定口径（逐条钉死）**：

1. **形状**：`pins` 必须是非空数组；每项 `path` 为非空字符串、`sha256` 为 64 位十六进制（大小写不敏感）。否则 `state:"invalid"`，`reason` 说明第几项。
2. **路径安全**：`path` 不得为绝对路径；`joinRoot(projectRoot, path)` 规范化后必须仍在项目根内（`isAbsoluteAny` / `absRel` / `isUnderOrEqual`，来自 `src/common/shared/path-primitives.ts`）。逃逸 → `state:"invalid"`。
3. **覆盖**：给出 `requiredPath` 时，必须存在一条 pin 规范化后与其指向同一路径（`compareKey(normalizeLexical(...))` 比较）；否则 `state:"invalid"`，`reason:"治理边界文件未被任何 pin 覆盖：<path>"`。
4. **逐文件**：
   - `stat(abs)` 抛错且 code 为 `ENOENT`（或路径不存在）→ `status:"missing"`，`actual:null`；
   - `stat` 抛其它错误，或 `stat.isFile() === false` → `status:"unreadable"`，`actual:null`；
   - `isFile` 为 true → `sha256File(abs)`（复用 `io.ts:25-28`）；读失败 → `unreadable`；成功且小写不等于 `pinned.toLowerCase()` → `modified`；相等 → 一致（不进入 `files`）。
5. **整体**：`files.length === 0` → `state:"ok"`；否则 `state:"mismatch"`。
6. **digest**：`state !== "invalid"` 时，对**全部 pin（按原顺序）**拼接 `path + "\t" + pinned + "\t" + (status ?? "ok") + "\t" + (actual ?? "") + "\n"`，取 SHA-256 小写十六进制。它同时覆盖一致项与不一致项，任何 pin 目标内容变化都会改变 digest。
7. **只读**：不写盘、不建目录、不缓存、不改变 pin 顺序。读取次数为 O(pins)，每个目标至多一次哈希。
8. **唯一哈希来源**：桌面与编排不得各写一份文件哈希；编排写入时直接使用本结果里的 `actual`。

### 5.2 编排：重新接受的预览与写入

**归属**：`src/common/编排/finalize.ts` 增加实现；`src/pipeline/orchestration/govern-session.ts` 薄再导出（桌面只依赖 Pipeline 公共出口，不直接导入编排私有 `common/`）。

```ts
// src/pipeline/orchestration/govern-session.ts（追加再导出）
export {
  previewGovernanceReacceptance,
  reacceptGovernancePins,
  GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernanceReacceptInput,
  GovernanceReacceptWriteInput,
  GovernanceReacceptPreview,
  GovernanceReacceptPreviewResult,
  GovernanceReacceptPreviewFailure,
  GovernanceReacceptBlocker,
  GovernanceReacceptStatus,
  ReacceptGovernancePinsResult,
} from "../../common/编排/finalize.ts";
```

```ts
// src/common/编排/finalize.ts（新增）
export const GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE =
  "desktop-app:操作者为治理记录 pin 不符显式重新接受（操作者点击确认）";

export interface GovernanceReacceptInput {
  projectRoot: string;
  skillRoot?: string;
}

export interface GovernanceReacceptWriteInput extends GovernanceReacceptInput {
  confirm: true;
  previewDigest: string; // 预览返回的 64 hex
}

export type GovernanceReacceptStatus =
  | "completed"          // 写入成功
  | "write-failed"       // 已进入写入阶段但中断，可能部分落盘
  | "blocked"            // 门禁前置拒绝
  | "not-needed"         // 全部 pin 一致，无需操作
  | "no-record"          // .ans/project.json 不存在
  | "invalid-record"     // .ans 不可解析/未接受/pin 形状非法/治理边界未被覆盖
  | "missing-file"       // 有 pin 目标缺失（G5）
  | "unreadable-file"    // 有 pin 目标不可读（G5）
  | "unparseable-boundary" // 有 pin 目标坏 YAML / Section 1 为空（G6）
  | "preview-stale"      // 预览后盘面变化（G4）
  | "busy"               // 同项目有进行中的治理记录动作（G7）
  | "invalid-request";   // projectRoot / confirm / previewDigest 形状非法

export interface GovernanceReacceptBlocker {
  code: "missing-file" | "unreadable-file" | "unparseable-boundary";
  paths: string[];
  message: string;
}

export interface GovernanceReacceptPreview {
  projectRoot: string;
  /** 固定 [".ans/project.json", "docs/bootstrap-manifest.md"]（写入顺序）。 */
  writePaths: string[];
  /** 现有 pin 列表，原顺序、原路径。 */
  pinPaths: string[];
  pinCount: number;
  /** 仅 modified / missing / unreadable 条目（来自 PinEvidenceResult.files）。 */
  changed: PinEvidenceFile[];
  /** false = 有 blockers，确认按钮必须禁用。 */
  canConfirm: boolean;
  blockers: GovernanceReacceptBlocker[];
  /** PinEvidenceResult.digest；确认写入时原样回传。 */
  previewDigest: string;
}

export type GovernanceReacceptPreviewFailure =
  | "invalid-request"
  | "busy"
  | "no-record"
  | "invalid-record"
  | "not-needed"
  | "blocked";

export type GovernanceReacceptPreviewResult =
  | { ok: true; preview: GovernanceReacceptPreview }
  | { ok: false; status: GovernanceReacceptPreviewFailure; message: string };

export interface ReacceptGovernancePinsResult {
  /** status === "completed" 时为 true。 */
  ok: boolean;
  status: GovernanceReacceptStatus;
  /** 「是否零副作用」的唯一依据：guard/precheck 为零写入；write 可能已部分落盘。 */
  phase: "guard" | "precheck" | "write";
  message: string;
  /** 已尝试写入的项目相对路径（completed=两项；write-failed=可能的部分路径；其余=[]）。 */
  wrote: string[];
  /** completed 时写回 .ans 的新 pin 列表；路径与顺序必须与旧列表完全一致。 */
  pins?: PinEntry[];
  /** 观察到的不一致条目（预览/写入共用）。 */
  changed?: PinEvidenceFile[];
}
```

**预览 `ok:true` 与 `ok:false` 的分界**：只要 `.ans` 状态是「可解析、`accepted:true`、pin 形状合法且非空、治理边界被覆盖、且至少一项不一致」，就返回 `ok:true`；缺失/不可读/坏内容不吞掉预览，而是放进 `changed` + `blockers`，`canConfirm:false`。`ok:false` 只用于「根本没有可展示的重新接受预览」：`invalid-request` / `busy` / `no-record` / `invalid-record` / `not-needed` / `blocked`。

**预览与写入共用同一份求值**：内部函数 `evaluateGovernanceReaccept(input)` 返回 `.ans` 原文、pin 列表、`PinEvidenceResult`、blockers；预览与写入都调用它，写入不复用预览快照（除 digest 比对外）。

**写入守卫顺序（缺一不可）**：

| 顺序 | 守卫 | 行为 |
| --- | --- | --- |
| 1 | `projectRoot` 非空可解析 | 否则 `invalid-request` / `guard` |
| 2 | 同项目治理记录动作互斥 | 与 `establishGovernanceRecord` 共用同一个进程内集合（按 `path.resolve(projectRoot)`）；占用中 → `busy` / `guard` |
| 3 | `.ans/project.json` 存在 | 不存在 → `no-record` / `guard` |
| 4 | 原始 `.ans` 可解析、`accepted === true`、`governanceBoundary.path` 非空、pin 形状合法且非空、pin 路径在项目内 | 否则 `invalid-record` / `guard`，原因逐字说明 |
| 5 | `inspectPinnedBoundaries({ projectRoot, pins, requiredPath: govPath })` | `invalid` → `invalid-record` / `guard`；`ok` → `not-needed` / `guard`；`mismatch` → 继续 |
| 6 | G5 缺失/不可读 | 有 `missing` → `missing-file`；否则有 `unreadable` → `unreadable-file`；均 `/ precheck`，零写入；message 列出全部路径 |
| 7 | G4 摘要比对 | `previewDigest` 非 64 hex → `invalid-request` / `guard`；与重算 `evidence.digest` 不等 → `preview-stale` / `precheck`，零写入 |
| 8 | G6 内容可解析预检 | 对**每个 pin 目标**用门禁引擎公开的 `resolveBoundary` + 探测用 `ProjectConfig`（`governanceBoundary.path = pin.path`、`accepted:true`、无 pin）解析；`parseError` 非空或 `entries.length === 0` → `unparseable-boundary` / `precheck`，列出全部文件，零写入 |
| 9 | G3 门禁前置 | 一次性种子边界 `buildGovernanceSeedBoundary(GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE)`；对 `.ans/project.json` 与 `docs/bootstrap-manifest.md` 逐条 `resolveWrite`；任一拒绝 → `blocked` / `precheck`，零写入 |
| 10 | G8 写入 | `.ans` 先写、manifest 后写；均经 `gatedAtomicWrite`；异常 → `write-failed` / `write`，message 明确「可能已写入部分文件」，绝不出现「已恢复/已成功」 |
| 11 | 释放互斥 | `finally` |

**`.ans` 重写规则（逐字钉死）**：

- 读取原始文本 → `JSON.parse`；保留对象**全部既有字段**（`projectRoot`、`skillRoot`、`roles`、未知字段）。
- **只替换** `governanceBoundary.acceptance.pin`：按旧列表顺序逐项生成 `{ path: old.path, sha256: evidenceActual }`；条目数、路径字符串、顺序**完全不变**；不新增、不删除。
- `acceptance.source`、`acceptance.accepted`、`roles` 不动。
- 序列化与 `finalizeBootstrap` 同形：`JSON.stringify(doc, null, 2) + "\n"`。

**manifest 追加规则**：

- 读取既有 `docs/bootstrap-manifest.md` 全文；存在则**逐字节保留**，不做重排。读失败（存在但不可读）→ `blocked` / `precheck`，零写入，message 点名 manifest。
- 若不存在 → 新建最小头部：`# Bootstrap 留痕（创世 finalize）` + 一行「此前的 manifest 不存在；以下为重新接受记录。」
- 定位标题 `## 重新接受记录（治理记录 pin 刷新）`：已存在则在**该节末尾**（下一个 `## ` 标题之前或文件末尾）追加条目；不存在则在文件末尾新增该节。
- 条目格式：

```text
- 2026-10-17T02:34:56.789Z：操作者在桌面应用确认重新接受；变更 1 个边界文件（本次刷新 9 条 pin）
  - 角色卡/assembly/boundary.yaml（旧 pin <64 hex> → 新 pin <64 hex>）
```

- 使用**完整 64 位哈希**（UI 可显示前 8 位，manifest 不截断），便于机器核对。
- 一次写入只追加一条；历史条目保留。缺失/不可读文件不会进入 `completed`，因此不会出现在该记录中。

**不做什么**：不改 F6/F4/pin 生成算法；不给 su 注册恢复工具；不接受调用方传入边界、来源、写路径或 pin 列表；不自动重试、不清理已写产物；不改 `.ans` 的 `roles` 与 `acceptance.source`。

### 5.3 桌面窗口：`listProject`、IPC、preload 与 Interface

**`app/desktop/project.ts`（新增/扩展）**：

```ts
export type GovernanceRecordState = "present" | "missing" | "invalid" | "pin-mismatch";

export interface GovernanceRecordStatus {
  state: GovernanceRecordState;
  /** invalid 的载入器降级原因。 */
  reason?: string;
  /** 仅 pin-mismatch：不一致条目（来自 PinEvidenceResult.files）。 */
  pinFiles?: PinEvidenceFile[];
  /** 仅 pin-mismatch：pin 总条数。 */
  pinCount?: number;
}

/** 纯映射：把 pin 证据合入既有派生结果（便于单测）。 */
export function applyPinEvidence(
  record: GovernanceRecordStatus,
  evidence: PinEvidenceResult,
): GovernanceRecordStatus;

/** 只读：仅在 record.state === "present" 时调用门禁引擎检查；永不抛错。 */
export async function deriveGovernanceRecordWithPins(input: {
  projectRoot: string;
  record: GovernanceRecordStatus;
  pins: PinEntry[] | undefined;
  governanceBoundaryPath?: string;
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
}): Promise<GovernanceRecordStatus>;
```

- `record.state !== "present"` → 原样返回，**不做任何哈希**。
- `pins` 缺失/空 → `{ state: "invalid", reason: "治理记录未提供可验证 pin" }`（fail-closed；载入器正常情况下已把这种记录降级）。
- `evidence.state === "invalid"` → `{ state: "invalid", reason: evidence.reason ?? "pin 证据检查失败" }`。
- `evidence.state === "ok"` → 原 `present`（不新增字段，保持既有测试形状）。
- `evidence.state === "mismatch"` → `{ state: "pin-mismatch", pinFiles: evidence.files, pinCount: evidence.checked }`。
- 任何意外异常 → `{ state: "invalid", reason: "pin 证据检查失败：<message>" }`；**`listProject` 不得因此抛错**。

**`app/desktop/interface.ts`**：

- `ListProjectResult.governanceRecord` 类型随 `GovernanceRecordStatus` 扩展；`listProject` 在 `deriveGovernanceRecord(...)` 之后调用 `deriveGovernanceRecordWithPins`，传入 `effective.source.acceptance.pin` 与 `effective.project.governanceBoundary?.path`。
- `DesktopDeps` 增加可注入项（缺省真实实现）：`inspectPinnedBoundariesFn`、`previewGovernanceReacceptanceFn`、`reacceptGovernancePinsFn`。
- `DesktopInterface` 增加两个方法（名字与 preload 一致，不再起别名）：

```ts
previewGovernanceReacceptance(input: { projectRoot: string }): Promise<GovernanceReacceptPreviewResult>;
reacceptGovernancePins(input: {
  projectRoot: string;
  confirm: true;
  previewDigest: string;
}): Promise<ReacceptGovernancePinsResult>;
```

- 守卫（桌面层只做 1–3；机制层负责 4–11）：
  1. `projectRoot` 非空且**严格等于** `importedProjectRoot`；否则 `{ ok:false, status:"invalid-request", message:"项目不是当前导入项目；本次未写入任何文件。" }`。
  2. `confirm === true`；否则 `invalid-request`。
  3. `previewDigest` 为非空 64 位十六进制；否则 `invalid-request`。
  4. 不提供路径、边界、来源、pin 列表；只透传 `projectRoot`/`skillRoot` 与 digest。
- 成功后（`status === "completed"`）：
  1. 先 `await manager.refreshStaleBoundaries()`（失败吞掉，不影响回执）；
  2. `listingCache.delete(projectRoot)`；
  3. `deps.emitProjectChanged?.()`（渲染侧重新 `listProject`）。
- `status === "write-failed"`（已进入写入阶段）也执行同样的刷新/清缓存/通知，让界面如实反映可能已部分落盘的状态。
- **不自动打开会话**；不调用 `openSession`。

**`app/main.ts`**：

```ts
registerHandler("project:governance-reaccept-preview", (_e, input) => desktop.previewGovernanceReacceptance(input));
registerHandler("project:governance-reaccept", (_e, input) => desktop.reacceptGovernancePins(input));
```

**`app/preload.cjs`**：

```js
previewGovernanceReacceptance: (projectRoot) =>
  ipcRenderer.invoke("project:governance-reaccept-preview", { projectRoot }),
reacceptGovernancePins: (projectRoot, previewDigest) =>
  ipcRenderer.invoke("project:governance-reaccept", { projectRoot, confirm: true, previewDigest }),
```

**命名纪律**：IPC 通道名、preload 方法名、`DesktopInterface` 方法名、编排函数名四层各用固定名字，不得再起别名；`api-spec.md` 由桌面窗口同步。

### 5.4 桌面UI：单一谓词、文案与状态分支

**`app/renderer/ui-labels.js`**：

```js
// 动作可见谓词唯一入口（S1 与 pin-mismatch 互斥）。
function governanceActionFor(hasProject, hasRoles, recordState) {
  if (hasProject !== true) return null;
  if (recordState === "pin-mismatch") return "reaccept";
  if (hasRoles === true && recordState === "missing") return "establish";
  return null;
}

// 既有导出保留（既有测试与调用方兼容），实现委托单一入口。
function canEstablishGovernance(hasProject, hasRoles, recordState) {
  return governanceActionFor(hasProject, hasRoles, recordState) === "establish";
}
```

渲染侧**只经 `UiLabels.governanceActionFor(...)` 取判据**；不得再出现 `record.state === "pin-mismatch"` 的直接比较（与既有 `missing` 禁线同纪律）。

**文案（全部放 `ui-labels.js`，渲染侧不拼业务文案）**：

- `governancePinMismatchText(pinCount, changed)`：
  `治理记录与盘上边界不一致：共 {pinCount} 条 pin，其中 {changed.length} 个与记录不一致（{x} 个内容已变更、{y} 个缺失、{z} 个不可读）。未确认前，会话不能开启、写入会被拒绝。`
  只列非零类别；三类均为零时用「存在不一致」。
- `governancePinMismatchEmptyState(pinCount, changed)`：
  - `kind: "governance"`
  - `title: "治理记录与盘上边界不一致"`
  - `sub: <governancePinMismatchText> + "确认接受后只会刷新 SHA-256 与留痕，不会修改任何边界文件内容。"`
  - `hint: "也可在终端核对 git 历史后再处理。"`
- `governanceReacceptPreviewView(preview)`（纯映射，返回标题/行/按钮）：
  - 标题：`重新接受治理边界（预览）`
  - 逐文件行：
    - `modified` → `{path} — 内容已变更（pin {旧前8位}… → 现 {新前8位}…）`
    - `missing` → `{path} — 文件缺失（无法重新 pin）`
    - `unreadable` → `{path} — 文件不可读（无法重新 pin）`
  - 写入行：`将写入：.ans/project.json、docs/bootstrap-manifest.md`
  - pin 行：`将重算这 {pinCount} 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。`
  - 警示：`如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。`
  - `canConfirm === false` 时确认按钮 `disabled`，并显示 blockers 的原因。
- `governanceReacceptSuccessText(pinCount, changedCount)`：
  `已重新接受：更新 {changedCount} 条 pin（共 {pinCount} 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。`
- `governanceReacceptFailureView(phase, status, message)`：
  - `phase !== "write"`：首行 `message` 逐字；若 message 不含「未写入任何文件」，追加 `本次未写入任何文件。`；再按 status 追加：
    - `no-record` → `没有治理记录；请先建立治理记录。`
    - `invalid-record` → `治理记录不可用；本版不提供修复。`
    - `not-needed` → `边界与记录一致，无需重新接受。`
    - `preview-stale` → `预览后边界文件又有变化，已取消本次写入；请重新检查。`
    - `missing-file` / `unreadable-file` / `unparseable-boundary` → `请先处理上述文件后重试。`
    - `busy` → `上一次操作仍在进行中；本次未写入任何文件。`
  - `phase === "write"`：只逐字显示 `message`；**绝不**追加「未写入任何文件」，**绝不**出现「已恢复/已成功」。

**`app/renderer/renderer.js`**：

- `state.governanceRecord` 缺省仍为 `{ state: "present" }`；未知状态一律不显示动作（fail-closed UI）。
- `governanceActionVisible()` 改为返回 `UiLabels.governanceActionFor(...)` 的结果。
- 状态行（`#governance-status`）：
  - `establish` → 既有 missing 文案 + `[建立治理记录]`（`data-governance-establish`）。
  - `reaccept` → mismatch 文案 + `[检查并重新接受]`（`data-governance-reaccept`）。
  - `invalid` → 既有原因文案，无动作；`present` → 不显示。
- su 空态（`.chat-empty`）：
  - `reaccept` → mismatch 空态标题/说明/主按钮 `检查并重新接受`；次行显示 hint。
  - `establish` → 既有 S1 空态。
- 预览面板（`#governance-preview`，非模态）：
  - `governanceFlow.mode: "establish" | "reaccept"`；两种模式共用宿主与取消/关闭行为。
  - `reaccept` 打开时调用 `d.previewGovernanceReacceptance(projectRoot)`；确认调用 `d.reacceptGovernancePins(projectRoot, preview.previewDigest)`。
  - 取消/关闭**不调用任何 IPC**；`busy` 时按钮 disabled。
  - 成功/失败用 §5.4 的文案；成功后重新 `listProject`（由主进程 `project:changed` 驱动），状态回 `present`，动作消失。
- 沿用 `#governance-status` / `#governance-preview`，**不新增模态、不新增第四个入口**；状态行与空态同时出现。

### 5.5 测试契约

- **门禁引擎**：新增 `test/门禁引擎/pin-evidence.test.ts`（目录授权，可新增）。覆盖：全一致、单文件 modified、缺失、不可读（目录/权限）、pin 形状非法、空 pin、路径逃逸、`requiredPath` 未被覆盖、digest 稳定性与变化、只读（前后目录树/mtime 不变）。
- **编排**：新增 `test/编排/governance-reaccept.test.ts`（目录授权，可新增）。覆盖：预览形状与 blockers、写入成功、`.ans` 只改 pin（roles/source/未知字段不变、路径与顺序不变）、manifest 追加与保留、G1–G8 每个守卫、写入失败注入、并发 busy。
- **桌面窗口**：**只扩展**既有单文件测试（`test/桌面应用/` 是单文件条目，不得新增文件）：`project.test.ts`（`applyPinEvidence` / `deriveGovernanceRecordWithPins` 的纯映射与异常不抛、`present` 不检查、`pin-mismatch` 明细）、`interface.test.ts`（`listProject` 接线、pin 检查失败不崩、两个 IPC 处理器守卫、成功后刷新/清缓存/通知、不自动开会话；**修正假 pin 夹具**）、`ans-wiring.test.ts`（主进程通道注册与 preload 方法名）。
- **桌面UI**：**只扩展**既有单文件测试：`tool-rows.test.ts`（`governanceActionFor` 真值表、全部文案逐字、失败分支）、`renderer.test.ts`（状态行/空态/预览分支、单一谓词调用、无第二份状态比较、取消不调 IPC、无新增模态）。
- **测试角色**：新增目录 `test/测试/governance-pin-recovery-verify/`，做端到端独立验证（`listProject → preview → reaccept → listProject`、`resolveRole` 的 su `accepted:true`/`parseError` 为空、确定性会话入口开启、零副作用、无自动会话）。报告写 `角色卡/测试/docs/change/` 或 `docs/fix/`。
- **全量**：`node --test "test/**/*.test.ts"`（**三层 glob**；两层会静默漏测）。另跑 `npm run typecheck`。
- **真实模型/凭据**：不代跑；真实 su 会话由客户本人执行。

## 六、守卫落点

| # | 守卫 | 落点 | 行为 |
| --- | --- | --- | --- |
| G1 | 仅 `pin-mismatch` 可进入 | 编排 guard 1–5；桌面 IPC 守卫 1–2；UI 谓词 | `missing`/`invalid`/`present` 一律拒绝；写入前重新求值，不信任预览 |
| G2 | 只写两个路径 | 编排内部常量 | 硬编码 `.ans/project.json` 与 `docs/bootstrap-manifest.md`；不接受调用方传入 |
| G3 | 写仍过门 | 编排 guard 9 | 一次性内存种子边界（三普通目录）+ 每个待写路径 `resolveWrite`；全部放行才逐笔原子写 |
| G4 | 预览后变化则拒绝 | 门禁引擎 `digest` + 编排 guard 7 | 写入前重算全部 pin 并比对 `previewDigest`；不等 → `preview-stale`、零写入 |
| G5 | 缺失/不可读阻断 | 门禁引擎 evidence + 编排 guard 6 | `missing`/`unreadable` → 预览 `canConfirm:false`；写入 `missing-file`/`unreadable-file`、零写入 |
| G6 | 内容可解析预检 | 编排 guard 8 | 每个 pin 目标用同一套门禁解析器；`parseError` 或 `entries.length === 0` → `unparseable-boundary`、零写入 |
| G7 | 同项目互斥 | 编排 guard 2 | 与 `establishGovernanceRecord` 共用进程内集合；跨进程无全局锁，如实登记 |
| G8 | 写入原子性 | `gatedAtomicWrite` | 同目录 temp + rename；`.ans` 先、manifest 后；失败不重试、不清理，`phase:"write"` 如实回执 |

## 七、文件归属与派发表

| 组 | 角色 | 文件 | 改动 | 测试文件（归属） |
| --- | --- | --- | --- | --- |
| A1 | 门禁引擎 | `src/model/boundary.ts` | 新增 `PinEvidenceFile`/`PinEvidenceFileStatus`/`PinEvidenceState`/`PinEvidenceResult` | `test/门禁引擎/pin-evidence.test.ts`（新增） |
| A2 | 门禁引擎 | `src/common/门禁引擎/pin-evidence.ts` | 新增 `inspectPinnedBoundaries` 实现（唯一哈希来源） | 同上 |
| A3 | 门禁引擎 | `src/service/boundary/resolve-boundary.ts` | 同一函数引用再导出 + 类型再导出 | 同上 |
| B1 | 编排 | `src/common/编排/finalize.ts` | `previewGovernanceReacceptance` / `reacceptGovernancePins` / 来源常量 / `evaluateGovernanceReaccept` / 守卫 / `.ans` 与 manifest 构建；复用 `gatedAtomicWrite`、`finalizeRelPaths`、`isFile`、`buildGovernanceSeedBoundary` | `test/编排/governance-reaccept.test.ts`（新增） |
| B2 | 编排 | `src/pipeline/orchestration/govern-session.ts` | 对 B1 的薄再导出 | 并入 B1 |
| C1 | 桌面窗口 | `app/desktop/project.ts` | `GovernanceRecordState` 增 `pin-mismatch`、明细字段、`applyPinEvidence`、`deriveGovernanceRecordWithPins` | `test/桌面应用/project.test.ts`（扩展） |
| C2 | 桌面窗口 | `app/desktop/interface.ts` | `listProject` 接线、两个新方法、守卫、成功后刷新 | `test/桌面应用/interface.test.ts`（扩展；修正假 pin 夹具） |
| C3 | 桌面窗口 | `app/main.ts` / `app/preload.cjs` | 注册两个通道、暴露两个方法 | `test/桌面应用/ans-wiring.test.ts`（扩展） |
| D1 | 桌面UI | `app/renderer/ui-labels.js` | `governanceActionFor` 单一谓词、全部文案与失败视图 | `test/桌面应用/tool-rows.test.ts`（扩展） |
| D2 | 桌面UI | `app/renderer/renderer.js` | 状态行/空态/预览/确认/刷新分支；复用既有宿主 | `test/桌面应用/renderer.test.ts`（扩展） |
| D3 | 桌面UI | `app/renderer/styles.css` | 预览明细行/禁用态样式（如需；不新增模态） | 同上 |
| E1 | 测试 | `test/测试/governance-pin-recovery-verify/` | 端到端夹具与独立验证 | — |
| E2 | 测试 | `角色卡/测试/docs/change/` 或 `docs/fix/` | 独立验证报告与证据 | — |
| P1 | 项目管理 | 本文件、`memo.md`、`changelog.md` | 评审与拆发记录 | — |

**边界纪律（派发前核对，均已核对 Section 1）**：

- `app/desktop/`、`app/main.ts`、`app/preload.cjs` 属**桌面窗口**；`app/renderer/` 属**桌面UI**；两边不得互写。
- `test/桌面应用/` 是**单文件条目**：桌面窗口/桌面UI 只能扩展各自清单内的既有文件，**不得新增文件**；`project.test.ts`/`interface.test.ts`/`ans-wiring.test.ts` 归桌面窗口，`renderer.test.ts`/`tool-rows.test.ts`/`e2e/uiux-v2.mjs` 归桌面UI。
- `test/门禁引擎/`、`test/编排/`、`test/测试/` 是目录条目，可新增文件；`test/测试/` 只归测试角色。
- 桌面窗口**不得**直接导入 `src/common/编排/finalize.ts`（跨角色私有 `common/`），经 `src/pipeline/orchestration/govern-session.ts` 公共再导出；编排**不得**直接导入 `src/common/门禁引擎/`，经 `src/service/boundary/resolve-boundary.ts` 公共出口。
- 本清单无跨角色文件重叠；同一角色任务串行。

**派发顺序与并行**：

| 组 | 角色 | 任务 | 依赖 | 并行 |
| --- | --- | --- | --- | --- |
| 1 | 门禁引擎 | A1–A3 pin 证据公共出口 | 方案批准 | — |
| 2 | 编排 | B1–B2 重新接受预览/写入 | 组 1 | 与组 3 并行 |
| 3 | 桌面窗口 | C1 `listProject` + `project.ts` | 组 1 | 与组 2 并行 |
| 4 | 桌面窗口 | C2–C3 IPC/preload/刷新 | 组 2、组 3 | 同角色串行，不与组 3 并行 |
| 5 | 桌面UI | D1–D3 UI | 组 4 的通道/形状（契约已钉死，可先做静态部分） | 可与组 4 部分并行，集成在组 4 后 |
| 6 | 测试 | E1–E2 独立验证 | 组 1–5 全部落地 | 最后 |

本轮不启动任何执行上下文；派发以本文件为任务书，各角色先核对自身边界与当轮基线。

## 八、验收映射

| # | 场景 | 覆盖角色／测试文件 | 可测量断言 |
| --- | --- | --- | --- |
| AC1 | 9 条 pin 全部一致 | 门禁引擎 `pin-evidence.test.ts`；桌面窗口 `interface.test.ts`；桌面UI `renderer.test.ts` | `state:"ok"`、`files:[]`；`listProject.governanceRecord.state === "present"`；无恢复文案/按钮 |
| AC2 | 修改 1 个被 pin 的边界文件 | 桌面窗口 `project.test.ts` / `interface.test.ts` | 状态 `pin-mismatch`；`pinFiles` 恰好 1 条 `modified`；`pinned !== actual`；`.ans` mtime/内容哈希不变；未创建新文件 |
| AC3 | 2 个修改 + 1 个删除 | 编排 `governance-reaccept.test.ts`；桌面UI `tool-rows.test.ts` | 预览 `changed` 3 条（2 `modified` + 1 `missing`）、`canConfirm:false`；写入 `missing-file`、`phase:"precheck"`、零写入 |
| AC4 | 预览后取消 | 桌面UI `renderer.test.ts`；测试角色 E2E | 取消/关闭不调 IPC；全部文件 mtime/哈希不变；状态仍 `pin-mismatch`；未开会话 |
| AC5 | 正常确认接受 | 编排 `governance-reaccept.test.ts` | 仅 `.ans/project.json` 与 `docs/bootstrap-manifest.md` 变化；pin 路径集合/条数/顺序与写入前完全相同；`roles` 映射与 `acceptance.source` 不变；全部边界文件内容哈希不变；manifest 出现含时间/变更数/路径/旧新完整哈希的记录 |
| AC6 | 接受后重新加载 | 测试角色 E2E；桌面窗口 `interface.test.ts` | 同一检测路径返回 `present`；`resolveRole` 对 su 得到 `accepted:true`、`parseError` 为空；测试会话入口（无需真实模型）成功开启 |
| AC7 | 预览后、确认前再次修改 | 编排 `governance-reaccept.test.ts` | `previewDigest` 与重算不等 → `preview-stale`、`phase:"precheck"`、零写入 |
| AC8 | 坏 YAML / Section 1 为空 | 编排 `governance-reaccept.test.ts`；门禁引擎 `pin-evidence.test.ts` | 预览 `blockers` 含 `unparseable-boundary`、`canConfirm:false`；写入 `unparseable-boundary`、零写入；状态保持 `pin-mismatch` |
| AC9 | `.ans` 缺失 | 桌面窗口 `interface.test.ts`；桌面UI `renderer.test.ts` | 状态 `missing`；只出现「建立治理记录」；不出现「重新接受」 |
| AC10 | `.ans` 不可解析 | 同上 | 状态 `invalid`；只显示原因与「本版不提供修复」；不出现「重新接受」 |
| AC11 | 写入阶段人为抛错 | 编排 `governance-reaccept.test.ts` | `status:"write-failed"`、`phase:"write"`；message 含「可能已写入部分文件」；不含「已恢复/已成功」 |
| AC12 | 回归 | 全角色 | `node --test "test/**/*.test.ts"` 全绿；`deriveGovernanceRecord` 的 pure `present/missing/invalid` 用例逐字保持；`interface.test.ts` 假 pin 夹具改为真实哈希（§一-4） |
| AC13 | **新增：pin 检查失败不崩** | 桌面窗口 `interface.test.ts` | 某个 pin 目标不可读时，`listProject` 不抛错；返回 `pin-mismatch` 或 `invalid`（带原因），`roles`/`hasRoles`/`primaryRoleId` 等字段完整 |
| AC14 | **新增：结构性能** | 桌面窗口 `project.test.ts`；门禁引擎 `pin-evidence.test.ts` | `record.state !== "present"` 时**不调用** `inspectPinnedBoundaries`；`present` 时每 pin 至多一次哈希、`checked === pins.length`、`files.length ≤ checked`；不产生额外写入 |
| AC15 | **新增：成功不自动开会话** | 桌面窗口 `interface.test.ts`；测试角色 E2E | 成功后无 `openSession` 调用；`importedProjectRoot` 不变；渲染侧仍在空态 |
| AC16 | **新增：并发双击** | 编排 `governance-reaccept.test.ts` | 第二次得 `busy` / `guard`；零写入 |
| AC17 | **新增：manifest 缺失/不可读** | 编排 `governance-reaccept.test.ts` | 缺失 → 新建最小头部 + 记录；不可读 → `blocked` / `precheck`、零写入、message 点名 |
| AC18 | **新增：治理边界未被 pin 覆盖** | 门禁引擎 `pin-evidence.test.ts`；桌面窗口 `interface.test.ts` | `requiredPath` 未被覆盖 → `state:"invalid"`；桌面显示 `invalid`、无「重新接受」动作 |

## 九、风险与回滚

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 操作者盲点，直接点确认 | 把不认识的改动一并授权 | 逐文件明细 + 旧/新哈希 + 警示行；预览无内容 diff 时明确提示先用 git 核对；不提供一键接受 |
| R2 | 多次外部改动被一次确认吞掉 | 留痕只看到当前结果 | 记录本次变更文件数与逐文件旧/新哈希；文案说明「接受的是当前盘面」；不声称完整变更历史 |
| R3 | manifest 本身可被改 | 审计不可信 | 如实登记局限；V1 不在 `.ans` 增机器可读记录（开放问题 2） |
| R4 | 缺失文件无法恢复 | 合法删除角色也会落入 `pin-mismatch` 且被 G5 阻断 | V1 明确阻断；删除角色走独立流程（后续版本） |
| R5 | 新未被 pin 覆盖的边界不在本状态内 | 项目可能显示 `present`，但新角色不可用 | 状态只覆盖 pin 列表内文件；恢复后下一轮 su settle 的自动重 pin 吸收；文档如实说明 |
| R6 | pin 一致但内容不可解析 | 仍可能显示 `present` 且会话失败 | 本提案不扩展 `present` 判据；G6 只在重新接受时拦截；已知盲点，后续独立处理 |
| R7 | 预览与确认之间竞态 | 确认到未看过的内容 | `previewDigest` 重算比对（G4） |
| R8 | 多实例并发 | 两个桌面实例可能同时操作 | 进程内互斥 + 原子写；跨进程无全局锁（既有先例），最坏写出同构产物 |
| R9 | 恢复机制被误当成「pin 不重要」 | 习惯性点接受，tamper 信号退化 | 文案说透「未确认前不能用」「接受即授权」；不在状态行提供一键接受；只在异常态出现 |
| R10 | 留痕时钟/真实性 | 时间来自本机，未签名 | 与现有 manifest 同级；不承诺防伪 |
| R11 | **新增**：哈希计算与写入之间的 TOCTOU | 文件在算哈希后、写 `.ans` 前又被改 | 写入的 pin 可能立刻失配 → 项目保持 `pin-mismatch`（安全失败），不会出现假接受；如实登记 |
| R12 | **新增**：`.ans` 重序列化改变格式 | 手工格式丢失 | 与 `finalizeBootstrap` 同形序列化；语义字段逐项测试保持不变；不承诺保留手工空白 |
| R13 | **新增**：manifest 写入失败后的留痕缺口 | `.ans` 已更新但 manifest 未追加，重试会得 `not-needed` | `write-failed` 如实提示核对现场；不自动重试；记录为已知缺口 |
| R14 | **新增**：pin 数量大时 `listProject` 变慢 | 每次列举都哈希全部 pin | 仅在 would-be `present` 时检查；典型项目 9 条小文件，成本可接受；AC14 做结构约束 |

**回滚**：本功能是加法——只新增状态、检测、两个 IPC 与一个 UI 分支，不改 F6/F4/pin 生成/自动重 pin 语义。回滚代码后，已重新接受的项目仍按既有 `.ans` 工作；不会留下中间格式。唯一不可逆的是操作者确认写出的新 pin 与 manifest 记录，但它们是产品预期资产。若写错，可从 git/备份恢复 `.ans`；恢复前项目保持 `pin-mismatch`，不会静默接受。

## 十、与提案的差异

1. **不整段复用 `finalizeBootstrap`**：复用其落盘原语与一次性种子边界，但 pin 集与 roles 映射原样保留（§一-1、§五.2）。这是 AC5 与开放问题 4 的必要条件。
2. **补治理边界覆盖守卫**：`requiredPath` 未被 pin 覆盖 → `invalid-record`，不提供重新接受（§一-2、§五.1）。
3. **新增 `previewDigest` 契约**：G4 从「原则」落成可传递、可重算的摘要（§一-3、§五.2）。
4. **预览结果区分 `ok:true + canConfirm:false` 与 `ok:false`**：缺失/不可读/坏内容仍展示明细，但确认被禁用；不把「有明细可看」误报成「可接受」。
5. **manifest 使用完整 64 位哈希**（UI 显示前 8 位）；提案示例为截断形式。
6. **AC12 收窄**：纯函数用例保持；桌面 `present` 假 pin 夹具必须改真实哈希。
7. **`listProject` 只在 would-be `present` 时做 pin 检查**：`missing`/`invalid` 不做哈希，避免无谓 IO。
8. **新增 AC13–AC18**：listProject 不崩、结构性能、不自动开会话、并发 busy、manifest 缺失/不可读、治理边界未被覆盖。
9. **失败分类新增 `write-failed`**：与 `completed`/`blocked` 分开，`phase` 仍是零副作用的唯一依据。
10. **桌面成功/写入中断后的刷新**：先 `refreshStaleBoundaries`，再清 listing 缓存，再 `emitProjectChanged`；不自动开会话。

## 十一、派发前置检查

- 基线：`main` / `80bfa60`。各角色以当轮 HEAD 复核行号与文件内容；按符号名定位。
- 边界：本清单不含新增 Section 1 条目；`test/桌面应用/` 的单文件条目只能扩展。任何需要新增该目录测试文件的想法，先停手交 Governance。
- 测试：全量 `node --test "test/**/*.test.ts"`（三层 glob）；各角色先跑自己的套件，再由测试角色独立全量；`npm run typecheck` 零错。
- 提交：本轮与派发均不自动 git 提交；由客户决定提交时点。
