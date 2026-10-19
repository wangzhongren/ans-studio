---
id: acceptance-reads-flow-yaml
type: change
title: 自动验收门改读 docs/flows/<flowId>.yaml 机器状态（复用编排 flow-state 契约）；Markdown 仅人读视图 / legacy 回退
created: "2026-10-19"
status: implemented
---

# 自动验收门改读流程状态 YAML

## 客户决定（原话）

> 这些全部改成yaml。

自动验收门改为读取 `docs/flows/<flowId>.yaml` 作为**唯一机器状态**（stepId/kind/status/evidence/supersedes），
不再解析 Markdown 表的 stepId/status；同名 `.md` 仅人读视图。YAML 不存在时才兼容回退既有 Markdown 门，
并标注 legacy 诊断。

## 实现归属与分层

- **单一解析/判定实现由编排拥有**：`src/common/编排/flow-state.ts`（编排私有 common），经
  `src/pipeline/orchestration/flow-state.ts` 薄再导出。桌面（`app/desktop/interface.ts`）**只经该
  Pipeline 公共出口**消费 `parseFlowStateYaml` / `evaluateFlowCompletion` / `flowStatePath`，
  不直接 import 私有 common，**不保留第二份解析器**（实施中曾按承诺形状写过边界内临时实现，
  编排契约落盘后已删除）。
- 只改 `app/desktop/**`、`test/桌面应用/**` 与本角色文档；未碰 `src/**`、`app/renderer/**`、
  其他角色文件；未 git 提交。

## 编排契约（正式形状，桌面按此接线）

```yaml
flowId: todo-list-v1
version: 1
qualityTier: production          # prototype | production
steps:
  - id: nomination               # 小写 slug；verification/acceptance 为验收保留 id
    title: 提名
    owner: executor
    kind: customer-decision      # dispatch | customer-decision | artifact | acceptance
    status: done                 # pending|dispatched|delivered|done|superseded|failed|blocked|aborted
    evidence:                    # status=done 必填；对象 {kind, ref}，kind 与步骤 kind 对应
      kind: customer-decision
      ref: appointment           # 对应账本 decisionKind
  - id: contract-freeze
    title: 冻结契约
    owner: executor
    kind: artifact
    status: done
    evidence: { kind: artifact, ref: docs/contracts/todo-list-api-v1.md }
  - id: delivery-backend
    title: 后端交付
    owner: executor
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: delivery-backend }
  - id: verification
    title: 独立复核
    owner: app
    kind: acceptance
    status: pending              # dispatched/delivered=验收进行中；done=已收口
    # supersedes / supersededBy 可选：须指向存在的步骤且不成环；status=superseded 的旧步骤不参与判定
```

校验口径（编排实现，桌面 fail-closed 呈现）：未知字段/未知枚举/缺必填、`done` 无 evidence、
evidence.kind 与步骤 kind 不对应、保留 id 误用（`verification`/`acceptance` 必须 kind=acceptance，
反之亦然）、验收步骤不唯一、`supersedes`/`supersededBy` 指向不存在或成环 ⇒ 校验失败（带 YAML 路径）。
证据按显式 `kind` 对账：dispatch→`dispatch.accepted{stepId}`；customer-decision→`customer.decision{decisionKind}`
且须已结算；artifact→`artifact.observed{artifactPath}`（容忍 `./`/反斜杠、账本无 flowId 也接受）；
acceptance→`customer.decision{decisionKind:"acceptance", customerDecision:"accepted"}`。

## 改动

### 1. `app/desktop/interface.ts`

- `dispatchAcceptanceForFlow`：
  1. **YAML 存在** ⇒ 只按 `parseFlowStateYaml` + `evaluateFlowCompletion` 判定。
     - 校验失败 ⇒ **不派**；具体错误（逐条 `steps[i].字段: message`，最多 10 条）作为 **Lead（主入口）**
       系统行 + 诊断 `acceptance.flow-state.invalid`（`path`/`count`/`mode`），沿用
       `acceptanceBlockedNotified` 去重（同一 flow + 同一原因只发一次；原因变化再发；门通过清除记忆）。
     - `ready:false` ⇒ 不派；`issues` 以「；」拼接作为系统行/诊断（含账本坏行、未完成/阻塞、证据缺口、
       验收已收口/已派发等）。**绝不因 Markdown 可读而回退。**
  2. YAML 不存在（ENOENT）⇒ legacy：读 `docs/flows/<flowId>.md` 并调用既有桌面
     `flowCompletionIssue`，行为逐字不变；诊断新增 `acceptance.flow-state.missing`（`mode:"legacy"`），
     `acceptance.flow.incomplete` 也带 `mode`。
  3. YAML 存在但不可读（非 ENOENT）⇒ 记 `acceptance.flow-state.unreadable`，不派、不 legacy 猜测；
     后续事件可再检查。
