# 代理审批/代决策的效力等同客户本人（judge 委派生效与诚实审计）：方案（P1.2）

- 版本：**P1.2 草案，2026-11-09**；ANS 策划（Planning）独立上下文。本版按独立复核 R1.0（F1–F13）与 P1.1 窄复核（G1/S1–S3）逐项修订（处置见 §13）；历史版本：P1.0（550 行 / 59,176 bytes / SHA-256 `60c68dad3b1da1317421a046680a93345be301769c04d703a269b221a61cbc8a`）、P1.1（674 行 / 84,483 bytes / SHA-256 `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`）。
- 状态：**P1.2 修订后待复核确认；未实施、未测试、未验收、未提交/推送/合并、未运行真实模型。** 本文件为唯一写盘产物。
- 风险档位：**T3（建议）**。理由：改动跨层共享冻结证据契约（`DocFreezeRecord`/`doc-freeze/v1`）、客户决策效力语义（judge 代批可产生冻结/生效）与 D3 派生授权证据；虽客户已裁定方向，仍不得按 T0/T1 处理。
- 依据（本检出，只读复核）：
  - 意图记录：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`（35 行，`d084b5ffeb522a68f6ece21fd2eb486a1a075afa360e0fae46ce84f72d6b6f6f`；客户原话「替我审批应该等同于我自己审批啊」，随后「开始做」）。
  - 独立复核记录：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（287 行 / 38,867 bytes / SHA-256 `6e98749bd227c6f723e70ace5200d6eaea3c5cebb777ac2ee28f06fe6a3a9b19`；13 问题 F1/F2 must-fix、F3/F4/F5 general、F6–F13 suggestion；结论「修订后提交」；本版逐项处置见 §13）。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（`e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`；闸门 1/2 免逐次确认，实质变化须停下回报）。
  - C-05 既有语义（意图记录引用的 `docs/acceptance/entry-role-minimal-criteria-v1.md` **在本检出不存在**；[事实] 可核到的同源条目为 `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`，`5c8b9e860526c480f54bef701167044068994b72dff7d657c5c94ac4a0d4f348`：「两开关独立；decision 唯一推荐代选；approval rubric 保持；manual/deny/不可用退回发起角色；judge 审计不伪装客户；Q5 高风险本人」）。**勘误动作（F10）**：实施前由沟通更正意图记录 §关联 的引用路径（或在实施/验收包中引用该可核路径）；本方案语义以该可核条目为准，不改变语义。
  - AC-31/F35 冻结归属契约：`docs/acceptance/trunk-amendment-model-criteria-v1.md:205`（`3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`）；本方案对其做**显式契约修订**（§6.1），不静默放宽。
- 代码基线：git worktree `.claude/worktrees/trunk-amendment`，HEAD `c1439ce`（PR #76 合并记录后）。任务给出的基线为 `65813c9`；[事实] `git diff --stat 65813c9..HEAD -- src app test` 为空（两提交仅 docs/governance），故本文行号按 `c1439ce` 只读核对，与 `65813c9` 的 `src/app/test` 内容一致。实施以符号名与文本锚点为准。
- 标记约定：**[事实]** 已只读核实的代码/文档行为；**[推断]** 基于代码但未经真实运行证实；**[待确认]** 需复核或客户确认；**[设计候选]** 本方案提议、未实施。

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
|---|---|---|---|
| P1.0 | 2026-11-09 | 初稿：根因/48 条清点、`judge-delegated` 来源设计、写集/测试矩阵/AC/风险 | 草案；待独立复核（550 行 / 59,176 bytes / `60c68dad…cbc8a`） |
| P1.1 | 2026-11-09 | 按复核 R1.0 修订：F1 §10 在飞变更/三变更冲突与串行次序/对方误述勘误；F2 §6.5 基线已知红项 + 增量不回归口径（AC-J3）；F3 I-25 防御定位 + J16/J17；F4 `applicationId` 双约定勘误；F5 AC-J12 9223 隔离/独立根/预算/停止；F6 `buildDocFreezeRecord` 两处豁免；F7 engine 与账本审计信任边界；F8 §2.1 其余命中附录；F9 judge 不结算 appointment/proposal/acceptance 升 [事实]；F10 C-05 勘误动作；F11 共享 `isJudgeD3Resolution`；F12 J16/J17 与 `trunk-events.test.ts` 回归；F13 摘要字段长度上界；Q9/Q10 追加 | 窄复核：建议提交（must-fix 0；G1/S1–S3 建议）；674 行 / 84,483 bytes / `72d36242…b791` |
| P1.2 | 2026-11-09 | 窄复核修订：G1 钉死单一策略（冻结侧不截断、按账本原值逐字段复制；超界仅可在账本生产端归一化，属独立变更）并同步 J2/J4/J5；S1 `isJudgeD3Resolution`/冻结分支对 `judge:null`/非对象/缺字段 fail-closed（不抛错）；S2 与 G1 合并为单一策略；S3 §10.1 记录提案卡修复路由 `src/common/编排/` 目录级余量（写集不变） | 草案；待复核确认 |

---

## 0. 摘要

### 0.1 问题

贪吃蛇真实运行中，幕僚发出的「意图确认」卡（`intent-confirm`）在客户开启「替我决策」后由判断 agent（`judge:claude`）按唯一推荐项代选 `confirm`（审计 `reasonCode:"sufficient"`），**该代批在交互层已成功**（`request.resolved.by:"judge"`、`operatorId:"judge:claude"`、`judge` 审计随行），但应用下游 `finalizeIntentConfirmation` 以 `outcome.judge` 与 `resolved.by !== "customer"` 为由拒绝生成 `intent-confirmed` 冻结证据（`pending-recovery` / `trunk-item-invalid`），幕僚据此要求客户关闭开关并本人点卡。客户裁定：**开关开启即明确委托，judge 代批必须生效**；同时**审计必须如实记 judge 来源，不得伪造成 customer/decisionId**。

### 0.2 根因（[事实]，file:line 见 §1）

1. 交互层已如实产出 judge 结果：`app/desktop/customer-input.ts:1598-1635`（`judge` 审计 + `operatorId:"judge:<engine>"`）、`app/desktop/session.ts:5776-5829`（`request.resolved.by:"judge"`，含 `decisionId:"decision-<requestId>"`、`judge` 审计）。
2. 冻结生产者直接拒绝 judge：`src/service/trunk/impl/apply-journal.ts:3337-3338`（`outcome.judge` 即 fail）、`:3362`（非委托分支要求 `resolved.by==="customer"` 且 `!resolved.judge`）。
3. 冻结数据模型没有 judge 来源：`src/model/version-change.ts:216`（`DocFreezeOrigin` 仅 4 值）、`:282-291`（origin 仅 customer/application，source 仅 customer-decision）；`src/service/version-change/impl/freeze-service.ts:85-131`（customer 类 reason 必须有 `decisionId` 且 `decidedBy:"customer"`）。
4. 冻结读取/复核路径同样只认 customer/chief-delegated：`apply-journal.ts:1678/1687/1695-1699`（`verifyReviewIntent`）、`:694-696`/`:1304-1306`（二次冻结来源筛选）、`src/provider/version-change/impl/guard-freeze-registry.ts:405-423`（`confirmsMigratedIntent`）。
5. 同源的 D3 派生生效路径只认 customer/chief-delegated：`apply-journal.ts:3186`、`:3431`、`:3536-3538`、`src/pipeline/orchestration/trunk-runtime.ts:727-732`、`src/common/门禁引擎/classify-shell.ts:520`。

### 0.3 推荐设计（一句话）

新增**诚实委托来源** `origin/source kind = "judge-delegated"`：冻结记录如实携带 `requestId`、`engine/model`、`operatorId:"judge:<engine>"`、`reasonCode/reason/selected` 与 `at`，`applicationId` 用 `intent-<requestId>`/`proposal-<requestId>`；**不写 `decidedBy:"customer"`、不写 `decisionId`、不伪造任何客户字段**。customer 与 chief-delegated 既有路径逐字不变；judge 的 manual/deny/无唯一推荐/不可用回落与开关关闭回落、Q5 客户主权卡均不变。

### 0.4 本方案不做

不实施、不跑真实模型、不改任何产品/测试/角色卡/边界/其它 docs；不放宽客户主权/高风险/写权语义；不伪造身份；不新增 judge 能力（仅让既有 judge 代批在下游生效并如实留痕）。

---

## 1. 问题与现状

### 1.1 真实运行证据（[事实]，来自意图记录与协调方核实）

- 场景：贪吃蛇真实开发（仓库外 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09`，本轮观测，进行中）。
- 卡片：幕僚 `request_choice(cardKind:"intent-confirm")`；客户已开启「替我决策」。
- judge 结果：`by:"judge"`（落账事实）、`reasonCode:"sufficient"`、逐项核对意图文档摘要后选择 `confirm`；交互回执如实写明「判断 agent 代批」。
- 下游失败：`finalizeIntentConfirmation` 返回 `trunk-item-invalid`（无真实保留卡确认可冻结），`run-role` 将 `intentConfirmation` 标为 `pending-recovery`（`src/pipeline/orchestration/run-role.ts:1634-1639`）。
- 客户本人点卡后（`by:"customer"`、`operatorId:"51054"`、真实 `decisionId`）同一路径通过，证明失败原因仅是来源判定，不是字节/快照/标记链。

### 1.2 judge 事实字段（[事实]，模型位置）

`CustomerInputOutcome.answered`（`src/model/runtime.ts:1070-1100`）：
- `judge?: GovernanceJudgeAudit`（仅 approve 结算出现；客户手批不带）；
- `operatorId?: string`（judge 代批为 `judge:<engine>`）；
- `decisionId?: string`（应用生成 `decision-<requestId>`，写入 `request.resolved` 后回填；模型不可自报，见 `:1084-1089`）。

`GovernanceJudgeAudit`（`src/model/runtime.ts:3006-3022`）：`group`、`cardKind`、`engine`（`RuntimeKind`）、`model?`、`reasonCode`、`reason?`、`evidence?`、`selected?`、`confirmed?`、`paths?`、`pathDecisions?`、`durationMs/readCalls/readBytes?`。

`request.resolved`（`src/model/runtime.ts:1484-1525`）：`by: "judge" | "customer" | "directive" | "chief-delegated"`、`actionSource?`、`operatorId?`、`directiveId?`、`choice`、`reason?`、`judge?`、`cardKind?`、`selectedOptionIds?`、`decisionId?`。

交互层写入（[事实]）：
- judge approve 结算：`app/desktop/customer-input.ts:1598-1635`（`judge` 审计与 `operatorId:"judge:<engine>"`；`deny` 只允许 approval 组，decision 组回落 manual，`:1506-1509`）。
- `request.resolved` 写入：`app/desktop/session.ts:5776-5829`；`by` 判定在 `:5822`（judge 归属 = `answeredOut.judge !== undefined || operatorId.startsWith("judge:")`，`:5776-5781`）；`decisionId` 生成在 `:5799`（answered 且非 chief-delegated ⇒ `decision-<requestId>`），回填在 `:5801`；`judge` 审计写入在 `:5828`。

### 1.3 开关语义与回落（[事实]）

- 「替我决策」开关 = 主进程权威 `decisionJudgeSwitch`；同时注入两条既有消费路径：`app/main.ts:602`（`delegation: decisionJudgeSwitch`，幕僚委托/chief-delegated）与 `app/main.ts:626-628`（judge 分组的 `decision` 开关）。
- 幕僚委托（chief-delegated）覆盖 `appointment/acceptance/decision/proposal`：`app/desktop/customer-input.ts:1776-1881`（`tryChiefDecision`，结算 `actionSource.kind:"chief-delegated"`，不写 customer）。此路径已在下游生效（`finalizeIntentConfirmation` 的 `delegated` 分支、D3 各处、`DocFreezeRecord.origin:"chief-delegated"`），**本变更不动**。
- 模型 judge（decision 组）覆盖 `intent-confirm`（以及 approval 组 `download`）：`customer-input.ts:1320-1385`（`planJudge`）。`intent-confirm` **不在** `isChiefBusinessCard`（`:1776-1780`），因此是当前唯一会由 judge 代批、且会派生 `intent-confirmed` 冻结的卡种。
- judge 回落（保持不变）：`manual`/开关中途关闭/group-mismatch/无唯一推荐（`not-recommended`）/结果行投达失败/超时/不可用 ⇒ 既有自动退回或客户卡回落，`customer-input.ts:1387-1700`；`deny` 仅 approval 组，decision 组按 manual 处理（`:1506-1509`）。
- 客户主权/高风险卡（Q5，保持不变）：`isApplicationDecisionReservedForCustomer`（`customer-input.ts:363-385`：run-change、版本决策、VCA、方案升级、修正案逐项/最终、stable-write）与 `isGovernanceWriteCardKind`（`:396-400`：appointment-write）；结算最后防线 `:1046-1073` 仍拒绝任何 `judge:`/`directive:` 来源；`:1331` 使 appointment-write 永不进入 judge；`:1915` 排除 `@决策` 指令代选。桌面 VCA 侧同向拒绝：`app/desktop/version-change.ts:407-420`（`sovereignViolation`）。

