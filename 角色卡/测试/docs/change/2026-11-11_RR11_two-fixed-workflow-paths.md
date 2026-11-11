# RR11 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B15 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR11 = B15.1/B15.2/B15.3 修复后的真机全链复验，预算同 RR9/RR10 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `33d0d376b72f1e4f8ac8ba6d63d31f9960cd56cd`（B15；含 B13/B14）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR11 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR11 未通过（RR-02 fail）——A1–A7 全部推进后，A8 建卡门禁与固定路径阶段顺序死锁（角色卡草稿要求「A9 已完成计划 + 当前 D3 任命选择」，但 A9 需 A8 completed、A10 任命卡需 A9 completed），6 分钟无阶段恢复，驱动按 `blocked-unrecovered` 停止**。正向：**B15.1 生效**（A5 accepted+证据即完成，RR10 的 A5 卡死未再现）；**B15.2 生效**（A6 方案卡 fail-closed/幂等，单卡、无重复）；B13.1/B13.2/B14 持续有效。**B15.3（A10 任命卡）未到达**。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr11-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `33d0d37`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR11）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR10/RR9/RR8/RR7/RR6/RR5/RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十二项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9/RR10/RR11 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 01:46:21–01:46:25 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（01:46:23.445） | `drive.jsonl`、`customer-message.txt` |
| 01:46:31.138 | `workflow.started wf-049f1e4dc73866470894fcef`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 01:47:08.502 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 01:48:16.218 | **`stage.completed A2`** | `workflows.jsonl` |
| 01:48:33.907–01:48:34.178 | **A3 意图卡**（`req-c958be6735438295`）客户 confirm + **`stage.completed A3`** | `tasks.jsonl`、`drive.jsonl` |
| 01:49:55.735 | `stage.dispatched A4`（rapporteur） | `workflows.jsonl` |
| 01:50:14–01:50:26 | A5 请求/重试（一次重复投递被 delivery-rejected：引用尚未产出的 `docs/contracts/snake-game-architecture-v1.md`） | `workflows.jsonl`、`tasks.jsonl` |
| 01:52:46.217 | **`stage.completed A5`**（B15.1 生效：accepted + 证据即完成，RR10 的 A5 卡死未再现） | `workflows.jsonl` |
| 01:53:16.258–01:53:16.592 | **A6 方案卡**（`req-da9ca4f2979e95ad`，单卡）客户 accept + **`stage.completed A6`**（B15.2 生效：无重复卡 `proposal-card-pending`/已完成拒绝未触发重复呈现） | `tasks.jsonl`、`drive.jsonl` |
| 01:53:32.543 | `stage.dispatched A7`（nominator） | `workflows.jsonl` |
| 01:53:55.154–01:55:05.062 | `stage.dispatched A8`（nominator）；**`stage.blocked A8`**（`task-report-blocked`）：nominator 尝试写 `角色卡/env-bootstrap/role-card.md` 被门禁拒绝（「Role drafts require the actual completed plan and current D3 selection; no old appointment-write card can substitute」），0/2 `role.activated`、零文件落盘 | `workflows.jsonl`、`tasks.jsonl` |
| 01:56:16.807–01:57:10.054 | 重试 A8（团队计划 `docs/scheduling/snake-game-team-v1.md` 已由运营落盘；nominator 再读计划后重试写卡）→ **同一门禁再次拒绝**，`stage.blocked A8` 第二次 | `workflows.jsonl`、`tasks.jsonl` |
| 01:57:30.353 | 幕僚 `project.note`：**A8 建卡门禁与固定路径阶段顺序冲突**（角色卡草稿要求 A9 已完成计划 + 当前 D3 任命选择；A9 需 A8 completed、A10 任命卡需 A9 completed ⇒ 无法推进；需 app/装配 owner 修复 fixed-path 授权或阶段顺序后重派 A8） | `tasks.jsonl`、`rr11-facts.json` |
| 02:01:05.524 | 驱动 `blocked-unrecovered`（A8 `stage.blocked` 6 分钟无 `stage.completed`）停止 | `drive.jsonl`、`final-report.json` |
| 02:01:07.783 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **2**（intent-confirm 1 + proposal 1；均客户作答 confirm/accept；**无重复卡**）；真实任务 **17**（chief stage-request 9、convener→product/rapporteur/nominator 8；product 2、rapporteur 3、nominator 3）；`task.reported` 26；`task.closed` 16（accepted 8 + rework 7 + rejected 1）；Git 0；模型 settled：chief 27 / convener 22 / nominator 5 / product 4 / rapporteur 4。总墙钟约 **14.6 分钟**（01:46:23–02:01:07；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2/A3 completed（A3 客户 confirm）→ A4 dispatched → **A5 completed（B15.1）** → **A6 单卡客户 accept + completed（B15.2）** → A7 dispatched → **A8 建卡门禁/阶段顺序死锁（两次 blocked，0/2 激活，零落盘）** → 6 分钟无阶段恢复 → 停止。A9/A10/A11/A12/归档/merge 未到达；B15.3 未到达 | **fail**（A8 死锁） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested/dispatched、A2/A3/A5/A6 completed、A4/A7 dispatched、A8 requested ×2 + **stage.blocked A8 ×2**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**无 shell-gate 审计**；无 `.git`；无 `角色卡/` 目录（0/2 激活）；客户卡 2（≤4）；`task.reported` 26、accepted 8（B13/B14 正向） | **fail**（A8 死锁；链路未完成） |
| **RR-05** 失败即停 | `blocked-unrecovered`（真实 A8 阶段阻塞）即停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 2（≤4）；真实任务 17（≤40；chief 9≤12、convener 8≤10、product 2≤3、rapporteur 3≤4、nominator 3≤4、verifier 0、实现写 0）；Git 0（≤12）；墙钟约 14.6 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B15.1/B15.2 实测）**：
1. **B15.1**：A5 accepted + 证据即完成——`stage.completed A5` 于 01:52:46.217 入账；RR10 的 A5 阶段机卡死未再现。
2. **B15.2**：A6 方案卡 fail-closed/幂等——仅 1 张 `proposal` 卡（`req-da9ca4f2979e95ad`），客户 accept 后 `stage.completed A6`；**无重复方案卡**（`proposal-card-pending`/已完成拒绝未触发重复呈现）。
3. B13.1/B13.2/B14 持续有效：A2/A3 正常完成；A2/A5 任务 accepted 无 `close-report-missing`；无 shell-gate 审计。
4. 产物：`docs/product/snake-game-intent-v1.md`、`docs/proposals/snake-game-proposal-v1.md`、`modules-v1.md`、`roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md`、`docs/scheduling/snake-game-team-v1.md`；无 legacy trunk/run/stable-write。

