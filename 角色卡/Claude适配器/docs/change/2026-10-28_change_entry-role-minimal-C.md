# 变更记录：entry-role-minimal 批次 C（Claude适配器）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`test/claude-adapter/session.test.ts`（Delta-3：judge 回调夹具 `cardKind` 由 `write` 改为 `appointment-write`）。
- 内容：仅测试夹具调整，确保通用 write 卡删除后 Claude 适配器的治理 judge 原始回调用例仍覆盖 approval 组；适配器生产代码未改。
- 验证：`test/claude-adapter/session.test.ts` 在本批全量中通过（该文件既有 2 条 Windows symlink 基线失败与 B 相同）；全量 4569/4535/15/19。
- 边界：未改 `src/provider/claude/**`；未改 Pi/Codex 适配器。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
