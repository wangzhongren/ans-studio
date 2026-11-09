# 变更记录：RR 真实 Claude 最小运行（删除全部预知式门控，2026-11-08）

- 任务节点：**RR 真实运行最小验证**（设计 P1.4 §5.3/§6.2/§6.3；B1 v1 AC-22–AC-24 与 B1-EV5 预算/纪律；派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §一/§三/§四 D1）。
- 角色：测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 日期：2026-11-08（本地 19:07–19:29；UTC 11:07–11:29）。
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；HEAD `3f249e2`）。
- 仓库外运行根：`C:\Users\51054\Desktop\work\ans-dogfood-remove-predictive-gates-2026-11-08\rr\`（目标项目 `target`/`target2`、`userData`/`userData2`、启动器/驱动/预检脚本；未写既有项目）。
- 纪律：未 commit/push/暂存/合并/发布；未修改 `src/ app/ test/ docs/` 与角色卡/边界；未改仓库 `app/main.ts`；**只用既有 `.env` 凭据，未读取/打印/复制**；只写本记录与 `2026-11-08_RR_evidence/`。

## 0. 结论摘要（先读；只陈述事实）

1. **AC-22 观测到完整正向链（本候选/本环境/本输入）**：受保护目标项目（初始化来源在 product 会话创建前 137 ms 落盘 ⇒ `readGitHostProtectionRequirement` = `required`）+ 真实 Claude + 真实桌面 UI：单条客户消息 → `dispatch_task` **父门受理**（tool 事件 accepted）→ `task.created` → **product 会话创建成功**（诊断 `session.open.ready roleId=product`，UTC 11:22:28.227）→ 任务投递到产品回合（产品首条用户消息即派发内容；`delivery.claim.start/start/claim.end` 11:22:28.254–257）→ 产品真实回合执行（`request.attempt.start` 11:22:28.280）。同一链路在两次尝试中均复现（attempt 1/2）。
2. **AC-23：结构化只读 Git 动作成功；结构化写动作（`git_candidate commit`）在 MCP 入参校验层被拒，未到达应用授权门。** 本候选下 product 在受保护范围内：`write_file docs/product/rr-git-note.md` 成功（59 字节）；`git_query template=branch-list` **status=observed**（真实 branch oid，经 prepareQuery/checkGitPolicy/任务-运行绑定）；随后 `git_candidate {action:commit, base.ref=refs/ans/trunk, base.oid=7b8acd9a…, paths:[docs/product/rr-git-note.md]}` 被 **MCP error -32602 Input validation error（invalid_union；commit 分支 `unrecognized_keys ["__ans_call_context"]`）** 拒绝，**未产生 prepared 候选/journal/sidecar**（`.ans/trunk/operations/` 为空、refs 仅 `refs/heads/master`、工作树仅新增该 untracked 文件）。该错误为**确定性结构性**：用仓库真实 `describeTool` + Claude 适配器同一 `__ans_call_context` 注入方式复现，`git_candidate` 失败而 `git_query`/`write_file` 通过（`attempt1/repro-call-context.json`；与线上错误逐键一致）。**下一真实阻塞 = Claude 适配器 `__ans_call_context` 注入与 `git_candidate` 顶层 `oneOf`（各分支 `additionalProperties:false`）不兼容**；涉及文件 **不在本候选 38 文件 delta 内**（`src/provider/claude/session.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts` 均无本变更改动，实测 `git diff HEAD` 为空）。
3. **环境构造缺陷与更正（如实披露）**：attempt 1 的目标项目 `.git/config` 含本地 `[user]` 段，被既有 `inspectGitRepository` 配置解析拒绝（`git-config-section-unsupported`）→ `readGitProtectionFacts.coverage=unknown` → `write_file` 被 `file-gate-host-facts-unproven` 拒、`git_query` 被 `git-query-evidence-unavailable` 拒（均为**我方 fixture 缺陷**，非产品门禁结论）。更正 fixture（`git init` 后仅 `[core]` 配置；初提交用命令级身份）后，attempt 2 上述两条路径即通过。attempt 1 全部原始证据保留（§5.1/§9），其结论不作 AC 事实。
4. **AC-24 预算/停止（attempt 2 为准）**：客户消息 1 条；chief 回合 1；product 回合 1；`dispatch_task` 模型侧 1 次/应用处理器 1 次（`task.created` 恰 1 行）；**应用层 Git 能力调用 1 次（git_query；git_candidate 被 MCP 校验层拒绝，未达应用处理器）**；审批卡 0；墙钟 发送→停止 **≈39.8 s**（11:22:14.128→11:22:53.894）；决定性证据（git_candidate MCP 拒绝 + submit_report 受理）后立即停止，无自动重试。**停止时机缺口如实披露**：`#btn-halt`+`stopSession`（ok，2 会话）在 submit_report 受理后 ~0.6 s 触发，产品报告向 chief 的投递被中止（诊断 `delivery.failed`，`state:"dispatch"`，AbortError），`tasks.jsonl` 的 `task.delivered`/`task.reported` 行未落账；报告正文以应用自身 SDK 会话存储（`.ans/sessions/product/.../native/projects/*.jsonl`）原件为准（4 条 evidence，`status: blocked`）。
5. **不宣称**：六角色闭环、发布成功、长期稳定性、Codex/Pi 真实运行、`git_candidate` 任何动作真实可达应用层、审批卡真机、恢复/重试语义。只承诺本记录证据所示。

