# RR：judge-delegated 真实运行取证记录（judge 代批生效）

- 日期：2026-11-09；角色：ans-studio 固定 worker「测试」（roleId: 测试），独立验证上下文。
- 任务：对「judge 代批生效」变更执行 **RR 真实运行**（B1 v1.1 AC-J10/AC-J11/AC-J12、RR-1–RR-7）：开启「替我决策」→ 真实角色发起 `intent-confirm` → judge（chief 代批）批准 → 冻结成功且证据如实记 judge；关闭开关 → 原卡回落客户本人。
- 本记录**只取证、不判验收**；未修改任何产品/测试/角色卡/其它文档；只写 `角色卡/测试/docs/change/` 本文件与同名证据目录，以及仓库外运行根 `C:\Users\51054\Desktop\work\ans-judge-delegated-run-2026-11-09\`。未提交/推送/合并/发布。
- 工作目录 worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；基线 HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；运行前后不变）。Node **v24.22.1**，npm 11.19.1，Electron 44.7.0。
- 状态：**RR 取证完成（开/关两腿各一次隔离真实运行）。两腿均达成首个决定性证据后停止：judge-on 冻结 `intent-confirmed`/`origin:"judge-delegated"` 成功且与账本逐字段一致；judge-off 原卡回落客户本人、judge 调用数 0、客户冻结成功。9222 零占用/零改动、9223 已释放、无 Electron 残留、候选 25 文件/聚合与 manifest 前后不变。未判验收。**

## 0. 结论摘要（供 B2 使用，不代替验收判定）

| 项 | 结果 |
| --- | --- |
| AC-J10（judge-on，真实） | **证据面达成**：真实 Electron + claude 引擎 + 真实 UI；「替我决策」ON（`checked:true`）→ 真实 chief 发起 `intent-confirm`（`requestId=req-86b6b0640c4ba662`，真实 marker）→ judge approve（`engine:"claude"`、`reasonCode:"sufficient"`、14,490ms）→ `request.resolved{by:"judge", operatorId:"judge:claude", decisionId:"decision-req-86b6…"}` → R9 baseline 冻结 `intent-confirmed`/`origin:"judge-delegated"`、`applicationId:"intent-req-86b6…"`、`source` 与账本逐字段一致、无 `decidedBy`/`decisionId`/`actorRoleId`；`freeze-committed`，无 pending-recovery；`readConfirmedIntentEvidence` ok=true；本轮未产生 `doc.freeze` 事件 |
| AC-J11（judge-off，真实） | **证据面达成**：同一驱动第二隔离实例，开关 OFF（`checked:false`）→ 原卡呈现客户（`request.presented{to:"customer"}`；真实决策对话框 confirm/revise）→ 客户本人点卡（`by:"customer"`、`operatorId:"51054"`、真实 `decisionId:"decision-req-9a03…"`）→ 客户 `intent-confirmed` 冻结成功（`origin:"customer"`、`decidedBy:"customer"`、`source.customer-decision`）；**judge 调用数 0**（无任何 `governance-judge.*` 事件） |
| AC-J12（隔离/预算） | **符合**：CDP 仅 9223；独立 `--userData`（两腿各一）；仓库外独立目标根（`target`/`target2`）；9222 全程零占用/零改动（贪吃蛇两个根 108/88 文件前后 SHA-256 逐文件一致）；9223 运行期监听、结束后无 LISTENING、无 Electron 残留；每腿客户消息 1、intent-confirm 卡 1、chief 模型回合 1、墙钟 34s/16s（驱动口径）、首果即停、不自动重试；开/关各一次隔离运行 |
| 候选稳定性 | `git status --porcelain -- src app test` 前后逐行相同（25 项）；write-set 聚合 **`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`** 前后一致；`src app test` manifest 聚合 **`2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`** 前后一致；HEAD/tree 不变；`app/desktop` diff=0 |
| 如实披露 | `.env` 实测模型 **`deepseek-v4-flash`**（经 `ANTHROPIC_BASE_URL` 代理；非 Anthropic Claude 模型）——引擎标识仍为 `claude`、judge 审计无 `model` 字段；预检时点 9222 **无监听**（贪吃蛇运行当时未在跑），全程未触碰；驱动两腿退出码 13（`Browser.close` 后 unsettled top-level await 的工具面记录，见 §6） |

## 1. 环境与配置（RR-1）

| 项 | 值 |
| --- | --- |
| 入口 | 本 worktree 真实 `app/main.ts`（`repo_main_sha256=339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`），经仓库外 launcher `app.setPath("userData")` 后动态 import；**未改 app 代码、未重新构建 renderer**（使用既有 `app/renderer/dist`） |
| 启动命令 | `node_modules/electron/dist/electron.exe <run-root>/rr/launcher.mjs --remote-debugging-port=9223`（cwd=worktree；`ANS_RR_USERDATA` 指向隔离 userData；`RR_REPO_MAIN` 缺省即本 worktree `app/main.ts`） |
| 运行时 | 产品 `claude` 引擎适配器（`RuntimeKind="claude"`；非 demo、非 pi/codex）；judge 审计 `engine:"claude"` |
| 模型（披露） | `.env`：`ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANTHROPIC_BASE_URL=https://…/deepseek`、`ANS_CLAUDE_REASONING_EFFORT=high`（键名如实入档，值不回显）。**实际后端模型为 deepseek-v4-flash，不是 Anthropic Claude**；judge 审计如实只含 `engine`、无 `model` 字段（`source.model` 随账本缺省）。是否满足 B1「真实 Claude（非 demo）」由独立验收判定，本记录不判 |
| CDP 端口 | **9223**（预检空闲；运行期仅本实例监听；结束后释放） |
| userData | `…\ans-judge-delegated-run-2026-11-09\userData`（judge-on）与 `…\userData2`（judge-off）；全新独立目录，不写全局 `%APPDATA%/Electron` 共享态 |
| 目标根（仓库外） | `…\ans-judge-delegated-run-2026-11-09\target`（flowId `judge-demo`）、`…\target2`（flowId `judge-demo2`）；均为新构造最小项目，含真实字节：`docs/product/<flow>-intent-v1.md`（YAML frontmatter `schema: project-intent/v1`、`intentId`/`flowId`/`version` 一致）、`docs/intents/<flow>.md`（goal/scope/acceptance/nonGoals/constraints）、proposal/modules/roster、architecture 等；**未创建任何 draft run**（本变更不依赖 draft 路径） |
| 运行根 | `C:\Users\51054\Desktop\work\ans-judge-delegated-run-2026-11-09\`（rr/ 驱动、evidence/、pre/、post/；不写仓库内任何运行根） |

单条客户消息（每腿各 1 条；完整原文见 `judge-on/customer-message.txt`、`judge-off/customer-message.txt`）：要求 chief「不要运行 shell、不要写入任何文件、不要发其它卡」，调用 `request_choice(cardKind=intent-confirm, flowId=<flow>)` 发出确认卡（选项 `confirm`/`revise`）。

## 2. AC-J10（judge-on）取证（RR-2）

### 2.1 时间线（UTC，原件见 `judge-on/drive.jsonl`）

| 时刻 | 事件 |
| --- | --- |
| 08:50:31 | Electron 启动（隔离 userData；CDP 9223） |
| 08:50:48.9 | 真实 UI 导入 `target`（native 文件夹对话框自动填写） |
| 08:50:53.8 | `session.open.ready`（chief，claude） |
| 08:50:55.7 | 「替我决策」开关 ON：`#judge-decision-toggle` `checked:true, disabled:false` |
| 08:50:55.8 | 唯一客户消息发送（输入框清空确认） |
| 08:51:03.599 | `request.created`：`requestId=req-86b6b0640c4ba662`、`flowId=judge-demo`、`cardKind=intent-confirm`、`sourceRoleId=chief`、`context` 含真实 marker（`snapshot=s-intent-b6d7fb27…`、`sha256=9f318d92…`、`version=1`） |
| 08:51:03.60 | `governance-judge.started`（judge 模型会话；证据包 `integrity.complete=true`） |
| 08:51:18.09 | `governance-judge.approve`：`reasonCode:"sufficient"`、`durationMs:14490`、`readCalls:1`、`readBytes:2006` |
| 08:51:18.113 | `request.resolved`：`by:"judge"`、`operatorId:"judge:claude"`、`decisionId:"decision-req-86b6b0640c4ba662"`、`selectedOptionIds:["confirm"]`、`judge{group:"decision", cardKind:"intent-confirm", engine:"claude", reasonCode:"sufficient", selected:["confirm"], 无 model}` |
| 08:51:18.149 | `versions.jsonl` R9 baseline 新增 `event:"frozen"` 行：`reason:"intent-confirmed"`、`origin:"judge-delegated"`、`applicationId:"intent-req-86b6b0640c4ba662"`、`source.kind:"judge-delegated"`、`frozenAt===source.at===08:51:18.113Z` |
| 08:51:18.160 | 诊断 `intent.confirmation.freeze-committed`（`phase:"committed"`）；**无** `freeze-pending`、无 pending-recovery |
| 08:51:22.7 | 首个决定性证据达成 → halt（截图/复制/停止应用） |

