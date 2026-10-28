# 变更记录：entry-role-minimal 批次 C（桌面UI）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `d85031f665657f191af50fb606a2375e2ea1a71c`；B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`。
- 改动文件：**本批无 `app/renderer/**` 改动**。已核对 `operator-view.ts`/`confirm-logic.ts`/`decision-card.ts`/`judge-row-view.ts` 的中间形态：`mirrorRoleId` 缺省路径保持单面呈现，不假定 liaison/幕僚转交；聊天流不再收到可作答卡镜像（镜像已由主进程删除）。
- 内容：申请/审批呈现沿用既有卡片条与 judge 行；独立对话框、待办/历史面板按计划留 E 批。
- 验证：`typecheck:renderer`/`build:renderer` exit 0；全量 4569/4535/15/19；Electron 17/17。
- 边界：未改 renderer/i18n 渲染布局；未新增 IPC/对话框；`ui.request.*`/`ui.judge.directRequest*` 由项目管理属主落 key。
- 证据/回滚：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md`；撤销本批提交并重跑 C 验证。
