---
id: handback-acceptance-prompt
type: change
title: 回交投递文案的单一来源（E-1）：renderHandbackPrompt + 去重键
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §E-1（回交后的 su 验收；客户裁定全自动，不做开关）
  - date: "2026-10-12"
    kind: implemented
    summary: 编排侧提供 renderHandbackPrompt（投递文案单一来源）与 handbackKey（去重键构造单一来源）；投递/排队/自动开会话归桌面，未实现
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 148/148（+2）；typecheck 全仓零错；全量 744 计/741 过，仅剩 2 条既有环境红
---

# E-1 回交投递文案（编排侧）

## 改在哪里（位置 → 改动）

**`src/common/编排/handback.ts`（新增两个纯函数；本文件唯一改动，无接线变更）**
- **`renderHandbackPrompt(hb: TaskHandback): string`**——投递给 su 验收的**文案单一来源**：
  ```
  [回交] 来自 <角色> 的报告（任务 <taskId，若有>）
  结论：completed | blocked
  摘要：<summary>
  证据：
    - <逐条；无则「（无）」>
  请验收：确认通过 / 要求返工 / 上报客户。
  ```
  措辞约束（守 SKILL.md 交接语义）：**明确请求验收**、字段逐条、**不夹带任何权限语义**（回交只搬任务与证据，不搬身份/写权）。两前端共用本函数，**不得各写一份**。
- **`handbackKey(hb): string`**——投递**去重键**的构造单一来源（设计 §E-1：「一条回交只投递一次，避免重放刷屏」）：键 = `<roleId>\0<taskId或空>\0<at>`，同一份 `TaskHandback` 恒等。

**未做（归桌面应用，设计 §E-1 归属）**：投递本身（把文案作为一条输入送进 su 会话）、su 忙时**排队**与失败如实提示、su 会话未开时**自动开启再投递**、去重**登记**。「自动/开关」客户已裁定**全自动不做开关**——本层未引入任何开关。选装 **O-E1**（su 以结构化方式记录验收结论）未做（未获准）。

## 如何确认（实际结果）

- `test/编排/handback.test.ts`（**12 例全绿**，E-1 新增 2）：`renderHandbackPrompt` 逐行字段断言（含「请验收」存在、无 taskId 不写任务段、无证据呈「（无）」、**无权限字样**反向断言）；`handbackKey` 恒等/差异断言（角色/任务/时间任一不同即不同）。
- `test/编排/` **148/148**；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（引号带）**744 计 / 741 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实端到端（回交→su 真验收）属**客户跑**。

## 跨角色

- **桌面应用**：按 §E-1 实现投递（用 `renderHandbackPrompt` 生成输入、`handbackKey` 去重、忙时排队、su 未开时自动开启；失败/超时如实提示不静默丢）。界面回交卡不变。
- 其余（Pi适配器）不涉及。
