---
id: request-gate-review-acceptance
type: change
title: request_gate_review 实现批次独立验收——客户标准 1–6 与设计 §10 A1–A8 逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: missing-evidence
related: [proof-gate-reviews, request-gate-review, gate-review-cards, lead-system-message-report-only]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对未提交工作树（分支 feat/scaffold-first-governance，HEAD 5bd9fe4，38 tracked 文件 +4728/−281 加 9 个未跟踪批次文件，候选清单摘要 9a7e9a15…）按客户标准 1–6 与设计 §10 A1–A8 独立判定；逐条核对 request_gate_review 仅 convener 注入、gateKind 解析、completeGateStep pass/fail/minor-only 分支、gate.review 账本约束、桌面派发/记录/返工/恢复、Lead 系统消息规则与 request_acceptance 零回归；独立复跑 typecheck 0、desktop 663/663、orchestration 985/983（既有 Windows symlink EPERM）/1 skip、runtime-core 329/322（3 既有 EPERM）/4 skip、gate 330/329/0/1 skip、i18n 200/195/0/5 skip，另有新增文件定向 25/25 与桌面两文件 223/223。未发现实现缺陷或弱化断言；因设计 A5/A7 要求的真实 Electron/浏览器或真实流程 e2e（以及真实模型/Proof 行为）未跑、A8 多 gate/记录损坏故障注入未直接覆盖，按设计 §10「全适用行 pass 且证据对应当前候选才通过」判 missing-evidence；若客户书面把 A5/A7 真实 e2e 收窄到首个 gate-bearing 项目，则其余标准均 pass。
---

# request_gate_review 实现批次独立验收

**总体结论：missing-evidence。** 客户标准 1–6 与设计 A1–A4、A6、A8 的确定性实现面均核对通过；未发现 needs-work 级缺陷，未发现 skip/only/弱化断言或伪造证据。缺失的是设计 A5/A7 明列的**真实 Electron/浏览器（或真实流程）e2e**证据，以及真实模型/Proof 按卡执行 gate 复核的行为证据；当前候选没有任何含 `gateKind` 的真实项目 flow（`demos/` 均无；设计 Q8 明确不迁移 castle），因此这类证据本轮无人执行。按设计 §10「全适用行 pass 且证据对应当前候选才通过」，本角色不能把该项记为 pass。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写自身 `docs/change/`、`feature-map.md`、`memo.md`；未改产品源码、测试源码、共享 i18n、其他角色文档或断言；未 commit / push。

## 一、标准与依据

本批为实施完成后的独立验收。客户在交接中给出验收标准 1–6；设计为 `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md`（`approved-implementing`，revision 3，SHA-256 `4969ae45f043a429…`）。标准固定如下（事后标准；仓库中未见本批实施前由本角色固定的设计文档）：

| 编号 | 客户标准 | 主要判据 |
| --- | --- | --- |
| C1 | 仅统筹注入/可调用；回执如实；未知 code fail-closed | `request_gate_review` 只在 convener 会话注册；`dispatched` 只表示已派 Proof；契约外 code 一律 fail-closed |
| C2 | gate 用 `kind: artifact` + 可选 `gateKind`，不新增 FlowStepKind，id/owner/evidence 校验；下游 dependsOn 硬拦；旧 flow 逐字不变 | 解析器/序列化/静态校验；`dependencies-not-done`；ready/completion；旧 flow 回归 |
| C3 | 应用校验/派发/记录/账本/报告处置/恢复按设计 §5–§8；`completeGateStep` app-only；角色 `flow_step_update(done)` 被 `gate-review-required` 拒绝；observe 跳过 gate；gate 结论不进 customer.decision/分诊/验收卡 | flow-service/desktop/ledger 实现与测试；账本断言 |
| C4 | 防吹毛求疵：pass 可带 minor/nit；fail 必须至少一个 blocker/major；只有 minor/nit 的 fail 返回 `returned-to-proof`、不标 done、不返工；缺/坏报告退回 Proof | `classifyGateReviewTriage`/`completeGateStep`/桌面处置测试 |
| C5 | 主理收到系统消息只向客户汇报、不得给统筹派任务；角色卡 + 编排 prompt + 桌面系统消息文案；客户消息触发的协调不回归 | `LIAISON_CARD_TEXT`、编排 prompt、`buildGovernanceCoordinationTaskMessage`、测试 |
| C6 | 不弱化断言、不新增第二套门禁/状态、不改 `request_acceptance` 语义；测试与证据真实 | diff、零回归测试、skip/only 扫描、独立复跑 |

