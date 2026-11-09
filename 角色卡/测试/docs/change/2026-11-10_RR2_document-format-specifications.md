# 真实运行记录 RR2（协调方授权修正轮）：每个文档格式的权威说明与全员可读（T2）——真实 Electron + 真实模型 + 真实 UI（隔离 9223；2026-11-10）

- 角色：ANS 测试（`roleId: 测试`；独立验证上下文；**只取证，不判验收**）。
- 轮次：**RR2 修正轮**。依据协调方 2026-11-10 书面授权（消息原文要点：「协调方已授权 **RR 修正轮**（新预算，按 B1；不是首轮重试/追加）」，并明确「若 chief 仍派发失败，记录真实回执并停止（不重试）」）。**本轮仍停止于首个决定性结果（投递前拒绝），未进入产品意图/意图卡/项目角色读取；不构成候选 pass/fail，也不得被 B2 当作真实运行通过证据。**
- 日期：2026-11-10（本地 01:00–01:04 +0800；UTC 2026-11-09 17:00:58–17:03:48）。
- 工作区（git worktree，真实应用入口）：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/document-format-specifications`；HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad26d768297cb076af4f8e24316c7d71b7`）。
- 运行根（仓库外）：`C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\round2\`：`target\`（全新复制）、`userData\`（隔离）、`scripts\`（驱动）、`evidence\`（过程证据）。
- 隔离：CDP **仅 9223**；**9222 全程 0 LISTENING**；**贪吃蛇运行根与 snake target 全程零触碰/零读取**（仅 netstat/tasklist）；9223 结束后释放、无 Electron 残留。
- 纪律：未修改仓库产品/测试/角色卡/其它文档（只写本记录与 `2026-11-10_RR2_document-format-specifications-evidence/`）；未提交/推送/合并/发布；**未重试、未追加第 2 条客户消息**；未运行 judge/提案卡等其它变更。

## 0. 结论摘要（先读；全部为事实陈述）

1. **决定性结果：幕僚第二次 `dispatch_task` 被应用拒绝（投递前，0 任务行落账）**。客户消息 1 条（17:01:11.363Z）→ 幕僚真实回合（`deepseek-v4-flash`）读取 `project_state` 与 `docs/proposals/jinyong-rogue-2d-roster-v11.md`（确认 `combat-entities`/`src/combat/`/属主 `combat-dev` 真实存在）→ 17:01:23.884 第 1 次 `dispatch_task`（入参字段名 `to`/`sideEffect:"write-docs"` 错误，工具 schema 拒绝）→ 17:01:27.980 第 2 次 `dispatch_task`（`roleId:"product"`、`moduleId:"combat-entities"`）→ **17:01:28.023 应用回执**：
   > `dispatch_task：任务未能派发（回执：document-planning-module-forbidden：文档准备不授实现模块写区。）——请如实向客户说明；不要当它成功、不要宣称已送达。`
   幕僚 17:01:37 如实报告「第 1 步门禁拒绝，未重试、未写文档、未发处置卡」。**产品未收到任务、未运行模型回合、未调用 `doc_format`、未写意图 v4；`prepareIntentConfirmation` 未触发；项目角色未查询。**
2. **复现并定位首轮 RR 同一错误的更深根因（只读核对，非候选引入）**：复制目标 `.ans/state/tasks.jsonl` 的 401 行 legacy 账本中，有 **10 条 `task.created` 行的 `moduleDirectory` 为文件路径（`index.html`、`package.json`、`tools/verify_assets.mjs`，无尾随 `/`）**。当前 `validateTaskStateEvent` 要求 `moduleDirectory` 为以 `/` 结尾的安全相对目录（`src/common/编排/task-state.ts:1017-1027`）；投递分配读取账本时逐行校验（`src/service/trunk/impl/apply-journal.ts:2290` `readOperationEvents`），**任一行非法即 `delivery-assignment-ledger-invalid`，任何派发都无法送达**。首轮 RR 的 `task.created.moduleDirectory 非法` 即由此产生（不是新 flow 本身）。
3. **本轮另有独立阻塞**：客户/协调方案要求「任务携带合法 moduleDirectory/moduleId」，但应用对**文档准备（document planning）任务**明确拒绝模块字段（`app/desktop/session.ts:9127` `document-planning-module-forbidden：文档准备不授实现模块写区。`）。即：本轮场景输入（moduleId 指令）与应用语义冲突；两处均为场景/目标准备问题，不在 11 文件候选内。
4. **全员可读证据（仅注册层）**：项目导入后真实枚举 **14 角色**（6 内置 + 8 项目角色）；**6 个内置角色会话均经真实 Electron `openSession` 打开**（6 条 `session.open.ready`，17:01:10.948–17:01:11.205Z）；幕僚真实回合 `prompt_snapshot`（58,145 B / SHA-256 `80ddaf5d…`）含 `doc_format` promptGuidelines（`hasDocFormatGuideline=true`）。**产品真实读取 0、项目角色真实读取 0；幕僚本轮 `doc_format` 调用 0（其读了 roster，未查格式）。**
5. **预算**：客户消息 **1/1**；客户面对卡 **0/≤1**；操作者直连项目角色消息 **0/≤1**；产品 `doc_format` **0/≤3**；项目角色 `doc_format` **0/≤1**；幕僚 `doc_format` **0**；模型回合 chief **1** 完成、product/项目角色 **0**；墙钟 **≈2 分 50 秒/≤20 分钟**；首果即停；0 重试；未追加预算。
6. **环境/模型**：真实 Electron 44.7.0（本候选 worktree `app/main.ts`，入口 SHA-256 `339fcfaa…`）+ 真实模型 + 真实 UI；隔离 userData；CDP 9223。**模型如实披露：`.env` 与原生 `message.model` 均为 `deepseek-v4-flash`（`https://aiproxy2.abujlb.com/deepseek`）——非 Anthropic Claude，不宣称 Claude。**
7. **候选/manifest 稳定**：运行前后 `src app test` 11 文件、逐文件 raw SHA-256、聚合 **`bcd3255392…`**、manifest 1,113 文件聚合 **`fc296e95…`** 逐字节相同；HEAD/tree/分支不变；`git status --porcelain` 全文 SHA-256 前后相同。
8. **隔离/零触碰**：预检/后检 9222 = 0；9223 预检空闲、后检仅 TIME_WAIT、无 Electron 残留；**未读写贪吃蛇运行根与 `ans-game2d-snake-2026-11-09`（含 target）任何文件**。

