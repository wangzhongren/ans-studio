---
id: dispatch-task-lead-steward-runtime-core
type: change
title: dispatch_task 文案支持主理 Lead 向 Steward（convener）派发做内部协调
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [dispatch-task]
---

# `dispatch_task` 文案：Lead 可向 Steward（`convener`）派发做内部协调

## 背景（客户拍板）

客户 2026-10-20 拍板：主理 Lead（Liaison）成为**工作流管理者**，可向 Steward（`convener`）/项目角色派发任务。运行时核心只负责 `dispatch_task` 的 schema 文案（未 commit）；实际目标校验、派发范围门与注入判据在编排/门禁（本批不改）。

## 改动（`src/provider/runtime/schema.ts::describeTool("dispatch_task")`）

1. `roleId` 描述：由「Target project role id（必须是项目角色，不能是内置治理角色）」改为：
   - 目标**通常是项目角色**；
   - **当调用者是 Lead（Liaison）时，`convener`（Steward）也可作为协调目标**；
   - **其余内置治理角色永不可作为目标**，也不能派发给调用者自己。
   - 参数类型/枚举/必填（`required:["roleId","task"]`）与 `additionalProperties` **不变**。
2. `flowId`/`stepId` 描述：治理派发仍须 `flowId`；**Lead→Steward 协调可省 `stepId`**（仍带 `flowId`）；旧 su 调用可两者皆缺（旧行为）。字段语义与 pattern 不变。
3. 工具 `description` 补：
   - 「主理向 Steward 派发属**内部协调**，**不是客户批准**；Steward/项目角色仍按自己的已接受边界与门禁执行。」
   - 任务文本自足一句补「治理派发带 `flowId`；主理向 Steward 协调时可省 `stepId`」。
   - `roleId` 句改为「通常是本项目角色；主理（Lead/Liaison）还可把 `convener`（Steward）作为协调目标——其余内置治理角色不可作为目标，也不能派发给调用者自己」。
4. `promptGuidelines` 新增一条：Lead 可向 Steward（`convener`）派发做内部协调——**不是客户批准**、不代表 Steward 已同意；Steward/项目角色仍按自己的边界与门禁执行；**不要**理解为可向任意内置治理角色派发。任务自足条补 flowId/stepId 口径。
5. **未改**：工具 handler、注入条件、目标校验、派发范围门、门禁卡、编排/桌面文件。既有「派发 ≠ 授权 / 先落盘再派发 / 按地址引用 / 必读（按序）」文案逐字保留。

## 测试（`test/runtime-core/tools.test.ts`）

在既有 dispatch schema 用例中新增断言（既有断言未放宽）：
- `roleId` 描述含「usually a project role」「when the caller is Lead (Liaison)」「`convener` (Steward)」「Other built-in governance roles are never valid targets」「cannot dispatch to yourself」。
- `description`＋`promptGuidelines` 含「主理（Lead/Liaison）」「内部协调」「不是客户批准」「Steward/项目角色仍按自己的…边界与门禁执行」「带 `flowId`」「可省 `stepId`」。
- 反向：全文不含「可派发给任意内置角色」。
- 参数形状不变（required 仍 `["roleId","task"]`、executionMode 仍 `undefined`）；既有反向断言（不得暗示派发携带授权）继续通过。

## 验证（真实输出）

- `node --test test/runtime-core/tools.test.ts`：**11/11 过**。
- `node --test "test/runtime-core/**/*.test.ts"`：**240 计 / 239 过 / 0 红 / 1 跳过**（跳过＝boundary-write-guard Windows 条件用例）。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色只读复跑：`node --test test/pi-adapter/dispatch-task.test.ts` **11/11 过**。
- 未跑真实模型 / 凭据 / 网络；未 git 提交。

## 跨角色待办（编排/门禁，本批未改）

1. **注入端**：需把 `dispatch_task` 注入 Lead（Liaison）会话（运行时核心只改文案；注入判据属编排/桌面）。
2. **目标校验/派发范围门**：编排的 `dispatchTask` 能力当前按「项目角色、不得指向内置治理角色」校验/回执；需放行「调用者为 Lead 时 `convener`（Steward）可作为目标」，其余内置治理角色仍拒绝。运行时核心 handler 不校验 roleId 语义（回执如实转达，裁决在能力侧）。
3. **Steward 协调的 flowId/stepId**：派发范围门若对治理角色强制 `stepId`，需放宽 Lead→Steward 协调可省 `stepId`；否则文案与实际门禁不一致。

## 残余风险

- 文案先于编排/门禁放行落地：若编排仍拒绝 `roleId="convener"`，模型会看到「允许」但被回执拒绝（fail-closed，不会误派发）；需按上列待办同步。
- 只放开 `convener` 一个内置角色；文案用「其余内置治理角色不可作为目标」而非枚举全部角色，避免把 su/rapporteur/nominator/verifier 等写成可派发。
