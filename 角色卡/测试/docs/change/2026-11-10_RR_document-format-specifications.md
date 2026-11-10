# 真实运行记录 RR：每个文档格式的权威说明与全员可读（T2）——真实 Electron + 真实模型 + 真实 UI（隔离 9223；2026-11-10）

- 角色：ANS 测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 轮次：**RR 第 1 轮（单轮，首果即停）**。**未完成 AC-12/AC-13/AC-14 的全部真实运行腿**：在「客户消息 → 幕僚派产品」的投递处被应用机械拒绝（`delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法`），按「首个决定性结果即 halt / 不自动重试 / 不追加预算」停止。**不构成候选 pass/fail 判定，也不得被 B2 当作真实运行通过证据。**
- 日期：2026-11-10（本地 00:50–00:54 +0800；UTC 2026-11-09 16:50:37–16:54:20）。
- 工作区（git worktree，真实应用入口）：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/document-format-specifications`；HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad26d768297cb076af4f8e24316c7d71b7`）。
- 运行根（仓库外）：`C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\`：`target\`（预置项目副本）、`userData\`（隔离 userData）、`rr\`（驱动/预检/后检脚本）、`evidence\`（过程证据）。
- 隔离：CDP **仅 9223**；**9222 全程 0 LISTENING**（预检/后检 + 运行期采样；9222 未被启动/占用/关闭）；**贪吃蛇运行根与 target 全程零触碰**（本记录不读取其任何文件，仅 netstat/tasklist 端口与进程检查）。
- 纪律：未修改仓库产品/测试/角色卡/其它文档（只写本记录与 `2026-11-10_RR_document-format-specifications-evidence/`）；未提交/推送/合并/发布；未运行 judge/提案卡等其它变更；未自动重试、未追加预算、未发第 2 条客户消息。

## 0. 结论摘要（先读；全部为事实陈述）

1. **决定性结果：投递机械拒绝（在到达产品之前）**。客户消息 1 条（16:51:07.192Z）→ 幕僚真实回合（`deepseek-v4-flash`）先 **真实调用 `doc_format`**（16:51:13.535Z，入参 `{"format":"project-intent/v1"}`，回执 2,162 B，首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`）→ 16:51:23/16:51:29 两次 `dispatch_task` 派产品；第 1 次为幕僚自身入参字段名错误（工具 schema 拒绝），第 2 次通过工具 schema 后**被应用在投递阶段拒绝**：
   > `dispatch_task：任务未能派发（回执：派发未投递：无法打开目标角色 产品 的会话（delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法）；未入队、未投递。请检查运行时配置后重试。）`
   应用账本同一时刻落 `task.reported / status=failed / summary="应用观察到失败：delivery-target-open-failed: delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法"`（16:51:29.700Z）。**产品未收到任务、未运行任何模型回合、未调用 `doc_format`、未写意图文档。**
