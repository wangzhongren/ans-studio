# 策划代码维护角色：功能导航

本角色**没有直接负责的用户可操作业务功能**；维护的是产品内置 rapporteur 角色的模块数据与纯策略，经门禁引擎/编排/Service/桌面消费后进入用户流程。

| 能力 | 说明 | 状态 | 文档 |
| --- | --- | --- | --- |
| rapporteur 规格数据 | 卡文本、Section 1 条目、预授权/禁写、capabilities、cards（旧规格逐字段一致） | E1 已实现并差分（差异 0）；E2 由门禁引擎门面装配 | [api-spec](api-spec.md) §2 |
| 工具声明 | `tools()`：trio 声明 requestRequirementChange / submitVersionChange / selectRunChange；非 trio fail-closed | E1 已实现并差分（差异 0）；实际注入仍由引擎门控 | [api-spec](api-spec.md) §3 |
| 派发判定 | `dispatch()`：R-2 硬身份/存在性；rapporteur 不是可派发来源（恒 deny，无 reportToRoleId） | E1 已实现并差分（allow 位差异 0） | [api-spec](api-spec.md) §4 |
| detail-amendment 整单策略 | 整单提交；禁止提案接受/VCA 批拒/修正案逐项/最终卡/旧批准器 | E1 已实现；E2 Service 接线 | [api-spec](api-spec.md) §5.3 |
| run-change 三模式策略 | continue-frozen / stop-and-restart / stop；绑定事实齐备；停稳证据不进入模块 | E1 已实现；E2 Service 接线 | [api-spec](api-spec.md) §5.4 |
| requirement-change 申请 | 归因键至少一个；changeKind 闭集；申请≠批准；发起方不得自批 | E1 已实现；E2 Service 接线 | [api-spec](api-spec.md) §5.5 |
| 上下文提示块 | 决策上下文 / 报告期望 / decision 卡数据；非 trio 不可用声明 | E1 已实现；E2 编排/桌面消费 | [api-spec](api-spec.md) §6 |

## 代码与测试

- 模块：`src/common/roles/rapporteur/`（唯一 public entry `index.ts`；内部实现 `internal/`）。
- 测试：`test/roles/rapporteur/`（单测 + 差分 fixture + 模块边界/纯度扫描）。
- 变更证据：[docs/change/2026-11-07_E1_rapporteur-module-evidence.md](docs/change/2026-11-07_E1_rapporteur-module-evidence.md)。

## 续接

见 [memo.md](memo.md) 与 [functional-description.md](functional-description.md)。
