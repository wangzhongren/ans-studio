# RR16 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B20 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR16 = B20 修复后的真机全链复验，预算同 RR15 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `12e9102ec9f3ebc9219845130e55604d1d072144`（B20：fixed `activate_role_documents` 的 MCP inputSchema 允许 path-only；含 B19/B18/B17/B16）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR16 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR16 未通过（RR-02 fail + RR-06 fail）——链路首次推进到 A11/A12a：A1–A10 全部完成（B18/B19/B16/B20 均生效；A8 path-only 激活成功，4 个 `role.activated`；A9 团队计划+不可变基线；A10 任命卡 4 角色客户多选）；A11 实现派发因「任务冻结写授权交集为空」连续被写门禁拒绝，convener 判定为派发侧缺陷并以 rework 重派，第三次 A11 请求使 chief 派发数达到 13 > 批准上限 12，按预批准预算门停止**。未到 A12b/A13/merge；目标项目无实现提交（仅应用自建基线提交）。**RR 不通过，不伪造通过**。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr16-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `12e9102`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR16）；运行期采样：9222=0、9223=0 监听 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR15–RR1 根与两处旧贪吃蛇根共 17 项 mtime 运行前后一致（`_evidence/zero-touch.json`：17 项均 `true`） |
| 驱动 | RR8 修正版（30s 卡等待 + UI 分类 + orphan 跳过 + 任命 checkbox 回退）；RR9–RR16 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 04:17:52.664 | **唯一客户消息**发送（幕僚 fixed 注入后） | `drive.jsonl`、`customer-message.txt` |
| 04:17:59.427 | `workflow.started wf-51b3f2f1cb476297dbcfd938`（path A）+ `stage.requested A1` | `workflows.jsonl` |
| 04:18:19.275 | `stage.dispatched A1` | `workflows.jsonl` |
| 04:18:37.961 | `stage.requested A2` | `workflows.jsonl` |
| 04:19:30.629 | **`stage.completed A2`**；B19 生效，幕僚被唤醒 | `workflows.jsonl` |
| 04:19:44.006–.218 | **A3 意图卡** `req-7a6cca3b6a286459` 客户 confirm；**`stage.completed A3`** | `tasks.jsonl`、`drive.jsonl` |
| 04:19:51.701 / 04:19:58.467 | A4 requested / dispatched | `workflows.jsonl` |
| 04:20:13.430–04:22:13.037 | A5 requested；一次引用未产出契约的投递被 delivery-rejected（rejected 收口）；重派后 **`stage.completed A5`** | `workflows.jsonl`、`tasks.jsonl` |
| 04:22:29.333–.776 | **A6 方案卡** `req-dd7923679393cfc9`（单卡）客户 accept；**`stage.completed A6`** | `tasks.jsonl`、`drive.jsonl` |
| 04:22:35.213 / 04:22:41.818 | A7 requested / dispatched | `workflows.jsonl` |
| 04:23:18.384 / 04:23:31.549 | A8 requested / dispatched；B16 写出 4 套角色三文件 | `workflows.jsonl`、`target/角色卡/**` |
| 04:24:05.768–04:24:10.889 | **B20 生效**：`role.activated` env-bootstrap、game-core-dev、game-ui-dev、game-qa（path-only 激活全部成功） | `workflows.jsonl`、`rr16-facts.json` |
| 04:24:10.894 | **`stage.completed A8`** | `workflows.jsonl` |
| 04:24:58.812–04:26:14.337 | A9 requested；两次 blocked（`baseline-document-missing` 04:25:28.638；`baseline-team-plan-invalid` 04:25:48.511）；恢复后 **`stage.completed A9`**；`basis.recorded bas-ba529b1e400941d756d0956a` | `workflows.jsonl`、`basis.jsonl` |
| 04:28:02.236–.478 | **A10 任命卡** `req-33769db1f55a33dd`：4 个角色 checkbox，客户多选 `env-bootstrap,game-core-dev,game-ui-dev,game-qa`；**`stage.completed A10`** | `tasks.jsonl`、`drive.jsonl` |
| 04:28:13.805 | **`stage.dispatched A12a`**（G-1：验收标准可先派）；verifier 产出 `docs/quality/snake-game-criteria-v1.md`（04:29:17 报告） | `workflows.jsonl`、`tasks.jsonl` |
| 04:28:19.956 | `stage.requested A11` + `stage.dispatched A11`（首次；随后被 convener 以「标准文件未落盘」blocked，rework 收口） | `workflows.jsonl`、`tasks.jsonl` |
| 04:29:22.792 | `basis.verified`（基线校验） | `basis.jsonl` |
| 04:29:39.502 | A11 重新 requested/dispatched（第二次） | `workflows.jsonl` |
| 04:29:56.638 / 04:29:59.668 | convener 派发 env-bootstrap / game-qa 实现任务 | `tasks.jsonl` |
| 04:30:41–04:30:52 | 两名 worker 的 `write_file` 均被写门禁拒绝（见第四节）；`stage.blocked A11`（`task-report-blocked`，04:30:52.038）；两任务 rework 收口 | `tasks.jsonl`、`workflows.jsonl` |
| 04:31:25–04:31:28 | game-qa 补报 blocked；任务 rework | `tasks.jsonl` |
| 04:31:31.500 | **第三次 A11 requested/dispatched**（`t-mwbmgfxo-e6a86b1a`） | `workflows.jsonl` |
| 04:31:31.878 | **预算门触发**：`gate.detected budget-chief-dispatches count=13`（>12）；驱动停止 | `drive.jsonl`、`final-report.json` |
| 04:31:4x | 证据落盘；Electron 关闭（9224 进程 0） | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **3**（intent-confirm / proposal / appointment 各 1；均客户作答；无重复、无 merge-main）；真实任务 **22**（chief 13、convener 9）；`task.reported` 26；`task.closed` 20（accepted 12、rejected 2、rework 6）；**实现写任务 2**；总墙钟约 **13.7 分钟**（04:17:52–04:31:36；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1–A10 全部完成（B18/B19/B16/B20 生效；4 个 role.activated；A9 基线与团队计划；A10 任命卡 4 角色）；A12a 已派发（criteria 文档落盘）；**A11 实现派发被写门禁拒绝（冻结写授权交集为空），rework 后第三次请求触发预算门停止**；A12b/A13/merge 未到达；目标项目无实现提交（仅应用基线提交 `8347781`） | **fail** |
| **RR-03** 发布合并 | 未执行（merge-main 未呈现） | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：A1–A10 全链事件、A8 completed、A12a dispatched、A11 requested/dispatched×3、A11 blocked；`basis.jsonl`：recorded+verified；`releases.jsonl` 不存在；**4 `role.activated`**；`角色卡/` 4 角色三文件；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**shell-gate 审计存在**（见第四节，均为策略判定、`execution:"未执行"`，无交互式 shell 卡）；目标 git 仅有应用基线提交，`main` 与 `ans/task/…` 同点、无 tag/remote/push；客户卡 3（≤4） | **fail**（链路未达 A12b/A13/merge；A11 受阻） |
| **RR-05** 失败即停 | 预算门（预批准）触发后立即停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 3（≤4）；真实任务 22（≤40；**chief 13 > 12 超限**；convener 9≤10；product 2≤3、rapporteur 3≤4、nominator 2≤4、verifier 2≤4；实现写 2≤4）；Git 实现提交 0（应用基线 1）；墙钟约 13.7 分钟（≤90） | **fail**（chief 派发超限；其余在限内） |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读定位；未改任何代码）

