---
schema: project-roster/v4
flowId: wuxia-roguelike
version: 1
intent: docs/product/wuxia-roguelike-intent-v1.md
proposal: docs/proposals/wuxia-roguelike-proposal-v1.md
architecture: docs/contracts/wuxia-roguelike-architecture-v1.md
modulesDoc: docs/proposals/wuxia-roguelike-modules-v1.md
envBootstrap:
  omitted: false
modules:
  - id: env-resources
    name: 环境与静态资源
    purpose: 项目说明、本地静态资源与无 CDN 资源组织
    category: env
    paths:
      - README.md
      - assets/
    publicContract: "静态资源路径约定（见 docs/contracts/wuxia-roguelike-architecture-v1.md）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: entry-index
    name: 入口页与装配
    purpose: 可直接双击打开的入口页与经典脚本加载顺序
    category: entry
    path: index.html
    publicContract: "index.html 入口与脚本加载顺序（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: engine-core
    name: 渲染与输入引擎
    purpose: Canvas 2D 渲染、键盘输入、数学/碰撞、对象池与 DPR 适配
    category: core
    path: game/engine/
    publicContract: "window.WX.Engine 公开接口（渲染/输入/数学，见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: loop-app
    name: 主循环与状态机
    purpose: 固定步长循环、状态机、波次/计时节奏、胜负与重开编排、事件总线
    category: core
    path: game/app/
    publicContract: "window.WX.App 状态机与事件总线契约（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: player
    name: 玩家
    purpose: 移动、生命、受伤与无敌帧、死亡判定
    category: gameplay
    path: game/player/
    publicContract: "window.WX.Player 实体接口（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: combat
    name: 自动战斗
    purpose: 自动索敌、冷却/范围伤害、命中反馈与伤害结算
    category: gameplay
    path: game/combat/
    publicContract: "window.WX.Combat 索敌与伤害接口（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: enemies
    name: 敌人与生成
    purpose: 敌人类型/属性、刷新生成、强度递增与精英（可选）
    category: gameplay
    path: game/enemies/
    publicContract: "window.WX.Enemies 生成与实体接口（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: progression
    name: 经验与强化
    purpose: 经验掉落/拾取、等级阈值、三选一强化池与效果生效
    category: gameplay
    path: game/progression/
    publicContract: "window.WX.Progression 经验与强化接口（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: arsenal
    name: 武器与道具
    purpose: 武器/道具获取、使用/叠加与效果接入
    category: gameplay
    path: game/items/
    publicContract: "window.WX.Arsenal 武器与道具接口（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: ui-hud
    name: 界面与 HUD
    purpose: 开始界面、HUD、升级选择面板、胜负结算与重开交互；含武侠主题样式
    category: ui
    path: game/ui/
    publicContract: "window.WX.UI 视图快照渲染契约（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: config-data
    name: 配置与数值
    purpose: 敌人/波次/强化/武器/文案的 JS 常量配置与初值平衡
    category: data
    path: game/data/
    publicContract: "window.WX.Config 配置结构与默认数值（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
  - id: qa-acceptance
    name: 验收与回归清单
    purpose: 手工验收清单、AC-1~AC-8 走查表与回归检查记录
    category: qa
    path: qa/
    publicContract: "手工验收清单与 AC 走查记录（见架构契约）"
    architectureSource: docs/contracts/wuxia-roguelike-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境与入口
    purpose: 维护入口页、脚本装配顺序与本地静态资源
    capability: HTML/CSS/JS 装配、静态资源组织、file:// 兼容
    modules: [env-resources, entry-index]
  - id: loop-engine
    displayName: 主循环与引擎
    purpose: 实现渲染/输入引擎与主循环、状态机、波次和胜负编排
    capability: Canvas 2D、固定步长循环、状态机、事件总线
    modules: [engine-core, loop-app]
  - id: player-combat
    displayName: 玩家与自动战斗
    purpose: 实现玩家移动/生存与自动索敌、伤害结算
    capability: 输入与运动、索敌算法、碰撞与伤害
    modules: [player, combat]
  - id: enemy-systems
    displayName: 敌人与生成
    purpose: 实现敌人类型、刷新曲线与强度递增
    capability: 生成器、实体行为、难度曲线
    modules: [enemies]
  - id: progression
    displayName: 经验与强化
    purpose: 实现经验曲线、升级阈值与三选一强化
    capability: 成长曲线、强化池、效果修饰器
    modules: [progression]
  - id: arsenal
    displayName: 武器与道具
    purpose: 实现武器/道具获取、叠加与效果接入
    capability: 物品系统、效果组合、数值接入
    modules: [arsenal]
  - id: ui-hud
    displayName: 界面与主题
    purpose: 实现 HUD、升级面板、结算/重开与武侠主题样式
    capability: DOM/CSS、布局与可读性、交互状态
    modules: [ui-hud]
  - id: config-data
    displayName: 配置与数值
    purpose: 维护全部数值/文案 JS 常量与初值平衡
    capability: 数值设计、配置结构、平衡调参
    modules: [config-data]
  - id: qa-verifier
    displayName: 验收与回归
    purpose: 独立走查 AC-1~AC-8、维护手工验收清单与回归记录
    capability: 手工测试、边界用例、验收记录
    modules: [qa-acceptance]
    review: true
