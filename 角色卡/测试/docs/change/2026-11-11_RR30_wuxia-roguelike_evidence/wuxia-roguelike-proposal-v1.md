---
schema: project-proposal/v2
flowId: wuxia-roguelike
version: 1
status: draft
intentId: wuxia-roguelike
intent: docs/product/wuxia-roguelike-intent-v1.md
author: rapporteur
---
# 提案：wuxia-roguelike 武侠肉鸽生存（v1）

依据产品意图：`docs/product/wuxia-roguelike-intent-v1.md`（version 1，intentId: `wuxia-roguelike`，客户 intent-confirm / confirm，运营已收口 accepted）。
本提案只描述“怎么做”，不改变意图范围；若发现需要新授权/范围/成本，走需求变更流程，不夹带在提案中。

## 1. 目标

交付一款纯前端静态页的 2D 武侠肉鸽生存小游戏：玩家在武侠场景中移动走位，自动攻击四周敌人，按波次/计时生存，击杀拾取经验升级并从三选一强化中选择，收集武器与道具形成单局构筑；失败或胜利后可立即重开。质量档位为“可玩原型级（prototype-playable）”，双击 `index.html` 离线即可游玩。

## 2. 范围

- 单局核心循环：开始 → 自动攻击清怪 → 波次/计时推进 → 升级强化 → 胜负结算 → 重开。
- 玩家：键盘移动（WASD/方向键）、生命、受伤与无敌帧、死亡判定。
- 自动战斗：自动索敌（最近或范围内）、冷却/范围伤害，无需手动瞄准。
- 敌人与波次：2-3 种敌人，按波次/时间刷新，强度逐波递增；精英为可选。
- 经验与升级：击杀掉落经验、拾取、达到阈值触发升级，提供 2-3 个强化选项并即时生效。
- 武器与道具：至少 1 种武器/道具可经实际玩法获取并使用/生效，支持基础成长或叠加。
- 界面：开始界面、HUD（生命/等级/经验/波次/计时）、升级选择面板、胜负结算与重开。
- 武侠主题：命名、技能名、配色与字体栈最低限度呈现。
- 技术形态：纯前端 HTML/CSS/JS 静态页，无后端、无构建链、无外部 CDN。

非目标沿用意图：无后端/账号/联网、无付费、无复杂剧情/编辑器/资产管线、无高精度美术与配音、无移动端触屏适配、无音效、无多语言、无复杂元进度。

## 3. 技术路线（定稿理由）

### 3.1 运行与装配（硬约束）
- **经典脚本 + IIFE/命名空间**：不使用 `type="module"`。`file://` 下 ES Module 会因 CORS 被浏览器拒绝，直接违反 AC-1。
- **配置为 JS 常量**：不使用运行时 `fetch`/`XHR` 读取本地 JSON（`file://` 下会被拒）。先加载 `game/data/` 的 JS 配置文件并挂到命名空间。
- **无构建链**：不引入 npm/打包器；源文件即运行文件。入口页按固定顺序加载脚本：config → engine → domain → ui → app bootstrap。
- **无外部依赖**：不引 CDN、外部字体/图片/音频；美术用程序化 Canvas 图形 + CSS，字体用系统字体栈。

### 3.2 渲染与界面
- **Canvas 2D 游戏场景 + DOM/CSS 覆盖层**：场景实体逐帧绘制；HUD、开始、升级三选一、结算用 DOM 覆盖层，文本清晰、交互简单、便于武侠排版与可读性验收。
- 画布按 `devicePixelRatio` 缩放，逻辑坐标与渲染坐标分离；`window.blur` 自动暂停。

### 3.3 主循环与状态
- `requestAnimationFrame` + 固定步长累加器（60Hz 逻辑步），`delta` 截断上限（100ms）避免切后台跳帧。
- 状态机：`BOOT → MENU → PLAYING → LEVEL_UP → PAUSED → GAME_OVER | VICTORY`；升级选择期间冻结世界更新；重开回到 `PLAYING`。
- 实体用数组/对象池，主循环内避免分配；碰撞在数百实体量级用 O(n·m) 即可。

### 3.4 胜负与单局节奏
- 以“生存计时 + 波次推进”为主线：达到目标生存时间/波次即胜利，生命归零即失败；具体波次间隔、敌人数与强度曲线由 `config-data` 数值表决定，A8 调参。
- 单局目标 3-5 分钟；平衡深度不作硬验收，但需“能赢也能输”。

