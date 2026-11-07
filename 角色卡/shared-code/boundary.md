# 共享代码维护角色边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录（共享资产） | `src/common/shared/` | 跨角色共享组件（既有模块维护/迁移，不是重写；共享 API 变更须评审记录 + 消费者影响清单 + 测试） |
| 目录（测试） | `test/项目管理/shared/` | 共享组件单元测试与夹具（自项目管理移交；路径保持历史名，改名另立变更） |
| 单文件 | `角色卡/shared-code/docs/architecture/shared-components.md` | 共享组件现行目录（自项目管理迁入，单文件授权；§6.4 迁移在 E1 完成） |
| 单文件 | `角色卡/shared-code/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/shared-code/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/shared-code/functional-description.md` | 实际职责、交接与代码位置 |
| 单文件 | `角色卡/shared-code/api-spec.md` | 模块 public API 实现报告 |
| 目录 | `角色卡/shared-code/docs/design/` | 设计记录 |
| 目录 | `角色卡/shared-code/docs/feature/` | 稳定功能说明与流程图 |
| 目录 | `角色卡/shared-code/docs/change/` | 变更记录与证据 |
| 目录 | `角色卡/shared-code/docs/fix/` | 修复记录 |

模块纪律：`src/common/shared/` 为既有共享资产，本角色维护/迁移，不重写；共享 API 变更须评审记录 + 消费者影响清单 + 测试（无记录不得合并）。`test/项目管理/shared/` 为历史路径名（自项目管理移交；保持路径不变以减少跨角色迁移）。共享组件目录为 `角色卡/shared-code/docs/architecture/shared-components.md`（自项目管理迁入，单文件授权；迁移按团队计划 §6.4 单写者顺序在 E1 完成）。只依赖 `src/model/`；被角色模块、门控模块与引擎消费；不写 `src/common/gates/`、不写任何角色模块；不从引擎复制实现；角色/门控/共享之间按依赖方向 `Model ← shared ← {roles, gates} ← engines`，共享不 import 门/角色。

未列路径默认只读。超出上述路径的业务源码须先由 ANS 人事（People Operations）更新 Section 1 并经客户确认。本边界不授权修改角色卡、边界、其他角色资料或权限配置。
