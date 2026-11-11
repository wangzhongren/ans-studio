---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: env-resources
    name: 环境与静态资源
    purpose: 存放页面静态资源（图标等），提供无构建运行所需的资源目录
    category: env
    paths: [assets/]
    publicContract: "static-assets：assets/ 下资源按页面相对路径引用，不引入构建步骤"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口
    purpose: 浏览器入口页面，装配画布、分数区、结束态与重开按钮并加载脚本
    category: entry
    paths: [index.html]
    publicContract: "page-entry：浏览器直接打开 index.html 即可启动游戏"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心
    purpose: 规则与状态机：移动推进、食物生成、碰撞判定、计分、结束与重开复位
    category: core
    path: src/game.js
    publicContract: "window.SnakeGame：{ createGame(config), reset(), tick(), getState() }（纯逻辑，不依赖 DOM）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-ui
    name: 游戏界面
    purpose: Canvas 渲染、键盘输入处理、分数显示、结束态提示与重开按钮绑定
    category: ui
    path: src/ui.js
    publicContract: "window.SnakeUI：{ mount(game), render(state), onKeydown(event) }（依赖 window.SnakeGame）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-style
    name: 页面样式
    purpose: 页面布局、画布容器、分数与重开按钮的视觉样式
    category: ui
    path: styles.css
    publicContract: "styles：页面与游戏区域样式约定，入口页按相对路径引用"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---
