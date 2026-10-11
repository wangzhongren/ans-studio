# 门禁引擎边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/model/boundary.ts` | 边界条目与 Section 1 的共享类型 |
| 单文件 | `src/model/role.ts` | 角色与来源的共享类型 |
| 单文件 | `src/model/decision.ts` | 写入判定结果的共享类型 |
| 单文件 | `src/service/boundary/resolve-boundary.ts` | 双来源边界解析（含项目覆盖） |
| 单文件 | `src/service/role/resolve-role.ts` | 双来源角色解析 |
| 单文件 | `src/service/gate/resolve-write.ts` | 路径判定 |
| 目录（私有） | `src/common/门禁引擎/` | 本角色私有辅助代码 |
| 目录（测试） | `test/门禁引擎/` | 本角色的单元与层契约测试及夹具 |
| 单文件 | `角色卡/门禁引擎/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/门禁引擎/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/门禁引擎/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/门禁引擎/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/门禁引擎/api-spec.md` | 实现报告 |
| 目录 | `角色卡/门禁引擎/docs/design/` | 设计记录 |
| 目录 | `角色卡/门禁引擎/docs/feature/` | 本角色功能的稳定说明与流程图 |
| 目录 | `角色卡/门禁引擎/docs/change/` | 变更记录 |
| 目录 | `角色卡/门禁引擎/docs/fix/` | 修复记录 |

`src/model/` 的这三个文件是跨层共享类型，本角色是唯一主属主；其他角色只读引用。改动它们会使所有引用方的既有证据失效，须先经项目管理角色协调。

未列路径默认只读。超出上述文件的业务源码须先由 ANS Governance 更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
