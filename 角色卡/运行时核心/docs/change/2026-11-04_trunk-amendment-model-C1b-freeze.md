# 运行时核心 C1b 契约冻结记录：app-owned `stable-write` 卡种收口（关闭 C1 冻结遗留 F2）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；运行时核心（独立固定上下文）；Batch 2 **C1b（stable-write card-kind 收口，关闭 C1 冻结遗留 F2）**。
- **日期 / 状态**：2026-11-04；**C1b 冻结完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push**。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**：1151 行 / 实际字节 SHA-256 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` / 归一化 `1e260646684185f37c34e904e92ce67e22e665eadcb8bdc7337fd521a06a4f2a`；§4.5.1/§4.10/§5.2.1。
- **本角色 P1 提案 r2（实现形状依据）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-P1.md` r2：927 行 / `8b0c3d1969a03785e431a2f55b8a4ab5b65d62dd0715da0e6f407b945aaa9e00`，§3.3-1（卡种与白名单精确增量）、§5.1、R11。
- **PM 复审（F2 裁决来源）**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`：451 行 / `1a73ebc6…`；§4.5/§13 F2：只新增 app-owned `stable-write`；`GOVERNANCE_CARD_KINDS` 白名单**不进** `GOVERNANCE_CARD_GROUP`；`run-role.ts` route hint 由编排 S3 编译解锁。
- **C1 冻结（F2 移交来源）**：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1-freeze.md` §六-1；C1 冻结的 `src/model/runtime.ts` = 3025 行 / SHA-256 `1dae1d3fce4a00e6ce62cf86e0e302de3a54293d5767cf7fcdeb5b17936263d7` / git blob `b796981e68dff6733727c51e3214128ffcd9857d`。**本节点改动前实测与该冻结字节完全一致**（见 §二），即纯叠加、未破坏 C1 冻结面。
- **C2c 冻结（兼容键来源）**：`角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-C2c-freeze.md` §六：`CARD_KIND_ROUTE_HINTS` 以 `Readonly<Record<GovernanceCardKind, string>> & Readonly<Partial<Record<"stable-write", string>>>` 预置 `stable-write` hint；`run-role.ts` 冻结 SHA-256 `93b78f09e08a7a4122b420a6bcdcb6e05000f96b802ffd77edc096f02810777b`。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。工作树中 C1/C2a/C2b/C2c/C3 的未提交改动为并行节点产物，不属本节点写集；本节点未触碰（§二末）。

## 一、结论

- **F2 已关闭（C1b 侧）**：`src/model/runtime.ts` 加法落 `AppOwnedGovernanceCardKind = "stable-write"`、`GOVERNANCE_APP_OWNED_CARD_KINDS`、`GovernanceCardKind` 联合追加、派生白名单 `GOVERNANCE_CARD_KINDS`（GROUP 键集 + app-owned 非判断卡种）。
- **永不判断/代选**：`GOVERNANCE_CARD_GROUP` 仍为 `Readonly<Partial<Record<GovernanceCardKind, GovernanceJudgeGroup>>>` 且**不含** `stable-write`；`governanceCardGroup("stable-write") === undefined`（含不可信 `as never` 入参路径）。
- **工具面不变**：`GovernanceConfirmCardKind` 仍只有 `appointment-write`；`src/provider/runtime/tools.ts` 未改（`CHOICE_CARD_KINDS`/`CONFIRM_CARD_KINDS` 原样，后者仍 `["appointment-write"]`）；`request_choice`/`request_confirmation` 结构上不可发 `stable-write`。
- **C2c 兼容键验证通过**：追加联合成员后 `CARD_KIND_ROUTE_HINTS` 交集类型继续成立，`npm run typecheck` **exit 0**；`run-role.ts` 未被本节点修改（实测哈希 = C2c 冻结 `93b78f09…`）。
- **验证**：`npm run typecheck` exit 0；定向 19/19 通过（新增 4 + C1 既有 15）；runtime-core 全量 352 / 345 pass / 3 fail / 4 skipped（3 个失败与 C1/B0 基线同源，均为 Windows symlink EPERM）；`test/编排/decision-card.test.ts` 4/4（旧卡种分组与工具 schema 不变的交叉证据）。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | 加法（C1 冻结 3025 → 3059，净 +34 行） | 3059 | `ea35c10ab4de918ed736fcff148185cb0ea24f21` | `9a68fef7298459ed6b03e9f38648ddb38d39959091459885ee05db2daa47388e` |
| 2 | `test/runtime-core/stable-write-card-kind.test.ts` | 新增 | 99 | `132bcaf47590458e19fbafc96433ad32315a8fff` | `6f919806ca8fc8a09bba83a9afdb85a58ec827a093de4340811bd4ed52d1a39f` |