## 1. 输入与候选身份

| 项 | 值 |
| --- | --- |
| 设计 P1.4 | `docs/planning/2026-11-08_design_git-write-init-approval-based.md`：822 行 / 124,066 bytes / `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc` |
| B1 v1（冻结） | `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`：182 行 / 34,071 bytes / `3306b9d4d1ac6d6b145e3ce9847823ac8c2da7766e40c2db918f9d47e217897c` |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`：102 行 / 22,490 bytes / `8659c540b1c62893ca6c37b83558004b3adbfdabac4f6ee7cf7a306c0c86b85b` |
| 团队计划 | `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`：503 行 / 66,827 bytes / `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808` |
| D1 证据（复用候选身份） | `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`：205 行 / 25,141 bytes / `10418f38fbb82c59772670248dc95cee586c2bf725b237ef5a799e6d612519d3` |
| 上一变更 RR 方法（只读参考） | `角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal.md`：121 行 / 16,854 bytes / `cc5968eecf13d88bee28e10f544e75df52b8a06e98e1ce3b014959c8d410e75a` |
| 候选 | HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`）/ 分支 `feat/plan-escalation-card` / 暂存 0；`git status --porcelain -- src app test` = **38 行（17 修改 + 21 新增、0 删除）** |
| 候选聚合（D1 同算法） | **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（38 文件 `<sha256>  <path>` 整行排序后 SHA-256；`pre-candidate-hash-lines-sorted.txt` / `post2-candidate-hash-lines-sorted.txt` 前后逐字节一致） |
| `src app test` manifest | **1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**；运行前（pre）/两次尝试后（post2）逐行 diff **0 行** |
| 渲染入口（实际加载） | `app/renderer/dist/index.html` `fc24534e…`；`assets/index-DI9m2pZO.js` `bba9798f…`；`assets/index-sr7o4Da4.css` `cf07a5ab…` |

> 候选稳定性：attempt 1、attempt 2 前后 HEAD/tree/分支/暂存/scope status/candidate 聚合/manifest 全部同值、diff 0 行（`01-scope-status-opening.txt`、`post2-*`、`pre-*`）。

## 2. 环境与运行前门禁

