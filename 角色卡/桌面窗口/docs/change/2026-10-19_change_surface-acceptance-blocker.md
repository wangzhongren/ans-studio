---
id: surface-acceptance-blocker
type: change
title: 收尾门阻塞原因对 Lead（主入口）可见——具体 issue + 可操作建议作为系统行，按 flow+原因去重
created: "2026-10-19"
status: implemented
---

# 收尾门阻塞原因对 Lead（主入口）可见

## 客户反馈（原话）

> 这个难道不是bug吗

真机现场（R2）：所有 retake 已 `done`，但自动验收派发一直不触发。根因是 `flowCompletionIssue`
的具体原因（旧步骤 `aborted`/`failed` 未标 `superseded`）**只写进诊断日志** `acceptance.flow.incomplete`——
Steward/客户看不到，只能由操作者手动复算流程单与账本，再把原因转告。门禁规则本身 fail-closed 是对的；
**静默**是缺陷。

## 根因

`app/desktop/interface.ts::dispatchAcceptanceForFlow` 在 `flowCompletionIssue(...) !== undefined` 时只做
两件事：写诊断、释放运行期占位。没有任何面向治理角色/客户的可见信号。每次 settle 都会重新检查（有界、
事件驱动），但阻塞原因始终不可见。

## 改动（只增加如实可见性；不改门禁判定）

### 1. `app/desktop/governance-advance.ts`

- 新增导出 `governanceAcceptanceBlockedNote(flowId, issue)`：生成阻塞系统行文案——
  `自动验收未派发：流程 <flowId> 未通过收尾门。原因：<issue>。建议：…`。
  - 对**可修复阻塞**（未完成/阻塞步骤、缺派发/决定/产物证据、账本坏行、缺步骤表、缺验收步骤、未结算决定）：
    建议「若旧步骤已被 retake 取代，请把对应的 aborted/failed 步骤在流程单 `docs/flows/<flowId>.md` 中标为
    `superseded`（或 `cancelled`）；或用新的 `stepId` 重新派发任务并在流程单中更新状态与证据。修正后下一次
    事件会自动重新检查；应用不会自动改写流程单，也不会自动派 Proof。」
  - 对**终态**（验收步骤已完成 / 已有验收决定）：如实说明「无需操作：流程已收口，应用不会重复派发验收复核。」
- 将这两条终态原因抽成常量 `FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DONE` /
  `FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED`（集合 `FLOW_COMPLETION_TERMINAL_REASONS` 供文案区分）。
  `flowCompletionIssue` 的返回值**逐字不变**（仍为这两个常量），判定逻辑未改。

### 2. `app/desktop/interface.ts`

- 新增运行期去重记忆 `acceptanceBlockedNotified: Map<flowKey, issueText>`：
  - `flowKey` 同既有 `acceptanceFlowKey(projectRoot, flowId)`（项目 + flow）；
  - 门被挡时：仅当「上次已告知的原因 ≠ 本次原因」才发系统行，并记诊断
    `acceptance.flow.incomplete.notified`（`flowId`、`reason`、落位 `roleId`）；同一原因重复 settle **不发**；
  - 门通过（`flowCompletionIssue` 返回 `undefined`）时**清除**该 flow 的记忆 ⇒「已解决后再次阻塞」
    （即使原因文本相同）也会重新告知一次；
  - 诊断 `acceptance.flow.incomplete` 原样保留（每个阻塞检查仍记录）。
- 系统行落位：**Lead（主入口 `listing.primaryRoleId`，真实 trio = `liaison`）**。2026-10-19 客户决定
  （经项目管理转达）：自动验收门的反馈**统一发给 Lead，不再发 Convener**——包括「未派发 + 具体原因 +
  建议」「已自动派发验收复核给 Proof」以及既有失败/引擎无法确定行。不按 `governanceFunction` 另行推导，
  不硬编码角色 id，也不落给触发 settle 的任意项目角色。
- `note(summary)` 保持单参（无 roleId 覆盖）；既有失败/成功系统行路径只改落位角色，措辞逐字不变。
- 系统行仍走既有 `delivery-note` 通道（渲染侧既有系统行样式），runtime 路由沿用既有
  `info.runtime ?? acceptanceRuntimeHints` 规则。

### 3. 明确未改变（纪律）

