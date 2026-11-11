# 边界：game-implementer（游戏实现者）

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| file | `index.html` | `game-entry` 模块：根目录单页入口与 DOM 挂载点 |
| directory | `src/` | `game-core` 模块：游戏逻辑与渲染实现（`src/game.js`、`src/styles.css`） |

## 说明

- 边界严格等于名单中该角色两个模块路径的并集：`index.html` 文件与 `src/` 目录；不得扩大或跨模块。
- 禁写治理目录（`docs/`、`.ans/` 等）、角色卡目录与其他角色目录。
- 本角色 `review: false`，不自批验收；验收由内置 verifier 独立执行。
