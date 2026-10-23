---
id: governance-split-1-3-5-desktop
type: change
title: 治理分工第 1/3/5 项桌面窗口阶段 D——appointment→Crew 写卡回路、写卡结构校验/readiness、验收标准/变更包门槛与报告路径
created: "2026-10-22"
status: implemented-unverified
---

# 治理分工第 1/3/5 项（桌面窗口阶段 D）

## 依据与授权

- 任务 ID：`2026-10-22-governance-split-1-3-5`（只做阶段 D；不开始阶段 E）。
- 闸门 2 与实施授权：`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」。
- 团队计划：`docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` §4.2「桌面窗口」、§5.1 N7、§6、§11.9。
- 客户确认的策划方案 v1：`docs/planning/2026-10-22_design_governance-split-1-3-5.md` §5.3/§5.4/§6/§7.6/§10.1/§11。
- 实施前验收标准：`docs/acceptance/governance-split-1-3-5-criteria-v1.md`（P2/P3/P4/P7/P8/P9/P10/P11/P12/P14/P15）。
- 阶段 B/C 冻结契约按实际代码：`src/model/runtime.ts`（`teamPlanPath`/`acceptanceCriteriaPath`/`acceptanceReportPath`/`changePackagePath`/`riskTier`/`teamPlanConfirmed`）、`src/common/编排/`（flow-state 新 step id 约定、O2 派发门、卡前团队计划守卫）、`src/common/门禁引擎/governance-roles.ts`。

## 写前基线核对

- HEAD：`c3693ecdcb78bd83def351c0f2967571dad7174c`（与派发一致）。
- 9 个目标文件 `git hash-object` 全部与派发哈希一致（governance-advance `5f06717a…`、interface `97423f37…`、session `2b022cef…`、customer-input `ea7c619c…`、四个测试文件与 `e2e/main.mjs` 同派发值）。
- `git diff --cached --name-only` 为空；工作树既有阶段 B/C 改动与本角色目标文件无冲突，未覆盖他人改动。

## 改动摘要

### 1. `app/desktop/governance-advance.ts`

- `GovernanceNextFunction` 增加 `role-card-write`（`GovernanceNextRoleId` 不变）。
- `deriveGovernanceNextStep`：
  - `proposal`+`accept` → `schedule/convener`，**不再产生** `followUp:"nomination-after-flow"`（新流程由 Convener 同轮写流程 YAML + 团队计划并直接发 appointment 卡）；
  - `appointment` → **`role-card-write/nominator`**（不再返回 `schedule/convener`）；
  - 取消/拒绝/未答/无 cardKind 行为不变（不产生下一步）。
- `buildGovernanceAdvanceMessage` 新增/更新文案：
  - `proposal accept` → Convener：写/更新流程状态 YAML（已存在则 flow 工具）＋ 团队计划 `docs/scheduling/<flowId>-team-v1.md` ＋ 直接发 `request_choice(cardKind=appointment, stepId=role-cards)`；
  - `appointment → Crew`：flowId、团队计划路径/version、任命名单、`stepId=role-cards`、只写名单内角色、逐路径 `appointment-write`、第 5 项内容清单（role-card 章节/boundary 条目/feature-map/functional-description/memo/api-spec 或 not-applicable）、计划缺细节报告 Convener、不自行扩大职责；
  - 旧 `followUp` 两段式与 appointment→Convener 文案**保留为迁移兼容**（新事件不再产生 appointment→Convener）。
- `buildAppointmentWriteReminderMessage`、`buildNominationAlreadyDoneMessage` 更新为团队计划/写卡语义（legacy 提名路径可回落）。
- `flowStepEvidenceKind`：新增 `team-plan*` → `artifact`（旧 `nomination*` → `decision` 保留）。
- 新增 `buildRoleReadinessTaskMessage`（Convener 读团队计划逐角色复核，写 `docs/scheduling/<flowId>-readiness-v1.md`，`status: pass|gaps`）、`buildAcceptanceCriteriaTaskMessage`（Verifier 实施前写标准，不发验收卡）、路径派生 `governanceTeamPlanPath`/`governanceReadinessPath`/`governanceAcceptanceCriteriaPath`/`governanceAcceptanceReportPath`/`governanceChangePackagePath`、`governanceReadinessNote`/`governanceAcceptanceCriteriaNote`。
- `buildAcceptanceTaskMessage`：报告路径改 `docs/acceptance/<flowId>-report-v1.md`（首行五项），详细附件 `docs/verification/`；新增第⑥条（实施前标准、变更包、`riskTier` 只升不降、同候选证据复用/失效规则），保留原①–⑤硬要求。
- `GovernanceNextStepContext` 新增可选 `teamPlanPath`（结构读取；缺席不猜）。

### 2. `app/desktop/interface.ts`

- 新增只读定位/解析（桌面侧结构校验用，不替代编排门禁）：`findLatestVersionedArtifact`（`<flowId>[-variant]-vN.md`）、`readTeamPlanInfo`/`parseTeamPlanInfo`（frontmatter flowId/riskTier/recommended + 角色表类型/四列）、`readChangePackageInfo`（含 riskTier）、`readAcceptanceCriteriaInfo`。
- `validateAppointmentArtifacts(projectRoot, roleIds, listing, {flowId?, appointmentArtifactPath?})` 扩展（方案 §6.1/§6.2）：
  - `role-card.md` 必需章节：组别、工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单；
  - `boundary.yaml`：现有 schema + 顶层 role 一致 + entries 非空 + 角色根工作文档条目（`角色卡/<id>/feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md`）+ 实际写集（仅含 4 个工作文档条目时记 warning）；
  - `feature-map.md`/`functional-description.md`/`memo.md` 存在/非空/标题/最低内容；`api-spec.md` 存在/非空/接口章节或 `not-applicable` + 非空理由；
  - 读取团队计划：`new`/`changed` 应用完整清单；`existing` 只做存在/格式检查并记 warning（Q9/Q11 A）；计划缺角色行/类型不可识别/职责·能力·写集·依赖为空 ⇒ 问题来源 `convener`；无团队计划的 legacy 流程只做最低结构检查并记 warning（O4/G4）。
- `buildAppointmentArtifactFeedback` / 新增 `buildAppointmentPlanFeedback`；`reportAppointmentArtifactIssues` 按来源分流：Crew 文件问题反馈 Crew（重发 appointment-write）、计划问题反馈 Convener（补充计划），均不派 readiness、不标 appointment 步骤 done；同 flow+问题哈希去重；仅 warning ⇒ 只记诊断不派任务；Lead 系统行汇总两来源。
- `runPostWriteAdvanceCheck`：强制刷新 listing → 逐 flow 最新 appointment 名单跑扩展校验（传入 flowId/账本 artifactPath）→ 有阻塞问题按来源反馈；仅 warning 不阻塞；通过后新流程派 Convener 做 `role-readiness`（旧流程保留原文案），写 `dispatch.accepted{targetRoleId:"convener", stepId:"role-readiness"}`；有界重试耗尽仍缺 ⇒ 逐项校验反馈，不派 Convener、不标 done。
- `advanceGovernanceFlow`：
  - `appointment` **主路径**：有界短轮询读账本最新 appointment 决定（≤300ms；兜住 notifyNextStep 早于账本 append 的竞态），取实际名单与 artifactPath；团队计划优先账本绑定 → 卡片显式 context → 按 flowId 扫描最新 `-team-vN.md`；仅 legacy 才回落提名；都没有 ⇒ 不派 Crew + Lead 系统行；
  - 派 Crew 写卡任务（`nextFunction=role-card-write`），成功后写 `dispatch.accepted{actorRoleId:"app", power:"app", targetRoleId:"nominator", stepId:"role-cards", trigger:"customer-decision"}`；
  - 去重：运行期 Set `<canonical projectRoot>\0<flowId>\0appointment-crew` + 账本 appointment 之后的 `dispatch.accepted{targetRoleId:"nominator"}`（旧版无 stepId 也算）；重复事件/重启不重派；投递失败释放占位；
  - 账本最新任命决定非 `appointed`/`accepted`（拒绝/取消）⇒ 不派；
  - 客户手选 ≠ 团队计划 recommended ⇒ 按实际名单派 Crew，并向来源（Convener）落系统行提示修订计划 v2；
  - 投递后 `schedulePostWriteAdvanceCheck`（会话被释放/重启也不漏派）；
  - 旧 `followUp` 两段式链路逐字保留迁移兼容。
- `dispatchAcceptanceForFlow`（新契约流程 = flow YAML 含任一 `NEW_CONTRACT_FLOW_STEP_IDS`）：
  - 标准缺失/为空 ⇒ 派 Verifier 写 `docs/acceptance/<flowId>-criteria-v1.md`（`buildAcceptanceCriteriaTaskMessage`；不发验收卡），写 `dispatch.accepted{targetRoleId:"verifier", stepId:"acceptance-criteria"}`（账本 + 运行期去重；不循环），Lead 系统行说明阻塞且不派判定；
  - 变更包缺失/为空/缺 `riskTier` ⇒ 不派判定 + Lead 系统行（原因去重）；
  - 门槛通过 ⇒ 判定任务带 `riskTier`、标准/变更包路径、报告 `docs/acceptance/<flowId>-report-v1.md`；判定派发仍写 `stepId:"verification"`；
  - legacy 流程保持原行为（G4/O4）。
- `noteVerifierSettle`：报告路径改 `docs/acceptance/<flowId>-report-v1.md`，附件提示 `docs/verification/`。
- 其它：删除旧「appointment 直接派 Convener/等待角色出现」分支与 `waitForAppointmentRoles`；`buildAcceptanceTaskMessage` 调用点透传门槛结果。

### 3. `app/desktop/customer-input.ts`

- `notifyNextStep` 对 appointment 请求按结构透传可选的 `teamPlanPath`（请求对象显式携带才带；冻结契约当前无该字段），`nextFunction` 由 `deriveGovernanceNextStep` 单点映射（含 `role-card-write`）。

### 4. `app/desktop/session.ts`

- 无代码改动（派发中确认）：Convener 与 Crew（Nominator）的 `customerInput` 仍按 `role.builtIn === true` 注入；卡种白名单由编排 `run-role.ts` 单点决定。新增 `test/桌面应用/session.test.ts` 断言两者仍注入。

### 5. 测试（只在授权文件内）

- `test/桌面应用/interface.test.ts`：新增/改写 appointment→Crew 恰一次、重启/重复事件不重派、拒绝不派、团队计划缺失不派、手选差异提示 v2、校验按 Crew/Convener 分流、new/changed 完整清单、existing warning 不阻塞、Crew 未写卡不派 Convener、readiness 派发与账本 stepId；收尾场景补结构合格标准（适配阶段 C O2 门）。
- `test/桌面应用/acceptance-dispatch.test.ts`：`team-plan*`→artifact；报告路径/附件断言更新；新增新契约流程标准缺失→派标准（acceptance-criteria）→补齐后放行判定（带 riskTier/报告路径）、变更包缺失/缺 riskTier 门槛与补齐后放行。
- `test/桌面应用/operator-wiring.test.ts`：next-step 推导（accept 无 followUp、appointment→role-card-write/nominator/Convener 发起）；验收任务文案路径/档位/证据复用断言。
- `test/桌面应用/session.test.ts`：Convener/Crew `customerInput` 注入确认。
- `test/桌面应用/dispatch-delivery.test.ts`（统筹确认的阶段 D 补充写集）：`makeTrioRoot` 默认写入结构合格标准（`writeAcceptanceCriteria`）；正例显式 `acceptanceCriteria: "valid"`；反例保留原 4 个子场景并新增「标准缺失 ⇒ `acceptance-criteria-missing` 文案」「标准结构不合格 ⇒ `acceptance-criteria-invalid` 文案」两个子场景，均断言拒投且不写账本。未删除门槛、未放宽断言。
- `test/桌面应用/e2e/main.mjs` 未改（总自检无治理推进断言，无需扩展）。

## 去重键与门槛（可核对）

- appointment→Crew 运行期：`<canonical projectRoot>\u0000<flowId>\u0000appointment-crew`；账本：appointment 决定之后 `dispatch.accepted{targetRoleId:"nominator"}`（新记录带 `stepId:"role-cards"`；旧版无 stepId 也算）。
- 写卡后 → Convener readiness：沿用 `applicationConvenerDispatchKey`（`<root>\u0000<flowId>\u0000convener`）+ 账本 `dispatch.accepted{targetRoleId:"convener"}`（power ≠ liaison）；新记录带 `stepId:"role-readiness"`。
- 实施前标准任务：运行期 `acceptanceCriteriaDispatched`（root+flow）+ 账本 `dispatch.accepted{targetRoleId:"verifier", stepId:"acceptance-criteria"}`。
- 验收判定：运行期 Set 带 flow YAML mtime + 账本 `dispatch.accepted{stepId:"verification", targetRoleId:"verifier"}` 最近时刻（既有语义）。
- 阻塞系统行：`acceptanceBlockedNotified`（收尾门）/ `acceptanceArtifactBlockedNotified`（标准/变更包门槛）/ `appointmentArtifactFeedback`（写卡问题哈希），均同因去重、原因变化再报、不循环。

## 检查命令与结果（工作区，2026-10-22）

环境：Windows 11；Git Bash；Node v24.22.1 / npm 11.19.1（`export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`）。

1. `npm run typecheck` → 退出码 **0**（`tsc --noEmit`，无输出错误）。
2. `node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/session.test.ts test/桌面应用/operator-wiring.test.ts` → 退出码 **0**；**tests 198 / pass 198 / fail 0 / skipped 0**（约 17.5s）。
3. 相邻派发夹具 `node --test test/桌面应用/dispatch-delivery.test.ts` → 退出码 **0**；**tests 52 / pass 52 / fail 0 / skipped 0**（约 18.3s）。
4. 邻近只读回归 `node --test "test/桌面应用/**/*.test.ts"` → 退出码 **0**；**tests 513 / pass 513 / fail 0 / skipped 0**（约 18.3s）。

> 初跑时 `dispatch-delivery.test.ts` 的 `routeDispatch 正例/反例（trio）` 2 项因阶段 C O2 门槛（`acceptance-criteria-missing`）转红；经统筹/沟通确认**阶段 D 补充写集**（`test/桌面应用/dispatch-delivery.test.ts`，在本人 boundary.yaml Section 1 内，不重开闸门 2、沿用客户实施授权）后修复夹具：默认写入结构合格标准，负例新增「标准缺失」「标准结构不合格」两个子场景。修复后 52/52、全目录 513/513 全绿。

## 候选哈希（写后，工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/governance-advance.ts` | `39f8d391f962f7e58edbfd757f02278dc0cdaa7d` | `64680dabc69b1b9e42b68411fcc1f85b4120a6b2dadfbca97a738b5256313319` |
| `app/desktop/interface.ts` | `2f0282d827ed6a76b42021a7fd52757d891838b9` | `d3992ab9b74d571ac834630b506784c2853ba75ed27031f364ed428fa8782512` |
| `app/desktop/customer-input.ts` | `98ed6fc3bdae3a4f252478fd2b0755cbcd2225d5` | `91604cf07178ac68378439d77eefe4e80058e7fb25fb4c0ad9fd831cc00967b3` |
| `test/桌面应用/interface.test.ts` | `0244d9da29b5c799df56ed841149595636e4a25b` | `ea4425786e809055e2faab6e0e51986777396d599cf1c9099a77d7ea17a0dae1` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `0b4a1ca63425cf6fdec3323d53add34a5234ea10` | `c87341ec7c76864c86d0be88b618c7e16d370df09041e19ab0fa3b34a9eb1149` |
| `test/桌面应用/session.test.ts` | `19ce26b0819aaeb10f4e59f308fecd9f9db53f2e` | `05f2c6015d58bee2f34d40a8de2afad35fc0b303d48c103862e1bf9b7c6c187d` |
| `test/桌面应用/operator-wiring.test.ts` | `ac8e5dbd7f30dc978e8fdd09978fa485a382b226` | `937274166c4ff45904c97bae8ff5cfa8aacfcefff42825254b97a067990c3c34` |
| `test/桌面应用/dispatch-delivery.test.ts`（补充写集） | `73bdb768ff3d9634ebeb2c1bc0af1d9f86179232` | `c3117b2586dc71939f338dae6fee30a08f0c89c255c0512587d1f1616a02554a` |

