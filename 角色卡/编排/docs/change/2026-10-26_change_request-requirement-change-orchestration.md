---
id: request-requirement-change-orchestration
type: change
title: request_requirement_change 接入编排注入面 + 判断 agent 需求变更指引
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [decision-card-orchestration, request-gate-review-orchestration-core, view-image-orchestration-wiring]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 报告员/统筹请求需求变更申请的 request_requirement_change 能力透传、decision 卡白名单/共享校验与 judge 提案卡指引落地；定向/全量编排测试与 typecheck 通过，独立验收未做
  - date: "2026-10-26"
    kind: corrected
    summary: 客户同日纠正/补充：需求变更审批卡由统筹（Convener）或提案角色（Rapporteur）发起（decision 卡，发起方不得自批），审批人为判断 agent/客户，主理只执行；编排注入面/白名单/共享校验/judge 指引同步并补测试
---

# 变更记录：`request_requirement_change` 接入编排（报告员/统筹注入 + judge 指引）

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排面实现与测试已跑；桌面注入端/审批卡通道/真实 decision 卡链路、
  跨角色 e2e、独立验收未做，不代表通过）
- 来源：客户 2026-10-26 要求 + 同日纠正/补充（经主控任务转达；PM 已登记规则与共享 i18n：
  `角色卡/项目管理/docs/change/2026-10-26_change_requirement-change-request.md` 与
  `project-rules.md` §二.15）。运行时核心已交付冻结契约 `RequestRequirementChangeFn` /
  `RequestRequirementChangeInput` / `RequestRequirementChangeResult` 与
  `request_requirement_change` 工具（`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、
  `schema.ts`，本批只读消费）。门禁引擎同批只改 Rapporteur/Liaison 角色卡文案
  （`src/common/门禁引擎/governance-roles.ts`），**未新增能力位**。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/run-role.ts`
  - `src/common/编排/decision-card.ts`
  - `src/common/编排/governance-judge-facts.ts`
  - `src/common/编排/governance-judge-prompt.ts`
  - `src/common/编排/governance-judge-verdict.ts`、`governance-ledger.ts`（仅注释口径同步）
  - `test/编排/request-requirement-change.test.ts`（新增 4→5 例；含统筹注入）
  - `test/编排/requirement-change-judge-guidance.test.ts`（新增 3 例）
  - `test/编排/decision-card.test.ts`（报告员正向 1 例、拒绝集合与共享校验用例更新）
  - 本记录、`changelog.md`、`api-spec.md`、`feature-map.md`
- **未改** `src/model/**`、`src/provider/**`、`app/**`、共享 i18n、门禁卡、其他角色资料；
  未新增 cardKind / FlowStepKind；未 commit/push、未重启应用、未碰 `demos/`。

## 一、背景与纪律

Draft / 报告员起草提案时若发现需要**新的客户授权/范围**（联网、外部目录/仓库、范围、验收/技术标准、
成本），**不得**把未获授权的诉求塞进提案卡「顺带获批」，也不得删除需求绕过闸门 0。正确通道：

```text
Draft ──request_requirement_change──▶ 应用校验/去重/派发
        ◀─ 统筹（Convener）或提案角色（Rapporteur）发起 decision 卡（发起方不得自批）
        ◀─ 独立判断 agent（替我决策开启时按唯一推荐项代批）或客户（未开启时手选）批准
        ◀─ 主理在批准后执行意图变更（更新 docs/intents/**）──▶ Draft 依已变更意图修订提案并重发提案卡
```

两条纪律贯穿本批：

- **提交申请 ≠ 客户批准，也不代表意图已变更**——申请在途/已受理都不解锁任何门禁、不授权实施；
  主理不审批，只在批准后执行意图变更。
- **判断 agent 不能在提案卡上代批任何新授权**——机械权限不变；它只能在提案卡上 approve 已确认意图内
  的方案，或按 rubric manual/deny。需求变更审批只由统筹/提案角色发起的 decision 卡承载（发起方不得
  自批），审批人是独立判断 agent（替我决策开启时）或客户（未开启时）；不再以「主理改意图 +
  intent-confirm」作为需求变更审批口径（2026-10-26 客户纠正）。

## 二、`run-role.ts` 改动

### 1. 能力位（类型单一来源＝契约家 `model/runtime.ts`）

```ts
import type { RequestRequirementChangeFn } from "../../model/runtime.ts";

export interface AdapterCapabilities {
  ...
  /** 需求变更申请（request_requirement_change「注入才注册」）；只给报告员/统筹（trio rapporteur/convener）。 */
  requestRequirementChange?: RequestRequirementChangeFn;
}
```

`openRoleSession` 输入新增同名可选字段（doc 注释同口径），未提供 ⇒ 字段缺席 ⇒ 运行时核心
`buildGovernedTools` 不注册工具（能力缺席＝结构性 fail-closed，沿 `requestClarification` 先例）。

### 2. 注入判据：只给报告员与统筹（2026-10-26 客户纠正/补充）

