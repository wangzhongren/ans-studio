# D2 真实试跑方法 A：验收判断的提案物证路径修复（acceptance-evidence-path）

- **任务 ID**：`2026-11-01-acceptance-evidence-path`（T2）
- **记录角色**：测试（Testing）
- **节点**：**D2 真实试跑方法 A**（团队计划 §5.1/§5.3；方案 P1.2 §5.4；V1 §3.8；AC-8）
- **日期**：2026-11-01
- **状态**：**D2-complete（方法 A 已执行并取证）**；D2 视角 **AC-8 = pass**（最终判定属 E2 内置独立验收）。未 commit/push/merge/release；未改产品代码/测试/角色卡/边界。
- **授权依据**：
  - 客户闸门 1 已授权方法 A（沟通记录 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md` 的「闸门 1 记录」；方案 P1.2 §5.4/§10 第 3 项；V1 §3.8；团队计划 §2.2/§九.8：执行时需试跑项目所有者/客户现场确认）。
  - 本节点派发卡（统筹）明确：应用启动/停止与试跑项目别名临时移出/还原是**本节点经授权的验证动作**（产品代码不碰别名）。据此执行；未另行单独联系客户——按派发卡记录如实说明。
- **输入绑定（D2 实测哈希，证据 `33-input-binding.log`）**：
  - 方案 P1.2：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）
  - V1：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`）
  - 团队计划：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）
  - B0：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（261 行 / `147c04fd…`）
  - A1：`角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md`（121 行 / `92151e9d…`）
  - A2：`角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md`（147 行 / `7964d5fb…`）
  - D1：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md`（206 行 / `f3654135…`）
- **证据目录（仓库外）**：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\D2\`（下称 `$D2`；清单见 §七）。
- **环境**：Windows 11 Pro 10.0.26300（MINGW64 / Git Bash 5.3.15）、Node **v24.22.1**、npm 11.19.1、Git 2.55.0.windows.5；D2 执行窗口 2026-11-01T10:11+0800 – 10:29+0800。

---

## 一、阶段 0：现场可行性（只读核查，结论 PASS）

详细证据：`$D2/00-environment.txt`、`01-worktree-baseline.log`、`02-trial-baseline.log`、`03-app-process-before.log`、`04-model-and-switches.log`、`05-phase0-conclusion.log`。

### 1.1 试跑项目事实（`C:\Users\51054\Desktop\work\trial-shell-escalation`）

| 项 | 实测 | 对照 |
| --- | --- | --- |
| 别名 `docs/proposals/textkit-cli-v1.md` | 存在；7,035 B；`sha256=d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef`；mtime 2026-11-01 09:17:38.479838900 +0800 | 与 B0 一致 |
| 真提案 `docs/proposals/textkit-cli-proposal-v1.md` | 存在；15,952 B；`sha256=a2bdbee2882d788947808743d7d2a6d1e053ed97035df907012b34d60d4ce185` | 与 manifest 钉住值一致 |
| run manifest `.ans/runs/run-20261101-textkit-cli-87325f96/manifest.json` | `sha256=c7fcfbf2a057115bd75370f5aa82e7dcd7ac36cf77e8c1d89f9d51c4f5a97b36`；`state=pinned`；`runId=run-20261101-textkit-cli-87325f96`；`documents.proposal.path=docs/proposals/textkit-cli-proposal-v1.md` | 与 V1 §4.5 预期一致 |
| `.ans/state/tasks.jsonl` | 74 行；`sha256=72d7bf9c04bb9b82b857945165de1e80a5387f04cbaf01d4c32d7e4e77c717d7`；`request.created=7`、`request.resolved=7`（无挂起卡） | 最近一次验收 `req-6dc353d878405acc` 于 2026-11-01T01:19:00.208Z 由 `judge:pi` 接受 |
| 验收卡发起机制 | 角色会话经 `request_choice` 工具发起（试跑中由 verifier 发起；卡片生命周期由应用写入 tasks.jsonl） | 可再次发起：应用可恢复 verifier 会话并接收客户消息 |
| 是否需要真实模型/客户点击 | 需要模型（verifier 轮次 + judge 决策均走 pi 运行时）；「替我决策」开启时客户无需点击（judge 代批） | 网关可达（§1.3） |
| Git 状态 | 仓库无提交（`## No commits yet on main`），全部文件未跟踪 | 方法 A 只移动别名文件本身；应用/角色自身写入属验证固有行为（§五） |
| 证据文件 | `docs/quality/textkit-cli-report-v1.md`（23,931 B / `sha256=eb1b18c00317b49858e60ff2925d295b3572a0d10a7274fcaaca9df4857dcf1e`）、`docs/intents/textkit-wc-cli.md`、`docs/product/textkit-cli-intent-v1.md` 存在 | — |