设计 §10 A1–A8 逐行判断见 §四。

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD | `5bd9fe48194c48de8898e1c85aad2c8c386a3aea`（验收期间未变；未新增提交） |
| 候选状态 | **未提交工作树**：38 个 tracked 修改（`git diff --shortstat` = +4728/−281）+ 9 个未跟踪批次文件（3 个测试 + 6 个角色 change 记录）；`.claude/`、`demos/` 未跟踪，属其他任务，不在候选范围 |
| 候选清单摘要 | 47 个批次文件按路径排序的 `sha256` 清单再 `sha256` = `9a7e9a15262139fdec690cb7c6dcb10158682e7cde45e075d7ed6f23689f6385`（清单生成方式见 §六） |
| 关键文件哈希（前 16 位） | `runtime.ts bdec56652eeea64a`、`tools.ts 375ad327fef57bac`、`schema.ts 330cf99e4b6254f2`、`flow-state(编排) 204641e5aacf16cf`、`flow-service a3bf1ce27b90f630`、`governance-gate 4054d1be7b8766c5`、`governance-ledger 4a52f7c13afcbda7`、`governance-roles 287b59e9a7d79818`、`run-role 050f3aac0ce39bbc`、`pipeline/flow-state a4f87a09e5b38722`、`govern-session fa7dc0068536d10d`、`interface 0e125f58b866573d`、`session 903c13d31d545ccb`、`governance-advance 7b433ac1d2a43410` |
| 新增测试哈希（前 16 位） | `request-gate-review-tool.test.ts 4f17c17f0768844a`、`flow-gate.test.ts 68a26c54a1ed45b2`、`request-gate-review.test.ts 408a1df3bfdba21e` |
| 平台 / Node / npm | Windows 11 Pro 10.0.26300 / Node v24.22.1 / npm 11.19.1 |

说明：`.claude/` 与 `demos/` 的未跟踪文件未纳入候选清单；`demos/` 下无任何含 `gateKind` 的 flow（见 §七）。

## 三、客户标准 1–6 逐条结论

### C1 仅统筹注入/可调用、回执如实、未知 code fail-closed —— **pass**

- 编排注入：`run-role.ts` 仅 `builtInGovernance && trioSpec?.id === "convener"` 时把 `input.requestGateReview` 放入 capabilities；项目角色、其他内置治理角色、single/su 即便调用方误给也不注入（`run-role.ts:1373-1381`）。
- 桌面注入：`session.ts` 仅 `governanceFunction === "schedule"` 时注入（`session.ts:2209-2215`），项目绑定后传到 `openRoleSession`；`interface.ts:7982` 把能力交给 SessionManager。两层判据等价（convener id ↔ schedule 职能），互为兜底。
- 工具注册：`buildGovernedTools` 仅在 `options.requestGateReview` 存在时注册；未注入即工具不存在（`tools.ts:3244-3250`）。工具层只做 `gateId` slug、`flowId` 字符串、`note` 非空且 ≤2000 码点的形状校验，非法参数在触达能力前拒绝。
- 回执：`requestGateReviewResultMessage` 原样转达 `ok/code/message`（可带 flowId/gateId/runtime）；`dispatched` 的模型可见文案逐字包含「gate 复核 ≠ 验收通过 ≠ 客户批准」「dispatched 只表示已派 Proof」「不代表 gate 已通过」；契约外回执（含 `ok:true, code:"passed"/"done"/未知 code`）一律 `ok:false`「未返回明确结果，按未派发/失败处理」；能力抛错/会话中止同样不假设已派发。
- 证据：`test/runtime-core/request-gate-review-tool.test.ts` 10/10；`test/编排/request-gate-review.test.ts` 2/2（convener 注入、非 convener/su/项目角色不注入）；`test/桌面应用/acceptance-dispatch.test.ts` 注入矩阵（convener 有、liaison/rapporteur/nominator/verifier/executor 无）。本角色定向复跑三文件 25/25。

