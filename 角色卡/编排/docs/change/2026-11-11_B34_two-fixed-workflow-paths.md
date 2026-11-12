# B34.1 两条固定工作流路径：路径 B 拒绝 B2 advance stage-request（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B34.1——RR31 死状态修复（路径 B 的 B2 `change.scope-decided` 记录窗口被 B2 stage-request 关闭且不可恢复）。
- 依据：RR31 真机记录 `角色卡/测试/docs/change/2026-11-11_RR31_wuxia-roguelike-fix.md`（B2 stage-request 两次被受理 ⇒ 视图进入 B2(requested)；B3 advance 被拒 `stage-transition-invalid`「B2 范围决定未记录：当前 B2(requested)」）；协调方 B34 授权（方案二选一，建议并默认 (b)）；并行记录 `角色卡/门禁引擎/docs/change/2026-11-11_B34_two-fixed-workflow-paths.md`（B34.2 资源文本已按本批稳定码/文案对齐）。
- 基线：HEAD `faa5c497c3a67dd5438d9bb3a2570c4774f95d3c`（RR31 记录），见 `_evidence/b34-00-baseline-head.txt`。工作树另有门禁引擎写区 B34.2 的既有未提交改动（`src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`），本批未触碰。

## 一、RR31 失败事实（根因）

- 应用只在受理 **B3 advance stage-request** 时自动写 B2 `change.scope-decided`（桌面 `app/desktop/session.ts` 调用 `recordFixedPathBScopeDecisionForDispatch`；该 helper 要求视图仍为 **B1 completed + B2 pending/failed**，见 `app/desktop/workflow.ts:624–631`）。成功记录后 B2 completed，B3 请求方可受理。
- 但编排 `requestStage`（`src/common/编排/workflow-service.ts`）把 **B2 advance stage-request** 当作合法转移受理（B1 completed → B2）：写入 `stage.requested B2`，视图进入 **B2(requested)**。
- 此后：B3 生产派发 ⇒ `b-change-scope-invalid`（B3 写集来源缺失：`change.scope-decided` 不存在）；B3 advance ⇒ `stage-transition-invalid`（B2 范围决定未记录：当前 B2(requested)，要求 B1 已完成且 B2 未完成）。`change.scope-decided` 只允许 B2 在办或 B1 completed + B2 pending/failed（`workflow-state.ts:263–276`、`workflow-service.ts:recordChangeScopeDecision`），没有直写通道 ⇒ **死状态不可恢复**。
- 既有防御层（桌面 helper 的严格窗口）只在 B3 受理前生效，无法修复已经进入的 B2(requested) 状态；`requestStage` 的 B2 受理是唯一的入口缺陷。

## 二、方案选择与理由：采用 (b) 拒绝 Path B 的 B2 advance stage-request

协调方授权二选一：

- **(a)** 受理 B2 stage-request 时由应用按同一规则记录 `change.scope-decided`；
- **(b)** 拒绝 Path B 的 B2 advance stage-request，明确提示直接发 B3 advance。

**本批采用 (b)，理由**：

1. **写区边界**：实现 (a) 需要复用桌面 helper 的 `recordFixedPathBScopeDecisionForDispatch`（`app/desktop/workflow.ts`，桌面窗口写区；本角色不得修改）。该 helper 依赖 B1 生产任务的 done 报告 evidence / `requestedEvidence` 候选路径与 roster 属主派生——这些事实在 `requestStage` 输入中不可得。若在服务层自行实现，将复制第二份 scope 记录逻辑，且必须让模型自报 scope/hash，违反「不采信模型自报写集」的既有设计。
2. **(b) 是最小、fail-closed 的入口修复**：只在 `requestStage` 写任何账本事件之前拒绝一个本就不应存在的请求，B1 completed/B2 pending 保持不变，既有 B3 advance 自动记录 scope 的生产接线逐字复用。
3. **(b) 提供可执行的稳定失败码**：chief 收到 `b2-stage-request-forbidden` 与明确下一步（直接发 B3 advance），不再需要猜通道；并行 B34.2 的 `chief-workflow-v2.md` 已按同一码/文案更新（另一写区）。
4. **(a) 会改变 B2 语义**（B2 stage-request 变成 scope 记录触发器），需要桌面窗口协作与新证据通道；未经调度确认不得越界实现。本批**无跨写区实施需求**（B34.2 资源文本由门禁引擎角色并行完成）。

