---
docType: rapporteur-preparation-record
flowId: snake-game
intentId: snake-game-core
stage: A4
version: 1
status: preparation-recorded
basis: docs/product/snake-game-intent-v1.md
---

# snake-game A4 方案受理/准备记录（非正式）

> 本文件是策划（rapporteur）的 A4 受理/研判工作记录，**不是** A5 正式产物：不进入 proposal / modules / roster / architecture 版本链，不顶替 `docs/proposals/`、`docs/contracts/` 下的任何版本化文档。A5 独立任务须按 schema 重新撰写正式文档（均可从 v1 起）。
> 依据：`docs/product/snake-game-intent-v1.md`（intentId=snake-game-core，v1，客户已于 A3 确认，decisionId=decision-req-6319dd017faf6311）。
> 本阶段未建卡、未招人、未派发、未写源码、未初始化仓库、未用 shell 探测环境、未计算或转抄任何 hash。

## 1. 依据与约束核对

- 范围/验收：AC1 四方向控制且禁止 180° 反向；AC2 每颗食物 +1 且实时显示；AC3 蛇头到达/越过边界立即结束；AC4 重开重置蛇身位置/长度与分数并回到可玩态；AC5 完整循环可连续重复。
- 非目标（不得实现、不得纳入验收）：联网/排行榜/账号、**撞自身判负**、暂停/继续、随分数加速与难度递增、穿墙、移动端触摸、音效美术打磨、最高分与存档持久化。
- constraints：本地单人、键盘输入、离线运行、不依赖网络/账号/外部服务。
- 质量档位：功能可玩级 MVP（内部验证/演示档）。
- 边界自检：A4 只做结构研判；正式提案/模块清单/名单/架构留给 A5；本记录不构成任何批准或放行。

## 2. 模块拆分建议（约 9 个模块，含固定 env/entry）

| id | name | purpose | path | category | publicContract | architectureSource |
|----|------|---------|------|----------|----------------|--------------------|
| game-state | 游戏状态 | 蛇身/食物/分数/阶段（ready·running·over）的纯状态模型与转移 | `src/core/state/` | core | internal（GameState 快照与命令接口） | docs/contracts/snake-game-architecture-v1.md |
| collision-boundary | 碰撞与边界判定 | 蛇头越界判定、食物吞噬判定（纯函数，无 I/O） | `src/core/collision/` | core | internal（碰撞/边界纯函数契约） | docs/contracts/snake-game-architecture-v1.md |
| scoring | 计分 | 每吃一颗食物 +1 的计分规则与食物再生成 | `src/core/scoring/` | core | internal（计分 +1 与食物生成契约） | docs/contracts/snake-game-architecture-v1.md |
| input-control | 输入控制 | 键盘四方向映射为 Direction 命令；按已接受方向抑制 180° 反向 | `src/input/` | input | internal（键位→Direction 映射与反向抑制） | docs/contracts/snake-game-architecture-v1.md |
| rendering | 渲染 | 只读 StateSnapshot 绘制场地/蛇/食物/分数/结束态 | `src/render/` | ui | internal（只读快照渲染，不改状态） | docs/contracts/snake-game-architecture-v1.md |
| game-loop | 主循环 | 固定 tick 推进、输入缓冲、阶段切换（运行→结束） | `src/loop/` | runtime | internal（tick 驱动与阶段转换契约） | docs/contracts/snake-game-architecture-v1.md |
| restart-flow | 重开流程 | 结束态下触发重开，调用 reset 回到初始可玩态 | `src/restart/` | runtime | internal（reset 至初始可玩态契约） | docs/contracts/snake-game-architecture-v1.md |
| e2e-verification | 端到端验证 | 覆盖 AC1–AC5 的端到端脚本与夹具（可选模块） | `test/` | qa | internal（AC1–AC5 端到端脚本契约） | docs/contracts/snake-game-architecture-v1.md |
| env-resources | 环境资源 | 构建/运行配置与静态宿主页（无业务逻辑） | `["package.json","tsconfig.json","vite.config.ts","index.html"]`（paths 形式） | env | internal（构建与运行配置） | docs/contracts/snake-game-architecture-v1.md |
| entry-index | 入口装配 | 应用入口：装配 core/loop/input/render，只接线不实现业务 | `["src/main.ts"]`（paths 形式） | entry | internal（入口装配） | docs/contracts/snake-game-architecture-v1.md |

