---
id: shell-approval-role-label
type: change
title: shell 审批卡正文按实际内置治理角色显示（不再一律「SU 审批档」）
created: "2026-10-19"
status: implemented
---

# shell 审批卡正文按实际内置治理角色显示

## 客户反馈（真机截图）

> Proof / 验收 发起的 shell 审批卡正文仍写「SU 审批档：风险命令…」「命中原因：su-审批档[risky]」。
> 五个内置治理角色现在都走同一审批档，不应再显示 SU；应按实际角色显示（如「Proof / 验收 审批档」
> 或「命令审批 · Proof / 验收」）。内部解析前缀 `su-审批档[tier]` 可保留（兼容），但展示文案要角色化。

背景：2026-10-19「全部内置治理角色接入 shell 审批档」后，liaison/rapporteur/nominator/convener/verifier
与 single 的 su 共用同一审批档；卡片正文的 `reasonPlain` 仍由桌面通道硬写「SU 审批档」。

## 改动（仅展示层；判定与解析零变化）

- `app/desktop/operator-channel.ts`
  - 新增导出 `approvalRoleDisplayName(roleId?, displayName?)`：纯展示映射。
    - single/su、缺省（无角色上下文）、非内置治理 id（项目角色）⇒ `"SU"`——旧文案逐字保留；
    - trio 内置治理角色（liaison/rapporteur/nominator/convener/verifier）⇒ 门禁引擎注册表的统一显示名
      （`Lead / 主理`、`Draft / 提案`、`Crew / 组队`、`Steward / 统筹`、`Proof / 验收`）；
    - 显式传入的 displayName 优先（供将来调用方自定义）。
    - 显示名的单一来源仍是 `src/common/门禁引擎/governance-roles.ts`；本层经 Service 公共出口
      `src/service/boundary/resolve-boundary.ts` 的 `governanceRoleOf` **只读消费**（不复制数据、
      不另立第二份映射——与既有 `shell-rules.ts` 先例同）。
  - `suApprovalPlainReason(tier, roleDisplayName?)` 与 `plainReasonFor(reason, roleDisplayName?)`：
    审批档人话改为「<角色显示名> 审批档：<tier 人话>——须逐条客户批准才执行…」；缺省/su 仍为
    「SU 审批档：…」。三条必备披露（逐条客户批准 / 拒绝超时通道不可用＝拒绝 / 批准后可能绕过
    ANS 文件写边界）逐字保留。
  - `buildShellConfirmRequest(id, display, roleDisplayName?)`：把角色名只用于 `reasonPlain`；
    `reasonRaw`、`tier`、`policy` 与内部 `su-审批档[tier]` 前缀解析**逐字不变**（解析兼容）。
  - `createShellConfirmPresenter(...).presenter.present`：由 `metadata.roleId`（会话闭包注入的
    实际角色 id）解析展示名后构建卡片；presenter 之外直接调 `buildShellConfirmRequest` 的旧调用方
    （缺省角色上下文）保持「SU」旧文案。
  - `judgeNotice` 不含审批档文案，无需改动；手动回落卡仍原样逐字呈现（`manualJudgeNotice` 未变）。
  - 内部 `ShellJudgeResultPayload.policy="su-approval"` 等线值不变（仅展示层角色化）。

- 未改动：`src/**`、`app/renderer/**`、其他角色文件；不 commit。
  - 并行事实（桌面UI 角色工作树改动，非本角色）：`app/renderer/ui-labels.js` 已把卡片**标题**按
    `payload.roleId` 显示为「命令审批 · Proof / 验收」；载荷 `roleId` 由既有 presenter 照旧写入，
    与本改动互补。正文「命中原因：<reasonRaw>」行仍按既有渲染契约展示内部原文（本次按要求保留
    `reasonRaw` 前缀不改）。

## 行为矩阵（展示层）

| 会话角色 | 卡片正文 reasonPlain | 内部 reasonRaw/tier/policy |
| --- | --- | --- |
| su（single）/ 无角色上下文 | `SU 审批档：风险命令（risky）——…`（旧文案） | 不变 |
| liaison | `Lead / 主理 审批档：…` | 不变 |
| rapporteur | `Draft / 提案 审批档：…` | 不变 |
| nominator | `Crew / 组队 审批档：…` | 不变 |
| convener | `Steward / 统筹 审批档：…` | 不变 |
| verifier | `Proof / 验收 审批档：…` | 不变 |
| 项目角色 | 既有项目映射（不出现任何治理角色名） | `policy="project"`，tier=null |

## 测试

- `test/桌面应用/operator-channel.test.ts` 新增两例（既有断言零放宽）：
  1. 纯映射：五个内置治理角色的展示名来自注册表，`plainReasonFor`/`buildShellConfirmRequest` 按角色
     显示且不含「SU 审批档」；su/缺省保持「SU 审批档」；项目角色不显示治理角色名；`reasonRaw` 前缀
     逐字保留且仍可 `parseSuApprovalTier`。
  2. presenter 接线：`metadata.roleId=verifier` ⇒ 卡片 `reasonPlain` 以「Proof / 验收 审批档」开头、
     不含「SU 审批档」；`roleId=su` ⇒ 仍为「SU 审批档」；项目角色 `policy=project` 且不出现任何
     治理角色名。
- 真实输出：
  - `node --test "test/桌面应用/**/*.test.ts"` ⇒ **605 计 / 604 过 / 1 红**。
    唯一红＝已知既有 `test/桌面应用/runtime-ui.test.ts:69`「renderer 仅消费 IPC，机密为空且无持久化…」
    （renderer.js 侧栏持久化代码含 `localStorage`；该文件属桌面UI域，非本变更引入，按要求未触碰）。
    本批净增 2 例（改前 603 计 / 602 过 / 1 红），红数未增。
  - `node --test test/桌面应用/operator-channel.test.ts` ⇒ **52/52 过**。
  - `npm run typecheck` ⇒ **exit 1，6 错**，全部位于
    `src/common/runtime-core/shell-judge/policy.ts`（`judgeReadCacheKey` 未收窄 `ParsedJudgeReadRange`
    的 `{ok:false}` 分支）——该文件是**其他角色**工作树中的未提交改动（会话开始时 git status 即含
    `M src/common/runtime-core/shell-judge/policy.ts`），与本次改动无关；`app/desktop/**` 与
    `test/桌面应用/**` **0 错**（tsc 输出逐条核对）。

## 残余风险（如实登记）

- 内部前缀 `su-审批档[tier]` 与线值 `policy="su-approval"` 保留（兼容旧驱动/编排/审计）；它们仍会
  出现在渲染侧「命中原因」可见行与折叠详情中——本次按客户/任务口径只角色化展示文案，不改内部前缀。
- 卡片标题的角色化在桌面UI 角色的 `ui-labels.js`/`renderer.js`（并行工作树改动）；若该侧未合入，
  标题仍为旧「SU 命令审批」，但正文已按实际角色显示。
- 展示名映射对未知/非内置 id 回落「SU」；当前接入面只会对 `role.builtIn === true` 的会话产生审批档
  卡片，项目角色正常不会走到该分支。
