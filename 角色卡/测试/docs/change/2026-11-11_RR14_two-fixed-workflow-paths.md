# RR14 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B18 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR14 = B18 修复后的真机全链复验，预算同 RR13 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `82d592f625c27e2696775c72cb732a5a9eab24ec`（B18）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR14 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR14 未通过（RR-02 fail）——B18 生效（A2 stage-request accepted 收口不再要求产物证据；A2 阶段 completed），但 A2 完成后运营（convener）的完成报告未唤醒幕僚，A3 意图卡未呈现；双方空闲 12 分钟无账本进度，驱动 `stalled-no-progress-12min` 停止**。**B17 未行使（A8 未到达）**；B16/B15/B14/B13 未在本轮到达行使点。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr14-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `82d592f`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR14）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR13–RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十五项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9–RR14 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 03:31:31–03:31:36 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（03:31:34.897） | `drive.jsonl`、`customer-message.txt` |
| 03:31:44.810 | `workflow.started wf-f667bf7b9176d59bea6fc957`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 03:32:12.345 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 03:33:05.758 | `stage.requested A2` | `workflows.jsonl` |
| 03:33:31.597 | **B18 生效**：A2 stage-request 任务 `t-mwbkdavy-fa9a0cd4` **accepted 收口**（不要求产物证据；运营报告仅 done） | `tasks.jsonl` |
| 03:33:48.521 | 产品 A2 任务 `t-mwbkdi9s-c7924e92` accepted 收口 + **`stage.completed A2`** | `workflows.jsonl`、`tasks.jsonl` |
| 03:33:55.372 | 运营（convener）回合结束，报告「A2 已完成，我核对了文件实际内容…」；**此后未触发幕僚新回合** | `replay-convener.jsonl` |
| 03:33:35.307 | （幕僚上一回合结束——早于产品任务收口） | `replay-chief.jsonl` |
| 03:33:48 之后 | 无任何账本进度；A3 意图卡未创建；幕僚与运营均空闲 | 账本 |
| 03:45:51.590 | 驱动 `stalled-no-progress-12min` 停止（最后账本进度 03:33:48.521） | `final-report.json` |
| 03:45:54 前后 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **0**（A3 未到达）；真实任务 **4**（chief stage-request 2、convener→product 2）；`task.reported` 8；`task.closed` 4（均 accepted）；Git 0；模型 settled：chief 7 / convener 6 / product 4。总墙钟约 **14.1 分钟**（03:31:34–03:45:51；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2 stage-request accepted（B18）→ A2 completed → **运营完成报告未唤醒幕僚；A3 意图卡未呈现；双方空闲 12 分钟 → 停止**。A3+、角色卡/激活、A9/A10/A11/A12/merge 未到达；B17 未行使 | **fail**（A2 完成后唤醒/推进缺口） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested/dispatched、A2 requested/completed；**无 A3**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；无 shell-gate 审计；无 `.git`；无 `角色卡/`；客户卡 0 | **fail**（链路在 A2 后空闲） |
| **RR-05** 失败即停 | 无新动作 12 分钟无进度，驱动 stall 停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 0（≤4）；真实任务 4（≤40；chief 2≤12、convener 2≤10、product 2≤3；rapporteur/nominator/verifier 0；实现写 0）；Git 0（≤12）；墙钟约 14.1 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B18 实测）**：
1. **B18 生效**：A2 stage-request 任务 `t-mwbkdavy-fa9a0cd4` 在 03:33:31 **accepted 收口**（不再要求产物证据；运营报告 done 即可）；随后产品 A2 任务 `t-mwbkdi9s-c7924e92` accepted（03:33:48）并记录 `stage.completed A2`；**`stage-request-open` 未再现**。
2. 无 `.ans/trunk`/`.ans/runs`/stable-write；无 shell-gate 审计；无 `.git`；`docs/product/snake-game-intent-v1.md`（6,749 B）与 `docs/workflow.md` 在位。

