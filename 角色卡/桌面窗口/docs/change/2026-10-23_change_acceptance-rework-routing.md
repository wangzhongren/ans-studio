# 变更记录：验收返工路由——桌面路由 S3 + main 接线 S6

- **任务 ID**：`2026-10-23-acceptance-rework-routing`（产品 flowId：`acceptance-rework-routing`；节点 **S3 桌面路由 / S6 接线**）
- **执行者/角色**：桌面窗口（独立子代理上下文）
- **日期**：2026-10-23
- **状态**：**implemented-unverified**（实现与定向/桌面套件测试、typecheck 已完成；**未经 S7 e2e、T3 全量、真实 Electron、目标项目只读复算与独立验收**；不声称验收、不声称通过）
- **依据（客户已确认）**：
  - 闸门 0/1/2 + 实施授权：`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（实施授权原话「授权按团队计划 v1 与标准 v1 实施 S2–S7；不包含 commit/push/发布/目标项目写入，不新增角色/边界。」）
  - 策划方案 v1：`docs/planning/2026-10-23_design_acceptance-rework-routing.md`（§5.3–§5.7、§6.3、§7.1、§8.2；Q1–Q13 A；O1–O4 不做）
  - 验收标准 v1：`docs/acceptance/acceptance-rework-routing-criteria-v1.md`（P1/P2/P3/P4/P6/P8/P9/P11 的桌面面；P 编号对照见标准 §3.0）
  - 团队计划 v1：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（§3.3 桌面写集、§4.1 S3/S6、§4.4 出口证据）
  - S2 公共契约：`角色卡/编排/docs/change/2026-10-23_change_acceptance-rework-routing.md`（`latestAcceptanceDecision` / `evaluateFlowCompletion({allowRejectedAcceptance})` / `reopenAcceptanceStepForRework({autoRework})` / `parseAcceptanceReworkReport`）
  - S5 key 契约：`角色卡/项目管理/docs/change/2026-10-23_change_acceptance-rework-routing.md`（6 个 `main.governance.acceptanceRework*`；参数 `{flowId}` / `{flowId,reportPath,detail}` / `{flowId,detail}`）

## 1. 写集（实际只改这些）

产品/测试（7 个既有文件）：

- `app/desktop/customer-input.ts`
- `app/desktop/interface.ts`
- `app/desktop/governance-advance.ts`
- `app/main.ts`
- `test/桌面应用/acceptance-dispatch.test.ts`
- `test/桌面应用/interface.test.ts`
- `test/桌面应用/operator-wiring.test.ts`

记录与证据：

- `角色卡/桌面窗口/docs/change/2026-10-23_change_acceptance-rework-routing.md`（本文件）
- `角色卡/桌面窗口/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`

**未写**：`app/renderer/**`、`app/preload.cjs`、`src/**`、`test/测试/**`、`test/编排/**`、`test/runtime-core/**`、`test/项目管理/**`、`src/common/shared/**`、`docs/**`、角色卡/边界/YAML、`ans-gateway` 或任何目标项目；未新增 `FlowStepKind`/`Power`/`Decision`/`cardKind`/账本字段/角色工具；未改 `governance-ledger.ts`/门禁引擎；未 commit/push/合并/发布。

## 2. `customer-input.ts`：可选 `onAutoRework`（只传事实、隔离回调）

- `CreateCustomerInputChannelOptions` 新增可选 `onAutoRework(info: AutoReworkCallbackInfo)`；`AutoReworkCallbackInfo` 含 `flowId`、`cardKind`、`source`（`judge-deny`/`judge-manual`）、`reasonCode`、`reason`、`operatorId`、`engine`、`requestId`、`roleId`、可选 `projectRoot`/`runtime`、`at`。
- 触发点只在 `settleJudgeOutcome` 的 **acceptance 卡** judge 自动退回**结算为 `declined` 之后**，与 `settleEntry` 的 resolve/回执分离：回调抛错只记 `interaction.auto-rework.failed` 诊断，不影响已结算的 decline、三态、账本或排队流转。
- allowlist：verdict `deny`（含 decision 组被防御性回落为 `manual/deny-not-approval` 的原始 deny；以及 deny 的 `group-mismatch` 防御回落）→ `judge-deny`；`manual` 的 `timeout`/`parse-failed`/`not-recommended`/`group-mismatch` → `judge-manual`。
- **不触发**：`switch-off`（回原卡）、`aborted`/取消、`unavailable`、`notPresented`、`ledger-unavailable`（`presentEntry` 的应用事实不可用路径）、`row-failed`；非 acceptance 卡零行为变化。
- 本模块不路由、不开会话、不写盘、不写 `customer.decision`。

## 3. `interface.ts`：最新决定 / 路由 / routing record / 重派门

### 3.1 最新验收决定（Q1 A）

- `dispatchAcceptanceForFlow` 改用 `latestAcceptanceDecision(flowId, ledger)`：**只有最新 accepted** 调 `closeAcceptedFlow`（`completeAcceptanceStep`）；rejected 不再被当作永久收口。
- 写卡后推进检查（`runPostWriteAdvanceCheck`）的「流程已收口」跳过条件改为「最新 acceptance 决定 accepted」；rejected 不再永久跳过。
- `unresolved`/`ledger-unavailable` 不路由、不重派，沿用既有 strict 收尾门 fail-closed（Lead 系统行）。

### 3.2 `routeAcceptanceRework`（客户 reject）与 `routeAcceptanceAutoRework`（judge auto-rework）

- 两者共用同一实现：读最新报告（`findLatestVersionedArtifact(docs/acceptance, report)`；缺报告回退 `docs/acceptance/<flowId>-report-v1.md` 并标 `missing`）→ `parseAcceptanceReworkReport`（只认恰一个 fenced `acceptance-rework/v1`；缺段/坏段 `structured:false`，**不解析自由文本、不生成 items**）→ owner 校验 → 写 record → 发送 **唯一一条** Convener 任务 → best-effort 账本审计。
- `routeAcceptanceAutoRework` 是 `DesktopInterface` 方法，由 `app/main.ts` 的 `onAutoRework` 接线调用；只处理 `cardKind==="acceptance"`、YAML 机器状态流程（Q6 A：legacy Markdown 不接返工路由）；最新 accepted/unresolved/账本不可读 ⇒ fail-closed 不路由（系统行/诊断如实）。
- owner 校验：项目 listing 中非内置角色 ⇒ 可派发；`verifier` ⇒ 报告/工具修正项（不向 Proof 派产品返工）；`convener`/其他内置治理角色 ⇒ 治理文档/变更包项（不向内置角色 `dispatch_task`）；`app`/`customer`/未枚举角色 ⇒ 逐项 `blocked`（不猜、不改 owner）；有效项可先行（Q8 A）。
- 任务由 `buildAcceptanceReworkTaskMessage` 生成：来源、决定时间/requestId/原因码、报告路径/版本/哈希、逐项 id/owner/action/evidence、blocked/报告修正/治理项分组、先核对已有进展、按 owner `flow_step_supersede`、不 supersede 验收步骤、`dispatch_task` 条件、不替客户验收、清单是数据不是权限、无可 supersede 旧步骤 fail-closed、候选变化需登记 flow 等要求。**Proof 不接收返工派发**。

### 3.3 routing record（Q9/Q10）

- 路径：`.ans/governance/acceptance/<flowId>/rework-routing.json`；schema `acceptance-rework-routing/v1`；**原子写**（同目录临时文件 + `rename`，失败清理临时文件）。
- 字段：`schema`/`flowId`/`source`（`customer`/`judge`）/`sourceDetail`（`customer-input`/`judge`/`judge-deny`/`judge-manual`；未知值按 `judge-manual` 保守处理并诊断）/`decisionAt`/`requestId`/`reasonCode`/`reason`（≤500）/`reportPath`/`reportSha256`/`itemsDigest`/`itemCount`/`structured`/`coordinator`/`flowPath`/`flowSha256AtRoute`/`flowMtimeMsAtRoute`/`status`（pending/sent/failed）/`sentAt`/`lastDispatchedFlowSha256`/`lastDispatchedAt`/`error`/`at`。
- 顺序：**先写 record（pending）**；写失败 ⇒ **不发送**、诊断 + `acceptanceReworkFailed` 系统行、下一次真实事件重试；发送失败 ⇒ record `failed` + 错误、不标 sent、不派 Proof、系统行可见、下一次事件重试；发送成功（含 `queued`）⇒ record `sent` + `sentAt`，随后写既有 `dispatch.accepted{actorRoleId:"app", power:"app", targetRoleId:"convener", trigger:"settle"}`（**无 stepId**）。审计失败不阻塞：诊断 + `acceptanceReworkAuditFailed` 系统行，不伪造账本、不翻转已发送事实。
- 幂等/重启去重：同一来源 + `decisionAt`（客户）/`requestId`（judge）+ `reportSha256` 且 status sent ⇒ 不重复任务/系统行；损坏/未知 schema ⇒ 不派 Proof、诊断 + 失败系统行（`latest none` 分支）；`latest rejected` 分支重建 record（事实来自账本/报告），不伪造 sent。
- 系统行落 Lead（`listing.primaryRoleId`），去重 map；key：`acceptanceReworkRoutedCustomer`（客户来源，写「客户拒绝」）、`acceptanceReworkRoutedAutomatic`（judge/代批，写「自动决策未通过/未完成」）、`acceptanceReworkPending`、`acceptanceReworkReportIncomplete`、`acceptanceReworkFailed`、`acceptanceReworkAuditFailed`。**judge 来源不写「客户拒绝」**。

### 3.4 重派门（Q4 A；见 §5.5.3）

对 `latest rejected` 或 `latest none + 耐久 auto-rework record` 且 flow YAML 存在时：

1. 最新决定非 accepted、存在 routing record（judge 无决定时以 record 为据）。
2. flow YAML 可解析、保留验收步骤存在；`verification`：
   - `dispatched`/`delivered` 或 `pending` 带旧 evidence ⇒ 调 app-only `reopenAcceptanceStepForRework`（judge 来源传 `autoRework:true`）；重开失败 ⇒ 不派并提示；`done` ⇒ 异常，不重开/不重派、提示人工核对（`acceptance.rejected-after-done`）；`failed/blocked/aborted/superseded` ⇒ 不重开，提示人工/Convener。
3. `evaluateFlowCompletion(flow, ledger, {allowRejectedAcceptance:true})` 必须 `ready:true`（rejected 不挡；执行步骤全 done/证据齐/无未结算决定）；否则既有 blocked 系统行（具体原因）。
4. 进度基线：客户 reject 用 `decisionAt`（缺失/不可解析回落 record `sentAt`/`at`）；judge auto-rework 用 routing `sentAt`/`at`；`flowMtimeMs <= baseline` ⇒ 不派，`acceptanceReworkPending` 去重系统行。
5. 同内容/同版本抑制：`record.lastDispatchedFlowSha256 === 当前 flow sha` ⇒ 不派；`acceptanceLastDispatchAtMs >= flowMtimeMs` ⇒ 不派；旧记录无 `at` 且 `acceptanceDispatchRecorded` ⇒ 沿用「有记录即不派」；`acceptance-criteria` 等其他 verifier 派发不计入（§4）。
6. 通过 ⇒ 派 verifier **一次**：任务带 `flowUpdatedSinceReview:true`、报告写 **vN+1**（不覆盖被拒报告）、结构化返工段硬要求；成功后写账本 `dispatch.accepted{stepId:"verification", targetRoleId:"verifier", actorRoleId:"app"}`，并更新 record `lastDispatchedFlowSha256`/`lastDispatchedAt`；失败释放占位（不更新 record），下一次真实事件重试，不循环刷屏。

## 4. `governance-advance.ts`

- `acceptanceDispatchRecorded` / `acceptanceLastDispatchAtMs` **收窄**（Q4/P4.3）：只认 `stepId:"verification"`，或**旧记录**（无 `stepId`）且 `targetRoleId:"verifier"`；`acceptance-criteria` 等其他 verifier 派发不计入。既有「无 `at` 的旧记录」布尔兜底保留。
- `flowCompletionIssue`（legacy Markdown）**保持旧行为**（Q6 A：任意 acceptance 决定终结），未改其判定；由新增测试回归锁定。
- `buildAcceptanceTaskMessage`：新增可选 `previousReportPath`；在调用方传入 `reportPath`/`previousReportPath` 时追加 **⑨**「不通过/返工报告必须包含恰好一个 `acceptance-rework/v1` fenced YAML 段（单 owner、跨 owner 拆项、id/action/evidence 规则；通过时可省略；缺段/坏段视为报告不完整）」与「写 vN+1、不覆盖被拒报告」；**旧调用不传新参数时文案逐字不变**（生产调用总会传 `reportPath`）。
- 新增纯函数 `buildAcceptanceReworkTaskMessage`（无 IO）与系统行包装：`governanceAcceptanceReworkRoutedNote`、`...PendingNote`、`...ReportIncompleteNote`、`...FailedNote`、`...AuditFailedNote`（消费 PM 6 key；judge 来源不写「客户拒绝」）。

## 5. `app/main.ts`（S6 仅接线）

- 新增与 `advanceGovernanceFlow` 同模式的可变句柄 `routeAcceptanceAutoRework`；`createCustomerInputChannel({ onAutoRework })` 在窗口未销毁时把事实交给 `desktop.routeAcceptanceAutoRework(info)`；失败只记 `acceptance.rework.auto.failed` 诊断。
- 不放业务逻辑；未改 preload/IPC 形状/通道名/载荷；未新增渲染消费面。

## 6. 测试（原始日志见证据目录）

| # | 命令 | 结果 | 日志 |
| --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 test/桌面应用/acceptance-dispatch.test.ts` | **44/44 pass，exit 0** | `01-desktop-acceptance-dispatch.log` |
| 2 | `node --test --test-concurrency=1 test/桌面应用/interface.test.ts` | **120/120 pass，exit 0** | `02-desktop-interface.log` |
| 3 | `node --test --test-concurrency=1 test/桌面应用/operator-wiring.test.ts`（条件文件，已改） | **54/54 pass，exit 0** | `03-desktop-operator-wiring.log` |
| 4 | `npm run typecheck`（`tsc --noEmit`；PATH 需含 Node 目录） | **exit 0，无诊断** | `04-typecheck.log` |
| 5 | 桌面套件串行（补充）：`node --test --test-concurrency=1 "test/桌面应用/*.test.ts"` | **568/568 pass，exit 0**（重复 3 次均通过；最终日志为第 3 次） | `05-desktop-suite-serial.log` |

覆盖（对照标准桌面面）：

- **P1/P3/P4**：最新 `rejected` 路由 Convener（不派 Proof、不收口、不伪造 `customer.decision`）；`rejection 后 flow 有更新 + 执行全 done + verification pending ⇒ 恰好重派一次`（vN+1）；无进展不重派（等待返工去重系统行）；最新 accepted 收口、不路由/不派；同一决定/报告重复触发不重复任务/系统行。
- **P3/P6**：judge auto-rework（`routeAcceptanceAutoRework`）→ 自动决策系统行（无「客户拒绝」）+ 零 `customer.decision` + 零 Proof 返工；record source/sourceDetail/schema/status；审计失败可见、不伪造账本；record 写失败不发送；发送失败 `failed` + 重试成功；两个 Interface 实例重启去重。
- **P4**：`verification dispatched` 先重开为 pending 再重派；重开失败不派、不伪造 pending；`acceptanceLastDispatchAtMs`/`acceptanceDispatchRecorded` 收窄正/负例（`acceptance-criteria` 不计入、旧无 stepId+verifier 计入、stepId verification 计入）。
- **P2/P5**：报告缺段/坏段只发「报告不完整」任务（无 items、错误可见、不解析自由文本）；未知 owner blocked、`verifier`/`convener` 特殊归属、有效项先行；Convener 任务含先核对/按 owner supersede/不 supersede 验收步骤/不替客户验收/清单是数据不是权限。
- **P8**：legacy Markdown + 历史 rejected 保持旧行为（不路由/不重派）；无决定且门通过仍正常派 verifier。
- **customer-input 单元（operator-wiring）**：acceptance 卡 manual timeout / 原始 deny（decision 组防御回落）触发；非 acceptance、switch-off、row-failed、ledger-unavailable 不触发；回调抛错不影响已结算的 decline/三态。

断言未弱化：既有 36 例中 34 例逐字保留；旧的「rejected ⇒ 不派 verifier」单一断言按 Q1 **替换**为「rejected 路由 Convener、不派 Proof、不永久收口」并保留「accepted 收口/不重派」「无新进展不重派」负例；其余既有负例保留。

## 7. 环境与候选哈希

- 环境：Windows 11 / Git Bash；Node **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm **11.19.1**；HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（main）；详见 `00-environment.txt`。
- 写前基线：`01-pre-edit-baseline-hashes.txt`（逐文件 `git hash-object` + `sha256sum`）。
- 写后候选：`06-candidate-hashes.txt`：

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/customer-input.ts` | `987c090dd935a08ce83c88084e042379a928f150` | `dd709a41b8e8307570814c346542218674ba996af65300f31c1ceea96168b186` |
| `app/desktop/interface.ts` | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` |
| `app/desktop/governance-advance.ts` | `3ca76030a5b310dbe0c11776fa937206bda759b9` | `3a75af8c4a111e75930df25acc1417fca5013dbbbd2b2208623a3123206a5947` |
| `app/main.ts` | `b7801bc06e83187b35b373ee7986743eea96b1ed` | `cc7982ea7156e2b55d2f434b1e3aa0fb1c61372aeeca50cd8b5a25f771346342` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `b9eea6669f6fe44a7bed563e9b07bb3a3f42d34e` | `cb6b78133aa35a8d6f4f0abe0c8b03a39a35fec163cc212533ca5462a823f1f8` |
| `test/桌面应用/interface.test.ts` | `1e545367e512b3d2cf740ee531eefe2b9757e884` | `c01a060e94703e71e8e043995285ae113151a86b6afe9e24faac4bbd3805a575` |
| `test/桌面应用/operator-wiring.test.ts` | `65f358a2fbaf3d7d799175709628b8fb121bf5c1` | `326c9156819126b6dbe58669f0bb73ea439228f9c6b3fd7fe55cdfded3dbac8a` |

- 写集/暂存：`07-write-set-status.txt`；未 `git add`、未 commit/push。

## 8. 边界与未做核对

- 只写团队计划 §3.3/§4.1 S3+S6 授权的既有文件；`test/桌面应用/` **未新建文件**；`app/main.ts` 只接线；未改 `app/renderer/**`、`app/preload.cjs`、`src/**`、门禁引擎/账本/枚举/角色工具/依赖/发布配置。
- 桌面只经 `src/pipeline/orchestration/flow-state.ts` 公共出口消费编排（`latestAcceptanceDecision`/`evaluateFlowCompletion`/`parseAcceptanceReworkReport`/`reopenAcceptanceStepForRework`）；未直接 import `src/common/编排/**`。
- 未写目标项目 / `ans-gateway`；所有测试夹具使用系统临时根。
- 未跑 S7 e2e、T3 串行全量、真实 Electron、目标项目只读复算（属测试/验收角色）；本记录不构成 P9/P10/P11 的验收结论。

## 9. 残余风险 / 供 S7 与独立验收注意

1. **legacy YAML-only（Q6 A）**：legacy Markdown 流程不接返工路由/重派（保持旧行为）；旧 rejected legacy 流程需要迁移 YAML 才能自动恢复。测试已锁定旧行为。
2. **record「sent 更新」写失败**：任务可能已发出但 record 仍 pending；本进程用内存 sent 集合兜底，重启后可能重复一次 Convener 任务（不是 Proof 派发）。账本审计与后续重派仍由 ledger 去重；残余风险已在实现注释记录。
3. **审计 best-effort（Q10 A）**：`dispatch.accepted(app→convener)` 失败不阻塞路由，但会留下审计缺口（系统行可见、不伪造）。严格「先审计后发送」未实现（非本轮选择）。
4. **报告 vN+1**：重派要求写新版本；若 Proof 仍写旧版本，应用不回溯改已发任务（按新报告哈希路由一次）。
5. **候选代码变化不可见（Q4/§10.2）**：应用只以 flow 更新作为返工进展信号；Convener 未把返工/证据登记进 flow 时不会重派——任务文本已要求登记。
6. **owner 特殊归属**：`verifier`/内置治理角色不派产品返工；`app`/`customer`/未知 owner blocked。部分返工可能需报告方拆项/补证。
7. **`deny-not-approval` 扩展**：acceptance 属 decision 组，judge 原始 `deny` 会被通道防御性回落 `manual/deny-not-approval`；实现按「原始裁决 deny」触发 `judge-deny` 路由（与标准 P3.1「verdict deny」及标准 §3.3 #3 一致），并在测试中钉住。
8. **共享文件既有改动**：`app/main.ts`/`interface.ts`/`governance-advance.ts`/`customer-input.ts` 工作树已有 i18n、目录 v3、写卡门禁等未提交改动；本变更只追加本变更 hunk，候选隔离以本记录 §7 的逐文件哈希 + `git diff` 为准；不为既有变更背书。
9. **未验收**：状态 `implemented-unverified`；S3 出口证据交 S6/S7，最终以独立验收按标准 v1 判定为准。
10. **一次既有测试时序抖动（如实记录）**：最终证据采集期间，`test/桌面应用/interface.test.ts` 的既有用例「可重入门禁：两轮错误写卡…」在**一次**整文件运行中 readiness 派发断言超时（0 !== 1）；随后单文件重跑 **120/120 pass**，桌面串行套件重复 **568/568 pass**。该用例与本变更路径无共享状态（无 acceptance 决定，走既有写卡/readiness 链）；证据目录保留的是通过运行的原始日志，供 S7 关注是否为既有偶发。
