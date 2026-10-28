# 变更记录：entry-role-minimal 批次 A（编排）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：A（身份层）｜档位：T3
- 基线：main `8fc673e`；候选：`feat/entry-role-minimal`（`f4aa073a` + rework）。
- 改动文件：`src/pipeline/orchestration/run-role.ts`；`src/pipeline/orchestration/govern-session.ts`（仅 label/discipline/类型 shim，amendment-2 待落盘授权）。
- 内容：六角色 `TRIO_CARD_KINDS`（chief=intent-confirm、product=占位空、其余旧值）；主入口 chief 承接旧 liaison 的 intent-confirm/`hand_off_intent`/旧 coordinate 门（内部仅做旧字面值归一，不改变旧门行为）；旧 ledger `power` 保持 `liaison`（chief）/`project`（product）审计标签；**未新增** chief 的 `role_status`/`session_tail`/星形派发（B），**未移除** convener 旧 dispatch（D）。
- 验证：`npm run typecheck` exit 0；旧 flow/gate/ledger 路径与旧 e2e 保持通过（除 S1 基线既红）；全量计数见 change-package。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-A.md`；`git revert` A 批提交。
