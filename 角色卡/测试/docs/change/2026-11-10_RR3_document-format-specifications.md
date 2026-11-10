# 真实运行记录 RR3（协调方授权第三轮）：每个文档格式的权威说明与全员可读（T2）——真实 Electron + 真实模型 + 真实 UI（隔离 9223；2026-11-10）

- 角色：ANS 测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 轮次：**RR3 第三轮**。依据协调方 2026-11-10 书面授权（消息要点：「协调方已授权 **RR3 第三轮**（新预算，按 B1；非重试/不追加）」；收敛方案：复制合法非贪吃蛇项目、**重置** `.ans/state/tasks.jsonl` 为空并保留原账本、文档准备任务**不带** moduleId/modulePaths/moduleDirectory、产品写 intent v4、`prepareIntentConfirmation`、intent-confirm 卡 ≤1（客户确认）、6 内置 + 项目角色注册、项目角色直连 ≤1（不可行按 B1 RR-7 回落））。
- 日期：2026-11-10（本地 01:07–01:16 +0800；UTC 2026-11-09 17:07:29–17:15:56）。
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/document-format-specifications`；HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad…`）。
- 运行根（仓库外）：`C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\round3\`：`target\`、`userData\`、`scripts\`、`evidence\`。
- 隔离：CDP **仅 9223**；**9222 全程 0 LISTENING**；**贪吃蛇运行根与 snake target 全程零触碰/零读取**（仅 netstat/tasklist）；9223 结束后释放、无 Electron 残留。
- 纪律：未修改仓库产品/测试/角色卡/其它文档（只写本记录与 `2026-11-10_RR3_document-format-specifications-evidence/`）；未提交/推送/合并/发布；未发第 2 条客户消息；未运行 judge/提案卡等其它变更。

## 0. 结论摘要（先读；全部为事实陈述）

1. **派发成功**：1 条客户消息（17:07:41.959Z）→ 幕僚真实回合 → **`dispatch_task` 仅 `roleId=product` + 任务文本（无任何 moduleId/modulePaths/moduleDirectory）**（17:07:52.373Z），应用受理并投递成功：`task.created t-mw9ileu9-53e94663`（17:07:52.545Z）、`task.delivered`、product `session.open.ready` 17:07:52.690Z、`delivery.start` 17:07:52.712Z；工具回执「任务已派发给「product」…受理≠已完成」。
2. **产品真实读取 `doc_format`**：product 真实回合（`deepseek-v4-flash`）于 **17:07:54.494Z** 调用 `mcp__ans__doc_format`，入参 **`{"format":"project-intent/v1"}`**，回执 **2,162 B**，首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`，含字段表/样例/错误码；产品 `doc_format` 共 **1 次（≤3，期望 1）**。
3. **产品写 `docs/product/jinyong-rogue-2d-intent-v4.md`（新版本，不改 v1–v3）**：最终 **25,686 bytes / SHA-256 `905870be547eb5f0691c3af0bbc833a2eec601ae0d31832b40627ad0467c5b95`**；frontmatter `schema: project-intent/v1`、`flowId: jinyong-rogue-2d`、`version: 4`、`intentId: jinyong-rogue-2d` 齐备。**如实披露：不是字面「一次写对」**——产品使用 **1 次 `write_file` + 5 次 `edit_file`** 内容修订（非 schema 拒绝/重试；frontmatter 首次写入即正确）；最终字节由意图卡绑定并冻结。
4. **`prepareIntentConfirmation` 通过**：意图卡 `req-e8320c4bdb8e5b4e`（`cardKind:"intent-confirm"`）17:14:33.880Z 创建、17:14:33.891Z 呈现；卡内 marker 原文 **`[ans-intent-evidence snapshot=s-intent-e54bdbf924bce76ba549e86f7d7704b1adc43269206501b0896794b35055ce00 path=docs/product/jinyong-rogue-2d-intent-v4.md sha256=905870be… version=4]`**；17:14:34.391Z 客户选择 `confirm`（`by:"customer"`）；`intent.confirmation.freeze-start` 17:14:34.410Z → **`freeze-committed` 17:14:34.429Z**。**意图卡 1 张（≤1）**，正常呈现并确认；无 schema 拒绝。
5. **全员可读（注册层）**：项目导入后真实枚举 **14 角色**（6 内置 + 8 项目角色）；**6 个内置角色会话均真实 `openSession`**（6 条 `session.open.ready`，17:07:41.552–17:07:41.802Z）；**项目角色 `test-dev` 会话亦真实打开**（`session.open.ready` 17:13:52.179Z）。产品会话真实回合 `prompt_snapshot` 15,526 B / `1a1c0740…` 含 `doc_format` promptGuidelines；幕僚会话 `prompt_snapshot` 58,145 B / `5eda2ded…` 同含 guidelines。
6. **项目角色真实读取：按 B1 RR-7 回落（未做真实模型调用）**。操作者直连项目角色会话被应用拒绝：`window.desktop.sendSession` 目标 `test-dev` 返回 **`ok:false / error:"向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。"`**（`operator-project-role-send.json`）；composer 对项目角色亦为 disabled（提示「操作者确认超时（>120000ms），未获放行——可让角色重新发起。」）。因此项目角色证据降级为「**会话注册（session.open.ready）+ 数据源可调用（D1/W5 确定性覆盖 + 源码无条件注入）**」，**如实标注「未做项目角色真实模型调用」**；不得把注册写成真实读取。
7. **偏差（如实）**：产品在本回合 **3 次调用 `run_shell`**（`certutil`/`powershell Get-FileHash`/`sha256sum` 取哈希），违反客户消息「不使用 run_shell」；三次均**未执行**（1 次操作者拒绝、2 次审核超时 120000ms）；期间出现 **1 张 shell 审批卡**（`命令审批 · 产品`，硬拒类 deny），已作为**审批卡**记录并拒绝，未执行任何命令。产品因此未能取得 sha256，并在报告中如实说明「不提供、不编造哈希值」；应用在意图卡中绑定了真实字节 hash（`905870be…`）。
8. **预算**：客户消息 **1/1**；意图确认卡 **1/1**；shell 审批卡 **1 张（另 2 次审核超时；审批卡≠客户决策卡）**；操作者直连项目角色**已送达消息 0/≤1**（应用不支持，见 §6.4）；产品 `doc_format` **1/≤3**；项目角色 `doc_format` **0/≤1**（回落）；模型回合 chief **3** 完成、product **1** 完成、test-dev **0**；墙钟 **≈8 分 27 秒/≤20 分钟**；首果即停；0 客户消息重试。
9. **候选/manifest 稳定**：运行前后 11 文件聚合 **`bcd3255392…`**、manifest 1,113 文件聚合 **`fc296e95…`** 逐字节相同；HEAD/tree/分支不变；`git status --porcelain` 全文前后相同。
10. **隔离/零触碰**：9222 预检/后检 0 LISTENING；9223 预检空闲、后检仅 TIME_WAIT、无 Electron 残留；**未读写贪吃蛇运行根与 `ans-game2d-snake-2026-11-09`（含 target）任何文件**。
11. **模型披露**：真实模型调用（无桩），`.env` 与原生 `message.model` 均为 **`deepseek-v4-flash`**（`https://aiproxy2.abujlb.com/deepseek`）——**非 Anthropic Claude，不宣称 Claude**。

