---
schema: project-proposal/v2
flowId: snake-game
version: 1
intentId: snake-game-core
intent: docs/product/snake-game-intent-v1.md
---

# snake-game 提案 v1

> 意图依据：docs/product/snake-game-intent-v1.md（intentId=snake-game-core，v1；A3 客户已确认，decisionId=decision-req-6319dd017faf6311）。
> 配套产物：模块清单 `docs/proposals/snake-game-modules-v1.md`；人员名单与拓扑 `docs/proposals/snake-game-roster-v1.md`；架构契约 `docs/contracts/snake-game-architecture-v1.md`。
> 本提案为 A5 正式产物，供幕僚呈报客户确认；不自批、不代替客户决定。

## 1. 目标

交付一个本地单人可玩的贪吃蛇小游戏（功能可玩级 MVP）：键盘四方向控制且禁止 180° 反向掉头、吃食物固定 +1 并实时显示、蛇头撞边界立即结束、结束后可重开并重置蛇身与分数，能连续重复完成整局循环。

## 2. 范围（本期）

1. **键盘方向控制**：方向键控制上/下/左/右移动；当前向右时按左方向不生效，且不因反向输入判负。
2. **实时计分**：新开一局为 0 分；每吃到一颗食物固定 +1，界面当前分数即时更新。
3. **撞边界判负**：蛇头到达或越过场地边界立即结束，蛇停止移动并呈现明确结束状态。
4. **结束可重开**：结束后执行重开，蛇身回到初始位置与初始长度、分数归零、回到可操作初始态（重开的具体按键/按钮形式由实现决定，不改变验收口径）。
5. **完整可玩循环**：一局内可走通「移动 → 吃食物得分 → 撞边界结束 → 重开再玩」，并可连续重复多局。

## 3. 非目标（本期不做）

联网对战与多人同玩；排行榜、账号体系、社交分享；撞自身判负；暂停/继续；随分数加速与难度递增；穿墙（边界环绕）；移动端触摸操作；音效与美术/皮肤打磨；最高分记录、本地存档与跨会话持久化。

## 4. 模块划分与实施顺序

moduleId 为权威标识；一模块一属主、路径互不重叠；逐项定义见模块清单 `docs/proposals/snake-game-modules-v1.md`。

| moduleId | 名称 | 路径 | 属主角色 | 职责 |
|----------|------|------|----------|------|
| game-state | 游戏状态 | `src/core/state/` | game-core-dev | 蛇身/食物/分数/阶段（ready·running·over）的纯状态模型与转移 |
| collision-boundary | 碰撞与边界判定 | `src/core/collision/` | game-core-dev | 蛇头越界判定、食物吞噬判定（纯函数，无 I/O） |
| scoring | 计分 | `src/core/scoring/` | game-core-dev | 每颗食物 +1 的计分规则与食物再生成 |
| input-control | 输入控制 | `src/input/` | input-ui-dev | 键盘四方向映射为 Direction 命令，抑制 180° 反向 |
| rendering | 渲染 | `src/render/` | input-ui-dev | 只读 StateSnapshot 绘制场地/蛇/食物/分数/结束态 |
| game-loop | 主循环 | `src/loop/` | runtime-dev | 固定 tick 推进、输入缓冲、阶段切换（运行→结束） |
| restart-flow | 重开流程 | `src/restart/` | runtime-dev | 结束态触发重开，调用 reset 回到初始可玩态 |
| e2e-verification | 端到端验证 | `test/` | qa-verifier | 覆盖 AC1–AC5 的端到端脚本与夹具 |
| env-resources | 环境资源 | `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html` | env-bootstrap | 构建/运行配置与静态宿主页（无业务逻辑） |
| entry-index | 入口装配 | `src/main.ts` | env-bootstrap | 应用入口：装配 core/loop/input/render，只接线不实现业务 |

实施顺序（依赖驱动）：

1. **env-bootstrap**：搭建构建配置、静态宿主页与应用入口骨架（env-resources、entry-index）。
2. **game-core-dev**：先落 core 契约与纯逻辑（game-state、collision-boundary、scoring）。
3. **runtime-dev**：主循环与重开编排消费 core（game-loop、restart-flow）。
4. **input-ui-dev**：输入映射为 Direction 命令、渲染消费只读快照（input-control、rendering）。
5. **qa-verifier**：集成后跑 AC1–AC5 端到端验证（e2e-verification）。

## 5. 技术方向（方向级，非最终定稿）

推荐浏览器 + TypeScript + HTML5 Canvas，Vite 构建，纯本地离线运行：键盘事件原生支持；Canvas 网格绘制简单；构建产物可离线打开；core 纯函数可无头测试。运行时采用固定 tick（约 8–10 次/秒）与 requestAnimationFrame 渲染解耦；输入在每个 tick 边界至多接受一次方向变更，并以「上一已接受方向」做反向校验，防止同 tick 内连续转向绕过 180° 限制。备选：终端 Python+curses（依赖最少但跨平台输入与自动化更麻烦）；Electron/Tauri 桌面打包（MVP 不需要，成本偏高）。

## 6. 验收口径映射（详见意图 AC1–AC5）

| AC | 判定要点 | 主要承载模块 |
|----|----------|--------------|
| AC1 四方向控制 | 四个方向键各自生效；反向输入被忽略且不判负 | input-control、game-state |
| AC2 实时计分 | 初始 0；每颗食物 +1；显示即时更新 | scoring、rendering |
| AC3 边界判负 | 蛇头到达/越过边界立即结束并停止移动 | collision-boundary、game-state、game-loop |
| AC4 重开重置 | 蛇身回初始位置/长度、分数归零、回到可操作态 | restart-flow、game-state |
| AC5 完整循环 | 走通移动→得分→结束→重开并可连续多局 | game-loop、restart-flow、e2e-verification |

## 7. 质量档位与交付边界

本期为功能可玩级 MVP（内部验证/演示档）：以四项核心要素正确、可连续游玩为准；不含正式发行级的音效、美术、性能与兼容性打磨。若需发行级体验，须经意图新版本与需求变更另行约定。

## 8. 待定项（不改变验收口径，A5 后由实现或在治理通道确定）

- 键位集合：仅方向键，还是同时支持 WASD。
- 重开触发形式：按键（如 Space/Enter）或界面按钮。
- 网格尺寸、初始蛇长、tick 速度（影响体验与测试参数）。
- 验收证据方式（自动化 e2e 与人工演示的取舍）属材料性选择，如出现须走治理 decision 卡，不在本提案自行决定。
