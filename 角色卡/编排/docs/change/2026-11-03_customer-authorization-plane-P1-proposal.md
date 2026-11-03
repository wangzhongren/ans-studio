---
id: customer-authorization-plane-p1-proposal
type: change
title: P1 短实现提案：客户授权平面——编排 B1（账本 Provider/Service/Pipeline + shell 审批消费者 + Q9 审计枚举）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: draft
related: [customer-authorization-plane]
events:
  - date: "2026-11-03"
    kind: created
    summary: 写 B1 P1 短实现提案（proposal-only；未改产品/测试代码；未 commit/push）
  - date: "2026-11-03"
    kind: revised
    summary: Revision 1 窄修订：处置 P1-CAP-03/04/13（公共句柄类型/开关快照/常量单一来源），只改本文件
---

# P1 短实现提案：客户授权平面——编排 B1

- **角色/节点**：编排（Orchestration）/ `2026-11-03-customer-authorization-plane` / P1（B1 提案，T3）/ **Revision 1（窄修订，处置 PM 审核 P1-CAP-03/04/13）**。**状态**：proposal-only, no code——未改产品/测试代码、其他角色文档、角色卡/边界、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`；未 commit/push；等待项目管理 P1 复审与 A1+A2 冻结后进入 B1。
- **依据（只读实测）**：团队计划 v1 653 行 / `37e6bd0d…` + §十三增补至 **664 行 / `ecac818c…`**（C2 写集增补，不影响 B1）；方案 P1.1 1199 行 / `7875ad6a…`（盘上为 P1.2 1209 行 / `1748ad2d…`；沟通记录确认 P1.2 仅 R1/R2 编辑性收口、语义等价，E2 基线仍为 P1.1，冲突以 P1.1 为准）；V1 1171 行 / `51ac0f50…`；B0 239 行 / `f1c54f09…`；复核 132 行 / `d2588445…`；P1 审核 193 行 / `65f888a6…`；沟通记录盘上 **168 行 / `9f19821e…`**（含 W-1 裁决：选 A 扩 C2 写集，不影响 B1；派发说明的 150/`5d2858cd…` 为 W-1 前快照）。
- **基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 实测为空；H1 的 B-1..B-4 七条边界条目已落地（沟通 H1 记录）。**停点**：本提案未发现需扩写集/新依赖/新路径的事项；跨角色编译面缺口见 §8.1（已由 PM P1-CAP-01 要求 A1 Revision 1 同批补入，不需扩边界）。
- **标注**：`[事实]` 只读核对；`[设计候选]` 未实现提议；`[交接]` 依赖其他角色冻结件。

## 0. 事实基线（只读）

[事实] 1) `src/common/shared/jsonl-ledger.ts`、`src/model/directive.ts`、`src/model/directive-marker.ts`、`src/provider/directive/`、`src/service/directive/`、`src/pipeline/orchestration/customer-directive.ts` 均尚不存在；A1/A2/A3 未冻结。
[事实] 2) `src/common/编排/task-state.ts` 现有 JSONL 纪律：路径 `:41`、5 MiB/3 份/`ANS_TASKS_MAX_BYTES` `:43-45`、轮转 `:233-258`、每文件追加串行链 `:260-300`、旧→新读取与坏行 `:304-312`/`:654-699`、`request.resolved.by` 校验 `:342-344`、`version.decision.decidedBy` 校验 `:462-464`。`RequestResolvedEvent.by` 与 `VersionDecisionEvent.decidedBy` 的类型定义在 `src/model/runtime.ts:804-836`、`:918-938`（A1 主属）。
[事实] 3) shell 闸：`CreateShellGateOptions.takeGrant` `shell-gate.ts:431`；`readonlyOnly` 禁注入 `takeGrant` `:490-495`；`decide()` `:536-845`（preblock `:576-594`、write-guard `:598-618`、classify `:620-632`、script `:647-729`、c=allow `:730-768`、非 script takeGrant `:769-781`、advisory/operatorOnly `:782-814`、c=deny `:815-822`、readonly-deny `:827-840`、runBA `:844`）；审计记录 `shell-audit.ts:94-114`（`customerGrant` `:109`）。
[事实] 4) 现有测试：`test/编排/` 下 `task-state.test.ts`、`version-decision.test.ts`、`run-manifest.test.ts`、`shell-gate.test.ts`、`shell-post-audit.test.ts`、`shell-escalation.test.ts`、`shell-arming.test.ts`、`runtime-orchestration.test.ts`、`session-handle.test.ts` 均存在；B0 编排组 694 tests / 693 pass / 1 既有 Windows EPERM。
[事实] 5) 与 `contract-schema-query` 的边界：该任务已合入 `origin/main`（HEAD `4c3a6e4`）；其改动位于 `workflow-preconditions.ts`/`governance-roles.ts`/`provider/runtime`/`session.ts` 等；B1 不写这些路径（§8.4）。

## 1. 契约形状与单一来源 [设计候选]

### 1.1 Pipeline 公共句柄与跨角色类型（`src/pipeline/orchestration/customer-directive.ts`，B-2）

以下类型均由 B1 在本文件**定义并导出**（C1 `import type` 消费）；A1 已冻结的 Model 类型只 import、不复制：`CustomerDirectiveTarget`、`CustomerDirectiveUntil`、`DirectiveScope`、`ApprovalAction`、`DecisionAction`、`ApprovalDirectiveFact`/`DecisionDirectiveFact`、`ApprovalDirectiveSnapshot`/`DecisionDirectiveSnapshot`、`CustomerDirectiveView`、`DirectiveHighRiskReason`、`RuntimeKind`、`GovernanceFlowId`。C1 的 IPC 载荷由 C1 冻结；其 presenter 适配层把 `prefill.resource` 合并进 `ApprovalAction.resource`、把回包 values 转成 `DirectiveConfirmationValues`；B1 不定义 IPC。

```ts
export type DirectiveErrorCode =
  | "cancelled" | "presenter-unavailable" | "invalid-input" | "high-risk-unacknowledged"
  | "ledger-write-failed" | "ledger-unavailable" | "not-found" | "target-mismatch"
  | "already-consumed" | "already-revoked" | "expired";