### 1.4 冻结/生效链现状（[事实]，详见 §2 清点）

```
intent-confirm 卡（judge approve）
  ├─ customer-input: settleEntry(answered + judge + operatorId)      ← 已生效，无需改
  ├─ session.ts: request.resolved{by:"judge", judge, operatorId, decisionId}  ← 已如实，无需改
  ├─ run-role.ts:1624-1644 → finalizeIntentConfirmation(outcome)     ← 在此被拒（I-01/I-03）
  ├─ apply-journal.ts:3335-3374 生成 intent-confirmed 冻结            ← 需新增 judge 分支
  ├─ model/version-change.ts isValidDocFreezeRecord                  ← 需新增 origin/source
  └─ 下游读取：verifyReviewIntent / guard confirmsMigratedIntent /
     readConfirmedIntentEvidence / 二次冻结筛选                        ← 需同步接受 judge
```

D3 派生链（appointment 卡若由 judge 代选，[推断：当前主接线由 chief-delegated 先接；见 §9]）：

```
request.resolved{by:"judge", decisionId, targetRoleIds, rosterStamp}
  ├─ prepareRoleActivation (apply-journal:3186) / prepareExecutionRun (3431) /
  │  prepareRoleDraftScope (3536) / nominatorRoleDocumentsFacts (trunk-runtime:727)
  └─ git policy active D3 (classify-shell:520-541) + appointment-write 事实校验 (session.ts:5269)
```

---

## 2. 全量清点表

约定：**删** = 删除拒绝条件；**替** = 替换为含 judge 的显式分支（customer/chief-delegated 行为不变）；**留** = 不改（说明理由）。编号用于 §5/§6 交叉引用。

### A. `intent-confirmed` 冻结生产与复核

| # | 位置 | 现行行为 | 处置 | 理由 |
|---|---|---|---|---|
| I-01 | `src/service/trunk/impl/apply-journal.ts:3337-3338` | `outcome.judge` 存在即 `invalid("No real retained-card confirmation to freeze")` | **替** | judge approve 是真实保留卡确认；改为按 `outcome.judge` 进入独立 judge 分支，其余失败条件保留 |
| I-02 | `apply-journal.ts:3344-3350` | 委托按 `actionSource.requestId` 找 `request.resolved`；其余按 `outcome.decisionId` | **替** | judge 结果含应用生成的 `decisionId=decision-<requestId>`（`session.ts:5799`），可按 `decisionId` 精确命中；新增 judge 分支校验 `resolved.judge` 与 outcome 一致 |
| I-03 | `apply-journal.ts:3362` | 非委托分支：`resolved.by !== "customer" || !decisionId || resolved.judge || directiveId` 即拒 | **替** | 拆为 customer 分支（逐字不变）与 judge 分支（新增）；judge 分支校验 `by:"judge"`、`judge` 审计、`operatorId`、无 `actionSource/directiveId` |
| I-04 | `apply-journal.ts:3363-3364` | customer 冻结形状（`decidedBy:"customer"`、`decisionId`、`source.customer-decision`） | **留** | 客户本人路径必须逐字不变 |
| I-05 | `apply-journal.ts:3356-3360` | chief-delegated 冻结形状 | **留** | 既有委托路径不变 |
| I-06 | `apply-journal.ts:3366` | `isValidDocFreezeRecord(freeze)` 复验 | **留** | 由 I-18 模型扩展自动覆盖新分支 |
| I-07 | `apply-journal.ts:1677-1678`（`verifyReviewIntent`） | 冻结记录 origin 仅 `customer`/`chief-delegated` | **替** | 冻结证据复核必须接受 `judge-delegated` |
| I-08 | `apply-journal.ts:1687` | 仅 customer-decision/chief-delegated 提取 `requestId` | **替** | 追加 `judge-delegated` 的 `requestId` |
| I-09 | `apply-journal.ts:1695-1699` | customer 分支与 chief 分支匹配账本；其他来源即“differs” | **替** | 追加 judge 分支：`decision.by==="judge"`、`judge` 审计/`operatorId` 与 source 一致、`decisionId==="decision-<requestId>"`（或缺失旧记录按拒绝 fail-closed）、`actionSource===undefined`、`directiveId===undefined` |
| I-10 | `apply-journal.ts:694-696` | 首次直接发布：intent-confirmed 冻结 origin 仅 customer/chief-delegated | **替** | 追加 `judge-delegated` |
| I-11 | `apply-journal.ts:1304-1306`（draft 首提准备） | 同上 | **替** | 追加 `judge-delegated` |
| I-12 | `src/provider/version-change/impl/guard-freeze-registry.ts:404-407`（`confirmsMigratedIntent`） | source.kind 仅 customer-decision/chief-delegated | **替** | 追加 `judge-delegated` |
| I-13 | `guard-freeze-registry.ts:419-423` | customer 分支校验 decisionId；chief 分支校验 `decisionId===undefined` | **替** | 追加 judge 分支（同 I-09 的审计一致性 + `applicationId==="intent-<requestId>"`） |
| I-14 | `guard-freeze-registry.ts:476-495`（`readConfirmedIntentEvidence`） | 经 `isValidDocFreezeRecord` + `confirmsMigratedIntent` 复核 | **留** | 由 I-12/I-13/I-18 自动覆盖；无需独立来源判断 |
| I-15 | `src/provider/trunk/impl/git-trunk-store.ts:133-138`；`apply-journal.ts:2433-2436`、`:2475-2478`、`:2996` | 文档准备/受派任务/直接发布的 intent 证据读取 | **留** | 全部经 `readConfirmedIntentEvidence`，自动获得 judge 支持 |
| I-16 | `apply-journal.ts:3367-3373` | 既有 intent-confirmed 记录与追加、快照刷新 | **留** | 与来源无关；新记录复用同一路径 |

### B. 冻结数据模型 / 冻结 Service / 账本事件

| # | 位置 | 现行行为 | 处置 | 理由 |
|---|---|---|---|---|
| I-17 | `src/model/version-change.ts:216` | `DocFreezeOrigin = "customer" \| "application" \| "role-direct" \| "chief-delegated"` | **替** | 追加 `"judge-delegated"` |
| I-18 | `src/model/version-change.ts:232-251` | `DocFreezeRecord.source?: DirectActionSource`；注释称 decidedBy 仅客户确认类 | **替** | `source` 放宽为 `DocFreezeSource = DirectActionSource \| JudgeDelegatedSource`；补注释（judge-delegated 不记 decidedBy/decisionId） |
| I-19 | `src/model/version-change.ts:267-293` | 校验：role-direct / chief-delegated / customer / application 四路；其他 origin 拒绝 | **替** | 追加 judge-delegated 分支：reason ∈ 新子集、无 decidedBy/decisionId/actorRoleId、source 为 judge-delegated 且字段自洽、applicationId 按 requestId 派生、`frozenAt===source.at` |
| I-20 | `src/model/version-change.ts:202-214` | `DOC_FREEZE_CUSTOMER_REASONS`（含 proposal/intent-confirmed） | **留** | reason 的“触发源类别”不变；新增 `DOC_FREEZE_JUDGE_DELEGATED_REASONS = ["proposal-confirmed","intent-confirmed"]` 作为 origin 子集约束 |
| I-21 | `src/service/version-change/impl/freeze-service.ts:85-131`（`buildDocFreezeRecord`） | 仅 customer（必须 decisionId+decidedBy）/ chief-delegated / application 派生 | **替** | 追加 judge-delegated 派生：`customerReason && source.kind==="judge-delegated"`；禁止 customer 字段；`applicationId` 空时合成 `proposal-<requestId>`/`intent-<requestId>`。**两处豁免必须点明（F6）**：`:99-101` 的「customer 类 reason 必须带 decisionId」改为 `customerReason && !delegated && !judged` 才要求；`:124` 的 `decidedBy:"customer"` 展开条件同样加入 `!judged`；judge 记录显式构造（不依赖 spread），`:129` 的 `isValidDocFreezeRecord` 兜底保持 |
| I-22 | `src/service/version-change/abstract/version-change-service.ts:251-265`（`DocFreezeInput`） | `source?: DirectActionSource` | **替** | 放宽为 `DocFreezeSource` |
| I-23 | `src/model/runtime.ts:1738-1753`（`DocFreezeEvent`） | `origin` 4 值；`actionSource?: DirectActionSource` | **替** | origin 追加 `judge-delegated`；`actionSource` 放宽为 `DocFreezeSource`（账本镜像用） |
| I-24 | `src/common/编排/task-state.ts:822-854`（`doc.freeze` 账本校验） | role-direct/chief-delegated/customer/application 四路 | **替** | 追加 judge-delegated 分支：客户类 reason + 仅 proposal/intent、无 decidedBy/decisionId/actorRoleId、source 为 judge-delegated 且 `applicationId` 匹配 `proposal-/intent-<requestId>`。**防御/未来路径（当前无 judge `doc.freeze` 生产者；F3）**，由 J16 正/负例钉住 |
| I-25 | `src/pipeline/orchestration/version-change-runtime.ts:176-195`（`freezeEvents`） | 账本镜像只写 applicationId/reason/origin/decidedBy/decisionId/actorRoleId，不写 source | **替（防御/一致性，无当前生产者；F3）** | [事实] `freezeEvents` 唯一调用点为 VCA approve（`:787`）与 detail apply（`:925`），输入均不带 `source`；judge 冻结经 `appendDocFreezeRecords` 只写 R9 baseline，**不产生 `doc.freeze` 事件**。本轮**不新增 producer**；仅当未来有 source-bearing 冻结经此函数落账时镜像 `actionSource`。既有事件字节不变，J17 钉住 |
| I-26 | `src/model/runtime.ts:1664/1696/1727`（`trunk.state`/`trunk.amendment`/`version.change` origin） | 4 值联合 | **留** | VCA/修正案/主干状态属客户主权路径（Q5），judge 不代批；不扩散 origin |
| I-27 | `src/model/project-state.ts:94`（`VersionDecisionDecidedBy`） | 已含 `"judge"` | **留** | 类型面既有；版本决策卡被 `isApplicationDecisionReservedForCustomer` 排除，judge 不会结算；不因此开放 |
| I-28 | `src/service/version-change/impl/vca-service.ts:542-545`、`:566-586`、`:687-707` | VCA/修正案批准必须客户 `decisionId`；冻结 reason vca/version-upgrade/detail-item | **留** | Q5/客户主权，保持“judge/委托/指令不适用” |
| I-29 | `src/common/编排/run-manifest.ts:666-690` | 首次 handoff pin 写 `handoff-pin-bootstrap`（application） | **留** | 应用机械动作，与 judge 无关 |

### C. D3（appointment）派生生效路径

