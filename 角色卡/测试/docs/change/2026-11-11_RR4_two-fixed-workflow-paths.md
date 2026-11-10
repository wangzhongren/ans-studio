# RR4 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B8.1/B8.2 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR4 = B8.1/B8.2 修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `bed6e0b97cec0287279738b7a3d7f28417f92d9f`（`fix(desktop): B8.2 fixed workflow binding and handback without legacy assignment`；B8.1 `9e89a31` 强制 fixed 会话已含）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR4 授权（预算同前：消息 1、卡 ≤4、派发 ≤20、Git add/commit ≤12、≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR4 未通过（RR-02 fail）**。**B8.1/B8.2 修复实测生效**：运营会话强制 fixed（fixed context 注入）、运营生产派发 **由应用自动绑定 workflowId/stage**（模型未自报）；产品已写出 `docs/product/snake-game-intent-v1.md`；无 legacy stable-write、无 `.ans/trunk`/`.ans/runs`。**停止点**：产品为计算意图文档 SHA256 使用 `run_shell certutil`，触发 **shell 审批/升级面（「命令审批 · 产品」）**——fixed 4 卡之外的额外客户/操作员门；shell-gate 审计记录该命令 `deny / 未执行`；驱动按策略立即停止（不代答）。另观测到 **`stage.dispatched A1` 未入账**（运营生产任务 stage=A2，不在 `FIXED_STAGE_DISPATCH_RECORD_STAGES` 集合；A1 停留 requested），属潜在下一阻塞（详见 §四，未判罚）。**RR 未通过，不伪造通过**；路径 B 未执行。
- 未合并/未发布：未提交/推送/合并/发布 ans-studio `main`；未打 tag；未发布产物；未修改产品/测试/角色卡/边界/其它文档（仅本记录 + `_evidence/` + 仓库外运行根）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr4-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `bed6e0b`） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR4）；运行期采样：9222=0、9223=0 监听，9224=1（`final-report.json::ports`） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR3 根、RR2 根、RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：五项均 `true`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 20:31:16–20:31:20 | 导入 `target\`；6 内置角色（trio）；幕僚会话打开；**`chief.workflow.v2.loaded`（fixed 注入）** | diagnostics |
| 20:31:21.348 | **唯一客户消息**发送（`做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）`） | `customer-message.txt` |
| 20:31:30.594 | **首个完整 stage-request 受理**：`.ans/project.json={"workflowSchema":"two-fixed-paths/v1"}`；`workflow.started wf-c8e880c3b8892a0dc60ba9db`（path A）+ `stage.requested A1` | `target-project.json`、`workflows.jsonl` |
| 20:31:30.599 | `task.created` chief→convener（`taskKind:"stage-request"`、`stage:"A1"`、`workflowId`） | `tasks.jsonl` |
| 20:31:40.892 | **运营强制 fixed 生效**（fixed context 标题「生产线唯一派发者」×2）；运营生产派发输入仅 `{flowId:"snake-game", roleId:"product", stage:"A2", sideEffect:"docs"}`（**未自报 workflowId**）→ 应用 **B8.2 自动绑定** `workflowId:"wf-c8e880c3b8892a0dc60ba9db"`、`stage:"A2"`、`flowId:"snake-game"` → `task.created` convener→product | `tasks.jsonl`、`rr4-facts.json` |
| 20:31:4x–5x | 产品写出 `docs/product/snake-game-intent-v1.md`（7,024 B，sha256 `37981ad956ffeaf7195144dca20d2110cd18483713cb680e362ce3565bb3c46b`） | `snake-game-intent-v1.md` |
| 20:31:55.297 | 产品为计算该文件 SHA256 调用 `run_shell certutil -hashfile … SHA256` → **shell 审批/升级面出现**（「命令审批 · 产品」）；驱动 gate `shell-confirm-card` 立即停止、未代答 | `gate.detected`、`ui-90-gate.jpeg` |
| 20:31:56.320 | shell-gate 审计：`conclusion:"deny"`、`by:"ruleset:default（su 审批档） → operator:51054"`、`execution:"未执行"` | `shell-gate.jsonl` |
| 20:31:57.556 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；固定 3 卡与 merge-main **0**；真实任务 **2**（chief→convener stage-request、convener→product A2）；运营 1 次生产派发（自动绑定成功）；Git 0；模型 settled 3 条（chief 3 / convener 2 / product 1；驱动统计）。总墙钟约 **36 秒**（20:31:21–20:31:57；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target（0 条目、非 Git、无 `.ans`）；独立 userData；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → 幕僚 fixed 注入 → 客户消息 1 条 → 首个 stage-request 启动 workflow（workflowSchema 写入）→ **运营强制 fixed + B8.2 自动绑定生产派发成功** → 产品写出意图文档 → 产品 `run_shell certutil` 触发 **shell 审批/升级面**（fixed 4 卡之外的额外门）→ 驱动停止。3 卡/A3/A10/A11/A12/归档/合并均未到达 | **fail**（在 A2 处额外 gate 停止） |
| **RR-03** 发布合并 | 未执行（未到 A12/A13；无 merge-main 卡、无 `release.merged`） | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl` 有 `workflow.started`+`stage.requested A1`（**无 `stage.dispatched`**）；`basis.jsonl`/`releases.jsonl` 不存在；`.ans/project.json` 存在（fixed）；**`.ans/trunk`/`.ans/runs`/`stable-writes.json` 均未写**（B8 正向）；`docs/audit/shell-gate.jsonl` 有 1 条 **shell deny** 审计（非 git 审计）；无 `.git`/`.gitignore`；固定卡 0/4；无 judge 参与 | **fail**（链路未完成 + 额外 shell 门；legacy trunk/run/stable-write 零写为正向） |
| **RR-05** 失败即停 | 首个 shell 审批面出现即停止；未代答/未重试/未追加消息；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 见 §五：消息 1（=1）、卡 0（≤4）、真实任务 2（≤20；chief 1≤8、convener 1≤4、实现写 0≤4）、Git 0（≤12）、墙钟约 36 秒（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B8.1/B8.2 已验证生效）**：
- B8.1：运营（convener）自动打开会话为 **fixed**（fixed context 标题「生产线唯一派发者」×2；`two-fixed-paths/v1` 注入），未再出现 RR3 的 legacy 会话/legacy contract 视图。
- B8.2：运营生产派发仅给出 `flowId/roleId:"product"/stage:"A2"/sideEffect:"docs"`，**应用从父 stage-request 自动绑定** `workflowId:"wf-c8e880c3b8892a0dc60ba9db"`（`task.created` 实测），未要求模型自报；无 legacy stable-write、无 trunk/run 写。
- 产品写出意图文档（7,024 B / `37981ad9…`）。