## 1. 依据与绑定（写盘前实测）

| 项 | 实测 |
| --- | --- |
| **协调方 RR2 授权** | 本轮派发消息（来自协调方会话）：授权新预算修正轮；要求既有 flow `jinyong-rogue-2d`、产品写 intent v4、派发携带合法 moduleDirectory、失败则记录回执并停止（不重试） |
| **首轮 RR（绑定）** | `角色卡/测试/docs/change/2026-11-10_RR_document-format-specifications.md`：**27,708 bytes / 179 行 / SHA-256 `7e95ea07c6284935836ee5be9e72ddec512559b63b34426ed56030be524dfa42`** |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`：69,121 bytes / 483 行 / `bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe` |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`：15,475 bytes / 102 行 / `4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2` |
| 派发记录 | `docs/scheduling/2026-11-09_dispatch-log_document-format-specifications.md`：7,762 bytes / 56 行 / `afce6546723ee0c8ace5eda2b8941ca7369c626acd9eb95efece30300dee0c8f` |
| 方案 P1.2 | `docs/planning/2026-11-09_design_document-format-specifications.md`：146,555 bytes / 980 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54` |
| 复核 R1.1 | `docs/planning/2026-11-09_review_document-format-specifications.md`：82,067 bytes / 500 行 / `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05` |
| D1 v1.1 | `角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md`：42,274 bytes / 228 行 / `adc23f45f56f8cd16251e41756f9fce1b56430fadbf10b6add6e2cef3aec090f` |

## 2. 候选身份与稳定性（`pre/`、`post/`）

- 候选 **11 文件**（5 M + 6 新），与首轮/D1 同一集合；聚合运行前 = 运行后 = **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**；manifest 1,113 文件 / 25,907,278 bytes，聚合运行前 = 运行后 = **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**；逐文件 hash 与清单文本前后一致（`pre/candidate-sha256.txt`、`post/candidate-sha256-post.txt`、`pre/manifest-src-app-test.txt`、`post/manifest-src-app-test-post.txt`）。
- HEAD `3cd55dc…` / tree `e05d68ad…` / 分支不变；`git status --porcelain` 全文 SHA-256 前后相同（`fullStatusIdentical=true`）。写本记录前仓库无新增改动。

## 3. 环境（RR-1）

| 项 | 实测 |
| --- | --- |
| 应用入口 | 本候选 worktree 真实 `app/main.ts`：83,599 bytes / `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`；经仓库外 launcher 仅 `app.setPath("userData")` 后 `import()`，未改仓库代码 |
| 渲染面 | `app/renderer/dist/index.html`：`fc24534e8c6286ec6885511607f74a1f287ce809903c6636cb7d6db54738bfd1`（既有构建产物） |
| 运行时 | Electron **44.7.0**；驱动 Node **v24.22.1**；Windows 11 Pro 10.0.26300 |
| userData（隔离） | `…\ans-doc-format-run-2026-11-10\round2\userData`（不写全局 `%APPDATA%/Electron`） |
| CDP | **仅 9223**（主进程 PID 2308；DevTools 实测 `.json` 页面就绪） |
| 启动命令 | `ANS_RR_USERDATA=<round2>\userData RR_REPO_MAIN=<worktree>\app\main.ts electron.exe <round2>\scripts\launcher.mjs --remote-debugging-port=9223` |
| 模型（如实披露） | `.env`：`ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANS_CLAUDE_REASONING_EFFORT=high`、`ANTHROPIC_BASE_URL=https://aiproxy2.abujlb.com/deepseek`；原生 `message.model`=`deepseek-v4-flash`。**非 Anthropic Claude** |
| 端口预检 | 9222 = **0 LISTENING**、9223 = **0 LISTENING** |

