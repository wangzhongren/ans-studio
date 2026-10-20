# 2026-10-19 变更：流程状态改为 Flow YAML 唯一机器状态

- 日期：2026-10-19
- 角色：编排
- 客户决定原话：「这些全部改成yaml。」
- 范围：只写 `src/common/编排/**`、`src/pipeline/orchestration/**`、`test/编排/**`、`角色卡/编排/**`；未改 `app/**`、未改其他角色文件、未 git 提交。

## 1. 问题

真机反复出现流程单 Markdown 表解析问题：

- `verification` 是应用保留的 Proof 验收步骤 id，却被证据整理步骤占用，门禁与桌面各自按正则/前缀猜测，产生「验证鸡生蛋」；
- `verification-evidence` 缺 `dispatch.accepted` 时收尾门打不开，原因只能人工复算；
- `aborted/failed` 行（已被 retake 取代的旧步骤）继续挡住收尾门；
- 状态单元格写作 `done（有落盘/回交证据；…）`、`**done**（…）`，判定要靠「取首词」；
- 证据类型（派发/客户决定/产物）按 stepId 前缀猜，命名一变就错。

根因：**机器状态与人读视图混在同一张 Markdown 表格里**。客户决定改为 YAML。

## 2. 契约

### 2.1 文件

- `docs/flows/<flowId>.yaml` = **唯一机器状态**（应用只解析它做判定）。
- `docs/flows/<flowId>.md` = 仅人读视图（可由 YAML 渲染/由 Steward 编写；应用不解析它做判定）。
- 迁移期兼容：YAML **不存在**时，旧链路仍可回落 `.md`（见 §4）；YAML 存在但非法 ⇒ fail-closed，**不回落 Markdown**。

### 2.2 Schema

```yaml
flowId: todo-list-v1          # 必填；必须与文件名一致；^[a-z0-9][a-z0-9-]{1,63}$
version: 1                    # 必填；正整数
qualityTier: production       # 必填；prototype | production
status: in-progress           # 可选；人读，不参与任何机器判定
steps:                        # 必填；非空数组；id 唯一
  - id: nomination            # 必填；slug；执行/证据步骤不得用 verification/acceptance
    title: 提名               # 必填；非空
    owner: Crew               # 必填；非空（角色 id 或显示名）
    kind: customer-decision   # 必填；dispatch | customer-decision | artifact | acceptance
    status: done              # 必填；pending | dispatched | delivered | done | superseded | failed | blocked | aborted
    evidence:                 # done 必填；pending/dispatched/delivered 可省
      kind: customer-decision # 必须与步骤 kind 一一对应
      ref: appointment        # 账本匹配键（见 §2.3）
    supersedes: []            # 可选；被本步骤取代的旧步骤 id（新→旧）
    supersededBy: retake-1    # 可选；取代本步骤的新步骤 id（旧→新；与 supersedes 双写合法且推荐）
```

> 替代关系：`supersededBy`（旧→新）与 `supersedes`（新→旧）是**同一关系的两个方向**。门禁引擎
> Steward 卡要求双写（旧步骤 `supersededBy: 新id` + 新步骤 `supersedes: [旧id]`），解析器将其归一化为
> 「旧→新」一条边并去重，**不会误报环**；只写一侧仍合法（迁移/简写）。两侧矛盾（如旧侧说被 B 取代、
> 但 B 的显式 `supersedes` 不含旧侧）会被具体 path 拒绝。

保留验收步骤（至多一个，`kind: acceptance`，id 必须是 `verification` 或 `acceptance`）：

```yaml
  - id: verification
    title: 独立复核
    owner: verifier
    kind: acceptance
    status: pending
```

验收完成后允许 `status: done` + `evidence: { kind: acceptance, ref: acceptance }`；验收步骤不允许标 `superseded`（会移除验收出口）。初始状态必须是 `pending`。

### 2.3 证据类型（显式 kind，不再按 stepId 前缀猜）

| step.kind | evidence.kind | evidence.ref 对账键 |
| --- | --- | --- |
| `dispatch` | `dispatch` | `dispatch.accepted.stepId`（同 flowId） |
| `customer-decision` | `customer-decision` | `customer.decision.decisionKind`，且 `customerDecision ∈ {accepted, accepted-quick, appointed}` |
| `artifact` | `artifact` | `artifact.observed.artifactPath`（项目相对路径；账本条目 flowId 缺省或同 flow） |
| `acceptance` | `acceptance` | `customer.decision.decisionKind="acceptance"` 且 `customerDecision="accepted"` |

### 2.4 确定性校验规则（`parseFlowStateYaml`）