**停止点（shell 审批/升级面）**：
- 产品角色为计算 `docs/product/snake-game-intent-v1.md` 的 SHA256，调用 `run_shell` 执行 `certutil -hashfile docs\product\snake-game-intent-v1.md SHA256`（原生 reasoning 明示选择 certutil）。该命令进入既有 shell 审批链（`src/common/门禁引擎/shell-gate.ts`，高风险清单保留，设计 v1.3 §8）；shell-gate 审计 `conclusion:"deny"`、`execution:"未执行"`；UI 出现「命令审批 · 产品」面。
- RR 允许卡只有 fixed 3 卡（intent-confirm/proposal/appointment）+ merge-main；shell 审批/升级属**额外客户/操作员门**，不在 RR 卡预算与允许卡种内 ⇒ 驱动按「额外门即停」记录并停止（未代答）。
- 产品/协调方待决定方向（不在测试角色范围）：(a) fixed 角色上下文禁止/避免用 shell 计算哈希（改用只读工具/应用服务，例如 `evidence_check`/`read_file` 或应用哈希）；(b) 或 RR 政策显式允许 shell 审批（需调整卡预算/门禁口径）；(c) 或 shell 审批对只读哈希类命令给白名单（需安全评审）。**本记录不判罚任何一方，仅记录实测。**

