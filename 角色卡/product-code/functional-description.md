# product-code 实际职责、交接与代码位置

product-code 是开发侧 worker 角色，维护产品内置 product 角色的代码模块
`src/common/roles/product/`。本角色**没有直接负责的用户可操作业务功能**：产出是纯 TypeScript 数据与
纯策略函数，由 Service（`src/service/version-change/`、`src/service/trunk/`）、编排与桌面窗口在 E2
切换后消费，经消费方进入用户流程。

## 职责

- product 角色卡文本与 Section 1 数据（`card.text/entries/preauthorizedDirs/forbiddenWritePaths`）、
  `capabilities`、`cards`（无治理卡）。
- `tools()`：product 的角色专属额外注入工具声明（仅 `submitVersionChange`；trio）。
- `dispatch()`：product 相关的派发硬身份/存在性判定与报告期望（R-2）。
- `preflight`：`version-upgrade`（VCA 提交）的角色侧前置策略。
- `context()`：产品上下文与报告期望静态提示块。

## 不进入本模块

VCA Service 事务（结构/引用/路径/hash/权限/base 校验、快照/冻结/apply）、trunk apply、账本、会话装配、
客户卡渲染、桌面路由。这些留在现有 owner。

## 交接输入/输出

| 方向 | 内容 |
| --- | --- |
| 输入 | E0.3 冻结契约；`src/model/role.ts` 的 `BuiltInRoleModule` 类型；只读 oracle（旧 `governance-roles.ts`/`run-role.ts`/`version-change`/`trunk`）；Host 已核验的普通事实（preflight/dispatch） |
| 输出 | `productRoleModule`（唯一 public entry）；`api-spec.md` 登记的 fact 键/错误码/messageKey；单测 + 差分 fixture + 证据 |
| 消费者 | Service（VCA/trunk）、编排、桌面窗口、门禁引擎门面（E2 装配） |
| 上游派发 | 统筹调度（Scheduler）；报告回 Scheduler，不直接面向客户 |

## 代码与文档位置

| 内容 | 路径 |
| --- | --- |
| 模块 public entry | `src/common/roles/product/index.ts` |
| 卡/能力 | `src/common/roles/product/internal/card.ts`、`internal/capabilities.ts` |
| 策略 | `src/common/roles/product/internal/{tools,dispatch,preflight,context}.ts` |
| 测试 + 差分夹具 | `test/roles/product/` |
| public API 报告 | `api-spec.md`（本目录） |
| 变更证据 | `docs/change/2026-11-07_E1_product-module-evidence.md` |
| 功能导航 | `feature-map.md`（本目录） |

## 边界与纪律摘要

写集仅 `src/common/roles/product/`、`test/roles/product/`、`角色卡/product-code/**`（不含卡/边界/YAML/
changelog）。模块唯一 public entry `index.ts`；只依赖 Model + shared public entry；零跨角色 import；
纯数据/纯函数（无 I/O/账本/会话/时钟/随机数/可变状态）；缺事实 fail-closed；不携带权限。完整白名单见
[boundary.md](boundary.md) Section 1。