- OS Windows 11 Pro 10.0.26300 / Git Bash（MINGW64）/ Node **v24.22.1** / npm 11.19.1 / Git 2.55.0.windows.5 / Electron 44.7.0（`00-env-and-inputs.log`）。
- **目标项目（仓库外临时根）**：最小内容（README）+ 项目角色 `worker`（role-card/boundary）+ `docs/intents/rr-git-commit.md`（意图：write_file + git_query(branch-list) + git_candidate(commit) + submit_report，各一次、不重试、不用 run_shell 跑 git）+ `docs/product/`；真实 `git init` + 初始提交。**attempt 1** `rr\target`（初提交 `d39991a`；`.git/config` 含 `[user]`——fixture 缺陷）；**attempt 2（更正，AC 事实来源）** `rr\target2`（初提交 `7b8acd9a792af9293dcc6d5f47f1e5313b7ffb9d`；`.git/config` 仅 `[core]`；`inspectGitRepository` 实测 OK：`repoId 06fb1034…`）。
- **治理记录（程序化、产品自有代码）**：`establishGovernanceRecord({projectRoot, governanceModel:"trio"})` → `ok:true`，写出 `角色卡/governance-boundary.yaml`、`.ans/project.json`（`accepted:true`，pin 2 条）、`docs/bootstrap-manifest.md`（`establish.log`，两 target 各自执行）。
- **审计门禁预检**（真实 `assembleOperatorShellGate` + `probeShellApproval`，含一次 refresh 重试）与 **`.ans/trunk/operations/` 可写预检**：`audit.sink="file"`、`durable:true`、`probe:"ok"`、operations 写读删探针 OK → `verdict:"OK"`（`precheck.log`，两 target 各自执行）。
- 启动命令（cwd=worktree 根；launcher 仅 `app.setPath("userData")` 后 import 仓库真实 `app/main.ts`，未改仓库文件）：
  `ANS_RR_USERDATA=<rr>/userData[2] node_modules/.bin/electron <rr>/launcher.mjs --remote-debugging-port=9222`。

## 3. 步骤（真实 UI 路径）

1. 应用以临时 userData 启动（attempt 1 `userData`、attempt 2 `userData2`）；真实 UI「导入项目」→ 系统目录对话框（PowerShell 自动化选择仓库外目标项目）。
2. 「开始与 幕僚 对话」→ chief `session.open.ready`（attempt 2：11:22:14.173Z）。
3. 在真实输入框 `#inp-message` 发送**单条**客户消息（Enter；未重发）：要求 chief 按 `docs/intents/rr-git-commit.md` **只派发一次** product 任务（write_file → git_query(branch-list) → git_candidate(commit) → submit_report），不得代替执行。
4. 观察 `session.open.*`/`tasks.jsonl`/`.ans/trunk/operations/`/`docs/audit/shell-gate.jsonl`/UI，至首个决定性结果；随后 `#btn-halt` + `window.desktop.stopSession({projectRoot})` + CDP `Browser.close`。
- **attempt 2 的导入管道故障与处理（如实披露，不涉及模型预算）**：首次导入自动化（PowerShell 窗口消息）两次 30 s 超时；`#btn-import` 单次点击在两次实例中出现 1–2 个 `#32770` 选择器；自动化曾误按 id=2（取消）按钮而导入未发生。改用工具有界发送（`SendMessageTimeout`/`SMTO_ABORTIFHUNG`）+ 仅按 id=1（确定）后导入成功；所有失败轮次原始日志保留（`attempt2/drive-importfail*.jsonl`、`import-round*.txt`）。期间未启动 chief 会话、未发送任何客户消息。

## 4. 预算与实测

### 4.1 attempt 2（更正 fixture；AC-22/23/24 事实来源）

| 项 | 预算 | 实测 | 偏差 |
| --- | --- | --- | --- |
| 客户消息 | 1 条 | **1 条**（11:22:14.128Z，UI Enter） | 0 |
| chief 回合 | 1 个 | **1 个**（turn `d3234ec5…`，11:22:14.325→settled 11:22:30.618） | 0 |
| product 回合 | 1–2 个 | **1 个**（turn `b990a371…`，11:22:28.280 起） | 0 |
| `dispatch_task` | ≤1 次应用处理器调用 | 模型侧 1 次、accepted；应用侧 `task.created` **1 行** | 0 |
| Git 能力调用 | ≤2 次 | **应用层 1 次**（`git_query` observed）；`git_candidate` 模型侧 1 次，**MCP 入参校验层拒绝、未达应用处理器** | 0（如实登记层级） |
| 审批卡 | ≤2 张 | **0 张**（`onShellConfirm` 0 事件；诊断无 shell.review） | 0 |
| 墙钟 | 10–15 分钟 | 发送→停止 **≈39.8 s** | 远低于上限 |
| 自动重试 | 无 | 测试侧无重发/重试；模型侧每工具各 1 次 | 0 |

### 4.2 attempt 1（fixture 缺陷；只作披露，不作 AC 事实）