### 1.2 应用现场（修复前实例）

- 旧 ANS 实例：PID **21192**（父 node 72092），命令 `...\flow-improvements-wave1\node_modules\electron\dist\electron.exe app/main.ts --remote-debugging-port=9235`，启动 **2026-11-01 08:53:09**；子进程 33092/77896/4612；userData=`C:\Users\51054\AppData\Roaming\Electron`；CDP 9235 活动，页面标题「ANS 治理会话工作台」；**当前未加载项目（projectRoot=null）**；运行的是**修复前代码**（早于 A1 修改）。
- 无关 Electron：PID 34404（network-monitor worktree 的 `test/桌面UI/phase5a-electron-smoke.mjs`）及子进程 11492/41000 —— **未触碰**（全过程停止/启动前后均核对）。
- 驱动能力（只读验证）：渲染层 `window.__ansRenderer` 与 `window.desktop` 均存在；`loadProject`/`selectRole`/`sendSession` 链可用；`preferences.json` 为 `{"version":1,"locale":"zh-CN","judgeSwitches":{"approval":true,"decision":true}}`（与试跑相同，「替我审批/替我决策」均开启）；`runtime-selection.json` 对试跑项目记录 `runtime=pi`。
- 重启可行性：Electron 44 原生 TS 直接加载 worktree 源码（主进程 `app/main.ts` → `app/desktop/session.ts`），`npm run build:renderer` 产物为渲染层；候选身份见 §二。

### 1.3 模型运行时

`.env`（仓库根，main.ts 启动载入 `process.env`）：`ANTHROPIC_AUTH_TOKEN`（已设置，len=30，未回显）、`ANS_PI_BASE_URL=https://aiproxy2.abujlb.com/deepseek`、`ANS_PI_MODEL=deepseek-v4-flash`、`ANS_PI_REASONING_EFFORT=high`。网关连通性：origin `HTTP 200`；无凭据 `POST /deepseek/v1/messages` 返回 `HTTP 401`（符合预期）。试跑于 08:57–09:19 以同一配置完成多轮模型调用。

### 1.4 停止条件核对与结论

- 可再次发起验收卡：机制、现场状态与驱动通道均成立（无挂起卡；verifier 可恢复；应用/渲染桥可用）。
- 可以候选重启并驱动验收：成立（进程重启 + CDP + 渲染桥 + 模型网关）。
- 授权：见报告头（闸门 1 + 派发卡）；按派发卡记录执行。
- **结论：PASS，进入阶段 1**。残余风险（如实记录）：verifier 模型是否按指令重发、judge 模型输出波动、恢复态会话耗时不确定；若模型侧始终无法发起，则按 insufficient evidence 记录，不伪造。

---

## 二、阶段 1：候选构建与应用身份

### 2.1 候选身份（D2 前后两次复算一致，证据 `01-worktree-baseline.log`、`32-final-worktree-check.log`）

