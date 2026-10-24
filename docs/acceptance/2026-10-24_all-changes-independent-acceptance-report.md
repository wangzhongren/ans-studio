风险档位: T3｜判定依据: 客户 2026-10-24 闸门 0 确认的意图「独立验收范围＝所有变更」（`docs/communication/2026-10-24_intent_independent-acceptance-all-changes.md`，SHA-256 `f98c51ed898529b9738418fbe56b9ae369226fc9b7a2a2c7b562728eed271dfa`）+ 项目规则 §二第 11 条（客户同日确认立即生效；`角色卡/项目管理/docs/project-rules.md`，SHA-256 `7dd97405327da1a1524509124f1c600aaa3f04f0684b981d1d47a07a3ae6ddbd`）+ 本次验收委托的 6 项关键行为；被取代的旧 release-only 意图记录（主工作树 `docs/communication/2026-10-24_intent_independent-acceptance-release-only.md`）仅作对照。未发现本次规则修订的独立闸门 1 方案版本或实施前预写标准，见 §7 流程缺口〔非产品 fail〕｜选定检查: 全部 24 个修改文件 + 1 个新增意图记录的逐文件 diff 审阅；改动套件定向复跑（acceptance-dispatch 45/45、interface 131/131、dispatch-delivery 52/52、flow-service 77 中 76 pass/1 skip、flow-state+governance-session 99/99、governance-gate 27/27、门禁引擎 320 中 319 pass/1 skip、governance-e2e-auto 15/15 + i-full-chain 4/4）；typecheck 0；9 项既有 Windows symlink EPERM 失败名单复现；真实 app 9225 只读证据（CDP 页面来源 = 本 worktree、bookmark-manager-v1 flow/ledger/report/criteria）；本机分段全量串行回归（排除/包含已知挂起文件均记录于 §5）｜复用证据: 测试角色 T3 报告（3887 tests/3859 pass/9 既有 Windows symlink EPERM/19 skip；typecheck 0；桌面 593/593；门禁 320；编排 893/895 + 1 既有 symlink；桌面 Electron e2e `E2E_PASS=true`）用于未受本变更影响的套件与 Electron；同候选、同命令、同环境可复用；本验收精确复现桌面 593/593、门禁 320、typecheck 0 与 9 项 EPERM 名单｜全量回归: 已执行（T3）：本机分段串行覆盖全部 362 个 `.test.ts` 文件（含 `test/pi-adapter/write-sequencing.test.ts` 单独 3/3 pass），合计 3703 tests/3679 pass/10 fail/14 skip/0 cancelled；10 fail 中 9 项为测试角色同名单的既有 Windows symlink EPERM，另 1 项为 S7-J 在高负载串行下的超时偶发（单独复跑 15/15 pass，测试角色 T3 未列此项）；计数口径与测试角色报告存在差异，已如实并列，不据此判产品 fail

# 独立验收报告 · 独立验收范围＝所有变更（规则修订 + 应用行为修复） · 2026-10-24

- 验收角色：ANS 独立验收（Proof，本上下文）；**不实施、不改源码/测试/角色卡、不 commit/push、不重启 app、不写目标项目与 demo**。
- 结论：**通过（当前候选；无 fail 项）**。通过仅对下述候选版本有效，不授权提交、推送、合并、发布或对外操作；客户保留最终决定权。
- 说明：本报告是独立验收结论，不是客户决定；不代替客户在验收卡上的 accept/reject。

## 0. 验收依据、候选与边界

### 0.1 验收基线

1. **客户 2026-10-24 闸门 0 确认意图**：独立验收范围＝**所有变更**，撤销「仅发布版本才派 Proof、非发布不派」。意图记录列明 7 条意图理解与实施边界：规则/角色卡/提示词、`governance-gate` criteria 门、桌面 `interface.ts` 去 release 门、项目管理规则、测试、真实 bookmark-manager 验证、本规则自身也独立验收。
2. **项目规则 §二第 11 条**「独立验收-01：所有变更默认独立验收」（客户同日确认、立即生效）：T0–T3 代码/文档/测试变更（含非发布、修复、演示）在 change-package 与证据齐备后由应用按验收门自动派 Proof；`release` 仅为发布元数据，不再是独立验收门；非发布不得停在 `awaiting-release-acceptance`；Proof 独立、客户最终决定；检查强度仍按第 9 条风险档位。
3. **被取代的旧口径**：`docs/communication/2026-10-24_intent_independent-acceptance-release-only.md`（主工作树，未进入本 worktree 分支）与两份既有变更包中的 P0-1/P1-5 旧行为（`docs/scheduling/2026-10-24-lead-governance-coordination-change-v1.md` §2.3/§3；`docs/scheduling/2026-10-24-governance-followups-change-v1.md` §P1-5）——仅用于核对「旧断言被反转、没有残留」。