**正向（本 RR 首次到达并验证）**：
1. **B20 生效**：fixed A8 `activate_role_documents` 以 path-only（仅路径）调用成功，**4 个 `role.activated`**（env-bootstrap、game-core-dev、game-ui-dev、game-qa），A8 completed——RR15 的 MCP schema 阻塞点已解除；应用侧 hash 回填可见（账本正常记录）。
2. **B19 生效**：A2 completed 后幕僚被唤醒并呈 A3 意图卡（客户 confirm，A3 completed）；A6 单卡客户 accept。
3. **B18/B13/B14 持续有效**：A5 重复投递被拒后以 rejected 收口、重派后 A5 completed；无 close-report-missing；无交互式 shell 卡。
4. **A9 团队计划/基线**：两次 blocked（团队计划缺失、模块引用与不可变基线不一致）后自恢复，`stage.completed A9`，`basis.recorded`+`basis.verified`（bas-ba529b1e400941d756d0956a）。
5. **A10 任命卡**：真实 UI 呈现 4 角色 checkbox 卡，客户多选全部 4 角色；A10 completed（B15.3 门控与角色多选生效）。
6. **A12a（G-1）**：验收标准在实现前先派并由 verifier 产出 `docs/quality/snake-game-criteria-v1.md`（13696 字节，含 ans-criteria/v1 块）；第二次 A12a 补齐 `docs/governance/verifier/` 治理记录。
7. **无 legacy/stable/shell 交互卡**：无 `.ans/trunk`、`.ans/runs`、`stable-writes.json`；shell-gate 审计仅为策略判定（只读 git 允许、write-guard 拒绝），所有行 `execution:"未执行"`。

**失败链（A11 实现派发写授权未冻结，及随之而来的预算门）**：
1. 04:28:19 首次 A11（`t-mwbmcc50-ed6710f7`）：convener 因「A12a 标准文件尚未落盘」blocked → rework；04:29:39 重派（`t-mwbme1im-ae76a89c`）。
2. convener 于 04:29:56/04:29:59 派发 `env-bootstrap` 与 `game-qa` 两个实现任务；两名 worker 的 `write_file` 均被写门禁拒绝：**「Target is outside the actual assigned task's frozen module/current authorization intersection」，允许写入路径为 `project:（无）`**（env-bootstrap 的 README.md/index.html；game-qa 的 qa/snake-game-acceptance-checklist-v1.md）。
3. 04:30:52 `stage.blocked A11`（`task-report-blocked`）：convener 判定为**派发侧未正确冻结任务写授权**（任务文本含写集但结构化授权未绑定/模块授权交集为空），非 worker 实现失败；两任务 rework 收口，计划按模块拆分并以显式 `writeSet` 重派。
4. 04:31:31 convener/chief 发起第三次 A11（`t-mwbmgfxo-e6a86b1a`）；chief 派发累计 **13 > 批准上限 12**，预批准预算门触发，运行停止；重派未及执行，A11 无任何实现产物/提交。
5. 现有 git：`8347781 ANS baseline: ans-managed .gitignore`（应用自建，`main` 与 `ans/task/wf-51b3f2f1cb476297dbcfd938` 同点；无 tags/remotes；工作区干净）。**无实现提交、无推送、无合并。**

