# RR13 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B17 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR13 = B17 修复后的真机全链复验，预算同 RR12 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `7385f5cb53fb04ce49980e4e58e890624f7f91d1`（B17）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR13 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR13 未通过（RR-02 fail）——A2 stage-request 收口失败（`close-report-missing`）导致 open advance 请求未关闭，A4 stage-request 被 `stage-request-open` 拒绝；幕僚如实报告流程卡点后无新动作，12 分钟无账本进度，驱动 `stalled-no-progress-12min` 停止**。**B17 未被执行到（A8 未到达）**；B13.1 生效（A2/A3 completed，A3 卡客户 confirm）；B13.2 部分（产品任务 accepted），但**运营（convener）的 A2 stage-request 报告证据仍为描述文本**，`close_created_task` 连续 `close-report-missing`。A4+、角色卡/激活、A9/A10/A11/A12/merge 未到达。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr13-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `7385f5c`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR13）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR12–RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十四项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9–RR13 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 03:01:53–03:01:58 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（03:01:56.079） | `drive.jsonl`、`customer-message.txt` |
| 03:02:04.610 | `workflow.started wf-b5e41a07ec9e164da5f42ced`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 03:02:58.644 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 03:03:15.584 | `stage.requested A2` | `workflows.jsonl` |
| 03:04:53.790 | **`stage.completed A2`**（产品任务 accepted） | `workflows.jsonl` |
| 03:05:38.470–.918 | **A3 意图卡**（`req-83e16f4db777dbf3`）客户 confirm + **`stage.completed A3`**（B13.1 生效） | `tasks.jsonl`、`drive.jsonl` |
| 03:06:34.937 | 幕僚 `project.note`：**A2 stage-request 任务 #t-mwbjaxkw-7f77e838 无法收口**——`close_created_task` 连续返回 `close-report-missing`（要求任务报告 `evidence[]` 为纯项目相对路径，实际报告证据字符串含描述文字）；A2 阶段本身已 `stageCompleted=true`（产品任务 #t-mwbjb6b1-82d593f2）；**因 open advance 请求未收口，A4 stage-request 被 `stage-request-open` 拒绝** | `tasks.jsonl`、`rr13-facts.json` |
| 03:06:41.003 | 幕僚如实报告流程卡点并结束回合（"进度汇总（含一个必须如实报告的流程卡点）"） | `replay-chief.jsonl` |
| 03:18:37.897 | 驱动 `stalled-no-progress-12min` 停止（最后账本进度 03:06:34.937） | `final-report.json` |
| 03:18:40 前后 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **1**（intent-confirm，客户 confirm）；真实任务 **5**（chief stage-request 3、convener→product 2）；`task.reported` 8；`task.closed` 4（均 accepted）；Git 0；模型 settled：chief 10 / convener 8 / product 3。总墙钟约 **16.5 分钟**（03:01:56–03:18:37；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2 completed → A3 客户 confirm + completed → **A2 stage-request 收口失败（close-report-missing：convener 报告 evidence 描述文本）→ open advance 未关闭 → A4 被 stage-request-open 拒绝** → 幕僚报告卡点后无新动作 → 12 分钟无进度 → 停止。A4+、角色卡/激活、A9/A10/A11/A12/merge 未到达；B17 未行使 | **fail**（A2 收口/stage-request-open） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested ×2/dispatched、A2 requested/completed、A3 requested/completed；**无 A4**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**无 shell-gate 审计**；无 `.git`；无 `角色卡/`；客户卡 1（≤4）；`task.reported` 8、accepted 4 | **fail**（A2 收口死锁；链路未到 A4） |
| **RR-05** 失败即停 | 无新动作 12 分钟无进度，驱动 stall 停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 1（≤4）；真实任务 5（≤40；chief 3≤12、convener 2≤10、product 2≤3、rapporteur 0、nominator 0、verifier 0、实现写 0）；Git 0（≤12）；墙钟约 16.5 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B13.1/B13.2 部分）**：
1. **B13.1 生效**：A2/A3 正常 completed；A3 意图卡（`req-83e16f4db777dbf3`）客户 confirm。
2. **B13.2 部分**：产品 A2 任务 accepted（产品报告为纯路径）；但**运营（convener）的 A2 stage-request 报告证据仍含描述文本**（非纯路径），与 B13.2 的纯路径要求不一致。
3. B14 无 shell 探测（无 shell-gate 审计）；无 legacy trunk/run/stable；无 `.git`。

