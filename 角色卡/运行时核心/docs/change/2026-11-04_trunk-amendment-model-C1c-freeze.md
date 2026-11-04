# 运行时核心 C1c 冻结记录：`WriteGate` 内容上下文（关闭 C1 冻结遗留 F6）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；运行时核心（独立固定上下文）；Batch 2 **C1c（WriteGate 内容上下文，关闭 C1 冻结遗留 F6）**。
- **日期 / 状态**：2026-11-04；**C1c 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / 实际字节 SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` / 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`；§4.5.1/§4.6/§5.2.1/§7.2 AC-15、AC-33–AC-36。
- **本角色 P1 提案 r2（实现形状依据）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md` r2：927 行 / `8b0c3d1969a03785e431a2f55b8a4ab5b65d62dd0715da0e6f407b945aaa9e00`，§2 #4、§3.3-8、§4.2-6、§5.1、Q16。
- **PM 复审（F6 裁决来源）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：451 行 / `1a73ebc6d2d0fb1776999522d1fec326e5c1eee3cab205d8a506fee7b9abcb8c`；§4.3-5（F6）与 §13 F6 行：`WriteGate` 扩可选上下文、`tools.ts` 补入本角色 C1 写集、S3 消费。
- **C1 冻结（F6 移交来源）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md` §六-2。
- **C1b 冻结（改动前基线）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1b-freeze.md`；`src/model/runtime.ts` = 3059 行 / blob `ea35c10ab4de918ed736fcff148185cb0ea24f21` / SHA-256 `9a68fef7298459ed6b03e9f38648ddb38d39959091459885ee05db2daa47388e`。**本节点改动前实测与该冻结字节完全一致**（见 §二），即纯叠加、未破坏 C1/C1b 冻结面。
- **C2b 冻结（`stableWriteDecision` 消费方）**：`角色卡/门禁引擎/docs/change/2026-11-04_trunk-amendment-model-C2b-freeze.md`：191 行 / `f85f38c8…`；`src/common/门禁引擎/versioned-doc-guard.ts` 冻结 SHA-256 `95b7887303fda31b193b4753b41c65e06fa5fa065d70bcfd24a6b6d0f066a158`（本节点未改，实测一致）。`stableWriteDecision(input: StableWriteDecisionInput)` 入参 `{projectRoot, relPath, sha256, permit?, now?}`，`sha256` = 写入最终字节 hash。
- **C2c 冻结（S3 前置）**：`src/pipeline/orchestration/run-role.ts` 实测 SHA-256 `93b78f09e08a7a4122b420a6bcdcb6e05000f96b802ffd77edc096f02810777b`（= C2c 冻结值；本节点未改）。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。工作树中 C1/C1b/C2a/C2b/C2c/C3 等并行节点改动不属本节点写集；本节点未触碰（§二末）。

## 一、结论

- **F6 已关闭（C1c 侧）**：`src/model/runtime.ts` 加法落 `WriteGateOperation = "write" | "edit"`、`WriteGateContext { contentSha256?, operation? }`，`WriteGate` 签名扩为 `(targetPath: string, context?: WriteGateContext) => WriteDecision`；旧单参数实现/调用零变化。
- **工具侧已提供内容 hash**：`src/provider/runtime/tools.ts` 的 `govern(...)` 增可选 `context` 并原样传给 gate；`writeGuarded` 的**第二次（写前复核）** gate 调用传 `{ contentSha256: sha256Hex(data), operation }`：
  - `write_file`：`data = Buffer.from(content, "utf8")`，`operation:"write"`；
  - `edit_file`：`data` = 编辑应用后、`atomicWriteFile` 前的最终字节（BOM 原样保留），`operation:"edit"`。
- **首次调用语义不变**：写类工具首次 `govern` 只传路径（无 context）；工具结果文案、审批/预授权/门禁判定链不变；gate 拒绝仍发生在任何落盘之前（拒绝时目标文件不存在/原文件不变）。
- **S3 可消费**：run-role 可对 stable 路径用 `context.contentSha256` 调 C2b `stableWriteDecision`（输入 `sha256` = 同一最终字节 hash）。本节点不接线编排。
- **验证**：`npm run typecheck` exit 0；新增定向测试 5/5 通过；runtime-core 全量 357 / 350 pass / 3 fail / 4 skipped（3 个失败与 C1/C1b/B0 基线同源，均为 Windows symlink EPERM）。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | 加法（3059 → 3076，净 +17 行；改动前 = C1b 冻结 `9a68fef7…`） | 3076 | `818407be007510546e0025438e4ffa3ebe10b629` | `259c4e0193d9f7062ced08228d8f46d36432f670643d3dd9a61dee381553b785` |
| 2 | `src/provider/runtime/tools.ts` | 加法（+26/−5，3890 → 3911；改动前 = HEAD，`git status` 未列出） | 3911 | `755ef635d99a8ce4b71c6b7ab919d35535494d63` | `4146574f53ac93ed2ba74089372c3e8c2df44c3d86bd2a0da394764469d9439e` |
| 3 | `test/runtime-core/write-gate-context.test.ts` | 新增 | 121 | `92635c79339b33ef2698d55701635e570b3c2fdb` | `a5b85cdf377c19a0b7498f382722f105ceaa49e0346e1b20825fe50321aac071` |

- **改动前对照**：`src/model/runtime.ts` 3059 行 / SHA-256 `9a68fef7…` / blob `ea35c10a…` = C1b 冻结记录逐字节一致；`src/provider/runtime/tools.ts` 3890 行 / SHA-256 `cebcbd1b…` / blob `7ac2413…` = HEAD（未修改）。⇒ 本节点改动全部为叠加/最小增量。
- **落点**：
  - `src/model/runtime.ts:195-212`：`WriteGateOperation`、`WriteGateContext`、`WriteGate` 新签名（替换原单行 `export type WriteGate = (targetPath: string) => WriteDecision;`）。
  - `src/provider/runtime/tools.ts:5`（`node:crypto` import）、`:10-12`（类型 import）、`:327-362`（`govern` 可选 context；首次 `gate(resolved)` 单参调用）、`:404-407`（`sha256Hex`）、`:414-444`（`writeGuarded` 增 `operation` 并在写前复核传上下文）、`:498`（write_file 传 `"write"`）、`:564`（edit_file 传 `"edit"`）。
- **`git status --porcelain -uall -- src test` 增量**：本节点只新增 `test/runtime-core/write-gate-context.test.ts`，并修改 `src/model/runtime.ts`（原已为 C1/C1b 修改文件）与 `src/provider/runtime/tools.ts`（原为 HEAD 干净文件）。
- **明确未改**：`src/pipeline/orchestration/run-role.ts`（实测 SHA-256 `93b78f09…` = C2c 冻结）、`src/common/门禁引擎/**`（实测 `versioned-doc-guard.ts` = C2b 冻结 `95b78873…`）、`src/service/**`、`src/provider/**` 其它文件、`app/**`、其它角色测试、角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling。

## 三、冻结的导出符号（增量）

```ts
/** 写门禁操作类型（F6）：仅内容上下文的分类，不改变任何判定/审批/预授权语义。 */
export type WriteGateOperation = "write" | "edit";

