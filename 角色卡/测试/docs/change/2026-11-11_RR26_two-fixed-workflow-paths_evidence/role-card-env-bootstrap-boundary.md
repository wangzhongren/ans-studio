# 边界：env-bootstrap

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| file | `styles.css` | env-resources 模块：纯色几何样式与布局（不含规则逻辑） |
| file | `index.html` | entry-index 模块：单页入口与 DOM 契约结构 |

以上条目与 `boundary.yaml` 的条目集合（kind/path）恒等；边界严格限定在名单中本角色名下模块（env-resources、entry-index）的路径并集，不包含任何其他文件或目录。
