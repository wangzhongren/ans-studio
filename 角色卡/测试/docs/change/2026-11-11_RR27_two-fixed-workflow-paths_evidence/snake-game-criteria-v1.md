---
flowId: snake-game
version: 1
stage: A12a
status: final
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
modules: docs/proposals/snake-game-modules-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
roster: docs/proposals/snake-game-roster-v1.md
---

# 贪吃蛇游戏 · 验收标准 v1（A12a，实施前定稿）

## 1. 依据与适用范围

- 产品意图：`docs/product/snake-game-intent-v1.md`（验收标准 1–5）
- 产品提案：`docs/proposals/snake-game-proposal-v1.md`（第 3 节验收标准、第 4 节默认假设）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 架构契约：`docs/contracts/snake-game-architecture-v1.md`（第 2 节交付形态、第 5 节公开契约、第 6 节数据流）
- 人员名单：`docs/proposals/snake-game-roster-v1.md`

本标准在实现前定稿，作为 A12b 验收报告中逐条核对的冻结依据；A12b 只认本文件（及其实施后按流程产生的后续版本）与任务指定的最终完整 OID，候选漂移或内容变化不判通过。

## 2. 采用的已确认假设（来自意图 v1 第 7 节 / 提案 v1 第 4 节）

1. 撞自身与撞墙同为结束条件。
2. 与当前方向相反的按键输入（180° 反向）被忽略，不改变方向、不导致结束。
3. 固定匀速移动，无难度档位、无随分数加速要求。
4. 同一时刻仅一个食物，随机生成在空白格；每个食物 +1 分，分数只增不减。
5. 撞边界即结束，不做穿墙。
6. 重开方式：R 键或界面「重开」按钮；重开即重置分数、蛇、食物与结束态，不保留历史成绩。
7. 交付形态：纯静态单页，浏览器直接打开 `index.html`（`file://`）可运行，无构建步骤、无外部依赖、无服务端。
8. 画布尺寸、网格、配色、字体不作硬性数值要求（仅要求可辨识、可操作）。

## 3. 待核验交付物（验收对象）

架构 v1 第 2 节约定的交付形态：

| 路径 | 模块 | 属主角色 | 验收关注点 |
| --- | --- | --- | --- |
| `index.html` | entry-index | env-bootstrap | 页面结构、稳定 DOM id、脚本加载顺序 |
| `styles.css` | game-style | game-ui-dev | 被入口页相对路径引用、页面可用 |
| `src/game.js` | game-core | game-core-dev | `window.SnakeGame` 公开契约、纯逻辑 |
| `src/ui.js` | game-ui | game-ui-dev | `window.SnakeUI` 公开契约、渲染与输入 |
| `assets/` | env-resources | env-bootstrap | 可选；如存在仅按页面相对路径引用 |

## 4. 逐条验收标准

### AC-1 方向键移动与改变方向（P0）

- **标准**：启动后进入初始状态，蛇按方向键移动，且方向键可改变当前移动方向（非反向）；与当前方向相反的 180° 输入被忽略，不改变方向、不触发结束。
- **判定方式**：运行核验为主（浏览器打开 `index.html` 实测）+ 静态辅助（`src/ui.js` 的方向校验逻辑）。
- **通过条件**：
  1. 页面加载后进入可操作初始态，蛇以固定间隔持续移动；
  2. 依次按上/下/左/右四个方向键，非反向输入均导致下一次移动方向改变；
  3. 至少验证一次 180° 反向：例如向右移动时按左，蛇继续向右，不反向、不结束、不报错；
  4. 浏览器控制台无未捕获异常。
- **证据要求**：`docs/verification/` 下 AC-1 相关运行截图（初始态 + 至少一次方向改变）；记录被验代码的完整 OID；截图/附件按 P0 证据附 `evidence-meta` sidecar（lines/bytes/sha256/metrics 与实物一致）。静态辅助记录 `src/ui.js` 中方向校验的观察位置。

### AC-2 吃食物 +1 分并实时显示（P0）

- **标准**：蛇头到达食物格时分数 +1，且分数在页面上实时可见；同一时刻仅一个食物；分数只增不减。
- **判定方式**：运行核验为主（实测吃到食物）+ 静态辅助（`src/game.js` 计分逻辑、`index.html` 分数元素与 `src/ui.js` 渲染）。
- **通过条件**：
  1. 初始分数显示为 0；
  2. 吃到食物后分数显示为 1（每食物 +1）；
  3. 连续吃到第二个食物后分数为 2，页面显示同步更新，无需刷新；
  4. 吃食物后蛇长度增加、食物在空白格重新生成（无重叠占用）。
- **证据要求**：`docs/verification/` 下 AC-2 相关运行截图（分数为 0 与加分后至少两个状态）；记录分数 DOM 元素的 id 与文本实测值；P0 证据附 sidecar。

### AC-3 撞墙 / 撞自身结束（P0）