要点：
- `env-resources` / `entry-index` 为固定模块，category 只能 env / entry，且只能由 `env-bootstrap` 拥有；多路径用 `paths[]`（1–20 项）。
- 路径互不重叠、互不嵌套（`src/core/state|collision|scoring/` 为同级目录）；同父文件与目录合法。
- 若 A5 判定 e2e 模块超出 MVP 必要范围，可去掉该模块并让 qa 角色以其模块内脚本承担；但 roster 要求每个角色至少绑定一个模块，届时需同步调整角色集。
- 模块总数 9–10，处于 1–12 上限内；不建议把 state 与 collision 合并，因为「禁止反向」「边界判定」两条 AC 需可独立测试。

## 3. 跨角色契约建议

建议 A5 产出以下契约（新流程从 v1 起；真实变化才出 v2，不原地改）：

1. `docs/contracts/snake-game-architecture-v1.md` — `schema: project-architecture/v1`；写分层（core 纯逻辑 / runtime 驱动 / input-adapter / render-view / entry 装配）、依赖方向、公开契约、数据流、扩展点。**正文必须包含 `docs/proposals/snake-game-proposal-v1.md`**（机器版本链要求）。
2. `docs/contracts/snake-game-core-contract-v1.md` — 约定 `contract-md/v1`；核心数据/接口契约：
   - `Direction = UP|DOWN|LEFT|RIGHT`；`Phase = ready|running|over`；
   - `StateSnapshot = { grid: {w,h}, snake: Cell[], food: Cell, score: number, phase }`（渲染只读）；
   - `step(state, direction)`：一次 tick 推进一格；反向输入（相对上一已接受方向）忽略且不判负；
   - 边界语义：下一格坐标落在 `[0,w-1]×[0,h-1]` 之外 ⇒ `phase=over`，蛇停止移动（AC3）；
   - 食物：head 与 food 同格 ⇒ `score+1` 并在空闲格再生食物（AC2）；初始分数 0；
   - `reset()`：蛇身回初始位置与初始长度、分数 0、重新生成食物、`phase` 回可操作态（AC4）。
