# B3a 残差 15 名：按当前有意语义更新期望（B4 同口径）

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/b3ar`（分支 `fix/test-debt-b3a-residual`，起点 `a0baea2` = `origin/main`，含 B3a #111 / B3b #112 / B3c #113 / B4 #114 / R4 #115）
- 范围：B3a 记录残差 15 名（run-pin 10、run-change-trigger 2、i-full-chain 2、`selected` 伪影 1）。
- 裁定：**按当前有意语义更新期望**（handoff 提前 pin 已删除、hub 派发必须带 flowId、worker 执行改 trunk execution preflight 冻结），逐名 dispositions；不放宽其它断言、不删用例。
- 约束遵守：只写 3 个测试文件 + 本记录/`_evidence/`；**未改产品/workflow/release.yml/角色卡/边界/其他测试**（`chief-workflow.test.ts` 与 `schema.test.ts` 未编辑）；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。

## 0. 摘要

1. **复现与 B3a 残差一致**：B4 合并后三文件仍为 run-pin 10/20 fail、run-change 2/10 fail、i-full-chain 2/2 fail（日志 `_evidence/repro-*.log`），失败名与 B3a `08-remaining-names.txt` 的 14 个本机红逐名相同。
2. **14 名全部转绿（3× 自然退出，零新增失败）**：
   - run-pin：10/10 目标名绿（整文件 20/20 ×3）
   - run-change-trigger：2/2 目标名绿（整文件 10/10 ×3）
   - i-full-chain：2/2 目标名绿（整文件 2/2 ×3）
3. **`selected` 伪影无需处理**：按 B4 记录，该裸名实属 `test/桌面应用/chief-workflow.test.ts` 的 W5 子测试（B4 已按显式 legacy 修好）；本轮只读复跑 `--test-name-pattern="selected"` 1/1 绿（`_evidence/chief-workflow-selected-check.log`）。**未编辑该文件**。
4. **无剩余名、无「无法落 B4 口径」的用例**。`npm run typecheck` **EXIT=0**（`_evidence/typecheck.log`）。
5. 未发现需要改产品的缺陷；所有旧断言冲突均属测试假设滞后于 e71501c/v2.0.0 当前契约。

## 1. 复现（改前，B4 合并后）

命令：`node --test --test-timeout=120000 <file>`（Node v24.22.1，Windows 11 x64）。

| 文件 | tests/pass/fail | 失败名 |
| --- | --- | --- |
| `test/桌面应用/run-pin.test.ts` | 20/10/10 ×1 | M1/M2/M3 共享 draft+handoff pin、D3 卡种收口、缺 D3 pin 失败受理、P1.1 pending draft 领养、R2 handoff 无 flowId、R2 run 账本不可用、AC-2.8 哈希漂移、AC-2.8/R2 roster 失败、AC-2.6 legacy flow、P1-R-08-R1 roles 未声明（10 名） |
| `test/桌面应用/run-change-trigger.test.ts` | 10/8/2 ×1 | 派发不再自动弹 run-change、stop-and-restart 后重新 pin/恢复派发（2 名） |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 2/0/2 ×1 | 最小系统全链（v4.1）、F 终态收口（2 名） |

改前错误码与 B3a 一致：`document-planning-source-unavailable`、`chief-hub-flow-unavailable`、`worker-dispatch-source-unavailable`、`stage-request-required`（i-full-chain 空 trio 默认 fixed）。

## 2. 裁定口径与改法总则

按协调者裁定，逐名把**期望对齐当前有意语义**，不改产品、不放宽门禁：

1. **handoff 提前 pin 已删除**（e71501c）：`app/desktop/session/dispatch.ts:960-961`「Planning coordination must not require future D3… Worker execution obtains a complete immutable pin through the separate execution preflight」。chief→convener handoff 只产生 trunk planning scope（`run-hub-*`，draft），manifest 不写 `d3`、不转 `pinned`。
2. **hub 派发必须带 flowId**：`dispatch.ts:739-742` `hubPreparation && !d.flowId ⇒ chief-hub-flow-unavailable`（与 chief-workflow W36 同款门）。缺 flowId 硬拒、零任务、零投递。
3. **worker 执行改 trunk execution preflight 冻结**：`dispatch.ts:901-921` → `trunk-runtime.ts:1142 freezeExecutionRun` → `apply-journal.ts:3589 prepareExecutionRun`。legacy pinned run 无 trunk 历史证据 ⇒ `worker-freeze stage=prepare code=trunk-verify-failed … Old run lacks its historical evidence`（`apply-journal.ts:3597`）；planning-only draft ⇒ `effective-manifest-missing`。均为硬拒（不是 advisory 受理）。
4. **测试标题保留**：为保持与 B3a 残差名单逐名可追踪，标题逐字保留；标题中的旧行为描述以本记录 §3 的 dispositions 为准。
5. 对裸夹具（无真实注册生命周期/managed 客户回合/真实受派任务）继续 **fail-closed 断言**（B4 star-routing 同口径）；对可提供真实事实的路径，用产品真实 `openRoleSession` + demo script + 真实 `open(taskId)` 绑定运营受派任务，验证当前正向 planning 形态与 execution preflight 硬拒。

## 3. 逐名 dispositions

完整机读表：`_evidence/dispositions.tsv`（file / name / disposition / current-semantics / basis）。摘要：

### run-pin（10 名）

| # | 名（旧标题，保留） | 处置 | 当前语义依据 |
| ---: | --- | --- | --- |
| 1 | `run-pin：M1/M2/M3 共享 draft runId；handoff 前 pin 同一 runId；任务锚定 pinned` | 测试假设过时→按当前语义重写：M1/M2/M3 各自独立 `run-hub-*` planning run（draft）；handoff 不 pin；真实运营受派回合派 worker 被 `freezeExecutionRun` 硬拒 `effective-manifest-missing`；`contract_check` 如实显示 planning draft 且执行仍要求 `runId(pinned)` | `dispatch.ts:960-961`；`dispatch.ts:901-921`；B4 W34/W21 `run-hub-*` 先例 |
| 2 | `D3 卡种收口…manifest.d3 为真实角色集` | 产品语义保留（D3 卡种收口），pin 入口迁移：用当前 advisory 面证明 decision 卡 `targetRoleIds`（qa/customer-local）不得被读成 D3（仅 decision 卡时出现 `尚无 D3 选中角色`；真实 appointment 后消失）；handoff 仍不写 `manifest.d3` | `dispatch.ts chainDispatchFacts` `appointment/legacyAppointment` 过滤；`dispatch.ts:960-961` |
| 3 | `run-pin：缺 D3 时 pin 失败仍受理；任务锚定 draft、不伪造 pinned` | 测试假设过时→当前语义：规划不前置 D3；缺 D3 仅 `d3-missing` advisory；handoff 受理并锚定 `run-hub-*` draft；不再出现 `pin 尝试失败/run-pin-failed`，绝不写 pinned | `dispatch.ts:960-961`；`dispatch-advisories.ts d3-missing` |
| 4 | `P1.1：M1 缺 flowId 也生成 pending draft；M2 带 flowId 时领养同一 runId` | 测试假设过时→当前语义：缺 flowId 硬拒 `chief-hub-flow-unavailable`（零任务/不建 draft）；带 flowId 但裸来源 `document-planning-source-unavailable`（零任务，不再领养） | `dispatch.ts:741-742`；`dispatch.ts:889-891` |
| 5 | `R2：handoff 无 flowId 受理、省略锚点、run-ledger-unavailable` | 测试假设过时→当前语义：无 flowId handoff 硬拒 `chief-hub-flow-unavailable`，零任务，不回退 advisory 受理 | `dispatch.ts:741-742` |
| 6 | `R2：run 账本不可用时 handoff 受理、无锚点、run-ledger-unavailable` | 测试假设过时→当前语义：真实来源下 trunk planning 写入门 fail-closed `trunk-verify-failed：ENOTDIR`，零任务（不再「受理+无锚点」） | `dispatch.ts prepareDocumentScope → prepareRoleDispatch`；原型观察 |
| 7 | `AC-2.8：会话级 pinned 哈希漂移受理、advisory、manifest 未改写、任务无锚点` | 测试假设过时→当前语义：legacy pinned run 先被 execution preflight 冻结硬拒 `Old run lacks its historical evidence`；零 worker 任务、manifest 未改写、硬拒不回退 advisory | `apply-journal.ts:3597`；`dispatch.ts:901-921` |
| 8 | `AC-2.8/R2：pinned roster 失败受理、advisory、manifest 未改写、任务无锚点` | 同上；roster 失效不产生 `run-pinned-roster-invalid`/模块 advisory，freeze 硬拒先行；manifest 未改写 | 同上 |
| 9 | `AC-2.6：legacy flow 派发受理 + run-legacy-readonly + draft 锚点、旧记录可读` | 测试假设过时→当前语义：真实运营受派任务锚定同 flow 的 draft run 后，冻结仍 `effective-manifest-missing` 硬拒（planning-only 无执行工作流/团队计划）；旧 legacy 记录仍可读且如实 `runState=legacy` | `apply-journal.ts:3612-3619`；`dispatch.ts:901-921` |
| 10 | `P1-R-08-R1：pinned run 未声明 roles 时不产 run-role-missing、不锚定` | 测试假设过时→当前语义：roles undefined 不产生 `run-role-missing`（freeze 硬拒先行 `Old run lacks…`）；零任务、manifest 未改写 | `apply-journal.ts:3597`；`dispatch.ts:938-957` 被 execution preflight 取代 |

### run-change-trigger（2 名）

| # | 名 | 处置 | 依据 |
| ---: | --- | --- | --- |
| 11 | `派发不再自动弹 run-change：pinned + 新版本 → 受理 + advisory；客户卡请求数 0` | 测试假设过时→当前语义：worker 派发被 execution preflight 冻结硬拒 `Old run lacks its historical evidence`；客户卡请求数仍为 0（不自动弹 run-change），旧 run 未改写（state=pinned、runChange=undefined）、零新任务 | `apply-journal.ts:3597`；`dispatch.ts:901-921` |
| 12 | `stop-and-restart 后：新 draft run 可按 v2 文档重新 pin，并恢复派发新角色` | 保留 stop-and-restart 与显式重新 pin（`pinRun` 产品 API，roles/roster v2/proposal v2 断言保留）；「恢复派发」按当前语义改为冻结硬拒（新 legacy pinned run `Old run lacks…`），零新角色任务。夹具把卡通道改由提案会话承载，避免提前打开 convener 占用其真实任务绑定 | `apply-journal.ts:3597`；`pinRun` 仍为兼容/显式 API |

### i-full-chain（2 名）

| # | 名 | 处置 | 依据 |
| ---: | --- | --- | --- |
| 13 | `最小系统全链（v4.1）：六角色枚举 + 幕僚链首派发落 tasks.jsonl + 无 flow/gate/ledger + 运营派发作用域` | 测试假设过时→当前语义（显式 legacy/v1，B7.1 模式）：chief→product 缺 flowId ⇒ `chief-hub-flow-unavailable`；带 flowId 裸来源 ⇒ `document-planning-source-unavailable`；chief→worker ⇒ `chief-to-project-forbidden`（M8）；convener→worker 无真实受派任务 ⇒ `worker-dispatch-source-unavailable`。保留六角色枚举、零任务/零投递、无 flow/gate/ledger、fail-closed 不建任务账本 | `dispatch.ts:741-742/889-891/754-756`；`workflow-preconditions evaluateDispatchAuthorization`（M8） |
| 14 | `F 终态收口：幕僚调度验收（review 任务→质检回交→工作结果）且无自动验收派发` | 测试假设过时→当前语义：chief→verifier 属 hub 准备，缺 flowId `chief-hub-flow-unavailable`、带 flowId 裸来源 `document-planning-source-unavailable`；零任务下保留「settle/回交后无自动验收任务、无 flow/gate/ledger、无自动验收派发」判据 | 同上 |

### `selected` 伪影（1 名，不属 B3a 可修面）

| # | 名 | 处置 | 依据 |
| ---: | --- | --- | --- |
| 15 | `test/桌面应用/chief-workflow.test.ts :: selected` | **不改**（B4 已处理）：裸名经 `repoFiles[0]` 误挂 `schema.test.ts` 是族归属伪影；`schema.test.ts` 未改；`chief-workflow` 的 W5 `selected` 子测试复跑 1/1 绿 | B3a `03-schema-attribution.txt`；`_evidence/chief-workflow-selected-check.log` |

## 4. 每文件改法摘要

### 4.1 `test/桌面应用/run-pin.test.ts`（+237/−164，见 patch）

- `sourceGatedHarness` 扩展：
  - `realRoles` 选项；chief/convener 走产品真实 `openRoleSession` + `createRuntimeAdapterFactory`（demo script），其余角色保持最小 fake 句柄；
  - fake 句柄在 `send` 后补 `settled` 事件（否则投递目标长期 busy，`MAX_LIVE_SESSIONS=3` 的 LRU 会误淘汰其它活会话）；
  - `dispatchWorkerViaAssignedTurn`：真实 `open(taskId)` 绑定运营受派任务 + system 回合内脚本 `dispatch_task`，用于断言 execution preflight。
- T1：真实 convener 在 trunk planning run 之前预开（trunk 出现后保护范围 required，demo 工厂不再准入），每次 hub 派发前触碰 convener 保持 LRU 存活；断言独立 `run-hub-*`、handoff 不 pin、worker freeze 硬拒、contract_check draft/pinned 要求。
- T2/T3：handoff planning 的 D3 卡种/advisory 形态（见 §3）。
- T4/T5/T6：裸/真实来源下的 `chief-hub-flow-unavailable`、`document-planning-source-unavailable`、`trunk-verify-failed：ENOTDIR`。
- T7–T10：真实运营受派任务（追加 `task.created` 锚定 pinned/draft run）→ `worker-freeze … Old run lacks…` / `effective-manifest-missing` 硬拒；manifest 未改写、零 worker 任务。

### 4.2 `test/桌面应用/run-change-trigger.test.ts`（+80/−25，见 patch）

- harness 增加 `realConvener` 选项 + `dispatchWorkerViaAssignedTurn` + convener script/receipt 捕获；`setupPinnedRun` 增加 `openConvener?: boolean`（仅两个残差用例传 `false`）。
- T11/T12 按 §3 更新；其余 8 名（B3a 已转绿 + J12）断言未动。

### 4.3 `test/测试/governance-e2e-auto/i-full-chain.test.ts`（+66/−63，见 patch）

- 增加 B7.1 显式 `legacy/v1` 项目标记（固定被测模式，不预置文档/审批/pin）。
- 两名按当前 source 门 fail-closed 重写（§3）；删除仅服务于旧受理链的等待 helper；保留六角色/零任务/无 flow/gate/ledger/无自动验收判据。

## 5. 验证（最终状态）

| 文件 | 运行方式 | 3× 结果 | 目标名 | 退出 |
| --- | --- | --- | --- | --- |
| run-pin | 自然退出 | 20/20/0 ×3（3.95s / 3.84s / 3.87s） | 10/10 绿 | 0 |
| run-change-trigger | 自然退出 | 10/10/0 ×3（1.99s / 2.05s / 1.98s） | 2/2 绿 | 0 |
| i-full-chain | 自然退出 | 2/2/0 ×3（2.21s / 2.21s / 2.22s） | 2/2 绿 | 0 |

- **零新增失败**：三文件改后全绿；不存在「其余失败名」（改前失败的 14 名全部为目标名）。
- `npm run typecheck`：**EXIT=0**（`_evidence/typecheck.log`）。
- `selected` 伪影只读复跑：1/1 绿（`_evidence/chief-workflow-selected-check.log`）。

## 6. 剩余名 / 无法落 B4 口径者

- **无**。B3a 残差 15 名中 14 个本机红全部转绿；`selected` 为族归属伪影且 B4 后已绿，未编辑 `chief-workflow.test.ts` / `schema.test.ts`。
- 未发现需要 owner 新产品语义/裁决的用例。

## 7. 证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-b3a-residual_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `repro-run-pin-before.log` / `repro-run-change-trigger-before.log` / `repro-i-full-chain-before.log` | 改前复现（10/2/2 fail，与 B3a 残差名单逐名一致） |
| `dispositions.tsv` | 15 名逐名处置（file/name/disposition/current-semantics/basis） |
| `test-diff.patch` | 3 文件完整 diff |
| `verify-<file>-run{1,2,3}.log` | 最终状态 3× 自然退出日志（9 份） |
| `typecheck.log` | `tsc --noEmit` EXIT=0 |
| `chief-workflow-selected-check.log` | `selected` 伪影只读复跑（1/1 绿） |
| `00-verification-summary.txt` | 3× 汇总（由日志派生） |

## 8. 边界与未做事项

- 未改产品（`app/`、`src/`）、workflow、`release.yml`、角色卡、边界、其他测试；`chief-workflow.test.ts`/`schema.test.ts` 只读。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 测试标题保留旧行为措辞（可追踪性）；语义以 §3 与本记录为准。
