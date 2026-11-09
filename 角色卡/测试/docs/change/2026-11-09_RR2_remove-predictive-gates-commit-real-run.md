# 变更记录：RR2 真实 Claude 最小运行——运营（convener）派发 worker Git 写任务（2026-11-09）

- 任务节点：E3-R `docs/scheduling/2026-11-09_status-e3_claude-git-candidate-fix.md` §四「最终真实验证」——窄修复合并后（PR #75，HEAD `65813c9`），经**运营（convener）派发**的 worker 任务（`from:"convener"` + `moduleId`/`flowId`/`runId` + pinned run）让真实 Claude worker 执行 `git_candidate commit`，验证 MCP 成功 → 应用回执（prepared 或如实下一门）→ sidecar/journal/candidate ref。
- 角色：测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 日期：2026-11-09（本地 09:33–09:40 +0800；UTC 01:33–01:40）。
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；HEAD `65813c982d253832050aa95b722e1d505614ab3d`）。
- 仓库外运行根：`C:\Users\51054\Desktop\work\ans-dogfood-call-context-final-2026-11-09\rr\`（预置/预检/启动器/CDP 驱动/证据；目标项目 `rr\tmp\ans-rr2-final-J06mW6`、`userData`；未写既有项目）。
- 纪律：未 commit/push/暂存/合并/发布；未修改 `src/ app/ test/ docs/` 与角色卡/边界/YAML；未改仓库 `app/main.ts`；**只用仓库根既有 `.env` 凭据，未读取/打印/复制**；只写本记录与 `2026-11-09_RR2_evidence/`、仓库外临时根。

## 0. 结论摘要（先读；只陈述事实）

1. **MCP 校验通过且到达应用处理器**：真实 Claude worker（runtime `claude`）调用 `git_candidate {action:"commit", base:{ref:"refs/ans/trunk", oid:{sha1, 71dc290f…}}, paths:["src/impl/result.txt"], operationId:"rr2-final-commit-20261109-01", message}`——入参与预置任务文本逐字一致；工具结果为**应用层回执 JSON**（不是 MCP `-32602`）：`status:"blocked"`、`code:"git-source-process-history-unproven"`、`message:"The true source parent is not in this process's actual Core history; old process programs cannot be inferred stopped"`。
2. **既有下一门 `git-worker-task-unproven` 在本次运营派发拓扑下未命中**：应用在 `prepareWorkerCommit`（`src/service/trunk/impl/git-capabilities.ts`）内的 convener+moduleId 任务绑定、run pinned + `codeBasis`、`base` 与 pin 相等、写集/路径校验全部通过；worker actor 绑定（`git-worker-actor-unproven`）与 root-source（`git-worker-root-source-unproven`）门亦通过；**首个阻断为 `inspectGitActionAuthorization` 的 H6 source-parent Core 历史门**（`src/pipeline/orchestration/trunk-runtime.ts:152-154`）。
3. **零 Git 效果**：未产出 sidecar `authorization.jsonl`、`git.json`、candidate ref（`.ans/trunk/operations/` 前后同为 6 个预置链操作文件、逐文件哈希同值；`sha256("rr2-final-commit-20261109-01")=3aea3e06…` 目录不存在；`refs/ans/candidates/3aea3e06…` 不存在；refs 前后一致）。目标工作树仅新增未跟踪 `src/impl/result.txt`（44 字节）。**不宣称完整 Git 写成功**。
4. **预算/实测**：客户消息 **0**；`restoreTasks` 产品调用 1 次（restored 1 / skipped 5）；chief 回合 0；worker 回合 **1**；`dispatch_task` 0；Git 能力调用：模型侧 `git_candidate` 1 次（到达应用处理器 1 次），`git_query` 0；审批卡 0；导入点击→停止 **≈22 s**；无自动重试；首个决定性回执即停。
5. **停止账本缺口（如实披露）**：因在决定性回执后立即 halt，`tasks.jsonl` 中 worker 任务仅有 1 行 `task.created`（无 `task.delivered`/`task.reported`/`task.closed`）；诊断 `delivery.claim.start/end` 在案，`delivery.failed`（AbortError）1 行在案；模型侧其后调用 `submit_report`（status blocked）但回合被中止（其工具结果为中止文案）。
6. **下一门成因（只陈述，不改）**：预置 work source 的 `parent.sessionId` 是**预置进程中**的内存 chief Core 会话（`c57c0cea-6a7d-49f3-8ff0-d5c131939433`），不属于**应用进程**的真实 Core 历史 ⇒ H6 拒绝。该限制来自仓库外夹具构造（工作源父会话非应用进程真实会话），**不是**对产品行为的断言；上一轮 E1 的 chief 派发路径因工作源由应用内真实 chief 生成而不触发此门。

## 1. 输入与候选身份

| 项 | 实测 |
| --- | --- |
| 依据 | E3-R `docs/scheduling/2026-11-09_status-e3_claude-git-candidate-fix.md`（§四）；E1 `docs/scheduling/2026-11-09_change-package_claude-git-candidate-fix.md`；B2 `docs/acceptance/2026-11-09_claude-git-candidate-fix-report-v1.md`（`1bae184b…`，19/0/0/0） |
| 夹具参考（只读） | `test/测试/git-write-chain-fixture.ts`（W7；`buildWriteChain`/`createExecutionAssignment` 等真实 service/store/init/trunk/pin/convener task 构造） |
| HEAD / tree | `65813c982d253832050aa95b722e1d505614ab3d` / `0d96136d8fe3c646b91f0a6914a29e4b6c87acc6`；分支 `feat/plan-escalation-card`；暂存 0 |
| `src app test` 状态 | 运行前/后 `git status --porcelain -- src app test` 均 **空**（干净）；`git rev-parse HEAD`、tree、分支、暂存数前后同值（`evidence/00-repo-pre-state.txt`、`01-repo-post-state.txt`） |
| `src app test` manifest | 1,109 文件；canonical（逐文件 raw sha256、两空格、`LC_ALL=C` 排序、含末行换行）SHA-256 = `ed4cb74234c1042219093be3e564b60e9f81dca1566b88e9a4b934f1377f69f6`；**pre/post 行级 diff 0**（`repo-manifest-lines-pre.txt` / `repo-manifest-lines-post.txt`、`repo-manifest-sha-pre/post.txt`） |
| 渲染入口 | `app/renderer/dist/index.html`（仓库既有构建产物；未重建/未修改） |

## 2. 环境与预置（仓库外真实 product API；不改仓库）

- OS Windows 11 Pro 10.0.26300 / Git Bash / Node **v24.22.1**（type-stripping 直跑仓库 TS）/ Electron 44.7.0（`node_modules/.bin/electron`）。
- **预置脚本（仓库外）**：`rr\preseed.mjs`（import 仓库真实 API 与 W7 夹具辅助，裁剪为固定根）；`rr\preflight.mjs`（只读门禁复核 + 审计预检）；`rr\launcher.mjs`（仅 `app.setPath("userData")` 后 import 仓库真实 `app/main.ts`，未改仓库）；`rr\drive.mjs`（CDP 驱动）；`rr\extract-tool-facts.mjs`（从应用自有 SDK 会话原件提取工具入参/结果）。
- **预置结果**（`evidence/preseed-summary.json`，`ok:true`）：
  - 真实链（W7 `buildWriteChain`，`activationMode:"service"`）：真实 `git init`（`.git/config` 仅 `core.*`；`readGitProtectionFacts.coverage=complete`）+ trunk v1/v2 + 角色激活（activeRoles `impl`；authorization writesets 含 `src/impl/`）+ initial workflow + `freezeExecutionRun` pin：`runId=run-w7-exec`、`pinDigest=39d493a392a6e152de455aab899d1c4e17b948e55cb3804546d5f55a483db0c6`、`codeBasis={ref:"refs/ans/trunk", oid:{objectFormat:"sha1", hex:"71dc290f774b422566044fe6b061a7679256b89b"}}`。
  - 运营派发任务拓扑：`rr2-controller-task`（`from:"chief"→"convener"`，pinned，workSourceRef=`init-source-773bb8ee…`）+ `prepareParentTaskRef` + `prepareRoleDispatch({fromRoleId:"convener", targetRoleId:"impl", flowId:"demo", runId:"run-w7-exec", moduleId:"impl-core"})`（`kind:"execution"`, `modulePaths:["src/impl/"]`）+ **一条未投递/未报告/未关闭的开放任务** `rr2-worker-task`（`from:"convener", to:"impl", runState:"pinned", sideEffect:"code", moduleId:"impl-core", moduleDirectory:"src/impl/", modulePaths:["src/impl/"]`），文本要求：①`write_file` 创建 `src/impl/result.txt`；②`git_candidate` 用**逐字给定**的 JSON（含 pinned OID/格式）提交；不重试、不用 run_shell、无需先查 git_query。
  - 治理记录：`establishGovernanceRecord({governanceModel:"trio"})` → `ok:true`；写出 `角色卡/governance-boundary.yaml`、`.ans/project.json`（accepted）、`docs/bootstrap-manifest.md`；pin 2 条（governance-boundary `a19ee561…`、`角色卡/impl/boundary.yaml` `01418df2…`）；角色 `[impl]`。
  - **夹具账本披露**：为让桌面 `restoreTasks` 只投递唯一条 worker 任务，预置对 `w7-init-task`/`w7-doc-task`/`w7-nomination-task`/`w7-workflow-task` 与 `rr2-controller-task` 各写入 1 行 `task.delivered`（构造簿记，非产品行为）；`w7-plan-task` 已由链真实报告+收口。
- **只读预检**（`evidence/preflight.json`；与桌面将执行的同一批 product API）：
  - `readGitProtectionFacts`：`coverage:"complete"`、`projectRoot` 同目标、`reasons:[]`；
  - `inspectAssignedTask({taskId:"rr2-worker-task", actorRoleId:"impl"})` → `kind:"execution"`、`flowId:"demo"`、`runId:"run-w7-exec"`；
  - `prepareAssignedTaskWriteScope` → `paths:["src/impl/"]`；
  - `readRunEvidence("run-w7-exec")` → pinned、`frozenRoles:["impl"]`、`codeBasis` 同上；
  - `readTaskProcessSource` → ok（`sourceAssignmentTaskId:"rr2-controller-task"`、`parentCoreSessionId:"c57c0cea-6a7d-49f3-8ff0-d5c131939433"`）；
  - manifest：trunkVersion 2、activeRoles `["impl"]`；
  - 审计门禁预检（真实 `assembleOperatorShellGate` + `probeShellApproval`）`auditVerdict:"OK"`，`.ans/trunk/operations/` 写读删探针 OK ⇒ `verdict:"OK"`；
  - 账本：worker 任务仅 1 行 `task.created`；`openUndelivered=["rr2-worker-task"]`（唯一）。

## 3. 真实运行步骤（真实 UI 路径）

1. 启动：`ANS_RR_USERDATA=<rr>/userData node_modules/.bin/electron <rr>/launcher.mjs --remote-debugging-port=9222`（cwd=worktree；真实 `app/main.ts`；隔离 userData；CDP 9222）。
2. 真实 UI 点击「导入项目」→ 系统目录选择器（PowerShell 有界窗口消息）选择目标项目；导入成功（`import.state imported:true`，01:36:41.483Z）。
3. 点击「开始与 幕僚 对话」→ chief 会话（UI 默认引擎 `Claude`）`session.open.ready`（01:36:42.420Z）。**未发送任何客户消息**。
4. 投递触发（产品 API `window.desktop.restoreTasks({projectRoot})`，preload `tasks:restore`；等价于任务恢复刷新）：报告 `{restored:1, skipped:5, taskIds:["rr2-worker-task"]}`（01:36:43.551Z）→ 队列 drain 以真实任务绑定打开 impl 会话并投递（证据见 §5.1）。说明：导入时刻由 `listProject` 触发的首次 `restoreTasks` 因项目 runtime 尚未建立而解析为 `demo`，按产品既有语义 `delivery.skip.demo-not-opened`（01:36:39.070Z，不改模式不自动开）——因此本运行以「chief(claude) 打开后的显式恢复」为投递触发，**0 条客户消息**。
5. 观察至首个决定性结果（`git_candidate` 应用回执）→ `#btn-halt` + `window.desktop.stopSession({projectRoot})` + CDP `Browser.close`（§5.6）。

