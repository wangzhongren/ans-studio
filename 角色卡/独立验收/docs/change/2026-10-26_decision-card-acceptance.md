---
id: decision-card-acceptance
type: change
title: decision 卡（材料性选择）批次独立验收（含 F1/F2 复验）——客户标准 1–7、设计 §一/§二/§五 与工程法案第 13 条逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: missing-evidence
related: [decision-card, material-choice, request-choice-decision-card, project-rules-13, request-gate-review]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 首轮独立验收：对未提交工作树（worktree lead-governance-coordination，分支 feat/scaffold-first-governance，HEAD 5bd9fe4；decision 批次叠加在尚未验收的 request_gate_review 批次之上）按客户标准 1–7、设计 §一/§二/§五 与工程法案第 13 条独立判定；桌面产品主路径的确定性实现通过，但发现两项必须修——F1 桌面拒绝的非法 decision 卡仍写 customer.decision{unclassified,none} 并永久挡最终验收；F2 编排/CLI 通道未执行 decision 卡结构校验。首轮判定 needs-work。
  - date: "2026-10-26"
    kind: re-verified
    summary: F1/F2 修复后复验：F1 在 recordCustomerDecision 对 declined+notPresented 早退、不写账本，新增 openRoleSession+桌面通道非法卡零账本与 evaluateFlowCompletion ready 回归；F2 新增共享纯函数 common/编排/decision-card.ts::validateDecisionCardRequest，经 run-role Pipeline 公共出口导出，governedInput 触达 raw 前执行，桌面 evaluateDecisionCardRequest 改为薄包装复用同一函数；独立探针复跑 F1a/F1b/F2a/F2b/F2c 均 rawCalls=0/ledger 空，F1 模拟 raw 拒绝亦零账本且 flowCompletion ready；编排 decision 18/18、编排全目录 1003/1001（唯一红既有 EPERM）/1 skip、桌面 671/671、门禁 335/334/0/1、i18n 203/198/0/5、typecheck 根/renderer 0。F1/F2 关闭；最终判定 missing-evidence（仅缺真实 Electron/卡面手选 e2e、真实模型、重启真机、客户手选回执接线）。
---

# decision 卡（材料性选择）批次独立验收（含 F1/F2 复验）

**复验结论（2026-10-26，F1/F2 修复后）：missing-evidence。** F1、F2 均已关闭（见 §十）：F1 对 `declined + notPresented` 早退不写账本，非法 decision 卡不再产生 `unclassified/none`，`evaluateFlowCompletion` 不再被挡；F2 新增共享纯函数 `src/common/编排/decision-card.ts::validateDecisionCardRequest`，经 `run-role.ts` Pipeline 公共出口导出，编排 `governedInput` 在触达 raw 客户通道前执行，桌面 `evaluateDecisionCardRequest` 改为薄包装复用同一函数。独立探针复跑 F1a/F1b/F2a/F2b/F2c 均 `rawCalls=0`、账本空；F1 模拟 raw 拒绝的合法卡亦零账本且 `flowCompletion ready:true`。客户标准 1–7 的确定性实现面复验通过；仅缺真实 Electron/卡面手选 e2e、真实模型行为、重启后真机与客户手选回执接线（§六）。

**首轮结论（历史，已被上段复验取代）：needs-work。**

- **F1（高，已修复，见 §十）**：桌面拒绝的非法 decision 卡（缺推荐/多推荐等）虽然正确地**未呈现**，编排 `recordCustomerDecision` 仍写入 `customer.decision{decisionKind:"unclassified", customerDecision:"none"}`；`evaluateFlowCompletion` 的 `hasUnresolvedDecision` 扫描全账本，该条目会**永久阻止该 flow 收尾/最终验收**。违反标准 2「不写账本」与标准 4「不触发 gate/最终验收、最终验收链路不变」。
- **F2（中，已修复，见 §十）**：decision 卡结构校验只做在桌面客户通道；编排包装/CLI 终端通道（`createCliCustomerInput` 同形）对显式 `cardKind="decision"` 的卡不校验推荐项/选项数/flowId，会向 CLI 客户呈现非法卡，并在有合法 flowId 时写 `material-choice` 审计。违反标准 2「缺推荐/多推荐/非法…一律 fail-closed，不向客户发卡、不写账本」。

此外，**缺少真实 Electron/卡面手选 e2e、真实模型行为与重启后真机证据**（§六）。若客户书面把标准 2 收窄为“仅桌面客户通道”并要求先修 F1，则 F2 转为记录项，其余仅剩 missing-evidence。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写自身 `docs/change/`、`feature-map.md`、`memo.md`；未改产品源码、测试源码、共享 i18n、其他角色文档或断言；未 commit / push。探针脚本只读产品代码、只在临时目录建夹具。

## 一、标准与依据

本批为实施完成后的独立验收；交接中给出客户标准 1–7。设计/规则依据：

- `角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md`（`rules-only`, revision 1；SHA-256 `f196f7d4edaed2b8…`）：§一客户规则、§二 9 个用户可见文案契约、§三实现现状与未接线、§五验证计划。
- `角色卡/项目管理/docs/project-rules.md` §二第 13 条「决策卡-01」（SHA-256 `c01df7f846fd4b2a…`）：主体与通道、推荐项唯一、默认代批、与验收分离、结构 fail-closed、范围说明。
- `角色卡/项目管理/docs/change/2026-10-26_change_decision-card.md`、各属主 change 记录（运行时核心 / 编排 / 桌面窗口 / 桌面UI / 门禁引擎）。

标准固定如下（事后标准；仓库中未见本批实施前由本角色固定的设计文档；沿用 `2026-10-26_request-gate-review-acceptance.md` 的事后固定方式）：