| # | 位置 | 现行行为 | 处置 | 理由 |
|---|---|---|---|---|
| I-30 | `src/service/trunk/impl/apply-journal.ts:3186-3188`（`prepareRoleActivation`） | D3 `by` 仅 customer/chief-delegated；非 customer 用 `requestId` 作为 `d3DecisionId` | **替** | 允许 judge；判定改为共享 helper（judge 用真实应用 `decisionId`，见 §3.7）；同时校验 judge 审计/`operatorId` |
| I-31 | `apply-journal.ts:3200-3202`（authorization 证据） | `d3Source: d3.by`；无 `actionSource` 时写 `decisionId: d3.decisionId` | **留** | judge 的 `decisionId` 是应用真实生成值，非伪造；与门禁期望形状一致（I-35 同步） |
| I-32 | `apply-journal.ts:3429-3432`（`prepareExecutionRun`） | D3 仅 customer/chief-delegated；chief 要求 `decisionId===undefined` | **替** | 追加 judge（`decisionId` 必须为真实 `decision-<requestId>`；`actionSource` 必须缺省）；chief/customer 不变 |
| I-33 | `apply-journal.ts:3529-3543`（`prepareRoleDraftScope`） | D3 仅 customer/chief-delegated；customer 必须有 decisionId，其他必须无 | **替** | 允许 judge；`d3Reference` 用共享 helper；judge 的真实 `decisionId` 允许 |
| I-34 | `src/pipeline/orchestration/trunk-runtime.ts:724-732`（`nominatorRoleDocumentsFacts`） | D3 仅 customer/chief-delegated；`d3DecisionId` 非 customer 用 requestId | **替** | 允许 judge；用共享 helper；事实包 `d3By` 如实为 `"judge"` |
| I-35 | `src/common/门禁引擎/classify-shell.ts:517-541`（git policy active D3） | `resolved.by` 仅 customer/chief-delegated；customer 要求 decisionId，chief 要求 actionSource；授权形状按 `actionSource ?? decisionId` | **替** | 追加 judge 分支：`judge` 审计/`operatorId` 自洽、`decisionId==="decision-<requestId>"`、`actionSource===undefined`；期望授权仍为 `d3Source:"judge"` + `decisionId` |
| I-36 | `app/desktop/session.ts:5269-5293`（appointment-write D3 事实校验） | 按 `decisionId` + `targetRoleIds` + 归属键匹配 | **留** | judge 结果本就带真实 `decisionId`（`decision-<requestId>`），模型回执同值（`src/provider/runtime/tools.ts:2683-2685`），无需改 |
| I-37 | `src/common/编排/workflow-preconditions.ts:1481-1482` | `d3Selected` 只消费 `targetRoleIds` | **留** | 无来源拒绝 |
| I-38 | `src/pipeline/orchestration/run-role.ts:3305-3341`（appointment-write 预览） | 仅要求 `decisionId` 非空/合法 | **留** | 与 I-36 同向；judge 的 decisionId 合法 |

### D. 其它客户决策类卡与消费方

| # | 位置 | 现行行为 | 处置 | 理由 |
|---|---|---|---|---|
| I-39 | `app/desktop/customer-input.ts:1046-1073`（主权卡结算最后防线） | judge/directive 来源 ⇒ 拒绝结算并保留 pending | **留** | Q5 客户主权不弱化；只对非主权治理卡（intent-confirm/proposal 等）允许 judge |
| I-40 | `customer-input.ts:363-400`（`isApplicationDecisionReservedForCustomer`/`isGovernanceWriteCardKind`） | 列明 app 自有客户主权卡与 appointment-write | **留** | 高风险清单实现；本变更不得放宽 |
| I-41 | `app/desktop/version-change.ts:407-420`（`sovereignViolation`） | VCA 结果拒绝 judge/directive | **留** | 同上 |
| I-42 | `app/desktop/customer-input.ts:1760-1881`（`tryChiefDecision`） | 幕僚委托覆盖 appointment/acceptance/decision/proposal | **留** | chief-delegated 既有生效路径不变 |
| I-43 | `app/desktop/session.ts:5769-5829`（resolved 归因） | 已按事实写 `by:"judge"`/`operatorId`/`judge`/`decisionId` | **留** | 已是诚实来源；本变更消费它，不重写 |
| I-44 | `src/provider/runtime/tools.ts:2681-2698`（choice 回执） | judge 回执如实报“判断 agent 代批”，D3 附 `decisionId` | **留** | 与 §3.7 的 judge D3 参考值一致 |
| I-45 | `src/model/download.ts:98-103`；`src/pipeline/orchestration/download-request.ts:613` | 下载卡审批来源支持 `by:"judge"` | **留** | 既有 approval 类 judge 路径已生效；无冻结派生 |
| I-46 | `app/desktop/interface.ts:1644-1674`（需求变更结算） | `source:"judge"` 显式记录 | **留** | 已如实；无冻结派生 |
| I-47 | `src/common/编排/version-decision.ts:456`（`version.decision` 审计） | `decidedBy: event.by` | **留** | 版本决策卡客户主权；judge 不会结算；不改 |
| I-48 | `app/renderer/src/chat/version-change-view.ts:354-364`；`app/desktop/version-change.ts:622-633` | 冻结视图按 reason 显示；`decidedBy` 缺省即不显示 | **留** | 无功能性拒绝；UI 展示 judge 来源为可选非目标（§8 Q5） |

**清点合计：48 条**（其中 **替 23 条、留 25 条、删 0 条**）。[事实] 全仓 grep 复核口径：`outcome.judge`、`resolved.judge`、`by !== "customer"`、`by === "customer"`、`decidedBy`、`origin`、`proposal-confirmed`、`intent-confirmed`、`DOC_FREEZE`、`d3DecisionId` 在 `src/model`、`src/service`、`src/provider`、`src/pipeline`、`src/common`、`app/desktop` 中**与「judge 被拒 / 强制 customer、decisionId」相关**的命中均已逐条归入本表；其余 judge/来源相关命中（均为「留」，非拒绝点）见 §2.1（F8）。

**补充说明（未列为改点）**：`acceptance` 卡与 `decision`（材料性选择）卡经全仓 grep **未发现**按 `request.resolved.by` 来源的拒绝或 customer/decisionId 强制点；二者当前无 `doc-freeze` 派生。`download` 已支持 judge 来源（I-45），需求变更审批已如实记 `source:"judge"`（I-46）。因此这些卡不构成本次改点；若实施中发现新的来源硬校验，须回到本清点表追加并停下复核。`acceptance` 卡的**结算路由**与陈旧测试期望冲突属另行确认项（§6.5/Q9），不是本表漏项。

### 2.1 其余 judge/来源命中（不需改；[事实]，复核 R1.0 F8 附录）

以下命中经只读 grep 与人工核对，均已支持 judge 或属不同域，**不构成本次改点**；列出以保证「相关命中全部归类」可审计：

| 位置 | 内容 | 不改理由 |
|---|---|---|
| `app/desktop/download-request.ts:176-199` | 下载卡 judge 归因 | approval 组已支持 judge（I-45） |
| `src/provider/runtime/tools.ts:1976`、`:2413` | `operatorId:"judge:"` 分流；下载审批来源校验含 judge | 既有 judge 支持 |
| `src/common/编排/shell-escalation.ts:209`；`src/common/编排/shell-gate.ts:1149/1197/1262` | approval 组 shell 判断审计 | 非客户决策卡，无冻结派生 |
| `src/common/编排/run-manifest.ts:921` | run-change `decidedBy` 允许 judge | run-change 由 `isApplicationDecisionReservedForCustomer` 保持客户主权，judge 不会结算 |
| `src/pipeline/orchestration/trunk-runtime.ts:1399-1411` | `trunk.state` reconcile 仅回放 customer 绑定 | 不伪造来源 |
| `src/service/trunk/impl/refreeze.ts:33-51` | 高危重新冻结要求客户 decisionId | 非 judge 卡路径 |
| `src/pipeline/orchestration/stable-write-runtime.ts:127/333` | stable-write 客户主权 | Q5 不变 |
| `src/pipeline/orchestration/version-change-runtime.ts:167/221` | VCA/修正案客户事件 | Q5 不变 |
| `src/service/trunk/impl/apply-journal.ts:192` | `trunk.state` 审计 | 非冻结来源判定 |

---

## 3. 设计：诚实的 judge 委托来源

### 3.1 命名

采用 **`judge-delegated`**（origin 值与 source kind 同名）。理由：
- 与既有 `chief-delegated` 平行，语义清楚：都是“委托来源”，区别只是委托执行者（判断 agent vs 幕僚）；
- 不使用 `judge`（会与 `request.resolved.by:"judge"` 的“归因”混同）或 `judge-approved`（会把协议/拒绝类 judge 结果混入）；
- 与 `customer` 明确区分，杜绝“伪造成客户本人”。

### 3.2 新增类型与字段（[设计候选]）

在 `src/model/version-change.ts` 新增（保持该文件“仅依赖 `./trunk.ts`”的纪律，`:5-14`；`engine` 用受限字符串而非 import `RuntimeKind`，`isJudgeDelegatedSource` 强制 `engine` 非空，`RuntimeKind` 白名单由生产方与冻结/账本消费者的代码交叉校验真实值）：

```ts
export interface JudgeDelegatedSource {
  kind: "judge-delegated";
  /** 真实 request.resolved.requestId */
  requestId: string;
  /** GovernanceJudgeAudit.engine（如 "claude"/"codex"/"pi"/"demo"） */
  engine: string;
  model?: string;
  /** 必须等于 `judge:${engine}` */
  operatorId: string;
  reasonCode: string;
  reason?: string;
  selected?: readonly string[];
  confirmed?: true;
  /** "intent-confirm" | "proposal"（与 reason 绑定） */
  cardKind: string;
  /** 等于 request.resolved.at / freeze.frozenAt */
  at: string;
}

export type DocFreezeSource = DirectActionSource | JudgeDelegatedSource;
export const DOC_FREEZE_JUDGE_DELEGATED_REASONS: readonly DocFreezeReason[] =
  Object.freeze(["proposal-confirmed", "intent-confirmed"]);
export function isJudgeDelegatedSource(value: unknown): value is JudgeDelegatedSource;
```

`DocFreezeOrigin` 追加 `"judge-delegated"`；`DocFreezeRecord.source` 改为 `DocFreezeSource`；`DocFreezeEvent` 的 origin 追加同名、`actionSource` 放宽为 `DocFreezeSource`（type-import，不复制）。

**字段纪律（审计真实性）**：
- 冻结记录**不得**出现 `decidedBy:"customer"`、`decisionId`、`actorRoleId`；
- `operatorId` 必须为 `judge:<engine>`，`engine` 必须为非空字符串且与账本 `request.resolved.judge.engine` 一致；
- `requestId` 必须为真实 `request.resolved.requestId`；`at` 必须等于该事件的 `at`；
- `applicationId` 必须为 `intent-<requestId>`（intent-confirmed）或 `proposal-<requestId>`（proposal-confirmed）。**双约定勘误（F4）**：既有 Model 注释与 FreezeService 对 VCA/application 类按客户 `decisionId` 合成 `proposal-/intent-<decisionId>`（`src/model/version-change.ts:235-237`、`freeze-service.ts:108-115`），而 intent-confirmed 的实际生产/复核按 `requestId`（`apply-journal.ts:3359/3363`、`guard-freeze-registry.ts:409`）；judge **无客户 decisionId**，统一按 `requestId`。实施时同步勘误 `version-change.ts:174-175`、`:235-237` 与 `freeze-service.ts:11`/`:74` 注释，写清两口径的适用来源。对旧消费者/测试的影响：customer VCA 记录（decisionId）与 intent-confirmed 读者（requestId）均不变；无既有测试依赖 judge 的 applicationId；
- `reason`/`reasonCode`/`model`/`selected` 等来源摘要**不截断、按账本原值逐字段复制**（`evidence`/`pathDecisions`/`durationMs` 等非必要字段不复制）。**单一策略（G1/S2，替代 P1.1 的“超界即拒绝或截断”）**：`isJudgeDelegatedSource` 与冻结生产方只做类型/自洽校验，**不设长度上限、不截断**；`selected`（如有）必须与 `resolved.selectedOptionIds` 完全一致（一致性校验，非长度截断）。理由：§3.5 的账本重放要求 source 与账本 `request.resolved.judge` 逐字段一致，而账本在 `session.ts:5828` **原样写入、不截断**；冻结侧若截断或拒绝超界值，会把账本已接受的 judge approve 变成「冻结已写但 `verifyReviewIntent`/`confirmsMigratedIntent` 拒绝」→ `pending-recovery`，违背客户裁定。R9 baseline 体积由账本原值决定，冻结不引入额外无界来源；若未来需要上界，须在账本生产端（`session.ts:5828` 写入 `judge` 前）与重放端使用**同一归一化函数**并附超界用例——属改 `app/desktop/session.ts` 的独立变更，不在本方案写集。