## 三、实施

### 3.1 `src/common/编排/workflow-service.ts`（M，+14/−0）

在 `requestStage` 解析出 `resolvedPath`、通过既有账本损坏/已关闭检查之后，**在任何账本事件写入之前**新增门：

```ts
if (resolvedPath === "B" && input.stage === "B2" && action === "advance") {
  return serviceFailure(
    "b2-stage-request-forbidden",
    "路径 B 不发 B2 stage-request；B1 完成后直接发 B3 advance stage-request（应用在受理 B3 时记录 B2 change.scope-decided）；B2 保持 pending。",
  );
}
```

- **零写入**：不写 `stage.requested`/`workflow.started`/任何事件，不创建 stage-request 任务；视图保持 B1 completed/B2 pending。
- **B3 恢复路径不变**：随后 `recordChangeScopeDecision`（B1 completed + B2 pending/failed 窗口）照常写 `change.scope-decided` ⇒ B2 completed；`requestStage(stage:"B3")` 按既有 `canRequest`（B2 completed → B3）受理。
- **既有 fail-closed 不放松**：账本损坏/关闭先返回 `workflow-corrupt`/`workflow-closed`；首次 B2 请求（新 workflow）仍由既有「首个阶段必须是 B1」`stage-transition-invalid` 拒绝；stop、rework 回落、Path A/legacy 不经过本检查（仅 `resolvedPath === "B" && stage === "B2" && advance`）。
- **未改**：桌面严格窗口（`app/desktop/**`）、`recordChangeScopeDecision`、`workflow-state.ts` 投影、`src/model/**`、`src/pipeline/**`、`src/provider/**`、`src/common/门禁引擎/**`。

### 3.2 `test/编排/workflow-stage-request.test.ts`（M，+4 tests）

在既有 requestStage 测试文件新增 4 条 B34.1 测试（复用既有 `appendEvents`/tempRoot/cleanup，新加路径 B/A 种子与 boundary 夹具）：

1. **B1 completed + B2 advance** ⇒ `b2-stage-request-forbidden`；文案含「直接发 B3 advance stage-request」「B2 保持 pending」「change.scope-decided」；账本事件数不变、无 `stage.requested B2`、无 `task.created`；视图仍 B1 completed/B2 pending。
2. **B2 拒绝后恢复**：`recordChangeScopeDecision`（B1 completed/B2 pending）可记录 `change.scope-decided`（writesets 按 boundary 属主派生）⇒ B2 completed；`requestStage(stage:"B3", advance)` 受理成功（`stage-request:<wf>:B3:1`）；全程无 `stage.requested B2`。
3. **B2 rework 回落不被误伤**：种子「B1 completed → B2 requested → stage.reworked 回 B1（B2 failed）」；`requestStage(stage:"B1")` 照常受理（attempt 2）；B2 advance 仍拒绝且零写入；收口 B1 请求并补记 B1 completed 后，B2 failed 窗口仍可 `recordChangeScopeDecision`，随后 B3 advance 受理；既有 `stage.reworked` 与 rework 前的 B2 `stage.requested` 各保持 1 条。
4. **首请求/Path A 不变**：新 workflow 首请求 B2 仍 `stage-transition-invalid`（「首个阶段必须是 B1」，零 `workflow.started`）；Path A 的 B2 请求仍 `stage-transition-invalid`（不是新码）；Path A A1 completed → A2 advance 照常受理。

未新增 skip/force-exit；未删除/弱化既有断言。

## 四、验证（D1）

