# 变更记录：entry-role-minimal 批次 C（桌面窗口）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：`app/desktop/session.ts`（申请生命周期/系统通知/删除决定卡镜像/重启 orphaned+expired/appointment-write D3 校验/任务升级卡应用直达与 continue·redispatch·replace 人工处置）、`app/desktop/interface.ts`（requirement_change taskId/role-card 必需章节单一来源）、`app/desktop/requirement-change.ts`（taskId 归属键）、`app/desktop/governance-advance.ts`（镜像判据恒 false）。
- 内容：`request.created/presented/resolved/notified/orphaned` 与 `approval.created/resolved/expired` 写 `.ans/state/tasks.jsonl`；申请卡在来源角色通道同步呈现（不等待落盘，保留 D1 signal 身份），幕僚只收系统通知；应用自有 decision 升级卡 `application:true`/`sourceRoleId:"application"`，不借 convener/rapporteur 槽位；appointment-write 新路径校验 D3 `request.resolved` 的 `decisionId/targetRoleIds/intentId|taskId`、目标非内置、路径全在 `角色卡/<targetRoleId>/`；重启幂等标记并通知发起角色。
- 验证：全量 4569/4535/15/19；桌面应用 803/803；C 专项 63/63；Electron 17/17 `E2E_PASS=true`（报告 sha256 `c978ab038b9287ae844000964c30807fd8b812b512f11ac9baf6ee300b1df4b0`）。
- 边界：未改渲染层；旧 flow appointment-write 路径逐字保留（D 收敛）；未新增 IPC 白名单/渲染依赖。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
