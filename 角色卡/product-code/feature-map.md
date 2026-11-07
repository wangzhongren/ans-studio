# product-code 功能导航

**本角色没有直接负责的用户可操作业务功能。** product-code 维护的是产品内置 product 角色的模块数据与
纯策略（卡/边界数据、工具与派发策略、version-upgrade 提交前置、产品上下文/报告期望），由 Service、
编排与桌面窗口消费后才进入用户流程，不单独构成系统特性。

| 关注点 | 位置 |
| --- | --- |
| 实际职责、交接与代码位置 | [functional-description.md](functional-description.md) |
| 模块 public API（数据/工具/派发/preflight/context） | [api-spec.md](api-spec.md) |
| E1 交付证据（差分/测试/哈希/遗留） | [docs/change/2026-11-07_E1_product-module-evidence.md](docs/change/2026-11-07_E1_product-module-evidence.md) |
| 模块代码 | `src/common/roles/product/`（唯一 entry `index.ts`） |
| 模块测试与差分夹具 | `test/roles/product/` |
| 续接线索 | [memo.md](memo.md) |

消费方视角的功能说明（VCA/trunk、派发与报告、上下文装配）由对应角色与功能文档维护，本角色不复制。
