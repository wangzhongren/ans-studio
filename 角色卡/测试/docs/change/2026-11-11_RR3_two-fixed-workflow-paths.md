# RR3 真机全链验证记录：两条固定工作流路径（T3，2026-11-11，B7.1 候选）

- 角色：ANS「测试」（独立固定上下文；本文件与 `_evidence/` 由任务精确范围授权写入）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3；RR3 = B7.1/B7.2 修复后的真机全链复验）
- 候选：分支 `feat/two-fixed-workflow-paths`，HEAD `cdd3d52e4eabd33bfe496654b351b7b1d11de9b2`（`fix(workflow): B7.1 fixed-session fail-closed dispatch/contract and B7.2 fixtures`）；工作树 = `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 授权：协调方 2026-11-11 RR3 授权（预算同前：消息 1、卡 ≤4、派发 ≤20、Git add/commit ≤12、≤90 分钟；失败即停、不重试/不追加）
- 结论：**RR3 失败（RR-02 fail）**。**B6.1+B7.1 的幕僚侧修复实测生效**：空项目幕僚聊天 fixed 注入、首个完整 stage-request 被受理、`ensureFixedPathStarted` 写 `workflowSchema`、`workflow.started` 启动、**无 `.ans/trunk`/`.ans/runs` 写入**。新失败点：**应用自动打开的运营（convener）会话为 legacy 注入**（`contract_check` 显示 `run：legacy（未冻结）`、无 fixed context），导致其 9 次生产派发尝试全部被 B7.1 fixed fail-closed 拒绝（缺 `workflowId`，且它无法获知 workflowId）；随后运营走 legacy `request_stable_write`，弹出 **stable-write「workflow · docs/workflow.md」客户卡**（fixed 路径禁止的旧机制/额外客户门）→ 驱动立即停止。**RR 未通过，不伪造通过**；路径 B 未执行。
- 未合并/未发布：未提交/推送/合并/发布 ans-studio `main`；未打 tag；未发布产物；未修改产品/测试/角色卡/边界/其它文档（仅本记录 + `_evidence/` + 仓库外运行根）。

---

## 一、环境与隔离（RR-01：pass）

| 项 | 实测 |
| --- | --- |
| 运行根（仓库外） | `C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr3-2026-11-11\`（`target\`、`userData\`、`evidence\`、`rr\`） |
| 目标项目 | `target\` 全新空目录：导入前 0 条目、非 Git、无 `.ans`（`evidence/pre/pre-state.json`） |
| Electron | 真实 Electron 44.7.0；launcher 先 `app.setPath("userData", …)` 再 import 当前工作树 `app/main.ts`（HEAD `cdd3d52`） |
| userData | 独立 `userData\`（首启无 judge/decision 偏好） |
| 渲染 | 真实生产入口 `app/renderer/dist/index.html` |
| 远程调试端口 | **9224**（仅本 RR3）；运行期采样：9222=0、9223=0 监听，9224=1（`final-report.json::ports`） |
| 模型 | 真实模型 **`deepseek-v4-flash`**（原生 transcript 实测）；provider 凭据由应用自身加载 `.env`，**未读取/未打印 `.env`**；无 `cost_usd` 字段，费用不估算 |
| 既有运行根 | 零触碰：RR2 根、RR1 根、`ans-snake-fullchain-run-2026-11-10`、`ans-game2d-snake-2026-11-09` 顶层条目 mtime 运行前后一致（`_evidence/zero-touch.json`：四项均 `true`） |

---

## 二、执行时间线（UTC；本地 = UTC+8）

| 时刻（UTC） | 事件 | 证据 |
| --- | --- | --- |
| 19:04:54 | 导入 `target\`；角色清单 6 内置（trio）；打开幕僚会话；**`chief.workflow.v2.loaded`（B6.1 fixed 注入生效）** | diagnostics、`rr3-facts.json` |
| 19:04:55.6 | **唯一客户消息**发送（`做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）`） | `customer-message.txt` |
| 19:05:06.5208 | **幕僚首个完整 stage-request 被受理**：应用原子写 `.ans/project.json` = `{"workflowSchema":"two-fixed-paths/v1"}`（`ensureFixedPathStarted` 生效） | `target-project.json` |
| 19:05:06.527 | `workflow.started`（`wf-29094488e596b0d154ff40a4`，path A，trigger by chief）+ `stage.requested A1` | `workflows.jsonl`、`rr3-facts.json` |
| 19:05:06.533 | `task.created` chief→convener（`taskKind:"stage-request"`、`stage:"A1"`；无 runId） | `tasks.jsonl` |
| 19:05:06.536–.547 | 诊断 `session.open.stale-listing-refreshed`（convener）→ 自动打开运营会话 | diagnostics |
| 19:05:06.5+ | **运营会话为 legacy 注入**：`contract_check` 输出 `run：legacy（未冻结）｜flow snake-game`、legacy `taskKind dispatch 必填：flowId；targetRoleId；runId(pinned)…`；`project_state` 输出 `run=none status=legacy`；原生 prompt **无** convener fixed 上下文标题「生产线唯一派发者」 | `convener-legacy-views.json`、`rr3-facts.json` |
| 19:05:06–19:07:32 | 运营 9 次 `dispatch_task` 生产派发尝试**全部失败**（replay 记录 6 个 tool_call/6 个 denied；原生 transcript 提取 9 个 tool_use，均 error）：`stage-request-required`（缺 workflowId）、`stage-request-invalid`、`workflow-not-found`（尝试自造 workflowId）、`self-dispatch` 等；**未创建任何生产任务** | `convener-dispatch-attempts.json` |
| 19:07:32.377 | 运营走 **legacy stable-write**：`stable.write.requested`（`sw-1`，`docs/workflow.md`，`stable-write/v1`） | `stable-writes.json`、`tasks.jsonl` |
| 19:07:32.391–.401 | **客户卡 `request.created` `sw-card-sw-1`（cardKind=`stable-write`，标题「workflow · docs/workflow.md」，选项 approve/reject）** 呈现 | `tasks.jsonl`、`ui-card-01-pre.jpeg` |
| 19:07:32.8 | 驱动 gate `unexpected-card-kind`（stable-write 不在 fixed 允许卡种）→ 立即停止，不代答 | `gate.detected`、`ui-90-gate.jpeg` |
| 19:07:33.859 | `request.orphaned`（停会话后该卡未决/作废） | `tasks.jsonl` |
| 19:07:35 | 证据落盘；Electron 退出（9224 仅 TIME_WAIT，进程 0） | final-report.json |

**客户卡与派发实际**：客户消息 1 条；UI 卡片 **1**（legacy stable-write；固定的 3 卡与 merge-main 均未出现）；**真实任务 1**（chief→convener stage-request）；运营 9 次生产派发尝试全部被拒（不建任务）；`Git` 0；模型 settled 2 条且均 `outcome:"aborted"`（chief 1 / convener 1）。总墙钟约 **2.7 分钟**（19:04:54–19:07:35；预算 90 分钟，未超）。

---

## 三、RR-01…RR-06 判定（本角色实测）

| 编号 | 实测 | 判定 |
| --- | --- | --- |
| **RR-01** 隔离实例 | 全新空 target（0 条目、非 Git、无 `.ans`）；独立 userData；仅 9224（9222/9223 运行期 0 监听）；真实 Electron + 真实模型 + 真实 UI | **pass** |
| **RR-02** 空项目→贪吃蛇全链 | 导入 → 幕僚 fixed 注入 → 客户消息 1 条 → **首个完整 stage-request 受理（B7.1 生效）**：`workflowSchema` 写入、`workflow.started`、A1 stage-request 任务、无 trunk/run 写 → **运营会话 legacy 注入**（见 §四）→ 9 次生产派发被 B7.1 fail-closed 拒绝 → 运营改走 legacy stable-write 并弹稳定写卡 → 立即停止。A2/意图/3 卡/A10/A11/A12/归档/合并均未到达 | **fail**（A1 卡死） |
| **RR-03** 发布合并 | 未执行（未到 A12/A13；无 merge-main 卡、无 `release.merged`） | **not executed** |
| **RR-04** 账本/审计检查 | 固定账本：`workflows.jsonl` 有 `workflow.started`+`stage.requested A1`；`basis.jsonl`/`releases.jsonl` **不存在**；`.ans/project.json` 存在（fixed）；`.ans/trunk`/`.ans/runs` **未写**（B7.1 生效的正向证据）；但 **`.ans/state/stable-writes.json` 被写**（legacy 机制）、**1 张 legacy stable-write 客户卡**（额外客户门，fixed 允许卡 0/4）；无 `.git`/`.gitignore`/`docs/audit/shell-gate.jsonl`；无 judge 参与 | **fail**（legacy 机制触达 + 额外客户门） |
| **RR-05** 失败即停 | 首个 non-allowlist 卡（stable-write）出现即停止；未代答/未重试/未追加消息；保留现场/账本/回放 | **pass** |
| **RR-06** 预算 | 见 §五：消息 1（=1）、卡 1（≤4，但为 legacy 稳定写卡）、真实任务 1（≤20；chief 1≤8、convener 真实 0≤4）、Git 0（≤12）、墙钟约 2.7 分钟（≤90）；9 次被拒派发尝试不计任务 | **within budget** |

**结论**：AC-30（RR-01…RR-06 全部通过）**不成立**；最终判定权属独立验收（B2）。

---

## 四、失败事实与根因（只读代码定位；未改任何代码）

**正向（B7.1 已验证生效）**：幕僚 fixed 聊天 + 首个完整 stage-request（`flowId/workflowPath:"A"/stage:"A1"/workflowAction:"advance"/taskKind:"stage-request"/roleId:"convener"`）⇒ `ensureFixedPathStarted` 写 `workflowSchema`、`workflow.started wf-29094488…`、A1 stage-request 任务；**无 `.ans/trunk`/`.ans/runs`**；B7.1 fail-closed 对运营的非法派发形状（无 workflowId、错 taskKind、自派）**正确地拒绝且未创建任务/未写 trunk/run**。

**失败链（应用会话模式不一致 + workflowId 绑定缺口）**：

1. **运营会话被 aut-open 为 legacy**：`app/desktop/session.ts:3628-3636` 的会话模式先看 `this.deps.getListing(req.projectRoot)?.governanceModel ?? "single"`；`sessionWorkflowModeForChat` 只在 listing 判定 trio 时才生效。时间线上 `.ans/project.json` 写于 19:05:06.5208，运营会话 open 于 19:05:06.538（仅 18ms 后），期间诊断出现 `session.open.stale-listing-refreshed`（project.json 写盘触发的 listing 失效/刷新）。**疑似该窗口内 `getListing` 未就绪 ⇒ `?? "single"` ⇒ 会话模式 legacy**，导致无 fixed context、legacy `contract_check`/`project_state` 口径。实测证据：`run：legacy（未冻结）`（4 处）、无「生产线唯一派发者」fixed 段。
2. **B7.1 fixed 校验依赖 `workflowId`，而运营无法获知**：`session.ts:8846-8890` 对 fixed 项目的非 stage-request 派发要求 `workflowId` 非空 + `stage`。运营的任务文本（幕僚首请求随调用生成，早于 workflowId 生成）**不含 workflowId**（`tasks.jsonl` 的 A1 任务文本实测无 `wf-`）；运营的 legacy contract_check 不显示 workflow；`.ans/` 对角色禁写/禁读。⇒ 运营的合法生产派发无路可走（9 次尝试全拒）。
3. **legacy 回退**：运营转而调用 legacy `request_stable_write`（`sw-1`，`docs/workflow.md`），应用接受并呈现 **stable-write 客户卡**——fixed 默认路径禁止的旧机制与额外客户门（AC-23/RR-04）。
4. **测试覆盖缺口**：B7.1/B7.2 单测与全链夹具均在 listing 已就绪/显式传 `workflowId` 的前提下运行（`fixed-path-full-chain.test.ts` 的 convener 派发带 `workflowId: WF`），未覆盖「首次 fixed 启动后 18ms 内 aut-open 运营会话（listing 失效窗口）」及「运营无 workflowId 可用的真实任务文本」。修复方向（产品/协调方决定）：会话模式解析不得依赖可失效的 listing 缓存（或在 delivery aut-open 时直接按项目 fixed 状态解析）；生产派发绑定应由应用按受派 open stage-request 自动填充/核验 workflowId，而非要求模型自报。

---

## 五、预算实际 vs 批准

| 项 | 批准 | 实际 |
| --- | --- | --- |
| 客户消息 | 1 | **1** |
| 客户卡 | ≤4（意图/方案/任命 + merge-main） | **1**（legacy stable-write 卡；固定 3 卡与 merge-main **0**） |
| 派发 | ≤20（幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4） | **真实任务 1**（chief→convener stage-request；chief=1、convener 真实=0、实现写=0）；运营 9 次被拒尝试不建任务 |
| Git add/commit（目标项目） | ≤12 | **0**（未创建 Git 仓库/未提交） |
| 墙钟 | ≤90 分钟 | 约 **2.7 分钟**（19:04:54–19:07:35 UTC） |
| 模型轮次 | 单独如实报告 | settled 事件 2（chief 1 / convener 1），**均 `outcome:"aborted"`**；原生 transcript：chief **10** assistant messages / input **63,584** / output **4,178** / cache read **258,048** tokens；convener **42** assistant messages / input **86,504** / output **59,872** / cache read **1,353,856** tokens；模型 `deepseek-v4-flash` |
| 费用 | 单独如实报告 | 无 `cost_usd` 字段：费用不可得，不估算、不伪造；未读取 `.env` |

---

## 六、证据（实测 hash；文件在 `_evidence/`）

`sha256sums.txt` 为清单（28 文件）；关键：

| 文件 | SHA-256 |
| --- | --- |
| `final-report.json` | `353b93a9e62892a03969e9394236ac65782f88d82a4a36e996ab2409104dc7b8` |
| `budget.json` | `cda3323ee1dbf415212536480d830a1e4cfbf84662e34c41cb6ca799c07c0d77` |
| `drive.jsonl` | `442a32868d8d3199179b536fd002a742a88cfc8f9a2695573c88ff37d208aa75` |
| `tasks.jsonl` | `64be5942cd7b301bfa740000b023cb31c694c701e8acc2990d5ae2b3ed3c9ef2` |
| `workflows.jsonl`（workflow.started + A1） | `fb307efd8663aa3632e03469bf41aa4c86f55b7fd14ee13e96070cb10c0093c8` |
| `stable-writes.json`（legacy stable-write） | `d087a5b88b6ee9427c9bf351a3b4f783bb8f74db96206480f12a5cc083325e4e` |
| `target-project.json`（fixed 启动写回） | `e5b6da4d880c68d231da950b2da8d5f7066a14bfafe0a255b9b5f4098bf5de54` |
| `convener-dispatch-attempts.json`（9 次被拒派发原文） | `1f501e6ba2a21e4b98caff42f2aa1a3ec0343327f04ab183261c1a2253266cb8` |
| `convener-legacy-views.json`（legacy contract_check/project_state 原文） | `27e6b9697724bc22be17ad2d610aea7c16794eba7067be5935dec9db434f29ec` |
| `rr3-facts.json`（v2 注入/账本/legacy 写盘/convener legacy 证据） | `68e039141ae03abb79b38e992bd3cf8e548699e51ae7bc9fc22703308099b3eb` |
| `zero-touch.json`（四旧根零触碰） | `f10b74989c0badf37aff5ded03e3d8a661ce03eed0e5f8ee4c57af9a8a598ce9` |
| `native-chief-transcript.jsonl` / `native-convener-transcript.jsonl` | `8cec6ce7…` / `bfe7faea…` |
| `ui-card-01-pre.jpeg`（stable-write 卡截图） | `ea26bba5a7f02026c2d930650c048e089a279097d2ef56a925284069e1a31b5a` |
| `ui-90-gate.jpeg` | `b01055bdd3def1ba74f94f448f011108ea2352252fb4ab2a75c62c4cf764e01b` |

运行根原件保留：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr3-2026-11-11\evidence\`。

**披露**：驱动在 `finalize()` 的 `Browser.close` 后再次出现 Node unsettled top-level await（退出码 13）；证据（final-report/budget/drive/账本）在关窗前已写盘，内容完整。stable-write 卡由驱动按「非 fixed 允许卡种」gate **未代答**；停会话后应用将其记为 `request.orphaned`。

---

## 七、纪律声明

- 未修改产品/测试/角色卡/边界/其它文档；未提交/推送/合并/发布 ans-studio `main`；未打 tag、未发布产物。
- 未占用 9222/9223；未读取/打印 `.env`；未触碰既有运行根/目标（四项零触碰已核）。
- 未重试、未追加客户消息、未调用模型工具、未伪造回执/判定；RR3 结果如实为 **失败**（RR-02；A1 卡死 + legacy stable-write 额外门）。修复方向需产品/协调方决定，不在本角色范围。
