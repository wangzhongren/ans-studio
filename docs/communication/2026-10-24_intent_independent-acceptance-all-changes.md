# 意图确认：所有变更都启动独立验收（撤销“仅发布版本”）

- 日期：2026-10-24
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户明确选择“所有变更”）
- 变更类型：验收规则修订 + 应用侧 P0-1/P1-5 行为回退/修订；T3。
- 取代：`docs/communication/2026-10-24_intent_independent-acceptance-release-only.md` 的“独立验收只随发布版本启动”；该规则不再生效。

## 客户原话

> 这个修改一下，独立验收还是需要的。

客户在“独立验收要恢复到什么范围”中明确选择：**所有变更**。

## 意图理解

1. **独立验收恢复为所有变更的默认环节**：不再要求 flow 先有 `release:true`；非发布变更也启动 verifier/Proof、写验收标准/报告、发验收卡，客户做最终决定。
2. **应用不再用 release 标记作为独立验收门**：`dispatchAcceptanceForFlow` / verifier criteria 自动派发对所有已满足流程完成/证据条件的 flow 生效；`release` 字段可保留为发布元数据，但不再阻断独立验收。
3. **验收标准门对所有有任命决定的 flow 生效**：`acceptance-criteria` 不再只对 release 生效；非发布 flow 也必须先有结构合格的最新版标准才能派项目角色/进入验收。
4. **角色卡/提示词同步**：Lead/Steward/Verifier 卡与标准工作流总则去掉“只有发布版本才派 Proof；非发布不派”；恢复“流程齐备后应用按验收门派 Proof/验收（所有变更）”。
5. **不改变验收独立性/客户最终决定**：Proof 仍独立；不自动 accept/reject；不伪造证据；不自动代批。
6. **当前 bookmark-manager 从零项目**（无 release 标记）在 change-package/证据齐备后应进入独立验收；不再停在 awaiting-release-acceptance。
7. **规则本身也按新口径独立验收**：本次修订属于“所有变更”，实施后由独立验收复核；不因非发布而跳过。

## 非目标

- 不自动接受/拒绝验收，不改变客户最终决定权，不伪造证据/done。
- 不新增角色、工具、能力位、flow step kind/账本 kind/字段；`release` 字段保留但不再作为独立验收门。
- 不把“所有变更”解释为“自动通过”；Proof 仍按标准/变更包/证据独立判定。
- 不合并 flow 骨架/其他在途变更；不在运行中的 app 上热改。

## 实施边界（待团队/角色执行）

- 门禁引擎：Lead/Steward/Verifier 卡、`STANDARD_WORKFLOW_PRINCIPLE` 去 release-only；测试。
- 编排：`governance-gate.ts` criteria 门对所有 flow 生效（最新 vN）；`govern-session.ts` 提示去 release-only；测试。
- 桌面窗口：`interface.ts` 去 `releaseMarked` 阻断/awaiting-release-acceptance；auto-Proof/verifier criteria 对所有 flow；测试/e2e。
- 项目管理：项目规则 §二第 11 条改为“所有变更独立验收”；记录本次客户修订。
- 测试：`test/测试` 非发布流程进入 Proof/标准；T3 回归；从零 bookmark-manager 真实验证。
- 独立验收：本次修订实施完成后，按新规则由独立验收复核（不是自动通过）。

## 下一步

按角色分派执行；不 commit/push/发布；运行中的 app 需重启后生效；当前 bookmark-manager 项目在验收前重启并继续。