3. `docs/contracts/snake-game-acceptance-v1.md` — 可选；以文件内唯一 ```ans-criteria 块承载 AC1–AC5 的机器验收口径（含每条 AC 的可观察判定与证据方式）。若 A5 决定验收口径只放提案正文，可省略本文件，但需保证 verifier 有明确 input。

契约命名一律 `<flowId>-<kind>-vN.md`，且 roster 的 `intent`/`proposal`/`architecture` 必须指向各自**最新**版本；架构正文引用提案路径、提案正文引用意图路径，形成 intent→proposal→architecture 链。

## 4. 名单（roster）与拓扑（topology）准备要点

建议项目角色（id 为小写 slug；一模块一属主，每角色 ≥1 模块）：

| 角色 id | 职责 | 绑定模块 |
|---------|------|----------|
| game-core-dev | 纯逻辑：状态/碰撞/计分 | game-state, collision-boundary, scoring |
| runtime-dev | 主循环与重开编排 | game-loop, restart-flow |
| input-ui-dev | 输入适配与渲染 | input-control, rendering |
| qa-verifier | 端到端验证（review: true） | e2e-verification |
| env-bootstrap | 装配/入口（固定角色，默认必带） | env-resources, entry-index |

- 团队共 5 个角色、10 个模块；`env-bootstrap` 不得省略（本项目需要构建配置与入口装配）；不得把 env/entry 类路径归给其他角色。
- 依赖/实施顺序：env-bootstrap（脚手架与入口）→ game-core-dev（core 契约与纯逻辑）→ runtime-dev（loop 消费 core）→ input-ui-dev（输入映射命令、渲染只读快照）→ qa-verifier（集成后跑 AC1–AC5）。
- 依赖方向（架构层）：`entry → loop/restart → core`；`input → core（仅 Direction 命令）`；`render → core（只读快照）`；core 不反向依赖 loop/render/input。
- 写区按模块 path 划分，互不重叠：core-dev 只写 `src/core/**`；runtime-dev 写 `src/loop/`、`src/restart/`；input-ui-dev 写 `src/input/`、`src/render/`；qa 写 `test/`；env-bootstrap 写 `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts`。跨模块改动须由属主在其写区内完成，禁止代改。
- 拓扑块（roster 正文「人员+模块拓扑图」章节内的 ```topology 块，`schema: project-topology/v2`）要求：
  - `modules[]`：每项 id + `path`/`paths` + `roleId`（与 frontmatter modules 一致）；
  - `roles[]`：每项 id + `modules[]`；
  - `management`：**扁平字符串数组**，含 `convener` 与全部项目角色 id，即 `[convener, game-core-dev, runtime-dev, input-ui-dev, qa-verifier, env-bootstrap]`；不得写 `management.roles`。
- roster 的 frontmatter 需含：`schema: project-roster/v3`（或 v4）、`flowId: snake-game`、`version`、`intent: docs/product/snake-game-intent-v1.md`、`proposal: docs/proposals/snake-game-proposal-v1.md`、`architecture: docs/contracts/snake-game-architecture-v1.md`、`modulesDoc: docs/proposals/snake-game-modules-v1.md`（可选但建议），且 modules[] 必须与最新 modules 文档逐项一致。

## 5. 实现技术选型方向（仅方向与取舍，不定稿）

推荐方向：**浏览器 + TypeScript + HTML5 Canvas，Vite 构建，纯本地离线运行**。
- 理由：键盘事件原生支持四方向；Canvas 网格绘制简单；构建产物可离线打开；core 纯函数可在 Node 侧无头测试，便于覆盖 AC1–AC5；无服务端与账号依赖，符合 constraints。
- 运行时结构建议：固定 tick（约 8–10 次/秒）与 `requestAnimationFrame` 渲染解耦；输入在 tick 边界最多接受一次方向变更，并以「上一已接受方向」做反向校验，避免同一 tick 内连续两次转向绕过 180° 限制。
- 备选 A：终端程序（Python + curses）——依赖最少、离线天然满足，但跨平台终端输入/刷新差异大，实时计分显示与 e2e 自动化更麻烦。
- 备选 B：Electron/Tauri 桌面打包——对 MVP 增加体积与依赖成本，且离线浏览器已满足需求，不建议本期采用。
- 可测试性要求：core 为无副作用纯函数；食物生成支持注入随机源以便测试复现；边界判定统一坐标约定（越界即 `phase=over`），避免 off-by-one。
- 明确不做：撞自身判负、穿墙、暂停、加速、存档/最高分、网络与账号。

## 6. 风险与待定项（不在 A4 决定）

- 键位集合：仅方向键，还是同时支持 WASD（A1 遗留问题）——不影响 AC1 语义，可在 A5/实现期定。
- 重开触发形式：按键（如 Space/Enter）或界面按钮；必须保证 AC4 的「重置并可玩」语义。
- 网格尺寸、初始蛇长、tick 速度：影响体验与测试参数，不改验收口径。
- 验收证据方式（自动化 e2e vs 人工演示）属材料性选择，如出现须按治理走 decision 卡，不在 A4 自行决定。
- 若后续客户要求撞自身判负、暂停、加速等，属范围扩张，须走需求变更/意图新版本，不得由实现或本记录默认加入。

## 7. A5 撰写提示（正式产物清单）

1. 先写 `docs/proposals/snake-game-proposal-v1.md`（`schema: project-proposal/v2`，frontmatter 含 `intentId: snake-game-core`、`flowId: snake-game`、`version: 1`、`intent: docs/product/snake-game-intent-v1.md`；正文含该 intent 路径）。
2. 再写 `docs/proposals/snake-game-modules-v1.md`（`schema: project-modules/v2`，模块表以本记录第 2 节为起点复核）。
3. 写 `docs/proposals/snake-game-roster-v1.md`（`schema: project-roster/v3`，含「人员+模块拓扑图」```topology 块，management 为扁平数组）。
4. 写 `docs/contracts/snake-game-architecture-v1.md`（`schema: project-architecture/v1`，正文含 proposal 路径）与可选核心契约/验收契约。
5. 所有引用指向最新版本；版本号以真实影响递增，不原地改旧版；正式产物不得复用本治理记录的「非正式」措辞冒充已批准。
