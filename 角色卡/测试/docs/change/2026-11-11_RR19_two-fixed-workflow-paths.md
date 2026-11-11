# RR19 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B21+B22 候选；A9 shell 审批门停止）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR19 = B21/B22 + decision 驱动支持，按 RR19 批准预算）
- 候选：协调方指定 `e1c3c8b`；**实际 HEAD `2a0d33bf90b20a7b822766ed42c1f7ccdd9d9cc5` = `e1c3c8b` + RR17 记录提交（仅 docs/test 角色记录）**；`git diff e1c3c8b..HEAD -- src app test` 为空，产品代码与候选一致。工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR19 批准（消息 1；卡 ≤4（3 确认 + merge-main；decision ≤2 单独计数）；真实任务 ≤60：chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8；Git ≤12；≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR19 未通过（额外门 shell 审批）——A1–A8 全链完成（B16/B18/B19/B20 再次生效；A8 1/1 激活）；A9（团队计划+基线+git init）中，convener 于 05:08:49.161 以 `run_shell` 执行 `certutil -hashfile docs/proposals/snake-game-roster-v1.md SHA256`，应用弹出 shell 审批卡（「命令审批 · 运营」），审计为 policy deny 且**未执行**；驱动按授权「shell 审批等额外门失败即停」停止**。A10/A11/A12/A13/merge 未到达；目标无 Git、无团队计划、无基线。**RR 不通过，不伪造通过**。产品侧缺陷方向：A9 语境需由应用提供名单哈希/版本引用，convener 不得用 shell 算 hash（RR4/B9.1 类问题再现）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr19-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `2a0d33b`）；一次启动成功 |
| userData | 独立 `userData\` |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR19；运行期采样：9222=0、9223=0 监听） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（native transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd`，费用不估算 |
| 既有运行根 | 零触碰核对：RR17–RR1 与两旧贪吃蛇根共 **19/20 true**；**RR18 根的 `rr/` 子目录 mtime 被本角色自己改动**（在该目录 `sed -i` 修改驱动生成脚本，非应用触碰；见第七节披露） |
| 驱动 | RR8 修正版 + decision 卡支持（本轮 decision 0 张，未行使）；RR19 预算常量：总 60、chief 18、convener 14、实现写 8 |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 05:01:22.997 | **唯一客户消息**发送 | `drive.jsonl`、`customer-message.txt` |
| 05:01:30.806 | `workflow.started wf-a91ecce1829b8ee8e87a65ed` + `stage.requested A1` | `workflows.jsonl` |
| 05:02:26.935 | `stage.dispatched A1` | `workflows.jsonl` |
| 05:02:51.721 / 05:03:33.717 | A2 requested / **completed**（B19 唤醒） | `workflows.jsonl` |
| 05:03:49.639–.991 | **A3 意图卡** `req-b0d663d1200a8ca3` 客户 confirm；**`stage.completed A3`** | `tasks.jsonl` |
| 05:03:53.817 / 05:04:00.641 | A4 requested / dispatched | `workflows.jsonl` |
| 05:04:13.566–05:06:00.104 | A5 requested；两次 delivery-rejected；重派后 **`stage.completed A5`** | `workflows.jsonl`、`tasks.jsonl` |
| 05:06:17.392–.722 | **A6 方案卡** `req-b780426ca59c058c` 客户 accept；**`stage.completed A6`** | `tasks.jsonl` |
| 05:06:23.606 / 05:06:30.251 | A7 requested / dispatched | `workflows.jsonl` |
| 05:07:19.593 / 05:07:32.781 | A8 requested / dispatched；nominator 写 `角色卡/snake-game-dev` 三文件（B16） | `workflows.jsonl` |
| 05:07:48.470–.475 | **B20 生效**：`role.activated` snake-game-dev（1/1）；**`stage.completed A8`** | `workflows.jsonl` |
| 05:08:00.722 | **A9 requested**（团队计划 + 基线 3 件小事；task `t-mwbnrd5e-b65187f8`） | `workflows.jsonl`、`tasks.jsonl` |
| 05:08:48.114 | **shell 审批卡**：「命令审批 · 运营」，命令 `certutil -hashfile docs/proposals/snake-game-roster-v1.md SHA256`；驱动 `gate.detected shell-confirm-card` | `drive.jsonl` |
| 05:08:49.161 | 审计：`conclusion:"deny"`（ruleset:default（su 审批档）→ operator:51054），`execution:"未执行"`，`entry:"run_shell"`，`roleId:"convener"` | `target/docs/audit/shell-gate.jsonl` |
| 05:08:5x | 驱动按授权停止并落盘；Electron 关闭 | `final-report.json` |