- 1 条消息；`task.created` 1 行；product 会话创建成功；**同一任务被第二次投递**（`delivery.claim.start` 11:10:48.351 后 product 第二回合 `98d3b889…`）；product 回合 **2**；chief 回合 **4**（首个回合后应用自主继续 3 个，超预算）；应用层 `git_query` 2 次（均 `git-query-evidence-unavailable`）、`write_file` 2 次（均 `file-gate-host-facts-unproven`）、`git_candidate` 模型侧 2 次（均 MCP `invalid_union`）；审批卡 0；墙钟 发送→手动停止 **≈3 m 16 s**（11:10:03.650→11:13:19.306）。根因见 §0.3；原始证据 `attempt1/`。

## 5. 结果（事实）

### 5.1 attempt 2（AC 事实来源）

**AC-22（父门受理 + 任务创建 + 目标会话创建成功 + 任务投递）**
- 父门受理：`dispatch_task` tool_call → **accepted**（11:22:28.254Z）。
- 任务创建：`tasks.jsonl` `task.created`（11:22:28.150Z；`taskId=t-mw7qtd4m-ef385125`，`from=chief to=product flowId=rr-git-commit runId=run-hub-4477d6d6…`）；`.ans/runs/run-hub-4477d6d6…/manifest.json`（`state:"draft"`，`builtinPreparationSource=init-source-82deb9a2…`，`codeBasis=null`）。
- 受保护事实：`target2/.ans/trunk/initialization-sources/init-source-82deb9a2….json` 落盘于 **11:22:28.090Z**（`readGitHostProtectionRequirement` 对 initialization-sources 判定 `required`），早于 product `session.open.ready` **11:22:28.227Z** 137 ms；`.git/refs/ans/trunk` 与 `git-mode.json` 均不存在（保护仅由 init-source 证据构成）。
- 目标会话创建成功：诊断 `session.open.ready roleId=product`（orchestration.session，11:22:28.227Z）；`session.open.end ok=false` 计数 **0**（无创建失败）。
- 任务投递：product 会话首条用户消息即派发内容（SDK 会话原件：`[ANS_INPUT_CONTEXT:…]\n[派发] 来自 幕僚 的任务 任务编号：#t-mw7qtd4m-ef385125 …`，`attempt2/delivery-first-user-message.txt`）；诊断 `delivery.claim.start/start/claim.end`（11:22:28.254–257）；产品随即真实执行（`request.attempt.start` 11:22:28.280）。
- **停止时机缺口（如实披露）**：`#btn-halt`（11:22:53.894）+`stopSession`（ok，关闭 2 会话，11:22:55.420）发生在 submit_report 受理后 ~0.6 s，任务投递管线的收口被中止：诊断 `delivery.failed`（11:22:55.430，`state:"dispatch"`，AbortError「本轮运行 被中止」），`tasks.jsonl` 未出现 `task.delivered`/`task.reported` 行；`report.received`（11:22:53.264，`state:"blocked"`，`count:4`）已记录。