### 2.2 冻结与账本原件（关键字段）

- 冻结记录（`judge-on/versions-final.jsonl` 第 6 行；原件亦见 `target-state/judge-on/state/versions.jsonl`）：
  - `schema:"doc-freeze/v1"`、`applicationId:"intent-req-86b6b0640c4ba662"`、`reason:"intent-confirmed"`、`origin:"judge-delegated"`；
  - `source:{kind:"judge-delegated", requestId:"req-86b6b0640c4ba662", engine:"claude", operatorId:"judge:claude", reasonCode:"sufficient", reason:"<账本原文>", selected:["confirm"], cardKind:"intent-confirm", at:"2026-11-09T08:51:18.113Z"}`（`model` 随账本缺省而不写）；
  - `snapshotRef:{snapshotId:"s-intent-b6d7fb27ea1b8f4c3faacd8ef384c0022ccb51be58947b656626bc26481a186c", digest:"519b860459a19256d46a9cbf9d1ab6d696ee7765e1b07cf64ebcbbd9448acc88"}`；`frozenAt:"2026-11-09T08:51:18.113Z"`；
  - **无** `decidedBy`、**无** `decisionId`、**无** `actorRoleId`；`operatorId === "judge:" + engine`。
- 账本对账：`request.resolved.judge` 与 `source` 的 `engine/operatorId/reasonCode/reason/selected/cardKind/at` 逐字段一致；`applicationId` 由真实 `requestId` 派生；`frozenAt` 等于 `resolved.at`。逐项机械核对 **24/24 全 true**（`verification/judge-on-freeze-field-verification.json`，`pass:true`）。
- `doc.freeze` 事件：`tasks.jsonl` 仅 `request.*` 行（6 行），**无 `doc.freeze` 事件**（与 AC-J1-6 一致；judge 冻结只写 R9 baseline）。
- 下游可消费：运行结束后以仓库实现做**只读**复核 `readConfirmedIntentEvidence(target, "docs/product/judge-demo-intent-v1.md")` → `ok:true`（`sha256:9f318d92…`、`confirmationDigest:406e2b4f…`、`ledgerDigest:904d4ca2…`；见 `verification/judge-on-readConfirmedIntentEvidence.json`）。
- 快照字节：`s-intent-b6d7…json`（`complete-snapshot/v1`，7,563 bytes，`sha256:3c9a9a01…`）内嵌 `docs/product/judge-demo-intent-v1.md` 5336 bytes，与目标盘面逐字节一致（`byteIdentical:true`）。
- UI：`judge-on/ui-09-decisive.jpeg` 显示「已代批 (intent-confirm)」「判断引擎：Claude · operator: judge:claude」「选中项：confirm」及系统行「判断代批：confirm」。