**根因定位（只读代码方向）**：fixed 模式 A11 实现任务派发需把既定模块/写集**结构化冻结为任务授权**（frozen module/current authorization intersection），本次 worker 任务授权交集为空（`project:（无）`），写门禁在三处写入前即拒绝，说明派发上下文没有把模块清单/写集绑定到任务授权。**待产品修复方向（下一缺陷候选）**：实现任务派发时按模块清单生成非空 `writeSet`/模块授权（含项目根文件与 qa/ 路径）；同时评估返工重派对 chief 派发预算的占用（本次 13/12 由 rework 重派驱动），避免一次派发侧缺陷即耗尽预算。

---

## 五、预算实际 vs 批准（RR9–RR16 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **3**（intent-confirm / proposal / appointment；均客户作答；无 merge-main） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **22**（chief **13（超 12，触发预算门）**、convener 9；按接收：convener 11、product 2、rapporteur 3、nominator 2、verifier 2、env-bootstrap 1、game-qa 1；实现写 2） |
| Git add/commit | ≤12 | 实现提交 **0**；应用自建基线提交 **1**（`8347781`，非模型、未推送/合并） |
| 墙钟 | ≤90 分钟 | 约 **13.7 分钟**（04:17:52–04:31:36 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **30**（29 completed/1 aborted）· convener **23**（22/1）· verifier **2** · nominator **3** · product **4** · rapporteur **3** · env-bootstrap **1** · game-qa **1**；native transcript：chief 198 msgs / in **202,316** / out **105,054** / cache read **14,209,664**；convener 266 / **269,879** / **163,078** / **21,692,032**；verifier 35 / **111,362** / **35,607** / **964,864**；env-bootstrap 29 / **76,444** / **18,243** / **511,488**；game-qa 44 / **72,704** / **31,154** / **956,416**；nominator 68 / **129,266** / **53,682** / **2,671,104**；product 34 / **58,429** / **22,393** / **577,280**；rapporteur 48 / **140,449** / **65,381** / **1,668,608**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 54 文件）

`sha256sums.txt` 为清单；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:budget-chief-dispatches） | `6417c99757e67cb514b102880be85c394aacc9f1f4833164e75d9f64822dd92b` |
| `budget.json` | `d1e2324effe4ace2597e400d658931502cdc99dbd5e95eae7fa8dae5a6f34e0e` |
| `drive.jsonl` | `900821f9b3db971faf971d3106ceee3f37967eb4963d7b116bda8364e5742045` |
| `tasks.jsonl`（22 任务/26 报告/20 收口） | `a582759e274d6c5dd56b4c561135d6019f053d5e8460f655851fd92d457bed4f` |
| `workflows.jsonl`（A1–A10 + A12a/A11；4 role.activated） | `7a98e6aad9f38bca54914a1783095f42cc0f5816a9197a041a0073ddc23176c1` |
| `rr16-facts.json` | `dd8cab965a092d75b27f0e9214a926254baa9a18a4131a49247fe57db6fdaa5b` |
| `root-cause-code-pointers.txt` | `34747904b7aa268c09585aedd724ce4054b8b6fddec9df1e9cf7e000d2fecda4` |
| `zero-touch.json`（17 旧根全 true） | `0131e029bb7f583a7274fdb6e50682bc22994403d782f8d2b9b8ce3f166a28e6` |
| `snake-game-criteria-v1.md`（A12a） | `9f5fb85ce1aa95e1c06f14f63b98ee0393cad2d77425c3970dd474b3acd47e4e` |
| `snake-game-team-v1.md`（A9） | `161291ac44af9db614dc1e56505fa2ed91f5b783896f9885ef52d1da6f1eb336` |
| `shell-gate.jsonl`（策略审计，均“未执行”） | `df113a81503d68939ac236ad7d6c293f8f06e9ed52e0b9538d1ff91dc14cca30` |
| `usage-extract.json` | `ecd2e43e0b947cddf08ea30415b557ffade31a73a8584f2278df62930fcec025` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-verifier-transcript.jsonl` / `native-env-bootstrap-transcript.jsonl` / `native-game-qa-transcript.jsonl` | `15149b79…` / `4e4ca50a…` / `4c323867…` / `e46a8fc7…` / `e32e33ae…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr16-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。chief/convener 各 1 个 settled 为 `aborted`：驱动停止时点击 halt/stopSession 终止在办回合。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（17 项零触碰已核）。
- 未重试超限、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR16 结果如实为未通过（A11 派发写授权缺陷 + chief 派发预算超限）**。
