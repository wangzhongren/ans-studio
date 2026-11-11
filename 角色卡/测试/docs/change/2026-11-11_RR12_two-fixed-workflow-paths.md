# RR12 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B16 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR12 = B16 修复后的真机全链复验，预算同 RR11 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `d3bcd86d191a350e6f4b058677f19cbfef400b21`（B16）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR12 预批准（消息 1；卡 ≤4；真实任务 ≤40：chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR12 未通过（RR-02 fail）——A8 角色激活被应用侧 SHA-256 提供缺口阻塞（B9.1 观察项暴露）：nominator 已按名单写好两套角色三文件（6 文件，B16 写权生效），但拿不到 roster 与三份角色文档的应用计算 SHA-256，`activate_role_documents` v2 校验不通过，`role.activated` 未写入（0/2 激活）；3 次 bounded 重试均 blocked，无新信息后停止重试；12 分钟无账本进度，驱动 `stalled-no-progress-12min` 停止**。B15.1/B15.2 继续生效（A5 完成、A6 单卡）；**B16 写权生效但激活 hash 缺口阻塞 A8**；A9/A10/A11/A12/merge 未到达（B15.3 未行使）。**RR 不通过，不伪造通过**；路径 B 未执行。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr12-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `d3bcd86`）；本启一次成功 |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR12）；运行期采样：9222=0、9223=0 监听，9224=1 |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR11–RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：十三项均 `true`） |
| 驱动 | RR8 修正后驱动（30s 卡等待 + UI 标题/选项分类 + orphan 跳过）；RR9–RR12 预算门（总 40、chief 12、convener 10、product 3、rapporteur 4、nominator 4、verifier 4、实现写 4、卡 4） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 02:21:12–02:21:16 | 导入 `target\`；6 内置角色（trio）；幕僚 fixed 注入；**唯一客户消息**发送（02:21:14.991） | `drive.jsonl`、`customer-message.txt` |
| 02:21:24.600 | `workflow.started wf-dca959fc4cf59b340b74fc0c`（path A）+ `stage.requested A1`；`.ans/project.json` fixed | `workflows.jsonl` |
| 02:22:14.780 | `stage.dispatched A1`（convener→product A1 任务） | `workflows.jsonl` |
| 02:23:19.675 | **`stage.completed A2`** | `workflows.jsonl` |
| 02:23:48.039–.534 | **A3 意图卡**（`req-98b74d01203f5c65`）客户 confirm + **`stage.completed A3`** | `tasks.jsonl`、`drive.jsonl` |
| 02:26:56.259 | `stage.dispatched A4`（rapporteur 受理/准备） | `workflows.jsonl` |
| 02:29:45.852 | **`stage.completed A5`**（B15.1 生效） | `workflows.jsonl` |
| 02:30:05.033–.493 | **A6 方案卡**（`req-8d0c490a9d053582`，单卡）客户 accept + **`stage.completed A6`**（B15.2 生效） | `tasks.jsonl`、`drive.jsonl` |
| 02:30:20.549 | `stage.dispatched A7`（nominator 受理/准备） | `workflows.jsonl` |
| 02:30:48.156–02:31:15 | A8 首次派发（nominator）；**B16 生效**：nominator 按名单写出 `角色卡/env-bootstrap/{role-card.md,boundary.md,boundary.yaml}` 与 `角色卡/game-implementer/{role-card.md,boundary.md,boundary.yaml}`（6 文件）；随后 **A8 blocked**：`activate_role_documents` v2 取不到应用侧 SHA-256，0/2 `role.activated` | `tasks.jsonl`、`target/角色卡/**` |
| 02:35:51–02:40:09 | A8 第 2/3 次 bounded 重试：nominator 复核 6 文件均在位，但派发「必读（按序）」块仅含契约类路径 hash（docs/contracts/*.md），roster 与三份角色文档仅以「可选证据」纯路径呈现、无应用计算 SHA-256 ⇒ `activate_role_documents v2` 无法通过校验；nominator 拒绝猜测/自算/绕过，按「无新信息不重试」停止；convener 三次回报 blocked | `tasks.jsonl`、`rr12-facts.json` |
| 02:40:40.921 | 幕僚 `project.note`（共 11 条过程记录；A8 无新信息） | `tasks.jsonl` |
| 02:52:43.502 | 驱动 `stalled-no-progress-12min` 停止（最后账本进度 02:40:40.921） | `final-report.json` |
| 02:52:45 前后 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | |

**客户卡与派发实际**：客户消息 1 条；客户卡 **2**（intent-confirm 1 + proposal 1；均客户作答 confirm/accept；无重复）；真实任务 **18**（chief stage-request 9、convener→product/rapporteur/nominator 9；product 2、rapporteur 3、nominator 4）；`task.reported` 37；`task.closed` 13（accepted 9 + rework 3 + rejected 1）；Git 0；模型 settled：chief 32 / convener 25 / nominator 7 / product 4 / rapporteur 4。总墙钟约 **31.5 分钟**（02:21:14–02:52:43；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → fixed 注入 → A1 dispatched → A2/A3/A5/A6 completed（A3 客户 confirm、A6 单卡 accept）→ A4/A7 dispatched → **A8 建卡成功（B16；6 角色文件）但激活被应用侧 SHA-256 缺口阻塞（3 次重试，0/2 激活）** → 无新信息 → 12 分钟无进度 → 停止。A9/A10/A11/A12/归档/merge 未到达 | **fail**（A8 激活 hash 缺口） |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：started、A1 dispatched、A2/A3/A5/A6 completed、A4/A7 dispatched、A8 requested ×3 + dispatched ×3；**无 `role.activated`**；`basis/releases` 不存在；`.ans/project.json` fixed；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**无 shell-gate 审计**；无 `.git`；`角色卡/env-bootstrap` 与 `角色卡/game-implementer` 6 文件在位；客户卡 2（≤4） | **fail**（A8 激活未完成；链路未到 A9+） |
| **RR-05** 失败即停 | 无新信息后 12 分钟无进度，驱动 stall 停止；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 2（≤4）；真实任务 18（≤40；chief 9≤12、convener 9≤10、product 2≤3、rapporteur 3≤4、nominator 4≤4、verifier 0、实现写 0）；Git 0（≤12）；墙钟约 31.5 分钟（≤90） | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B16/B15.1/B15.2 实测）**：
1. **B16 生效**：A8 nominator 会话按最新 roster 获得角色草稿写权，成功写出 `角色卡/env-bootstrap/` 与 `角色卡/game-implementer/` 各 `role-card.md`/`boundary.md`/`boundary.yaml`（6 文件，实读在位）。
2. **B15.1 生效**：A5 accepted + 证据即完成（`stage.completed A5` 02:29:45.852）。
3. **B15.2 生效**：A6 仅 1 张方案卡（`req-8d0c490a9d053582`）客户 accept + `stage.completed A6`；无重复卡。
4. B13.1/B13.2/B14 持续有效：A2/A3 正常完成；无 `close-report-missing`；无 shell-gate 审计。

**失败链（A8 激活的应用侧 SHA-256 缺口）**：
1. nominator 报告（原文要点）：「两套角色三文件已按名单写好并经自检，但本会话无法取得应用侧 SHA-256，`activate_role_documents` v2 未通过校验，`role.activated` 未写入、无角色上线。」
2. convener 根因定位（原文要点）：「本次投递的『必读（按序）』块没有 `docs/proposals/snake-game-roster-v1.md` 的应用计算 sha256——我按幕僚要求把 roster 放入 requestedEvidence，应用只渲染为『可选证据』纯路径，未附 hash；而 dispatch 的『必读』机制只对契约类路径（`docs/contracts/*.md`）附 hash。」
3. 三次 bounded 重试均 blocked：nominator 不得猜测/自算/用其它来源冒充 hash（B9.1 纪律）；「无新信息不重试」后停止；0/2 `role.activated`；A9（团队计划+基线）与 A10（任命卡）无法推进；B15.3（A10 门禁）未行使。
4. 结论：**B9.1 观察项（A8 三文档 hash 应用侧提供方式）暴露为真实产品缺口**：应用需把 roster 与三份角色文档的应用计算 SHA-256 随派发提供（或由 `activate_role_documents` 服务侧计算），否则 A8 永远无法完成；测试侧未用 shell 算 hash、未绕过（符合协调方指令）。

---

## 五、预算实际 vs 批准（RR9–RR12 预算）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main） | **2**（intent-confirm 1 + proposal 1；均客户作答；无重复） |
| 真实任务 | ≤40（chief ≤12、convener ≤10、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤4） | **18**（chief 9、convener 9、product 2、rapporteur 3、nominator 4；verifier 0；实现写 0） |
| Git add/commit（目标项目） | ≤12 | **0** |
| 墙钟 | ≤90 分钟 | 约 **31.5 分钟**（02:21:14–02:52:43 UTC） |
| 模型轮次 | 单独如实报告 | settled：chief **32** / convener **25** / nominator **7** / product **4** / rapporteur **4**（均 completed）；原生 transcript：chief 199 assistant msgs / input **220,467** / output **149,440** / cache read **17,384,960**；convener 194 / **174,932** / **125,889** / **13,893,504**；nominator 130 / **240,866** / **176,226** / **9,165,056**；product 30 / **51,199** / **14,248** / **488,960**；rapporteur 79 / **142,881** / **63,654** / **3,051,904**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（40 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（stalled-no-progress-12min） | `40e5fa558080c979c7dee03440ff6df8621b0a624c85486b4672e0febda262f7` |
| `budget.json` | `661630763d859503eb53980b4ffd6fd4233f2a685d52d2d09b428971080bcd8d` |
| `drive.jsonl` | `71610cf86f824a9c249948808d206351ffd6682fbf6c99a5fac7f50f11fa93eb` |
| `tasks.jsonl`（18 任务/37 报告/13 收口） | `927176ca4d83033555ada4d71bd47396bb0536e05a056a0a5ade544f3ec7baa5` |
| `workflows.jsonl`（A2/A3/A5/A6 completed；A8 ×3；无 role.activated） | `871f74aea5721a33e1efe2f8a0625fc27dafee7df1b2c73f2093c56663aa5108` |
| `snake-game-intent-v1.md` | `2bf82f6981d470336b53311e0556ee687ba0dea5d9493d05b9ed3648803369cf` |
| `snake-game-proposal-v1.md` / `modules-v1` / `roster-v1` / `architecture-v1` | `2edc727b…` / `c16c17b0…` / `dbec78dd…` / `5e884934…` |
| `rolecard-env-bootstrap.md` / `-boundary.md` / `-boundary.yaml` | `0fd3681d…` / `de0a2a5e…` / `f70d5984…` |
| `rolecard-game-implementer.md` / `-boundary.md` / `-boundary.yaml` | `227f49ba…` / `88e31bd4…` / `6b3f22b3…` |
| `rr12-facts.json`（A8 hash 缺口/重试/role cards/legacy 零写） | `4e000f98…` |
| `root-cause-code-pointers.txt` | `0473b60d…` |
| `zero-touch.json`（十三旧根零触碰） | `ae098825…` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-nominator-transcript.jsonl` / `native-product-transcript.jsonl` / `native-rapporteur-transcript.jsonl` | `1fe3ea0e…` / `5b63052d…` / `d2572346…` / `f7a8992f…` / `cf90479d…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr12-2026-11-11\evidence\`；完整 SHA-256 清单以 `_evidence/sha256sums.txt` 为准（写盘实测）。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。
- **工作树并发披露**：RR12 启动时工作树干净（tracked 修改=0，HEAD d3bcd86）；运行期间/之后另一会话于 2026-11-11 10:52:59–10:53:31 +0800（02:52:59–02:53:31 UTC，即 RR12 停止后）在共享工作树写入未提交的 `src/common/编排/workflow-service.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`（B17 修复进行中）。RR12 的 Electron 在 02:21 启动时已加载 d3bcd86 版本（on-disk 修改不改变已加载进程），**RR12 判定基于 d3bcd86**；该未提交修改非本角色所写、未参与 RR12 运行。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（十三项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；**RR12 结果如实为未通过（A8 激活 hash 缺口，B9.1 观察项暴露）**；测试侧未用 shell 算 hash、未绕过激活（符合协调方指令）。