**AC-23（角色 ACL/写集内一次结构化 Git 动作——成功或如实下一真实阻塞）**
- `write_file docs/product/rr-git-note.md` → **成功**（59 字节落盘；`target-rr-git-note.md`）；产品预授权写区 `docs/product/`（角色模块声明）。
- `git_query template=branch-list`（operationId `op-product-rr-git-commit-query-1`）→ **status=observed**；`repoId=06fb1034b188539379ab8be80a4eeff0e771b7beaaa886b98bcd6fbc9affd22d`；`output="refs/heads/master\u00007b8acd9a792af9293dcc6d5f47f1e5313b7ffb9d\n"`（经 prepareQuery + `checkGitPolicy` 纯策略 + 真实任务/运行绑定；只读路径不经写门，属既有语义）。
- `git_candidate {action:"commit", base:{ref:"refs/ans/trunk", oid:{sha1, 7b8acd9a…}}, paths:["docs/product/rr-git-note.md"], message, operationId:"op-product-rr-git-commit-candidate-1"}` → **MCP error -32602 Input validation error: Invalid arguments for tool git_candidate**（`invalid_union`；commit 分支 `unrecognized_keys ["__ans_call_context"]`，即 action/base/paths/message 均通过、仅宿主注入的 `__ans_call_context` 未识别；其余三个 union 分支同时报 `paths`/`__ans_call_context` 未识别）。**未到达应用处理器**：无 tool_call/denied 应用事件、无 prepared 候选、无 `git.json`/`authorization.jsonl`（`.ans/trunk/operations/` 为空，`operations-inventory.json=[]`）、refs 仍仅 `refs/heads/master`、工作树仅新增 untracked `docs/product/rr-git-note.md`。
- **确定性复现（同一错误结构）**：`attempt1/repro-call-context.json` —— 用仓库真实 `describeTool("git_candidate")` + 适配器同一注入（顶层 `properties.__ans_call_context`）经真实 `toClaudeSchema` 校验：`git_candidate` = `invalid_union`（commit 分支 issue `unrecognized_keys:["__ans_call_context"]`），`git_query`/`write_file` = 通过。**该缺陷涉及文件不在本候选 delta**（`src/provider/claude/session.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts` 无本变更改动）。
- journal + sidecar：本轮**不存在**（如实：动作被 MCP 校验层阻断、零效果、零操作目录）；AC-23 按「如实报告下一真实阻塞」分支记录，不冒充成功。
- 下一真实阻塞（只陈述，不改）：Claude 适配器把 `__ans_call_context` 注入 schema 顶层 `properties`，而 `git_candidate` 的入参 schema 是顶层 `oneOf`、各分支 `additionalProperties:false` ⇒ 任何真实 Claude 的 `git_candidate` 调用（commit/integrate/revert/init 四分支）都会在 MCP 校验层失败，**写/初始化授权门（`inspectGitActionAuthorization` + sidecar）在本环境无法被触达**。确定性集成测试直接调用工具 handler（不经该 MCP 校验层），故未覆盖此形态。

**AC-24（明确限制）**
- 预算见 §4.1；决定性结果（MCP 拒绝 + report 受理）后立即停止；无追加消息、无测试侧重试、无伪造。停止方式与其缺口见 §5.1 AC-22 与 §6.3。回退说明：git 写/初始化链路按 B1 要求留确定性证据（W1–W5/D1 已覆盖）；本 RR 不宣称该链路真机通过。

### 5.2 attempt 1（fixture 缺陷；披露）

- `write_file docs/product/rr-git-note.md` → `file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required`（允许路径 skill/project 均无）；`git_query branch-list` → `git-query-evidence-unavailable: Error: git-config-section-unsupported`；`git_candidate` → MCP `invalid_union`（两回合各 1 次）。全部为**同一 fixture 缺陷**（`.git/config` 的 `[user]` 段被既有 `configFormat` 白名单拒绝 → 保护事实 `coverage=unknown` → 文件门/查询不可用）与 §5.1 的 MCP 结构缺陷叠加；零效果（无文件、无 journal/sidecar、audit 0 行）。据此更正 fixture 并以 attempt 2 为 AC 事实来源（§0.3）。

## 6. 偏差与异常（不得隐藏）

1. **attempt 1 环境构造缺陷**（§0.3/§5.2）：目标 `.git/config` 含 `[user]`；更正为仅 `[core]` 后复跑。两次尝试均完整保留原始证据。
2. **attempt 1 模型侧/应用自主行为**：同一任务被二次投递（product 2 回合、重复报告 ×2，`status:blocked`）；首个报告后 chief 自主追加 3 个回合（总 4 个，超预算 1 个）；`git_candidate` 模型侧 2 次尝试（MCP 拒绝）。测试侧未重发消息。
3. **attempt 2 停止时机缺口**：submit_report 受理后 0.6 s 即 halt/stopSession → 报告向 chief 的投递被中止（`delivery.failed`，AbortError）、`tasks.jsonl` 的 `delivered`/`reported` 未落账。报告正文以 SDK 会话原件为准（4 条 evidence，`status:blocked`）；不影响 AC-22 的会话创建/送达事实（产品首条消息即派发内容并已执行），但 `task.delivered` 账本行缺失属本驱动停止条件缺陷（在 `productReported` 处提前停止）。
4. **attempt 2 导入管道故障**（§3 末）：PowerShell 窗口自动化超时/误按取消按钮；修复后导入成功；未消耗模型预算。相关失败日志全部保留。
5. 真实模型行为具有单次观测随机性；本证据只覆盖本候选/本环境/本输入。

## 7. 不宣称事项

