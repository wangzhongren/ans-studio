---
schema: project-modules/v2
flowId: wuxia-roguelike
version: 1
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
---
# 模块清单：wuxia-roguelike（v1）

本文件是模块路径与职责的唯一权威源；名单中的 `modules[]` 为其派生快照。

## 边界与依赖

- 叶子层：`config-data`、`engine-core`、`qa-acceptance` 不依赖其他业务模块。
- 领域层：`player`/`combat`/`enemies`/`progression`/`arsenal` 只依赖 `engine-core` 与 `config-data`；领域模块之间不直接 import，经 `loop-app` 注入的上下文/事件总线通信。
- 编排层：`loop-app` 依赖全部领域模块，负责波次、胜负与重开。
- 表现层：`ui-hud` 读取 `loop-app` 的只读视图快照与 `config-data` 文案。
- 入口层：`entry-index` 只做脚本顺序装配与启动调用，不含业务逻辑。
- 固定模块：`env-resources`（env）与 `entry-index`（entry）只由 `env-bootstrap` 拥有。

## 写区

各模块 `path`/`paths` 即属主写区；路径互不重叠、不嵌套。跨模块改动通过架构契约与交接完成，不直接改他人目录。
