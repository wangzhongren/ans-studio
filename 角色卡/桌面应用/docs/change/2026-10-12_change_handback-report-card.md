---
id: handback-report-card
type: change
title: 回交报告卡片（C-1 桌面面）：字段呈现 + 转义 + 空证据占位 + blocked 视觉区分
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-cards-and-finalize-removal]
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 已批准设计稿 C-1（客户裁定「新增交报告工具」）实施桌面侧呈现——回交卡按 角色/任务/结论/摘要/证据 呈现；模型输出转义；空证据占位；blocked 可见区分
  - date: "2026-10-12"
    kind: implemented
    summary: renderer.js::appendHandback 更新（is-blocked 类 + 「（未提供证据）」占位 + 字段注释对齐 C-1）；styles.css 加 .msg-handback.is-blocked 左语义色竖条；renderer.test.ts T20 扩展四组断言；e2e 加两条镜像卡检查点
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 94 计/93 过/1 红（唯一红为既有环境红）；全量 701 计/698 过/2 红/1 skipped（两红均既有环境红，非本改动）；e2e 已同步，本轮未跑
---

# 回交报告卡片（C-1 的桌面面）

**来源**：pm 已批准设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §C-1（客户裁定
「新增交报告工具」）：模型经新工具 `submit_report{status, summary, evidence?}` 交回报告，编排把它放进
**既有 `handback` 事件**。**桌面侧不在本轮新增任何 IPC/通道**——数据已在事件里，本页只记录**呈现**变化。

> **状态：已实施、已验证（2026-10-12）。** 实施面仅 `app/renderer/{renderer.js,styles.css}` 与
> `test/桌面应用/**`（+ 本页）。e2e 已同步两条镜像检查点，**本轮未跑**（真实验收属客户跑）。

## 用户会看到什么

回交卡（含**镜像进 su 会话流**的那份）现在按 **角色 / 任务（若有）/ 结论 / 摘要 / 证据** 呈现：

- **结论**：`completed` → 「已完成」；`blocked` → 「被拦下」，且**卡片本身**带明显视觉区分
  （左侧**语义色竖条** + 语义边色——不只靠状态文字）；
- **证据**：逐条列出（文件路径等，等宽小字）；**为空时显示「（未提供证据）」**（不留空白）；
- **摘要与证据都是模型输出**：一律经 `esc`（`markdown.js` 的**单一转义来源**）后呈现——**禁直插 HTML**。

## 改在哪（文件 → 改动）

- **`app/renderer/renderer.js::appendHandback`**：`card.className` 增 `is-blocked`（blocked 时）；空证据占位
  文案改为 **「（未提供证据）」**；头注释对齐 C-1（字段清单 + 转义红线 + 分发归 B-2 信封）。**分发逻辑未动**
  （产出角色自己的 pane + 镜像进主入口角色 pane，`roleId !== state.primaryRoleId` 守卫自镜像）。
- **`app/renderer/styles.css`**：新增 `.msg-handback.is-blocked { border-left: 3px solid var(--danger);
  border-color: var(--danger-border); }`（语义色、面积小）。
- **测试**：`renderer.test.ts` T20 扩展：字段行文案（`角色 …，任务 …`）、`esc(hb.summary`/`esc(e)` 转义 +
  「摘要不得未经转义直插」负例正则、「（未提供证据）」占位、`is-blocked` 类与样式钩子（含 `var(--danger)`
  正则可查）；**镜像断言（`is-mirror`/「来自 … 的报告」）保留**。`e2e/main.mjs`：镜像卡新增
  `MIRROR_EVIDENCE_PLACEHOLDER`（占位文案）与 `MIRROR_CARD_IS_BLOCKED_VISUAL`（is-blocked 可见类）两条
  检查点（该 drill 用的回交正是 blocked + 空证据）。
- **多会话（B-2）投递核查（如实）**：按信封 `roleId` 分发——回交只进**产出角色**的 pane，并镜像进
  **主入口角色**的 pane；无第三处落点，**未发现跨角色串扰**（有守卫：生产者即主入口时不自我镜像；
  编排侧对 su 不挂回交）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **94 计 / 93 过 / 1 红**——唯一红为**既有环境红**
  （`pi-config.test.ts` 断言检出目录名以 `ans-cli` 结尾、本机为 `ans-runtime`；**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **701 计 / 698 过 / 2 红 / 1 skipped**；两红**均既有环境红、非本改动**
  （同上 pi-config + `test/项目管理/shared/path-primitives.test.ts` 的 macOS `/var`→`/private/var`）。
  （并发注：Pi适配器/编排同刻在改 `src/**` 与各自测试，全量总数随之波动——本改动**未新增任何红**。）
- e2e：已同步（两条 C-1 检查点），**本轮未跑**。

## 不在本轮（如实登记）

- 工具/编排/Pi适配器侧（`submit_report` 注册与回退推导、`evidence` 去读事件）：他角色范围。
- 真实模型端到端（su/角色真的交报告 → 卡片呈现）：属「客户跑」。