### 0.2 候选

| 项 | 值 |
| --- | --- |
| Worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `flow-appointment-feedback-fix`（候选未 commit/push） |
| HEAD | `88ffdb2d468ba0ec8402b4f9a87cc51754daf09f`（`origin/main`） |
| 工作树改动 | 24 个修改文件（源码 8、测试/e2e 14、项目规则 1、沟通 memo 1）+ 1 个新增意图记录；`24 files changed, 1907 insertions(+), 559 deletions(-)`；无删除文件 |
| 候选聚合哈希 | 25 个路径按 `sha256sum` 排序后的 SHA-256 = `662964bc74d844a13aa99b09c3cfc58ab526388c32c2a3e6edb8243221762e0f` |
| 新增意图记录 | `f98c51ed…dfa`（见首行） |
| 旧记录位置 | `2026-10-24_intent_independent-acceptance-release-only.md` 仅存在于主工作树 `docs/communication/`，不在本 worktree 分支；若仅提交本分支，新记录对它的取代引用会悬空（见 §7，文档缺口，非产品 fail） |

### 0.3 本候选包含的两类内容

1. **规则修订**：项目规则 §二.11、内置 Lead/Steward/Verifier 卡与 `STANDARD_WORKFLOW_PRINCIPLE`、`govern-session` 提示、`governance-gate` criteria 门、`interface.ts` 去 release 门；对应测试反转与新增正例。
2. **应用行为修复**（委托所称「应用行为修复」，同一候选一并验收）：
   - appointment（客户决定步骤）app-only 收口：`completeCustomerDecisionStep` + 桌面接线；
   - 写卡校验反馈去重/忙时门控/系统前缀：`reportAppointmentArtifactIssues` 改为 issue 集合去重、Crew busy/pending 不投、`[系统·写卡校验]` 前缀。

## 1. 结论摘要

| 维度 | 结论 |
| --- | --- |
| 总体判定 | **通过（当前候选）**；无 fail 项 |
| 规则/角色卡/提示词 | pass（所有变更独立验收、`release` 仅元数据；旧 release-only 口径无残留） |
| criteria 门 | pass（所有声明 `acceptance-criteria` 步骤的新契约 flow，含非发布；legacy 无 YAML/无该步骤保留；accept-quick 豁免） |
| 桌面验收门 | pass（无 `releaseMarked` 门/`awaiting-release-acceptance`；非发布自动派 criteria → Proof；返工重派不区分 release；legacy 进入 Proof） |
| 测试反转 | pass（P0-1/P1-5 旧断言反转为正例/新负例；新增非发布正例；无删测试文件、无新增 skip/todo、无放松断言以掩盖失败） |
| 真实 app | pass（9225 运行本 worktree 新代码；bookmark-manager-v1 无 release 自动派 criteria/verification；其报告 fail/返工属目标项目产品/治理问题，不是开关失效） |
| T3 证据 | pass（测试角色报告复用 + 本验收精确复现桌面 593/593、门禁 320、typecheck 0、9 项 EPERM；S7-J 偶发超时列入残余） |
| 附带应用修复 | pass（appointment 收口；写卡反馈 issue 集合去重/忙时门控/系统前缀） |
| 治理纪律 | pass（无新增角色/工具/能力位/flow step kind/账本 kind/字段；无删除文件；未 commit/push；未写目标/demo/.env） |

