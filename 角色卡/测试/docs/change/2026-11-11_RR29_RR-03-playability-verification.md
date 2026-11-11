# RR29 RR-03 可玩性真机补充验证（真实浏览器，2026-11-11）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务：RR-03 可玩性真机补充验证（B2 判定唯一缺口；不改产品代码、不合 main、不打 tag）
- 对象：RR28 已合并目标工作树 `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr28-2026-11-11\target`（`main` 已含 release merge `152448a`；`index.html`、`src/game.js`、`src/styles.css`）
- 环境：本机真实浏览器 **Microsoft Edge 157.0.4341.46**（`Edg/157.0.4341.46`，CDP `Browser.getVersion` 实测），**窗口化非 headless**；CDP 调试端口 **9333**（未占用 9222/9223/9224，未开 Electron、未触碰 ANS 运行实例）；`file:///C:/Users/51054/Desktop/work/ans-two-fixed-paths-rr28-2026-11-11/target/index.html`；未读取/未打印 `.env`
- 结论：**RR-03 通过（可玩）——六项验证全部满足**：页面加载渲染、方向键改变方向、吃食物得分（≥1 分）、撞墙结束覆盖层、重开可用、无控制台报错。RR-02/RR-03/RR-04 的 B2 唯一缺口补齐。最终验收权属独立验收（B2）。

---

## 一、被游玩产物一致性（先核对，再游玩）

| 文件 | SHA-256（实测） | 与 RR28 记录宣称 |
| --- | --- | --- |
| `index.html` | `c498a5e63ba69ebc578ef61ccd92f58b3545b4e23b682cb3df6a230379a07de9` | **一致** |
| `src/game.js` | `407e54d508fc532229f16803cacc7b977b4a00b6ef789f632ca405f589a171d6` | **一致** |
| `src/styles.css` | `aaa23cf3f17cf4c834ab6574d32c6d830c8389e1877eb1214e758238fe0a8805` | **一致** |

`git log`：`main` 头 `152448a`（release merge）→ `5428a28`（game-core）→ `9ecc566`（game-entry）→ `2b9ef04`（baseline）；工作区干净（`git status --porcelain` 空）。

---

## 二、验证方式（真实 UI + CDP）

- 真实浏览器窗口打开 `file://` 页面（非 headless）；CDP 启用 `Page`/`Runtime`/`Log`/`Input`。
- **状态探针**：页面暴露 `window.Game`（init/start/restart/step/render/onKey），但蛇/食物/分数为闭包私有；采用**画布像素探针**（400×400 canvas，20×20 格，取每格中心像素：食物 `#f87171`、蛇头 `#4ade80`、蛇身 `#16a34a`）读取蛇头/蛇身/食物位置，并以 DOM 读取 `#score`、`#status`、`#overlay hidden`、`#final-score`。
- **输入**：通过 CDP `Input.dispatchKeyEvent` 发送真实方向键（ArrowUp/Down/Left/Right）与 Space；脚本按食物位置贪心转向（禁止 180° 反向、避开墙体与自身）。
- **证据**：截图 6 张（加载/方向前后/得分/结束/重开）、`drive-playability.jsonl`（探针/按键/转向时间线）、`console-log.jsonl`（console/exception/log）、`playability-summary.json`（v2 汇总）、`play3-summary.json`（结束/重开补充）。

---

## 三、逐项验证结果

| 项 | 结果 | 证据 |
| --- | --- | --- |
| ① 页面加载渲染（canvas 非空白） | **pass**：`window.Game` 存在；canvas 400×400；初始蛇头 (10,10)、蛇身 [(8,10),(9,10)]、食物 (13,8)；截图非空白（186,317 B） | `01-load.png`、`playability-summary.json` |
| ② 方向键改变蛇移动方向 | **pass**：按 ArrowUp 后蛇头 x 保持 11、y 由 10→9（连续采样 `movedUp=true`；随后沿 y 递减移动） | `02-direction-before.png`、`02-direction-after.png`、`drive-playability.jsonl`（direction.result） |
| ③ 吃食物得分增加（≥1） | **pass**：第 1 次尝试经转向吃到食物，DOM `#score`=**1**（11:52:30；探针 head=(13,8)=食物格；蛇身随之增至 4 节） | `03-score.png`、`drive-playability.jsonl`（score.reached/score.final） |
| ④ 撞墙结束覆盖层 | **pass**：蛇头撞墙后结束；`#overlay` 显示（`overlayHidden=false`）、`#status`=「游戏结束」、`#final-score`=**1** | `04-game-over.png`（play3 覆盖为真实结束态）、`play3-summary.json` |
| ⑤ 重开（restart）可用 | **pass**：按 Space 后 `#overlay` 隐藏、`#score`=**0**、`#status`=「就绪」；重开后按 ArrowUp 蛇头再次沿 y 递减移动 | `05-restart.png`、`play3-summary.json`（restartedState/postRestartMoves） |
| ⑥ 无控制台报错 | **pass**：**0 errors / 0 exceptions**；2 条 warning 均为本验证的 `getImageData` 探针触发（Canvas2D `willReadFrequently` 性能提示），非游戏错误 | `console-log.jsonl`、`playability-summary.json`（console） |

