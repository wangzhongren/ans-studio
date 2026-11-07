# 人事代码维护角色功能导航

本角色不直接拥有用户可操作业务功能；维护的是产品内置 nominator 角色的模块数据与纯策略，经 Service（appointment/journal）、桌面窗口与门禁引擎消费后进入用户流程。

| 能力 | 代码位置 | 消费者 | 稳定说明 |
| --- | --- | --- | --- |
| 角色卡/边界/capabilities/cards 数据 | `src/common/roles/nominator/index.ts` | 门禁引擎 `governance-roles.ts` 门面（E2）、桌面、Service | `api-spec.md`「规格数据」 |
| 工具装配策略（`activateRoleDocuments`、install 能力位） | 同上 `tools()` | 编排 `run-role.ts` / 运行时注入层（E2 切换） | `api-spec.md`「tools」 |
| 派发硬身份/存在性 | 同上 `dispatch()` | 引擎硬授权（E2 审查接线） | `api-spec.md`「dispatch」 |
| appointment/D3/三文档写卡前置 | 同上 `preflight.checkAction()` | Service appointment/journal、桌面、门禁引擎（E2 接线） | `api-spec.md`「preflight」 |
| appointment-write 卡数据 / 报告期望 | 同上 `context()` | 桌面窗口、编排上下文装配 | `api-spec.md`「context」 |

旧引擎（E2 前权威 oracle）：`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/service/gate/resolve-write.ts`（只读核对，不 import）。

变更与证据：`docs/change/`；续接线索：`memo.md`。