| 编号 | 客户标准 | 主要判据 |
| --- | --- | --- |
| C1 | 主理发现材料性选择不得聊天自定；交统筹发 `request_choice(cardKind="decision")`；内部实现细节仍可自决、不弹卡 | Lead/Steward 卡文本；Lead 不能发 decision；材料性选择/内部细节的边界 |
| C2 | 仅统筹可发；至少 2 个可区分选项、恰一个 `recommended: true`、合法 flowId；缺推荐/多推荐/非法/缺 cardKind 一律 fail-closed：不发卡、不写账本、不冒充客户拒绝 | 桌面 `evaluateDecisionCardRequest`；编排白名单与 missing-card-kind 守卫；工具层 `recommended` 透传/类型校验；账本副作用 |
| C3 | 「替我决策」开启默认选唯一推荐项：不调模型、judge 代批（非客户本人）、卡不呈现；关闭/异常回落客户手选、不擅自代选 | `tryAutoSelectDecision` 条件与结算；`planJudge` 不调模型；开关关闭/结果行缺失/抛错/运行时缺失回落测试 |
| C4 | 选择按 `decisionKind:"material-choice"` / `selectedOptions` 单独审计；不构成验收/提案/任命决定；不触发 gate/最终验收；不进入分诊/验收卡；最终验收链路不变 | 账本分类；门禁集合；`latestAcceptanceDecision`；flow 证据枚举；验收分诊前闸；`request_acceptance` 零回归 |
| C5 | 缺 cardKind 但带 recommended 的 convener 卡不得默认成 appointment；无 recommended 的既有 appointment 默认零回归 | 编排默认前守卫；桌面 missing-card-kind 拒发；零回归测试 |
| C6 | 渲染层 decision 卡标题、非客户批准徽标、推荐项徽标；`recommended` IPC 不丢；其它卡种零变化 | `decision-card.ts` / `ChatRow.tsx` / CSS；presenter 原样请求；卡种零回归测试 |
| C7 | 不弱化断言、不新增第二套门禁/状态；`request_gate_review` / `request_acceptance` 零回归 | 测试 diff 审查；定向回归；账本/门禁/状态结构 |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD | `5bd9fe48194c48de8898e1c85aad2c8c386a3aea`（验收期间未变；未新增提交） |
| 候选状态 | **未提交工作树**：56 个 tracked 修改（`git diff --shortstat` = +6243/−320）+ 未跟踪批次文件；decision 批次**叠加在尚未验收的 request_gate_review 批次之上**；`.claude/`、`demos/` 未跟踪，不属本批 |
| 整树 diff 摘要 | `git diff \| sha256sum` = `746138d1c8e9164a062485e30dd3dfd7f4c41bced45fd0afa7bdae23fae18a7f`（含 gate 复核批次，非 decision 纯补丁） |
| decision 批次清单摘要 | 32 个 decision 相关文件按路径排序的 `sha256` 清单（[`manifest-decision-batch.txt`](2026-10-26_decision-card-acceptance-evidence/manifest-decision-batch.txt)）再 `sha256` = `27eda9d93f5074502a41f8a914b815bfb13ca4e262b3e00ae75a4f25c5497aa9` |
| 关键文件哈希（前 16 位） | `runtime.ts 182d3b5d2dbf1d11`、`schema.ts 8ff111bdb58159e4`、`tools.ts f661ce1d050827f8`、`run-role.ts 96b225891064f4fa`、`governance-ledger.ts e8fe3e69aaa0f6b2`、`judge-verdict 1b530fef43346b1c`、`judge-facts a0c2cf0c0b1ae2bd`、`judge-evidence 1ffe32bff9fd95ad`、`judge-prompt 14059a4021622fdd`、`customer-input.ts c05db2f74d142ca6`、`decision-card.ts 362740700208c52b`、`ChatRow.tsx 740f40ac27906a13`、`phase4b.css a95ea0917dfb7f77`、`governance-roles.ts 140d1fa91c2a7b8d`、`zh-CN 6426538da15ac2ac`、`en-US 18d545fe9bb1f4e2` |
| 新增测试哈希（前 16 位） | `request-choice-decision-card.test.ts 03a8b801e3f00ccc`、`编排/decision-card.test.ts 00e9ee715a8a93e9`、`门禁引擎/decision-card.test.ts 1c56cab77da3cb87`、`桌面UI/decision-card-view.test.ts 4ce64a57da79c213`；`operator-wiring.test.ts fc767643c11d50df` |
| 平台 / Node / npm | Windows 11 Pro 10.0.26300 / Node v24.22.1 / npm 11.19.1 |

说明：`governance-roles.ts` 与 `test/门禁引擎/decision-card.test.ts` 的 SHA-256 与门禁引擎 change 记录 `140d1fa9…` / `1c56cab7…` 一致，候选可追溯。`request_gate_review` 批次仍维持其独立验收的 **missing-evidence**（A5/A7 真实 e2e 未跑）；本报告只核对它对 decision 批次无回归，不把它重判为已验收。

## 三、客户标准 1–7 逐条结论

### C1 主理材料性选择交统筹、内部细节可自决 —— **pass（确定性面；真实模型未验证）**

- `governance-roles.ts` 的 `LIAISON_CARD_TEXT` 新增「材料性选择交统筹发 decision 卡（必须）」：发现真实启动演示方式、验收证据方式、范围、标准/契约偏离、成本、客户可见行为等材料性选择时不得聊天自定、不得按某一方案推进、不得说成客户已同意；给 Steward 派协调任务（带 flowId、问题、候选方案、影响与建议）；**Lead 仍只发 intent-confirm，decision 卡由统筹发**；内部实现细节（契约措辞、实现细节、排期）仍可自决、不弹卡。既有「系统消息只汇报、不派任务」逐字保留。
- `CONVENER_CARD_TEXT` 新增「Decision 卡（材料性选择，必须）」：收到 Lead 协调任务或自己在规划/readiness/派发/证据检查中发现材料性选择时必须发卡；不得自决、不得把推荐/现状说成客户已同意、不得以「主理已转达」跳过客户确认；内部实现细节不发卡、不包装成客户决定。
- 机械面：`TRIO_CARD_KINDS.liaison` 仍只有 `intent-confirm`；Lead/其余内置治理角色发 decision 卡被编排白名单在触达客户前拒绝（`test/编排/decision-card.test.ts` ②）；项目角色不注入客户通道（A-5）。桌面 `evaluateDecisionCardRequest` 对非 convener 一律拒发（`test/桌面应用/operator-wiring.test.ts` 校验矩阵）。
- 证据：`governance-roles.ts` 文本；`test/门禁引擎/decision-card.test.ts` 4 条文本断言（5/5 通过）；`test/门禁引擎/liaison-role.test.ts`、`governance-trio.test.ts` 既有文本断言保留。
- **残余**：真实模型是否按卡文本把材料性选择交统筹、是否把内部细节包装成 decision 卡，未测（§六 E2）。卡文本是行为约束，不是实现证据。