### 2.3 预算与纪律（judge-on）

- 客户消息 **1**；`intent-confirm` 卡 **1**；chief 模型回合 **1**（replay `settled` 计数）；judge 模型会话 **1**（14.49s，读取 1 次 / 2,006 bytes，不持久化）。
- 墙钟：驱动 34s（消息后→停止）；launch→driver exit ≈ 67s。首果即停；**未自动重试**；未出现非本变更卡、越界写或非预期模型调用。

## 3. AC-J11（judge-off）取证（RR-3）

### 3.1 时间线（UTC，原件见 `judge-off/drive.jsonl`）

| 时刻 | 事件 |
| --- | --- |
| 08:52:14 | 第二隔离实例启动（独立 `userData2`、独立 `target2`、CDP 9223） |
| 08:52:34.2 | `session.open.ready`（chief） |
| 08:52:35.3 | 开关保持 OFF：`#judge-decision-toggle` `checked:false, disabled:false` |
| 08:52:35.3 | 唯一客户消息发送 |
| 08:52:39.384 | `request.created`（`req-9a03babc4a474269`、`judge-demo2`、intent-confirm、chief；context 含 marker `s-intent-efdb2739…`） |
| 08:52:39.395 | `request.presented{to:"customer"}`（诊断 `interaction.presented`） |
| 08:52:39.5 | 真实决策对话框呈现客户：标题「确认「judge-demo2」需求意图（v1）」、选项 `confirm`/`revise`、正文含完整意图与 marker（`judge-off/dialog-pre.json`、`ui-05-dialog-pre.jpeg`） |
| 08:52:39.563 | 客户本人点卡（驱动在真实对话框完成 ack/选项 `confirm`/提交）：`interaction.response`/`interaction.response.end` |
| 08:52:39.565 | `request.resolved`：`by:"customer"`、`operatorId:"51054"`、`decisionId:"decision-req-9a03babc4a474269"`、`selectedOptionIds:["confirm"]`、**无 `judge` 字段** |
| 08:52:39.595 | `versions.jsonl` 冻结行：`reason:"intent-confirmed"`、`origin:"customer"`、`decidedBy:"customer"`、`decisionId:"decision-req-9a03…"`、`source.customer-decision`、`frozenAt===resolved.at` |
| 08:52:39.605 | 诊断 `intent.confirmation.freeze-committed` |
| 08:52:45.8 | halt（截图/复制/停止应用） |

