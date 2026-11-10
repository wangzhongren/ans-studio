---
schema: project-contract/v1
flowId: snake-game
intentId: snake-2d-game
version: 2
author: rapporteur
status: draft
proposal: docs/proposals/snake-game-proposal-v2.md
architecture: docs/contracts/snake-game-architecture-v2.md
---

# 2D 贪吃蛇小游戏 — 跨角色实现契约（v2）

本契约约束实现方（模块 `game` 的属主角色 `game-dev`）与验收方之间的一切可观察约定。凡与本契约不符的实现，均视为未满足提案 `docs/proposals/snake-game-proposal-v2.md` 与架构 `docs/contracts/snake-game-architecture-v2.md`。

本版相对 v1 的变更：新增暂停/继续能力——`#pause` 按钮、空格键切换、`PAUSED` 状态与 `AC-11`；其余约定不变。

## 1. 交付文件布局

```text
game/
├── index.html    # 入口页面
├── styles.css    # 全部样式
└── game.js       # 全部游戏逻辑（单个经典脚本）
```

- 三个文件缺一不可；不得新增其他运行时依赖文件（如图片、字体、音频、JSON 资源、`package.json`）。
- 所有资源引用必须是**同目录相对路径**；禁止任何 `http://` / `https://` / `//` 协议相对外链、CDN、内联远程字体或远程图片。
- 入口固定为 `game/index.html`；浏览器直接打开即可运行，不依赖本地服务器。

## 2. DOM 结构约定

`index.html` 必须提供以下元素（id 精确匹配，供验收定位）：

| id / 选择器 | 元素 | 用途 |
| --- | --- | --- |
| `#game-canvas` | `<canvas>` | 游戏画布；CSS 尺寸 480×480，逻辑 24×24 格、每格 20px |
| `#score` | 文本节点容器 | 当前分数，初始 `0` |
| `#best` | 文本节点容器 | 最高分，初始为 localStorage 读取值（缺失/非法时为 `0`） |
| `#restart` | `<button type="button">` | 「重新开始」按钮，始终可见可点击 |
| `#pause` | `<button type="button">` | 暂停/继续按钮；文案在「暂停」与「继续」间切换；`READY`/`GAME_OVER` 下可禁用 |
| `#overlay` | 覆盖层容器 | READY / GAME_OVER 提示；用 `hidden` 属性控制显隐 |
| `#overlay-title` | 文本容器 | overlay 标题（「准备开始」/「游戏结束」） |
| `#overlay-hint` | 文本容器 | overlay 副标题（开始提示 / 得分与重开提示） |

- 结构建议：HUD 区（标题 + `#score` + `#best`）→ 棋盘容器（`#game-canvas` + `#overlay`）→ 控制区（`#pause` + `#restart` + 操作提示文案）。
- `#restart` 文案必须为「重新开始」。
- `#pause` 文案必须为「暂停」或「继续」二者之一，并随状态切换。
- 除上述 id 外，内部可增加样式类，但不得重命名或移除上述 id。

## 3. JavaScript 职责边界

`game.js` 为单个 IIFE，不向外暴露业务对象。内部至少包含以下职责（函数名可自定，职责不可混）：

| 职责 | 约定 |
| --- | --- |
| `CONFIG` 常量 | 棋盘 24×24、格宽 20、步进 120ms、初始长度 3、颜色、`STORAGE_KEY` |
| 初始状态构造 | 生成蛇（长度 3、第 12 行、头朝右）、分数 0、最高分（读取）、随机食物、空方向队列、状态 `READY` |
| 方向入队 | 校验目标方向非当前朝向反向；队列容量 2；与队尾同向则忽略；`READY` 下首个有效方向立即转 `RUNNING` |
| 步进 `step()` | 每 120ms 消费一个方向、计算新头、判定撞墙/自撞/进食、更新状态、触发渲染 |
| 进食与食物生成 | 新头等于食物格：分数 +1、蛇长 +1、在空格集合中随机生成新食物 |
| 碰撞判定 | 越界即撞墙；新头落在「本步后仍存在的蛇身格」即自撞（未进食时排除将离开的尾格） |
| 暂停切换 `togglePause()` | 仅 `RUNNING`/`PAUSED` 生效：`RUNNING`→`PAUSED` 先清除步进定时器；`PAUSED`→`RUNNING` 重新启动单一 120ms 定时器；同步 `#pause` 文案（「暂停」/「继续」） |
| 渲染 `render()` | 只读状态：清屏、画深色底与网格线、画食物、画蛇（头身可区分）、必要时由 DOM 层更新分数与 overlay |
| HUD 更新 | `#score` 始终等于当前分数；`#best` 始终等于最高分 |
| 持久化 `loadBest()` / `saveBest()` | 唯一存储入口；`loadBest()` 校验非负安全整数；`saveBest()` 在破纪录时写入；均 try/catch 降级 |
| 事件绑定 | `keydown` 于 `window`；`click` 于 `#restart` 与 `#pause`；方向键与空格键阻止页面滚动（`preventDefault`） |

