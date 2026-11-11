# 运行时核心边界

## Section 1：写入白名单

本节为本角色写入授权来源；[boundary.yaml](boundary.yaml) 是供现有产品解析器读取的同步副本，保留既有 `role/entries/kind/path/purpose` 格式。二者必须一致，出现差异先交 ANS Team Formation 修正，不以任一副本自行扩权。

<!-- Delta-B2930-2（2026-11-11，客户 B29/B30 授权）：B30 只读 Git `[user]` 白名单——本表补登 1 个实现单文件与 2 个精确测试文件（src/provider/trunk/impl/git-command.ts、test/编排/git-command.test.ts、test/编排/readonly-git-transport.test.ts），逐文件授权，无目录级授权。 -->

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/model/runtime.ts` | 中立运行时类型与能力契约 |
| 单文件 | `src/model/project-state.ts` | 全局任务状态/版本决策的共享 Model 类型（`ProjectStateView`/`VersionDecisionCard`/`VersionDecisionRequest/Result`；无 I/O） |
| 单文件 | `src/model/directive-marker.ts` | 客户指令标记纯解析器（零依赖，主进程与渲染侧共享） |
| 单文件 | `src/model/directive.ts` | 客户指令事件/视图/高危谓词共享 Model 类型 |
| 单文件 | `src/model/download.ts` | 下载申请/结果/错误码/判断事实共享 Model 类型与常量；无 I/O |
| 单文件 | `src/model/trunk.ts` | trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1 的共享类型/常量/状态枚举/错误码；无 I/O |
| 单文件 | `src/model/version-change.ts` | VCA/doc-freeze/refactor-request 共享类型/状态/错误码；无 I/O |
| 单文件 | `src/service/runtime/session.ts` | 运行时选择、公共工具装配与提供方接入入口 |
| 单文件 | `src/provider/runtime/tools.ts` | 公共受治理工具执行 |
| 单文件 | `src/provider/runtime/schema.ts` | 公共工具 schema 与描述 |
| 单文件 | `src/provider/runtime/session-store.ts` | ANS 会话索引与统一回放持久化 |
| 目录 | `src/common/runtime-core/` | 本角色私有辅助实现 |
| 目录 | `test/runtime-core/` | 本角色单元测试与契约夹具 |
| 单文件 | `src/provider/trunk/impl/git-command.ts` | 只读 Git 配置/命令解析与白名单（B30） |
| 单文件 | `test/编排/git-command.test.ts` | git-command 配置白名单/安全拒绝测试（B30） |
| 单文件 | `test/编排/readonly-git-transport.test.ts` | 只读 Git 传输/执行测试（B30） |
| 单文件 | `角色卡/运行时核心/feature-map.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/memo.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/functional-description.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/api-spec.md` | 本角色实现与功能资料 |
| 目录 | `角色卡/运行时核心/docs/design/` | 本角色design记录 |
| 目录 | `角色卡/运行时核心/docs/feature/` | 本角色feature记录 |
| 目录 | `角色卡/运行时核心/docs/change/` | 本角色change记录 |
| 目录 | `角色卡/运行时核心/docs/fix/` | 本角色fix记录 |

未列路径默认只读。实际修改还须属于本次已授权的精确任务范围；组别不合并权限。本角色卡、边界、同步 YAML 与根 `changelog.md` 由 ANS Team Formation 维护，不属于运行时核心执行写权。其他角色文件、项目权限配置及调度状态只读；实现历史写入自身 `docs/change/` 或 `docs/fix/`。
