---
flowId: snake-game
intentId: snake-game
stage: A4
version: 1
author: rapporteur
status: recorded
kind: a4-preparation-record
date: 2026-11-11
intent: docs/product/snake-game-intent-v1.md
---

# snake-game A4 受理/准备记录

> 本记录只做受理与准备：梳理 A5 待产出物与待决取舍，**不拍板技术方案、不写正式 proposal/modules/roster/architecture**，也不替客户做选择。所有取舍留待 A5 成文、A6 客户确认。

## 1. 依据材料（已读）

- `docs/workflow.md`（workflow/v1；A4/A5 交接物与完成口令）
- `docs/intents/snake-game.md`（意图入口，intentId=snake-game，A3 已 confirm）
- `docs/product/snake-game-intent-v1.md`（已确认产品意图 v1：目标/范围/验收 A1–A5/非目标/约束）
- `docs/scheduling/snake-game-a1-intake-v1.md`（A1 受理记录与 11 项尚缺信息）

受理结论：依据齐备（A3 已确认意图 v1），A5 可按意图 v1 起草；无意图缺口需回退，待决项均为意图明确交给「方案阶段」的技术取舍。

## 2. A5 待产出文档与相互关系

A5 产出四件（均版本化 v1，不原地改）：

| 文件 | schema | 作用 |
| --- | --- | --- |
| `docs/proposals/snake-game-proposal-v1.md` | `project-proposal/v2` | 提案：目标/范围/方案要点/验收对应；frontmatter 含 intent 完整路径 |
| `docs/proposals/snake-game-modules-v1.md` | `project-modules/v2` | 模块清单（唯一权威源）：id/name/purpose/category/path/publicContract/architectureSource，1–12 项 |
| `docs/proposals/snake-game-roster-v1.md` | `project-roster/v3` | 名单：角色→模块归属绑定 + 正文「人员+模块拓扑图」`topology`（`project-topology/v2`）块 |
| `docs/contracts/snake-game-architecture-v1.md` | `project-architecture/v1` | 架构/契约：分层、模块、依赖方向、公开契约、数据流、扩展点 |

机器链与一致性要点（A5 必须满足）：

1. 提案正文须含 roster 声明的 intent 路径字符串（`docs/product/snake-game-intent-v1.md`），否则 roster 加载 `roster-reference-invalid/inconsistent`。
2. 架构正文须含 roster 声明的 proposal 路径字符串（`docs/proposals/snake-game-proposal-v1.md`）。
3. roster frontmatter 的 intent/proposal/architecture（及可选 modulesDoc）必须是各自最新版；modules[] 是模块清单的派生快照，须逐项一致（防 `roster-modules-drift`）。
4. 每个模块恰一个属主；每个角色至少绑定一个模块；1–12 模块、1–12 角色；模块路径互不相同、不嵌套（同父文件与目录合法）；路径不得落在治理写区（`.ans/`、`角色卡/`、`docs/proposals|contracts|product|intents|scheduling|quality|verification|skills|mcp/` 等）。
5. `publicContract` 必须是非空字符串（不可写 true/false）；`category` 为小写 slug；env/entry 为保留类别且只能归 `env-bootstrap`。
6. 拓扑块与 frontmatter 完全一致：模块 id/路径/属主、角色 id/modules 数量与集合均一致；`management` 是含 `convener` 与全部项目角色 id 的扁平数组（不能写 `management.roles`）。

## 3. 固定角色与模块结构要点（A5 起草前置）

- 默认必须带标准固定角色 `env-bootstrap`（装配/入口），固定两个模块：
  - `env-resources`（category=env，paths 1–20：静态资源/样式/资产目录等）；
  - `entry-index`（category=entry，paths 1–20：入口文件，如 `index.html`）。
- 若客户/方案确为极小项目才可省略，并须写 `envBootstrap: {omitted: true, omissionReason: "<非空真实理由>"}`，且不得再含 env-bootstrap 或 env/entry 模块。本项目为可运行游戏（有入口与静态资源），**按默认纳入 env-bootstrap 处理，不预设省略**。
- 实现类模块候选划分方向（**仅为方向，A5 定稿，不作任何名单/派发依据**）：
  1. `game-core`：游戏状态与规则（移动推进、吃食物增长 +1、计分 +1、撞墙判定、结束态、重开重置）；
  2. `input-control`：键盘映射（方向键 + WASD）与反向过滤；
  3. `render-ui`：网格/蛇/食物/分数/结束提示渲染；
  4. `app-entry`（或归入 entry-index 固定模块）：启动、主循环与事件装配。
- 上述划分的最终 moduleId、路径与属主数，以及是否合并，均由 A5 依据实际技术栈与可测性决定。

## 4. 待决技术取舍清单（只记录，不选择）

