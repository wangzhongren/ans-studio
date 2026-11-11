# RR17 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B21+B22 候选；驱动误判无效轮）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR17 = B21/B22 修复后的真机全链复验，预算同 RR16 授权的新批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `e1c3c8b29c808be17592ff71bcbedcd4a548f3da`（B21：A11 模块写集派生；B22：A12 证据回退）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR17 预批准（消息 1；卡 ≤4（3 确认卡 + merge-main）；真实任务 ≤50：chief ≤18、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR17 无效轮（tester-side driver gate），不作产品判定**。链路正常推进至 A5：A2 completed（B19 生效）、A3 意图卡客户 confirm、A4 dispatched、A5 请求并在一次 delivery-rejected 后重派；随后 convener 依 chief 指令发起**材料性 `decision` 卡**（运行平台选择，恰一 recommended=`browser-spa`）。按固定路径判据（AC-13；chief-workflow-v2 §「decision 卡仍可用于材料性选择/需求变更审批」），该卡是**合法固定卡**；但本角色驱动 `CARD_ALLOWLIST` 未包含 `decision`，将其判为 `unexpected-card-kind` 并停止。**非产品缺陷；B21/B22 未获行使，未到 A11/A12**。协调方已随后批准 RR18（驱动侧 decision 卡支持）立即执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr17-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `e1c3c8b`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR17；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR16–RR1 根与两处旧贪吃蛇根共 18 项 mtime 运行前后一致（`_evidence/zero-touch.json`：18 项均 `true`） |
| 驱动 | RR8 修正版（30s 卡等待 + UI 分类 + orphan 跳过 + 任命 checkbox 回退）；RR17 预算常量：总 40→50、chief 12→18（其余同 RR16） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 04:41:04.075 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 04:41:12.778 | `workflow.started wf-8803d3c9427603899feb3fe9`（path A）+ `stage.requested A1` | `workflows.jsonl` |
| 04:41:25.503 | `stage.dispatched A1` | `workflows.jsonl` |
| 04:41:56.141 | `stage.requested A2` | `workflows.jsonl` |
| 04:42:48.696 | **`stage.completed A2`**；B19 生效 | `workflows.jsonl` |
| 04:42:58.061–.550 | **A3 意图卡** `req-78f56da0e2c989e2` 客户 confirm；**`stage.completed A3`** | `tasks.jsonl`、`drive.jsonl` |
| 04:43:03.446 / 04:43:14.633 | A4 requested / dispatched | `workflows.jsonl` |
| 04:44:00.602 | `stage.requested A5`；首次投递引用未产出契约被拒（delivery-rejected，rejected 收口） | `workflows.jsonl`、`tasks.jsonl` |
| 04:44:17.314 | A5 重新 requested（重派） | `workflows.jsonl` |
| 04:44:22.684 | **材料性 `decision` 卡** `req-fef63615d93579a9`（convener 发起；选项 browser-spa(recommended)/desktop-window/terminal-tui；taskId=`t-mwbmwuua-218252f9`） | `tasks.jsonl` |
| 04:44:22.701–.827 | 应用通知 chief、向客户呈现（request.presented）；驱动看到对话框 | `tasks.jsonl`、`drive.jsonl` |
| 04:44:22.775–.781 | 应用记录 `request.orphaned`（reason=restart，两次） | `tasks.jsonl` |
| 04:44:22.894 | **驱动门 `unexpected-card-kind`**（decision 不在驱动允许集）；未作答 | `drive.jsonl`、`final-report.json` |
| 04:44:23.921 | 应用记 `request.resolved by:"customer" choice:"unavailable"`（驱动 halt 后） | `tasks.jsonl` |
| 04:44:2x | 证据落盘；Electron 关闭 | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **2**（intent-confirm 1 + decision 1；decision 为合法材料性卡，驱动未答）；真实任务 **8**（chief 5、convener 3；按接收 convener 5、product 2、rapporteur 1）；`task.closed`：见账本；Git 0（A11 未到，目标非 Git 仓库）；总墙钟约 **3.3 分钟**（04:41:04–04:44:2x）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 推进至 A5；A2 completed（B19）→ A3 意图卡客户 confirm + completed → A4 dispatched → A5 requested（一次 delivery-rejected 重派）→ **convener 依 chief 指令发起合法 decision 卡（材料性平台选择，恰一 recommended）→ 本角色驱动误判 `unexpected-card-kind` 停止** | **invalid（tester-side driver gate）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | 账本事件正常（见上）；`decision` 请求行 carry flowId/taskId/sourceRoleId、无 workflowId；应用记 orphaned(restart) 后 resolved(unavailable)；无 `.ans/trunk`/`.ans/runs`；无 `角色卡/`（A8 未到）；无 shell 审计；目标无 Git | **invalid** |
| **RR-05** 失败即停 | 门触发后立即停止并保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 2（≤4；其中 decision 属法定材料性卡，不计入三卡）；真实任务 8（≤50；chief 5≤18、convener 3≤10、product 2≤3、rapporteur 1≤4）；Git 0（≤12）；墙钟约 3.3 分钟（≤90） | **within budget** |

