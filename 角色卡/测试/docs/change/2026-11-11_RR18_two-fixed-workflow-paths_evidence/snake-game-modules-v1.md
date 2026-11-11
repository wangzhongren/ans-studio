---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: entry-page
    name: 入口页面
    purpose: 提供游戏容器、分数显示、结束提示与重开按钮的 DOM 结构，并按固定顺序加载经典脚本（非 ES module），保证双击 index.html 即可运行
    category: ui
    path: index.html
    publicContract: 见 docs/contracts/snake-game-contract-v1.md §5：固定 DOM id（game-canvas/score/status/restart）与脚本加载顺序 game.js→render.js→input.js
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心逻辑
    purpose: 网格坐标与固定节拍步进、方向意图与 180° 反向拦截、吃食物计分与蛇身增长、越界即 game over、playing/over 状态机与重开复位；纯逻辑不触碰 DOM
    category: core
    path: src/game.js
    publicContract: 见 docs/contracts/snake-game-contract-v1.md §2：SnakeGame 核心 API（create/start/step/setDirection/reset/getState）与状态字段
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-render
    name: 渲染与主循环
    purpose: 将核心状态绘制到 Canvas，更新分数与结束提示，驱动固定 tick 主循环，处理重开按钮交互；只读核心状态，不修改游戏规则
    category: ui
    path: src/render.js
    publicContract: 见 docs/contracts/snake-game-contract-v1.md §3：渲染器接口（init/loop/stop/showOver）与只读状态约束
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-input
    name: 键盘输入
    purpose: 监听方向键（阻止页面滚动）并把方向意图传给核心；处理重开按键；不直接修改蛇坐标或分数
    category: input
    path: src/input.js
    publicContract: 见 docs/contracts/snake-game-contract-v1.md §4：输入层仅调用 setDirection/restart，且方向键 preventDefault
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-style
    name: 页面样式
    purpose: 游戏区域、分数、结束状态与重开控件的布局与可读样式，保证纯本地文件打开即可正常显示
    category: style
    path: src/style.css
    publicContract: 见 docs/contracts/snake-game-contract-v1.md §5：样式选择器与 index.html 的 DOM 契约一致，不引入外部字体/图片
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# snake-game 模块清单 v1

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 格式：`project-modules/v2`（本文件为模块 id 与路径的唯一权威源）
- 版本：v1（版本化；后续变更出新版本，本版只读）

## 一、模块总览

| 模块 id | 名称 | 路径 | 类别 | 交付物 |
| --- | --- | --- | --- | --- |
| `entry-page` | 入口页面 | `index.html` | ui | 可直接双击打开的单页入口与脚本加载顺序 |
| `game-core` | 游戏核心逻辑 | `src/game.js` | core | 状态机、步进、方向、计分、增长、越界判定 |
| `game-render` | 渲染与主循环 | `src/render.js` | ui | Canvas 绘制、分数/结束提示、tick 与重开交互 |
| `game-input` | 键盘输入 | `src/input.js` | input | 方向键监听、滚动抑制、重开按键 |
| `game-style` | 页面样式 | `src/style.css` | style | 页面布局与可读样式 |

## 二、路径与归属约束

1. 五条路径互不重叠、互不嵌套：`index.html`（根文件）与 `src/` 下四个文件在路径层面互不含。
2. 全部路径为项目相对路径，且不在治理写区（`.ans/`、`角色卡/`、`docs/` 等）。
3. 不引入构建产物目录、不引入 `node_modules/`、第三方库或外部素材；全部文件由实现角色直接编写。
4. 一模块一属主：v1 名单中五个模块均由唯一实现角色 `game-implementer` 拥有（见 `docs/proposals/snake-game-roster-v1.md`）。
5. `env`/`entry` 为保留类别，本清单未使用；入口页以普通 `ui` 类别模块承载，理由见名单的 `envBootstrap.omitted` 说明。

## 三、公开契约与架构来源

- 跨模块接口、行为口径与验收证据约定：`docs/contracts/snake-game-contract-v1.md`。
- 分层、依赖方向与数据流：`docs/contracts/snake-game-architecture-v1.md`。
- 本清单不改变意图 v1 的任何行为口径；计分、反向、撞墙、重开语义以意图 v1 为准。
