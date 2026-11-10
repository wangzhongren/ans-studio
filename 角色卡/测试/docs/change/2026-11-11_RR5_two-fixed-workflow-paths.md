# RR5 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B9.1/B9.2 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR5 = B9.1/B9.2 修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `966696e1536e23adf310168a2a26289e6c7ac700`（`fix(workflow): B9.1 no-shell-hash prompts and B9.2 stage task separation`）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR5 授权（预算同前：消息 1、卡 ≤4、派发 ≤20、Git add/commit ≤12、≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR5 未完成/未通过——测试侧提前停止（重要披露，见 §四）**。**B9.1/B9.2 修复实测生效**：无 shell 哈希（产品未调用 `run_shell`；无 shell-gate 审计）；A1 `stage.dispatched A1` 正确入账（阶段任务分离）；A2 独立请求/意图文档产出；**A3 意图确认卡已创建并呈现**（`workflowId`/`stage:"A3"`/`documentRefs` 齐全）。**链在 A3 卡呈现的同一时刻被测试侧停止**（依据幕僚在 `project.note` 声明的「报告-任务关联」系统缺陷）；A3 卡的 `request.resolved choice:"unavailable"` 是停会话产物，**不是客户/驱动作答**。另实测到**报告-任务关联缺陷**（`submit_report` 以「任务关联未知」到达；0 条 `task.reported`；`close_created_task accepted` 全部 `close-report-missing`；A1/A2 调度请求被 rework 收口、A2 重复派发）。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr5-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `966696e`） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR5）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：六项均 `true`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 20:56:24–20:56:27 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（`做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）`） | `drive.jsonl`、`customer-message.txt` |
| 20:56:34.399 | `workflow.started wf-bcc993de8e5de70f7c2b8c39`（path A）+ `stage.requested A1`；`.ans/project.json={"workflowSchema":"two-fixed-paths/v1"}` | `workflows.jsonl`、`target-project.json` |
| 20:57:01.097–.105 | **B9.2**：`task.created` convener→product（stage **A1**、workflowId 自动绑定）+ **`stage.dispatched A1` 入账** | `tasks.jsonl`、`workflows.jsonl` |
| 20:57:0x–20:58 | 产品产出 `docs/product/snake-game-a1-intake.md`；**报告以「任务关联未知」到达**；幕僚在 20:58:16.518 将 A1 调度请求以 **rework** 收口（note 明示报告未关联任务） | `tasks.jsonl`、`replay-chief.jsonl` |
| 20:58:20.736 | 幕僚发 **A2 stage-request**；convener→product **两次** A2 生产任务（t-mwb6a05e… / t-mwb6ab25…） | `tasks.jsonl` |
| 20:58:5x–20:59 | 产品产出 `docs/product/snake-game-intent-v1.md`（9,391 B，sha256 `718e6044…`）；A2 调度请求仍因报告未关联以 **rework** 收口（20:59:14.669）；20:59:18.797 重发 A2 stage-request | `tasks.jsonl`、`snake-game-intent-v1.md` |
| 20:59:50.510 | 幕僚写入 **blocker `project.note`（`report-task-link-broken`）**：product/convener `submit_report` 均「任务关联未知」，无 `task.reported(status=done)`，`close_created_task accepted` 一律 `close-report-missing`；已尝试 rework/重发/terminate/redispatch | `tasks.jsonl`、`rr5-facts.json` |
| 21:00:08.493 / 21:00:27.792 | A2 调度请求任务两次投递 convener（处理中） | `tasks.jsonl` |
| 21:00:32–33 | **测试侧停止驱动**（依据上述 blocker note），准备 finalize | `drive.jsonl`（驱动最后心跳 20:59:58；finalize cdp.page 21:00:33.417） |
| 21:00:33.315 | **A3 意图确认卡创建**：`request.created req-c4c4589c531dffc3`，`cardKind:"intent-confirm"`、`workflowId:"wf-bcc993de8e5de70f7c2b8c39"`、`stage:"A3"`、`documentRefs`=intent `docs/product/snake-game-intent-v1.md` sha256 `718e6044…` | `tasks.jsonl`（`rr5-facts.json`） |
| 21:00:33.327 | `request.presented`（to customer） | `tasks.jsonl` |
| 21:00:33.417–.426 | finalize 连接/点击 halt/停会话；卡被应用解析为 `request.resolved by:"customer" choice:"unavailable"`——**停会话产物，非客户作答** | `tasks.jsonl`、`finalize-console.log` |
| 21:00:35.654 | finalize 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；UI 卡 **1**（A3 intent-confirm，已呈现但**未作答**；`choice:"unavailable"` 为停会话产物）；真实任务 **6**（chief stage-request A1/A2/A2 = 3；convener→product A1/A2/A2 = 3）；`task.reported` **0**；`task.closed` 2（均 rework）；Git 0；模型 settled：chief 7（6 completed + 1 aborted）、convener 5（completed）、product 6（completed）。总墙钟约 **4.2 分钟**（20:56:25–21:00:35；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target（0 条目、非 Git、无 `.ans`）；独立 userData；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → 首个 stage-request 启动 workflow → **A1 stage.dispatched A1（B9.2）** → 产品 A1 受理 → A2 请求/意图文档 → **A3 意图确认卡创建并呈现** → **测试侧在卡呈现同刻停止**（driver 已停；卡未作答）。A10/A11/A12/归档/merge 未到达；期间报告-任务关联缺陷导致 A1/A2 rework 与 A2 重复派发 | **未完成（测试侧提前停止）+ 产品缺陷观测** |
| **RR-03** 发布合并 | 未执行（未到 A12/A13） | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、stage.requested A1、**stage.dispatched A1**、stage.requested A2、stage.requested A2；`basis.jsonl`/`releases.jsonl` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-writes.json**（正向）；**无 `docs/audit/shell-gate.jsonl`**（B9.1 无 shell 哈希，正向）；无 `.git`/`.gitignore`；`task.reported` **0**；A3 卡 1 张（未作答）；无 judge 参与 | **fail（链路未完成；报告关联缺陷）**，legacy 零写与 no-shell 为正向 |
| **RR-05** 失败即停 | 停止依据为幕僚 `project.note` 的系统缺陷声明；**但链在停止同刻产出了 A3 卡，停止时机属测试侧判断失误（premature），A3 未作答**——已保留现场/账本/回放并如实披露；未重试/未追加消息 | **披露（测试侧 timing 错误）** |
| **RR-06** 预算 | 消息 1（=1）；卡 1（A3，≤4，但未作答）；真实任务 6（≤20；chief 3≤8、convener 3≤4、实现写 0≤4）；Git 0（≤12）；墙钟约 4.2 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；本次 RR5 未完成（测试侧提前停止），最终判定权属独立验收（B2）。

