# snake-game A4 受理/准备记录 v1（只读准备）

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 阶段：A4 受理/准备（只读；本文件不构成提案，不含方案正文）
- 受理来源：运营任务 `#t-mwbn3du5-b8fc5fbf`（from convener，stage=A4）
- 依据：`docs/workflow.md`、`docs/product/snake-game-intent-v1.md`、
  `docs/intents/snake-game-playable-intent.md`、`docs/governance/convener/snake-game-a1-intake-v1.md`

## 一、意图审阅结论

**结论：意图 v1 口径无歧义、AC1–AC4 可独立实测判定；可在 A5 直接据其出提案，不需要意图升版。**

### 1.1 合法性与一致性（只读核对）

- 产品意图 `docs/product/snake-game-intent-v1.md`：`schema: project-intent/v1`、`flowId: snake-game`、`version: 1`、`intentId: snake-game-playable-intent`，与文件名一致。
- 意图入口 `docs/intents/snake-game-playable-intent.md`：`intentId`/`flowId` 与产品意图一致；`goal`/`scope`/`acceptance` 均非空；入口正文与产品意图 v1 的 AC1–AC4、non-goals 无实质冲突（入口为压缩转述，键位“方向键为必需、WASD 可选附加”与产品意图一致）。
- 三处 `intentId`（产品意图 frontmatter、意图入口文件名、意图入口 frontmatter）一致；提案 frontmatter 应原样复制 `snake-game-playable-intent`。
- A3 客户已确认意图 v1（本任务派发口径），A4 不重复确认、不改意图。

### 1.2 验收可判定性

| 条目 | 实测判据 | 可判定 | 备注（A5 契约需固定，非改意图） |
| --- | --- | --- | --- |
| AC1 键盘控制 | 开局后按方向键，蛇按对应方向持续移动；180° 反向输入不改变走向 | 是 | 需固定初始蛇长（≥2 条可区分“反向”）、节拍与移动为按格步进 |
| AC2 计分 | 初始 0；蛇头与食物重合 → 食物消失、分数 +1、蛇身增长、显示实时更新 | 是 | 需固定食物吃完后立即在同局重生、且不与蛇身重叠 |
| AC3 重开 | 结束后显示最终分数与重开入口；重开后分数 0、蛇复位、食物重生成、可立即操作 | 是 | 需固定重开触发方式（按钮/按键）与输入状态复位 |
| AC4 边界碰撞 | 蛇头下一格越出网格即 game over；不穿墙、不阻止移动；结束后不可再移动 | 是 | 需固定网格尺寸与“越界”的坐标语义（下一格在 [0,cols)×[0,rows) 之外即结束） |

**审阅裁定**：四项验收均可由验收人用现代桌面浏览器直接打开入口页面逐条实测；无“撞墙是结束还是阻止”类歧义。剩余待定项属于实现参数与交互细节，应由 A5 提案/架构/契约固定并写明，**不构成意图 v2 的理由**。

## 二、后续阶段待产出文件清单（供 A5 及后续直接使用）

> 说明：按 `docs/workflow.md`，提案/模块属 A4 产出，名单/拓扑属 A7，架构与契约服务于提案与跨角色实现；团队计划属 A5（convener，`team-plan/v3` → `docs/scheduling/snake-game-team-v1.md`），不在策划产物内。以下为本角色后续应产出的文件。

