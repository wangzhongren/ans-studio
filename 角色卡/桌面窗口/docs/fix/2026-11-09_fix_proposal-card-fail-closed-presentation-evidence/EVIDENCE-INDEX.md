# 证据索引：缺陷修复 B（materials 失败 fail-closed 呈现）

- 日期：2026-11-09；角色：ANS 桌面窗口（独立实施上下文）。
- 修复记录（F7，先于代码）：`角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md`（写在任何代码/测试改动之前；mtime 顺序见 `final-candidate-and-order.txt`）。
- 本目录只保存证据；不修改产品代码/契约。

## 1. 候选身份（证据采集时实测）

- worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；tree `262e7ba42ee646d055f65f92e640834a89addde1`。
- 候选只含本子修复两个文件（`git status --porcelain -- src app test`）：
  - `app/desktop/customer-input.ts`（修改）：before SHA-256 `b64ecfb5ebb28b1fe2273706f746880c474498bcb51948919bdc8761bfe2f029` → after `71e0cc0bb7be44257312c3421f210a88376f3ca07efcf448be54de1b8f217fa0`；
  - `test/桌面应用/chief-workflow.test.ts`（修改）：before `457214b54c9fe0dc0d5ebc354079a7e2fbfb1b5374e33c5866fce44826270866` → after `f5dd81d64cefa707a0348f16be9b2fa2e8827976ded2ae87780364e61ba450fc`。
- 公共契约/只读回归文件 zero-diff（`git hash-object` 与 HEAD 一致）：`app/desktop/session.ts`、`src/provider/runtime/tools.ts`、`src/model/runtime.ts`、`src/common/编排/run-manifest.ts`、`src/pipeline/orchestration/run-role.ts`、`test/桌面应用/optional-acceptance.test.ts`（见 `final-candidate-and-order.txt`）。
- 无新增/删除/重命名文件；未新建 `test/桌面应用/` 测试文件。
- 说明：采集过程中，另一 owner（编排，A′）曾在本 worktree 有临时工作区改动（`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts`），随后被其自行还原；最终候选只含上述 B 两文件。B 的测试/证据只覆盖 B 两个文件；`baseline-*.log` 与 `after-*.log` 为过程样本，最终结论以 `final-*.log` 为准。

## 2. 实现摘要（`app/desktop/customer-input.ts`，见 `after-customer-input.diff`）

1. `tryChiefDecision`：仅对 **证据准备阶段**（`host.prepare` 抛错、`basis` 缺失/非法）fail-closed——`failClosedPresentation()` 记诊断 `chief-decision.failed`（requestId + 原始 error；并使用既有诊断白名单键 `phase` 落 stage），再以 `settleEntry(..., { outcome:"declined", reason:<既有可操作指引 + prepare 错误原文>, notPresented:true }, "judging")` 结算；不调用 presenter、不写 `request.presented`、不写 `operatorId`/`actionSource`。
2. `host === undefined` 与 required-acknowledgment **保持既有「可接管」回退**（`chiefWaiting(contextUnavailable)`）——这是既有已确认行为，由只读回归 `test/桌面应用/decision-service.test.ts:96-117` 钉住（B 修复不得弱化既有路径）。
3. `stage === "execution"`（`host.execute` 后无有效决定）与 `respondUnsafe` 委托闸（`:2506-2508` 等价区段）逐字不变。
4. `valid()` 语义不变：迟到失败（委托关闭/revision 变化/中止/已结算）不结算、不双结算。

> 对修复记录 §4.1 括注的实现细化（如实披露）：记录写「凡在 `stage="execution"` 赋值前抛出」都 fail-closed；实施时收窄为「证据准备失败（prepare/basis）」，因为 `host` 缺失与 required-acknowledgment 是既有可接管回退且被只读回归文件钉住（B1 AC-15 要求 decision-service 回归不变）。缺陷记录要求 1 所指的「宿主绑定失败」= prepare/basis 证据准备失败，本实现完整覆盖（含 draft 绑定、证据不可用/漂移/不可读、basis 缺失）。
>
> 诊断 `stage` 落盘说明：`src/common/shared/diagnostics.ts` 的 `FIELD_NAMES` 白名单不含 `stage`（该文件在 `src/`，不在 B 写集）；为满足 B1 AC-13 的可区分性，`diagnostic.error` 同时传既有白名单键 `phase: stage`。事件名、requestId、原始 error（errorType/errorMessage）均保留。

## 3. 测试矩阵 B1–B5（全部在 `test/桌面应用/chief-workflow.test.ts`）