/**
 * 写门禁内容上下文（F6；P1 r2 §3.3-8）：**可选第二参数**，缺席 = 旧单参语义。
 * 供 `run-role.gate` 对 stable 路径消费 `contentSha256` 调 `stableWriteDecision`（S3 接线）。
 */
export interface WriteGateContext {
  /**
   * 写前最终字节 sha256（hex）：`write_file` = `Buffer.from(content)`；
   * `edit_file` = 编辑应用后、`atomicWriteFile` 前的字节（BOM 原样保留）。
   */
  contentSha256?: string;
  operation?: WriteGateOperation;
}

/** 向后兼容：既有单参数实现/调用不变；可选第二参数缺席 = 旧语义。 */
export type WriteGate = (targetPath: string, context?: WriteGateContext) => WriteDecision;
```

- 与 P1 r2 §3.3-8 **逐字段一致**：仅 `contentSha256?` / `operation?`；无额外字段、无 `stablePermit` 等第二形状。
- `src/provider/runtime/tools.ts` 的 `govern` 为模块私有函数，未新增导出；`buildGovernedTools` / 工具集合 / schema / 回执语义不变。

## 四、F6 逐条关闭证据

| F6 要求（P1 r2 §3.3-8 / PM §4.3-5） | 落点 / 证据 |
| --- | --- |
| `WriteGate` 可选第二参数 `WriteGateContext { contentSha256?, operation? }`，向后兼容 | `runtime.ts:196-212`；测试「F6/类型形状」逐字段/负例断言；`@ts-expect-error` 验证 `operation` 仅 `write|edit`、未定义字段不可进入上下文 |
| `govern(...)` 增可选 `context` 并传给 gate | `tools.ts:327-350`；`decision = gate(resolved, context)` |
| `writeGuarded` 第二次（写前复核）传 `{ contentSha256: sha256Hex(data), operation }` | `tools.ts:436-443`；测试断言 gate 被调用 2 次：首次 `undefined`，第二次恰为该形状 |
| `write_file` 用 `Buffer.from(content)` 的最终字节 | `tools.ts:497`；测试用 UTF-8 多行内容比对 `sha256(Buffer.from(content,"utf8"))` 与写盘字节 |
| `edit_file` 在编辑应用后、`atomicWriteFile` 前计算最终字节 sha（BOM 保留） | `tools.ts:560-563`；测试以 BOM 原文件 + 替换断言 `contentSha256 === sha256(BOM + "changed")` 且磁盘字节一致 |
| 首次调用与单参数 gate 行为不变 | `govern` 首次（`context === undefined`）真正以 `gate(resolved)` 单参调用，参数个数/旧 gate 语义逐字不变；测试「向后兼容」：单参数 gate 实现 + 直接 `gate(path)` 单参调用均可用，write 成功 |
| gate 拒绝时不落盘（既有行为不回归） | 测试「写前复核拒绝」：带 `contentSha256` 的 gate 拒绝 ⇒ `write_file` 目标不存在、`edit_file` 原文件不变；既有 `file-write-safety` 的 deny/throw/abort 二次复核用例继续通过（已知 symlink EPERM 除外） |
| 不改变工具结果/审批语义、不改 schema/工具集合 | `tools.ts` diff 仅上下文传递（+25/−5）；`buildGovernedTools`/工具名/参数/schema 未动；成功/失败文案未改 |
| 可由 run-role 用该 hash 调 `stableWriteDecision` | C2b 输入 `sha256` = 写入最终字节 hash，与本层 `contentSha256` 同源同字节；接线属 S3（§六） |

## 五、测试 / 类型检查原始结果

1. **`npm run typecheck`**（全仓 `tsc --noEmit`，include 含 `src`/`test`/`app` 除 renderer）：**exit 0**（无输出错误；在最终字节 `259c4e01…`/`4146574f…`/`a5b85cdf…` 上运行）。
2. **定向**：`node --test "test/runtime-core/write-gate-context.test.ts"`
   → **tests 5 / pass 5 / fail 0 / cancelled 0 / skipped 0**；exit 0。
3. **runtime-core 全量**：`node --test "test/runtime-core/**/*.test.ts"`
   → **tests 357 / pass 350 / fail 3 / cancelled 0 / skipped 4 / duration ≈ 14.5 s**；exit 1（仅既有环境失败）。
   - 失败分类（全部为 **Windows symlink EPERM**，与 C1/C1b/B0 基线同源，非本改动引入）：
     - `test/runtime-core/file-write-safety.test.ts`：「D3 linked workspace root remains usable; linked target itself is not replaced」。
     - `test/runtime-core/session-store.test.ts`：「store: traversal, mismatched scope and symlinked runtime directories rejected」「store: native validation stays lazy and native symlink is rejected before effects」。
   - **计数对照**：C1b 基线 runtime-core = 352 tests / 345 pass / 3 fail / 4 skip；本次 = 352 + 5 新增 = 357 tests；345 + 5 = 350 pass；fail/skip 与基线完全一致 ⇒ **无既有测试回归、无断言改写、无新增 skip**。既有 `file-write-safety.test.ts` 未修改。

## 六、遗留依赖（不声称已完成）

1. **S3 编排接线（`src/pipeline/orchestration/run-role.ts`）**：对 stable 路径消费 `context.contentSha256` 调 C2b `stableWriteDecision({projectRoot, relPath, sha256, permit, now})`；denied ⇒ 返回其 `WriteDecision`，allowed ⇒ 继续 baseGate。首次（纯路径）调用按 P1 r2 不携带上下文，S3 对「无上下文」通道（shell/opaque）的 stable 拒绝口径按 P1 §3.3-8/R13 实现。**本节点未改编排文件**。
2. **B-11 `completeWrite(actualSha)` 消费与 mini re-pin**：写后校验 `sha256 === targetSha256`、消费许可、刷新 trunk manifest 归编排/应用钩子；本层只提供写前最终字节 hash。
3. **D1/U1**：stable-write 确认卡/许可安装/结果外显归桌面节点；本节点不发行卡、不改审批语义。
4. **shell/opaque 路径**：`shell-write-guard` 的 stable 判定不经过本上下文；按 C2b/C6 口径在门禁/编排侧拒绝（本层无旁路）。
5. **C2a `isGovernanceCardKind` 白名单切换**：与 F6 无关，属 C1b 遗留（见 C1b 记录 §六-1），S3/D1 记账前完成。

## 七、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 未改角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling；未运行应用；**未 commit / 未 push / 未 merge / 未 release**。
- 后续任何形状变更回运行时核心并按 C1c/C1b/C1 冻结流程重跑受影响证据。
