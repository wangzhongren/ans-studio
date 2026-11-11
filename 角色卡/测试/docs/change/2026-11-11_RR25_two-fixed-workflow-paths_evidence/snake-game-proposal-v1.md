---
schema: project-proposal/v2
flowId: snake-game
version: 1
intentId: snake-game
intent: docs/product/snake-game-intent-v1.md
author: rapporteur
status: draft
---

# 提案：贪吃蛇小游戏（snake-game）v1

本提案遵循 `schema: project-proposal/v2`，依据产品意图 `docs/product/snake-game-intent-v1.md`（version 1，intentId=snake-game）编制；意图入口为 `docs/intents/snake-game.md`。

## 1. 客户意图摘要

客户原话：「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）。」

四项功能验收：

1. 键盘控制：方向键/WASD 在下一移动节拍生效；180° 反向输入被忽略，不造成自杀式掉头。
2. 计分：初始分数 0 且界面可见；吃到食物加分并同步显示；未吃到食物分数不变。
3. 重开：结束后可通过约定方式重开，蛇、食物、分数全部复位（分数归 0）。
4. 边界碰撞：蛇头越过棋盘边界即结束，停止移动并显示结束状态；结束后方向输入不改变状态（重开除外）。

## 2. 目标与范围（MVP）

单机、纯前端小游戏，无后端、无网络请求：固定 20×20 棋盘，蛇按固定节拍自动前进，食物随机生成于空单元格，吃到后蛇身增长并加 10 分，界面实时显示分数，撞墙即结束，结束后可重开。

## 3. 非目标

多人联机；账号/登录/排行榜；分数/最高分持久化（含 localStorage）；移动端/触屏适配；音效、皮肤、关卡、难度、暂停；随分数加速等额外玩法。

## 4. 技术路线

- 原生 HTML/CSS/JavaScript，canvas 2D 栅格渲染；不引入框架、构建工具与第三方依赖。
- 采用 classic script + 全局命名空间（`window.SnakeCore` / `window.SnakeUI`），双击 `index.html` 即可离线运行，**无需本地服务器或外部服务**（规避 ES module 在 file:// 下被浏览器拦截）。
- 关键参数：棋盘 20×20、单元格 20px（画布 400×400）、节拍 150ms、初始蛇长 3、每食物 +10 分、方向队列最多缓存 2 个输入；不随分数加速。
- 口径：撞墙即结束（不穿墙）；自撞即结束（意图未列为独立验收项，但绝不实现为「穿过自身」）；重开方式为结束界面上的「重新开始」按钮（按键/按钮择一，选按钮）。

## 5. 模块划分

详见模块清单 `docs/proposals/snake-game-modules-v1.md`：

| 模块 id | 路径 | 职责 | 属主 |
| --- | --- | --- | --- |
| game-core | src/core/ | 状态机与规则：蛇身/食物/分数/方向队列/边界与自撞判定，纯逻辑不碰 DOM | game-core-dev |
| game-ui | src/ui/ | canvas 渲染、键盘事件、分数与结束态显示、重开按钮、页面装配 | game-ui-dev |
| app-entry | index.html | 页面骨架与脚本加载顺序、启动装配 | app-integrator |
| acceptance-record | docs/acceptance/ | 四项验收的演示记录与截图证据归档 | qa-reviewer（验收角色） |

依赖方向：app-entry → game-ui → game-core；game-core 不依赖任何上层，也不触碰 DOM。

## 6. 交付与验收方式

实现角色按各自模块路径交付可运行页面；验收角色 qa-reviewer 在浏览器中按四项验收逐条演示并记录（操作步骤 + 截图），证据归集到 `docs/acceptance/`；不依赖自动化工具，也不要求环境探测。

## 7. 版本链

- 意图：`docs/product/snake-game-intent-v1.md`（v1）
- 本提案：`docs/proposals/snake-game-proposal-v1.md`（v1）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（v1）
- 名单：`docs/proposals/snake-game-roster-v1.md`（v1）
- 架构：`docs/contracts/snake-game-architecture-v1.md`（v1）
