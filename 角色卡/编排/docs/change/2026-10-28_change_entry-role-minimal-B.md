# 变更记录：entry-role-minimal 批次 B（编排）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B（任务/汇报主干与最小状态）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`；B 基线 `778a7f2`。
- 改动文件：新增 `src/common/编排/task-state.ts`、`src/common/编排/role-log.ts`；修改 `src/common/编排/handback.ts`、`src/common/编排/watchdog.ts`；测试 `test/编排/task-state.test.ts`（新增）、`test/编排/dispatch-reads.test.ts`（B 段）。
- 内容：`tasks.jsonl` 事件/重放/坏行/轮转/幂等/副作用升类；每角色日志脱敏/白名单/轮转/保留；`[工作结果]` 短报；`log-silence`/巡检文案；`evaluateRedispatchSafety` 终止/重派安全判定（仅 safe 自动重派）；旧四信号保留。
- 验证：全量 `4548 tests / 4514 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`；专项 11 个新增 + 5 个 B 段全绿；typecheck/build 见 change-B §8；新增确定性失败 0、无新增 skip。
- 边界：未改门禁注册表/旧 gate/flow/ledger；未新增 `src/provider/runtime/` 文件；B 的 chief 注入端在 `run-role.ts` 由团队计划 §3.3 授权。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-B.md`；撤销本批提交并重跑 B 验证。
