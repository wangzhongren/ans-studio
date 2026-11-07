# 门控代码维护角色边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录（门控模块） | `src/common/gates/` | 运行时派发/准入判定模块（greenfield；唯一 public entry `index.ts`；内部文件可增删/拆分，模块根不得散放其他文件） |
| 目录（测试） | `test/gates/` | 门测试矩阵、正/负例、与 D-minimal 内联实现的差分，及 `module-graph.test.ts` 静态扫描（用仓内 TypeScript Compiler API，不新增依赖） |
| 单文件 | `角色卡/gates-code/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/gates-code/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/gates-code/functional-description.md` | 实际职责、交接与代码位置 |
| 单文件 | `角色卡/gates-code/api-spec.md` | 模块 public API 实现报告 |
| 目录 | `角色卡/gates-code/docs/design/` | 设计记录 |
| 目录 | `角色卡/gates-code/docs/feature/` | 稳定功能说明与流程图 |
| 目录 | `角色卡/gates-code/docs/change/` | 变更记录与证据 |
| 目录 | `角色卡/gates-code/docs/fix/` | 修复记录 |

模块纪律：`src/common/gates/` 唯一 public entry 为 `index.ts`；只判定、不采集证据；不 import 角色模块、`src/service/`、`src/provider/`、`src/pipeline/` 或 `src/common/门禁引擎/`（私有 common）；不把写路径/边界判定并入。只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；共享不 import 门控（依赖方向 `Model ← shared ← gates ← engines`）。门 API 冻结 `evaluateChiefDispatchParent` 输入/输出与 reason 码；冻结后变更走接口评审。模块只含纯 TypeScript 数据与纯策略函数：无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；缺事实默认拒绝（fail-closed）；不携带权限。

未列路径默认只读。超出上述路径的业务源码须先由 ANS 人事（People Operations）更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