### C2 仅统筹/结构 fail-closed —— **首轮 needs-work（F1、F2）；复验 pass（已关闭，见 §十）**

**已核对通过的部分（桌面产品路径）**：

- 桌面 `evaluateDecisionCardRequest`（`app/desktop/customer-input.ts:309`）在 presenter/判断/排队之前校验：仅 `convener`；必须 choice；`flowId` 合法（`GOVERNANCE_SLUG_PATTERN`，`request.flowId ?? metadata.flowId`）；选项 ≥2、id 非空且不重复；`recommended:true` 恰一个；内置治理角色「有 recommended 但缺 cardKind」拒发。拒绝返回 `declined + notPresented:true`、不带 `operatorId`（不冒充客户拒绝）。
- 工具层 `readOptions`（`tools.ts`）只透传布尔 `recommended`，非布尔在触达客户通道前拒绝；`CHOICE_CARD_KINDS` 含 decision；未知卡种拒绝；不校验推荐项个数（应用/角色侧负责）。
- 编排 `TRIO_CARD_KINDS.convener` 含 decision，其它角色不含；缺 cardKind + 任一 `recommended:true` 的内置治理卡在 choice 默认**之前** `declined + notPresented`（`run-role.ts:927-989`），CLI 通道同向。
- 测试：`test/桌面应用/operator-wiring.test.ts` 校验矩阵（角色/flowId/选项数/重复 id/缺推荐/多推荐/not-choice/缺 cardKind/显式其它卡种忽略；合法卡 recommended 原样呈现）；`test/runtime-core/request-choice-decision-card.test.ts` 5/5；本角色复跑 operator-wiring 72/72、runtime-core 5/5。
- **F1（首轮，已修复，见 §十）**：桌面拒绝的非法 decision 卡（缺推荐/多推荐/选项非法，且 flowId 合法）虽然 `presented:0`、`notPresented:true`，编排 `recordCustomerDecision`（`run-role.ts:2753`）仍写 `customer.decision{unclassified,none}`。独立探针（§五）输出：`F1a desktop reject zero-recommended → presented 0, ledgerEntries [{decisionKind:"unclassified", customerDecision:"none"}]`；`F1b two-recommended` 同。`evaluateFlowCompletion` 的 `hasUnresolvedDecision`（`flow-state.ts:1203,1305`）扫描全账本，未结算条目 ⇒ `ready:false`；账本 append-only，合法卡重发也不能清除 ⇒ **该 flow 永久无法收尾/最终验收**。违反标准 2「不写账本」与标准 4「不触发 gate/最终验收」。
- **F2（首轮，已修复，见 §十）**：结构校验只做在桌面通道。编排包装对显式 `cardKind="decision"` 的 choice 卡只查角色白名单，不查选项数/推荐项唯一性/flowId；单模型 `su` 与项目角色不走 `TRIO_CARD_KINDS`，也没有 role 拒绝。`createCliCustomerInput`（`ans govern` 默认客户通道）同形，会把非法卡摆到终端。独立探针：`F2a convener zero-recommended → rawCalls 1, outcome answered, ledgerEntries [{decisionKind:"material-choice", selectedOptions:["a"]}]`；`F2b convener missing flowId → rawCalls 1, answered`（不写账本但已发卡）；`F2c single su → rawCalls 1, answered`。违反标准 2「缺推荐/多推荐/非法…不向客户发卡、不写账本」与「仅统筹可发」。
- **修复要求**：在编排包装（`governedInput`，触达 `raw` 之前）或 CLI 客户通道增加与桌面等价的 decision 结构校验（角色、choice、flowId、≥2 选项、id 唯一、恰一推荐），拒绝用 `declined + notPresented:true`、不写账本、不带 `operatorId`；并与桌面共享同一校验实现或同源函数，避免两套判据。F1 修复：`recordCustomerDecision` 在 `out.outcome==="declined" && out.notPresented===true` 时直接返回（卡从未呈现 ⇒ 不是客户决定；与既有 judge/system 预授权跳过同口径），或在桌面拒绝路径返回编排可识别的系统来源。补回归：`openRoleSession` + 桌面通道 + 非法 decision 卡 ⇒ 账本 0 条且 `evaluateFlowCompletion` 不受影响。

### C3「替我决策」确定性默认推荐 —— **pass（确定性面；真实 Electron 未验证）**

- `tryAutoSelectDecision`（`customer-input.ts:1392`）在 `presentEntryNow` 最先调用；条件：发卡前校验定格推荐项、`governanceModel==="trio"`、`isGroupEnabled("decision")`、会话未中止、有运行时、推荐项仍在卡上选项、`emitJudgeResult` 已注入且投达成功。满足 ⇒ 直接 `answered{selected:[推荐项]}`、`operatorId:"judge:<engine>"`、`judge{group:"decision",cardKind:"decision",reasonCode:"recommended-default",selected}`；**不调模型、不呈现客户卡**。
- `planJudge` 对 `cardKind==="decision"` 显式返回 `undefined`（decision 卡永不交给模型 judge）；开关关闭/结果行缺失/投达抛错/运行时缺失 ⇒ 返回 false 走既有客户卡路径，客户手选、无 judge 审计。
- 结果行：`operator-wiring.test.ts` 断言 `judgeCalls.length===0`、`pushed.length===0`、`operatorId==="judge:claude"`、`judge.group/cardKind/selected`；开关关闭与三种异常回落均有测试；`judgeResultSummary` 断言「自动代理」「不是客户本人选择」「不是验收」「不是客户批准」「不构成验收/提案/任命决定」「不触发 gate/验收」。
- 本角色复跑 operator-wiring 72/72；`judgeResultSummary` 对 decision 的文案在 `interface.ts:9843` 的主入口进度行消费。
- **残余**：真实 Electron 下 `emitJudgeResult` IPC 投达、卡不呈现与结果行渲染未跑（§六 E1）；主入口进度行与来源角色结果行分别渲染，来源角色结果行走渲染侧 generic 分类（`judge.ts` `kindClass:"generic"`，标题/自动代理/「自动代批 ≠ 客户手批」在，但精确「代决策」短语只在进度行/`judgeSelectedRecommended`）。

