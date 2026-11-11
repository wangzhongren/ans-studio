# RR15 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B19 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR15 = B19 修复后的真机全链复验，预算同 RR14 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `c6abb7958d317549c1b31e3823ebfa4c9263e369`（B19；含 B18/B17/B16）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR15 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR15 未通过（RR-02 fail）——A1–A7 全部推进（B18/B19 生效），A8 角色文档写入成功（B16），但 `activate_role_documents` v2 的 path-only 调用被 MCP 输入校验拒绝（`-32602`，roster 与三文档 `sha256 expected string`），应用侧 hash 回填（B17）未到达；0/2 `role.activated`；3 次重试 blocked；12 分钟无账本进度，驱动 `stalled-no-progress-12min` 停止**。A9/A10/A11/A12/merge 未到达。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr15-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `c6abb79`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR15）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR14–RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十六项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9–RR15 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 03:53:25–03:53:29 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（03:53:27.284） | `drive.jsonl`、`customer-message.txt` |
| 03:53:36.862 | `workflow.started wf-dee6f19d7ab9a923c677f76e`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 03:54:20.279 | `stage.dispatched A1` | `workflows.jsonl` |
| 03:56:04.904 | **`stage.completed A2`**；**B19 生效**：A2 完成后幕僚被唤醒 | `workflows.jsonl` |
| 03:56:10.698–.868 | **A3 意图卡**（`req-d30146e9bd07dc40`）客户 confirm + **`stage.completed A3`** | `tasks.jsonl`、`drive.jsonl` |
| 03:56:34.246 | `stage.dispatched A4`（rapporteur 受理/准备） | `workflows.jsonl` |
| 03:57:37.624 | `stage.requested A5`；首次派发因引用尚未产出的契约被 delivery-rejected，任务以 rejected 关闭（`stage.blocked A5 task-report-failed`），重派后产出四份文档 | `workflows.jsonl`、`tasks.jsonl` |
| 03:58:59.195 | **`stage.completed A5`** | `workflows.jsonl` |
| 03:59:00.806–.186 | **A6 方案卡**（`req-992c6d637d48343c`，单卡）客户 accept + **`stage.completed A6`** | `tasks.jsonl`、`drive.jsonl` |
| 03:59:16.406–04:00:00.9 | `stage.dispatched A7`（nominator 受理/准备）→ accepted 收口 | `workflows.jsonl`、`tasks.jsonl` |
| 04:00:05.205–04:00:15.789 | `stage.requested A8` + `stage.dispatched A8`（nominator 建卡/激活） | `workflows.jsonl` |
| 04:00:3x | **B16 生效**：nominator 写出 `角色卡/env-bootstrap/{role-card.md,boundary.md,boundary.yaml}` 与 `角色卡/game-dev/{...}`（6 文件） | `target/角色卡/**` |
| 04:01:23–04:02:10 | **A8 激活 blocked**：`activate_role_documents` v2 以 path-only（B17 意图）调用被 **MCP error -32602 Input validation error** 拒绝——「roster 与三文档 sha256 expected string」（工具输入 schema 仍要求 sha256 字符串，应用侧回填未到达）；nominator/convener 多次重试均 blocked，0/2 `role.activated` | `tasks.jsonl`、`rr15-facts.json` |
| 04:14:12.674 | 驱动 `stalled-no-progress-12min` 停止（最后账本进度 04:02:10.101） | `final-report.json` |
| 04:14:15 前后 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **2**（intent-confirm 1 + proposal 1；均客户作答 confirm/accept；无重复）；真实任务 **16**（chief stage-request 9、convener→product/rapporteur/nominator 7；product 2、rapporteur 3、nominator 2）；`task.reported` 31；`task.closed` 14（accepted 12 + rejected 2）；Git 0；模型 settled：chief 28 / convener 24 / nominator 4 / product 4 / rapporteur 4。总墙钟约 **20.7 分钟**（03:53:27–04:14:12；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2 completed（B19 唤醒）→ A3 客户 confirm + completed → A4 dispatched → A5 completed（含一次失败投递任务 rejected 关闭）→ A6 单卡客户 accept + completed → A7 dispatched/accepted → A8 建卡成功（B16，6 文件）→ **A8 激活被 MCP 输入校验拒绝（path-only 未获 schema 接受；sha256 expected string）** → 3 次重试 blocked → 12 分钟无进度 → 停止。A9/A10/A11/A12/merge 未到达 | **fail**（A8 激活工具契约缺口） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 dispatched、A2/A3/A5/A6 completed、A4/A7 dispatched、A8 requested/dispatched；`stage.blocked A5`（已由 A5 completed 解除）；**无 `role.activated`**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；无 shell-gate 审计；无 `.git`；`角色卡/env-bootstrap` 与 `角色卡/game-dev` 6 文件在位；客户卡 2（≤4） | **fail**（A8 激活未完成；链路未到 A9+） |
| **RR-05** 失败即停 | 无新信息后 12 分钟无进度，驱动 stall 停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 2（≤4）；真实任务 16（≤40；chief 9≤12、convener 7≤10、product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 0、实现写 0）；Git 0（≤12）；墙钟约 20.7 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B18/B19/B16 实测）**：
1. **B18 生效**：A2/A5 等 stage-request accepted 收口不再要求产物证据（A5 失败重复投递以 rejected 关闭后重派，A5 正常 completed）。
2. **B19 生效**：A2 完成后幕僚被唤醒并呈 A3 意图卡（`req-d30146e9bd07dc40`，客户 confirm；RR14 的空闲卡点未再现）；A6 方案卡单卡客户 accept。
3. **B16 生效**：A8 nominator 成功写出两套角色三文件（`角色卡/env-bootstrap`、`角色卡/game-dev`，各 role-card.md/boundary.md/boundary.yaml）。
4. B15.1/B15.2/B13/B14 持续有效：A5/A6 正常完成；无 close-report-missing；无 shell-gate 审计；无 legacy trunk/run/stable。

