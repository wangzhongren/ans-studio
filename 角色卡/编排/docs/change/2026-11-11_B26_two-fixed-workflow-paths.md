# W：B26 fixed A11 受派任务写集（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B26——RR23 失败修复（A11 受派任务写集为空，worker 全部写入被拒）。
- 依据：RR23 记录 `角色卡/测试/docs/change/2026-11-11_RR23_two-fixed-workflow-paths.md`（`f3746be4222f79b9cf5bb1b72419ec1a0f3feed362e4550636f5255543d9f3ba`）；协调方 B26 授权与 RR24 预算批准。
- 基线：HEAD `f4e6a97`（RR23 记录提交）。

## 一、RR23 失败事实（根因）

- A1–A10 与 A12a 完成（B25 后 `complete_team_plan` 回执正常）；A11 派发 7 个模块任务 + 探针，`moduleId`/`modulePaths` 均已由应用派生（如 `assets/`、`src/game-state.js`）。
- 但 8 次写入全部被写门禁拒绝：`Target is outside the actual assigned task's frozen module/current authorization intersection`，allowed paths `project:（无）`/`skill:（无）`；A11 `stage.blocked task-report-blocked` 6 分钟未恢复 ⇒ `gate:blocked-unrecovered`。
- 代码根因：`src/pipeline/orchestration/run-role.ts` 的 `refreshAssignedTaskScope` 对所有非内置受派任务初始化 `assignedTaskWritePaths=[]`，并用 **legacy trunk** `prepareAssignedTaskWriteScope`（`src/service/trunk/impl/apply-journal.ts:2631`）填充；该函数要求 `task.created.runId`（无 runId 直接 invalid），fixed 任务必然失败 ⇒ 写集永远为空，写门禁拒绝一切路径。此前各轮 A11 未真正写入，故未暴露。

## 二、实施

### 2.1 `src/pipeline/orchestration/run-role.ts`（M）

`refreshAssignedTaskScope` 增加 fixed 分支：

- `task.created.workflowId` 存在（fixed 任务）⇒ **不调用 legacy trunk**；
- `task.created.to` 必须等于当前会话角色，否则写集为空（fail-closed）；
- `modulePaths` 缺失/为空 ⇒ 保持现状（空集，不扩权）；
- 写集 = `modulePaths` ∩ `resolveTaskGitScope(...).scope.paths`（团队计划 roleRows 同一权威）：文件精确、目录前缀（双向包含取较窄者），去重排序后写入 `assignedTaskWritePaths`；
- 无 `workflowId` 的 legacy 任务仍走原 trunk `prepareAssignedTaskWriteScope` 路径，逐字不变。

### 2.2 `test/编排/run-role-fixed-b26.test.ts`（新）

真实受派任务 + workflow.started + basis.recorded（modules/roster/teamPlan 字节 hash）夹具，捕获会话写门禁断言：

1. 目录模块 `src/core/`：模块内 `src/core/main.js` 允许；同 scope 的模块外 `assets/note.txt` 拒绝；
2. 文件模块 `index.html`：精确文件允许；非本任务模块拒绝；
3. 无 `modulePaths` 的 fixed 任务 ⇒ 拒绝（不扩权）；
4. `task.to` 与当前角色不一致 ⇒ 拒绝；
5. 无 `workflowId` 的 legacy 形状（带 runId/runState）仍走 legacy trunk（不启用 fixed 分支）⇒ 拒绝。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b26-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（B26 新测、run-role-task-git、run-role-fixed b2/b31/b121、workflow-fixed-b131、桌面 fixed-path-routing、b51；8 文件） | **72/72 pass** | `_evidence/b26-02-affected.tap`（`65c626c6…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b26-03-full-chain.tap`（`84d04c49…`） |
| 全量 `test/编排/*.test.ts` | **1346 pass / 24 fail / 2 skip**（1372 tests）；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b26-04-orchestration-suite.tap`（`195f8243…`）、`b26-05-known-red-failnames.txt`（`f9513fb0…`）、`b26-06-known-red-diff.txt`（`e3b0c442…`，空） |

## 四、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/pipeline/orchestration/run-role.ts` | M | 308,455 / 4,750 | `366e548a988a37dbf3803e907dcde0eb68681e3afbd6977773e603c081baea7b` | +23/−0 |
| `test/编排/run-role-fixed-b26.test.ts` | 新 | 14,101 / 348 | `4f38dfc8e88da33218cbcc0279df379a20ade53c91ba8e1b7f615c89ea39b19a` | 新 |

## 五、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR24 行使。
- fixed 任务写集只由 `modulePaths` ∩ 团队计划角色写集派生；不改服务层、schema、legacy trunk 或角色边界判定。无 modulePaths 的 fixed 任务保持空集（不扩权）。
- 夹具的模块 category 采用 core/ui（避免 `envBootstrap.omitted=true` 时不得含 env/entry 模块的名单规则），不影响被测写集逻辑。
