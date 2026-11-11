# RR21 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B24 候选；B24/B23 生效，A11 预算门停止）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR21 = B24 修复后的真机全链复验，预算同 RR20 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `607517b32a7ca418b475bede7fbf0efa0e73dd0c`（B24：A3 呈卡前校验意图入口；已确认卡幂等重跑 finalize 并补记 A3 恰一次；含 B23/B21/B22/B20 等）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR21 批准（消息 1；卡 ≤4（3 确认 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR21 未通过（RR-06 预算门：convener 派发 15 > 14）——但 B24 与 B23 均生效**：A3 意图卡在入口校验后呈现、客户 confirm 即 `stage.completed A3`（无 pending-recovery）；A9 完成且基线记录，convener 全程未用 shell 算 hash（shell 审计仅只读 git 策略行，无 certutil/Get-FileHash/PowerShell）；A8 5/5 激活、A10 五角色任命卡、A12a 经内置 verifier 收口（首派项目 qa-verifier 因写区仅 test/ 被拒后恢复）。A11 已创建 7 个模块实现任务后触发 convener 预算门停止；无实现提交（仅应用基线 `45aa1d8`）；A12b/A13/merge 未到达。**RR 不通过，不伪造通过**。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr21-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `607517b`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR21；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR20–RR1 与两旧贪吃蛇根共 **22/22 true**（所有脚本仅写入 RR21 运行根） |
| 驱动 | RR8 修正版 + decision 卡支持；预算常量：总 60、chief 18、convener 14、实现写 8 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 05:52:30.616 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 05:52:37.337 / 05:53:13.874 | `workflow.started wf-8770860170de487389ef9b49` + A1 requested（补正 05:53:00.219）/ dispatched | `workflows.jsonl` |
| 05:53:30.449 / 05:54:14.658 | A2 requested / **completed**（B19 唤醒） | `workflows.jsonl` |
| 05:54:35.835–05:54:37.478 | **A3 意图卡** `req-6319dd017faf6311`（B24：入口校验后呈卡）客户 confirm；**`stage.completed A3` 05:54:36.219（无 pending-recovery）** | `tasks.jsonl`、`diagnostics` |
| 05:54:39.459–05:54:52.743 | A4 requested（补正 05:54:47.587）/ dispatched | `workflows.jsonl` |
| 05:56:04.599–05:57:43.870 | A5 requested（多次 delivery-rejected 重派）；`stage.blocked A5 task-report-failed` 05:56:48.232（重复失败任务收口）；**`stage.completed A5` 并 `block.recovered`** | `workflows.jsonl` |
| 05:57:48.941–05:57:49.098 | **A6 方案卡** `req-280d1460db19194c`（10 模块/5 角色）客户 accept；**`stage.completed A6`** | `tasks.jsonl` |
| 05:57:53.599 / 05:58:01.253 | A7 requested / dispatched | `workflows.jsonl` |
| 05:59:17.949 / 05:59:27.213 | A8 requested / dispatched | `workflows.jsonl` |
| 05:59:51.962–06:00:27.512 | **B20 生效**：5/5 `role.activated`（game-core-dev、runtime-dev、input-ui-dev、qa-verifier、env-bootstrap）；**`stage.completed A8` 06:00:27.520** | `workflows.jsonl` |
| 06:11:13.047–06:11:45.806 | A9 requested（A8 后间隔约 11 分钟，模型侧耗时）；**`stage.completed A9`**；`basis.recorded bas-fafad9ca3daebd2fc878682a`；**无 shell 审批卡（B23 生效）** | `workflows.jsonl`、`basis.jsonl` |
| 06:12:45.658 | convener 补报 A9 部分完成（complete_team_plan 回执不确定；应用侧已完成） | `tasks.jsonl` |
| 06:13:13.561–.863 | **A10 任命卡** `req-84d336dcdfb0901f`（5 角色 checkbox）客户全选；**`stage.completed A10`** | `tasks.jsonl` |
| 06:13:55.615 / 06:14:06.111 | A12a requested / dispatched（首派项目角色 qa-verifier） | `workflows.jsonl` |
| 06:15:39.992–06:15:50.035 | qa-verifier 报 blocked：`docs/quality/snake-game-criteria-v1.md` 写入被拒（其 boundary 写区仅 `test/`）；**`stage.blocked A12a task-closed-rejected`** | `tasks.jsonl` |
| 06:17:01.623–06:17:06.737 | A12a 重新请求（内置 verifier）；**`stage.completed A12a`**、`block.recovered`、`basis.verified`；criteria 文件在盘 | `workflows.jsonl`、`basis.jsonl` |
| 06:17:45.407 | **A11 requested + dispatched** | `workflows.jsonl` |
| 06:17:56.181–06:18:25.849 | **B21 派发生效**：convener 创建 7 个模块实现任务（env-resources、entry-index→env-bootstrap；game-state、collision-boundary、scoring→game-core-dev；game-loop、restart-flow→runtime-dev） | `tasks.jsonl` |
| 06:18:26.108 | **预算门触发**：`gate.detected budget-convener-dispatches count=15`（>14）；驱动停止 | `drive.jsonl`、`final-report.json` |
| 06:18:2x | 证据落盘；Electron 关闭 | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **3**（intent-confirm / proposal / appointment；均客户作答；**decision 0**；无 merge-main）；真实任务 **29**（chief 14、convener 15；按接收：convener 13、product 2、rapporteur 3、nominator 2、qa-verifier 1、verifier 1、env-bootstrap 2、game-core-dev 3、runtime-dev 2）；**实现写任务 7**；`task.reported` 26；`task.closed` 21（accepted 15、rejected 3、rework 3）；Git 实现提交 0；总墙钟约 **25.9 分钟**（05:52:30–06:18:26；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1–A10 全链完成（B23/B24/B16/B18/B19/B20 生效；5/5 激活；A12a 经内置 verifier 收口；7 个模块实现任务已派发）；**A11 在 convener 第 15 次派发处触发预算门停止**；实现角色 3 个首回合被 halt（未写 src）；A12b/A13/merge 未到达 | **fail（预算门；链路未完成）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：A1–A10 completed、A8 5×role.activated、A12a completed、A11 requested/dispatched；`basis.jsonl` recorded+verified；`roles 卡` 5 角色三文件；**shell 审计 9 行（只读 git 策略判定，无 hash shell 命令、无审批卡）**；**无 `.ans/trunk`/`.ans/runs`/stable-write**；目标 git 仅应用基线提交 `45aa1d8`（main 与 ans/task 同点；无 tag/remote/push）；客户卡 3（≤4） | **fail**（链路未达 A12b/A13/merge；预算门） |
| **RR-05** 失败即停 | 预算门触发后立即停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 3（≤4；decision 0≤2）；真实任务 29（≤60；**convener 15 > 14 超限**、chief 14≤18；product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 1≤4、qa-verifier 1；**实现写 7 ≤ 8（未超）**）；Git 实现 0；墙钟约 25.9 分钟（≤90） | **fail**（convener 超限 1） |