| # | 用例（测试名） | 关键断言 | 结果 | 日志 |
| --- | --- | --- | --- | --- |
| B1 | `B1 materials失败fail-closed：…`（通道级，含诊断捕获） | presenter 未调用；outcome=`declined`+`notPresented`+reason 含 prepare 原文且含既有指引、不含「通道未受理」；无 operatorId/actionSource；pendingCount=0；旧 id 再提交 `expired:true`；诊断 `chief-decision.failed`（requestId/phase=materials/原始 error） | pass | `final-*.log`、`iter2-b-tests.log` |
| B1（真实 SessionManager 端到端） | `W1b 真实缺材料（B）：…`（改写既有 missingEvidence 用例） | `shown.length=0`；工具回执 `cardNotPresented`（治理确认卡未发出/未向客户呈现/真实原因/请补齐后重新调用/不得声称客户拒绝或同意）；回合 2.5s 内自行结算；委托保持开启；账本 `request.created → request.resolved(choice=declined, reason, by=customer[既有约定 D4(a)], 无 operatorId/actionSource)`；无 `request.presented` | pass | `final-chief-workflow*.log`、`iter3-missing-evidence.log`、`iter4-w1b-all.log` |
| B2 | `B2 materials失败竞争：…` | prepare 在途 `delegation.set({enabled:false})` ⇒ 既有 `chiefWaiting(modeChanged)` 恰呈现一次；迟到失败不双结算（`pushed.length` 仍 1、pendingCount 1）；客户接管结算 `answered` | pass | `iter2-b-tests.log` |
| B3/B4 | `B3/B4 execution无有效决定⇒…` | execution 无有效决定 ⇒ 既有回退卡呈现且 `judgeNotice=noValidDecision`；委托开启 respond=`manualTakeoverRequired`（非空且逐字）；委托关闭 respond ok 且 `answered` | pass | `iter2-b-tests.log` |
| B5 | `B5 materials失败原因非空且如实：…` | prepare 错误原文进入 reason；空 error message 时回落 `contextUnavailable`（仍非空）；不以「通道未受理」代替 | pass | `iter2-b-tests.log` |

- 另有只读回归（既有成功路径）：`W1b 真实SessionManager…`（chief 成功代决）与 `W1b 真实无退修选项…`（execution 退修/补材）在 `iter4-w1b-all.log`、`iter5-b-and-w1b.log`、`final-*.log` 中全部 pass。

## 4. 测试计数与新旧失败对照

### 4.1 `test/桌面应用/chief-workflow.test.ts`（命令：`node --test --test-concurrency=1 "test/桌面应用/chief-workflow.test.ts"`）

| 样本 | tests | pass | fail | cancelled | skipped | exit | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 改前基线（HEAD，B 未改） | 59 | 47 | 12 | 0 | 0 | 1 | `baseline-chief-workflow.log` |
| 改后（过程样本，候选含临时 A′ 改动） | 63 | 50 | 13 | 0 | 0 | 1 | `after-chief-workflow.log` / `after-chief-workflow-run2.log` |
| 改后（最终候选 run1） | 63 | 47 | 15 | 1 | 0 | 1 | `final-chief-workflow.log` |
| 改后（最终候选 run2） | 63 | 48 | 15 | 0 | 0 | 1 | `final-chief-workflow-run2.log` |

- 新增 4 个测试（B1/B2/B3-B4/B5），**每次运行全部 pass**；`skip` 始终为 0。
- **新增确定性失败 = 0**。基线失败名单（`baseline-chief-workflow.log`）：W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W33、W34、W47 select、commit-race（含子测试 `selected`），共 12 项。改后各运行中的失败均属于以下两类：
  1. 与基线同名同因（Windows 临时目录 `ENOTEMPTY` 清理竞争 / 既有 fixture 断言）：W14、W19、W22、W23、W28×2、W33、W34、commit-race、`selected`；
  2. 运行级环境抖动：W47 select/revise（两方向互为翻转：`final-w47-isolation.log` 中 select 过、revise 因 `ENOTEMPTY` 失败；`after-flake-recheck.log` 中 revise 过、select 失败）、W29×4 + W30×2 + W35 + W36（`final-w29-w35-w36-isolation.log` 同候选隔离重跑 6/6 pass）、W10/`unmanaged`（`final-w10-isolation.log` 同候选隔离重跑 5/5 pass）、W20（`ENOTEMPTY`）。这些用例与 chief 决策 materials 路径无关，且在**同一候选**隔离重跑通过，故不构成 B 的确定性回归。
- 基线日志与最终日志均含 11 处 `ENOTEMPTY`（`baseline-chief-workflow.log` / `after-chief-workflow-run2.log`），属本机测试环境既有问题，不是本修复引入。

### 4.2 只读回归文件（逐文件，命令同上按文件）

