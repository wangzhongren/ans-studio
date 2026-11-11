# A4 受理/准备记录：snake-game（贪吃蛇游戏）

- schema: rapporteur-intake-record/v1（内部记录，非提案/名单/架构/契约正文）
- flowId: snake-game
- stage: A4（方案受理/准备）
- taskId: t-mwbmvih0-5f1452a9
- 派发者: convener（运营）
- 撰写角色: rapporteur
- 状态: received / prepared（本阶段仅受理与要点识别，不含方案正文）
- 日期: 2026-11-11
- 路径: 路径 A（two-fixed-paths/v1）

## 1. 受理结论

A4 方案阶段受理成立：依据意图版本与客户确认已就位，可进入 A5 方案撰写（由幕僚在 A4 收口后另发 stage-request）。

本阶段**未**产出提案、模块清单、人员名单、架构或契约正文；`docs/proposals/`、`docs/contracts/` 未写入。

## 2. 依据核对（只读）

| 依据 | 地址 | 事实 | 结论 |
|---|---|---|---|
| 产品意图 | `docs/product/snake-game-intent-v1.md` | schema=project-intent/v1；flowId=snake-game；version=1；intentId=snake-classic-play | 已存在，版本 v1，可引用 |
| 意图入口 | `docs/intents/snake-classic-play.md` | intentId=snake-classic-play；flowId=snake-game；含 goal/scope/acceptance/nonGoals/constraints | 已存在；文件名与 intentId 一致 |
| 意图一致性 | 两处 frontmatter | flowId 与 intentId 一致（snake-game / snake-classic-play）；意图内容与入口 scope/acceptance/nonGoals 一致 | 一致 |
| A3 客户确认 | 应用账本事实（派发所述） | customer confirm，状态 committed，decisionId=decision-req-78f56da0e2c989e2 | 按应用/派发事实登记为已就位；策划未独立读取账本，也无自造决定 |
| run pin | `project_state`（只读） | run=none，status=legacy，pinned=none；intent latest=1 | 本 flow 当前无冻结 run；本阶段不涉及 run 择时与版本变更 |

## 3. 意图要点摘要（仅便于 A5 对齐，不改写意图）

- 四项必做：键盘方向键控制、吃食物 +1 分、R 键重开、撞墙即失败。
- 支撑最小范围：食物随机出现在空位、吃到食物蛇身 +1、界面可见区域/蛇/食物/分数。
- 非目标：联网/多人/排行榜；触控；音效；账号与最高分持久化；暂停/难度/加速/关卡；WASD/自定义键位；自撞失败；穿墙。
- 质量档位：可玩级（playable）。
- 验收：AC1–AC5（键盘控制 / 计分 / 重开 / 边界碰撞 / 食物与成长）。
- 运行平台与启动方式：意图明确写为「待应用事实确认」，未锁定。

## 4. A5 前需澄清或需决策的要点（仅识别列点，不展开为方案正文）

1. **运行平台与启动方式**：桌面程序 / 本地浏览器页面 / 终端 TUI 三者未定；依赖与外网可用性未定。属材料性选择，A5 前需经客户确认或由应用事实给出（本阶段不做任何环境探测）。
2. **验收与演示环境**：AC1–AC5 如何被独立观察（人工实操、截图、录屏或自动化断言）；键盘事件的验收载体取决于平台选择。
3. **「可玩级」的可操作化边界**：响应及时、元素可辨、行为稳定的最低判定口径需在架构/验收标准中明确（不扩为美术或性能要求）。
4. **模块划分关注点**（A5 再定，此处仅列关注面）：游戏循环与节拍、蛇与移动/转向状态、食物生成与碰撞、输入事件映射、渲染与分数显示、重开与失败状态机、启动入口与静态资源。
5. **规则细节口径**：180° 反向禁止的执行时机（同帧多次按键如何处理）、初始长度/初始位置/初始速度的取值口径、边界「触碰」判定（进入边界格还是越界）、食物无空位时的处理（与 AC5 相关）。
6. **重开语义**：重开后速度恢复初始值——本期无速度变化项，需明确「恢复初始值」即恒定初始节拍的解读，避免被误读为加速系统。
7. **环境/入口模块归属**：若 A5 采用代码项目，`env-bootstrap` 固定模块（env/entry 类路径）的路径与平台选择强相关，需在模块清单前确认；写作类/纯文档形态是否适用亦需按实际平台判定。
8. **证据形态**：AC 证据以何种 artifact + sidecar 形式提交，P0 证据的生成方式需与平台一致。

## 5. 风险与遗留（本阶段不自行消解）

- **平台未定风险（高）**：平台直接决定技术栈、启动方式、键盘输入实现与验收方式；在 A5 前无结论会显著放大返工。
- **无 run pin（信息性）**：当前 run=none / legacy，pinned=none；A5 及后续阶段不应假定存在冻结 run 或冻结名单。
- **空项目**：无既有仓库、无既有产物、无既有项目角色；名单/模块/架构均需从零建立（属 A5 产物）。
- **验收主观性风险**：可玩级判定若不以可操作方法表述，容易在验收阶段产生分歧。
- **规则歧义风险**：转向禁止、边界触碰、食物生成等细节若不在架构中写死，AC3/AC4 复核会不稳定。
- **环境事实缺口**：按派发约束未做任何 shell/工具链探测；凡平台/依赖/版本类事实一律标注「待应用事实确认」。

## 6. 本阶段边界声明

- 未执行 git 初始化或任何 Git 操作；未探测环境、工具链或版本。
- 未创建团队计划、角色卡、任务或卡；未发起 decision 卡。
- 未写 `docs/product/`、`docs/intents/`、`docs/proposals/`、`docs/contracts/`、`docs/planning/`、角色卡或 `.ans/`。
- 未计算、抄录或要求任何 hash；本记录不含 digest 字段。

## 7. 移交

A4 收口后，由幕僚另发 A5 stage-request；A5 将产出（按序）`docs/proposals/snake-game-proposal-v1.md`、`docs/proposals/snake-game-modules-v1.md`（或等价模块清单）、`docs/proposals/snake-game-roster-v1.md`（含拓扑图）、`docs/contracts/snake-game-architecture-v1.md`。上述均不在本阶段范围。
