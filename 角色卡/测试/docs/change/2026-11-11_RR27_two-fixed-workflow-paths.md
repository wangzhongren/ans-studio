# RR27 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B29+B30+B31 候选；B29/B30 生效，A11 worker 提交 argv 形状被 shell 写门硬拒）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR27 = B29/B30/B31 修复后的真机全链复验，预算同 RR26 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `daf8690f99ea81236d1966ab1d7b12fd96f08e2f`（B31 轻量验收 + B30 只读 git config 兼容 + B29 fixed complete_team_plan 形状 + B29/B30 派发文件边界 Delta `cdbdeb9`；含 B28/B27/B26/B22/B20 等）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR27 批准（消息 1；卡 ≤4（3 确认 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR27 未通过（A11 worker 的 `git commit -m` 提交消息未加引号、`-m` 后多 token，argv 形状不被 `matchTaskGit` 接受（要求 `rest.length===2 && rest[0]==="-m"`）；shell-write-guard 的「缺少 taskGitScope」文案在此场景误导——worker 会话两次均 `taskGit.scope.ready`；`blocked-unrecovered` 门停止）**。**B29 与 B30 均已真实行使且生效**：A9 的 convener `complete_team_plan` 报 **done**（无「结果未知或回执不完整」），A9/basis 一致（`bas-f7d774983be1ee15b4971b2c`）；只读 git（status/log）全程可用，**diagnostics 中 `git-config-section-unsupported` 出现 0 次**。**B31 未获行使**（A11 阻塞于提交前）：game-core-dev 已写出 `src/game.js`（9,444 B，静态核对完整）并 `git add` 成功（`A  src/game.js`）；**worker 会话两次均注入 taskGitScope（`taskGit.scope.ready` 10:29:03.295 / 10:31:37.723）**，但两次 `git commit -m feat(game-core): …` 因消息未加引号被解析为多 argv 而被 write-guard 拒绝；convener 以带引号单参数代提交（10:32:28.731）亦被拒——convener 为 stage-request 非实现会话，无 task-git scope（按设计，且 convener 不应代 worker 提交）。convener 以环境阻塞 rejected 收口 A11，6 分钟未恢复 → 门控停止。**无 commit、未到 A12b/A13/merge**。**RR 不通过，不伪造通过**。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr27-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `daf8690`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR27；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型（native transcript 记录为 **`deepseek-v4-1-flash-261017`**，实际 provider 实跑）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR26–RR1 与两旧贪吃蛇根共 **28/28 true**（所有脚本仅写入 RR27 运行根） |
| 驱动 | RR8 修正版 + decision 卡支持；预算常量：总 60、chief 18、convener 18、实现写 10 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 10:13:51.038 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 10:14:02.992 | `workflow.started wf-3890e8370a4f772e7c7efe09` + A1 requested | `workflows.jsonl` |
| 10:17:30.116 | convener 报 A1 派发受阻（会话注入 dispatch_task 仅 stage-request/forced convener；生产派发不可用）——随后以其它路径恢复 | `tasks.jsonl` |
| 10:17:41.862 / 10:18:40.891 / 10:19:27.445 | A1 dispatched / A2 requested / **A2 completed**（B19 唤醒） | `workflows.jsonl` |
| 10:19:40.684–.198 | **A3 意图卡** `req-184cd63ae5fb1d56` 客户 confirm；**`stage.completed A3` 立即写入**（B24） | `tasks.jsonl` |
| 10:19:48.090 / 10:20:03.400 | A4 requested / dispatched（一次同型投递被拒） | `workflows.jsonl` |
| 10:21:29.475–10:23:16.508 | A5 requested / **`stage.completed A5`** | `workflows.jsonl` |
| 10:23:40.928–10:24:11.491 | **A6 方案卡** `req-e5da2b8dd3cde32e` 客户 accept；**`stage.completed A6`**（注：驱动的 request 行在卡呈现后约 1.3s 才落账，驱动按 UI 分类作答） | `tasks.jsonl` |
| 10:24:22.491 / 10:24:33.915 | A7 requested / dispatched | `workflows.jsonl` |
| 10:25:47.760 / 10:25:57.226 | A8 requested / dispatched | `workflows.jsonl` |
| 10:26:35.087–10:26:39.914 | **B20 生效**：3/3 `role.activated`（env-bootstrap、game-core-dev、game-ui-dev）；**`stage.completed A8`** 10:26:39.919 | `workflows.jsonl` |
| 10:27:31.407–10:27:55.994 | A9 requested；**`stage.completed A9`**；`basis.recorded bas-f7d774983be1ee15b4971b2c` | `workflows.jsonl`、`basis.jsonl` |
| **10:28:12.188** | convener `complete_team_plan` 回执 **done**：「A9 完成：团队计划已落盘…」（**B29 生效**） | `tasks.jsonl` |
| 10:28:23.004–.216 | **A10 任命卡** `req-b4b90356a6de4d10`（3 角色）客户全选；**`stage.completed A10`** | `tasks.jsonl` |
| 10:28:34.233 / 10:28:45.881 | A12a dispatched / **A11 requested+dispatched** | `workflows.jsonl` |
| 10:29:03.237 | `basis.verified`；**B30 生效：只读 git（status/log）允许，diagnostics 无 `git-config-section-unsupported`（0 次）** | `basis.jsonl`、`diagnostics` |
| 10:29:28.524 | `stage.completed A12a`（criteria 在盘） | `workflows.jsonl` |
| 10:29:57.788 | `git add src/game.js` **allow**（`git status` 显示 `A  src/game.js`） | `shell-gate.jsonl`、`git status` |
| **10:29:59.291** | `git commit -m feat(game-core): implement …` **deny**（消息未加引号，argv 被拆分；write-guard，未执行） | `shell-gate.jsonl` |
| 10:30:11.506 / 10:31:10.753 | game-core-dev blocked（文件已写、无 commit）；convener 以 rework 收口并说明缺 commit | `tasks.jsonl` |
| 10:31:30.676 | A11 重派 | `workflows.jsonl` |
| 10:31:52–10:33:01 | 第二次 game-core 任务 blocked：worker 再次以未加引号的 `git commit -m feat(game-core): implement snake rules and state machine`（10:31:45.643，argv 同样被拆；该会话 10:31:37 已 `taskGit.scope.ready`）被 deny；convener 复述了 shell-write-guard 的误导文案「缺少任务级 Git 写被硬拒：需应用注入有效 taskGitScope…」（**经复核该文案与事实不符：scope 已就绪，失败在 argv 形状**） | `tasks.jsonl`、`shell-gate.jsonl`、`diagnostics` |
| **10:32:48.783** | `stage.blocked A11 task-closed-rejected`（环境阻塞，非质量拒收） | `workflows.jsonl` |
| **10:38:49.054** | **`gate.detected blocked-unrecovered`**（A11 blocked 6 分钟未恢复）；驱动停止 | `drive.jsonl`、`final-report.json` |
| 10:38:5x | 证据落盘；Electron 关闭 | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **3**（intent-confirm / proposal / appointment；均客户/驱动作答；decision 0；无 merge-main）；真实任务 **19**（chief 10、convener 9；按接收：convener 9、product 2、rapporteur 3、nominator 2、verifier 1、game-core-dev 2）；实现写任务 2；Git 实现提交 **0**（`src/game.js` 已暂存未提交）；总墙钟约 **25.0 分钟**（10:13:51–10:38:49；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1–A10 + A12a 完成（B29/B30/B24/B23/B20 生效；A11 首轮 module 已写入并 add，commit 因提交 argv 形状被 shell 写门硬拒；A11 rejected 后重派同因；blocked-unrecovered 停止）；无 commit、未到 A12b/A13/merge | **fail（A11 提交 argv 形状被拒）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：A1–A10 + A12a completed、A11 requested/dispatched×2 + blocked；`basis` recorded+verified；**无 `.ans/trunk`/`.ans/runs`/stable-write**；shell 审计 15 行（git status/log/add 允许；commit 硬拒；无审批卡）；目标 git 仅基线 `38ff57a`，`src/game.js` 暂存未提交；无 tag/remote/push；客户卡 3（≤4） | **fail**（A11 未提交；链路未达 A12b/A13/merge） |
| **RR-05** 失败即停 | A11 blocked 6 分钟未恢复后门控停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 3（≤4；decision 0≤2）；真实任务 19（≤60；chief 10≤18、convener 9≤18；product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 1≤4；实现写 2≤10）；Git 0（≤12）；墙钟约 25.0 分钟（≤90） | **within budget** |

