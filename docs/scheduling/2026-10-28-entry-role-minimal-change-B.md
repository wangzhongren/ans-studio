# entry-role-minimal 批次 B：任务/汇报主干与最小状态（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：**B（任务/汇报主干与最小状态）**｜档位：T3
- 候选分支：`feat/entry-role-minimal`；B 批基线：`778a7f2`（A 批收口 + Delta-1 边界前置 `c64fe98`）；本批提交：`e5a533d6afca53c2dcf032011ef6735b00bd8402`。
- 隔离：实施 worktree `.claude/worktrees/entry-role-minimal`；不 push、不合并 main。
- 依据：团队计划 §3.3/§3.4/§3.5/§4.2、验收标准 v1.1 B-01–B-12、方案 v9.2 §3.3/§3.4/§3.6/§7/§8.5。
- Delta-1：人事已把本批 10 个桌面测试文件精确补入 `角色卡/桌面窗口/boundary.{md,yaml}` + changelog（提交 `c64fe98`）；本批未新增名单外桌面测试。

## 1. 批次目标与生效口径

B 批把任务/汇报主链切到应用独占的最小状态，同时保留旧 gate/flow 代码到 D：

- **新增** `.ans/state/tasks.jsonl`（app-only、append-only、每行一个事件）与每角色 `.ans/state/logs/<roleId>.jsonl`。
- **幕僚（chief）**新增 `dispatch_task`（可派任意内置/项目 worker）、`role_status`、`session_tail`、`role_activity_log`、`terminate_role_run`、`redispatch_task`。
- **convener** 的旧 `dispatch_task`/`role_status`/`session_tail`/`propose_recovery` 保留到 D，仍走旧 flow 派发门；不获得 `role_activity_log`/终止/重派。
- 新任务/汇报链不写 `docs/flows/*.yaml`、不写 `.ans/governance/ledger.jsonl`；旧 flow 派发/回交路径逐字保留。
- 报告路由过渡：**已登记在 `tasks.jsonl` 的 taskId** 的工作结果只回 chief（`[工作结果]`）；旧 flow/无任务关联回交仍回原主人（trio=convener、single=su），避免旧 e2e 在 B 批被打红。D 随旧机器删除统一。
- 内置角色作为 worker 时，仍沿用既有 `suppressHandback`（其收尾经旧治理反馈汇到主入口）；项目 worker 的 `submit_report` 已带 `taskId` 并回 chief。此过渡在 D 统一。

## 2. B 快照（双列：chief 目标能力 B 生效 / convener 旧能力 D 移除）

| 能力/写区 | chief（B 生效） | convener（B 过渡；D 移除） | 项目 worker |
| --- | --- | --- | --- |
| `dispatch_task` | 是（任意内置/项目 worker；星形新链，不套旧 flow 门） | 是（旧 dispatch 门；flowId+stepId/账本） | 否 |
| `role_status` / `session_tail` | 是（只读） | 是（旧看护） | 否 |
| `role_activity_log` | 是（只读、脱敏） | **否** | 否 |
| `terminate_role_run` / `redispatch_task` | 是（安全分类） | 否 | 否 |
| `submit_report` | 幕僚自身不注入（既有） | 既有 | 是（报告带 taskId → chief） |
| 写区 | 仍为旧值（目标写区 D 生效） | 仍为旧值（`docs/flows/`、`docs/scheduling/` 等） | 既有边界 |
| 注册表能力矩阵 | **未改**（A 身份层；B 由运行时注入端叠加） | 未改 | — |

说明：A-04a 规定目标写区/convener 去 dispatch 在 D 生效；B 只在运行时注入端叠加 chief 的新增能力，不改 `governance-roles.ts` 的能力矩阵，避免提前改变旧 flow 行为。`src/pipeline/orchestration/run-role.ts` 的 B 改动由团队计划 §3.3 明确授权（“B：新增 chief 的 dispatch/role_status/session_tail（role_activity_log 同批）”）。

## 3. 状态与事件 schema（`.ans/state/tasks.jsonl`）

每行一个 JSON 事件；`v=1`，`at` ISO 8601；坏行读取侧跳过并记错误，不阻塞启动。