| 文件 | `git hash-object` | SHA-256 |
| --- | --- | --- |
| `app/desktop/session.ts`（A1 改，489,820 B / 7,794 行） | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` |
| `src/common/编排/governance-judge-facts.ts`（A2 改，17,457 B） | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` |
| `test/桌面应用/acceptance-proposal-path.test.ts`（新增） | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` |
| `test/编排/governance-judge-facts.test.ts`（新增） | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` |
| `test/编排/acceptance-judge-minimal.test.ts`（更新） | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` |

- HEAD `eb77fadafc4df40594938798645da111665027c3`（D2 全程未变）；`git diff --cached --name-only` 为空；`git status --short -- src app test` 恰为上述 5 个候选路径（与 D1 一致，D2 未新增产品/测试改动）。

### 2.2 构建与启动

| 项 | 实测 | 证据 |
| --- | --- | --- |
| 旧实例停止 | 10:14:06 `taskkill /PID 21192 /T /F`：33092/77896/4612/21192 全部终止；CDP 9235 关闭；network-monitor 进程保持 | `10-stop-old-instance.log` |
| 渲染构建 | `npm run build:renderer` exit 0（vite 8.3.4，2793 modules，built in 351ms）；产物 `index.html` `b8a8de3b…`、`index-1P177gky.js` `2e0cec06…`、`index-CWivz_4o.css` `2da0e4c5…`、icon `ff88e313…`，与 D1/B0 一致（文件名/哈希不变） | `11-build-renderer.log` |
| 启动命令 | `node node_modules/electron/cli.js app/main.ts --remote-debugging-port=9235`（worktree 根；与旧实例命令等价） | `13-candidate-launch.log` |
| 新实例 | 主进程 **PID 23844**（父 node 43148），启动 **2026-11-01 10:14:26**；命令 `...\flow-improvements-wave1\node_modules\electron\dist\electron.exe app/main.ts --remote-debugging-port=9235`；userData=`C:\Users\51054\AppData\Roaming\Electron` | `13-candidate-launch.log` |
| 驱动方式 | CDP `http://127.0.0.1:9235`（`/json/version`：Electron **44.7.0** / Chrome **152.0.7977.130**）；渲染层 `window.__ansRenderer` + `window.desktop`；自写仓库外 `cdp-eval.mjs` 执行受控表达式 | `13-candidate-launch.log`、`$D2/cdp-eval.mjs` |
| 主进程候选 | 启动时 `session.ts` sha256=`d60ba7c8…`、`facts.ts` sha256=`e3ed3ad1…` 与候选一致；启动时间晚于 A1/A2 修改与 D1；本次行为的区分力见 §三.5 | `13-candidate-launch.log`、`32-final-worktree-check.log` |
| 打开试跑项目 | `loadProject("C:/Users/51054/Desktop/work/trial-shell-escalation")` 成功：`primaryRoleId=chief`、8 角色（chief/product/rapporteur/nominator/convener/verifier/cli-implementer/env-bootstrap）、`activeRuns` 含 `run-20261101-textkit-cli-87325f96`（state=pinned） | `14-load-project.log` |
| runtime 与开关 | `selectRuntime("pi")` 成功（`runtime=pi`）；`shellJudge`（替我审批）`available=true/enabled=true`；`decisionJudge`（替我决策）`available=true/enabled=true` | `14-load-project.log`、`29-app-final-state.log` |
| 启动恢复行为 | 应用自身 recovery 返回 `{projectRoot: 试跑项目, roleId: cli-implementer, runtime: pi}` 并自动加载/选角（与本节点显式加载产生竞态，见 §五.1） | `23-probe-sessions.log` |
| 结束状态 | 10:28:46 以 `taskkill /PID 23844 /T /F` 停止候选实例；CDP 关闭；无 `app/main.ts` Electron 残留；network-monitor 进程未动 | `30-app-stop.log` |

> 重启命令（供后续复用）：在 worktree 根执行 `node node_modules/electron/cli.js app/main.ts --remote-debugging-port=9235`。D2 结束时应用已按授权停止。

---

## 三、阶段 2：方法 A 执行与结果