## 4. 预算与实测

| 项 | 预算 | 实测 | 偏差 |
| --- | --- | --- | --- |
| 客户消息 | 1 条（首选 0） | **0 条** | 0 |
| `restoreTasks` 产品调用 | ——（夹具触发） | **1 次**（首次即 restored 1） | 0 |
| chief 回合 | —— | **0** | 0 |
| worker 回合 | 1–2 | **1**（turn `f2fa2ee7-2f84-44a2-952b-ca6448651582`） | 0 |
| `dispatch_task` | ≤1 应用处理器 | **0** | 0 |
| Git 能力调用 | ≤2 | **1**（模型侧 `git_candidate` 1 次；到达应用处理器 1 次；`git_query` 0） | 0 |
| 审批卡 | ≤2 | **0**（`onShellConfirm` 0 事件） | 0 |
| 墙钟 | 10–15 分钟 | 导入点击→停止 **≈22 s**（01:36:39→01:37:01；观察循环 15.181 s） | 远低于上限 |
| 自动重试 | 无 | 无（模型每工具 1 次；驱动无重发） | 0 |

## 5. 结果（事实）

### 5.1 投递与会话（诊断 `userData/ans/diagnostics/`）

- `delivery.skip.demo-not-opened`（01:36:39.070Z，roleId `impl`，`state:"dispatch"`, queueDepth 1）——导入时首次恢复（demo）未开自动会话（产品既有语义）。
- 显式 `restoreTasks` 后：`session.open.start`（01:36:48.578Z）→ `session.open.ready`（01:36:50.247Z，roleId `impl`，`orchestration.session`）→ `delivery.claim.start`（01:36:51.705Z）→ `delivery.start`（01:36:51.707Z，count 1）→ `delivery.claim.end`（01:36:51.708Z）→ `session.send.start`（01:36:53.230Z）→ `request.attempt.start`（01:36:53.333Z，turnId 同上）→ `request.first-byte`（01:36:55.543Z）。
- 会话目录：`<target>/.ans/sessions/impl/claude/`（runtime **claude** 真实会话；`ans/replay.jsonl` 在案）。
- **投递正文（worker 首条用户消息，SDK 原件）**：`[ANS_INPUT_CONTEXT:…]\n[派发] 来自 幕僚 的任务\n任务编号：#rr2-worker-task\n<预置任务文本，含逐字 JSON>\n完成后请交回报告（改了什么/结论/证据）。`（`evidence/impl-delivery-first-user-message.txt`；完整 SDK 会话 `evidence/impl-native-session.jsonl`）。

