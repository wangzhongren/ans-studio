# 桌面窗口 B31 记录：A12b blocked 轻量验收的桌面归档证据（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「桌面窗口」（roleId: 桌面窗口；独立固定上下文；B31 桌面侧写集）
- 任务：T3「两条固定工作流路径」**B31**（RR26 端到端缺口：A12b blocked 报告在真实桌面链路上不生成
  `acceptanceArchive`，服务层轻量验收门无法触发，仍 `close-report-missing`）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`9cce927`（B30 runtime-core 提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未 commit / 未 push / 未合并 / 未发布**；未运行
  Electron、未占用 CDP 9224；未改 `src/common/编排/**`、`src/provider/**`、`src/pipeline/**`、
  `src/model/**`、`src/common/门禁引擎/**`、其他角色记录。

## 一、事实（RR26 接缝 + 服务层既定门）

1. 编排角色在 `src/common/编排/workflow-service.ts` 的 `closeTask` 已实现 **A12b 轻量验收门**（并行
   工作树改动，本角色未触碰）：仅当 `created.stage === "A12b"` ∧ `outcome === "accepted"` ∧
   `evidence.acceptanceArchive !== undefined` ∧ `note` trim 后非空 ∧ 最后报告 `status === "blocked"` 时，
   允许 blocked 报告收口（写 `task.closed accepted`、`stage.completed A12b` + A12 聚合、`note` 留痕），
   并不再追加 `stage.blocked`；其余情况仍 `close-report-missing` fail-closed。
2. 门禁引擎 chief v2（并行工作树改动，本角色未触碰）已约束：幕僚对 blocked A12b 当回合三选一；轻量
   验收用 `close_created_task` `outcome:"accepted"` + `note` 逐字含
   `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）`。
3. **桌面缺口**：`app/desktop/session.ts` 的 `buildFixedCloseEvidence`（原约 10757 行起）在
   `lastReport?.status !== "done"` 时直接 `return { ok: true, evidence: undefined }`（原约 10780 行）。
   `closeCreatedTaskFixedForSession` 只在 `input.outcome === "accepted"` 时调用该函数，因此 A12b blocked
   报告在真实桌面链路上**不会**生成 `acceptanceArchive`；服务层轻量验收门缺少归档证据，仍判
   `close-report-missing`（端到端不可达）。
4. 约束（客户/调度指令）：最小、fail-closed；**只放宽 A12b blocked + 非空 note**；不解析 note 文案；
   A11/B3 branchTip 逻辑、stage-request 早退、其它阶段路径、legacy（无 workflowId）逐字不变；不伪造
   证据、不跳过归档失败（`acceptance-archive-failed`/`acceptance-record-invalid` 照旧阻塞）。

## 二、实施（`app/desktop/session.ts`，M，+11/−1）

`buildFixedCloseEvidence` 的证据构建前门改为：

```ts
const stage = created.stage;
const lastReport = record.reports[record.reports.length - 1];
// B31：A12b 轻量验收——blocked 报告 + accepted（调用点已保证）+ note 非空 ⇒ 继续构建归档证据。
// 只限 A12b；非 A12b / blocked 无 note / failed / 无报告仍 evidence undefined，由服务层 fail-closed。
const lightweightBlockedA12b = stage === "A12b"
  && lastReport?.status === "blocked"
  && typeof note === "string" && note.trim() !== "";
if (lastReport?.status !== "done" && !lightweightBlockedA12b) {
  return { ok: true, evidence: undefined }; // 服务层按 close-report-missing fail-closed
}
```

- 命中放宽后**完全复用既有 A12b 分支**：从最后报告 `evidence[]` 取 report/criteria 路径（含 B22 质量
  路径回退 `findFixedReviewArtifact`），读真实字节生成 `artifacts`，调用应用
  `archiveAcceptance({ conclusion: lastReport.summary, staffDecision: note, ... })`，返回
  `acceptanceArchive`。归档失败原样返回服务失败码（阻塞 A12），不伪造、不吞错。
- 应用**不解析** note 文案，只要求非空（trim 后）；措辞由 chief v2 约束。
- `stage-request` 早退、A11/B3 `branchTipOid`、`needsArtifacts`、A12a/A12b 归档路径解析、legacy 分支、
  调用点、`verifyFixedReviewCloseBasis` 均未改。

## 三、测试（`test/桌面应用/b3-fixed-baseline-pathb.test.ts`，M，+158/−0；7 → 10 tests）

新增 3 个真实临时 Git 仓库夹具用例（无新增 skip/force-exit）：