### C4 与验收分离、material-choice 单独审计、最终验收链路不变 —— **首轮 needs-work（受 F1 影响）；复验 pass（见 §十）**

- `GovernanceDecisionKind` 增 `material-choice`；`selectedOptions` 仅该 kind 携带；`classifyCustomerDecision` 的 decision 分支要求恰好一个**卡上选项**，多选/空选/未知 ⇒ `unclassified/none`（fail-closed）；`targetRoleIds` 不写。
- 机械隔离：`PROPOSAL_DECISION_KINDS`/`ACCEPTED_DECISION_KINDS` 不含 material-choice；`latestAcceptanceDecision` 只认 `acceptance`；`CUSTOMER_DECISION_KIND_REFS` 不含 material-choice（不能充当 flow 证据）；`evaluateGovernanceGate` 的写流程/任命写入门拒绝 material-choice；`governance-gate.ts`/`flow-state.ts` 无 second gate。测试 `test/编排/decision-card.test.ts` 13/13 覆盖。
- 桌面：`settleEntry` 的 `notifyNextStep` 经 `deriveGovernanceNextStep` 对 decision 返回 null（default 分支）；`onNextStep` 零调用；验收分诊前闸只对 `cardKind==="acceptance"`（`customer-input.ts:1512`），decision 卡不进入；`operator-wiring.test.ts` 断言 `triageCalls===0`、`next.length===0`、`deriveGovernanceNextStep(...)==null`。
- 账本端到端：operator-wiring e2e 断言 `decisionKind:"material-choice"`、`selectedOptions:["option-a"]`、`targetRoleIds` 缺失、无 acceptance/proposal/appointment 决定、无 `gate.review`、`decisionEvidence.kind:"judge"`。
- **F1 影响（首轮；复验已关闭）**：桌面拒绝的非法 decision 卡写入 `unclassified/none`，`hasUnresolvedDecision` 会挡 `evaluateFlowCompletion`（最终验收/收尾门）。这是 decision 卡触发的 final-acceptance 链路副作用，违反「不触发 gate/最终验收 / 最终验收链路不变」。修复 F1 后本项剩余确定性面通过（§十：探针 `flowCompletion ready:true`）。
- `request_acceptance` 零回归：本角色复跑 `request-acceptance-tool.test.ts`、`interface.test.ts 137/137`、`acceptance-dispatch.test.ts 86/86`。

### C5 缺 cardKind + recommended 不默认 appointment；无 recommended 零回归 —— **pass**

- `run-role.ts` 在 choice 默认**之前**用 `hasRecommendedOption(req)` 识别；命中 ⇒ 跳过 `defaultGovernanceChoiceCardKind`，随后 `declined + notPresented:true`、`reasonCode:"missing-card-kind"`、不触达客户、不写账本（`run-role.ts:927-963`）。
- 桌面 `evaluateDecisionCardRequest` 对内置治理角色「有 recommended 但无 cardKind」拒发；项目角色普通 choice 忽略 recommended（零行为变化）。
- 测试 `test/编排/decision-card.test.ts` ③（convener 缺 cardKind + recommended ⇒ declined/notPresented、客户通道零调用、账本 0）与 ④（无 recommended 的 convener 任命形状仍默认 appointment、写 `targetRoleIds`、无 `selectedOptions`）均通过；桌面校验矩阵覆盖。
- 残余：若所有选项显式 `recommended:false` 且缺 cardKind，`hasRecommendedOption` 为 false，仍可能走 appointment 默认；这是非法 decision 卡的另一形状，建议在 F2 的统一校验中一并收紧（按字段存在性而非仅 `===true` 识别，或明确接受该边界）。

### C6 渲染层标识与 IPC 不丢 —— **pass（源码/单测面；真实 DOM/Electron 未验证）**

- `app/renderer/src/chat/decision-card.ts`：仅 `request.cardKind==="decision"` 产出固定标题 `ui.decisionCard.title`、`notApprovalBadge`、`recommendedBadge` 与原 `title/question`；`decisionOptionBadge` 只认严格 `recommended===true`；非 decision 返回冻结空视图。
- `ChatRow.tsx`：`op-badges` 增 `.op-decision-badge`（仅 decision）、标题优先 `decisionCard.title`、`op-question`/`op-note` 保留原问题、选项行 `.op-recommended-badge`；选项 input 的 type/name/value/checked/onChange 逐字未动；其它卡种分支 DOM 不变。CSS 只新增三个类，token 均存在（`index.css` 的 `--border-strong/--warning-*/--text-2/--radius-micro`）。
- IPC：桌面校验通过后 `payload.request = req` 原样，`presenter` 收到含 `recommended` 的选项（operator-wiring 断言 `deepEqual`）；`preload.cjs`/`chat-store` 原样透传；渲染侧无字段级裁剪。本角色复跑桌面UI `decision-card-view.test.ts` 9/9、operator-wiring 72/72。
- **残余**：没有真实 DOM/Electron 截图核验；`decisionCardView` 只读 `request.cardKind`，若卡种仅由 `metadata.cardKind` 承载（理论上编排包装的 fallback 形状）会按非 decision 渲染；真实路径由工具请求携带 `cardKind`，风险低但未测。

### C7 不弱化断言、不新增第二套门禁/状态、request_gate_review/request_acceptance 零回归 —— **pass**