### 5.2 工具（SDK 原件 `evidence/impl-sdk-tool-facts.json`；应用事件 `drive.jsonl`/`impl.jsonl`）

| # | 工具 | 入参（摘要） | 结果 |
| --- | --- | --- | --- |
| 1 | `write_file` | `{path:"src/impl/result.txt", content:"E3-R RR2 final real run result placeholder.\n"}` | 成功（app 事件 `accepted`/`completed` 01:36:55.759Z；落盘 44 字节） |
| 2 | `git_candidate` | 见 §5.3（与预置任务文本逐字一致） | 应用回执 `blocked`/`git-source-process-history-unproven`（app 事件 `denied`/`failed` 01:36:59.287Z） |
| 3 | `submit_report` | `status:"blocked"`，summary/evidence 含回执原文 | 模型侧调用后回合被 halt 中止（工具结果为中止文案；应用未落 `task.reported`） |

### 5.3 `git_candidate` 入参与应用回执（原文）

- 入参（SDK 原件逐字）：
  `{"operationId":"rr2-final-commit-20261109-01","action":"commit","base":{"ref":"refs/ans/trunk","oid":{"objectFormat":"sha1","hex":"71dc290f774b422566044fe6b061a7679256b89b"}},"paths":["src/impl/result.txt"],"message":"feat(impl): add result.txt for E3-R RR2 final real run"}`
