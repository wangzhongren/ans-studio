# 变更记录：entry-role-minimal 批次 A（测试）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 基线：main `8fc673e`；候选：`feat/entry-role-minimal`（`f4aa073a` + rework）。
- 改动：A 写集测试重写（`test/门禁引擎/{governance-trio,list-project,liaison-role}.test.ts`、`test/桌面UI/{role-view,judge,i18n-b1-b2}.test.ts`、`test/项目管理/shared/i18n.test.ts`、`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`、`test/测试/t9-block1-bootstrap.test.ts`、`test/桌面应用/genesis-bootstrap.test.ts`）；按 amendment-1 对断言旧角色集的既有测试做最小断言同步（门禁引擎 7 文件、liaison-verify 组、governance-e2e-auto 7 文件、c-migration）。逐文件断言数前后对照见 change-package §3.3。
- 验证（最终候选）：全量 `node --test --test-concurrency=1`（排除 write-sequencing）tests 4499 / pass 4465 / fail 15 / skip 19；15 红 = S1 基线 9 symlink + 6 断言既红；无新增确定性失败/新增 skip；`liaison-role.test.ts` 断言 93→95（test() 9→13，覆盖未弱化）。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；`git revert` A 批提交。
