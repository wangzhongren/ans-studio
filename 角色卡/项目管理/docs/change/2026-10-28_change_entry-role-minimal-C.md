# 变更记录：entry-role-minimal 批次 C（项目管理）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`（16 个 `ui.request.*`/`ui.judge.directRequest*` key）、`test/项目管理/shared/i18n.test.ts`（ui 841 / total 1447 / ui-5 836）。
- 内容：申请/来源/提交/呈现/裁决/系统通知/orphaned/expired/应用发起/appointment-write 审批，以及「申请直达、幕僚只收通知不代答/不代决」提示；未删除旧 flow/gate/ledger key（D 批）。
- 验证：i18n 测试 65/65；全量 4569/4535/15/19；typecheck 0。
- 边界：未改项目规则/架构文档（D/F 批）；未改其他 key 文案/计数语义。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