- 应用回执（SDK 工具结果原文）：
  `{"operationId":"rr2-final-commit-20261109-01","repoId":"b99992ed31ab4c80826dfdafe92edbde78783c427dce347436fdcfd5f05bf9f5","status":"blocked","code":"git-source-process-history-unproven","message":"The true source parent is not in this process's actual Core history; old process programs cannot be inferred stopped"}`

### 5.4 阻断门定位与成因（只陈述）

- 回执码位于 `src/pipeline/orchestration/trunk-runtime.ts:152-154`（H6：`entries` 中须存在 `sessionId === input.parentCoreSessionId && roleId === "chief" && projectRoot` 一致的**本进程真实 Core** 条目）；`parentCoreSessionId` 来自 `readTaskProcessSource` 的 `source.parent.sessionId`。
- 本次 `parentCoreSessionId="c57c0cea-6a7d-49f3-8ff0-d5c131939433"` 是**预置进程**中 W7 夹具绑定的 demo chief Core 会话（仅存在于预置进程），应用进程的真实 Core 注册表不可能包含它 ⇒ H6 拒绝。**属夹具构造限制**（工作源父会话非应用进程真实会话），不是产品缺陷结论；亦不检验 actor 之后的 sidecar/journal/ref 路径。
- **代码顺序事实**：运行时先 `prepareWorkerCommit`（含 `git-worker-task-unproven` 的 convener+moduleId 绑定、run pinned/`codeBasis`、`base` 相等、写入域与路径校验；`src/service/trunk/impl/git-capabilities.ts`），通过后再做 worker actor 绑定（`git-worker-actor-unproven`）、`readGitInitializationTaskBasis`（`git-worker-root-source-unproven`）、随后才是 H6。本次回执为 H6 码 ⇒ 上述**前置门在真实应用中均通过**（其中 `git-worker-task-unproven` 未命中，为本次拓扑的关键验证点）。

