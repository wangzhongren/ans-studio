---
id: lead-workflow-manager-flow-tools
type: change
title: 任务文案改用 flow 工具推进（YAML 已存在时）＋主理 Lead 成为工作流管理者（Lead→Steward 协调）
created: "2026-10-20"
status: implemented
---

# flow 工具文案修正 ＋ Lead 工作流管理者

## 真机问题

1. **flow 工具已注册但 Steward 没调用**：应用派给 Convener 的任务文案仍是旧的「请先写流程状态
   YAML docs/flows/…yaml」，所以它照旧去 `write_file`，不调用 `flow_get` / `flow_step_update` /
   `flow_step_supersede`。只有 YAML **不存在**（初始创建）时才该要求写文件。
2. **客户拍板**：主理 Lead（Liaison）成为工作流管理者，可直接向 Steward（Convener）派发协调消息；
   其余派发边界不变（Convener → 项目角色；项目角色/其他来源一律拒绝）。

## 改动

### 1. `app/desktop/governance-advance.ts`

- `buildGovernanceAdvanceMessage` 新增可选第三参 `options.flowStateExists`（缺省 ⇒ 旧文案逐字不变）：
  - **YAML 不存在**：proposal accept 保留「请先写流程状态 YAML …首个步骤为提名」初始创建文案；
    appointment 保留「请写流程状态 YAML …并派发已批准步骤」。
  - **YAML 已存在**：proposal accept / accept-quick / appointment 的 Convener 文案改为
    「流程状态 YAML 已存在（path）；请用 `flow_get` 读取当前 revision，再用 `flow_step_update` /
    `flow_step_supersede` 推进步骤；不要直接 write_file 流程 YAML；不要把步骤说成已派发」。
- 新增 `buildNominationAlreadyDoneMessage(flowId)`（提名已完成 ⇒ 请 Steward 继续下一步，flow 工具口径）
  与 `governanceNominationAlreadyDoneNote()`（系统行「提名已完成，未重复派发…」）。

### 2. `app/desktop/interface.ts`

- `advanceGovernanceFlow` 与写卡后推进检查调用 builder 时传
  `flowStateExists: existsSync(projectRoot/docs/flows/<flowId>.yaml)`。
- `nomination-after-flow` followUp：拿到合法流程 YAML 后，若首步 nomination 已 `done`
  （`waitForFlowStateYamlFact` 既有 `nominationDone` 事实）⇒ **不再派 Nominator**：
  - 诊断 `advance.nomination.already-done`；
  - 向 Steward 投「提名已完成，请继续」任务（flow 工具口径）；
  - 系统行「提名已完成，未重复派发；已请 Steward / 统筹 继续下一步」；
  - 返回 `{ok:true, followUpRoleId:"convener"}`（两段式契约不破坏：第一段已投、第二段有据收口）。
  - 未 done ⇒ 旧行为（派 Nominator 恰一次）。
- 写卡后推进检查的「已派 convener」账本判据跳过 `power:"liaison"` 条目——Lead→Steward 协调消息不是
  步骤派发，不得据此跳过 appointment → Convener 的补齐推进。

### 3. `app/desktop/session.ts`

- `dispatchTask` 注入条件从 `canSchedule` 扩展为 `canSchedule || canLiaise`（编排能力矩阵已标
  liaison `dispatchTask:true`）；复用 `routeDispatch`。
- `routeDispatch` 来源校验（trio）：允许派发主人（Convener）**或** Liaison；single 仍只允许主入口。
- 目标校验：内置治理角色默认仍拒绝；**唯一例外** `fromRoleId === "liaison" && targetRoleId ===
  "convener"`（与编排 `evaluateCoordinateGate` 同口径）。
- 门禁 action：上述例外 ⇒ `coordinate`（要求合法 flowId，stepId 可选）；其余仍 `dispatch`。
- 投递/去重：协调消息不套用项目步骤的 duplicate-dispatch 去重（coordinate 门负责）；仍按内容/在途窗口
  正常去重（送达即释放，同文可再次协调）。
- 系统行/账本：队列摘要「协调 · 来自 Lead → Steward」；账本 `dispatch.accepted` 以
  `actorRoleId=liaison`、`power:"liaison"`、`targetRoleId=convener` 入账，**不写 stepId、不写 trigger、
  不写 customer.decision**——不是客户批准、不解锁任何门禁。回执明说「协调 ≠ 客户批准」。
- Lead→Steward 全程不弹任何客户卡。

### 4. 测试（均在 `test/桌面应用/**`）

- `interface.test.ts`：新增 builder 文案单测（YAML 不存在旧文案 / 已存在含 flow_get+flow_step_update+
  flow_step_supersede 且不含「请先写流程状态 YAML」；appointment 同口径）与集成例（YAML 已存在且
  nomination done ⇒ Convener 收 flow 工具文案、Nominator 零派发零会话、系统行如实、结果
  `followUpRoleId:"convener"`）。
- `dispatch-delivery.test.ts`：新增 Lead→Steward 协调例（受理并投递、零客户卡、同文可再发、账本
  power=liaison/来源 Lead/目标 Steward/无 stepId/无 customer.decision）与边界例
  （Liaison→项目角色仍被 dispatch 门禁 wrong-role 拒；Convener→Convener 仍拒；项目角色无 dispatchTask）。
- `session.test.ts`：能力路由断言更新——Liaison 现获得 `dispatchTask`（Lead 工作流管理者）。
- 既有「Convener→项目角色」「派发≠授权」「duplicate-dispatch」「内置目标拒绝」断言不放宽。

## 测试与证据（真实输出）

- `node --test "test/桌面应用/interface.test.ts"` ⇒ **70/70 过**
- `node --test "test/桌面应用/operator-wiring.test.ts"` ⇒ **49/49 过**
- `node --test "test/桌面应用/dispatch-delivery.test.ts"` ⇒ **52/52 过**
- `node --test "test/桌面应用/session.test.ts"` ⇒ **30/30 过**
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **654 计 / 654 过 / 0 红**（17.0s）
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **31/31 过**（0.9s；一次并发运行曾在
  `b-proposal-accept-timing` 的尾部时序断言偶发超时，单独重跑与整目录重跑均绿——非本改动路径）
- `npm run typecheck` ⇒ **exit 0（0 错）**

## 残余风险

- 协调消息账本条目携带 flowId（便于追溯）。已过滤「写卡后推进」的 convener 已派判据；其他账本消费者
  均要求 stepId 匹配，协调条目不写 stepId，不会误当步骤派发/验收证据。
- 协调消息仍走既有 `planDispatchDelivery` 必读引用接线：任务文本显式引用的文件缺失时 fail-closed 拒投
  （与派发同口径，未放宽）。
- `flowStateExists` 以调用时 `existsSync` 读数为准；YAML 在派发与投递之间的极短窗口内被创建/删除时，
  文案可能与最终状态差一拍（不改变投递/门禁语义）。