## 1. 依据与绑定（写盘前实测）

| 项 | 实测 |
| --- | --- |
| **RR3 授权** | 协调方 2026-11-10 消息：新预算第三轮；收敛方案见 §0 头部 |
| **RR1（绑定）** | `角色卡/测试/docs/change/2026-11-10_RR_document-format-specifications.md`：**27,708 bytes / 179 行 / `7e95ea07c6284935836ee5be9e72ddec512559b63b34426ed56030be524dfa42`** |
| **RR2（绑定）** | `角色卡/测试/docs/change/2026-11-10_RR2_document-format-specifications.md`：**23,751 bytes / 169 行 / `7bde21e8b237e306116bd350254370210b23b4e53ff450be8409976c4f99368e`** |
| D1 v1.1（绑定） | `角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md`：42,274 bytes / 228 行 / `adc23f45f56f8cd16251e41756f9fce1b56430fadbf10b6add6e2cef3aec090f` |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`：69,121 bytes / 483 行 / `bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe` |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`：15,475 bytes / 102 行 / `4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2` |
| 派发记录 | `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`：7,762 bytes / 56 行 / `afce6546723ee0c8ace5eda2b8941ca7369c626acd9eb95efece30300dee0c8f` |
| 方案 P1.2 | `docs/planning/2026-11-09_design_document-format-specifications.md`：146,555 bytes / 980 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54` |
| 复核 R1.1 | `docs/planning/2026-11-09_review_document-format-specifications.md`：82,067 bytes / 500 行 / `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05` |

## 2. 候选身份与稳定性（`pre/`、`post/`）

- 候选 **11 文件**（5 M + 6 新），与 D1/RR1/RR2 同一集合；聚合运行前 = 运行后 = **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**；manifest 1,113 文件 / 25,907,278 bytes，聚合运行前 = 运行后 = **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**；逐文件 hash 与清单文本前后一致。
- HEAD `3cd55dc…` / tree `e05d68ad…` / 分支不变；`git status --porcelain` 全文 SHA-256 前后相同（`fullStatusIdentical=true`）。写本记录前仓库无新增改动。

## 3. 环境（RR-1）

| 项 | 实测 |
| --- | --- |
| 应用入口 | 本候选 worktree 真实 `app/main.ts`：83,599 bytes / `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`；仓库外 launcher 仅 `app.setPath("userData")` 后 `import()` |
| 渲染面 | `app/renderer/dist/index.html`：`fc24534e8c6286ec6885511607f74a1f287ce809903c6636cb7d6db54738bfd1` |
| 运行时 | Electron **44.7.0**；驱动 Node **v24.22.1**；Windows 11 Pro 10.0.26300 |
| userData（隔离） | `…\ans-doc-format-run-2026-11-10\round3\userData`（不写全局 `%APPDATA%/Electron`） |
| CDP | **仅 9223**（主进程 PID 23748；DevTools 页面就绪） |
| 启动命令 | `ANS_RR_USERDATA=<round3>\userData RR_REPO_MAIN=<worktree>\app\main.ts electron.exe <round3>\scripts\launcher.mjs --remote-debugging-port=9223` |
| 模型（如实披露） | `.env`：`ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANS_CLAUDE_REASONING_EFFORT=high`、`ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`；原生 `message.model`=`deepseek-v4-flash`。**非 Anthropic Claude** |
| 端口预检 | 9222 = **0 LISTENING**、9223 = **0 LISTENING** |

## 4. 预置（准备不计预算；含账本重置披露）

- **来源**：`C:\Users\51054\Desktop\work\jinyong-rogue-2d`（合法非贪吃蛇既有项目）；全新复制到 `…\round3\target`，**462 文件**（跳过旧 `.ans/sessions`；`.ans/project.json` 的 `projectRoot` 改为新目标根，其余字节不变）。
- **项目角色 8 个**：`art-dev`、`combat-dev`、`content-dev`、`dungeon-dev`、`engine-dev`、`env-bootstrap`、`render-dev`、`test-dev`；均有 `role-card.md` + `boundary.yaml`；`角色卡/governance-boundary.yaml` `a19ee561…`；9 条 pin **全部 MATCH**；roster v11 `b8071dc5e2452686d5f05e2faebcf5d9cb136e81d7d5ab25180e88f5a28649c3`（8 角色/12 模块）。
- **账本重置（协调方授权，如实披露）**：源 `.ans/state/tasks.jsonl` = **677,338 bytes / 401 行 / SHA-256 `044ca6f96c8d46668023e24d67057f82116c2bb3d104e504d4699e8d581ac4df`**，已保留为只读来源证据 `pre/tasks-source-ledger.jsonl`；工作副本 `.ans/state/tasks.jsonl` **重置为空文件**（0 bytes / SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`）。原因：源账本含 10 条 legacy `task.created` 行，`moduleDirectory` 为文件路径（`index.html`/`package.json`/`tools/verify_assets.mjs`，无尾随 `/`），当前 `validateTaskStateEvent` 会拒绝，`readOperationEvents` 在投递分配时校验全部账本行 ⇒ 任何投递 fail-closed（RR1/RR2 同一根因）。
- **激活口径（如实）**：旧 trunk 前模型产物——无 `.ans/role-evidence/activation-*.json`、无 `.ans/trunk/manifest.json`；「激活」按旧模式（真实任命/写卡账本 + 治理边界接受 pin + 角色目录/历史会话）表述；本轮**未做项目角色真实模型调用**（见 §6.4）。
- **其它 legacy 运行时 state**：未重置（`versions.jsonl`/`logs`/`governance` 保留；无 runs/doc-freezes/sessions/trunk）。