### C2 gateKind 表达、静态校验、下游硬拦、旧 flow 不变 —— **pass**

- `FLOW_STEP_KINDS` 仍为 `["dispatch","customer-decision","artifact","acceptance"]`；新增 `FLOW_GATE_KINDS = ["vertical-slice","visual-baseline","integration-performance"]` 与 `FLOW_GATE_STEP_ID_PATTERN = ^gate-[a-z0-9]+(?:-[a-z0-9]+)*$`，`gateKind` 只是 `FlowStateStep` 的可选字段（`flow-state.ts:47-75,180-194,285`）。测试断言 `FLOW_STEP_KINDS.includes("gate") === false`。
- 解析器对**含 gateKind 的步骤**强制：只允许 `kind: artifact`、gateKind 枚举合法、id 匹配 gate-<slug>、owner 必须是 `verifier`、evidence 必须存在且 `kind: artifact`；未知 gateKind/未知字段仍 fail-closed；不含 gateKind 的旧步骤零新增检查。`flow-service.ts::serializeFlow` 只在字段存在时写 `gateKind`；旧 flow 序列化逐字不变（`test/编排/flow-gate.test.ts:282-443`）。
- `flow_step_supersede` 在旧 gate 被替换且新 id 形如 `gate-<slug>`、kind=artifact 时继承旧 `gateKind` 并派生 v1 报告路径（`flow-service.ts:824-837`），走设计 §4.5 的 gate 定义变化路径；普通 artifact 不继承。
- `listReadyFlowSteps` 对 gate 步骤返回 `awaiting-gate`、永不进入 ready；依赖 gate 的下游返回 `dependency-not-done`；`evaluateFlowCompletion` 因 gate 未 done 不 ready。`governance-gate.test.ts` 新增「gate pending ⇒ 下游 `dependencies-not-done`；gate done ⇒ 放行」；`flow-gate.test.ts:445-467` 覆盖 ready/completion；旧 flow ready 行为不变。
- 本角色定向复跑 `governance-gate.test.ts` 与 `flow-gate.test.ts` 均通过（见 §六）。

### C3 应用行为、app-only 收口、拒绝代标、observe 跳过、结论不进客户链路 —— **pass**

- `completeGateStep`（`flow-service.ts:2367-2858`）为 app-only 公共出口，不注册为角色工具；只接受含 gateKind 的 artifact 步骤，从 pending/dispatched/delivered 收口；已 done 幂等；failed/blocked/aborted/superseded ⇒ `gate-step-terminal`。它扫描最新 `docs/acceptance/<flowId>-<gateId>-report-vN.md`（不回退旧版本），解析 `acceptance-triage/v1`，pass 时补 `artifact.observed{actorRoleId:"app",power:"app"}` 并写 flow 步骤 done + evidence；不写 `customer.decision`、不写 `gate.review`（审计由桌面处置写）。
- `flow_step_update(status:"done")` 对含 gateKind 的步骤在 revision 校验前直接返回 `gate-review-required`，manager 与 owner 均不能代标（`flow-service.ts:563-578`）；测试覆盖 convener 与 verifier 两种调用。
- `observeFlowArtifacts` 对含 gateKind 的步骤 `continue`（`flow-service.ts:3081-3084`），失败报告不会被自动观测成 done 证据；测试覆盖。
- 桌面 `requestGateReviewForProject`/`performRequestGateReview` 按设计 §5.3 顺序：flow 归一（显式优先；省略时仅唯一 YAML 才采用）→ flow 读取/解析 → gate 步骤存在且 artifact+gateKind → 状态（done ⇒ already-dispatched；非 pending ⇒ rejected）→ gate 记录/账本幂等（损坏/已 passed/同 revision 在途/failed 且返工未发/superseded/unavailable/账本有派发记录但记录缺失）→ dependsOn 逐项解析 supersededBy 链后 done → 依赖证据与账本对账 → 最新 criteria 含 gateId 标准节 → visual/integration 证据完整性 → 无在途工作 → 引擎解析 → 派 Proof → 先原子写 gate 记录再写账本 `dispatch.accepted{stepId:gateId,targetRoleId:"verifier"}`；失败均如实 `unavailable`/`flow-incomplete`/`criteria-missing`/`rejected`/`gate-not-found`。
- 报告处置（`processGateReportAttempt`）在 settle/ledger/import 事件经 `runAcceptanceCheck` 触发：pass ⇒ `completeGateStep` + `gate.review(pass)` + 主理系统行；fail(blocker/major) ⇒ 独立 `gate-rework-routing/v1` + 返工任务、gate 保持 pending；minor-only fail ⇒ `returned-to-proof`、不返工；缺/坏/早于派发/候选不符 ⇒ `returned-to-proof`；记录损坏 fail-closed；重启恢复按 §5.7（passed+pending 幂等收口、failed+routing 未发补发、已发不重复、superseded 不执行旧处置）。
- 账本：新增 `gate.review` kind 与 `gate-review-decision/v1` 审计形状；`gateReviewEntryShapeError` 强制 actorRoleId/power=app、schema/字段/枚举/sha/版本/时间合法、pass 不得带 blocker/major、fail/conditional 必须至少一个 blocker/major，并拒绝 `decisionKind`/`customerDecision`/`acceptanceTriage`；`latestAcceptanceDecision` 与 `evaluateFlowCompletion` 不读它。`gate.review` 不是客户决定、不进入分诊/验收卡；gate pass 后下游只是变成可派，应用不自动派下游。
- 测试：`flow-gate.test.ts` 13/13（pass+fail+minor-only+missing/bad+terminal+observe skip+flow_step_update 拒绝+supersede 继承+账本形状+路径版本+旧 flow）；`acceptance-dispatch.test.ts` 新增 12 例覆盖派发成功/幂等、校验矩阵、注入矩阵、visual/integration 证据、pass 处置、fail 返工、minor-only 退回、缺/坏报告、两次重启恢复；本角色定向复跑 25/25、桌面两文件 223/223、桌面全目录 663/663。

