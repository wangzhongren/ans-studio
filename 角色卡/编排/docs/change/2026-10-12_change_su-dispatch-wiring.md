---
id: su-dispatch-wiring
type: change
title: su 派发任务（H-1）的编排侧共用件：文案 + 判定口径 + 能力透传
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, handback-acceptance-prompt]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §H-1（su 派发任务；派发 ≠ 授权；校验/失败语义「非本项目角色或指向 su 自身 → 如实回错」）
  - date: "2026-10-12"
    kind: implemented
    summary: 编排实施——renderDispatchPrompt（文案单一来源）+ isDispatchableRoleId（判定口径单一来源）+ openRoleSession 只对 su 透传 dispatchTask（前端路由）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 152/152（+3）；typecheck 本角色零错；全量 780 计/775 过，4 红均非本角色（2 既有环境 + 2 桌面在途）
---

# H-1 su 派发任务（编排侧）

> 依据：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §H-1。工具 `dispatch_task{ roleId, task, reason? }` 与契约家 `DispatchTaskPayload`/`DispatchTaskFn`（`src/provider/pi/session.ts:245-282`）归 **Pi适配器**（已落地；工具「注入才注册」）；**前端路由**（转成目标角色会话一条输入、自动开会话、忙时排队、去重、失败保留）与**校验的实时权威**归**桌面应用**；CLI 一次性前端不做同等路由（设计已登记）。

## 改在哪里（位置 → 改动）

**`src/common/编排/handback.ts`（两个纯函数；文案与判定口径的单一来源）**
- **`renderDispatchPrompt(req: DispatchTaskPayload): string`**——投递给目标角色会话的派发文案（两前端共用，不各写一份）：
  ```
  [派发] 来自 su 的任务（原因：<reason，若有>）
  <task 原文逐字保留>
  完成后请交回报告（改了什么/结论/证据）。
  ```
  措辞约束：**不得夹带任何授权语义**（**派发 ≠ 授权**——目标角色写权仍只来自其 Section 1 与 `request_confirmation` 的 `confirmed:true`）；`roleId` 用于路由/校验，**不进文案**（投递进目标角色自己的会话，自指冗余）。参数类型直接用契约家 `DispatchTaskPayload`（字段名零漂移）。——**文案示例**：
  ```
  [派发] 来自 su 的任务（原因：返工：证据不足）
  把 src/x.ts 的校验补上（依据 docs/design/a.md；完成标准：测试绿）
  完成后请交回报告（改了什么/结论/证据）。
  ```
- **`isDispatchableRoleId(project, roleId): boolean`**——H-1「非本项目角色 / 指向 su 自身 → 如实回错」的**判定口径单一来源**（供两前端路由实现复用）：判据 = 登记在 `project.roles`（su 等内置角色不进该映射 ⇒ 「指向自身」自动 false；未登记/空串 → false，fail-closed）。**文档已登记快照注意**：`project` 是会话开启时的快照，su 本会话**新建**的角色不在其中——校验权威在**持有实时角色清单的前端**（以实时清单重建 project 再判，勿凭旧快照误拒）。

**`src/pipeline/orchestration/run-role.ts`（能力透传，一处判据）**
- `AdapterCapabilities.dispatchTask?: DispatchTaskFn`（契约家类型直接引用）；`openRoleSession` 增输入 `dispatchTask?`（前端路由实现）——**只对治理角色（su）转交**：`suppressHandback ? input.dispatchTask : undefined`（项目角色会话即便误给也不注入 ⇒ `dispatch_task` 不注册）；`createPiAdapterFactory` 原样转发。CLI（`runGovernSession`/`governCommand`）不传 ⇒ su 会话里该工具不注册（设计已登记的「CLI 不做同等路由」）。
- **编排未加校验包装**（理由）：校验须对**活的角色清单**（见上快照注意），权威在前端；编排包装只会对开启时快照校验、把 su 刚建的角色误拒。判定口径由 `isDispatchableRoleId` 单一提供（前端路由用它判），失败以 `{ok:false, message}` 回执如实转达 su。

## 不改什么

- **派发 ≠ 授权**：本层未给派发任何写权语义；目标角色的 gate/边界/确认制流程一字未动。
- 回交（E-1）/确认制（A-3）/会话目录（D-1）/报告（C-1）均未动；`WithHandback`/`AdapterCapabilities` 既有字段语义不变。
- 工具定义与注册条件（未注入即不注册）、路由/队列/去重归各自角色。

## 如何确认（实际结果）

- `test/编排/handback.test.ts`（**15 例全绿**，H-1 新增 3）：`renderDispatchPrompt` 逐行断言（三行恰界、task 原文逐字、无 reason 不写原因段、多行 task（含空行）原样、roleId 不进文案、**无授权字样反向断言**）；`isDispatchableRoleId`（登记角色 true / su 自身 false / 未登记 false / 空 false / 快照外角色 false）；能力透传（**su 拿到、项目角色不给**（即便误给）、未给路由不注入）。
- `test/编排/` **152/152**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**780 计 / 775 过 / 4 红 / 1 skipped**——4 红逐条归因：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 2 条**桌面在途**（`test/桌面应用/handback-delivery.test.ts:194/214`，其 E-1 投递实现进行中）。**本角色零红**。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。闭环端到端（su 派发 → 角色干活 → 回交 → su 验收 → 需要则再派发）属**客户跑**。

## 跨角色

- **桌面应用**：路由（自动开目标会话/排队/去重/失败如实提示并保留）＋用上述两个函数（文案、判定口径）。去重键形态沿用 `handbackKey` 一脉。
- **Pi适配器**：`dispatch_task` 工具与契约（已落）；工具 handler 只调用注入 fn、如实转达回执。
