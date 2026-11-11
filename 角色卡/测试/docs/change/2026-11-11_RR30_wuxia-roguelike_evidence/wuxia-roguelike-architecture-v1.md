---
schema: project-architecture/v1
flowId: wuxia-roguelike
version: 1
proposal: docs/proposals/wuxia-roguelike-proposal-v1.md
author: rapporteur
---
# 架构契约：wuxia-roguelike（v1）

对应提案：`docs/proposals/wuxia-roguelike-proposal-v1.md`
模块权威清单：`docs/proposals/wuxia-roguelike-modules-v1.md`
人员与模块拓扑：`docs/proposals/wuxia-roguelike-roster-v1.md`
依据意图：`docs/product/wuxia-roguelike-intent-v1.md`

本文件冻结 v1 的分层、模块职责、依赖方向、公开契约、数据流与扩展点；实现不得违反。真实变化出新版本，不原地改。

## 1. 运行形态与硬约束

1. **静态直开**：入口 `index.html` 直接以 `file://` 打开可玩；无后端、无构建链、无 npm/打包器。
2. **禁止 ES Module**：不得使用 `<script type="module">`。`file://` 下模块脚本会被 CORS 拒绝。
3. **禁止本地 fetch/XHR**：不得运行时读取本地 JSON；配置/数值必须是先加载的 JS 常量。
4. **禁止外部依赖**：不得引用 CDN、外部字体、外部图片/音频；资源随包，使用程序化图形与系统字体栈。
5. **命名空间**：所有模块挂载到单一全局命名空间 `window.WX`，模块内部用 IIFE 封装，只暴露约定接口，避免全局污染与加载顺序歧义。

## 2. 分层

```
entry-index (index.html)
  └─ 装配层：按固定顺序加载脚本并启动
       └─ ui-hud（DOM/CSS 覆盖层）
       └─ loop-app（编排：状态机、波次、胜负、事件总线）
            ├─ player / combat / enemies / progression / arsenal（领域）
            │    └─ engine-core（渲染/输入/数学）
            │    └─ config-data（数值/文案）
            └─ engine-core
       └─ config-data
qa-acceptance（手工验收与回归清单，不进入运行时依赖）
env-resources（README/静态资源，不进入运行时依赖）
```

依赖方向只允许“上层 → 下层”；下层不得 import 上层；领域模块之间不直接 import。

## 3. 模块职责

| 模块 | 职责 | 写区 |
|---|---|---|
| env-resources | README、本地静态资源 | `README.md`、`assets/` |
| entry-index | 入口页、脚本加载顺序、启动 | `index.html` |
| engine-core | Canvas 渲染、键盘输入、向量/碰撞、对象池、DPR | `game/engine/` |
| loop-app | rAF 固定步长、状态机、波次/计时、胜负/重开、事件总线、视图快照 | `game/app/` |
| player | 移动、生命、受伤/无敌帧、死亡 | `game/player/` |
| combat | 自动索敌、冷却/范围伤害、命中反馈 | `game/combat/` |
| enemies | 敌人类型/属性、刷新生成、强度递增 | `game/enemies/` |
| progression | 经验掉落/拾取、等级阈值、强化池与生效 | `game/progression/` |
| arsenal | 武器/道具获取、使用/叠加与效果 | `game/items/` |
| ui-hud | 开始/HUD/升级面板/结算/重开；样式 | `game/ui/`（含 `game/ui/styles/`） |
| config-data | 数值与文案 JS 常量 | `game/data/` |
| qa-acceptance | 手工验收清单与 AC 走查记录 | `qa/` |

固定模块 `env-resources`（category=env）与 `entry-index`（category=entry）只归 `env-bootstrap`。

## 4. 依赖方向（禁止循环 import）