```ts
const requestRequirementChange: RequestRequirementChangeFn | undefined =
  isTrio && (trioSpec?.id === "rapporteur" || trioSpec?.id === "convener") && input.requestRequirementChange !== undefined
    ? input.requestRequirementChange
    : undefined;
```

- **报告员 Rapporteur 与统筹 Convener**均可发起需求变更审批（decision 卡；发起方不得自批），因此两者
  都注入能力位；该判据不再复用 `governanceFunction === "proposal"`（统筹的职能是 `schedule`）。
- 其他内置治理角色（liaison / nominator / verifier、single 模型的旧 su）与项目角色**即便调用方误给
  也不注入**（工具结构性不注册）；已用测试钉住全部非报告员/统筹角色不注入。
- 未提供 ⇒ 不注入。本层**纯透传**：意图校验/去重/派发/账本/系统行全部由应用能力实现。

### 2.1 decision 卡白名单与共享校验（2026-10-26 客户纠正/补充）

- `TRIO_CARD_KINDS.rapporteur` 增 `"decision"`（**仅限需求变更审批**；convener 原有 `"decision"` 保持）；
  Lead（liaison）仍只有 `intent-confirm`，Crew（nominator）/Proof（verifier）仍不可发。
- `decision-card.ts` 新增 `DECISION_CARD_ALLOWED_ROLES = ["convener", "rapporteur"]`，共享校验
  `validateDecisionCardRequest` 只放行这两类 trio 内置角色；single/su、项目角色与其它内置角色仍
  `role-not-allowed`（不弹卡、不写账本）。运行时契约没有「用途」字段：**机械上限只到角色**；
  「rapporteur 仅需求变更用途 / 发起方不得自批」由 judge 指引与角色纪律约束（机械拦截需契约新增
  用途/发起方字段，属跨角色变更）。
- 拒绝文案同步为「decision 卡只能由统筹/Steward（trio convener）或提案角色/Draft（trio rapporteur，
  仅需求变更审批）发起」。

### 3. 透传链

`capabilities` 条件展开 `requestRequirementChange` → `createRuntimeAdapterFactory` 显式写
`requestRequirementChange: capabilities?.requestRequirementChange` → Service `...options` →
`buildGovernedTools` 同名能力位注册工具。`undefined` ⇒ 零注册；显式写字段也防工厂 options 误带同名
能力在能力缺席时注册（同 `requestClarification` 先例）。

## 三、判断 agent 指引（prompt/facts 文案，不改机械权限）

- `governance-judge-facts.ts` 新增并导出唯一文案常量
  `GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE`（**只作文案单一来源，不参与事实提炼/裁决**）：
  - 提案卡若包含**未获意图授权**的新联网/外部目录访问/范围扩张/成本授权（或其它新授权诉求），
    一律不得 approve；decision 组不能 deny ⇒ **manual（reasonCode=`intent-drift`）**；approval 组
    写卡夹带同类诉求 ⇒ deny。
  - reason 必须写明：「Draft 应先发 request_requirement_change；需求变更审批卡由统筹（Convener）或
    提案角色（Rapporteur）发起，发起方不得自批；审批由独立判断 agent（勾选「替我决策」时按卡内唯一
    推荐项代批）或客户本人（未勾选时手选）完成；主理不审批，只在批准后执行意图变更；不得通过在提案卡上
    代批或将需求删掉绕过」——申请 ≠ 客户批准，也不是主理批准；提案卡上判断 agent 不能代批任何新授权。
  - 文案**不再写**「主理改意图 + intent-confirm 作为审批」（2026-10-26 客户纠正）。
- `governance-judge-prompt.ts` 从 facts 模块**只读引用**该常量，在系统提示新增
  「【提案卡与需求变更申请（2026-10-26 客户要求）】」节；decision rubric 由「仅统筹可发」改为
  「由统筹/Steward 发起；报告员 Rapporteur 仅可为需求变更审批发起，发起方不得自批」；并在
  「不判断（明确排除）」节补一句「未授权新授权属于意图漂移，不属工程质量/证据充分性排除项」。
- **机械权限零变化**：decision 组仍不得 deny，approval 组 deny 规则不变；`governance-judge-verdict.ts`
  判定未改（仅注释口径同步）；未新增 cardKind / FlowStepKind；`GovernanceJudgeFacts` 结构未新增字段
  （机械事实保持原样）。

## 四、测试与证据

新增 `test/编排/request-requirement-change.test.ts`（**5 例**，真实 `openRoleSession` + 假 provider，离线）：

1. rapporteur 提供能力 ⇒ capabilities 同引用、provider options 注册 `request_requirement_change`、
   handler 载荷原样路由（可选项缺席不造键）、回执如实转达（`code=dispatched`/`requestId`/「申请 ≠
   批准」/「主理只在批准后执行意图变更，不审批」/「发起方不得自批」/「意图变更」）。
