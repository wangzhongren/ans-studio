# RR 真机全链验证记录：两条固定工作流路径（T3，2026-11-10）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR = 真机全链验证）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `d380ab4de1c841f9e55fc2b75fc16000d0eddc1c`（代码候选 `79e16a1`；其后 `95f9cdb`/`d380ab4` 为 docs-only；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`）
- 依据：RR 计划 `docs/scheduling/2026-11-10_RR_two-fixed-workflow-paths-plan.md`（冻结实测 `83dfe814…`）；B1 v1.2 `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.2.md`（RR-01…RR-06）
- 结论：**RR-02 失败（固定路径未从空项目首条客户消息启动；真实走的是 legacy 星形链并写 `.ans/trunk`/`.ans/runs`）**。按「失败即停」在首个 legacy 派发/` .ans/trunk` 写盘处停止，保留现场与证据；**RR 不通过，不伪造通过**。路径 B 未执行。
- 未合并/未发布：未提交/推送/合并/发布 ans-studio `main`；未打 tag；未发布产物；未修改产品/测试/角色卡/边界/其它文档（仅本记录 + `_evidence/` + 仓库外运行根）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr-2026-11-10\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0（`node_modules/electron/dist/electron.exe`），launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（未改动产品代码） |
| userData | 独立 `userData\`（与既有运行隔离；首启无偏好，judge/decision 开关默认关闭） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html`（file 入口；该分支对 `app/renderer/**` 相对基线 `d9e3e99c` 零 diff） |
| 远程调试端口 | **9224**（仅本 RR 使用）；运行期三次采样：9222=0、9223=0 监听，9224=1（`evidence/final-report.json::ports`、`portsDuringRun`） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（Claude 原生 transcript 实测；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算，见 §五/§六） |
| 运行根证据 | `drive.jsonl`、截图 6 张、tasks 账本原件、legacy run manifest、legacy trunk init-source、会话回放、诊断、端口检查、零触碰对比 |
| 既有运行根 | 只读参照，**零触碰**：`ans-snake-fullchain-run-2026-11-10` 与 `ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后完全一致（`final-report.json::oldRootsUntouched = {runRoot:true, snakeTarget:true}`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 15:55:34 | CDP 连上 9224；窗口就绪；截图 `ui-00-launch.jpeg` | drive.jsonl |
| 15:55:35 | 真实 UI「导入项目」→ 原生目录选择器选中 `target\` | `import.dialog`（SELECTED dialogs=1） |
| 15:55:39 | 角色清单 = 6 内置（trio：chief/product/rapporteur/nominator/convener/verifier），primaryRoleId=`chief` | `roles.listing` |
| 15:55:39 | 打开幕僚（chief）会话成功（`session.open.ready`） | diagnostics |
| 15:55:40 | **唯一客户消息**发送（原文：`做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）`；输入框清空确认） | `compose.sent`、`customer-message.txt` |
| 15:55:40–15:56:38 | 幕僚按 **legacy `chief-workflow.md` v1** 行动：写 legacy 意图入口 `docs/intents/snake-game.md`、`docs/intents/snake-game-intent.md`；`request_choice` 发 intent-confirm **被拒**（要求先有产品意图文档）；读 `contract_check` | `replay-chief.jsonl` |
| 15:56:38.926 | **首个派发 = legacy 星形派发**：`task.created` chief→product，`flowId:"snake-game"`，**无 `taskKind`/`workflowId`/`stage`**（非 stage-request） | `tasks.jsonl`、`drive.jsonl` |
| 15:56:38.907 | legacy Hub run 落盘：`.ans/runs/run-hub-4e7109e69277d8b28e798fadd44f31d7b796fdcacada2395/manifest.json`（`ans-run/v1`，state=draft） | `legacy-run-manifest.json` |
| 15:56:38.9 | legacy trunk 初始化源落盘：`.ans/trunk/initialization-sources/init-source-1ade3901….json`（kind=customer-turn, hubRouting=chief-hub-v1） | `legacy-trunk-initialization-source.json` |
| 15:56:39 | 驱动检测 **gate：`.ans/trunk` 被写**（fixed 路径不应出现）→ 立即停止；截图 `ui-90-gate.jpeg`；关停会话/窗口 | `gate.detected`、`ui-90-gate.jpeg` |
| 15:56:41 | 证据落盘 `final-report.json`/`budget.json`；Electron 进程退出（9224 仅剩 TIME_WAIT） | final-report.json |

**客户卡与派发实际**：客户消息 1 条；UI 卡片 **0**（固定 3 卡与 merge-main 均未出现）；派发 **1**（chief→product，legacy）；固定阶段事件 0；merge 0；模型 settled 事件 2 条、**均为 `outcome:"aborted"`（本轮已中止，非完成轮）**：chief 轮在中止前已发出 legacy 派发，product 轮在收到 legacy 任务后随停会话中止。总墙钟约 **1.5 分钟**（预算 90 分钟，未超）。

**停止原因（原文）**：`gate:legacy-state-written`（`path: ".ans/trunk"`）。按 RR「失败即停」：不重试、不追加消息、不继续派发、不上报成功。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target（导入前 0 条目、非 Git、无 `.ans`）；独立 userData；独立 `ANS_E2E_OUTDIR`；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入空项目 → 幕僚成功 → 客户消息已发（1 条）→ **固定路径未启动**：无 `workflow.started`、无 `stage-request`、无固定三卡；幕僚会话为 **legacy 注入**（诊断无 `chief.workflow.v2.loaded`），首派发为 legacy chief→product（无 `taskKind/workflowId/stage`），随后 legacy `.ans/trunk`/`.ans/runs` 落盘 ⇒ 失败即停。A10/A11/A12/归档/合并均未到达 | **fail**（阶段：首个派发即偏航；未进入 A1） |
| **RR-03** 发布合并 | 未执行（RR-02 未到 A12/A13；无 merge-main 卡、无 `release.merged`） | **not executed**（fail 链上游） |
| **RR-04** 账本/审计检查 | `.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` **均不存在**（fixed 账本 0 事件）；`.ans/trunk`、`.ans/runs` **被 legacy 路径写入**（fixed 路径禁止）；无 `docs/audit/shell-gate.jsonl`（无 Git 写）；无 `.gitignore` 托管块；`.ans/project.json` 不存在；固定卡 0/4（3 卡 + merge-main 均无）；无 judge 参与（无 `request.resolved`） | **fail** |
| **RR-05** 失败即停 | 首个 legacy/旧机制证据出现即停止；保留现场/日志/账本/回放；按真实错误回报；未重试/未追加/未上报成功 | **pass** |
| **RR-06** 预算 | 见 §五：客户消息 1（=1 上限）、卡 0（≤4）、派发 1（≤20；chief 1≤8、convener 0≤4、实现写任务 0≤4）、Git add/commit 0（目标项目，≤12）、墙钟约 1.5 分钟（≤90 分钟）；模型轮次 chief 1 / product 1；逐轮 token/费用未被应用暴露（未伪造） | **within budget** |

**结论**：B1 v1.2 AC-30（RR-01…RR-06 全部通过）**不成立**；RR-02/RR-03/RR-04 失败或未执行。最终判定权属独立验收（B2），本记录不替代 B2。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**事实链（均可复现/有证据）**：

1. 空项目导入后 governanceModel=trio、primaryRoleId=chief（`roles.listing`）。
2. 幕僚聊天会话打开时 **无 taskId**；桌面 `app/desktop/session.ts:3628-3631` 的 `requestedSessionMode` 仅在 `req.taskId !== undefined` 时按任务 flow 解析 fixed，否则 `"legacy"`；`session.ts:3805` 将其作为 trio 会话模式。
3. `src/pipeline/orchestration/run-role.ts:1463-1471` 会话级 `sessionWorkflowMode` 缺省 `"legacy"`，仅在 taskId 绑定时解析；`run-role.ts:2716-2748` 的 fixed 上下文与 `chief-workflow-v2.md` **只在 `sessionWorkflowMode === "fixed"` 注入**。诊断中 **无 `chief.workflow.v2.loaded`**，与上述一致。
4. 因此幕僚按 legacy `chief-workflow.md`（v1）行动：先写 `docs/intents/*`、尝试 legacy intent-confirm 卡（被拒），再以 legacy 星形派发 chief→product（`task.created` 无 `taskKind/workflowPath`）。
5. 应用的首个 fixed 启动顺序（`app/desktop/session.ts:8843-8853::ensureFixedPathStarted`）只在**幕僚已发出携带 `taskKind:"stage-request"` + `workflowPath` 的派发**时触发；legacy 注入的幕僚没有被要求/告知生成该请求，故固定路径永远起不来。
6. 结果是 legacy Hub run（`.ans/runs/run-hub-4e71…`）+ legacy trunk 初始化源（`.ans/trunk/initialization-sources/…`）落盘——正是 fixed 默认路径必须不触达的旧机制（B1 AC-23/RR-04）。

**为什么确定性测试没挡住**：确定性全链 `test/测试/fixed-path-full-chain.test.ts:429-446（注记见 :445）` 以 **直接 `routeDispatch`** 构造首个 stage-request（并在测试内注记「幕僚首请求的投递会自动以 legacy 注入打开目标会话；先停止，再按 fixed 任务重开」），**不经过真实聊天首消息入口**；B5.2/B5.3 的 3/3 全链因此不覆盖本次 RR 暴露的入口缺口。该缺口属产品级（fixed 会话入口/首消息模式注入），修复不在本角色范围（RR 不做治理/产品文档修正）。

**失败码归类**：`fixed-path-not-activated-from-chief-chat`（首次派发无 `taskKind/workflowPath` → 未 `workflow.started`）；伴随 `legacy-state-written: .ans/trunk` 与 `.ans/runs`。未出现 judge 代批、未出现额外客户门（0 卡）、未出现 merge-main。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1**（原文，仅一条） |
| 客户卡 | ≤4（意图/方案/任命 + merge-main） | **0**（固定 3 卡与 merge-main 均未出现；无 judge 参与） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **1**（chief→product legacy；chief=1、convener=0、实现写任务=0；产品/策划/人事/验收生产派发=0） |
| Git add/commit（目标项目） | ≤12 | **0**（未创建 Git 仓库/未提交） |
| 墙钟 | ≤90 分钟 | 约 **1.5 分钟**（15:55:34–15:56:41 UTC；导入→停止） |
| 模型轮次 | 单独如实报告 | settled 事件 **2**（chief 1 / product 1），**均 `outcome:"aborted"`**（中止，无完成轮；chief 轮已发出 legacy 派发后中止，product 轮收到任务后中止）；原生 transcript 实测：chief **22** assistant messages / input **96,025** / output **18,522** / cache read **638,720** tokens；product 0 assistant messages；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 原生 transcript 提供 token 用量（见上），**无 `cost_usd` 字段：费用数字不可得，不估算、不伪造**；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为证据清单（写盘实测）：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json` | `5eeeba325625d0733d21b21dbcd36e0c900701801c27271291652a509aa6393b` |
| `budget.json` | `f9cac0a31d2a630e4f0f4ddbadb051321ff8e71a0e1519026d3417d819333155` |
| `drive.jsonl` | `342a93b5e3f502ec1c3c663481c02f5711c6002c711f72784dbb86ef96af86fd` |
| `customer-message.txt` | `deeedcc4641317a0fc97e8d9ed74e9bdfa19754dfd793e43fd09ff99f3e361e2` |
| `tasks.jsonl` | `36fb674fa78bee9593dfec50241335f538281a2c9152b6ff7d508a2fbcb3fdaa` |
| `legacy-run-manifest.json` | `e3a53a1aedb45a966109c0fc53c999b73ed22462bea5094324b0c8f95c788ec5` |
| `legacy-trunk-initialization-source.json` | `3f55df9377c5864c3ad373ff2952f44f5e4990e0fca0f13ce54156f582addff6` |
| `replay-chief.jsonl` | `e1fe2a0477bdd38168adfb9f1fac88ccfddc126bfe84c999a6317e9ed46170f6` |
| `replay-product.jsonl` | `5f88d405be5eb44e03460af0b5b00ee9102ec49613f20330817bdf2d3a1bdd59` |
| `fixed-path-absence-facts.json` | `064f30529e98e7c2d592d264a91cb64df055c3452236751ac61095ee5754fa1f` |
| `root-cause-code-pointers.txt` | `1bab38ef46f214a7e75cab5f111617c44915298dfbde9aebf6f7b95d5d3ed39e` |
| `model-usage.json` | `6d18d82a293fbf8c6b1a8c24d52001a06f26596940f3cbb06d2d43b242855d29` |
| `ui-90-gate.jpeg` | `e0bb26f00853ce707c52d6309c65e41a4c747c5c8a379a88d9e4ef37f02ab1f4` |
| `native-chief-transcript.jsonl` | `17cf75d7b49855626d2f41128c1ed839566715eb5a20dd8f2d8fe14a01f1b7c4` |
| `native-product-transcript.jsonl` | `7069f467b3150bab5f322b0d028e36a987441cf934e43334ce7161d99c3a5c88` |
| `usage-extract.json` | `f5be47fa7f817d8a967f1d90353d408ab59a4c563311e5061b44983c566c3564` |

其余截图/诊断/驱动日志见 `_evidence/sha256sums.txt`。运行根原件保留在 `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr-2026-11-10\evidence\`。

**证据限制/披露**：
- 驱动在 `finalize()` 的 `Browser.close` 后出现 Node「unsettled top-level await」并以退出码 13 结束；**证据采集（final-report/drive-summary/budget）在关窗之前已完成并写盘**，运行根与 `_evidence/` 内容完整；不影响事实判定。
- 模型 token 用量取自原生 transcript（已附原件）；费用（`cost_usd`）未被记录、不可得，本记录不估算。
- 路径 B：未执行（RR-02 失败即停；确定性 T-12 覆盖，不伪造）。
- 未用 `amendBasis`；未做治理/产品文档修正；未触碰 `src/common/gates/` 与 `角色卡/**`（除本记录与 `_evidence/`）。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env` 凭据；未触碰既有运行根/目标（零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；RR 结果如实为 **失败**。