| 顺序 | 文件（项目相对路径） | 格式 | 关键约束 |
| --- | --- | --- | --- |
| 1 | `docs/proposals/snake-game-proposal-v1.md` | `project-proposal/v2` | frontmatter：`schema`、`flowId: snake-game`、`version: 1`、`intent: docs/product/snake-game-intent-v1.md`、`intentId: snake-game-playable-intent`、`status: draft`；正文必须含意图路径字面量 `docs/product/snake-game-intent-v1.md` |
| 2 | `docs/proposals/snake-game-modules-v1.md` | `project-modules/v2` | 1–12 个模块；每项 `id`（小写 slug）/`name`/`purpose`/`category`/`path`（尾 `/`=目录）/`publicContract`（非空字符串，不能写 true/false）/`architectureSource`；模块路径互不重叠、不嵌套；不得落在治理写区；`env`/`entry` 类别仅归 `env-bootstrap` |
| 3 | `docs/contracts/snake-game-architecture-v1.md` | `project-architecture/v1` | 正文必须含提案路径字面量 `docs/proposals/snake-game-proposal-v1.md`；内容覆盖分层/模块/依赖方向/公开契约/数据流/扩展点 |
| 4 | `docs/contracts/snake-game-contract-v1.md` | `contract-md/v1` | 无 `schema` 字段，版本由文件名 `-vN` 表达；冻结跨角色接口：状态机、输入/渲染边界、计分与重开语义、模块 API、验收证据约定 |
| 5 | `docs/proposals/snake-game-roster-v1.md` | `project-roster/v3` | frontmatter 的 `intent`/`proposal`/`architecture`（可选 `modulesDoc`）均须指向各自**最新版**；`modules[]` 为模块清单的**派生快照**并逐项一致；`roles[]` 1–12 项，每项 `id`/`displayName`/`purpose`/`capability`/`modules[]`；每模块恰一属主、每角色至少绑定一模块；角色 id 不得用内置 id；`env-bootstrap` 默认须含（固定模块 `env-resources`=env、`entry-index`=entry），小项目省略须写 `envBootstrap: {omitted: true, omissionReason: <非空>}` 且不得再含 env/entry 模块；正文必须有「人员+模块拓扑图」章节与 ```topology 块（`project-topology/v2`），`management` 为含 convener 与全部项目角色 id 的扁平数组，且与 frontmatter 完全一致 |
| 6 | `docs/governance/rapporteur/snake-game-a4-intake-v1.md` | 治理记录（本文件） | 只读准备记录 |

**产出顺序依赖**：意图（已有 v1）→ 模块清单 + 提案 → 架构 → 契约 → 名单/拓扑（名单加载要求架构存在且为最新，故架构必须先于名单）。

## 三、方案要点（供 A5 起草判断，不在本文件定稿）

1. **运行形态**：单页静态网页，`index.html` 直接双击可玩；禁止依赖构建、后端、联网与外部素材；不得使用 `fetch`/ES module 网络加载。
2. **分层建议**（写入架构文档）：输入层（方向键 → 方向意图，拦截 180° 反向）→ 核心逻辑层（网格坐标、tick 步进、吃食物/计分/增长、越界判定、游戏状态机 `ready/playing/over`）→ 渲染层（游戏区域、分数、结束提示、重开入口）；三层单向依赖，核心逻辑不直接操作 DOM。
3. **状态机**：`playing` 时按固定 tick 前进；蛇头下一格越界 → 立即 `over`，停止 tick 并禁用方向输入；重开 → 复位分数=0、蛇复位初始位置与长度、食物重生成、输入方向复位、进入 `playing`。
4. **参数建议（契约固定）**：网格尺寸（如 20×20）、初始蛇长（建议 3，确保反向规则可实测）、固定 tick（建议 120–150ms）、初始方向、食物随机生成且排除蛇身（含新蛇头）。
5. **模块候选划分**（需 A5 决定，路径不得重叠）：
   - 候选 A：单一代码模块 `src/`（目录，含 `index.html` 与 `game.js`/`input.js`/`render.js`/`style.css`），入口即 `src/index.html`；单个实现角色。
   - 候选 B：入口模块 `index.html` 由 `env-bootstrap` 的 `entry-index` 持有（`env-resources` 另持 1–20 个真实环境路径），代码模块 `src/` 由实现角色持有；需注意静态页可能缺少名副其实的 env 资源路径。
   - 候选 C：小项目省略 `env-bootstrap`（写真实理由），根 `index.html` 与 `src/` 分属普通模块；省略时必须无 env/entry 模块。
6. **验收证据方式（供 A12）**：人工浏览器实测记录（AC1–AC4 逐条勾选）+ 代码走查；若做自动化测试，须使用宿主已有工具，不得为验收引入运行时依赖；截图等证据需配套 sidecar（P0 证据实际 lines/bytes/sha256/metrics 一致）。

## 四、风险与待定项（供 A5 判断）

1. **`file://` 下的脚本加载**：ES module 在本地文件协议常被 CORS 拒绝 → 采用传统 `<script src>` 顺序加载或单文件内联；模块划分需让脚本依赖顺序显式、可静态检查。
2. **方向键默认滚动页面**：需在键盘处理中 `preventDefault`，避免页面滚动干扰体验/验收。
3. **反向判定与初始蛇长**：初始长度为 1 时“180° 反向”不可观测，须在契约固定初始蛇长 ≥2（建议 3）。
4. **重开语义细节**：重开须同时复位方向与计时器，避免残留按键导致重开瞬间反向或立即撞墙；“重开入口”形式（按钮/按键）需固定并可实测。
5. **食物生成与满盘边界**：食物不得与蛇身重叠；若全盘占满（无空位）须定义确定性行为（不崩溃、不挂起），该情形虽属低频，契约需给出处理口径。
6. **结束态**：`over` 后停止 tick、忽略方向输入，仅重开可恢复；避免“结束后仍能移动”导致 AC4 判定失败。
7. **模块/入口归属决策**：`index.html` 归 `env-bootstrap.entry-index` 还是普通模块，及是否为静态小项目省略 `env-bootstrap`，需 A5 拍板；路径不得重叠/嵌套，env/entry 类别不可误归属普通角色。
8. **名单规模**：单实现角色可拥有多模块；verifier 由 chief 在 A12 另建，不写入实现名单；角色 id 不得使用内置 id（含 convener），`management` 仅引用。
9. **基线未就绪**：项目当前非 Git 仓库、无 baseline；A9 未完成前不得派实现任务（A11 前置）。
10. **客户卡预算**：A3/A6/A10 三张确认卡 + A13 merge-main 由应用呈报；策划不发起 proposal 卡；材料性选择才走 decision 卡，且发起方不自批。

## 五、边界声明

- 本任务只做 A4 受理/准备（只读审阅 + 记录）：未撰写提案/模块清单/名单/架构/契约正文，未写任何实现代码，未修改产品意图与意图入口。
- 未发客户卡、未派发任务、未计算或申报任何文件哈希；未声称任何批准/确认/激活。
- 结论供 A5 及后续阶段使用；方案与文档的真实生效以门禁回执与客户确认结果为准。
