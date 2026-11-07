# 项目管理边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `角色卡/项目管理/feature-map.md` | 功能导航 |
| 单文件 | `角色卡/项目管理/memo.md` | 本角色工作备忘录 |
| 单文件 | `角色卡/项目管理/changelog.md` | 本角色治理变更记录 |
| 单文件 | `角色卡/项目管理/functional-description.md` | 模块笔记与代码位置 |
| 单文件 | `角色卡/项目管理/api-spec.md` | 本角色实现报告（无共享代码后按技能如实说明不适用） |
| 单文件 | `角色卡/项目管理/docs/architecture.md` | 整体架构与角色协作 |
| 目录 | `角色卡/项目管理/docs/architecture/` | 本角色自己的架构细分文档（共享组件目录已按团队计划 §6.4 移交 shared-code；`shared-components.md` 旧副本由本角色在 E1 迁移窗口删除） |
| 单文件 | `角色卡/项目管理/docs/project-rules.md` | 全项目唯一工程法案 |
| 目录 | `角色卡/项目管理/docs/meetings/` | 会议纪要 |
| 目录 | `角色卡/项目管理/docs/design/` | 设计记录与跨角色对接设计 |
| 目录 | `角色卡/项目管理/docs/change/` | 变更记录 |
| 目录 | `角色卡/项目管理/docs/fix/` | 修复记录 |
| 目录 | `docs/scheduling/` | 任务调度记录（内容由 task_ops 写入） |

未列路径默认只读。本边界不授权修改本角色卡、边界、其他角色资料、其他角色业务代码、层契约源码、构建配置或权限配置。共享代码（`src/common/shared/`）及其测试（`test/项目管理/shared/`）、共享组件目录（`角色卡/shared-code/docs/architecture/shared-components.md`）自 2026-11-07 团队计划 §5.4 B-9/§6.4 起由 shared-code 维护，本角色不再拥有。新增目录、改动归属或增删逐条列出的路径，须先由 ANS 人事（People Operations）更新 Section 1 并经客户确认。
