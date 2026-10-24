# 变更记录：验收返工路由——编排 S2 契约（最新验收决定 / 重开 / 报告解析）

- 任务 ID：`2026-10-23-acceptance-rework-routing`
- 产品 flowId：`acceptance-rework-routing`
- 角色：编排（S2 契约先行）
- 日期：2026-10-23
- 状态：**implemented-unverified**（已实现；`test/编排/**` 与 typecheck 已跑；未经 S3 集成、e2e、T3 全量、真实 Electron、目标项目只读复算与独立验收，不代表通过，不声称验收）
- 依据（客户已确认）：
  - 闸门 0/1/2 + 实施授权：`docs/communication/2026-10-23_intent_acceptance-rework-routing.md`（实施授权原话「授权按团队计划 v1 与标准 v1 实施 S2–S7；不包含 commit/push/发布/目标项目写入，不新增角色/边界。」）
  - 策划方案 v1：`docs/planning/2026-10-23_design_acceptance-rework-routing.md`（§5、§6、§7、§8.1；Q1–Q13 A；O1–O4 不做）
  - 验收标准 v1：`docs/acceptance/acceptance-rework-routing-criteria-v1.md`（P1/P2/P4（含 P4.4）/P8/P9 的编排面；P 编号对照见标准 §3.0）
  - 团队计划 v1：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md`（§3.2 编排写集、§4.1 S2、§4.4 S2 出口证据）
- 写集（实际只改这 7 个产品/测试文件 + 本记录与证据目录）：
  - `src/common/编排/flow-state.ts`（`latestAcceptanceDecision` + `EvaluateFlowCompletionOptions`；删除私有 `hasAcceptanceDecision`）
  - `src/common/编排/flow-service.ts`（`completeAcceptanceStep` 只认最新 accepted；新增 `reopenAcceptanceStepForRework`）
  - `src/common/编排/acceptance-rework.ts`（**新增**：报告 fenced YAML 解析/校验，纯函数）
  - `src/pipeline/orchestration/flow-state.ts`（只再导出新函数/类型/常量，不复制逻辑）
  - `test/编排/flow-state.test.ts`（追加 9 例；既有 44 例逐字保留，现 53 例）
  - `test/编排/flow-service.test.ts`（追加 12 例；既有 38 例逐字保留，现 50 例）
  - `test/编排/acceptance-rework.test.ts`（**新增** 19 例）
  - 本变更记录与 `2026-10-23_change_acceptance-rework-routing-evidence/`
  - **未写** `src/model/**`、`governance-ledger.ts`、`src/common/门禁引擎/**`、`app/**`、`src/provider/**`、`src/common/shared/**`、`docs/`（除本角色 docs/change）、角色卡/边界、目标项目；未 commit/push/合并/发布；未写 `ans-gateway`。

## 一、用户可见语义（本层没有 UI；桌面 S3 消费）

- 验收收口只认**最新**一条 `customer.decision{decisionKind:"acceptance"}`：`accepted` 才收口；`rejected` 是「待返工」，不再被当成永久收口。
- `completeAcceptanceStep` 只认最新 accepted：即使更早有 accepted，最新为 rejected ⇒ `acceptance-not-accepted`，不写 flow。
- 新增 app-only `reopenAcceptanceStepForRework`：重派 Proof 前把 `verification` 从 `dispatched/delivered` 安全重开为 `pending` 并清空旧证据；`done`/终态拒绝；幂等。
- 新增报告解析器：只认报告里恰一个 fenced YAML `acceptance-rework/v1` 段；缺段/坏段只走人工兜底，**不解析 §8 表/§9.1 编号列表**，不生成 items、不猜 owner。
- legacy Markdown 行为**不在本层改动**（Q6 A 由桌面窗口保持旧行为并加回归锁）。

## 二、公共契约（经 `src/pipeline/orchestration/flow-state.ts` 冻结）

### 2.1 `latestAcceptanceDecision(flowId, ledgerInput): LatestAcceptanceDecision`

```ts
type LatestAcceptanceDecision =
  | { kind: "none" }
  | { kind: "ledger-unavailable"; errors: readonly string[] }
  | { kind: "accepted"; entry: GovernanceLedgerEntry }
  | { kind: "rejected"; entry: GovernanceLedgerEntry }
  | { kind: "unresolved"; entry: GovernanceLedgerEntry };
```

- 「最新」按账本 **append（数组）顺序**取该 flow 最后一条 acceptance 决定；`at` 只用于时间比较，不参与排序。
- 分类：`customerDecision === "accepted"` ⇒ accepted；`"rejected"` ⇒ rejected；其余（`changes-requested`/`none`/`unclassified`/缺字段/空串/未知值）⇒ unresolved（fail-closed）。
- 账本有坏行/不可读（`FlowLedgerInput` 带非空 `errors`）⇒ `ledger-unavailable`，调用方必须 fail-closed。
- 纯函数，不读盘；取代旧私有 `hasAcceptanceDecision`（未导出，无外部引用）。

### 2.2 `evaluateFlowCompletion(flow, ledgerInput, options?): EvaluateFlowCompletionResult`

`options?: { allowRejectedAcceptance?: boolean }`，默认 `false`（strict）：

| 最新决定 | 验收步骤状态 | strict（默认） | `allowRejectedAcceptance:true` |
| --- | --- | --- | --- |
| 无 / none | pending，其余齐备 | `ready:true`（既有行为） | 同左 |
| 无 / none | dispatched/delivered | `ready:false`「验收已派发/进行中」 | 同左 |
| accepted | 任意（非 done） | `ready:false`「该流程已有验收决定（accepted），流程已收口。」 | 同左（accepted 不受该选项影响） |
| rejected | pending | `ready:false`「验收已拒绝，流程等待返工；返工后需重新派发验收。」（**不出现「已收口」**） | 放行，继续返回执行步骤/证据/未结算决定等具体原因 |
| rejected | dispatched/delivered | `ready:false`（等待返工文案） | `ready:false`「验收步骤状态为 …」 |
| unresolved | 任意 | `ready:false`「不是 accepted/rejected（未结算/异常）…请人工核对」 | 同左（fail-closed，不放行） |
| rejected | done | `ready:false`「验收步骤已完成（done），但最新验收决定为 rejected；异常状态…请人工核对」（**不出现「已收口」**） | 同左 |
| accepted | done | `ready:false`「验收步骤已完成，流程已收口…」 | 同左 |

- `hasUnresolvedDecision` 口径**保持不变**（`unclassified` / `customerDecision none|undefined|空串` ⇒ 「仍有未结算的决定」）。
- 账本 errors 仍由函数入口 fail-closed；`flowCompletionIssue` 薄适配默认 strict，签名不变。
- 文案选择说明：accepted 用「该流程已有验收决定（accepted），流程已收口。」而不是「已有验收**接受**决定」，是为了保留桌面 `governance-advance.ts::FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED` 的既有前缀匹配；rejected 使用全新「等待返工」文案，不含「已收口」。S3 若调整终态识别，应与本条对齐。

### 2.3 `completeAcceptanceStep({projectRoot, flowId})`

- 只认**最新** accepted；最新 rejected/unresolved/none ⇒ `acceptance-not-accepted`，flow 字节不变（错误文案含最新决定类别）。
- 已 `done` ⇒ `{ok:true, idempotent:true}`；账本坏行 ⇒ `ledger-unavailable`；缺保留验收步骤 ⇒ `acceptance-step-missing`；写失败 ⇒ `write-failed`（原文件不变）。
- 不写 `customer.decision`；不注册为角色工具。

### 2.4 `reopenAcceptanceStepForRework({projectRoot, flowId, autoRework?})`（**新增 app-only**）

- 前提：最新 acceptance 决定 `rejected`，**或**调用方声明 `autoRework:true` 且无 acceptance 决定（桌面据此表示「已存在耐久 auto-rework routing record」；编排不读取/不复制桌面私有 record schema）。accepted / unresolved / 无决定且未声明 ⇒ `acceptance-not-rejected`。
- 状态矩阵：

| 现状 | 结果 | 写盘 |
| --- | --- | --- |
| pending 且无 evidence | `{ok:true, idempotent:true}` | 否（revision 不变） |
| pending 带旧 evidence | `pending` + 清空 evidence | 是（`flow.acceptance.reopened` 事件） |
| dispatched / delivered | `pending` + 清空 evidence；保留 `supersedes`/`supersededBy`/`dependsOn`/`parallelGroup` | 是 |
| done | `acceptance-already-done` | 否 |
| failed / blocked / aborted（及不可达的 superseded） | `acceptance-step-terminal` | 否 |

- 失败码：`missing-flow-id` / `not-found` / `read-failed` / `invalid-flow` / `acceptance-step-missing` / `ledger-unavailable` / `write-failed`（原子写失败原文件不变）/ `internal-error`。
- 不写 `customer.decision`、不新增枚举/保留 id/角色工具；与 `completeAcceptanceStep` 共用 per-project 串行队列、候选 YAML 复核与原子写；view actor `app/app`。

### 2.5 `parseAcceptanceReworkReport(markdown): AcceptanceReworkParseResult`（**新增，纯函数**）

```ts
type AcceptanceReworkParseResult =
  | { ok: true; section: AcceptanceReworkSection; warnings: string[] }
  | { ok: false; reason: "missing" | "invalid" | "unsupported"; errors: { path: string; message: string }[] };

interface AcceptanceReworkSection {
  schema: "acceptance-rework/v1";
  coordinator: "convener";            // 实际接收方固定 Convener，报告不能指定
  coordinatorDeclaration: string | null; // 原值（缺省 null；steward 别名/未知值保留供审计）
  items: { id: string; owner: string; action: string; evidence: string[] }[];
}
```

- 只扫描 fenced code block（``` / ~~~；含 CommonMark 缩进折叠）；**不解析** §8 表格 / §9.1 编号列表；HTML 注释区（含未闭合注释）不作为数据。
- 候选块：顶格 `schema:` 行提及 `acceptance-rework`（坏 YAML 也能判 invalid），或 flow 风格根映射的 `schema` 字段提及 `acceptance-rework`；带 schema 的块至多一个，多个 ⇒ `invalid`；其他代码块忽略。
- 严格校验（fail-closed，整段不采信）：`schema` 固定 `acceptance-rework/v1`，其他 `acceptance-rework/*` ⇒ `unsupported`；未知字段（顶层/返工项）⇒ `invalid`；`items` 非空、≤64；`id` 唯一且匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`；`owner` 恰好一个角色 id 形状（非空、≤64；拒绝 `a + b`/`客户/Proof`/`a,b`/空白——存在性/可派发仍由桌面校验）；`action` 非空、≤2000；`evidence` 字符串或字符串数组、每条非空 ≤500、最多 10 条；块 UTF-8 ≤32KB；YAML 使用 `{uniqueKeys:true, maxAliasCount:100}`（与 flow YAML 同口径）。
- `coordinator`：缺省 `convener`；`convener`/`steward` 接受；其他非空值产生 `warnings`（仍路由 Convener）；非字符串/空字符串 ⇒ `invalid`。
- 无 IO、不读模型、不读文件系统；同输入两次结果深相等。

### 2.6 公共出口（`src/pipeline/orchestration/flow-state.ts`）

新增再导出：`latestAcceptanceDecision`、`parseAcceptanceReworkReport`、`reopenAcceptanceStepForRework`、`ACCEPTANCE_REWORK_SCHEMA` 等常量，以及 `LatestAcceptanceDecision`、`EvaluateFlowCompletionOptions`、`AcceptanceReworkItem/Section/ParseResult/Error`、`ReopenAcceptanceStepForReworkInput` 类型。不复制逻辑、不做二次判定；新增函数均**不注册为角色工具**（有测试断言 `run-role.ts`/`model/runtime.ts` 无引用）。

## 三、测试与证据（原始日志见证据目录）

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/编排/flow-state.test.ts test/编排/flow-service.test.ts test/编排/acceptance-rework.test.ts` | **122/122 pass，exit 0** | `…-evidence/02-flow-tests.log` |
| `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | 850 tests，849 pass，**1 fail（既有 Windows symlink EPERM：`test/编排/shell-authorized-routine.test.ts`「node test外指符号链接…」，与本变更无关；退出码 1）** | `…-evidence/03-orchestration-suite.log` |
| `npm run typecheck` | **exit 0** | `…-evidence/04-typecheck.log` |
| `node --test --test-concurrency=1 test/桌面应用/acceptance-dispatch.test.ts`（只读兼容核对，本角色未改该文件） | 36/36 pass | `…-evidence/05-desktop-acceptance-dispatch.log` |
| 环境 | Node v24.22.1 / npm 11.19.1 / win32 x64 / HEAD `ee59296…` | `…-evidence/00-environment.txt` |
| 变更前基线 / 候选哈希 | `git hash-object` + `sha256sum` 逐文件 | `…-evidence/01-pre-edit-baseline-hashes.txt`、`06-candidate-hashes.txt` |
| 写集与暂存状态 | 写集内；`git diff --cached` 为空；未 commit | `…-evidence/07-write-set-status.txt` |

覆盖要点（对照标准 P1/P2/P4/P8/P9 编排面）：最新决定矩阵（accepted/rejected/unresolved/顺序/append 顺序不看 at）、默认 strict 与 `allowRejectedAcceptance` 分离、rejected 不 closed、`verification` dispatched/done 分支、`completeAcceptanceStep` 最新 accepted、reopen 正/负/幂等/终态/缺步骤/坏账本/原子写失败、解析器正例/缺段/坏 YAML/未知字段/重复 id/空 owner/多 owner/空 action/空 items/>64/>32KB/多块/不支持版本/自由文本不解析/HTML 注释/flow 风格根映射。

## 四、候选隔离与边界

- 本任务编辑前，`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`test/编排/flow-service.test.ts` 等已含既有未提交变更（目录 v3 等已验收候选）；已逐文件记录基线哈希，本任务只追加本变更 hunk，不回退/不改写既有内容。`src/common/编排/team-plan.ts`、`directory-conformance.ts`、`test/编排/team-plan.test.ts`、`directory-conformance.test.ts` 与本任务无关。
- `角色卡/编排/boundary.md` 的既有未提交 diff（`src/pipeline/orchestration/flow-state.ts` 条目，mtime 2026-10-23 13:18:56）早于本任务；本任务未写角色卡/边界。
- 实施期间其他角色在各自写集内并行修改（如 `src/provider/runtime/tools.ts`）。一次 typecheck 曾在 `tools.ts:1495` 报出对方编辑中途的瞬时错误；最终 typecheck 以 `04-typecheck.log`（exit 0）为准。

## 五、残余风险 / 待 S3+ 注意

1. **`autoRework` 是调用方声明**：编排不读取 `.ans/governance/acceptance/<flowId>/rework-routing.json`（桌面私有 schema）。S3 必须在持有耐久 routing record 时传 `autoRework:true`，否则 auto-rework（无 `customer.decision`）且 `verification` 为 dispatched/delivered 时重开会返回 `acceptance-not-rejected`。
2. **accepted 文案前缀**：为兼容桌面既有终态识别保留「该流程已有验收决定」前缀；S3 若改变终态判定需同时核对 `governance-advance.ts` 的 `FLOW_COMPLETION_TERMINAL_*`。
3. **桌面既有 rejected 用例**：`test/桌面应用/acceptance-dispatch.test.ts` 当前仍通过（只断言不派发/不收口），但其注释与「已有验收决定 ⇒ 流程已收口」口径必须由 S3 按 Q1 替换为新语义并保留负例；本任务未改该文件。
4. **全量回归**：`test/编排/**` 的 1 项 Windows symlink EPERM 属既有平台失败类别；T3 全量、真实 Electron、目标项目只读复算由测试/验收角色按标准执行。本角色不声称 T3 通过。
5. **状态**：implemented-unverified；S2 出口证据已交，等待 S3 消费与独立验收，不声称验收/发布。
