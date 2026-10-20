---
id: liaison-workflow-manager-capabilities
type: fix
title: Liaison 工作流管理者能力矩阵更新（测试角色）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: [governance-liaison, workflow-manager, flow-tools]
events:
  - date: "2026-10-20"
    kind: fixed
    summary: 客户拍板 Lead/主理 兼任工作流管理者后，能力矩阵用例更新：Liaison dispatchTask 为函数、flowGet/flowStepUpdate/flowStepSupersede 均注入；注册表 dispatchTask=true；补角色卡语义断言（协调 Steward/项目角色，不是客户批准）；其余角色矩阵与 su 断言保留。test/测试 786/786、全仓 3306/3304/0/2、typecheck 0。
---

# Liaison 工作流管理者能力矩阵更新

## 结论

- 客户拍板：Lead / 主理（Liaison）兼任**工作流管理者**，产品注入 `dispatchTask` 与
  `flowGet` / `flowStepUpdate` / `flowStepSupersede`（内置治理角色均具备 flow 三工具）。
- 能力矩阵用例已更新并通过；**未改产品源码、未改其他角色测试**，其余角色的矩阵断言与 su 断言全部保留、未放宽。
- `node --test test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`：**8/8**。
- `node --test "test/测试/**/*.test.ts"`：**786/786，18s**。
- 全仓 `node --test "test/**/*.test.ts"`：**3306 计 / 3304 过 / 0 红 / 2 skip，36s**。
- `npm run typecheck`：**exit 0**。

## 用例更新明细

`test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`：

1. **能力矩阵（真实会话装配）**：
   - Liaison：`typeof dispatchTask === "function"`，断言文案明确「工作流协调用；不是客户批准；不得据此伪造客户同意」；
   - Liaison：`flowGet` / `flowStepUpdate` / `flowStepSupersede` 均为函数；
   - Rapporteur / Nominator / Convener / Verifier：在原有能力断言之上**新增**同一 flow 三工具断言（内置治理角色统一注入），原有 `dispatchTask`/`handOffIntent`/安装类等矩阵断言逐条保留；
   - su/single 段未改。
2. **注册表单一来源**：Liaison 的 `spec.capabilities.dispatchTask` 由 `false` 更新为 `true`（附语义注释：工作流管理≠客户批准权）。
3. **角色卡语义断言**：新增 `工作流管理者`、`dispatch_task`、`flow_get`/`flow_step_update`/`flow_step_supersede`、
   `派发/推进 ≠ 客户批准`、`不改变任何角色的写边界` 五条文本断言，把「协调不是批准」的产品语义钉在测试里；
   不测真实投递（真实路由由桌面接线测试覆盖）。
4. **强断言未放宽**：Rapporteur 仅提案卡+澄清、Nominator 安装面、Convener 派发/看护、Verifier 验收卡、su 能力面均保持原断言。

## 改动与纪律

- 仅改 `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`；角色记录 `changelog.md` + 本文件。
- 未由本角色 git 提交；未读 `.env`；未打印凭据；未改产品源码；未改其他角色测试。