export interface SubmitFromInput {
  rawText: string;                 // 全文（含标记）；≤ A1 CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES
  target: CustomerDirectiveTarget; // Interface 用 A1 parseDirectiveMarker 判定；Pipeline 不再解析
  projectRoot: string; roleId: string; runtime?: RuntimeKind; clientMessageId?: string;
  decisionGroupEnabled: boolean;   // P1-CAP-04：C1 主进程 decisionJudgeSwitch 提交当刻快照；必填、无默认
}
export type SubmitResult =
  | { ok: true; id: string; target: CustomerDirectiveTarget }      // directive.created 已 durable
  | { ok: false; error: DirectiveErrorCode; message?: string; directiveCancelled?: true };

export interface DirectiveConfirmationValues {
  action: ApprovalAction | DecisionAction; scope: DirectiveScope; until: CustomerDirectiveUntil;
  acknowledged?: true;             // 仅高危；缺失/非 true ⇒ high-risk-unacknowledged
}
export interface DirectivePresenterRequest {
  requestId: string; target: CustomerDirectiveTarget; rawText: string; projectRoot: string;
  roleId: string; runtime?: RuntimeKind;
  prefill: { action: ApprovalAction | DecisionAction; scope: DirectiveScope; until: CustomerDirectiveUntil; unrecognized: string[] };
  highRisk: { reasons: DirectiveHighRiskReason[] }; confirmable: boolean; decisionGroupEnabled: boolean;
}
export interface DirectivePresenter { // C1 directive-input 实现；B1 只调用；requestId = C1 IPC request.id
  present(req: DirectivePresenterRequest): Promise<
    { decision: "confirm"; values: DirectiveConfirmationValues } | { decision: "cancel" }>;
}
export interface DirectiveStore {    // 测试注入缝；生产走 Provider 默认实现；C1 不消费
  readonly relPath: string;          // 必须 === A1 CUSTOMER_DIRECTIVES_REL
  append(line: string): Promise<void>;   // 追加+轮转（A2 jsonl-ledger）；durable 后 resolve，拒绝 ⇒ ledger-write-failed
  replay(): Promise<{ lines: readonly string[]; errors: number; files: readonly string[] }>; // 旧→新
}
export interface ApprovalDirectiveDecision { action: "allow" | "deny"; id: string; scope: CustomerDirectiveUntil; }
export interface DecisionCardFacts {
  cardKind: "decision"; requestId: string; flowId?: GovernanceFlowId;
  options: readonly { id: string; label: string; recommended?: boolean }[];
}
export interface DecisionVisibleResult {
  kind: "selected" | "rejected"; directiveId: string;
  action: "select-recommended" | "select-option" | "reject"; optionId?: string; // selected 必填
}
export interface DecisionHooks { emitResult(result: DecisionVisibleResult): void | Promise<void>; } // 唯一钩子名，无 deliver 别名
export type DecisionApplyResult =
  | { kind: "selected"; id: string; optionId: string; action: "select-recommended" | "select-option" }
  | { kind: "rejected"; id: string; action: "reject" }
  | { kind: "conflict"; ids: readonly string[] }        // 不消费任何一条；C1 绕默认推荐
  | { kind: "no-match"; ids: readonly string[] };       // 同 scope 的 select-option 未唯一匹配；不消费
