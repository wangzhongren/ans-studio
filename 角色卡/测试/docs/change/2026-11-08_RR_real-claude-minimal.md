# 变更记录：RR 真实 Claude 最小运行（2026-11-08）

- 任务节点：**RR 真实运行最小验证**（团队计划 §5.1/§5.5；P1.3 §6.2 / B1-EV5 预算与纪律；派发记录 `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §三/§五）
- 角色：测试（独立上下文；**只取证，不判验收**）
- 日期：2026-11-08（本地 12:48–13:02；UTC 04:48–05:02）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 仓库外运行根：`C:\Users\51054\Desktop\work\ans-dogfood-session-admission-2026-11-08\rr\`（临时目标项目/userData/启动器/驱动；未写既有项目）
- 纪律：未 commit/push/暂存；未改产品源码/测试/角色卡/边界/方案/验收/沟通/调度；未改仓库 `app/main.ts`；**只用仓库根 `.env` 既有凭据，未读取/打印/复制**；未新建 `test/桌面应用/` 文件；只写本记录与证据目录。

## 0. 结论摘要（先读；只陈述事实）

1. **AC-23 核心达成**：受保护目标项目（程序化建立并接受治理记录 + 父门派发写入 init-source → `required`）+ 真实 Claude + 真实桌面 UI：单条客户消息 → `dispatch_task` **父门受理** → `task.created` → **product 会话创建成功**（诊断 `session.open.ready roleId=product`，04:49:11.475Z）→ `task.delivered` → product 回合真实启动（`request.attempt.start` + 真实 Claude 对话/工具）。
2. **AC-24 部分达成**：product 回合执行只读 `git status` —— **0 张审批卡、执行成功**（经应用固定 Git 传输；审计 `branch:"c-allow"`、`by` 前缀 `ruleset:allow:readonly:git:status`、`readonlyGit.canonicalArgv` 记录）。非只读 `touch docs/product/rr-nonreadonly.txt` —— **未弹出审批卡**，被 **write-guard 硬拒**（`code: shell-write-outside`、理由 `file-gate-host-facts-unproven`、`branch:"write-guard:deny"`、零执行）。该硬拒是受保护范围 shell 显式写目标的既有 fail-closed 硬地板（shell 请求无 host-facts，`run-role.ts:2802` 同源），**不是**审批链故障；因此本轮**未观测到审批卡**，AC-24 的「非只读→卡」子项按 AC-25 回退确定性证据（D1-5/D1-7 覆盖 allow/deny/timeout/entry）。
3. **预算/纪律偏差（如实披露，见 §6）**：模型在同一 chief 回合内调用 `dispatch_task` **2 次**（第 1 次工具级 `chief-hub-flow-unavailable`，未创建任务；自行修正后第 2 次受理——应用处理器派发 1 次）；决定性结果后**驱动未停止**（我方停止条件缺陷），应用继续自主运行至 10 分钟预算：chief 追加 3 个请求回合、product 第 2 回合、并打开 worker/rapporteur/nominator/convener/verifier 会话两轮（04:53:33–43、04:56:30–45）。墙钟 发送→停止 ≈ **10m04s**（轻微超 10 分钟）；**无测试侧重发/重试、无追加客户消息（租 1 条）**。停止后驱动在 CDP 求值处挂起，被外层 timeout 终止；halt/stopSession 已成功，应用随后经 CDP `Browser.close` 优雅关闭；无残留 electron/端口。
4. **不宣称闭环**：不宣称审批卡真机、六角色闭环、Git 写/发布成功、长期稳定性；只承诺下文证据所示。

## 1. 输入与候选身份

| 项 | 值 |
| --- | --- |
| 设计 P1.3 | `docs/planning/2026-11-08_design_session-admission-approval-based.md` `2553b97a…`（855 行） |
| B1 v1 | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` `fb881126…`（185 行） |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` `19103fa2…` |
| 候选 | **38 文件**（`src app test` 41 项 − T1 3）；逐文件 SHA-256/`git hash-object`：`../2026-11-08_D1_cross-role-integration-evidence/post-fix-logs/candidate-hashes.tsv` |
| 候选聚合 | `<raw_sha256>  <path>` 整行 `LC_ALL=C sort` 后 SHA-256 = **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`**（`../…post-fix-logs/candidate-aggregate.txt`） |
| 稳定性 | RR 运行前后 `src app test` manifest 均 **1,077 文件 / `5308e71a80c93cc3091b09afa95be4f1687736982593f968eef7db01c0cfcd6f`**，diff 0 行；`git status --porcelain -- src app test` 与修复后候选逐行一致（`scope-status-diff-vs-candidate.txt` 0 行）；HEAD `a1b2f66`/tree `3aa82fb7…`/分支/T1 三文件不变 |
| 渲染入口（实际加载） | `app/renderer/dist/index.html` `fc24534e…`；`assets/index-DI9m2pZO.js` `bba9798f…`；`assets/index-sr7o4Da4.css` `cf07a5ab…`（`renderer-dist-sha256.txt`） |

