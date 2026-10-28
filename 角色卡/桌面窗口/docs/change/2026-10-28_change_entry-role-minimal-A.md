# 变更记录：entry-role-minimal 批次 A（桌面窗口；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → 第三轮窄修提交（SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动文件：`app/desktop/session.ts`；`app/desktop/project.ts`（旧 liaison 别名登记 `builtInRoles` 的只读兼容 shim，amendment-2 §2.1 书面授权，已落盘 110 行 / `8d5ddeb5…`；D 批清理）。
- 内容：主入口/协调者按角色列表解析（`governanceFunction==="chief"` 优先、旧 `liaison` 回退）；`canLiaise` 接受 chief；旧 liaison 会话按注册表只读别名合成展示条目开会话（不进入列表/不新增状态）；旧 coordinate 门沿用旧 liaison 字面值。F5：运行期只读别名按 amendment-2 §2.2（不进列表/UI/i18n/能力矩阵）。
- 验证（最终候选）：全量 tests **4499** / pass **4463** / fail **17** / skip **19**（`/tmp/final3-tests.log`，`55efc765…`）；真实 Electron 临时夹具（`%TEMP%\ans-e2e-a2-fixture-P2wK`，仅 `角色卡/桌面窗口/`）→ `%TEMP%\ans-e2e-a2-out-Xoxa\report.txt`（`973c7d70…`）：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`BOOTSTRAP_PRIMARY=chief`、17 截图 1360x860。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；逆序 `git revert` 本批提交。