2. **`prepareIntentConfirmation` 未被触发**：无产品意图文档字节 → 幕僚未发 `intent-confirm` 卡（其自述「没有可绑定的真实文档字节，发了就是伪造确认对象」）；意图确认门结果 = **未覆盖**。
3. **全员可读只取证到「会话注册/发现」层，未取证真实读取层（产品/项目角色腿）**：项目导入后 **14 个角色**（6 内置 + 8 项目角色）真实枚举；6 个内置角色会话均经真实 Electron `openSession` 打开（6 条 `session.open.ready`，16:51:06.820–16:51:07.062Z）；幕僚会话真实回合的原生 `prompt_snapshot`（58,145 B / SHA-256 `a047eeff…`）含 `doc_format` 的 promptGuidelines 三条（`hasDocFormatGuideline=true`）并**真实调用成功 1 次**。**产品真实读取 0 次、项目角色真实读取 0 次**（均未到达）；项目角色 `test-dev` 会话未打开、未注入查询。**不得把注册/枚举写成真实读取。**
4. **预算**：客户消息 **1/1**；客户面对卡 **0/≤1**；操作者直连项目角色消息 **0/≤1**；产品 `doc_format` **0/≤3**；项目角色 `doc_format` **0/≤1**；幕僚 `doc_format` **1**（非预算行，如实记录）；墙钟 **≈3 分 43 秒/≤20 分钟**（16:50:37Z 启动 → 16:54:20Z 进程树终止）；首果即停；0 自动重试；未追加预算。
5. **环境**：真实 Electron 44.7.0（本候选 worktree `app/main.ts`，入口 SHA-256 `339fcfaa…`）+ 真实模型调用（无桩）+ 真实桌面 UI；隔离 userData；CDP 9223。**模型如实披露：`.env` 实测 `ANS_CLAUDE_MODEL=deepseek-v4-flash`（`ANS_CLAUDE_REASONING_EFFORT=high`；`ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`），原生 `message.model` 亦为 `deepseek-v4-flash`——非 Anthropic Claude，本记录不宣称 Claude。**
6. **候选/manifest 稳定**：运行前后 `src app test` 11 文件、逐文件 raw SHA-256、聚合 `bcd3255392…`、manifest 1,113 文件聚合 `fc296e95…` **逐字节相同**；HEAD/tree/分支不变；`git status --porcelain` 全文 SHA-256 前后相同（`fullStatusIdentical=true`）。
7. **9222/贪吃蛇零触碰**：预检 9222 与 9223 均 0 LISTENING（当时贪吃蛇应用未运行）；运行期 9222 保持 0；后检 9222 0、9223 0 LISTENING（仅 TIME_WAIT）；无 Electron 进程残留。**未读写贪吃蛇运行根/`ans-game2d-snake-2026-11-09`（含 target）任何文件。**
8. **未伪造任何成功**：无产品意图文档、无 `prepareIntentConfirmation` 卡、无项目角色真实读取、无提案/任命/验收卡；幕僚如实将阻塞记入 `project note`（`pause-flow-dispatch-module-dir`，blocker）并停止。

## 1. 输入与绑定（写盘前实测）

| 项 | 实测 |
| --- | --- |
| B1 v1（唯一判据；§5 RR-1–RR-8、AC-12/13/14） | `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`：69,121 bytes / 483 行 / SHA-256 **`bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe`** |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`：15,475 bytes / 102 行 / `4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2` |
| 派发记录 | `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`：7,762 bytes / 56 行 / `afce6546723ee0c8ace5eda2b8941ca7369c626acd9eb95efece30300dee0c8f` |
| 方案 P1.2（§7.4/§4.2） | `docs/planning/2026-11-09_design_document-format-specifications.md`：146,555 bytes / 980 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54` |
| 复核 R1.1 | `docs/planning/2026-11-09_review_document-format-specifications.md`：82,067 bytes / 500 行 / `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05` |
| D1 v1.1 | `角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md`：42,274 bytes / 228 行 / `adc23f45f56f8cd16251e41756f9fce1b56430fadbf10b6add6e2cef3aec090f` |
| W5（跨角色确定性） | `角色卡/测试/docs/change/2026-11-09_W5_document-format-specifications.md`：10,883 bytes / 100 行 / `3fde941afc910793823faf2589c739b5ea6f363cbec92279b1227bb0e91dda81` |

## 2. 候选身份与稳定性（RR-8 基础；`pre/`、`post/`）

- **候选 11 文件**（`git status --porcelain -- src app test`，5 M + 6 新）：
  `app/desktop/session.ts`、`src/common/编排/doc-format-specs.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`、`test/桌面应用/session.test.ts`、`test/测试/doc-format-all-roles.test.ts`、`test/编排/doc-format-specs.test.ts`、`test/门禁引擎/doc-format-specs-pin.test.ts`。
- **聚合（定义：路径排序后 `path + "\0" + sha256` 串联的 SHA-256）**：运行前 = 运行后 = **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（`pre/candidate-sha256.txt` 与 `post/candidate-sha256-post.txt` 逐字节相同，SHA-256 均 `ad1959b2…`）。
- **manifest（`git ls-files -co --exclude-standard -- src app test`，1,113 文件 / 25,907,278 bytes）**：聚合运行前 = 运行后 = **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**；文本清单 SHA-256 前后均 `ff671d50fb7cd206a94b0fb2477a7aaa3a94b78b7fbb22f313bb0d7e587e021b`；文件计数 1,113 = 1,113。
- HEAD `3cd55dc…` / tree `e05d68ad…` / 分支不变；`git status --porcelain` 全文 SHA-256 前后相同（`pre/git-status-full.txt` = `post/git-status-full-post.txt`；`fullStatusIdentical=true`）。写本记录前仓库无新增改动。