1. **B31 正向**：A12b 最后报告 `blocked` + `accepted` + note（逐字含轻量标记）⇒ 桌面证据含
   `acceptanceArchive`（`docs/acceptance/snake-acceptance-v1.md`）；端到端 `close_created_task` accepted
   成功、`stageCompleted=true`；归档含 `staffDecision: <note>` 与 `conclusion: <blocked 报告 summary>`；
   `task.closed accepted` 恰一次、`stage.completed A12b` 恰一次、`stage.completed A12` 聚合恰一次、
   无 `stage.blocked A12b`；投影 A12b/A12 均 completed；不弹客户卡。
2. **blocked 无 note**：桌面证据 `undefined`（直接核对 + 不生成归档文件），服务返回
   `close-report-missing`；不写 `task.closed`、不写阶段事件（A12b 仍 requested）。另核对 note 仅空白
   （trim 后为空）同样不放宽。
3. **非 A12b blocked 不放宽**：A11 blocked 报告 + 非空 note ⇒ 桌面证据仍 `undefined`，服务
   `close-report-missing`，不写 `task.closed`、不生成 `docs/acceptance`。
4. 既有用例回归：done 报告 A12 归档路径（`A12：...`）、归档失败 `acceptance-record-invalid`
   （`A12 归档失败...`）、legacy 回执形状（`B29：legacy...`）均原样通过，证明最小改动未污染。

## 四、验证（D1）

| 范围 | 结果 | 证据（全部位于 `2026-11-11_B31_two-fixed-workflow-paths_evidence/`） |
| --- | --- | --- |
| 基线/环境 | HEAD `9cce927`、`feat/two-fixed-workflow-paths`、node v24.22.1 | `b31-00-baseline-head.txt`（`3aea8661…`） |
| `npm run typecheck` | **exit 0** | `b31-01-typecheck.txt`（`7140caed…`） |
| 受影响集（14 文件：b3-fixed-baseline-pathb + 13 个相关 fixed 桌面/全链套件） | **119/119 pass**（0 fail / 0 skip / 0 cancelled） | `b31-02-affected.tap`（`bcf58384…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `b31-03-full-chain.tap`（`93a6b7a1…`） |
| 桌面既有 known-red（`version-change.test.ts`） | 42 pass / **4 fail（逐名与冻结基线一致，diff 空）**；fixed 域 known-red = 0 | `b31-04-knownred.txt`（`12c55ee1…`） |
| 编排 24 条冻结 known-red | 交叉引用编排 B31 记录（diff 文件 0 字节，逐名一致），桌面侧未重复运行 | `b31-05-orchestration-knownred.txt`（`6cd39e2e…`） |

目标测试计数：`node --test --test-concurrency=1 "test/桌面应用/b3-fixed-baseline-pathb.test.ts"`
= **10/10 pass**（含新增 3 条）；受影响集 **119/119**；全链 **3/3**；typecheck **exit 0**。

## 五、候选（桌面）

| 文件 | 状态 | 字节 / 行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 868,951 / 13,466 | `ad9679c7ff7ceab56fceca862aabf86fbc098e6e428c10bfad8a4381bbe77c7f` | +11/−1 |
| `test/桌面应用/b3-fixed-baseline-pathb.test.ts` | M | 56,595 / 971 | `d1db4025af46ac5d5fe9f9e02dabe95e2ba668fdd90cf306fc5a1a0b4fdc36f9` | +158/−0 |

本记录文件不自嵌自身 SHA-256（由调度提交后按提交物计算）。

## 六、限制与披露

- 只做确定性实现 + 假会话/真实临时 Git 仓库测试；**未运行**真实 Electron/真实模型，不声称 RR27 已
  端到端通过；真实桌面链路效果待下一轮 RR 行使。
- 工作树为混合状态：`src/common/编排/workflow-service.ts`、`chief-workflow-v2.md`、
  `test/编排/acceptance-archive.test.ts`、边界 Delta 为并行角色改动，本角色**未触碰/未还原**；本轮
  桌面测试依赖其已落地实现（服务层轻量验收门 + chief v2 纪律）。
- A12b 轻量验收只放宽 blocked 报告的**收口门**；归档仍要求真实 report/criteria 字节与
  `archiveAcceptance` 成功，任何缺失仍 `acceptance-record-invalid`/`acceptance-archive-failed`
  fail-closed（既有 A12 归档失败用例回归）。
- 未发现新的跨写区需求：桌面侧缺口已在本角色写区内闭合；未修改 `src/**`、未修改门禁引擎流程文档。
- **未 commit**（由调度统一提交）；未 push、未合 main、未打 tag。
