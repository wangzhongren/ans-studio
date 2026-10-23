**风险档位：T3（治理行为、验收结果路由、派发与 flow 收口语义变更；治理/权限变更即使只改文档也不压成 T0/T1/T2）｜判定依据：客户闸门 0/1/2 记录 `docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（69 行；SHA-256 `9a904f43c2c35a6f46ba380a2fb21eb897bd3bbe948245e506780849af6e1e34`；blob `2b0fa3a0a969a6d830b14a961b4e3b288b40969f`；闸门 0/1/2 均已确认）、客户在闸门 1 确认的策划方案 v1 `docs/planning/2026-10-23_design_acceptance-rework-routing.md`（951 行；SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`；blob `92f88c03bdfdc0683e81a07392c0d4975bcbe28a`）的 §1–§13（尤其 §5、§6、§7、§8.1–§8.7 与 §8.6 P1–P12 草案）、客户在闸门 2 确认的团队计划 v1 `docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（389 行；SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`；blob `2e88d2ad39b31911a4c96c8148e79be97e718b44`）的 §一–§八（仅作范围、写集、阶段与证据口径依据）、技能 `references/testing.md` 的 T3 定义｜选定检查：受影响层测试（`test/编排/flow-state.test.ts`、`flow-service.test.ts`、新增 `acceptance-rework.test.ts`；`test/桌面应用/acceptance-dispatch.test.ts`、`interface.test.ts`、条件 `operator-wiring.test.ts`；`test/runtime-core/tools.test.ts`；`test/项目管理/shared/i18n.test.ts` 及按需 `i18n-guard.test.ts`）+ 治理全链路 e2e（`test/测试/governance-e2e-auto/`）+ 真实 Electron（`test/桌面应用/e2e/main.mjs`，fresh userData，`E2E_PASS`）+ T3 串行全量回归（`node --test --test-concurrency=1 "test/**/*.test.ts"`，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + 目标项目 `ans-gateway` 只读复算（零写入）｜复用证据：无（本标准 v1 先于实施写盘；判定时只复用同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据；不引用 i18n、目录 v3、治理写卡门禁或 v1.7.0 发布的验收结论，也不为其背书）｜全量回归：T3 适用，判定时必须对当前候选执行并与实施前基线逐项对照（本文件不声明已执行，也不声明任何通过结论）**

# 验收完成标准：验收返工自动路由与 rejected 重新派发（acceptance-rework-routing）

- 任务 ID / 产品 flowId：`2026-10-23-acceptance-rework-routing` / `acceptance-rework-routing`
- 标准路径 / 版本 / 日期：`docs/acceptance/acceptance-rework-routing-criteria-v1.md` / **v1** / **2026-10-23**（实施前冻结）
- 阶段：**实施前完成标准**。本文件只建立标准，不实施、不判候选、不写验收报告，不预判通过或返工。
- 状态：**实施前冻结；不是验收报告**。写盘即冻结；本文件不产生验收结论，不授权实施、提交、推送或发布。
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-23_design_acceptance-rework-routing.md`；2026-10-23；Q1–Q13 按推荐 A 确认，O1–O4 不做）。上位依据是客户在**闸门 0** 确认的意图记录。
- 范围/写集输入：客户在**闸门 2** 确认的团队计划 v1（`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`；389 行；哈希见文件头）。团队计划**只作范围、写集、阶段顺序（S1–S7）与证据口径依据，不是标准来源**。
- 实施授权：**尚未取得**。闸门 0/1/2 确认与实施授权是不同事实；本文件不授权派发、实施、改代码/测试/角色卡/边界/flow/账本或动 `ans-gateway`。
- 候选版本：待统筹提交，以产品候选哈希标识（见变更包与 §2.1）。
- 结论：**待判定**。本文件不是报告，也不是通过、返工或证据不足结论。
- 验收报告：**另写 `docs/acceptance/acceptance-rework-routing-report-v1.md`**，由内置独立验收在实施后按本标准与统筹变更包判定；结论只能是**通过 / 返工 / 证据不足**。
- 独立变更边界：本文件只判定验收返工自动路由与 rejected 重新派发；i18n 按 `docs/acceptance/i18n-criteria-v1.md`、目录级授权 v3 按 `docs/acceptance/directory-ownership-criteria-v1.md`、治理写卡门禁按 `docs/acceptance/governance-advance-redispatch-criteria-v1.md` 分别判定；v1.7.0 发布是另一事实。三者的候选、证据、报告与结论不与本变更合并。

---

## 一、基线、版本冻结与范围

### 1.1 确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）**；客户明确「这个可以，先排上，等这个国际化搞完了，在搞」，并补充「验收返工路由也是1.7 版本的」「可以排期进1.7」 | `docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（69 行；SHA-256 / blob 见文件头） |
| 闸门 1：方案确认 | **已确认（2026-10-23）**；客户原话「确认方案 v1，按推荐 Q1–Q13 A；O1–O4 不做。方案确认不等于实施授权，闸门 2 另行确认。」 | 同上文件「闸门 1 确认记录（2026-10-23）」；对象为策划方案 v1（951 行；SHA-256 `9ceea642…`；blob `92f88c03…`） |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排 | **已确认（2026-10-23）**；客户原话「确认团队计划 v1 的角色、写集、无新增角色/无边界变更、app/main.ts 归桌面窗口、S1–S7 与 T3 验收安排；实施授权另行取得。」 | 同上文件「闸门 2 确认记录（2026-10-23）」；对象为团队计划 v1（389 行；SHA-256 `d95fc817…`；blob `2e88d2ad…`） |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发、不改代码。本文件不替代实施授权 |
| 本验收标准 | **实施前写盘并冻结（v1，2026-10-23）** | 本文件；写盘即冻结，之后的候选判定按本版本 |

**文档状态头与确认记录不一致的已知情况（只报告，不改写）：** 策划方案文件头仍写「草案 v1（待闸门 1 方案确认）」、§13 仍写闸门 1 未确认；团队计划状态头与 §1.5、§九仍写「闸门 2 未确认、实施授权未给」。`docs/communication/` 的确认记录已明确客户确认。本标准以沟通记录为授权与冻结事实，引用方案正文的冻结内容进行判定，不改写方案或团队计划，也不把过期状态头当成未确认。

**冻结哈希可复算：** 判定时须重新计算方案、团队计划与沟通记录 SHA-256（及需要时的 `git hash-object`），与文件头一致才可继续；若方案或团队计划实质变化，按 §2.5 处理，不静默沿用旧版标准或旧范围。

### 1.2 闸门 1 冻结口径（Q1–Q13 A；O1–O4 不做）

| ID | 冻结口径（方案 §11 推荐 A） | 对应标准行 |
| --- | --- | --- |
| Q1 | 最新 acceptance 决定是 `accepted` 才收口；`rejected` 是待返工，不 closed；`completeAcceptanceStep` 只认最新 accepted；accepted 后又 rejected 按人工核对、不自动重开 done | P1、P4、P8 |
| Q2 | 报告增加恰好一个 fenced YAML 段，schema `acceptance-rework/v1`（`coordinator` + `items[{id,owner,action,evidence}]`）；严格校验、单 owner、跨 owner 拆项、64 项/32KB 上限；缺段/坏段只走人工兜底，不解析自由文本 | P2、P3、P5 |
| Q3 | 路由接收方固定 Convener；报告 `coordinator` 只建议/校验，不能指定其他协调者；未知值 warning 后仍发 Convener | P3、P5 |
| Q4 | rejection/路由后 flow 有实质更新（内容 sha/mtime）、执行步骤全 done、verification pending、同内容未派 ⇒ 恰好重派一次 Proof；无更新/同内容/进行中 ⇒ 不派 | P4、P9 |
| Q5 | 没有可 supersede 旧步骤 ⇒ fail-closed gap，记录并请 Lead/Proof 补 flow 计划；不凭空造步骤；不新增 app-only `addFlowStep` | P5、P8 |
| Q6 | 本轮只 YAML 新语义；legacy Markdown 保持旧行为（任意 acceptance 决定终结）+ 迁移提示；不重写旧 flow/报告/账本 | P1、P8、P9 |
| Q7 | judge 代批 reject 写 `customer.decision` 且 `decisionEvidence.kind:"judge"`；judge auto-rework 不写 `customer.decision`；两者都不写「客户拒绝」；客户手拒才写「客户拒绝」 | P3、P8 |
| Q8 | 报告级坏段整段不采信；owner 未知/不可派发逐项 blocked；有效项可先行，blocked 项显式挂起并请求补证；不猜、不改 owner | P2、P3、P5 |
| Q9 | routing record 放 `.ans/governance/acceptance/<flowId>/rework-routing.json`，原子写；账本只写既有 `dispatch.accepted(app→convener)` 审计，不新增账本字段 | P6、P8 |
| Q10 | record 先写（失败则不发送）；发送成功后写账本审计；审计失败只诊断 + Lead 系统行，不伪造账本、不翻转已发送事实 | P6、P9 |
| Q11 | 读最新 `<flowId>-report-vN.md`；重派写 vN+1，不覆盖被拒报告；记录 reportSha256/itemsDigest | P2、P3、P7 |
| Q12 | T3；v1.7.0；i18n 收口后实施；独立闸门/验收；不与 i18n/目录 v3/写卡门禁合并；发布前独立 T3 验收 | 全文、P9、P12 |
| Q13 | 账本/flow 是自动判定依据；升级后按重派门允许一次重派；如要避免重复，升级前可把 report-v2 以既有 `dispatch.accepted` 登记或由客户接受一次重复；不把报告文件 mtime 当派发记录 | P7、P9 |
| O1–O4 | **均不做**：不新增 app-only `addFlowStep`；不改 Convener/Verifier 卡文本；legacy 不接 mtime/record 重派；不在验收卡采集客户文字理由 | P5、P8、P11 |

### 1.3 输入性质、来源纪律与 P 编号映射

1. **方案 §8.6 是直接标准来源。** 本标准把方案 §8.6 的 P1–P12 草案展开为判定口径，展开内容取自方案 §5（方案设计）、§6（架构与分层）、§7（受影响面）、§8（测试与验收）、§10（风险）、§11（Q1–Q13 A），不新增产品需求，不放宽或加严方案实质。
2. **团队计划不是标准来源。** 团队计划只用于核对参与角色、逐角色写集、阶段顺序（S1–S7）、验收安排与证据口径；其中的建议、分工或措辞不得被用来增加、放宽或加严本标准；与方案冲突时，以客户确认的方案 v1 为准。
3. **闸门 0 意图记录是上位依据。** 「验收报告客户判断后的结果自动转交 Steward；验收方不干等；返工后可重新验收；客户最终决定权不变」是核心意图；不得借实施顺手扩大。
4. **Q1–Q13 A 已随闸门 1 纳入范围。** 未选择的备选（方案 B/C、解析自由文本、按报告 `coordinator` 路由、legacy 新语义、app-only add step、报告 mtime 抑制等）不是本轮要求，也不得被实施者用来替代推荐 A。
5. **代码与测试只读只用于定位。** 源码/测试阅读可以解释契约、定位检查，但不能单独构成 pass 证据；每条 P 的 pass 必须来自当前候选上的实际执行输出、账本/flow/记录文件原文或只读复算输出（§2.2）。
6. **P 编号说明（重要，见 §八.1）：** 本任务要求使用的 P1–P12 分组与方案 §8.6、团队计划 §5.2 的 P1–P12 编号不完全一一对应。本标准按任务要求使用 P1–P12 作为验收表 ID，并在 §3.0 给出逐行对照；**方案 §8.6 的每一行都必须被覆盖，不得因编号不同而跳过、弱化或加严**。方案 §8.6 的 P4（措辞）并入本标准 P3，P7（verification 重开）并入 P4，P9（失败/边界）分散到 P3–P7/P9，P10（分层/权限）并入 P11，P11（测试/证据）拆入 P9/P10。
7. **不把「方案已确认」「团队计划已确认」「标准已写」「工具成功」当客户确认或验收结论。**

### 1.4 交付范围、写集与明确非目标

**本轮必须覆盖的产品面（方案 §7；团队计划 §3.2–§3.6）：**

- **编排（契约先行）**：`src/common/编排/flow-state.ts`（`latestAcceptanceDecision`、`evaluateFlowCompletion` 的默认 strict 与 `allowRejectedAcceptance` 选项）、`flow-service.ts`（`completeAcceptanceStep` 最新 accepted；新增 app-only `reopenAcceptanceStepForRework`）、新增 `src/common/编排/acceptance-rework.ts`（报告 fenced YAML 解析/校验）、`src/pipeline/orchestration/flow-state.ts`（公共导出，不复制逻辑）；`test/编排/{flow-state,flow-service,新增 acceptance-rework}.test.ts`。
- **桌面窗口**：`app/desktop/customer-input.ts`（可选 `onAutoRework` 回调）、`interface.ts`（最新决定/收口、`routeAcceptanceRework`/`routeAcceptanceAutoRework`、routing record、重派门、系统行与去重）、`governance-advance.ts`（`acceptanceLastDispatchAtMs`/`acceptanceDispatchRecorded` 收窄、legacy 保持、报告模板硬要求、新增返工任务纯函数）；`app/main.ts`（仅 `onAutoRework` 接线）；`test/桌面应用/{acceptance-dispatch,interface}.test.ts`、条件 `operator-wiring.test.ts`、`e2e/main.mjs`（默认运行；定向扩展须最小追加）。
- **运行时核心**：`src/provider/runtime/tools.ts`（`declined` 措辞按 `outcome.operatorId` 区分 judge/客户；不新增工具/schema）；`test/runtime-core/tools.test.ts`。
- **项目管理**：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 新增 6 个系统行 key；`test/项目管理/shared/i18n.test.ts`（parity）、按需 `i18n-guard.test.ts`。
- **测试**：`test/测试/governance-e2e-auto/` 新增全链路用例（团队计划建议 `s-acceptance-rework-routing.test.ts`；`n-` 前缀已被占用，或并入 `f-acceptance-gate.test.ts`）；按需 `test/测试/governance-judge-cards-verify/`；T3 全量、真实 Electron、目标项目只读复算。
- **管理记录（不是产品候选）**：顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、各角色自身 `docs/change/` 等。本文件、报告、团队计划、变更包、沟通记录是验收引用与证据载体，不纳入产品候选哈希。

**明确非目标（方案 §2.3、§4.2、§7.3；团队计划 §1.2、§3.7）：**

- 不修改、不代写 `ans-gateway` 的 flow、账本、报告、角色卡或任何项目文件；目标项目只读复算、**零写入**。
- 不自动 accept/reject；不把「报告不通过」直接当客户拒绝；不伪造 `customer.decision`；不改变客户最终决定权与验收独立性。
- 不做 O1（app-only `addFlowStep`）、O2（改 Convener/Verifier 卡文本）、O3（legacy 接 mtime/record 重派）、O4（验收卡采集客户文字理由）。
- 不新增 `cardKind` / `FlowStepKind` / `GovernancePower` / `GovernanceDecisionKind`；不新增验收步骤保留 id；`rework-*` 只是普通 step id，kind 继续用现有 `dispatch`/`artifact`/`customer-decision`。
- 不新增角色工具、不扩 `AdapterCapabilities`、不改 `flow_step_update`/`flow_step_supersede` 参数或权限；不扩 Proof 写权或派发权；不新增业务角色/角色卡/边界。
- 不改 CLI、发布配方、打包、版本号、`package.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`、`app/renderer/**`、`app/preload.cjs`、`src/model/**`、`src/common/编排/governance-ledger.ts`、`src/common/门禁引擎/governance-roles.ts`、`docs/flows/`。
- 不与 i18n、目录 v3、治理写卡门禁合并验收；不引用它们的验收结论替本变更背书。
- 不在 `test/桌面应用/` 新建文件；不改 `test/桌面应用/e2e/main.mjs` 的既有断言，除非做最小定向扩展并说明。
- 不提交、不推送、不合并、不发布；未启用 task_ops，不伪造任务令牌、锁、审批或机器预检。

### 1.5 写标准时的只读基线（2026-10-23）

