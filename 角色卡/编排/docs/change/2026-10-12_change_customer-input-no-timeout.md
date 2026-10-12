---
id: customer-input-no-timeout
type: change
title: 客户确认不设超时（G-1）：CLI 终端问答语义同步
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, governed-interaction-a3a4]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §G-1；客户裁定交互等待不超时（归属 Pi适配器 + 编排 + 桌面）
  - date: "2026-10-12"
    kind: implemented
    summary: 编排侧核实并同步——CLI 通道自体本无计时器（头注清理过时表述）；补「延迟作答仍生效」测试；runGovernSession 等待路径无时限（掐断点在 Pi侧 prompt/工具时限，已列建议）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 149/149（+1）；typecheck 本角色零错；全量 757 计/753 过，3 红均非本角色（2 既有环境 + 1 桌面在途）
---

# G-1：CLI 客户确认不设超时（编排侧）

> 依据：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §G-1；客户裁定「交互工具的等待**不超时**」。归属：Pi适配器（去缺省等待上限；**客户输入挂起期间 prompt 硬超时不得掐断该轮**）＋**编排**（CLI 通道语义同步）＋桌面（卡片不再按时间过期）。

## 编排侧核实与改动

**核实结论（逐项，只读 + 代码事实）**：编排层对客户确认的等待**本就没有任何计时器**——
- `createCliCustomerInput`（`src/common/编排/operator-channel.ts`）：`readLine` 一直等作答，无 `setTimeout`/无超时选项；**只改注释**（原头注写「超时由消费方包装（…交互工具的 `withTimeout`）」——G-1 后该表述已不成立），现写明：**客户确认制的终端问答不设超时**；**EOF（无人值守）→ `unavailable` → 未获同意，fail-closed 不变**（硬约束，绝不改成「等待」）。
- `runGovernSession`（`src/pipeline/orchestration/govern-session.ts`）：一次性壳 = 发一轮 → `for await … settled` 收尾——等待期间**无任何编排侧时限**。
- 无关项（未动）：shell 闸 (a) 的 `createCliOperatorChannel`/`shell-gate.ts` 的超时（`operatorTimeoutMs` 等）是 **shell 审核链**的语义（超时 = 拒绝），与客户确认制不是同一条链；`finalize` 的确认超时已随 A-4 删除。

**会掐断「等客户作答」的时限在哪（跨角色，如实指出，不建议本角色动）**：均在 **Pi适配器**（设计 G-1 已派其修）——
1. `src/provider/pi/tools.ts`：交互工具 handler 外的 `withTimeout`（`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`，**缺省 110s**）——按 G-1「去掉缺省等待上限、保留为显式可用」处理（本报告日核实：**尚未落地**，仍为 110s 缺省）。
2. `src/common/pi-adapter/real-adapter.ts`：**每轮 prompt 硬超时**（缺省 120s）在客户输入挂起期间不得掐断该轮（等待期间暂停/续期，作答后恢复）——G-1 已派；本报告日核实尚未落地。
在上述两项落地前，真实模型端到端的「长等客户」仍可能被 110s/120s 截断——**属 Pi侧在途**，编排侧无需改动。

## 测试与证据

- `test/编排/confirmation-gated.test.ts` 新增 1 例（G-1）：**无超时等待**——`readLine` 延迟 250ms 后作答仍生效（确认与多选各一次）；EOF → `unavailable`（fail-closed 不变，既有用例保留）。文案未动。
- `test/编排/` **149/149**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**757 计 / 753 过 / 3 红 / 1 skipped**——3 红逐条归因：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 1 条**桌面在途**（`test/桌面应用/renderer.test.ts:406`「交互卡严格投递所属 pane…」——其 G-1/B 组实现进行中）。**本角色零红**。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实端到端（长等客户不被掐断）在 Pi侧两项落地后属**客户跑**。

## 不改什么

- EOF → `unavailable`（未获同意）不变；空/未识别输入 = 拒绝不变；提示文案不变；shell 闸超时语义不变；桌面「过期」语义（G-1 只保留应用关闭/重启类真实失效）归桌面。
