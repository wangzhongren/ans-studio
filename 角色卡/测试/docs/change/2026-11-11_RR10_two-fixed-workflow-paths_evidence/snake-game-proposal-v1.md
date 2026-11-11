---
schema: project-proposal/v2
flowId: snake-game
version: 1
author: rapporteur
status: draft
intentId: snake-game
intent: docs/product/snake-game-intent-v1.md
---

# 提案：贪吃蛇游戏（snake-game）v1

## 1. 依据

- 产品意图 v1：docs/product/snake-game-intent-v1.md（schema project-intent/v1，version 1；客户意图确认已 committed，decisionId decision-req-2edb575e858d7c3d）。
- 意图入口：docs/intents/snake-game.md（intentId: snake-game，与意图文档一致）。
- 本提案严格承接上述意图，不新增、不缩小范围；意图第 7 节 8 项「本版假设」按客户确认结果作为实现与验收基线。

## 2. 目标（承接意图）

交付一个可玩的单机贪吃蛇游戏：键盘控制四向移动、吃到食物计分、撞边界结束并可重开一局。以浏览器网页形态本地打开即可游玩，无需联网与安装。

## 3. 范围与非目标（与意图 v1 一致）

### 3.1 范围

- 贪吃蛇核心玩法：蛇的移动与成长、食物生成与吃掉判定。
- 键盘控制移动方向。
- 计分：吃到食物加分并在界面显示、累计。
- 边界碰撞：撞边界触发的游戏结束判定与提示（撞到自身同样结束）。
- 重开：游戏结束后重置分数与蛇身为新一局。

### 3.2 非目标

联网/多人对战、在线排行榜与账号系统、多关卡/难度选择、音效与美术素材、移动端触控、发布打包与分发渠道、跨会话持久化最高分。

## 4. 已确认假设的落地值

| 假设 | 确认值 | 本提案落地方式 |
| --- | --- | --- |
| 平台与运行 | 浏览器网页、本地打开、无需联网安装 | 纯静态单页，双击 `index.html` 即运行；无构建、无依赖、无网络请求 |
| 键盘控制 | 方向键四向、禁 180° 掉头、速度固定、无暂停 | keydown 方向键映射为方向命令；反向输入被忽略；固定 tick 定时推进 |
| 计分 | 每食物 +1 分、仅显示当前分 | core 内累加；界面仅渲染当前分数 |
| 重开 | 结束后 R 键或「重开」按钮；分数清零、蛇身重置、立即开始 | 结束态显示提示与重开控件；两种触发均调用 core.reset() |
| 边界碰撞 | 蛇头碰边界立即结束并显示「游戏结束」+最终分数；撞自身同样结束 | core 判定边界与自身碰撞，置结束态并携带最终分数 |
| 开始/结束流程 | 无独立开始界面、无生命值 | 页面加载即初始化并开始；结束仅显示简单提示 |
| 最高分 | 不做跨会话持久化 | 不使用 localStorage/IndexedDB；关闭即失 |
| 运行环境 | 以应用提供的只读运行环境事实为准 | 不自行探测环境；验收启动方式按应用事实 |

## 5. 方案要点

- **形态**：纯静态单页游戏，工程根 `index.html` 作为唯一入口。
- **技术路线**：HTML + CSS + 原生 JavaScript；采用经典 `<script>` 顺序加载，**不使用 ES module `import` 与 `fetch`**（file:// 协议下会被拦截），确保本地双击可运行；零依赖、零构建。
- **渲染**：DOM/CSS 网格绘制棋盘、蛇与食物，分数 HUD 与结束提示用普通 DOM，行为与状态更易静态核对。
- **时钟**：固定 tick（常量定义为移动间隔毫秒数），tick 内推进一步并按顺序判定吃食物→增长→碰撞→结束。
- **输入**：方向键四向；与当前方向相反的输入被忽略；R 键与「重开」按钮触发重开；页面加载后保证键盘焦点。
- **状态**：单一内存状态对象（蛇身数组、食物坐标、分数、进行/结束状态），不落盘。

## 6. 模块与属主（详见 docs/proposals/snake-game-modules-v1.md）

| 模块 id | 名称 | 类别 | 路径 | 属主 |
| --- | --- | --- | --- | --- |
| env-resources | 环境与静态资源 | env | assets/、styles/ | env-bootstrap |
| entry-index | 入口与装配 | entry | index.html、src/main.js | env-bootstrap |
| game-core | 玩法核心 | core | src/core/ | game-core-dev |
| game-ui | 界面渲染与输入 | ui | src/ui/ | game-ui-dev |

依赖方向：game-ui 单向依赖 game-core；game-core 不依赖任何界面/输入代码；entry-index 仅做装配与加载顺序；env-resources 只提供本地静态资源。

## 7. 人员名单与依赖（详见 docs/proposals/snake-game-roster-v1.md）

- env-bootstrap（装配入口）：先定入口页面、加载顺序与静态资源骨架。
- game-core-dev（玩法核心）：按接口契约实现状态机、碰撞与计分。
- game-ui-dev（界面与交互）：按契约只读状态渲染并映射输入，调用 core 重开。
- 推荐任命顺序即名单顺序：env-bootstrap → game-core-dev → game-ui-dev；core 与 ui 可在契约冻结后并行，最后由 env-bootstrap 装配核对。

## 8. 契约与文档

- 架构：docs/contracts/snake-game-architecture-v1.md（分层、模块、依赖方向、公开契约、数据流、扩展点、验收对应）。
- 接口契约：docs/contracts/snake-game-gamecore-v1.md（core 状态结构、API、常量与输入映射）。
- 模块清单：docs/proposals/snake-game-modules-v1.md。
- 人员名单与拓扑：docs/proposals/snake-game-roster-v1.md。

## 9. 验收对应（意图 5 条 → 可核对）

1. 键盘可控制移动方向、固定节奏持续移动 → 方向键输入改变下一 tick 方向；反向被忽略。
2. 吃到食物分数增加并可见 → 分数 HUD 每吃一个食物 +1 并重绘。
3. 蛇头撞边界结束并显示结束提示 → 结束态渲染「游戏结束」与最终分数。
4. 结束后可重开、分数清零蛇身复位 → R 键/按钮调用 reset() 后回到初始长度、位置与 0 分。
5. 完整流程可重复 → 单页内可连续进行多局，无需刷新。

## 10. 风险与待确认（材料性，不由策划单方决定）

- **验收证据方式**：在「无联网无安装」前提下，若无现成自动化工具，基线为人工可重复游玩 + DOM/代码静态核对 + 应用只读环境事实；若客户要求自动化截图/录屏证据，涉及额外工具/成本，需另行确认。
- **交付与版本控制归属**：本提案不包含 git init、仓库初始化与发布打包（发布打包属非目标）；后续交付形态需另行确认。

## 11. 不扩张声明

本提案未包含暂停、速度随分数加快、WASD 键位、最高分持久化、音效美术、移动端触控等意图未确认的功能；如客户需要，应按需求变更流程另行确认，不并入本版。