## 4. 预置（RR-2；准备不计预算；如实披露）

- **来源**：`C:\Users\51054\Desktop\work\jinyong-rogue-2d`（合法非贪吃蛇既有项目，2026-10-29/30 真实治理链产物）；**全新复制**到 `…\round2\target`，**462 文件**（跳过旧 `.ans/sessions`；`.ans/project.json` 的 `projectRoot` 改为新目标根，其余字节不变）。
- **项目角色 8 个**：`art-dev`、`combat-dev`、`content-dev`、`dungeon-dev`、`engine-dev`、`env-bootstrap`、`render-dev`、`test-dev`；均有 `role-card.md` + `boundary.yaml`；`角色卡/governance-boundary.yaml` `a19ee561…`；`governanceBoundary.acceptance.accepted=true`，9 条 pin **全部 MATCH**（`pre/prepare-target.json`）。
- **最新名单 v11**：`docs/proposals/jinyong-rogue-2d-roster-v11.md`：29,707 bytes / SHA-256 `b8071dc5e2452686d5f05e2faebcf5d9cb136e81d7d5ab25180e88f5a28649c3`；8 角色；模块 `combat-entities` → `src/combat/`、属主 `combat-dev`（真实存在）。
- **激活口径（如实）**：旧 trunk 前模型产物——无 `.ans/role-evidence/activation-*.json`、无 `.ans/trunk/manifest.json`；「激活」只能按旧模式（真实任命/写卡账本 + 治理边界接受 pin + 角色目录/历史会话）表述；本轮未做项目角色模型调用。
- **账本预态（关键）**：`.ans/state/tasks.jsonl` **401 行 / 677,338 bytes / SHA-256 `044ca6f96c8d46668023e24d67057f82116c2bb3d104e504d4699e8d581ac4df`**；无未投递任务、无未决 request；**其中 10 条 `task.created` 的 `moduleDirectory` 为文件路径（无尾随 `/`）**，按当前 `validateTaskStateEvent` 非法（见 §6.2）。

## 5. 运行时间线（UTC）