- **标准**：蛇头撞到边界（墙）或撞到自身蛇身时立即结束游戏：停止移动、停止计分，进入结束态并在界面提示。
- **判定方式**：运行核验为主（实测撞墙；撞自身按构造路径实测或由 `src/game.js` 逻辑核对）+ 静态辅助（碰撞判定与定时器停止逻辑）。
- **通过条件**：
  1. 持续朝同一方向移动至撞墙，游戏立即结束；
  2. 结束后蛇不再继续移动（等待数个帧间隔后画面不变），分数不再变化；
  3. 界面显示结束态提示（文案或元素可见）；
  4. 撞自身（如构造出长度足够的蛇后转向自身）同样判定结束，界面同样进入结束态；
  5. 结束时不抛未捕获异常。
- **证据要求**：`docs/verification/` 下 AC-3 撞墙结束运行截图（结束态提示可见），以及撞自身证据（运行截图或静态逻辑观察记录 + 说明）；记录结束后等待若干帧仍静止的观察结论；P0 证据附 sidecar。

### AC-4 结束后重开复位（P0）

- **标准**：结束后可通过 R 键或界面「重开」按钮重开；重开后分数归零、蛇回到初始位置与长度、食物重新生成、结束态清除，且可再次正常操作。
- **判定方式**：运行核验为主（R 键与按钮两种触发各测）+ 静态辅助（重开事件绑定与 `reset()` 调用链）。
- **通过条件**：
  1. 结束态下按 R 键可重开；
  2. 结束态下点击界面「重开」按钮可重开；
  3. 重开后分数显示为 0、蛇复位到初始位置与初始长度、食物重新出现在空白格、结束态提示清除；
  4. 重开后方向键可再次改变方向、蛇继续移动，可再次完成吃食物加分；
  5. 不保留上一局分数（非累加）。
- **证据要求**：`docs/verification/` 下 AC-4 重开前后对比截图（含 R 键与按钮两种触发，或两种触发各自的观察记录）；记录重开触发方式与重开后分数/结束态实测值；P0 证据附 sidecar。

### AC-5 交付形态与完整流程（P0）

- **标准**：纯静态单页，交付文件为 `index.html` + `styles.css` + `src/ui.js` + `src/game.js`（`assets/` 可选），浏览器直接打开 `index.html` 可运行，无构建步骤、无外部依赖、无服务端；可完整走通「移动—吃食物加分—撞墙结束—重开复位」。
- **判定方式**：静态结构核对为主 + 端到端运行核验。
- **通过条件**：
  1. 上述四个文件均存在且路径与架构 v1 第 2 节一致；`assets/` 如存在不改变交付形态；
  2. `index.html` 以相对路径引用 `styles.css`、`src/game.js`、`src/ui.js`，脚本为经典 `<script>`（非 ES module），加载顺序满足 `src/game.js` 先于 `src/ui.js`；
  3. 无外部网络依赖（无 CDN/远程脚本/远程样式/第三方运行时），无构建产物或构建步骤要求；
  4. 页面为 canvas 提供稳定 id，并具备分数元素、结束态元素、重开按钮的稳定 id；
  5. `window.SnakeGame` 暴露 `createGame(config)`、`reset()`、`tick()`、`getState()`；`window.SnakeUI` 暴露 `mount(game)`、`render(state)`、`onKeydown(event)`；
  6. 核心层 `src/game.js` 不访问 DOM（不出现 `document`/`window.document` 等界面状态依赖）；
  7. 以 `file://` 直接打开 `index.html`，端到端走通「移动—吃食物加分—撞墙结束—重开复位」全流程。
- **证据要求**：交付文件清单与静态核对记录（引用文件、脚本类型、加载顺序、公开对象字段、无外部依赖的观察点）；`docs/verification/` 下 `file://` 端到端流程截图（覆盖四个环节）；被验文件完整 OID；P0 证据附 sidecar。

## 5. 核对深度与整体判定

- 建议强度：AC-1～AC-4 以真实运行核验为主，AC-5 以静态结构核对 + 端到端运行复核为主；本标准为完整核对（逐条核对全部冻结 criteria）。
- 全部 P0 条目通过且证据与实物一致 ⇒ 报告结论「通过」；任一 P0 不满足、缺证据或证据与实物不一致 ⇒ 不得判通过；缺少必需证据如实写 insufficient evidence，不代为补造。
- 证据一致性与真实 OID 以 A12b 当次核对为准；候选/内容已变则不判通过并回报来源链。
- 本文件不发起、不代替客户作业务选择；验收归档由应用在 A12b 完成时生成，本角色只读。

## 6. 机器可读标准块

```ans-criteria
schema: ans-criteria/v1
flowId: snake-game
version: 1
status: final
criteria:
  - id: AC-1
    priority: P0
    title: 方向键可移动并改变方向，180°反向输入被忽略
  - id: AC-2
    priority: P0
    title: 吃到食物分数+1并实时显示，分数只增不减
  - id: AC-3
    priority: P0
    title: 撞墙或撞自身立即结束，停止移动与计分并进入结束态
  - id: AC-4
    priority: P0
    title: 结束后R键或按钮重开，分数清零、蛇与食物复位、结束态清除且可再次操作
  - id: AC-5
    priority: P0
    title: 纯静态单页四文件可file://直接运行且无构建无外部依赖，完整走通全流程
```