1. `flowId` 与文件名一致；`version` 正整数；`qualityTier ∈ {prototype, production}`；`steps` 非空、`id` 唯一且为 slug。
2. 保留 id `verification`/`acceptance`：至多一个、必须 `kind: acceptance`、初始 `status: pending`；不得被 `superseded`；执行/证据步骤占用即报错（错误文案建议改用 `<id>-evidence`）。
3. `kind`/`status`/`evidence.kind` 严格枚举；`done` 必须有 evidence 且 kind 对应；`evidence.ref` 按类型校验（dispatch=slug、customer-decision=已知 decisionKind、artifact=项目相对路径、acceptance=`"acceptance"`）；`pending/dispatched/delivered` 不要求 evidence。
4. `superseded` 不参与完成判定；`supersedes`（新→旧）与 `supersededBy`（旧→新）是同一替代关系的两个方向——同一对步骤**双写合法且推荐**（归一化为「旧→新」一条边，不误报环），只写一侧仍合法；两者必须指向存在的步骤、不得自指/重复、不得形成**真环**（两节点互指或三节点及以上 A→B→C→A）；两侧矛盾（旧侧 `supersededBy=B` 但 `B.supersedes` 明确列出且不含旧侧，或 `B.supersedes` 含旧侧但旧侧 `supersededBy=C≠B`）⇒ 具体 path 拒绝；`failed/blocked/aborted` 未标 superseded 仍 fail-closed。
5. 未知字段（顶层/步骤/evidence）、未知枚举、缺必填 ⇒ 校验失败；错误逐条返回 `{ path, message }`（`path` 如 `steps[2].status`，根文档为 `$`），并附 `error` 单串摘要。
6. YAML 语法错误、重复键（`yaml@2.9.0` `uniqueKeys:true`）、别名炸弹上限（`maxAliasCount:100`）⇒ 校验失败。

## 3. API（`src/common/编排/flow-state.ts`）

```ts
parseFlowStateYaml(text: string, flowId: string):
  | { ok: true; flow: FlowState }
  | { ok: false; errors: Array<{ path: string; message: string }>; error: string };

validateFlowEvidence(flow: FlowState, ledger: FlowLedgerInput):
  | { ok: true }
  | { ok: false; issues: Array<{ stepId: string; path: string; message: string }> };

evaluateFlowCompletion(flow: FlowState, ledger: FlowLedgerInput):
  | { ready: true }
  | { ready: false; issues: string[] };

// 旧桌面风格薄适配（不改判定规则）：ready ⇒ undefined，否则 issues 以「；」连接
flowCompletionIssue(flow: FlowState, ledger: FlowLedgerInput): string | undefined;

flowStatePath(flowId: string): string; // docs/flows/<flowId>.yaml
```

`FlowLedgerInput` 同时接受 `readonly GovernanceLedgerEntry[]` 与 `readGovernanceLedger` 的 `{ entries, errors }`；`errors` 非空 ⇒ `evaluateFlowCompletion`/`validateFlowEvidence` 直接 fail-closed。

`evaluateFlowCompletion` 的 `ready:true` 语义 = **流程齐备、可进入验收**（自动派 Proof / 出验收卡）：执行步骤全部 `done` 且证据对账通过、无未结算决定、验收步骤存在且仍 `pending`。验收已 `done`/已有验收决定/验收已派发 ⇒ `ready:false` 并给出「已收口/验收进行中」原因（不是可再派发）。

公开出口（桌面不直接 import 私有 common）：

- `src/pipeline/orchestration/flow-state.ts`（新，薄再导出，任务书指定）；
- `src/pipeline/orchestration/govern-session.ts`（既有公共出口，同源再导出——桌面可任选其一）。

## 4. 应用侧接线（本批）