2. **convener（统筹）同样注入同一引用、注册工具、载荷原样路由**（2026-10-26 客户补充）。
3. rapporteur 未提供 ⇒ 能力缺席且工具不注册。
4. 项目角色 X、旧 su、liaison/nominator/verifier 即便误给也不注入（工具零注册）。
5. 与既有矩阵互不隐含：rapporteur 未提供 `requestClarification` 时仍不注入、`handOffIntent`/
   `dispatchTask` 仍缺席（本批不改变其他能力位）。

新增 `test/编排/requirement-change-judge-guidance.test.ts`（3 例）：

1. 指引常量含未授权新授权清单、decision 组 manual/intent-drift、专用通道与「不得代批/删需求绕过」原句、
   「申请 ≠ 客户批准」「不能代批任何新授权」；审批通道为「统筹或提案角色发起、发起方不得自批、
   判断 agent/客户审批、主理只执行」，且**不含**「主理改意图」「intent-confirm」「统筹不参与」。
2. 系统提示逐字引用指引；proposal rubric 与排除项更新；decision rubric 写明「报告员仅可为需求变更
   审批发起」且不再写「仅统筹可发」；机械权限表述（decision 组不得 deny、deny 仅 approval 组）保持。
3. 不新增 cardKind / FlowStepKind：`governanceCardGroup` 仍只映射既有卡种（`requirement-change`/
   `requirement_change` 均 `undefined`）；`buildGovernanceJudgeFacts` 键集保持原样（无新机械字段）。

`test/编排/decision-card.test.ts` 增 **报告员正向 1 例**（actorRoleId=rapporteur、power=proposal、
decisionKind=material-choice、judge 证据）；拒绝集合改为 Lead/Crew/Proof；共享校验单测增 rapporteur
正向与 Crew/Proof 反向（既有断言未弱化）。

实跑（2026-10-26，win32 / Node v24.22.1，worktree `lead-governance-coordination` @ `99bbbe2`+在飞改动）：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向 3 文件 | `node --test "test/编排/requirement-change-judge-guidance.test.ts" "test/编排/request-requirement-change.test.ts" "test/编排/decision-card.test.ts"` | **28/28 pass** |
| 编排全量 | `node --test "test/编排/**/*.test.ts"` | **1016 tests / 1014 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink `shell-authorized-routine.test.ts:103` EPERM 基线，非本批） |
| 类型检查 | `npm run typecheck` | **exit 0** |

## 五、未做与风险

1. **桌面注入端与审批卡通道未接线/未验证**：桌面窗口需把 `requestRequirementChange` 注入扩展到统筹，
   并按新通道由统筹/报告员发 decision 卡（当前桌面在飞实现仍是投递主理任务 + intent-confirm 文案）——
   不在本角色边界，未实现未验证。
2. **主理执行意图变更链路**：decision 卡批准后由 Lead 更新 `docs/intents/**` 并通知 Draft 修订，属
   桌面/门禁卡/运行时协同；本批只改编排/共享校验与 judge 指引，未做端到端验证。
3. **judge 指引是提示词约束而非机械拦截**：判断 agent 仍可能违反 rubric 输出 approve；「rapporteur
   仅需求变更用途」「发起方不得自批」同样依赖角色纪律与 judge 指引（运行时契约无用途/发起方字段）。
   本批按任务要求不改变机械权限、不新增卡种/裁决分支。若需硬保证，需后续设计（例如契约新增用途字段
   或由编排核对需求变更票据），属跨角色变更。
4. **能力位与矩阵**：注入判据改为角色白名单 `rapporteur | convener`（不再复用 `governanceFunction
   === "proposal"`）；若未来新增可发起需求变更审批的内置角色，需要显式评审并同步 `DECISION_CARD_ALLOWED_ROLES`。
5. **并发在飞改动**：本批消费的运行时核心契约（`RequestRequirementChangeFn`/工具）与门禁引擎角色卡文案在
   工作树中为**未提交在飞改动**；本批未修改、未验收其内容。typecheck/测试结果以当前工作树快照为准。
6. **未 commit/push/重启**；`demos/` 未触碰；独立验收未做。

## 六、本批写集（逐项）

- `src/pipeline/orchestration/run-role.ts`（能力位/注入判据 rapporteur|convener/透传/白名单/拒绝文案）
- `src/common/编排/decision-card.ts`（`DECISION_CARD_ALLOWED_ROLES` 与共享校验）
- `src/common/编排/governance-judge-facts.ts`（文案常量单一来源）
- `src/common/编排/governance-judge-prompt.ts`（引用常量 + proposal rubric/排除项 + decision rubric）
- `src/common/编排/governance-judge-verdict.ts`、`governance-ledger.ts`（仅注释口径同步，判定/校验零变化）
- `test/编排/request-requirement-change.test.ts`（5 例）
- `test/编排/requirement-change-judge-guidance.test.ts`（3 例）
- `test/编排/decision-card.test.ts`（报告员正向 + 角色拒绝集合/共享校验用例）
- `角色卡/编排/docs/change/2026-10-26_change_request-requirement-change-orchestration.md`（本文件）
- `角色卡/编排/changelog.md`、`api-spec.md`、`feature-map.md`
