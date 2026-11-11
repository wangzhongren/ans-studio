# RR7 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B11.1 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR7 = B11.1 修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `e965ef31498cc093ccca7c57ab2d2f2744e10245`（`docs(test): RR6 blocked by closed fixed-child handback queue`；B11.1 代码 `012f491`）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR7 授权（预算同前；不因 blocker 文本提前停止；A3 卡出现时正常作答）
- 结论：**RR7 无效（测试驱动缺陷，非产品失败）**。产品侧进展良好：**B11.1 修复实测生效**（`fixed-handback-unverifiable` **0 次**）；A1 `stage.dispatched A1` + accepted 收口；A2 产品意图文档落盘；**A3 意图确认卡已创建并呈现**（`workflowId`/`stage:"A3"` 齐全）。**测试驱动未能在 4 秒等待内读到 `request.created` 账本行**（行 `at=23:17:51.501`，应用在 23:17:54.482 将其 orphaned），导致 `cardKind=null` → 驱动误判 `unexpected-card-kind` 并停止；A3 卡未作答（`choice:"unavailable"` 为 halt 产物，非客户/驱动作答）。**本轮不构成产品失败证据，也不得按通过处理；需协调方授权重跑。**
- 未合并/未发布：未提交/推送/合并/发布 ans-studio `main`；未打 tag；未发布产物；未修改产品/测试/角色卡/边界/其它文档（仅本记录 + `_evidence/` + 仓库外运行根）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr7-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `e965ef3`） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR7）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR6/RR5/RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：八项均 `true`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 23:15:02–23:15:05 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（23:15:03.718） | `drive.jsonl`、`customer-message.txt` |
| 23:15:10.904 | `workflow.started wf-d04bc3366ec309b591df54e8`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl`、`target-project.json` |
| 23:15:22.990 | **`stage.dispatched A1`**（convener→product A1 任务）；后续 `task.closed accepted`（A1 调度请求/产品任务） | `workflows.jsonl`、`tasks.jsonl` |
| 23:15:47.010 | `stage.requested A2`；23:16:03 convener→product A2（intent 撰写，workflowId 绑定）；产品落盘 `docs/product/snake-game-intent-v1.md` | `workflows.jsonl`、`tasks.jsonl` |
| 23:17:46.939 | A2 再次 `stage.requested`（rework/补正循环，任务与报告均入账） | `workflows.jsonl` |
| 23:17:51.501 | **A3 intent-confirm 卡创建**：`req-c228aac841513a40`、`cardKind:"intent-confirm"`、`workflowId:"wf-d04bc3366ec309b591df54e8"`、`stage:"A3"`、标题「意图确认：贪吃蛇（键盘/计分/重开/边界碰撞）」 | `tasks.jsonl` |
| 23:17:51.522 | `request.presented`（to customer） | `tasks.jsonl` |
| ~23:17:51.6 | 驱动检测到卡；`request.created` 行在 4 秒等待窗口内未可见（驱动 `reqInfo` 未见） | `drive.jsonl`、`rr7-facts.json` |
| 23:17:54.482 | 应用将请求 **`request.orphaned`**（未作答前） | `tasks.jsonl` |
| 23:17:55.614–.691 | 驱动等待结束，`cardKind=null` → 误判 `gate:unexpected-card-kind`；停止 | `drive.jsonl`、`final-report.json` |
| 23:17:55.698 | finalize halt 使请求解析为 `by:"customer" choice:"unavailable"`（**非客户作答**） | `tasks.jsonl` |
| 23:17:57.938 | 证据落盘；Electron 退出 | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；UI 卡 **1**（A3 intent-confirm，创建/呈现；**未作答**；`unavailable` 为 halt 产物）；真实任务 **6**（chief stage-request A1/A2/A2 = 3；convener→product A1/A2/A2 = 3）；`task.reported` **11**；`task.closed` 3（2 accepted + 1 rework）；`fixed-handback-unverifiable` **0**；Git 0；模型 settled：chief 9（8 completed + 1 aborted）、convener 9（8+1）、product 6（5+1）。总墙钟约 **2.9 分钟**（23:15:03–23:17:58；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本轮为无效运行）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → workflow 启动 → A1 dispatched/accepted → A2 意图文档 → **A3 卡创建/呈现** → **测试驱动未分类作答（驱动缺陷）** → 停止。A4+ 未到达 | **无效（测试驱动缺陷）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 requested、A1 dispatched、A2 requested ×2；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；无 shell-gate 审计；无 `.git`；`task.reported` 11、accepted 2（B10.1 正向）；A3 卡 1 张（**未作答**） | **不正确/无效（驱动停止，非产品失败）** |
| **RR-05** 失败即停 | 驱动因自身卡片分类缺陷停止；保留现场/账本/回放；未重试/未追加消息 | **披露（测试驱动缺陷）** |
| **RR-06** 预算 | 消息 1（=1）；卡 1（未作答）；真实任务 6（≤20；chief 3≤8、convener 3≤4、实现写 0）；Git 0（≤12）；墙钟约 2.9 分钟（≤90） | **within budget** |

**结论**：RR7 为**无效运行**（测试驱动 bug）；不能据此判产品通过或失败；需协调方授权重跑。

---

## 四、测试驱动缺陷（根因与修复计划）与产品正向

**驱动缺陷（本角色，非产品）**：
- 驱动 `handleDialogOnce` 依赖 `tasks.jsonl` 的 `request.created` 行识别卡种；等待上限 10×400ms=4s。本轮 A3 卡在 ~23:17:51.6 呈现，`request.created` 行 `at=23:17:51.501` 但应用在 23:17:54.482 将其 orphaned（账本行可见时间晚于 4s 窗口/卡片随后被撤回），驱动拿到 `cardKind=null` → `gate:unexpected-card-kind` → 停止。
- **修复计划（下一轮驱动）**：(a) 等待上限提高到 ≥10s；(b) 当账本行缺失时按**对话框内容**分类：options 含 `confirm`/`revise` 且标题含「意图/确认」⇒ intent-confirm；含 `accept`/`revise`/「方案/提案」⇒ proposal；checkbox 角色选项且标题含「任命/招人」⇒ appointment；含 `approve-merge-main` ⇒ merge-main；仅在完全不可分类时 gate；(c) 监听 `request.orphaned`，对已撤回请求不答、等待重新呈现。(d) 保留按账本 `workflowId/stage` 戳的校验（有行时）。
- 本轮 A3 卡 `choice:"unavailable"` 为 halt 产物，**不是**客户作答；产品未在 A3 失败。

**产品正向（RR7 实测）**：
- **B11.1 生效**：`fixed-handback-unverifiable` **0 次**（RR6 为 14 次）；产品/运营回交队列未再阻塞。
- **B10.1 报告关联**：`task.reported` 11 条、`task.closed accepted` 2 条（A1 调度请求/产品任务等）；无 `close-report-missing` 观测。
- **B9/B8**：`stage.dispatched A1`；无 shell 哈希（无 shell-gate 审计）；convener fixed；workflowId 自动绑定。
- 产物：`docs/product/snake-game-intent-v1.md`（sha256 `3760afb1…`）、`docs/scheduling/snake-game-a1-intake.md`、`snake-game-a2-dispatch.md`、`docs/intents/snake-game.md`；无 legacy trunk/run/stable-write。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **1**（A3 创建/呈现，**未作答**；`unavailable` 为 halt 产物） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **真实任务 6**（chief 3 stage-request A1/A2/A2；convener 3 product A1/A2/A2；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **2.9 分钟**（23:15:03–23:17:58 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief 9（8 completed + 1 aborted）、convener 9（8+1）、product 6（5+1）；原生 transcript：chief 62 assistant msgs / input **89,172** / output **37,251** / cache read **2,579,072**；convener 80 / **92,694** / **41,499** / **2,715,264**；product 39 / **40,436** / **16,819** / **649,344**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（29 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:unexpected-card-kind，驱动缺陷） | `b9a8cffbdca155f0eca8f8a77d6b15ae68e12e72cd7d846814ebf31dd88c6eaa` |
| `budget.json` | `dcda627143a0c430701647c70932722fdf6d510153c90ca74b785bc491bddc5f` |
| `drive.jsonl` | `8584e4f047e821529adeedc016af8d7df814f584894619e40bc32d0b68af770c` |
| `tasks.jsonl`（A3 卡 created/presented/orphaned/resolved） | `ecb85a8f0ff561af53d4284a6402321575fbde218e269d230fb4a967c5be5f86` |
| `workflows.jsonl` | `103fd351067702e5df463560a5018d4cd3a5e0669c9b195c792833b2492f19fe` |
| `snake-game-intent-v1.md` | `3760afb1899441c67a8791e55fcc1c0c476e42b2a3f9b2c066baa4a0c5f5f416` |
| `rr7-facts.json` | `77d139173972ca5e061eac32fcc96a4aa883e09924c609c523afedd59574380e` |
| `root-cause-code-pointers.txt`（驱动缺陷+修复计划） | `bcca44df654ad504638529d3078b1638e1042d6ca963d5c2f5abd23d6585c0d4` |
| `zero-touch.json`（八旧根零触碰） | `1770d3835858ab25b1ccdea4f677d8ad7e59edc8b7c2f935214ef0cfb5fe4809` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `243bdc64…` / `da824ebd…` / `4b236602…` |
| `ui-card-01-pre.jpeg`（A3 卡截图） | `7c51bd48db260057f4c7ce60b9941b28b2730ed457a72b2ea12d356199681d67` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr7-2026-11-11\evidence\`。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。`request.resolved by:"customer" choice:"unavailable"` 为 halt 产物，**不是客户/驱动作答**。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（八项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR7 结果如实为无效（测试驱动缺陷）**，不得按通过或产品失败处理；需授权重跑。