### 3.2 关键核对

- **judge 调用数 0**：诊断全程无任何 `governance-judge.*` 事件（`judge-off/freeze-field-verification.json` 的 `no_judge_events_after_start:true`）；`request.resolved` 无 `judge` 字段；开关 OFF 已在 `summary.json.toggle` 记录（`checked:false`）。
- 客户冻结与既有路径一致：`origin:"customer"`、`decidedBy:"customer"`、真实应用 `decisionId`、`source:{kind:"customer-decision", decisionId, requestId, at}`；字段核对 **15/15 全 true**（`verification/judge-off-freeze-field-verification.json`）。
- 下游可消费：`readConfirmedIntentEvidence(target2, "docs/product/judge-demo2-intent-v1.md")` → `ok:true`（`sha256:1dc5979f…`；`verification/judge-off-readConfirmedIntentEvidence.json`）。
- 快照 `s-intent-efdb2739…json`（7,568 bytes，`sha256:3bca378b…`）内嵌意图文件与盘面逐字节一致。

### 3.3 预算（judge-off）

- 客户消息 **1**；`intent-confirm` 卡 **1**（off 腿按任务允许另起一卡，使用独立 `target2`/`userData2` 以避免与 on 腿冻结记录冲突）；chief 模型回合 **1**；墙钟 16s（消息后→停止），launch→driver exit ≈ 47s；不自动重试。

## 4. AC-J12 隔离、预算与候选稳定性（RR-4/RR-5）

### 4.1 端口/进程（`pre/ports-process.txt`、`post/ports-process.txt`）

- **预检 08:50:12Z**：netstat 无 9222/9223 监听；curl 两端口均不可达；无 Electron 进程。**如实记录：B1 预期的「9222 由贪吃蛇占用」在本次预检时点未出现（贪吃蛇运行当时未在跑）；本 RR 全程未启动/占用/关闭 9222，也未触碰其运行根。**
- **后检 08:53:30Z**：9223 无 `LISTENING`（仅 TIME_WAIT 客户端连接）；9222 不可达；无 Electron 进程 ⇒ 9223 释放、无残留。

### 4.2 贪吃蛇根零改动（只读哈希）

- `ans-game2d-snake-run-2026-11-09`（108 文件）与 `ans-game2d-snake-2026-11-09`（88 文件）：运行前后逐文件 SHA-256 清单 `diff` 均为**空**（`post/snake-run-root-diff-pre-vs-post.txt`、`post/snake-target-diff-pre-vs-post.txt`，0 bytes）。

### 4.3 git/候选（BASE-4/BASE-5 口径）

