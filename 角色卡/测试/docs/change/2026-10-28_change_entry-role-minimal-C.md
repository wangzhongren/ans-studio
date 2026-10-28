# 变更记录：entry-role-minimal 批次 C（测试）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 新增测试：`test/桌面应用/application-line.test.ts`（2）、`decision-service.test.ts`（4）、`pending-card-restart.test.ts`（1）、`write-safety.test.ts`（5）、`test/门禁引擎/shell-approval.test.ts`（2）；`stuck-redispatch.test.ts` 增 3 条 decision 开关开/关与人工处置。合计 +17 tests。
- 修改测试：`operator-wiring`（镜像删除）、`governance-flow-metadata`（schema 枚举/六角色文案）、`request-choice-decision-card`、`request-requirement-change-tool`、`tools`、`编排/decision-card`、`编排/governance-judge`、`d-audit-ledger`、`项目管理/shared/i18n`、`claude-adapter/session`（Delta-3 fixture）。
- 内容：覆盖来源=发起角色、应用呈现/裁决、通知去重、申请/审批事件、D3/appointment-write 负例（缺 decision/错配/内置/越界/结构不合格）、重启 orphaned/expired 幂等、通用 write schema 删除、decision 开关真实 channel 开/关、continue/redispatch/replace 人工处置。
- 验证：全量 `4569 tests / 4535 pass / 15 fail / 19 skip`（B 基线 4552/4518/15/19；fail 全部为基线既红 9 symlink + 6 稳定断言；新增确定性失败 0、无新 skip）；C 专项 63/63；桌面应用 803/803。
- 边界：未删除/弱化既有断言；未新增 skip；`write-sequencing.test.ts` 与 B 基线同口径排除（既有挂起项）。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