**结论**：AC-30 不成立（预算门）；最终判定权属独立验收（B2）。

---

## 四、关键事实与根因（只读定位；未改任何代码）

**正向（本 RR 关键验证）**：
1. **B24 生效**：A3 意图卡在入口校验通过后才呈现（`prepareIntent` 前置校验），客户 confirm 后 **立即 `stage.completed A3`（05:54:36.219）**，无 RR20 的 `intent-entry-missing`/pending-recovery。
2. **B23 生效**：A9 完成（06:11:45.806）并 `basis.recorded bas-fafad9ca3daebd2fc878682a`；**全程无 shell 审批卡**；shell 审计 9 行均为只读 git（status/log/rev-parse 等）策略判定，**无 certutil/Get-FileHash/PowerShell 哈希尝试**——RR19 的 A9 shell 阻塞点已解除。
3. **B16/B20 生效**：A8 写出 5 个角色三文件，**5/5 `role.activated`**（game-core-dev、runtime-dev、input-ui-dev、qa-verifier、env-bootstrap），A8 completed。
4. **A10 任命卡**：5 角色 checkbox，客户全选确认；A10 completed（B15.3）。
5. **A12a 恢复路径**：首派项目角色 `qa-verifier`（boundary 写区仅 `test/`）导致 `docs/quality/` 写入被拒、任务 rejected、`stage.blocked A12a task-closed-rejected`（06:15:50.035）；chief 重新请求 A12a（内置 verifier）后 **`stage.completed A12a` 06:17:06.737**，criteria 文件在盘、`basis.verified`——应用重试恢复成功，但首派角色选择造成一次 rejected 与额外派发。
6. **B21 派发生效**：convener 创建 7 个模块实现任务（moduleId 派生路径），各角色首回合在办；**未出现 module-paths-mismatch 或写门禁拒绝**（尚未写入即被预算门中止）。
7. 无 legacy trunk/runs/stable；无交互式 shell 卡；decision 0。

**失败链（预批准预算 vs 10 模块计划）**：
1. A11 派发后，convener 逐模块创建实现任务：06:17:56 env-resources、06:18:07 entry-index、06:18:11 game-state、06:18:15 collision-boundary、06:18:19 scoring、06:18:22 game-loop、06:18:25 restart-flow（7 个，计划共 10 个模块）。
2. convener 派发累计 **15**（staging：product 2、rapporteur 3、nominator 2、qa-verifier 1 + A12a 相关重派等；模块：7）> 批准 14；06:18:26.108 预算门 `budget-convener-dispatches` 触发，驱动停止并 halt；3 个实现角色首回合被中止（未写文件）。
3. 目标 git：`45aa1d8 ANS baseline: ans-managed .gitignore`（应用自建；main 与 `ans/task/wf-8770860170de487389ef9b49` 同点；无 tags/remotes；工作区干净）。**无实现提交、无推送、无合并。**
4. 若继续：实现写任务将达 10 > 批准 8；convener 需 ≥18 次派发。**批准的预算低于 10 模块计划的自然需求。**

