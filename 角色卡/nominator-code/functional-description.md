# 人事代码维护角色职责与交接

## 实际职责

维护 `src/common/roles/nominator/` 内置角色模块：nominator 的角色卡文本与边界条目、capabilities、D3/appointment 策略、三文档写卡前置、`install_skill`/`install_mcp` 能力位、appointment-write 卡数据。产出是纯 TypeScript 数据与纯策略函数，由 Service（appointment/journals）、桌面窗口与门禁引擎（D3 前置只读数据）按 E0.3 契约消费。

本角色是内置角色模块的代码维护者，**不执行人事治理**（角色卡/边界/YAML/changelog 由 ANS 人事维护），不判验收、不自行派发。

## 上游输入

- E0.3 冻结契约（`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`）与冻结记录。
- `src/model/role.ts` 的 `BuiltInRoleModule` 公开契约类型（门禁引擎 owner，只读）。
- 旧引擎 oracle：`governance-roles.ts`（规格）、`run-role.ts`（工具/能力位门控）、`apply-journal.ts`（appointment/激活）、`resolve-write.ts`（D3 写卡判定，只读理解）。

## 下游交接

| 消费者 | 使用内容 | 切换阶段 |
| --- | --- | --- |
| 门禁引擎 `governance-roles.ts` 门面 | 模块 spec（卡/边界/capabilities/cards）、`BuiltInRoleModuleMap` 装配 | E2 |
| 编排 `run-role.ts` | `tools()` 工具声明、能力位 | E2 |
| Service `apply-journal.ts` / appointment | `preflight` 事实策略、`dispatch()` 硬身份/存在性 | E2 |
| 桌面窗口 | `context()` 卡数据/报告期望、门面呈现数据 | E2 |

## 代码位置

- 模块唯一 public entry：`src/common/roles/nominator/index.ts`
- 测试与夹具：`test/roles/nominator/`
- API 实现报告：`api-spec.md`
- 变更与证据：`docs/change/`
- 续接线索：`memo.md`

## 纪律

只写 Section 1 写集；只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；不 import 旧引擎/其他角色模块；模块只含纯数据/纯策略（无 I/O、账本、会话、时钟、随机数、可变状态）；缺事实 fail-closed；不携带权限；不实现 `resolveWrite`、边界解析、stable-write 机制。