- **改动前对照**：`src/model/runtime.ts` 改动前 3025 行 / SHA-256 `1dae1d3f…` / blob `b796981e…`，与 C1 冻结记录逐字节一致 ⇒ 本节点全部改动为叠加。
- **落点**：`:446-455`（`AppOwnedGovernanceCardKind` + `GOVERNANCE_APP_OWNED_CARD_KINDS`）；`:457-471`（`GovernanceCardKind` 联合与注释）；`:484-485`/`:496-506`（GROUP 注释收口：判断卡种与 app-owned 非判断卡种的分工、白名单拆分）；`:519-529`（`GOVERNANCE_CARD_KINDS`）。
- **`git status --porcelain -uall -- src test` 增量**：仅新增 `test/runtime-core/stable-write-card-kind.test.ts`；`runtime.ts` 在改动前已是 C1 的已修改文件（M），本节点为其唯一后续改动者（由 §二 哈希链证明）。
- **明确未改**：`src/pipeline/orchestration/run-role.ts`（实测 SHA-256 `93b78f09…` = C2c 记录）、`src/provider/runtime/tools.ts`（HEAD 状态，未出现在 git status）、`src/common/**`（C2a/C2b 并行改动非本节点）、其它 Model 文件（`trunk.ts`/`version-change.ts`/`project-state.ts` 等）、`app/**`、其它角色测试；角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling。

## 三、冻结的导出符号（增量）

- `AppOwnedGovernanceCardKind = "stable-write"`（`runtime.ts:452`）：应用自有、永不进入判断分组的卡种；P1.6 §4.5.1 workflow 轻量写入确认卡，项目级、无 flowId。
- `GOVERNANCE_APP_OWNED_CARD_KINDS: readonly AppOwnedGovernanceCardKind[] = Object.freeze(["stable-write"])`（`:455`）。
- `GovernanceCardKind = GovernanceChoiceCardKind | GovernanceConfirmCardKind | "download" | AppOwnedGovernanceCardKind`（`:467-471`）。
- `GOVERNANCE_CARD_KINDS: readonly GovernanceCardKind[]`（`:526-529`）：**派生**（`Object.keys(GOVERNANCE_CARD_GROUP)` + `GOVERNANCE_APP_OWNED_CARD_KINDS`）而非手抄，本轮实际值 8 项 = `appointment-write`/`download`/`proposal`/`appointment`/`acceptance`/`intent-confirm`/`decision` + `stable-write`；`Object.freeze`，无重复。本白名单不表达权限、不改变分组。
- `GOVERNANCE_CARD_GROUP` 保持既有类型与 7 键精确集（`acceptance`/`appointment`/`appointment-write`/`decision`/`download`/`intent-confirm`/`proposal`）；`stable-write` 故意不在表（`:504-506` 注释）。
- **未动**：`GovernanceChoiceCardKind`（5 值）、`GovernanceConfirmCardKind`（`appointment-write`）、`CONFIRM_CARD_KINDS` 字面量、`governanceCardGroup` 实现、`"download"` 既有语义（仅注释指向新白名单）。

## 四、F2 逐条关闭证据

