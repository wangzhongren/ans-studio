# RR8 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B12.1 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR8 = B12.1 + 驱动修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `3ecaf50127e570b73e893fa9f55c78079afcb54b`（B12.1 代码 `4838e55`；`3ecaf50` 为其上 docs 提交）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR8 授权（预算同前；要求先修驱动：卡片识别不得依赖 4s 账本行，至少 30s 或按 UI 标题/选项识别；A3 出现正常作答 confirm 并继续；不得因 `unavailable`/orphan 产物误判客户作答）
- 结论：**RR8 未通过（RR-02 fail）——在 A2→A3 边界发生产品失败后，因运营（convener）真实派发数达到 5（超过批准上限 4）由预算门停止**。正向：**驱动修复生效**（A3 intent-confirm 卡被正确识别并**由客户 confirm** 作答，`request.resolved by:"customer" choice:"confirm"`）；**B12.1 生效**（重复 A3 卡尝试被 `intent-confirm-already-resolved` 拒绝 ×2）；**B11.1 生效**（`fixed-handback-unverifiable` 0 次）。失败链：产品 A2 报告 `evidence[]` 为描述文本而非纯项目相对路径 ⇒ 运营 `close_created_task accepted` 持续 `close-report-missing`；A2 阶段 `stage.blocked`（`task-report-blocked`）；幕僚在 workflow 仍为 `A2(requested)` 时呈 A3 卡并获客户 confirm，但应用记录 `stage.completed A3` 失败（`stage-transition-invalid：当前 A2(requested)；要求 A3 在办`）；A2 重试/返工循环使运营派发达到 5 ⇒ 预算门停止。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr8-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `3ecaf50`）。**环境披露**：首启（00:29 左右）GPU 缓存文件锁导致 `FATAL GPU process isn't usable`（退出码 3）；重置隔离 `userData\` 后重启成功（`electron-out.log` 保留）。首个驱动未连上 CDP（`run.error no cdp page`）已停止；实际运行使用第二个驱动（`drive.jsonl` 同一文件） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR8）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR7/RR6/RR5/RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：九项均 `true`） |
| 驱动修复 | 卡片等待 4s → **30s**（75×400ms）；账本行缺失时按 UI 标题/选项分类（intent-confirm/proposal/appointment/merge-main）；`request.orphaned` 请求跳过；有账本行时仍校验 `workflowId/stage` 戳；appointment 回退选全部 checkbox 角色选项 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 00:29:47–00:29:50 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（00:29:48.623） | `drive.jsonl`、`customer-message.txt` |
| 00:29:59.351 | `workflow.started wf-8c2b20c523ad111bbefe8c09`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl`、`target-project.json` |
| 00:30:11.723 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 00:30:32.684–00:37:46.384 | **A2 stage-request 反复 6 次**（00:30:32 / 00:33:01 / 00:35:08 / 00:35:53 / 00:36:31 / 00:37:46）；convener→product A2 任务 4 次 | `workflows.jsonl`、`tasks.jsonl` |
| 00:34:23.890 | **A3 intent-confirm 卡创建**（`req-97c2a39e2ccc8e8f`，`workflowId`/`stage:"A3"` 齐全，标题「意图确认：贪吃蛇游戏（v1）」） | `tasks.jsonl` |
| 00:34:24.152–.212 | 驱动（修复后）识别卡种并**作答 confirm**（`dialog.action submitted selected ["confirm"]`） | `drive.jsonl` |
| 00:34:24.226 | **应用 `stage.completed A3` 失败**：`workflow.card.stage-event.failed`，`errorCode:"stage-transition-invalid"`，`errorMessage:"A3 意图确认完成非法：当前 A2(requested)；要求 A3 在办。"` | diagnostics、`rr8-facts.json` |
| 00:34:25.486 | `request.resolved by:"customer" choice:"confirm"`（客户作答；卡已结算） | `tasks.jsonl` |
| 00:35:56.212 | **`stage.blocked A2`**（`task-report-blocked`）：产品 A2 报告 `evidence[]` 为描述文本而非纯项目相对路径 ⇒ `close-report-missing`；补交任务已补纯路径证据并 accepted，原任务按 rework 关闭 | `workflows.jsonl` |
| 00:36:11 / 00:37:35 | 重复 A3 卡尝试被 **B12.1** 拒绝：`governance.card.rejected code:"intent-confirm-already-resolved"`（×2） | diagnostics |
| 00:37:52.734 | **预算门**：运营真实派发数 **5 > 4**（`budget-convener-dispatches`）→ 驱动停止 | `drive.jsonl`、`final-report.json` |
| 00:37:54.990 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；UI 卡 **1**（A3 intent-confirm，客户 confirm；重复呈现尝试被 B12.1 拒绝，未成卡）；真实任务 **12**（chief stage-request 7、convener→product 5）；`task.reported` 21；`task.closed` 10（accepted 7 + rework 3）；`fixed-handback-unverifiable` **0**；Git 0；模型 settled：chief 18 / convener 17 / product 9。总墙钟约 **8.1 分钟**（00:29:48–00:37:55；预算 90 分钟，未超；但运营派发超预算）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI（首启 GPU 故障后重置重启，已披露） | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → workflow 启动 → A1 dispatched → A2 反复请求/意图文档 → **A3 卡到卡并由客户 confirm** → **A3 阶段完成失败（A2 未完成）** → A2 `stage.blocked`（证据格式）→ 返工循环 → **运营派发 5 超预算** → 停止。A4+、方案/任命卡、A10/A11/A12、归档、merge 未到达 | **fail**（A2→A3 产品失败 + 预算超限） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested/dispatched、A2 requested ×6、`stage.blocked A2`；**无 `stage.completed`**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；无 shell-gate 审计；无 `.git`；A3 卡 1 张（客户 confirm）；重复卡尝试被拒（B12.1 正向）；`fixed-handback-unverifiable` 0（B11.1 正向） | **fail**（链路未完成；证据格式/阶段推进缺陷；legacy 零写与 B11.1/B12.1 为正向） |
| **RR-05** 失败即停 | 运营派发超预算即停止；保留现场/账本/回放；未重试/未追加消息 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 1（≤4）；**运营真实派发 5 > 4（超限，停止原因）**；chief 7≤8；总真实任务 12≤20；实现写 0；Git 0；墙钟约 8.1 分钟≤90 | **budget exceeded（convener 5 > 4）** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（驱动/B11.1/B12.1）**：
1. **驱动修复生效**：A3 卡被正确识别（ledger `cardKind:"intent-confirm"`），驱动按客户作答 `confirm`；`request.resolved by:"customer" choice:"confirm"`（非 `unavailable`/orphan 产物）。
2. **B12.1 生效**：重复 A3 卡尝试（00:36:11、00:37:35）被应用 `intent-confirm-already-resolved` 拒绝，未重复成卡/重复客户门。
3. **B11.1 生效**：`fixed-handback-unverifiable` 0 次（RR6 为 14）。
4. **B10.1**：`task.reported` 21、`task.closed` 10（accepted 7 + rework 3）；报告/收口关联持续可用。

