# RR25 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B27 候选；A12a 写入被拒后 shell mkdir 触发审批门）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR25 = B27 修复后的真机全链复验，预算同 RR24 批准值）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `41edc95b06dac2ed9d3ce3148fd8cca0134ff361`（= B27「禁止 A11 worker 运行 shell 自测；任务文本只要求静态自检结论；worker 只写模块文件 + 字面 git add/commit」+ RR24 记录；含 B26/B25/B24/B23/B21/B20）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（`src app test` 干净）
- 授权：协调方 2026-11-11 RR25 批准（消息 1；卡 ≤4（3 确认 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR25 未通过（A12a 写入被拒后角色以 `cmd /c mkdir docs\acceptance` 触发 shell 审批卡 → `gate:shell-confirm-card`）**。本轮亮点：B24/B23/B20 继续生效（A3 立即收口、A9 无 shell 哈希、A8 4/4 激活、A10 四角色任命卡）；**B25 未确认**（convener 两次以不同 operationId 调 `complete_team_plan` 仍返回「结果未知或回执不完整」，尽管应用侧已记 A9+baseline，幕僚仍推进 A10）；**A12a 首派项目角色 qa-reviewer 无 modulePaths → 写 `docs/acceptance/` 被拒（交空集）**，重派虽带 `modulePaths=["docs/acceptance/"]`，但 worker 以 shell 建目录触发审批卡；**A11 未到达，B26/B27 未获行使**；无 git 提交（仅应用基线 `3645f80`）；A12b/A13/merge 未到达。**RR 不通过，不伪造通过**。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr25-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `41edc95`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR25；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰：RR24–RR1 与两旧贪吃蛇根共 **26/26 true**（所有脚本仅写入 RR25 运行根） |
| 驱动 | RR8 修正版 + decision 卡支持；预算常量：总 60、chief 18、convener 18、实现写 10 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 08:03:22.425 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 08:03:31.113 / 08:03:54.578 | `workflow.started wf-e3ffff5ed5085fb622102f62` + A1 requested / dispatched | `workflows.jsonl` |
| 08:04:11.969 / 08:04:52.713 | A2 requested / **completed**（B19 唤醒） | `workflows.jsonl` |
| 08:05:04.644–.123 | **A3 意图卡** `req-e800d8e026b72ab9`（「第 1/3 张卡」）客户 confirm；**`stage.completed A3` 立即写入**（B24） | `tasks.jsonl` |
| 08:05:10.725 / 08:05:21.624 | A4 requested / dispatched | `workflows.jsonl` |
| 08:05:36.616–08:08:26.658 | A5 requested（两次 delivery-rejected 重派）；**`stage.completed A5`** | `workflows.jsonl` |
| 08:08:48.656–.983 | **A6 方案卡** `req-0a0a5f493a32dcc6`（「第 2/3 张卡」）驱动作答 accept；**`stage.completed A6`** | `tasks.jsonl` |
| 08:08:55.674 / 08:09:10.001 | A7 requested / dispatched | `workflows.jsonl` |
| 08:09:25.551 / 08:09:34.337 | A8 requested / dispatched | `workflows.jsonl` |
| 08:10:39.419–08:10:45.557 | **B20 生效**：4/4 `role.activated`（game-core-dev、game-ui-dev、app-integrator、qa-reviewer）；**`stage.completed A8`** 08:10:45.567 | `workflows.jsonl` |
| 08:11:26.027–08:11:41.502 | A9 requested；**`stage.completed A9`**；`basis.recorded bas-c61a063a4d305eb4f96aaa3e`；无 shell 卡（B23） | `workflows.jsonl`、`basis.jsonl` |
| 08:12:20.967 / 08:12:33.329 | convener 两次报 A9「部分完成/无法确认」；第二次以新 operationId `ctp-snake-game-team-v1-2` 重试 `complete_team_plan` 仍返回「结果未知或回执不完整」——**B25 未确认**（应用侧已记 A9+baseline） | `tasks.jsonl`、`diagnostics` |
| 08:12:58.925–08:13:01.266 | **A10 任命卡** `req-4ecc752ebf01c5d9`（「第 3/3 张卡」，4 角色）客户全选；**`stage.completed A10`**（幕僚仍推进） | `tasks.jsonl` |
| 08:13:11.438 / 08:14:27.631 | A12a 首派（qa-reviewer，**无 modulePaths**）/ 重派（`moduleId=acceptance-record`，`modulePaths=["docs/acceptance/"]`） | `tasks.jsonl` |
| 08:14:20.880 | qa-reviewer 报 blocked：写 `docs/acceptance/snake-game-criteria-v1.md` 被拒（「冻结模块/当前授权交集为空」） | `tasks.jsonl` |
| **08:14:42.396** | **shell 审批卡**：「shell 命令请求」，命令 `cmd /c mkdir docs\acceptance`；驱动 `gate.detected shell-confirm-card` | `drive.jsonl` |
| 08:14:43.437 | shell 审计：`conclusion:"deny"`、`execution:"未执行"`（`run_shell`，qa-reviewer） | `target/docs/audit/shell-gate.jsonl` |
| 08:14:4x | 驱动按授权停止并落盘；Electron 关闭 | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **3**（intent-confirm / proposal / appointment，均标注 1/3–3/3；均客户/驱动作答；decision 0；无 merge-main）；真实任务 **17**（chief 10、convener 7；按接收：convener 8、product 2、rapporteur 3、nominator 2、qa-reviewer 2）；实现写任务 0；Git 实现提交 0；总墙钟约 **11.3 分钟**（08:03:22–08:14:43；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1–A10 完成（B24/B23/B20 生效；A10 任命卡）；**B25 未确认（convener 两次回执未知）**；**A12a 首派空写授权被拒、重派后 worker 以 shell mkdir 触发审批卡**；A11 未到达（B26/B27 未行使）；无 git 提交；A12b/A13/merge 未到达 | **fail（A12a shell 审批门）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：A1–A10 completed（A8 4×role.activated）；A12a requested/dispatched×2（未完成）；`basis` recorded；**无 `.ans/trunk`/`.ans/runs`/stable-write**；shell 审计 2 行（只读 git status 允许 + `mkdir` 被拒未执行）；目标 git 仅应用基线 `3645f80`；无 tag/remote/push；客户卡 3（≤4） | **fail**（A12a 未完成；A11 未到） |
| **RR-05** 失败即停 | shell 审批卡出现后立即停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 3（≤4；decision 0≤2）；真实任务 17（≤60；chief 10≤18、convener 7≤18；product 2≤3、rapporteur 3≤4、nominator 2≤4、qa-reviewer 2；实现写 0≤10）；Git 实现 0；墙钟约 11.3 分钟（≤90） | **within budget** |

