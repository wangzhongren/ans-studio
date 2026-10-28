# 变更记录：entry-role-minimal 批次 B（独立验收）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`；B 基线 `778a7f2`。
- 改动：**无产品代码**；本记录登记 B 批验收证据口径：B-01 基线/Delta-1、B-02 写集、B-03 tasks.jsonl、B-04 日志、B-05 星形、B-06 巡检、B-07/08 终止重派安全、B-09 重启、B-10 UI 中间形态、B-11 测试、B-12 证据/回滚。
- 验证：全量 `4552 tests / 4518 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`；专项 11 新增 + 5 B 段；typecheck/typecheck:renderer/build:renderer；真实 Electron `exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`PROJECT=%TEMP%\ans-e2e-b-rework-fixture-30598`；`ROLE_COUNT=2`；`PRIMARY_ROLE_ID=su`；`BOOTSTRAP_PRIMARY=chief`；`BOOTSTRAP_ROLE_COUNT=6`；17/17 截图（1360x860）；报告 `%TEMP%\ans-e2e-b-rework-out-21763\report.txt`（sha256 `ef9ff6160dd51ad712693e83c90782c90d649409ba5e3450c57f7c534df2e4b1`）`；无新增确定性失败/无新增 skip。
- 边界：未派 worker、未自验产品断言保绿；独立验收报告由验收角色另行落盘。
- 证据：change-B §7–§10；回滚=撤销 B 提交并重跑 B 验证。

- B-07/B-08 返工（2026-10-28）：提交 `f151a86529b7e947465ab3112f7196442edf92c1`；fresh 会话/自动换人/decision 升级卡/共享 episode、exit-signal/staging 隔离/in-flight needs-review；全量 4552/4518/15/19、专项 407/407、Electron 17/17。逐文件与属主记录哈希见 change-B §10（41 文件表；worktree sha256 + git blob 双口径）。
