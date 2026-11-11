# RR9 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B13.1/B13.2 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR9 = B13.1/B13.2 修复后的真机全链复验，新预算）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `507d515eb77e5355bc9a7fd3bcc322777573abb2`（B13.1 `ccb1e09`、B13.2 `507d515`）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR9 批准（新预算：消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR9 未通过（RR-02 fail）——在 A1 受理阶段因运营（convener）执行 shell 环境探测触发 shell 审批/拒绝面，驱动按「fixed 允许卡之外的门」立即停止**。正向：幕僚 fixed 注入、`workflow.started wf-c9619b75a46cb06facfb16ca`、A1 stage-request 任务创建、无 `.ans/trunk`/`.ans/runs`。失败链：运营在受派回合内 `run_shell` 执行 `node -v`（ruleset allow；audit `execution:"未执行"`）与 `python --version`（ruleset default → operator **deny**；`execution:"未执行"`），UI 出现「命令审批 · 运营」shell 审批面；驱动 gate `shell-confirm-card`（shell 审批不在 RR 允许卡种/预算内）停止。**未到 A2+；无客户治理卡；未伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr9-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `507d515`）；本启一次成功（无 GPU 故障） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR9）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR8/RR7/RR6/RR5/RR4/RR3/RR2/RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9 预算门：总任务 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 00:59:17–00:59:19 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（00:59:18.459） | `drive.jsonl`、`customer-message.txt` |
| 00:59:27.427 | `workflow.started wf-c9619b75a46cb06facfb16ca`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl`、`target-project.json` |
| 00:59:27.432 | `task.created` chief→convener A1 stage-request（`t-mwbevpz7-e8b6bb93`；无 runId） | `tasks.jsonl` |
| 00:59:27.4x | 运营会话打开；`taskGit.scope.unavailable code:"git-task-scope-invalid"`（A1 stage-request 无写集属正常） | diagnostics |
| 00:59:31.868 | 运营 `run_shell node -v`：shell-gate 审计 `conclusion:"allow"`（ruleset default），`execution:"未执行"` | `shell-gate.jsonl` |
| 00:59:32.030 | UI 出现 **shell 审批面「命令审批 · 运营」**（command `python --version`）；驱动 gate `shell-confirm-card` | `drive.jsonl`、`ui-90-gate.jpeg` |
| 00:59:33.053 | 运营 `run_shell python --version`：shell-gate 审计 `conclusion:"deny"`（ruleset default → operator），`execution:"未执行"` | `shell-gate.jsonl` |
| 00:59:34.279 | 驱动停止并落盘证据；Electron 退出（9224 仅 TIME_WAIT，进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户治理卡 **0**；真实任务 **1**（chief→convener A1 stage-request）；运营生产派发 **0**；Git 0；模型 settled：chief 1 / convener 1（均 aborted）。总墙钟约 **16 秒**（00:59:18–00:59:34；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → workflow 启动 → A1 stage-request 任务 → **运营 shell 环境探测触发 shell 审批/拒绝面** → 驱动按允许卡外门停止；A1 未派发生产任务，A2+ 未到达 | **fail**（A1 阶段 shell 门停止） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started + A1 requested；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；`docs/audit/shell-gate.jsonl` 2 条（`node -v` allow / `python --version` deny；均 `execution:"未执行"`）；无 `.git`；无客户治理卡 | **fail**（链路未完成；shell 门） |
| **RR-05** 失败即停 | shell 审批面出现即停止；保留现场/账本/审计/回放；未重试/未追加消息 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 0（≤4）；真实任务 1（≤40；chief 1≤12、convener 生产 0≤10、实现写 0）；Git 0（≤12）；墙钟约 16 秒（≤90） | **within budget（但任务未完成，早停）** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**事实链**：
1. 幕僚首条 A1 stage-request 正常（workflow.started + A1 requested + chief→convener 任务；无 legacy 写）。
2. 运营（convener）在其真实受派回合内用 `run_shell` 做环境探测：`node -v`（ruleset allow）与 `python --version`（ruleset default → operator deny）；两条审计均 `execution:"未执行"`。
3. UI 出现「命令审批 · 运营」shell 审批面；驱动按 fixed 允许卡（3 确认 + merge-main）之外的**额外 gate** 立即停止。
4. 未发生任何产品派发（convener 生产派发 0）；A1 阶段未推进；无客户治理卡。

**待产品/协调方裁定的方向（不在测试角色范围）**：
- (a) fixed convener 上下文/角色指引是否应禁止或避免用 `run_shell` 做环境探测（如 `node -v`/`python --version`），改用只读能力或直接按应用环境决策；
- (b) shell 审批是否为 RR 可接受的门（设计 v1.3 §8 保留 shell 审批；若 RR 允许，则驱动策略与卡预算需明确更新）；
- (c) ruleset 是否应对只读版本检查类命令给 allow（需安全评审）；
- (d) 若 shell 审批面仅为 deny 结果提示（审计 `deny/未执行`），产品亦可考虑不在 UI 以审批卡形式呈现 deny 结果，避免与客户门混淆。

---

## 五、预算实际 vs 批准（RR9 新预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **0** |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **1**（chief 1≤12；convener 生产 0≤10；product/rapporteur/nominator/verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **16 秒**（00:59:18–00:59:34 UTC；shell 门早停） |
| 模型轮次 | 单独如实报告 | settled：chief **1**（aborted）、convener **1**（aborted）；原生 transcript：chief 9 assistant msgs / input **98,923** / output **2,812** / cache read **200,960**；convener 7 / **83,128** / **710** / **61,440**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（25 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:shell-confirm-card） | `2daa0f48f2892d8b0c12e99f1d104729ce5d2d733187e54a85dfa6cc207ef109` |
| `budget.json` | `49a4c96639b49c85506de791052b95b8b4b84e9b342d1dc7a68075c80e49296b` |
| `drive.jsonl` | `9d086dcfe161ae06ca0c3a3dbeaed84d6d456d7639fb4dc13668486d27d6172d` |
| `tasks.jsonl`（仅 1 条 task.created） | `84c11f6f858461137c4454e32e2a453dd19ad4bbd7a3b12565074187f34967f5` |
| `workflows.jsonl`（started + A1 requested） | `95cc27fb3e4d2ebe62a16e095360cba128581150f1250d380ada080a13868b5c` |
| `shell-gate.jsonl`（node -v allow / python --version deny；均未执行） | `6844234ac6f0e2ab9fa4d0d60223ee59be4de8bfe4eb0fda27333450679c5480` |
| `rr9-facts.json` | `c4d23e946eb2246cf525a9e49d043981a64e792c74a2b700d17645b1efe4b077` |
| `root-cause-code-pointers.txt` | `090ba241b7995c99f3dc0020a5f26fcfc06e9f6c45427f5c919bf41d8007510d` |
| `electron-out.log` | `9dd6551d77d51aed051e97f223906046703bea5e2b770055817d4181c98fa18d` |
| `zero-touch.json`（十旧根零触碰） | `ebcbbd46bd94edc649426f61e196f05d19cbe732034fd6ed729c99d734dcbd44` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` | `37f3251c…` / `ec487255…` |
| `ui-90-gate.jpeg`（shell 审批面截图） | `e6c1faa2d259b0c0fce749b0c47ccc1d6ce1182cff5878ac21dd1404f01662f4` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr9-2026-11-11\evidence\`。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR9 结果如实为未通过（A1 shell 门早停）**。
