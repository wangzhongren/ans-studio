# 变更记录：验收复核自动派发成为标准流程（2026-10-19）

## 1. 客户反馈与根因

客户原话：

> **「这个独立核准应该是标准流程，而不是我在发给他。」**
> **「内置角色应该有自己的工作流。」**

真机现象：交付步骤全部 `done`、测试 155/155、e2e 104/104 后，应用的验收派发门没有自动打开；
Steward（Convener）明确说不派发 Proof；最后是客户手动给 Proof 发消息。

本角色定位到三个根因（全部在桌面窗口写入面内）：

1. **触发面太窄**：`dispatchAcceptanceAfterHandback` 只挂在项目角色回交送达 Convener 且其 settle 的
   回调上。治理步骤（nomination / roles-ready / contract-freeze）没有项目角色回交，门永远等不到。
2. **证据模型过严**：`flowCompletionIssue` 要求**每个**执行步骤都有 `dispatch.accepted`，而治理步骤
   由客户决定或产物完成、从不经应用派发。真实 `library-lending` 流程中 `nomination` /
   `contract-freeze` / `roles-ready` 三步没有 dispatch 记录（其余 10 步有），门被永久拦下。
3. **无持久化去重**：只有运行期 `Set`，重启后可能重复或丢失。

本角色写入面仅覆盖 `app/desktop/**`、`test/桌面应用/**`、`角色卡/桌面窗口/**`；未改 `src/**`、
`app/renderer/**` 与他角色文件，不 commit。

## 2. 改动

### 2.1 事件触发（`app/desktop/interface.ts`）

新增验收检查调度（现文件 769–810 行）：

- `scheduleAcceptanceCheck(projectRoot, reason)`：**事件 + 有界 tick**——同一项目在一个 40ms 窗口内
  至多跑一次检查；窗口内后续事件合并、**不顺延**（不是无界轮询）。定时器 `unref`，不阻止进程退出。
- `listGovernanceFlowIds(projectRoot)`：枚举 `docs/flows/*.md`（唯一流程单位）；流程单缺失的 flowId
  无从机械核对。
- 触发点：
  - **任意角色会话 settle**（`emitSessionEvent`，现 819–823 行）——含 Convener 的 schedule-write /
    流程单更新轮；
  - **回交到达**（`onHandbackReceived`，现 996–999 行）：先记住 `flowId` 与证据路径并登记检查；
  - **桌面侧治理账本追加**（`onGovernanceLedgerAppended`，现 1001 行；`advanceGovernanceFlow` 的两处
    `dispatch.accepted` 追加后也直接登记，现 1501/1642 行）；
  - **导入项目 / 应用启动补齐**（`listProject` 末尾，现 1143–1146 行）：trio 项目导入后登记一次；
  - 编排侧 `artifact.observed` / `customer.decision` 追加发生在回合内、`settled` 事件之前
    （`run-role.ts` 在 yield `settled` 前完成 artifact 扫描与账本追加），由 settle 触发覆盖。
- 执行体 `runAcceptanceCheck`（现 1030–1040 行）：逐流程过同一道门。
- **在途守卫**：`SessionManager.hasActiveWorkForFlow(projectRoot, flowId)`（`app/desktop/session.ts`
  现 1283–1301 行）——该 flow 仍有排队/在途派发、回交或运行轮次时，检查推迟到下一次事件，
  避免在交付完成前抢跑派 Proof。回交 settle 是确定性完成信号，走 `force:true` 跳过该守卫。

### 2.2 按步骤类型认证据（`app/desktop/governance-advance.ts`）

新增显式、可测试的步骤类型映射表（现 176–184 行）：

