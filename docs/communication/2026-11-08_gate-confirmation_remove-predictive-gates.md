# 闸门 1 留痕：删除全部预知式门控（预授权覆盖，2026-11-08）

- 日期：2026-11-08
- 记录角色：ANS 沟通（Communication）
- 依据：客户预授权与全权委托（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`）；客户指令「这个预知门控全部删掉」（`docs/communication/2026-11-08_intent_remove-predictive-gates.md`）。

## 闸门 1 对象

- **方案 P1.3**：`docs/planning/2026-11-08_design_git-write-init-approval-based.md`
  - 803 行 / SHA-256 `94f71fcbb0d4287fe7ed38c2b7b396d77a9bcdb6f8ff5984146c7495f82a1566`
  - 取代 P1.2（`36b81769…`）、P1.1（`6e117d36…`）、P1.0（`72259e4e…`）；历史保留。
- **复核记录**：`docs/planning/2026-11-08_review_git-write-init-approval-based.md`
  - 178 行 / SHA-256 `a2468ed0951b28b39405ea71e94b415a8a2b5bf3ecb5f829c87e4d11f3119828`
  - 完整复核（F1–F12，建议修订后提交）+ 窄复核（R1–R10，仍需修订）+ 短核对（S1–S5，单点 must-fix）。
- **沟通极短只读核对（S1/S2 落地确认）**：`pi-sdk-idle-not-observed` 仅出现在说明/阻断语境（§3.7 第 447/647 行、§8.3 第 776/782 行），已移出证据白名单、默认阻断；AC 范围已为 `P1.2-AC-25`…`P1.2-AC-31`（含负向 AC-28）；P1.3 hash 与作者报告一致。

## 要点

- 删除全部「预知式」门控：会话创建 native plan/创建期 shell 拒绝（在飞变更已删）、`inspectInitializationProtection` 注册表级要求、全仓 `native-plan-*`/`native-tool-*`/`process-coverage-*` 预知性拒绝；Codex native 降为可选证据。
- 替代：`inspectGitActionAuthorization` 动作时授权（身份/根/注册表闭包 + 调用点 ACL/策略/lease）+ 结构化 Git mutation 审计 sidecar（write-ahead、失败拒绝）+ 运行时中立 drain 谓词。
- 不变量：不开放无审批自由 shell/Git 写；身份/权限 fail-closed；不改 PR #72/在飞变更契约（仅显式取代 `P1.3-B1-AC-26`）。
- T3；与在飞「会话准入」变更写集重叠 5 文件，实施串行（Q7）。

## 后续

- 团队计划（闸门 2）与实施授权按预授权覆盖；统筹将写本变更团队计划。
- 实施在「会话准入」变更完成后串行开始；提交/推送/合并按委托（发布/tag 除外）。

## 闸门 2（角色指派确认，2026-11-08，预授权覆盖）

- **团队计划**：`docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`
  - 503 行 / 66827 bytes / SHA-256 `911ff546d14f0aeee4d6121e2772e7a879cd3a85a43b6994c740f16289b61808`
  - 五维：保留现有角色，无新增/拆分/合并，H1 delta=0；实施落运行时核心/编排/桌面窗口 + 测试 + 内置独立验收；Codex 适配器条件参与（默认零产品写入，仅 D1/D2/D6）；sidecar 为编排私有；drain 为运行时核心纯函数。
  - 与在飞变更重叠 5 文件（+ 潜在第 6 `public/trunk-store.ts`、R14 测试），全部串行：在飞 E3 完成（推荐提交/合入）+ I0 + 沟通放行后开工。
  - 阶段：B1 → I0 → 串行实施（W3a/W1 并行 → W2 → W3b → W4 → W5）→ D1 → RR → E3 → E3-B → B2 → E3-R。
  - 披露：Q1/Q3/Q6/Q7/Q12/Q16、foreign MCP 跨会话写 `.git`、Claude/Pi 进程不可观测、审批放行脚本写 `.git`、B0 豁免与参照基线。
- **Q16 取代关系**：本变更 B1 将取代在飞变更 B1 v1 的 `P1.3-B1-AC-26` 与 B1-EV3 中「native-factory-plan-unavailable 仅 codex」表述；两端变更包/验收记录须注明。
- **T1 三文件**单列，不入本变更候选/写集。
- **实施授权**：按预授权覆盖；实际开工仍需在飞 E3 完成 + I0 冻结 + 沟通放行（串行约束）。

## 版本勘误映射（2026-11-08 追加）

- 方案 **P1.3 → P1.4**：`docs/planning/2026-11-08_design_git-write-init-approval-based.md` 现为 P1.4（822 行，sha256 `2febba801adb05ec7fb352d97d1568bbfe8d87561fd249525cf193a6219d6abc`），仅含 E-a–E-e 纯文本勘误（条件写集锚点、Codex 条件参与/D6 归属、测试路径、sidecar 预算 I0 冻结、标签约定），**语义等价于已确认的 P1.3（`94f71fcb…`）**；闸门 1 确认对象按 P1.3 语义 + P1.4 文本映射理解。
- 团队计划保持冻结：`911ff546…`（503 行）引用不变。
- 派发与等价映射记录：`docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`（`b71a00ac…`，59 行）。


