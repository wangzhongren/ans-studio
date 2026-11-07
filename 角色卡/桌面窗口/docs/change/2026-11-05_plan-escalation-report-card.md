# 桌面窗口变更记录：方案升级报告卡（convener 提交 → 客户主权裁决）

- **任务 / 角色**：客户已批准「运营（convener）增加一个『方案不合理报告卡』」；桌面窗口（独立固定上下文）复核未提交实现候选并补测试。
- **日期 / 状态**：2026-11-05；**implemented-unverified**（实现与测试完成，未独立验收）。**未 commit / 未 push**。
- **授权与语义**：仅 convener 可提交；工具只提交/呈现，不派发、不写文档、不改需求或验收标准；应用发行客户主权 decision 卡（选项 `escalation-revise` / `escalation-environment` / `escalation-continue` / `escalation-stop`，推荐 `escalation-continue`）；判断器/委托/@决策永不代答；同一 flow 至多一张在途卡；客户裁定后应用如实通知 convener/chief，选「修订方案」时向 rapporteur（策划）投递重做消息；同 flow 连续 blocked ≥2 次给 convener 一条提示（不自动升级）。
- **写集**：`app/desktop/session.ts`（候选中复核并修 3 处）、`test/桌面应用/version-change.test.ts`（追加 6 个测试）、本记录。候选另含 `app/desktop/plan-escalation.ts`、`app/desktop/customer-input.ts`（复核，未改）以及跨角色 `src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts`、i18n messages（只读消费，非本角色写权）。**未改**角色卡/边界/`memo.md`/`docs/planning/**`/其它角色代码与资料。
- **基线**：worktree `trunk-amendment`，分支 `feat/plan-escalation-card`。改动前 `node --test test/桌面应用/version-change.test.ts` = **36 / 36 pass**。

## 一、这个功能做什么（大白话）

流程里的运营（convener）如果判断方案或验收要求根本不可执行（例如要求应用做它做不到的 OS 级隔离），可以调用 `report_plan_escalation` 把问题升级给客户。应用会弹一张**客户本人**才能回答的决定卡：修订方案/验收要求、客户提供环境、继续核查、终止。卡只是「申请」，不是「批准」：应用不会自己改方案、需求或验收标准；客户选完之后，应用如实告诉运营和幕僚结果；选「修订方案」时再给策划（rapporteur）投一条「请按客户裁定重做方案」的消息。

## 二、实现位置与当前行为

| 位置 | 行为 |
| --- | --- |
| `app/desktop/plan-escalation.ts`（候选未改） | `buildPlanEscalationCard` 纯函数组装卡面：`kind:"choice"`、`cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`、flowId 透传；四选项固定顺序、恰一推荐（`escalation-continue`）；preview 含流程/类别中文标签/摘要/「申请，不是批准」；空 flow 或空 summary ⇒ `undefined`（fail-closed）。`PLAN_ESCALATION_OPTION_IDS` 是冻结词汇。 |
| `app/desktop/customer-input.ts`（候选未改） | `isApplicationDecisionReservedForCustomer` 导出并纳入方案升级四选项词汇；整卡命中 ⇒ 不进 `tryAutoSelectDecision`、不进 `@决策` 消费者、不进判断器，且通道结算最后防线拒绝 judge/directive 来源。 |
| `app/desktop/session.ts`（本次复核修 3 处） | ① convener 会话注入 `reportPlanEscalation` 能力（身份强制为会话角色，模型自报角色被覆盖）；② `reportPlanEscalation` 只做校验/去重/发卡（角色、flowId slug、category、summary；`projectRoot\0flowId` 在途去重；无治理会话/通道 ⇒ `plan-escalation-channel-unavailable`；返回 `{ok:true,requestId,status:"presented"}`，申请≠批准）；卡经 `withRequestLifecycle`（`notify:"none"`）呈现，`request.resolved.by` 只可能是 customer；③ `afterPlanEscalation` 裁定后通知 convener/chief；「修订方案」向 rapporteur 投递重做消息；④ 星形任务回交按 flow 聚合连续 blocked，达到 2 次给 convener 一条 delivery-note 提示，不自动升级。 |

## 三、本次复核发现并修复的缺陷（均在 Section 1 内）

1. **「连续 blocked」计数只在 done 时清零，failed 不算中断**（`session.ts`）。提示文案写「已连续 N 次 blocked 报告」，但旧实现中「blocked → failed → blocked」也会被算成连续 2 次，提示内容与事实不符。改为**任何非 blocked 报告（done/failed/aborted）都清零**，严格按「连续」语义。
2. **「修订方案」在 demo 运行时被静默跳过**（`session.ts`）。原条件 `runtime !== undefined && runtime !== "demo"` 会在 demo 项目里直接丢掉客户裁定要求的重做消息，既不投递也不留队列，违反「不丢消息、失败如实保留」纪律。改为只要求 runtime 已知；是否自动开 demo 会话交给投递机的统一政策（生产宿主 `demoRuntimeAutoDeliver:false` 仍不自动开启，消息保留在队列）。
3. **未使用的导入**（`session.ts`）：`PLAN_ESCALATION_OPTION_IDS` 在 session 内未使用，移除。

