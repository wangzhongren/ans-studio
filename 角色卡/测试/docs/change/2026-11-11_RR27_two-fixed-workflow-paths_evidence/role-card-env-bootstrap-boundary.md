# 边界：环境装配（env-bootstrap）

依据名单 `docs/proposals/snake-game-roster-v1.md`，本角色只拥有模块 `env-resources`（`assets/`）与 `entry-index`（`index.html`）。

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| directory | `assets/` | 页面静态资源目录 |
| file | `index.html` | 浏览器入口页面 |

## Section 2: 禁止事项

- 不写其他角色模块（`src/game.js`、`src/ui.js`、`styles.css`）。
- 不写角色卡、其他角色目录与治理路径（`.ans/`、`docs/` 下的意图/产品/提案/契约/排期/质量/验证等）。
- 不派发任务、不招人、不联系客户、不批准验收。
