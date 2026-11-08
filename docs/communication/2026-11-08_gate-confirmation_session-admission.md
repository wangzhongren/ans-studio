# 闸门 1 留痕：会话创建准入按操作审批（预授权覆盖，2026-11-08）

- 日期：2026-11-08
- 记录角色：ANS 沟通（Communication）
- 依据：客户预授权与全权委托（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`）；不逐闸门请示。

## 闸门 1（方案确认）对象

- **方案 P1.2**：`docs/planning/2026-11-08_design_session-admission-approval-based.md`
  - 844 行 / 128528 bytes / SHA-256 `b13e2fe740ba2916f71d6dc3cccad87309719580d18d413bc0d58485c10cc0c6`
  - 取代 P1.1（`720cfbc6…`）与 P1.0（`20fe82ef…`），历史版本保留。
- **复核记录**：`docs/planning/2026-11-08_review_session-admission-approval-based.md`
  - 193 行 / SHA-256 `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`
  - 完整复核（F1–F15，建议修订后提交）+ 窄复核（R1–R7 关闭）+ 最终核对（建议提交客户确认，R8a–R8c 建议级）。
- **客户方向**：`docs/communication/2026-11-08_intent_session-admission-approval-based.md`（含 Git 规格「git 命令只读放行，每个角色的专属git 命令放行」）。

## 要点

- 准入与执行分离：开会话只核当时可核事实；取消 native factory plan 与「含 shell 即拒」；受保护+shell 要求审批绑定 + 持久文件审计可用。
- 只读/非只读双层分类（未分类按非只读）；非只读走现有 shell-gate/审批/审计。
- Git：只读 10 子命令白名单+参数级 fail-closed+固定传输；角色专属 Git 走既有 ACL；`log` 无目标默认 HEAD、`--all` 拒绝；§0.3 披露 shell 只读 Git 不套用 readableOids（客户可见权衡，Q1/Q2）。
- Q9 披露：受保护项目角色 Git 写/初始化仍被注册表级门拒绝（本方案不放宽）。
- 风险 T3；R8a–R8c 三项建议级文字精确化随团队计划/实施接口评审处理，不影响设计方向与验收基线。

## 后续

- 闸门 2（团队计划）与实施授权均按预授权覆盖；统筹正在写团队计划；独立验收正在写 B1。提交/推送/合并/发布按委托（发布/tag 除外）。

## 闸门 2（角色指派确认，2026-11-08，预授权覆盖）

- **团队计划**：`docs/scheduling/2026-11-08_team-plan_session-admission-approval.md`
  - 449 行 / 61983 bytes / SHA-256 `ce30fad6f0cb48d948007de97d553a1362836eb77dbcff67a10382388c1ad421`
  - 五维结论：**保留现有角色，无新增/拆分/合并，H1 边界 delta=0（默认）**；参与：运行时核心、编排、门禁引擎、shared-code、桌面窗口、桌面UI（条件）、测试、内置独立验收、统筹；写集 17 行映射两两不相交。
  - 阶段：G2 → B0 新基线（HEAD `a1b2f66`，旧 B0 失效）→ I0 接口评审（R8a–c 等）→ W1 共享证据/审计接线 → W2 创建准入语义 → W3 Git 只读执行面 → W4 工具路由 → W5 桌面卡面 → D1 确定性验证 → RR 真实 Claude 最小运行 → E3-F/E3-B/E3-V/E3-R。
  - 披露：Q9、F1、R8a–c、Q4=deny-non-readonly、Q10 无回切开关、审计不可用则不可创建会话、规则集 v3 pin fail-closed、B0 冻结脏基线。
- **B1 已冻结**：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / 29020 bytes / `fb881126…`），作为实施前验收标准登记。
- **实施授权**：按预授权/全权委托，实施从 B0 新基线开始，按团队计划阶段推进；提交/推送/合并按委托，发布/tag 除外。