| 检查 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 当前 HEAD | `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树（写标准前） | `git status --short` | 206 项；含 i18n（T2）、目录 v3（T3）、治理写卡推进（T3）等已验收但未提交的既有改动、`docs/*/memo.md` 修改与未跟踪管理文档。以上均为**既有上下文**，不是本变更候选，本文件不改变其结论 |
| 方案哈希 | `sha256sum` + `git hash-object` | `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5` / `92f88c03bdfdc0683e81a07392c0d4975bcbe28a`（951 行） |
| 团队计划哈希 | `sha256sum` + `git hash-object` | `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab` / `2e88d2ad39b31911a4c96c8148e79be97e718b44`（389 行） |
| 沟通记录哈希 | `sha256sum` + `git hash-object` | `9a904f43c2c35a6f46ba380a2fb21eb897bd3bbe948245e506780849af6e1e34` / `2b0fa3a0a969a6d830b14a961b4e3b288b40969f`（69 行） |
| 目标项目只读快照（非候选，写本标准时） | `sha256sum`、`wc -l`、`stat` | `ans-gateway/docs/flows/ai-governance-pipeline.yaml`：SHA-256 `0805213ab87ad8fa5c3ac8d5fce8fb0b641f9b9e50873d75ec5a7a4278903928`，13,787 bytes，40 步（18 done / 21 superseded / 1 pending：`verification`），mtime 2026-10-23 18:43:13 +08（10:43:13Z）；`.ans/governance/ledger.jsonl`：SHA-256 `6d70bdeba0bd4160a47689dcce19980d1658a5b9349435cd25073bb7d799a48d`，530 行；`docs/acceptance/ai-governance-pipeline-report-v1.md`：`0106dc80…`；`report-v2.md`：`d0df0789…`；唯一 acceptance 决定为 2026-10-23T08:05:01.066Z `rejected`（`decisionEvidence.kind:"customer-input"`）；最近 `stepId:"verification"` 的 verifier 派发为 08:01:26.084Z；两版报告均无 `acceptance-rework` 段。**目标现场仍在变化；判定时必须重新只读复制并记录当时哈希，不得把本节值当“当前现场”** |
| Node / npm | `node --version` / `npm --version`（当前 Git Bash） | **当前 shell PATH 未包含 Node**（`node: command not found`、`npm: command not found`）；既有记录为 Node v24.22.1 / npm 11.19.1（以实际取证环境为准）。取证前须导入 PATH 并记录实际版本与路径，不得伪造输出 |
| 已知挂起测试 | `ls test/pi-adapter/write-sequencing.test.ts` | 存在；T3 全量回归须排除并记录可复现的排除方式，不得把挂起当通过 |
| 仓库脚本 | `package.json` | `typecheck`=`tsc --noEmit`；`typecheck:renderer`=`tsc -p app/renderer/tsconfig.json`；`build:renderer`=`vite build --config vite.config.ts`；`app`=`electron app/main.ts`；无独立 `test` 脚本，测试 runner 为 `node --test` |
| i18n key 现状 | `grep acceptanceRework src/common/shared/i18n/messages/*.ts` | 当前**不存在** `main.governance.acceptanceRework*` key（实施未开始）；判定时以实际候选为准 |
| task_ops | `.ans/project.json` | 本项目**没有** `.ans/project.json`（`.ans/` 仅 `sessions/` 等）；未启用 task_ops，不伪造机器状态 |

**写标准时的只读代码事实（仅用于定位检查，不作为证据）：** `src/common/编排/flow-state.ts:1003–1007` 的 `hasAcceptanceDecision` 只判断「存在 acceptance 决定」；`:1071–1072` 对任意 acceptance 决定返回「该流程已有验收决定，流程已收口。」；`src/common/编排/flow-service.ts:695–701` 的 `completeAcceptanceStep` 当前检查「存在任一 accepted」，不是「最新 accepted」；`app/desktop/governance-advance.ts:388–422` 的 `acceptanceDispatchRecorded`/`acceptanceLastDispatchAtMs` 当前把任何 `targetRoleId:"verifier"`（含 `acceptance-criteria`）都算作验收派发；`:489–492` 的 legacy `flowCompletionIssue` 把任意 acceptance 决定当终态；`src/provider/runtime/tools.ts:1333–1337`（`request_confirmation`）与 `:1468–1470`（`request_choice`）的 `declined` 统一写「客户拒绝」，未看 `operatorId`；`app/desktop/customer-input.ts:621–770` 的 judge deny/manual 结算为 `declined`，当前无 `onAutoRework`；`app/main.ts:480–503`、`:746–750` 已有 `advanceGovernanceFlow` 可变句柄模式；`app/desktop/interface.ts:2239–2245` 只在 accepted 时收口，`:3638–3644` 写卡后推进检查把任意 acceptance 决定当已收口；`test/桌面应用/acceptance-dispatch.test.ts:1429–1466` 的既有 rejected 用例固定了旧行为「已有验收决定 ⇒ 不派 verifier」。这些事实用于判定时核对候选是否按方案改动，**不构成本标准的要求或豁免**。

### 1.6 本文件不产生的授权

本文件不授权提交、推送、合并、发布或任何对外操作；不授权派发 worker、实施、修改写集/档位/方案/团队计划/沟通记录/角色卡/边界/flow/账本/其他角色文档/目标项目；不授权跳过闸门 2 确认的写集与阶段顺序（S1–S7）。写标准只完成实施前验收准备；实施仍须客户另行给出实施授权。

---

## 二、候选身份、证据与失效规则

### 2.1 候选身份与隔离

**产品候选**是判定时下列文件的精确内容：

- `src/**`、`app/**`、`test/**`（含本变更新增/修改的测试与夹具）；
- 角色自身文档中确属本任务授权的改动（按团队计划 §3.2–§3.6 与 §4.4 的记录，如 `角色卡/*/docs/change/**`）；
- 本变更新增文件仅限团队计划 §3.1 已授权目录：`src/common/编排/acceptance-rework.ts`、`test/编排/acceptance-rework.test.ts`、`test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts`（或并入既有 `f-acceptance-gate.test.ts`），以及按需的 `test/测试/governance-judge-cards-verify/`；**不得在 `test/桌面应用/` 新建文件**。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 的文件哈希不用于标识产品候选；方案、标准或团队计划版本变化按 §2.5 处理，而不是当作产品候选变化。

**候选隔离（与 i18n / 目录 v3 / 治理写卡门禁）：**

- 候选只含本变更 hunk；`git status --short`、`git diff --name-only`、`git diff` 必须能区分既有 i18n、目录 v3、治理写卡门禁与本变更改动。
- `app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts`、`app/main.ts`、`src/common/shared/i18n/messages/**` 等共享文件已有前三者改动（未提交）；本变更只能在其上追加自己的 hunk。S1 必须逐文件记录 `git hash-object` + `sha256sum` 基线，候选差异只列本变更 hunk。
- 不得把 i18n/目录 v3/写卡门禁的文件内容、测试断言、验收证据或结论混入本变更候选；若无法从工作树区分某 hunk 的归属，按 `insufficient evidence` 处理，要求统筹提供基线/候选差异说明；不得「整文件算本变更」或「整文件算既有」。
- `app/main.ts` 按权威 `角色卡/桌面窗口/boundary.md` Section 1 与闸门 2 确认归桌面窗口，不归装配；这是角色标签校正，不是边界变更。验收按团队计划写集核对，不据方案 §6.1/§7.1 的「装配」标签判越界（见 §七.16）。

**候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一 `git hash-object` / SHA-256 变化），受影响证据失效，按 §2.3 重取；不得在变化后的候选上沿用旧证据。

### 2.2 证据原始性与复用

- **原始证据**指：命令、cwd、时间、执行者、环境（Node/npm/OS/Shell）、退出码、stdout/stderr 原文、测试计数（pass/fail/skip/todo）、失败原文、候选文件哈希、`git status`/`git diff`、账本/flow/验证记录文件原文、routing record JSON、e2e 与 Electron 的原始日志/报告/截图清单、目标复制与前后哈希。
- **行为证据必须对应当前候选。** 证据生成时间须晚于本标准写盘时间；早于标准的证据（除实施前基线，仅用于失败分类）按流程不符处理。单元测试必须实际执行并记录计数；不能只贴测试文件内容。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分；不得因为「别的角色跑过」就跳过必需检查。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；实施前基线只用于区分既有失败，不能替代最终候选的全量回归。
- **代码阅读不能替代行为证据：** P1–P7、P9–P12 的 pass 必须来自实际执行输出、文件原文或只读复算；P8、P11、G1、G2 的结构性核对可以使用 diff/grep，但涉及「角色不能调用」「不伪造决定」「不派 Proof」等行为断言仍须测试或记录原文。
- **开发自述、测试转述、工具成功提示、计划文本、代码注释、模型自我报告不能单独作为原始证据。**

### 2.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `src/**`、`app/**` 产品代码变化 | 受影响单测/层测试/集成/e2e；候选哈希；T3 全量结论；目标复算（若共享逻辑变化） | 重取受影响证据；候选变化后重跑 T3 全量与真实 Electron |
| `flow-state.ts` / `flow-service.ts` / `src/pipeline/orchestration/flow-state.ts` 公共出口或报告 schema 变化 | 编排单测、桌面消费、e2e、目标复算 | 契约冻结后重跑受影响调用方；旧证据失效 |
| `interface.ts` 路由/记录/重派门/系统行变化 | `acceptance-dispatch.test.ts`、`interface.test.ts`、e2e、目标复算 | 重跑桌面套件与 e2e；重新记录 record/账本/系统行 |
| `governance-advance.ts` 任务文本/时间口径/legacy 行为变化 | 文案断言、legacy 回归、桌面测试、e2e | 重跑文案与链路测试；旧调用逐字对比重取 |
| `tools.ts` 措辞变化 | `tools.test.ts`、Electron 系统行/回执断言、e2e | 重跑措辞与链路测试 |
| i18n messages 变化 | parity/guard、桌面 typecheck、系统行断言、e2e | 重跑 parity 与受影响系统行断言 |
| 任一 `test/**` 测试文件或共享夹具变化 | 该套件及其依赖的集成/e2e；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| 方案/标准/团队计划版本或确认记录变化 | 验收基线/范围依据；受影响标准行 | 方案实质变化重开闸门 1；标准按 §2.5；团队计划实质变化重开闸门 2 |
| 目标项目复制内容或目标文件哈希变化 | 目标只读复算证据 | 重新复制并记录前后哈希；不得复用旧复制 |
| HEAD 或实施前基线变化 | 基线对照、既有失败分类、候选身份中的 HEAD | 重新建立基线；无法建立时 `insufficient evidence` |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、Electron、目标复算 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 2.4 T3 全量回归与失败分类

本变更改变验收决定语义、返工路由、派发与 flow 收口行为，涉及跨角色契约、编排公共出口与治理行为，T3 适用且**必须执行**，不能用 N/A 掩盖：

- 最终候选执行 `node --test --test-concurrency=1 "test/**/*.test.ts"`；按团队计划排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`，并在证据中记录可复现的排除方式（命令行/清单/脚本），不得静默跳过。
- 执行 `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`（方案 §8.4；以仓库实际脚本为准）。
- 实施前由测试角色对当前基线跑同一组命令，记录计数、失败清单与分类；最终结果与基线逐项对照，**本次新增确定性失败不得放行**。
- 失败分类至少区分：既有 Windows symlink `EPERM`（最近基线 9 项；S1 必须重新实测，不直接沿用）；桌面并发/时序偶发（隔离/整文件/串行复跑分类）；`write-sequencing` 挂起（排除并记录）；其他新增失败（停止回报，不得以「环境问题」笼统带过）。每组既有失败须附基线原始输出与原因。
- `skip`/`todo` 不计通过；全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。
- 全量回归之外，真实 Electron `E2E_PASS`、目标项目只读复算、夹具全链路 e2e、三个构建/类型检查命令缺一即 `insufficient evidence`（若已有失败证据则为 `fail`）。
- T3 不因成本、共享文件或「只改文案/文档」降档；升档可以，降档按 `fail` 处理。

### 2.5 标准版本冻结

- 本文件版本为 `acceptance-rework-routing-criteria-v1`，2026-10-23 写盘后冻结。实施开始后不得为适配候选修改本标准、放宽或加严实质。
- 本文件路径与版本在实施前由沟通确认并记录于 `docs/communication/`；确认前不把本标准当作已冻结给实施使用的依据。确认后如发生变更，递增版本并说明受影响行与证据。
- 若发现标准本身有误、与方案 §8.6 冲突或与闸门 0/1/2 确认范围不一致：记录问题、理由和受影响行，递增为 v2，交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案、团队计划或档位。
- 本文件不声明「已验证」「已验收」「目标项目已修复」；这些表述只能出现在实施后的报告或客户沟通中，且须有对应证据。

---

## 三、验收标准

### 3.0 标准来源映射与 P 编号对照

**方案 §8.6 → 团队计划 §5.2 → 本标准：**

| 方案 §8.6 | 团队计划 §5.2 | 本标准 | 说明 |
| --- | --- | --- | --- |
| P1 最新决定语义 / 收口 | P1 最新决定语义 / 收口 | **P1** | 直接对应 |
| P2 结构化返工段 | P2 结构化返工段 | **P2** | 直接对应 |
| P3 路由 | P3 路由（客户/judge/代批/auto-rework） | **P3** | 直接对应；含方案 §8.6 P4 措辞（见下） |
| P4 措辞 | P4 措辞 | **P3.4** | 并入 P3 的措辞子项；证据仍按 `tools.test` + 桌面集成 + Electron |
| P5 Convener 契约 | P5 Convener 契约 | **P5** | 直接对应 |
| P6 重派门 | P6 重派门 / 循环抑制 | **P4** | 直接对应；含方案 §8.6 P7 的 verification 重开（见下） |
| P7 verification 重开 | P7 verification 重开 | **P4.4** | 并入 P4 的重开子项；证据按 `flow-service.test` + e2e |
| P8 兼容/迁移 | P8 兼容/迁移（legacy 不变、无新枚举） | **P8** | 直接对应 |
| P9 失败/边界 | P9 失败/边界 fail-closed | **P3/P4/P5/P6/P7/P9** | 按场景拆入各行的边界子项与 §3.3 情形表；不减少任何场景 |
| P10 分层/权限 | P10 分层/权限（无越界、无新工具） | **P11.4** + P6/P9 | 分层、公共出口、无新角色工具、routing record 仅 `.ans` 并入 P11；审计/记录权限并入 P6 |
| P11 测试/证据 | P11 测试/证据（断言未弱化、目标零写入） | **P9 + P10** | 测试矩阵/T3/Electron/目标复算在 P9；证据完整性在 P10 |
| P12 文档/状态 | P12 文档/状态（不把计划写成结果） | **P12** | 直接对应 |

**覆盖声明：** 本标准不减少方案 §8.6 的任何一行。方案行的缺失、弱化或加严会在判定时按 `fail` 或 `insufficient evidence` 处理，不以编号不同为由跳过。§3.1 的 P1–P12 是判定索引；§3.2 逐条给出方案条目、判定方法、最低证据与判定规则；§3.3 给出成功/失败/边界情形；§3.4 给出 N/A 规则。

### 3.1 验收表（判定时逐行填「实际证据路径/哈希」「候选版本」「结果」「验收判断」）

下表是判定时使用的核心索引。每行证据均须附对应候选哈希、原始 `git status --short` / `git diff`、产生该行结论的命令输出；涉及 flow/账本/记录/e2e 的行还须附 flow YAML、`ledger.jsonl`、routing record、e2e/Electron 原始日志。只有角色自述或「工具成功」不构成原始证据。

