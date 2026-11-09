# 独立复核记录：代理审批/代决策的效力等同客户本人（judge 委派生效与诚实审计）方案 P1.0

- 版本：**R1.0，2026-11-09**；ANS 独立复核（Reviewer）独立只读上下文。
- 状态：**复核记录；不是验收结论、不阻断、不实施。** 本次复核未改方案/代码/测试/角色卡/边界；未提交/推送/合并/发布；未运行真实模型/Electron；仅执行过一次只读测试文件（见 §6.1 证据），未改仓库跟踪内容。
- 复核规则：只作建议；逐项给出可核对依据；**不把方案推荐当客户确认**；本文严重度仅为建议分级（must-fix / general / suggestion），不代表验收判定。

## 0. 复核对象、依据与基线（快照）

| 项 | 值 |
|---|---|
| 方案 | `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` |
| 方案规模 | 550 行 / 59,176 bytes（工作区实测 `wc -lc`） |
| 方案 SHA-256 | `60c68dad3b1da1317421a046680a93345be301769c04d703a269b221a61cbc8a`（与任务给定一致；`sha256sum` 实测） |
| 方案 git 状态 | 未跟踪（`git status --porcelain` = `??`）；哈希按工作区字节计算，不对应已提交 blob |
| 意图记录 | `docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`（35 行；SHA-256 `d084b5ffeb522a68f6ece21fd2eb486a1a075afa360e0fae46ce84f72d6b6f6f`，实测一致） |
| 预授权 | `docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`，实测一致） |
| C-05 同源条目 | `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`（SHA-256 `5c8b9e860526c480f54bef701167044068994b72dff7d657c5c94ac4a0d4f348`，实测一致；方案引用的 `docs/acceptance/entry-role-minimal-criteria-v1.md` **确不存在**，`docs/acceptance/` 仅有 `entry-role-minimal-final-report-v1.md`） |
| AC-31/F35 契约 | `docs/acceptance/trunk-amendment-model-criteria-v1.md:205`（SHA-256 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`，实测一致；`:205` 即 AC-31 行） |
| 代码基线 | git worktree `.claude/worktrees/trunk-amendment`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（分支 `feat/plan-escalation-card`）；`git diff --stat 65813c9..HEAD -- src app test` 为空（方案 §头部声明属实）；`git diff --stat c1439ce..origin/main -- src app test` 亦为空（origin/main `9ffeb1e`），故本记录行号对当前 main 同内容成立 |
| 工作区跟踪状态 | `git status --porcelain -- src app test` = 0（干净）；仓库根有大量未跟踪 docs/临时脚本（含本记录与方案），不构成本次复核的代码漂移 |

方法：逐条阅读方案并按其 `file:line` 声明以只读方式核对代码；对复核重点执行独立 `grep` 抽查；对关键测试文件以 `node --test` 只读跑一次基线（§6.1）。行号均为 `c1439ce` 快照，实施合并后可能漂移，以符号名为准。

## 1. 结论摘要

方案方向与客户裁定一致，现状根因、失败点与数据模型/服务/门禁的 file:line 引用**基本全部核实为真**（含 `finalizeIntentConfirmation` 的 `outcome.judge` 拒绝、`resolved.by !== "customer"` 约束、`DocFreezeRecord` 无 judge 来源、二次来源复核与 D3 路径；48 条清点表的每一行引用均可对上）。设计选择 `judge-delegated` 来源、不写 `decidedBy/decisionId`、以账本逐字段复核保证审计真实，在既有不变量下自洽；客户路径/chief-delegated 路径可保持逐字不变；D3 参考值共享 helper 恰好覆盖现有 4 处同构三元式（`apply-journal.ts:3186`、`:3542`、`trunk-runtime.ts:732`、`classify-shell.ts:533`）。

但存在 **2 项必须先修订的 must-fix**：

1. **协调事实错误**：方案 §10 称「在飞变更：无」，而同一 worktree 内同日已有两个在飞变更与本方案写集重叠（`src/model/runtime.ts`；`src/service/trunk/impl/apply-journal.ts` 与 `test/编排/direct-role-capabilities.test.ts`），且对方方案把本方案描述为会改 `app/desktop/customer-input.ts`/`session.ts`/`run-role.ts`（与本方案 §5.1 排除清单相反）。按单写者纪律，实施前必须修订协调段并定序。
2. **验收前提错误**：AC-J3「旧套件全绿」/ §6.3「无既有测试需要放宽」在基线上不成立——`test/桌面应用/optional-acceptance.test.ts` 在 HEAD `c1439ce`（及 origin/main `9ffeb1e` 同内容）实测 6 项中 4 项失败/超时（含「开关开启：验收卡由判断 agent 代选推荐项」在 `:239` 超时），成因是现行 `isChiefBusinessCard` 先行拦截 acceptance 卡（与本方案无关的既有分支缺陷/陈旧断言）。B1 必须改为「已知红项基线 + 增量不回归」口径，并明确该预存失败不在本变更写集内修复。

其余 3 项 general（I-25 `doc.freeze` 镜像无当前生产者且论证不准确、`applicationId` 合成口径与既有注释/服务规则存在双约定、B1 真实运行隔离/预算/停止标准不完整）与 8 项 suggestion 见 §3。

**复核结论（建议）：修订后提交；F1/F2 修订前不建议进入实施派发。**

## 2. 问题清单（F1..F13）

严重度：must-fix（建议修订后方可提交/派发）> general（应修订/澄清）> suggestion（建议改进，不阻断）。

| # | 严重度 | 位置 | 问题摘要 |
|---|---|---|---|
| F1 | **must-fix** | 方案 §10 `:524`（及 §5.1 `:378-389`） | 「在飞变更：无」不实；同日两个在飞变更与本方案写集重叠，须显式协调/定序 |
| F2 | **must-fix** | 方案 AC-J3 `:476`、§6.3 `:462-463` | 「旧套件全绿」基线不成立（`optional-acceptance.test.ts` 预存 4/6 失败/超时）；须记录预存红项并改增量口径 |
| F3 | general | 方案 I-25 `:134`、§3.6 `:301`、§6.2 `:433-449` | `doc.freeze` 镜像（I-25）无当前 judge 生产者，「新记录需要」论证不准确；I-24/I-25 无对应 J 用例 |
| F4 | general | 方案 `:220`、`:279`、`:288`；对照 `src/model/version-change.ts:235-237`、`src/service/version-change/impl/freeze-service.ts:108-115` | judge 的 `applicationId` 用 `requestId`，与既有注释/服务「`proposal-/intent-<decisionId>`」双约定并存，未显式勘误 |
| F5 | general | 方案 AC-J12 `:485` | B1 隔离标准不完整：未写明 9223、独立目标项目/临时根、运行前/后检查、预算/停止 |
| F6 | suggestion | 方案 I-21 `:288`；对照 `freeze-service.ts:99-101`、`:124`、`:129` | 未点明 `buildDocFreezeRecord` 中「customer 必须 decisionId」条件与 `decidedBy:"customer"` 展开需对 judged 豁免 |
| F7 | suggestion | 方案 §3.2 `:186-206`；对照 `task-state.ts:431-473` | `engine: string` 无法在 Model 层限定 `RuntimeKind`；账本 `request.resolved.judge` 亦无结构校验，建议最小加固/留证 |
| F8 | suggestion | 方案 §2 `:169` | 「全部命中均已逐条归类」过强；独立 grep 有多处 judge 命中未列入表格（均「留」，非拒绝点），建议附录化 |
| F9 | suggestion | 方案 §9.1 `:508` | 「judge 不结算 appointment/proposal/acceptance」可由代码证成 [事实]，而非 [推断]；并应与 F2 的陈旧 acceptance 断言一并说明 |
| F10 | suggestion | 方案 `:9`、§9.8 `:515` | C-05 引用路径不存在已如实标注；建议把「由沟通勘误意图记录」落成具体动作/记录 |
| F11 | suggestion | 方案 §4.9 `:365` vs §3.7 `:322-327` | 「单实现」不变量与「D3 judge 条件可局部实现」表述存在张力，建议统一为共享判定或改写不变量 |
| F12 | suggestion | 方案 §5.2 `:399` vs §6.2 J1–J15 `:433-449` | I-24 `doc.freeze` 账本分支未映射到 J 项；既有 `test/编排/trunk-events.test.ts`（doc.freeze 正/负例套件）未被点名回归 |
| F13 | suggestion | 方案 `:221`、§9.6 `:513` | `reason/selected/model` 仅称「有界摘要」未给上界，建议显式长度上限（与 `request.resolved.reason` 200 字符口径对齐） |

### F1（must-fix）协调：§10「在飞变更：无」不实，存在跨方案写集重叠

**依据（只读核对）：**

- 本方案写集（`:378-389`）含 `src/model/runtime.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/common/编排/task-state.ts` 等；测试含 `test/编排/direct-role-capabilities.test.ts`（`:397`）。
- 同日并行方案 `docs/planning/2026-11-09_design_document-format-specifications.md`：
  - `:9` 明确把本方案列为「同日并行变更（分别记账、避免同文件冲突）」；
  - `:543-551` 其写集含 `src/model/runtime.ts`（加法 `DocFormat*` 类型/能力位）；
  - `:685`（Q11）默认「等 judge 代批 + 提案卡修复合并后再实施/合并本变更（共享热文件串行）」；
  - `:731` 还把本方案描述为将改 `app/desktop/customer-input.ts`、`app/desktop/session.ts`、`run-role.ts`——与本方案 §5.1 `:389` 的「不需要改的产品文件」相反（本方案排除清单经本次复核为正确：judge 结果已在交互层如实产出，见 F1 依据下的核验）。
- 同日缺陷修复路由 `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`：
  - `:112-118` 子修复 A′ 写 `src/service/trunk/impl/apply-journal.ts` 与 `test/编排/direct-role-capabilities.test.ts`（**与本方案直接重叠**）；子修复 B 写 `app/desktop/customer-input.ts`；
  - `:182` 推荐 A′+B 串行派发；客户已授权修复快路径（见并行方案 `:732`）。
- 因此方案 §10 `:524`「在飞变更：无。若实施时发现其它变更改动同一文件，按协调规则停下对账」与现场事实矛盾：实施者按方案会被误导为可立即并行写入。
- 快照说明：上述并行方案/路由文档均为**未跟踪草案**（`git status` = `??`），且并行方案在本记录写盘前仍被更新（本记录引用其 2026-11-09 11:26 工作区快照的行号）；其实施写集以最终确认版为准，但「在飞变更存在且与本方案重叠」的事实不受其措辞漂移影响。

**建议：** 修订 §10：列明上述两个在飞变更（文件/哈希、当前状态）、各自的写集与串行顺序（至少：`src/model/runtime.ts` 与 `apply-journal.ts` 同一时刻只允许一个变更编辑），并把「对方方案误述本方案改 app/desktop/session.ts/run-role.ts」作为协调勘误项交统筹；在协调记录落地前不派发实施。

### F2（must-fix）验收：基线测试非全绿，「旧套件全绿」不可达

**实测证据（只读执行，不改仓库）：**

- 命令：`node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`（Node v24.22.1，worktree HEAD `c1439ce`）。
- 结果：6 项中 2 项通过（`无自动验收机器`、`开关关闭：验收卡呈现客户`）；4 项未通过：
  - `not ok 1 - 幕僚调度验收…`：断言失败（`optional-acceptance.test.ts:128`，`chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务`）；
  - `not ok 4 - 开关开启：验收卡由判断 agent 代选推荐项…`（`:239`）：`testTimeoutFailure`（定向运行 8,007ms 超时）；
  - `not ok 5 - §5A judgeContext.intentId…`、`not ok 6 - §5A/P9.2…`：`testTimeoutFailure`。
- 确定性成因（与超时环境无关）：
  - `app/desktop/customer-input.ts:1776-1780` `isChiefBusinessCard` 将 `acceptance` 与 appointment/decision/proposal 一并视为幕僚业务卡；
  - `:2045-2050` `presentEntryNow`：命中 `isChiefBusinessCard` ⇒ `tryChiefDecision(entry)`，失败即 `presentNow(entry)` 并 return，**永不落到 `:2056` 的 `planJudge`**；
  - `:1789-1792` `tryChiefDecision` 在未注入 `delegation`（测试 harness 未注入，`delegationState()` 默认 `enabled:false`）时返回 false ⇒ 卡被呈现给客户、测试无人作答 ⇒ 超时。
  - 复核另以最小内联探针复现同一路径（未落盘文件）：acceptance 卡无 delegation 时 `customerInput` promise 不结算（挂起等待客户），judge 调用数为 0。
- 基线一致性：`git diff --stat c1439ce..origin/main -- src app test` 为空，`e71501c`（引入 `isChiefBusinessCard` 的检查点）为 origin/main 祖先；该测试文件自 `0908746` 后未更新。故该预存红项在方案基线（也是当前 main 内容）上成立，与本方案改动无关。

**与方案的冲突：** AC-J3 `:476` 要求「J6/J7 + 旧套件全绿」；§6.3 `:462` 称「无既有测试需要『放宽』」。后者对「judge 被拒绝」类断言的检索结论为真（见 §4.5），但「旧套件全绿」作为验收前提不成立；且该失败正好位于「judge 与客户决策卡」同主题域，实施者有诱因去改本方案明确排除的 `app/desktop/*` 来「修绿」。

**建议：**
1. 在方案中新增「基线已知红项」小节，记录上述 4 项及原因（含文件:行、判定为既有/与本变更无关）；
2. 把 AC-J3/AC-J6/AC-J7/AC-J15 的「旧套件全绿」改为「与记录基线相比无新增失败；预存红项逐项复核不因本变更恶化」；
3. 明确禁止在本变更写集外（尤其 `app/desktop/customer-input.ts`）修复该预存问题；
4. 建议由沟通确认一个语义问题：在客户「替我决策」语义下，acceptance 卡究竟应由幕僚委托（现行代码）还是 judge 代批（旧测试期望）——这影响后续验收口径，但不改变本方案的 intent-confirmed 目标。

### F3（general）I-25 `doc.freeze` 镜像无当前 judge 生产者，论证不准确且无测试映射

**依据：**
- `src/pipeline/orchestration/version-change-runtime.ts:176-195` `freezeEvents` 是**唯一** `kind:"doc.freeze"` 事件生产者（全仓 grep 仅 `src/model/runtime.ts:1740`（类型）与该处）。
- 其调用点仅 `:787`（VCA approve）与 `:925`（detail apply）；输入来自 `vca-service.ts` 的 freeze/freezeMany（`:489-497` amendment-submitted、`:569-585` version-upgrade、`:695-707` detail），均**不传 `source`**。
- judge 冻结生产者 `finalizeIntentConfirmation` 走 `apply-journal.ts:3369` `appendDocFreezeRecords` → `guard-freeze-registry.ts:604-609`/`:936-943` `appendBaselineRecords("frozen")`，只写 R9 baseline（`versions.jsonl`），**不产生 `doc.freeze` 事件**。
- 因此 I-25「当 `freeze.source` 存在时镜像 `actionSource`（新记录需要）」在当前代码中没有 judge 生产者；「既有 customer/application 记录无 source」只对流入 `freezeEvents` 的 VCA 记录成立——customer `intent-confirmed` 记录本身带 `source`（`apply-journal.ts:3363-3364`），只是不经过此函数。I-24 的 task-state judge 分支同样是无生产者的防御分支。
- §6.2 J1–J15 中没有 I-24/I-25 的对应用例（§5.2 `:399` 只在 `test/编排/task-state.test.ts` 提新增 doc.freeze 用例）。

**建议：** 将 I-25 明确标注为「防御/未来路径（当前无生产者）」，修正「新记录需要」的表述为「若未来有 judge/proposal 冻结经 `freezeEvents` 落账时保留来源」；把 I-24/I-25 映射进 J 矩阵（或 §5.2 明确挂到 J3/J15），并新增「既有 doc.freeze 事件字节不变」的回归断言。若确认永远不经此路径，可考虑删除 I-25 以缩小暴露面。

### F4（general）`applicationId` 合成口径存在双约定，未显式勘误

**依据：**
- 方案（`:220`、`:279`、`:288`）主张 judge 记录 `applicationId = intent-<requestId>` / `proposal-<requestId>`。
- 既有 Model 注释 `src/model/version-change.ts:235-237` 写的是 `proposal-<decisionId>` / `intent-<decisionId>`；`freeze-service.ts:108-115` 实际按 `decisionId` 合成。
- 但 intent-confirmed 的实际生产/消费用的是 `requestId`：`apply-journal.ts:3359`、`:3363`（`intent-${resolved.requestId}`），`guard-freeze-registry.ts:409` 校验 `freeze.applicationId === intent-${requestId}`（`requestId` 来自 `source.requestId`）。
- 结论：现存两条约定并存（VCA 服务侧用 decisionId；intent 最终冻结用 requestId）。judge 无客户 decisionId，只能走 requestId 是正确选择，但方案未显式指出并勘误注释/文档。

**建议：** 在 §6.1 契约表中增加一行「applicationId 约定」：customer VCA（freeze-service）→ `decisionId`；intent-confirmed 生产/复核 → `requestId`；judge-delegated → `requestId`；并在 I-18/I-19/I-21 中明确更新 `version-change.ts:174-175`（reason 注释「客户类 decidedBy customer」）与 `:235-237`、`freeze-service.ts:11`/`:74` 的注释，避免实现者按旧注释写出与模型分支自相矛盾的合成值。

### F5（general）B1 真实运行标准缺 9223/独立根/预算/停止

**依据：**
- 方案 AC-J12 `:485` 仅写「独立 userData/端口，不得占用贪吃蛇运行中的 9222；运行前后 git status」。
- 同工作区既有真实运行协议（可直接对齐）：`docs/planning/2026-11-09_design_document-format-specifications.md:642-654`（9223 隔离、独立 userData 与仓库外目标项目、预检「9222 由贪吃蛇占用/9223 空闲」、贪吃蛇根前后只读快照、决定性证据后 halt、9223 释放无 Electron 残留）；`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md:156-167`（9223 硬约束、不得占用贪吃蛇临时根/目标项目，必要时停止改用隔离实例）。
- 方案 AC-J10/A-J11 已含真实 Electron+Claude+UI 与开关开/关场景（`:483-484`），但缺运行安全/收尾标准。

**建议：** 把 AC-J12 扩为可检查项：CDP 端口 9223；独立 `--userData`；仓库外独立目标项目根；预检/后检（9222 与贪吃蛇根零改动、9223 占用/释放、无 Electron 残留）；预算与停止（决定性证据后立即 halt、模型调用上限、超时）；运行前后 `git status` 仅允许写集变化。

### F6（suggestion）FreezeService 构造细节未点明

**依据：** `freeze-service.ts:99-101` 在 `customerReason && !delegated` 时强制 `decisionId`；`:124` 在 `customerReason && !delegated` 时展开 `decidedBy:"customer"`；`:129` 以 `isValidDocFreezeRecord` 兜底。judge 分支若不同时豁免这两处，会分别得到「必须带 decisionId」失败或一条带 `decidedBy:"customer"` 的非法记录（被 :129 拒绝，fail-closed 但错误信息笼统）。

**建议：** 在 I-21 明确写出：`customerReason && !delegated && !judged` 才要求 decisionId；`decidedBy:"customer"` 展开条件同样加入 `!judged`；judge 记录建议显式构造而非依赖展开，避免未来重构回归。

### F7（suggestion）engine 校验与账本 judge 审计形状

**依据：** 方案 §3.2 为保持 `version-change.ts` 仅依赖 `./trunk.ts` 的纪律（该纪律见 `version-change.ts:5-14`，实测成立）把 `engine` 定为 `string`；`isJudgeDelegatedSource` 只能做字符串自洽（`operatorId === "judge:"+engine`），无法限定 `RuntimeKind`。同时 `task-state.ts:431-473` 对 `request.resolved` 的 `judge` 字段没有任何结构校验（不校验 engine/reasonCode/cardKind/group）。

**建议：** `isJudgeDelegatedSource` 至少要求 `engine` 非空；在 §3.3/§3.5 的账本重放校验中已依赖 `resolved.judge.*`（方案已写），可再建议在 `task-state.ts` 的 `request.resolved` 分支加最小 judge 审计结构校验（engine/reasonCode 非空字符串、cardKind 在白名单、group ∈ {approval,decision}）作为纵 defense-in-depth；若判定超出本变更暴露面，请在 §9 残余风险中显式记录该信任边界。

### F8（suggestion）「全部命中均已逐条归类」过强，建议附录化其余 judge 命中

**依据：** 方案 `:169` 声称全仓 grep 的全部命中均已逐条归类。独立 grep 抽查发现以下 judge/来源相关命中未在 48 条表中逐条出现（经核对均**不需改**，非遗漏的拒绝点）：
- `app/desktop/download-request.ts:176-199`（下载卡 judge 归因，已支持 judge）；
- `src/provider/runtime/tools.ts:1976`（`operatorId:"judge:"` 分流）、`:2413`（下载审批来源校验含 judge）；
- `src/common/编排/shell-escalation.ts:209`、`shell-gate.ts:1149/1197/1262`（approval 组 shell 判断审计，非客户决策卡）；
- `src/common/编排/run-manifest.ts:921`（run-change `decidedBy` 允许 judge；run-change 由 `isApplicationDecisionReservedForCustomer` 保持客户主权，judge 不会结算）；
- `src/pipeline/orchestration/trunk-runtime.ts:1399-1411`（trunk.state reconcile 仅回放 customer 绑定，不伪造）；
- `src/service/trunk/impl/refreeze.ts:33-51`（高危重新冻结要求客户 decisionId，非 judge 卡路径）；
- `src/pipeline/orchestration/stable-write-runtime.ts:127/333`（stable-write 客户主权）；
- `src/pipeline/orchestration/version-change-runtime.ts:167/221`（VCA/修正案客户事件）；`apply-journal.ts:192`（trunk.state 审计）。

**建议：** 增加「其余 judge/来源命中（不需改）」附录逐条列出并说明理由，使「全部归类」可审计；或在 §2 把该句限定为「与拒绝/强制 customer 相关的命中」。

### F9（suggestion）[推断] 可升级为 [事实]（judge 不结算 appointment/proposal/acceptance）

**依据：** §9.1 `:508` 标 [推断]。代码可证成：`customer-input.ts:1776-1780`（acceptance/proposal/appointment/decision 均 `isChiefBusinessCard`）+ `:2045-2050`（这些卡先走 `tryChiefDecision`，失败也只 `presentNow`，不落 `planJudge`）+ `:1334`（`decision` 卡种显式排除）+ `model/runtime.ts:943-956`（`intent-confirm` 是 decision 组中唯一非 chief 业务卡的卡种）⇒ judge 只接 `intent-confirm` 与 approval 组 `download`。`proposal-confirmed` 无生产者也已核实：`src`/`app` 中该字符串仅出现在 Model/FreezeService 合成、渲染标签与测试，无 `freeze()` 调用方。

**建议：** 把该条标注升级为 [事实] 并附上述代码行；同时说明 `optional-acceptance.test.ts:239` 的陈旧期望（见 F2）是该语义漂移的遗留断言，避免复核者/实施者误以为 judge 仍会结算 acceptance。

### F10（suggestion）C-05 引用路径勘误落地

**依据：** 方案 `:9`、§9.8 `:515` 已如实标注 `docs/acceptance/entry-role-minimal-criteria-v1.md` 不存在，并给出可核同源条目 `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`（本次实测该行原文与哈希均与方案引用一致）。

**建议：** 把「由沟通更正意图记录引用」写为实施前动作（沟通记录或勘误行），并在实施/验收包中引用更正后的路径，避免验收时再出现「依据不可核」。

### F11（suggestion）「单实现」不变量与局部实现表述的张力

**依据：** §4.9 `:365` 称「D3 参考值、冻结不变量、judge 来源校验各只有一份实现」；§3.7 `:322-327` 又允许「具体函数可局部实现但条件必须一致」。二者对 judge D3 校验（非参考值）表述不一致。

**建议：** 二选一：(a) 在 `src/model/runtime.ts` 增加 `isJudgeD3Resolution(event)` 谓词，供 apply-journal/trunk-runtime/classify-shell 共用；或 (b) 把 §4.9 改为「参考值与 Model 不变量各只有一份；D3 judge 条件以 J8/J9/J11 用例钉住一致」。推荐 (a)，与 AC-J9「source grep」目标一致。

### F12（suggestion）J 矩阵与 §5.2 的任务映射缺口

**依据：** §5.2 `:399` 计划在 `test/编排/task-state.test.ts` 新增 `doc.freeze` judge 正/负例（该文件当前确无 doc.freeze 用例，实测 grep 为空）；但 §6.2 J1–J15 没有对应 J 项，I-25 亦然。另有既有 `test/编排/trunk-events.test.ts:100-292` 是 doc.freeze 合法/非法行的账本校验套件（含 customer/application 负例），方案 §6.3 未点名其回归。

**建议：** 增加 J16（`doc.freeze` 账本 judge 正/负例）与 J17（`freezeEvents` 镜像/既有事件字节不变），或把 §5.2 的 task-state 用例并入既有 J3；§6.3 补列 `test/编排/trunk-events.test.ts`「保留且须继续通过」。

### F13（suggestion）冻结来源摘要字段缺显式长度上界

**依据：** 方案 `:221` 称 `reason/selected/model` 只做「有界摘要」，§9.6 `:513` 称「只复制有界字段」，但未给数值上界；`GovernanceJudgeAudit.reason` 由驱动返回，长度未在 Model 层限定。

**建议：** 明确上界（例如 `reason` ≤ 200 字符，与 `session.ts:5827` 对 `request.resolved.reason` 的 `shortenSummary(...,200)` 口径对齐；`selected` ≤ 卡选项数；`model` ≤ 64 字符），并在 `isJudgeDelegatedSource`/冻结生产处强制，避免 R9 baseline 膨胀（§9.6 的目标）。

## 3. 逐项复核结论（对应复核重点 1–7）

### 3.1 清点完整性（重点 1）——总体通过，附 F3/F8/F9 备注

- 48 条（替 23/留 25）逐行核对：表内每条 `file:line` 与现行行为均相符（抽查与全读结合，含 I-01..I-16 全部、I-17..I-29、I-30..I-38、I-39..I-48 的代表项）。关键点实测：
  - `finalizeIntentConfirmation` 的 `outcome.judge` 立即拒绝：`apply-journal.ts:3337-3338`；customer 强制：`:3362`；chief 形状：`:3356-3360`；`isValidDocFreezeRecord` 复验 `:3366`。
  - `verifyReviewIntent` 来源集：`:1677-1678`；requestId 提取 `:1687`；customer/chief 分支 `:1695-1699`。
  - 二次冻结筛选：`:694-696`、`:1304-1306`。
  - `confirmsMigratedIntent`：`guard-freeze-registry.ts:404-423`；`readConfirmedIntentEvidence` `:476-495`（`:489` 调用复核）。
  - D3：`apply-journal.ts:3186`、`:3200-3202`、`:3429-3432`、`:3536-3543`；`trunk-runtime.ts:724-732`；`classify-shell.ts:517-541`。
  - 模型：`version-change.ts:216`、`:232-251`、`:267-293`、`:202-214`；`runtime.ts:1738-1753`。
  - `doc.freeze` 账本校验：`task-state.ts:822-854`；镜像：`version-change-runtime.ts:176-195`。
  - 排除项核实：VCA/修正案 `vca-service.ts:542-545`、`:566-586`、`:687-707`；bootstrap `run-manifest.ts:666-690`；`project-state.ts:94` 已含 judge 但版本决策卡被主权清单排除（`customer-input.ts:363-385`）；下载 `download.ts:98-103`、`download-request.ts:613`；需求变更 `interface.ts:1644-1674`；版本决策审计 `version-decision.ts:456`；UI `version-change-view.ts:354-364`、`version-change.ts:622-633`。
- `proposal-confirmed` 无 producer：独立 grep 证实（`src`/`app` 无该 reason 的 `freeze()` 产生路径）——方案说法属实。
- acceptance/decision/appointment 卡：未发现按 `request.resolved.by` 的来源拒绝或 customer/decisionId 强制点（`app/desktop` 无 `resolved.by` 读取）；但 acceptance 的**结算路由**与陈旧测试冲突，见 F2/F9。
- 桌面归因/工具回执：`session.ts:5769-5829`（`:5799-5801` decisionId 生成并回填、`:5822` by、`:5828` judge 审计）、`tools.ts:2681-2698` 与方案一致。
- 结论：**未发现被方案遗漏的「judge 被拒/强制 customer/decisionId」类改点**；F8 的不在表命中均为已支持 judge 或不同域路径。

### 3.2 judge-delegated 形状与审计真实性（重点 2）——通过，附 F4/F6/F7/F13

- `JudgeDelegatedSource` 的每个字段都可从真实 `request.resolved`/`CustomerInputOutcome.judge` 对账：`requestId`（`RequestResolvedEvent.requestId`，`runtime.ts:1487`）、`engine/model/reasonCode/reason/selected/confirmed/cardKind`（`GovernanceJudgeAudit`，`:3007-3022`）、`at`（事件基类 `at`）。`operatorId` 的真实生产值为 `judge:<engine>`：`customer-input.ts:1626-1633` 写入 `operatorId: judge:${outcome.engine}`，`session.ts:5825` 原样落账；冻结侧要求 `resolved.operatorId === outcome.operatorId === "judge:"+judge.engine` 与此一致，**不伪造**。
- `judge` 分支对 `outcome.judge` 与 `resolved.judge` 做 canonical 全等比较，并要求 group/cardKind 合法——与 `session.ts:5828`（写入同一审计对象）兼容。
- **decisionId 不写入冻结**：与 `isValidDocFreezeRecord` 新增分支「decisionId/decidedBy/actorRoleId 均缺省」兼容；真实 `decision-<requestId>` 只保留在账本与 D3 授权证据。旧记录（customer/application/role-direct/chief-delegated）不受新分支影响（`version-change.ts:282` 之前的分支逐字保留，实测结构）。
- `applicationId` 用 `requestId`：与 intent-confirmed 的既有生产者/复核一致（见 F4 的双约定说明）。
- `buildDocFreezeRecord` 兼容性：需按 F6 明确两处豁免；模型兜底 `:129` 保证 fail-closed。

### 3.3 边界/不变量（重点 3）——通过

- judge 仅允许 `intent-confirmed`/`proposal-confirmed`：`DOC_FREEZE_JUDGE_DELEGATED_REASONS` 为 `DOC_FREEZE_CUSTOMER_REASONS` 子集，VCA/version-upgrade/detail/amendment/stable 均不在内；与客户裁定 Q5 一致。
- 回落不变：方案不改 `customer-input.ts` 的 `planJudge`/`settleJudgeOutcome`/`tryChiefDecision`；`manual`/`deny(decision 组→manual)`/`not-recommended`/`switch-off`/`unavailable` 路径（`:1387-1700`、`:1506-1509`）不受影响；关闭开关 ⇒ `isGroupEnabled` false ⇒ 原卡客户。
- 客户路径逐字不变：方案 I-03/I-04/I-05 明确拆分且保留原条件/字段；本次核对 `:3362-3364` 原文与方案一致。
- D3 统一：现有同构三元式恰为 4 处（`apply-journal.ts:3186`、`:3542`、`trunk-runtime.ts:732`、`classify-shell.ts:533`），helper 语义（customer/judge→decisionId；chief→requestId；其他 undefined）与四处逐字等价（对 judge 是新增值）；未见其它同构点。`authorization` 生产者与门禁期望形状一致（`apply-journal.ts:3200-3202` vs `classify-shell.ts:539-540`）。
- `request.resolved`/`CustomerInputOutcome` 不加 `actionSource`：与桌面 judge 产出（无 actionSource）兼容；`task-state.ts:447` 对 judge+actionSource 会拒绝（`actionSource.kind !== "customer-decision" || by !== "customer"`），未引入新形状，符合 Q8。

### 3.4 写集/owner/边界（重点 4）——本方案内部通过；跨方案见 F1

- 10 个产品文件逐一落在 boundary §1：
  - 运行时核心：`src/model/version-change.ts`、`src/model/runtime.ts`（`角色卡/运行时核心/boundary.md:9-15`）；
  - 编排：`src/service/trunk/`（含 apply-journal）、`src/service/version-change/`（含 freeze-service、abstract）、`src/provider/version-change/`、`src/pipeline/orchestration/trunk-runtime.ts`、`version-change-runtime.ts`、`src/common/编排/`（含 task-state）（`角色卡/编排/boundary.md:20-29`）；
  - 门禁引擎：`src/common/门禁引擎/classify-shell.ts`（`角色卡/门禁引擎/boundary.md:17`）。
- 测试 owner：`test/runtime-core/`（运行时核心）、`test/编排/`（编排）、`test/门禁引擎/`（门禁引擎）、`test/桌面应用/` 逐文件授权（decision-service:57、chain-enforcement:61、run-pin:62、run-change-trigger:74）、`test/测试/`（测试）——均核对存在且与方案 owner 一致（`角色卡/桌面窗口/boundary.md`、`角色卡/测试/boundary.md`）。
- 零重叠（方案内部）成立；无新增目录（除可选的新测试文件，`test/测试/` 为目录级授权）。**但跨方案存在重叠（F1）。**
- 未误列/漏列：`app/desktop/*`、`run-role.ts`、`tools.ts`、`vca-service.ts`、`model/trunk.ts` 的排除经核对合理（这些文件对 judge 结果已兼容或无拒绝点）；`versioned-doc-guard.ts` 仅 type-import 无需改（`:33-43` 实测 export 单一来源）。

### 3.5 契约变更（重点 5）——通过，附 F2

- AC-31/F35 修订显式：§6.1 `:420-429` 明确「customer 类 reason 在 judge 代批时可为 judge-delegated、无 decidedBy/decisionId、客户路径不变、由独立验收确认」，并给出契约来源 `trunk-amendment-model-criteria-v1.md:205`（实测 AC-31 行）。
- 「无既有断言需放宽」抽查属实（就本变更语义而言）：全仓未发现「judge 必须被 `finalizeIntentConfirmation` 拒绝」或「judge D3 必须被拒」的断言；`test/runtime-core/version-change-contract.test.ts:171` 的 reason 九类分区断言不因新增 origin 变化（judge 子集是**新常量**，不入 `DOC_FREEZE_REASONS`）；R3/G2 负例列表不含 judge origin。既有 `by:"judge"` D3 fixtures（`run-pin.test.ts:180/282/291`、`chain-enforcement.test.ts:293/335`、`run-change-trigger.test.ts:213`）与方案约定一致（decisionId=`decision-<requestId>`），无需改写。
- **但**「旧套件全绿」前提不成立（F2）。

### 3.6 测试与 B1/真实运行（重点 6）——基本覆盖，附 F3/F5/F12

- J1–J15 覆盖：模型正/负（J1/J2）、Service（J3）、finalize 正/负（J4/J5）、customer/chief 回归（J6/J7）、D3 正/负/下游（J8/J9/J10）、门禁（J11）、桌面回归（J12）、主权（J13）、回落（J14）、真实文件链+旧记录（J15）。审计真实性由 J2/J4/J5 断言支撑；回落由 J14。
- 缺口：I-24/I-25 未入 J 矩阵（F3/F12）；B1 真实运行标准缺 9223/独立根/预算/停止（F5）。
- 真实运行只承诺证据：AC-J10 要求真实 Electron+Claude+UI、真实账本与诊断证据；AC-J11 关闭开关回退；方向符合意图记录，建议按 F5 补齐安全/收尾项。

### 3.7 Q 清单/残余风险（重点 7）——通过，附 F9/F10

- Q1–Q8 默认值与客户裁定一致：命名 `judge-delegated`；不写 decisionId；旧缺 decisionId fail-closed；proposal 纳入模型不增 producer；UI 不改；D3 用真实 decisionId；VCA/修正案不允许；resolved 不加 actionSource。未发现与意图记录冲突。
- `proposal-confirmed` 无 producer（已核实）与 D3 judge 防御性扩展的定性合理；建议按 F9 升级标注并补代码行。
- C-05 路径不存在已如实披露（§9.8），建议按 F10 落地勘误。

## 4. 已核实为真的方案事实（抽查清单）

1. 交互层已如实产出 judge：`customer-input.ts:1598-1635`（audit/operatorId）、`session.ts:5776-5781`（judgeOrigin/judged）、`:5799-5801`（decisionId 生成并回填 outcome）、`:5822`（by）、`:5828`（judge 审计）。
2. 下游拒绝：`apply-journal.ts:3337-3338`（outcome.judge）、`:3362`（非 customer/有 judge 即拒）；`run-role.ts:1624-1639` 调用与 pending-recovery 标记。
3. 模型限制：`version-change.ts:216`（4 值 origin）、`:232-251`（source?: DirectActionSource）、`:267-293`（校验）；`runtime.ts:1738-1753`（DocFreezeEvent 同限）。
4. 服务限制：`freeze-service.ts:85-131`（customer 必须 decisionId+decidedBy；applicationId 合成）。
5. 复核/读取限制：`apply-journal.ts:1677-1678/1687/1695-1699`、`:694-696`、`:1304-1306`；`guard-freeze-registry.ts:404-431`、`:476-495`。
6. D3 限制：`apply-journal.ts:3186`、`:3431`、`:3536-3543`；`trunk-runtime.ts:727-732`；`classify-shell.ts:520-541`。
7. 主权/回落：`customer-input.ts:363-400`、`:1046-1073`、`:1331`、`:1334`、`:1506-1509`、`:1776-1780`、`:1915`；`version-change.ts:407-420`（sovereignViolation 实际在 `:410-414`，方案引号区间包含之）。
8. 开关接线：`app/main.ts:602`、`:626-628`；`GOVERNANCE_CARD_GROUP`（`runtime.ts:943-956`）与 `isChiefBusinessCard`/`presentEntryNow` 共同证明 judge 当前仅接 `intent-confirm` 与 `download`。
9. 文档哈希：意图记录/预授权/C-05 同源条目/AC-31 契约四个 SHA-256 与方案引用逐一相符（见 §0）。

## 5. 未检查事项与限制

- 未运行完整测试套件/类型检查/构建；只对 `test/桌面应用/optional-acceptance.test.ts` 做过一次只读基线运行（§F2），其余测试结论来自静态核对。
- 未实现/未运行方案设计，无法验证 judge 冻结全链的真实运行行为；§3.3/§3.5 的“可实现性”判断基于静态代码与既有不变量。
- 未读取贪吃蛇真实运行的外部证据（仓库外路径），方案 §1.1 的真实运行事实按意图记录与方案陈述采信，未独立复核。
- 行号均为 `c1439ce` 快照；`origin/main`（`9ffeb1e`）的 src/app/test 与快照一致，但其它并行方案合并后可能漂移。
- 未审阅方案的全部邻近文档（如 `docs/planning/2026-11-04_design_trunk-amendment-model.md` 全文），仅核对了 AC-31/F35 相关段落。
- 本记录不对方案是否满足客户意图、是否可验收做判定；F1/F2 的 must-fix 为建议级。

## 6. 复算与证据

### 6.1 复核执行证据

- `sha256sum` 方案/意图/预授权/C-05/AC-31 文档：与 §0 一致。
- `git diff --stat 65813c9..HEAD -- src app test`：空（方案基线声明属实）。
- `git diff --stat c1439ce..origin/main -- src app test`：空（基线内容等于当前 main 内容）。
- `node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`：`# tests 6 / # pass 2 / # fail 1 / # cancelled 3`；`not ok 1/4/5/6`（1 为断言失败，4/5/6 为 `testTimeoutFailure`）；定向 `--test-name-pattern "验收卡由判断"` 8,007ms 超时（测试 `:239`）。该结果在 `c1439ce` 与 origin/main 同内容上成立，属预存基线（见 F2）。
- 最小只读探针（`node --input-type=module -e`，未落盘）：acceptance 卡在无 delegation 时 `customerInput` 挂起等待客户、judge 调用数 0，证实 F2 的确定性成因。
- 只读 grep 口径：`outcome.judge`、`resolved.judge`、`by !== "customer"`、`by === "customer"`、`decidedBy`、`origin`、`proposal-confirmed`、`intent-confirmed`、`DOC_FREEZE`、`d3DecisionId`、`readConfirmedIntentEvidence`、`source.kind`、`doc.freeze`、`isChiefBusinessCard`、`tryChiefDecision`、`planJudge` 于 `src/`、`app/`、`test/` 的命中均人工过目归类。

### 6.2 本记录快照

- 文件：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（本文件；写入时未跟踪）。
- 复核对象快照：方案 SHA-256 `60c68dad…cbc8a`；代码 HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`。
- 问题计数：**13 项**——must-fix 2（F1/F2）、general 3（F3/F4/F5）、suggestion 8（F6–F13）。

## 7. 复核结论（建议，非验收）

**建议修订后提交。** 方案的核心设计（诚实 `judge-delegated` 来源、账本逐字段复核、客户/chief/回落/Q5 全部不变、D3 共享 helper）在本检出上自洽且证据充分；但 F1（跨方案协调事实）与 F2（基线测试非全绿、AC 口径不可达）必须在提交/派发前修订，F3–F5 建议同步修订，F6–F13 可按实施/验收阶段吸收。修订后可进入方案确认与 B1/实施编排。

---

## 8. 再复核记录 P1.0→P1.1（窄复核）

- 复核对象：方案 P1.1 `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（674 行 / 84,483 bytes / SHA-256 `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`；实测一致）。P1.0 历史（550 行 / 59,176 bytes / `60c68dad…cbc8a`）按 R1.0 记录采信。
- 复核范围：仅 R1.0 F1–F13 的处置与 P1.1 新增内容（窄复核）；R1.0 已核实且 P1.1 未改动的部分不重复复核。代码基线 HEAD `c1439ce`（`git diff --stat 65813c9..HEAD -- src app test` 为空；`git status --porcelain -- src app test` 为空）。
- 本记录性质同 R1.0：建议、非验收；未改方案/代码/测试/角色卡/边界；未提交/推送；只读执行一次基线测试（§8.8）。

### 8.1 结论（建议）

**建议提交（可进入方案确认与 B1/团队计划编排）。** F1、F2 两项 must-fix 已修订并经独立核实；F3–F5 general 与 F6–F13 suggestion 的处置已落地或给出可接受理由；P1.1 未引入新的 must-fix。剩余 1 项 general（G1：F13 摘要截断与账本重放「逐字段一致」口径矛盾）与 3 项 suggestion（S1–S3，均不阻断），建议在 B1/实施前以文字澄清/补记。

### 8.2 F1（must-fix）复核——已闭合

- **三文档事实一致**（[事实]，只读核对）：
  - 提案卡修复路由 `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md` = 183 行 / 32,508 bytes / `4e8fb354…`；写集 A′＝`apply-journal.ts`＋`test/编排/direct-role-capabilities.test.ts`，B＝`app/desktop/customer-input.ts`＋`test/桌面应用/chief-workflow.test.ts`；串行建议 A′ 先行、B 紧随（其 §五 `:114-118`、§八 `:182`）。与 P1.1 §10.1/§10.2 一致。
  - 文档格式方案 `docs/planning/2026-11-09_design_document-format-specifications.md` = 786 行 / 99,718 bytes / `0469e2df…`；其 §10.1 `:731` 确将本方案描述为改 `app/desktop/customer-input.ts`、`app/desktop/session.ts`、`run-role.ts`（§10.2 `:738`/`:740` 同向），§10.3 `:751` 自述「先完成/合并 judge 代批与提案卡修复」、`:738` 自述「本变更最后合并/最后编辑」。P1.1 的勘误与串行建议（提案卡修复 → 本方案 → 文档格式）与两文档自述一致。
  - **真实重叠仅 `src/model/runtime.ts`**：本方案写集（§5.1）不含任何 `app/desktop/*` 产品改动、不含 `run-role.ts`/`test/桌面应用/session.test.ts`；文档格式方案对上述文件独占；双方仅 `src/model/runtime.ts` 同文件（不同区域，串行写）。[事实] 核实成立。
- **勘误知会动作明确**：P1.1 §10.1 末段（`:602`）要求随方案提交知会统筹/沟通并写入协调记录或调度回执；§10.2（`:623`）规定「在协调记录（含上述勘误知会）落地前不派发实施」；结论（`:674`）再次列为实施前条件。可执行。
- 残余（S3，suggestion）：§10.1 提案卡修复写集未记其路由文档 §五「如需小助手亦限 `src/common/编排/`」的目录级余量；该目录与本方案 `task-state.ts` 同目录不同文件，冲突概率低，建议在协调记录写集描述中补一句。

### 8.3 F2（must-fix）复核——已闭合

- **复核复跑**（只读，HEAD `c1439ce`）：`node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts` ⇒ `# tests 6 / # pass 2 / # fail 1 / # cancelled 3`，`not ok 1/4/5/6`，与 §6.5 记录一致；`not ok 4` 即 `:239`「开关开启：验收卡由判断 agent 代选推荐项」（R1.0 定向运行 8,007ms 超时，本轮同型超时）。
- **确定性成因复核**：`app/desktop/customer-input.ts:1776-1780`（`isChiefBusinessCard` 含 acceptance）、`:2045-2050`（先 `tryChiefDecision`，失败即 `presentNow` 返回，不落 `planJudge`）、`:1792`（无 delegation 时 `tryChiefDecision` 返回 false）与 §6.5 描述一致；历史锚点 `e71501c`/`0908746` 属实（`git log` 实测）。
- **可判性**：AC-J3 / §6.3 `:508` / §7「基线口径」（`:548`）统一为「记录基线逐条对照、不得新增确定性失败/新 skip、预存红项不得恶化」，且 §6.5 明确不在本写集修复、禁止改 `app/desktop/customer-input.ts`。B1 可按 §6.5 清单逐条对照，口径可判、可执行。
- 残余：无。

### 8.4 F3–F5（general）复核——均已落地

- **F3**：I-24/I-25 标注「防御/一致性、无当前生产者」；§3.6 论证复验为真——[事实] `kind:"doc.freeze"` 生产者全仓仅 `version-change-runtime.ts:176`（`freezeEvents`）与类型 `runtime.ts:1740`；`freezeEvents(` 调用点仅 `:787`（VCA approve）与 `:925`（detail apply）；`vca-service.ts:489-497`/`:572-580`/`:697-705` 三处 freeze/freezeMany 输入均**不含 `source`**；judge 冻结经 `appendDocFreezeRecords`（`guard-freeze-registry.ts:604-609`）→ `appendBaselineRecords("frozen")` 只写 R9 baseline，不产生 `doc.freeze` 事件。J16/J17、§6.3 的 `trunk-events.test.ts` 回归、Q10 均已补。落地。
- **F4**：双约定勘误点核实——Model 注释 `version-change.ts:235-237`（proposal-/intent-`<decisionId>`）、`freeze-service.ts:108-114` 按 decisionId 合成；intent-confirmed 实际生产/复核按 requestId（`apply-journal.ts:3359`/`:3363`、`guard-freeze-registry.ts:409` `intent-${requestId}`）；注释勘误目标 `version-change.ts:174-175`、`:235-237`、`freeze-service.ts:11`/`:74` 均属实。§3.2/§3.4/§3.10/§6.1/§9.11 已显式勘误。落地。
- **F5**：AC-J12 已含 CDP 9223、独立 `--userData`、仓库外独立目标根、前后检（9222 与贪吃蛇根零改动/9223 释放/无 Electron 残留）、预算与停止（客户消息与卡数上限、墙钟 ≤20 分钟、首个决定性证据即 halt、不自动重试）、`git status` 仅写集变化；与文档格式方案 §7.4（`:657-669`，9223 隔离协议）对齐属实。落地。

### 8.5 F6–F13（suggestion）复核

| # | P1.1 处置核实 | 判定 |
|---|---|---|
| F6 | I-21/§3.4 点明两处豁免：`freeze-service.ts:99-101`（customer 类必须 decisionId）、`:124`（`decidedBy:"customer"` 展开）、`:129` 兜底；行号与条件属实；judge 记录显式构造 | 落地 |
| F7 | 部分吸收：`isJudgeDelegatedSource` 强制 engine 非空；`task-state.ts:430-455` 不加 judge 审计结构校验的理由（避免追溯拒绝历史事件）与补偿（新冻结/授权路径账本重放逐字段核对）记录于 §3.6/§9.9 | 合理；另见 S1 |
| F8 | §2 措辞收窄 + §2.1 九行「其余命中」附录；抽查 `run-manifest.ts:921`（run-change `decidedBy` 允许 judge）、`trunk-runtime.ts:1399-1411`、`refreeze.ts:33-51`、`stable-write-runtime.ts:127/333`、`apply-journal.ts:188-196`、下载卡三处均属实 | 落地 |
| F9 | §9.1 升 [事实] 并补 `customer-input.ts:1776-1780`/`:2045-2050`/`:1334`、`runtime.ts:943-956`；`proposal-confirmed` 无 producer 复验（仅 Model/FreezeService/渲染与测试命中）；`optional-acceptance.test.ts:239` 陈旧断言已链接 | 落地 |
| F10 | 头部依据与 §9.8 将 C-05 路径勘误落为实施前动作；`docs/acceptance/entry-role-minimal-criteria-v1.md` 确不存在（实测） | 落地 |
| F11 | 共享 `isJudgeD3Resolution` + `requestResolvedD3DecisionId`；[事实] 现存同构三元式恰 4 处（`apply-journal.ts:3186`、`:3542`、`trunk-runtime.ts:732`、`classify-shell.ts:533`）；§4.9/§5.1/§6.1/AC-J9 同步；`runtime.ts:56` 已导入 `./version-change.ts`、`apply-journal.ts:3343` 已有同型 `Extract<TaskStateEvent,…>` 用法，helper 落位可行 | 落地 |
| F12 | J16（`doc.freeze` judge 正/负例；`test/编排/task-state.test.ts` 现确无 doc.freeze 用例）与 J17（`freezeEvents` 镜像/字节不变）入矩阵；§6.3 点名 `test/编排/trunk-events.test.ts`（确为 doc.freeze 账本套件，`:118` 起）回归 | 落地 |
| F13 | 上界 `reason`≤200/`model`≤64/`selected`≤卡选项写入 §3.2/§3.4，J2 含超界负例；`session.ts:5827` `shortenSummary(...,200)` 属实 | 落地，但引入 G1（见 §8.6） |

### 8.6 新增问题评估（P1.1 引入/残余）

- **G1（general，建议 B1 前文字澄清）**：§3.2「`reason`≤200/`model`≤64，**生产时截断**」与 §3.5「source 的 `engine/model/operatorId/reasonCode/reason/selected/cardKind` 与账本**逐字段一致**」（I-09/I-13 同旨）存在口径矛盾：账本 `request.resolved.judge` 为原始审计对象（`session.ts:5828` 原样写入，未截断；`task-state.ts` 亦不改写），若账本 `reason>200`/`model>64`：生产端截断后重放逐字段相等将失败 ⇒ 冻结已写入但 `verifyReviewIntent`/`confirmsMigratedIntent` 拒绝，重新落入 pending-recovery（与本变更目的相反）；若生产端不截断而由 `isJudgeDelegatedSource` 拒绝，则超界 judge 代批完全不能生效。建议明确归一化契约：生产端 `source.reason=shortenSummary(judge.reason,200)`、`model` 同理截断，重放/复核以同一归一化函数对账本字段处理后比对（或提高/取消冻结侧上界）；J2/J4/J5 增「账本超界 + 截断后冻结/复核通过」用例。属措辞/实现契约澄清，不改设计方向。
- **S1（suggestion）**：§3.7 `isJudgeD3Resolution` 草图直接访问 `judge.engine`，对 `judge:null` 不设防；`classify-shell.ts:517-529` 的 D3 证据字节为 `JSON.parse` 结果且未经 `validateTaskStateEvent`（且 task-state 对 judge 审计无结构校验，见 F7）。`judge:null` 时草图会抛 TypeError：`checkGitPolicy` 外层 `try/catch`（`:1029-1103`）兜底为 `git-policy-invalid-facts`（fail-closed），apply-journal 亦有外层 catch，但错误码笼统、不可归因。建议草图加 `judge === null || typeof judge !== "object"` 防护，使拒绝确定。
- **S2（suggestion）**：§3.2「超界即拒绝**或**按上界截断」未钉死单一策略；与 G1 一并确定（推荐：生产截断 + `isJudgeDelegatedSource` 拒绝原始超界构造 + 重放按归一化对账）。
- **S3（suggestion）**：同 §8.2 残余——协调记录补记提案卡修复「如需小助手亦限 `src/common/编排/`」的目录级写集余量。
- **新增契约/数据模型/写集/测试缺口评估**：P1.1 相对 P1.0 未新增产品文件、未新增数据模型种类、未改跨角色写集（仍为 §5.1 十文件 + 测试；两个共享 helper 落在既有 owner 文件 `src/model/runtime.ts`）；I-24/I-25 的测试缺口已由 J16/J17 补齐；新增 helper 由 J8/J9/J11/AC-J9 覆盖。**未发现新的 must-fix、未映射改点或新测试缺口。**
- **Q 残余**：Q3（旧 judge 记录缺 `decisionId` fail-closed）合理且不需升级；Q9（acceptance 在「替我决策」下的语义归属）保持「按现行代码、交沟通确认」即可，**不阻断本方案 B1**（AC-J10/J11 不依赖 acceptance 路由），确认前不修 `optional-acceptance.test.ts`/`app/desktop/*` 正确；Q10（I-25 防御镜像保留）理由充分（形状一致、字节不变、未来 producer 免再改），不需升级为 must-fix。

### 8.7 串行/冲突可执行性

- 推荐次序「提案卡修复（A′→B）→ 本方案 → 文档格式」与提案卡路由（A′ 先行、B 紧随）及文档格式方案 §10.3（先 judge+提案卡、自己最后编辑/合并）一致；矩阵 `apply-journal.ts`/`test/编排/direct-role-capabilities.test.ts`（提案卡 → 本方案）与 `src/model/runtime.ts`（本方案 → 文档格式）单写者安排可执行。
- 前置条件明确：协调记录（含勘误知会）落地前不派发实施（§10.2）；P1.1 已把文档格式方案 §10.1/§10.2 对本方案的误述列为勘误并交协调方核对（含其表格其余文件描述）。判为**可执行**。

### 8.8 复核执行证据（只读）

- `sha256sum`/`wc -lc`：方案 P1.1 674 行 / 84,483 bytes / `72d36242…fab791`；提案卡路由 183/32,508/`4e8fb354…`；文档格式 786/99,718/`0469e2df…`；意图 35 行/`d084b5ff…`；预授权 38 行/`e2bdd96b…`；AC-31 350 行/`3c40acad…`（均与 P1.1 引用一致）。
- `git diff --stat 65813c9..HEAD -- src app test`：空；`git status --porcelain -- src app test`：空；HEAD `c1439ce`。
- `node --test --test-timeout=6000 --test-reporter=tap test/桌面应用/optional-acceptance.test.ts`：`# tests 6 / # pass 2 / # fail 1 / # cancelled 3`；`not ok 1/4/5/6`。
- grep/定点核对：`kind:"doc.freeze"` 生产者仅 `runtime.ts:1740`/`version-change-runtime.ts:182`；`freezeEvents(` 调用仅 `:787`/`:925`；`proposal-confirmed` 无生产 producer；`test/编排/task-state.test.ts` 无 `doc.freeze` 用例；D3 三元式恰 4 处（`apply-journal.ts:3186`/`:3542`、`trunk-runtime.ts:732`、`classify-shell.ts:533`）；`versioned-doc-guard.ts` 单一 export `isValidDocFreezeRecord`；`runtime.ts:56` 已导入 `./version-change.ts`。
- 限制：未运行完整套件/typecheck/构建；未实施、未运行真实模型/Electron；P1.0 历史字节按 R1.0 记录采信；行号为 `c1439ce` 快照。

### 8.9 本记录快照

- 追加前（R1.0 原文，未改写）：287 行 / 38,867 bytes / SHA-256 `6e98749bd227c6f723e70ace5200d6eaea3c5cebb777ac2ee28f06fe6a3a9b19`。
- 追加后新值（行数/字节/SHA-256）由复核回报给出（自指哈希无法写入本文；本节不改变原节任何字节）。
- 剩余问题计数：**must-fix 0；general 1（G1）；suggestion 3（S1–S3）**。