## 2. 环境与运行前门禁

- OS Windows 11 Pro 10.0.26300 / Git Bash / Node v24.22.1 / npm 11.19.1；`node_modules/.bin/electron` 与 `node_modules/electron/dist/electron.exe` 存在；仓库根 `.env` 存在（**未读取/未打印/未复制**，仅由应用自身使用）。
- **目标项目（仓库外临时根）**：最小内容 + 一个项目角色 `worker`（role-card/boundary）+ `docs/intents/todo-cli.md` + `docs/product/`；真实 `git init`（初始提交）。
- **治理记录（程序化、产品自有代码）**：`src/common/编排/finalize.ts::establishGovernanceRecord({projectRoot, governanceModel:"trio"})` → `ok:true`，写出 `角色卡/governance-boundary.yaml`、`.ans/project.json`（`acceptance.accepted=true`，pin 2 条）、`docs/bootstrap-manifest.md`（`establish-governance.log`）。
- **审计门禁预检（与创建准入同一 file sink probe，含一次 refresh 重试）**：真实 `assembleOperatorShellGate` + `probeShellApproval` → `facts.audit = {sink:"file",durable:true,probe:"unknown"}`、`probed.audit.probe="ok"`、`verdict:"OK"`（`audit-precheck.log`）。
- 启动命令（cwd=仓库根）：
  `ANS_RR_USERDATA=<rr>/userData node_modules/.bin/electron <rr>/launcher.mjs --remote-debugging-port=9222`
  （`launcher.mjs` 仅 `app.setPath("userData")` 后 import 仓库真实 `app/main.ts`；未改仓库文件）。

## 3. 步骤（真实 UI 路径）

1. 应用以临时 userData 启动；真实 UI 点击「导入项目」（`#btn-import`）→ 系统目录对话框经 PowerShell 自动化选择仓库外目标项目（输出 `SELECTED … path=…\rr\target`）。
2. 点击「开始与 幕僚 对话」（`#btn-start-primary`）→ chief 会话 `session.open.ready`（04:48:46.573Z）。
3. 在真实输入框 `#inp-message` 发送**单条**客户消息（Enter；未重发）：要求 chief 派发 product，product 各执行一次 `git status`（只读）与 `touch docs/product/rr-nonreadonly.txt`（非只读），再 `submit_report`。
4. 观察事件/诊断/任务账本/目标项目审计，至预算边界；随后 `#btn-halt` + `window.desktop.stopSession({projectRoot})` + CDP `Browser.close`。

## 4. 预算与实测

| 项 | 预算 | 实测 | 偏差 |
| --- | --- | --- | --- |
| 客户消息 | 1 条 | **1 条**（UI Enter，04:48:46.528Z） | 0 |
| chief 回合 | 1 个 | 首个回合 1 个（`f1723cc0`）；决定性结果后应用自主继续：追加 3 个请求回合（`fdd7ae27`/`016b9d3a`/`6de74be7`） | **+3（测试侧未发起；驱动未在首个决定性结果处停止，见 §6）** |
| product 回合 | 1–2 个 | 2 个（`f027b1e9` 主回合；`3bd38730` 于 04:49:23 同任务重复报告） | 0（在上限内；重复报告异常见 §6） |
| `dispatch_task` 应用处理器调用 | ≤1 | **1 次**（`task.created` 恰 1 条）；模型侧同回合调用 2 次（第 1 次工具级 `chief-hub-flow-unavailable` 拒绝，未进应用处理器） | 应用侧 0；模型侧 +1 次尝试（如实登记） |
| 审批卡 | ≤2 张（只读 0 张） | **0 张**（只读 `git status` 0 卡；非只读 `touch` 被 write-guard 硬拒，不弹卡） | 卡未出现（原因 §5.2） |
| 墙钟 | ≤10 分钟 | 发送 04:48:46.5 → 停止 04:58:50.4 ≈ **10 分 04 秒** | **+4 秒**（驱动未提前停止；期间无模型请求，见 §6） |
| 自动重试 | 无 | 测试侧无重发/重试；模型侧 1 次自行修正参数/流程（同一回合） | 如实登记 |

## 5. 结果（事实）

### 5.1 派发受理 + product 会话创建成功（AC-23）