| stepId 词形 | 证据类型 | 认的证据 |
| --- | --- | --- |
| `contract-freeze*` | artifact | `artifact.observed`：`flowId` 匹配且路径在 `docs/contracts/` 下，**或**路径等于流程单显式声明的 `docs/contracts/**` |
| `proposal*` / `flow*` / `schedule*` | artifact | `artifact.observed`：`flowId` 匹配且路径在 `docs/proposals/` 下，**或**声明路径匹配；flow/schedule 另认流程单自身被观测 |
| `nomination*` / `role-readiness` / `roles-ready` / `role-ready` | decision | `customer.decision`：`flowId` 匹配且 `stepId` 匹配；人事步骤另认 `decisionKind:"appointment"`（客户任命决定即角色就绪证据）。只认 `customerDecision ∈ {accepted, accepted-quick, appointed}` |
| 其余（`delivery-*`、`*e2e*`、`cleanup*`、`rework-*`、`integration-*`、`verify-*`、未知 id） | dispatch | `dispatch.accepted` 且 `flowId` + `stepId` 匹配 |

- `flowStepEvidenceKind(stepId)` / `flowStepHasEvidence(...)`（现 183 / 261 行）：纯函数、可单测；
  `dispatch.accepted` 对任何步骤都是有效在案记录（旧账本兼容）。
- `flowCompletionIssue`（现 313 行）：仍要求执行步骤状态为 `done`，但把「每步必须有 dispatch」
  改为「每步必须有与类型匹配的证据」。缺证据按类型分组报告：
  `缺少 dispatch.accepted 记录（…）` / `缺少客户决定证据（…）` / `缺少产物证据（…）`。
- **不放宽**：执行步骤仍须 `done`；状态、账本、验收步骤、未结算决定检查逐字保留；账本为空时
  「全部 done」也不放行——绝不退化为「只看 done 文本」。既有 dispatch 步骤错误文案保持原词，
  既有测试断言零放宽。

### 2.3 自动派 Proof + 持久化去重（`app/desktop/interface.ts` 现 871–975 行）

- 门通过后：`openBackground` + `sendBackground` 给 `verifier`，复用
  `buildAcceptanceTaskMessage`（已含质量基线八项 / 真实启动演示 / 架构核对）。
- 成功发送后写一条治理账本：

  ```json
  {"kind":"dispatch.accepted","flowId":"<flowId>","stepId":"verification",
   "actorRoleId":"app","power":"app","trigger":"settle","targetRoleId":"verifier"}
  ```

  不写 `customerDecision` / `decisionEvidence`——**自动派发 ≠ 客户批准**。
- `acceptanceDispatchRecorded(flowId, ledger)`（governance-advance.ts 现 278 行）在读账本时先查该记录：
  重启后补齐检查与任意 settle 都不再重复派。运行期 `Set` 仍保留，拦截同一批并发事件。
- 失败（开会话/发送/账本追加）如实诊断 + Convener / Lead 系统行，删除运行期占位让后续**真实事件**
  可再检查；不循环重试。

### 2.4 可见性

`governanceAcceptanceAdvanceNote(flowId)`（现 388 行）改为：

```text
流程 <flowId> 步骤已全部完成，已自动派发验收复核给 Proof（工作中）
```

系统行落位 `manager.governanceOwnerRoleId(projectRoot)`（trio=Convener；single=主入口 Lead，
`app/desktop/session.ts` 现 1270 行）。文案不出现「客户已批准 / 验收通过」；
`interface.test.ts` 既有断言同步为新文案并新增禁止冒充批准的断言（断言强度未放宽）。

## 3. 影响面

- 只影响 trio 项目的验收复核派发时机/证据判定/去重/系统行；single/旧项目零行为变化。
- 未新增 IPC 通道、未新增写权限、未改渲染侧；不自动验收、不代批——验收卡仍由决策开关 / 判断
  agent / 客户手批。
- **新账本条目**：`dispatch.accepted{targetRoleId:"verifier", stepId:"verification"}`。下游读取账本的
  角色（如 `governance-judge-facts`、`governance-gate`）按旧形状可容忍未知 stepId：
  `verification` 步骤在执行步骤集合中被单列排除，重复派发门禁对 target=verifier 不会被角色触发
  （内置角色不可被派发）。无跨角色接口变更。
