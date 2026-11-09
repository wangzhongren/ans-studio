# W4（W6/T5）：团队计划登记 run 绑定 / baseDigest 合法来源——桌面窗口批次实施记录

- 日期：2026-11-09；角色：ANS 固定 worker「桌面窗口」（独立固定上下文）。
- 变更：**团队计划登记 run 绑定 / baseDigest 合法来源（T2）** 之桌面窗口批次 **W6 + T5**：新增 `SessionManager.completeTeamPlanForHandle`（宿主 run 绑定 + 接线），并在 `test/桌面应用/chief-workflow.test.ts` 按 B1 P-12 新增宿主绑定用例。
- 依据：
  - 团队计划：`docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`（`48148836…`）§三/§四/§五。
  - **B1 v1.2（唯一判据）**：`docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`，**297 行 / 74,210 bytes / SHA-256 `0f528a0b9f80cb9c451985c2a3d37c25a51b7f1959910600ec54a93246303d1b`**；重点 §2.1（W6/T5）、§3.2（AC-6/AC-7）、§4.1（P-12）、§4.3、§7、§9 S2。
  - 方案 P1.1：`docs/planning/2026-11-09_design_team-plan-run-binding.md`（`2bb663fe…`）§2.4、§2.6、§3.1。
  - 复核 R1.1：`docs/planning/2026-11-09_review_team-plan-run-binding.md`（`452f6437…`）§7（S2 闭合）。
  - 边界：`角色卡/桌面窗口/boundary.yaml`（`app/desktop/` 目录、`test/桌面应用/chief-workflow.test.ts` 单文件）。
