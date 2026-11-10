# RR2 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B6.1 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR2 = B6.1 修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `f725c2d487ab0ebd83d5c43f289460c2ed172505`（`fix(workflow): B6.1 fixed chief chat entry and B6.2 real-chat full-chain coverage`）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR 重跑授权（预算同前批准值：消息 1、卡 ≤4、派发 ≤20、Git add/commit ≤12、≤90 分钟；失败即停、不重试、不追加）
- 结论：**RR2 失败（RR-02 fail）**。**B6.1 聊天入口修复已实测生效**（空项目幕僚聊天注入 `chief-workflow/v2` + fixed 工具面），但**首个 stage-request 缺 `workflowPath`/`stage` 时应用 fail-open：被当作 legacy 星形派发受理并写 `.ans/runs`/`.ans/trunk`**（fixed 路径禁止），随后 `.ans/trunk` 写盘触发 gate，立即停止。未到 3 卡/实现/验收/merge。**RR 未通过，不伪造通过**；路径 B 未执行。
- 未合并/未发布：未提交/推送/合并/发布 ans-studio `main`；未打 tag；未发布产物；未修改产品/测试/角色卡/边界/其它文档（仅本记录 + `_evidence/` + 仓库外运行根）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr2-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `f725c2d`，未改产品代码） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好；`preferences.json` 仅 runtime=claude） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR2）；运行期采样：9222=0、9223=0 监听，9224=1（`final-report.json::ports`） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR1 根 `ans-two-fixed-paths-rr-2026-11-10`、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：三项均 `true`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 17:08:45 前后 | 驱动启动、CDP 连上 9224、真实 UI 导入 `target\`（原生目录选择器选中） | drive.jsonl |
| 17:08:57 | 角色清单 6 内置（trio，primaryRoleId=chief）；打开幕僚会话；**`chief.workflow.v2.loaded`（10,206 B）——B6.1 fixed 注入生效** | diagnostics、`fixed-entry-facts.json` |
| 17:08:58 | **唯一客户消息**发送（`做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）`） | `customer-message.txt`、`compose.sent` |
| 17:09:25.277 | 幕僚 `dispatch_task` 调用①（原生 transcript：JSON 转义损坏 → InputValidationError，未执行） | `dispatch-inputs.json` |
| 17:09:25.3 | `dispatch_task` 调用②（schema 非法：`targetRoleId/objective/taskKind:"dispatch"` → MCP InputValidationError，未执行） | `dispatch-inputs.json` |
| 17:09:25.28–.333 | `dispatch_task` 调用③：`taskKind:"stage-request"`、`roleId:"convener"`、`sideEffect:"read-only"`，**缺 `workflowPath` 与 `stage`** → 应用**受理为普通派发**：`task.created` chief→convener（`runId:"run-hub-92d8ecf984fa1be340c01fe2ccc6d21f4fe61af6f1ebba25"`，无 `taskKind/workflowId/stage`） | `tasks.jsonl`、`dispatch-inputs.json` |
| 17:09:25.333 前后 | legacy 状态落盘：`.ans/runs/run-hub-92d8…/manifest.json`（`ans-run/v1`, draft）+ `.ans/trunk/initialization-sources/init-source-a1aa957f….json`（customer-turn / chief-hub-v1） | `legacy-run-manifest.json`、`legacy-trunk-initialization-source.json` |
| 17:09:25.351 | 驱动检测 **gate：`.ans/trunk` 被写**（fixed 路径不应出现）→ 立即停止；截图 `ui-90-gate.jpeg`；关停会话/窗口 | `gate.detected`、`ui-90-gate.jpeg` |
| 17:09:27.583 | 证据落盘 `final-report.json`；Electron 退出（9224 仅剩 TIME_WAIT，进程 0） | final-report.json |

**应用侧观测（诊断）**：`tasks.dispatch.advisory`（`reasonCode:"d3-missing"`、`mode:"authorization-only"`）——应用把该 stage-request 当作 **legacy 星形派发**受理并给 D3 缺失 advisory；随后 `delivery.start` 打开 convener 会话，停会话时 `delivery.failed AbortError`（中止）。**没有任何 fixed 路由/`workflow.started`/固定账本事件。**

**客户卡与派发实际**：客户消息 1 条；UI 卡片 **0**（3 卡与 merge-main 均未出现）；派发 **1**（chief→convener，legacy）；固定阶段事件 0；merge 0；模型 settled 2 条且均 `outcome:"aborted"`（chief 1 / convener 1）。总墙钟约 **1.5 分钟**（预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target（0 条目、非 Git、无 `.ans`）；独立 userData；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入空项目 → 幕僚聊天 **fixed 注入成功**（`chief.workflow.v2.loaded` 10,206 B）→ 客户消息 1 条 → 模型三次 `dispatch_task`（前两次输入校验拒绝；第三次 `taskKind:"stage-request"` **缺 `workflowPath`/`stage`**）→ 应用 **fail-open 当作 legacy 星形派发受理**（`runId` 落盘、`d3-missing` advisory）→ `.ans/trunk`/`.ans/runs` 被写 → 立即停止。固定 `workflow.started`/3 卡/A1 均未发生；A10/A11/A12/归档/合并未到达 | **fail**（首个 fixed stage-request 即偏航） |
| **RR-03** 发布合并 | 未执行（未到 A12/A13；无 merge-main 卡、无 `release.merged`） | **not executed** |
| **RR-04** 账本/审计检查 | `.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` **均不存在**；`.ans/trunk`、`.ans/runs` **被写**（fixed 路径禁止）；`.ans/project.json` 不存在（`ensureFixedPathStarted` 未触发）；无 `.git`/`.gitignore`/`docs/audit/shell-gate.jsonl`；固定卡 0/4；无 judge 参与 | **fail** |
| **RR-05** 失败即停 | 首个 legacy 状态写盘（`.ans/trunk`）立即停止；保留现场/日志/账本/回放；按真实错误回报；未重试/未追加/未上报成功 | **pass** |
| **RR-06** 预算 | 客户消息 1（=1）；卡 0（≤4）；派发 1（≤20；chief 1≤8、convener 0≤4、实现写任务 0≤4）；目标项目 Git add/commit 0（≤12）；墙钟约 1.5 分钟（≤90 分钟）；模型轮次见 §五 | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**B6.1 已生效（非本次失败点）**：空项目幕僚聊天不再硬编码 legacy——`app/desktop/workflow.ts::sessionWorkflowModeForChat`（空项目/无 legacy 状态 ⇒ fixed）与 `app/desktop/session.ts:3628-3636`、`:4396-4400` 传入会话级 `workflowMode:"fixed"`；诊断 `chief.workflow.v2.loaded`（10,206 B）与原生 prompt 快照均证明 `chief-workflow/v2` + fixed context 已注入。

**本次失败点（应用 fail-open + 模型漏字段）**：

1. 幕僚按 fixed v2 发起首个 A1 stage-request，但**未携带 `workflowPath:"A"` 与 `stage:"A1"`**（工具输入实测见 `_evidence/dispatch-inputs.json`）。设计 v1.3 附录 A 规定「`workflowPath`：首次 advance 请求必填」，但 `dispatch_task` 的 JSON schema 未做条件必填约束，模型漏传仍通过输入校验。
2. 应用 `app/desktop/session.ts:8846-8860` 的**首次 fixed 启动例外**只在 `d.taskKind === "stage-request" && d.workflowPath !== undefined` 时调用 `ensureFixedPathStarted`；缺 `workflowPath` ⇒ `dispatchMode` 仍 `legacy`（项目门未开、无 `workflow.started`）⇒ **落入 `routeStarDispatch`**（legacy 星形派发），生成 hub run `run-hub-92d8…` 与 `.ans/trunk/initialization-sources/…`，并给出 `d3-missing` advisory。
3. 这违反固定路径不变量：fixed 聊天会话的 stage-request 缺字段应 **fail-closed 拒绝**（如 `stage-request-required`/`stage-transition-invalid`），**不得**回退 legacy 并写 `.ans/trunk`/`.ans/runs`（B1 AC-23/RR-04）。确定性测试未覆盖：`test/桌面应用/b61-chat-entry-fixed.test.ts:380` 的首个 stage-request 恒带 `workflowPath:"A", stage:"A1"`（B6.2 3/3 只覆盖正确形状）。

**模型侧**：三次调用中前两次分别为 JSON 转义错误与 schema 非法（均被正确拒绝），第三次为语义不完整（缺必填字段）——真实模型（`deepseek-v4-flash`）未可靠产出 fixed 首请求形状；应用必须 fail-closed 兜住。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（意图/方案/任命 + merge-main） | **0**（无卡；无 judge 参与） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **1**（chief→convener legacy；chief=1、convener=0、实现写任务=0） |
| Git add/commit（目标项目） | ≤12 | **0**（未创建 Git 仓库/未提交） |
| 墙钟 | ≤90 分钟 | 约 **1.5 分钟**（17:08:45–17:09:27 UTC） |
| 模型轮次 | 单独如实报告 | settled 事件 2（chief 1 / convener 1），**均 `outcome:"aborted"`**；原生 transcript：chief **16** assistant messages / input **101,694** / output **9,384** / cache read **407,296** tokens；convener 0 assistant messages；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（24 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json` | `68caef844368182d6aa4855d7a7f0abafa7de3ac20aac924936567525486304d` |
| `budget.json` | `8d7662a17f9dad0d632356ee8cff5b50acd3ee88a10375c1438364079eae6f72` |
| `drive.jsonl` | `456bd6f6691d101d0c8fe8f1b5c296d939347e047dde84549d5e669d73df492d` |
| `dispatch-inputs.json`（三次调用与结果原文） | `17a169e0e6352f676df03ddb6131ba50acf7a1d5db54f18d4cd794ed24fade21` |
| `tasks.jsonl`（legacy task.created 原件） | `a8d3dc3442853c4b98878f2e7a884d092a669c80a1f1618c5f3eb28e65a26d4f` |
| `legacy-run-manifest.json` | `a0ec7fc3049c51dcb020b2a1401c99fbefe45ea7a14cfa52b46fcc273ae2cacb` |
| `legacy-trunk-initialization-source.json` | `1038f847717a847da63b1870933e4565492ebfc48285f20191024977ef98d1a7` |
| `fixed-entry-facts.json`（v2 注入 + 固定账本/项目配置缺失 + legacy 写盘） | `e8356335e3d37338169e469558ff4ec88eeff3e3bd32aec09a58018d50879e83` |
| `zero-touch.json`（三旧根零触碰） | `0c184827ade278ece1a953f958914db1890acdf74f63e9c646a36bd6a6de0c33` |
| `native-chief-transcript.jsonl` | `37c531efd5541395bbb4f7a22b841e668ff6294d3c0c918f31207dad1c4599b5` |
| `replay-chief.jsonl` / `replay-convener.jsonl` | `b80ebb2d…` / `47824ddc…` |
| `usage-extract.json` | `2936cc555cfa89cc2047f9d3a28325160d4005f800de999889ff2a9735781335` |
| `ui-90-gate.jpeg` | `5a179e79dfd78848c5fe08fb01cad9e0c0740753aff9f9d68ea9ff630951299c` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr2-2026-11-11\evidence\`。

**披露**：驱动在 `finalize()` 的 `Browser.close` 后再次出现 Node unsettled top-level await（退出码 13）；证据（final-report/budget/drive）在关窗前已写盘，内容完整。本驱动在 RR2 中把「legacy 写盘」作为硬 gate，故首个 `.ans/trunk` 出现即停——这是设计内的失败即停，不是环境故障。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（三项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；RR2 结果如实为 **失败**（RR-02）。修复方向需产品/协调方决定，不在本角色范围。