## 5. 运行时间线（UTC）

| 时刻 | 事件 |
| --- | --- |
| 17:07:29 | Electron 启动（9222/9223 预检均 0）；真实 UI 导入 → 目录选择器选中 `…\round3\target` |
| 17:07:37.8 | 角色枚举 **14 个**（6 内置 + 8 项目角色） |
| 17:07:41.552–17:07:41.802 | 6 个内置角色会话真实 `openSession`（`session.open.ready` ×6） |
| **17:07:41.959** | **1 条客户消息**发送（`cleared:true`；全文 `customer-message.txt`，1,612 bytes；明确「文档准备任务不带模块字段」「产品先调 doc_format」「不使用 run_shell」） |
| 17:07:43.303 | 幕僚 `prompt_snapshot` 58,145 B / `5eda2ded…`（含 doc_format guidelines） |
| **17:07:52.373** | **幕僚 `dispatch_task`**：`roleId:"product"`、`flowId:"jinyong-rogue-2d"`、`task` **无 moduleId/modulePaths/moduleDirectory** |
| **17:07:52.545** | **应用受理**：`task.created t-mw9ileu9-53e94663`（`sideEffect:"code"`，`runState:"draft"`；**无 module 字段**）；`task.delivered`；product `session.open.ready` 17:07:52.690Z；`delivery.start` 17:07:52.712Z |
| 17:07:53.757 | product `prompt_snapshot` 15,526 B / `1a1c0740…`（含 doc_format guidelines） |
| **17:07:54.494** | **产品真实调用 `doc_format`**（`{"format":"project-intent/v1"}`） |
| **17:07:54.514** | **回执 2,162 B**（首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`，含字段/样例/错误码） |
| 17:08:50.985 | 产品 `write_file` 写 v4（contentLen 11,913；落盘 25,255 B） |
| 17:08:54.742 / 17:08:58.168 | 产品 `edit_file` ×2（内容修订 AC 计数；25,261 → 24,704 B） |
| 17:08:59.385 | 产品 `run_shell`（certutil 取哈希）→ shell 审批卡 `命令审批 · 产品`（硬拒类 deny；**未执行**） |
| 17:09:52.696 | 第 1 次 `run_shell` 回执：`审核拒绝（操作者拒绝执行…operator:51054）` |
| 17:09:55.943 → 17:11:55.960 | 第 2 次 `run_shell`（powershell Get-FileHash）→ `审核超时（120000ms）…已中止` |
| 17:12:04.408 / 17:12:10.878 / 17:12:13.044 | 产品 `edit_file` ×3（25,643 → 25,659 → 25,686 B） |
| 17:12:16.092 → 17:14:16.108 | 第 3 次 `run_shell`（sha256sum）→ `审核超时（120000ms）…已中止` |
| 17:14:22.797 | 产品 `submit_report`（`status:"completed"`；如实说明「sha256 未能取得…不提供、不编造」） |
| **17:14:33.880** | 幕僚 `request_choice`（`cardKind:"intent-confirm"`、`flowId/intentId=jinyong-rogue-2d`、选项 confirm/revise）→ `request.created req-e8320c4bdb8e5b4e` |
| **17:14:34.346** | 客户端捕获卡内 marker：`snapshot=s-intent-e54bdb… / path=docs/product/jinyong-rogue-2d-intent-v4.md / sha256=905870be… / version=4`（**prepareIntentConfirmation 通过**） |
| **17:14:34.391** | 客户选择 `confirm`（`request.resolved`，`by:"customer"`） |
| **17:14:34.410 / .429** | `intent.confirmation.freeze-start` → **`freeze-committed`** |
| 17:13:52.179 | 项目角色 `test-dev` 会话真实打开（`session.open.ready`；由驱动在 intent 文档等待阈值后尝试直连查询） |
| 17:13:52–17:15 | 操作者直连项目角色尝试：composer 对非幕僚角色 disabled；`window.desktop.sendSession` 返回 `ok:false / error:"向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。"`（**未送达**；RR-7 回落） |
| ≈17:15:5x | 收尾：`btn-halt` → `stopSession`（`ok:true`，关闭 3 个会话）→ `Browser.close`；9223 释放、无 Electron 残留 |

## 6. 关键观测原件

### 6.1 派发受理回执（无模块字段）

- 入参（`extracts/chief-dispatch-task-inputs.json`）：`roleId:"product"`、`flowId:"jinyong-rogue-2d"`、`task`（文本）；**`moduleId=null`、`modulePaths=null`、`moduleDirectory=null`**。
- 回执（`extracts/chief-dispatch-task-receipts.json` `f50e2239…`）：
  > `dispatch_task：任务已派发给「product」（status 由对方经回交报告回报）。 已受理：任务将投递给角色 产品 的会话…任务编号：#t-mw9ileu9-53e94663（sideEffect=code；受理 ≠ 完成）。`