## 3. 环境（RR-1）

| 项 | 实测 |
| --- | --- |
| 应用入口 | 本候选 worktree 真实 `app/main.ts`：83,599 bytes / SHA-256 `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`；经仓库外 `rr/launcher.mjs` 仅 `app.setPath("userData")` 后 `import()`，未改仓库代码 |
| 渲染面 | `app/renderer/dist/index.html`：SHA-256 `fc24534e8c6286ec6885511607f74a1f287ce809903c6636cb7d6db54738bfd1`（既有构建产物；本变更未触 `app/renderer/**`） |
| 运行时 | Electron **44.7.0**（`node_modules/electron/dist/electron.exe`）；驱动 Node **v24.22.1**；git 2.55.0.windows.5；Windows 11 Pro 10.0.26300 |
| userData（隔离） | `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\userData`（不写全局 `%APPDATA%/Electron`） |
| CDP | **仅 9223**（`--remote-debugging-port=9223`；主进程 PID 20860，DevTools 实测 `ws://127.0.0.1:9223/devtools/browser/…`） |
| 启动命令 | `ANS_RR_USERDATA=<run>\userData RR_REPO_MAIN=<worktree>\app\main.ts electron.exe <run>\rr\launcher.mjs --remote-debugging-port=9223`（cwd=worktree） |
| 模型（如实披露） | `.env`：`ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANS_CLAUDE_REASONING_EFFORT=high`、`ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`；原生 `message.model`=`deepseek-v4-flash`。**非 Anthropic Claude** |
| 端口预检 | 9222 = **0 LISTENING**、9223 = **0 LISTENING**（当时贪吃蛇应用未运行；本记录不据此推断其运行根状态） |

## 4. 预置项目角色（RR-2；准备不计预算；如实披露口径）

- **来源（合法非贪吃蛇既有目标项目）**：`C:\Users\51054\Desktop\work\jinyong-rogue-2d`（本地真实项目，2026-10-29/30 真实治理链产物；非贪吃蛇；复制前只读）。
- **复制目标**：`C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\target`；复制 **462 文件**（跳过旧 `.ans/sessions` 运行态；`pre/target-copy-files.sha256`、`pre/prepare-target.json`）。仅将 `.ans/project.json` 的 `projectRoot` 改写为新目标根（`C:/Users/51054/Desktop/work/ans-doc-format-run-2026-11-10/target`），其余字节不变。
- **项目角色 8 个**：`art-dev`、`combat-dev`、`content-dev`、`dungeon-dev`、`engine-dev`、`env-bootstrap`、`render-dev`、`test-dev`；每个均有 `角色卡/<roleId>/role-card.md` + `boundary.yaml`（逐文件 SHA-256 见 `pre/pre-summary.json > targetPreKeyFiles`；`roleCardCheckAllMatch=true`）。`角色卡/governance-boundary.yaml` SHA-256 `a19ee561…`。
- **治理与激活证据（旧模型口径，如实）**：`.ans/project.json` 显式 `governanceModel:"trio"`，`governanceBoundary.acceptance.accepted=true`，9 条边界 pin 全部与实际文件 **MATCH**；`.ans/state/tasks.jsonl` 401 行，含 **3 张 appointment 卡 + 16 张 appointment-write 卡 + 1 张 acceptance 卡**（历史文本命中），20 个 request 全部 resolved；无未投递任务、无未决 request（`pre/prepare-target.json > ledger`）。
- **限制（必须如实引用）**：该项目为**旧 trunk 前模型**产物——无 `.ans/role-evidence/activation-*.json`、无 `.ans/trunk/manifest.json`；因此「已激活」只能按旧模式（真实任命/写卡账本 + 治理边界接受 pin + 角色目录/历史会话）表述，**不能冒充当前 trunk 模型的 `role-activation/v1` 激活证据**。本轮**未做项目角色真实模型调用**（未到达该步），不宣称其真实读取。

## 5. 运行时间线（UTC；第 1 轮）