**失败链（A2 完成后的唤醒/推进缺口）**：
1. 幕僚在 03:33:35 结束回合（其最后动作是对「A2 派发重复投递」的核实；此时产品 A2 任务尚未收口）。
2. 产品 A2 任务于 03:33:48 由运营 accepted 收口，`stage.completed A2` 入账；运营随后在 03:33:55 回合结束并报告「A2 已完成…」。
3. **该完成报告未触发幕僚新回合**（幕僚 replay 在 03:33:35 后无新事件；无 `finalizeIntent`/A3 卡创建）；双方空闲；12 分钟无账本进度 ⇒ 驱动 stall 停止。
4. 待产品/协调方修复方向（不在测试角色范围）：(a) fixed 路径需在 `stage.completed`（A2）后唤醒幕僚/呈 A3 的应用事件或报告投递（而非依赖运营在已收口 stage-request 任务上的事后报告）；(b) 或运营应在产品任务收口后以新 handback/报告唤醒幕僚；(c) 检查「stage-request task 已 accepted 后 convener 的后续报告」是否被投递/消费（本次未见幕僚回合）。

---

## 五、预算实际 vs 批准（RR9–RR14 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **0** |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **4**（chief 2、convener 2、product 2；rapporteur/nominator/verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **14.1 分钟**（03:31:34–03:45:51 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **7** / convener **6** / product **4**（均 completed）；原生 transcript：chief 32 assistant msgs / input **116,423** / output **27,503** / cache read **1,258,496**；convener 53 / **83,162** / **32,927** / **1,600,256**；product 39 / **54,768** / **19,981** / **790,400**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（27 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（stalled-no-progress-12min） | `f3d1d6968cdc1eca6baa0f27e48e66232349fee47c4427977dd8f42c9ea11158` |
| `budget.json` | `96c0342d038b76a0956123a746e196bea23a99c9579df7cd8a6be8d6cca9fef8` |
| `drive.jsonl` | `c30eff223b17ed2530ada5d6123908e362a3d1bb01d96cf4970538642d4e8c15` |
| `tasks.jsonl`（4 任务/8 报告/4 收口） | `62f5ce6fcc643eeea000d6d3acd6bc565c891395c699e7c08db22bd41d0a5c6e` |
| `workflows.jsonl`（A1/A2；无 A3） | `ecedbdc49d4a1433f3b3ea84f36c99769000619668416ed120ff3679dd3ec307` |
| `snake-game-intent-v1.md` | `9d138e94612204aa5de6c40a5eb32a4c08035f41e83bed84b5f473da07a52792` |
| `workflow.md` | `54361071af9412836a49fa3f93a2ca02cc47b02eba73d83e0dd41e38d553ab01` |
| `rr14-facts.json` | `267a92a738a7be2fb07894cab188d1e5bef2600138f7a6a65cad65b0fa1ee5c4` |
| `root-cause-code-pointers.txt` | `ea916d39a44ec68d5f09bde0e4a66834d7e08220a21cd15659cb351fe4a979df` |
| `zero-touch.json`（十五旧根零触碰） | `4cfdb0dc592ec02b630962072a18f25c77593350e4936ebbe59c1bd0a2355e90` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `b704c38a…` / `229d5e2e…` / `1c8b8c48…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr14-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。
- **工作树并发披露**：RR14 启动时工作树干净（tracked 修改=0，HEAD 82d592f）；运行停止后另一会话于 2026-11-11 11:47:41 +0800（03:47:41 UTC，即 RR14 停止后）在共享工作树写入未提交的 `app/desktop/session.ts`（B19 修复进行中，+12/−4）。RR14 的 Electron 在 03:31 启动时已加载 82d592f 版本（on-disk 修改不改变已加载进程），**RR14 判定基于 82d592f**；该未提交修改非本角色所写、未参与 RR14 运行。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十五项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR14 结果如实为未通过（A2 完成后唤醒/推进缺口）**；B17 未被行使。