1. **派发门禁**（`governance-gate.ts::flowStepExists`）：YAML 存在 ⇒ 只认 YAML（`parseFlowStateYaml` 失败 ⇒ `flow-step-missing`，不回落 `.md`）；YAML 不存在 ⇒ 回落旧 `.md`（迁移兼容）。
2. **写前校验**（`run-role.ts::governedInput`）：确认卡声明路径含 `docs/flows/<flowId>.yaml|yml` 时，从 preview 逐路径正文提取 YAML（与证据包/完整性闸共用 `declaredPathBodies`），`parseFlowStateYaml` 不通过 ⇒ **不发卡、不发行任何写入路径、不写账本**，把具体 `path: message` 返回给 Steward 修正。卡片 `flowId` 与文件名不一致同样拒绝。
3. **路径门禁**（`run-role.ts::governanceActionForPath`）：`docs/flows/<flowId>.yaml|yml` 与 `.md` 一样走 `write-flow` 门（提案必须已被客户接受）；此前 YAML 路径不在门禁路由内。
4. **判断上下文/物证路径**：`judgeArtifactsForCard` 优先 `docs/flows/<flowId>.yaml`，旧 `.md` 仅回落；`schedule-write` 决策的 `artifactPath` 优先记 YAML；`requiredArtifactPaths` 的缺失提示指向 YAML（并注明旧版 `.md`）。
5. **验收机械门槛**（`governance-judge.ts::verifyAcceptanceMechanics`）：流程物证是 `.yaml` 时，`parseFlowStateYaml` + `evaluateFlowCompletion`（账本 `errors` 先行 fail-closed）；非法/未齐备 ⇒ `manual`。旧 `.md` 保留原 Markdown 判定。
6. **判断 rubric**：`schedule-write` 的允许路径改为 `docs/flows/<flowId>.yaml`（注明 `.md` 仅人读视图）；`governance-judge-verdict.ts::scheduleWriteMatches` 同时接受 `.yaml|.yml|.md`。
7. **治理会话提示同步**（`govern-session.ts`，与门禁引擎 Steward 卡文本成对同步）：`STANDARD_WORKFLOW_PROMPT` 增加「流程状态唯一机器状态 = `docs/flows/<flowId>.yaml`（同名 `.md` 仅人读视图，不得承载门禁状态）；步骤必须显式写 `kind`/`evidence`/`supersedes`；保留 id `verification`/`acceptance`（kind acceptance、初始 pending、应用自动派 Proof、不得占用/标 done）」；Proof 复核①改读流程状态 YAML；自动派发条件改为「执行步骤全部 done 且按显式 `kind` 与账本证据对账」；Convener/verifier 纪律中的 `docs/flows/<flowId>.md` 路径改为 YAML 口径。
8. **决策证据包**（`governance-judge-evidence.ts`，2026-10-19 测试角色全仓回归缺口）：flow 物证为 `.yaml|.yml` 时按**文件名 flowId** 复用 `parseFlowStateYaml`——合法 ⇒ `entry.steps = [{id,status}]`（≤50，状态原值保留）；非法/文件名 flowId 与卡片不一致 ⇒ `flow-state-invalid` + 前 8 条 `path: message`，并在 acceptance 底线检查中抑制 legacy 的「流程单缺少可解析的步骤表」泛化文案；`extractFlowExcerpts` 对 YAML 给「流程状态 YAML」有界摘要（flowId/version/qualityTier + steps 的 id/kind/status/evidence），不再标「未解析」。`.md` legacy 分支逐字不变；证据包版本（v2）/上限/哈希语义未变（`EvidenceArtifact.steps` 结构未变，仅解析来源扩展）。

## 5. 迁移映射（旧 Markdown → YAML）

| 旧 status | 新 status |
| --- | --- |
| `pending` | `pending` |
| `in-progress` | `dispatched` |
| `partial` | `delivered`（未 done，收尾门仍挡） |
| `done` | `done` |
| `blocked` | `blocked` |
| `superseded` / `cancelled` | `superseded` |
| `failed` | `failed` |
| `aborted` | `aborted` |

旧「按前缀猜证据」的映射必须在新 YAML 里**显式写出**：

- 提名/角色就绪（`nomination*`、`role-readiness`、`roles-ready`、`role-ready`）→ `kind: customer-decision`，`evidence.ref: appointment`（账本 `customerDecision=appointed`）；
- 契约冻结/提案/流程写入（`contract-freeze*`、`proposal*`、`flow*`、`schedule*`）→ `kind: artifact`，`evidence.ref` 写实际产物路径（需有 `artifact.observed`）；
- 交付/集成/证据整理（`delivery-*`、`integration*`、`verify-*` 等）→ `kind: dispatch`，`evidence.ref` 写该步骤 id（需有 `dispatch.accepted`）；
- `verification` / `acceptance` → `kind: acceptance`，初始 `status: pending`。

## 6. 测试与验证（真实输出）