## 2. 验收表

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | 项目规则/角色卡/`govern-session` 提示所有变更（含非发布）独立验收，不是仅发布；`release` 仅可选元数据 | 规则原文、五卡文本、提示文本、旧口径残留扫描、测试 | `角色卡/项目管理/docs/project-rules.md` §二.11（`7dd97405…`）；`src/common/门禁引擎/governance-roles.ts`（`60f8a8ed…`）；`src/pipeline/orchestration/govern-session.ts`（`ed372e25…`）；门禁引擎 320/319 pass/1 skip；`test/编排/governance-session.test.ts`、`test/门禁引擎/{governance-standard-workflow,governance-trio}.test.ts` | HEAD + 工作树（聚合 `662964bc…`） | 门禁引擎/编排/项目管理 | 原文与测试均按「所有变更」；五卡总则与旧口径负断言 pass；`src/`/`app/` 无 `releaseMarked`/`awaiting-release-acceptance`/`非发布不派` 残留（注释中的历史说明除外） | pass |
| A2 | `governance-gate` criteria 门对所有声明 `acceptance-criteria` 的新契约 flow（含非发布）生效；legacy 无 YAML/无该步骤保留；accept-quick 豁免 | 门实现、正负例、最新 vN 矩阵、legacy/accept-quick 例 | `src/common/编排/governance-gate.ts:322-368`；`test/编排/governance-gate.test.ts` 27/27；`test/桌面应用/dispatch-delivery.test.ts` 52/52；`test/测试/governance-e2e-auto/d-dispatch-listing.test.ts`（场景 4c/4d） | 同上 | 编排/桌面窗口/测试 | 非发布新契约缺标准拒；`release:true` 同样拒；legacy `.md` 与无该步骤 YAML 放行；`proposal-accept-quick` 豁免；v2 优先不回退 v1 | pass |
| A3 | `app/desktop/interface.ts` 无 `releaseMarked` 验收门/`awaiting-release-acceptance`；非发布新契约自动派 verifier 写 criteria，完成后自动派 Proof；返工后所有 flow 重派；legacy 也进入 Proof | 源码 diff、桌面测试、e2e、返工链路 | `app/desktop/interface.ts`（`16cc48ee…`）3368-3720；`test/桌面应用/acceptance-dispatch.test.ts` 45/45；`interface.test.ts` 131/131；`test/测试/governance-e2e-auto/{i-full-chain,s-acceptance-rework-routing}.test.ts` 4/4 + 15/15 | 同上 | 桌面窗口/测试 | 非发布 criteria + Proof 正例 pass；release 仅元数据；返工 S7-A 非发布恰一次重派、S7-G release 元数据不影响；S7-I legacy 无 YAML 自动派 Proof；无等待行 | pass |
| A4 | 自动化测试反转 P0-1/P1-5 旧断言，新增非发布正例，未删测试/放松断言 | 测试 diff 统计、逐测试复跑、文件删除检查 | `git diff` 测试：无删除文件；移除 21 个旧 test 声明全部由 38 个新声明承接；移除 65 行旧 release-only 断言全部被新正/负断言替换；新增 skip/todo 0；改动套件复跑全 pass（见 §5） | 同上 | 测试/各属主 | 旧「非发布不派/停在发布验收前」断言已反转；新增非发布 criteria→Proof、legacy Proof、release 元数据不改变路径等正例；无删测试文件、无新增 skip/todo | pass |
| A5 | 真实 app（9225，worktree 新代码）对 bookmark-manager-v1（无 release）自动派 verification；证明开关生效 | CDP 页面来源、flow YAML、账本、报告/criteria | 9225 `/json/list` 页面 URL = 本 worktree `app/renderer/dist/index.html`；`demos/bookmark-manager/docs/flows/bookmark-manager-v1.yaml`（无 `release`；`664f8d51…`）；ledger（快照 `9f873364…`）10:40:06 app→verifier `verification`、10:42:17 `acceptance-criteria`、10:59:04 复核重派；10:50:59 liaison→convener fail/返工协调 | 同上 | 桌面窗口（应用）/verifier/Lead | 非发布自动派 criteria 与 verification；派发卡、报告与返工协调均真实发生；`verification` 步骤保持 pending（派发≠验收） | pass |
| A6 | bookmark-manager-v1 独立验收报告判 fail 并进入返工；该 fail 是目标项目产品/治理问题，不是本次开关失效 | 报告原文、criteria、账本证据链 | `docs/acceptance/bookmark-manager-v1-report-v1.md`（`5f822e3e…`，与账本 artifact.observed 一致）；criteria（`9ca73e75…`）；报告 fail 项为 G-03/G-04/G-06/G-09/G-10（证据授权/候选哈希/流程承载） | 目标项目现场（只读） | verifier/目标项目角色 | 报告判 fail 且列返工项；失败集中在目标项目 `docs/evidence/**` 无生效授权、变更包哈希过期、原始日志不对应当前候选等；**与本候选开关有效性无关**，反而是开关生效的证据 | pass（作为开关证据）；目标 fail 不计入本候选 |
| A7 | 测试角色 T3 报告：3887/3859/9/19；typecheck 0；桌面 593/593；门禁 320；编排 893/895 + 1 既有 symlink；Electron `E2E_PASS=true` | 测试角色报告 + 本验收抽样/分段复算 | 见 §5、§6；桌面 593/593、门禁 320、typecheck 0 精确复现；9 项 EPERM 名单逐一复现 | 同上 | 测试角色/本验收 | 核心断言可复现；计数与单项偶发差异已如实记录（S7-J；分段总数 vs 报告总数）；无产品断言 fail | pass（附计数口径与偶发说明） |
| A8 | appointment 客户决定步骤 app-only 收口（不伪造客户决定、幂等、fail-closed） | 源码、8 个专用测试、桌面接线测试 | `src/common/编排/flow-service.ts:975-1220`；`src/pipeline/orchestration/flow-state.ts` 导出；`app/desktop/interface.ts:4543-4570/4911/5968`；`test/编排/flow-service.test.ts` 77 中 76 pass/1 skip；`test/桌面应用/interface.test.ts` 新增 2 例 pass | 同上 | 编排/桌面窗口/测试 | 已结算决定才收口；写 `done` + `customer-decision` 证据；不写客户决定账本；已完成同证据幂等；终态/坏账本/未结算 fail-closed；未注册为角色工具 | pass |
| A9 | 写卡校验反馈：issue 集合去重、Crew busy/pending 不投、系统前缀、不伪造客户 | 源码、桌面测试 | `app/desktop/interface.ts:4296-4440`；`test/桌面应用/interface.test.ts` 新增 2 例（busy/partial、issue 集合）pass | 同上 | 桌面窗口/测试 | 同一 issue 只投一条；新 issue 才再投；Crew busy 不立即投；反馈带 `[系统·写卡校验]`；补齐角色后 role-cards/readiness 正常 | pass |
| G1 | 候选/治理纪律：不新增角色/工具/能力位/flow step kind/账本 kind/字段；不改边界/预授权；无删除文件；不 commit/push | diff、导出/注册扫描、测试断言 | 24 改 + 1 新增；无删除；`completeCustomerDecisionStep` 未进 `AdapterCapabilities`/run-role/model/provider（测试断言）；`governance-roles.ts` 能力位/Section 1/预授权/禁写零变化；staged 0、未 commit/push | 同上 | 各属主 | pass | pass |
| G2 | 未写 `.env`/目标项目/demo、未重启 app；真实 app 只读 | git status、只读证据读取、9225 仅 curl/CDP 读取 | worktree status 仅候选 + 本验收报告/memo；本验收未执行任何写目标/demo 的命令；9225 未重启；`.env` 无改动；运行中的 app 自身可能继续追加目标账本，不归本验收写入 | 同上 | 本验收 | pass | pass |