---
# 名单：wuxia-roguelike（v1）

依据：
- 意图：`docs/product/wuxia-roguelike-intent-v1.md`
- 提案：`docs/proposals/wuxia-roguelike-proposal-v1.md`
- 模块清单：`docs/proposals/wuxia-roguelike-modules-v1.md`
- 架构契约：`docs/contracts/wuxia-roguelike-architecture-v1.md`

## 角色与写区

| 角色 | 负责模块 | 写区 | 主要冲突点 |
|---|---|---|---|
| env-bootstrap | env-resources, entry-index | `README.md`、`assets/`、`index.html` | 入口页脚本顺序为跨角色热点，其他角色不得直接改 `index.html` |
| loop-engine | engine-core, loop-app | `game/engine/`、`game/app/` | 事件总线/接口契约由本角色维护，变更需走架构新版本 |
| player-combat | player, combat | `game/player/`、`game/combat/` | 伤害结算接口需与 enemies/arsenal 通过 `ctx.applyDamage` 对齐 |
| enemy-systems | enemies | `game/enemies/` | 生成参数只读 `config-data`，不得硬编码 |
| progression | progression | `game/progression/` | 强化效果以修饰器交给 combat/app，避免直接 import |
| arsenal | arsenal | `game/items/` | 武器/道具效果接入点需与 combat 契约一致 |
| ui-hud | ui-hud | `game/ui/`（含 `game/ui/styles/`） | 只读视图快照，不写领域状态；样式 class 约定 |
| config-data | config-data | `game/data/` | 数值唯一来源，其他角色只读 |
| qa-verifier | qa-acceptance | `qa/` | 独立验收，不修改运行时代码；发现问题回报对应属主 |

固定角色 `env-bootstrap` 拥有 `env-resources`(env) 与 `entry-index`(entry)，不省略。`qa-verifier` 标记 `review: true`，作为后续独立验收角色候选（其验收结论不替代客户验收）。

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    paths: [README.md, assets/]
    roleId: env-bootstrap
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: engine-core
    path: game/engine/
    roleId: loop-engine
  - id: loop-app
    path: game/app/
    roleId: loop-engine
  - id: player
    path: game/player/
    roleId: player-combat
  - id: combat
    path: game/combat/
    roleId: player-combat
  - id: enemies
    path: game/enemies/
    roleId: enemy-systems
  - id: progression
    path: game/progression/
    roleId: progression
  - id: arsenal
    path: game/items/
    roleId: arsenal
  - id: ui-hud
    path: game/ui/
    roleId: ui-hud
  - id: config-data
    path: game/data/
    roleId: config-data
  - id: qa-acceptance
    path: qa/
    roleId: qa-verifier
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: loop-engine
    modules: [engine-core, loop-app]
  - id: player-combat
    modules: [player, combat]
  - id: enemy-systems
    modules: [enemies]
  - id: progression
    modules: [progression]
  - id: arsenal
    modules: [arsenal]
  - id: ui-hud
    modules: [ui-hud]
  - id: config-data
    modules: [config-data]
  - id: qa-verifier
    modules: [qa-acceptance]
management: [convener, env-bootstrap, loop-engine, player-combat, enemy-systems, progression, arsenal, ui-hud, config-data, qa-verifier]
```

## 依赖与协作约定

- 依赖方向见 `docs/contracts/wuxia-roguelike-architecture-v1.md` §4；禁止循环 import。
- 领域模块之间只经 `loop-app` 事件总线/注入上下文通信。
- 跨写区修改通过交接完成；`index.html`、`game/data/`、`game/ui/styles/` 为高冲突点。
- 名单用于后续人事建卡/激活；本文件不构成客户任命或批准。
