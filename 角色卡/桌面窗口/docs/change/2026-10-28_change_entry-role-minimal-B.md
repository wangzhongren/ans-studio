# 变更记录：entry-role-minimal 批次 B（桌面窗口）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`；B 基线 `778a7f2`；Delta-1 测试文件已由人事在 `c64fe98` 补入边界。
- 改动文件：`app/desktop/session.ts`（星形派发/回交、tasks.jsonl 持久化/恢复、日志观察器、终止/重派、任务卡、目标 runtime）；`app/desktop/interface.ts`（listTasks/restoreTasks/readRoleActivityLog/terminateRoleRun/redispatchTask/closeTask）；`app/desktop/watchdog.ts`（log-silence/10min 巡检/终止回调、复用 tick）；`app/desktop/governance-advance.ts`（任务卡/工作结果文案 helper）。
- 测试：新增 Delta-1 精确名单 10 个（task-restart/star-routing/chief-workflow/role-log/log-patrol/log-stuck/stuck-redispatch/stuck-redispatch-safety/log-actions/watchdog-reuse）；重写 dispatch-delivery/handback-delivery/runtime-resolution/session/interface 的 B 段。
- 内容：chief 可派任意内置/项目 worker（自身拒绝）；新任务报告只回 chief（已登记 taskId）；旧 flow 回交路由保留；巡检复用 30s tick、pending≤1；终止失败/未确认不自动重派；external/destructive/unknown 0 次自动重派；`[工作结果]`/任务卡固定字段；无假卡。
- 验证：桌面 B 专项全绿；真实 Electron `exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`PROJECT=%TEMP%\ans-e2e-b-fixture-8273`；`ROLE_COUNT=2`；`PRIMARY_ROLE_ID=su`；`BOOTSTRAP_PRIMARY=chief`；`BOOTSTRAP_ROLE_COUNT=6`；17/17 截图（1360x860）；报告 `%TEMP%\ans-e2e-b-out-13865\report.txt`（sha256 `76f9d072fe1d4630dfa24161804734a12cbb19115fa65830fe0fdf19098871a7`）`；typecheck/build/全量见 change-B §8（`4548 tests / 4514 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`）。
- 边界：未改 renderer/main/preload；未新增名单外 `test/桌面应用/` 文件；未改 `.ans` 之外的项目文件；`package.json`/lock 零改动。
- 证据/回滚：change-B；撤销本批提交并重跑 B 验证。
