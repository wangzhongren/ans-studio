---
schema: project-proposal/v2
flowId: snake-game
version: 1
intentId: snake-game
intent: docs/product/snake-game-intent-v1.md
author: rapporteur
status: draft
---

# 提案：贪吃蛇游戏（v1）

- 产品依据（intent）：docs/product/snake-game-intent-v1.md（version 1，intentId: snake-game）
- 意图入口：docs/intents/snake-game.md
- 客户原话：「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）」

## 1. 目标与范围

交付一个**单机、单局可玩**的贪吃蛇：玩家用键盘方向键控制蛇在场地内移动，吃食物得分并实时显示分数；提供明确的重开入口；蛇头撞到场地边界即结束本局，不存在穿墙。

- 形态：零依赖静态网页（HTML + CSS + 原生 JavaScript），双击 `index.html` 即可直接运行，无需构建工具、无需本地服务器、无需联网。
- 四项必须能力为硬性范围：不裁剪、不加码。
- 非目标（客户未提出，明确不做）：联网/在线排行榜、音效与背景音乐、移动端触控操作、关卡系统、皮肤/主题、账号系统、多人模式。
- 说明：意图未要求「自撞结束」判定，本提案不引入自撞规则（避免加码）；边界碰撞是唯一的碰撞结束条件。

## 2. 四项能力与验收映射

| # | 能力 | 实现要点 | 验收方式（对应意图 acceptance 1–4） |
|---|------|----------|--------------------------------------|
| 1 | 键盘方向控制 | 监听方向键（↑↓←→），阻止页面滚动，方向输入即时作用于蛇的下一步移动；不允许 180° 反向 | 分别按四个方向键，蛇向对应方向移动；反向输入被忽略而非导致立即撞死 |
| 2 | 计分 | 蛇头进入食物格即吃掉食物：蛇身增长 1 节、分数 +1，界面实时显示当前分数 | 连续吃若干食物，分数按进食次数正确累加并可见 |
| 3 | 重开 | 页面提供明确的重开按钮；点击后蛇、分数、食物、方向与状态全部重置为新一局 | 游戏进行中和结束后各点击一次重开，状态完整归零并可继续玩 |
| 4 | 边界碰撞 | 每次移动前计算蛇头下一格坐标；若超出场地网格范围（上/下/左/右任一侧）即判定碰撞，本局结束（状态置为结束并提示），绝不环绕/穿墙 | 向四个边界分别撞一次，均立即结束本局，无穿墙 |

- 第 5 项总体验收：四项能力在同一局游戏中同时成立、互不冲突，形成「开始 → 移动 → 进食计分 → 撞边界结束 → 重开」的完整可玩闭环。

## 3. 形态与关键设计决定

- 采用**经典 `<script>` 按序加载**（非 ES module），保证 `file://` 直接双击打开即可运行（ES module 在 `file://` 下会被浏览器拦截）。
- 渲染采用 Canvas 2D 绘制场地、蛇与食物；分数与状态用页面 DOM 文本实时更新；重开为页面按钮。
- 场地为固定网格（20×20，格子 24px），游戏循环用固定间隔定时器驱动，逻辑与渲染分离，保证计分与碰撞判定确定性。

## 4. 模块划分与人员分工

模块清单（唯一权威源）：`docs/proposals/snake-game-modules-v1.md`；人员名单：`docs/proposals/snake-game-roster-v1.md`。

| 模块 | 类别 | 路径 | 属主角色 |
|------|------|------|----------|
| entry-index | entry | `index.html` | env-bootstrap |
| env-resources | env | `styles/` | env-bootstrap |
| game-core | core | `src/game/` | game-implementer |
| input-control | input | `src/input/` | game-implementer |
| render-ui | ui | `src/render/` | game-implementer |
| app-bootstrap | app | `src/app/` | game-implementer |

- 最小角色集：`env-bootstrap`（入口页面与页面外壳样式/资源装配）+ `game-implementer`（核心逻辑、输入、渲染与启动编排）。每个模块恰有一个属主。

## 5. 架构与契约

版本化架构与契约文档：`docs/contracts/snake-game-architecture-v1.md`（schema: project-architecture/v1）。其中定义分层、模块属主与文件路径、依赖方向、公开契约（`window.SnakeCore` / `window.KeyboardInput` / `window.Renderer` / 启动编排）、DOM 契约、数据流与验收步骤。

## 6. 质量档位与验证方式

- 质量档位：可玩演示级（Playable Demo）——以四项能力正确可用、单局流程完整闭环为准，不追求美术精细度与性能调优。
- 验证：按第 2 节验收表逐项手动操作验证；四项能力同局联动验证；由独立验收角色（Verifier）执行验收，证据以运行结果与截图/记录为准。

## 7. 风险与开放问题

- 无构建工具与依赖管理：通过经典脚本与零依赖规避；所有资源相对路径引用，保证任意目录下双击可运行。
- 场地尺寸、tick 间隔（如 140ms）、每食物加分（+1）等数值为可玩演示的合理默认，不改变四项能力语义；如需调整属实现内参数，需保持验收标准不变。
- 无开放问题需要客户补充决策；范围与意图一致，无新增授权需求。