- **不改门禁判定**：`flowCompletionIssue` 的通过/阻塞条件、证据模型、终态判定逐字不变；
- **不自动把 failed/aborted 当 superseded**，不自动改写流程单；
- **不自动派 Proof**：门未通过时仍不打开 verifier 会话、不写账本；
- 不写治理账本（本改动不产生新账本条目）；
- 不循环重试：只在既有事件驱动检查点上发一次（每 flow+原因），没有新定时器/轮询。

## 行为矩阵

| 场景 | 阻塞系统行 | 诊断 | 派发 |
| --- | --- | --- | --- |
| 首次阻塞（原因 X） | 1 条（**Lead**） | `acceptance.flow.incomplete` + `…notified` | 不派 |
| 重复 settle（仍原因 X） | 0 条（去重） | `acceptance.flow.incomplete` | 不派 |
| 原因变为 Y | 1 条（含原因 Y） | `…incomplete` + `…notified` | 不派 |
| 门通过 | 0 条阻塞行；清除去重记忆；成功行 1 条（**Lead**） | 无阻塞诊断 | 既有自动派发路径不变 |
| 门通过（引擎无法确定）后再次阻塞原因 X | 1 条（重新告知） | `…incomplete` + `…notified` | 不派 |
| 终态（验收 done / 已有验收决定） | 1 条「无需操作」（每原因一次，**Lead**） | `…incomplete` | 不派（本就不该派） |

## 测试

`test/桌面应用/acceptance-dispatch.test.ts`（既有 8 例断言零放宽；新增 3 例）：

- **门 blocked ⇒ Lead 恰一条系统行**：导入补齐检查被 `delivery-server=pending` 挡下，Lead 收到恰一条
  `自动验收未派发`，含具体原因、`aborted/failed`、`superseded`、`stepId` 与流程单路径；不冒充「已派发」；
  **Convener 与其他角色零条**。重复 settle 3 次仍 1 条、不派 Proof；流程单改为 `aborted` 后新原因再发 1 条；
  修正并补 `dispatch.accepted` 后门通过 ⇒ 仍恰派一条验收任务、阻塞行不增加、既有「已自动派发」系统行
  （落 Lead、不发 Convener）与账本审计不变。
- **解决后再次阻塞同一原因**：引擎无法确定 ⇒ 第一次门通过（不派发、释放占位）；把流程单改回同一
  `pending` 后再 settle ⇒ 重新告知一条（去重记忆已在门通过时清除）。
- **有 Convener 也统一落 Lead**：完整 trio listing（含 `schedule` 职能角色）下，阻塞行仍只落
  `primaryRoleId`（`liaison`），Convener/其他角色零条。
- `test/桌面应用/runtime-resolution.test.ts`：既有断言按新落位更新 `liaison`（不再 `convener`），
  「引擎无法确定」系统行仍每项目恰一条；`test/桌面应用/interface.test.ts` 的成功行断言改为 Lead，
  并钉住 Convener 不收到自动验收反馈（用自动验收标记过滤；回交/派发类系统行不误伤）。

真实输出（2026-10-19，本机 macOS）：

- `node --test test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/runtime-resolution.test.ts`
  ⇒ **24 计 / 24 过 / 0 红**（acceptance-dispatch 11 例，含新增 3 例）。
- `node --test test/桌面应用/interface.test.ts` ⇒ **58 计 / 58 过 / 0 红**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **625 计 / 624 过 / 1 红**；唯一红＝已知既有
  `test/桌面应用/runtime-ui.test.ts:69`「renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务」
  （renderer `localStorage` 钉，属桌面UI/渲染域；按要求未触碰）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险（如实登记）

- 去重记忆是**运行期**的（每进程）。应用重启后同一 flow 的同一阻塞原因会再告知一次——视为可接受：
  重启后 Lead 重新看到一次当前阻塞是如实状态，不是刷屏（仍每原因一次）。
- 落位完全依赖 listing 的 `primaryRoleId`（真实 trio = `liaison`）；若 listing 异常给出空串，系统行
  无处呈现（诊断仍记）。该字段由门禁引擎 `listProject` 唯一定义，本层不另推导。
- 终态两条（验收步骤已完成 / 已有验收决定）也会各发一次「无需操作」系统行；若未来认为这类终态完全
  不需要告知，只需在 Interface 判定处跳过，文案常量已独立。
- 不改变 `flowCompletionIssue` 判定、不自动把 `failed`/`aborted` 当 `superseded`、不自动派 Proof、
  不写账本；未碰 `src/**`、`app/renderer/**`、其他角色文件；未 commit。
