# 变更记录：entry-role-minimal 批次 A（桌面窗口）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 基线：main `8fc673e`；候选：`feat/entry-role-minimal`（`f4aa073a` + rework）。
- 改动文件：`app/desktop/session.ts`；`app/desktop/project.ts`（旧 liaison 别名登记 `builtInRoles` 的只读兼容 shim，amendment-2 待落盘授权）。
- 内容：主入口/协调者按角色列表解析（`governanceFunction==="chief"` 优先、旧 `liaison` 回退）；`canLiaise` 接受 chief；旧 liaison 会话按注册表只读别名合成展示条目开会话（不进入列表/不新增状态）；旧 coordinate 门沿用旧 liaison 字面值。
- 验证：真实 Electron 临时夹具 `E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`BOOTSTRAP_PRIMARY=chief`（17 截图；报告 `%TEMP%\ans-e2e-fixture-out-bWJT\report.txt`）；桌面/旧会话测试通过（除 S1 基线既红）。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；`git revert` A 批提交。