- 工作目录：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；基线 HEAD **`24799cb61239272e8603018adc094881bb6263dd`**（tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`）；Node **v24.22.1**。W1–W5/T1–T9 在飞文件只读（未修改）。
- 状态：**W6 实施 + T5 用例完成；`npm run typecheck` exit 0；`chief-workflow.test.ts` before 63/47/16/0/0 → after 66/54/12/0/0（新增 3 用例全部通过；无新 skip；环境抖动项经隔离复跑排除）；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223；未验收。**

## 0. 写集与边界

| 文件 | 改动（numstat） | 说明 |
| --- | --- | --- |
| `app/desktop/session.ts` | **+34 / −1** | W6：新增 `completeTeamPlanForHandle`（`:1451-1478`）、`planBinding`（`:3769`）、接线改包装（`:4350-4351`）、handle 绑定（`:4406`） |
| `test/桌面应用/chief-workflow.test.ts` | **+142 / −1** | T5：新增 3 个 P-12 用例 + 夹具（`:2515-2647`）；3 行 import 增补（`−1` 为 `CompleteTeamPlanFn` 类型 import 行改写） |

- **写集外 diff = 0（本批自身）**：`git diff --stat -- app/desktop/customer-input.ts src/common/编排/run-manifest.ts src/common/门禁引擎/classify-shell.ts app/renderer app/desktop/run-manifest.ts` 为空（`writeset-outside-audit.txt`）；未改 `run-manifest.ts`/`classify-shell.ts`/marker、未新增工具/IPC/账本事件/依赖/目录。
- **H1 delta = 0**：未改 `角色卡/**` 的 `role-card.md`/`boundary.md`/`boundary.yaml`/卡文本/roster/派发矩阵；团队计划仍归运营（convener）。
- **在飞文件只读核对**：W1–W5/T1–T9 的 13 个在飞文件哈希/mtime 全部早于本批编辑（`writeset-outside-audit.txt`）；其中 `test/roles/convener/oracle-fixture.ts` = `b7c7f2e8…`、`convener-differential.test.ts` = `f46f7bd3…` 与 B1 §4.3 记录一致。
- 测试文件新增依赖仅：`src/model/trunk.ts`（`TRUNK_MANIFEST_SCHEMA`/`TrunkManifest` 类型）与**只读复用**编排 owner 的共享夹具 `test/编排/fixtures/trunk-project.ts`（`createTrunkProject`/`PATHS`；该文件 diff = 0，不属本批写集）。

## 1. W6 实现（`app/desktop/session.ts`）

### 1.1 `SessionManager.completeTeamPlanForHandle`（`:1451-1478`，模式对齐 `selectRunChangeForHandle`）

校验顺序与码分层（B1 AC-6 / S2）：

1. **当前真实回合未变化**：`entry` 存在、`entry.handle === handle`、`this.sessions.get(key) === entry`、`entry.origins.running === origin`、`entry.busy`、`!origin.settled`、`lifetime`/`turn` 两个 abort signal 未触发；含 `signal?.aborted` 为 false。
2. 无当前回合/无 `origin.taskId`/入口已中止 ⇒ **host-local `plan-task-unavailable`**（status `blocked`；不登记共享稳定码，S2）。
3. 取 `origin.taskId` 调 `inspectAssignedTask({ projectRoot, actorRoleId: "convener", taskId })`（`trunk-runtime.ts:1102-1104` → `apply-journal.ts:2471-2528`）；失败 ⇒ **直通其原码 `trunk-item-invalid`**（code/message 原样，不重写）。
4. `assigned.flowId !== request.flowId` ⇒ **host-local `plan-flow-conflict`**。
5. `request.runId !== undefined && request.runId !== assigned.runId` ⇒ **既有 service 码 `plan-run-conflict`**（模型自报只作断言）。
6. 核验期间回合变化（`!current()` 或 `signal?.aborted`）⇒ **host-local `plan-task-changed`**，不执行、不触达提交。
7. 以 `{ ...request, runId: assigned.runId }` 调 `direct.completeTeamPlan(..., signal)`：**注入值只来自当前受派任务的实际 run**；成功回执经既有 `DirectActionSource.runId` 记录（service 侧 `apply-journal.ts:2932-2934`），`planRef.sha256` 为应用派生值；**marker 不变**（不写 runId）。

失败包装回执形状：`{ ok: false, status: "blocked", operationId, baseDigest: request.baseDigest ?? null, targetDigest: null, errorCode, message }`（与 `run-change-source-*` 主机层先例同构；`isDirectActionReceipt` 形状校验通过）。

### 1.2 接线与 handle 同源

- `planBinding: { handle?: RoleSessionHandle }`（`:3769`）与 `gitBinding`/`dispatchBinding` 同处声明；开会话成功处同一行组定格 `planBinding.handle = handle`（`:4406`，紧邻 `gitBinding.handle = handle`）。
- `:4350-4351`：`completeTeamPlan` 由 `direct.completeTeamPlan` 直通改为包装：`(input, signal) => this.completeTeamPlanForHandle(req.projectRoot, req.runtime, planBinding.handle, input, direct, signal)`；**仅 `req.roleId === "convener"` 注入**（判据未变）。
- 未改 `app/desktop/customer-input.ts`、`run-manifest.ts`、`classify-shell.ts`、marker；host-local 码未在其它位置登记。

## 2. T5 用例（`test/桌面应用/chief-workflow.test.ts`，B1 P-12）

| 用例 | 覆盖 | 关键断言 | 结果 |
| --- | --- | --- | --- |
| W6/T5 团队计划宿主绑定（省略 runId/自报不一致/flow 不符/成功回执） | 真实 busy 受派 convener 回合 + 真实 task 账本/run 记录 + 真实 trunk 服务（有效 manifest/roster/modules/计划）；模型省略 `runId`、自报不同 runId、flow 不符、自报一致 | 省略 ⇒ 登记成功（`status:"applied"`），`source.runId ===` 受派任务 run，`planRef.sha256 ===` 计划实际字节 SHA-256，`baseDigest ===` effective trunk digest；自报不同 ⇒ `plan-run-conflict`；flow 不符 ⇒ `plan-flow-conflict`；自报一致 ⇒ 成功（同计划再登记 `no-op`）且仍记录任务 run | ok |
| W6/T5 宿主绑定拒绝分层 | 无当前回合 / 入口已中止 / 核验期间中止（回合变化）/ 自报不同 runId / `inspectAssignedTask` 失败 | 前两者 ⇒ `plan-task-unavailable`；核验期间中止 ⇒ `plan-task-changed` 且 trunk 不前进（用例内断言 `trunkVersion===1`）；自报不同 ⇒ `plan-run-conflict`；受派 run 记录移除后 inspect 失败 ⇒ 直通 `trunk-item-invalid` | ok |
| W6/T5 普通消息回合无受派任务 | 普通客户消息回合（`origin.taskId` 为空）+ 仅 convener 注入 | ⇒ `plan-task-unavailable`；非 convener（chief）会话 **不注入** `completeTeamPlan` | ok |

- 夹具 `teamPlanHostFixture()`：`createTrunkProject({withRun:false})`（真实文件系统项目/版本化文档）→ 写入规范团队计划（`docs/scheduling/demo-team-v1.md`，`teamPlanSchema:3` 机器 frontmatter）→ `captureSnapshot` + `compareAndSwapManifest` 建立 effective trunk → `compareAndSwapRunRecord`（draft）→ `recordTaskObservation(task.created, chief→convener)`。
- 真实性边界（如实）：**SessionManager 投递机/回合状态（busy、`origins.running`、`assignment` 解析、lifetime/turn abort、handle 绑定）、task 账本、run 记录、trunk 服务/文件存储、convener preflight 与 complete_team_plan 全链均为真实实现**；角色会话句柄为桩（不运行模型、不绑定 SDK）——本批任务明确不运行真实模型/Electron，P-12 的证据对象是宿主绑定而非模型回合。
- `plan-task-changed` 以「核验期间向传入 signal 中止」确定性触发（该分支与 `!current()` 同守则 `!current() || signal?.aborted`；settle 路径共享同一守卫，因句柄为桩未构造真实 settle 翻转——如实披露）。
- **未修改/弱化既有断言**（既有断言 diff 仅 import 行 1 处改写）；未新增 skip/force-exit；新增用例为纯增量（+3）。

## 3. 运行记录（Node v24.22.1；worktree 根；`--test-concurrency=1 --test-reporter=tap`）

### 3.1 计数

| 样本 | tests | pass | fail | cancelled | skipped | todo | exit | duration |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **before**（HEAD 基线；本批 2 文件未改） | 63 | 47 | 16 | 0 | 0 | 0 | 1 | 67,565ms |
| **after**（本批候选） | 66 | 54 | 12 | 0 | 0 | 0 | 1 | 71,886ms |
| 增量 | +3 | +7 | −4 | 0 | 0 | 0 | — | — |

- 命令（before/after 相同）：`node --test --test-concurrency=1 --test-reporter=tap test/桌面应用/chief-workflow.test.ts`（外层 `timeout -k 10 300` 仅作墙钟上限；两次运行均自然退出，未触发上限）。
- before 基线在**本批编辑之前**采集（日志 mtime 19:10:26；本批首个文件编辑 19:12:48、session.ts 编辑 19:14:36），属干净基线。
- **新增 3 用例全部通过**（after 运行 `ok 54/55/56`）；**新 skip = 0**（before/after 均 0）。
- 定向隔离复跑（仅 W6/T5）：**3 tests / 3 pass / 0 fail / 0 skip / exit 0**。

### 3.2 失败标题集合 diff（`failure-set-diff.txt`）

- before 16 条（含子测试）：W5、W10、W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W30、W33、W34、W47 select、W47 revise、`required`、`selected`、`unmanaged`。
- after 12 条：W14、W19、**W20 真实R9竞争**、W22、W23、W28 stop、W28 stop-and-restart、W30、W33、W34、W47 select、W47 revise。
- diff：`−W5 −W10 −required −selected −unmanaged`（转绿），`+W20 真实R9竞争`。**无其它新增标题；新增用例零失败。**
- **W20 环境抖动排除**：after 运行失败原文为 `ENOTEMPTY: directory not empty, rmdir ...ans-w20-product-...`（Windows 临时目录清理竞争；提案卡修复 B1 v1.1 A.2 已记录 W5/W20 ENOTEMPTY 同类已知红）。**同候选隔离复跑 `W20 默认Core` = 2/2 pass、exit 0**（`after-w20-isolated.tap.log`）⇒ 按 BASE-3「环境抖动须同候选隔离复跑通过方可排除」排除，不计新增确定性失败。
- **W5/commit-race 抖动对照**：before 运行 W5 父级已失败（子测试 `selected` 清理 ENOTEMPTY）；after 运行 W5 整体转绿。另在两次中间运行中 `commit-race` 子测试出现过 ENOTEMPTY 失败——以 **A/B 对照**证明与 W6 无关：临时还原 `app/desktop/session.ts` 到 HEAD（`0132cd4e…`）后隔离复跑 `W5 专字段`，`commit-race` **同样失败**（同一 `fs.rm` 清理 ENOTEMPTY；`ab-head-session-w5-isolated.tap.log`），随后恢复候选（`9c690cf3…` 校验一致）。结论：该失败为环境/清理竞争，非本批引入。
- 判定：**新增确定性失败 = 0（W20 经隔离复跑排除）；新 skip = 0；已知红不恶化（同名父级用例仅转绿，除已排除的 W20 抖动）。**

### 3.3 静态门

`npm run typecheck`（`tsc --noEmit`，覆盖 `src,test,app`）：**exit 0**（`after-typecheck.log` / `after-typecheck.exit.txt`；编排批次已清零其机械触点，无写集外错误）。

### 3.4 日志 SHA-256

| 日志 | SHA-256 |
| --- | --- |
| `before-chief-workflow.tap.log` | `d059378a215e29e556084e1c6b6f9ac9102312d88b9254eff61af53bf218c882` |
| `after-chief-workflow.tap.log` | `5c37763b28009f20a481795c1edb247e451844be4c2584b886cc30f01d827e75` |
| `after-w6t5-isolated.tap.log` | `a9fa9e5eddfde24ff3349c9b3fe95b8df0184036a5c91f44e83477d3b6b4037a` |
| `after-w20-isolated.tap.log` | `6d941ee77d056795bc3e6f145a2628ed8c4831932554cdc74b39ddabb512f339` |
| `after-w5-isolated.tap.log`（含本批改动） | `cbd4c78b9be88c3eb5ae481be32ed94e080da273ca9df7abcfae7a6fcd19428c` |
| `ab-head-session-w5-isolated.tap.log`（A/B：HEAD session.ts） | `5c4f9b75f3abe57543d22a31e119eb37a16baad8ca82adc8daceb9a6e33acb82` |
| `after-typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |

## 4. 候选身份（本批 2 文件）

| 文件 | 行数 | raw SHA-256 |
| --- | --- | --- |
| `app/desktop/session.ts` | 11,194 | `9c690cf363d1bc8d15c531cab19238f06d26078bcee0e5c934c170acaf7ec862` |
| `test/桌面应用/chief-workflow.test.ts` | 2,647 | `87983bde4a21387d6b2e1b7a26c430efba73a3ccc92fe01d30cb3182c03ac494` |

- 可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）：**`1db49e20155ab6cb5f78184ee0f35a87c709e9459b1e66143ca41a7cc0d012b9`**。
- numstat：`app/desktop/session.ts` +34/−1；`test/桌面应用/chief-workflow.test.ts` +142/−1（`candidate-numstat.txt`）。
- 完整 diff：`candidate-session.diff` / `candidate-chief-workflow.diff`。
- 稳定性：before/after 证据运行前后候选哈希一致（会话中仅有一次 A/B 临时还原-恢复，恢复后哈希 `9c690cf3…` 校验一致；最终 after 全量运行在恢复前的同一候选内容上进行，两文件哈希与上表一致）。
- 写集外 diff = 0（本批自身；见 §0）。在飞文件属于其它 owner，未修改（哈希/mtime 见 `writeset-outside-audit.txt`）。

## 5. 偏差、限制与如实披露

1. **环境抖动（如实）**：`chief-workflow` 基线本身存在 Windows 临时目录 `ENOTEMPTY` 清理竞争（A.2 已记录 W5/W20/W47 翻转）。本批 before=47/16、after=54/12（含 3 个新增通过用例）；after 的 W20 失败经同候选隔离复跑 2/2通过排除；`commit-race` 以 A/B（HEAD session.ts 同样失败）证明与本批无关。环境计数与 B1 v1.1 A.2 参照（63/47–48/15）存在波动，属既有现象，未修改任何测试求绿。
2. **角色句柄为桩**：P-12 用例驱动真实 SessionManager 投递/回合/账本/trunk 全链，但不运行模型（任务纪律）；`plan-task-changed` 以传入 signal 中止确定性触发（与 `!current()` 同一守卫），真实 settle 翻转路径未构造（如实披露）。
3. **共享夹具只读复用**：`test/编排/fixtures/trunk-project.ts`（编排 owner）仅被 import 读取，未修改（diff=0）；用于构造真实 effective trunk/roster/modules 依据。
4. **host-local 码**：`plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict` 仅在 `session.ts` 使用、未登记为共享稳定码（S2 默认处置）；`plan-run-conflict` 复用 service 既有码；inspect 失败直通 `trunk-item-invalid`。
5. **未覆盖（如实）**：未运行真实模型/Electron、未占用 9222/9223；未运行 `optional-acceptance.test.ts`（写集外、diff=0）；CLI/一次性路径不注入本能力（编制内既有接线保持，见 AC-7 编排侧证据）。
6. **未提交/推送/合并/发布**；未修改角色卡/边界/卡文本；未修改方案/B1/其它角色资料。

## 6. 证据目录

目录：`角色卡/桌面窗口/docs/change/2026-11-09_W4_desktop_team-plan-run-binding-evidence/`（全量哈希见 `evidence-sha256.txt`）。

| 文件 | 内容 |
| --- | --- |
| `baseline-state.txt` | 基线 worktree/分支/HEAD/tree/Node/在飞清单 |
| `before-chief-workflow.tap.log` / `.exit.txt` | before 基线 TAP（63/47/16/0/0，exit 1） |
| `after-chief-workflow.tap.log` / `.exit.txt` | after 候选 TAP（66/54/12/0/0，exit 1） |
| `after-w6t5-isolated.tap.log` | 新增 W6/T5 三用例隔离复跑（3/3 pass，exit 0） |
| `after-w20-isolated.tap.log` | W20 ENOTEMPTY 抖动同候选隔离复跑（2/2 pass，exit 0） |
| `after-w5-isolated.tap.log` / `ab-head-session-w5-isolated.tap.log` | W5/commit-race 抖动 A/B 对照（候选 vs HEAD session.ts，均同因失败） |
| `before-failure-titles.txt` / `after-failure-titles.txt` / `failure-set-diff.txt` | 失败标题集合与 diff |
| `counts-and-notes.txt` | 计数/命令/隔离复跑摘要 |
| `after-typecheck.log` / `.exit.txt` | `npm run typecheck` exit 0 |
| `candidate-sha256.txt` / `candidate-numstat.txt` / `candidate-linecounts.txt` | 候选身份 |
| `candidate-session.diff` / `candidate-chief-workflow.diff` | 两文件完整 diff |
| `writeset-outside-audit.txt` | 写集外审计（排除文件 diff 空；在飞文件哈希/mtime） |
| `evidence-sha256.txt` | 本目录逐文件 SHA-256 |

## 7. 下一步

- 本批交付调度/协调方：候选 2 文件 + 证据；等待其它批次（W1–W5/T1–T9）齐备后由协调方组装最终候选，独立验收按 B1 v1.2 判 B2。
- B2 注意：`chief-workflow` 基线红项按 BASE-3 增量口径与 A.2 环境抖动记录对照；P-12 证据层级为 L5（桌面宿主绑定），不替代 P-1/P-9/P-13 确定性证据或 RR6 真实运行。