| 事件 | 必填字段 | 说明 |
| --- | --- | --- |
| `task.created` | `v, at, taskId, from:"chief", to, text, sideEffect, idempotencyKey` | 可选 `flowId`、`expectedOutput`、`requestedEvidence`；`sideEffect` ∈ read-only/docs/code/external/destructive/unknown |
| `task.delivered` | `v, at, taskId, to` | 送达（会话 `send` 成功）后写；可选 `sessionId` |
| `task.reported` | `v, at, taskId, from, status(done/blocked/failed), summary(≤200)` | 可选 `evidence`（≤5）、`turnId`；按 `taskId+turnId` 去重 |
| `task.closed` | `v, at, taskId, by:"chief", outcome(accepted/rework/rejected)` | 可选 `note`；已收口不重写 |
| `task.redispatch` | `v, at, taskId(new), retryOf, to, reason:"stuck", safety(safe/unsafe/needs-review)` | 先写 redispatch 再写新 created；重放兼容两者顺序 |
| `delegation.changed` | 可选：`v, at, roleId` | 本批只定义形状，不改变权限 |

- 路径：`.ans/state/tasks.jsonl`；轮转默认 5 MB、保留 3 份（`ANS_TASKS_MAX_BYTES`/`ANS_TASKS_ROTATIONS`）；读取按 `.N`（旧）→当前（新）。
- `sideEffect`：幕僚声明，应用按任务文本**只升不降**；缺填/非法 ⇒ `unknown`；仅 `read-only|docs|code` 且无部分写入可自动重派。
- 幂等：显式 `idempotencyKey` 优先；缺省 `sha256(from\0to\0text)`；同键且未 closed ⇒ 不重复派发；closed 后允许返工再派。重派沿用原键、新 taskId + `retryOf`。

## 4. 每角色运行日志（`.ans/state/logs/<roleId>.jsonl`）

- 字段白名单：`v, at, roleId, taskId?, turnId?, kind, tool?, summary≤200, status?, ref?`。
- 写入点（应用观察器，不依赖角色上报）：轮次开始/结束、消息摘要、工具调用/结果、任务/投递状态、错误、终止/重派、巡检。
- 脱敏：密钥/令牌/`.env` 值/`Authorization` 等替换 `[redacted]`；项目根前缀剥离为项目相对路径，项目外绝对路径替换 `[absolute-path]`；摘要压平单行≤200 字；不写完整 prompt/完整命令参数。
- 轮转/保留：默认 5 MB、3 份、30 天（`ANS_ROLE_LOG_MAX_BYTES`/`ANS_ROLE_LOG_ROTATIONS`/`ANS_ROLE_LOG_RETENTION_DAYS`）；轮转时清理超期 `.N`。
- 读取：只经 `role_activity_log({roleId, since?, limit?})`（缺省 50、上限 200）与 `role_status`（lastActivityAt/最近动作）；角色不可直接读文件。

## 5. 星形派发 / 汇报 / 巡检 / 终止重派

### 5.1 星形派发
- 幕僚 `dispatch_task`：目标须在本项目角色表（含内置，但不得是幕僚自身）；不套旧 flow 派发门；写 `task.created` 成功后入既有投递机（自动开会话/排队/失败保留/重启续投）。
- 投递文本由 `renderDispatchPrompt` 单一来源生成，并附 `任务编号 #<taskId>`、`期望产出`、`可选证据`；回交意图 `handback.taskId` 由投递机携带。
- 目标已有活会话 ⇒ 按目标真实 runtime 投递（不让幕僚引擎选择串到目标）。
- 受理回执明确「受理 ≠ 完成」；状态写入失败 ⇒ **不投递**并如实失败。

### 5.2 汇报
- 项目 worker `submit_report` → 编排 `handback`（含 taskId）→ 桌面 `handleHandback`：
  - `taskId` 已在内存索引（派发/恢复/列表登记）⇒ 目标 chief，投递 `renderWorkReportPrompt`（`[工作结果]`：任务/来源/状态 done|blocked|failed/摘要≤200/证据≤5）。
  - 写 `task.reported`（`taskId+turnId` 去重）；摘要≤200、证据≤5。
  - 旧 flow/无任务关联回交保持 `renderHandbackPrompt` 与原主人路由。