- 测试 diff 审查：既有断言删除仅见契约枚举更新（`cardKind` enum 增 decision）、`cardKind → group` 断言改名并扩为八个卡种、Steward「只用 appointment」按新规则改为「只用 appointment / decision」（同等严格、逐字匹配，未删负向检查）、i18n 计数更新、`interface.test.ts` 系统消息文案按同日客户规则更新并新增 `doesNotMatch` 旧措辞。未发现 skip/only/弱化断言/删除安全负向断言。新增测试文件 0 skip/0 only。
- 无第二套门禁：decision 校验是发卡前结构守卫，不是治理门禁；`material-choice`/`selectedOptions` 只作审计，门禁/收尾/分诊读取点全部排除；无新 FlowStepKind/角色/账本 kind 之外的治理状态。
- 零回归：本角色复跑 `request-gate-review-tool.test.ts`、`test/编排/request-gate-review.test.ts`、`flow-gate.test.ts`、`request-acceptance-tool.test.ts` 24/24；`interface.test.ts` 137/137；`acceptance-dispatch.test.ts` 86/86；`governance-session/gate/judge/decision-evidence-packet` 169/169；门禁引擎全目录 335/334/0/1 skip。

## 四、独立验证（首轮复跑，绑定首轮候选；F1/F2 修复后的复验计数见 §十）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 根 typecheck | `npm run typecheck` | exit 0 |
| renderer typecheck | `npm run typecheck:renderer` | exit 0 |
| runtime-core decision 契约 | `node --test test/runtime-core/request-choice-decision-card.test.ts` | 5/5 pass |
| 编排 decision 分类/账本/judge | `node --test test/编排/decision-card.test.ts` | 13/13 pass |
| 桌面 decision 校验/默认推荐/e2e | `node --test test/桌面应用/operator-wiring.test.ts` | 72/72 pass |
| 桌面UI decision 卡面 | `node --test test/桌面UI/decision-card-view.test.ts` | 9/9 pass |
| 门禁 decision 卡文本 | `node --test test/门禁引擎/decision-card.test.ts` | 5/5 pass |
| i18n 契约 | `node --test test/项目管理/shared/i18n.test.ts` | 56/56 pass |
| 门禁引擎全目录 | `node --test "test/门禁引擎/**/*.test.ts"` | 335 计 / 334 过 / 0 失败 / 1 Windows skip |
| runtime-core 三个相关文件 | `governance-judge` + `governance-flow-metadata` + `request-gate-review-tool` | 38/38 pass |
| 编排四个回归文件 | `governance-session/gate/judge/decision-evidence-packet` | 169/169 pass |
| gate 复核/验收回归 | `request-gate-review` + `flow-gate` + `request-acceptance-tool` | 24/24 pass |
| 桌面 interface | `node --test test/桌面应用/interface.test.ts` | 137/137 pass |
| 桌面验收派发 | `node --test test/桌面应用/acceptance-dispatch.test.ts` | 86/86 pass |
| 4 个红的环境核对 | `shell-authorized-routine` / `file-write-safety` / `session-store` | 均为 Windows `EPERM: symlink`；三文件工作树零修改；与本批无关 |
| decision 路径探针 | `角色卡/独立验收/docs/change/2026-10-26_decision-card-acceptance-evidence/probe-decision-card-paths.mjs` | 见 §五；F1/F2 复现 |

**计数说明**：交接给出的 desktop 670/670、桌面UI 296/296、编排 998/996/1 fail/1 skip、runtime-core 334/327/3 fail/4 skip、门禁 335/334/0/1、i18n 203/198/0/5 与本角色抽查一致；4 个红全部为既有 Windows symlink EPERM（`file-write-safety` ×1、`session-store` ×2、`shell-authorized-routine` ×1），文件零 diff；skip 为既有平台守卫（runtime-core 4 条 + 共享 i18n 5 条为 D3 权限/umask/chmod/sync，门禁 1 条为不可读权限；编排另有 1 条平台 skip），不是本批新增。未发现 `test.skip/only` 或弱化断言。

## 五、首轮必须修的点（F1/F2 已于 2026-10-26 修复，复验见 §十；以下保留首轮取证记录）

### F1（高）桌面拒绝的非法 decision 卡仍写账本并永久挡最终验收

**复现**（本角色探针，仓库内可重跑）：

```text
F1a desktop reject zero-recommended (valid flowId)
  channel=desktop rawCalls=1 presented=0 outcome=declined notPresented=true
  ledgerEntries=[{kind:"customer.decision",decisionKind:"unclassified",customerDecision:"none"}]
F1b desktop reject two-recommended (valid flowId)
  同上
```

**根因**：`app/desktop/customer-input.ts:309` 的 `evaluateDecisionCardRequest`（在 `:1728` 于 presenter 前调用）返回 `declined + notPresented:true`；编排包装 `run-role.ts:1190` 无条件调用 `recordCustomerDecision`，后者只跳过 `judge:` 与 `system:` 来源（`run-role.ts:2753-2772` 区域），不检查 `notPresented`，于是把“卡片从未呈现”的拒绝记成 `unclassified/none`。

**影响**：`flow-state.ts:1203` 的 `hasUnresolvedDecision` 对 `unclassified`/`none` 返回 true，`evaluateFlowCompletion`（`flow-state.ts:1305`）因此 `ready:false`（「该流程仍有未结算的决定。」）。账本 append-only，后续合法 decision 卡也不能清除该条目 ⇒ 该 flow 永久无法收尾/最终验收。违反标准 2「不写账本」与标准 4「不触发 gate/最终验收、最终验收链路不变」。

**修复要求**：`recordCustomerDecision` 在 `out.outcome==="declined" && out.notPresented===true` 时直接返回（卡从未呈现 ⇒ 不是客户决定；与既有 judge/system 预授权跳过同口径）；或在桌面拒绝路径返回编排可识别的系统来源并沿用跳过。补回归：`openRoleSession` + 桌面客户通道 + 非法 decision 卡（缺推荐/多推荐，flowId 合法）⇒ 账本 0 条；`evaluateFlowCompletion` 仍 ready（或至少无该未结算条目）；工具回执仍为「卡未发出」而非客户拒绝。