| 时刻 | 事件 |
| --- | --- |
| 17:00:58 | Electron 启动（9222/9223 预检均 0）；真实 UI 导入 → 系统目录选择器选中 `…\round2\target` |
| 17:01:10.839 | 角色枚举 **14 个**（6 内置 + 8 项目角色） |
| 17:01:10.948–17:01:11.205 | 6 个内置角色会话经真实 `openSession` 打开（`session.open.ready` ×6） |
| **17:01:11.363** | **1 条客户消息**发送（`cleared:true`；全文 `customer-message.txt`，1,755 bytes；含「moduleId 用 combat-entities / 目录 src/combat/」） |
| 17:01:12.533 / 17:01:15.169 | 幕僚 `prompt_snapshot`：58,145 B / `80ddaf5d…`（两次同 hash；含 `doc_format` promptGuidelines） |
| 17:01:15.108 / 17:01:15.114 | 幕僚 `project_state(flowId=jinyong-rogue-2d)`、`read_file(docs/proposals/jinyong-rogue-2d-roster-v11.md)`（确认 `combat-entities`/`src/combat/`/`combat-dev`） |
| 17:01:23.884 | 第 1 次 `dispatch_task`（`to`/`sideEffect:"write-docs"`）→ 工具 schema 拒绝（`roleId`/`task` 缺失、`sideEffect` 非法） |
| 17:01:27.980 | 第 2 次 `dispatch_task`（`roleId:"product"`、`task`、`sideEffect:"docs"`、**`moduleId:"combat-entities"`**；无 moduleDirectory 自报） |
| **17:01:28.023** | **应用拒绝**：`document-planning-module-forbidden：文档准备不授实现模块写区。`（未落 task 行、未投递） |
| 17:01:37 | 幕僚回合结束，如实报告门禁拒绝、未重试/未写文档/未发卡 |
| ≈17:02:5x | 驱动按授权指令「记录真实回执并停止」停止（未重试、未发第 2 条客户消息） |
| 17:02–17:03 | `btn-halt` → `stopSession`（`ok:true`，关闭 3 个会话）→ `Browser.close`；9223 释放、无 Electron 残留（`final-isolation.txt`） |

## 6. 决定性回执与根因（原文/代码锚点）

### 6.1 `document-planning-module-forbidden`（本轮直接阻塞）

- 工具回执（`extracts/chief-dispatch-task-receipts.json` `f542e283…` 第 2 行）：
  > `dispatch_task：任务未能派发（回执：document-planning-module-forbidden：文档准备不授实现模块写区。）——请如实向客户说明；不要当它成功、不要宣称已送达。`
- 代码锚点（只读核对）：`app/desktop/session.ts:9127` 对文档准备任务携带模块字段直接 `fail("document-planning-module-forbidden：文档准备不授实现模块写区。")`。`dispatch_task` 的 `moduleId` 语义（`src/provider/runtime/schema.ts:683-694`）面向**实现任务**（convener→worker）；产品意图/文档准备任务不授权实现模块写区。

### 6.2 更深根因：目标 legacy 账本存在当前规则非法行（首轮同错来源）

- 复制目标 `.ans/state/tasks.jsonl`（401 行）中 **10 条** `task.created` 的 `moduleDirectory` 为文件路径、无尾随 `/`：`index.html`（5 条）、`package.json`（3 条）、`tools/verify_assets.mjs`（2 条）。
- 当前校验：`src/common/编排/task-state.ts:1017-1027` 要求 `moduleDirectory` 为以 `/` 结尾、非绝对、无 `.`/`..`/空段的安全相对目录；投递分配读取账本时逐行校验（`src/service/trunk/impl/apply-journal.ts:2290` `readOperationEvents`），**任一行非法 ⇒ `delivery-assignment-ledger-invalid`**，派发无法送达。
- 这解释了首轮 RR 的 `delivery-assignment-ledger-invalid:task.created.moduleDirectory 非法`：**不是新 flow 本身**，而是同一份 legacy 账本中的历史行；即使去掉本轮 `moduleId` 指令，使用本 target 副本的派发仍会被该账本拒绝。两处均不在 11 文件候选内（`task-state.ts`/`apply-journal.ts`/`session.ts` 的该逻辑均为既有实现，候选 diff=0）。

### 6.3 幕僚行为（如实）

- 未重试、未写文档、未发任何卡、未使用 `run_shell`、未自填任何派生值；在正文报告中说明「第 1 步门禁拒绝」并停止。本轮无 `project.note`（与首轮不同），以正文报告为准。

## 7. RR-1–RR-8 对照（本轮可观测范围；不判验收）