- HEAD `fb1aa39…`、tree `ee33c3e9…`、分支不变；`git status --porcelain -- src app test` 前后逐行相同（25 项：11 src M + 12 test M + 2 新测试文件）；`git diff --stat -- src app test` = 23 文件 +1318/−82（与 D1 一致）；`git diff --stat -- app/desktop` 为空。
- write-set 逐文件 SHA-256 与 canonical 聚合前后一致：**`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（`pre/write-set-actual.tsv` vs `post/write-set-actual.tsv` diff 0）。
- `src app test` manifest 前后逐字节一致：1,107 条目、聚合 **`2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（`post/manifest-diff-pre-vs-post.txt` 0 bytes）。
- 全仓 `git status` 相对运行前唯一新增为**本角色卡证据目录**（`?? 角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness-evidence/`，属允许写区）；`src app test` 无任何新增/改动。

### 4.4 预算汇总（两腿合计，如实）

| 项 | judge-on | judge-off | 合计/限额 |
| --- | --- | --- | --- |
| 客户消息 | 1 | 1 | 2（每腿 ≤1） |
| intent-confirm 卡 | 1 | 1（说明见 §3.3） | 2（每腿 ≤1） |
| 模型回合 | chief 1 + judge 1 | chief 1 + judge 0 | chief 2、judge 1 |
| 墙钟（驱动口径） | 34s | 16s | 均 < 20 min/腿 |
| 隔离运行次数 | 1 | 1 | 2（≤2） |
| 自动重试 | 无 | 无 | — |

## 5. 如实披露与边界

1. **模型披露（重要）**：本次真实运行使用产品 `claude` 引擎适配器并发生真实模型调用（非 demo），但 `.env` 配置的后端模型是 **`deepseek-v4-flash`**（经 `ANTHROPIC_BASE_URL` 代理），不是 Anthropic Claude 模型；judge 审计如实只记 `engine:"claude"`、无 `model` 字段。B1 v1.1 AC-J10-1「真实 Claude（非 demo）」是否按此满足，由独立验收判定；本记录不以任何方式宣称已满足该项。
2. **9222 预检态与 B1 预期不同**：预检时 9222 未被贪吃蛇占用（其运行未激活）。本 RR 未触碰 9222/贪吃蛇根（哈希证明），故「9222 零占用/零改动」成立；「只读确认 9222 由贪吃蛇占用」的时点事实不成立，如实记录。
3. **驱动工具面**：两腿 driver 进程退出码 **13**（`Warning: Detected unsettled top-level await at drive.mjs:492 await finalize()`），原因为在 `finalize` 内发出 `Browser.close` 后 CDP socket 先行关闭、该 await 未返回；其前的 `btn-halt`、`stopSession`、截图、账本/诊断/快照/会话复制与 `summary.json` 写盘均已完成，应用进程已退出、9223 已释放。属驱动收尾方式记录，不影响已取得的取证；未自动重试、未改测试/求绿。
4. **客户点击方式**：judge-off 腿的「客户本人点卡」由驱动在**真实决策对话框**完成（ack + 选中 `confirm` + 提交），operatorId `51054` 由应用既有会话产生；驱动不是第二个客户身份，未伪造 customer 字段。
5. **未覆盖**：未触发「下一真实门」（pin/handoff/发布）——以下游只读复核 `readConfirmedIntentEvidence` ok=true 作为「冻结可被下游消费」的证据；未运行确定性测试（D1 已覆盖）与 B2 判定。本 RR 不判验收。
6. **运行路径事实**：judge-on 的 judge 由真实模型会话完成（14.49s，1 次读取 2,006 bytes，证据包 `integrity.complete=true, conflicts=0`）；judge 结论 `approve/sufficient` 与卡面 `confirm` 一致；无 `actionSource`/`directiveId` 混入。

## 6. 工具面与停止记录

- 停止点（两腿）：首个决定性证据达成即 halt——judge-on 为 R9 baseline `origin:"judge-delegated"` 冻结行 + `intent.confirmation.freeze-committed` 诊断（+4s 稳定窗）；judge-off 为 `origin:"customer"` 冻结行 + `request.resolved by customer` + `freeze-committed`。
- driver exit code 13：见 §5-3；原始 stdout 见 `judge-on/driver-stdout.log`、`judge-off/driver-stdout.log`，时间记录见各自 `launch.txt`。
- 诊断覆盖：两腿均**未出现** `chief-decision.*` 事件（无幕僚决策失败）；judge-on 关键诊断为 `session.open.*`、`governance-judge.started/evidence/approve`、`intent.confirmation.freeze-start/committed`；judge-off 为 `session.open.*`、`interaction.presented/response/response.end`、`intent.confirmation.freeze-start/committed`，且**无任何 `governance-judge.*`**。全部诊断原件已整体复制入证据目录。