**失败链（A8 建卡门禁与固定路径阶段顺序死锁）**：
1. nominator 按 roster（`project-roster/v4`，2 角色、6 模块）与 `proposalDecisionId=decision-req-da9ca4f2979e95ad` 准备写角色卡三文档 `角色卡/<role>/…`，被写入门禁拒绝，原文：「Role drafts require the actual completed plan and current D3 selection; no old appointment-write card can substitute」。同任务 0/2 `role.activated`、零文件落盘，nominator 未伪造激活。
2. 幕僚将 A8 调度请求以 rework/blocked 收口并重试（团队计划 team-v1 已由运营落盘；nominator 再读计划后重试写卡），**同一门禁再次拒绝**；`stage.blocked A8` 于 01:55:05 与 01:57:10 两次入账。
3. 幕僚 `project.note` 定论：「A8 建卡门禁与固定路径阶段顺序冲突：角色卡草稿要求『A9 已完成计划 + 当前 D3 任命选择』，但 A9 需 A8 completed、A10 任命卡需 A9 completed ⇒ 无法推进。需应用/装配 owner 修复 fixed-path 授权或阶段顺序后重派 A8。」
4. 结论：固定路径的 A8（建卡/激活）与 legacy「计划 + D3」前置互锁，形成循环依赖；A9/A10 无法到达；B15.3（A10 卡门禁）未被行使。待产品/协调方修复（如：fixed 路径 A8 以 roster + 方案决策作为合法授权，或调整 A10/A8 阶段顺序）。