**潜在下一阻塞（观测，未判罚）**：
- `workflows.jsonl` 仅有 `workflow.started` + `stage.requested A1`，**无 `stage.dispatched`**。运营生产任务 `stage:"A2"`（B8.2 记录与 `chief-workflow-v2.md:44` 将生产派发 stage 定义为**目标阶段** A2），而 `app/desktop/workflow.ts:291::FIXED_STAGE_DISPATCH_RECORD_STAGES = ["A1","A4","A7","A8","A12a","A12b"]` 不含 A2 ⇒ 应用 `recordFixedStageDispatchForTask` 未记录 A1 完成（A1 停留 requested）；确定性夹具 `test/测试/fixed-path-full-chain.test.ts` 的同一生产派发传 `stage:"A1"`，掩盖了该真实语义差异。若继续，A1 未完成将影响 A2/A3 与意图卡。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（意图/方案/任命 + merge-main） | **0**（固定卡 0；额外出现 shell 审批面，非治理卡） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **真实任务 2**（chief stage-request 1、convener 生产 1；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0**（未创建 Git 仓库/未提交） |
| 墙钟 | ≤90 分钟 | 约 **36 秒**（20:31:21–20:31:57 UTC） |
| 模型轮次 | 单独如实报告 | settled 3（chief 3 / convener 2 / product 1，驱动统计）；原生 transcript：chief **16** assistant msgs / input **97,884** / output **5,079** / cache read **391,552**；convener **18** / **66,118** / **8,440** / **345,216**；product **9** / **35,421** / **4,609** / **77,312**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（28 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json` | `4edacee4f3a01c08bf335af1958316eb529d1095070bc056316a8bcd62339a43` |
| `budget.json` | `274486418bcd0444cf7923ae717c2dfbb5e04b4ba5e6b6634c9d2e27cfde5619` |
| `drive.jsonl` | `0b8ae39881c9bd388a3ef0928faf017e49b815366107f73d658aa4ea30b75821` |
| `tasks.jsonl` | `58ee5bee16a8d5d885cdc209c6369cd7fa5f71a2a7314f4a8c757ff862938ef9` |
| `workflows.jsonl`（started + A1；无 stage.dispatched） | `2941b043b07dbd2e74002cfee629d406ca3dfd12a6eb8ab9291300f32c3fb7c2` |
| `target-project.json`（fixed 启动写回） | `e5b6da4d880c68d231da950b2da8d5f7066a14bfafe0a255b9b5f4098bf5de54` |
| `snake-game-intent-v1.md`（产品意图文档） | `37981ad956ffeaf7195144dca20d2110cd18483713cb680e362ce3565bb3c46b` |
| `shell-gate.jsonl`（shell deny 审计） | `474bcf33761af9057197395b77c8bc3b808a4be7bf0a3793f2db808702d8292f` |
| `rr4-facts.json`（B8 绑定/fixed 注入/legacy 零写/shell deny） | `bf748f9fcb2290c5a3aa6286fa64a842daa659a095f44afe79ee9dc38341d04a` |
| `zero-touch.json`（五旧根零触碰） | `bf26cf4db7ec0ea82d7550014ef4a06acc92949aa91493159d6c90650b350d79` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-product-transcript.jsonl` | `dffb0de6…` / `e0e8556a…` / `cb290040…` |
| `ui-90-gate.jpeg`（shell 审批面截图） | `6d182d1c32d15283de4fabb8fc370eae20745c658bd25faeee317aa11b7b38c6` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr4-2026-11-11\evidence\`。

**披露**：驱动在 `finalize()` 的 `Browser.close` 后再次出现 Node unsettled top-level await（退出码 13）；证据（final-report/budget/drive/账本）在关窗前已写盘，内容完整。shell 审批面由驱动按「fixed 允许卡种之外」gate 未代答；审计显示命令被 deny/未执行。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（五项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；RR4 结果如实为 **未通过**（A2 处 shell 额外门停止；并观测 stage.dispatched A1 缺口）。修复/政策决定不在本角色范围。