**客户卡与派发实际**：客户消息 1 条；客户卡 **2**（intent-confirm / proposal；均客户作答；appointment/merge-main/decision 未到/未发）；真实任务 **15**（chief 8、convener 7；按接收：convener 8、product 2、rapporteur 3、nominator 2）；Git 0（目标无 `.git`）；总墙钟约 **7.4 分钟**（05:01:22–05:08:49；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target；独立 userData；仅 9224；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | A1–A8 全部完成（B16/B18/B19/B20；A8 1/1 激活）；**A9 中 convener 以 run_shell certutil 计算名单 hash，触发 shell 审批卡；驱动按授权失败即停**；A9 未完成（无团队计划/基线/git init）；A10–A13/merge 未到达 | **fail（额外门 shell 审批）** |
| **RR-03** 发布合并 | 未执行 | **not executed** |
| **RR-04** 账本/审计检查 | `workflows.jsonl`：A1–A8 completed、A8 role.activated；`basis/releases` 不存在；**无 `.ans/trunk`/`.ans/runs`/stable-write**；**shell-gate 审计 1 行**（certutil 尝试：deny、未执行）；无 `.git`；`角色卡/snake-game-dev` 三文件在位；客户卡 2（≤4） | **fail**（链路未达 A9+） |
| **RR-05** 失败即停 | shell 审批门触发后立即停止，保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 消息 1（=1）；卡 2（≤4；decision 0≤2）；真实任务 15（≤60；chief 8≤18、convener 7≤14；product 2≤3、rapporteur 3≤4、nominator 2≤4；实现写 0≤8）；Git 0（≤12）；墙钟约 7.4 分钟（≤90） | **within budget** |

**结论**：AC-30 不成立（失败于 shell 审批额外门）；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读定位；未改任何代码）

**正向（A1–A8）**：
1. **B19 生效**：A2 completed → 幕僚唤醒 → A3 意图卡客户 confirm → A3 completed。
2. **B18/B13/B14 持续有效**：A5 两次 delivery-rejected 后重派完成；无 close-report-missing。
3. **B16/B20 生效**：A8 名单角色 `snake-game-dev` 三文件落盘；path-only 激活成功（`role.activated` 1/1）；A8 completed。
4. A6 方案卡客户 accept；A7 dispatched。

**失败链（A9 shell 审批）**：
1. 05:08:00.722 A9 stage-request（团队计划 + 基线 3 件小事；任务文本包含固定 argv 的 `git init` 等固定动作）。
2. 05:08:49.161 convener 以 `run_shell` 尝试 `certutil -hashfile docs/proposals/snake-game-roster-v1.md SHA256`（为团队计划/基线引用计算名单 hash）。
3. 应用 shell 门禁弹出「命令审批 · 运营」卡；审计：`conclusion:"deny"`（`ruleset:default（su 审批档） → operator:51054`），`execution:"未执行"`。
4. 驱动按 RR 授权「额外门（shell 审批等）失败即停」停止；A9 未完成：无 `docs/scheduling/snake-game-team-v1.md`、无 `basis.recorded`、无 `git init`（目标无 `.git`）；A10 任命卡未呈现；A11–A13/merge 不可达。

**根因（产品/角色行为）**：fixed 语境下 convener 不应以 shell 计算 hash（RR4/B9.1 类问题）；A9 需要的名单/版本 hash 应由应用从 `versions.jsonl`/`documentRefs` 提供（或明确禁止并提供替代），否则 convener 再次尝试 certutil。应用 shell 门禁本身工作正常（deny、未执行），但审批卡一出现即破坏固定路径（按协议失败即停）。**修复方向（下一缺陷候选）**：在 A9 stage-request 上下文/派发回执中由应用提供名单与模块的 sha256/版本引用，并强化 fixed convener 指令：不得 run_shell 计算/核验 hash；必要时让应用预置团队计划所需的哈希字段。