| ID | 本轮结果 | 说明 |
| --- | --- | --- |
| RR-1 环境 | **已取证** | 真实 Electron + 真实模型 + 真实 UI；隔离 userData/CDP 9223；环境见 §3 |
| RR-2 预检与预置 | **部分取证** | 9222/9223 预检 0；复制合法非贪吃蛇项目，8 个旧模型项目角色（来源/哈希/pins 见 §4）；**未做真实项目角色调用**；旧模型激活口径已披露 |
| RR-3 场景 A（产品） | **未通过（阻塞于投递）** | 客户消息 1 → 幕僚读 roster → 派产品被 `document-planning-module-forbidden` 拒绝；产品 `doc_format` 0、意图 v4 不存在、`prepareIntentConfirmation` 未触发 |
| RR-4 场景 B（全员可读） | **仅注册层** | 6 内置会话注册（6×`session.open.ready`）；幕僚 prompt snapshot 含 `doc_format` guidelines；产品/项目角色真实读取 0（未到达）；幕僚本轮 `doc_format` 0 |
| RR-5 隔离证明 | **已取证** | 9222 全程 0；9223 预检空闲、后检释放（仅 TIME_WAIT）；无 Electron 残留；未读写贪吃蛇根/target |
| RR-6 预算/纪律 | **符合** | 客户 1/1、卡 0/1、操作者 0/1、产品 0/3、项目角色 0/1、墙钟 ≈2m50s/20m；首果即停；0 重试；无越界写/非本变更卡 |
| RR-7 回落与如实性 | **适用并如实** | 产品/项目角色真实读取未发生，不宣称；真实回执原文保留；本轮按授权停止 |
| RR-8 同一候选/证据 | **已取证** | 运行前后候选/聚合/manifest 逐字节相同；HEAD/tree/分支/工作树状态不变；未提交/推送/合并/发布 |

## 8. 预算（RR-6/AC-14）

| 项 | 预算 | 实测 | 说明 |
| --- | --- | --- | --- |
| 客户消息 | ≤1 | **1** | 17:01:11.363Z 唯一一条 |
| 客户面对卡 | ≤1 | **0** | 无 `request.created`；拒绝发生在投递前 |
| 操作者直连项目角色消息 | ≤1 | **0** | 未到达 |
| 产品 `doc_format` | ≤3（期望 1） | **0** | 产品未收到任务 |
| 项目角色 `doc_format` | ≤1 | **0** | 项目角色未打开 |
| 幕僚 `doc_format` | — | **0** | 本轮读了 roster；未查格式 |
| 模型回合 | 最小化 | chief **1** 完成；product/项目角色 **0** | 无其它轮次 |
| 墙钟 | ≤20 分钟 | **≈2 分 50 秒** | 17:00:58Z → 17:03:48Z |
| 首果即停 / 不重试 | 必须 | **遵守** | 17:01:28.023Z 拒绝后停止；未重发、未重启、未续跑 |
| 非本变更卡/越界写/非预期调用 | 立即停止 | **未出现** | 幕僚只读 `project_state`/`read_file` 如实记录 |

## 9. 9222/9223 与零触碰（RR-5）

