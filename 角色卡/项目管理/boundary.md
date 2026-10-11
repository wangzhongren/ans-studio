# 项目管理边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录（私有） | `src/common/shared/` | 跨角色共享组件 |
| 目录（测试） | `test/项目管理/shared/` | 共享组件的单元测试与夹具 |
| 单文件 | `角色卡/项目管理/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/项目管理/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/项目管理/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/项目管理/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/项目管理/api-spec.md` | 共享组件实现报告 |
| 单文件 | `角色卡/项目管理/docs/architecture.md` | 整体架构与角色协作 |
| 目录 | `角色卡/项目管理/docs/architecture/` | 架构细分文档，含 `shared-components.md` |
| 单文件 | `角色卡/项目管理/docs/project-rules.md` | 全项目唯一工程法案 |
| 目录 | `角色卡/项目管理/docs/meetings/` | 会议纪要 |
| 目录 | `角色卡/项目管理/docs/design/` | 设计记录与跨角色对接设计 |
| 目录 | `角色卡/项目管理/docs/change/` | 变更记录 |
| 目录 | `角色卡/项目管理/docs/fix/` | 修复记录 |
| 目录 | `docs/scheduling/` | 任务调度记录（内容由 task_ops 写入） |

未列路径默认只读。本边界不授权修改本角色卡、边界、其他角色资料、其他角色业务代码、层契约源码、构建配置或权限配置。新增目录、改动归属或增删逐条列出的路径，须先由 ANS Governance 更新 Section 1 并经客户确认。