### F2（中）编排/CLI 客户通道未执行 decision 卡结构校验

**复现**（本角色探针）：

```text
F2a orchestration→raw convener zero-recommended
  rawCalls=1 outcome=answered ledgerEntries=[{decisionKind:"material-choice",selectedOptions:["a"]}]
F2b orchestration→raw convener missing flowId
  rawCalls=1 outcome=answered ledgerEntries=[]
F2c single su decision card (raw)
  rawCalls=1 outcome=answered ledgerEntries=[]
```

**根因**：结构校验只在 `app/desktop/customer-input.ts::evaluateDecisionCardRequest`；编排 `run-role.ts` 的 choice 包装只校验 `TRIO_CARD_KINDS` 白名单（convener 允许 decision）与「缺 cardKind + recommended」守卫，不校验选项数、推荐项唯一性、flowId；单模型 `su`/项目角色不走 trio 白名单，也没有 role 拒绝。`ans govern` 默认的 `createCliCustomerInput`（`govern-session` 未注入时的通道）会把非法卡摆到终端；有合法 flowId 时还会以 `material-choice` 写账本。

**修复要求**：在编排 `governedInput` 触达 `raw` 之前（或 CLI 客户通道）执行与桌面等价的校验：仅 trio convener（单模型 su/项目角色拒绝）、必须 choice、合法 flowId、≥2 个选项、id 非空且不重复、`recommended:true` 恰一个；拒绝用 `declined + notPresented:true`、不写账本、不带 `operatorId`。与桌面共享同一校验实现/同源函数，避免两套判据；补编排/CLI 路径测试（缺推荐/多推荐/少选项/缺 flowId/非 convener）。

## 六、缺失证据（missing-evidence）

| 编号 | 缺失证据 | 说明 |
| --- | --- | --- |
| E1 | **真实 Electron/浏览器 e2e（decision 卡面与手选）** | 现有证据是真实产品通道 + 脚本化 presenter（`pushed` 数组）与源码接线守卫，不是真实 Electron/浏览器 DOM；无截图/录屏核验固定标题、「非客户批准」徽标、推荐项徽标、手选后回执与选项提交。`app/desktop/e2e/main.mjs` 无 decision 用例；应用按要求未重启，运行中实例是旧构建。 |
| E2 | **真实模型行为** | 无真实模型/真实会话证据证明：convener 按卡文本发 decision 卡、卡内恰一个 recommended、Lead 不聊天自定而交统筹、内部细节不弹卡。当前测试均为脚本化假适配器/文本断言。 |
| E3 | **重启后真机** | 桌面/桌面UI change 记录均声明应用未重启；decision 卡的 IPC、默认推荐结果行、卡面在真实 Electron 重启后的表现未验证。 |
| E4 | **客户手选推荐/非推荐项回执（设计 §五）** | `main.decisionCard.selectedRecommended` / `selectedOther` 仍未被产品代码引用（PM/桌面/UI change 记录已登记为待接线）；客户手选目前只有 `request_choice` 通用回执「客户已选择…」。若设计 §五「客户选择推荐项/非推荐项回执正确」是必验项，此为缺证据；客户标准 1–7 未逐字要求这两个 key。 |
| E5 | **gate 复核批次真实 e2e** | 叠加的 `request_gate_review` 批次仍缺其设计 A5/A7 的真实 Electron/真实流程 e2e（见 `2026-10-26_request-gate-review-acceptance.md`）；本批未关闭，也未重判。 |

## 七、记录项与残余风险（非阻断）

1. **`{option}` 使用选项 id 而非标签**：`judgeResultSummary` 的 `judgeSelectedRecommended` 传入 `payload.selected.join("、")`（选项 id），PM i18n 变更记录写「`{option}` 用选中项标签」；用户会看到「option-a」而非「方案 A」。语义正确、不构成标准失败，但口径不一致。
2. **`deriveGovernanceNextStep` 文档未列 decision**：实现经 default 返回 null（正确），但顶部注释的卡种清单没有 decision；建议补一行，避免后续维护者误以为遗漏。
3. **`multiple: true` 的 decision 卡**：桌面校验不拒绝 `multiple:true`；客户多选时编排记 `unclassified/none`（这是已呈现卡的既有 fail-closed 口径，会挡收口门；与 F1 的「未呈现仍写账本」不同）。材料性选择应为单选；建议在统一校验中拒绝 multiple。
4. **同 label 不同 id 的选项**：桌面只校验 id 唯一，不校验 label 可区分；「至少 2 个可区分选项」的语义仍依赖模型/卡文本。
5. **来源角色结果行分类**：渲染侧 `governanceJudgeResultView` 对 decision 走 `generic`（标题「judge 代批 · 决策组」+「自动代理」+「自动代批 ≠ 客户手批」），精确「代决策」短语在主入口进度行（`judgeResultSummary`）；语义满足「非客户本人」，字面不完全等同规则句。
6. **单模型 su/项目角色的卡种面**：桌面已拒；编排/CLI 在 F2 修复后也由共享校验拒绝（§十），已统一。
7. **`request_gate_review` 叠加批次**：decision 改动未触及 gate 复核路径，定向回归 24/24 + 169/169 通过；其既有 missing-evidence 仍未关闭。
8. **候选叠加**：整树 diff 含 gate 复核批次，decision 清单摘要只绑定 decision 相关文件；提交前应在同一冻结快照重跑本报告 §四的定向子集。
9. **F1 早退吞掉 system 预授权拒绝诊断（复验新发现，非阻断）**：`recordCustomerDecision` 的 `declined && notPresented===true` 早退位于 `system:` 预授权分支之前；写盘预授权拒绝（`operatorId="system:write-preauthorization"`、`notPresented:true`）不再记录既有的 `governance.preauthorization.declined` 诊断（账本/行为不变，桌面另有 `write-preauthorization.reject` 诊断）。建议把早退放在 system 分支之后或排除 `system:` 前缀；无测试依赖，不构成客户标准失败。
10. **共享谓词小重复**：主结构校验已单一来源（`common/编排/decision-card.ts`，桌面薄包装）；「缺 cardKind + 任一 recommended:true」守卫的 `hasRecommendedOption` 谓词仍在编排与桌面各一份（两层防御），非第二套结构校验。