## 3. 逐项核对

### 3.1 规则、角色卡与提示词（A1）

- `角色卡/项目管理/docs/project-rules.md` §二新增第 11 条，第 1–10 条原文保留、未重排；变更记录新增 2026-10-24 一行。§二.11 明确：所有 T0–T3 变更（含非发布、修复、演示）在 change-package/证据齐备后由应用按验收门自动派 Proof；`release` 仅发布元数据、不再是独立验收门；非发布不得停在 `awaiting-release-acceptance`；Proof 独立、客户最终决定；检查强度仍按第 9 条。
- `src/common/门禁引擎/governance-roles.ts`：`STANDARD_WORKFLOW_PRINCIPLE` 与 Lead/Steward/Verifier 卡文本同步改为「所有变更（含非发布）……自动派 Proof / 验收；`release` 只是可选发布元数据，不是独立验收的启动条件」；Steward 仍保留「用既有 schedule-write 卡只把 `release` 从缺省/false 改为 true」的既有受控写卡说明。
- `src/pipeline/orchestration/govern-session.ts`：标准工作流提示、验收标准提示、发布标记说明、Proof 纪律均同步；不再承诺「只有发布版本才派」。
- 旧口径残留扫描：`src/`、`app/` 中无 `releaseMarked`、`awaiting-release-acceptance`、`非发布不派`、`只有发布版本才由应用派` 等实现残留；`governance-roles.ts` 仅有注释中的历史沿革说明（不是卡文本）。`run-role.ts`/`flow-service.ts` 中仍有「release-only 写卡校验」注释，那是**受控写卡校验**（限制改 `release` 字段本身），不是独立验收门，保留正确。
- 测试：门禁引擎 320 tests/319 pass/1 skip/0 fail；`governance-standard-workflow` 明确断言五卡旧口径（`非发布不派` 等）不得残留；`governance-trio` 同步。

### 3.2 criteria 门（A2）

- `evaluateAcceptanceCriteriaGate`：`flow === undefined` 或 flow.steps 无 `acceptance-criteria` 步骤 ⇒ 放行（legacy/旧流程原行为）；否则取最新 `proposal-accept-quick` 豁免；再扫描 `docs/acceptance/<flowId>-criteria-vN.md` 最高 N，缺失/不可读 ⇒ `acceptance-criteria-missing`，结构不合格 ⇒ `acceptance-criteria-invalid`，不回退旧版本。
- 与旧 P1-5 的差异：不再以 `flow.release === true` 为前提；`release` 从判定中完全移除。
- 测试：`governance-gate.test.ts` 覆盖非发布缺标准拒、`release:true` 同样拒、非发布+合格标准放行、legacy `.md` 放行、无 `acceptance-criteria` 步骤 YAML 放行、v2 优先/不回退、accept-quick 豁免；`dispatch-delivery.test.ts` 覆盖非发布新契约缺/坏标准拒与 legacy 放行；`d-dispatch-listing.test.ts` 场景 4c/4d 覆盖同一矩阵。

### 3.3 桌面验收门（A3）