- 账本 `task.created` 逐字段核对：`flowId=jinyong-rogue-2d`、`to=product`、`runState=draft`、`runId=run-hub-a2e2eba3…`；**无 moduleId/modulePaths/moduleDirectory 键**。

### 6.2 产品真实 `doc_format` 调用与回执

- 调用：`product` / 2026-11-09T17:07:54.494Z / `mcp__ans__doc_format` / tool_use_id `call_00_ET_YQNbwM6WfjZjHb5uv74m5294` / 入参 **`{"format":"project-intent/v1"}`** / model `deepseek-v4-flash`（`extracts/product-doc-format-calls.json` `c6c6dfb8…`）。
- 回执：**2,162 B**（`extracts/product-doc-format-receipts.json` `68914b31…`），首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`；含 `schema：project-intent/v1`、`路径：docs/product/<flowId>-intent-vN.md`、校验器锚点 `prepareIntentConfirmation`、字段/样例/错误码。
- 产品随后如实回报（`extracts/rr3-actions-summary.json > productReport`）：`doc_format` 读取的强制字段与 `intentId` 约定、frontmatter 自检、正文四要素、AC 计数自检；**未取得 sha256**（shell 被拒/超时），明确「不提供、不编造哈希值」。

### 6.3 意图 v4 与 `prepareIntentConfirmation`

- 文件：`docs/product/jinyong-rogue-2d-intent-v4.md`，**25,686 bytes / `905870be547eb5f0691c3af0bbc833a2eec601ae0d31832b40627ad0467c5b95`**；frontmatter `schema: project-intent/v1 / flowId: jinyong-rogue-2d / version: 4 / intentId: jinyong-rogue-2d`（另有 goal/scope/acceptance/nonGoals/constraints）。
- 卡内 marker（原文）：`[ans-intent-evidence snapshot=s-intent-e54bdbf924bce76ba549e86f7d7704b1adc43269206501b0896794b35055ce00 path=docs/product/jinyong-rogue-2d-intent-v4.md sha256=905870be547eb5f0691c3af0bbc833a2eec601ae0d31832b40627ad0467c5b95 version=4]`。
- 结果：卡正常呈现（选项 `confirm`/`revise`），客户 `confirm`；`freeze-start`/`freeze-committed` 均落账；目标 `.ans/trunk/snapshots/s-intent-e54bdb…json` 新增（`post/target-diff.json`）。**无 schema 拒绝、无 `trunk-item-invalid`**。
- **一次写对口径如实**：1 次 `write_file` + 5 次 `edit_file`（内容修订，非 schema 重试）；frontmatter 首次写入即正确；最终字节与卡 marker 一致。

### 6.4 项目角色直连（B1 RR-7 回落）

- 会话注册：`test-dev` `session.open.ready` 17:13:52.179Z（真实 Electron `openSession`）。
- 直连尝试与回执：
  - composer：对非幕僚角色 `inp-message` **disabled**（提示「操作者确认超时（>120000ms），未获放行——可让角色重新发起。」）；两次 Enter 尝试均未发送（输入未清空）。
  - 真实 IPC：`window.desktop.sendSession(text, [], {projectRoot, roleId:"test-dev", runtime:"claude"}, {clientMessageId})` → **`{"ok":false,"error":"向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。"}`**（`operator-project-role-send.json` `2ae48041…`）。
- **回落证据**：`test-dev` 会话注册（上述 `session.open.ready`）+ 数据源可调用（`app/desktop/session.ts:3890-3896/4390/10441-10444` 无条件注入与静态早退；D1 `test/测试/doc-format-all-roles.test.ts` 5/5 含项目角色真实轮次调用、`test/桌面应用/session.test.ts` 7/7；W5 记录）。**未做项目角色真实模型调用**，不宣称真实读取。
- 影响提示：B1 §7.4「操作者直连项目角色会话注入 1 条查询」与**当前桌面实现（非幕僚角色会话只读/仅诊断）**冲突；B2 应按 RR-7 回落口径评估，或由协调方另定支持路径。

### 6.5 6 内置 + 1 项目角色注册（真实 Electron）

- 6 条 `session.open.ready`（chief/product/rapporteur/nominator/convener/verifier，17:07:41.552–.802Z）+ 1 条 `test-dev`（17:13:52.179Z）；`roles.listing` 14 角色（`drive.jsonl`）。
- 真实回合 prompt snapshots：幕僚 58,145 B / `5eda2ded…`、产品 15,526 B / `1a1c0740…`，均 `hasDocFormatGuideline=true`（`doc_format` promptGuidelines 三条来自 `options.tools`，证明工具在该会话注册集内）。
- 产品真实调用 1 次（§6.2）；项目角色无回合（§6.4 回落）。注册≠真实读取。

### 6.6 偏差：产品 `run_shell` ×3 与 shell 审批卡

- 客户消息明确「不使用 run_shell」；产品仍调用 3 次（`certutil`、`powershell Get-FileHash`、`sha256sum`）。
- 三次均**未执行**：第 1 次 `审核拒绝（操作者拒绝执行，审者：ruleset:default（su 审批档） → operator:51054）`；第 2/3 次 `审核超时（120000ms）：底层操作未在时限内返回，已中止以免无限挂起`。
- **1 张 shell 审批卡**（`命令审批 · 产品`，硬拒类 deny，`shell-card-deny.json` `ab4c6e5c…`）；已记录并拒绝，未执行任何命令；本卡为**审批卡**，不计入意图确认卡预算。
- 产品报告如实说明未取得 sha256、不编造；最终意图卡由应用绑定真实字节 hash。

## 7. RR-1–RR-8 对照（本轮结果；不判验收）

| ID | 本轮结果 | 说明 |
| --- | --- | --- |
| RR-1 环境 | **已取证** | 真实 Electron + 真实模型 + 真实 UI；隔离 userData/CDP 9223；环境见 §3 |
| RR-2 预检与预置 | **已取证（含账本重置披露）** | 9222/9223 预检 0；复制合法非贪吃蛇项目，8 个项目角色，pins MATCH；**账本重置为空并保留源账本 hash**；旧模型激活口径如实披露 |
| RR-3 场景 A（产品） | **已取证（含「一次写对」偏差披露）** | 1 条客户消息 → 派发成功 → 产品真实 `doc_format` 1 次（2,162 B）→ intent v4 25,686 B → `prepareIntentConfirmation` 通过（marker + freeze-committed）→ 意图卡 1 张、客户 confirm；产品 1 write + 5 edits、3 次 run_shell 未执行（如实记录） |
| RR-4 场景 B（全员可读） | **部分取证（项目角色 RR-7 回落）** | 6 内置会话注册 + 产品真实读取；`test-dev` 会话注册但**操作者直连被应用拒绝**，未做项目角色真实模型调用；不得写成通过 |
| RR-5 隔离证明 | **已取证** | 9222 全程 0；9223 预检空闲、后检释放（仅 TIME_WAIT）；无 Electron 残留；未读写贪吃蛇根/target |
| RR-6 预算/纪律 | **符合** | 客户 1/1、意图卡 1/1、操作者项目角色 0 送达/≤1、产品 1/3、项目角色 0/1、墙钟 ≈8m27s/20m；首果即停；0 客户消息重试；shell 偏差如实记录 |
| RR-7 回落与如实性 | **适用并如实** | 项目角色真实读取不可行 ⇒ 会话注册 + 数据源可调用；明确标注「未做项目角色真实模型调用」；产品 run_shell 偏差/未取得 hash 如实记录 |
| RR-8 同一候选/证据 | **已取证** | 运行前后候选/聚合/manifest 逐字节相同；HEAD/tree/分支/工作树状态不变；未提交/推送/合并/发布 |

## 8. 预算（RR-6/AC-14）

| 项 | 预算 | 实测 | 说明 |
| --- | --- | --- | --- |
| 客户消息 | ≤1 | **1** | 17:07:41.959Z 唯一一条 |
| 意图确认卡 | ≤1 | **1** | `req-e8320c4bdb8e5b4e`，客户 confirm |
| shell 审批卡（审批卡，非客户决策卡） | — | **1 张 + 2 次审核超时** | 3 次 run_shell 均未执行 |
| 操作者直连项目角色消息 | ≤1 | **0 送达** | 应用拒绝（非幕僚会话只读/诊断）；RR-7 回落 |
| 产品 `doc_format` | ≤3（期望 1） | **1** | 17:07:54.494Z，2,162 B |
| 项目角色 `doc_format` | ≤1 | **0** | 回落，未做真实模型调用 |
| 幕僚 `doc_format` | — | **0** | 本轮未调用 |
| 模型回合 | 最小化 | chief **3** 完成；product **1** 完成；test-dev **0** | 无其它角色回合 |
| 墙钟 | ≤20 分钟 | **≈8 分 27 秒** | 17:07:29Z → 17:15:56Z |
| 首果即停 / 不重试 | 必须 | **遵守** | 决定性证据集齐后停止；未发第 2 条客户消息、未重启、未续跑 |
| 非本变更卡/越界写/非预期调用 | 立即停止 | **shell 偏差已如实记录** | 产品 3 次 run_shell（未执行）+ 1 张 shell 审批卡；无其它变更卡/越界写 |

## 9. 9222/9223 与零触碰（RR-5）

- **9222**：预检 0 LISTENING；运行期驱动每 15s 采样（若出现会记 gate；未出现）；后检 0 LISTENING。**未启动/占用/关闭 9222。**
- **9223**：预检空闲；运行期本实例 LISTENING；后检 **0 LISTENING**（仅 TIME_WAIT），无 Electron 进程残留（`post/ports-and-processes-post.txt`、`final-isolation.txt`）。
- **贪吃蛇根/target 零触碰**：全程仅 `netstat -ano`/`tasklist`；**未读取** `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 与 `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09`（含 target）下任何文件；未复制/比较/哈希其文件。
- **目标项目写入（隔离根内，预期）**：462 → 482 文件；added 20 / changed 6 / removed 0（`post/target-diff.json`）：新增 draft run manifest、chief/product 会话（native 转录）、product 报告、`doc-freezes.json`、init-source、**intent v4**、**trunk snapshot `s-intent-e54bdb…`**；changed：账本（空 → 1 任务 + 1 intent 卡事件）、versions、logs、`docs/bootstrap-manifest.md`（应用既有维护）。**无 v1–v3 改写、无提案/契约/角色卡改动。**