**结论**：AC-30 不成立（A11 提交 argv 形状阻塞）；最终判定权属独立验收（B2）。

---

## 四、关键事实与根因（只读定位；未改任何代码）

**本轮必验点结果**：
1. **B29 生效（真实行使）**：convener 的 `complete_team_plan` 返回 **done** 回执（任务 `t-mwbz69cf-e03d69e1` 10:28:12.188：「A9 完成：团队计划已落盘 docs/scheduling/snake-game-team-v1.md（teamPlanSchema:3、version=1…）」），**无「结果未知或回执不完整」**；应用 A9/basis 一致（`bas-f7d774983be1ee15b4971b2c`），幕僚推进 A10。
2. **B30 生效（真实行使）**：只读 git（status/log）在 A9 后正常放行；**diagnostics 中 `git-config-section-unsupported` 出现 0 次**；`target/.git/config` 含 `[user] name=ANS/email=ans@local` 基线为正常（B30 允许）。
3. **B31 未行使**：A11 在提交前阻塞，未到 A12b 复验/轻量验收路径。
4. 其他正向：B28（A12a 完成、无 shell/mkdir）、B24（A3 立即收口）、B23/B20/B19/B18 正常；A10 三角色任命卡。

**失败链（A11 worker 提交 argv 形状不被接受；scope 实际存在，guard 文案误导）**：
1. game-core-dev 按任务写出 `src/game.js`（9,444 B；window.SnakeGame createGame/reset/tick/getState 等，静态核对完整），`git add src/game.js` **允许**（`A  src/game.js`）。**worker 会话的 taskGitScope 已成功注入**：diagnostics `taskGit.scope.ready role=game-core-dev` 出现在 **10:29:03.295（首派）与 10:31:37.723（重派）**；`taskGit.scope.unavailable` 的 role 仅为 convener/product/rapporteur/nominator/verifier（stage-request/非实现任务，按设计无 scope）。
2. 第一次提交（game-core-dev，10:29:59.291）：`git commit -m feat(game-core): implement game rules state machine in src/game.js` **未加引号**，argv 被解析为 `["git","commit","-m","feat(game-core):","implement","game","rules","state","machine","in","src/game.js"]`——`-m` 后多 token；`matchTaskGit` 只接受 `rest.length===2 && rest[0]==="-m"` 的单消息形态，故 **write-guard deny、未执行**。
3. 重派后第二次提交（game-core-dev，10:31:45.643；该会话 10:31:37 已 `scope.ready`）：`git commit -m feat(game-core): implement snake rules and state machine` 同样未加引号、argv 被拆，**再次 deny**。
4. convener 随后以**带引号单参数**代提交（10:32:28.731）：argv 为 `["git","commit","-m","feat(game-core): implement snake rules and state machine"]`（形状正确），但仍被 deny——**convener 是 stage-request 非实现会话，无 task-git scope（按设计），且 convener 不应代 worker 执行 git commit**。
5. convener 复述了 shell-write-guard 的笼统文案「缺少任务级 Git 写被硬拒：需应用注入有效 taskGitScope（taskId/workflowId/branch/writeSet）且路径 ⊆ 写集」——**按证据该文案在本场景误导**（worker scope 实际就绪，失败在提交消息未加引号的 argv 形状）。convener 以环境阻塞 rejected 收口 A11（非质量拒收；`src/game.js` 实现完整、无代码问题）。
6. A11 blocked 自 10:32:48 起 6 分钟无恢复（无后续 stage.completed 可清除），10:38:49 `blocked-unrecovered` 门控停止；**无 commit、无 merge**。