| 编号 | 待决项 | 可选方向 | 影响 |
| --- | --- | --- | --- |
| D1 | 交付形态 | A 浏览器网页（本地静态页）；B 桌面应用（Electron/Tauri 等）；C 终端命令行（字符画） | 直接影响「画面同步」「按键即时」等验收的可观察性与验收证据形式；影响运行依赖与构建 |
| D2 | 技术栈与构建方式 | A 原生 HTML/CSS/JS（零构建、零依赖）；B TypeScript + Vite 等构建产物；C Node/Python 脚本 | 决定是否需要工具链（须以应用只读环境事实为准，不自行探测）与「可运行构建」形态 |
| D3 | 界面尺寸与网格 | A 20×20 格 × 24px；B 25×25 × 20px；C 其他比例（如 30×20） | 撞墙边界是否清晰可辨、蛇身/食物/分数可读性 |
| D4 | 配色与界面语言 | A 深底高对比 + 中文界面（「游戏结束」「分数」「重开」）；B 英文界面；C 浅色主题 | 验收文案取证口径与可读性 |
| D5 | 初始速度与节奏 | A 固定 120–150ms/格；B 较快约 100ms/格；C 较慢约 180ms/格 | 操作可控性与「按键后方向实际改变」的判定难度；**不引入随分加速/难度选择（意图非目标）** |
| D6 | 重开入口形式 | A 结束画面按钮 + 按键（空格/回车）双入口；B 仅按键；C 仅按钮 | 入口可发现性与 A4 验收（必须存在且易发现） |
| D7 | 验收证据方式 | A 截图序列（开局→转向→得分→结束→重开）；B 录屏；C 可运行构建人工复核；D 自动化（headless）测试 | 意图明确「证据形式由 A12 验收阶段决定」；A5 只预留，不拍板 |

衍生待决项（A5 在架构/契约中明确即可，不一定要客户逐项回答）：

- R1 反向输入的实现口径：方向输入队列（每 tick 消费一个）vs 直接覆盖；关系到「禁止 180° 反向」与「结束后不接受输入」的稳定性。
- R2 本地打开方式：单文件内联脚本可直接用 `file://` 打开 vs 需要本地静态服务器（ES module 的 CORS 限制）；关系到「本地运行、无需联网」的落地与验收方式。
- R3 食物生成与边界情况：在空位随机生成、避开蛇身；蛇占满网格时的行为（只记录，不扩展功能）。
- R4 结束提示样式：覆盖层/文案/最终分数位置与重开按钮布局。
- R5 目录与入口：入口文件与静态资源路径划分，须避开治理写区。

## 5. 已知约束与依赖（来自已确认意图 v1）

- 硬约束：单人、本地、无需联网与账号，不引入服务端依赖。
- 键盘同时支持方向键与 WASD；禁止一步 180° 反向。
- 实时计分：每吃一个食物固定 +1 分，界面显著位置显示。
- 撞墙判定：蛇头**触及或越过**任一边界即本局立即结束；结束后不再接受方向输入，显示结束提示与最终分数。
- 重开：结束后可立即开新局；分数清零、蛇身回到初始长度与位置、食物重新生成。
- 食物基线：单一食物、每次增长 1 格（数值可微调但不得改变验收行为）。
- 不纳入 v1（非目标）：联网、多人、账号、排行榜；移动端触控与响应式；音效与美术资源；存档/读档；暂停；难度选择与随分加速；特殊食物；最高分记录；商业化功能。
- 质量档位：最小可玩闭环优先，须真实可玩、可复现、可连续多轮，不接受概念演示。
- 环境事实：应用环境为 win32 / Windows 11；本阶段**未运行任何 shell 探测**（node/python/浏览器工具链版本均未知），A5 选型须以应用只读环境事实或运营提供的事实为准。
- 门禁依赖：模块/名单/拓扑字段与引用链须按 `project-modules/v2`、`project-roster/v3`、`project-topology/v2`、`project-proposal/v2`、`project-architecture/v1` 校验通过。
- 下游依赖：A6 客户确认方案 → A9 团队计划/基线 → A10 任命 → A11 一模块一任务实现 → A12 独立验收 → A13 merge-main。

## 6. 尚缺信息与 A6 待客户确认项

1. **A6 需客户确认的取舍**：D1 交付形态、D2 技术栈与构建、D3 界面尺寸与网格、D4 配色与界面语言、D5 初始速度、D6 重开入口形式（D7 证据方式最终由 A12 定，A5 仅预留）。
2. **需运营/应用补充的事实**：可用的运行时与工具链（是否允许需要构建的路径、目标浏览器/平台）；未探测前 A5 不假设环境能力。
3. **需在 A5 方案内自决并向客户说明的**：R1–R5（反向输入实现口径、本地打开方式、食物生成、结束提示样式、目录与入口）。
4. **无需回退意图**的判断：以上均为意图已明确交给「方案阶段」的项，不构成意图缺口；若客户在 A6 要求超出意图（如暂停、加速、最高分），应按流程出意图 v2，而非在方案中扩大范围。

## 7. 本阶段未做事项（边界留痕）

- 未写 `docs/proposals/` 下任何正式方案/模块/名单文件，未写 `docs/contracts/` 架构文件。
- 未创建角色卡、未招人、未提名、未激活、未派发任何实现任务。
- 未运行 shell（含 `node -v` / `python --version` / `which` / `where`），未计算或转抄任何 sha256。
- 未修改 `docs/product/**`、`docs/scheduling/**` 及任何其他角色目录。