| ID | 方案条目/标准（摘要） | 最低证据 | 实际证据路径/哈希（判定时填） | 候选版本 | 产出角色 | 结果（实施后填） | 验收判断（判定时填） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | **最新决定语义/收口**：按账本 append 顺序取最新 acceptance 决定；只有最新 `accepted` 收口；最新 `rejected` 不 closed；`allowRejectedAcceptance` 默认 false；accepted/rejected 顺序正确；未结算/坏账本 fail-closed；legacy 按 Q6 | `test/编排/flow-state.test.ts`、`flow-service.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts` 原始输出；flow/账本前后快照；目标夹具复算 |  |  | 编排、桌面窗口、测试 |  |  |
| P2 | **报告结构化段**：恰好一个 fenced YAML `schema: acceptance-rework/v1`；`coordinator` + `items[{id,owner,action,evidence}]`；严格校验、64 项/32KB 上限、坏段整段不采信、不解析自由文本、不支持版本 fail-closed | `test/编排/acceptance-rework.test.ts` 正/负例；报告样例；目标 §8/§9.1 无块夹具；解析结果原文 |  |  | 编排 |  |  |
| P3 | **路由与措辞**：客户 reject 与 judge auto-rework/代批 reject 都交 Convener（报告+清单/缺段提示+来源）；Proof 不接收返工派发、不修产品、只等待；judge 来源不得写「客户拒绝」，客户手拒才写「客户拒绝」；客户最终决定权不变；任务内容/失败可见 | 桌面集成测试；任务文本；账本/record；系统行；`tools.test.ts`；真实 Electron；e2e |  |  | 桌面窗口、运行时核心、测试 |  |  |
| P4 | **重派门/循环抑制/verification 重开**：rejection 后 flow 实质更新（内容 sha/mtime）+ 执行全 done + verification pending + 同内容未派 + `acceptanceLastDispatchAtMs` 收窄 ⇒ 恰好一次；无进展/进行中/同内容不重派；`reopenAcceptanceStepForRework` 正/负/幂等/终态 | `acceptance-dispatch.test.ts`、`flow-service.test.ts` 原始输出；mtime/sha 断言；record/账本；e2e；目标夹具 |  |  | 编排、桌面窗口、测试 |  |  |
| P5 | **Steward/Convener 返工**：按 owner 复用/supersede `rework-*`；无可 supersede 旧步骤 ⇒ fail-closed gap（Q5 A）；未知 owner 逐项 blocked；有效项可先行（Q8 A）；不凭空造步骤；不 supersede 验收步骤；不替客户验收；`verifier`/`convener` 特殊归属 | Convener 任务文本；flow/账本夹具；e2e；角色卡/边界未改；blocked 项清单 |  |  | 桌面窗口、测试 |  |  |
| P6 | **routing record/审计**：`.ans/governance/acceptance/<flowId>/rework-routing.json` 原子写/幂等/重启去重；record 先写后发送；账本只写既有 `dispatch.accepted(app→convener)`；审计失败不阻塞但可见（Q10 A）；不新增账本字段 | record JSON；原子写/失败注入输出；两个 Interface 实例；账本 diff；诊断/系统行 |  |  | 桌面窗口 |  |  |
| P7 | **目标项目只读与恢复**：`ans-gateway` 零写入；升级后允许一次重派（Q13 A）；升级前可登记 report-v2 以避免重复（目标侧，非产品写入）；不在报告外伪造派发/决定；A/B 语义复算 | 复制 manifest；目标前后哈希；复算输出；零写入证明；报告措辞 |  |  | 测试、内置独立验收 |  |  |
| P8 | **兼容/迁移**：YAML 新语义；legacy 按 Q6 保持旧行为；已 accepted 不收口回退；旧报告/flow/账本不重写；无新 `cardKind`/`FlowStepKind`/`Power`/`Decision`/保留 id；不扩 Proof 权限；不新增角色工具 | diff/grep；枚举定义；工具面；legacy 测试；accepted 回归；旧夹具哈希 |  |  | 编排、桌面窗口、测试 |  |  |
| P9 | **测试与回归**：确定性单测/集成/e2e/真实 Electron；T3 串行全量（排除 `write-sequencing` 并声明；既有 Windows EPERM 分类）；断言未弱化；目标只读复算；S1–S7 证据齐全 | 命令/退出码/计数/原始日志；基线对照；`E2E_PASS`；测试 diff；目标复算；S1–S7 记录 |  |  | 测试、统筹、内置独立验收 |  |  |
| P10 | **证据完整性**：候选哈希、原始输出、命令/退出码/计数、失败原文、环境、证据失效规则；不接受「全部通过」摘要；报告首行五项与完整验收表 | 变更包；证据 manifest；原始日志；报告；复用/失效记录 |  |  | 统筹、测试、内置独立验收 |  |  |
| P11 | **非目标/范围外零改动**：不改 CLI/发布/package/vite/renderer/门禁角色卡/目标项目；不新增枚举/依赖/角色工具；不深导；routing record 仅 `.ans`；共享文件只算本变更 hunk | `git diff --name-only`/`--stat`/`status`；import 检查；枚举/工具 grep；角色卡/边界 diff；目标哈希 |  |  | 全角色、内置独立验收 |  |  |
| P12 | **文档状态如实**：实施/测试/验收状态区分；不提前宣称 accepted；不把方案/测试记录当验收结论；标准先于实施；报告独立 | 标准哈希与写盘顺序；角色文档状态；报告路径/首行五项；变更包；候选隔离 |  |  | 统筹、内置独立验收 |  |  |

**流程核对行（非新增产品需求；对应团队计划 §4.4/§5.3 的变更包、候选身份与写集要求）：**

| ID | 核对项 | 最低证据 | 判定 |
| --- | --- | --- | --- |
| G1 | 变更包完整、候选身份可复算、管理记录不混入产品候选 | `docs/scheduling/acceptance-rework-routing-change-v1.md`；逐文件 `git hash-object` + `sha256sum`；HEAD/status/diff/stat；标准版本/哈希 | 缺项或候选与证据不符 ⇒ `insufficient evidence`；把管理记录当产品哈希 ⇒ `fail` |
| G2 | 改动路径在团队计划写集内；无越界写；`test/桌面应用/` 未新建；`app/main.ts` 仅接线；不暂存/不提交/不推送/不发布 | `git diff --name-only`/`--stat`/`--cached`；边界/角色卡 diff；目标哈希 | 越界 ⇒ `fail`；无法区分既有 i18n/目录 v3/写卡门禁改动 ⇒ `insufficient evidence` |

### 3.2 P1–P12 逐条判定口径

> 通用要求：以下每一行的 pass 都必须有当前候选上的实际执行输出、文件原文或只读复算输出；没有执行输出、只有代码阅读或角色自述的，按 `insufficient evidence`。`fail` 需要已有证据表明不满足标准或候选包含明确不允许的改动；`insufficient evidence` 是「尚不能判断」；`not applicable` 必须写明依据，且不得把整行 N/A 当 pass。

#### 3.2.1 P1 最新决定语义与收口（方案 §5.1.2、§5.5.1、§8.1.1；§8.6 P1）

**标准：**

1. 「最新」按该 flow 在账本中的 append（数组）顺序取最后一条 `customer.decision{decisionKind:"acceptance"}`；不按 `at` 字符串排序（`at` 只用于时间比较）。
2. 最新为 `accepted` ⇒ 已收口：`evaluateFlowCompletion` 返回 `ready:false` 且原因为「已有验收接受决定/流程已收口」（固定或等价文案）；`completeAcceptanceStep` 写 `verification` `done` + acceptance 证据；桌面不路由、不重派。
3. 最新为 `rejected` ⇒ **不 closed**：`evaluateFlowCompletion` 默认（strict）返回 `ready:false`，原因为「验收已拒绝，流程等待返工；返工后需重新派发验收」或等价固定文案，**不得**再返回「已有验收决定，流程已收口」；`completeAcceptanceStep` 返回 `acceptance-not-accepted`，不写 flow。
4. 无 acceptance 决定 + 执行步骤全部 `done` + 证据齐 + `verification` `pending` ⇒ `ready:true`（既有行为不变）。
5. `allowRejectedAcceptance` 是 `evaluateFlowCompletion` 的可选参数，默认 `false`；只有桌面重派门处理 rejected/auto-rework 时传 `true`。`true` 时 rejected 不构成阻塞，但仍返回执行步骤未完成/证据缺失/未结算决定的**具体原因**；不得改变默认调用方（如 `governance-judge.ts`）的 strict 行为。
6. 顺序正确：先 `accepted` 后 `rejected` ⇒ 最新 `rejected`，不 closed；先 `rejected` 后 `accepted` ⇒ 最新 `accepted`，收口；`accepted` 后又 `rejected` 不得自动把已 `done` 的验收步骤重开（`completeAcceptanceStep` 已 `done` 幂等），也不得把 `rejected` 当 closed。
7. 未结算决定（`decisionKind:"unclassified"` / `customerDecision:"none"` / 缺字段 / 空字符串）继续挡收口；账本坏行/缺保留验收步骤 fail-closed；`rejected` 不写 `verification` `done`、不伪造 acceptance 证据、不清除返工记录。
8. legacy Markdown 的 `flowCompletionIssue` 按 Q6 A **保持旧行为**（任意 acceptance 决定终结）并加回归锁；不把 YAML 新语义复制进 legacy（方案 §5.8）。
9. `hasAcceptanceDecision` 被 `latestAcceptanceDecision` 取代；不保留「存在任意 acceptance 即收口」的布尔口径；单一实现放在编排 `flow-state.ts`，经 `src/pipeline/orchestration/flow-state.ts` 公共出口供桌面消费，不复制门禁逻辑。

**判定方法：**

1. 在 `test/编排/flow-state.test.ts` 实际执行至少以下矩阵，并记录每个用例名与断言：
   - 无决定 + 齐备 ⇒ `ready:true`；
   - 最新 `accepted` ⇒ closed/`ready:false`（收口文案）；
   - 最新 `rejected` ⇒ `ready:false` 且文案为「等待返工」，**不出现**「已收口」；
   - `allowRejectedAcceptance:true` + 齐备 ⇒ `ready:true`；`true` + 执行步骤未完成 ⇒ `ready:false` 且返回具体步骤；
   - 默认调用（不传选项）+ `rejected` ⇒ strict 不 ready；
   - `rejected` + `verification` `dispatched` ⇒ 不 ready；
   - `accepted` + `verification` `pending` ⇒ closed；
   - `accepted` 后 `rejected` ⇒ 按最新 `rejected` 不 closed；
   - `rejected` 后 `accepted` ⇒ 按最新 `accepted` 收口；
   - 未结算决定仍挡；账本坏行/缺验收步骤 fail-closed。
2. 在 `test/编排/flow-service.test.ts` 实际执行 `completeAcceptanceStep`：最新 `accepted` ⇒ `done` + acceptance 证据；最新 `rejected`（即使更早有 `accepted`）⇒ `acceptance-not-accepted` 且文件字节不变；已 `done` 幂等；账本坏行/缺步骤 fail-closed；原子写失败不破坏原文件。
3. 在 `test/桌面应用/acceptance-dispatch.test.ts` 实际执行：最新 `accepted` ⇒ 调收口、不路由、不派 verifier；最新 `rejected` ⇒ 不调收口、进入路由（P3）；无决定 + 门通过 ⇒ 正常派 verifier。
4. 用目标形态夹具复算（P7）：`rejected` 是唯一阻塞时，移除后 `ready:true`；返工步骤未完成时即使移除 `rejected` 也不 ready。

**最低证据：**

- `test/编排/flow-state.test.ts`、`flow-service.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts` 的原始命令、退出码、计数（pass/fail/skip）与失败原文；
- flow YAML 前后快照（`verification` status/evidence）与 `ledger.jsonl` 相关条目原文；
- 目标夹具复算输出与复制哈希；
- 候选哈希与测试文件 diff（新增断言、被替换的旧断言理由）。

**判定规则：**

- **pass：** 上述矩阵全部实际执行通过；`rejected` 不再返回「已收口」；`completeAcceptanceStep` 只认最新 accepted；默认 strict 与 `allowRejectedAcceptance` 行为分离；legacy 旧行为有回归锁；证据对应当前候选。
- **fail：** 任意 acceptance 决定仍收口；`rejected` 仍返回「已收口」或仍永久关闭；`completeAcceptanceStep` 在最新 `rejected` 时仍写 flow；`accepted` 后 `rejected` 仍收口；把 `rejected` 写 `done`/伪造证据；legacy 行为漂移或测试被删弱。
- **insufficient evidence：** 只覆盖单向（只有 accepted 或只有 rejected）；没有顺序测试；没有原始输出/计数；候选或夹具不一致；目标复算只有代码阅读。
- **not applicable：** 无；P1 整行不得 N/A。

#### 3.2.2 P2 报告结构化返工段（方案 §5.2、§8.1.4；§8.6 P2）

**标准：**

1. 验收报告 Markdown 中**恰好一个** fenced YAML 块，schema 固定 `acceptance-rework/v1`；带 `schema: acceptance-rework/...` 的块至多一个，多个 ⇒ `invalid`；其他 YAML 块忽略。
2. 字段：`schema` 必填固定 v1；`coordinator` 可选，缺省 `convener`，只接受 `convener` 或别名 `steward`，其他值记 warning 仍路由 Convener（不授予派发权）；`items` 必填非空数组、最多 64 项；`items[].id` 必填、唯一、匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`；`items[].owner` **恰好一个**角色 id（非空，≤64）；`items[].action` 非空、≤2000 字符；`items[].evidence` 可选，字符串或字符串数组，每条非空、≤500 字符、最多 10 条；未知字段 ⇒ 校验失败。
3. 解析：只扫描 fenced code block（``` / ~~~）；**不**用正则解析 §8 表格或 §9.1 编号列表，不读 HTML 注释当数据；YAML 解析使用现有 `yaml` 包的 `{ uniqueKeys: true, maxAliasCount: 100 }`（与 `flow-state.ts` 同口径）；块总大小 ≤32KB。
4. 解析结果是纯值对象：`{ok:true, section}` 或 `{ok:false, reason:"missing"|"invalid"|"unsupported", errors[]}`；不做 IO、不读文件、不调用模型；错误带具体 path（如 `items[3].owner`）。
5. 缺段 ⇒ `missing`；坏段（YAML 语法错误、未知字段、重复 id、空 owner/action、owner 多值、`items` 为空、超过上限）⇒ `invalid`；`acceptance-rework/v0`/`v2` ⇒ `unsupported`，不按 v1 猜。
6. **整段不采信**：任一坏项 ⇒ 整段 `invalid`，不部分使用、不静默丢项；`missing`/`invalid` 时应用不生成 items、不创建 flow 步骤、不写客户决定，只把报告路径 + 解析错误 + 请阅读报告/要求补结构交给 Convener（P3/P5）。
7. 报告模板（方案 §5.2.3）：`buildAcceptanceTaskMessage` 增加硬要求——结论为不通过/返工时，报告必须包含上述段；每项一个 owner；跨 owner 拆项；证据写路径或可核对说明；缺段视为报告不完整。结论为通过时可省略；客户仍可 reject，此时应用按「无清单」路由并请 Convener 获取具体返工项。**不新建报告模板文件**，不新增 UI。
8. 报告版本：读 `docs/acceptance/` 下最新 `<flowId>-report-vN.md`（复用既有 `findLatestVersionedArtifact`）；缺报告时回退 `docs/acceptance/<flowId>-report-v1.md` 并标 `structured:false`/`reportMissing:true`；重派要求写 vN+1，不覆盖被拒报告。
9. 解析器不新增 `src/model/` 文件；类型随编排解析模块定义，经 Pipeline 导出；不注册为角色工具。

**判定方法：**

1. 在 `test/编排/acceptance-rework.test.ts` 实际执行正例：方案 §5.2.1 的合法块（含 evidence 字符串/数组）；`coordinator` 缺省、`convener`、`steward`、未知值（warning 但 section 可用）。
2. 负例：缺段；坏 YAML；未知字段；重复 id；空 owner；多 owner（`a + b`）；空 action；`items` 空；>64 项；>32KB；多个 `schema: acceptance-rework/...` 块；`acceptance-rework/v2`；非 acceptance-rework 的其他 YAML 块（应忽略）；HTML 注释中的伪段（应忽略）。
3. 目标报告夹具：复制 `ans-gateway` 的 report-v1 §8 表与 report-v2 §9.1 编号列表（无块）到临时夹具，断言 `missing`，证明不解析自由文本。
4. 任务文案：对不通过/返工报告的任务文本断言包含「`acceptance-rework/v1`」硬要求；通过报告可省略；旧调用不传新参数时文案逐字不变（对照 S1 基线）。
5. 报告版本：断言读取最新 vN；有 v2 时不读 v1；缺报告时回退 v1 并标 `reportMissing:true`；重派任务要求 vN+1。

