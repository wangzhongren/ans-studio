# 变更记录：entry-role-minimal 批次 B（测试）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：B｜档位：T3
- 候选：`feat/entry-role-minimal`，提交 `e5a533d6afca53c2dcf032011ef6735b00bd8402`。
- 改动：新增 `test/编排/task-state.test.ts` + Delta-1 10 个桌面测试；重写 `test/编排/dispatch-reads.test.ts` 与 `test/桌面应用/{dispatch-delivery,handback-delivery,runtime-resolution,session,interface}.test.ts` 的 B 段；更新 `test/项目管理/shared/i18n.test.ts` 计数。
- 内容：重启恢复、星形路由、chief/convener 能力矩阵、日志格式/脱敏/轮转、巡检 tick/防重入、卡死终止/重派（含副作用安全）、taskId 去重、任务卡/[工作结果] 字段、closeTask。
- 验证：B 专项全绿（见 change-B §7）；全量 `4548 tests / 4514 pass / 15 fail / 19 skip（419 个测试文件；基线 4500/4465/16/19）`；无新增 skip、无删除/弱化断言；测试差异逐文件登记。
- 边界：未改产品源码（测试角色不写产品）；未新增 `test/桌面应用/` 名单外文件；`test/测试/` 未改（旧 e2e 留 D/F）。
- 证据/回滚：change-B §7/§8；撤销本批提交。