---

## 五、预算实际 vs 批准（RR19）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（3 确认 + merge-main；decision ≤2） | **2**（intent-confirm / proposal；decision **0**；shell 审批卡为额外门，非客户确认卡） |
| 真实任务 | ≤60（chief ≤18、convener ≤14、product ≤3、rapporteur ≤4、nominator ≤4、verifier ≤4、实现写 ≤8） | **15**（chief 8、convener 7；接收：convener 8、product 2、rapporteur 3、nominator 2；实现写 0） |
| Git add/commit | ≤12 | **0**（目标无 `.git`，A9 基线未执行） |
| 墙钟 | ≤90 分钟 | 约 **7.4 分钟** |
| 模型轮次 | 单独如实报告 | settled：chief **23**（23 completed）· convener **18**（17/1 aborted）· nominator **4** · product **4** · rapporteur **3**；native transcript：chief 100 msgs / in **110,634** / out **33,820** / cache read **4,969,728**；convener 173 / **161,626** / **96,162** / **10,121,472**；nominator 61 / **165,667** / **49,615** / **2,261,888**；product 38 / **57,077** / **15,885** / **640,896**；rapporteur 51 / **110,762** / **37,706** / **1,583,872**；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`，共 50 文件）

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json`（gate:shell-confirm-card） | `19064f80e0876490ec58e9b41790a209e28a625b1c3d9fa87526c3696c2064af` |
| `budget.json` | `f8d9dd7f9e8ec48be8d820e8e74699c4f814bf4e4b97be8efe0d5a448255af3b` |
| `drive.jsonl` | `c533475313f247122ff5ecce68cc2d06ce1342c84552412525160cc7a0c7375b` |
| `tasks.jsonl`（15 任务） | `7092d7bb7b0e4f76951338f73ef1c18eac1e65c20d0613a5e57de5c9b525c3b0` |
| `workflows.jsonl`（A1–A9；1 role.activated） | `25f2907455e97f02f0ca1c799b443e2d08f7ed8eeb1926f9a13bc5721096a3df` |
| `rr19-facts.json` | `c88b9954f2435b919a6f818ae80f19aecbd8b74b8136bb40841721310265e44a` |
| `root-cause-code-pointers.txt` | `0a4710bd1bdd8405a86041b8b013f64caa6e89dbe730e1fe924bf0f6a1b476d5` |
| `zero-touch.json`（19/20 true；RR18 rr/ 系本角色脚本修改所致 false） | `0ccc9572acfc6060a9f0953caf9e1b208fc0a4458fc62b30bf71adc4b19053cb` |
| `shell-gate.jsonl`（certutil 尝试：deny、未执行） | `37f1ec6baf45858fa1361f17ccbc819bb0a7102e333be39b60a10fbd31a5ac4a` |
| `usage-extract.json` | `913b69eeb30057c8dbdb1b364dabe55b185e387fa24440fc5589ad3fadfa1c99` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` / `native-nominator-transcript.jsonl` | `6e23e7a5…` / `65d7aa98…` / `3de09cf5…` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr19-2026-11-11\evidence\`；完整清单以 `_evidence/sha256sums.txt` 为准。

**披露**：驱动 `finalize()` 的 `Browser.close` 后同前出现 Node unsettled top-level await（退出码 13）；证据在关窗前已写盘。convener 1 个 settled 为 `aborted`：驱动停止时 halt/stopSession 终止在办回合。

---

## 七、纪律声明与披露

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未追加客户消息、未绕过 shell 审批卡（按授权失败即停）。
- **披露（tester-side 触碰）**：RR19 运行前/间，本角色对 RR18 运行根 `rr/` 内已有脚本执行 `sed -i` 修改（为修正证据组装脚本），使 RR18 根 `rr/` 目录 mtime 变化（应用未触碰；其余 19 个既有根零触碰）。此后不再向旧运行根写文件。
- **RR19 结果如实为未通过（A9 shell 审批额外门），不按通过处理**。