**失败链**：
1. **A2 报告证据格式**：产品 A2 任务报告 `evidence[]` 为描述文本而非纯项目相对路径 ⇒ 运营 `close_created_task accepted` 返回 `close-report-missing`；A2 阶段 `stage.blocked`（`task-report-blocked`）。补交任务补交纯路径证据并 accepted，但原 A2 任务以 rework 关闭未使 A2 完成。
2. **A3 卡与状态机不一致**：幕僚在 workflow 仍为 **A2(requested)** 时呈 A3 卡；客户 confirm 后应用记录 `stage.completed A3` 失败（`stage-transition-invalid：A3 意图确认完成非法：当前 A2(requested)；要求 A3 在办`），A3 未完成、A4 无法推进。
3. **A2 重试/返工循环 → 运营派发超预算**：A2 stage-request 6 次、convener→product A2 任务 4 次（+A1 1 次 = convener 5 次），达到批准上限 4 之外的 5 次，触发预算门停止。
- 待产品/协调方修复方向（不在测试角色范围）：(a) fixed 收口的 `close-report-missing` 对「描述文本 evidence」的 fail-closed 与模型提示/证据格式约束需闭环（或在 A1/A2 任务文本中强制纯路径证据）；(b) 卡呈现/结算的状态机前置校验：A3 卡不应在 A2(requested) 时呈现；或结算时按 A2 完成补齐；(c) 预算：运营重试上限与返工循环的冲突需产品定义。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **1**（A3 intent-confirm，客户 confirm；重复呈现被 B12.1 拒绝） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **真实任务 12**（chief 7 stage-request ≤8；**convener 5 product > 4（超限，停止原因）**；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **8.1 分钟**（00:29:48–00:37:55 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **18**（completed）、convener **17**（16 completed + 1 aborted）、product **9**（8+1）；原生 transcript：chief 113 assistant msgs / input **130,111** / output **103,355** / cache read **7,510,528**；convener 176 / **159,335** / **122,262** / **8,900,992**；product 48 / **54,432** / **23,941** / **1,043,328**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（29 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（budget-convener-dispatches 5>4） | `f3459880f804105d00454f3670aac086bee292112127b1c57ddb296103d9b4ce` |
| `budget.json` | `9dc80c1670dca0f172444296369c554c2f95a2fad65c234c5be6298533e4a54c` |
| `drive.jsonl` | `1eaee2b057a7ec2a0242ef451037cc16280ff62091f6cae0243f0905d215305c` |
| `tasks.jsonl`（12 任务/21 报告/10 收口/A3 卡） | `0cd8ec0d4e45d43f313981d7af9ea48cc24861f6afde9be7b80f5b1205fab748` |
| `workflows.jsonl`（A2 requested ×6 + stage.blocked；无 stage.completed） | `3b4ce8d34a78b3f9a6adba4c41a7ed0003711197b70e9c2d10d8822cfe8ece75` |
| `snake-game-intent-v1.md` | `e49339039e46517f17c757366a90f9f93cbc361b84b421c5ab22669d14df8e8a` |
| `rr8-facts.json`（A3 阶段事件失败/重复卡拒绝/stage.blocked/legacy 零写） | `8b29cf619b342f191166818bf860dca599f56d9e269a00d72af53b5adee67ac0` |
| `root-cause-code-pointers.txt` | `dca89ffc5692ada18bf2d8eb0160f44de7b757fdee03f1ad3daf9e8818b89209` |
| `zero-touch.json`（九旧根零触碰） | `cba492ef6fd8f54d64e637e6d46171f58cdd8c614951e5a597fa0f96cf3f1201` |
| `electron-out.log`（首启 GPU 故障+重启记录） | `654f06640973e5aa144df12b12ee3bc2dff73ce96ddeb4041f12d04bc4799858` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `a5d738f0…` / `4335be39…` / `215046ec…` |
| `ui-card-01-pre.jpeg`（A3 卡截图） | `564f03c8cb6898f5f9397ee6544dc9cfdaf244bd4f6549b1b8cb280809ff6304` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr8-2026-11-11\evidence\`。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。首个 Electron 启动失败（GPU 缓存锁）与本轮运行无关，已在 `electron-out.log` 与 §一披露；首个驱动 `run.error no cdp page` 已停止，实际运行使用第二个驱动。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（九项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR8 结果如实为未通过（A2→A3 产品失败 + 运营派发超预算）**。
