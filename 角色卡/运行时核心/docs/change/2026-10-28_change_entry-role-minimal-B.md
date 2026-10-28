# 变更记录：entry-role-minimal 批次 B（运行时核心）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`；B 基线 `778a7f2`。
- 改动文件：`src/model/runtime.ts`（TaskStateEvent/RoleLogEntry/TaskSideEffect、role_activity_log/terminate_role_run/redispatch_task 类型与能力位、DispatchTaskPayload 扩展）；`src/provider/runtime/tools.ts`、`schema.ts`（三个新工具与 dispatch 任务卡字段）；`src/pipeline/orchestration/run-role.ts`（B：chief 能力叠加/注入，§3.3 授权）。
- 内容：`submit_report` 保持不变；`dispatch_task` 新增 sideEffect/expectedOutput/requestedEvidence/idempotencyKey；`role_activity_log`/`terminate_role_run`/`redispatch_task` 均「注入才注册」；终止未确认/重派非 safe 一律 `ok:false`，不假装成功；未新增 `src/provider/runtime/` 文件（Delta-4）。
- 验证：typecheck exit 0；`test/runtime-core/tools.test.ts` 16/16；B 专项见 change-B §7/§8；全量 `4552 tests / 4518 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`。
- 边界：未改适配器/`session-store.ts`/`package.json`；未改门禁注册表能力矩阵（A-04a：D 生效；B 由 run-role 叠加）。
- 证据/回滚：change-B；撤销本批提交并重跑 B 验证。

- B-07/B-08 返工（2026-10-28）：提交 `f151a86529b7e947465ab3112f7196442edf92c1`；fresh 会话/自动换人/decision 升级卡/共享 episode、exit-signal/staging 隔离/in-flight needs-review；全量 4552/4518/15/19、专项 407/407、Electron 17/17。逐文件与属主记录哈希见 change-B §10（41 文件表；worktree sha256 + git blob 双口径）。
