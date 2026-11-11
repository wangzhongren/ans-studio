# RR20 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B23 候选；A3 最终化待恢复未重试而停）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR20 = B23 修复后的真机全链复验，预算同 RR19 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `6482387e03f4d09775c9bae7e96a87207ebbe563`（B23：project_state [versions] 行输出应用计算的 sha256；convener fixed 上下文与 team-plan/v3 指引以 project_state/versions.jsonl 为唯一哈希来源并禁止 convener shell 算 hash）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR20 批准（消息 1；卡 ≤4（3 确认卡 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR20 未通过（A3 卡点：fixed finalize 待恢复未重试）——A1–A2 完成；A3 意图卡客户 confirm 后，应用最终化报 `intent-entry-missing`（意图入口 `docs/intents/snake-game-mvp.md` 尚未落盘）并进入 `fixed-finalize-pending / pending-recovery`；chief 随后在待恢复回合内写出该入口文件（05:29:55）且回合完成（05:30:10），但应用未重试最终化，`stage.completed A3` 从未写入，链路停在 A3；驱动 12 分钟无账本进度后 stall 停止**。B23 未被行使（未到 A9）；A4–A13/merge 未到达。**RR 不通过，不伪造通过**。修复方向（下一缺陷候选）：A3 最终化的 pending-recovery 需在 chief 写入入口/回合结束后幂等重试，或由应用在呈卡前写/校验入口。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr20-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `6482387`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR20；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR19–RR1 与两旧贪吃蛇根共 **21/21 true**（本轮所有脚本仅写入 RR20 运行根） |
| 驱动 | RR8 修正版 + decision 卡支持；RR20 预算常量：总 60、chief 18、convener 14、实现写 8（与 RR19 相同） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 05:26:50.464 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 05:26:57.938 | `workflow.started wf-0a6130b23466c6fb41dd0cfe` + `stage.requested A1` | `workflows.jsonl` |
| 05:27:37.145 | `stage.dispatched A1` | `workflows.jsonl` |
| 05:28:13.234 / 05:29:01.053 | A2 requested / **completed**（B19 唤醒） | `workflows.jsonl` |
| 05:29:17.528–.782 | **A3 意图卡** `req-6ac2c05bb4d06126`（「意图确认：贪吃蛇游戏 v1（最小可玩）」）客户 confirm（request.resolved by customer） | `tasks.jsonl`、`drive.jsonl` |
| **05:29:17.805** | **`workflow.card.stage-event.failed`**：`intent-entry-missing`——「意图入口缺失或 intentId 不一致：docs/intents/snake-game-mvp.md（chief 写后重试；幂等）」 | `diagnostics` |
| 05:29:17.819–.821 | `intent.confirmation.fixed-finalize-start`（path=docs/product/snake-game-intent-v1.md，phase=prepared）→ **`intent.confirmation.fixed-finalize-pending`（phase=pending-recovery）** | `diagnostics` |
| 05:29:55.261 | chief 在待恢复回合写出 `docs/intents/snake-game-mvp.md`（intentId=snake-game-mvp、flowId=snake-game，与产品意图一致） | `target/docs/intents/snake-game-mvp.md` |
| 05:30:10.653 | chief 回合 `turn.settled completed`（该回合结束）；**应用未重试最终化，无 `stage.completed A3`** | `diagnostics` |
| 05:41:2x | 最后账本进度 05:29:17；驱动 `stalled-no-progress-12min` 停止 | `final-report.json` |
| 05:41:5x | 证据落盘；Electron 关闭 | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **1**（intent-confirm；proposal/appointment/merge-main/decision 均未到/未发）；真实任务 **4**（chief 2、convener 2；按接收：convener 2、product 2）；Git 0（目标无 `.git`）；总墙钟约 **14.5 分钟**（05:26:50–05:41:2x；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1 dispatched；A2 completed（B19）；A3 意图卡客户 confirm；**A3 最终化 `intent-entry-missing` → pending-recovery；chief 补写入口并回合完成，但无重试、无 `stage.completed A3`；stall 停止**；B23 未行使；A4–A13/merge 未到达 | **fail（A3 最终化待恢复未重试）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl` 止于 A3 requested；目标仅 `docs/product/snake-game-intent-v1.md` 与 `docs/intents/snake-game-mvp.md`；**无角色卡、无 scheduling/quality、无 `.git`、无 shell 审计、无 legacy trunk/runs/stable**；客户卡 1（≤4） | **fail**（链路停在 A3） |
| **RR-05** 失败即停 | 12 分钟无账本进度后 stall 停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 1（≤4；decision 0≤2）；真实任务 4（≤60；chief 2≤18、convener 2≤14；product 2≤3；实现写 0≤8）；Git 0（≤12）；墙钟约 14.5 分钟（≤90） | **within budget** |

**结论**：AC-30 不成立（A3 卡点）；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读定位；未改任何代码）

**正向（A1–A2）**：fixed 注入与 A1 派发正常；A2 completed 后 B19 唤醒幕僚并呈现 A3 意图卡；客户 confirm 的 UI 语义正常（`request.resolved by:"customer" choice:"confirm"`）。

**失败链（A3 最终化待恢复未重试）**：
1. 05:29:17.782 客户确认 A3 卡；应用随即执行 fixed finalize：05:29:17.805 `workflow.card.stage-event.failed`，错误码 **`intent-entry-missing`**（意图入口 `docs/intents/snake-game-mvp.md` 尚未落盘或 intentId 不一致；提示「chief 写后重试；幂等」）。
2. 05:29:17.821 `intent.confirmation.fixed-finalize-pending`（phase=`pending-recovery`）：最终化被挂起等待补救。
3. chief 的待恢复回合于 **05:29:55.261** 写出 `docs/intents/snake-game-mvp.md`（与 `docs/product/snake-game-intent-v1.md` 的 intentId/flowId 一致），回合于 05:30:10.653 正常结束。
4. **应用没有在入口出现或回合结束后重试最终化**：无 `stage.completed A3`，无 A4；05:29:17 后无任何账本进度；驱动按 12 分钟 stall 规则停止（05:41:2x）。
5. 期间无 shell 审批卡（本轮未尝试 shell hash）；无 legacy/stable 写入。

**根因（产品/流程）**：fixed A3 finalize 在入口文件缺失时进入 `pending-recovery`，但该恢复路径没有实际重试机制（不响应文件出现、也不响应 chief 回合结束），`stage.completed A3` 永不发生，固定链在首张确认卡后死锁。**修复方向（B24 候选）**：待恢复 finalize 在 chief 写入入口/回合结束时幂等重试（或在呈卡前由应用写入/校验入口并明确失败），成功后发 `stage.completed A3` 并唤醒幕僚推进 A4。**B23 未被行使（未到 A9），不能据此判定 B23 失败。**

---

## 五、预算实际 vs 批准（RR20）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **1**（intent-confirm；decision 0） |
| 真实任务 | ≤60（chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8） | **4**（chief 2、convener 2；接收：convener 2、product 2；实现写 0） |
| Git add/commit | ≤12 | **0**（目标无 `.git`） |
| 墙钟 | ≤90 分钟 | 约 **14.5 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **8**（8 completed）· convener **6** · product **4**；native transcript：chief 72 msgs / in **93,812** / out **37,620** / cache read **3,350,784**；convener 57 / **94,967** / **36,175** / **2,071,936**；product 33 / **52,635** / **18,121** / **540,672**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 31 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（stalled-no-progress-12min） | `943bc57ec84defaafdda2d6cca2cc38ddfb407c9636c5e8e48b0e6bc9386b08f` |
| `budget.json` | `214ef66e16eddfbd75159d776c2691fdef128dcf163a284e1c97f4abe923a240` |
| `drive.jsonl` | `03eba17890f2dff175d4816ce663249377d789152a30c76847df2e0acdaa821d` |
| `tasks.jsonl`（4 任务） | `bf38714a9ebd774d63e1d2b0ea54c033b22928d00635bc0465d0f6d77e18b0ba` |
| `workflows.jsonl`（A1–A3 requested） | `aba0638ed6a4ca3c1d354b14f13d0077b0f80185ae306ae0d6ca0bb9b064b8e9` |
| `rr20-facts.json` | `c7d884f1de080056f5c64fd2be914ce7145a82ed75dd4bcabe376b4b637b175e` |
| `root-cause-code-pointers.txt` | `45260a27eb42a28d1a01eaabfb81376c0f22a1c143cd32e2bc24f7e11fb4771a` |
| `zero-touch.json`（21 旧根全 true） | `ca8cc2a72990c7fe6ecb7d33f7114a71828453461407ff4536db6dcef0ca7c95` |
| `usage-extract.json` | `527bc51d5055b7d4ea6cf14adb66f639e8d3ce3a2d7c7fe8c6816d18dd1b11c2` |
| `snake-game-intent-v1.md` / `snake-game-mvp-intent.md` | 见 `sha256sums.txt`（意图入口与产品意图 intentId 均为 snake-game-mvp） |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `c5526d48…` / `4c92e283…` / `22f0793b…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr20-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过任何门；本轮所有驱动/脚本仅写入 RR20 运行根（旧运行根 21/21 零触碰）。
- **RR20 结果如实为未通过（A3 最终化待恢复未重试），不按通过处理；B23 未获行使，不作其失败判定。**