- 任务账本（`tasks.jsonl`，4 行）：`task.created`（04:49:11.396Z，`taskId=t-mw7crlr8-f32405f4`，`from=chief to=product flowId=todo-cli runId=run-hub-015b11b…`，`workSourceRef={sourceId:init-source-d0bbce16…, kind:chief-customer-turn}`）、`task.delivered`（to product）、`task.reported` ×2（product，`status:done`）。
- 初始化来源真实落盘：`target/.ans/trunk/initialization-sources/init-source-d0bbce16….json`（parent `{roleId:"chief", runtime:"claude", sessionId:"8800dce5…", turnId:"f1723cc0…", inputAccepted:true, settled:false}`；registration `native-directory-selection`）；运行 manifest `target/.ans/runs/run-hub-015b11b…/manifest.json`（`state:"draft"`，`builtinPreparationSource=init-source-d0bbce16…`）。
- 诊断：`session.open.start`/`session.open.ready` `roleId=product`（04:49:11.458/04:49:11.475Z）；`request.attempt.start` product `turnId=f027b1e9…`（04:49:11.527Z）→ **product 会话在受保护范围创建成功并真实启动回合**（`diagnostics-timeline.json`）。
- 模型侧首个 `dispatch_task` 被工具业务拒绝一次：`chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务`（chief.jsonl 04:49:07.779Z；未建任务、无 .ans 副作用），模型在同回合内修正后重新调用（04:49:11.293Z）→ 受理。

### 5.2 product 回合的两条命令（AC-24 部分）

- **只读 `git status`**：`run_shell` 工具事件 `accepted/completed`（04:49:14.361Z）；工具回执经固定 Git 传输执行（product 报告：exit 0，stdout 含目标项目未跟踪文件；不按 PATH 查找程序）。审计记录 1（04:49:14.235Z）：`conclusion:"allow"`、`branch:"c-allow"`、`by:"ruleset:allow:readonly:git:status（su 审批档）"`、`readonlyGit:{id:"status",canonicalArgv:["status","--porcelain=v1","-z","--untracked-files=normal","--ignore-submodules=all","--"]}`、`entry:"run_shell"`、`roleId:"product"`、`conditions:["shell-gate"]`。**0 张审批卡**（`onShellConfirm` 全程 0 事件）。
- **非只读 `touch docs/product/rr-nonreadonly.txt`**：`run_shell` 工具事件 `denied/failed`（04:49:15.664Z）；审计记录 2（04:49:15.659Z）：`conclusion:"deny"`、`branch:"write-guard:deny"`、`by:"write-guard"`、`execution:"未执行"`、`entry:"run_shell"`、`roleId:"product"`。product 报告原文：`code: shell-write-outside，审者 write-guard，理由 file-gate-host-facts-unproven`。**未弹审批卡**——受保护范围 managed host-facts 对 shell 显式写目标不可证，write-guard 先于分类/审批硬拒（fail-closed 既有硬地板；`run-role.ts:2802` 同一判据），因此审批卡子项未观测；目标项目无 `docs/product/rr-nonreadonly.txt`（拒绝零执行）。
- product `submit_report` 成功（`status:done`，含两条命令的真实回执/拒绝码/理由原文）。

### 5.3 审计与卡面事实

- 目标项目 `docs/audit/shell-gate.jsonl` 恰 **2 行**（上述 c-allow 与 write-guard deny），与 product 报告/工具事件一致；`onShellConfirm` 卡事件 **0**（`shell.card` 0 条，`cardHandled=0`）。
- 决定性结果（两条命令完成 + 报告 + 审计）在发送后 **≈47.9 秒**内全部出现（04:48:46.5→04:49:34.6）。

## 6. 偏差、异常与披露（不得隐藏）