- **9222**：预检 0 LISTENING；运行期驱动每 15s 采样（若出现会记 gate；未出现）；后检 0 LISTENING。**未启动/占用/关闭 9222。**
- **9223**：预检空闲；运行期本实例 LISTENING；后检 **0 LISTENING**（仅 TIME_WAIT），无 Electron 进程残留（`post/ports-and-processes-post.txt`、`final-isolation.txt`）。
- **贪吃蛇根/target 零触碰**：全程仅 `netstat -ano`/`tasklist`；**未读取** `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 与 `C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09`（含 target）下任何文件；未复制/比较/哈希其文件。
- **目标项目写入（隔离根内，预期）**：462 → 469 文件；added 7 / changed 3 / removed 0（`post/target-diff.json`）：chief 会话 native 转录、`doc-freezes.json`、`docs/bootstrap-manifest.md`（应用既有维护）、日志/版本。**无任务账本新行（`tasks.jsonl` 未变，hash 与 pre 相同）、无产品意图文档、无卡、无提案/契约/角色卡改动。**

## 10. 模型与工具面披露（如实）

1. 真实模型调用（无桩），实际模型 **`deepseek-v4-flash`**（`.env` 与原生 `message.model` 一致）——非 Anthropic Claude，不宣称 Claude。
2. 本轮真实工具面（原生转录）：幕僚 `project_state`×1、`read_file`×1、`dispatch_task`×2；`doc_format` 0、`request_*` 0、`run_shell` 0、`git_*` 0；product/test-dev 无回合。
3. `doc_format` 在幕僚会话的 `prompt_snapshot` 系统提示中可见（guidelines 三条，`hasDocFormatGuideline=true`），但**本轮无任何角色真实调用**；首轮幕僚真实调用的证据见 RR1 记录（不拼接为本轮成果）。

## 11. 限制与下一门（不判验收）

1. **本轮按授权停止于派发拒绝**：两类阻塞均为场景/目标准备问题，非 11 文件候选引入（相关实现文件不在候选、diff=0）。
2. **不得再自动重试**：协调方指令明确「若 chief 仍派发失败，记录真实回执并停止（不重试）」；本轮未发第 2 条客户消息、未重启、未续跑。
3. **下一门（须再次协调方授权 + 追加预算）建议**：
   - **不要**对文档准备任务传 `moduleId`/`modulePaths`/`moduleDirectory`（应用 `document-planning-module-forbidden`）；让产品按意图层写 v4，必要时由应用从 roster 派生。
   - **更换/清洗运行账本**：使用当前模型下全新 bootstrap 的目标（空账本），或在工作副本中重置 `.ans/state/tasks.jsonl`（保留源账本作为只读来源证据，如实披露「运行时账本重置」）；否则 legacy 10 条非法 `moduleDirectory` 行会使任何投递在 `readOperationEvents` 处 fail-closed。也可选择账本无非法行的合法非贪吃蛇项目。
   - 预置项目角色沿用本 target 副本或另复制并记录来源/哈希；旧模型激活口径披露同 §4。
4. 本记录只陈述事实与偏差；不判 B1/AC/RR 通过或失败；不与 D1/W5/首轮 RR 证据互相替代。

## 12. 证据索引（`角色卡/测试/docs/change/2026-11-10_RR2_document-format-specifications-evidence/`，73 文件）

全量逐文件 SHA-256：`evidence-manifest.txt`（每行 `<sha256> *<相对路径>`，按路径排序；清单自身不在内，可复算）。关键原件：

| 类别 | 文件（相对 evidence 目录） |
| --- | --- |
| 身份/环境 | `pre/pre-summary.json`（`b27692ce…`）、`pre/prepare-target.json`（`59f368eb…`）、`customer-message.txt`（`0ab1b76e…`）、`launch-time.txt`、`electron-stdout.log`、`driver-stdout.log`、`record-identity.txt`（本记录行数/字节/SHA-256） |
| 候选稳定性 | `pre/candidate-sha256.txt`、`post/candidate-sha256-post.txt`、`pre/manifest-src-app-test.txt`、`post/manifest-src-app-test-post.txt`、`post/post-summary.json`（`cd686282…`） |
| 驱动/汇总 | `drive.jsonl`（`1bf4075c…`）、`round2-summary.json`（`cd05b5ac…`）、`live/heartbeat.json`、`ui-0*.jpeg`、`ui-99-final.jpeg`、`ui-final-body.txt` |
| 回执/转录 | `extracts/chief-dispatch-task-inputs.json`（`1f0589f6…`）、`extracts/chief-dispatch-task-receipts.json`（`f542e283…`）、`extracts/chief-prompt-snapshot-meta.json`（`5a0007b0…`）、`extracts/chief-system-prompt.txt`（`80ddaf5d…`）、`extracts/chief-assistant-texts.json`、`extracts/extract-summary.json`（`bfb62d1a…`） |
| 账本/会话 | `tasks-final.jsonl`（`044ca6f9…`，与 pre 相同）、`versions-final.jsonl`（`4df204f4…`）、`diagnostics/`、`diagnostics-userData-post/`、`sessions/`（chief 真实原生转录） |
| 目标/隔离 | `target-pre.sha256`、`target-post.sha256`、`pre/target-manifest-pre.json`、`post/target-manifest-post.json`、`post/target-diff.json`、`post/target-diff.txt`、`post/ports-and-processes-post.txt`、`final-isolation.txt`、`final-workspace-audit.json`（写盘后仓库审计：仅本记录+证据目录新增；候选/manifest 不变） |
| 驱动方法 | `run-scripts/`（prepare-target、preflight、launcher、select-folder-auto.ps1、drive-rr2、shutdown-rr2、finalize-fallback、extract-rr2、postcheck） |

## 13. 状态

- **RR2 修正轮停止于首个决定性结果（派发前拒绝）**：真实 Electron + 真实模型（`deepseek-v4-flash`）+ 真实 UI 单次运行；客户消息 1 条、0 卡；幕僚真实回合读 roster 后派产品被 `document-planning-module-forbidden` 拒绝；产品/项目角色真实读取未发生；9222 零占用、9223 已释放无残留；候选/零触碰/仓库边界稳定。**不判验收；下一门为再次协调方授权后的修正轮（干净账本 + 文档准备任务不带模块字段）。**
- 未提交/推送/合并/发布；未改仓库产品/测试/角色卡/其它文档；本记录之外只写 `2026-11-10_RR2_document-format-specifications-evidence/` 与仓库外运行根 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-10\round2\`。

**（完）**