---

## 四、事实、缺陷与重要披露（未改任何代码）

**B9.1/B9.2 正向（实测）**：
1. **无 shell 哈希**：产品原生 transcript 无 `run_shell` tool_use；`docs/audit/shell-gate.jsonl` **不存在**；意图文档 sha256 由应用侧提供（A3 卡 `documentRefs` `718e6044…` 与写盘实测一致）。
2. **阶段任务分离**：A1 产品任务 `stage:"A1"`，`stage.dispatched A1` 正确入账（20:57:01.105）；A2 另发 stage-request（20:58:20.736；20:59:18.797 重发）。**无 `.ans/trunk`/`.ans/runs`/stable-write**。
3. **A3 卡结构完整**：`workflowId`/`stage:"A3"`/`documentRefs`（path+sha256+intentId+version）由应用写入；卡由幕僚发起、呈现给客户。

**产品缺陷（实测，待修复/裁定）**：
- **报告-任务关联缺陷（`report-task-link-broken`）**：convener/product 的 `submit_report` 均以「任务关联未知」到达；`tasks.jsonl` **0 条 `task.reported`**；`close_created_task accepted` 全部 `close-report-missing`；导致 A1/A2 调度请求以 **rework** 收口（20:58:16.518 / 20:59:14.669）并重发 A2；convener 重复派发 A2 产品任务（t-mwb6a05e… / t-mwb6ab25…）。幕僚已将缺陷写入 `project.note` 并尝试 rework/重发/terminate/redispatch。
- **测试侧 premature 停止（本角色失误，重要披露）**：驱动在 21:00:32–33 依据上述 blocker note 被停止；A3 意图卡于 21:00:33.315 创建、21:00:33.327 呈现——**停止与卡呈现同刻**；finalize 的 halt/停会话把卡解析为 `choice:"unavailable"`（非客户作答）。若驱动继续存活，本应按卡作答（confirm）并继续 A4+。**本 RR5 因此不能作为 A3 之后的通过/失败证据；A3 之前的正向事实与报告关联缺陷仍成立。** 该停止是测试侧 timing 错误，不归因产品门，也不得被解读为产品在 A3 失败。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（意图/方案/任命 + merge-main） | **1**（A3 intent-confirm 创建/呈现；**未作答**；`unavailable` 为停会话产物） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **真实任务 6**（chief 3：A1/A2/A2 stage-request；convener 3：product A1/A2/A2；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **4.2 分钟**（20:56:25–21:00:35 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **7**（6 completed + 1 aborted）、convener **5**（completed）、product **6**（completed）；原生 transcript：chief 62 assistant msgs / input **140,841** / output **57,139** / cache read **3,020,032**；convener 81 / **102,584** / **60,021** / **3,195,136**；product 54 / **91,943** / **29,627** / **1,337,984**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（30 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（finalize-only 收口；summary 为空、事实以账本为准） | `fd5991f1e95a1baa4ded7725991562314a367bb1ea5e933b5ef39b7545e04b2e` |
| `budget.json`（finalize-only，空；实际预算见 §五） | `5e29b577ce6418a35c0715596f75e8b42d835f4b917daec648374f039833c013` |
| `drive.jsonl` | `11d20053306192ac6abe5495715233b1b251b547f1388a43e18d683b862ccc60` |
| `tasks.jsonl`（含 A3 卡与 rework/blocker note） | `3c8e1d41a5b5d29a8d6470d79673251c4a1a686e7c15da471f2f54eb14dd9769` |
| `workflows.jsonl`（started/A1 dispatched/A2 requested） | `6a9fa1fa72366b5bf79a4112baab3a54ffd13308eb97fbf4469850c3ee9d17ce` |
| `snake-game-intent-v1.md`（意图文档） | `718e6044c3a195fa482e65a3a134be3a52a23533a71e63bbaf163b9362b6704a` |
| `rr5-facts.json`（卡/报告关联/停表产物/legacy 零写） | `cbfa3fff200007a12ac1eefe30a5d5ca414f608744a9fdc8f69ac54caee879d3` |
| `root-cause-code-pointers.txt` | `2291adc619242c1fa8614c4128193c8fe05b56b825618b330ecf8379d88d7bb1` |
| `zero-touch.json`（六旧根零触碰） | `e1d10fb26e4e571328ceac14c699f69cbd36cfa67fa4c4ab4cbd5b6f7491770b` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `a89778c8…` / `c5f2b76b…` / `e10b1bb2…` |
| `ui-heartbeat.jpeg` | `82518c9114cc16a4ae2755319ca4803bb3e94986e705717fee7a72d85f10e7d5` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr5-2026-11-11\evidence\`。

**披露**：`final-report.json`/`budget.json` 由 finalize-only 脚本生成（driver 已被测试侧停止，内存 summary 为空）；实际事件/预算以账本与 `drive.jsonl` 为准。finalize 的 `Browser.close` 后出现 Node unsettled top-level await（退出码 13），证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（六项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR5 结果如实为未完成（测试侧提前停止）**，并如实披露测试侧时机失误；产品缺陷（报告-任务关联）与 B9 正向事实见 §四。