## 7. 证据索引

目录：`角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness-evidence/`（**126 文件**，`evidence-manifest.txt` SHA-256 **`87bd82fb948f9f981a812dd69a36411be87ba974da5b4ee662b80f7bc4300555`**，可复算）。

| 路径 | 内容 |
| --- | --- |
| `pre/env.txt`、`status-src-app-test.txt`、`status-full.txt`、`write-set-actual.tsv`、`write-set-canonical-aggregate.txt`、`manifest-src-app-test.tsv`、`manifest-canonical-aggregate.txt`、`manifest-counts.txt`、`ports-process.txt`、`snake-*.sha256.tsv` | 运行前环境/候选/端口/贪吃蛇根快照 |
| `post/` | 运行后同名快照 + `write-set-diff-pre-vs-post.txt`（0B）、`manifest-diff-pre-vs-post.txt`（0B）、`snake-*-diff-pre-vs-post.txt`（0B）、`diffstat-*` |
| `judge-on/customer-message.txt`、`drive.jsonl`、`launch.txt`、`driver-stdout.log`、`electron-stdout.log` | judge-on 驱动日志与运行配置 |
| `judge-on/tasks-final.jsonl`（`sha256:e3eacf98…`）、`versions-final.jsonl`（`1eb1dbd2…`） | 请求账本与 R9 baseline 原件（字节拷贝） |
| `judge-on/snapshots/s-intent-b6d7…json`（`3c9a9a01…`）+ `.meta.json` + `.verification.json` | 意图快照原件/摘要/逐字节校验 |
| `judge-on/diagnostics/ans-diagnostics-2026-11-09.jsonl` | 诊断原件（`session.open.*`、`governance-judge.*`、`intent.confirmation.*`） |
| `judge-on/sessions/` | 会话 replay/原生记录（tool 入参与回执） |
| `judge-on/ui-*.jpeg`、`ui-final-body.txt`、`summary.json`、`budget.json`、`request-rows.jsonl` | UI 截图/正文、汇总与预算 |
| `judge-off/`（同上结构）+ `dialog-pre.json`、`ui-05-dialog-pre.jpeg` | judge-off 驱动日志、账本（`tasks 613bf5bf…`、`versions 22efc0af…`）、客户卡对话框原件、UI |
| `target-state/judge-on|judge-off/state/{tasks.jsonl,versions.jsonl,doc-freezes.json}`、`snapshots/`、`target-docs.sha256.tsv` | 目标项目账本/冻结/Baseline 原件与目标文档哈希 |
| `verification/judge-on-freeze-field-verification.json`（24/24）、`judge-on-readConfirmedIntentEvidence.json`（`ok:true`）、`judge-off-freeze-field-verification.json`（15/15）、`judge-off-readConfirmedIntentEvidence.json`（`ok:true`） | 字段级核对与只读下游复核 |
| `run-config/` | launcher/driver/对话框自动化/后检/复核脚本（仓库外运行配置拷贝） |

复算入口：`role-card evidence/run-config/post-snapshot.sh`（前/后快照口径）、`run-config/verify-intent-evidence.mjs <projectRoot> <relPath> <out>`（只读复核 `readConfirmedIntentEvidence`）。

## 8. 状态

- **RR 真实运行取证完成（开/关两腿）**：AC-J10「judge 代批生效、证据如实记 judge」与 AC-J11「关闭开关回落客户本人」均取得真实原件（账本/冻结/快照/诊断/UI）；AC-J12 隔离/预算/候选稳定性符合记录口径；已如实披露模型（deepseek-v4-flash）、9222 预检态与驱动退出码。
- **不判验收**：本记录供独立验收按 B1 v1.1（AC-J10/J11/J12、RR-1–RR-7）判定；未提交/推送/合并/发布；未修改产品/测试/角色卡/其它文档。
