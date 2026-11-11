# W：B31 A12b 轻量验收（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B31——RR26 失败修复（A12b blocked 复验报告无法被 accepted 收口）。
- 依据：RR26 记录 `角色卡/测试/docs/change/2026-11-11_RR26_two-fixed-workflow-paths.md`（A12b `status=blocked` 交回，12 分钟 stall）；协调方 B31 授权；`chief-workflow-v2.md` A12 段（B31，另一写区已更新：轻量验收为受支持动作，`accepted` 必须同时有应用归档证据与非空 `note`；其余阶段/缺归档/缺 note 仍 fail-closed）。
- 基线：HEAD `9cce927`（B30），见 `_evidence/b31-00-baseline-head.txt`；工作树另有门禁引擎写区 B31 的既有未提交改动（`chief-workflow-v2.md` 与对应测试），本批未触碰。

## 一、RR26 失败事实（根因）

- verifier 无受认可运行期验证通道，A12b 复验报告以 `status=blocked` 交回。
- 幕僚无法在不改产品语义的情况下收口：`workflow-service.closeTask` 对 `outcome:"accepted"` 无条件要求最后报告 `status === "done"`；blocked 报告被 `close-report-missing` 拒绝，A12b 永不完成，A12/A13/发布全链 stall。
- A12b 归档 `archiveAcceptance` 本身不检查报告 status；A12 聚合只在 `accepted + acceptanceArchive` 时写入。缺的是服务层 accepted 报告门对“A12b 轻量验收”的受支持分支。

## 二、实施

### 2.1 `src/common/编排/workflow-service.ts`（M）

`closeTask` accepted 报告门（fail-closed 收窄，legacy 不动）：

- 默认仍要求最后报告 `status === "done"`；
- **仅当** `created.stage === "A12b"` ∧ `input.outcome === "accepted"` ∧ `input.evidence?.acceptanceArchive !== undefined` ∧ `input.note` 非空（`isNonEmptyText`，显式幕僚决策）∧ 最后报告 `status === "blocked"` 时，允许 accepted 收口；
- 其它阶段、缺归档、缺 note（含空白 note）、最后报告 `failed`/缺报告 ⇒ 保持 `close-report-missing`；A12b blocked 前置缺失时消息明确区分“轻量验收需要 acceptanceArchive 与非空 note”；
- 轻量验收分支不追加 `stage.blocked`（`blockedByReport` 排除），避免已完成阶段又被写成 blocked 导致投影 `workflow-corrupt`；
- `task.closed.note` 原样保存幕僚标记；不解析/不校验 note 文案（文案由 chief v2 约束）；A12b 阶段完成与 A12 聚合逻辑不变；rework/rejected 路径不变；legacy（无 `workflowId`）逐字不变。

### 2.2 `test/编排/acceptance-archive.test.ts`（M，+3 tests）

在既有 A12b closeTask/归档夹具上新增：

1. **正向**：A12b blocked 报告 + 应用归档 + 非空 note + accepted ⇒ `ok`、`stageCompleted=true`、`task.closed` accepted、`task.closed.note` 留痕、`stage.completed A12b` 恰一次、`stage.completed A12` 聚合（`cause=acceptance-archive`）恰一次、无 `stage.blocked A12b`；同 operationId replay 返回原 `eventId`、不重复写阶段事件。
2. **fail-closed**：A12b blocked + 缺 `acceptanceArchive` ⇒ `close-report-missing`（消息含 acceptanceArchive）；缺 note / 空白 note ⇒ `close-report-missing`（消息含 note）；失败均不写 `task.closed`、不写 A12b/A12 完成；非 A12b（A12a、A2）blocked + note + 归档 ⇒ 仍走通用门拒绝（消息含 `status=done`）。
3. **未放宽路径**：A12b rework（blocked 报告、无 note/归档）仍写 `stage.reworked {reworkOf:"A12b"}`；blocked 报告的 rejected 收口不新增前置；legacy（无 workflowId）仍 `close-task-invalid`（legacy 不进入 fixed 轻量验收门）。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b31-01-typecheck.txt`（`4d92735e…`） |
| 受影响集（acceptance-archive、workflow-close-intent、workflow-fixed-b131、workflow-stage-request、release-merge、run-role-fixed-b2 + 确定性全链；7 文件） | **54/54 pass** | `_evidence/b31-02-affected.tap`（`5025b2c2…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b31-03-full-chain.tap`（`2542f208…`） |
| 全量 `test/编排/*.test.ts` | **1352 pass / 24 fail / 2 skip**（1378 tests）；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b31-04-orchestration-suite.tap`（`0675ac06…`）、`b31-04-orchestration-knownred-failnames.txt`（`f9513fb0…`）、`b31-04-orchestration-knownred-diff.txt`（`e3b0c442…`，空） |

基线对照：B26 记录的编排全量为 1346 pass / 24 fail / 2 skip（1372 tests）；本批 B27–B30 已增测试，本文件新增 3 tests，故 1378 tests；known-red 集合未变（24 条同名）。

## 四、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts` | M | 209,152 / 4,460 | `c3565d1b8c7cba395a6a6b87b18766f79bf917f9a9d818c0deab124ab2a74e63` | +21/−2 |
| `test/编排/acceptance-archive.test.ts` | M | 23,780 / 452 | `945538f3f9d492416966e7b388ccbbac6f4596387927ce02f1a632285251f722` | +224/−0 |

## 五、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR26 已通过；真实效果待下一轮 RR 行使。未 push/未合 main/未打 tag/未 commit（由调度统一提交）。
- **跨写区依赖（未修改，按授权停手说明）**：`app/desktop/session.ts` 的 `buildFixedCloseEvidence` 当前在 `lastReport?.status !== "done"` 时直接返回 `{ ok: true, evidence: undefined }`（约第 10780 行）。因此 A12b blocked 报告在真实桌面链路上不会生成 `acceptanceArchive`，服务层的轻量验收门无法端到端触发（仍会 `close-report-missing`）。需要桌面窗口角色在 B31 内扩展该函数：A12b 最后报告为 blocked 且 outcome=accepted 时仍按既有报告/criteria 路径生成归档证据（`archiveAcceptance`，`staffDecision=note`）并返回 artifacts+acceptanceArchive。本任务未改 `app/desktop/**`。
- note 只要求非空字符串（trim 非空）；具体文案（`acceptanceIntensity=lightweight；运行期未验证（静态证据接受）`）由 chief v2 约束，应用不解析、不做语义校验，避免把文案耦合进服务层。
- 轻量验收只限 A12b；A12a/A2 等阶段即使同时提供 note+归档也被拒绝（测试覆盖）。