### 3.1 时间线（本地 +0800；台账时间为 UTC，括号内为对应本地时间）

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 10:14:06 | 停止修复前旧实例（PID 21192 及其子进程） | `10-stop-old-instance.log` |
| 10:14:19 | `npm run build:renderer` exit 0（候选渲染产物与 D1 一致） | `11-build-renderer.log` |
| 10:14:26 | 候选实例启动（PID 23844） | `13-candidate-launch.log` |
| 10:14:52 | 试跑项目加载、runtime=pi、verifier 会话已打开、判断开关均可用且开启 | `14-load-project.log` |
| **10:17:53** | **别名移出 `docs/proposals`**（→ `$D2/alias-moved/textkit-cli-v1.md`）；移出前后 sha256 均为 `d6cad5f2…`（7,035 B） | `20-alias-move.log` |
| 10:18:03 | 发送前台账：tasks.jsonl 74 行 / `72d7bf9c…` | `21-pre-send-ledger.log` |
| 10:18:03 → 10:20:16 | 第一次向 verifier 发送重发指令**失败**（`ok:false`「会话尚未开启（点击左侧角色即可开启）。」）；**未产生任何 request 事件**（台账仍 74 行） | `22-send-result.log` |
| 10:21:06 | 只读探针确认：启动恢复态覆盖了选择（selected=cli-implementer），verifier 不在 live 会话；随即重新打开 verifier 会话并发送 | `23-probe-sessions.log` |
| 10:21:52（02:21:52Z） | 重试发送**成功**（`ok:true`、`inputAccepted:true`、`turnId=8d12f5e4-bec0-4885-b7e3-3146e949aeea`） | `24-send-retry.log` |
| **10:22:03.431（02:22:03.431Z）** | 新验收卡 `request.created`：`requestId=req-bbeb75a3009b6c32`、`cardKind=acceptance`、`flowId=textkit-cli`、`intentId=textkit-wc-cli`、`sourceRoleId=verifier`；选项 `accept`/`reject` | `25-new-request.log` |
| 10:22:13.111（02:22:13.111Z） | `request.presented` → `judge` | `25-new-request.log` |
| **10:22:13.112（02:22:13.112Z）** | **`request.resolved`：`by=judge`、`operatorId=judge:pi`、`choice=accept`、`judge.reasonCode=sufficient`**；`decisionId=decision-req-bbeb75a3009b6c32` | `25-new-request.log`、`26-resolved-parsed.json` |
| 10:22:23 | verifier 轮次结束（turn.end 8d12f5e4…），报告回执写入（确认别名不在且卡已发出、judge 代批 accept） | `31-verifier-receipt.log` |
| 10:22:29 | 应用在 chief settle 后重写试跑项目 `.ans/project.json` 与 `docs/bootstrap-manifest.md`（时间戳刷新，pin 哈希未变；见 §五.2） | `28-post-restore-state.log` |
| **10:27:21** | **别名按原字节还原**至 `docs/proposals/textkit-cli-v1.md`；还原后 sha256=`d6cad5f2…`（与移出前一致）、7,035 B、mtime 保持 09:17:38.479838900 | `27-alias-restore.log` |
| 10:27:44 | 还原后状态：tasks.jsonl 80 行 / `684860e6…`；真提案、manifest、质检报告哈希均未变；别名之外 `docs/proposals` 无新增 | `28-post-restore-state.log` |
| 10:28:46–10:28:52 | 停止候选实例并核对环境（CDP 关闭；network-monitor 未动） | `30-app-stop.log` |

**顺序核对**：别名移出（10:17:53）**早于**请求创建（10:22:03）与判断（10:22:13）；别名还原（10:27:21）**晚于**判断完成——符合方法 A 的证据时间线要求。

### 3.2 别名移出与还原（sha256 前后一致）

| 检查 | 结果 |
| --- | --- |
| 移出前 `sha256` | `d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef`（7,035 B） |
| 移出目标 | `$D2/alias-moved/textkit-cli-v1.md`（不参与扫描；同卷 rename） |
| 移出后 `docs/proposals/textkit-cli-v1.md` | **ABSENT**；目录内仅 `textkit-cli-proposal-v1.md`（`a2bdbee2…`）、`textkit-cli-modules-v1.md`、`textkit-cli-roster-v1..v7.md`；无 `-proposal-v2+` |
| 移出期间文件 `sha256` | `d6cad5f2…`（未改内容） |
| 还原后 `sha256` | `d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef`（**与移出前一致**）；7,035 B；mtime 保持原值 |
| 真提案 / manifest（还原后） | `a2bdbee2…` / `c7fcfbf2…`，均未变 |
| 别名创建/恢复责任 | verifier 报告回执明确「未创建/恢复/修改它」；产品代码不碰别名（本节点仅执行授权的移出/还原） |

### 3.3 新 `request.resolved` 关键字段（原文摘录见 `25-new-request.log`；解析见 `26-resolved-parsed.json`）

| 字段 | 值 |
| --- | --- |
| `requestId` | `req-bbeb75a3009b6c32` |
| `at` | `2026-11-01T02:22:13.112Z`（本地 10:22:13） |
| `cardKind` / `intentId` | `acceptance` / `textkit-wc-cli` |
| `by` / `operatorId` | **`judge`** / `judge:pi` |
| `choice` / `selectedOptionIds` | **`accept`** / `["accept"]` |
| `judge.reasonCode` | **`sufficient`** |
| `judge.group` / `engine` | `decision` / `pi` |
| `judge.durationMs` / `readCalls` / `readBytes` | 9,675 / 2 / 9,027 |
| `decisionId` | `decision-req-bbeb75a3009b6c32` |

