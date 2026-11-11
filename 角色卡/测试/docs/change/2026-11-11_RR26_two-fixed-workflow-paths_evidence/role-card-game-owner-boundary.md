# 边界：game-owner

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| file | `src/game.js` | game 模块：全部游戏规则、渲染、输入、主循环与重开 |

以上条目与 `boundary.yaml` 的条目集合（kind/path）恒等；边界严格限定在名单中本角色名下模块（game）的路径并集，不包含任何其他文件或目录。
