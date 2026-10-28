# 变更记录：entry-role-minimal 批次 C（门禁引擎）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`src/common/门禁引擎/governance-roles.ts`（导出 `ROLE_CARD_REQUIRED_SECTIONS` 单一来源；角色卡文本未改能力矩阵）。
- 内容：role-card 必填章节由门禁引擎单一导出，桌面写卡产物校验与编排呈现前预览校验共用；appointment-write 结构校验的 boundary YAML/顶层 role/目标非内置/路径目录由共享解析器与预处理校验承担。
- 验证：`write-safety` 结构负例（必需章节/顶层 role/坏 YAML/越界/内置目标）全过；全量 4569/4535/15/19；typecheck 0。
- 边界：**未改六角色能力矩阵/注册表 entries/预授权/禁写路径**；`DECISION_CARD_ALLOWED_ROLES` 未扩大（协调者放行前置）；`src/model/decision.ts` 未改。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
