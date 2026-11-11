# 边界：环境装配与入口（env-bootstrap）

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| directory | `styles/` | 静态资源与样式目录（模块 env-resources） |
| file | `index.html` | 唯一浏览器入口页（模块 entry-index） |

> 本角色边界仅含名单模块 `env-resources` 与 `entry-index` 的路径并集；不含任何其他模块、角色卡或治理路径。