### 3.3 `finalizeIntentConfirmation`（apply-journal.ts:3335）

改造后的判定顺序（[设计候选]）：

1. 基础门：`answered`、`selected` 含 `confirm` 且不含 `revise`、`directive` 缺省；`outcome.judge` **不再单独拒绝**（I-01）。
2. 定位 `request.resolved`：
   - chief-delegated：按 `outcome.actionSource.requestId`（既有）；
   - customer / judge：按 `outcome.decisionId`（应用在 `session.ts:5799-5801` 生成并回填；judge outcome 必须带）。
3. 通用校验：`resolved.cardKind==="intent-confirm"`、`selectedOptionIds` 含 confirm 不含 revise、`request.created` 的 `context` 含 `prepared.marker`（既有，逐字保留）。
4. 分支：
   - **chief-delegated**：既有条件逐字不变（I-05）。
   - **customer**：既有条件逐字不变（I-03 的 customer 半边、I-04）。
   - **judge（新增）**，全部满足才生成冻结：
     - `outcome.judge !== undefined` 且 `resolved.by === "judge"`；
     - `outcome.judge` 与 `resolved.judge` 必须为**非 null 对象**且 `engine`/`reasonCode`/`cardKind`/`group` 为非空/合法字符串（账本为裸 `JSON.parse`，防 `judge:null`/非对象访问抛错；S1 同源）；非法形状 ⇒ `trunk-item-invalid`（fail-closed，不抛错）；
     - `resolved.judge !== undefined` 且 `canonicalJson(resolved.judge) === canonicalJson(outcome.judge)`；
     - `resolved.judge.group === "decision"`、`resolved.judge.cardKind === "intent-confirm"`；
     - `resolved.operatorId === outcome.operatorId === "judge:" + resolved.judge.engine`；
     - `resolved.decisionId === "decision-" + resolved.requestId`（真实应用 id；缺失或异值 fail-closed[待确认：旧记录兼容，§3.10]）；
     - `resolved.actionSource === undefined`、`resolved.directiveId === undefined`；
     - `resolved.judge.selected`（如有）必须与 `resolved.selectedOptionIds` 一致；`resolved.judge.confirmed === true`（如有）必须对应 confirm 选择（注：`intent-confirm` 是 choice 卡，实际审计通常只有 `selected:["confirm"]`，`confirmed` 仅 confirm 卡出现；两者都按“如实复制存在的字段”处理）。
5. 生成冻结（不经过 `buildDocFreezeRecord`，与既有 customer/chief 路径一致）：

```json
{
  "schema": "doc-freeze/v1",
  "applicationId": "intent-<requestId>",
  "reason": "intent-confirmed",
  "origin": "judge-delegated",
  "source": {
    "kind": "judge-delegated",
    "requestId": "<request.resolved.requestId>",
    "engine": "<judge.engine>",
    "model": "<judge.model，如可得>",
    "operatorId": "judge:<engine>",
    "reasonCode": "<judge.reasonCode>",
    "reason": "<judge.reason，如可得>",
    "selected": ["confirm"],
    "cardKind": "intent-confirm",
    "at": "<request.resolved.at>"
  },
  "snapshotRef": { "snapshotId": "...", "digest": "..." },
  "frozenAt": "<request.resolved.at>"
}
```

6. `isValidDocFreezeRecord` 复验（I-19）、既有记录冲突检查与 `appendDocFreezeRecords`（I-16）不变。

### 3.4 冻结模型校验（`isValidDocFreezeRecord`）与 `buildDocFreezeRecord`

**Model（I-19）** 新增分支（位于 role-direct/chief-delegated 之后、customer/application 之前）：

- `record.origin === "judge-delegated"`
  - `reason ∈ DOC_FREEZE_JUDGE_DELEGATED_REASONS`；
  - `decidedBy === undefined`、`decisionId === undefined`、`actorRoleId === undefined`；
  - `isJudgeDelegatedSource(record.source)` 为真，且 `source.cardKind` 与 reason 匹配（intent-confirmed↔intent-confirm、proposal-confirmed↔proposal）；
  - `source.operatorId === "judge:" + source.engine`；
  - `applicationId === (reason === "intent-confirmed" ? "intent-" : "proposal-") + source.requestId`；
  - `typeof frozenAt === "string" && frozenAt !== "" && frozenAt === source.at`；
  - `snapshotRef` 若存在必须合法（历史/迁移记录可为缺省，与既有 customer/application 兼容口径一致）。
- 其余 origin 分支逐字不变；**旧记录（customer/application/role-direct/chief-delegated）必须仍全部通过**。

**FreezeService（I-21，F6）**：

- `const judged = customerReason && input.source?.kind === "judge-delegated";`
- `origin = direct ? "role-direct" : delegated ? "chief-delegated" : judged ? "judge-delegated" : customerReason ? "customer" : "application";`
- **豁免点 1**：`:99-101` 的「customer 类 reason 必须带 decisionId」改为 `customerReason && !delegated && !judged` 才要求；
- **豁免点 2**：`:124` 的 `decidedBy:"customer"` 展开条件改为 `customerReason && !delegated && !judged`；
- judge 分支：`input.reason ∈ DOC_FREEZE_JUDGE_DELEGATED_REASONS`、`decisionId/decidedBy` 必须缺省、`source.operatorId === "judge:"+source.engine`、摘要字段按 §3.2 单一策略（**不截断、按账本原值**；G1）；judge 记录**显式构造**（不依赖 spread 展开）；`applicationId` 为空时合成 `proposal-<source.requestId>`/`intent-<source.requestId>`（不是 `decisionId`，F4）。
- customer（必须 decisionId+`decidedBy:"customer"`）、chief-delegated（必须无 customer 字段、actorRoleId `"chief"`）、application 分支均不变；`:129` 的 `isValidDocFreezeRecord` 兜底保持（fail-closed）。

### 3.5 冻结读取/复核路径

- `verifyReviewIntent`（I-07..I-09）：origin 允许集加 `judge-delegated`；`source.requestId` 提取加 judge；新增 judge 分支按 §3.3 第 4 条同一组条件从**账本重放**验证（不信任冻结记录自述），并要求 `decision.event.at === freeze.frozenAt`、source 的 engine/model/operatorId/reasonCode/reason/selected/cardKind 与账本逐字段一致。
- `confirmsMigratedIntent`（I-12..I-13）：同上；`applicationId` 必须是 `intent-<requestId>`；快照存在且包含该 path/sha（既有尾部检查不变）。
- `apply-journal.ts:694-696`、`:1304-1306`（I-10/I-11）：origin 允许集加 judge-delegated。
- `readConfirmedIntentEvidence` 与所有经它读取的消费者（I-14/I-15）：不改代码，靠模型校验与服务层复核自动获得 judge 支持。
- 二次来源筛选（I-07..I-11）不得放宽为“任意 origin”：只加 `judge-delegated`，application/role-direct 仍被拒。

### 3.6 `doc.freeze` 账本事件（I-23..I-25；F3）

- **定位（修正 P1.0 论证）**：[事实] `version-change-runtime.freezeEvents` 是**唯一** `doc.freeze` 生产者（全仓仅 `src/model/runtime.ts:1740`（类型）与该函数），调用点仅 VCA approve（`version-change-runtime.ts:787`）与 detail apply（`:925`），输入来自 `vca-service` 且均**不传 `source`**；judge 冻结经 `apply-journal.ts:3369` `appendDocFreezeRecords` 只写 R9 baseline（`guard-freeze-registry.ts:604-609`/`:936-943`），**不产生 `doc.freeze` 事件**。因此 I-25 与 I-24 的 judge 分支均为**防御/未来路径**；本轮**不新增 producer**。
- `freezeEvents`：仅当 `entry.freeze.source !== undefined` 时镜像 `actionSource`（additive）。既有 VCA/detail 记录不带 source ⇒ 事件字节逐字不变（J17 回归）；customer intent-confirmed 记录虽带 source，但不经过此函数，不受影响。为可测试性，实施时可将该内部纯函数加模块级 `export`（仅测试 seam，非包级公共契约）。
- `task-state.ts` 校验新增 judge-delegated 分支（与 Model 分支同条件、`source` 从 `rec["actionSource"]` 读取）；role-direct/chief/customer/application 分支逐字不变；J16 正/负例。
- `request.resolved` 校验（`task-state.ts:430-455`）**不加** judge-delegated actionSource 分支：judge 的 resolved 事件保持现状（`by:"judge"` + `judge` 审计 + `operatorId` + `decisionId`），不引入新的 resolved 形状（最小暴露面）。**信任边界（F7）**：该既有校验对 `judge` 审计仅校验 `by` 枚举、未做结构校验；本轮不收紧（避免追溯拒绝历史事件），新冻结/授权路径在账本重放中逐字段核对 `resolved.judge`（`engine`/`operatorId`/`group`/`cardKind`/`decisionId`）后才生效（见 §3.5/§3.7、§9.9）。

### 3.7 D3 参考值与来源判定（共享 helper）

新增**两个共享纯函数**（运行时核心；`src/model/runtime.ts`，紧邻 `RequestResolvedEvent`）：

```ts
/** D3/appointment 决定引用：customer/judge 用真实 decisionId；chief-delegated 用 requestId；其他 undefined。 */
export function requestResolvedD3DecisionId(
  event: Extract<TaskStateEvent, { kind: "request.resolved" }>,
): string | undefined {
  if (event.by === "customer" || event.by === "judge")
    return typeof event.decisionId === "string" && event.decisionId !== "" ? event.decisionId : undefined;
  if (event.by === "chief-delegated") return event.requestId;
  return undefined;
}

/** D3/appointment 的 judge 裁决校验（apply-journal / trunk-runtime / classify-shell 共用，唯一实现；F11/S1）。 */
export function isJudgeD3Resolution(
  event: Extract<TaskStateEvent, { kind: "request.resolved" }>,
): boolean {
  if (event.by !== "judge") return false;
  // 账本事件为裸 JSON.parse：先防 null/非对象（S1），任何非法形状 fail-closed、不抛错。
  const judge: unknown = event.judge;
  if (typeof judge !== "object" || judge === null) return false;
  const audit = judge as GovernanceJudgeAudit;
  if (typeof audit.engine !== "string" || audit.engine === "") return false;
  if (typeof audit.reasonCode !== "string" || audit.reasonCode === "") return false;
  if (typeof audit.cardKind !== "string" || typeof audit.group !== "string") return false;
  if (event.operatorId !== `judge:${audit.engine}`) return false;
  if (event.actionSource !== undefined || event.directiveId !== undefined) return false;
  if (typeof event.decisionId !== "string" || event.decisionId !== `decision-${event.requestId}`) return false;
  const group = governanceCardGroup(audit.cardKind);
  return group !== undefined && group === audit.group;
}
```

- **judge 用 `decisionId` 的理由**：judge 结算时应用真实生成 `decision-<requestId>`（`session.ts:5799`）并已回填给工具回执（`tools.ts:2683-2685`）；下游沿用同一值可避免改工具回执，也不影响 chief-delegated（其 `decisionId` 被应用移除，仍用 `requestId`）。该值**不是**客户 decisionId，冻结记录仍不写它。
- D3 judge 校验（F11，单一实现）：apply-journal（`:3186`/`:3431`/`:3536`）、trunk-runtime（`:727-732`）、classify-shell（`:517-541`）一律调用 `isJudgeD3Resolution` + `requestResolvedD3DecisionId`，**不得各自手写条件**；卡种/名单约束（`targetRoleIds`/`rosterVersion`/`rosterSha256` 等）由各调用点既有校验保留（I-30/I-32/I-33/I-34/I-35）。`isJudgeD3Resolution` 覆盖：
  - `by === "judge"`、`judge` 为非 null 对象（`judge:null`/非对象/缺字段 ⇒ false，不抛错；S1）；
  - `engine`/`reasonCode` 非空字符串，`cardKind`/`group` 为字符串且 `operatorId === "judge:" + judge.engine`；
  - `decisionId === "decision-" + requestId`；
  - `actionSource`/`directiveId` 缺省；
  - `judge.group === governanceCardGroup(judge.cardKind)` 且结果非 `undefined`（审计自洽；`GOVERNANCE_CARD_GROUP` 见 `src/model/runtime.ts:943-956`）。