- 幕僚可通过 `closeTask`（Interface）/任务卡动作写 `task.closed`。

### 5.3 10 分钟巡检（复用 watchdog tick）
- 参数（env 可调）：`PATROL_INTERVAL_MS=600000`、`PATROL_PENDING_MAX=1`、`LOG_SLOW_SILENCE_MS=300000`、`LOG_STUCK_SILENCE_MS=600000`、`LOG_HARD_CAP_MS=1800000`、`LOG_REDISPATCH_MAX=2`、`LOG_COOLDOWN_MS=600000`。
- 复用现有 30s watchdog tick，**不新增第二个 `setInterval`**；首 tick 只登记基准；只对 busy 且有活动任务的内置角色发 `[系统·巡检]`；waiting/闲置不判卡死。
- `patrolPending` 最多 1；未结算跳过并记 `patrol.skipped`，连续 2 次跳过发一条系统行；幕僚 settled 后清零。
- 巡检只汇总事实（在岗/taskId/最后日志/最近动作/静默/状态），不弹假卡、不构成授权/验收结论。

### 5.4 日志静默 / 终止 / 重派
- 30s tick 评估 `log-silence`：slow≥5min 只提醒；stuck≥10min / hard-cap≥30min 告警。默认只告警，仅 `ANS_LOG_AUTO_TERMINATE=auto-terminate` 显式启用时看护回调终止。
- `terminate_role_run`：停止当前轮次 + 后台任务子进程树（force），等待退出；回执如实给 `childProcesses/childProcessesStopped/terminationConfirmed/partialArtifacts`；未确认 ⇒ 不自动重派。
- `redispatch_task`：按 `evaluateRedispatchSafety`——`external|destructive|unknown`、终止未确认、已发生外部副作用 ⇒ `unsafe`（0 次自动重派）；未完成工具/部分写入/已有完成报告 ⇒ `needs-review`；仅 `safe` 产生新任务（新 taskId + retryOf + 同 idempotencyKey，原任务 closed/rework）。同链最多 2 次重派（`ANS_LOG_REDISPATCH_MAX`），第 3 次升级，不自动重派。
- 终止/重派/巡检判定均写角色日志；`role.terminated{childProcesses, exit, signal}` 以摘要形式记录（不含命令原文）。

### 5.5 重启恢复
- 重放 `tasks.jsonl`：未投递的 `created` 任务按同 taskId/去重键重新入队；已投递/已报告未收口只展示（不重复执行）；closed 不重投；坏行跳过。
- `delivery-queue.json` 续投与 `.ans/sessions/` 恢复沿用既有路径；报告按 `taskId+turnId` 去重；写失败只诊断、保留重试，不伪造成功。
- `listProject`（导入/刷新）触发一次 `restoreTasks`（幂等、fire-and-forget），与既有投递队列恢复同属启动时机。

## 6. 改动文件与统计

见 `git show --stat e5a533d6afca53c2dcf032011ef6735b00bd8402`；按 owner 分组：

| owner | 文件 | 说明 |
| --- | --- | --- |
| 编排 | `src/common/编排/task-state.ts`（新增）、`role-log.ts`（新增）、`handback.ts`、`watchdog.ts`；`test/编排/task-state.test.ts`（新增）、`dispatch-reads.test.ts` | 事件/日志模块、`[工作结果]`、`log-silence`/巡检/重派安全纯函数；B 专项测试 |
| 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`schema.ts`；`run-role.ts`（B 注入端，§3.3 授权） | 任务/日志/终止/重派类型与工具；`role_activity_log`/`terminate_role_run`/`redispatch_task`；chief 运行时能力叠加 |
| 桌面窗口 | `app/desktop/session.ts`、`interface.ts`、`watchdog.ts`、`governance-advance.ts`；5 个既有测试 B 段 + 10 个 Delta-1 新测试 | 星形路由/回交/状态持久化/恢复/日志观察器/巡检/终止重派/任务卡 |
| 项目管理 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | `ui.task.*`/`ui.workReport.*`/`ui.roleLog.*` 与巡检文案；key 计数 1431（ui 825/main 541） |
| 验证/证据 | 本文件、8 份属主 change 记录、命令日志/哈希 | 见 §9/§10 |