| F2 要求（P1 r2 / PM §4.5） | 落点 / 证据 |
| --- | --- |
| `"stable-write"` 加入 `GovernanceCardKind` 联合 | `runtime.ts:452/467-471`；测试「卡种联合（F2）：…」类型赋值 `const kind: GovernanceCardKind = "stable-write"` + 运行断言 |
| 绝不进 `GOVERNANCE_CARD_GROUP`；`governanceCardGroup` 返回 `undefined` ⇒ 永不判断 | GROUP 表未加键（`:494-507`）；测试断言 `hasOwnProperty(GOVERNANCE_CARD_GROUP,"stable-write") === false`、`governanceCardGroup("stable-write") === undefined`、`as never` 不可信入参同样 `undefined` |
| 新增 `GOVERNANCE_CARD_KINDS` 白名单（GROUP 键集 + app-owned 非判断卡种） | `runtime.ts:519-529`；测试「白名单单一来源」断言 8 项排序相等、无重复、`Object.isFrozen`、所有 GROUP 键全覆盖（R11 漂移缓解：派生非手抄） |
| `request_choice`/`request_confirmation` 不可发该卡 | `GovernanceChoiceCardKind`/`GovernanceConfirmCardKind` 未扩；测试两条 `@ts-expect-error`（编译期拒绝）+ 运行侧形状断言；provider `tools.ts` 未改；`decision-card.test.ts`「request_confirmation 仅 appointment-write」通过 |
| 旧卡种行为不变 | 测试「判断分组不变」：GROUP 精确 7 键 + 各旧卡种分组逐项断言；交叉运行 `test/编排/decision-card.test.ts` 4/4（decision 组五 choice、approval 组 appointment-write+download、版本决策卡校验） |
| 账本可携带新卡种 | `RequestCreatedEvent`/`RequestResolvedEvent.cardKind?: GovernanceCardKind` 自动接受 `"stable-write"`；测试以 `Pick<..., "cardKind">` 赋值断言 |
| 编译解锁不再需要改 `run-role.ts` | 本节点未改该文件（哈希 = C2c 冻结 `93b78f09…`）；`npm run typecheck` exit 0 ⇒ C2c 预置交集键在联合追加后继续成立 |

## 五、测试 / 类型检查原始结果

1. **`npm run typecheck`**（全仓 `tsc --noEmit`，include 含 `src`/`test`/`app` 除 renderer）：**exit 0**（无输出错误；在最终字节 `9a68fef7…` 上运行）。
2. **定向**：`node --test "test/runtime-core/stable-write-card-kind.test.ts" "test/runtime-core/version-change-contract.test.ts"`
   → **tests 19 / pass 19 / fail 0 / cancelled 0 / skipped 0 / duration ≈ 91 ms**；exit 0（新增 4 + C1 既有 15）。
3. **runtime-core 全量**：`node --test "test/runtime-core/**/*.test.ts"`
   → **tests 352 / pass 345 / fail 3 / cancelled 0 / skipped 4 / duration ≈ 14.6 s**；exit 1（仅既有环境失败）。
   - 失败分类（全部为 **Windows symlink EPERM**，与 C1/B0 基线同源，非本改动引入）：
     - `test/runtime-core/file-write-safety.test.ts`：「D3 linked workspace root remains usable; linked target itself is not replaced」。
     - `test/runtime-core/session-store.test.ts`：「store: traversal, mismatched scope and symlinked runtime directories rejected」「store: native validation stays lazy and native symlink is rejected before effects」。
   - **计数对照**：C1 基线 runtime-core = 348 tests / 341 pass / 3 fail / 4 skip；本次 = 348 + 4 新增 = 352 tests；341 + 4 = 345 pass；fail/skip 与基线完全一致 ⇒ **无既有测试回归、无断言改写、无新增 skip**。
4. **旧卡种交叉回归**（只读运行，未改该文件）：`node --test "test/编排/decision-card.test.ts"` → **tests 4 / pass 4 / fail 0**；含「D 卡种分组：decision 组保留五种 choice；approval 组为 appointment-write 与 download」「工具 schema：request_choice 保留 decision，request_confirmation 仅 appointment-write」。

## 六、遗留依赖（不声称已完成）

1. **C2a `isGovernanceCardKind` 改读白名单**：`src/common/编排/task-state.ts:143-145` 当前仍直接读 `GOVERNANCE_CARD_GROUP` 键集（C2a 冻结记录 §八-1 已如实披露并留 S3 同批）。本节点只提供 `GOVERNANCE_CARD_KINDS`，未改 task-state.ts（不在 C1b 写集）。**接线前，账本对 `cardKind:"stable-write"` 的校验仍会拒绝（fail-closed）**；该缺口不影响本节点契约冻结，但 S3/D1 记账前必须完成。
2. **D1/U1**：`validateStableWriteCardShape`、卡片渲染与 `DECISION_KINDS` 冻结 token 消费属桌面节点。
3. **S3/S4**：`run-role.gate` 接 `stableWriteDecision` + `WriteGateContext.contentSha256`（F6 另一侧）、`stable-write-runtime` 发卡/事件归后续节点；本节点未实现判定/发卡。

## 七、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 未改角色卡/边界/changelog/memo/api-spec/communication/acceptance/scheduling；未运行应用；**未 commit / 未 push / 未 merge / 未 release**。
- 后续任何形状变更回运行时核心并按 C1b/C1 冻结流程重跑受影响证据。
