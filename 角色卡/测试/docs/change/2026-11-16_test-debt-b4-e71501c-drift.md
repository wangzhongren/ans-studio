# B4 测试债治理：e71501c 语义漂移族（32 名 / 7 文件）

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/fix-test-debt-b4`（分支 `fix/test-debt-b4`，起点 `8d6a35e` = `origin/main`，含 B1b 对 `chief-workflow.test.ts` 的清理修复）
- 范围：`e71501c-drift` 族 32 名 / 7 文件（R3 归因，见 `2026-11-16_remediation-plan_r3-update.md` §3/§4.7 与 `_r3-evidence/11-families.json`、`07-by-file.tsv`）。
- 约束遵守：只改 7 个测试文件 + 本记录/`_evidence/`；**未改产品/workflow/release.yml/角色卡/边界/其他测试**；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 复现参数：逐文件 `node --test --test-timeout=120000`；`chief-workflow.test.ts` 另加 `--test-force-exit`（真实 Core/HTTP 夹具较重；其余 5 个轻文件与 `stuck-redispatch` 均为自然退出，见 §5）。

## 0. 摘要

1. **32 名中 30 名转绿**（每文件 3× 验证，零新增失败）；**2 名（W19、W33）按协调者裁定停手**——判定为**产品缺口/回归候选**（close 通知生产侧缺失），未改产品、未改其断言，见 §3。
2. **W36 / W29-missing-confirmation 3× 本机全绿**（Windows 11 x64）：不可复现 ⇒ 平台/环境候选，**不强行改期望**（§2）。
3. 其余层面：star-routing 7 名按当前 **source 门** fail-closed 语义更新（与 chain-enforcement B3-4 同口径；2 个命名行为用真实账本种子保留）；directive-input 5 名按 **客户入口仅 chief**（e71501c）更新夹具；stuck-redispatch 3 名按 **recordTaskFailure**（不再 closed/rework）更新；handback-delivery 按 trio 回交来源门与 `[收口依据]` 后缀更新；application-line 按异步通知顺序稳定化；decision-service 按 @决策 优先语义更新。逐名依据见 `_evidence/dispositions.tsv` 与 §1/§4。
4. `npm run typecheck` **EXIT=0**。
5. 未改产品；W19/W33 的产品最小恢复建议见 `_evidence/w19-w33-close-notify-investigation.txt`，请协调者/owner 先裁决。

## 1. 逐文件改法与依据（30 名转绿）

完整逐名表见 `_evidence/dispositions.tsv`（列：family/file/name/disposition/basis）。以下按文件摘要。

### 1.1 `test/桌面应用/chief-workflow.test.ts`（13 名；11 绿 / 2 产品候选）
- **W5**（含 `selected`、`commit-race` 子测试）：e71501c/B6.1 起空 trio 聊天默认 fixed，而本链是 legacy 仓库初始化（`git_candidate init` + 通用星形派发），fixed 会以 `stage-request-required` 拒绝。按 B7.1 既有模式，在既有「空目录」断言**之后**显式写 `.ans/project.json` `{workflowSchema:"legacy/v1"}`（只写模式标记，不预置文档/审批/pin）；断言未改。W5 的 `selected`/`commit-race` 由红转绿。
- **W10**（`required` 子测试）：同一原因——required 来源阶段验证 legacy 初始化 `workSourceRef` 链；新增 legacy/v1 标记后通过，断言未改。
- **W34**：当前 chief→convener 团队规划走 hub 准备分支：`runId = run-hub-<hash>`（`src/service/trunk/impl/apply-journal.ts:3841`）、`purpose=builtin-preparation`、`hubRouting=chief-hub-v1`。更新 `/^run-plan-/` → `/^run-hub-/`、`source.purpose` `team-planning` → `builtin-preparation`，并新增 `hubRouting` 断言；「独立 scope（不同 run、creatorReports 绑定、无伪 D3）」断言逐字保留。
- **W29 ×3、W30 ×2、W35、W36**：本机 Windows x64 3/3 绿（整文件 3× 验证）；R3 CI 的红不可复现 ⇒ 平台/环境候选，**不改期望**（§2）。
- **W19、W33**：产品候选，未改（§3）。

### 1.2 `test/桌面应用/star-routing.test.ts`（7 名全绿）
根因：e71501c 起星形文档/交付派发有**来源门**（`document-planning-source-unavailable` / `worker-dispatch-source-unavailable`），且 `prepareRoleDispatch` 校验真实注册生命周期、当前 accepted 轮次与实际 default-core 会话证据。本套件 harness 桩掉 `openRoleSession`、无 `getRegisteredProjectLifecycle`/真实 running origin/真实文档与 run 身份；伪造这些宿主事实会削弱门禁。沿用 **chain-enforcement B3-4 同口径**：裸夹具必须 fail-closed。
- **星形目标**：chief→product / chief→convener 断言 `document-planning-source-unavailable` + 零任务账本 + 零投递；「不能派发给幕僚自己」逐字保留。
- **convener 拥有 dispatch**：断言 `worker-dispatch-source-unavailable` + 零任务 + 零投递；「capability 在场」断言保留。
- **BUG-5 同幂等键重复派发**：去重门先于来源门 ⇒ 用真实账本种子（显式 `idempotencyKey` + `task.reported`/`task.closed`）触发原命名行为（已报告/已收口 → 抑制、不建新任务、不投递）。
- **BUG-5 打开失败**：当前来源门先于 open；断言拒绝码 + 零任务 + 零投递（不再伪造 `rejected` 收口）。
- **BUG-5 排队期间已完成**：派发在入队前 fail-closed；保留「不产生排队投递、不补写 `task.delivered`、占住轮不被抢占」判据。
- **BUG-5 重复回交**：以真实 `task.created` + `listTasks` 登记触发回交层去重；「只投幕僚、报告恰一次」断言保留。
- **AC-4.3**：拒绝不是 advisory 受理；断言无「状态提示（未阻断）」、诊断无 `tasks.dispatch.advisory`、零投递。

### 1.3 `test/桌面应用/directive-input.test.ts`（5 名全绿）
e71501c 起 `Interface.sendSession` 是客户入口，**仅接受 chief 目标**（`app/desktop/interface.ts:3017-3021`，`ui.composer.customerEntryChiefOnly`）。夹具 `listing()` 增加 `chief`（保留 A/B 供控制器层用例），5 个 sendSession 用例的 target/句柄改为 `chief`（“Composer 未开会话”用 `chief/claude` 目标表达未开会话）；指令通道行为、图片拒绝、能力不可用、解释器构造/落账断言均逐字保留。

### 1.4 `test/桌面应用/stuck-redispatch.test.ts`（3 名全绿；C-04 见 §6）
当前 `redispatchTask` 对原任务调用 `recordTaskFailure`（`task.reported status=failed`），**不写 `task.closed`/rework**；升级卡 terminate 同样写 `stuck-escalation:terminate` 失败报告。更新：
- **safe 重派**：原任务 `closed` 为 undefined，末条报告 `failed` 且含 `stuck-terminated:redispatch`；新任务 `taskId/retryOf/同 idempotencyKey/缩窄文本/redispatch 事件` 断言保留。
- **B-07 升级卡**：`closed` 为 undefined，末条报告 `failed` 且含 `stuck-escalation:terminate`；发卡/唯一推荐/去重断言保留。
- **B-07 自动换人**：替代角色选择与任务缩窄断言保留。当前交付层要求真实 flow/run（项目 worker 还需 pinned run 的 `frozenRoles` 授权）；本裸 legacy 夹具无 pinned run ⇒ 投递按来源门 fail-closed（不伪造送达/不自动打开替代会话）。已如实记录该当前语义（不是产品回归）。

### 1.5 `test/桌面应用/handback-delivery.test.ts`（2 名全绿）
- **trio 回交路由**：e71501c 起项目回交投 Steward 前有来源门（`resolveDeliveryAssignment` child-report：`task.created` + `parentTaskRef` + 子报告 + 同 run）。以真实 legacy 父任务（chief→convener）+ draft run + 子任务（convener→A）+ 子报告装配；「项目 worker→Steward、内置来源→Lead、同轮 settle 不双发」断言逐字保留。该用例改用独立临时根（不再写共享 `PROJECT_ROOT`）。
- **B 星形回交**：星形工作结果投幕僚时会追加应用绑定 `[收口依据]` 后缀（basis 可用/不可用两态）。`renderWorkReportPrompt` 仍是固定字段唯一来源：wait 改为前缀匹配 + 单独后缀断言；`[工作结果]`/任务/状态/证据/`task.reported` 断言保留。

### 1.6 `test/桌面应用/application-line.test.ts`（1 名全绿）
`request.notified` 的 created/presented 两条分别挂在 `createdWrite` 后链上，落盘先后由异步 append 调度决定；本机 3× 定向复跑：1 次 `created→presented`、2 次 `presented→created`（R2/R3 CI 亦然）。顺序非产品契约（`notifyRequest` 按 `requestId+event` 去重）；改为**去重集合断言**：三个事件各一次且都通知 chief。

### 1.7 `test/桌面应用/decision-service.test.ts`（1 名全绿）
2026-11-12 B3-1 起 @决策 消费者位于幕僚分支之前；业务 decision 卡（不在 run-change/版本/VCA/升级/修正案等客户主权排除集）会先尝试指令。无匹配指令时回落原卡。断言改为：指令被尝试（≥1 次）但**不结算**、原卡呈现、客户本人裁决（`operatorId="customer"`）、无 judge——「不形成第三个自动执行者」判据保留且更精确。

## 2. W36 / W29-missing-confirmation 3× 定性（改期望前）

| 名称 | 结果（Windows 11 x64，3×） | 结论 |
| --- | --- | --- |
| W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒 | ✔ ✔ ✔（1876.8 / 1929.1 / 1915.7ms） | R3 仅 macOS x64 红（8.3s 断言），本机不可复现 ⇒ **平台/环境候选**；不改期望 |
| W29 … document-change-missing-confirmation 保专业规划scope不授旧执行pin | ✔ ✔ ✔（2521.2 / 2530.6 / 2554.0ms） | R3 仅 Windows「取消前 inline」出现，本机不可复现 ⇒ **平台/环境候选**；不改期望 |

同时 W29 其余 3 个变体、W30 ×2、W35 在整文件 3× 验证中均 3/3 绿（`verify-chief-workflow-run{1,2,3}.txt`），同样按平台/环境候选处理。详见 `_evidence/w36-w29-missing-3x.txt`。

## 3. W19 / W33：close 通知语义结论（产品候选，停手）

**结论：不是测试期望过时，而是产品生产侧缺失。**
- `createDirectRoleRuntime` 中 `activateRoleDocuments`/`completeTeamPlan`/`selectRunChange` 成功回执都会调用 `notify(receipt)`；**`closeCreatedTask` 不调用**，并注释「It is not a document/permission effect and must not start unrelated model turns」（`src/pipeline/orchestration/trunk-runtime.ts:831-836`）。
- close 回执本身含 `applicationId/journalId/targetDigest/source(action=close-created-task)`，满足 `notify()` 的守卫/键。
- 消费侧已完整支持 close 通知：队列对 `notificationSource` 调 `classifyClosedTaskNotice`（`app/desktop/session/delivery/queue.ts:742-745`），trunk 侧对 `action === "close-created-task"` 校验后返回 `information-only`（`src/service/trunk/impl/apply-journal.ts:2304-2359`），并有真实回执分类测试（`test/编排/direct-role-capabilities.test.ts:1480-1542`）。
- 历史：`git log -S "must not start unrelated model turns"` 唯一命中 e71501c；e71501c^ 树无 `closeCreatedTask`/`notifyDirect`（两者均为该 checkpoint 新引入）；W19 断言（`chief-workflow.test.ts:1502`）与 W33 关闭通知等待（`:1832`）也同批引入 ⇒ 生产侧漏接。
- 本机 3/3：W19 稳定失败于「The actual creator receipt must supply notification source」；W33 稳定失败于「The exact cross-run host close notice must retire rather than block the queue」。

按裁定：**未改产品、未改 W19/W33 断言**。最小恢复建议（未实施）：在 `closeCreatedTask` 成功回执后复用同一 `notify(receipt)`（幂等键/pending-recovery/信息型退役均已现成）；W33 另有 `run-docs-` → `run-hub-` 命名漂移，待通知修复后一并更新。完整证据与建议见 `_evidence/w19-w33-close-notify-investigation.txt`。

## 4. 验证（3×，零新增）

| 文件 | 运行方式 | 3× 结果 | 目标名 |
| --- | --- | --- | --- |
| application-line | 自然退出 | 3/3 全绿（3 tests） | 1/1 绿 |
| decision-service | 自然退出 | 3/3 全绿（22 tests） | 1/1 绿 |
| directive-input | 自然退出 | 3/3 全绿（19 tests） | 5/5 绿 |
| handback-delivery | 自然退出 | 3/3 全绿（18 tests） | 2/2 绿 |
| star-routing | 自然退出 | 3/3 全绿（10 tests） | 7/7 绿 |
| stuck-redispatch | 自然退出 | 3/3：9 pass / 1 fail（C-04 switch-on，见 §6） | 3/3 绿 |
| chief-workflow | `--test-force-exit`（重文件，注明） | 3/3：64 pass / 2 fail（W19、W33，§3） | 11/13 绿 |

- 目标失败名逐名转绿：30/32（W19、W33 除外，均已定性为产品候选）。
- 其余名不变、零新增：每文件失败集合与改动前逐名对比见 `_evidence/verify-*.txt` 与 `dispositions.tsv`；`stuck-redispatch` 仅剩 C-04（改前已在，属 hang 族/B1，不在 B4 范围）；`chief-workflow` 仅剩 W19/W33。
- `npm run typecheck`：**EXIT=0**（`tsc --noEmit`）。

复现命令：
```bash
node --test --test-timeout=120000 "test/桌面应用/<file>.test.ts"            # 5 轻文件 + stuck
node --test --test-timeout=120000 --test-force-exit "test/桌面应用/chief-workflow.test.ts"
```

## 5. 剩余名 / 边界

- **剩余红（2，均为本批目标但按裁定停手）**：W19、W33（close 通知产品候选，§3）。
- **本文件内改前已红、改后仍红且不在 B4 范围**：`test/桌面应用/stuck-redispatch.test.ts` 的
  `C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选 terminate ⇒ 0 张客户卡 + 结果行 + 任务收口`
  （R3 挂起族/B1 有界快速失败；本地 3/3 红，10s 有界 + 清理 ENOTEMPTY；不在 B4 范围，未改）。
- **平台/环境候选（不改期望）**：W36、W29-missing-confirmation、W29 其余 3 变体、W30 ×2、W35。
- **覆盖说明（star-routing）**：5 个由「受理/投递行为」转为「来源门 fail-closed」的用例，其原受理面
  由真实项目链覆盖（`chain-enforcement.test.ts` B3-4 M1/M2/M5-M8、固定路径与 `dispatch-advisories`
  纯逻辑用例）；2 个 BUG-5 去重行为以真实账本种子继续覆盖。
- **未做**：未改产品（含 W19/W33 修复）、未 commit/push、未触发 CI、未 tag、未碰 main、未读 `.env`、未占 9222/9223/9224。

## 6. 证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-b4-e71501c-drift_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-verification-summary.txt` | 7 文件 3× 验证的逐轮 tests/pass/fail 与残留失败名汇总（由日志生成） |
| `dispositions.tsv` | 32 名逐名处置与依据（file/name/disposition/basis） |
| `w36-w29-missing-3x.txt` | W36 与 W29-missing-confirmation 的 3× 定向复跑结果与结论 |
| `w19-w33-close-notify-investigation.txt` | W19/W33 close 通知语义调查：代码/历史/消费侧证据 + 最小恢复建议 |
| `verify-application-line-run{1,2,3}.txt` | application-line 3× 自然退出日志 |
| `verify-decision-service-run{1,2,3}.txt` | decision-service 3× 自然退出日志 |
| `verify-directive-input-run{1,2,3}.txt` | directive-input 3× 自然退出日志 |
| `verify-handback-delivery-run{1,2,3}.txt` | handback-delivery 3× 自然退出日志 |
| `verify-star-routing-run{1,2,3}.txt` | star-routing 3× 自然退出日志 |
| `verify-stuck-redispatch-run{1,2,3}.txt` | stuck-redispatch 3× 自然退出日志（C-04 残留） |
| `verify-chief-workflow-run{1,2,3}.txt` | chief-workflow 3×（`--test-force-exit`）日志（W19/W33 残留） |
