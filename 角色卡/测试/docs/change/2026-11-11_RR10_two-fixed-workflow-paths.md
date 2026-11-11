# RR10 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B14 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR10 = B14（含 B13.1/B13.2）修复后的真机全链复验，预算同 RR9 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `f45b93dc08d654ff16f602370b36d976d31f454a`（B14）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR10 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR10 未通过（RR-02 fail）——链到达 A6 后，A5 阶段机卡死（`close_created_task accepted` 返回 `stageCompleted=false`；A5 停留 `A5(requested)`；A7 stage-request 被 `stage-transition-invalid` 拒绝），6 分钟无阶段恢复，驱动按 `blocked-unrecovered` 停止**。正向：**B13.1 生效**（A3 意图卡客户 confirm 后 `stage.completed A3` 成功）；**B13.2 生效**（A2/A5 任务 accepted，无 `close-report-missing`）；**B14 生效**（无 shell-gate 审计、无 shell 探测）；A1–A6 多阶段推进、5 份文档产出；**无 `.ans/trunk`/`.ans/runs`/stable-write**。缺陷：A5 阶段机不完成、A6 方案卡重复呈现（「重试登记」，2 张）。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr10-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `f45b93d`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR10）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR9/RR8/RR7/RR6/RR5/RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十一项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9/RR10 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 01:03:49–01:03:52 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（01:03:50.629） | `drive.jsonl`、`customer-message.txt` |
| 01:04:01.883 | `workflow.started wf-60eba396add48c4baf463c80`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 01:04:14.211 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 01:05:04.076 | `stage.requested A2`；产品意图撰写（A1 曾 blocked 澄清 → rework 收口解除；A2 推进） | `workflows.jsonl`、`tasks.jsonl` |
| 01:07:33.760 | **`stage.completed A2`**（B13.1/B13.2：单 accepted 收口 + 纯路径证据） | `workflows.jsonl` |
| 01:08:02.614–01:08:03.079 | **A3 intent-confirm 卡**（`req-2edb575e858d7c3d`）客户 confirm；**`stage.completed A3`**（B13.1 生效） | `tasks.jsonl`、`drive.jsonl` |
| 01:08:51.505 | `stage.dispatched A4`（convener→rapporteur A4） | `workflows.jsonl` |
| 01:09:08–01:13:48 | A5 stage-request 多次（含失败重复投递与重试）；rapporteur 产出 `docs/proposals/snake-game-proposal-v1.md`、`modules-v1.md`、`roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md`、`gamecore-v1.md` | `workflows.jsonl`、`docs/` |
| 01:12:06 / 01:15:22 | **A6 方案卡（2 张）**：`req-ac62e6cfa6eeb2b0` 与 `req-c9fbcf7566604c81`（「方案确认（重试登记）」）；驱动均按客户 accept（`request.resolved customer:accept`） | `tasks.jsonl`、`drive.jsonl` |
| 01:13:22.842 | **`stage.blocked A5`**（`task-report-failed`：A5 重复/失败投递任务以 rejected 关闭） | `workflows.jsonl` |
| 01:15:35.391 | 幕僚 `project.note`：**A5 文档齐全且生产任务 accepted，但 `close_created_task` 均返回 `stageCompleted=false`；阶段机停在 A5(requested)；A7 stage-request 被 `stage-transition-invalid` 拒绝**；已重试（rework/rejected/只读复核/方案卡二次确认）均未推进；属应用阶段机侧问题 | `tasks.jsonl`、`rr10-facts.json` |
| 01:19:23.366 | 驱动 `blocked-unrecovered`（A5 `stage.blocked` 6 分钟无 `stage.completed`）停止 | `drive.jsonl`、`final-report.json` |
| 01:19:25.625 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **3**（intent-confirm 1 + proposal 2；均客户作答 confirm/accept；第二张方案卡为应用「重试登记」）；真实任务 **13**（chief stage-request 7、convener→product/rapporteur 6；product 3、rapporteur 3）；`task.reported` 21；`task.closed` 13（accepted 9 + rework 2 + rejected 2）；Git 0；模型 settled：chief 20 / convener 16 / product 6 / rapporteur 4。总墙钟约 **15.6 分钟**（01:03:50–01:19:25；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2 completed → A3 卡客户 confirm + A3 completed → A4 dispatched → A5 文档产出（proposal/modules/roster/architecture/gamecore）→ A6 方案卡客户 accept（2 张「重试登记」）→ **A5 阶段机卡死（stageCompleted=false；A7 被 stage-transition-invalid 拒绝）** → 6 分钟无阶段恢复 → 停止。A7+、任命、实现、A12、归档、merge 未到达 | **fail**（A5 阶段机卡死） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested/dispatched、A2 completed、A3 requested/completed、A4 requested/dispatched、A5 requested ×4 + **stage.blocked A5**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**无 shell-gate 审计**（B14 正向）；无 `.git`；客户卡 3 张（≤4）；`task.reported` 21、accepted 9（B13.1/B13.2 正向） | **fail**（链路未完成；A5 阶段机；A6 重复卡） |
| **RR-05** 失败即停 | `blocked-unrecovered`（真实 A5 阶段机卡死，非文本 blocker）即停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 3（≤4）；真实任务 13（≤40；chief 7≤12、convener 6≤10、product 3≤3、rapporteur 3≤4、nominator/verifier 0、实现写 0）；Git 0（≤12）；墙钟约 15.6 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B13.1/B13.2/B14 实测）**：
1. **B13.1**：A3 意图卡客户 confirm 后 `stage.completed A3` 成功（RR8 的 `stage-transition-invalid` 已修复）；A2/A3 门正常。
2. **B13.2**：A2 产品意图任务与 A5 文档任务均 accepted，**无 `close-report-missing`**（纯路径 evidence 生效）。
3. **B14**：无 shell-gate 审计；convener 未进行 shell 环境探测（RR9 的 shell 审批面未再现）。
4. 产物齐全：`docs/product/snake-game-intent-v1.md`、`docs/proposals/snake-game-proposal-v1.md`、`modules-v1.md`、`roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md`、`gamecore-v1.md`；无 legacy 账本写。