`judge.evidence`（原文，逐条）：

1. `docs/intents/textkit-wc-cli.md（acceptance 1..5 与本次验收范围逐条对应；confirmed=true）`
2. **`docs/proposals/textkit-cli-proposal-v1.md（方案 AC-1..AC-5、nonGoals 与意图一致，无越界范围/新授权）`**
3. `docs/quality/textkit-cli-report-v1.md（AC 5/5 通过：plain 3/6/35、empty 0/0/0、no-trailing 2/3/16、utf8 2/5/16；tests 16/pass 16/fail 0；O1/O2 不阻断）`
4. `docs/contracts/textkit-cli-architecture-v1.md（§6 统计口径为唯一基准，验收与此一致）`
5. `packet.integrity.complete=true, conflicts=0, intent.confirmed=true, cardOptionIds=[accept,reject]`

核对结果：`judge.evidence` **含** `docs/proposals/textkit-cli-proposal-v1.md`（真实提案），**不含** `docs/proposals/textkit-cli-v1.md`（别名）；`reason` **不含**「物证不可读」；`integrity.complete=true`、`conflicts=0`。评语（`reason`）末尾明确「最小抽查集两份物证已实际读取」「按 intent 正向代批 accept」。

### 3.4 verifier 侧交叉确认（`31-verifier-receipt.log`）

试跑项目写入的报告回执（`.ans/sessions/verifier/pi/ans/reports/0f5c642ec0d87aa3fff6883bb22063e034e305e46b8d9ff3a161eac89df8c371.json`，sha256 `a3eb9ac0…`）记录：

- 「确认 `docs/proposals/textkit-cli-v1.md` 当前确不在 `docs/proposals/` 下（客户授权临时移出，属预期），我未创建/恢复/修改它」；
- 「`request_choice(cardKind=acceptance, flowId=textkit-cli, intentId=textkit-wc-cli)` **已成功发出**……即在该入口文件缺失的情况下卡未被挡，正常送达」；
- 「裁决结果：……判断 agent（替我决策，operator:judge:pi）**代批 accept（验收通过）**，D3 decisionId=decision-req-bbeb75a3009b6c32；这是 judge 代批，不是客户本人点击」。

### 3.5 区分力（为什么这是修复有效的证据，而非别名兜底）

- 别名在**请求创建与判断时均不在** `docs/proposals`（移出 10:17:53；请求 10:22:03；判断 10:22:13），且移出期间无人恢复（verifier 回执确认）。
- 修复前代码固定使用 `docs/proposals/<flowId>-v1.md`（=别名路径）；在别名缺失时证据包会 `artifact-missing`「物证不可读」并 fail-closed（`manual` → `declined`）。本次观察到**证据包完整（integrity.complete=true）且 judge 以真实提案路径为物证 accept**，只能由候选修复（pinned manifest `documents.proposal.path` 优先）解释。
- 未使用方法 B、未关闭「替我决策」、未由客户手批；方法 B 未执行（无必要）。

---

## 四、AC-8 结论（D2 视角）

**AC-8 = pass**（本节点证据；最终判定属 E2）。对应 V1 §3.8 所需记录字段：

| 要求 | 实测 |
| --- | --- |
| 新 `request.resolved` 请求 id 与时间 | `req-bbeb75a3009b6c32`，`2026-11-01T02:22:13.112Z` |
| `by=judge` / `choice=accept` / `judge.reasonCode=sufficient` | 全部满足 |
| `judge.evidence` 引用真实提案、不含别名 | 满足（含 `docs/proposals/textkit-cli-proposal-v1.md`；不含 `docs/proposals/textkit-cli-v1.md`） |
| 无「物证不可读」 | 满足（reason 无该字样；integrity.complete=true） |
| 验收流程未被错误自动决策拦截 | 满足（judge 代批 accept，验收流程完成） |
| 别名移出/还原 sha256 一致 | 移出前/还原后均 `d6cad5f2…`（7,035 B） |
| 候选版本 | HEAD `eb77fad`；`session.ts` `ca3d96b3…`/`d60ba7c8…`；`facts.ts` `49b960c3…`/`e3ed3ad1…`；渲染构建与 D1 一致 |
| run id 与 manifest 事实 | `run-20261101-textkit-cli-87325f96`；`state=pinned`；`documents.proposal.path=docs/proposals/textkit-cli-proposal-v1.md`；manifest `c7fcfbf2…` |
| `tasks.jsonl` 原始摘录 | `$D2/25-new-request.log`（created/presented/resolved 原文）；解析 `$D2/26-resolved-parsed.json` |
| 试跑项目路径 | `C:\Users\51054\Desktop\work\trial-shell-escalation` |