- `node --test "test/编排/flow-state.test.ts"` → **32 tests / 32 pass / 0 fail / 0 skipped**。
  - 合法 todo/meeting YAML 形状；flowId 不一致；version/qualityTier/steps；id 重复；
  - 保留 id 占用、两个验收步骤、验收 id 非保留、验收 superseded；
  - kind/status/evidence.kind 非法、done 缺 evidence、证据类型不匹配、pending/dispatched/delivered 免证据；
  - **替代关系**：双写合法（旧 `supersededBy` + 新 `supersedes` 同一对步骤）、双写链条 A→B→C 合法、只写一侧合法、两节点互指拒绝、三节点真环拒绝、两侧矛盾（两个方向）具体 path 拒绝、悬空指向拒绝；
  - failed 未 supersede 挡收尾（标 superseded 后放行）；
  - 未知字段/缺必填/YAML 语法错误/重复键；
  - `validateFlowEvidence` 的 dispatch/客户决定结算/验收证据对账；
  - `evaluateFlowCompletion` 的 ready/缺证据/验收已派发/验收已收口/未结算决定；
  - 「显式 kind 优先于 stepId 前缀」正反例；
  - 派发门禁 YAML 优先（坏 YAML 不回落 `.md`）与 YAML 缺失回落 `.md`；
  - 确认卡写前校验：非法 YAML 不发卡（raw 客户通道零调用），合法 YAML 放行。
  - `governance-session.test.ts` 增补提示词 YAML 断言（唯一机器状态/`.md` 仅人读视图/显式 `kind`/`evidence`/`supersedes`/保留验收 id）与「不得再指示把流程单写入 `.md`」反向断言。
- `node --test "test/编排/decision-evidence-packet.test.ts"` → **19 tests / 19 pass / 0 fail / 0 skipped**（新增 3 例：YAML-only 验收包解析出非空 steps 且无「缺少可解析的步骤表」、非法 YAML 给 `flow-state-invalid` 具体 path 仍 fail-closed、legacy Markdown 步骤表/旧失败文案不变）。
- `node --test "test/编排/**/*.test.ts"` → **670 tests / 670 pass / 0 fail / 0 skipped**（基线 635，+35 即本批新增）。
- `npm run typecheck` → **exit 0**。

## 7. 跨角色待办（未越界）

1. **桌面窗口/UI**：自动验收门已由桌面属主并发接线到 `src/pipeline/orchestration/flow-state.ts`（本批只读核对到 `app/desktop/interface.ts` 使用 `parseFlowStateYaml`/`evaluateFlowCompletion`）；请确保其最终调用口径为：
   - `parseFlowStateYaml` 失败读 `parsed.errors`（逐条 `path: message`；`parsed.error` 为单串摘要）；
   - `evaluateFlowCompletion` 返回 `{ ready, issues }`（不是旧 `string|undefined`）；如沿用旧风格可改用 `flowCompletionIssue(flow, ledger)`。
   - 证据包新增 builder reasonCode `flow-state-invalid`（优先级在 `artifact-missing` 之后、`insufficient-evidence` 之前；非模型自报），桌面按原样展示/映射即可。
2. **Steward/治理提示**：`schedule-write` 应写 `docs/flows/<flowId>.yaml`（唯一机器状态），`.md` 仅人读视图；现有 `governance-judge-prompt.ts` 已改口径，门禁引擎的角色卡文本若也提到 `.md` 需属主同步。
3. **运行时核心 `write_file`**：本批的写前校验发生在 `request_confirmation` 预览层；实际 `write_file` 落盘前对 `docs/flows/*.yaml` 的二次内容校验归运行时核心（防「预览 A、写出 B」的内容漂移，O-A1 仍未采纳）。建议在写工具层复用 `parseFlowStateYaml` 的公开出口，fail-closed 拒写。
4. **边界登记**：新增 `src/pipeline/orchestration/flow-state.ts` 需项目管理在编排 `boundary.yaml` Section 1 补登（本批任务书明确允许写 `src/pipeline/orchestration/**`；既有公共出口 `govern-session.ts` 已同源再导出，桌面不依赖新文件也能接线）。
5. **迁移工具**：旧项目 `docs/flows/<flowId>.md` 的 YAML 迁移（Steward 手工或脚本）不在本批；迁移期间 YAML 缺失会回落旧 Markdown 判定，YAML 一旦存在即以其为准。

## 8. 残余风险

- **内容漂移**：确认卡写前校验只保证 preview 中的 YAML 合法；「预览 YAML ≠ 实际写出字节」仍不在本层控制（O-A1 未采纳，沿 A-3 登记）。
- **迁移期双读**：YAML 不存在时仍回退 Markdown；只要旧 `.md` 存在且没有 YAML，旧的 Markdown 解析问题仍可能出现（迁移完成前的已知窗口）。
- **手工 YAML 质量**：`title`/`owner`/`evidence.ref` 是必填/强校验项；Steward 首次手写可能被拒多次（错误文案已给具体路径与原因）。
- **`customer-decision` 证据口径**：只认 `accepted/accepted-quick/appointed`；旧账本条目缺 `customerDecision` 时不算完成证据（与桌面旧门同口径，fail-closed）。
- **验收步骤 `done`**：允许表达「验收已完成」，但 `evaluateFlowCompletion` 会返回「已收口」而非 `ready:true`；调用方应把 `ready:false` 的「已收口」视为终态而非故障（与桌面 `FLOW_COMPLETION_TERMINAL_REASONS` 同语义）。