| 范围 | 结果 | 证据（SHA-256） |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b34-01-typecheck.txt`（`4d92735e…`） |
| 受影响集（8 文件 54 tests：workflow-stage-request 12、path-b-baseline 5、workflow-state 13、fixed-path-start 4、workflow-close-intent 5、workflow-ledger 5、workflow-basis-b21 7、fixed-path-full-chain 3） | **54/54 pass** | `_evidence/b34-02-affected.tap`（`26fecc97…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b34-03-full-chain.tap`（`b7aac46f…`） |
| 全量 `test/编排/*.test.ts` | **1382 tests / 1356 pass / 24 fail / 2 skip**；24 条失败名与 B31 冻结 known-red **逐名一致（diff 空）**；无新增失败、无新增 skip | `_evidence/b34-04-orchestration-suite.tap`（`dc9dd87d…`）、`b34-04-orchestration-knownred.txt`（`310ed743…`）、`b34-04-orchestration-knownred-failnames.txt`（`f9513fb0…`，与冻结清单逐字节一致）、`b34-04-orchestration-knownred-diff.txt`（`e3b0c442…`，空） |
| 桌面 fixed 工作流接线交叉验证（只读运行，未改 `test/桌面应用/**`） | **14/14 pass** | `_evidence/b34-05-desktop-wiring-b51.tap`（`5b1d45e5…`） |

基线对照：B31 记录（HEAD `9cce927`）编排全量为 1352 pass / 24 fail / 2 skip（1378 tests）；本批 +4 tests ⇒ 1382 tests / 1356 pass；known-red 集合与数量（24 fail、2 skip）未变。typecheck 输出与 B31 逐字节同（`4d92735e…`）。

## 五、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts` | M | 210,285 / 4,474 | `fb302dd8cfcd9c3ab9ed10ea292e5b13a8f74fcbc3b19c73ff89424040cdf7ce` | +14/−0 |
| `test/编排/workflow-stage-request.test.ts` | M | 32,216 / 641 | `51c6a7f4db54fc4dcccd86addeef0512781e12650a4b5a2dd93d263ad2d37e3c` | +274/−0 |

- 证据文件 SHA-256：`b34-00-baseline-head.txt` `7f897319…`、`b34-01-typecheck.txt` `4d92735e…`、`b34-02-affected.tap` `26fecc97…`、`b34-03-full-chain.tap` `b7aac46f…`、`b34-04-orchestration-suite.tap` `dc9dd87d…`、`b34-04-orchestration-knownred.txt` `310ed743…`、`b34-04-orchestration-knownred-failnames.txt` `f9513fb0…`、`b34-04-orchestration-knownred-diff.txt` `e3b0c442…`（空）、`b34-05-desktop-wiring-b51.tap` `5b1d45e5…`。

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/真实模型，不声称 RR31 已通过。真实效果待下一轮 RR 行使（B1 completed → 直接 B3 advance → 应用记录 `change.scope-decided` → B3 实现 → B4）。
- **只防止进入死状态，不自动恢复既有死状态**：若账本已处于 B2(requested)（RR31 运行根），本批不会自动写 scope；恢复仍依赖既有 `B2→B1` rework 语义或后续专项（本批未改 rework 写入路径，`closeTask` 目前只为 A12b 写 `stage.reworked`；B2 rework 的恢复能力不在本批范围，测试按投影层冻结语义验证）。
- **未改桌面严格门**：`recordFixedPathBScopeDecisionForDispatch` 的窗口（B1 completed + B2 pending/failed）保持原样；B3 受理自动记录 scope 的接线未变。
- **跨写区说明**：本批**无跨写区实施需求**。B34.2（`chief-workflow-v2.md` 资源文本按 `b2-stage-request-forbidden` 与同一文案对齐）由门禁引擎角色并行实施；`src/common/门禁引擎/**` 的既有未提交改动本批未触碰。桌面窗口如需在回执/提示层复用该稳定码文案，属可选后续，不阻塞本状态机修复。
- 未 push/未合 main/未打 tag/未 commit（由调度统一提交）；本记录不自嵌自身 SHA。