- **叶子层**：`config-data`、`engine-core`、`qa-acceptance`、`env-resources` 不依赖其他业务模块。
- **领域层**：`player`、`combat`、`enemies`、`progression`、`arsenal` 只可依赖 `engine-core` 与 `config-data`；**领域模块之间不得直接 import**，通过 `loop-app` 注入的上下文与事件总线交互。
- **编排层**：`loop-app` 可依赖全部领域模块与 `engine-core`、`config-data`。
- **表现层**：`ui-hud` 只读 `loop-app` 提供的视图快照，并可依赖 `config-data` 的文案；不得直接修改领域状态。
- **装配层**：`entry-index` 只按顺序加载脚本并调用 `WX.App.start()`，不含业务逻辑。
- 若出现双向需求，改为在 `loop-app` 定义接口/事件，禁止领域模块互相引用。

## 5. 公开契约

### 5.1 脚本加载顺序（`index.html`）

固定顺序，新增文件必须插入到对应层且由 `env-bootstrap` 更新入口页：

1. `game/data/config.js`（挂 `window.WX.Config`）
2. `game/engine/*.js`（挂 `window.WX.Engine`）
3. `game/player/*.js`、`game/combat/*.js`、`game/enemies/*.js`、`game/progression/*.js`、`game/items/*.js`
4. `game/ui/*.js`（挂 `window.WX.UI`）
5. `game/app/*.js`（挂 `window.WX.App`）
6. 启动脚本：`WX.App.start()`

禁止 `type="module"`、`defer` 依赖顺序之外的动态 `import()`。

### 5.2 命名空间与初始化

- 全局唯一命名空间 `window.WX`；各模块 IIFE 内定义，暴露对象挂到 `WX.<Module>`。
- 初始化顺序：`Config` 先就绪，其次 `Engine`（canvas/input），然后领域模块注册工厂，`UI` 绑定 DOM，最后由 `App` 构建并启动。

### 5.3 状态机与运行态（`WX.App`）

- 状态：`BOOT`、`MENU`、`PLAYING`、`LEVEL_UP`、`PAUSED`、`GAME_OVER`、`VICTORY`。
- 固定步长：逻辑步长 1/60s；单帧 `delta` 截断 100ms；`LEVEL_UP` 与 `PAUSED` 冻结世界更新。
- `App` 拥有：实体注册表、波次调度、计时、胜负判定、重开、事件总线。
- `window.blur` → 自动暂停。

### 5.4 事件总线（跨模块唯一通道）

事件名与载荷冻结如下（新增事件需在架构新版本登记）：

| 事件 | 方向 | 载荷 |
|---|---|---|
| `enemy:killed` | enemies → app | `{ enemyId, type, x, y, exp }` |
| `exp:pickup` | player/progression | `{ amount }` |
| `level:up` | progression → app/ui | `{ level, choices: [upgradeId] }` |
| `upgrade:chosen` | ui → app/progression | `{ upgradeId }` |
| `player:hp-changed` | player → ui | `{ hp, maxHp, invulnerable }` |
| `wave:started` / `wave:cleared` | app → ui | `{ wave, timeLeft }` |
| `run:ended` | app → ui | `{ result: "victory"\|"defeat", stats }` |
| `run:restart` | ui → app | `{}` |

领域模块不直接互调；`App` 负责订阅并转交。

### 5.5 领域接口（最小约定）

- `WX.Player.create(ctx)` → `{ update(dt), takeDamage(n), getState() }`；暴露只读状态 `{x, y, hp, maxHp, level, exp, invulnerable}`。
- `WX.Combat.create(ctx)` → `{ update(dt, entities), getWeaponState() }`；索敌规则：优先范围内最近敌人；伤害只经 `ctx.applyDamage(enemy, amount)`。
- `WX.Enemies.create(ctx)` → `{ spawnWave(waveIndex), update(dt), list(), reset() }`；生成参数来自 `WX.Config`。
- `WX.Progression.create(ctx)` → `{ addExp(n), rollChoices(count), applyUpgrade(id), getState() }`；强化效果以属性修饰器形式交给 `App`/`Combat` 应用。
- `WX.Arsenal.create(ctx)` → `{ grantItem(id), getInventory(), applyModifiers(stats) }`；武器/道具效果通过修饰器或 `ctx.applyDamage` 接入。
- `WX.UI.init(viewSource)`、`WX.UI.render(snapshot)`、`WX.UI.showUpgrade(choices, onPick)`、`WX.UI.showResult(result, onRestart)`。
- `WX.Config`：纯数据对象，含 `waves`、`enemies`、`upgrades`、`weapons`、`items`、`balance`、`text`；运行时只读。