**失败链**：
1. **A5 阶段机卡死**（幕僚 `project.note` 原文）：「A5 文档齐全（proposal/modules/roster/architecture，schema 与引用链核对通过）且 A5 生产任务已 accepted，但所有 `close_created_task` 均返回 `stageCompleted=false`，阶段机停在 A5(requested)；A7 stage-request 被 `stage-transition-invalid` 拒绝（当前 A5(requested) 不允许推进 A7）。已重试：①关闭失败重复任务（rejected）②只读复核请求 A5 ③方案卡二次确认——均未推进。属应用阶段机侧问题，需 app/装配 owner 处理；不伪造推进。」
2. **A5 `stage.blocked`**：A5 重复/失败投递任务以 `rejected` 关闭时写 `stage.blocked A5 task-report-failed`（01:13:22.842）；之后无 `stage.completed A5/A6`，6 分钟窗口耗尽 ⇒ 驱动 `blocked-unrecovered` 停止。
3. **A6 方案卡重复呈现**：`req-ac62e6cfa6eeb2b0`（01:12:06）与 `req-c9fbcf7566604c81`（01:15:22，标题「方案确认（重试登记）」）两张；均客户 accept。fixed 路径应各阶段一张；重复属产品行为（重试登记）待评审。卡总数 3 ≤4，未超预算。

---

## 五、预算实际 vs 批准（RR9/RR10 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **3**（intent-confirm 1 + proposal 2；均客户作答；第二张方案卡为「重试登记」） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **13**（chief 7、convener 6、product 3、rapporteur 3；nominator/verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **15.6 分钟**（01:03:50–01:19:25 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **20** / convener **16** / product **6** / rapporteur **4**（均 completed）；原生 transcript：chief 172 assistant msgs / input **193,304** / output **116,913** / cache read **12,573,696**；convener 150 / **182,769** / **130,771** / **9,441,664**；product 37 / **55,535** / **33,327** / **764,928**；rapporteur 60 / **180,554** / **92,245** / **2,356,096**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（34 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（blocked-unrecovered A5） | `20db3fba813687c6b641a2572046878d877585cd2774db1637906d41bbf786f5` |
| `budget.json` | `dba3627f4800b92cbabe3523a6d5dd50c9eb5d44ff57f7a913bd4bb6af95dd39` |
| `drive.jsonl` | `a1641d11ffe562217a5229293e791f82c7f22324d3bc0a2cb470600706bec63e` |
| `tasks.jsonl`（13 任务/21 报告/13 收口/3 卡） | `21da78af71db032d19dc19b4aee26ea2a768100cb337448590b9975ce26a4a07` |
| `workflows.jsonl`（A2/A3 completed；A5 requested ×4 + stage.blocked） | `103de8da695bf791ec5add4a7f8330859e40fba18650e4b9251a9b8d1e039248` |
| `snake-game-intent-v1.md` / `proposal-v1` / `modules-v1` / `roster-v1` / `architecture-v1` / `gamecore-v1` | `549e9902…` / `52d741a8…` / `d004b70f…` / `da3aac35…` / `d56e80e6…` / `1e138b05…` |
| `rr10-facts.json`（A5 阶段机/重试登记/卡/legacy 零写） | `26cc64977d6e0284c4234e4be16e550c6e4389dfc29b253389dfb39b4d4aee8b` |
| `root-cause-code-pointers.txt` | `1fd1b23cbc00cb3e0a0d123ff543f98cc97480ab7c180e06f668c7a86d5163ef` |
| `zero-touch.json`（十一旧根零触碰） | `8149bbbe5ab6831e3b6f1255bda1016accfffb86aa584cf37324b641e0cc9ade` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` / `native-rapporteur-transcript.jsonl` | `13789a38…` / `48b3bc5e…` / `dbef82ef…` / `6a1e5d47…` |
| `ui-90-gate.jpeg` | `eae6f5373302fb29518ec0b2bb0a5b24acb337af20f435a71e61dfce12f318f5` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr10-2026-11-11\evidence\`。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十一项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR10 结果如实为未通过（A5 阶段机卡死）**。
