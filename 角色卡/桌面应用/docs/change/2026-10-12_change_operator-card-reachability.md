---
id: operator-card-reachability
type: change
title: P-1 待确认卡可达性（到达即达 + 常驻 chip + 切回滚到卡）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-cards-and-finalize-removal, hot-path-and-virtual-stream]
events:
  - date: "2026-10-12"
    kind: created
    summary: 真机现象——su 卡后被 288 行活动淹没，客户没看到（以为卡丢了）
  - date: "2026-10-12"
    kind: implemented
    summary: 到达即达（先量后挂，阈值 120px）+ 常驻「待确认」chip（计数/逐张定位/高亮；同状态源）+ showPane 滚到卡
  - date: "2026-10-12"
    kind: verified
    summary: e2e 真机验证全绿（P1_* 9 项 true；E2E_DONE=1）；test/桌面应用 155/154/1（唯一红=既有环境红）；全量 857/854/2；typecheck 0
---

# P-1 待确认卡可达性

**来源**：真机实测（su 发卡后同会话又有 288 行活动，卡被推深、客户以为丢了）。**属本角色边界内**。

## 机制与阈值

- **到达即达**（`materializeOperatorCard`）：**先量后挂**——判据 = 「**到达前**用户是否在底部附近」：
  `state.selectedRoleId === 角色 && 距底 ≤ 120px（ui-labels.js::AUTO_SCROLL_THRESHOLD_PX）` ⇒ 贴底滚到卡；
  否则（在往上翻/不在该角色）**不打断**（不强制滚动）。**e2e 抓出的时序 bug**：初版把判据放在**加卡后**测量——
  卡本体上百 px 立刻把距离推过阈值 ⇒ 永不滚动；已改为挂载前取距离（`nearBottomAtArrival`）。
- **常驻 chip**（`#op-chip`，`#chat` 的 sticky 尾元素）：该角色**未作答卡存在且正看着它** ⇒ 亮，文案
  「有 N 条待确认 · 定位」（纯映射 `pendingChipLabel`）；点击**逐张定位**（到达次序循环：滚动到下一张 + 高亮
  `is-flash` 一次性 CSS 动画——无计时器）；**作答/失效（含 expired 终态）⇒ 灭**。
- **同一状态源**：chip 计数/徽标/当前 pane 指针都出自 `openRequestIdsFor(roleId)`；刷新点统一在
  `refreshAwaitingBadge`（同处刷 chip）。
- **切回**（`showPane`）：有未作答卡 ⇒ **滚动到第一张**（而不是停在底部）；无卡 ⇒ Q-2 的滚动位置恢复。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- `renderer.test.ts` P-1 例：阈值两分支（含 ≤120 边界与非法值）、chip 文案、单一状态源/同点刷新、**先量后挂**
  源码钉、Esc/关闭/拒绝=不放行、无计时器（注释剥离后断言）、样式钩子。
- **e2e 真机（真实 Electron）**：`P1_ARRIVAL_SCROLLED=true`、`P1_CHIP_VISIBLE/COUNT2/CLICK_LOCATES/
  SECOND_CARD/COUNT1_AFTER_TERMINAL/HIDDEN_AFTER_ALL_TERMINAL/SWITCHBACK_SCROLLS_TO_CARD/CLEANUP=true`
  （另含 `P1_ARRIVAL_DEBUG` 数值：dist=49、卡完整在视口内）——`E2E_DONE=1`。
- 桌面全套 **155/154/1**（唯一红=既有环境红 pi-config）；全量 **857/854 · 2 红**（两红均既有环境红）；typecheck 0。

## 不符之处（如实）

- 到达不打断的判据只覆盖**卡到达**这一刻；后续流事件仍按既有行为贴底（未改流式滚动策略——如需「阅读中不打扰」的全局策略另议）。
