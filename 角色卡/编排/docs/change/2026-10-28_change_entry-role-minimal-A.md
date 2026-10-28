# 变更记录：entry-role-minimal 批次 A（编排；第三轮窄修后）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交链 `f4aa073a` → `83f2d2e` → `b6ff8873` → 第三轮窄修提交（SHA 见 `git log -1`）；基线 `8fc673e`。
- 改动文件：`src/pipeline/orchestration/run-role.ts`；`src/pipeline/orchestration/govern-session.ts`（仅 label/discipline/类型 shim，amendment-2 §2.1 书面授权，已落盘 110 行 / `8d5ddeb5…`；D 批清理）。
- 内容：六角色 `TRIO_CARD_KINDS`（chief=intent-confirm、product=空、其余旧值）；主入口 chief 承接旧 liaison 的 intent-confirm/`hand_off_intent`/旧 coordinate 门（内部仅做旧字面值归一，不改变旧门行为）；旧 ledger `power` 保持 `liaison`（chief）/`project`（product）审计标签；**未新增** chief 的 `role_status`/`session_tail`/星形派发（B），**未移除** convener 旧 dispatch（D）；F7：`govern-session` 纪律标注 A 批现状 + B/C/D 生效。
- 验证（最终候选）：全量 tests **4499** / pass **4463** / fail **17** / skip **19**（`/tmp/final3-tests.log`，`55efc765…`；17 = 9 symlink + 6 稳定基线红 + 2 acceptance-dispatch 时序敏感项，见 change-package）；旧 flow/gate/ledger 路径与旧 e2e 保持通过（除基线既红）；typecheck/渲染 typecheck/build exit 0。
- Electron（临时夹具）：`%TEMP%\ans-e2e-a2-out-Xoxa\report.txt`（`973c7d70…`），`E2E_PASS=true`、`BOOTSTRAP_PRIMARY=chief`。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；逆序 `git revert` 本批提交。
