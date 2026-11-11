# 桌面窗口 B18 记录：stage-request 收口不要求产物证据（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「桌面窗口」（独立固定上下文；B18 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B18**（RR13 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`7aed5b0`（RR13 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、依据

| 依据 | 路径 | 与 B18 的关系 |
| --- | --- | --- |
| RR13 真机记录 | `角色卡/测试/docs/change/2026-11-11_RR13_two-fixed-workflow-paths.md`（`de046358…`） | A2 stage-request 的 convener 报告 evidence 含描述文本 ⇒ `close_created_task accepted` 反复 `close-report-missing` ⇒ open advance 残留 ⇒ A4 被 `stage-request-open` 拒绝，驱动 12 分钟无进度停止 |
| `workflowService.closeTask` | `src/common/编排/workflow-service.ts` | 对 `taskKind:"stage-request"` 明确跳过阶段完成/证据判定（v1.3 §4.2：阶段请求任务收口不参与阶段完成） |
| 协调方 B18 授权 | 本轮指令 | stage-request 收口不要求产物/分支/归档；生产任务证据要求不变 |

## 二、实施内容

### 2.1 `buildFixedCloseEvidence`（`app/desktop/session.ts`，M）

- 在 `created.workflowId/stage` 检查后新增：`created.taskKind === "stage-request"` ⇒ 直接返回 `{ok:true, evidence:undefined}`。
- 原因：stage-request 只是产线调度请求，accepted 收口只要求 `task.reported(status=done)`；不要求产物证据/分支 tip/验收归档。否则 A2/A5/B1/B3 等阶段的 stage-request 会因报告 evidence 为描述文本而无法收口，open advance 残留导致下一阶段 `stage-request-open` 死锁（RR13）。
- 生产任务（非 stage-request）的 `needsArtifacts`/`close-report-missing` 逻辑未改。

### 2.2 测试（`test/桌面应用/b101-fixed-dispatch-task-binding.test.ts`，M）

- 新增 B18 test：
  - A2 stage-request（`taskKind:"stage-request"`）的 done 报告 evidence 为描述文本 ⇒ `close_created_task accepted` 成功、`stageCompleted=false`、无 `stage.completed A2`；
  - 同阶段生产任务（convener→product，非 stage-request）同样描述 evidence ⇒ 仍 `close-report-missing`（生产证据门不放松）。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b18-01-typecheck.txt`（`22d52cc9…`） |
| 桌面 fixed 定向 11 文件（含 b101 新 test） | **90/90 pass** | `_evidence/b18-02-desktop-fixed.tap`（`3cef0717…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b18-03-full-chain.tap`（`6fe39b07…`） |
| 全量 `test/编排/*.test.ts` | **540s 超时（suite=124，partial TAP）**，未形成完整 24 known-red 对照；B18 仅改 `app/desktop/session.ts`（编排代码/编排测试未变），B17 提交时全量结果为 1364 tests / 1338 pass / 24 known-red 逐名一致；本批受影响桌面集 90/90、全链 3/3 | `_evidence/b18-04-orchestration-suite.tap`（partial）、`b18-04-suite-exit.txt`、`b18-04-known-red-failnames.txt`（partial） |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 863,030 / 13,408 | `b5a2423fb57bb913ca0c43704527d734900fac9bb576b72c6501c32fa8c12048` | +6/−0 |
| `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts` | M | 44,547 / 792 | `c68cf1461ae477d5fc1086cefe0b5450dfba718da38b86b43d2a5dfeddb3321d` | +58/−1 |

- legacy/fixed 生产任务证据逻辑未改；写集外改动=0。

## 五、限制与披露

- 本批只改 fixed stage-request 收口证据层与测试；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR14。
- stage-request 的 accepted 仍要求真实 done 报告（`closeTask` 校验）；只是不要求产物证据/分支 tip/归档。生产任务描述 evidence 仍 fail-closed。
