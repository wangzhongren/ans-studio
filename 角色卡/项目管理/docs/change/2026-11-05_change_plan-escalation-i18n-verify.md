---
id: plan-escalation-i18n-verify
type: change
title: 方案升级报告卡 i18n 核对与文案修正（22 key，implemented-unverified）
created: "2026-11-05"
updated: "2026-11-05"
timezone: Asia/Shanghai
status: implemented-unverified
related: [plan-escalation]
events:
  - date: "2026-11-05"
    kind: created
    summary: 核对客户批准的「方案升级报告卡」i18n 候选（main 8 + ui 14 = 22 key）；确认分区计数 1206/634/62/3/1905、中英成对、英文零 Han、占位符一致；修正 main.planEscalation.result.revise 的实际接收角色（幕僚/chief → 策划/planner）；node --test i18n.test.ts 13/13
  - date: "2026-11-05"
    kind: updated
    summary: 客户口径变更（不自动发卡，由运营自行选择）：main.planEscalation.blockedHint → blockedPrompt，文案改为首次 blocked 提示 convener 自行判断，占位符由 {flowId,count,summary} 收为 {flowId,summary}；计数不变；同步更新本记录
---

# 方案升级报告卡 i18n 核对与文案修正（`implemented-unverified`）

- 角色：项目管理（`src/common/shared/` 所有者）
- 依据：客户已明确批准「运营（convener）增加『方案不合理报告卡』」特性；本轮任务授权核对 i18n 候选，并只在本角色 Section 1（`src/common/shared/`、`test/项目管理/shared/`）内修正不一致
- 工作树/分支：`.claude/worktrees/trunk-amendment` @ `feat/plan-escalation-card`
- 状态：候选核对 + 文案修正（结果行角色名、blocked 提示 key/文案）；未 commit / push；未声称验收

## 1. 核对范围与结论

对象：`src/common/shared/i18n/messages/zh-CN.ts`、`src/common/shared/i18n/messages/en-US.ts`、`test/项目管理/shared/i18n.test.ts`。

| 检查项 | 结果 |
| --- | --- |
| key 分区计数 | `ui 1206 / main 634 / shared 62 / preferences 3 / 总计 1905`，与测试断言一致（`node --test` 通过） |
| 新 key 数量 | `main.planEscalation.*` 8 个、`ui.planEscalation.*` 14 个，合计 22 个 |
| 中英成对 | zh 22 / en 22，单边缺失 0 |
| 英文值零 Han | 0 处（家族专项与全量守卫均通过） |
| 占位符中英一致 | 0 处不一致（逐 key 集合比对） |
| 文件字面 key 行 | 两文件各 1905 行、无重复 key |
| 命名/分组 | 与既有约定一致：`main.planEscalation.*` 放在 main 区、`ui.planEscalation.*` 放在 ui 区，均带日期注释；`initiator/flow/categoryLine/summary/semantics/option.*/category.*/result.*` 的 camelCase 与点分层与 `ui.versionChange.*`、`ui.directive.*` 等既有家族同型 |
| 语义（申请≠批准、客户主权、不代答） | `ui.planEscalation.semantics` 明确「这是申请，不是批准……应用不会自动改方案/需求/验收标准」；选项均为客户裁定项；`result.*` 如实回报客户裁定；`revisePrompt` 明确要求重走确认、不得自行改需求或验收标准 |

占位符逐 key（中英一致）：`notAnswered`={flowId,reason}；`blockedPrompt`={flowId,summary}；`revisePrompt`={flowId,requestId}；`result.revise/environment/continue/stop`={flowId}；`result.unknown`={flowId,selected}；`ui.initiator`={role}；`ui.flow`={flowId}；`ui.categoryLine`={category}；`ui.summary`={summary}；其余 key 无占位符。

消费方只读交叉核对（未修改）：`app/desktop/plan-escalation.ts` 的取 key 与传参、`app/desktop/session.ts` 的 `afterPlanEscalation` 通知/续投、`report_plan_escalation` 工具名与 `PLAN_ESCALATION_CATEGORIES`（scheme/environment/authority/evidence）均与目录一致。

## 2. 修正（值 before → after）

### 2.1 `src/common/shared/i18n/messages/zh-CN.ts`

| key | before | after |
| --- | --- | --- |
| `main.planEscalation.result.revise` | `客户裁定（{flowId}）：修订方案/验收要求——已通知幕僚重做方案。` | `客户裁定（{flowId}）：修订方案/验收要求——已通知策划重做方案。` |

### 2.2 `src/common/shared/i18n/messages/en-US.ts`

| key | before | after |
| --- | --- | --- |
| `main.planEscalation.result.revise` | `Customer decision ({flowId}): revise plan / acceptance requirements — the chief has been asked to rework the plan.` | `Customer decision ({flowId}): revise plan / acceptance requirements — the planner has been asked to rework the plan.` |

### 2.3 修正依据

- `app/desktop/session.ts::afterPlanEscalation` 在客户选「修订方案/验收要求」时把 `main.planEscalation.revisePrompt` 投给 `rapporteur`（注释：请策划按客户裁定重做方案），`notify()` 只把结果行发给 convener 与 chief。
- `src/common/门禁引擎/governance-roles.ts:373`：`rapporteur` 的 `displayName` 为「策划」；`src/common/shared/i18n/messages/zh-CN.ts` 的 `ui.role.governance.chief.name` 为「幕僚」（chief / Chief of Staff）。原文「幕僚」指向了未被要求重做方案的角色，也与「应用只如实通报」不符。
- `src/provider/runtime/schema.ts` 的 `report_plan_escalation` promptGuidelines 同述「修订 → 策划按闸门 1 出修订方案」。