### C4 防吹毛求疵 —— **pass**

- `classifyGateReviewTriage`：`pass` 直接 pass（允许带 minor/nit）；`fail`/`conditional` 有 blocker 或 major ⇒ fail；只有 minor/nit ⇒ `return-to-proof`（reason `nonblocking-fail`）。
- `completeGateStep`：`pass` 收口；`fail` 含 blocker/major ⇒ `gate-report-failed`（不标 done，等待返工后重新复核）；只有 minor/nit ⇒ `gate-report-nonblocking-fail`（结构不符退回 Proof，不返工、不标 done）；缺报告/不可观测/缺 triage/矛盾 ⇒ `gate-report-missing`/`gate-report-unobservable`/`gate-report-invalid`。
- 桌面处置：`gate-report-nonblocking-fail` 写 `returned-to-proof` + `nitOnly` 系统行，不建返工路由、不写 `gate.review`；`gate-report-failed` 写 failed + `failNote` + 独立返工路由，返工任务要求统筹返工后**显式再次** `request_gate_review`，minor/nit 标非阻断；缺/坏报告写 `returned-to-proof` + `returnedToProof`/`reportMissing` 系统行。
- 账本层同样拒绝只有 minor/nit 的 fail 与带 blocker/major 的 pass（双保险，防止审计与判定口径漂移）。
- 测试逐项覆盖（`flow-gate.test.ts:555-601`、`acceptance-dispatch.test.ts:5231-5268`、`:5161-5229`）；本角色复跑通过。

### C5 主理系统消息只汇报、不派统筹 —— **pass**