**最低证据：**

- `test/编排/acceptance-rework.test.ts` 原始输出与计数；解析器返回的 `reason`/`errors` 原文；
- 合法/非法报告夹具文件路径与哈希；
- 目标报告复制件与 `missing` 输出；
- 任务文案原文与旧调用逐字对比；
- 候选哈希与测试 diff。

**判定规则：**

- **pass：** 正例/负例矩阵全部通过；坏段整段不采信；不解析自由文本；上限/严格字段/不支持版本生效；统一结果对象无 IO；报告模板硬要求存在且旧文案不变。
- **fail：** 解析 §8/§9.1 自由文本；坏段部分采信；未知字段静默通过；超限不拒；多块不拒；v2 按 v1 猜；坏段仍生成 items/步骤/客户决定；把报告不通过当客户拒绝。
- **insufficient evidence：** 只有正例或只有部分负例；没有目标无块夹具；没有原始输出；解析器实现与测试夹具不一致。
- **not applicable：** 无；P2 整行不得 N/A。

#### 3.2.3 P3 路由、任务内容与措辞（方案 §5.3、§5.3.2、§5.3.3、§5.3.4、§8.1.6、§8.2；§8.6 P3 + P4）

**标准：**

**P3.1 触发与来源**

1. **客户 reject（含 judge 代批 reject）**：`dispatchAcceptanceForFlow` 在 settle/ledger/import 触发时读账本最新 acceptance 决定；决定已 `rejected` ⇒ 路由 Convener；来源标 `customer` 或 `judge`（按 `decisionEvidence.kind`），不得从 `messageSummary` 或角色自述猜。
2. **judge auto-rework**：`customer-input.ts` 新增可选 `onAutoRework`，只在 `cardKind==="acceptance"`、`outcome==="declined"`、`operatorId` 以 `judge:` 开头、非 `notPresented` 时触发；allowlist：verdict `deny`，manual 的 `timeout`/`parse-failed`/`not-recommended`/`group-mismatch`；**不触发** `switch-off`、`aborted`/取消、`unavailable`、`notPresented`、`ledger-unavailable`、`row-failed`。回调抛错只记诊断，不影响已结算的 decline。
3. **不伪造**：judge auto-rework 不写 `answered`、不写 `customer.decision`；客户 reject 的 `customer.decision` 已由既有结算写入，路由只读不重写；不把报告结论当客户决定。
4. **重启/导入/进展**：`runAcceptanceCheck("import")` 读现有 routing record + 账本；记录存在则续跑/等待；不存在且最新 `rejected` 则先路由；返工进展走同一 `dispatchAcceptanceForFlow` 重派门（P4）。record 未 `sent` ⇒ 本次不派 verifier；已 `sent` ⇒ 可继续按门评估。

**P3.2 接收方与 Proof 独立**

5. 路由任务只发 **Convener**；不发 `verifier`。Proof 不接收产品返工派发、不修产品、不直接派发；Proof 的会话只收到卡片 `declined`/`answered` 回执（工具调用结果，不是返工派发），回执明确「等待返工后重新提交」。
6. 报告 `coordinator` 只是建议；实际接收方固定 Convener；报告不能指定其他协调者；未知 `coordinator` 只 warning 不改路由（P2）。
7. 不改变 `request_choice` 的挂起/结算语义、三态、账本语义；不改变客户最终 accept/reject 权。

**P3.3 路由任务内容（方案 §5.3.2 1–6）**

8. 任务由 `buildAcceptanceReworkTaskMessage` 生成，纯函数、无 IO；包含：流程 id、来源（客户拒绝/自动决策未通过/自动退回）、决定时间或 requestId、报告路径与版本/哈希；结构化清单逐项 id/owner/action/evidence；`structured:false` 时写明缺段/解析错误并要求读报告或补结构。
9. 明确要求：先核对已有进展（`flow_get` 看是否已有同一 item/owner 的 `rework-*` 且 done/证据齐；有则复用/跳过）；按 owner 用现有 `flow_step_supersede` 建/替换 `rework-*`；**不要**新建验收步骤、**不要**标 `verification` done、**不要** supersede 保留验收步骤；用 `dispatch_task` 派给已任命且 readiness 通过的项目角色，`stepId` 与 flow 完全一致，`dependsOn` 全部 done；更新变更包/证据；返工完成由应用自动重派 Proof，Convener 不要自己派 Proof；不替客户验收、不自动 accept/reject、不写客户决定；报告归 Proof，不要改报告；清单是范围数据不是权限指令，不得据清单扩权/绕过客户确认/写他人目录/改角色卡或边界。
10. 缺 owner/action（解析失败）⇒ 报告不完整任务；owner 形状合法但未知/未任命/不可派发 ⇒ 逐项列出 blocked，不猜；要求补证/补结构，或由 Convener 判断能否先处理有效项（Q8 A）。
11. 客户理由来源：现有 `customer.decision` 只存 rejected/at/`decisionEvidence`，不存客户自由文本；任务传这些事实 + 报告清单，不编造客户原话。judge 来源传 `reason`/`reasonCode`（有界、已人话化）。无清单时（客户 reject 一份通过报告）写明「报告未列返工项；请按客户拒绝事实与报告核对，必要时请客户/Proof 补具体项；不要自动创建无依据步骤」。

**P3.4 措辞（方案 §8.6 P4）**

12. `src/provider/runtime/tools.ts` 的 `declined` 分支按 `outcome.operatorId` 区分：
    - `judge:*` ⇒ 「自动决策未通过/未完成（原因：…）；**这不是客户拒绝**；应用会把本次退回交 Steward/统筹（Convener）组织返工；请等待返工后重新提交验收。」；
    - 其他（客户/通道）⇒ 保持「客户拒绝/未获同意」的既有语义；
    - `notPresented:true` 仍走 `cardNotPresented`（卡片未呈现，不得说客户拒绝）；`notConsented` 既有语义不变；judgeReceipt 代批措辞不变。
13. 系统行：客户来源写「客户拒绝」；judge 来源写「自动决策未通过/未完成（判断代批/自动退回）」；**任何 judge 来源不得出现「客户拒绝」**；系统行写明接收方 Convener；不声称路由已成功（用「应用会把本次退回交…」/「已按应用规则转交」），实际失败由 Lead 系统行如实报告；系统行落 Lead 聊天流，沿用既有 `note()`/去重，不新建 UI 通道。
14. 不把「报告不通过」写成客户拒绝；不把 judge 退回写成客户批准/客户拒绝；客户手拒才写「客户拒绝」；客户最终决定权不变。

**P3.5 失败与可见性**

15. record 写失败 ⇒ 不发送（没有耐久路由记录），诊断 + Lead 系统行，下一次真实事件重试；发送失败 ⇒ record `failed` + 错误，不标 `sent`、不派 Proof，下一次事件重试；Convener 忙/队列 `sendBackground` 返回 queued 视为已投递，占位保留、不重复刷；审计失败按 P6 处理（不阻塞、可见）。
16. 同一决定/同一报告重复 settle/listProject/import ⇒ 一条路由、一条系统行；不重复发任务；重派后同 flow 内容再触发 ⇒ 不重派（P4）。

**判定方法：**

1. `test/桌面应用/acceptance-dispatch.test.ts` 实际执行（注入 stub manager / stub customerInput）：
   - 客户 reject + 无 flow 更新 ⇒ 恰好一条 Convener 任务、零 verifier、**不新增** `customer.decision`、Lead 一条「客户拒绝」系统行；
   - judge deny ⇒ Convener 任务 + 「自动决策」系统行 + 无 `customer.decision` + 零 verifier；
   - judge manual（timeout/parse-failed/not-recommended/group-mismatch）各一次；switch-off/aborted/unavailable/notPresented/ledger-unavailable/row-failed 各一次（应不路由/只诊断）；
   - judge 代批 reject ⇒ 来源 `judge`、系统行「自动决策未通过（判断代批）」、不写「客户拒绝」；
   - 报告缺段/坏段 ⇒ 任务含错误、无 items；未知 owner ⇒ blocked；`owner:"verifier"`/`convener` ⇒ 标报告/治理修正，不向 Proof/内置角色派产品返工；
   - 同一决定重复 settle/listProject/import ⇒ 一条路由、一条系统行；
   - record 写失败 ⇒ 不发送；发送失败 ⇒ record failed + 重试；审计失败 ⇒ 系统行 + 不伪造账本。
2. `test/runtime-core/tools.test.ts` 实际执行：judge declined 不含「客户拒绝」；客户 declined 含「客户拒绝」；`notPresented`/`unavailable` 不变；judgeReceipt 代批措辞不变。
3. e2e（`test/测试/governance-e2e-auto/`）：一条客户 reject → Convener 任务 → rework → 重派 → accept 全链路；一条 judge auto-rework 链路；一条报告缺段兜底；一条 legacy 行为不变（Q6 A）。
4. 真实 Electron：客户 reject 系统行显示「客户拒绝」与接收方；judge auto-rework 系统行/回执显示「自动决策未通过/未完成」，不出现「客户拒绝」；报告缺段提示可见；启动/聊天/卡片无回归（P9）。
5. 任务文本逐项核对 §P3.3 的 1–6 项；对同一输入重复生成文本稳定（纯函数）。

**最低证据：**

- `acceptance-dispatch.test.ts`、`interface.test.ts`、`tools.test.ts` 原始输出与计数；
- Convener 任务文本原文（至少客户来源、judge 来源、缺段、坏段、未知 owner 各一份）；
- 账本 diff（无新增 `customer.decision`；有既有 `dispatch.accepted` 时才记录）、routing record、诊断与系统行原文；
- e2e/Electron 原始日志与 `E2E_PASS`；
- 候选哈希与测试 diff。

**判定规则：**

- **pass：** 客户/judge/代批/auto-rework 四类来源均按上述路由与措辞；Proof 零返工派发、零新增 `customer.decision`；任务含清单/缺段提示/来源；allowlist 正确；失败可见；客户最终决定权不变。
- **fail：** 路由给 Proof；judge 退回写 `customer.decision`；judge 来源出现「客户拒绝」；报告不通过自动 reject；缺段仍生成 items/步骤；未知 owner 被猜/改名；重复路由/重复系统行；发送失败仍标 sent；断言被删弱。
- **insufficient evidence：** 只覆盖客户来源或只覆盖 judge 来源；没有任务文本原文；没有账本/record/系统行；没有 Electron 或 e2e 原始输出；候选/夹具不一致。
- **not applicable：** 无；P3 整行不得 N/A。

#### 3.2.4 P4 重派门、循环抑制与 verification 重开（方案 §5.5.3、§5.5.4、§8.1.3、§8.1.5、§8.2；§8.6 P6 + P7）

**标准：**

**P4.1 重派门（按顺序）**

1. 最新 acceptance 决定不是 `accepted`；存在 routing record（rejected 或 auto-rework）。
2. flow YAML 可解析；保留验收步骤存在；`verification` 状态为 `pending`。若 `dispatched`/`delivered`，先走 P4.4 重开；`done` 则不重派（异常，P4.2）。
3. `evaluateFlowCompletion(flow, ledger, {allowRejectedAcceptance:true})` 返回 `ready:true`（执行步骤全 done/证据齐/无未结算决定；rejected 不挡）。
4. 进度基线：客户 reject ⇒ `flowMtimeMs > decisionAtMs`（rejection 后 flow 有更新）；judge auto-rework ⇒ `flowMtimeMs > routingSentAtMs`（路由后 flow 有更新）。`decisionAt` 缺失/不可解析（旧账本）⇒ 用 routing record 的 `at`/`sentAt`；仍不可用 ⇒ 不重派（fail-closed，下一次事件重试），不猜。
5. 同进度抑制：`record.lastDispatchedFlowSha256 === currentFlowSha256` ⇒ 不重派（同一 flow 内容）；`acceptanceLastDispatchAtMs(flowId, ledger) >= flowMtimeMs` ⇒ 不重派（同版本已复核；沿用既有口径）。
6. 通过 ⇒ 派 verifier **一次**；成功后把 `record.lastDispatchedFlowSha256 = currentFlowSha256`、`lastDispatchedAt = now` 写回 routing record；失败释放运行期占位，下一次真实事件重试，不循环刷屏。

**P4.2 无进展/进行中/异常**

7. rejection 后没有 flow 更新 ⇒ 条件 4 挡；重派后 `acceptanceLastDispatchAtMs >= flowMtimeMs` + `lastDispatchedFlowSha` ⇒ 条件 5 挡；不得出现 reject→重派热循环。
8. 执行步骤未完成/阻塞 ⇒ 不重派；既有 blocked 系统行给出具体步骤（`acceptance.flow.incomplete`）。
9. `verification` `dispatched`/`delivered` ⇒ 先尝试 app-only 重开为 `pending`；重开成功后再按门重派；重开失败 ⇒ 不派并提示（`acceptance.reopen.failed`），不伪造 `pending`。
10. `verification` `done` + 最新 `rejected` ⇒ 异常状态；不重开、不重派；提示人工核对（`acceptance.rejected-after-done`）。
11. 同一 flow 内容不变但 mtime 被 touch ⇒ `lastDispatchedFlowSha256` 挡住；不因 mtime 抖动多派。
12. 候选代码变化但 flow 未变 ⇒ 应用不重派；要求 Convener 把返工/证据登记进 flow（Q4 与方案 §10.2 边界）；这是方案的残余风险，应用不得伪造候选哈希或派发。

**P4.3 `acceptanceLastDispatchAtMs` / `acceptanceDispatchRecorded` 收窄**

13. 只认 `stepId:"verification"` 的记录，或旧记录（无 `stepId`）且 `targetRoleId:"verifier"`；`acceptance-criteria` 等其他 verifier 派发**不计入**验收去重；既有 `verification` 记录仍正确计入。
14. `acceptanceDispatchRecorded` 的旧布尔兜底只在「有记录但 `acceptanceLastDispatchAtMs` 无 `at`」时沿用「有记录即不派」，不因新逻辑放宽。
15. 收窄后加正/负例：`acceptance-criteria` 派发不挡重派；旧无 stepId + verifier 仍挡；旧无 stepId + 非 verifier 不挡；`stepId:"verification"` 仍挡。

**P4.4 `reopenAcceptanceStepForRework`（app-only）**

16. 仅当最新 acceptance 决定 `rejected`（或存在 auto-rework routing record）时允许；放在 `src/common/编排/flow-service.ts`，经 `src/pipeline/orchestration/flow-state.ts` 导出；**不注册为角色工具**，不扩 `AdapterCapabilities`，不新增枚举/保留 id，不写 `customer.decision`。
17. `pending` 且无 `evidence` ⇒ `{ok:true, idempotent:true}`；`pending` 但带旧 `evidence` ⇒ 清空旧证据并写事件；`dispatched`/`delivered` ⇒ 置 `pending`、清空该步骤 `evidence`、保留 `supersedes`/`dependsOn`/`parallelGroup`；`done` ⇒ `acceptance-already-done`（不自动重开已收口流程）；`failed`/`blocked`/`aborted` ⇒ `acceptance-step-terminal`（交人工/Convener）。
18. 账本不可读/坏行 ⇒ `ledger-unavailable`；flow 缺保留验收步骤 ⇒ `acceptance-step-missing`；原子写、幂等、写失败不破坏原文件；不写 `customer.decision`。

**判定方法：**

1. `test/桌面应用/acceptance-dispatch.test.ts` 实际执行：
   - 客户 reject + flow 更新（rejection 后）+ 执行全 done + `verification` pending ⇒ 恰好一次 verifier 重派；任务含新报告版本；账本 `dispatch.accepted{targetRoleId:"verifier",stepId:"verification"}` 一条；再次触发不重派；
   - 客户 reject + 无 flow 更新 ⇒ 不派 verifier；
   - 客户 reject + 执行步骤 pending/blocked ⇒ 不派；blocked 系统行具体原因；
   - 升级形态（目标项目）：`rejected` + flow 已有 `rework-*`/证据且全 done ⇒ Convener 任务含「先核对、已有则复用/跳过、不重复建」，应用恰好重派一次 Proof；
   - `verification` dispatched/delivered ⇒ 重开成功后重派；重开失败不派；
   - accepted ⇒ 收口、不路由、不派；
   - 同一 flow 内容重复触发（包括 mtime touch）⇒ 不重派；
   - 注入 `acceptance-criteria` verifier 派发 ⇒ 不计入 `acceptanceLastDispatchAtMs`，不挡返工重派。