**根因与修复方向（B32 候选，按证据修正）**：① **A11 实现任务文本/角色指引**应要求 `git commit -m "<msg>"`（含空格必须引号，或使用无空格单 token），使 argv 满足 `matchTaskGit` 的单消息形态；② **shell-write-guard 对 `git add/commit` 的 argv 形状失败应返回可区分的明确错误（如 `task-git-argv-shape`，提示 `-m` 后须恰一个带引号参数），不得误报为「缺少 taskGitScope」**；③ **convener 指引重申不得代 worker 执行 git commit**，应 rework/re-dispatch 并明确提交语法。修复后重跑以行使 A11 提交 → A12b → **B31 轻量验收** → A13（向客户披露运行期未验证）→ merge-main 客户卡与目标 main 合并。

---

## 五、预算实际 vs 批准（RR27）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **3**（intent-confirm / proposal / appointment；decision 0；无 merge-main） |
| 真实任务 | ≤60（chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10） | **19**（chief 10、convener 9；接收：convener 9、product 2、rapporteur 3、nominator 2、verifier 1、game-core-dev 2；实现写 2） |
| Git add/commit | ≤12 | **0 提交**（`src/game.js` 已暂存；应用基线 `38ff57a`） |
| 墙钟 | ≤90 分钟 | 约 **25.0 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **33**（33 completed）· convener **24** · game-core-dev **2** · product **4** · rapporteur **4** · nominator **3** · verifier **1**；native transcript：chief 244 msgs / in **360,143** / out **92,472** / cache read **21,101,568**；convener 227 / **380,430** / **184,675** / **21,133,824**；game-core-dev 37 / **86,447** / **26,987** / **691,712**；nominator 63 / **148,988** / **41,795** / **2,189,952**；rapporteur 54 / **160,755** / **65,152** / **1,776,512**；product 21 / **52,076** / **14,259** / **277,248**；verifier 19 / **84,111** / **10,750** / **333,824**；模型 `deepseek-v4-1-flash-261017` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 61 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:blocked-unrecovered） | `92b401cd4b5e067dda7ac96f4200e2e2a3f2ed77c443af975a0847d2dbaa908f` |
| `budget.json` | `f08441f3ae2d76baff6980a50fc7dd6052b487ad5053db8ad86e6fad5fbd8791` |
| `drive.jsonl` | `4aa0cab3d6c77b1cd0737b916d1b99d6c05fe20170a46420ffebab96997274e4` |
| `tasks.jsonl`（19 任务） | `f7007a77cfc5907b21188b36f28b995daf313aaf9dab58843052ec239546c73c` |
| `workflows.jsonl`（A1–A11 + A12a；3 role.activated） | `74068424e9f14720a6b249f5ba49a02cd8662d1d736e724d36a4368daa1a3f7d` |
| `rr27-facts.json` | `9c06e26f0971304ae76845bbdc0e1abb264f145b4d65e6bcfc4d1a0442c3f1aa` |
| `root-cause-code-pointers.txt` | `669581590c3054e203f3c7c48c065a313fb1e6a7ed6774d90f6b691311f0cd82` |
| `zero-touch.json`（28 旧根全 true） | `7f9ae436bb930f3a1e93d8072c1b696b7c14143b893226e64001346cff12c3f3` |
| `usage-extract.json` | `c01433739fa2383fb37a5100213e007c93318e46cc51e46de1e2382e784d4cb4` |
| `shell-gate.jsonl`（15 行：git status/log/add 允许、commit 硬拒） | `732192e3198189e6efefadac61afe096f4f8cc1c479a40bb00fbd115d378e671` |
| `snake-game-criteria-v1.md`（A12a） | `3c985e483d00bb027db42c9ced5b2abd547fd66d2d63f7a7408d86c4019e7a93` |
| `snake-game-team-v1.md`（A9） | `dc9c5860c4c81e66eb14ab1c644eff12758968f916387dad61732a22f9e20af0` |
| `src-game.js`（写入产物，已暂存未提交） | `dd8b8e3c8a7e9913563ae36b07601b2315b600e8e0b35ce467f73ec79b11fae1` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-game-core-dev-transcript.jsonl` | `9f61d45c…` / `5e55698a…` / `c4339d5e…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr27-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。本轮无人工介入；无 tester-side 旧根触碰（28/28 零触碰）。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过任何门；本轮所有脚本仅写入 RR27 运行根。
- **RR27 结果如实为未通过（A11 worker 提交 argv 形状被 shell 写门拒绝；scope 已就绪、guard 文案误导已按证据修正），不按通过处理；B29/B30 已获真实行使且生效，B31 未行使。**