- 角色卡：`LIAISON_CARD_TEXT` 在「工作流管理」与「治理协调」两处写死「系统消息只汇报、不派任务（必须）」：收到 `[系统·治理协调]`、gate pass/fail 系统行、交付/阻塞通知等系统消息只向客户如实汇报；**不得给 Steward/统筹发任务、不得调用 `dispatch_task`**；只有客户明确要求或客户消息触发的协调才按原规则；`dispatchTask` 能力保留（测试断言仍为 true）。
- 编排 prompt：`STANDARD_WORKFLOW_PROMPT` 新增「主理收到系统消息时只向客户汇报（2026-10-26 客户规则）」；`governanceFunctionDiscipline`（liaison）新增同款纪律；测试断言 prompt 含标题、系统消息范围、不得派统筹/项目 worker、客户消息触发例外。
- 桌面文案：`buildGovernanceCoordinationTaskMessage` 改为「阶段通知」「这是系统通知：只向客户汇报；不要给统筹 / 项目 worker 派发任务，等客户指示」，删除旧「请按你的职责协调统筹与项目 worker」措辞；`interface.test.ts` 同步断言新文案并 `doesNotMatch` 旧措辞，协调唤醒仍不派 Proof/Steward。
- 客户消息触发路径不回归：Lead 卡保留闸门 1 后 `dispatch_task` coordinate 与客户明确要求例外；测试保留能力位与「只有客户明确要求或客户消息触发的协调才可派发」。gate 返工任务（`Gate 返工任务｜…`，经 `sendReworkTaskToReceiver` 以普通任务投递）不属于系统消息，仍可按设计 §8.2 交主理组织，不与该规则冲突。

### C6 不弱化、不夹带、不造第二套、request_acceptance 不变 —— **pass（附 1 项非阻断观察）**

- `request_acceptance` 实现零改动：接口/工具/schema 只新增 gate 能力位与工具，既有 `request_acceptance` 的形状、描述、注入范围、回执与 handler 输出未变；`request-gate-review-tool.test.ts` 专项断言同一回执下两套工具面的 `request_acceptance` 输出 `deepEqual`，且只注入 gate 能力时 `request_acceptance` 不出现。
- 无新 `FlowStepKind`/治理角色/cardKind；gate 复用 `kind: artifact` + `gateKind`；新增的 `gate.review` 账本 kind 与 `.ans/.../gates/*.json` 记录属设计 §8.4/§5.6 明列的单一 gate 机制，不是第二套门禁/状态。
- 测试 diff：相关 10 个测试文件无 `skip`/`only`/`todo`（全目录的 skip 均为既有平台跳过：`resolve-write` Windows、`atomic-write` Windows、`flow-service` 符号链接/只读宿主）；既有断言未被删除或放宽。唯一替换是 `governance-trio.test.ts` 将 rules-only 时期「不实现工具」的过时用例换成实现后的更强用例，并在新用例里反向断言旧口径（`## Gate 规划（规则，必须）`、`不引入 request_gate_review/gateKind` 等）不存在。
- 非阻断观察：`i18n-guard-allowlist.ts` 新增 `app/desktop/boundary-change.ts`（治理关键路径机器常量、agent-facing 回执/任务正文、judge prompt；非用户可见 UI），使共享套件从既有红灯回到 0 违规。该改动与本批 gate 无直接关系，但属守卫清单既定机制、理由已写明，未改扫描器或断言；本角色只读核对字符串确为机器/agent-facing，未发现放宽用户可见文案守卫。
- 证据真实：见 §六独立复跑；实现方 change 记录的 985/983/1/1、329/322/3/4、330/329/0/1、200/195/0/5、663/663 与本角色结果逐项一致。

## 四、设计 §10 A1–A8 逐行判定

