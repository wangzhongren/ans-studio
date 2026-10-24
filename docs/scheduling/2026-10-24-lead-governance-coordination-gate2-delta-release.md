# 闸门 2 delta：显式发布验收动作（P0-1 同批）

- 日期：2026-10-24
- 客户授权原话：「允许新增显式发布验收动作（新卡片/命令/trigger，走闸门 2 delta），P0-1 同批。」
- 状态：**方向已授权；本 delta 选定最小实现，进入 S2–S6；不新增角色/工具/能力位**。
- 关联：团队计划 v1（504 行，SHA-256 `70cd5536…`）§2.4/§九.5 的停止项已由客户解除；P0-2 仍另做。

## 1. 选定的最小 trigger

在 flow YAML 顶层新增可选布尔字段：

```yaml
release: true   # 仅发布验收；缺省/false = 非发布
```

- **谁设置**：Steward/统筹在 change-package 完成后，用既有 `request_confirmation(cardKind=schedule-write)` 写一份只把 `release` 从缺省/false 改为 `true`、其余步骤/字段逐字不变的 flow YAML；客户/判断 agent 按既有审批卡确认（审批卡，不是新增卡种）。**只有 release 标记写卡受 release-only 限制；release 缺省的普通 flow 扩展/修正写卡保持原校验与收卡行为。**
- **谁读**：应用 `dispatchAcceptanceForFlow` / verifier criteria 自动派发入口只在 `flow.release === true` 时启动 verifier/Proof；非发布在 change-package 后停止为 `awaiting-release-acceptance`，不派 Proof、不写 acceptance-criteria、不标 acceptance done。
- **为什么选它**：不新增 card kind/command/UI/工具/能力位；复用现有 schedule-write 卡、flow parser/serializer、auto-Proof 入口；改动集中在编排 flow schema + 桌面 check + Steward 卡提示 + 测试。
- **不做**：不新增独立发布卡片/命令/按钮；不让主理直接派 Proof；不自动接受验收；不改客户最终决定权；不把非发布流程标成发布。

## 2. 写集增量（现有角色，无新增角色/边界）

- 编排：`src/common/编排/flow-state.ts`（`FlowState.release?: boolean`、parse/serialize/校验）、`src/common/编排/flow-service.ts`（**仅当写卡带 release true 或现有 release true 时**启用 release-only 校验；release 缺省的普通 flow 写卡按原 parse/扩展校验不变）、必要时 `src/pipeline/orchestration/run-role.ts`（只做 flow 卡校验接线，不加工具）、`src/pipeline/orchestration/govern-session.ts`（Steward 发布标记提示）、`governance-gate.ts`（P0-3/P1-4/coordinate）；测试 `test/编排/{flow-state,flow-service,governance-gate,governance-session}.test.ts` 等。
- 桌面窗口：`app/desktop/interface.ts`（auto-Proof/verifier criteria 前置 `release===true`；非发布停止，不派；不新增 IPC/卡片种类）、`session.ts`/`governance-advance.ts`（内置回交→Lead、worker→Steward、返工→Lead；Proof 状态+指针）、测试。
- 门禁引擎：`governance-roles.ts` Steward/Lead 卡提示（发布才派 Proof；Steward 用既有 schedule-write 标记 release；主理只协调）+ 测试。
- 测试：e2e 非发布不派/发布标记才派；P0-1/P0-3/P1-4 同批。
- **不新增**：卡片种类、命令、按钮、UI、i18n、工具、能力位、flow step kind、账本 kind/field、角色/边界。

## 3. 门禁/边界

- 闸门 2 delta 只确认“新增 flow 顶层 release trigger + 复用现有 schedule-write 卡”与写集增量；**不等于实施授权**（实施授权已由客户前一条 S1–S6 给出，且本条明确 P0-1 同批）。
- 发布标记写入仍需客户/判断 agent 的 schedule-write 审批；主理不能代批/代写；Proof 仍独立。
- 若 S2 发现必须新增卡种/命令/UI/工具/字段（除 release 外）或改角色边界，停止并重开闸门 2 delta，不默认扩权。

## 4. 测试口径

- 非发布 flow（release 缺省/false）：change-package done 后 `dispatchAcceptanceForFlow` 不派 verifier/Proof、不写 acceptance-criteria、不标 acceptance done；flow 显示等待发布。
- 发布标记：只允许 release false/缺省→true 的 schedule-write；**release 缺省的普通 flow 扩展/修正写卡仍按原校验通过（不被 release-only 误拒）**；release true→false、或带其它字段/步骤变化拒绝；release true 后下一次 settle 才派 Proof/标准。
- 既有 auto-Proof 锁定测试更新为“非发布不派/发布标记才派”，不放松断言。
- P0-3/P1-4 同批测试；T3 全量/Electron/目标只读。