| 文件 | 基线 | 最终候选 | 判定 |
| --- | --- | --- | --- |
| `decision-service.test.ts` | 20/20 pass（`baseline-decision-service.log`） | 20/20 pass（`final-decision-service.log`） | 不恶化 |
| `application-line.test.ts` | 3 tests / 2 pass / 1 fail（`baseline-application-line.log`） | 3/3 pass（`final-application-line.log`） | 不恶化（基线失败为该机抖动） |
| `run-change-trigger.test.ts` | 9 tests / 0 pass / 9 fail（`baseline-run-change-trigger.log`） | 9/0/9（`final-run-change-trigger.log`） | 同名同数，不恶化 |
| `pending-card-restart.test.ts` | 1/1 pass（`baseline-pending-card-restart.log`） | 1/1 pass（`final-pending-card-restart.log`） | 不恶化 |
| `optional-acceptance.test.ts`（只读对照，禁止修改） | 6 tests / pass 2 / fail 1 / cancelled 3 / skipped 0（`baseline-optional-acceptance.tap`） | 完全相同（`final-optional-acceptance.tap`） | 与 B1 BASE-3 一致；diff = 0 |

### 4.3 静态门

- `npm run typecheck` → exit 0（`final-typecheck.log`）。

## 5. 旧断言改写逐条记录（不得静默放宽）

改写位置：`test/桌面应用/chief-workflow.test.ts` 的 `realWaitingChiefLoop` missingEvidence 分支 + 测试「W1b 真实缺材料…」。

| # | 旧断言（HEAD，原文） | 新断言 | 理由 |
| --- | --- | --- | --- |
| 1 | `await Promise.race([materialWait, 2.5s 超时])`——“等卡出现” | 删除该等待；改由公共 `Promise.all([main, worker])` 2.5s 竞速证明回合自行结算 | 客户修复要求 1：materials 失败不得呈现卡；等卡本身与新契约冲突 |
| 2 | `assert.equal(shown[0]!.judgeNotice, mainT("...contextUnavailable"))` | `assert.equal(result.shown.length, 0)` + helper 内 `shown.length===0`/`pendingCount()===0` | 卡不得呈现；presenter 不得被调用（AC-9） |
| 3 | `assert.equal(channel.respond(...).ok, false, "On mode has exactly one chief executor even when material preparation fails")` | 删除（无卡可 respond）；改断言结算后同 id `respond(...).expired === true`（B1 通道级用例） | 卡未呈现 ⇒ 不存在“委托开启拒回包”的重试循环；旧断言依赖呈现前提 |
| 4 | `delegation.set({enabled:false})` 后 `respond(...).ok === true`（“主动关闭接管”） | 删除；改 `assert.equal(result.enabled, true)` 证明不依赖关闭委托 | 回合已由 fail-closed 结算自行继续；关闭委托不再是必要条件（B1） |
| 5 | `assert.equal(result.workerResults[0]?.ok, true)` + `/客户已选择/` | `ok=false` + `cardNotPresented` 语义（治理确认卡未发出/未向客户呈现/真实原因/请补齐后重新调用/不要写盘、不要声称客户拒绝或同意）+ `doesNotMatch(/客户已选择|客户已确认|未获客户同意/)` | 工具回执必须如实、不得伪造客户决定（AC-9/AC-13/B5） |
| 6 | `resolved[0].by === "customer"`、`actionSource === undefined` | 保留 `by==="customer"`（既有 lifecycle 约定，D4(a)），新增 `choice==="declined"`、`reason` 含真实错误且非空、`operatorId===undefined`、无 `request.presented`、`request.created` 仍在 | 账本按既有 lifecycle 如实反映 notPresented 结算；不新增枚举（D4(a)） |

- 未删除/弱化任何 fail-closed 断言；未新增 `skip`/force-exit；`optional-acceptance.test.ts` diff = 0。
- 旧断言原文另存 `before-missing-evidence-assertions.txt`。

## 6. 证据文件清单（本目录）

- 基线：`baseline-chief-workflow.log`、`baseline-decision-service.log`、`baseline-application-line.log`、`baseline-run-change-trigger.log`、`baseline-pending-card-restart.log`、`baseline-regression-files.log`、`baseline-optional-acceptance.tap`。
- 最终候选：`final-chief-workflow.log`、`final-chief-workflow-run2.log`、`final-decision-service.log`、`final-application-line.log`、`final-run-change-trigger.log`、`final-pending-card-restart.log`、`final-optional-acceptance.tap`、`final-typecheck.log`。
- 抖动复核：`final-w47-isolation.log`、`final-w29-w35-w36-isolation.log`、`final-w10-isolation.log`、`after-flake-recheck.log`。
- 过程样本：`after-chief-workflow.log`、`after-chief-workflow-run2.log`、`after-decision-service.log`、`after-application-line.log`、`after-run-change-trigger.log`、`after-pending-card-restart.log`、`after-optional-acceptance.tap`、`iter1-b-tests.log`…`iter5-b-and-w1b.log`。
- 候选/顺序/hash：`before-file-hashes.txt`、`final-candidate-and-order.txt`。
- 改动：`after-customer-input.diff`、`after-chief-workflow-test.diff`；旧断言：`before-missing-evidence-assertions.txt`。