| ID | 判定 | 依据与证据 |
| --- | --- | --- |
| A1 权威与角色边界 | **pass** | Steward 卡只做证据完整性检查 + 请求 + 返工协调；Proof 卡 gate 复核独判；`LIAISON_CARD_TEXT` 系统消息只汇报；无新治理角色/FlowStepKind/cardKind；工具只注入 convener（`run-role`/`session`/桌面注入矩阵测试） |
| A2 gate 节点与规划 | **pass** | Steward 卡含三类 gate 语义、T0–T3 × 产品类型矩阵、gate 步骤字段模板、criteria 标准节模板、失败返工；prototype 不豁免；T0/纯文档不设 gate。本轮无项目 flow 迁移（Q8），不要求项目 flow YAML；设计 §4.2 提供样例 |
| A3 Flow 表达与依赖硬拦 | **pass** | `kind: artifact` + `gateKind`、无新 FlowStepKind、id/owner/evidence 校验；gate 未 done 下游 `dependencies-not-done`、ready 不提示、completion 不 ready；旧 flow 解析/序列化/ready 零变化（`flow-gate.test.ts`、`governance-gate.test.ts`） |
| A4 派发通道 | **pass** | 仅 convener 注入；冻结 code 完整；`dispatched` 只表示已派 Proof；未知 code fail-closed；`request_acceptance` 形状/语义不变；并发/重复请求幂等（内存 in-flight + gate 记录 + 账本 `dispatch.accepted`） |
| A5 Proof gate 复核与报告 | **insufficient evidence（真实 e2e 部分）** | 角色卡、报告复用 `acceptance-triage/v1`、版本化不覆盖、pass/fail/items 合规、账本无 customer.decision 均有卡文本/解析器/测试证据；但设计 A5「需要的证据」明列**真实 Electron/浏览器 e2e**，本批未跑，真实模型/Proof 按卡亲自看真实输出、关 DEBUG 截图的行为也未验证。确定性部分 pass，e2e 部分缺证 |
| A6 统筹职责收缩 | **pass** | Steward 卡只做证据完整性检查/请求/返工，不得自标 gate done、不得代写报告；`gate-review-required` 单测 + 桌面测试；回执如实矩阵；gate 未 done 不派下游 |
| A7 应用行为与降级 | **pass（确定性）/ insufficient evidence（真实流程 e2e）** | pass 收口 + artifact.observed + gate.review；fail 独立返工；minor-only 退回；账本不写 customer.decision；下游硬拦；Proof 不可用/超时/无报告 fail-closed；集成测试/账本断言/重启测试均过。设计 A7 明列**真实流程 e2e**，本批未跑（桌面测试为真实产品面 + 脚本化假适配器，非真实流程/Electron） |
| A8 兼容、幂等与恢复 | **pass（附覆盖残余）** | 旧 flow 零变化、request_acceptance 保留、单 gate 幂等/重启恢复/observe 跳过/记录损坏 fail-closed 代码与测试（记录损坏为代码审查）；多 gate 并行/串行独立幂等与记录损坏/写失败的故障注入未有直接用例（代码按 gateId 独立路径与 per-flow 串行处理，见 §七） |

**必须覆盖的负例核对**：① 统筹自标 done ⇒ `gate-review-required`（测试）；② gate fail 下游不能派/ready 不提示/request_acceptance flow-incomplete（dispatch 与 completion 测试；request_acceptance 组合未直接用例，逻辑由 `evaluateFlowCompletion` 覆盖）；③ Proof 不可用/超时 ⇒ `unavailable`、不判 pass（工具与桌面测试）；④ 缺报告/缺 triage/段坏/pass 带 blocker/fail 空 items/minor-only fail ⇒ `returned-to-proof` 或 `gate-report-*`（测试）；⑤ 旧 flow 兼容（测试）。

## 五、关键 diff 抽查

| 区域 | 核对点 | 结论 |
| --- | --- | --- |
| `run-role.ts` / `session.ts` / `interface.ts` | 仅 convener 注入；未注入不注册；桌面能力接线 | 通过；两层判据（convener id / schedule 职能）等价且互为兜底 |
| `model/runtime.ts` / `provider tools.ts` / `schema.ts` | 冻结 input/result；工具形状校验；回执如实；未知 code fail-closed；request_acceptance 零回归 | 通过 |
| `flow-state.ts` | gateKind 枚举/可选字段/STEP_KEYS；id/owner/evidence；旧 flow 不变 | 通过 |
| `flow-service.ts` | `flow_step_update` gate done 拒绝；supersede 继承；`completeGateStep` pass/fail/minor-only/终态/幂等；observe 跳过 | 通过 |
| `governance-ledger.ts` | `gate.review` schema/形状/客户决定隔离/防吹毛求疵双保险 | 通过 |
| `governance-gate.ts` | gate 报告路径/版本扫描；与最终验收报告命名不冲突；criteria 扫描重构行为保持 | 通过 |
| `interface.ts` 桌面 | 校验顺序/幂等/记录/账本/派发/报告处置/返工/重启/系统行 | 通过；残余见 §七 |
| `governance-advance.ts` | gate 任务文案自足、DEBUG 要求、防吹毛求疵、版本化报告 | 通过 |
| `governance-roles.ts` | Steward/Proof/Liaison 卡文本；注册表数据面零变化 | 通过 |

