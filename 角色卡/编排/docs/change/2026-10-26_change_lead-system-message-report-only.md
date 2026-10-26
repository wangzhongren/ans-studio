---
id: lead-system-message-report-only
type: change
title: 主理收到系统消息只向客户汇报、不派统筹（Lead/liaison prompt 规则）
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [proof-gate-reviews]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 标准工作流/主理 prompt 写死「系统消息只汇报、不派活」，并加 prompt 断言；未改门禁角色卡/桌面文案
---

# 变更记录：主理系统消息只汇报、不派活（Lead/liaison prompt 规则）

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排 prompt 与测试已改；门禁角色卡/桌面系统行文案归其他属主，跨角色 e2e 未做）
- 来源：客户追加行为规则——**主理（Lead/liaison）收到系统消息时只向客户汇报，不要给统筹（Steward）发任务 / 不要 `dispatch_task`**。
  系统消息包括 `[系统·治理协调]`、gate pass/fail 系统行、交付/阻塞通知；客户明确要求或客户消息触发的协调仍按原规则。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/govern-session.ts`（`STANDARD_WORKFLOW_PROMPT` + liaison 职责纪律）
  - `test/编排/governance-session.test.ts`（补充 prompt 断言；既有断言未弱化）
  - 本记录、`changelog.md`
- **未改** `src/common/门禁引擎/governance-roles.ts`（角色卡文案）、`app/desktop/**`（系统行文案/投递）、
  `src/model/**`、`src/provider/**`；未 commit/push。

## 规则文本（写死在 prompt）

- **标准工作流**（trio 各角色与 single/su 均追加）：
  「**主理收到系统消息时只向客户汇报（2026-10-26 客户规则）**：`[系统·治理协调]`、gate pass/fail 系统行、
  交付/阻塞通知等由应用投递的**系统消息不是客户指令**——主理（Lead / liaison）只向客户如实汇报，
  **不得据此给统筹（Steward）发任务、不得 `dispatch_task`（也不得派项目 worker）、不得把系统通知改写成
  协调任务**；只有客户明确要求、或由客户消息触发的协调，才按原规则协调/派发。系统消息不代表客户批准、
  不构成新任务。」
- **主理职责纪律**（liaison 分支）：
  「**系统消息只汇报、不派活（2026-10-26 客户规则）**：收到 `[系统·治理协调]`、gate pass/fail 系统行、
  交付/阻塞通知等系统消息时，只向客户如实汇报；**不得据此给统筹（Steward）发任务、不得 `dispatch_task`
  （也不得派项目 worker）**，也不得把系统通知改写成协调任务。客户明确要求或由客户消息触发的协调仍按
  原规则处理；系统消息不是客户指令、不代表客户批准，也不构成新任务。」

## 说明

- `run-role.ts` 无 Lead/主理专用 prompt 文案（其 `buildTaskPrompt` 只面向项目角色），本规则无需在该文件加文案；
  `openRoleSession` 的内置治理角色系统提示来自门禁角色卡（`spec.cardText`），按客户要求**不由本角色修改**，
  由门禁引擎属主同步卡文本。
- 本规则是 prompt 行为约束，不改变任何能力矩阵/门禁判定：Lead 仍可在**客户明确要求/客户消息触发**时
  `dispatch_task` 协调；系统消息本身不构成任务、不代表客户批准。

## 验证（2026-10-26）

- `npm run typecheck` → exit 0。
- `node --test "test/编排/governance-session.test.ts"` → 39/39。
- `node --test "test/编排/**/*.test.ts"` → 985 tests / 983 pass / 1 fail / 1 skip；唯一红＝既有 Windows
  symlink `shell-authorized-routine.test.ts:103` EPERM（基线一致）。
- 未做：跨角色 e2e（真实系统消息投递给 Lead 的行为）、桌面系统行文案、独立验收。