2. `test/编排/flow-service.test.ts` 实际执行 P4.4 的正/负/幂等/终态/缺步骤/账本坏行/原子写失败矩阵。
3. e2e：reject → Convener 建 `rework-*` → owner done → 应用恰好一次重派 Proof → accepted → `verification` done；同进度再触发不重派。
4. 目标夹具（P7）：`rejected` + flow 更新 + 全 done + pending + 同内容未派 ⇒ 门通过；无更新/同内容 ⇒ 不派；返工步骤未完成 ⇒ 即使移除 rejected 也不 ready。

**最低证据：**

- 桌面/编排测试原始输出与计数；每条门条件的断言名；
- flow YAML 的 mtime、内容 SHA-256、`verification` status/evidence；`ledger.jsonl` 相关条目；
- routing record 的 `lastDispatchedFlowSha256`/`lastDispatchedAt`/`status`；
- `reopenAcceptanceStepForRework` 的返回码与 flow 前后 diff；
- 目标夹具复算输出与复制哈希；
- 候选哈希与测试 diff。

**判定规则：**

- **pass：** 门条件按顺序生效；恰好一次；无进展/同内容/进行中不派；收窄生效；重开函数正/负/幂等/终态正确；无热循环；无新枚举/工具/写权。
- **fail：** reject 后立即重派；每次 settle 都重派；同 flow 内容重派；`verification` dispatched 仍派；`acceptance-criteria` 被计入；`done` 被自动重开；重开不清旧证据；新增状态/保留 id/角色工具；把重派失败写成已派。
- **insufficient evidence：** 只有单次触发；没有 mtime/sha 断言；没有 record/账本原文；没有重开负例；没有目标夹具；候选/夹具不一致。
- **not applicable：** 无；P4 整行不得 N/A。

#### 3.2.5 P5 Steward / Convener 返工契约（方案 §5.4、§5.3.2、§8.2；§8.6 P5）

**标准：**

1. Convener 是唯一协调者（内置治理角色里唯一有项目角色派发能力）；报告 `coordinator` 只是建议，实际接收方固定 Convener；不向 Convener 之外的协调者派发。
2. 建步骤前**先核对已有进展**：`flow_get` 看是否已有同一 item/owner 的 `rework-*` 且 done/证据齐；有则复用/跳过，不重复建、不重复派（目标项目升级时返工可能已完成）。
3. 同一 owner 的多个 item 可合并为一个 `rework-*` 步骤（action 汇总，保留 item id 列表在标题/说明）；每个 owner 至少一个步骤；建议稳定 id `rework-` + item id 小写/非字母数字转 `-`（如 `rework-f1`；跨 owner 拆项用 `rework-f6a`/`rework-f6b`）；已存在同 id ⇒ 复用/核对，不重复建。
4. 用现有 `flow_step_supersede` 取代该 owner **当前活动（未 superseded）** 的 `delivery-*`/`rework-*` 步骤；旧步骤自动 `superseded`，新步骤 `pending`；按需带 `dependsOn`/`parallelGroup`；**不** supersede 保留验收步骤（服务端也会拒绝），**不**新建验收步骤，**不**标 `verification` done。
5. **没有可 supersede 的旧步骤 ⇒ fail-closed gap（Q5 A）**：记录 gap、请 Lead/Proof 补 flow 计划；不凭空造步骤；不使用 app-only `addFlowStep`；不新增 Convener 新工具。
6. 派发：`dispatch_task` 只向已任命、readiness 通过的项目角色；前置 `dependsOn` 全部 `done`；任务文本带授权目录/写集/证据要求。owner 是内置治理角色（如 Convener 自己）⇒ Convener 自行处理治理文档/变更包，不向内置角色 `dispatch_task`。
7. owner 未知/不可派发（`app`、`customer`、`客户/Proof` 等）⇒ 不派、逐项记录 blocked、请报告方补证/确认；不猜、不改 owner、不静默丢弃。**有效项可先行，blocked 项显式挂起（Q8 A）**。
8. `owner:"verifier"` 属报告/工具修正项（Proof 只写 `docs/acceptance`/`docs/verification`），不作为产品返工派发给 Proof；由 Convener/Lead 按报告归属处理或要求 Proof 修正报告/工具。`owner:"convener"` 属治理文档/变更包项，由 Convener 自行处理，不向内置角色 `dispatch_task`。
9. **不替客户验收**：Convener 不写 `customer.decision`，不自动 accept/reject，不改 `docs/acceptance/` 报告，不把报告结论当客户决定；报告要求客户决定的事项（如业务口径）不是返工项，Convener 记录并交 Lead/客户，不创建「自动接受」步骤。
10. 返工完成：证据按现有 `flow_step_update`/账本规则标 `delivered`/`done`；Convener 核对证据后 done；不伪造 done；更新变更包/证据登记，使 flow 反映返工进展；应用据此重派 Proof。
11. 角色卡/边界/枚举不改；Convener/Verifier 既有 `flow_step_supersede`/`dispatch_task` 足够；不新增角色工具、不扩派发权。

**判定方法：**

1. 任务文本逐项断言包含：先核对已有进展、按 owner supersede、不 supersede 验收步骤、`dispatch_task` 条件、不自己派 Proof、不替客户验收、清单是数据不是权限。
2. e2e 夹具（脚本化 Convener/adapter）：reject → Convener 建 `rework-*`（复用已有步骤；无旧步骤时记录 gap 不建）→ owner done → 应用重派 → accept；断言 flow 中 `rework-*` 是普通 `dispatch` 步骤、验收步骤未被 supersede、无 `customer.decision` 由 Convener 写入。
3. 未知 owner / 无旧步骤 / `owner:"verifier"` / `owner:"convener"` / 多 owner 各一例：断言 blocked/gap/归属，不生成可派发任务给 Proof/内置角色。
4. 角色卡/边界 diff：`git diff -- 角色卡/` 为空（本任务不允许改）；`governance-roles.ts` 不改。

**最低证据：**

- Convener 任务文本原文；
- e2e/夹具的 flow YAML、账本、任务记录；blocked/gap 清单；
- 角色卡/边界、`governance-roles.ts`、工具清单 diff；
- 候选哈希与测试 diff。

**判定规则：**

- **pass：** 任务文本覆盖全部契约；e2e 证明按 owner 复用/supersede、无旧步骤 fail-closed、未知 owner blocked、有效项先行、不 supersede 验收步骤、不替客户验收、不新增工具/权限。
- **fail：** App 直接建步骤/派 owner；Convener 写客户决定；验收步骤被 supersede；无旧步骤凭空造步骤或新增 `flow_step_add`/`addFlowStep`；未知 owner 被猜/改名；把 `verifier` 当产品返工派发；改角色卡/边界。
- **insufficient evidence：** 只有任务文本、没有 e2e/flow 夹具；没有 blocked/gap 负例；没有角色卡/工具 diff；候选/夹具不一致。
- **not applicable：** 无；P5 整行不得 N/A。**模型行为边界：** 真实 Convener agent 的长期判断不由本标准保证；本标准判定应用产出的任务契约、工具面与脚本化 e2e 的可观察行为；真实模型是否完全遵从任务文本属于运行期表现，不是可伪造的 pass 证据。

#### 3.2.6 P6 routing record 与审计（方案 §6.3.1、§5.7、§11 Q9/Q10；§8.6 P9/P10 相关）

**标准：**

1. 路径：`.ans/governance/acceptance/<flowId>/rework-routing.json`；schema `acceptance-rework-routing/v1`；app 私有状态，不是客户决定、不是验收报告、不是 flow 步骤；角色不可写，不能作为门禁证据。
2. 字段至少：`schema`、`flowId`、`source`、`sourceDetail`、`decisionAt`、`requestId`、`reasonCode`、`reportPath`、`reportSha256`、`itemsDigest`、`itemCount`、`structured`、`coordinator`、`flowPath`、`flowSha256AtRoute`、`flowMtimeMsAtRoute`、`status`、`sentAt`、`lastDispatchedFlowSha256`、`lastDispatchedAt`、`error`、`at`。`sourceDetail` 允许 `customer-input`/`judge`/`judge-deny`/`judge-manual`；未知值按 `judge-manual` 保守处理并诊断，不写成客户拒绝。
3. 原子写；写 record 成功后才发送；record 写失败 ⇒ **不发送**（没有耐久路由记录），诊断 + Lead 系统行，下一次事件重试；发送失败 ⇒ `status:"failed"` + `error`，不标 `sent`、不派 Proof，下一次事件重试。
4. 幂等/去重：同一来源 + 决定时间/requestId + reportSha256 重复触发 ⇒ 不重复发任务/不重复系统行；重启/导入读 record 续跑；同 flow 内容重派抑制按 P4。
5. 损坏/未知 schema ⇒ 不派 Proof；尝试重建/提示；不猜、不伪造 `sent`。record 记录 `reportSha256`/`itemsDigest`；路由后报告变化按新记录处理一次，不回溯改已发任务（方案 §10.3）。
6. 账本审计只写既有 `dispatch.accepted{actorRoleId:"app", power:"app", targetRoleId:"convener", trigger:"settle"}`（无 `stepId`，避免污染验收派发时间口径）；不新增账本字段/枚举。
7. **审计失败不阻塞（Q10 A）**：record 是主去重/审计；发送成功后写账本审计；审计失败只诊断 + Lead 一条「审计记录失败」系统行，不伪造账本条目、不翻转已发送事实；回执/系统行不声称「已成功审计」。
8. routing record 不是产品候选之外的客户文档；不写目标项目；不把 `.ans` 记录当客户可见报告。

**判定方法：**

1. `test/桌面应用/acceptance-dispatch.test.ts` / `interface.test.ts` 实际执行：
   - 客户 reject ⇒ record 写入，字段完整；重复 settle/import ⇒ 不重复任务/系统行；
   - 两个 Interface 实例（同项目根、磁盘 record 保留）⇒ 第二个实例续跑/等待，不重复路由；
   - 注入 record 写失败 ⇒ 不发送、诊断 + 系统行；注入发送失败 ⇒ `failed` + 重试；
   - 注入账本审计失败 ⇒ 任务已发出/record `sent` 保持，系统行可见，账本无伪造条目；
   - 损坏/未知 schema ⇒ 不派 Proof，提示重建，不猜。
2. 检查 record JSON 的原子写实现（临时文件 + rename 或等价）与失败不破坏旧 record；检查 `.ans` 路径与 schema 字符串。
3. 账本 diff：只有既有 `dispatch.accepted`（app→convener）审计条目；无新增字段/枚举；无 `customer.decision`。
4. 报告变化：路由后写新报告版本 ⇒ 新 record 处理一次，不回溯改旧任务。

**最低证据：**

- record JSON 原文（至少客户来源、judge 来源、缺段、失败各一份）与文件哈希；
- 两个 Interface 实例输出；失败注入输出；账本 diff；诊断/系统行原文；
- 原子写实现与失败测试；
- 候选哈希与测试 diff。

**判定规则：**

- **pass：** 路径/schema/字段正确；record 先写后发送；原子写/幂等/重启去重；审计失败不阻塞但可见；账本只写既有条目；损坏/未知 schema fail-closed。
- **fail：** record 写失败仍发送；发送失败标 sent；重启重复路由；审计失败伪造账本/静默；新增账本字段/枚举；record 被当客户文档/角色可写；损坏 record 仍派 Proof。
- **insufficient evidence：** 没有 record 原文；没有重启/失败注入；没有账本 diff；只有代码阅读。
- **not applicable：** 无；P6 整行不得 N/A。

#### 3.2.7 P7 目标项目只读与恢复（方案 §3.5、§8.5、§11 Q13；§8.6 P11 的目标复算部分）

**标准：**

1. **`ans-gateway` 零写入**：只读复制 flow/账本/报告到系统临时夹具；复制前后记录源文件 SHA-256；目标 `.ans/governance/acceptance/`、`docs/flows/`、`docs/acceptance/` 无新增/变化；不在目标根执行任何写命令；不把复算结果说成目标项目已修复。
2. **快照 A 语义重建（方案 §8.5）**：复制当时目标（或快照 B 形状）到临时夹具，删除规划期间新增的 `rework-clean-install-evidence`、`rework-qa-perf-baseline` 等步骤及对应账本条目，保留 08:05 `rejected`；运行 `evaluateFlowCompletion` 应复现「仅 rejected 挡住、移除后 `ready:true`」；该夹具只复现 A 语义，不声称字节级等于 A。
3. **快照 B/当前形态**：新增 `rework-*` 为 `dispatched` 未完成 ⇒ 即使移除 `rejected` 也不 `ready`；证明返工未完成时不会误派；不追写目标的新变化。
4. **新逻辑复算**：`rejected` + flow 有更新 + 全 done + pending + 同内容未派 ⇒ 重派门通过；无更新/同内容 ⇒ 不重派；`verification` dispatched/delivered ⇒ 重开后才重派；`done` ⇒ 不重派。
5. **Q13 A**：账本/flow 是自动判定依据；升级后按重派门**允许一次重派**；如要避免与账本外 report-v2 重复，升级前由统筹把 report-v2 的复核以既有 `dispatch.accepted`（app→verifier）登记，或由客户明确接受一次重复复核；这是目标侧/客户决定，**产品不写目标项目、不伪造账本**。不把报告文件 mtime 当派发记录（Q13 B 不采用）。
6. **报告**：目标 report-v1/v2 均无机器可读段 ⇒ `structured:false` 兜底；不解析 §8/§9.1；重派任务要求 vN+1；不重写历史报告。
7. **漂移**：目标现场在规划/实施期间继续变化；判定时必须重新只读复制并记录当时哈希/行号；方案 §3.5 的快照 A/B 值不是当前现场；复算结论只证明「新逻辑在复制快照上按门动作」，不等于目标项目已恢复。

**判定方法：**

1. 测试角色/独立验收只读复制目标文件到临时根；记录复制前后 SHA-256 与文件大小/行数；在临时根运行复算（Node 实际路径记录）。
2. 构造 A 语义夹具（删除后续 rework 步骤/账本条目），断言「仅 rejected 挡住、移除后 ready:true」。
3. 构造 B/当前形态夹具（保留 dispatched rework），断言「返工未完成即使移除 rejected 也不 ready」。
4. 用新逻辑复算 rejection 后 flow 更新/无更新、同内容/不同内容、pending/dispatched/done 的矩阵；断言恰好一次门通过/不通过。
5. 断言 report-v1/v2 无 `acceptance-rework` 段时 `structured:false`，不解析自由文本。
6. 目标前后哈希清单一致；目标 `.ans/governance/acceptance/` 无新增；报告措辞只写「只读复算」。

**最低证据：**

- 目标复制 manifest（源/目标路径、SHA-256、大小、行数、复制时间）；
- 复算命令、Node 路径/版本、cwd、退出码、输出原文；
- A/B 夹具构造脚本/步骤与输出；零写入前后哈希；
- 报告复算节与措辞；
- 候选哈希（复算所用代码）。

**判定规则：**

- **pass：** 目标零写入；A/B 语义复算正确；新逻辑门矩阵正确；report-v2 处理按 Q13 A 记录；报告措辞不越界。
- **fail：** 写入目标项目；伪造账本/派发/决定；把报告 mtime 当派发记录；复算声称目标已修复；未记录复制哈希；A/B 夹具与目标复制不一致却声称复算。
- **insufficient evidence：** 只有代码阅读/旧设计数值；没有复制 manifest/前后哈希；没有复算输出；目标在复算期间被他人改动且未记录；Node 不可用。
- **not applicable：** 无；P7 整行不得 N/A。**边界：** 目标项目是否真正恢复由客户/目标项目后续真实事件决定，本行只判产品逻辑与只读复算。

#### 3.2.8 P8 兼容、迁移与不扩权（方案 §5.8、§6.4、§7.3、§8.1.8；§8.6 P8）