## 四、测试覆盖（`test/桌面应用/version-change.test.ts` 追加 6 例）

- 卡面：`kind/cardKind/application/sourceRoleId/flowId/metadata` 透传；四选项顺序与 `PLAN_ESCALATION_OPTION_IDS` 逐字一致；恰一推荐且为 `escalation-continue`；preview 含流程、类别中文标签（四类逐一）、摘要、「申请，不是批准」；共享 `validateDecisionCardRequest` 通过（application-owned）；空 flow / 空 summary ⇒ `undefined`。
- 客户主权：整卡 `true`；`application` 缺省/false、选项子集、cardKind 非 decision ⇒ `false`；真实通道层 `@决策` 不消费、判断器不被调用、原卡到客户并由客户手点结算。
- SessionManager：仅 convener 注入能力、模型自报角色被会话身份覆盖；非 convener/非法 flowId/非法 category ⇒ 对应错误码且不发卡；同 flow 第二次提交 ⇒ `plan-escalation-conflict`；裁定「继续核查」后 convener/chief 各一条如实通知、`request.resolved.by=customer`、无 `task.created`（不派发）、不写文档；裁定后在途释放可再次提交；未获裁定只通知 convener 且不宣称已变更；「修订方案」向 rapporteur 投递恰一条重做消息（pi 运行时，投递机自动开目标会话）。
- 连续 blocked：单次不提示；连续 2 次提示恰一条且文案含 flow/次数/`report_plan_escalation`；`completed`（done）与 `failed` 都会清零；清零后再连续 2 次重新提示；提示仅为 delivery-note，不派发新任务。该用例使用测试文件内新增的可推送事件流句柄驱动真实 `SessionManager` 回交链路。

**未覆盖**：`src/provider/runtime/tools.ts` 的工具注册/回执与 schema（运行时核心属主，不在本角色 Section 1）；重启后「在途卡」的恢复语义；`test/项目管理/shared/i18n.test.ts` 的键面由 i18n 属主维护（本次只读跑通）。

## 五、边界缺口（未改，交属主）

1. **i18n 文案与实现不一致**：`main.planEscalation.result.revise` 写「已通知幕僚重做方案」（英文 "the chief has been asked to rework the plan"），实际是向**策划（rapporteur）**投递重做消息，幕僚只是收到裁定通知。文案属 `src/common/shared/i18n/messages/**`（不在桌面窗口 Section 1），需 i18n 属主改为「已通知策划重做方案」或等价表述。
2. `app/desktop/plan-escalation.ts` 的 `PlanEscalationCategoryView` 与 `src/model/runtime.ts` 的 `PlanEscalationCategory` 是两份同形联合类型；本次未新增类别，无漂移，后续扩类别时需两处同步（跨角色）。

## 六、验证证据（原始结果）

1. `node --test test/桌面应用/version-change.test.ts` → **tests 42 / pass 42 / fail 0 / cancelled 0 / skipped 0 / todo 0**（改动前基线 36/36）。
2. 受影响相邻套件：`node --test test/桌面应用/handback-delivery.test.ts test/桌面应用/star-routing.test.ts test/桌面应用/task-restart.test.ts test/桌面应用/decision-service.test.ts` → **tests 48 / pass 48 / fail 0**。
3. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **tests 612 / pass 612 / fail 0 / cancelled 0 / skipped 0**。
4. `node_modules/.bin/tsc --noEmit` → **exit 0**（全仓 0 error）。
5. 只读交叉：`node --test "test/项目管理/shared/i18n.test.ts"` → **13 / 13 pass**（新增 key 未破坏目录一致性）。
6. 文件哈希（写盘后实测，SHA-256）：`app/desktop/plan-escalation.ts` `bf19ddafed988fdc21b8e4e7565473d95f4f13fe1fd3817a2e4afea6ff2fa54f`；`app/desktop/customer-input.ts` `74d5b005a4fa66f3932d66669d3aac1fa3ad1e448eaadbeffcc3dae0372a6550`；`app/desktop/session.ts` `364b697b716a28f212d4111bfc60c07d7453ea548d4cf85440a77023c94d13e1`；`test/桌面应用/version-change.test.ts` `4c1d7d834ae493f9b04d13a9a4186d8728b7906bcaae4ed6927e892234db4cc9`。

## 七、状态

实现与定向测试完成；无独立验收结论；未提交/未推送。跨角色文件（model/provider/i18n）与重启恢复语义未由本记录覆盖。
