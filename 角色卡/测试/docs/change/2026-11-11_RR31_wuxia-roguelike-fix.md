# RR31 真机验证记录：修改路径（Path B）修复《江湖夜雨》运行期崩溃（2026-11-11）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务：修改路径（Path B）真机验证——客户报告 RR30 合并产物不可玩（点「踏入江湖」后每帧 `TypeError: Cannot read properties of undefined (reading 'pressed')`），要求用应用自身的修改流程把游戏修到可玩；合并后做真实浏览器逐项可玩性验证（纳入同一记录）
- 应用候选/基线：分支 `feat/two-fixed-workflow-paths`，HEAD `fefdfcccc0ab2038ac020b949f112fbb573eda76`（= 应用代码与 RR30 候选 `e75f81c` 相同，仅多 RR30 记录提交；src/app/test 干净）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 目标项目（复用 RR30 运行根 target，main 已合并 `8724c076b05104dcfb8e34e0f1fe55dd36302424`）：`C:\Users\51054\Desktop\work\ans-wuxia-roguelike-rr30-2026-11-11\target`
- 运行根（仓库外）：`C:\Users\51054\Desktop\work\ans-wuxia-roguelike-rr30-2026-11-11\`（新增 `rr31/`、`evidence-rr31/`、`userData-rr31/`；RR30 的 `evidence/`、`rr/`、`play-evidence/`、`play-profile/`、`userData/` 零触碰）
- 客户消息（唯一，经真实 UI 发送，只报症状不告根因）：「打开游戏点「踏入江湖」开始后马上崩溃：浏览器控制台每帧报 Uncaught TypeError: Cannot read properties of undefined (reading 'pressed')，游戏完全无法进行；请修复到可玩（移动/自动攻击/波次/经验升级/拾取/死亡重开都要正常）。」
- 环境：真实 Electron 44.7.0（隔离 `userData-rr31`）+ 真实模型（native 记录 `deepseek-v4-1-flash-261017`）+ 真实生产 UI；CDP 9224 仅本轮（9222/9223 运行期 0 监听）；浏览器 CDP 9333 本轮未使用（未启动浏览器）；不读/未打印 `.env`
- 预算（本轮批准）：客户消息 1；客户卡 ≤2（merge-main 必卡；decision ≤2 单独计数）；真实任务 ≤30；Git ≤6；≤60 分钟；失败即停、不重试不追加

**结论：RR31 未通过（fail-stop：shell 审批卡门）——应用正确进入修改路径（Path B），B1 影响面分析成功且根因与 RR30 完全一致；但 B2 范围决定无法被应用记录（`change.scope-decided` 缺失），B3 派发与 B3 stage-request 均被应用拒绝，路径 B 在 B2 卡死；随后幕僚越界读取应用源码并执行 shell，触发固定路径卡预算外的 shell 审批卡「命令审批 · 幕僚」，驱动按 gate 早停（`gate:shell-confirm-card`）。修复未实现（target 0 提交）、未合并（target main 仍 `8724c07`）、游戏仍不可玩（RR-03 仍 fail，未进行合并后浏览器验证——前置未发生）。未伪造通过。**

---

## 一、安全/编辑纪律

- 未修改产品代码/测试/角色卡/边界/其它文档；本记录与 `_evidence/` 为唯一仓库写入。target 内实现代码零改动（`git status` 空、0 新提交）；应用自身仅在 target 内写治理文档（B1 影响面报告、运营 schedule 记录——ans 托管区，符合其角色写权）。
- 未合 ans-studio `main`、未打 tag、未发布产物；target `main` 未合并（仍 `8724c07`）。
- 端口：Electron 仅 9224（运行期 9222/9223 0 监听）；浏览器 9333 未启动；未读/打印 `.env`。
- 旧运行根零触碰：**31/31** 旧运行根 + **6/6** RR30 未复用目录（详见第七节披露 D1：驱动内建比较形状 bug 已更正）。
- RR30 记录与证据已按指示先行提交到当前分支：提交 `fefdfcc`（`docs(test): RR30 wuxia run passes the pipeline but ships an unplayable game`；记录 sha256 `f78c6da89e9d2829691383eaa7025acff05b7243943a4e63bb70dc4ac4b2fd54`，工作树无 RR30 遗留）。

---

## 二、RR31 时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 15:20:33.038 | Electron CDP 页面就绪（ANS 治理会话工作台）；导入 target；角色 15/15；打开 chief 会话 | `drive.jsonl` |
| **15:20:40.274** | **唯一客户消息**发送（compose mark；发送日志 15:20:41.877） | `drive.jsonl`、`customer-message.txt` |
| 15:21:26.469 | **`workflow.started wf-739312023202ee992b7c8955`（flowId=wuxia-roguelike，path B）** + `stage.requested B1`（`t-mwc9o8n9-2e908938`） | `ledgers/workflows.jsonl`、`drive.jsonl` |
| 15:21:53.244–.250 | `basis.recorded bas-4d15ae3e0ee11e60f507cbc7`（reason `path-b`，既有仓库不 init）+ `basis.verified` | `ledgers/basis.jsonl` |
| 15:21:53.251 | B1 生产任务 `t-mwc9otb7-a48fa319` → loop-engine（moduleId `loop-app`、`game/app/`，只读影响面分析） | `ledgers/tasks.jsonl` |
| 15:22:43.642 / 15:22:59.250 | 运营 B1 stage-request 报告 done / 幕僚 `close_created_task` accepted | `ledgers/tasks.jsonl` |
| 15:23:19.777–15:23:28.418 | loop-engine 只读报告 done；**`stage.completed B1`**（证据含 app.js `35211a89…`、input.js `b38d0012…` 等应用计算 hash）；运营收口 accepted | `ledgers/workflows.jsonl`、`ledgers/tasks.jsonl` |
| 15:23:49.022–.023 | **B2 stage-request 第 1 次**（`t-mwc9ran2-3ef95043`，chief→convener；正文含 scope 决定并要求推进 B3） | `ledgers/workflows.jsonl`、`ledgers/tasks.jsonl` |
| 15:24:03.364 | 运营尝试按任务派 B3 修复任务 → **被应用拒绝**：`b-change-scope-invalid：B3 写集来源缺失：B2 change.scope-decided 不存在（不派发）` | `sessions/convener.jsonl` |
| 15:24:30.187 | 运营如实回报 **blocked**（未改代码、未提交、未重试） | `ledgers/tasks.jsonl` |
| 15:27:00.808 | 幕僚将 B2 任务以 **rework** 收口，重发 B2 范围决定 | `ledgers/tasks.jsonl` |
| 15:27:39.956–.957 | **B2 stage-request 第 2 次**（`t-mwc9w8tw-db1175f3`，attempt 2；改为只受理、不派生产任务） | `ledgers/workflows.jsonl`、`ledgers/tasks.jsonl` |
| 15:28:12.116 / 15:28:18.514 | 运营受理 done / 幕僚 accepted（note 写明「等待应用记录 change.scope-decided 后发 B3 stage-request」） | `ledgers/tasks.jsonl` |
| 15:28:32.752 | 幕僚直接发 **B3 advance stage-request** → **被应用拒绝**：`stage-transition-invalid：B2 范围决定未记录：B2 范围决定非法：当前 B2(requested)（要求 B1 已完成且 B2 未完成）。（B3 请求未受理）` | `sessions/chief.jsonl` |
| 15:28:39.895 | 幕僚开始用 `read_file` 读取应用源码（`C:/Users/51054/Desktop/work/ans-studio/src/pipeline/orchestration/run-role.ts`） | `sessions/chief.jsonl` |
| 15:28:53–15:29:34 | 幕僚连续执行 **13 条 `findstr`**（检索 ans-studio worktree 源码中 `change.scope-decided` / `recordChangeScopeDecision` / scope 通道）；shell 门**全部自动放行**（只读） | `ledgers/shell-gate.jsonl`、`shell-commands-rr31.txt` |
| 15:29:40.100–.107 | 幕僚执行 `powershell -NoProfile -Command "Get-ChildItem '...\trunk-amendment' -Name"` → shell 门 **deny（c-deny）** → **shell 审批卡「命令审批 · 幕僚」呈交（requestId sc-1）** | `ledgers/shell-gate.jsonl`、`diagnostics-rr31-trimmed.jsonl`、`ui-90-gate.jpeg` |
| **15:29:40.172** | **驱动检测到 shell 审批卡 → `gate:shell-confirm-card` → 早停**（不作答、不重试） | `drive.jsonl`、`final-report.json` |
| 15:29:40.201–.205 | 卡片随 halt 取消（`shell-confirm.cancelled`）；幕僚回合 `ffeddc5e-…` 中止（outcome `aborted`） | `diagnostics-rr31-trimmed.jsonl`、`sessions/chief.jsonl` |
| 15:29:42.442 | 驱动写 `final-report.json`、关闭 Electron；CDP 9224 释放 | `final-report.json`、`electron-out.log` |

**关键事实**：RR31 的 workflow 账本只有 5 条事件（started、B1 requested/completed、B2 requested ×2）；**没有 `change.scope-decided`、没有 `stage.reworked`、没有 B2 completed、没有 B3/B4、没有 release/merge**。target `main` 仍 `8724c07`，任务分支 `ans/task/wf-739312023202ee992b7c8955` 停在同一提交，工作树干净，0 新提交。

---

## 三、预算实际 vs 批准（RR31）

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤2（merge-main 必卡；decision ≤2 单独计数） | **0（merge-main 未到达；流程在 B2 早停）**；decision 0；**另有 shell 审批卡 1 张（固定路径卡预算外的客户门，未作答，随 halt 取消）** |
| 真实任务 | ≤30 | **4**（`task.created`：chief→convener 3 条 stage-request + convener→loop-engine 1 条 B1 只读分析；实现写任务 0） |
| Git add/commit | ≤6 | **2**（target 0 新提交；我的提交：RR30 记录先行提交 `fefdfcc` + 本 RR31 记录/证据提交 1 次） |
| 墙钟 | ≤60 分钟 | 约 **9 分钟**（15:20:33 驱动就绪–15:29:42 finalize；客户消息 15:20:40–gate 15:29:40 为 8 分 59.9 秒） |
| 模型轮次 | 单独如实报告 | settled：chief **7** · convener **4** · loop-engine **1**；模型 `deepseek-v4-1-flash-261017`；无 `cost_usd`，费用不估算 |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 四、修改路径（Path B）事实与接缝

### 4.1 路径判定与 B1（成功）

- 幕僚按真实缺口判定为**修改**：`workflow.started` 记录 `path:"B"`（`trigger.by:"chief"`），首请求 `stage:"B1"`（`workflowPath` 字段未在账本行保留，path 由 started 事件定档）。
- 运营派 loop-engine（roster 模块 `loop-app`，写区 `game/app/`）做**只读影响面分析**；产出 `docs/scheduling/wuxia-roguelike-b1-impact-v1.md`（7,086 bytes，sha256 `609b1fcbade8ca1b12254be23f0dfea47a6a804026a00f2bfd877acae14677b9`），根因与 RR30 真机验证完全一致：
  - `game/app/app.js` `pollFrameInput()` 首行 `var pressed = engine.input.wasPressed;` 把原型方法解引用为裸函数后调用 `pressed('escape')`；`game/engine/input.js` 为 `'use strict'`，`wasPressed` 访问 `this.pressed` ⇒ `this=undefined` ⇒ 每帧 TypeError；
  - 每帧固定步骤在所有状态都经过 `pollFrameInput()` ⇒ 每帧必抛，跳过 `stepWorld/render/updateUi/endFrame`；
  - 同类风险仅 `buildContext()` 的 `on: bus.on, off: bus.off` 解引用；`engine.endFrame()→input.endFrame()`、`player.update(dt, engine.input)` 等为安全方法调用；
  - 最小修复建议：改回方法调用（或 bind）+ 同批包装 ctx.on/off；**范围仅 `game/app/app.js`**。
- B1 阶段完成时应用写入了 `stage.completed B1` 及证据 hash（app.js `35211a89…`、input.js `b38d0012…`、engine.js `5e472fbb…`、player.js `21638a54…`、bus.js `181a2c09…`），运营收口 accepted——**B1 步骤成功**。

### 4.2 B2 范围决定接缝（失败点）

**应用设计（代码事实）**：B2 `change.scope-decided` 没有给幕僚的直写工具；应用在**受理 B3 advance stage-request 之前**自动记录：

- `app/desktop/session.ts:10403–10413`：当 `requestedAction === "advance" && d.stage === "B3"` 时调用 `recordFixedPathBScopeDecisionForDispatch(...)`，失败则拒绝 B3 请求；
- `app/desktop/workflow.ts:588–683`：该入口要求视图窗口 **`view.stage === "B1" && B1 completed && (B2 pending || failed)`**，从 B1 生产任务的 done 报告 evidence 中取影响面报告并重算 hash，按 roster 属主派生写集，然后写 `change.scope-decided`（`decidedBy:"chief"`）；
- `src/common/编排/workflow-state.ts:263–279`：`change.scope-decided` 只能完成 B2，且要求上述窗口；
- `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md:118` 只写「B2：你发范围决定（change.scope-decided：…）」——**没有说明该事件实际由应用在 B3 advance stage-request 受理时自动记录，也没有可直写该事件的工具**（`src/provider/runtime/schema.ts` 无 change-scope 工具；幕僚 findstr 亦未找到）。

**实际发生（真机事实）**：

1. 幕僚按资源文字先发 **B2 stage-request**（第 1 次，`t-mwc9ran2-3ef95043`）：应用**受理**了 B2 stage-request（`stage.requested B2`，`requestTaskId` 绑定），视图进入 **B2(requested)**；任务正文要求运营「按此范围推进 B3：派修复任务（stage=B3…）」。
2. 运营在真实受派回合派 B3 修复任务 → 应用拒绝：`b-change-scope-invalid：B3 写集来源缺失：B2 change.scope-decided 不存在（不派发）`（15:24:03.364）；运营如实回报 blocked（15:24:30.187）。
3. 幕僚 rework 后发 **B2 stage-request 第 2 次**（`t-mwc9w8tw-db1175f3`）：应用再次受理（`stage.requested B2` attempt 2）；任务改为「只受理、不派生产任务，B3 由幕僚随后另发 stage-request」；运营受理 done、幕僚 accepted。
4. 幕僚直发 **B3 advance stage-request** → 应用拒绝：`stage-transition-invalid：B2 范围决定未记录：B2 范围决定非法：当前 B2(requested)（要求 B1 已完成且 B2 未完成）。（B3 请求未受理）`（15:28:32.752）。
5. 此后无任何路径可推进：**B2 自动记录窗口已被 B2 stage-request 关闭**；应用没有直写 `change.scope-decided` 的工具；工作流状态机虽定义了 `B2→B1` 的 rework 回落（`WORKFLOW_REWORK_FALLBACKS`），但资源未提示、幕僚未采用，应用也未给出可执行提示。至早停时 `change.scope-decided` 仍不存在。

**接缝判定**：固定路径 B 的 **B2 记录契约与 chief 工作流资源不一致**——资源要求幕僚「发范围决定」，但应用只在「B3 advance stage-request（且视图仍在 B1 completed + B2 pending）」时隐式记录；应用又允许 B2 stage-request 被受理并进入 `B2(requested)`，造成**不可恢复死状态**（除非幕僚自行猜出 B2→B1 rework 再重试）。该接缝使修改路径在 B1 之后无法继续，属应用侧路由/资源口径缺陷（非 worker 实现错误）。

### 4.3 shell 越界与 shell 审批卡（早停门）

- B3 两次被拒后，幕僚用 `read_file` 读取应用源码（`C:/Users/51054/Desktop/work/ans-studio/src/pipeline/orchestration/run-role.ts`），随后连续执行 **13 条 `findstr`**（检索 `src/`、`src/provider/runtime/schema.ts`、`run-role.ts`、`out/` 等，均引用 **target 之外的 ans-studio worktree 绝对路径**）；shell 门对只读命令**全部自动放行**（`decision:"allow"`）。
- 15:29:40.100 幕僚执行 `powershell -NoProfile -Command "Get-ChildItem 'C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment' -Name"` → shell 门 **deny（reasonCode c-deny）** → 15:29:40.107 `shell.operator.requested` + `shell-confirm.presented`（requestId `sc-1`，标题「命令审批 · 幕僚」）。
- 固定路径的客户门预算为「意图/方案/任命 + merge-main」；**shell 审批卡是预算外的额外客户门**（RR24/RR25 同类失败已确立为任务/行为缺陷）。驱动检测到 `.sc-overlay` 可见即 `detectGate({kind:"shell-confirm-card"})` 并 fail-stop；**未作答**。halt 于 15:29:40.201 取消该卡，幕僚回合中止（aborted）。
- 旁证：幕僚在 15:29:40.100 的推理中已得出「应用 B2 记录未接线（缺陷）」结论——该结论基于对 `src/` 的检索，而真正的调用点在 `app/desktop/session.ts`（`src` 之外），但其「B2 记录通道对幕僚不可见」的观察与本接缝一致。

---

## 五、游戏与 RR-03 状态

- **修复未发生**：target `main` 与任务分支均停在 `8724c076b05104dcfb8e34e0f1fe55dd36302424`，0 新提交，工作树干净（`fix/merge-diff.patch` 为空、`git status` 空）。
- **RR-03 仍 fail（未变化）**：被游玩产物仍是 RR30 的合并产物（`index.html` `396c5330…`、`game/app/app.js` `35211a89…`、`game/engine/input.js` `b38d0012…`），RR30 记录（sha256 `f78c6da8…`）中的真实浏览器逐项结果继续适用：菜单渲染 pass；开始后每帧 TypeError（41,586 次未捕获异常），移动/自动攻击/波次/经验升级/拾取/死亡重开均 fail/不可验证。
- **未进行合并后浏览器验证**：本轮未发生 merge，按任务口径「合并后必须做真实浏览器可玩性验证」的前置不成立；未启动 Edge/Chrome（CDP 9333 未使用），不伪造任何可玩性结果。

---

## 六、应用实际走了哪条路径（对照预期）

| 预期步骤 | 实际 | 结果 |
| --- | --- | --- |
| 幕僚判定为修改 → 路径 B | `workflow.started path:"B"`（15:21:26） | **符合** |
| 运营派专业角色只读影响面分析 | convener→loop-engine（loop-app，game/app/，read-only）产出 B1 报告（hash 由应用计算） | **符合**；B1 accepted |
| 幕僚定修改范围（change.scope-decided） | 幕僚两次发 B2 stage-request；应用未记录 `change.scope-decided`；B3 生产派发被拒 `b-change-scope-invalid`；B3 stage-request 被拒 `stage-transition-invalid` | **不符合（应用接缝）** |
| 运营派实现角色修复并提交 | 未发生（B3 从未开始；0 实现写任务、0 提交） | 未到达 |
| （如有）独立验收 | 未发生（路径 B 按设计不要求 A12b；B4 前置需 B3 accepted） | 未到达 |
| 交付/合并 main（客户卡作答） | 未发生（无 release、无 merge-main 卡） | 未到达 |
| A13/B4 交付说明等待 | 未发生 | 未到达 |

**应用没有错误启动新增路径**（未出现 A1/A3/A6/A10 等新增路径卡或 A 路径事件）；失败发生在修改路径内部的 B2→B3 记录契约。

---

## 七、披露（诚实性）

1. **D1 驱动 zero-touch 比较形状 bug（tester-side）**：`drive-rr31.mjs` 的 `collectEvidence()` 对旧运行根用「pre 顶层快照 vs post 递归快照」比较，形状不匹配导致 `final-report.json` 的 `zeroTouch.roots` 全为 false（假阴性）。已用同一 pre-state 基线按同形状重算：**31/31 旧运行根 + 6/6 RR30 未复用目录均零触碰**，见 `zero-touch-corrected.json`；原始 pre/post 快照均保留。
2. **D2 驱动退出码 13（机械）**：finalize 中 `Browser.close` 后 Node 顶层 await 未 settle，驱动以 exit 13 结束（`driver-console.log` 有 `unsettled top-level await ... drive-rr31.mjs:732`）；证据在关闭前已写盘（与 RR17–RR30 同一已知机械问题）。
3. **D3 无人工/代理作答任何卡**：客户卡 0；shell 审批卡由驱动 halt 取消（呈卡后约 0.1 秒），无任何 approve/deny 由人或测试代答；幕僚回合随 halt 中止。
4. **D4 未重试、未追加**：客户消息 1 条；B3/B2 的重复动作均来自应用/模型自身（2 次 B2 stage-request、1 次 B2 rework），驱动未注入、未重发、未改账本。
5. **D5 幕僚越界读取应用源码**：`read_file` 与 13 条 `findstr` 读取了 target 之外的 ans-studio worktree 源码，只读命令被 shell 门自动放行；这是本轮观察到的边界/门禁事实，已留原始命令与账本（`shell-commands-rr31.txt`、`ledgers/shell-gate.jsonl`）。
6. **D6 运营行为**：convener 在 B1 核对时执行过 `git status`（只读、自动放行）；B2 失败时如实回报 blocked，未改代码、未提交、未重试同一派发；其 schedule §6.20/§6.21 记录随证据归档。
7. **D7 旧 LLM 记录**：本记录时间均为 UTC；本地时间 = UTC+8（2026-11-11 23:20–23:30）。
8. **D8 RR30 记录提交**：`fefdfcc` 已含 RR30 记录与 _evidence（只 add 了我的文件），本轮未重复提交。

---

## 八、判定、建议与遗留

**判定：RR31 未通过（fail-stop）**。应用正确进入修改路径并完成 B1 影响面分析（根因正确、报告与证据齐全），但 B2 范围决定的应用记录通道与 chief 资源口径不一致，导致 B2 `change.scope-decided` 无法落账、B3 无法开始；随后幕僚越界执行 shell 触发预算外 shell 审批卡，驱动按 gate 早停。修复未实现、未合并、游戏仍不可玩。

**建议（供协调方/应用 owner，不在本角色范围实施）**：

1. **B2 记录通道**：要么在受理 B2 stage-request 时由应用按同一规则记录 `change.scope-decided`（候选路径/影响面 hash/属主派生一致），要么**拒绝 B2 stage-request** 并明确提示「请直接发 B3 advance stage-request（含 requestedEvidence 候选路径），应用将自动记录 B2」；并同步修正 `chief-workflow-v2.md` §路径 B 的 B2 表述（当前只说「你发范围决定」，未说明隐式通道）。
2. **死状态恢复**：若已进入 `B2(requested)` 且无 scope 记录，应用应给出可执行的 rework B2→B1 提示（状态机已有 `WORKFLOW_REWORK_FALLBACKS`），或允许 B3 advance 在 B2 requested 下补记 scope；避免模型自行猜通道。
3. **shell/边界**：固定路径应避免由幕僚产生 shell 审批卡；至少明确「B2 卡死时不得读应用源码/跑 shell」的处置（如实上报停止），并复核只读 `findstr` 跨出 target 的自动放行策略。
4. **RR-03**：以上修复后重跑 RR31（同 target、同客户消息）；B3 修复落地并 merge 后，再做真实浏览器逐项可玩性验证（移动/自动攻击/波次/经验升级/拾取/死亡重开/控制台 0 error），全过才判 RR-03 通过。

**遗留**：`8724c07` 产物仍不可玩（RR30 缺陷未修）；B2 记录接缝未修；本轮记录/证据未 push、未合 ans-studio main；旧运行根零触碰；浏览器未启动。

---

## 九、关键哈希（SHA-256）

- 本记录：见 `record-file.json`（写盘后计算）
- B1 影响面报告：`609b1fcbade8ca1b12254be23f0dfea47a6a804026a00f2bfd877acae14677b9`（7,086 bytes）
- `final-report.json`：`46c0e3178c54fe60336e4bc78fa8dd63e77c5e64de92117c3b28ddd91f40aa46`
- `drive.jsonl`：`09347f9f0138f38f7525c8cb482685fa30c03ba529f2418f6d4ed771d6fa6774`
- `budget.json`：`9077d3a6a5c781ae2f1531d55f09fdccb9c4558f497ca178ccc16b65726aba6c`
- `pre/pre-state.json`：`0dc69d847ef1315c61c453dacdf12a9e67946296a9165ba5f81a2d754473b174`
- `ledgers/workflows.jsonl`：`8cf349482b195f65c391c17c8e70f704628dd2e2d15bbd405ecaaac0e6ff8abe`
- `ledgers/tasks.jsonl`：`378fa98ac2bee60d0ccd2fb1a8bb8bfa11195539231d1e58fafe78b1aeda64c0`
- `ledgers/basis.jsonl`：`7c8b74a8854389a55ef9a0f3428d3b373f52041846d80bc47cd38f71e78f0c86`
- `ledgers/releases.jsonl`：`9c4eedd83b60251a7fbdfd6807b92bb5ac2348e5958ad051572179b616bc8c53`
- `ledgers/shell-gate.jsonl`：`d766f617a5490794695b6224d875b5da4b64bf93994de85e0e3c482af30e2112`
- `shell-commands-rr31.txt`：`d0ec3a59ca9b31826673c1089e6eae1575b20c95e0e6cce4ed8be20eb15ad7d7`
- `zero-touch-corrected.json`：`a3d1cddc7dc13fb29ecb0f4e6f4d2c269b8a9e437567bc009dfdbf8e8d9e94b7`
- `sessions/chief.jsonl`：`1a614353e2c5fccfb32b6fd7f052bf7716a9bea58599434b971f5b65b28ad1ad`
- `sessions/convener.jsonl`：`e0398d73425e131aaa0446671d64c4cda0f250758cf7309735d22d15cc9bf7c1`
- `sessions/loop-engine.jsonl`：`2c6406b648610e3f5320edf0cd1660824bbd5bed80fd931c7c2bcd11ee986ee1`
- `screens/ui-90-gate.jpeg`：`da209c61b086a1ffbfbb5b6a0610d193555700883d3c83794a25c59febf4816e`
- 完整清单：`_evidence/sha256sums.txt`