**标准：**

1. YAML 机器状态走新语义（最新 accepted 收口、rejected 待返工、重派门）；legacy Markdown 按 Q6 A 保持旧行为（任意 acceptance 决定终结），并在 Lead 系统行/文档提示「legacy 流程不支持自动返工重派，请迁移 YAML」；不重写旧 flow/报告/账本，不强行迁移。
2. 已 `accepted` 流程保持收口；不重开、不重派、不回退收口；已 `rejected` 流程升级后按 P4 路由/重派；不重写报告或 flow。
3. 旧报告缺结构化段按 `missing` 兜底；不解析 §8/§9.1；不要求 Proof 重写历史报告（除非 Convener 认为需要补结构）；报告 v1/v2 保留，新复核写 vN+1，不覆盖。
4. 旧 flow 步骤/`rework-*` 不重写、不改 id；新 rework 步骤用现有枚举和替代关系；保留 id `verification`/`acceptance` 规则不变。
5. **不新增** `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`；不新增验收步骤保留 id；`rework-*` 不是新 `FlowStepKind`；不改 CLI/IPC 载荷形状；不改 `CustomerInputOutcome` 必填字段（只加可选回调，不改出参）。
6. **不扩 Proof 权限**：Proof 仍只写 `docs/acceptance`/`docs/verification`/`docs/governance/verifier`，`DispatchTask:false`；不接收产品返工派发；不获得 flow 写权。
7. **不新增角色工具**：`reopenAcceptanceStepForRework` 是 app-only，不进 `AdapterCapabilities`，不注册为 `flow_*` 工具；`flow_step_update`/`flow_step_supersede` 参数/权限不改；不新增 `flow_step_add`/`addFlowStep`；不扩 Convener/Verifier 卡文本（O2 不做）。
8. 不新增依赖/构建配置/发布配方/版本号；不改 `package.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`；不改 `app/renderer/**`/`app/preload.cjs`/`src/model/**`/`governance-ledger.ts`/`governance-roles.ts`/`docs/flows/`。

**判定方法：**

1. `git diff --name-only` / `--stat` 对照团队计划写集；确认上述「不改」路径零改动（管理记录除外）。
2. `grep`/类型检查：枚举定义、`AdapterCapabilities`、工具清单、`CustomerInputOutcome`、`FlowStepKind`、`GovernancePower`/`Decision` 无新增；`reopenAcceptanceStepForRework` 只经 Pipeline 导出、未注册工具。
3. legacy 回归：既有 Markdown `flowCompletionIssue` 用例原样执行；新增回归锁；旧文案逐字不变（对照 S1 基线）。
4. `accepted` 回归：已 accepted flow 不重开/不重派/不收口回退；`completeAcceptanceStep` 幂等。
5. 旧报告/flow/账本夹具：不重写、不改 id；报告版本 vN+1；旧 v1/v2 保留。
6. `src/pipeline/orchestration/flow-state.ts` 公共出口实际导出；桌面不直接 import `src/common/编排/**`（P11.4）。

**最低证据：**

- `git diff --name-only`/`--stat`/`status` 原文；上述「不改」路径的 diff 为空；
- 枚举/工具/类型 grep 输出；公共出口导出清单；
- legacy/accepted 回归测试原始输出与文案逐字对比；
- 旧夹具前后哈希；报告版本 diff；
- 候选哈希。

**判定规则：**

- **pass：** YAML 新语义/legacy 旧行为分离；accepted 不回退；旧报告/flow/账本不重写；无新枚举/保留 id/工具/权限；无构建/发布/渲染层改动。
- **fail：** legacy 行为漂移或未加回归锁；已 accepted 被重开/重派；重写历史报告/flow/账本；新增 `FlowStepKind`/`Power`/`Decision`/`cardKind`/保留 id；Proof 获得新写权/派发权；新增角色工具/`addFlowStep`；改角色卡/枚举。
- **insufficient evidence：** 只有代码阅读；没有 diff/grep；没有 legacy/accepted 回归输出；无法区分既有 i18n/目录 v3 改动。
- **not applicable：** 无；P8 整行不得 N/A；O2 等选装子项可以「未实施」记录，但不是 N/A 的 pass。

#### 3.2.9 P9 测试、回归与证据链（方案 §8.1–§8.5、§8.6 P11；团队计划 §5.3–§5.4；§8.6 P9 边界场景）

**标准：**

1. **确定性单测/层测试**：编排、桌面、运行时、项目管理各自的受影响测试实际执行；覆盖方案 §8.1 的 1–6 项矩阵、§8.2 的集成/e2e 矩阵。
2. **集成/e2e**：`acceptance-dispatch` 集成（stub manager）覆盖客户 reject/judge/代批/缺段/坏段/未知 owner/重派/去重/循环抑制；`test/测试/governance-e2e-auto/` 覆盖全链路 reject → Convener → rework → 重派 → accept、judge auto-rework、报告缺段、legacy 不变。
3. **真实 Electron**：`test/桌面应用/e2e/main.mjs` 对当前候选 fresh userData 运行；记录 `E2E_PASS`/失败原文；不把既有平台性失败算本变更通过；定向系统行冒烟可最小追加，不新建 UI 通道。
4. **T3 串行全量**：`node --test --test-concurrency=1 "test/**/*.test.ts"`，排除 `test/pi-adapter/write-sequencing.test.ts` 并记录；`npm run typecheck`、`typecheck:renderer`、`build:renderer`；基线对照；既有 Windows symlink EPERM 分类；零新增确定性失败。
5. **断言未弱化**：`test/桌面应用/acceptance-dispatch.test.ts` 既有 rejected 用例按 Q1 **替换**为新语义（最新 rejected ⇒ 路由/不永久收口），同时保留「accepted ⇒ 收口/不重派」「无新进展 ⇒ 不重派」负例；任何删除/放宽断言须在变更包列明理由并由独立验收核对；不得为保绿改弱。
6. **目标只读复算**：按 P7 执行；复算只证明逻辑，不声称目标已修复。
7. **S1–S7 证据**：S1 基线（typecheck、受影响套件、全量基线、已知挂起排除、目标快照与哈希、逐角色 preflight）；S2 编排契约；S3 桌面路由；S4 运行时措辞；S5 i18n key/parity；S6 接线/构建；S7 集成/回归/验收；各阶段原始输出、候选哈希、退出码、计数、失败分类齐全。
8. **测试角色独立**：测试角色只跑跨角色 e2e、完整链路、T3 全量、真实 Electron、目标只读复算；不修产品、不改其他角色测试、不自验产品；开发角色自跑单元/层测试并交原始输出。
9. **候选与证据一致**：所有证据对应当前候选；复用仅限同候选/同输入/同命令/同夹具/同环境；候选变化按 §2.3 重取；`skip`/`todo` 不计通过。

**判定方法：**

1. 逐条核对变更包/证据 manifest 中的命令、cwd、时间、执行者、环境、退出码、计数、stdout/stderr、失败原文；抽样复算关键命令。
2. 对照实施前基线与最终候选：全量计数、失败清单、分类；确认零新增确定性失败；既有 EPERM 有基线原文。
3. 检查测试 diff：新增断言、被替换的旧断言、保留的负例；确认没有删除/放宽断言；确认新增测试在授权目录/文件内（`test/桌面应用/` 未新建）。
4. 检查 e2e/Electron 原始日志与 `E2E_PASS`；检查目标复算 manifest 与零写入。
5. 检查 S1–S7 记录与候选哈希；确认 S1 在实施前、S7 在最终候选上。

**最低证据：**

- 所有命令的原始 stdout/stderr、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、计数（pass/fail/skip/todo）；
- 实施前基线与最终候选对照表；失败分类与原文；
- 测试文件 diff（新增/替换/保留断言）；
- e2e/Electron 原始日志、`E2E_PASS`、失败原文；
- 目标复算 manifest/输出/零写入证明；
- S1–S7 记录与变更包；
- 候选哈希。

**判定规则：**

- **pass：** 方案 §8.1–§8.5 的测试面齐全并对当前候选执行；T3 串行全量无新增确定性失败；Electron `E2E_PASS`；断言未弱化；目标复算零写入；S1–S7 证据齐全。
- **fail：** 只跑单测/跳过 T3 全量；删除/放宽断言；新建未授权测试文件或改 `main.mjs` 断言换绿；`skip`/`todo` 当通过；Electron 失败/缺失仍判 pass；目标被写；候选与证据不符；把环境问题笼统带过。
- **insufficient evidence：** 缺命令/退出码/计数/原始日志；缺基线对照；缺 Electron；缺目标复算；缺 S1–S7 某阶段证据；Node 不可用。
- **not applicable：** 仅允许 `test/桌面应用/operator-wiring.test.ts`（若无回调/三态断言受影响）、`test/测试/governance-judge-cards-verify/`（若 judge 卡证据已由其他授权用例覆盖）两个**条件子项** N/A，并写明依据；T3 串行全量、真实 Electron、目标只读复算、`typecheck`/`typecheck:renderer`/`build:renderer` 永不 N/A。

#### 3.2.10 P10 证据完整性与报告（方案 §8.7；验收角色参考；§8.6 P11）

**标准：**

1. 变更包与证据 manifest 至少含：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 S1–S7、证据链接、风险档位 **T3**、复用证据与失效说明、标准版本/哈希、未解决问题。
2. 原始证据完整：命令、cwd、时间、执行者、环境、退出码、stdout/stderr、计数、失败原文、候选哈希、diff/status；flow/账本/record/报告原文；e2e/Electron 日志/截图清单；目标复制 manifest/前后哈希。
3. **不接受「全部通过」摘要**：每行 P 的证据必须能定位到原始输出/文件；只有角色自述、测试转述、工具成功提示、模型自我报告不算。
4. 证据复用记录：来源、原候选、原命令、仍有效理由；失效按 §2.3；T3 全量不可复用。
5. 报告首行五项：`风险档位：T3｜判定依据：…｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`；本任务全量回归应写「已执行」，不得写 N/A。
6. 报告须链接：任务/阶段、客户确认的方案版本（路径 + 哈希）、本标准版本与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由；报告须含完整验收表（P1–P12 + G1/G2），逐行填实际证据、结果、验收判断。
7. 报告不得只写「已完成」/「通过」而无表；不得伪造/省略失败原文；不得把管理记录当产品候选；不得把目标复算说成目标已修复。
8. 证据失效规则：候选/输入/依赖/契约/夹具/配置/环境变化 ⇒ 受影响证据失效并重取；旧报告过期；不得用旧候选证据判新候选。

**判定方法：**

1. 对照变更包/报告与原始日志：逐文件哈希、HEAD、status/diff/stat、命令、退出码、计数、失败原文；抽样复算 2–3 个关键命令。
2. 检查报告首行五项与完整验收表；检查每行是否有实际证据路径/哈希、候选版本、结果、判断；检查未解决问题与结论理由。
3. 检查复用证据记录与失效说明；确认没有把 i18n/目录 v3/写卡门禁的证据/结论混入。
4. 检查证据文件可追溯、未被替换；确认报告与候选一致。

**最低证据：**

- 变更包与报告原文；
- 证据 manifest/原始日志/命令输出/哈希清单；
- 复用/失效记录；
- 抽样复算输出；
- 候选哈希与 G1/G2 记录。

**判定规则：**

- **pass：** 证据完整、原始、对应当前候选；报告首行五项与完整表齐全；复用/失效规则正确；无「全部通过」空话；无伪造。
- **fail：** 伪造输出/哈希/`E2E_PASS`/目标复算；用摘要代替原始证据；报告缺表/缺首行；把管理记录当产品候选；用旧候选证据判新候选；把 i18n/目录 v3/写卡门禁结论混入。
- **insufficient evidence：** 证据缺失/不完整/无法追溯；报告未产生（若实施未完成，按「尚未到判定阶段」处理，不记 fail）；命令不可复算；环境不可用。
- **not applicable：** 无；P10 整行不得 N/A。

#### 3.2.11 P11 非目标、范围外零改动与分层/权限（方案 §2.3、§4.2、§6、§7.3；团队计划 §3.7；§8.6 P10 + P12 的非目标部分）

**标准：**

1. **范围外零改动**：不改 CLI、发布配方、打包、版本号、`package.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`、`app/renderer/**`、`app/preload.cjs`、`src/model/**`、`src/common/编排/governance-ledger.ts`、`src/common/门禁引擎/governance-roles.ts`、`docs/flows/`、目标项目；不改角色卡/边界/枚举；不新增依赖。
2. **共享文件只算本变更 hunk**：`interface.ts`/`governance-advance.ts`/`customer-input.ts`/`app/main.ts`/i18n messages 的既有 i18n、目录 v3、写卡门禁改动不混入本候选；diff/change package 能逐 hunk 区分；无法区分 ⇒ `insufficient evidence`。
3. **分层**：桌面只经 `src/pipeline/orchestration/flow-state.ts` 公共出口消费编排；不 import `src/common/编排/**` 私有实现，不 import `src/provider/runtime/**` 实现；Pipeline 不复制门禁逻辑、不做二次判定；Model 不新增文件；Service 不新增；Provider 只改 `tools.ts` 措辞；`app/main.ts` 只做接线，不放业务逻辑。
4. **权限/工具面**：不新增角色工具、不扩 `AdapterCapabilities`、不改 `flow_step_update`/`flow_step_supersede` 参数/权限、不新增 `addFlowStep`/`flow_step_add`；`reopenAcceptanceStepForRework` app-only 不注册；routing record 只在 `.ans`，角色不可写；不把 `.ans` 记录当客户文档；不扩 Proof 权限。
5. **测试文件授权**：`test/桌面应用/` 不新建文件；新增 e2e 在 `test/测试/` 授权目录；`main.mjs` 默认只运行，定向扩展最小追加并说明。
6. **不提交/不推送/不合并/不发布**；不暂存（`git diff --cached --name-only` 为空，除非统筹明确记录）；无 `.ans/project.json`/task_ops 伪造。

**判定方法：**

1. `git diff --name-only`/`--stat`/`status`/`--cached` 对照团队计划 §3.1–§3.6；逐路径确认零越界；共享文件 diff 逐 hunk 归属。
2. import 检查：`app/desktop/*.ts` 不 import `src/common/编排/**`/`src/provider/runtime/**` 实现；只 import Pipeline 公共出口。
3. grep/类型检查：枚举、`AdapterCapabilities`、工具清单、`addFlowStep`/`flow_step_add` 无新增；`reopenAcceptanceStepForRework` 不在工具注册表。
4. 角色卡/边界 diff 为空；`governance-roles.ts` diff 为空；目标哈希前后一致。
5. `git diff --cached --name-only` 为空；无 commit/push/release 记录。

**最低证据：**

- `git diff --name-only`/`--stat`/`status`/`--cached` 原文；
- 共享文件 hunk 归属说明；
- import 检查、枚举/工具 grep、公共出口导出清单；
- 角色卡/边界/`governance-roles.ts` diff；
- 目标哈希；提交/推送/发布状态；
- 候选哈希。

**判定规则：**

- **pass：** 零范围外改动；共享文件只含本变更 hunk；分层/公共出口正确；无新枚举/工具/权限；无提交/推送/发布。
- **fail：** 改范围外路径/角色卡/边界/枚举/目标项目；桌面深导私有实现；新增角色工具/`addFlowStep`；Proof/Convener 获得新写权/派发权；新建 `test/桌面应用/` 文件；提交/推送/发布。
- **insufficient evidence：** 无法区分共享文件 hunk 归属；缺 diff/import/枚举/工具证据；候选身份不清。
- **not applicable：** 无；P11 整行不得 N/A。

#### 3.2.12 P12 文档与状态如实（方案 §13；团队计划 §九；§8.6 P12）

**标准：**

