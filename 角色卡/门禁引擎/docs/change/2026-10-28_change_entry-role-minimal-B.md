# 变更记录：entry-role-minimal 批次 B（门禁引擎）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`。
- 改动：**无门禁引擎产品代码**（本批 B 写集不含 `src/common/门禁引擎/**`）。B 快照记录：chief 目标能力（dispatch 任意内置/项目、role_status、session_tail、role_activity_log、terminate/redispatch）由运行时注入端生效；convener 旧 dispatch/roleStatus/sessionTail/proposeRecovery 保留至 D；`governance-roles.ts` 能力矩阵未改（A-04a：目标写区/convener 去 dispatch D 生效）。
- 验证：注册表功能由 `test/桌面应用/chief-workflow.test.ts` 经 `openRoleSession` 能力面断言（chief 六能力、convener 无 role_activity_log/终止/重派、项目零注入）；旧 `test/门禁引擎/*` 未改、全量 `4552 tests / 4518 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`。
- 边界：未提前改目标写区/`forbiddenWritePaths`/旧门行为；旧 gate/flow 保留到 D。
- 证据/回滚：change-B §2；撤销 B 提交（本角色零产品代码）。

- B-07/B-08 返工（2026-10-28）：提交 `f151a86529b7e947465ab3112f7196442edf92c1`；fresh 会话/自动换人/decision 升级卡/共享 episode、exit-signal/staging 隔离/in-flight needs-review；全量 4552/4518/15/19、专项 407/407、Electron 17/17。逐文件与属主记录哈希见 change-B §10（41 文件表；worktree sha256 + git blob 双口径）。
