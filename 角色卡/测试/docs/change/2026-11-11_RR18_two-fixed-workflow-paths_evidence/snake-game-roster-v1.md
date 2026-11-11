---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: true
  omissionReason: 单页静态小游戏无构建、无依赖安装、无后端与环境装配；入口页与全部源码由唯一实现角色直接编写，无需 env-bootstrap 角色，故按小项目省略
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
roles:
  - id: game-implementer
    displayName: 游戏实现者
    purpose: 按契约实现入口页、游戏核心逻辑、渲染主循环、键盘输入与页面样式，并交付可独立验收的静态单页游戏
    capability: 原生 HTML/CSS/JavaScript（Canvas 2D）、经典脚本加载与本地文件运行，无构建工具
    modules: [entry-page, game-core, game-render, game-input, game-style]
---

# snake-game 名单 v1

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 格式：`project-roster/v4`
- 依据：意图 `docs/product/snake-game-intent-v1.md`；提案 `docs/proposals/snake-game-proposal-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`；模块清单 `docs/proposals/snake-game-modules-v1.md`
- 版本：v1（版本化；后续变更出新版本，本版只读）

## 一、团队设计原则

按最小可用团队（MVP）设计：本项目为一份可由单人顺序完成的静态单页游戏，**仅设 1 个实现角色**，拥有全部五个模块；不为凑数扩编。独立验收（verifier）由幕僚在 A12 另行创建，不在本实现名单内。

## 二、角色与模块归属

| 角色 id | 名称 | 能力 | 拥有模块（路径） |
| --- | --- | --- | --- |
| `game-implementer` | 游戏实现者 | 原生 HTML/CSS/JS + Canvas 2D | `entry-page`（index.html）、`game-core`（src/game.js）、`game-render`（src/render.js）、`game-input`（src/input.js）、`game-style`（src/style.css） |

每模块恰一个属主：五个模块均归 `game-implementer`；该角色至少绑定一个模块，符合名单约束。

## 三、env-bootstrap 省略说明

`envBootstrap.omitted: true`，理由见 frontmatter `omissionReason`：单页静态小游戏无构建、无依赖安装、无后端与环境装配，入口页与全部源码由唯一实现角色直接编写，无需 `env-bootstrap` 角色。本名单因此**不含** env-bootstrap 角色，也不含 `env`/`entry` 类别模块；入口页以普通 `ui` 类别模块 `entry-page` 承载（路径 `index.html`），符合省略后的名单约束。

## 四、职责边界与交付约定

- `game-implementer` 只能写入上表所列五条模块路径；不得修改意图、提案、名单、架构、契约等治理文档，不得写角色卡。
- 实现须遵守 `docs/contracts/snake-game-contract-v1.md` 的接口与行为口径；跨模块接口变更须经策划出契约新版本。
- 交付物：可直接双击运行的 `index.html` 及 `src/` 下四个文件；无构建产物、无第三方依赖、无外部素材、无网络请求。
- 验收证据使用纯项目相对路径；hash 由应用计算，worker 不自行申报。

## 五、人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: entry-page
    path: index.html
    roleId: game-implementer
  - id: game-core
    path: src/game.js
    roleId: game-implementer
  - id: game-render
    path: src/render.js
    roleId: game-implementer
  - id: game-input
    path: src/input.js
    roleId: game-implementer
  - id: game-style
    path: src/style.css
    roleId: game-implementer
roles:
  - id: game-implementer
    modules: [entry-page, game-core, game-render, game-input, game-style]
management: [convener, game-implementer]
```

- `management` 为扁平数组，含运营 `convener` 与全部项目角色 `game-implementer`。
- 拓扑中的模块 id/路径/属主、角色 id/模块集合与 frontmatter 的 `modules[]`、`roles[]` 完全一致。

## 六、说明

- 本名单为 A7 人事依据：人事按名单机械建卡/激活，不自行增删角色。
- 任何模块拆分、路径或角色变化，需出名单/模块新版本并重新核对拓扑；不得原地修改本版。