| 时刻 | 事件 |
| --- | --- |
| 16:50:37 | 启动记录（本轮启动；第一次无环境变量的 launcher 调用因缺 `ANS_RR_USERDATA` 立即失败、未产生窗口/端口，随后以正确环境重启） |
| 16:51:01.775 | 驱动连接 9223，页面就绪（`ANS 治理会话工作台`） |
| 16:51:01.876 / 16:51:02.645 | 真实 UI 点「导入」→ 系统目录选择器选中隔离 target（`SELECTED … path=…\target`） |
| 16:51:06.717 | 角色枚举：**14 个**（6 内置 chief/product/rapporteur/nominator/convener/verifier + 8 项目角色） |
| 16:51:06.820–16:51:07.062 | 6 个内置角色会话经真实 `openSession` 打开：`session.open.ready` ×6（chief/product/rapporteur/nominator/convener/verifier） |
| 16:51:07.192 | **1 条客户消息**发送（`cleared:true`；全文 `customer-message.txt`，1,478 bytes） |
| 16:51:08.382 / 16:51:11.081 | 幕僚原生 `prompt_snapshot`：58,145 B / `a047eeff…`（两次同 hash；含 `doc_format` promptGuidelines 三条） |
| **16:51:13.535** | **幕僚真实调用 `doc_format`**（`mcp__ans__doc_format`；入参 `{"format":"project-intent/v1"}`；model `deepseek-v4-flash`） |
| **16:51:13.545** | **回执原文**：2,162 B；首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`；含 A1 字段表/样例/错误码（全文 `extracts/chief-doc-format-receipt.json`） |
| 16:51:23.606 | 幕僚第 1 次 `dispatch_task`（入参 `to/sideEffect:"write-docs"` 等）；工具 schema 拒绝（`roleId`/`task` 缺失、`sideEffect` 枚举非法） |
| 16:51:29.378 | 幕僚第 2 次 `dispatch_task`（`roleId:"product"`、`task`、`sideEffect:"docs"`、`requestedEvidence[]`；**无 `moduleId`/`moduleDirectory`**） |
| **16:51:29.700** | **应用拒绝投递**：`delivery-target-open-failed: delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法`；同刻账本 `task.reported/failed`；工具回执「任务未能派发…未入队、未投递」 |
| 16:51:37.383 | 幕僚写 `project.note`（`pause-flow-dispatch-module-dir`，blocker，原文见 §6.3） |
| 16:51:45.187 | 幕僚回合结束，向客户如实报告「第 1 步在投递处被机械拒绝…未重试绕过、未自填派生值」 |
| ≈16:53:5x | 驱动按「首果即停」停止（未自动重试、未发第 2 条消息） |
| 16:53–16:54 | 收尾：`btn-halt` → `stopSession` → `Browser.close`；窗口关闭后主进程残留（PID 6548 及子进程），对**本轮自有进程树** `taskkill /PID 6548 /T /F`；9223 释放、0 Electron 残留（`final-isolation.txt`） |

## 6. 观测原件（关键；全文见 evidence）

### 6.1 幕僚真实 `doc_format` 调用与回执（产品代读，但**不是产品本人**）

- 调用：`chief` / 2026-11-09T16:51:13.535Z / `mcp__ans__doc_format` / tool_use_id `call_00_uPnHnKYIy9D26bvpdaPG7907` / 入参 **`{"format":"project-intent/v1"}`** / model `deepseek-v4-flash`（`extracts/chief-doc-format-call.json`）。
- 回执：2,162 B（`extracts/chief-doc-format-receipt.json` `e80a15e6…`），首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`；正文含 `schema：project-intent/v1`、`路径：docs/product/<flowId>-intent-vN.md`、校验器锚点 `prepareIntentConfirmation`、字段表与常见错误。**该回执证明工具在真实 Electron 会话内可发现、可调用、返回真实注册表文本；不证明产品读取（产品未收到任务）。**

### 6.2 投递拒绝回执（决定性结果）

- 工具回执（`extracts/chief-dispatch-task-receipts.json` `4229d787…`，第 2 行）：
  > `dispatch_task：任务未能派发（回执：派发未投递：无法打开目标角色 产品 的会话（delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法）；未入队、未投递。请检查运行时配置后重试。）`