1. **模型侧重复派发尝试**：同一 chief 回合内 `dispatch_task` 2 次（第 1 次 `chief-hub-flow-unavailable` 工具级拒绝，未创建任务；第 2 次受理）。应用处理器调用仍为 1；测试侧未重发消息或重试。如实登记为模型侧偏差。
2. **product 同一任务重复报告**：`task.reported` 2 条（04:49:23.167Z 与 04:49:34.604Z；第二条自述「同一任务编号的重发」）；账本仅 1 条 `task.created` + 1 条 `task.delivered`。属 product 侧重复报告（模型行为/投递重复呈现），非任务重复创建。
3. **驱动未在决定性结果处停止（我方缺陷）**：成功条件要求「审批卡已处理」（cardHandled≥1），而本轮无卡，驱动遂轮询至 10 分钟预算才停止 → 应用在决定性结果后继续自主运行：chief 追加 3 个请求回合（至 04:49:34.673Z 后无新的 `request.attempt.start`）、product 第 2 回合、并打开 `worker/rapporteur/nominator/convener/verifier` 会话两轮（04:53:33–43、04:56:30–45；**打开成功 = 受保护范围内这些会话也通过创建准入**，但无对应请求回合/任务，属脚本外行为）。期间**无额外模型请求**（`request.attempt.start` 止于 04:49:34.673Z）。墙钟轻微超预算 4 秒。
4. **停止阶段驱动挂起**：`#btn-halt`（04:58:50.367Z）+ `stopSession`（04:58:52.455Z，`ok:true`，关闭 3 个会话）成功后，驱动在后续 CDP `Runtime.evaluate` 挂起，被外层 `timeout` 终止（`summary.json` 未由驱动写出；本记录以 `drive.jsonl` 原始 671 行重建，见 `summary-reconstructed.json`）。应用随后由本角色经 CDP `Browser.close` 优雅关闭；复核实测：`electron.exe` 0 个、9222 端口已关闭。
5. **审批卡未真机观测**：见 §5.2；按 AC-25 回退确定性证据（D1-5/D1-7 覆盖卡 allow/deny/timeout、entry、writeGuard 注入与后台边界），**不宣称已真实验证卡面**。
6. **写目标硬拒不等于审批链失败**：`file-gate-host-facts-unproven` 是受保护范围 shell 显式写的既有硬地板；如后续需要「非只读→审批卡」的真机证据，应改用**非写类型**的非只读命令（如 `npm test`/脚本类 review）并由统筹另行授权一次最小预算；本轮未追加预算。
7. 真实模型行为具有单次观测随机性；本证据只覆盖本次候选/环境/输入下的观测结果，不代表普遍正确性；不宣称六角色闭环、Git 写/发布、长期稳定性。

## 7. 结论（只陈述事实，不判验收）

- **AC-23：本轮观测到完整正向链**（父门受理 + 任务创建 + product 会话创建成功 + 投递 + product 真实回合）；这是本变更的直接目标。
- **AC-24：只读 0 卡执行已观测；非只读审批卡未观测**（被写目标硬地板拒绝），按 AC-25 以确定性证据回退并如实披露。
- **AC-25：限制已如实记录**（审批卡不可稳定复现于本命令形态/预算；驱动停止缺陷与模型自行为如实披露）。
- B2 判定由内置独立验收按 B1 v1 作出；本角色不判验收、不宣称闭环。

## 8. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_RR_real-claude-minimal-evidence/`

| 文件 | 说明 |
| --- | --- |
| `drive.jsonl`（671 行） | 驱动逐步日志（UTC；含消息、事件、卡、审计轮询、停止） |
| `summary-reconstructed.json` | 由 drive.jsonl 原样重建的汇总（说明见文件内 note） |
| `driver-console.log` / `app-error.log` / `app-output.log` | 驱动/应用原始输出（应用仅 DevTools listening 行） |
| `establish-governance.log` / `audit-precheck.log` | 目标项目治理记录建立与审计门禁预检（probe ok） |
| `tasks.jsonl` / `chief.jsonl` / `product.jsonl` | 目标项目任务账本与角色日志原件 |
| `shell-gate.jsonl` | 目标项目 shell 审计原件（2 条） |
| `diagnostics/ans-diagnostics-2026-11-08.jsonl` + `diagnostics-timeline.json` | 应用诊断原件与关键事件时间线 |
| `screenshots/ui-01-imported.jpeg`～`ui-04-dispatch.jpeg` | 真实 UI 截图（导入 / 发送 / product 活动 / 派发结果；无录屏） |
| `target-state/{project.json,governance-boundary.yaml,trunk/initialization-sources/…,runs/…/manifest.json}` | 目标项目关键状态原件 |
| `renderer-dist-sha256.txt` / `scope-status-post-rr.txt` / `manifest-diff-post-rr.txt` | 渲染入口、候选稳定性 |
| `evidence-index.md` | 逐文件 SHA-256/行数/bytes 索引 |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

## 9. 纪律声明

- 只写 `角色卡/测试/docs/change/` 本记录与同名证据目录；未修改 `src/`、`app/`、`test/`、角色卡/边界/YAML、构建配置、`docs/scheduling|acceptance|communication|planning`。
- 未 commit/push/暂存/合并/发布；未 `npm install`；未读/打印/复制 `.env` 值；未改既有项目（目标项目为仓库外新建临时目录）；未改仓库 `app/main.ts`。
- 运行前后候选聚合与 `src app test` manifest 逐字节一致（§1）；应用/驱动/浏览器进程无残留、9222 端口已关闭。

- 证据索引 `evidence-index.md`：SHA-256 `2c7b03e9edf41e80d33aaa80295509d50ca79f7d0d9ed297dd26bf5433585124`（31 行 / 3117 bytes；25 个文件）。