1. **标准先于实施**：本文件 v1 的写盘时间/哈希在变更包与统筹记录中先于实施开始（S2 → S3/S4/S5/S6）；实现后的角色文档/报告不得显示标准是在实施后为适配候选补写的。
2. **状态区分**：实现完成但未验收时，本变更相关角色文档状态为 `implemented-unverified`；不得出现 `verified`、`已验收`、`验收通过` 等字样（除非引用本变更报告的正式结论，且报告已按标准判定）；测试完成不等于验收通过；方案/团队计划写盘不等于实施。
3. **报告独立**：`docs/acceptance/acceptance-rework-routing-report-v1.md` 另写；本文件不是报告；报告首行五项齐全；报告结论只对当前候选有效。
4. **不提前宣称**：不声称已实施/已测试/已验收/目标项目已修复；不把方案、团队计划、测试记录、变更包当验收结论；不把工具成功/默认勾选/团队共识/沉默当客户确认。
5. **独立性**：本变更的候选、标准、报告、变更包与 i18n、目录 v3、治理写卡门禁、v1.7.0 发布全部分开；不得引用它们的通过结论替代本变更证据，也不得把本变更结论写成对它们的背书。
6. **不越界**：不声称已提交、推送、合并、发布；不把临时夹具/目标复算说成目标项目已修复；实施授权未给前不声称已实施。

**判定方法：**

1. 核对本文件哈希/写盘记录与变更包/S1–S7 记录中的标准版本与顺序。
2. 抽查角色文档状态与报告路径/首行五项；确认未验收时没有 `verified`/`验收通过` 字样。
3. 核对报告与 i18n/目录 v3/写卡门禁报告分开；核对无合并结论。
4. 核对无 commit/push/merge/release 记录；核对目标项目措辞。

**最低证据：**

- 本文件哈希与写盘记录；变更包/S1 记录中的标准版本与顺序；
- 角色文档状态摘录（`implemented-unverified`）；
- 报告路径与首行五项；
- 候选隔离说明与 `git status`/diff；
- 发布/提交状态；目标复算措辞。

**判定规则：**

- **pass：** 标准先于实施；状态如实；报告独立且首行五项齐全；独立性/不越界措辞正确。
- **fail：** 实施后才写标准或按候选改标准；未验收写 `verified`/`验收通过`；报告缺失/与本文件混写；与 i18n/目录 v3/写卡门禁合并结论；声称已提交/推送/发布或目标已修复。
- **insufficient evidence：** 无法建立标准先于实施的顺序；角色文档状态缺失；报告未产生（若实施未完成，按「尚未到判定阶段」处理，不记 fail）。
- **not applicable：** 无；P12 整行不得 N/A。

### 3.3 成功、失败与重要边界情形（判定观察点）

下表把任务要求与方案 §5.7/§8.2 的情形落到行；每行都要有实际观察，不得只凭代码阅读。

| # | 情形 | 期望观察 | 覆盖行 |
| --- | --- | --- | --- |
| 1 | 最新 `accepted` | 收口（`verification` done + acceptance 证据）；不路由、不派 Proof | P1、P3、P4 |
| 2 | 最新 `rejected` | 不 closed；路由 Convener；Proof 不接收返工派发 | P1、P3 |
| 3 | judge `deny`（acceptance 卡） | 路由 Convener；系统行/回执「自动决策未通过」；无 `customer.decision` | P3 |
| 4 | judge manual（timeout/parse-failed/not-recommended/group-mismatch） | 同 #3；不把基础设施故障当返工结论（switch-off/aborted/unavailable/notPresented/ledger-unavailable/row-failed 不路由） | P3 |
| 5 | judge 代批 reject | 账本 `decisionEvidence.kind:"judge"`；来源 `judge`；系统行「自动决策未通过（判断代批）」；不写「客户拒绝」 | P1、P3 |
| 6 | 客户手拒 | 账本 `customer-input`；系统行「客户拒绝」；来源 `customer`；客户最终决定权不变 | P1、P3 |
| 7 | 报告无结构化段 | `missing`；Convener「报告不完整」任务；无 items、无 flow 步骤、无客户决定；不解析自由文本 | P2、P3、P5 |
| 8 | 报告坏段（YAML/字段/重复 id/空 owner/action/多 owner/超限/多块/不支持版本） | 整段不采信；具体错误 path；不部分使用；不猜 | P2、P3 |
| 9 | 未知/不可派发 owner | 逐项 blocked；有效项可先行；不猜、不改 owner、不静默丢弃 | P3、P5 |
| 10 | 无可 supersede 旧步骤 | fail-closed gap；记录并请 Lead/Proof 补 flow 计划；不凭空造步骤；不新增 `addFlowStep` | P5、P8 |
| 11 | 重复拒绝/重复 settle/import/项目刷新 | 一条路由、一条系统行、不重复 Convener 任务；record 去重 | P3、P6 |
| 12 | `verification` `dispatched` | 先重开为 `pending`；成功后可重派；失败不派并提示 | P4 |
| 13 | `verification` `delivered` | 同 #12；清旧 evidence；保留 supersedes/dependsOn/parallelGroup | P4 |
| 14 | `verification` `done` + `rejected` | 异常；不重开、不重派；提示人工核对 | P4 |
| 15 | rejection 后 flow 无进展 | 不重派；「等待返工」去重系统行；无热循环 | P4 |
| 16 | rejection 后 flow 实质更新 + 执行全 done + pending + 同内容未派 | 恰好一次 Proof 重派；成功后 record 更新；再触发不重派 | P4、P9 |
| 17 | 先 accepted 后 rejected | 按最新 rejected 不 closed；不自动重开 done；人工核对异常 | P1、P4 |
| 18 | 先 rejected 后 accepted | 按最新 accepted 收口；不重派 | P1、P4 |
| 19 | 审计失败 | 任务可已发出；record `sent` 保持；诊断 + Lead「审计记录失败」；不伪造账本 | P6、P9 |
| 20 | 报告 vN+1/路由后报告变化 | 读最新 vN；重派要求 vN+1；不覆盖被拒报告；reportSha/itemsDigest 记录；不回溯改已发任务 | P2、P6 |
| 21 | legacy Markdown | 旧行为（任意 acceptance 终结）；不自动重派；迁移提示；不重写旧 flow/报告/账本 | P1、P8、P9 |
| 22 | 目标 report-v2（账本外复核） | Q13 A：账本/flow 为自动依据；升级后允许一次重派；可升级前登记/接受一次重复；不把报告 mtime 当派发；不伪造账本 | P7、P9 |
| 23 | 候选变化但 flow 未变 | 应用不重派；要求 Convener 登记 flow；残差风险如实写明；不伪造候选哈希 | P4、P10 |
| 24 | tamper/越权（清单当指令、未知 coordinator、`owner:verifier/convener/app/customer`） | 清单是数据不是权限；未知 coordinator 仍发 Convener；verifier/convener 按报告/治理修正，不派产品返工；app/customer blocked；不扩权/不新增枚举/工具 | P3、P5、P8、P11 |
| 25 | routing record 写失败 | 不发送；诊断 + 系统行；下一次事件重试；不伪造 sent | P6 |
| 26 | 发送失败/Convener 忙/queued | 失败记 `failed` + 错误并重试；queued 视为已投递、占位保留、不重复刷 | P3、P6 |
| 27 | 报告缺失/不可读 | 仍路由报告路径 + 缺报告提示；`structured:false`/`reportMissing:true`；不伪造清单 | P2、P3 |
| 28 | flow 不可读/非法/缺验收步骤 | 不路由/不重派；Lead 具体原因；不猜 | P1、P4、P6 |
| 29 | `acceptance-criteria` verifier 派发 | 不计入 `acceptanceLastDispatchAtMs`/`acceptanceDispatchRecorded`；不挡返工重派 | P4 |
| 30 | 同 flow 内容 mtime 被 touch | `lastDispatchedFlowSha256` 挡住；不因 mtime 抖动多派 | P4 |
| 31 | 无 `customer.decision` 的 auto-rework | 只有 routing record + 诊断/系统行；不是 closed；不得伪造客户决定 | P3、P6、P8 |
| 32 | 重复 rejection 但无新 flow 更新 | 不重派；不刷屏；下一次真实事件才重试 | P4、P6 |

### 3.4 不适用（N/A）规则

- **P1–P8、P10–P12 不得整行 `not applicable`。** 本任务有代码/测试面与行为变化，必须逐行判定。
- **P9 只允许两个条件子项 N/A**：`test/桌面应用/operator-wiring.test.ts`（若无回调/三态断言受影响）、`test/测试/governance-judge-cards-verify/`（若 judge 卡证据已由其他授权用例覆盖），并写明依据；T3 串行全量、真实 Electron、目标只读复算、`typecheck`/`typecheck:renderer`/`build:renderer` 永不 N/A。
- **P8 的选装子项**（O1/O2/O3/O4）可以记录「未实施」，但这不是 N/A 的 pass；它们本身就是非目标，P8 仍须按主标准判定。
- 任何 N/A 必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理；N/A 不得算作 pass。

---

## 四、证据计划

### 4.1 候选与基线证据

判定时统筹/验收只读执行并保留原始输出：

- `git rev-parse HEAD`；
- `git status --short`；
- `git diff --name-only`；如暂存，另附 `git diff --cached --name-only`；
- `git diff --stat`；完整 `git diff`（至少覆盖全部本变更 hunk；过大时按文件分段，不可截断到无法核对）；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`（新增文件同）；
- 方案/团队计划/沟通记录/本标准的 `sha256sum` + `git hash-object`；
- 实施前基线（S1）与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文与分类；
- 目标项目复制 manifest 与前后哈希。

### 4.2 测试命令（按仓库实际脚本；Node 不在 PATH 时记录完整路径）

1. `node --test --test-concurrency=1 test/编排/flow-state.test.ts`；
2. `node --test --test-concurrency=1 test/编排/flow-service.test.ts`；
3. `node --test --test-concurrency=1 test/编排/acceptance-rework.test.ts`（新增）；
4. `node --test --test-concurrency=1 test/桌面应用/acceptance-dispatch.test.ts`；
5. `node --test --test-concurrency=1 test/桌面应用/interface.test.ts`；
6. 条件：`node --test --test-concurrency=1 test/桌面应用/operator-wiring.test.ts`（仅当回调/三态断言受影响）；
7. `node --test --test-concurrency=1 test/runtime-core/tools.test.ts`；
8. `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts`（parity）；按需 `i18n-guard.test.ts`；
9. `node --test --test-concurrency=1 "test/测试/governance-e2e-auto/*.test.ts"`（含新增全链路/缺段/legacy/目标夹具）；
10. T3 全量：`node --test --test-concurrency=1 "test/**/*.test.ts"`，按 §2.4 排除 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式；
11. `npm run typecheck`；
12. `npm run typecheck:renderer`；
13. `npm run build:renderer`；
14. 真实 Electron：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（以仓库实际路径为准；fresh userData；记录 `E2E_PASS`/失败原文）。

### 4.3 夹具要求

- **编排单测**：flow YAML + 账本构造函数；覆盖 append 顺序、accepted/rejected 序列、`allowRejectedAcceptance`、`verification` 各状态、坏账本、缺步骤、原子写失败；解析器覆盖 §3.2.2 的正/负例矩阵。
- **桌面集成**：`test/桌面应用/acceptance-dispatch.test.ts` / `interface.test.ts` 既有 harness 或同等注入；stub manager、stub customerInput、stub 账本追加/审计；覆盖客户/judge/代批/缺段/坏段/未知 owner/重派/去重/循环抑制/record 写失败/发送失败/审计失败；两个 Interface 实例（同项目根、磁盘 record 保留）验证重启去重。
- **e2e**：`test/测试/governance-e2e-auto/` 临时项目根与脚本化 adapter；至少：reject → Convener → rework → 重派 → accept 全链路；judge auto-rework；报告缺段兜底；legacy 不变。不得批量改既有夹具；legacy 至少保留一条不变链路。
- **目标复算**：只读复制 `ans-gateway` 的 flow、ledger、report v1/v2 到系统临时根；复制前后记录源哈希；夹具 ID/flowId 不覆盖本仓库既有管理记录；A/B 语义构造按方案 §8.5；零写入。
- 所有夹具必须使用独立临时根/端口/日志/输出目录；不共享可变项目根；不写目标项目。

### 4.4 真实 Electron

- 命令：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（以仓库实际路径为准）。
- 必须记录：命令、时间、候选哈希、退出码、OUTDIR、报告/截图清单、包含 `E2E_PASS=true` 与 `E2E_DONE=1` 的原始输出；若有 `E2E_FAILURES` 原文保留。
- 定向系统行冒烟（客户拒绝 / 自动决策 / 报告缺段）可在同一自检台最小追加，不新建 UI 通道；不得删除既有断言或把平台性失败改成通过。
- `E2E_PASS` 缺失、false、无法对应候选或通过修改 `main.mjs` 换取 → 不判 pass；环境不可用按 `insufficient evidence`。

### 4.5 目标项目只读复算

- 只读复制 `ans-gateway` 的 `docs/flows/ai-governance-pipeline.yaml`、`.ans/governance/ledger.jsonl`、`docs/acceptance/ai-governance-pipeline-report-v1.md`、`report-v2.md` 到临时夹具；记录源文件 SHA-256（前/后）、大小、行数、复制时间。
- 断言：A 语义「仅 rejected 挡住、移除后 `ready:true`」；B/当前形态「rework 未完成即使移除 rejected 也不 ready」；新逻辑门矩阵（rejection 后更新/无更新、同内容/不同内容、pending/dispatched/done）；report-v1/v2 无段 ⇒ `structured:false`。
- 目标零写入：前后哈希一致；目标 `.ans/governance/acceptance/` 无新增；不得在目标根执行任何写命令。
- Q13 A 记录：升级后允许一次重派；若升级前登记 report-v2，记录登记方式（既有 `dispatch.accepted` app→verifier）或客户接受一次重复的决定；本产品不写目标项目。
- 报告措辞只写「只读复算」，不写「目标项目已修复/已解锁」。

### 4.6 变更包（统筹提交）

路径：`docs/scheduling/acceptance-rework-routing-change-v1.md`。至少含 G1 所列内容；证据链接指向原始日志/哈希；声明本变更候选与 i18n/目录 v3/写卡门禁的隔离；声明 T3 与全量回归执行情况；列出未解决问题与需要沟通/统筹澄清事项；记录 P 编号对照（§八.1）与团队计划状态头差异（§八.2）。

### 4.7 禁止事项

- 无 `.ans/project.json`、未启用 task_ops：不伪造任务令牌、锁、审批、机器预检或调度机器日志；
- 不伪造测试输出、哈希、Electron `E2E_PASS`、目标复算结果、routing record、系统行或客户确认；
- 不修改目标项目；不提交/推送/合并/发布；
- 不为通过而删除/放宽测试断言、跳过检查、把失败写成环境问题；
- 不在本文件写验收结论或报告；
- 不把方案/团队计划/测试记录/工具成功当客户确认或验收通过。

---

## 五、判定规则与总体结论

### 5.1 每行验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据原始、对应当前候选、覆盖标准。 | 最新决定矩阵全过；解析器正/负例全过；客户/judge 路由与措辞正确；重派恰好一次；reopen 正/负/幂等；Convener 契约与 e2e；record/审计；目标零写入复算；legacy 不变；T3 无新增失败；Electron `E2E_PASS`。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | 任意 acceptance 都收口；rejected 仍「已收口」；解析自由文本/坏段部分采信；路由给 Proof；judge 写「客户拒绝」；reject 后立即重派/每次 settle 重派；`verification` dispatched 仍派；done 被自动重开；Convener 写客户决定；record 写失败仍发送；审计失败伪造账本；新增枚举/工具/写权；改目标项目；T3 新增失败；`E2E_PASS=false`；测试断言被放宽。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有最新决定矩阵；没有解析器负例；没有任务文本/账本/record 原文；没有 mtime/sha 断言；没有 e2e/Electron；没有目标复算；缺 S1–S7 某阶段；报告首行缺项。 |
| **not applicable** | 该行/子项确实不适用于本任务/分支，且写明依据。 | 仅 §3.4 允许的 P9 两个条件子项；P1–P8、P10–P12 不得整行 N/A；N/A 不算 pass。 |

### 5.2 总体结论

- **通过：** P1–P12 全部适用行 pass（含 G1/G2）；候选哈希与证据一致；T3 串行全量回归对当前候选执行且无本次新增确定性失败；真实 Electron `E2E_PASS=true`；目标只读复算零写入；报告首行五项齐全；每条 pass 有原始证据。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（编排、桌面窗口、运行时核心、项目管理、测试、统筹/人事），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补，不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时列出待补证据，避免修复后重复缺证。
- 结论只对当前候选有效；候选变化后按 §2.3 重新判断受影响部分。通过只表示当前候选满足本标准 v1，**不授权提交、推送、合并、发布或任何对外操作**。

### 5.3 报告要求

- 报告路径：`docs/acceptance/acceptance-rework-routing-report-v1.md`（内置独立验收写，不由统筹/开发代写；本文件不是报告）。
- 报告**首行**五项：`风险档位：T3｜判定依据：…｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`；本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的方案版本（路径 + 哈希）、本标准版本与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P12 + G1/G2），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 报告不得与 i18n/目录 v3/写卡门禁/发布合并结论；不得声称目标项目已修复。
- 报告须记录 P 编号对照（§3.0/§八.1），避免与方案 §8.6、团队计划 §5.2 的编号混淆。

---

## 六、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录、调度记录或目标项目：

1. **核对基线：** 读取沟通记录闸门 0/1/2 与实施授权；核对方案、团队计划、沟通记录哈希与 §1.1/§1.5 一致；确认方案 v1 是客户确认版本、Q1–Q13 A、O1–O4 不做。若基线文档变化，按 §2.5/§2.3 处理。
2. **核对候选身份与变更包：** 复算 HEAD、各产品文件 `git hash-object`/`sha256sum`、`status`/`diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、i18n/目录 v3/写卡门禁工作树改动被隔离。
3. **核对档位：** 确认变更包为 T3，档位与改动相符；不相符时退回统筹或按更高档补证；验收可升档，不能降档。
4. **核对写集（G2）：** 将改动路径与团队计划 §3.1–§3.6 对照；确认无越界、`test/桌面应用/` 未新建、`main.mjs` 未改既有断言、`app/main.ts` 仅接线、无提交/推送/发布。
5. **核对 P1：** 读 `flow-state.test.ts`/`flow-service.test.ts`/`acceptance-dispatch.test.ts` 的最新决定矩阵、accepted/rejected 顺序、`allowRejectedAcceptance`、未结算/坏账本/缺步骤、legacy 回归；核对 flow/账本快照。
6. **核对 P2：** 读 `acceptance-rework.test.ts` 正/负例、目标报告无块夹具、任务文案硬要求、报告版本读取；核对解析器不解析自由文本、整段不采信。
7. **核对 P3：** 读客户/judge/代批/auto-rework 四条路径的任务文本、系统行、账本/record、`tools.test.ts`、allowlist 负例、Electron/e2e；核对无 `customer.decision` 伪造、Proof 零返工派发。
8. **核对 P4：** 读重派门条件、mtime/sha 断言、`acceptanceLastDispatchAtMs` 收窄、`reopenAcceptanceStepForRework` 正/负/幂等/终态、循环抑制、目标夹具；核对恰好一次。
9. **核对 P5–P6：** 读 Convener 任务契约、e2e flow 夹具、blocked/gap、角色卡/工具 diff；读 routing record 路径/字段/原子写/重启去重/失败注入/审计、账本 diff。
10. **核对 P7–P8：** 读目标复制 manifest/前后哈希/复算输出/零写入；读 legacy/accepted 回归、旧报告/flow/账本不重写、枚举/工具/权限 diff。
11. **核对 P9–P12：** 对照基线与最终候选的 T3 原始输出、Electron `E2E_PASS`、typecheck/typecheck:renderer/build:renderer、失败分类、S1–S7 证据；核对证据完整性、非目标零改动、文档状态与报告独立性。
12. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 七、写标准时的只读事实与已知对照（只报告，不改）