### 5.5 零效果与稳定性

- `.ans/trunk/operations/`：运行前后均为 **6 个预置链操作文件**、逐文件 SHA-256 同值（`operations-pre-inventory.txt` vs `operations-inventory.json`；集合比较 `pre==post: True`）；`sha256("rr2-final-commit-20261109-01") = 3aea3e06f8e247b7a142b9758c0812cd143fdc8100057afd7ba0945a41b72a12` 目录**不存在**（无 `authorization.jsonl`、无 `git.json`）。
- 目标 refs：运行前/后一致（`refs/ans/trunk` = `71dc290f…`；5 个预置候选 refs 同值；**无** `refs/ans/candidates/3aea3e06…`）。
- 目标工作树：仅新增未跟踪 `src/impl/result.txt`（44 字节；`target-impl-result.txt`）；trunk/索引未被候选污染（未发布）。
- 仓库稳定性：HEAD/tree/分支/暂存/`src app test` status 前后同值；manifest 行级 diff 0（§1）。

### 5.6 停止时机

- 决定性回执 01:36:59.287Z；驱动于 01:37:01.4 左右点击 `#btn-halt` + `stopSession`（ok）+ `Browser.close`（`app.close via Browser.close`）；应用/浏览器关闭、9222 端口关闭、无 electron 残留。
- 停止账本缺口（如实）：`session.dispose` 01:37:01.419Z → `session.send.failed`（AbortError）01:37:01.431Z → `delivery.failed`（AbortError，`state:"dispatch"`, count 1）01:37:01.432Z；`tasks.jsonl` 中 worker 任务仅 1 行 `task.created`（关停后复核仍无 `task.delivered`/`task.reported`）。

## 6. 偏差与异常（不得隐藏）

1. **下一门为 `git-source-process-history-unproven`（H6）而非 prepared**：成因见 §5.4；本次未产出 sidecar/journal/candidate ref，不宣称完整 Git 写成功。
2. **投递触发方式**：导入时刻的首次恢复解析为 `demo` 并按产品语义跳过（未自动开 demo 会话）；本运行在 chief(claude) 打开后以**产品 API `restoreTasks`** 触发恢复投递（restored 1 / skipped 5），客户消息 0。该调用仅进入既有 `SessionManager.restoreTasks`（`planDispatchDelivery` + 队列 drain + 真实任务绑定会话打开），未修改产品代码。
3. **夹具账本构造**：`rr2-controller-task` 与 4 个链构造任务各预置 1 行 `task.delivered`（§2），使 `restoreTasks` 仅拾取唯一开放 worker 任务；这些行非产品运行产生，已在此披露。
4. **停止账本缺口**：`task.delivered`/`task.reported` 未落账（halt 先于投递 promise settle）；`submit_report` 的模型侧调用被中止（工具结果为中止文案），其 blocked 摘要仅存在于 SDK 会话原件，未成为应用账本报告。
5. **UI 截图说明**：截图显示真实应用窗口（项目已导入、chief/claude 会话已开启、输入框未发送消息）；worker 会话由应用在后台自动打开，截图未切到 impl 面板——工具事实以 SDK 原件/应用事件/诊断/账本为准。
6. **应用 stderr** 仅 1 条 SDK 既有告警（`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`，真实 SDK 会话存在的事实；无凭据内容）；无其它错误。
7. 真实模型行为为单次观测；本证据只覆盖本候选/本环境/本输入。