---

## 五、预算实际 vs 批准（RR9/RR10/RR11 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **2**（intent-confirm 1 + proposal 1；均客户作答；无重复） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **17**（chief 9、convener 8、product 2、rapporteur 3、nominator 3；verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **14.6 分钟**（01:46:23–02:01:07 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **27** / convener **22** / nominator **5** / product **4** / rapporteur **4**（均 completed）；原生 transcript：chief 186 assistant msgs / input **147,248** / output **102,768** / cache read **13,137,920**；convener 195 / **157,932** / **95,884** / **11,073,024**；nominator 71 / **139,004** / **58,818** / **2,966,528**；product 30 / **46,822** / **8,932** / **407,296**；rapporteur 43 / **95,646** / **46,336** / **1,325,312**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（36 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（blocked-unrecovered A8） | `79e41edf4229e92d2be2501230f826a57e67bc702d7064b2fc4e617a8d582db9` |
| `budget.json` | `f92c134ac368d81eaf6d61fc80d72c8a11a63bd8d2da52886142f36b4679af4d` |
| `drive.jsonl` | `0a6d3dbf3da08ca9fc53323902e9dbe64fffd76a1d1c96b50e64a9908972447f` |
| `tasks.jsonl`（17 任务/26 报告/16 收口） | `78057957782e4ad3414139f6639e41fab98b7391d50987d1343a63e24aff0cdc` |
| `workflows.jsonl`（A2/A3/A5/A6 completed；A8 blocked ×2） | `8d3d839fffa49e992b6f7c1043b31f1b56c6dd520156a663601bdd5923b8302a` |
| `snake-game-intent-v1.md` | `c8223c0fdc12c5f4c900736ea26031c1a7a7f675d7199f7cb5800d2e23b5d507` |
| `snake-game-proposal-v1.md` | `3ca1bbedc64a32cdc3bba722be0709e263bb7c7b2515069baf1c5c8c7a80138a` |
| `snake-game-modules-v1.md` | `27cf80867aa4aeee128ddedf22ac323bf92081f0c602100ac95ecc8407e26e68` |
| `snake-game-roster-v1.md` | `663a25ff4011672c1a4e2542427d022e5c4253321b2fea8c25ab6c0062510b3d` |
| `snake-game-architecture-v1.md` | `6713b358b5050346cbb9d4f2dd035943d6c32ee6939aedf52c4d3aa5dcd33f80` |
| `snake-game-team-v1.md` | `cc5b70fe88272720b4fcacfe06d087ceb794d9310209e9b06754597ecf60ca0e` |
| `rr11-facts.json`（A8 死锁/重试/卡/legacy 零写） | `31e98f7fd93f45cdfa3b1e4d4b514209a922faf848c8a2cd1146b89862eb5c10` |
| `root-cause-code-pointers.txt`（A8 门禁与阶段顺序死锁原文） | `6e9d6eabf1bf4b938964b942f9880cee72a46ffc6b5a2bae2359effdb141375c` |
| `zero-touch.json`（十二旧根零触碰） | `03a145dfe2004d0e990a9e22555d6ee04c83866f03ef511e3c0afae8f75e7b95` |
| `native-chief-transcript.jsonl` | `405a964719af20dd2572ddd1399ab46f923edc5f4d931f973523f521196994ca` |
| `native-convener-transcript.jsonl` | `e901f092a4fc1ad0ae5caa529b2578eed7d114c6b3ebdbce2c22a7bd2923ebeb` |
| `native-nominator-transcript.jsonl` | `16ef26ac671a18ddbdb454cf2475a81cdd845c621d14ad557b6689c1a50a6136` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr11-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十二项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR11 结果如实为未通过（A8 建卡门禁/阶段顺序死锁）**。