- 账本（`tasks-final.jsonl` `e552bc53…`）：`{"kind":"task.reported","taskId":"t-mw9i0cd5-2e5bff5b","from":"product","status":"failed","summary":"应用观察到失败：delivery-target-open-failed: delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法"}`
- 机制（源码核对，只读）：`src/common/编排/task-state.ts:1017-1027` 要求 `moduleDirectory` 为**以 `/` 结尾的安全相对目录**；新 flow 在投递分配账本中没有合法模块目录 ⇒ 应用 fail-closed 拒绝。**不是候选引入**（该文件不在 11 文件候选内，diff=0）。

### 6.3 幕僚 project note（blocker 原文）

> `flow jinyong-rogue-2d-pause 首步 intent 派发 product 被机械拒绝、未入队未投递：回执原文「派发未投递：无法打开目标角色 产品 的会话（delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法）；未入队、未投递。请检查运行时配置后重试。」新 flow 在投递分配账本中缺合法 moduleDirectory，属应用/宿主侧配置，幕僚无法也不得自填派生值。`

### 6.4 6 个内置角色会话（真实 Electron `openSession`）

- `session.open.ready` ×6（`diagnostics/ans-diagnostics-2026-11-09.jsonl`；roleId 与时序见 §5）；`roles.listing` 记录 14 角色（`drive.jsonl`）。
- **幕僚会话真实回合**的系统提示快照含 `doc_format` promptGuidelines（58,145 B / `a047eeff60bf5b0ffccbfcd745c1f8bbcf6c6feab64cd464511cf69d1c2504cd`；全文 `extracts/chief-system-prompt.txt`）：这是「工具确实在该会话注册集内」的真实会话证据（promptGuidelines 仅来自 `options.tools`）。
- **产品/项目角色真实读取：0**（产品未收到任务；项目角色会话未打开）。**注册≠真实读取**；其余内置角色只有会话注册证据与来源码位（`app/desktop/session.ts:3890-3896/4390` 无条件注入 + D1/W5 确定性覆盖），本轮未重跑 D1。

## 7. RR-1–RR-8 对照（本轮可观测范围；不判验收）

| ID | 本轮结果 | 说明/证据 |
| --- | --- | --- |
| RR-1 环境 | **已取证** | 真实 Electron 44.7.0 + 真实模型 + 真实 UI；隔离 userData；CDP 9223；仓库外目标根；入口/provider/userData/端口见 §3 |
| RR-2 预检与预置 | **部分取证** | 9222/9223 预检 0 LISTENING；目标预置 8 个旧模型项目角色（复制合法非贪吃蛇项目，来源/哈希/pins 见 §4）；**未做真实项目角色调用**；无当前 trunk `role-activation/v1` 激活证据（如实披露后按 RR-7 口径不冒充） |
| RR-3 场景 A（产品） | **未通过（阻塞于投递）** | 客户消息 1 → 幕僚真实读/调 `doc_format` → 派产品被应用拒绝（`task.created.moduleDirectory 非法`）；产品 `doc_format` 0 次、意图文档不存在、`prepareIntentConfirmation` 未触发 |
| RR-4 场景 B（全员可读） | **部分取证** | 6 内置会话注册（6×`session.open.ready`）；幕僚真实调用 1 次；产品 0、项目角色 0（未到达）；**不得写成本条通过** |
| RR-5 隔离证明 | **已取证** | 9222 全程 0；9223 预检空闲、后检释放（仅 TIME_WAIT）；无 Electron 残留；未读写贪吃蛇根/其 target（仅 netstat/tasklist） |
| RR-6 预算/纪律 | **符合** | 客户 1/1、卡 0/1、操作者 0/1、产品 0/3、项目角色 0/1、墙钟 ≈3m43s/20m；首果即停；0 重试；无非本变更卡/越界写/非预期模型调用（幕僚 `doc_format` 为只读调用，如实单列） |
| RR-7 回落与如实性 | **适用并如实** | 产品/项目角色真实读取未发生：**不宣称**；本记录明确「未做产品真实读取、未做项目角色真实模型调用」；失败码原文保留 |
| RR-8 同一候选/证据 | **已取证** | 运行前后候选 11 文件/聚合/manifest 逐字节相同；HEAD/tree/分支/工作树状态不变；未提交/推送/合并/发布；未拼接其它变更证据 |

## 8. 预算（RR-6/AC-14）

