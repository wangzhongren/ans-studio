---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: env-resources
    name: 静态资源与样式
    purpose: 入口页引用的样式表与静态资源目录；提供画布布局、状态栏与结束覆盖层的基础样式，保证深底高对比可读
    category: env
    path: styles/
    publicContract: internal（styles/ 目录只放样式表，由 index.html 以相对路径引用；不含脚本与业务逻辑）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 浏览器入口页
    purpose: 唯一 HTML 入口，声明画布、分数状态栏与结束覆盖层，以普通 script 按序装载各层脚本（零构建、无外部请求）
    category: entry
    path: index.html
    publicContract: internal（index.html 为唯一浏览器入口；脚本用普通 script 标签且顺序固定，不使用 ES module/fetch/CDN）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏规则核心
    purpose: 纯状态机：网格与蛇身、食物生成、按 tick 推进、吃食物增长 1 格并计分 +1、撞墙（触及或越过）判定结束、重开重置；不触碰 DOM
    category: core
    path: src/core/
    publicContract: internal（公开 API：createGame / queueDirection / stepGame / resetGame / snapshot；只读快照对外，RNG 可注入以便复现）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 键盘输入适配
    purpose: 将方向键与 WASD 的 keydown 映射为方向意图，相对当前生效方向过滤 180° 反向；结束态忽略输入；提供解绑
    category: input
    path: src/input/
    publicContract: internal（公开 API：attachKeyboard(target, handlers) 返回 detach；normalizeKey(event) 返回 up/down/left/right 或 null）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: render-ui
    name: 画面渲染
    purpose: 以 Canvas 2D 绘制网格、蛇身、蛇头、食物与分数，绘制结束覆盖层与最终分数；只读状态快照，不修改游戏状态
    category: render
    path: src/render/
    publicContract: internal（公开 API：createRenderer(canvas, config) 返回 draw(snapshot)、showOverlay(snapshot)、hideOverlay()；渲染层不写状态）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: app-entry
    name: 装配与主循环
    purpose: 组装 input → core → render，驱动固定 130ms tick 主循环，处理结束态停止推进与重开（按钮/空格/回车）编排
    category: app
    path: src/app/
    publicContract: internal（公开 API：start(config)；负责定时与生命周期，规则只调用 game-core，不复制规则逻辑）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---
# snake-game 模块清单 v1

本文件为模块唯一权威源（schema `project-modules/v2`）。名单中的 `modules[]` 是本清单的派生快照，必须逐项一致（防 `roster-modules-drift`）。

## 1. 模块一览

| id | 类别 | 路径 | 职责摘要 |
| --- | --- | --- | --- |
| env-resources | env | `styles/` | 样式与静态资源目录，由入口页引用 |
| entry-index | entry | `index.html` | 唯一浏览器入口，按序装载普通脚本 |
| game-core | core | `src/core/` | 纯状态机：推进、吃食物、计分、撞墙、重置 |
| input-control | input | `src/input/` | 键盘映射与反向过滤、结束态忽略 |
| render-ui | render | `src/render/` | Canvas 绘制与结束覆盖层，只读快照 |
| app-entry | app | `src/app/` | 装配与固定 tick 主循环、重开编排 |

## 2. 路径与边界说明

- 六个路径互不相同、互不嵌套：`styles/`、`index.html`、`src/core/`、`src/input/`、`src/render/`、`src/app/`。
- 全部为项目相对路径，落在实现区，不进入治理写区（`.ans/`、`角色卡/`、`docs/proposals|contracts|product|intents|scheduling|quality|verification|skills|mcp/` 等）。
- `env-resources`（category=env）与 `entry-index`（category=entry）为保留类别，只能由 `env-bootstrap` 拥有；本项目不省略 env-bootstrap。
- 每模块恰一个属主，映射见 `docs/proposals/snake-game-roster-v1.md`。

## 3. 依赖方向（摘要，详见架构）

`app-entry` → {`input-control`, `render-ui`, `game-core`}；`input-control` 与 `render-ui` 只依赖 `game-core` 的公开契约；`game-core` 无内部依赖；`env-resources`/`entry-index` 只被入口页引用，不被业务模块反向依赖。

## 4. 版本

- v1（首次模块清单，对应 A5）。后续变更出新版本，不原地修改。