**失败链（A2 stage-request 收口死锁）**：
1. 幕僚 `project.note`（原文要点）：「A2 stage-request 任务 #t-mwbjaxkw-7f77e838 无法收口：`close_created_task` 连续返回 `close-report-missing`（要求任务报告 `evidence[]` 为纯项目相对路径，实际报告证据字符串含描述文字）。A2 阶段本身已 `stageCompleted=true`（产品任务 #t-mwbjb6b1-82d593f2）。因 open advance 请求未收口，A4 stage-request 被 `stage-request-open` 拒绝；幕僚→运营仅……」（回合以「进度汇总（含一个必须如实报告的流程卡点）」结束）。
2. 由于 A2 stage-request（chief→convener 的 open advance）无法关闭，工作流停在 A3 completed + open advance 未收口；任何下一 advance 请求（A4）均被 `stage-request-open` 拒绝 ⇒ 状态机死锁；幕僚无新动作，12 分钟无账本进度 ⇒ 驱动 stall 停止。
3. 待产品/协调方修复方向（不在测试角色范围）：(a) B13.2 的纯路径要求需同样覆盖 **convener 的 stage-request 报告**（或以应用侧证据渲染/自动归一化），使 `close_created_task` 能 accepted；(b) 或允许创建者以 rework/证据归一化收口 open advance 请求，避免 `stage-request-open` 死锁下一阶段；(c) 或为 fixed 报告 evidence 提供应用侧纯路径注入。

---

## 五、预算实际 vs 批准（RR9–RR13 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **1**（intent-confirm；客户 confirm） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **5**（chief 3、convener 2、product 2；rapporteur/nominator/verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **16.5 分钟**（03:01:56–03:18:37 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **10** / convener **8** / product **3**（均 completed）；原生 transcript：chief 83 assistant msgs / input **140,952** / output **54,106** / cache read **3,968,384**；convener 64 / **104,996** / **30,609** / **2,075,904**；product 41 / **87,017** / **45,633** / **1,007,488**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（29 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（stalled-no-progress-12min） | `4abf59f877645f376575130d435a507a647c566dff1417d05762b7be1135e5d6` |
| `budget.json` | `294a12f08f54093c7dc65e7b09da2fec1e1835ca9dc3276ec718c7d430ef7f0d` |
| `drive.jsonl` | `2b71af7b6f25cd4b6707bfeab81a146a2ad944b4fc52ca1435c94874b843c5e8` |
| `tasks.jsonl`（5 任务/8 报告/4 收口/1 卡） | `eab6d15a84d78dd3967ef8a7b3a9d59664de2645ec15312b165c0c9e676c6b21` |
| `workflows.jsonl`（A1/A2/A3；无 A4） | `101c3b1ce946f3590df835941425a8276d886e102359ecae1677404982a3d3cb` |
| `snake-game-intent-v1.md` | `182c5e3dc033aadf7080f82c0afc5fa279355adf7974d9f272a6792f1e1af531` |
| `snake-game-a1-product-intake.md` / `snake-game-a1-intake.md` / `snake-game-intent-entry.md` | `3b7067b9…` / `75a5d515…` / `d113ef8d…` |
| `rr13-facts.json`（A2 收口/卡点/legacy 零写） | `55086306…` |
| `root-cause-code-pointers.txt` | `39f38f04…` |
| `zero-touch.json`（十四旧根零触碰） | `75057209…` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `da4abce5…` / `241d1a12…` / `ff18e05d…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr13-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十四项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR13 结果如实为未通过（A2 收口死锁/stage-request-open）**；B17（A8 激活 hash 回填）未被行使。