| 项 | 预算 | 实测 | 说明 |
| --- | --- | --- | --- |
| 客户消息 | ≤1 | **1** | 16:51:07.192Z 唯一一条（`cleared:true`） |
| 客户面对卡 | ≤1 | **0** | 无 `request.created`；应用拒绝发生在投递阶段 |
| 操作者直连项目角色消息 | ≤1 | **0** | 未到达该步 |
| 产品 `doc_format` | ≤3（期望 1） | **0** | 产品未收到任务 |
| 项目角色 `doc_format` | ≤1 | **0** | 项目角色会话未打开 |
| 幕僚 `doc_format`（非预算行） | — | **1** | 只读；入参 `project-intent/v1`；2,162 B 回执 |
| 模型回合 | 最小化 | chief **1** 完成；product/项目角色 **0** | 无其它轮次 |
| 墙钟 | ≤20 分钟 | **≈3 分 43 秒** | 16:50:37Z → 16:54:20Z；预置准备不计 |
| 首果即停 / 不自动重试 | 必须 | **遵守** | 16:51:29.700Z 决定性失败后停止；未重发、未重启、未续跑 |
| 非本变更卡/越界写/非预期调用 | 立即停止 | **未出现** | 幕僚只读 `doc_format` 如实单列；无越界写 |

## 9. 9222/9223 与零触碰（RR-5）

