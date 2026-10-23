# 变更记录：治理写卡推进的可重入门禁闭环——桌面消费（S4）

- 任务 ID：`2026-10-23-governance-advance-redispatch`
- 产品 flowId：`governance-advance-redispatch`
- 角色：桌面窗口（S4 桌面消费；依赖 S3 已冻结公共出口）
- 日期：2026-10-23
- 状态：**implemented-unverified**（已实现、定向测试/typecheck/S5 定向 e2e 通过；S5 缺陷已修复并加回归，待 S5 重跑终验；不代表验收通过）
- 依据（客户已确认）：
  - 意图/闸门 0/1/2/实施授权：`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`
  - 策划方案 v1：`docs/planning/2026-10-23_design_governance-advance-redispatch.md`（§3 A1–A4/A6/A7、§4 契约、§8.1、§10）
  - 验收标准 v1：`docs/acceptance/governance-advance-redispatch-criteria-v1.md`（P1–P3、P5–P9、P12；§九 既有测试冲突）
  - 团队计划：`docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`（§4.2 桌面写集、§5.1 S4）
  - 实施前基线：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`（interface 105/105、acceptance-dispatch 36/36；T3 3661/3633/10/18）
- S3 已冻结公共出口（只经公共出口消费，未改 `src/**`）：
  - `src/pipeline/orchestration/flow-state.ts` 再导出 `completeRoleCardsStep` 与
    `CompleteRoleCardsStepInput` / `CompleteRoleCardsStepResult`；
  - `src/common/编排/flow-service.ts::completeRoleCardsStep` 的输入/结果/错误码（`role-cards-stale`、
    `role-cards-step-missing`、`role-cards-step-terminal`、`role-cards-kind-unsupported`、`write-failed` 等）。

## 一、用户可见入口与行为

1. Crew 每次写卡（含修正重写）、治理角色 settle、**项目刷新（`listProject`）**都会进入一次去重的只读结构校验。
2. 不合格：按来源反馈 Crew/Convener；**不写 flow、不派 Convener、不弹客户卡、不写 `customer.decision`**；
   反馈按**内容指纹**去重（同内容不刷屏；内容变化才再报）；发送失败不登记去重，下一次触发重试。
3. 合格：应用先调 `completeRoleCardsStep` 把 flow 的 `role-cards` 标 `done`（artifact kind 写
   `.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`；dispatch kind
   用既有 `dispatch.accepted{stepId:"role-cards"}` 对账），再派 Convener 做 `role-readiness`。
4. 团队计划存在但 flow 缺 `role-cards` 步骤 ⇒ 按既有后台通道反馈 Convener 补 flow（不派 readiness、
   不伪造步骤）；legacy（无团队计划）且无该步骤 ⇒ 保持旧文案与旧派发路径。
5. 权限模型不变：Crew 仍只经 `appointment-write` 写卡；应用仍是唯一结构校验者与 flow 写者；
   `completeRoleCardsStep` **不注册为角色工具**；不新增枚举/写权/派发权。

## 二、实现摘要（方案 A）

### 2.1 角色卡内容指纹（A2/Q3）

`app/desktop/interface.ts` 新增 `computeRoleCardsFingerprint`：

```text
sha256(JSON canonical {
  schema: "role-cards-gate/v1",
  flowId,
  appointment: { path, version? },                  // 账本 appointment.artifactPath（版本按 -vN.md 解析）
  teamPlan: { path, version, sha256 } | null,
  roles: [{ roleId, files: 六文件[{ name, sha256|"missing" }] }]   // 按 roleId 排序
})
```

- 目标角色取账本**最新 appointment** 的 `targetRoleIds`（去空、去重、排序）。
- 六文件：`role-card.md`/`boundary.yaml`/`feature-map.md`/`functional-description.md`/`memo.md`/`api-spec.md`。
- 团队计划内容（字节 sha256）与版本/路径进指纹；**不含 mtime/时间**；同内容恒同指纹。
- 逐文件实际哈希同时提供给 `completeRoleCardsStep`（由其重读核对，防「校验后文件又变」）。

### 2.2 版本化去重（A2/Q4）

- `applicationConvenerDispatchKey` 改为
  `${canonicalRoot}\0${flowId}\0convener\0${fingerprint}\0${anchorIndex}`（anchorIndex＝当前指纹通过记录
  的账本索引；无通过记录时＝最近 Crew `appointment-write` 索引，无则 appointment 索引）。
- 同一 flow 出现新键时 `retainLatestDispatchKey` 清理旧键（Set 不无界增长）；`applicationDispatchCommitted`
  使用**同一键**（append 侧第二道去重）；发送/账本失败释放占位，下一次触发重试。
- `appointmentArtifactFeedback`（`projectRoot\0flowId`）值改为**当前指纹**：同指纹不重复反馈；
  内容变化重新反馈；通过后清除；发送失败不登记。

### 2.3 账本放行锚（A2/Q4）

- `roleCardsAnchorIndex`：优先「当前指纹的通过记录」——`artifact.observed{flowId, actorRoleId:"app",
  power:"app", artifactPath: ".ans/governance/role-cards/<flowId>/<fingerprint>.json"}` 的账本索引；
  无则「最近 Crew `appointment-write`」；再无则最新 appointment 索引。
- `hasReadinessDispatchAfter`：锚之后存在 **app→Convener 且 `stepId="role-readiness"`** 的
  `dispatch.accepted` 才跳过；**appointment 链早期无 stepId 的 Convener 派发不算**（目标项目 entry 17
  形态）；`power="liaison"` 的协调消息排除。比较账本索引，跨重启一致。

### 2.4 项目刷新探针 + 防自激（A1/Q2）

- `listProject` 更新 listing 缓存后，对 trio 项目跑 `probePostWriteAdvance`（只读账本 + flow YAML +
  锚点；不读全部角色六文件）：目标角色齐备且存在「待校验/待派发」才排完整检查；
  250ms 合窗（`POST_WRITE_ADVANCE_PROBE_DELAY_MS`），与既有 `running/pending` 合并逻辑共用，不吞信号。
- 探针在 `role-cards done` 且 readiness 已派发后不再触发完整检查（方案 §10.2）；诊断
  `advance.post-write.probe` 只进诊断日志。
- **防自激**：删除了完整检查里刷新后的**无条件** `emitProjectChanged`；只在
  (a) listing 角色/警告签名变化（刷新后立即发）或 (b) 本轮实际发出反馈/完成 role-cards/派发时发出，
  每轮至多一次；稳定状态下重复 `listProject` 不产生 `project:changed` 循环。

### 2.5 合格收口与派发顺序（A4/A5）

- validation pass（无 blocker；warning-only 只记诊断）后：
  - 团队计划存在：若任一目标角色六文件不齐 ⇒ 诊断 `advance.role-cards.files-incomplete`、不派、下次重试
    （existing/legacy 的缺工作文档在结构校验里只 warning，但编排收口契约要求六件齐全）；
  - 调 `completeRoleCardsStepFn`（`DesktopDeps` 新增可选依赖；缺省静态导入公共出口）：
    - 成功/幂等 done ⇒ 继续；带 `evidence`/`recordPath` 与 flow 视图（判断 `role-readiness` 是否已 done）；
    - `role-cards-step-missing` / `not-found` ⇒ 反馈 Convener 补 flow（`docs/flows/<flowId>.yaml` 问题抬头
      「流程状态 YAML 未通过结构校验」，不是 readiness）；
    - stale/terminal/unsupported/write-failed/ledger 等 ⇒ 只诊断、不派、下一次触发重试；
  - 团队计划不存在（legacy）：不调完成函数、不写记录，保持旧文案/旧派发（无 stepId）。
- 派 Convener：团队计划存在时账本写 `dispatch.accepted{targetRoleId:"convener", stepId:"role-readiness",
  actorRoleId:"app", power:"app", trigger:"customer-decision", dedupeKey:版本化键}`；legacy 无 stepId。
- 失败（runtime 无法解析/开或发失败）释放运行期占位、只记诊断，下一次触发可重试；不写「已派发」账本。

### 2.6 readiness 文案（A6/Q7）

`app/desktop/governance-advance.ts::buildRoleReadinessTaskMessage` 新增可选
`roleCardsDone?: { evidenceRef: string }`、`roleReadinessAlreadyDone?: boolean`：

- 未传 ⇒ 既有 v1/v2/v3 文案**逐字不变**（新增测试断言「传入新选项时旧文案是前缀」）。
- `roleCardsDone` ⇒ 追加「应用已在结构校验通过后把 role-cards 标为 done（证据：…）：本次只推进
  role-readiness，不要重写角色卡、不要重新派 Crew」。
- `roleReadinessAlreadyDone` ⇒ 追加「flow 中 role-readiness 已 done：不要重做角色就绪复核，核对既有记录
  与证据后继续推进后续步骤」。

### 2.7 S5 缺陷修复：缺 role-cards 步骤时 Convener 反馈循环

- **S5 发现**（`角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-finding-convener-feedback-loop.md`）：
  团队计划存在但 flow 缺 `role-cards` 步骤时，同一内容指纹会反复给 Convener 发相同反馈
  （e2e 1.3s 内 20 条），违反方案 A2「同指纹不重复反馈」，并有 `projectChanged` 刷新回路风险。
- **根因**：`runPostWriteAdvanceCheck` 在结构校验通过后**立即**清空 `appointmentArtifactFeedback`；
  随后的 `completeRoleCardsStep` 返回 `role-cards-step-missing` 并再次反馈，下一次检查又先清空 → 循环。
- **修复**（`app/desktop/interface.ts`）：
  1. 删除「校验通过即清空」；反馈去重只在**完整成功**后清除——即 `completeRoleCardsStep` 成功/幂等、
     Convener 发送成功、且 `appendApplicationDispatch` 账本成功（`dispatchCommitted === true`）之后。
  2. 收口失败/flow 缺陷分支（`role-cards-step-missing`/`not-found`/`role-cards-stale`/`terminal`/
     `unsupported`/`write-failed`/六件不齐等）**不清空**去重；同指纹只反馈一次，内容变化才再报。
  3. `performedAction` 仅在实际发送新反馈（`reportAppointmentArtifactIssues` 返回 true）、实际完成
     role-cards（非幂等）、实际派发时置 true；同指纹去重返回 false 不 emitProjectChanged。
  4. 其余「先清空再可能失败」分支审计：反馈去重仅此一处清空；blocker 分支保持「同指纹一次、内容变化再报」。
- **验证**：新增回归用例（`interface.test.ts`「S5 回归」）；并临时把修复回退为旧逻辑运行该用例，
  用例按预期失败（同指纹重复反馈），恢复修复后通过——证明回归能捕获该缺陷。
  S5 e2e `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` 修复后 **6/6 pass**
  （修复前 5/6，失败即本缺陷）。

### 2.8 I9 真实 Electron 修复：handback 状态检查的等待/挂载

- **现象**（I9，测试角色证据 `角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/`）：
  `test/桌面应用/e2e/main.mjs` 的 `REPORT_STATUS_UNREPORTED/FAILED/ABORTED` 在 fresh userData 下
  稳定 false（`e2e-main-zh-tempud/2` 三次运行均 `E2E_PASS=false`；旧 dist 曾通过）。
- **诊断事实**（fresh userData、当前 dist；本角色 6 次复跑均通过，说明不是确定性产品缺陷）：
  - 三项检查前：`rowModelDebug('桌面窗口').count=34`，`#chat scrollTop=2325/scrollHeight=2799/clientHeight=474`，
    `#chat .msg-handback` 数量 0；
  - 发送 handback 后：rowCount 34→35→36→37，handbacks 0→1→2→3，scrollTop/scrollHeight 随内容增长
    （2655/3129 → 2985/3459 → 3315/3789），`.hb-head strong` 文本分别为
    「系统按终态记录：未报告/失败/已中止」；
  - 行数 34–37 **小于渲染层虚拟阈值 `VIRT_MIN_ROWS=150`**（`app/renderer/src/chat/row-model.ts`）⇒ 所有行
    已挂载，失败不是「行在虚拟窗口之外」；唯一可复现差异是**行模型投影是异步的**，旧检查只固定
    `sleep(80)` 后立即查 DOM——慢环境（I9）下 80ms 内行尚未投影，故三项稳定 false。行数超过 150 时
    离屏行才不构造 DOM，同一处修复也覆盖。
- **修复（仅 `test/桌面应用/e2e/main.mjs`，不改 `app/renderer/**`）**：断言前先等目标角色 pane 选中并挂载；
  每项先记录事实（rowCount/scrollTop/scrollHeight/clientHeight/handbacks），发送后**有界等待行进入行模型**
  （≤2s），再**贴底并等待 `.msg-handback .hb-head strong` 挂载**（≤2s）后才断言；断言语义不变
  （该状态的结论标签必须出现）。报告新增 `REPORT_STATUS_<S>_BEFORE/APPENDED/AFTER` 事实行。
- **验证**：fresh userData 连跑 2 次 `E2E_PASS=true`、`E2E_FAILURES=` 空；原始 report/stdout/截图见
  `...-evidence/e2e-main-fresh-userdata-1|2/`。诊断性强制滚顶实验显示行数 <150 时仍全部挂载
  （`LEGACY_IMMEDIATE=true`），进一步证明 I9 失败是投影时序而非窗口外；强制滚顶实验代码已移除。
- **授权边界**：`test/桌面应用/e2e/main.mjs` 原不在 S4 写集；本次由统筹 I9 指令明确授权修改该检查
  （只改测试等待/挂载与诊断，不改产品/渲染层、不放宽断言）。变更包/验收需把该文件单独列为 I9 测试夹具修复。

## 三、既有测试冲突的处理（未放宽断言）

`test/桌面应用/interface.test.ts` 的 v2/v3「有团队计划但 flow 无 role-cards 步骤却期望 readiness」用例
（实际行号：2536/2939/4621/4746/4840/5037/5223 一带）按方案 A4.2 处理：**补足 flow `role-cards` 步骤夹具**
（`writeRoleCardsFlowFixture`）与必要的新契约夹具（收口要求六文件齐全；`role-cards done` 由真实
`completeRoleCardsStep` 产生），**原有断言未删改**；同时补实施前标准夹具，避免新契约验收门先派 Verifier
干扰写卡链路断言。

`test/桌面应用/acceptance-dispatch.test.ts` 仅一处触发面调整（条件授权内）：「新契约流程标准缺失」用例
在补齐标准/变更包后，由 `executor` 会话 settle 改为**既有「项目刷新/导入」触发面**（`listProject`）重新评估
验收门。原因：新增刷新探针会按需打开后台反馈会话（SessionManager 保活上限 3），可能 LRU 回收该测试的
executor 会话，使 settle 事件不再被消费；这是**触发面**受本变更影响，不是断言放宽——断言（判定派发恰一次、
标准任务恰一次、文案含档位/报告路径）逐字保留。

## 四、测试与命令

环境：Windows 11 Pro 10.0.26300 / Git Bash；Node v24.22.1 / npm 11.19.1；HEAD
`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；命令前
`export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`。

| # | 命令 | 退出码 | 计数（tests/pass/fail/skip/todo） | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `node --test test/桌面应用/interface.test.ts` | **0** | **117 / 117 / 0 / 0 / 0**（基线 105/105；+12 新用例） | `...-evidence/directed-interface.log` |
| 2 | `node --test test/桌面应用/acceptance-dispatch.test.ts` | **0** | **36 / 36 / 0 / 0 / 0** | `...-evidence/directed-acceptance-dispatch.log` |
| 3 | `node --test "test/桌面应用/"*.test.ts`（目录全量） | **0** | **552 / 552 / 0 / 0 / 0** | `...-evidence/desktop-directory.log` |
| 4 | `node --test test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`（只运行，未修改） | **0** | **6 / 6 / 0 / 0 / 0**（修复前 5/6，失败即 S5 缺陷） | `...-evidence/directed-redispatch-e2e.log` |
| 5 | `npm run typecheck` | **0** | 无 `error TS` | `...-evidence/typecheck.log` |
| 6 | `node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs`（I9，fresh userData ×2） | **0** | **E2E_PASS=true；E2E_FAILURES= 空（两次）** | `...-evidence/e2e-main-fresh-userdata-1|2/report.txt`+`stdout.log` |

- **偶发分类**：修复前后多次整文件运行均未复现基线记录的 readiness/ledger 时序偶发；S5 finding 记录的
  `i-full-chain` 偶发属测试角色另案（非本修复范围），本记录未把它当通过。
- **新增桌面用例**（`interface.test.ts`，12 个）：
  1. 两轮错误写卡（内容不同）⇒ 两次反馈；修正后 role-cards 恰一次 done、readiness 恰一次、无客户卡/客户决定；
     已有成功派发后 Crew 重写（内容变化）⇒ 重新进入并允许再次派发。
  2. 指纹去重：mtime-only 不触发；团队计划内容变化（问题集相同）⇒ 重新反馈。
  3. 项目刷新探针：无 Crew 事件，仅 `listProject` ⇒ 不合格反馈、手工修正后推进。
  4. 跨重启账本锚 A/B/C：早期无 stepId 派发不挡；通过记录后 readiness 派发挡；有记录无派发放行。
  5. dispatch kind 收口（账本证据；不写 `.ans` 记录）。
  6. 团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener、不派 readiness；同指纹不刷屏。
  7. 终态拒绝（不覆盖）；已 done 幂等（不重复 done/派发）。
  8. stale（注入）⇒ 只诊断不派；下一次触发重试成功。
  9. 顺序无关：boundary 条目逆序仍通过；逆序缺 api-spec 条目被逐项报告。
  10. 防自激：稳定状态重复刷新 10 次不产生新派发/反馈/`project:changed`。
  11. readiness 文案兼容：未传新选项 v1/v2/v3 文案不变；传入只追加新句。
  12. S5 回归：flow 缺 role-cards 步骤同指纹连续触发/刷新（Convener 已 settle）⇒ 反馈恰一次、
      无重复 `projectChanged`；内容变化 ⇒ 再反馈一次；补 flow 步骤 ⇒ 收口并派 readiness 恰一次；
      全程无客户卡/`customer.decision`。
- 既有 legacy 用例补强（非放宽）：`appointment-write answered` 用例追加断言「legacy 不写 `.ans/governance/role-cards`
  记录、不新增 `artifact.observed` 账本种类」。

## 五、已知边界与未做项

1. **S5 终验未做**：T3 全量回归、`test/测试/governance-e2e-auto/` 全链路 e2e、真实 Electron
   `test/桌面应用/e2e/main.mjs`、目标项目 `ans-gateway` 只读复算均由测试角色/统筹在 S5 执行；本记录
   **不声称** T3/e2e/Electron/复算通过，也不声称验收通过。
2. **目标项目未写入**：本变更未读写 `ans-gateway`；目标现场解封以 S5 只读复算为准。
3. **role-cards done 后内容再变不产生新 `.ans` 通过记录**：S3 契约对 `done` 步骤返回 `idempotent:true`
   （不重写记录，终态不 reopen）。桌面靠「新指纹 + 新 Crew 写卡锚」放行再次派发；记录仍为首次通过记录。
   若验收要求「每次内容变化都产生新记录」，需 S3 扩展契约（不在本写集，停止回报统筹）。
4. **existing/legacy 角色缺工作文档的死角**：结构校验对 existing/legacy 缺工作文档只 warning，但
   `completeRoleCardsStep` 契约要求六件齐全 ⇒ 桌面在六件不齐时只记诊断、不派、下次重试；
   需 Crew 重写/人工补齐后才收口（本变更不伪造缺失文件、不反馈 blocker）。
5. **probe 不检测 role-cards done 后的手工内容变化**（方案 §10.2/§10.6：完成且已派发后探针不读全部角色文件；
   Crew 事件仍会触发完整检查）。终态不可回退由 readiness/后续验收与 flow supersede 处理，本轮不加 reopen。
6. **目标角色尚未枚举时探针跳过**：交给既有事件触发与 100/300/600ms 有界重试，避免刷新抢跑。
7. **legacy（无团队计划）跨重启**：旧派发无 `stepId="role-readiness"`，按方案「早期无 stepId 不算」
   不计为 readiness；同一进程由版本化键去重，重启后同内容可能再派一次（方案 A2 明确为可接受迁移成本）。
8. **未改**：`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`、`test/编排/**`、`test/测试/**`、
   `test/桌面UI/**`、`test/桌面应用/e2e/main.mjs`、package/tsconfig/vite、其他角色卡/边界、顶层
   `docs/scheduling|acceptance|communication|planning`；未新增 `test/桌面应用/` 文件；未新增依赖；未 commit。
9. 运行期 Set/反馈去重是内存态：重启后同指纹可能再反馈/再派一次（账本锚会挡住已派发的 team-plan 流程；
   见 §五.7）。

## 六、候选哈希（工作区当前内容）

| 文件 | `git hash-object` | `sha256sum` | 大小 |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | `c3a2adcaf8774f01d2f408f820fcd0344be3b926` | `5f9b05dfa79d14961fdf7efcbf15ce3c2b154921b7c77d74699b1840fe125352` | 295,608 B |
| `app/desktop/governance-advance.ts` | `02fe42fd2ea18b0f305450b3027afb93306670f6` | `9e1b4ebf42a3a07005cf3a62583088f40d48c28cf882e41da16b4d5279bc4fe7` | 79,423 B |
| `test/桌面应用/interface.test.ts` | `3118a35b9b4f5598f9fa7c78214a44b3bafcb9a8` | `a97734c3efcc9cc4cf190341bf7a50a0304407e4e483cd022e8371d868b4545a` | 330,408 B |
| `test/桌面应用/acceptance-dispatch.test.ts` | `d321afd85bbae8a15ed3a9910c7c1183903e91fa` | `2141841bcc14650ba65d9323d16bbc1b54004a478fc80681adfcd8922257c9e9` | 108,863 B |
| `test/桌面应用/e2e/main.mjs`（I9 测试夹具修复，见 §2.8） | `142e0f18d7701964053d97c6412d38809684c329` | `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b` | 173,881 B |

> 基线（S4 入口，`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`）：
> `interface.ts` `61e91311…`/`1f580f0f…`；`governance-advance.ts` `8f90a713…`/`90dbfbd1…`；
> `interface.test.ts` `3e3b9083…`/`45cec1f8…`；`acceptance-dispatch.test.ts` `0b4a1ca6…`/`c87341ec…`。
> 四个文件在实施前均已含 i18n B0/B3 与目录 v3 的**既有上下文**改动；本变更只叠加 §二 所述 hunk，
> 未回退/改写前序改动。候选哈希在本文档写盘后复算；若文件随后变化，受影响证据失效。

## 七、证据文件

目录：`角色卡/桌面窗口/docs/change/2026-10-23_change_governance-advance-redispatch-evidence/`

| 文件 | 内容 |
| --- | --- |
| `directed-interface.log` | `node --test test/桌面应用/interface.test.ts` 原始输出（116/116，exit 0，含命令/时间/Node 版本） |
| `directed-acceptance-dispatch.log` | `node --test test/桌面应用/acceptance-dispatch.test.ts` 原始输出（36/36，exit 0） |
| `desktop-directory.log` | `node --test "test/桌面应用/"*.test.ts` 原始输出（552/552，exit 0） |
| `directed-redispatch-e2e.log` | `node --test test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` 原始输出（6/6，exit 0；只运行未改测试文件） |
| `e2e-main-fresh-userdata-1/`、`-2/` | I9 修复后真实 Electron（fresh `--user-data-dir`）原始 `launch.txt`/`stdout.log`/`report.txt`/截图；两次 `E2E_PASS=true`、`E2E_FAILURES=` 空 |
| `typecheck.log` | `npm run typecheck` 原始输出（exit 0） |
| `candidate-hashes.txt` | HEAD、四个候选文件 `git hash-object`+`sha256sum`+大小、`git diff --name-only`、`git status --short -- src app test`、暂存区为空 |

## 八、状态声明

- 状态：**implemented-unverified**；未验收、未提交、未推送、未合并、未发布。
- 未启用 task_ops；不伪造任务令牌、锁、审批或机器预检。
- 未使用真实 `.env`/凭据；测试只写系统临时目录与既有夹具。
- 本记录不声明 T3 全量、e2e、真实 Electron、目标项目只读复算或独立验收通过；这些属 S5/S6。