## 4. 模块与角色概述

12 个模块、9 个项目角色（含固定 `env-bootstrap`），一模块一属主：

| 模块 | 职责 | 属主角色 |
|---|---|---|
| env-resources | README/本地静态资源（`README.md`、`assets/`） | env-bootstrap |
| entry-index | 入口页与脚本顺序（`index.html`） | env-bootstrap |
| engine-core | Canvas 渲染、输入、数学/碰撞、对象池 | loop-engine |
| loop-app | 固定步长循环、状态机、波次/计时、胜负/重开、事件总线 | loop-engine |
| player | 移动、生命、无敌帧、死亡 | player-combat |
| combat | 自动索敌、冷却/范围伤害、命中反馈 | player-combat |
| enemies | 敌人类型/属性、刷新生成、强度递增 | enemy-systems |
| progression | 经验掉落/拾取、等级阈值、三选一强化 | progression |
| arsenal | 武器/道具获取、使用/叠加与效果 | arsenal |
| ui-hud | 开始/HUD/升级面板/结算（`game/ui/`，含样式） | ui-hud |
| config-data | 数值与文案 JS 常量（`game/data/`） | config-data |
| qa-acceptance | 手工验收清单与回归检查（`qa/`） | qa-verifier（review 候选） |

角色名单与模块拓扑见 `docs/proposals/wuxia-roguelike-roster-v1.md`；模块权威清单见 `docs/proposals/wuxia-roguelike-modules-v1.md`。

## 5. 验收标准映射（AC-1 ~ AC-8）

| AC | 验收要点 | 主要模块 | 验证方式 |
|---|---|---|---|
| AC-1 | 双击入口页可进入游戏，无阻断报错，无需安装/构建/服务器 | entry-index、env-resources | 直接以 `file://` 打开 `index.html`，控制台无阻断错误 |
| AC-2 | 玩家可移动、受伤、死亡；敌人持续出现并构成威胁 | player、enemies | 手动游玩观察移动/受击/死亡与刷怪 |
| AC-3 | 自动攻击无需瞄准即可造成伤害 | combat | 静止不按键观察自动索敌与伤害 |
| AC-4 | 波次推进并有明确胜负结算，可重开再玩 | loop-app、enemies、ui-hud | 完成一局胜/负，点击重开再进 |
| AC-5 | 击杀得经验、升级出 2-3 个强化选项、选择后效果可感知 | progression、enemies、ui-hud | 连续击杀升级并选择强化，对比数值/表现 |
| AC-6 | 至少 1 种武器/道具可经玩法获取并生效 | arsenal、progression | 通过玩法获得并使用/触发效果 |
| AC-7 | HUD 可读：生命、等级/经验、波次/计时 | ui-hud | 目视核对关键信息完整可读 |
| AC-8 | 单局 3-5 分钟完成完整闭环，离线可玩 | loop-app、qa-acceptance | 计时完整游玩一局并重开；离线环境验证 |

## 6. 风险与未决点

1. **`file://` 约束（高）**：ES Module/本地 fetch 会破坏 AC-1，架构已固化为硬约束；验收必须以双击打开实测。
2. **入口页命名**：意图 §9 待客户偏好；本版默认 `index.html`。若客户指定其他入口名，调整 `entry-index` 模块路径与入口文件，属客户可见变更。
3. **胜负口径**：默认“生存计时 + 波次推进”；若客户偏好固定波次全清或首领击破，需在 A6 前确认，可能构成材料性选择。
4. **数值平衡**：初值由 `config-data` 给出，A8 调参；风险是过难/过易，需保证“能赢也能输”。
5. **移动端/触屏、音效**：意图明确为非目标；纳入即属需求变更，不在本提案扩张。
6. **本地最高分**：意图 §9 待确认；若纳入，使用 `localStorage` 并处理 `file://` origin 差异（失败静默降级）。
7. **美术观感**：程序化图形 + CSS 偏原型，符合“可玩即可”；验收口径以功能闭环为主。
8. **浏览器性能**：实体上限、DPR 缩放、后台节流需设上限与自动暂停。

## 7. 交付与验证

- 交付物：`index.html` 及 `game/`、`styles`（并入 `game/ui/`）、`assets/`、`qa/` 下的静态文件与说明。
- 验证：人工按 AC 表逐项走查；`qa/` 提供手工检查清单；不依赖自动化脚本与构建。
- 版本：本文件为 v1；任何材料性变化出新版本，不原地改。
