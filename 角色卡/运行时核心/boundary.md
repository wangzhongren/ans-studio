# 运行时核心边界

## Section 1：写入白名单

本节为本角色写入授权来源；[boundary.yaml](boundary.yaml) 是供现有产品解析器读取的同步副本，保留既有 `role/entries/kind/path/purpose` 格式。二者必须一致，出现差异先交 ANS Team Formation 修正，不以任一副本自行扩权。

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/model/runtime.ts` | 中立运行时类型与能力契约 |
| 单文件 | `src/service/runtime/session.ts` | 运行时选择、公共工具装配与提供方接入入口 |
| 单文件 | `src/provider/runtime/tools.ts` | 公共受治理工具执行 |
| 单文件 | `src/provider/runtime/schema.ts` | 公共工具 schema 与描述 |
| 单文件 | `src/provider/runtime/session-store.ts` | ANS 会话索引与统一回放持久化 |
| 目录 | `src/common/runtime-core/` | 本角色私有辅助实现 |
| 目录 | `test/runtime-core/` | 本角色单元测试与契约夹具 |
| 单文件 | `角色卡/运行时核心/feature-map.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/memo.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/functional-description.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/运行时核心/api-spec.md` | 本角色实现与功能资料 |
| 目录 | `角色卡/运行时核心/docs/design/` | 本角色design记录 |
| 目录 | `角色卡/运行时核心/docs/feature/` | 本角色feature记录 |
| 目录 | `角色卡/运行时核心/docs/change/` | 本角色change记录 |
| 目录 | `角色卡/运行时核心/docs/fix/` | 本角色fix记录 |

未列路径默认只读。实际修改还须属于本次已授权的精确任务范围；组别不合并权限。本角色卡、边界、同步 YAML 与根 `changelog.md` 由 ANS Team Formation 维护，不属于运行时核心执行写权。其他角色文件、项目权限配置及调度状态只读；实现历史写入自身 `docs/change/` 或 `docs/fix/`。
