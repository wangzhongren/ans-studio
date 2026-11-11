---
schema: teamPlanSchema:3
flowId: wuxia-roguelike
version: 1
modules:
  path: docs/proposals/wuxia-roguelike-modules-v1.md
  sha256: 86b43d9a09cdf9a5202303db87cf7e4b2177802f1febcb450cdbf8457d094239
roster:
  path: docs/proposals/wuxia-roguelike-roster-v1.md
  sha256: 50b08cba0eeb1bea6101122a0c304a0506eb687fb043bed2aea1189094e9216c
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: ["README.md", "assets/", "index.html"]
    dependsOn: []
  - roleId: config-data
    modules: [config-data]
    writesets: ["game/data/"]
    dependsOn: []
  - roleId: loop-engine
    modules: [engine-core, loop-app]
    writesets: ["game/engine/", "game/app/"]
    dependsOn: [config-data]
  - roleId: player-combat
    modules: [player, combat]
    writesets: ["game/player/", "game/combat/"]
    dependsOn: [config-data, loop-engine]
  - roleId: enemy-systems
    modules: [enemies]
    writesets: ["game/enemies/"]
    dependsOn: [config-data, loop-engine]
  - roleId: progression
    modules: [progression]
    writesets: ["game/progression/"]
    dependsOn: [config-data, loop-engine]
  - roleId: arsenal
    modules: [arsenal]
    writesets: ["game/items/"]
    dependsOn: [config-data, loop-engine]
  - roleId: ui-hud
    modules: [ui-hud]
    writesets: ["game/ui/"]
    dependsOn: [config-data, loop-engine]
  - roleId: qa-verifier
    modules: [qa-acceptance]
    writesets: ["qa/"]
    dependsOn: [loop-engine, player-combat, enemy-systems, progression, arsenal, ui-hud]
---

# 团队计划：wuxia-roguelike（v1）

> 固定路径模式：无 runId / baseDigest（出现即拒绝）。本文件由运营（convener）落盘维护；完成计划不等于 D3，不授权名单外角色。
> 依据：名单 `docs/proposals/wuxia-roguelike-roster-v1.md`（v1，project-roster/v4，9 角色/12 模块）、模块清单 `docs/proposals/wuxia-roguelike-modules-v1.md`（v1）、架构契约 `docs/contracts/wuxia-roguelike-architecture-v1.md`（v1）、提案 `docs/proposals/wuxia-roguelike-proposal-v1.md`（v1）、意图 `docs/product/wuxia-roguelike-intent-v1.md`（v1）。modules/roster 的 sha256 取应用版本记录（机器计算），本文件不另算 hash。

## 1. 目标与交付形态

- 目标：交付纯前端静态页 2D 武侠肉鸽生存小游戏（类似《土豆兄弟》）：自动攻击四周敌人、波次生存、经验升级三选一强化、武器/道具收集；双击 `index.html`（file://）可玩。
- 硬约束：无后端、无构建链、无外部 CDN/字体/图片/音频；不使用 ES Module；不运行时 fetch 本地 JSON；配置为 JS 常量。
- 质量档位：可玩原型级（prototype-playable），AC-1~AC-8 见意图与提案。

## 2. 角色与模块属主（以名单 v1 为准，每模块恰一属主）

| 角色 id | displayName | 负责模块 | 写区 | 说明 |
| --- | --- | --- | --- | --- |
| env-bootstrap | 环境与入口 | env-resources, entry-index | `README.md`、`assets/`、`index.html` | 脚本顺序唯一维护者；不写业务逻辑 |
| config-data | 配置与数值 | config-data | `game/data/` | 全部数值/文案 JS 常量，其他角色只读 |
| loop-engine | 主循环与引擎 | engine-core, loop-app | `game/engine/`、`game/app/` | 状态机/事件总线/视图快照契约维护者 |
| player-combat | 玩家与自动战斗 | player, combat | `game/player/`、`game/combat/` | 索敌/伤害经 `ctx.applyDamage` 约定 |
| enemy-systems | 敌人与生成 | enemies | `game/enemies/` | 生成参数只读 `WX.Config` |
| progression | 经验与强化 | progression | `game/progression/` | 强化以修饰器交给 App/Combat |
| arsenal | 武器与道具 | arsenal | `game/items/` | 效果经修饰器或 `ctx.applyDamage` 接入 |
| ui-hud | 界面与主题 | ui-hud | `game/ui/`（含 `game/ui/styles/`） | 只读视图快照，不写领域状态 |
| qa-verifier | 验收与回归 | qa-acceptance | `qa/` | `review: true`，独立验收候选；不改运行时代码 |

固定模块：`env-resources`(env) 与 `entry-index`(entry) 只归 `env-bootstrap`。

## 3. 实现派发顺序与依赖