**结论**：RR17 不构成产品验收判定（驱动侧误判）；AC-30 不成立也不因本 RR 而失败。协调方已批准 RR18（驱动侧 decision 卡支持）重跑。

---

## 四、失败事实与根因（只读定位；未改任何代码）

**判据（合法 decision 卡）**：
1. `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.2.md` **AC-13**：「`decision` 卡仅材料性选择/需求变更审批（convener/rapporteur）；fixed 不发 acceptance 卡」。
2. `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` 第 79 行：「`decision` 卡仍可用于材料性选择/需求变更审批（运营/策划发起），**不计入三卡**」。
3. A5 stage-request 任务文本明确要求 convener：由客户决定运行平台、**不得代选**，以 `request_choice` 发起恰一 `recommended` 的 decision 卡，客户选择后写入策划任务。

**实测链**：
1. 04:44:22.684 convener 在真实回合内发起 `req-fef63615d93579a9`（decision；options：browser-spa(recommended)/desktop-window/terminal-tui；taskId=`t-mwbmwuua-218252f9`，sourceRoleId=convener）。
2. 应用通知并呈现给客户（04:44:22.701 presented）；同时记 `request.orphaned`（reason=restart）两次（04:44:22.775/.781）。
3. 驱动 `CARD_ALLOWLIST={intent-confirm,proposal,appointment,merge-main}` 不含 `decision`；`handleDialogOnce` 于 04:44:22.894 触发 `unexpected-card-kind` 并停止（未选择、未提交）。
4. 应用在驱动 halt 后以 `choice:"unavailable"` 记 `request.resolved`（04:44:23.921）。

**根因（驱动侧，测试角色自担）**：RR17 驱动未针对固定路径的合法 `decision` 卡实现识别与作答；同时缺少 decision 独立计数与「恰一 recommended」校验。**产品侧无需修复**。
**观察（供产品参考，非本轮判定）**：应用在该 decision 卡呈现前后即记录 `request.orphaned reason=restart`；卡片仍可被真实客户作答（驱动未作答后以 unavailable 收口）。若真实客户作答时仍已 orphaned，是否影响 `request.resolved by:"customer"` 语义值得在 RR18 中观察；RR18 驱动将按协调方要求对 decision 卡作答（恰一 recommended）并检查解决语义。

---

## 五、预算实际

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认卡 + merge-main） | **2**（intent-confirm 1 + decision 1；decision 属法定材料性卡） |
| 真实任务 | ≤50（chief ≤18、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **8**（chief 5、convener 3；接收：convener 5、product 2、rapporteur 1；实现写 0） |
| Git add/commit | ≤12 | **0**（未到 A11；目标无 `.git`） |
| 墙钟 | ≤90 分钟 | 约 **3.3 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **13**（12 completed/1 aborted）· convener **10**（9/1）· product **4** · rapporteur **2**；native transcript：chief 83 msgs / in **133,694** / out **44,059** / cache read **3,977,216**；convener 81 / **77,061** / **34,145** / **2,776,704**；product 39 / **59,649** / **22,734** / **766,464**；rapporteur 28 / **115,163** / **14,532** / **568,064**；模型 `deepseek-v4-flash`；无 `cost_usd`，不估算 |
| 费用 | 单独如实报告 | 费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 37 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:unexpected-card-kind） | `65e9632549aa10593186bf5d9d3e94e83b2a96d4650da281c870452a613cdb5f` |
| `budget.json` | `2a785f639579dc24ab33f4bc8ceedd2858920e6fce599fed3c1d02ebfbabe563` |
| `drive.jsonl` | `a0c45413ad1bf0e50c0cfe9c4772680f5a4b03a29bb4ba9251aabd924f671441` |
| `tasks.jsonl`（8 任务；decision 请求行） | `6364f428c52aa392f098a9f96b5550159245da424d10eac4b450c0b8a00ffa7f` |
| `workflows.jsonl`（A1–A5） | `9bcef62f58be3eaafcc67d8c4823af0bf6720138daddaea237ef1cdd4414d2c0` |
| `rr17-facts.json` | `e2bfad6be41e40a17bacf8d68d6d83a819b7ca6263b289b593820deaca8e85b4` |
| `root-cause-code-pointers.txt` | `4d923dcf610092019b91b4441c057d14dcc90baa40224ff2f46e3c0a87c078fe` |
| `zero-touch.json`（18 旧根全 true） | `645bcb34975ab056bc13cca7a75dab17202a325475744301f030b8b65409afb9` |
| `usage-extract.json` | `1bdefe71dfb984aca8ca216a4229b4a55000b7e161f4ba6e77f6d8263076da0a` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` / `native-rapporteur-transcript.jsonl` | `aa7c7e79…` / `ee8d836f…` / `e742dbdb…` / `f1951757…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr17-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。chief/convener 各 1 个 settled 为 `aborted`：驱动停止时 halt/stopSession 终止在办回合。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（18 项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR17 如实记为无效轮（tester-side driver gate），不按产品失败或通过处理**。
