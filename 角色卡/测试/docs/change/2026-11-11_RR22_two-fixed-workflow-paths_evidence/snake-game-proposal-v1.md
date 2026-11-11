---
schema: project-proposal/v2
flowId: snake-game
version: 1
intentId: snake-game-core
intent: docs/product/snake-game-intent-v1.md
---
# 提案：贪吃蛇游戏（snake-game）

## 1. 意图依据

- 产品意图：`docs/product/snake-game-intent-v1.md`（version 1）。
- 意图入口：`docs/intents/snake-game-core.md`。
- `intentId: snake-game-core` 自产品意图 frontmatter 原样复制（与 flowId `snake-game` 不同）。
- 本提案为路径 A 新建功能包的首版方案（legacy/无 run，首建 v1 文档链）：方案 v1、模块 v1、名单 v1、架构 v1。

## 2. 目标与范围

交付一个桌面浏览器单页贪吃蛇：打开页面即可游玩；方向键/WASD 控制（含输入缓冲与禁止反向）；固定 +10 分与最高分本地持久化；Space 暂停/继续；撞墙或自撞立即结束并展示原因与分数；R 键/按钮重开且保留最高分。范围与默认值严格按意图第 4 节与第 8 节，非目标按意图第 5 节排除（联机、移动端、音效美术、账号/后端、障碍关卡、速度递增、暂停跨会话恢复）。

## 3. 技术栈决策

- **零依赖原生 HTML/CSS/JS**：不引入第三方库、包管理器或构建工具，无网络请求、无后端。
- **经典脚本（非 ES module）**：`index.html` 以普通 `<script>` 按顺序加载脚本，代码以 IIFE/命名空间组织。这样可直接双击 `index.html`（file://）打开游玩，规避 ES module 在 file:// 下被 CORS 拦截的问题——这是满足意图「打开即玩、无需安装」的关键决策。
- **渲染**：Canvas 2D 绘制棋盘/蛇/食物；DOM 负责分数、最高分、暂停提示与结束层。
- **主循环**：固定 tick（150ms），暂停时不推进；不实现难度递增。
- **测试**：不强制自动化测试（意图质量档位为可玩原型，以第 6 节 11 条手动步骤为达标口径）；README 提供手动核对清单；如后续补充纯逻辑自检，不改变本方案契约。

## 4. 模块划分

模块唯一权威源：`docs/proposals/snake-game-modules-v1.md`。

| 模块 id | category | 路径 | 属主角色 | 摘要 |
| --- | --- | --- | --- | --- |
| game-rules | core | `src/core/` | game-engine-dev | 规则状态机：移动、食物、计分、碰撞、相位、重开、方向队列/禁止反向 |
| renderer | ui | `src/ui/` | frontend-dev | Canvas 与 HUD/暂停/结束层，只读状态快照 |
| input-control | input | `src/input/` | game-engine-dev | 方向键/WASD/Space/R 与重开按钮的键位映射，无状态 |
| score-storage | data | `src/score/` | game-engine-dev | localStorage 最高分读写与异常回落 |
| env-resources | env | `src/main.js`、`README.md` | env-bootstrap | 装配、脚本加载顺序、本地打开说明 |
| entry-index | entry | `index.html` | env-bootstrap | 页面骨架与 DOM 挂载点 |

划分理由：规则与渲染分离便于按状态迁移核验；输入层只做键位映射，方向队列与反向裁决集中在 game-rules 保证单一事实源；持久化独立成层，异常回落集中；env/entry 固定模块由环境装配角色统一启动顺序。详见模块文档第 2 节。

## 5. 角色名单

名单权威源：`docs/proposals/snake-game-roster-v1.md`（含「人员+模块拓扑图」）。

| 角色 id | 模块 | 职责摘要 | 必需能力 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | 页面入口、脚本加载顺序、装配与本地直接打开说明 | HTML/静态资源装配 |
| game-engine-dev | game-rules、input-control、score-storage | 规则状态机、输入映射、最高分持久化 | 原生 JavaScript、状态机与事件处理 |
| frontend-dev | renderer | Canvas 与 HUD/暂停/结束层渲染 | 原生 JavaScript、Canvas 2D、DOM/CSS |

`publicContract` 一律为非空字符串；`topology.management` 为包含 convener 与全部项目角色的扁平数组：`[convener, env-bootstrap, game-engine-dev, frontend-dev]`。

## 6. 验收映射（意图第 6 节 11 条）

| # | 验收步骤（意图第 6 节） | 负责模块 | 属主角色 |
| --- | --- | --- | --- |
| 1 | 打开页面：棋盘、分数 0、最高分、初始 3 节蛇与 1 食物可见，处于「待开始」 | entry-index、env-resources、game-rules、score-storage、renderer | env-bootstrap、game-engine-dev、frontend-dev |
| 2 | 按 → 向右移动；再按 ↑ 下一格转向向上，不出现反向 | input-control、game-rules、renderer | game-engine-dev、frontend-dev |
| 3 | 吃到食物：分数 +10、蛇身 +1、界面同步、食物立即在合法空格重生 | game-rules、renderer | game-engine-dev、frontend-dev |
| 4 | 向右时按 ←：方向不变、不自杀 | game-rules（仅方向裁决，input-control 转发） | game-engine-dev |
| 5 | 快速连按「↑ 再 ←」：按顺序执行、不丢失 | input-control、game-rules | game-engine-dev |
| 6 | Space：停止并显示「已暂停」；再按恢复 | input-control、game-rules、renderer | game-engine-dev、frontend-dev |
| 7 | 撞墙：立即结束，显示「游戏结束」、原因「撞墙」、本局分数与最高分 | game-rules、renderer（结束时 score-storage 结算） | game-engine-dev、frontend-dev |
| 8 | 长蛇自撞：立即结束，原因「撞到自己」 | game-rules、renderer | game-engine-dev、frontend-dev |
| 9 | 刷新页面：最高分仍正确显示 | score-storage、env-resources、entry-index | game-engine-dev、env-bootstrap |
| 10 | R/按钮重开：分数归零、蛇与食物重置、最高分保留、回到待开始，按键可再开始 | input-control、game-rules、renderer | game-engine-dev、frontend-dev |
| 11 | 重开后打出更高分：最高分即时更新并显示 | game-rules（结算）、score-storage（持久化）、renderer（展示） | game-engine-dev、frontend-dev |

全部 11 条逐条手动复现通过为本版达标口径；最高分以「刷新后仍保留」为准。

## 7. 交付物

- 治理文档：本提案、`docs/proposals/snake-game-modules-v1.md`、`docs/proposals/snake-game-roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md`。
- 实现（A6 起，由对应角色完成）：`index.html`、`src/main.js`、`src/core/`、`src/input/`、`src/ui/`、`src/score/`、`README.md`。

## 8. 不做事项（本版边界）

不写代码（本阶段仅方案）；不写角色卡、不招人、不做团队计划、不初始化 Git、不代发方案卡。技术上不做构建工具、第三方依赖、ES module 方案、后端/网络、账号与云存档、移动端适配、音效美术、速度递增。

## 9. 版本引用

- 意图：`docs/product/snake-game-intent-v1.md`
- 模块：`docs/proposals/snake-game-modules-v1.md`
- 名单：`docs/proposals/snake-game-roster-v1.md`
- 架构与契约：`docs/contracts/snake-game-architecture-v1.md`