> 注：`src/service/runtime/session.ts` 无需改动——`RuntimeSessionOptions extends GovernedToolsOptions` 自动透传新能力字段；工具装配仍在 `buildGovernedTools`（项目约定：运行时核心不新增 `src/provider/runtime/` 文件，Delta-4）。

## 7. 测试差异表

| 文件 | 类型 | 覆盖 | 断言/说明 |
| --- | --- | --- | --- |
| `test/编排/task-state.test.ts` | 新增 | 事件追加/重放/坏行/轮转/幂等/副作用/重派链/任务卡 | 7 tests；见文件 |
| `test/编排/dispatch-reads.test.ts` | 重写（B 段追加） | 任务编号/期望产出/证据 hint；契约缺失仍拒投 | 19 tests（原 17 + B 2） |
| `test/桌面应用/task-restart.test.ts` | 新增（Delta-1） | 重启恢复/未投递重投/已投递不重投/坏行/收口 | 2 tests |
| `test/桌面应用/star-routing.test.ts` | 新增（Delta-1） | chief→项目/内置、自身拒绝、幂等、convener 旧门保留 | 3 tests |
| `test/桌面应用/chief-workflow.test.ts` | 新增（Delta-1） | chief 六能力/convener 旧三能力/项目零注入/日志数据面/工具注册 | 3 tests |
| `test/桌面应用/role-log.test.ts` | 新增（Delta-1） | 脱敏/白名单/轮转/读取/观察器 | 5 tests |
| `test/桌面应用/log-patrol.test.ts` | 新增（Delta-1） | 首 tick 基准/10min/空项目/pending/跳过/settled 清零/无假卡 | 4 tests |
| `test/桌面应用/log-stuck.test.ts` | 新增（Delta-1） | 阈值/slow/stuck/auto-terminate/正确等待 | 4 tests |
| `test/桌面应用/stuck-redispatch.test.ts` | 新增（Delta-1） | safe 重派/unsafe/needs-review/上限 | 4 tests |
| `test/桌面应用/stuck-redispatch-safety.test.ts` | 新增（Delta-1） | 安全分类/升类 | 5 tests |
| `test/桌面应用/log-actions.test.ts` | 新增（Delta-1） | Interface list/log/terminate/redispatch/close 校验 | 1 test |
| `test/桌面应用/watchdog-reuse.test.ts` | 新增（Delta-1） | 单 interval/既有四信号 | 3 tests |
| `test/桌面应用/dispatch-delivery.test.ts` | 重写（B 段） | chief 星形派发/tasks.jsonl/不写旧账本 | +1 test |
| `test/桌面应用/handback-delivery.test.ts` | 重写（B 段） | 星形回交→chief/[工作结果]/task.reported | +1 test（harness getListing 改用 listing.projectRoot） |
| `test/桌面应用/runtime-resolution.test.ts` | 重写（B 段） | 目标活会话 runtime 优先，不串幕僚引擎 | +1 test |
| `test/桌面应用/session.test.ts` | 重写（B 段） | listTasks/restoreTasks/terminate 未开会话如实失败 | +1 test |
| `test/桌面应用/interface.test.ts` | 重写（B 段） | listTasks/readRoleActivityLog/restoreTasks 参数与只读 | +1 test |
| `test/项目管理/shared/i18n.test.ts` | 更新计数 | 1431 keys（ui 825/main 541） | 计数断言 |

**无新增 skip、无删除/弱化测试断言**；旧测试仅 B 段追加，既有断言保留。

## 8. 验证

> 以下为本批出口；命令串行执行（资源纪律）。最终数值见提交前日志。

