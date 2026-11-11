---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
---

# 架构：贪吃蛇游戏（snake-game）v1

- 上游提案：`docs/proposals/snake-game-proposal-v1.md`（project-proposal/v2，v1）
- 上游意图：`docs/product/snake-game-intent-v1.md`（v1，intentId=snake-game）
- 模块权威清单：`docs/proposals/snake-game-modules-v1.md`（v1）
- 适用范围：单机静态单页游戏，零构建、零外部依赖，浏览器直接打开 `index.html` 运行。

## 1. 分层

自外向内四层，依赖只允许由外层指向内层：

1. **入口层（entry）**：`entry-index`（`index.html`）——页面容器、信息栏、画布与结束提示 DOM，按固定顺序加载脚本并触发启动。
2. **装配/调度层（app）**：`game-shell`（`src/app/`）——主循环节拍、事件分发（转向、进食、越界结束、重开）、生命周期（启动/停止/重置）。
3. **领域层（core）**：`game-core`（`src/core/`）——纯数据结构与规则状态机，不引用 DOM/Canvas/键盘事件。
4. **外围适配层（input / ui）**：`input-controller`（`src/input/`）把键盘事件适配为方向输入；`renderer`（`src/render/`）把状态快照适配为 Canvas 画面。二者都只与领域层的数据约定和装配层交互，互不直接依赖。

环境资源层：`env-resources`（`README.md`）不参与运行时依赖，仅承载运行前提与操作说明。

## 2. 模块职责与依赖方向

| 模块 | 层级 | 职责 | 允许依赖 |
| --- | --- | --- | --- |
| `env-resources` | 环境 | 运行方式与操作说明（无构建、本地打开） | 无（文档） |
| `entry-index` | 入口 | 页面结构、信息栏/画布/遮罩容器、脚本加载顺序 | 只依赖 app 层入口函数与 renderer 的挂载点约定 |
| `game-shell` | 装配 | 主循环、事件编排、结束与重开流程 | `game-core`（必需）、`input-controller`、`renderer`、`entry-index` 挂载点 |
| `game-core` | 领域 | 网格/蛇身推进/食物/进食计分/越界判定/整局重置 | 仅标准库与自身数据结构；**不得**依赖 DOM、Canvas、键盘事件、其他模块 |
| `input-controller` | 外围 | 方向键与 WASD→单一方向；过滤反向与非法键；向装配层提交转向意图 | 仅装配层提供的注册接口；不直接修改核心状态 |
| `renderer` | 外围 | 画布绘制网格/蛇/食物、分数展示、结束遮罩与提示 | 只读取核心状态快照；不写状态、不监听键盘 |

依赖方向（单向，禁止反向或环）：

```
entry-index → game-shell → { input-controller, renderer, game-core }
input-controller ──提交转向──→ game-shell ──调用──→ game-core
renderer ←──只读快照── game-shell
```

- `game-core` 不感知任何外围模块，是唯一持有可变游戏状态的地方。
- `input-controller` 与 `renderer` 之间无依赖；二者都只通过装配层与领域层交互。
- 禁止：`game-core` 引用 `renderer`/`input-controller`；`entry-index` 直接调用 `game-core` 或 `input-controller`。`env-resources` 不成为任何运行时依赖。

## 3. 公开契约

### 3.1 核心状态机契约（`game-core`）

- `createState(config) → State`：初始化网格尺寸、蛇初始长度/位置/方向、分数 0、食物。
- `turn(state, direction)`：提交方向意图；与当前方向反轴的输入被忽略，返回是否接受。
- `step(state) → StepResult`：推进一个 tick；处理移动、进食（分数 +1、蛇身增长、食物重生成）与越界判定；`StepResult` 含 `{ state, ate, gameOver }`。
- `reset(state) → State`：整局重置为初始状态（分数归零、蛇与食物重初始化）。
- 纯函数式风格：不产生渲染副作用、不读时钟（时钟由装配层持有）；状态为可序列化普通对象。

### 3.2 输入契约（`input-controller`）

- `bind(target, onDirection)` / `unbind(target)`：把方向键与 WASD 等价映射为 `Direction`（up/down/left/right）并回调；忽略其他按键。
- 反向输入在适配层或核心层被忽略，保证不会瞬间反向。

### 3.3 渲染契约（`renderer`）

- `mount(canvas, infoElements)`：绑定画布与分数/提示 DOM。
- `draw(stateSnapshot)`：只读绘制网格、蛇、食物与分数。
- `showGameOver(stateSnapshot)` / `hideGameOver()`：结束遮罩、本局得分与重开提示。
- 渲染不修改状态；不持有游戏时钟。

### 3.4 装配契约（`game-shell`）

- `start(canvas, infoElements)`：装配 core/input/renderer 并启动固定节拍主循环。
- 节拍约 8 tick/秒（方案值，集中为一个常量，便于调整）；每 tick 调用 `step` 并触发 `draw`。
- 越界结束时停止主循环、禁止方向输入、调用 `showGameOver`。
- 结束后 Enter / Space 或「重开」按钮触发：`reset` → 隐藏遮罩 → 重启主循环。

### 3.5 入口契约（`entry-index`）

- 页面需提供固定 id 的容器：画布、分数信息位、结束遮罩与重开按钮；脚本按 `core → input → render → app` 顺序加载，加载完成后调用 `game-shell.start(...)`。
- 无内联业务逻辑：入口只负责结构与引导，规则全部在 `src/`。

## 4. 数据流

1. 键盘事件 → `input-controller` 映射为方向意图 → `game-shell` 暂存待生效方向。
2. `game-shell` 按固定节拍调用 `game-core.step`：推进蛇身、判定进食（计分 +1、增长、食物重生成）、判定越界。
3. `game-shell` 用 `StepResult` 决定是否结束：正常则取状态快照交 `renderer.draw`；`gameOver` 则停止循环并 `showGameOver`。
4. 结束时用户按 Enter/Space 或点击「重开」→ `game-shell` 调 `game-core.reset` → `renderer.hideGameOver` → 主循环重启。
5. 全流程无网络请求、无本地持久化写入；状态仅存在于内存。

## 5. 扩展点

- **参数化**：网格尺寸、初始长度、tick 速度、每食物分值集中在配置对象/常量，调整不需改结构。
- **规则扩展**：自撞结束、加速、障碍物等可在 `game-core` 的 `step` 内扩展；此类扩展会改变已确认验收口径时，须上游走意图变更，不擅自纳入本期。
- **渲染替换**：`renderer` 以「状态快照 → 画面」为边界，可替换为 DOM/WebGL 渲染而不动核心。
- **输入扩展**：`input-controller` 以 `Direction` 为统一出口，可追加其他输入源（如触控）而不改核心；本期仅键盘。
- **契约升级**：如后续需要跨角色冻结契约，可新增 `docs/contracts/snake-game-contract-vN.md` 并从模块 `publicContract` 引用，本架构版本不预设其内容。

## 6. 与上下游的版本链

- 本架构引用提案 `docs/proposals/snake-game-proposal-v1.md`（architecture→proposal 版本链）。
- 名单 `docs/proposals/snake-game-roster-v1.md` 的 `architecture` 字段指向本文件；本文件或提案升版时，名单须同步升版以保证引用为最新版本。
- 意图 `docs/product/snake-game-intent-v1.md` 为只读依据，架构不修改意图；如意图变更，须先出意图新版本再相应升版提案/架构/名单。