**根因（协调层预算口径 + A12a 角色选择）**：
- B21 一模块一任务使派发/写任务数与模块数线性增长；RR21 的 10 模块计划需要 ≥10 实现写任务与约 18 次 convener 派发，而批准为 8/14。建议按模块数设定预算（实现写 ≥ N；convener ≥ staging + N + 重试余量），或模块任务单列预算。
- A12a 应派给内置 verifier（写区含 docs/quality）或写区覆盖 docs/quality 的角色；项目 QA 角色 boundary 仅 test/ 时会先失败一次（本轮已由重派恢复）。
- B24/B23 均按预期工作；B21 的写区行为仍待「实现角色实际写入/提交」的完整轮次验证。

---

## 五、预算实际 vs 批准（RR21）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **3**（intent-confirm / proposal / appointment；decision **0**；无 merge-main） |
| 真实任务 | ≤60（chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8） | **29**（chief 14、**convener 15（超 1）**；接收：convener 13、product 2、rapporteur 3、nominator 2、qa-verifier 1、verifier 1、env-bootstrap 2、game-core-dev 3、runtime-dev 2；**实现写 7≤8**） |
| Git add/commit | ≤12 | 实现 **0**；应用自建基线 **1**（`45aa1d8`，非模型、未推送/合并） |
| 墙钟 | ≤90 分钟 | 约 **25.9 分钟**（05:52:30–06:18:26 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **33**（33 completed）· convener **24**（23/1 aborted）· rapporteur **4** · nominator **3** · product **3** · verifier **2** · qa-verifier **1** · env-bootstrap **1**（0/1）· game-core-dev **1**（0/1）· runtime-dev **1**（0/1）；native transcript：chief 204 msgs / in **153,524** / out **101,534** / cache read **14,745,088**；convener 222 / **186,901** / **113,336** / **14,930,560**；rapporteur 73 / **159,368** / **96,939** / **2,811,136**；nominator 87 / **147,843** / **79,524** / **4,148,736**；verifier 22 / **110,649** / **17,525** / **457,344**；qa-verifier 38 / **68,862** / **33,277** / **730,368**；env-bootstrap 27 / **72,824** / **20,037** / **405,888**；game-core-dev 19 / **64,752** / **3,863** / **230,016**；runtime-dev 10 / **52,049** / **1,101** / **62,976**；product 29 / **50,820** / **20,448** / **503,296**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 73 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:budget-convener-dispatches） | `672ef1fefc4ca51e07d36b51a60d25ee60a47101eb6c70aa612d3cc0fe177fde` |
| `budget.json` | `2375372d798c475a05acc205d2534365bd1a03bed6c420aa757407ec3709df3c` |
| `drive.jsonl` | `15c2bd92716b04c4154670fb9dbb1594901a9a4ef240db694e280d1c02a97a53` |
| `tasks.jsonl`（29 任务/34 报告） | `7d17d3ee348d0ae415d1015e53a5497158fbdb91b9b8011f5a4a23a694cf8a0b` |
| `workflows.jsonl`（A1–A11 + A12a；5 role.activated） | `aae67be9a32f81a92a29a09a4ad8a885c0edc2b999bc1dc999850ea4d74a066b` |
| `rr21-facts.json` | `03ee85cb488925a6d6162e0ff2fed23ffa9f45ebbb7c12d183a6375a044eaf8d` |
| `root-cause-code-pointers.txt` | `9069cdcc342272f8e4ec80c361ff1cd1927d62a3d9293566fe35163fcf007aa7` |
| `zero-touch.json`（22 旧根全 true） | `1618d896a44d967015ae9d6b8140b0cd2f030228b5c55d1c6f6941710efe3b56` |
| `usage-extract.json` | `cb2b171e3054ce0f3092b99d950eacc5c955469a48e5d44196cd1a34e209c098` |
| `snake-game-criteria-v1.md`（A12a，内置 verifier） | `f4694db5eb8c824a5fdbe64a753ed4265f00ed3fae209973a0075cccfcddb99a` |
| `snake-game-team-v1.md`（A9） | `b5fff862095ede87c9144041124ca99c75c1a5468c1cbf72c5d6070220d5dbb6` |
| `shell-gate.jsonl`（9 行只读 git 策略判定，无 hash shell） | `35db9b32c2657c5b3887fae08260ac0a4fae9c5567068b60a104d5827ef4af88` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-verifier-transcript.jsonl` / `native-qa-verifier-transcript.jsonl` / `native-env-bootstrap-transcript.jsonl` / `native-game-core-dev-transcript.jsonl` / `native-runtime-dev-transcript.jsonl` | `89a5c11c…` / `63909efe…` / `e5dd8202…` / `e1351161…` / `15054b16…` / `60dd9cf9…` / `45589da5…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr21-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。3 个实现角色首回合与 convener 1 回合 settled 为 `aborted`：驱动 halt/stopSession 终止在办回合。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过预算门；本轮所有脚本仅写入 RR21 运行根（旧运行根 22/22 零触碰）。
- **RR21 结果如实为未通过（convener 预算门 15>14），不按通过处理；B24/B23 已获有效行使。**