- 全量：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`
  - 结果：**4548 tests / 4514 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）**
  - 对照基线（A 收口）：4500 tests / 4465 pass / 16 fail / 19 skip；新增测试见 §7。
  - 失败分类：**15 条均为基线既红/环境类**：9 条 Windows symlink EPERM（claude-adapter/session 2、pi-adapter/injected-runtime、runtime-core/session-store 3、runtime-core/file-write-safety D3、编排/shell-authorized-routine、测试/g4-skill-verify/b-render-double-check）+ 6 条稳定基线断言既红（S7-F、T1 pi/codex/claude×3、k-governance-feedback、governance-liaison-verify/e-audit）；acceptance-dispatch 既有环境/时序项本轮通过。**新增确定性失败 = 0**；无新增 skip；未删除/弱化断言。
- 专项：本文件 §7 的 11 个新增 + 5 个 B 段 + i18n，全绿（见 ``%TEMP%\ans-b-special-tests.log`（`8538dfd4…`；403/403）`）。
- 静态：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0。
- 真实 Electron（临时夹具项目）：`ANS_E2E_PROJECT=<tmp fixture>`、`ANS_E2E_OUTDIR=<tmp out>`、`electron.exe test/桌面应用/e2e/main.mjs`；**exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`PROJECT=%TEMP%\ans-e2e-b-fixture-8273`；`ROLE_COUNT=2`；`PRIMARY_ROLE_ID=su`；`BOOTSTRAP_PRIMARY=chief`；`BOOTSTRAP_ROLE_COUNT=6`；17/17 截图（1360x860）；报告 `%TEMP%\ans-e2e-b-out-13865\report.txt`（sha256 `76f9d072fe1d4630dfa24161804734a12cbb19115fa65830fe0fdf19098871a7`）**。
- 结构检查：`git diff --name-only` 落在 §4.2/§3.3 授权写集；无 `package.json`/lock 改动；`rg` 检查新模块无旧 flow/ledger 写入；`.ans/state/**` app-only、未入候选。

## 9. 决策点 / 过渡态说明

1. **报告路由过渡（hybrid）**：B 只为 `tasks.jsonl` 已登记 taskId 的工作结果切 chief；旧 flow/无关联回交保持原主人。理由：B 明确保留旧 gate/flow 到 D，旧 e2e 不应在 B 被打红；D 删除旧机器后统一为“只回 chief”。验收若要求“所有 submit_report 回 chief”，需在 D 前追加一次全量路由切换（会牵动旧 flow e2e）。
2. **内置角色 worker 的汇报**：内置角色仍走既有 `suppressHandback`（收尾经治理反馈到主入口），项目 worker 的新任务报告才走 `[工作结果]`；D 统一。
3. **run-role 的 B 注入端**：团队计划 §3.3 明确 B 在此文件新增 chief 能力；§4.2 文件清单遗漏。本批按 §3.3 执行，未改门禁注册表能力矩阵（A-04a：目标能力 D 生效；B 由运行时叠加）。
4. **终止安全**：`childProcesses` 来自会话句柄的后台任务表；`run_shell` 前台命令由 abort 终止。若运行时不支持 `abort`/任务表，`terminationConfirmed=false`，重派不自动执行（fail-closed）。
5. **巡检首发**：首 tick 只登记基准，首个 10 分钟窗口后才发巡检（避免启动即打扰）；如需启动即巡检，可在 E 调整。
6. **`close_task` 动作**：B 未新增工具名（B-05 工具清单无此项），以 Interface `closeTask`/任务卡动作写 `task.closed`；如验收要求模型工具，可在 C/D 增补。
7. **i18n 计数**：新增 29 个 `ui.*` + 3 个 `main.*`（1431 keys）；无删除旧 key（旧 flow/triage/gate/ledger key 留 D）。

## 10. 证据与回滚

- 本文件行数：`194`；SHA-256：自引用限制——本行占位符替换前字节为 `c0268b7e26d49b0081961af72cd6ec8a2335caf6356509f13410441c3fd75697`（最终以 `git show <证据提交>:docs/scheduling/2026-10-28-entry-role-minimal-change-B.md | sha256sum` 为准；最终报告给出复算值）。
- 全量日志：`%TEMP%\ans-b-final3-tests.log`（sha256 `752d908a22470ec81cf666c37d64729066e1092f4902df050a53e8cebcd72458`）。
- 专项日志：`%TEMP%\ans-b-special-tests.log`（403/403；sha256 `8538dfd4bd9c9000787ff602d3a8eb2a9df6cb22e69076e934bcefc9cbc74396`）。
- Electron 报告：`%TEMP%\ans-e2e-b-out-13865\report.txt`（sha256 `76f9d072fe1d4630dfa24161804734a12cbb19115fa65830fe0fdf19098871a7`）。
- 整树哈希（候选）：`4fdb955b99beca19cbce985d4ff6031eadec6599bcba85759a3ccc3fcab20146`；逐文件哈希：
| --- | --- | --- |
| `app/desktop/governance-advance.ts` | `13a04b9f1580898404b7f9d0e43a0ce4ef8acbde` | `b66dbaea4607d31a132e87e27143ea996820e9a666b6b34840f7ce27f1b44bed` |
| `app/desktop/interface.ts` | `f0afce64a3aee173a8707d54bfcd807d38bbf883` | `0aa38780ccd1ca174879c223f4cd5ac8fe7e4c8848f41db4e3027a24bdcfff6d` |
| `app/desktop/session.ts` | `f97fc8d5f0556d047d9a926b9abf109043cfd6d9` | `5010e5c7954ab2d7b852f14674bf14ccff72ce34899eb56448f143987cfda4c9` |
| `app/desktop/watchdog.ts` | `938e5aff5977f827d3454a138d668a924a3a92eb` | `87fc3892290ae447b3da01d99f61408a6ad731c50a2e7d6552e196e2f5262407` |
| `src/common/shared/i18n/messages/en-US.ts` | `24b6f675da33b1e5ba5294e381a0f1da00f7bb27` | `a6162fa187dec67b306084508a8c8b67205a8228d78044d41047300b9ecaeae3` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `5acb2e793d03b08ef92694c8eaf1871ccc5e3198` | `11cf77f1843b426ed1c8c34557a07b7cda74a5953ee7e5ae6c9b28e3924166bd` |
| `src/common/编排/handback.ts` | `ea7380734b99e9f55fca2bd12ea5ef452b2e2acf` | `54c03e8579e503dc7c0301da6ca850ec6858548c699454e7ad4dc2770af377fc` |
| `src/common/编排/watchdog.ts` | `71c468d47ab7b5fea20b188ea512855e474af5de` | `44c8ac73596403407c803bb3a48d5435b8b010173e93ef7180099bee01363595` |
| `src/model/runtime.ts` | `f7da186775b51f86901ab4431861274c907ae4bd` | `5f827dbc16117ccba208ad69a45e016f27cd0917dd3a1ccbdb0cef35a4ba52a4` |
| `src/pipeline/orchestration/run-role.ts` | `b9d24ff5cd46b7f499f1810596a1907283681e5b` | `fe639aa8c6f8a1557edcf4ec3d7941fb2dcd11f376db6449e8f02cd664e54265` |
| `src/provider/runtime/schema.ts` | `2920e0c203b1b5a5d75e08c3f807bbaad766a86f` | `6aab8b4b810590efcc93f5e9eb925970b5b07de709b908b05dd79026f2ad9d09` |
| `src/provider/runtime/tools.ts` | `9470943b396376bdd4ee4a3422409bd75d9d25a6` | `f8aed5148c8137241ced4792d3bdf4b5d3dd1b3b63b5c973385a991119910623` |
| `test/桌面应用/dispatch-delivery.test.ts` | `65e951b19390fde8a6b9b395782aa1947f577ad5` | `2ec68e8772794341fea9c0c80760431a6e6d7567fa0d75eb25345243e6e489d3` |
| `test/桌面应用/handback-delivery.test.ts` | `9d4ee7e471b68d8c2282502e97d2d10b1175914b` | `02e7d4eaf4a126c047c86a080c513b5ac957280fdfb22f6428ca7fd32b59f163` |
| `test/桌面应用/interface.test.ts` | `8bf1e9858560f932dfb0dcc9f99a75c690db625e` | `dbbec63d8f7d9391871a195839d5c097ada04590209eb152775140390bccea9a` |
| `test/桌面应用/runtime-resolution.test.ts` | `e052eaa9b943fa6ac586e6a589014f8e4f610060` | `c86ca9ee9c855473079573980709159deae0b88f52f07c71ae4f348a51eee9b5` |
| `test/桌面应用/session.test.ts` | `96c368500675006890903f1accebf356222a4ebc` | `03c4e77424dda564ba7395a8e2070108605188befbefbea0816408880a230739` |
| `test/编排/dispatch-reads.test.ts` | `daf3fdf4737a15e10d299d661ca506a3bdda299d` | `a2a2c4b59ad16ce05115c4cba7e4335a95c8cd13254efb01ecc7a6d61e54cc02` |
| `test/项目管理/shared/i18n.test.ts` | `555c1e5e5bc0d420565483da3b8580524c87dbc5` | `906b2fd72e680b5b4f9ce24979c442bcf116b1304e03620e102ccd571c7df578` |
| `src/common/编排/role-log.ts` | `8ce268dbb68ec9c382e805be429cf5518870d7ca` | `b99810dd599263d89c23028cce408bb13a8af611df7ac986c499957d863f2371` |
| `src/common/编排/task-state.ts` | `64ba54401d481f59127d7694723e595452424d79` | `bee30d35cc12e006f5d397136011e0a453f3a6361185f32fc98f0512b8e31485` |
| `test/桌面应用/chief-workflow.test.ts` | `74cf71006468a8078d000f3ac157769b3b5d1881` | `01f47bfae6414b7e353c19f0e8898bf7af80d38211406bfb302dfb1d549b2a20` |
| `test/桌面应用/log-actions.test.ts` | `caeff8b91d77e3ab781958075911a7cb91e25498` | `d0f2f78021f9c58fb9ad1d9403d8f824390fe31eacff3e636ab81ca21f030ade` |
| `test/桌面应用/log-patrol.test.ts` | `116c8331d94b3d97869fd5ca106715c87ca495e8` | `f205eaae856fa94c64caa4d3cb5b48fcd6bcee090e05ec085103cbf9e5d61d42` |
| `test/桌面应用/log-stuck.test.ts` | `6412b0aab23f63bce53b7cae0b9161fc1f8a5a01` | `fafa92738ce1cdfbe8d5852d8a3463e461d3c2a3ef988648a9aef0fe43d6af25` |
| `test/桌面应用/role-log.test.ts` | `c1ca829d12e229a8c9416a20542e4112ebc8a0ef` | `16865f761de62804e0b763e7ed0782b335d1dc27033c2b9fa204956121ed20c3` |
| `test/桌面应用/star-routing.test.ts` | `e05d711ee0bd7c149124ffa214226c8cc4bc865e` | `e37b94d368f641dbb844c0a77aaf704ad7fc98c5ebb57e8c2ad1170dd2f4abac` |
| `test/桌面应用/stuck-redispatch-safety.test.ts` | `fcedd8614243668cbd134d48b4477597ee8528bd` | `b8ddd3dfe2e4578721b472efa8823c876d81eb02a5d0ba243b4a31b40ff92eb0` |
| `test/桌面应用/stuck-redispatch.test.ts` | `b3cd3c332dd15eb835c079f9b8cabd87d6c9b986` | `393765c14970461daa7d5d2b8cc6bb43cafc6ba0b4687dfe4dfddebf096f334c` |
| `test/桌面应用/task-restart.test.ts` | `30bd097549d2d14fd6f7c621a34ccb45d2287f2a` | `2c5e4351bdb810d51ee0f3fed820419da9db21371f4394bffa37731720e0e7d6` |
| `test/桌面应用/watchdog-reuse.test.ts` | `bfd4b0f6073fa8e269b4d268234019400e6aa6c6` | `2d074d0bf796633c2a4ca42370ab82159411b2648981c9721c77fc24f4a255a9` |
| `test/编排/task-state.test.ts` | `3a2d5f944a5d366fb19e5a2e31ac787e19c7f624` | `9dc50a5df9794f3bf56f91b000d284ead1c9f59fec71d3b9acd1ec5d73f77f60` |
- 属主 change 记录：`角色卡/{编排,运行时核心,桌面窗口,桌面UI,项目管理,测试,门禁引擎,独立验收}/docs/change/2026-10-28_change_entry-role-minimal-B.md`。
- 回滚：撤销 B 提交（或恢复文件）并重跑 B 验证；`.ans/state/tasks.jsonl`/logs 可删除（旧系统不读）；无数据/schema 迁移、无遥测。