---

## 五、偏差、限制与副作用（如实记录）

1. **启动恢复竞态（第一次发送失败）**：候选实例启动后，应用自身 recovery（`getRecoveryState` = `{projectRoot: 试跑项目, roleId: cli-implementer, runtime: pi}`）自动加载项目并选择 `cli-implementer`，与本节点显式 `loadProject`/`selectRole(verifier)` 并发；第一次发送在 verifier 会话已被恢复流程关闭后发生，返回「会话尚未开启」且**未产生任何 request 事件**（台账 74 行未变）。随后重新打开 verifier 会话并发送成功。证据：`22-send-result.log`、`23-probe-sessions.log`、`24-send-retry.log`。
2. **应用/角色自身的试跑项目写入（非本节点手工改文件）**：`tasks.jsonl` 74→80 行（6 条 `request.*`）；`chief`/`verifier` 会话 replay/日志、verifier 报告回执新增或更新；`.ans/project.json` 与 `docs/bootstrap-manifest.md` 于 10:22:29 由应用在 chief settle 后重写（生成时间刷新；pin 的三个边界文件哈希与内容未变）。`docs/quality/textkit-cli-report-v1.md`、`docs/proposals/textkit-cli-proposal-v1.md`、run manifest、别名内容均未变（哈希见 `28-post-restore-state.log`）。这些是「重新发起验收卡」的固有应用行为，不是产品代码碰别名，也不是本节点修改试跑文件。
3. **模型行为**：verifier 轮次约 5 分钟（发送 10:21:52 → turn.end 10:22:23；`sendSession` 回执 10:26:57 返回 `outcome=completed`）；judge 9.675 秒、读 2 次/9,027 字节。依赖外部网关（`deepseek-v4-flash`），网关/模型波动会影响可复现性。
4. **应用最终状态**：D2 结束时候选实例已停止（授权动作）；环境中无 ANS 应用实例（修复前旧实例已停止，未恢复旧代码）。重启命令见 §二。network-monitor 冒烟进程未受影响。
5. **未执行项**：方法 B（仅补充，无需）；客户手批（禁止作为证据）；全量回归（T2 不默认要求，且 D1 已提供补充证据）。
6. **限制**：D2 只对本次试跑轨道与当前候选负责；候选/输入/依赖变化即失效。AC-8 最终判定与总体通过/返工由 E2 按 V1 判定；本报告不是验收报告。
7. **未提交/未发布**：未 commit/push/merge/release；未使用 stash；未暂存文件。

---

## 六、写入边界与无产品改动声明

- **仓库内写入**：仅本文件（`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D2.md`）。未新增/修改 `test/测试/` 用例（团队计划 §4.3 测试角色默认不加）。
- **仓库外写入**：`$D2` 证据目录（日志、解析 JSON、CDP 驱动脚本）与试跑项目别名的临时移出/还原。
- **未写**：产品源码（`app/**`、`src/**`）、测试（`test/桌面应用/**`、`test/编排/**`）、构建/锁/发布配置、`src/common/shared/**`、角色卡/边界/YAML、`docs/scheduling|acceptance|communication|planning/`；未修改试跑项目其它文件（应用/角色自身写入见 §五.2）。
- **写集核对**：`git status --short -- src app test` 恰为 5 个候选路径；`git diff --cached --name-only` 为空；候选哈希与 D1 一致（`32-final-worktree-check.log`）。
- **纪律**：未 commit / 未 push / 未合并 / 未发布；未新增 skip/todo；未删除/放宽断言；未伪造命令、输出或哈希。

---

## 七、证据清单（仓库外 `$D2`）