**结论**：AC-30 不成立（A12a shell 审批门）；最终判定权属独立验收（B2）。

---

## 四、关键事实与根因（只读定位；未改任何代码）

**正向**：
1. **B24 生效**：A3 意图卡入口校验后呈现，客户 confirm 后 `stage.completed A3` 立即写入（08:05:05.123）。
2. **B23 生效**：A9 完成并记录 `bas-c61a063a4d305eb4f96aaa3e`；无 shell 哈希卡；shell 审计仅只读 git 与一条被拒 mkdir。
3. **B16/B20**：A8 4/4 激活（game-core-dev、game-ui-dev、app-integrator、qa-reviewer）；A10 任命卡（第 3/3 张）客户全选；A3/A6/A10 三卡标注 1/3–3/3，顺序清晰。
4. B19/B18：A2 唤醒、A5 重派正常。

**问题 1（B25 未确认）**：convener 在 08:12:20 与 08:12:33 两次报告 A9 部分/无法确认；第二次以新 `operationId=ctp-snake-game-team-v1-2` 重试 `complete_team_plan` 仍返回「结果未知或回执不完整」（与 `ctp-snake-game-team-v1-1` 相同），无成功回执/错误码；`project_state` 的 versions 无团队计划/基线登记。**应用侧已记录 `stage.completed A9`+baseline**，且幕僚随后推进 A10（固定推进未受阻），但 B25 的工具层回执接受在本轮仍未兑现，convener 任务以 blocked 收口。需按本轮 payload 复核固定成功回执的 shape/identity（plan/documents/replay/stageCompleted）。