- `listGovernanceFlowIds` 改为 `docs/flows/*.yaml ∪ *.md`（YAML 是机器状态；Markdown 仅用于发现
  尚无 YAML 的 legacy 流程与人读）。此前只扫 `*.md`，YAML-only 流程不会被导入补齐检查发现。
- 自动派 Proof 的任务文本、`openBackground`/`sendBackground`、账本
  `dispatch.accepted{targetRoleId:"verifier",stepId:"verification",actorRoleId:"app",power:"app"}`
  与持久化去重语义**逐字未改**。
- 成功系统行在**投递成功后立即发**（此前在持久化/账本 append 之后）：可见性不再依赖审计 I/O 时序；
  账本写失败仍只记诊断、不翻转「已派发」事实（既有语义不变）。
- 诊断增加 `mode: "yaml"|"legacy"`，便于现场区分门实际走的链路。

### 2. `app/desktop/governance-advance.ts`

- `governanceAcceptanceBlockedNote(flowId, issue, flowPath = governanceFlowPath(flowId))`：建议中的
  流程单路径可指向 YAML；缺省仍是 legacy `.md`，既有调用/测试零变化。
- 终态识别扩展：legacy 精确原因之外，编排 `evaluateFlowCompletion` 的固定文案前缀
  （`验收步骤已完成` / `该流程已有验收决定` / `验收步骤状态为…`）也视为「无需操作」；按「；」分段，
  **所有片段都是终态**才给「无需操作」，混合原因仍给可操作建议。
- legacy `flowCompletionIssue`/`parseFlowStepStatuses`/证据映射**逐字未改**（仍服务 legacy 回退与既有测试）。

## 测试（`test/桌面应用/acceptance-dispatch.test.ts`，既有 11 例零放宽）

新增 7 例：
- 纯逻辑（直调 Pipeline 公共出口）：合法机器状态解析 + 显式 kind 证据对账 ⇒ `ready:true`；
  校验 fail-closed（保留 id 误用 / status 非法 / done 缺 evidence / supersedes 引用不存在，错误含 YAML 路径）；
  证据不足逐条列出账本缺口；`superseded` 旧步骤不阻塞（未标则 `failed` 仍 fail-closed）；
  验收 done 终态文案映射到「无需操作」建议。
- 端到端：YAML 齐备（Steward 按契约写出的形状）⇒ 自动派 Proof 恰一次，Markdown 人读视图故意写
  pending 也不参与判定；YAML 校验失败（保留 id 误用）⇒ 不派 + Lead 系统行含具体错误 + 重复 settle
  不刷屏 + 合法 Markdown 也不回退；YAML 证据不足 ⇒ 不派 + 系统行列出 `账本缺少 dispatch.accepted`
  与 `delivery-server`；无 YAML ⇒ legacy 回退行为不变（阻塞行仍指 `.md`、不出现 YAML 诊断）。
- 既有用例未放宽；导入补齐例的账本断言改为有界等待异步 append 落盘（语义不变，消除既有偶发时序）。

真实输出（2026-10-19，本机 macOS，Node v24.14.0；编排 flow-state 已落盘后的最终运行）：

- `node --test "test/桌面应用/acceptance-dispatch.test.ts"` ⇒ **18 计 / 18 过 / 0 红**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **633 计 / 632 过 / 1 红**；唯一红＝已知既有
  `test/桌面应用/runtime-ui.test.ts:69`「renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务」
  （renderer `localStorage` 钉，属桌面UI/渲染域；按要求未触碰）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 对编排接口的依赖与跨角色请求

1. 契约已落盘，桌面已切换为单点 import 公共出口并删除临时实现；后续 schema/枚举变更须保持
   `src/pipeline/orchestration/flow-state.ts` 的导出形状，桌面适配只涉及 `interface.ts` 一处。
2. 请编排提供**写时校验**（Convener/Steward 写 `docs/flows/<flowId>.yaml` 时）并复用同一实现；
   桌面读时校验已直接复用，天然同源，但写时拦截能更早阻止非法 YAML 落盘。
3. 提案接受后的两段式链路已在后续变更
   [proposal-chain-yaml](2026-10-19_change_proposal-chain-yaml.md) 收口：Convener 任务文本要求写
   YAML、`followUp` 只认 YAML（`.md` 仅人读视图/legacy 回退）。

## 残余风险（如实登记）

- YAML 校验是**读时**的：角色写出非法 YAML 不会在写盘时被拦；应用只会在下一次验收检查时 fail-closed
  并落系统行（不循环）。
- legacy 回退没有面向客户的迁移提示（诊断有 `mode:"legacy"`，系统行文案不变）；如需提示「项目仍在用
  legacy Markdown」，可在后续小改中追加。
- `listGovernanceFlowIds` 同时扫 `.yaml`/`.md`；同名 YAML 与 MD 同时存在时以 YAML 判定（设计如此）。
- 未改变自动派 Proof 的任务文本、去重与账本语义；未自动改写流程状态、未自动批准。
