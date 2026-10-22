---
id: invalid-governance-card-verify
type: change
title: 无效治理确认卡守卫的跨角色独立验证（T15–T17）与本角色 E2E 类型错误修复
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified-in-scope
related: [invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 测试角色独立新增 T15–T17 跨角色用例并实跑（含 governance-judge.started 直接断言）；governance-e2e-auto 全套 53/53 通过（新增 9 例）；npm run typecheck exit 0（修复本角色 3 个既有类型错误）；E8 全量基线因 write-sequencing 挂起被客户决定排除，最终排除后 3377 例/3350 通过/9 失败（均为既有 symlink 环境红；T16 与装配适配后的 govern-target 均通过），不是全绿；真机与真实模型未跑，不代替独立验收
---

# 2026-10-22 验证：无效治理确认卡守卫（T15–T17）

- 日期：2026-10-22
- 角色：测试（独立验证，不改产品代码、不改其他角色单元测试）
- 依据：客户 2026-10-22 确认按 [无效治理确认卡的应用侧守卫设计](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)（status: accepted）的 N1–N5 严格口径实施；O1–O7 未授权。本报告对应设计 §6.2（测试行）与 §7.3 的 **T15–T17**、§九的验证顺序。
- 被测实现（其他角色已交回、工作树未提交）：
  - N1 编排 `src/pipeline/orchestration/run-role.ts::governedInput` 呈现前守卫（删 confirm cardKind 兜底）；
  - N2–N4 运行时核心 `src/model/runtime.ts`（`notPresented`）、`src/provider/runtime/tools.ts`（「卡片未发出」回执）、`src/provider/runtime/schema.ts`；
  - N5 门禁引擎 `src/common/门禁引擎/governance-roles.ts`（五张内置角色卡文本）。
- 本报告**不代替独立验收**；测试通过只说明下述场景在当前候选上通过。

## 1. 候选与环境

| 项 | 值 |
| --- | --- |
| 候选 | HEAD `4d944e7587f10be29b6356c42539e06219ed88fc` + 工作树（产品改动未提交） |
| 环境 | Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1 |
| 本角色改动 | `test/测试/governance-e2e-auto/fixture.ts`（仅新增只读观测点）、`test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts`（新增）、`test/测试/background-tasks-e2e-real-model/*.ts` 3 个既有未跟踪文件的类型修正；本报告与证据目录 |
| 未做 | 未 git 提交；未重启/触碰正在运行的应用；未触碰 `todo-demo`；未读 `.env`、未跑真实模型/凭据/网络 |

候选事实与文件校验和：`角色卡/测试/docs/change/2026-10-22-verify-evidence/candidate.txt`。

## 2. 实际运行的命令与结果

| 命令（cwd = 项目根） | 退出码 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| `node --test --test-timeout=120000 "test/测试/governance-e2e-auto/"*.test.ts` | **0** | **53 tests / 53 pass / 0 fail / 0 skip**（既有 44 + 新增 9） | `…/2026-10-22-verify-evidence/governance-e2e-auto-suite.log` |
| `node --test --test-timeout=120000 "test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts"` | **0** | **9 tests / 9 pass / 0 fail** | `…/new-tests-run6-after-barrier-fix.log`（含 E2 直接断言；run1/run2 为失败定位记录） |
| `npm run typecheck`（`tsc --noEmit`） | **0** | **0 错** | `…/typecheck-final.log`（修复前基线的 3 条错误在本文 §5 逐条记录） |
| **E8-A** `node --test --test-timeout=120000 "test/**/*.test.ts"`（被客户决定终止） | 终止（包装器记录 1） | **blocked/挂起，不是通过**：停时 463 pass / 4 fail / 2 skip，无运行结束摘要 | `…/e8-full-suite.log`、`…/e8-stopped-run-record.txt` |
| **E8-B** `node --test --test-timeout=120000 <342 个文件>`（排除 `test/pi-adapter/write-sequencing.test.ts`；最终候选） | **1** | **3377 tests / 3350 pass / 9 fail / 18 skip**；9 失败均为既有 Windows symlink EPERM 环境红；**T16 与装配适配后的 `govern-target` 均通过**（适配前中间运行 3377/3349/10，见 `e8-excluded-suite.log`） | `…/e8-excluded-suite-final.log`、`…/e8-excluded-final-exit.txt`、`…/e8-failure-classification.txt` |
| `node --test --test-timeout=120000 "test/编排/governance-judge.test.ts"`（佐证） | **0** | 77 tests / 77 pass | `…/regression-orchestration-judge.log` |
| `node --test --test-timeout=120000 "test/runtime-core/governance-flow-metadata.test.ts"`（佐证） | **0** | 9 tests / 9 pass | `…/regression-runtime-core-flow-metadata.log` |
| `node --test --test-timeout=120000 "test/门禁引擎/governance-trio.test.ts"`（佐证） | **0** | 33 tests / 33 pass | `…/regression-gate-trio.log` |

> 失败定位过程如实保留：新增用例首轮 7/9、次轮 8/9（详见 run1/run2 日志）。原因均为**测试夹具构造问题**（脚本以 `turn` 判别在治理反馈重开轮次时重复触发；preview 正文含斜杠文本/`path:` 行被产品当作额外声明写入路径），修正测试后全绿；产品代码未改动。

### 2.1 E8 全量基线（客户已确认排除挂起文件）

**E8-A：被终止的全量运行（blocked/挂起，不是通过）。**

- 命令：`node --test --test-timeout=120000 "test/**/*.test.ts"`；cwd = 项目根。
- 现场：日志停在 `test/pi-adapter/write-sequencing.test.ts` 的 write/edit 顺序用例；该文件 **39+ 分钟无日志进展**、CPU 约 2339s，协调方按**客户决定**终止进程树（PID 8816/24000）。日志最后写入时间约 13:56:54。
- 停时计数：**463 pass / 4 fail / 2 skip**；未产生 `ℹ tests/pass/fail` 结束摘要，包装器记录 exit 1。
- 结论：该运行 **blocked/挂起，不能算通过**；日志与停时事实保留在 `…/e8-full-suite.log`、`…/e8-stopped-run-record.txt`。

**E8-B：排除该文件的全量基线（客户已确认口径）。**

- 文件收集：`find test -name '*.test.ts' ! -path '*/pi-adapter/write-sequencing.test.ts' | sort` → **342 个文件**（清单 `…/e8-excluded-files-final.txt`）。
- **最终候选执行**（装配夹具适配后的重跑）：`node --test --test-timeout=120000 "${files[@]}"`；cwd = 项目根；2026-10-22T14:42:49+08:00 → 14:43:11，耗时约 22.1s；`candidate.txt` 捕获于 14:43:44。
- **最终结果**：**exit 1；3377 tests / 3350 pass / 9 fail / 18 skip / 0 cancelled**；原始输出 `…/e8-excluded-suite-final.log`、退出码 `…/e8-excluded-final-exit.txt`。
- **9 个失败逐条归类（详见 `…/e8-failure-classification.txt`）——全部为既有环境红**：Windows 本机无符号链接权限（`EPERM: operation not permitted, symlink`），位于 `test/claude-adapter/session.test.ts:637`、`test/codex-adapter/session.test.ts:351`、`test/pi-adapter/injected-runtime.test.ts:185`、`:193`、`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46`、`:58`、`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`、`test/编排/shell-authorized-routine.test.ts:103`。这些文件均未被本次改动触碰；编排角色的变更记录也独立登记过 `shell-authorized-routine.test.ts:103` 为同一环境红。**不计为通过。**
- **`govern-target` 预期测试适配已在最终候选通过**：装配角色把旧夹具的治理卡补上合法 `flowId: "demo"` + `cardKind: "write"`（只改测试，不改产品；本角色未修改 `test/装配/`）。适配前中间运行的 3377/3349/10（含该失败）保留为 `…/e8-excluded-suite.log`，最终运行中该用例 **✔ 通过**。该适配是客户确认严格口径的预期结果，不属产品失败或基线红。
- **T16 全量并发失败（本角色测试缺陷，已修复）**：首轮 E8-B（`…/e8-excluded-suite-run1-with-test-defect.log`）中 T16 失败：诊断中「桌面通道 `governance-judge.started`」计数 0 !== 1。根因是测试的诊断写入屏障只等待任意 `test.barrier` 行，误将 T15 遗留的旧屏障行当作本次完成信号而提前读取；诊断文件显示 T16 的通道行确实已写入且位于 T16 屏障行之前。**非产品缺陷**。修复：每次屏障使用唯一标记 `test.barrier.<seq>` 并等待该精确事件落盘。修复后单跑 **9/9**，E8-B 中 **T16 通过**（`✔ T16…`），失败数由 11 降为 10。
- **口径限制**：`test/pi-adapter/write-sequencing.test.ts` 因挂起被客户决定排除，其行为**未验证**；E8-B 不是全绿基线（9 个既有 Windows symlink EPERM 环境红），不能据此声称「全量通过」。T16 与 `govern-target` 在最终运行中均通过。

## 3. T15–T17 映射（全部实跑）

| 设计 ID | 用例（`n-invalid-governance-card.test.ts`） | 关键断言 | 结果 |
| --- | --- | --- | --- |
| **T15** | T15：convener 缺 flowId 的 confirm（双开关全开）⇒ 零通道/零呈现/零判断/零记账/写集未发行 | `rawCustomerInputs=0`、`presented=0`、`nextIdCalls=0`、`pending/queued/judging/replay=0`、judge 调用 0 次、无结果行；**诊断中 `governance-judge.started` 0 行（直接断言，两处组件均为 0）**、`judgeInvocations=0`；回执 `ok:false` 且含「治理确认卡未发出/未向客户呈现/缺少合法的 flowId/本角色允许：write / schedule-write/本次未发行任何写入路径、未写入账本/请补齐后重新调用」、不含「未获客户同意」；同轮 `write_file` 以 **F4** 拒绝且文件未落盘；账本无 `customer.decision` | ✅ |
| **T16** | T16：同一轮补齐 flowId+cardKind 重发 ⇒ 判断启动、自动代批、恰一条结果行、账本 judge | 第一次 `ok:false`（未发出）、第二次 `ok:true`；合法卡恰到达通道 1 次（`raw=1`、`nextId=1`）、`presented=0`；判断恰 1 次、结果行恰 1 条（`cardKind=write`/`group=approval`）；文件落盘；账本恰 1 条 `customer.decision`（convener、accepted、`decisionEvidence.kind="judge"`、`paths=[docs/workflow.md]`）；`judgeContext` 未被前一次拒绝去重拦截 | ✅ |
| **T17** | T17a：合法 `write`（rapporteur） | 自动代批 0 卡、恰 1 条结果行、账本 judge 证据、文件落盘 | ✅ |
| **T17** | T17b：合法 `schedule-write`（convener） | 提案接受后自动代批；账本 `decisionKind=schedule-write`、judge 证据；流程 YAML 落盘 | ✅ |
| **T17** | T17c：合法 `appointment-write`（nominator） | 任命后可代批；账本 `decisionKind=appointment-write`、judge 证据；角色卡与边界双路径落盘且逐路径入账 | ✅ |
| **T17** | T17d：liaison 的 confirm 一律被拒（缺 cardKind 与显式越权两种） | 缺 cardKind ⇒ `notPresented` +「本角色允许：无」；显式 `cardKind=write` ⇒ 既有越权文案「允许：intent-confirm。本次未向客户发卡。」；两者 `raw=0`/`presented=0`/`nextId=0`/无账本 | ✅ |
| **T17** | T17e：项目角色 confirm（无治理字段）原样到达通道、无 judgeContext、手批后写盘成功 | 真实 `openRoleSession`（显式注入客户通道）：请求原样到达（无凭空补 `flowId/cardKind`）、`metadata.judgeContext` 未注入；手批回执 `ok:true`；确认后写入成功 | ✅ |
| **T17** | T17f：single/su 的 confirm（无治理字段）仍是旧卡 | 桌面真实链路：呈现 1 张客户卡、判断零调用/零结果行、回执「客户已确认」、不含「治理确认卡未发出」；手批后写入落盘 | ✅ |
| **T17** | T17g：choice 卡缺 cardKind 的角色兜底不变 | liaison 的 choice 缺 cardKind ⇒ 兜底 `intent-confirm`（O1 未授权、逐字保留）；decision 开关开时自动代批、账本 judge 证据 | ✅ |

测试口径说明：

- 全部经产品公开面：真实桌面 `createDesktopInterface` + 真实 `openRoleSession`/write gate/确认写集发行器/客户通道/桌面判断 driver；模型为脚本桩，判断会话为「真实 driver + 假判断模型」。
- **`governance-judge.started` 为直接断言**（2026-10-22 验收补充证据）：用例把共享诊断存储指向本文件专用的临时目录（`configureDiagnostics`），每轮后追加一条 `test.barrier` 诊断并等待其落盘（诊断队列 FIFO，屏障出现 ⇒ 此前记录已写完），再对诊断行计数。T15 断言该事件 **0 行**（产品在「桌面通道 `desktop.customer-input`」与「编排判断驱动 `orchestration.governance-judge`」两处记录同名事件，两处均不得出现）；T16 作为**正对照**断言两处各 **1 行**，证明捕获机制有效、T15 的 0 不是测量失败。另有 `judgeInvocations`（判断驱动函数调用次数）T15=0、T16=1 交叉验证。
- harness 新增三个只读观测点：`rawCustomerInputs`（到达原始客户通道的请求记录）、`nextIdCalls`（通道 request id 生成次数）、`judgeInvocations`（判断驱动调用次数）。不改变任何被测路径行为；既有 44 例全部原样通过。

## 4. 发现的问题

- **未发现产品缺陷（T15–T17 范围内）**：所有断言通过；无效卡零呈现/零通道/零判断/零记账、补齐重发可代批、合法卡与项目/single/su/choice 路径均符合设计与既有语义。
- **跨角色测试适配（预期适配，已在最终候选通过）**：`test/装配/govern-target.test.ts:223` 的旧夹具缺 `flowId`/`cardKind`，被 N1 严格口径正确拒绝；装配角色已只改测试夹具（补 `flowId: "demo"` + `cardKind: "write"`，不改产品），最终 E8-B 中该用例 **✔ 通过**。本角色未修改 `test/装配/`。
- **本角色新用例的测试缺陷（已修复）**：T16 首轮全量并发失败源于诊断屏障误用旧屏障行提前返回；已改为唯一屏障标记，修复后单跑 9/9、全量中 T16 通过。非产品缺陷。见 §2.1。
- **测试构造经验（非产品缺陷，供后续夹具使用）**：确认卡 preview 的「一行一个路径」解析会把正文中**任何含斜杠且无空白的行**（包括 `path: src/…`、含斜杠的中文散文）当作额外声明写入路径，并对它执行边界探测/完整性校验。夹具的 preview 正文应避免这类行，或显式用 `paths` 参数。该行为是既有实现口径，本批未改动，也不属 O1–O7。
- **`write` 卡账本语义提示**：普通 `write` 确认的 `customer.decision` 按既有设计**不写 `decisionKind`**（「不解锁任何治理门禁」），只留痕 `customerDecision`。T16 已按此断言，避免误把「缺 decisionKind」当缺陷。
- **既有环境红**：全量基线中的 9 个 Windows symlink EPERM 失败与本次守卫无逻辑关系（文件未被触碰，失败为 `symlink` 系统调用权限）；不作为通过计入。

## 5. 本角色 3 个类型错误的修复（保持行为不变）

修复前 `npm run typecheck` 恰 3 条错误，全部位于既有未跟踪的真实模型 E2E 脚本（`TS2322/TS2345`：`OrchestrationEvent` 与 `SessionEvent` 不兼容，`HandbackEvent.kind="handback"` 不在 `SessionEvent` 联合内）。原因是 `openRoleSession().events()` 的公开类型为编排的 `OrchestrationEvent = SessionEvent | HandbackEvent`，而脚本把事件流/数组标注成较窄的 `SessionEvent`。

| 文件 | 位置 → 改动 |
| --- | --- |
| `test/测试/background-tasks-e2e-real-model/e2e-background-real-model.ts` | 事件数组类型 `EventRecord = OrchestrationEvent & { __index }`；iterator/轮次事件类型改为 `OrchestrationEvent`；`toolFacts/resultFacts/messageTexts` 参数改为 `readonly OrchestrationEvent[]`，`toolFacts` 对 `kind==="handback"` 直接跳过（handback 无 `detail`，原代码在此等价地取不到工具事实） |
| `test/测试/background-tasks-e2e-real-model/pi-smoke.ts` | `events: SessionEvent[]` → `OrchestrationEvent[]`（导入自 `src/common/编排/handback.ts`） |
| `test/测试/background-tasks-e2e-real-model/run-shell-comparison.ts` | 同上；`toolFacts` 参数改宽并跳过 handback 事件 |

- 未改任何产品类型、未删测试、未放宽断言；仅类型标注与一处等价的事件类别跳过。
- 修复后 `npm run typecheck` **exit 0**（`…/typecheck-final.log`）。
- 这 3 个脚本是**真实模型/真实网关**的 E2E 脚本，需客户环境凭据；本轮**未执行**（仅类型检查）。其既有真实模型结果不在本报告范围。

## 6. 缺失证据 / 未执行项

1. **真机复验未做**（设计 §九.7）：未在真实运行项目里让治理角色故意发缺 `flowId` 的卡；未观察桌面 UI 的卡片/镜像/排队行。本轮为无头离线夹具（真实产品代码 + 脚本模型）。
2. **桌面 UI 镜像/排队行为**：夹具中 presenter 从未被调用（`presented=0`），通道 `pending/queued/judging` 均为 0；渲染层镜像行结构性不可达，但未做 UI 级断言（设计 §6.3 也说明镜像由桌面在调用客户通道后才产生）。
3. **`governance-judge.started` 已直接捕获**：共享诊断存储写入临时目录，`test.barrier` 写入屏障保证计数稳定；T15=0 行、T16 正对照两组件各 1 行。该捕获依赖 `configureDiagnostics` 全局存储；不改产品行为，仅测试内配置。
4. **真实模型行为**（模型是否按新 schema/角色卡文本补齐字段重发）未验证；取决于模型遵从，无机械保证。
5. **全量基线口径受限**：E8-A 因 `test/pi-adapter/write-sequencing.test.ts` 挂起被客户决定终止（blocked，不是通过）；E8-B 排除该文件后（最终候选）为 3377 例 / 3350 通过 / **9 失败** / 18 跳过，9 个失败全部为既有 Windows symlink EPERM 环境红；T16 与适配后的 `govern-target` 均通过。因此**不能声称全量通过**；被排除文件的行为未验证。
6. 未 git 提交；候选为工作树状态，后续任何产品/夹具改动会使本证据失效（Governing Invariant #4）。

## 7. 结论

- 在上述候选、环境与命令下，设计 §7.3 的 **T15、T16、T17** 均通过：无效治理确认卡零副作用（零通道/零呈现/零判断/零记账/写集未发行，`governance-judge.started` 直接断言为 0），补齐重发可正常判断与自动代批，合法卡与项目角色/`single`/`su`/choice 兜底路径零回归。
- `npm run typecheck` **exit 0**（本角色 3 个类型错误已修）。
- **E8 全量基线不是全绿，不能算作全量通过**：排除挂起的 `write-sequencing.test.ts` 后（最终候选）为 3377 例 / 3350 通过 / 9 失败 / 18 跳过，9 个失败均为既有 Windows symlink EPERM 环境红；T16 与装配适配后的 `govern-target` 均通过。被排除文件的挂起原因已记录，其行为未验证。
- 结论为**范围内测试通过 + 全量基线受限（blocked/9 个既有环境红；T16 与预期适配均通过）**；真机、真实模型、桌面 UI 镜像/排队与独立验收仍未覆盖，**不代替独立验收**。

## 8. 相关链接

- 设计（项目管理）：[无效治理确认卡的应用侧守卫](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)
- 实现变更：[编排 N1](../../../编排/docs/change/2026-10-22_change_invalid-governance-card-guard.md)、[运行时核心 N2–N4](../../../运行时核心/docs/change/2026-10-22_change_invalid-governance-card-receipt.md)、[门禁引擎 N5](../../../门禁引擎/docs/change/2026-10-22_change_invalid-governance-card-copy.md)
- 本角色用例：`test/测试/governance-e2e-auto/fixture.ts`、`test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts`
- 原始证据目录：`角色卡/测试/docs/change/2026-10-22-verify-evidence/`