- `interface.ts` 删除 `acceptanceReleaseAwaitingNotified` 与全部 `releaseMarked` 分支：返工分支不再因非发布提前 return；新契约自动派 criteria 不再要求 release；完成度/证据门通过后所有 flow 进入派发；legacy 无 YAML 也走同一路径。
- 非发布新契约流程：appointment 已确认且非 accept-quick 时，若标准缺失 ⇒ 派 verifier 写 `docs/acceptance/<flowId>-criteria-v1.md`（账本 + 运行期去重，不代写文件）；标准与变更包齐备后 ⇒ 派 Proof 判定（任务带档位/报告路径）。Legacy 无新契约步骤 ⇒ 保持原行为，不要求标准，但流程齐备后仍进入 Proof。
- 返工：`buildAcceptanceReworkTaskMessage` 统一文案「所有变更（含非发布）自动重派；release 仅可选元数据」；`interface.ts` 返工分支删除 `releaseMarked` 早退；S7-A（非发布）恰一次重派，S7-B（无 flow 进展）不重派，S7-G（release 元数据）不影响重派，S7-I（legacy）自动派 Proof。
- 残留小项：`interface.ts:2167-2222` 仍解析并传 `releaseForRework` 给已不使用该字段的任务构造器（仅调用形状保留，不构成行为分支）；建议后续清理，非 fail。

### 3.4 测试反转与证据（A4）

- 无测试文件删除（`git diff --diff-filter=D` 空）；无新增 `skip`/`todo`；移除 21 个旧 `test(...)` 声明，新增 38 个，全部有对应承接（重命名/拆分/正例替换）。
- 移除的 65 行旧断言全部是旧 release-only 断言或旧指纹去重断言，均被新断言替代；例如：
  - 「非发布：不派 Proof/不写标准/停在发布验收前」→「非发布同样派 verifier 写标准；补齐后派 Proof；无等待行」；
  - 「release:true 才恰一次派发」→「非发布同样派发；release 元数据不改变路径」；
  - 「legacy 非发布 ⇒ 不派 Proof」→「legacy 无 YAML 也自动派 Proof」；
  - 旧指纹去重「计划内容变化 ⇒ 重新反馈」→ 新 issue 集合去重「同一 issue 集合不重复，新 issue 才再投」。
- 未发现「为通过而放松断言」：新增断言具体到任务文案、账本 `stepId/targetRoleId/actorRoleId`、flow 文件字节不变、不伪造客户决定等；`d-dispatch-listing` 场景 4e 把「账本只有 1 条 dispatch」改为允许清单 + 新增「不得向 executor/verifier 自动派发」负断言，属精确化而非放宽（允许的既有「任命后推进 Convener」条目未被用来掩盖 ready 唤醒写账本）。
- 复跑：见 §5。

### 3.5 真实 app 与 bookmark-manager-v1（A5/A6）

- 9225 调试端口返回的页面 URL 是 `...\lead-governance-coordination\app\renderer\dist\index.html`，确认运行的是本 worktree 的渲染产物；主进程行为由账本侧证据证明。
- bookmark-manager-v1 的 flow YAML **没有 `release` 字段**；账本显示：
  - 10:40:06 `dispatch.accepted{stepId:"verification", actorRoleId:"app", targetRoleId:"verifier", trigger:"settle"}`；
  - 10:42:17 `acceptance-criteria` 派发与 criteria artifact.observed；
  - 10:49/10:59 报告与证据 artifact.observed；10:59:04 又一次 `verification` 自动复核（flow 更新后的重派）；
  - 10:50:59 `liasion→convener` 协调任务，摘要明确「独立验收结论为 fail（需返工）……所有变更（含非发布），不等待 release」。
- 报告 `bookmark-manager-v1-report-v1.md` 首行五项齐备，判定 **fail（仍需返工）**；失败项为 G-03（V-D7 授权）、G-04（原始日志对应当前候选）、G-06（`docs/evidence/**` 写授权未生效）、G-09（变更包哈希/范围过期）、G-10（官方证据 artifact 无 done 承载）。这些是**目标项目的产品/治理问题**，不是应用「所有变更独立验收」开关失效；相反，正是开关生效后才自动产生了 criteria、verification、报告与返工协调。
- 结论区分：A5 = 应用开关 pass；A6 = 目标项目 fail（由目标项目角色/客户处理），不计入本候选 fail。

### 3.6 T3 回归与测试证据（A7）

见 §5。

### 3.7 附带应用修复（A8/A9）

