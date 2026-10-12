---
id: operator-card-no-timeout
type: change
title: 交互卡不再按时间过期（G-1）：唯一失效＝应用重启/关闭；无计时器钉子
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-card-delivery-and-tool-rows]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定（设计 G-1）「没必要超时啊，就卡在这等客户同意呗」——删掉卡片的按时间过期路径，保留唯一真实失效（应用关闭/重启）并改如实文案
  - date: "2026-10-12"
    kind: implemented
    summary: renderer 失效文案改「请求已失效（应用已重启/关闭）…请让角色重新发起」+ 删时间性措辞；customer-input.ts 同口径；测试加「无计时器」钉子与重启回包终态断言；e2e 探针文案同步
  - date: "2026-10-12"
    kind: verified
    summary: 本角色可装载套件 36/36 全绿（renderer/markdown/session-history/project）；同期 Pi适配器正并发移除工具层超时（src/** 在制），经 run-role 的套件瞬时无法加载——非本改动，待其落地复跑全量
---

# 交互卡不再按时间过期（G-1）

**来源**：客户裁定（设计稿 G-1）：「**没必要超时啊，就卡在这等客户同意呗**」。实施面：
`app/renderer/renderer.js`、`app/desktop/customer-input.ts`、`test/桌面应用/**`、本页。

> **状态：已实施、已验证（本角色可装载套件 36/36）。** 全量复跑受**他角色并发在制**影响（见文末
> 「并发说明」）。e2e 探针文案已同步、**本轮未跑**。

## 改动（桌面侧）

1. **删掉"按时间过期"路径**：桌面本来就没有任何计时器（复核确认——renderer/通道/三个纯函数模块均
   **无 setTimeout/setInterval**）；本次把**措辞与注释里的"时间性"一并删净**（「超时或已被处理」→ 不再出现）。
2. **保留唯一真实失效终态**：`respond` 对「无挂起请求」仍回 `{ok:false, expired:true}`——但**语义收窄为**：
   **应用关闭/重启**导致未决请求随窗口清空（通道/登记表都在窗口内）。卡片定格文案改为如实：
   **「请求已失效（应用已重启/关闭），未获同意——请让角色重新发起。」**（含出路；不再暗示"超时"）。
   通道侧原因同步：「没有待答的交互请求（应用重启/关闭会清空未决请求）」。
3. **等待期间的两条覆盖（核实，均事件驱动、与时限无关）**：
   - **B-3 徽标「等待你确认」**：由 `openRequestCountFor(roleId) > 0` 重算——请求一入登记表就亮，
     作答（或失效）后才灭；**没有任何"等待太久就改变状态"的逻辑**；
   - **未查看指针**：请求不属于当前查看角色时向当前 pane 放只读行「【待确认】角色 <X> 有一条交互请求
     等你作答——点左侧该角色查看」——同样**无时限**（行留着，直到该请求被处理；只提示、不搬卡）。
4. **e2e 探针**：`OPX_EXPIRED_FROZEN` 文案片段由「已结束」改为「**已失效**」。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- **无计时器钉子**（G-1 核心）：去注释源码断言——`renderer.js` 与 `customer-input.ts` **均不含
  setTimeout/setInterval**（说明性注释不误伤：用去注释文本断言）；旧「可能已超时」「超时或已被处理」
  措辞**不得**存在。
- **卡片长期 open**：卡片状态机无任何自动迁移路径（只有客户作答/通道回包两种输入）；幂等/补挂/徽标
  重算等既有断言保持。
- **重启后旧 id 回包 → 失效终态**：`operator-wiring.test.ts`——未知 id → `{ok:false, expired:true}` 且
  **原因文案指向「重启/关闭」**；`renderer.test.ts`——失效定格文案逐字断言 + `entry.state = "expired"`。
- **已作答的卡仍定格**：既有断言（`decided` 终态 + 按钮隐藏 + note）保持。
- **本角色套件（最终复跑）**：`node --test "test/桌面应用/*.test.ts"` → **111 计 / 110 过 / 1 红**——**唯一红为
  既有环境红**（pi-config 断言检出目录名 `ans-cli`，本机 `ans-runtime`；**未动**）。G-1 的全部钉子
  （无计时器、旧文案不得存在、重启旧 id→失效终态与如实文案、已作答仍定格）在此全绿。

**并发说明（如实，含最终复跑）**：本轮验证期间 **Pi适配器正并发移除工具层超时**（`timeout.ts` 的
`DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS`/`resolveCustomerInputTimeoutMs`/`CUSTOMER_INPUT_PROMPT_MARGIN_MS`
被删；其 `real-adapter.ts`/`tools.ts` 已随之收敛，**剩余 3 处 typecheck 错全在其自身测试
`test/pi-adapter/customer-input.test.ts`（38/40/41 行）**）。因此：
  · `npm run typecheck` → **3 错，全部在 `src/**` 之外的本角色之外**（他角色测试，非本改动）；
  · 全量 `node --test "test/**/*.test.ts"` → **739 计 / 735 过 / 3 红 / 1 skipped**——3 红 = 其一
    `test/pi-adapter/customer-input.test.ts` 文件级加载失败（他角色在制）＋ 两既有环境红（pi-config；
    项目管理 `path-primitives` 的 macOS `/var`）——**均非本改动**；
  · **本角色 `test/桌面应用` 全套在上述并发期仍 110/1**（1 红＝既有环境红）——本改动的红为零。
  待 Pi适配器落地其测试引用后，全量与 typecheck 应按其原有水平复绿（无需本角色再动）。

## 跨角色建议（写清谁做什么；桌面不自行上）

- **去时限的落点在 Pi适配器**：客户已拍板 G-1 ⇒ 工具层 `withTimeout` 对 `request_confirmation`/
  `request_choice` 应**不再按时间放弃**（现状 `DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS=110000`；本轮起桌面侧
  `customerInput` 不携带任何超时参数，过去与现在都如此）；`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 的处置
  （停用/标注为遗留）归**适配器**。
- **已知残留（适配器仍在超时期间）**：适配器超时发生时，工具侧已按「未获同意」返回，而桌面**无信号可辨**
  ——卡仍 open（等待中）；客户此后作答，桌面会照常受理并显示「已确认」，但该答案已被上游弃用——
  **界面与工具结论可能不一致**。消除它只有一条正路：**适配器停用该时限**（桌面侧无法感知、也不该
  自造第二套计时来猜）。
