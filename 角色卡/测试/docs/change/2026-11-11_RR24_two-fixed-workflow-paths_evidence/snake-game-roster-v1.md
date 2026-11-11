---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
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
roles:
  - id: env-bootstrap
    displayName: 环境装配与入口
    purpose: 维护入口页与样式资源，保证零构建、离线可直接打开，并按固定顺序装载各层脚本
    capability: 原生 HTML/CSS；相对路径与 file:// 兼容；无外部依赖
    modules: [env-resources, entry-index]
    review: false
  - id: game-logic
    displayName: 游戏规则实现
    purpose: 实现纯状态机：推进、吃食物增长与计分、撞墙结束、重置；保证可注入 RNG 与只读快照
    capability: 原生 JavaScript；状态机与边界条件；不依赖 DOM
    modules: [game-core]
    review: false
  - id: input-ctrl
    displayName: 输入适配实现
    purpose: 实现方向键与 WASD 映射、180° 反向过滤、结束态忽略输入与事件解绑
    capability: 原生 JavaScript；KeyboardEvent 与输入队列
    modules: [input-control]
    review: false
  - id: ui-render
    displayName: 渲染实现
    purpose: 实现 Canvas 2D 绘制：网格、蛇身、食物、分数与结束覆盖层；只读快照
    capability: 原生 JavaScript；Canvas 2D；基础中文界面
    modules: [render-ui]
    review: false
  - id: app-shell
    displayName: 装配与主循环实现
    purpose: 组装各层、驱动固定 130ms tick、处理结束态与重开入口编排
    capability: 原生 JavaScript；定时循环与事件装配
    modules: [app-entry]
    review: false
---
# snake-game 名单 v1

> schema `project-roster/v4`。`modules[]` 是 `docs/proposals/snake-game-modules-v1.md` 的派生快照，逐项一致；每模块恰一个属主，每角色至少一个模块。

## 1. 角色与职责

| 角色 id | 显示名 | 职责 | 负责模块 | review |
| --- | --- | --- | --- | --- |
| env-bootstrap | 环境装配与入口 | 入口页与样式资源，零构建离线可打开，脚本装载顺序 | env-resources、entry-index | false |
| game-logic | 游戏规则实现 | 纯状态机：推进/吃食物/计分/撞墙/重置 | game-core | false |
| input-ctrl | 输入适配实现 | 方向键与 WASD 映射、反向过滤、结束态忽略 | input-control | false |
| ui-render | 渲染实现 | Canvas 绘制与结束覆盖层，只读快照 | render-ui | false |
| app-shell | 装配与主循环实现 | 组装各层、固定 tick、结束与重开编排 | app-entry | false |

- 固定角色：本项目不省略 `env-bootstrap`（有入口页与样式资源，不写 `envBootstrap.omitted`），其固定模块 `env-resources`（env）与 `entry-index`（entry）为保留类别，仅归该角色。
- 模块属主唯一性：`env-resources`/`entry-index` → env-bootstrap；`game-core` → game-logic；`input-control` → input-ctrl；`render-ui` → ui-render；`app-entry` → app-shell。
- 角色 id 均为小写 slug，不占用内置角色 id；可据此机械建卡。

## 2. 实现与验收归属

- 实现：A11 按「一模块一任务」把模块派给上表属主；同工作区写任务串行，返工回原属主责任链。
- 验收：A12 独立验收默认由内置 `verifier` 承担（幕僚创建并收口，运营不派质检）。本名单**不设** `review=true` 的项目验收角色，避免与内置 verifier 职责重复；若后续需要项目内验收角色，应出名单新版本（v2）并显式标记至多一个 `review: true`。
- 本名单不创建角色卡、不招人、不激活；卡与激活由 A9/A10 依据团队计划与客户任命完成。

## 3. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    path: styles/
    roleId: env-bootstrap
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: game-core
    path: src/core/
    roleId: game-logic
  - id: input-control
    path: src/input/
    roleId: input-ctrl
  - id: render-ui
    path: src/render/
    roleId: ui-render
  - id: app-entry
    path: src/app/
    roleId: app-shell
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-logic
    modules: [game-core]
  - id: input-ctrl
    modules: [input-control]
  - id: ui-render
    modules: [render-ui]
  - id: app-shell
    modules: [app-entry]
management: [convener, env-bootstrap, game-logic, input-ctrl, ui-render, app-shell]
```

## 4. 一致性说明

- 拓扑块的模块数量（6）、角色数量（5）与 frontmatter 完全一致；模块 id/路径/属主与 `roles[].modules[]` 一一对应。
- 引用链：intent=`docs/product/snake-game-intent-v1.md`、proposal=`docs/proposals/snake-game-proposal-v1.md`、architecture=`docs/contracts/snake-game-architecture-v1.md`、modulesDoc=`docs/proposals/snake-game-modules-v1.md`，均为当前最新版本（v1）。
- `management` 为扁平数组，含 `convener` 与全部项目角色 id。

## 5. 版本

- v1（首次名单，对应 A5）。后续变更（角色/模块/归属调整）出新版本，不原地修改。
