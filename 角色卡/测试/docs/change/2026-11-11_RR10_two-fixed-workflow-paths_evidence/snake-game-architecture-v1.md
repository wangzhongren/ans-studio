---
schema: project-architecture/v1
---

# 架构：贪吃蛇游戏（snake-game）v1

提案：docs/proposals/snake-game-proposal-v1.md
意图：docs/product/snake-game-intent-v1.md
模块清单：docs/proposals/snake-game-modules-v1.md
接口契约：docs/contracts/snake-game-gamecore-v1.md

## 1. 形态与运行方式

- 纯静态单页游戏，工程根 `index.html` 为唯一入口；双击本地打开即可运行。
- 无构建步骤、无第三方依赖、无网络请求；不使用 ES module `import` 与 `fetch`（file:// 下会被拦截），采用经典 `<script>` 顺序加载。
- 验收启动方式以应用提供的只读运行环境事实为准。

## 2. 分层

| 层 | 模块 | 职责 |
| --- | --- | --- |
| 装配层 | entry-index | 入口页面、挂载点、脚本加载顺序、启动装配 |
| 资源层 | env-resources | 本地样式与静态资源，无逻辑 |
| 领域层 | game-core | 状态机、规则判定（移动/成长/食物/碰撞/计分/重开） |
| 表现层 | game-ui | 渲染、HUD、结束提示、重开控件、键盘输入映射 |

## 3. 模块与路径

| 模块 | 路径 | 属主 |
| --- | --- | --- |
| env-resources | assets/、styles/ | env-bootstrap |
| entry-index | index.html、src/main.js | env-bootstrap |
| game-core | src/core/ | game-core-dev |
| game-ui | src/ui/ | game-ui-dev |

路径互不重叠、互不嵌套；源码（index.html、src/、assets/、styles/）与文档（docs/）分离。

## 4. 依赖方向（单向，禁止回指）

```
index.html (entry)
   ├─> styles/、assets/      (env)
   └─> src/core/  ──> src/ui/  ──> src/main.js(装配)
```

- game-ui → game-core：只读状态 + 调用命令。
- game-core 不依赖 game-ui、不接触 DOM、不访问浏览器存储。
- entry-index 仅按顺序加载脚本并初始化，不内联规则逻辑。
- env-resources 不被逻辑代码依赖。

## 5. 公开契约（摘要，详见 gamecore-v1）

- 状态结构：`{ snake: [{x,y}...], food: {x,y}, score: number, status: "running"|"over", direction, finalScore? }`。
- 方法：`getState()`（只读快照）、`tick()`（推进一步并返回是否有事件）、`setDirection(dir)`（非法/反向忽略）、`reset()`（分数清零、蛇身复位、回到 running）。
- 常量：棋盘尺寸（网格行列数）、单一格子像素尺寸、tick 间隔毫秒、每食物分值（+1）。
- 坐标与碰撞：越界即结束；蛇头与蛇身重叠即结束。

## 6. 数据流

1. 页面加载 → main.js 创建 core 实例并绑定 ui 渲染与输入。
2. keydown → ui 调用 `core.setDirection`。
3. 定时器每 tick → `core.tick()` 推进（吃食物加分、增长、判定碰撞与结束）。
4. tick 后 ui 读取 `core.getState()` 全量重绘网格、蛇、食物、分数；结束态渲染提示与重开控件。
5. R 键 / 重开按钮 → `core.reset()` → ui 重绘初始局面。

状态仅存于内存，不落盘、不做跨会话持久化。

## 7. 扩展点（不改变本版范围）

- 渲染实现可在 DOM/CSS 网格与 Canvas 间替换，只要遵守只读状态契约。
- tick 间隔、棋盘尺寸、分值集中为 core 常量，便于后续调参。
- 未来若客户确认暂停/加速/最高分，需经需求变更流程新增契约版本，不在本版实现。

## 8. 验收对应

| 意图验收条目 | 架构落点 |
| --- | --- |
| 键盘可控制方向、固定节奏移动 | ui 输入映射 + core.setDirection + 固定 tick |
| 吃到食物加分并可见 | core.tick 内加 1 分 + ui HUD 重绘 |
| 撞边界结束并提示 | core 越界判定置 over + ui 渲染「游戏结束」与最终分数 |
| 重开重置 | core.reset + ui 重开控件/R 键 |
| 完整流程可重复 | 单页多局，无需刷新；单一内存状态重置 |

## 9. 风险与材料性缺口

- 验收证据方式：无联网无安装前提下，基线为人工游玩 + DOM/代码静态核对 + 应用只读环境事实；自动化截图/录屏证据需另行确认。
- 交付/版本控制：本架构不含 git init、仓库与发布打包（发布打包属非目标）。

## 10. 约束

- 不扩张范围：无暂停、无速度递增、无 WASD、无最高分持久化、无音效美术、无移动端触控。
- 契约变更走版本化：接口或状态结构变化必须出新版契约并在提案/名单中引用最新版本。