以下为标准写盘时的只读核对结果；判定时若实施已按方案调整，以当前候选与测试输出为准。本节不构成对实现的豁免或放宽。`path:line` 只用于定位，实施/判定时以测试标题、文件路径与符号名为准；行号漂移不改变标准。

1. **当前 `hasAcceptanceDecision` 是布尔口径。** `src/common/编排/flow-state.ts:1003–1007` 只判断「存在 acceptance 决定」，`:1071–1072` 对任意决定返回「该流程已有验收决定，流程已收口。」；这正是方案 §3.4 R4 要修的行为。P1 判定必须看到它被 `latestAcceptanceDecision` 取代。
2. **当前 `completeAcceptanceStep` 检查任一 accepted。** `src/common/编排/flow-service.ts:695–701` 用 `ledger.entries.some(... customerDecision === "accepted")`；若更早有 accepted、最新为 rejected，当前实现仍会写 flow。方案 §5.5.1 要求只认最新 accepted；P1/P4 必须有「accepted 后 rejected」负例。
3. **当前验收派发时间口径过宽。** `app/desktop/governance-advance.ts:388–422` 把任何 `targetRoleId:"verifier"`（含 `stepId:"acceptance-criteria"`）都算作验收派发；方案 §5.5.3/Q4 要求收窄为 `stepId:"verification"` 或旧无 stepId + verifier。P4 必须有正/负例。
4. **legacy `flowCompletionIssue` 把任意 acceptance 决定当终态。** `app/desktop/governance-advance.ts:489–492`；Q6 A 要求保持旧行为并加回归锁，不能把它改成新语义而不重开闸门。
5. **既有 rejected 测试固定旧行为。** `test/桌面应用/acceptance-dispatch.test.ts:1429–1466` 断言「已有验收决定 ⇒ 不派 verifier」并注释「已有验收决定 ⇒ 流程已收口」。按 Q1 必须**替换**为新语义（最新 rejected ⇒ 路由/不永久收口），同时保留 accepted/无进展负例；不得只删除断言。这是方案 §3.4 明确指出的既有测试冲突。
6. **`declined` 文案当前统一写「客户拒绝」。** `src/provider/runtime/tools.ts:1333–1337`（`request_confirmation`）与 `:1468–1470`（`request_choice`）未看 `outcome.operatorId`；P3.4 要求 judge 来源改写、客户来源保持、`notPresented`/`unavailable` 不变。
7. **judge auto-rework 当前直接结算给 Proof。** `app/desktop/customer-input.ts:621–770` 的 deny/manual 分支 `settleEntry(... outcome:"declined", operatorId:"judge:..." ...)`；当前 `CreateCustomerInputChannelOptions` 无 `onAutoRework`。P3.1 要求新增可选回调，且不改变三态/账本语义。
8. **`app/main.ts` 已有可变句柄模式。** `app/main.ts:480–503`、`:746–750` 的 `advanceGovernanceFlow` 是接线范式；`onAutoRework` 可同模式接入，仅接线不放业务逻辑。P11 判定 `app/main.ts` 只做接线。
9. **`buildAcceptanceTaskMessage` 当前无返工段硬要求/`reportPath` 可选参数。** `app/desktop/governance-advance.ts:536–570`；方案 §5.2.3/§5.5.5 要求追加硬要求与可选 `reportPath`/`previousReportPath`，旧调用不传时文案逐字不变。P2/P3 判定以当前候选文案与旧基线对比。
10. **i18n key 尚未建立。** 当前 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 无 `main.governance.acceptanceRework*`（写标准时 grep 为空）；方案 §6.3.3 要求 6 个 key。判定时以实际候选为准，P3/P9 要求 parity 与 zh/en 系统行断言。
11. **目标项目现场已漂移到不同于方案 A/B 的快照。** 方案 §3.5 记录 A：480 条账本、38 步、flow SHA `51e9a98b…`；B：约 483 条、40 步、`f692d9ac…`。写标准时只读实测：530 条账本、40 步（18 done/21 superseded/1 pending `verification`）、flow SHA `0805213a…`；报告 v1/v2 哈希未变；唯一 acceptance 决定仍为 08:05:01.066Z rejected；最近 `verification` 派发 08:01:26.084Z；flow mtime 10:43:13Z。**判定时必须重新复制并记录当时哈希，不得把本节或方案 A/B 数值当当前现场。**
12. **目标报告没有机器可读段。** `ans-gateway/docs/acceptance/ai-governance-pipeline-report-v1.md` 与 `report-v2.md` 均无 `acceptance-rework` 段（写标准时 grep 为空）；P7/P2 的 `structured:false`/`missing` 兜底必须有实际夹具证据。
13. **Node/npm 不在当前 shell PATH。** 写标准时 `node --version`/`npm --version` 均 `command not found`；既有记录为 Node v24.22.1 / npm 11.19.1。P9/P10 要求记录实际 Node/npm 路径与版本，不得伪造。
14. **已知挂起测试存在。** `test/pi-adapter/write-sequencing.test.ts` 存在；T3 全量必须排除并记录，不能把挂起当通过。
15. **团队计划状态头与闸门 2 确认不一致。** 团队计划状态头、§1.5、§九仍写「闸门 2 未确认、实施授权未给」；沟通记录已确认闸门 2。本标准以沟通记录为准，不改写团队计划；变更包/报告应引用沟通记录（见 §八.2）。
16. **`app/main.ts` 角色标签与方案不一致。** 方案 §6.1/§7.1 把 `app/main.ts` 归「装配」；权威 `角色卡/桌面窗口/boundary.md` Section 1 与闸门 2 确认归桌面窗口，装配边界不含该文件。本验收按团队计划写集核对，不据方案标签判越界；这是角色标签校正，不是边界变更。
17. **`test/桌面应用/` 逐文件授权依赖目录 v3 候选。** 团队计划 §6.2/§8.3 要求 S1 预检确认 `acceptance-dispatch.test.ts` 的 boundary 条目仍在；若被回退/未落地，停止派发，交人事/闸门 2 补条目。本标准不默认该目录可新建文件。
18. **未启用 task_ops。** 无 `.ans/project.json`；不伪造任务令牌/锁/审批/机器预检；证据以文件、原始输出与哈希为准。
19. **P 编号与方案/团队计划不一致。** 任务要求的 P1–P12 分组（P4 重派门、P6 routing record、P7 目标恢复、P9 测试、P10 证据、P11 非目标）与方案 §8.6、团队计划 §5.2 的 P1–P12 编号不同；§3.0 已逐行对照。判定报告必须引用本标准 P ID 并附方案行号，避免误读（见 §八.1）。
20. **当前 `governance-advance.ts` 的 `acceptanceDispatchRecorded` 还接受 app 写的 `stepId:"verification"`（无 targetRoleId）。** 收窄时须明确保留「stepId verification」这一支，否则既有 app 记录会被误排除；P4.3 以设计「只认 stepId verification，或旧无 stepId + verifier」为准，并要求实现/测试写明精确谓词（见 §八.5）。

---

## 八、需要沟通/统筹澄清的问题

1. **P 编号映射（需在变更包/报告登记）。** 本任务要求使用 P1–P12 的分组（P4 重派门、P6 routing record、P7 目标恢复、P9 测试、P10 证据、P11 非目标）与方案 §8.6、团队计划 §5.2 的 P1–P12 编号不完全一致。本标准按任务要求使用 P1–P12，并在 §3.0 给出逐行对照；请统筹在 `docs/scheduling/acceptance-rework-routing-change-v1.md` 与验收报告中登记该对照，避免「方案 P4 措辞」「方案 P7 重开」被误读为缺失。若客户/统筹要求改用方案编号，需递增标准 v2，不能静默替换。
2. **团队计划状态头过期。** 团队计划仍写「闸门 2 未确认、实施授权未给」，而沟通记录已确认闸门 2。请统筹在变更包中引用沟通记录作为授权事实；本标准不据此改写团队计划，也不把过期状态头当未确认。实施授权仍未给，需另行记录。
3. **方案 §8.6 P4（措辞）/P7（verification 重开）没有独立 P ID。** 本标准把它们并入 P3.4/P4.4；请统筹/测试在证据清单中显式标注「方案 §8.6 P4/P7」以保持可追溯。若认为必须独立成行，需标准 v2。
4. **`acceptanceLastDispatchAtMs` 收窄的精确谓词。** 方案 §5.5.3 写「只认 `stepId:"verification"`，或旧记录（无 `stepId`）且 `targetRoleId:"verifier"`」；当前实现还接受 app 写的 `stepId:"verification"`（无 `targetRoleId`）。请实施方在变更包/测试中写明精确谓词并给正/负例；不得把 `acceptance-criteria` 计入。若选择与方案不同的谓词，属实质变更，重开闸门 1。
5. **T3 全量命令口径。** 方案 §8.4 写 `node --test "test/**/*.test.ts"`，团队计划与任务要求串行 `--test-concurrency=1`。本标准按串行全量判定；请统筹在变更包记录实际命令、排除方式与基线。串行是更严格/更稳定的取证方式，不改变方案实质。
6. **目标现场漂移与 Q13 A。** 方案 A/B 快照（480/483 条账本、38/40 步）已被现场后续操作推进到写标准时的 530 条/40 步/`0805213a…`；判定时必须重新只读复制并记录。升级后允许一次重派；若客户要避免与账本外 report-v2 重复，需在升级前由统筹/目标项目 Convener 登记 report-v2（既有 `dispatch.accepted` app→verifier）或由客户明确接受一次重复。本产品不写目标项目；请统筹在变更包/报告中记录选择，不要把「登记」当产品行为。
7. **report-v2 登记的责任与时机。** Q13 A 的「升级前登记」是目标项目侧/客户决定，不是 ans-studio 产品写入；若未登记，按「允许一次重派」判定，不视为 fail。请统筹/沟通明确由谁在何时登记，避免验收时把目标现场状态误算为本变更缺陷。
8. **`test/桌面应用/` 逐文件授权与目录 v3 候选。** S1 预检须确认 `acceptance-dispatch.test.ts` 的 boundary 条目仍在；若目录 v3 候选被回退/未落地，停止派发，交人事/闸门 2 补条目。本标准不允许在 `test/桌面应用/` 新建文件。
9. **Node/npm 环境。** 当前验收 shell 无 Node/npm；取证环境需导入 PATH 并记录实际版本/路径。若命令不可执行，按 `insufficient evidence`，不能写成通过。
10. **`typecheck:renderer`/`build:renderer` 的取证。** 方案 §8.4 明确要求；即使本变更不改渲染层，也应按 T3 执行。若环境无法运行，按 `insufficient evidence`，不能 N/A。
11. **i18n key 与措辞断言。** 系统行使用 zh-CN/en-US 两份 key；judge 来源不得出现「客户拒绝」，客户来源必须出现「客户拒绝」。请项目管理在 S5a 冻结 key 契约，测试同时断言 zh/en，避免只测中文或只测 key 存在。
12. **新增 e2e 文件命名。** 团队计划 §3.6 建议 `s-acceptance-rework-routing.test.ts`（`n-` 已被 `n-invalid-governance-card.test.ts` 占用）或并入 `f-acceptance-gate.test.ts`；请统筹在变更包记录实际文件与归属，标准只要求目录/授权正确。
13. **方案 §6.1/§7.1 的 `app/main.ts` 角色标签。** 已由团队计划/闸门 2 校正为桌面窗口；请变更包记录该校正，避免 G2 写集核对把 `app/main.ts` 误判为装配越界。
14. **报告/验收的独立性与发布。** v1.7.0 发布前需本变更独立 T3 验收；本变更结论不得被 i18n/目录 v3/写卡门禁引用，也不得引用它们。请统筹在发布记录中分开登记。

---

## 九、不得据此扩张的事项

- 本文件不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本文件不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录、调度记录、flow、账本或目标项目。
- 本文件不授权提交、推送、合并、发布或任何对外操作。
- 本文件不是客户确认记录，也不是验收结论；客户确认仍以 `docs/communication/` 的记录为准。
- 实施者不得把「标准已写」「团队计划已确认」「工具成功」「测试通过」「方案已确认」当成验收通过或客户确认。
- 本文件不改变闸门 0/1/2 的确认对象和版本；意图变更重开闸门 0，方案实质变更重开闸门 1，角色/写集/顺序实质变更重开闸门 2。
- 本文件不改变 T3 档位；任何试图把治理变更降为 T0/T1/T2、或用 N/A 跳过 T3 全量/真实 Electron/目标复算的做法，按 `fail` 处理。
- 本文件不预判通过/返工/证据不足；判定只能由实施后的 `docs/acceptance/acceptance-rework-routing-report-v1.md` 按本标准作出。