**判定**：六项全部满足 ⇒ **RR-03 通过（可玩）**。

---

## 四、说明与 tester-side 迭代披露

1. 首次驱动（v1）因在加载后约 1 秒才按方向键，蛇已接近右墙，方向采样与结束/重开截图时序错位（`movedUp=false`、结束截图捕获的是游戏进行中画面）；**不构成产品问题**。随后以 v2（`Page.reload` 后立即转向、最多 3 次得分尝试、撞墙测试）与 play3（真实结束覆盖层 + Space 重开）重做，**本记录引用的截图与日志均来自 v2/play3 终稿**。
2. 得分验证为**自动化真实游玩**（画布探针 + 真实键盘事件），非人工手玩；目标（≥1 分）在第 1 次尝试内达成。
3. 浏览器为窗口化真实 Edge（非 headless），页面经 `file://` 加载；未额外注入脚本改变游戏逻辑（探针只读画布像素与 DOM）。

---

## 五、证据（实测 hash；文件在 `_evidence/`）

| 文件 | SHA-256 |
| --- | --- |
| `01-load.png` | `874a93324eaf3ad934d28b745e328003221b3bc5852ccfcff4bdeddae6a7e63a` |
| `02-direction-before.png` | `78ea28e6049c189b22d612a450e0a3d25a06f8a627edfa42ca1d9577eafb56c8` |
| `02-direction-after.png` | `50b5e8e7977c5be275594cade34d49a5cee7f8474c9227562d715b5689466be0` |
| `03-score.png` | `87472a22acca319d1e5baf68fe301f0cd60aa51e425036b87a89c846d9fba7f3` |
| `04-game-over.png` | `44e1f3f2c39f8410ed1cda8d5cb293245b1c8b479e1d178edaf9e701a7d4fe0e` |
| `05-restart.png` | `c44f8edf384c1dcdac4141d06459fb461f122db45707d5d7c559658a3cab2927` |
| `browser-info.json`（Edge 版本/命令/URL） | `62bf10cf3389c3e50a2f770c9d8e27344cb1c4040d34973cc8bcb0a7c1d1683c` |
| `playability-summary.json`（v2 汇总） | `922c4553a0fc9fbaa3ee012df92bc81a6292acd1c0ebf47b5e74b1d2244164ab` |
| `play3-summary.json`（结束/重开） | `c7d66360479f653c102a8e9032e7b54500c54e1c6cf39ae1699a7bc20e32a600` |
| `drive-playability.jsonl`（时间线） | `2953cf7f5ba1c98c70b6a0e99f81434a73697a02986812e66eaa1696ad536da5` |
| `console-log.jsonl`（0 errors/2 probe warnings） | `54bea892434696e256e8892524f8f836e767bd56024288b6c07a02eafef6ac5b` |
| `artifact-hashes.txt`（产物核对） | `d9fe29d2e4c9b506c32b90d8451b4786ea3ab258f59440a83820f6ada0f2649d` |

完整清单以 `_evidence/sha256sums.txt` 为准（含 `record-file.json`）。

---

## 六、纪律声明

- 未修改产品代码/测试/角色卡/边界/其它文档；未合并 ans-studio main、未打 tag、未发布产物；仅将本记录与 `_evidence/` 提交到当前分支（只 add 本任务文件）。
- 未占用 9222/9223/9224；未开 Electron；未触碰 ANS 运行实例与既有运行根；未读取/打印 `.env`。
- 判定如实：**RR-03 通过（可玩），六项全部满足**；tester-side 迭代（v1 时序问题）已披露，终稿证据来自 v2/play3。
