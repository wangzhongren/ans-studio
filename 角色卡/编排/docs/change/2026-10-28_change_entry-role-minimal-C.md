# 变更记录：entry-role-minimal 批次 C（编排）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`src/common/编排/decision-card.ts`（应用自有 decision 卡不扩大角色允许集）、`src/common/编排/task-state.ts`（C-03 request/approval 事件校验/重放跳过）、`src/pipeline/orchestration/run-role.ts`（归属键 flowId|intentId|taskId、appointment-write 预览结构校验、judge 事实来源）。
- 内容：应用 `application:true` 自有 decision 卡通过共享校验；申请事件 schema 与重放；appointment-write 新路径 `targetRoleId+decisionId` + 角色卡目录/必需章节/boundary 顶层 role 校验；judge `facts.appointmentTargetRoleIds` 由应用校验后的 D3 targetRoleId 注入（新路径不再依赖账本 appointment 事实）；旧 flow 路径逐字保留至 D。
- 验证：全量 `4569 tests / 4535 pass / 15 fail / 19 skip`（B 基线 4552/4518/15/19；15 条均为基线既红）；C 专项 63/63；typecheck/typecheck:renderer/build:renderer 均 exit 0；Electron 17/17 `E2E_PASS=true`。
- 边界：未改注册表能力矩阵、未扩大 `DECISION_CARD_ALLOWED_ROLES`、未新增依赖、未 push/main；`task-state.ts` 属 C-03 必需的写集扩展（见 change-C §11）。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