- 规则层（移动/碰撞/进食/计分）不得直接读写 DOM 或 localStorage；渲染与存储只在适配层发生。
- 不得出现未使用的全局变量、不得用 `document.write`、不得同步阻塞弹窗（`alert`/`confirm`/`prompt`）。

## 4. 游戏状态机

- 状态取值仅 `READY` / `RUNNING` / `PAUSED` / `GAME_OVER`，互斥。
- `READY`：页面首次加载即进入；蛇与食物静态可见；overlay 标题「准备开始」，副标题提示「按方向键 / WASD 开始」；方向键（除与初始朝向相反者）开始游戏。
- `RUNNING`：定时器每 120ms 步进一次；`#overlay` 隐藏；方向键/WASD 与暂停操作生效；`#pause` 文案为「暂停」。
- `PAUSED`：由 `RUNNING` 经空格键或 `#pause` 进入；立即清除步进定时器，蛇、食物、分数全部静止不变；`#pause` 文案为「继续」；再按空格/再点按钮恢复 `RUNNING`（重新启动单一 120ms 定时器）。`READY`/`GAME_OVER` 下空格与暂停按钮不产生副作用；`PAUSED` 下 `R` 键不生效。
- `GAME_OVER`：清除定时器，蛇停止；overlay 标题「游戏结束」，副标题包含本局得分与重开提示；仅 R 键与按钮可重开，方向键与空格无效。
- 重开（R 或按钮）：重建初始状态（分数 0、新蛇、新食物、空队列），最高分保留，状态直接进入 `RUNNING`（明确的重开意图，无需再次按键开始）。`PAUSED` 下点击「重新开始」同样按新一局处理并直接进入 `RUNNING`；`R` 键仅在 `GAME_OVER` 生效。
- 任何状态迁移必须先清理旧定时器；同一时刻只能存在一个步进定时器；`PAUSED` 下不得存在步进定时器。

## 5. localStorage 规则

- key 固定：`snake-game.highscore.v1`。
- 值：十进制非负整数字符串（如 `"12"`）。
- 读取：页面加载时读取并解析；`NaN`、负数、非整数、缺失、读取异常 → 视为 `0`，并更新 `#best` 为 `0`。
- 写入：仅当 `score > best` 时立即写入新最高分并更新 `#best`；`score ≤ best` 不写。
- 异常：读/写均必须 try/catch；存储不可用（如隐私模式限制）时游戏照常运行、最高分退化为内存记录，不得抛错阻断游戏。
- 新一局：`score` 归零，`best` 不重置、不重写。
- 暂停/继续不得产生任何 localStorage 读写。

## 6. 键盘行为

| 按键 | 状态 | 行为 |
| --- | --- | --- |
| `ArrowUp` / `w` / `W` | READY | 朝上开始（若与初始朝向相反则忽略） |
| `ArrowDown` / `s` / `S` | READY | 朝下开始（同上） |
| `ArrowLeft` / `a` / `A` | READY | 与初始朝向（右）相反 → 忽略，保持 READY |
| `ArrowRight` / `d` / `D` | READY | 朝右开始 |
| ↑↓←→ / W A S D | RUNNING | 改变移动方向；目标是当前朝向反向时忽略；入队容量 2、每步消费一个 |
| `ArrowUp` 等方向键、`w/a/s/d` | PAUSED / GAME_OVER | 忽略，不改变状态 |
| `Space`（空格键） | RUNNING | 暂停，进入 PAUSED，清除定时器，`#pause` 文案→「继续」 |
| `Space`（空格键） | PAUSED | 继续，恢复 RUNNING，重启单一 120ms 定时器，`#pause` 文案→「暂停」 |
| `Space`（空格键） | READY / GAME_OVER | 忽略，无副作用 |
| `r` / `R` | GAME_OVER | 重开，进入 RUNNING |
| `r` / `R` | READY / RUNNING / PAUSED | 忽略（`PAUSED` 下重开仅通过「重新开始」按钮） |
| 方向键 / 空格键 | 任意 | 调用 `preventDefault` 防止页面滚动 |

