# 变更记录：entry-role-minimal 批次 B（项目管理）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`。
- 改动文件：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts`。
- 内容：新增 `ui.task.*`（14）、`ui.workReport.*`（7）、`ui.roleLog.*`（8）共 29 个 ui key；`main.watchdog.signal.logSilence`/`patrolSummary`/`patrolSkipped` 3 个 main key；中英文一致、无占位符漂移；key 总数 1431（ui 825/main 541/shared 62/preferences 3）。
- 验证：`test/项目管理/shared/i18n.test.ts` 通过（计数/占位符/英文泄漏/复数/纯度）；全量 `4552 tests / 4518 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`。
- 边界：未改 `project-rules.md`（D 批按 Delta-7 修订）；未删除旧 flow/triage/gate/ledger key。
- 证据/回滚：change-B；撤销本批提交并重跑 i18n 测试。

- B-07/B-08 返工（2026-10-28）：提交 `f151a86529b7e947465ab3112f7196442edf92c1`；fresh 会话/自动换人/decision 升级卡/共享 episode、exit-signal/staging 隔离/in-flight needs-review；全量 4552/4518/15/19、专项 407/407、Electron 17/17。逐文件与属主记录哈希见 change-B §10（41 文件表；worktree sha256 + git blob 双口径）。
