# verifier-code 功能导航

本角色维护 verifier 内置角色模块（`src/common/roles/verifier/`）的数据与纯策略，不单独构成用户可操作功能；经 Service 与桌面窗口的 review/acceptance 路由消费后进入用户流程。

| 功能/契约面 | 代码位置 | 说明 | 消费方 |
| --- | --- | --- | --- |
| 角色卡/边界/capabilities/cards | `src/common/roles/verifier/index.ts`（数据段） | 旧 `governance-roles.ts` 逐字迁移；`cards=["acceptance"]` | 门禁引擎门面（E2 装配）、Service/桌面呈现 |
| tools 策略 | `index.ts::toolsOf` | 空声明（verifier 无额外 `RoleToolId`） | 引擎工具装配（E1 校验口） |
| dispatch 策略 | `index.ts::dispatchOf` | 向 verifier 派发的硬身份/存在性 + 报告期望（R-2） | Service/桌面派发路径（E2） |
| review 前置策略 | `index.ts::reviewFactsDecision` | `reviewTarget`（CID/最终候选）+ `criteria` 形状策略；不做验收判定 | Service/桌面 review 路由（E2） |
| acceptance 卡数据/报告期望 | `index.ts::contextOf`（静态段） | acceptance 卡形状提示、报告路径/证据/回报纪律 | 桌面验收卡呈现、会话上下文装配（E2） |
| 测试/差分 | `test/roles/verifier/` | 单测 + 旧 oracle 差分夹具 | 本角色、测试/独立验收 |
| API 报告/证据 | `角色卡/verifier-code/api-spec.md`、`docs/change/` | public API、事实键、错误码、哈希 | 评审/验收/后续维护者 |
