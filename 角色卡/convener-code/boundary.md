# 运营代码维护角色边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录（角色模块） | `src/common/roles/convener/` | convener 角色模块（唯一 public entry `index.ts`；模块内可增删/拆分内部文件，模块根不得散放其他文件） |
| 目录（测试） | `test/roles/convener/` | 本角色模块的单元测试与夹具（不做跨角色集成） |
| 单文件 | `角色卡/convener-code/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/convener-code/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/convener-code/functional-description.md` | 实际职责、交接与代码位置 |
| 单文件 | `角色卡/convener-code/api-spec.md` | 模块 public API 实现报告 |
| 目录 | `角色卡/convener-code/docs/design/` | 设计记录 |
| 目录 | `角色卡/convener-code/docs/feature/` | 稳定功能说明与流程图 |
| 目录 | `角色卡/convener-code/docs/change/` | 变更记录与证据 |
| 目录 | `角色卡/convener-code/docs/fix/` | 修复记录 |

模块纪律：`src/common/roles/convener/` 唯一 public entry 为 `index.ts`，模块根不得散放其他文件；模块内可增删/拆分内部文件，不需逐次改边界。只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；不得 import `src/common/门禁引擎/`（私有 common）、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、门控模块或其他角色模块；角色模块之间零 import。模块只含纯 TypeScript 数据与纯策略函数：无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；缺事实默认拒绝（fail-closed）；不携带权限（引擎执行全部安全边界）。Git 执行/ACL/证据闭包、Service 事务与桌面路由不进入本模块。

未列路径默认只读。超出上述路径的业务源码须先由 ANS 人事（People Operations）更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