## 八、最终判定

**复验最终判定（2026-10-26，F1/F2 修复后）：missing-evidence。**

- 客户标准 1–7 的确定性实现面复验通过：C1/C3/C5/C6/C7 pass；C2/C4 的首轮 F1/F2 已关闭（§十）——共享结构校验、仅 convener、确定性默认推荐、material-choice 审计、与 gate/验收分离、渲染标识、`request_gate_review`/`request_acceptance` 零回归均核对通过。
- 无 skip/only/弱化断言；编排全目录 1003/1001（唯一红既有 Windows symlink EPERM）/1 skip、桌面全目录 671/671、门禁 335/334/0/1、i18n 203/198/0/5、typecheck 根/renderer 0。
- 仅缺 §六 E1–E5：真实 Electron/卡面手选 e2e、真实模型行为、重启后真机、客户手选回执接线（设计 §五；客户标准 1–7 未逐字要求 selectedRecommended/selectedOther）、gate 复核批次 A5/A7 真实 e2e。按本角色标准，这些不能记为 pass，故最终为 missing-evidence，而非 pass。

**首轮判定（历史）：needs-work。** 首轮发现 F1（拒绝卡写未结算账本并永久挡最终验收）与 F2（编排/CLI 通道不 fail-closed），已由属主修复；复验记录见 §十。

## 九、证据索引

- 首轮探针与输出：[`2026-10-26_decision-card-acceptance-evidence/probe-decision-card-paths.mjs`](2026-10-26_decision-card-acceptance-evidence/probe-decision-card-paths.mjs)、[`probe-output.txt`](2026-10-26_decision-card-acceptance-evidence/probe-output.txt)、[`test-output.txt`](2026-10-26_decision-card-acceptance-evidence/test-output.txt)、[`manifest-decision-batch.txt`](2026-10-26_decision-card-acceptance-evidence/manifest-decision-batch.txt)（32 行 `sha256  path`；文件自身 `sha256` = `27eda9d9…`）。
- 复验探针与输出：[`probe-output-reaccept.txt`](2026-10-26_decision-card-acceptance-evidence/probe-output-reaccept.txt)（F1a/F1b/F2a/F2b/F2c 均 `rawCalls=0`、账本空；F1 合法卡模拟 raw 拒绝零账本且 `flowCompletion ready:true`）、[`probe-f1-skip.mjs`](2026-10-26_decision-card-acceptance-evidence/probe-f1-skip.mjs)、[`test-output-reaccept.txt`](2026-10-26_decision-card-acceptance-evidence/test-output-reaccept.txt)（复验定向/全目录计数与红/跳过分类）、[`manifest-decision-batch-reaccept.txt`](2026-10-26_decision-card-acceptance-evidence/manifest-decision-batch-reaccept.txt)（33 行，含新增 `src/common/编排/decision-card.ts`；文件自身 `sha256` = `3d4d67e0…`）。
- 既有测试（见 §四/§十）：`test/runtime-core/request-choice-decision-card.test.ts`、`test/编排/decision-card.test.ts`、`test/桌面应用/operator-wiring.test.ts`、`test/桌面UI/decision-card-view.test.ts`、`test/门禁引擎/decision-card.test.ts`、`test/项目管理/shared/i18n.test.ts`、`test/编排/request-gate-review.test.ts`、`test/编排/flow-gate.test.ts`、`test/runtime-core/request-acceptance-tool.test.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts`。
- 实现指针：`src/common/编排/decision-card.ts`（`validateDecisionCardRequest` 单一共享校验）、`src/pipeline/orchestration/run-role.ts`（共享校验 Pipeline 公共出口 + `governedInput` 前置校验 + `recordCustomerDecision` notPresented 跳过）、`app/desktop/customer-input.ts`（薄包装 `evaluateDecisionCardRequest` 复用共享校验；`tryAutoSelectDecision`）、`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/common/编排/governance-ledger.ts`（material-choice/selectedOptions）、`src/common/编排/governance-judge-{verdict,facts,evidence,prompt}.ts`、`app/renderer/src/chat/decision-card.ts`、`ChatRow.tsx`、`shell/phase4b.css`、`src/common/门禁引擎/governance-roles.ts`。
- 设计/规则/变更：`角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md`、`docs/project-rules.md` §二.13、各属主 `2026-10-26_change_decision-card*.md`。
- 首轮 decision 批次 32 文件清单摘要：`27eda9d93f5074502a41f8a914b815bfb13ca4e262b3e00ae75a4f25c5497aa9`；复验 33 文件清单摘要：`3d4d67e092d80fb80b35c0bb96e7302cca2395facf6f9c41387469ac741e2923`；整树 diff 摘要（含 gate 批次）`746138d1c8e9164a062485e30dd3dfd7f4c41bced45fd0afa7bdae23fae18a7f`（首轮时点；复验后产品文件已变更，见 §十）。

## 十、复验（F1/F2 修复后，2026-10-26）

### 10.1 候选与哈希（复验时点）