## 六、测试与证据核对（本角色独立复跑，Windows 11 / Node v24.22.1）

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | 无诊断 |
| `node --test "test/桌面应用/**/*.test.ts"` | **663/663，0 fail，0 skip** | 与实现方声明一致；含新增 12 例 gate 测试 |
| `node --test "test/编排/**/*.test.ts"` | **985 tests / 983 pass / 1 fail / 1 skip** | 唯一红：`shell-authorized-routine.test.ts` Windows `symlink EPERM`（文件零 diff，既有环境限制）；skip 为既有符号链接/只读宿主跳过 |
| `node --test "test/runtime-core/**/*.test.ts"` | **329 / 322 pass / 3 fail / 4 skip** | 3 红均为既有 Windows `symlink EPERM`（`file-write-safety` D3 链接 ×1、`session-store` ×2；相关文件零 diff） |
| `node --test "test/门禁引擎/**/*.test.ts"` | **330 / 329 pass / 0 fail / 1 skip** | skip 为既有 `resolve-write.test.ts` Windows 符号链接跳过 |
| `node --test "test/项目管理/shared/**/*.test.ts"` | **200 / 195 pass / 0 fail / 5 skip** | `[i18n-guard] scanned=124 allowlisted=20 violations=0`；skip 为既有 Windows `atomic-write` 权限位用例 |
| 新增 gate 三文件定向 | **25/25** | `request-gate-review-tool.test.ts` 10、`flow-gate.test.ts` 13、`request-gate-review.test.ts` 2 |
| 桌面 `acceptance-dispatch` + `interface` 定向 | **223/223** | 含 86 个 acceptance-dispatch（12 个 gate 新例）与 137 个 interface |
| `git diff --check` | **exit 0** | 无空白错误 |

**失败归因**：4 个红全部是 Windows 原生 `symlink` 权限 `EPERM`，发生在 `test/编排/shell-authorized-routine.test.ts`、`test/runtime-core/file-write-safety.test.ts`、`test/runtime-core/session-store.test.ts`，三个文件均不在本批 diff（`git status` 无修改），与本批 gate 实现无关；不是本批判据。skip 同样集中在这类平台/权限用例，未用于掩盖 gate 行为。

**候选清单摘要生成方式**（可复核）：取 `git -c core.quotepath=false diff --name-only` 的 38 个 tracked 修改 + 9 个批次未跟踪文件（3 测试 + 6 change 记录），按路径排序后对每个文件算 `sha256`，再对「哈希 + 两空格 + 路径」清单算 `sha256` = `9a7e9a15…`。`.claude/`、`demos/` 未纳入。

## 七、未覆盖面与残余风险

1. **真实 Electron/浏览器 e2e 未跑**（设计 A5/A7 明列；桌面 change 记录亦自述未运行、未重启应用）。当前候选没有任何含 `gateKind` 的真实项目 flow（`demos/castle-2d`、`castle-2d-v2`、`todo-cli`、`wukong-2d` 均无；设计 Q8 明确 castle 本轮不迁移），因此没有可跑的真实 gate 复核流程；桌面测试是真实产品面 + 脚本化假适配器，不是真实 Electron/真实流程。
2. **真实模型/Proof 行为未验证**：Proof 是否按卡亲自运行/打开真实输出、UI/游戏是否关 DEBUG 截图、是否不发验收卡/不写客户决定，只有卡文本与解析器/账本机械约束证据；无真实模型会话样本。
3. **多 gate 独立幂等**：代码按 `gateId` 独立记录/报告/返工路径，`processGateReviewsForFlow` 逐记录处理并以 per-flow 锁串行；但没有一个 flow 同时含两个 gate 的 e2e/集成用例；`requestGateReviewInFlight` 为进程内、记录为持久层，跨进程并发未实测。
4. **故障注入覆盖不完整**：已有缺报告、坏结构、陈旧无报告、failed+routing 未发/已发、passed+pending 恢复；但 gate 记录损坏、`unavailable` 记录、账本/记录写失败、报告版本早于派发、派发后 flow revision 变化等分支只有代码审查，未直接用例。
5. **`request_acceptance` 与 gate 未 done 的组合未直接用例**：`evaluateFlowCompletion` 不 ready 有测试，`request_acceptance` 代码零 diff 且既有 code 映射测试通过，但「gate pending 时 request_acceptance 返回 flow-incomplete」没有一条专门用例。
6. **在途工作检查可能误伤统筹自身轮次**：`hasActiveWorkForFlow` 会看会话 `origins.running.flowIds`；若统筹被 Lead 以带 flowId 的协调任务唤醒并在同一轮调用 `request_gate_review`，可能返回 `unavailable`（桌面 change 记录已列为残余；设计允许稍后重试）。
7. **报告与候选的机器绑定**：gate 报告复用 `acceptance-triage/v1`，路径 + 记录 `flowRevision` + flow 变化即退回 Proof 的缓解符合设计 §6.2/§9.5；报告首行的候选声明不参与机器判定，属设计已接受残余。
8. **criteria 标准节检查为机械匹配**：标题含精确 gateId 字符串 + 文件含 `| ID |` 表头；同文件其它表头也可能满足，语义归 Proof（设计口径）。
9. **i18n allowlist 新增**：`app/desktop/boundary-change.ts` 为本批之外的既有守卫红灯修复；已只读核对为机器/agent-facing 文本，未发现用户可见文案被放行；非阻断观察。
10. **候选外未跟踪内容**：`.claude/` 与 `demos/` 未纳入候选；若其中有人误改了 gate 相关 demo flow，不在本报告范围（核对 `demos/` 无 gateKind）。