key 名、占位符、调用点均未变，消费方无需改动。

### 2.4 `blockedHint` → `blockedPrompt` 重命名与文案（客户口径变更：不自动发卡，由运营自行选择）

`zh-CN.ts`：

| key | before | after |
| --- | --- | --- |
| `main.planEscalation.blockedHint` | `同一流程（{flowId}）已连续 {count} 次 blocked 报告；可调用 report_plan_escalation 发「方案升级报告」卡请客户裁定（方案/环境/权限/证据）。最近报告：{summary}` | `main.planEscalation.blockedPrompt`：`流程 {flowId} 报告 blocked：{summary}。是否调用 report_plan_escalation（类别选 scheme/environment/authority/evidence）向客户发「方案升级报告」卡，或继续核查/派重做，请你自行判断；应用不会自动发卡，也不会替你或客户做决定。` |

`en-US.ts`：

| key | before | after |
| --- | --- | --- |
| `main.planEscalation.blockedHint` | `Flow {flowId} has reported blocked {count} times in a row; you may call report_plan_escalation to send a plan-escalation report card for the customer to decide (plan/environment/authority/evidence). Latest report: {summary}` | `main.planEscalation.blockedPrompt`：`Flow {flowId} reported blocked: {summary}. Decide for yourself whether to call report_plan_escalation (category: scheme/environment/authority/evidence) to send a plan-escalation report card to the customer, or to keep investigating / redispatch; the app will not send a card on its own or decide for you or the customer.` |

占位符由 `{flowId,count,summary}` 收为 `{flowId,summary}`（中英一致）；key 总数不变（重命名），分区计数仍为 1206/634/62/3/1905。文案只提示 convener 自行判断，不暗示应用自动发卡，也不代替运营或客户做决定。

**跨角色联动（不在本角色 Section 1，未修改）**：`app/desktop/session.ts:7596` 仍用 `main.planEscalation.blockedHint` 并传 `count`（`mainT` 的参数类型是 `MessageKey`，重命名后该处 typecheck 会失败）；同文件 `:7583` 的触发阈值仍为 `entry.count >= 2`，与「同一 flow 首次 blocked 即提示」的新口径不一致。需由桌面窗口角色改引用、去掉 `count`、按新口径调整触发条件。

## 3. 命令与原始输出

| 命令 | 原始结果 |
| --- | --- |
| `node --test test/项目管理/shared/i18n.test.ts`（`blockedPrompt` 重命名后重跑） | `tests 13 / suites 0 / pass 13 / fail 0 / cancelled 0 / skipped 0 / todo 0`，`duration_ms 110.3936` |
| `node --test test/项目管理/shared/i18n-guard.test.ts`（补跑，确认值修改无回归） | `scanned=146 allowlisted=23 violations=0`；`tests 6 / pass 6 / fail 0` |
| 专项核对（`node --input-type=module -e` 导入两份目录逐 key 比对） | `counts: {"ui":1206,"main":634,"shared":62,"preferences":3} total: 1905`；`planEscalation zh/en: 22 22 onlyZh: [] onlyEn: []`；`main/ui: 8 14`；`blockedHint present: 0 0`；`blockedPrompt placeholders zh: ["flowId","summary"] en: ["flowId","summary"]`；`placeholder mismatches: 0`；`en Han leaks: 0` |
| `grep -rn "blockedHint" src/common/shared test/项目管理/shared` | 无命中（退出码 1） |

候选哈希（sha256，2026-11-05 写定）：

- `src/common/shared/i18n/messages/zh-CN.ts`：`e3d944daf0e3b035910567cee09ecc224f6cfca58ea028501c8d0afcb2e9756e`
- `src/common/shared/i18n/messages/en-US.ts`：`010bdc904fbcaa9490022b88b2158359903c9d580958455ff2a63350e1331aa2`
- `test/项目管理/shared/i18n.test.ts`：`b24b4a71793c6b5f70bf878c79f626413bced66619a1406fc01865240ba5efd0`

## 4. 未决与边界缺口（不在本轮 Section 1 内，未修改）

1. **消费方仍引用旧 key 与旧触发口径**：`app/desktop/session.ts:7596` 仍调用 `mainT("main.planEscalation.blockedHint", { flowId, count, summary })`；`mainT` 参数类型为 `MessageKey`，重命名后该处 typecheck 会失败。同文件 `:7583` 的 `entry.count >= 2` 与新口径「同一 flow 首次 blocked 即提示」不一致，且应删去不再存在的 `{count}` 传参。修复需改 `app/desktop/session.ts`（属桌面窗口角色，不在本角色 Section 1）——报告为边界缺口，未越界修改。
2. **交付失败时可能高估**：`app/desktop/session.ts::afterPlanEscalation` 仅在 `runtime !== undefined && runtime !== "demo"` 时真正投递 `revisePrompt`，但 `main.planEscalation.result.revise` 无条件发出；无可用运行时/demo 时「已通知策划重做方案」会言过其实。修复同样属桌面窗口角色，未越界修改。
3. **家族契约测试缺口**：`test/项目管理/shared/i18n.test.ts` 本轮只更新了分区计数；尚无 `planEscalation` 家族的逐 key 冻结测试（现有全量 parity/英文零 Han 守卫覆盖成对与泄漏，但本家族的占位符一致性目前只由本轮一次性脚本核对，未进测试守护）。若后续要冻结该家族 key 清单与精确文案，应由项目管理在 Section 1 内补契约测试。

## 5. 保留项

- 未改任何 key 名与数量；未改消费方代码、其他角色文件、`角色卡/项目管理/memo.md`、`docs/planning/**`。
- 未 commit / push；不声称独立验收。