## 7. 不宣称事项

- 不宣称 `git_candidate commit` 完整成功；不宣称 sidecar/journal/candidate ref 经真机产出；不宣称 H6 之后的 actor 复检/策略/两阶段授权/lease/写入顺序被本运行覆盖。
- 不宣称 `git-source-process-history-unproven` 之外不存在残余门；不宣称 Pi/Codex 真实运行；不宣称六角色闭环、发布/tag、长期稳定性。
- 不判验收；本记录只陈述事实与下一门。

## 8. 中止/回退说明

- 首个决定性结果（应用回执）后按纪律停止（`#btn-halt` + `stopSession` + `Browser.close`）；无自动重试、无追加预算。
- 未修改仓库/既有项目；预置/运行全部在仓库外临时根；如后续需覆盖完整 Git 写：需使 work source 的父 chief Core 会话为**应用进程真实会话**（如 chief→convener→worker 的 live 派发，或应用内生成的恢复源），属夹具/拓扑另案——本 RR2 不追加预算、不伪造。

## 9. 证据索引

目录：`角色卡/测试/docs/change/2026-11-09_RR2_evidence/`（48 文件；逐文件 SHA-256/bytes 见 `evidence-index.md`）

| 内容 | 位置（节选） |
| --- | --- |
| 驱动逐行日志 / 汇总 / 应用日志 | `drive.jsonl`、`summary.json`、`app-error.log`、`app-output.log` |
| 预置/预检 | `preseed-summary.json`、`preflight.json`、`bootstrap-manifest.md`、`target-project.json`、`target-git-config-local.txt` |
| 投递/会话 | `impl-delivery-first-user-message.txt`（worker 首条用户消息）、`impl-native-session.jsonl`（真实 Claude SDK 会话原件）、`impl-replay.jsonl`、`impl.jsonl`、`diagnostics/`（运行中复制）、`diagnostics-post-shutdown/`（关停后复制） |
| 工具事实 | `impl-sdk-tool-facts.json`（write_file/git_candidate/submit_report 入参+结果原文）；应用事件流见 `drive.jsonl` 的 `impl.event` 行 |
| 账本 | `tasks.jsonl`（对象捕获时）、`tasks-post-shutdown.jsonl`（关停后）、`tasks-pre.jsonl`（运行前） |
| 零效果/状态 | `operations-inventory.json`、`operations-pre-inventory.txt`、`operations/`（6 个预置链操作文件原件）、`target-git-refs-post.txt`、`target-git-status-post.txt`、`target-git-log-post.txt`、`target-impl-result.txt`、`00-target-git-pre.txt` |
| 稳定性 | `00-repo-pre-state.txt`、`01-repo-post-state.txt`、`repo-manifest-lines-pre/post.txt`、`repo-manifest-sha-pre/post.txt` |
| UI | `ui-01-imported.jpeg`/`ui-02-after-restore.jpeg`/`ui-04-git-result.jpeg`/`ui-06-result.jpeg`/`ui-07-final.jpeg` 与同名 `*-body.txt` |
| 索引 | `evidence-index.md` |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

## 10. 纪律声明

- 只写 `角色卡/测试/docs/change/` 本记录与同名证据目录、仓库外临时根；未修改 `src/ app/ test/ docs/`、角色卡/边界/YAML、方案/B1/E1/B2/派发记录。
- 未 commit/push/暂存/合并/发布；未 `npm install`；未读/打印/复制 `.env` 值；未改既有项目；未改仓库 `app/main.ts`。
- 运行前后仓库 HEAD/tree/分支/暂存/`src app test` status/manifest 逐字节一致（§1）；应用/驱动/浏览器进程无残留、9222 已关闭。