- **9222**：预检 0 LISTENING；运行期驱动每 15s 采样，未观测到 9222 LISTENING（若出现会记 gate；未出现）；后检 0 LISTENING。**未启动/占用/关闭 9222。**
- **9223**：预检空闲；运行期本实例 PID 20860 LISTENING；后检 **0 LISTENING**（仅 TIME_WAIT），无 Electron 进程残留（`post/ports-and-processes-post.txt`、`final-isolation.txt`）。
- **贪吃蛇根与 target 零触碰（声明 + 方法）**：全程只做 `netstat -ano` 与 `tasklist` 端口/进程检查；**未读取** `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 与 `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09`（含 target）下任何文件；未复制、未比较、未哈希其文件。`pre/pre-summary.json > zeroTouch.snakeFileReads = 0`。
- **目标项目写入（预期行为，隔离根内）**：462 → 471 文件；added 9 / changed 4 / removed 0（`post/target-diff.json`）：新 draft run manifest、chief 会话（native 转录）、`doc-freezes.json`、1 个 customer-turn 初始化源、`docs/bootstrap-manifest.md`（应用既有维护行为）、账本/版本/日志。**无产品意图文档、无提案/契约/角色卡改动。**

## 10. 模型与工具面披露（如实）

1. 真实模型调用（无桩），实际模型 **`deepseek-v4-flash`**（`.env` 配置；原生 `message.model` 一致）——**非 Anthropic Claude，本记录不宣称 Claude**，不评估模型能力。
2. 本轮真实工具面（原生转录，幕僚）：`doc_format`×1、`project_state`×1、`list_dir`×1、`dispatch_task`×2、`project_note`×1；`request_*` 0、`run_shell` 0、`git_*` 0；product 无回合。
3. `doc_format` 在幕僚会话内**可发现、可调用、回执真实**；但 **产品/项目角色真实读取均未发生**，本记录不把注册/枚举写成真实读取。Pi/Codex 真实模型行为不在本轮覆盖内。

## 11. 限制与下一门（不判验收）

1. **本轮未完成 RR**：阻塞在「幕僚派产品」的应用投递校验（新 flow 无合法 `moduleDirectory`），属**本轮场景输入选择问题 + 应用既有投递约束**，非 11 文件候选引入（`task-state.ts` 不在候选，diff=0）。
2. **不自动重试/不追加预算**：按任务纪律与 RR6 记录先例（「下一次真实运行须另行获协调方授权并追加预算」），本轮未重启、未续跑、未发第 2 条客户消息、未做项目角色直连查询。
3. **下一门（建议，待协调方授权 + 追加预算）**：以**既有 flow**（如 `jinyong-rogue-2d`，其 roster v11 含 8 角色/12 模块）做小需求，产品写 `docs/product/jinyong-rogue-2d-intent-v4.md`（新版本、不改 v1–v3），幕僚派发时携带合法 `moduleDirectory`（如 `src/combat/`，须以 `/` 结尾），随后 `prepareIntentConfirmation` → `intent-confirm` 卡 → 项目角色直连 `doc_format`（≤1）。预置项目角色沿用本 target 副本即可（或重新复制并记录来源/哈希）。
4. **预置激活口径**：旧模型任命/写卡账本 + 治理边界接受 pin，不等于当前 trunk `role-activation/v1`；若验收要求当前模型激活证据，需另按正常流程激活（准备，不计客户预算）或由协调方明确接受旧口径。
5. 本记录只陈述事实与偏差；不判 B1/AC/RR 通过或失败；不覆盖其它候选/变更；不与 D1/W5 确定性证据互相替代。

## 12. 证据索引（`角色卡/测试/docs/change/2026-11-10_RR_document-format-specifications-evidence/`，71 文件）

全量逐文件 SHA-256：`evidence-manifest.txt`（每行 `<sha256> *<相对路径>`，按路径排序；清单自身不在内，可用 `sha256sum -c`/脚本复算）。关键原件：

| 类别 | 文件（相对 evidence 目录） |
| --- | --- |
| 身份/环境 | `pre/pre-summary.json`（`e6c4fa54…`）、`pre/prepare-target.json`（`25198599…`）、`customer-message.txt`（`c9fd7e3f…`）、`launch-time.txt`、`electron-stdout.log`、`driver-stdout.log` |
| 候选稳定性 | `pre/candidate-sha256.txt`、`post/candidate-sha256-post.txt`（同 `ad1959b2…`）、`pre/manifest-src-app-test.txt`、`post/manifest-src-app-test-post.txt`（同 `ff671d50…`）、`post/post-summary.json`（`7de1e8bd…`） |
| 驱动/汇总 | `drive.jsonl`（`08b7429c…`）、`round1-summary.json`（`4af3ff5a…`）、`live/heartbeat.json`、`ui-0*.jpeg`、`ui-99-final.jpeg`、`ui-final-body.txt` |
| 证据/回执 | `extracts/chief-doc-format-call.json`（`8e29d933…`）、`extracts/chief-doc-format-receipt.json`（`e80a15e6…`）、`extracts/chief-dispatch-task-inputs.json`（`8c503dc6…`）、`extracts/chief-dispatch-task-receipts.json`（`4229d787…`）、`extracts/chief-assistant-texts.json`（`1df5a861…`）、`extracts/chief-system-prompt.txt`（`a047eeff…`）、`extracts/prompt-snapshot-meta.json` |
| 账本/会话 | `tasks-final.jsonl`（`e552bc53…`）、`versions-final.jsonl`（`504addb3…`）、`diagnostics/`、`diagnostics-userData-post/`、`sessions/`（chief 真实原生转录）、`live/tasks-live.jsonl` |
| 目标/隔离 | `target-pre.sha256`、`target-post.sha256`、`pre/target-manifest-pre.json`、`post/target-manifest-post.json`、`post/target-diff.json`（`e76d42f4…`）、`post/target-diff.txt`、`post/ports-and-processes-post.txt`、`final-isolation.txt`（`a8bd5c7c…`）、`final-workspace-audit.json`（写盘后仓库审计：仅本记录+证据目录新增；候选/manifest 不变） |
| 驱动方法 | `run-scripts/`（preflight、prepare-target、launcher、select-folder-auto.ps1、drive-rr-doc-format、shutdown-run1、finalize-run1、extract-run1、postcheck、copy-evidence-to-repo；仓库外运行根原件） |

## 13. 状态

- **RR 第 1 轮停止于首个决定性结果（投递机械拒绝）**：真实 Electron + 真实模型（`deepseek-v4-flash`）+ 真实 UI 单次运行；客户消息 1 条、0 卡；幕僚真实 `doc_format` 读取并派产品被应用拒绝（`task.created.moduleDirectory 非法`）；产品/项目角色真实读取未发生，意图确认门未覆盖；9222 零占用、9223 已释放无残留；候选/零触碰/仓库边界稳定。**不判验收；下一门为协调方授权 + 追加预算后的修正轮（既有 flow + 合法 moduleDirectory）。**
- 未提交/推送/合并/发布；未改仓库产品/测试/角色卡/其它文档；本记录之外只写 `2026-11-10_RR_document-format-specifications-evidence/` 与仓库外运行根 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\`。

**（完）**