**问题 2（A12a 写授权与 shell 回退，本次 stopCause）**：
1. 08:13:11 首派 A12a（`t-mwbudi8e-c72d3daf`，chief→project 角色 qa-reviewer，**无 modulePaths**）→ 写 `docs/acceptance/snake-game-criteria-v1.md` 被拒（冻结模块/当前授权交集为空；非模块 fixed 任务无 modulePaths 时 B26 派生为空）。
2. 08:14:27 重派（`t-mwbuf50v-441aca90`，`moduleId=acceptance-record`、`modulePaths=["docs/acceptance/"]`）——结构化写集已在任务上；但 worker 在 08:14:43 以 `run_shell` 执行 **`cmd /c mkdir docs\acceptance`**（推测为建目录/回退绕过写门），shell 审计 `deny`、未执行，应用弹「shell 命令请求」审批卡；驱动按授权「额外门失败即停」停止。**第二次任务的写入是否可行未被验证**（shell 卡先出现）。
3. 根因：fixed A12a 任务（非模块任务）默认写授权为空；派发应显式携带写作用域（如 `modulePaths=["docs/acceptance/"]`）或派给内置 verifier（RR23/RR24 中可行）；同时 fixed 验收/实现任务应禁止 shell 回退（mkdir/node 等），并让 `write_file` 能创建父目录或由应用预建目录，避免角色以 shell 建目录。

**修复方向（下一缺陷候选组）**：① 复核 B25 固定 `complete_team_plan` 成功回执的匹配（本轮仍 unknown）；② A12a 派发统一携带写作用域或改用内置 verifier；③ 全面禁止 fixed 验收/实现任务的 shell（mkdir/node/npm 等），`write_file` 支持创建父目录或应用预建 `docs/acceptance/`；④ 修复后重跑以行使 A11 模块写入（B26）与无 shell 自检（B27）、git add/commit、A12b/A13/merge-main。

---

## 五、预算实际 vs 批准（RR25）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **3**（intent-confirm / proposal / appointment；decision 0；无 merge-main） |
| 真实任务 | ≤60（chief ≤18、convener ≤18、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤10） | **17**（chief 10、convener 7；接收：convener 8、product 2、rapporteur 3、nominator 2、qa-reviewer 2；实现写 0） |
| Git add/commit | ≤12 | 实现 **0**；应用自建基线 **1**（`3645f80`） |
| 墙钟 | ≤90 分钟 | 约 **11.3 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **23**（23 completed）· convener **18** · product **4** · rapporteur **4** · nominator **2** · qa-reviewer **2**（1/1 aborted，被 halt）；native transcript：chief 135 msgs / in **178,182** / out **70,021** / cache read **8,339,200**；convener 185 / **175,951** / **109,251** / **12,357,376**；nominator 61 / **172,443** / **92,225** / **2,218,624**；rapporteur 58 / **132,461** / **65,476** / **2,148,480**；qa-reviewer 44 / **56,009** / **28,712** / **930,432**；product 30 / **49,125** / **14,192** / **472,064**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 59 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:shell-confirm-card） | `8b9383ca8a814bf05e4300d45d5131e9f8710286ce944e542437e9e4575c44eb` |
| `budget.json` | `3f448d295287f061b3194f728f5e4b9dc76926351dab58b945c67e48c1cfdebc` |
| `drive.jsonl` | `995f61bf3022e3cded556b43a0699fa90f6454fa0092e1d70175eec98a181683` |
| `tasks.jsonl`（17 任务） | `5a0b9fd06ca8cda740fdfdb1d90e2f6bf9351adbb9ae4e1b4f4274179f496c78` |
| `workflows.jsonl`（A1–A10 + A12a） | `09922d2efe7e5c49a1d8e5bef9e70b8dc974eb3f487833e5a053f8f34446565b` |
| `rr25-facts.json` | `ae82e5ea995d41cf5a168861462471ec3837b4b86e7c458694011cf2f5d6de9d` |
| `root-cause-code-pointers.txt` | `cc0810619dc1add4427b5a20aade9c0e05aa8068e9a35f14a4abb350557b03b0` |
| `zero-touch.json`（26 旧根全 true） | `db42e970b6a8744ec4d14ce36b16ea281f6d1f807ea03b8105810cdb09c831c7` |
| `usage-extract.json` | `f1dee9f6e310babae31fd4ac67739ca6f910e02f9abcf703365723b62bd051b8` |
| `shell-gate.jsonl`（2 行：只读 git + 被拒 mkdir） | `2a16ac0880a153d3fd850f102dcb274d9fa23b1167435276c434993bfb7af7f1` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-qa-reviewer-transcript.jsonl` | `4f683ffe…` / `ca53160c…` / `58251a0a…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr25-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。qa-reviewer 1 个 settled 为 `aborted`：驱动 stopSession/halt 终止在办回合。本轮无人工介入；无 tester-side 旧根触碰（26/26 零触碰）。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过 shell 审批卡（按授权失败即停）；本轮所有脚本仅写入 RR25 运行根。
- **RR25 结果如实为未通过（A12a 写授权空 + shell mkdir 审批门），不按通过处理；B25 未确认、B26/B27 未行使。**