依赖方向（架构 §4）：叶子层 `config-data`/`engine-core`/`qa-acceptance`/`env-resources` → 领域层 `player`/`combat`/`enemies`/`progression`/`arsenal`（只依赖 engine-core + config-data，领域间不直接 import）→ 编排层 `loop-app`（依赖全部领域）→ 表现层 `ui-hud`（只读快照）→ 装配层 `entry-index`。

建议派发批次（同工作区写任务串行；一模块一任务）：

1. **批次 1（叶子/入口）**：env-bootstrap（entry-index + env-resources，先建入口骨架与静态资源说明）→ config-data（`WX.Config` 结构与初值）。
2. **批次 2（引擎/编排）**：loop-engine（engine-core 渲染/输入/数学/对象池 → loop-app 状态机/事件总线/视图快照）。
3. **批次 3（领域）**：player-combat（player → combat）→ enemy-systems（enemies）→ progression（progression）→ arsenal（arsenal）。
4. **批次 4（表现）**：ui-hud（HUD/开始/升级/结算/重开 + 武侠主题样式）。
5. **批次 5（回归准备）**：qa-verifier（`qa/` 手工验收清单与 AC-1~AC-8 走查表，不修改运行时代码）。

前置依赖：批次 2 依赖批次 1 的 `WX.Config` 与入口加载顺序；批次 3/4 依赖批次 2 的事件总线/接口/快照契约；批次 5 依赖前四批产物可打开运行。任一属主发现契约缺口，回报运营，由 loop-engine 走架构新版本，不在写区内私改契约。

## 4. 验收角色定位（qa-verifier，review=true）

- 独立走查 AC-1~AC-8、维护 `qa/` 手工验收清单与回归记录，产出仅作证据输入。
- **不宣告验收通过、不替代客户/独立验收、不签收**；A12 独立验收由幕僚按机制创建（默认 verifier；roster `roles[].review` 项目验收角色优先），运营不派质检。
- 发现问题回报对应模块属主与运营，不越界代改。

## 5. 冲突热点与交接规则

| 热点 | 归属 | 规则 |
| --- | --- | --- |
| `index.html` 与脚本加载顺序 | 角色 env-bootstrap | 其他角色不得直接改；新增脚本向 env-bootstrap 交接，由其按固定顺序插入 |
| `game/data/` 数值/文案 | 角色 config-data | 其他角色只读；禁止硬编码平衡值；数值变更由属主统一改 |
| `game/ui/styles/` | 角色 ui-hud | 其他角色只使用约定 class，不写样式 |
| 事件名/接口/视图快照 | 角色 loop-engine | 冻结于架构 §5.4/§5.5/§5.6；变更须架构新版本并同步模块/名单 |
| `qa/` | 角色 qa-verifier | 独立验收记录，不参与运行时依赖 |

通用交接：跨写区需求由需求方回报运营，运营协调原属主修改或走架构新版本；不得直接改他人目录；不得新建全局状态绕过事件总线。

## 6. 派发与提交纪律（A11 实现任务口径）

- 一模块一任务：任务写清 moduleId、模块路径（只写该模块路径）、需求依据（架构/提案/意图地址）、验收标准与证据要求。
- 实现报告回运营（convener）；完成/阻塞先 submit_report；不能解决再报 Chief。
- 证据只写路径 + 内容/frontmatter 要点 + 静态自检结论（读码核对，不运行 shell/node/npm/测试脚本）；执行/验证归 A12。
- 提交只写：`git add <paths>` 与 `git commit -m "<带引号单消息>"`；不得由运营代提交。
- 验收由质检执行，worker 不自行宣告完成。

## 7. 基线（A9 三件小事）

- 团队计划（本文件）→ 应用执行 `git init -b main`（已存在则 no-op；父仓库内会 `baseline-parent-repository-detected` fail-closed）→ `.gitignore` ans 托管块 + baseline commit（仅 `.gitignore`；被跟踪且 dirty ⇒ `baseline-gitignore-dirty`）→ 任务分支 `ans/task/wf-e6a70e9eace7a4f6d16e7ad9`（同 workflow 可复用自有分支；否则 `baseline-branch-exists`）→ dirty 检查。
- 失败按真实 `baseline-*` 码 fail-closed，只回报幕僚，不弹客户卡；修复后以新 operationId 重试。

## 8. 范围与非目标

- 范围：意图 v1 scope 全部功能面（核心循环、玩家、自动战斗、敌人与波次、经验升级三选一、武器道具、UI/HUD、主题）。
- 非目标：无后端/账号/联网/云存档/付费；无复杂剧情、编辑器、资产管线、高精度美术/配音、移动端触屏、音效、多语言、复杂元进度（纳入即需求变更）。
- 客户未决项（入口命名、胜负口径、本地最高分、音效/移动端）按意图默认处理；需客户拍板时由运营按 decision 卡流程处理，不代选。