- 未碰 `src/**`、`app/renderer/**`、他角色文件；不 commit。

## 4. 测试与真实输出（本机，2026-10-19）

新增 `test/桌面应用/acceptance-dispatch.test.ts`（8 例）：

1. 步骤类型映射表显式可测（产物 / 客户决定 / 派发默认）。
2. **真机回归**：真实 `library-lending` 流程形状 + 同形账本（nomination/contract-freeze/roles-ready
   无 dispatch）⇒ 门通过；并逐条断言是任命决定 + 契约产物证据在起作用。
3. fail-closed：缺客户决定 / 缺产物 / 缺 dispatch 各自拦下；全部 done 但账本为空不放行。
4. `acceptanceDispatchRecorded` 去重判据。
5. 导入补齐：门通过 ⇒ 自动派 Proof 恰一条；任务文本含质量基线八项、真实启动演示、架构核对；
   Convener 系统行「已自动派发验收复核给 Proof（工作中）」且不冒充批准；账本恰一条记录。
6. 任意角色 settle + 流程单变更触发；重复 settle 只派一次。
7. 交付步骤缺 `dispatch.accepted` ⇒ 即使流程单全 done + settle 也不派。
8. 重启去重：账本已有 verifier 派发记录 ⇒ 新 Interface 的补齐检查与 settle 都不重复派。

真实输出：

- `node --test test/桌面应用/operator-wiring.test.ts test/桌面应用/interface.test.ts
  test/桌面应用/acceptance-dispatch.test.ts` ⇒ **110 计 / 110 过 / 0 红**
  （operator 44 + interface 58 + 新增 8）。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **600 计 / 599 过 / 1 红**
  - 唯一红为**既有 HEAD 红线**：`test/桌面应用/runtime-ui.test.ts` 的 renderer 断言
    （`localStorage` 钉，断言 at `:69`），属桌面UI/渲染域，本变更未触碰，按要求不处理；
    变更前基线 592 计 / 591 过 / 1 红，本批净增 8 例、红数未增。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 5. 残余风险

1. **在途守卫依赖内存状态**：重启后队列/在途状态清空，补齐检查可能在 Proof 会话尚未恢复时先派；
   账本去重只保证「不重复派」，不保证「Proof 一定收到」——失败会如实落系统行，后续真实事件可再检查。
2. **运行时择路**：重启后无会话事件时回退桌面默认 `"claude"`（README：桌面默认使用 Claude）；若客户
   实际使用 Pi/Codex，`openBackground` 可能用错引擎或失败并落如实系统行，不会循环重试；下一次真实
   settle 会带上该会话 runtime 并重新检查。要彻底消除该风险，需要主进程持久化「上次选择引擎」
   （装配/preload 面，非本角色写入面），或由渲染侧在导入后上报当前引擎。
3. **编排侧账本写入没有直接回调**：`artifact.observed` / `customer.decision` 的追加由编排在回合内完成，
   本角色经随后的 `settled` 事件观察；若未来编排在 settle 之后追加账本，需要属主角色补通知或
   桌面侧加观测点。
4. **步骤类型靠 id 词形**：新增步骤种类必须在 `FLOW_STEP_EVIDENCE_RULES` 显式登记（映射表可测）；
   未登记的 id 走派发型 fail-closed，不会误放行，但可能导致新治理步骤被拦。
5. **验收任务文本约束非强制**：质量基线/真实演示/架构核对仍是任务文本要求，Proof 是否逐项核对由
   验收卡/客户把关；本变更不改变「不自动批准」。
6. **LLM 角色自律**：Steward 是否及时把流程单状态更新为 done 仍是上游行为；本变更保证「一旦流程单与
   账本齐备，应用就自动派 Proof」，不替 Steward 判断完成。