export type RevokeResult =
  | { ok: true; id: string; target: CustomerDirectiveTarget }
  | { ok: false; error: DirectiveErrorCode };
export interface DirectiveListView { active: CustomerDirectiveView[]; consumed: CustomerDirectiveView[]; revoked: CustomerDirectiveView[]; expired: CustomerDirectiveView[]; }
export type DirectiveListResult =
  | { ok: true; projectRoot: string; approval: DirectiveListView; decision: DirectiveListView; ledgerErrors: number }
  | { ok: false; error: DirectiveErrorCode };

export interface CustomerDirectiveRuntime {
  submitFromInput(input: SubmitFromInput): Promise<SubmitResult>;
  approvalFacts(): ApprovalDirectiveSnapshot;
  decisionFacts(): DecisionDirectiveSnapshot;
  takeDirective(req: ShellReviewRequest): Promise<ApprovalDirectiveDecision | undefined>;
  applyDecisionDirective(card: DecisionCardFacts, hooks?: DecisionHooks): Promise<DecisionApplyResult | undefined>;
  revoke(id: string, target: CustomerDirectiveTarget): Promise<RevokeResult>;
  list(): Promise<DirectiveListResult>;
}
export function createCustomerDirectiveRuntime(opts: {
  projectRoot: string; sessionId: string; present: DirectivePresenter;
  now?: () => Date; store?: DirectiveStore;   // store 仅测试注入；生产走 Provider
}): CustomerDirectiveRuntime;
```

- **`submitFromInput` 错误语义**：Pipeline 用 A1 `parseDirectiveMarker(rawText)` 重新校验 marker（target 与调用方一致、`body` 作保守预填；不写第二份解析器），再经 presenter 取确认。错误码：`cancelled`（客户取消/关窗，唯一允许 `directiveCancelled:true`，供 Composer 恢复草稿）、`presenter-unavailable`（presenter 抛错/通道不可用）、`invalid-input`（target/字段/上限/slug 校验失败）、`high-risk-unacknowledged`（高危未 `acknowledged:true`）、`ledger-write-failed`。presenter 回包按提交快照校验（target/原文/字段/高危勾选），不信任渲染侧。**任一 `ok:false` ⇒ 不落账、不投递、不回执**；成功只在 durable 追加后返回 `{ok:true,id,target}`。`message` 仅诊断，不直接展示（A3 按 code 映射文案）。幂等键 `(target,rawText,clientMessageId)` 复用未决面板/已落账 id（不新增账本字段）。
- **`decisionGroupEnabled` 一致性（P1-CAP-04）**：C1 在提交时读取主进程 `isGroupEnabled("decision")`（`decisionJudgeSwitch`）并随 `SubmitFromInput` 传入，该值同时进入 `DirectivePresenterRequest`。C1 面板重算、主进程回包复核、B1 Service/Pipeline 高危计算使用**同一快照值**；面板打开期间开关变化不改本次提交（新指令重新取快照）。Service 落账前用 A1 `directiveHighRiskReasons({target:"decision",...,decisionGroupEnabled})` 复算，高危且未 `acknowledged` ⇒ `high-risk-unacknowledged`。
- **`approvalFacts`/`decisionFacts`**：只返回本 target 的 `{ledgerErrors, active}`；`ledgerErrors>0` ⇒ `active:[]`（消费者按无指令）。`list` 是 Interface 面板的唯一跨 target 读点；`ok:false` 只用于读取失败，面板须显示错误而非伪造空。
- **`takeDirective`**：返回 `{action,id,scope}` 或 `undefined`；`once` 在返回前 durable consume，失败 ⇒ `undefined`（回落既有路径），绝不重复使用；不抛业务错误。
- **`applyDecisionDirective`**：只由 C1 对 `cardKind==="decision"` 调用。`selected/rejected` 前先 `await hooks.emitResult(...)`（**唯一可见行钩子名；`deliver` 不保留**）；抛错/拒绝或无 `hooks.emitResult` ⇒ 不消费、不应用、返回 `undefined`（C1 呈现客户卡且不得走默认推荐）。`conflict`/`no-match` 不消费；`undefined` 同时表示“无适用指令或未应用”，C1 用已读 `decisionFacts` 区分：`active` 非空 ⇒ 只呈现客户卡，`active` 空 ⇒ 既有路径（可含默认推荐）。
- **`revoke`**：同 target 且 active 才能撤销；`not-found`/`target-mismatch`/`already-consumed`/`already-revoked`/`expired` 明确返回；失败不写事件；append-only 保留历史。

### 1.2 Provider（`src/provider/directive/`，B-3）

- 目录限 `abstract/`、`impl/file-store.ts`、`public/`；**路径与上限常量一律从 A1 `src/model/directive.ts` import，不复制字面量（P1-CAP-13）**：`CUSTOMER_DIRECTIVES_REL`（`.ans/state/customer-directives.jsonl`）、`CUSTOMER_DIRECTIVE_ID_PATTERN`（`^d-[1-9][0-9]*$`）及 `CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES`/`COMMAND_MAX_BYTES`/`HOST_MAX_LENGTH`/`PATH_MAX_BYTES`/`SELECTOR_MAX_BYTES`。Provider 的 `DirectiveStore.relPath` 必须等于该常量；`public/` 只 re-export，不定义第二份。
- 职责：追加一行、轮转、旧→新回放、JSON 坏行计数；**纯存储，不做业务判定**。轮转参数与 `task-state` 同款（默认 5 MiB × 3 份），追加串行链与轮转**全部调用 A2 `src/common/shared/jsonl-ledger.ts` 冻结契约**，不写第二份实现。读回 `{lines/events, errors, files}`；解析/校验分工见 §1.3。

### 1.3 Service（`src/service/directive/`，B-3）

- 目录限 `abstract/`、`impl/`、`public/`；依赖 Model + Provider 公共出口。
- 职责：事件 schema 校验（`version===1`；未知 `kind` 忽略并计数；未知字段忽略；坏行/`version>1` 计数而不阻塞）、状态机 `created→active→consumed/revoked/expired`、ID `d-<seq>`（回放含轮转的全局 max seq + 1）、target 过滤、快照、创建/撤销/消费/失效、高危计算（调用 A1 谓词，主进程复算，未 `acknowledged` 拒绝落账）、错误语义。`sessionId` 不一致的 `session`（及 Q3 A 的未使用 `once`）追加 `directive.expired`（best-effort；追加失败视图仍按 expired）。
- 消费者 API 只接受 target；不提供 all-facts。伪造/越 target 记录在 Service/Pipeline 再过滤并记诊断（I-2/I-3）。

## 2. 分层依赖与接线 [设计候选/交接]

- 方向：Model（只读）→ Provider → Service → Pipeline；`shell-gate.ts` 只通过注入的 `takeDirective` 回调与 Pipeline 交互，`shell-audit.ts` 只记录 `directive` 字段；两者**不 import** `src/service/directive`/`src/provider/directive`；`run-role`/`govern-session`/`shell-arming` 只透传句柄/回调。
- `shell-arming.ts`：新增可选 `takeDirective`（独立于 `ShellEscalationWiring`，只加在项目三层链与 operatorOnly 选项；只读档类型面**不提供**）；透传到 `buildShellGate`。
- `run-role.ts`：`openRoleSession` 新增可选 `customerDirective?: CustomerDirectiveRuntime`；仅在 shell 已 arm 且非 readonly 时取 `customerDirective.takeDirective` 注入；CLI 路径不传 ⇒ 不注入、无新分支、行为逐字不变。
- `govern-session.ts`：把同一可选字段透传给 `openRoleSession`。
- [交接] C1 在桌面构造 `createCustomerDirectiveRuntime` 并以同一实例喂 `Interface.sendSession` 与 `openRoleSession`/`govern-session`；B1 只导出工厂与类型，不写 `app/**`。
- [交接] `ShellReviewResult.directive?`、`CustomerInputOutcome.directive?`、`VersionDecisionDecidedBy` 枚举及 `RequestResolvedEvent.by` 字面量/两个事件的 `directiveId?` 由 A1 冻结；B1 只 `import type`/消费，缺一则停止回报（§8.1）。

## 3. 精确写集（不越过 B-2/B-3 与既有目录）

| # | 路径 | 性质 |
| --- | --- | --- |
| 1 | `src/provider/directive/**`（`abstract/`、`impl/file-store.ts`、`public/`） | 新（B-3） |
| 2 | `src/service/directive/**`（`abstract/`、`impl/`、`public/`） | 新（B-3） |
| 3 | `src/pipeline/orchestration/customer-directive.ts` | 新（B-2） |
| 4 | `src/common/编排/task-state.ts` | 既有（A2 辅助迁移 + Q9 校验/`directiveId`） |
| 5 | `src/common/编排/version-decision.ts`、`run-manifest.ts` | 既有（Q9 联合/映射） |
| 6 | `src/common/编排/shell-gate.ts`、`shell-audit.ts` | 既有（`takeDirective` 注入/审计 `directive`） |
| 7 | `src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`shell-arming.ts` | 既有（接线） |
| 8 | `test/编排/customer-directive.test.ts`、`customer-directive-gate.test.ts` | 新 |
| 9 | `test/编排/{task-state,version-decision,run-manifest,shell-gate,shell-post-audit,shell-escalation,shell-arming,runtime-orchestration,session-handle}.test.ts` | 按需既有更新（逐条理由在完成报告列出，不弱化断言） |

不写：`src/model/**`、`src/common/shared/**`、`app/**`、`src/interface/cli/**`、`src/common/门禁引擎/**`、`src/service/gate/**`、`package.json`/`tsconfig*`/`vite.config.ts`、其他角色 `test/` 与文档、`docs/scheduling|acceptance|communication`、角色卡/边界。不新增依赖；不添加第三个 `test/编排` 新文件（若需，停止回报）。

## 4. 审批顺序矩阵 [设计候选]

`createShellGate` 的 `decide()` 在既有顺序中插入两个指令检查；其余分支逐字不变：

| 步 | 既有/新增 | 行为 |
| 1 | preblock | deny；**指令不参与**（不调用 `takeDirective`） |
| 2 | write-guard | deny；**指令不参与**（script 决策在此记录） |
| 3 | classify | `allow/deny/review/risky`；不调用指令 |
| 4 | **指令 deny** | `await takeDirective(req)`（只读 approval）：命中 deny ⇒ 拒绝，`by:"directive:<id>"`，审计 `directive:{id,scope}`；`once` deny 消费一次；`session/forever` 不改状态 |
| 5 | c=deny | 硬拒终结；**allow 指令不适用**；advisory/operatorOnly 既有 `c-deny→a-*` 逐字不变 |
| 6 | c=allow | 直接放行；**不查/不消费 allow 指令** |
| 7 | script | `readonlyOnly` 照旧拒；c=deny 拒；既有 `takeGrant`/routine/operator 链逐字不变；**allow 指令不适用**（deny 已在第 4 步生效） |
| 8 | review/risky（非 script） | 既有 `takeGrant` 先；未命中 ⇒ **指令 allow**（精确匹配 + active + `once` durable 消费成功）⇒ allow，`by:"directive:<id>"`，`ShellReviewResult.directive`；失败/无匹配继续 |
| 9 | 既有链 | advisory/operatorOnly/三层链逐字不变 |

- 精确匹配：`normalizeCommandText(req.command) === normalizeCommandText(record.command)` 且 `cwd === projectRoot`；不通风配、不推断 argv；`domain/path` 本任务无消费者（`consumer:"none"`），gate 不读。
- `readonlyOnly === true`：构造期若注入 `takeDirective` 抛错（镜像 `takeGrant` 守卫 `:490-495`），调用点也不注入；只读档类型面无该选项。
- `once` 原子消费：Service 以追加串行链 + 内存 active 检查串行化；`takeDirective` 在返回 allow/deny 前 `await consume` durable 成功；失败 ⇒ `undefined`（回落既有路径），绝不重复使用。`session/forever` 只写消费者既有审计，不往指令账本写非状态事件。
- 审计：`ShellAuditRecord` 加可选 `directive:{id,scope}`（与 `judge`/`customerGrant` 互斥）；`by` 为 `directive:<id>`；`ShellGateReviewedOutcome` 可选带 `directive`，`shell-escalation.recordReview` 既有 judge-only 资格判定自然忽略 directive，无需改该文件。

## 5. Q9 归属与旧读者（B1 的写入面）

- [交接] A1 扩 `VersionDecisionDecidedBy`（`project-state.ts:91`，自动覆盖 `VersionDecisionEvent.decidedBy`），并在 `runtime.ts` 把 `RequestResolvedEvent.by` 字面量加 `"directive"`、给两个事件加可选 `directiveId`（**A1 同批编译面；不需扩边界**，详见 §8.1）。
- B1 写：`task-state.ts:342-344`/`:462-464` 校验接受 `"directive"`，`directiveId` 可选且必须匹配 A1 `CUSTOMER_DIRECTIVE_ID_PATTERN`（**import 常量，不写字面量**），`by/decidedBy==="directive"` 时必填；`version-decision.ts:256/289/401/435` 联合与映射；`run-manifest.ts:87/619/635/657` `RunChangeRecord.decidedBy` 与 `applyRunChange` 输入/记录（`directiveId?` 加法，旧读者忽略；校验同样 import A1 常量）。
- [交接] C1 写：`app/desktop/session.ts:2078/4166/4470/4659-4660`、`requirement-change.ts:317`、i18n 显示；B1 不写 `app/**`，只在完成报告列出这些点供 C1/D1 逐点核对。
- B1 内部 `rg` 扫描 `src/common/编排` 所有 `by`/`decidedBy` 读者（含 `collectResolvedWithoutExecution`）；逐点报告，不把 directive 误当 customer/judge。

## 6. AC 映射（B1 证据；其余角色交接另列）

| AC | B1 交付/证据 | 交接 |
| --- | --- | --- |
| AC-6 | Provider/Service 单测：路径/schema/`d-<seq>`/seq max+1/version/轮转旧→新/坏行/未知事件/幂等；账本样例（created/consumed/revoked/expired、坏行/轮转） | A1 schema；A2 辅助 |
| AC-7 | `approvalFacts`/`decisionFacts` 互不含；运行时再过滤；伪造跨 target 记录丢弃并诊断；无 all-facts API | A1 类型分离；C1 decision 消费 |
| AC-8 | gate：精确命令在硬地板后放行；`once` 一次；`session/forever`；`c=allow` 不消费；script 不适用；消费失败不放行；审计 `directive` | D1/D2 |
| AC-9 | gate 矩阵：deny 先于 `c=allow`；c=allow 只在 allow 侧先行；preblock/write-guard/c=deny/readonly/script 不翻案；deny 不误伤；readonly 不注入 | D1 |
| AC-10 | `applyDecisionDirective` 规则/冲突/不匹配（绕过默认推荐由 C1 消费）；`emitResult` 先于 durable consume 且失败 ⇒ `undefined` 不消费；`version.decision`/run manifest 的 Q9 映射与记录；`request.resolved` 校验 | C1 四处写入/UI、A1 枚举、A3 文案、D1/D2 |
| AC-11 | 状态机：`sessionId` 重启失效；`once` 未用失效（Q3 A）；`forever`；无时间戳依赖 | C1 重启、C2 面板、D2 |
| AC-12 | 撤销：同 target active；已消费/已撤销/已失效拒绝；立即影响后续 `takeDirective`；append-only 历史 | C1 面板/回执、D2 |
| AC-13 | 高危：`SubmitFromInput.decisionGroupEnabled` 快照 + A1 谓词复算；开关**关**×项目级 `select-recommended` 触发 `switch-off-project-recommended`，未 acknowledged 拒绝；开关**开**（项目级/单 flow）与单 flow 均非该高危；`highRisk:{reasons,acknowledged,acknowledgedAt}` 入账 | A1 谓词；C1 快照/面板复核；C2 截图；D2 |
| AC-14 | 指令类型无写权目标（A1）；gate 测试越界写仍被 write-guard 拒；`takeDirective` 只读 approval；不新增模型工具 | A1/C1/D1 |
| AC-15 | 无指令路径逐字不变；B1 内部旧读者逐点；受影响套件原始输出 | C1 桌面读者、测试 T3 全量 |
| AC-16 | 坏行/`version>1`/不可读 ⇒ 空快照 + `ledgerErrors`；主路径不受阻；不伪造回执 | C1 面板错误、D1/D2 |
| AC-18 | B1 候选哈希、原始命令/输出、账本/审计样例、`typecheck`、受影响套件；全量 T3 由 D1 跑 | 统筹 E1、测试 D1/D2 |

（AC-1..AC-5、AC-17、AC-19..AC-24 主责在 A1/C1/C2/A3/D1/D2；B1 提供 §4/§5 的审批与 Q9 证据，并按 AC-13 提供 Service/Pipeline 高危复算证据。）

## 7. T3 验证与冻结声明

- 命令：`node --test --test-concurrency=1 "test/编排/*.test.ts"`；`npm run typecheck`；`task-state` 等价回归（迁移前后 `test/编排/task-state.test.ts` 同候选对比 + `customer-directive.test.ts` 中 append/轮转/坏行/串行等价用例）。B0 基线：编排组 694/693/1（既有 EPERM）；新增确定性失败 0、新增 skip 0。全量 T3（393 文件）由 D1 在同一候选重跑，B1 不重复。
- **AC-13 测试计划（P1-CAP-04）**：`customer-directive.test.ts` 用替身 presenter 覆盖 2×2——`decisionGroupEnabled` 开/关 × 项目级（`scope:{}`）/单 flow（`scope:{flowId}`）的 `select-recommended`：仅“关×项目级”产生 `switch-off-project-recommended`，未 `acknowledged:true` ⇒ `high-risk-unacknowledged` 且账本零事件；另三组不因该谓词高危；断言 presenter 收到的 `decisionGroupEnabled` 与提交一致、账本 `highRisk` 与谓词一致。
- **A1/B1 契约断言（P1-CAP-13）**：`customer-directive.test.ts` import A1 常量，断言 `CUSTOMER_DIRECTIVES_REL` 值/`DirectiveStore.relPath` 一致、`CUSTOMER_DIRECTIVE_ID_PATTERN` 接受 `d-1` 且拒绝 `d-0`/`d-01`/`D-1`、五个上限常量逐项生效；`task-state.test.ts`/`run-manifest.test.ts` 对 `directiveId` 做同一正反例（A1 侧已断言常量字面值，任一侧漂移必有一侧失败）。
- **C1 双向可赋值断言（P1-CAP-03）**：B1 冻结导出的 `SubmitFromInput`/`SubmitResult`/`DirectivePresenter`/`DirectiveHooks`/`DecisionApplyResult`/`RevokeResult`/`DirectiveListResult` 在 `customer-directive.test.ts` 以 type-only 方式按 C1 §2.3/§三 文档形状赋值（含 `@ts-expect-error` 缺 `decisionGroupEnabled`）；C1 冻结时在其 `test/桌面应用/directive-input.test.ts` import B1 类型对真实实现做反向赋值；`npm run typecheck`（include `src`/`test`/`app`）双向执行。
- 证据：每个改动文件 `git hash-object` + `sha256sum`；`git diff --name-only` 落在 §3；`git status --short`；`git diff --cached --name-only` 为空；账本/审计样例路径 + SHA-256；`implemented-unverified` 状态。
- **冻结声明（B1 退出）**：`customer-directive` 句柄形状与 §1.1 全部导出类型（含 `decisionGroupEnabled` 必填、唯一钩子 `DecisionHooks.emitResult`）、`takeDirective` 注入契约、`directive:{id,scope}` 审计字段、Q9 枚举/`directiveId` 冻结；C1/C2 只消费。任何变更回 B1 并重跑受影响证据。
- 顺序：A1 + A2 冻结 + H1 ⇒ Provider → Service → Pipeline → shell gate/audit → Q9 → task-state 迁移 → run-role/govern-session/shell-arming 接线 → 测试/typecheck。**B1 依赖 A1+A2；A2 未冻结不动 `task-state.ts`。**

## 8. 风险、开放点与停止项

1. **A1 编译面缺口（跨角色）**：`RequestResolvedEvent.by` 的字面量与 `RequestResolvedEvent`/`VersionDecisionEvent` 的可选 `directiveId` 在 `src/model/runtime.ts`（A1 单文件，非新路径）；A1 P1 提案 148 行 / `9ab7ce0a…` 未列这两项（`VersionDecisionEvent.decidedBy` 随枚举自动扩展）；PM 审核 P1-CAP-01 已要求 A1 在 Revision 1 补入逐项说明与契约测试。B1 不能写 Model；以 A1 Revision 1 冻结形状为准，缺一则按停止项回报。**不扩边界。**
2. **`task-state` 等价迁移**：A2 冻结 API 若不能表达现有轮转/串行/坏行语义，停止回报；按团队计划 §10.2 退路 B（Provider 自带实现、不碰 `task-state.ts`）由统筹决定并在 E1 披露，不自行二选一、不弱化既有断言。
3. **Q9 旧读者**：`=== "judge"` 读者（`requirement-change.ts:317`）会把 directive 误显示为 customer；`session.ts:4166` 的 `judged` 计算会把 `directive:<id>` 落 `"customer"`。B1 只修自己写集并在完成报告逐点列出 C1 点；C1 未修则 AC-10/AC-15 fail。
4. **坏账本 fail-safe**：`errors>0 ⇒ active=[]`，但面板必须显示错误数、不得把“读不到”当“已失效并删除”；`expired` 追加失败只影响账本完整性，视图仍按 expired；不伪造“已记录/已撤销”回执。
5. **与 `contract-schema-query` 边界**：已合入 `4c3a6e4`；B1 不触碰 `workflow-preconditions.ts`/`governance-roles.ts`/`provider/runtime`/`app/**`；编辑前 `git log 243d8f6..HEAD -- <写集>` 复核，若同文件另有改动先回报，不逆向覆盖。
6. **决策消费与可见行顺序**：唯一钩子名 `emitResult`（`DecisionHooks`，不保留 `deliver` 别名）。先 `await hooks.emitResult(...)`，成功后才对 `once` durable consume；抛错/拒绝或无 `hooks.emitResult` ⇒ 不消费、不应用、返回 `undefined`（C1 呈现客户卡且不得走默认推荐）；不把消费失败/投达失败静默当成功。
7. **运行时生命周期**：`sessionId` 由 C1 主进程启动生成并注入；B1 不落盘到账本外、不依赖时钟；项目切换取消未决面板由 C1 负责。
8. **停止项**：若 B1 需要 `src/model/**`/`src/common/shared/**`/`app/**`/新依赖/第三个新测试文件或 B-2/B-3 之外路径，立即停止回报，不自行扩写集；若方案/团队计划出现实质冲突（如 Q5/Q9/账本路径），停止并回报统筹。

## 9. 交接清单（B1 → C1/C2/D1）

- [交接] C1：用 `createCustomerDirectiveRuntime({projectRoot, sessionId, present})`；`sendSession` 命中调 `submitFromInput`；decision 消费者调 `decisionFacts`/`applyDecisionDirective`；面板调 `list`/`revoke`；Q9 桌面读者按 §5 修；`directivesEnabled` 基础位恒 `true`（O9 未选）。
- [交接] C2：只按 preload 通道消费；不改判定。
- [交接] D1：跨层集成覆盖 B1 句柄 + C1 presenter 替身 + gate；T3 全量；AC-6/7/8/9/11/12/16 端到端。
- [交接] E1：披露 A2 路径 A/B、基线 `4c3a6e4`、B1 候选哈希与冻结声明。

## 10. 修订记录（Revision 1）

- **触发/范围**：项目管理 P1 审核 193 行 / `65f888a6…`，结论 `needs revision`。本修订只改本文件、原位窄修订；未改产品/测试代码、其他角色文档、角色卡/边界、`docs/*`；未 commit/push。基线 HEAD `4c3a6e4…`；`git status --porcelain -- src app test` 为空。
- **输入复核（只读）**：团队计划 664 行 / `ecac818c…`（§十三 C2 写集增补，不影响 B1）；A1 提案 148 行 / `9ab7ce0a…`（Revision 1 可能并行；B1 只 import A1 类型/常量，PM 复审校验形状一致）；沟通记录 168 行 / `9f19821e…`（W-1 裁决 A，不涉及 B1 写集）。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| P1-CAP-03（阻断） | §1.1 逐一定义 10 个公共句柄类型（`SubmitFromInput`/`SubmitResult`/`DirectivePresenter`/`DirectiveStore`/`ApprovalDirectiveDecision`/`DecisionCardFacts`/`DecisionHooks`/`DecisionApplyResult`/`RevokeResult`/`DirectiveListResult`），含字段/联合/可选性/错误语义；可见行钩子只保留 `emitResult`，抛错/拒绝 ⇒ 不消费、不应用、返回 `undefined`；§7 加 B1↔C1 双向可赋值断言计划 | `npm run typecheck`（type-only 双向）；§1.1/§8 第 6 项；冻结声明列入导出类型 |
| P1-CAP-04（阻断，AC-13） | `SubmitFromInput.decisionGroupEnabled: boolean` 必填；C1 主进程 `decisionJudgeSwitch` 提交当刻快照同时进入 presenter/Service/Pipeline，面板重算用同一值；§6 加 AC-13 行、§7 加 2×2 测试计划 | `customer-directive.test.ts` 开关开/关×项目级/单 flow；C1 快照与账本 `highRisk` 一致 |
| P1-CAP-13（非阻断） | 路径/ID 模式/五个字段上限全部 import A1 `src/model/directive.ts` 常量，`task-state`/`run-manifest`/Provider/Service 不写字面量；§1.2/§5 同步 | A1/B1 常量契约断言（正反例）+ `task-state`/`run-manifest` 测试 |

- **未改项（保持已通过）**：§3 写集（`src/provider/directive/**`、`src/service/directive/**`、`src/pipeline/orchestration/customer-directive.ts`、`src/common/编排/{task-state,version-decision,run-manifest,shell-gate,shell-audit}.ts`、`run-role.ts`/`govern-session.ts`/`shell-arming.ts`、两个新测试 + 按需既有测试）；§4 审批顺序矩阵；§5 Q9 映射；§7 `task-state` 等价迁移；§8 退路 B 停止条件。无新增路径/依赖。
- **停止项/裁决**：本修订无新增停止项；A1 形状以 PM 复审为准（A1 Revision 1 并行），若 A1 冻结形状与本提案 import 形状不一致，按 §8.1 停止回报，不自行改 Model。
