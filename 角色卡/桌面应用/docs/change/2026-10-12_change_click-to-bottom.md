---
id: click-to-bottom
type: change
title: U-1 点击角色 ⇒ 到底部（客户裁定；取代 B-2「恢复位置」）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [hot-path-and-virtual-stream, operator-card-reachability, markdown-and-multisession]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定「点击这个角色，应该滚动到滚动条最下面」——与 B-2 的「切角色恢复上次位置」冲突，以本裁定为准
  - date: "2026-10-12"
    kind: implemented
    summary: showPane 改为「有卡滚到卡 / 无卡到底部」（定位助手 stickPaneToBottomOrCard）；重复点击同一角色的早退分支同样到底部；scrollMemo 删净
  - date: "2026-10-12"
    kind: verified
    summary: e2e 真机三例全 true（窗口化 1px/常规 1px/重复点击 1px）；test/桌面应用 157/156/1；全量 880/877/2；typecheck 0
---

# U-1：点击角色 ⇒ 到底部（语义反转）

**来源**：客户原话「**点击这个角色，应该滚动到滚动条最下面**」。**属本角色边界内**。
**登记语义反转的理由**：这是客户**明确裁定**，**取代** B-2 时期我实现的「切角色恢复上次滚动位置」
（`scrollMemo`）——恢复位置虽保留了阅读上下文，但会让用户点开角色后看不到「最新一条」，客户判为错误。

## 改在哪

- **定位助手**（`renderer.js::stickPaneToBottomOrCard(roleId)`）：统一「点角色 ⇒ 看最新」——
  **有未作答卡 ⇒ 滚到那张卡**（P-1 例外优先，既有语义保留）；**无卡 ⇒ `scrollBottomForced` 到底部**。
- **三处接线**：① `showPane`（切换会话）；② `selectRole` 的**重复点击早退分支**（`sessionOpenRoleId === roleId`
  ——e2e 抓出：修前重复点击直接 return、不滚，`U1_REPEAT_TO_BOTTOM=false`（dist=556）；修复后 1px）；
  ③ chip/徽标同处刷新不变。
- **窗口化兼容**：`scrollBottomForced` 内部**先** `updateVirtualWindow({preferTail:true})`（未实体化的尾部
  先挂上、高度落定）**再**滚——≥150 行时落点仍准确（e2e dist=1px）。
- **删干净**：`scrollMemo` 声明、切走记忆与恢复分支、`resetPanes` 清理**全部删除**（注释剥离后断言无残留）。

## 与 S-1 的双向语义不冲突（已钉）

- **点击切换**是用户的**显式动作** ⇒ 强制到底部（`scrollBottomForced`，不受流式判定约束）；
- **流式输出**仍走 S-1 的「在底部才贴底、上翻不拽回」（`streamShouldPin`）——两条路径互不污染（源码钉 + e2e 双向）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD 6291ab1）

- `renderer.test.ts`：U-1 例（助手制「卡优先/到底部」、`scrollMemo` 删净、重复点击分支、窗口化先挂尾、
  与 S-1 分离）＋ P-1/Q-2 既有断言同步更新为助手制；桌面全套 **157/156/1**（唯一红=既有环境红 pi-config）。
- **e2e 真机**（真实 Electron）：`U1_WINDOWED_TO_BOTTOM=true`（dist=1）、`U1_NORMAL_TO_BOTTOM=true`（dist=1）、
  `U1_REPEAT_TO_BOTTOM=true`（dist=1，修前 556 复现）；S-1 八项与 P-1 十项无回归；`E2E_DONE=1`
  （仅 2 项 `=false` 均为预期值守卫）。
- 全量 **880/877 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。

## 不符之处（如实）

- B-2 历史文档/变更记录中「恢复位置」的旧表述保留为历史记录；**现行语义**以本页为准（并在
  hot-path/P-1 两处文档加了反转标注）。
- 恢复位置能力被整体移除（客户裁定优先）；若未来两种诉求并存（如「新消息徽标+手动跳最新」），另行提案。
