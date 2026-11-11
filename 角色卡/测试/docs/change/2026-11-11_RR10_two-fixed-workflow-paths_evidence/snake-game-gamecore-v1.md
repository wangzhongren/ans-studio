# 契约：贪吃蛇核心接口（snake-game-gamecore-v1）

- flowId：snake-game
- 版本：v1（本文件按 `contract-md/v1` 约定，无 schema 字段；版本由文件名表达；旧版只读）
- 依据：docs/product/snake-game-intent-v1.md、docs/proposals/snake-game-proposal-v1.md、docs/contracts/snake-game-architecture-v1.md
- 适用模块：game-core（提供方）；game-ui、entry-index（消费方）

## 1. 状态结构（只读快照）

```text
state = {
  snake:      [{x: number, y: number}, ...]  // snake[0] 为蛇头
  direction:  "up" | "down" | "left" | "right"
  food:       {x: number, y: number}
  score:      number                          // 非负整数
  status:     "running" | "over"
  finalScore: number | null                   // status=over 时为结束时的分数
}
```

- 坐标原点在棋盘左上，x 向右、y 向下，范围为 `[0, cols-1] × [0, rows-1]`。
- `getState()` 返回快照副本；调用方不得修改内部状态。

## 2. 方法

| 方法 | 语义 | 约定 |
| --- | --- | --- |
| `getState()` | 返回当前状态快照 | 纯读取，无副作用 |
| `tick()` | 推进一步 | status=over 时为空操作；顺序：按当前方向移动蛇头→判断吃食物（加分、增长、重新生成食物）→判断越界/自身碰撞（置 over、记录 finalScore） |
| `setDirection(dir)` | 请求改变下一 tick 方向 | 非四向值忽略；与当前方向相反（180°）忽略；status=over 时忽略 |
| `reset()` | 重开一局 | 分数清零、蛇身回初始长度与位置、随机新食物、status=running、方向回初始方向 |

## 3. 规则常量（v1 采用值）

| 常量 | 值 | 说明 |
| --- | --- | --- |
| cols × rows | 20 × 20 | 棋盘网格 |
| cellPx | 20 | 单元格像素边长（渲染约定） |
| tickMs | 150 | 固定移动间隔（速度固定，不随分数变化） |
| scorePerFood | 1 | 每吃一个食物加 1 分 |
| initialLength | 3 | 初始蛇身长度 |
| initialDirection | "right" | 初始方向 |

## 4. 事件与表现约定

- 成功吃到食物：`score += scorePerFood`，蛇身增长一节，食物重新随机到未被蛇身占用的格子。
- 碰撞：蛇头越过边界或与蛇身任一节重叠 → `status = "over"`，`finalScore = score`，停止推进。
- 结束表现由 ui 层渲染「游戏结束」与最终分数；core 不直接操作 DOM。

## 5. 输入映射

- 方向键 ArrowUp/ArrowDown/ArrowLeft/ArrowRight → up/down/left/right。
- R 键 → ui 调用 `reset()`；重开按钮同样调用 `reset()`。
- 其他按键不映射（本版无暂停、无 WASD）。

## 6. 加载与命名约定

- 经典 script 顺序加载：`src/core/` → `src/ui/` → `src/main.js`；不使用 ES module。
- core 以全局对象 `SnakeCore` 暴露（工厂 `SnakeCore.create(options?)` 或单例，由 main.js 装配），不得依赖 ui 或 DOM。
- 渲染层只读 state；不得在 ui 内复制碰撞/计分/食物生成逻辑。

## 7. 变更规则

- 本契约为 v1 冻结基线；状态结构、方法签名、常量语义变更必须出新版（-v2）并在提案/名单/架构中引用最新版。
- 本版不包含暂停、速度递增、WASD、最高分持久化等意图未确认能力。
