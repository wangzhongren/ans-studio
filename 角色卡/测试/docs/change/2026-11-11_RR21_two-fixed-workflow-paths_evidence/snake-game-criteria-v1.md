```ans-criteria
schema: ans-criteria/v1
flowId: snake-game
version: 1
status: final
criteria:
  - id: AC-1
    priority: P0
    title: 四方向控制：方向键上/下/左/右对应移动，180° 反向输入被忽略且不判负
  - id: AC-2
    priority: P0
    title: 实时计分：新局为 0 分，每吃一颗食物 +1，界面分数即时更新
  - id: AC-3
    priority: P0
    title: 边界判负：蛇头到达/越过边界立即结束，蛇停止并呈现结束态
  - id: AC-4
    priority: P0
    title: 重开重置：重开后蛇身回初始位置与长度、分数归零、恢复可操作
  - id: AC-5
    priority: P0
    title: 完整可玩循环：走通移动→吃食物得分→撞边界结束→重开，并可连续多局
```

# snake-game 验收标准 v1（A12a，实施前冻结）

- flowId：`snake-game`
- 版本：v1（本文件为 A12b 复核的唯一冻结依据；实现开始后不原地修改，变更须出新版本）
- 依据（按序）：
  1. `docs/product/snake-game-intent-v1.md`（AC1–AC5 与非目标）
  2. `docs/proposals/snake-game-proposal-v1.md`
  3. `docs/contracts/snake-game-architecture-v1.md`
- 质量档位：功能可玩级 MVP（内部验证/演示档）。判定只看下述五项功能口径，不含发行级音效/美术/性能/兼容性打磨。
- 适用阶段：实现尚未开始；本文件供各实现角色按口径开发，并由 A12b 按冻结标准 + 任务指定的最终完整 OID 复核。

## 0. 通用判定口径与证据规则

- **快照为权威状态**：以 `StateSnapshot = { grid:{w,h}, snake:Cell[], food:Cell, score:number, phase }`（`docs/contracts/snake-game-architecture-v1.md` §2）作为状态判定依据；界面观察作为渲染一致性的补充证据。坐标约定 `[0, w-1] × [0, h-1]`，越界即失败。
- **tick 口径**：固定 tick（约 8–10 次/秒）推进；输入在每个 tick 边界至多消费一次方向变更；一个 tick 内蛇头前进一格。
- **可复现性**：食物随机源可注入（架构 §5 扩展点）。凡涉及食物位置/得分序列的断言，必须注入固定随机源或以夹具固定食物位置，保证脚本可重复运行得到相同结果。
- **证据形式**（每条 AC 至少具备其一，推荐两类同时具备）：
  - 可重复运行的端到端脚本：脚本注入按键/推进 tick，断言快照与界面文本，打印逐 tick 的 `key → direction → head → score → phase` 序列；运行命令与退出码写入日志。
  - 可核对截图/日志：真实运行构建产物，关键节点（初始态、得分瞬间、结束态、重开后）截图或结构化日志，路径写入 `docs/verification/`。
- **证据与环境记录**：关闭 DEBUG 输出；证据文件由应用计算 sha256（验收方不自行转抄）；记录所用构建产物/候选完整 OID、运行命令与环境。
- **非目标不参与判定**：撞自身判负、暂停/继续、随分数加速、穿墙、移动端触摸、音效美术、最高分/存档持久化均不是本标准的通过条件，也不作为失败依据；但实现不得与 AC3 冲突（如穿墙会直接违反 AC3）。

## 1. AC-1 四方向控制（意图 AC1｜承载：input-control、game-state、game-loop）

**判定条件**

1. 在 `phase=running` 且未越界的前提下，按上/下/左/右方向键，使蛇头在下一 tick 按对应方向前进一格：
   - 上 → `head.y - 1`；下 → `head.y + 1`；左 → `head.x - 1`；右 → `head.x + 1`（按项目实际坐标轴实现取等价的四方向正交移动，四个方向互不混淆且各自生效）。
2. **反向抑制**：当前已接受方向为 RIGHT 时按下 LEFT（及 DOWN 时按 UP 的对称情形），方向不改变、蛇头不移动、`phase` 保持 `running`，**不得因此判负或结束**。校验基准是「上一已接受方向」，同一 tick 内多次反向/连续转向输入不得绕过该限制（每 tick 至多接受一次方向变更）。
3. 非反向的合法转向（如 RIGHT → UP）必须在下一个 tick 生效。

**观察点**：`StateSnapshot.snake[0]` 的坐标增量；`StateSnapshot.phase`；`input-control.mapKeyToDirection` 与 `game-state.applyDirection` 的纯函数回执；界面中蛇头实际绘制位置。

**证据形式**：e2e 脚本依次注入四个方向键并断言蛇头坐标增量各对应一格；随后进入 RIGHT 状态注入 LEFT，断言坐标不变、方向不变、`phase=running`；再注入 UP 断言下一 tick 生效；输出逐 tick 序列日志与关键截图。

## 2. AC-2 实时计分（意图 AC2｜承载：scoring、rendering、game-state）

**判定条件**