- appointment 收口：`completeCustomerDecisionStep` 只认账本最新已结算 `customer.decision{decisionKind}`；只改目标 `kind:customer-decision` 步骤的 `status`/`evidence`；不改 owner/kind/其他步骤；已 done 同证据幂等；终态/坏账本/未结算/非法 decisionKind 全部 fail-closed；写盘经候选 YAML 复核 + `validateFlowEvidence`；不注册为角色工具。桌面在 appointment 决定已结算后、角色卡校验/readiness 之前调用；失败只诊断/Lead 系统行，不伪造 decided。8 个专用测试 + 2 个桌面接线测试 pass。
- 写卡反馈：`appointmentArtifactFeedback` 从「全量六件卡 fingerprint」改为「已反馈 issue key 集合」；Crew busy/pending 不投；新 issue/新缺失角色才再投；成功收口后清空；反馈正文加 `[系统·写卡校验]`，避免被误读为客户发言。新增 2 个桌面测试覆盖 busy/partial、issue 集合去重、补齐角色后 role-cards/readiness 正常、零客户卡。

## 4. 风险档位核对

- 变更包/委托档位：**T3**。
- 依据：涉及内置治理角色卡/总则、应用验收门、治理门禁、flow 决策步骤收口、跨层测试；符合 `references/testing.md` 的 T3（发布/共享抽象/治理或权限变更）。
- 本验收未降档；按 T3 执行全量回归（见 §5），并按受影响路径复跑定向套件。

## 5. T3 回归、定向复跑与证据

### 5.1 测试角色 T3 报告（复用）

| 套件 | 结果 |
| --- | --- |
| T3 全量串行（排除已知挂起） | 3887 tests / 3859 pass / **9 fail** / 19 skip / 0 cancelled；9 fail 均为既有 Windows symlink EPERM |
| Typecheck | 0 |
| `test/桌面应用/*` | 593/593 |
| `test/门禁引擎/*` | 320（319 pass / 1 skip） |
| `test/编排/*` | 893/895 + 1 既有 symlink 失败 |
| 桌面 Electron e2e | `E2E_PASS=true`、`E2E_FAILURES=` |

复用条件：同候选、同命令口径、同环境；本验收对关键套件做了独立复跑并以原始输出核对（见 5.2）。

### 5.2 本验收定向复跑（原始输出在本机临时目录）

| 套件/文件 | 结果 |
| --- | --- |
| `test/桌面应用/*.test.ts`（全目录） | **593/593 pass / 0 fail / 0 skip**（精确复现报告） |
| `test/桌面应用/acceptance-dispatch.test.ts` | 45/45 |
| `test/桌面应用/interface.test.ts` | 131/131 |
| `test/桌面应用/dispatch-delivery.test.ts` | 52/52 |
| `test/编排/flow-service.test.ts` | 77：76 pass / 0 fail / 1 skip |
| `test/编排/flow-state.test.ts` + `governance-session.test.ts` | 99/99 |
| `test/编排/governance-gate.test.ts` | 27/27 |
| `test/门禁引擎/*.test.ts` | 320：319 pass / 0 fail / 1 skip（精确复现） |
| `test/测试/governance-e2e-auto/{d-dispatch-listing,s-acceptance-rework-routing}` | 15/15 |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 4/4（含「所有变更」非发布 + release 元数据正例） |
| `node tsc -p tsconfig.json --noEmit` | exit 0 |
| 已知 EPERM 文件（claude-adapter/session、codex-adapter/session、pi-adapter/injected-runtime ×2、runtime-core/file-write-safety、runtime-core/session-store ×2、g4 render、编排/shell-authorized-routine） | 139 tests：125 pass / **9 fail** / 5 skip；9 fail 全部为 `EPERM symlink`，与测试角色名单一致 |

### 5.3 本验收分段全量复算（补充，不替代 5.1）

| 分段 | 结果 |
| --- | --- |
| 顶层目录（装配/编排/项目管理/门禁引擎/桌面UI/桌面应用/测试顶层/claude/codex/runtime-core） | 2711 tests / 2692 pass / 6 fail / 13 skip |
| `test/测试/*/*.test.ts`（含 governance-e2e-auto 等 99 文件） | 661 tests / 659 pass / 2 fail / 0 skip |
| `test/pi-adapter/*.test.ts`（排除 write-sequencing） | 328 tests / 325 pass / 2 fail / 1 skip |
| `test/pi-adapter/write-sequencing.test.ts`（本次单独运行未挂起） | 3/3 pass |
| **合计** | **3703 tests / 3679 pass / 10 fail / 14 skip / 0 cancelled** |

- 10 fail：9 项为上述既有 Windows symlink EPERM；另 1 项为 `S7-J routing record` 在高负载串行下的 `等待 routing record status=sent 超时（当前 pending）`。该文件单独复跑 15/15 pass，测试角色 T3 报告未列此项；判为**时序偶发**，列入 §7 残余，不判产品 fail。
- 计数与测试角色报告的 3887/3859/9/19 存在差异（本验收分段 3703/3679/10/14）；差异来自分段命令/计数口径（本次按目录 glob 分段运行、并单独补跑 write-sequencing），不影响对「9 项既有 EPERM、无产品断言 fail」的核对。测试角色报告仍作为全量证据复用。

