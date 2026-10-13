---
id: handback-round-stable-key
type: change
title: 回交「每轮至多一份」+ 去重键去时间戳（X-2 硬化）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, handback-acceptance-prompt]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 真机：适配器每轮发两次 settled（其两发射点，Pi适配器同刻修根因）⇒ 每轮两份回交；旧去重键含 at（毫秒）⇒ 判重失效 ⇒ su 收到 7 份逐字相同的投递
  - date: "2026-10-12"
    kind: implemented
    summary: withHandback 按「settle 突发」每轮至多一份；TaskHandback 增 round；handbackKey 改稳定键（roleId+taskId+round+内容哈希，不含时间戳）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 166/166（+2）；typecheck 本角色零错；全量 889 计/886 过，仅剩 2 条既有环境红
---

# X-2：回交每轮至多一份 + 稳定去重键

> 真机背景：适配器**每轮发两次 `settled`**（两个发射点；Pi适配器同刻在修根因）⇒ `withHandback` 每读到一个 settled 就发一份回交；桌面去重键（旧 `handbackKey` 含 `at`，毫秒差）**判重失效** ⇒ su 收到 **7 份逐字相同**的重复投递。本改动为**纵深防御**（根因修复在适配器侧，两处同刻落地）。

## 改在哪里（`src/common/编排/handback.ts`）

1. **每轮至多一份回交（`withHandback`）**：轮次以**「settle 突发」**为界——用「自上次回交以来是否出现过新事件」的置位判定：突发里的**第一份** settled 发回交并透传；其后的重复 settled **仅透传**。`settled` 之间若来了新事件（正常新一轮／真返工）→ 视为**新一轮**、照常再发。每份回交写 `round`（1 起递增）。
   **既有语义不变**：先回交再透传 `settled`（保住以 settled 为终止信号的消费方）；无 settled 不发回交。
   **残留（如实登记）**：若「两次 settled 之间夹着别的**事件**」而实为同轮的重复发射，本防护不合并（按新一轮各发一份，`round` 不同 ⇒ 键不同 ⇒ 投递侧也不判重）——这是根因所在，靠 Pi适配器修单次发射，本层不猜。
2. **去重键去时间戳（`handbackKey` 改稳定键）**：`<roleId>\0<taskId或空>\0<round或空>\0<内容哈希16位>`；内容哈希 = SHA-256(`status\0summary\0evidence…`) 前 16 位。**不含 `at`**。
   - **两类判定分工**：同轮重放/重复 settled ⇒ round 与内容都同 ⇒ **恒等键 ⇒ 判重**；**新轮真返工即便文本逐字相同 ⇒ round 递增 ⇒ 键不同 ⇒ 照常各自投递**（满足「真返工需能区分」）。
   - `TaskHandback` 增**可选** `round?: number`（由 `withHandback` 写入；不进入投递文案）。
3. **对桌面的影响：零代码改动**——桌面只调 `handbackKey(hb)` 并以其登记去重（键内部形状变化对它透明）；`round` 是可选字段，回交卡渲染不受影响。**行为改善**：双 settled 不再产生第二份回交；同轮重放恒判重；同文本真返工不再被永久误判（旧键问题已除）。**给桌面的告诫（转达）**：**不得**自行往键里拼时间戳或改用 `at`——那会同时打坏上面两类判定。

## 如何确认（实际结果）

- `test/编排/` **166/166**（+2，另有既有键用例改写）：
  - 双 settled 突发 → **恰一份回交**、两份 settled 均透传、**次序（回交在第一份 settled 前）**保持、`round=1`；三连 settled 仍一份；
  - **真返工**（两轮、报告文本**逐字相同**、其间有新事件，且夹带双 settled）→ **两份**回交、`round=[1,2]`、**键不同**（对照组：文本确逐字相同）；
  - 稳定键：同内容不同 `at` → **恒等**（旧键判重失效的要害）；`round`/角色/任务/摘要/证据/状态任一不同 → 不同键；无 round 亦稳定。
- `npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**889 计 / 886 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。
- 真机复验（双 settled 消失 + 无重复投递）待 Pi侧根因落地后属**客户跑**。

## 跨角色（请 pm 转达）

- **Pi适配器**（根因侧）：每轮 `settled` 单次发射（其两个发射点收一）；落地前本层防护在「干净突发」下已把重复压到 1 份，夹事件的变体仍会多发（见残留）。
- **桌面应用**：无需改码；保持「只调 `handbackKey`、不拼时间戳、不因键含 round 而改判」。