`app/desktop/session.ts` 与 `test/桌面应用/e2e/main.mjs` 未改（哈希与写前一致：`2b022cef…`、`bd53f6ef…`）。

## diff / status

- `git diff --stat`（本角色文件，含补充写集）：8 files changed，**2158 insertions(+), 457 deletions(-)**；`git diff --check` 无空白错误。
- `git diff --cached --name-only`：**空**（未暂存）。
- `git status --short`：本角色仅上列 8 个已跟踪文件为 ` M`；其余 ` M`/`??` 为阶段 B/C 既有改动、阶段 A 证据、或并行桌面UI worker 的 `app/renderer/**`、`test/桌面UI/**`、`角色卡/桌面UI/**`（非本角色写入）。未新建 `test/桌面应用/` 文件，未改 `app/renderer/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`package.json`/`tsconfig.json`、`docs/scheduling/**`、`docs/acceptance/**`。

## 与方案的偏差 / 设计取舍

1. **标准/变更包门槛只作用于新契约流程**（flow YAML 含 team-plan/role-cards/role-readiness/acceptance-criteria/change-package 任一 step id）。原因：G4/O4 要求旧 flow/旧流程保持有效；对 legacy 流程强加门槛会破坏迁移兼容（阶段 C 的 O2 门在编排侧对 appointment 一律生效，本层只补桌面验收判定门槛）。
2. **拒绝/取消不派**依赖两层：`deriveGovernanceNextStep` 对非 answered 返回 null（主路径）；`advanceGovernanceFlow` 另查账本最新 appointment 决定，非 `appointed`/`accepted` 即不派（防御陈旧事件）。
3. **事件/账本竞态**：`onNextStep` 在客户通道结算的同一同步栈触发，可能早于编排 `recordCustomerDecision` 的异步账本 append。本层用 ≤300ms 有界轮询读账本；仍读不到时回落卡片上下文（客户实际选择），并在变更记录中登记；不回退为「猜名单」。
4. **团队计划解析**：桌面侧只做**只读结构读取**（frontmatter + 角色表类型/四列）用于确定性校验与任务文案；计划卡前六项守卫与推荐集解析仍以编排唯一实现为准（本层不复制其门禁判定）。冻结契约无桌面可用的 Pipeline 导出版本扫描器，故 `findLatestVersionedArtifact` 在桌面复制了文件名级版本扫描（与方案 §8.2「复用解析器」的精神一致：只定位，不重写推荐集/证据判定）。
5. **「过期」判定**：实现了按 `<flowId>-<criteria|report|change>-vN.md` 文件名版本扫描、frontmatter flowId/riskTier 核对、标准空文件拒绝；候选级「报告/标准过期」仍由验收判定（编排 `verifyAcceptanceMechanics`/Verifier 报告）负责，桌面不复制该判定。
6. **旧 appointment→Convener 文案**保留在 `buildGovernanceAdvanceMessage`（仅供旧事件/legacy 写卡后推进），新事件不再产生该形状。

## 未做项 / 交后续

- 未开始阶段 E（跨角色 e2e、T3 全量回归、真实启动/演示由测试角色执行）。
- `test/桌面应用/dispatch-delivery.test.ts` 的 O2 夹具已在统筹确认的补充写集内修复（52/52）；无遗留红项。
- 未提交、未暂存、未推送、未合并、未发布；未运行 `npm install`；未改 `package.json`/`package-lock.json`。
- 真实 Electron 端到端未运行（`e2e/main.mjs` 不含治理推进断言，无需扩展）；本记录状态 **implemented-unverified**，不代表已验收。
