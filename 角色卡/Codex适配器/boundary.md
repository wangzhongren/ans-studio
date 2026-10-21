# Codex适配器边界

## Section 1：写入白名单

本节为本角色写入授权来源；[boundary.yaml](boundary.yaml) 是供现有产品解析器读取的同步副本，保留既有 `role/entries/kind/path/purpose` 格式。二者必须一致，出现差异先交 ANS Team Formation 修正，不以任一副本自行扩权。

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `src/provider/codex/session.ts` | Codex 运行时公共入口与 SDK 懒加载 |
| 目录 | `src/common/codex-adapter/` | 本角色私有辅助实现 |
| 目录 | `test/codex-adapter/` | 本角色单元测试与契约夹具 |
| 单文件 | `角色卡/Codex适配器/feature-map.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/Codex适配器/memo.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/Codex适配器/functional-description.md` | 本角色实现与功能资料 |
| 单文件 | `角色卡/Codex适配器/api-spec.md` | 本角色实现与功能资料 |
| 目录 | `角色卡/Codex适配器/docs/design/` | 本角色design记录 |
| 目录 | `角色卡/Codex适配器/docs/feature/` | 本角色feature记录 |
| 目录 | `角色卡/Codex适配器/docs/change/` | 本角色change记录 |
| 目录 | `角色卡/Codex适配器/docs/fix/` | 本角色fix记录 |

未列路径默认只读。实际修改还须属于本次已授权的精确任务范围；组别和历史 groupDuty 展示字段不合并权限。本角色卡、边界、同步 YAML 与根 `changelog.md` 由 ANS Team Formation 维护，不属于适配器执行写权。其他角色文件、项目权限配置及调度状态只读；实现历史写入自身 `docs/change/` 或 `docs/fix/`。