## 10. 模型与工具面披露（如实）

1. 真实模型调用（无桩），实际模型 **`deepseek-v4-flash`**（`.env` 与原生 `message.model` 一致）——非 Anthropic Claude，不宣称 Claude。
2. 本轮真实工具面（原生转录）：chief `project_state`×1、`contract_check`×1、`dispatch_task`×1、`role_status`×1、`list_dir`×1、`read_file`×1、`request_choice`×1；product `doc_format`×1、`list_dir`×2、`read_file`×2、`write_file`×1、`edit_file`×5、`run_shell`×3（均未执行）、`submit_report`×1；test-dev 无回合。
3. `doc_format` 在幕僚/产品会话的 `prompt_snapshot` 系统提示中可见（guidelines 三条）；**产品真实调用并收到说明**；项目角色未做真实模型调用（RR-7 回落）。首轮 RR1 的幕僚真实调用证据不拼接为本轮成果。

## 11. 限制与下一门（不判验收）

1. **项目角色直连不可用（本轮关键限制）**：当前桌面 `sendSession` 对非幕僚角色返回 `向幕僚发送新任务或澄清；其他角色会话仅供阅读和诊断。`；B1 §7.4 的「操作者直连项目角色会话注入查询」在本候选/当前 UI 下不可执行。本轮按 B1 RR-7 回落（会话注册 + 数据源可调用），**不得**作为项目角色真实读取证据；B2 应按 RR-7 口径处理或由协调方另定支持路径。
2. **「一次写对」口径**：产品 frontmatter 首次写入即正确、无 schema 拒绝；但产品在回合内做了 5 次内容编辑与 3 次 run_shell 尝试（均未执行）。这是**模型行为偏差**（deepseek-v4-flash），非候选代码；如实记录，不宣称严格一次写对。
3. **账本重置**：为绕过 legacy 10 条非法 `moduleDirectory` 行，工作副本账本重置为空；源账本 677,338 B / `044ca6f9…` 已保留为只读证据。此准备改变工作副本运行时历史，不影响候选/manifest；已在 §4 披露。
4. **激活口径**：旧模型任命/写卡账本 + 治理边界接受 pin，不等于当前 trunk `role-activation/v1`；本项目角色未做真实模型调用。
5. **模型/端口**：deepseek-v4-flash（非 Anthropic）；Pi/Codex 真实模型行为不在本轮覆盖；9222 零占用、9223 释放、无 Electron 残留。
6. 本记录只陈述事实与偏差；不判 B1/AC/RR 通过或失败；不与 D1/W5/RR1/RR2 证据互相替代；未提交/推送/合并/发布。