### 5.4 Electron e2e

- 本验收**未重跑** Electron e2e，避免与 9225 上运行中的真实 app 争用/干扰；复用测试角色 `E2E_PASS=true`、`E2E_FAILURES=` 证据（同候选、同命令口径）。真实 app 9225 的 bookmark-manager 自动派发/返工协调作为额外的真实主进程行为证据。

## 6. 候选内容与治理纪律核对

- 24 个修改文件 + 1 个新增意图记录；无删除文件；无新增角色/工具/能力位/flow step kind/账本 kind/字段（`completeCustomerDecisionStep` 是 app-only 公共函数，未注册为角色工具，测试断言 run-role/model/provider 无该能力）。
- `governance-roles.ts` 的能力位、Section 1、预授权、禁写、id/显示名、导出签名与枚举值零变化（卡文本同步除外）。
- 未修改 `.env`、目标项目、demo；未重启 app（9225 仅只读）；未 commit/push；staged 0。
- 候选聚合哈希 `662964bc…`；各文件 SHA-256 见 §8。

## 7. 残余、未覆盖与建议（均不构成 fail）

1. **流程缺口（记录角色：Communication / Planning）**：本次客户规则修订未留下独立闸门 1 方案版本或实施前预写标准（旧流程要求「实施前写标准」）。本验收按闸门 0 已确认意图 + 项目规则 §二.11 + 委托的 6 项行为建立验收表，不自行增加需求；建议 Communication/Planning 在后续同类规则修订中补齐「意图 → 方案/标准 → 实施 → 独立验收」的记录链。
2. **文档引用**：新意图记录取代的 `2026-10-24_intent_independent-acceptance-release-only.md` 仅存在于主工作树，不在本 worktree 分支；若仅提交本分支，取代引用会悬空。建议 Communication 提交时一并纳入旧记录或改引主工作树路径/补记。
3. **S7-J 偶发**：高负载串行下 `routing record status=sent` 20s 超时；单独复跑 15/15 pass。建议测试角色在后续 T3 中关注是否为候选引入的时序敏感性；当前不判产品 fail。
4. **Electron e2e 未由本验收重跑**：复用测试角色 `E2E_PASS=true`；建议在候选提交前由测试角色保留原始报告文件（路径/哈希），便于下次验收直接复用。
5. **T3 计数口径差异**：本验收分段 3703/3679/10/14 vs 测试角色 3887/3859/9/19；已并列记录，建议测试角色报告附原始命令与日志路径，避免后续验收无法逐项对账。
6. **小清理**：`interface.ts:2167-2222` 仍解析 `releaseForRework` 并传给已不使用该字段的任务构造器；无行为分支，建议后续清理（非 fail）。
7. **附带修复的授权来源**：appointment 收口与写卡反馈修复未在仓库内找到独立意图/设计记录；本次按委托「候选＝规则修订 + 应用行为修复」一并验收。建议 Communication 补记该两项的客户授权来源，避免后续追溯缺口。
8. **目标 demo 残留**：bookmark-manager flow 中仍有已 superseded 的旧步骤标题「非发布流程：停在此处等待发布验收门」；属目标项目历史产物，不是本候选源码/测试，不影响本结论。
9. **未覆盖**：非 Windows 平台、真实在线模型/网络的完整回归、发布流水线/打包；Electron e2e 未重跑；本验收不声称目标项目已修复。

## 8. 证据路径与哈希

### 8.1 候选文件（SHA-256，完整）