- `classify-shell.ts:533` 的 `d3DecisionId` 期望改为调用 helper（customer/judge → decisionId，chief → requestId）。
- authorization 证据（I-31/I-35）保持 `{ d3Source: resolved.by, ...(actionSource ? {actionSource} : {decisionId: resolved.decisionId}) }`；judge 时 `d3Source:"judge"` + 真实 `decisionId`，与门禁期望形状一致。

### 3.8 门禁 type-import 与消费方

- `src/common/门禁引擎/versioned-doc-guard.ts:33-43` 继续 `export { isValidDocFreezeRecord }`（单一来源，不复制）；模型扩展自动生效。
- `classify-shell.ts:724`（git policy baseline 冻结校验）使用同一模型不变量，自动接受 judge-delegated，无需复制逻辑。
- `classify-shell.ts:517-541` 的 D3 来源分支按 I-35 修改。
- 其它门禁文件（`shell-write-guard.ts` 等）只消费 `DocFreezeLookupState`，不受影响。

### 3.9 明确不变的部分

- 客户本人路径：`by:"customer"` + `decisionId` + `decidedBy:"customer"` + `source.customer-decision` 逐字不变（I-04/I-42）。
- chief-delegated 路径：`actionSource`/`requestId`/无 customer 字段/actorRoleId `"chief"` 逐字不变（I-05/I-42）。
- judge 回落：manual/deny（decision 组）/not-recommended/row-failed/switch-off/timeout/unavailable ⇒ 既有 declined/客户卡行为（§1.3）。
- Q5/客户主权：I-39/I-40/I-41/I-47 全部不变。
- VCA/修正案/stable-write/run-change/版本决策/appointment-write 的判据不变（I-26..I-29、I-39..I-41）。

### 3.10 旧记录兼容

- 历史 `customer`/`application`/`role-direct`/`chief-delegated` 记录继续通过同一 `isValidDocFreezeRecord`；新分支只对 `origin:"judge-delegated"` 生效。
- 历史 `intent-confirmed`（customer/chief-delegated）读取、复核、发布路径不变。
- 旧 judge 结算但未产生冻结的记录：本变更不追溯补冻结（无真实冻结字节/快照）；客户可重新确认（[设计边界]，与既有“不回填”纪律一致）。
- judge 的 `request.resolved.decisionId` 历史兼容：本方案要求 `decision-<requestId>`；若发现旧版本 judge 事件无该字段，冻结分支 fail-closed（不影响客户重新点卡/幕僚委托）；[待确认：是否允许缺失时退回 requestId 定位，默认不允许——见 §8 Q3]。
- `applicationId` 双约定（F4）：历史 customer VCA 记录的 `proposal-/intent-<decisionId>` 与 intent-confirmed 的 `intent-<requestId>` 均继续有效；本变更不改既有记录的 applicationId，也不改写 customer/chief 路径；judge 记录统一按 `requestId`。

---

## 4. 边界与不变量

1. **客户主权不变**：Q5 高风险清单（发布/删除/支付/外部服务/权限/数据迁移等）与 `isApplicationDecisionReservedForCustomer`/`isGovernanceWriteCardKind` 覆盖的卡（run-change、版本决策、VCA、方案升级、修正案逐项/最终、stable-write、appointment-write）继续**只由客户本人**；judge 永不结算、永不派生冻结。
2. **开关语义不变**：关闭「替我决策」⇒ 原卡回落客户；judge manual/deny（decision 组按 manual）/无唯一推荐/不可用 ⇒ 既有回落；不得因本变更把任何失败路径变成成功。
3. **审计真实**：judge 冻结/授权证据必须如实记 `by/operatorId/engine/model/reasonCode/reason/requestId`；不得出现 `decidedBy:"customer"`、客户 `decisionId` 或伪造 `requestId`。
4. **客户路径逐字不变**：customer 分支的字段、校验、错误码与文案不变；chief-delegated 同理。
5. **效果等同**：judge 冻结与客户冻结在**效力**上等同（可供 pin/发布/handoff 消费），但**证据来源不同**且可区分。
6. **不新增 judge 能力**：不改 `planJudge`、judge prompt/rubric、开关分组、桥接；只让既有 judge 结果在下游生效。
7. **失败闭合**：任何来源字段自洽性不满足（审计缺失、operatorId 不匹配、decisionId 异常、actionSource 混入）⇒ 拒绝冻结/授权，不得降级为“按客户处理”。
8. **不改写历史**：只新增 origin/字段；不重命名/不删除既有字段；旧记录不迁移。
9. **单实现（F11）**：D3 参考值（`requestResolvedD3DecisionId`）、D3 judge 来源校验（`isJudgeD3Resolution`）、冻结不变量（`isValidDocFreezeRecord`）各只有一份实现，均位于 `src/model/runtime.ts` / `src/model/version-change.ts`；apply-journal/trunk-runtime/classify-shell 只调用共享函数，门禁 type-import 不复制。
10. **零身份伪造**：`applicationId` 使用 `intent-/proposal-<requestId>`，不得空串；不得把 `decision-<requestId>` 写进冻结的 `decisionId` 字段。

---

## 5. 写集与 owner

基线：`c1439ce`。所有路径均落在既有 boundary（§1）内；**无新增目录、无 H1 delta**。若实施中出现上表之外的路径，须停下走 H1/Governance。

### 5.1 产品代码