1. 新开一局 `score === 0`，界面显示的当前分数为 0。
2. 蛇头进入食物格时，`score` 恰好 `+1`（每颗食物固定 +1，不因蛇长/分数变化而改变增量）；同一 tick 内界面显示分数同步更新为最新值（渲染消费同一只读快照，不落后一帧以上）。
3. 未吃到食物的 tick，`score` 不变；吃到食物后由 `scoring.applyFood` 在空闲格生成新食物，且新食物不与蛇身重叠。
4. 连续吃多颗食物时得分为累计值（0 → 1 → 2 → …），无跳变、无重复计分。

**观察点**：`StateSnapshot.score`、`StateSnapshot.food`、界面分数文本；逐 tick 的 score 变化序列。

**证据形式**：e2e 脚本注入固定随机源/固定食物位置，驱动蛇连续吃 ≥2 颗食物，断言 score 依次为 0、1、2，且每次吃食物后的渲染文本与快照一致；日志记录每颗食物的 tick、坐标与 score 变化，附得分瞬间截图。

## 3. AC-3 边界判负（意图 AC3｜承载：collision-boundary、game-state、game-loop）

**判定条件**

1. 每 tick 计算下一格 `nextHead`；当 `nextHead` 超出 `[0, w-1] × [0, h-1]`（`isOutOfBounds(nextHead, grid) === true`）时，本局立即结束：同一 tick 置 `phase=over`，蛇不再前进（不得先画出界一格再结束）。
2. 结束态下后续 tick 蛇身坐标保持不变（推进停止），界面呈现明确可辨识的游戏结束状态。
3. 蛇头位于边界格内（处于 `0` 或 `w-1`/`h-1` 上但未越出）时不判负；只有下一格越界才判负。

**观察点**：`collision-boundary.isOutOfBounds` 纯函数回执（对边界内/边界上/越界三类坐标的布尔值）；`StateSnapshot.phase` 由 `running → over` 的 tick；越界后连续多个 tick 的蛇身坐标快照；界面结束态标识。

**证据形式**：e2e 脚本让蛇朝固定方向持续前进直至越界，断言越界 tick 的 `phase=over`，并断言之后 N（≥3）个 tick 蛇身坐标完全不变；用纯函数单元断言覆盖「边界上不判负、越界一格即判负」；附结束态截图与逐 tick 日志。

## 4. AC-4 重开重置（意图 AC4｜承载：restart-flow、game-state）

**判定条件**

1. 在 `phase=over` 时执行实现定义的重开操作（按键或按钮形式不限，以实际实现为准），进入新一局。
2. 重开后 `snake` 与 `createInitialState().snake` 完全一致（初始位置与初始长度相同），`score === 0`，`phase` 回到可操作初始态（`ready` 或 `running`，以实际实现为准）。
3. 重开后方向输入立即可用：注入方向键后蛇头按规则移动，游戏正常推进；重开不残留上一局的蛇身/分数/结束态。
4. 重开操作在结束态可重复执行（连续多局重开均正确重置）。

**观察点**：重开前后 `StateSnapshot` 的 `snake`/`score`/`phase` 逐字段对比；界面中蛇身与分数显示；重开后首次按键是否生效。

**证据形式**：e2e 脚本制造结束态 → 触发重开 → 断言快照等于初始快照（蛇身坐标数组与分数 0）→ 注入按键断言可移动；连续执行 ≥2 次重开均通过；附重开前后截图与快照对比日志。

## 5. AC-5 完整可玩循环（意图 AC5｜承载：game-loop、restart-flow、e2e-verification、rendering）

**判定条件**

1. 在真实运行环境（加载构建产物、离线本地运行）中，不刷新页面、不重启进程，连续完成 ≥2 整局。
2. 每一局都必须完整走通「移动（含合法转向）→ 吃食物得分（score 实际 +1 且界面即时更新）→ 撞边界结束（呈现结束态、蛇停止）→ 重开（AC4 重置生效）」四个环节。
3. 局间切换不阻断、不报错、无残留状态；每局开始分数为 0，结束时呈现结束态。
4. 两局以上的结果分别留证（不是同一局截取不同片段冒充两局）。

**观察点**：端到端交互序列（按键 → 快照 → 界面）；每局的开始/得分/结束/重开四类节点；页面控制台无阻断性错误。

**证据形式**：可重复运行的 e2e 脚本（或等价的人工驱动 + 逐节点截图/日志）执行 ≥2 局完整循环，打印每局的四类节点与最终状态；每局关键节点截图/日志落 `docs/verification/`，并记录运行命令、构建产物/候选完整 OID 与退出码。

## 6. AC 映射与复核要求

| AC | 意图依据 | 架构承载模块 | 复核方式 |
|----|----------|--------------|----------|
| AC-1 四方向控制 | intent AC1 | input-control、game-state、game-loop | e2e 按键序列 + 纯函数断言 |
| AC-2 实时计分 | intent AC2 | scoring、rendering、game-state | e2e 吃食物序列 + 界面文本断言 |
| AC-3 边界判负 | intent AC3 | collision-boundary、game-state、game-loop | e2e 越界序列 + 纯函数边界断言 |
| AC-4 重开重置 | intent AC4 | restart-flow、game-state | 快照前后对比 + 重开后输入断言 |
| AC-5 完整循环 | intent AC5 | game-loop、restart-flow、rendering、e2e-verification | 真实运行 ≥2 局全链路 e2e |

- A12b 复核只认本文件冻结内容与任务指定的最终完整 OID；候选漂移或实现内容与标准不符时如实判不通过，不降低口径。
- 证据缺失或无法重复运行时，按 insufficient evidence 记录，不代造通过。