**失败链（A8 激活的工具契约缺口，B17 未到达）**：
1. nominator/convener 报告：`activate_role_documents v2` 以 `operationId=activate-snake-game-env-bootstrap-v2`、**只传 path**（B17 目标形态）调用，返回 **MCP error -32602 Input validation error**：「roster 与三文档 sha256 expected string」——工具输入 schema 仍把 sha256 列为必填字符串，校验在 MCP 层即失败，应用侧（B17）的 hash 回填逻辑无法执行。
2. 3 次重试（含会话重建后重试）均 blocked；0/2 `role.activated`；幕僚/运营无新信息后停止；12 分钟无账本进度 ⇒ stall。
3. 待产品/协调方修复方向（不在测试角色范围）：**fixed 模式下 `activate_role_documents` 的输入 schema 需接受 path-only（sha256 可选）**，让应用侧计算并回填（B17）；或在派发/上下文中由应用提供已计算的 roster/三文档 hash 供模型传入。否则 A8 永远无法完成，A9/A10/A11/A12/merge 不可达。

---

## 五、预算实际 vs 批准（RR9–RR15 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **2**（intent-confirm 1 + proposal 1；均客户作答；无重复） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **16**（chief 9、convener 7、product 2、rapporteur 3、nominator 2；verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **20.7 分钟**（03:53:27–04:14:12 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **28** / convener **24** / nominator **4** / product **4** / rapporteur **4**（均 completed）；原生 transcript：chief 184 assistant msgs / input **195,312** / output **91,240** / cache read **12,826,752**；convener 254 / **231,321** / **132,958** / **16,393,088**；nominator 83 / **178,763** / **89,298** / **3,490,688**；product 37 / **57,792** / **17,929** / **640,000**；rapporteur 59 / **117,825** / **49,022** / **1,943,424**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（30 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（stalled-no-progress-12min） | `07881733ce86cb1660d962f8a89feaee3834cff45e9f02b797b9d54f4d245669` |
| `budget.json` | `2768c5c4d6bcf552a414f4c88682dc8238b7417489f1e5e623e0cc9eaa995b1f` |
| `drive.jsonl` | `7f910fdbbb9c71dab197387d2224ead40b780b8da42c8e88948acd6f11a67574` |
| `tasks.jsonl`（16 任务/31 报告/14 收口/2 卡） | `d390fc924ce6f4503fbc87fc7d8640ad8e70412609f0d4ffcd4a5e51899dc293` |
| `workflows.jsonl`（A1–A8；无 role.activated） | `ec9dfa55a2a6930d2e30e8e17e694158dfb91c3859cee65db56bfc12526de27d` |
| `snake-game-intent-v1.md` | `7d1d4242c0c798864ab9062f46ee6a59b19016ad9d84fd2aa00de96756f77bcd` |
| `rr15-facts.json`（A8 工具契约缺口/重试/role cards/legacy 零写） | `0390ddd23383e1501a48f2f3f623f219041914bf8f84ee17fbc4e3f833a0b683` |
| `root-cause-code-pointers.txt` | `8d1cbd4dad9f2f2ad7cf323c38ab07864a7aef5f431dd6b6495be20494f464d4` |
| `zero-touch.json`（十六旧根零触碰） | `e31f2921bc097b085c31d30cf4130f44e4cd54d2390993c35a0081ef73f29b94` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-nominator-transcript.jsonl` / `native-product-transcript.jsonl` / `native-rapporteur-transcript.jsonl` | `850ee351…` / `af62c4a2…` / `dc41dd25…` / `53e5422e…` / `758d9e44…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr15-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十六项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR15 结果如实为未通过（A8 激活工具契约缺口；B17 未到达）**。