| 项 | 值 |
| --- | --- |
| HEAD / 分支 | `5bd9fe48194c48de8898e1c85aad2c8c386a3aea` / `feat/scaffold-first-governance`（未新增提交） |
| 复验清单摘要 | 33 个 decision 相关文件（首轮 32 + 新增 `src/common/编排/decision-card.ts`）按路径排序 `sha256` 清单再 `sha256` = `3d4d67e092d80fb80b35c0bb96e7302cca2395facf6f9c41387469ac741e2923`（[`manifest-decision-batch-reaccept.txt`](2026-10-26_decision-card-acceptance-evidence/manifest-decision-batch-reaccept.txt)） |
| 复验整树 diff 摘要 | `git diff \| sha256sum` = `8f803db9d699286321d348e5fa3bc84dabb9b530e799adbb54e515934cf3e171`（含 gate 批次与 F1/F2 修复） |
| 变更文件（相对首轮） | `src/common/编排/decision-card.ts` 新增 `13483a7a2dbabf1d…`；`src/pipeline/orchestration/run-role.ts` `9abffc24a3f1f71d…`；`app/desktop/customer-input.ts` `4ed62c2e4a77db8e…`；`test/编排/decision-card.test.ts` `9f7c98bd49b343ed…`；`test/桌面应用/operator-wiring.test.ts` `b48ae6a9686cfb01…` |
| 其余关键文件 | `src/model/runtime.ts 182d3b5d2dbf1d11…`、`src/provider/runtime/{schema,tools}.ts`、`src/common/编排/governance-ledger.ts e8fe3e69…`、`judge-*`、`app/renderer/src/chat/decision-card.ts 362740700208c52b…`、`ChatRow.tsx 740f40ac…`、`phase4b.css a95ea091…`、`governance-roles.ts 140d1fa9…`、i18n 与渲染均与首轮一致（未改动） |

### 10.2 F1 —— **关闭**

- 代码：`run-role.ts::recordCustomerDecision` 在 `declined && notPresented===true` 时直接返回（位于 `cardKind`/judge/system 分支之前），卡片从未呈现 ⇒ 不写 `customer.decision`。
- 复验探针（`probe-output-reaccept.txt`）：`F1a/F1b`（桌面通道夹具的缺/多推荐卡）现在在**编排层**即被共享校验拒绝（`rawCalls=0`、`presented=0`、`ledgerEntries=[]`）；`probe-f1-skip.mjs`（**合法**卡 + raw 模拟 `declined+notPresented`）`rawCalls=1`、`ledgerEntries=[]`、`evaluateFlowCompletion={ready:true}`，直接验证 F1 早退。首轮「写 unclassified/none 并永久挡收尾门」已不再复现。
- 测试：`test/编排/decision-card.test.ts` 新增 F1 用例（raw 返回 `declined+notPresented` ⇒ 零账本、`evaluateFlowCompletion` ready；缺/多推荐卡 ⇒ 零账本、不挡收尾门），本角色复跑 18/18 通过。
- **新发现（非阻断）**：早退位于 `system:` 预授权分支之前，写盘预授权拒绝（`operatorId="system:write-preauthorization"`、`notPresented:true`）不再记 `governance.preauthorization.declined` 诊断（账本/行为不变，桌面另有 `write-preauthorization.reject`）；建议把早退放到 system 分支之后或排除 `system:`。见 §七.9。

### 10.3 F2 —— **关闭**

- 单一来源：新增 `src/common/编排/decision-card.ts::validateDecisionCardRequest`（纯函数：角色/卡形/flowId/选项数/id 非空唯一/恰一 recommended）；`run-role.ts` 经 Pipeline 公共出口再导出；编排 `governedInput` 在触达 raw 前调用；桌面 `evaluateDecisionCardRequest` 改为薄包装，委托同一函数（仅保留 missing-card-kind 桌面防线、文案映射与 notPresented/operator 映射）。本角色核对：桌面不再复制角色/flowId/选项/推荐项结构校验；`hasRecommendedOption` 谓词在编排与桌面各一份（两层 missing-card-kind 防线），非第二套结构校验。
- 复验探针：`F2a`（convener 缺推荐）、`F2b`（convener 缺 flowId）、`F2c`（single su）均 `rawCalls=0`、`presented=0`、`outcome=declined/notPresented`、`ledgerEntries=[]`；首轮「CLI 收到非法卡/写 material-choice」不再复现。
- 测试：`validateDecisionCardRequest` 矩阵（非 convener/single su/项目角色/confirm/缺或非法 flowId/选项<2/空 id/重复 id/0 或 2 推荐）与编排 `governedInput` 定向用例（缺/多推荐、缺 flowId、single su/项目角色）均通过；桌面测试断言拒绝原因码与共享 `detail` 逐项一致。本角色复跑 18/18、operator-wiring 73/73。
- 桌面 `evaluateDecisionCardRequest` 对非 decision 卡仍 `ignore`（旧卡零行为变化）；`governanceModel` 缺省按 `"single"` fail-closed（真实桌面 ctx 传 trio）。

### 10.4 回归与断言强度 —— **未发现新回归（除 §七.9 诊断）**

- typecheck 根/renderer exit 0；编排全目录 1003/1001（唯一红 `shell-authorized-routine` 既有 Windows symlink EPERM）/1 skip；runtime-core 全目录 334/327/3 fail/4 skip（3 红均为既有 Windows symlink EPERM：`file-write-safety` ×1、`session-store` ×2）；桌面全目录 671/671（已含 `interface.test.ts` 137/137 与 `acceptance-dispatch.test.ts` 86/86）；门禁 335/334/0/1 skip；i18n 203/198/0/5 skip；runtime-core decision/gate-review/acceptance 定向 24/24。
- 更新测试无 `skip/only`；`operator-wiring.test.ts` 无删除断言；`test/编排/decision-card.test.ts` 新增 5 例（18−13），未发现既有 13 例被删改；F1/F2 探针与测试均绑定复验清单。
- 编排 gate 复核/flow-gate 首轮 24/24；复验未改这些路径，且编排全目录 1003/1001 覆盖 gate 复核用例（含既有 EPERM 唯一红）。

### 10.5 复验判定

**missing-evidence。** F1、F2 关闭；标准 1–7 的确定性面通过。仍缺 §六 E1–E5（真实 Electron/卡面手选 e2e、真实模型、重启真机、客户手选回执接线、gate 批次 A5/A7 真实 e2e）。若客户书面接受「源码/单测/脚本化产品通道」作为卡面与手选证据、且不要求 selectedRecommended/selectedOther，则本批可判 pass；本角色不自行降低真实环境证据要求。

**权限**：本结论不授予提交、推送、合并、部署或发布；返工由属主实施后按同一标准复验。
