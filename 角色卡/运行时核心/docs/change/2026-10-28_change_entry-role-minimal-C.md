# 变更记录：entry-role-minimal 批次 C（运行时核心）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`src/model/runtime.ts`（request.*/approval.* 事件类型、`application/sourceRoleId`、`intentId/taskId/targetRoleId/decisionId` metadata、requirement_change `taskId`）、`src/provider/runtime/tools.ts`（request_confirmation/choice 归属键与 appointment-write 目标字段透传；requirement_change taskId）、`src/provider/runtime/schema.ts`（cardKind 枚举删除 `write`；归属键与 targetRoleId/decisionId 字段；六角色文案）。
- 内容：申请直达发起角色；`approval.created.approvalKind` 仅 shell/appointment-write；`write` 从模型可见 schema 删除（旧 direct/legacy 解析与通道分组保留至 D，见 change-C §11）；工具层不读取/不转发 `application` 标志。
- 验证：全量 4569/4535/15/19；C 专项 63/63；typecheck/typecheck:renderer/build:renderer exit 0；`write-safety` 覆盖 schema 删除与旧调用兼容。
- 边界：未改 `src/service/runtime/session.ts`（本批无需改动）；未新增工具/依赖；`DECISION_CARD_ALLOWED_ROLES` 未扩大。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