- 支持大小写（按 `event.key` 归一化为小写判断）；同一方向重复按键忽略，不刷屏队列。
- 暂停按钮点击与空格键行为一致；按钮在 `READY`/`GAME_OVER` 下可禁用（禁用时点击无副作用）。

## 7. 验收对照（AC-1 ~ AC-11）

| AC | 实现须满足 | 验收如何观察 |
| --- | --- | --- |
| AC-1 | 三文件齐备，无构建、无服务端依赖 | 双击 `game/index.html`：棋盘、分数区、按钮正常显示；Console 无阻断性报错 |
| AC-2 | 仅同目录相对引用；无 CDN/外链/`package.json`/框架 | 断网后刷新并游玩正常；查看源码无 `http(s)://` 资源引用 |
| AC-3 | 画布深色底 + 每格 20px 网格线；文字对比清晰 | 目视棋盘为深色、网格可见、分数可读 |
| AC-4 | 方向键四向控制；无 180° 掉头 | RUNNING 下逐向按键生效；按反向键不转向、不自撞 |
| AC-5 | WASD 与方向键等效 | 重复 AC-4 步骤 |
| AC-6 | 每次进食 score+1、长度+1、食物易位 | 进食前后对比数值与蛇长；连续 k 次均为 +k |
| AC-7 | 撞墙/撞自身立即结束并显示「游戏结束」 | 撞墙与自撞各验证一次，蛇立即停止 |
| AC-8 | `#score` 常显；`#best` 破纪录实时更新并落 localStorage；刷新/重开浏览器仍在；新局分数归零 | 检查 HUD、DevTools → Application → Local Storage 中 key `snake-game.highscore.v1`；刷新页面验证 |
| AC-9 | GAME_OVER 下 R 与 `#restart` 均可重开且恢复可玩 | 两种方式各验证一次，重开后分数归零、最高分保留 |
| AC-10 | 交付说明与实际行为一致 | 验收人按说明复现操作与结果 |
| AC-11 | `RUNNING` 下空格/`#pause` 进入 `PAUSED`（停表、蛇与食物静止、文案「继续」）；再触发恢复 `RUNNING`；`READY`/`GAME_OVER` 无副作用；暂停中「重新开始」进入新一局；分数/最高分/localStorage 不受影响 | 暂停后蛇与食物不再移动、分数不变；继续后恢复移动；按钮文案切换；暂停中点重开进入新一局且最高分保留 |

## 8. 禁止事项

1. 禁止任何外链/CDN/远程字体/远程图片/第三方库/框架/包管理器清单或构建步骤。
2. 禁止启动本地服务器才能运行；禁止依赖 `fetch`/XHR/WebSocket 等网络能力。
3. 禁止修改交付范围外的文件；禁止把产物写到 `game/` 以外的目录。
4. 禁止改变本契约约定的 id、键位映射、状态名、localStorage key、棋盘规格与文案；如需变更，须先由策划出新版本契约，不得实现方自行偏离。
5. 禁止用 `alert`/`confirm`/`prompt` 承载结束、重开或暂停交互；结束提示必须在页面 overlay 内呈现。
6. 禁止将最高分写入 `localStorage` 之外的位置（cookie、URL、文件等），也不得做任何跨设备同步。

## 9. 变更与版本

- 本契约为 v2（新建文件，不原地修改 v1）；任何约定变更须新出 `snake-game-contract-v3`，并同步更新提案、架构、模块清单与名单中的引用。
- 实现方若认为契约存在不可实现或矛盾之处，应回报告阻塞并指明条目，不得自行改约。
