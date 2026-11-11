---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: game-rules
    name: 游戏规则与状态机
    purpose: "纯逻辑核心：蛇身与网格坐标、固定 tick 移动步进、食物在合法空格随机生成、每食物固定 +10 分、撞墙与自撞判定、待开始/运行/暂停/结束相位、重开重置；维护方向输入队列（容量 2）与禁止反向裁决，不依赖 DOM 与存储实现。"
    category: core
    path: src/core/
    publicContract: "internal（状态快照与方向命令约定，见 docs/contracts/snake-game-architecture-v1.md 第 3、4 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: renderer
    name: 渲染与界面展示
    purpose: "渲染层：Canvas 2D 绘制棋盘、蛇与食物，DOM 更新分数、最高分、已暂停提示与结束层（原因/本局分数/最高分/重开提示）；只读状态快照，不修改规则状态、不读写存储。"
    category: ui
    path: src/ui/
    publicContract: "internal（只读状态快照；DOM 元素 id 契约见 docs/contracts/snake-game-architecture-v1.md 第 5 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 输入控制
    purpose: "输入层：监听 keydown，将方向键与 WASD 归一化为方向请求，Space 映射为暂停/继续、R 映射为重开，并绑定界面「重开」按钮；忽略 event.repeat（按住不加速），不持有游戏状态、不做反向裁决。"
    category: input
    path: src/input/
    publicContract: "internal（键盘到方向/暂停/重开命令的映射契约，见 docs/contracts/snake-game-architecture-v1.md 第 4 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: score-storage
    name: 最高分持久化
    purpose: "持久化层：以固定键读写浏览器 localStorage 中的历史最高分，做非负整数解析与异常回落 0；单局结束时比较并按需更新，清空浏览器数据即丢失属预期。"
    category: data
    path: src/score/
    publicContract: "internal（localStorage 键 snake-game:highScore，非负整数；见 docs/contracts/snake-game-architecture-v1.md 第 6 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: env-resources
    name: 环境装配资源
    purpose: "环境装配：启动脚本加载顺序、命名空间装配与本地直接打开（file://）说明；不承载游戏规则、渲染与存储逻辑。"
    category: env
    paths: [src/main.js, README.md]
    publicContract: "internal（启动装配与脚本加载顺序约定）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口与挂载点
    purpose: "页面入口：index.html 提供根挂载点、画布与 HUD/结束层元素，并按序引用经典脚本；承载 DOM 元素 id 契约的根节点。"
    category: entry
    paths: [index.html]
    publicContract: "internal（DOM 挂载点与元素 id 契约，见 docs/contracts/snake-game-architecture-v1.md 第 5 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---
# 模块清单：贪吃蛇游戏（snake-game）

- flowId：`snake-game`；版本：v1；本文件为模块唯一权威源。
- 上游意图：`docs/product/snake-game-intent-v1.md`；方案：`docs/proposals/snake-game-proposal-v1.md`；架构与契约：`docs/contracts/snake-game-architecture-v1.md`。

## 1. 模块表

| 模块 id | 名称 | category | 路径 | 属主角色 | 职责边界 |
| --- | --- | --- | --- | --- | --- |
| game-rules | 游戏规则与状态机 | core | `src/core/` | game-engine-dev | 蛇身/移动/食物/计分/碰撞/相位/重开；方向队列与禁止反向裁决；不碰 DOM 与 localStorage |
| renderer | 渲染与界面展示 | ui | `src/ui/` | frontend-dev | Canvas 与 HUD/暂停/结束层绘制；只读状态快照，不改规则状态 |
| input-control | 输入控制 | input | `src/input/` | game-engine-dev | 键盘/按钮到方向/暂停/重开命令；无状态、无反向裁决 |
| score-storage | 最高分持久化 | data | `src/score/` | game-engine-dev | localStorage 最高分读写与异常回落；不展示、不判规则 |
| env-resources | 环境装配资源 | env | `src/main.js`、`README.md` | env-bootstrap | 装配与启动顺序、本地直接打开说明；无业务逻辑 |
| entry-index | 页面入口与挂载点 | entry | `index.html` | env-bootstrap | 页面骨架、DOM 元素 id 与脚本引用顺序；无业务逻辑 |

## 2. 划分理由

- **规则/渲染分离**：game-rules 为纯逻辑，可独立按状态迁移核验（移动、食物、碰撞、计分、相位），renderer 只消费快照，便于定位「规则对但画面错」与「画面对但规则错」。
- **输入独立**：键位映射（方向键/WASD/Space/R、忽略长按 repeat）与游戏状态无关，独立成层可避免规则层散落键位判断；方向队列与禁止反向必须依赖规则层状态，统一由 game-rules 裁决，保证单一事实源，也满足「快速连按不丢、不产生非法反向」。
- **持久化独立**：最高分只涉及固定键与非负整数读写，抽成 score-storage 后规则层不直接依赖浏览器存储，异常（隐私模式/损坏值）回落策略集中一处。
- **env/entry 固定模块**：由环境装配角色统一负责启动顺序与页面挂载点，避免业务模块互相引用脚本顺序。

## 3. 路径与归属约定

- 一模块一属主；模块路径互不重叠、不嵌套（`src/main.js` 为文件，`src/core/`、`src/ui/`、`src/input/`、`src/score/` 为互不包含的目录，`index.html`、`README.md` 为根文件）。
- `env-resources`（category=env）与 `entry-index`（category=entry）为固定环境/入口模块，只归 `env-bootstrap`；其他角色不得拥有 env/entry 类模块。
- 模块路径均位于项目源码/根文件区，不落在治理写区。
- `publicContract` 均为非空字符串（内部约定 + 架构文档锚点），不使用布尔值。

## 4. 版本引用

- 方案：`docs/proposals/snake-game-proposal-v1.md`
- 名单（含人员+模块拓扑图）：`docs/proposals/snake-game-roster-v1.md`
- 架构与契约：`docs/contracts/snake-game-architecture-v1.md`