| 文件 | owner（角色） | 改动 | 关联条目 |
|---|---|---|---|
| `src/model/version-change.ts` | 运行时核心 | 新 origin/source 类型、`DOC_FREEZE_JUDGE_DELEGATED_REASONS`、`isJudgeDelegatedSource`、校验分支、注释 | I-17..I-20 |
| `src/model/runtime.ts` | 运行时核心 | `DocFreezeEvent` origin/source 类型；`requestResolvedD3DecisionId`、`isJudgeD3Resolution` 共享纯函数 | I-23、§3.7、F11 |
| `src/service/trunk/impl/apply-journal.ts` | 编排 | `finalizeIntentConfirmation` judge 分支（`applicationId=intent-<requestId>`）；`verifyReviewIntent`；两处筛选；三处 D3 来源判定改用 `isJudgeD3Resolution`/`requestResolvedD3DecisionId` | I-01..I-11、I-30、I-32、I-33、F4、F11 |
| `src/service/version-change/impl/freeze-service.ts` | 编排 | `buildDocFreezeRecord` judge-delegated 派生 | I-21 |
| `src/service/version-change/abstract/version-change-service.ts` | 编排 | `DocFreezeInput.source` 放宽 | I-22 |
| `src/provider/version-change/impl/guard-freeze-registry.ts` | 编排 | `confirmsMigratedIntent` judge 分支 | I-12、I-13 |
| `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | D3 事实包来源判定 + helper | I-34 |
| `src/pipeline/orchestration/version-change-runtime.ts` | 编排 | `freezeEvents` 防御镜像 source（可加模块导出供单测；无当前 producer，J17 钉字节不变） | I-25、F3 |
| `src/common/编排/task-state.ts` | 编排 | `doc.freeze` 校验 judge 分支 | I-24 |
| `src/common/门禁引擎/classify-shell.ts` | 门禁引擎 | git policy active D3 judge 分支与 helper | I-35 |

**不需要改的产品文件**（明确排除，防越权）：`app/desktop/*`（交互层已如实产出 judge 结果；I-36/I-43 无需改）、`app/renderer/*`、`src/model/trunk.ts`、`src/service/gate/*`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`（仅调用 Service，签名不变）、`src/service/version-change/impl/vca-service.ts`。

### 5.2 测试

| 文件 | owner（角色） | 用途 |
|---|---|---|
| `test/runtime-core/direct-role-capabilities.test.ts` | 运行时核心 | R3 冻结不变量：judge-delegated 正/负例；历史记录回归 |
| `test/runtime-core/version-change-contract.test.ts` | 运行时核心 | `DocFreezeOrigin`/`DocFreezeEvent`/reason 分区契约随新增 origin 的契约测试（`:171` reason 分区、`:468-512` `doc.freeze` 事件可赋给 `TaskStateEvent`） |
| `test/编排/direct-role-capabilities.test.ts` | 编排 | intent-confirm judge 全链（冻结+读取+复核）；D3 judge 激活/执行/草案作用域；负例 |
| `test/编排/version-change-service.test.ts` | 编排 | `buildDocFreezeRecord`/`freeze()` judge 派生、applicationId 合成、禁止 customer 字段 |
| `test/编排/task-state.test.ts` | 编排 | `request.resolved by judge` 既有校验回归（`:320-384`）；**新增** `doc.freeze` judge 分支正/负例（J16；该文件当前无 doc.freeze 用例） |
| `test/编排/trunk-events.test.ts` | 编排 | 既有 `doc.freeze` 合法/非法行账本套件（`:100-292`）回归 + J16/J17（judge 分支与镜像字节不变） |
| `test/门禁引擎/direct-role-capabilities.test.ts` | 门禁引擎 | 模型不变量经门禁 type-import 的单实例回归；judge 记录被接受 |
| `test/门禁引擎/git-shell-acl.test.ts` | 门禁引擎 | classify-shell active D3 judge 分支与授权期望形状 |
| `test/桌面应用/decision-service.test.ts` | 桌面窗口 | judge 代批 intent-confirm 的 outcome 字段回归（judge/operatorId/decisionId）；开关关闭客户卡回落 |
| `test/桌面应用/chain-enforcement.test.ts`、`test/桌面应用/run-pin.test.ts`、`test/桌面应用/run-change-trigger.test.ts` | 桌面窗口 | 既有 `by:"judge"` D3 fixture 行为不回归（这些 fixture 与本设计约定一致：decisionId 为 `decision-<requestId>`） |
| `test/测试/git-write-chain-fixture.ts`、`test/测试/direct-role-capabilities-e2e.test.ts`、`test/测试/version-change-integration.test.ts` | 测试 | 真实 provider/文件链的 judge intent 冻结与下游消费联调（fixture 扩展，如需要）；Q5 客户主权回归（`:1295-1310` VCA 卡不进判断器、judge/directive 回包 unavailable）保持不变 |
| 新增 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 测试 | 跨层联调矩阵（可选；若新增文件，目录已授权） |

**零重叠检查**：每张测试文件只有一个角色 owner；`test/编排/` 与 `test/门禁引擎/`、`test/runtime-core/`、`test/桌面应用/`、`test/测试/` 互不重叠。产品文件按 boundary §1 唯一 owner。**无 H1 delta。**

### 5.3 文档

- 本方案：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（策划）。
- 实施/验收记录按既有角色 `docs/change/` 与 `docs/acceptance/` 流程另行产出（不在本方案写集）。

---

## 6. 测试同步与验收

### 6.1 契约变更（必须显式记录，不得静默放宽）

| 契约 | 现行 | 本变更 |
|---|---|---|
| AC-31/F35 冻结归属（`docs/acceptance/trunk-amendment-model-criteria-v1.md:205`） | customer 类 reason ⇒ `origin:"customer"`、`decidedBy:"customer"` | customer 类 reason 在“客户开启委托且 judge 代批”时可为 `origin:"judge-delegated"`，**无 decidedBy/decisionId**，携带 judge 来源；客户路径仍为 customer。属**显式修订**，由独立验收确认 |
| `DocFreezeOrigin`（`src/model/version-change.ts:216`） | 4 值 | + `"judge-delegated"` |
| `DocFreezeRecord.source`（`:232-251`） | `DirectActionSource` | `DocFreezeSource = DirectActionSource \| JudgeDelegatedSource` |
| `DocFreezeEvent`（`src/model/runtime.ts:1738-1753`） | origin 4 值；actionSource 仅 DirectActionSource | + `judge-delegated`；source 放宽 |
| `applicationId` 约定（F4） | VCA/application 按客户 `decisionId` 合成 `proposal-/intent-<decisionId>`（Model 注释/FreezeService）；intent-confirmed 生产/复核按 `requestId` | judge-delegated 统一 `intent-/proposal-<requestId>`；注释勘误写明两口径；customer/chief 记录字节不变 |
| D3 参考值/来源校验 | `customer ? decisionId : requestId`（多处手写）；来源条件各自手写 | 共享 `requestResolvedD3DecisionId`（customer/judge → decisionId；chief-delegated → requestId）与 `isJudgeD3Resolution`（judge 来源校验唯一实现） |
| `request.resolved` / `CustomerInputOutcome` | 已含 judge | **不变**（本变更只消费） |

**旧断言核对**：[事实] 全仓测试检索未发现“judge 必须被 `finalizeIntentConfirmation` 拒绝”或“judge D3 必须被拒”的既有断言；因此**不存在需要删改的旧负例**，本变更属于能力扩展 + 契约显式修订。既有负例（伪造 customer、chief 字段混入、role-direct 混入等）全部保留并应继续失败。

### 6.2 新增测试矩阵

| ID | 层级 | 场景 | 期望 |
|---|---|---|---|
| J1 | 运行时核心/编排 | `isValidDocFreezeRecord` 接受 intent-confirmed `judge-delegated`（完整 source/snapshotRef） | true；字段不被重写 |
| J2 | 运行时核心 | judge 负例：`decidedBy`/`decisionId`/`actorRoleId` 任一出现；`operatorId` 与 engine 不符；`engine` 空串；`judge`/source 为 null 或非对象；`applicationId` 非 `intent-/proposal-<requestId>`；reason 非子集；`frozenAt!==source.at`；source kind 非 judge-delegated；`selected` 与 `resolved.selectedOptionIds` 不一致 | 全部 false（非法形状 fail-closed、不抛错） |
| J3 | 编排 | `buildDocFreezeRecord`/`freeze()`：proposal/intent + judge source；applicationId 空 ⇒ 合成 `proposal-/intent-<requestId>`；VCA reason + judge source ⇒ 拒绝 | 前三者通过且 origin 正确；VCA 拒绝 |
| J4 | 编排 | `finalizeIntentConfirmation`（judge approve，真实账本 created/resolved + marker + 快照；含超长 `judge.reason`/`model` 原值） | 成功；baseline 出现 `intent-confirmed`/`judge-delegated`；source 摘要与账本逐字一致（不截断）；无 decidedBy/decisionId；`readConfirmedIntentEvidence` ok |
| J5 | 编排 | judge 负例：outcome.judge 与 resolved.judge 不一致；source 摘要（reason/model/selected）与账本不一致；judge 为 null/非对象；operatorId 不符；decisionId 非 `decision-<requestId>`；resolved.directiveId/actionSource 混入；无 judge resolved 行 | 全部 `trunk-item-invalid`，不写冻结（不抛错） |
| J6 | 编排 | customer 路径回归：既有 customer intent-confirm/幂等/冲突/字节漂移用例 | 逐字通过（不改断言） |
| J7 | 编排 | chief-delegated 路径回归：既有 delegated intent-confirm 用例 | 逐字通过 |
| J8 | 编排 | judge D3：`prepareRoleActivation`/`activateRoleDocuments`/`prepareExecutionRun`/`prepareRoleDraftScope` 接受 judge 事件（decisionId=`decision-<requestId>`，judge 审计/operatorId 自洽） | 成功；`d3Source:"judge"`；authorization `decisionId` 为真实应用值 |
| J9 | 编排 | judge D3 负例：审计缺失/不匹配、operatorId 不符、decisionId 异常、actionSource 混入、targetRoleIds/roster 戳不符 | 全部拒绝 |
| J10 | 编排 | judge D3 的后续 pin/handoff/发布读取（`readConfirmedIntentEvidence`、verifyReviewIntent） | 成功且证据来源可区分 |
| J11 | 门禁引擎 | classify-shell active D3 judge 正/负例；授权期望形状；baseline 冻结记录含 judge-delegated | 正例通过、负例拒绝；与模型不变量同一函数（不复制） |
| J12 | 桌面窗口 | judge 代批 intent-confirm 的 outcome/resolved 字段不变（回归钉）；开关关闭 ⇒ 客户卡（无 judge 结算） | 既有行为不回归 |
| J13 | 桌面窗口 | 主权卡（VCA/run-change/版本决策/appointment-write/stable-write）judge 结算阻断 | 继续阻断（Q5） |
| J14 | 编排/模型 | judge manual/deny/无唯一推荐/不可用/关闭开关 | 既有回落：declined/客户卡；无冻结 |
| J15 | 测试（跨层） | 真实文件链：judge intent 冻结 → pin/handoff/发布前读取；旧 customer/chief 记录回放 | 全链通过；旧记录逐字通过 |
| J16 | 编排 | `task-state` `doc.freeze` judge-delegated 账本校验（I-24，F3/F12）：正例（完整 source + `applicationId` 匹配）与负例（source 缺失/字段不符/customer 字段混入/applicationId 不匹配）；既有 customer/application/role-direct/chief 行 | 正例通过、负例拒绝；旧行逐字通过 |
| J17 | 编排 | `freezeEvents`（I-25，F3/F12）：既有 VCA approve/detail apply 无 source 路径事件字节与当前逐字一致；构造带 judge-delegated source 的 entry ⇒ 镜像 `actionSource` 且通过 J16 校验 | 字节不变；镜像正确 |

### 6.3 受影响既有测试（逐条）

- `test/runtime-core/direct-role-capabilities.test.ts`（R3，`:172-198`）：保留全部旧用例；增 J1/J2。
- `test/门禁引擎/direct-role-capabilities.test.ts`（`:317-329`）：`isValidDocFreezeRecord === modelFreezeValidator` 不变；增 judge 记录接受与负例。
- `test/编排/direct-role-capabilities.test.ts`（`:85-130` customer 意图冻结；`:119` replay）：保留；增 J4/J5/J8/J9/J10。
- `test/编排/version-change-service.test.ts`（`:594-619` proposal-confirmed 合成）：保留；增 J3。
- `test/编排/task-state.test.ts`（`request.resolved by judge` 既有校验，`:320-384`）：保留；**新增** `doc.freeze` judge 分支用例（J16）。
- `test/编排/trunk-events.test.ts`（`:100-292` `doc.freeze` 合法/非法行账本套件，含 customer/application 负例）：保留且须继续通过；增 J16/J17 的 judge/镜像回归，不改既有负例。
- `test/门禁引擎/git-shell-acl.test.ts`（`:453-458` D3 授权）：保留；增 judge 变体。
- `test/桌面应用/decision-service.test.ts`、`chain-enforcement.test.ts:283-295`、`run-pin.test.ts:175-190`、`run-change-trigger.test.ts:201-215`：judge 结果/账本 fixture 与本设计一致；保留并补回归断言。
- `test/测试/git-write-chain-fixture.ts:307`（customer intent finalize）：保留；如需 judge 变体，另加参数化分支，不改变默认行为。
- `test/测试/version-change-integration.test.ts:1295-1310`（Q5 客户主权：VCA 卡不得进入判断器、judge/directive 回包 unavailable）：保留，必须继续通过（本变更不触碰）。
- **无既有测试需要“放宽”：** 若实施中发现某测试断言与客户裁定冲突，必须逐条列入变更包并说明“为何旧断言与裁定冲突”，不得静默修改。既有套件判定一律采用 §6.5「基线已知红项 + 增量不回归」口径，**不以“全绿”为前提**。

### 6.4 真实运行标准

见 §7 的 AC-J10/AC-J11/AC-J12。

### 6.5 基线已知红项（[事实]；B1/变更包必须记录并逐条对照；F2）

复核 R1.0 在 HEAD `c1439ce` 以只读方式运行 `node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`：**6 项中 2 项通过、4 项未通过**（`# pass 2 / # fail 1 / # cancelled 3`）：

| # | 用例 | 失败形态 | 判定 |
|---|---|---|---|
| 1 | 幕僚调度验收…（`:128` 断言） | 断言失败：`chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务` | 预存红项；与本变更无关 |
| 4 | 开关开启：验收卡由判断 agent 代选推荐项（`:239`） | `testTimeoutFailure`（定向运行 8,007ms 超时） | 预存红项；与本变更无关 |
| 5 | §5A judgeContext.intentId… | `testTimeoutFailure` | 预存红项；与本变更无关 |
| 6 | §5A/P9.2… | `testTimeoutFailure` | 预存红项；与本变更无关 |

- 确定性成因：`app/desktop/customer-input.ts:1776-1780` `isChiefBusinessCard` 将 `acceptance` 与 appointment/decision/proposal 一并归为幕僚业务卡；`:2045-2050` `presentEntryNow` 命中后先 `tryChiefDecision(entry)`，失败即 `presentNow(entry)` 返回，**永不落入 `planJudge`**；测试 harness 未注入 `delegation`，卡等待客户 ⇒ 超时。该行为自 `e71501c` 引入 `isChiefBusinessCard` 起存在，测试文件自 `0908746` 后未更新；`git diff --stat c1439ce..origin/main -- src app test` 为空（origin/main `9ffeb1e` 同内容），故预存红项在方案基线上成立。
- **不在本变更写集内修复**，尤其禁止为此修改 `app/desktop/customer-input.ts`（本方案 §5.1 明确排除）。B1/变更包必须记录上述基线计数与失败清单，对候选逐条对照：同名用例不得恶化、不得新增确定性失败、不得新增 skip。
- 语义待确认（Q9）：客户「替我决策」下 acceptance 卡应由幕僚委托（现行代码）还是 judge 代批（旧测试期望）——由沟通确认；不影响本方案 intent-confirmed 目标与判据。

---

## 7. 可检查验收标准（B1 输入）

| ID | 优先级 | 标准 | 证据 |
|---|---|---|---|
| AC-J1 | P0 | `intent-confirmed` 可由 judge 代批生成：`origin:"judge-delegated"`、`source.requestId/engine/operatorId/reasonCode/reason/selected/cardKind/at` 与真实账本一致；`applicationId:"intent-<requestId>"` | 真实文件链测试 + R9 baseline 字节 + 账本 |
| AC-J2 | P0 | 审计真实：冻结/授权记录**不含** `decidedBy:"customer"`、客户 `decisionId`、伪造 `actorRoleId`；`operatorId==="judge:<engine>"` | 字段断言 + 负例（J2/J5） |
| AC-J3 | P0 | 客户本人路径逐字不变（`by:"customer"`/`decisionId`/`decidedBy:"customer"`）；chief-delegated 路径逐字不变；**旧套件判定采用 §6.5「基线已知红项 + 增量不回归」口径**：以记录基线逐条对照，不得新增确定性失败/新 skip，预存红项不得恶化 | J6/J7 + §6.5 基线对照记录 |
| AC-J4 | P0 | judge manual/deny（decision 组）/无唯一推荐/不可用/开关关闭 ⇒ 既有回落；不产生冻结/生效 | J14 + 桌面套件 |
| AC-J5 | P0 | Q5/客户主权卡（run-change/版本决策/VCA/方案升级/修正案/appointment-write/stable-write）即使开关开启仍由客户本人；judge 结算继续被阻断 | J13 + 既有负例 |
| AC-J6 | P1 | `proposal-confirmed` 同源支持（模型/Service/账本校验/门禁消费）；当前无生产 producer，仅单位/契约测试 | J1/J2/J3 |
| AC-J7 | P1 | D3 judge（若产生 judge 裁决）可完成激活/执行 pin/草案作用域；`d3Source:"judge"`、`decisionId` 为真实应用值；负例拒绝 | J8/J9/J10 |
| AC-J8 | P1 | 旧记录兼容：历史 customer/application/role-direct/chief-delegated 冻结记录与旧 `doc.freeze` 账本逐字通过 | 旧套件 + R3/R5 用例 |
| AC-J9 | P1 | 门禁单一实现：`isValidDocFreezeRecord`、`requestResolvedD3DecisionId`、`isJudgeD3Resolution` 均只一份；门禁 type-import 不复制 | source grep + J11 |
| AC-J10 | P0（真实） | **真实 Electron + 真实 Claude + 真实 UI**：开启「替我决策」，幕僚发 intent-confirm，judge 代批 `confirm` ⇒ `request.resolved.by:"judge"`、冻结成功（`intent-confirmed`/`judge-delegated`、`operatorId:"judge:<engine>"`、无 customer/decisionId 伪造），后续 pin/handoff 可消费；UI 无 pending-recovery | 真实运行截图/录屏 + `.ans/state/tasks.jsonl` + `.ans/state/versions.jsonl` + 诊断日志 |
| AC-J11 | P0（真实） | 同一真实环境**关闭**「替我决策」⇒ intent-confirm 原卡呈现客户，客户本人点卡通过；行为与变更前一致 | 真实运行证据 |
| AC-J12 | P0 | 隔离真实运行（对齐同日文档格式方案 §7.4，不占用贪吃蛇 9222）：CDP 端口 **9223**；独立 `--userData`；仓库外独立目标项目根（如 `C:\Users\51054\Desktop\work\ans-judge-delegated-run-2026-11-09\target`），**不得占用贪吃蛇运行中的 9222、其临时根或目标项目**；预检：9222 由贪吃蛇占用（只读确认，不触碰）/9223 空闲；后检：9222 与贪吃蛇根零改动、9223 释放、无 Electron 残留；预算与停止：客户消息 ≤1、intent-confirm 卡 ≤1、模型回合最小化并如实记录、墙钟 ≤20 分钟、首个决定性证据即 halt、不自动重试；运行前后 `git status`/`git diff --stat` 证明仅允许写集变化 | 运行配置与端口/进程前后检查、贪吃蛇根前后只读快照、证据清单、git 记录 |

**基线口径（适用全部 AC）**：涉及既有套件的证据一律按 §6.5 记录基线并逐项对照；「旧套件全绿」**不是**本变更的验收前提（基线存在与本变更无关的预存红项）。

---

## 8. Q 清单（待复核/客户确认；按预授权默认值推进）

> 说明：正文中的「Q5」均指**意图记录**里的「Q5 高风险清单（客户主权卡）」；本节 Q 编号为本方案自身的待确认项，二者无关。

| # | 问题 | 默认值（预授权） | 说明 |
|---|---|---|---|
| Q1 | 来源命名 `judge-delegated` vs `judge-approved`/`judge` | `judge-delegated` | 与 chief-delegated 平行、区分归因 |
| Q2 | judge 冻结记录是否写 `decisionId`（应用真实 `decision-<requestId>`） | **不写** | 冻结的 decisionId 字段具客户确认语义；真实 decisionId 只在账本/授权证据 |
| Q3 | judge `request.resolved` 缺 `decisionId` 的旧记录 | **fail-closed**（不冻结） | 不追溯、不推断；客户可重新确认 |
| Q4 | `proposal-confirmed` 是否纳入 judge-delegated（当前无生产者） | **纳入模型/Service/校验**，不新增 producer | 保持全量裁定一致；避免未来路径再开口 |
| Q5 | 冻结列表 UI 是否显示 judge 来源/engine | **本轮不改 UI**（非目标） | 审计可从 baseline/证据读取；如需展示另立小变更 |
| Q6 | D3 judge 参考值用 `decisionId` 还是 `requestId` | **`decisionId`**（真实应用值；chief-delegated 仍 `requestId`） | 与工具回执一致，避免改回执；冻结记录不受影响 |
| Q7 | judge 来源是否允许用于 VCA/修正案冻结 reason | **不允许**（仅 proposal/intent） | Q5 高风险客户主权 |
| Q8 | 是否在 `request.resolved` 上新增 `actionSource.judge-delegated` | **否** | 最小暴露面；judge 事实已在 `judge`/`operatorId`/`by` |
| Q9 | 客户「替我决策」下 `acceptance` 卡由幕僚委托（现行代码）还是 judge 代批（`optional-acceptance.test.ts:239` 旧期望） | **按现行代码（幕僚委托先行）**，交沟通确认 | 追加原因（复核 F2 建议 4）：语义漂移遗留断言，与本方案 intent-confirmed 目标无关；确认前不修该测试、不改 `app/desktop/*` |
| Q10 | I-25 `freezeEvents` 防御镜像保留还是删除（当前无 judge `doc.freeze` 生产者） | **保留（防御/一致性）** | 追加原因（复核 F3）：模型/账本形状一致、既有事件字节不变（J17）、未来 producer 出现时无需再改；若确认永不经此路径，可另立变更删除以缩小暴露面 |

---

## 9. 风险与残余

1. **[事实] 当前真实主接线中，judge 不会结算 appointment/proposal/acceptance（F9）**：`app/desktop/customer-input.ts:1776-1780` 将 acceptance/proposal/appointment/decision 一并视为幕僚业务卡（`isChiefBusinessCard`）；`:2045-2050` `presentEntryNow` 对这些卡先 `tryChiefDecision`，失败即 `presentNow` 返回，**不落入 `planJudge`**；`:1334` decision 卡种排除；`src/model/runtime.ts:943-956` 中 `intent-confirm` 是 decision 组唯一非 chief 业务卡的卡种 ⇒ judge 仅接 `intent-confirm` 与 approval 组 `download`；`proposal-confirmed` 无 producer（`src`/`app` 无该 reason 的 `freeze()` 产生路径）。因此 D3 judge 路径主要是**防御性/一致性**扩展，真实运行以 intent-confirm 为主证据；若客户希望 judge 也直接结算任命/提案（而非幕僚委托），属**接线变更**，超出本方案，另立变更。`optional-acceptance.test.ts:239` 的「judge 代选 acceptance」是上述语义漂移前的陈旧期望（§6.5/Q9）。
2. **契约修订风险**：AC-31/F35 的“customer 类 reason ⇒ customer”是既有验收基线；本变更为显式修订，必须由独立验收确认，不得视为无变更。
3. **模型放宽的误用风险**：`DocFreezeSource` 放宽后，任何应用代码都可构造 judge-delegated source；通过“仅 proposal/intent reason + 账本一致性复核（finalize/verify/confirms）+ 门禁单实现”多层约束降低；仍建议实施后加 source grep/守卫测试（AC-J9）。
4. **D3 授权形状一致性**：`classify-shell` 的 `policyEqual(authorization, expectedAuthorization)` 要求生产者与门禁同步修改；漏改会导致 git active 提交被拒（fail-closed，不会误放行）。
5. **judge 审计缺失/旧记录**：fail-closed；不影响客户本人路径。
6. **冻结记录体积（G1）**：只复制必要字段（不复制 `evidence`/`pathDecisions`/`durationMs` 等），但 `reason`/`reasonCode`/`model`/`selected` 等来源摘要**不截断、按账本原值逐字段复制**——§3.5 重放要求逐字段一致，截断/拒绝会使账本已接受的 judge approve 变成「冻结已写但复核拒绝」→ `pending-recovery`，反客户裁定目的。体积由账本原值决定，冻结不引入额外无界来源；若未来需要上界，须在账本生产端（`session.ts:5828` 前）与重放端用同一归一化函数并附超界用例（独立变更，不在本方案写集）。
7. **快照/幂等**：judge 冻结复用既有 `appendDocFreezeRecords` 与快照刷新；重放/幂等测试必须覆盖（J4）。
8. **残余（F10）**：意图记录引用的 `docs/acceptance/entry-role-minimal-criteria-v1.md` 不存在；[事实] 同源可核条目为 `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`。实施前由沟通完成意图记录 §关联 引用勘误（或实施/验收包引用可核路径）；不改变本方案语义。
9. **`request.resolved.judge` 信任边界（F7）**：`task-state.ts:430-455` 对既有 judge 审计无结构校验；本轮不收紧（避免追溯拒绝历史事件），新冻结/授权路径在账本重放中逐字段核对 `resolved.judge`（`engine`/`operatorId`/`group`/`cardKind`/`decisionId`）后才生效；该信任边界只影响证据展示面，不影响生效面。若未来需要账本级强校验，另立变更。
10. **`doc.freeze` judge 分支无当前生产者（F3）**：I-24/I-25 为防御分支，J16/J17 钉住行为；若未来确认永不经此路径，可另立变更删除 I-25 以缩小暴露面（本方案默认保留，理由见 Q10）。
11. **`applicationId` 双约定（F4）**：两口径并存但来源不同；本变更以注释勘误与 §6.1 契约行固定。若实施中发现第三方按旧注释消费 judge 的 applicationId，按 fail-closed 停下复核。

---

## 10. 与既有契约的关系

- **PR #72（角色模块化/E3，merge `c069425`）**：本变更不改 `BuiltInRoleModule`/角色卡/能力/`GOVERNANCE_CARD_GROUP`；`intent-confirm` 仍在 decision 组、`appointment-write` 仍客户主权；派发父门/应用中介证据零改动。
- **E0 契约**：本变更只扩展运行时核心的 `doc-freeze` 共享类型与编排内部证据消费，不改变 E0 的模块 public API、依赖方向或写集。
- **trunk-amendment model（P1.6/F29/F34/F35/AC-31）**：显式追加 judge-delegated 归属（§6.1）；`migrated-legacy`/bootstrap/application 语义不变。
- **在飞变更**：**P1.0 曾称「无」，该说法已在 P1.1 勘误**——同日同 worktree 另有两个在飞变更与本方案存在文件重叠，见 §10.1/§10.2；在协调记录落地前**不派发实施**。

### 10.1 在飞变更（同日、同 worktree；[事实]，2026-11-09 只读核对）

| 变更 | 记录（工作区快照） | 写集（与本方案相关部分） | 与本方案重叠 |
|---|---|---|---|
| **提案卡 draft run 绑定缺陷修复**（P0 热路径） | `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，183 行 / 32,508 bytes / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`（未跟踪草案；子修复 A′ 编排 + B 桌面窗口） | A′：`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts`（路由另注：如需小助手亦限 `src/common/编排/`，S3 仅记录、本方案写集不变）；B：`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` | **高**：`apply-journal.ts` 与本方案 I-01..I-11/I-30/I-32/I-33 同文件；`test/编排/direct-role-capabilities.test.ts` 与本方案 J4/J5/J8/J9/J10 同文件 |
| **文档格式权威说明**（同日方案） | `docs/planning/2026-11-09_design_document-format-specifications.md`，786 行 / 99,718 bytes / SHA-256 `0469e2dfa5891174c534c3bca03219724c429096c0fea4892982f1a1ca8f8358`（未跟踪草案；其 §10.3 已建议本变更与提案卡修复先行） | `src/model/runtime.ts`（加法 `DocFormat*` 类型/能力位）、`src/provider/runtime/{tools,schema}.ts`、`src/pipeline/orchestration/run-role.ts`、`app/desktop/session.ts`、`test/桌面应用/session.test.ts`、新增规范/测试文件 | **中**：`src/model/runtime.ts` 与本方案 I-23/§3.7 共享函数同文件（不同区域，仍须串行写）；其余文件本方案**不编辑**（§5.1 排除清单） |
| **本方案（judge 委派生效）** | 本文件 | 见 §5.1/§5.2 | — |

**勘误（对方方案对本方案的误述；F1）**：[事实] 文档格式方案 §10.1/§10.2 将本方案描述为会改 `app/desktop/customer-input.ts`、`app/desktop/session.ts`、`src/pipeline/orchestration/run-role.ts`；本方案 §5.1 明确**不含任何 `app/desktop/*` 产品改动**，也不改 `run-role.ts`（`run-role.ts` 仅调用 `finalizeIntentConfirmation`，签名不变）。本方案与该文档格式方案的**真实文件重叠仅 `src/model/runtime.ts`**。此勘误须随本方案提交知会统筹/沟通（写入协调记录或调度回执）；同时请协调方核对对方表格对其余文件的描述。

### 10.2 三变更冲突矩阵与串行次序建议

| 文件 | 本方案 | 提案卡修复 | 文档格式 | 单写者次序 |
|---|---|---|---|---|
| `src/service/trunk/impl/apply-journal.ts` | 编辑（主战场） | A′ 编辑 | 不编辑 | 提案卡修复 → 本方案 |
| `test/编排/direct-role-capabilities.test.ts` | 编辑 | A′ 编辑 | 不编辑 | 提案卡修复 → 本方案 |
| `src/model/runtime.ts` | 编辑（`DocFreezeEvent` + 共享函数） | 不编辑 | 编辑（加法 `DocFormat*`） | 本方案 → 文档格式（文档格式方案自述最后合并） |
| `app/desktop/customer-input.ts` | **不编辑** | B 编辑 | 不编辑 | 提案卡修复独占 |
| `app/desktop/session.ts` | **不编辑** | 不编辑 | 编辑 | 文档格式独占 |
| `src/pipeline/orchestration/run-role.ts` | **不编辑** | 不编辑 | 编辑 | 文档格式独占 |
| `test/桌面应用/session.test.ts` | **不编辑** | 不编辑 | 编辑 | 文档格式独占 |
| `test/桌面应用/chief-workflow.test.ts` | **不编辑** | B 编辑 | 不编辑 | 提案卡修复独占 |

**推荐串行次序（供协调方裁决；以协调方裁决为准）**：

1. **提案卡修复（A′ → B）先行**：其 A′ 与本方案在 `apply-journal.ts` 与 `test/编排/direct-role-capabilities.test.ts` 同文件同区域（draft 绑定 vs intent 冻结/复核），且是 P0 真机阻塞；本方案应从修复合并后的 main 重切/重放基线再实施，避免重复改写与测试夹具冲突。
2. **本 judge 变更其次**：完成后 `apply-journal.ts` 对 judge 的冻结/复核与 D3 判定稳定；文档格式方案不编辑该文件。
3. **文档格式方案最后**：其 §10.3 已自述「本变更最后合并/最后编辑」；与本方案仅 `src/model/runtime.ts` 同文件（不同区域，仍须串行写）。
- 同一文件同一时刻只允许一个变更编辑；每次实施前重跑基线并记录 HEAD；合并前互相 diff 检查，后合并方 rebase 并重跑受影响测试。
- 在协调记录（含上述勘误知会）落地前，本方案**不派发实施**；如协调方裁决其它次序，以裁决为准并回写本方案（升版）。

---

## 11. 非目标

- 不改 judge prompt/rubric/开关分组/桥接；不新增代理审批能力或扩权。
- 不改 Q5 高风险/客户主权清单；不放宽任何客户确认、验收、写权、发布语义。
- 不改 VCA/修正案/stable-write/run-change/版本决策/appointment-write 的判定。
- 不追溯补冻结、不迁移旧记录、不改写历史账本。
- 不做 UI 展示增强（judge 来源显示）、不做发布/tag、不建 DSL/工作流引擎。
- 不实施、不测试、不提交（本方案阶段）。

---

## 12. 复核点（供独立复核逐条核对）

- 生产/拒绝链：`src/service/trunk/impl/apply-journal.ts:3335-3374`、`:1647-1701`、`:694-696`、`:1304-1306`、`:3186`、`:3431`、`:3536-3543`。
- 模型：`src/model/version-change.ts:216`、`:232-251`、`:267-293`；`src/model/runtime.ts:1070-1120`、`:1484-1525`、`:1738-1753`、`:3006-3022`、`:943-956`（`GOVERNANCE_CARD_GROUP`/`governanceCardGroup`）。
- Service/Provider：`src/service/version-change/impl/freeze-service.ts:85-131`；`src/service/version-change/abstract/version-change-service.ts:251-265`；`src/provider/version-change/impl/guard-freeze-registry.ts:404-431`、`:476-495`；`src/provider/trunk/impl/git-trunk-store.ts:133-138`。
- 编排/门禁：`src/pipeline/orchestration/trunk-runtime.ts:724-732`；`src/pipeline/orchestration/version-change-runtime.ts:176-195`；`src/common/编排/task-state.ts:430-455`、`:822-854`；`src/common/门禁引擎/classify-shell.ts:517-541`。
- 桌面既有事实：`app/desktop/customer-input.ts:363-400`、`:1046-1073`、`:1320-1385`、`:1492-1700`、`:1760-1881`、`:1915`；`app/desktop/session.ts:5269-5293`、`:5769-5829`；`app/desktop/version-change.ts:407-420`；`app/main.ts:602`、`:626-628`；`src/provider/runtime/tools.ts:2681-2698`。
- 测试基线：`test/runtime-core/direct-role-capabilities.test.ts:172-198`；`test/runtime-core/version-change-contract.test.ts:171`、`:468-512`；`test/门禁引擎/direct-role-capabilities.test.ts:317-329`；`test/编排/direct-role-capabilities.test.ts:85-130`；`test/编排/version-change-service.test.ts:594-619`；`test/编排/task-state.test.ts:320-384`；`test/编排/trunk-events.test.ts:100-292`；`test/门禁引擎/git-shell-acl.test.ts:453-458`；`test/桌面应用/decision-service.test.ts`；`test/桌面应用/chain-enforcement.test.ts:283-295`；`test/桌面应用/run-pin.test.ts:175-190`；`test/桌面应用/run-change-trigger.test.ts:201-215`；`test/测试/version-change-integration.test.ts:1295-1310`。
- 基线已知红项：`test/桌面应用/optional-acceptance.test.ts`（`:128`、`:239` 等；见 §6.5），复核命令 `node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`（HEAD `c1439ce` 实测 6 项中 4 项未通过）。

---

## 13. 复核处置记录（R1.0 F1–F13；P1.1 窄复核 G1/S1–S3）

> 复核记录：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（287 行 / 38,867 bytes / `6e98749b…`）。P1.1 窄复核（must-fix 0；G1 general、S1–S3 suggestion）为独立复核会话结论。下表逐项记录处置与落点；未完全采纳项注明理由。

| # | 严重度 | 处置 | 落点 |
|---|---|---|---|
| F1 | must-fix | **已修订**：§10 改为「在飞变更」清单（文档格式方案 `0469e2df…`、提案卡修复路由 `4e8fb354…`）＋三变更冲突矩阵＋串行次序建议（提案卡修复 → 本 judge 变更 → 文档格式；同文件单写者；以协调方裁决为准）；勘误对方方案对本方案写集的误述（本方案不含 `app/desktop/*`/`run-role.ts` 产品改动）并知会统筹/沟通 | §10.1、§10.2 |
| F2 | must-fix | **已修订**：新增 §6.5 基线已知红项（`optional-acceptance.test.ts` 6 项中 4 未通过，含 `:239` 8,007ms 超时；成因为 `isChiefBusinessCard` 先行拦截，与本变更无关）；AC-J3 改为「基线已知红项 + 增量不回归」；§6.3 口径同步；明确不在本写集修复、不得新增确定性失败/新 skip；Q9 记录 acceptance 语义待沟通 | §6.5、§6.3、§6.4、§7（AC-J3）、Q9 |
| F3 | general | **已修订**：I-25 标注「防御/一致性，无当前生产者」，§3.6 重写论证（`freezeEvents` 唯一生产者仅 VCA 路径、judge 冻结只写 R9 baseline）；本轮不加 producer；补 J16/J17 与 `trunk-events.test.ts` 回归；Q10 记录保留理由 | I-24、I-25、§3.6、J16/J17、§6.3、Q10、§9.10 |
| F4 | general | **已修订**：§3.2/§3.4/§6.1/§3.10 显式勘误 `applicationId` 双约定（VCA/application 按 decisionId；intent-confirmed 生产/复核按 requestId；judge 统一 requestId），列出旧消费者/测试影响与注释勘误点 | §3.2、§3.4、§3.10、§6.1、§9.11 |
| F5 | general | **已修订**：AC-J12 扩为 9223/独立 `--userData`/仓库外独立目标根/预检后检（9222 与贪吃蛇根零改动、9223 释放、无 Electron 残留）/预算与停止（客户消息与卡数上限、墙钟 ≤20 分钟、首个决定性证据即停、不自动重试）/`git status` 仅写集变化 | AC-J12 |
| F6 | suggestion | **已吸收**：I-21 与 §3.4 点明两处豁免（`:99-101` decisionId 强制、`:124` `decidedBy` 展开），judge 记录显式构造；`:129` 模型兜底保持 | I-21、§3.4 |
| F7 | suggestion | **部分吸收**：`engine` 非空在 `isJudgeDelegatedSource` 强制；账本 `request.resolved.judge` 结构校验**本轮不加**（避免追溯拒绝历史事件），信任边界与补偿（新冻结/授权路径重放逐字段核对）显式记录 | §3.2、§3.6、§9.9 |
| F8 | suggestion | **已吸收**：§2 措辞收窄为「与 judge 被拒/强制 customer、decisionId 相关的命中」；新增 §2.1 其余 judge/来源命中附录（逐条不改理由） | §2、§2.1 |
| F9 | suggestion | **已吸收**：§9.1 由 [推断] 升 [事实]，补 `customer-input.ts:1776-1780`/`:2045-2050`/`:1334`、`runtime.ts:943-956` 证据，并链接 `optional-acceptance.test.ts:239` 陈旧断言 | §9.1、§6.5 |
| F10 | suggestion | **已吸收**：C-05 引用路径勘误落成实施前动作（沟通更正意图记录；实施/验收包引用可核路径） | 头部依据、§9.8 |
| F11 | suggestion | **已采纳方案 (a)**：新增共享纯函数 `isJudgeD3Resolution`，apply-journal/trunk-runtime/classify-shell 一律调用；§4.9 不变量改写 | §3.7、§4.9、§5.1、§6.1、AC-J9 |
| F12 | suggestion | **已吸收**：新增 J16（`doc.freeze` judge 正/负例）与 J17（`freezeEvents` 镜像/字节不变）；§6.3 点名 `test/编排/trunk-events.test.ts:100-292` 回归 | J16/J17、§5.2、§6.3 |
| F13 | suggestion | **已按 G1 收口**：P1.1 的冻结侧长度上界与 §3.5 逐字段一致冲突；改为冻结侧不截断、按账本原值（见 G1） | §3.2、§3.3、J2/J4/J5、§9.6 |
| G1 | general（P1.1 窄复核） | **已修订**：钉死单一策略——冻结侧不截断、按账本 `request.resolved.judge` 原值逐字段复制（`session.ts:5828` 原样写入、不截断），不设长度上界、超界不拒绝；如需上界须在账本生产端与重放端用同一归一化函数（独立变更，本方案不改 `app/desktop/session.ts`）。已写明该策略不会造成「冻结已写但 verify/confirms 拒绝 → `pending-recovery`」 | §3.2、§3.3、§3.5、J2/J4/J5、§9.6 |
| S1 | suggestion（P1.1 窄复核） | **已吸收**：`isJudgeD3Resolution` 与 `finalizeIntentConfirmation` judge 分支先做 `typeof judge === "object" && judge !== null` 及 `engine`/`reasonCode`/`cardKind`/`group` 类型校验；任何非法形状 fail-closed、不抛错（classify-shell 证据为裸 `JSON.parse`） | §3.3、§3.7、J2/J5 |
| S2 | suggestion（P1.1 窄复核） | **已合并入 G1**：删除「超界即拒绝或截断」二选一表述，统一为不截断策略 | §3.2、J2 |
| S3 | suggestion（P1.1 窄复核） | **已记录**：§10.1 提案卡修复路由注明「如需小助手亦限 `src/common/编排/`」目录级余量；本方案写集不变 | §10.1 |

**Q 调整说明**：新增 **Q9**（`acceptance` 卡在「替我决策」下的语义归属——幕僚委托 vs judge 代批；默认按现行代码即幕僚委托，交沟通确认，不影响本方案判定）与 **Q10**（I-25 防御镜像保留 vs 删除；默认保留，理由：模型/账本形状一致、既有事件字节不变、未来 producer 出现时无需再改）。其余 Q1–Q8 维持不变。

---

**结论（P1.2）**：本方案以 `judge-delegated` 来源让客户开启「替我决策」后的 judge 代批在 `intent-confirmed`（及同源的 `proposal-confirmed`、D3 派生路径）上**生效**，同时以“无 customer 字段、无 decisionId、完整 judge 事实、账本逐字段复核”保证审计真实；客户本人与 chief-delegated 路径、全部回落与 Q5 客户主权规则保持不变。P1.2 已逐项处置复核 R1.0 的 F1–F13 与 P1.1 窄复核的 G1/S1–S3（§13；窄复核结论为 must-fix 0、建议提交）；实施前仍需：（1）复核确认本版；（2）§10 串行次序经协调方裁决并完成误述勘误知会；（3）按预授权完成方案确认。
