# 缺陷记录：缺 role-cards 步骤时 Convener 反馈循环（S5 e2e 发现）

- **变更**：`2026-10-23-governance-advance-redispatch`（治理写卡推进的可重入门禁闭环，T3）
- **发现角色/阶段**：测试；S5 终验（e2e 全链路）
- **日期**：2026-10-23
- **状态**：**已修复并在最终候选复验通过（2026-10-23）**。桌面窗口把去重清空移到「收口 + 派发/账本成功」之后（`app/desktop/interface.ts:3822`，`dispatchCommitted` 条件），flow 缺陷/收口失败分支保留同指纹去重；S5 最终重跑 6/6、e2e 129/129、T3 全量 9 项均为既有 EPERM（见 `2026-10-23_change_governance-advance-redispatch.md` §十一）
- **严重性**：确定性行为缺陷（重复后台任务 + 潜在自激循环）；不阻塞数据正确性（未派 readiness、未伪造客户决定），但会让 Convener 被同一反馈刷屏，违反方案 A2「同指纹不重复反馈」。

## 一、复现

- 用例：`test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` →
  「团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener、不派 readiness、无客户卡；同指纹不刷屏」。
- 场景：trio 项目；团队计划 v2 合法；flow **没有** `role-cards` 步骤（有 `role-readiness`）；任命 ledger 指向 executor；Crew 写出合法角色六文件。
- 期望（方案 §3 A4 / A2）：
  1. 结构校验通过后尝试收口 `role-cards` 失败（`role-cards-step-missing`）⇒ **反馈 Convener 补齐 flow 步骤、不派 readiness、不静默通过**；
  2. 反馈按内容指纹去重：**同指纹重复 settle/refresh 不重复反馈**。
- 实际：第 1 条正确（首条反馈 + 不派 readiness）；第 2 条不成立——每次检查都会**再次投递完全相同的 Convener 反馈**。测试在 1.3 s 内收到 **20 条**相同提示（脚本桩 Convener 即时 settle，放大了循环；真实模型下频率取决于会话耗时，但循环条件不变）。

## 二、根因（代码路径）

文件：`app/desktop/interface.ts`（桌面窗口 owner）。

1. `runPostWriteAdvanceCheck` 在**写卡产物校验通过后**先清空反馈去重：
   - `:3670` `appointmentArtifactFeedback.delete(`${projectRoot}\u0000${flowId}`); // 已通过：后续回归可再报`
2. 随后才进入 role-cards 收口（`:3680` 起）。团队计划存在但 flow 缺 `role-cards` 步骤时，`completeRoleCardsStep` 返回 `role-cards-step-missing`（`:3693`），走 flow 缺陷分支：
   - `:3695` `diagnostic.record("advance.role-cards.flow-defect", …)`
   - `:3705` `reportAppointmentArtifactIssues(..., { fingerprint })`（重新写入去重表并投递 Convener）
3. 下一次检查（任意治理角色 settle 或 `listProject` 探针）重复步骤 1→2：去重表先被清空，再因缺步骤重新投递 ⇒ **永久循环**。
4. 附带的防自激面：每次投递都会把 `performedAction` 置 true，从而 `emitProjectChanged`；渲染层刷新 → `listProject` → 探针再次 pending → 再检查/再反馈，构成刷新回路风险。

## 三、影响与判定

- 触发条件：团队计划已存在，但 flow 缺少 `role-cards` 步骤（或 flow 文件缺失走 `not-found` 分支）。这是方案明确要求覆盖的 flow 缺陷场景，不是非法输入。
- 影响：Convener 后台会话被同一反馈重复唤醒/刷屏；`project:changed` 可能随之重复；不产生客户卡、不写 `customer.decision`、不派 readiness（这些行为本身正确）。
- 修复方向（供 owner 决定，不由测试角色实施）：把「通过后清空反馈去重」移到**整个收口+派发成功之后**；或在 flow 缺陷/收口失败分支**不要清空**同指纹去重。需要保证：同一指纹只反馈一次；指纹变化（文件或团队计划内容变化）后可再次反馈；修复 flow 后正常收口并派发。
- 回归面：`test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`（本用例第 1 部分 + 同指纹不刷屏断言）；修复后重跑该文件与桌面/编排受影响套件、S5 全量与真实 Electron。

## 四、证据

| 文件 | 内容 |
| --- | --- |
| `s5-new-tests-run3.log` / `governance-e2e-auto-final.log` | 新 e2e 全量输出：129 tests / 128 pass / 1 fail；失败断言与 20 条重复 Convener 提示原文 |
| `governance-e2e-auto.log` | 首次含新用例的套件运行（含 i-full-chain 文本格式适配前的失败） |
| `i-full-chain-isolation-run1.log` / `-run2.log` | `i-full-chain` 整文件复跑：run1 偶发「会话尚未开启/已关闭」，run2 3/3 全绿（非确定性，另见 S5 记录） |
| `target-recompute.log` | 目标项目只读复算（该缺陷不影响目标形态；旧无 stepId 派发已被正确放行） |

**边界**：本记录只陈述测试角色观测与证据，不修改产品代码、不宣布验收结论；结论交桌面窗口 owner 修复后由测试角色复跑。