## 八、最终判定

**missing-evidence（无 needs-work）。**

- 客户标准 1–6 全部满足；设计 A1–A4、A6、A8 的确定性实现面满足；未发现实现缺陷、断言弱化、skip/only 或证据伪造。
- **缺的证据**（按设计 §10 原文）：
  1. **A5/A7 的真实 Electron/浏览器或真实流程 e2e**：至少一条含 `gateKind` 的真实 flow 上，从 `request_gate_review` 派 Proof → Proof 写 gate 报告 → 应用 `completeGateStep`/`gate.review`/下游放行（或 fail/minor-only/缺报告/重启恢复）的完整事件链；当前候选无 gate-bearing 项目 flow，亦无测试角色 e2e。
  2. **真实模型/Proof 按 VERIFIER 卡执行 gate 复核的行为证据**（亲自看真实输出、UI/游戏关 DEBUG 截图、不发验收卡/不标 done）；目前只有卡文本与机械约束。
  3. （建议补）多 gate 独立幂等与 gate 记录损坏/写失败的故障注入用例；`request_acceptance` 在 gate pending 时的 flow-incomplete 专门用例。
- **若要转 pass**：由客户/可信启动端书面把 A5/A7 的真实 Electron/浏览器 e2e 收窄为「首个 gate-bearing 项目上线前的真机验证」（当前无 gate 项目、Q8 不迁移），或补齐上述 e2e 证据；在此之前，本角色不把设计明列的缺失证据记为通过，也不自行降级标准。
- 本判定不授予提交、推送、合并、部署或发布权限。

## 九、证据指针

- 设计：`角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md`（`approved-implementing` v3；SHA-256 `4969ae45…`）
- 规则：`角色卡/项目管理/docs/project-rules.md` §二第 12 条
- 各角色 change：`角色卡/运行时核心/docs/change/2026-10-26_change_request-gate-review-contract.md`、`角色卡/编排/docs/change/2026-10-26_change_request-gate-review-orchestration-core.md`、`角色卡/编排/docs/change/2026-10-26_change_lead-system-message-report-only.md`、`角色卡/桌面窗口/docs/change/2026-10-26_change_request-gate-review-desktop.md`、`角色卡/门禁引擎/docs/change/2026-10-26_change_gate-review-cards.md`、`角色卡/项目管理/docs/change/2026-10-26_change_request-gate-review.md`
- 测试：`test/runtime-core/request-gate-review-tool.test.ts`、`test/编排/flow-gate.test.ts`、`test/编排/request-gate-review.test.ts`、`test/编排/governance-gate.test.ts`、`test/编排/governance-session.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/interface.test.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/liaison-role.test.ts`、`test/项目管理/shared/i18n.test.ts`
- 候选哈希与本角色复跑命令/结果：见 §二与 §六（清单摘要 `9a7e9a15…`）；本角色未另建证据目录，命令输出以本报告表格为准。