## 12. 证据索引（`角色卡/测试/docs/change/2026-11-10_RR3_document-format-specifications-evidence/`，106 文件）

全量逐文件 SHA-256：`evidence-manifest.txt`（每行 `<sha256> *<相对路径>`，按路径排序；清单自身不在内，可复算）。关键原件：

| 类别 | 文件（相对 evidence 目录） |
| --- | --- |
| 身份/环境 | `pre/pre-summary.json`（`103adf8b…`）、`pre/prepare-target.json`（`63264f4c…`）、`pre/tasks-source-ledger.jsonl`（`044ca6f9…`，源账本 401 行/677,338 B）、`customer-message.txt`（`a822e53f…`）、`launch-time.txt`、`electron-stdout.log`、`driver-stdout.log`、`record-identity.txt` |
| 候选稳定性 | `pre/candidate-sha256.txt`、`post/candidate-sha256-post.txt`、`pre/manifest-src-app-test.txt`、`post/manifest-src-app-test-post.txt`、`post/post-summary.json`（`66f7a8b2…`） |
| 驱动/汇总 | `drive.jsonl`（`dc23f272…`）、`rr3-summary.json`（`d185cc24…`）、`round3-summary.json`、`live/heartbeat.json`、`ui-0*.jpeg`、`ui-10-intent-card*.jpeg`、`ui-99-final.jpeg`、`ui-final-body.txt` |
| 派发/产品读取 | `extracts/chief-dispatch-task-inputs.json`、`extracts/chief-dispatch-task-receipts.json`（`f50e2239…`）、`extracts/product-doc-format-calls.json`（`c6c6dfb8…`）、`extracts/product-doc-format-receipts.json`（`68914b31…`）、`extracts/extract-summary.json`（`f21e66f1…`）、`extracts/rr3-actions-summary.json`（`425e5340…`）、`extracts/product-actions.json`（`c7196fdf…`）、`extracts/chief-request-choice.json`、`extracts/product-system-prompt.txt`（`1a1c0740…`）、`extracts/chief-system-prompt.txt`（`5eda2ded…`） |
| 意图/卡 | `product/jinyong-rogue-2d-intent-v4.md`（`905870be…`/25,686 B）、`ui-10-intent-card.jpeg`、`ui-10-intent-card-confirmed.jpeg`、`ui-dialog-01-pre.jpeg`、`rr3-summary.json > keyFacts.intentCard/intentFreeze` |
| 偏差 | `shell-card-deny.json`（`ab4c6e5c…`）、`operator-project-role-send.json`（`2ae48041…`）、`extracts/rr3-actions-summary.json > productShellResults` |
| 账本/会话 | `tasks-final.jsonl`（`b92d2c1e…`；1 task + 1 intent 卡）、`versions-final.jsonl`（`3e692143…`）、`diagnostics/`、`diagnostics-userData-post/`、`sessions/`（chief/product 真实原生转录） |
| 目标/隔离 | `target-pre.sha256`、`target-post.sha256`、`pre/target-manifest-pre.json`、`post/target-manifest-post.json`、`post/target-diff.json`、`post/target-diff.txt`、`post/ports-and-processes-post.txt`、`final-isolation.txt`（`c86e3a7f…`） |
| 驱动方法 | `run-scripts/`（prepare-target、preflight、launcher、select-folder-auto.ps1、drive-rr3、finalize-fallback、extract-rr3、extract-actions、build-summary、postcheck、send-operator、copy-evidence-to-repo） |

## 13. 状态

- **RR3 决定性证据集齐（含 1 项 RR-7 回落）**：真实 Electron + 真实模型（`deepseek-v4-flash`）+ 真实 UI；客户消息 1 条；派发成功（无模块字段）；产品真实 `doc_format` 1 次（2,162 B）；intent v4 25,686 B / `905870be…`；`prepareIntentConfirmation` 通过（marker + freeze-committed）；意图卡 1 张、客户 confirm；6 内置 + 1 项目角色会话注册；**项目角色真实读取未做（应用拒绝操作者直连，RR-7 回落）**；产品 1 write + 5 edits + 3 次 run_shell 未执行（如实记录）；9222 零占用、9223 已释放无残留；候选/零触碰/仓库边界稳定。**不判验收；不改仓库产品/测试/角色卡/其它文档；未提交/推送/合并/发布。**
- 本记录之外只写 `2026-11-10_RR3_document-format-specifications-evidence/` 与仓库外运行根 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\round3\`。

**（完）**