### 5.6 视图快照（UI 只读）

`App` 每帧（或状态变化时）向 `UI` 提供：

```js
{
  state, hp, maxHp, level, exp, expToNext,
  wave, timeLeft, elapsed, kills,
  upgradeChoices, result, stats
}
```

`ui-hud` 不得写回领域状态；所有用户输入通过事件或回调交给 `App`。

### 5.7 配置约束

- 所有数值/文案集中在 `game/data/`；其他模块不得硬编码平衡值。
- 配置为 JS 常量，禁止运行时 fetch JSON。
- 配置结构变更须同步架构版本与模块契约。

## 6. 数据流

1. `entry-index` 按顺序加载脚本 → `WX.App.start()` → `MENU`。
2. 玩家确认开始 → `App` 重置单局 → `PLAYING`，波次调度开始。
3. 每逻辑步：`Engine` 采集输入 → `App` 驱动 `player/enemies/combat/progression/arsenal` 更新 → `combat` 经 `ctx.applyDamage` 结算 → `enemies` 死亡发 `enemy:killed` → `progression` 生成经验掉落 → 玩家拾取累加。
4. 经验达阈值 → `progression` 发 `level:up` → `App` 进入 `LEVEL_UP` 并让 `UI` 展示选项 → 玩家选择 → `upgrade:chosen` → 应用修饰器 → 回到 `PLAYING`。
5. 胜利/失败 → `run:ended` → `UI` 展示结算 → `run:restart` → 重开单局。
6. `UI` 仅消费视图快照，不直接改领域数据。

## 7. 扩展点

- **新敌人/波次**：在 `config-data` 增加配置，`enemies` 按配置生成；不改架构接口。
- **新强化/武器/道具**：在 `config-data` 增加条目并注册效果修饰器；`progression`/`arsenal` 按 id 应用。
- **新 UI 面板**：`ui-hud` 内新增 DOM 覆盖层，订阅对应事件/快照字段。
- **渲染扩展**：`engine-core` 增加绘制辅助函数，领域模块只调用公开 API。
- **验收扩展**：`qa-acceptance` 增加 AC 走查条目与回归记录，不引入运行时依赖。
- 任何影响事件名、接口签名、脚本顺序的变更，必须出新版架构契约并同步模块/名单。

## 8. AC-1 ~ AC-8 架构映射

| AC | 架构支撑 |
|---|---|
| AC-1 | 经典脚本顺序装配、JS 配置、无外部依赖；`file://` 直开；`qa-acceptance` 走查 |
| AC-2 | `player` 移动/受伤/无敌帧/死亡 + `enemies` 持续生成 |
| AC-3 | `combat` 自动索敌与冷却/范围伤害，无需瞄准输入 |
| AC-4 | `loop-app` 状态机、波次/计时、胜负与重开；`ui-hud` 结算面板 |
| AC-5 | `progression` 经验、阈值、三选一；`ui-hud` 升级面板；效果经修饰器可感知 |
| AC-6 | `arsenal` 武器/道具获取与效果接入 |
| AC-7 | `ui-hud` HUD 快照渲染（生命/等级/经验/波次/计时） |
| AC-8 | `loop-app` 单局节奏 3-5 分钟 + `qa-acceptance` 完整闭环走查 |

## 9. 未决点与处理

- 入口页命名、胜负口径、本地最高分、音效/移动端等客户未决项，默认按意图处理（`index.html`、生存计时+波次、不做最高分/音效/触屏）；需要客户拍板时由运营按 decision 卡流程处理，本契约不代选。
- 数值平衡由 `config-data` 初值 + A8 调参；不作为架构变更。