- 不宣称 `git_candidate` commit/init/integrate/revert 或 `git_publish` 在真实 Claude 下可用；不宣称写门 `inspectGitActionAuthorization` 或 sidecar authorization 经真机验证。
- 不宣称六角色闭环、发布/tag、run-stop/deferred 宿主继续、审批卡真机、Codex/Pi 真实运行、长期稳定性。
- 不宣称删除预知门后不存在残余风险（设计 §4.3/§6.3 的披露仍然有效）。
- 不判验收；AC-22/23/24 的 B2 判定由内置独立验收按 B1 v1 作出。

## 8. 中止/回退说明

- attempt 1 因 fixture 缺陷终止（记录原始失败）；attempt 2 在决定性结果处按纪律停止（`#btn-halt` + `stopSession` ok + CDP `Browser.close`；实测无残留 electron、9222 已关闭）。
- 若后续需覆盖真机结构化 Git 写：需先修复 `__ans_call_context`/`oneOf` 兼容（适配器或 schema 层，属另立变更/接口评审），再按同一预算重跑；本 RR 不追加预算、不伪造。

## 9. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_RR_evidence/`（85 文件，逐文件 SHA-256/bytes 见 `evidence-index.md`；已剔除 SDK 运行态标识文件 `.claude.json`/backup/`.last-cleanup`，仅保留会话原件 `ans/replay.jsonl`、`native/projects/*.jsonl` 与全部证据）

| 内容 | 位置（节选） |
| --- | --- |
| attempt 2 驱动逐行日志 / 汇总 / 控制台 | `attempt2/drive.jsonl`、`attempt2/summary.json`、`attempt2/driver-console.log` |
| attempt 2 关键原件 | `attempt2/product-sdk-tool-facts.json`（SDK 会话中 4 个工具调用入参 + 4 条结果原文，含 MCP -32602 全文）、`attempt2/delivery-first-user-message.txt`、`attempt2/product-final-message.txt` |
| attempt 2 账本/日志 | `attempt2/tasks.jsonl`、`attempt2/chief.jsonl`、`attempt2/product.jsonl`、`attempt2/diagnostics/` |
| attempt 2 状态 | `attempt2/operations-inventory.json`（[]）、`attempt2/target-git-status-post.txt`、`target-git-refs-post.txt`、`target-git-log-post.txt`、`target-rr-git-note.md`、`attempt2/init-source-82deb9a2….json`、`attempt2/run-manifest.json`、`attempt2/project.json`、`attempt2/governance-boundary.yaml`、`attempt2/bootstrap-manifest.md` |
| attempt 2 会话原件 | `attempt2/sessions/product/…`（`ans/replay.jsonl`、SDK native `projects/*.jsonl`）、`attempt2/sessions/chief/…` |
| attempt 2 UI | `attempt2/ui-01-imported.jpeg`～`ui-06-final.jpeg`、`ui-0*-body.txt`；导入失败轮 `drive-importfail*.jsonl`/`import-round*.txt` |
| attempt 1（fixture 缺陷，披露） | `attempt1/drive.jsonl`、`attempt1/product-sdk-tool-facts.json`、`attempt1/repro-call-context.json`、`attempt1/tasks.jsonl`、`attempt1/product.jsonl`（含 `.ans/sessions/.../reports/*.json` 报告原件）、`attempt1/stop.log`、`attempt1/target-state-attempt1.log` |
| 开工/稳定性 | `00-opening-state.log`、`00-env-and-inputs.log`、`01-scope-status-opening.txt`、`pre-*`、`post2-*`、`01-renderer-dist-sha256.txt` |
| 预检/治理 | `precheck.log`（两 target 同名于 `attempt2/`）、`establish.log`（同上） |
| 索引 | `evidence-index.md` |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

## 10. 纪律声明

- 只写 `角色卡/测试/docs/change/` 本记录与同名证据目录、仓库外临时根；未修改 `src/ app/ test/ docs/`、角色卡/边界/YAML、方案/B1/团队计划/派发记录。
- 未 commit/push/暂存/合并/发布；未 `npm install`；未读/打印/复制 `.env` 值；未改既有项目（目标项目为仓库外新建临时目录）；未改仓库 `app/main.ts`。
- 运行前后候选聚合与 `src app test` manifest 逐字节一致（§1）；应用/驱动/浏览器进程无残留、9222 端口已关闭。
