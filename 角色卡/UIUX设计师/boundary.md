# UI/UX 设计师边界

## Section 1: 可修改文件与目录

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 单文件 | `角色卡/UIUX设计师/feature-map.md` | 设计交付导航与只读参考入口 |
| 单文件 | `角色卡/UIUX设计师/memo.md` | 本角色的事实与续接线索 |
| 单文件 | `角色卡/UIUX设计师/changelog.md` | 本角色的交付与变更记录 |
| 单文件 | `角色卡/UIUX设计师/functional-description.md` | 本角色职责、设计产物与协作说明 |
| 单文件 | `角色卡/UIUX设计师/api-spec.md` | 设计交付约定与实现交接说明 |
| 目录 | `角色卡/UIUX设计师/docs/design/` | 桌面布局、交互方案、设计规范及可检查的 HTML 原型和素材 |
| 目录 | `角色卡/UIUX设计师/docs/change/` | 本角色设计产物的修改记录 |
| 目录 | `角色卡/UIUX设计师/docs/fix/` | 本角色设计产物的问题与修复记录 |

本表与运行时读取的 `boundary.yaml` 条目一一对应；它们表达同一个 Section 1，不能合并产生额外权限。未列路径默认只读。`role-card.md`、`boundary.md`、`boundary.yaml` 仅由 ANS Governance 维护；设计师不能修改。本边界不授予 `app/`、`src/`、`test/`、构建/权限配置、其他角色文件、仓库根 `docs/` 或临时目录写权。新增范围、变更归属或增删逐条文件必须交 Governance 处理并取得客户授权。