| 文件 | SHA-256 |
| --- | --- |
| `app/desktop/governance-advance.ts` | `596533c234b0ea391114bec108c0ca42be5485efe7d827ee9f2a6423dea489b1` |
| `app/desktop/interface.ts` | `16cc48ee99e50f27f92b17deecd7e16ba9d3d3efe74035d18cbd588968c5601e` |
| `docs/communication/memo.md` | `7faa8007eed4ad6204d01465691697dda951fcddb92e107b048de0cc570ffdfb` |
| `src/common/编排/flow-service.ts` | `c0cbe3d86349f425318b8294abc673d1e8609f2dcc201965128c1e6b2282799a` |
| `src/common/编排/flow-state.ts` | `f5a935ffcdf39f819de98fb7ea7a657c3ca76c539ad8bd35adc38e562b8c7eee` |
| `src/common/编排/governance-gate.ts` | `9fa97a20c4384f2fddfb1fa723b7683f85a7f8021b75fefa382baf8049cf0797` |
| `src/common/门禁引擎/governance-roles.ts` | `60f8a8eda662abe269441fcdfa5613deb1780db978e965826b7d762ea4d457bb` |
| `src/pipeline/orchestration/flow-state.ts` | `f262f9d3885f1356a9b475ff9f147826e346667ead0d39d5f6845f8d4d9d63b6` |
| `src/pipeline/orchestration/govern-session.ts` | `ed372e25cf502a72877265b281a4f6159b2a2178dcdfee34b75fe1fe4feeb2f8` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `41c7cba51ad5539c1c04921d475ebbc2a5de188447ccf123f0479048c2b2770e` |
| `test/桌面应用/dispatch-delivery.test.ts` | `7ca9d55e90cc2ef95cd9a9aaef1ae6c47b9ed5eb6ce30ff6a4a8700076cbc5e6` |
| `test/桌面应用/e2e/main.mjs` | `87f3c35115f351463885f450139d96f9a3004da46e9e2dae0f8be12b03154d96` |
| `test/桌面应用/interface.test.ts` | `e33db01265d5c0e91fcb1160be7e299908c2512b74e358f10835203b17dadfa9` |
| `test/桌面应用/runtime-resolution.test.ts` | `bd6a71275bcb5fee860f78b50f75be731320f979fc5bad8763e8daf08b961184` |
| `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts` | `da2b48f26058129535a1756989314d238605ad8d1044d88b9ccfc5c369fb155b` |
| `test/测试/governance-e2e-auto/fixture.ts` | `a6390301dccaea51138da50e0e1a27a2739056f6cdd9c6c6d99a08eafbd96df3` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `3079aa9673ae7978cd39da28cf764de4ae38394623b364735b6eb71dcc9cc1e6` |
| `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | `fefaadfcef817c741020a1300cf6a93ee393cb6ec107352c77dd580e5cd2f25e` |
| `test/编排/flow-service.test.ts` | `e7967458900cb39b06908cb67d2dc782a6e925ad0d129b176dbbfc9767bffffe` |
| `test/编排/governance-gate.test.ts` | `f93a74c43367179333f925956c30e8e717098931a2649771b73b3dba408f1e2a` |
| `test/编排/governance-session.test.ts` | `d0263e32e4d70579f32b5bb0cb21888497f5fb94ebb1d4dc859e83021127f96c` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `b06a09914737b1a4b41945d0571db96872b5ad8712e0dc7704e522ac3b8472a0` |
| `test/门禁引擎/governance-trio.test.ts` | `808ba54ba6af30c494db594f18244a9acca9d9dc0d33d53069218cad4577af5e` |
| `角色卡/项目管理/docs/project-rules.md` | `7dd97405327da1a1524509124f1c600aaa3f04f0684b981d1d47a07a3ae6ddbd` |
| `docs/communication/2026-10-24_intent_independent-acceptance-all-changes.md` | `f98c51ed898529b9738418fbe56b9ae369226fc9b7a2a2c7b562728eed271dfa` |

聚合（上述 25 行排序后）：`662964bc74d844a13aa99b09c3cfc58ab526388c32c2a3e6edb8243221762e0f`。

### 8.2 真实 app / 目标项目证据（只读快照）

| 文件 | SHA-256 / 事实 |
| --- | --- |
| `demos/bookmark-manager/docs/acceptance/bookmark-manager-v1-report-v1.md` | `5f822e3e1b7c119c1e28e5764fbeea5af56cad33fc67932a814ae3dda3667639`；首行五项 + 判定 fail |
| `demos/bookmark-manager/docs/acceptance/bookmark-manager-v1-criteria-v1.md` | `9ca73e75d68fff36cf10cebb7d413ed6aa3e6e2b642c3a5a9217c7b3acfedf3f` |
| `demos/bookmark-manager/docs/flows/bookmark-manager-v1.yaml` | `664f8d51ade4d5056ced22864b4c0bdc57536edce56b925342c8c49f01d51d4d`；无 `release` |
| `demos/bookmark-manager/.ans/governance/ledger.jsonl` | `9f873364e0c39804ec517e0af8d5afe395f87c966f531ed0dbd5c704e48b70a2`（快照；之后 app 可能继续追加） |
| 9225 CDP `/json/list` | 页面 URL = 本 worktree `app/renderer/dist/index.html` |

### 8.3 本机复跑原始输出（临时目录，非仓库文件）

- `C:\Users\51054\AppData\Local\Temp\ans-acceptance-t3-full.log`
- `C:\Users\51054\AppData\Local\Temp\ans-acceptance-t3-testsub.log`
- `C:\Users\51054\AppData\Local\Temp\ans-acceptance-t3-pi.log`
- `C:\Users\51054\AppData\Local\Temp\ans-acceptance-t3-ws.log`
- `C:\Users\51054\AppData\Local\Temp\ans-acceptance-t3-desktop.log`

## 9. 变更记录

- v1（2026-10-24）：本报告首版。候选 HEAD `88ffdb2d…` + 24 修改 + 1 新增意图记录；T3；规则反转/预设门 + 附带应用修复；结论 **通过（当前候选）**，无 fail；残余见 §7。