清单文件：`$D2/evidence-manifest.txt`（含行数/字节/sha256）。关键文件：

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment.txt` | 6 | `cbbf3fc2fa92c7e9bb40eac49be173402ce85e836babdabee296b2010a829ebf` |
| `01-worktree-baseline.log` | 37 | `f0c3ea05683dce0da23a95b010ecf8374810273c3aac971a1be58f60c310653a` |
| `02-trial-baseline.log` | 59 | `7535be8062cb3fe89bbaa13c7a1ed57488418eca094f8fbabdebe402e6613ac2` |
| `03-app-process-before.log` | 38 | `c599bc21097419cbf6e0561a2ebd248bbe350b69491a1ff0b359ba4a934bd9a6` |
| `04-model-and-switches.log` | 14 | `540bcaec291def265013e7f47b9aab7b28163dae0c5ece5d489ca0c14e45dd7e` |
| `05-phase0-conclusion.log` | 31 | `60a71f206238fb8eeeab7ce922d3a2ee6ea921f9c68e9f4b2509759fb68bc8f2` |
| `10-stop-old-instance.log` | 25 | `f84268b2cc8b00bcb98ec38f4814d5019711a81a4c705641922e413adcd1678e` |
| `11-build-renderer.log` | 46 | `3fab017841ae7ac340190f5c04042e5ff340ef904be7191647041555a7c44bcd` |
| `12-app-stdout.log` | 51 | `f01fba2cf0dcabaec888e3bae932d740f38b8e6ae0f2b2e1e9f7ea251550956d` |
| `13-candidate-launch.log` | 49 | `93cab2a4da4a16cf5ede24411fece4be44355736ace2ae837cb7c35543d3ace3` |
| `14-load-project.log` | 100 | `62d603f52dbf2f600a2000ff043660554f97fe42259b14b54398b8b3b3e276f0` |
| `20-alias-move.log` | 32 | `e98e31341113cffe7f492bfb41a594acb7c55185c2d7d4d2e373556ad74d39f2` |
| `21-pre-send-ledger.log` | 4 | `d4bf58192b3595f53e8469cc9bc6e2fa7ed551f904f6e27617210954fc93c817` |
| `22-send-result.log` | 27 | `0a482f6a314001f034706d8ca6da61d7d5fbc439a1f2a85ad2993c87c53907d1` |
| `23-probe-sessions.log` | 103 | `9045309c510a4cbb335783152a99e88bc3301e1094795e519d711f8aeb10003d` |
| `24-send-retry.log` | 44 | `be5b16bd190e5084937a952dcae5222a896d1520174055966982206466f3a548` |
| `25-new-request.log` | 6 | `813e9ee1d036b4f2dbd544558d1e4c2cc00044e66e93ea00896e1ba605cb6301` |
| `26-resolved-parsed.json` | 27 | `5afc7e41bd5967357a25854043465cc867d4e1f6bae71cd6cdd0bdc346f29d32` |
| `27-alias-restore.log` | 22 | `246bf280b85777023bf66fcef08c2b2ececc9291562eda1c5e01876f15eb5202` |
| `28-post-restore-state.log` | 46 | `049f03490ba3d8faaab7c7acb37cd53c76c665cd67db8c305e858a831e67e996` |
| `29-app-final-state.log` | 44 | `bfc9440e14f33419401312a912fdd07a59e409f4f69ac85f174506a5afd9e66a` |
| `30-app-stop.log` | 18 | `64289765a83ffa018a79036abf24d8a2366caf65fba9dc49a6a547fb7f8c7a0f` |
| `31-verifier-receipt.log` | 5 | `bdf7f1b5a4acd2fbe16df75391dcce0c52b5edb5453d2313c5f1953867e54139` |
| `32-final-worktree-check.log` | 20 | `be59bf30de43adc3550041594513df0e5956b6309b5d44978c4d7f51cf67685a` |
| `33-input-binding.log` | 8 | `6b17ce1383babea497deb1990b8c61b1c5467bd817ae220aba4a62fa813e80bb` |
| `cdp-eval.mjs` / `expr-*.js` | — | 驱动脚本（`evidence-manifest.txt` 列出全部哈希） |

清单文件自身：`evidence-manifest.txt`（34 行 / `sha256=7a25ab697578539c94d48f750ebd9e8eb61074286efc9bdf42a2c930547c9818`）。

> 路径、行数、SHA-256 均可在 `$D2` 复核；若证据目录事后被追加/改写，以文件自身哈希为准。

**本文件状态：D2 节点交付记录；AC-8（D2 视角）按方法 A 观察到 pass；不代替 E2 验收判定，不授权提交/推送/合并/发布。**
